---
titulo: Eddie: peso do dia em qualquer registro vira uma pesagem de verdade
tipo: decisao
categoria: familia
tags: eddie, peso, familia
estado: ativo
origem: pedido do dono 24/11/2026, versão 2026-11-24.4
data: 2026-11-24
---

O formulário de registro do Eddie tem 'Peso do dia (kg, opcional)' em todos os tipos (flag pesoEmTodos em js/fonte-familia.js). Preenchido, grava também um registro tipo peso (dados.pesoDe = id do registro; o registro guarda dados.peso e dados.pesoRegId). Não foi mudado nenhum leitor de peso: quadro, gráfico, resumo e o + rápido leem tipo peso. Editar atualiza a pesagem; esvaziar apaga só ela; apagar o registro de origem não apaga a pesagem. Olivia e veículos ficam como estavam.

## Motivo

O dono quer registrar o peso junto de qualquer registro do Eddie sem torná-lo obrigatório, alimentando o histórico de peso. Reaproveitar o tipo peso evita mexer em vários leitores e preserva os dados existentes.
