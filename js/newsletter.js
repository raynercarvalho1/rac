/* Dia a Dia RAC — módulo carregado quando a seção abre. Newsletter: a edição do dia (newsletter.json, coletado pelo robô),
   busca e filtros, guardadas, edições anteriores (newsletter_edicoes), resumo da semana, ajustes e o resumo com IA
   (RAC Intelligence, ação newsletter.resumo). Usa as funções do núcleo (js/app.js e nucleo.js), que ficam no escopo global.
   Regras da IA: a resposta DEMO só aparece numa prévia sem botão de salvar; a REAL vai para a prévia com "Salvar edição",
   e só esse toque grava. Links, veículos e datas vêm sempre do coletor, nunca da IA (docs/newsletter.md). */
  var NLS={dados:null,quando:0};
  var NL_IA_CACHE="rac-nl-ia",NL_IA_TENT="rac-nl-ia-tent",NL_HIST_CACHE="rac-nl-hist";
  function nlLer(k,padrao){try{var v=JSON.parse(localStorage.getItem(k)||"null");return v==null?padrao:v}catch(e){return padrao}}
  function nlGuardarLocal(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
  /* newsletter.json: o service worker devolve a cópia guardada na hora (funciona sem internet) e atualiza por trás */
  function nlCarregar(forcar){
    if(NLS.dados&&!forcar&&Date.now()-NLS.quando<5*60e3)return Promise.resolve(NLS.dados);
    return getJson("newsletter.json?v="+Math.floor(Date.now()/6e5)).then(function(d){
      if(!d||!Array.isArray(d.grupos))throw new Error("newsletter.json sem grupos");NLS.dados=d;NLS.quando=Date.now();return d})}
  function nlQuando(iso){var d=new Date(iso);return isNaN(d)?"":d.toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"}).replace(","," ·")}
  function nlDataLonga(data){return new Date(data+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"})}
  function nlEdicaoAtual(){return NUCLEO.nlEdicao(NLS.dados,PESSOAL.newsletter,Date.now())}

  /* ----- peças da tela ----- */
  function nlChip(c){var k=NUCLEO.nlCat(c);return h("span",{class:"nlcat",style:"--cc:"+k.cor,text:k.n})}
  function nlGuardada(u){return (PESSOAL.salvos||[]).some(function(x){return x.u===u})}
  /* guarda em PESSOAL.salvos (o mesmo lugar dos "Guardados" das Conexões); tocar de novo tira */
  function nlBotaoGuardar(g){
    var b=h("button",{type:"button",class:"ghostbtn","aria-pressed":String(nlGuardada(g.u)),text:nlGuardada(g.u)?"✓ Guardada":"Guardar"});
    b.onclick=function(){var l=(PESSOAL.salvos||[]).slice(),i=-1;l.forEach(function(x,j){if(x.u===g.u)i=j});
      if(i>=0){l.splice(i,1);b.textContent="Guardar";b.setAttribute("aria-pressed","false")}
      else{l.unshift(NUCLEO.nlSalvo(g,hojeISO()));b.textContent="✓ Guardada";b.setAttribute("aria-pressed","true")}
      pessoalGravar("salvos",l)};
    return b}
  function nlFontesLista(g){var fs=NUCLEO.nlFontes(g),det=h("details",{class:"nlfontes"},h("summary",{text:fs.length>1?"As "+fs.length+" fontes":"Fonte"}));
    det.appendChild(h("ul",{class:"wl"},fs.map(function(f){return h("li",null,h("span",{class:"grow"},ext(f.u,f.t,"nllink"),h("span",{class:"sub",text:f.f+" · "+nlQuando(f.d)})))})));
    return det}
  /* um acontecimento: categoria, tipo, quantas fontes, manchete com o link original, veículo, data e hora, resumo e ações */
  function nlCartao(g,o){o=o||{};var tit=g.titulo_pt&&g.titulo_pt!==g.t?g.titulo_pt:g.t;
    var corpo=h("div",{class:"nlcorpo"},
      h("div",{class:"nltopo"},nlChip(g.c),g.tipo&&g.tipo!=="noticia"?h("span",{class:"vp pre",text:NUCLEO.NL_TIPOS[g.tipo]||g.tipo}):null,g.n>1?h("span",{class:"vp hib",text:g.n+" fontes"}):null,g.resumo_ia?h("span",{class:"vp",text:"✨ IA"}):null),
      h("h3",{class:"nltit"},ext(g.u,tit,"nllink")),
      tit!==g.t?h("p",{class:"sub nlorig",text:"Manchete original: "+g.t}):null,
      h("p",{class:"nlmeta",text:g.f+" · "+nlQuando(g.d)}),
      g.resumo_ia?h("p",{class:"nlres",text:g.resumo_ia}):(g.r&&!o.curto?h("p",{class:"nlres",text:g.r}):null),
      g.relevancia_ia?h("p",{class:"nlporq",text:"Por que importa: "+g.relevancia_ia}):(g.porque&&!o.curto?h("p",{class:"nlporq",text:g.porque}):null),
      h("div",{class:"nlacts"},nlBotaoGuardar(g),nlFontesLista(g)));
    var el=h("article",{class:"nlcard"+(o.curto?" curto":"")},corpo);
    if(g.img&&!o.semImg)el.appendChild(img(g.img,"nlimg"));
    return el}
  function nlTabs(atual){
    var T=[["","Hoje"],["busca","Buscar"],["guardadas","Guardadas"],["historico","Edições"],["semana","Semana"],["ajustes","Ajustes"]];
    return h("nav",{class:"seg nltabs","aria-label":"Newsletter"},T.map(function(t){return h("a",{href:"#newsletter"+(t[0]?"/"+t[0]:""),"aria-pressed":String(t[0]===atual),"aria-current":t[0]===atual?"page":null,text:t[1]})}))}
  function nlFalha(e){var p=panel("Newsletter");
    p.appendChild(h("p",{class:"empty",text:navigator.onLine===false?"Sem internet e sem edição guardada neste aparelho. Abra a Newsletter uma vez com internet para ela ficar disponível offline.":"A edição ainda não foi coletada. O robô coleta às 6h, 12h e 18h (horário de Brasília)."}));
    var b=h("button",{type:"button",class:"ghostbtn",text:"Tentar de novo"});b.onclick=function(){NLS.dados=null;renderNewsletter("")};p.appendChild(b);
    if(e&&e.message)p.appendChild(h("p",{class:"diag",text:"Detalhe técnico: "+e.message}));
    return p}

  function renderNewsletter(sub,arg){
    var root=$("#newsletter-view");root.innerHTML="";window.scrollTo(0,0);
    sub=["busca","guardadas","historico","semana","ajustes"].indexOf(sub)>=0?sub:"";
    root.appendChild(nlTabs(sub));
    var corpo=h("div",{class:"stack"},h("div",{class:"panel"},h("p",{class:"empty",text:"Carregando…"})));root.appendChild(corpo);
    function trocar(el){corpo.innerHTML="";corpo.appendChild(el)}
    if(sub==="guardadas"){trocar(nlGuardadasView());return}
    if(sub==="ajustes"){trocar(nlAjustesView());return}
    if(sub==="historico"){nlHistoricoView(corpo,arg);return}
    if(sub==="semana"){nlSemanaView(corpo);return}
    nlCarregar().then(function(){corpo.innerHTML="";if(sub==="busca")nlBuscaView(corpo,arg);else nlHojeView(corpo)},function(e){trocar(nlFalha(e))})}

  /* ----- Hoje: resumo do dia, destaques e seções por categoria ----- */
  function nlHojeView(corpo){
    var c=nlEdicaoAtual(),d=NLS.dados,horas=(Date.now()-Date.parse(d.coletado))/36e5;
    var cab=panel("Newsletter · "+nlDataLonga(c.data));
    cab.appendChild(h("p",{class:"sub nlatual",text:"Atualizada em "+nlQuando(d.coletado)+" · "+c.fontes.ok+" de "+c.fontes.total+" fontes"+(navigator.onLine===false?" · sem internet: esta é a edição guardada neste aparelho":"")}));
    if(horas>26)cab.appendChild(h("p",{class:"nlaviso",role:"status",text:"⚠ A coleta está atrasada: a última foi há "+Math.round(horas)+" horas."}));
    if(c.fontes.falhas.length){var df=h("details",{class:"nlfontes"},h("summary",{text:c.fontes.falhas.length+(c.fontes.falhas.length===1?" fonte fora do ar":" fontes fora do ar")+" na última coleta"}));
      df.appendChild(h("ul",{class:"wl"},c.fontes.falhas.map(function(f){return h("li",null,h("span",{class:"grow sub",text:f}))})));cab.appendChild(df)}
    corpo.appendChild(cab);
    var area=h("div",{class:"stack"});corpo.appendChild(area);
    function desenhar(ed,salva){area.innerHTML="";
      var pr=panel(ed.origem==="ia"?"Resumo do dia (com IA)":"Resumo do dia");
      if(salva)pr.appendChild(h("p",{class:"sub",text:"Edição com resumo da IA salva em "+nlQuando(salva.atualizado_em)+(salva.modelo?" ("+salva.modelo+")":"")+". Links e veículos vêm do coletor."}));
      pr.appendChild(h("p",{class:"nlresumo",text:ed.resumo_dia}));
      if(salva){var vv=h("button",{type:"button",class:"ghostbtn",text:"Ver a edição atualizada, sem IA"});vv.onclick=function(){desenhar(c,null)};pr.appendChild(h("div",{class:"nlacts"},vv))}
      /* depois de salvar, redesenha só se a pessoa ainda estiver em "Hoje" (não troca a aba que ela abriu nesse meio-tempo) */
      else{var ia=nlCaixaIA(c,function(){if(/^#newsletter\/?$/.test(location.hash))renderNewsletter("")});if(ia)pr.appendChild(ia)}
      area.appendChild(pr);
      var pd=panel("Destaques",ed.destaques.length?ed.destaques.length+" acontecimentos escolhidos por atualidade, número de fontes e os pesos das suas categorias.":null);
      if(!ed.destaques.length)pd.appendChild(h("p",{class:"empty",text:"Nenhuma notícia nas últimas 48 horas. Confira os ajustes: alguma categoria pode estar escondida."}));
      ed.destaques.forEach(function(g){pd.appendChild(nlCartao(g))});area.appendChild(pd);
      ed.categorias.forEach(function(k,i){var cat=NUCLEO.nlCat(k.k),det=h("details",{class:"panel nlsec",style:"--cc:"+cat.cor,open:i<2?"":null},
          h("summary",null,h("span",{class:"nlsect",text:cat.n}),h("span",{class:"sub",text:k.grupos.length+(k.grupos.length===1?" notícia":" notícias")})));
        if(k.sintese)det.appendChild(h("p",{class:"nlres nlsint",text:k.sintese}));
        k.grupos.forEach(function(g){det.appendChild(nlCartao(g,{curto:true}))});area.appendChild(det)})}
    desenhar(c,null);
    if(!isOwner()||!SB)return;
    nlEdicaoSalva(c.data).then(function(row){
      if(row&&row.origem==="ia"&&!NUCLEO.nlConteudoOk(row.conteudo))desenhar(row.conteudo,row);
      nlSincronizarHoje(c,row)}).catch(function(){})}
  function nlEdicaoSalva(data){return SB.from("newsletter_edicoes").select("data,origem,modelo,conteudo,chave,atualizado_em").eq("data",data).maybeSingle().then(function(r){if(r.error)throw r.error;return r.data})}
  /* a edição de regras do dia vai para o histórico (com os pesos do dono); uma edição com IA nunca é trocada por ela */
  function nlSincronizarHoje(c,row){
    if(!isOwner()||!SB||!EU||!c.destaques.length)return;
    if(row&&(row.origem==="ia"||(row.conteudo&&row.conteudo.chave===c.chave)))return;
    var q=row?SB.from("newsletter_edicoes").update({conteudo:c,chave:c.chave}).eq("data",c.data).eq("origem","regras")
             :SB.from("newsletter_edicoes").insert({dono:EU.id,data:c.data,conteudo:c,origem:"regras",chave:c.chave});
    q.then(function(r){if(r&&r.error&&!/PGRST205|42P01|23505/.test(String(r.error.code)))logErro("newsletter",new Error(r.error.message))},function(){})}

  /* ----- Resumo com IA (RAC Intelligence): uma chave por edição; a mesma edição nunca é paga duas vezes ----- */
  function nlCaixaIA(c,aoSalvar){
    if(!iaLigada()||!isOwner())return null;
    var e=NUCLEO.nlEntradaIA(c),base=NUCLEO.nlChaveIA(c.data,e.ids),st=h("p",{class:"sub",role:"status"}),prev=h("div"),mais=h("div");
    var b=h("button",{type:"button",class:"ghostbtn pri",text:"✨ Resumir com IA"});
    function chave(){var t=nlLer(NL_IA_TENT,{})[base]||0;return t?base+"-"+(t+1):base}
    function previa(res,demo,guardado){prev.innerHTML="";var ap=NUCLEO.nlAplicarIA(c,res,e.ids);
      if(!ap.ok){st.textContent="A resposta não pôde ser usada ("+ap.motivo+"). Nada foi salvo.";return}
      prev.appendChild(nlPreviaIA(ap.conteudo,demo,demo?null:function(btn,msg){
        btn.disabled=true;msg.textContent="Salvando…";
        SB.from("newsletter_edicoes").upsert({dono:EU.id,data:c.data,conteudo:ap.conteudo,origem:"ia",modelo:guardado.modelo||"claude",ia_uso_id:guardado.id,chave:guardado.chave},{onConflict:"dono,data"})
          .then(function(r){if(r.error)throw new Error(r.error.message);msg.textContent="✓ Edição salva no histórico.";setTimeout(aoSalvar,700)})
          .catch(function(er){btn.disabled=false;msg.textContent="Não salvou: "+er.message+". O resumo continua guardado neste aparelho; tente de novo.";logErro("newsletter",er)})},
        function(){prev.innerHTML="";st.textContent="Resumo descartado. Ele continua guardado neste aparelho: tocar de novo mostra o mesmo, sem nova cobrança."}))}
    b.onclick=function(){
      if(b.disabled)return;
      if(!e.ids.length){st.textContent="Não há notícias nesta edição para resumir.";return}
      var k=chave(),cc=nlLer(NL_IA_CACHE,{})[k];mais.innerHTML="";
      /* já resumido neste aparelho para estas mesmas notícias: mostra de novo, sem chamar */
      if(cc){st.textContent="Este resumo já foi feito para estas mesmas notícias. Nada foi chamado de novo.";previa(cc.resultado,false,cc);return}
      b.disabled=true;st.textContent="Resumindo com a IA…";prev.innerHTML="";
      racIA("newsletter","newsletter.resumo",{texto:e.texto},{data:c.data},k).then(function(r){b.disabled=false;
        if(r&&r.ok&&r.modo==="DEMO"){st.textContent="DEMONSTRAÇÃO: resumo simulado, nada foi cobrado nem salvo.";previa(r.resultado,true,null);return}
        if(r&&r.ok&&r.modo==="REAL"&&r.resultado&&!r.resultado._demo){
          var g={id:r.id,modelo:r.consumo&&r.consumo.modelo,resultado:r.resultado,quando:Date.now(),chave:k},cs=nlLer(NL_IA_CACHE,{});
          cs[k]=g;Object.keys(cs).sort(function(a,x){return cs[x].quando-cs[a].quando}).slice(6).forEach(function(x){delete cs[x]});nlGuardarLocal(NL_IA_CACHE,cs);
          var m=r.consumo&&r.consumo.mes;
          st.textContent="REAL · resumido pelo Claude, usou o orçamento de IA da casa. Confira antes de salvar: nada foi gravado ainda."+((r.avisos||[]).length?" "+r.avisos.join(" "):"")+(m&&m.alerta?" ⚠ A IA já usou "+m.percentual+"% do limite do mês.":"");
          previa(r.resultado,false,g);return}
        var cod=r&&r.erro&&r.erro.codigo;
        st.textContent=(r&&r.mensagem||"A IA não respondeu.")+(cod==="repetida"?" A mesma edição não é resumida duas vezes.":"")+(r&&r.estado==="incerto"&&r.id?" Id da chamada: "+r.id+".":"");
        /* chamada paga que não trouxe resumo: nada se repete sozinho; repetir é um toque a mais, com confirmação */
        if(r&&r.modo==="REAL"&&r.id&&cod!=="repetida"&&cod!=="em_andamento"){
          var de=h("button",{type:"button",class:"ghostbtn",text:"Gerar de novo (nova chamada paga)"});
          de.onclick=function(){if(!confirm("Isto faz uma NOVA chamada paga à IA para a mesma edição. Continuar?"))return;var t=nlLer(NL_IA_TENT,{});t[base]=(t[base]||0)+1;nlGuardarLocal(NL_IA_TENT,t);b.click()};
          mais.appendChild(de)}
      }).catch(function(er){b.disabled=false;st.textContent="Não consegui resumir: "+er.message;logErro("rac-ia",er)})};
    return h("div",{class:"iabox"},h("p",{class:"sub",text:"Resumo com IA (RAC Intelligence): o Claude escreve o resumo do dia, os destaques e uma síntese por categoria, só com o que as fontes publicaram. O modo é decidido pelo servidor: DEMONSTRAÇÃO é simulada, não custa nada e não pode ser salva; REAL usa o orçamento de IA da casa (o custo aparece no painel do Sistema) e você confere antes de salvar."}),
      h("div",{class:"vfil"},b),st,mais,prev)}
  function nlPreviaIA(c,demo,salvar,descartar){
    var box=h("div",{class:demo?"iaprevia nlprevia":"nlprevia",role:"region","aria-label":"Prévia do resumo"});
    if(demo)box.appendChild(h("p",{class:"iademo",text:"DEMONSTRAÇÃO · resumo simulado, não veio do Claude e não pode ser salvo."}));
    box.appendChild(h("p",{class:"nlresumo",text:c.resumo_dia}));
    c.destaques.forEach(function(g){box.appendChild(nlCartao(g,{semImg:true}))});
    var sint=c.categorias.filter(function(k){return k.sintese});
    if(sint.length)box.appendChild(h("ul",{class:"wl"},sint.map(function(k){return h("li",null,h("span",{class:"grow"},nlChip(k.k),h("span",{class:"nlres",text:k.sintese})))})));
    var veic=[];c.destaques.forEach(function(g){NUCLEO.nlFontes(g).forEach(function(f){if(veic.indexOf(f.f)<0)veic.push(f.f)})});
    box.appendChild(h("p",{class:"sub",text:"Fontes usadas: "+veic.join(", ")+"."}));
    if(salvar&&!demo){var msg=h("p",{class:"sub",role:"status"}),s=h("button",{type:"button",class:"ghostbtn pri",text:"Salvar edição"}),x=h("button",{type:"button",class:"ghostbtn",text:"Descartar"});
      s.onclick=function(){salvar(s,msg)};x.onclick=descartar;box.appendChild(h("div",{class:"nlacts"},s,x));box.appendChild(msg)}
    return box}

  /* ----- Buscar: palavras, categoria, tipo, veículo e ordem ----- */
  function nlBuscaView(corpo,q0){
    var d=NLS.dados,cfg=NUCLEO.nlConfig(PESSOAL.newsletter),agora=Date.now(),lim=30;
    var gs=d.grupos.map(function(g){var x=Object.assign({},g);x.s=NUCLEO.nlRelevancia(g,agora,cfg).s;return x});
    var F={q:q0||"",c:"",tipo:"",fonte:"",ordem:"data"},p=panel("Buscar nas notícias","Todas as notícias da coleta (últimas 48 horas). Todas as palavras precisam aparecer."),res=h("div");
    var q=h("input",{type:"search",placeholder:"Buscar (ex.: Copom, Nintendo, Python)","aria-label":"Buscar nas notícias",value:F.q});
    var tipo=h("select",{"aria-label":"Tipo"},[["","Todos os tipos"],["noticia","Notícias"],["analise","Análises"],["opiniao","Opiniões"]].map(function(o){return h("option",{value:o[0],text:o[1]})}));
    var nomes=[];(d.fontes||[]).forEach(function(f){if(nomes.indexOf(f.n)<0)nomes.push(f.n)});nomes.sort();
    var fonte=h("select",{"aria-label":"Veículo"},[h("option",{value:"",text:"Todos os veículos"})].concat(nomes.map(function(n){return h("option",{value:n,text:n})})));
    var ordem=h("select",{"aria-label":"Ordem"},h("option",{value:"data",text:"Mais recentes"}),h("option",{value:"relevancia",text:"Mais relevantes"}));
    var chips=h("div",{class:"chips nlchips"});
    [{k:"",n:"Todas"}].concat(NUCLEO.NL_CATS).forEach(function(k){var b=h("button",{type:"button",class:"chipb"+(k.k===F.c?" on":""),"aria-pressed":String(k.k===F.c),text:k.n});
      b.onclick=function(){F.c=k.k;[].forEach.call(chips.children,function(x){x.classList.remove("on");x.setAttribute("aria-pressed","false")});b.classList.add("on");b.setAttribute("aria-pressed","true");lim=30;rodar()};chips.appendChild(b)});
    function rodar(){var l=NUCLEO.nlFiltrar(gs,F);res.innerHTML="";
      res.appendChild(h("p",{class:"sub",role:"status",text:l.length?l.length+(l.length===1?" notícia":" notícias"):"Nada encontrado com esses filtros."}));
      l.slice(0,lim).forEach(function(g){res.appendChild(nlCartao(g,{curto:true}))});
      if(l.length>lim){var m=h("button",{type:"button",class:"ghostbtn",text:"Ver mais ("+(l.length-lim)+")"});m.onclick=function(){lim+=30;rodar()};res.appendChild(m)}}
    var t=null;q.oninput=function(){clearTimeout(t);t=setTimeout(function(){F.q=q.value;lim=30;rodar()},180)};
    tipo.onchange=function(){F.tipo=tipo.value;rodar()};fonte.onchange=function(){F.fonte=fonte.value;rodar()};ordem.onchange=function(){F.ordem=ordem.value;rodar()};
    p.appendChild(h("div",{class:"vfil"},q));p.appendChild(chips);p.appendChild(h("div",{class:"vfil nlsel"},tipo,fonte,ordem));p.appendChild(res);
    corpo.appendChild(p);rodar()}

  /* ----- Guardadas (PESSOAL.salvos, junto com as Conexões do dia) ----- */
  function nlGuardadasView(){
    var p=panel("Guardadas para ler depois","As notícias e os links que você guardou aqui e nas Conexões do dia. Ficam na sua conta e neste aparelho (abrem sem internet só se o site do veículo estiver guardado pelo navegador).");
    var l=(PESSOAL.salvos||[]).filter(function(s){return s&&s.u});
    if(!l.length){p.appendChild(h("p",{class:"empty",text:"Nada guardado ainda. Toque em Guardar numa notícia da edição."}));return p}
    var ul=h("ul",{class:"wl nlguard"});
    l.forEach(function(s){var rm=h("button",{type:"button",class:"ghostbtn",text:"Tirar","aria-label":"Tirar de guardadas: "+s.t});
      rm.onclick=function(){pessoalGravar("salvos",(PESSOAL.salvos||[]).filter(function(x){return x.u!==s.u}));li.remove();if(!ul.children.length)renderNewsletter("guardadas")};
      var li=h("li",null,h("span",{class:"grow"},ext(s.u,s.t,"nllink"),h("span",{class:"sub",text:[s.f,s.tema,s.d?nlQuando(s.d):"",s.quando?"guardada em "+dataBR(s.quando):""].filter(Boolean).join(" · ")})),rm);ul.appendChild(li)});
    p.appendChild(ul);return p}

  /* ----- Edições anteriores (newsletter_edicoes; sem internet, as últimas 14 guardadas neste aparelho) ----- */
  function nlHistorico(){
    if(!SB||!isOwner())return Promise.reject(new Error("só o dono vê o histórico"));
    return SB.from("newsletter_edicoes").select("data,origem,modelo,atualizado_em,conteudo").order("data",{ascending:false}).limit(60).then(function(r){
      if(r.error){var er=new Error(r.error.message);er.code=r.error.code;throw er}
      var l=(r.data||[]).filter(function(x){return !NUCLEO.nlConteudoOk(x.conteudo)});nlGuardarLocal(NL_HIST_CACHE,l.slice(0,14));return {l:l,offline:false}})
      .catch(function(e){var c=nlLer(NL_HIST_CACHE,null);if(c&&!/PGRST205|42P01/.test(String(e.code)))return {l:c,offline:true};throw e})}
  function nlHistFalha(corpo,e){corpo.innerHTML="";var p=panel("Edições anteriores");
    p.appendChild(h("p",{class:"empty",text:/PGRST205|42P01/.test(String(e.code))||/newsletter_edicoes/.test(e.message)?"O histórico começa a ser guardado quando o SQL 018 for rodado no Supabase.":"Não consegui abrir o histórico agora ("+e.message+")."}));
    corpo.appendChild(p)}
  function nlHistoricoView(corpo,data){
    nlHistorico().then(function(r){corpo.innerHTML="";
      if(data){var e=r.l.filter(function(x){return x.data===data})[0];if(!e){corpo.appendChild(h("div",{class:"panel"},h("p",{class:"empty",text:"Essa edição não está guardada."}),h("a",{class:"ghostbtn",href:"#newsletter/historico",text:"Ver todas"})));return}
        var c=e.conteudo,p=panel("Edição de "+nlDataLonga(c.data),(c.origem==="ia"?"Com resumo da IA"+(e.modelo?" ("+e.modelo+")":""):"Montada pelas regras")+" · coletada em "+nlQuando(c.coletado));
        p.appendChild(h("p",{class:"nlresumo",text:c.resumo_dia}));p.appendChild(h("a",{class:"ghostbtn",href:"#newsletter/historico",text:"← Todas as edições"}));corpo.appendChild(p);
        var pd=panel("Destaques");c.destaques.forEach(function(g){pd.appendChild(nlCartao(g))});corpo.appendChild(pd);
        c.categorias.forEach(function(k){var cat=NUCLEO.nlCat(k.k),det=h("details",{class:"panel nlsec",style:"--cc:"+cat.cor},h("summary",null,h("span",{class:"nlsect",text:cat.n}),h("span",{class:"sub",text:k.grupos.length+" notícias"})));
          if(k.sintese)det.appendChild(h("p",{class:"nlres nlsint",text:k.sintese}));k.grupos.forEach(function(g){det.appendChild(nlCartao(g,{curto:true}))});corpo.appendChild(det)});
        return}
      var p=panel("Edições anteriores",r.offline?"Sem conexão com a conta: estas são as últimas edições guardadas neste aparelho.":"Uma edição por dia. A de regras é guardada sozinha; a com IA, só quando você salva o resumo.");
      if(!r.l.length)p.appendChild(h("p",{class:"empty",text:"Nenhuma edição guardada ainda. A de hoje entra no histórico quando você abre a Newsletter."}));
      p.appendChild(h("ul",{class:"wl"},r.l.map(function(e){var c=e.conteudo;
        return h("li",null,h("span",{class:"grow"},h("a",{href:"#newsletter/historico/"+c.data,text:nlDataLonga(c.data)}),h("span",{class:"sub",text:c.destaques.length+" destaques"+(c.destaques[0]?" · "+c.destaques[0].t:"")})),h("span",{class:"vp"+(c.origem==="ia"?" hib":""),text:c.origem==="ia"?"✨ IA":"Regras"}))})));
      corpo.appendChild(p)},function(e){nlHistFalha(corpo,e)})}

  /* ----- Semana: as edições dos últimos 7 dias ----- */
  function nlSemanaView(corpo){
    nlHistorico().then(function(r){corpo.innerHTML="";var desde=maisDias(hojeISO(),-6),l=r.l.filter(function(e){return e.data>=desde}),s=NUCLEO.nlSemana(l);
      var p=panel("Resumo da semana",s.dias.length?s.dias.length+(s.dias.length===1?" edição":" edições")+" ("+s.dias.map(function(x){return dataBR(x).slice(0,5)}).join(", ")+") · "+s.destaques+" destaques diferentes"+(s.ia?" · "+s.ia+" com resumo da IA":""):null);
      if(!s.dias.length){p.appendChild(h("p",{class:"empty",text:"Ainda não há edições guardadas nos últimos 7 dias."}));corpo.appendChild(p);return}
      p.appendChild(h("h3",{class:"mbag",text:"Destaques por categoria"}));
      p.appendChild(h("ul",{class:"wl"},s.porCategoria.map(function(x){return h("li",null,h("span",{class:"grow"},nlChip(x.k)),h("b",{text:String(x.n)}))})));
      corpo.appendChild(p);
      var pm=panel("Os mais cobertos da semana");s.maisCobertos.forEach(function(g){pm.appendChild(nlCartao(g,{curto:true}))});corpo.appendChild(pm)},function(e){nlHistFalha(corpo,e)})}

  /* ----- Ajustes (PESSOAL.newsletter): pesos, palavras e avisos ----- */
  function nlAjustesView(){
    var cfg=NUCLEO.nlConfig(PESSOAL.newsletter),p=panel("Ajustes da Newsletter","O peso de cada categoria muda a escolha dos destaques e a ordem das seções. Esconder tira a categoria da edição. Fica na sua conta.");
    var ul=h("ul",{class:"wl nlpesos"}),sels={};
    NUCLEO.NL_CATS.forEach(function(k){var ops=NUCLEO.NL_PESOS.slice();if(!ops.some(function(o){return o[0]===cfg.pesos[k.k]}))ops.push([cfg.pesos[k.k],"Peso "+cfg.pesos[k.k]]);
      var s=h("select",{"aria-label":"Peso de "+k.n},ops.map(function(o){return h("option",{value:String(o[0]),selected:o[0]===cfg.pesos[k.k]?"":null,text:o[1]})}));sels[k.k]=s;
      ul.appendChild(h("li",null,h("span",{class:"grow"},nlChip(k.k)),s))});
    p.appendChild(ul);
    var inter=h("textarea",{rows:"2",placeholder:"Ex.: Python, Power BI, Dodgers, Sorocaba","aria-label":"Assuntos de interesse"}),ocu=h("textarea",{rows:"2",placeholder:"Ex.: horóscopo, BBB","aria-label":"Palavras para esconder"});
    inter.value=cfg.interesse.join(", ");ocu.value=cfg.ocultar.join(", ");
    var av=h("input",{type:"checkbox",id:"nl-avisos"});av.checked=cfg.avisos;
    var st=h("p",{class:"sub",role:"status"}),ok=h("button",{type:"button",class:"ghostbtn pri",text:"Salvar ajustes"});
    ok.onclick=function(){var pesos={};Object.keys(sels).forEach(function(k){pesos[k]=parseFloat(sels[k].value)});
      var v=NUCLEO.nlConfig({pesos:pesos,interesse:inter.value,ocultar:ocu.value,avisos:av.checked});
      st.textContent="Salvando…";pessoalGravar("newsletter",v,function(m){st.textContent=m||"✓ Ajustes salvos. A edição de hoje já usa os novos pesos."});NLS.dados&&(NLS.quando=0)};
    p.appendChild(h("div",{class:"wform"},
      h("label",{class:"sub",text:"Assuntos de interesse (sobem na edição; separe por vírgula)"}),inter,
      h("label",{class:"sub",text:"Palavras para esconder (a notícia sai da edição)"}),ocu,
      h("label",{class:"nlchk"},av," Avisar no celular quando a edição do dia sair (uma vez por dia, e o resumo da semana no domingo). Precisa das notificações ativas em Sistema → Notificações."),
      ok,st));
    if(isOwner()&&SB){var ua=h("p",{class:"sub"});p.appendChild(ua);
      SB.from("newsletter_avisos").select("chave,enviado_em,resultado").order("enviado_em",{ascending:false}).limit(3).then(function(r){
        if(r.error||!r.data||!r.data.length)return;ua.textContent="Últimos avisos: "+r.data.map(function(x){return x.chave.replace(/^dia:(\d{4})-(\d\d)-(\d\d)$/,"dia $3/$2").replace(/^semana:\d{4}-W/,"semana ")+" ("+(x.resultado||"enviado")+")"}).join(" · ")},function(){})}
    return p}

  /* ----- cartão do Início ----- */
  function wNewsletter(){
    var p=wCard("Newsletter","jornal","var(--c-inicio)",["#newsletter","abrir"],"w5"),b=h("div",null,h("p",{class:"sub",text:"Carregando a edição…"}));p.appendChild(b);
    nlCarregar().then(function(){var c=nlEdicaoAtual();b.innerHTML="";
      if(!c.destaques.length){b.appendChild(h("p",{class:"sub",text:"Nenhuma notícia nas últimas horas."}));return}
      b.appendChild(h("p",{class:"sub nlwres",text:c.resumo_dia}));
      b.appendChild(h("ul",{class:"wl"},c.destaques.slice(0,4).map(function(g){return h("li",null,h("span",{class:"grow"},h("a",{href:g.u,target:"_blank",rel:"noopener",text:g.t}),
        h("span",{class:"sub",text:NUCLEO.nlCat(g.c).n+" · "+g.f+" · "+nlQuando(g.d)+(g.n>1?" · "+g.n+" fontes":"")})))})))
    },function(){b.innerHTML="";b.appendChild(h("p",{class:"sub",text:"A primeira edição sai na próxima coleta (6h, 12h e 18h)."}))});
    return p}
