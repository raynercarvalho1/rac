# RAC Inbox — Worker da prova autenticada iCloud (arquitetura S3, OIDC)

Experimento descartável da Fase I0. **Nesta etapa o Worker não fala com a Apple**: ele só valida o token OIDC do GitHub Actions e confere que recebeu uma credencial bem formada, sem usá-la, guardá-la, registrá-la nem devolvê-la. IMAP e SMTP reais ainda não existem aqui e exigem implementação e autorização específicas (Documento 10, seções 13.11 a 13.13).

## O que ele faz

`POST /auth-probe`, nesta ordem:

1. Confere método e rota (qualquer outra coisa responde 404, sem ler o corpo).
2. Valida o JWT do cabeçalho `Authorization: Bearer ...` (assinatura RS256 com as chaves públicas do emissor oficial do GitHub e todas as claims da política). Falhou: responde 401 com um **motivo de lista fechada** (nunca valores) e **o corpo não é lido**.
3. Só então lê o corpo, com limite de 2 KB e esquema fechado (`operacao`, `usuario`, `senha`; sem campos extras e sem caracteres de controle).
4. Confere que a operação do corpo é a mesma da audiência do token (um token vale para uma operação).
5. Operação `validar_oidc` (única disponível): responde só códigos e booleanos. A senha existe apenas em memória durante a requisição.

## Política de confiança (fixa no código, sem segredo)

Arquivo `src/politica.mjs`. Exigidas e conferidas com valor exato: `iss`, `aud` (uma por operação: `rac-inbox-icloud-poc:<operacao>`), `sub` (formato imutável do GitHub e o clássico, ambos exatos), `repository`, `repository_id`, `repository_owner`, `repository_owner_id`, `environment` (`icloud-auth-poc`), `ref` (só a branch da POC), `event_name` (`workflow_dispatch`), `workflow_ref` e `job_workflow_ref` (o workflow autorizado nessa branch), `runner_environment` (`github-hosted`), `exp`, `iat` e, se presente, `nbf`. Tolerância de relógio de 60 s e idade máxima do token de 600 s. Cabeçalhos `jku`, `x5u`, `x5c`, `jwk` e `crit` e qualquer algoritmo diferente de RS256 são recusados.

## Chaves (JWKS)

O documento de descoberta é lido do emissor fixo; o `jwks_uri` dele só é aceito se for HTTPS e do mesmo host do emissor. Nunca se busca chave em URL indicada pelo token. Cache só em memória do isolate (10 min); kid desconhecido provoca no máximo uma recarga por minuto; se o emissor ficar indisponível, o conjunto antigo é reaproveitado por até 1 h e depois a validação **falha fechada**.

## Limites que continuam valendo

- **Repetição (replay):** assinatura, `exp` curto e audiência não impedem reutilizar o mesmo token dentro da validade. A janela é pequena e o token só serve a uma operação, mas **uso único exigiria persistência** (por exemplo Durable Object com SQLite), recurso que não foi criado. Hoje a única operação é o ensaio `validar_oidc`, sem efeito. Antes de habilitar qualquer operação real, a decisão está no Documento 10, seção 13.13.
- **Formato real das claims:** o `sub` em formato imutável com Environment é inferência da documentação do GitHub; o primeiro run real o confirma.
- **CPU no Cloudflare:** medida só em Node (indicativa). A medição no runtime da Cloudflare exige deploy e autorização.

## Execução

Pelo workflow manual `.github/workflows/icloud-auth-probe.yml` (dois jobs, Environments `cloudflare-poc` e `icloud-auth-poc`). **Não foi executado.** Pré-requisitos do dono: Environment `icloud-auth-poc` (aprovador obrigatório, branch restrita) com `ICLOUD_USER` e `ICLOUD_APP_PASSWORD`, e o workflow presente na branch padrão para o botão "Run workflow" existir. Sem os secrets, o job `executar` falha antes de pedir o token.

Testes: `node --test tests/icloud_auth_probe.test.mjs tests/icloud_auth_probe_escopo.test.mjs`.
