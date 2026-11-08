-- Conferência da 039, SÓ LEITURA (nenhum comando altera dado). Rode no SQL Editor depois de aplicar supabase/039_nota_foto_sem_chave.sql. Rode cada bloco separado.
-- 1) a função continua definer, com search_path vazio, anon sem execução e authenticated com execução. Esperado: ok.
select 'funcao_definer_sem_anon' as item,
       case when p.prosecdef and p.proconfig @> array['search_path=""'] and not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute') then 'ok' else 'ERRO' end as resultado
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'nota_fiscal_salvar_doc';

-- 2) a função tem a regra nova (sem chave só com a revisão do dono). Esperado: ok.
select 'regra_sem_chave_com_revisao' as item,
       case when pg_get_functiondef('public.nota_fiscal_salvar_doc(jsonb,jsonb,jsonb,jsonb)'::regprocedure) like '%gravada por revisão do dono%' then 'ok' else 'ERRO' end as resultado;
