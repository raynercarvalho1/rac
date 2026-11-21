---
titulo: Outlook no Inbox: leitura pela Graph com ID imutável, pastas por apelido e refresh regravado
tipo: decisao
categoria: inbox
tags: inbox, outlook, graph
estado: ativo
origem: docs/inbox.md (I4 lote 3)
data: 2026-11-21
---

## Motivo

Pedido do dono (21/11/2026) para o Outlook sincronizar. outlook.ts tem a forma do gmail.ts (só GET na Graph, mesmo funil sync.ts, uid sintético por pasta, ID da Graph em id_externo até 200 caracteres, nunca no navegador). Toda chamada pede Prefer IdType ImmutableId e corpo em texto. Pastas do sistema pelos apelidos inbox, sentitems, drafts, deleteditems, junkemail e archive; as do usuário pelo ID. A Microsoft devolve refresh token novo a cada renovação: o servidor o regrava no Vault em melhor esforço. Sem delta e sem envio ainda. sync.ts passou a aceitar o formato do ID da Graph em ext.
