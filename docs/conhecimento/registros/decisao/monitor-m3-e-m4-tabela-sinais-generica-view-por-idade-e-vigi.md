---
titulo: Monitor M3 e M4: tabela sinais genérica, view por idade e vigia monitor-alerta isolado
tipo: decisao
categoria: monitor
tags: monitor, sinais, push, pg_cron
estado: ativo
origem: Monitor M3 e M4, 26/11/2026
data: 2026-11-26
---

## Motivo

Decisões do dono em 26/11/2026: (1) tabela genérica sinais do Documento 04, reutilizável pelo RAC Hoje (incidente com chave única, aberto/fechado, histórico, sem IA nem adiar); (2) Edge Function independente monitor-alerta chamada por pg_cron, sem tocar na garmin, push só ao dono, sem Telegram (cópia isolada do push, como as outras funções); (3) alertam só Rotina das 6h, Newsletter, Inbox e os robôs de notícias e vagas (pela data real de coleta dos JSON); Radar, Central Fiscal e testes nunca alertam; (4) verificação a cada 30 min, um aviso por incidente, até 3 pushes por dia, silêncio das 22h às 7h, sem push de recuperação; atrasado vira falhou no MESMO incidente sem novo push; limite e silêncio nunca descartam incidente (ficam em sinais e saem num push consolidado). Decisão técnica minha: o banco não interpreta cron, então a view usa a IDADE da última execução (Rotina 25 h, Newsletter 14 h, Inbox 30 min) e a tela segue pelo cron; paridade provada em teste nos casos claros.
