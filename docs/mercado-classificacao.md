# Mercado: categorias e classificação de produtos

Código: `nucleo.js` (`MK_CATEGORIAS`, `mkCatOficial`, `mkNome`, `mkChave`, `mkClassificar`, só funções puras) e `mercado.js` (tela "Adicionar nota" e "Produtos").
Testes: `tests/mercado_classificacao.test.mjs`. Sem IA e sem chamada paga.

## Categorias oficiais (12)
Mercearia, Padaria, Açougue/Frios, Hortifruti, Chocolates/Doces, Bebidas, Limpeza, Higiene Pessoal, Peixaria, Casa/Utilidades, Bebê/Infantil, **Farmácia** (nova em 20/11/2026).
"Limpeza/Descartáveis" não existe mais: vira **Limpeza** (guardanapo, toalha de papel, esponja, hastes flexíveis e descartáveis entram nela).
`mkCatOficial` faz a unificação na leitura (linhas do Mercado, produtos, orçamento do Painel, despesas), então telas, gráficos e filtros nunca veem as duas.
Categoria de fora da lista (ex.: "Outros" da planilha antiga) é mantida, não apagada.

## Ordem de decisão (`mkClassificar`)
1. Produto já cadastrado (mesma chave de nome, ou descrição já usada numa nota anterior): reaproveita `produtos.categoria`.
2. A correção manual em Mercado → Produtos grava `produtos.categoria`; por isso ela é a referência e a classificação automática **nunca** atualiza produto existente.
3. Produto novo: regras por tipo do produto (`MK_REGRAS`, em ordem, com exceções, ex.: molho de tomate ≠ tomate, pão de queijo ≠ queijo, água sanitária ≠ água).
4. Ambíguo ou sem regra: `categoria: null`, `revisar: true`. Na tela do Mercado o item fica em "Escolher categoria…" e a nota não salva até o dono escolher. Na entrada automática da Central Fiscal (que nunca pede categoria) o produto novo recebe a etiqueta neutra **"Outros"** (`MK_CAT_REVISAR`, não é categoria oficial) com `revisar: true`: aparece em "produtos do Mercado sem categoria" (Sistema) e na revisão, e o dono ajusta em Mercado → Produtos. Nunca Mercearia por palpite.
Uma correção só vale para o mesmo produto (chave igual). Outro sabor ou tamanho não herda a categoria.

## Nome normalizado
`mkNome("BISC WAFER TUBIN CHOCO")` → "Biscoito Wafer Tubin Choco". Expande abreviaturas conhecidas, tira código no começo e "kg" da balança, mantém marca e sabor.
Abreviatura com dúvida (ex.: "SAB") fica como veio. A descrição original do cupom continua em `itens.descricao` (auditoria). `mkChave` compara produtos ignorando caixa, acento e abreviatura, sem misturar tamanhos.

## Banco
Proposta `supabase/propostas/041_mercado_categorias_oficiais.sql` (**não aplicada**): só troca "Limpeza/Descartáveis" por "Limpeza" em `produtos`, `itens` e soma o orçamento.
Conferência só leitura: `supabase/conferencias/041_conferir_producao.sql`. O site funciona antes e depois dela.

## Reclassificar itens, subcategoria e estabelecimento (Lote de 10/11/2026)
**Diagnóstico.** A categoria do item vinha do PRODUTO (view `compras`: `coalesce(p.categoria, i.categoria)`): dava para corrigir em Mercado → Produtos (vale para todas as compras do produto), mas não um item só, e não existia subcategoria. Nada derivava a categoria do mercado; o "Mercearia" de itens novos vinha do cadastro automático de produto da proposta 040 (categoria padrão 'Mercearia'), por isso o item de outro tipo (ex.: uma cortina solar) caía ali. Estabelecimento (`mercados`) e categoria são colunas independentes e continuam assim: o formulário recusa categoria igual a nome de estabelecimento.
**Edição.** Mercado → Notas → abrir a nota → **Editar** em cada item: categoria (oficiais + Automotivo, Tecnologia, Saúde, Vestuário + as já usadas + "Outra" personalizada), subcategoria (sugestões por categoria, texto livre) e **onde vale**: "só este item" ou "todas as compras deste produto". Muda só a classificação; valor, quantidade, data, nota fiscal e mercado não são tocados, e a nota não é apagada nem recriada. Os totais e gráficos recarregam a partir da view.
**Ordem da categoria efetiva:** do item → do produto → a gravada na compra. Subcategoria: do item → do produto. Funções puras: `mkCategoriaEfetiva`, `mkSubEfetiva`, `mkOpcoesCategoria`, `mkSubOpcoes`, `mkClasseValida`, `mkResumoClasse`.
**Banco.** Migration `supabase/046_mercado_subcategorias.sql` (**aplicada em produção em 10/11/2026**, conferida: colunas, view security_invoker, anon sem acesso, totais iguais): acrescenta `itens.categoria_item`, `itens.subcategoria`, `produtos.subcategoria` (todas vazias) e recria a view `compras` (coluna `subcategoria` no fim). Não reclassifica nada: todos os totais ficam iguais até você editar. Antes da 046 o site já funcionava: "todas as compras deste produto" grava a categoria; "só este item" e a subcategoria avisam que dependem da 046. Rollback no cabeçalho do SQL. Testes: `tests/mercado_reclassificar.test.mjs` (inclui o SQL num Postgres de verdade).
Não há reclassificação automática nem sugestão por IA; a lista de categorias oficiais (11) não mudou. As categorias de alimentação (Mercearia, Padaria, Açougue…) continuam como categorias próprias, sem um nível "Alimentação" acima delas, para não quebrar Painel, orçamento e Alimentação.

## Farmácia e a correção do fallback (20/11/2026)
**Causa raiz.** Na primeira compra real da Central Fiscal (Raia Drogasil, 19/11/2026, 2 medicamentos, R$ 569,99) os dois produtos saíram como Mercearia por **dois motivos somados**: (1) não existia a categoria Farmácia nem regra de medicamento em `MK_REGRAS`; (2) a entrada automática (`mkCasarProduto`) trocava "sem classificação" por **"Mercearia"** (`cl.categoria||"Mercearia"`), e `nfEntradaPayload` e a migration 059 também usam Mercearia quando falta categoria. O estabelecimento nunca foi critério.
**Regra nova.** `Farmácia` é a 12ª categoria oficial (seletores, orçamento, filtros, comparações e gráficos usam `MK_CATEGORIAS`; no orçamento de Alimentação ela fica **fora**, como já estava previsto em `AL_NAO_COMIDA`). A regra de Farmácia é a primeira de `MK_REGRAS` e reconhece só: princípios ativos e nomes de medicamento (ondansetrona, dipirona, paracetamol, losartana, omeprazol, antibióticos, corticoides, anti-histamínicos, estatinas, insulina, etc.), marcas conhecidas (Tylenol, Dorflex, Novalgina…), **dose** (`500mg`, `mcg`, `UI`, `10 comp`) e formas farmacêuticas sem ambiguidade (comprimido, drágea, colírio, injetável, ampola, supositório, solução oral/oftálmica, pomada). Palavras que existem em outros produtos (gotas, cápsulas, xarope, solução, creme) **não bastam sozinhas**; número ou unidade soltos nunca classificam. Pomada capilar/de calçado é exceção. Higiene (shampoo, sabonete, desodorante, creme dental, protetor solar, enxaguante, fio dental, hidratante, absorvente) continua **Higiene Pessoal**.
**Sem classificação segura:** não recebe categoria arbitrária (ver item 4 acima). Remédio de nome comercial desconhecido cai aqui, para revisão.
**Dados existentes:** nada é reclassificado (nenhuma migration, nenhum `update`); produto já cadastrado e a categoria do item/produto corrigida à mão sempre vencem a regra. A compra da Drogasil já registrada continua como está: corrige-se pela interface (Mercado → Notas → Editar item, ou Produtos), sem duplicar nota nem compra. Limitação: a função `nota_fiscal_confirmar` (059) ainda usa 'Mercearia' quando o site não manda categoria para o produto novo (não acontece no fluxo normal, que sempre manda); corrigi-la exigiria uma migration nova e não foi necessário.
Testes: `tests/mercado_classificacao.test.mjs` (Farmácia, higiene, supermercado, sem regra → revisão, precedência manual, orçamento).

## Áreas de consumo (20/11/2026)
Cada categoria pertence a uma área (Mercado, Automotivo, Farmácia, Bebê/Infantil ou criada pelo dono) e o painel de cada área soma só os itens dela; categorias sem área ficam "não classificadas" para o dono associar. Modelo, regras de contabilização e gestão: `docs/central-areas.md`. A classificação do produto (acima) não mudou.
