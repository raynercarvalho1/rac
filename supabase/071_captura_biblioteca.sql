-- 071 · APLICADA EM PRODUÇÃO em 28/11/2026 (conferida por leitura: 2 tabelas com RLS e trava "mfa", 5 políticas no bucket, bucket "captura" privado de 50 MB, anon sem acesso, nenhum cofre público, 2 linhas no catálogo; depois, o teste do banco real pediu fechar para anon a função bib_ref_valida e os 2 gatilhos: aplicado como 071b e 071c e já incluído neste arquivo).
-- CAPTURA UNIVERSAL E BIBLIOTECA BÁSICA (Lote 4 do novo RAC; docs/planejamento/15-arquitetura-de-integracao.md seções 3 e 4, 18 e 19).
-- Aditiva: 2 tabelas novas, 1 bucket privado novo e funções novas; NENHUMA tabela, política ou linha existente muda. Pode rodar de novo sem erro.
-- Requer a 022 (rac_aal_ok), a 050 (seguranca_catalogo) e a 070 (espacos e rac_pode_no_espaco).
--
-- O que cria:
--   1. public.captura_itens    a caixa de entrada da Captura: tudo o que a pessoa quer guardar antes de decidir onde fica. O id nasce no APARELHO (idempotência: reenviar não duplica).
--                              PRIVADO DO AUTOR até ser enviado a um módulo (a política só deixa quem criou ler, mesmo num espaço compartilhado).
--   2. public.biblioteca_itens referências com metadados (link, nota, documento, arquivo, referência). NÃO guarda cópia de arquivo nem de documento: aponta (ref) para o original.
--                              Visível a quem lê o espaço; editável a quem edita.
--   3. bucket privado "captura"  fotos e arquivos. Caminho: <espaco>/<autor>/<pasta>/<arquivo>. Só o autor lê o que ainda não foi enviado; um item da Biblioteca que aponta para o
--                              arquivo o abre para quem lê o espaço. Arquivo apontado pela Biblioteca não pode ser apagado. Sempre URL temporária (o bucket nunca é público).
-- Segurança (o banco decide; a tela só esconde): RLS ligado, nada para anon, trava restritiva "mfa" nas duas tabelas e no bucket, catálogo da auditoria (050), limites de tamanho e formato.
-- Rollback: drop table public.biblioteca_itens, public.captura_itens cascade; drop function public.cap_arquivo_pode(text, text), public.bib_ref_valida(jsonb, uuid); remover as políticas "captura *" e "mfa captura" de storage.objects e o bucket "captura" (vazio).
begin;

-- 1) a caixa de entrada da Captura ------------------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.captura_itens (
  id             uuid primary key,
  espaco_id      uuid not null references public.espacos(id) on delete restrict,
  criado_por     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo           text not null check (tipo in ('texto', 'ideia', 'link', 'foto', 'arquivo', 'tarefa', 'referencia', 'observacao')),
  conteudo       text not null default '' check (length(conteudo) <= 20000),
  anexos         jsonb not null default '[]'::jsonb check (jsonb_typeof(anexos) = 'array' and jsonb_array_length(anexos) <= 10 and pg_column_size(anexos) <= 16384),
  estado         text not null default 'pendente' check (estado in ('pendente', 'classificado', 'arquivado', 'descartado')),
  sugestao       jsonb check (sugestao is null or (jsonb_typeof(sugestao) = 'object' and pg_column_size(sugestao) <= 8192)),
  destino        jsonb check (destino is null or (jsonb_typeof(destino) = 'object' and pg_column_size(destino) <= 8192)),
  origem         text not null default 'app' check (origem in ('app', 'compartilhar', 'widget', 'atalho')),
  criado_em      timestamptz not null default now(),
  classificado_em timestamptz,
  atualizado_em  timestamptz not null default now(),
  constraint captura_tem_conteudo check (length(btrim(conteudo)) > 0 or jsonb_array_length(anexos) > 0),
  constraint captura_destino_coerente check ((estado = 'classificado') = (destino is not null))
);
create index if not exists captura_itens_autor on public.captura_itens (criado_por, estado, criado_em desc);
create index if not exists captura_itens_espaco on public.captura_itens (espaco_id);

-- o espaço e o autor de um item nunca mudam; a data de atualização é do servidor
create or replace function public.cap_item_guarda() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if new.espaco_id is distinct from old.espaco_id or new.criado_por is distinct from old.criado_por or new.criado_em is distinct from old.criado_em or new.id is distinct from old.id then
    raise exception 'espaco_autor_imutaveis' using errcode = '42501';
  end if;
  new.atualizado_em := now();
  return new;
end $$;
revoke all on function public.cap_item_guarda() from public, anon;
drop trigger if exists cap_item_guarda on public.captura_itens;
create trigger cap_item_guarda before update on public.captura_itens for each row execute function public.cap_item_guarda();

-- 2) a Biblioteca: referências, nunca cópias ---------------------------------------------------------------------------------------------------------------------------------
-- ref (opcional): {tabela: 'storage'|'registros'|'notas_fiscais_docs'|'notas_fiscais', id, bucket: 'captura'|'familia', path, nome, mime, tamanho, rota}.
-- Arquivo do bucket "captura" só pode apontar para a pasta do PRÓPRIO espaço do item (uma referência não abre arquivo de outro espaço).
create or replace function public.bib_ref_valida(r jsonb, esp uuid) returns boolean
  language sql immutable set search_path = '' as $$
  select r is null or (
    jsonb_typeof(r) = 'object' and pg_column_size(r) <= 2048
    and coalesce(r->>'tabela', 'storage') in ('storage', 'registros', 'notas_fiscais_docs', 'notas_fiscais')
    and (r->>'bucket' is null or r->>'bucket' in ('captura', 'familia'))
    and (r->>'path' is null or (length(r->>'path') <= 400 and position('..' in (r->>'path')) = 0))
    and (r->>'bucket' is distinct from 'captura' or (r->>'path') like esp::text || '/%')
    and (r->>'rota' is null or (r->>'rota') ~ '^#[a-z0-9/_-]{1,80}$'))
$$;

revoke all on function public.bib_ref_valida(jsonb, uuid) from public, anon;
grant execute on function public.bib_ref_valida(jsonb, uuid) to authenticated;

create table if not exists public.biblioteca_itens (
  id          uuid primary key,
  espaco_id   uuid not null references public.espacos(id) on delete restrict,
  criado_por  uuid default auth.uid() references auth.users(id) on delete set null,
  tipo        text not null check (tipo in ('link', 'nota', 'documento', 'arquivo', 'referencia')),
  titulo      text not null check (length(btrim(titulo)) between 1 and 200),
  descricao   text check (descricao is null or length(descricao) <= 2000),
  url         text check (url is null or (length(url) <= 2000 and url ~* '^https?://')),
  texto       text check (texto is null or length(texto) <= 20000),
  ref         jsonb,
  etiquetas   text[] not null default '{}' check (cardinality(etiquetas) <= 12),
  origem      text not null default 'manual' check (origem in ('manual', 'captura', 'descobrir', 'newsletter', 'inbox', 'projetos')),
  captura_id  uuid,
  projeto_id  uuid,
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  arquivada_em timestamptz,
  constraint biblioteca_forma check (
    (tipo = 'link' and url is not null) or (tipo = 'nota' and texto is not null) or (tipo in ('documento', 'arquivo') and ref is not null) or tipo = 'referencia'),
  constraint biblioteca_ref_ok check (public.bib_ref_valida(ref, espaco_id))
);
create unique index if not exists biblioteca_captura_unica on public.biblioteca_itens (captura_id) where captura_id is not null;
create index if not exists biblioteca_itens_espaco on public.biblioteca_itens (espaco_id, arquivada_em, criado_em desc);
create index if not exists biblioteca_itens_tipo on public.biblioteca_itens (espaco_id, tipo);

create or replace function public.bib_item_guarda() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if new.espaco_id is distinct from old.espaco_id or new.id is distinct from old.id or new.criado_em is distinct from old.criado_em then
    raise exception 'espaco_imutavel' using errcode = '42501';
  end if;
  new.atualizado_em := now();
  return new;
end $$;
revoke all on function public.bib_item_guarda() from public, anon;
drop trigger if exists bib_item_guarda on public.biblioteca_itens;
create trigger bib_item_guarda before update on public.biblioteca_itens for each row execute function public.bib_item_guarda();

-- 3) o bucket privado e quem acessa cada caminho -----------------------------------------------------------------------------------------------------------------------------
-- p_modo: 'ler' (autor, ou quem lê o espaço quando um item da Biblioteca aponta para o arquivo), 'escrever' (só o autor, em espaço que ele edita) e 'apagar' (autor, e só se nenhum item da Biblioteca aponta).
create or replace function public.cap_arquivo_pode(p_name text, p_modo text) returns boolean
  language plpgsql stable security definer set search_path = '' as $$
declare partes text[]; esp uuid; u uuid := (select auth.uid());
begin
  if u is null or p_name is null or position('..' in p_name) > 0 then return false; end if;
  partes := string_to_array(p_name, '/');
  if coalesce(array_length(partes, 1), 0) < 4 or partes[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  esp := partes[1]::uuid;
  if p_modo = 'ler' then
    return public.rac_pode_no_espaco(esp, 'ler') and (partes[2] = u::text
      or exists (select 1 from public.biblioteca_itens b where b.espaco_id = esp and b.ref->>'bucket' = 'captura' and b.ref->>'path' = p_name));
  elsif p_modo = 'escrever' then
    return partes[2] = u::text and public.rac_pode_no_espaco(esp, 'editar');
  elsif p_modo = 'apagar' then
    return partes[2] = u::text and public.rac_pode_no_espaco(esp, 'editar')
      and not exists (select 1 from public.biblioteca_itens b where b.ref->>'bucket' = 'captura' and b.ref->>'path' = p_name);
  end if;
  return false;
end $$;
revoke all on function public.cap_arquivo_pode(text, text) from public, anon;
grant execute on function public.cap_arquivo_pode(text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('captura', 'captura', false, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif', 'application/pdf', 'text/plain', 'text/markdown', 'text/csv',
  'application/zip', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'video/mp4', 'video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "captura ler" on storage.objects;
create policy "captura ler" on storage.objects for select to authenticated using (bucket_id = 'captura' and (select public.cap_arquivo_pode(name, 'ler')));
drop policy if exists "captura gravar" on storage.objects;
create policy "captura gravar" on storage.objects for insert to authenticated with check (bucket_id = 'captura' and (select public.cap_arquivo_pode(name, 'escrever')));
drop policy if exists "captura atualizar" on storage.objects;
create policy "captura atualizar" on storage.objects for update to authenticated using (bucket_id = 'captura' and (select public.cap_arquivo_pode(name, 'escrever'))) with check (bucket_id = 'captura' and (select public.cap_arquivo_pode(name, 'escrever')));
drop policy if exists "captura apagar" on storage.objects;
create policy "captura apagar" on storage.objects for delete to authenticated using (bucket_id = 'captura' and (select public.cap_arquivo_pode(name, 'apagar')));
-- a 2ª etapa (MFA) vale no bucket novo como nos outros cofres (a "mfa cofres" da 022 só cita familia e backups)
drop policy if exists "mfa captura" on storage.objects;
create policy "mfa captura" on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'captura' or (select public.rac_aal_ok())) with check (bucket_id <> 'captura' or (select public.rac_aal_ok()));

-- 4) RLS, privilégios e a trava "mfa" nas tabelas -----------------------------------------------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['captura_itens', 'biblioteca_itens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "mfa" on public.%I', t);
    execute format('create policy "mfa" on public.%I as restrictive for all to authenticated using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok()))', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- Captura: só o autor vê e mexe (mesmo num espaço compartilhado), e só em espaço que ele pode editar
drop policy if exists "captura ver" on public.captura_itens;
create policy "captura ver" on public.captura_itens for select to authenticated using (criado_por = (select auth.uid()) and public.rac_pode_no_espaco(espaco_id, 'ler'));
drop policy if exists "captura criar" on public.captura_itens;
create policy "captura criar" on public.captura_itens for insert to authenticated with check (criado_por = (select auth.uid()) and public.rac_pode_no_espaco(espaco_id, 'editar'));
drop policy if exists "captura editar" on public.captura_itens;
create policy "captura editar" on public.captura_itens for update to authenticated
  using (criado_por = (select auth.uid()) and public.rac_pode_no_espaco(espaco_id, 'editar')) with check (criado_por = (select auth.uid()) and public.rac_pode_no_espaco(espaco_id, 'editar'));
drop policy if exists "captura excluir" on public.captura_itens;
create policy "captura excluir" on public.captura_itens for delete to authenticated
  using (criado_por = (select auth.uid()) and estado in ('descartado', 'arquivado') and public.rac_pode_no_espaco(espaco_id, 'editar'));

-- Biblioteca: lê quem lê o espaço; cria e edita quem edita; exclui o autor ou a administração
drop policy if exists "biblioteca ver" on public.biblioteca_itens;
create policy "biblioteca ver" on public.biblioteca_itens for select to authenticated using (public.rac_pode_no_espaco(espaco_id, 'ler'));
drop policy if exists "biblioteca criar" on public.biblioteca_itens;
create policy "biblioteca criar" on public.biblioteca_itens for insert to authenticated with check (criado_por = (select auth.uid()) and public.rac_pode_no_espaco(espaco_id, 'editar'));
drop policy if exists "biblioteca editar" on public.biblioteca_itens;
create policy "biblioteca editar" on public.biblioteca_itens for update to authenticated using (public.rac_pode_no_espaco(espaco_id, 'editar')) with check (public.rac_pode_no_espaco(espaco_id, 'editar'));
drop policy if exists "biblioteca excluir" on public.biblioteca_itens;
create policy "biblioteca excluir" on public.biblioteca_itens for delete to authenticated
  using ((criado_por = (select auth.uid()) and public.rac_pode_no_espaco(espaco_id, 'editar')) or public.rac_pode_no_espaco(espaco_id, 'administrar'));

grant select, insert, update, delete on public.captura_itens, public.biblioteca_itens to authenticated;

-- 5) catálogo da auditoria (050) ---------------------------------------------------------------------------------------------------------------------------------------------
insert into public.seguranca_catalogo (tabela, trava_mfa, backup, origem, motivo) values
  ('captura_itens', true, true, '071', 'Novo RAC: caixa de entrada da Captura; privada do autor; id gerado no aparelho; trava "mfa"; só exporta no backup'),
  ('biblioteca_itens', true, true, '071', 'Novo RAC: Biblioteca básica (referências e metadados, sem cópia de arquivo); visível por espaço; trava "mfa"; só exporta no backup')
on conflict (tabela) do nothing;

commit;
notify pgrst, 'reload schema';

-- conferir depois (só leitura): supabase/conferencias/071_conferir_producao.sql
