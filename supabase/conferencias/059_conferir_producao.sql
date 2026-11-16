-- Conferência da 059, SÓ LEITURA (nenhum comando altera dado). Rode no SQL Editor depois de aplicar a supabase/059_central_fiscal_entrada_unica.sql. Esperado: tudo "ok".
-- 1) a tabela existe, com RLS, sem acesso do anon, só SELECT para quem entrou, políticas "casa" e "mfa" (restritiva); 2) as funções existem, são definer com search_path vazio, e o anon não executa nenhuma;
-- 3) só as duas funções públicas são executáveis por quem entrou (os ajudantes internos não); 4) a função da 040 (uuid, boolean) não existe; 5) o gatilho de revisão está ligado; 6) seguranca_estado() cita a tabela nova.
select 'tabela_rls_sem_anon_so_select' as item,
       case when c.relrowsecurity and not has_table_privilege('anon', c.oid, 'select')
             and (select string_agg(a.privilege_type, ',' order by a.privilege_type) from aclexplode(c.relacl) a where a.grantee = 'authenticated'::regrole) = 'SELECT' then 'ok' else 'ERRO' end as resultado
  from pg_class c where c.oid = 'public.notas_fiscais_entradas'::regclass;
select p.policyname as politica, case when (p.policyname = 'casa' and p.permissive = 'PERMISSIVE' and p.cmd = 'SELECT') or (p.policyname = 'mfa' and p.permissive = 'RESTRICTIVE') then 'ok' else 'ERRO' end as resultado
  from pg_policies p where p.schemaname = 'public' and p.tablename = 'notas_fiscais_entradas';
select p.proname as funcao, p.pronargs as argumentos,
       case when p.prosecdef and p.proconfig @> array['search_path=""'] and not has_function_privilege('anon', p.oid, 'execute') then 'ok' else 'ERRO' end as definer_sem_anon,
       case when p.proname in ('nota_fiscal_confirmar', 'nota_fiscal_entrada_mercado') then (case when has_function_privilege('authenticated', p.oid, 'execute') then 'ok' else 'ERRO' end)
            else (case when not has_function_privilege('authenticated', p.oid, 'execute') then 'ok' else 'ERRO (interna não pode ser chamável)' end) end as quem_entrou
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('nf_mercado_lancar', 'nf_entrada_processar', 'nota_fiscal_confirmar', 'nota_fiscal_entrada_mercado', 'notas_fiscais_entradas_revisar');
select 'funcao_040_ausente' as item, case when to_regprocedure('public.nota_fiscal_entrada_mercado(uuid,boolean)') is null then 'ok' else 'ERRO (a 040 foi aplicada)' end as resultado
union all
select 'gatilho_revisar', case when exists (select 1 from pg_trigger t where t.tgrelid = 'public.notas_fiscais'::regclass and t.tgname = 'notas_fiscais_entradas_revisar' and t.tgenabled = 'O') then 'ok' else 'ERRO' end
union all
select 'auditoria_conhece_a_tabela', case when pg_get_functiondef('public.seguranca_estado()'::regprocedure) like '%notas_fiscais_entradas%' or (to_regclass('public.seguranca_catalogo') is not null and exists (select 1 from public.seguranca_catalogo where tabela = 'notas_fiscais_entradas')) then 'ok' else 'ERRO' end
union all
select 'entradas_com_problema', (select count(*)::text || ' em estado falhou ou pendente (esperado 0; se houver, use "Tentar de novo" no site)' from public.notas_fiscais_entradas where estado in ('falhou', 'pendente'));
