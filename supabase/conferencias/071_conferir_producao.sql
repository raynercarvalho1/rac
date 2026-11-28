-- Conferência da 071 (Captura universal e Biblioteca básica) · SÓ LEITURA. Rode no SQL Editor depois de aplicar a 071.
-- Esperado: 2 tabelas com RLS ligado; políticas "mfa" RESTRICTIVE nas duas; 5 políticas "captura *" em storage.objects (4 permissivas + "mfa captura" restritiva); bucket "captura" privado de 52428800 bytes;
-- anon sem acesso (primeira consulta devolve false); nenhum cofre público; 2 linhas do catálogo (origem 071) com trava e backup.
select 'tabelas_com_rls' k, jsonb_agg(jsonb_build_object('t', c.relname, 'rls', c.relrowsecurity) order by c.relname) v
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('captura_itens', 'biblioteca_itens')
union all select 'politicas', jsonb_agg(tablename || ':' || policyname || ':' || permissive order by tablename, policyname)
  from pg_policies where (schemaname = 'public' and tablename in ('captura_itens', 'biblioteca_itens')) or (schemaname = 'storage' and policyname like '%captura%')
union all select 'bucket', jsonb_agg(jsonb_build_object('id', id, 'public', public, 'limite', file_size_limit)) from storage.buckets where id = 'captura'
union all select 'anon_tem_acesso', to_jsonb(has_table_privilege('anon', 'public.captura_itens', 'select') or has_table_privilege('anon', 'public.biblioteca_itens', 'select') or has_function_privilege('anon', 'public.cap_arquivo_pode(text,text)', 'execute'))
union all select 'catalogo', jsonb_agg(tabela || ':' || trava_mfa || ':' || backup) from public.seguranca_catalogo where origem = '071'
union all select 'cofres_publicos', coalesce(jsonb_agg(id), '[]'::jsonb) from storage.buckets where public;
