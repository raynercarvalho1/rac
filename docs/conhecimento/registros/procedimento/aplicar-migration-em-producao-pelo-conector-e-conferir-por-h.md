---
titulo: Aplicar migration em produção pelo conector e conferir por hash
tipo: procedimento
categoria: supabase
tags: supabase, migration, procedimento
estado: ativo
origem: Lote 1, 27/11/2026
data: 2026-11-27
---

1) Rodar os testes de banco em PGlite (tests/*_sql.test.mjs) e o banco.test.mjs; 2) apply_migration com o corpo executável idêntico ao arquivo; 3) conferir por leitura: list_migrations, md5(prosrc) de cada função contra o texto do arquivo (python: hashlib.md5 do trecho entre os $$), has_function_privilege('anon'), políticas e privilégios, seed e catálogo; 4) trocar o cabeçalho do arquivo para APLICADA EM PRODUÇÃO com a data e a versão da migration; 5) get_advisors de segurança; 6) tests/banco.test.mjs exige que a tabela exista em produção ANTES do merge, então a migration vai antes do PR. Tabela nova: catálogo (050), NUCLEO.SEG_TABELAS, tests/seguranca.test.mjs e a lista de arquivos com trava no teste do catálogo.
