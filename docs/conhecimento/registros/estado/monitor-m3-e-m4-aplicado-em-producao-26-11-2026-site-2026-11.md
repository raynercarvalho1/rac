---
titulo: Monitor M3 e M4: aplicado em produção (26/11/2026); site 2026-11-26.2 a publicar
tipo: estado
categoria: monitor
tags: monitor, sinais, estado
estado: ativo
origem: Monitor M3 e M4, 26/11/2026
data: 2026-11-26
relacionados: decisao/monitor-m3-e-m4-tabela-sinais-generica-view-por-idade-e-vigi, erro/vigia-em-producao-deu-500-service-role-sem-select-nas-tabela
---

Em produção: migrations 067 (tabela sinais, view monitor_processos security_invoker, funções do ciclo), 068 (SELECT por coluna ao service_role) e 069 (pg_cron monitor-alerta */30), conferidas por leitura; Edge Function monitor-alerta v1 ativa (verify_jwt false). Ensaio (tipo ensaio) respondeu 200 sem gravar nada; a garmin não foi tocada. Ao implementar, o primeiro ensaio deu 500 por falta de SELECT do service_role (erro registrado; corrigido pela 068). A primeira rodada real, o push ao aparelho do dono e a publicação do site 2026-11-26.2 (bloco Ocorrências recentes em #monitor) são verificados no histórico diário. Limites: o vigia não avisa da própria falha; falha de workflow do GitHub não é visível ao servidor (só a data de coleta dos JSON). Pendente do dono: validar no iPhone o push e o bloco Ocorrências recentes. Detalhes: docs/planejamento/05, seção 4.5.
