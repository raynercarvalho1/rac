/* Dia a Dia RAC — módulo carregado quando a seção abre. Custos de IA (#iacustos): painel do dono com o que a IA consumiu, lido da view
   ia_custos (029), de ia_config e de ia_precos. SÓ LÊ: não chama a IA, não grava nada, não cria limite nem muda orçamento (isso continua em
   Sistema → RAC Intelligence). As contas ficam no núcleo (NUCLEO.iaMonitor e NUCLEO.iaHistorico). Nada é inventado: sem informação de custo
   aparece "sem dado", e o custo estimado nunca é apresentado como reconciliado. */
  var IC={f:{de:"",ate:"",funcionalidade:"",modelo:"",classe:"",estado:""},ordem:{campo:"data",dir:"desc"},pagina:1,porPagina:15,D:null,corpo:null};
  var IC_ORDENS=[["data","Data e hora"],["funcionalidade","Funcionalidade"],["modelo","Modelo"],["tokens","Tokens"],["custo","Custo"],["status","Status"]];
  var IC_CLASSE_AJUDA={reconciliado:"Valor cobrado que você conferiu no Console da Anthropic.",estimado:"Tokens informados pela API × tabela de preços da hora. Não é a fatura.",
    reserva:"Chamada sem resposta certa (tempo esgotado, falha de rede): conta a reserva cheia, o pior caso, até você conferir.",sem_dado:"Concluída sem tokens registrados.",sem_custo:"Falhou antes do envio: não custou nada."};
  function icUsd(v){return NUCLEO.iaUsdFino(v)}
  function icBrl(v,cfg){return "≈ "+NUCLEO.iaBrl(v,cfg)}
  function icQuando(iso){var d=new Date(iso);return isFinite(d.getTime())?d.toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—"}
  function icModelo(m){return String(m||"—").replace(/^claude-(\w+)-(\d+)-(\d+)$/,function(_,n,p,q){return "Claude "+n.charAt(0).toUpperCase()+n.slice(1)+" "+p+"."+q})}
  /* valor curto dentro da barra: abaixo de 1 dólar, três casas */
  function icCurto(v){return NUCLEO.iaNum(v,v>=1?2:3)}
  function icKpi(rot,val,sub){return h("div",null,h("span",{class:"kl",text:rot}),h("b",{class:"kv",text:val}),sub?h("span",{class:"ksub",text:sub}):null)}
  function icTag(txt,cls){return h("span",{class:"hjtag "+(cls||"")},txt)}
  /* a view inteira do dono, em páginas de 1.000 (o Supabase devolve até isso por consulta); passando de 10 páginas, avisa que é parcial */
  function icLer(){var tudo=[],PAG=1000,MAX=10;
    function pag(i){return Promise.resolve().then(function(){return SB.from("ia_custos").select("*").order("criado_em",{ascending:false}).order("id",{ascending:true}).range(i*PAG,i*PAG+PAG-1)})
      .then(function(r){if(r.error)throw new Error(r.error.message);var l=r.data||[];tudo=tudo.concat(l);return l.length===PAG&&i+1<MAX?pag(i+1):{linhas:tudo,parcial:l.length===PAG}})}
    return pag(0)}
  function icCarregar(){
    return Promise.all([icLer(),Promise.resolve().then(function(){return SB.from("ia_config").select("*").maybeSingle()}).then(sbOk),
      Promise.resolve().then(function(){return SB.from("ia_precos").select("*")}).then(sbOk)])
    .then(function(r){return {linhas:r[0].linhas,parcial:r[0].parcial,cfg:r[1],precos:r[2]||[],hoje:hojeISO()}})}
  /* a mesma lista com "provedor · modelo" no lugar do modelo, para somar por provedor e modelo juntos */
  function icPorProvedor(linhas){return linhas.map(function(l){var o={};Object.keys(l).forEach(function(k){o[k]=l[k]});o.modelo=(l.provedor||"anthropic")+" · "+icModelo(l.modelo);return o})}

  function renderCustosIa(){var root=$("#iacustos-view");root.innerHTML="";
    if(!isOwner()){root.appendChild(h("div",{class:"panel"},h("p",{class:"empty",text:"Os custos de IA são só da conta do dono."})));return}
    var topo=panel("Custos de IA","Quanto a IA consumiu e quanto custou, por dia, funcionalidade e modelo. Só leitura: nada é chamado, gravado ou limitado por aqui."),
      rel=h("button",{type:"button",class:"ghostbtn",text:"↻ Atualizar"}),hoje=h("a",{class:"ghostbtn",href:"#rachoje",text:"RAC Hoje"}),sis=h("a",{class:"ghostbtn",href:"#sistema",text:"Limites e modo (Sistema)"});
    rel.onclick=function(){icIniciar()};
    topo.appendChild(h("div",{class:"vfil"},rel,hoje,sis));root.appendChild(topo);
    IC.corpo=h("div",{class:"stack"});root.appendChild(IC.corpo);icIniciar()}
  var IC_SEQ=0;
  function icIniciar(){var corpo=IC.corpo,seq=++IC_SEQ;corpo.innerHTML="";corpo.appendChild(h("div",{class:"panel"},loading()));
    icCarregar().then(function(D){if(seq!==IC_SEQ)return;IC.D=D;IC.pagina=1;icDesenhar()})
      .catch(function(e){if(seq!==IC_SEQ)return;corpo.innerHTML="";corpo.appendChild(h("div",{class:"panel"},failed(icIniciar,e)));logErro("iacustos",e)})}

  function icDesenhar(){var D=IC.D,corpo=IC.corpo;corpo.innerHTML="";
    if(!D.linhas.length){var v=panel("Nenhuma chamada registrada","Ainda não há chamadas pagas de IA no registro (ia_custos).");
      v.appendChild(h("p",{class:"empty",text:"Quando a IA for usada de verdade, cada chamada aparece aqui com tokens e custo. Leituras em demonstração não são registradas."}));corpo.appendChild(v);return}
    var cfg=D.cfg,m=NUCLEO.iaMonitor(D.linhas,D.hoje,cfg||{}),usd=icUsd;
    if(D.parcial)corpo.appendChild(h("div",{class:"panel"},h("p",{class:"qrwarn",text:"⚠ Há registros demais para ler de uma vez: os totais abaixo são parciais (só as 10.000 chamadas mais novas)."})));
    /* 1. indicadores */
    var pk=panel("Indicadores","Em dólar, com o valor aproximado em reais. Soma o que é conhecido, estimado e a reserva das incertas (veja as classes abaixo).");
    pk.appendChild(h("div",{class:"kgasto"},
      icKpi("Hoje",usd(m.hoje.usd),icBrl(m.hoje.usd,cfg)+" · "+m.hoje.chamadas+(m.hoje.chamadas===1?" chamada":" chamadas")),
      icKpi("Últimos 7 dias",usd(m.semana.usd),icBrl(m.semana.usd,cfg)+" · "+m.semana.chamadas+(m.semana.chamadas===1?" chamada":" chamadas")),
      icKpi("Mês atual",usd(m.mes.usd),icBrl(m.mes.usd,cfg)+" · "+m.mes.chamadas+(m.mes.chamadas===1?" chamada":" chamadas")),
      icKpi("Total acumulado",usd(m.total.usd),icBrl(m.total.usd,cfg)+" · "+m.total.chamadas+(m.total.chamadas===1?" chamada":" chamadas"))));
    if(m.total.medio!=null)pk.appendChild(h("p",{class:"sub",text:"Custo médio por chamada paga: "+usd(m.total.medio)+"."}));
    if(m.limite)pk.appendChild(h("p",{class:"sub",text:"Limite mensal configurado: R$ "+NUCLEO.iaNum(m.limite.brl,2)+" · usado no mês: "+m.limite.pct+"%"+(m.limite.atingidos.length?" · avisos atingidos: "+m.limite.atingidos.join("%, ")+"%":"")+". Para mudar, use Sistema → RAC Intelligence."}));
    if(m.atipico)pk.appendChild(h("p",{class:"sub",role:"note",text:"⚠ Hoje está em "+usd(m.atipico.hoje)+", mais de "+m.atipico.fator+"× a mediana dos dias anteriores ("+usd(m.atipico.mediana)+")."}));
    if(m.caras.length)pk.appendChild(h("p",{class:"sub",role:"note",text:"Mais da metade do gasto do mês vem de: "+m.caras.map(NUCLEO.iaModulo).join(", ")+"."}));
    corpo.appendChild(pk);
    /* 2. classes de custo: estimado, informado pelo provedor e reconciliado nunca se misturam */
    corpo.appendChild(icClasses(D,m));
    /* 3. tokens */
    corpo.appendChild(icTokens(D,m));
    /* 4. gráficos */
    corpo.appendChild(icGraficos(D,m));
    /* 5. preços e câmbio */
    corpo.appendChild(icPrecos(D,m));
    /* 6. histórico */
    var ph=panel("Histórico de chamadas","Os filtros e a ordem valem só para esta lista; indicadores e gráficos acima somam sempre todas as chamadas. Filtre, ordene e navegue. Toque numa linha para ver o preço, o câmbio e o id da requisição usados no cálculo.");
    IC.hist=h("div",null);ph.appendChild(icFiltros());ph.appendChild(IC.hist);corpo.appendChild(ph);icHistorico()}

  function icClasses(D,m){var p=panel("Classes de custo","Cada valor tem uma origem diferente. O estimado nunca é apresentado como reconciliado.");
    var L=D.linhas,cont={};["reconciliado","estimado","reserva","sem_dado","sem_custo"].forEach(function(k){cont[k]=NUCLEO.iaHistorico(L,{classe:k,porPagina:5}).total});
    var inf=L.filter(NUCLEO.iaInformadoProvedor).length;
    var linhas=[["reconciliado","Reconciliado",m.mes.conhecido,m.total.conhecido],["estimado","Estimado",m.mes.estimado,m.total.estimado],["reserva","Reserva (incerta)",m.mes.incerto,m.total.incerto]];
    p.appendChild(h("div",{class:"tblwrap"},h("table",{class:"tbl icclasses"},h("thead",null,h("tr",null,["Classe","Mês atual","Total","Chamadas"].map(function(t,i){return h("th",{class:i?"num":"",text:t})}))),
      h("tbody",null,linhas.map(function(x){return h("tr",null,h("td",null,icTag(x[1],"icc-"+x[0]),h("small",{class:"icaj",text:IC_CLASSE_AJUDA[x[0]]})),h("td",{class:"num","data-l":"Mês atual",text:icUsd(x[2])}),h("td",{class:"num","data-l":"Total",text:icUsd(x[3])}),h("td",{class:"num","data-l":"Chamadas",text:String(cont[x[0]])}))})))));
    p.appendChild(h("p",{class:"sub",text:"Informado pelo provedor: "+inf+" de "+L.length+(L.length===1?" chamada tem":" chamadas têm")+" o uso (tokens) e o id da requisição informados pela Anthropic. A API informa tokens, não o custo: o valor em dinheiro é sempre estimado (tokens × preço) até você conferir no Console, quando passa a reconciliado."}));
    if(cont.sem_dado||cont.sem_custo)p.appendChild(h("p",{class:"sub",text:(cont.sem_dado?cont.sem_dado+" sem dado de uso. ":"")+(cont.sem_custo?cont.sem_custo+" falharam antes do envio (sem custo).":"")}));
    var recal=L.filter(function(l){return l.recalculado_usd!=null&&NUCLEO.iaClasse(l).chave==="estimado"});
    if(recal.length){var antes=0,agora=0;recal.forEach(function(l){antes+=+l.estimado_usd||0;agora+=+l.recalculado_usd||0});
      p.appendChild(h("p",{class:"sub",text:"Recalculado com os preços de hoje (só comparação, nada é gravado): as "+recal.length+" estimadas somariam "+icUsd(agora)+" contra "+icUsd(antes)+" estimados na hora."}))}
    return p}

  function icTokens(D,m){var p=panel("Tokens","Entrada, saída e cache informados pela API em cada chamada.");
    var temCache=D.linhas.some(function(l){return l.tokens_cache_leitura!=null||l.tokens_cache_escrita!=null});
    p.appendChild(h("div",{class:"kgasto"},
      icKpi("Entrada · mês",NUCLEO.iaNum(m.mes.tokensEntrada,0),"total "+NUCLEO.iaNum(m.total.tokensEntrada,0)),
      icKpi("Saída · mês",NUCLEO.iaNum(m.mes.tokensSaida,0),"total "+NUCLEO.iaNum(m.total.tokensSaida,0)),
      temCache?icKpi("Cache lido · mês",NUCLEO.iaNum(m.mes.cacheLeitura,0),"total "+NUCLEO.iaNum(m.total.cacheLeitura,0)):null,
      temCache?icKpi("Cache escrito · mês",NUCLEO.iaNum(m.mes.cacheEscrita,0),"total "+NUCLEO.iaNum(m.total.cacheEscrita,0)):null));
    if(!temCache)p.appendChild(h("p",{class:"sub",text:"Tokens de cache: sem dado. Nenhum registro traz cache (as chamadas atuais não usam cache, ou são anteriores ao 029)."}));
    return p}

  function icGraficos(D,m){var p=panel("Evolução e comparação","Toque numa barra para ver o detalhe. Valores em dólar (US$).");
    var B=m.diario.map(function(d){return {cima:d.dia.slice(8,10),baixo:MES3[+d.dia.slice(5,7)-1],nome:dataBR(d.dia)}});
    p.appendChild(h("h3",{class:"mbag",text:"Custo por dia · últimos 30 dias"}));
    p.appendChild(m.diario.some(function(d){return d.usd>0})?rsColunas(B,m.diario.map(function(d){return d.usd}),icCurto,function(i,v){var d=m.diario[i];
      return [B[i].nome,icUsd(v)+" · "+d.chamadas+(d.chamadas===1?" chamada":" chamadas")+(d.conhecido?" · reconciliado "+icUsd(d.conhecido):"")+(d.estimado?" · estimado "+icUsd(d.estimado):"")+(d.incerto?" · reserva "+icUsd(d.incerto):"")]}):h("p",{class:"empty",text:"Sem custo nos últimos 30 dias."}));
    var ms=m.mensal.slice(-12),BM=ms.map(function(x){return {cima:MES3[+x.mes.slice(5,7)-1],baixo:x.mes.slice(2,4),nome:NUCLEO.iaNomeMes(x.mes+"-01")}});
    p.appendChild(h("h3",{class:"mbag",text:"Custo por mês"}));
    p.appendChild(ms.length?rsColunas(BM,ms.map(function(x){return x.usd}),icCurto,function(i,v){var x=ms[i];return [BM[i].nome,icUsd(v)+" ("+icBrl(x.usd,D.cfg)+") · "+x.chamadas+(x.chamadas===1?" chamada":" chamadas")]}):h("p",{class:"empty",text:"Sem meses para mostrar."}));
    function barras(tit,g,nome){var ks=Object.keys(g).sort(function(a,b){return g[b].usd-g[a].usd});
      p.appendChild(h("h3",{class:"mbag",text:tit}));
      p.appendChild(ks.length?rsBarras(ks.map(function(k){var x=g[k];return {nome:nome(k),sub:x.chamadas+(x.chamadas===1?" chamada":" chamadas"),v:x.usd,txt:icUsd(x.usd),
        dica:icUsd(x.usd)+" ("+icBrl(x.usd,D.cfg)+") · "+NUCLEO.iaNum(x.tokensEntrada,0)+" → "+NUCLEO.iaNum(x.tokensSaida,0)+" tokens"+(x.conhecido?" · reconciliado "+icUsd(x.conhecido):"")+(x.estimado?" · estimado "+icUsd(x.estimado):"")+(x.incerto?" · reserva "+icUsd(x.incerto):"")}})):h("p",{class:"empty",text:"Sem dados."}))}
    barras("Custo por funcionalidade · total",m.porFuncionalidade,NUCLEO.iaModulo);
    barras("Custo por provedor e modelo · total",NUCLEO.iaMonitor(icPorProvedor(D.linhas),D.hoje,D.cfg||{}).porModelo,function(k){return k});
    return p}

  function icPrecos(D,m){var p=panel("Preços e câmbio usados","Os valores em dólar vêm da tabela de preços; o valor em reais usa o câmbio e a margem de impostos da configuração.");
    var cfg=D.cfg;
    if(cfg)p.appendChild(h("div",{class:"kgasto"},icKpi("Câmbio (R$ por US$)",NUCLEO.iaNum(cfg.cambio_brl_usd,2)),icKpi("Margem de impostos",NUCLEO.iaNum((+cfg.margem_impostos||0)*100,0)+"%"),
      cfg.limite_brl!=null?icKpi("Limite mensal",NUCLEO.iaReais(cfg.limite_brl)):null,cfg.modo?icKpi("Modo da IA",cfg.modo):null));
    else p.appendChild(h("p",{class:"sub",text:"Sem configuração de IA no banco: o valor em reais usa o câmbio e os impostos padrão do RAC ("+NUCLEO.iaNum(m.cambio,2)+" e "+NUCLEO.iaNum(m.impostos*100,0)+"%)."}));
    if(!D.precos.length)p.appendChild(h("p",{class:"empty",text:"Nenhum preço cadastrado em ia_precos."}));
    else{p.appendChild(h("div",{class:"tblwrap"},h("table",{class:"tbl icprecos"},h("thead",null,h("tr",null,["Modelo","Entrada /M","Saída /M","Cache lido /M","Conferido em"].map(function(t,i){return h("th",{class:i&&i<4?"num":"",text:t})}))),
      h("tbody",null,D.precos.map(function(x){return h("tr",null,h("td",{"data-l":"Modelo",text:icModelo(x.modelo)}),h("td",{class:"num","data-l":"Entrada /M",text:icUsd(x.entrada_usd_mtok)}),h("td",{class:"num","data-l":"Saída /M",text:icUsd(x.saida_usd_mtok)}),
        h("td",{class:"num","data-l":"Cache lido /M",text:x.cache_leitura_usd_mtok!=null?icUsd(x.cache_leitura_usd_mtok):"não cadastrado"}),h("td",{"data-l":"Conferido em",text:x.conferido_em?dataBR(x.conferido_em):"—"}))})))));
      p.appendChild(h("p",{class:"sub",text:"Preços por milhão de tokens. Sem preço de cache cadastrado, o cache conta como entrada cheia (por excesso). Fonte: "+(D.precos[0].fonte||"página oficial de preços da Anthropic")+"."}))}
    return p}

  /* ---------- histórico: filtros, ordenação e paginação ---------- */
  function icFiltros(){var op=NUCLEO.iaOpcoes(IC.D.linhas),f=IC.f;
    function sel(rot,chave,lista,nome){var s=h("select",{"aria-label":rot},h("option",{value:"",text:rot}),lista.map(function(v){var o=h("option",{value:v,text:nome(v)});if(f[chave]===v)o.selected=true;return o}));
      s.onchange=function(){f[chave]=s.value;IC.pagina=1;icHistorico()};return s}
    function data(rot,chave){var i=h("input",{type:"date","aria-label":rot,value:f[chave]||"",title:rot});i.onchange=function(){f[chave]=i.value;IC.pagina=1;icHistorico()};return i}
    var ord=h("select",{"aria-label":"Ordenar por"},IC_ORDENS.map(function(o){var e=h("option",{value:o[0],text:"Ordenar: "+o[1]});if(IC.ordem.campo===o[0])e.selected=true;return e})),
      dir=h("button",{type:"button",class:"ghostbtn",text:IC.ordem.dir==="asc"?"↑ Crescente":"↓ Decrescente","aria-label":"Inverter a ordem"}),
      por=h("select",{"aria-label":"Linhas por página"},[10,15,25,50].map(function(n){var e=h("option",{value:String(n),text:n+" por página"});if(IC.porPagina===n)e.selected=true;return e})),
      lim=h("button",{type:"button",class:"ghostbtn",text:"Limpar filtros"});
    ord.onchange=function(){IC.ordem.campo=ord.value;IC.pagina=1;icHistorico()};
    dir.onclick=function(){IC.ordem.dir=IC.ordem.dir==="asc"?"desc":"asc";dir.textContent=IC.ordem.dir==="asc"?"↑ Crescente":"↓ Decrescente";IC.pagina=1;icHistorico()};
    por.onchange=function(){IC.porPagina=+por.value;IC.pagina=1;icHistorico()};
    lim.onclick=function(){IC.f={de:"",ate:"",funcionalidade:"",modelo:"",classe:"",estado:""};IC.pagina=1;var pai=IC.hist.parentNode,novo=icFiltros();pai.replaceChild(novo,pai.querySelector(".icfiltros"));icHistorico()};
    return h("div",{class:"vfil icfiltros"},h("label",{class:"icdata"},"De",data("Data inicial","de")),h("label",{class:"icdata"},"Até",data("Data final","ate")),
      sel("Todas as funcionalidades","funcionalidade",op.funcionalidades,NUCLEO.iaModulo),sel("Todos os modelos","modelo",op.modelos,icModelo),
      sel("Todas as classes","classe",["reconciliado","estimado","reserva","sem_dado","sem_custo"],function(k){return NUCLEO.IA_CLASSES[k]}),
      sel("Todos os estados","estado",op.estados,function(k){return k}),ord,dir,por,lim)}
  function icHistorico(){var D=IC.D,R=NUCLEO.iaHistorico(D.linhas,{de:IC.f.de,ate:IC.f.ate,funcionalidade:IC.f.funcionalidade,modelo:IC.f.modelo,classe:IC.f.classe,estado:IC.f.estado,ordem:IC.ordem,pagina:IC.pagina,porPagina:IC.porPagina}),box=IC.hist;
    IC.pagina=R.pagina;box.innerHTML="";
    if(!R.total){box.appendChild(h("p",{class:"empty",text:"Nenhuma chamada com esses filtros."}));return}
    box.appendChild(h("p",{class:"sub",role:"status",text:"Mostrando "+R.de+"–"+R.ate+" de "+R.total+(R.total===1?" chamada":" chamadas")+" · soma "+icUsd(R.soma.usd)+" (reconciliado "+icUsd(R.soma.reconciliado)+", estimado "+icUsd(R.soma.estimado)+", reserva "+icUsd(R.soma.reserva)+")."}));
    var tb=h("tbody");
    R.itens.forEach(function(x){var l=x.l,tr=h("tr",{class:"icl clic",tabindex:"0"},
      h("td",{"data-l":"Data e hora",text:icQuando(l.criado_em)}),h("td",{"data-l":"Funcionalidade",text:NUCLEO.iaModulo(l.funcionalidade)}),h("td",{"data-l":"Provedor",text:l.provedor||"anthropic"}),h("td",{"data-l":"Modelo",text:icModelo(l.modelo)}),
      h("td",{class:"num","data-l":"Tokens",text:l.tokens_entrada!=null?NUCLEO.iaNum(l.tokens_entrada,0)+" → "+NUCLEO.iaNum(l.tokens_saida||0,0):"—"}),
      h("td",{class:"num","data-l":"Custo",text:x.classe==="sem_custo"?"—":icUsd(x.usd)}),h("td",{"data-l":"Classe"},icTag(x.classeRotulo,"icc-"+x.classe)),h("td",{"data-l":"Status",text:x.status}));
      racDica.ligar(tr,function(){return [NUCLEO.iaModulo(l.funcionalidade)+" · "+icQuando(l.criado_em),icDetalhe(x)]});
      tr.addEventListener("keydown",function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();tr.click()}});tb.appendChild(tr)});
    box.appendChild(h("div",{class:"tblwrap icwrap"},h("table",{class:"tbl ichist"},h("thead",null,h("tr",null,["Data e hora","Funcionalidade","Provedor","Modelo","Tokens","Custo","Classe","Status"].map(function(t,i){return h("th",{class:i===4||i===5?"num":"",text:t})}))),tb)));
    var ant=h("button",{type:"button",class:"ghostbtn",text:"← Anterior"}),prox=h("button",{type:"button",class:"ghostbtn",text:"Próxima →"});
    ant.disabled=R.pagina<=1;prox.disabled=R.pagina>=R.paginas;
    ant.onclick=function(){IC.pagina=R.pagina-1;icHistorico()};prox.onclick=function(){IC.pagina=R.pagina+1;icHistorico()};
    box.appendChild(h("div",{class:"vfil icpag"},ant,h("span",{class:"sub",text:"Página "+R.pagina+" de "+R.paginas}),prox))}
  /* o que foi usado no cálculo daquela chamada (só o que o registro tem; o que falta aparece como "sem registro") */
  function icDetalhe(x){var l=x.l,p=[];
    p.push(x.classeRotulo+(x.classe==="estimado"?" (tokens × preço da hora)":x.classe==="reconciliado"?" (valor conferido no Console)":""));
    p.push(l.preco_entrada_usd_mtok!=null?"preço US$ "+NUCLEO.iaNum(l.preco_entrada_usd_mtok,2)+" entrada / US$ "+NUCLEO.iaNum(l.preco_saida_usd_mtok,2)+" saída por milhão"+(l.precos_conferido_em?" (conferido em "+dataBR(String(l.precos_conferido_em).slice(0,10))+")":""):"preço da hora: sem registro");
    if(l.custo_entrada_usd!=null)p.push("entrada "+icUsd(l.custo_entrada_usd)+" + saída "+icUsd(l.custo_saida_usd));
    if(l.tokens_cache_leitura||l.tokens_cache_escrita)p.push("cache lido "+NUCLEO.iaNum(l.tokens_cache_leitura||0,0)+" / escrito "+NUCLEO.iaNum(l.tokens_cache_escrita||0,0)+(l.cache_como_entrada?" (contado como entrada)":""));
    p.push(l.cambio_brl_usd!=null?"câmbio "+NUCLEO.iaNum(l.cambio_brl_usd,2)+(l.custo_brl!=null?" · "+NUCLEO.iaReais(l.custo_brl):""):"câmbio da hora: sem registro");
    if(l.recalculado_usd!=null)p.push("recalculado hoje "+icUsd(l.recalculado_usd));
    if(l.ms!=null)p.push(NUCLEO.iaNum(l.ms/1000,1)+" s");
    if(l.requisicao_id)p.push("requisição "+l.requisicao_id);
    return p.join(" · ")}
