# RAC Inbox — Worker da prova autenticada iCloud (arquitetura S3, OIDC, uso único e P1 IMAP)

Experimento descartável da Fase I0. O Worker valida o token OIDC do GitHub Actions e executa **três operações**, escolhidas pela audiência do token:

| Operação | O que faz | Credencial | Uso único |
|---|---|---|---|
| `validar_oidc` | Ensaio sem efeito: confirma o JWT e a operação (provado em 14/11/2026) | Nenhuma | Não |
| `validar_uso_unico` | Prova **sintética** do registro de uso único (concorrência e replay), sem efeito | Nenhuma | Sim |
| `p1_imap` | **P1**: autenticação IMAP em `imap.mail.me.com:993` (TLS), capabilities e estrutura de pastas, **somente leitura** | Senha específica de app, no corpo da chamada | Sim |

**O primeiro ensaio OIDC não exige cadastro de secrets Apple** (e já foi concluído sem eles). A P1 só roda com os secrets Apple cadastrados **pelo dono, direto no GitHub**, no Environment `icloud-auth-poc`. SMTP, leitura de mensagens, alteração da caixa e envio **não existem aqui** (Documento 10, seções 13.11, 13.18 e 13.19).

## O que ele faz

`POST /auth-probe`, nesta ordem:

1. Confere método e rota (qualquer outra coisa responde 404, sem ler o corpo).
2. Valida o JWT do cabeçalho `Authorization: Bearer ...` (assinatura RS256 com as chaves do emissor oficial do GitHub e todas as claims da política). Falhou: 401 com um **motivo de lista fechada** (nunca valores) e **o corpo não é lido**.
3. **Uso único** (`validar_uso_unico` e `p1_imap`): consome a chave `run_id:run_attempt:operacao` no Durable Object **antes de ler o corpo**. Chave já consumida: **409**. Falha, indisponibilidade ou tempo esgotado do registro: **503**, e a operação **não acontece**.
4. Só então lê o corpo (limite de 2 KB, esquema fechado por operação). `validar_oidc` e `validar_uso_unico`: exatamente `operacao`. `p1_imap`: exatamente `operacao`, `usuario` (endereço de e-mail) e `senha` (senha específica de app, `xxxx-xxxx-xxxx-xxxx`, letras minúsculas), com formato estrito; as **pontas** de `usuario` e `senha` são aparadas (segredos colados no GitHub costumam levar quebra de linha), espaço no meio continua recusado. Qualquer outro campo, tipo ou formato é recusado com **400** e um `detalhe` de lista fechada que diz qual regra falhou (`corpo_nao_json`, `corpo_nao_objeto`, `operacao_invalida`, `campos_inesperados`, `campo_ausente_usuario`, `campo_ausente_senha`, `usuario_tipo_invalido`, `usuario_formato_invalido`, `senha_tipo_invalida`, `senha_formato_invalida`), **nunca o valor recebido**.
5. Confere que a operação do corpo é a da audiência do token (um token vale para uma operação).
6. Executa a operação e responde com **esquema fechado**: só códigos, booleanos e contagens.

## Uso único (proteção contra replay)

- **Durable Object com SQLite** (`src/consumo.mjs`), objeto único e nomeado: processa uma chamada por vez e o SQLite dele é transacional, então "inserir se ausente" é atômico mesmo com chamadas simultâneas. **KV e cache em memória não são usados** como exclusão mútua.
- **Chave:** `run_id:run_attempt:operacao`. Vários tokens da mesma execução (mesmo com `jti` diferente) dão a mesma chave. O `jti` é gravado só para auditoria. **Nada mais é gravado**: nunca token, senha, usuário ou conteúdo de e-mail.
- **Retenção** de 24 horas; a limpeza é preguiçosa e só apaga o que já passou da retenção.
- **Consumir antes de executar:** se o Worker cair no meio, a operação se perde (nunca se duplica); rode de novo (nova execução, novo `run_id`).
- **Idade máxima do token:** 60 s nas operações com credencial (sem somar a tolerância de relógio) e 600 s nas demais.

## P1 · IMAP somente leitura (`src/imap.mjs`)

- **Comandos enviados (lista fechada, conferida em código, em teste e na inspeção do pacote):** `CAPABILITY`, `LOGIN`, `LIST` e `LOGOUT`. **Uma única tentativa de login**, sem repetição; se o servidor anunciar que o login está desabilitado, a credencial nem é enviada.
- **Proibido (não existe no código):** `SELECT`/`EXAMINE`, qualquer leitura de mensagem, cabeçalho, remetente, assunto, corpo ou anexo, alteração de flags, mover, excluir, restaurar, `EXPUNGE`, criar, renomear ou excluir pastas, SMTP e envio.
- **Resposta (esquema fechado):** `ok`, `operacao`, `estagio` (`conexao`, `saudacao`, `capability_pre`, `login`, `capability_pos`, `listagem`, `logout`, `concluido`), `autenticado`, `logout`, `capabilities` (booleanos técnicos e a contagem total), `pastas` (contagens: total, não selecionáveis, com filhos e por uso especial) e `pasta_teste_existe` (booleano; a pasta de teste é `RAC-TESTE`); em falha, `erro` de lista fechada. **Nomes de pastas, endereços, texto do servidor e a credencial nunca saem.**
- **Credencial:** vive só em variáveis locais da chamada. Não é gravada, registrada (o Worker não usa `console`), devolvida nem enviada ao registro de uso único.
- **Sockets:** só o ponto de entrada (`src/index.mjs`) importa `cloudflare:sockets`; host e porta vêm da política, nunca do cliente.

## Política de confiança (fixa no código, sem segredo)

Arquivo `src/politica.mjs`. Exigidas e conferidas com valor exato: `iss`, `aud` (uma por operação: `rac-inbox-icloud-poc:<operacao>`), `sub` (formato imutável do GitHub e o clássico, ambos exatos), `repository`, `repository_id`, `repository_owner`, `repository_owner_id`, `environment` (`icloud-auth-poc`), `ref` (só `refs/heads/main`: o workflow privilegiado existe só na `main`, Desenho B), `event_name` (`workflow_dispatch`), `workflow_ref` e `job_workflow_ref`, `runner_environment` (`github-hosted`), `exp`, `iat` e, se presente, `nbf`. **Também obrigatórias, com formato estrito:** `jti` (texto de 8 a 128 caracteres de `A-Za-z0-9._:-`), `run_id` (texto numérico até 20 dígitos, sem zero à esquerda) e `run_attempt` (até 4 dígitos). Tolerância de relógio de 60 s. Cabeçalhos `jku`, `x5u`, `x5c`, `jwk` e `crit` e qualquer algoritmo diferente de RS256 são recusados.

## Chaves (JWKS)

O documento de descoberta é lido do emissor fixo; o `jwks_uri` só é aceito em HTTPS e do mesmo host. Nunca se busca chave em URL indicada pelo token. A busca usa `redirect: "manual"` e recusa qualquer 3xx (o runtime do Cloudflare Workers **não** aceita `redirect: "error"`: lança `TypeError`). Quando as chaves não podem ser obtidas, a resposta 401 traz `motivo: "jwks_indisponivel"` e um `detalhe` de lista fechada (`DETALHES_JWKS`), nunca texto de erro, URL, token ou claim. Cache só em memória do isolate (10 min); kid desconhecido provoca no máximo uma recarga por minuto; com o cache vencido e o emissor fora, a validação **falha fechada na hora**. Uma chave revogada vale até o fim do cache fresco (10 min).

## Execução

Pelo workflow manual `.github/workflows/icloud-auth-probe.yml` (três jobs: `verificar` sem secrets, `provisionar` com o Environment `cloudflare-poc` e `executar` com o Environment `icloud-auth-poc`), com a entrada `operacao`. Guia: `docs/icloud-poc-deploy.md`.

- **Validação OIDC real:** executada em 14/11/2026 (execução 43535195165, commit da POC `d1f25d3`; Documento 10, seção 13.18). Não autentica conta Apple.
- **Uso único:** publicado e **comprovado no runtime real** em 14/11/2026 (execução 43585089326: 1 aceita, 9 recusadas, replay recusado; Documento 10, seção 13.20).
- **P1:** a execução 43597133032 falhou com HTTP 400 `esquema_invalido` **antes de tocar na Apple** (formato de um dos valores do corpo; a resposta ainda não dizia qual). Corrigido na branch (resposta com `detalhe` de lista fechada e pontas dos segredos aparadas), **ainda não publicado nem executado de novo** (Documento 10, seção 13.20).
- **Pré-requisitos do dono:** o workflow com replay + P1 mesclado na `main`; os Environments com aprovador e só a `main`; para a P1, os secrets `ICLOUD_USER` e `ICLOUD_APP_PASSWORD` **só** no Environment `icloud-auth-poc`.
- O Wrangler vem do lockfile da pasta `experimentos/icloud-auth-probe-ferramenta` e a publicação usa uma configuração escrita no workflow (a `wrangler.jsonc` desta pasta não é lida na publicação, só conferida; ela inclui o Durable Object `CONSUMO` e a migração `v1`).

## Limites que continuam valendo

- **Comprovado em 14/11/2026:** o uso único no runtime real e a criação do Durable Object com o token Cloudflare existente. **Não comprovado:** a P1 no servidor real da Apple (a execução parou no esquema do corpo) e o CPU por requisição no Workers Free.
- **Fora do escopo desta etapa:** SMTP, leitura de mensagens, sincronização, envio e qualquer alteração da caixa (P2 a P7).

Testes: `node --test tests/icloud_auth_probe.test.mjs tests/icloud_auth_probe_consumo.test.mjs tests/icloud_auth_probe_imap.test.mjs tests/icloud_auth_probe_worker.test.mjs tests/icloud_auth_probe_contrato.test.mjs` (o último executa os passos reais do workflow contra o Worker, sem rede externa).
