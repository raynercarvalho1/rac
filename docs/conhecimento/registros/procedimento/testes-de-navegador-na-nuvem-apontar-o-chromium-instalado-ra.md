---
titulo: Testes de navegador na nuvem: apontar o Chromium instalado (RAC_CHROMIUM) e rodar um arquivo por vez
tipo: procedimento
categoria: testes
tags: testes, chromium
estado: ativo
origem: Lote 4, 28/11/2026
data: 2026-11-28
---

O Playwright do projeto procura um Chromium que não existe nesta máquina. Use export RAC_CHROMIUM=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome (o caminho vem de ls /opt/pw-browsers) e CI=true. Rode os arquivos de tela (captura_tela, workspace_*_tela, timeline_*) um de cada vez, em segundo plano e com saída em arquivo: dois Chromium juntos estouram o tempo do comando.
