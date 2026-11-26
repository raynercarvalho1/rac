---
titulo: Ensaiar uma Edge Function chamada pelo pg_cron sem expor o segredo da rotina
tipo: procedimento
categoria: publicacao
tags: edge-function, pg_net, vault, ensaio
estado: ativo
origem: Monitor M3 e M4, 26/11/2026
data: 2026-11-26
---

A função autentica pelo cabeçalho x-rac-rotina (segredo rac_rotina no Vault). Para chamá-la sem ver o segredo: execute_sql com select net.http_post(url := 'https://<projeto>.supabase.co/functions/v1/<função>', headers := jsonb_build_object('Content-Type','application/json','x-rac-rotina',(select decrypted_secret from vault.decrypted_secrets where name='rac_rotina')), body := '{"tipo":"ensaio"}'::jsonb, timeout_milliseconds := 60000), que devolve request_id; depois select status_code, content from net._http_response where id = <request_id> (a chamada é assíncrona: ler numa segunda consulta). O modo de ensaio da função só lê (não grava, não envia, não marca). Só aplicar a migration de agenda (cron.schedule) depois do ensaio dar 200. Para desligar um agendamento: select cron.unschedule('<job>').
