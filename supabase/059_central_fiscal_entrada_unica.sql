-- status: pendente
-- PROPOSTA 059 · NÃO APLICADA EM PRODUÇÃO (Central Fiscal: confirmação única, 16/11/2026). O dono roda no SQL Editor do Supabase ANTES de o site novo ir ao ar. Pode rodar de novo sem erro.
-- Por que existe: hoje gravar a nota e dar entrada no Mercado são duas etapas, e a 040 (nunca aplicada) tinha defeitos (docs/fiscal.md, "Redesenho"). Esta migration SUBSTITUI a 040: não aplique a 040.
-- Decisões do dono (16/11/2026): "Estou de acordo" é a única confirmação humana; ao confirmar, a nota é gravada na Central Fiscal e a compra é lançada no Mercado; a situação fiscal NÃO impede a
--   entrada (autorizada, pendente e contingência entram; cancelada e rejeitada não); nunca cria despesa (gera_despesa = false); a mesma nota nunca gera duas compras; falha no Mercado não perde a nota.
-- O que cria:
--   1) tabela notas_fiscais_entradas: UMA linha por nota confirmada = a confirmação humana (quem, quando) + as decisões de produto e de estabelecimento + o estado da entrada no Mercado
--      (concluida, ja_no_mercado, falhou, pendente) + a marca "revisar" (nota cancelada/rejeitada depois da entrada). Só as funções escrevem; a casa lê; trava "mfa"; nada para anon.
--   2) nota_fiscal_confirmar(...): UMA chamada: grava a nota (chama a nota_fiscal_salvar da 034 ou a nota_fiscal_salvar_doc da 037/039, SEM alterá-las), registra a confirmação e lança a compra no
--      Mercado. O lançamento roda num sub-bloco (savepoint): se falhar, a nota e a confirmação ficam e a entrada vira "falhou" com o motivo; nada fica pela metade no Mercado.
--   3) nota_fiscal_entrada_mercado(p_nota_id, p_concordo, p_decisoes): "Tentar de novo" (retoma a entrada já confirmada, sem nova confirmação) e a entrada de nota ANTIGA (sem confirmação
--      registrada: exige p_concordo = true e as decisões). Substitui a função da 040 (uuid, boolean), que é removida se existir.
--   4) nf_mercado_lancar / nf_entrada_processar: ajudantes internos (ninguém que entrou os chama).
--   5) gatilho: nota que vira cancelada ou rejeitada DEPOIS da entrada mantém a compra e o histórico e fica marcada para revisão (entradas.revisar e aviso na observação da compra do Mercado).
--   6) seguranca_estado(): recriada igual à da 038 + a tabela nova na lista da trava "mfa".
-- Regras: dono OU casa (Fernanda), MFA obrigatório, login; o dono da casa é quem aparece como user_id; todas as funções são SECURITY DEFINER com search_path vazio e filtram a casa explicitamente.
--   Produto: o site decide (≥ 70% de semelhança reutiliza; abaixo cria); o banco confere que o produto é da casa e, se faltar decisão, CRIA produto em vez de bloquear. Totais: desconto, frete e outras
--   despesas da nota são rateados nos itens para a soma dos itens fechar com o total pago. Duplicidade: mesma chave já no Mercado = vincula e não cria outra compra. Sem chave: só o aviso do site.
-- Não faz: não cria despesa (nem toca em registros, pedidos, compras_online), não muda a situação fiscal, não altera notas_fiscais nem os itens originais, não toca em 034/037/039, não afrouxa RLS/MFA.
-- Pré-requisito para a Fernanda: a 057 (ela tira a linha "só o dono" de nota_fiscal_salvar_doc e as políticas "foto so dono"). Sem a 057 a Fernanda grava XML mas não nota de foto/PDF, como hoje.
-- Ordem: 034 → 037 → 039 → (057) → 059. Conferência depois de aplicar: supabase/conferencias/059_conferir_producao.sql (só leitura).
begin;

-- 1) A confirmação e o estado da entrada no Mercado ----------------------------------------------------------------------------------------------
create table if not exists public.notas_fiscais_entradas (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default public.dono_da_casa() references auth.users(id) on delete cascade,
  nota_id        uuid not null references public.notas_fiscais(id) on delete cascade,
  confirmado_por uuid not null,                       -- quem clicou em "Estou de acordo" (sem FK, como conferida_por: a autoria histórica sobrevive)
  confirmado_em  timestamptz not null default now(),
  estado         text not null check (estado in ('pendente', 'concluida', 'ja_no_mercado', 'falhou')),
  mercado_nota_id uuid references public.notas(id) on delete set null,   -- a compra do Mercado; se for apagada lá, a linha continua
  decisoes       jsonb not null check (jsonb_typeof(decisoes) = 'object' and pg_column_size(decisoes) <= 200000),
  tentativas     integer not null default 0 check (tentativas >= 0),
  erro           text check (erro is null or length(erro) <= 300),
  revisar        text check (revisar is null or revisar in ('nota_cancelada', 'nota_rejeitada')),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  unique (nota_id)
);
create index if not exists notas_fiscais_entradas_estado on public.notas_fiscais_entradas (user_id, estado);
create index if not exists notas_fiscais_entradas_mercado on public.notas_fiscais_entradas (mercado_nota_id);
alter table public.notas_fiscais_entradas enable row level security;
drop policy if exists "casa" on public.notas_fiscais_entradas;
create policy "casa" on public.notas_fiscais_entradas for select to authenticated using (user_id = (select public.dono_da_casa()));
do $$
declare t text;
begin
  foreach t in array array['notas_fiscais_entradas'] loop
    execute format('drop policy if exists "mfa" on public.%I', t);
    execute format('create policy "mfa" on public.%I as restrictive for all to authenticated using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok()))', t);
  end loop;
end $$;
revoke all on public.notas_fiscais_entradas from anon, authenticated;
grant select on public.notas_fiscais_entradas to authenticated;      -- ninguém escreve direto: só as funções (security definer)

-- 2) Lançar a compra no Mercado (interno) ---------------------------------------------------------------------------------------------------------
-- p_decisoes = {mercado:{id,nome,cnpj}, itens:[{ordem, produto_id | novo:{nome,categoria,unidade}}]}. Lê a nota e os itens do BANCO (não do navegador). Tudo ou nada (quem chama põe num sub-bloco).
create or replace function public.nf_mercado_lancar(p_casa uuid, p_nota_id uuid, p_decisoes jsonb)
  returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  n public.notas_fiscais%rowtype; v_merc uuid; v_mnota uuid; v_prod uuid; v_cat text; v_it record; v_pd jsonb; v_m jsonb; v_nv boolean;
  v_total numeric; v_soma_br numeric; v_fator numeric; v_acum numeric := 0; v_soma numeric := 0; v_n integer := 0; v_tot_itens integer; v_novos integer := 0;
  v_q numeric; v_un text; v_vu numeric; v_br numeric; v_vt numeric; v_ds numeric; v_nome text; v_cn text; v_fonte text; v_obs text; v_av jsonb := '[]'::jsonb; v_ajuste numeric;
begin
  select * into n from public.notas_fiscais where id = p_nota_id and user_id = p_casa;
  if not found then raise exception 'entrada no Mercado: nota não encontrada' using errcode = 'P0002'; end if;
  if n.situacao in ('cancelada', 'rejeitada') then raise exception 'entrada no Mercado: nota % não vale como compra', n.situacao using errcode = '22023'; end if;
  if n.data_emissao is null or n.valor_total is null or nullif(btrim(coalesce(n.emitente_nome, '')), '') is null then
    raise exception 'entrada no Mercado: a nota precisa ter data, total e emitente' using errcode = '22023'; end if;
  select count(*), coalesce(sum(greatest(i.total - coalesce(i.desconto, 0), 0)), 0) into v_tot_itens, v_soma_br from public.notas_fiscais_itens i where i.nota_id = p_nota_id;
  if v_tot_itens = 0 or v_soma_br <= 0 then raise exception 'entrada no Mercado: a nota não tem itens com valor' using errcode = '22023'; end if;
  v_total := coalesce(n.valor_a_pagar, n.valor_total);
  if v_total is null or v_total <= 0 then raise exception 'entrada no Mercado: a nota não tem total a pagar' using errcode = '22023'; end if;

  /* mesma chave já numa compra do Mercado: não cria outra; só liga a nota a ela */
  if n.chave is not null then
    select m.id into v_mnota from public.notas m where m.user_id = p_casa and m.chave_nfce = n.chave limit 1;
    if found then
      insert into public.notas_fiscais_vinculos (user_id, nota_id, modulo, registro_id, tipo, gera_despesa, valido, observacoes)
        values (p_casa, p_nota_id, 'mercado', v_mnota, 'conferencia', false, true, 'Compra que já estava no Mercado com a mesma chave de acesso.') on conflict do nothing;
      return jsonb_build_object('criado', false, 'duplicada', true, 'motivo', 'chave', 'mercado_nota_id', v_mnota);
    end if;
  end if;

  /* o estabelecimento: o que o site decidiu (se for da casa) → mesmo CNPJ → cria */
  v_m := coalesce(p_decisoes->'mercado', '{}'::jsonb);
  if jsonb_typeof(v_m) <> 'object' then v_m := '{}'::jsonb; end if;
  if (v_m->>'id') ~ uuid_re then select m.id into v_merc from public.mercados m where m.id = (v_m->>'id')::uuid and m.user_id = p_casa; end if;
  if v_merc is null and n.emitente_cnpj is not null then select m.id into v_merc from public.mercados m where m.user_id = p_casa and m.cnpj = n.emitente_cnpj limit 1; end if;
  if v_merc is null then
    v_nome := left(btrim(coalesce(nullif(btrim(v_m->>'nome'), ''), n.emitente_nome)), 120);
    if public.nf_tem_cpf(v_nome) then v_nome := left(btrim(n.emitente_nome), 120); end if;
    insert into public.mercados (user_id, nome, cnpj) values (p_casa, v_nome, n.emitente_cnpj)
      on conflict (user_id, nome) do update set cnpj = coalesce(public.mercados.cnpj, excluded.cnpj) returning id into v_merc;
  elsif n.emitente_cnpj is not null then
    update public.mercados set cnpj = n.emitente_cnpj where id = v_merc and cnpj is null;
  end if;

  v_ajuste := round(v_total - v_soma_br, 2);
  v_fator := v_total / v_soma_br;
  v_fonte := case n.formato_origem when 'xml' then 'qr' else 'foto' end;
  v_obs := left('Entrada automática pela Central Fiscal (confirmada com "Estou de acordo"). Situação fiscal: ' || n.situacao || '.'
    || case when abs(v_ajuste) > 0.01 then ' Ajuste de ' || to_char(v_ajuste, 'FM999999990.00') || ' (descontos da nota, frete e outras despesas) rateado nos itens.' else '' end, 500);
  insert into public.notas (user_id, mercado_id, data, numero, serie, chave_nfce, forma_pagamento, total, fonte, observacao)
    values (p_casa, v_merc, n.data_emissao, n.numero, n.serie, n.chave, nullif(left(coalesce(n.pagamentos->0->>'forma', ''), 60), ''), v_total, v_fonte, v_obs)
    returning id into v_mnota;

  for v_it in select * from public.notas_fiscais_itens i where i.nota_id = p_nota_id order by i.ordem, i.criado_em loop
    v_n := v_n + 1;
    v_q := case when v_it.unidade in ('g', 'ml') then v_it.qtd / 1000 else v_it.qtd end;
    v_un := case v_it.unidade when 'kg' then 'kg' when 'g' then 'kg' when 'l' then 'l' when 'ml' then 'l' else 'un' end;
    v_br := greatest(v_it.total - coalesce(v_it.desconto, 0), 0);
    /* rateio: cada item leva a sua parte do ajuste; o último fecha a diferença de centavos para a soma bater exatamente com o total pago */
    v_vt := case when v_n = v_tot_itens then round(v_total - v_acum, 2) else round(v_br * v_fator, 2) end;
    if v_vt < 0 then v_vt := 0; end if;
    v_acum := v_acum + v_vt; v_soma := v_soma + v_vt;
    v_ds := coalesce(v_it.desconto, 0) + greatest(v_br - v_vt, 0);
    v_vu := coalesce(round(v_it.unitario * case when v_it.unidade in ('g', 'ml') then 1000 else 1 end, 2), round(v_vt / nullif(v_q, 0), 2), v_vt);

    /* o produto: o que o site decidiu (se for da casa) → o que o site mandou criar → o já usado com a mesma descrição → cria. Nunca bloqueia. */
    v_prod := null; v_cat := null; v_nv := false;
    select x.value into v_pd from jsonb_array_elements(case when jsonb_typeof(p_decisoes->'itens') = 'array' then p_decisoes->'itens' else '[]'::jsonb end) as x(value)
      where (x.value->>'ordem') ~ '^\d+$' and (x.value->>'ordem')::integer = v_it.ordem limit 1;
    if v_pd is not null and (v_pd->>'produto_id') ~ uuid_re then
      select p.id, p.categoria into v_prod, v_cat from public.produtos p where p.id = (v_pd->>'produto_id')::uuid and p.user_id = p_casa;
    end if;
    if v_prod is null then
      if v_pd is not null and jsonb_typeof(v_pd->'novo') = 'object' and nullif(btrim(v_pd->'novo'->>'nome'), '') is not null then
        v_nome := left(btrim(v_pd->'novo'->>'nome'), 120);
        v_cn := coalesce(nullif(left(btrim(v_pd->'novo'->>'categoria'), 40), ''), 'Mercearia');
        if (v_pd->'novo'->>'unidade') in ('un', 'kg', 'l') then v_un := v_pd->'novo'->>'unidade'; end if;
      else
        select i2.produto_id, i2.categoria into v_prod, v_cat from public.itens i2
          where i2.user_id = p_casa and i2.produto_id is not null and lower(btrim(i2.descricao)) = lower(btrim(v_it.descricao)) order by i2.created_at desc limit 1;
        v_nome := left(initcap(lower(btrim(v_it.descricao))), 120); v_cn := 'Mercearia';
      end if;
      if v_prod is null then
        if public.nf_tem_cpf(v_nome) then v_nome := 'Produto sem nome'; end if;
        insert into public.produtos (user_id, nome, categoria, unidade) values (p_casa, v_nome, v_cn, v_un)
          on conflict (user_id, nome) do update set nome = public.produtos.nome returning id, categoria, (xmax = 0) into v_prod, v_cat, v_nv;
        if v_nv then v_novos := v_novos + 1; end if;
      end if;
    end if;
    insert into public.itens (user_id, nota_id, produto_id, descricao, categoria, quantidade, unidade, valor_unitario, valor_total, desconto, observacao)
      values (p_casa, v_mnota, v_prod, left(v_it.descricao, 200), v_cat, round(v_q, 3), v_un, v_vu, v_vt, v_ds,
              case when v_vt <> v_br then 'Ajuste da nota rateado: ' || to_char(v_vt - v_br, 'FM999999990.00') when coalesce(v_it.desconto, 0) > 0 then 'Desconto no item: ' || to_char(v_it.desconto, 'FM999999990.00') else null end);
  end loop;

  if abs(v_ajuste) > 0.01 then
    v_av := v_av || to_jsonb('A soma dos itens da nota (' || to_char(v_soma_br, 'FM999999990.00') || ') difere do total pago (' || to_char(v_total, 'FM999999990.00') || '): a diferença (descontos da nota, frete, outras despesas) foi rateada nos itens.'::text);
  end if;
  insert into public.notas_fiscais_vinculos (user_id, nota_id, modulo, registro_id, tipo, gera_despesa, valido, observacoes)
    values (p_casa, p_nota_id, 'mercado', v_mnota, 'conferencia', false, true, 'Entrada automática no Mercado com o "Estou de acordo"; situação fiscal ' || n.situacao || '.');
  return jsonb_build_object('criado', true, 'duplicada', false, 'mercado_nota_id', v_mnota, 'mercado_id', v_merc, 'itens', v_n, 'total', v_total, 'soma_itens', v_soma, 'produtos_novos', v_novos, 'avisos', v_av);
end $$;
revoke all on function public.nf_mercado_lancar(uuid, uuid, jsonb) from public, anon, authenticated;

-- 3) Processar a entrada de uma confirmação já registrada (interno): lança no Mercado num sub-bloco; falha vira estado "falhou" ----------------------
create or replace function public.nf_entrada_processar(p_entrada uuid) returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare e public.notas_fiscais_entradas%rowtype; v_r jsonb := '{}'::jsonb; v_msg text;
begin
  select * into e from public.notas_fiscais_entradas where id = p_entrada for update;
  if not found then raise exception 'entrada no Mercado: confirmação não encontrada' using errcode = 'P0002'; end if;
  if e.estado in ('concluida', 'ja_no_mercado') then
    return jsonb_build_object('estado', e.estado, 'mercado_nota_id', e.mercado_nota_id, 'confirmado_em', e.confirmado_em, 'tentativas', e.tentativas, 'erro', null, 'revisar', e.revisar, 'ja_existia', true);
  end if;
  begin     -- sub-bloco (savepoint): se algo falhar aqui dentro, nada do Mercado fica (nem produto, nem mercado, nem compra); a nota e a confirmação ficam
    v_r := public.nf_mercado_lancar(e.user_id, e.nota_id, e.decisoes);
    update public.notas_fiscais_entradas set estado = case when (v_r->>'duplicada')::boolean then 'ja_no_mercado' else 'concluida' end, mercado_nota_id = (v_r->>'mercado_nota_id')::uuid,
      tentativas = tentativas + 1, erro = null, atualizado_em = now() where id = p_entrada;
  exception when others then
    v_msg := case when sqlstate = '23505' then 'já existe no Mercado uma compra com o mesmo número, data e estabelecimento' else sqlerrm end;
    update public.notas_fiscais_entradas set estado = 'falhou', erro = left(v_msg, 300), tentativas = tentativas + 1, atualizado_em = now() where id = p_entrada;
    v_r := jsonb_build_object('criado', false);
  end;
  select * into e from public.notas_fiscais_entradas where id = p_entrada;
  return jsonb_build_object('estado', e.estado, 'mercado_nota_id', e.mercado_nota_id, 'confirmado_em', e.confirmado_em, 'tentativas', e.tentativas, 'erro', e.erro, 'revisar', e.revisar,
    'ja_existia', false, 'itens', v_r->'itens', 'total', v_r->'total', 'soma_itens', v_r->'soma_itens', 'produtos_novos', v_r->'produtos_novos', 'avisos', coalesce(v_r->'avisos', '[]'::jsonb));
end $$;
revoke all on function public.nf_entrada_processar(uuid) from public, anon, authenticated;

-- 4) Confirmação única: grava a nota (034 ou 037/039) + registra o "Estou de acordo" + lança no Mercado ------------------------------------------
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

-- 5) "Tentar de novo" e entrada de nota antiga ---------------------------------------------------------------------------------------------------
drop function if exists public.nota_fiscal_entrada_mercado(uuid, boolean);      -- a da 040 (nunca aplicada): esta a substitui
create or replace function public.nota_fiscal_entrada_mercado(p_nota_id uuid, p_concordo boolean default false, p_decisoes jsonb default null)
  returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_casa uuid := public.dono_da_casa(); n public.notas_fiscais%rowtype; v_ent public.notas_fiscais_entradas%rowtype; v_e jsonb;
begin
  if (select auth.uid()) is null or v_casa is null then raise exception 'entrada no Mercado: faça login' using errcode = '42501'; end if;
  if not (select public.rac_aal_ok()) then raise exception 'entrada no Mercado: confirme o código do app de segurança (MFA)' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(public.nf_trava(v_casa::text || ':entrada:' || p_nota_id::text));
  select * into n from public.notas_fiscais where id = p_nota_id and user_id = v_casa for update;
  if not found then raise exception 'entrada no Mercado: nota não encontrada' using errcode = 'P0002'; end if;
  if n.situacao in ('cancelada', 'rejeitada') then raise exception 'entrada no Mercado: nota % não vale como compra', n.situacao using errcode = '22023'; end if;
  select * into v_ent from public.notas_fiscais_entradas where nota_id = p_nota_id and user_id = v_casa;
  if not found then
    /* nota antiga, sem confirmação registrada: exige o "Estou de acordo" desta nota e as decisões de produto */
    if p_concordo is not true then raise exception 'entrada no Mercado: confirme com "Estou de acordo" para esta nota' using errcode = '22023'; end if;
    if jsonb_typeof(p_decisoes) is distinct from 'object' or jsonb_typeof(p_decisoes->'itens') is distinct from 'array' or jsonb_array_length(p_decisoes->'itens') > 990
       or pg_column_size(p_decisoes) > 200000 then raise exception 'entrada no Mercado: decisões inválidas' using errcode = '22023'; end if;
    insert into public.notas_fiscais_entradas (user_id, nota_id, confirmado_por, estado, decisoes) values (v_casa, p_nota_id, (select auth.uid()), 'pendente', p_decisoes)
      on conflict (nota_id) do nothing;
    select * into v_ent from public.notas_fiscais_entradas where nota_id = p_nota_id and user_id = v_casa;
    /* XML autorizado: a confirmação humana também registra a conferência e congela os dados originais (o gatilho da 034 define quem e quando) */
    if n.formato_origem = 'xml' and n.situacao = 'autorizada' and n.conferida_em is null then update public.notas_fiscais set conferida_em = now() where id = p_nota_id; end if;
  end if;
  v_e := public.nf_entrada_processar(v_ent.id);
  return jsonb_build_object('nota_id', p_nota_id, 'entrada', v_e);
end $$;
revoke all on function public.nota_fiscal_entrada_mercado(uuid, boolean, jsonb) from public, anon;
grant execute on function public.nota_fiscal_entrada_mercado(uuid, boolean, jsonb) to authenticated;

-- 6) Nota cancelada ou rejeitada DEPOIS da entrada: a compra e o histórico ficam; só marca para revisão -------------------------------------------
create or replace function public.notas_fiscais_entradas_revisar() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if new.situacao in ('cancelada', 'rejeitada') and new.situacao is distinct from old.situacao then
    for r in select e.id, e.mercado_nota_id from public.notas_fiscais_entradas e where e.nota_id = new.id and e.estado in ('concluida', 'ja_no_mercado') loop
      update public.notas_fiscais_entradas set revisar = 'nota_' || new.situacao, atualizado_em = now() where id = r.id;
      if r.mercado_nota_id is not null then
        update public.notas set observacao = left(coalesce(observacao || ' · ', '') || 'REVISAR: a nota fiscal foi ' || new.situacao || ' depois da entrada (a compra foi mantida).', 800) where id = r.mercado_nota_id;
      end if;
    end loop;
  end if;
  return new;
end $$;
revoke all on function public.notas_fiscais_entradas_revisar() from public, anon, authenticated;
drop trigger if exists notas_fiscais_entradas_revisar on public.notas_fiscais;
create trigger notas_fiscais_entradas_revisar after update of situacao on public.notas_fiscais for each row execute function public.notas_fiscais_entradas_revisar();

-- 7) Auditoria: se o catálogo da 050 já existe, a tabela entra nele (a 050 troca a lista fixa por ele); se não, recria seguranca_estado() igual à da 038 + a tabela nova na lista da trava "mfa" ----------
do $do$
begin
  if pg_catalog.to_regclass('public.seguranca_catalogo') is not null then
    insert into public.seguranca_catalogo (tabela, trava_mfa, backup, origem, motivo) values
      ('notas_fiscais_entradas', true, true, '059', 'dado pessoal da conta: confirmação "Estou de acordo" e estado da entrada no Mercado; trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)')
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
    'notas_fiscais_tentativas', 'notas_fiscais_situacoes', 'notas_fiscais_entradas', 'seguranca_eventos'];
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
