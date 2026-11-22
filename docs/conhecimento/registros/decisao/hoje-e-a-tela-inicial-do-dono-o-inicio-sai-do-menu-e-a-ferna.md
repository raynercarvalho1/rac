---
titulo: Hoje é a tela inicial do dono; o Início sai do menu e a Fernanda não muda
tipo: decisao
categoria: codigo
tags: hoje, inicio, menu, barra, reestruturacao
estado: ativo
origem: reestruturação visual, Lote 1, 22/11/2026
data: 2026-11-22
---

## Motivo

Pedido do dono (22/11/2026): o Início acumulou cartões que ele não usa (ouvir, resumo do dia, aniversários, conexões) e o RAC Hoje é mais útil. O app do dono abre no Hoje (rotaInicial() em js/rotas.js); #inicio continua existindo como rota, só saiu do menu. A Fernanda continua caindo no Mercado: o Início nunca foi página da casa. Ordem do Hoje: faixa fina de gastos, Prioridades e Gastos, Saúde, E-mails, Newsletter (com a hora da coleta e quantos destaques são novos desde a última visita à página), Esportes e Sorocaba, análise da IA. Barra de baixo do celular: Hoje, MBA, Saúde, Compras, Inbox (a Agenda saiu da barra e continua no menu). Sem IA paga automática no Hoje. Critério fixado: só entra na tela inicial o que tem prazo, ação ou dado novo. Desenho e plano em docs/planejamento/11-reestruturacao-visual.md.
