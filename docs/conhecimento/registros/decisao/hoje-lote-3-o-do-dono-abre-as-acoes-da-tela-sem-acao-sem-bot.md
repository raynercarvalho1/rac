---
titulo: Hoje, Lote 3: o + do dono abre as ações da tela; sem ação, sem botão; Fernanda inalterada
tipo: decisao
categoria: codigo
tags: hoje, botao-mais, captura, reestruturacao
estado: ativo
origem: reestruturação visual, Lote 3, 22/11/2026
data: 2026-11-22
---

## Motivo

Pedido do dono (22/11/2026): o + de baixo era igual em toda tela, com atividades que ele não usa e algumas que não funcionavam; cada tela deve oferecer o que dá para adicionar nela. Cada rota declara acoes no registro (js/rotas.js, [id, ícone, rótulo]); o id é um formulário da folha Anotar rápido, um endereço de página (#fiscal) ou inbox-novo (Nova mensagem do Inbox). Tela sem acoes não mostra o botão. A Saúde ficou sem botão porque o sistema não tem entrada manual de métrica (dados vêm do relógio); criar essa entrada é recurso novo e decisão do dono. A Fernanda (papel casa) mantém a folha completa em todas as telas: capAcoes só devolve lista para o dono e há teste com mutação para isso.
