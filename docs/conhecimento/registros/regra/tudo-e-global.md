---
titulo: Tudo é global: procure o nome antes de criar função ou variável de topo
tipo: regra
categoria: codigo
tags: global, nomes, estrutura
estado: ativo
origem: CLAUDE.md; tests/estrutura.test.mjs
data: 2026-11-20
relacionados: erro/nome-global-repetido-sobrescreve-outro-modulo
---

Os módulos dividem o mesmo escopo global. Antes de criar função ou variável de topo, procure se o nome já existe; `tests/estrutura.test.mjs` falha se repetir. Cada módulo usa prefixo próprio (ex.: `ic*` Custos de IA, `kn*` RAC Knowledge).
