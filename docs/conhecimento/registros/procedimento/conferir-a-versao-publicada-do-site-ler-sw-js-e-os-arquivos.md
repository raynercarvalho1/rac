---
titulo: Conferir a versão publicada do site: ler sw.js e os arquivos pelo domínio
tipo: procedimento
categoria: publicacao
tags: publicacao, pages, verificacao
estado: ativo
origem: Monitor M1 e M2, 26/11/2026
data: 2026-11-26
---

Depois do merge, o workflow 'pages build and deployment' publica a main. Para provar a versão servida: curl -s https://raynercarvalho.com.br/sw.js (linha const VERSAO) e js/app.js (MOD_VERSAO) com um parâmetro ?x=$(date +%s) para fugir do cache, mais um grep por um símbolo novo em cada arquivo alterado (index.html, js/*.js, nucleo.js). O host raynercarvalho.com.br foi liberado no ambiente pessoal 'RAC' em 26/11/2026; se o proxy responder 403 (connect_rejected), é preciso liberá-lo de novo (update_environment) antes de declarar o site publicado. Status verde do workflow sozinho não prova a versão servida.
