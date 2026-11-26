---
titulo: Monitor: 'falhas em 7 dias' do GitHub contava só as 30 execuções mais novas
tipo: erro
categoria: monitor
tags: monitor, github, observabilidade
estado: ativo
origem: Monitor M1 e M2, 26/11/2026
data: 2026-11-26
---

## Causa

O robô de notícias roda de hora em hora (cron 40 * * * *); a consulta pega per_page=30, ou seja, cerca de 1 dia, mas o painel rotulava a contagem como 'em 7 dias'. O número parecia confirmado e estava subestimado.

## Solução

O rótulo agora diz a janela real ('nas últimas N execuções, desde dd/mm hh:mm') quando as execuções lidas não cobrem 7 dias; a cota de 60 consultas/h do GitHub impede paginar por padrão.

## Prevenção

Todo contador do Monitor precisa dizer a janela que realmente cobre; teste 'GitHub: janela real' em tests/monitor.test.mjs.
