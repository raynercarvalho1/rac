---
titulo: Texto sobre a foto de fundo nao tem contraste no tema claro; waitForFunction pendurava sob carga
tipo: erro
categoria: visual
tags: novo-rac, visual, teste, playwright
estado: ativo
origem: Lote 2, 27/11/2026
data: 2026-11-27
---

A boas-vindas da Minha Casa tinha título e texto soltos sobre a foto de fundo: contraste 1,09 no tema claro (o escuro passava). Segundo achado do mesmo lote: o `waitForFunction` do Chromium pendurava, uma vez em cerca de 12 execuções sob carga.

## Causa

(1) O app escreve texto escuro em cartões translúcidos, nunca direto na foto; o título solto herdou a cor escura sobre o fundo escuro da foto. (2) Hipótese, não provada: a sondagem padrão do `waitForFunction` usa `requestAnimationFrame`, que pode não disparar em página sem foco quando vários Chromium rodam em paralelo; a falha não foi reproduzida de forma determinística.

## Solução

(1) O cabeçalho da boas-vindas virou `rac-card`; o teste `tests/workspace_casa_visual.test.mjs` mede o contraste da primeira tela. (2) Nos testes de tela, `waitForFunction` passou a sondar por intervalo de 100 ms (`polling`), sem aumentar nenhum timeout.

## Prevenção

Todo texto novo fica dentro de `rac-card` ou da faixa azul, nunca solto sobre a foto, e a medição de contraste cobre as telas novas nos dois temas. Se a instabilidade do `waitForFunction` voltar, capturar o estado da página na falha antes de mexer em limites.
