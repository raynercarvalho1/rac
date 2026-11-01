# Painel de Produtividade

Página `#painel` (menu → Produtividade), código em `js/painel.js`, contas em `nucleo.js` (`NUCLEO.pn*`, com testes).
Feita em 31/10/2026. Só para o dono (dados pessoais). Não há SQL novo, Edge Function nova, IA nem API de fora.

## Como funciona

- Abas: **Visão geral**, **Finanças**, **Saúde e atividades**, **MBA e desenvolvimento** (`#painel/<aba>`); período de 3, 6 ou 12 meses.
- Uma leitura por período (guardada na sessão; **Atualizar** lê de novo), cada fonte falha sozinha e o quadro diz qual não abriu.
- Lê o período escolhido e o anterior do mesmo tamanho, para as comparações. Tudo pelo cliente do site, com o RLS de sempre.
- Gráficos: as colunas e barras do Resumo (`rsColunas`, `rsBarras`), com valor e rótulo fixos e o cartão destacado (`racDica`).
- Todo quadro termina com **Fonte** e **período**. Sem dado, o quadro diz "Nenhum…" em vez de mostrar zero ou exemplo.
- Única gravação: o orçamento por categoria (tabela `orcamentos`, que já existia sem tela), só no botão **Salvar orçamentos**.
- Diferença para o Resumo (`#resumo`): o Resumo é a foto de um período (semana, mês, ano) em cartões; o Painel é a evolução mês a mês,
  o controle (orçamento, consistência, competências) e a comparação entre períodos.

## Fontes de dados

| Fonte | Tabela/estrutura | Usada em |
|---|---|---|
| Mercado | view `compras` (itens das notas: data, categoria, valor) | gastos, compras, ticket médio, categorias, orçamento |
| Pedidos (Alimentação) | `pedidos` + `pedido_itens` (024): comida, taxas e gorjeta separadas (`NUCLEO.alPedidoDespesas`) | gastos, categorias, quadro Alimentação |
| Gastos dos registros | `registros.dados.custo` (veículos, Eddie, Olivia, documentos) | gastos por mês e por fonte, categorias |
| MBA (financeiro) | `PESSOAL.mba.financeiro` + `mbaFeito["pg:…"]` (parcelas pagas, no mês do vencimento) | gastos |
| Orçamentos | tabela `orcamentos` (categoria, valor mensal) | orçamento × gasto |
| Relógio Garmin | `garmin_ativ` e `garmin_dia` (desde 01/11/2025), pelo `saudeCarregar()` da Saúde | treinos, consistência, métricas |
| MBA (estudos) | `PESSOAL.mba` (disciplinas, roteiro, exercícios, aulas, avaliações) + `mbaFeito` (data de cada marcação) | MBA, evolução do aprendizado, competências |
| Estudos | trilhas (`TRILHAS`) + `PESSOAL.exercicios` (data de conclusão) | evolução do aprendizado, competências |
| SQL | `PESSOAL.sqlFeitos` (data de cada exercício) | evolução do aprendizado, competência SQL |
| Carreira | `PESSOAL.perfilCarreira.skills` + `NUCLEO.SKILLS` (as habilidades das vagas) | competências |
| Tarefas | `lista` (tipo tarefa: feito, feito_em) | tarefas feitas e abertas |
| Projetos | `PESSOAL.projetos` (Conexões) | projetos |
| Agenda | `agendaColetar()` (MBA, família, veículos, documentos, carreira, lembretes) | pendências e compromissos |

**Sem contar duas vezes:** o registro que veio de uma compra do Mercado (`dados.compra`, ex.: "Lata N aberta" da Olivia) fica fora dos
gastos dos registros, porque o preço já está no Mercado.

## Indicadores

- **Visão geral:** gastos, treinos, estudos concluídos e tarefas feitas do mês, comparados com o mesmo trecho do mês anterior;
  evolução mensal das quatro séries; últimos N meses × N anteriores (só com histórico nos dois); 10 atividades recentes; Agenda dos próximos 14 dias e atrasados.
- **Finanças:** média por mês (só meses com gasto), maior mês, gasto do mês e projeção simples (a partir do dia 5), gasto por dia;
  gastos por mês e por fonte; compras por mês e ticket médio; categorias; orçamento × gasto do mês (com ajuste).
- **Saúde:** treinos, dias e semanas ativas, média por semana, sequência atual e recorde (semanas seguidas com treino); treinos, distância
  e tempo por mês; tipos de atividade; média mensal de sono, nota do sono, variabilidade cardíaca, batimentos em repouso, energia do corpo,
  estresse e passos (só com os dias medidos).
- **MBA e desenvolvimento:** aulas dadas × calendário, disciplinas concluídas, avaliações respondidas, progresso por disciplina; itens
  concluídos por mês e por origem; competências (declaradas no perfil × estudos concluídos ligados a cada uma, pelo mesmo reconhecimento de
  termos das vagas); projetos e tarefas.

## Limites conhecidos

- A data de um estudo ou de uma parcela é a do **clique** em "feito" (o site guarda essa data); o que foi marcado antes do site guardar a data não tem mês.
- Orçamento só para categorias do Mercado (é o que a tabela `orcamentos` guarda).
- Gastos fora do site (cartão, contas da casa) não existem em nenhuma tabela, então não aparecem.
- Saúde só desde 01/11/2025 (antes o relógio era de outra pessoa); o diário de humor fica na Saúde.
