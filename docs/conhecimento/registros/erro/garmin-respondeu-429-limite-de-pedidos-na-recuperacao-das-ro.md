---
titulo: Garmin respondeu 429 (limite de pedidos) na recuperação das rotas
tipo: erro
categoria: garmin
tags: garmin, rotas, 429, extras
estado: ativo
origem: Lote 3, 23/11/2026
data: 2026-11-23
---

O Garmin também manda os horários de início como texto sem fuso; os leitores aceitam texto e número.

## Causa

A busca baixava 6 arquivos .FIT seguidos, sem pausa, e cada chamada pedia um token novo; a Garmin respondeu 429 (inclusive no token) e 504 em um download, e o laço do site parou em 168 de 987 treinos.

## Solução

Blocos de 4 treinos com pausa de 0,9 s, parada sem erro ao receber 429 (limitado: true), site com pausa entre rodadas e mensagem de espera; extras com 4 consultas por data por vez e pausa.

## Prevenção

Toda recuperação em lote da Garmin precisa de pausa, bloco pequeno e tratamento de 429 que pare sem erro e permita continuar de onde parou.
