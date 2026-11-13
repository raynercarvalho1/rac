# RAC Inbox · Publicação da POC iCloud pelo GitHub Actions

Guia operacional do workflow manual `.github/workflows/icloud-probe-deploy.yml` (teste: `tests/icloud_probe_deploy.test.mjs`). Contexto e fases do RAC Inbox: [Documento 10](planejamento/10-rac-inbox.md). O Worker de diagnóstico (`experimentos/icloud-probe/`) vive na PR #17; este guia e o workflow são independentes dela (os testes que dependem da POC são ignorados enquanto ela não está na branch).


**Fatos confirmados.** Na sessão de nuvem do Claude Code a política de rede do ambiente bloqueia `api.cloudflare.com` e `dash.cloudflare.com` (a proxy recusa com 403); não há token Cloudflare nem sessão do Wrangler, e o `wrangler login` interativo não funciona numa máquina de nuvem. O dono decidiu **não fornecer token Cloudflare à sessão do Claude**. Nada foi publicado: não houve login, deploy, criação de token/Secret, operação na Cloudflare, conexão de conta Apple nem alteração no Supabase. A conectividade real com a Apple **continua não comprovada**.

**Decisão.** O deploy da POC passa a ser feito por um workflow **exclusivamente manual** do GitHub Actions, com as credenciais Cloudflare guardadas como secrets de um Environment protegido do GitHub. O Claude prepara e valida o workflow; quem o aciona e configura os secrets é o dono.

**Desenho (`.github/workflows/icloud-probe-deploy.yml`, teste `tests/icloud_probe_deploy.test.mjs`):**

- Gatilho só `workflow_dispatch`; `permissions: contents: read`; sem deploy em PR, push ou agenda; actions só oficiais (`actions/*`); Wrangler fixo em `4.161.0`.
- Ambiente `cloudflare-poc` com os secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`. Os secrets só aparecem nos três passos que falam com a Cloudflare; o passo que roda código do repositório (testes) não os recebe.
- Trava de branch dentro do workflow: só `main` ou `poc/icloud-cloudflare-connectivity`.
- Passos: testes da POC e do escopo → conferência do token (só o status, sem e-mail nem nome da conta, porque o log de uma Action em repositório público pode ser lido por qualquer usuário logado no GitHub) → `wrangler deploy` no Workers Free → `PROBE_TOKEN` aleatório (`openssl rand -hex 32`), mascarado e enviado ao `wrangler secret put` por stdin → `POST /probe` → resumo no Step Summary (HTTP, IMAP, SMTP, tempos).
- **`PROBE_TOKEN`:** gerado a cada execução, usado só nela e descartado; não é secret do GitHub nem fica em arquivo, saída de passo ou resumo. Consequência: o Worker só pode ser chamado por uma nova execução do workflow, que troca o token.
- Falha por limite de CPU do plano Free (HTTP 5xx / erro 1102): o workflow registra e para, sem repetir e sem upgrade. Só 000, 404 e 503 por secret ainda ausente são repetidos (propagação).
- Fora deste workflow, de propósito: login, `wrangler delete`, troca de plano, Cron, Durable Object, binding, rota e domínio. A **remoção do Worker** fica para atividade futura, com autorização específica; até lá ele permanece publicado após a prova.

**Configuração manual do dono (pendente):**

1. Cloudflare: criar um token de API com **somente** `Account → Workers Scripts → Edit` e copiar o Account ID. Não pedir `Account Settings: Read` sem necessidade técnica comprovada. Hipótese a confirmar: se a conta nunca registrou um subdomínio `workers.dev`, o deploy não interativo pode exigir esse registro no painel.
2. GitHub → Settings → Environments → `cloudflare-poc`: aprovador obrigatório (o dono); branches permitidas `main` e `poc/icloud-cloudflare-connectivity`; secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` no ambiente (não no repositório).
3. O arquivo do workflow precisa estar na `main` para o botão "Run workflow" existir (regra do GitHub para `workflow_dispatch`; a confirmar no primeiro uso). Por isso o workflow e seu teste vão numa **PR separada**, sem mesclar a PR #17. Depois: Actions → "Publicar POC iCloud (manual)" → "Use workflow from" `poc/icloud-cloudflare-connectivity`.

**Registro da prova (pendente).** Só depois da execução real do workflow serão registrados aqui e no histórico: data/hora, nome do Worker e URL `workers.dev` (o subdomínio é público por natureza), resultado de IMAP 993 e de SMTP 587/STARTTLS, tempos, erros e limites. Enquanto isso, a única evidência existente é a dos testes automatizados com sockets simulados, que **não** prova rede real.
