-- 069 · Monitor M4: agenda do vigia (Edge Function monitor-alerta). APLICADA EM PRODUÇÃO em 26/11/2026 (conferida em cron.job: monitor-alerta */30 ativo e os outros 5 jobs intactos). Pode rodar de novo sem criar agendamento duplicado.
-- Depois da 067 (tabela sinais, view e funções), da 068 (leitura por coluna do service_role) e da função monitor-alerta publicada e ensaiada (tipo "ensaio": só lê).
-- A cada 30 minutos o pg_cron chama a função, no mesmo padrão da rac-newsletter (023): só a senha da rotina (Vault, rac_rotina) no cabeçalho x-rac-rotina, conferida por
-- rac_rotina_ok dentro da função (verify_jwt desligado). Nenhum segredo novo. A rodada real abre/atualiza/fecha incidentes em sinais e manda UM push consolidado quando puder
-- (silêncio das 22h às 7h de Brasília, no máximo 3 por dia). Para DESLIGAR: select cron.unschedule('monitor-alerta');
begin;
select cron.unschedule('monitor-alerta') where exists (select 1 from cron.job where jobname = 'monitor-alerta');
select cron.schedule('monitor-alerta', '*/30 * * * *', $$
  select net.http_post(
    url := 'https://hofnhbxnfebfnncwxrds.supabase.co/functions/v1/monitor-alerta',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-rac-rotina', (select decrypted_secret from vault.decrypted_secrets where name = 'rac_rotina')),
    body := '{"tipo":"rotina"}'::jsonb,
    timeout_milliseconds := 60000)
$$);

-- confere antes de confirmar: um só job do vigia, no horário certo e ativo, e os agendamentos existentes intactos
do $$ begin
  if (select count(*) from cron.job where jobname = 'monitor-alerta') <> 1
     or not exists (select 1 from cron.job where jobname = 'monitor-alerta' and schedule = '*/30 * * * *' and active)
     or (select count(*) from cron.job where jobname in ('rac-rotina', 'rac-newsletter', 'radar-rotina', 'fiscal-entradas', 'inbox-sync')) <> 5 then
    raise exception 'agendamento do monitor-alerta não ficou como esperado';
  end if;
end $$;
commit;
