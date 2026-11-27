/* Dia a Dia RAC — Timeline (Lote 3 do novo RAC; docs/planejamento/15, seção 2). A TELA: uma linha do tempo única do que aconteceu e do que está agendado, montada na hora pelos provedores (js/prov.js e js/prov-*.js) a partir
   dos dados ORIGINAIS de cada módulo, sem tabela de cópia. Cada evento abre o registro de origem. Aqui só se desenha e se liga ao orquestrador: período, filtros, agrupamento, cursor por provedor ("Carregar mais"),
   resultado parcial (um provedor que falha ou demora não esconde os outros) e nova tentativa por provedor. Também exporta a linha de evento (tlLinha), usada pelo widget timeline.recente. Só do dono neste lote. Só LÊ.
   Preferências (período e agrupamento) ficam só neste aparelho. */
  var TLN={seq:0,periodo:"7d",agrup:"dia",filtros:{categorias:[],espacos:[],comAnexo:false,pendentes:false,texto:""},eventos:[],proximos:null,cursores:{},esgotados:{},falhas:{},temMais:false,carregando:false,erroTotal:null,espacos:null,raiz:null,rodadas:0,abertoProximos:true,filtrosAbertos:false};
  var TLN_CHAVE="rac-tl-prefs:",TLN_CAT_ICO={saude:"❤️",financas:"💰",familia:"👨‍👩‍👧",casa:"🏠",comunicacao:"✉️",estudos:"🎓",carreira:"💼",descoberta:"🧭",projetos:"🗂️",sistema:"⚙️"};
  var TLN_COR={saude:"var(--c-saude)",financas:"var(--c-mercado)",familia:"var(--c-olivia)",casa:"var(--c-veic)",comunicacao:"var(--c-inicio)",estudos:"var(--c-estudos)",carreira:"var(--c-vagas)",descoberta:"var(--c-esportes)",projetos:"var(--c-embreve)",sistema:"var(--c-embreve)"};
  function tlnPrefs(g){try{var k=TLN_CHAVE+(EU&&EU.id);if(g){localStorage.setItem(k,JSON.stringify({periodo:TLN.periodo,agrup:TLN.agrup}));return}var p=JSON.parse(localStorage.getItem(k)||"{}");
    if(NUCLEO.TL_PERIODOS.indexOf(p.periodo)>=0)TLN.periodo=p.periodo;if(NUCLEO.TL_AGRUPAMENTOS.indexOf(p.agrup)>=0)TLN.agrup=p.agrup}catch(e){}}
  function tlnNomeEspaco(id){var n=null;(TLN.espacos||[]).forEach(function(e){if(e.id===id)n=(e.tipo==="pessoal"?"🔒 ":"👥 ")+e.nome});return n||(id==="casa"?"👥 Casa":"🔒 Pessoal")}
  /* a linha de um evento (também usada pelo widget): o clique leva ao registro original. opc: {resumo:false, data:true, compacto:true, espaco:true} */
  function tlLinha(e,opc){opc=opc||{};var hoje=hojeISO(),dia=NUCLEO.tlDia(e.quando),hora=e.diaInteiro?"":NUCLEO.tlHora(e.quando),
      quando=opc.data?(dia===hoje?"hoje":dataBR(dia).slice(0,5))+(hora?" "+hora:""):hora,   /* evento de dia inteiro, sob o cabeçalho do dia, não repete "dia todo" em cada linha */
      cor=TLN_COR[e.categoria]||"var(--rac-texto-2)",ext=/^https:/.test(e.link),
      a=h("a",{class:"tl-ev"+(e.futuro?" tl-ev--futuro":"")+(opc.compacto?" tl-ev--compacto":""),href:e.link,style:"--tl-cor:"+cor,"data-id":e.id,target:ext?"_blank":null,rel:ext?"noopener":null});
    a.appendChild(h("span",{class:"tl-quando rac-t-legenda",text:quando}));
    a.appendChild(h("span",{class:"tl-marca","aria-hidden":"true",text:TLN_CAT_ICO[e.categoria]||"•"}));
    var corpo=h("span",{class:"tl-corpo"},h("b",{class:"rac-t-cartao tl-titulo",text:e.titulo}));
    if(opc.resumo!==false&&e.resumo)corpo.appendChild(h("span",{class:"rac-t-sec tl-resumo",text:e.resumo}));
    var meta=h("span",{class:"tl-meta rac-t-legenda"},e.origem||"",opc.espaco&&TLN.espacos&&TLN.espacos.length>1?" · "+tlnNomeEspaco(e.espaco):"");
    corpo.appendChild(meta);a.appendChild(corpo);
    var fim=h("span",{class:"tl-fim"});if(e.anexo)fim.appendChild(h("span",{class:"tl-icone","aria-label":"com anexo",title:"com anexo",text:"📎"}));
    if(e.pendente)fim.appendChild(rkSelo(e.futuro?"info":"aviso",e.futuro?"marcado":"pendente"));
    if(ext)fim.appendChild(h("span",{class:"tl-icone","aria-label":"abre em outra aba",text:"↗"}));
    if(fim.childNodes.length)a.appendChild(fim);return a}
  /* ---------- carregar ---------- */
  function tlnEspacos(){if(TLN.espacos)return Promise.resolve(TLN.espacos);
    return Promise.resolve().then(function(){return SB.rpc("rac_iniciar_espacos")}).then(sbOk).then(function(l){TLN.espacos=l||[];return TLN.espacos},function(){TLN.espacos=[];return TLN.espacos})}
  function tlnOp(extra){var p=NUCLEO.tlPeriodo(TLN.periodo,hojeISO()),f=TLN.filtros;
    return Object.assign({de:p.de,ate:p.ate,limite:40,espacos:TLN.espacos||[],filtros:{categorias:f.categorias,espacos:f.espacos,comAnexo:f.comAnexo,pendentes:f.pendentes,texto:f.texto}},extra||{})}
  function tlnJuntar(novos){TLN.eventos=NUCLEO.tlOrdenar(NUCLEO.tlDeduplicar(TLN.eventos.concat(novos)))}
  /* reset = recomeça (período, filtro ou agrupamento mudou); senão continua dos cursores. Enquanto o filtro deixar poucos eventos e houver mais, lê mais (até 4 rodadas). */
  function tlnCarregar(reset){var seq=++TLN.seq;
    if(reset){TLN.eventos=[];TLN.cursores={};TLN.esgotados={};TLN.falhas={};TLN.temMais=false;TLN.erroTotal=null;TLN.rodadas=0}
    TLN.carregando=true;tlnDesenhar();
    var passo=function(){return provJanela(tlnOp({cursores:TLN.cursores})).then(function(r){if(seq!==TLN.seq)return;
      tlnJuntar(r.eventos);TLN.cursores=r.cursores;Object.keys(r.esgotados).forEach(function(k){TLN.esgotados[k]=r.esgotados[k]});
      r.provedores.forEach(function(k){delete TLN.falhas[k]});r.falhas.forEach(function(x){TLN.falhas[x.dominio]=x});TLN.temMais=r.temMais;TLN.rodadas++;
      if(!TLN.eventos.length&&Object.keys(TLN.falhas).length)TLN.erroTotal="Nada chegou: "+Object.keys(TLN.falhas).length+(Object.keys(TLN.falhas).length===1?" fonte não respondeu.":" fontes não responderam.");
      if(r.temMais&&!r.falhas.length&&TLN.eventos.length<20&&TLN.rodadas<4&&r.eventos.length)return passo()})};
    return passo().then(function(){if(seq!==TLN.seq)return;TLN.carregando=false;tlnDesenhar()},function(e){if(seq!==TLN.seq)return;logErro("timeline",e);TLN.carregando=false;TLN.erroTotal="Não consegui montar a Timeline agora.";tlnDesenhar()})}
  function tlnProximos(){var seq=TLN.seq;TLN.proximos=null;
    return provProximos({espacos:TLN.espacos||[],filtros:{categorias:TLN.filtros.categorias,espacos:TLN.filtros.espacos,comAnexo:TLN.filtros.comAnexo,pendentes:TLN.filtros.pendentes,texto:TLN.filtros.texto}}).then(function(r){if(seq!==TLN.seq)return;TLN.proximos=r;tlnDesenhar()},function(e){logErro("timeline",e);TLN.proximos={eventos:[],falhas:[],parcial:false}})}
  function tlnTentarDe(dominio){var seq=TLN.seq;TLN.carregando=true;tlnDesenhar();
    return provJanela(tlnOp({provedores:[dominio],cursores:TLN.cursores})).then(function(r){if(seq!==TLN.seq)return;tlnJuntar(r.eventos);TLN.cursores[dominio]=r.cursores[dominio]||null;TLN.esgotados[dominio]=!!r.esgotados[dominio];
      if(r.falhas.length)TLN.falhas[dominio]=r.falhas[0];else delete TLN.falhas[dominio];TLN.temMais=Object.keys(TLN.cursores).some(function(k){return !TLN.esgotados[k]})||TLN.temMais;TLN.carregando=false;tlnDesenhar()})}
  /* ---------- desenhar ---------- */
  var TLN_PER=[["hoje","Hoje"],["7d","7 dias"],["30d","30 dias"],["90d","90 dias"],["tudo","Tudo"]],TLN_AGR=[["dia","Por dia"],["semana","Por semana"],["mes","Por mês"],["categoria","Por categoria"],["pessoa","Por pessoa"]];
  function tlnChip(texto,ativo,fn,rot){var b=h("button",{type:"button",class:"rac-chip","aria-pressed":ativo?"true":"false",text:texto});if(rot)b.setAttribute("aria-label",rot);b.onclick=fn;return b}
  function tlnAlt(lista,k,v){var i=lista.indexOf(v);if(i>=0)lista.splice(i,1);else lista.push(v);return lista}
  function tlnControles(){var f=TLN.filtros,box=h("section",{class:"rac-card tl-controles","aria-label":"Período, agrupamento e filtros"});
    var per=h("div",{class:"tl-linha-chips",role:"group","aria-label":"Período"});TLN_PER.forEach(function(p){per.appendChild(tlnChip(p[1],TLN.periodo===p[0],function(){TLN.periodo=p[0];tlnPrefs(true);tlnReiniciar()}))});box.appendChild(per);
    var sel=h("select",{"aria-label":"Agrupar por",class:"rac-campo-entrada tl-agr"});TLN_AGR.forEach(function(a){sel.appendChild(h("option",{value:a[0],text:a[1],selected:TLN.agrup===a[0]?"":null}))});sel.onchange=function(){TLN.agrup=sel.value;tlnPrefs(true);tlnDesenhar()};
    var ativos=f.categorias.length+f.espacos.length+(f.comAnexo?1:0)+(f.pendentes?1:0)+(f.texto?1:0),fb=h("button",{type:"button",class:"rac-btn rac-btn--sec tl-filtros-btn","aria-expanded":TLN.filtrosAbertos?"true":"false",text:"Filtros"+(ativos?" ("+ativos+")":"")});
    fb.onclick=function(){TLN.filtrosAbertos=!TLN.filtrosAbertos;tlnDesenhar()};
    box.appendChild(h("div",{class:"tl-linha-ctl"},sel,fb));
    if(TLN.filtrosAbertos){var pn=h("div",{class:"tl-filtros"});
      var busca=h("input",{type:"search",class:"rac-campo-entrada",placeholder:"Filtrar esta lista (título, origem, resumo)…","aria-label":"Filtrar esta lista",value:f.texto,enterkeyhint:"search"});var tmr;
      busca.addEventListener("input",function(){clearTimeout(tmr);tmr=setTimeout(function(){f.texto=busca.value.trim();tlnReiniciar()},350)});pn.appendChild(busca);
      pn.appendChild(h("span",{class:"rac-t-rotulo",text:"Categoria"}));var cs=h("div",{class:"tl-linha-chips",role:"group","aria-label":"Categoria"});
      NUCLEO.TL_CATEGORIAS.forEach(function(c){cs.appendChild(tlnChip(TLN_CAT_ICO[c]+" "+NUCLEO.TL_CAT_ROTULO[c],f.categorias.indexOf(c)>=0,function(){tlnAlt(f.categorias,"c",c);tlnReiniciar()}))});pn.appendChild(cs);
      if(TLN.espacos&&TLN.espacos.length>1){pn.appendChild(h("span",{class:"rac-t-rotulo",text:"Espaço"}));var es=h("div",{class:"tl-linha-chips",role:"group","aria-label":"Espaço"});
        TLN.espacos.forEach(function(e){es.appendChild(tlnChip((e.tipo==="pessoal"?"🔒 ":"👥 ")+e.nome,f.espacos.indexOf(e.id)>=0,function(){tlnAlt(f.espacos,"e",e.id);tlnReiniciar()}))});pn.appendChild(es)}
      var ex=h("div",{class:"tl-linha-chips"});ex.appendChild(tlnChip("📎 Só com anexo",f.comAnexo,function(){f.comAnexo=!f.comAnexo;tlnReiniciar()}));ex.appendChild(tlnChip("⏳ Só pendentes",f.pendentes,function(){f.pendentes=!f.pendentes;tlnReiniciar()}));pn.appendChild(ex);
      if(ativos){var lp=rkBtn("ter","Limpar filtros");lp.onclick=function(){TLN.filtros={categorias:[],espacos:[],comAnexo:false,pendentes:false,texto:""};tlnReiniciar()};pn.appendChild(lp)}
      box.appendChild(pn)}
    return box}
  function tlnReiniciar(){tlnCarregar(true);tlnProximos()}
  function tlnGrupos(l){return NUCLEO.tlAgrupar(l,TLN.agrup,hojeISO())}
  function tlnDesenhar(){var raiz=TLN.raiz;if(!raiz||!raiz.isConnected)return;var y=window.scrollY,alvo=raiz.querySelector(".tl-corpo-pagina");if(!alvo)return;alvo.innerHTML="";
    var ctl=raiz.querySelector(".tl-ctl");ctl.innerHTML="";ctl.appendChild(tlnControles());
    /* parcial: quem não respondeu, sem esconder o resto */
    var fk=Object.keys(TLN.falhas);if(fk.length&&!(TLN.erroTotal&&!TLN.eventos.length)){var bt=rkBtn("sec","Tentar de novo");bt.onclick=function(){fk.forEach(tlnTentarDe)};
      alvo.appendChild(rkAlerta("aviso","Parte das fontes não respondeu",fk.map(function(k){return TLN.falhas[k].rotulo+" ("+TLN.falhas[k].erro+")"}).join(" · ")+". O que chegou está abaixo.",bt))}
    /* agendado */
    var pr=TLN.proximos;if(pr&&(pr.eventos.length||pr.falhas.length)){var det=h("section",{class:"rac-card tl-agendado","aria-label":"Agendado"}),cab=h("button",{type:"button",class:"tl-agendado-cab","aria-expanded":TLN.abertoProximos?"true":"false"},
        h("b",{class:"rac-t-cartao",text:"Agendado"}),h("span",{class:"rac-t-legenda",text:pr.eventos.length+(pr.eventos.length===1?" item":" itens")+" nos próximos 30 dias"}),h("span",{"aria-hidden":"true",text:TLN.abertoProximos?"▾":"▸"}));
      cab.onclick=function(){TLN.abertoProximos=!TLN.abertoProximos;tlnDesenhar()};det.appendChild(cab);
      if(TLN.abertoProximos){var ul=h("div",{class:"tl-lista"});pr.eventos.slice(0,12).forEach(function(e){ul.appendChild(tlLinha(e,{data:true,espaco:true}))});if(pr.eventos.length>12)ul.appendChild(h("p",{class:"rac-t-sec",text:"e mais "+(pr.eventos.length-12)+" na Agenda"}));
        if(!pr.eventos.length)ul.appendChild(h("p",{class:"rac-t-sec",text:"Nada agendado nos próximos 30 dias."}));det.appendChild(ul);det.appendChild(h("a",{class:"rac-btn rac-btn--ter",href:"#agenda",text:"Abrir a Agenda"}))}
      alvo.appendChild(det)}
    var l=TLN.eventos;
    if(TLN.carregando&&!l.length){alvo.appendChild(h("div",{class:"rac-card"},rkEstado("carregando","Montando a sua linha do tempo…")));window.scrollTo(0,y);return}
    if(TLN.erroTotal&&!l.length){var rt=rkBtn("pri","Tentar de novo");rt.onclick=function(){tlnReiniciar()};alvo.appendChild(h("div",{class:"rac-card"},rkEstado("erro",TLN.erroTotal,rt)));window.scrollTo(0,y);return}
    if(!l.length){var ativos=TLN.filtros.categorias.length||TLN.filtros.espacos.length||TLN.filtros.comAnexo||TLN.filtros.pendentes||TLN.filtros.texto,acoes=h("div",{class:"tl-linha-chips"});
      if(TLN.periodo!=="tudo"){var m=rkBtn("sec","Ver um período maior");m.onclick=function(){TLN.periodo=TLN.periodo==="hoje"?"7d":TLN.periodo==="7d"?"30d":TLN.periodo==="30d"?"90d":"tudo";tlnPrefs(true);tlnReiniciar()};acoes.appendChild(m)}
      alvo.appendChild(h("div",{class:"rac-card"},rkEstado("vazio",ativos?"Nada encontrado com esses filtros neste período.":"Nada registrado neste período.",acoes)));window.scrollTo(0,y);return}
    var fh=h("p",{class:"rac-t-legenda tl-contagem",role:"status",text:l.length+(l.length===1?" evento":" eventos")+" · "+(NUCLEO.tlPeriodo(TLN.periodo,hojeISO()).rotulo)});alvo.appendChild(fh);
    tlnGrupos(l).forEach(function(g){var sec=h("section",{class:"rac-card tl-grupo","aria-label":g.rotulo});sec.appendChild(h("h3",{class:"tl-grupo-tit rac-t-secao",text:g.rotulo+" · "+g.eventos.length}));
      var ul=h("div",{class:"tl-lista"});g.eventos.forEach(function(e){ul.appendChild(tlLinha(e,{data:TLN.agrup!=="dia",espaco:true}))});sec.appendChild(ul);alvo.appendChild(sec)});
    if(TLN.temMais){var mais=rkBtn("sec",TLN.carregando?"Carregando…":"Carregar mais");mais.disabled=TLN.carregando;mais.onclick=function(){tlnCarregar(false)};alvo.appendChild(h("div",{class:"tl-mais"},mais))}
    else alvo.appendChild(h("p",{class:"rac-t-legenda tl-fim-lista",text:"Fim do período. Os registros originais continuam nos módulos."}));
    window.scrollTo(0,y)}
  function renderTimeline(){var root=$("#timeline-view");root.innerHTML="";TLN.raiz=root;
    if(!isOwner()){root.appendChild(h("div",{class:"panel"},h("p",{class:"empty",text:"A Timeline ainda não está liberada para esta conta."})));return}
    tlnPrefs(false);var busca=h("a",{class:"rac-btn rac-btn--sec tl-busca",href:"#busca"},"🔎 Buscar");
    root.appendChild(h("div",{class:"tl"},h("div",{class:"rh-hero wk-hero"},h("div",null,h("h2",{text:"Timeline"}),h("p",{class:"rh-hero-data",text:"O que aconteceu e o que está marcado, de todos os módulos, em um lugar só."})),h("div",{class:"wk-barra"},busca)),
      h("div",{class:"tl-ctl"}),h("div",{class:"tl-corpo-pagina stack"})));
    tlnEspacos().then(function(){tlnReiniciar()})}
