-- status: pendente
-- Newsletter: agenda a função rac-newsletter (docs/newsletter.md). Rode DEPOIS de publicar a função e depois do 018.
-- Pode rodar de novo sem estragar nada (troca o agendamento pelo mesmo).
--
-- Depois de cada coleta (o robô do GitHub coleta às 6h15, 12h15 e 18h15 de Brasília e às vezes atrasa até uma hora):
-- 6h45, 7h45, 8h45, 12h45, 13h45, 18h45 e 19h45 de Brasília (UTC: 9, 10, 11, 15, 16, 21 e 22h, minuto 45).
-- A cada chamada a função só trabalha se a edição DESTE turno já saiu; guarda a edição, pede o resumo com IA uma vez por
-- edição (a chave da edição em ia_uso impede pedir de novo, inclusive depois de erro, e são no máximo 3 por dia) e manda
-- no máximo um aviso por dia (newsletter_avisos). Aos domingos, a mesma chamada manda o resumo da semana.
-- Usa a mesma senha da rotina diária (Vault: rac_rotina, criada no 008): nenhum segredo novo.
begin;

select cron.unschedule('rac-newsletter') where exists (select 1 from cron.job where jobname = 'rac-newsletter');
select cron.schedule('rac-newsletter', '45 9,10,11,15,16,21,22 * * *', $$
  select net.http_post(
    url := 'https://hofnhbxnfebfnncwxrds.supabase.co/functions/v1/rac-newsletter',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-rac-rotina', (select decrypted_secret from vault.decrypted_secrets where name = 'rac_rotina')),
    body := '{"tipo":"rotina"}'::jsonb,
    timeout_milliseconds := 120000)
$$);

commit;
