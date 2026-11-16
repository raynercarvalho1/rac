-- Conferência da 057 (acesso igual da Fernanda em Finanças e compras). SÓ LEITURA: nenhum comando altera dado, política ou função.
-- Rode no SQL Editor depois de aplicar supabase/057_casa_radar_fiscal.sql. Cada consulta traz a resposta esperada no comentário.

-- 1) pessoal: a política da casa existe e só cobre as 6 chaves (esperado: 1 linha "casa compartilha" com as 6 chaves no texto)
select policyname, cmd, qual
  from pg_policies where schemaname = 'public' and tablename = 'pessoal' and policyname = 'casa compartilha';

-- 2) Radar: as 9 tabelas com a política "casa" e a trava "mfa" (esperado: 9 linhas, cada uma com policies = {casa,mfa}; nenhuma com "so o dono")
select tablename, array_agg(policyname order by policyname) as policies
  from pg_policies where schemaname = 'public' and tablename like 'radar\_%' escape '\'
 group by tablename order by tablename;

-- 3) Radar: o dono nasce como o dono da casa (esperado: 9 linhas com column_default contendo dono_da_casa)
select table_name, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name like 'radar\_%' escape '\' and column_name = 'dono' and table_name in
       ('radar_config','radar_lojas','radar_itens','radar_ofertas','radar_coletas','radar_precos','radar_consultas','radar_candidatos','radar_historico')
 order by table_name;

-- 4) Central Fiscal: as funções sem a linha "só o dono da casa" (esperado: tem_trava_de_dono = false nas que existem; a 040 só aparece se já tiver sido aplicada)
select p.proname, position('só o dono da casa' in p.prosrc) > 0 as tem_trava_de_dono
  from pg_proc p where p.pronamespace = 'public'::regnamespace
   and p.proname in ('nota_fiscal_salvar_doc','nota_fiscal_atualizar_situacao','nota_fiscal_entrada_mercado') order by p.proname;

-- 5) Central Fiscal: sem as políticas restritivas "foto so dono ..." e com a leitura das tentativas/histórico pela casa
--    (esperado: nenhuma linha "foto so dono ..."; "dono" nas duas tabelas com dono_da_casa() e sem auth.uid() no texto)
select tablename, policyname, permissive from pg_policies
 where schemaname = 'public' and tablename like 'notas\_fiscais%' escape '\' and policyname like 'foto so dono%';
select tablename, policyname, qual from pg_policies
 where schemaname = 'public' and tablename in ('notas_fiscais_tentativas','notas_fiscais_situacoes') and policyname = 'dono';

-- 6) ia_config: a trava da IA fiscal saiu (esperado: 0 linhas) e a 057 não ligou nada (fiscal.nota ainda fora das listas da casa até o dono rodar o UPDATE comentado)
select conname from pg_constraint where conrelid = 'public.ia_config'::regclass and conname = 'ia_config_fiscal_so_dono';
select modo, acoes_reais, acoes_reais_casa, acoes_casa from public.ia_config;

-- 7) o que NÃO podia mudar (esperado: hoje.analise e newsletter.resumo continuam proibidas para a casa: as duas travas existem)
select conname from pg_constraint where conrelid = 'public.ia_config'::regclass
   and conname in ('ia_config_hoje_so_dono','ia_config_newsletter_so_dono') order by conname;
