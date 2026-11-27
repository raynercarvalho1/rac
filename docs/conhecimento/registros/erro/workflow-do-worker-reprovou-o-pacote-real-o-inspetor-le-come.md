---
titulo: Workflow do Worker reprovou o pacote real: o inspetor lê comentários que o esbuild preserva
tipo: erro
categoria: inbox
tags: inbox, worker, workflow, cloudflare
estado: ativo
origem: run 6 do rac-inbox-worker-publicar, 27/11/2026
data: 2026-11-27
relacionados: decisao/icloud-sem-move-copia-confirmada-marca-deleted-e-uid-expunge
---

## Causa

O inspetor de verbos (inspecionar-verbos.mjs) lê o texto cru do bundle do Wrangler. O esbuild preserva alguns comentários dentro de expressões (um comentário dentro de ERROS_IMAP citava MOVE) e o inspetor reprovou 'MOVE fora do UID MOVE restrito'. Os testes passaram porque a fixture e o teste do código-fonte retiram todos os comentários antes de inspecionar, e a fixture foi montada à mão, não pelo Wrangler.

## Solução

Comentário reescrito sem a palavra e a inspeção refeita com o Wrangler 4.161.0 real (dry-run local em cópia temporária): aprovada, com NonceUnico, carimbo único p9.1 e 29 KB comprimido.

## Prevenção

Antes de pedir a publicação de um Worker, rodar o empacotamento real (npm ci --ignore-scripts na ferramenta + wrangler deploy --dry-run --outdir) numa cópia temporária e passar o inspetor no index.js gerado; não citar verbos IMAP em comentários dentro de expressões do imap.mjs.
