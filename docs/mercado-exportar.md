# Mercado: exportar relatórios (CSV)

Botão **⬇ Exportar CSV** nas abas Painel, Preços, Consumo, Comparar e Alertas (`mercado.js`: `blocoExportar`, `salvarArquivo`). O arquivo é montado em `nucleo.js`
(`mkx*`, puras: só texto) e baixado no próprio aparelho. Testes: `tests/mercado_exportar.test.mjs`. Sem migration, sem Edge Function, sem consulta nova ao Supabase
e sem biblioteca: usa as linhas que a aba já carregou (`rows`) e as funções das telas (`mkcFiltrar`, `mkcResumo`, `mkcCategorias`, `mkcPrecos`, `mkcProduto`, `mkcComparar`, `mkalGerar`).

## Como funciona
- Ao lado do botão há uma frase com o relatório que vai sair ("Vai exportar: Consumo · Todo o histórico · Açougue/Frios · 1 produto."). Sem dados, ela diz
  **"Não há dados para exportar."** e o clique não baixa nada.
- Cada relatório recebe as linhas e os **filtros ativos da aba** e aplica `mkcFiltrar` de novo: linha fora do filtro nunca sai, mesmo se a tela mandar linhas a mais.
- Só colunas escolhidas saem. `id`, `user_id`, `numero`, `nota`, `forma_pagamento`, `observacao`, `descricao` e `produto_id` nunca vão para o arquivo.
- Alertas só para o dono (`dono: true` ou o relatório é recusado) e a aba continua escondida para a casa.

## Formato (Excel em português do Brasil)
UTF-8 **com BOM**, separador `;`, linhas CRLF, decimal com vírgula (`5,8`), dinheiro e percentual como **número** (sem "R$" nem "%"; `12,5` = 12,5%), datas `AAAA-MM-DD`.
Texto com `;`, vírgula, aspas ou quebra de linha vai entre aspas (`""` dentro). Texto que começa com `=`, `+`, `-` ou `@` ganha um apóstrofo para não virar fórmula.
O arquivo começa por um bloco `campo;valor` (relatório, período, filtros, totais, "Gerado em") e segue com seções: título, cabeçalho e linhas.
Nome: `rac-mercado-<relatório>_<período>.csv` (ex.: `rac-mercado-consumo_2026-10-01_a_2026-10-31.csv`, `rac-mercado-painel_2026-11.csv`,
`rac-mercado-comparacao_A-…_B-….csv`, `rac-mercado-alertas_aumento_2026-11-08.csv`; sem período, `todo-historico`).

## O que cada aba exporta
| Aba | Filtros respeitados | Seções |
|---|---|---|
| Consumo | período, categoria, mercado, busca, ordem | Produtos (um por unidade: compras, quantidade, gasto, preço médio ponderado, menor/maior/último preço, estabelecimentos), Por categoria, Por estabelecimento, Mês a mês |
| Comparar | períodos A e B, categoria, mercado, busca, **lista de produtos escolhida** | Comparação geral (A, B, diferença, variação %, situação), Por categoria, Produtos (gasto, quantidade e preço médio de A e B, explicação), Estabelecimentos |
| Painel | mês escolhido | Informações do mês (total, compras, itens, descontos e a comparação com o MESMO período do mês anterior), Por categoria (participação), Por estabelecimento |
| Preços | mês ("Desde o início" ou um mês) e busca | Produtos e unidades (primeira e última compra, menor/maior preço, variação), Histórico de preços (uma linha por compra) |
| Alertas | painel: todos os tipos ligados; lista: o tipo aberto, só os novos (ou também lidos e anteriores, se a caixa estiver marcada) | Alertas (tipo, produto e unidade, preço atual e de referência, diferença, variação, datas, situação, motivo) |

## Regras que não mudam
- **Produto = nome + unidade.** Arroz kg e Arroz un são linhas separadas; quantidades nunca são somadas entre unidades.
- Variação percentual fica **em branco** quando não há base (B sem compras, uma compra só): nada de percentual inventado.
- Os cálculos são os das telas (nada é recalculado por regra própria); o export só formata.
- A lista de produtos da Comparação sai inteira (a tela mostra 40 e o botão "Mostrar todos"); as categorias e estabelecimentos seguem o que cada quadro da tela mostra
  (o quadro de categorias ignora o filtro de categoria, e o de estabelecimentos o de mercado, para dar para trocar de um para outro).
