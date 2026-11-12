# Central de Compras × Radar de Ofertas

Liga o que o dono **pagou** (compras registradas) ao que a internet **oferece** (anúncios descobertos pelo Radar), sem misturar os dois. Só do dono: a casa (Fernanda) não vê nada disto e a experiência dela não muda.

## Regras (valem em todo o código)
1. Oferta encontrada na internet **não é compra**. O preço descoberto nunca é gravado como preço pago nem como preço verificado: a tela só o **compara**, de forma indicativa, com o último preço pago.
2. Nada é gravado automaticamente a partir de um anúncio. Para a compra entrar no histórico, o dono a registra pelo fluxo normal da Central (adicionar nota ou pedido). "Acompanhar" continua sendo o fluxo do Radar (oferta com equivalência não confirmada).
3. Apresentações diferentes continuam separadas: cada anúncio mostra o selo da classificação (individual, kit, combo, outra apresentação, relacionado, indeterminado) e **o que ele tem de diferente** do produto procurado (`rdDiferenca`).
4. Kit e combo mostram a composição e o preço por unidade/medida quando calculável (já era do Radar); combo e relacionado nunca têm preço por medida comparável.
5. Relacionados aparecem, claramente marcados como "outro produto"; nada é descartado por ter embalagem ou quantidade diferente (o filtro padrão "Do produto" só esconde relacionado e indeterminado, e "Todos" os traz a um toque).
6. O histórico de preços das compras (`compras`, `mkcProduto`) não é tocado. Nenhuma tabela nova, nenhuma migration.

## Telas (`mercado.js`, rotas `#mercado/categoria/<nome>` e `#mercado/produto/<nome>`)
- **Central → "Explorar por categoria"**: um cartão por categoria (produtos e total gasto). Na aba **Produtos**, "Abrir página" leva à página do produto.
- **Categoria** (ex.: Padaria): produtos da categoria com **último preço pago** (por unidade e data/mercado), **menor pago**, nº de compras e, para os produtos vinculados ao Radar, o selo "N ofertas do produto · melhor R$ x por 100 g · (preço visto na internet, não confirmado)". Uma consulta só, de leitura, ao `radar_candidatos`; sem gastar busca.
- **Produto**: (1) KPIs do que foi pago (último, menor, médio, compras) por unidade; (2) **O que você pagou**: histórico completo; (3) **Comprou? Registre a compra**: leva a "Adicionar nota"; (4) **Ofertas na internet**: sem vínculo, sugere produtos parecidos do Radar, permite escolher outro ou "Monitorar este produto no Radar" (cria **um** `radar_itens` com origem `comprado`); com vínculo, mostra as ofertas desse produto com os mesmos cartões, filtros e ações da aba Descobrir (Acompanhar, Ver lojas, Ignorar, Buscar ofertas).

## Vínculo produto da Central ↔ produto do Radar
Guardado em `PESSOAL["radar-vinculos"]` (`{ "n:<nome normalizado>": "<id do radar_itens>" }`, tabela `pessoal`, **sem migration**). A chave é o nome normalizado (o mesmo critério que junta nomes parecidos na aba Produtos). O vínculo é **sempre uma decisão do dono**: o sistema só sugere (palavras em comum ≥ 40%, `pcSugerirItens`) e nunca vincula sozinho. Desvincular remove só o vínculo.

## Comparação com o que foi pago (indicativa)
`pcComparar` só compara quando a base é a mesma: kg↔100 g, L↔100 ml, un↔unidade. Outras combinações dizem o motivo ("o anúncio é por 100 g e a compra é por un") e não convertem nada. O texto sempre diz "indicativo, preço visto no Google"; o frete não entra.

## Código
- `nucleo.js` (puro, `tests/central_radar.test.mjs`): `pcChave`, `pcVinculos`, `pcVincular`, `pcDesvincular`, `pcItemDe`, `pcTokens`, `pcSugerirItens`, `pcBase`, `pcComparar`, `rdDiferenca`, `pcResumoOfertas`, `pcCategoria` (reaproveita `mkcProdutos`, `mkcProduto`, `mkcCategorias`).
- `js/radar.js`: modo embutido `rtMontarOfertas(corpo, sb, user, itemId, pago)` (só o dono) que reaproveita `rtAbaDescobrir` e `rtDescCartao`; o cartão ganhou a linha de diferença e a de comparação. Testes em `tests/radar_tela.test.mjs`.
- `mercado.js`: `viewCategoria`, `viewProduto`, `painelCategorias`; rota com segundo trecho (`js/app.js`). Testes em `tests/central_radar_tela.test.mjs` (a casa não vê nada; só se escreve em `radar_itens` ao criar o produto e no vínculo em `pessoal`; nada em compras, preços ou ofertas).

## O que depende de produção
Nada: sem migration, sem Edge Function nova (a função `radar` não mudou) e sem Secret. Basta publicar o site (commit e push).

## Limites conhecidos
- O vínculo é por **nome** do produto da Central: se o nome mudar na aba Produtos, o vínculo precisa ser refeito.
- A comparação depende da unidade da compra e da base do anúncio; sem a mesma base, não há comparação.
- A lista da categoria mostra ofertas só de produtos **já vinculados**; sem vínculo, a página do produto sugere o vínculo.
- Compras online (pedidos) ainda não entram nestas páginas: elas usam as compras de mercado (`compras`), que têm produto e categoria.
