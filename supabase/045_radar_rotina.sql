-- Aplicado em produção (conferido pelo dono: cron radar-rotina ativo, 6h20 e 18h20 de Brasília; a função radar publicada). A rodada passou a funcionar depois da 047 (GRANT do service_role).
-- 045 · Agendamento do Radar de Preços (Lote 3). Pode rodar de novo sem erro.
-- Agenda a rodada da função radar (docs/radar.md): para cada dono, coleta as ofertas de lojas liberadas e manda o aviso de oportunidades por Web Push (só ao dono, 1 por dia, sem repetir o mesmo preço).
-- Duas rodadas por dia, às 6h20 e às 18h20 de Brasília (UTC: 9h20 e 21h20): longe das rotinas da Garmin e da Newsletter. A função respeita o intervalo mínimo de 12 h por oferta, o limite de 20 ofertas por rodada e
-- o robots.txt de cada loja; sem nenhuma loja com "coleta liberada", a rodada só confere os avisos.
-- Usa a mesma senha da rotina (Vault: rac_rotina, criada no 008): nenhum segredo novo. NÃO mexe na função garmin nem no agendamento dela.
-- Depende de: 043 (tabelas do Radar), função radar publicada, notificações ativadas em Sistema (chaves VAPID e aparelho inscrito).
-- FUSO: o pg_cron do Supabase conta em UTC e o Brasil está em UTC−3 sem horário de verão (desde 2019): 9h20 UTC = 6h20 e 21h20 UTC = 18h20 de Brasília. ANTES de aplicar, confira: show cron.timezone;  (deve ser GMT ou UTC; a 019 da Newsletter usa a mesma convenção).
-- Para DESLIGAR (rollback): select cron.unschedule('radar-rotina');
begin;

select cron.unschedule('radar-rotina') where exists (select 1 from cron.job where jobname = 'radar-rotina');
select cron.schedule('radar-rotina', '20 9,21 * * *', $$
  select net.http_post(
    url := 'https://hofnhbxnfebfnncwxrds.supabase.co/functions/v1/radar',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-rac-rotina', (select decrypted_secret from vault.decrypted_secrets where name = 'rac_rotina')),
    body := '{"tipo":"rodada"}'::jsonb,
    timeout_milliseconds := 120000)
$$);

commit;

-- conferir depois (só leitura):
--   select jobname, schedule, active from cron.job where jobname = 'radar-rotina';
--   select status, iniciada_em, ofertas_lidas, precos_gravados, falhas, erro_codigo from public.radar_coletas order by iniciada_em desc limit 10;
