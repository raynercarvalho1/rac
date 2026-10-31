-- status: pendente
-- Newsletter: agenda a função rac-newsletter (docs/newsletter.md). Rode DEPOIS de publicar a função e depois do 018.
-- Pode rodar de novo sem estragar nada (troca o agendamento pelo mesmo).
--
-- Três tentativas por dia, 6h45, 8h45 e 10h45 de Brasília (9h45, 11h45 e 13h45 UTC): o robô do GitHub coleta às 6h15
-- e às vezes atrasa. A função só avisa quando a edição do dia já saiu, e cada aviso só vai uma vez (newsletter_avisos):
-- as tentativas seguintes não repetem nada. Aos domingos, a mesma chamada manda o resumo da semana.
-- Usa a mesma senha da rotina diária (Vault: rac_rotina, criada no 008): nenhum segredo novo.
-- Nada aqui gera resumo com IA: o aviso fala só dos destaques coletados.
begin;

select cron.unschedule('rac-newsletter') where exists (select 1 from cron.job where jobname = 'rac-newsletter');
select cron.schedule('rac-newsletter', '45 9,11,13 * * *', $$
  select net.http_post(
    url := 'https://hofnhbxnfebfnncwxrds.supabase.co/functions/v1/rac-newsletter',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-rac-rotina', (select decrypted_secret from vault.decrypted_secrets where name = 'rac_rotina')),
    body := '{"tipo":"rotina"}'::jsonb,
    timeout_milliseconds := 60000)
$$);

commit;
