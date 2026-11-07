-- 034 · Central Fiscal, Lote B: conferência, congelamento (com a exceção do cancelamento), gravação atômica de XML e proteção dos originais (docs/fiscal.md).
-- Rode depois da 033. Pode rodar de novo sem estragar nada: só soma (colunas, funções, gatilhos, constraints, políticas); não apaga nem altera dados.
-- Aplicado em produção em 07/11/2026 (Postgres 17.11) pelo dono, no SQL Editor, e conferido por consulta só-leitura: 15 funções, as 2 colunas, os 5 gatilhos, as 4 constraints, as 5 políticas de
-- storage.objects (3 antigas + as 2 desta migration, restritivas), nenhuma função executável por anon e as 2 RPCs executáveis só por authenticated.
-- Não toca em Compras, Mercado, Eddie, Olivia, IA nem Garmin, nem nas migrations anteriores. Não cria tabela nova (a 033 e seguranca_estado() já cobrem as quatro).
--
-- O que muda:
-- • notas_fiscais ganha conferida_por e conferida_em (sem FK de propósito: a autoria histórica sobrevive à restauração em outra conta e à saída do usuário).
--   requer_conferencia e as constraints sem_chave_confere / nao_xml_confere da 032 NÃO mudam. Quem e quando vêm do banco (auth.uid() e now()); o site nunca os envia.
--   A conferência não se desfaz: trocar ou limpar é ignorado. Única exceção: a RESTAURAÇÃO de backup, feita pelo DONO da casa, traz o par original (completo e no passado).
-- • Congelamento: nota conferida não muda nenhum campo fiscal, e seus itens e documentos não entram, não mudam e não saem. Única exceção: situação autorizada -> cancelada
--   (sem mexer em mais nada), e o gatilho da 032 continua invalidando os vínculos. Excluir a nota continua permitido (a cascata não é bloqueada).
-- • O REGISTRO do documento original é imutável sempre (nota pendente ou conferida): só some junto com a nota. No Storage (políticas RESTRITIVAS que se somam às existentes),
--   enquanto o arquivo está REGISTRADO em notas_fiscais_docs ele não se substitui, não se move e não se apaga direto. Arquivo sem registro (ainda não registrado, ou de um envio que
--   falhou) segue livre: o Storage pode finalizar o envio e o site pode apagá-lo.
-- • nota_fiscal_salvar: nota, itens, pagamentos e a referência do XML original numa transação só, sem CPF. nota_fiscal_conferir: conferir depois (ação explícita).
-- • CPF: nenhum campo de texto da Central Fiscal guarda CPF (com ou sem pontuação, só se os dígitos verificadores fecham): CHECKs nas tabelas.
--
-- LIMITES CONHECIDOS (documentados):
-- 1) O banco NÃO recalcula o SHA-256: recebe o valor informado pelo navegador (serve para detectar duplicidade; não prova a integridade do conteúdo nem que os dados
--    gravados batem com o XML). Quem confere isso é a pessoa, na conferência.
-- 2) O DONO da casa pode, por escrita direta, informar autoria histórica de conferência (é o caminho da restauração de backup).
-- 3) Excluir uma nota (inclusive conferida) é permitido e libera o arquivo do Storage para ser removido.
-- 4) Sessões de administração (auth.uid() nulo: SQL Editor, service_role) não passam pelo congelamento (precisam, por exemplo, excluir a conta com tudo em cascata).
-- 5) A leitura de storage.objects.metadata (size e mimetype) foi conferida em produção (125 objetos, size numérico). O formato do mimetype de um XML enviado só se vê no
--    primeiro envio real: se divergir do declarado, a RPC RECUSA (nunca grava pela metade). O versionamento de objetos do Storage (colunas is_versioned / is_delete_marker)
--    ainda deve ser conferido em produção (consulta somente leitura); por isso a leitura abaixo pega só a linha mais recente do nome e não depende dessas colunas.
begin;

-- 1) CPF ----------------------------------------------------------------------------------------------------------------------------------
create or replace function public.nf_cpf_dv_ok(c text) returns boolean
  language plpgsql immutable set search_path = '' as $$
declare s integer; i integer;
begin
  if c is null or c !~ '^\d{11}$' or c ~ '^(\d)\1{10}$' then return false; end if;
  s := 0; for i in 1 .. 9 loop s := s + substr(c, i, 1)::integer * (11 - i); end loop;
  s := (s * 10) % 11; if s = 10 then s := 0; end if;
  if s <> substr(c, 10, 1)::integer then return false; end if;
  s := 0; for i in 1 .. 10 loop s := s + substr(c, i, 1)::integer * (12 - i); end loop;
  s := (s * 10) % 11; if s = 10 then s := 0; end if;
  return s = substr(c, 11, 1)::integer;
end $$;
revoke all on function public.nf_cpf_dv_ok(text) from public, anon;
grant execute on function public.nf_cpf_dv_ok(text) to authenticated;

/* 11 dígitos (com ou sem pontos, hífen ou espaços) que não fazem parte de um número maior e cujos dígitos verificadores fecham. Sem lookbehind: o delimitador inicial é UM
   caractere não numérico (ou o início); o final é lookahead (não consome), então CPFs vizinhos são todos achados. Conferido em produção (25 casos, só leitura). */
create or replace function public.nf_tem_cpf(t text) returns boolean
  language plpgsql immutable set search_path = '' as $$
declare m text[];
begin
  if t is null then return false; end if;
  for m in select regexp_matches(t, '(?:^|[^0-9])(\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2})(?!\d)', 'g') loop
    if public.nf_cpf_dv_ok(regexp_replace(m[1], '\D', '', 'g')) then return true; end if;
  end loop;
  return false;
end $$;
revoke all on function public.nf_tem_cpf(text) from public, anon;
grant execute on function public.nf_tem_cpf(text) to authenticated;

/* um bigint estável a partir de um texto, para as travas de consulta (só funções documentadas) */
create or replace function public.nf_trava(k text) returns bigint
  language sql immutable set search_path = '' as $$ select ('x' || substr(md5(k), 1, 16))::bit(64)::bigint $$;
revoke all on function public.nf_trava(text) from public, anon;
grant execute on function public.nf_trava(text) to authenticated;

do $$
declare r record;
begin
  for r in select * from (values
    ('notas_fiscais', 'notas_fiscais_sem_cpf', 'not public.nf_tem_cpf(emitente_nome) and not public.nf_tem_cpf(observacoes) and not public.nf_tem_cpf(situacao_evidencia) and not public.nf_tem_cpf(pagamentos::text)'),
    ('notas_fiscais_itens', 'notas_fiscais_itens_sem_cpf', 'not public.nf_tem_cpf(descricao) and not public.nf_tem_cpf(unidade_original)'),
    ('notas_fiscais_docs', 'notas_fiscais_docs_sem_cpf', 'not public.nf_tem_cpf(nome)')) as v(t, c, e) loop
    if not exists (select 1 from pg_constraint where conrelid = ('public.' || r.t)::regclass and conname = r.c) then
      execute format('alter table public.%I add constraint %I check (%s)', r.t, r.c, r.e);
    end if;
  end loop;
end $$;

-- 2) Validadores de campo (mensagens claras em vez de erro tardio de constraint) ------------------------------------------------------------------
create or replace function public.nf_v_campos(o jsonb, permitidas text[], ctx text) returns void
  language plpgsql immutable set search_path = '' as $$
declare k text;
begin
  if jsonb_typeof(o) is distinct from 'object' then raise exception 'nota_fiscal: % precisa ser um objeto', ctx using errcode = '22023'; end if;
  for k in select jsonb_object_keys(o) loop
    if not k = any (permitidas) then raise exception 'nota_fiscal: campo não permitido em %: %', ctx, k using errcode = '22023'; end if;
  end loop;
end $$;
create or replace function public.nf_v_texto(o jsonb, k text, req boolean, maxlen integer, re text) returns text
  language plpgsql immutable set search_path = '' as $$
declare t text := jsonb_typeof(o->k);
begin
  if t is null or t = 'null' then
    if req then raise exception 'nota_fiscal: falta o campo %', k using errcode = '22023'; end if;
    return null;
  end if;
  if t <> 'string' then raise exception 'nota_fiscal: % precisa ser texto', k using errcode = '22023'; end if;
  if char_length(o->>k) > maxlen or (req and btrim(o->>k) = '') then raise exception 'nota_fiscal: % vazio ou maior que % caracteres', k, maxlen using errcode = '22023'; end if;
  if re is not null and (o->>k) !~ re then raise exception 'nota_fiscal: formato inválido em %', k using errcode = '22023'; end if;
  return o->>k;
end $$;
create or replace function public.nf_v_num(o jsonb, k text, req boolean, minv numeric, maxv numeric, casas integer) returns numeric
  language plpgsql immutable set search_path = '' as $$
declare t text := jsonb_typeof(o->k); v numeric;
begin
  if t is null or t = 'null' then
    if req then raise exception 'nota_fiscal: falta o campo %', k using errcode = '22023'; end if;
    return null;
  end if;
  if t <> 'number' then raise exception 'nota_fiscal: % precisa ser número', k using errcode = '22023'; end if;
  v := (o->>k)::numeric;
  if v < minv or v > maxv then raise exception 'nota_fiscal: % fora do que a coluna comporta (% a %)', k, minv, maxv using errcode = '22023'; end if;
  if v <> round(v, casas) then raise exception 'nota_fiscal: % com mais de % casas decimais', k, casas using errcode = '22023'; end if;
  return v;
end $$;
create or replace function public.nf_v_bool(o jsonb, k text, req boolean) returns boolean
  language plpgsql immutable set search_path = '' as $$
declare t text := jsonb_typeof(o->k);
begin
  if t is null or t = 'null' then
    if req then raise exception 'nota_fiscal: falta o campo %', k using errcode = '22023'; end if;
    return null;
  end if;
  if t <> 'boolean' then raise exception 'nota_fiscal: % precisa ser verdadeiro ou falso', k using errcode = '22023'; end if;
  return (o->>k)::boolean;
end $$;
revoke all on function public.nf_v_campos(jsonb, text[], text), public.nf_v_texto(jsonb, text, boolean, integer, text),
  public.nf_v_num(jsonb, text, boolean, numeric, numeric, integer), public.nf_v_bool(jsonb, text, boolean) from public, anon;
grant execute on function public.nf_v_campos(jsonb, text[], text), public.nf_v_texto(jsonb, text, boolean, integer, text),
  public.nf_v_num(jsonb, text, boolean, numeric, numeric, integer), public.nf_v_bool(jsonb, text, boolean) to authenticated;

-- 3) Conferência: quem e quando ---------------------------------------------------------------------------------------------------------------------
alter table public.notas_fiscais add column if not exists conferida_por uuid;
alter table public.notas_fiscais add column if not exists conferida_em  timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.notas_fiscais'::regclass and conname = 'notas_fiscais_conferencia_par') then
    alter table public.notas_fiscais add constraint notas_fiscais_conferencia_par check ((conferida_em is null) = (conferida_por is null));
  end if;
end $$;

create or replace function public.notas_fiscais_conferencia() returns trigger
  language plpgsql security invoker set search_path = '' as $$
declare v_eu uuid := (select auth.uid());
begin
  if v_eu is null then return new; end if;                       -- administração (SQL Editor, service_role): fora destas regras
  if tg_op = 'UPDATE' and old.conferida_em is not null then      -- conferida, conferida para sempre: trocar ou limpar é ignorado (a restauração por "substituir" não falha)
    new.conferida_por := old.conferida_por; new.conferida_em := old.conferida_em; return new;
  end if;
  if new.conferida_em is null then new.conferida_por := null; return new; end if;
  /* única exceção: a RESTAURAÇÃO feita pelo DONO da casa traz o par original (completo e no passado) */
  if new.conferida_por is not null and new.conferida_em <= now() and v_eu = public.dono_da_casa() then return new; end if;
  /* conferência comum: só depois de a nota existir com itens e documento. Quem e quando são do banco (auth.uid() e now()). */
  if tg_op = 'INSERT' then raise exception 'nota: a conferência vem depois de gravar os itens e o documento' using errcode = '22023'; end if;
  if not exists (select 1 from public.notas_fiscais_itens i where i.nota_id = new.id) or not exists (select 1 from public.notas_fiscais_docs d where d.nota_id = new.id) then
    raise exception 'nota: para conferir, a nota precisa de ao menos um item e do documento original' using errcode = '22023'; end if;
  new.conferida_por := v_eu; new.conferida_em := now();
  return new;
end $$;
revoke all on function public.notas_fiscais_conferencia() from public, anon;
drop trigger if exists notas_fiscais_conferencia on public.notas_fiscais;
create trigger notas_fiscais_conferencia before insert or update on public.notas_fiscais for each row execute function public.notas_fiscais_conferencia();

-- 4) Congelamento (ordem alfabética dos gatilhos BEFORE UPDATE: conferencia, congelar, situacao [032]) --------------------------------------------
--    Conferida: nenhum campo muda, exceto atualizado_em e a ÚNICA transição de situação autorizada -> cancelada (sem mexer em mais nada).
--    O gatilho notas_fiscais_situacao (032) roda depois e, nessa transição, invalida os vínculos (os vínculos não são congelados).
create or replace function public.notas_fiscais_congelar() returns trigger
  language plpgsql security invoker set search_path = '' as $$
declare ign constant text[] := array['atualizado_em', 'conferida_por', 'conferida_em', 'situacao'];
begin
  if (select auth.uid()) is null or old.conferida_em is null then return new; end if;
  if (to_jsonb(new) - ign) is distinct from (to_jsonb(old) - ign) then
    raise exception 'nota conferida: os dados fiscais não mudam (para refazer, exclua a nota)' using errcode = '22023'; end if;
  if new.situacao is distinct from old.situacao and not (old.situacao = 'autorizada' and new.situacao = 'cancelada') then
    raise exception 'nota conferida: a única mudança de situação permitida é de autorizada para cancelada' using errcode = '22023'; end if;
  return new;
end $$;
revoke all on function public.notas_fiscais_congelar() from public, anon;
drop trigger if exists notas_fiscais_congelar on public.notas_fiscais;
create trigger notas_fiscais_congelar before update on public.notas_fiscais for each row execute function public.notas_fiscais_congelar();

/* itens: com a nota conferida, nada entra, muda nem sai. Se o pai já não existe (cascata da exclusão da nota), passa. Administração passa. */
create or replace function public.notas_fiscais_itens_congelar() returns trigger
  language plpgsql security invoker set search_path = '' as $$
declare v_conf timestamptz;
begin
  if (select auth.uid()) is null then return case when tg_op = 'DELETE' then old else new end; end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select n.conferida_em into v_conf from public.notas_fiscais n where n.id = new.nota_id;
    if v_conf is not null then raise exception 'nota conferida: os itens não mudam' using errcode = '22023'; end if;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    select n.conferida_em into v_conf from public.notas_fiscais n where n.id = old.nota_id;
    if v_conf is not null then raise exception 'nota conferida: os itens não mudam' using errcode = '22023'; end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function public.notas_fiscais_itens_congelar() from public, anon;
drop trigger if exists notas_fiscais_itens_congelar on public.notas_fiscais_itens;
create trigger notas_fiscais_itens_congelar before insert or update or delete on public.notas_fiscais_itens for each row execute function public.notas_fiscais_itens_congelar();

/* documentos: o REGISTRO do original só entra numa nota ainda não conferida e nunca muda nem sai sozinho; só some junto com a nota (cascata: o pai já não existe) */
create or replace function public.notas_fiscais_docs_imutavel() returns trigger
  language plpgsql security invoker set search_path = '' as $$
declare v_conf timestamptz;
begin
  if (select auth.uid()) is null then return case when tg_op = 'DELETE' then old else new end; end if;
  if tg_op = 'INSERT' then
    select n.conferida_em into v_conf from public.notas_fiscais n where n.id = new.nota_id;
    if v_conf is not null then raise exception 'nota conferida: não entram documentos' using errcode = '22023'; end if;
    return new;
  end if;
  if exists (select 1 from public.notas_fiscais n where n.id = old.nota_id) then
    raise exception 'documento original: o registro não muda nem sai sozinho (para remover, exclua a nota)' using errcode = '22023'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function public.notas_fiscais_docs_imutavel() from public, anon;
drop trigger if exists notas_fiscais_docs_imutavel on public.notas_fiscais_docs;
create trigger notas_fiscais_docs_imutavel before insert or update or delete on public.notas_fiscais_docs for each row execute function public.notas_fiscais_docs_imutavel();

-- 5) Auxiliares da gravação -----------------------------------------------------------------------------------------------------------------------
/* a nota que já existe (e por quê): mesmo id, mesma chave ou mesmo arquivo. Só enxerga a própria casa (RLS). Volátil: cada consulta lê o estado de agora. */
create or replace function public.nota_fiscal_existente(p_id uuid, p_chave text, p_sha text) returns jsonb
  language plpgsql security invoker set search_path = '' as $$
declare v uuid;
begin
  select n.id into v from public.notas_fiscais n where n.id = p_id;
  if found then return jsonb_build_object('id', v, 'motivo', 'id'); end if;
  if p_chave is not null then
    select n.id into v from public.notas_fiscais n where n.chave = p_chave;
    if found then return jsonb_build_object('id', v, 'motivo', 'chave'); end if;
  end if;
  select d.nota_id into v from public.notas_fiscais_docs d where d.sha256 = p_sha;
  if found then return jsonb_build_object('id', v, 'motivo', 'arquivo'); end if;
  return null;
end $$;
revoke all on function public.nota_fiscal_existente(uuid, text, text) from public, anon;
grant execute on function public.nota_fiscal_existente(uuid, text, text) to authenticated;

/* os caminhos enviados que NÃO estão registrados em nenhum documento: só estes o site pode apagar */
create or replace function public.nota_fiscal_sem_registro(p_paths text[]) returns jsonb
  language sql security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(p), '[]'::jsonb) from unnest(p_paths) as t(p) where not exists (select 1 from public.notas_fiscais_docs d where d.path = t.p)
$$;
revoke all on function public.nota_fiscal_sem_registro(text[]) from public, anon;
grant execute on function public.nota_fiscal_sem_registro(text[]) to authenticated;

-- 6) nota_fiscal_salvar (nesta etapa: SÓ XML, exatamente 1 documento). A conferência é o ÚLTIMO passo. Limites = capacidade das colunas. ------------
create or replace function public.nota_fiscal_salvar(p_nota jsonb, p_itens jsonb, p_docs jsonb, p_conferir boolean)
  returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  m2 constant numeric := 9999999999.99;       -- numeric(12,2)
  m4 constant numeric := 9999999999.9999;     -- numeric(14,4)
  campos constant text[] := array['id','modelo','chave','numero','serie','data_emissao','emitente_nome','emitente_cnpj','emitente_uf','tp_emis','situacao',
    'situacao_evidencia','protocolo','denegada','valor_produtos','valor_descontos','valor_frete','valor_outras','valor_impostos','valor_total','valor_a_pagar',
    'pagamentos','formato_origem','requer_conferencia','observacoes'];
  dinheiro constant text[] := array['valor_produtos','valor_descontos','valor_frete','valor_outras','valor_impostos','valor_total','valor_a_pagar'];
  campos_item constant text[] := array['codigo','descricao','qtd','unidade','unidade_original','unitario','total','desconto'];
  campos_pag  constant text[] := array['codigo','forma','valor','bandeira','final'];
  campos_doc  constant text[] := array['tipo','nome','path','mime','tamanho','sha256'];
  v_casa uuid; v_id uuid; v_k text; v_i jsonb; v_pags jsonb; v_d jsonb; v_meta jsonb; v_ex jsonb; v_sem jsonb := '[]'::jsonb; v_av jsonb := '[]'::jsonb;
  v_chave text; v_cnpj text; v_sha text; v_path text; v_pasta text; v_dt text; v_req boolean; v_soma numeric; v_vp numeric;
  v_paths text[]; v_travas bigint[]; v_lk bigint; v_tam_real bigint; v_mime_real text; v_fora boolean;
begin
  v_casa := public.dono_da_casa();
  if (select auth.uid()) is null or v_casa is null then raise exception 'nota_fiscal_salvar: faça login' using errcode = '42501'; end if;
  if not (select public.rac_aal_ok()) then raise exception 'nota_fiscal_salvar: confirme o código do app de segurança (MFA)' using errcode = '42501'; end if;
  if p_conferir is null then raise exception 'nota_fiscal_salvar: diga se a nota foi conferida' using errcode = '22023'; end if;
  perform public.nf_v_campos(p_nota, campos, 'nota');
  if public.nf_v_texto(p_nota, 'id', true, 36, uuid_re) is null then raise exception 'nota_fiscal_salvar: identificador inválido' using errcode = '22023'; end if;
  v_id := (p_nota->>'id')::uuid;
  v_pasta := v_casa::text || '/notas-fiscais/' || v_id::text || '/';
  perform public.nf_v_texto(p_nota, 'modelo', true, 2, '^(55|65)$');
  perform public.nf_v_texto(p_nota, 'formato_origem', true, 3, '^xml$');             -- nesta etapa só XML
  v_chave := public.nf_v_texto(p_nota, 'chave', false, 44, '^\d{44}$');
  if v_chave is not null and not public.nf_chave_dv_ok(v_chave) then raise exception 'nota_fiscal_salvar: a chave de acesso não passa no dígito verificador' using errcode = '22023'; end if;
  perform public.nf_v_texto(p_nota, 'numero', false, 9, '^\d{1,9}$');
  perform public.nf_v_texto(p_nota, 'serie', false, 3, '^\d{1,3}$');
  v_dt := public.nf_v_texto(p_nota, 'data_emissao', false, 10, '^\d{4}-\d{2}-\d{2}$');
  if v_dt is not null and (v_dt::date < date '1995-01-01' or v_dt::date > current_date + 1) then raise exception 'nota_fiscal_salvar: a data está fora do esperado' using errcode = '22023'; end if;
  perform public.nf_v_texto(p_nota, 'emitente_nome', false, 120, null);
  v_cnpj := public.nf_v_texto(p_nota, 'emitente_cnpj', false, 14, '^\d{14}$');
  if v_cnpj is not null and not public.nf_cnpj_ok(v_cnpj) then raise exception 'nota_fiscal_salvar: CNPJ do emitente inválido' using errcode = '22023'; end if;
  perform public.nf_v_texto(p_nota, 'emitente_uf', false, 2, '^[A-Z]{2}$');
  perform public.nf_v_num(p_nota, 'tp_emis', false, 1, 9, 0);
  perform public.nf_v_texto(p_nota, 'situacao', true, 12, '^(autorizada|contingencia|pendente|rejeitada|cancelada)$');
  perform public.nf_v_texto(p_nota, 'situacao_evidencia', false, 200, null);
  perform public.nf_v_texto(p_nota, 'protocolo', false, 15, '^\d{15}$');
  perform public.nf_v_bool(p_nota, 'denegada', false);
  v_req := public.nf_v_bool(p_nota, 'requer_conferencia', true);
  perform public.nf_v_texto(p_nota, 'observacoes', false, 500, null);
  foreach v_k in array dinheiro loop perform public.nf_v_num(p_nota, v_k, v_k = 'valor_total', 0, m2, 2); end loop;
  v_vp := public.nf_v_num(p_nota, 'valor_produtos', false, 0, m2, 2);
  if p_nota ? 'pagamentos' and jsonb_typeof(p_nota->'pagamentos') not in ('array', 'null') then raise exception 'nota_fiscal_salvar: pagamentos precisa ser uma lista' using errcode = '22023'; end if;
  v_pags := case when jsonb_typeof(p_nota->'pagamentos') = 'array' then p_nota->'pagamentos' else '[]'::jsonb end;
  if jsonb_array_length(v_pags) > 10 then raise exception 'nota_fiscal_salvar: pagamentos demais (máximo 10)' using errcode = '22023'; end if;
  for v_i in select e from jsonb_array_elements(v_pags) e loop
    perform public.nf_v_campos(v_i, campos_pag, 'pagamento');
    perform public.nf_v_texto(v_i, 'codigo', false, 2, '^\d{2}$'); perform public.nf_v_texto(v_i, 'forma', false, 40, null);
    perform public.nf_v_num(v_i, 'valor', true, 0, m2, 2); perform public.nf_v_texto(v_i, 'bandeira', false, 30, null);
    perform public.nf_v_texto(v_i, 'final', false, 4, '^\d{4}$');
  end loop;
  /* nota sem chave: só pendente (a tabela já exige requer_conferencia) e NUNCA conferida na gravação; a conferência é um ato posterior e explícito */
  if v_chave is null and (v_req is not true or p_conferir) then
    raise exception 'nota_fiscal_salvar: nota sem chave fica pendente (requer_conferencia verdadeiro) e só é conferida depois' using errcode = '22023'; end if;

  /* itens: 1 a 990. A soma dos itens contra o total NÃO bloqueia: vira aviso. */
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) not between 1 and 990 then raise exception 'nota_fiscal_salvar: a nota precisa de 1 a 990 itens' using errcode = '22023'; end if;
  for v_i in select e from jsonb_array_elements(p_itens) e loop
    perform public.nf_v_campos(v_i, campos_item, 'item');
    perform public.nf_v_texto(v_i, 'descricao', true, 200, null); perform public.nf_v_texto(v_i, 'codigo', false, 60, null);
    perform public.nf_v_num(v_i, 'qtd', true, 0.0001, m4, 4);
    perform public.nf_v_texto(v_i, 'unidade', false, 5, '^(un|pc|cx|pct|par|kg|g|l|ml|m|outra)$'); perform public.nf_v_texto(v_i, 'unidade_original', false, 20, null);
    perform public.nf_v_num(v_i, 'unitario', false, 0, m4, 4); perform public.nf_v_num(v_i, 'total', true, 0, m2, 2); perform public.nf_v_num(v_i, 'desconto', false, 0, m2, 2);
  end loop;
  select sum((e->>'total')::numeric) into v_soma from jsonb_array_elements(p_itens) e;
  if v_vp is not null and abs(v_soma - v_vp) > 0.05 then
    v_av := v_av || to_jsonb('A soma dos itens (' || v_soma || ') difere do valor dos produtos da nota (' || v_vp || ').'); end if;

  /* o original: exatamente 1 XML, no caminho EXATO <dono>/notas-fiscais/<nota>/<sha256>.xml, no cofre "familia", batendo com o objeto real */
  if jsonb_typeof(p_docs) is distinct from 'array' or jsonb_array_length(p_docs) <> 1 then raise exception 'nota_fiscal_salvar: nesta etapa a nota tem exatamente 1 documento (o XML original)' using errcode = '22023'; end if;
  v_d := p_docs->0;
  perform public.nf_v_campos(v_d, campos_doc, 'documento');
  perform public.nf_v_texto(v_d, 'tipo', true, 3, '^xml$'); perform public.nf_v_texto(v_d, 'nome', true, 200, null);
  perform public.nf_v_texto(v_d, 'mime', true, 100, '^(text/xml|application/xml)$');
  perform public.nf_v_num(v_d, 'tamanho', true, 1, 2097152, 0);
  v_sha := public.nf_v_texto(v_d, 'sha256', true, 64, '^[0-9a-f]{64}$');
  v_path := public.nf_v_texto(v_d, 'path', true, 300, null);
  if v_path <> v_pasta || v_sha || '.xml' then raise exception 'nota_fiscal_salvar: o caminho do documento precisa ser exatamente <dono>/notas-fiscais/<nota>/<sha256>.xml' using errcode = '22023'; end if;
  v_paths := array[v_path];
  /* a linha ATUAL do nome (a não arquivada, depois a mais recente). Marcador de exclusão e objeto arquivado contam como "não está no cofre". Lido por to_jsonb(o)->>'coluna' para não
     depender de colunas de versionamento: se a coluna não existir, vem nulo. Em produção o bucket familia não usa versionamento (conferido: DISABLED, 0 marcadores, 0 arquivados). */
  select o.metadata, coalesce((to_jsonb(o)->>'is_delete_marker')::boolean, false) or (to_jsonb(o)->>'archived_at') is not null into v_meta, v_fora
    from storage.objects o where o.bucket_id = 'familia' and o.name = v_path
    order by ((to_jsonb(o)->>'archived_at') is not null), o.created_at desc limit 1;
  if not found or v_fora then raise exception 'nota_fiscal_salvar: o arquivo não está no cofre' using errcode = '22023'; end if;
  /* o Storage TEM de informar tamanho (inteiro) e tipo do objeto, e os dois têm de bater com o declarado: ausente ou inválido é RECUSADO (nada passa em silêncio) */
  v_tam_real := case when jsonb_typeof(v_meta->'size') = 'number' and (v_meta->>'size') ~ '^\d+$' then (v_meta->>'size')::bigint end;
  if v_tam_real is null then raise exception 'nota_fiscal_salvar: o Storage não informou o tamanho do arquivo (metadata.size ausente ou inválido)' using errcode = '22023'; end if;
  if v_tam_real <> (v_d->>'tamanho')::bigint then raise exception 'nota_fiscal_salvar: o tamanho informado (%) não bate com o arquivo no cofre (%)', v_d->>'tamanho', v_tam_real using errcode = '22023'; end if;
  v_mime_real := case when jsonb_typeof(v_meta->'mimetype') = 'string' then lower(btrim(split_part(v_meta->>'mimetype', ';', 1))) end;
  if v_mime_real is null or v_mime_real = '' then raise exception 'nota_fiscal_salvar: o Storage não informou o tipo do arquivo (metadata.mimetype ausente)' using errcode = '22023'; end if;
  if v_mime_real <> lower(v_d->>'mime') then raise exception 'nota_fiscal_salvar: o tipo informado (%) não bate com o arquivo no cofre (%)', v_d->>'mime', v_mime_real using errcode = '22023'; end if;

  /* concorrência: chave, arquivo e id, por casa, sempre em ordem crescente (sem deadlock). Os índices únicos seguem como última barreira. */
  select coalesce(array_agg(t.k order by t.k), '{}') into v_travas from (select distinct x.k from unnest(array[
      case when v_chave is not null then public.nf_trava(v_casa::text || ':chave:' || v_chave) end,
      public.nf_trava(v_casa::text || ':sha:' || v_sha), public.nf_trava(v_casa::text || ':id:' || v_id::text)]) as x(k) where x.k is not null) t;
  foreach v_lk in array v_travas loop perform pg_advisory_xact_lock(v_lk); end loop;

  v_ex := public.nota_fiscal_existente(v_id, v_chave, v_sha);
  if v_ex is not null then
    return jsonb_build_object('id', (v_ex->>'id')::uuid, 'criado', false, 'ja_existia', (v_ex->>'motivo') = 'id', 'duplicada', (v_ex->>'motivo') <> 'id',
      'motivo', v_ex->>'motivo', 'docs_para_apagar', public.nota_fiscal_sem_registro(v_paths));
  end if;
  if v_chave is null and v_cnpj is not null and (p_nota->>'numero') is not null and (p_nota->>'serie') is not null then
    select coalesce(jsonb_agg(n.id), '[]'::jsonb) into v_sem from public.notas_fiscais n
      where n.emitente_cnpj = v_cnpj and n.modelo = p_nota->>'modelo' and n.serie = p_nota->>'serie' and n.numero = p_nota->>'numero';
    if jsonb_array_length(v_sem) > 0 then v_av := v_av || to_jsonb('Já existe nota com o mesmo emitente, modelo, série e número: confira antes de conferir esta.'::text); end if;
  end if;

  begin     -- subtransação (savepoint): se algo falhar aqui dentro, nada do que foi gravado nesta chamada fica
    insert into public.notas_fiscais (id, modelo, chave, numero, serie, data_emissao, emitente_nome, emitente_cnpj, emitente_uf, tp_emis, situacao, situacao_evidencia,
      protocolo, denegada, valor_produtos, valor_descontos, valor_frete, valor_outras, valor_impostos, valor_total, valor_a_pagar, pagamentos, formato_origem,
      requer_conferencia, observacoes)
    values (v_id, p_nota->>'modelo', v_chave, p_nota->>'numero', p_nota->>'serie', v_dt::date, p_nota->>'emitente_nome', v_cnpj, p_nota->>'emitente_uf',
      (p_nota->>'tp_emis')::smallint, p_nota->>'situacao', p_nota->>'situacao_evidencia', p_nota->>'protocolo', coalesce((p_nota->>'denegada')::boolean, false),
      (p_nota->>'valor_produtos')::numeric, (p_nota->>'valor_descontos')::numeric, (p_nota->>'valor_frete')::numeric, (p_nota->>'valor_outras')::numeric,
      (p_nota->>'valor_impostos')::numeric, (p_nota->>'valor_total')::numeric, (p_nota->>'valor_a_pagar')::numeric, v_pags, 'xml', v_req, p_nota->>'observacoes');
    insert into public.notas_fiscais_itens (nota_id, ordem, descricao, codigo, qtd, unidade, unidade_original, unitario, total, desconto)
      select v_id, (e.n - 1)::integer, btrim(e.v->>'descricao'), e.v->>'codigo', (e.v->>'qtd')::numeric, coalesce(e.v->>'unidade', 'un'), e.v->>'unidade_original',
             (e.v->>'unitario')::numeric, (e.v->>'total')::numeric, coalesce((e.v->>'desconto')::numeric, 0)
        from jsonb_array_elements(p_itens) with ordinality as e(v, n);
    insert into public.notas_fiscais_docs (nota_id, tipo, nome, path, mime, tamanho, sha256)
      values (v_id, 'xml', v_d->>'nome', v_path, v_d->>'mime', (v_d->>'tamanho')::bigint, v_sha);
    /* a conferência vem POR ÚLTIMO: depois dela itens e documentos congelam. O gatilho define quem (auth.uid()) e quando (now()). */
    if p_conferir then update public.notas_fiscais set conferida_em = now() where id = v_id; end if;
  exception when unique_violation then
    v_ex := public.nota_fiscal_existente(v_id, v_chave, v_sha);     -- quem chegou antes já fechou: leia o vencedor
    if v_ex is null then raise; end if;                              -- outra violação única: não esconder
    return jsonb_build_object('id', (v_ex->>'id')::uuid, 'criado', false, 'ja_existia', (v_ex->>'motivo') = 'id', 'duplicada', (v_ex->>'motivo') <> 'id',
      'motivo', v_ex->>'motivo', 'docs_para_apagar', public.nota_fiscal_sem_registro(v_paths));
  end;
  return jsonb_build_object('id', v_id, 'criado', true, 'itens', jsonb_array_length(p_itens), 'docs_gravados', 1, 'conferida', p_conferir, 'avisos', v_av, 'semelhantes', v_sem);
end $$;
revoke all on function public.nota_fiscal_salvar(jsonb, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.nota_fiscal_salvar(jsonb, jsonb, jsonb, boolean) to authenticated;

-- 7) Conferir depois (nota pendente, inclusive sem chave): ação explícita --------------------------------------------------------------------------
create or replace function public.nota_fiscal_conferir(p_id uuid) returns jsonb
  language plpgsql security invoker set search_path = '' as $$
declare v public.notas_fiscais%rowtype;
begin
  if (select auth.uid()) is null or public.dono_da_casa() is null then raise exception 'nota_fiscal_conferir: faça login' using errcode = '42501'; end if;
  if not (select public.rac_aal_ok()) then raise exception 'nota_fiscal_conferir: confirme o código do app de segurança (MFA)' using errcode = '42501'; end if;
  select * into v from public.notas_fiscais where id = p_id for update;      -- só acha nota da própria casa (RLS); duas conferências simultâneas se enfileiram
  if not found then raise exception 'nota_fiscal_conferir: nota não encontrada' using errcode = 'P0002'; end if;
  if v.conferida_em is not null then return jsonb_build_object('id', p_id, 'ja_conferida', true, 'conferida_por', v.conferida_por, 'conferida_em', v.conferida_em); end if;
  update public.notas_fiscais set conferida_em = now() where id = p_id;      -- o gatilho exige itens e documento e define quem e quando
  select * into v from public.notas_fiscais where id = p_id;
  return jsonb_build_object('id', p_id, 'ja_conferida', false, 'conferida_por', v.conferida_por, 'conferida_em', v.conferida_em);
end $$;
revoke all on function public.nota_fiscal_conferir(uuid) from public, anon;
grant execute on function public.nota_fiscal_conferir(uuid) to authenticated;

-- 8) Storage: enquanto um arquivo está REGISTRADO em notas_fiscais_docs (nota pendente ou conferida) ele não se substitui, não se move e não se apaga direto. ----
--    Políticas RESTRITIVAS: somam-se (AND) a "familia da casa", "backups do dono" e "mfa cofres" (conferidas em produção); nada é afrouxado. Pasta: <dono>/notas-fiscais/<nota>/
--    (segmento 2). Fora dessa pasta (Compras, Eddie, Olivia...) as condições são verdadeiras: nada muda. Arquivo ainda NÃO registrado segue livre (inclusive para o Storage finalizar
--    o envio com um UPDATE feito com o papel de quem enviou, se a versão do Storage fizer isso) e apagável pelo site (limpeza de envio que falhou).
--    Para remover um registrado: excluir a nota (a cascata leva os registros) e só então o arquivo. O comportamento real destas duas políticas só se prova no Supabase.
drop policy if exists "nf original nao substitui" on storage.objects;
create policy "nf original nao substitui" on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'familia' or (storage.foldername(name))[2] is distinct from 'notas-fiscais'
         or not exists (select 1 from public.notas_fiscais_docs d where d.path = name))
  with check (bucket_id <> 'familia' or (storage.foldername(name))[2] is distinct from 'notas-fiscais'
         or not exists (select 1 from public.notas_fiscais_docs d where d.path = name));
drop policy if exists "nf original registrado nao apaga" on storage.objects;
create policy "nf original registrado nao apaga" on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'familia' or (storage.foldername(name))[2] is distinct from 'notas-fiscais'
         or not exists (select 1 from public.notas_fiscais_docs d where d.path = name));

commit;

notify pgrst, 'reload schema';
