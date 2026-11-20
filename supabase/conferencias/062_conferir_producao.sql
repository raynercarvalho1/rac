-- Conferência da 062 (RAC Knowledge), SÓ LEITURA (nenhum comando altera dado). Rode no SQL Editor depois de aplicar supabase/062_conhecimento.sql. Esperado: tudo "ok".
-- 1) as duas tabelas existem com RLS e sem acesso do anon nem do service_role; 2) o site (authenticated) só tem SELECT no histórico; 3) cada tabela tem "so o dono" (permissiva) e "mfa" (RESTRICTIVE);
-- 4) o gatilho está ligado e as duas funções são definer com search_path vazio e fechadas para quem entra; 5) o catálogo da auditoria conhece as tabelas (se a 050 existir).
select c.relname as tabela,
       case when c.relrowsecurity and not has_table_privilege('anon', c.oid, 'select') and not has_table_privilege('service_role', c.oid, 'select') then 'ok' else 'ERRO' end as rls_sem_anon
  from pg_class c where c.oid in ('public.conhecimento'::regclass, 'public.conhecimento_historico'::regclass);
select 'historico_so_leitura' as item,
       case when has_table_privilege('authenticated', 'public.conhecimento_historico', 'select')
             and not has_table_privilege('authenticated', 'public.conhecimento_historico', 'insert')
             and not has_table_privilege('authenticated', 'public.conhecimento_historico', 'update')
             and not has_table_privilege('authenticated', 'public.conhecimento_historico', 'delete') then 'ok' else 'ERRO' end as res;
select p.tablename as tabela, p.policyname as politica,
       case when (p.policyname = 'so o dono' and p.permissive = 'PERMISSIVE') or (p.policyname = 'mfa' and p.permissive = 'RESTRICTIVE') then 'ok' else 'ERRO' end as res
  from pg_policies p where p.schemaname = 'public' and p.tablename in ('conhecimento', 'conhecimento_historico') order by 1, 2;
select 'gatilho_ligado' as item, case when exists (select 1 from pg_trigger t where t.tgrelid = 'public.conhecimento'::regclass and t.tgname = 'conhecimento_guarda' and t.tgenabled = 'O') then 'ok' else 'ERRO' end as res;
select p.proname as funcao,
       case when p.proname = 'conhecimento_guarda' and p.prosecdef and p.proconfig @> array['search_path=""'] then 'ok'
            when p.proname = 'conhecimento_segredo' and p.proconfig @> array['search_path=""'] then 'ok' else 'ERRO' end as definer_ou_vazio,
       case when not has_function_privilege('anon', p.oid, 'execute') and not has_function_privilege('authenticated', p.oid, 'execute') then 'ok' else 'ERRO (fechada para quem entra)' end as fechada
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('conhecimento_guarda', 'conhecimento_segredo');
select 'catalogo_conhece_as_tabelas' as item,
       case when to_regclass('public.seguranca_catalogo') is null then 'n/a (050 ainda não aplicada)'
            else (select case when count(*) = 2 then 'ok' else 'ERRO (rode a 062 de novo depois da 050)' end from public.seguranca_catalogo where tabela in ('conhecimento', 'conhecimento_historico')) end as res;
select 'registros' as item, (select count(*)::text from public.conhecimento) || ' registro(s) (0 logo após aplicar; a importação do repositório é feita pelo site)' as res;
