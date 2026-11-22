---
titulo: CSS compartilhado removido como sobra quebrou Agenda e cabeçalho da Saúde
tipo: erro
categoria: codigo
tags: css, agenda, saude, rh-kpis, limpeza
estado: resolvido
origem: pedido do dono em 22/11/2026 (prints do iPhone); commit c787aa0
data: 2026-11-22
---

Na Agenda os 4 cartões de indicadores viraram faixas estreitas empilhadas; no cabeçalho da Saúde o botão "Atualizar agora" ficou por cima do título.

## Causa

O Lote 1 do Hoje (c787aa0) removeu de `css/rac.css` as três regras de `.rh-kpis` por parecerem exclusivas do Hoje, mas a Agenda (`js/agenda.js`), a aba Sono e Atividades da Saúde (`js/saude-hub.js`) e o catálogo de componentes ainda usam a classe. O teste não olhava o CSS. Já o `.rh-hero-acoes` é absoluto no canto e, na Saúde, a regra de celular dá `width:100%` a ele, o que o estica por cima do título.

## Solução

Regras de `.rh-kpis` restauradas (4 colunas, 2 até 1100px, gap menor até 380px); `.sh .rh-hero-acoes` volta ao fluxo normal; botão "Ocultar valores" saiu do cabeçalho (o ajuste continua em Saúde → Inteligência → Ajustes). Versão 2026-11-22.7.

## Prevenção

Antes de apagar uma classe do CSS, procurar o uso em `js/` e `index.html` (grep). Teste em `tests/agenda_tela.test.mjs` exige a grade de `.rh-kpis`.
