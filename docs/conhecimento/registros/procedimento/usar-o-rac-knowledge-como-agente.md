---
titulo: Usar o RAC Knowledge como agente
tipo: procedimento
categoria: processo
tags: knowledge, agentes
estado: ativo
origem: docs/conhecimento.md
data: 2026-11-20
relacionados: regra/documentar-ao-concluir-o-lote
---

Antes de qualquer trabalho: `node scripts/conhecimento.mjs antes "a tarefa"` (ou Grep em `docs/conhecimento/registros`). Ao concluir, antes do commit: registrar decisão nova (com motivo), erro relevante (causa-raiz, solução, prevenção), procedimento alterado e estado atualizado (`novo` ou editar o `.md`), rodar `indice` e `verificar`, e commitar tudo com o lote. O relatório final diz "RAC Knowledge: registrado …" ou "nada novo, porque …". O dono importa para o site em RAC Knowledge → ⇄ Repositório.
