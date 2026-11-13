/* Dia a Dia RAC — módulo carregado quando a seção abre. Saúde e treinos: dados do Garmin, tendências, sono, treinos e a página de cada treino com mapa.
   Usa as funções do núcleo (js/app.js), que ficam no escopo global. */
  /* ===== Saúde e treinos: dados do relógio Garmin =====
     A função "garmin" do Supabase busca na Garmin (API pessoal oficial) e grava em garmin_dia e garmin_ativ;
     esta página lê as tabelas, mostra o dia, as tendências e os treinos, e pede uma atualização quando abre. */
  var SAUDE={dias:null,ativs:null,legado:null,relLegado:null,met:"sono",per:"30",tipo:"",mais:30,sinc:null};   /* met, per, tipo e mais: o hub (saude-hub.js) e o Painel os leem */
  var ATIV_TIPOS={running:["Corrida","🏃"],treadmill_running:["Esteira","🏃"],walking:["Caminhada","🚶"],strength_training:["Musculação","🏋️"],
    lap_swimming:["Natação","🏊"],open_water_swimming:["Águas abertas","🌊"],cycling:["Bike","🚴"],fitness_equipment:["Aparelhos","⚙️"]};
  /* esportes que não aparecem no quadro de Treinos: aparelhos, águas abertas e bike */
  var TREINO_OCULTOS=NUCLEO.TREINO_OCULTOS;
  function ativTipo(t){return ATIV_TIPOS[t]||[t.replace(/_/g," "),"•"]}
  function hmDur(seg){if(seg==null)return "—";var m=Math.round(seg/60);return Math.floor(m/60)+"h"+String(m%60).padStart(2,"0")}
  function durTxt(seg){var m=Math.round(seg/60);return m<60?m+" min":Math.floor(m/60)+"h"+String(m%60).padStart(2,"0")}
  /* ritmo pelo tempo em movimento (numa caminhada com paradas, o tempo total daria um ritmo irreal) */
  function ritmo(a){var d=a.dados,v=d.emMovimento&&d.distancia?d.distancia/d.emMovimento:d.velocidade;if(!v||!d.distancia)return "";
    if(/running|walking/.test(a.tipo)){var s=1000/v,m=Math.floor(s/60);return m+":"+String(Math.round(s%60)).padStart(2,"0")+" /km"}
    if(/swimming/.test(a.tipo)){var s2=100/v;return Math.floor(s2/60)+":"+String(Math.round(s2%60)).padStart(2,"0")+" /100 m"}
    return fmtN(Math.round(v*36)/10)+" km/h"}
  function distTxt(a){var m=a.dados.distancia;if(!m)return "";return /swimming/.test(a.tipo)?fmtN(Math.round(m))+" m":fmtN(Math.round(m/10)/100)+" km"}
  /* o que cada métrica mostra: [chave, nome, como ler do dia, formato, cor, maior é melhor?] */
  var SAUDE_MET=[
    ["sono","Sono",function(d){return d.sono&&d.sono.total?d.sono.total/3600:null},function(v){return hmDur(v*3600)},"#5B5BD6",true],
    ["nota","Nota do sono",function(d){return d.sono&&d.sono.nota},function(v){return Math.round(v)},"#7C6FE0",true],
    ["vfc","Variabilidade cardíaca",function(d){return d.vfc&&d.vfc.noite},function(v){return Math.round(v)+" ms"},"#0E8A6A",true],
    ["fc","Batimentos em repouso",function(d){return d.fcRepouso},function(v){return Math.round(v)+" por minuto"},"#D6283B",false],
    ["bb","Energia do corpo",function(d){return d.bbMax},function(v){return Math.round(v)},"#2E8BD8",true],
    ["estresse","Estresse",function(d){return d.estresse},function(v){return Math.round(v)},"#E8A317",false],
    ["passos","Passos",function(d){return d.passos},function(v){return Math.round(v).toLocaleString("pt-BR")},"#B5641B",true],
    ["humor","Humor (diário)",function(d){return d.humor},function(v){return HUMOR[Math.round(v)-1]+" "+fmtN(Math.round(v*10)/10)},"#D9468F",true]];
  /* diário de uma linha: humor de 1 a 5 e uma frase por dia, em PESSOAL.diario {"AAAA-MM-DD": {h, t}} */
  var HUMOR=["😞","🙁","😐","🙂","😄"];
  /* Marco de propriedade (DS-4.2): o relógio foi comprado usado. Registros com data anterior a NUCLEO.SAU_MARCO.data (01/01/2026, inclusive) são
     "legado": ficam no banco e no backup, mas não entram em análise nenhuma. A regra é só a data do evento (NUCLEO.sauClassificar). Nada é apagado:
     o corte antigo (01/11/2025), que apagava dados ao abrir a Saúde, foi removido. */
  /* o que cada número quer dizer, sem sigla */
  function saudeGlossario(){
    var G=[["Prontidão","Nota do site, de 0 a 100: compara a variabilidade cardíaca, os batimentos em repouso, o sono e a energia do corpo de hoje com o seu normal dos últimos 60 dias."],
      ["Variabilidade cardíaca","Em inglês, heart rate variability (HRV). É a variação do tempo entre um batimento e outro, medida durante o sono, em milissegundos (ms). Acima do seu normal = corpo recuperado; bem abaixo = cansaço, estresse, álcool ou doença chegando."],
      ["Batimentos em repouso","Em inglês, resting heart rate. A média mais baixa de batimentos por minuto no dia. Cinco ou mais acima do seu normal costuma ser sinal de cansaço."],
      ["Energia do corpo","Em inglês, Body Battery (0 a 100). Estimativa da Garmin da energia que você tem: carrega dormindo e descansando, gasta com esforço e estresse."],
      ["Estresse","De 0 a 100, calculado pela variabilidade cardíaca ao longo do dia: até 25 é descanso, de 26 a 50 é baixo, acima de 50 é alto."],
      ["Oxigênio no sangue","Em inglês, pulse oximetry (SpO2). Porcentagem de oxigênio no sangue, medida à noite. O normal é acima de 95%."],
      ["Efeito aeróbico e anaeróbico","Em inglês, training effect (0 a 5). Quanto o treino melhorou o condicionamento: de 2 a 3 mantém, de 3 a 4 melhora, acima de 4 é muito puxado."],
      ["Carga de exercício","Em inglês, training load. Soma da intensidade e da duração do treino; quanto maior, mais o corpo precisa para se recuperar."],
      ["Faixas de batimentos","Em inglês, heart rate zones: de 1 (leve, aquecimento) a 5 (esforço máximo), pela porcentagem dos seus batimentos máximos."],
      ["Idade do condicionamento físico","Em inglês, fitness age. A idade que o seu condicionamento aparenta, comparada com a média das pessoas."]];
    return h("details",{class:"famvals"},h("summary",{text:"O que significa cada número"}),h("dl",{class:"glos"},G.map(function(g){return [h("dt",{text:g[0]}),h("dd",{text:g[1]})]}).reduce(function(a,b){return a.concat(b)},[])))}
  /* a leitura é a da fonte única (saudeLer, js/fonte-saude.js); aqui só guarda o resultado no estado da tela */
  function saudeCarregar(){
    return saudeLer().then(function(x){SAUDE.dias=x.dias;SAUDE.ativs=x.ativs;SAUDE.legado=x.legado})}
  /* botão de atualizar: relê do banco os dias e os treinos (o que o relógio já mandou) e só troca com as duas leituras. Não sincroniza
     com o Garmin: isso é o "Atualizar agora" daqui. Enquanto ele roda, o ↻ espera. O filtro, o período e a métrica ficam em SAUDE */
  atuModulo("saude",{
    buscar:function(){return atuLer(saudeLer).then(function(r){return {relogio:r}})},
    antes:function(){return SAUDE.dias?{relogio:{ok:true}}:{}},
    trocar:function(n){SAUDE.dias=n.relogio.v.dias;SAUDE.ativs=n.relogio.v.ativs;SAUDE.legado=n.relogio.v.legado},
    ocupado:function(){return SAUDE.sinc?"a sincronização com o relógio Garmin":""}});
  /* uma chamada à função "garmin" para a medição e a recuperação do histórico (a sincronização abaixo tem a sua, que não foi tocada) */
  function saudeChamar(corpo){return SB.functions.invoke("garmin",{body:corpo}).then(function(r){
      if(r.error){var c=r.error.context;return (c&&c.json?c.json().catch(function(){return {}}):Promise.resolve({})).then(function(j){throw new Error(j.erro||r.error.message)})}
      if(r.data&&r.data.erro)throw new Error(r.data.erro);return r.data})}
  /* Recuperação do histórico anterior à posse (DS-4.2, M4). Só a pedido do dono, na tela. contar=true só MEDE (a função não grava nada);
     contar=false grava só o que ainda não existe (somenteNovos: nunca sobrescreve nem apaga uma linha). Devolve, por mês, quantos dias e treinos a
     Garmin devolveu e quantos eram novos; o que a Garmin não devolver fica sem registro (nada é inventado). */
  function saudeRecuperar(contar,st){
    var M=NUCLEO.SAU_MARCO.data,fimMes=M.slice(0,7),rel={dias:{},ativs:{},novosDias:0,novosAtivs:0},flags=contar?{apenasContar:true}:{somenteNovos:true};
    function junta(dest,pm){Object.keys(pm||{}).forEach(function(k){if(k>=fimMes)return;var o=dest[k]=dest[k]||{garmin:0,novos:0};o.garmin+=pm[k].garmin;o.novos+=pm[k].novos})}
    function total(pm){return Object.keys(pm||{}).reduce(function(s,k){return s+pm[k].garmin},0)}
    function ativs(ini){st("Treinos"+(contar?" (medindo)":" (gravando)")+"… "+ini+" já vistos");
      return saudeChamar(Object.assign({tipo:"ativ",inicio:ini,completo:true},flags)).then(function(d){junta(rel.ativs,d.porMes);rel.novosAtivs+=d.salvas||0;if(d.mais)return ativs(d.inicio)})}
    /* dias: janelas de 112 dias para trás, a partir do dia anterior ao marco; para depois de 4 janelas seguidas sem nenhum dia na Garmin */
    function dias(fim,vazias){var ini=NUCLEO.somaDiasISO(fim,-111);if(vazias>=4||ini<"2016-01-01")return Promise.resolve();
      st("Dias"+(contar?" (medindo)":" (gravando)")+"… "+dataBR(ini)+" a "+dataBR(fim));
      return saudeChamar(Object.assign({tipo:"dias",desde:ini,ate:fim},flags)).then(function(d){junta(rel.dias,d.porMes);rel.novosDias+=d.salvos||0;
        return dias(NUCLEO.somaDiasISO(ini,-1),total(d.porMes)?0:vazias+1)})}
    /* trava de segurança: a função "garmin" antiga não conhece estes modos e GRAVARIA por cima. A chamada abaixo (só hoje, só contagem) é inofensiva
       nela (vira uma sincronização comum de hoje) e a resposta sem "porMes" a denuncia: aí nada do histórico é pedido */
    function versao(){return saudeChamar({tipo:"dias",desde:hojeISO(),ate:hojeISO(),apenasContar:true}).then(function(d){
      if(!d||!d.porMes)throw new Error("a função garmin publicada ainda é a versão antiga (não sabe medir nem recuperar sem sobrescrever); publique a nova antes")})}
    return versao().then(function(){return dias(NUCLEO.somaDiasISO(M,-1),0)}).then(function(){return ativs(0)}).then(function(){return rel})}
  /* pede à função "garmin" o que é novo (dias e depois treinos), em rodadas até não ter mais */
  function saudeSincronizar(st){
    function chamar(corpo){return SB.functions.invoke("garmin",{body:corpo}).then(function(r){
      if(r.error){var c=r.error.context;return (c&&c.json?c.json().catch(function(){return {}}):Promise.resolve({})).then(function(j){throw new Error(j.erro||r.error.message)})}
      if(r.data&&r.data.erro)throw new Error(r.data.erro);return r.data})}
    var n=0;
    function dias(){st("Buscando no relógio… (dias)");return chamar({tipo:"dias"}).then(function(d){n+=d.salvos||0;if(d.mais)return dias()})}
    function ativs(ini){st("Buscando no relógio… (treinos)");return chamar({tipo:"ativ",inicio:ini||0}).then(function(d){if(d.mais)return ativs(d.inicio)})}
    return dias().then(function(){return ativs(0)})}
  /* a página #saude (renderSaude) é o hub com abas, em js/saude-hub.js; a página do treino abaixo continua aqui */

  /* ===== Um treino aberto (#saude/treino/<id>): mapa, números, gráficos, zonas, voltas e séries =====
     O detalhe vem da função "garmin" ({tipo:"detalhe"}) e fica guardado enquanto a página estiver aberta. */
  var TREINO_DET={},LEAFLET_JS="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js",LEAFLET_CSS="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
  function carregarLeaflet(){
    if(window.L)return Promise.resolve();
    if(!document.querySelector('link[href="'+LEAFLET_CSS+'"]'))document.head.appendChild(h("link",{rel:"stylesheet",href:LEAFLET_CSS}));
    return new Promise(function(ok,erro){var s=document.createElement("script");s.src=LEAFLET_JS;s.onload=ok;s.onerror=function(){erro(new Error("mapa indisponível"))};document.head.appendChild(s)})}
  function hms(seg){if(seg==null)return "—";seg=Math.round(seg);var h2=Math.floor(seg/3600),m=Math.floor(seg%3600/60),s=seg%60;return (h2?h2+":"+String(m).padStart(2,"0"):m)+":"+String(s).padStart(2,"0")}
  function ritmoDe(v,tipo){if(!v)return "—";if(/swimming/.test(tipo)){var s2=100/v;return hms(s2)+" /100 m"}if(/running|walking|hiking/.test(tipo))return hms(1000/v)+" /km";return fmtN(Math.round(v*36)/10)+" km/h"}
  /* cor da rota pela velocidade: azul (mais lento) → verde → amarelo → vermelho (mais rápido), como no Connect */
  function corVel(f){var c=[[33,102,204],[40,170,90],[240,200,40],[230,60,40]],x=Math.max(0,Math.min(.999,f))*(c.length-1),i=Math.floor(x),t=x-i,a=c[i],b=c[i+1];
    return "rgb("+a.map(function(v,k){return Math.round(v+(b[k]-v)*t)}).join(",")+")"}
  /* gráfico de linha com área, em SVG; tocar/passar o mouse mostra o valor */
  function grafTreino(serie,campo,rot,cor,fmt,inverter){
    var pts=serie.filter(function(p){return p[campo]!=null&&(campo!=="vel"||p.vel>0.05)});if(pts.length<5)return null;
    var W=640,H=150,vs=pts.map(function(p){return p[campo]}),mn=Math.min.apply(null,vs),mx=Math.max.apply(null,vs),tm=pts[pts.length-1].t||1;
    if(mx===mn)mx=mn+1;var pad=(mx-mn)*.08;mn-=pad;mx+=pad;
    function X(t){return (t/tm*W).toFixed(1)}function Y(v){var f=(v-mn)/(mx-mn);return (inverter?f*H:H-f*H).toFixed(1)}
    var linha=pts.map(function(p,i){return (i?"L":"M")+X(p.t)+" "+Y(p[campo])}).join(" ");
    var media=vs.reduce(function(s,x){return s+x},0)/vs.length;
    var svg='<svg viewBox="0 0 '+W+' '+(H+18)+'" preserveAspectRatio="none" class="tgraf"><path d="'+linha+" L"+X(tm)+" "+(inverter?0:H)+" L0 "+(inverter?0:H)+' Z" fill="'+cor+'" opacity=".18"/><path d="'+linha+'" fill="none" stroke="'+cor+'" stroke-width="2" vector-effect="non-scaling-stroke"/>'+
      '<line x1="0" x2="'+W+'" y1="'+Y(media)+'" y2="'+Y(media)+'" stroke="'+cor+'" stroke-dasharray="4 4" opacity=".6" vector-effect="non-scaling-stroke"/>'+
      [0,.25,.5,.75,1].map(function(f){return '<text x="'+(f*W).toFixed(0)+'" y="'+(H+14)+'" text-anchor="'+(f===0?"start":f===1?"end":"middle")+'" class="tgt">'+hms(f*tm)+'</text>'}).join("")+
      '<line class="tcur" x1="0" x2="0" y1="0" y2="'+H+'" stroke="var(--ink)" opacity="0" vector-effect="non-scaling-stroke"/></svg>';
    var box=h("div",{class:"tgbox"}),cap=h("p",{class:"vbcap",role:"status"});
    box.innerHTML=svg;var el=box.firstChild,cur=el.querySelector(".tcur");
    /* padrão do site: o ponto tocado (ou sob o mouse) mostra o cartão destacado com o tempo de treino e o valor */
    function mostrar(ev){var r=el.getBoundingClientRect(),cx=ev.touches?ev.touches[0].clientX:ev.clientX,x=(cx-r.left)/r.width*tm,best=pts[0];
      pts.forEach(function(p){if(Math.abs(p.t-x)<Math.abs(best.t-x))best=p});cur.setAttribute("x1",X(best.t));cur.setAttribute("x2",X(best.t));cur.setAttribute("opacity",".5");
      var py=r.top+(+Y(best[campo]))/(H+18)*r.height;
      racDica.em(r.left+(+X(best.t))/W*r.width,py,hms(best.t)+" de treino",rot+": "+fmt(best[campo])+(best.dist?" · "+fmtN(Math.round(best.dist/10)/100)+" km":""))}
    el.addEventListener("mousemove",mostrar);el.addEventListener("touchmove",mostrar,{passive:true});el.addEventListener("click",function(e){e.stopPropagation();mostrar(e)});
    el.addEventListener("mouseleave",function(){racDica.fechar();cur.setAttribute("opacity","0")});
    cap.textContent="Média "+fmt(media)+" · mín "+fmt(inverter?mx-pad:mn+pad)+" · máx "+fmt(inverter?mn+pad:mx-pad);
    /* ritmo/velocidade: paradas puxam o mínimo para valores sem sentido, então mostra só média e o mais rápido */
    if(campo==="vel")cap.textContent="Média "+fmt(media)+" · mais rápido "+fmt(Math.max.apply(null,vs));
    return h("div",{class:"tgwrap"},h("h3",{class:"tgh",text:rot}),box,cap)}
  /* rota no mapa: Google Maps quando há chave (guardada na conta, em PESSOAL.googleMaps); senão OpenStreetMap */
  function rotaCores(rota){var vels=rota.map(function(p){return p[2]||0}).filter(function(v){return v>0}).sort(function(a2,b2){return a2-b2});
    var lo=vels[Math.floor(vels.length*.05)]||0,hi=vels[Math.floor(vels.length*.95)]||1;
    /* trechos seguidos com a mesma cor viram uma linha só */
    var tr=[],cor=null;for(var i=1;i<rota.length;i++){var c=corVel(Math.round(((rota[i][2]||0)-lo)/((hi-lo)||1)*12)/12);
      if(c!==cor){tr.push({cor:c,pts:[rota[i-1]]});cor=c}tr[tr.length-1].pts.push(rota[i])}return tr}
  function carregarGoogle(chave){
    if(window.google&&window.google.maps)return Promise.resolve();
    return new Promise(function(ok,erro){window.__gmOk=ok;setTimeout(function(){erro(new Error("o Google Maps não respondeu"))},10000);
      var s=document.createElement("script");s.src="https://maps.googleapis.com/maps/api/js?key="+encodeURIComponent(chave)+"&v=weekly&language=pt-BR&region=BR&callback=__gmOk";s.async=true;
      s.onerror=function(){erro(new Error("Google Maps indisponível"))};document.head.appendChild(s)})}
  function mapaRota(div,rota){
    var chave=PESSOAL.googleMaps,tr=rotaCores(rota),ini=rota[0],fim=rota[rota.length-1];
    function osm(){return carregarLeaflet().then(function(){
      var L=window.L,m=L.map(div,{scrollWheelZoom:false});
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(m);
      tr.forEach(function(t){L.polyline(t.pts.map(function(p){return [p[0],p[1]]}),{color:t.cor,weight:5,opacity:.95}).addTo(m)});
      L.circleMarker([ini[0],ini[1]],{radius:7,color:"#fff",weight:2,fillColor:"#2e9e44",fillOpacity:1}).addTo(m).bindTooltip("Início");
      L.circleMarker([fim[0],fim[1]],{radius:7,color:"#fff",weight:2,fillColor:"#d6283b",fillOpacity:1}).addTo(m).bindTooltip("Fim");
      m.fitBounds(L.latLngBounds(rota.map(function(p){return [p[0],p[1]]})),{padding:[18,18]});setTimeout(function(){m.invalidateSize()},200)})}
    if(!chave)return osm().catch(function(){div.replaceWith(h("p",{class:"sub",text:"Não consegui carregar o mapa agora."}))});
    var caiu=false;
    function cair(motivo){if(caiu)return;caiu=true;div.innerHTML="";div.className="tmapa";var av=h("p",{class:"qrwarn",text:"⚠ O Google Maps não aceitou a chave ("+motivo+"). Mostrando o OpenStreetMap."});div.parentNode.insertBefore(av,div);return osm()}
    /* a chave recusada só é avisada depois que o mapa abre: aí troca para o OpenStreetMap */
    window.gm_authFailure=function(){cair("chave recusada ou sem a Maps JavaScript API ativada")};
    return carregarGoogle(chave).then(function(){if(caiu)return;
      var g=window.google.maps,m=new g.Map(div,{mapTypeId:"roadmap",mapTypeControl:true,streetViewControl:false,fullscreenControl:true,gestureHandling:"cooperative"}),b=new g.LatLngBounds();
      tr.forEach(function(t){var path=t.pts.map(function(p){var ll={lat:p[0],lng:p[1]};b.extend(ll);return ll});new g.Polyline({path:path,strokeColor:t.cor,strokeWeight:5,strokeOpacity:.95,map:m})});
      [[ini,"#2e9e44","Início"],[fim,"#d6283b","Fim"]].forEach(function(q){new g.Marker({position:{lat:q[0][0],lng:q[0][1]},map:m,title:q[2],icon:{path:g.SymbolPath.CIRCLE,scale:7,fillColor:q[1],fillOpacity:1,strokeColor:"#fff",strokeWeight:2}})});
      m.fitBounds(b,20);
      /* se em 8 segundos o Google não desenhou nada (chave inválida, API desligada), volta para o OpenStreetMap */
      setTimeout(function(){if(!div.querySelector(".gm-style"))cair("o mapa não abriu com essa chave")},8000)
    }).catch(function(e){return cair(e.message)})}
  /* onde colar (ou trocar) a chave do Google Maps */
  function mapaConfig(redesenhar){
    var tem=!!PESSOAL.googleMaps,abrir=h("button",{type:"button",class:"ghostbtn",text:tem?"Trocar a chave do Google Maps":"Usar o Google Maps"}),f=h("div",{class:"vfil",hidden:""});
    var inp=h("input",{type:"password",placeholder:"Chave da API do Google Maps (AIza…)",autocomplete:"off","aria-label":"Chave do Google Maps"}),ok=h("button",{type:"button",text:"Salvar"}),tira=tem?h("button",{type:"button",class:"ghostbtn",text:"Voltar ao OpenStreetMap"}):null,msg=h("p",{class:"sub",role:"status"});
    abrir.onclick=function(){f.hidden=!f.hidden;if(!f.hidden)inp.focus()};
    ok.onclick=function(){var v=inp.value.trim();if(!/^AIza[\w-]{30,}$/.test(v)){msg.textContent="A chave do Google Maps começa com AIza e tem uns 39 caracteres.";return}
      ok.disabled=true;msg.textContent="Guardando…";pessoalGravar("googleMaps",v,function(e){msg.textContent=e||"✓ Chave guardada na sua conta.";setTimeout(function(){location.reload()},600)});inp.value="";f.hidden=true};
    if(tira)tira.onclick=function(){pessoalGravar("googleMaps","",function(){location.reload()})};
    f.appendChild(inp);f.appendChild(ok);if(tira)f.appendChild(tira);
    return h("div",{class:"mapcfg"},abrir,f,msg)}
  function saudeTreino(root,id){
    var a=(SAUDE.ativs||[]).filter(function(x){return String(x.id)===String(id)})[0];
    var volta=h("a",{href:"#saude/atividades",class:"ghostbtn",text:"← Atividades"});
    if(!a){root.appendChild(h("div",{class:"panel"},volta,h("p",{class:"empty",text:"Treino não encontrado."})));return}
    var T=ativTipo(a.tipo),d=a.dados;
    var topo=panel(T[1]+" "+(d.nome||T[0]),new Date(a.inicio).toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})+" às "+a.inicio.slice(11,16)+(d.local&&!NUCLEO.sauPrefs(PESSOAL.saudePrefs).esconderLocal?" · "+d.local:""));   /* o dono pode esconder o local (Saúde → Inteligência → Ajustes) */
    topo.insertBefore(h("div",{class:"vfil"},volta),topo.firstChild);root.appendChild(topo);
    var st=h("p",{class:"sub",role:"status",text:"Carregando o treino…"});topo.appendChild(st);
    var corpo=h("div",{class:"stack"});root.appendChild(corpo);
    (TREINO_DET[id]?Promise.resolve(TREINO_DET[id]):ATU.semExternos?Promise.reject(new Error("o botão de atualizar não chama o relógio; abra o treino de novo")):SB.functions.invoke("garmin",{body:{tipo:"detalhe",id:+id}}).then(function(r){
      if(r.error)throw new Error(r.error.message);if(r.data&&r.data.erro)throw new Error(r.data.erro);TREINO_DET[id]=r.data;return r.data}))
    .then(function(x){st.remove();desenharTreino(x)}).catch(function(e){logErro("treino",e,{id:id});st.textContent="Não consegui carregar os detalhes ("+e.message+"). Os números abaixo vêm do resumo.";desenharTreino({resumo:{},serie:[],rota:[],voltas:[],series:[]})});
    function desenharTreino(x){
      var r=x.resumo||{},tipo=a.tipo,nado=/swimming/.test(tipo);
      /* mapa da rota */
      if((x.rota||[]).length>1){
        var mp=panel("Percurso"),div=h("div",{class:"tmapa"}),leg=h("div",{class:"tleg"},h("span",{text:"Mais lento"}),h("i"),h("span",{text:"Mais rápido"}));
        mp.appendChild(div);mp.appendChild(leg);corpo.appendChild(mp);
        mapaRota(div,x.rota);
        mp.appendChild(mapaConfig(function(){div.innerHTML="";mapaRota(div,x.rota)}))}
      /* números */
      var dist=r.distance||d.distancia,mov=r.movingDuration||d.emMovimento,dur=r.duration||d.duracao,velMov=r.averageMovingSpeed||(dist&&mov?dist/mov:d.velocidade);
      var itens=[
        dist?["Distância",nado?fmtN(Math.round(dist))+" m":fmtN(Math.round(dist/10)/100)+" km"]:null,
        ["Tempo total",hms(r.elapsedDuration||dur)],mov&&Math.abs(mov-(r.elapsedDuration||dur))>30?["Em movimento",hms(mov)]:null,
        dist&&velMov?[nado||/running|walking/.test(tipo)?"Ritmo médio":"Velocidade média",ritmoDe(velMov,tipo)]:null,
        r.maxSpeed&&dist?[nado||/running|walking/.test(tipo)?"Melhor ritmo":"Velocidade máxima",ritmoDe(r.maxSpeed,tipo)]:null,
        (r.averageHR||d.fc)?["Batimentos (média)",Math.round(r.averageHR||d.fc)+" por minuto"]:null,(r.maxHR||d.fcMax)?["Batimentos (máximo)",Math.round(r.maxHR||d.fcMax)+" por minuto"]:null,
        (r.calories||d.calorias)?["Calorias",Math.round(r.calories||d.calorias)+(r.bmrCalories?" ("+Math.round(r.calories-r.bmrCalories)+" ativas)":"")]:null,
        r.elevationGain?["Subida / descida",Math.round(r.elevationGain)+" / "+Math.round(r.elevationLoss||0)+" m"]:null,
        r.minElevation!=null&&r.maxElevation!=null&&dist?["Altitude",Math.round(r.minElevation)+"–"+Math.round(r.maxElevation)+" m"]:null,
        (r.averageRunCadence||d.cadencia)?["Passos por minuto (média)",Math.round(r.averageRunCadence||d.cadencia)+""+(r.maxRunCadence?" (máx "+Math.round(r.maxRunCadence)+")":"")]:null,
        (r.strideLength||d.passada)?["Tamanho da passada",fmtN(Math.round(r.strideLength||d.passada))+" cm"]:null,
        (r.steps||d.passos)?["Passos",Math.round(r.steps||d.passos).toLocaleString("pt-BR")]:null,
        r.averageTemperature!=null?["Temperatura",Math.round(r.minTemperature)+"–"+Math.round(r.maxTemperature)+" °C"]:null,
        (r.trainingEffect||d.efeitoAerobico)!=null?["Efeito aeróbico",fmtN(r.trainingEffect||d.efeitoAerobico)]:null,
        (r.anaerobicTrainingEffect!=null||d.efeitoAnaerobico!=null)?["Efeito anaeróbico",fmtN(r.anaerobicTrainingEffect!=null?r.anaerobicTrainingEffect:d.efeitoAnaerobico)]:null,
        (r.activityTrainingLoad||d.carga)?["Carga de exercício",Math.round(r.activityTrainingLoad||d.carga)]:null,
        (d.minModerados||d.minVigorosos)?["Minutos de intensidade",(d.minModerados||0)+" moderados · "+(d.minVigorosos||0)+" vigorosos"]:null,
        r.waterEstimated?["Suor estimado",Math.round(r.waterEstimated)+" ml"]:null,
        x.piscinas?["Piscinas",x.piscinas+(d.piscina?" de "+fmtN(d.piscina/100)+" m":"")]:null,d.swolf?["Eficiência do nado (braçadas + segundos por piscina; menor é melhor)",d.swolf]:null,
        (x.series||[]).length?["Séries",x.series.length+" · "+x.series.reduce(function(s,q){return s+(q.reps||0)},0)+" repetições"]:null].filter(Boolean);
      var EF={RECOVERY:"Recuperação",AEROBIC_BASE:"Base aeróbica",TEMPO:"Ritmo (tempo)",LACTATE_THRESHOLD:"Limiar de lactato",VO2MAX:"Capacidade aeróbica máxima",ANAEROBIC_CAPACITY:"Capacidade anaeróbica",SPEED:"Velocidade"};
      var np=panel("Estatísticas",d.efeito?"Principal benefício: "+(EF[d.efeito]||d.efeito.toLowerCase().replace(/_/g," ")):null);
      np.appendChild(h("div",{class:"kgasto"},itens.map(function(it){return h("div",null,h("span",{class:"kl",text:it[0]}),h("b",{class:"kv",text:String(it[1])}))})));
      corpo.appendChild(np);
      /* gráficos */
      var s=x.serie||[],gp=panel("Gráficos","Toque no gráfico para ver o valor naquele momento. A linha tracejada é a média."),gs=[
        grafTreino(s,"fc","Batimentos por minuto","#D6283B",function(v){return Math.round(v)+" por minuto"}),
        dist?grafTreino(s,"vel",nado||/running|walking/.test(tipo)?"Ritmo":"Velocidade","#2E8BD8",function(v){return ritmoDe(v,tipo)}):null,
        grafTreino(s,"alt","Altitude","#0E8A6A",function(v){return Math.round(v)+" m"}),
        /running|walking/.test(tipo)?grafTreino(s,"cad","Passos por minuto","#7C6FE0",function(v){return Math.round(v*2)+" por minuto"}):null,
        grafTreino(s,"temp","Temperatura","#E8A317",function(v){return Math.round(v)+" °C"})].filter(Boolean);
      if(gs.length){gs.forEach(function(g){gp.appendChild(g)});corpo.appendChild(gp)}
      /* zonas de FC */
      if(d.zonas&&d.zonas.some(Boolean)){var tz=d.zonas.reduce(function(a2,b2){return a2+b2},0),zp=panel("Faixas de batimentos","Quanto tempo o coração ficou em cada faixa de esforço."),NZ=["Aquecimento","Fácil","Aeróbica","Limiar","Máxima"];
        zp.appendChild(h("div",{class:"tzonas"},d.zonas.map(function(z,i){return racDica.ligar(h("div",{class:"tzrow",tabindex:"0"},h("span",{text:"Zona "+(i+1)+" · "+NZ[i]}),h("span",{class:"tzbar"},h("i",{class:"z"+(i+1),style:"width:"+(z/tz*100).toFixed(1)+"%"})),h("b",{text:hms(z)+" · "+Math.round(z/tz*100)+"%"})),function(){return ["Zona "+(i+1)+" · "+NZ[i],hms(z)+" nesta faixa · "+Math.round(z/tz*100)+"% do treino"]})})));
        corpo.appendChild(zp)}
      /* voltas */
      if((x.voltas||[]).length>1){var vp=panel("Voltas",x.voltas.length+" voltas"),tb=h("table",{class:"famtab"});
        tb.appendChild(h("thead",null,h("tr",null,["Volta","Distância","Tempo",nado||/running|walking/.test(tipo)?"Ritmo":"Velocidade","Batimentos (média)","Batimentos (máx.)","Calorias"].map(function(c){return h("th",{text:c})}))));
        tb.appendChild(h("tbody",null,x.voltas.map(function(v,i){return h("tr",null,h("td",{text:String(i+1)}),h("td",{text:v.dist?(nado?fmtN(v.dist)+" m":fmtN(Math.round(v.dist/10)/100)+" km"):"—"}),h("td",{text:hms(v.tempo)}),
          h("td",{text:v.dist&&v.tempo?ritmoDe(v.dist/v.tempo,tipo):"—"}),h("td",{text:v.fc?String(v.fc):"—"}),h("td",{text:v.fcMax?String(v.fcMax):"—"}),h("td",{text:v.cal!=null?String(v.cal):"—"}))})));
        vp.appendChild(h("div",{class:"famtabw"},tb));corpo.appendChild(vp)}
      /* séries da musculação */
      if((x.series||[]).length){var sp=panel("Séries",x.series.length+" séries"),tb2=h("table",{class:"famtab"});
        tb2.appendChild(h("thead",null,h("tr",null,["#","Exercício","Repetições","Peso","Tempo"].map(function(c){return h("th",{text:c})}))));
        tb2.appendChild(h("tbody",null,x.series.map(function(q,i){return h("tr",null,h("td",{text:String(i+1)}),h("td",{text:!q.exercicio||q.exercicio==="Exercício"?"Musculação":q.exercicio}),h("td",{text:q.reps!=null?String(q.reps):"—"}),h("td",{text:q.peso?fmtN(q.peso)+" kg":"—"}),h("td",{text:hms(q.tempo)}))})));
        sp.appendChild(h("div",{class:"famtabw"},tb2));
        sp.appendChild(h("p",{class:"sub",text:"O nome do exercício aparece quando ele é escolhido no relógio durante o treino; senão fica “Musculação”."}));corpo.appendChild(sp)}
    }
  }
