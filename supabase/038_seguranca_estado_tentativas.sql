-- PROPOSTA 038 · NÃO APLICADA EM PRODUÇÃO (Lote 1.6). O dono roda no SQL Editor do Supabase ANTES do site novo ir ao ar (o site funciona sem ela, mas a auditoria não enxerga as tabelas novas).
-- Por que existe: a auditoria seguranca_estado() (022, atualizada pela 033) tem uma lista fixa das tabelas pessoais para conferir a trava "mfa" da 2ª etapa.
-- A 037 criou notas_fiscais_tentativas e notas_fiscais_situacoes (com a política "mfa"), mas a lista ainda não as conhece: se alguém remover a trava delas, a auditoria não avisaria.
-- O que muda: SÓ a função seguranca_estado() é recriada, igual à da 033 + as duas tabelas na lista. Não cria tabela, não altera dado, política, gatilho nem permissão de nada.
-- Pode rodar de novo sem estragar nada. ATENÇÃO: se o 022 ou o 033 rodarem de novo depois, recriam a função com a lista antiga: rode este 038 em seguida.
-- Ordem: 022 → 033 → 037 → 038. Conferência depois de aplicar: supabase/conferencias/038_conferir_producao.sql (só leitura).
begin;

create or replace function public.seguranca_estado() returns jsonb
  language plpgsql stable security definer set search_path = '' as $$
declare
  pessoais text[] := array['mercados', 'produtos', 'notas', 'itens', 'orcamentos', 'membros', 'pessoal', 'registros',
    'garmin_dia', 'garmin_ativ', 'erros', 'rotina_log', 'lista', 'bebe', 'push_inscricoes', 'ia_config', 'ia_uso',
    'ia_cobranca', 'newsletter_edicoes', 'newsletter_avisos', 'pedidos', 'pedido_itens', 'compras_online', 'compras_online_itens', 'compras_online_docs',
    'compras_importacoes', 'compras_reembolsos', 'compras_reembolsos_estornos', 'notas_fiscais', 'notas_fiscais_itens', 'notas_fiscais_docs', 'notas_fiscais_vinculos',
    'notas_fiscais_tentativas', 'notas_fiscais_situacoes', 'seguranca_eventos'];
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
