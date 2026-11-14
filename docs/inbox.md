# RAC Inbox · I1 — Fundação (documento técnico)

Registro do que foi **efetivamente implementado** na fase I1 do [Documento 10](planejamento/10-rac-inbox.md). Atualizado em 14/11/2026.
Estado: **código e testes prontos; migration 051 PREPARADA e NÃO aplicada em produção; Edge Function não criada; nada publicado.**

## O que já funciona no RAC

- Página **Inbox** (`#inbox`), só do dono (a Fernanda não vê; o item não tem `casa:true` em `js/rotas.js`), no menu na área "Hoje".
- Desktop: **uma superfície com três áreas** — lateral (caixa unificada, contas com selo de estado, pastas, categorias), lista (remetente, assunto, prévia e horário) e leitura à direita.
- iPhone (até 860 px): a **lista ocupa a tela**; a leitura abre em **tela própria** (voltar no topo, ações em botões de 44 px), as caixas também; áreas seguras (`env(safe-area-inset-*)`) respeitadas. Temas claro e escuro vêm dos tokens `--rac-*` (nenhuma cor escrita no CSS do Inbox).
- Estados: carregando, vazio, erro (com "Tentar de novo"), **estrutura pendente** (migration 051 ainda não aplicada) e **desconectado** (conta cadastrada, sem conexão: aparece como "Nova"/"Desconectada", nunca como caixa vazia; a caixa unificada marca a contagem como parcial).
- **Cadastro de conta** (provedor, nome e endereço; só iCloud): é a **única gravação** da tela (`inbox_contas`). Nenhum campo de senha existe.
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
| `tests/inbox_nucleo.test.mjs`, `tests/inbox_sql.test.mjs`, `tests/inbox_tela.test.mjs` | Testes da fase |

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

## Decisão do dono que bloqueia a I2: custódia da credencial

Regras já fixas: **credencial por operação, nunca persistida no banco; nenhum segredo no JavaScript do navegador.** Elas **não se cumprem juntas** se o dono digitar a senha de app no formulário a cada operação (a senha passaria pelo JavaScript). Por isso a I1 **não tem campo de senha** e o contrato recusa credencial. As saídas possíveis (nenhuma foi escolhida nem implementada):

| Opção | O que é | Prós / contras |
|---|---|---|
| A. Cofre do servidor (P7) | A senha de app fica no Vault do Supabase; só uma função lê, autentica o dono, assina (HMAC) uma tarefa curta e chama o Worker; o Worker recebe a credencial só para aquela operação (Documento 10, seções 12.8 e 12.9) | Cumpre "nenhum segredo no navegador"; exige migration, segredo do canal, função publicada e autorização de cada passo; a credencial fica **cifrada no cofre** (não é "persistida no banco" em texto, mas é guardada) |
| B. Por operação, digitada | O dono informa a senha a cada uso; ela vai à função e ao Worker e não é guardada | Não guarda nada; **a senha passa pelo navegador**, contra a regra; fricção alta |

A I2 só começa depois dessa escolha (e das autorizações próprias: migration, função, segredo do canal).

## Testes

`tests/inbox_nucleo.test.mjs` (12), `tests/inbox_sql.test.mjs` (11, PGlite) e `tests/inbox_tela.test.mjs` (6). O de banco prova, num Postgres de verdade: RLS e 8 políticas; **outro usuário e a casa não leem, não gravam, não alteram e não apagam nada do dono em nenhuma das 4 tabelas**; o dono não aponta linha para conta alheia; anon sem privilégio; trava MFA (aal2); restrições; gatilhos; cascata; nenhuma coluna de credencial ou conteúdo; catálogo. Limite: PGlite prova o PostgreSQL, **não** o Supabase real nem a aplicação em produção.

## O que falta para a I2 (leitura de e-mails)

1. Decisão da custódia da credencial (acima) e a P7 (Vault, função e HMAC), com autorização de migration e publicação.
2. Aplicar a 051 em produção (e a 050, se o dono quiser o catálogo).
3. Função `rac-inbox` (autentica o dono, resolve a credencial, assina e chama o Worker) e um Worker de produto (o atual é prova de infraestrutura); trocar `INBS.publicado`.
4. Sincronização de pastas (`listar_pastas` e `estado_pasta` → `inbox_pastas` e `inbox_sincronizacao`) e, depois, a lista real de mensagens (cabeçalhos mínimos) no lugar do exemplo.
5. Decidir a retenção de qualquer cópia de conteúdo (Documento 10, seção 5.1) antes de guardar um byte de e-mail.
