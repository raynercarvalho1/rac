-- CONFERÊNCIA SÓ DE LEITURA da 048 (Radar: descoberta de ofertas e orçamento atômico). Rode no SQL Editor DEPOIS de aplicar a 048. Só consulta o catálogo do Postgres (pg_class, pg_policies, pg_proc, privilégios):
-- não lê nenhuma linha das tabelas, não altera dado nem estrutura e não chama as funções. Resultado: uma linha por verificação; a coluna "ok" deve ser true em todas e a última linha ("TUDO OK") resume.
-- service_role: só os privilégios de DADOS (SELECT, INSERT, UPDATE, DELETE) são comparados, como na 047. REFERENCES, TRIGGER, TRUNCATE (e MAINTAIN no PG17) vêm do privilégio padrão do Supabase para tabelas criadas pelo postgres
-- (pg_default_acl; origem confirmada em 11/2026 pelo diagnóstico 048_diagnostico_privilegios_service_role.sql) e aparecem só como informação. anon e authenticated continuam comparados por inteiro.
-- Se alguma der false, a coluna "encontrado" mostra o que existe de verdade; não corrija nada à mão: avise antes.
with
tabelas(n) as (values ('radar_consultas'), ('radar_candidatos'), ('radar_historico')),
funcoes(n, assinatura) as (values
  ('radar_reservar_consulta', 'public.radar_reservar_consulta(uuid, uuid, text, text, text, text, text, text, integer, jsonb, boolean, timestamp with time zone, timestamp with time zone)'),
  ('radar_concluir_consulta', 'public.radar_concluir_consulta(uuid, uuid, text, integer, text, text, integer, integer)')),
privs(papel, tabela, esperado) as (values
  ('service_role', 'radar_consultas', 'INSERT,SELECT'), ('service_role', 'radar_candidatos', 'INSERT,SELECT,UPDATE'), ('service_role', 'radar_historico', 'INSERT,SELECT'),
  ('authenticated', 'radar_consultas', 'SELECT'), ('authenticated', 'radar_candidatos', 'DELETE,SELECT'), ('authenticated', 'radar_historico', 'SELECT'),
  ('anon', 'radar_consultas', ''), ('anon', 'radar_candidatos', ''), ('anon', 'radar_historico', '')),
colunas_site(coluna, esperado) as (values ('decisao', true), ('oferta_id', true), ('atualizado_em', true), ('preco', false), ('titulo', false), ('page_token', false), ('dono', false)),
verificacoes(ordem, verificacao, ok, encontrado) as (

  -- 1) as três tabelas existem e têm RLS ligado
  select 10 + row_number() over (order by t.n), 'tabela ' || t.n || ' existe com RLS ligado',
         coalesce(c.relrowsecurity, false) and c.relkind = 'r', coalesce('existe=' || (c.oid is not null) || ', rls=' || c.relrowsecurity, 'NÃO EXISTE')
    from tabelas t left join pg_class c on c.oid = to_regclass('public.' || t.n)

  union all
  -- 2) políticas esperadas: "so o dono" (permissiva) e "mfa" (restritiva), só para authenticated
  select 20 + row_number() over (order by t.n), 'políticas de ' || t.n || ': "so o dono" permissiva e "mfa" restritiva, só authenticated, e mais nenhuma',
         (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.n) = 2
         and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.n and p.policyname = 'so o dono' and p.permissive = 'PERMISSIVE' and p.roles = '{authenticated}' and p.cmd = 'ALL')
         and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.n and p.policyname = 'mfa' and p.permissive = 'RESTRICTIVE' and p.roles = '{authenticated}' and p.cmd = 'ALL'),
         coalesce((select string_agg(p.policyname || ':' || p.permissive || ':' || p.roles::text, ' | ' order by p.policyname) from pg_policies p where p.schemaname = 'public' and p.tablename = t.n), 'nenhuma')
    from tabelas t

  union all
  -- 3) as duas funções existem com a assinatura exata, security definer e search_path vazio
  select 30 + row_number() over (order by f.n), 'função ' || f.n || ' existe com a assinatura esperada, security definer e search_path vazio',
         p.oid is not null and p.prosecdef and p.proconfig @> array['search_path=""'],
         coalesce('assinatura=' || pg_get_function_identity_arguments(p.oid) || ', security_definer=' || p.prosecdef || ', config=' || coalesce(p.proconfig::text, 'nenhuma'), 'NÃO EXISTE com esta assinatura')
    from funcoes f left join pg_proc p on p.oid = to_regprocedure(f.assinatura)

  union all
  -- 4) execute: só service_role; anon, authenticated e PUBLIC não
  select 40 + row_number() over (order by f.n), 'execute de ' || f.n || ': service_role SIM; anon, authenticated e PUBLIC NÃO',
         p.oid is not null and has_function_privilege('service_role', p.oid, 'EXECUTE') and not has_function_privilege('anon', p.oid, 'EXECUTE') and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
         and not exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'),
         case when p.oid is null then 'NÃO EXISTE' else 'service_role=' || has_function_privilege('service_role', p.oid, 'EXECUTE') || ', anon=' || has_function_privilege('anon', p.oid, 'EXECUTE') || ', authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
              || ', public=' || exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') end
    from funcoes f left join pg_proc p on p.oid = to_regprocedure(f.assinatura)

  union all
  -- 5) nenhuma função de reconciliação (a ideia foi descartada) nem outra função radar_* security definer aberta ao anon
  select 50, 'não existe função radar_reconcil* e nenhuma função security definer radar_* é executável por anon ou authenticated',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'radar\_reconcil%')
         and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'radar\_%' and p.prosecdef and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))),
         coalesce((select string_agg(p.proname, ', ' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'radar\_%' and p.prosecdef), 'nenhuma função radar_* security definer')

  union all
  -- 6) privilégios de tabela exatos (nada a mais, nada a menos) para service_role, authenticated e anon
  select 60 + row_number() over (order by v.papel, v.tabela), 'privilégios de ' || v.papel || ' em ' || v.tabela || case when v.papel = 'service_role' then ' (dados) = [' else ' = [' end || v.esperado || ']',
         to_regclass('public.' || v.tabela) is not null and (case when v.papel = 'service_role' then x.dados else x.atual end) = v.esperado,
         case when to_regclass('public.' || v.tabela) is null then 'TABELA NÃO EXISTE' when v.papel = 'service_role' then '[' || x.dados || ']' || case when x.extras <> '' then ' + padrão da plataforma, informativo: [' || x.extras || ']' else '' end else '[' || x.atual || ']' end
    from privs v
    cross join lateral (select coalesce(string_agg(p, ',' order by p), '') as atual, coalesce(string_agg(p, ',' order by p) filter (where p in ('DELETE', 'INSERT', 'SELECT', 'UPDATE')), '') as dados,
                               coalesce(string_agg(p, ',' order by p) filter (where p not in ('DELETE', 'INSERT', 'SELECT', 'UPDATE')), '') as extras from unnest(array['DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE']) p
                         where to_regclass('public.' || v.tabela) is not null and has_table_privilege(v.papel, to_regclass('public.' || v.tabela)::oid, p)) x

  union all
  -- 7) o site (authenticated) só altera as colunas decisao, oferta_id e atualizado_em dos candidatos
  select 80 + row_number() over (order by c.coluna), 'authenticated ' || case when c.esperado then 'PODE' else 'NÃO pode' end || ' atualizar radar_candidatos.' || c.coluna,
         to_regclass('public.radar_candidatos') is not null and has_column_privilege('authenticated', to_regclass('public.radar_candidatos')::oid, c.coluna, 'UPDATE') = c.esperado,
         case when to_regclass('public.radar_candidatos') is null then 'TABELA NÃO EXISTE' else 'update=' || has_column_privilege('authenticated', to_regclass('public.radar_candidatos')::oid, c.coluna, 'UPDATE') end
    from colunas_site c

  union all
  -- 8) status "reservada" aceito pela restrição de radar_consultas, colunas finalizada_em presente e sem colunas reconciliada_*
  select 90, 'radar_consultas aceita status reservada, tem finalizada_em e não tem colunas reconciliada_*',
         exists (select 1 from pg_constraint k where k.conrelid = to_regclass('public.radar_consultas') and k.contype = 'c' and pg_get_constraintdef(k.oid) like '%reservada%')
         and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'radar_consultas' and column_name = 'finalizada_em')
         and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'radar_consultas' and column_name like 'reconciliada%'),
         coalesce((select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'radar_consultas' and column_name in ('finalizada_em', 'reconciliada_em', 'reconciliada_cobrada')), 'sem essas colunas')

  union all
  -- 9) histórico só de acréscimo: os dois gatilhos de proteção existem
  select 95, 'radar_historico tem os gatilhos radar_historico_so_acrescenta e radar_historico_sem_truncate',
         (select count(*) from pg_trigger g where g.tgrelid = to_regclass('public.radar_historico') and not g.tgisinternal and g.tgname in ('radar_historico_so_acrescenta', 'radar_historico_sem_truncate')) = 2,
         coalesce((select string_agg(g.tgname, ', ' order by g.tgname) from pg_trigger g where g.tgrelid = to_regclass('public.radar_historico') and not g.tgisinternal), 'nenhum')
)
select verificacao, ok, encontrado from (
  select ordem, verificacao, ok, encontrado from verificacoes
  union all
  select 1000, 'TUDO OK', bool_and(ok), count(*) filter (where not ok) || ' verificação(ões) com problema de ' || count(*) from verificacoes
) r
order by ordem;
