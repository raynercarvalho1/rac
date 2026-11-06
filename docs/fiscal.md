# Central de Notas Fiscais (núcleo fiscal)

Lote 2: só o núcleo, em `nucleo.js` (`NUCLEO.nf*`), testado em `tests/fiscal.test.mjs`. **Sem tela, sem Storage, sem OCR; o banco (032) está preparado no repositório e NÃO foi executado.**
A nota fiscal é uma entidade **independente** de Compras e **nunca gera despesa**: o vínculo com Compras online, Mercado, Alimentação ou
Veículos/Abastecimento serve só para conferência e documentação (`gera_despesa: false`).

## Modelos e formatos

NF-e (55) e NFC-e (65). Formatos previstos: XML (lido de verdade por `nfLerXML`), PDF, DANFE e imagem (entram como dados já extraídos em
`nfNormalizar`; todo formato diferente de XML, ou chave inválida, marca `requer_conferencia`).

## Chave de acesso (`nfValidarChave`)

44 dígitos **não bastam**. Confere UF, mês (AAMM), CNPJ do emitente (dígitos verificadores), modelo (55 ou 65), série, número, tipo de
emissão e o dígito verificador (módulo 11). Com contexto, cruza com o documento: CNPJ, modelo, série, número, mês de emissão e UF.
Cada erro tem um `codigo` (`dv`, `cnpj`, `cnpj_divergente`, `modelo`, `serie_divergente`, `mes_divergente`…).

## Situação (`nfSituacao`) — só com evidência

| Situação | Evidência exigida |
|---|---|
| Autorizada | protocolo de 15 dígitos **e** cStat 100/150 |
| Contingência | tipo de emissão 2/4/5/6/7/9 sem protocolo de autorização (nunca vira "autorizada" sozinha) |
| Rejeitada | cStat 2xx–9xx (inclui denegada: cStat 110/301–303, `denegada: true`) |
| Cancelada | evento 110111 homologado ou cStat 101/151/155; vence a autorização |
| Pendente | todo o resto |

## Valores, itens e pagamento (`nfNormalizar`)

- Valores: produtos, descontos, frete, outras despesas, impostos (`vTotTrib`), **total da nota** e **valor a pagar** (soma dos pagamentos
  menos o troco, quando houver). Total e valor a pagar não são presumidos iguais: a diferença fica em `diferenca_pagamento` com aviso.
  Se produtos − descontos + frete + outras não bate com o total, avisa (IPI e ST podem explicar).
- Itens: descrição, código, quantidade com casas decimais, unidade (`un`, `pc`, `cx`, `pct`, `par`, `kg`, `g`, `l`, `ml`, `m`; outra vira
  "não reconhecida" com aviso) e quantidade-base (g→kg, ml→l) para comparar preço.
- Pagamento: forma, valor, **bandeira e últimos 4 dígitos** quando houver. Número completo, CVV e código de autorização nunca são guardados.

## Privacidade

Não há campo de CPF nem de consumidor. O leitor de XML não lê `dest`, transporte nem informações adicionais; `nfNormalizar` copia campo a
campo (o que não está na lista descarta). `nfTemDadoPessoal` audita o resultado (chaves de campo e padrão de CPF).

## Vínculos (`nfVincular`)

Recusa nota cancelada ou rejeitada e vínculo repetido; avisa para contingência/pendente, chave inválida, nota já ligada a outro registro do
módulo e valor do registro diferente do da nota.

## Ainda depende de

OCR/leitura de PDF, DANFE e foto; XML real de uma nota da família para validar tags (os testes usam XML fictício); tabelas `notas_fiscais`
e de vínculos com RLS e backup (`SEG_TABELAS`); cofre para os originais; tela da Central. Orçamento de IA fiscal fica de fora.

## Banco (032: preparado, não executado)

`supabase/032_central_fiscal.sql`: `notas_fiscais`, `notas_fiscais_itens`, `notas_fiscais_docs`, `notas_fiscais_vinculos`, no mesmo conceito da casa
(Rayner e Fernanda) mais a trava "mfa" (criada na própria 032 e reafirmada pela 033; o 022 não muda). Compartilhar a Central Fiscal não dá acesso à IA paga (nada aqui toca `ia_*` nem `rac-ia`).

- A chave só entra se passa no dígito verificador e bate com modelo, CNPJ, série, número e mês (CHECK, com `nf_chave_dv_ok`/`nf_cnpj_ok`); nota sem
  chave válida fica `requer_conferencia`. Autorizada exige protocolo; contingência não tem protocolo e exige tipo de emissão de contingência;
  denegada só em rejeitada; cancelada é definitiva.
- Vínculo (`compras`, `mercado`, `alimentacao`, `veiculos`): único por nota + módulo + registro, o registro precisa existir, `tipo = 'conferencia'` e
  `gera_despesa = false` por CHECK. Nota cancelada/rejeitada não vincula, e se a nota passa a ser cancelada/rejeitada os vínculos viram `valido = false`.
- Privacidade: sem coluna de CPF/consumidor; pagamentos só com forma, valor, bandeira e 4 dígitos (o banco recusa sequências longas); originais no cofre
  `familia`, em `<dono>/notas-fiscais/<nota>/`, com o caminho conferido pela política. Sem gravação atômica própria ainda (`nota_fiscal_salvar` fica para
  o lote da tela, no mesmo molde de `compras_gravar`).
- Backup do site: as seis tabelas novas entram em `NUCLEO.SEG_TABELAS` e os originais das notas vão em `anexos/`. O backup semanal do servidor
  (função `garmin`, intocável) não inclui nenhuma tabela de compras nem fiscal; propor a inclusão exige mexer nela, então fica como proposta separada.
