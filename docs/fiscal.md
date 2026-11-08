# Central de Notas Fiscais

Lote 2: o núcleo, em `nucleo.js` (`NUCLEO.nf*`), testado em `tests/fiscal.test.mjs`. O banco (032) foi aplicado em produção em 06/11/2026 e conferido (ver docs/compras.md, "Aplicação em produção"). Lote A (07/11/2026): a tela `#fiscal` lê XML. Lote B: a gravação segura (migration 034, **aplicada em produção em 07/11/2026** e publicada no site na versão `2026-11-07.1`; seção abaixo). Fotos e PDF: ver o Lote 1.4 (lidos pela IA, só o dono, sem gravação ainda). Lote 1.2 (08/11/2026, publicado): conferência aritmética e duplicidade no núcleo. Lote 1.3 (08/11/2026): a tela `#fiscal` e a gravação passam a seguir essa validação (seção "Lote 1.3"). Lote 1.4 (08/11/2026): leitura de foto e PDF pela IA (seção "Lote 1.4"), código pronto, IA real ainda não ligada.
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

## Lote 1.2 · conferência aritmética e prevenção de duplicidade (08/11/2026) — publicado em `41e4981`

Três regras puras em `nucleo.js` (`NUCLEO.nfValidarSoma`, `nfVeredito`, `nfDuplicidade`), testadas em `tests/fiscal.test.mjs`. **Nada é gravado, enviado ou
cobrado**, e nenhuma tela usa ainda: a ligação à tela e à gravação é o próximo lote. Tudo em centavos inteiros; tolerância de arredondamento de **1 centavo**.

### `nfValidarSoma(nota)` — a conta
Recebe a nota de `nfNormalizar`. Confere (1) cada item: quantidade × unitário = total (folga de 1 centavo mais 0,005 por unidade de quantidade, por causa do
unitário de 4 casas); o desconto do item não passa do item; (2) soma dos itens × total de produtos declarado; (3) soma dos descontos dos itens × desconto
total; (4) **soma dos itens − descontos + frete + outras + seguro + ST + FCP ST + IPI + II + IPI devolvido − ICMS desonerado = total fiscal** (`vNF`).
Devolve `diferenca` em reais (**calculado − fiscal**: positivo = os itens somam mais que a nota), a conta item a item, `lacunas` (falta dado para
conferir) e `divergencias` (a conta não fecha). Com lacuna a soma não é comparada (não dá para somar item que não foi lido).
`nfNormalizar` passou a manter o unitário com **4 casas** (antes arredondava em 2: combustível a R$ 5,899 virava 5,90) e a levar os componentes acima;
`nfLerXML` os lê de `ICMSTot` (`vSeg`, `vST`, `vFCPST`, `vIPI`, `vII`, `vIPIDevol`, `vICMSDeson`). `nfParaGravar` não usa esses campos novos (nada muda na RPC).

### `nfVeredito(nota, {confianca, minimo})` — conta e situação fiscal são independentes
Duas perguntas separadas: **a conta fecha?** (`classe`) e **a nota vale fiscalmente?** (`fiscal`). Valores certos não tornam a nota autorizada, e nota autorizada pode ter a conta errada.

| `classe` (só a conta) | Quando |
|---|---|
| `consistente` | a conta fecha (até 1 centavo; 1 centavo vira aviso de arredondamento) |
| `divergente` | a conta não fecha ou o desconto passa do item |
| `baixa_confianca` | falta quantidade/total de item, sem itens, sem total, chave ausente/inválida, ou foto/PDF sem confiança informada ou abaixo de 0,9 |

Baixa confiança vem antes de divergência (leitura incerta explica a conta errada). XML não depende de `confianca`.

| `fiscal.situacao` | Efeito (decisão do dono, 08/11/2026) |
|---|---|
| `autorizada` | definitiva. Com conta consistente: `acao: "gravar"`, `gravar_validada`, `pode_alimentar_financeiro` |
| `contingencia`, `pendente` | **não descarta nem bloqueia**: com conta consistente, `acao: "gravar_pendente_fiscal"` (`gravar_pendente`), com aviso. **Não** é validada nem alimenta o Financeiro até a autorização |
| `cancelada`, `rejeitada` | **bloqueada** (`acao: "bloquear"`, `bloqueios[]` com o motivo e a orientação de nova leitura/outra tratativa). Nunca validada, nunca Financeiro, mesmo com a conta certa. `auditoria`: documento preservado e tentativa a registrar |

`gravar_validada = pode_alimentar_financeiro = conta consistente E nota autorizada`. Valor a pagar diferente do total só avisa. `diferenca_texto` vem pronto ("R$ 6,00 a mais que o total fiscal.").
Uma compra real com nota cancelada/rejeitada pode ser registrada por outra via, mas nunca como compra fiscal validada.

### `nfDuplicidade(nota, {notas, compras, mercado, despesas}, {sha256, ignorar_id})` — nunca duas despesas
Linhas como o banco devolve: notas (`id, chave, modelo, serie, numero, emitente_cnpj, data_emissao, valor_total, sha256, situacao`), compras online (`id, chave_nfe, data,
total_pago, loja, vendedor`), Mercado (`id, chave, data, total, mercado` ou `mercados.nome`), despesas (`id, data, valor, descricao`).
- **Confirmada** (mesma nota): mesma chave (com ou sem espaços), mesmo SHA-256, ou emitente + modelo + série + número; compra/Mercado que já cita a chave.
- **Possível**: mesma data e valor a 1 centavo (contra total fiscal ou valor a pagar) e mesmo estabelecimento (conjunto de palavras sem LTDA/SA/ME). Só pede confirmação, nunca bloqueia. Sem nome do emitente não se adivinha.
- `acao`: `atualizar_situacao` (mesma nota guardada como pendente/contingência e agora com situação definida, ou autorizada que foi cancelada; devolve `{id, de, para}` e o histórico fica), `ja_gravada`, `vincular` (compra confirmada), `confirmar_vinculo` (só possível) ou `gravar_nova`. Transições: pendente/contingência → autorizada, cancelada ou rejeitada; autorizada → cancelada; cancelada e rejeitada são definitivas.
- `pode_criar_despesa` é **sempre falso**: a nota continua sem criar despesa; o vínculo com compra existente é decisão do lote de integração.

### Revisão técnica do Lote 1.2 (08/11/2026)
- **ST, IPI, FCP ST, seguro, II, IPI devolvido, ICMS desonerado**: seguem a fórmula do `vNF` da NF-e; nota legítima com eles fecha (teste com NF-e 55). Sem o componente no total a diferença é exatamente o que falta.
- **Desconto uma vez só**: `total` do item é o valor bruto (`vProd`); o desconto sai uma vez (do cabeçalho, ou da soma dos itens se o cabeçalho não o traz). Item que já vem líquido não fecha em quantidade × unitário e é apontado.
- **Quantidade × unitário**: folga de 1 centavo (arredondar ou truncar) mais 0,005 por unidade de quantidade (o unitário tem 4 casas; é a folga matemática de arredondar em 4 casas, e fica maior em quantidades grandes).
- **Item incompleto** (sem quantidade ou total) é `baixa_confianca` e a soma não é comparada (sem inventar divergência). Item sem unitário é somado, com aviso de que a conta do item não foi conferida.
- **Limites conhecidos**: chave ilegível numa foto (caso real da contingência) cai em `baixa_confianca` — não dá para identificar nem evitar duplicidade sem ela; a conta de uma foto depende da leitura do item estar bruta (sem desconto embutido); valores de entrada negativos já chegam sem sinal (`coNum`).
- **Não feito (depende de lotes futuros)**: histórico de mudanças de status em tabela própria (hoje a atualização de situação é regra do banco 034, sem trilha de versões); registro persistente da tentativa bloqueada (o veredito só indica `registrar_tentativa`); ligação à tela e ao Financeiro, que **precisa exigir** `fiscal.situacao = autorizada` e `classe = consistente`.

## Lote 1.3 · validação integrada à tela `#fiscal` e à gravação (08/11/2026)

Sem migration, sem SQL e sem mudança no Supabase: tudo é JavaScript do site e do núcleo. Versão `2026-11-08.1` (`sw.js` e `js/app.js` juntos).

### `NUCLEO.nfDecisaoGravacao(nota, dup)` — uma decisão só para a tela e para a gravação
Junta `nfVeredito` e `nfDuplicidade` e devolve `modo`: `validada`, `pendente_fiscal` ou `bloqueada` (+ `bloqueios[]`, `avisos[]`, `conferir_permitido`, `gera_despesa: false`).
`nfParaGravar` chama a mesma função, então qualquer chamador (a tela, um teste, um lote futuro) recebe a mesma recusa: **o núcleo não depende de a tela esconder o botão**.

| Caso | Resultado na gravação |
|---|---|
| Autorizada e conta consistente | `validada`: grava; a pessoa pode marcar "Conferi" (fluxo de antes) |
| Pendente ou contingência, conta consistente | `pendente_fiscal`: grava com `requer_conferencia = true`, **nunca conferida** (`p_conferir` sempre falso), aviso "pendente de validação fiscal". Não vale como validada nem alimenta o Financeiro. Botão "Salvar como pendente fiscal" |
| Conta divergente | `bloqueada`: nada é enviado nem gravado; a tela mostra a diferença em reais e o motivo |
| Baixa confiança (item sem quantidade/total, sem itens, sem total, **chave ausente ou inválida**) | `bloqueada`, com o motivo |
| Cancelada ou rejeitada | `bloqueada`, "não vale como compra fiscal validada e não alimenta o Financeiro" |
| Mesma nota já gravada (chave, arquivo ou emitente + modelo + série + número) | `bloqueada` ("não é gravada de novo"), nada é enviado |
| Possível duplicidade (nota parecida, Mercado, pedido) ou compra online que já cita a chave | grava e **avisa**; a nota nunca cria despesa |

### Tela (`js/fiscal.js`)
- Cartão da nota: linha **Situação fiscal** (com "pendente de validação fiscal" ou "não vale como compra") e bloco **Validação da nota** em separado: conta dos itens (Consistente / Divergente / Baixa confiança), total calculado pelos itens, total fiscal, diferença em reais, motivos e a linha "Gravação" (validada, só pendente fiscal ou bloqueada). Classe CSS `fxbloq` para o que bloqueia.
- Bloqueada: o botão não existe; aparece o motivo, "refaça a leitura com outro arquivo ou trate a compra por outra via" e "nada foi enviado nem gravado". Pendente fiscal: a caixa "Conferi" fica desligada.
- Ao clicar em salvar, **antes de enviar qualquer arquivo**, `fxExistentes` lê (só leitura) `notas_fiscais` (por chave e por CNPJ do emitente), `notas_fiscais_docs` (SHA-256 do arquivo), `compras_online` (por chave e por data), `notas` do Mercado (por data) e `pedidos` (por data) e entrega ao `nfDuplicidade`. As duas primeiras são obrigatórias (se falharem, nada é enviado); as demais são melhor esforço (avisam "Não consegui conferir duplicidade com …" e vale a conferência do banco).
- Mensagem de sucesso só quando `estado = gravada`. Estados: `gravada`, `ja_existia`, `duplicada` (inclui o bloqueio por duplicidade e a atualização de situação reconhecida), `bloqueada`, `invalido`, `erro`.
- Segue valendo: o banco (034) confere de novo chave, arquivo e id, e CPF; a tela nunca cria despesa; só as funções `nota_fiscal_salvar` e `nota_fiscal_conferir` escrevem.

### Decisões e limites deste lote
- **Cancelada, rejeitada, divergente e baixa confiança não são gravadas** (nem como pendente). O documento original continua no aparelho e nada é descartado; o **registro persistente da tentativa** (auditoria) e a **trilha de status** exigem tabela nova, ou seja migration: ficam para um lote com autorização de SQL.
- **Mudança de comportamento:** nota com chave inválida/ausente deixou de ser gravada "pendente" (era o caminho do Lote B); agora é baixa confiança e bloqueia. A leitura de foto/PDF com OCR (lote futuro) voltará a tratar chave ilegível.
- **Atualização de situação** (contingência/pendente → autorizada, autorizada → cancelada) é **reconhecida e explicada**, mas ainda não é gravada pela tela (não há função de banco para isso; criar uma é migration). Hoje o aviso diz isso e nada é enviado.
- A duplicidade com despesas olha `pedidos` (Alimentação) e `notas` (Mercado) e `compras_online`; gastos de `registros` (veículos, Eddie, Olivia) não são consultados.
- Vínculo da nota com a compra existente continua sendo etapa futura (`nfVincular` existe); este lote só avisa.
- A regra de Financeiro está pronta no veredito (`pode_alimentar_financeiro` = consistente + autorizada) mas **nenhum código cria despesa a partir de nota**.
- Testes: `tests/fiscal_validacao.test.mjs` (16: autorizada, pendente, contingência, divergente, baixa confiança, cancelada, rejeitada, duplicidade confirmada, possível, atualização de situação, leitura que falha, cartão e botão com DOM de teste, nada de despesa) e ajustes em `tests/fiscal_tela.test.mjs`. A tela real não foi aberta com login nesta máquina; a verificação visual no site publicado fica com o dono (tela `#fiscal`, no celular e no computador).

## Lote 1.4 · nota em foto ou PDF lida pela IA (08/11/2026) — código pronto, IA real AINDA NÃO ligada

**Estado honesto:** a leitura por IA está implementada e testada com a Anthropic **simulada**. Nenhuma chamada real à IA foi feita neste lote e **não foi demonstrado, com uma foto ou PDF de verdade, que o Claude lê a nota**. Para isso faltam três passos do dono (abaixo). Até lá o botão do dono responde "ainda não está liberada no servidor", sem custo e sem gravar nada.

### O que foi construído
| Peça | Arquivo | O que faz |
|---|---|---|
| Ação `fiscal.nota` | `supabase/functions/rac-ia/acoes.ts` | Sonnet 5.5, **só o dono**, **só REAL** (sem demonstração: em DEMO a função responde `sem_real`), até 4 imagens + 6.000 caracteres de texto, 12.000 tokens de saída. Devolve JSON validado: emitente, chave, número/série, data, modelo, protocolo, situação (só se impressa), totais, frete/seguro/ST/IPI/II…, pagamentos, itens (unitário **sem arredondar**), `confianca` (0 a 1), `incertos` e `incerto` por item. A validação recusa número fora da faixa, remove CPF de qualquer texto, descarta chave sem 44 dígitos |
| Migration proposta | `supabase/036_ia_fiscal.sql` (**NÃO aplicada**) | Só acrescenta `'fiscal.nota'` à lista que o banco aceita em `acoes_reais` e proíbe a casa. **Não liga** a ação |
| Núcleo | `nucleo.js` | `nfTipoReal` (conteúdo pelos bytes), `nfArquivoIA`, `nfLoteIA`, `nfPdfAtivo`, `nfMascararCpf`, `nfLerIA` (JSON da IA → formato do leitor de XML), `nfCorrigir`, `nfConfiancaIA`; `nfDecisaoGravacao(nota, dup, {confianca})` |
| Tela | `js/fiscal.js` | Para o dono: escolher foto(s)/PDF ou fotografar, "Ler foto ou PDF com IA", cartão da nota com confiança, campos incertos, validação, duplicidade e **formulário de correção** |

### Como funciona (arquitetura)
1. **Arquivo:** tipo pelo **conteúdo** (JPEG, PNG, WebP, PDF); extensão ou tipo declarado que contradizem o conteúdo → recusado; HEIC, SVG, executável e texto → recusados; imagem até 12 MB, PDF até 10 MB, **um PDF sozinho ou 1 a 4 fotos**; PDF com mais de 4 páginas ou com `/JavaScript`, `/Launch`, arquivo embutido… → recusado (melhor esforço sobre os bytes; o pdf.js só **desenha** a página, com `isEvalSupported:false`, nunca executa).
2. **Preparo no aparelho:** foto reduzida a 1.568 px (JPEG); PDF → texto (com **CPF mascarado**) + imagem de cada página. Nada sai antes do clique.
3. **IA:** só pela porta `racIA("fiscal","fiscal.nota")` → função `rac-ia` (chave nos Secrets, reserva de orçamento, idempotência por clique, sem repetição paga, registro de consumo em `ia_uso`, sem conteúdo nos logs). A tela nunca fala com a Anthropic.
4. **Validação (a IA nunca aprova):** `nfLerIA` → `nfNormalizar` → `nfVeredito`/`nfDecisaoGravacao` com as **mesmas** regras do XML, mais a confiança: **mínimo 0,90** (inclusive); sem confiança informada = baixa confiança; a IA marcar um item ou campo crítico (chave, total, itens, data, CNPJ, descontos, modelo) como incerto **limita a confiança a 0,85**; situação "autorizada" só vale com protocolo legível de 15 dígitos (senão, pendente); pendente/contingência consistente = só pendente fiscal; cancelada/rejeitada, divergente e baixa confiança bloqueiam; duplicidade (`nfDuplicidade`) é conferida na própria leitura (só leitura no banco).
5. **Revisão manual:** o formulário refaz a nota (`nfCorrigir` → `nfNormalizar`) e **roda tudo de novo**. Marcar "Conferi com o documento original" vale como revisão humana (confiança 100%) — decisão minha, para a correção ter efeito; **não relaxa** a conta, a situação fiscal nem a duplicidade. Sem erro nenhum, não há confirmação extra.
6. **Duplo envio:** um documento por vez; o mesmo documento (SHA-256 dos arquivos) na mesma tela não vai de novo; o botão fica travado enquanto lê; uma falha libera nova tentativa.

### Limites e dependências (o que NÃO está pronto)
- **Gravar nota de foto/PDF não existe.** A função do banco `nota_fiscal_salvar` (034) só aceita `formato_origem = 'xml'` e arquivo `text/xml`. Gravar foto/PDF e guardar o original no cofre exige **migration nova** (não autorizada neste lote). A tela diz isso e **não tem botão de salvar** para foto/PDF; nada vai ao Storage; o original fica no aparelho.
- **Ligar a IA real depende do dono, nesta ordem:** (1) rodar `036_ia_fiscal.sql` no SQL Editor; (2) republicar a função `rac-ia`; (3) acrescentar `'fiscal.nota'` em `acoes_reais` (update comentado no fim do 036), com a casa em REAL, e fazer **um teste controlado** com uma nota de teste. Antes disso o site publicado só mostra "ainda não está liberada".
- **OCR local não foi incluído:** o Claude lê a imagem diretamente (visão). Por isso o CPF **não pode ser apagado da imagem** de uma foto ou página de PDF antes do envio; só o texto do PDF é mascarado. A IA é instruída a não copiá-lo e a resposta é filtrada. Evite enquadrar o CPF.
- A confiança é a que o próprio modelo informa (limitada por regras); não é medida independente. O que protege é a conta, a situação, a chave e a duplicidade conferidas pelo RAC.
- Precisão: o unitário passa por `nfDec` (até 4 casas); valores de 5 ou mais casas são arredondados na 5ª.
- Atualização de situação (contingência → autorizada) continua só reconhecida, não gravada (precisa de função de banco).
- Mercado e Financeiro: nada foi integrado, nenhum código cria despesa.
- Gastos de `registros` não entram na checagem de duplicidade.

### Ativação em produção (autorizada em 08/11/2026; NÃO executada pelo Claude, aguardando o dono)
O dono autorizou aplicar o 036, publicar a `rac-ia`, liberar `fiscal.nota` e fazer **um** teste real. A conferência prévia (commit `115fa8b`, `main` = `origin/main`) passou: o SQL é idempotente (`drop constraint if exists` + `add constraint`, dentro de `begin/commit`), só mexe nas duas constraints de `ia_config`, não liga a ação e não duplica liberação (nenhum outro arquivo cita `fiscal.nota`); a ação é só do dono, só REAL e sem demonstração; `ia_uso.modulo` aceita `fiscal` (regex genérica); a chave `ANTHROPIC_API_KEY` só existe em `rac-ia/index.ts` (Secret), nunca no site.
**Por que o Claude não executou:** o `.claude/settings.json` do projeto nega `psql`, `supabase functions deploy`, `supabase db`/`migration`/`secrets` e a API de gerenciamento do Supabase, e a sessão não tem credencial de produção (e não deve pedir senha do banco). Não contornei a trava. Passos para o dono, em ordem:
1. **SQL Editor:** colar e rodar `supabase/036_ia_fiscal.sql`. Conferir (só leitura): `select modo, acoes_reais, acoes_reais_casa from public.ia_config;` (listas como antes) e `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.ia_config'::regclass and conname in ('ia_config_acoes_reais_permitidas','ia_config_fiscal_so_dono');`.
2. **Publicar a função** (como nas versões anteriores): na pasta do projeto, `supabase functions deploy rac-ia --use-api --no-verify-jwt`. Depois, sem login, um POST qualquer em `rac-ia` deve responder `nao_autenticado` (a função está de pé).
3. **Liberar a ação** (só depois dos dois passos acima e com a casa em REAL): o `update` do fim do 036 (`array_append`, só `where modo = 'REAL'` e `not ('fiscal.nota' = any (acoes_reais))`; preserva as outras e não duplica). Conferir de novo a mesma consulta: `fiscal.nota` entra e as demais ficam.
4. **Teste controlado (uma chamada):** logado como dono, em `#fiscal`, escolher **uma nota de teste** (sem dados pessoais) e tocar em "Ler foto ou PDF com IA". Esperado: "REAL · lido pelo Claude…", cartão com confiança, itens e validação; nada gravado. Conferir o consumo em `ia_uso` (módulo `fiscal`) ou no painel Sistema.
**Andamento (08/11/2026):** o dono aplicou o 036, publicou a `rac-ia` e liberou `fiscal.nota` (`acoes_reais` = Newsletter, RAC Hoje e `fiscal.nota`; casa vazia). A **primeira tentativa real falhou** com `provedor_recusou_pedido` (a Anthropic respondeu 4xx; esse erro não gera custo: a reserva é liberada e nada é repetido). Causa provável (hipótese, ainda não confirmada pelo texto do erro, que o log não guardava): o esquema da resposta tinha **33 campos com união (`anyOf` com null)**, muito acima do que a saída estruturada aceita. Correção: o esquema passou a ter **zero uniões** (ausente = texto vazio; números como texto com ponto decimal, convertidos na validação sem perder casas) e o log do servidor agora guarda o **motivo curto** que a API dá para um 4xx (nunca o pedido). Precisa **republicar a `rac-ia`** e repetir o teste.
**Resultado (08/11/2026, relatado pelo dono):** depois de publicar a `rac-ia` com o esquema novo, o teste real em `#fiscal` **deu certo**: uma nota de teste foi lida pelo Claude ("REAL · lido pelo Claude, usou o orçamento de IA da casa") e o dono conferiu que a leitura saiu correta; nada foi gravado. O Claude não viu a tela nem o banco: o consumo da chamada (`ia_uso`, módulo `fiscal`) e o JSON bruto não foram conferidos por ele. A leitura real está **comprovada pelo dono, em uma nota**; a exatidão em muitas notas, fotos ruins e PDFs ainda não foi medida.

### Testes (`tests/fiscal_ia.test.mjs`, 29; sem rede e sem custo)
Foto legível; baixa qualidade (confiança < 0,90); parcialmente cortada; PDF de 1 e de várias páginas (pdf.js simulado, CPF mascarado no texto enviado); mais de 4 páginas; PDF com script; campos ausentes; vários itens com desconto, frete, seguro, ST e IPI; confiança alta e baixa (0,89 / 0,90); divergência de soma; pendente, contingência, cancelada e rejeitada; duplicidade confirmada, possível e atualização de situação; arquivo inválido, disfarçado, HEIC, vazio e acima do limite; erro e indisponibilidade da Anthropic (inclusive `sem_real`, DEMO e ação desconhecida); correção manual e revalidação; proteção contra envio duplicado; servidor ponta a ponta com a Anthropic falsa; 036 só soma e não liga; sem chave no site, sem Storage, sem despesa. O teste da validação do servidor achou e corrigiu um defeito: valores monetários fora da faixa passavam (a checagem vinha antes de serem lidos).

## Lote 1.5 · persistência de nota de foto e PDF (migration 037) — APLICADA em produção em 08/11/2026; usada pelo site a partir do Lote 1.6 (no fim desta seção de lotes)

**Aplicada pelo dono em 08/11/2026** no SQL Editor ("Success. No rows returned") e **conferida por consultas só leitura no banco real**: as 2 tabelas com RLS; 9 funções sem duplicata (4 `SECURITY DEFINER` com `search_path` vazio; `anon` sem execução; quem entrou só executa `nota_fiscal_salvar_doc`, `nota_fiscal_atualizar_situacao` e `nf_path_registrado`); os 4 gatilhos novos habilitados e os da 032/034 intactos; as políticas (`dono` e `mfa` nas tabelas novas, 3 `foto so dono …` em cada tabela de nota, itens e documentos, e 4 no Storage); `authenticated` só com SELECT nas tabelas novas; índices (inclusive o único por `idem`); 0 tentativas e 0 situações; as 4 funções do XML (034) presentes e as notas existentes (2 notas, 3 itens, 2 documentos) inalteradas. O SQL está em `supabase/037_notas_fiscais_foto_pdf.sql` (a conferência, em `supabase/conferencias/037_conferir_producao.sql`) e é provado em PGlite por `tests/banco_foto_pdf.test.mjs`. **O site ainda não usa a 037: nada na tela mudou e não há botão de salvar foto/PDF.** Pendente da conferência real: a lista de constraints (a consulta do bloco 7 não foi colada; as tabelas e os índices existem, e as constraints nascem no mesmo `create table`). Nota: `service_role` ficou com `REFERENCES`, `TRIGGER` e `TRUNCATE` nas tabelas novas (padrão do Supabase; sem insert/update/delete); essa chave nunca vai ao site, e fica como limitação conhecida.

### 1. Diagnóstico do que já existe (conferido nos arquivos, não presumido)
- `notas_fiscais.formato_origem` **já aceita** `xml`, `pdf`, `danfe` e `imagem`; `notas_fiscais_docs.tipo` idem; a constraint `notas_fiscais_nao_xml_confere` já obriga `requer_conferencia = true` para tudo que não é XML. Ou seja, **as tabelas já comportam foto/PDF; o que bloqueia é a RPC `nota_fiscal_salvar` (034)**, que só aceita `formato_origem = 'xml'`, 1 documento e `text/xml`.
- Índice único `(user_id, chave)` em `notas_fiscais` e `(user_id, sha256)` em `notas_fiscais_docs` (duplicidade por chave e por arquivo já garantida pelo banco).
- 034: congelamento da nota conferida (única mudança de situação: autorizada → cancelada), registro do original imutável, políticas restritivas do Storage para arquivo registrado, travas por advisory lock, `unique_violation` tratada com savepoint.
- 032: cancelada é definitiva; nota que vira cancelada/rejeitada invalida os vínculos.
- Acesso: as tabelas fiscais são da **casa** (Rayner e Fernanda) + trava `mfa`. A leitura por IA e esta proposta são **só do dono** (`auth.uid() = dono_da_casa()`).
- Storage: bucket `familia` (privado, 50 MB por arquivo, aceita `image/*` e `application/pdf`); caminho `<dono>/notas-fiscais/<nota>/<sha256>.<ext>`.
- Falta no banco: lugar para o **resultado do processamento** (confiança, campos incertos, conta), o **histórico de tentativas** (inclusive as bloqueadas) e o **histórico de mudanças de situação**.

### 2. Modelo de dados proposto (separando as seis coisas)
| O quê | Onde fica |
|---|---|
| **Documento original** | Storage `familia` + `notas_fiscais_docs` (nota gravada) ou `notas_fiscais_tentativas.docs` (tentativa bloqueada); SHA-256 por arquivo |
| **Resultado da extração** | `notas_fiscais` + `notas_fiscais_itens` (as colunas de sempre); `confianca` e `incertos` na tentativa |
| **Situação fiscal** | `notas_fiscais.situacao` (+ `protocolo`, evidência) e seu histórico em `notas_fiscais_situacoes` |
| **Resultado aritmético** | `notas_fiscais_tentativas.classe` (`consistente`/`divergente`/`baixa_confianca`), `diferenca`, `componentes`, `motivos` — **calculado pelo banco** |
| **Estado de persistência** | `notas_fiscais_tentativas.resultado`: `validada`, `pendente_fiscal`, `bloqueada`, `duplicada` (só `validada` e `pendente_fiscal` têm nota) |
| **Histórico de processamento** | `notas_fiscais_tentativas` (uma linha por leitura; `idem` único por clique; não se altera nem se apaga) |

Nada novo em `notas_fiscais` (nenhuma coluna): "validada" é derivada (nota de foto/PDF gravada + `situacao = 'autorizada'`); "pendente fiscal" = `pendente`/`contingencia`. Assim o XML fica intocado.

### 3. Relacionamentos e constraints
- `notas_fiscais_tentativas`: `user_id` → `auth.users` (cascade); `nota_id` → `notas_fiscais` **`on delete set null`** (a auditoria sobrevive à exclusão da nota); `unique (user_id, idem)`; `confianca` 0 a 1 (3 casas); `resultado`, `classe`, `situacao_fiscal`, `origem` com listas fechadas; `motivos`, `incertos` e `docs` com tamanho máximo; **sem CPF** (`nf_tem_cpf`); `ia_uso_id` sem FK (sobrevive à limpeza de `ia_uso`).
- `notas_fiscais_situacoes`: `nota_id` → `notas_fiscais` (cascade: o histórico sai com a nota, que só some por exclusão deliberada); `de`/`para` fechados; `origem` (`gravacao`, `atualizacao`, `cancelamento`, `rejeicao`, `manual`) e `fonte` (`foto`, `pdf`, `xml`, `manual`); `tentativa_id` com FK adiada (a tentativa nasce na mesma transação).
- Imutabilidade por gatilho (`nf_tentativas_imutavel`, `nf_situacoes_imutavel`) além da falta de privilégio: só a ação "nota_id vira nulo" (exclusão da nota) e a administração/cascata passam.

### 4. Storage e RLS
- **RLS das tabelas novas: só o dono lê** (`user_id = auth.uid() and user_id = dono_da_casa()`) + a trava restritiva `mfa`; `revoke all from anon, authenticated` e **`grant select` apenas**: ninguém insere, atualiza nem apaga direto (a Fernanda não vê nada).
- Originais de nota de foto/PDF: mesmo caminho do XML (`<dono>/notas-fiscais/<nota>/<sha256>.<jpg|png|webp|pdf>`), sem sobrescrever; a política "casa" do Storage e as duas restritivas da 034 continuam valendo.
- Originais de **tentativa bloqueada** ficam no mesmo caminho e são registrados em `tentativas.docs`; duas políticas **restritivas novas** (somam-se às da 034) impedem substituir/apagar arquivo registrado em nota **ou** em tentativa, via `nf_path_registrado()` (definer, para valer também para a Fernanda). O mesmo arquivo bloqueado de novo **não ocupa o cofre duas vezes** (o site apaga a cópia nova; `docs_para_apagar`).

### 5. RPCs transacionais
- **`nota_fiscal_salvar_doc(p_nota, p_itens, p_docs, p_proc)`** — `security definer` (para a trilha não ser forjável por escrita direta), `search_path` vazio, dono + MFA. Valida tudo no banco (campos, limites, CPF), confere cada original contra o `metadata` do Storage (tamanho e tipo), **refaz a conta** (itens, descontos, frete, outras e `p_proc.componentes`), aplica a **confiança mínima 0,90** (ou `revisada`), exige **chave válida** e decide:
  - cancelada/rejeitada, divergente, baixa confiança, sem chave → **`bloqueada`**: grava só a tentativa (+ o original, **sempre**); **não é erro**, então a auditoria persiste;
  - autorizada consistente → **`validada`**; pendente/contingência consistente → **`pendente_fiscal`**;
  - id/chave/arquivo já existentes → **`duplicada`** (tentativa registrada, arquivo novo para apagar); mesmo `idem` → devolve a decisão anterior sem gravar.
  Nota + itens + documentos + tentativa + histórico inicial numa transação (savepoint); `unique_violation` lê o vencedor. Foto/PDF **nunca** é conferida na gravação.
- **`nota_fiscal_atualizar_situacao(p_id, p_situacao, p_protocolo, p_evidencia, p_fonte)`** — dono + MFA; transições: `pendente`/`contingencia` → `autorizada` (exige protocolo de 15 dígitos), `cancelada` ou `rejeitada`; `autorizada` → `cancelada`; o resto é recusado; repetir é inofensivo. Respeita o congelamento da 034 (nota conferida só vai a cancelada e a evidência fica no histórico, não na nota).
- Gatilho `notas_fiscais_hist_situacao` (definer): grava o histórico em **qualquer** mudança de situação (inclusive de XML, só em UPDATE) e na criação de nota de foto/PDF; o gravar de XML **não** escreve histórico.
- Gatilho `notas_fiscais_foto_regras`: foto/PDF só se confere depois de **autorizada**; o formato não muda.

### 6. Atualização de situação, auditoria e deduplicação
- Fluxo: nota em contingência é guardada → quando houver prova da autorização (novo XML/foto/PDF ou consulta), o site chama `nota_fiscal_atualizar_situacao`; o histórico mostra gravação → autorização → cancelamento, com protocolo, evidência, fonte e a tentativa de origem.
- Auditoria: tentativas (inclusive bloqueadas e duplicadas) e situações são append-only e só do dono. Dedupe: chave (índice único), arquivo (índice único por SHA), id, `idem` (retentativa de rede) e as travas de advisory lock; o hash é o do navegador (o banco não recalcula).

### 7. Testes (PGlite, `tests/banco_foto_pdf.test.mjs`, 16)
Proposta idempotente e só soma; gravação de foto (1 e 2 imagens; 5 recusadas) e de PDF; duplicidade por hash, chave e id; reprocessamento do mesmo clique; falha no upload (sem arquivo, tamanho, tipo, sem metadata); falha nos metadados (item inválido, CPF, falha no meio da gravação: nada fica pela metade); contingência → autorizada → conferida → cancelada com histórico; bloqueios (divergente, item, baixa confiança, sem chave, cancelada, rejeitada) com original guardado, 0,90 inclusivo, revisão que não relaxa a conta, componentes fiscais, `guardar_original = false`; acesso (Fernanda, estranho, anon, MFA, escrita direta e adulteração da auditoria); concorrência simulada; exclusão de nota e de conta; **regressão do XML**. Sem chamadas de IA.

### 8. Riscos, compatibilidade e impacto no XML
- **XML:** nenhuma função, tabela, política ou gatilho das migrations 032 a 034 é alterada. Único efeito sobre o XML: um gatilho novo **depois** de `UPDATE OF situacao` registra o histórico (ex.: o cancelamento de uma nota XML conferida passa a deixar rastro); gravar/conferir XML continua igual (provado).
- **Fernanda:** resolvido na própria 037 para foto/PDF (políticas restritivas, ver "Revisão final"); continua podendo mexer em vínculos e em notas de XML, como antes.
- **Risco:** o banco confia no hash, no tipo e nos `componentes` informados pelo site (só prova que a equação fecha); a confiança vem do modelo.
- **Risco:** `security definer` (diferente da 034) — por isso o filtro explícito de casa e o dono/MFA dentro da função; revisar com atenção.
- **Pendente na implementação (não nesta migration):** `NUCLEO.SEG_TABELAS` (backup/restauração conhecem as duas tabelas, com `pk`/`fk`), `seguranca_estado()`, `nfParaGravar` e `js/fiscal.js` para montar `p_proc` e chamar as RPCs (e apagar `docs_para_apagar`), testes do site.
- **Reversão:** a proposta só soma; desfazer = `drop` das duas tabelas, das funções e dos gatilhos (nenhum dado de XML envolvido).

### 9. Storage: estimativa e limites (hipóteses, não medidas)
- Foto de celular sem reduzir ≈ 2 a 6 MB; PDF de nota ≈ 0,1 a 2 MB; limites: 12 MB por imagem, 10 MB por PDF, 4 imagens por nota. Exemplo: 150 notas/ano × 3 MB ≈ 0,5 GB/ano; no pior caso (4 fotos de 6 MB) ≈ 3,6 GB/ano.
- O original da nota **bloqueada** também fica (padrão); o mesmo arquivo não é guardado duas vezes. Retenção: sem expiração automática; para liberar espaço, só excluindo a nota (registrados na nota) — **os originais de tentativas não têm exclusão pelo site** (decisão de retenção a tomar). O plano do Supabase e a cota de Storage não foram consultados.

### Revisão final da proposta (08/11/2026) — decisões do dono aplicadas, funções revisadas
**Decisões do dono aplicadas ao SQL:** (1) a nota bloqueada **sempre** guarda a tentativa e o original (a opção `guardar_original` foi removida; a RPC recusa o campo); o mesmo arquivo bloqueado de novo **aponta para o original já guardado** em vez de gravar outra cópia; (3) nada apaga original de nota nem de tentativa, e nenhum arquivo registrado em tentativa volta em `docs_para_apagar` (só a cópia nova de um arquivo repetido); a retenção fica para etapa futura. (2) Fernanda: ver abaixo.
**Fernanda — implementado (era simples e compatível):** três políticas **restritivas** em `notas_fiscais` (insert, update, delete) e três em `notas_fiscais_itens`/`notas_fiscais_docs` fazem escrever **direto** em nota de **foto/PDF** (e nos itens e documentos dela) ser só do dono. As políticas só valem para linha que **não é de XML**: a Fernanda continua gravando XML pela RPC da 034, conferindo, cancelando e excluindo XML, e continua **lendo** tudo (provado em teste). Não dá para converter um XML em foto/PDF. As RPCs desta migration gravam como dono da função (sem RLS). Limitações que ficam: ela segue podendo mexer em **vínculos** e em notas de XML (como antes); não foi feita auditoria ampla de RLS.
**Problemas encontrados e corrigidos:** (a) `nota_fiscal_salvar_doc` aceitava `guardar_original` (contrariava a decisão) — removido; (b) a tentativa bloqueada de um arquivo já guardado não tinha ponteiro para o original — corrigido; (c) o gatilho do histórico podia quebrar a escrita do dono se a nota fosse inserida por escrita direta com formato `danfe` (fonte fora da lista) — a fonte agora cai em `manual`; (d) escrita direta da Fernanda em nota de foto/PDF — restringida.
**Revisão das funções `SECURITY DEFINER` (provada em teste):** `nota_fiscal_salvar_doc`, `nf_tentativa_gravar`, `nf_path_registrado` e `notas_fiscais_hist_situacao` têm `search_path` vazio, nome de tabela sempre qualificado e **nenhum SQL dinâmico**; `anon` não executa nenhuma função da migration; quem entrou só executa `nota_fiscal_salvar_doc`, `nota_fiscal_atualizar_situacao` (invoker: RLS e MFA valem) e `nf_path_registrado`; o gravador da trilha (`nf_tentativa_gravar`) **não é chamável** por quem entrou, então a auditoria não se forja; sem login, Fernanda e quem é de fora **não gravam nem atualizam** (nenhuma linha em notas, tentativas ou histórico); sem MFA nada passa. A chave de lock é a mesma da 034 (`:chave:`, `:sha:`, `:id:`), então XML e foto/PDF da mesma chave se enfileiram. Pontos de atenção (não são defeitos): o mesmo `idem` com dados diferentes devolve a decisão anterior (o site deve gerar um `idem` novo a cada leitura/correção); um `id` de nota igual ao de outra casa falha com erro de chave duplicada (instalação de uma casa só).
**Falhas e transações (provadas):** sem arquivo no cofre, tamanho ou tipo diferentes, sem `metadata`, item inválido, CPF em texto e uma falha no meio da gravação **não deixam nada** (nem nota, nem item, nem documento, nem tentativa, nem histórico); a corrida entre a checagem e o `INSERT` termina em uma nota e uma tentativa `duplicada`; o XML segue igual (gravar, conferir, cancelar).

### Aplicação da 037 em produção (feita pelo dono em 08/11/2026)
O Claude não tem acesso de produção (travas do `.claude/settings.json`), então a aplicação e a conferência foram feitas pelo dono no SQL Editor, com o roteiro do Claude (`supabase/conferencias/037_conferir_producao.sql`, blocos 1 a 9, validado em PGlite antes e depois da migration). Resultados conferidos acima. Um defeito do roteiro (o bloco 7 falhava antes de aplicar) foi corrigido no commit `def5616`.

### 10. O que exigirá autorização daqui para a frente
1. ~~Aplicar a 037~~ (feito em 08/11/2026). Não há deploy de função: a `rac-ia` não muda.
2. Decisões de negócio: **já tomadas** (original da bloqueada sempre guardado; escrita direta da Fernanda restringida só para foto/PDF; retenção dos originais de tentativas fica para etapa futura, nada é apagado).
3. A implementação no site (`js/fiscal.js`, `nucleo.js`, backup) e a publicação seguem a rotina de entrega permanente, **mas só depois** da 037 aplicada e conferida.
4. Integração Fiscal → Mercado → Financeiro: continua fora (lote próprio).

### Planejamento (Prioridade 1 — Central Fiscal + Mercado + Financeiro)
**FEITO** — leitura de XML NF-e/NFC-e; gravação segura (034, em produção); Compras Lote 5.1; **Lote 1.5: migration 037 aplicada em produção e conferida (08/11/2026) + 17 testes em PGlite**; Lote 1.2 (núcleo, `41e4981`); Lote 1.3 (validação, situação fiscal e duplicidade na tela e na gravação, `339d033`);
**Lote 1.4 (código)**: ação `fiscal.nota` na `rac-ia` (REAL-only, dono, Sonnet 5.5), proposta de SQL 036, leitura de foto/PDF na tela do dono (arquivo conferido pelo conteúdo, PDF desenhado sem executar, CPF mascarado no texto),
confiança mínima 0,90, validação e duplicidade iguais às do XML, correção manual com revalidação, proteção contra envio duplicado. Suíte completa local com PGlite sem falhas (números no relatório do lote).
**Lote 1.6 (código, 08/11/2026)**: o site grava nota de foto e PDF pela 037 (botão de salvar, original no cofre, tentativas, situação fiscal, lista, backup/`SEG_TABELAS`), com testes de tela e de banco (PGlite). Detalhes na seção "Lote 1.6" abaixo.
**EM ANDAMENTO** — **Lote 1.6: faltam publicar o site, o dono aplicar a 038 (`seguranca_estado()` com as duas tabelas novas) e fazer o teste real de gravação em produção (nada foi gravado no Supabase real pelo Claude)**; a IA real de foto/PDF **está ativa em produção para o dono** (036 aplicado, `rac-ia` publicada, `fiscal.nota` liberada, uma leitura real bem-sucedida); falta medir a qualidade em mais notas (fotos ruins, PDF de várias páginas, nota com desconto e acréscimos) e registrar o consumo médio por leitura; **gravar nota de foto/PDF** (e guardar o original no cofre)
depende de migration nova; conferir a tela no site publicado; pendências gerais: limpeza do Storage de testes do Lote 5.1 e confirmar `abastecimento.interpretar` em produção.
**FUTURO** (cada item que tocar banco precisa de autorização própria) — a política de retenção dos originais de tentativas; teste real controlado da leitura (nota de teste, saldo pré-pago);
integração Fiscal → Mercado → Financeiro (vincular compra existente, criar só se não existir, idempotente, só nota autorizada e consistente); IA real em `mercado.nota`, `alimentacao.pedido`, `esportes.*`.

## Lote 1.6 · gravar nota de foto e PDF no site (08/11/2026) — código pronto e testado; faltam publicar, aplicar a 038 e o teste real do dono

O site passa a usar a 037 (já aplicada em produção). **Código:** `js/fiscal.js` (`fxSalvarDoc`, `fxAtualizarSituacao`, `fxListaPainel`), `nucleo.js` (`nfParaGravarDoc`, `nfResultadoDoc`, `nfAtualizarSituacao`, `SEG_TABELAS`), `js/sistema.js` (originais das tentativas no pacote) e a proposta `supabase/038_seguranca_estado_tentativas.sql`.

### Fluxo (só o dono; a tela da Fernanda não muda: sem leitura por IA, sem lista nova)
1. Ler foto (até 4) ou PDF com a IA (Lote 1.4), conferir/corrigir. A tela mostra a validação e **um** botão, conforme as regras: **Salvar na Central Fiscal** (autorizada e consistente), **Salvar como pendente fiscal** (contingência/pendente consistente) ou **Registrar tentativa bloqueada** (divergente, baixa confiança, cancelada, rejeitada, sem chave: a nota **não** é criada; só o original e a tentativa ficam, para auditoria). Duplicidade confirmada (mesma chave ou mesmo SHA-256): sem botão de salvar e nada é enviado.
2. No clique: arquivo conferido pelo conteúdo, SHA-256, `NUCLEO.nfParaGravarDoc`, duplicidade obrigatória (se a leitura de `notas_fiscais` ou de `notas_fiscais_docs` falhar, nada é enviado; Compras/Mercado/pedidos são melhor esforço), upload de cada original em `familia/<dono>/notas-fiscais/<nota>/<sha256>.<ext>` (`upsert:false`, um por vez; 409 = já estava lá) e a RPC **`nota_fiscal_salvar_doc(p_nota, p_itens, p_docs, p_proc)`**, que refaz a conta, aplica a confiança mínima de 0,90, a regra da situação, a duplicidade e a idempotência.
3. **A tela só diz "gravada" depois que o banco respondeu `criado` com `validada` ou `pendente_fiscal` e a nota e os documentos foram lidos de volta.** Bloqueada, duplicada e "já processada" têm texto próprio e nunca aparecem como gravada. Vale a resposta do banco, não a previsão da tela.
4. Falha no upload ou na RPC: apaga só o que **esta** tentativa enviou (o banco recusa apagar original registrado), nenhuma nota é criada e a mensagem diz o que houve. O `docs_para_apagar` da resposta também passa pela limpeza. O erro 40001 repete até 3 vezes; permissão, MFA e validação nunca repetem.
5. **Idempotência:** cada leitura tem um `idem` (UUID) e um id de nota. Repetir o clique, ou tentar de novo depois de uma falha de rede, reaproveita os dois (o banco não grava duas vezes; se a nota já existe com o mesmo id, a tela diz "já tinha sido gravada" e relê). **Corrigir os dados lidos gera `idem` novo**: a conta, a situação e a duplicidade rodam de novo; o id da nota e o arquivo são os mesmos (o original já guardado não é duplicado).
6. **Nunca conferida automaticamente:** a gravação nunca confere a nota; "Marcar como conferida" é um botão separado na lista, com a marca "conferi com o documento", só para nota autorizada (a 037 recusa conferir nota pendente). A IA não aprova nada; revisão humana = a caixa "Conferi" do editor (confiança 100%, mas a conta, a situação e a duplicidade continuam valendo). Nenhum caminho cria despesa nem toca em Mercado ou Financeiro.

### Contrato com o banco (nomes exatos da 037)
`p_nota` = `id, modelo, chave, numero, serie, data_emissao, emitente_nome, emitente_cnpj, emitente_uf, tp_emis, situacao, situacao_evidencia, protocolo, denegada, valor_produtos, valor_descontos, valor_frete, valor_outras, valor_impostos, valor_total, valor_a_pagar, pagamentos, formato_origem` (`imagem` ou `pdf`)`, requer_conferencia` (sempre true)`, observacoes`; `p_itens` como no XML; `p_docs` = `tipo, nome, path, mime, tamanho, sha256` (1 PDF ou 1 a 4 imagens); `p_proc` = `idem, classe, confianca, revisada, diferenca, componentes, motivos, incertos, modelo_ia, ia_uso_id`. `componentes` = soma líquida de ST, FCP-ST, IPI, seguro, II e IPI devolvido menos ICMS desonerado (o banco só prova que a equação fecha). Atualização: `nota_fiscal_atualizar_situacao(p_id, p_situacao, p_protocolo, p_evidencia, p_fonte)`.

### Situação fiscal (lista "Notas já gravadas")
A lista (notas, tentativas e histórico) é só do dono, para não mudar o que a Fernanda vê (CLAUDE.md); ela continua com o fluxo de XML e o acesso de leitura que o banco já lhe dá. Rótulos: **Validada** (autorizada; "falta conferir" ou "conferida"), **Pendente fiscal** (contingência/pendente) e **Cancelada/Rejeitada** (não vale como compra). Tentativas bloqueadas ou duplicadas sem nota aparecem à parte, com o motivo e o original. Ao abrir a nota: documento original (link temporário de 5 minutos por `createSignedUrl`, nunca público), histórico de situação (de, para, protocolo, origem, fonte) e tentativas. Atualizar a situação: só as transições do banco (pendente/contingência para autorizada/cancelada/rejeitada; autorizada para cancelada), **protocolo de 15 dígitos para autorizar**, evidência opcional sem CPF; o sucesso só aparece depois de o banco confirmar e a nota ser relida. Uma leitura nova "autorizada" de nota já guardada como pendente oferece o botão de atualizar (não cria nota).

### Backup e segurança
- `SEG_TABELAS` ganhou `notas_fiscais_tentativas` (pai opcional: `notas_fiscais`) e `notas_fiscais_situacoes` (pais: `notas_fiscais` e, opcional, `notas_fiscais_tentativas`), em ordem pai → filho e com `so:"exportar"`: **entram no backup e no pacote, mas a restauração não as escreve**, porque a 037 só deixa a RPC gravar (ninguém tem INSERT). `id`, `nota_id` e `tentativa_id` guardam os vínculos no arquivo. Ao restaurar uma nota de foto/PDF, o gatilho da 037 cria de novo a linha "gravacao" do histórico; as tentativas antigas ficam só no backup.
- O pacote "com fotos e PDFs" passa a incluir os originais das tentativas (campo `docs`), sem repetir caminho. Ficam no `.zip` privado baixado pelo dono; nada vai a destino público. A restauração não os devolve ao cofre (o plano ignora anexo fiscal sem documento válido).
- **Retenção inalterada:** nada apaga original de tentativa; a limpeza só atinge o que a própria tentativa acabou de enviar e o banco não registrou.
- `seguranca_estado()`: a lista fixa de tabelas da trava "mfa" não conhece as duas tabelas novas. A **038** recria a função (a da 033 mais essas duas). O teste em PGlite prova que, sem a 038, a falta da trava não aparece e, com ela, aparece. **A 038 não foi aplicada** (o Claude não tem acesso de produção). Depois de aplicar: `supabase/conferencias/038_conferir_producao.sql` (só leitura, esperado tudo "ok") e abrir Segurança → Auditoria.

### Gravar sem chave de acesso (pedido do dono em 08/11/2026; migration 039, PROPOSTA não aplicada)
No teste real, uma foto com a chave ilegível ficou bloqueada (a 037 recusa nota sem chave). O dono decidiu aceitar nota sem chave **confirmada pelo "Conferi"**, sem digitar os 44 dígitos (os itens servem ao balanço, não à conferência fiscal). Regra: sem chave **e** revisada = grava como **pendente fiscal**, nunca validada; se a leitura dizia "autorizada", a situação gravada vira `pendente` (sem chave não há como provar; o dono autoriza depois com o protocolo); nunca conferida na gravação; sem a revisão do dono continua bloqueando; cancelada, rejeitada e conta errada continuam bloqueando; XML não muda. Custo assumido: sem chave não há checagem de duplicidade pela chave (fica a do arquivo, pelo SHA-256) nem validação da chave. Implementação: `supabase/039_nota_foto_sem_chave.sql` (só recria `nota_fiscal_salvar_doc`, igual à 037 com uma diferença, provada por teste) e, no site, `nfVeredito`/`nfDecisaoGravacao` com `opts.revisada` e `sem_chave_revisada`. **Enquanto o dono não aplicar a 039, o banco continua recusando (o site prevê pendente, mas vale a resposta do banco: tentativa bloqueada).** Conferência depois de aplicar: `supabase/conferencias/039_conferir_producao.sql`.

### Dar entrada da nota no Mercado (pedido do dono em 08/11/2026; migration 040, PROPOSTA não aplicada)
O dono quer lançar a compra no sistema dele na hora, sem esperar protocolo (muitas notas de mercado não têm chave legível). A **situação fiscal é só uma etiqueta**; a **entrada no Mercado vale pelo "Conferi"** e é um passo separado. Destino escolhido pelo dono: **só o Mercado** (sem despesa no Financeiro). Botão **"Dar entrada no Mercado"** (no aviso de nota gravada e dentro da nota na lista), com a caixa "Conferi os itens com o documento".
- **Função `nota_fiscal_entrada_mercado(p_nota_id, p_conferi)`** (invoker, só o dono, MFA): lê a nota e os itens **do banco** (não do navegador), acha ou cria o mercado (CNPJ ou nome), reaproveita o produto de um item anterior com a mesma descrição (senão cria com o nome em "Nome Próprio" e categoria `Mercearia`; o dono ajusta em Mercado → Produtos), cria a compra (`notas`) e os itens (`itens`; g/ml viram kg/l; desconto do item em `itens.desconto`) e registra o vínculo `notas_fiscais_vinculos` (modulo `mercado`, `gera_despesa = false`).
- **Não faz:** não cria despesa, não toca no Financeiro, não muda a situação fiscal, não valida nem confere a nota. Nota cancelada ou rejeitada não entra. A mesma nota entra **uma vez só** (vínculo + trava de concorrência: clicar de novo devolve a compra que existe); chave já presente numa compra do Mercado = duplicidade, nada é criado.
- **Aviso antes de entrar:** se já houver compra no Mercado com a mesma data e o mesmo valor, a tela pergunta. A tela só diz "entrou" depois de ler a compra e os itens de volta.
- **Limite:** sem a 040 aplicada o botão dá erro de função ausente (nada é criado). Conferência depois de aplicar: `supabase/conferencias/040_conferir_producao.sql`.

### Testes (sem rede, sem banco real, sem IA paga)
`tests/fiscal_foto_gravar.test.mjs` (26): campos do payload; foto, PDF e 4 imagens; pendente fiscal; bloqueios; revisão humana; idempotência (clique repetido, rede que cai depois do commit); falha no upload (limpeza parcial) e na RPC; 409; resposta do banco que contradiz a previsão; duplicidade por chave, por hash e possível; atualização de situação; lista, histórico, tentativas, original, conferência; Fernanda; escopo (só 4 RPCs, só o cofre `familia`, sem despesa). `tests/banco_foto_pdf_site.test.mjs` (9, PGlite): o payload montado pelo site contra 034+037+038 reais, com 13 casos em que o site e o banco decidem igual, idempotência, correção após bloqueio, duplicidade, situação, `seguranca_estado()` com e sem a 038, MFA/Fernanda/estranho/anônimo, regressão do XML e XML × foto da mesma chave. Os guardas de escopo antigos (`fiscal_tela`, `fiscal_validacao`, `fiscal_ia`, `banco_lote3`) foram atualizados para as quatro RPCs aprovadas e para a 038.

### O que este lote NÃO prova
- **Produção:** nenhum upload, nenhuma RPC e nenhuma leitura de volta foram feitos no Supabase real (o Claude não tem sessão do dono nem MFA e não executa SQL de produção). Gravar de verdade no cofre e no banco só será confirmado no teste real do dono. Até lá, **a persistência não está declarada concluída**.
- As políticas do Storage em ação (o PGlite simula `storage.objects`): a 037 foi conferida por consulta no banco real, mas o upload real com a política restritiva depende do teste do dono.
- A tela em navegador real a 375 px e em desktop: sem Playwright local (roda no GitHub); a tela usa `flex-wrap` e as mesmas classes do restante de `#fiscal`.

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
