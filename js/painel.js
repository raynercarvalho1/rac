/* Dia a Dia RAC — módulo carregado quando a seção abre. Painel de Produtividade: a evolução mês a mês do que já existe no site
   (Mercado, gastos dos registros, MBA, relógio Garmin, tarefas, estudos e competências), com a fonte e o período de cada número.
   Só lê: as contas ficam no núcleo (NUCLEO.pn*) e os gráficos são os do Resumo (rsColunas, rsBarras, rsKpis). A única gravação é o
   orçamento por categoria (tabela orcamentos), e só no botão Salvar. Nenhum número é inventado: sem dado, aparece o aviso de vazio. */
  var PAINEL={aba:"geral",n:6,cache:{}};
  var PN_ABAS=[["geral","Visão geral"],["financas","Finanças"],["saude","Saúde e atividades"],["estudos","MBA e desenvolvimento"]];
  var PN_TRILHA_SKILL={sql:"sql",bi:"powerbi",python:"python"};
  function pnBRL(v){return v==null?"—":brl(v)}
  function pnCurto(v){return v>=1000?fmtN(Math.round(v/100)/10)+" mil":String(Math.round(v))}
  function pnMesNome(m){return RS_MESES[+m.slice(5,7)-1]+" de "+m.slice(0,4)}
  function pnBaldes(meses){return meses.map(function(m){return {k:m,cima:MES3[+m.slice(5,7)-1],baixo:m.slice(2,4),nome:pnMesNome(m)}})}
  /* a origem e o período de cada número, sempre embaixo do quadro */
  function pnFonte(txt,ini,fim){return h("p",{class:"sub pnfonte",text:"Fonte: "+txt+(ini?" · período: "+dataBR(ini)+" a "+dataBR(fim):"")})}
  function pnVazio(txt){return h("p",{class:"empty",text:txt})}
  function pnDif(v,va,fmt,inverso){var x=NUCLEO.pnVariacao(v,va);if(!x)return "sem base para comparar";if(Math.abs(x.dif)<1e-9)return "igual ao anterior";
    var bom=inverso?x.dif<0:x.dif>0;return (bom?"▲ ":"▼ ")+(x.dif>0?"+":"−")+fmt(Math.abs(x.dif))+" ("+(x.pct>0?"+":"")+Math.round(x.pct)+"%)"}
  function pnKpi(rot,val,sub){return h("div",null,h("span",{class:"kl",text:rot}),h("b",{class:"kv",text:val}),sub?h("span",{class:"ksub",text:sub}):null)}
  function pnPag(q){var acc=[];function pag(f){return Promise.resolve().then(function(){return q(f)}).then(sbOk).then(function(l){acc=acc.concat(l);return l.length===1000?pag(f+1000):acc})}return pag(0)}
  function pnFonteReg(q){var F=typeof FAM!=="undefined"&&FAM[q];return F?(F.veic?"Veículos":F.docs?"Documentos":F.n):q}

  /* tudo do período (e do período anterior, do mesmo tamanho, para comparar); cada fonte falha sozinha */
  function pnCarregar(n){
    if(PAINEL.cache[n])return PAINEL.cache[n];
    var P=pnLer(n,false);PAINEL.cache[n]=P;P.catch(function(){delete PAINEL.cache[n]});return P}
  /* só lê (não mexe no PAINEL). fresco: o relógio também é relido do banco (o botão de atualizar), sem trocar SAUDE aqui */
  function pnLer(n,fresco){
    var hoje=hojeISO(),meses=NUCLEO.pnMeses(hoje,n),todos=NUCLEO.pnMeses(hoje,2*n),ini2=todos[0]+"-01";
    function seguro(p){return p.then(function(v){return {ok:true,v:v}},function(e){logErro("painel",e);return {ok:false,erro:e.message||String(e)}})}
    var P=Promise.all([
      seguro(pnPag(function(f){return SB.from("compras").select("data,categoria,valor_total,mercado,numero,produto").gte("data",ini2).order("data").range(f,f+999)})),
      seguro(pnPag(function(f){return SB.from("registros").select("id,quem,tipo,data,titulo,dados,criado_em").gte("data",ini2).order("data").range(f,f+999)})),
      seguro(Promise.resolve().then(function(){return SB.from("lista").select("id,item,feito,feito_em,criado").eq("tipo","tarefa")}).then(sbOk)),
      seguro(Promise.resolve().then(function(){return SB.from("orcamentos").select("categoria,valor")}).then(sbOk)),
      seguro((fresco?saudeLer():(SAUDE.dias?Promise.resolve():saudeCarregar()).then(function(){return {dias:SAUDE.dias||[],ativs:SAUDE.ativs||[]}}))
        .then(function(x){return {dias:x.dias,ativs:x.ativs.filter(function(a){return TREINO_OCULTOS.indexOf(a.tipo)<0}),bruto:x}})),
      seguro(agendaColetar()),
      /* pedidos de delivery e restaurante (Alimentação), com os itens: entram nos gastos separados em comida, taxas e gorjeta */
      seguro(pnPag(function(f){return SB.from("pedidos").select("id,data,plataforma,modo,estabelecimento,subtotal,taxa_entrega,taxa_servico,gorjeta,desconto_loja,desconto_plataforma,total_pago,pedido_itens(descricao,qtd,total,desconto)").gte("data",ini2).order("data").range(f,f+999)})
        .then(function(l){return l.map(function(p){var o={};Object.keys(p).forEach(function(k){o[k]=k==="pedido_itens"?undefined:p[k]});["subtotal","taxa_entrega","taxa_servico","gorjeta","desconto_loja","desconto_plataforma","total_pago"].forEach(function(k){o[k]=+p[k]});
          o.itens=(p.pedido_itens||[]).map(function(i){return {descricao:i.descricao,qtd:+i.qtd,total:+i.total,desconto:+i.desconto||0}});return o})})),
      /* compras online (Central de Compras): o total pago de cada pedido, uma vez; as marcadas como já contadas em outro lugar ficam fora */
      seguro(pnPag(function(f){return SB.from("compras_online").select("id,data,loja,vendedor,total_pago,categoria,fora_das_contas,status,canal,natureza,historico,origem,impostos_info,compras_online_itens(descricao,total,desconto,categoria,natureza,total_linha,situacao)").gte("data",ini2).order("data").order("id").range(f,f+999)})
        .then(function(l){return l.map(NUCLEO.coDeBanco)}))])
    .then(function(r){return {hoje:hoje,meses:meses,todos:todos,ini:meses[0]+"-01",iniAnt:todos[0]+"-01",fimAnt:maisDias(meses[0]+"-01",-1),
      compras:r[0],registros:r[1],tarefas:r[2],orcamentos:r[3],saude:r[4],agenda:r[5],pedidos:r[6],online:r[7]}});
    return P}
  var PN_FONTES=["compras","registros","tarefas","orcamentos","saude","agenda","pedidos","online"];
  function pnFontes(D){var o={};PN_FONTES.forEach(function(k){o[k]=D[k]});return o}
  /* botão de atualizar (no lugar do antigo "Atualizar" do Painel): o período aberto de novo, inclusive o relógio; troca só se toda fonte
     que estava boa continuar boa. Os outros períodos guardados saem da memória (são relidos ao abrir) e o SAUDE recebe o relógio novo */
  atuModulo("painel",{
    buscar:function(){var n=PAINEL.n;return pnLer(n,true).then(function(D){return {n:n,D:D}})},
    fontes:function(x){return pnFontes(x.D)},
    antes:function(){var D=PAINEL.ult&&PAINEL.ult.n===PAINEL.n?PAINEL.ult.D:null;return D?NUCLEO.atuEstado(pnFontes(D)):{}},
    trocar:function(x){PAINEL.cache={};PAINEL.cache[x.n]=Promise.resolve(x.D);
      if(x.D.saude.ok){SAUDE.dias=x.D.saude.v.bruto.dias;SAUDE.ativs=x.D.saude.v.bruto.ativs}}});

  function renderPainel(aba){
    PAINEL.aba=PN_ABAS.some(function(a){return a[0]===aba})?aba:"geral";
    var root=$("#painel-view");root.innerHTML="";
    var topo=panel("Painel de Produtividade","A evolução dos seus dados mês a mês. Cada número diz de onde veio e de que período é; sem dado, o quadro avisa em vez de inventar."),
      abas=h("div",{class:"seg famseg pnabas",role:"group","aria-label":"Área"}),per=h("div",{class:"seg famseg pnper",role:"group","aria-label":"Período"});
    PN_ABAS.forEach(function(a){abas.appendChild(h("a",{href:"#painel/"+a[0],"aria-pressed":String(PAINEL.aba===a[0]),text:a[1]}))});
    [3,6,12].forEach(function(n){var b=h("button",{type:"button","aria-pressed":String(PAINEL.n===n),text:n+" meses"});b.onclick=function(){PAINEL.n=n;renderPainel(PAINEL.aba)};per.appendChild(b)});
    topo.appendChild(abas);topo.appendChild(h("div",{class:"vfil pnbarra"},per));root.appendChild(topo);
    var corpo=h("div",{class:"stack"},h("div",{class:"panel"},loading()));root.appendChild(corpo);
    pnCarregar(PAINEL.n).then(function(D){corpo.innerHTML="";PAINEL.ult={n:PAINEL.n,D:D};
      var f={geral:pnGeral,financas:pnFinancas,saude:pnSaude,estudos:pnEstudos}[PAINEL.aba];f(D).forEach(function(p){if(p)corpo.appendChild(p)})})
    .catch(function(e){corpo.innerHTML="";corpo.appendChild(h("div",{class:"panel"},failed(function(){renderPainel(PAINEL.aba)},e)));logErro("painel",e)})}

  /* ---------- contas comuns às abas ---------- */
  function pnGastos(D){var mf=typeof mbaFin==="function"?mbaFin():null;
    return NUCLEO.pnDespesas(D.compras.ok?D.compras.v:[],D.registros.ok?D.registros.v:[],mf?mf.ps:[],pnFonteReg,D.pedidos&&D.pedidos.ok?D.pedidos.v:[],D.online&&D.online.ok?D.online.v:[])}
  function pnTreinos(D){return D.saude.ok?D.saude.v.ativs:[]}
  /* estudos concluídos com data: tópicos e exercícios do MBA, trilhas de Estudos e exercícios de SQL (as marcações do próprio site) */
  function pnEstudosFeitos(){var L=[],f=typeof mbaFeito==="function"?mbaFeito():{};
    (typeof mbaDiscs==="function"?mbaDiscs():[]).forEach(function(d){
      (d.roteiro||[]).forEach(function(t){var dt=f[d.id+":"+t.k];if(dt)L.push({d:String(dt).slice(0,10),t:(t.t||t.n||t.k)+" · "+(d.n||d.nome||""),orig:"MBA"})});
      (d.exercicios||[]).forEach(function(e){var dt=f[d.id+":ex"+e.n];if(dt)L.push({d:String(dt).slice(0,10),t:"Exercício "+e.n+" · "+(d.n||d.nome||""),orig:"MBA"})})});
    var ex=PESSOAL.exercicios||{};(typeof TRILHAS!=="undefined"?TRILHAS:[]).forEach(function(tr){tr.itens.forEach(function(i){var dt=ex[i[0]];if(dt&&typeof dt==="string")L.push({d:dt.slice(0,10),t:i[1],skill:PN_TRILHA_SKILL[tr.k],orig:"Estudos"})})});
    var sq=PESSOAL.sqlFeitos||{};Object.keys(sq).forEach(function(k){if(typeof sq[k]==="string")L.push({d:sq[k].slice(0,10),t:"Exercício de SQL "+k,skill:"sql",orig:"Carreira (SQL)"})});
    return L.sort(function(a,b){return b.d.localeCompare(a.d)})}
  function pnTarefasFeitas(D){return D.tarefas.ok?D.tarefas.v.filter(function(t){return t.feito&&t.feito_em}).map(function(t){return {d:t.feito_em.slice(0,10),t:t.item}}):[]}
  function pnConta(itens,meses){var o=NUCLEO.pnPorMes(itens.map(function(x){return {d:x.d,v:1,f:x.orig||"x"}}),meses);return meses.map(function(m){return o[m].total})}

  /* ---------- 1. visão geral ---------- */
  function pnGeral(D){
    var hoje=D.hoje,mes=hoje.slice(0,7),ant=NUCLEO.pnMeses(hoje,2)[0],L=[];
    var g=pnGastos(D),pg=NUCLEO.pnPorMes(g,[ant,mes]),tr=pnTreinos(D),est=pnEstudosFeitos(),tf=pnTarefasFeitas(D);
    var nTr=function(m){return tr.filter(function(a){return a.inicio.slice(0,7)===m}).length},nIt=function(l,m){return l.filter(function(x){return x.d.slice(0,7)===m}).length};
    /* o mês atual ainda está correndo: compara com o mesmo número de dias do mês anterior */
    var dia=+hoje.slice(8,10),corte=ant+"-"+String(dia).padStart(2,"0"),gAntCorte=g.filter(function(x){return x.d.slice(0,7)===ant&&x.d<=corte}).reduce(function(s,x){return s+x.v},0);
    var p=panel("Este mês","De 1º de "+RS_MESES[+mes.slice(5,7)-1]+" até hoje, comparado com o mesmo trecho do mês anterior.");
    p.appendChild(h("div",{class:"kgasto"},
      pnKpi("Gastos",pnBRL(pg[mes].total),pnDif(pg[mes].total,gAntCorte,brl,true)),
      pnKpi("Treinos",String(nTr(mes)),pnDif(nTr(mes),tr.filter(function(a){return a.inicio.slice(0,7)===ant&&a.inicio.slice(0,10)<=corte}).length,String)),
      pnKpi("Estudos concluídos",String(nIt(est,mes)),pnDif(nIt(est,mes),est.filter(function(x){return x.d.slice(0,7)===ant&&x.d<=corte}).length,String)),
      pnKpi("Tarefas feitas",String(nIt(tf,mes)),pnDif(nIt(tf,mes),tf.filter(function(x){return x.d.slice(0,7)===ant&&x.d<=corte}).length,String))));
    p.appendChild(pnFonte("Mercado, gastos dos registros e parcelas do MBA pagas; relógio Garmin; marcações do MBA, Estudos e SQL; Lista → Tarefas",ant+"-01",hoje));L.push(p);
    /* evolução mensal: as quatro séries do período, lado a lado */
    var B=pnBaldes(D.meses),pm=NUCLEO.pnPorMes(g,D.meses),pe=panel("Evolução mensal","Últimos "+D.meses.length+" meses. Toque numa coluna para ver o valor.");
    function serie(tit,vals,fmt,dica){var temAlgo=vals.some(function(v){return v});pe.appendChild(h("h3",{class:"mbag",text:tit}));
      pe.appendChild(temAlgo?rsColunas(B,vals,fmt,function(i,v){return [B[i].nome,dica(i,v)]}):pnVazio("Sem registros de "+tit.toLowerCase()+" no período."))}
    serie("Gastos",D.meses.map(function(m){return pm[m].total}),function(v){return pnCurto(v)},function(i,v){var por=pm[D.meses[i]].por;return brl(v)+(Object.keys(por).length?" · "+Object.keys(por).map(function(k){return k+" "+brl(por[k])}).join(" · "):"")});
    serie("Treinos",D.meses.map(function(m){return nTr(m)}),String,function(i,v){return v+(v===1?" treino":" treinos")});
    var ce=pnConta(est,D.meses),ct=pnConta(tf,D.meses);
    serie("Estudos concluídos",ce,String,function(i,v){return v+(v===1?" item concluído":" itens concluídos")});
    serie("Tarefas feitas",ct,String,function(i,v){return v+(v===1?" tarefa":" tarefas")});
    pe.appendChild(pnFonte("as mesmas do quadro acima",D.ini,D.hoje));L.push(pe);
    /* comparação entre períodos: últimos n meses × os n anteriores (só com histórico nos dois) */
    var pa=NUCLEO.pnPorMes(g,D.todos.slice(0,D.meses.length)),somaA=D.todos.slice(0,D.meses.length).reduce(function(s,m){return s+pa[m].total},0),somaP=D.meses.reduce(function(s,m){return s+pm[m].total},0);
    var trA=tr.filter(function(a){return a.inicio.slice(0,10)>=D.iniAnt&&a.inicio.slice(0,10)<=D.fimAnt}).length,trP=tr.filter(function(a){return a.inicio.slice(0,10)>=D.ini}).length;
    var pc=panel("Comparação entre períodos","Os últimos "+D.meses.length+" meses contra os "+D.meses.length+" anteriores (o mês atual entra incompleto).");
    if(!somaA&&!trA)pc.appendChild(pnVazio("Ainda não há histórico no período anterior ("+dataBR(D.iniAnt)+" a "+dataBR(D.fimAnt)+") para comparar."));
    else pc.appendChild(h("div",{class:"kgasto"},pnKpi("Gastos",pnBRL(somaP),somaA?"antes: "+brl(somaA)+" · "+pnDif(somaP,somaA,brl,true):"sem gastos no período anterior"),
      pnKpi("Treinos",String(trP),trA?"antes: "+trA+" · "+pnDif(trP,trA,String):"sem treinos no período anterior")));
    pc.appendChild(pnFonte("Mercado, registros, MBA e relógio Garmin",D.iniAnt,D.hoje));L.push(pc);
    /* atividades recentes: o que aconteceu de verdade, de todas as fontes */
    var rec=[];
    if(D.compras.ok){var nt={};D.compras.v.forEach(function(x){var k=x.data+"|"+x.mercado+"|"+(x.numero||"");nt[k]=nt[k]||{d:x.data,t:"Compra no "+String(x.mercado||"mercado").replace(/\s*\(.*\)$/,""),v:0,ico:"🛒",href:"#mercado"};nt[k].v+=+x.valor_total||0});
      Object.keys(nt).forEach(function(k){var n=nt[k];n.sub=brl(n.v);rec.push(n)})}
    tr.forEach(function(a){rec.push({d:a.inicio.slice(0,10),t:(a.dados.nome||ativTipo(a.tipo)[0]),sub:a.dados.distancia?fmtN(Math.round(a.dados.distancia/100)/10)+" km":hmDur(a.dados.duracao),ico:ativTipo(a.tipo)[1],href:"#saude/treino/"+a.id})});
    if(D.registros.ok)D.registros.v.forEach(function(r){var F=typeof FAM!=="undefined"&&FAM[r.quem];if(!F)return;rec.push({d:r.data,t:r.titulo,sub:F.n,ico:(typeof AGENDA_ICO!=="undefined"&&AGENDA_ICO[r.quem])||"📄",href:F.veic?"#veiculos/"+r.quem:F.docs?"#documentos":"#"+r.quem})});
    est.forEach(function(x){rec.push({d:x.d,t:x.t,sub:"concluído · "+x.orig,ico:"🎓",href:x.orig==="MBA"?"#mba":x.orig==="Estudos"?"#estudos":"#carreira"})});
    tf.forEach(function(x){rec.push({d:x.d,t:x.t,sub:"tarefa feita",ico:"✅",href:"#lista/tarefas"})});
    rec=rec.filter(function(x){return x.d&&x.d<=hoje}).sort(function(a,b){return b.d.localeCompare(a.d)}).slice(0,10);
    var pr=panel("Atividades recentes","As 10 mais novas, de todas as áreas."),ul=h("ul",{class:"wl"});
    rec.forEach(function(x){ul.appendChild(h("li",null,h("span",{class:"pnico",text:x.ico}),h("a",{class:"grow",href:x.href},h("b",{text:x.t||"(sem título)"}),h("span",{class:"sub",text:dataBR(x.d)+(x.sub?" · "+x.sub:"")}))))});
    pr.appendChild(rec.length?ul:pnVazio("Nenhuma atividade registrada no período."));pr.appendChild(pnFonte("Mercado, relógio Garmin, registros da família e veículos, MBA, Estudos e tarefas",D.iniAnt,D.hoje));L.push(pr);
    /* pendências e compromissos: a Agenda única do site (nada novo) */
    var pp=panel("Pendências e compromissos","O que vem nos próximos 14 dias e o que ficou para trás, pela Agenda.");
    if(!D.agenda.ok)pp.appendChild(pnVazio("Não consegui ler a Agenda agora ("+D.agenda.erro+")."));
    else{var lim=maisDias(hoje,14),atr=D.agenda.v.filter(function(e){return e.data<hoje&&!e.semRetorno}),prox=D.agenda.v.filter(function(e){return e.data>=hoje&&e.data<=lim});
      var tAb=D.tarefas.ok?D.tarefas.v.filter(function(t){return !t.feito}).length:null;
      pp.appendChild(h("div",{class:"kgasto"},pnKpi("Próximos 14 dias",String(prox.length)),pnKpi("Atrasados",String(atr.length)),tAb!=null?pnKpi("Tarefas abertas",String(tAb)):null,
        pnKpi("Lembretes abertos",String((PESSOAL.lembretes||[]).filter(function(l){return !l.feito}).length))));
      var ua=h("ul",{class:"wl"});atr.concat(prox).slice(0,8).forEach(function(e){ua.appendChild(h("li",{class:e.data<hoje?"alerta":null},h("span",{class:"pnico",text:agendaIco(e)}),
        h("span",{class:"grow"},h("b",{text:e.t}),h("span",{class:"sub",text:(e.data<hoje?"atrasado · ":"")+dataBR(e.data)+(e.sub?" · "+e.sub:"")}))))});
      if(ua.children.length)pp.appendChild(ua);else pp.appendChild(pnVazio("Nada na Agenda nos próximos 14 dias."));
      pp.appendChild(h("div",{class:"vfil"},h("a",{class:"ghostbtn",href:"#agenda",text:"Abrir a Agenda"})))}
    pp.appendChild(pnFonte("Agenda (MBA, família, veículos, documentos, carreira, lembretes) e Lista → Tarefas",hoje,maisDias(hoje,14)));L.push(pp);
    return L}

  /* ---------- 2. finanças ---------- */
  function pnFinancas(D){
    var L=[],g=pnGastos(D),B=pnBaldes(D.meses),pm=NUCLEO.pnPorMes(g,D.meses),vals=D.meses.map(function(m){return pm[m].total}),hoje=D.hoje,mes=hoje.slice(0,7);
    if(!D.compras.ok)L.push(h("div",{class:"panel"},pnVazio("Não consegui ler as compras do Mercado agora ("+D.compras.erro+"); os números abaixo ficam sem elas.")));
    /* indicadores */
    var comGasto=vals.filter(function(v){return v>0}),media=comGasto.length?comGasto.reduce(function(a,b){return a+b},0)/comGasto.length:null,
      maior=D.meses.reduce(function(m,k,i){return !m||vals[i]>m.v?{m:k,v:vals[i]}:m},null),proj=NUCLEO.pnProjecao(pm[mes]?pm[mes].total:0,hoje);
    var pi=panel("Indicadores de controle","Médias só com os meses que têm gasto registrado.");
    if(!comGasto.length)pi.appendChild(pnVazio("Nenhum gasto registrado no período."));
    else pi.appendChild(h("div",{class:"kgasto"},pnKpi("Média por mês",pnBRL(media),comGasto.length+(comGasto.length===1?" mês com gasto":" meses com gasto")),
      pnKpi("Maior mês",pnBRL(maior.v),pnMesNome(maior.m)),pnKpi("Este mês até hoje",pnBRL(pm[mes].total),proj?"no ritmo atual: ~"+brl(proj)+" no mês":"projeção depois do dia 5"),
      pnKpi("Gasto por dia (este mês)",pnBRL(pm[mes].total/(+hoje.slice(8,10))))));
    pi.appendChild(pnFonte("Mercado (itens das notas), registros com custo (veículos, Eddie, Olivia, documentos) e parcelas do MBA pagas (no mês do vencimento)",D.ini,hoje));L.push(pi);
    /* gastos por mês, por fonte */
    var pg=panel("Gastos por mês","Toque numa coluna para ver de onde veio cada parte.");
    pg.appendChild(vals.some(function(v){return v})?rsColunas(B,vals,pnCurto,function(i,v){var por=pm[D.meses[i]].por;return [B[i].nome,brl(v)+" · "+Object.keys(por).sort(function(a,b){return por[b]-por[a]}).map(function(k){return k+" "+brl(por[k])}).join(" · ")]}):pnVazio("Nenhum gasto no período."));
    var porF={};g.forEach(function(x){if(x.d>=D.ini)porF[x.f]=(porF[x.f]||0)+x.v});var tf=Object.keys(porF).reduce(function(s,k){return s+porF[k]},0);
    if(tf)pg.appendChild(rsBarras(Object.keys(porF).sort(function(a,b){return porF[b]-porF[a]}).map(function(k){return {nome:k,v:porF[k],txt:brl(porF[k]),sub:Math.round(porF[k]/tf*100)+"% do período",dica:brl(porF[k])+" · "+Math.round(porF[k]/tf*100)+"% do período"}})));
    pg.appendChild(pnFonte("Mercado, registros com custo e MBA",D.ini,hoje));L.push(pg);
    L=L.concat(pnVeiculos(D,B));
    /* evolução das compras do Mercado: quantas idas e ticket médio */
    var pc=panel("Evolução das compras","Idas ao mercado (uma por nota) e o valor médio de cada uma.");
    if(D.compras.ok){var notas={};D.compras.v.forEach(function(x){if(x.data<D.ini)return;var k=x.data+"|"+x.mercado+"|"+(x.numero||"");notas[k]=notas[k]||{m:x.data.slice(0,7),t:0};notas[k].t+=+x.valor_total||0});
      var nPor=D.meses.map(function(m){return Object.keys(notas).filter(function(k){return notas[k].m===m}).length}),tPor=D.meses.map(function(m){return Object.keys(notas).filter(function(k){return notas[k].m===m}).reduce(function(s,k){return s+notas[k].t},0)});
      if(nPor.some(function(v){return v})){pc.appendChild(h("h3",{class:"mbag",text:"Compras por mês"}));pc.appendChild(rsColunas(B,nPor,String,function(i,v){return [B[i].nome,v+(v===1?" compra":" compras")+(v?" · ticket médio "+brl(tPor[i]/v):"")]}));
        pc.appendChild(h("h3",{class:"mbag",text:"Ticket médio"}));pc.appendChild(rsColunas(B,D.meses.map(function(m,i){return nPor[i]?tPor[i]/nPor[i]:0}),pnCurto,function(i,v){return [B[i].nome,v?brl(v)+" por compra":"sem compras"]}))}
      else pc.appendChild(pnVazio("Nenhuma compra lançada no Mercado no período."))}
    pc.appendChild(pnFonte("Mercado (notas lançadas)",D.ini,hoje));L.push(pc);
    L.push(pnAlimentacao(D,B));L.push(pnOnline(D,B));
    /* categorias do período */
    var pk=panel("Categorias de despesas","Mercado pela categoria do produto; os registros pelo tipo (consulta, abastecimento…).");
    var cat={};g.forEach(function(x){if(x.d<D.ini)return;var k=x.f==="Mercado"||/^Alimentação · /.test(x.cat)?x.cat:x.f==="Compras online"?"Compras online · "+x.cat:x.f+" · "+(x.f==="Veículos"?NUCLEO.pnVeicCat(x.cat):typeof tipoInfo==="function"?tipoInfo(x.cat)[1]:x.cat);cat[k]=(cat[k]||0)+x.v});
    var ks=Object.keys(cat).sort(function(a,b){return cat[b]-cat[a]});
    pk.appendChild(ks.length?rsBarras(ks.slice(0,12).map(function(k){return {nome:k,v:cat[k],txt:brl(cat[k])}})):pnVazio("Nenhuma despesa com categoria no período."));
    if(ks.length>12)pk.appendChild(h("p",{class:"sub",text:"+ "+(ks.length-12)+" categorias menores."}));
    pk.appendChild(pnFonte("Mercado (categoria do produto), registros com custo e pedidos (Alimentação)",D.ini,hoje));L.push(pk);
    L.push(pnOrcPainel(D));return L}
  /* alimentação: a comida do Mercado (sem limpeza, higiene, fraldas e descartáveis) e os pedidos, mês a mês, com taxas e gorjeta à parte.
     São os mesmos números dos gastos acima (nada é somado de novo): o Mercado vem da view compras, os pedidos da tabela pedidos. */
  function pnAlimentacao(D,B){var p=panel("Alimentação","Comida do Mercado e pedidos de delivery e restaurante. Limpeza, higiene, fraldas e descartáveis do Mercado ficam fora.");
    if(D.pedidos&&!D.pedidos.ok)p.appendChild(pnVazio("Não consegui ler os pedidos agora ("+D.pedidos.erro+")."));
    var merc=NUCLEO.alMercadoDespesas(D.compras.ok?D.compras.v.map(function(x){return {data:x.data,categoria:x.categoria,produto:x.produto,valor_total:x.valor_total,mercado:x.mercado}}):[]).linhas,ped=[];
    (D.pedidos&&D.pedidos.ok?D.pedidos.v:[]).forEach(function(x){ped=ped.concat(NUCLEO.alPedidoDespesas(x))});
    var todas=merc.concat(ped).filter(function(x){return x.d>=D.ini}),pm=NUCLEO.pnPorMes(todas,D.meses),S=NUCLEO.alSomar(todas),fonte=function(f){return NUCLEO.alSomar(todas.filter(function(x){return x.f===f})).total};
    if(!todas.length){p.appendChild(pnVazio("Nenhum gasto com alimentação no período."));p.appendChild(pnFonte("Mercado (comida) e pedidos",D.ini,D.hoje));return p}
    p.appendChild(rsKpis([["No período",brl(S.total)],["Mercado (comida)",brl(fonte("Mercado"))],["Pedidos",brl(fonte("Delivery")+fonte("Restaurante"))],["Taxas e gorjetas",brl((S.por[NUCLEO.AL_CAT.taxas]||0)+(S.por[NUCLEO.AL_CAT.gorjeta]||0))]]));
    p.appendChild(rsColunas(B,D.meses.map(function(m){return pm[m].total}),pnCurto,function(i,v){var o=pm[D.meses[i]].por;return [B[i].nome,v?brl(v)+" · Mercado "+brl(o.Mercado||0)+" · Delivery "+brl(o.Delivery||0)+" · Restaurante "+brl(o.Restaurante||0):"sem gastos com alimentação"]}));
    p.appendChild(h("div",{class:"vfil"},h("a",{class:"ghostbtn",href:"#alimentacao",text:"Abrir Alimentação"})));
    p.appendChild(pnFonte("Mercado (itens de comida) e pedidos de delivery e restaurante",D.ini,D.hoje));return p}
  /* compras online: o total pago por mês, por loja e por categoria (os mesmos números dos gastos acima, uma vez cada) */
  function pnOnline(D,B){var p=panel("Compras online","Pedidos da Central de Compras (Amazon, Mercado Livre e outras lojas), pelo total efetivamente pago.");
    if(D.online&&!D.online.ok){p.appendChild(pnVazio("Não consegui ler as compras online agora ("+D.online.erro+")."));p.appendChild(pnFonte("Central de Compras",D.ini,D.hoje));return p}
    var L=NUCLEO.coResumo(D.online?D.online.v:[]).despesas.filter(function(x){return x.d>=D.ini}),pm=NUCLEO.pnPorMes(L,D.meses);
    if(!L.length){p.appendChild(pnVazio("Nenhuma compra online no período."));p.appendChild(h("div",{class:"vfil"},h("a",{class:"ghostbtn",href:"#compras/importar",text:"Importar compras"})));p.appendChild(pnFonte("Central de Compras",D.ini,D.hoje));return p}
    var tot=L.reduce(function(s,x){return s+x.v},0),cat={};L.forEach(function(x){cat[x.cat]=(cat[x.cat]||0)+x.v});
    p.appendChild(rsKpis([["No período",brl(tot)],["Pedidos",L.length],["Ticket médio",brl(tot/L.length)]]));
    p.appendChild(rsColunas(B,D.meses.map(function(m){return pm[m].total}),pnCurto,function(i,v){return [B[i].nome,v?brl(v)+" · "+pm[D.meses[i]].n+(pm[D.meses[i]].n===1?" pedido":" pedidos"):"sem compras online"]}));
    var ks=Object.keys(cat).sort(function(a,b){return cat[b]-cat[a]});p.appendChild(h("h3",{class:"mbag",text:"Por categoria"}));
    p.appendChild(rsBarras(ks.map(function(k){return {nome:k,v:cat[k],txt:brl(cat[k]),dica:brl(cat[k])+" · "+Math.round(cat[k]/(tot||1)*100)+"% das compras online"}})));
    p.appendChild(h("div",{class:"vfil"},h("a",{class:"ghostbtn",href:"#compras",text:"Abrir a Central de Compras"})));
    p.appendChild(pnFonte("Central de Compras (total pago de cada pedido)",D.ini,D.hoje));return p}
  /* veículos: os registros dos veículos (os mesmos que já entram nos gastos, uma vez cada). Combustível é separado da manutenção;
     consumo e custo por km só por veículo, de tanque cheio a tanque cheio (NUCLEO.abConsumo), e só com trechos inteiros no período */
  function pnVeiculos(D,B){
    var veics=typeof FAM!=="undefined"?Object.keys(FAM).filter(function(k){return FAM[k].veic}):[],hoje=D.hoje,L=[];
    var R=D.registros.ok?D.registros.v.filter(function(r){return veics.indexOf(r.quem)>=0}):[],ab=R.filter(function(r){return r.tipo==="abastecimento"});
    var nome=function(q){return FAM[q].n},f1=function(v){return fmtN(Math.round(v*10)/10)},fonteAb="Veículos → abastecimentos (o total pago na bomba de cada um)";
    /* 1. combustível: gasto, litros, preço por litro e os últimos abastecimentos */
    var pc=panel("Combustível","Gasto e preço por litro dos abastecimentos de todos os veículos.");
    var rP=NUCLEO.abResumo(ab,D.ini,hoje),rA=NUCLEO.abResumo(ab,D.iniAnt,D.fimAnt);
    if(!D.registros.ok)pc.appendChild(pnVazio("Não consegui ler os registros dos veículos agora ("+D.registros.erro+")."));
    else if(!rP.n)pc.appendChild(pnVazio("Nenhum abastecimento registrado no período. Lance pelo ⛽ Novo abastecimento, em Veículos."));
    else{pc.appendChild(h("div",{class:"kgasto"},pnKpi("Gasto no período",pnBRL(rP.gasto),rA.n?"antes: "+brl(rA.gasto)+" · "+pnDif(rP.gasto,rA.gasto,brl,true):"sem abastecimentos no período anterior"),
        pnKpi("Litros",fmtN(Math.round(rP.litros*100)/100),rP.n+(rP.n===1?" abastecimento":" abastecimentos")),
        rP.precos.ponderado?pnKpi("Preço médio por litro",pnBRL(rP.precos.ponderado),"ponderado pelos litros"+(rP.precos.simples?" · simples "+brl(rP.precos.simples):"")):null));
      var pm=NUCLEO.abPorMes(ab,D.meses),porV={};veics.forEach(function(q){porV[q]=NUCLEO.abPorMes(ab.filter(function(r){return r.quem===q}),D.meses)});
      pc.appendChild(h("h3",{class:"mbag",text:"Gasto com combustível por mês"}));
      pc.appendChild(rsColunas(B,D.meses.map(function(m){return pm[m].gasto}),pnCurto,function(i,v){var m=D.meses[i];
        return [B[i].nome,v?brl(v)+" · "+fmtN(Math.round(pm[m].litros*100)/100)+" l · "+veics.filter(function(q){return porV[q][m].gasto}).map(function(q){return nome(q)+" "+brl(porV[q][m].gasto)}).join(" · "):"sem abastecimento"]}));
      pc.appendChild(h("h3",{class:"mbag",text:"Preço por litro (média ponderada do mês)"}));
      pc.appendChild(rsColunas(B,D.meses.map(function(m){return pm[m].preco||0}),function(v){return fmtN(Math.round(v*100)/100)},function(i,v){var m=D.meses[i];
        return [B[i].nome,v?brl(v)+"/l · "+fmtN(Math.round(pm[m].litros*100)/100)+" l":"sem abastecimento com litros e total"]}));
      var ult=ab.filter(function(r){return r.data>=D.ini}).sort(function(a,b){return b.data.localeCompare(a.data)}).slice(0,5),ul=h("ul",{class:"wl"});
      ult.forEach(function(r){var A=NUCLEO.abLer(r);ul.appendChild(h("li",null,h("span",{class:"pnico",text:"⛽"}),h("a",{class:"grow",href:"#veiculos/"+r.quem},
        h("b",{text:nome(r.quem)+" · "+dataBR(r.data)}),h("span",{class:"sub",text:[A.litros!=null?fmtLitros(A.litros)+" l":"",A.preco!=null?brl(A.preco)+"/l":"",A.tanque==="cheio"?"tanque cheio":A.tanque==="parcial"?"parcial":""].filter(Boolean).join(" · ")})),
        h("span",{class:"end",text:A.total!=null?brl(A.total):"—"})))});
      pc.appendChild(h("h3",{class:"mbag",text:"Últimos abastecimentos"}));pc.appendChild(ul)}
    pc.appendChild(pnFonte(fonteAb,D.ini,hoje));L.push(pc);
    /* 2. consumo e custo por km, por veículo (não se mistura moto com carro) */
    var pk=panel("Consumo e custo por km","Por veículo, de tanque cheio a tanque cheio: km rodados ÷ litros colocados (com os parciais do meio). Média ponderada: soma dos km ÷ soma dos litros. Custo por km: o que foi pago nesses trechos ÷ os km deles. Trecho com dado faltando ou incoerente fica fora.");
    var cv=veics.map(function(q){return {q:q,c:NUCLEO.abConsumo(ab.filter(function(r){return r.quem===q}),D.ini,hoje)}}).filter(function(x){return x.c.validos});
    if(cv.length)pk.appendChild(rsBarras(cv.map(function(x){var c=x.c;return {nome:nome(x.q),v:c.kml,txt:f1(c.kml)+" km/l",href:"#veiculos/"+x.q,
      sub:[c.custoKm?brl(c.custoKm)+"/km":"",fmtKm0(c.km),c.validos+(c.validos===1?" trecho":" trechos")].filter(Boolean).join(" · "),
      dica:f1(c.kml)+" km/l (ponderada"+(c.validos>1?"; simples "+f1(c.kmlSimples):"")+") · "+fmtKm0(c.km)+" com "+fmtN(Math.round(c.litros*100)/100)+" l"+(c.custoKm?" · "+brl(c.custoKm)+"/km":"")}})));
    else pk.appendChild(pnVazio("Ainda não há, no período, dois abastecimentos de tanque cheio seguidos do mesmo veículo. O consumo aparece a partir do segundo tanque cheio."));
    pk.appendChild(pnFonte(fonteAb+", com a quilometragem do painel e a marcação de tanque",D.ini,hoje));L.push(pk);
    /* 3. despesas dos veículos por categoria: combustível, manutenção, seguro e impostos, cada uma separada */
    var pd=panel("Despesas dos veículos","Combustível separado de manutenção, seguro e impostos. São os mesmos valores que entram nos gastos, uma vez cada.");
    var cat={},tot=0,totA=0;R.forEach(function(r){var c=(r.dados||{}).custo;if(typeof c!=="number"||!isFinite(c)||(r.dados||{}).compra)return;
      if(r.data>=D.ini&&r.data<=hoje){var k=nome(r.quem)+" · "+NUCLEO.pnVeicCat(r.tipo);cat[k]=(cat[k]||0)+c;tot+=c}else if(r.data>=D.iniAnt&&r.data<=D.fimAnt)totA+=c});
    var ks=Object.keys(cat).sort(function(a,b){return cat[b]-cat[a]});
    if(ks.length){pd.appendChild(h("div",{class:"kgasto"},pnKpi("Total dos veículos",pnBRL(tot),totA?"antes: "+brl(totA)+" · "+pnDif(tot,totA,brl,true):"sem despesas no período anterior")));
      pd.appendChild(rsBarras(ks.map(function(k){return {nome:k,v:cat[k],txt:brl(cat[k]),sub:Math.round(cat[k]/tot*100)+"% dos veículos"}})))}
    else pd.appendChild(pnVazio("Nenhuma despesa de veículo no período."));
    pd.appendChild(pnFonte("Veículos → registros com custo (abastecimentos, revisões, manutenção, seguro, impostos)",D.ini,hoje));L.push(pd);
    return L}
  function fmtKm0(v){return Math.round(v).toLocaleString("pt-BR")+" km"}
  /* orçamento do mês por categoria do Mercado: a tabela orcamentos já existia sem tela; aqui ela ganha a conferência e o ajuste */
  function pnOrcPainel(D){
    var mes=D.hoje.slice(0,7),gm={};if(D.compras.ok)D.compras.v.forEach(function(x){if(x.data.slice(0,7)===mes){var c=x.categoria||"Outros";gm[c]=(gm[c]||0)+(+x.valor_total||0)}});
    var p=panel("Orçamento × gasto ("+RS_MESES[+mes.slice(5,7)-1]+")","Quanto do orçamento mensal de cada categoria do Mercado já foi usado.");
    if(!D.orcamentos.ok){p.appendChild(pnVazio("Não consegui ler os orçamentos agora ("+D.orcamentos.erro+")."));return p}
    var o=NUCLEO.pnOrcamento(gm,D.orcamentos.v);
    if(!o.temOrcamento)p.appendChild(pnVazio("Nenhum orçamento cadastrado ainda. Defina abaixo quanto quer gastar por mês em cada categoria."));
    else{p.appendChild(h("div",{class:"kgasto"},pnKpi("Orçado",brl(o.orcado)),pnKpi("Usado",brl(o.gastoOrcado),Math.round(o.gastoOrcado/o.orcado*100)+"% do orçado"),
        pnKpi("Categorias acima",String(o.acima),o.dentro+" dentro")));
      p.appendChild(rsBarras(o.linhas.filter(function(x){return x.orcado!=null}).map(function(x){return {nome:x.categoria,v:Math.min(x.pct||0,150),txt:Math.round(x.pct||0)+"%"+(x.estado==="acima"?" ⚠":""),
        sub:brl(x.gasto)+" de "+brl(x.orcado),dica:brl(x.gasto)+" de "+brl(x.orcado)+(x.estado==="acima"?" · acima do orçamento":x.estado==="perto"?" · perto do limite":" · dentro")}})))}
    /* ajuste: uma linha por categoria que aparece no Mercado (ou já tem orçamento); grava só no Salvar */
    var cats={};if(D.compras.ok)D.compras.v.forEach(function(x){if(x.categoria)cats[NUCLEO.mkCatOficial(x.categoria)]=1});D.orcamentos.v.forEach(function(x){cats[NUCLEO.mkCatOficial(x.categoria)]=1});
    var lista=Object.keys(cats).sort();
    if(lista.length&&isOwner()){var atual={};D.orcamentos.v.forEach(function(x){var k=NUCLEO.mkCatOficial(x.categoria);atual[k]=(atual[k]||0)+(+x.valor)});
      var det=h("details",{class:"famvals"},h("summary",{text:o.temOrcamento?"Ajustar os orçamentos":"Definir orçamentos"})),tb=h("div",{class:"pnorc"}),ins={},st=h("p",{class:"sub",role:"status"});
      var med={};D.todos.slice(-4,-1).forEach(function(m){if(D.compras.ok)D.compras.v.forEach(function(x){if(x.data.slice(0,7)===m&&x.categoria){var k=NUCLEO.mkCatOficial(x.categoria);med[k]=(med[k]||0)+(+x.valor_total||0)/3}})});
      lista.forEach(function(c){var i=h("input",{type:"number",min:"0",step:"10",inputmode:"decimal","aria-label":"Orçamento de "+c,placeholder:med[c]?"média "+Math.round(med[c]):"sem orçamento"});
        if(atual[c]!=null)i.value=String(atual[c]);ins[c]=i;tb.appendChild(h("label",null,h("span",{text:c}),i))});
      var sv=h("button",{type:"button",text:"Salvar orçamentos"});
      sv.onclick=function(){var linhas=[];Object.keys(ins).forEach(function(c){var t=ins[c].value.trim();if(t==="")return;var v=Math.round(parseFloat(t.replace(",","."))*100)/100;if(isFinite(v)&&v>=0&&v!==atual[c])linhas.push({categoria:c,valor:v})});
        if(!linhas.length){st.textContent="Nada mudou.";return}
        sv.disabled=true;st.textContent="Salvando…";
        Promise.resolve().then(function(){return SB.from("orcamentos").upsert(linhas,{onConflict:"user_id,categoria"})}).then(sbOk).then(function(){st.textContent="✓ Salvo ("+linhas.length+(linhas.length===1?" categoria).":" categorias).");PAINEL.cache={};setTimeout(function(){renderPainel("financas")},900)})
          .catch(function(e){sv.disabled=false;st.textContent="Não consegui salvar: "+e.message;logErro("painel: orçamento",e)})};
      det.appendChild(h("p",{class:"sub",text:"Valor por mês. Em branco, a categoria fica sem orçamento. A sugestão cinza é a média real dos 3 meses anteriores."}));det.appendChild(tb);det.appendChild(h("div",{class:"vfil"},sv));det.appendChild(st);p.appendChild(det)}
    p.appendChild(pnFonte("Mercado (categoria do produto) e tabela orcamentos",mes+"-01",D.hoje));return p}

  /* ---------- 3. saúde e atividades ---------- */
  function pnSaude(D){
    var L=[];if(!D.saude.ok)return [h("div",{class:"panel"},pnVazio("Não consegui ler os dados do relógio agora ("+D.saude.erro+")."))];
    var at=D.saude.v.ativs.filter(function(a){return a.inicio.slice(0,10)>=D.ini}),dias=D.saude.v.dias,B=pnBaldes(D.meses),ini=D.ini<NUCLEO.SAU_MARCO.data?NUCLEO.SAU_MARCO.data:D.ini;
    if(!at.length&&!dias.some(function(d){return d.data>=D.ini}))return [h("div",{class:"panel"},pnVazio("Nenhum dado do relógio Garmin no período."),pnFonte("relógio Garmin (desde "+dataBR(NUCLEO.SAU_MARCO.data)+")",ini,D.hoje))];
    var c=NUCLEO.pnConsistencia(at.map(function(a){return a.inicio}),ini,D.hoje);
    var pc=panel("Frequência e consistência","Semana = de segunda a domingo. A semana atual sem treino ainda não quebra a sequência.");
    pc.appendChild(h("div",{class:"kgasto"},pnKpi("Treinos",String(c.treinos),c.diasAtivos+" dias com treino"),pnKpi("Por semana",fmtN(Math.round(c.porSemana*10)/10),"média do período"),
      pnKpi("Semanas ativas",c.semanasAtivas+" de "+c.semanas,Math.round(c.semanasAtivas/c.semanas*100)+"% das semanas"),pnKpi("Sequência atual",c.sequenciaAtual+(c.sequenciaAtual===1?" semana":" semanas"),"recorde no período: "+c.maiorSequencia)));
    pc.appendChild(pnFonte("relógio Garmin (treinos, sem os tipos que a Saúde esconde)",ini,D.hoje));L.push(pc);
    var pe=panel("Evolução das atividades","Treinos, distância e tempo por mês.");
    var nM=D.meses.map(function(m){return at.filter(function(a){return a.inicio.slice(0,7)===m}).length}),kmM=D.meses.map(function(m){return at.filter(function(a){return a.inicio.slice(0,7)===m}).reduce(function(s,a){return s+(a.dados.distancia||0)},0)/1000}),
      hM=D.meses.map(function(m){return at.filter(function(a){return a.inicio.slice(0,7)===m}).reduce(function(s,a){return s+(a.dados.duracao||0)},0)});
    if(nM.some(function(v){return v})){pe.appendChild(h("h3",{class:"mbag",text:"Treinos"}));pe.appendChild(rsColunas(B,nM,String,function(i,v){return [B[i].nome,v+(v===1?" treino":" treinos")+(hM[i]?" · "+hmDur(hM[i]):"")]}));
      if(kmM.some(function(v){return v>=0.1})){pe.appendChild(h("h3",{class:"mbag",text:"Distância (km)"}));pe.appendChild(rsColunas(B,kmM,function(v){return fmtN(Math.round(v))},function(i,v){return [B[i].nome,fmtN(Math.round(v*10)/10)+" km"]}))}
      pe.appendChild(h("h3",{class:"mbag",text:"Tempo de treino"}));pe.appendChild(rsColunas(B,hM.map(function(s){return s/3600}),function(v){return fmtN(Math.round(v*10)/10)+"h"},function(i,v){return [B[i].nome,hmDur(v*3600)]}))}
    else pe.appendChild(pnVazio("Nenhum treino no período."));
    var pt={};at.forEach(function(a){pt[a.tipo]=(pt[a.tipo]||0)+1});var tk=Object.keys(pt).sort(function(a,b){return pt[b]-pt[a]});
    if(tk.length){pe.appendChild(h("h3",{class:"mbag",text:"Tipos de atividade"}));pe.appendChild(rsBarras(tk.map(function(t){return {nome:ativTipo(t)[1]+" "+ativTipo(t)[0],v:pt[t],txt:pt[t]+"×"}})))}
    pe.appendChild(pnFonte("relógio Garmin",ini,D.hoje));L.push(pe);
    /* histórico das métricas diárias: média de cada mês (só dos dias que têm a medida) */
    var mets=SAUDE_MET.filter(function(m){return m[0]!=="humor"}),pm=panel("Histórico das métricas","Média de cada mês, só com os dias em que o relógio mediu. Toque numa coluna para ver quantos dias entraram.");
    var algum=false;mets.forEach(function(mt){var r=NUCLEO.pnMediaMes(dias,mt[2],D.meses);if(!r.some(function(x){return x.media!=null}))return;algum=true;
      pm.appendChild(h("h3",{class:"mbag",text:mt[1]+(mt[5]?" (maior é melhor)":" (menor é melhor)")}));
      pm.appendChild(rsColunas(B,r.map(function(x){return x.media||0}),function(v){return mt[3](v)},function(i){var x=r[i];return [B[i].nome,x.media==null?"sem medida":mt[3](x.media)+" · média de "+x.dias+(x.dias===1?" dia":" dias")]}))});
    if(!algum)pm.appendChild(pnVazio("Nenhuma métrica diária no período."));
    pm.appendChild(pnFonte("relógio Garmin (resumo diário)",ini,D.hoje));L.push(pm);
    return L}

  /* ---------- 4. MBA e desenvolvimento ---------- */
  function pnEstudos(D){
    var L=[],B=pnBaldes(D.meses),est=pnEstudosFeitos(),hoje=D.hoje;
    /* MBA: disciplinas, aulas, avaliações */
    var pm=panel("MBA","Progresso marcado na página do MBA."),ds=typeof mbaDiscs==="function"?mbaDiscs():[];
    if(!ds.length&&!(typeof mbaAulas==="function"&&mbaAulas().length))pm.appendChild(pnVazio("Nenhum dado do MBA importado ainda."));
    else{var au=mbaAulas(),feitas=au.filter(function(a){return a.data<=hoje}).length,av=typeof mbaAvals==="function"?mbaAvals():[];
      pm.appendChild(h("div",{class:"kgasto"},pnKpi("Aulas",feitas+" de "+au.length,au.length?Math.round(feitas/au.length*100)+"% do calendário":""),
        pnKpi("Disciplinas",ds.filter(function(d){return d.status==="concluida"}).length+" de "+ds.length,"concluídas"),
        av.length?pnKpi("Avaliações respondidas",av.filter(function(a){return a.feita}).length+" de "+av.length):null));
      var f=mbaFeito();pm.appendChild(rsBarras(ds.filter(function(d){return (d.roteiro||[]).length||(d.exercicios||[]).length}).map(function(d){
        var rot=d.roteiro||[],ex=d.exercicios||[],nf=rot.filter(function(t){return f[d.id+":"+t.k]}).length,ef=ex.filter(function(e){return f[d.id+":ex"+e.n]}).length,tot=rot.length+ex.length;
        return {nome:d.n||d.nome||d.id,v:tot?(nf+ef)/tot*100:0,txt:Math.round(tot?(nf+ef)/tot*100:0)+"%",sub:nf+" de "+rot.length+" tópicos · "+ef+" de "+ex.length+" exercícios",href:"#mba"}})))}
    pm.appendChild(pnFonte("MBA (calendário importado e marcações de feito)"));L.push(pm);
    /* evolução do aprendizado */
    var pe=panel("Evolução do aprendizado","Itens concluídos por mês: tópicos e exercícios do MBA, trilhas de Estudos e exercícios de SQL."),orig={};
    est.forEach(function(x){if(x.d>=D.ini)orig[x.orig]=(orig[x.orig]||0)+1});
    var porMes=NUCLEO.pnPorMes(est.map(function(x){return {d:x.d,v:1,f:x.orig}}),D.meses),vals=D.meses.map(function(m){return porMes[m].total});
    if(vals.some(function(v){return v})){pe.appendChild(rsColunas(B,vals,String,function(i,v){var por=porMes[D.meses[i]].por;return [B[i].nome,v+(v===1?" item":" itens")+(v?" · "+Object.keys(por).map(function(k){return k+" "+por[k]}).join(" · "):"")]}));
      pe.appendChild(h("div",{class:"kgasto"},Object.keys(orig).map(function(k){return pnKpi(k,String(orig[k]))})))}
    else pe.appendChild(pnVazio("Nenhum item de estudo marcado como feito no período."));
    pe.appendChild(pnFonte("marcações do MBA, de Estudos e dos exercícios de SQL (cada uma guarda a data em que foi marcada)",D.ini,hoje));L.push(pe);
    /* competências de Dados, BI, IA e Analytics */
    var comp=NUCLEO.pnCompetencias(est,((PESSOAL.perfilCarreira||{}).skills)||[]).filter(function(c){return c.declarada||c.estudos}),pk=panel("Competências","Dados, BI, IA e Analytics: as habilidades que as vagas pedem, com o que você já declarou e quantos estudos concluídos apontam para cada uma.");
    if(!comp.length)pk.appendChild(pnVazio("Nenhuma competência declarada (Carreira → Meu perfil) nem estudo concluído ligado a uma delas."));
    else{var mx=Math.max.apply(null,comp.map(function(c){return c.estudos}).concat([1]));
      pk.appendChild(rsBarras(comp.sort(function(a,b){return b.estudos-a.estudos||a.n.localeCompare(b.n)}).map(function(c){return {nome:c.n,v:c.estudos||0.0001,txt:c.estudos+(c.estudos===1?" estudo":" estudos"),
        sub:(c.declarada?"✓ no seu perfil":"fora do perfil")+(c.ultima?" · "+dataBR(c.ultima).slice(0,5):""),dica:c.estudos+" estudos concluídos"+(c.ultima?" · último em "+dataBR(c.ultima):"")}})))}
    pk.appendChild(pnFonte("Carreira (perfil de habilidades) e os estudos concluídos acima; a ligação usa o mesmo reconhecimento de termos das vagas"));L.push(pk);
    /* projetos e tarefas */
    var pp=panel("Projetos e tarefas","As ideias de projeto guardadas nas Conexões e as tarefas da Lista."),pj=PESSOAL.projetos||[];
    var tf=pnTarefasFeitas(D),tAb=D.tarefas.ok?D.tarefas.v.filter(function(t){return !t.feito}):null;
    pp.appendChild(h("div",{class:"kgasto"},pnKpi("Projetos guardados",String(pj.length),pj.length?"último mexido em "+dataBR(pj.map(function(p){return p.atualizado||""}).sort().pop()||hoje):""),
      tAb?pnKpi("Tarefas abertas",String(tAb.length)):null,pnKpi("Tarefas feitas no período",String(tf.filter(function(x){return x.d>=D.ini}).length))));
    var ct=pnConta(tf,D.meses);if(ct.some(function(v){return v})){pp.appendChild(h("h3",{class:"mbag",text:"Tarefas feitas por mês"}));pp.appendChild(rsColunas(B,ct,String,function(i,v){return [B[i].nome,v+(v===1?" tarefa":" tarefas")]}))}
    if(pj.length){var up=h("ul",{class:"wl"});pj.slice(0,5).forEach(function(p){up.appendChild(h("li",null,h("a",{class:"grow",href:"#conexoes/projeto/"+p.id},h("b",{text:p.t}),h("span",{class:"sub",text:p.atualizado?"mexido em "+dataBR(p.atualizado):""}))))});pp.appendChild(up)}
    if(!pj.length&&!tf.length&&!(tAb&&tAb.length))pp.appendChild(pnVazio("Nenhum projeto nem tarefa ainda."));
    pp.appendChild(pnFonte("Conexões (projetos) e Lista → Tarefas",D.ini,hoje));L.push(pp);
    return L}
