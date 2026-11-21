---
titulo: Inbox lote 4: Gmail e Outlook gerenciam e enviam pelos mesmos verbos do iCloud
tipo: decisao
categoria: inbox
tags: inbox, gmail, outlook, enviar, gerenciar
estado: ativo
origem: docs/inbox.md (I4 lote 4)
data: 2026-11-21
---

## Motivo

Pedido e decisões do dono (21/11/2026): central de e-mail completa no site. Abordagem A: gmail.ts e outlook.ts respondem os verbos marcar_lida, mover_mensagem, verificar_mensagem e enviar que organizar.ts e envio.ts já usam; a segurança (trava anti-duplicação, incerto nunca repetido, conferência do estado real) é uma só. Apagar é sempre Lixeira (Esvaziar lixeira e apagar definitivo ficam para depois); encaminhar e responder nos três provedores; só texto no envio; rotina automática mantida em 10 min (o dono desistiu de 1 min); marcador de mudança do Gmail ficou de fora e sem SQL; Inbox é o 6º botão da barra, só do dono, com o número de não lidas. Interruptor por provedor: ESCRITA_OAUTH no servidor e escrita em INB_PROVEDORES na tela.
