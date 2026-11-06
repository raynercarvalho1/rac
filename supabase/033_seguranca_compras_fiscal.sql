-- status: pendente (preparado no repositório; ainda não rodou no banco — tire esta linha depois de rodar e conferir)
-- Segurança das tabelas das migrations 030, 031 e 032 (Compras multiorigem, Reembolsos, Central Fiscal). Rode DEPOIS delas e do 022.
-- Pode rodar de novo sem estragar nada. PENDENTE DE REVISÃO: preparado no repositório; não foi executado em nenhum banco.
--
-- Por que existe: o 022 é histórico (já aplicado em produção) e fica exatamente como está. Ele tem a lista das tabelas pessoais da trava da
-- 2ª etapa e da auditoria seguranca_estado(); em vez de editá-lo, este arquivo cobre as tabelas novas. As migrations 030/031/032 já criam a
-- política "mfa" das próprias tabelas; aqui ela é reafirmada (idempotente), o fechamento para anon é conferido de novo e a auditoria passa a enxergar
-- as tabelas novas.
-- ATENÇÃO: o 022, se rodar de novo, recria seguranca_estado() com a lista antiga. Sempre que isso acontecer, rode este 033 em seguida.
-- Ordem: 022 (já aplicado) → 030 → 031 → 032 → 033. Não liga MFA para ninguém, não abre permissão nenhuma e não toca em IA, Garmin, cofres nem dados.
begin;

-- 1) Trava da 2ª etapa, RLS e privilégios das tabelas novas; propriedades das vistas de créditos. Tabela que ainda não existe é pulada.
--    • RLS ligado e política restritiva "mfa" (aal2 para quem tem fator confirmado) — a trava é política da TABELA; a vista só a herda via security_invoker.
--    • Privilégios mínimos: tira tudo de anon e de authenticated (inclui TRUNCATE, REFERENCES, TRIGGER que o Supabase dá por padrão) e devolve só o necessário.
--      Estornos: só select e insert (o histórico só acrescenta). Vistas: só select (vista simples aceitaria update/delete).
--    • As vistas precisam do PostgreSQL 15+ (security_invoker): em versão menor a migration para com erro, sem deixar a vista aberta.
do $$
declare t text;
begin
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'security_invoker exige PostgreSQL 15 ou mais (versão atual: %)', current_setting('server_version');
  end if;
  foreach t in array array['compras_importacoes', 'compras_reembolsos', 'compras_reembolsos_estornos', 'notas_fiscais', 'notas_fiscais_itens', 'notas_fiscais_docs', 'notas_fiscais_vinculos'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists "mfa" on public.%I', t);
      execute format('create policy "mfa" on public.%I as restrictive for all to authenticated using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok()))', t);
      execute format('revoke all on public.%I from anon, authenticated', t);
      if t = 'compras_reembolsos_estornos' then
        execute format('grant select, insert on public.%I to authenticated', t);
      else
        execute format('grant select, insert, update, delete on public.%I to authenticated', t);
      end if;
      execute format('grant select on public.%I to service_role', t);
    end if;
  end loop;
  foreach t in array array['compras_creditos', 'compras_creditos_historico'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter view public.%I set (security_invoker = true)', t);
      execute format('revoke all on public.%I from anon, authenticated', t);
      execute format('grant select on public.%I to authenticated, service_role', t);
    end if;
  end loop;
end $$;

-- 2) Auditoria vista de dentro do banco: a mesma função do 022, com as tabelas novas na lista de "sem trava da 2ª etapa".
create or replace function public.seguranca_estado() returns jsonb
  language plpgsql stable security definer set search_path = '' as $$
declare
  pessoais text[] := array['mercados', 'produtos', 'notas', 'itens', 'orcamentos', 'membros', 'pessoal', 'registros',
    'garmin_dia', 'garmin_ativ', 'erros', 'rotina_log', 'lista', 'bebe', 'push_inscricoes', 'ia_config', 'ia_uso',
    'ia_cobranca', 'newsletter_edicoes', 'newsletter_avisos', 'pedidos', 'pedido_itens', 'compras_online', 'compras_online_itens', 'compras_online_docs',
    'compras_importacoes', 'compras_reembolsos', 'compras_reembolsos_estornos', 'notas_fiscais', 'notas_fiscais_itens', 'notas_fiscais_docs', 'notas_fiscais_vinculos', 'seguranca_eventos'];
  r jsonb;
begin
  if (select auth.uid()) is null then raise exception 'sem login' using errcode = '42501'; end if;
  select jsonb_build_object(
    'aal', coalesce((select auth.jwt()->>'aal'), 'aal1'),
    'fatores', (select count(*) from auth.mfa_factors f where f.user_id = (select auth.uid()) and f.status = 'verified'),
    'sem_rls', coalesce((select jsonb_agg(c.relname order by c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), '[]'::jsonb),
    'anon_le', coalesce((select jsonb_agg(c.relname order by c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relkind in ('r', 'v', 'm') and pg_catalog.has_table_privilege('anon', c.oid, 'SELECT')), '[]'::jsonb),
    'sem_trava_mfa', coalesce((select jsonb_agg(t order by t) from unnest(pessoais) t
                where pg_catalog.to_regclass('public.' || t) is not null
                  and not exists (select 1 from pg_catalog.pg_policies p where p.schemaname = 'public' and p.tablename = t and p.policyname = 'mfa' and p.permissive = 'RESTRICTIVE')), '[]'::jsonb),
    'cofres_publicos', coalesce((select jsonb_agg(b.id order by b.id) from storage.buckets b where b.public), '[]'::jsonb),
    'funcoes_abertas', coalesce((select jsonb_agg(p.proname order by p.proname) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.prosecdef and pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')), '[]'::jsonb),
    'conferido', now()) into r;
  return r;
end $$;
revoke all on function public.seguranca_estado() from public, anon;
grant execute on function public.seguranca_estado() to authenticated;

commit;

notify pgrst, 'reload schema';
