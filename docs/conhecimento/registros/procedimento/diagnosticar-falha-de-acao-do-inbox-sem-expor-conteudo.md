---
titulo: Diagnosticar falha de ação do Inbox sem expor conteúdo
tipo: procedimento
categoria: inbox
tags: inbox, logs, diagnostico
estado: ativo
origem: 27/11/2026
data: 2026-11-27
---

1) query_logs (Supabase MCP) em source function_logs com event_message ilike '%organizar_mensagem%': cada linha é JSON {rac_inbox:{operacao,codigo,status,detalhe?}}, só código fechado, sem e-mail nem senha; janela máxima de 24 h. 2) select nome_externo, uso, ativa from inbox_pastas das contas do provedor: mostra se a pasta de destino foi identificada. 3) Conferir no código de qual lugar o código sai (Worker em experimentos/rac-inbox-worker/src/imap.mjs, função em supabase/functions/rac-inbox/organizar.ts). 4) Nunca chamar o Worker nem a função em produção sem sessão do dono.
