# Central de Compras · áreas de consumo e gestão de categorias (20/11/2026)

Código: `nucleo.js` (bloco "Áreas de consumo": `AR_*`, `arConfig`, `arRaw`, `arAreaDe`, `arAssociar`, `arAreaCriar`, `arAreaRemover`, `arCategoriaCriar`, `arCategoriaRemover`, `arCompras`, `arResumo`, `arCategorias`; puras)
e `mercado.js` (`navAreas`, `painelAreas`, `viewCategorias`, `areaCfg`, `areaContexto`, `rowsP`; o painel de uma área é a própria `viewCentral` com `CU.area`).
Testes: `tests/areas_consumo.test.mjs`, `tests/banco_casa_areas.test.mjs` (PGlite). Sem IA e sem Edge Function. **Dono e casa (Fernanda) têm os mesmos poderes** (correção de regra do dono em 20/11/2026); exige a **migration 064** (aplicada em produção em 20/11/2026 e conferida pelo ChatGPT (informado pelo dono; não reconferida por este agente, Supabase MCP indisponível)).

## Modelo
- **Item → categoria → área.** Cada item tem uma categoria (a que a Central já usa, `cuCat`) e cada categoria pertence a **uma** área (ou a nenhuma). Logo cada item está em uma só área.
- **Áreas de fábrica:** Mercado, Automotivo, Farmácia, Bebê/Infantil. As 13 associações iniciais (Mercearia, Padaria, Açougue/Frios, Hortifruti, Chocolates/Doces, Bebidas, Limpeza, Higiene Pessoal, Peixaria, Casa/Utilidades → Mercado; Bebê/Infantil → Bebê/Infantil; Farmácia → Farmácia; Automotivo → Automotivo) estão em `NUCLEO.AR_MAPA_PADRAO`.
- **Nada mais é atribuído sozinho.** Auditoria das categorias existentes: oficiais do Mercado (`MK_CATEGORIAS`, 12) + sugeridas (`MK_CATEGORIAS_EXTRA`: Automotivo, Tecnologia, Saúde, Vestuário) + "Outros" (etiqueta neutra da Central Fiscal) + as de pedidos online (`CO_CATEGORIAS`: Pet, Saúde e farmácia, Casa, Eletrônicos, Higiene e beleza, Bebê, Alimentação, Livros e papelaria, Veículos, Vestuário, Presentes, Outros; "Compras online · Digital") + personalizadas digitadas no editor de item.
  Os rótulos online equivalentes já são unificados na leitura (`cuCat`: Veículos→Automotivo, Bebê→Bebê/Infantil, Casa→Casa/Utilidades, Higiene e beleza→Higiene Pessoal, Eletrônicos→Tecnologia, Saúde e farmácia→Saúde). **Ficam sem área, esperando o dono:** Tecnologia, Saúde, Vestuário, Pet, Alimentação, Outros, Livros e papelaria, Presentes, Digital e qualquer categoria personalizada.
- **Configuração** em `PESSOAL["mercado-areas"]` = `{v:1, areas:[{id,nome}] (só as criadas), associacoes:{"<categoria>":"<área>"|""} (só o que o dono mudou), categorias:["<personalizada>"]}`. Tabela `pessoal` (já existente), **uma linha só, a do dono**: o dono e a Fernanda leem e gravam essa mesma linha (política "casa compartilha"), com trava MFA, no backup e igual em qualquer sessão ou aparelho. A chave está em `PESSOAL_CASA` (`js/app.js`) e na política da **064** (que acrescenta `mercado-areas` às 6 chaves da 057). Edição simultânea: a casa nunca sobrescreve às cegas (vale a versão da conta, como nas outras chaves compartilhadas); o dono usa o fluxo de conflito do Sistema. Por que não uma tabela própria: os dados são pequenos, só do dono, e a `pessoal` já tem RLS, MFA, backup e versão com detecção de conflito; uma tabela nova só traria migration sem ganho (a 062 de catálogo de segurança ainda nem foi aplicada).
- **Validação na leitura** (`arConfig`): nomes só texto de até 40 letras sem `<` `>`; ids `[a-z0-9-]`; sem nome repetido; área inexistente vira "sem área"; chaves `__*` ignoradas; lixo vira a configuração de fábrica.

## Como cada painel calcula
O painel de uma área é a Central **reduzida aos itens da área** (`arCompras(compras, área, cfg)`), com os mesmos componentes: gasto, comparação com o período anterior, compras e itens, evolução mensal, estabelecimentos, categorias, produtos (Explorar), últimas compras com detalhe, filtros de período, canal, estabelecimento e categoria (só com o que é da área).
- Valor da compra na área = **soma dos itens da área**. Frete, taxas e descontos gerais do pedido (`ajustes`) **não pertencem a nenhum item e não são rateados**: ficam só na Central. O detalhe da compra avisa quando ela tem itens de outras áreas e mostra o valor pago total.
- As regras financeiras são as da Central, sem alteração: a entrada é `cuUnificar` (pedido cancelado, "já contado em outro lugar", supermercado presencial, pendente e histórico físico da Amazon não entram; nota + pedido de mesma data, valor e NF contam uma vez). Nenhuma área soma o que a Central exclui.
- Alterar a área de uma categoria só muda a classificação: notas, pedidos, itens, valores e o total da Central não mudam; nada é criado, duplicado ou apagado.
- **Painel do Mercado** (aba, dono): `rowsP()` = linhas da view `compras` da área Mercado; Farmácia, Automotivo e itens sem área saem dos indicadores, gráficos, categorias e evolução, com um aviso do que ficou de fora. A casa vê exatamente o mesmo (mesma configuração). Preços, Consumo, Comparar, Produtos e Notas continuam com todo o catálogo (ferramentas de produto; ver pendências).

## Como a Central consolida
`arResumo`: Σ valor das áreas + não classificados + ajustes = total da Central no mesmo filtro (`cuResumo`), provado por teste com filtros de mês, canal e estabelecimento. A Central mostra "Por área de consumo" (barras com valor, % e dica; tocar abre o painel) e a conta. Itens sem área aparecem como **Não classificados** (painel próprio, contador na navegação, aviso com as categorias a associar) e continuam somados.

## Telas e navegação (dono e casa)
- `#mercado/central` (consolidada), `#mercado/area/<id>` (painel de uma área; `nao-classificados` para os sem área), `#mercado/categorias` (Gestão de categorias).
- **Navegação (ajuste de 20/11/2026, pedido do dono):** na caixa grande das abas ficam **Central** (tudo, uma vez só) e **cada área** (Mercado, Automotivo, Farmácia, Bebê/Infantil e as criadas); a faixa de baixo (quebra de linha, sem rolagem lateral) tem **Painel do Mercado, Preços, Consumo, Comparar, Não classificados (n)** e **⚙ Gestão de categorias**. A área ativa fica marcada (`aria-current`) e o painel abre com o cartão "Área de consumo: <nome>" e as categorias dela.
- **Gestão de categorias:** cada categoria com área (seletor), itens e valor, "Sem área" primeiro, explicação de onde será contabilizada, nova categoria, nova área, remover só o que foi criado. Remover área ou categoria criada não apaga nada: o item continua na Central como não classificado. O editor de item (Notas → Editar) passa a oferecer as categorias criadas.
- Nova área = só dado (criar na Gestão): nenhuma mudança de código por área.
- A distinção com o Painel de produtividade (`#painel`, `docs/painel.md`) é mantida: os painéis de consumo moram em `#mercado`.

## Acesso (correção de regra de 20/11/2026)
A Fernanda tem acesso integral à Central de Compras: vê a Central e todos os painéis de área, abre a Gestão de categorias, cria, edita e exclui áreas e categorias, altera associações e vê os mesmos indicadores, gráficos, filtros e históricos, sobre a mesma configuração do dono. **Não amplia nenhum módulo exclusivo do dono** (Gmail, custos de IA, Sistema, RAC Hoje, Inbox, restauração continuam fechados).
**Depende da migration 064** (`supabase/064_casa_areas_consumo.sql`, **aplicada em produção em 20/11/2026 e conferida pelo ChatGPT (informado pelo dono; não reconferida por este agente, Supabase MCP indisponível)**; conferência só leitura `supabase/conferencias/064_conferir_producao.sql`): sem ela o site da Fernanda não lê a chave (o banco filtra) e ela veria as áreas de fábrica, sem as mudanças do dono, e não conseguiria gravar. Ordem: 1) SQL 064, 2) site. Se a 057 for executada depois da 064, rode a 064 de novo.

## Limites e pendências
- Preços, Consumo, Comparar e Produtos ainda listam todas as categorias; filtrar por área neles é um próximo lote, se o dono quiser.
- Categorias do pedido online ficam sem frete por área (decisão financeira acima); subcategoria online continua inexistente.

## Lote A · desenho (21/11/2026) — PLANEJADO, NÃO IMPLEMENTADO
Aguarda aprovação do dono. Parte da navegação do PR #61 (Central e áreas na caixa grande).

**Intenção.** Eu e a Fernanda vermos todas as compras da casa. Cada área (Mercado, Automotivo, Farmácia, Bebê/Infantil e as futuras) tem um painel com a cara e as funções do Painel do Mercado; a Central é o mesmo painel sem filtro de área, somando tudo.
**Metas.** (1) Um só motor de painel para todas as áreas e para a Central. (2) Fonte única: notas + pedidos online (`cuUnificar`), sem duplicar. (3) Área criada depois ganha o painel sozinha. (4) Comparação de dois períodos livres e variação de preço por produto. (5) A Central mostra a conta fechando: áreas + não classificados + ajustes = total.
**Não metas (outros lotes).** Área Delivery e fim da página Alimentação (lote B); Central Fiscal como Entrada, Compras online e mensagens de "pendente" (lote C); qualquer SQL, Edge Function ou mudança de regra financeira.
**Antimetas.** Número do Painel do Mercado mudar sem querer; perder algum recurso do Painel; ficar com dois motores de painel; a Fernanda ver algo diferente do dono.
**Restrições.** ES5 puro; nomes globais únicos; gráfico novo com `racDica`; classificação por item pela categoria; Fernanda com os mesmos poderes; sem SQL em produção; versão trocada em `sw.js`, `js/app.js` e `index.html`.

**Abordagens.** (1) **Escolhida:** o motor do Painel do Mercado (`viewPainel`) passa a receber área e linhas, vindas das compras unificadas pela `cmLinhas`; preserva o que está testado e usa o que já existe. (2) Painel novo do zero: mais risco de perder detalhes e de reescrever testes. (3) Acrescentar os recursos do Painel à tela da Central: reproduz recurso por recurso o que o dono pediu para seguir.

**Desenho.**
- **Fonte:** `linhas = cmLinhas(arCompras(compras, área, cfg))`; na Central, `cmLinhas(todas)`. `cmLinhas` ganha o campo `desconto` por item (e `cuDeNotas`, o do item); nenhum total muda.
- **Motor:** `viewPainel(body, ctx)` com `ctx = {area, linhas}`; no lugar de `rowsP()`. O estado (mês, indicador aberto) é separado por área e zerado ao trocar de área. Mantém: seletor de mês, comparação com o mesmo dia do mês anterior, indicadores clicáveis, mês a mês, por estabelecimento e categoria, "O que mais pesou", CSV.
- **Abrir uma compra:** nota abre em Notas, pedido abre na Central (`abrirLinha`, como hoje).
- **Central:** o mesmo motor com os filtros de canal, estabelecimento e categoria, períodos 12 meses e Tudo, o quadro "Por área" e a conferência dos totais. A `viewCentral` antiga e o painel de área da versão atual saem (um motor só).
- **Rotas:** `#mercado/central`, `#mercado/area/<id>` (sem mudança). `#mercado/painel` passa a redirecionar para `#mercado/area/mercado`. **Minha decisão:** como o Mercado já está na caixa grande, tiro "Painel do Mercado" da linha de baixo para não duplicar.
- **Comparação (passo 3):** dois períodos livres (mês, 12 meses, intervalo) lado a lado por área, e variação de preço por produto, reaproveitando `mkcPrecos`/`mkcProduto` sobre as linhas da área.
- **Fernanda:** mesmo código, mesma configuração, mesmos poderes.

**Passos, cada um com testes.** (1) Teste de regressão (fixture com a saída atual do Painel) e adaptador `cmLinhas` com `desconto`. (2) Motor parametrizado + Mercado, Automotivo, Farmácia, Bebê. (3) Central no motor + quadro "Por área" + remoção do código duplicado. (4) Comparação de períodos e variação de preço. Documentação, histórico e RAC Knowledge no fim.
**Prova de que nada mudou:** Mercado só com notas e todas as categorias de Mercado = saída idêntica à do Painel de hoje; Σ áreas + não classificados + ajustes = Central; nenhum item duplicado.
**Fica para quem constrói.** Layout fino no iPhone, textos de ajuda, nomes internos, divisão em commits.
