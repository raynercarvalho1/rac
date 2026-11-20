---
titulo: Teste Chromium do Início: abrir pela rota, não por renderInicio
tipo: procedimento
categoria: testes
tags: inbox, chromium, testes
estado: ativo
origem: tests/navegador.test.mjs
data: 2026-11-20
---

Em testes de navegador, desenhar o Início chamando renderInicio() deixa a seção hidden e o waitForSelector expira; use location.hash='#inicio'; route(). Rodar com RAC_CHROMIUM=/opt/pw-browsers/chromium CI=true.
