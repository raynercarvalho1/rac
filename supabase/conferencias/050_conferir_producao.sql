-- CONFERÊNCIA SÓ DE LEITURA da 050 (catálogo da auditoria de segurança, Fase 2 · A6). Rode no SQL Editor DEPOIS de aplicar a 050.
-- Só consulta o catálogo do Postgres e a tabela seguranca_catalogo (nomes de tabelas, nenhum dado pessoal); não altera nada e não chama funções.
-- Resultado: uma linha por verificação; a coluna "ok" deve ser true em todas, e a última linha ("TUDO OK") também. Se alguma der false, a coluna
-- "encontrado" mostra o que existe de verdade; não corrija nada à mão: avise antes.
with
verificacoes(ordem, verificacao, ok, encontrado) as (
  select 1, 'seguranca_catalogo existe com RLS ligado', coalesce(c.relrowsecurity, false), coalesce('rls=' || c.relrowsecurity, 'NÃO EXISTE')
    from (select 1) x left join pg_catalog.pg_class c on c.oid = pg_catalog.to_regclass('public.seguranca_catalogo')
  union all
  select 2, 'ninguém do site lê nem grava o catálogo (anon, authenticated, service_role)',
         not exists (select 1 from (values ('anon'), ('authenticated'), ('service_role')) r(p), (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) q(k)
                      where pg_catalog.has_table_privilege(r.p, 'public.seguranca_catalogo', q.k)),
         coalesce((select string_agg(r.p || ':' || q.k, ', ') from (values ('anon'), ('authenticated'), ('service_role')) r(p), (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) q(k)
                    where pg_catalog.has_table_privilege(r.p, 'public.seguranca_catalogo', q.k)), 'nenhum')
  union all
  select 3, '47 linhas no catálogo, 44 com a trava "mfa" (as mesmas da 048)',
         (select count(*) from public.seguranca_catalogo) = 47 and (select count(*) from public.seguranca_catalogo where trava_mfa) = 44,
         (select count(*) || ' linhas, ' || count(*) filter (where trava_mfa) || ' com trava' from public.seguranca_catalogo)
  union all
  select 4, 'nenhuma tabela de public fora do catálogo',
         not exists (select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                      where n.nspname = 'public' and c.relkind in ('r', 'p') and not exists (select 1 from public.seguranca_catalogo k where k.tabela = c.relname)),
         coalesce((select string_agg(c.relname, ', ' order by c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relkind in ('r', 'p') and not exists (select 1 from public.seguranca_catalogo k where k.tabela = c.relname)), 'nenhuma')
  union all
  select 5, 'toda tabela do catálogo com trava_mfa tem a política restritiva "mfa"',
         not exists (select 1 from public.seguranca_catalogo k where k.trava_mfa and pg_catalog.to_regclass('public.' || k.tabela) is not null
                      and not exists (select 1 from pg_catalog.pg_policies p where p.schemaname = 'public' and p.tablename = k.tabela and p.policyname = 'mfa' and p.permissive = 'RESTRICTIVE')),
         coalesce((select string_agg(k.tabela, ', ' order by k.tabela) from public.seguranca_catalogo k where k.trava_mfa and pg_catalog.to_regclass('public.' || k.tabela) is not null
                    and not exists (select 1 from pg_catalog.pg_policies p where p.schemaname = 'public' and p.tablename = k.tabela and p.policyname = 'mfa' and p.permissive = 'RESTRICTIVE')), 'todas')
  union all
  select 6, 'seguranca_estado() lê o catálogo (sem lista fixa) e continua fechada para quem não entrou',
         position('seguranca_catalogo' in pg_catalog.pg_get_functiondef('public.seguranca_estado()'::regprocedure)) > 0
           and position('unnest(pessoais)' in pg_catalog.pg_get_functiondef('public.seguranca_estado()'::regprocedure)) = 0
           and not pg_catalog.has_function_privilege('anon', 'public.seguranca_estado()', 'EXECUTE'),
         'anon executa=' || pg_catalog.has_function_privilege('anon', 'public.seguranca_estado()', 'EXECUTE')
)
select ordem, verificacao, ok, encontrado from verificacoes
union all
select 99, 'TUDO OK', bool_and(ok), '' from verificacoes
order by ordem;
