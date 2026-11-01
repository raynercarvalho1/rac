-- Newsletter: tentativas de hora em hora durante os turnos (docs/newsletter.md, "Coleta por turno").
-- Rode depois do 019 (e da rac-newsletter com a chave por data e turno publicada). Pode rodar de novo sem estragar nada.
--
-- Por quê: o GitHub atrasa (até ~3 horas) e pula rodadas; com só 7 tentativas fixas por dia, uma coleta atrasada ficava sem
-- edição. Agora a rac-newsletter é chamada aos 50 minutos de cada hora das 6h50 às 23h50 de Brasília (9h50 às 2h50 UTC;
-- Brasília é UTC-3, sem horário de verão), 18 vezes por dia, e só trabalha quando chega a coleta da data e do turno.
--
-- O que NÃO muda: o corpo da chamada (o mesmo do 019, com a senha da rotina que já está no Vault), a rotina diária
-- (rac-rotina), tabelas, políticas, permissões, segredos, orçamento e a lista de ações em REAL. A repetição não gera
-- cobrança: a rac-newsletter usa uma chave por data e turno, e o banco (ia_reservar + unique de ia_uso) só aceita uma
-- reserva por chave, mesmo com duas execuções ao mesmo tempo.
begin;

-- substitui o agendamento do 019 pelo nome (nunca fica um job duplicado)
select cron.unschedule('rac-newsletter') where exists (select 1 from cron.job where jobname = 'rac-newsletter');
select cron.schedule('rac-newsletter', '50 0-2,9-23 * * *', $$
  select net.http_post(
    url := 'https://hofnhbxnfebfnncwxrds.supabase.co/functions/v1/rac-newsletter',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-rac-rotina', (select decrypted_secret from vault.decrypted_secrets where name = 'rac_rotina')),
    body := '{"tipo":"rotina"}'::jsonb,
    timeout_milliseconds := 120000)
$$);

-- confere antes de confirmar: um só job da Newsletter, com o horário novo, e a rotina diária intacta
do $$ begin
  if (select count(*) from cron.job where jobname = 'rac-newsletter') <> 1
     or not exists (select 1 from cron.job where jobname = 'rac-newsletter' and schedule = '50 0-2,9-23 * * *' and active)
     or not exists (select 1 from cron.job where jobname = 'rac-rotina') then
    raise exception 'agendamento da Newsletter não ficou como esperado';
  end if;
end $$;

commit;
