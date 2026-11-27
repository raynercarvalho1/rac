---
titulo: Inbox em produção nos três provedores; iCloud sem excluir e arquivar (27/11/2026)
tipo: estado
categoria: inbox
tags: inbox, icloud, gmail, outlook
estado: ativo
origem: validação do dono em 27/11/2026 e leitura do Supabase
data: 2026-11-27
relacionados: erro/icloud-arquivar-e-excluir-falham-sem-move-e-pastas-sem-atrib, estado/estado-do-projeto-em-20-11-2026
---

Conferido por leitura em 27/11/2026: migrations 051 a 056 e 063 aplicadas (055 inclusive: job inbox-sync */10 ativo; arquivo ainda em supabase/propostas/), função rac-inbox v20 ativa, 4 contas (2 Gmail, 1 iCloud, 1 Outlook) sincronizando sem falhas, Vault coerente. Validação MANUAL do dono (não automatizada): Gmail e Outlook OK em enviar, responder a todos, encaminhar, excluir e arquivar; iCloud OK em enviar, responder a todos e encaminhar, FALHA em excluir e arquivar. Código rac-inbox@i4.4 (completarUsos em sync.ts e diagnóstico de UIDPLUS em organizar.ts) pronto, NÃO publicado. Pendente: decisão do dono sobre o caminho do iCloud sem MOVE e migração de Compras e Carreira do gmApi. Este registro supera o texto antigo de estado/estado-do-projeto-em-20-11-2026 e o de docs/mapa.md sobre 'pendente'.
