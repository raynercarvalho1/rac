-- Conferência da 040, SÓ LEITURA (nenhum comando altera dado). Rode no SQL Editor depois de aplicar supabase/040_nota_fiscal_entrada_mercado.sql. Rode cada bloco separado.
-- 1) a função existe, é INVOKER (RLS e MFA valem), com search_path vazio, anon sem execução e authenticated com execução. Esperado: ok.
select 'funcao_invoker_sem_anon' as item,
       case when not p.prosecdef and p.proconfig @> array['search_path=""'] and not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute') then 'ok' else 'ERRO' end as resultado
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'nota_fiscal_entrada_mercado';

-- 2) nenhuma tabela, política ou gatilho novo: as tabelas do Mercado e dos vínculos seguem com RLS e a trava "mfa". Esperado: ok nas linhas.
select c.relname as tabela, case when c.relrowsecurity and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname and p.policyname = 'mfa' and p.permissive = 'RESTRICTIVE') then 'ok' else 'ERRO' end as rls_e_mfa
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname in ('mercados', 'produtos', 'notas', 'itens', 'notas_fiscais_vinculos') order by 1;
