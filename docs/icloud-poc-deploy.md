# RAC Inbox · Publicação e validação OIDC da POC iCloud (Desenho B)

Guia operacional e de segurança do workflow `.github/workflows/icloud-auth-probe.yml` (teste: `tests/icloud_auth_probe_workflow.test.mjs`). Contexto e fases do RAC Inbox: [Documento 10](planejamento/10-rac-inbox.md). O Worker `rac-icloud-auth-poc` e a política OIDC dele ficam na branch da POC (PR #17) e entram na `main` com ela; este guia e o workflow não dependem dessa PR.

**Estado (13/11/2026): implementado e testado localmente; não executado.** Nenhum Environment ou secret foi criado ou alterado por esta mudança, não houve deploy e nada acessou a Apple. O primeiro ensaio OIDC não usa nenhuma credencial Apple.

## O que é o Desenho B

O workflow que tem acesso aos secrets da Cloudflare **existe só na `main`**. Ele é disparado a partir da `main` e recebe como entrada o **commit da branch da POC**, tratado apenas como **dado**: os arquivos do Worker daquele commit são copiados por uma lista fixa, empacotados e inspecionados, mas **nada da branch é executado**, nem com secrets, nem sem. Os Environments `cloudflare-poc` e `icloud-auth-poc` aceitam **só a `main`** (configuração do dono no GitHub, abaixo): assim, mesmo um workflow alterado numa branch e disparado de lá não recebe nenhum secret nem o Environment, e o token OIDC dele não teria a `ref` nem o workflow que o Worker exige.

Isso fecha o risco residual identificado na auditoria (workflow privilegiado vindo de uma branch controlada): restringir o Environment à branch da POC **não** bastava, porque o arquivo malicioso estaria na própria branch permitida.

## Fronteiras de confiança e permissões

| Job | Roda código da branch? | Environment e secrets | Permissões do `GITHUB_TOKEN` | O que faz |
|---|---|---|---|---|
| `verificar` | **Não.** Só lê dados da POC | Nenhum | `contents: read` | Valida a entrada (40 hexadecimais) e a ref (`main`); baixa a ferramenta da `main` e o commit da POC como dados; confere a lista fixa de arquivos (sem links simbólicos, `.env`, `.dev.vars`, `package.json`, `wrangler.toml`); empacota sem publicar (`--dry-run`); inspeciona e calcula o `sha256`; resume commit, hash e hash de cada arquivo |
| `provisionar` | **Não.** Nem baixa a branch da POC | `cloudflare-poc`; só `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`, **só nos dois últimos passos** | `contents: read` | Instala o Wrangler pelo lockfile da `main`; recompõe o pacote, **confere o hash** e escreve a configuração de publicação; confere o token (só `curl` e `jq`); publica **exatamente** o arquivo conferido, sem empacotar de novo (`no_bundle`) |
| `executar` | Não (sem checkout nem actions) | `icloud-auth-poc`; **nenhum secret** | **só** `id-token: write` | Pede o token OIDC, o mascara e o envia ao Worker (URL fixa) com o corpo sintético `{"operacao":"validar_oidc"}`; sem credencial Apple e sem credencial Cloudflare |

- **O que passa entre jobs:** só o pacote do Worker, o hash e o commit, todos públicos, do `verificar` para o `provisionar`, por saídas do job. Nenhum segredo passa entre jobs (nem por saída, artefato, arquivo de ambiente ou log), e o `executar` não lê nada dos outros.
- **Wrangler:** versão exata 4.161.0, instalado de `experimentos/icloud-auth-probe-ferramenta/` com `npm ci --ignore-scripts` (92 pacotes, todos com integridade e origem no registro oficial); a integridade do Wrangler é conferida contra um valor escrito no workflow. Nada de `npx`.
- **Configuração:** a de publicação está escrita **dentro do workflow**; a `wrangler.jsonc` do commit da POC não é usada, só conferida (precisa ser equivalente). Isso elimina o vetor de `build.command`, `.env` e variáveis do Wrangler vindas da branch.
- **Pacote inspecionado antes dos secrets:** sem `process.env`, `eval`, `new Function`, `console`, sockets, endereços da Apple, `import()` ou `require`; o único endereço citado é o do emissor do GitHub. O empacotamento é determinístico (duas construções, mesmo hash) e o arquivo enviado tem o mesmo hash do inspecionado.

## Política OIDC do Worker

O Worker valida, antes de ler o corpo: assinatura RS256 com as chaves do JWKS do emissor oficial (descoberta pelo emissor fixo, `jwks_uri` só em HTTPS e do mesmo host); `iss` exato; `aud` exata por operação (`rac-inbox-icloud-poc:validar_oidc`); `sub` (os dois formatos documentados pelo GitHub, exatos); `repository`, `repository_id`, `repository_owner` e `repository_owner_id`; `environment` igual a `icloud-auth-poc`; `ref` igual a `refs/heads/main`; `event_name` igual a `workflow_dispatch`; `workflow_ref` e `job_workflow_ref` iguais ao arquivo `.github/workflows/icloud-auth-probe.yml` na `main`; `runner_environment`; `exp`, `iat` e `nbf` com tolerância de 60 s e idade máxima de 600 s. Cabeçalhos `jku`, `x5u`, `x5c`, `jwk` e `crit` e qualquer algoritmo diferente de RS256 são recusados; JWKS indisponível, inválido ou sem a chave resulta em **falha fechada**. A única operação é `validar_oidc`, com esquema fechado: campos extras (inclusive usuário e senha) são recusados. Detalhes e testes do Worker: Documento 10, seções 13.13 a 13.16 (que chegam à `main` com a PR #17).

## Limitação conhecida: replay do token

Assinatura, validade curta e audiência **não** impedem reutilizar o mesmo token dentro da validade. O token fica preso a uma operação, ao Environment, à `main` e ao workflow, e a única operação é o ensaio `validar_oidc`, sem credencial e sem efeito, então o impacto hoje é nulo. **Uso único exige persistência** (por exemplo Durable Object com SQLite), que **não** foi implementada e só deve ser decidida, com autorização específica, antes de qualquer operação que altere a caixa ou envie e-mail.

## Como executar (quando o dono autorizar)

1. O workflow estar na `main` (esta PR mesclada) e a configuração do GitHub abaixo concluída.
2. *Actions → "Prova autenticada iCloud (OIDC, manual, só main)" → Run workflow*, com **"Use workflow from" = `main`** e o commit da POC (40 caracteres) a publicar.
3. O job `verificar` termina sozinho. **Antes de aprovar o Environment**, abrir o resumo dele: conferir o commit, o `sha256` e os hashes dos arquivos, ler o diff desses arquivos no commit e confirmar que o CI desse commit passou na PR da POC.
4. Aprovar `cloudflare-poc` (publica o pacote conferido) e depois `icloud-auth-poc` (valida o JWT). O resultado fica no resumo do job `executar`.

## Configuração do GitHub que depende do dono (nada foi configurado)

| Classe | Configuração | Justificativa |
|---|---|---|
| **Requisito** | `cloudflare-poc` e `icloud-auth-poc`: **aprovador obrigatório** | Sem aprovador não há portão humano; há indício de que `cloudflare-poc` não exigia na execução anterior |
| **Requisito** | Os dois Environments com *Deployment branches and tags* = **só a `main`** | É o que impede uma branch de obter os secrets. Com a branch da POC permitida, o risco volta |
| **Requisito** | Secrets só nos Environments, nunca no repositório; `icloud-auth-poc` sem nenhum secret no primeiro ensaio | |
| **Requisito** | Token Cloudflare com `Account → Workers Scripts → Edit`, de uma conta, com prazo de validade, revogado ao fim da POC | Permissão mínima |
| **Requisito** | *Settings → Actions → General*: permissão padrão do `GITHUB_TOKEN` só de leitura | Protege os demais workflows |
| **Recomendação** | Desligar o bypass de administradores nas regras dos Environments (conferir o nome na interface) | |
| **Recomendação** | Proteger a `main` e a branch da POC contra *force push* e exclusão | Preserva o histórico; não cria separação de funções |
| **Recomendação** | Exigir aprovação de execuções de colaboradores externos; ligar *secret scanning* e *push protection* | O repositório é público |
| **Opcional** | *Prevent self-review* no Environment | **Só com um segundo revisor**: com uma única conta impediria o dono de aprovar |
| **Opcional** | Política de actions por SHA, Dependabot para actions e lockfile, CODEOWNERS para `.github/workflows` | Sem efeito de separação enquanto houver uma única conta |

## Workflow antigo `icloud-probe-deploy.yml`: retirado nesta mudança

O workflow antigo, usado na prova de conectividade, mantinha o padrão vulnerável: usava `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` em três passos, rodava `npx --yes wrangler@4.161.0` sem lockfile e com a `wrangler.jsonc` da ref, tinha actions por tag móvel e aceitava a branch da POC; a cópia da branch continuava dispatchável e reproduzia o vetor do `build.command` com os secrets. Não se mantêm dois caminhos de publicação privilegiada com políticas diferentes, então esta mudança **retira o arquivo** (e o teste dele); o Worker de conectividade `rac-icloud-connectivity-poc` já cumpriu o papel e continua publicado, sem uso. A remoção dele da Cloudflare é atividade futura, com autorização específica.

**Até esta mudança ser mesclada**, o workflow antigo continua ativo na `main`. Procedimento manual na interface do GitHub (reversível, ação do dono) para neutralizá-lo já: *Actions → "Publicar POC iCloud (manual)" → menu "⋯" → Disable workflow*. Justificativa: ele ainda dá acesso ao Environment `cloudflare-poc` por uma cópia modificável na branch da POC, e a prova que ele servia já foi feita. Esta mudança não desativa nada remotamente.

## Procedência dos SHAs das actions

Conferidos de forma independente, direto nos repositórios oficiais (`git ls-remote` e `git fetch` do commit), em 13/11/2026:

| Action | Tag | SHA completo | Fonte |
|---|---|---|---|
| `actions/checkout` | v4.4.0 | `11d5960a326750d5838078e36cf38b85af677262` | https://github.com/actions/checkout/releases/tag/v4.4.0 |
| `actions/setup-node` | v4.4.0 | `49933ea5288caeca8642d1e84afbd3f7d6820020` | https://github.com/actions/setup-node/releases/tag/v4.4.0 |

O SHA garante que a tag não pode ser movida; não substitui a revisão do código da action, que é do GitHub.

## Riscos residuais

- **O Worker vem de código da branch:** um Worker malicioso seria publicado se o aprovador não revisasse. Mitigação: lista fixa de arquivos, inspeção do pacote, hash conferido entre os jobs e revisão do diff dos quatro arquivos antes de aprovar.
- **Comprometimento da `main`:** quem alterar este workflow na `main` controla os secrets; o merge passa pelo cartão de confirmação do dono, que pode não aparecer em modo Auto (`CLAUDE.md`).
- **Não comprovado:** o primeiro deploy real com este desenho (a publicação sem bundle só foi exercitada em `--dry-run`); o formato real das claims e do JWKS; o CPU no runtime da Cloudflare; o comportamento das aprovações de Environment.
- **A fase I0 não está concluída:** autenticação na Apple, leitura, organização, envio e sincronização continuam não comprovados.
