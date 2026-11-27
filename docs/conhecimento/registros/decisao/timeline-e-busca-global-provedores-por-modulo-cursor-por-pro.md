---
titulo: Timeline e Busca global: provedores por modulo, cursor por provedor e privacidade imposta pelo orquestrador
tipo: decisao
categoria: projeto
tags: novo-rac, timeline, busca, provedores
estado: ativo
origem: Lote 3, 27/11/2026
data: 2026-11-27
relacionados: decisao/novo-rac-arquitetura-aprovada-no-lote-0-espacos-workspace-em
---

## Motivo

Sem copia de dados e sem alteracao de banco: cada modulo continua dono do dado e responde por um provedor (js/prov-*.js) que le com a sessao de quem ve (RLS). O orquestrador impoe espaco e origem, valida o evento pelo contrato, isola falha e tempo-limite de cada provedor (resultado parcial) e nunca roda provedor privado em espaco compartilhado. Paginacao por cursor por provedor {quando, vistos}: nada se perde nem se repete com gravacoes novas ou empates. Ids estaveis provedor:tabela:chave; nota fiscal absorvida pelo pedido ou nota do Mercado pelo vinculo existente. Busca sem acento por regex do Postgres (imatch), sem extensao nem indice novo; a busca antiga de conteudo em memoria virou provedores. So do dono; a casa segue com a busca de antes. Alternativas e Grill Me: docs/planejamento/19 secao 8.
