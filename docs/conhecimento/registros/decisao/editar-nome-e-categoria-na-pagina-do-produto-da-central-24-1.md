---
titulo: Editar nome e categoria na página do produto da Central (24/11/2026)
tipo: decisao
categoria: compras
tags: central, produto, categoria
estado: ativo
origem: sessão 24/11/2026
data: 2026-11-24
---

Pedido do dono: mudar nome e categoria dentro da página do produto, sem ir à aba Produtos. Nota do Mercado grava em produtos; pedido online não tem tabela própria editável (compras_gravar é a única porta), então o nome vira junção e a categoria vai no campo categorias do mesmo registro PESSOAL mercado-equivalencias (já liberado à casa pela 057/064), sem migration. Quem grava mercado-equivalencias deve preservar categorias (gravarEquiv faz isso).

## Motivo

Evitar migration e nova política de RLS; reaproveitar o registro compartilhado dono e casa.
