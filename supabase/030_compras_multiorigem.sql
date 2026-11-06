-- status: pendente (preparado no repositório; ainda não rodou no banco — tire esta linha depois de rodar e conferir)
-- Compras multiorigem, importação do histórico e gravação atômica (docs/compras.md, Lote 3). Rode depois do 026/027 e, logo em seguida,
-- o 022 de novo (ele inclui as tabelas novas na trava da 2ª etapa e na auditoria). Pode rodar de novo sem estragar nada.
-- PENDENTE DE REVISÃO: preparado no repositório; não foi executado em nenhum banco.
--
-- O que muda (só soma; nenhum dado existente é alterado):
-- • compras_online ganha canal, natureza, historico, importacao_id e impostos_info. Todas nascem vazias/falsas: registro antigo continua
--   sem canal (o site deduz pela loja) e com historico = false, ou seja, com o MESMO tratamento financeiro de hoje. Nada é preenchido
--   por UPDATE: nenhuma compra antiga vira "referência" sem evidência.
-- • compras_online_itens ganha natureza, total_linha e situacao (necessários para separar digital e físico dentro do mesmo pedido).
-- • compras_importacoes controla cada importação do histórico (sem dado pessoal; só o nome lógico do arquivo e contagens).
-- • compras_gravar grava a compra, os produtos e os documentos numa transação só (substitui a sequência de chamadas do site).
-- Visibilidade: segue a regra da casa de sempre (Rayner e Fernanda). NÃO há coluna de visibilidade: a decisão sobre mostrar ou não o
-- histórico da Amazon para a Fernanda continua pendente.
begin;

-- 1) Controle das importações ---------------------------------------------------------------------------------------------------
-- resumo_erros guarda só {linha, motivo, arquivo}: motivo é texto curto do vocabulário do leitor (nunca o conteúdo da linha).
create or replace function public.compras_resumo_erros_ok(j jsonb) returns boolean
  language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(j) <> 'array' then false
    when jsonb_array_length(j) > 200 or pg_column_size(j) > 40000 then false
    else not exists (
      select 1 from jsonb_array_elements(j) e
       where case when jsonb_typeof(e) <> 'object' then true
                  else exists (select 1 from jsonb_object_keys(e) k where k not in ('linha', 'motivo', 'arquivo'))
                    or jsonb_typeof(e->'motivo') is distinct from 'string' or length(e->>'motivo') > 120 or (e->>'motivo') ~ '@|\d{5,}'
                    or (e ? 'linha' and jsonb_typeof(e->'linha') <> 'number')
                    or (e ? 'arquivo' and (jsonb_typeof(e->'arquivo') <> 'string' or length(e->>'arquivo') > 120 or (e->>'arquivo') ~ '@|\d{5,}'))
             end)
  end
$$;
revoke all on function public.compras_resumo_erros_ok(jsonb) from public, anon;
grant execute on function public.compras_resumo_erros_ok(jsonb) to authenticated;

create table if not exists public.compras_importacoes (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default public.dono_da_casa() references auth.users(id) on delete cascade,
  origem                text not null check (origem in ('amazon_csv', 'amazon_zip', 'outra')),
  nome_logico           text not null check (length(nome_logico) between 1 and 120 and nome_logico !~ '[/\\]'),   -- nome, nunca o caminho do aparelho
  sha256                text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),                              -- do CSV sanitizado; o mesmo arquivo não entra duas vezes
  importado_em          timestamptz not null default now(),
  pedidos_processados   integer not null default 0 check (pedidos_processados >= 0),
  pedidos_gravados      integer not null default 0 check (pedidos_gravados >= 0),
  registros_rejeitados  integer not null default 0 check (registros_rejeitados >= 0),
  estado                text not null default 'em_andamento' check (estado in ('em_andamento', 'concluida', 'concluida_com_erros', 'falhou', 'cancelada')),
  resumo_erros          jsonb not null default '[]'::jsonb check (public.compras_resumo_erros_ok(resumo_erros)),
  criado_por            uuid default auth.uid() references auth.users(id) on delete set null,
  atualizado_em         timestamptz,
  constraint compras_importacoes_gravados_ok check (pedidos_gravados <= pedidos_processados)
);
create index if not exists compras_importacoes_data on public.compras_importacoes (user_id, importado_em desc);
create unique index if not exists compras_importacoes_arquivo_unico on public.compras_importacoes (user_id, sha256) where sha256 is not null;

-- 2) Colunas novas em compras_online -----------------------------------------------------------------------------------------------
alter table public.compras_online add column if not exists canal text;
alter table public.compras_online add column if not exists natureza text;
alter table public.compras_online add column if not exists historico boolean not null default false;
alter table public.compras_online add column if not exists importacao_id uuid references public.compras_importacoes(id) on delete set null;
alter table public.compras_online add column if not exists impostos_info numeric(12,2);   -- informativo (ex.: tributos da nota); NÃO entra na conta do total

alter table public.compras_online drop constraint if exists compras_online_canal_check;
alter table public.compras_online add constraint compras_online_canal_check
  check (canal is null or canal in ('amazon', 'shopee', 'mercado_livre', 'outro_marketplace', 'presencial'));
alter table public.compras_online drop constraint if exists compras_online_natureza_check;
alter table public.compras_online add constraint compras_online_natureza_check
  check (natureza is null or natureza in ('fisica', 'digital', 'mista', 'indefinida'));
alter table public.compras_online drop constraint if exists compras_online_impostos_info_check;
alter table public.compras_online add constraint compras_online_impostos_info_check check (impostos_info is null or impostos_info >= 0);
/* o canal combina com a loja (a loja segue como está; presencial usa "outra" e o nome da loja em vendedor) */
alter table public.compras_online drop constraint if exists compras_online_canal_loja_ok;
alter table public.compras_online add constraint compras_online_canal_loja_ok check (canal is null
  or (canal = 'amazon' and loja = 'amazon') or (canal = 'shopee' and loja = 'shopee') or (canal = 'mercado_livre' and loja = 'mercadolivre')
  or (canal = 'outro_marketplace' and loja in ('magalu', 'outra')) or (canal = 'presencial' and loja = 'outra'));
/* histórico só existe para a Amazon e só com a natureza identificada (física, digital, mista ou indefinida) */
alter table public.compras_online drop constraint if exists compras_online_historico_ok;
alter table public.compras_online add constraint compras_online_historico_ok check (not historico or coalesce(canal = 'amazon' and natureza is not null, false));   -- coalesce: NULL passaria no CHECK
/* a origem (como o dado entrou) ganha "historico_amazon"; as antigas continuam valendo */
alter table public.compras_online drop constraint if exists compras_online_origem_check;
alter table public.compras_online add constraint compras_online_origem_check
  check (origem in ('manual', 'pdf', 'xml', 'csv', 'email', 'imagem', 'zip', 'historico_amazon'));

/* status do pedido (compras_online.status, texto livre até aqui): os valores antigos continuam valendo (vazio = confirmada pelo dono,
   cancelado, cancelamento_informado, reembolso_informado) e entram os do leitor da Amazon: concluido, autorizado, cancelado, desconhecido.
   Para o site, autorizado e desconhecido são PENDENTES (fora das despesas); só concluido/vazio/informado contabilizam, e histórico exige status explícito.
   NOT VALID: vale para toda linha nova ou alterada, sem reexaminar as antigas (o dono pode rodar "validate constraint" depois de conferir os dados). */
alter table public.compras_online drop constraint if exists compras_online_status_vocab;
alter table public.compras_online add constraint compras_online_status_vocab
  check (status is null or status in ('concluido', 'autorizado', 'cancelado', 'desconhecido', 'cancelamento_informado', 'reembolso_informado')) not valid;
alter table public.compras_online drop constraint if exists compras_online_historico_status;
alter table public.compras_online add constraint compras_online_historico_status
  check (not historico or coalesce(status in ('concluido', 'autorizado', 'cancelado', 'desconhecido'), false));   -- coalesce: status vazio não passa

create index if not exists compras_online_canal_data on public.compras_online (user_id, canal, data desc) where canal is not null;
create index if not exists compras_online_importacao on public.compras_online (importacao_id) where importacao_id is not null;

-- 3) Colunas novas nos produtos ----------------------------------------------------------------------------------------------------------
alter table public.compras_online_itens add column if not exists natureza text;
alter table public.compras_online_itens add column if not exists total_linha numeric(12,2);   -- o "Total Amount" da linha (com imposto, frete e desconto)
alter table public.compras_online_itens add column if not exists situacao text;
alter table public.compras_online_itens drop constraint if exists compras_online_itens_natureza_check;
alter table public.compras_online_itens add constraint compras_online_itens_natureza_check check (natureza is null or natureza in ('fisica', 'digital', 'indefinida'));
alter table public.compras_online_itens drop constraint if exists compras_online_itens_total_linha_check;
alter table public.compras_online_itens add constraint compras_online_itens_total_linha_check check (total_linha is null or total_linha >= 0);
alter table public.compras_online_itens drop constraint if exists compras_online_itens_situacao_check;
alter table public.compras_online_itens add constraint compras_online_itens_situacao_check
  check (situacao is null or situacao in ('concluido', 'autorizado', 'cancelado', 'desconhecido'));

-- 4) Proteção contra UPDATE direto: dono, origem, histórico e importação não mudam depois de gravados (o valor de antes é mantido em
--    silêncio, como no pedidos_protegidos do 027, para não quebrar a restauração do backup, que troca linhas inteiras).
create or replace function public.compras_online_protegidos() returns trigger
  language plpgsql security invoker set search_path = '' as $$
begin
  new.user_id := old.user_id; new.criado_por := old.criado_por; new.criado_em := old.criado_em;
  new.origem := old.origem; new.historico := old.historico; new.importacao_id := old.importacao_id;
  return new;
end $$;
revoke all on function public.compras_online_protegidos() from public, anon;
drop trigger if exists compras_online_protegidos on public.compras_online;
create trigger compras_online_protegidos before update on public.compras_online for each row execute function public.compras_online_protegidos();

-- 5) Segurança por linha das importações: a casa, mais a trava da 2ª etapa --------------------------------------------------------------
alter table public.compras_importacoes enable row level security;
drop policy if exists "casa" on public.compras_importacoes;
create policy "casa" on public.compras_importacoes for all to authenticated
  using (user_id = public.dono_da_casa()) with check (user_id = public.dono_da_casa());
drop policy if exists "mfa" on public.compras_importacoes;
create policy "mfa" on public.compras_importacoes as restrictive for all to authenticated
  using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok()));
grant select, insert, update, delete on public.compras_importacoes to authenticated;
revoke all on public.compras_importacoes from anon;
grant select on public.compras_importacoes to service_role;

-- 6) compras_gravar: a compra, os produtos e os documentos numa transação só -------------------------------------------------------------
-- Antes: o site gravava a compra, depois os produtos e depois cada documento, em chamadas separadas; uma falha no meio deixava compra sem
-- produtos ou documento sem compra. Agora o site (1) envia os arquivos originais para o cofre privado "familia", na pasta
-- <dono>/compras/<compra>/ e (2) chama esta função UMA vez. Qualquer erro desfaz tudo; se falhar, o site apaga os arquivos que enviou.
--
-- Segurança:
-- • security invoker: roda como quem chamou, então valem a regra "casa" (dono_da_casa()) e a trava restritiva "mfa" (022) nas três tabelas.
-- • search_path vazio e nomes completos; só quem fez login executa (anon e public perdem o EXECUTE).
-- • Campos que o site não manda: user_id, criado_por, criado_em, versoes, atualizado_em (o banco preenche). Campo desconhecido dá erro.
-- • Na edição, origem, historico e importacao_id não mudam (podem vir no JSON, desde que iguais ao gravado). A importação referida precisa ser da mesma casa.
-- • Documento: o caminho tem de estar na pasta desta compra e o arquivo tem de existir no cofre "familia" (sem linha apontando para o nada).
--   O conteúdo do arquivo nunca passa por aqui: só nome, tipo, tamanho, SHA-256 e o que foi extraído (já limpo pelo site).
-- • Documento repetido (mesmo SHA-256) não vira linha: o caminho volta em docs_repetidos para o site apagar o arquivo duplicado.
-- • Só documentos: na edição, sem produtos (p_itens nulo) e com p_compra só com o id, a função apenas anexa documentos.
create or replace function public.compras_gravar(p_compra jsonb, p_itens jsonb, p_docs jsonb, p_novo boolean)
  returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  campos constant text[] := array['id', 'loja', 'canal', 'natureza', 'historico', 'numero', 'data', 'vendedor', 'status', 'subtotal', 'desconto', 'frete',
    'taxas', 'impostos_info', 'total_pago', 'pagamento', 'categoria', 'recorrencia_texto', 'recorrencia_meses', 'recorrencia_status', 'chave_nfe',
    'numero_nf', 'emitente', 'cnpj', 'fora_das_contas', 'motivo_fora', 'divergencias', 'observacoes', 'origem', 'importacao_id'];
  texto_opc constant text[] := array['canal', 'natureza', 'vendedor', 'status', 'pagamento', 'categoria', 'recorrencia_texto', 'recorrencia_status',
    'chave_nfe', 'numero_nf', 'emitente', 'cnpj', 'motivo_fora', 'observacoes', 'origem'];
  dinheiro constant text[] := array['subtotal', 'desconto', 'frete', 'taxas', 'impostos_info', 'total_pago'];
  campos_item constant text[] := array['codigo', 'descricao', 'qtd', 'unitario', 'total', 'desconto', 'categoria', 'imagem_path', 'natureza', 'total_linha', 'situacao'];
  campos_doc constant text[] := array['tipo', 'nome', 'path', 'mime', 'tamanho', 'sha256', 'extraido'];
  tipos_doc constant text[] := array['resumo_pdf', 'danfe', 'nfe_xml', 'csv', 'zip', 'email_confirmacao', 'email_envio', 'email_entrega', 'email_pagamento',
    'email_cancelamento', 'email_reembolso', 'imagem', 'foto_produto', 'comprovante', 'outro'];
  v_casa uuid; v_id uuid; v_ant public.compras_online%rowtype; v_k text; v_v numeric; v_i jsonb; v_n integer; v_solo boolean;
  v_pasta text; v_versao jsonb; v_versoes jsonb; v_docs jsonb; v_todos text[] := '{}'; v_ok text[] := '{}'; v_rep text[];
begin
  v_casa := public.dono_da_casa();
  if (select auth.uid()) is null or v_casa is null then raise exception 'compras_gravar: faça login' using errcode = '42501'; end if;
  if p_novo is null then raise exception 'compras_gravar: diga se a compra é nova ou uma edição' using errcode = '22023'; end if;
  if p_compra is null or jsonb_typeof(p_compra) <> 'object' then raise exception 'compras_gravar: a compra precisa ser um objeto' using errcode = '22023'; end if;
  for v_k in select jsonb_object_keys(p_compra) loop
    if not v_k = any (campos) then raise exception 'compras_gravar: campo não permitido na compra: %', v_k using errcode = '22023'; end if;
  end loop;
  if jsonb_typeof(p_compra->'id') is distinct from 'string' or (p_compra->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'compras_gravar: identificador da compra inválido' using errcode = '22023'; end if;
  v_id := (p_compra->>'id')::uuid;
  v_solo := not p_novo and p_itens is null;
  if p_novo and p_itens is null then raise exception 'compras_gravar: a compra precisa de pelo menos um produto' using errcode = '22023'; end if;
  v_pasta := v_casa::text || '/compras/' || v_id::text || '/';

  /* ---- a compra e os produtos (fora do modo "só documentos") ---- */
  if v_solo then
    if (select count(*) from jsonb_object_keys(p_compra)) <> 1 then raise exception 'compras_gravar: para só anexar documentos mande apenas o id da compra' using errcode = '22023'; end if;
  else
    foreach v_k in array array['loja', 'numero', 'data'] loop
      if jsonb_typeof(p_compra->v_k) is distinct from 'string' then raise exception 'compras_gravar: falta o campo %', v_k using errcode = '22023'; end if;
    end loop;
    foreach v_k in array texto_opc loop
      if p_compra ? v_k and jsonb_typeof(p_compra->v_k) not in ('string', 'null') then raise exception 'compras_gravar: o campo % precisa ser texto', v_k using errcode = '22023'; end if;
    end loop;
    foreach v_k in array array['historico', 'fora_das_contas'] loop
      if p_compra ? v_k and jsonb_typeof(p_compra->v_k) not in ('boolean', 'null') then raise exception 'compras_gravar: o campo % precisa ser verdadeiro ou falso', v_k using errcode = '22023'; end if;
    end loop;
    if p_compra ? 'divergencias' and jsonb_typeof(p_compra->'divergencias') not in ('array', 'null') then raise exception 'compras_gravar: divergencias precisa ser uma lista' using errcode = '22023'; end if;
    if p_compra ? 'recorrencia_meses' and jsonb_typeof(p_compra->'recorrencia_meses') not in ('number', 'null') then raise exception 'compras_gravar: recorrencia_meses precisa ser número' using errcode = '22023'; end if;
    if p_compra ? 'importacao_id' and jsonb_typeof(p_compra->'importacao_id') not in ('string', 'null') then raise exception 'compras_gravar: importacao_id inválido' using errcode = '22023'; end if;
    if (p_compra->>'data') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'compras_gravar: data inválida' using errcode = '22023'; end if;
    if (p_compra->>'data')::date < date '1995-01-01' or (p_compra->>'data')::date > current_date + 1 then raise exception 'compras_gravar: a data está fora do esperado' using errcode = '22023'; end if;
    foreach v_k in array dinheiro loop
      if v_k in ('subtotal', 'total_pago') and jsonb_typeof(p_compra->v_k) is distinct from 'number' then raise exception 'compras_gravar: falta o valor de %', v_k using errcode = '22023'; end if;
      if p_compra ? v_k and jsonb_typeof(p_compra->v_k) not in ('number', 'null') then raise exception 'compras_gravar: % precisa ser número', v_k using errcode = '22023'; end if;
      v_v := (p_compra->>v_k)::numeric;
      if v_v is not null and (v_v < 0 or v_v > 1000000 or v_v <> round(v_v, 2)) then raise exception 'compras_gravar: valor inválido em %', v_k using errcode = '22023'; end if;
    end loop;
    if p_compra->>'importacao_id' is not null then
      if (p_compra->>'importacao_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'compras_gravar: importacao_id inválido' using errcode = '22023'; end if;
      /* a chave estrangeira não olha o RLS: só vale importação que a casa enxerga */
      if not exists (select 1 from public.compras_importacoes i where i.id = (p_compra->>'importacao_id')::uuid) then raise exception 'compras_gravar: importação não encontrada' using errcode = '22023'; end if;
    end if;

    if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then raise exception 'compras_gravar: a compra precisa de pelo menos um produto' using errcode = '22023'; end if;
    if jsonb_array_length(p_itens) > 200 then raise exception 'compras_gravar: produtos demais (máximo 200)' using errcode = '22023'; end if;
    v_n := 0;
    for v_i in select e from jsonb_array_elements(p_itens) e loop
      v_n := v_n + 1;
      if jsonb_typeof(v_i) <> 'object' then raise exception 'compras_gravar: o produto % precisa ser um objeto', v_n using errcode = '22023'; end if;
      for v_k in select jsonb_object_keys(v_i) loop
        if not v_k = any (campos_item) then raise exception 'compras_gravar: campo não permitido no produto %: %', v_n, v_k using errcode = '22023'; end if;
      end loop;
      if jsonb_typeof(v_i->'descricao') is distinct from 'string' or btrim(v_i->>'descricao') = '' then raise exception 'compras_gravar: falta o nome do produto %', v_n using errcode = '22023'; end if;
      foreach v_k in array array['codigo', 'categoria', 'imagem_path', 'natureza', 'situacao'] loop
        if v_i ? v_k and jsonb_typeof(v_i->v_k) not in ('string', 'null') then raise exception 'compras_gravar: o campo % do produto % precisa ser texto', v_k, v_n using errcode = '22023'; end if;
      end loop;
      foreach v_k in array array['qtd', 'unitario', 'desconto', 'total_linha'] loop
        if v_i ? v_k and jsonb_typeof(v_i->v_k) not in ('number', 'null') then raise exception 'compras_gravar: o campo % do produto % precisa ser número', v_k, v_n using errcode = '22023'; end if;
      end loop;
      if jsonb_typeof(v_i->'total') is distinct from 'number' then raise exception 'compras_gravar: falta o total do produto %', v_n using errcode = '22023'; end if;
      v_v := (v_i->>'total')::numeric;
      if v_v < 0 or v_v > 1000000 or v_v <> round(v_v, 2) then raise exception 'compras_gravar: total inválido no produto %', v_n using errcode = '22023'; end if;
      if coalesce((v_i->>'qtd')::numeric, 1) <= 0 or coalesce((v_i->>'qtd')::numeric, 1) > 100000 then raise exception 'compras_gravar: quantidade inválida no produto %', v_n using errcode = '22023'; end if;
      if v_i->>'imagem_path' is not null and (left(v_i->>'imagem_path', length(v_pasta)) <> v_pasta or position('..' in v_i->>'imagem_path') > 0 or length(v_i->>'imagem_path') > 300) then
        raise exception 'compras_gravar: imagem fora da pasta desta compra (produto %)', v_n using errcode = '22023'; end if;
    end loop;
  end if;

  /* ---- os documentos: conferidos antes de gravar qualquer coisa ---- */
  v_docs := coalesce(p_docs, '[]'::jsonb);
  if jsonb_typeof(v_docs) = 'null' then v_docs := '[]'::jsonb; end if;
  if jsonb_typeof(v_docs) <> 'array' or jsonb_array_length(v_docs) > 50 then raise exception 'compras_gravar: lista de documentos inválida (máximo 50)' using errcode = '22023'; end if;
  v_n := 0;
  for v_i in select e from jsonb_array_elements(v_docs) e loop
    v_n := v_n + 1;
    if jsonb_typeof(v_i) <> 'object' then raise exception 'compras_gravar: o documento % precisa ser um objeto', v_n using errcode = '22023'; end if;
    for v_k in select jsonb_object_keys(v_i) loop
      if not v_k = any (campos_doc) then raise exception 'compras_gravar: campo não permitido no documento %: %', v_n, v_k using errcode = '22023'; end if;
    end loop;
    foreach v_k in array array['tipo', 'nome', 'path', 'sha256'] loop
      if jsonb_typeof(v_i->v_k) is distinct from 'string' then raise exception 'compras_gravar: falta o campo % no documento %', v_k, v_n using errcode = '22023'; end if;
    end loop;
    if not (v_i->>'tipo') = any (tipos_doc) then raise exception 'compras_gravar: tipo de documento inválido (%)', v_n using errcode = '22023'; end if;
    if (v_i->>'sha256') !~ '^[0-9a-f]{64}$' then raise exception 'compras_gravar: SHA-256 inválido no documento %', v_n using errcode = '22023'; end if;
    if v_i ? 'tamanho' and jsonb_typeof(v_i->'tamanho') not in ('number', 'null') then raise exception 'compras_gravar: tamanho inválido no documento %', v_n using errcode = '22023'; end if;
    if v_i ? 'mime' and jsonb_typeof(v_i->'mime') not in ('string', 'null') then raise exception 'compras_gravar: mime inválido no documento %', v_n using errcode = '22023'; end if;
    if v_i ? 'extraido' and jsonb_typeof(v_i->'extraido') not in ('object', 'null') then raise exception 'compras_gravar: o extraído do documento % precisa ser um objeto', v_n using errcode = '22023'; end if;
    if left(v_i->>'path', length(v_pasta)) <> v_pasta or position('..' in v_i->>'path') > 0 or length(v_i->>'path') > 300 then
      raise exception 'compras_gravar: o documento % está fora da pasta desta compra', v_n using errcode = '22023'; end if;
    /* sem linha apontando para o nada: o arquivo precisa estar no cofre privado */
    if not exists (select 1 from storage.objects o where o.bucket_id = 'familia' and o.name = (v_i->>'path')) then
      raise exception 'compras_gravar: o arquivo do documento % não está no cofre', v_n using errcode = '22023'; end if;
    v_todos := v_todos || (v_i->>'path');
  end loop;

  /* ---- novo ou edição ---- */
  if p_novo then
    /* toque duplo: a mesma compra já gravada volta como está, sem gravar de novo */
    if exists (select 1 from public.compras_online where id = v_id) then return jsonb_build_object('id', v_id, 'criado', false, 'ja_existia', true, 'docs_gravados', 0, 'docs_repetidos', '[]'::jsonb); end if;
  else
    /* só acha compra da própria casa (RLS); trava a linha até o fim */
    select * into v_ant from public.compras_online where id = v_id for update;
    if not found then raise exception 'compras_gravar: compra não encontrada' using errcode = 'P0002'; end if;
    /* origem, histórico e importação não mudam na edição: o site pode mandar a linha inteira, desde que estes três venham iguais ao gravado */
    if p_compra ? 'origem' and (p_compra->>'origem') is distinct from v_ant.origem then
      raise exception 'compras_gravar: origem não muda na edição' using errcode = '22023'; end if;
    if p_compra ? 'historico' and coalesce((p_compra->>'historico')::boolean, false) is distinct from v_ant.historico then
      raise exception 'compras_gravar: historico não muda na edição' using errcode = '22023'; end if;
    if p_compra ? 'importacao_id' and (p_compra->>'importacao_id')::uuid is distinct from v_ant.importacao_id then
      raise exception 'compras_gravar: importacao_id não muda na edição' using errcode = '22023'; end if;
  end if;

  if not v_solo then
    if p_novo then
      insert into public.compras_online (id, loja, canal, natureza, historico, numero, data, vendedor, status, subtotal, desconto, frete, taxas, impostos_info,
        total_pago, pagamento, categoria, recorrencia_texto, recorrencia_meses, recorrencia_status, chave_nfe, numero_nf, emitente, cnpj, fora_das_contas,
        motivo_fora, divergencias, observacoes, origem, importacao_id)
      values (v_id, p_compra->>'loja', p_compra->>'canal', p_compra->>'natureza', coalesce((p_compra->>'historico')::boolean, false), p_compra->>'numero',
        (p_compra->>'data')::date, p_compra->>'vendedor', p_compra->>'status', (p_compra->>'subtotal')::numeric, coalesce((p_compra->>'desconto')::numeric, 0),
        coalesce((p_compra->>'frete')::numeric, 0), coalesce((p_compra->>'taxas')::numeric, 0), (p_compra->>'impostos_info')::numeric, (p_compra->>'total_pago')::numeric,
        p_compra->>'pagamento', p_compra->>'categoria', p_compra->>'recorrencia_texto', (p_compra->>'recorrencia_meses')::numeric, p_compra->>'recorrencia_status',
        p_compra->>'chave_nfe', p_compra->>'numero_nf', p_compra->>'emitente', p_compra->>'cnpj', coalesce((p_compra->>'fora_das_contas')::boolean, false),
        p_compra->>'motivo_fora', case when jsonb_typeof(p_compra->'divergencias') = 'array' then p_compra->'divergencias' else '[]'::jsonb end,
        p_compra->>'observacoes', coalesce(p_compra->>'origem', 'manual'), (p_compra->>'importacao_id')::uuid);
    else
      /* a versão anterior (o mesmo formato que o site já guardava); ficam as 10 últimas */
      v_versao := jsonb_strip_nulls(jsonb_build_object('em', coalesce(v_ant.atualizado_em, v_ant.criado_em), 'quando', now(), 'numero', v_ant.numero, 'data', v_ant.data,
        'subtotal', v_ant.subtotal, 'desconto', v_ant.desconto, 'frete', v_ant.frete, 'taxas', v_ant.taxas, 'total_pago', v_ant.total_pago,
        'pagamento', v_ant.pagamento, 'vendedor', v_ant.vendedor, 'categoria', v_ant.categoria))
        || jsonb_build_object('itens', (select coalesce(jsonb_agg(jsonb_build_object('descricao', it.descricao, 'qtd', it.qtd, 'total', it.total) order by it.ordem), '[]'::jsonb)
                                         from public.compras_online_itens it where it.compra_id = v_id));
      select coalesce(jsonb_agg(x.e order by x.n), '[]'::jsonb) into v_versoes
        from (select e, n from jsonb_array_elements(v_ant.versoes || jsonb_build_array(v_versao)) with ordinality as a(e, n) order by n desc limit 10) x;
      update public.compras_online set loja = p_compra->>'loja', canal = p_compra->>'canal', natureza = p_compra->>'natureza', numero = p_compra->>'numero',
        data = (p_compra->>'data')::date, vendedor = p_compra->>'vendedor', status = p_compra->>'status', subtotal = (p_compra->>'subtotal')::numeric,
        desconto = coalesce((p_compra->>'desconto')::numeric, 0), frete = coalesce((p_compra->>'frete')::numeric, 0), taxas = coalesce((p_compra->>'taxas')::numeric, 0),
        impostos_info = (p_compra->>'impostos_info')::numeric, total_pago = (p_compra->>'total_pago')::numeric, pagamento = p_compra->>'pagamento',
        categoria = p_compra->>'categoria', recorrencia_texto = p_compra->>'recorrencia_texto', recorrencia_meses = (p_compra->>'recorrencia_meses')::numeric,
        recorrencia_status = p_compra->>'recorrencia_status', chave_nfe = p_compra->>'chave_nfe', numero_nf = p_compra->>'numero_nf', emitente = p_compra->>'emitente',
        cnpj = p_compra->>'cnpj', fora_das_contas = coalesce((p_compra->>'fora_das_contas')::boolean, false), motivo_fora = p_compra->>'motivo_fora',
        divergencias = case when jsonb_typeof(p_compra->'divergencias') = 'array' then p_compra->'divergencias' else '[]'::jsonb end,
        observacoes = p_compra->>'observacoes', versoes = v_versoes, atualizado_em = now()
      where id = v_id;
      delete from public.compras_online_itens where compra_id = v_id;
    end if;
    /* os produtos na ordem da tela */
    insert into public.compras_online_itens (compra_id, ordem, descricao, codigo, qtd, unitario, total, desconto, categoria, imagem_path, natureza, total_linha, situacao)
    select v_id, (a.n - 1)::integer, btrim(a.e->>'descricao'), a.e->>'codigo', coalesce((a.e->>'qtd')::numeric, 1), (a.e->>'unitario')::numeric,
           (a.e->>'total')::numeric, coalesce((a.e->>'desconto')::numeric, 0), a.e->>'categoria', a.e->>'imagem_path', a.e->>'natureza',
           (a.e->>'total_linha')::numeric, a.e->>'situacao'
    from jsonb_array_elements(p_itens) with ordinality as a(e, n);
  end if;

  /* ---- os documentos: o mesmo arquivo (SHA-256) nunca entra duas vezes ---- */
  if jsonb_array_length(v_docs) > 0 then
    with novos as (
      insert into public.compras_online_docs (user_id, compra_id, tipo, nome, path, mime, tamanho, sha256, extraido)
      select v_casa, v_id, d.e->>'tipo', left(d.e->>'nome', 200), d.e->>'path', d.e->>'mime', (d.e->>'tamanho')::bigint, d.e->>'sha256',
             case when jsonb_typeof(d.e->'extraido') = 'object' then d.e->'extraido' else '{}'::jsonb end
      from jsonb_array_elements(v_docs) with ordinality as d(e, n) order by d.n
      on conflict (user_id, sha256) do nothing
      returning path)
    select coalesce(array_agg(path), '{}') into v_ok from novos;
  end if;
  select coalesce(array_agg(t), '{}') into v_rep from unnest(v_todos) t where not t = any (v_ok);

  return jsonb_build_object('id', v_id, 'criado', p_novo, 'ja_existia', false, 'docs_gravados', coalesce(array_length(v_ok, 1), 0), 'docs_repetidos', to_jsonb(v_rep));
end $$;
revoke all on function public.compras_gravar(jsonb, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.compras_gravar(jsonb, jsonb, jsonb, boolean) to authenticated;

commit;

notify pgrst, 'reload schema';
