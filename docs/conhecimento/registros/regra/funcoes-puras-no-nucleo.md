---
titulo: Funções puras ficam em nucleo.js, com teste
tipo: regra
categoria: codigo
tags: nucleo, testes
estado: ativo
origem: CLAUDE.md
data: 2026-11-20
---

Regra de negócio pura e testável vai em `nucleo.js` (`window.RACnucleo`, usada como `NUCLEO.x`), com teste em `tests/`. Nada de tela nem de banco no núcleo.
