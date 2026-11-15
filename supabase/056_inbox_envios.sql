-- status: pendente
-- RAC Inbox · I3: controle de ENVIO de e-mail (docs/inbox.md, "Envio"). PREPARADA, NÃO APLICADA em produção (o dono roda no SQL Editor, com autorização própria). Pode rodar de novo sem estragar nada.
-- Ordem: 051 → 052 → 053 → este arquivo. A função rac-inbox (i3.1) exige esta tabela para enviar; sem ela, o envio responde "registro_envio_indisponivel" e NADA é enviado.
--
-- POR QUE EXISTE: evitar e-mail duplicado. Cada envio nasce com um identificador (envio_id) gerado pelo navegador; o Message-ID da mensagem é derivado dele. Repetir o mesmo envio_id (toque duplo,
-- reenvio depois de timeout) nunca transmite de novo quando o estado já é "enviado" ou "incerto": a função devolve o estado registrado.
-- O QUE GUARDA (só metadados): estado, o Message-ID, o modo, o número de destinatários e o código fechado do resultado. NUNCA corpo, assunto, endereços de destinatário, anexos ou credencial.
-- Segurança: RLS só do dono (a casa fica de fora), trava "mfa", nada para anon. O navegador só LÊ (a função grava, como dona das tabelas): insert/update/delete não são concedidos ao site.
begin;

create table if not exists public.inbox_envios (
  id            uuid primary key,                                   -- envio_id (gerado no navegador; único no mundo)
  dono          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  conta_id      uuid not null,
  estado        text not null check (estado in ('pendente', 'enviado', 'falha', 'incerto')),
  message_id    text not null check (length(message_id) <= 255),
  modo          text not null check (modo in ('novo', 'responder', 'responder_todos', 'encaminhar')),
  destinatarios smallint not null check (destinatarios between 1 and 20),
  codigo        text check (codigo is null or codigo ~ '^[a-z][a-z0-9_]{1,40}$'),   -- código fechado do resultado (nunca texto livre)
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id, dono),
  constraint inbox_envios_conta foreign key (conta_id, dono) references public.inbox_contas (id, dono) on delete cascade
);
create index if not exists inbox_envios_conta_data on public.inbox_envios (conta_id, criado_em desc);

do $$
declare t text;
begin
  foreach t in array array['inbox_envios'] loop
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
grant select on public.inbox_envios to authenticated;   -- só leitura para o site; quem grava é a função (conexão direta, dona da tabela)

drop trigger if exists inbox_integridade on public.inbox_envios;
create trigger inbox_integridade before update on public.inbox_envios for each row execute function public.inbox_integridade();

do $$
begin
  if pg_catalog.to_regclass('public.seguranca_catalogo') is not null then
    insert into public.seguranca_catalogo (tabela, trava_mfa, backup, origem, motivo) values
      ('inbox_envios', true, false, '056', 'RAC Inbox I3: controle anti-duplicidade de envio (só metadados); registro técnico, não vai para o backup')
    on conflict (tabela) do nothing;
  else
    raise notice 'seguranca_catalogo ainda não existe (050 pendente): rode a 050 e depois este arquivo de novo para catalogar a tabela do envio';
  end if;
end $$;

commit;

-- conferir depois (só leitura):
--   select policyname, permissive from pg_policies where tablename = 'inbox_envios' order by 1;                                  -- 2 linhas: "so o dono" e "mfa" (RESTRICTIVE)
--   select relrowsecurity from pg_class where relname = 'inbox_envios';                                                            -- true
--   select grantee, privilege_type from information_schema.role_table_grants where table_name = 'inbox_envios' and grantee in ('anon','authenticated');   -- só authenticated SELECT
