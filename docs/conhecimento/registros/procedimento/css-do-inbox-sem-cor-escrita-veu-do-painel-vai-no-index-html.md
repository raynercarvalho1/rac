---
titulo: CSS do Inbox sem cor escrita: véu do painel vai no index.html
tipo: procedimento
categoria: inbox
tags: inbox, css, interface
estado: ativo
origem: tests/inbox_tela.test.mjs; index.html
data: 2026-11-20
---

O teste de desenho do Inbox proíbe cor escrita (rgba, hex) em css/rac.css; o véu escuro do painel lateral (.inb-fundo) fica no index.html ao lado do .scrimbg, que já usa rgba. Tokens existentes cobrem o resto (gradiente da barra azul: --rac-azul-grad; botão claro: --rac-papel com --rac-info).
