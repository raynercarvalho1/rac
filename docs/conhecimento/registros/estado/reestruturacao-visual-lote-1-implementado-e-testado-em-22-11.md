---
titulo: Reestruturação visual: Lote 1 implementado e testado em 22/11/2026 (lotes 2 e 3 pendentes)
tipo: estado
categoria: codigo
tags: hoje, reestruturacao
estado: ativo
origem: reestruturação visual, 22/11/2026
data: 2026-11-22
---

Lote 1 (Hoje como abertura do dono, Início fora do menu, faixa fina, blocos E-mails, Newsletter, Esportes e Sorocaba, barra nova) mesclado na main pelo PR #71 (commit 082bc3e, versão 2026-11-22.1), com Testes da main e deploy do Pages com sucesso em 22/11/2026; sem SQL, função, secret ou IA. Não conferidos: a versão realmente servida pelo site e o visual no iPhone (conferência do dono). Botão de recolher nos cartões e Lote 2 (MBA e estudos, Últimas compras e último treino no Hoje; versão 2026-11-22.3) mesclados pelo PR #73 (commit f3b5f99), com Testes da main e deploy do Pages com sucesso; a versão servida pelo site e o visual no iPhone seguem sem conferência. Lote 3 (botão + contextual por tela, versão 2026-11-22.4) mesclado pelo PR #75 (commit 26ee9c5), com Testes da main e deploy do Pages com sucesso; o run de Testes da main para 0cca45f (só documentação) falhou por HTTP 522 do Supabase em tests/banco.test.mjs, falha de rede e não de código (o run seguinte passou). Pendente depois dele: entrada manual de métrica na Saúde (decisão do dono) e, só com autorização de SQL, quem lançou a compra. Fora de escopo por decisão do dono: horário da newsletter e e-mails externos das 6h/9h (o RAC não envia e-mail). Plano: docs/planejamento/11-reestruturacao-visual.md.
