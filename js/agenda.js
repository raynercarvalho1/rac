/* Dia a Dia RAC — módulo carregado quando a Agenda abre (DS-4.1 · RAC Modern Workspace; docs/agenda.md). A tela da página Agenda, que antes morava em
   js/sistema.js (renderAgenda). Aqui só a tela: a leitura é a da fonte da Agenda (agendaColetarLeitura, js/fonte-agenda.js), a régua da "Próxima melhor ação"
   e a gravação das ações rápidas são as de sempre (proximasSelecao, proximaAcao, proximaAcoesDe, js/sistema.js: o Início e o resumo falado usam as mesmas) e o
   agrupamento, os indicadores e a série de dias são do núcleo (NUCLEO.agd*). Desenhada com o kit (js/kit.js) e os gráficos (js/graficos.js). Só o dono vê a
   página (o registro de rotas não a dá à casa). Nada aqui lê o banco por conta própria nem grava fora de pessoalGravar. */
  /* o que sobrevive a um novo desenho da página: o filtro de área escolhido; seq descarta a resposta de uma leitura que já foi substituída por outra */
  var AGD={filtro:"todos",seq:0,ult:null};
  var AGD_SEM=["dom","seg","ter","qua","qui","sex","sáb"];
  /* o destino de uma linha: endereço do próprio site, ou link de fora (só http/https, sempre em outra aba); sem destino, a linha não é link */
  function agdLink(e){var u=String(e&&e.href||"");if(!u)return null;if(u.charAt(0)==="#")return {href:u,ext:false};
    return e.ext&&/^https?:\/\//i.test(u)?{href:u,ext:true}:null}
  function agdAreaNome(k){return AGENDA_TIPOS[k]?AGENDA_TIPOS[k][1]:"Outros"}
  function agdAreaIco(k){return AGENDA_TIPOS[k]?AGENDA_TIPOS[k][0]:"•"}
  function agdTomSelo(tom){return tom==="alta"?"erro":tom==="media"?"aviso":"neutro"}
  /* as ações rápidas (Feito, Adiar 3 dias, Sem retorno/Encerrar) são as de sempre (proximaAcao grava pelos mesmos caminhos do funil e da Agenda);
     depois de tocar, os botões da linha ficam desligados até a página ser redesenhada, para um toque duplo não adiar duas vezes */
  function agdBotoes(it,acoes,depois,encerrar,nome,primeiro){if(!acoes.length)return null;
    var caixa=h("span",{class:"ag-acoes"});
    acoes.forEach(function(a){var rot=a==="semretorno"&&encerrar?"Encerrar":PROX_ROTULOS[a],b=rkBtn(primeiro&&a==="feito"?"pri":"sec",rot,{"aria-label":rot+": "+nome});
      b.onclick=function(ev){ev.stopPropagation();[].forEach.call(caixa.querySelectorAll("button"),function(x){x.disabled=true});b.setAttribute("aria-busy","true");proximaAcao(a,it,depois)};
      caixa.appendChild(b)});
    return caixa}
  /* uma linha da lista: marca de prioridade, ícone da área, título e detalhe (link inteiro quando há destino), quando e as ações */
  function agdLinha(e,hoje,depois){
    var tom=NUCLEO.agdTom(e,hoje),l=agdLink(e),
      corpo=[h("span",{class:"rac-marca "+(tom?"rac-marca--"+tom:"ag-marca-vazia"),"aria-hidden":"true"}),h("span",{class:"ag-ico","aria-hidden":"true",text:agendaIco(e)}),
        h("span",{class:"rac-linha-corpo"},h("b",{class:"rac-t-cartao",text:e.t}),e.sub?h("span",{class:"rac-t-sec",text:e.sub}):null),
        h("span",{class:"rac-linha-meta"},rkSelo(agdTomSelo(tom),NUCLEO.agdQuando(e.data,hoje)))],
      main=l?h("a",{class:"rac-linha-item ag-main",href:l.href,target:l.ext?"_blank":null,rel:l.ext?"noopener":null},corpo):h("div",{class:"rac-linha-item ag-main"},corpo);
    return h("li",{class:"ag-item"},main,agdBotoes({cid:e.cid||null,lid:e.lembrete&&e.lembrete.id||null},proximaAcoesDe(e),depois,!!e.semRetorno,e.t,false))}
  /* um grupo da página (Atrasados, Hoje…) num cartão; o de "sem retorno" explica por que não é atraso */
  function agdCardGrupo(g,hoje,depois){
    var corpo=h("ul",{class:"rac-lista ag-lista"},g.itens.map(function(e){return agdLinha(e,hoje,depois)}));
    return rkCard(g.rotulo,corpo,{classe:"ag-grupo ag-grupo--"+g.k,acao:h("span",{class:"rac-t-legenda",text:g.itens.length+(g.itens.length===1?" item":" itens")}),
      sub:g.k==="semretorno"?"Sem resposta há mais de "+NUCLEO.PRI_VALIDADE_CALC+" dias do follow-up. Não exigem ação; o resultado da candidatura não foi alterado. “Encerrar” marca o resultado como “sem retorno”.":null})}
  /* filtro por área: chips com a contagem; só aparecem se há mais de uma área */
  function agdChips(ev,hoje,aoMudar){var areas=NUCLEO.agdAreas(ev,hoje);if(areas.length<2)return null;
    var tot=areas.reduce(function(s,a){return s+a.n},0),caixa=h("div",{class:"ag-chips",role:"group","aria-label":"Filtrar por área"});
    function chip(k,rot,n){var b=h("button",{type:"button",class:"rac-chip","aria-pressed":AGD.filtro===k?"true":"false"},rot,h("span",{class:"ag-chip-n",text:String(n)}));
      b.onclick=function(){AGD.filtro=k;aoMudar()};return b}
    caixa.appendChild(chip("todos","Todas",tot));areas.forEach(function(a){caixa.appendChild(chip(a.k,agdAreaIco(a.k)+" "+agdAreaNome(a.k),a.n))});return caixa}
  /* a lista agrupada (com o filtro de área aplicado); tudo vem da leitura já feita, sem reler */
  function agdPintarLista(S){var lei=AGD.ult,box=S.lista;box.innerHTML="";if(!lei)return;
    var hoje=hojeISO(),ev=lei.eventos,depois=function(){agdCarregar(S)};
    if(AGD.filtro!=="todos"&&!NUCLEO.agdAreas(ev,hoje).some(function(a){return a.k===AGD.filtro}))AGD.filtro="todos";
    if(!ev.length){box.appendChild(rkEstado(lei.falhas.length?"aviso":"vazio",lei.falhas.length?"Nenhum item na parte que foi lida (a leitura falhou: não dá para dizer que não há nada).":"Nada com data por enquanto."));return}
    var chips=agdChips(ev,hoje,function(){agdPintarLista(S)});if(chips)box.appendChild(chips);
    var grupos=NUCLEO.agdGrupos(NUCLEO.agdFiltrar(ev,AGD.filtro),hoje).filter(function(g){return g.itens.length});
    if(!grupos.length){var mais=null;
      if(AGD.filtro!=="todos"){mais=rkBtn("sec","Mostrar todas as áreas");mais.onclick=function(){AGD.filtro="todos";agdPintarLista(S)}}
      box.appendChild(rkEstado("vazio",AGD.filtro!=="todos"?"Nada nesta área.":"Nada nos próximos 120 dias.",mais));return}
    grupos.forEach(function(g){box.appendChild(agdCardGrupo(g,hoje,depois))})}
  /* a abertura azul: o dia e uma frase só com contagens que existem; a ação leva ao formulário */
  function agdPintarAbertura(S,lei){var hoje=hojeISO(),r=NUCLEO.agdResumo(lei.eventos,hoje),hero=S.hero,falha=lei.estado==="falha";hero.innerHTML="";
    var novo=rkBtn("fantasma","+ Novo lembrete");novo.onclick=function(){var c=S.campo;if(c){c.scrollIntoView({block:"center"});c.focus()}};
    hero.appendChild(h("div",null,h("h2",{text:"Agenda"}),h("p",{class:"rh-hero-data",text:new Date(hoje+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}),
      h("p",{class:"rh-hero-resumo",text:falha?"A leitura da agenda falhou: não dá para dizer o que está vencendo.":NUCLEO.agdFrase(r)}),
      h("p",{class:"rh-hero-resumo ag-hero-desc",text:"Tudo que tem data no site num lugar só: retornos e vacinas, seguros e garantias, aulas, avaliações e boletos do MBA, aniversários e seus lembretes."})));
    hero.appendChild(h("div",{class:"rh-hero-acoes"},novo));
    S.aviso.innerHTML="";if(lei.falhas.length)S.aviso.appendChild(rkAlerta("aviso","Agenda incompleta",agendaAviso(lei)));
    S.kpis.innerHTML="";
    /* leitura que falhou sem trazer nada: zeros seriam mentira ("nada atrasado"); sem indicadores, só o aviso */
    if(falha)return;
    S.kpis.appendChild(rkKpi({rotulo:"Atrasados",valor:r.atrasados,alerta:r.atrasados>0,apoio:r.atrasados?"o mais antigo venceu há "+r.maisAntigo+(r.maisAntigo===1?" dia":" dias"):"nada atrasado"}));
    S.kpis.appendChild(rkKpi({rotulo:"Hoje",valor:r.hoje,apoio:r.hoje?r.primeiroHoje+(r.hoje>1?" e mais "+(r.hoje-1):""):"nada para hoje"}));
    S.kpis.appendChild(rkKpi({rotulo:"Próximos 7 dias",valor:r.sete,apoio:"até "+dataBR(r.ateSete)}));
    S.kpis.appendChild(rkKpi({rotulo:"Até 30 dias",valor:r.trinta,apoio:r.depois?r.depois+(r.depois===1?" item":" itens")+" mais adiante":"nada mais adiante"}))}
  /* os próximos 14 dias: uma célula por dia com a data, o dia da semana e quantos itens; toque abre o detalhe (racDica) */
  function agdCardDias(ev,hoje){var s=NUCLEO.agdSerie(ev,hoje,14),grade=h("div",{class:"ag-dias"});
    s.forEach(function(x,i){var d=new Date(x.data+"T12:00:00"),p=x.data.split("-"),sem=i===0?"hoje":AGD_SEM[d.getDay()],
        tit=ev.filter(function(e){return e.data===x.data&&!e.semRetorno}).map(function(e){return e.t}),
        qt=x.n+(x.n===1?" item":" itens"),
        b=h("button",{type:"button",class:"ag-dia"+(x.n>=3?" ag-dia--2":x.n>0?" ag-dia--1":"")+(i===0?" ag-dia--hoje":""),"aria-label":p[2]+"/"+p[1]+" ("+sem+"): "+(x.n?qt:"nada")},
          h("span",{class:"sem",text:sem}),h("b",{class:"dd",text:p[2]}),h("span",{class:"qt",text:x.n?String(x.n):"–"}));
      racDica.ligar(b,function(){return [p[2]+"/"+p[1]+" · "+sem,x.n?qt+": "+tit.slice(0,3).join("; ")+(tit.length>3?" e mais "+(tit.length-3):""):"nada neste dia"]});grade.appendChild(b)});
    var p0=s[0].data.split("-"),p1=s[s.length-1].data.split("-");
    return rkCard("Próximos 14 dias",grade,{sub:"De "+p0[2]+"/"+p0[1]+" a "+p1[2]+"/"+p1[1]+". Quanto mais azul, mais itens no dia.",origem:"Não conta o que está sem retorno nem o que já passou."})}
  /* de onde vem o que está na página, por área (as barras do kit; toque mostra o valor) */
  function agdCardAreas(ev,hoje){var areas=NUCLEO.agdAreas(ev,hoje);if(!areas.length)return null;
    var corpo=h("div",{class:"rac-grafico rac-pilha"},rsBarras(areas.map(function(a){return {nome:agdAreaIco(a.k)+" "+agdAreaNome(a.k),v:a.n,txt:String(a.n),dica:a.n+(a.n===1?" item":" itens")+" na agenda"}})));
    return rkCard("Por área",corpo,{sub:"O que aparece na lista, de todas as áreas."})}
  function agdPintarLado(S,lei){var hoje=hojeISO(),box=S.graf;box.innerHTML="";if(!lei.eventos.length)return;
    box.appendChild(agdCardDias(lei.eventos,hoje));var ca=agdCardAreas(lei.eventos,hoje);if(ca)box.appendChild(ca)}
  /* Próxima melhor ação: a seleção é a da régua do núcleo (proximasSelecao, a mesma do cartão do Início); só o destaque tem os botões, as outras linhas só levam ao módulo */
  function agdNivelSelo(n){return rkSelo(n==="urgente"?"erro":n==="importante"?"aviso":"info",PROX_NIVEIS[n][0])}
  function agdLinhaProx(it){var l=agdLink(it),tom=it.nivel==="urgente"?"alta":it.nivel==="importante"?"media":null,
      corpo=[h("span",{class:"rac-marca "+(tom?"rac-marca--"+tom:"ag-marca-vazia"),"aria-hidden":"true"}),h("span",{class:"ag-ico","aria-hidden":"true",text:it.ico||agdAreaIco(it.area)}),
        h("span",{class:"rac-linha-corpo"},h("b",{class:"rac-t-cartao",text:(it.cid?"Follow-up: ":"")+it.titulo}),h("span",{class:"rac-t-sec",text:it.motivo})),h("span",{class:"rac-linha-meta"},agdNivelSelo(it.nivel))];
    return h("li",{class:"ag-item"},l?h("a",{class:"rac-linha-item ag-main",href:l.href,target:l.ext?"_blank":null,rel:l.ext?"noopener":null},corpo):h("div",{class:"rac-linha-item ag-main"},corpo))}
  function agdPintarProxima(S,s,erro){var box=S.prox;box.innerHTML="";
    var corpo=h("div",{class:"rac-pilha",style:"gap:12px"}),depois=function(){agdCarregar(S)};
    if(erro){corpo.appendChild(rkEstado("aviso","Não consegui montar agora."))}
    else{
      if(s.vazio)corpo.appendChild(rkEstado("ok","Tudo em dia. Nenhuma ação urgente agora."));
      if(s.destaque){var d=s.destaque,l=agdLink(d),tit=(d.cid?"Follow-up: ":"")+d.titulo,
        t=l?h("a",{class:"rac-t-secao ag-dest-titulo",href:l.href,target:l.ext?"_blank":null,rel:l.ext?"noopener":null,text:tit}):h("b",{class:"rac-t-secao ag-dest-titulo",text:tit});
        corpo.appendChild(h("div",{class:"ag-destaque"},h("div",{class:"ag-dest-cab"},h("span",{class:"ag-ico","aria-hidden":"true",text:d.ico||agdAreaIco(d.area)}),agdNivelSelo(d.nivel)),t,
          h("span",{class:"rac-t-sec",text:d.motivo}),agdBotoes({cid:d.cid||null,lid:d.lid||null},d.acoes||[],depois,false,d.titulo,true)))}
      if(s.secundarias.length)corpo.appendChild(h("ul",{class:"rac-lista ag-lista"},s.secundarias.map(agdLinhaProx)));
      if(s.mais>0)corpo.appendChild(h("span",{class:"rac-t-sec",text:"e mais "+s.mais+" na lista abaixo"}))}
    box.appendChild(rkCard(PROX_TITULO,corpo,{sub:"Só o que pede algo de você, agora; a régua é a mesma do Início e do resumo falado.",classe:"ag-prox"}))}
  /* lê a agenda e a próxima ação (duas leituras independentes: uma falha não derruba a outra) e pinta cada parte quando chega */
  function agdCarregar(S){var n=++AGD.seq;
    function vale(){return n===AGD.seq&&S.raiz.isConnected}
    agendaColetarLeitura().then(function(lei){if(!vale())return;AGD.ult=lei;agdPintarAbertura(S,lei);agdPintarLista(S);agdPintarLado(S,lei)},function(e){if(!vale())return;
      AGD.ult=null;S.hero.innerHTML="";S.kpis.innerHTML="";S.aviso.innerHTML="";S.graf.innerHTML="";S.lista.innerHTML="";
      S.lista.appendChild(rkEstado("erro","Não consegui montar a agenda ("+e.message+")."));logErro("agenda",e)});
    proximasSelecao().then(function(s){if(vale())agdPintarProxima(S,s,false)},function(e){if(!vale())return;agdPintarProxima(S,null,true);logErro("próxima ação",e)})}
  /* o formulário de lembrete avulso (tarefa com data): grava como sempre, em PESSOAL.lembretes, pelo pessoalGravar */
  function agdFormulario(S,depois){
    var t=rkCampo("O quê","agd-lem-t"),d=rkCampo("Quando","agd-lem-d",{valor:hojeISO()}),st=h("p",{class:"rac-t-sec",role:"status",style:"margin:0"}),ok=rkBtn("pri","Adicionar");
    var ti=t.querySelector("input"),di=d.querySelector("input");ti.placeholder="Ex.: ativar a conta paga do Google Cloud";di.type="date";S.campo=ti;
    ok.onclick=function(){if(!ti.value.trim()){st.textContent="Escreva o que precisa lembrar.";ti.focus();return}
      pessoalGravar("lembretes",[{id:"l"+Date.now().toString(36),data:di.value||hojeISO(),t:ti.value.trim()}].concat(PESSOAL.lembretes||[]));ti.value="";st.textContent="Lembrete adicionado.";depois()};
    return rkCard("Novo lembrete",h("div",{class:"rac-pilha",style:"gap:12px"},t,d,h("div",{class:"rac-linha-flex"},ok),st),{sub:"Uma tarefa com data: ela entra na lista, aqui e na Próxima melhor ação."})}
  function renderAgenda(){
    var root=$("#agenda-view");root.innerHTML="";
    var S={raiz:h("div",{class:"rh ag"}),hero:h("section",{class:"rh-hero","aria-label":"Resumo da agenda"}),aviso:h("div",{class:"rh-largo"}),kpis:h("section",{class:"rh-kpis","aria-label":"Indicadores da agenda"}),
      prox:h("div"),lista:h("div",{class:"ag-corpo"}),graf:h("div",{class:"ag-graf"}),campo:null};
    var esq=h("div",{class:"rh-prio ag-col"},S.prox,S.lista),dir=h("div",{class:"rh-lado ag-col"},S.graf,agdFormulario(S,function(){agdCarregar(S)}));
    S.hero.appendChild(h("div",null,h("h2",{text:"Agenda"}),h("p",{class:"rh-hero-resumo",text:"Lendo a agenda…"})));
    S.prox.appendChild(rkEstado("carregando","Calculando a próxima ação…"));S.lista.appendChild(rkEstado("carregando","Lendo a agenda…"));
    [S.hero,S.aviso,S.kpis,esq,dir].forEach(function(x){S.raiz.appendChild(x)});root.appendChild(S.raiz);
    agdCarregar(S)}
