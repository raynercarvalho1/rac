---
titulo: RAC Hoje: IA automática 2 vezes por dia, só com o interruptor ligado pelo dono
tipo: decisao
categoria: ia
tags: hoje, ia, automatico, custo
estado: ativo
origem: reestruturação visual, Lote 4, 22/11/2026
data: 2026-11-22
relacionados: decisao/rac-hoje-so-real-e-so-do-dono
---

## Motivo

Pedido e autorização expressa do dono (22/11/2026): a IA do Hoje pode ser chamada sozinha, 2 chamadas por dia (escolheu 2, não 3), a partir das 6h e das 14h, com o app aberto, interruptor desligado por padrão. Substitui, só para isso, a regra anterior nunca automático. Mesmo caminho do botão (hjAnalisar): cache, chave e teto de sempre. Travas: interruptor em PESSOAL.hojeIaAuto (na conta, vale em todos os aparelhos; ligar mostra o custo e pede confirmação); marca da janela gravada ANTES de chamar e, se não grava, não chama; contagem de chamadas do dia no servidor (view ia_custos, funcionalidade hoje, qualquer origem; com 2 ou sem conseguir contar, não chama); nunca repete depois de erro; sem fontes úteis ou registro pendente, não chama; só o dono, só REAL. Custo: ~US$ 0,026 por análise (máximo ~US$ 0,06); 2 por dia dão ~US$ 1,6 por mês no típico, cerca de 23% do teto interno de US$ 6,70 compartilhado com a Newsletter e as perguntas. Perguntas continuam só manuais. Rotina no servidor em horários fixos foi descartada (exigiria SQL e função nova). Nenhuma chamada foi feita pelo agente. CLAUDE.md e docs/hoje.md atualizados.
