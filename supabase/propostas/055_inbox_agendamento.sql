-- ESTADO (conferido em 26/11/2026 por leitura de cron.job): o agendamento inbox-sync está ATIVO em produção (*/10 * * * *). O texto abaixo não foi comparado com o que foi aplicado.
-- O arquivo continua em propostas/ porque os testes do Inbox o tratam assim; o Monitor de integrações (nucleo.js, tests/monitor.test.mjs) lê o horário daqui.
-- PROPOSTA ORIGINAL, hoje já aplicada (o dono roda no SQL Editor, com autorização própria, DEPOIS de: 054 aplicada + função rac-inbox v3 publicada COM verify_jwt=true + Worker e secrets do canal funcionando
-- + o segredo rac_chave_publica criado no Vault, como abaixo).
-- RAC Inbox · agendamento da sincronização automática (docs/inbox.md, "Automático"). Pode rodar de novo sem criar agendamento duplicado (desagenda o mesmo nome e agenda de novo).
-- A cada 10 minutos o pg_cron chama a função rac-inbox no modo rotina ("rotina_sync") com DUAS autenticações:
--   1) Authorization: Bearer <chave pública anon do projeto>  → é o que o gateway do Supabase confere (verify_jwt=true continua ligado; NÃO se usa --no-verify-jwt);
--   2) x-rac-rotina: <senha da rotina do Vault (rac_rotina, 008)> → a função confere no banco (rac_rotina_ok) e recusa sem ela (401 sem_login). A chave anon sozinha NÃO executa a rotina.
-- A chave pública não está escrita neste arquivo: fica no Vault (segredo rac_chave_publica) e é lida a cada execução. É a chave "anon" (JWT, papel anon) do projeto, a mesma pública do site
-- (Settings → API Keys → "Legacy anon, service_role API keys"). NUNCA service_role nem secret key. As chaves novas "sb_publishable_…" não são JWT e o gateway com verify_jwt=true as recusa.
-- Criar o segredo uma vez (SQL Editor; troque o texto entre < > pela chave anon, que é pública; não cole no chat):
--   select vault.create_secret('<chave anon do projeto>', 'rac_chave_publica');
-- A guarda abaixo ABORTA (nada é agendado) se faltar um dos dois segredos ou se a chave não for um JWT de papel "anon" (barra service_role, secret key e chave nova).
-- ANTES de agendar, prove que o gateway aceita (só leitura da resposta; a rotina roda de verdade uma vez):
--   select net.http_post(url := 'https://hofnhbxnfebfnncwxrds.supabase.co/functions/v1/rac-inbox', headers := jsonb_build_object('Content-Type','application/json',
--     'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'rac_chave_publica'),
--     'x-rac-rotina', (select decrypted_secret from vault.decrypted_secrets where name = 'rac_rotina')), body := '{"operacao":"rotina_sync"}'::jsonb, timeout_milliseconds := 120000);
--   select status_code, left(content, 300) from net._http_response order by created desc limit 1;   -- esperado: 200 {"ok":true,"resumo":{…}}; 401 do gateway = chave errada; 401 sem_login = senha da rotina errada
-- Custo: pg_cron e pg_net já estão ativos (008). 144 chamadas por dia. TEMPO (os mesmos números em rotina.ts, docs/inbox.md e tests/inbox_automatico.test.mjs): não começa conta nova depois de 45 s; cada chamada ao Worker tem no máximo 40 s e nenhuma passa do prazo duro de 90 s; mais 10 s de margem para gravar = a rotina responde em ≤ 100 s, abaixo do timeout do pg_net (120 s, abaixo do limite de 150 s da função). 20 contas no máximo.
-- Não mexe no agendamento diário das 6h (rac-rotina), nem no Radar, nem na Newsletter: só o job 'inbox-sync'.
-- Para DESLIGAR (rollback): select cron.unschedule('inbox-sync');   (ou desmarcar "sincronizar automaticamente" na conta; ou apagar a credencial)
begin;

do $$
declare v_chave text; v_papel text;
begin
  if not exists (select 1 from vault.secrets where name = 'rac_rotina') then
    raise exception 'falta o segredo rac_rotina no Vault (criado pela 008)';
  end if;
  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'rac_chave_publica';
  if v_chave is null then
    raise exception 'falta o segredo rac_chave_publica no Vault (veja o cabeçalho deste arquivo)';
  end if;
  begin
    v_papel := convert_from(decode(translate(split_part(v_chave, '.', 2), '-_', '+/') || repeat('=', (4 - length(split_part(v_chave, '.', 2)) % 4) % 4), 'base64'), 'UTF8')::jsonb ->> 'role';
  exception when others then v_papel := null;
  end;
  if v_papel is distinct from 'anon' then
    raise exception 'rac_chave_publica deve ser a chave anon (JWT com papel anon); chave de serviço, secret key e chaves sb_* não servem';
  end if;
end $$;

select cron.unschedule('inbox-sync') where exists (select 1 from cron.job where jobname = 'inbox-sync');
select cron.schedule('inbox-sync', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://hofnhbxnfebfnncwxrds.supabase.co/functions/v1/rac-inbox',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'rac_chave_publica'),
      'x-rac-rotina', (select decrypted_secret from vault.decrypted_secrets where name = 'rac_rotina')),
    body := '{"operacao":"rotina_sync"}'::jsonb,
    timeout_milliseconds := 120000)
$$);

commit;

-- conferir depois (só leitura):
--   select jobname, schedule, active from cron.job where jobname in ('inbox-sync', 'rac-rotina');     -- inbox-sync (*/10) e rac-rotina (6h) ativos, 1 linha cada
--   select status_code, created from net._http_response order by created desc limit 5;                 -- 200 a cada 10 min
--   select c.apelido, s.origem, s.tipo_ultima, s.ultima_ok_em, s.ultima_tentativa_em, s.falhas_seguidas, s.duracao_ms, s.erro from public.inbox_sincronizacao s join public.inbox_contas c on c.id = s.conta_id;
