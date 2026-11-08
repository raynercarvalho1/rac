-- SOMENTE LEITURA. Conferência da migration 037 (supabase/propostas/037_notas_fiscais_foto_pdf.sql) depois de rodá-la no SQL Editor. Não altera nada.
-- Rode UM bloco por vez (o SQL Editor mostra só o resultado do último SELECT) e compare com "ESPERADO". O bloco 9 só vale depois de aplicar.
-- Também serve ANTES de aplicar: se o bloco 1 já mostrar as duas tabelas, a 037 já foi aplicada (ela é idempotente, mas não rode de novo sem necessidade).

-- 1) As duas tabelas novas, com RLS ligada.   ESPERADO: 2 linhas, rls = true
select c.relname as tabela, c.relrowsecurity as rls
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('notas_fiscais_tentativas', 'notas_fiscais_situacoes') order by 1;

-- 2) As funções (assinatura, definer, search_path, quem executa).
--    ESPERADO: 9 linhas, cada nome UMA vez. definer = true e search_path = {search_path=""} em nota_fiscal_salvar_doc, nf_tentativa_gravar, nf_path_registrado e notas_fiscais_hist_situacao
--    (as demais, invoker; todas com search_path vazio). exec_anon = false em todas. exec_authenticated = true SÓ em nota_fiscal_salvar_doc, nota_fiscal_atualizar_situacao e nf_path_registrado
--    (as funções de gatilho aparecem true por padrão do Supabase, mas não são chamáveis direto).
select p.proname, pg_get_function_identity_arguments(p.oid) as argumentos, p.prosecdef as definer, p.proconfig as config, p.prorettype::regtype::text as retorna,
       has_function_privilege('anon', p.oid, 'execute') as exec_anon, has_function_privilege('authenticated', p.oid, 'execute') as exec_authenticated
  from pg_proc p where p.pronamespace = 'public'::regnamespace
   and p.proname in ('nota_fiscal_salvar_doc', 'nota_fiscal_atualizar_situacao', 'nf_tentativa_gravar', 'nf_existente_casa', 'nf_path_registrado', 'notas_fiscais_hist_situacao',
                     'nf_tentativas_imutavel', 'nf_situacoes_imutavel', 'notas_fiscais_foto_regras')
 order by p.proname;

-- 3) Duplicação de objetos.   ESPERADO: nenhuma linha
select proname, count(*) from pg_proc where pronamespace = 'public'::regnamespace
   and proname in ('nota_fiscal_salvar_doc', 'nota_fiscal_atualizar_situacao', 'nf_tentativa_gravar', 'nf_existente_casa', 'nf_path_registrado', 'notas_fiscais_hist_situacao',
                   'nf_tentativas_imutavel', 'nf_situacoes_imutavel', 'notas_fiscais_foto_regras') group by 1 having count(*) > 1;

-- 4) Gatilhos (todos habilitados: tgenabled = 'O').   ESPERADO: 4 gatilhos novos (nf_tentativas_imutavel, nf_situacoes_imutavel, notas_fiscais_hist_situacao, notas_fiscais_foto_regras) + os da 032/034 de sempre
select t.tgrelid::regclass as tabela, t.tgname as gatilho, t.tgenabled as habilitado, pg_get_triggerdef(t.oid) as definicao
  from pg_trigger t where not t.tgisinternal and t.tgrelid::regclass::text like 'notas_fiscais%'
 order by 1, 2;

-- 5) Políticas.   ESPERADO: em notas_fiscais_tentativas e notas_fiscais_situacoes: "dono" (select, permissiva) e "mfa" (all, restritiva);
--    em notas_fiscais: + "foto so dono insere/altera/apaga" (restritivas); em notas_fiscais_itens e _docs: + as mesmas três; em storage.objects: as 2 da 034 + 2 "nf tentativa original ..."
select schemaname, tablename, policyname, cmd, permissive from pg_policies
 where (schemaname = 'public' and (tablename in ('notas_fiscais_tentativas', 'notas_fiscais_situacoes') or policyname like 'foto so dono%'))
    or (schemaname = 'storage' and policyname like 'nf %')
 order by schemaname, tablename, policyname;

-- 6) Privilégios das tabelas novas.   ESPERADO: authenticated só SELECT; anon nenhum; service_role SELECT
select grantee, table_name, privilege_type from information_schema.role_table_grants
 where table_schema = 'public' and table_name in ('notas_fiscais_tentativas', 'notas_fiscais_situacoes') and grantee in ('anon', 'authenticated', 'service_role')
 order by table_name, grantee, privilege_type;

-- 7) Constraints e índices das tabelas novas (sem erro se ainda não existirem: antes de aplicar, devolve 0 linhas).
--    ESPERADO depois de aplicar: pk, fks (nota_id set null; nota_id cascade; tentativa_id adiada), checks e o índice único (user_id, idem)
select c.conrelid::regclass as tabela, c.conname, c.contype, pg_get_constraintdef(c.oid) as definicao from pg_constraint c
 where c.conrelid in (select o.oid from pg_class o where o.relnamespace = 'public'::regnamespace and o.relname in ('notas_fiscais_tentativas', 'notas_fiscais_situacoes')) order by 1, 2;
select tablename, indexname from pg_indexes where schemaname = 'public' and tablename in ('notas_fiscais_tentativas', 'notas_fiscais_situacoes') order by 1, 2;

-- 8) O que já existia continua de pé.   Funciona ANTES e DEPOIS de aplicar.   ESPERADO: funcoes_xml_034 = 4; notas, itens e docs IGUAIS ao que eram antes de aplicar (a 037 não grava linha nenhuma)
select (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('nota_fiscal_salvar', 'nota_fiscal_conferir', 'nota_fiscal_existente', 'nota_fiscal_sem_registro')) as funcoes_xml_034,
       (select count(*) from public.notas_fiscais) as notas, (select count(*) from public.notas_fiscais_itens) as itens, (select count(*) from public.notas_fiscais_docs) as docs;

-- 9) SÓ DEPOIS de aplicar (antes dá erro "relation ... does not exist", o que também prova que ainda não foi aplicada).   ESPERADO: tentativas = 0 e situacoes = 0
select (select count(*) from public.notas_fiscais_tentativas) as tentativas, (select count(*) from public.notas_fiscais_situacoes) as situacoes;
