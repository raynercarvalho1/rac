# Publicar o Worker `rac-inbox-worker` pelo GitHub Actions

Workflow: `.github/workflows/rac-inbox-worker-publicar.yml` (manual, só na `main`). Ferramenta fixada: `experimentos/rac-inbox-worker-ferramenta/` (Wrangler `4.161.0`, lockfile próprio). Worker publicado: `experimentos/rac-inbox-worker/` (hoje `rac-inbox-worker@p9.0`: IMAP somente leitura + SMTP). Não tem relação com o Worker de prova iCloud (`rac-icloud-auth-poc`); só reaproveita os mesmos princípios de segurança de `docs/icloud-poc-deploy.md`.

## O que o workflow faz (e o que nunca faz)
1. Recebe só **um commit completo (40 caracteres)**. Confere que ele existe, está na **história da `main`** e tem o CI `testes` **aprovado**.
2. No job **`verificar`** (sem Environment e sem secrets): baixa o commit como *dados*, confere a lista fechada de arquivos do Worker, a configuração (nome `rac-inbox-worker`, binding `NONCES`, classe `NonceUnico`, migração `v1`), roda os testes do Worker, instala o Wrangler do lockfile (versão e integridade conferidas), empacota **sem publicar** (`--dry-run`), inspeciona o pacote e calcula o sha256. O carimbo de versão pedido precisa estar no pacote.
3. No job **`publicar`** (Environment `cloudflare-production`, com os secrets da Cloudflare): **não baixa o commit do Worker**; só recebe o pacote conferido, reconfere o hash, confere o token, lê o estado anterior (nomes de secrets e deployment atual, nunca valores), publica com a configuração escrita no próprio workflow, e confirma versão, deployment ID, que `RAC_CANAL_K1` continua no Worker e a saúde.
4. **Nunca** executa `wrangler secret put`, gera chave, troca ou apaga secret, binding ou Durable Object. Nenhum valor secreto vai a log, artefato ou output. Como isso foi auditado (Wrangler `4.161.0`, lendo o código dele):
   - **Secrets:** o `deploy` sempre inclui `keep_bindings: secret_text, secret_key` (`keepSecrets: true` fixo), então os secrets existentes, como `RAC_CANAL_K1`, são herdados mesmo sem estar no arquivo.
   - **Variáveis de texto do painel:** sem `--keep-vars` o `deploy` as apagaria; por isso o workflow usa `--keep-vars`.
   - **Limite conhecido:** bindings de outros tipos que não estão no arquivo (KV, D1, R2, serviços) **não** são preservados. O Worker só tem `NONCES` e o secret; se o dono acrescentar algo no painel, declare no `wrangler.jsonc` e na configuração fixa do workflow antes de publicar.
   - **Migração:** o Wrangler lê o `migration_tag` do Worker publicado; só com `v1` exatamente ele considera a migração aplicada e não envia nada sobre `NonceUnico`. O workflow confere isso **antes** de publicar e para se a tag for outra ou ausente.
5. A saúde **não assina** pedido, **não usa credencial iCloud** e **não envia e-mail**: um POST sem assinatura em `/v1/op` deve voltar `401 cabecalhos_invalidos` (no ar e com a chave do canal configurada); `503 canal_nao_configurado` significaria sem o secret `RAC_CANAL_K1`; `GET` deve voltar `404`.

## Configuração manual (uma vez, só o proprietário)
### 1. Token e ID da conta Cloudflare
- No painel da Cloudflare: **My Profile → API Tokens → Create Token → Custom token**.
- Permissão: **Account → Workers Scripts → Edit** (só ela). Conforme a documentação da Cloudflare, os endpoints que o workflow consulta (secrets, deployments, subdomínio `workers.dev`) aceitam Workers Scripts **Write** ou Read; a leitura de `workers/services/<nome>` é a mesma que o próprio `wrangler deploy` faz. **Ainda não foi exercitado com a sua conta**: a primeira execução prova isso; se o token não puder ler, o workflow para antes de publicar e diz o motivo. Escopo de conta: **só a sua conta**. Defina uma data de expiração. Não use "Global API Key" nem permissões de DNS, zonas ou administração.
- O **Account ID** está em **Workers & Pages → Overview** (coluna da direita) ou na URL do painel.

### 2. Environment no GitHub
Repositório → **Settings → Environments → New environment** → nome exatamente **`cloudflare-production`**.
- **Deployment branches and tags → Selected branches and tags → Add rule → `main`** (assim nenhum workflow vindo de outra branch recebe os secrets).
- **Required reviewers**: marque você mesmo (o job `publicar` espera a sua aprovação; antes de aprovar, confira commit e sha256 no resumo do job `verificar`).
- **Environment secrets** (não Repository secrets): `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`, colados direto no GitHub. Nunca no chat, em commit ou issue.

### 3. Secret do canal
`RAC_CANAL_K1` já existe no Worker e na função `rac-inbox`; este workflow **não o toca**. Se o Worker ainda não existir (primeira publicação), rode com `exigir_secret_k1 = nao`, depois cadastre o secret no painel (Workers → `rac-inbox-worker` → Settings → Variables and Secrets → Add → tipo *Secret*, mesmo valor da função) e rode a saúde de novo (ou use o botão **Testar conexão** do RAC).

## Como executar pelo iPhone
1. No Safari, abra `https://github.com/raynercarvalho1/rac/actions/workflows/rac-inbox-worker-publicar.yml` (se faltar o botão, toque em **aA → Solicitar site para computador**).
2. Toque em **Run workflow**. **Branch: `main`** (obrigatório).
3. Preencha: **commit** = o SHA completo de 40 caracteres do commit da `main` com o CI verde (na página do commit, toque no SHA para copiar; ex.: o merge do PR #41 é `2351bc1066170c750a0a2688fe1601426fe54b9c`); **versao_esperada** = `rac-inbox-worker@p9.0`; **exigir_secret_k1** = `sim`. Toque em **Run workflow**.
4. Abra a execução. Quando o job **verificar** terminar, leia o resumo (commit, sha256, lista de arquivos). Se estiver certo, toque em **Review deployments → cloudflare-production → Approve and deploy**.
5. Ao terminar o job **publicar**, o **resumo** da execução mostra: commit, sha256, **deployment ID**, version ID, deployment anterior, `RAC_CANAL_K1` antes e depois (só o nome) e o resultado da saúde.

## Como conferir o deployment
- **No resumo do Actions** (acima); a execução fica verde só se a saúde passar.
- **Na Cloudflare**: Workers & Pages → `rac-inbox-worker` → **Deployments** (o ID mais recente deve ser o do resumo).
- **No RAC** (conexão assinada de ponta a ponta): Inbox → Opções da conta → **Testar conexão**. A mensagem mostra a versão da função e do Worker (`rac-inbox-worker@p9.0`). Depois, **Testar envio (SMTP)** (sem e-mail) e, se aprovado, **Testar envio com e-mail de teste**.

## Rollback
O Worker guarda as versões anteriores; voltar não mexe em secrets nem no Durable Object.
- **Pelo painel (celular ou computador):** Cloudflare → Workers & Pages → `rac-inbox-worker` → **Deployments** → na versão anterior (ID registrado em "deployment anterior" no resumo) → **Rollback** → confirmar. Depois rode **Testar conexão** no RAC.
- **Pelo workflow:** execute-o de novo com o SHA de um commit **antigo da `main`** que tenha CI aprovado e use a `versao_esperada` desse commit (ex.: `rac-inbox-worker@p7.2`, se existir na `main`). Código que nunca foi mesclado na `main` não pode ser publicado por aqui.
- **Pela linha de comando** (opcional): `npx wrangler rollback <version-id>` com o seu login.

## Se algo falhar
| Mensagem | Causa provável |
|---|---|
| "Este workflow só roda a partir da main" | A execução foi iniciada de outra branch. |
| "Esse commit não pertence à história da main" / "CI … não está aprovado" | SHA errado, abreviado ou de commit sem CI verde. |
| "A lista de arquivos do Worker não é a esperada" / "wrangler.jsonc … difere" | Alguém mudou a pasta do Worker; a lista fixa do workflow precisa ser atualizada num PR revisado. |
| "O pacote não tem o carimbo de versão …" | `versao_esperada` diferente de `POLITICA.versao`. |
| "Faltam os secrets CLOUDFLARE_…" / "token … ativo" | Secrets ausentes no Environment, ou token expirado/revogado. |
| "Não consegui confirmar o estado do Worker" / "Não consegui listar os secrets" | A Cloudflare não respondeu "ok" (token sem permissão, inválido ou rede). **Não** significa que o secret não exista. Nada foi publicado. |
| "O secret RAC_CANAL_K1 NÃO está no Worker" | A Cloudflare respondeu normalmente e o secret não existe (ver "Secret do canal"). Nada foi publicado. |
| "migration_tag … esperado v1" | O Worker na Cloudflare não está na migração `v1`; publicar tentaria reaplicá-la. Nada foi publicado; avise o desenvolvedor. |
| Resumo "PUBLICADO, MAS NÃO CONFIRMADO" | O Wrangler terminou, mas a confirmação (versão ativa, secret ou saúde) falhou. Não use ainda: confira o painel e, se preciso, faça o rollback. |
| "A verificação de saúde falhou" | `503 canal_nao_configurado` = sem K1; `404`/erro de rede = publicação ainda propagando (rode a saúde de novo) ou subdomínio errado. |

## Limites
Este workflow não aplica SQL, não publica a função `rac-inbox` (Supabase) nem o site, e não faz a prova real de SMTP: isso continua sendo feito pelo botão **Testar envio (SMTP)** do RAC, que usa a credencial do Vault.

## Histórico de publicação e manutenção

- Em 16/11/2026, o Worker passou a `rac-inbox-worker@p9.0` (I3.2). O formulário do workflow e este guia devem usar o mesmo carimbo de versão de `experimentos/rac-inbox-worker/src/politica.mjs`.
- O workflow consulta o check `testes` do commit selecionado. A execução manual deve ser iniciada somente depois de esse check terminar com `success`; se ainda estiver `in_progress`, aguarde e tente novamente.

## Inspeção dos comandos IMAP do pacote (corrigida em 16/11/2026, após o I3.2)
O verificador do workflow reprovava qualquer `SELECT`, `STORE` ou `MOVE` no pacote (política antiga "IMAP só leitura") e por isso barrou o Worker `p9.0`. Agora a etapa "Empacotar sem publicar (dry-run) e inspecionar" chama `experimentos/rac-inbox-worker-ferramenta/inspecionar-verbos.mjs` sobre o bundle gerado. **Passam só:** `SELECT` na abertura controlada de pasta, `UID STORE` de `+FLAGS (\Seen)`/`-FLAGS (\Seen)` para um UID e `UID MOVE` de um UID para uma pasta validada (com o portão "MOVE anunciado depois do login"), cada um na forma exata e uma vez. **Reprovam:** COPY, APPEND, EXPUNGE (inclusive UID EXPUNGE), DELETE, RENAME, SUBSCRIBE, IDLE, AUTHENTICATE, CLOSE, `\Deleted`, `FLAGS.SILENT` e qualquer STORE/MOVE/SELECT fora dessas formas. Mudar os comandos do Worker exige atualizar esta política no mesmo PR (de propósito). Teste: `tests/rac_inbox_worker_inspecao.test.mjs`. O job também roda `rac_inbox_worker_gestao.test.mjs`.
