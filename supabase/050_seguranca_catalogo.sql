-- status: pendente
-- ============================================================================================================================================
-- 050 · AUDITORIA DE SEGURANÇA SEM LISTA FIXA (Fase 2 · A6; docs/planejamento/02-auditoria-arquitetural.md, P-11; docs/seguranca.md, "Catálogo
-- da auditoria"). PREPARADA E TESTADA (PGlite, tests/seguranca_catalogo.test.mjs), NÃO APLICADA. Só o dono roda no SQL Editor, com autorização
-- própria para isso; o site funciona igual antes e depois (a página Segurança só ganha uma linha na Auditoria quando a função nova existir).
-- O que faz:
--   1. cria public.seguranca_catalogo: a lista CONFIÁVEL das tabelas do esquema public e de como cada uma entra na auditoria
--      (trava_mfa = a política restritiva "mfa" é obrigatória) e no backup do site (backup = está em NUCLEO.SEG_TABELAS; um teste confere).
--      Só quem roda migration escreve nela: RLS ligado, nenhuma política e nenhum privilégio para anon, authenticated ou service_role.
--   2. preenche o catálogo com as 44 tabelas que a seguranca_estado() da 048 conferia (trava_mfa = true), as 2 que ela deixava de fora de
--      propósito (ia_precos e rac_segredos) e o próprio catálogo.
--   3. recria public.seguranca_estado() lendo o catálogo em vez da lista fixa. Tudo o mais é igual ao da 048 (RLS, anon, trava "mfa", cofres,
--      funções abertas), e há dois itens novos, só informativos:
--        fora_do_catalogo     tabela do esquema public que existe e NÃO está no catálogo. Ela não entra sozinha na conferência da trava (uma
--                             tabela não é confiável só por existir): aparece como pendência, para o dono decidir e catalogar;
--        catalogo_sem_tabela  linha do catálogo cuja tabela não existe (ex.: removida); a conferência da trava a ignora, como antes.
-- Tabela nova (procedimento em docs/seguranca.md): na própria migration que cria a tabela, além do RLS, do revoke e da trava "mfa":
--   insert into public.seguranca_catalogo (tabela, trava_mfa, backup, origem, motivo) values ('nova', true, true, 'NNN', '...') on conflict (tabela) do nothing;
--   e NÃO recriar seguranca_estado(). tests/seguranca_catalogo.test.mjs falha se uma migration depois da 050 criar tabela sem catalogá-la.
-- Depende de: 022 (rac_aal_ok, seguranca_eventos) e 048 (a seguranca_estado anterior, que esta substitui). Pode rodar de novo sem estragar
--   nada (create table if not exists, insert ... on conflict do nothing, create or replace). Rollback: recriar seguranca_estado() com o texto da
--   048 e depois drop table public.seguranca_catalogo.
begin;

create table if not exists public.seguranca_catalogo (
  tabela      text primary key check (tabela ~ '^[a-z_][a-z0-9_]{0,62}$'),
  trava_mfa   boolean not null,
  backup      boolean not null,
  origem      text not null check (origem ~ '^([0-9]{3}|schema)$'),
  motivo      text not null check (length(btrim(motivo)) between 3 and 300),
  incluida_em timestamptz not null default now(),
  constraint seguranca_catalogo_backup_pessoal check (not backup or trava_mfa)   -- o que vai para o backup do site é dado pessoal, com a trava
);
alter table public.seguranca_catalogo enable row level security;
revoke all on public.seguranca_catalogo from public, anon, authenticated, service_role;

insert into public.seguranca_catalogo (tabela, trava_mfa, backup, origem, motivo) values
  ('mercados', true, true, 'schema', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('produtos', true, true, 'schema', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('notas', true, true, 'schema', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('itens', true, true, 'schema', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('orcamentos', true, true, 'schema', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('membros', true, false, '002', 'dado da conta com trava "mfa"; fora do backup do site por decisão registrada em docs/seguranca.md (Backup)'),
  ('pessoal', true, true, '003', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('registros', true, true, '004', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('garmin_dia', true, true, '007', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('garmin_ativ', true, true, '007', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('erros', true, false, '008', 'dado da conta com trava "mfa"; fora do backup do site por decisão registrada em docs/seguranca.md (Backup)'),
  ('rotina_log', true, false, '008', 'dado da conta com trava "mfa"; fora do backup do site por decisão registrada em docs/seguranca.md (Backup)'),
  ('lista', true, true, '009', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('bebe', true, true, '010', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('push_inscricoes', true, false, '011', 'dado da conta com trava "mfa"; fora do backup do site por decisão registrada em docs/seguranca.md (Backup)'),
  ('ia_config', true, false, '015', 'dado da conta com trava "mfa"; fora do backup do site por decisão registrada em docs/seguranca.md (Backup)'),
  ('ia_uso', true, false, '015', 'dado da conta com trava "mfa"; fora do backup do site por decisão registrada em docs/seguranca.md (Backup)'),
  ('ia_cobranca', true, false, '015', 'dado da conta com trava "mfa"; fora do backup do site por decisão registrada em docs/seguranca.md (Backup)'),
  ('newsletter_edicoes', true, true, '018', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('newsletter_avisos', true, false, '018', 'dado da conta com trava "mfa"; fora do backup do site por decisão registrada em docs/seguranca.md (Backup)'),
  ('pedidos', true, true, '024', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('pedido_itens', true, true, '024', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('compras_online', true, true, '025', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('compras_online_itens', true, true, '025', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('compras_online_docs', true, true, '025', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('compras_importacoes', true, true, '030', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('compras_reembolsos', true, true, '031', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('compras_reembolsos_estornos', true, true, '031', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('notas_fiscais', true, true, '032', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('notas_fiscais_itens', true, true, '032', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('notas_fiscais_docs', true, true, '032', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('notas_fiscais_vinculos', true, true, '032', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('notas_fiscais_tentativas', true, true, '037', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('notas_fiscais_situacoes', true, true, '037', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('radar_config', true, true, '043', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('radar_lojas', true, true, '043', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('radar_itens', true, true, '043', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('radar_ofertas', true, true, '043', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('radar_coletas', true, true, '043', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('radar_precos', true, true, '043', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('radar_consultas', true, true, '048', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('radar_candidatos', true, true, '048', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('radar_historico', true, true, '048', 'dado pessoal da conta: trava "mfa" e backup do site (NUCLEO.SEG_TABELAS)'),
  ('seguranca_eventos', true, false, '022', 'dado da conta com trava "mfa"; fora do backup do site por decisão registrada em docs/seguranca.md (Backup)'),
  ('ia_precos', false, false, '015', 'preços da IA com fonte e data: sem dado pessoal; quem entrou só lê; sem trava "mfa" de propósito'),
  ('rac_segredos', false, false, '011', 'segredos do servidor (chaves do push): RLS sem política e nenhum privilégio para o site; fora da trava "mfa" e do backup'),
  ('seguranca_catalogo', false, false, '050', 'este catálogo: só quem roda migration no SQL Editor escreve; o site não lê nem grava')
on conflict (tabela) do nothing;

-- Segurança: a auditoria lê o catálogo (antes: uma lista fixa recriada a cada tabela nova, na 022, 033, 038, 043 e 048)
create or replace function public.seguranca_estado() returns jsonb
  language plpgsql stable security definer set search_path = '' as $$
declare
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
    'sem_trava_mfa', coalesce((select jsonb_agg(k.tabela order by k.tabela) from public.seguranca_catalogo k
                where k.trava_mfa and pg_catalog.to_regclass('public.' || k.tabela) is not null
                  and not exists (select 1 from pg_catalog.pg_policies p where p.schemaname = 'public' and p.tablename = k.tabela and p.policyname = 'mfa' and p.permissive = 'RESTRICTIVE')), '[]'::jsonb),
    'fora_do_catalogo', coalesce((select jsonb_agg(c.relname order by c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relkind in ('r', 'p')
                  and not exists (select 1 from public.seguranca_catalogo k where k.tabela = c.relname)), '[]'::jsonb),
    'catalogo_sem_tabela', coalesce((select jsonb_agg(k.tabela order by k.tabela) from public.seguranca_catalogo k
                where pg_catalog.to_regclass('public.' || k.tabela) is null), '[]'::jsonb),
    'cofres_publicos', coalesce((select jsonb_agg(b.id order by b.id) from storage.buckets b where b.public), '[]'::jsonb),
    'funcoes_abertas', coalesce((select jsonb_agg(p.proname order by p.proname) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.prosecdef and pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')), '[]'::jsonb),
    'conferido', now()) into r;
  return r;
end $$;
revoke all on function public.seguranca_estado() from public, anon;
grant execute on function public.seguranca_estado() to authenticated;

commit;

-- conferir depois (só leitura; a conferência completa está em supabase/conferencias/050_conferir_producao.sql):
--   select count(*) from public.seguranca_catalogo;                                         -- 47
--   select tabela from public.seguranca_catalogo where trava_mfa order by 1;                -- as 44 de antes
--   select public.seguranca_estado()->'fora_do_catalogo', public.seguranca_estado()->'sem_trava_mfa';   -- [] e [] (com login de dono, aal2 se usar código)
