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

O Início também desenha Esportes, clima e notícias, que chamam ESPN, Open-Meteo etc. No CI a ESPN responde sem CORS e o console acusa erro (o teste local, sem rede, não mostra). Em todo teste de navegador do Início, intercepte com `pag.route` tudo fora do servidor local (resposta vazia com CORS liberado), sem silenciar o filtro de console nem mexer em Esportes. Ver o teste do cartão E-mail em tests/navegador.test.mjs.
