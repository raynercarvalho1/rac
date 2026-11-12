-- DIAGNÓSTICO SÓ DE LEITURA (048): de onde vêm REFERENCES, TRIGGER e TRUNCATE do service_role em radar_consultas, radar_candidatos e radar_historico. Não altera nada (só consulta o catálogo: pg_class, pg_default_acl, pg_auth_members, pg_roles
-- e as funções has_table_privilege/aclexplode); não lê linhas das tabelas. Rode inteiro no SQL Editor: o resultado é UMA tabela com as colunas secao, objeto e detalhe (leia de cima para baixo; o guia de leitura está no chat).
-- Secões: 1 ACL explícita · 2 privilégios efetivos do service_role · 3 origem de cada privilégio efetivo · 4 papéis dos quais o service_role herda · 5 privilégios padrão (pg_default_acl) · 6 necessidade para a função radar.
with recursive
alvo(tabela) as (values ('radar_consultas'), ('radar_candidatos'), ('radar_historico')),
privilegios(p, ordem) as (values ('SELECT', 1), ('INSERT', 2), ('UPDATE', 3), ('DELETE', 4), ('TRUNCATE', 5), ('REFERENCES', 6), ('TRIGGER', 7)),
sr as (select r.oid, r.rolname, r.rolsuper, r.rolinherit, r.rolbypassrls from pg_roles r where r.rolname = 'service_role'),
rel as (select a.tabela, c.oid as toid, c.relowner, c.relacl, pg_get_userbyid(c.relowner) as dono from alvo a left join pg_class c on c.oid = to_regclass('public.' || a.tabela)),
-- papéis dos quais service_role herda privilégios (fechamento transitivo; só conta a associação que herda: inherit_option no PG16+, rolinherit antes)
heranca(role_oid, via) as (
  select m.roleid, pg_get_userbyid(m.roleid)::text from pg_auth_members m join sr on m.member = sr.oid where coalesce((to_jsonb(m) ->> 'inherit_option')::boolean, sr.rolinherit)
  union
  select m.roleid, h.via || ' > ' || pg_get_userbyid(m.roleid) from pg_auth_members m join heranca h on m.member = h.role_oid where coalesce((to_jsonb(m) ->> 'inherit_option')::boolean, true)
),
-- ACL explícita (se a tabela nunca recebeu GRANT, relacl é nulo e vale o padrão do dono)
acl as (
  select r.tabela, a.grantor, a.grantee, a.privilege_type as p, a.is_grantable, r.relacl is null as acl_nula
    from rel r cross join lateral aclexplode(coalesce(r.relacl, acldefault('r', r.relowner))) a where r.toid is not null
),
-- privilégios padrão (ALTER DEFAULT PRIVILEGES) que dão algo ao service_role ou a PUBLIC em tabelas do schema public (ou globais)
padrao as (
  select d.oid as defoid, pg_get_userbyid(d.defaclrole) as criador, d.defaclrole, coalesce(n.nspname, '(todos os schemas)') as schema_, d.defaclobjtype, d.defaclacl, a.grantee, a.privilege_type as p, a.grantor
    from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace cross join lateral aclexplode(d.defaclacl) a
   where d.defaclobjtype = 'r' and (d.defaclnamespace = 0 or n.nspname = 'public')
),
efetivo as (
  select r.tabela, v.p, v.ordem, r.toid is not null and has_table_privilege('service_role', r.toid, v.p) as tem
    from rel r cross join privilegios v
),
origem as (
  select e.tabela, e.p, e.ordem,
         array_remove(array[
           case when exists (select 1 from acl a where a.tabela = e.tabela and a.p = e.p and a.grantee = (select oid from sr)) then 'ACL direta ao service_role' end,
           case when exists (select 1 from acl a where a.tabela = e.tabela and a.p = e.p and a.grantee = 0) then 'PUBLIC (todos os papéis)' end,
           case when exists (select 1 from acl a join heranca h on h.role_oid = a.grantee where a.tabela = e.tabela and a.p = e.p)
                then 'herança de: ' || (select string_agg(distinct h.via, ' ; ') from acl a join heranca h on h.role_oid = a.grantee where a.tabela = e.tabela and a.p = e.p) end,
           case when (select r.relowner from rel r where r.tabela = e.tabela) = (select oid from sr)
                  or exists (select 1 from rel r join heranca h on h.role_oid = r.relowner where r.tabela = e.tabela) then 'service_role é (ou herda do) DONO da tabela' end,
           case when (select rolsuper from sr) then 'service_role é superusuário' end,
           case when exists (select 1 from padrao d join rel r on r.tabela = e.tabela where d.p = e.p and (d.grantee = (select oid from sr) or d.grantee = 0) and (d.defaclrole = r.relowner))
                then 'PROVÁVEL ORIGEM: privilégio padrão do dono (pg_default_acl) aplicado na criação da tabela' end
         ], null) as fontes
    from efetivo e where e.tem
),
necessario(tabela, p, motivo) as (values
  -- levantamento de supabase/functions/radar/index.ts (adm.from(...) e rpc): consultas select+insert; candidatos select+insert+update; histórico select+insert. O resto do orçamento passa pelas funções security definer.
  ('radar_consultas', 'SELECT', 'itensParaRotina lê as últimas buscas do item'), ('radar_consultas', 'INSERT', 'registrarConsulta grava as linhas de cache'),
  ('radar_candidatos', 'SELECT', 'candidatoPorId e gravarCandidatos leem os existentes'), ('radar_candidatos', 'INSERT', 'gravarCandidatos insere os anúncios novos'), ('radar_candidatos', 'UPDATE', 'gravarCandidatos atualiza o repetido; invalidarToken'),
  ('radar_historico', 'SELECT', 'ultimasObservacoes'), ('radar_historico', 'INSERT', 'inserirHistorico'))
select secao, objeto, detalhe from (

  -- 1) ACL explícita
  select 100 + row_number() over (order by r.tabela) as ordem, '1 ACL explícita' as secao, r.tabela as objeto,
         case when r.toid is null then 'TABELA NÃO EXISTE' else 'dono=' || r.dono || ' | relacl=' || coalesce(r.relacl::text, '(nula: vale o padrão do dono)') end as detalhe
    from rel r
  union all
  select 200 + row_number() over (order by a.tabela, a.grantee, a.grantor), '1 ACL explícita (por quem recebeu)', a.tabela,
         'grantee=' || case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end || ' | concedido por=' || pg_get_userbyid(a.grantor) || ' | privilégios=' || string_agg(a.p, ',' order by a.p) || case when bool_or(a.is_grantable) then ' | com GRANT OPTION' else '' end
    from acl a group by a.tabela, a.grantee, a.grantor

  union all
  -- 2) privilégios efetivos do service_role
  select 300 + row_number() over (order by e.tabela), '2 service_role efetivo', e.tabela,
         coalesce(string_agg(e.p, ',' order by e.ordem) filter (where e.tem), '(nenhum)') || ' | papel: bypassrls=' || (select rolbypassrls from sr) || ', herda=' || (select rolinherit from sr) || ', superuser=' || (select rolsuper from sr)
    from efetivo e group by e.tabela

  union all
  -- 3) origem de cada privilégio efetivo (um privilégio pode ter mais de uma fonte)
  select 400 + row_number() over (order by o.tabela, o.ordem), '3 origem do privilégio', o.tabela || ' · ' || o.p,
         case when cardinality(o.fontes) = 0 then 'SEM FONTE IDENTIFICADA na ACL, no PUBLIC, na herança nem no dono (investigar)' else array_to_string(o.fontes, ' + ') end
    from origem o

  union all
  -- 4) papéis dos quais o service_role herda
  select 500 + row_number() over (order by h.via), '4 papéis herdados', 'service_role', 'herda de: ' || h.via from (select distinct via from heranca) h
  union all
  select 599, '4 papéis herdados', 'service_role', case when not exists (select 1 from heranca) then 'não herda de nenhum papel' else 'veja as linhas acima' end

  union all
  -- 5) privilégios padrão
  select 600 + row_number() over (order by d.criador, d.schema_, d.grantee), '5 privilégios padrão (pg_default_acl)', 'criador=' || d.criador || ' · schema=' || d.schema_,
         'grantee=' || case when d.grantee = 0 then 'PUBLIC' else pg_get_userbyid(d.grantee) end || ' | privilégios=' || string_agg(d.p, ',' order by d.p) || ' | dono das 3 tabelas é este criador? ' || coalesce((select bool_or(r.relowner = d.defaclrole)::text from rel r), 'n/d')
    from padrao d group by d.criador, d.schema_, d.grantee, d.defaclrole
  union all
  select 699, '5 privilégios padrão (pg_default_acl)', '(resumo)', case when not exists (select 1 from padrao) then 'nenhum privilégio padrão para tabelas no schema public' else 'veja as linhas acima' end

  union all
  -- 6) o que a função radar realmente usa × o que o service_role tem
  select 700 + row_number() over (order by e.tabela, e.ordem), '6 necessidade (função radar)', e.tabela || ' · ' || e.p,
         case when n.p is not null and e.tem then 'NECESSÁRIO e presente: ' || n.motivo
              when n.p is not null and not e.tem then 'FALTA (a função precisa): ' || n.motivo
              when e.tem then 'EXCEDENTE: a função não usa; ' || case e.p when 'REFERENCES' then 'REFERENCES só importa a quem CRIA uma chave estrangeira; inserir em tabela filha não exige REFERENCES na tabela pai' when 'TRIGGER' then 'TRIGGER só importa a quem CRIA gatilho; os gatilhos existentes disparam sem esse privilégio' when 'TRUNCATE' then 'TRUNCATE esvazia a tabela (em radar_historico o gatilho de proteção o recusa; nas outras duas não há trava)' else 'a função não faz isso' end
              else 'ausente e não usado (correto)' end
    from efetivo e left join necessario n on n.tabela = e.tabela and n.p = e.p
) x
order by ordem;
