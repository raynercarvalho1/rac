-- status: pendente
-- Central de Segurança (docs/seguranca.md): a 2ª etapa do login (MFA/TOTP) passa a valer também no banco, o histórico de
-- segurança (backups, restaurações, MFA) e a auditoria das permissões vista de dentro do banco.
-- Rode uma vez no SQL Editor, depois do 021. Pode rodar de novo sem estragar nada. Não liga MFA para ninguém:
-- quem não cadastrou um app autenticador continua entrando só com a senha, como hoje.

-- 1) A trava da 2ª etapa. Vale só para quem tem um fator TOTP confirmado: essa pessoa só lê e grava com a sessão
--    que passou pelo código (aal2). Quem não tem fator passa como hoje (aal1). A função é do servidor (security definer)
--    porque o papel authenticated não lê auth.mfa_factors; ela só responde sim/não sobre a própria conta.
create or replace function public.rac_aal_ok() returns boolean
  language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt()->>'aal'), 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = (select auth.uid()) and f.status = 'verified')
$$;
revoke all on function public.rac_aal_ok() from public, anon;
grant execute on function public.rac_aal_ok() to authenticated;

-- "as restrictive" soma com as regras que já existem (dono, casa): nenhuma delas fica mais aberta, só ganha a exigência.
-- O papel service_role (rotina, Garmin, IA, Newsletter) não passa por RLS e não muda.
do $$
declare t text;
begin
  foreach t in array array['mercados', 'produtos', 'notas', 'itens', 'orcamentos', 'membros', 'pessoal', 'registros',
    'garmin_dia', 'garmin_ativ', 'erros', 'rotina_log', 'lista', 'bebe', 'push_inscricoes', 'ia_config', 'ia_uso',
    'ia_cobranca', 'newsletter_edicoes', 'newsletter_avisos'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "mfa" on public.%I', t);
      execute format('create policy "mfa" on public.%I as restrictive for all to authenticated using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok()))', t);
    end if;
  end loop;
end $$;

-- os cofres de arquivos (fotos e PDFs da família, backups do servidor) seguem a mesma regra
drop policy if exists "mfa cofres" on storage.objects;
create policy "mfa cofres" on storage.objects as restrictive for all to authenticated
  using (bucket_id not in ('familia', 'backups') or (select public.rac_aal_ok()))
  with check (bucket_id not in ('familia', 'backups') or (select public.rac_aal_ok()));

-- 2) Histórico de segurança: só acrescenta (ninguém altera nem apaga uma linha pelo site)
create table if not exists public.seguranca_eventos (
  id      bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  quando  timestamptz not null default now(),
  tipo    text not null check (tipo in ('exportacao', 'restauracao', 'teste_restauracao', 'mfa_ativado', 'mfa_desativado',
                                       'passkey_cadastrada', 'passkey_removida', 'auditoria')),
  resumo  jsonb not null default '{}'::jsonb check (jsonb_typeof(resumo) = 'object' and pg_column_size(resumo) <= 20000)
);
create index if not exists seguranca_eventos_quando on public.seguranca_eventos (user_id, quando desc);
alter table public.seguranca_eventos enable row level security;
drop policy if exists "dono le" on public.seguranca_eventos;
create policy "dono le" on public.seguranca_eventos for select to authenticated using (user_id = auth.uid());
drop policy if exists "dono registra" on public.seguranca_eventos;
create policy "dono registra" on public.seguranca_eventos for insert to authenticated
  with check (user_id = auth.uid() and quando > now() - interval '5 minutes' and quando < now() + interval '5 minutes');
drop policy if exists "mfa" on public.seguranca_eventos;
create policy "mfa" on public.seguranca_eventos as restrictive for all to authenticated
  using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok()));
revoke all on public.seguranca_eventos from anon, authenticated;
grant select, insert on public.seguranca_eventos to authenticated;
grant select on public.seguranca_eventos to service_role;

-- 3) Auditoria vista de dentro do banco (só nomes de tabelas e regras, nenhum dado): o que está sem RLS, o que o
--    visitante sem login (anon) pode ler, onde falta a trava da 2ª etapa e se algum cofre de arquivos é público.
create or replace function public.seguranca_estado() returns jsonb
  language plpgsql stable security definer set search_path = '' as $$
declare
  pessoais text[] := array['mercados', 'produtos', 'notas', 'itens', 'orcamentos', 'membros', 'pessoal', 'registros',
    'garmin_dia', 'garmin_ativ', 'erros', 'rotina_log', 'lista', 'bebe', 'push_inscricoes', 'ia_config', 'ia_uso',
    'ia_cobranca', 'newsletter_edicoes', 'newsletter_avisos', 'seguranca_eventos'];
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
grant execute on function public.seguranca_estado() to authenticated;

notify pgrst, 'reload schema';
