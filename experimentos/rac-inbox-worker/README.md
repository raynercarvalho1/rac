# rac-inbox-worker — Worker de produto do RAC Inbox (P7 / I2)

Transporte **IMAP somente leitura** para o iCloud. É chamado **só pela Edge Function `rac-inbox`** do Supabase; o navegador nunca fala com ele. Contexto: [docs/inbox.md](../../docs/inbox.md) (seção "Canal assinado com o Worker") e [Documento 10](../../docs/planejamento/10-rac-inbox.md).

**Estado:** código e testes **simulados** prontos (`tests/rac_inbox_worker.test.mjs`, servidor IMAP falso). **Não publicado, nunca falou com o iCloud real.** Fica nesta branch, fora da `main`; a publicação depende de autorizações do dono (secrets, workflow/Environment da Cloudflare e a função `rac-inbox` v2).

## Rota única

`POST /v1/op` (JSON, até 4 KiB). Qualquer outra rota ou método = 404.

| Cabeçalho | Conteúdo |
|---|---|
| `X-RAC-Key-Id` | `k1` (ou `k2`, na rotação) |
| `X-RAC-Timestamp` | segundos Unix; aceito só dentro de ±60 s |
| `X-RAC-Nonce` | 16 a 43 caracteres base64url, de uso único |
| `X-RAC-Operacao` | a operação (igual à do corpo) |
| `X-RAC-Assinatura` | `v1=` + HMAC-SHA256 em hexadecimal |

Assinatura sobre a string canônica `rac-canal-v1 \n POST \n /v1/op \n <chave> \n <timestamp> \n <nonce> \n <operacao> \n <sha256 do corpo>`.

Ordem de defesa: corpo lido com limite → assinatura verificada (nada é interpretado antes) → nonce consumido num Durable Object (replay = 409; registro fora do ar = 503 e a operação não acontece) → esquema fechado do corpo → operação IMAP → resposta de esquema fechado.

## Operações (todas só leem)

`testar_conta`, `listar_pastas`, `estado_pasta`, `listar_mensagens` (`ultimas`, `desde_uid` ou `antes_de_uid`), `ler_mensagem` (texto puro; **nunca HTML**) e `baixar_anexo` (até 3 MiB codificados). Comandos IMAP permitidos: `CAPABILITY`, `LOGIN`, `LIST`, `EXAMINE`, `FETCH`, `UID FETCH`, `UID SEARCH`, `LOGOUT` (com `BODY.PEEK`, que não altera a flag `\Seen`). Nada de `SELECT`, `STORE`, `COPY`, `MOVE`, `APPEND`, `EXPUNGE`, `IDLE`.

## Secrets e configuração (valores nunca no repositório)

| Nome | Onde | Para quê |
|---|---|---|
| `RAC_CANAL_K1` | secret do Worker **e** da função `rac-inbox` (mesmo valor) | chave do canal (mínimo 32 caracteres aleatórios) |
| `RAC_CANAL_K2` | idem, **só durante uma rotação** | segunda chave aceita |
| `NONCES` | binding do Durable Object (`wrangler.jsonc`) | registro anti-replay |

A credencial iCloud **não** é secret, variável, KV, D1 nem log do Worker: chega no corpo de cada chamada, vive em variáveis locais dela e some.
