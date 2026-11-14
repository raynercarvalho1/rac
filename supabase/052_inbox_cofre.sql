-- status: pendente
-- RAC Inbox · I1 (custódia de credenciais, docs/inbox.md): a credencial da conta de e-mail fica CRIPTOGRAFADA no Supabase Vault, ligada à conta e ao dono.
-- PREPARADA, NÃO APLICADA em produção (o dono roda no SQL Editor, com autorização própria). Pode rodar de novo sem estragar nada.
-- Ordem: 002 (membros) → 022 (rac_aal_ok) → 051 (inbox_contas) → este arquivo. Exige a extensão supabase_vault (já instalada, v0.3.1: Documento 10, seção 12.8).
-- Autorização do dono (14/11/2026): credenciais de provedores podem ser guardadas de forma persistente no Vault (substitui a regra anterior "nunca persistir").
--
-- O QUE FICA ONDE
--   Vault (cifrado em disco)        : o segredo (JSON com o login e a senha específica de app). Nome fixo "inbox_conta_<id da conta>": o nome liga o segredo à conta.
--   public.inbox_credenciais         : SÓ o ponteiro (id do segredo) e metadados não sensíveis (estado, datas). Sem coluna para senha. O site (authenticated) só LÊ
--                                      estado e datas; não lê o ponteiro, não insere, não altera, não apaga.
--   schema inbox_cofre (PRIVADO)     : as únicas funções que gravam, leem e removem o segredo. NÃO fica na Data API (não há RPC): só o dono das funções (postgres, usado
--                                      pela Edge Function por conexão direta) executa; anon, authenticated e service_role NÃO têm nem uso do schema.
-- COMO A CREDENCIAL ENTRA, SAI E MORRE
--   guardar : cria o segredo no Vault e a linha-ponteiro, ou, se já existe, SUBSTITUI o segredo no mesmo registro (vault.update_secret): nunca sobra segredo antigo.
--   ler     : devolve o segredo descriptografado SÓ para (dono, conta) que batem com o ponteiro e com o nome do segredo; sem credencial devolve nulo.
--   remover : apaga a linha; o gatilho apaga o segredo do Vault. Apagar a conta (ou o usuário) também apaga o segredo, porque a linha cai em cascata e o gatilho dispara.
-- Falha do Vault = a função inteira falha e desfaz tudo (uma transação): não existe caminho que grave o segredo em outro lugar.
-- Nenhuma função aqui escreve o segredo em log, aviso ou mensagem de erro. O dono confere o conjunto depois: select inbox_cofre.conferir();
begin;

create schema if not exists inbox_cofre;
revoke all on schema inbox_cofre from public, anon, authenticated, service_role;

-- 1) Ponteiro (sem segredo). A chave composta (conta, dono) garante que o segredo é da conta E do usuário dono dela.
create table if not exists public.inbox_credenciais (
  id                  uuid primary key default gen_random_uuid(),
  dono                uuid not null references auth.users(id) on delete cascade,
  conta_id            uuid not null unique,
  segredo_id          uuid not null unique,   -- id do segredo no Vault (ponteiro); o segredo em si nunca está aqui
  estado              text not null default 'ativa' check (estado in ('ativa', 'invalida')),
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz,
  ultima_validacao_em timestamptz,
  constraint inbox_cred_conta foreign key (conta_id, dono) references public.inbox_contas (id, dono) on delete cascade
);

-- 2) Segurança da tabela: RLS só do dono (a casa fora) + trava "mfa"; o site só LÊ colunas não sensíveis; nada para anon
do $$
declare t text;
begin
  foreach t in array array['inbox_credenciais'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "so o dono" on public.%I', t);
    execute format($p$create policy "so o dono" on public.%I for select to authenticated
      using (dono = (select auth.uid()) and not exists (select 1 from public.membros m where m.membro = (select auth.uid())))$p$, t);
    execute format('drop policy if exists "mfa" on public.%I', t);
    execute format('create policy "mfa" on public.%I as restrictive for all to authenticated using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok()))', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
  end loop;
end $$;
grant select (id, dono, conta_id, estado, criado_em, atualizado_em, ultima_validacao_em) on public.inbox_credenciais to authenticated;   -- NÃO inclui segredo_id

-- 3) Quando a linha-ponteiro some (remoção, conta apagada, usuário apagado), o segredo some junto do Vault
create or replace function inbox_cofre.apaga_segredo() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  delete from vault.secrets where id = old.segredo_id;
  return old;
end $$;
drop trigger if exists inbox_credenciais_apaga_segredo on public.inbox_credenciais;
create trigger inbox_credenciais_apaga_segredo after delete on public.inbox_credenciais
  for each row execute function inbox_cofre.apaga_segredo();

-- 4) O ponteiro não é editável por fora: dono, conta e segredo nunca mudam depois de criados
create or replace function inbox_cofre.fixa_ponteiro() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if new.dono is distinct from old.dono or new.conta_id is distinct from old.conta_id or new.segredo_id is distinct from old.segredo_id then
    raise exception 'ponteiro_imutavel' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists inbox_credenciais_fixa on public.inbox_credenciais;
create trigger inbox_credenciais_fixa before update on public.inbox_credenciais
  for each row execute function inbox_cofre.fixa_ponteiro();

-- 5) Funções do cofre (privadas). Cada uma exige dono e conta que batem, e recusa quem é da casa. Nunca escrevem o segredo em log nem em mensagem de erro.
create or replace function inbox_cofre.guardar(p_dono uuid, p_conta uuid, p_segredo text) returns void
  language plpgsql security definer set search_path = '' as $$
declare v_sid uuid; v_nome text := 'inbox_conta_' || p_conta::text;
begin
  if p_dono is null or p_conta is null or p_segredo is null or length(p_segredo) not between 1 and 600 then
    raise exception 'entrada_invalida' using errcode = '22023';
  end if;
  if exists (select 1 from public.membros m where m.membro = p_dono) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  perform 1 from public.inbox_contas c where c.id = p_conta and c.dono = p_dono for update;
  if not found then raise exception 'conta_inexistente' using errcode = 'P0002'; end if;
  select k.segredo_id into v_sid from public.inbox_credenciais k where k.conta_id = p_conta and k.dono = p_dono for update;
  if v_sid is null then
    v_sid := vault.create_secret(p_segredo, v_nome, 'RAC Inbox: credencial de conta de e-mail');
    insert into public.inbox_credenciais (dono, conta_id, segredo_id) values (p_dono, p_conta, v_sid);
  else
    perform vault.update_secret(v_sid, p_segredo, v_nome, 'RAC Inbox: credencial de conta de e-mail');   -- substitui no mesmo registro: não sobra segredo antigo
    update public.inbox_credenciais set estado = 'ativa', atualizado_em = now(), ultima_validacao_em = null where conta_id = p_conta and dono = p_dono;
  end if;
  update public.inbox_contas set estado = 'nova', ultimo_erro = null where id = p_conta and dono = p_dono and estado in ('erro_autenticacao', 'desconectada');
end $$;

create or replace function inbox_cofre.ler(p_dono uuid, p_conta uuid) returns text
  language plpgsql security definer set search_path = '' as $$
declare v_segredo text;
begin
  if p_dono is null or p_conta is null then raise exception 'entrada_invalida' using errcode = '22023'; end if;
  if exists (select 1 from public.membros m where m.membro = p_dono) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  select d.decrypted_secret into v_segredo
    from public.inbox_credenciais k
    join vault.decrypted_secrets d on d.id = k.segredo_id and d.name = 'inbox_conta_' || k.conta_id::text   -- o nome do segredo tem de ser o desta conta
   where k.conta_id = p_conta and k.dono = p_dono;
  return v_segredo;   -- nulo = sem credencial
end $$;

create or replace function inbox_cofre.remover(p_dono uuid, p_conta uuid) returns boolean
  language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if p_dono is null or p_conta is null then raise exception 'entrada_invalida' using errcode = '22023'; end if;
  if exists (select 1 from public.membros m where m.membro = p_dono) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  delete from public.inbox_credenciais where conta_id = p_conta and dono = p_dono;   -- o gatilho apaga o segredo do Vault
  get diagnostics n = row_count;
  update public.inbox_contas set estado = 'desconectada', ultimo_erro = null where id = p_conta and dono = p_dono;
  return n > 0;
end $$;

create or replace function inbox_cofre.estado(p_dono uuid, p_conta uuid) returns text
  language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  if p_dono is null or p_conta is null then raise exception 'entrada_invalida' using errcode = '22023'; end if;
  if exists (select 1 from public.membros m where m.membro = p_dono) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  select k.estado into v from public.inbox_credenciais k where k.conta_id = p_conta and k.dono = p_dono;
  return coalesce(v, 'ausente');
end $$;

-- a operação com a credencial deu certo ('ativa') ou o provedor recusou a autenticação ('invalida'); só muda o estado, nunca o segredo
create or replace function inbox_cofre.marcar(p_dono uuid, p_conta uuid, p_estado text) returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if p_dono is null or p_conta is null or p_estado not in ('ativa', 'invalida') then raise exception 'entrada_invalida' using errcode = '22023'; end if;
  if exists (select 1 from public.membros m where m.membro = p_dono) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  update public.inbox_credenciais set estado = p_estado, ultima_validacao_em = case when p_estado = 'ativa' then now() else ultima_validacao_em end, atualizado_em = now()
   where conta_id = p_conta and dono = p_dono;
  if not found then raise exception 'credencial_inexistente' using errcode = 'P0002'; end if;
  update public.inbox_contas set estado = case when p_estado = 'ativa' then 'conectada' else 'erro_autenticacao' end,
         ultimo_erro = case when p_estado = 'ativa' then null else 'credencial_invalida' end
   where id = p_conta and dono = p_dono;
end $$;

-- conferência para o dono (só leitura, só contagens e IDs; nunca o segredo): select inbox_cofre.conferir();
create or replace function inbox_cofre.conferir() returns jsonb
  language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'credenciais', (select count(*) from public.inbox_credenciais),
    'ponteiro_sem_segredo', (select count(*) from public.inbox_credenciais k where not exists (select 1 from vault.secrets s where s.id = k.segredo_id and s.name = 'inbox_conta_' || k.conta_id::text)),
    'segredo_sem_ponteiro', (select count(*) from vault.secrets s where s.name like 'inbox\_conta\_%' and not exists (select 1 from public.inbox_credenciais k where k.segredo_id = s.id)))
$$;

-- 6) Ninguém executa as funções do cofre a não ser o dono delas (postgres, pela conexão direta da Edge Function)
revoke all on function inbox_cofre.apaga_segredo() from public, anon, authenticated, service_role;
revoke all on function inbox_cofre.fixa_ponteiro() from public, anon, authenticated, service_role;
revoke all on function inbox_cofre.guardar(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function inbox_cofre.ler(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function inbox_cofre.remover(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function inbox_cofre.estado(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function inbox_cofre.marcar(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function inbox_cofre.conferir() from public, anon, authenticated, service_role;

-- 7) Catálogo da auditoria (só se a 050 já existir): com a trava e FORA do backup do site (o ponteiro restaurado apontaria para um segredo que não existe mais)
do $$
begin
  if pg_catalog.to_regclass('public.seguranca_catalogo') is not null then
    insert into public.seguranca_catalogo (tabela, trava_mfa, backup, origem, motivo) values
      ('inbox_credenciais', true, false, '052', 'RAC Inbox I1: ponteiro para a credencial no Vault (sem segredo); fora do backup, pois o segredo não sai do Vault')
    on conflict (tabela) do nothing;
  else
    raise notice 'seguranca_catalogo ainda não existe (050 pendente): rode a 050 e depois este arquivo de novo para catalogar a tabela';
  end if;
end $$;

commit;

-- conferir depois (só leitura, nenhum valor secreto):
--   select inbox_cofre.conferir();                                                                                  -- ponteiro_sem_segredo = 0 e segredo_sem_ponteiro = 0
--   select tablename, policyname, permissive from pg_policies where tablename = 'inbox_credenciais' order by 2;     -- "mfa" (RESTRICTIVE) e "so o dono"
--   select has_function_privilege('anon', 'inbox_cofre.ler(uuid, uuid)', 'execute'), has_function_privilege('authenticated', 'inbox_cofre.ler(uuid, uuid)', 'execute'),
--          has_function_privilege('service_role', 'inbox_cofre.ler(uuid, uuid)', 'execute');                         -- false, false, false
