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

Cada item pertence a uma categoria e cada categoria a uma área; a Central soma todas as áreas, os não classificados e os ajustes dos pedidos (frete, taxas, desconto geral), que nunca são rateados entre áreas. Categorias fora da lista inicial não são atribuídas por palpite: ficam sem área até o dono associar. A configuração mora em PESSOAL[mercado-areas] (tabela pessoal, linha do dono). Por decisão do dono (20/11/2026) a Fernanda tem acesso integral e igual ao do dono na Central de Compras (ver, criar, editar, excluir áreas e categorias, alterar associações), com a configuração compartilhada; isso não amplia módulos só do dono. Exige a migration 064 (política da pessoal ganha a chave mercado-areas), aplicada e conferida em produção em 20/11/2026 (ChatGPT, informado pelo dono). Detalhes em docs/central-areas.md.
