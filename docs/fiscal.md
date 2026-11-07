# Central de Notas Fiscais

Lote 2: o núcleo, em `nucleo.js` (`NUCLEO.nf*`), testado em `tests/fiscal.test.mjs`. O banco (032) foi aplicado em produção em 06/11/2026 e conferido (ver docs/compras.md, "Aplicação em produção"). Lote A (07/11/2026): a tela `#fiscal` lê XML. Lote B: a gravação segura (migration 034, **aplicada em produção em 07/11/2026** e publicada no site na versão `2026-11-07.1`; seção abaixo). Sem OCR (fotos e PDF ainda não são lidos).
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

## Banco (032: aplicado em produção em 06/11/2026)

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

## Lote 4 · Lote A: tela de conferência por XML (07/11/2026) — só leitura (superado pelo Lote B abaixo: a tela agora também salva)

`#fiscal` ("Central Fiscal", `js/fiscal.js`, testes em `tests/fiscal_tela.test.mjs`). Acessível ao dono e à Fernanda (`fiscal` entrou em `DA_CASA` e no menu da casa, por decisão do dono).
- Escolhe um ou vários XML (até 20, 2 MB cada); a leitura é no próprio aparelho com `NUCLEO.nfLerXML` + `NUCLEO.nfNormalizar`. **Nada é gravado, enviado, lançado nas despesas nem vai ao Storage.**
- Mostra: tipo, número, série, data, situação, emitente (nome, CNPJ, UF), chave em grupos de 4 e se ela confere, itens, totais, pagamento (forma, bandeira, final) e avisos. Chave repetida no mesmo lote vira aviso.
- Foto e PDF: mensagem clara "sem OCR nesta etapa"; o arquivo nem é lido.
- Privacidade: CPF, nome e endereço do consumidor (`dest`, `infCpl`) não são lidos nem mostrados.
- Validado com 2 XML reais da família (NF-e modelo 55 com tributos da reforma IBS/CBS, 1 e 2 itens, cStat 100): chave, valores, itens e pagamento corretos, sem avisos. Os arquivos reais NÃO ficam no repositório; o teste usa um XML fictício no mesmo formato.
- Observado nas 4 fotos reais (NFC-e, só para a próxima etapa, sem OCR feito): 2 em papel térmico com protocolo; 2 **emitidas em contingência** (uma "pendente de autorização", com a chave impressa borrada e cortada), o que `nfSituacao` já trata como contingência e nunca como autorizada. Uma tem desconto por item e itens pesados (kg, 3 casas), outra combustível (litros) com desconto, outra com CPF e nome do consumidor impressos. Na etapa de OCR a chave lida da foto terá de passar em `nfValidarChave` antes de qualquer confiança.
- Próximas etapas (aguardam aprovação do dono): proposta da migration 034 (Storage privado, originais como estão, sem exigir cobertura de CPF), gravação no Supabase, OCR das fotos.

## Lote B · gravação segura, conferência e proteção dos originais (migration 034 — APLICADA em produção em 07/11/2026)

A 034 foi aplicada pelo dono no SQL Editor em 07/11/2026 e conferida por consulta somente leitura (15 funções, 2 colunas, 5 gatilhos, 4 constraints, as 5 políticas de `storage.objects`, nenhuma função executável por `anon`, as 2 RPCs só para `authenticated`). **O site que usa a gravação já está no `origin/main`** (commit `33a49c6`, com `VERSAO` em `sw.js` e `MOD_VERSAO` em `js/app.js` iguais a `2026-11-07.1`; neste projeto o push é a publicação, conforme o CLAUDE.md; conferido em 07/11/2026 só pelo Git local, sem consultar o site no ar). A gravação **ainda não foi exercitada com um XML real no Supabase** (ver "Pendências"). A 034 só soma (colunas, funções, gatilhos, constraints, políticas); não cria tabela, não toca em Compras, Mercado, Eddie, Olivia, IA nem Garmin, e não altera migrations anteriores.

### Fluxo (tela `#fiscal`, `js/fiscal.js`)
1. A pessoa escolhe o XML; a leitura e a conferência visual são no aparelho (Lote A). Só ao clicar em **Salvar na Central Fiscal** algo sai do aparelho.
2. O site gera o id da nota (`crypto.randomUUID`, fixo por cartão: tentar de novo usa a mesma id), calcula o **SHA-256** do arquivo e monta o payload com `NUCLEO.nfParaGravar` (sem campo de CPF; chave só se confere; CNPJ só se válido; `unitario` com 4 casas).
3. Se a chave já está gravada, **nada é enviado** (evita arquivo solto). Senão, o XML original (inteiro, **inclusive com CPF**) sobe para o cofre privado `familia` em `<dono>/notas-fiscais/<nota>/<sha256>.xml`, com `upsert:false` e **sempre como `text/xml`** (o `Blob` e o `contentType` levam esse tipo, qualquer que seja o tipo que o navegador deu ao arquivo).
4. A função `nota_fiscal_salvar` grava nota, itens, pagamentos e a referência do original **numa transação só**. Só o erro `40001` (falha de serialização) é repetido, no máximo 3 vezes, com a mesma id (`NUCLEO.nfRetentar`); validação, permissão e duplicidade nunca repetem.
5. Se algo falha, o site apaga **só** o que essa tentativa enviou (o banco recusa apagar arquivo registrado). Se o banco diz `duplicada`, apaga o arquivo recém-enviado (`docs_para_apagar`, que nunca contém arquivo registrado). `ja_existia` (toque duplo) não apaga nada.
6. "Conferi os dados" (opcional na gravação): a conferência registra **quem** (`auth.uid()`) e **quando** (`now()`), ambos definidos pelo banco; o site nunca os envia. Nota sem chave válida é gravada **pendente** e só é conferida depois, em ação separada (`nota_fiscal_conferir`).

### Regras no banco (034)
- `conferida_por` / `conferida_em` em `notas_fiscais` (sem FK de propósito: a autoria histórica sobrevive à restauração em outra conta e à saída do usuário). `requer_conferencia` e as constraints da 032 **não mudam**. A conferência **não se desfaz**: trocar ou limpar é ignorado. A conferência comum exige **itens e documento**; inserir nota já conferida é recusado. Única exceção: a restauração de backup, feita pelo **dono**, traz o par original (completo e no passado) — por isso o dono pode, por escrita direta, informar autoria histórica (limite conhecido).
- **Congelamento:** nota conferida não muda nenhum campo fiscal; itens e documentos não entram, não mudam e não saem. Única exceção: situação **autorizada → cancelada**, sozinha (nenhum outro campo junto); o gatilho da 032 continua invalidando os vínculos. Cancelada nunca volta. `situacao_evidencia` e `protocolo` ficam os da autorização. Excluir a nota continua permitido (a cascata não é bloqueada: os gatilhos dos filhos deixam passar quando o pai já não existe).
- **Registro do documento original imutável** (nota pendente ou conferida): só some junto com a nota. Para refazer uma nota: excluir a nota e gravar de novo.
- **Sessões de administração** (`auth.uid()` nulo: SQL Editor, `service_role`) não passam pelo congelamento — necessário para excluir uma conta com tudo em cascata (conferido em produção: `auth.uid()` lê `request.jwt.claim.sub` / `request.jwt.claims` e é nulo sem JWT).
- **CPF:** nenhum campo de texto guarda CPF (com ou sem pontuação, só se os dígitos verificadores fecham): CHECKs nas três tabelas, valem até para escrita direta. A regra é a mesma no SQL (`nf_tem_cpf`) e no JavaScript (`NUCLEO.nfTemCpf`), com a mesma bateria de 25 casos (`tests/fixtures/fiscal/cpf_casos.json`), também rodada em produção, só leitura, antes da migration.
- **Limites** iguais à capacidade das colunas (`numeric(12,2)` e `numeric(14,4)`), 1 a 990 itens, no máximo 10 pagamentos, XML de 1 byte a 2 MB, exatamente 1 documento (só XML nesta etapa).
- **Duplicidade e concorrência:** travas por chave, arquivo (SHA-256) e id, em ordem crescente (sem deadlock); os índices únicos seguem como última barreira; `unique_violation` desfaz a tentativa (savepoint) e devolve a nota que já existia; sem vencedor visível, o erro é re-lançado.
- **Aviso, não bloqueio:** a soma dos itens diferente do valor dos produtos.

### Storage (cofre `familia`)
- Caminho **exato** `<dono>/notas-fiscais/<nota>/<sha256>.xml` (o nome original do arquivo só vai para a coluna `nome`).
- A RPC exige o `metadata` do Storage: `size` (número inteiro) e `mimetype` têm de existir e **bater** com o declarado (`tamanho`, `mime`; o que vem depois de `;` no tipo é ignorado). Ausente ou divergente é **recusado**, nunca passa em silêncio. Conferido em produção (só leitura): 125 de 125 objetos têm `size` numérico e `mimetype`.
- Duas políticas **restritivas** (somam-se às existentes "familia da casa", "backups do dono" e "mfa cofres", conferidas em produção), **só para arquivo registrado em `notas_fiscais_docs`** (nota pendente ou conferida): ele **não se substitui nem se move** (UPDATE negado) e **não se apaga direto** (DELETE negado). Arquivo **ainda não registrado** é livre: o envio, a finalização do envio (se o Storage a fizer com um UPDATE no papel de quem enviou) e a limpeza de um envio que falhou funcionam. Para remover um arquivo registrado: excluir a nota (a cascata leva os registros) e só então o arquivo. Fora de `notas-fiscais` (Compras, Eddie, Olivia) nada muda. As duas políticas foram exercitadas no motor do Postgres (PGlite) com as políticas reais 004 e 022; o comportamento do Storage de verdade só se prova no Supabase.
- Leitura do objeto pela RPC: a linha **atual** do nome (a não arquivada, depois a mais recente); **marcador de exclusão** e objeto **arquivado** contam como "não está no cofre". Isso é lido por `to_jsonb(o)->>'coluna'`, sem depender de as colunas de versionamento existirem. Conferido em produção (só leitura): o bucket `familia` está com `versioning_status = DISABLED`, 0 objetos versionados, 0 marcadores, 0 arquivados e 0 nomes repetidos; o esquema garante uma linha atual por nome (`idx_objects_current_version`, `idx_objects_null_version`).

### Restauração de backup (Segurança → Restaurar)
- As notas conferidas voltam **em fases**: a nota entra pendente, depois os itens e os documentos, e por último a conferência original (quem e quando) é reaplicada. Assim itens e documentos entram antes de a nota congelar e a **autoria histórica sobrevive**.
- Linha local já conferida (e os filhos dela) **não muda**: é contada como "congelada" na prévia, sem erro (vale também para "substituir" por um backup mais antigo). O registro de documento nunca é "trocado".
- **Antes de gravar**, cada documento fiscal novo é conferido: tipo permitido, arquivo presente no pacote `.zip`, **tamanho** e **SHA-256** iguais ao registro (o site calcula o SHA dos anexos fiscais do pacote). Documento ausente ou divergente fica **inválido, com o motivo**; a nota é **preservada** (entra pendente, sem a conferência), mas os **itens dela não são restaurados**. Backup só JSON: na mesma conta o documento passa; em outra conta exige o pacote.
- Em outra conta o `path` do documento é recalculado para a pasta da conta nova (`<conta>/notas-fiscais/<nota>/<arquivo>`) e o arquivo do pacote é enviado a esse caminho, com o `contentType` do registro. Anexo fiscal que não está no mapa `renomear` é **ignorado e contado**, sem interromper os demais anexos. **Compras e os demais anexos seguem exatamente como antes** (mesma regra de caminho, `upsert:false`, sem tipo).

### Limites conhecidos
1. O banco **não recalcula** o SHA-256 (recebe o do navegador): serve para detectar duplicidade; não prova a integridade nem que os dados gravados batem com o XML. Quem confere é a pessoa.
2. O dono pode informar autoria histórica por escrita direta (é o caminho da restauração).
3. Excluir uma nota (inclusive conferida) é permitido e libera o arquivo.
4. Sessões de administração passam pelo congelamento.
5. O formato do `mimetype` que o Storage grava para um XML só se vê no primeiro envio real; se divergir do declarado, a RPC recusa (falha fechada).

### Pendências antes de usar em produção
- ~~Aplicar a 034~~ (feito em 07/11/2026). Falta rodar, só leitura, a consulta B da bateria de CPF contra as funções reais (`nf_tem_cpf` e `nf_cpf_dv_ok`).
- **Se alguém ligar o versionamento do bucket `familia`** (hoje DISABLED), as duas políticas deixam de bastar (um novo envio ou uma exclusão passam a **inserir** linhas de versão ou de marcador em vez de atualizar ou apagar): reanalisar a 034 antes de ligar.
- Só no Supabase real (não há como provar no PGlite): as duas políticas do Storage em ação (upload normal, `upsert:true` negado, mover e apagar arquivo registrado negados, apagar arquivo sem registro permitido), upload do XML com o tipo certo, `mimetype` do XML, aal2 real, exclusão de conta pelo GoTrue/painel (em projeto de teste), concorrência real e as RPCs pela API.
- Teste da Fernanda na tela.
