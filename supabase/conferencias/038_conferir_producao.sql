-- Conferência da 038, SÓ LEITURA (nenhum comando altera dado). Rode no SQL Editor depois de aplicar a supabase/038_seguranca_estado_tentativas.sql.
-- 1) a função existe, é definer, tem search_path vazio e anon não executa; 2) a lista de tabelas pessoais cita as duas tabelas da 037;
-- 3) as duas tabelas têm a política restritiva "mfa". Esperado: tudo "ok".
select 'funcao_definer_sem_anon' as item,
       case when p.prosecdef and p.proconfig @> array['search_path=""'] and not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute') then 'ok' else 'ERRO' end as resultado
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'seguranca_estado';
select 'lista_cita_tentativas' as item, case when pg_get_functiondef('public.seguranca_estado()'::regprocedure) like '%notas_fiscais_tentativas%' then 'ok' else 'ERRO' end as resultado
union all
select 'lista_cita_situacoes', case when pg_get_functiondef('public.seguranca_estado()'::regprocedure) like '%notas_fiscais_situacoes%' then 'ok' else 'ERRO' end;
select t as tabela, case when exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t and p.policyname = 'mfa' and p.permissive = 'RESTRICTIVE') then 'ok' else 'ERRO' end as trava_mfa
  from unnest(array['notas_fiscais_tentativas', 'notas_fiscais_situacoes']) t;
