---
titulo: Tabela pessoal nova: RLS, sem anon, mfa, backup e teste
tipo: regra
categoria: banco
tags: migration, rls, mfa, backup
estado: ativo
origem: CLAUDE.md; docs/seguranca.md (Catálogo da auditoria)
data: 2026-11-20
relacionados: procedimento/sql-novo-ate-a-producao
---

Migration numerada em `supabase/`, reexecutável, com RLS ligado e `revoke all ... from anon`. Entra em `tests/seguranca.test.mjs`, em `NUCLEO.SEG_TABELAS` (backup) e no catálogo da auditoria (`seguranca_catalogo`), e ganha a trava restritiva "mfa" da 022. Restauração nunca grava sem prévia e confirmação.
