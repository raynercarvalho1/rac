-- status: pendente
-- PROPOSTA 060 · NÃO APLICADA EM PRODUÇÃO (Central Fiscal: correção definitiva, 20/11/2026). O dono roda no SQL Editor ANTES do site novo. Pode rodar de novo sem erro. NÃO altera a 059 (já aplicada): só soma.
-- Por que existe (docs/fiscal.md, "Correção definitiva"):
--   1) Notas confirmadas ("Estou de acordo") que ficaram "Falta concluir no Mercado" não tinham nova tentativa AUTOMÁTICA (só o botão): agora há tentativas com intervalo crescente (1 h, 6 h, 24 h, 72 h, 168 h; até 6),
--      sempre pelas decisões já guardadas, sem nova leitura nem nova confirmação, sem duplicar compra (o lock e o vínculo da 059 continuam). Depois da 6ª falha continua o botão "Tentar de novo".
--   2) Notas antigas (gravadas antes da confirmação única) cuja compra JÁ existe no Mercado (vínculo ou a mesma chave de acesso) apareciam como "Não lançada": a reconciliação liga a nota à compra, SEM criar compra,
--      SEM inventar confirmação (origem 'reconciliacao', quem e quando nulos) e SEM apagar nada. Entrada "pendente" parada vira "falhou" para ser retomada.
--   3) A situação fiscal (pendente/contingência) só mudava por ação manual (protocolo digitado). Agora existe o registro das consultas oficiais (notas_fiscais_consultas) e as funções que a rotina diária usa
--      (nf_validacao_pendentes e nf_validacao_registrar, SÓ service_role): a situação só muda com EVIDÊNCIA oficial (autorizada exige cStat 100/150 e protocolo de 15 dígitos; cancelada exige cStat 101/151/155/135;
--      denegada vira rejeitada); indisponível, erro, resposta inválida ou chave inexistente NUNCA mudam a situação, só agendam nova consulta. Histórico em notas_fiscais_situacoes (fonte 'consulta_oficial').
--   4) nota_fiscal_confirmar passa a recusar foto/PDF com confiança abaixo de 60% (a tela já bloqueia; o banco repete a regra). O resto da função é igual à da 059.
-- Não faz: não cria despesa (gera_despesa continua false), não cria compra nem confirmação, não altera dado existente (só colunas novas, e a reconciliação só ACRESCENTA linhas de ligação), não toca em 034/037/039/057/059
--   além das funções recriadas aqui (nf_entrada_processar, nota_fiscal_confirmar), não afrouxa RLS/MFA. A consulta à SEFAZ em si NÃO está aqui (é a Edge Function fiscal-consulta, não publicada).
-- Agendamento: o job SQL "fiscal-entradas" (a cada 6 h: reconciliar + retomar entradas) é criado aqui se o pg_cron existir. O job da consulta oficial (Edge Function) fica em 061_fiscal_consulta_agendamento.sql, para ser aplicado só depois de publicar a função.
-- Ordem: 034 → 037 → 039 → 057 → 059 → 060 → site. Conferência depois: supabase/conferencias/060_conferir_producao.sql; diagnóstico das notas: supabase/conferencias/060_diagnostico_notas.sql (só leitura).
begin;

-- 1) Colunas novas em notas_fiscais_entradas (a 059 fica como está) ---------------------------------------------------------------------------------------
alter table public.notas_fiscais_entradas add column if not exists proxima_em timestamptz;
alter table public.notas_fiscais_entradas add column if not exists origem text not null default 'confirmacao';
alter table public.notas_fiscais_entradas drop constraint if exists notas_fiscais_entradas_origem_ok;
alter table public.notas_fiscais_entradas add constraint notas_fiscais_entradas_origem_ok check (origem in ('confirmacao', 'reconciliacao'));
alter table public.notas_fiscais_entradas alter column confirmado_por drop not null;
alter table public.notas_fiscais_entradas alter column confirmado_em drop not null;
alter table public.notas_fiscais_entradas drop constraint if exists notas_fiscais_entradas_conf_ok;
alter table public.notas_fiscais_entradas add constraint notas_fiscais_entradas_conf_ok check (origem <> 'confirmacao' or (confirmado_por is not null and confirmado_em is not null));
create index if not exists notas_fiscais_entradas_retomar on public.notas_fiscais_entradas (proxima_em) where estado in ('falhou', 'pendente');

-- 2) Histórico da situação fiscal: aceita a fonte 'consulta_oficial' --------------------------------------------------------------------------------------
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.notas_fiscais_situacoes'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%fonte%' loop
    execute format('alter table public.notas_fiscais_situacoes drop constraint %I', c);
  end loop;
  alter table public.notas_fiscais_situacoes add constraint notas_fiscais_situacoes_fonte_ok check (fonte in ('foto', 'pdf', 'xml', 'manual', 'consulta_oficial'));
end $$;

-- 3) Registro das consultas fiscais oficiais (só acrescenta; quem escreve são as funções do service_role) ----------------------------------------------------
create table if not exists public.notas_fiscais_consultas (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  nota_id        uuid not null references public.notas_fiscais(id) on delete cascade,
  consultado_em  timestamptz not null default now(),
  origem         text not null check (origem in ('sefaz_ws', 'indisponivel')),          -- 'sefaz_ws' = serviço web oficial; 'indisponivel' = sem acesso permitido
  resultado      text not null check (resultado in ('autorizada', 'cancelada', 'denegada', 'pendente', 'nao_encontrada', 'indisponivel', 'invalida', 'erro')),
  cstat          integer check (cstat is null or cstat between 0 and 999),
  motivo         text check (motivo is null or length(motivo) <= 200),
  protocolo      text check (protocolo is null or protocolo ~ '^\d{15}$'),
  evidencia      text check (evidencia is null or length(evidencia) <= 200),
  situacao_antes text,
  situacao_depois text,
  mudou          boolean not null default false,
  tentativa      integer not null default 1 check (tentativa >= 1),
  proxima_em     timestamptz,                                                           -- quando consultar de novo; nulo quando encerrada
  encerrada      boolean not null default false,
  constraint notas_fiscais_consultas_sem_cpf check (not public.nf_tem_cpf(motivo) and not public.nf_tem_cpf(evidencia))
);
create index if not exists notas_fiscais_consultas_nota on public.notas_fiscais_consultas (nota_id, consultado_em desc);
alter table public.notas_fiscais_consultas enable row level security;
drop policy if exists "casa" on public.notas_fiscais_consultas;
create policy "casa" on public.notas_fiscais_consultas for select to authenticated using (user_id = (select public.dono_da_casa()));
do $$
declare t text;
begin
  foreach t in array array['notas_fiscais_consultas'] loop
    execute format('drop policy if exists "mfa" on public.%I', t);
    execute format('create policy "mfa" on public.%I as restrictive for all to authenticated using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok()))', t);
  end loop;
end $$;
revoke all on public.notas_fiscais_consultas from anon, authenticated;
grant select on public.notas_fiscais_consultas to authenticated;      -- ninguém escreve direto: só as funções (security definer)

-- 4) Entrada no Mercado: processar com intervalo crescente entre tentativas (recria a da 059 com proxima_em) -----------------------------------------------
create or replace function public.nf_entrada_processar(p_entrada uuid) returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare e public.notas_fiscais_entradas%rowtype; v_r jsonb := '{}'::jsonb; v_msg text; v_n integer;
begin
  select * into e from public.notas_fiscais_entradas where id = p_entrada for update;
  if not found then raise exception 'entrada no Mercado: confirmação não encontrada' using errcode = 'P0002'; end if;
  if e.estado in ('concluida', 'ja_no_mercado') then
    return jsonb_build_object('estado', e.estado, 'mercado_nota_id', e.mercado_nota_id, 'confirmado_em', e.confirmado_em, 'tentativas', e.tentativas, 'erro', null, 'revisar', e.revisar, 'ja_existia', true);
  end if;
  v_n := e.tentativas + 1;
  begin     -- sub-bloco (savepoint): se algo falhar aqui dentro, nada do Mercado fica; a nota e a confirmação ficam
    v_r := public.nf_mercado_lancar(e.user_id, e.nota_id, e.decisoes);
    update public.notas_fiscais_entradas set estado = case when (v_r->>'duplicada')::boolean then 'ja_no_mercado' else 'concluida' end, mercado_nota_id = (v_r->>'mercado_nota_id')::uuid,
      tentativas = v_n, erro = null, proxima_em = null, atualizado_em = now() where id = p_entrada;
  exception when others then
    v_msg := case when sqlstate = '23505' then 'já existe no Mercado uma compra com o mesmo número, data e estabelecimento' else sqlerrm end;
    update public.notas_fiscais_entradas set estado = 'falhou', erro = left(v_msg, 300), tentativas = v_n, atualizado_em = now(),
      proxima_em = case when v_n >= 6 then null else now() + (array['1 hour', '6 hours', '24 hours', '72 hours', '168 hours'])[least(v_n, 5)]::interval end where id = p_entrada;
    v_r := jsonb_build_object('criado', false);
  end;
  select * into e from public.notas_fiscais_entradas where id = p_entrada;
  return jsonb_build_object('estado', e.estado, 'mercado_nota_id', e.mercado_nota_id, 'confirmado_em', e.confirmado_em, 'tentativas', e.tentativas, 'erro', e.erro, 'revisar', e.revisar, 'proxima_em', e.proxima_em,
    'ja_existia', false, 'itens', v_r->'itens', 'total', v_r->'total', 'soma_itens', v_r->'soma_itens', 'produtos_novos', v_r->'produtos_novos', 'avisos', coalesce(v_r->'avisos', '[]'::jsonb));
end $$;
revoke all on function public.nf_entrada_processar(uuid) from public, anon, authenticated;

-- 5) Confirmação única: a da 059 + a trava de confiança mínima de 60% para foto/PDF --------------------------------------------------------------------
create or replace function public.nota_fiscal_confirmar(p_formato text, p_nota jsonb, p_itens jsonb, p_docs jsonb, p_proc jsonb, p_conferir boolean, p_decisoes jsonb)
  returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_casa uuid := public.dono_da_casa(); v_r jsonb; v_id uuid; v_sit text; v_ok boolean := false; v_ent public.notas_fiscais_entradas%rowtype; v_e jsonb; v_conf boolean;
begin
  if (select auth.uid()) is null or v_casa is null then raise exception 'nota_fiscal_confirmar: faça login' using errcode = '42501'; end if;
  if not (select public.rac_aal_ok()) then raise exception 'nota_fiscal_confirmar: confirme o código do app de segurança (MFA)' using errcode = '42501'; end if;
  if p_formato is null or p_formato not in ('xml', 'doc') then raise exception 'nota_fiscal_confirmar: formato inválido' using errcode = '22023'; end if;
  if jsonb_typeof(p_decisoes) is distinct from 'object' or jsonb_typeof(p_decisoes->'itens') is distinct from 'array' or jsonb_array_length(p_decisoes->'itens') > 990
     or pg_column_size(p_decisoes) > 200000 then raise exception 'nota_fiscal_confirmar: decisões inválidas' using errcode = '22023'; end if;
  if jsonb_typeof(p_nota) is distinct from 'object' then raise exception 'nota_fiscal_confirmar: nota inválida' using errcode = '22023'; end if;
  v_sit := p_nota->>'situacao';
  /* 060: foto/PDF abaixo de 60% de confiança não se confirma (regra do dono, 20/11/2026; a tela já bloqueia, o banco repete a regra) */
  if p_formato = 'doc' and (p_proc is null or (p_proc->>'confianca') is null or (p_proc->>'confianca') !~ '^[0-9]*\.?[0-9]+$' or (p_proc->>'confianca')::numeric < 0.6) then
    raise exception 'nota_fiscal_confirmar: confiança da leitura abaixo do mínimo de 60%%; leia de novo com outra foto' using errcode = '22023'; end if;
  if v_sit in ('cancelada', 'rejeitada') then raise exception 'nota_fiscal_confirmar: nota % não vale como compra; nada foi gravado', v_sit using errcode = '22023'; end if;

  /* a gravação fiscal é a das migrations 034 (XML) e 037/039 (foto, PDF), sem nenhuma mudança. A conferência só vale para XML autorizado (decisão do dono). */
  if p_formato = 'xml' then
    v_conf := coalesce(p_conferir, false) and v_sit = 'autorizada';
    v_r := public.nota_fiscal_salvar(p_nota, p_itens, p_docs, v_conf);
    v_ok := coalesce((v_r->>'criado')::boolean, false) or coalesce((v_r->>'ja_existia')::boolean, false);
  else
    v_r := public.nota_fiscal_salvar_doc(p_nota, p_itens, p_docs, p_proc);
    v_ok := (v_r->>'resultado') in ('validada', 'pendente_fiscal') and (coalesce((v_r->>'criado')::boolean, false) or coalesce((v_r->>'ja_existia')::boolean, false));
  end if;
  v_id := nullif(v_r->>'id', '')::uuid;

  if not v_ok or v_id is null then      -- bloqueada ou duplicada: nada de confirmação; se a nota que já existe tem entrada, a tela é informada
    select * into v_ent from public.notas_fiscais_entradas where nota_id = v_id and user_id = v_casa;
    return jsonb_build_object('gravada', false, 'fiscal', v_r, 'nota_id', v_id,
      'entrada', case when v_ent.id is null then null else jsonb_build_object('estado', v_ent.estado, 'mercado_nota_id', v_ent.mercado_nota_id, 'confirmado_em', v_ent.confirmado_em, 'erro', v_ent.erro, 'revisar', v_ent.revisar) end);
  end if;

  perform pg_advisory_xact_lock(public.nf_trava(v_casa::text || ':entrada:' || v_id::text));
  insert into public.notas_fiscais_entradas (user_id, nota_id, confirmado_por, estado, decisoes) values (v_casa, v_id, (select auth.uid()), 'pendente', p_decisoes) on conflict (nota_id) do nothing;
  select * into v_ent from public.notas_fiscais_entradas where nota_id = v_id and user_id = v_casa;
  v_e := public.nf_entrada_processar(v_ent.id);     -- já concluída: devolve como está (idempotente); pendente ou falhou: tenta de novo com as decisões guardadas
  return jsonb_build_object('gravada', true, 'fiscal', v_r, 'nota_id', v_id, 'entrada', v_e);
end $$;
revoke all on function public.nota_fiscal_confirmar(text, jsonb, jsonb, jsonb, jsonb, boolean, jsonb) from public, anon;
grant execute on function public.nota_fiscal_confirmar(text, jsonb, jsonb, jsonb, jsonb, boolean, jsonb) to authenticated;

-- 6) Retomar entradas que falharam (automático, intervalo crescente, até 6 tentativas) e reconciliar notas antigas ------------------------------------------
create or replace function public.nf_entradas_retomar(p_limite integer default 20) returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare r record; v_t integer := 0; v_c integer := 0; v_f integer := 0; v_e jsonb;
begin
  for r in select e.id from public.notas_fiscais_entradas e join public.notas_fiscais n on n.id = e.nota_id
            where e.estado in ('falhou', 'pendente') and e.tentativas < 6 and (e.proxima_em is null or e.proxima_em <= now()) and n.situacao not in ('cancelada', 'rejeitada')
            order by e.atualizado_em limit greatest(1, least(coalesce(p_limite, 20), 100)) loop
    v_t := v_t + 1;
    begin
      v_e := public.nf_entrada_processar(r.id);
      if v_e->>'estado' in ('concluida', 'ja_no_mercado') then v_c := v_c + 1; else v_f := v_f + 1; end if;
    exception when others then v_f := v_f + 1; end;
  end loop;
  return jsonb_build_object('tentadas', v_t, 'concluidas', v_c, 'falhas', v_f);
end $$;
revoke all on function public.nf_entradas_retomar(integer) from public, anon, authenticated;
grant execute on function public.nf_entradas_retomar(integer) to service_role;

create or replace function public.nf_entradas_reconciliar() returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare v_chave integer := 0; v_vinc integer := 0; v_ref integer := 0; v_par integer := 0;
begin
  /* a) a compra do Mercado com a MESMA chave de acesso já existe e a nota não está ligada a ela: liga (vínculo sem despesa); não cria compra */
  insert into public.notas_fiscais_vinculos (user_id, nota_id, modulo, registro_id, tipo, gera_despesa, valido, observacoes)
    select n.user_id, n.id, 'mercado', min(m.id::text)::uuid, 'conferencia', false, true, 'Reconciliação: a compra do Mercado já existia com a mesma chave de acesso.'
      from public.notas_fiscais n join public.notas m on m.user_id = n.user_id and m.chave_nfce = n.chave
     where n.chave is not null and n.situacao not in ('cancelada', 'rejeitada')
       and not exists (select 1 from public.notas_fiscais_vinculos v where v.nota_id = n.id and v.modulo = 'mercado' and v.valido)
     group by n.user_id, n.id on conflict do nothing;
  get diagnostics v_vinc = row_count;
  /* b) nota com vínculo válido para uma compra do Mercado e SEM linha de entrada: registra a entrada como já no Mercado (origem reconciliacao; sem confirmação inventada) */
  insert into public.notas_fiscais_entradas (user_id, nota_id, confirmado_por, confirmado_em, estado, mercado_nota_id, decisoes, tentativas, origem)
    select n.user_id, n.id, null, null, 'ja_no_mercado', min(m.id::text)::uuid, '{}'::jsonb, 0, 'reconciliacao'
      from public.notas_fiscais n join public.notas_fiscais_vinculos v on v.nota_id = n.id and v.modulo = 'mercado' and v.valido join public.notas m on m.id = v.registro_id and m.user_id = n.user_id
     where n.situacao not in ('cancelada', 'rejeitada') and not exists (select 1 from public.notas_fiscais_entradas e where e.nota_id = n.id)
     group by n.user_id, n.id on conflict (nota_id) do nothing;
  get diagnostics v_chave = row_count;
  /* c) entrada concluída sem o ponteiro da compra, mas com vínculo válido: completa o ponteiro */
  update public.notas_fiscais_entradas e set mercado_nota_id = (select v.registro_id from public.notas_fiscais_vinculos v join public.notas m on m.id = v.registro_id where v.nota_id = e.nota_id and v.modulo = 'mercado' and v.valido order by v.criado_em limit 1), atualizado_em = now()
   where e.estado in ('concluida', 'ja_no_mercado') and e.mercado_nota_id is null
     and exists (select 1 from public.notas_fiscais_vinculos v join public.notas m on m.id = v.registro_id where v.nota_id = e.nota_id and v.modulo = 'mercado' and v.valido);
  get diagnostics v_ref = row_count;
  /* d) entrada "pendente" parada (a gravação foi interrompida): vira "falhou" para ser retomada pela rotina */
  update public.notas_fiscais_entradas set estado = 'falhou', erro = coalesce(erro, 'a entrada foi interrompida antes de terminar; será retomada'), proxima_em = now(), atualizado_em = now()
   where estado = 'pendente' and atualizado_em < now() - interval '1 hour';
  get diagnostics v_par = row_count;
  return jsonb_build_object('vinculos_criados', v_vinc, 'entradas_reconciliadas', v_chave, 'ponteiros_completados', v_ref, 'pendentes_destravadas', v_par);
end $$;
revoke all on function public.nf_entradas_reconciliar() from public, anon, authenticated;
grant execute on function public.nf_entradas_reconciliar() to service_role;

create or replace function public.nf_rotina_fiscal_sql() returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare a jsonb; b jsonb;
begin
  a := public.nf_entradas_reconciliar();
  b := public.nf_entradas_retomar(20);
  return jsonb_build_object('reconciliacao', a, 'retomada', b);
end $$;
revoke all on function public.nf_rotina_fiscal_sql() from public, anon, authenticated;
grant execute on function public.nf_rotina_fiscal_sql() to service_role;

-- 7) Validação fiscal automática: quais notas consultar e como registrar o resultado (só service_role; a consulta em si é a Edge Function fiscal-consulta) ---------
-- Quais: nota COM chave, pendente ou em contingência (até a consulta resolver) e autorizada recente (30 dias, para pegar cancelamento posterior), cuja próxima consulta venceu. Sem chave não há consulta possível.
create or replace function public.nf_validacao_pendentes(p_limite integer default 20) returns jsonb
  language sql security definer set search_path = '' stable as $$
  select coalesce(jsonb_agg(x order by x.ordem), '[]'::jsonb) from (
    select n.id as nota_id, n.chave, n.modelo, substr(n.chave, 1, 2) as uf_codigo, n.situacao, n.tp_emis, n.data_emissao,
           coalesce((select max(c.tentativa) from public.notas_fiscais_consultas c where c.nota_id = n.id), 0) as tentativas,
           coalesce(u.proxima_em, n.criado_em) as ordem
      from public.notas_fiscais n
      left join lateral (select c.proxima_em, c.encerrada from public.notas_fiscais_consultas c where c.nota_id = n.id order by c.consultado_em desc limit 1) u on true
     where n.chave is not null and n.chave ~ '^\d{44}$'
       and (u.encerrada is null or (not u.encerrada and (u.proxima_em is null or u.proxima_em <= now())))
       and (n.situacao in ('pendente', 'contingencia') or (n.situacao = 'autorizada' and n.data_emissao >= current_date - 30))
     order by coalesce(u.proxima_em, n.criado_em) limit greatest(1, least(coalesce(p_limite, 20), 100))) x
$$;
revoke all on function public.nf_validacao_pendentes(integer) from public, anon, authenticated;
grant execute on function public.nf_validacao_pendentes(integer) to service_role;

-- p_resultado = {resultado, origem, chave, cstat, protocolo, motivo, evidencia}. A situação só muda com evidência oficial; qualquer outra coisa só é registrada e reagendada.
create or replace function public.nf_validacao_registrar(p_nota_id uuid, p_resultado jsonb) returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare
  n public.notas_fiscais%rowtype; v_res text; v_origem text; v_cstat integer; v_prot text; v_motivo text; v_evid text; v_chave text; v_nova text; v_mudou boolean := false; v_tent integer;
  v_prox timestamptz; v_enc boolean := false; v_den boolean := false; v_orig text;
begin
  if jsonb_typeof(p_resultado) is distinct from 'object' then raise exception 'validação fiscal: resultado inválido' using errcode = '22023'; end if;
  v_res := p_resultado->>'resultado'; v_origem := p_resultado->>'origem'; v_prot := nullif(btrim(coalesce(p_resultado->>'protocolo', '')), ''); v_chave := nullif(btrim(coalesce(p_resultado->>'chave', '')), '');
  v_motivo := left(nullif(btrim(coalesce(p_resultado->>'motivo', '')), ''), 200); v_evid := left(nullif(btrim(coalesce(p_resultado->>'evidencia', '')), ''), 200);
  if v_res is null or v_res not in ('autorizada', 'cancelada', 'denegada', 'pendente', 'nao_encontrada', 'indisponivel', 'invalida', 'erro') then raise exception 'validação fiscal: resultado desconhecido' using errcode = '22023'; end if;
  if v_origem is null or v_origem not in ('sefaz_ws', 'indisponivel') then raise exception 'validação fiscal: origem desconhecida' using errcode = '22023'; end if;
  if (p_resultado->>'cstat') is not null then
    if (p_resultado->>'cstat') !~ '^\d{1,3}$' then raise exception 'validação fiscal: cStat inválido' using errcode = '22023'; end if;
    v_cstat := (p_resultado->>'cstat')::integer;
  end if;
  if v_prot is not null and v_prot !~ '^\d{15}$' then raise exception 'validação fiscal: protocolo inválido' using errcode = '22023'; end if;
  select * into n from public.notas_fiscais where id = p_nota_id for update;
  if not found then raise exception 'validação fiscal: nota não encontrada' using errcode = 'P0002'; end if;
  select coalesce(max(c.tentativa), 0) + 1 into v_tent from public.notas_fiscais_consultas c where c.nota_id = p_nota_id;
  v_nova := n.situacao;

  /* a chave que foi consultada tem de ser a da nota; sem evidência oficial completa o resultado vira "invalida" e NADA muda */
  if v_res in ('autorizada', 'cancelada', 'denegada') then
    if v_origem <> 'sefaz_ws' or v_chave is distinct from n.chave or v_evid is null then v_res := 'invalida'; v_motivo := coalesce(v_motivo, 'resultado sem origem oficial, sem a chave da nota ou sem evidência: ignorado');
    elsif v_res = 'autorizada' and (v_cstat is null or v_cstat not in (100, 150) or v_prot is null) then v_res := 'invalida'; v_motivo := 'autorização sem cStat 100/150 e protocolo de 15 dígitos: ignorada';
    elsif v_res = 'cancelada' and (v_cstat is null or v_cstat not in (101, 135, 151, 155)) then v_res := 'invalida'; v_motivo := 'cancelamento sem cStat 101/135/151/155: ignorado';
    elsif v_res = 'denegada' and (v_cstat is null or v_cstat not in (110, 301, 302, 303)) then v_res := 'invalida'; v_motivo := 'denegação sem cStat 110/301/302/303: ignorada';
    end if;
  end if;

  if v_res = 'autorizada' then
    if n.situacao in ('pendente', 'contingencia') then v_nova := 'autorizada'; v_orig := 'atualizacao'; end if;
  elsif v_res = 'cancelada' then
    if n.situacao in ('pendente', 'contingencia', 'autorizada') then v_nova := 'cancelada'; v_orig := 'cancelamento'; end if;
  elsif v_res = 'denegada' then
    if n.situacao in ('pendente', 'contingencia') then v_nova := 'rejeitada'; v_den := true; v_orig := 'rejeicao'; end if;
  end if;

  if v_nova <> n.situacao then
    v_mudou := true;
    perform set_config('rac.nf_origem', v_orig, true); perform set_config('rac.nf_fonte', 'consulta_oficial', true); perform set_config('rac.nf_tentativa', '', true); perform set_config('rac.nf_evidencia', coalesce(v_evid, ''), true);
    update public.notas_fiscais set situacao = v_nova, protocolo = case when v_nova = 'autorizada' then v_prot else protocolo end, denegada = case when v_den then true else denegada end,
           situacao_evidencia = case when n.conferida_em is null then coalesce(v_evid, situacao_evidencia) else situacao_evidencia end where id = p_nota_id;
    perform set_config('rac.nf_origem', '', true); perform set_config('rac.nf_fonte', '', true); perform set_config('rac.nf_evidencia', '', true);
  end if;

  /* próxima consulta: resolvida (cancelada/rejeitada) encerra; autorizada acompanha cancelamento por 30 dias da emissão; o resto volta com intervalo crescente; indisponível por falta de acesso espera 7 dias */
  if v_nova in ('cancelada', 'rejeitada') then v_enc := true;
  elsif v_nova = 'autorizada' then
    if n.data_emissao is null or n.data_emissao < current_date - 30 then v_enc := true; else v_prox := now() + interval '3 days'; end if;
  elsif v_res = 'invalida' and n.chave !~ '^\d{44}$' then v_enc := true;
  elsif n.criado_em < now() - interval '90 days' then v_enc := true; v_motivo := coalesce(v_motivo, 'sem resultado oficial em 90 dias: precisa de atenção do dono');
  elsif v_res = 'indisponivel' and v_origem = 'indisponivel' then v_prox := now() + interval '7 days';
  else v_prox := now() + (array['1 day', '1 day', '2 days', '4 days', '7 days'])[least(v_tent, 5)]::interval;
  end if;

  insert into public.notas_fiscais_consultas (user_id, nota_id, origem, resultado, cstat, motivo, protocolo, evidencia, situacao_antes, situacao_depois, mudou, tentativa, proxima_em, encerrada)
    values (n.user_id, p_nota_id, v_origem, v_res, v_cstat, v_motivo, case when v_res = 'autorizada' then v_prot end, v_evid, n.situacao, v_nova, v_mudou, v_tent, v_prox, v_enc);
  return jsonb_build_object('nota_id', p_nota_id, 'resultado', v_res, 'situacao', v_nova, 'mudou', v_mudou, 'proxima_em', v_prox, 'encerrada', v_enc, 'tentativa', v_tent);
end $$;
revoke all on function public.nf_validacao_registrar(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.nf_validacao_registrar(uuid, jsonb) to service_role;

-- 8) Agendamento SQL (a cada 6 h; só se o pg_cron existir): reconciliar + retomar entradas ---------------------------------------------------------------------
do $$
begin
  if pg_catalog.to_regnamespace('cron') is not null then
    perform cron.unschedule('fiscal-entradas') where exists (select 1 from cron.job where jobname = 'fiscal-entradas');
    perform cron.schedule('fiscal-entradas', '10 */6 * * *', 'select public.nf_rotina_fiscal_sql()');
  else
    raise notice 'pg_cron não existe neste banco: o job fiscal-entradas não foi criado';
  end if;
end $$;

-- 9) Auditoria: se o catálogo da 050 já existe, a tabela nova entra nele (a 050 troca a lista fixa por ele); se não, recria seguranca_estado() igual à da 059 + a tabela nova na lista da trava "mfa" ----------
do $do$
begin
  if pg_catalog.to_regclass('public.seguranca_catalogo') is not null then
    insert into public.seguranca_catalogo (tabela, trava_mfa, backup, origem, motivo) values
      ('notas_fiscais_consultas', true, true, '060', 'dado pessoal da conta: registro das consultas fiscais oficiais da nota (resultado, evidência, próxima consulta); trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)')
    on conflict (tabela) do nothing;
  else
    raise notice 'seguranca_catalogo ainda não existe (050 pendente): seguranca_estado() foi recriada com a lista fixa; se aplicar a 050 depois, rode este arquivo de novo para catalogar a tabela';
    execute $f$
create or replace function public.seguranca_estado() returns jsonb
  language plpgsql stable security definer set search_path = '' as $$
declare
  pessoais text[] := array['mercados', 'produtos', 'notas', 'itens', 'orcamentos', 'membros', 'pessoal', 'registros',
    'garmin_dia', 'garmin_ativ', 'erros', 'rotina_log', 'lista', 'bebe', 'push_inscricoes', 'ia_config', 'ia_uso',
    'ia_cobranca', 'newsletter_edicoes', 'newsletter_avisos', 'pedidos', 'pedido_itens', 'compras_online', 'compras_online_itens', 'compras_online_docs',
    'compras_importacoes', 'compras_reembolsos', 'compras_reembolsos_estornos', 'notas_fiscais', 'notas_fiscais_itens', 'notas_fiscais_docs', 'notas_fiscais_vinculos',
    'notas_fiscais_tentativas', 'notas_fiscais_situacoes', 'notas_fiscais_entradas', 'notas_fiscais_consultas', 'seguranca_eventos'];
  r jsonb;
begin
  if (select auth.uid()) is null then raise exception 'sem login' using errcode = '42501'; end if;
  select jsonb_build_object(
    'aal', coalesce((select auth.jwt()->>'aal'), 'aal1'),
    'fatores', (select count(*) from auth.mfa_factors f where f.user_id = (select auth.uid()) and f.status = 'verified'),
    'sem_rls', coalesce((select jsonb_agg(c.relname order by c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), '[]'::jsonb),
    'anon_le', coalesce((select jsonb_agg(c.relname order by c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relkind in ('r', 'v', 'm') and pg_catalog.has_table_privilege('anon', c.oid, 'SELECT')), '[]'::jsonb),
    'sem_trava_mfa', coalesce((select jsonb_agg(t order by t) from unnest(pessoais) t
                where pg_catalog.to_regclass('public.' || t) is not null
                  and not exists (select 1 from pg_catalog.pg_policies p where p.schemaname = 'public' and p.tablename = t and p.policyname = 'mfa' and p.permissive = 'RESTRICTIVE')), '[]'::jsonb),
    'cofres_publicos', coalesce((select jsonb_agg(b.id order by b.id) from storage.buckets b where b.public), '[]'::jsonb),
    'funcoes_abertas', coalesce((select jsonb_agg(p.proname order by p.proname) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.prosecdef and pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')), '[]'::jsonb),
    'conferido', now()) into r;
  return r;
end $$;
revoke all on function public.seguranca_estado() from public, anon;

    $f$;
    revoke all on function public.seguranca_estado() from public, anon;
    grant execute on function public.seguranca_estado() to authenticated;
  end if;
end $do$;

commit;

notify pgrst, 'reload schema';

-- Para DESLIGAR o job: select cron.unschedule('fiscal-entradas');
-- Reversão das funções/tabela (só se necessário): drop function public.nf_validacao_registrar(uuid, jsonb); drop function public.nf_validacao_pendentes(integer); drop table public.notas_fiscais_consultas; (as colunas novas de notas_fiscais_entradas podem ficar).
