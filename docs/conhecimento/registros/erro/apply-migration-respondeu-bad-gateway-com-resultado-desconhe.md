---
titulo: apply_migration respondeu Bad Gateway com resultado desconhecido
tipo: erro
categoria: supabase
tags: supabase, migration, conector
estado: ativo
origem: Lote 1, 27/11/2026
data: 2026-11-27
---

## Causa

O gateway do conector Supabase falhou ao enviar uma migration grande (≈31 KB); a resposta de erro não diz se a migration foi aplicada.

## Solução

Não repetir às cegas: ler list_migrations (e o estado das tabelas) até o conector voltar; só então reenviar. A 070 não tinha sido aplicada e o segundo envio funcionou.

## Prevenção

Migration transacional (begin/commit) e reexecutável; depois de aplicar, conferir por hash do corpo de cada função (md5 de prosrc contra o arquivo), contagem do catálogo, RLS, privilégios e a conferência de supabase/conferencias/. Nunca declarar aplicada sem essa leitura.
