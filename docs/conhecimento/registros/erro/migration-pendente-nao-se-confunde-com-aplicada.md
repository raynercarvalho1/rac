---
titulo: Migration pendente não se confunde com aplicada
tipo: erro
categoria: banco
tags: migration, pendente, producao
estado: ativo
origem: CLAUDE.md; tests/banco.test.mjs
data: 2026-11-20
---

Considerar aplicada uma migration só porque o arquivo está no repositório.

## Causa

Arquivo `.sql` no repositório não prova nada sobre o banco real; o dono é quem roda no SQL Editor.

## Solução

Cabeçalho `-- status: pendente` até a aplicação; `tests/banco.test.mjs` trata o pendente como `todo`; conferir com `supabase/conferencias/*`.

## Prevenção

Só escrever "aplicada em DD/MM" depois da confirmação do dono ou da conferência só leitura.
