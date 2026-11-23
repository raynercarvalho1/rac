---
titulo: Função garmin: o agente edita e publica (política de autonomia, 23/11/2026)
tipo: regra
categoria: seguranca
tags: garmin, edge-function
estado: ativo
origem: CLAUDE.md
data: 2026-11-23
---

`supabase/functions/garmin` deixou de ser intocável: a Política Permanente de Autonomia Operacional (23/11/2026) libera ao agente editar, testar e publicar a função (e rodar SQL aditivo de apoio) sem autorização individual. Cuidados que continuam por qualidade, não por aprovação: a função só acrescenta chaves em `garmin_dia.dados.extras` e linhas em `garmin_rotas`, nunca apaga nem sobrescreve dados do relógio; tabela nova que a rotina diária grava precisa de `select, insert, update` à `service_role`; publicar com `verify_jwt: false` (a função autentica por conta própria), conferir a versão ativa e preservar CORS, rotina, push, backup e alertas. Endpoints só os oficiais da Personal API (cliente `garmin/connect-personal-api-python`); Training Status e Readiness não existem nela.
