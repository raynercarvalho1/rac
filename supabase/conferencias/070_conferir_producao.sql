-- CONFERÊNCIA SÓ DE LEITURA da 070 (espaços, permissões e Workspace; Lote 1 do novo RAC). Rode no SQL Editor (ou pelo Supabase MCP) DEPOIS de aplicar a 070.
-- Não altera nada e não chama funções que gravam: só consulta o catálogo do Postgres e conta linhas. Resultado: uma linha por verificação; "ok" deve ser true em todas e a última ("TUDO OK") também.
with
tabelas(t) as (values ('espacos'), ('espaco_membros'), ('workspace_paginas'), ('workspace_versoes'), ('workspace_pessoal')),
funcoes(f) as (values ('rac_papel_no_espaco'), ('rac_pode_no_espaco'), ('rac_meus_espacos'), ('ws_layout_valido'), ('ws_pode_na_pagina'), ('ws_pagina_antes'), ('ws_pagina_versionar'),
  ('rac_espaco_membro_guarda'), ('rac_iniciar_espacos'), ('rac_espaco_criar'), ('rac_espaco_membros'), ('rac_espaco_membro_definir'), ('rac_espaco_membro_remover'), ('rac_espaco_arquivar')),
verificacoes(ordem, verificacao, ok, encontrado) as (
  select 1, 'as 5 tabelas existem com RLS ligado',
         (select count(*) from tabelas x join pg_class c on c.oid = pg_catalog.to_regclass('public.' || x.t) where c.relrowsecurity) = 5,
         (select count(*) || ' de 5' from tabelas x join pg_class c on c.oid = pg_catalog.to_regclass('public.' || x.t) where c.relrowsecurity)
  union all
  select 2, 'cada tabela tem a política restritiva "mfa"',
         (select count(*) from tabelas x where exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = x.t and p.policyname = 'mfa' and p.permissive = 'RESTRICTIVE')) = 5,
         coalesce((select string_agg(x.t, ', ') from tabelas x where not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = x.t and p.policyname = 'mfa' and p.permissive = 'RESTRICTIVE')), 'todas')
  union all
  select 3, 'anon não tem nenhum privilégio nas tabelas nem executa as funções',
         not exists (select 1 from tabelas x, (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) q(k) where pg_catalog.has_table_privilege('anon', 'public.' || x.t, q.k))
           and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in (select f from funcoes) and pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')),
         'ver os privilégios de anon'
  union all
  select 4, 'authenticated só lê espacos, espaco_membros e workspace_versoes (sem escrita direta); páginas e preferências têm DML sob RLS',
         not exists (select 1 from (values ('espacos'), ('espaco_membros'), ('workspace_versoes')) x(t), (values ('INSERT'), ('UPDATE'), ('DELETE')) q(k) where pg_catalog.has_table_privilege('authenticated', 'public.' || x.t, q.k))
           and pg_catalog.has_table_privilege('authenticated', 'public.workspace_paginas', 'UPDATE'),
         'ver os privilégios de authenticated'
  union all
  select 5, 'as 14 funções existem, todas com search_path fixo e fora do alcance de anon',
         (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in (select f from funcoes)) = 14
           and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in (select f from funcoes) and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
         (select count(*) || ' funções' from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in (select f from funcoes))
  union all
  select 6, 'o seed: um espaço pessoal por usuário e a Casa de cada dono que tem linhas em membros',
         (select count(*) from public.espacos where tipo = 'pessoal') = (select count(*) from auth.users)
           and (select count(*) from public.espacos where casa_de is not null) = (select count(distinct dono) from public.membros),
         (select count(*) from public.espacos where tipo = 'pessoal') || ' pessoais para ' || (select count(*) from auth.users) || ' usuários; ' || (select count(*) from public.espacos where casa_de is not null) || ' Casa(s)'
  union all
  select 7, 'as 5 tabelas estão no catálogo da auditoria (origem 070, todas com trava) e não há tabela fora do catálogo',
         (select count(*) from public.seguranca_catalogo where origem = '070' and trava_mfa) = 5
           and not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p') and not exists (select 1 from public.seguranca_catalogo k where k.tabela = c.relname)),
         coalesce((select string_agg(c.relname, ', ') from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p') and not exists (select 1 from public.seguranca_catalogo k where k.tabela = c.relname)), 'nenhuma fora')
  union all
  select 8, 'o layout padrão e o validador funcionam (dois exemplos fixos; ws_layout_valido não grava nada)',
         public.ws_layout_valido('{"schema":1,"secoes":[]}'::jsonb) and not public.ws_layout_valido('{"schema":0,"secoes":[]}'::jsonb),
         'validador respondeu'
)
select ordem, verificacao, ok, encontrado from verificacoes
union all
select 99, 'TUDO OK', bool_and(ok), '' from verificacoes
order by ordem;
