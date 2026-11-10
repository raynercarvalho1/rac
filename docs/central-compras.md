# Central de Compras (visão unificada: Mercado + compras online)

Rota `#mercado` (menu "Central de Compras"; a rota antiga continua). Código: `mercado.js` (aba **Central**, `viewCentral`) e `nucleo.js` (`NUCLEO.cu*`, funções puras).
Testes: `tests/central_compras.test.mjs` (conciliação financeira, filtros, duplicidade) e `tests/central_compras_tela.test.mjs` (a tela). Sem IA, sem chamada paga, **sem migration** e sem tabela nova.

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

## Futuro (não implementado; nada impede)
`cuItens` e `cuResumo` já entregam produto, valor e quantidade por estabelecimento e categoria, e `produto_chave` casa com `alChaveProduto`: dá para ligar o Radar de Preços, comparar preço pago × histórico e sugerir classificação (sempre com confirmação) sem mudar o modelo.
