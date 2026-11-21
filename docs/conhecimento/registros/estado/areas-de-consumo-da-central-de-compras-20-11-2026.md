---
titulo: Áreas de consumo da Central de Compras (20/11/2026)
tipo: estado
categoria: mercado
tags: central-compras, areas
estado: ativo
origem: lote áreas de consumo 20/11/2026
data: 2026-11-20
---

Implementado em código e testado (tests/areas_consumo.test.mjs), PR #60 mesclado na main (versão 2026-11-20.10); a navegação (PR #61) foi mesclada em 21/11/2026; o lote A (motor único de painel) foi mesclado (PR #62) em 21/11/2026; o lote B (área Delivery, Alimentação só como entrada do pedido) foi mesclado (PR #63) em 21/11/2026; o lote C (Central Fiscal como Entrada, Pedidos online só entrada, sem 'pendente' na tela) foi mesclado (PR #64); os lotes D (seletor de área em Preços, Consumo e Comparar) e E (lista de notas silenciosa) foram mesclados (PR #65); o lote F (tela mais direta) foi mesclado (PR #66); o lote G (limpeza de código obsoleto, sem mudança de tela ou regra) está em PR, versão 2026-11-21.7, NÃO mesclado e NÃO publicado. Depois: lote da SEFAZ (estados, consulta oficial) e limpeza do código obsoleto. Usa PESSOAL[mercado-areas] e exige a migration 064 (política da pessoal para a casa; APLICADA e conferida em produção em 20/11/2026 pelo ChatGPT, informado pelo dono). Painéis Mercado, Automotivo, Farmácia e Bebê/Infantil, Não classificados e Gestão de categorias (#mercado/categorias), dono e Fernanda com os mesmos poderes (correção do dono em 20/11/2026). Pendente: o dono associar as categorias sem área (Tecnologia, Saúde, Vestuário, Pet, Alimentação, Outros) e mesclar/publicar o novo PR (a 064 já está aplicada); Preços/Consumo/Comparar/Produtos ainda sem filtro por área.
