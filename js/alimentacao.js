/* Dia a Dia RAC — módulo carregado quando a seção abre. Alimentação e Delivery (docs/alimentacao.md): pedidos de delivery e
   restaurante (tabelas pedidos e pedido_itens, 024_alimentacao.sql), com itens, taxas, gorjeta, descontos, fotos e versões, e o
   resumo dos gastos com comida (Mercado + pedidos, pela view alimentacao_gastos). Supermercado, açougue, padaria e hortifrúti
   continuam no Mercado: aqui eles só aparecem nas contas, sem cópia. A casa (o Rayner e a Fernanda) vê e lança junto.
   As contas ficam no núcleo (NUCLEO.al*); os gráficos são os do Resumo (rsColunas, rsBarras). A IA fica em DEMO. */
  var ALI={aba:"resumo",pedidos:null,mercado:null,carregando:null,aberto:null,editar:null};
  var ALI_ABAS=[["resumo","Resumo"],["pedidos","Pedidos"],["precos","Pratos e preços"],["novo","＋ Novo pedido"]];
  var ALI_COLS="id,data,hora,estabelecimento,plataforma,modo,numero,pagamento,subtotal,taxa_entrega,taxa_servico,gorjeta,desconto_loja,desconto_plataforma,total_pago,observacoes,arquivos,origem,versoes,criado_em,atualizado_em";
  function aliNum(v){return v==null||v===""?null:+v}
  /* pedido do banco → o formato das contas do núcleo (números, itens na ordem) */
  function aliPedido(r){var p={};Object.keys(r).forEach(function(k){p[k]=r[k]});
    ["subtotal","taxa_entrega","taxa_servico","gorjeta","desconto_loja","desconto_plataforma","total_pago"].forEach(function(k){p[k]=aliNum(r[k])});
    p.itens=(r.pedido_itens||[]).slice().sort(function(a,b){return a.ordem-b.ordem}).map(function(i){return {id:i.id,descricao:i.descricao,qtd:aliNum(i.qtd),unidade:i.unidade,unitario:aliNum(i.unitario),total:aliNum(i.total),desconto:aliNum(i.desconto)||0,observacao:i.observacao,produto_id:i.produto_id}});
    delete p.pedido_itens;return p}
  function aliPag(q){var acc=[];function pag(f){return Promise.resolve().then(function(){return q(f)}).then(sbOk).then(function(l){acc=acc.concat(l);return l.length===1000?pag(f+1000):acc})}return pag(0)}
  /* pedidos (todos, com os itens) e a comida do Mercado dos últimos 12 meses; cada fonte falha sozinha */
  function aliCarregar(forcar){
    if(ALI.carregando&&!forcar)return ALI.carregando;
    ALI.carregando=aliLer().then(function(r){ALI.pedidos=r[0];ALI.mercado=r[1];return r});
    ALI.carregando.catch(function(){ALI.carregando=null});return ALI.carregando}
  /* só lê (não mexe em ALI): o carregar normal e o botão de atualizar usam o mesmo caminho */
  function aliLer(){
    var ini=NUCLEO.pnMeses(hojeISO(),12)[0]+"-01";
    return Promise.all([
      aliPag(function(f){return SB.from("pedidos").select(ALI_COLS+",pedido_itens(id,ordem,descricao,qtd,unidade,unitario,total,desconto,observacao,produto_id)").order("data",{ascending:false}).order("criado_em",{ascending:false}).range(f,f+999)})
        .then(function(l){return {ok:true,v:l.map(aliPedido)}},function(e){logErro("alimentacao",e);return {ok:false,erro:e.message||String(e)}}),
      aliPag(function(f){return SB.from("alimentacao_gastos").select("data,estabelecimento,categoria,produto,valor").eq("origem","mercado").gte("data",ini).order("data").range(f,f+999)})
        .then(function(l){return {ok:true,v:l.map(function(x){return {data:x.data,mercado:x.estabelecimento,categoria:x.categoria,produto:x.produto,valor_total:+x.valor}})}},function(e){logErro("alimentacao",e);return {ok:false,erro:e.message||String(e)}})])}
  function aliEsquecer(){ALI.carregando=null;if(typeof PAINEL!=="undefined")PAINEL.cache={}}
  /* botão de atualizar: pedidos e Mercado de novo; só troca se as duas leituras vierem (a aba, a busca e o pedido aberto ficam) */
  atuModulo("alimentacao",{
    buscar:function(){return aliLer().then(function(r){return {pedidos:r[0],mercado:r[1]}})},
    antes:function(){return NUCLEO.atuEstado({pedidos:ALI.pedidos,mercado:ALI.mercado})},
    trocar:function(n){ALI.pedidos=n.pedidos;ALI.mercado=n.mercado;ALI.carregando=Promise.resolve([n.pedidos,n.mercado]);if(typeof PAINEL!=="undefined")PAINEL.cache={}}});

  function renderAlimentacao(sub,id){
    ALI.aba=ALI_ABAS.some(function(a){return a[0]===sub})||sub==="editar"?sub:"resumo";
    var root=$("#alimentacao-view");root.innerHTML="";
    var topo=panel("Alimentação e Delivery","Pedidos de delivery e restaurante, e a comida do Mercado nas contas. Supermercado, açougue, padaria e hortifrúti continuam sendo lançados no Mercado."),
      abas=h("div",{class:"seg famseg alabas",role:"group","aria-label":"Área"});
    ALI_ABAS.forEach(function(a){abas.appendChild(h("a",{href:"#alimentacao/"+a[0],"aria-pressed":String(ALI.aba===a[0]),text:a[1]}))});
    topo.appendChild(abas);root.appendChild(topo);
    var corpo=h("div",{class:"stack"},h("div",{class:"panel"},loading()));root.appendChild(corpo);
    aliCarregar().then(function(){corpo.innerHTML="";
      if(ALI.aba==="novo"){corpo.appendChild(aliForm(null));return}
      if(ALI.aba==="editar"){var p=ALI.pedidos.ok&&ALI.pedidos.v.filter(function(x){return x.id===id})[0];
        corpo.appendChild(p?aliForm(p):h("div",{class:"panel"},h("p",{class:"empty",text:"Esse pedido não foi encontrado."}),h("a",{class:"ghostbtn",href:"#alimentacao/pedidos",text:"Ver os pedidos"})));return}
      ({resumo:aliResumo,pedidos:aliLista,precos:aliPrecos}[ALI.aba])().forEach(function(x){if(x)corpo.appendChild(x)})})
    .catch(function(e){corpo.innerHTML="";corpo.appendChild(h("div",{class:"panel"},failed(function(){aliEsquecer();renderAlimentacao(ALI.aba)},e)))})}

  function aliFonte(t){return h("p",{class:"sub pnfonte",text:"Fonte: "+t})}
  function aliVazio(t){return h("p",{class:"empty",text:t})}
  function aliPlat(p){return NUCLEO.AL_PLATAFORMAS[p.plataforma]||p.plataforma}
  function aliBaldes(meses){return meses.map(function(m){return {k:m,cima:MES3[+m.slice(5,7)-1],baixo:m.slice(2,4),nome:MES3[+m.slice(5,7)-1]+"/"+m.slice(0,4)}})}

  /* ---------- Resumo: o mês, a evolução e para onde foi o dinheiro ---------- */
  function aliResumo(){
    var L=[],meses=NUCLEO.pnMeses(hojeISO(),6),mes=meses[meses.length-1],ped=ALI.pedidos.ok?ALI.pedidos.v:[],merc=NUCLEO.alMercadoDespesas(ALI.mercado.ok?ALI.mercado.v:[]);
    var despPed=[];ped.forEach(function(p){despPed=despPed.concat(NUCLEO.alPedidoDespesas(p).map(function(x){x.estab=p.estabelecimento;return x}))});
    var todas=merc.linhas.concat(despPed),doMes=todas.filter(function(x){return x.d.slice(0,7)===mes}),S=NUCLEO.alSomar(doMes);
    var fonte=function(f){return NUCLEO.alSomar(doMes.filter(function(x){return x.f===f})).total};
    var p1=panel("Este mês","Comida do Mercado e pedidos de "+MES3[+mes.slice(5,7)-1]+"/"+mes.slice(0,4)+". Limpeza, higiene, fraldas e descartáveis do Mercado ficam fora.");
    if(!ALI.pedidos.ok)p1.appendChild(aliVazio("Não consegui ler os pedidos agora ("+ALI.pedidos.erro+")."));
    if(!ALI.mercado.ok)p1.appendChild(aliVazio("Não consegui ler o Mercado agora ("+ALI.mercado.erro+")."));
    if(!todas.length){p1.appendChild(aliVazio("Nenhum gasto com alimentação ainda. Lance um pedido em “＋ Novo pedido” ou uma nota no Mercado."));L.push(p1);return L}
    var nPed=ped.filter(function(p){return p.data.slice(0,7)===mes}).length,taxas=(S.por[NUCLEO.AL_CAT.taxas]||0)+(S.por[NUCLEO.AL_CAT.gorjeta]||0);
    p1.appendChild(rsKpis([["Alimentação no mês",brl(S.total)],["Mercado (comida)",brl(fonte("Mercado"))],["Delivery",brl(fonte("Delivery"))],["Restaurante",brl(fonte("Restaurante"))],
      ["Taxas e gorjetas",brl(taxas)],["Pedidos",nPed]]));
    var cats=Object.keys(S.por).sort(function(a,b){return S.por[b]-S.por[a]});
    if(cats.length){p1.appendChild(h("h3",{class:"mbag",text:"Por categoria"}));
      p1.appendChild(rsBarras(cats.map(function(c){var v=S.por[c];return {nome:c.replace("Alimentação · ",""),v:v,txt:brl(v),dica:brl(v)+" · "+Math.round(v/(S.total||1)*100)+"% da alimentação do mês"}})))}
    p1.appendChild(aliFonte("Mercado (itens de comida das notas) e pedidos · "+MES3[+mes.slice(5,7)-1]+"/"+mes.slice(0,4)));L.push(p1);
    /* evolução: comida do Mercado × delivery × restaurante, mês a mês */
    var B=aliBaldes(meses),pm=NUCLEO.pnPorMes(todas,meses),p2=panel("Evolução","Últimos 6 meses. Toque numa coluna para ver o valor.");
    p2.appendChild(rsColunas(B,meses.map(function(m){return pm[m].total}),function(v){return v>=1000?fmtN(Math.round(v/100)/10)+" mil":String(Math.round(v))},function(i,v){var o=pm[meses[i]].por;
      return [B[i].nome,v?brl(v)+" · Mercado "+brl(o.Mercado||0)+" · Delivery "+brl(o.Delivery||0)+" · Restaurante "+brl(o.Restaurante||0):"sem gastos"]}));
    var dPorMes=meses.map(function(m){var o=pm[m].por;return (o.Delivery||0)+(o.Restaurante||0)});
    if(dPorMes.some(function(v){return v})){p2.appendChild(h("h3",{class:"mbag",text:"Pedidos (delivery e restaurante)"}));
      p2.appendChild(rsColunas(B,dPorMes,function(v){return String(Math.round(v))},function(i,v){return [B[i].nome,v?brl(v)+" em pedidos":"sem pedidos"]}))}
    p2.appendChild(aliFonte("Mercado e pedidos · "+dataBR(meses[0]+"-01")+" a "+dataBR(hojeISO())));L.push(p2);
    /* onde: estabelecimentos dos últimos 6 meses */
    var est={},ini=meses[0];todas.forEach(function(x){if(x.d.slice(0,7)<ini)return;var k=String(x.estab||"").replace(/\s*\(.*\)$/,"")||"—";est[k]=est[k]||{v:0,f:x.f};est[k].v+=x.v});
    var top=Object.keys(est).sort(function(a,b){return est[b].v-est[a].v}).slice(0,10);
    if(top.length){var p3=panel("Onde mais foi","Estabelecimentos dos últimos 6 meses (só comida).");
      p3.appendChild(rsBarras(top.map(function(k){return {nome:k,sub:est[k].f,v:est[k].v,txt:brl(est[k].v),dica:brl(est[k].v)+" · "+est[k].f}})));
      p3.appendChild(aliFonte("Mercado e pedidos · últimos 6 meses"));L.push(p3)}
    var sem=Object.keys(merc.sem);if(sem.length)L.push(h("div",{class:"panel"},h("p",{class:"sub",text:"Categorias do Mercado sem classificação (fora das contas da alimentação): "+sem.map(function(k){return k+" "+brl(merc.sem[k])}).join(" · ")+"."})));
    return L}

  /* ---------- Pedidos: lista por mês e detalhe ---------- */
  function aliLista(){
    var p=panel("Pedidos","Toque num pedido para ver os itens, as taxas e as fotos, editar ou apagar.");
    if(!ALI.pedidos.ok){p.appendChild(aliVazio("Não consegui ler os pedidos agora ("+ALI.pedidos.erro+")."));return [p]}
    var ped=ALI.pedidos.v;if(!ped.length){p.appendChild(aliVazio("Nenhum pedido lançado ainda."));p.appendChild(h("div",{class:"vfil"},h("a",{class:"ghostbtn pri",href:"#alimentacao/novo",text:"＋ Novo pedido"})));return [p]}
    /* pedidos gravados que não fecham (sem itens, itens ≠ subtotal, conta aberta): só aponta; a correção é pelo Editar */
    var integ=NUCLEO.alIntegridadeLista(ped),conf={};integ.pedidos.forEach(function(x){conf[x.id]=1});
    if(integ.comProblema)p.appendChild(h("p",{class:"alconf",role:"status",text:"⚠ "+integ.comProblema+(integ.comProblema===1?" pedido para conferir: ":" pedidos para conferir: ")+
      integ.pedidos.slice(0,3).map(function(x){return x.estabelecimento+" ("+dataBR(x.data).slice(0,5)+")"}).join(", ")+(integ.comProblema>3?"…":"")+". Abra o pedido e use Editar para corrigir."}));
    var q=h("input",{type:"search",placeholder:"Buscar (estabelecimento ou item)","aria-label":"Buscar pedidos"}),lista=h("div");p.appendChild(q);p.appendChild(lista);
    function draw(){lista.innerHTML="";var nq=NUCLEO.norm(q.value.trim()),meses={};
      ped.filter(function(x){return !nq||NUCLEO.norm(x.estabelecimento+" "+x.itens.map(function(i){return i.descricao}).join(" ")).indexOf(nq)>=0}).forEach(function(x){(meses[x.data.slice(0,7)]=meses[x.data.slice(0,7)]||[]).push(x)});
      var ks=Object.keys(meses).sort().reverse();if(!ks.length){lista.appendChild(aliVazio("Nada encontrado."));return}
      ks.forEach(function(m){var l=meses[m],t=l.reduce(function(s,x){return s+x.total_pago},0);
        lista.appendChild(h("h3",{class:"mbag",text:MES3[+m.slice(5,7)-1]+"/"+m.slice(0,4)+" · "+l.length+(l.length===1?" pedido":" pedidos")+" · "+brl(t)}));
        lista.appendChild(h("ul",{class:"wl"},l.map(function(x){var b=h("button",{type:"button",class:"alped","aria-expanded":String(ALI.aberto===x.id)},
            h("span",{class:"when",text:dataBR(x.data).slice(0,5)}),h("span",{class:"grow"},h("b",{text:x.estabelecimento}),h("span",{class:"sub",text:(conf[x.id]?"⚠ conferir · ":"")+aliPlat(x)+" · "+NUCLEO.AL_MODOS[x.modo]+" · "+x.itens.length+(x.itens.length===1?" item":" itens")+((x.arquivos||[]).length?" · 📎":"")})),
            h("b",{class:"mkt",text:brl(x.total_pago)}));
          var li=h("li",{class:"alli"},b);b.onclick=function(){ALI.aberto=ALI.aberto===x.id?null:x.id;draw()};
          if(ALI.aberto===x.id)li.appendChild(aliDetalhe(x));return li})))})}
    q.addEventListener("input",draw);draw();return [p]}
  function aliDetalhe(x){var d=h("div",{class:"aldet"}),C=NUCLEO.alPedidoConta(x),I=NUCLEO.alIntegridade(x);
    if(!I.ok)d.appendChild(h("p",{class:"alconf",text:"Para conferir: "+I.problemas.join(" ")}));
    d.appendChild(h("div",{class:"famtabw"},h("table",{class:"famtab"},h("thead",null,h("tr",null,h("th",{text:"Item"}),h("th",{class:"num",text:"Qtd"}),h("th",{class:"num",text:"Total"}))),
      h("tbody",null,x.itens.map(function(i){return h("tr",null,h("td",null,i.descricao,i.observacao?h("small",{class:"sub",text:" · "+i.observacao}):null),h("td",{class:"num",text:fmtN(i.qtd)}),
        h("td",{class:"num",text:brl(i.total-(i.desconto||0))+(i.desconto?" (−"+brl(i.desconto)+")":"")}))})))));
    var linhas=[["Itens",C.subtotal],["Taxa de entrega",x.taxa_entrega],["Taxa de serviço",x.taxa_servico],["Gorjeta",x.gorjeta],["Desconto da loja",x.desconto_loja?-x.desconto_loja:0],["Desconto da plataforma",x.desconto_plataforma?-x.desconto_plataforma:0]]
      .filter(function(l){return l[1]}).map(function(l){return h("li",null,h("span",{class:"grow",text:l[0]}),h("span",{text:(l[1]<0?"−":"")+brl(Math.abs(l[1]))}))});
    linhas.push(h("li",null,h("b",{class:"grow",text:"Total pago"}),h("b",{text:brl(x.total_pago)})));d.appendChild(h("ul",{class:"wl alconta"},linhas));
    var info=[x.hora?"às "+x.hora:"",x.numero?"pedido "+x.numero:"",x.pagamento||"",x.origem&&x.origem!=="manual"?"lido por "+(x.origem==="ia"?"IA":"Claude"):"",(x.versoes||[]).length?"editado "+x.versoes.length+(x.versoes.length===1?" vez":" vezes"):""].filter(Boolean);
    if(info.length)d.appendChild(h("p",{class:"sub",text:info.join(" · ")}));
    if(x.observacoes)d.appendChild(h("p",{text:x.observacoes}));
    if((x.arquivos||[]).length){var fotos=h("div",{class:"vfil alfotos"},h("span",{class:"sub",text:"Carregando as fotos…"}));d.appendChild(fotos);
      SB.storage.from("familia").createSignedUrls(x.arquivos.map(function(a){return a.path}),3600).then(function(r){fotos.innerHTML="";
        (r.data||[]).forEach(function(u,i){if(!u.signedUrl)return;var a=x.arquivos[i];fotos.appendChild(/^image\//.test(a.tipo||"")?h("a",{href:u.signedUrl,target:"_blank",rel:"noopener"},h("img",{src:u.signedUrl,alt:a.nome||"Foto do comprovante",loading:"lazy"})):h("a",{class:"ghostbtn",href:u.signedUrl,target:"_blank",rel:"noopener",text:"📎 "+(a.nome||"arquivo")}))})},
        function(){fotos.innerHTML="";fotos.appendChild(h("span",{class:"sub",text:"Não consegui abrir as fotos agora."}))})}
    var ap=h("button",{type:"button",class:"ghostbtn",text:"Apagar este pedido"}),st=h("span",{class:"sub",role:"status"});
    ap.onclick=function(){if(!confirm("Apagar o pedido de "+brl(x.total_pago)+" em "+x.estabelecimento+" ("+dataBR(x.data)+")? Os itens e as fotos saem junto."))return;
      ap.disabled=true;st.textContent="Apagando…";
      SB.from("pedidos").delete().eq("id",x.id).then(sbOk).then(function(){var ps=(x.arquivos||[]).map(function(a){return a.path}).filter(Boolean);return ps.length?SB.storage.from("familia").remove(ps).catch(function(){}):null})
        .then(function(){ALI.aberto=null;aliEsquecer();renderAlimentacao("pedidos")},function(e){ap.disabled=false;st.textContent="Não consegui apagar ("+e.message+")."})};
    d.appendChild(h("div",{class:"vfil"},h("a",{class:"ghostbtn pri",href:"#alimentacao/editar/"+x.id,text:"Editar"}),ap,st));return d}

  /* ---------- Pratos e preços: o histórico de cada item por estabelecimento (pratos não se misturam com o Mercado) ---------- */
  function aliPrecos(){
    var p=panel("Pratos e preços","Cada item dos pedidos, por estabelecimento: quantas vezes, o último preço e o menor. Os pratos ficam aqui e não entram no histórico de preços do Mercado.");
    if(!ALI.pedidos.ok){p.appendChild(aliVazio("Não consegui ler os pedidos agora ("+ALI.pedidos.erro+")."));return [p]}
    var g={};ALI.pedidos.v.forEach(function(x){x.itens.forEach(function(i){var q=i.qtd||1,u=i.unitario!=null?i.unitario:(i.total-(i.desconto||0))/q;if(!(u>=0))return;
      var k=NUCLEO.alChaveProduto(i.descricao)+"|"+NUCLEO.alChaveProduto(x.estabelecimento);(g[k]=g[k]||{nome:i.descricao,est:x.estabelecimento,l:[]}).l.push({d:x.data,u:u})})});
    var L=Object.keys(g).map(function(k){var o=g[k],l=o.l.sort(function(a,b){return a.d<b.d?-1:1}),ult=l[l.length-1],pri=l[0];
      return {nome:o.nome,est:o.est,n:l.length,ult:ult,min:Math.min.apply(null,l.map(function(x){return x.u})),varr:l.length>1&&pri.u>0?(ult.u-pri.u)/pri.u*100:null}}).sort(function(a,b){return b.n-a.n||(a.nome<b.nome?-1:1)});
    if(!L.length){p.appendChild(aliVazio("Nenhum item lançado ainda."));return [p]}
    p.appendChild(h("div",{class:"famtabw"},h("table",{class:"famtab"},h("thead",null,h("tr",null,["Item","Onde","Vezes","Último","Menor","Variação"].map(function(c,i){return h("th",{class:i>=2?"num":"",text:c})}))),
      h("tbody",null,L.slice(0,200).map(function(x){return h("tr",null,h("td",{text:x.nome}),h("td",{text:x.est}),h("td",{class:"num",text:String(x.n)}),h("td",{class:"num",text:brl(x.ult.u)+" · "+dataBR(x.ult.d).slice(0,5)}),
        h("td",{class:"num",text:brl(x.min)}),h("td",{class:"num",text:x.varr==null?"—":(x.varr>0?"+":"")+Math.round(x.varr)+"%"}))})))));
    p.appendChild(aliFonte("pedidos lançados (preço unitário de cada vez)"));return [p]}

  /* ---------- Novo pedido e edição: conferência completa antes do Salvar; nada é gravado antes do toque ---------- */
  function aliForm(ant){
    var novo=!ant,id=novo?novoId():ant.id,salvando=false,dupOk=false,origem=novo?"manual":ant.origem||"manual";
    var p=panel(novo?"＋ Novo pedido":"Editar pedido",novo?"Preencha olhando o pedido ou o recibo. As fotos são opcionais e ficam como comprovante. Nada é gravado antes do Salvar.":"Corrija o que precisar. Os valores anteriores ficam guardados no pedido."),f=h("div",{class:"wform"});
    var campo=function(rot,el){return h("label",null,rot,el)},num=function(v,ph){return h("input",{type:"text",inputmode:"decimal",placeholder:ph||"0,00",value:v==null||v===0?"":String(v).replace(".",",")})};
    var estabs={};(ALI.pedidos.ok?ALI.pedidos.v:[]).forEach(function(x){estabs[x.estabelecimento]=1});
    var est=h("input",{type:"text",list:"ali-estabs",maxlength:"120",placeholder:"Ex.: Pizzaria do bairro",value:ant?ant.estabelecimento:""}),dl=h("datalist",{id:"ali-estabs"},Object.keys(estabs).sort().map(function(e){return h("option",{value:e})}));
    var data=h("input",{type:"date",value:ant?ant.data:hojeISO(),max:hojeISO()}),hora=h("input",{type:"time",value:ant&&ant.hora||""});
    var plat=h("select",null,[["","Escolha…"]].concat(Object.keys(NUCLEO.AL_PLATAFORMAS).map(function(k){return [k,NUCLEO.AL_PLATAFORMAS[k]]})).map(function(o){return h("option",{value:o[0],selected:ant&&ant.plataforma===o[0]?"":null,text:o[1]})}));
    var modo=h("select",null,[["","Escolha…"]].concat(Object.keys(NUCLEO.AL_MODOS).map(function(k){return [k,NUCLEO.AL_MODOS[k]]})).map(function(o){return h("option",{value:o[0],selected:ant&&ant.modo===o[0]?"":null,text:o[1]})}));
    var numero=h("input",{type:"text",maxlength:"40",placeholder:"Opcional",value:ant&&ant.numero||""}),pag=h("input",{type:"text",maxlength:"60",placeholder:"Ex.: Crédito (nunca o número do cartão)",value:ant&&ant.pagamento||""});
    var V={};[["taxa_entrega","Taxa de entrega"],["taxa_servico","Taxa de serviço"],["gorjeta","Gorjeta"],["desconto_loja","Desconto da loja"],["desconto_plataforma","Desconto do app ou cupom"]].forEach(function(k){V[k[0]]={rot:k[1],el:num(ant?ant[k[0]]:null)}});
    var total=num(ant?ant.total_pago:null),obs=h("textarea",{rows:"2",maxlength:"1000",placeholder:"Opcional"},ant&&ant.observacoes||""),fotos=h("input",{type:"file",multiple:"",accept:"image/*,application/pdf","aria-label":"Fotos do pedido ou do recibo"});
    var itensBox=h("div",{class:"alitens"}),regs=[];
    function linha(it){it=it||{};var r={desc:h("input",{type:"text",maxlength:"160",placeholder:"Item (ex.: Pizza grande)",value:it.descricao||""}),qtd:h("input",{type:"text",inputmode:"decimal",value:it.qtd!=null?String(it.qtd).replace(".",","):"1","aria-label":"Quantidade"}),
        tot:num(it.total!=null?it.total:null),desc2:num(it.desconto||null,"desconto"),obs:h("input",{type:"text",maxlength:"300",placeholder:"Observação (ex.: sem cebola)",value:it.observacao||""}),produto_id:it.produto_id||null};
      var tira=h("button",{type:"button",class:"ghostbtn",text:"×","aria-label":"Tirar este item"});
      r.row=h("div",{class:"alitem"},h("div",{class:"two"},campo("Item",r.desc),campo("Qtd",r.qtd),campo("Total da linha (R$)",r.tot),campo("Desconto do item",r.desc2)),h("div",{class:"vfil"},r.obs,tira));
      tira.onclick=function(){r.row.remove();regs.splice(regs.indexOf(r),1);mudou()};
      [r.desc,r.qtd,r.tot,r.desc2].forEach(function(x){x.addEventListener("input",mudou)});return r}
    function addLinha(it){var r=linha(it);regs.push(r);itensBox.appendChild(r.row);return r}
    (ant&&ant.itens.length?ant.itens:[null]).forEach(addLinha);
    var mais=h("button",{type:"button",class:"ghostbtn",text:"＋ Item"});mais.onclick=function(){addLinha().desc.focus();mudou()};
    if(novo&&typeof iaLigada==="function"&&iaLigada())f.appendChild(iaBotao({modulo:"alimentacao",acao:"alimentacao.pedido",arquivos:function(){return [].slice.call(fotos.files||[])},
      demo:"DEMONSTRAÇÃO: a leitura do pedido com IA ainda não está ligada. Nada foi lido das fotos e nenhum campo foi preenchido. Preencha a conferência abaixo olhando o pedido.",
      real:function(){/* em DEMO nunca chega aqui; a leitura real é de uma próxima etapa (docs/alimentacao.md) */}}));
    f.appendChild(campo("📷 Fotos do pedido ou do recibo (opcional)",fotos));
    if(ant&&(ant.arquivos||[]).length)f.appendChild(h("p",{class:"sub",text:ant.arquivos.length+(ant.arquivos.length===1?" foto guardada":" fotos guardadas")+"; as novas entram junto."}));
    f.appendChild(h("div",{class:"two"},campo("Estabelecimento",est),campo("Data",data),campo("Hora (opcional)",hora)));dl&&f.appendChild(dl);
    f.appendChild(h("div",{class:"two"},campo("Onde foi o pedido",plat),campo("Como",modo),campo("Número do pedido",numero),campo("Pagamento",pag)));
    f.appendChild(h("h3",{class:"mbag",text:"Itens"}));f.appendChild(itensBox);f.appendChild(h("div",{class:"vfil"},mais));
    f.appendChild(h("h3",{class:"mbag",text:"Taxas, gorjeta e descontos"}));
    f.appendChild(h("div",{class:"two"},Object.keys(V).map(function(k){return campo(V[k].rot,V[k].el)})));
    var conta=h("ul",{class:"wl alconta"});f.appendChild(conta);
    f.appendChild(h("div",{class:"two"},campo("Total pago (R$)",total)));f.appendChild(campo("Observações",obs));
    var salvar=h("button",{type:"button",text:"Salvar pedido"}),falta=h("p",{class:"sub",role:"status"}),cancel=h("a",{class:"ghostbtn",href:"#alimentacao/pedidos",text:"Cancelar"});
    f.appendChild(h("div",{class:"qrsave"},salvar,cancel,falta));p.appendChild(f);
    [est,data,plat,modo,total,numero].concat(Object.keys(V).map(function(k){return V[k].el})).forEach(function(x){x.addEventListener("input",mudou);x.addEventListener("change",mudou)});
    function coletar(){var o={id:id,estabelecimento:est.value.trim(),data:data.value,hora:hora.value||null,plataforma:plat.value,modo:modo.value,numero:numero.value.trim()||null,pagamento:pag.value.trim()||null,
        total_pago:total.value.trim(),observacoes:obs.value.trim()||null,itens:regs.map(function(r){return {descricao:r.desc.value.trim(),qtd:r.qtd.value.trim(),total:r.tot.value.trim(),desconto:r.desc2.value.trim(),observacao:r.obs.value.trim()||null,produto_id:r.produto_id}})};
      Object.keys(V).forEach(function(k){o[k]=V[k].el.value.trim()});return o}
    /* mudou um campo: a confirmação de "parece repetido" vale só para o que estava na tela */
    function mudou(){dupOk=false;salvar.textContent="Salvar pedido";conferir()}
    function conferir(){var o=coletar(),c=NUCLEO.alConferir(o,{hoje:hojeISO()}),k=c.conta;conta.innerHTML="";
      if(k.subtotal!=null)[["Itens",k.subtotal],["Taxas",k.taxas],["Gorjeta",k.gorjeta],["Descontos",k.descontos?-k.descontos:0],["A conta dá",k.calculado]].forEach(function(l){if(l[1]||l[0]==="A conta dá")conta.appendChild(h("li",null,h("span",{class:"grow",text:l[0]}),h("span",{text:(l[1]<0?"−":"")+brl(Math.abs(l[1]||0))})))});
      salvar.disabled=!c.ok||salvando;falta.textContent=c.ok?"Tudo certo para salvar.":"Para salvar: "+c.erros.slice(0,3).join(" ");return c}
    conferir();
    salvar.onclick=function(){if(salvando)return;var c=conferir();if(!c.ok)return;
      if(!navigator.onLine){falta.textContent="Sem internet: não salvei. Os dados continuam aqui; tente quando voltar.";return}
      var o=coletar(),R=function(v){return Math.round((NUCLEO.alCent(v)||0))/100};
      salvando=true;salvar.disabled=true;falta.textContent="Conferindo se o pedido já existe…";
      /* duplicidade: o mesmo número na mesma plataforma bloqueia; mesmo lugar, dia e valor (outro pedido ou uma nota do Mercado) só
         pede um segundo toque. As notas do Mercado são só um aviso: se não carregarem, o Salvar continua */
      Promise.all([SB.from("pedidos").select("id,data,estabelecimento,plataforma,numero,total_pago").or("data.eq."+o.data+(o.numero?",numero.not.is.null":"")).then(sbOk),
        Promise.resolve().then(function(){return SB.from("notas").select("id,data,total,mercados(nome)").eq("data",o.data)}).then(sbOk).catch(function(){return []})]).then(function(l){
        var dup=NUCLEO.alDuplicata(o,l[0],ant?ant.id:null),dupM=NUCLEO.alDuplicataMercado(o,l[1]),avisos=[];
        if(dup&&dup.nivel==="confirmada"&&!(novo&&dup.motivo==="é o mesmo lançamento"))throw {dup:"Já existe: "+dup.motivo+" ("+dup.pedido.estabelecimento+", "+dataBR(dup.pedido.data)+", "+brl(+dup.pedido.total_pago)+"). Nada foi gravado."};
        if(dup&&dup.nivel==="confirmada")throw {mesmo:true};
        if(dup&&dup.nivel==="possivel")avisos.push("Parece repetido: "+dup.motivo+" ("+dup.pedido.estabelecimento+", "+brl(+dup.pedido.total_pago)+").");
        if(dupM)avisos.push("Parece já lançado no Mercado: "+dupM.motivo+" ("+(dupM.nota.mercados&&dupM.nota.mercados.nome||"nota")+", "+dataBR(dupM.nota.data)+", "+brl(+dupM.nota.total)+").");
        if(avisos.length&&!dupOk)throw {possivel:avisos.join(" ")+" Se for outro gasto, toque de novo em Salvar."};
        falta.textContent=(fotos.files||[]).length?"Enviando as fotos…":"Salvando…";
        return (fotos.files&&fotos.files.length?enviarArquivos("alimentacao",id,fotos.files,function(t){falta.textContent=t}):Promise.resolve([]))})
      .then(function(novas){var conta=NUCLEO.alPedidoConta(o);
        var linhaP={id:id,data:o.data,hora:o.hora,estabelecimento:o.estabelecimento,plataforma:o.plataforma,modo:o.modo,numero:o.numero,pagamento:o.pagamento,subtotal:conta.subtotal,
          taxa_entrega:R(o.taxa_entrega),taxa_servico:R(o.taxa_servico),gorjeta:R(o.gorjeta),desconto_loja:R(o.desconto_loja),desconto_plataforma:R(o.desconto_plataforma),total_pago:R(o.total_pago),
          observacoes:o.observacoes,arquivos:(ant&&ant.arquivos||[]).concat(novas)};
        if(novo)linhaP.origem=origem;
        var itens=o.itens.map(function(i){return {descricao:i.descricao,qtd:+String(i.qtd||"1").replace(",",".")||1,total:R(i.total),desconto:R(i.desconto),observacao:i.observacao,produto_id:i.produto_id}});
        /* uma chamada só (027): o banco grava o pedido e os itens juntos, guarda a versão anterior e desfaz tudo se algo falhar */
        return atuDurante("a gravação do pedido",function(){return SB.rpc("pedido_salvar",{p_pedido:linhaP,p_itens:itens,p_novo:novo})}).then(function(r){if(r.error)throw r.error;return r.data})})
      .then(function(){aliEsquecer();ALI.aberto=id;location.hash="#alimentacao/pedidos"},function(e){salvando=false;
        if(e&&e.mesmo){aliEsquecer();ALI.aberto=id;location.hash="#alimentacao/pedidos";return}
        /* 23505: o mesmo id (toque duplo que chegou junto) já está gravado; ou o número já existe nessa plataforma */
        if(e&&e.code==="23505"){if(/pedidos_pkey/.test(e.message||"")){aliEsquecer();ALI.aberto=id;location.hash="#alimentacao/pedidos";return}
          e={dup:"Já existe um pedido com esse número nessa plataforma. Nada foi gravado."}}
        if(e&&e.possivel){dupOk=true;salvar.disabled=false;salvar.textContent="Salvar mesmo assim";falta.textContent=e.possivel;return}
        salvar.disabled=false;falta.textContent=e&&e.dup?e.dup:"Não consegui salvar ("+(e&&e.message||e)+"). Os dados continuam aqui.";if(!(e&&e.dup))logErro("alimentacao",e)})};
    return p}
