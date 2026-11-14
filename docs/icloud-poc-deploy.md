# RAC Inbox · Publicação e validação OIDC da POC iCloud (Desenho B)

Guia operacional e de segurança do workflow `.github/workflows/icloud-auth-probe.yml` (teste: `tests/icloud_auth_probe_workflow.test.mjs`). Contexto e fases do RAC Inbox: [Documento 10](planejamento/10-rac-inbox.md). O Worker `rac-icloud-auth-poc` e a política OIDC dele ficam na branch da POC (PR #17) e entram na `main` com ela; este guia e o workflow não dependem dessa PR.

**Estado (14/11/2026):** a validação OIDC (execução 43535195165), o uso único (execução 43585089326) e a **P1** (execução 43599209307, autenticação IMAP somente leitura) estão **comprovados** nos runtimes reais. **Esta mudança** adiciona ao workflow (a) a operação `p2_imap` (leitura de **uma** mensagem da pasta `RAC-TESTE`, somente leitura) com a entrada opcional `uid_mensagem` e (b) o **portão do pin**: só o conteúdo de Worker aprovado em `experimentos/icloud-auth-probe-ferramenta/aprovados.json` pode ser empacotado e publicado, e cada operação aceita apenas o pin dela. O Node do CI passa a ser uma versão exata. Está implementada e testada localmente e **não foi mesclada, publicada nem executada**; o código do Worker da P2 vive na branch da P2 (não na `main`) e a P2 real **não foi executada**. Nenhum Environment ou secret foi criado ou alterado e nada acessou a Apple. **O workflow só vale depois do merge na `main` (decisão do dono).**

## O que é o Desenho B

O workflow que tem acesso aos secrets da Cloudflare **existe só na `main`**. Ele é disparado a partir da `main` e recebe como entrada o **commit da branch da POC**, tratado apenas como **dado**: os arquivos do Worker daquele commit são copiados por uma lista fixa, empacotados e inspecionados, mas **nada da branch é executado**, nem com secrets, nem sem. Os Environments `cloudflare-poc` e `icloud-auth-poc` aceitam **só a `main`** (configuração do dono no GitHub, abaixo): assim, mesmo um workflow alterado numa branch e disparado de lá não recebe nenhum secret nem o Environment, e o token OIDC dele não teria a `ref` nem o workflow que o Worker exige.

Isso fecha o risco residual identificado na auditoria (workflow privilegiado vindo de uma branch controlada): restringir o Environment à branch da POC **não** bastava, porque o arquivo malicioso estaria na própria branch permitida.

## Fronteiras de confiança e permissões

| Job | Roda código da branch? | Environment e secrets | Permissões do `GITHUB_TOKEN` | O que faz |
|---|---|---|---|---|
| `verificar` | **Não.** Só lê dados da POC | Nenhum | `contents: read` | Valida a entrada (40 hexadecimais) e a ref (`main`); baixa a ferramenta da `main` e o commit da POC como dados; confere a lista fixa de arquivos (sem links simbólicos, `.env`, `.dev.vars`, `package.json`, `wrangler.toml`); empacota sem publicar (`--dry-run`); inspeciona e calcula o `sha256`; resume commit, hash e hash de cada arquivo |
| `provisionar` | **Não.** Nem baixa a branch da POC | `cloudflare-poc`; só `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`, **só nos dois últimos passos** | `contents: read` | Instala o Wrangler pelo lockfile da `main`; recompõe o pacote, **confere o hash** e escreve a configuração de publicação; confere o token (só `curl` e `jq`); publica **exatamente** o arquivo conferido, sem empacotar de novo (`no_bundle`) |
| `executar` | Não (sem checkout nem actions) | `icloud-auth-poc`; os secrets Apple (`ICLOUD_USER`, `ICLOUD_APP_PASSWORD`) **só nos passos da P1 e da P2** | **só** `id-token: write` | Pré-checagem sem efeito (`validar_oidc`, com repetição só para a propagação do Worker); conforme a operação escolhida: prova sintética do uso único (dez chamadas simultâneas, uma aceita e nove recusadas, mais o replay) ou a P1 (**uma única chamada, sem repetição**, credencial por entrada padrão); sem credencial Cloudflare |

- **O que passa entre jobs:** só o pacote do Worker, o hash e o commit, todos públicos, do `verificar` para o `provisionar`, por saídas do job. Nenhum segredo passa entre jobs (nem por saída, artefato, arquivo de ambiente ou log), e o `executar` não lê nada dos outros.
- **Portão do pin:** no `verificar`, **antes de montar e de empacotar**, o conteúdo do commit é conferido contra os pins aprovados (seção abaixo). Falhou = o job termina e nenhum job com secrets ou Environment sequer começa; a aprovação humana do Environment vem depois e **não substitui** esse controle.
- **Node:** `setup-node` com a versão **exata** `24.22.3` nos jobs `verificar` e `provisionar` (action fixada por SHA).
- **Wrangler:** versão exata 4.161.0, instalado de `experimentos/icloud-auth-probe-ferramenta/` com `npm ci --ignore-scripts` (92 pacotes, todos com integridade e origem no registro oficial); a integridade do Wrangler é conferida contra um valor escrito no workflow. Nada de `npx`.
- **Configuração:** a de publicação está escrita **dentro do workflow** e inclui só o binding `CONSUMO` do Durable Object (classe `ConsumoUnico`) e a migração `v1` com `new_sqlite_classes`; a `wrangler.jsonc` do commit da POC não é usada, só conferida (precisa ser equivalente). Isso elimina o vetor de `build.command`, `.env` e variáveis do Wrangler vindas da branch, e qualquer outro recurso (KV, outro objeto, migração que apague a classe) é recusado.
- **Pacote inspecionado antes dos secrets:** sem `process.env`, `eval`, `new Function`, `console`, SMTP, `import()` ou `require`; o único módulo `cloudflare:` é `sockets` (IMAP da P1 e da P2); o único host da Apple é `imap.mail.me.com`; nenhum verbo IMAP de leitura de mensagem ou de alteração (`EXPUNGE`, `APPEND`, `FETCH`, `STORE`, `EXAMINE`, `SEARCH`, `RENAME`, `SUBSCRIBE`, `AUTHENTICATE`, `STARTTLS`); os únicos endereços http(s) são o emissor do GitHub e o nome interno e fixo `consumo.interno` (alvo do Durable Object, não resolve na rede); a classe `ConsumoUnico` precisa estar no pacote e exportada. O arquivo enviado tem o mesmo hash do inspecionado.

## Política OIDC do Worker

O Worker valida, antes de ler o corpo: assinatura RS256 com as chaves do JWKS do emissor oficial (descoberta pelo emissor fixo, `jwks_uri` só em HTTPS e do mesmo host); `iss` exato; `aud` exata por operação (`rac-inbox-icloud-poc:validar_oidc`); `sub` (os dois formatos documentados pelo GitHub, exatos); `repository`, `repository_id`, `repository_owner` e `repository_owner_id`; `environment` igual a `icloud-auth-poc`; `ref` igual a `refs/heads/main`; `event_name` igual a `workflow_dispatch`; `workflow_ref` e `job_workflow_ref` iguais ao arquivo `.github/workflows/icloud-auth-probe.yml` na `main`; `runner_environment`; `exp`, `iat` e `nbf` com tolerância de 60 s e idade máxima de 600 s. Cabeçalhos `jku`, `x5u`, `x5c`, `jwk` e `crit` e qualquer algoritmo diferente de RS256 são recusados; JWKS indisponível, inválido ou sem a chave resulta em **falha fechada**. A única operação é `validar_oidc`, com esquema fechado: campos extras (inclusive usuário e senha) são recusados. Detalhes e testes do Worker: Documento 10, seções 13.13 a 13.16 (que chegam à `main` com a PR #17).

## Proteção contra replay: uso único (Durable Object)

Assinatura, validade curta e audiência não impedem reutilizar um token dentro da validade. Por isso toda operação protegida (`validar_uso_unico` e `p1_imap`) passa por um **registro de uso único**: um Durable Object com SQLite, objeto único e nomeado, que insere a chave `run_id:run_attempt:operacao` de forma atômica. O Worker valida o JWT, **consome a chave antes de ler o corpo** (que na P1 carrega a credencial) e só então executa.

- **Mesma execução, tokens diferentes:** a chave não depende do `jti`, então um passo comprometido do job que pedisse um token novo também seria barrado; o `jti` fica gravado só para auditoria.
- **Repetição = HTTP 409.** **Falha, indisponibilidade ou tempo esgotado do registro = HTTP 503**, e a operação **não** acontece (falha fechada). Se o Worker cair depois de consumir e antes de executar, a operação se perde, nunca se duplica: rode de novo (uma nova execução tem outro `run_id`).
- **Persistência:** só chave, `jti` e dois instantes; nunca token, senha ou conteúdo de e-mail. Retenção mínima de 24 horas, com limpeza preguiçosa que só apaga o que já passou da retenção.
- **Idade máxima do token:** 60 s nas operações com credencial (sem somar a tolerância de relógio) e 600 s nas demais; o workflow pede o token imediatamente antes da chamada.
- **Não usa KV nem cache em memória** como exclusão mútua (KV tem consistência eventual e não tem comparar-e-gravar).
- **Prova no runtime real:** a operação `validar_uso_unico` dispara dez chamadas simultâneas da mesma execução e exige exatamente uma aceita e nove recusadas, mais a recusa do replay do mesmo token e de um token novo. Os testes em memória e no workerd local **não substituem** essa prova.

## Como executar (quando o dono autorizar)

1. O workflow (com o suporte à P2 e o portão do pin) estar na `main` e a configuração do GitHub abaixo concluída. O commit informado precisa ter **conteúdo igual ao de um pin aprovado para a operação escolhida** (seção "Portão do pin").
2. *Actions → "Prova autenticada iCloud (OIDC, manual, só main)" → Run workflow*, com **"Use workflow from" = `main`**, o commit da POC (40 caracteres) e a **operação**:
   - `validar_oidc` (padrão): ensaio sem efeito e sem credencial.
   - `validar_uso_unico`: prova sintética do uso único, sem credencial. **Rodar esta antes da P1** e só seguir se ela passar.
   - `p1_imap`: autenticação IMAP somente leitura (comprovada). Aceita só o conteúdo do pin **P1**. Exige os secrets Apple (ver abaixo).
   - `p2_imap`: leitura de **uma** mensagem da pasta `RAC-TESTE`, somente leitura, resposta só com indicadores. Aceita só o conteúdo do pin **P2**. Exige os mesmos secrets. A entrada opcional **`uid_mensagem`** (número inteiro positivo, até 10 dígitos) escolhe o UID; vazia, lê a última mensagem da pasta. Antes, deixar **uma** mensagem de teste em `RAC-TESTE`, sem conteúdo pessoal. **Só com autorização do dono.**
3. O job `verificar` termina sozinho. **Antes de aprovar o Environment**, abrir o resumo dele: conferir o commit, o `sha256`, a configuração fixa (Durable Object e migração) e os hashes dos arquivos, ler o diff desses arquivos no commit e confirmar que o CI desse commit passou na PR da POC.
4. Aprovar `cloudflare-poc` (publica o pacote conferido, **incluindo a migração do Durable Object**) e depois `icloud-auth-poc` (pré-checagem e a operação escolhida). O resultado fica no resumo do job `executar`.
5. Cada execução do workflow (e cada nova tentativa, `run_attempt`) permite **uma** `validar_uso_unico`, **uma** `p1_imap` e **uma** `p2_imap`. Falhou? Dispare uma nova execução; a P1 e a P2 nunca se repetem sozinhas.

### Secrets da P1 e da P2 (você cadastra, direto no GitHub; nunca no chat)

1. Na conta Apple, gerar uma **senha específica de app** (formato `xxxx-xxxx-xxxx-xxxx`), nunca a senha principal.
2. *Settings → Environments → `icloud-auth-poc` → Environment secrets*: `ICLOUD_USER` (o ID Apple) e `ICLOUD_APP_PASSWORD` (a senha de app). Só neste Environment.
3. Se faltarem, o passo da P1 ou da P2 falha com a instrução e não chama o Worker.
4. Ao fim da POC, **revogar** a senha de app no painel da Apple e remover os secrets.

## Portão do pin: só o Worker aprovado é publicado

**Problema que resolve.** Antes, o workflow aceitava **qualquer** commit de 40 caracteres como entrada; a única barreira era você ler o resumo do `verificar` e aprovar o Environment. Agora o conteúdo do Worker precisa ser **o aprovado**, por controle técnico, antes de qualquer etapa privilegiada.

**O arquivo.** `experimentos/icloud-auth-probe-ferramenta/aprovados.json`, na `main`, lido pelo job `verificar` do mesmo checkout da ferramenta (nada vindo da branch da POC o substitui; não há entrada nem variável que o troque).
- `pins.p1` e `pins.p2`: para cada um, `arquivos` (caminho → SHA-256 de cada arquivo executável: as fontes `src/*.mjs` e `wrangler.jsonc`; o README fica de fora porque não entra no pacote), `manifesto_sha256` e `commit_referencia` (informativo: o que vale é o conteúdo, não o SHA do commit).
- `operacoes`: a **associação explícita** operação → pins aceitos: `p1_imap` → só `p1`; `p2_imap` → só `p2`; `validar_oidc` e `validar_uso_unico` → `p1` ou `p2`. O conteúdo certo para a outra operação é recusado (a `p2_imap` nunca publica o Worker P1, e a `p1_imap` nunca publica o Worker P2).

**Hash determinístico e não ambíguo.** O manifesto é o texto `rac-pin-v1` seguido de uma linha `<sha256>␠␠<caminho>` por arquivo, em ordem bytewise (`LC_ALL=C`), com `\n` ao final de cada linha; o `manifesto_sha256` é o SHA-256 desse texto. Como os caminhos entram no manifesto, renomear ou mover um arquivo muda o hash.

**O que é conferido, em ordem, no job `verificar` (sem secrets, sem Environment), antes de montar e empacotar:**
1. o pin existe, tem o formato esperado e é internamente consistente (o manifesto bate com a lista de arquivos dele); a operação existe na tabela;
2. o checkout está no commit pedido;
3. a árvore do commit é lida dos **objetos do Git** (não do checkout, então atributos como `.gitattributes` não alteram nada): só arquivos regulares `100644` com nome simples; link simbólico, submódulo, arquivo executável ou nome fora do padrão derrubam o job;
4. a lista de arquivos do commit é **exatamente** a do pin (mais o README): arquivo ausente, extra, renomeado ou em subpasta derruba o job;
5. o hash de cada arquivo e o manifesto batem com os do pin escolhido pela operação; o resumo mostra o pin casado e, se falhar, só os **caminhos** que diferem (nunca conteúdo);
6. a montagem copia os arquivos dos mesmos objetos, reconfere o hash depois da cópia e compara a `wrangler.jsonc` do commit com a configuração fixa do workflow (a única usada na publicação, com o Durable Object `CONSUMO` e a migração `v1`);
7. a inspeção do pacote depende do pin: o do **P1** não pode ter nenhum verbo ou lista da P2; o do **P2** precisa das duas listas exatas de verbos; nenhum dos dois pode ter leitura sem `PEEK`.

**Insumos que alteram o bundle e quem os cobre.** Fontes e `wrangler.jsonc` do commit: **pin**. Configuração de publicação (heredoc), versão do Wrangler (integridade e versão conferidas), lockfile (91 pacotes, todos com `integrity` e do registro oficial do npm; `npm ci --ignore-scripts`), ações por SHA, versão do Node e inspeção do pacote: **o próprio workflow e a pasta da ferramenta, na `main`**, só mudam por PR revisada. O hash do bundle é calculado no `verificar` e conferido pelo `provisionar`; ele **não** é gravado no pin (decisão do dono).

**Atualizar o pin (nova versão do Worker).** PR para a `main` que altera `aprovados.json`: gerar os hashes dos arquivos do commit revisado, recalcular o `manifesto_sha256` (o teste `aprovados.json: formato, associação...` recalcula e recusa inconsistência), registrar o `commit_referencia` e revisar o diff do Worker antes de mesclar. O pin antigo permanece até ser removido, o que preserva o **rollback** (`p1_imap` ou `validar_oidc` com o commit P1 republica o Worker P1). Na branch que contém o Worker, o teste de coerência recalcula o manifesto da árvore atual e acusa o desvio se o Worker mudar sem o pin.

**Regra de revisão obrigatória (documentada; a configuração no GitHub é sua e ainda não foi feita).** Quem consegue mesclar na `main` consegue alterar o pin, o workflow e o lockfile. Configurar *Settings → Rules → Rulesets* (ou proteção de branch) na `main` para **exigir Pull Request e aprovação de revisão** quando a mudança tocar `.github/workflows/**` e `experimentos/icloud-auth-probe-ferramenta/**`, e, de preferência, um arquivo `CODEOWNERS` com o dono nesses dois caminhos (esse arquivo é um commit na `main`, a ser feito depois). Sem essa regra, o pin é tão forte quanto a permissão de merge.

## Configuração do GitHub que depende do dono (nada foi configurado)

| Classe | Configuração | Justificativa |
|---|---|---|
| **Requisito** | `cloudflare-poc` e `icloud-auth-poc`: **aprovador obrigatório** | Sem aprovador não há portão humano; há indício de que `cloudflare-poc` não exigia na execução anterior |
| **Requisito** | Os dois Environments com *Deployment branches and tags* = **só a `main`** | É o que impede uma branch de obter os secrets. Com a branch da POC permitida, o risco volta |
| **Requisito** | Secrets só nos Environments, nunca no repositório; `icloud-auth-poc` **sem secrets** até a P1 ser autorizada, e então só `ICLOUD_USER` e `ICLOUD_APP_PASSWORD` (já cadastrados pelo dono) | O `executar` só os usa no passo da P1 |
| **Requisito** | Token Cloudflare com `Account → Workers Scripts → Edit`, de uma conta, com prazo de validade, revogado ao fim da POC | Permissão mínima. **A migração do Durable Object pode exigir permissão adicional**: se o `Publicar` falhar por permissão, o erro do Wrangler dirá qual; nada é ampliado sem a sua ação |
| **Requisito** | *Settings → Actions → General*: permissão padrão do `GITHUB_TOKEN` só de leitura | Protege os demais workflows |
| **Recomendação** | Desligar o bypass de administradores nas regras dos Environments (conferir o nome na interface) | |
| **Recomendação** | Proteger a `main` e a branch da POC contra *force push* e exclusão | Preserva o histórico; não cria separação de funções |
| **Recomendação** | Exigir aprovação de execuções de colaboradores externos; ligar *secret scanning* e *push protection* | O repositório é público |
| **Opcional** | *Prevent self-review* no Environment | **Só com um segundo revisor**: com uma única conta impediria o dono de aprovar |
| **Recomendação (ver "Portão do pin")** | Revisão obrigatória em `.github/workflows/**` e `experimentos/icloud-auth-probe-ferramenta/**` (ruleset e CODEOWNERS) | Protege o pin, o workflow e o lockfile |
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

- **O Worker vem de código da branch:** um Worker malicioso seria publicado se o aprovador não revisasse. Mitigação: lista fixa de arquivos, inspeção do pacote (listas exatas de módulos, hosts e verbos IMAP), hash conferido entre os jobs e revisão do diff dos arquivos de código antes de aprovar. Com a P1, um Worker adulterado teria acesso à credencial: o diff precisa ser lido.
- **Comprometimento da `main`:** quem alterar este workflow na `main` controla os secrets; o merge passa pelo cartão de confirmação do dono, que pode não aparecer em modo Auto (`CLAUDE.md`).
- **Não comprovado:** o uso único no runtime publicado (só testado em memória e no workerd local até a prova `validar_uso_unico`); a P1 no servidor real da Apple; o CPU por requisição no Workers Free; se `Workers Scripts → Edit` basta para a migração do Durable Object.
- **A fase I0 não está concluída:** leitura, alteração, exclusão, SMTP, sincronização e substituição do Spark continuam não comprovados; a autenticação IMAP (P1) depende da execução autorizada.
