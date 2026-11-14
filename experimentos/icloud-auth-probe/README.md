# RAC Inbox — Worker da prova autenticada iCloud (arquitetura S3, OIDC, uso único, P1 e P2 IMAP)

Experimento descartável da Fase I0. O Worker valida o token OIDC do GitHub Actions e executa **quatro operações**, escolhidas pela audiência do token:

| Operação | O que faz | Credencial | Uso único |
|---|---|---|---|
| `validar_oidc` | Ensaio sem efeito: confirma o JWT e a operação (provado em 14/11/2026) | Nenhuma | Não |
| `validar_uso_unico` | Prova **sintética** do registro de uso único (concorrência e replay), sem efeito | Nenhuma | Sim |
| `p1_imap` | **P1** (comprovada em 14/11/2026): autenticação IMAP em `imap.mail.me.com:993` (TLS), capabilities e estrutura de pastas, **somente leitura** | Senha específica de app, no corpo da chamada | Sim |
| `p2_imap` | **P2** (implementada e testada localmente; **não executada no iCloud real**): leitura de **uma** mensagem da pasta `RAC-TESTE`, somente leitura (`EXAMINE`), devolvendo só indicadores | Senha específica de app, no corpo da chamada | Sim |

**O primeiro ensaio OIDC não exige cadastro de secrets Apple** (e já foi concluído sem eles). A P1 só roda com os secrets Apple cadastrados **pelo dono, direto no GitHub**, no Environment `icloud-auth-poc`. SMTP, alteração da caixa e envio **não existem aqui**; a leitura de mensagens existe **só** na P2, na pasta `RAC-TESTE` (Documento 10, seções 13.11, 13.18, 13.19 e 13.21).

## O que ele faz

`POST /auth-probe`, nesta ordem:

1. Confere método e rota (qualquer outra coisa responde 404, sem ler o corpo).
2. Valida o JWT do cabeçalho `Authorization: Bearer ...` (assinatura RS256 com as chaves do emissor oficial do GitHub e todas as claims da política). Falhou: 401 com um **motivo de lista fechada** (nunca valores) e **o corpo não é lido**.
3. **Uso único** (`validar_uso_unico` e `p1_imap`): consome a chave `run_id:run_attempt:operacao` no Durable Object **antes de ler o corpo**. Chave já consumida: **409**. Falha, indisponibilidade ou tempo esgotado do registro: **503**, e a operação **não acontece**.
4. Só então lê o corpo (limite de 2 KB, esquema fechado por operação). `validar_oidc` e `validar_uso_unico`: exatamente `operacao`. `p1_imap`: exatamente `operacao`, `usuario` (endereço de e-mail) e `senha` (senha específica de app, `xxxx-xxxx-xxxx-xxxx`, letras minúsculas), com formato estrito; as **pontas** de `usuario` e `senha` são aparadas (segredos colados no GitHub costumam levar quebra de linha), espaço no meio continua recusado. `p2_imap`: os mesmos três campos mais `uid` **opcional** (número inteiro de 1 a 4294967295; sem ele, lê a última mensagem da pasta). Qualquer outro campo, tipo ou formato é recusado com **400** e um `detalhe` de lista fechada que diz qual regra falhou (`corpo_nao_json`, `corpo_nao_objeto`, `operacao_invalida`, `campos_inesperados`, `campo_ausente_usuario`, `campo_ausente_senha`, `usuario_tipo_invalido`, `usuario_formato_invalido`, `senha_tipo_invalida`, `senha_formato_invalida`, `uid_invalido`), **nunca o valor recebido**.
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

## P2 · leitura controlada de uma mensagem (`src/mensagem.mjs` e `src/mime.mjs`)

**Escopo:** na mesma sessão IMAP, localizar a pasta `RAC-TESTE`, abri-la em **somente leitura**, escolher **uma** mensagem (o UID pedido ou a última), ler cabeçalhos, texto puro, HTML e a estrutura de anexos, ler os bytes de **um** anexo pequeno e devolver **só indicadores**. Nada é guardado.

- **Comandos (lista fechada, conferida a cada envio, em teste e na inspeção do pacote):** `CAPABILITY`, `LOGIN` (uma única tentativa), `LIST ""` **só** com a pasta de teste (sem curinga), `EXAMINE` **só** a pasta de teste, `FETCH * (UID)` (descobrir a última mensagem), `UID FETCH <um UID>` (estrutura e leituras **parciais** com `BODY.PEEK`, que não alteram flags) e `LOGOUT`. A pasta vem só da política (`politica.p2.pasta`), nunca do cliente.
- **Proibido (não existe no código; a conferência recusa antes de ir ao socket):** `SELECT`, `STORE`, `COPY`, `MOVE`, `EXPUNGE`, `DELETE`, `APPEND`, `CREATE`, `RENAME`, qualquer busca (`SEARCH`), intervalos ou listas de UIDs, leitura `BODY[...]` sem `PEEK`, `RFC822` (só `RFC822.SIZE`), `FLAGS`, outras pastas, SMTP.
- **Uma mensagem por execução.** O uso único (`run_id:run_attempt:p2_imap`) vale para a P2 como para a P1; erro não se repete sozinho.
- **O que é lido (limites da política, `politica.p2`):** cabeçalhos até 8 KB (só `FROM TO CC SUBJECT DATE MESSAGE-ID MIME-VERSION CONTENT-TYPE`), texto puro e HTML até 32 KB cada (leitura parcial pedida ao servidor), um anexo cujo tamanho **codificado** seja de até 24 KB (o primeiro que couber; anexos comuns antes dos embutidos), estrutura MIME de até 32 KB, 30 partes e 6 níveis, 256 KB no total da sessão, 200 linhas soltas por comando, 20 s de prazo. Acima do limite: leitura truncada (`truncado`) ou código de erro fechado.
- **Decodificação:** base64, quoted-printable, 7bit/8bit; charsets `utf-8`, `us-ascii`, `iso-8859-1`, `iso-8859-15` e `windows-1252` (outro charset vira `charset_nao_suportado`). Byte inválido marca `caracteres_invalidos`; corte no meio de um caractere não conta como inválido.
- **Resposta (esquema fechado; só booleanos, contagens, tamanhos e códigos):** `ok`, `operacao`, `estagio`, `autenticado`, `logout`, `pasta_teste_existe`, `somente_leitura_confirmado` (o servidor informou `[READ-ONLY]`), `mensagens_na_pasta` e `mensagem` com: `tamanho_bytes`, `multipart`, `multipart_subtipo`, `partes`, `profundidade`; `cabecalhos` (presença de `from`, `to`, `cc`, `assunto`, `data`, `message_id`, `mime_version`, data válida, assunto codificado, bytes, truncado, linhas inválidas); `texto_puro` e `html` (`presente`, `status`, tamanhos, `truncado`, `charset`, `caracteres`, `linhas`, `caracteres_invalidos` e, no HTML, `tem_script`, `tem_imagem_remota`, `tem_formulario`, `tem_iframe`); `anexos` (total, embutidos, soma e maior tamanho, contagem por categoria fechada); `anexo_lido` (`status`, tamanho codificado, bytes decodificados, `tipo_detectado` pela assinatura dos bytes, `tipo_confere`). **Nunca saem:** assunto, endereços, texto, HTML, nomes de pasta ou de arquivo, bytes de anexo, texto do servidor nem a credencial.
- **Erros (lista fechada, `ERROS_P2`):** `conexao_falhou`, `timeout`, `saudacao_invalida`, `capability_falhou`, `login_desabilitado`, `autenticacao_recusada`, `login_erro_protocolo`, `pasta_inexistente`, `pasta_erro`, `examine_recusado`, `pasta_vazia`, `uid_invalido`, `uid_inexistente`, `mensagem_erro`, `conteudo_falhou`, `mime_invalido`, `mime_limite_excedido`, `resposta_malformada`, `resposta_inesperada`, `resposta_grande_demais`, `limite_excedido`, `comando_nao_permitido`, `falha_inesperada`.
- **Fora do escopo desta etapa:** sincronização incremental, outras pastas, busca, alteração de flags, mover/copiar/excluir, SMTP, guardar qualquer conteúdo.

## Política de confiança (fixa no código, sem segredo)

Arquivo `src/politica.mjs`. Exigidas e conferidas com valor exato: `iss`, `aud` (uma por operação: `rac-inbox-icloud-poc:<operacao>`), `sub` (formato imutável do GitHub e o clássico, ambos exatos), `repository`, `repository_id`, `repository_owner`, `repository_owner_id`, `environment` (`icloud-auth-poc`), `ref` (só `refs/heads/main`: o workflow privilegiado existe só na `main`, Desenho B), `event_name` (`workflow_dispatch`), `workflow_ref` e `job_workflow_ref`, `runner_environment` (`github-hosted`), `exp`, `iat` e, se presente, `nbf`. **Também obrigatórias, com formato estrito:** `jti` (texto de 8 a 128 caracteres de `A-Za-z0-9._:-`), `run_id` (texto numérico até 20 dígitos, sem zero à esquerda) e `run_attempt` (até 4 dígitos). Tolerância de relógio de 60 s. Cabeçalhos `jku`, `x5u`, `x5c`, `jwk` e `crit` e qualquer algoritmo diferente de RS256 são recusados.

## Chaves (JWKS)

O documento de descoberta é lido do emissor fixo; o `jwks_uri` só é aceito em HTTPS e do mesmo host. Nunca se busca chave em URL indicada pelo token. A busca usa `redirect: "manual"` e recusa qualquer 3xx (o runtime do Cloudflare Workers **não** aceita `redirect: "error"`: lança `TypeError`). Quando as chaves não podem ser obtidas, a resposta 401 traz `motivo: "jwks_indisponivel"` e um `detalhe` de lista fechada (`DETALHES_JWKS`), nunca texto de erro, URL, token ou claim. Cache só em memória do isolate (10 min); kid desconhecido provoca no máximo uma recarga por minuto; com o cache vencido e o emissor fora, a validação **falha fechada na hora**. Uma chave revogada vale até o fim do cache fresco (10 min).

## Execução

Pelo workflow manual `.github/workflows/icloud-auth-probe.yml` (três jobs: `verificar` sem secrets, `provisionar` com o Environment `cloudflare-poc` e `executar` com o Environment `icloud-auth-poc`), com as entradas `operacao` e, só para a P2, `uid_mensagem` (opcional). Guia: `docs/icloud-poc-deploy.md`.

- **Validação OIDC real:** executada em 14/11/2026 (execução 43535195165, commit da POC `d1f25d3`; Documento 10, seção 13.18). Não autentica conta Apple.
- **Uso único:** publicado e **comprovado no runtime real** em 14/11/2026 (execução 43585089326: 1 aceita, 9 recusadas, replay recusado; Documento 10, seção 13.20).
- **P1: COMPROVADA em 14/11/2026** (execução [43599209307](https://github.com/raynercarvalho1/rac/actions/runs/43599209307), `main` `4ff3ed9`, sucesso): autenticação IMAP, capabilities e estrutura de pastas, sem ler mensagens e sem alterar a caixa. A tentativa anterior (43597133032) falhou com HTTP 400 `esquema_invalido` antes de tocar na Apple; a correção (`detalhe` de lista fechada e pontas dos segredos aparadas) está na branch (Documento 10, seção 13.20).
- **P2: implementada e testada localmente; NÃO publicada e NÃO executada no iCloud real** (Documento 10, seção 13.21). Só passa a "concluída" depois da prova real autorizada pelo dono.
- **Pré-requisitos do dono:** o workflow com replay + P1 mesclado na `main`; os Environments com aprovador e só a `main`; para a P1, os secrets `ICLOUD_USER` e `ICLOUD_APP_PASSWORD` **só** no Environment `icloud-auth-poc`.
- O Wrangler vem do lockfile da pasta `experimentos/icloud-auth-probe-ferramenta` e a publicação usa uma configuração escrita no workflow (a `wrangler.jsonc` desta pasta não é lida na publicação, só conferida; ela inclui o Durable Object `CONSUMO` e a migração `v1`).

## Limites que continuam valendo

- **Comprovado em 14/11/2026:** o uso único no runtime real, a criação do Durable Object com o token Cloudflare existente e a P1 no servidor real da Apple. **Não comprovado:** a P2 (nem no runtime publicado nem no servidor real da Apple: nada garante ainda o formato exato das respostas `BODYSTRUCTURE`/`FETCH` do iCloud) e o CPU por requisição no Workers Free (a P2 decodifica até ~100 KB por chamada; o limite de CPU do plano Free é curto e não foi medido).
- **Fora do escopo desta etapa:** SMTP, leitura fora da pasta `RAC-TESTE`, sincronização, envio e qualquer alteração da caixa (P3 a P7).

Testes: `node --test tests/icloud_auth_probe.test.mjs tests/icloud_auth_probe_consumo.test.mjs tests/icloud_auth_probe_imap.test.mjs tests/icloud_auth_probe_p2.test.mjs tests/icloud_auth_probe_worker.test.mjs tests/icloud_auth_probe_contrato.test.mjs` (o `_p2` usa um servidor IMAP falso em memória; o `_contrato` executa os passos reais do workflow contra o Worker real, com o IMAP falso e valores sentinela, sem rede externa).
