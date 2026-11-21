---
titulo: Delivery vira a 5ª área da Central e Alimentação fica só como entrada do pedido
tipo: decisao
categoria: mercado
tags: central-compras, delivery, alimentacao
estado: ativo
origem: lote B 21/11/2026
data: 2026-11-21
relacionados: decisao/painel-de-area-e-central-usam-um-motor-unico-o-painel-do-mer
---

## Motivo

Decisão do dono: remover a página Alimentação e delivery; o que era Alimentação vai para o Mercado e o que era delivery vira a área Delivery. Os pedidos (tabelas pedidos e pedido_itens) entram na fonte unificada como compras com ajustes (taxas, gorjeta, descontos) sem ratear; a Central passa a somar o delivery. A rota alimentacao fica só como entrada do pedido (novo, editar, ver), sem menu, aberta à casa; qualquer outro endereço abre o painel Delivery. Tabelas, RPC, view e backup não mudam. A área Delivery só aparece na navegação quando tem pedidos.
