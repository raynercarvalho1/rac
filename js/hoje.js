/* Dia a Dia RAC — módulo carregado sob demanda. RAC Hoje (docs/hoje.md), Etapa 2: o coletor do dia (hojeColetar), o pacote de fatos
   (NUCLEO.hojeContexto) e a análise com a IA real (hojeAnalisar, ação hoje.analise na rac-ia). Só do dono. A tela (#rachoje) fica no
   fim deste arquivo; as funções também ficam em window.RAChoje. A coleta só lê: não grava em nenhum módulo, não abre a aba Hoje da
   Newsletter (ela grava a edição no histórico), não chama Gmail nem Garmin e não gera links de fotos. */
  var HOJE={coleta:null,quando:0,prom:null,ia:{}};
  var HOJE_VIDA=10*60e3,HOJE_PRAZO=12e3,HOJE_IA_PRAZO=120e3,HOJE_IA_CACHE="rac-hoje-ia",HOJE_IA_TENT="rac-hoje-ia-tent";
  function hojeDono(){if(!SB||!isOwner())throw new Error("o RAC Hoje é só da conta do dono")}
  function hojePrazo(p,ms){return Promise.race([p,new Promise(function(_,n){setTimeout(function(){n(new Error("não respondeu em "+Math.round(ms/1000)+" s"))},ms)})])}
  /* uma fonte: {ok, v, vazio, quando} ou {ok:false, erro}; uma falha nunca derruba as outras */
  function hojeFonte(f){return atuLer(function(){return hojePrazo(Promise.resolve().then(f),HOJE_PRAZO)}).then(function(r){
    return r.ok?{ok:true,v:r.v.v,vazio:!!r.v.vazio,quando:r.v.quando||null}:r})}
  function hojePag(q){var acc=[];function pag(f){return Promise.resolve().then(function(){return q(f)}).then(sbOk).then(function(l){acc=acc.concat(l);return l.length===1000?pag(f+1000):acc})}return pag(0)}
  /* cada fonte lê só o período que interessa ao dia (do 1º dia do mês passado em diante, ou menos) */
  var HOJE_LEITORES={
    agenda:function(){return agendaColetar().then(function(ev){return {v:ev,vazio:!ev.length}})},
    tarefas:function(){return Promise.resolve().then(function(){return SB.from("lista").select("id,item,criado").eq("tipo","tarefa").eq("feito",false).order("criado").limit(50)}).then(sbOk)
      .then(function(l){return {v:l,vazio:!l.length}})},
    vagas:function(){return (vgPronto||Promise.resolve()).then(function(){var c=PESSOAL.candidaturas||[];
      return {v:{vagas:VG.all||[],skills:((PESSOAL.perfilCarreira||{}).skills)||["sql","powerbi","excel","negocio","estat"],noFunil:c.map(function(x){return x.vagaId}).filter(Boolean),
        ocultas:typeof vgHidden!=="undefined"?vgHidden:{},funil:c.filter(function(x){return x.coluna&&x.coluna!=="arquivo"}).length},vazio:!(VG.all||[]).length,quando:VG.coletado||null}})},
    /* a edição montada aqui, em memória (NUCLEO.nlEdicao): a aba Hoje da Newsletter não é aberta, então nada é gravado no histórico */
    newsletter:function(){var d0=typeof NLS!=="undefined"&&NLS.dados?Promise.resolve(NLS.dados):getJson("newsletter.json?v="+Math.floor(Date.now()/6e5));
      return d0.then(function(d){var c=NUCLEO.nlEdicao(d,PESSOAL.newsletter,Date.now());
        return {v:{destaques:(c.destaques||[]).map(function(g){return {t:g.titulo_pt||g.t,cat:NUCLEO.nlCat(g.c).n,n:g.n||1}})},vazio:!(c.destaques||[]).length,quando:d.coletado||null}})},
    noticias:function(){return getJson("noticias.json").then(function(d){var l=(d.noticias||[]).slice(0,6).map(function(n){return {t:n.t,f:n.f,d:n.d}});return {v:l,vazio:!l.length,quando:d.coletado||null}})},
    /* o jogo dos Dodgers hoje (a mesma consulta pública do resumo falado do Início) */
    esportes:function(){var hoje=hojeISO();return getJson("https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=119&date="+hoje+"&hydrate=team").then(function(d){
      var j=d&&d.dates&&d.dates[0]&&d.dates[0].games[0];if(!j)return {v:null,vazio:true};
      var casa=j.teams.home.team.id===119,adv=(casa?j.teams.away:j.teams.home).team.name;
      return {v:"Os Dodgers jogam hoje "+(casa?"em casa contra ":"fora contra ")+adv+", às "+new Date(j.gameDate).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"})+" (Brasília)."}})},
    mercado:function(ini){return hojePag(function(f){return SB.from("compras").select("data,valor_total").gte("data",ini).order("data").range(f,f+999)}).then(function(l){return {v:l,vazio:!l.length}})},
    alimentacao:function(ini){return hojePag(function(f){return SB.from("pedidos").select("data,total_pago").gte("data",ini).order("data").range(f,f+999)}).then(function(l){return {v:l,vazio:!l.length}})},
    /* compras online do período e as recorrências ainda a confirmar (mesmo que antigas) */
    compras:function(ini){return hojePag(function(f){return SB.from("compras_online").select("data,loja,total_pago,fora_das_contas,recorrencia_status,recorrencia_texto")
      .or("data.gte."+ini+",recorrencia_status.eq.a_confirmar").order("data").range(f,f+999)}).then(function(l){return {v:l,vazio:!l.length}})},
    orcamentos:function(){return Promise.resolve().then(function(){return SB.from("orcamentos").select("categoria,valor")}).then(sbOk).then(function(l){return {v:l,vazio:!l.length}})},
    /* o que o relógio já mandou para o banco (60 dias para a prontidão, 14 de treinos); nunca chama a função garmin */
    saude:function(){var hoje=hojeISO(),ocultos=NUCLEO.TREINO_OCULTOS;
      return Promise.all([hojePag(function(f){return SB.from("garmin_dia").select("data,dados").gte("data",NUCLEO.somaDiasISO(hoje,-60)).order("data").range(f,f+999)}),
        Promise.resolve().then(function(){return SB.from("garmin_ativ").select("inicio,tipo").gte("inicio",NUCLEO.somaDiasISO(hoje,-14))}).then(sbOk)])
      .then(function(r){var ult=r[0][r[0].length-1];return {v:{dias:r[0],ativs:r[1].filter(function(a){return ocultos.indexOf(a.tipo)<0})},vazio:!r[0].length,quando:ult?ult.data+"T23:59:00-03:00":null}})},
    mba:function(){var hoje=hojeISO(),fin=mbaFin();
      var o={aulas:mbaAulas().filter(function(a){return a.data>=hoje}).slice(0,3),avals:mbaAvals().filter(function(a){return !a.feita}),
        progresso:fin?"MBA: "+fin.pagas+" de "+fin.ps.length+" parcelas pagas; falta pagar "+NUCLEO.hojeReais(fin.falta)+(fin.prox?"; próxima de "+NUCLEO.hojeReais(fin.prox.v)+" vence em "+fin.prox.venc:"")+".":""};
      return {v:o,vazio:!o.aulas.length&&!o.avals.length&&!fin}},
    tempo:function(){return (TEMPO_HOJE?Promise.resolve(TEMPO_HOJE):getJson("https://api.open-meteo.com/v1/forecast?latitude=-23.50&longitude=-47.46&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&hourly=precipitation_probability,precipitation&timezone=America%2FSao_Paulo&forecast_days=2"))
      .then(function(d){var c=NUCLEO.chuvaAviso(d.hourly,d.current.time);
        return {v:"Em Sorocaba: "+Math.round(d.current.temperature_2m)+" graus agora, máxima "+Math.round(d.daily.temperature_2m_max[0])+", mínima "+Math.round(d.daily.temperature_2m_min[0])+(c?"; "+c.texto:"; sem chuva prevista nas próximas horas")+".",
          quando:d.current.time?d.current.time+":00-03:00":null}})}};
  /* todas as fontes, em paralelo, uma leitura por sessão (10 minutos); o botão de atualizar ou forcar leem de novo */
  function hojeColetar(forcar){
    try{hojeDono()}catch(e){return Promise.reject(e)}
    if(HOJE.prom)return HOJE.prom;
    if(HOJE.coleta&&!forcar&&!(typeof ATU!=="undefined"&&ATU.fresco)&&Date.now()-HOJE.quando<HOJE_VIDA)return Promise.resolve(HOJE.coleta);
    var hoje=hojeISO(),ini=new Date(Date.UTC(+hoje.slice(0,4),+hoje.slice(5,7)-2,1)).toISOString().slice(0,10),nomes=Object.keys(HOJE_LEITORES);
    HOJE.prom=precisa(["sistema","mba"]).then(function(){return Promise.all(nomes.map(function(k){return hojeFonte(function(){return HOJE_LEITORES[k](ini)})}))})
      .then(function(r){var f={};nomes.forEach(function(k,i){f[k]=r[i]});HOJE.coleta={hoje:hoje,quando:new Date().toISOString(),fontes:f};HOJE.quando=Date.now();HOJE.prom=null;return HOJE.coleta},
        function(e){HOJE.prom=null;throw e});
    return HOJE.prom}
  /* as regras do dia e o pacote de fatos (o que a IA recebe), prontos sem IA */
  /* quem é quem, pela configuração da Família (bebê, cachorro, veículos): sem isso a IA chamou a Olivia de pet */
  function hojeQuem(){if(typeof FAM==="undefined")return "";
    return Object.keys(FAM).map(function(k){var F=FAM[k];if(F.bebe)return F.n+" é a filha bebê do dono";if(F.veic)return /antigo/i.test(F.n)?null:F.n+" é um veículo do dono";
      if(F.docs)return null;return typeof AGENDA_ICO!=="undefined"&&AGENDA_ICO[k]==="🐶"?F.n+" é o cachorro da família":null}).filter(Boolean).join("; ")}
  function hojeMontar(forcar){return hojeColetar(forcar).then(function(c){var x=NUCLEO.hojeContexto(c.fontes,c.hoje,Date.now(),undefined,{quem:hojeQuem()});x.hoje=c.hoje;x.coletado=c.quando;return x})}
  function hojeLerLocal(k,p){try{var v=JSON.parse(localStorage.getItem(k)||"null");return v==null?p:v}catch(e){return p}}
  function hojeGuardarLocal(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
  /* análise com a IA real. Cache por pacote de fatos (+ pergunta): o mesmo dia com os mesmos dados não é pago de novo; nova=true é a
     nova análise pedida pelo dono (outra chave). Falha da IA nunca vira análise: volta ok:false com o motivo, e o determinístico à parte. */
  function hojeAnalisar(o){o=o||{};
    try{hojeDono()}catch(e){return Promise.reject(e)}
    return hojeMontar(o.forcar).then(function(x){
      var det={itens:x.itens,mudancas:x.mudancas,financas:x.financas,saude:x.saude,vagas:x.vagas,estados:x.estados,origem:"regras do RAC (sem IA)"};
      if(!x.fatos.length)return {ok:false,motivo:"Não há fatos para analisar: nenhuma fonte respondeu.",deterministico:det};
      /* a chave não depende do tempo (temperatura, chuva, estado da fonte): só ele mudar não vira outra análise paga */
      var pergunta=NUCLEO.hojeLimpar(o.pergunta||"").slice(0,500),ident=NUCLEO.hojeTextoChave(x.texto),base=NUCLEO.hojeChave(x.hoje,ident,pergunta,0),tents=hojeLerLocal(HOJE_IA_TENT,{});
      if(o.nova){tents[base]=(tents[base]||0)+1;hojeGuardarLocal(HOJE_IA_TENT,tents)}
      var chave=NUCLEO.hojeChave(x.hoje,ident,pergunta,tents[base]||0),cache=hojeLerLocal(HOJE_IA_CACHE,{});
      if(cache[chave])return {ok:true,deCache:true,analise:cache[chave],deterministico:det,fatos:x.fatos};
      if(HOJE.ia[chave])return HOJE.ia[chave];
      var texto=x.texto+(pergunta?"<pergunta>"+pergunta+"</pergunta>":"");
      HOJE.ia[chave]=hojePrazo(racIA("hoje","hoje.analise",{texto:texto,imagens:[]},{data:x.hoje},chave),HOJE_IA_PRAZO)
        .then(function(r){var res=r&&r.resultado;
          /* só conta como análise a resposta REAL, concluída e no formato; DEMO ou erro nunca é apresentado como análise */
          if(!(r&&r.ok&&r.modo==="REAL"&&res&&!res._demo&&Array.isArray(res.atencao)&&res.atencao.length&&res.resumo))
            return {ok:false,motivo:(r&&r.mensagem)||"A IA não respondeu.",codigo:r&&r.erro&&r.erro.codigo||null,id:r&&r.id||null,estado:r&&r.estado||null,consumo:r&&r.consumo||null,deterministico:det};
          var a={id:r.id,chave:chave,quando:new Date().toISOString(),hoje:x.hoje,resultado:res,consumo:r.consumo,avisos:r.avisos||[],
            pacote:hojePacote(x),pergunta:pergunta,fatos:NUCLEO.hojeCitados(res,x.fatos)};
          cache[chave]=a;Object.keys(cache).sort(function(p,q){return cache[q].quando<cache[p].quando?-1:1}).slice(8).forEach(function(k){delete cache[k]});hojeGuardarLocal(HOJE_IA_CACHE,cache);
          return {ok:true,deCache:false,analise:a,deterministico:det,fatos:x.fatos}},
        function(e){var tempo=/não respondeu em/.test(e&&e.message||"");
          return {ok:false,motivo:tempo?"A IA não respondeu a tempo. A chamada pode ter sido feita: ela fica registrada e não é repetida sozinha.":"Não consegui falar com a IA ("+(e&&e.message||e)+").",codigo:tempo?"tempo_esgotado":"rede",deterministico:det}})
        .then(function(r){delete HOJE.ia[chave];return r});
      return HOJE.ia[chave]})}
  /* análises guardadas neste aparelho (as 8 últimas), da mais nova para a mais antiga */
  function hojeHistorico(){var c=hojeLerLocal(HOJE_IA_CACHE,{});return Object.keys(c).map(function(k){return c[k]}).filter(function(a){return a&&a.resultado}).sort(function(a,b){return a.quando<b.quando?1:-1})}
  /* o pacote de fatos de agora, sem a pergunta: é o que diz se uma análise guardada ainda vale */
  function hojePacote(x){var t=(x.fatos||[]).filter(function(f){return f.fonte!=="tempo"}).map(function(f){return f.texto.replace(/dado de \d+ horas atrás/g,"dado velho")}).join("\n");return NUCLEO.hojeChave(x.hoje,t,"",0)}
  window.RAChoje={coletar:hojeColetar,montar:hojeMontar,analisar:hojeAnalisar,historico:hojeHistorico,pacote:hojePacote};

  /* ===== Tela do RAC Hoje (#rachoje). Abrir a tela só LÊ (coletor, regras do núcleo, cache deste aparelho e o histórico em ia_custos):
     a IA só é chamada pelos botões "Analisar" e "Perguntar", depois de uma confirmação explícita, e nunca no lugar de um erro
     aparece uma análise simulada. Só do dono. ===== */
  var HJ={x:null,corpo:null,sel:null,ocupado:false,erro:null,aviso:"",cfg:undefined};
  var HJ_ESTADOS={ok:"Ok",vazia:"Sem dados",falhou:"Falhou",desatualizada:"Desatualizada",ausente:"Não lida"};
  var HJ_PRIO={alta:"Alta",media:"Média","média":"Média",baixa:"Baixa"};
  function hjQuando(iso){var d=new Date(iso);return isFinite(d.getTime())?d.toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):""}
  function hjModelo(m){return String(m||"").replace(/^claude-(\w+)-(\d+)-(\d+)$/,function(_,n,p,q){return "Claude "+n.charAt(0).toUpperCase()+n.slice(1)+" "+p+"."+q})}
  function hjConfig(){if(HJ.cfg!==undefined)return Promise.resolve(HJ.cfg);
    return Promise.resolve().then(function(){return SB.from("ia_config").select("cambio_brl_usd,margem_impostos").maybeSingle()}).then(sbOk).then(function(c){HJ.cfg=c||null;return HJ.cfg},function(){HJ.cfg=null;return null})}
  /* custo e uso da análise: estimativa do RAC (tokens informados pela API × tabela de preços); a fatura é a do Console */
  function hjCusto(a){var c=(a&&a.consumo)||{},u=c.uso_api||{},l=[];
    l.push(c.estimado_rac_usd!=null?"custo estimado "+NUCLEO.iaUsdFino(c.estimado_rac_usd)+(HJ.cfg?" (≈ "+NUCLEO.iaBrl(c.estimado_rac_usd,HJ.cfg)+")":""):"custo não informado");
    if(u.tokens_entrada!=null)l.push(NUCLEO.iaNum(u.tokens_entrada,0)+" → "+NUCLEO.iaNum(u.tokens_saida||0,0)+" tokens");return l.join(" · ")}
  function hjTag(txt,cls){return h("span",{class:"hjtag "+(cls||"")},txt)}
  function hjLista(titulo,sub,itens){var p=panel(titulo,sub);p.appendChild(itens);return p}
  /* os ids dos fatos que sustentam um trecho */
  function hjFatosTxt(ids){return (ids&&ids.length)?"Fatos: "+ids.join(", "):""}
  function hjDesenhar(){
    var x=HJ.x,corpo=HJ.corpo;if(!x||!corpo)return;corpo.innerHTML="";
    var hist=hojeHistorico(),a=hist.filter(function(y){return y.chave===HJ.sel})[0]||hist[0]||null,pacote=hojePacote(x),def=a?NUCLEO.hojeDefasagem(a,pacote,x.hoje,Date.now()):null;
    /* 1. fontes de informação */
    var pf=panel("Fontes de informação","Lidas agora, só leitura, "+(x.coletado?"às "+hjQuando(x.coletado).slice(-5):"")+". Uma fonte que falha não derruba as outras.");
    pf.appendChild(h("ul",{class:"wl hjfontes"},x.estados.map(function(e){
      return h("li",null,h("span",{class:"grow"},h("b",{text:e.nome}),e.detalhe?h("span",{class:"sub",text:e.detalhe}):null),hjTag(HJ_ESTADOS[e.estado]||e.estado,"hje-"+e.estado))})));
    /* 2. prioridades do dia (regras do RAC, sem IA) */
    var pp=panel("Prioridades do dia","Ordenadas pelas regras do RAC (atraso, prazo e área), sem IA.");
    if(!x.itens.length)pp.appendChild(h("p",{class:"empty",text:"Nada pedindo atenção nas fontes lidas."}));
    else pp.appendChild(h("ul",{class:"wl hjitens"},x.itens.slice(0,8).map(function(it){var d=it.dias==null?"":it.dias<0?"atrasado há "+(-it.dias)+(it.dias===-1?" dia":" dias"):it.dias===0?"hoje":it.dias===1?"amanhã":"em "+it.dias+" dias";
      var ok=it.href&&String(it.href).charAt(0)==="#",t=ok?h("a",{href:it.href,text:it.titulo}):h("span",{text:it.titulo});
      return h("li",null,h("span",{class:"grow"},h("b",null,t),h("span",{class:"sub",text:[d,it.sub].filter(Boolean).join(" · ")})),hjTag(HJ_PRIO[it.nivel]||it.nivel,"hjp-"+String(it.nivel).replace("é","e")))})));
    if(x.mudancas.length){pp.appendChild(h("h3",{class:"dayh",text:"O que mudou desde ontem"}));
      pp.appendChild(h("ul",{class:"wl hjitens"},x.mudancas.map(function(m){return h("li",null,h("span",{class:"grow"},h("span",{class:"sub",text:m.texto})))})))}
    /* 3. análise da IA */
    var pa=panel("Análise da IA","Interpretação feita pelo Claude sobre os fatos acima. Só acontece quando você pede.");
    if(HJ.aviso)pa.appendChild(h("p",{class:"sub",role:"status",text:HJ.aviso}));
    if(HJ.ocupado)pa.appendChild(h("p",{class:"empty",role:"status",text:"Analisando com a IA… pode levar até 2 minutos. Não toque de novo: uma chamada só é feita."}));
    if(HJ.erro)pa.appendChild(hjErro(HJ.erro));
    if(a)pa.appendChild(hjAnalise(a,def));
    else if(!HJ.ocupado)pa.appendChild(h("p",{class:"empty",text:"Ainda não há análise da IA neste aparelho. Nada foi chamado ao abrir a tela."}));
    var existe=hist.some(function(y){return y.pacote===pacote&&!y.pergunta&&y.hoje===x.hoje});
    var ref=a&&a.consumo&&a.consumo.estimado_rac_usd!=null?" A última custou "+NUCLEO.iaUsdFino(a.consumo.estimado_rac_usd)+" (estimado).":"";
    var aviso="Isto faz uma chamada paga ao Claude Sonnet 5.5 pelo RAC Intelligence, com o orçamento de IA da casa."+ref+" Nada é gravado nem executado pela IA.";
    pa.appendChild(hjBotaoPago(existe?"✨ Analisar de novo (nova cobrança)":"✨ Analisar o dia",aviso,function(){hjAnalisar({nova:existe})}));
    /* 4. pergunta contextualizada */
    var pq=panel("Pergunte sobre o seu dia","A IA responde só com os fatos acima; se eles não bastarem, ela diz isso.");
    var campo=h("textarea",{rows:"2",maxlength:"500",placeholder:"Ex.: o que devo resolver primeiro hoje?","aria-label":"Pergunta sobre os dados de hoje"});
    campo.disabled=HJ.ocupado;
    pq.appendChild(h("div",{class:"wform hjperg"},h("label",null,"Sua pergunta",campo)));
    pq.appendChild(hjBotaoPago("Perguntar",aviso,function(){var t=campo.value.trim();if(!t){HJ.aviso="Escreva a pergunta antes de confirmar.";hjDesenhar();return}hjAnalisar({pergunta:t})}));
    pq.appendChild(h("p",{class:"sub",text:"A mesma pergunta com os mesmos dados não é cobrada de novo (vem do cache deste aparelho)."}));
    /* 5. histórico recente */
    var ph=panel("Histórico recente","Duas origens diferentes: o que está guardado só neste aparelho (com o conteúdo) e o registro de chamadas do banco (só estado e custo).");
    ph.appendChild(h("h3",{class:"dayh",text:"Guardadas neste aparelho"}));
    if(!hist.length)ph.appendChild(h("p",{class:"empty",text:"Nenhuma análise guardada neste aparelho."}));
    else ph.appendChild(h("ul",{class:"wl hjhist"},hist.map(function(y){var d=NUCLEO.hojeDefasagem(y,pacote,x.hoje,Date.now()),b=h("button",{type:"button",class:"ghostbtn",text:y===a?"Em exibição":"Ver"});
      b.disabled=y===a;b.onclick=function(){HJ.sel=y.chave;HJ.erro=null;HJ.aviso="";hjDesenhar()};
      return h("li",null,h("span",{class:"grow"},h("b",{text:(y.pergunta?"Pergunta: "+y.pergunta:"Análise do dia")}),h("span",{class:"sub",text:hjQuando(y.quando)+" · "+hjCusto(y)+" · "+(d&&d.atual?"atual":"desatualizada")})),b)})));
    var banco=h("div",null,h("p",{class:"sub",text:"Lendo o registro de chamadas…"}));ph.appendChild(h("h3",{class:"dayh",text:"Registro de chamadas no banco (ia_custos)"}));ph.appendChild(banco);
    hjRegistro(banco);
    [pf,pp,pa,pq,ph].forEach(function(p){corpo.appendChild(p)})}
  /* chamadas do RAC Hoje em ia_custos (só leitura): data, estado e custo, com a classe do custo */
  function hjRegistro(box){
    Promise.resolve().then(function(){return SB.from("ia_custos").select("id,criado_em,estado,erro_codigo,modelo,tokens_entrada,tokens_saida,estimado_usd,reservado_usd,conhecido_usd,requisicao_id")
      .eq("funcionalidade","hoje").order("criado_em",{ascending:false}).limit(8)}).then(sbOk).then(function(l){box.innerHTML="";
      if(!l.length){box.appendChild(h("p",{class:"empty",text:"Nenhuma chamada do RAC Hoje registrada."}));return}
      box.appendChild(h("ul",{class:"wl hjhist"},l.map(function(u){var c=NUCLEO.iaClasse(u);
        return h("li",null,h("span",{class:"grow"},h("b",{text:NUCLEO.iaStatusCustos(u)}),h("span",{class:"sub",text:[hjQuando(u.criado_em),hjModelo(u.modelo),u.tokens_entrada!=null?NUCLEO.iaNum(u.tokens_entrada,0)+" → "+NUCLEO.iaNum(u.tokens_saida||0,0)+" tokens":""].filter(Boolean).join(" · ")})),
          h("span",{class:"end",text:NUCLEO.iaUsdFino(c.usd)+" · "+c.rotulo.toLowerCase()}))})));
      box.appendChild(h("p",{class:"sub"},"Todos os custos, filtros e gráficos: ",h("a",{href:"#iacustos",text:"Custos de IA"}),"."))})
    .catch(function(e){box.innerHTML="";box.appendChild(h("p",{class:"empty",text:"Não consegui ler o registro de chamadas ("+(e.message||e)+")."}))})}
  /* a análise em exibição: o que é fato, o que é inferência, de onde veio e quanto custou */
  function hjAnalise(a,def){var r=a.resultado,box=h("div",{class:"hjanalise"});
    box.appendChild(h("div",{class:"hjmeta"},def&&def.atual?hjTag("Atual","hje-ok"):hjTag("Desatualizada","hje-desatualizada"),
      h("span",{class:"sub",text:"Feita em "+hjQuando(a.quando)+" · "+hjModelo(a.consumo&&a.consumo.modelo||"claude-sonnet-5-5")+" · "+hjCusto(a)})));
    if(def&&!def.atual)box.appendChild(h("p",{class:"hjdef",role:"note",text:"⚠ "+def.motivo+" Peça uma nova análise se precisar de uma leitura atual."}));
    if(a.pergunta)box.appendChild(h("p",{class:"sub",text:"Pergunta: "+a.pergunta}));
    box.appendChild(h("h3",{class:"dayh",text:"Resumo"}));box.appendChild(h("p",{class:"hjtexto",text:r.resumo}));box.appendChild(h("p",{class:"sub",text:hjFatosTxt(r.resumo_fatos)}));
    if(r.resposta){box.appendChild(h("h3",{class:"dayh",text:"Resposta à sua pergunta"}));box.appendChild(h("p",{class:"hjtexto",text:r.resposta.texto}));box.appendChild(h("p",{class:"sub",text:hjFatosTxt(r.resposta.fatos)}))}
    box.appendChild(h("h3",{class:"dayh",text:"O que merece atenção"}));
    box.appendChild(h("ul",{class:"wl hjitens"},(r.atencao||[]).map(function(t){var fato=t.natureza==="fato";
      return h("li",null,h("span",{class:"grow"},h("b",{text:t.titulo}),h("span",{class:"sub",text:t.por_que}),h("span",{class:"sub",text:hjFatosTxt(t.fatos)})),
        h("span",{class:"hjtags"},hjTag(fato?"Fato":"Inferência",fato?"hjn-fato":"hjn-inf"),hjTag(HJ_PRIO[t.prioridade]||t.prioridade,"hjp-"+t.prioridade)))})));
    function inf(titulo,sub,l,rotulo){if(!l||!l.length)return;box.appendChild(h("h3",{class:"dayh",text:titulo}));box.appendChild(h("p",{class:"sub",text:sub}));
      box.appendChild(h("ul",{class:"wl hjitens"},l.map(function(t){return h("li",null,h("span",{class:"grow"},h("span",{class:"hjtexto",text:t.texto}),h("span",{class:"sub",text:hjFatosTxt(t.fatos)})),hjTag(rotulo,"hjn-inf"))})))}
    inf("Relações entre módulos","Ligações que a IA enxergou entre fontes diferentes. São inferências, não fatos registrados.",r.relacoes,"Inferência");
    inf("Recomendações","Sugestões da IA. Ela não executa nada: você decide.",r.recomendacoes,"Sugestão");
    box.appendChild(h("h3",{class:"dayh",text:"Incertezas"}));
    box.appendChild(r.incertezas&&r.incertezas.length?h("ul",{class:"wl hjitens"},r.incertezas.map(function(t){return h("li",null,h("span",{class:"grow"},h("span",{class:"sub",text:t})))})):h("p",{class:"empty",text:"A IA não apontou incertezas."}));
    var fatos=a.fatos||[],d=h("details",{class:"famvals hjfatos"},h("summary",{text:"Fatos utilizados ("+fatos.length+")"}));
    if(fatos.length)d.appendChild(h("ul",{class:"wl hjitens"},fatos.map(function(f){return h("li",null,h("span",{class:"grow"},h("b",{text:f.id+" · "+f.fonte}),h("span",{class:"sub",text:f.texto})))})));
    else d.appendChild(h("p",{class:"empty",text:"Esta análise foi guardada antes do registro dos fatos citados."}));
    box.appendChild(d);
    if((a.avisos||[]).length)box.appendChild(h("p",{class:"sub",text:a.avisos.join(" ")}));
    return box}
  /* erro real da análise: o motivo, o que foi cobrado (se for o caso) e a garantia de que nada simulado ocupa o lugar */
  function hjErro(r){var c=r.consumo||{},box=h("div",{class:"hjerro",role:"alert"});
    box.appendChild(h("b",{text:"A análise não foi concluída."}));box.appendChild(h("p",{text:r.motivo||"A IA não respondeu."}));
    var l=[];if(r.codigo)l.push("código: "+r.codigo);if(r.estado)l.push("estado: "+r.estado);if(r.id)l.push("id da chamada: "+r.id);
    if(c.estimado_rac_usd!=null)l.push("pode ter sido cobrada: "+NUCLEO.iaUsdFino(c.estimado_rac_usd)+" (estimado)");
    if(l.length)box.appendChild(h("p",{class:"sub",text:l.join(" · ")}));
    box.appendChild(h("p",{class:"sub",text:"Nenhuma resposta simulada foi usada. Nada é repetido sozinho: tente de novo só se quiser."}));return box}
  /* botão de ação paga: o primeiro toque só pede a confirmação, o segundo chama a IA; um pedido por vez */
  function hjBotaoPago(rotulo,aviso,fazer){var caixa=h("div",{class:"hjpago"}),b=h("button",{type:"button",class:"ghostbtn pri",text:rotulo});b.disabled=HJ.ocupado;
    b.onclick=function(){if(HJ.ocupado)return;caixa.innerHTML="";
      var ok=h("button",{type:"button",class:"ghostbtn pri",text:"Confirmar e chamar a IA"}),nao=h("button",{type:"button",class:"ghostbtn",text:"Cancelar"});
      ok.onclick=function(){if(HJ.ocupado)return;ok.disabled=true;fazer()};nao.onclick=function(){caixa.innerHTML="";caixa.appendChild(b)};
      caixa.appendChild(h("p",{class:"hjaviso",role:"alert",text:aviso}));caixa.appendChild(h("div",{class:"vfil"},ok,nao));ok.focus()};
    caixa.appendChild(b);return caixa}
  /* chama a IA (só aqui e só pelos botões acima); um pedido por vez, e o pacote de fatos é o mesmo que a tela mostra */
  function hjAnalisar(o){if(HJ.ocupado)return;HJ.ocupado=true;HJ.erro=null;HJ.aviso="";hjDesenhar();
    hojeAnalisar(o).then(function(r){HJ.ocupado=false;
      if(r.ok){HJ.sel=r.analise.chave;HJ.aviso=r.deCache?"Esta análise já existia neste aparelho, com os mesmos dados: nada foi cobrado.":"Análise concluída."}else HJ.erro=r;
      return hojeMontar(false).then(function(x){HJ.x=x;hjDesenhar()})},
      function(e){HJ.ocupado=false;HJ.erro={motivo:"Não consegui analisar ("+(e&&e.message||e)+")."};hjDesenhar()})}
  function hjCarregar(forcar){var corpo=HJ.corpo;corpo.innerHTML="";corpo.appendChild(h("div",{class:"panel"},loading()));
    return hjConfig().then(function(){return hojeMontar(forcar)}).then(function(x){HJ.x=x;hjDesenhar()})
      .catch(function(e){corpo.innerHTML="";corpo.appendChild(h("div",{class:"panel"},failed(function(){hjCarregar(forcar)},e)));logErro("hoje",e)})}
  function renderHoje(){var root=$("#rachoje-view");root.innerHTML="";
    if(!isOwner()){root.appendChild(h("div",{class:"panel"},h("p",{class:"empty",text:"O RAC Hoje é só da conta do dono."})));return}
    var hoje=new Date(),topo=panel(saudacao()+", Rayner",hoje.toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})),
      rel=h("button",{type:"button",class:"ghostbtn",text:"↻ Reler as fontes"}),cus=h("a",{class:"ghostbtn",href:"#iacustos",text:"Custos de IA"});
    rel.onclick=function(){if(HJ.ocupado)return;HJ.erro=null;HJ.aviso="";hjCarregar(true)};
    topo.appendChild(h("p",{class:"sub",text:"Abrir esta tela só lê os seus dados. A IA é chamada somente quando você confirma uma análise ou uma pergunta."}));
    topo.appendChild(h("div",{class:"vfil"},rel,cus));root.appendChild(topo);
    if(!HJ.ocupado){HJ.erro=null;HJ.aviso="";HJ.sel=null}
    HJ.corpo=h("div",{class:"stack"});root.appendChild(HJ.corpo);hjCarregar(false)}
