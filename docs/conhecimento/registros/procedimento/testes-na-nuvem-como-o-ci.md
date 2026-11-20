---
titulo: Testes na nuvem como o CI
tipo: procedimento
categoria: testes
tags: testes, nuvem, ci
estado: ativo
origem: CLAUDE.md; docs/nuvem.md
data: 2026-11-20
---

Durante o trabalho: `bash scripts/nuvem_testes.sh tests/x.test.mjs` (módulo). Na preparação da publicação: `bash scripts/nuvem_testes.sh` (tudo, como o CI) e `git diff --check`. Não rodar `npm install` dentro do repositório. Testes de PGlite exigem o ambiente preparado (`scripts/nuvem_preparar.sh`).
