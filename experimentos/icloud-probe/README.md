# RAC Inbox — prova de conectividade iCloud (Cloudflare Worker)

Prova técnica isolada da Fase I0. Verifica apenas:

- abertura de TCP + TLS no servidor IMAP da Apple (`imap.mail.me.com:993`) e leitura da saudação IMAP;
- abertura de TCP no servidor SMTP da Apple (`smtp.mail.me.com:587`), `EHLO`, comando `STARTTLS`, handshake TLS e um segundo `EHLO` dentro do túnel TLS.

**Não autentica na conta Apple, não usa senha específica de app, não acessa caixa postal, não lê mensagens, não envia e-mail e não grava dados no Supabase.** Os endereços e portas são fixos no código; a rota não aceita host ou porta enviados pelo cliente.

## Testes locais

Na raiz do repositório:

```bash
node --test tests/icloud_probe.test.mjs
```

O modo local do Wrangler é útil para conferir a rota e o token, mas não comprova a saída de rede da infraestrutura Cloudflare. A prova real de rede ocorre somente depois de publicar este Worker temporário na conta Cloudflare. O `wrangler dev` local não comprova a saída TCP dos datacenters Cloudflare.

## Publicação manual (conta Cloudflare do dono)

1. Autentique o Wrangler na conta Cloudflare do dono e confira a conta ativa:

   ```bash
   npx wrangler@4.161.0 login
   npx wrangler@4.161.0 whoami
   ```

2. Na pasta `experimentos/icloud-probe`, publique o Worker com o nome exclusivo `rac-icloud-connectivity-poc`:

   ```bash
   npx wrangler@4.161.0 deploy
   ```

3. Gere localmente um token aleatório com pelo menos 32 caracteres (por exemplo, `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`). Guarde-o num gerenciador de senhas; **não o coloque no Git, no RAC ou neste chat**.

4. Cadastre-o como Secret do Worker:

   ```bash
   npx wrangler@4.161.0 secret put PROBE_TOKEN
   ```

   Cole o valor no prompt seguro do Wrangler. Não use `[vars]` para este token.

5. Faça uma chamada POST autenticada para a URL `workers.dev` mostrada pelo Wrangler:

   ```bash
   curl -X POST "https://<worker>.<subdominio>.workers.dev/probe" \
     -H "Authorization: Bearer <TOKEN>"
   ```

   A resposta informa separadamente o resultado de IMAP 993 e SMTP 587/STARTTLS. Não contém saudação bruta do servidor nem dados de e-mail.

6. Guarde somente o JSON de resultado, sem o token. Depois da prova, o Worker pode ser removido pelo dono no painel Cloudflare ou com `npx wrangler@4.161.0 delete`.

## Segurança e custo

- O endpoint só aceita `POST /probe`, exige `Authorization: Bearer ...` e responde `404` para caminhos/métodos/token incorretos.
- A credencial é apenas um token aleatório de acesso a esta ferramenta de diagnóstico. Não é uma credencial iCloud e não concede acesso à caixa postal.
- Não há Cron, Durable Object, binding ao Supabase, custom domain nem rota de produção neste experimento.
- Comece no plano Cloudflare Free. A chamada HTTP tem limite de 10 ms de CPU nesse plano; se a verificação TLS exceder esse limite, a resposta pode falhar por limite de CPU. Não atualize para Workers Paid sem avaliar o resultado e aprovar o custo mínimo atual de US$ 5/mês.
- O sucesso comprova conectividade e negociação TLS no Worker, mas **não** comprova autenticação iCloud, leitura de mensagens, envio real ou sincronização IMAP IDLE.
