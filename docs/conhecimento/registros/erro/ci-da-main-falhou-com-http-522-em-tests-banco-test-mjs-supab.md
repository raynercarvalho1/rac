---
titulo: CI da main falhou com HTTP 522 em tests/banco.test.mjs (Supabase real) num commit só de documentação
tipo: erro
categoria: testes
tags: ci, banco, rede, supabase
estado: ativo
origem: 22/11/2026, run 337 da main
data: 2026-11-22
---

## Causa

tests/banco.test.mjs chama o Supabase de produção pela internet; o servidor respondeu 522 (conexão expirou) e o teste 'a tabela/view compras existe no banco e está fechada sem login' falhou, num commit que só mudava documentação.

## Solução

Conferir o log (get_job_logs), notar que o erro é de rede (522) e que o commit não toca código; o run seguinte da main, que contém o mesmo conteúdo, passou. Não foi preciso corrigir código nem repetir o run.

## Prevenção

Ao ver falha em tests/banco.test.mjs com 5xx, comparar com o run seguinte da main antes de culpar o diff; só repetir o workflow com autorização do dono. Mudar esse teste para não depender da rede é decisão do dono.
