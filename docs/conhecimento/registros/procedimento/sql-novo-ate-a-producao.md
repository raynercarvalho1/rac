---
titulo: SQL novo até a produção
tipo: procedimento
categoria: banco
tags: migration, sql, producao
estado: ativo
origem: CLAUDE.md; skill rac-sql-novo; docs/seguranca.md
data: 2026-11-20
relacionados: regra/tabela-pessoal-nova
---

Arquivo `supabase/NNN_nome.sql` numerado, que pode rodar de novo sem erro, começando por `-- status: pendente` até ser aplicada. Conferência só leitura em `supabase/conferencias/NNN_conferir_producao.sql`. O dono aplica no SQL Editor antes do site ir ao ar e depois troca o cabeçalho para aplicada. Nunca `psql`, CLI do Supabase nem API de gerenciamento a partir do agente.
