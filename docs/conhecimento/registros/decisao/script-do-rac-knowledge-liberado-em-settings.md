---
titulo: Script do RAC Knowledge liberado em settings
tipo: decisao
categoria: seguranca
tags: permissoes, knowledge, agentes
estado: ativo
origem: CLAUDE.md; .claude/settings.json; tests/permissoes.test.mjs
data: 2026-11-20
relacionados: procedimento/usar-o-rac-knowledge-como-agente
---

node scripts/conhecimento.mjs passa sem pedir só com antes, buscar, listar, ver, novo, indice e verificar (entradas explícitas em .claude/settings.json). Qualquer outro comando ou argumento continua pedindo. O script só escreve em docs/conhecimento/ e recusa nome de arquivo com barra ou ..

## Motivo

O agente precisa consultar antes e registrar depois em todo lote sem aprovação repetida; o escopo é fechado e sem curinga genérico, e o teste de permissões cobre as variantes perigosas. Autorizado pelo dono em 20/11/2026.
