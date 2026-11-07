/* Dia a Dia RAC — Central Esportiva, carregada com a seção Esportes depois de js/esportes.js (docs/esportes.md).
   Página central (#esportes), os dados que faltavam (classificação completa, líderes, estatísticas do time, desempenho recente,
   comparações, calendário), Futebol, Giro esportivo e a análise com IA (RAC Intelligence, só DEMO nesta fase).
   Tudo vem ao vivo das fontes (API oficial da MLB e ESPN), com fonte e período em cada quadro. Nada aqui grava no banco. */
  var EC_MLB="MLB Stats API",EC_ESPN="ESPN",EC_CACHE="rac-esp-ia-v1",EC_TENT="rac-esp-ia-tent-v1";
  function ecDM(d){return d?String(d).slice(8,10)+"/"+String(d).slice(5,7):""}
  function ecDMA(d){return d?ecDM(d)+"/"+String(d).slice(0,4):""}
  function ecSinal(n){n=+n;return (n>0?"+":"")+n}
  function ecSinalN(n){return (n>0?"+":"")+ecNum(n)}
  function ecNum(n){return n==null||n===""?"–":String(n).replace(/^(-?\d+)\.(\d+)$/,"$1,$2")}
  function ecNada(){return null}
  function ecFonte(fonte,periodo,extra){return h("p",{class:"note ecfonte",text:"Fonte: "+fonte+(periodo?" · "+periodo:"")+(extra?" · "+extra:"")})}
  function ecTab(cab,linhas,nf){nf=nf==null?2:nf;
    return h("div",{class:"famtabw"},h("table",{class:"famtab stand"},h("thead",null,h("tr",null,cab.map(function(c,i){return h("th",{class:i>=nf?"num":null,text:c[0]||c,title:c[1]||""})}))),
      h("tbody",null,linhas.map(function(l){return h("tr",{class:l.eu?"eu":null},l.c.map(function(x,i){return h("td",{class:i>=nf?"num":null},x)}))}))))}
  function ecVD(v,d){v=+v;d=+d;return v+(v===1?" vitória":" vitórias")+" e "+d+(d===1?" derrota":" derrotas")}
  function ecRes(r){return r==="V"?"vitória":r==="D"?"derrota":"empate"}
  function ecSeq(s){if(!s)return "";var n=+s.slice(1);return n+" "+(s[0]==="V"?(n===1?"vitória":"vitórias"):s[0]==="D"?(n===1?"derrota":"derrotas"):(n===1?"empate":"empates"))}

  /* ===== Desempenho recente: últimos 10 jogos contra os 10 anteriores (NUCLEO.espUltimos) ===== */
  function ecForma(jogos,meu){var rec=NUCLEO.espUltimos(jogos,meu,10),ant=NUCLEO.espUltimos(jogos,meu,10,10);return {rec:rec,ant:ant,cmp:NUCLEO.espComparar(rec,ant)}}
  /* saldo de cada jogo em colunas: valor fixo em cima, adversário e dia embaixo, toque mostra o cartão destacado (racDica) */
  function ecSaldoGraf(lista,un){
    var mx=Math.max.apply(null,lista.map(function(j){return Math.abs(j.pro-j.contra)}).concat([1]));
    var vb=h("div",{class:"vbars vbpeso ecsaldo"},lista.map(function(j){var s=j.pro-j.contra,lado=(j.casa?"vs ":"@ ")+j.adversario;
      var b=h("button",{type:"button",class:"vb"+(s<0?" neg":s===0?" emp":""),"aria-label":ecDM(j.data)+" "+lado+": "+j.pro+" a "+j.contra},
        h("span",{class:"vbv",text:ecSinal(s)}),h("span",{class:"vbt"},h("span",{class:"vbf",style:"height:"+Math.max(4,Math.abs(s)/mx*100).toFixed(1)+"%"})),vbRotulo(lado,ecDM(j.data)));
      racDica.ligar(b,function(){return [ecDMA(j.data)+" · "+lado,ecRes(j.res)+" por "+j.pro+" a "+j.contra+" · saldo de "+ecSinal(s)+" "+un]});return b}));
    vbFim(vb);return vb}
  function ecLinhaForma(r,un){return r.v+"–"+r.d+(r.e?"–"+r.e:"")+" · "+ecNum(r.mediaPro)+" "+un+" a favor e "+ecNum(r.mediaContra)+" contra por jogo · saldo "+ecSinal(r.saldo)}
  function ecFormaPanel(nome,un,f,fonte){
    var p=panel("Desempenho recente","Os últimos 10 jogos terminados de "+nome+", comparados com os 10 anteriores. Calculado pelo site com os placares oficiais.");
    if(!f.rec.jogos){p.appendChild(h("p",{class:"empty",text:"Ainda não há jogos terminados nesta temporada."}));return p}
    var ul=h("ul",{class:"wl"});
    ul.appendChild(h("li",null,h("span",{class:"grow"},h("b",{text:"Últimos "+f.rec.jogos+" ("+ecDM(f.rec.inicio)+" a "+ecDM(f.rec.fim)+")"}),h("span",{class:"sub",text:ecLinhaForma(f.rec,un)+" · sequência: "+ecSeq(f.rec.seq)}))));
    if(f.ant.jogos)ul.appendChild(h("li",null,h("span",{class:"grow"},h("b",{text:f.ant.jogos+" anteriores ("+ecDM(f.ant.inicio)+" a "+ecDM(f.ant.fim)+")"}),h("span",{class:"sub",text:ecLinhaForma(f.ant,un)}))));
    p.appendChild(ul);
    if(f.cmp){var at=f.cmp.pro,df=f.cmp.contra;
      p.appendChild(h("p",{class:"ectend"},h("span",{class:"vt "+(at>0?"down":at<0?"up":"flat"),text:"Ataque "+(at>0?"melhorou":at<0?"piorou":"igual")+" ("+ecSinalN(at)+" "+un+" a favor por jogo)"})," · ",
        h("span",{class:"vt "+(df<0?"down":df>0?"up":"flat"),text:"Defesa "+(df<0?"melhorou":df>0?"piorou":"igual")+" ("+ecSinalN(df)+" "+un+" contra por jogo)"})))}
    else p.appendChild(h("p",{class:"sub",text:"Ainda não há 10 jogos anteriores para comparar."}));
    p.appendChild(h("h3",{class:"dayh",text:"Saldo de cada jogo"}));p.appendChild(ecSaldoGraf(f.rec.lista,un));
    p.appendChild(ecFonte(fonte,ecDMA(f.rec.inicio)+" a "+ecDMA(f.rec.fim)));
    return p}

  /* ===== MLB: dados que faltavam ===== */
  function ecMlbJogos(id){return once("ecj"+id+"-"+SEASON,function(){
    return Promise.all([mlbSched("teamId="+id+"&gameType=R,F,D,L,W&season="+SEASON),getTeams().catch(function(){return []})]).then(function(r){
      var ab={};r[1].forEach(function(t){ab[t.id]=t.abbr});r[0].forEach(function(g){g.away.abbr=ab[g.away.id];g.home.abbr=ab[g.home.id]});return r[0]})})}
  function ecMlbStd(){return once("ecstd-"+SEASON,function(){return api("/standings?leagueId=103,104&season="+SEASON+"&hydrate=team(division)").then(function(d){return d.records||[]})})}
  function ecMlbTimes(grupo){return once("ects-"+grupo+"-"+SEASON,function(){return api("/teams/stats?season="+SEASON+"&group="+grupo+"&stats=season&sportId=1").then(function(d){return ((d.stats||[])[0]||{}).splits||[]})})}
  function ecStdTime(recs,id){var r=null;(recs||[]).forEach(function(x){(x.teamRecords||[]).forEach(function(t){if(t.team.id===id)r=t})});return r}
  function ecDezUlt(t){var s=((t.records||{}).splitRecords||[]).filter(function(x){return x.type==="lastTen"})[0];return s?s.wins+"–"+s.losses:"–"}
  /* posição de um time numa estatística entre os 30 (menor = melhor em ERA, WHIP e walks) */
  function ecPos(splits,id,k,menor){var l=splits.filter(function(s){return s.stat&&s.stat[k]!=null}).slice().sort(function(a,b){var x=parseFloat(a.stat[k]),y=parseFloat(b.stat[k]);return menor?x-y:y-x});
    for(var i=0;i<l.length;i++)if(l[i].team.id===id)return {pos:i+1,de:l.length};return null}
  var EC_MLB_REB=[["avg","AVG","Média de rebatidas"],["obp","OBP","Em base"],["slg","SLG","Slugging"],["ops","OPS","On-base + slugging"],["homeRuns","HR","Home runs"],["rbi","RBI","Corridas impulsionadas"],["stolenBases","SB","Bases roubadas"],["runs","R","Corridas marcadas"]];
  var EC_MLB_ARR=[["era","ERA","Média de corridas limpas",1],["whip","WHIP","Corredores por entrada",1],["strikeOuts","K","Strikeouts"],["baseOnBalls","BB","Walks cedidas",1],["inningsPitched","IP","Entradas arremessadas"]];
  function ecMlbTimeStats(id,nome){
    return lazyPanel("Estatísticas do time","Temporada "+SEASON+" (regular), com a posição entre os 30 times da MLB.",function(body){
      return Promise.all([ecMlbTimes("hitting"),ecMlbTimes("pitching")]).then(function(r){body.innerHTML="";
        function bloco(splits,lista,tit){var eu=splits.filter(function(s){return s.team.id===id})[0];if(!eu)return;
          body.appendChild(h("h3",{class:"dayh",text:tit}));
          body.appendChild(ecTab([["Estatística"],[nome],["Posição na MLB","1º = melhor"]],lista.map(function(x){var p=ecPos(splits,id,x[0],x[3]);
            return {c:[h("span",{title:x[2]},x[1]+" · "+x[2]),String(eu.stat[x[0]]==null?"–":eu.stat[x[0]]),p?p.pos+"º de "+p.de:"–"]}}),1))}
        bloco(r[0],EC_MLB_REB,"Rebatida");bloco(r[1],EC_MLB_ARR,"Arremesso");
        if(!body.children.length)body.appendChild(h("p",{class:"empty",text:"Estatísticas da temporada ainda não disponíveis."}));
        body.appendChild(ecFonte(EC_MLB,"temporada "+SEASON,"atualizado "+quando(new Date())))})})}
  /* o time contra os rivais da divisão: campanha, saldo, OPS e ERA */
  function ecMlbDivisao(id){
    return lazyPanel("Comparação com a divisão","Os times da divisão lado a lado na temporada "+SEASON+".",function(body){
      return Promise.all([ecMlbStd(),ecMlbTimes("hitting").catch(function(){return []}),ecMlbTimes("pitching").catch(function(){return []})]).then(function(r){body.innerHTML="";
        var div=r[0].filter(function(x){return (x.teamRecords||[]).some(function(t){return t.team.id===id})})[0];
        if(!div){body.appendChild(h("p",{class:"empty",text:"Classificação ainda não disponível."}));return}
        function st(l,tid,k){var s=l.filter(function(x){return x.team.id===tid})[0];return s&&s.stat?String(s.stat[k]):"–"}
        body.appendChild(ecTab([["Time"],["V–D","Vitórias e derrotas"],["JA","Jogos atrás do líder"],["Saldo","Saldo de corridas"],["Últ. 10","Últimos 10 jogos"],["OPS","On-base + slugging do time"],["ERA","Média de corridas limpas do time"]],
          div.teamRecords.map(function(t){return {eu:t.team.id===id,c:[h("a",{class:"tn",href:"#esportes/beisebol/time-"+t.team.id},logoImg(t.team.id,"sm"),t.team.teamName||t.team.name),t.wins+"–"+t.losses,t.divisionGamesBack||t.gamesBack,ecSinal(t.runDifferential),ecDezUlt(t),st(r[1],t.team.id,"ops"),st(r[2],t.team.id,"era")]}}),1));
        body.appendChild(ecFonte(EC_MLB,"temporada "+SEASON))})})}
  /* classificação completa: as seis divisões (a dos Dodgers aberta) e as duas ligas inteiras */
  function ecMlbClassificacao(){
    return lazyPanel("Classificação da MLB","Divisões, Liga Nacional e Liga Americana, temporada "+SEASON+".",function(body){
      return ecMlbStd().then(function(recs){body.innerHTML="";
        if(!recs.length){body.appendChild(h("p",{class:"empty",text:"Classificação ainda não disponível."}));return}
        var CAB=[["#"],["Time"],["V"],["D"],["%","Aproveitamento"],["JA","Jogos atrás do líder"],["Saldo","Saldo de corridas"],["Últ. 10","Últimos 10 jogos"],["Seq.","Sequência"]];
        function linha(t,i){return {eu:t.team.id===DODGERS,c:[String(i+1),h("a",{class:"tn",href:"#esportes/beisebol/time-"+t.team.id},logoImg(t.team.id,"sm"),t.team.teamName||t.team.name),String(t.wins),String(t.losses),t.winningPercentage,t.gamesBack,ecSinal(t.runDifferential),ecDezUlt(t),(t.streak&&t.streak.streakCode)||"–"]}}
        var por=recs.map(function(x){var t0=x.teamRecords[0],dv=t0&&t0.team.division&&t0.team.division.name||"";return {nome:DIVPT[dv]||dv,lista:x.teamRecords,meu:x.teamRecords.some(function(t){return t.team.id===DODGERS}),liga:x.league&&x.league.id}});
        por.sort(function(a,b){return (b.meu?1:0)-(a.meu?1:0)});
        por.forEach(function(d){var tb=ecTab(CAB,d.lista.map(linha),2);
          if(d.meu){body.appendChild(h("h3",{class:"dayh",text:d.nome}));body.appendChild(tb)}else body.appendChild(h("details",{class:"famvals"},h("summary",{text:d.nome}),tb))});
        [[104,"Liga Nacional · geral"],[103,"Liga Americana · geral"]].forEach(function(lg){var todos=[];por.forEach(function(d){if(d.liga===lg[0])todos=todos.concat(d.lista)});
          todos.sort(function(a,b){return (+a.leagueRank||99)-(+b.leagueRank||99)});
          if(todos.length)body.appendChild(h("details",{class:"famvals"},h("summary",{text:lg[1]+" (pela posição na liga)"}),ecTab(CAB,todos.map(linha),2)))});
        body.appendChild(ecFonte(EC_MLB,"temporada "+SEASON,"atualizado "+quando(new Date())))})})}
  /* líderes da liga: rebatida e arremesso (temporada regular, jogadores qualificados pela MLB) */
  var EC_LID_REB=[["battingAverage","AVG · média de rebatidas"],["onBasePercentage","OBP · em base"],["sluggingPercentage","SLG · slugging"],["onBasePlusSlugging","OPS"],["homeRuns","HR · home runs"],["runsBattedIn","RBI · corridas impulsionadas"],["stolenBases","SB · bases roubadas"]];
  var EC_LID_ARR=[["earnedRunAverage","ERA · corridas limpas"],["walksAndHitsPerInningPitched","WHIP"],["strikeouts","K · strikeouts"],["walks","BB · walks cedidas (mais)"],["inningsPitched","IP · entradas arremessadas"]];
  function ecMlbLideresDados(){return once("eclid-"+SEASON,function(){
    function pega(lista,grupo){return api("/stats/leaders?leaderCategories="+lista.map(function(x){return x[0]}).join(",")+"&statGroup="+grupo+"&season="+SEASON+"&sportId=1&limit=5&leaderGameTypes=R").then(function(d){
      var por={};(d.leagueLeaders||[]).forEach(function(c){if(!c.statGroup||c.statGroup===grupo)por[c.leaderCategory]=c.leaders||[]});return por})}
    return Promise.all([pega(EC_LID_REB,"hitting"),pega(EC_LID_ARR,"pitching")]).then(function(r){return {reb:r[0],arr:r[1]}})})}
  function ecMlbLideres(){
    return lazyPanel("Líderes da MLB","Os 5 primeiros de cada estatística na temporada regular "+SEASON+". Os dos Dodgers ficam em destaque.",function(body){
      return ecMlbLideresDados().then(function(L){body.innerHTML="";
        function grade(lista,por,tit){body.appendChild(h("h3",{class:"dayh",text:tit}));
          body.appendChild(h("div",{class:"eclid"},lista.map(function(c){var l=por[c[0]]||[];
            return h("div",{class:"eclidc"},h("b",{text:c[1]}),l.length?h("ol",null,l.map(function(x){
              return h("li",{class:x.team&&x.team.id===DODGERS?"eu":null},mlbCell(x.person.id,x.person.fullName),x.team?logoImg(x.team.id,"sm"):null,h("span",{class:"end",text:x.value}))})):h("p",{class:"sub",text:"–"}))})))}
        grade(EC_LID_REB,L.reb,"Rebatida");grade(EC_LID_ARR,L.arr,"Arremesso");
        body.appendChild(ecFonte(EC_MLB,"temporada regular "+SEASON))})})}
  /* jogadores em melhor fase: estatísticas só do período dos últimos 10 jogos (byDateRange da MLB) */
  /* com vários tipos de jogo (temporada regular e playoffs), a MLB manda um recorte por tipo e um com o total: fica o maior (o total) */
  function ecSomaTipos(person,group,k){var m=null;(person.stats||[]).forEach(function(x){if(!x.group||x.group.displayName!==group)return;
    (x.splits||[]).forEach(function(s){if(s.stat&&(!m||(+s.stat[k]||0)>(+m[k]||0)))m=s.stat})});return m}
  function ecMlbFase(id,rec){
    if(!rec||!rec.jogos)return Promise.resolve(null);
    return once("ecfz"+id+rec.inicio+rec.fim,function(){
      return api("/teams/"+id+"/roster?rosterType=fullSeason&season="+SEASON+"&hydrate=person(stats(group=[hitting,pitching],type=[byDateRange],gameType=[R,F,D,L,W],startDate="+rec.inicio+",endDate="+rec.fim+",season="+SEASON+"))").then(function(d){
        var ppl=(d.roster||[]).map(function(r){return {p:r.person,h:ecSomaTipos(r.person,"hitting","plateAppearances"),a:ecSomaTipos(r.person,"pitching","battersFaced")}});
        var reb=ppl.filter(function(x){return x.h&&(x.h.plateAppearances||0)>=15}).sort(function(a,b){return parseFloat(b.h.ops)-parseFloat(a.h.ops)}).slice(0,5);
        var arr=ppl.filter(function(x){return x.a&&parseFloat(x.a.inningsPitched||0)>=3}).sort(function(a,b){return parseFloat(a.a.era)-parseFloat(b.a.era)||parseFloat(b.a.inningsPitched)-parseFloat(a.a.inningsPitched)}).slice(0,4);
        return {reb:reb,arr:arr,inicio:rec.inicio,fim:rec.fim}})})}
  function ecMlbFasePanel(id,jogosP){
    return lazyPanel("Jogadores em melhor fase","Só os jogos do período dos últimos 10 do time. Rebatedores com pelo menos 15 aparições ao bastão; arremessadores com pelo menos 3 entradas.",function(body){
      return jogosP.then(function(jogos){var f=ecForma(jogos,function(t){return t.id===id});return ecMlbFase(id,f.rec)}).then(function(z){body.innerHTML="";
        if(!z||(!z.reb.length&&!z.arr.length)){body.appendChild(h("p",{class:"empty",text:"Sem jogos suficientes no período para comparar jogadores."}));return}
        if(z.reb.length){body.appendChild(h("h3",{class:"dayh",text:"Rebatedores (melhor OPS)"}));
          body.appendChild(table(["Jogador","PA","AVG","OBP","SLG","OPS","HR","RBI"],z.reb.map(function(x){var s=x.h;return [mlbCell(x.p.id,x.p.fullName),dash(s.plateAppearances),dash(s.avg),dash(s.obp),dash(s.slg),dash(s.ops),dash(s.homeRuns),dash(s.rbi)]}),1))}
        if(z.arr.length){body.appendChild(h("h3",{class:"dayh",text:"Arremessadores (melhor ERA)"}));
          body.appendChild(table(["Jogador","IP","ERA","WHIP","K","BB"],z.arr.map(function(x){var s=x.a;return [mlbCell(x.p.id,x.p.fullName),dash(s.inningsPitched),dash(s.era),dash(s.whip),dash(s.strikeOuts),dash(s.baseOnBalls)]}),1))}
        body.appendChild(ecFonte(EC_MLB,ecDMA(z.inicio)+" a "+ecDMA(z.fim)))})})}
  /* comparador: dois jogadores do elenco da temporada, lado a lado */
  function ecMlbComparar(id){
    var p=panel("Comparar jogadores","Escolha dois jogadores do elenco da temporada "+SEASON+". O melhor número de cada linha fica em destaque."),body=h("div",null,loading());p.appendChild(body);
    api("/teams/"+id+"/roster?rosterType=fullSeason&season="+SEASON+"&hydrate=person(stats(group=[hitting,pitching],type=season,season="+SEASON+"))").then(function(d){body.innerHTML="";
      var ppl=(d.roster||[]).map(function(r){return {p:r.person,h:statOf(r.person,"hitting"),a:statOf(r.person,"pitching"),pos:r.position&&r.position.type}});
      var modos={reb:{nome:"Rebatedores",l:ppl.filter(function(x){return x.h&&(x.h.plateAppearances||0)>=30&&x.pos!=="Pitcher"}).sort(function(a,b){return b.h.plateAppearances-a.h.plateAppearances}),k:"h",st:EC_MLB_REB},
        arr:{nome:"Arremessadores",l:ppl.filter(function(x){return x.a&&parseFloat(x.a.inningsPitched||0)>=10}).sort(function(a,b){return parseFloat(b.a.inningsPitched)-parseFloat(a.a.inningsPitched)}),k:"a",st:EC_MLB_ARR}};
      var modo="reb",chips=h("div",{class:"chips"}),sa=h("select",{"aria-label":"Primeiro jogador"}),sb=h("select",{"aria-label":"Segundo jogador"}),res=h("div");
      function opcoes(){var m=modos[modo];[sa,sb].forEach(function(s,i){s.innerHTML="";m.l.forEach(function(x,j){s.appendChild(h("option",{value:String(j),text:x.p.fullName}))});s.value=String(Math.min(i,m.l.length-1))});desenha()}
      function desenha(){var m=modos[modo];res.innerHTML="";if(m.l.length<2){res.appendChild(h("p",{class:"empty",text:"Jogadores insuficientes."}));return}
        var A=m.l[+sa.value],B=m.l[+sb.value];
        res.appendChild(ecTab([["Estatística"],[A.p.fullName],[B.p.fullName]],m.st.map(function(x){var va=A[m.k][x[0]],vb_=B[m.k][x[0]],fa=parseFloat(va),fb=parseFloat(vb_),ga=x[3]?fa<fb:fa>fb,gb=x[3]?fb<fa:fb>fa;
          return {c:[h("span",{title:x[2]},x[1]+" · "+x[2]),h("span",{class:ga?"ecmelhor":null,text:va==null?"–":String(va)}),h("span",{class:gb?"ecmelhor":null,text:vb_==null?"–":String(vb_)})]}}),1))}
      ["reb","arr"].forEach(function(k){var b=h("button",{type:"button",class:"chipb"+(k===modo?" on":""),text:modos[k].nome});
        b.onclick=function(){modo=k;chips.querySelectorAll("button").forEach(function(x){x.classList.remove("on")});b.classList.add("on");opcoes()};chips.appendChild(b)});
      sa.onchange=desenha;sb.onchange=desenha;
      body.appendChild(chips);body.appendChild(h("div",{class:"vfil eccomp"},sa,h("span",{class:"sub",text:"×"}),sb));body.appendChild(res);
      body.appendChild(ecFonte(EC_MLB,"temporada "+SEASON));opcoes()
    }).catch(function(e){body.innerHTML="";body.appendChild(failed(function(){p.replaceWith(ecMlbComparar(id))},e))});
    return p}
  /* calendário e retrospecto: todos os jogos da temporada por mês (o mais recente aberto) */
  function ecMlbCalendario(id,jogosP){
    return lazyPanel("Calendário e retrospecto","Temporada "+SEASON+": temporada regular e playoffs. Toque num jogo para ver os detalhes.",function(body){
      return jogosP.then(function(gs){body.innerHTML="";
        if(!gs.length){body.appendChild(h("p",{class:"empty",text:"Sem jogos na temporada "+SEASON+"."}));return}
        var por={},meses=[],fin=gs.filter(function(g){return g.state==="post"}),v=0,dr=0;
        fin.forEach(function(g){var eu=g.home.id===id?g.home:g.away;if(eu.winner)v++;else dr++});
        body.appendChild(h("p",{class:"sub",text:"Retrospecto: "+ecVD(v,dr)+" em "+fin.length+" jogos terminados (temporada regular e playoffs)."}));
        gs.forEach(function(g){var k=NUCLEO.espDia(g.date).slice(0,7);if(!por[k]){por[k]=[];meses.push(k)}por[k].push(g)});
        var ab=meses.filter(function(k){return por[k].some(function(g){return g.state==="post"})}).pop()||meses[0];
        meses.forEach(function(k){var ul=h("ul",{class:"wl tabjogos"});
          por[k].forEach(function(g){var casa=g.home.id===id,eu=casa?g.home:g.away,adv=casa?g.away:g.home,dt=new Date(g.date);
            var r=g.state==="post"?(eu.winner?"V ":"D ")+eu.score+"–"+adv.score:g.state==="live"?"ao vivo":g.tbd?"a definir":hm(dt);
            ul.appendChild(h("li",{class:"clic"+(g.state==="post"?(eu.winner?" ganhou":" perdeu"):"")},h("span",{class:"when",text:dt.toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"2-digit"})}),
              h("span",{class:"grow tn"},h("span",{class:"sub",text:casa?"vs":"@"}),logoImg(adv.id,"sm"),adv.name,g.label?h("span",{class:"sub",text:" · "+g.label}):null),h("a",{class:"end",href:g.detail,text:r})))});
          var nome=new Date(k+"-15T12:00:00").toLocaleDateString("pt-BR",{month:"long",year:"numeric"});
          body.appendChild(h("details",{class:"famvals",open:k===ab?"":null},h("summary",{text:cap(nome)+" ("+por[k].length+")"}),ul))});
        body.appendChild(ecFonte(EC_MLB,"temporada "+SEASON))})})}
  function ecDesfechoTexto(ds,nome){
    if(ds.tipo==="campeao")return nome+" campeões da Série Mundial de "+SEASON+" contra o "+ds.adversario.nome+", "+ds.vitorias+" a "+ds.derrotas+" na série.";
    if(ds.tipo==="eliminado")return nome+" eliminados na "+ds.serie+" de "+SEASON+" pelo "+ds.adversario.nome+", "+ds.vitorias+" a "+ds.derrotas+" na série.";
    if(ds.tipo==="avancou")return nome+" venceram a "+ds.serie+" de "+SEASON+" contra o "+ds.adversario.nome+", "+ds.vitorias+" a "+ds.derrotas+".";
    return nome+": "+ds.serie+" de "+SEASON+" em andamento contra o "+ds.adversario.nome+"."}

  /* ===== Página dos Dodgers e tela da liga: os quadros novos (chamados de js/esportes.js) ===== */
  /* os quadros da página dos Dodgers, por nome: js/esportes.js (viewDodgers) escolhe a ordem na tela */
  function dodgersCentral(){
    var jogosP=ecMlbJogos(DODGERS),ia=ecIABox({acao:"esportes.analise",foco:"dodgers",ctx:{foco:"dodgers"},nome:"Dodgers",fatos:ecFatosDodgers});
    var forma=h("div",null,h("div",{class:"panel"},loading()));
    jogosP.then(function(gs){forma.innerHTML="";forma.appendChild(ecFormaPanel("Dodgers","corridas",ecForma(gs,function(t){return t.id===DODGERS}),EC_MLB))})
      .catch(function(e){forma.innerHTML="";forma.appendChild(h("div",{class:"panel"},failed(function(){location.reload()},e)))});
    return {ia:ia,forma:forma,stats:ecMlbTimeStats(DODGERS,"Dodgers"),divisao:ecMlbDivisao(DODGERS),fase:ecMlbFasePanel(DODGERS,jogosP),comparar:ecMlbComparar(DODGERS),calendario:ecMlbCalendario(DODGERS,jogosP)}}
  function mlbLigaCentral(){return [ecMlbClassificacao(),ecMlbLideres()]}

  /* ===== NBA e NFL: os quadros novos das páginas dos Lakers e dos Packers (chamados de js/esportes.js) ===== */
  function ecEspnLideres(sport){return once("eclead-"+sport,function(){return getJson("https://site.api.espn.com/apis/site/v3/sports/"+ESPN[sport].path+"/leaders")})}
  /* temporada e fase pela própria ESPN (sem resposta, pelo calendário) */
  function ecEspnTemp(sport){return ecEspnLideres(sport).then(function(L){return NUCLEO.espTemporada(sport,hojeISO(),L.currentSeason)},function(){return NUCLEO.espTemporada(sport,hojeISO())})}
  function ecEspnStats(sport,abbr){return once("ecsts-"+sport+abbr,function(){return espn(sport,"/teams/"+abbr.toLowerCase()+"/statistics").then(function(d){
    var m={};(((d.results||{}).stats||{}).categories||[]).forEach(function(c){(c.stats||[]).forEach(function(s){m[c.name+"."+s.name]=s})});return m})})}
  function ecSt(e,n){var x=(e.stats||[]).filter(function(s){return s.name===n||s.type===n})[0];return x?x.displayValue:"–"}
  var EC_ESTAT={
    nba:[["offensive.avgPoints","Pontos por jogo"],["offensive.fieldGoalPct","Aproveitamento de arremessos (%)"],["offensive.threePointPct","Aproveitamento de três (%)"],["offensive.freeThrowPct","Lances livres (%)"],
      ["general.avgRebounds","Rebotes por jogo"],["offensive.avgAssists","Assistências por jogo"],["defensive.avgSteals","Roubos por jogo"],["defensive.avgBlocks","Tocos por jogo"],["offensive.avgTurnovers","Erros (turnovers) por jogo"]],
    nfl:[["scoring.totalPointsPerGame","Pontos por jogo"],["passing.passingYardsPerGame","Jardas aéreas por jogo"],["rushing.rushingYardsPerGame","Jardas terrestres por jogo"],["passing.yardsPerGame","Jardas totais por jogo"],
      ["miscellaneous.thirdDownConvPct","Conversão de 3ª descida (%)"],["miscellaneous.redzoneTouchdownPct","Touchdown na red zone (%)"],["defensive.sacks","Sacks da defesa"],["miscellaneous.totalTakeaways","Bolas recuperadas"],["miscellaneous.turnOverDifferential","Saldo de turnovers"]]};
  var EC_LIDCAT={nba:[["pointsPerGame","Pontos por jogo"],["reboundsPerGame","Rebotes por jogo"],["assistsPerGame","Assistências por jogo"],["stealsPerGame","Roubos por jogo"],["blocksPerGame","Tocos por jogo"]],
    nfl:[["passingYards","Jardas aéreas"],["rushingYards","Jardas terrestres"],["receptions","Recepções"],["receivingYards","Jardas recebidas"],["totalTouchdowns","Touchdowns"],["sacks","Sacks"]]};
  function ecLidLista(L,cat){var c=((L.leaders||{}).categories||[]).filter(function(x){return x.name===cat})[0];return c?(c.leaders||[]).slice(0,5):[]}
  function ecLidTime(x){return (x.team&&x.team.abbreviation)||(x.athlete&&x.athlete.team&&x.athlete.team.abbreviation)||""}
  /* linhas da classificação que importam para a comparação: NBA = a conferência do time; NFL = a divisão do time */
  function ecEspnRivais(sport,d,abbr){var tem=function(g){return ((g.standings||{}).entries||[]).some(function(e){return e.team.abbreviation===abbr})};
    if(sport==="nba"){var c=(d.children||[]).filter(tem)[0];return c?{nome:c.name.replace("Western Conference","Conferência Oeste").replace("Eastern Conference","Conferência Leste"),l:c.standings.entries.slice().sort(function(a,b){return (+ecSt(a,"playoffSeed")||99)-(+ecSt(b,"playoffSeed")||99)})}:null}
    var dv=null;(d.children||[]).forEach(function(cf){(cf.children||[]).forEach(function(x){if(tem(x))dv=x})});
    return dv?{nome:dv.name.replace("North","Norte").replace("South","Sul").replace("East","Leste").replace("West","Oeste"),l:dv.standings.entries.slice().sort(function(a,b){return (+ecSt(b,"winPercent")||0)-(+ecSt(a,"winPercent")||0)})}:null}
  function espnCentral(sport,t,games){
    var nome=t.shortDisplayName||t.displayName||"",abbr=t.abbreviation,foco=sport==="nba"?"lakers":"packers",un=sport==="nba"?"pontos":"pontos";
    var ia=ecIABox({acao:"esportes.analise",foco:foco,ctx:{foco:foco},nome:nome,fatos:function(){return ecFatosEspn(sport,t,games)}});
    var antes=ia?[ia]:[];
    antes.push(ecFormaPanel(nome,un,ecForma(games,function(x){return x.abbr===abbr}),EC_ESPN+" (placares da agenda do time)"));
    var estat=lazyPanel("Estatísticas do time","Temporada atual, pela ESPN.",function(body){
      return Promise.all([ecEspnStats(sport,abbr),ecEspnTemp(sport),espnStandings(sport).catch(ecNada)]).then(function(r){body.innerHTML="";var m=r[0],tp=r[1];
        var linhas=EC_ESTAT[sport].filter(function(x){return m[x[0]]}).map(function(x){return {c:[x[1],m[x[0]].displayValue]}});
        var rv=r[2]&&ecEspnRivais(sport,r[2],abbr),eu=rv&&rv.l.filter(function(e){return e.team.abbreviation===abbr})[0];
        if(eu)linhas.push({c:[sport==="nba"?"Pontos sofridos por jogo":"Pontos sofridos",ecSt(eu,sport==="nba"?"avgPointsAgainst":"pointsAgainst")]});
        if(!linhas.length){body.appendChild(h("p",{class:"empty",text:"Estatísticas ainda não disponíveis."}));return}
        body.appendChild(ecTab([["Estatística"],[nome]],linhas,1));body.appendChild(ecFonte(EC_ESPN,"temporada "+tp.rotulo+" · "+tp.faseNome))})});
    var comp=lazyPanel("Comparação com os rivais",sport==="nba"?"A conferência do time, pela posição de playoffs.":"A divisão do time.",function(body){
      return espnStandings(sport).then(function(d){body.innerHTML="";var rv=ecEspnRivais(sport,d,abbr);
        if(!rv){body.appendChild(h("p",{class:"empty",text:"Classificação ainda não disponível."}));return}
        var cab=sport==="nba"?[["#"],["Time"],["V–D"],["%","Aproveitamento"],["Pró","Pontos a favor por jogo"],["Contra","Pontos contra por jogo"],["Saldo","Saldo por jogo"],["Últ. 10","Últimos 10 jogos"]]
          :[["#"],["Time"],["V–D–E"],["%","Aproveitamento"],["PF","Pontos a favor"],["PC","Pontos contra"],["Saldo","Saldo de pontos"],["Seq.","Sequência"]];
        body.appendChild(h("h3",{class:"dayh",text:rv.nome}));
        body.appendChild(ecTab(cab,rv.l.map(function(e,i){var tm=e.team||{},lg=tm.logos&&tm.logos[0]&&tm.logos[0].href;
          var c=sport==="nba"?[ecSt(e,"wins")+"–"+ecSt(e,"losses"),ecSt(e,"winPercent"),ecSt(e,"avgPointsFor"),ecSt(e,"avgPointsAgainst"),ecSt(e,"differential"),ecSt(e,"Last Ten Games")]
            :[ecSt(e,"wins")+"–"+ecSt(e,"losses")+"–"+ecSt(e,"ties"),ecSt(e,"winPercent"),ecSt(e,"pointsFor"),ecSt(e,"pointsAgainst"),ecSt(e,"differential"),ecSt(e,"streak")];
          return {eu:tm.abbreviation===abbr,c:[String(i+1),h("span",{class:"tn"},img(lg||"","lg sm"),tm.shortDisplayName||tm.displayName)].concat(c)}}),2));
        body.appendChild(ecFonte(EC_ESPN,"classificação de hoje"))})});
    var lid=lazyPanel(sport==="nba"?"Líderes da NBA":"Líderes da NFL","Os 5 primeiros de cada estatística na temporada. Os do "+nome+" ficam em destaque.",function(body){
      return Promise.all([ecEspnLideres(sport),ecEspnTemp(sport)]).then(function(r){body.innerHTML="";var L=r[0];
        body.appendChild(h("div",{class:"eclid"},EC_LIDCAT[sport].map(function(c){var l=ecLidLista(L,c[0]);
          return h("div",{class:"eclidc"},h("b",{text:c[1]}),l.length?h("ol",null,l.map(function(x){return h("li",{class:ecLidTime(x)===abbr?"eu":null},athCell(sport,{athlete:x.athlete}),h("span",{class:"sub",text:ecLidTime(x)}),h("span",{class:"end",text:x.displayValue}))})):h("p",{class:"sub",text:"–"}))})));
        body.appendChild(ecFonte(EC_ESPN,"temporada "+r[1].rotulo))})});
    var nots=ecNoticiasPanel(sport==="nba"?"Notícias da NBA":"Notícias da NFL","Os principais acontecimentos da liga, da ESPN (em inglês).",ESPN[sport].path,8);
    return {antes:antes,meio:[estat,comp],depois:[lid,nots]}}

  /* ===== Notícias (ESPN): manchete, fonte, data e link para a matéria original ===== */
  function ecNoticias(path,n){return once("ecn-"+path+"-"+n,function(){return getJson("https://site.api.espn.com/apis/site/v2/sports/"+path+"/news?limit="+n).then(function(d){
    /* só matérias: os vídeos de melhores momentos ficam de fora */
    return (d.articles||[]).filter(function(a){return a.type!=="Media"&&!/highlights\s*$/i.test(a.headline||"")}).map(function(a){return {t:a.headline,d:a.description||"",data:a.published,link:a.links&&a.links.web&&a.links.web.href,img:(a.images||[])[0]&&a.images[0].url}}).filter(function(a){return a.t&&a.link&&a.data})})})}
  function ecNotLi(a,mod){return h("li",null,a.img?img(a.img,"nimg"):null,h("span",{class:"grow"},h("a",{class:"link",href:a.link,target:"_blank",rel:"noopener",text:a.t}),
    h("span",{class:"sub",text:(mod?mod+" · ":"")+"ESPN · "+quando(a.data)+(a.d?" · "+a.d:"")})))}
  function ecNoticiasPanel(tit,sub,path,n){
    return lazyPanel(tit,sub,function(body){return ecNoticias(path,n).then(function(l){body.innerHTML="";
      if(!l.length){body.appendChild(h("p",{class:"empty",text:"Sem notícias agora."}));return}
      body.appendChild(h("ul",{class:"wl rumores"},l.map(function(a){return ecNotLi(a)})))})})}

  /* ===== Futebol: notícias, resultados relevantes, competições e transferências ===== */
  var EC_LIGAS=[["bra.1","Brasileirão"],["conmebol.libertadores","Libertadores"],["uefa.champions","Champions League"],["eng.1","Premier League"],["esp.1","LaLiga"],["ita.1","Serie A (Itália)"]];
  var EC_TRANSF=/\btransfer|\bsign(s|ed|ing)?\b|\bjoins?\b|\bloan\b|\bdeal\b|\bcontract\b|\bmove to\b|\bbid\b/i;
  function ecDiaEspn(n){var d=new Date(Date.now()-n*864e5-3*36e5);return d.toISOString().slice(0,10).replace(/-/g,"")}
  function ecPlacares(lg){return once("ecsc-"+lg,function(){return Promise.all([0,1,2].map(function(n){return getJson("https://site.api.espn.com/apis/site/v2/sports/soccer/"+lg+"/scoreboard?dates="+ecDiaEspn(n)).then(function(d){return d.events||[]},function(){return []})})).then(function(r){
    var l=[].concat.apply([],r),vistos={};return l.filter(function(e){if(vistos[e.id])return false;vistos[e.id]=1;return true}).sort(function(a,b){return String(b.date).localeCompare(String(a.date))})})})}
  function ecJogoFut(e){var c=e.competitions[0],cs=c.competitors||[],ca=cs.filter(function(x){return x.homeAway==="home"})[0]||cs[0],fo=cs.filter(function(x){return x.homeAway==="away"})[0]||cs[1];
    function lado(x){return h("span",{class:"tn"+(x.winner?" win":"")},img((x.team.logo)||((x.team.logos||[])[0]||{}).href||"","lg sm"),x.team.shortDisplayName||x.team.displayName)}
    var est=c.status&&c.status.type||{},link=(e.links||[]).map(function(l){return l.href})[0];
    return h("li",null,h("span",{class:"grow"},h("span",null,lado(ca)," ",h("b",{text:est.state==="pre"?"×":ca.score+" – "+fo.score})," ",lado(fo)),
      h("span",{class:"sub",text:[quando(e.date),est.state==="in"?"ao vivo":est.state==="pre"?"a jogar":"encerrado"].join(" · ")})),link?ext(link,"ESPN ↗","end link"):null)}
  function ecFutebol(root){
    root.appendChild(ecNoticiasPanel("Principais notícias","Futebol no mundo, da ESPN (em inglês). Toque para ler a matéria original.","soccer/all",10));
    root.appendChild(lazyPanel("Transferências e destaques","Manchetes de transferências, contratos e empréstimos nas notícias de hoje.",function(body){
      return Promise.all([ecNoticias("soccer/all",25),ecNoticias("soccer/bra.1",15),ecNoticias("soccer/eng.1",15)]).then(function(r){body.innerHTML="";var vistos={};
        var l=[].concat.apply([],r).filter(function(a){if(vistos[a.link]||!EC_TRANSF.test(a.t+" "+a.d))return false;vistos[a.link]=1;return true}).sort(function(a,b){return String(b.data).localeCompare(String(a.data))}).slice(0,8);
        if(!l.length){body.appendChild(h("p",{class:"empty",text:"Nenhuma manchete de transferência nas notícias de hoje."}));return}
        body.appendChild(h("ul",{class:"wl rumores"},l.map(function(a){return ecNotLi(a)})))})}));
    root.appendChild(lazyPanel("Resultados relevantes","Últimos 3 dias nas principais competições.",function(body){
      return Promise.all(EC_LIGAS.map(function(x){return ecPlacares(x[0])})).then(function(r){body.innerHTML="";var algum=false;
        EC_LIGAS.forEach(function(x,i){var l=r[i].slice(0,6);if(!l.length)return;algum=true;
          body.appendChild(h("h3",{class:"dayh",text:x[1]}));body.appendChild(h("ul",{class:"wl ecfut"},l.map(ecJogoFut)))});
        if(!algum)body.appendChild(h("p",{class:"empty",text:"Nenhum jogo destas competições nos últimos 3 dias."}));
        body.appendChild(ecFonte(EC_ESPN,"últimos 3 dias"))})}));
    root.appendChild(lazyPanel("Competições","Classificação do Brasileirão; a da Premier League fica recolhida.",function(body){
      return Promise.all([["bra.1","Brasileirão"],["eng.1","Premier League"]].map(function(x){return getJson("https://site.api.espn.com/apis/v2/sports/soccer/"+x[0]+"/standings").then(function(d){return [x[1],d]},function(){return [x[1],null]})})).then(function(r){body.innerHTML="";
        r.forEach(function(x,i){var es=x[1]&&x[1].children&&x[1].children[0]&&x[1].children[0].standings.entries;if(!es)return;
          es=es.slice().sort(function(a,b){return (+ecSt(a,"rank")||99)-(+ecSt(b,"rank")||99)});
          var tb=ecTab([["#"],["Time"],["P","Pontos"],["J","Jogos"],["V"],["E"],["D"],["SG","Saldo de gols"]],es.map(function(e){var tm=e.team||{},lg=tm.logos&&tm.logos[0]&&tm.logos[0].href;
            return {c:[ecSt(e,"rank"),h("span",{class:"tn"},img(lg||"","lg sm"),tm.shortDisplayName||tm.displayName),ecSt(e,"points"),ecSt(e,"gamesPlayed"),ecSt(e,"wins"),ecSt(e,"ties"),ecSt(e,"losses"),ecSt(e,"pointDifferential")]}}),2);
          if(i===0){body.appendChild(h("h3",{class:"dayh",text:x[0]}));body.appendChild(tb)}else body.appendChild(h("details",{class:"famvals"},h("summary",{text:x[0]}),tb))});
        if(!body.children.length)body.appendChild(h("p",{class:"empty",text:"Classificações indisponíveis agora."}));
        body.appendChild(ecFonte(EC_ESPN,"classificação de hoje"))})}))}

  /* ===== Giro esportivo: as manchetes de várias modalidades, com filtro ===== */
  var EC_GIRO=[["mlb","MLB","baseball/mlb"],["nba","NBA","basketball/nba"],["nfl","NFL","football/nfl"],["fut","Futebol","soccer/all"],["ten","Tênis","tennis/atp"],["ten","Tênis","tennis/wta"],["f1","Automobilismo","racing/f1"],["mma","MMA","mma/ufc"],["out","Outros","hockey/nhl"],["out","Outros","golf/pga"]];
  function ecGiroDados(){return once("ecgiro",function(){return Promise.all(EC_GIRO.map(function(g){return ecNoticias(g[2],8).then(function(l){return l.map(function(a){a.k=g[0];a.mod=g[1];return a})},function(){return []})})).then(function(r){
    var vistos={};return [].concat.apply([],r).filter(function(a){if(vistos[a.link])return false;vistos[a.link]=1;return true}).sort(function(a,b){return String(b.data).localeCompare(String(a.data))})})})}
  function ecGiro(root){
    var ia=ecIABox({acao:"esportes.giro",foco:"geral",ctx:{data:hojeISO()},nome:"o giro do dia",fatos:ecFatosGiro});if(ia)root.appendChild(ia);
    root.appendChild(lazyPanel("Giro esportivo","As manchetes mais recentes de cada modalidade, da ESPN (em inglês), com a data e o link para a matéria original.",function(body){
      return ecGiroDados().then(function(l){body.innerHTML="";var filtro="",chips=h("div",{class:"chips nlchips"}),ul=h("ul",{class:"wl rumores"});
        function desenha(){ul.innerHTML="";var x=l.filter(function(a){return !filtro||a.k===filtro}).slice(0,40);
          if(!x.length){ul.appendChild(h("li",null,h("span",{class:"sub",text:"Sem notícias nesta modalidade agora."})));return}x.forEach(function(a){ul.appendChild(ecNotLi(a,a.mod))})}
        [["","Tudo"]].concat(EC_GIRO.filter(function(g,i){return EC_GIRO.map(function(y){return y[0]}).indexOf(g[0])===i}).map(function(g){return [g[0],g[1]]})).forEach(function(c){
          var b=h("button",{type:"button",class:"chipb"+(c[0]===filtro?" on":""),text:c[1]});
          b.onclick=function(){filtro=c[0];chips.querySelectorAll("button").forEach(function(y){y.classList.remove("on")});b.classList.add("on");desenha()};chips.appendChild(b)});
        body.appendChild(chips);body.appendChild(ul);desenha();
        body.appendChild(ecFonte(EC_ESPN,"manchetes mais recentes","atualizado "+quando(new Date())))})}))}

  /* ===== Página central (#esportes) ===== */
  function ecTimeCard(sport,nome,href){
    var p=h("div",{class:"panel ectime"},loading());
    espnSchedule(sport).then(function(d){var t=d.team||{},f=NUCLEO.espUltimos(d.games,function(x){return x.abbr===t.abbreviation},10);p.innerHTML="";
      var fin=d.games.filter(function(g){return g.state==="post"}),u=fin[fin.length-1],nx=d.games.filter(function(g){return g.state!=="post"})[0];
      p.appendChild(h("a",{class:"ectop",href:href},img(espnLogo(sport,t),"lg"),h("span",{class:"grow"},h("b",{text:nome}),h("span",{class:"sub",text:[t.recordSummary?"Campanha "+t.recordSummary.replace("-","–"):"",standingPt(t.standingSummary)].filter(Boolean).join(" · ")}))));
      var ul=h("ul",{class:"wl"});
      if(u){var eu=u.home.abbr===t.abbreviation?u.home:u.away,ele=eu===u.home?u.away:u.home;ul.appendChild(h("li",null,h("span",{class:"grow"},h("b",{text:"Último jogo"}),h("span",{class:"sub",text:(eu.winner?"V ":"D ")+eu.score+"–"+ele.score+(eu===u.away?" em ":" vs ")+ele.name})),h("a",{class:"end",href:u.detail,text:"ver"})))}
      if(f.jogos)ul.appendChild(h("li",null,h("span",{class:"grow"},h("b",{text:"Últimos "+f.jogos}),h("span",{class:"sub",text:ecLinhaForma(f,"pts")}))));
      ul.appendChild(h("li",null,h("span",{class:"grow"},h("b",{text:"Próximo jogo"}),h("span",{class:"sub",text:nx?(nx.state==="live"?"ao vivo agora":quando(nx.date))+" · "+(nx.home.abbr===t.abbreviation?"vs "+nx.away.name:"@ "+nx.home.name):"nenhum agendado"})),nx?h("a",{class:"end",href:nx.detail,text:"ver"}):null));
      p.appendChild(ul);p.appendChild(h("p",{class:"note"},h("a",{class:"link",href:href,text:"Página completa, com estatísticas, líderes e análise →"})))
    }).catch(function(e){p.innerHTML="";p.appendChild(failed(function(){p.replaceWith(ecTimeCard(sport,nome,href))},e))});
    return p}
  /* a Central mostra primeiro o que teve atividade nas últimas 24 horas (jogo ao vivo ou terminado); o resto vem depois, do mais recente ao mais antigo.
     Nenhum time é fixo no topo: a ordem sai de NUCLEO.espCentralOrdem sobre os jogos de cada fonte. */
  function ecBlocoDodgers(){
    var dodgers=h("div",{class:"blk"},h("h2",{class:"sec",text:"Dodgers"}));
    dodgers.appendChild(dodgersBanner([["Página dos Dodgers","#esportes/beisebol/dodgers"],["MLB, liga toda","#esportes/beisebol"]]));
    var forma=h("div",{class:"stack",style:"margin-top:16px"},h("div",{class:"panel"},loading()));dodgers.appendChild(forma);
    ecMlbJogos(DODGERS).then(function(gs){forma.innerHTML="";var ia=ecIABox({acao:"esportes.analise",foco:"dodgers",ctx:{foco:"dodgers"},nome:"Dodgers",fatos:ecFatosDodgers});
      if(ia)forma.appendChild(ia);forma.appendChild(ecFormaPanel("Dodgers","corridas",ecForma(gs,function(t){return t.id===DODGERS}),EC_MLB))})
      .catch(function(e){forma.innerHTML="";forma.appendChild(h("div",{class:"panel"},failed(function(){route()},e)))});
    return dodgers}
  function ecBlocoEspn(sport,nome,href){return h("div",{class:"blk"},h("h2",{class:"sec",text:nome}),h("div",{class:"cards"},ecTimeCard(sport,nome,href)))}
  /* Destaque de cada time: o jogo mais recente que começou (ao vivo ou terminado), no mesmo cartão grande da página do time */
  function ecDestaque(nome,jogos){
    var fin=(jogos||[]).filter(function(g){return g.state!=="pre"}),g=fin[fin.length-1];
    return h("div",{class:"ecdest"},h("h3",{class:"dayh",text:nome}),g?hero(g):h("p",{class:"empty",text:nome+": a temporada ainda não começou."}))}
  function ecCentral(root){
    var TIMES=[{k:"dodgers",nome:"Dodgers",jogos:function(){return ecMlbJogos(DODGERS)},cheio:ecBlocoDodgers,compacto:dodgersSummary},
      {k:"nba",nome:"Lakers",jogos:function(){return espnSchedule("nba").then(function(d){return d.games})},cheio:function(){return ecBlocoEspn("nba","Los Angeles Lakers","#esportes/basquete")},compacto:function(){return ecBlocoEspn("nba","Los Angeles Lakers","#esportes/basquete")}},
      {k:"nfl",nome:"Packers",jogos:function(){return espnSchedule("nfl").then(function(d){return d.games})},cheio:function(){return ecBlocoEspn("nfl","Green Bay Packers","#esportes/futebol-americano")},compacto:function(){return ecBlocoEspn("nfl","Green Bay Packers","#esportes/futebol-americano")}}];
    /* ordem na tela: Destaques (Lakers, Dodgers e Packers), Giro, o que teve atividade nas últimas 24 horas e, por fim, o resto */
    var dest=h("div",{class:"blk"},h("h2",{class:"sec"},"Destaques",h("small",{text:"o jogo mais recente de cada time"})),h("div",{class:"stack"},loading())),
      giroBox=h("div",{class:"stack"}),rec=h("div",{class:"stack"}),dem=h("div",{class:"stack"});
    root.appendChild(dest);root.appendChild(giroBox);root.appendChild(rec);root.appendChild(dem);
    ecGiro(giroBox);
    Promise.all(TIMES.map(function(t){return t.jogos().then(function(gs){return {k:t.k,jogos:gs}},function(){return {k:t.k,jogos:null}})})).then(function(r){
      var carregados=r.filter(function(x){return x.jogos}),ord=NUCLEO.espCentralOrdem(carregados,Date.now(),24),por={},jg={};TIMES.forEach(function(t){por[t.k]=t});r.forEach(function(x){jg[x.k]=x.jogos});
      r.filter(function(x){return !x.jogos}).forEach(function(x){ord.demais.push({k:x.k,a:{ultimo:null,horasDesde:null,recente:false,aoVivo:false},semDados:true})});
      var caixa=dest.querySelector(".stack");caixa.innerHTML="";
      ord.recentes.concat(ord.demais).forEach(function(x){var t=por[x.k];
        caixa.appendChild(x.semDados?h("div",{class:"ecdest"},h("h3",{class:"dayh",text:t.nome}),h("p",{class:"empty",text:"Não consegui carregar os jogos agora."})):ecDestaque(t.nome,jg[x.k]))});
      if(ord.recentes.length){
        rec.appendChild(h("div",{class:"blk"},h("h2",{class:"sec"},"Atualizados nas últimas 24 horas",h("small",{text:"jogos ao vivo ou terminados no último dia"}))));
        ord.recentes.forEach(function(x){rec.appendChild(por[x.k].cheio())})}
      else rec.appendChild(h("div",{class:"panel"},h("p",{class:"sub",text:"Nenhum dos times (Dodgers, Lakers e Packers) jogou nas últimas 24 horas. Abaixo, do mais recente ao mais antigo."})));
      if(ord.demais.length){
        dem.appendChild(h("div",{class:"blk"},h("h2",{class:"sec"},ord.recentes.length?"Sem jogos nas últimas 24 horas":"Últimas atividades",h("small",{text:"do jogo mais recente ao mais antigo"}))));
        ord.demais.forEach(function(x){var t=por[x.k];
          dem.appendChild(h("p",{class:"sub",style:"margin:0 0 -8px"},t.nome+(x.semDados?": não consegui carregar os jogos agora.":" · último jogo "+NUCLEO.espHa(x.a.horasDesde))));
          dem.appendChild(t.compacto())})}
    }).catch(function(e){var c=dest.querySelector(".stack");c.innerHTML="";c.appendChild(h("div",{class:"panel"},failed(function(){route()},e)))})}
  /* entrada das rotas novas (js/app.js): central, futebol e giro */
  function renderCentral(sp){
    var root=document.getElementById("esc-view");root.innerHTML="";
    if(sp==="futebol"){ecFutebol(root);return}
    root.appendChild(h("div",{class:"panel"},loading()));
    mlbTemporada().then(function(){var s=location.hash.split("/")[1]||"";if(["beisebol","basquete","futebol-americano","futebol"].indexOf(s)>=0)return;root.innerHTML="";ecCentral(root)})}

  /* ===== Pacotes de fatos da IA: só o que veio das fontes, com fonte e período escritos pelo sistema ===== */
  function ecFatosForma(F,f,nome,un,fonte){
    var r=f.rec,a=f.ant;if(!r.jogos)return;
    F.push({texto:"Últimos "+r.jogos+" jogos terminados de "+nome+" ("+ecDMA(r.inicio)+" a "+ecDMA(r.fim)+"): "+ecVD(r.v,r.d)+""+(r.e?" e "+r.e+" empates":"")+"; "+ecNum(r.mediaPro)+" "+un+" a favor e "+ecNum(r.mediaContra)+" contra por jogo; saldo de "+ecSinal(r.saldo)+"; sequência atual de "+ecSeq(r.seq)+".",fonte:fonte,periodo:r.inicio+" a "+r.fim,grupo:"forma"});
    if(a.jogos)F.push({texto:"Os "+a.jogos+" jogos anteriores de "+nome+" ("+ecDMA(a.inicio)+" a "+ecDMA(a.fim)+"): "+ecVD(a.v,a.d)+""+(a.e?" e "+a.e+" empates":"")+"; "+ecNum(a.mediaPro)+" "+un+" a favor e "+ecNum(a.mediaContra)+" contra por jogo; saldo de "+ecSinal(a.saldo)+".",fonte:fonte,periodo:a.inicio+" a "+a.fim,grupo:"forma"});
    if(f.cmp)F.push({texto:"Variação por jogo, dos "+a.jogos+" anteriores para os últimos "+r.jogos+" (calculada pelo sistema): "+un+" a favor "+ecSinalN(f.cmp.pro)+", "+un+" contra "+ecSinalN(f.cmp.contra)+".",fonte:"cálculo do RAC sobre "+fonte,periodo:a.inicio+" a "+r.fim,grupo:"forma"});
    r.lista.forEach(function(j){F.push({texto:ecDMA(j.data)+": "+nome+" "+j.pro+" x "+j.contra+" "+j.adversario+" ("+ecRes(j.res)+", "+(j.casa?"em casa":"fora")+").",fonte:fonte,periodo:j.data,grupo:"jogos"})})}
  function ecFatosDodgers(){
    var F=[],tp="temporada "+SEASON;
    return Promise.all([ecMlbJogos(DODGERS),ecMlbStd().catch(ecNada),ecMlbTimes("hitting").catch(ecNada),ecMlbTimes("pitching").catch(ecNada),mlbPosTemporada(DODGERS).catch(ecNada),
      api("/transactions?teamId="+DODGERS+"&startDate="+ymd(addDays(new Date(),-30))+"&endDate="+ymd(new Date())).catch(ecNada)]).then(function(r){
      var f=ecForma(r[0],function(t){return t.id===DODGERS});
      F.push({texto:"Temporada "+SEASON+" da MLB, fase atual: "+MLB_TEMP.faseNome+" (pelas datas oficiais da MLB).",fonte:EC_MLB,periodo:tp,grupo:"temporada"});
      var eu=ecStdTime(r[1],DODGERS);
      if(eu)F.push({texto:"Dodgers na temporada regular "+SEASON+": "+ecVD(eu.wins,eu.losses)+", "+eu.divisionRank+"º lugar na NL Oeste, saldo de corridas de "+ecSinal(eu.runDifferential)+", últimos 10 da temporada regular "+ecDezUlt(eu)+".",fonte:EC_MLB,periodo:tp,grupo:"campanha"});
      var ds=NUCLEO.mlbDesfecho(r[4]||[],DODGERS);if(ds)F.push({texto:ecDesfechoTexto(ds,"Dodgers"),fonte:EC_MLB,periodo:"pós-temporada "+SEASON,grupo:"campanha"});
      ecFatosForma(F,f,"Dodgers","corridas",EC_MLB);
      function est(splits,lista,tit){var x=(splits||[]).filter(function(s){return s.team.id===DODGERS})[0];if(!x)return;
        F.push({texto:tit+" dos Dodgers na temporada regular "+SEASON+": "+lista.map(function(k){var p=ecPos(splits,DODGERS,k[0],k[3]);return k[1]+" "+x.stat[k[0]]+(p?" ("+p.pos+"º de "+p.de+" na MLB)":"")}).join(", ")+".",fonte:EC_MLB,periodo:tp,grupo:"estatisticas"})}
      est(r[2],EC_MLB_REB,"Rebatida");est(r[3],EC_MLB_ARR,"Arremesso");
      var div=(r[1]||[]).filter(function(x){return (x.teamRecords||[]).some(function(t){return t.team.id===DODGERS})})[0];
      if(div)div.teamRecords.forEach(function(t){if(t.team.id===DODGERS)return;
        function st(l,k){var s=(l||[]).filter(function(x){return x.team.id===t.team.id})[0];return s&&s.stat?s.stat[k]:null}
        F.push({texto:"Rival da NL Oeste, "+t.team.name+": "+ecVD(t.wins,t.losses)+" ("+t.divisionRank+"º), saldo de corridas de "+ecSinal(t.runDifferential)+(st(r[2],"ops")?", OPS "+st(r[2],"ops"):"")+(st(r[3],"era")?", ERA "+st(r[3],"era"):"")+".",fonte:EC_MLB,periodo:tp,grupo:"divisao"})});
      ((r[5]&&r[5].transactions)||[]).filter(function(x){return !MINOR.test(x.description||"")}).sort(function(a,b){return String(b.date).localeCompare(String(a.date))}).slice(0,5).forEach(function(x){
        F.push({texto:"Movimentação oficial em "+ecDMA(x.date)+": "+ptTx(x.description),fonte:EC_MLB+" (transações)",periodo:x.date,grupo:"elenco"})});
      return ecMlbFase(DODGERS,f.rec).catch(ecNada).then(function(z){
        if(z){z.reb.forEach(function(x){var s=x.h;F.push({texto:x.p.fullName+" nos jogos de "+ecDMA(z.inicio)+" a "+ecDMA(z.fim)+": "+s.plateAppearances+" aparições ao bastão, AVG "+s.avg+", OBP "+s.obp+", SLG "+s.slg+", OPS "+s.ops+", "+s.homeRuns+" HR, "+s.rbi+" RBI.",fonte:EC_MLB,periodo:z.inicio+" a "+z.fim,grupo:"jogadores"})});
          z.arr.forEach(function(x){var s=x.a;F.push({texto:x.p.fullName+" (arremessador) nos jogos de "+ecDMA(z.inicio)+" a "+ecDMA(z.fim)+": "+s.inningsPitched+" entradas, ERA "+s.era+", WHIP "+s.whip+", "+s.strikeOuts+" strikeouts, "+s.baseOnBalls+" walks.",fonte:EC_MLB,periodo:z.inicio+" a "+z.fim,grupo:"jogadores"})})}
        return F})})}
  function ecFatosEspn(sport,t,games){
    var F=[],abbr=t.abbreviation,nome=t.shortDisplayName||t.displayName,un="pontos",liga=sport.toUpperCase();
    return Promise.all([ecEspnTemp(sport),ecEspnStats(sport,abbr).catch(ecNada),espnStandings(sport).catch(ecNada),ecEspnLideres(sport).catch(ecNada),espn(sport,"/news?team="+t.id+"&limit=5").catch(ecNada)]).then(function(r){
      var tp=r[0],per="temporada "+tp.rotulo;
      F.push({texto:"Temporada "+tp.rotulo+" da "+liga+", fase atual: "+tp.faseNome+(tp.estimada?" (estimada pelo calendário)":" (pela ESPN)")+".",fonte:EC_ESPN,periodo:per,grupo:"temporada"});
      if(t.recordSummary)F.push({texto:nome+": campanha "+t.recordSummary+(t.standingSummary?", "+standingPt(t.standingSummary):"")+".",fonte:EC_ESPN,periodo:per,grupo:"campanha"});
      ecFatosForma(F,ecForma(games,function(x){return x.abbr===abbr}),nome,un,EC_ESPN);
      if(r[1]){var m=r[1],l=EC_ESTAT[sport].filter(function(x){return m[x[0]]}).map(function(x){return x[1].toLowerCase()+" "+m[x[0]].displayValue});
        if(l.length)F.push({texto:"Estatísticas do "+nome+" na temporada: "+l.join("; ")+".",fonte:EC_ESPN,periodo:per,grupo:"estatisticas"})}
      var rv=r[2]&&ecEspnRivais(sport,r[2],abbr);
      if(rv)rv.l.slice(0,sport==="nba"?8:4).concat(rv.l.filter(function(e,i){return i>=(sport==="nba"?8:4)&&e.team.abbreviation===abbr})).forEach(function(e){var tm=e.team||{};
        F.push({texto:rv.nome+", "+(rv.l.indexOf(e)+1)+"º "+(tm.displayName||"")+": "+ecVD(ecSt(e,"wins"),ecSt(e,"losses"))+", "+(sport==="nba"?"média de "+ecSt(e,"avgPointsFor")+" pontos a favor e "+ecSt(e,"avgPointsAgainst")+" contra, últimos 10 "+ecSt(e,"Last Ten Games"):ecSt(e,"pointsFor")+" pontos a favor e "+ecSt(e,"pointsAgainst")+" contra, sequência "+ecSt(e,"streak"))+".",fonte:EC_ESPN,periodo:"classificação de "+hojeISO(),grupo:"rivais"})});
      if(r[3])EC_LIDCAT[sport].forEach(function(c){ecLidLista(r[3],c[0]).forEach(function(x,i){if(ecLidTime(x)!==abbr)return;
        F.push({texto:(x.athlete&&x.athlete.displayName||"")+" ("+abbr+") é o "+(i+1)+"º da "+liga+" em "+c[1].toLowerCase()+": "+x.displayValue+".",fonte:EC_ESPN+" (líderes)",periodo:per,grupo:"jogadores"})})});
      ((r[4]&&r[4].articles)||[]).slice(0,5).forEach(function(a){if(a.headline&&a.published)F.push({texto:"Manchete da ESPN em "+ecDMA(NUCLEO.espDia(a.published))+": "+a.headline,fonte:EC_ESPN+" (notícias)",periodo:NUCLEO.espDia(a.published),grupo:"noticias"})});
      return F})}
  function ecFatosGiro(){
    var F=[],hj=hojeISO();
    return Promise.all([ecGiroDados(),espnSchedule("nba").catch(ecNada),espnSchedule("nfl").catch(ecNada),ecMlbJogos(DODGERS).catch(ecNada),espnStandings("nba").catch(ecNada),espnStandings("nfl").catch(ecNada),ecMlbStd().catch(ecNada)]).then(function(r){
      var por={};r[0].forEach(function(a){if((por[a.k]||0)>=4||F.length>=26)return;por[a.k]=(por[a.k]||0)+1;
        F.push({texto:"Manchete de "+a.mod+" (ESPN, "+ecDMA(NUCLEO.espDia(a.data))+"): "+a.t,fonte:EC_ESPN+" (notícias)",periodo:NUCLEO.espDia(a.data),grupo:"noticias"})});
      function ult(nome,gs,meu,fonte){var f=NUCLEO.espUltimos(gs||[],meu,1);if(f.jogos){var j=f.lista[0];F.push({texto:"Último jogo de "+nome+", em "+ecDMA(j.data)+": "+j.pro+" x "+j.contra+" contra "+j.adversario+" ("+ecRes(j.res)+").",fonte:fonte,periodo:j.data,grupo:"times"})}}
      if(r[3])ult("Dodgers",r[3],function(t){return t.id===DODGERS},EC_MLB);
      if(r[1])ult("Lakers",r[1].games,function(x){return x.abbr===r[1].team.abbreviation},EC_ESPN);
      if(r[2])ult("Packers",r[2].games,function(x){return x.abbr===r[2].team.abbreviation},EC_ESPN);
      /* equipes em melhor fase: as 3 melhores campanhas nos últimos 10 (NBA) e no aproveitamento (NFL); MLB só durante a temporada */
      if(r[4]){var nb=[];(r[4].children||[]).forEach(function(c){nb=nb.concat(c.standings.entries)});
        nb.map(function(e){var u=ecSt(e,"Last Ten Games").split("-");return [e,+u[0]||0]}).sort(function(a,b){return b[1]-a[1]}).slice(0,3).forEach(function(x){
          F.push({texto:"NBA, melhores campanhas recentes: "+x[0].team.displayName+" com "+ecSt(x[0],"Last Ten Games")+" no recorte de até 10 últimos jogos da ESPN (campanha "+ecSt(x[0],"wins")+"–"+ecSt(x[0],"losses")+").",fonte:EC_ESPN,periodo:"classificação de "+hj,grupo:"fase"})})}
      if(r[5]){var nf=[];(r[5].children||[]).forEach(function(c){(c.children||[]).forEach(function(d){nf=nf.concat(d.standings.entries)})});
        nf.sort(function(a,b){return (+ecSt(b,"winPercent")||0)-(+ecSt(a,"winPercent")||0)}).slice(0,3).forEach(function(e){
          F.push({texto:"NFL, melhores campanhas: "+e.team.displayName+" com "+ecVD(ecSt(e,"wins"),ecSt(e,"losses"))+", sequência "+ecSt(e,"streak")+".",fonte:EC_ESPN,periodo:"classificação de "+hj,grupo:"fase"})})}
      if(r[6]&&MLB_TEMP.fase==="regular"){var ml=[];r[6].forEach(function(x){ml=ml.concat(x.teamRecords||[])});
        ml.sort(function(a,b){return (+ecDezUlt(b).split("–")[0]||0)-(+ecDezUlt(a).split("–")[0]||0)}).slice(0,3).forEach(function(t){
          F.push({texto:"MLB, melhores campanhas recentes: "+t.team.name+" com "+ecDezUlt(t)+" nos últimos 10 jogos.",fonte:EC_MLB,periodo:"temporada "+SEASON,grupo:"fase"})})}
      return F})}

  /* ===== Análise com IA (RAC Intelligence): sob demanda, um toque; o servidor decide o modo (hoje só DEMO para a Central) =====
     Mesma infraestrutura de sempre: racIA(), chave de idempotência pelos fatos (a mesma análise nunca é paga duas vezes),
     orçamento e registro no servidor. O cache deste aparelho guarda só análises REAIS, para mostrar de novo sem chamar. */
  function ecLer(k){try{return JSON.parse(localStorage.getItem(k)||"{}")||{}}catch(e){return {}}}
  function ecGravar(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
  var EC_TIPOS={destaque:"Destaque",tendencia:"Tendência",atencao:"Atenção",comparacao:"Comparação"};
  function ecFatosLista(fatos){return h("ul",{class:"wl ecfatos"},fatos.map(function(f){return h("li",null,h("span",{class:"vp",text:f.id}),h("span",{class:"grow"},h("span",{text:f.texto}),h("span",{class:"sub",text:[f.fonte,f.periodo].filter(Boolean).join(" · ")})))}))}
  /* período dos fatos: do dia mais antigo ao mais recente, mais os rótulos sem data (ex.: temporada 2026) */
  function ecPeriodo(l){var ds=[],outros=[];(l||[]).forEach(function(p){var m=String(p).match(/\d{4}-\d{2}-\d{2}/g);if(m)ds=ds.concat(m);else if(outros.indexOf(p)<0)outros.push(p)});
    ds.sort();return (ds.length?(ds[0]===ds[ds.length-1]?ecDMA(ds[0]):ecDMA(ds[0])+" a "+ecDMA(ds[ds.length-1])):"").concat(ds.length&&outros.length?" · ":"",outros.join(" · "))||"—"}
  function ecMeta(meta){return h("p",{class:"note ecmeta",text:"Período: "+ecPeriodo(meta.periodos)+
    " · Fontes: "+(meta.fontes.join(", ")||"—")+" · Dados de "+quando(meta.atualizado)+" · "+meta.fatos+" fatos enviados. Período, fontes e horário são do sistema, não da IA."})}
  function ecAnalise(res,demo,meta,fatos){
    var ap=NUCLEO.espAplicarIA(res,{fatos:fatos});
    if(!ap.ok)return h("p",{class:"sub",text:"A resposta não pôde ser mostrada ("+ap.motivo+"). Nada foi aproveitado."});
    function usados(l){return h("details",{class:"famvals"},h("summary",{text:"Fatos usados ("+l.length+")"}),ecFatosLista(l))}
    var box=h("div",{class:"ecanalise"+(demo?" iaprevia":"")});
    if(demo)box.appendChild(h("p",{class:"iademo",text:"DEMONSTRAÇÃO · análise simulada, não veio do Claude."}));
    box.appendChild(h("h3",{class:"dayh",text:ap.titulo||"Análise"}));
    box.appendChild(h("p",{text:ap.resumo.texto}));box.appendChild(usados(ap.resumo.fatos));
    if(ap.pontos.length)box.appendChild(h("ul",{class:"wl ecpontos"},ap.pontos.map(function(p){return h("li",null,h("span",{class:"grow"},h("span",{class:"ectipo ec-"+p.tipo,text:EC_TIPOS[p.tipo]||p.tipo}),h("span",{text:p.texto}),usados(p.fatos)))})));
    if(ap.insuficiente.length)box.appendChild(h("div",null,h("b",{text:"O que os dados não permitem dizer"}),h("ul",{class:"clean"},ap.insuficiente.map(function(t){return h("li",{text:t})}))));
    box.appendChild(ecMeta(meta));return box}
  function ecIABox(o){
    if(!iaLigada()||!isOwner())return null;
    var st=h("p",{class:"sub",role:"status"}),saida=h("div"),mais=h("div"),dados=h("div");
    var b=h("button",{type:"button",class:"ghostbtn pri",text:"✨ Analisar "+o.nome+" com IA"}),ver=h("button",{type:"button",class:"ghostbtn",text:"Ver os dados que serão enviados"});
    function montar(){return o.fatos().then(function(l){var p=NUCLEO.espFatos(l);p.quando=new Date().toISOString();return p})}
    function meta(p){return {fontes:p.fontes,periodos:p.periodos,atualizado:p.quando,fatos:p.fatos.length}}
    ver.onclick=function(){if(ver.disabled)return;ver.disabled=true;dados.innerHTML="";dados.appendChild(loading());
      montar().then(function(p){ver.disabled=false;dados.innerHTML="";
        dados.appendChild(h("details",{class:"famvals",open:""},h("summary",{text:p.fatos.length+" fatos, tirados agora das fontes"}),ecFatosLista(p.fatos),ecMeta(meta(p))))})
      .catch(function(e){ver.disabled=false;dados.innerHTML="";dados.appendChild(h("p",{class:"sub",text:"Não consegui juntar os dados: "+e.message}))})};
    b.onclick=function(){
      if(b.disabled)return;b.disabled=true;st.textContent="Juntando os dados das fontes…";saida.innerHTML="";mais.innerHTML="";
      montar().then(function(p){
        if(p.fatos.length<3){b.disabled=false;st.textContent="Dados insuficientes para uma análise ("+p.fatos.length+" fato"+(p.fatos.length===1?"":"s")+" disponível). Nada foi enviado à IA.";return}
        var base=NUCLEO.espChaveIA(o.acao,o.foco,p.texto),tn=ecLer(EC_TENT)[base]||0,k=tn?base+"-"+(tn+1):base,cc=ecLer(EC_CACHE)[k];
        /* já analisado neste aparelho para estes mesmos fatos: mostra de novo, sem chamar */
        if(cc){b.disabled=false;st.textContent="Esta análise já foi feita em "+quando(cc.quando)+" para estes mesmos dados. Nada foi chamado de novo.";saida.appendChild(ecAnalise(cc.resultado,false,cc.meta,cc.fatos));return}
        st.textContent="Analisando com a IA…";
        return racIA("esportes",o.acao,{texto:p.texto,imagens:[]},o.ctx,k).then(function(r){b.disabled=false;
          if(r&&r.ok&&r.modo==="DEMO"){st.textContent="DEMONSTRAÇÃO: análise simulada, nada foi cobrado. A Central Esportiva funciona só em demonstração nesta fase.";saida.appendChild(ecAnalise(r.resultado,true,meta(p),p.fatos));return}
          if(r&&r.ok&&r.modo==="REAL"&&r.resultado&&!r.resultado._demo){
            var ap=NUCLEO.espAplicarIA(r.resultado,{fatos:p.fatos});
            if(!ap.ok){st.textContent="A resposta da IA não passou na conferência deste aparelho ("+ap.motivo+"). Nada foi mostrado.";return}
            var g={id:r.id,modelo:r.consumo&&r.consumo.modelo,resultado:r.resultado,meta:meta(p),fatos:p.fatos,quando:Date.now()};
            ecGravar(EC_CACHE,NUCLEO.espCacheGuardar(ecLer(EC_CACHE),k,g,8));
            var m=r.consumo&&r.consumo.mes;
            st.textContent="REAL · analisado pelo Claude, usou o orçamento de IA da casa."+((r.avisos||[]).length?" "+r.avisos.join(" "):"")+(m&&m.alerta?" ⚠ A IA já usou "+m.percentual+"% do limite do mês.":"");
            saida.appendChild(ecAnalise(r.resultado,false,g.meta,p.fatos));return}
          var cod=r&&r.erro&&r.erro.codigo;
          st.textContent=(r&&r.mensagem||"A IA não respondeu.")+(cod==="repetida"?" Estes mesmos dados já foram analisados; a análise aparece de novo quando os dados mudarem.":"")+(r&&r.estado==="incerto"&&r.id?" Id da chamada: "+r.id+".":"");
          /* chamada paga que não trouxe análise: nada se repete sozinho; repetir é um toque a mais, com confirmação */
          if(r&&r.modo==="REAL"&&r.id&&cod!=="repetida"&&cod!=="em_andamento"){
            var de=h("button",{type:"button",class:"ghostbtn",text:"Analisar de novo (nova chamada paga)"});
            de.onclick=function(){if(!confirm("Isto faz uma NOVA chamada paga à IA para os mesmos dados. Continuar?"))return;var t=ecLer(EC_TENT);t[base]=(t[base]||0)+1;ecGravar(EC_TENT,t);b.click()};
            mais.appendChild(de)}})
      }).catch(function(e){b.disabled=false;st.textContent="Não consegui analisar: "+e.message;logErro("rac-ia",e)})};
    return h("div",{class:"panel"},h("h2",{text:"Análise com IA"}),h("div",{class:"iabox ecia"},h("p",{class:"sub",text:"RAC Intelligence sobre "+o.nome+": a IA lê só os fatos tirados agora das fontes oficiais, e cada frase cita os fatos que usou. O servidor e este aparelho recusam qualquer número que não esteja nesses fatos. Período, fontes e horário são do sistema. Só acontece quando você toca no botão. Nesta fase, a Central Esportiva funciona só em DEMONSTRAÇÃO: é simulada e não custa nada."}),
      h("div",{class:"vfil"},b,ver),st,mais,saida,dados))}
