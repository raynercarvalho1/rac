-- ============================================================================================================================================
-- PROPOSTA NÃO APLICADA — NÃO RODAR EM PRODUÇÃO SEM AUTORIZAÇÃO ESPECÍFICA DO DONO (Lote 1.5, 08/11/2026). Fica em supabase/propostas/ de propósito:
-- nenhuma ferramenta, teste de ordem de migrations ou rotina do projeto a executa. Quando aprovada, vira supabase/037_notas_fiscais_foto_pdf.sql.
-- ============================================================================================================================================
-- Central Fiscal: gravar nota lida de FOTO ou PDF (leitura por IA, Lote 1.4), com o documento original, o histórico de tentativas e o histórico de situação fiscal.
-- Rode depois da 034 (e da 036 já aplicada). Pode rodar de novo sem estragar nada: só soma (tabelas, funções, gatilhos, políticas); não apaga nem altera dados existentes;
-- NÃO faz backfill; NÃO altera nota_fiscal_salvar, nota_fiscal_conferir nem qualquer tabela/política/gatilho das migrations 032 a 034 (o XML segue exatamente como está).
--
-- O que muda (docs/fiscal.md, "Lote 1.5"):
-- • notas_fiscais_tentativas  — uma linha por leitura processada (gravada, pendente fiscal, bloqueada ou duplicada): confiança, resultado aritmético, situação fiscal, motivos,
--   campos incertos, quem e quando, ligação com a chamada de IA e os originais guardados. Só o dono lê; ninguém grava direto; não se altera nem se apaga.
-- • notas_fiscais_situacoes   — histórico de cada mudança da situação fiscal de uma nota (de → para, protocolo, evidência, fonte). Escrito só por gatilho; só o dono lê.
-- • nota_fiscal_salvar_doc()  — gravação atômica de nota de foto (1 a 4 imagens) ou PDF (1 arquivo): o BANCO refaz a conta e aplica a confiança mínima (0,90), a regra da situação,
--   a duplicidade (chave, arquivo, id) e a idempotência; só o dono; MFA. Bloqueios de negócio NÃO são erro: viram uma tentativa registrada (com o original, se pedido).
-- • nota_fiscal_atualizar_situacao() — pendente/contingência -> autorizada/cancelada/rejeitada, autorizada -> cancelada; exige protocolo para autorizar; só o dono; MFA.
-- • gatilhos: histórico de situação (definer) e uma trava para foto/PDF só ser conferida depois de autorizada; imutabilidade das duas tabelas novas.
-- • Storage: duas políticas RESTRITIVAS (somam-se às da 034) que impedem substituir/apagar original registrado em tentativa; ajudante nf_path_registrado() (definer).
--
-- DECISÕES DO DESENHO (para revisão do dono):
-- 1) Nota bloqueada (divergente, baixa confiança, cancelada, rejeitada, sem chave) NÃO vira nota: vira só a tentativa, com o original guardado (p_proc.guardar_original, padrão verdadeiro).
-- 2) Nota de foto/PDF gravada tem requer_conferencia = true (a 032 já exige para formato não XML) e NÃO é conferida na gravação. "validada" = leitura aprovada + situação autorizada
--    (derivado; nada novo em notas_fiscais). Pendente/contingência fica pendente fiscal e a conferência é recusada até a nota ser autorizada.
-- 3) nota_fiscal_salvar_doc é SECURITY DEFINER (diferente da 034) para que a trilha de auditoria não possa ser forjada por escrita direta: quem chama não tem INSERT nas tabelas
--    novas. Ela confere dono e MFA por conta própria e grava sempre com user_id = dono da casa.
-- 4) Sem FK de tentativas para ia_uso (a tentativa sobrevive a uma limpeza de ia_uso); o id fica como referência.
--
-- LIMITES CONHECIDOS (documentar na aplicação):
-- a) O banco NÃO calcula SHA-256 nem lê o arquivo: confia no hash e no tipo informados (e confere tamanho e tipo contra o metadata do Storage, como a 034).
-- b) A conta é refeita em cima do que o site manda: itens, descontos, frete, outras despesas e p_proc.componentes (soma líquida de ST, IPI, seguro, II… menos ICMS desonerado).
--    O banco não consegue provar que os componentes existem na nota; só que a equação fecha.
-- c) A confiança vem do modelo (ou revisada = verdadeiro, quando o dono conferiu e corrigiu); o banco só aplica o mínimo.
-- d) Fernanda (casa) continua com a política "casa" das tabelas da 032: lê e altera notas fiscais por escrita direta. As tabelas NOVAS são só do dono.
-- e) Sessões de administração (auth.uid() nulo) não passam pelas travas de imutabilidade (necessário para excluir uma conta em cascata).
-- f) Backup/restauração do site e seguranca_estado() ainda não conhecem as duas tabelas novas: entram na implementação (NUCLEO.SEG_TABELAS), não nesta migration.
begin;

-- 1) Tentativas de processamento -------------------------------------------------------------------------------------------------------------
create table if not exists public.notas_fiscais_tentativas (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default public.dono_da_casa() references auth.users(id) on delete cascade,
  idem             uuid not null,                                   -- chave de idempotência do clique (o site gera uma por leitura)
  nota_id          uuid references public.notas_fiscais(id) on delete set null,   -- a auditoria sobrevive à exclusão da nota
  origem           text not null check (origem in ('foto', 'pdf')),
  resultado        text not null check (resultado in ('validada', 'pendente_fiscal', 'bloqueada', 'duplicada')),
  classe           text not null check (classe in ('consistente', 'divergente', 'baixa_confianca')),
  situacao_fiscal  text check (situacao_fiscal is null or situacao_fiscal in ('autorizada', 'contingencia', 'pendente', 'rejeitada', 'cancelada')),
  confianca        numeric(4,3) not null check (confianca between 0 and 1),
  revisada         boolean not null default false,
  diferenca        numeric(12,2),                                   -- calculado pelo banco: itens − descontos + frete + outras + componentes − total
  componentes      numeric(12,2),
  motivos          jsonb not null default '[]'::jsonb check (jsonb_typeof(motivos) = 'array' and jsonb_array_length(motivos) <= 20 and pg_column_size(motivos) <= 4000),
  incertos         jsonb not null default '[]'::jsonb check (jsonb_typeof(incertos) = 'array' and jsonb_array_length(incertos) <= 20 and pg_column_size(incertos) <= 4000),
  modelo_ia        text check (modelo_ia is null or length(modelo_ia) <= 60),
  ia_uso_id        uuid,
  docs             jsonb not null default '[]'::jsonb check (jsonb_typeof(docs) = 'array' and jsonb_array_length(docs) <= 4 and pg_column_size(docs) <= 3000),   -- originais guardados por esta tentativa
  criado_por       uuid default auth.uid() references auth.users(id) on delete set null,
  criado_em        timestamptz not null default now(),
  constraint notas_fiscais_tentativas_sem_cpf check (not public.nf_tem_cpf(motivos::text) and not public.nf_tem_cpf(incertos::text) and not public.nf_tem_cpf(docs::text))
);
create unique index if not exists notas_fiscais_tentativas_idem on public.notas_fiscais_tentativas (user_id, idem);
create index if not exists notas_fiscais_tentativas_nota on public.notas_fiscais_tentativas (nota_id);
create index if not exists notas_fiscais_tentativas_docs on public.notas_fiscais_tentativas using gin (docs jsonb_path_ops);

-- 2) Histórico de situação fiscal -------------------------------------------------------------------------------------------------------------
create table if not exists public.notas_fiscais_situacoes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  nota_id       uuid not null references public.notas_fiscais(id) on delete cascade,
  de            text check (de is null or de in ('autorizada', 'contingencia', 'pendente', 'rejeitada', 'cancelada')),
  para          text not null check (para in ('autorizada', 'contingencia', 'pendente', 'rejeitada', 'cancelada')),
  protocolo     text check (protocolo is null or protocolo ~ '^\d{15}$'),
  evidencia     text check (evidencia is null or length(evidencia) <= 200),
  origem        text not null check (origem in ('gravacao', 'atualizacao', 'cancelamento', 'rejeicao', 'manual')),
  fonte         text not null default 'manual' check (fonte in ('foto', 'pdf', 'xml', 'manual')),
  tentativa_id  uuid references public.notas_fiscais_tentativas(id) on delete set null deferrable initially deferred,
  criado_por    uuid default auth.uid() references auth.users(id) on delete set null,
  criado_em     timestamptz not null default now(),
  constraint notas_fiscais_situacoes_sem_cpf check (not public.nf_tem_cpf(evidencia))
);
create index if not exists notas_fiscais_situacoes_nota on public.notas_fiscais_situacoes (nota_id, criado_em);

-- 3) Imutabilidade (auditoria só cresce) --------------------------------------------------------------------------------------------------------
create or replace function public.nf_tentativas_imutavel() returns trigger
  language plpgsql security invoker set search_path = '' as $$
begin
  if (select auth.uid()) is null then return case when tg_op = 'DELETE' then old else new end; end if;     -- administração e cascata de exclusão de conta
  /* única mudança aceita: nota_id vira nulo quando a nota é excluída (a tentativa fica) */
  if tg_op = 'UPDATE' and old.nota_id is not null and new.nota_id is null and (to_jsonb(new) - 'nota_id') = (to_jsonb(old) - 'nota_id') then return new; end if;
  raise exception 'tentativa de processamento: o registro de auditoria não muda nem sai' using errcode = '22023';
end $$;
revoke all on function public.nf_tentativas_imutavel() from public, anon;
drop trigger if exists nf_tentativas_imutavel on public.notas_fiscais_tentativas;
create trigger nf_tentativas_imutavel before update or delete on public.notas_fiscais_tentativas for each row execute function public.nf_tentativas_imutavel();

create or replace function public.nf_situacoes_imutavel() returns trigger
  language plpgsql security invoker set search_path = '' as $$
begin
  if (select auth.uid()) is null then return case when tg_op = 'DELETE' then old else new end; end if;
  if tg_op = 'UPDATE' and old.tentativa_id is not null and new.tentativa_id is null and (to_jsonb(new) - 'tentativa_id') = (to_jsonb(old) - 'tentativa_id') then return new; end if;
  /* o histórico sai junto com a nota (cascata): o pai já não existe */
  if tg_op = 'DELETE' and not exists (select 1 from public.notas_fiscais n where n.id = old.nota_id) then return old; end if;
  raise exception 'histórico de situação: o registro não muda nem sai sozinho (para remover, exclua a nota)' using errcode = '22023';
end $$;
revoke all on function public.nf_situacoes_imutavel() from public, anon;
drop trigger if exists nf_situacoes_imutavel on public.notas_fiscais_situacoes;
create trigger nf_situacoes_imutavel before update or delete on public.notas_fiscais_situacoes for each row execute function public.nf_situacoes_imutavel();

-- 4) Histórico da situação fiscal: gatilho (definer, para a trilha existir mesmo se a escrita for direta) ----------------------------------------
--    INSERT: só notas de foto/PDF (o XML não muda de comportamento). UPDATE: qualquer nota, só quando a situação muda. Origem e fonte vêm de set_config local das RPCs.
create or replace function public.notas_fiscais_hist_situacao() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  v_origem text := coalesce(nullif(current_setting('rac.nf_origem', true), ''), case when tg_op = 'INSERT' then 'gravacao' else 'manual' end);
  v_fonte  text := coalesce(nullif(current_setting('rac.nf_fonte', true), ''), case when tg_op = 'INSERT' then (case new.formato_origem when 'imagem' then 'foto' else new.formato_origem end) else 'manual' end);
  v_tent   uuid := case when current_setting('rac.nf_tentativa', true) ~ '^[0-9a-f-]{36}$' then current_setting('rac.nf_tentativa', true)::uuid end;
  v_evid   text := nullif(current_setting('rac.nf_evidencia', true), '');
begin
  if tg_op = 'INSERT' then
    if new.formato_origem = 'xml' then return null; end if;
    insert into public.notas_fiscais_situacoes (user_id, nota_id, de, para, protocolo, evidencia, origem, fonte, tentativa_id)
      values (new.user_id, new.id, null, new.situacao, new.protocolo, new.situacao_evidencia, v_origem, v_fonte, v_tent);
  elsif new.situacao is distinct from old.situacao then
    insert into public.notas_fiscais_situacoes (user_id, nota_id, de, para, protocolo, evidencia, origem, fonte, tentativa_id)
      values (new.user_id, new.id, old.situacao, new.situacao, new.protocolo, coalesce(v_evid, new.situacao_evidencia), v_origem, v_fonte, v_tent);
  end if;
  return null;
end $$;
revoke all on function public.notas_fiscais_hist_situacao() from public, anon;
drop trigger if exists notas_fiscais_hist_situacao on public.notas_fiscais;
create trigger notas_fiscais_hist_situacao after insert or update of situacao on public.notas_fiscais for each row execute function public.notas_fiscais_hist_situacao();

-- 5) Foto/PDF: não muda de formato e só se confere depois de autorizada (ordem alfabética: conferencia, congelar, foto_regras, situacao) ---------------
create or replace function public.notas_fiscais_foto_regras() returns trigger
  language plpgsql security invoker set search_path = '' as $$
begin
  if (select auth.uid()) is null or old.formato_origem = 'xml' then return new; end if;
  if new.formato_origem is distinct from old.formato_origem then raise exception 'nota: o formato de origem não muda' using errcode = '22023'; end if;
  if new.conferida_em is not null and old.conferida_em is null and new.situacao <> 'autorizada' then
    raise exception 'nota de foto ou PDF: só se confere depois de autorizada (situação atual: %)', new.situacao using errcode = '22023'; end if;
  return new;
end $$;
revoke all on function public.notas_fiscais_foto_regras() from public, anon;
drop trigger if exists notas_fiscais_foto_regras on public.notas_fiscais;
create trigger notas_fiscais_foto_regras before update on public.notas_fiscais for each row execute function public.notas_fiscais_foto_regras();

-- 6) Ajudantes ------------------------------------------------------------------------------------------------------------------------------
/* o caminho está registrado como original de uma nota OU de uma tentativa? (definer: a Fernanda não lê as tentativas, mas a trava vale para todos) */
create or replace function public.nf_path_registrado(p text) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.notas_fiscais_docs d where d.path = p)
      or exists (select 1 from public.notas_fiscais_tentativas t where t.docs @> jsonb_build_array(jsonb_build_object('path', p)))
$$;
revoke all on function public.nf_path_registrado(text) from public, anon;
grant execute on function public.nf_path_registrado(text) to authenticated;

/* a nota que já existe NESTA casa (mesmo id, mesma chave ou mesmo arquivo). Como a RPC roda como dono da função (sem RLS), o filtro por casa é explícito. */
create or replace function public.nf_existente_casa(p_casa uuid, p_id uuid, p_chave text, p_sha text) returns jsonb
  language plpgsql security invoker set search_path = '' as $$
declare v uuid;
begin
  select n.id into v from public.notas_fiscais n where n.user_id = p_casa and n.id = p_id;
  if found then return jsonb_build_object('id', v, 'motivo', 'id'); end if;
  if p_chave is not null then
    select n.id into v from public.notas_fiscais n where n.user_id = p_casa and n.chave = p_chave;
    if found then return jsonb_build_object('id', v, 'motivo', 'chave'); end if;
  end if;
  select d.nota_id into v from public.notas_fiscais_docs d where d.user_id = p_casa and d.sha256 = p_sha;
  if found then return jsonb_build_object('id', v, 'motivo', 'arquivo'); end if;
  return null;
end $$;
revoke all on function public.nf_existente_casa(uuid, uuid, text, text) from public, anon, authenticated;

/* grava uma tentativa: só é chamada pela RPC abaixo (definer); ninguém mais tem EXECUTE */
create or replace function public.nf_tentativa_gravar(p_id uuid, p_user uuid, p_idem uuid, p_nota uuid, p_origem text, p_resultado text, p_classe text, p_sit text, p_conf numeric,
  p_rev boolean, p_dif numeric, p_comp numeric, p_motivos jsonb, p_incertos jsonb, p_modelo text, p_uso uuid, p_docs jsonb) returns void
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notas_fiscais_tentativas (id, user_id, idem, nota_id, origem, resultado, classe, situacao_fiscal, confianca, revisada, diferenca, componentes, motivos, incertos,
      modelo_ia, ia_uso_id, docs)
    values (p_id, p_user, p_idem, p_nota, p_origem, p_resultado, p_classe, p_sit, p_conf, p_rev, p_dif, p_comp, p_motivos, p_incertos, p_modelo, p_uso, p_docs);
end $$;
revoke all on function public.nf_tentativa_gravar(uuid, uuid, uuid, uuid, text, text, text, text, numeric, boolean, numeric, numeric, jsonb, jsonb, text, uuid, jsonb) from public, anon, authenticated;

-- 7) nota_fiscal_salvar_doc -----------------------------------------------------------------------------------------------------------------
create or replace function public.nota_fiscal_salvar_doc(p_nota jsonb, p_itens jsonb, p_docs jsonb, p_proc jsonb)
  returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  m2 constant numeric := 9999999999.99;
  m4 constant numeric := 9999999999.9999;
  campos constant text[] := array['id','modelo','chave','numero','serie','data_emissao','emitente_nome','emitente_cnpj','emitente_uf','tp_emis','situacao',
    'situacao_evidencia','protocolo','denegada','valor_produtos','valor_descontos','valor_frete','valor_outras','valor_impostos','valor_total','valor_a_pagar',
    'pagamentos','formato_origem','requer_conferencia','observacoes'];
  dinheiro constant text[] := array['valor_produtos','valor_descontos','valor_frete','valor_outras','valor_impostos','valor_total','valor_a_pagar'];
  campos_item constant text[] := array['codigo','descricao','qtd','unidade','unidade_original','unitario','total','desconto'];
  campos_pag  constant text[] := array['codigo','forma','valor','bandeira','final'];
  campos_doc  constant text[] := array['tipo','nome','path','mime','tamanho','sha256'];
  campos_proc constant text[] := array['idem','classe','confianca','revisada','diferenca','componentes','motivos','incertos','modelo_ia','ia_uso_id','guardar_original'];
  v_casa uuid; v_id uuid; v_k text; v_i jsonb; v_pags jsonb; v_d jsonb; v_meta jsonb; v_ex jsonb; v_av jsonb := '[]'::jsonb; v_mot jsonb := '[]'::jsonb; v_inc jsonb := '[]'::jsonb;
  v_chave text; v_cnpj text; v_dt text; v_formato text; v_origem text; v_sit text; v_pasta text; v_idem uuid; v_conf numeric; v_rev boolean; v_comp numeric; v_guardar boolean;
  v_classe text; v_resultado text; v_tid uuid := gen_random_uuid(); v_uso uuid; v_modelo text;
  v_paths text[] := '{}'; v_shas text[] := '{}'; v_docs jsonb := '[]'::jsonb; v_regs jsonb := '[]'::jsonb; v_sem jsonb;
  v_tam bigint; v_mime text; v_ext text; v_sha text; v_path text; v_tipo text; v_fora boolean; v_n integer; v_ja boolean;
  v_soma numeric := 0; v_desc_it numeric := 0; v_desc numeric; v_dif numeric; v_total numeric; v_qtd numeric; v_un numeric; v_it numeric; v_dsc numeric;
  v_baixa boolean := false; v_div boolean := false; v_travas bigint[]; v_lk bigint; v_prev public.notas_fiscais_tentativas%rowtype; v_lim bigint;
begin
  v_casa := public.dono_da_casa();
  if (select auth.uid()) is null or v_casa is null then raise exception 'nota_fiscal_salvar_doc: faça login' using errcode = '42501'; end if;
  if (select auth.uid()) <> v_casa then raise exception 'nota_fiscal_salvar_doc: só o dono da casa lê nota de foto ou PDF' using errcode = '42501'; end if;
  if not (select public.rac_aal_ok()) then raise exception 'nota_fiscal_salvar_doc: confirme o código do app de segurança (MFA)' using errcode = '42501'; end if;

  -- a nota
  perform public.nf_v_campos(p_nota, campos, 'nota');
  if public.nf_v_texto(p_nota, 'id', true, 36, uuid_re) is null then raise exception 'nota_fiscal_salvar_doc: identificador inválido' using errcode = '22023'; end if;
  v_id := (p_nota->>'id')::uuid;
  v_pasta := v_casa::text || '/notas-fiscais/' || v_id::text || '/';
  perform public.nf_v_texto(p_nota, 'modelo', true, 2, '^(55|65)$');
  v_formato := public.nf_v_texto(p_nota, 'formato_origem', true, 6, '^(pdf|imagem)$');
  v_origem := case v_formato when 'pdf' then 'pdf' else 'foto' end;
  if public.nf_v_bool(p_nota, 'requer_conferencia', true) is not true then raise exception 'nota_fiscal_salvar_doc: nota de foto ou PDF sempre requer conferência' using errcode = '22023'; end if;
  v_chave := public.nf_v_texto(p_nota, 'chave', false, 44, '^\d{44}$');
  if v_chave is not null and not public.nf_chave_dv_ok(v_chave) then raise exception 'nota_fiscal_salvar_doc: a chave de acesso não passa no dígito verificador' using errcode = '22023'; end if;
  perform public.nf_v_texto(p_nota, 'numero', false, 9, '^\d{1,9}$'); perform public.nf_v_texto(p_nota, 'serie', false, 3, '^\d{1,3}$');
  v_dt := public.nf_v_texto(p_nota, 'data_emissao', false, 10, '^\d{4}-\d{2}-\d{2}$');
  if v_dt is not null and (v_dt::date < date '1995-01-01' or v_dt::date > current_date + 1) then raise exception 'nota_fiscal_salvar_doc: a data está fora do esperado' using errcode = '22023'; end if;
  perform public.nf_v_texto(p_nota, 'emitente_nome', false, 120, null);
  v_cnpj := public.nf_v_texto(p_nota, 'emitente_cnpj', false, 14, '^\d{14}$');
  if v_cnpj is not null and not public.nf_cnpj_ok(v_cnpj) then raise exception 'nota_fiscal_salvar_doc: CNPJ do emitente inválido' using errcode = '22023'; end if;
  perform public.nf_v_texto(p_nota, 'emitente_uf', false, 2, '^[A-Z]{2}$'); perform public.nf_v_num(p_nota, 'tp_emis', false, 1, 9, 0);
  v_sit := public.nf_v_texto(p_nota, 'situacao', true, 12, '^(autorizada|contingencia|pendente|rejeitada|cancelada)$');
  perform public.nf_v_texto(p_nota, 'situacao_evidencia', false, 200, null); perform public.nf_v_texto(p_nota, 'protocolo', false, 15, '^\d{15}$');
  perform public.nf_v_bool(p_nota, 'denegada', false); perform public.nf_v_texto(p_nota, 'observacoes', false, 500, null);
  foreach v_k in array dinheiro loop perform public.nf_v_num(p_nota, v_k, v_k = 'valor_total', 0, m2, 2); end loop;
  v_total := (p_nota->>'valor_total')::numeric;
  if p_nota ? 'pagamentos' and jsonb_typeof(p_nota->'pagamentos') not in ('array', 'null') then raise exception 'nota_fiscal_salvar_doc: pagamentos precisa ser uma lista' using errcode = '22023'; end if;
  v_pags := case when jsonb_typeof(p_nota->'pagamentos') = 'array' then p_nota->'pagamentos' else '[]'::jsonb end;
  if jsonb_array_length(v_pags) > 10 then raise exception 'nota_fiscal_salvar_doc: pagamentos demais (máximo 10)' using errcode = '22023'; end if;
  for v_i in select e from jsonb_array_elements(v_pags) e loop
    perform public.nf_v_campos(v_i, campos_pag, 'pagamento'); perform public.nf_v_texto(v_i, 'codigo', false, 2, '^\d{2}$'); perform public.nf_v_texto(v_i, 'forma', false, 40, null);
    perform public.nf_v_num(v_i, 'valor', true, 0, m2, 2); perform public.nf_v_texto(v_i, 'bandeira', false, 30, null); perform public.nf_v_texto(v_i, 'final', false, 4, '^\d{4}$');
  end loop;

  -- os itens
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) not between 1 and 990 then raise exception 'nota_fiscal_salvar_doc: a nota precisa de 1 a 990 itens' using errcode = '22023'; end if;
  for v_i in select e from jsonb_array_elements(p_itens) e loop
    perform public.nf_v_campos(v_i, campos_item, 'item');
    perform public.nf_v_texto(v_i, 'descricao', true, 200, null); perform public.nf_v_texto(v_i, 'codigo', false, 60, null);
    perform public.nf_v_num(v_i, 'qtd', true, 0.0001, m4, 4);
    perform public.nf_v_texto(v_i, 'unidade', false, 5, '^(un|pc|cx|pct|par|kg|g|l|ml|m|outra)$'); perform public.nf_v_texto(v_i, 'unidade_original', false, 20, null);
    perform public.nf_v_num(v_i, 'unitario', false, 0, m4, 4); perform public.nf_v_num(v_i, 'total', true, 0, m2, 2); perform public.nf_v_num(v_i, 'desconto', false, 0, m2, 2);
  end loop;

  -- o processamento declarado pelo site
  perform public.nf_v_campos(p_proc, campos_proc, 'processamento');
  v_idem := public.nf_v_texto(p_proc, 'idem', true, 36, uuid_re)::uuid;
  perform public.nf_v_texto(p_proc, 'classe', true, 15, '^(consistente|divergente|baixa_confianca)$');            -- informativo: o banco refaz a conta
  v_conf := public.nf_v_num(p_proc, 'confianca', true, 0, 1, 3);
  v_rev := public.nf_v_bool(p_proc, 'revisada', true);
  perform public.nf_v_num(p_proc, 'diferenca', false, -m2, m2, 2);
  v_comp := coalesce(public.nf_v_num(p_proc, 'componentes', false, -m2, m2, 2), 0);
  v_modelo := public.nf_v_texto(p_proc, 'modelo_ia', false, 60, null);
  v_uso := public.nf_v_texto(p_proc, 'ia_uso_id', false, 36, uuid_re)::uuid;
  v_guardar := coalesce(public.nf_v_bool(p_proc, 'guardar_original', false), true);
  if p_proc ? 'motivos' and jsonb_typeof(p_proc->'motivos') not in ('array', 'null') then raise exception 'nota_fiscal_salvar_doc: motivos precisa ser uma lista' using errcode = '22023'; end if;
  if jsonb_typeof(p_proc->'motivos') = 'array' then
    if jsonb_array_length(p_proc->'motivos') > 10 then raise exception 'nota_fiscal_salvar_doc: motivos demais' using errcode = '22023'; end if;
    for v_i in select e from jsonb_array_elements(p_proc->'motivos') e loop
      if jsonb_typeof(v_i) <> 'string' or char_length(v_i #>> '{}') > 200 then raise exception 'nota_fiscal_salvar_doc: cada motivo é um texto de até 200 caracteres' using errcode = '22023'; end if;
    end loop;
  end if;
  if p_proc ? 'incertos' and jsonb_typeof(p_proc->'incertos') not in ('array', 'null') then raise exception 'nota_fiscal_salvar_doc: incertos precisa ser uma lista' using errcode = '22023'; end if;
  if jsonb_typeof(p_proc->'incertos') = 'array' then
    if jsonb_array_length(p_proc->'incertos') > 20 then raise exception 'nota_fiscal_salvar_doc: incertos demais' using errcode = '22023'; end if;
    for v_i in select e from jsonb_array_elements(p_proc->'incertos') e loop
      perform public.nf_v_campos(v_i, array['campo','motivo'], 'incerto'); perform public.nf_v_texto(v_i, 'campo', true, 60, null); perform public.nf_v_texto(v_i, 'motivo', false, 200, null);
    end loop;
    v_inc := p_proc->'incertos';
  end if;

  -- os originais: PDF = 1 arquivo; imagem = 1 a 4. Caminho EXATO <dono>/notas-fiscais/<nota>/<sha256>.<ext> no cofre "familia", batendo com o objeto real
  if jsonb_typeof(p_docs) is distinct from 'array' or jsonb_array_length(p_docs) not between 1 and 4 or (v_formato = 'pdf' and jsonb_array_length(p_docs) <> 1) then
    raise exception 'nota_fiscal_salvar_doc: PDF tem 1 arquivo; fotos, de 1 a 4' using errcode = '22023'; end if;
  for v_d in select e from jsonb_array_elements(p_docs) e loop
    perform public.nf_v_campos(v_d, campos_doc, 'documento');
    v_tipo := public.nf_v_texto(v_d, 'tipo', true, 6, '^(pdf|imagem)$');
    if v_tipo <> v_formato then raise exception 'nota_fiscal_salvar_doc: o tipo do documento precisa ser igual ao formato da nota' using errcode = '22023'; end if;
    perform public.nf_v_texto(v_d, 'nome', true, 200, null);
    v_mime := public.nf_v_texto(v_d, 'mime', true, 100, '^(application/pdf|image/jpeg|image/png|image/webp)$');
    if (v_formato = 'pdf') <> (v_mime = 'application/pdf') then raise exception 'nota_fiscal_salvar_doc: o tipo do arquivo não combina com o formato da nota' using errcode = '22023'; end if;
    v_lim := case when v_formato = 'pdf' then 10485760 else 12582912 end;
    perform public.nf_v_num(v_d, 'tamanho', true, 1, v_lim, 0);
    v_sha := public.nf_v_texto(v_d, 'sha256', true, 64, '^[0-9a-f]{64}$');
    if v_sha = any (v_shas) then raise exception 'nota_fiscal_salvar_doc: arquivo repetido na mesma nota' using errcode = '22023'; end if;
    v_ext := case v_mime when 'application/pdf' then 'pdf' when 'image/png' then 'png' when 'image/webp' then 'webp' else 'jpg' end;
    v_path := public.nf_v_texto(v_d, 'path', true, 300, null);
    if v_path <> v_pasta || v_sha || '.' || v_ext then raise exception 'nota_fiscal_salvar_doc: o caminho do documento precisa ser exatamente <dono>/notas-fiscais/<nota>/<sha256>.<extensão>' using errcode = '22023'; end if;
    select o.metadata, coalesce((to_jsonb(o)->>'is_delete_marker')::boolean, false) or (to_jsonb(o)->>'archived_at') is not null into v_meta, v_fora
      from storage.objects o where o.bucket_id = 'familia' and o.name = v_path order by ((to_jsonb(o)->>'archived_at') is not null), o.created_at desc limit 1;
    if not found or v_fora then raise exception 'nota_fiscal_salvar_doc: o arquivo não está no cofre' using errcode = '22023'; end if;
    v_tam := case when jsonb_typeof(v_meta->'size') = 'number' and (v_meta->>'size') ~ '^\d+$' then (v_meta->>'size')::bigint end;
    if v_tam is null then raise exception 'nota_fiscal_salvar_doc: o Storage não informou o tamanho do arquivo' using errcode = '22023'; end if;
    if v_tam <> (v_d->>'tamanho')::bigint then raise exception 'nota_fiscal_salvar_doc: o tamanho informado não bate com o arquivo no cofre' using errcode = '22023'; end if;
    if (case when jsonb_typeof(v_meta->'mimetype') = 'string' then lower(btrim(split_part(v_meta->>'mimetype', ';', 1))) end) is distinct from v_mime then
      raise exception 'nota_fiscal_salvar_doc: o tipo informado não bate com o arquivo no cofre' using errcode = '22023'; end if;
    v_paths := v_paths || v_path; v_shas := v_shas || v_sha;
    v_docs := v_docs || jsonb_build_array(jsonb_build_object('tipo', v_tipo, 'nome', v_d->>'nome', 'path', v_path, 'mime', v_mime, 'tamanho', (v_d->>'tamanho')::bigint, 'sha256', v_sha));
  end loop;

  -- concorrência: idem, chave, arquivos e id, por casa, em ordem crescente (sem deadlock)
  select coalesce(array_agg(t.k order by t.k), '{}') into v_travas from (select distinct x.k from unnest(array[
      public.nf_trava(v_casa::text || ':idem:' || v_idem::text), public.nf_trava(v_casa::text || ':id:' || v_id::text),
      case when v_chave is not null then public.nf_trava(v_casa::text || ':chave:' || v_chave) end]
      || array(select public.nf_trava(v_casa::text || ':sha:' || s) from unnest(v_shas) s)) as x(k) where x.k is not null) t;
  foreach v_lk in array v_travas loop perform pg_advisory_xact_lock(v_lk); end loop;

  -- o mesmo clique de novo (retentativa de rede): devolve o que já foi decidido, sem gravar nada
  select * into v_prev from public.notas_fiscais_tentativas where user_id = v_casa and idem = v_idem;
  if found then
    return jsonb_build_object('id', v_prev.nota_id, 'criado', false, 'ja_existia', true, 'resultado', v_prev.resultado, 'classe', v_prev.classe, 'tentativa_id', v_prev.id,
      'motivos', v_prev.motivos, 'docs_para_apagar', coalesce((select jsonb_agg(p) from unnest(v_paths) p where not public.nf_path_registrado(p)), '[]'::jsonb));
  end if;

  -- a conta refeita pelo banco (itens, descontos, frete, outras despesas e componentes declarados) e a confiança mínima
  for v_i, v_n in select e.v, e.n::integer from jsonb_array_elements(p_itens) with ordinality as e(v, n) loop
    v_it := (v_i->>'total')::numeric; v_qtd := (v_i->>'qtd')::numeric; v_un := (v_i->>'unitario')::numeric; v_dsc := coalesce((v_i->>'desconto')::numeric, 0);
    v_soma := v_soma + v_it; v_desc_it := v_desc_it + v_dsc;
    if v_un is not null and abs(v_it - v_qtd * v_un) > 0.01 + v_qtd * 0.00005 then
      v_div := true; v_mot := v_mot || to_jsonb('Item ' || v_n || ': quantidade × unitário não bate com o total.'::text); end if;
    if v_dsc > v_it then v_div := true; v_mot := v_mot || to_jsonb('Item ' || v_n || ': o desconto é maior que o item.'::text); end if;
  end loop;
  v_desc := coalesce((p_nota->>'valor_descontos')::numeric, v_desc_it);
  if (p_nota->>'valor_descontos') is not null and v_desc_it > 0 and abs((p_nota->>'valor_descontos')::numeric - v_desc_it) > 0.01 then
    v_div := true; v_mot := v_mot || to_jsonb('A soma dos descontos dos itens difere do desconto total da nota.'::text); end if;
  if (p_nota->>'valor_produtos') is not null and abs(v_soma - (p_nota->>'valor_produtos')::numeric) > 0.01 then
    v_div := true; v_mot := v_mot || to_jsonb('A soma dos itens difere do total de produtos da nota.'::text); end if;
  v_dif := v_soma - v_desc + coalesce((p_nota->>'valor_frete')::numeric, 0) + coalesce((p_nota->>'valor_outras')::numeric, 0) + v_comp - v_total;
  if abs(v_dif) > 0.01 then v_div := true; v_mot := v_mot || to_jsonb('A conta dos itens difere do total fiscal em ' || to_char(abs(v_dif), 'FM999999990.00') || (case when v_dif > 0 then ' a mais.' else ' a menos.' end)); end if;
  if v_chave is null then v_baixa := true; v_mot := v_mot || to_jsonb('A chave de acesso está ausente ou inválida.'::text); end if;
  if v_conf < 0.9 and not v_rev then v_baixa := true; v_mot := v_mot || to_jsonb('Confiança da leitura abaixo do mínimo (0,90) e sem revisão do dono.'::text); end if;
  v_classe := case when v_baixa then 'baixa_confianca' when v_div then 'divergente' else 'consistente' end;
  if v_sit in ('cancelada', 'rejeitada') then v_mot := v_mot || to_jsonb('Nota ' || v_sit || ': não vale como compra fiscal validada.'); end if;
  v_resultado := case when v_classe <> 'consistente' or v_sit in ('cancelada', 'rejeitada') then 'bloqueada' when v_sit = 'autorizada' then 'validada' else 'pendente_fiscal' end;
  if v_resultado = 'pendente_fiscal' then v_av := v_av || to_jsonb('Nota em ' || v_sit || ': guardada como pendente fiscal, sem conferência até ser autorizada.'); end if;

  -- duplicidade: o mesmo id, a mesma chave ou algum arquivo já registrado numa nota
  v_ex := public.nf_existente_casa(v_casa, v_id, v_chave, v_shas[1]);
  if v_ex is null then
    for v_n in 2 .. coalesce(array_length(v_shas, 1), 0) loop
      v_ex := public.nf_existente_casa(v_casa, v_id, v_chave, v_shas[v_n]); exit when v_ex is not null;
    end loop;
  end if;
  v_sem := coalesce((select jsonb_agg(p) from unnest(v_paths) p where not public.nf_path_registrado(p)), '[]'::jsonb);
  if v_ex is not null then
    perform public.nf_tentativa_gravar(v_tid, v_casa, v_idem, (v_ex->>'id')::uuid, v_origem, 'duplicada', v_classe, v_sit, v_conf, v_rev, v_dif, v_comp, v_mot, v_inc, v_modelo, v_uso, '[]'::jsonb);
    return jsonb_build_object('id', (v_ex->>'id')::uuid, 'criado', false, 'ja_existia', (v_ex->>'motivo') = 'id', 'duplicada', (v_ex->>'motivo') <> 'id', 'motivo', v_ex->>'motivo',
      'resultado', 'duplicada', 'tentativa_id', v_tid, 'docs_para_apagar', v_sem);
  end if;

  -- originais que esta tentativa guarda: os que ainda não estão guardados em outra tentativa (mesmo arquivo lido de novo não ocupa o cofre duas vezes)
  for v_d in select e from jsonb_array_elements(v_docs) e loop
    select exists (select 1 from public.notas_fiscais_tentativas t, jsonb_array_elements(t.docs) x where x->>'sha256' = v_d->>'sha256') into v_ja;
    if not v_ja then v_regs := v_regs || jsonb_build_array(v_d); end if;
  end loop;

  if v_resultado = 'bloqueada' then
    if v_guardar then
      perform public.nf_tentativa_gravar(v_tid, v_casa, v_idem, null, v_origem, 'bloqueada', v_classe, v_sit, v_conf, v_rev, v_dif, v_comp, v_mot, v_inc, v_modelo, v_uso, v_regs);
    else
      perform public.nf_tentativa_gravar(v_tid, v_casa, v_idem, null, v_origem, 'bloqueada', v_classe, v_sit, v_conf, v_rev, v_dif, v_comp, v_mot, v_inc, v_modelo, v_uso, '[]'::jsonb);
    end if;
    return jsonb_build_object('id', null, 'criado', false, 'bloqueada', true, 'resultado', 'bloqueada', 'classe', v_classe, 'situacao', v_sit, 'motivos', v_mot, 'tentativa_id', v_tid,
      'docs_para_apagar', coalesce((select jsonb_agg(p) from unnest(v_paths) p where not public.nf_path_registrado(p)), '[]'::jsonb));
  end if;

  begin     -- subtransação: se algo falhar aqui dentro, nada do que foi gravado nesta chamada fica
    perform set_config('rac.nf_origem', 'gravacao', true); perform set_config('rac.nf_fonte', v_origem, true); perform set_config('rac.nf_tentativa', v_tid::text, true);
    insert into public.notas_fiscais (id, user_id, modelo, chave, numero, serie, data_emissao, emitente_nome, emitente_cnpj, emitente_uf, tp_emis, situacao, situacao_evidencia,
      protocolo, denegada, valor_produtos, valor_descontos, valor_frete, valor_outras, valor_impostos, valor_total, valor_a_pagar, pagamentos, formato_origem, requer_conferencia, observacoes)
    values (v_id, v_casa, p_nota->>'modelo', v_chave, p_nota->>'numero', p_nota->>'serie', v_dt::date, p_nota->>'emitente_nome', v_cnpj, p_nota->>'emitente_uf',
      (p_nota->>'tp_emis')::smallint, v_sit, p_nota->>'situacao_evidencia', p_nota->>'protocolo', coalesce((p_nota->>'denegada')::boolean, false),
      (p_nota->>'valor_produtos')::numeric, (p_nota->>'valor_descontos')::numeric, (p_nota->>'valor_frete')::numeric, (p_nota->>'valor_outras')::numeric,
      (p_nota->>'valor_impostos')::numeric, v_total, (p_nota->>'valor_a_pagar')::numeric, v_pags, v_formato, true, p_nota->>'observacoes');
    insert into public.notas_fiscais_itens (user_id, nota_id, ordem, descricao, codigo, qtd, unidade, unidade_original, unitario, total, desconto)
      select v_casa, v_id, (e.n - 1)::integer, btrim(e.v->>'descricao'), e.v->>'codigo', (e.v->>'qtd')::numeric, coalesce(e.v->>'unidade', 'un'), e.v->>'unidade_original',
             (e.v->>'unitario')::numeric, (e.v->>'total')::numeric, coalesce((e.v->>'desconto')::numeric, 0)
        from jsonb_array_elements(p_itens) with ordinality as e(v, n);
    insert into public.notas_fiscais_docs (user_id, nota_id, tipo, nome, path, mime, tamanho, sha256)
      select v_casa, v_id, e->>'tipo', e->>'nome', e->>'path', e->>'mime', (e->>'tamanho')::bigint, e->>'sha256' from jsonb_array_elements(v_docs) e;
    perform public.nf_tentativa_gravar(v_tid, v_casa, v_idem, v_id, v_origem, v_resultado, v_classe, v_sit, v_conf, v_rev, v_dif, v_comp, v_mot, v_inc, v_modelo, v_uso, '[]'::jsonb);
    perform set_config('rac.nf_origem', '', true); perform set_config('rac.nf_fonte', '', true); perform set_config('rac.nf_tentativa', '', true);
  exception when unique_violation then
    v_ex := public.nf_existente_casa(v_casa, v_id, v_chave, v_shas[1]);        -- quem chegou antes já fechou: leia o vencedor
    if v_ex is null then raise; end if;
    perform public.nf_tentativa_gravar(v_tid, v_casa, v_idem, (v_ex->>'id')::uuid, v_origem, 'duplicada', v_classe, v_sit, v_conf, v_rev, v_dif, v_comp, v_mot, v_inc, v_modelo, v_uso, '[]'::jsonb);
    return jsonb_build_object('id', (v_ex->>'id')::uuid, 'criado', false, 'ja_existia', (v_ex->>'motivo') = 'id', 'duplicada', (v_ex->>'motivo') <> 'id', 'motivo', v_ex->>'motivo',
      'resultado', 'duplicada', 'tentativa_id', v_tid, 'docs_para_apagar', coalesce((select jsonb_agg(p) from unnest(v_paths) p where not public.nf_path_registrado(p)), '[]'::jsonb));
  end;
  return jsonb_build_object('id', v_id, 'criado', true, 'resultado', v_resultado, 'classe', v_classe, 'situacao', v_sit, 'motivos', v_mot, 'tentativa_id', v_tid,
    'itens', jsonb_array_length(p_itens), 'docs_gravados', jsonb_array_length(v_docs), 'avisos', v_av, 'docs_para_apagar', '[]'::jsonb);
end $$;
revoke all on function public.nota_fiscal_salvar_doc(jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.nota_fiscal_salvar_doc(jsonb, jsonb, jsonb, jsonb) to authenticated;

-- 8) Atualizar a situação fiscal de uma nota já guardada (histórico pelo gatilho) -----------------------------------------------------------------
create or replace function public.nota_fiscal_atualizar_situacao(p_id uuid, p_situacao text, p_protocolo text, p_evidencia text, p_fonte text)
  returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v public.notas_fiscais%rowtype; v_casa uuid := public.dono_da_casa(); v_origem text;
begin
  if (select auth.uid()) is null or v_casa is null then raise exception 'nota_fiscal_atualizar_situacao: faça login' using errcode = '42501'; end if;
  if (select auth.uid()) <> v_casa then raise exception 'nota_fiscal_atualizar_situacao: só o dono da casa muda a situação fiscal' using errcode = '42501'; end if;
  if not (select public.rac_aal_ok()) then raise exception 'nota_fiscal_atualizar_situacao: confirme o código do app de segurança (MFA)' using errcode = '42501'; end if;
  if p_situacao is null or p_situacao not in ('autorizada', 'cancelada', 'rejeitada') then raise exception 'nota_fiscal_atualizar_situacao: a nova situação é autorizada, cancelada ou rejeitada' using errcode = '22023'; end if;
  if p_fonte is null or p_fonte not in ('foto', 'pdf', 'xml', 'manual') then raise exception 'nota_fiscal_atualizar_situacao: fonte inválida' using errcode = '22023'; end if;
  if p_evidencia is not null and char_length(p_evidencia) > 200 then raise exception 'nota_fiscal_atualizar_situacao: evidência com mais de 200 caracteres' using errcode = '22023'; end if;
  if p_situacao = 'autorizada' and (p_protocolo is null or p_protocolo !~ '^\d{15}$') then raise exception 'nota_fiscal_atualizar_situacao: autorizar exige o protocolo de 15 dígitos' using errcode = '22023'; end if;
  select * into v from public.notas_fiscais where id = p_id for update;
  if not found then raise exception 'nota_fiscal_atualizar_situacao: nota não encontrada' using errcode = 'P0002'; end if;
  if v.situacao = p_situacao then return jsonb_build_object('id', p_id, 'sem_mudanca', true, 'situacao', v.situacao); end if;
  if not ((v.situacao in ('pendente', 'contingencia') and p_situacao in ('autorizada', 'cancelada', 'rejeitada')) or (v.situacao = 'autorizada' and p_situacao = 'cancelada')) then
    raise exception 'nota_fiscal_atualizar_situacao: de % para % não é permitido', v.situacao, p_situacao using errcode = '22023'; end if;
  v_origem := case p_situacao when 'cancelada' then 'cancelamento' when 'rejeitada' then 'rejeicao' else 'atualizacao' end;
  perform set_config('rac.nf_origem', v_origem, true); perform set_config('rac.nf_fonte', p_fonte, true); perform set_config('rac.nf_tentativa', '', true); perform set_config('rac.nf_evidencia', coalesce(p_evidencia, ''), true);
  /* nota conferida só aceita mudar a situação (034): a evidência desta mudança fica no histórico, não na nota */
  update public.notas_fiscais set situacao = p_situacao, protocolo = case when p_situacao = 'autorizada' then p_protocolo else protocolo end,
         situacao_evidencia = case when v.conferida_em is null then coalesce(p_evidencia, situacao_evidencia) else situacao_evidencia end where id = p_id;
  perform set_config('rac.nf_origem', '', true); perform set_config('rac.nf_fonte', '', true); perform set_config('rac.nf_evidencia', '', true);
  return jsonb_build_object('id', p_id, 'sem_mudanca', false, 'de', v.situacao, 'para', p_situacao);
end $$;
revoke all on function public.nota_fiscal_atualizar_situacao(uuid, text, text, text, text) from public, anon;
grant execute on function public.nota_fiscal_atualizar_situacao(uuid, text, text, text, text) to authenticated;

-- 9) Segurança por linha: SÓ O DONO lê as tabelas novas; ninguém grava direto ----------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['notas_fiscais_tentativas', 'notas_fiscais_situacoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "dono" on public.%I', t);
    execute format('drop policy if exists "mfa" on public.%I', t);
    execute format('create policy "dono" on public.%I for select to authenticated using (user_id = (select auth.uid()) and user_id = (select public.dono_da_casa()))', t);
    execute format('create policy "mfa" on public.%I as restrictive for all to authenticated using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok()))', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select on public.%I to service_role', t);
  end loop;
end $$;

-- 10) Storage: original registrado em tentativa não se substitui nem se apaga direto (somam-se às duas políticas da 034; nada é afrouxado) ----------------
drop policy if exists "nf tentativa original nao substitui" on storage.objects;
create policy "nf tentativa original nao substitui" on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'familia' or (storage.foldername(name))[2] is distinct from 'notas-fiscais' or not (select public.nf_path_registrado(name)))
  with check (bucket_id <> 'familia' or (storage.foldername(name))[2] is distinct from 'notas-fiscais' or not (select public.nf_path_registrado(name)));
drop policy if exists "nf tentativa original nao apaga" on storage.objects;
create policy "nf tentativa original nao apaga" on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'familia' or (storage.foldername(name))[2] is distinct from 'notas-fiscais' or not (select public.nf_path_registrado(name)));

commit;

notify pgrst, 'reload schema';
