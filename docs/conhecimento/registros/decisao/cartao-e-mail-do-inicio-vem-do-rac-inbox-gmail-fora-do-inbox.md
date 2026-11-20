---
titulo: Cartão E-mail do Início vem do RAC Inbox; Gmail fora do Inbox até o OAuth
tipo: decisao
categoria: inbox
tags: inbox, inicio, gmail
estado: ativo
origem: docs/inbox.md (Início)
data: 2026-11-20
---

## Motivo

O dono pediu um só sistema de e-mail: o cartão lê inbox_contas/pastas/sincronização e sincroniza por inboxSincronizarConta; a leitura direta do Gmail no cartão foi removida. As duas contas Gmail ficam identificadas como Fora do Inbox, sem número inventado, até haver OAuth no servidor (projeto Google Cloud, secret, função, migration; pendência do dono). Compras, Carreira e alertas de vagas ainda usam gmApi no navegador.
