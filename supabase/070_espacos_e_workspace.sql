-- 070 · APLICADA EM PRODUÇÃO em 27/11/2026 (migration 20261127165238; o hash do corpo de cada uma das 14 funções foi conferido contra este arquivo; 2 espaços pessoais e 1 Casa criados pelo seed; advisors de segurança sem achado novo além das funções que são a porta do site).
-- ESPAÇOS, PERMISSÕES E WORKSPACE (Lote 1 do novo RAC; docs/planejamento/14-arquitetura-do-workspace.md, 16-arquitetura-de-identidade-e-compartilhamento.md e 19-registro-de-decisoes.md).
-- Aditiva: 5 tabelas novas e funções novas; NENHUMA tabela, política ou linha existente muda. Pode rodar de novo sem erro. Requer a 002 (membros), a 022 (rac_aal_ok) e a 050 (seguranca_catalogo).
--
-- O que cria:
--   1. public.espacos          o espaço: 'pessoal' (um por usuário, só do dono) ou 'compartilhado'. "dono" = o PROPRIETÁRIO. "casa_de" marca o espaço da CASA legada (a casa de quem é dono em
--                              public.membros): nele a participação vem SEMPRE de public.membros, ao vivo (a Fernanda é editora enquanto tiver a linha em membros); não há segunda lista de membros.
--   2. public.espaco_membros   participações EXPLÍCITAS (papéis: administrador, editor, leitor; o proprietário é o dono do espaço). Só espaços compartilhados que não são a casa legada.
--   3. public.workspace_paginas  uma página de Workspace = um documento JSON versionado (layout), validado no banco (ws_layout_valido), com concorrência otimista (versao).
--   4. public.workspace_versoes  histórico (as últimas 30 versões de cada página), escrito só por gatilho.
--   5. public.workspace_pessoal  preferências de cada usuário sobre uma página (widgets que ele ocultou e a página inicial), nunca sobrescritas por outra pessoa.
-- Segurança (o banco decide; a tela só esconde):
--   · quem lê e grava o quê = rac_papel_no_espaco / rac_pode_no_espaco (security definer, search_path vazio, derivadas de auth.uid(), nunca de parâmetro do cliente);
--   · espaços e participações NÃO têm DML direto para o site: só as funções rac_* (cada uma exige login e a 2ª etapa MFA, quando o usuário tem; ninguém altera o próprio papel;
--     administrador não promove nem rebaixa administrador; o proprietário é intocável; nada concede "proprietario");
--   · páginas: ler = qualquer papel; criar/editar = proprietário, administrador, editor (espaço não arquivado); excluir = administração e só página já arquivada; o espaço de uma página nunca muda;
--   · o Workspace só guarda LAYOUT: nenhuma tabela de negócio é tocada por esta migration nem pelo motor;
--   · RLS ligado, nada para anon, trava restritiva "mfa" nas 5 tabelas, catálogo da auditoria (050).
-- Seed: um espaço pessoal para cada usuário que já existe e o espaço "Casa" de cada dono que tem linhas em membros (sem tocar em nenhuma linha legada).
-- Rollback: drop table public.workspace_pessoal, public.workspace_versoes, public.workspace_paginas, public.espaco_membros, public.espacos cascade; e dropar as funções ws_* e rac_* listadas abaixo.
begin;

-- 1) espaços ----------------------------------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.espacos (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('pessoal', 'compartilhado')),
  nome        text not null check (length(btrim(nome)) between 1 and 80),
  dono        uuid not null references auth.users(id) on delete restrict,
  casa_de     uuid references auth.users(id) on delete restrict,
  criado_em   timestamptz not null default now(),
  arquivado_em timestamptz,
  constraint espacos_casa_compartilhada check (casa_de is null or (tipo = 'compartilhado' and casa_de = dono)),
  constraint espacos_pessoal_nao_arquiva check (tipo <> 'pessoal' or arquivado_em is null)
);
create unique index if not exists espacos_pessoal_unico on public.espacos (dono) where tipo = 'pessoal';
create unique index if not exists espacos_casa_unica on public.espacos (casa_de) where casa_de is not null;
create index if not exists espacos_dono on public.espacos (dono);

create table if not exists public.espaco_membros (
  espaco_id uuid not null references public.espacos(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  papel     text not null check (papel in ('administrador', 'editor', 'leitor')),
  desde     timestamptz not null default now(),
  por       uuid references auth.users(id) on delete set null,
  primary key (espaco_id, user_id)
);
create index if not exists espaco_membros_usuario on public.espaco_membros (user_id);

-- 2) funções de autorização (a base de todas as políticas) ----------------------------------------------------------------------------------------------------------
-- O papel de quem está logado no espaço: proprietario, administrador, editor, leitor, ou null (sem acesso; também para um espaço que não existe, para não revelar nada).
create or replace function public.rac_papel_no_espaco(p_espaco uuid) returns text
  language sql stable security definer set search_path = '' as $$
  select case
    when e.dono = (select auth.uid()) then 'proprietario'
    else coalesce(
      (select m.papel from public.espaco_membros m where m.espaco_id = e.id and m.user_id = (select auth.uid())),
      case when e.casa_de is not null and exists (select 1 from public.membros x where x.membro = (select auth.uid()) and x.dono = e.casa_de) then 'editor' end)
  end
  from public.espacos e where e.id = p_espaco and (select auth.uid()) is not null
$$;
revoke all on function public.rac_papel_no_espaco(uuid) from public, anon;
grant execute on function public.rac_papel_no_espaco(uuid) to authenticated;

-- nivel: 'ler' (qualquer papel), 'editar' (proprietário, administrador, editor), 'administrar' (proprietário, administrador), 'proprietario'. Espaço arquivado: só leitura.
create or replace function public.rac_pode_no_espaco(p_espaco uuid, p_nivel text) returns boolean
  language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when r is null then false
      when p_nivel = 'ler' then true
      when e.arquivado_em is not null then false
      when p_nivel = 'editar' then r in ('proprietario', 'administrador', 'editor')
      when p_nivel = 'administrar' then r in ('proprietario', 'administrador')
      when p_nivel = 'proprietario' then r = 'proprietario'
      else false end
    from public.espacos e, lateral (select public.rac_papel_no_espaco(e.id) as r) x
    where e.id = p_espaco), false)
$$;
revoke all on function public.rac_pode_no_espaco(uuid, text) from public, anon;
grant execute on function public.rac_pode_no_espaco(uuid, text) to authenticated;

create or replace function public.rac_meus_espacos() returns setof uuid
  language sql stable security definer set search_path = '' as $$
  select e.id from public.espacos e where public.rac_papel_no_espaco(e.id) is not null
$$;
revoke all on function public.rac_meus_espacos() from public, anon;
grant execute on function public.rac_meus_espacos() to authenticated;

-- 3) o documento de layout: validação no banco (o mesmo formato que NUCLEO.wsValidar confere no navegador) ---------------------------------------------------------
-- { schema: 1..1000, secoes: [ { id, titulo?, recolhida?, itens: [ { id "w_…", tipo "dominio.nome", v 1..1000, col 1..12, lin 0..12, estado ativo|oculto|desativado, config {} (<= 4 KB), mobile? } ] } ] }
-- No máximo 12 seções e 60 instâncias por página, ids únicos, até 64 KB. Chaves desconhecidas são aceitas (compatibilidade com versões futuras).
create or replace function public.ws_layout_valido(l jsonb) returns boolean
  language plpgsql immutable set search_path = '' as $$
declare
  s jsonb; i jsonb; ids text[] := '{}'; sids text[] := '{}'; n int := 0; v text;
begin
  if l is null or jsonb_typeof(l) <> 'object' or pg_column_size(l) > 65536 then return false; end if;
  if coalesce(jsonb_typeof(l->'schema'), '') <> 'number' or (l->>'schema') !~ '^[0-9]{1,4}$' or (l->>'schema')::int not between 1 and 1000 then return false; end if;
  if coalesce(jsonb_typeof(l->'secoes'), '') <> 'array' or jsonb_array_length(l->'secoes') > 12 then return false; end if;
  for s in select value from jsonb_array_elements(l->'secoes') loop
    if jsonb_typeof(s) <> 'object' then return false; end if;
    if coalesce(jsonb_typeof(s->'id'), '') <> 'string' or (s->>'id') !~ '^[a-z0-9_-]{1,40}$' then return false; end if;
    if (s->>'id') = any (sids) then return false; end if;
    sids := sids || (s->>'id');
    if s ? 'titulo' and (jsonb_typeof(s->'titulo') <> 'string' or length(s->>'titulo') > 60) then return false; end if;
    if s ? 'recolhida' and jsonb_typeof(s->'recolhida') <> 'boolean' then return false; end if;
    if coalesce(jsonb_typeof(s->'itens'), '') <> 'array' then return false; end if;
    for i in select value from jsonb_array_elements(s->'itens') loop
      n := n + 1;
      if n > 60 or jsonb_typeof(i) <> 'object' then return false; end if;
      if coalesce(jsonb_typeof(i->'id'), '') <> 'string' or (i->>'id') !~ '^w_[a-z0-9]{6,32}$' then return false; end if;
      v := i->>'id';
      if v = any (ids) then return false; end if;
      ids := ids || v;
      if coalesce(jsonb_typeof(i->'tipo'), '') <> 'string' or length(i->>'tipo') > 60 or (i->>'tipo') !~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$' then return false; end if;
      if coalesce(jsonb_typeof(i->'v'), '') <> 'number' or (i->>'v') !~ '^[0-9]{1,4}$' or (i->>'v')::int not between 1 and 1000 then return false; end if;
      if coalesce(jsonb_typeof(i->'col'), '') <> 'number' or (i->>'col') !~ '^[0-9]{1,2}$' or (i->>'col')::int not between 1 and 12 then return false; end if;
      if coalesce(jsonb_typeof(i->'lin'), '') <> 'number' or (i->>'lin') !~ '^[0-9]{1,2}$' or (i->>'lin')::int not between 0 and 12 then return false; end if;
      if coalesce(i->>'estado', '') not in ('ativo', 'oculto', 'desativado') or jsonb_typeof(i->'estado') <> 'string' then return false; end if;
      if coalesce(jsonb_typeof(i->'config'), '') <> 'object' or pg_column_size(i->'config') > 4096 then return false; end if;
      if i ? 'mobile' and jsonb_typeof(i->'mobile') <> 'boolean' then return false; end if;
    end loop;
  end loop;
  return true;
exception when others then
  return false;
end $$;
revoke all on function public.ws_layout_valido(jsonb) from public, anon;
grant execute on function public.ws_layout_valido(jsonb) to authenticated;

-- 4) páginas, versões e preferências ----------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.workspace_paginas (
  id             uuid primary key default gen_random_uuid(),
  espaco_id      uuid not null references public.espacos(id) on delete restrict,
  titulo         text not null check (length(btrim(titulo)) between 1 and 60),
  icone          text check (icone is null or length(icone) <= 8),
  ambiente       text check (ambiente is null or ambiente in ('casa', 'biblioteca', 'projetos', 'descobrir', 'vida')),
  contexto       text check (contexto is null or contexto ~ '^[a-z][a-z0-9_-]{1,30}$'),
  ordem          integer not null default 0 check (ordem between 0 and 1000),
  schema_versao  integer not null default 1 check (schema_versao between 1 and 1000),
  versao         integer not null default 1 check (versao >= 1),
  layout         jsonb not null default '{"schema":1,"secoes":[]}'::jsonb,
  criado_por     uuid not null default auth.uid() references auth.users(id) on delete restrict,
  criado_em      timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null,
  atualizado_em  timestamptz not null default now(),
  arquivada_em   timestamptz,
  constraint workspace_layout_valido check (public.ws_layout_valido(layout))
);
-- sem páginas duplicadas: o mesmo título (sem maiúsculas nem espaços nas pontas) só uma vez por espaço entre as páginas ativas
create unique index if not exists workspace_paginas_titulo_unico on public.workspace_paginas (espaco_id, lower(btrim(titulo))) where arquivada_em is null;
create index if not exists workspace_paginas_espaco on public.workspace_paginas (espaco_id, ordem);

create table if not exists public.workspace_versoes (
  id        bigint generated always as identity primary key,
  pagina_id uuid not null references public.workspace_paginas(id) on delete cascade,
  versao    integer not null,
  layout    jsonb not null,
  titulo    text not null,
  autor     uuid references auth.users(id) on delete set null,
  quando    timestamptz not null default now(),
  motivo    text not null check (motivo in ('criar', 'editar', 'arquivar', 'restaurar')),
  unique (pagina_id, versao)
);

create table if not exists public.workspace_pessoal (
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pagina_id     uuid not null references public.workspace_paginas(id) on delete cascade,
  ocultos       jsonb not null default '[]'::jsonb check (jsonb_typeof(ocultos) = 'array' and jsonb_array_length(ocultos) <= 60 and pg_column_size(ocultos) <= 4096),
  favorita      boolean not null default false,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, pagina_id)
);
create unique index if not exists workspace_pessoal_inicial_unica on public.workspace_pessoal (user_id) where favorita;

-- a mesma pergunta, a partir de uma página (ligada às políticas mais abaixo)
create or replace function public.ws_pode_na_pagina(p_pagina uuid, p_nivel text) returns boolean
  language sql stable security definer set search_path = '' as $$
  select coalesce((select public.rac_pode_no_espaco(p.espaco_id, p_nivel) from public.workspace_paginas p where p.id = p_pagina), false)
$$;
revoke all on function public.ws_pode_na_pagina(uuid, text) from public, anon;
grant execute on function public.ws_pode_na_pagina(uuid, text) to authenticated;

-- 5) gatilhos ---------------------------------------------------------------------------------------------------------------------------------------------------------
-- páginas: o servidor decide autoria, versão e hora; o espaço e a autoria nunca mudam; no máximo 30 páginas ativas por espaço
create or replace function public.ws_pagina_antes() returns trigger
  language plpgsql set search_path = '' as $$
declare u uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.workspace_paginas p where p.espaco_id = new.espaco_id and p.arquivada_em is null) >= 30 then
      raise exception 'limite_de_paginas' using errcode = 'P0001';
    end if;
    new.versao := 1; new.atualizado_em := now();
    if u is not null then new.criado_por := u; new.atualizado_por := u; end if;
  else
    if new.id <> old.id or new.espaco_id <> old.espaco_id or new.criado_por <> old.criado_por or new.criado_em <> old.criado_em then
      raise exception 'espaco_da_pagina_nao_muda' using errcode = 'P0001';
    end if;
    new.versao := old.versao + 1; new.atualizado_em := now();
    if u is not null then new.atualizado_por := u; end if;
  end if;
  return new;
end $$;
drop trigger if exists ws_pagina_antes on public.workspace_paginas;
create trigger ws_pagina_antes before insert or update on public.workspace_paginas for each row execute function public.ws_pagina_antes();
revoke all on function public.ws_pagina_antes() from public, anon;

-- histórico: cada gravação vira uma versão (as 30 últimas ficam); só este gatilho escreve em workspace_versoes
create or replace function public.ws_pagina_versionar() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare m text;
begin
  if tg_op = 'INSERT' then m := 'criar';
  elsif new.arquivada_em is not null and old.arquivada_em is null then m := 'arquivar';
  elsif new.layout is distinct from old.layout and exists (select 1 from public.workspace_versoes v where v.pagina_id = new.id and v.layout = new.layout) then m := 'restaurar';
  else m := 'editar'; end if;
  insert into public.workspace_versoes (pagina_id, versao, layout, titulo, autor, motivo) values (new.id, new.versao, new.layout, new.titulo, (select auth.uid()), m);
  delete from public.workspace_versoes v where v.pagina_id = new.id and v.versao <= new.versao - 30;
  return null;
end $$;
drop trigger if exists ws_pagina_versionar on public.workspace_paginas;
create trigger ws_pagina_versionar after insert or update on public.workspace_paginas for each row execute function public.ws_pagina_versionar();
revoke all on function public.ws_pagina_versionar() from public, anon;

-- participações explícitas: só em espaço compartilhado que não é a casa legada, nunca do proprietário, e o vínculo não muda de espaço nem de pessoa
create or replace function public.rac_espaco_membro_guarda() returns trigger
  language plpgsql set search_path = '' as $$
declare e public.espacos%rowtype;
begin
  select * into e from public.espacos where id = new.espaco_id;
  if e.tipo <> 'compartilhado' or e.casa_de is not null then raise exception 'espaco_sem_membros_explicitos' using errcode = 'P0001'; end if;
  if new.user_id = e.dono then raise exception 'proprietario_intocavel' using errcode = 'P0001'; end if;
  if tg_op = 'UPDATE' and (new.espaco_id <> old.espaco_id or new.user_id <> old.user_id) then raise exception 'vinculo_imutavel' using errcode = 'P0001'; end if;
  return new;
end $$;
drop trigger if exists rac_espaco_membro_guarda on public.espaco_membros;
create trigger rac_espaco_membro_guarda before insert or update on public.espaco_membros for each row execute function public.rac_espaco_membro_guarda();
revoke all on function public.rac_espaco_membro_guarda() from public, anon;

-- 6) RLS, privilégios e a trava "mfa" ----------------------------------------------------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['espacos', 'espaco_membros', 'workspace_paginas', 'workspace_versoes', 'workspace_pessoal'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "mfa" on public.%I', t);
    execute format('create policy "mfa" on public.%I as restrictive for all to authenticated using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok()))', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;

drop policy if exists "ver meus espacos" on public.espacos;
create policy "ver meus espacos" on public.espacos for select to authenticated using (public.rac_papel_no_espaco(id) is not null);
drop policy if exists "ver participacoes" on public.espaco_membros;
create policy "ver participacoes" on public.espaco_membros for select to authenticated using (public.rac_pode_no_espaco(espaco_id, 'ler'));

drop policy if exists "ler paginas" on public.workspace_paginas;
create policy "ler paginas" on public.workspace_paginas for select to authenticated using (public.rac_pode_no_espaco(espaco_id, 'ler'));
drop policy if exists "criar paginas" on public.workspace_paginas;
create policy "criar paginas" on public.workspace_paginas for insert to authenticated with check (public.rac_pode_no_espaco(espaco_id, 'editar') and criado_por = (select auth.uid()));
drop policy if exists "editar paginas" on public.workspace_paginas;
create policy "editar paginas" on public.workspace_paginas for update to authenticated using (public.rac_pode_no_espaco(espaco_id, 'editar')) with check (public.rac_pode_no_espaco(espaco_id, 'editar'));
drop policy if exists "excluir paginas arquivadas" on public.workspace_paginas;
create policy "excluir paginas arquivadas" on public.workspace_paginas for delete to authenticated using (arquivada_em is not null and public.rac_pode_no_espaco(espaco_id, 'administrar'));

drop policy if exists "ler versoes" on public.workspace_versoes;
create policy "ler versoes" on public.workspace_versoes for select to authenticated using (public.ws_pode_na_pagina(pagina_id, 'editar'));

drop policy if exists "minhas preferencias" on public.workspace_pessoal;
create policy "minhas preferencias" on public.workspace_pessoal for all to authenticated
  using (user_id = (select auth.uid()) and public.ws_pode_na_pagina(pagina_id, 'ler'))
  with check (user_id = (select auth.uid()) and public.ws_pode_na_pagina(pagina_id, 'ler'));

grant select on public.espacos, public.espaco_membros, public.workspace_versoes to authenticated;
grant select, insert, update, delete on public.workspace_paginas to authenticated;
grant select, insert, update, delete on public.workspace_pessoal to authenticated;

-- 7) funções do site (a única porta para criar espaços e mudar participações) ---------------------------------------------------------------------------------------------------
-- Todas: exigem login e a 2ª etapa (rac_aal_ok), derivam a identidade de auth.uid() e respondem "sem_permissao" (42501) igual para quem não pertence e para o que não existe.
create or replace function public.rac_iniciar_espacos() returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare u uuid := (select auth.uid()); r jsonb;
begin
  if u is null then raise exception 'sem_login' using errcode = '42501'; end if;
  if not public.rac_aal_ok() then raise exception 'mfa_necessario' using errcode = '42501'; end if;
  insert into public.espacos (tipo, nome, dono) select 'pessoal', 'Pessoal', u where not exists (select 1 from public.espacos x where x.dono = u and x.tipo = 'pessoal') on conflict do nothing;
  -- o espaço da casa legada existe para quem é dono de uma casa ou membro dela (a participação continua vindo de public.membros)
  insert into public.espacos (tipo, nome, dono, casa_de) select distinct 'compartilhado', 'Casa', m.dono, m.dono from public.membros m where m.dono = u or m.membro = u on conflict do nothing;
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'tipo', e.tipo, 'nome', e.nome, 'papel', public.rac_papel_no_espaco(e.id), 'casa', e.casa_de is not null,
           'arquivado', e.arquivado_em is not null) order by e.tipo, e.criado_em), '[]'::jsonb) into r
    from public.espacos e where public.rac_papel_no_espaco(e.id) is not null;
  return r;
end $$;
revoke all on function public.rac_iniciar_espacos() from public, anon;
grant execute on function public.rac_iniciar_espacos() to authenticated;

create or replace function public.rac_espaco_criar(p_nome text) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare u uuid := (select auth.uid()); novo uuid;
begin
  if u is null then raise exception 'sem_login' using errcode = '42501'; end if;
  if not public.rac_aal_ok() then raise exception 'mfa_necessario' using errcode = '42501'; end if;
  if p_nome is null or length(btrim(p_nome)) not between 1 and 80 then raise exception 'nome_invalido' using errcode = 'P0001'; end if;
  if (select count(*) from public.espacos e where e.dono = u and e.tipo = 'compartilhado' and e.casa_de is null and e.arquivado_em is null) >= 10 then raise exception 'limite_de_espacos' using errcode = 'P0001'; end if;
  insert into public.espacos (tipo, nome, dono) values ('compartilhado', btrim(p_nome), u) returning id into novo;
  return novo;
end $$;
revoke all on function public.rac_espaco_criar(text) from public, anon;
grant execute on function public.rac_espaco_criar(text) to authenticated;

-- quem participa do espaço: o proprietário, as participações explícitas e, na casa legada, quem está em public.membros
create or replace function public.rac_espaco_membros(p_espaco uuid) returns table (user_id uuid, papel text, origem text)
  language sql stable security definer set search_path = '' as $$
  select e.dono, 'proprietario'::text, 'proprietario'::text from public.espacos e where e.id = p_espaco and public.rac_pode_no_espaco(e.id, 'ler')
  union all
  select m.user_id, m.papel, 'explicita'::text from public.espaco_membros m where m.espaco_id = p_espaco and public.rac_pode_no_espaco(p_espaco, 'ler')
  union all
  select x.membro, 'editor'::text, 'casa'::text from public.espacos e join public.membros x on x.dono = e.casa_de where e.id = p_espaco and e.casa_de is not null and public.rac_pode_no_espaco(e.id, 'ler')
$$;
revoke all on function public.rac_espaco_membros(uuid) from public, anon;
grant execute on function public.rac_espaco_membros(uuid) to authenticated;

create or replace function public.rac_espaco_membro_definir(p_espaco uuid, p_user uuid, p_papel text) returns void
  language plpgsql security definer set search_path = '' as $$
declare u uuid := (select auth.uid()); e public.espacos%rowtype; meu text; atual text;
begin
  if u is null then raise exception 'sem_login' using errcode = '42501'; end if;
  if not public.rac_aal_ok() then raise exception 'mfa_necessario' using errcode = '42501'; end if;
  meu := public.rac_papel_no_espaco(p_espaco);
  if meu is null or meu not in ('proprietario', 'administrador') then raise exception 'sem_permissao' using errcode = '42501'; end if;
  select * into e from public.espacos where id = p_espaco;
  if e.arquivado_em is not null then raise exception 'espaco_arquivado' using errcode = 'P0001'; end if;
  if e.tipo <> 'compartilhado' or e.casa_de is not null then raise exception 'espaco_sem_membros_explicitos' using errcode = 'P0001'; end if;
  if p_papel is null or p_papel not in ('administrador', 'editor', 'leitor') then raise exception 'papel_invalido' using errcode = 'P0001'; end if;
  if p_user is null or p_user = u then raise exception 'nao_altera_o_proprio_papel' using errcode = 'P0001'; end if;
  if p_user = e.dono then raise exception 'proprietario_intocavel' using errcode = 'P0001'; end if;
  select m.papel into atual from public.espaco_membros m where m.espaco_id = p_espaco and m.user_id = p_user;
  if meu = 'administrador' and (p_papel = 'administrador' or atual = 'administrador') then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if not exists (select 1 from auth.users a where a.id = p_user) then raise exception 'usuario_inexistente' using errcode = 'P0001'; end if;
  insert into public.espaco_membros (espaco_id, user_id, papel, por) values (p_espaco, p_user, p_papel, u)
    on conflict (espaco_id, user_id) do update set papel = excluded.papel, por = u;
end $$;
revoke all on function public.rac_espaco_membro_definir(uuid, uuid, text) from public, anon;
grant execute on function public.rac_espaco_membro_definir(uuid, uuid, text) to authenticated;

create or replace function public.rac_espaco_membro_remover(p_espaco uuid, p_user uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare u uuid := (select auth.uid()); e public.espacos%rowtype; meu text; atual text;
begin
  if u is null then raise exception 'sem_login' using errcode = '42501'; end if;
  if not public.rac_aal_ok() then raise exception 'mfa_necessario' using errcode = '42501'; end if;
  meu := public.rac_papel_no_espaco(p_espaco);
  if meu is null then raise exception 'sem_permissao' using errcode = '42501'; end if;
  select * into e from public.espacos where id = p_espaco;
  if e.tipo <> 'compartilhado' or e.casa_de is not null then raise exception 'espaco_sem_membros_explicitos' using errcode = 'P0001'; end if;
  if p_user = e.dono then raise exception 'proprietario_intocavel' using errcode = 'P0001'; end if;
  select m.papel into atual from public.espaco_membros m where m.espaco_id = p_espaco and m.user_id = p_user;
  if atual is null then raise exception 'nao_e_membro' using errcode = 'P0001'; end if;
  -- cada um pode SAIR; remover outra pessoa exige administração (e o administrador só remove editor e leitor)
  if p_user <> u then
    if meu not in ('proprietario', 'administrador') or (meu = 'administrador' and atual = 'administrador') then raise exception 'sem_permissao' using errcode = '42501'; end if;
  end if;
  delete from public.espaco_membros where espaco_id = p_espaco and user_id = p_user;
end $$;
revoke all on function public.rac_espaco_membro_remover(uuid, uuid) from public, anon;
grant execute on function public.rac_espaco_membro_remover(uuid, uuid) to authenticated;

-- arquivar não apaga nada: o espaço fica só para leitura; só o proprietário, e nunca o pessoal nem a casa legada
create or replace function public.rac_espaco_arquivar(p_espaco uuid, p_arquivar boolean default true) returns void
  language plpgsql security definer set search_path = '' as $$
declare u uuid := (select auth.uid()); e public.espacos%rowtype;
begin
  if u is null then raise exception 'sem_login' using errcode = '42501'; end if;
  if not public.rac_aal_ok() then raise exception 'mfa_necessario' using errcode = '42501'; end if;
  select * into e from public.espacos where id = p_espaco;
  if not found or e.dono <> u then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if e.tipo <> 'compartilhado' or e.casa_de is not null then raise exception 'espaco_protegido' using errcode = 'P0001'; end if;
  update public.espacos set arquivado_em = case when p_arquivar then coalesce(arquivado_em, now()) else null end where id = p_espaco;
end $$;
revoke all on function public.rac_espaco_arquivar(uuid, boolean) from public, anon;
grant execute on function public.rac_espaco_arquivar(uuid, boolean) to authenticated;

-- 8) seed (sem tocar em nenhuma linha existente) -----------------------------------------------------------------------------------------------------------------------
insert into public.espacos (tipo, nome, dono) select 'pessoal', 'Pessoal', u.id from auth.users u where not exists (select 1 from public.espacos e where e.dono = u.id and e.tipo = 'pessoal') on conflict do nothing;
insert into public.espacos (tipo, nome, dono, casa_de) select distinct 'compartilhado', 'Casa', m.dono, m.dono from public.membros m where not exists (select 1 from public.espacos e where e.casa_de = m.dono) on conflict do nothing;

-- 9) catálogo da auditoria (050): o nome de cada tabela e como ela entra na auditoria e no backup do site
insert into public.seguranca_catalogo (tabela, trava_mfa, backup, origem, motivo) values
  ('espacos', true, true, '070', 'Novo RAC: espaços pessoais e compartilhados (identidade e propriedade); só funções gravam; trava "mfa"; só exporta no backup'),
  ('espaco_membros', true, true, '070', 'Novo RAC: participações explícitas e papéis nos espaços; só funções gravam; trava "mfa"; só exporta no backup'),
  ('workspace_paginas', true, true, '070', 'Novo RAC: páginas e layouts do Workspace (documento JSON, sem dado de negócio); trava "mfa"; só exporta no backup'),
  ('workspace_versoes', true, false, '070', 'Novo RAC: histórico das últimas 30 versões de cada página, escrito só por gatilho; fora do backup do site'),
  ('workspace_pessoal', true, true, '070', 'Novo RAC: preferências de cada pessoa sobre uma página (ocultos e página inicial); trava "mfa"; só exporta no backup')
on conflict (tabela) do nothing;

commit;
notify pgrst, 'reload schema';

-- conferir depois (só leitura): supabase/conferencias/070_conferir_producao.sql
