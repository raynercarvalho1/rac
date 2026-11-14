# RAC Inbox · I1 — Fundação (documento técnico)

Registro do que foi **efetivamente implementado** na fase I1 do [Documento 10](planejamento/10-rac-inbox.md). Atualizado em 14/11/2026.
Estado: **código e testes prontos; migrations 051 e 052 PREPARADAS e NÃO aplicadas em produção; função `rac-inbox` escrita e testada, NÃO publicada; nada publicado.**

## O que já funciona no RAC

- Página **Inbox** (`#inbox`), só do dono (a Fernanda não vê; o item não tem `casa:true` em `js/rotas.js`), no menu na área "Hoje".
- **Desktop:** uma superfície com três áreas. Lateral: botão de nova mensagem (desligado), **Caixas** (unificada com contagem parcial quando falta conexão; cada conta com avatar, endereço e ponto de estado; as pastas da conta aberta com ícone e contagem) e **Categorias** (do Documento 10; desligadas, etapa I4). Lista: título e contagem, busca (desligada), filtros Todas, Não lidas e Com anexo, mensagens **agrupadas por data** (Hoje, Ontem, Esta semana, Anteriores) com remetente, assunto, prévia de duas linhas, horário, clipe de anexo e indicador de não lida. Leitura: barra de ações (responder, responder a todos, encaminhar, arquivar, excluir, mais; todas desligadas), assunto, remetente com endereço, destinatários, data por extenso, corpo com largura de leitura confortável e **anexos como arquivos** (tipo, nome e tamanho). Em janela estreita (até 1180 px, tablet) a lateral vira **gaveta**, para a leitura não ficar espremida.
- **iPhone (até 860 px):** a **lista ocupa a tela** com título grande, busca e filtros; a **leitura** e as **caixas** abrem em **tela própria** (voltar no topo); na leitura, as ações ficam numa **barra inferior** com alvos de 44 px; áreas seguras (`env(safe-area-inset-*)`) respeitadas. Temas claro e escuro vêm dos tokens `--rac-*`: o Inbox **não define token nem cor nova** (testado).
- Estados: carregando, vazio, erro (com "Tentar de novo"), **estrutura pendente** (migration 051 ainda não aplicada) e **desconectado** (conta cadastrada, sem conexão: aparece como "Nova"/"Desconectada", nunca como caixa vazia; a caixa unificada marca a contagem como parcial).
- **Cadastro de conta** (provedor, nome e endereço; só iCloud): é a única gravação **da tela** em tabela (`inbox_contas`); o cadastro não tem campo de senha.
- **Conexão da conta (credencial no cofre):** dentro da conta, mostra o estado (sem credencial, guardada, recusada pelo provedor) e oferece **Conectar / Substituir senha / Desconectar e remover a credencial**. O formulário (login do ID Apple e senha **específica de app**) **só aparece com o serviço publicado**; hoje a tela diz que a conexão será liberada na etapa I2 e **nada é pedido nem guardado**. Detalhes na seção "Custódia da credencial no Vault".
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
| `supabase/functions/rac-inbox/` | Função de servidor (contrato, serviço puro, ligação ao Deno); **não publicada** |
| `tests/inbox_nucleo.test.mjs`, `tests/inbox_sql.test.mjs`, `tests/inbox_tela.test.mjs`, `tests/inbox_cofre_sql.test.mjs`, `tests/inbox_cofre_servico.test.mjs` | Testes da fase |

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
Interface RAC (js/inbox.js)  →  inbox-servico.js  →  função "rac-inbox" (Supabase Edge, NÃO criada)  →  Worker isolado (POC, pins, OIDC, uso único)  →  provedor
        │                                                      │
        └── metadados (RLS, como o dono)  ←── Supabase ────────┘   (o serviço grava o estado de sincronização com o JWT do dono; nunca com service_role)
```

Implementado agora (e testado):
1. **Contrato** (`NUCLEO.INB_OPERACOES`, `NUCLEO.inbPedido`): só `testar_conta`, `listar_pastas` e `estado_pasta`, **todas de leitura**, só com IDs (UUID). Verbo de escrita (enviar, responder, mover, excluir, marcar, anexar, criar pasta/filtro, `store`, `expunge`, `append`…) é recusado com `escrita_fora_do_escopo`; qualquer campo de credencial (`usuario`, `senha`, `token`, `authorization`…) com `credencial_proibida`; campo extra, ID inválido e operação desconhecida também têm código fechado.
2. **Cliente** (`inboxChamar`): valida antes de qualquer rede; **enquanto `INBS.publicado` for `false` não envia nada** e devolve `servico_nao_publicado` (nada é simulado). Falhas HTTP viram código (`sem_login`, `servico_nao_publicado`, `limite`, `servico_indisponivel`, `rede`); a mensagem do servidor nunca é mostrada.
3. **Normalizador** (`NUCLEO.inbRespostaEstado`): converte a resposta de `estado_pasta` na linha de `inbox_sincronizacao` com **esquema fechado**; o formato é exatamente o da **P6 real** (conferido com a resposta de 14/11/2026: UIDVALIDITY 1752612613, UIDNEXT 4, `primeira_leitura`; 2ª rodada `sem_mudanca`). `NUCLEO.inbCursor` repete as regras de comparação do Worker.

Preservado, sem alteração: Worker, pins (P1, P2, P6), OIDC, uso único; o Worker continua **isolado da `main`**.

### Fatos que moldam o desenho (evidência real)

- O iCloud respondeu **`[READ-WRITE]`** ao `EXAMINE` (P6, rodada 1). **Não se presume somente leitura do servidor.** A garantia é do Worker: lista fechada de comandos, só `BODY.PEEK`, sem `STORE`/`COPY`/`MOVE`/`EXPUNGE`/`APPEND`/`SELECT`. A I1 não adiciona comando de escrita nenhum; a tela diz isso na matriz de paridade.
- Sem CONDSTORE, QRESYNC, IDLE, UIDPLUS ou MOVE no iCloud: a sincronização é por UIDVALIDITY/UIDNEXT (polling, na I2 em diante).
- `PERMANENTFLAGS` veio "nao_vazio": tratar antes de qualquer prova que altere a caixa (P3).

## Custódia da credencial no Vault (implementada; NÃO publicada)

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

### Como colocar para funcionar (só com autorização do dono; **nada disto foi feito**)
Ordem: aplicar `051` e `052` (002 e 022 antes; 050 opcional) → conferir (`conferir()`, privilégios e `log_parameter_max_length_on_error`) → publicar a função `rac-inbox` → trocar `INBS.publicado` para `true` no site. A **leitura de e-mail** ainda depende do canal assinado com o Worker (P7), fora desta entrega.

## Testes

Cinco arquivos: `tests/inbox_nucleo.test.mjs` (14: regras, contrato, cursor, credencial), `tests/inbox_tela.test.mjs` (7: estados, exemplo, fluxo da credencial, desenho), `tests/inbox_sql.test.mjs` (11, PGlite: modelo da 051 e isolamento), `tests/inbox_cofre_sql.test.mjs` (12, PGlite com Vault de mentira: ciclo da credencial, isolamento, privilégios, substituição sem órfão, exclusão, falha do Vault sem alternativa, trava MFA, catálogo) e `tests/inbox_cofre_servico.test.mjs` (12: serviço da função com cofre e Worker de mentira: nada vaza em resposta, erro ou registro; conta sem credencial não chega ao Worker; credencial inválida vira erro controlado; falha do cofre não tem alternativa; MFA; sem estado global).
Limites: PGlite prova o PostgreSQL, **não** o Supabase real nem o Vault real; o serviço é provado com dependências de mentira, **não** com o Deno nem com a conexão real ao banco (`index.ts` só tem teste de texto). A aplicação em produção, a publicação da função e a verificação do Vault real são do dono.

## O que falta para a I2 (leitura de e-mails)

1. Autorização do dono para **aplicar a 051 e a 052** (e a 050, se quiser o catálogo), conferir (`inbox_cofre.conferir()`, privilégios do cofre, `log_parameter_max_length_on_error`) e **publicar a função `rac-inbox`**; depois, `INBS.publicado = true` no site.
2. **Canal assinado com o Worker (P7)**: um Worker de produto (o atual é prova de infraestrutura e só aceita token do GitHub) e a assinatura da tarefa entre a função e ele. Sem isso a função responde `worker_nao_configurado` e a credencial guardada ainda não é usada.
3. Sincronização de pastas (`listar_pastas` e `estado_pasta` → `inbox_pastas` e `inbox_sincronizacao`) e, depois, a lista real de mensagens (cabeçalhos mínimos) no lugar do exemplo.
4. Decidir a retenção de qualquer cópia de conteúdo (Documento 10, seção 5.1) antes de guardar um byte de e-mail.
