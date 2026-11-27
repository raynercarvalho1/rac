---
titulo: Novo RAC: Lote 0 concluido em documentacao; producao conferida em 27/11/2026
tipo: estado
categoria: projeto
tags: novo-rac, producao
estado: ativo
origem: Lote 0, 27/11/2026
data: 2026-11-27
---

Lote 0 (auditoria e arquitetura) so de documentacao: docs/planejamento/12 a 19, nada implementado, publicado ou alterado em producao. Producao conferida por leitura em 27/11/2026: migrations 051 a 069 no historico do Supabase (050, 058 e propostas 041, 044, 061 NAO aplicadas; seguranca_catalogo nao existe), 58 tabelas com RLS, 7 views, 6 jobs pg_cron, 6 Edge Functions ativas (garmin v25, rac-ia v21, rac-inbox v21, rac-newsletter v11, radar v15, monitor-alerta v1), 2 cofres privados, 2 usuarios; fiscal-consulta so no repositorio. Pre-requisitos do Lote 1: confirmar cadastro aberto desligado em Authentication (nao verificavel pelo conector) e aplicar a 050. Proximo: Lote 1 (espacos e permissoes + motor de Workspace), com a ordem frente as frentes paralelas (gmApi, Financeiro Inteligente) a decidir pelo dono.
