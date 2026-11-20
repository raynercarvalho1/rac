-- status: pendente
-- PROPOSTA 061 · NÃO APLICADA EM PRODUÇÃO · RESERVADA PARA UM LOTE FUTURO (consulta oficial à SEFAZ, ainda não habilitada; fica em supabase/propostas/, fora da sequência aplicável) · Agendamento diário da validação fiscal (Central Fiscal). Pode rodar de novo sem erro. Não altera a 059 nem a 060.
-- Chama a função fiscal-consulta (supabase/functions/fiscal-consulta) uma vez por dia, às 5h40 de Brasília (8h40 UTC; o pg_cron conta em UTC e o Brasil está em UTC−3 sem horário de verão),
-- longe das rotinas da Garmin, da Newsletter e do Radar. Usa a mesma senha da rotina (Vault: rac_rotina): nenhum segredo novo no banco.
-- SÓ APLIQUE quando o dono decidir habilitar a consulta oficial: publicar a função fiscal-consulta, configurar certificado A1 + endereços + FISCAL_CONSULTA_ATIVA=1 nos Secrets da função, e então mover este arquivo para supabase/061_... e aplicar. Enquanto a função não estiver habilitada ela não consulta nem grava nada.
-- Para DESLIGAR: select cron.unschedule('fiscal-validacao');
begin;

select cron.unschedule('fiscal-validacao') where exists (select 1 from cron.job where jobname = 'fiscal-validacao');
select cron.schedule('fiscal-validacao', '40 8 * * *', $$
  select net.http_post(
    url := 'https://hofnhbxnfebfnncwxrds.supabase.co/functions/v1/fiscal-consulta',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-rac-rotina', (select decrypted_secret from vault.decrypted_secrets where name = 'rac_rotina')),
    body := '{"tipo":"rodada"}'::jsonb,
    timeout_milliseconds := 120000)
$$);

commit;

-- conferir depois (só leitura):
--   select jobname, schedule, active from cron.job where jobname in ('fiscal-validacao', 'fiscal-entradas');
--   select consultado_em, origem, resultado, cstat, mudou, encerrada from public.notas_fiscais_consultas order by consultado_em desc limit 20;
