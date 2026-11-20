---
titulo: Gmail e Outlook no Inbox: OAuth no servidor, uid sintético e mesmo funil
tipo: decisao
categoria: inbox
tags: inbox, oauth, gmail, outlook
estado: ativo
origem: docs/inbox.md (I4)
data: 2026-11-20
---

## Motivo

Código OAuth volta ao site e é entregue à função autenticada (sem endpoint público); só o refresh token vai ao Vault, o de acesso nunca é guardado; a conta autorizada precisa ser a cadastrada. Leitura/envio/gerenciamento de Gmail e Outlook reutilizarão contrato e cache do iCloud com uid sintético por pasta (ID do provedor em id_externo). Escopos: gmail.modify e Graph Mail.ReadWrite + Mail.Send. Lote 1 entregue; lotes de leitura, envio e gerenciamento pendentes.
