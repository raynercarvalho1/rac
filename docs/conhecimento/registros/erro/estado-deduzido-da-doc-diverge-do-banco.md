---
titulo: Estado de migrations deduzido da documentação diverge do banco
tipo: erro
categoria: banco
tags: migration, estado, mcp
estado: resolvido
origem: RAC Knowledge, estado seed de 20/11/2026
data: 2026-11-20
relacionados: estado/estado-do-projeto-em-20-11-2026, erro/migration-pendente-nao-se-confunde-com-aplicada
---

O registro de estado semeado dizia 054, 057, 059 e 060 pendentes, mas o banco real já as tinha aplicadas.

## Causa

O estado foi deduzido de docs/mapa.md e do histórico, que podem ficar atrasados; não havia acesso ao banco na hora.

## Solução

Estado corrigido com list_migrations do Supabase MCP (aplicadas 051 a 057, 059, 060, 062; pendentes 050 e 058).

## Prevenção

Antes de afirmar o que está aplicado ou pendente, consultar list_migrations (leitura) e citar a data da conferência; docs podem estar atrasados.
