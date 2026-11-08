# Mercado: comparar períodos

Tela: aba **Comparar** (`#mercado/comparar`, `viewComparar` e `detalheComparar` em `mercado.js`). Contas: `nucleo.js` (`mkcComparar`, `mkcCompRank`, `mkcAtalho`, `mkcPeriodoInfo`, `mkcMetric`).
Testes: `tests/mercado_comparar.test.mjs`. Só lê as linhas da view `compras` já carregadas; não grava, não chama IA e **não precisa de SQL**.
Reaproveita `mkcFiltrar`, `mkcChaveProd`, `mkcQtd`, `mkcProduto`, `mkCatOficial`, `mkcAgrupa` e a identidade nome + unidade das abas Consumo e Preços.

## Períodos
**A** é o período analisado e **B** é o período de comparação (a base). Datas inicial e final de cada um, independentes (podem ter durações diferentes); a data final entra. Atalhos:
este mês (até hoje) × mês anterior inteiro; últimos 30 dias × 30 dias anteriores; últimos 3 ou 6 meses civis (até hoje) × os 3 ou 6 meses inteiros anteriores; ou datas livres.
A tela avisa quando os períodos têm durações diferentes (e mostra o **gasto por dia**) e quando se sobrepõem (as compras em comum entram nos dois). Data faltando, inexistente ou inicial depois da final: mensagem, sem comparar.

## Fórmulas
- diferença = A − B (em R$, em itens, em quantidade).
- variação % = (A − B) ÷ B, **só com B > 0**. Com B = 0 não há percentual: o estado é `novo` (A > 0), `zero` (os dois zero) ou `sem_base` (valor inexistente, ex.: gasto médio sem compras). Com A = 0 e B > 0 é −100%.
- gasto por dia = total ÷ dias do período (inclusivo). Gasto médio por compra = total ÷ compras (compra = nota distinta). Produtos diferentes = nome + unidade distintos.
- quantidade: sempre por unidade (kg, L, un, ou outra), nunca somadas entre si.
- participação = gasto da categoria (ou do mercado) ÷ gasto total do período, sem o filtro da própria dimensão.
- preço unitário do produto no período = Σ(preço unitário × quantidade) ÷ Σ quantidade (média ponderada). O desconto da nota entra no gasto, não no preço unitário.
- preço só é comparado com compra nos dois períodos, na mesma unidade; senão fica "—".

## Gasto, quantidade e preço são lidos separadamente
Para produtos nos dois períodos, a coluna **Explicação** diz o que explica a diferença de gasto (tolerância de ±0,5% para considerar "estável"): `preço`, `quantidade`, `preço e quantidade` ou `efeitos opostos`.
Ex.: gastar mais por comprar mais não é "ficou mais caro". Produto só em A ou só em B aparece como "só no período A/B".

## Quadros
Indicadores (A, B, diferença, variação); comparação geral; categorias (as 11 oficiais; barras lado a lado, clique para detalhar); produtos (lista ordenável + listas prontas: maior aumento e maior redução de gasto, aumento e redução de quantidade,
preço subiu/caiu, só em A, só em B; clique abre o detalhe lado a lado com menor, maior, último e médio e onde comprou); estabelecimentos (gasto, participação e sua mudança).
Os filtros de categoria, mercado e produto valem para os dois períodos; cada quadro ignora só o filtro da própria dimensão para dar para trocar. Gasto maior em um mercado não significa preço maior: produtos e quantidades mudam.
