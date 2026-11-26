---
titulo: inbox-sync entra no Monitor; a 055 fica em propostas/ (job ativo conferido em cron.job)
tipo: decisao
categoria: monitor
tags: monitor, inbox, pg_cron
estado: ativo
origem: Monitor M1 e M2, 26/11/2026
data: 2026-11-26
---

## Motivo

Leitura de cron.job em produção (26/11/2026) mostrou o job inbox-sync ativo (*/10 * * * *), fora do catálogo, com o arquivo 055 ainda marcado 'não aplicada'. Evidência real em inbox_sincronizacao (tentativa, falhas seguidas, duração). Mover a 055 para supabase/ quebraria os testes do Inbox, então o arquivo segue em propostas/ com o estado anotado no cabeçalho e o teste do Monitor o lê por uma lista explícita (APLICADAS_EM_PROPOSTAS). Só o dono vê a linha (tabela por dono). fiscal-validacao (061) não existe em produção e continua fora.
