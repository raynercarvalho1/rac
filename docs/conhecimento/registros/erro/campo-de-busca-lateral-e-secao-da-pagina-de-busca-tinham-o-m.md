---
titulo: Campo de busca lateral e secao da pagina de busca tinham o mesmo id e a pagina nunca aparecia
tipo: erro
categoria: visual
tags: busca, roteador, id-duplicado
estado: ativo
origem: Lote 3, 27/11/2026
data: 2026-11-27
---

A pagina #busca (Ver todos os resultados) nao aparecia: ao abrir a rota o roteador mostrava um elemento e escondia os outros pelo id da rota, e o primeiro #busca do documento era o campo de pesquisa da barra lateral, nao a secao da pagina.

## Causa

Duas coisas com id=busca no index.html: o input da barra lateral (antes) e a section da pagina. document.getElementById(rota) devolve o primeiro, entao o roteador alternava o input e a secao ficava sempre escondida.

## Solução

O campo lateral virou #buscalateral (app.js e index.html); a pagina continua na section #busca. O teste de tela abre a pagina de verdade.

## Prevenção

O id de cada secao de pagina e o id da rota e precisa ser unico no documento: antes de criar um elemento com id curto, procure o id no index.html. Pagina nova deve ser aberta num navegador de teste, nao so desenhada com o roteador contornado.
