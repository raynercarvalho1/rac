-- Conferência da 064 (SÓ LEITURA): a política "casa compartilha" da tabela pessoal deve listar as 7 chaves, com a trava "mfa" ainda ativa.
select policyname, permissive, cmd,
       qual ~ 'mercado-areas' as tem_mercado_areas_no_using,
       with_check ~ 'mercado-areas' as tem_mercado_areas_no_check
  from pg_policies where schemaname = 'public' and tablename = 'pessoal' order by policyname;
-- esperado: "casa compartilha" com as duas colunas true; "mfa" restritiva presente; nenhuma política para anon.
select relrowsecurity as rls_ligado from pg_class where oid = 'public.pessoal'::regclass;
