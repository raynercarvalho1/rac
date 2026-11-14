-- status: pendente
-- RAC Inbox · I1 (docs/inbox.md): fundação de dados. PREPARADA, NÃO APLICADA em produção (o dono roda no SQL Editor, com autorização própria).
-- Ordem: 002 (membros) → 022 (rac_aal_ok) → este arquivo. Pode rodar de novo sem estragar nada. Opcional: se a 050 (catálogo da auditoria) já
-- estiver aplicada, as quatro tabelas entram no catálogo no fim deste arquivo; se não estiver, o arquivo avisa e segue (aplique a 050 depois e
-- rode este de novo, ou inclua as linhas à mão: docs/seguranca.md, "Catálogo da auditoria").
--
-- O QUE É: o mínimo para o Inbox existir com várias contas e provedores: contas conectadas, pastas, estado de sincronização por pasta e a
-- identidade externa de mensagens (para relacionar mensagens no futuro). NADA mais.
-- O QUE NÃO ESTÁ AQUI, DE PROPÓSITO (decisões do dono e do Documento 10, seções 5.1, 5.2 e 6):
--   - nenhuma senha, senha de app Apple, token OAuth, código de autorização ou outra credencial (nenhuma coluna para isso; o teste confere os nomes);
--   - nenhum conteúdo de e-mail: sem assunto, remetente, destinatário, corpo, trecho ou anexo; só a identidade da mensagem (conta, pasta, UID);
--   - nenhum texto livre vindo do provedor: erro e uso da pasta são códigos de lista fechada (nunca a mensagem do servidor);
--   - nenhum privilégio para anon nem para service_role (o site fala com o banco como o dono; nada aqui precisa de chave de serviço).
-- Acesso: SÓ O DONO (auth.uid() e quem é membro da casa, tabela membros, fica de fora: a Fernanda não vê nada) + trava restritiva "mfa" (2ª etapa).
-- Isolamento por construção: toda tabela filha referencia a pai por chave COMPOSTA que inclui o dono (e a conta), então uma linha nunca aponta
-- para conta ou pasta de outra pessoa nem de outra conta, mesmo que alguém tente gravar IDs coincidentes.
-- Provedor: validado por FORMATO, não por lista fechada (igual ao precedente da 048): um provedor novo não exige migration.
begin;

-- 1) Contas conectadas (uma linha por caixa de e-mail do dono). Sem credencial: a credencial é fornecida por operação, fora do banco.
create table if not exists public.inbox_contas (
  id            uuid primary key default gen_random_uuid(),
  dono          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provedor      text not null check (provedor ~ '^[a-z][a-z0-9_]{1,31}$'),
  apelido       text not null check (length(btrim(apelido)) between 1 and 60),
  endereco      text not null check (length(endereco) <= 254 and endereco ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  estado        text not null default 'nova'
                check (estado in ('nova', 'conectada', 'sincronizando', 'atrasada', 'erro_autenticacao', 'desconectada')),
  ultimo_erro   text check (ultimo_erro is null or ultimo_erro ~ '^[a-z][a-z0-9_]{1,40}$'),   -- código fechado; nunca o texto do servidor
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz,
  unique (id, dono)
);
create unique index if not exists inbox_contas_endereco_unico on public.inbox_contas (dono, provedor, lower(endereco));

-- 2) Pastas (caixas) de cada conta
create table if not exists public.inbox_pastas (
  id            uuid primary key default gen_random_uuid(),
  dono          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  conta_id      uuid not null,
  nome_externo  text not null check (length(nome_externo) between 1 and 200),   -- o caminho da pasta no provedor (ex.: INBOX)
  uso           text not null default 'outra'
                check (uso in ('entrada', 'enviados', 'rascunhos', 'lixo', 'spam', 'arquivo', 'outra')),
  total         integer check (total is null or total >= 0),
  nao_lidas     integer check (nao_lidas is null or nao_lidas >= 0),
  ativa         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz,
  constraint inbox_pastas_conta foreign key (conta_id, dono) references public.inbox_contas (id, dono) on delete cascade,
  constraint inbox_pastas_contagem check (nao_lidas is null or total is null or nao_lidas <= total),
  unique (conta_id, nome_externo),
  unique (id, conta_id, dono)
);

-- 3) Estado de sincronização: uma linha por pasta (o cursor do IMAP é o par UIDVALIDITY/UIDNEXT; o vocabulário de "tipo" é o da P6, comprovada)
create table if not exists public.inbox_sincronizacao (
  id                  uuid primary key default gen_random_uuid(),
  dono                uuid not null default auth.uid() references auth.users(id) on delete cascade,
  conta_id            uuid not null,
  pasta_id            uuid not null unique,
  uidvalidity         bigint check (uidvalidity is null or uidvalidity between 1 and 4294967295),
  uidnext             bigint check (uidnext is null or uidnext between 1 and 4294967295),
  tipo_ultima         text check (tipo_ultima is null or tipo_ultima in ('primeira_leitura', 'sem_mudanca', 'novas_mensagens', 'uidvalidity_mudou', 'uidnext_regrediu')),
  ultima_ok_em        timestamptz,
  ultima_tentativa_em timestamptz,
  falhas_seguidas     integer not null default 0 check (falhas_seguidas >= 0),
  duracao_ms          integer check (duracao_ms is null or duracao_ms >= 0),
  erro                text check (erro is null or erro ~ '^[a-z][a-z0-9_]{1,40}$'),
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz,
  constraint inbox_sinc_pasta foreign key (pasta_id, conta_id, dono) references public.inbox_pastas (id, conta_id, dono) on delete cascade,
  constraint inbox_sinc_cursor check ((uidvalidity is null) = (uidnext is null))   -- o cursor existe inteiro ou não existe
);

-- 4) Identidade externa da mensagem (conta + pasta + ID original). SEM conteúdo: é só o que permite relacionar a mensagem depois.
--    Nada grava aqui na I1 (a leitura de mensagens é da I2); só leitura e remoção (o dono pode limpar o índice sem tocar na caixa original).
create table if not exists public.inbox_mensagens_ref (
  id          uuid primary key default gen_random_uuid(),
  dono        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  conta_id    uuid not null,
  pasta_id    uuid,
  id_externo  text not null check (length(id_externo) between 1 and 200),   -- o ID original no provedor (IMAP: "uidvalidity:uid")
  uidvalidity bigint check (uidvalidity is null or uidvalidity between 1 and 4294967295),
  uid         bigint check (uid is null or uid between 1 and 4294967295),
  criado_em   timestamptz not null default now(),
  constraint inbox_ref_conta foreign key (conta_id, dono) references public.inbox_contas (id, dono) on delete cascade,
  constraint inbox_ref_pasta foreign key (pasta_id, conta_id, dono) references public.inbox_pastas (id, conta_id, dono) on delete cascade,
  constraint inbox_ref_uid check ((uidvalidity is null) = (uid is null))
);
create unique index if not exists inbox_ref_unica on public.inbox_mensagens_ref (conta_id, coalesce(pasta_id, '00000000-0000-0000-0000-000000000000'::uuid), id_externo);

-- 5) Segurança: RLS, só o dono (a casa fica de fora), trava "mfa", nada para anon
do $$
declare t text;
begin
  foreach t in array array['inbox_contas', 'inbox_pastas', 'inbox_sincronizacao', 'inbox_mensagens_ref'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "so o dono" on public.%I', t);
    execute format($p$create policy "so o dono" on public.%I for all to authenticated
      using (dono = (select auth.uid()) and not exists (select 1 from public.membros m where m.membro = (select auth.uid())))
      with check (dono = (select auth.uid()) and not exists (select 1 from public.membros m where m.membro = (select auth.uid())))$p$, t);
    execute format('drop policy if exists "mfa" on public.%I', t);
    execute format('create policy "mfa" on public.%I as restrictive for all to authenticated using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok()))', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;
grant select, insert, update, delete on public.inbox_contas, public.inbox_pastas, public.inbox_sincronizacao to authenticated;
grant select, insert, delete on public.inbox_mensagens_ref to authenticated;   -- sem update: a identidade da mensagem não se edita

-- 6) Integridade: o dono e a conta nunca mudam numa linha; atualizado_em é sempre do servidor
create or replace function public.inbox_integridade() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if new.dono is distinct from old.dono then
    raise exception 'o dono do registro não pode mudar' using errcode = '42501';
  end if;
  if tg_table_name <> 'inbox_contas' then   -- (só as filhas têm conta_id; if aninhado para não avaliar o campo na tabela de contas)
    if new.conta_id is distinct from old.conta_id then
      raise exception 'a conta do registro não pode mudar' using errcode = '42501';
    end if;
  end if;
  new.atualizado_em := now();
  return new;
end $$;
revoke all on function public.inbox_integridade() from public, anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['inbox_contas', 'inbox_pastas', 'inbox_sincronizacao'] loop
    execute format('drop trigger if exists inbox_integridade on public.%I', t);
    execute format('create trigger inbox_integridade before update on public.%I for each row execute function public.inbox_integridade()', t);
  end loop;
end $$;

-- 7) Catálogo da auditoria (só se a 050 já existir; migration nova entra no catálogo: tests/seguranca_catalogo.test.mjs)
do $$
begin
  if pg_catalog.to_regclass('public.seguranca_catalogo') is not null then
    insert into public.seguranca_catalogo (tabela, trava_mfa, backup, origem, motivo) values
      ('inbox_contas',        true, true, '051', 'RAC Inbox I1: contas de e-mail do dono (sem credencial); só exporta no backup'),
      ('inbox_pastas',        true, true, '051', 'RAC Inbox I1: pastas de cada conta; só exporta no backup'),
      ('inbox_sincronizacao', true, true, '051', 'RAC Inbox I1: cursor e estado de sincronização por pasta; só exporta no backup'),
      ('inbox_mensagens_ref', true, true, '051', 'RAC Inbox I1: identidade externa de mensagens, sem conteúdo; só exporta no backup')
    on conflict (tabela) do nothing;
  else
    raise notice 'seguranca_catalogo ainda não existe (050 pendente): rode a 050 e depois este arquivo de novo para catalogar as tabelas do Inbox';
  end if;
end $$;

commit;

-- conferir depois (só leitura):
--   select tablename, policyname, permissive from pg_policies where tablename like 'inbox\_%' order by 1, 2;   -- 8 linhas: "so o dono" e "mfa" (RESTRICTIVE) em cada uma das 4 tabelas
--   select relname from pg_class where relname like 'inbox\_%' and relkind = 'r' and not relrowsecurity;          -- nenhuma
--   select table_name from information_schema.role_table_grants where grantee = 'anon' and table_name like 'inbox\_%';   -- nenhuma
