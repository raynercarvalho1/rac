# RAC Inbox · I1 e I2 — Fundação, custódia, canal assinado e sincronização (documento técnico)

Registro do que foi **efetivamente implementado** na fase I1 do [Documento 10](planejamento/10-rac-inbox.md). Atualizado em 15/11/2026.
Estado (15/11/2026): **em produção (confirmado pelo dono):** migrations 051, 052 e **053** aplicadas (a 053 em 15/11/2026, diretamente no banco pelo ChatGPT; colunas e o índice `inbox_ref_lista` conferidos); função `rac-inbox` **versão 1** publicada (`verify_jwt=true`); credencial iCloud **cadastrada no Vault** (`inbox_cofre.conferir()`: credenciais 1, ponteiro_sem_segredo 0, segredo_sem_ponteiro 0); site `2026-11-15.1` com o cliente habilitado (deploy do Pages verificado pelo GitHub; a versão efetivamente servida foi vista pelo dono no navegador). **Pronto em código e testado só com simulações, NÃO publicado, NÃO testado contra a Apple:** Worker de produto (branch isolada `claude/inbox-p7-worker`), função `rac-inbox` v2 (canal assinado, sincronização, leitura) e a interface real (branch `claude/inbox-i2-sync`). **A autenticação real com a Apple ainda não foi testada.** Ver "I2" e "O que falta".

> **Sobre o documento:** as seções "Arquitetura de integração" e "Custódia" descrevem a I1 e continuam válidas; a seção **"I2"** (abaixo) descreve o que foi acrescentado em 15/11/2026 e **prevalece** onde houver diferença.


## O que já funciona no RAC

- Página **Inbox** (`#inbox`), só do dono (a Fernanda não vê; o item não tem `casa:true` em `js/rotas.js`), no menu na área "Hoje".
- **Desktop:** uma superfície com três áreas. Lateral: botão de nova mensagem (desligado), **Caixas** (unificada com contagem parcial quando falta conexão; cada conta com avatar, endereço e ponto de estado; as pastas da conta aberta com ícone e contagem) e **Categorias** (do Documento 10; desligadas, etapa I4). Lista: título e contagem, busca (desligada), filtros Todas, Não lidas e Com anexo, mensagens **agrupadas por data** (Hoje, Ontem, Esta semana, Anteriores) com remetente, assunto, prévia de duas linhas, horário, clipe de anexo e indicador de não lida. Leitura: barra de ações (responder, responder a todos, encaminhar, arquivar, excluir, mais; todas desligadas), assunto, remetente com endereço, destinatários, data por extenso, corpo com largura de leitura confortável e **anexos como arquivos** (tipo, nome e tamanho). Em janela estreita (até 1180 px, tablet) a lateral vira **gaveta**, para a leitura não ficar espremida.
- **iPhone (até 860 px):** a **lista ocupa a tela** com título grande, busca e filtros; a **leitura** e as **caixas** abrem em **tela própria** (voltar no topo); na leitura, as ações ficam numa **barra inferior** com alvos de 44 px; áreas seguras (`env(safe-area-inset-*)`) respeitadas. Temas claro e escuro vêm dos tokens `--rac-*`: o Inbox **não define token nem cor nova** (testado).
- Estados: carregando, vazio, erro (com "Tentar de novo"), **estrutura pendente** (migration 051 ainda não aplicada) e **desconectado** (conta cadastrada, sem conexão: aparece como "Nova"/"Desconectada", nunca como caixa vazia; a caixa unificada marca a contagem como parcial).
- **Cadastro de conta** (provedor, nome e endereço; só iCloud): é a única gravação **da tela** em tabela (`inbox_contas`); o cadastro não tem campo de senha.
- **Conexão da conta (credencial no cofre):** dentro da conta, mostra o estado (sem credencial, guardada, recusada pelo provedor) e oferece **Conectar / Substituir senha / Desconectar e remover a credencial**. O formulário (login do ID Apple e senha **específica de app**) **só aparece com o serviço publicado** (`INBS.publicado`, ligado em 15/11/2026): a tela oferece **Conectar** e o campo de senha só abre depois desse clique; com a flag desligada a tela volta a dizer que a conexão será liberada e **nada é pedido nem guardado**. Detalhes na seção "Custódia da credencial no Vault".
- **"Ver exemplo da interface"**: mostra mensagens **fictícias** (`js/inbox-demo.js`, domínio `example.com`) com a faixa "DEMONSTRAÇÃO" em todo lugar. Os dados nem são carregados até o dono pedir, ficam isolados em outro módulo, nunca são gravados, e o serviço real nunca os importa.
- Matriz de **paridade honesta** entre provedores (comprovado / não comprovado / feito pelo RAC / indisponível / planejado).
- **Não funciona ainda (de propósito):** ler mensagens reais, sincronizar, enviar, responder, mover, excluir, marcar, anexos, polling, notificações, IA, Gmail, Outlook, categorias inteligentes. As ações aparecem **desligadas** ("disponível nas próximas etapas"); nenhuma altera caixa.

## Arquivos

| Arquivo | Papel |
|---|---|
| `js/inbox.js` | Tela e cadastro de contas (ES5; usa `NUCLEO.inb*` e o kit) |
| `js/inbox-servico.js` | Cliente do serviço de e-mail: valida o pedido e chama a função do servidor |
| `js/inbox-demo.js` | Exemplo da interface (dados fictícios, isolados) |
| `nucleo.js` (`inb*`, `INB_*`) | Regras puras: provedores e paridade, estados, validação de conta, contrato de operações, cursor IMAP, normalizador de resposta, árvore e unificada, horário |
| `css/rac.css` (bloco "RAC Inbox · I1") | Layout responsivo, só tokens |
| `supabase/051_inbox_fundacao.sql` | Modelo de dados (preparado, não aplicado) |
| `supabase/052_inbox_cofre.sql` | Custódia da credencial no Vault: ponteiro, schema privado, funções do cofre (preparada, não aplicada) |
| `supabase/functions/rac-inbox/` | Função de servidor (contrato, serviço puro, ligação ao Deno); **versão 1 publicada** (custódia); a v2 (I2) está no código, **não publicada** |
| `supabase/053_inbox_cabecalhos.sql` | I2: cache de **cabeçalhos** em `inbox_mensagens_ref` e nome legível da pasta (**aplicada em produção em 15/11/2026**; a linha `-- status: pendente` do arquivo continua, como na 051 e na 052, e sai numa tarefa própria de higiene, pois os testes de texto a exigem hoje) |
| `supabase/functions/rac-inbox/canal.ts`, `sync.ts`, `repositorio.ts` | I2: lado Supabase do canal assinado; sincronização e filtros de esquema fechado; SQL do cache e do cursor |
| `experimentos/rac-inbox-worker/` (**só na branch `claude/inbox-p7-worker`**) | I2: Worker de produto (canal HMAC, anti-replay, IMAP somente leitura); **não publicado** |
| `tests/inbox_nucleo.test.mjs`, `tests/inbox_sql.test.mjs`, `tests/inbox_tela.test.mjs`, `tests/inbox_cofre_sql.test.mjs`, `tests/inbox_cofre_servico.test.mjs`, `tests/inbox_canal.test.mjs`, `tests/inbox_sync_servico.test.mjs`, `tests/inbox_sync_sql.test.mjs` | Testes da fase; os do Worker (`tests/rac_inbox_worker*.mjs`) estão na branch do Worker |

## Modelo de dados (migration 051)

Quatro tabelas, todas com `dono uuid default auth.uid()`, RLS, política **"so o dono"** (dono = `auth.uid()` e **quem é membro da casa fica de fora**), trava restritiva **"mfa"** (2ª etapa, `rac_aal_ok()` da 022) e **nenhum privilégio para `anon` nem `service_role`**:

| Tabela | O que guarda | Observações |
|---|---|---|
| `inbox_contas` | provedor (por formato, não lista fechada), apelido, endereço, estado (`nova`, `conectada`, `sincronizando`, `atrasada`, `erro_autenticacao`, `desconectada`), último erro (**código fechado**) | única por (dono, provedor, endereço sem diferenciar maiúsculas) |
| `inbox_pastas` | pasta da conta (nome no provedor), uso (`entrada`, `enviados`, `rascunhos`, `lixo`, `spam`, `arquivo`, `outra`), total e não lidas | chave composta `(conta_id, dono)`; não lidas ≤ total |
| `inbox_sincronizacao` | cursor por pasta (UIDVALIDITY/UIDNEXT, 1 a 4294967295, inteiro ou nenhum), `tipo_ultima` (vocabulário da P6), última leitura/tentativa, falhas seguidas, duração, erro (código fechado) | uma linha por pasta; chave composta `(pasta_id, conta_id, dono)` |
| `inbox_mensagens_ref` | **só a identidade** da mensagem: conta, pasta, ID externo (IMAP: `uidvalidity:uid`) | sem update (a identidade não se edita); única por conta/pasta/ID; **nada grava aqui na I1** |

**O que o banco não tem onde guardar** (conferido pelos nomes das colunas reais num Postgres de verdade): senha, senha de app Apple, token, código de autorização, cookie, qualquer credencial; assunto, remetente, destinatário, corpo, trecho, anexo. Texto livre do provedor também não: erro e uso são códigos fechados.

**Isolamento por construção:** as tabelas filhas apontam para a pai por **chave composta que inclui o dono (e a conta)**; uma linha nunca referencia conta ou pasta de outro usuário nem de outra conta, mesmo com IDs coincidentes. Gatilho: dono e conta **nunca mudam**; `atualizado_em` é sempre do servidor. Apagar a conta (ou o usuário) apaga só os metadados do RAC; **a caixa de e-mail original nunca é tocada**.

**Auditoria e backup:** a 051 inclui as 4 tabelas no catálogo da auditoria (`seguranca_catalogo`) **se a 050 já existir** (senão avisa e segue; rode a 050 e depois a 051 de novo). Entram em `NUCLEO.SEG_TABELAS` como **só-exportar** (`dep: "051"`): o estado de sincronização é reconstruível do provedor, e restaurar um cursor antigo faria a sincronização perder mensagens — **decisão técnica reversível, a confirmar pelo dono**. Também entram em `tests/seguranca.test.mjs` (sem login não lê).

### Como aplicar (só com autorização do dono)

Ordem: 002 → 022 → (050, opcional) → **051**, no SQL Editor; pode rodar de novo. Conferência só leitura: o rodapé do próprio arquivo (8 políticas, nenhuma tabela sem RLS, nenhum grant para `anon`). Depois de aplicada, tirar a linha `-- status: pendente` e registrar a data no cabeçalho (como nas demais). **Nada disso foi feito.**

## Arquitetura de integração

```
Interface RAC (js/inbox.js)  →  inbox-servico.js  →  função "rac-inbox" (Supabase Edge; v1 publicada, v2 = I2)  →  Worker (I1: POC com pins/OIDC; I2: Worker de produto com canal HMAC)  →  provedor
        │                                                      │
        └── metadados (RLS, como o dono)  ←── Supabase ────────┘   (o serviço grava o estado de sincronização com o JWT do dono; nunca com service_role)
```

Implementado agora (e testado):
1. **Contrato** (`NUCLEO.INB_OPERACOES`, `NUCLEO.inbPedido`): só `testar_conta`, `listar_pastas` e `estado_pasta`, **todas de leitura**, só com IDs (UUID). Verbo de escrita (enviar, responder, mover, excluir, marcar, anexar, criar pasta/filtro, `store`, `expunge`, `append`…) é recusado com `escrita_fora_do_escopo`; qualquer campo de credencial (`usuario`, `senha`, `token`, `authorization`…) com `credencial_proibida`; campo extra, ID inválido e operação desconhecida também têm código fechado.
2. **Cliente** (`inboxChamar`): valida antes de qualquer rede; **com `INBS.publicado = false` não envia nada** e devolve `servico_nao_publicado` (nada é simulado); desde 15/11/2026 a flag é `true` e a chamada é `SB.functions.invoke("rac-inbox", …)`, que leva a sessão autenticada do Supabase (sem sessão → 401 → `sem_login`; sem MFA exigido → a política da função, `mfa_obrigatorio`); sem alternativa insegura nem armazenamento no aparelho. Falhas HTTP viram código (`sem_login`, `servico_nao_publicado`, `limite`, `servico_indisponivel`, `rede`); a mensagem do servidor nunca é mostrada.
3. **Normalizador** (`NUCLEO.inbRespostaEstado`): converte a resposta de `estado_pasta` na linha de `inbox_sincronizacao` com **esquema fechado**; o formato é exatamente o da **P6 real** (conferido com a resposta de 14/11/2026: UIDVALIDITY 1752612613, UIDNEXT 4, `primeira_leitura`; 2ª rodada `sem_mudanca`). `NUCLEO.inbCursor` repete as regras de comparação do Worker.

Preservado, sem alteração: Worker, pins (P1, P2, P6), OIDC, uso único; o Worker continua **isolado da `main`**.

### Fatos que moldam o desenho (evidência real)

- O iCloud respondeu **`[READ-WRITE]`** ao `EXAMINE` (P6, rodada 1). **Não se presume somente leitura do servidor.** A garantia é do Worker: lista fechada de comandos, só `BODY.PEEK`, sem `STORE`/`COPY`/`MOVE`/`EXPUNGE`/`APPEND`/`SELECT`. A I1 não adiciona comando de escrita nenhum; a tela diz isso na matriz de paridade.
- Sem CONDSTORE, QRESYNC, IDLE, UIDPLUS ou MOVE no iCloud: a sincronização é por UIDVALIDITY/UIDNEXT (polling, na I2 em diante).
- `PERMANENTFLAGS` veio "nao_vazio": tratar antes de qualquer prova que altere a caixa (P3).

## Custódia da credencial no Vault (implementada; 051/052 aplicadas e função v1 publicada em 15/11/2026)

**Decisão do dono (14/11/2026):** credenciais de provedores **podem ser guardadas de forma persistente no Supabase Vault**, para a conta ficar conectada sem pedir a senha a cada uso. Isto **substitui** a regra anterior ("credencial por operação, nunca persistida"), que fica registrada no histórico (Documentos 07 e 10) e **não se aplica mais**. Continuam valendo: nenhuma credencial em tabela comum, no navegador depois do envio, em resposta, erro, log, teste, captura de tela ou documentação.

**O que se aceita:** só a **senha específica de app** da Apple (formato `xxxx-xxxx-xxxx-xxxx`, minúsculas) mais o login (e-mail do ID Apple). A **senha principal da conta Apple nunca é pedida nem aceita**: o formulário, o cliente, a função e o banco recusam qualquer coisa fora desse formato (o formato não prova que é uma senha de app, mas uma senha principal não o satisfaz; quem confere de verdade é o login no provedor: se recusar, a credencial vira "inválida").

### Onde cada coisa fica

| Peça | Papel |
|---|---|
| Vault (cifrado em disco) | O **segredo**: um JSON curto com o login e a senha de app. Nome fixo `inbox_conta_<id da conta>` (o nome liga o segredo à conta) |
| `public.inbox_credenciais` (052) | **Só o ponteiro** (id do segredo) e metadados: estado (`ativa`/`invalida`) e datas. **Nenhuma coluna de senha.** Chave composta `(conta, dono)` com `inbox_contas`: o segredo é da conta **e** do usuário dono dela. O site só lê estado e datas (não o ponteiro) e não insere, altera nem apaga |
| schema `inbox_cofre` (052, **privado**) | As únicas funções que gravam, leem e removem o segredo (`guardar`, `ler`, `remover`, `estado`, `marcar`, `conferir`). **Não existe RPC**: o schema não está na Data API e `anon`, `authenticated` e `service_role` não têm nem uso do schema nem execução; só o dono das funções (`postgres`) |
| função `rac-inbox` (`supabase/functions/rac-inbox`) | Valida o JWT do dono, exige a 2ª etapa (MFA) como o banco, e fala com o cofre por **conexão direta ao Postgres** (`SUPABASE_DB_URL`), uma por chamada, com parâmetros ligados (nunca dentro do texto do SQL). **Não usa a chave de serviço.** Ainda não publicada |

### Fluxo de cadastro (conectar)
1. O dono cadastra a conta (sem senha) e, na conta, escolhe **Conectar**: informa o login e a senha específica de app. O formulário só aparece com o serviço publicado.
2. O navegador confere o formato, **limpa o campo da senha na hora** e envia **uma vez**, por HTTPS e com a sessão do dono, o pedido `credencial_guardar` (`conta_id`, `usuario`, `senha_app`). O dono **nunca** vai no pedido: vem do JWT.
3. A função valida o JWT e o MFA, valida o pedido (formatos, campos exatos, tamanho máximo de 2 KB) e chama `inbox_cofre.guardar(dono, conta, segredo)`.
4. O banco confere que a conta é daquele dono (e que ele não é da casa), cria o segredo no Vault, grava o ponteiro, tudo numa só transação. A resposta é `{"ok":true,"credencial":"guardada"}`: **nunca traz a credencial**.

### Recuperação pelo backend
Só nas operações de **leitura** no provedor (`testar_conta`, `listar_pastas`, `estado_pasta`), depois de o Worker estar configurado: a função chama `inbox_cofre.ler(dono, conta)`, que descriptografa **somente** o segredo cujo ponteiro bate com (dono, conta) **e** cujo nome é o dessa conta; sem credencial devolve nulo e a função responde `credencial_ausente` **sem tocar no Worker**. A credencial vive só em variáveis locais da chamada, vai ao Worker (canal assinado, P7, **ainda inexistente**) e é descartada; não há variável global, cache nem armazenamento. Sem Worker configurado, o segredo **nem é lido**.

### Substituição e exclusão
- **Substituir** = `guardar` de novo: o segredo é atualizado **no mesmo registro** do Vault (`vault.update_secret`); nunca sobra segredo antigo; o estado volta a `ativa` e a conta sai de "erro de autenticação".
- **Remover** (botão "Desconectar e remover a credencial", com confirmação): apaga o ponteiro e, por gatilho, o segredo no Vault; a conta fica `desconectada`. **Apagar a conta ou o usuário** também apaga o segredo (a linha cai em cascata e o gatilho dispara). `select inbox_cofre.conferir()` (dono, no SQL Editor) acusa ponteiro sem segredo ou segredo sem ponteiro, sem mostrar valores.

### Tratamento de falhas (sempre código fechado, nunca texto do banco, do Worker ou do provedor)
| Situação | Resposta | O que acontece |
|---|---|---|
| Sem login / sem 2ª etapa | 401 `sem_login` / 403 `mfa_requerido` | Nada é tocado |
| Pedido fora do contrato (senha em formato errado, campo extra, ID ruim) | 400 com código | Nada sai do navegador/da função; o valor recebido nunca é repetido |
| Conta de outro usuário ou inexistente | 404 `conta_inexistente` | Nada é lido nem gravado |
| Conta sem credencial | 409 `credencial_ausente` | **O Worker nunca é chamado** |
| Provedor recusa o login | 422 `credencial_invalida` | Credencial marcada `invalida`; o dono substitui |
| **Falha do Vault ou do banco** | 503 `cofre_indisponivel` | **A operação inteira falha e desfaz** (uma transação); **nenhum fallback**: o segredo não é gravado em outro lugar |
| Worker não ligado / indisponível | 503 `worker_nao_configurado` / 502 `servico_indisponivel` | Sem credencial exposta; a mensagem de erro do Worker é descartada |
| Imprevisto | 500 `interno` | Código fixo; a exceção é descartada |

### Limites de segurança (o que isto garante e o que não garante)
- **Garante** (testado): isolamento entre usuários (A não lê, não substitui, não remove nem marca a credencial de B); a casa não guarda nada; o site não lê o Vault nem o ponteiro; nenhuma RPC; nenhuma resposta nem registro contém a credencial, mesmo quando cofre, Worker ou marcação falham com mensagens que a citam; falha do Vault não deixa ponteiro sem segredo nem segredo em tabela comum.
- **Não garante / depende do dono confirmar em produção:**
  - **A criptografia em si é a do Supabase Vault.** Os testes usam um Vault de mentira (o Postgres do teste não tem a extensão): provam a **lógica** (funções, gatilhos, chaves, privilégios), não a criptografia nem o Vault real. As conferências do rodapé da 052 e `inbox_cofre.conferir()` fazem isso em produção.
  - **A função conecta como dono do banco** (`postgres`), um papel muito amplo: a proteção vem do código (só chama as 5 funções do cofre, parâmetros ligados, sem SQL montado) e da revisão do que é publicado. Quem alterar a função publicada controla os segredos.
  - **Logs do Postgres:** em erro, o servidor pode registrar parâmetros da consulta. O padrão do PostgreSQL (`log_parameter_max_length_on_error = 0`) não registra; o dono deve conferir `show log_parameter_max_length_on_error;` e `show log_statement;` antes de usar a credencial real. A função só registra operação, código e status.
  - **A senha passa uma vez pelo navegador** (digitada no formulário, HTTPS, limpa do campo na hora, nunca no estado nem no aparelho). Extensão maliciosa ou aparelho comprometido enxergam o que é digitado, como em qualquer formulário.
  - **O login fica dentro do segredo** (JSON), junto da senha de app, não numa coluna.
  - **Apagar a credencial no RAC não revoga a senha de app na Apple**: revogue-a também (abaixo).
  - Quem tem acesso de administrador ao Supabase consegue ler o Vault (é a natureza do Vault): o segredo é protegido contra o site e contra vazamento de dump do banco, não contra o administrador.

### Desconexão e revogação (procedimento)
1. No Inbox: conta → **Desconectar e remover a credencial** (apaga o segredo e deixa a conta desconectada).
2. **Revogue a senha de app na Apple** (conta Apple → Segurança → Senhas específicas de app). Só isso a invalida no provedor.
3. Emergência sem o site, no SQL Editor: `select inbox_cofre.remover('<id do dono>', '<id da conta>');` (apaga ponteiro e segredo) e depois `select inbox_cofre.conferir();` deve mostrar zeros. Em último caso: `delete from public.inbox_credenciais where conta_id = '<id>';` (o gatilho apaga o segredo).
4. Excluir o usuário no Supabase também remove tudo dele.

### Como colocar para funcionar (só com autorização do dono)
Ordem: aplicar `051` e `052` (002 e 022 antes; 050 opcional) → conferir (`conferir()`, privilégios e `log_parameter_max_length_on_error`) → publicar a função `rac-inbox` (**feito pelo dono; versão 1**) → trocar `INBS.publicado` para `true` no site (**feito no código em 15/11/2026; vale quando o site for publicado**). A **leitura de e-mail** ainda depende do canal assinado com o Worker (P7), fora desta entrega.

## I2 — Canal assinado (P7), sincronização e leitura (implementado em código; NÃO publicado; NÃO testado contra a Apple)

Autorização do dono (15/11/2026): implementar o P7 (canal assinado Supabase → Worker), o Worker de produto e a I2 (leitura e sincronização reais da conta iCloud). **Não** inclui envio (SMTP), resposta, encaminhamento, exclusão, marcar como lida nem qualquer escrita na caixa. Publicação, secrets e SQL em produção continuam passos do dono.

### Arquitetura e responsabilidades

```
iPhone/desktop (js/inbox.js) ── JWT do dono ──▶ função "rac-inbox" (Supabase Edge) ── HMAC (canal v1) ──▶ Worker "rac-inbox-worker" (Cloudflare) ── TLS 993 ──▶ iCloud IMAP
        ▲                                         │  lê a credencial do Vault (conexão direta, schema privado)
        └── lê o cache (RLS, como o dono) ◀──── Postgres ◀── grava cabeçalhos e cursor (só a função)
```

| Peça | Faz | Não faz |
|---|---|---|
| **Navegador** | Mostra a lista (do cache, por RLS), pede sincronizar/ler/baixar só com IDs, UID e o caminho da parte | Nunca vê a senha, o nome IMAP da pasta decide por ele, nem fala com o Worker |
| **Função `rac-inbox`** | Confere o JWT e o MFA; lê a credencial do Vault; assina e chama o Worker; filtra a resposta (esquema fechado); grava o cache e o cursor; trava por conta | Não usa `service_role`; não devolve nem registra a credencial |
| **Worker** | Verifica a assinatura e o nonce; abre TLS com o iCloud; roda só comandos de leitura; devolve dados de esquema fechado | Não guarda nada (nem senha, nem e-mail, nem KV/D1/R2); não tem `service_role`; não aceita token do usuário |
| **Vault** | Guarda o segredo cifrado | — |

### Canal assinado (autenticação entre serviços, separada da do usuário)

`POST <worker>/v1/op` com cabeçalhos `X-RAC-Key-Id` (`k1`/`k2`), `X-RAC-Timestamp` (±60 s), `X-RAC-Nonce` (16–43 caracteres base64url), `X-RAC-Operacao` e `X-RAC-Assinatura` (`v1=` + HMAC-SHA256). A string assinada é `rac-canal-v1 \n POST \n /v1/op \n chave \n instante \n nonce \n operação \n sha256(corpo)`: **instante, nonce, operação e corpo ficam presos à assinatura**. Ordem no Worker: corpo lido com limite (4 KiB) → assinatura → **só então** o nonce é consumido num Durable Object (uso único, retenção ≥ 2 janelas; replay = 409; registro fora do ar = 503 e a operação **não** acontece) → esquema fechado do corpo → operação. A credencial iCloud vai **no corpo**, por HTTPS, só nesta chamada; a função não segue redirecionamento (`redirect: "error"`) e usa tempo limite de 40 s. Um **vetor de teste fixo** (mesma chave, instante, nonce e corpo) prova que o lado Supabase e o Worker produzem a mesma assinatura.

### Fluxo de autenticação (uma operação)
1. Navegador → função: JWT do dono (+ 2ª etapa se houver fator). 2. A função confere o JWT no Supabase e o MFA; valida o pedido (esquema fechado, só IDs). 3. Lê o segredo do Vault por conexão direta ao Postgres. 4. Assina e envia ao Worker. 5. O Worker valida, faz **uma** tentativa de `LOGIN` e executa. 6. A função **marca a credencial como inválida** se o provedor recusou (`autenticacao_recusada`); qualquer outro erro vira código fechado. Nenhum texto do servidor, do provedor ou do banco chega ao navegador.

### Fluxo de sincronização (`sincronizar_pasta`)
O iCloud **não tem IDLE, CONDSTORE nem QRESYNC**: nada depende deles; é *polling* por comparação de UIDs.
1. A função trava a conta (`pg_try_advisory_lock`, de sessão); se já há sincronização, responde `sincronizacao_em_andamento`.
2. Pede ao Worker as **últimas 50** mensagens (cabeçalhos) e o par UIDVALIDITY/UIDNEXT (comandos `EXAMINE` e `FETCH`, somente leitura).
3. Compara com o cursor guardado (`inbox_sincronizacao`): `primeira_leitura`, `sem_mudanca`, `novas_mensagens`, `uidvalidity_mudou` ou `uidnext_regrediu`. **UIDVALIDITY mudou ou UIDNEXT regrediu = apaga o cache da pasta e relê** (os UIDs antigos deixaram de valer).
4. Se há mais mensagens novas que a janela, busca **desde o cursor em páginas de 100** (até 5 por chamada); o cursor só avança até onde chegou e a resposta diz `mais: true` (basta sincronizar de novo).
5. Grava numa transação: *upsert* por `uidvalidity:uid` (**idempotente**, sem duplicar), atualiza flags (lida, sinalizada, respondida), **remove do cache o que o provedor não devolve mais** dentro da faixa lida, atualiza total e não lidas da pasta e o cursor. Falha no meio desfaz tudo.
6. Registra o resultado (`inbox_sincronizacao`: tipo, duração, falhas seguidas, código do erro) e o estado da conta; libera o travamento. A primeira vez lista as pastas (`listar_pastas`) e sincroniza a de **entrada**.

### O que é guardado e o que NÃO é (migration 053)
**Guardado (cache de cabeçalhos, só a função escreve):** data de recebimento, assunto, remetente, até 20 destinatários, flags, tamanho, "anexo provável" (pelo tipo `multipart/mixed`), `Message-ID`, nome legível da pasta. **NUNCA guardado:** corpo, HTML, prévia, anexos, imagens, credencial. O corpo e os anexos são lidos **sob demanda** a cada abertura (`ler_mensagem`, `baixar_anexo`), chegam em memória e **não ficam em lugar nenhum**. O HTML **nunca** chega ao navegador: o Worker o converte em texto, e a tela mostra o texto como texto (sem imagem remota, formulário ou script). Anexo: até **3 MiB** codificados; vira arquivo no aparelho com nome saneado; tipo perigoso (HTML, XML, SVG, script) vira binário genérico. **Retenção:** o cache é reconstruível e apagável pelo dono sem tocar na caixa; apagar a conta apaga tudo em cascata. O backup do site (só-exportar) passa a incluir esses cabeçalhos. A decisão do Documento 10 (seção 5.1) sobre retenção de **corpos e anexos** continua em aberto e **nada disso é guardado**.

### Limitações conhecidas
- Ler no RAC **não marca como lida** no provedor (só leitura); a tela mostra o estado que o provedor informou na última sincronização. Marcar/arquivar/excluir são etapas posteriores.
- A contagem de **não lidas** de uma pasta é das mensagens carregadas (a janela), não do total no provedor. Melhoria possível: `STATUS (UNSEEN)`, também de leitura (ainda não implementada).
- **Sem sincronização automática**: só ao tocar em Sincronizar (agendamento e *polling* são etapa posterior).
- O Cloudflare Workers **Free** limita a CPU a ~10 ms por requisição; ler e converter mensagens pode estourar. Se acontecer, o plano Paid (US$ 5/mês) é **decisão de custo do dono**. Não confirmado até haver teste real.
- `PermanentFlags`/`READ-WRITE` do `EXAMINE` do iCloud: a garantia de somente leitura é do Worker (lista fechada de comandos, `EXAMINE` e `BODY.PEEK`), não do servidor.

### Configuração e secrets (os valores NUNCA entram no repositório nem no chat)
| Nome | Onde | Observação |
|---|---|---|
| `RAC_CANAL_K1` | **Supabase → Edge Functions → Secrets** e **secret do Worker** (mesmo valor) | chave do canal, aleatória, ≥ 32 caracteres (ex.: `openssl rand -base64 48`) |
| `RAC_CANAL_K2` | idem, só durante uma rotação | a função assina com `k1`; na rotação passa a assinar com `k2` |
| `RAC_INBOX_WORKER_URL` | Supabase → Edge Functions → Secrets | só `https://<worker>.workers.dev` (sem caminho, sem credencial) |
| `NONCES` | binding do Durable Object (`wrangler.jsonc`) | registro anti-replay |

Sem `RAC_INBOX_WORKER_URL` e `RAC_CANAL_K1` a função responde `worker_nao_configurado` e nada é enviado.

### Ordem para colocar em produção (cada passo é do dono; o Claude não executa SQL, secrets, função nem deploy)
1. **SQL:** ~~rodar a 053~~ **feito em 15/11/2026** (051, 052 e 053 estão no banco).
2. **Worker:** publicar `experimentos/rac-inbox-worker` (branch `claude/inbox-p7-worker`, commit `9818ea1`) numa conta Cloudflare **do dono**, no computador dele: `npx wrangler login`, depois `npx wrangler deploy` dentro da pasta, e anotar a URL `https://rac-inbox-worker.<conta>.workers.dev` que a Cloudflare mostrar. A chave do canal deve ser gerada e colocada **nos dois lados sem aparecer na tela, no histórico nem em argumento de processo**:
   ```
   umask 077; K=$(openssl rand -base64 48 | tr -d '\n')
   printf %s "$K" | npx wrangler secret put RAC_CANAL_K1            # Cloudflare (lê da entrada padrão)
   printf 'RAC_CANAL_K1=%s\nRAC_INBOX_WORKER_URL=%s\n' "$K" "https://rac-inbox-worker.<conta>.workers.dev" > /dev/shm/rac.env
   supabase secrets set --env-file /dev/shm/rac.env --project-ref <ref do projeto>; shred -u /dev/shm/rac.env; unset K
   ```
   (`printf` é comando interno do shell, então a chave não vai em argumento de processo; o arquivo temporário fica só em memória, com permissão restrita, e é destruído.) A publicação pelo workflow do Desenho B exige um workflow e um pin novos (`.github/workflows/`, decisão do dono).
3. **Secrets da função:** `RAC_CANAL_K1` (mesmo valor do Worker) e `RAC_INBOX_WORKER_URL`.
4. **Função:** republicar `rac-inbox` (v2) com `verify_jwt=true`.
5. **Site:** mesclar o PR da branch `claude/inbox-i2-sync` (versão `2026-11-15.2`) e esperar o Pages.
6. **Primeiro teste real** (abaixo).

### Registro de 15/11/2026 — tentativa de publicar o Worker (interrompida por falta de login)
- **053 aplicada em produção** (informado pelo dono; colunas e índice conferidos no banco pelo ChatGPT).
- **Worker NÃO publicado.** `wrangler whoami` no ambiente do Claude respondeu *"You are not authenticated"* (sem login Cloudflare, sem token no ambiente). Pelo combinado, o Claude não pede token no chat: o login é do dono. **URL do Worker: ainda não existe.**
- **Secrets NÃO cadastrados** (`RAC_CANAL_K1` nos dois lados, `RAC_INBOX_WORKER_URL`). O ambiente do Claude não tem a CLI nem a API de gerenciamento do Supabase (bloqueadas pela política do projeto) e não tem conector do Supabase. **Nenhuma chave foi gerada**: um valor gerado aqui não teria como chegar aos dois serviços sem passar pelo Claude.
- **Validação do canal em runtime real, em modo local (workerd)** — *não é o Worker publicado*: 17 de 17 verificações ok com o Worker rodando no workerd e assinadas pelo código do lado Supabase (`canal.ts`): sem assinatura, assinatura inválida, corpo adulterado, operação trocada, instante 120 s no passado e no futuro, chave `k2` sem segredo, assinatura válida (corpo inválido de propósito, sem tocar na Apple), **replay**, nonce novo aceito, **10 pedidos simultâneos com o mesmo nonce = 1 aceito e 9 replays** (atomicidade do Durable Object com SQLite), **sem o Durable Object = 503 e a operação não acontece**, corpo acima de 4 KiB, tipo de conteúdo errado, rotas e métodos. Os logs do wrangler e da execução não continham a credencial de teste nem a chave. A chave usada era descartável e foi apagada.
- **Ainda não provado:** o Worker publicado na Cloudflare, a chave de produção igual nos dois serviços, a chamada real função → Worker, TLS e login reais com o iCloud.

### Roteiro de validação real (a partir de 15/11/2026, tarde)
**Carimbos de versão** (aparecem na resposta de `testar_canal` e no botão **Testar conexão**): função `rac-inbox@i2.2` e Worker `rac-inbox-worker@p7.2`. Se o carimbo que voltar for outro, **o código no ar não é o desta branch**. Para a função, vale também `supabase functions download rac-inbox` e comparar `sha256sum` com o código do commit publicado.

**Novidades desta etapa (código pronto, publicação do dono/ChatGPT):** operação **`ping`** no Worker e **`testar_canal`** na função (provam o canal SEM Vault, SEM banco, SEM credencial e SEM abrir o IMAP); o registro da função passa a incluir o **código fechado do Worker** (`detalhe`, ou `http_NNN` quando a resposta não é JSON, ex.: página de erro da Cloudflare) e o botão **Testar conexão** (canal e depois login no iCloud, sem ler nada).

**1) Publicar o Worker p7.2 — PowerShell, no computador do dono:**
```powershell
cd <pasta do repositório>\experimentos\rac-inbox-worker
git fetch origin; git switch claude/inbox-p7-worker; git pull --ff-only
git rev-parse --short HEAD          # deve ser o commit informado no relatório
npx wrangler whoami                 # confirma a conta
npx wrangler deploy                 # a URL deve ser https://rac-inbox-worker.raynercarvalho.workers.dev
```
**2) Publicar a função v5** (ChatGPT, pelo conector): código de `supabase/functions/rac-inbox` no SHA do PR #34 informado no relatório; `verify_jwt=true`. Os secrets `RAC_CANAL_K1` e `RAC_INBOX_WORKER_URL` já existem e **não** mudam.

**3) Testes reais, em ordem (console do navegador do site de produção, logado com o MFA).** Cole uma vez e rode as linhas seguintes; só aparecem status e códigos, nunca credencial:
```js
window.racTeste = async (corpo) => { const sb = await RACdados.cliente(); const r = await sb.functions.invoke("rac-inbox", { body: corpo }); if (!r.error) return r.data; const c = r.error.context; return { http: c && c.status, ...(c && c.json ? await c.json() : {}) }; };
racTeste({ operacao: "testar_canal" }).then(console.log)      // A) canal: sem Apple, sem Vault
```
```js
RACdados.cliente().then(async (sb) => { window.CONTA = (await sb.from("inbox_contas").select("id").limit(1)).data[0].id; racTeste({ operacao: "testar_conta", conta_id: CONTA }).then(console.log); })   // B) login no iCloud (LOGIN e LOGOUT; nada é lido)
```
```js
racTeste({ operacao: "listar_pastas", conta_id: CONTA }).then(console.log)   // C) lista as pastas e grava SÓ o nome delas em inbox_pastas (nenhuma mensagem)
```
Depois do merge do PR #34, o mesmo A e B fica no botão **Testar conexão**, e C e a sincronização no botão **Sincronizar**.

| Teste | Resposta que aprova | Se falhar |
|---|---|---|
| A · `testar_canal` | `{ok:true, canal:"ok", funcao:"rac-inbox@i2.2", worker:"rac-inbox-worker@p7.2"}` | `503 worker_nao_configurado`: `RAC_INBOX_WORKER_URL` ou `RAC_CANAL_K1` ausentes/ inválidos no Supabase. `502 canal_recusado`: chaves diferentes entre Supabase e Cloudflare (`detalhe: assinatura_invalida`), Worker sem o secret (`chave_desconhecida`) ou relógio (`timestamp_fora_da_janela`). `502 servico_indisponivel`: ver o `detalhe` no log da função (`http_404` = URL errada; `http_503`/`1102` = limite do Worker; `registro_indisponivel` = Durable Object; `canal_falhou` = rede). |
| B · `testar_conta` | `{ok:true}` | `422 credencial_invalida`: a Apple recusou (marca a credencial como inválida; gerar nova senha de app e regravar). `409 credencial_ausente`, `500 credencial_corrompida`: regravar a credencial. `502 servico_indisponivel` com `detalhe` `conexao_falhou`/`timeout`/`saudacao_invalida`/`login_desabilitado`: problema entre o Worker e o iCloud. |
| C · `listar_pastas` | `{ok:true, pastas:[{id,nome,uso}…]}` com a caixa de entrada (`uso:"entrada"`) | `detalhe` do log, como acima. |

**Onde ver os logs:** função, em *Supabase → Edge Functions → rac-inbox → Logs* (linhas `{"rac_inbox":{"operacao","codigo","status","detalhe"}}`, sem credencial); Worker, em `npx wrangler tail rac-inbox-worker` (na pasta do Worker) durante o teste (a observabilidade fica desligada de propósito).

**A integração é aprovada quando:** A, B e C respondem como acima; o carimbo é `i2.2`/`p7.2`; repetir A e B também passa (nonce novo aceito); nenhuma credencial aparece no console, nos logs da função nem no `wrangler tail`; `inbox_pastas` tem as pastas e `inbox_mensagens_ref` continua vazia até a primeira sincronização; depois a **sincronização** traz as mensagens, abrir uma mostra o texto, sincronizar de novo não duplica e **nada na caixa da Apple muda** (nenhuma mensagem marcada como lida, movida ou apagada).

### Primeiro teste real (critérios; só contam com a Apple de verdade)
Logado com o MFA: Sincronizar → a primeira leitura traz as mensagens → abrir uma mensagem mostra o texto → baixar um anexo pequeno → sincronizar de novo não duplica → conferir no SQL (`select count(*) from public.inbox_mensagens_ref;`; `select tipo_ultima, falhas_seguidas, erro from public.inbox_sincronizacao;`) e que a senha não aparece em nenhuma resposta, tela ou log. Se o login for recusado, a conta mostra "Credencial recusada pelo provedor" (gerar nova senha de app e substituir).

### Evidências desta entrega (o que foi e o que NÃO foi provado)
| Item | Prova | Tipo |
|---|---|---|
| Assinatura do canal, janela de tempo, chave desconhecida/fraca, corpo ou operação adulterados | `tests/rac_inbox_worker.test.mjs` (branch do Worker), `tests/inbox_canal.test.mjs` + **vetor fixo igual nos dois lados** | simulado |
| Replay (mesmo nonce), registro fora do ar = falha fechada | idem (Durable Object de mentira) | simulado |
| IMAP: só verbos de leitura; `BODY.PEEK`; login uma vez; falhas e tempo limite | servidor IMAP **falso** em memória | simulado |
| Sincronização: cursor, janela, buraco de UIDs, remoção, UIDVALIDITY, idempotência, concorrência | `tests/inbox_sync_servico.test.mjs` | simulado (Worker e banco de mentira) |
| SQL do cache e do cursor, RLS, isolamento, transação, cascata | `tests/inbox_sync_sql.test.mjs` | **PostgreSQL real de teste (PGlite)**, não o Supabase |
| Tela: lista, sincronizar, leitura, anexo, estados | `tests/inbox_tela.test.mjs` | DOM de mentira (não é o navegador) |
| `ping`/`testar_canal` e o cliente real da função contra o Worker no workerd **local**: 11 de 11 (carimbos, chave errada, sem Durable Object, `http_404`, 10 simultâneos = 1 aceito); a bateria de 17 do canal também passa com o Worker novo | `ping_real` e `canal_real` (roteiros locais) | runtime real (workerd), **local**, não o Worker publicado |
| TLS com o iCloud, **autenticação real**, leitura de pastas e mensagens reais, persistência no Supabase real, tela no iPhone com mensagens reais | — | **NÃO provado** (depende dos passos do dono) |
| Nenhuma credencial em resposta, erro, log, tela ou teste | varreduras de texto e provas de vazamento nos testes | simulado |

## Testes

Cinco arquivos (I1; os da I2 estão na seção acima e em "Evidências"): `tests/inbox_nucleo.test.mjs` (14: regras, contrato, cursor, credencial), `tests/inbox_tela.test.mjs` (7: estados, exemplo, fluxo da credencial, desenho), `tests/inbox_sql.test.mjs` (11, PGlite: modelo da 051 e isolamento), `tests/inbox_cofre_sql.test.mjs` (12, PGlite com Vault de mentira: ciclo da credencial, isolamento, privilégios, substituição sem órfão, exclusão, falha do Vault sem alternativa, trava MFA, catálogo) e `tests/inbox_cofre_servico.test.mjs` (12: serviço da função com cofre e Worker de mentira: nada vaza em resposta, erro ou registro; conta sem credencial não chega ao Worker; credencial inválida vira erro controlado; falha do cofre não tem alternativa; MFA; sem estado global).
Limites: PGlite prova o PostgreSQL, **não** o Supabase real nem o Vault real; o serviço é provado com dependências de mentira, **não** com o Deno nem com a conexão real ao banco (`index.ts` só tem teste de texto). A aplicação em produção, a publicação da função e a verificação do Vault real são do dono.

## O que falta (a partir de 15/11/2026)

**Depende do dono (nesta ordem):** ~~aplicar a 053~~ (feito); publicar o Worker; cadastrar os secrets (`RAC_CANAL_K1` nos dois lados e `RAC_INBOX_WORKER_URL`); republicar a função (v2); mesclar o PR do site; fazer o **primeiro teste real** e conferir os critérios acima. Só depois disso a autenticação real com a Apple e a leitura real estarão validadas.

**Ainda não implementado (fora desta entrega):** envio (SMTP), responder, encaminhar, arquivar, excluir, marcar como lida (escritas na caixa); sincronização automática; `STATUS (UNSEEN)` para contar não lidas no provedor; busca; categorias (I4); Gmail e Outlook (I3); decisão sobre **retenção de corpos e anexos** (Documento 10, seção 5.1); remoção do Worker de prova e dos Environments antigos (autorização futura).
