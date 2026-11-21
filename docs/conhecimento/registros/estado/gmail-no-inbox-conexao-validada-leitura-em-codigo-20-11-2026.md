---
titulo: Gmail no Inbox: conexão validada, leitura em código (20/11/2026)
tipo: estado
categoria: inbox
tags: inbox, gmail, estado
estado: ativo
origem: docs/inbox.md (I4)
data: 2026-11-20
---

Lote 1 (OAuth) validado em produção pelo dono: conta Gmail conectou. Lote 2 (leitura e sincronização do Gmail por gmail.ts, uid sintético, mesmo funil do iCloud) em código no PR #56, função rac-inbox@i4.1 e site 2026-11-20.6 NÃO publicados; sem prova com mensagens reais. Em 21/11/2026 o Outlook também ganhou leitura e sincronização em código (lote 3, outlook.ts, função rac-inbox@i4.2, site 2026-11-21.6; NÃO publicados; sem prova com mensagens reais; a conta Outlook do dono conectou). Em 21/11/2026, lote 4 em código (função rac-inbox@i4.3, site 2026-11-21.7; NÃO publicados; sem prova com mensagens reais): Gmail e Outlook gerenciam (lida, arquivar, apagar para a Lixeira, spam, mover), enviam (novo, responder, responder a todos, encaminhar; só texto), entram na rotina de 10 min com aviso, e o Inbox é o 6º botão da barra. Faltam: anexos e rascunhos no envio, esvaziar lixeira, marcador de mudança do Gmail (migration 065) e push em tempo real, migração de Compras/Carreira/vagas, validação no iPhone.
