---
titulo: Extras do Garmin: caminhos de bibliotecas da comunidade deram 404 na Personal API
tipo: erro
categoria: garmin
tags: garmin, extras, endpoints
estado: ativo
origem: Lote 2 corrigido, 23/11/2026
data: 2026-11-23
---

O cliente oficial devolve o JSON bruto e não descreve o formato das respostas.

## Causa

Os caminhos foram escolhidos de memória (Connect web) e a Personal API tem caminhos próprios; o teste do botão devolveu erro 404 nos sete.

## Solução

Usar só os endpoints do cliente oficial da Garmin (connect-personal-api-python): dailyHeartRate?date=, spo2acclimation/{data}, stats/stress/daily/{ini}/{fim}, bodyBattery/reports/daily, weight/range/{ini}/{fim}?includeAll=true. Training Status e Readiness não têm endpoint documentado.

## Prevenção

Nunca chutar endpoint: conferir no cliente oficial ou no Swagger antes de codar; a sondagem devolve só nomes e tipos para ajustar os leitores.
