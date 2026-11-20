---
titulo: Menu do Inbox com várias árvores de pastas abertas por estado de expansão por conta
tipo: erro
categoria: inbox
tags: inbox, menu, interface
estado: ativo
origem: PR #58; docs/inbox.md (Menu e Gerenciar contas)
data: 2026-11-20
---

## Causa

O menu guardava um estado de expansão por conta (contasAbertas) e escolher uma conta a abria sem fechar as outras.

## Solução

Removido o estado por conta: só INBX.conta decide qual conta mostra o bloco Pastas (conta); sem conta selecionada não há pastas no menu.

## Prevenção

Derivar o que está aberto da seleção única, nunca de um mapa por item; testes percorrem várias contas e exigem uma única árvore.
