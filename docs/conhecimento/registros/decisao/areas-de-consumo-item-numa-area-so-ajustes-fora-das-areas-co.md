---
titulo: Áreas de consumo: item numa área só, ajustes fora das áreas, config em pessoal
tipo: decisao
categoria: mercado
tags: central-compras, areas, categorias
estado: ativo
origem: lote áreas de consumo 20/11/2026
data: 2026-11-20
---

## Motivo

Cada item pertence a uma categoria e cada categoria a uma área; a Central soma todas as áreas, os não classificados e os ajustes dos pedidos (frete, taxas, desconto geral), que nunca são rateados entre áreas. Categorias fora da lista inicial não são atribuídas por palpite: ficam sem área até o dono associar. A configuração mora em PESSOAL[mercado-areas] (tabela pessoal existente, só o dono, MFA, backup), sem migration; a Fernanda não vê as áreas nem teve o Painel alterado (pendência do dono: estender à casa exigiria migration). Detalhes em docs/central-areas.md.
