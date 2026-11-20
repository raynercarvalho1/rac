---
titulo: Radar falhava com 42501 no service_role
tipo: erro
categoria: banco
tags: service_role, grant, rls
estado: resolvido
origem: supabase/047_radar_service_role.sql
data: 2026-11-20
---

A rotina do Radar respondia 500 com `42501 permission denied for table radar_lojas`.

## Causa

A 043 concedeu privilégios só ao `authenticated`. Neste projeto o `service_role` não herda privilégio de tabela e ignora RLS mas precisa do GRANT de tabela.

## Solução

Migration 047 com o GRANT mínimo do `service_role` nas tabelas usadas pela função (aplicada em 10/11/2026).

## Prevenção

Tabela nova usada por Edge Function: conceder o mínimo ao `service_role` na própria migration; tabela só do site não recebe nada (como a do RAC Knowledge).
