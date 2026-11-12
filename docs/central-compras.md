# Central de Compras (visão unificada: Mercado + compras online)

Rota `#mercado` (menu "Central de Compras"; a rota antiga continua). Código: `mercado.js` (aba **Central**, `viewCentral`) e `nucleo.js` (`NUCLEO.cu*`, funções puras).
Testes: `tests/central_compras.test.mjs` (conciliação financeira, filtros, duplicidade) e `tests/central_compras_tela.test.mjs` (a tela). Sem IA, sem chamada paga, **sem migration** e sem tabela nova.
Navegação de mercado (categoria → produto, estabelecimento, evolução e oportunidades): seção "Navegação de mercado" abaixo.

## Diagnóstico das fontes (conferido no código)
| Fonte | Onde está | Valor da compra | Itens/categoria |
|---|---|---|---|
| Notas do Mercado (presencial) | `notas` + `itens` + `mercados`, lidas pela view `compras` (uma linha por item) | soma de `itens.valor_total` da nota | categoria do item → do produto → a gravada (`mkCategoriaEfetiva`); subcategoria só com a 046 |
| Compras online | `compras_online` + `compras_online_itens` (025/030) | `total_pago` do pedido pela regra única `coRegra` (cancelado, "já contada em outro lugar", supermercado presencial, pendente e histórico físico da Amazon ficam fora) | `coPedidoPartes`: itens por categoria + **ajustes** (frete, taxas, desconto geral, outros), que nunca viram produto nem são rateados |
| Cortina de R$ 19,90 | nota do Mercado cujo `mercados.nome` é o emissor (`WILLIAM DA COSTA FREITAS LTDA`) | R$ 19,90 | sem evidência de plataforma no banco: o canal "Mercado Livre" é **informado pelo dono** (abaixo) |

Duas fontes, vocabulários de categoria diferentes. Na leitura, `cuCat` iguala só os rótulos equivalentes (Veículos→Automotivo, Eletrônicos→Tecnologia, Bebê→Bebê/Infantil, Casa→Casa/Utilidades, Saúde e farmácia→Saúde, Higiene e beleza→Higiene Pessoal); nada é regravado. "Alimentação" é um **filtro de grupo** (Mercearia, Padaria, Açougue/Frios, Hortifruti, Chocolates/Doces, Bebidas, Peixaria e a categoria Alimentação online); as categorias de baixo continuam próprias.

## Modelo: três dimensões independentes
Cada compra unificada (`cuDeNotas` / `cuDeOnline`) tem:
- **canal**: `presencial` ou `online`;
- **estabelecimento**: onde se comprou (Tauste, Confiança, Mercado Livre, Amazon…); cidade só sai do rótulo;
- **categoria** (e subcategoria quando existe), por item, nunca deduzida do estabelecimento;
- à parte: **emissor fiscal** (`mercados.nome` / `compras_online.emitente`), **plataforma** e **vendedor**. O emissor nunca é trocado pelo marketplace.

**Canal de uma nota do Mercado:** o padrão é presencial. Quando o dono informa que a compra foi online (ex.: cortina → Online · Mercado Livre), isso fica em `PESSOAL["mercado-canais"]` (tabela `pessoal`: só o dono, trava MFA, entra no backup) com a chave `data|emissor|número` da nota. Efeito: estabelecimento = plataforma, canal = online, emissor intacto. Nenhum dado é inventado: sem a informação, a nota aparece como está. A Fernanda vê as notas como estão (sem o botão de alterar), e a experiência dela não muda.

## Tela (aba Central, primeira do módulo)
Período (últimos meses, 12 meses, Tudo) + canal (Todas/Presenciais/Online) + estabelecimento + categoria, combináveis. Indicadores: gasto, compras, itens, média, total por canal e comparação com o mesmo período do mês anterior (respeita os filtros). Últimas compras (borda e selo diferenciam presencial de online), por estabelecimento e por categoria (barras com valor e rótulo fixos e `racDica`; clicar abre os itens) e a "Conferência dos totais". Abrir uma compra mostra itens, emissor, vendedor, pedido/nota, a conta (itens + frete + taxas + desconto = valor pago) e links para Notas e Compras online (telas de detalhe intactas). As abas antigas continuam; "Painel" passou a "Painel do Mercado".

## Integridade financeira
- Cada fonte mantém o próprio cálculo; a Central só soma o que cada uma já calcula. Total unificado = Mercado (Σ itens) + online que conta (`coResumo.total`) − pedidos cobertos por nota.
- Com categoria escolhida valem só os itens dela; frete, taxas e descontos gerais **não são divididos** (mesma regra de `coDetalhe`); sem categoria: Σ categorias + ajustes = total.
- **Duplicidade** (`cuUnificar`): nota + pedido com mesma data, mesmo valor **e mesmo número de NF** = a mesma transação → conta uma vez (a nota fica; o pedido vai para "cobertos por nota"). Só data e valor iguais = **possível duplicidade**: os dois continuam somados e a tela avisa para o dono marcar o pedido como "já contada em outro lugar" (mecanismo que já existia em Compras online). Nada é apagado nem alterado.
- Os testes comparam o total com a soma original do Mercado e com `coResumo`, e conferem `contam + fora = todos os pedidos`.

## Migration 046 e o que ainda precisa de banco
A Central **não depende** da 046: sem ela as notas aparecem sem subcategoria. Com ela, a subcategoria (ex.: Automotivo › Proteção) aparece nos itens. A 046 foi **aplicada em produção em 10/11/2026** (conferência em `supabase/conferencias/central_compras_pos046.sql`, só leitura). Achado real: no online há um item Pet (Bravecto, Amazon) e um pedido de papel higiênico em 2 linhas, categoria "Outros" (não é Pet); não há Pet nas notas do Mercado nem repetição nota × pedido.
Pendências conscientes (precisariam de SQL, não feitas): subcategoria dos itens online (hoje só a categoria) e gravar o canal da nota numa coluna em vez de `pessoal`.

## Navegação de mercado (12/11/2026; no código da branch, **não publicado**; sem migration, sem SQL, sem Edge Function)
A Central passou a ser navegável como um mercado: **Central → categoria → produto → compra** e **Central → estabelecimento → produtos e comparação**. Só o dono vê as páginas e os painéis novos;
a Central da casa (Fernanda) continua exatamente como era (barras, detalhe da barra e compras), porque mudar o que ela vê depende de pedido do dono.

**Uma fonte só.** Tudo sai das MESMAS compras da aba Central (`cuUnificar`: notas do Mercado + pedidos online que contam pela regra `coRegra`, sem a duplicidade forte nota × pedido).
`NUCLEO.cmLinhas` transforma essas compras em linhas no formato das linhas do Mercado (produto, quantidade, unidade, preço, total, estabelecimento, compra), e as contas de produto
reaproveitam `mkcProduto`/`mkcProdutos` (Consumo e Preços já usavam). Nenhuma regra financeira mudou e nada é regravado. Consequências provadas por teste:
- total da página de uma **categoria** = barra "Por categoria" da Central no mesmo período e canal (soma dos itens; frete, taxas e descontos gerais do pedido não são de nenhuma categoria);
- total da página de um **estabelecimento** = barra "Por estabelecimento" (soma do valor das compras); lá, produtos + ajustes dos pedidos = total, e a tela mostra a conta quando há ajuste;
- Σ meses da evolução = total da Central; o pedido coberto por nota (mesma data, valor e NF) não vira produto duas vezes; cancelado, pendente, "já contada em outro lugar" e histórico físico da Amazon ficam fora, como na Central.

**Preço unitário (o da fonte):** nota do Mercado = `valor_unitario` (o desconto da nota fica só no total, regra de `mkcProduto`); pedido online = valor líquido do item (total − desconto do item, `coPedidoPartes`) ÷ quantidade.
Frete, taxas e desconto geral do pedido nunca entram no preço nem são rateados. Preço médio = ponderado pela quantidade. kg, L e un nunca se misturam (cada unidade tem o seu bloco).
O histórico de preços das compras online com a regra do Lote 5.0 (`coPrecos`, que inclui "fora das contas" e o histórico da Amazon) continua em Compras online → Produtos; a página do produto da Central liga para lá ("Ver em Compras online").

**Período e canal** são os da Central (`CU.per`, `CU.canal`), compartilhados: escolher na página vale também na Central, e vice-versa. Sem escolha, 12 meses. Os filtros de estabelecimento e categoria da Central não valem nas páginas
(cada página já é de uma categoria ou de um estabelecimento). A página do **produto** usa todo o histórico.

### Telas (`mercado.js`, rotas `#mercado/categoria/<nome>`, `#mercado/produto/<nome>` e **`#mercado/estabelecimento/<nome>`**, nova)
- **Central (dono):** "Evolução dos gastos" (12 colunas mensais com valor e mês fixos, `racDica`; mês sem compra fica desligado; tocar escolhe o mês), "Explorar por categoria" e "Explorar por estabelecimento"
  (as duas fontes, no período e canal), "Oportunidades de economia" e, no detalhe de cada barra, "Abrir a categoria" / "Abrir o estabelecimento".
- **Categoria:** indicadores (gasto e participação, produtos, compras, estabelecimentos); um cartão por produto com gasto, quantidade, preço médio, nº de lugares, último / menor / maior preço pago
  (cada um abre a compra de origem), variação desde a compra anterior e o selo do Radar (já existia); ordem por gasto, compras, nome, maior alta ou maior queda; "Onde você compra <categoria>" (barras que levam ao estabelecimento)
  e a evolução mês a mês da categoria. O grupo "Alimentação" também abre como categoria.
- **Produto:** além do que já havia (último, menor, médio, compras, histórico, Radar, registrar compra), **maior pago**, variação desde a compra anterior e desde a primeira, **gráfico do preço pago** (um ponto por compra,
  com o estabelecimento no balão) e **"Onde você comprou"** (preço médio, último e menor por estabelecimento; ★ no mais barato; diferença de cada um). Inclui compras online; cada linha abre a nota (tela Notas) ou o pedido (Central, com a conta do pedido aberta).
- **Estabelecimento (novo):** indicadores (gasto, participação e posição no período, compras e ticket médio, produtos, última compra), as compras (abrem a nota ou o pedido), as categorias compradas lá,
  a evolução mês a mês, os produtos comprados lá (gasto, quantidade, último e médio; levam ao produto) e a **comparação com os outros estabelecimentos**: participação de cada um no gasto e, para os produtos comprados lá e em outro lugar,
  o preço médio de lá × o menor preço médio de outro lugar (mais barato aqui, mais caro aqui ou igual, abaixo de 2%).
- **Celular:** as colunas mensais rolam para o lado e começam nos meses mais recentes; nenhuma página rola para o lado (conferido em 390 px e 1280 px).

### Oportunidades de economia (`cmOportunidades`)
Últimos 12 meses (com o canal escolhido): produto, na mesma unidade, comprado em 2+ estabelecimentos. Economia **estimada** = Σ (preço médio pago num lugar − preço médio do lugar mais barato) × quantidade comprada lá,
só onde a diferença passa de 3% e o total passa de R$ 1. É o que se teria gasto comprando as mesmas quantidades pelo preço médio do mais barato; a tela diz que não considera promoção, validade, marca nem deslocamento. Nada é previsto nem inventado.

### Registro de compras
O fluxo não mudou (Adicionar nota no Mercado; pedidos em Compras online). Depois de gravar uma nota, o Mercado já relia as linhas (`loadRows(true)`). Novo: depois de gravar, anexar, marcar ou apagar um pedido,
Compras online (`ccEsquecer`, o mesmo ponto que já limpava o Painel) chama `RACmercado.esquecerOnline()`, e a Central lê os pedidos de novo na próxima vez que abrir; antes, o pedido novo só aparecia depois de recarregar o site.

### Código e testes
`nucleo.js` (puro): `cmLinhas`, `cmFiltrar`, `cmPorEstab`, `cmResumoProduto`, `cmOrdenar`, `cmCategoria`, `cmEstabelecimento`, `cmComparar`, `cmOportunidades`, `cmPorMes`, `cmExplorar`; `cuDeNotas` ganhou, nos itens, o preço unitário da nota
(`unitario`) e, na compra, a chave que abre a nota em Notas (`nota_abre`); nenhum total mudou. `mercado.js`: bloco "Navegação de mercado" (`viewCategoria`, `viewProduto`, `viewEstabelecimento`, `painelEvolucao`, `painelExplorar`, `painelOportunidades`).
Testes: `tests/central_mercado.test.mjs` (núcleo: totais = barras da Central, preço da fonte, sem duplicidade, comparação, oportunidades, meses) e `tests/central_mercado_tela.test.mjs` (telas com DOM falso: navegação de ponta a ponta, notas e pedidos abrindo a compra,
a casa sem nada novo, só leitura, compras online relidas depois de gravar). `central_radar_tela.test.mjs` continua valendo para as partes do Radar.

### Limites conhecidos
- Produto = nome: o mesmo produto com nomes diferentes (na nota e no pedido online) aparece separado; juntar continua sendo pela aba Produtos (notas). A comparação entre estabelecimentos só usa a mesma unidade e o mesmo nome.
- Pedido online sem quantidade conta como 1 unidade (regra de `coPedidoPartes`); online não tem kg/L, então o preço é por unidade.
- A variação e as oportunidades usam preços já pagos em datas diferentes: um lugar visitado há muitos meses pode parecer mais barato só pela data. A tela mostra as datas e chama o valor de estimativa.
- Pedidos gravados em outro aparelho só aparecem depois de recarregar o site (como antes); o botão ↻ redesenha sem reler os dados do Mercado.

## Futuro (não implementado; nada impede)
Sugerir classificação de produto (sempre com confirmação), juntar o mesmo produto entre nota e pedido online e subcategoria dos itens online (precisaria de SQL).
