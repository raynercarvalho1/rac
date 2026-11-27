---
titulo: Toque na notificação abria a última página (atualização automática sobrescrevia o destino)
tipo: erro
categoria: notificacoes
tags: notificacao, iphone, atualizacao
estado: ativo
origem: lote 27/11/2026
data: 2026-11-27
---

Ao tocar numa notificação (ex.: Newsletter) com o app em segundo plano, abria a página que estava aberta antes (ex.: e-mail do Inbox).

## Causa

Causa provável (não reproduzida no iPhone): ao voltar ao site depois de 5 min, voltaOlhar disparava atuAtualizar(true) para a seção que saiu; ela redesenhava a página antiga (route/atualizar do módulo antigo) em corrida com o destino da notificação (rac-abrir / destino guardado).

## Solução

app.js: NOTIF_ULT marca o toque; voltaOlhar espera notifPendente e não atualiza se o destino foi aplicado ou se há menos de 15 s de um toque; atuAtualizar desiste se hash ou data-sec mudaram durante o ping (variável mudou). Versão 2026-11-27.1.

## Prevenção

Toda rotina automática ao voltar ao site deve conferir se a página ainda é a mesma antes de redesenhar. Teste em tests/notificacao.test.mjs. Validar no iPhone.
