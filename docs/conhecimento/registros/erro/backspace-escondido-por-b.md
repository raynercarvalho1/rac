---
titulo: Backspace escondido no código por \b sem string crua
tipo: erro
categoria: codigo
tags: python, regex, controle
estado: resolvido
origem: CLAUDE.md; tests/estrutura.test.mjs
data: 2026-11-20
---

Edição por script Python com `\b` em string comum gerou caractere de controle dentro do código.

## Causa

Em Python, `"\b"` (sem `r`) é o caractere backspace, não o limite de palavra da regex.

## Solução

Usar string crua `r"..."` e remover o caractere.

## Prevenção

Teste que reprova caractere de controle (`tests/estrutura.test.mjs`).
