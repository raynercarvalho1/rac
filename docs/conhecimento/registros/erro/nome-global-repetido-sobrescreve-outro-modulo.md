---
titulo: Nome global repetido sobrescreve outro módulo
tipo: erro
categoria: codigo
tags: global, estrutura
estado: resolvido
origem: tests/estrutura.test.mjs
data: 2026-11-20
---

Uma função de topo com o mesmo nome em dois módulos: o segundo sobrescreve o primeiro sem erro.

## Causa

Todos os módulos compartilham o escopo global; foi o que aconteceu com `hm` (a da Saúde trocou o horário dos jogos).

## Solução

Renomear com prefixo do módulo.

## Prevenção

Procurar o nome antes de criar; `tests/estrutura.test.mjs` reprova repetição.
