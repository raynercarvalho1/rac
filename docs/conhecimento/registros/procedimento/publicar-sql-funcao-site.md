---
titulo: Publicar: SQL, depois função, depois site
tipo: procedimento
categoria: publicacao
tags: publicacao, ordem, versao
estado: ativo
origem: CLAUDE.md (Publicação); skill rac-publicar
data: 2026-11-20
---

Ordem sempre: 1) SQL no SQL Editor (o dono roda); 2) Edge Function republicada pelo dono; 3) site (merge na `main` e GitHub Pages). Antes: `node --test tests/*.test.mjs` passando (na nuvem `bash scripts/nuvem_testes.sh`) e `VERSAO` (sw.js) e `MOD_VERSAO` (js/app.js) trocadas juntas. Depois do merge, conferir o CI da `main` e a versão realmente publicada.

## Prevenção

Não trocar só uma das duas versões: `tests/estrutura.test.mjs` compara.
