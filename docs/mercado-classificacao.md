# Mercado: categorias e classificação de produtos

Código: `nucleo.js` (`MK_CATEGORIAS`, `mkCatOficial`, `mkNome`, `mkChave`, `mkClassificar`, só funções puras) e `mercado.js` (tela "Adicionar nota" e "Produtos").
Testes: `tests/mercado_classificacao.test.mjs`. Sem IA e sem chamada paga.

## Categorias oficiais (11)
Mercearia, Padaria, Açougue/Frios, Hortifruti, Chocolates/Doces, Bebidas, Limpeza, Higiene Pessoal, Peixaria, Casa/Utilidades, Bebê/Infantil.
"Limpeza/Descartáveis" não existe mais: vira **Limpeza** (guardanapo, toalha de papel, esponja, hastes flexíveis e descartáveis entram nela).
`mkCatOficial` faz a unificação na leitura (linhas do Mercado, produtos, orçamento do Painel, despesas), então telas, gráficos e filtros nunca veem as duas.
Categoria de fora da lista (ex.: "Outros" da planilha antiga) é mantida, não apagada.

## Ordem de decisão (`mkClassificar`)
1. Produto já cadastrado (mesma chave de nome, ou descrição já usada numa nota anterior): reaproveita `produtos.categoria`.
2. A correção manual em Mercado → Produtos grava `produtos.categoria`; por isso ela é a referência e a classificação automática **nunca** atualiza produto existente.
3. Produto novo: regras por tipo do produto (`MK_REGRAS`, em ordem, com exceções, ex.: molho de tomate ≠ tomate, pão de queijo ≠ queijo, água sanitária ≠ água).
4. Ambíguo ou sem regra: `categoria: null`, `revisar: true`. Na tela o item fica em "Escolher categoria…" e a nota não salva até o dono escolher. Não há mais "Mercearia" por padrão.
Uma correção só vale para o mesmo produto (chave igual). Outro sabor ou tamanho não herda a categoria.

## Nome normalizado
`mkNome("BISC WAFER TUBIN CHOCO")` → "Biscoito Wafer Tubin Choco". Expande abreviaturas conhecidas, tira código no começo e "kg" da balança, mantém marca e sabor.
Abreviatura com dúvida (ex.: "SAB") fica como veio. A descrição original do cupom continua em `itens.descricao` (auditoria). `mkChave` compara produtos ignorando caixa, acento e abreviatura, sem misturar tamanhos.

## Banco
Proposta `supabase/propostas/041_mercado_categorias_oficiais.sql` (**não aplicada**): só troca "Limpeza/Descartáveis" por "Limpeza" em `produtos`, `itens` e soma o orçamento.
Conferência só leitura: `supabase/conferencias/041_conferir_producao.sql`. O site funciona antes e depois dela.
