---
titulo: Vigia em produção deu 500: service_role sem SELECT nas tabelas que a view lê (o teste local escondeu)
tipo: erro
categoria: monitor
tags: monitor, service_role, permissoes, pglite
estado: ativo
origem: Monitor M3 e M4, 26/11/2026
data: 2026-11-26
relacionados: erro/radar-falhava-com-42501-no-service-role
---

## Causa

O service_role não tem SELECT em rotina_log, inbox_contas, inbox_sincronizacao e notas_fiscais_entradas (as tabelas foram criadas sem grant a ele). A view monitor_processos_em e a função monitor-alerta leem essas tabelas como service_role, então o ensaio em produção respondeu 500 (permissão negada). O harness do PGlite dava privilégios totais ao service_role por default privileges e por isso os testes passaram.

## Solução

Migration 068 com SELECT por coluna, só nas colunas usadas (sem o resumo da rotina e sem o endereço de e-mail das contas). O harness (tests/_monitor_banco.mjs) agora revoga o service_role nas tabelas de origem antes de aplicar a 068, imitando a produção, e há teste do caso vermelho (sem a 068 dá 42501).

## Prevenção

Todo código que roda como service_role precisa de teste com o service_role SEM privilégios herdados do harness; ao criar leitura nova pelo servidor, conferir has_table_privilege/has_column_privilege em produção antes da função. Já havia um erro parecido no Radar (42501 no service_role).
