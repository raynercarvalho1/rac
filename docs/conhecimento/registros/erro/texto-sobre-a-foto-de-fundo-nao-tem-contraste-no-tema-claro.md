---
titulo: Texto sobre a foto de fundo nao tem contraste no tema claro; waitForFunction pendurava sob carga
tipo: erro
categoria: visual
tags: novo-rac, visual, teste, playwright
estado: ativo
origem: Lote 2, 27/11/2026
data: 2026-11-27
---

Dois achados do Lote 2. (1) A boas-vindas da Minha Casa tinha titulo e texto soltos sobre a foto de fundo: contraste 1,09 no tema claro (o escuro passava). Causa: o app escreve texto escuro em cartoes translucidos, nao direto na foto. Solucao: o cabecalho virou rac-card; o teste visual mede o contraste da primeira tela. Prevencao: todo texto novo fica dentro de rac-card ou da faixa azul, nunca solto sobre a foto. (2) Instabilidade do waitForFunction do Lote 1: uma falha em cerca de 12 execucoes sob carga (varios Chromium em paralelo), sem reproducao deterministica; HIPOTESE (nao provada): a sondagem padrao usa requestAnimationFrame, que pode nao disparar numa pagina sem foco sob carga. Mitigacao aplicada nos testes de tela: polling por intervalo de 100 ms (sem aumentar timeout). Se voltar, capturar o estado da pagina na falha antes de mexer em limites.
