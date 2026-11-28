---
titulo: Testes que dependem da data ou da hora do relógio quebram sozinhos (27 de novembro fixo; rotina das 6h no monitor)
tipo: erro
categoria: testes
tags: testes, data
estado: ativo
origem: Lote 4, 28/11/2026
data: 2026-11-28
---

## Causa

tests/workspace_nucleo.test.mjs esperava '27 de novembro' e 'sexta-feira' fixos no widget de data; tests/monitor.test.mjs monta falhas relativas a Date.now() e depende da hora do dia em relação à rotina das 6h. Ambos já falhavam no HEAD antes do lote.

## Solução

O teste do widget de data passou a calcular o dia, o mês e o dia da semana do próprio relógio. O do monitor depende da hora do dia e ficou como está (não é do escopo do lote).

## Prevenção

Teste novo nunca fixa a data de hoje: calcula a partir do relógio ou injeta a data. Veja tests/captura_nucleo.test.mjs (hoje = 2026-11-28 injetado).
