-- PROPOSTA, NÃO APLICADA (o dono roda no SQL Editor, com autorização própria, DEPOIS de: 054 aplicada + função rac-inbox v3 publicada + Worker e secrets do canal funcionando).
-- RAC Inbox · agendamento da sincronização automática (docs/inbox.md, "Automático"). Pode rodar de novo sem erro.
-- A cada 10 minutos o pg_cron do Supabase chama a função rac-inbox no modo rotina ("rotina_sync"), com a MESMA senha de rotina das outras rotinas (Vault: rac_rotina, criada na 008): nenhum segredo novo.
-- A função só toca contas iCloud com credencial ativa e "sincronizar automaticamente" ligado; nunca escreve na caixa de e-mail (só leitura) e não mexe no agendamento diário de notificações (rac-rotina, 6h).
-- FUSO: o pg_cron conta em UTC; "*/10 * * * *" não depende de fuso.
-- Custo: pg_cron e pg_net já estão ativos (008). 144 chamadas por dia, bem abaixo do franqueado do plano Free do Supabase.
-- ATENÇÃO (publicação): a função rac-inbox hoje exige JWT no gateway (verify_jwt=true). Esta chamada vai SEM login, só com x-rac-rotina, como Radar e Newsletter: publique a v3 com --no-verify-jwt
-- (a função confere sozinha o JWT do dono ou a senha da rotina e recusa o resto) OU acrescente aqui o cabeçalho 'Authorization' com a chave pública do projeto. Veja docs/inbox.md, "Ordem para colocar em produção".
-- Para DESLIGAR (rollback): select cron.unschedule('inbox-sync');   (ou desmarcar "sincronizar automaticamente" na conta; ou apagar a credencial)
begin;

select cron.unschedule('inbox-sync') where exists (select 1 from cron.job where jobname = 'inbox-sync');
select cron.schedule('inbox-sync', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://hofnhbxnfebfnncwxrds.supabase.co/functions/v1/rac-inbox',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-rac-rotina', (select decrypted_secret from vault.decrypted_secrets where name = 'rac_rotina')),
    body := '{"operacao":"rotina_sync"}'::jsonb,
    timeout_milliseconds := 120000)
$$);

commit;

-- conferir depois (só leitura):
--   select jobname, schedule, active from cron.job where jobname = 'inbox-sync';
--   select status_code, created from net._http_response order by created desc limit 5;     -- 200 a cada 10 min
--   select c.apelido, s.origem, s.tipo_ultima, s.ultima_ok_em, s.ultima_tentativa_em, s.falhas_seguidas, s.duracao_ms, s.erro from public.inbox_sincronizacao s join public.inbox_contas c on c.id = s.conta_id;
