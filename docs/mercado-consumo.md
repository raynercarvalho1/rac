# Mercado: consumo por categoria e histórico de preços

Tela: aba **Consumo** (`#mercado/consumo`, `viewConsumo` e `detalheProduto` em `mercado.js`). Contas: `nucleo.js` (`mkc*`, puras). Testes: `tests/mercado_consumo.test.mjs`.
Só lê as linhas reais da view `compras` já carregadas; não grava, não chama IA e não precisa de SQL.

## Filtros (valem juntos para a tela toda)
Período (tudo, 3, 6 ou 12 meses, ou um mês), categoria, mercado e busca de produto. `mkcFiltrar` é o único filtro: KPIs, barras, lista e detalhe saem das mesmas linhas, então os totais nunca divergem.
As barras de categoria usam o filtro sem a categoria (para dar para trocar); a participação é a categoria sobre esse total.

## Categoria
Total, participação, produtos diferentes, itens, compras e quantidade (por unidade). Produtos da categoria ordenáveis por maior gasto, mais comprados (frequência) ou nome; mostra o intervalo médio entre compras.
No Painel, o detalhe de uma categoria ganhou o botão "Analisar a categoria", que abre esta tela no mês e na categoria escolhidos.

## Produto
Um bloco **por unidade de medida** (kg, L, un): kg e un nunca se misturam (aviso na tela). Cada bloco traz último preço, contra a compra anterior (%), menor e maior preço (com data e mercado), preço médio,
quantidade, total gasto, gráfico de evolução, comparação entre mercados e histórico de compras.
- **Preço médio** = Σ(preço unitário × quantidade) ÷ Σ quantidade (média ponderada). O desconto da nota não entra no preço unitário; só no total gasto.
- **Variação** = (último − anterior) ÷ anterior, dentro da mesma unidade. Com uma compra só, não há variação nem gráfico (a tela avisa; nada é inventado).
- Comparação entre mercados: último, menor e médio por mercado, do mais barato ao mais caro no último preço.

## Preços por produto e unidade
A tabela **Mercado → Preços** (e a lista de produtos do Painel) usa a mesma identidade da aba Consumo: **nome + unidade** (`NUCLEO.mkcChaveProd`, `mkcPrecos`). Arroz kg e Arroz un são linhas separadas, cada uma com
último preço, menor, variação (primeira → última), compras, total gasto, quantidade e histórico próprios; há a coluna **Unidade**. Mês, desde o início, busca e ordenação funcionam como antes (dá para ordenar por unidade).
- O banco só aceita `un`, `kg` e `l`. Se aparecer outra unidade (ex.: `ml`), ela fica à parte, sem conversão. Embalagens diferentes ("Leite 1L" × "Leite 500ml") já são produtos com nomes diferentes e não se misturam.
- Quem chega ao detalhe só com o nome (atalho antigo) vê a unidade com mais compras.
