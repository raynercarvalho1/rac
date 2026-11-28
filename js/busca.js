/* Dia a Dia RAC — Busca global (Lote 3 do novo RAC; docs/planejamento/15, seção 5). A busca passou a ser TRANSVERSAL: consulta os provedores dos módulos (js/prov.js e js/prov-*.js) com a sessão de quem busca,
   agrupa por origem, mostra o espaço e abre o registro original. Sem índice duplicado, sem cópia e sem IA: busca determinística, sem acento nem maiúscula, com termos parciais. Duas portas, a mesma lógica:
   a página #busca (celular e computador; no celular é a "tela de pesquisa", aberta pelo ícone ao lado do título) e a busca rápida da barra lateral (os 6 primeiros). Só do dono; a casa (Fernanda) continua com a busca de antes.
   Consulta nova cancela a anterior (a resposta velha é ignorada); a mesma consulta com os mesmos filtros não repete. Só LÊ. */
  var BUSG={seq:0,chave:"",filtros:{dominios:[],espacos:[]},texto:"",espacos:null,raiz:null,resultado:null,carregando:false};
  var BUSG_ORDEM=["registros","saude","mercado","compras","fiscal","inbox","agenda","lembretes","mba","aniversarios","projetos","biblioteca","captura","newsletter","vagas","noticias"];
  function busgEspacos(){if(BUSG.espacos)return Promise.resolve(BUSG.espacos);
    return Promise.resolve().then(function(){return SB.rpc("rac_iniciar_espacos")}).then(sbOk).then(function(l){BUSG.espacos=l||[];return BUSG.espacos},function(){BUSG.espacos=[];return BUSG.espacos})}
  function busgNomeEspaco(id){var n=null;(BUSG.espacos||[]).forEach(function(e){if(e.id===id)n=(e.tipo==="pessoal"?"🔒 ":"👥 ")+e.nome});return n||(id==="casa"?"👥 Casa":"🔒 Pessoal")}
  /* abrir um resultado: o registro certo da Família e o produto do Mercado têm um passo a mais (o mesmo de antes); link externo abre em outra aba */
  function busgAbrir(x,aoAbrir){if(aoAbrir)aoAbrir();var a=x.acao||{};
    if(a.registro&&typeof FAM!=="undefined"){var r=a.registro;return precisa(["familia"]).then(function(){famVista[r.quem]="linha";famFiltro[r.quem]="";famAlvo[r.quem]={id:r.id};if(location.hash===x.link)route();else location.hash=x.link},function(){location.hash=x.link})}
    if(a.produto&&window.RACmercado){window.RACmercado.verProduto(a.produto);return}
    if(x.externo){window.open(x.link,"_blank","noopener");return}
    if(location.hash===x.link)route();else location.hash=x.link}
  function busgLinha(x,aoAbrir,opc){opc=opc||{};var ext=x.externo,cor=TLN_COR[x.categoria]||"var(--rac-texto-2)",
      a=h("a",{class:"bg-res",href:x.acao?"#":x.link,"data-id":x.id,style:"--tl-cor:"+cor,target:!x.acao&&ext?"_blank":null,rel:!x.acao&&ext?"noopener":null});
    a.appendChild(h("span",{class:"tl-marca","aria-hidden":"true",text:TLN_CAT_ICO[x.categoria]||"•"}));
    var corpo=h("span",{class:"tl-corpo"},h("b",{class:"rac-t-cartao tl-titulo",text:x.titulo}));if(x.resumo)corpo.appendChild(h("span",{class:"rac-t-sec tl-resumo",text:x.resumo}));
    var meta=[];if(opc.origem!==false)meta.push(x.origem);if(opc.espaco&&BUSG.espacos&&BUSG.espacos.length>1)meta.push(busgNomeEspaco(x.espaco));if(x.quando)meta.push(dataBR(NUCLEO.tlDia(x.quando)));
    if(meta.length)corpo.appendChild(h("span",{class:"tl-meta rac-t-legenda",text:meta.join(" · ")}));a.appendChild(corpo);   /* agrupado por origem, a origem já é o título do grupo: não se repete na linha */
    var fim=h("span",{class:"tl-fim"});if(x.anexo)fim.appendChild(h("span",{class:"tl-icone","aria-label":"com anexo",text:"📎"}));if(ext)fim.appendChild(h("span",{class:"tl-icone","aria-label":"abre em outra aba",text:"↗"}));if(fim.childNodes.length)a.appendChild(fim);
    if(x.acao||opc.aoAbrir)a.addEventListener("click",function(e){if(e.metaKey||e.ctrlKey||e.shiftKey)return;e.preventDefault();busgAbrir(x,opc.aoAbrir)});return a}
  /* busca rápida da barra lateral: só os primeiros resultados, sem filtros; a página #busca tem tudo */
  function buscaRapida(texto){return busgEspacos().then(function(){return provBuscar({texto:texto,limite:3,espacos:BUSG.espacos,tempo:4000})})}
  /* ---------- a página ---------- */
  function busgChave(){return NUCLEO.bsTermos(BUSG.texto).join(" ")+"|"+BUSG.filtros.dominios.join(",")+"|"+BUSG.filtros.espacos.join(",")}
  function busgBuscar(forcar){var chave=busgChave();if(!forcar&&chave===BUSG.chave&&BUSG.resultado)return;BUSG.chave=chave;var seq=++BUSG.seq;
    if(!NUCLEO.bsTermos(BUSG.texto).length){BUSG.resultado=null;BUSG.carregando=false;busgDesenhar();return}
    BUSG.carregando=true;busgDesenhar();
    busgEspacos().then(function(){return provBuscar({texto:BUSG.texto,limite:15,espacos:BUSG.espacos,filtros:{dominios:BUSG.filtros.dominios,espacos:BUSG.filtros.espacos}})}).then(function(r){if(seq!==BUSG.seq)return;BUSG.resultado=r;BUSG.carregando=false;busgDesenhar()},
      function(e){if(seq!==BUSG.seq)return;logErro("busca",e);BUSG.resultado={erro:true,itens:[],falhas:[]};BUSG.carregando=false;busgDesenhar()})}
  function busgFiltros(){var f=BUSG.filtros,box=h("div",{class:"bg-filtros"}),linha=h("div",{class:"tl-linha-chips",role:"group","aria-label":"Onde buscar"});
    linha.appendChild(tlnChip("Tudo",!f.espacos.length&&!f.dominios.length,function(){f.espacos=[];f.dominios=[];busgBuscar(true)}));
    (BUSG.espacos||[]).forEach(function(e){linha.appendChild(tlnChip((e.tipo==="pessoal"?"🔒 Pessoal":"👥 "+e.nome),f.espacos.indexOf(e.id)>=0,function(){f.espacos=f.espacos.indexOf(e.id)>=0?[]:[e.id];busgBuscar(true)}))});box.appendChild(linha);
    var sel=h("select",{class:"rac-campo-entrada","aria-label":"Buscar só em uma origem"});sel.appendChild(h("option",{value:"",text:"Todas as origens"}));
    provLista().filter(function(d){return d.buscar&&provPodeUsar(d,provContexto())}).sort(function(a,b){return BUSG_ORDEM.indexOf(a.dominio)-BUSG_ORDEM.indexOf(b.dominio)}).forEach(function(d){sel.appendChild(h("option",{value:d.dominio,text:d.rotulo,selected:f.dominios[0]===d.dominio?"":null}))});
    sel.onchange=function(){f.dominios=sel.value?[sel.value]:[];busgBuscar(true)};box.appendChild(sel);
    if(f.espacos.length||f.dominios.length){var lp=rkBtn("ter","Limpar filtros");lp.onclick=function(){f.espacos=[];f.dominios=[];busgBuscar(true)};box.appendChild(lp)}return box}
  function busgDesenhar(){var raiz=BUSG.raiz;if(!raiz||!raiz.isConnected)return;var alvo=raiz.querySelector(".bg-corpo");alvo.innerHTML="";var fx=raiz.querySelector(".bg-fx");fx.innerHTML="";fx.appendChild(busgFiltros());
    var termos=NUCLEO.bsTermos(BUSG.texto),r=BUSG.resultado;
    if(!BUSG.texto.trim()){alvo.appendChild(h("div",{class:"rac-card"},rkEstado("vazio","Procure por uma loja, uma compra, um treino, um compromisso, uma mensagem ou um nome. A busca olha os módulos de uma vez e leva ao registro original.")));return}
    if(!termos.length){alvo.appendChild(h("div",{class:"rac-card"},rkEstado("vazio","Digite pelo menos duas letras.")));return}
    if(BUSG.carregando){alvo.appendChild(h("div",{class:"rac-card"},rkEstado("carregando","Procurando em todos os módulos…")));return}
    if(!r)return;
    if(r.erro){var rt=rkBtn("pri","Tentar de novo");rt.onclick=function(){busgBuscar(true)};alvo.appendChild(h("div",{class:"rac-card"},rkEstado("erro","A busca não funcionou agora.",rt)));return}
    if(r.parcial){var t=rkBtn("sec","Tentar de novo");t.onclick=function(){busgBuscar(true)};alvo.appendChild(rkAlerta("aviso","Alguma origem não respondeu",r.falhas.map(function(x){return x.rotulo+" ("+x.erro+")"}).join(" · ")+". O resto da busca está abaixo.",t))}
    if(!r.itens.length){alvo.appendChild(h("div",{class:"rac-card"},rkEstado("vazio","Nada encontrado para “"+BUSG.texto.trim()+"”"+(BUSG.filtros.dominios.length||BUSG.filtros.espacos.length?" com esses filtros.":"."))));return}
    alvo.appendChild(h("p",{class:"rac-t-legenda tl-contagem",role:"status",text:r.itens.length+(r.itens.length===1?" resultado":" resultados")+" em "+NUCLEO.bsAgrupar(r.itens,termos,BUSG_ORDEM).length+(NUCLEO.bsAgrupar(r.itens,termos,BUSG_ORDEM).length===1?" origem":" origens")}));
    NUCLEO.bsAgrupar(r.itens,termos,BUSG_ORDEM).forEach(function(g){var sec=h("section",{class:"rac-card tl-grupo","aria-label":g.rotulo});sec.appendChild(h("h3",{class:"tl-grupo-tit rac-t-secao",text:g.rotulo+" · "+g.itens.length}));
      var ul=h("div",{class:"tl-lista"});g.itens.forEach(function(x){ul.appendChild(busgLinha(x,null,{espaco:true,origem:false}))});sec.appendChild(ul);alvo.appendChild(sec)})}
  function renderBuscaGlobal(q){var root=$("#busca-view");root.innerHTML="";BUSG.raiz=root;
    if(!isOwner()){root.appendChild(h("div",{class:"panel"},h("p",{class:"empty",text:"A busca global ainda não está liberada para esta conta."})));return}
    BUSG.texto=q||"";BUSG.chave="";BUSG.resultado=null;
    var inp=h("input",{type:"search",class:"rac-campo-entrada bg-campo",placeholder:"Buscar em tudo: lojas, compras, treinos, compromissos, mensagens…","aria-label":"Buscar em tudo",value:BUSG.texto,enterkeyhint:"search",autocomplete:"off",autocapitalize:"none",spellcheck:"false"});
    var tmr;inp.addEventListener("input",function(){clearTimeout(tmr);tmr=setTimeout(function(){BUSG.texto=inp.value;try{history.replaceState(history.state,"","#busca/"+encodeURIComponent(inp.value.trim()))}catch(e){}busgBuscar(false)},250)});
    inp.addEventListener("keydown",function(e){if(e.key==="Enter"){clearTimeout(tmr);BUSG.texto=inp.value;busgBuscar(false)}});
    root.appendChild(h("div",{class:"bg"},h("section",{class:"rac-card bg-topo"},h("label",{class:"bg-rotulo rac-t-rotulo","for":"bg-q",text:"Busca global"}),(inp.id="bg-q",inp),h("div",{class:"bg-fx"})),h("div",{class:"bg-corpo stack"})));
    busgEspacos().then(function(){busgDesenhar();if(BUSG.texto.trim())busgBuscar(true);setTimeout(function(){inp.focus()},50)})}
