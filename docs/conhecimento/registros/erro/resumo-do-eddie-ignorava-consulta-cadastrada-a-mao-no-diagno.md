---
titulo: Resumo do Eddie ignorava consulta cadastrada à mão no Diagnóstico mais recente
tipo: erro
categoria: familia
tags: eddie, resumo, consulta
estado: ativo
origem: relato do dono 24/11/2026, versão 2026-11-24.6
data: 2026-11-24
---

## Causa

famAgora só considerava registros com dados.diagnostico (preenchido pelo importador de laudos); consulta feita pelo formulário não tem esse campo.

## Solução

NUCLEO.famDiagnostico: o mais novo entre laudo com diagnóstico e consulta (título vira o diagnóstico); empate de data ganha o diagnóstico escrito; só para não-bebês.

## Prevenção

Todo resumo que diz 'mais recente' deve considerar todas as origens de registro (importado e formulário), com teste de ordem e de empate.
