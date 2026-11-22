---
titulo: node --test direto no ambiente padrão cancela testes do hoje.test.mjs
tipo: erro
categoria: testes
tags: testes, node, nuvem
estado: ativo
origem: reestruturação visual, 22/11/2026
data: 2026-11-22
---

## Causa

A máquina da sessão tem Node 22 e o CI usa Node 24; no Node 22, 34 dos testes de tests/hoje.test.mjs (E4 e E5, Web Locks) terminam como cancelados, sem falha visível, e testes novos acrescentados ao arquivo ficam sem rodar.

## Solução

Rodar sempre bash scripts/nuvem_testes.sh tests/x.test.mjs (Node 24, igual ao CI).

## Prevenção

Ler a linha de resumo: pass + fail + cancelled deve fechar o total; cancelled diferente de zero significa que o ambiente está errado, não que o código está certo.
