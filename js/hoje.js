/* Dia a Dia RAC — módulo carregado sob demanda. RAC Hoje (docs/hoje.md): o coletor do dia (hojeColetar), o pacote de fatos
   (NUCLEO.hojeContexto) e a análise com a IA real (hojeAnalisar, ação hoje.analise na rac-ia). Só do dono. A tela (#rachoje) fica no
   fim deste arquivo; as funções também ficam em window.RAChoje. A coleta só lê: não grava em nenhum módulo, não abre a aba Hoje da
   Newsletter (ela grava a edição no histórico), não chama Gmail nem Garmin e não gera links de fotos. */
  var HOJE={coleta:null,quando:0,prom:null,ia:{},mem:{},aoChegar:null,uid:null,suspenso:null,pendMem:null,ouvindo:false,emVoo:false,fila:{},aba:"a"+Math.random().toString(36).slice(2,10)+Date.now().toString(36)};
  var HOJE_VIDA=10*60e3,HOJE_PRAZO=12e3,HOJE_IA_PRAZO=120e3,HOJE_IA_CACHE="rac-hoje-ia",HOJE_IA_TENT="rac-hoje-ia-tent",HOJE_IA_PEND="rac-hoje-ia-pend",HOJE_TRAVA="rac-hoje-ia-trava",/* legado: a reserva por localStorage não existe mais; a chave só é ignorada pelo evento e apagada por hojeLimparLocal */HOJE_PEND_LIMITE=40,HOJE_CACHE_LIMITE=40,HOJE_LOCAL_MAX=2500000;
  function hojeDono(){if(!SB||!isOwner())throw new Error("o RAC Hoje é só da conta do dono");hojeEscopo();if(HOJE.suspenso)throw new Error(HOJE_MSG_SESSAO[HOJE.suspenso.motivo])}
  function hojePrazo(p,ms){return Promise.race([p,new Promise(function(_,n){setTimeout(function(){n(new Error("não respondeu em "+Math.round(ms/1000)+" s"))},ms)})])}
  /* uma fonte: {ok, v, vazio, quando, ultimo, origem, nota, parcial, falhas} ou {ok:false, erro}; uma falha nunca derruba as outras.
     quando = a data que a PRÓPRIA fonte informa; ultimo = a data do registro mais recente (não é "data de atualização"); origem = de onde veio a leitura */
  function hojeFonte(f){return atuLer(function(){return hojePrazo(Promise.resolve().then(f),HOJE_PRAZO)}).then(function(r){
    return r.ok?NUCLEO.fonteContrato(r.v):r})}
  /* leitura paginada da camada de dados (js/dados.js, Fase 2 · A1) */
  function hojePag(q){return dadosPaginar(q)}
  /* Newsletter, Família, MBA e Agenda vêm pelo contrato de fontes (js/fontes.js e js/fonte-*.js, Fase 2 · A4): o RAC Hoje não lê variável
     de outra tela nem carrega a tela inteira só para ter os dados */
  var HOJE_MODULOS=["fonte-agenda","fonte-newsletter","fonte-mba","fonte-familia"];
  /* a data (AAAA-MM-DD) mais recente de uma lista de registros; sem registro com data válida, nada */
  function hojeUltimo(l,campo){var m=null;(l||[]).forEach(function(x){var d=String(x&&x[campo]||"").slice(0,10);if(/^\d{4}-\d{2}-\d{2}$/.test(d)&&(!m||d>m))m=d});return m}
  /* cada fonte lê só o período que interessa ao dia (do 1º dia do mês passado em diante, ou menos) */
  var HOJE_LEITORES={
    /* a Agenda diz como foi a leitura: falha (nada utilizável) vira falha da fonte; parcial (o banco falhou e sobrou só o da memória) segue, marcada; vazia só se tudo foi lido */
    agenda:function(){return fonteOuErro("agenda")},
    tarefas:function(){return Promise.resolve().then(function(){return SB.from("lista").select("id,item,criado").eq("tipo","tarefa").eq("feito",false).order("criado").limit(50)}).then(sbOk)
      .then(function(l){return {v:l,vazio:!l.length,origem:"banco"}})},
    vagas:function(){return (vgPronto||Promise.resolve()).then(function(){var c=PESSOAL.candidaturas||[];
      return {v:{vagas:VG.all||[],skills:((PESSOAL.perfilCarreira||{}).skills)||["sql","powerbi","excel","negocio","estat"],noFunil:c.map(function(x){return x.vagaId}).filter(Boolean),
        ocultas:typeof vgHidden!=="undefined"?vgHidden:{},funil:c.filter(function(x){return x.coluna&&x.coluna!=="arquivo"}).length},vazio:!(VG.all||[]).length,quando:VG.coletado||null,origem:"memória do site"}})},
    /* a edição montada aqui, em memória (NUCLEO.nlEdicao): a aba Hoje da Newsletter não é aberta, então nada é gravado no histórico */
    newsletter:function(){return fonteOuErro("newsletter").then(function(c){
        return {v:{destaques:(c.v.destaques||[]).map(function(g){return {t:g.titulo_pt||g.t,cat:NUCLEO.nlCat(g.c).n,n:g.n||1}})},vazio:c.vazio,quando:c.quando,origem:c.origem}})},
    noticias:function(){return getJson("noticias.json").then(function(d){var l=(d.noticias||[]).slice(0,6).map(function(n){return {t:n.t,f:n.f,d:n.d}});return {v:l,vazio:!l.length,quando:d.coletado||null,origem:"arquivo do site"}})},
    /* o jogo dos Dodgers hoje (a mesma consulta pública do resumo falado do Início) */
    esportes:function(){var hoje=hojeISO();return getJson("https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=119&date="+hoje+"&hydrate=team").then(function(d){
      var j=d&&d.dates&&d.dates[0]&&d.dates[0].games[0];if(!j)return {v:null,vazio:true,origem:"API pública",nota:"sem jogo dos Dodgers hoje"};
      var casa=j.teams.home.team.id===119,adv=(casa?j.teams.away:j.teams.home).team.name;
      return {v:"Os Dodgers jogam hoje "+(casa?"em casa contra ":"fora contra ")+adv+", às "+new Date(j.gameDate).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"})+" (Brasília).",origem:"API pública"}})},
    mercado:function(ini){return hojePag(function(f){return SB.from("compras").select("data,valor_total").gte("data",ini).order("data").range(f,f+999)}).then(function(l){return {v:l,vazio:!l.length,ultimo:hojeUltimo(l,"data"),origem:"banco"}})},
    alimentacao:function(ini){return hojePag(function(f){return SB.from("pedidos").select("data,total_pago").gte("data",ini).order("data").range(f,f+999)}).then(function(l){return {v:l,vazio:!l.length,ultimo:hojeUltimo(l,"data"),origem:"banco"}})},
    /* compras online do período e as recorrências ainda a confirmar (mesmo que antigas) */
    compras:function(ini){return hojePag(function(f){return SB.from("compras_online").select("data,loja,total_pago,fora_das_contas,status,recorrencia_status,recorrencia_texto,canal,natureza,historico,origem,impostos_info,categoria,compras_online_itens(total,desconto,natureza,total_linha,situacao)")
      .or("data.gte."+ini+",recorrencia_status.eq.a_confirmar").order("data").order("id").range(f,f+999)}).then(function(l){l=l.map(NUCLEO.coDeBanco);return {v:l,vazio:!l.length,ultimo:hojeUltimo(l,"data"),origem:"banco"}})},
    orcamentos:function(){return Promise.resolve().then(function(){return SB.from("orcamentos").select("categoria,valor")}).then(sbOk).then(function(l){return {v:l,vazio:!l.length,origem:"banco"}})},
    /* o que o relógio já mandou para o banco (60 dias para a prontidão, 14 de treinos); nunca chama a função garmin */
    saude:function(){var hoje=hojeISO(),ocultos=NUCLEO.TREINO_OCULTOS;
      return Promise.all([hojePag(function(f){return SB.from("garmin_dia").select("data,dados").gte("data",NUCLEO.somaDiasISO(hoje,-60)).order("data").range(f,f+999)}),
        Promise.resolve().then(function(){return SB.from("garmin_ativ").select("inicio,tipo").gte("inicio",NUCLEO.somaDiasISO(hoje,-14))}).then(sbOk)])
      .then(function(r){var ult=r[0][r[0].length-1];return {v:{dias:r[0],ativs:r[1].filter(function(a){return ocultos.indexOf(a.tipo)<0})},vazio:!r[0].length,quando:ult?ult.data+"T23:59:00-03:00":null,ultimo:ult?ult.data:null,origem:"banco"}})},
    mba:function(){return fonteOuErro("mba").then(function(c){var hoje=hojeISO(),fin=c.v.fin;
      var o={aulas:c.v.aulas.filter(function(a){return a.data>=hoje}).slice(0,3),avals:c.v.avals.filter(function(a){return !a.feita}),
        progresso:fin?"MBA: "+fin.pagas+" de "+fin.ps.length+" parcelas pagas; falta pagar "+NUCLEO.hojeReais(fin.falta)+(fin.prox?"; próxima de "+NUCLEO.hojeReais(fin.prox.v)+" vence em "+fin.prox.venc:"")+".":""};
      return {v:o,vazio:!o.aulas.length&&!o.avals.length&&!fin,origem:c.origem}})},
    tempo:function(){return (TEMPO_HOJE?Promise.resolve(TEMPO_HOJE):getJson("https://api.open-meteo.com/v1/forecast?latitude=-23.50&longitude=-47.46&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&hourly=precipitation_probability,precipitation&timezone=America%2FSao_Paulo&forecast_days=2"))
      .then(function(d){var c=NUCLEO.chuvaAviso(d.hourly,d.current.time);
        return {v:"Em Sorocaba: "+Math.round(d.current.temperature_2m)+" graus agora, máxima "+Math.round(d.daily.temperature_2m_max[0])+", mínima "+Math.round(d.daily.temperature_2m_min[0])+(c?"; "+c.texto:"; sem chuva prevista nas próximas horas")+".",
          quando:d.current.time?d.current.time+":00-03:00":null,origem:TEMPO_HOJE?"memória do site":"API pública"}})}};
  /* todas as fontes, em paralelo, uma leitura por sessão (10 minutos); o botão de atualizar ou forcar leem de novo */
  function hojeColetar(forcar){
    try{hojeDono()}catch(e){return Promise.reject(e)}
    if(HOJE.prom)return HOJE.prom;
    if(HOJE.coleta&&!forcar&&!(typeof ATU!=="undefined"&&ATU.fresco)&&Date.now()-HOJE.quando<HOJE_VIDA)return Promise.resolve(HOJE.coleta);
    var hoje=hojeISO(),ini=new Date(Date.UTC(+hoje.slice(0,4),+hoje.slice(5,7)-2,1)).toISOString().slice(0,10),nomes=Object.keys(HOJE_LEITORES);
    /* a Família (quem é quem, para a IA) vem junto, pela fonte, mas não é uma das fontes do dia: a lista e a tela das fontes não mudam */
    HOJE.prom=precisa(HOJE_MODULOS).then(function(){return Promise.all([Promise.all(nomes.map(function(k){return hojeFonte(function(){return HOJE_LEITORES[k](ini)})})),fonteLer("familia")])})
      .then(function(rr){var r=rr[0],f={};nomes.forEach(function(k,i){f[k]=r[i]});HOJE.coleta={hoje:hoje,quando:new Date().toISOString(),fontes:f,quem:rr[1].ok?NUCLEO.hojeQuemDe(rr[1].v.integrantes):""};HOJE.quando=Date.now();HOJE.prom=null;return HOJE.coleta},
        function(e){HOJE.prom=null;throw e});
    return HOJE.prom}
  /* as regras do dia e o pacote de fatos (o que a IA recebe), prontos sem IA */
  /* quem é quem, pela fonte da Família (bebê, cachorro, veículos; NUCLEO.hojeQuemDe): sem isso a IA chamou a Olivia de pet */
  function hojeMontar(forcar){return hojeColetar(forcar).then(function(c){var x=NUCLEO.hojeContexto(c.fontes,c.hoje,Date.now(),undefined,{quem:c.quem||""});x.hoje=c.hoje;x.coletado=c.quando;return x})}
  /* ===== Escopo deste aparelho. Tudo que o RAC Hoje guarda aqui (análises, tentativas, chamadas sem resultado, trava entre abas) fica numa chave POR CONTA
     (nome + ":" + id do usuário): outra conta que entre neste navegador, sem passar pelo Sair, não enxerga nem altera o que é da anterior, e o registro
     da anterior continua lá se ela voltar. Sem id da conta, nada é lido nem gravado. A memória da página também é zerada quando a conta muda
     (sem onAuthStateChange: a conferência acontece a cada leitura e gravação, então não há listener para duplicar). ===== */
  function hojeUidReal(){return typeof EU!=="undefined"&&EU&&EU.id?String(EU.id):null}
  /* com a sessão suspensa (ver "Sessão em outra aba" abaixo) NÃO há conta: nada é lido, gravado nem mostrado até a identidade ser confirmada */
  function hojeUid(){return HOJE.suspenso?null:hojeUidReal()}
  function hojeZerar(){HOJE.coleta=null;HOJE.quando=0;HOJE.prom=null;HOJE.ia={};HOJE.mem={};HOJE.pendMem=null;HOJE.fila={};
    if(typeof HJ!=="undefined"){HJ.x=null;HJ.sel=null;HJ.erro=null;HJ.aviso="";HJ.ocupado=false}}
  function hojeEscopo(){var u=hojeUid();if(u===HOJE.uid)return u;
    if(HOJE.uid!==null)hojeZerar();
    HOJE.uid=u;if(u&&typeof hojeLimparLocal==="function")hojeLimparLocal(u);return u}
  /* ===== Sessão em outra aba. O app não escuta onAuthStateChange e esta etapa não mexe na autenticação. O Supabase (mercado.js: persistSession, storageKey
     "rac-mercado-auth") guarda a sessão no localStorage; quando OUTRA aba entra, sai ou troca de conta, o navegador dispara o evento "storage" NESTA aba
     (nunca na que gravou). Um listener só (hojeOuvir) olha essa chave: valor apagado = saiu; valor com outro user.id = outra conta; mesmo user.id = só
     renovação do token (ignorada, não apaga nada); valor ilegível = trata como troca. Ao detectar (só para o dono; a casa nem passa por aqui), a aba fica
     SUSPENSA: memória, tela, pergunta digitada e histórico em memória são esvaziados na hora, o conteúdo guardado no aparelho é reduzido aos metadados de
     segurança (hojeLimparLocal) e nada é lido, gravado ou chamado. A nova conta NÃO é adotada por esta página (o resto do app continua com a identidade antiga):
     a identidade só é confirmada quando a página entra de novo (recarregar, ou entrar() → hojeAoEntrar). Limites: não vê expiração nem revogação no servidor,
     nem a mudança feita nesta mesma aba, nem navegador sem localStorage; só confia no que o navegador entrega no evento. ===== */
  var HOJE_AUTH_CHAVE="rac-mercado-auth";
  var HOJE_MSG_SESSAO={saiu:"Você saiu da conta em outra aba. Por segurança, o RAC Hoje foi esvaziado nesta aba. Recarregue a página para entrar de novo.",
    outra_conta:"Outra conta entrou em outra aba deste aparelho. Por segurança, o RAC Hoje desta aba foi esvaziado e não mostra nada até a nova conta ser confirmada. Recarregue a página para confirmar quem entrou."};
  /* devolve true se este evento era a mudança de sessão (tratada, ou já tratada antes) */
  function hojeSessaoMudou(ev){
    if(!ev||(ev.key!==null&&ev.key!==HOJE_AUTH_CHAVE))return false;
    var atual=hojeUidReal();if(!atual||typeof isOwner!=="function"||!isOwner())return false;/* sem conta, ou a casa: nada a esconder, nada muda */
    if(HOJE.suspenso)return true;/* já suspensa: repetir não limpa de novo nem gera efeito */
    var nv=ev.key===null?null:ev.newValue,novo=null;
    if(nv!=null){try{var s=JSON.parse(nv);novo=s&&s.user&&s.user.id?String(s.user.id):null}catch(e){novo=null}
      if(novo===atual)return true}/* a mesma conta renovou o token: nada a fazer */
    HOJE.suspenso={motivo:nv==null?"saiu":"outra_conta",quando:Date.now()};
    hojeZerar();HOJE.uid=null;
    if(typeof hojeLimparLocal==="function"){if(nv==null)hojeLimparLocal();else if(novo)hojeLimparLocal(novo)}/* valor ilegível: o armazenamento não é tocado (pode ser da conta nova) */
    hjSessaoLimpar();return true}
  /* esvazia a tela e tudo o que ela guarda em memória, e deixa só o aviso */
  function hjSessaoLimpar(){HOJE.aoChegar=null;if(typeof HJ==="undefined")return;
    if(HJ.tmr){clearTimeout(HJ.tmr);HJ.tmr=null}
    HJ.x=null;HJ.sel=null;HJ.erro=null;HJ.aviso="";HJ.ocupado=false;HJ.cfg=undefined;HJ.exibida=null;HJ.slotHist=null;HJ.slotPend=null;HJ.slotAviso=null;HJ.corpo=null;
    try{var root=typeof $==="function"?$("#rachoje-view"):null;if(root)hjSessaoAviso(root)}catch(e){}}
  function hjSessaoAviso(root){root.innerHTML="";root.appendChild(h("div",{class:"panel"},h("p",{class:"empty",role:"status",text:HOJE_MSG_SESSAO[HOJE.suspenso.motivo]})))}
  /* o listener único do evento "storage": a sessão primeiro; depois, só se a tela está aberta, o histórico entre abas. Idempotente (HOJE.ouvindo). */
  function hojeOuvir(){
    if(!HOJE.ouvindo&&typeof window.addEventListener==="function"){HOJE.ouvindo=true;
      window.addEventListener("storage",function(ev){if(hojeSessaoMudou(ev))return;var u=hojeUid();
        /* só chaves do RAC Hoje desta conta, e nunca a trava; junta rajadas num repinte só; o handler só lê (não grava, não chama a IA, não gera evento de volta) */
        if(!ev||!ev.key||!u||ev.key.indexOf("rac-hoje-ia")!==0||ev.key.slice(-(u.length+1))!==":"+u||ev.key.indexOf(HOJE_TRAVA)===0||HJ.tmr)return;
        HJ.tmr=setTimeout(hjEntreAbas,150)})}}
  /* a conta foi confirmada pelo app (entrar()): termina a suspensão e entra no escopo da identidade confirmada */
  function hojeConfirmar(){HOJE.suspenso=null;return hojeEscopo()}
  function hojeK(k){var u=hojeEscopo();return u?k+":"+u:null}
  function hojeLerLocal(k,p){var c=hojeK(k);if(!c)return p;try{var v=JSON.parse(localStorage.getItem(c)||"null");return v==null?p:v}catch(e){return p}}
  /* devolve se o navegador aceitou gravar (cheio, bloqueado ou sem conta: false) */
  function hojeGuardarLocal(k,v){var c=hojeK(k);if(!c)return false;try{localStorage.setItem(c,JSON.stringify(v));return true}catch(e){return false}}
  function hojeCopia(o){return JSON.parse(JSON.stringify(o))}
  /* os fatos de um pedido, lidos do próprio texto enviado (<fato id fonte periodo>…</fato>): o registro não guarda a lista duas vezes */
  function hojeFatosDoTexto(t){var f=[];String(t||"").split("\n").forEach(function(l){var m=/^<fato id="(f\d+)" fonte="([^"]*)" periodo="[^"]*">([\s\S]*)<\/fato>$/.exec(l);if(m)f.push({id:m[1],fonte:m[2],texto:m[3]})});return f}
  function hojeHora(iso){var d=new Date(iso);return isFinite(d.getTime())?d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}):""}
  /* o cache do aparelho + o desta sessão (se o navegador não deixou gravar, a análise concluída continua à mão até fechar a página) */
  function hojeCacheTudo(){var c=hojeLerLocal(HOJE_IA_CACHE,{}),m=HOJE.mem;if(!c||typeof c!=="object")c={};Object.keys(m).forEach(function(k){if(!c[k])c[k]=m[k]});return c}

  /* ===== Chamadas sem resultado (P2/P8). Cada chamada paga deixa um registro NESTE aparelho ANTES de sair (rac-hoje-ia-pend) e ele só some quando
     (a) a análise chegou e foi gravada, (b) o servidor recusou ANTES de reservar (código conhecido, sem id: evidência), ou (c) o dono dispensa o
     registro pelo botão. Nada mais apaga: nem o prazo, nem a quantidade, nem falta de espaço (o espaço se faz tirando análises já resolvidas e, só se ainda
     faltar, o CONTEÚDO do pedido de registros antigos: o registro fica). O servidor não guarda o conteúdo da resposta (ia_uso só tem estado, tokens e custo):
     repetir a MESMA chave nunca cobra duas vezes, mas também não devolve a análise já feita.
     Estados: enviada (saiu e não voltou), incerta (não se sabe se chegou nem se foi cobrada), consumida (o servidor já usou esta chave).
     O registro guarda a chave original, o pedido (entrada) e o retrato dos fatos: o reenvio usa exatamente isso, nunca recalcula nada. ===== */
  function hojePendLer(){var p=hojeLerLocal(HOJE_IA_PEND,{});if(!p||typeof p!=="object"||Array.isArray(p))p={};
    /* o que só existe (ou é mais novo) na memória da página vem marcado; o que já está igual no aparelho não é marcado */
    var m=HOJE.pendMem;if(m)Object.keys(m).forEach(function(k){var igual=p[k]&&JSON.stringify(p[k])===JSON.stringify(m[k]);p[k]=hojeCopia(m[k]);if(!igual)p[k].soMemoria=true});return p}
  /* Nada é apagado para abrir espaço: se o navegador recusar, a versão nova fica só na memória da página (pendMem) e quem chamou é avisado (false). */
  function hojePendGravar(p){Object.keys(p).forEach(function(k){if(p[k])delete p[k].soMemoria});var ok=hojeGuardarLocal(HOJE_IA_PEND,p);
    if(ok)HOJE.pendMem=null;else HOJE.pendMem=hojeCopia(p);
    return ok}
  function hojePendMarcar(chave,o){var p=hojePendLer(),e=p[chave]||{};Object.keys(o).forEach(function(k){if(o[k]!==undefined)e[k]=o[k]});e.chave=chave;delete e.soMemoria;p[chave]=e;return hojePendGravar(p)}
  function hojePendTirar(chave){var p=hojePendLer();if(p[chave]){delete p[chave];if(HOJE.pendMem)delete HOJE.pendMem[chave];hojePendGravar(p)}}
  /* o pedido original está guardado inteiro? Só então "reenviar o mesmo pedido" é seguro */
  function hojeReenvioSeguro(e){return !!(e&&e.chave&&e.entrada&&typeof e.entrada.texto==="string"&&e.entrada.texto&&e.entrada.data&&e.snap&&e.snap.pacote)}
  /* limites seguros (nada é descartado: ao chegar neles a chamada paga NÃO sai, antes de enviar, e o motivo é dito): registros, análises guardadas e tamanho total */
  function hojeLimites(){var p=hojePendLer(),c=hojeLerLocal(HOJE_IA_CACHE,{}),n=0,np=Object.keys(p).length,nc=Object.keys(c||{}).length;
    [HOJE_IA_CACHE,HOJE_IA_TENT,HOJE_IA_PEND].forEach(function(k){try{var kk=hojeK(k);n+=kk?(localStorage.getItem(kk)||"").length:0}catch(e){}});
    if(np>=HOJE_PEND_LIMITE)return {codigo:"limite_registros",motivo:"Há "+np+" chamadas sem resultado neste aparelho (o limite seguro é "+HOJE_PEND_LIMITE+"). Nada foi enviado nem cobrado. Resolva ou dispense algumas em \"Chamadas sem resultado\" antes de pedir outra análise: nenhuma é apagada sozinha."};
    if(nc>=HOJE_CACHE_LIMITE)return {codigo:"limite_analises",motivo:"Há "+nc+" análises guardadas neste aparelho (o limite seguro é "+HOJE_CACHE_LIMITE+"). Nada foi enviado nem cobrado. Exclua alguma em \"Guardadas neste aparelho\" antes de pedir outra: nenhuma é apagada sozinha, e o servidor não guarda o texto."};
    if(n>HOJE_LOCAL_MAX)return {codigo:"limite_espaco",motivo:"O RAC Hoje já usa "+Math.round(n/1000)+" mil caracteres do armazenamento deste aparelho (o limite seguro é "+Math.round(HOJE_LOCAL_MAX/1000)+" mil). Nada foi enviado nem cobrado. Exclua análises antigas ou dispense registros resolvidos antes de pedir outra."};
    return null}
  /* o dono exclui uma análise guardada (o servidor não guarda o texto: não há como recuperá-la) */
  function hojeExcluirAnalise(chave){hojeDono();var c=hojeLerLocal(HOJE_IA_CACHE,{}),tinha=!!(c&&c[chave]||HOJE.mem[chave]);if(c&&c[chave]){delete c[chave];hojeGuardarLocal(HOJE_IA_CACHE,c)}delete HOJE.mem[chave];return tinha}
  function hojeIntencao(hoje,pergunta){return NUCLEO.hojeChave(hoje,"intencao",pergunta||"",0)}
  /* chamadas ainda sem resultado da MESMA intenção (o dia + a pergunta), com qualquer chave */
  function hojePendDaIntencao(intencao,exceto){var p=hojePendLer(),c=hojeCacheTudo();
    return Object.keys(p).filter(function(k){return k!==exceto&&p[k]&&p[k].intencao===intencao&&!c[k]}).map(function(k){return p[k]})}
  /* Coordenação entre abas: SÓ com Web Locks (navigator.locks; Chrome 69, Firefox 96, Safari 15.4). Não existe mais reserva em localStorage: ela não era atômica
     (entre ler e gravar, duas abas passavam) e não serve para autorizar chamada paga. O bloqueio é um por conta, pedido com "ifAvailable": quem não o consegue
     NÃO espera nem tenta de novo, só informa. Ele cobre a seção crítica E a chamada em voo (até a resposta ou o tempo esgotado desta aba) e o navegador o
     solta sozinho se a aba fechar ou travar. Sem navigator.locks, ou se o navegador recusar o pedido, NADA é feito: sem chave nova, sem tentativa contada,
     sem registro, sem envio. Depois de um tempo esgotado o bloqueio é solto, mas quem segura a mesma intenção é o registro de chamada (persistido), não o bloqueio. */
  function hojeLocks(){try{var l=typeof navigator!=="undefined"&&navigator&&navigator.locks;return l&&typeof l.request==="function"?l:null}catch(e){return null}}
  function hojeCoordenar(fazer,det,reenvio,ja){var uid=hojeUid();
    if(!uid)return Promise.resolve(hojeSemEnvio("sem_registro","Não há conta identificada neste aparelho; nada foi enviado.",det));
    /* o mesmo pedido já em voo NESTA aba (dois toques seguidos): é a mesma chamada, não uma segunda */
    function igual(){var j=ja&&ja();return j||null}
    function ocupada(){return igual()||(HOJE.emVoo?hojeSemEnvio("em_andamento_aqui","Já há uma análise em andamento nesta aba. Espere ela terminar: nada novo foi enviado.",det,"em_curso"):hojeSemTrava("ocupada",det,reenvio))}
    if(HOJE.emVoo)return Promise.resolve(ocupada());
    var L=hojeLocks();if(!L)return Promise.resolve(hojeSemTrava("sem_locks",det,reenvio));
    var rodando=false;
    function rodar(){rodando=true;HOJE.emVoo=true;var p;try{p=Promise.resolve(fazer())}catch(e){p=Promise.reject(e)}return p.then(function(v){HOJE.emVoo=false;return v},function(e){HOJE.emVoo=false;throw e})}
    var ped;try{ped=L.request("rac-hoje-ia:"+uid,{ifAvailable:true},function(lock){return lock?rodar():ocupada()})}catch(e){return Promise.resolve(hojeSemTrava("sem_locks",det,reenvio))}
    /* o navegador recusou o pedido (ex.: contexto sem permissão) antes de entregar o bloqueio: nada rodou. Um erro de DEPOIS da entrega é da própria análise e segue como era. */
    return Promise.resolve(ped).then(null,function(e){if(rodando)throw e;return hojeSemTrava("sem_locks",det,reenvio)})}
  /* quando o bloqueio não é dado: outra aba (nada enviado por esta) ou o navegador sem a proteção necessária (nada enviado, nada contado) */
  function hojeSemTrava(t,det,reenvio){return t==="sem_locks"?hojeSemEnvio("sem_web_locks","Este navegador não oferece a proteção necessária (Web Locks) para iniciar uma análise com segurança entre as abas, ou não deixou obter o bloqueio. Nada foi enviado, nada foi cobrado, e nenhuma chave nova nem tentativa foi criada"+(reenvio?"; o registro da chamada anterior continua como estava":"")+". Nada é repetido sozinho: use um navegador atual (Chrome, Edge, Firefox ou Safari 15.4 ou mais novo) e tente de novo.",det,"sem_protecao")
    :hojeSemEnvio("outra_aba","Outra aba deste aparelho está processando uma análise"+(reenvio?" ou um reenvio":"")+" agora. Nada foi enviado por esta aba. Espere ela terminar (ou o resultado dela aparecer aqui) e tente de novo.",det,"em_curso")}
  var HOJE_MSG_SEM_ESPACO="Não há espaço neste aparelho para guardar o registro de segurança desta chamada (armazenamento do navegador cheio ou bloqueado). Por isso a chamada NÃO foi feita e nada foi cobrado. Nenhuma análise ou registro guardado foi apagado para abrir espaço: exclua análises antigas ou dispense registros já resolvidos (Histórico recente), ou libere espaço nos dados do site no navegador, e tente de novo.";
  /* em_curso: saiu há pouco (esta ou outra aba); incerta; consumida */
  function hojeSituacao(e,agora){if(e.estado==="enviada"){var q=Date.parse(e.quando||"");return isFinite(q)&&agora-q<HOJE_IA_PRAZO+60e3?"em_curso":"incerta"}return e.estado==="consumida"?"consumida":"incerta"}
  /* códigos com que a rac-ia recusa ANTES de reservar a chamada (contrato.ts / servico.ts: nada reservado, nada cobrado). Só com um deles, SEM id e SEM estado, a
     recusa conta como "sem cobrança". "interno", "tempo_esgotado", "provedor_*", "resposta_invalida" e qualquer código novo ou ausente NÃO contam. */
  var HOJE_SEM_RESERVA=["metodo","nao_autenticado","sem_permissao","entrada_invalida","muito_grande","limite_de_uso","orcamento_esgotado","configuracao","configuracao_ausente","modo_demo","acao_em_demo","sem_real","papel_em_demo"];
  /* uma resposta da rac-ia que NÃO virou análise: o servidor já usou a chave (id/estado/repetida) ou há evidência de que não reservou nada (livre)? */
  function hojeClassificar(r){var cod=r&&r.erro&&r.erro.codigo||null,id=r&&r.id||null,est=r&&r.estado||null,usd=r&&r.consumo&&r.consumo.estimado_rac_usd;
    if(cod==="repetida")return {livre:false,estado:"consumida",cobranca:"incerta"};
    if(cod==="em_andamento")return {livre:false,estado:"enviada",cobranca:"incerta"};
    if(cod==="rede")return {livre:false,estado:"incerta",cobranca:"incerta"};
    if(r&&r.ok===true&&r.modo==="DEMO")return {livre:true,estado:null,cobranca:"nenhuma"};/* o próprio servidor diz que é simulação: nada foi chamado */
    if(id||est)return {livre:false,estado:"consumida",cobranca:est!=="incerto"&&usd>0?"provavel":"incerta"};
    if(cod&&HOJE_SEM_RESERVA.indexOf(cod)>=0)return {livre:true,estado:null,cobranca:"nenhuma"};
    return {livre:false,estado:"incerta",cobranca:"incerta"}}
  function hojeCobrancaTxt(c,usd){var v=usd!=null?" (estimativa do RAC: "+NUCLEO.iaUsdFino(usd)+")":"";
    return c==="nenhuma"?"Sem cobrança: o servidor recusou o pedido antes de reservar a chamada.":c==="provavel"?"O servidor registrou uso nesta chamada"+v+": provavelmente foi cobrada; confira em Custos de IA.":
      "Não dá para afirmar se houve cobrança"+v+"; confira em Custos de IA."}
  /* o registro vira um "erro" que a tela sabe mostrar, com o que se pode e o que não se pode fazer. A frase de abertura depende do que o servidor disse (codigo). */
  function hojeErroDePend(e,agora){var s=hojeSituacao(e,agora),hh=hojeHora(e.quando),cod=e.codigo||null,seguro=hojeReenvioSeguro(e),r={ok:false,bloqueada:true,situacao:s,chave:e.chave,rotulo:e.rotulo||"",quando:e.quando,codigo:cod,id:e.id||null,
      estado:e.estadoServidor||null,cobranca:e.cobranca||"incerta",consumo:e.estimado!=null?{estimado_rac_usd:e.estimado}:null,podeReenviar:false,podeNova:false,recuperavel:null,soMemoria:!!e.soMemoria};
    var cob=hojeCobrancaTxt(r.cobranca,e.estimado);
    if(s==="em_curso"){r.recuperavel="talvez";
      r.motivo=(cod==="em_andamento"?"O servidor informa que este pedido ainda está sendo processado.":"Esta análise já foi enviada"+(hh?" às "+hh:"")+" (por esta aba ou por outra aberta neste aparelho) e a resposta ainda não chegou.")+
        " Nada será enviado de novo enquanto isso. Se ela chegar com esta tela aberta, é guardada sozinha."}
    else if(s==="consumida"){r.recuperavel="nao";r.podeNova=true;
      r.motivo=(cod==="repetida"?"O servidor reconheceu esta chave: este pedido já tinha sido processado antes (repetido). Ele não informa se aquela primeira chamada foi cobrada.":
        cod==="resposta_invalida"?"A chamada foi processada, mas a resposta da IA veio incompleta ou fora do formato e não virou análise.":
        cod==="nao_guardada"?"A análise chegou, mas este aparelho não conseguiu guardá-la.":"O servidor já usou este pedido"+(hh?" (enviado às "+hh+")":"")+".")+
        " Ele não guarda o texto da análise e ela não está guardada neste aparelho: não dá para recuperá-la. Enviar o mesmo pedido de novo não devolve nada. "+cob}
    else{r.recuperavel="talvez";r.podeNova=true;r.podeReenviar=seguro;
      r.motivo=(cod==="rede"?"Falha de rede: a chamada saiu"+(hh?" às "+hh:"")+" e a resposta não voltou. Não dá para saber se a chamada chegou ao servidor.":
        cod==="tempo_esgotado"?"A IA não respondeu a tempo (chamada enviada"+(hh?" às "+hh:"")+"). Ela pode ter sido feita e fica registrada; não é repetida sozinha. Não dá para saber se o servidor a recebeu.":
        "Uma chamada saiu"+(hh?" às "+hh:"")+" e a resposta não chegou. Não dá para saber se o servidor a recebeu.")+
        " "+cob+" Se a resposta chegar com esta tela aberta, é guardada sozinha."+
        (seguro?"":" O conteúdo original do pedido não está mais neste aparelho, então \"reenviar o mesmo pedido\" não é oferecido: reenviar com os dados de agora seria outro pedido.")}
    if(e.soMemoria)r.motivo+=" Atenção: o navegador recusou gravar a atualização mais nova deste registro (armazenamento cheio ou bloqueado), e ela só existe na memória desta página. O que já estava gravado continua no aparelho e será tratado como incerto; fechar a página perde apenas o detalhe novo. Nada foi apagado para abrir espaço. Anote o horário e confira em Custos de IA.";
    return r}
  function hojePendencias(){var p=hojePendLer(),c=hojeCacheTudo(),agora=Date.now();
    return Object.keys(p).filter(function(k){return !c[k]}).map(function(k){return hojeErroDePend(p[k],agora)}).sort(function(a,b){return (a.quando||"")<(b.quando||"")?1:-1})}
  /* o dono dispensa um registro (só consumida ou incerta): apaga só o aviso deste aparelho; não desfaz nada no servidor */
  /* o que o dono precisa saber antes de dispensar: o aviso sai E o bloqueio daquela tentativa também */
  var HOJE_TXT_DISPENSAR="Dispensar remove este aviso e libera o bloqueio desta tentativa neste aparelho. Não cancela nada no servidor nem desfaz uma cobrança: se a chamada foi cobrada, o valor continua em Custos de IA e no Console. Se você pedir a MESMA análise de novo, o servidor reconhece a chave e responde \"repetido\" (sem texto); se pedir uma NOVA análise, ela usa outra chave e pode ser cobrada de novo.";
  function hojeDispensar(chave){hojeDono();var e=hojePendLer()[chave];if(!e||hojeSituacao(e,Date.now())==="em_curso")return false;hojePendTirar(chave);return true}
  /* o retrato compacto das fontes, guardado com a análise (o estado de cada fonte NA HORA em que ela foi feita) */
  function hojeEstadosCompactos(est){return (est||[]).map(function(e){return {k:e.k,nome:e.nome,estado:e.estado,detalhe:e.detalhe||"",origem:e.origem||null,ultimo:e.ultimo||null,quando:e.quando||null,nota:e.nota||null}})}

  /* análise com a IA real. Cache por pacote de fatos (+ pergunta): o mesmo dia com os mesmos dados não é pago de novo; nova=true é a
     nova análise pedida pelo dono (outra chave). Falha da IA nunca vira análise: volta ok:false com o motivo, e o determinístico à parte.
     Sem fonte útil (só a data, o tempo ou falhas) nada é chamado. Chamada sem resultado deixa registro e NÃO é repetida sozinha; o dono escolhe
     entre reenviar o mesmo pedido (reenviar:true + chave: a chave e o pedido ORIGINAIS guardados no registro, sem recalcular nada, sem contar tentativa)
     e uma nova análise (nova:true, outra chave, nova cobrança). Duas abas: a seção crítica abaixo (trava + registro da mesma intenção) impede duas chamadas
     da mesma intenção ao mesmo tempo, com a mesma chave ou com chaves diferentes. */
  function hojeBloqueado(pend,det){var b=hojeErroDePend(pend,Date.now());b.deterministico=det||null;return b}
  /* nada saiu: o motivo e o que isso quer dizer para a cobrança (nada) */
  function hojeSemEnvio(codigo,motivo,det,situacao){return {ok:false,bloqueada:true,semEnvio:true,situacao:situacao||"sem_registro",codigo:codigo,motivo:motivo,cobranca:"nenhuma",deterministico:det||null}}
  function hojeAnalisar(o){o=o||{};
    try{hojeDono()}catch(e){return Promise.reject(e)}
    if(o.reenviar)return hojeReenviar(o);
    return hojeMontar(o.forcar).then(function(x){
      var det={itens:x.itens,mudancas:x.mudancas,financas:x.financas,saude:x.saude,vagas:x.vagas,estados:x.estados,origem:"regras do RAC (sem IA)"};
      var uteis=NUCLEO.hojeFontesUteis(x.estados);
      if(!uteis.ok)return {ok:false,bloqueada:true,situacao:"sem_fontes",codigo:"sem_fontes_uteis",motivo:uteis.motivo,deterministico:det};
      /* a chave não depende do tempo, das notícias nem da Newsletter (ruído): só eles mudarem não vira outra análise paga */
      var pergunta=NUCLEO.hojeLimpar(o.pergunta||"").slice(0,500),ident=NUCLEO.hojeTextoChave(x.texto),base=NUCLEO.hojeChave(x.hoje,ident,pergunta,0),
        rotulo=pergunta?"Pergunta: "+pergunta.slice(0,80):"Análise do dia",intencao=hojeIntencao(x.hoje,pergunta),uid=hojeUid();
      /* o que não envia nada nem muda nada não precisa do bloqueio entre abas: a mesma análise já em voo nesta aba, ou já guardada */
      var vivo=Object.keys(HOJE.ia).filter(function(k){return k===base||k.indexOf(base+"-")===0})[0];
      if(o.nova&&vivo)return HOJE.ia[vivo];
      if(!o.nova){var t0=hojeLerLocal(HOJE_IA_TENT,{}),c0=NUCLEO.hojeChave(x.hoje,ident,pergunta,t0[base]||0),k0=hojeCacheTudo()[c0];
        if(k0)return {ok:true,deCache:true,analise:k0,deterministico:det,fatos:x.fatos};
        if(HOJE.ia[c0])return HOJE.ia[c0]}
      /* seção crítica: dentro do bloqueio entre abas, tudo lido de novo (outra aba pode ter mexido) */
      var fk=base+(o.nova?"|nova":"|n");if(HOJE.fila[fk])return HOJE.fila[fk];/* dois pedidos iguais no mesmo instante, nesta aba: um só */
      var P=hojeCoordenar(function(){
        var tents=hojeLerLocal(HOJE_IA_TENT,{}),abertas=hojePendDaIntencao(intencao),curso=abertas.filter(function(e){return hojeSituacao(e,Date.now())==="em_curso"})[0];
        if(o.nova&&curso)return hojeBloqueado(curso,det);
        var n=(tents[base]||0)+(o.nova?1:0),chave=NUCLEO.hojeChave(x.hoje,ident,pergunta,n),cache=hojeCacheTudo();
        if(!o.nova){
          if(cache[chave])return {ok:true,deCache:true,analise:cache[chave],deterministico:det,fatos:x.fatos};
          if(HOJE.ia[chave])return HOJE.ia[chave];
          var pend=hojePendLer()[chave]||abertas[0]||null;if(pend)return hojeBloqueado(pend,det)}
        var lim=hojeLimites();if(lim)return hojeSemEnvio(lim.codigo,lim.motivo,det);
        if(o.nova){tents[base]=n;if(!hojeGuardarLocal(HOJE_IA_TENT,tents))return hojeSemEnvio("sem_registro",HOJE_MSG_SEM_ESPACO,det)}
        var texto=x.texto+(pergunta?"<pergunta>"+pergunta+"</pergunta>":""),snap={estados:hojeEstadosCompactos(x.estados),pacote:hojePacote(x),hoje:x.hoje},entrada={texto:texto,data:x.hoje};
        /* o registro sai ANTES da chamada, com a chave e o pedido originais: se a página fechar ou o prazo estourar, fica a prova de que ela saiu e o que foi enviado.
           Se o aparelho não consegue gravar o registro, a chamada paga NÃO é feita (e nada guardado é apagado para abrir espaço). */
        if(!hojePendMarcar(chave,{estado:"enviada",quando:new Date().toISOString(),rotulo:rotulo,hoje:x.hoje,intencao:intencao,pergunta:pergunta,codigo:null,id:null,estimado:null,estadoServidor:null,cobranca:"incerta",entrada:entrada,snap:snap})){
          hojePendTirar(chave);return hojeSemEnvio("sem_registro",HOJE_MSG_SEM_ESPACO,det)}
        return hojeEnviar({chave:chave,entrada:entrada,snap:snap,fatos:x.fatos,pergunta:pergunta,rotulo:rotulo,det:det,uid:uid})},det,false,function(){
        if(o.nova){var v=Object.keys(HOJE.ia).filter(function(k){return k===base||k.indexOf(base+"-")===0})[0];return v?HOJE.ia[v]:null}
        return HOJE.ia[NUCLEO.hojeChave(x.hoje,ident,pergunta,(hojeLerLocal(HOJE_IA_TENT,{})[base]||0))]||null});
      HOJE.fila[fk]=P;var lib=function(){delete HOJE.fila[fk]};P.then(lib,lib);return P})}
  /* reenvio: a chave, o pedido e o retrato vêm do registro, nunca do pacote de agora, e a tentativa NÃO é contada. Passa pelo mesmo bloqueio entre abas. */
  function hojeReenviar(o){var uid=hojeUid();
    if(o.chave&&HOJE.ia[o.chave])return HOJE.ia[o.chave];
    return hojeCoordenar(function(){var agora=Date.now(),e=o.chave&&hojePendLer()[o.chave];
      if(!e)return hojeSemEnvio("registro_ausente","Não encontrei neste aparelho o registro da chamada original; sem ele não dá para reenviar o mesmo pedido com segurança. Nada foi enviado.",null);
      if(hojeSituacao(e,agora)!=="incerta"||!hojeReenvioSeguro(e))return hojeBloqueado(e,null);
      if(!hojePendMarcar(e.chave,{estado:"enviada",quando:new Date(agora).toISOString(),reenvios:(e.reenvios||0)+1,codigo:null})){
        hojePendMarcar(e.chave,{estado:e.estado,quando:e.quando,reenvios:e.reenvios||0,codigo:e.codigo||null});return hojeSemEnvio("sem_registro",HOJE_MSG_SEM_ESPACO,null)}
      return hojeEnviar({chave:e.chave,entrada:e.entrada,snap:e.snap,fatos:null,pergunta:e.pergunta||"",rotulo:e.rotulo||"",det:null,uid:uid,reenvio:true,anterior:{estado:e.estado,quando:e.quando,codigo:e.codigo||null}})},null,true,function(){return o.chave?HOJE.ia[o.chave]||null:null})}
  /* a chamada em si (uma vez, com a chave e o pedido recebidos) e o que fazer com cada resposta */
  function hojeEnviar(c){var chave=c.chave,snap=c.snap,fatos=c.fatos||hojeFatosDoTexto(c.entrada.texto),chamada,antes=false;
    try{chamada=Promise.resolve(racIA("hoje","hoje.analise",{texto:c.entrada.texto,imagens:[]},{data:c.entrada.data},chave))}catch(e){antes=true;chamada=Promise.reject(e)}
    if(antes)return chamada.then(null,function(e){
      /* falhou antes de sair do navegador: nada foi enviado. No reenvio, o registro volta ao estado de antes (continua incerto) */
      if(c.reenvio)hojePendMarcar(chave,{estado:c.anterior.estado,quando:c.anterior.quando,codigo:c.anterior.codigo});else hojePendTirar(chave);
      return {ok:false,semEnvio:true,situacao:c.reenvio?"incerta":"livre",codigo:"antes_do_envio",cobranca:c.reenvio?"incerta":"nenhuma",chave:chave,deterministico:c.det,
        motivo:"Falhou antes de enviar ("+(e&&e.message||e)+"). Nada saiu do navegador por esta tentativa"+(c.reenvio?"; o registro anterior continua como estava, sem resposta e com cobrança desconhecida.":" e nada foi cobrado.")}});
    /* a resposta, quando vem: análise real e no formato (guardada) ou erro (e o que o servidor diz da chave); serve também à resposta que chega depois do prazo */
    function fechar(r){var res=r&&r.resultado;
      if(hojeUid()!==c.uid)return {ok:false,situacao:"incerta",codigo:"conta_mudou",cobranca:"incerta",chave:chave,deterministico:c.det,motivo:"A conta mudou enquanto a chamada estava no ar: o resultado não foi guardado nem mostrado. O registro da chamada continua na conta anterior."};
      /* só conta como análise a resposta REAL, concluída e no formato; DEMO ou erro nunca é apresentado como análise */
      if(!(r&&r.ok&&r.modo==="REAL"&&res&&!res._demo&&Array.isArray(res.atencao)&&res.atencao.length&&res.resumo)){
        var cl=hojeClassificar(r),cu=r&&r.consumo&&r.consumo.estimado_rac_usd,cod=r&&r.erro&&r.erro.codigo||null;
        if(cl.livre)hojePendTirar(chave);
        else hojePendMarcar(chave,{estado:cl.estado,quando:cl.estado==="enviada"?new Date().toISOString():undefined,codigo:cod,id:r&&r.id||null,estimado:cu!=null?cu:null,estadoServidor:r&&r.estado||null,cobranca:cl.cobranca,
          entrada:cl.estado==="consumida"?null:undefined,snap:cl.estado==="consumida"?null:undefined});
        var out={ok:false,motivo:(r&&r.mensagem)||"A IA não respondeu.",codigo:cod,id:r&&r.id||null,estado:r&&r.estado||null,consumo:r&&r.consumo||null,deterministico:c.det,chave:chave,
          situacao:cl.livre?"livre":hojeSituacao(hojePendLer()[chave]||{estado:cl.estado,quando:new Date().toISOString()},Date.now()),cobranca:cl.cobranca};
        if(cl.livre)out.motivo="Falha antes do envio: o servidor recusou o pedido antes de reservar a chamada ("+out.motivo+").";
        if(!cl.livre){var pe=hojePendLer()[chave];if(pe){var ed=hojeErroDePend(pe,Date.now());out.podeReenviar=ed.podeReenviar;out.podeNova=ed.podeNova;out.recuperavel=ed.recuperavel;out.soMemoria=ed.soMemoria;out.motivo=ed.motivo+" (resposta: "+out.motivo+")"}}
        return out}
      var a={id:r.id,chave:chave,quando:new Date().toISOString(),hoje:snap.hoje,resultado:res,consumo:r.consumo,avisos:r.avisos||[],
        pacote:snap.pacote,pergunta:c.pergunta,fatos:NUCLEO.hojeCitados(res,fatos),estados:snap.estados};
      /* nenhuma análise paga é descartada para abrir espaço: a nova entra junto das outras (o limite é verificado ANTES de enviar, em hojeLimites) */
      HOJE.mem[chave]=a;var c2=hojeLerLocal(HOJE_IA_CACHE,{});c2[chave]=a;
      /* o registro só sai se a análise ficou gravada no aparelho; se o navegador não deixou, o registro continua (consumida, sem conteúdo) e a análise fica só na memória da página */
      if(hojeGuardarLocal(HOJE_IA_CACHE,c2))hojePendTirar(chave);
      else hojePendMarcar(chave,{estado:"consumida",codigo:"nao_guardada",id:r.id||null,estimado:r.consumo&&r.consumo.estimado_rac_usd!=null?r.consumo.estimado_rac_usd:null,estadoServidor:r.estado||null,
        cobranca:r.consumo&&r.consumo.estimado_rac_usd>0?"provavel":"incerta",entrada:null,snap:null});
      return {ok:true,deCache:false,analise:a,deterministico:c.det,fatos:fatos,chave:chave,reenvio:!!c.reenvio}}
    HOJE.ia[chave]=hojePrazo(chamada,HOJE_IA_PRAZO).then(fechar,
      function(e){var tempo=/não respondeu em/.test(e&&e.message||"");
        hojePendMarcar(chave,{estado:"incerta",codigo:tempo?"tempo_esgotado":"rede",cobranca:"incerta"});
        /* passou do prazo mas a chamada continua: se a resposta chegar com a página aberta, ela é guardada (não se perde) */
        if(tempo)chamada.then(function(r){var f=fechar(r);if(HOJE.aoChegar)HOJE.aoChegar(f)},function(){});
        var ed=hojeErroDePend(hojePendLer()[chave]||{estado:"incerta",quando:new Date().toISOString(),chave:chave,rotulo:c.rotulo},Date.now());
        ed.motivo=(tempo?"":"Não consegui falar com a IA ("+(e&&e.message||e)+"). ")+ed.motivo;
        ed.codigo=tempo?"tempo_esgotado":"rede";ed.deterministico=c.det;ed.chave=chave;return ed})
      .then(function(r){delete HOJE.ia[chave];return r});
    return HOJE.ia[chave]}
  /* análises guardadas neste aparelho (as 8 últimas), da mais nova para a mais antiga. Só o dono: para a casa não devolve nada. */
  function hojeHistorico(){if(!SB||!isOwner())return [];var c=hojeCacheTudo();return Object.keys(c).map(function(k){return c[k]}).filter(function(a){return a&&a.resultado}).sort(function(a,b){return a.quando<b.quando?1:-1})}
  /* o pacote de fatos de agora, sem a pergunta e sem o ruído (tempo, notícias, Newsletter): é o que diz se uma análise guardada ainda vale.
     Não lê nada guardado: só transforma o x que recebe, por isso não precisa de trava de dono. */
  function hojePacote(x){var t=(x.fatos||[]).filter(function(f){return !NUCLEO.hojeRuido(f)}).map(function(f){return NUCLEO.hojeSemHoras(f.texto)}).join("\n");return NUCLEO.hojeChave(x.hoje,t,"",0)}
  /* o que aconteceria se o dono pedisse agora (sem chamar nada): a chave, se já está no cache, se há chamada sem resultado da mesma intenção e a base para estimar o custo */
  function hojePrever(x,pergunta,nova){pergunta=NUCLEO.hojeLimpar(pergunta||"").slice(0,500);
    var ident=NUCLEO.hojeTextoChave(x.texto),base=NUCLEO.hojeChave(x.hoje,ident,pergunta,0),tents=hojeLerLocal(HOJE_IA_TENT,{}),chave=NUCLEO.hojeChave(x.hoje,ident,pergunta,(tents[base]||0)+(nova?1:0)),
      cache=hojeCacheTudo(),abertas=hojePendDaIntencao(hojeIntencao(x.hoje,pergunta)),
      pe=nova?abertas.filter(function(e){return hojeSituacao(e,Date.now())==="em_curso"})[0]:(hojePendLer()[chave]||abertas[0]),
      usd=hojeHistorico().map(function(a){return a.consumo&&a.consumo.estimado_rac_usd}).filter(function(v){return typeof v==="number"&&v>=0});
    return {chave:chave,cache:!!cache[chave]&&!nova,pend:pe&&!cache[pe.chave]?hojeErroDePend(pe,Date.now()):null,
      custo:usd.length?{n:usd.length,min:Math.min.apply(null,usd),max:Math.max.apply(null,usd)}:null}}
  window.RAChoje={escopo:hojeEscopo,confirmar:hojeConfirmar,excluir:hojeExcluirAnalise,coletar:hojeColetar,montar:hojeMontar,analisar:hojeAnalisar,historico:hojeHistorico,pacote:hojePacote,prever:hojePrever,pendencias:hojePendencias,dispensar:hojeDispensar};

  /* ===== Tela do RAC Hoje (#rachoje). Abrir a tela só LÊ (coletor, regras do núcleo, cache deste aparelho e o histórico em ia_custos):
     a IA só é chamada pelos botões "Analisar" e "Perguntar", depois de uma confirmação explícita, e nunca no lugar de um erro
     aparece uma análise simulada. Só do dono. ===== */
  var HJ={x:null,corpo:null,sel:null,ocupado:false,erro:null,aviso:"",cfg:undefined,exibida:null,slotHist:null,slotPend:null,slotAviso:null,tmr:null};
  /* "Dados recentes" só com data conferida (ou registro de hoje); "Leitura realizada" é só leitura concluída, o dado pode ser antigo */
  var HJ_ESTADOS={ok:"Dados recentes",lida:"Leitura realizada",parcial:"Leitura parcial",vazia:"Sem dados",falhou:"Falhou",desatualizada:"Desatualizada",ausente:"Não lida"};
  var HJ_PRIO={alta:"Alta",media:"Média","média":"Média",baixa:"Baixa"};
  function hjQuando(iso){var d=new Date(iso);return isFinite(d.getTime())?d.toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):""}
  function hjDataBR(d){return /^\d{4}-\d{2}-\d{2}/.test(String(d||""))?String(d).slice(0,10).split("-").reverse().join("/"):""}
  function hjIdade(iso){var t=Date.parse(iso||"");if(!isFinite(t))return "";var m=Math.round((Date.now()-t)/60e3);return m<1?"há menos de 1 min":"há "+m+" min"}
  function hjModelo(m){return String(m||"").replace(/^claude-(\w+)-(\d+)-(\d+)$/,function(_,n,p,q){return "Claude "+n.charAt(0).toUpperCase()+n.slice(1)+" "+p+"."+q})}
  function hjConfig(){if(HJ.cfg!==undefined)return Promise.resolve(HJ.cfg);
    return Promise.resolve().then(function(){return SB.from("ia_config").select("cambio_brl_usd,margem_impostos").maybeSingle()}).then(sbOk).then(function(c){HJ.cfg=c||null;return HJ.cfg},function(){HJ.cfg=null;return null})}
  /* custo e uso da análise: estimativa do RAC (tokens informados pela API × tabela de preços); a fatura é a do Console */
  function hjCusto(a){var c=(a&&a.consumo)||{},u=c.uso_api||{},l=[];
    l.push(c.estimado_rac_usd!=null?"custo estimado "+NUCLEO.iaUsdFino(c.estimado_rac_usd)+(HJ.cfg?" (≈ "+NUCLEO.iaBrl(c.estimado_rac_usd,HJ.cfg)+")":""):"custo não informado");
    if(u.tokens_entrada!=null)l.push(NUCLEO.iaNum(u.tokens_entrada,0)+" → "+NUCLEO.iaNum(u.tokens_saida||0,0)+" tokens");return l.join(" · ")}
  function hjTag(txt,cls,dica){var t=h("span",{class:"hjtag "+(cls||"")},txt);if(dica)t.setAttribute("title",dica);return t}
  function hjLista(titulo,sub,itens){var p=panel(titulo,sub);p.appendChild(itens);return p}
  /* os ids dos fatos que sustentam um trecho, com a fonte de cada um quando a análise a guardou */
  function hjFatosTxt(ids,fontes){return (ids&&ids.length)?"Fatos: "+ids.map(function(i){return fontes&&fontes[i]?i+" ("+fontes[i]+")":i}).join(", "):""}
  /* dias entre duas datas AAAA-MM-DD (sem hora); null se alguma não for data */
  function hjDias(de,ate){var a=Date.parse(String(de||"").slice(0,10)+"T12:00:00Z"),b=Date.parse(String(ate||"").slice(0,10)+"T12:00:00Z");return isFinite(a)&&isFinite(b)?Math.round((b-a)/864e5):null}
  function hjHa(n){return n==null?"":n<=0?"hoje":n===1?"ontem":"há "+n+" dias"}
  /* de onde veio cada fonte e o que se sabe da data dela. "hoje" é o dia da coleta (ou da análise). Nada de limite inventado: só a data e há quantos dias ela é. */
  function hjInfoFonte(e,hoje){var p=[];p.push(e.origem||"origem não informada");if(e.nota)p.push(e.nota);
    if(e.estado==="ok"||e.estado==="desatualizada"||e.estado==="parcial"){
      var n=e.ultimo?hjDias(e.ultimo,hoje):null;
      if(e.ultimo)p.push("último registro em "+hjDataBR(e.ultimo)+(n!=null?" ("+hjHa(n)+")":""));
      else if(e.quando)p.push("dado de "+hjQuando(e.quando));
      else p.push("data não disponível: a leitura foi concluída, mas não se sabe a idade dos dados")}
    else if(e.estado==="vazia")p.push("a leitura funcionou, mas não há registros");
    return p.join(" · ")}
  /* o selo de uma fonte: verde ("Dados recentes") só quando a data foi conferida ou o último registro é de hoje; senão "Leitura realizada", neutro, com a data ao lado */
  function hjSeloFonte(e,hoje){var est=e.estado,cls="hje-"+est,txt=HJ_ESTADOS[est]||est,dica=null;
    if(est==="ok"){
      if(e.quando){dica="A data própria da fonte foi conferida e está dentro do limite do RAC."}
      else if(e.ultimo&&e.ultimo===hoje){dica="O último registro é de hoje."}
      else{cls="hje-lida";txt=HJ_ESTADOS.lida;dica=e.ultimo?"A leitura funcionou; o último registro é de "+hjDataBR(e.ultimo)+". Isso não diz se os dados estão em dia.":"A leitura funcionou, mas a fonte não informa data: a idade dos dados não foi conferida."}}
    return hjTag(txt,cls,dica)}
  function hjOrigens(est){var c={};est.forEach(function(e){if(e.origem&&e.estado!=="ausente"&&e.estado!=="falhou")c[e.origem]=(c[e.origem]||0)+1});
    return Object.keys(c).map(function(k){return k+" ("+c[k]+")"}).join(", ")}
  function hjLinhaFonte(e,hoje){return h("li",null,h("span",{class:"grow"},h("b",{text:e.nome}),e.detalhe?h("span",{class:"sub",text:e.detalhe}):null,h("span",{class:"sub",text:hjInfoFonte(e,hoje)})),hjSeloFonte(e,hoje))}
  /* a confirmação antes da chamada: o que vai acontecer (cache ou cobrança nova) e uma estimativa só se houver base */
  function hjAviso(x,pergunta,nova){var pv=hojePrever(x,pergunta,nova);
    if(pv.pend){pv.pend.pedido=pergunta?{pergunta:NUCLEO.hojeLimpar(pergunta).slice(0,500)}:{};return {erro:pv.pend}}
    if(pv.cache)return {paga:false,texto:"Esta análise já está guardada neste aparelho, com os mesmos dados. Será mostrada sem chamar a IA e sem cobrança."};
    var t="Isto faz uma chamada paga ao Claude Sonnet 5.5 pelo RAC Intelligence, com o orçamento de IA da casa.";
    if(nova)t+=" Já existe uma análise com estes mesmos dados: esta é uma NOVA cobrança.";
    var c=pv.custo;
    t+=c?" Pelas "+c.n+(c.n===1?" análise guardada":" análises guardadas")+" neste aparelho, cada chamada custou "+(c.min===c.max?NUCLEO.iaUsdFino(c.min):"entre "+NUCLEO.iaUsdFino(c.min)+" e "+NUCLEO.iaUsdFino(c.max))+" (estimativa do RAC; não é valor garantido, a fatura é a do Console)."
      :" Ainda não há base neste aparelho para estimar o custo; o valor real é o da fatura do Console.";
    return {paga:true,texto:t+" Nada é gravado nem executado pela IA."}}
  /* ===== Painel (Fase 3 · piloto do Design System RAC): a MESMA informação e as MESMAS regras de antes, recompostas como painel central. Nada novo é lido ou
     inventado: cada bloco usa o que a coleta e o núcleo (NUCLEO.hoje*) já entregam, e some quando a fonte não trouxe dado. A IA, o cache, a cobrança e as
     chamadas sem resultado continuam exatamente nas funções de antes (hjAnalisar, hjBotaoPago, hjAnalise, hjErro, hjPint*). ===== */
  /* o módulo dono de cada área (os ids são os do registro de rotas, js/rotas.js): cada item do painel leva para onde o dado vive */
  var HJ_DESTINO={agenda:"#agenda",tarefas:"#lista",mba:"#mba",compras:"#compras",saude:"#saude",vagas:"#vagas",mercado:"#mercado",alimentacao:"#alimentacao",financas:"#mercado",newsletter:"#newsletter",noticias:"#inicio"};
  var HJ_NOMES_FIN={mercado:"Mercado",alimentacao:"Pedidos de comida",compras:"Compras online"};
  function hjDestino(it){if(it.href&&String(it.href).charAt(0)==="#")return it.href;var f=(it.fontes||[]).filter(function(k){return HJ_DESTINO[k]})[0];return f?HJ_DESTINO[f]:null}
  function hjPrazoTxt(it){return it.dias==null?"":it.dias<0?"atrasado há "+(-it.dias)+(it.dias===-1?" dia":" dias"):it.dias===0?"hoje":it.dias===1?"amanhã":"em "+it.dias+" dias"}
  function hjFonteDoDia(k){var c=HOJE.coleta&&HOJE.coleta.fontes&&HOJE.coleta.fontes[k];return c&&c.ok&&c.v?c.v:null}
  /* uma frase só sobre o dia, só com contagens que existem nos itens */
  function hjResumoDia(x){var it=x.itens||[],alta=it.filter(function(i){return i.nivel==="alta"}).length,atr=it.filter(function(i){return i.dias!=null&&i.dias<0}).length,hoje=it.filter(function(i){return i.dias===0}).length,p=[];
    if(!it.length)return "Nada pedindo atenção nas fontes lidas.";
    if(alta)p.push(alta+(alta===1?" prioridade alta":" prioridades altas"));if(atr)p.push(atr+(atr===1?" item atrasado":" itens atrasados"));if(hoje)p.push(hoje+(hoje===1?" para hoje":" para hoje"));
    p.push(it.length+(it.length===1?" item no total":" itens no total"));return p.join(" · ")+"."}
  function hjKpis(x){var k=[],f=x.financas,s=x.saude,it=x.itens||[];
    var atr=it.filter(function(i){return i.dias!=null&&i.dias<0}).length,alta=it.filter(function(i){return i.nivel==="alta"}).length,aten=it.filter(function(i){return i.nivel==="alta"||(i.dias!=null&&i.dias<0)}).length;
    k.push(rkKpi({rotulo:"Pede atenção",valor:aten,alerta:aten>0,apoio:aten?(atr?atr+(atr===1?" atrasado":" atrasados")+(alta?" · ":""):"")+(alta?alta+" de prioridade alta":""):"nada urgente agora"}));
    if(f&&f.fontes.length)k.push(rkKpi({rotulo:"Gasto no mês",valor:NUCLEO.hojeReais(f.total),delta:rkDelta(f.pct,"alta","vs. mês passado"),href:"#mercado",apoio:"até o dia "+f.dia+" · "+f.fontes.map(function(n){return HJ_NOMES_FIN[n]}).join(", ")}));
    if(f&&f.orcamento)k.push(rkKpi({rotulo:"Orçamento usado",valor:f.orcamento.pct+"%",meter:rkMedidor(f.orcamento.pct,f.orcamento.projecaoPct,"Orçamento usado",f.orcamento.projecaoPct!=null?"projeção do mês: "+f.orcamento.projecaoPct+"% de "+NUCLEO.hojeReais(f.orcamento.valor):"de "+NUCLEO.hojeReais(f.orcamento.valor)),
      apoio:"de "+NUCLEO.hojeReais(f.orcamento.valor)+(f.orcamento.projecaoPct!=null?" · projeção "+f.orcamento.projecaoPct+"%":"")}));
    else if(f&&f.projecao!=null)k.push(rkKpi({rotulo:"Projeção do mês",valor:NUCLEO.hojeReais(f.projecao),apoio:"no ritmo atual de gastos"}));
    if(s&&!s.semDados&&s.prontidao!=null)k.push(rkKpi({rotulo:"Prontidão",valor:s.prontidao,href:"#saude",apoio:(s.rotulo||"")+(s.atraso>1?" · dados de "+s.atraso+" dias atrás":"")}));
    return k}
  /* prioridades: as mesmas regras do núcleo (x.itens), cada linha leva ao módulo do dado; as 5 primeiras, o resto sob demanda */
  function hjCardPrioridades(x){var itens=x.itens||[],corpo=h("div",{class:"rac-pilha",style:"gap:8px"});
    function linha(it){var d=hjPrazoTxt(it),nv=String(it.nivel).replace("é","e");
      return {titulo:it.titulo,sub:[d,it.sub].filter(Boolean).join(" · "),href:hjDestino(it),marca:nv==="alta"?"alta":nv==="media"?"media":null,
        meta:rkSelo(nv==="alta"?"erro":nv==="media"?"aviso":"neutro",HJ_PRIO[it.nivel]||it.nivel)}}
    if(!itens.length)corpo.appendChild(rkEstado("vazio","Nada pedindo atenção nas fontes lidas."));
    else{var lista=h("div",null,rkLista(itens.slice(0,5).map(linha)));corpo.appendChild(lista);
      if(itens.length>5){var mais=rkBtn("ter","Mostrar todas ("+itens.length+")",{"aria-expanded":"false"}),aberto=false;
        mais.onclick=function(){aberto=!aberto;lista.innerHTML="";lista.appendChild(rkLista((aberto?itens:itens.slice(0,5)).map(linha)));mais.textContent=aberto?"Mostrar menos":"Mostrar todas ("+itens.length+")";mais.setAttribute("aria-expanded",aberto?"true":"false")};
        corpo.appendChild(mais)}}
    if(x.mudancas.length){corpo.appendChild(h("span",{class:"rac-t-rotulo rac-grupo-rotulo",text:"O que mudou desde ontem"}));
      corpo.appendChild(rkLista(x.mudancas.map(function(m){return {titulo:m.texto,href:HJ_DESTINO[m.area]||null}}),true))}
    var c=rkCard("Prioridades do dia",corpo,{sub:"Ordenadas pelas regras do RAC (atraso, prazo e área), sem IA.",classe:"rh-prio"});c.id="rh-prio";return c}
  /* gastos: este mês × mesmo trecho do mês passado, por origem (a conta é a do núcleo: NUCLEO.hojeFinancas) */
  function hjCardGastos(x){var f=x.financas;if(!f||!f.fontes.length)return null;
    var L=f.fontes.map(function(n){return {nome:HJ_NOMES_FIN[n],atual:f.atual[n]||0,anterior:f.anterior[n]||0,txtAtual:NUCLEO.hojeReais(f.atual[n]||0),txtAnterior:NUCLEO.hojeReais(f.anterior[n]||0)}});
    var corpo=h("div",{class:"rac-grafico rac-pilha"},rkComparar(L,"Este mês","Mês passado"));
    return rkCard("Gastos do mês",corpo,{sub:"Do dia 1º ao dia "+f.dia+", contra o mesmo trecho do mês passado.",acao:rkLink("ter","Ver na Central","#mercado"),origem:f.delta>0?"Total "+NUCLEO.hojeReais(f.total)+": "+NUCLEO.hojeReais(f.delta)+" a mais que no mesmo trecho do mês passado.":"Total "+NUCLEO.hojeReais(f.total)+(f.totalAnt?": "+NUCLEO.hojeReais(-f.delta)+" a menos que no mesmo trecho do mês passado.":".")})}
  /* contexto do dia: tempo, jogo, destaques da Newsletter e notícias (as mesmas fontes lidas; cada bloco leva ao seu módulo) */
  function hjCardContexto(x){var itens=[],tempo=hjFonteDoDia("tempo"),esp=hjFonteDoDia("esportes"),nl=hjFonteDoDia("newsletter"),nt=hjFonteDoDia("noticias");
    if(typeof tempo==="string")itens.push(rkInfo("⛅","Tempo",tempo.replace(/^Em Sorocaba:\s*/,"Sorocaba: ")));
    if(typeof esp==="string")itens.push(rkInfo("⚾","Dodgers",esp,"#esportes"));
    if(nl&&nl.destaques&&nl.destaques.length)itens.push(rkInfo("📰","Na Newsletter",nl.destaques.slice(0,2).map(function(g){return g.t}).join(" · "),"#newsletter"));
    if(nt&&nt.length)itens.push(rkInfo("📍","Sorocaba",nt.slice(0,2).map(function(n){return n.t}).join(" · "),"#inicio"));
    if(!itens.length)return null;return rkCard("Contexto do dia",h("div",{class:"rh-ctx-lista"},itens))}
  /* saúde: passos dos últimos dias (série real do relógio) e treinos da semana por tipo; só com dados */
  function hjCardSaude(x){var s=x.saude;if(!s||s.semDados)return null;var corpo=h("div",{class:"rac-pilha rac-grafico"}),sf=hjFonteDoDia("saude"),dias=(sf&&sf.dias||[]).filter(function(d){return d.dados&&d.dados.passos>0}).slice(-10);
    if(dias.length>=3){var B=dias.map(function(d){var p=d.data.split("-");return {nome:p[2]+"/"+p[1],cima:p[2]+"/"+p[1],baixo:""}}),V=dias.map(function(d){return d.dados.passos});
      corpo.appendChild(h("div",null,h("span",{class:"rac-t-rotulo",text:"Passos por dia"}),rsColunas(B,V,function(v){return NUCLEO.iaNum(v,0)},function(i,v){return [B[i].nome,NUCLEO.iaNum(v,0)+" passos"]})))}
    var tipos=Object.keys(s.tipos7||{}).sort(function(a,b){return s.tipos7[b]-s.tipos7[a]});
    if(tipos.length)corpo.appendChild(h("div",null,h("span",{class:"rac-t-rotulo",text:"Treinos nos últimos 7 dias"}),rsBarras(tipos.map(function(k){return {nome:k.replace(/_/g," "),v:s.tipos7[k],txt:String(s.tipos7[k]),dica:s.tipos7[k]+(s.tipos7[k]===1?" atividade":" atividades")}}))));
    var sub=[s.prontidao!=null?"prontidão "+s.prontidao+(s.rotulo?" ("+s.rotulo+")":""):"",s.semTreino!=null?"último treino há "+s.semTreino+(s.semTreino===1?" dia":" dias"):""].filter(Boolean).join(" · ");
    if(s.alertas&&s.alertas.length)corpo.appendChild(rkAlerta("aviso","Atenção na recuperação",s.alertas.join("; ")));
    return rkCard("Saúde e treino",corpo,{sub:sub||"Dados do relógio.",acao:rkLink("ter","Abrir Saúde","#saude"),origem:"Último dia com dados: "+hjDataBR(s.ultimo)+(s.atraso>1?" ("+s.atraso+" dias atrás; a Saúde se sincroniza pelo botão próprio)":"")})}
  function hjPontos(est){var p=h("span",{class:"rh-pontos","aria-hidden":"true"});est.forEach(function(e){var c=e.estado==="falhou"?"erro":e.estado==="ausente"?"neutro":(e.estado==="ok"||e.estado==="lida")?"":"aviso";p.appendChild(h("i",{class:c}))});return p}
  function hjDesenhar(){
    var x=HJ.x,corpo=HJ.corpo;if(!x||!corpo)return;corpo.innerHTML="";
    var hist=hojeHistorico(),a=hist.filter(function(y){return y.chave===HJ.sel})[0]||hist[0]||null,pacote=hojePacote(x),def=a?NUCLEO.hojeDefasagem(a,pacote,x.hoje,Date.now()):null,
      uteis=NUCLEO.hojeFontesUteis(x.estados),qual=NUCLEO.hojeQualidadeFontes(x.estados),prev=hojePrever(x,"",false);
    /* 0. abertura: saudação, o dia numa frase, contexto e as duas ações de sempre (reler as fontes, custos de IA) */
    var agora=new Date(),rel=rkBtn("fantasma","↻ Reler as fontes"),cus=rkLink("fantasma","Custos de IA","#iacustos"),ctx=h("div",{class:"rh-hero-ctx"}),tempo=hjFonteDoDia("tempo"),esp=hjFonteDoDia("esportes");
    rel.onclick=function(){if(HJ.ocupado)return;HJ.erro=null;HJ.aviso="";hjCarregar(true)};
    if(typeof tempo==="string")ctx.appendChild(h("span",{class:"rh-chip"},"⛅ "+tempo.replace(/^Em Sorocaba:\s*/,"Sorocaba: ").replace(/\.$/,"")));
    if(typeof esp==="string")ctx.appendChild(h("span",{class:"rh-chip"},"⚾ "+esp.replace(/\.$/,"")));
    corpo.appendChild(h("section",{class:"rh-hero","aria-label":"Visão geral do dia"},
      h("div",null,h("h2",{text:saudacao()+", Rayner"}),h("p",{class:"rh-hero-data",text:agora.toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}),
        h("p",{class:"rh-hero-resumo",text:hjResumoDia(x)+" Abrir esta tela só lê os seus dados; a IA é chamada somente quando você confirma."})),
      h("div",{class:"rh-hero-acoes"},rel,cus),ctx.children.length?ctx:null));
    var falhas=x.estados.filter(function(e){return e.estado==="falhou"});
    if(falhas.length)corpo.appendChild(h("div",{class:"rh-largo"},rkAlerta("aviso",falhas.length+(falhas.length===1?" fonte falhou":" fontes falharam"),falhas.map(function(e){return e.nome}).join(", ")+". O resto do painel continua valendo; a lista completa está em \"Fontes de informação\", mais abaixo.")));
    /* 1. indicadores */
    var ks=hjKpis(x);corpo.appendChild(h("section",{class:"rh-kpis","aria-label":"Indicadores"},ks));
    /* 2. o que resolver (regras do núcleo) e, ao lado, gastos e contexto */
    corpo.appendChild(hjCardPrioridades(x));
    var lado=h("div",{class:"rh-lado"}),cg=hjCardGastos(x),cc=hjCardContexto(x);if(cg)lado.appendChild(cg);if(cc)lado.appendChild(cc);if(lado.children.length)corpo.appendChild(lado);
    var cs=hjCardSaude(x);if(cs){cs.className+=" rh-largo rh-saude";corpo.appendChild(cs)}
    /* 3. análise da IA e pergunta (a lógica, o cache e a cobrança são os de antes) */
    var pa=h("div",{class:"rac-pilha"});HJ.slotAviso=h("div");pa.appendChild(HJ.slotAviso);
    if(HJ.aviso)pa.appendChild(h("p",{class:"rac-t-sec",role:"status",style:"margin:0",text:HJ.aviso}));
    if(HJ.ocupado)pa.appendChild(rkEstado("carregando","Analisando com a IA… pode levar até 2 minutos. Não toque de novo: uma chamada só é feita."));
    if(HJ.erro)pa.appendChild(hjErro(HJ.erro));
    if(prev.pend&&!(HJ.erro&&HJ.erro.chave===prev.pend.chave))pa.appendChild(hjErro(prev.pend));
    if(a)pa.appendChild(hjAnalise(a,def));
    else if(!HJ.ocupado)pa.appendChild(rkEstado("vazio","Ainda não há análise da IA neste aparelho. Nada foi chamado ao abrir a tela."));
    var existe=hist.some(function(y){return y.pacote===pacote&&!y.pergunta&&y.hoje===x.hoje});
    if(!uteis.ok)pa.appendChild(h("p",{class:"hjdef",role:"note",text:"⚠ Análise bloqueada. "+uteis.motivo}));
    else if(!prev.pend)pa.appendChild(hjBotaoPago(existe?"✨ Analisar de novo (nova cobrança)":"✨ Analisar o dia",function(){return hjAviso(x,"",existe)},function(){hjAnalisar({nova:existe})}));
    var pq=h("div",{class:"rac-pilha"});
    if(!uteis.ok)pq.appendChild(h("p",{class:"hjdef",role:"note",text:"⚠ Perguntas bloqueadas. "+uteis.motivo}));
    else{
      var campo=h("textarea",{rows:"2",maxlength:"500",placeholder:"Ex.: o que devo resolver primeiro hoje?","aria-label":"Pergunta sobre os dados de hoje"});
      campo.disabled=HJ.ocupado;
      pq.appendChild(h("div",{class:"wform hjperg"},h("label",null,"Sua pergunta",campo)));
      pq.appendChild(hjBotaoPago("Perguntar",function(){var t=campo.value.trim();if(!t)return {texto:"Escreva a pergunta antes de confirmar.",semConfirmar:true};return hjAviso(x,t,false)},
        function(){var t=campo.value.trim();if(!t){HJ.aviso="Escreva a pergunta antes de confirmar.";hjDesenhar();return}hjAnalisar({pergunta:t})}));
      pq.appendChild(h("p",{class:"rac-t-sec",style:"margin:0",text:"A mesma pergunta com os mesmos dados não é cobrada de novo (vem do cache deste aparelho). Mudanças só no tempo, nas notícias ou na Newsletter não contam como dados novos."}))}
    corpo.appendChild(h("div",{class:"rh-dois"},rkCard("Análise da IA",pa,{sub:"Interpretação feita pelo Claude sobre os fatos do painel. Só acontece quando você pede."}),
      rkCard("Pergunte sobre o seu dia",pq,{sub:"A IA responde só com os fatos acima; se eles não bastarem, ela diz isso."})));
    /* 4. histórico e fontes: detalhe técnico recolhido (o conteúdo continua inteiro, é só abrir) */
    var ph=h("div",{class:"rac-pilha"});
    HJ.exibida=a?a.chave:null;HJ.slotHist=h("div");HJ.slotPend=h("div");
    ph.appendChild(h("p",{class:"rac-t-sec",style:"margin:0",text:"Duas origens diferentes: o que está guardado só neste aparelho (com o conteúdo) e o registro de chamadas do banco (só estado e custo, nunca o texto da análise)."}));
    ph.appendChild(HJ.slotHist);ph.appendChild(HJ.slotPend);hjPintarHist();hjPintarPend();hjPintarAviso();
    var banco=h("div",null,h("p",{class:"sub",text:"Lendo o registro de chamadas…"}));ph.appendChild(h("span",{class:"rac-t-rotulo",text:"Registro de chamadas no banco (ia_custos)"}));ph.appendChild(banco);
    hjRegistro(banco);
    corpo.appendChild(h("div",{class:"rh-largo"},rkRecolher("Histórico recente",null,ph)));
    var pf=h("div",{class:"rac-pilha"});
    pf.appendChild(h("p",{class:"rac-t-sec",style:"margin:0",text:"Coleta feita"+(x.coletado?" às "+hjQuando(x.coletado).slice(-5)+" ("+hjIdade(x.coletado)+")":"")+". Só leitura; cada coleta vale por até 10 minutos. Origem: "+(hjOrigens(x.estados)||"nenhuma fonte lida")+
      ". \"Memória do site\" é dado já carregado, não relido aqui. Uma fonte que falha não derruba as outras."}));
    pf.appendChild(h("p",{class:"rac-t-sec",style:"margin:0",text:"\"Reler as fontes\" lê de novo o banco e os arquivos do site. Vagas, MBA, a Newsletter já aberta e o Tempo do Início vêm da memória do site e não são buscados de novo aqui (a origem de cada fonte aparece abaixo)."}));
    pf.appendChild(h("p",{class:"rac-t-sec",style:"margin:0",text:"\"Leitura realizada\" quer dizer só que a leitura funcionou e trouxe registros: o dado pode ser de semanas atrás, e a data do último registro (quando a fonte tem) aparece em cada linha. \"Dados recentes\" só aparece quando a data foi conferida (Vagas, Newsletter, Notícias, Saúde e Tempo) ou o último registro é de hoje."}));
    pf.appendChild(h("ul",{class:"wl hjfontes"},x.estados.map(function(e){return hjLinhaFonte(e,x.hoje)})));
    corpo.appendChild(h("div",{class:"rh-largo"},rkRecolher("Fontes de informação",h("span",{class:"rh-fontes-resumo"},hjPontos(x.estados),h("span",{class:"rac-t-sec",text:qual.resumo})),pf)))}
  /* Atualização entre abas: só estes três trechos são repintados (nunca a pergunta digitada, o foco nem uma confirmação aberta). Só leem o armazenamento. */
  function hjPintarHist(){var box=HJ.slotHist,x=HJ.x;if(!box||!x)return;box.innerHTML="";var hist=hojeHistorico(),pacote=hojePacote(x);
    box.appendChild(h("h3",{class:"dayh",text:"Guardadas neste aparelho"}));
    if(!hist.length){box.appendChild(h("p",{class:"empty",text:"Nenhuma análise guardada neste aparelho."}));return}
    box.appendChild(h("ul",{class:"wl hjhist"},hist.map(function(y){var d=NUCLEO.hojeDefasagem(y,pacote,x.hoje,Date.now()),em=y.chave===HJ.exibida,b=h("button",{type:"button",class:"ghostbtn",text:em?"Em exibição":"Ver"});
      b.disabled=em;b.onclick=function(){HJ.sel=y.chave;HJ.erro=null;HJ.aviso="";hjDesenhar()};
      var li=h("li",null,h("span",{class:"grow"},h("b",{text:(y.pergunta?"Pergunta: "+y.pergunta:"Análise do dia")}),h("span",{class:"sub",text:hjQuando(y.quando)+" · "+hjCusto(y)+" · "+(d&&d.atual?"mesmos dados de agora":"desatualizada")})),b);
      li.appendChild(hjBotaoPago("Excluir análise",{paga:true,rotuloOk:"Excluir esta análise",texto:"Isto apaga o texto desta análise deste aparelho. O servidor não guarda o texto: não dá para recuperá-la, e uma nova análise é uma nova cobrança. Nada mais é apagado."},function(){hojeExcluirAnalise(y.chave);if(HJ.sel===y.chave)HJ.sel=null;hjDesenhar()}));
      return li})))}
  function hjPintarPend(){var box=HJ.slotPend;if(!box)return;box.innerHTML="";var pend=hojePendencias();if(!pend.length)return;
    box.appendChild(h("h3",{class:"dayh",text:"Chamadas sem resultado neste aparelho"}));
    box.appendChild(h("p",{class:"sub",text:"Saíram para a IA e não voltaram com uma análise guardada. Não são análises: não têm conteúdo para abrir. Nenhum registro some sozinho (nem pelo tempo, nem pela quantidade): só quando o resultado chega, quando o servidor recusa antes de reservar, ou quando você o dispensa."}));
    box.appendChild(h("ul",{class:"wl hjhist"},pend.map(function(r){var li=h("li",null,h("span",{class:"grow"},h("b",{text:r.rotulo||"Chamada"}),
      h("span",{class:"sub",text:[hjQuando(r.quando),hjSituacaoTxt(r),hojeCobrancaTxt(r.cobranca,r.consumo&&r.consumo.estimado_rac_usd),r.soMemoria?"atualização só na memória desta página":""].filter(Boolean).join(" · ")})));
      if(r.situacao!=="em_curso")li.appendChild(hjBotaoPago("Dispensar registro",{paga:true,rotuloOk:"Dispensar este registro",texto:HOJE_TXT_DISPENSAR},function(){hojeDispensar(r.chave);hjDesenhar()}));
      return li})))}
  /* o aviso de outra aba: só diz o que há; as opções (reenviar, nova análise) aparecem ao reler as fontes ou na próxima ação desta aba */
  function hjPintarAviso(){var box=HJ.slotAviso;if(!box)return;box.innerHTML="";var pend=hojePendencias(),curso=pend.filter(function(r){return r.situacao==="em_curso"});
    if(curso.length)box.appendChild(h("p",{class:"hjdef",role:"status",text:"⏳ Há uma chamada em andamento (esta aba ou outra aberta neste aparelho). Novas análises ficam bloqueadas até ela terminar; o resultado aparece aqui quando chegar. Nada é enviado sozinho."}));
    else if(pend.length)box.appendChild(h("p",{class:"hjdef",role:"status",text:"⚠ Há "+pend.length+(pend.length===1?" chamada sem resultado":" chamadas sem resultado")+" neste aparelho (veja em Histórico recente). Ao tentar a mesma análise, as opções aparecem."}))}
  function hjEntreAbas(){HJ.tmr=null;if(!HJ.corpo||!HJ.x||HJ.ocupado||!isOwner())return;
    try{hjPintarHist();hjPintarPend();hjPintarAviso()}catch(e){logErro("hoje",e)}}
  function hjSituacaoTxt(r){return r.situacao==="em_curso"?"em andamento":r.situacao==="consumida"?"não recuperável":r.situacao==="incerta"?"resultado incerto":""}
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
  /* a análise em exibição: o que é fato, o que é inferência, de onde veio, com que fontes e quanto custou */
  function hjAnalise(a,def){var r=a.resultado,box=h("div",{class:"hjanalise"}),q=a.estados&&a.estados.length?NUCLEO.hojeQualidadeFontes(a.estados):null,
      fonteDe={};(a.fatos||[]).forEach(function(f){fonteDe[f.id]=f.fonte});
    /* dois selos separados: o pacote de dados bate com o de agora? e as fontes que a alimentaram tinham ressalva? */
    box.appendChild(h("div",{class:"hjmeta"},
      def&&def.atual?hjTag("Mesmos dados de agora","hje-ok","O pacote de dados é igual ao de agora e a análise tem menos de 6 horas. Não diz que as fontes estavam em dia."):hjTag("Desatualizada","hje-desatualizada"),
      q?(q.comRessalva?hjTag("Fontes com ressalva ("+q.problemas.length+")","hje-desatualizada","Veja quais abaixo."):hjTag("Fontes lidas com dados","hje-lida","Todas as fontes responderam com dados; a idade só foi conferida nas que têm data própria. Não garante dados recentes.")):hjTag("Fontes não registradas","hje-ausente"),
      h("span",{class:"sub",text:"Feita em "+hjQuando(a.quando)+" · "+hjModelo(a.consumo&&a.consumo.modelo||"claude-sonnet-5-5")+" · "+hjCusto(a)})));
    box.appendChild(h("p",{class:"sub",text:"A hora é a da análise, não a dos dados. \"Mesmos dados de agora\" compara os fatos com os de agora; não garante que as fontes estivessem em dia."}));
    if(def&&!def.atual)box.appendChild(h("p",{class:"hjdef",role:"note",text:"⚠ "+def.motivo+" Peça uma nova análise se precisar de uma leitura atual."}));
    if(q&&q.comRessalva)box.appendChild(h("p",{class:"hjdef",role:"note",text:"⚠ Feita com fontes com ressalva: "+q.problemas.map(function(p){return p.nome+" ("+(HJ_ESTADOS[p.estado]||p.estado).toLowerCase()+(p.detalhe?", "+p.detalhe:"")+")"}).join("; ")+"."}));
    if(q){var df=h("details",{class:"famvals hjfatos"},h("summary",{text:"Fontes no momento da análise ("+q.resumo+")"}));
      df.appendChild(h("ul",{class:"wl hjfontes"},a.estados.map(function(e){return hjLinhaFonte(e,a.hoje)})));box.appendChild(df)}
    else box.appendChild(h("p",{class:"sub",text:"O estado das fontes não foi guardado nesta análise (feita antes desta versão): não dá para saber quais tinham ressalva."}));
    if(a.pergunta)box.appendChild(h("p",{class:"sub",text:"Pergunta: "+a.pergunta}));
    box.appendChild(h("h3",{class:"dayh",text:"Resumo"}));box.appendChild(h("p",{class:"sub",text:"Interpretação escrita pela IA: pode juntar fatos e inferências. A base são os fatos citados."}));
    box.appendChild(h("p",{class:"hjtexto",text:r.resumo}));box.appendChild(h("p",{class:"sub",text:hjFatosTxt(r.resumo_fatos,fonteDe)}));
    if(r.resposta){box.appendChild(h("h3",{class:"dayh",text:"Resposta à sua pergunta"}));box.appendChild(h("p",{class:"sub",text:"Resposta escrita pela IA: interpretação sobre os fatos citados, não um registro."}));
      box.appendChild(h("p",{class:"hjtexto",text:r.resposta.texto}));box.appendChild(h("p",{class:"sub",text:hjFatosTxt(r.resposta.fatos,fonteDe)}))}
    box.appendChild(h("h3",{class:"dayh",text:"O que merece atenção"}));
    box.appendChild(h("p",{class:"sub",text:"\"Fato\" e \"Inferência\" são a classificação da própria IA. O RAC confere que cada trecho cita fatos do pacote e que os números existem neles; não confere se a classificação está certa."}));
    box.appendChild(h("ul",{class:"wl hjitens"},(r.atencao||[]).map(function(t){var fato=t.natureza==="fato";
      return h("li",null,h("span",{class:"grow"},h("b",{text:t.titulo}),h("span",{class:"sub",text:t.por_que}),h("span",{class:"sub",text:hjFatosTxt(t.fatos,fonteDe)})),
        h("span",{class:"hjtags"},hjTag(fato?"Fato (segundo a IA)":"Inferência (da IA)",fato?"hjn-fato":"hjn-inf",fato?"Classificação feita pela própria IA; o RAC conferiu as citações e os números, não a classificação.":"Interpretação da IA a partir dos fatos citados; não é um registro."),hjTag(HJ_PRIO[t.prioridade]||t.prioridade,"hjp-"+t.prioridade)))})));
    function inf(titulo,sub,l,rotulo,cls,dica){if(!l||!l.length)return;box.appendChild(h("h3",{class:"dayh",text:titulo}));box.appendChild(h("p",{class:"sub",text:sub}));
      box.appendChild(h("ul",{class:"wl hjitens"},l.map(function(t){return h("li",null,h("span",{class:"grow"},h("span",{class:"hjtexto",text:t.texto}),h("span",{class:"sub",text:hjFatosTxt(t.fatos,fonteDe)})),hjTag(rotulo,cls,dica))})))}
    inf("Relações entre módulos","Ligações que a IA enxergou entre fontes diferentes. São inferências, não fatos registrados.",r.relacoes,"Inferência (da IA)","hjn-inf","Interpretação da IA que liga fontes diferentes; não é um registro.");
    inf("Recomendações","Sugestões da IA. Ela não executa nada: você decide.",r.recomendacoes,"Recomendação da IA","hjn-sug","Sugestão da IA: o que ela recomenda fazer. Não é um fato; você decide.");
    box.appendChild(h("h3",{class:"dayh",text:"Incertezas"}));
    box.appendChild(h("p",{class:"sub",text:"Limites apontados pela IA: o que ela disse não saber ou não poder confirmar. Não inclui o que ela não percebeu."}));
    box.appendChild(r.incertezas&&r.incertezas.length?h("ul",{class:"wl hjitens"},r.incertezas.map(function(t){return h("li",null,h("span",{class:"grow"},h("span",{class:"sub",text:t})))})):h("p",{class:"empty",text:"A IA não apontou incertezas (isso não quer dizer que não existam)."}));
    var fatos=a.fatos||[],d=h("details",{class:"famvals hjfatos"},h("summary",{text:"Fatos utilizados ("+fatos.length+")"}));
    if(fatos.length)d.appendChild(h("ul",{class:"wl hjitens"},fatos.map(function(f){return h("li",null,h("span",{class:"grow"},h("b",{text:f.id+" · "+f.fonte}),h("span",{class:"sub",text:f.texto})))})));
    else d.appendChild(h("p",{class:"empty",text:"Esta análise foi guardada antes do registro dos fatos citados."}));
    box.appendChild(d);
    if((a.avisos||[]).length)box.appendChild(h("p",{class:"sub",text:a.avisos.join(" ")}));
    return box}
  /* uma chamada que não virou análise, ou ficou sem resultado: o motivo, o que foi cobrado (se for o caso), se dá para recuperar e as saídas explícitas.
     Nada simulado ocupa o lugar da análise, e nada é repetido sozinho. */
  function hjErro(r){var c=r.consumo||{},box=h("div",{class:"hjerro",role:"alert"}),s=r.situacao;
    box.appendChild(h("b",{text:hjTituloErro(r)}));
    box.appendChild(h("p",{text:r.motivo||"A IA não respondeu."}));
    var l=[];if(r.codigo)l.push("código: "+r.codigo);if(r.estado)l.push("estado: "+r.estado);if(r.id)l.push("id da chamada: "+r.id);
    if(r.semEnvio&&s!=="incerta")l.push("nada foi enviado por esta tentativa");
    else if(s==="incerta"||s==="consumida"||s==="em_curso")l.push(hojeCobrancaTxt(r.cobranca,c.estimado_rac_usd));
    else if(r.cobranca==="nenhuma")l.push(hojeCobrancaTxt("nenhuma"));
    else if(c.estimado_rac_usd!=null)l.push("o servidor registrou uso (estimativa do RAC: "+NUCLEO.iaUsdFino(c.estimado_rac_usd)+"); confira em Custos de IA");
    else l.push(hojeCobrancaTxt("incerta"));
    if(r.recuperavel==="nao")l.push("não recuperável");else if(r.recuperavel==="talvez")l.push("recuperável só se a resposta ainda chegar a esta página");
    if(l.length)box.appendChild(h("p",{class:"sub",text:l.join(" · ")}));
    if(s==="sem_fontes")box.appendChild(h("p",{class:"sub",text:"Use \"↻ Reler as fontes\" ou verifique a conexão; a análise só libera quando alguma fonte com os seus dados responder."}));
    box.appendChild(h("p",{class:"sub",text:"Nenhuma resposta simulada foi usada. Nada é repetido sozinho: tente de novo só se quiser."}));
    var ped=r.pedido||{};
    if(r.podeReenviar&&r.chave)box.appendChild(hjBotaoPago("Reenviar o mesmo pedido",{paga:true,texto:"Reenvia exatamente o pedido original guardado neste aparelho, com a chave original (nada é recalculado com os dados de hoje). A tentativa anterior pode já ter sido cobrada. O servidor não cobra a mesma chave duas vezes: se a primeira chamada já foi processada, ele só responderá que o pedido é repetido (e o texto da análise não poderá ser recuperado); se ela nunca chegou, esta será a única cobrança."},
      function(){hjAnalisar({reenviar:true,chave:r.chave})}));
    if(r.podeNova)box.appendChild(hjBotaoPago("Pedir outra análise (nova cobrança)",{paga:true,texto:"Isto envia um pedido NOVO, com outra chave e com os dados de agora, e cobra de novo. "+(r.cobranca==="nenhuma"?"A anterior não teve cobrança.":"A tentativa anterior pode já ter sido cobrada, e o resultado dela não será recuperado.")+" Use só se precisar mesmo de uma análise agora."},
      function(){hjAnalisar(hjPedido(ped,{nova:true}))}));
    return box}
  /* a abertura do aviso diz em que pé está a chamada: concluída, repetida, em andamento, falha antes do envio, resposta inválida ou falha de rede */
  function hjTituloErro(r){var s=r.situacao,c=r.codigo;
    if(s==="sem_fontes")return "Análise bloqueada: sem dados úteis.";
    if(c==="outra_aba")return "Outra aba deste aparelho já está analisando.";
    if(c==="sem_registro"||c==="registro_ausente")return "Nada foi enviado.";
    if(c==="sem_web_locks")return "Nada foi enviado: o navegador não oferece a proteção necessária.";
    if(c==="conta_mudou")return "A conta mudou durante a chamada.";
    if(c==="repetida")return "Pedido repetido: o servidor já o processou antes.";
    if(c==="resposta_invalida")return "Resposta inválida da IA: chamada processada, sem análise.";
    if(c==="em_andamento"||s==="em_curso")return "Chamada em andamento.";
    if(c==="rede")return "Falha de rede: cobrança desconhecida.";
    if(c==="antes_do_envio"&&s==="incerta")return "O reenvio não saiu do navegador: a chamada original continua incerta.";
    if(c==="antes_do_envio"||s==="livre")return "Falha antes do envio: nada foi reservado.";
    if(s==="consumida")return "Chamada concluída, resultado não recuperável.";
    if(s==="incerta")return "Resultado incerto: cobrança desconhecida.";
    return "A análise não foi concluída."}
  function hjPedido(ped,extra){var o={};if(ped.pergunta)o.pergunta=ped.pergunta;Object.keys(extra).forEach(function(k){o[k]=extra[k]});return o}
  /* botão de ação paga: o primeiro toque só pede a confirmação, o segundo chama a IA; um pedido por vez.
     aviso: texto ou função que devolve {texto, paga:false (cache), semConfirmar (só avisa), erro (abre o erro em vez de confirmar)} */
  function hjBotaoPago(rotulo,aviso,fazer){var caixa=h("div",{class:"hjpago"}),b=h("button",{type:"button",class:"ghostbtn pri",text:rotulo});b.disabled=HJ.ocupado;
    b.onclick=function(){if(HJ.ocupado)return;caixa.innerHTML="";
      var av=typeof aviso==="function"?aviso():aviso;if(typeof av==="string")av={paga:true,texto:av};
      if(av.erro){HJ.erro=av.erro;HJ.aviso="";hjDesenhar();return}
      var nao=h("button",{type:"button",class:"ghostbtn",text:av.semConfirmar?"Ok":"Cancelar"});nao.onclick=function(){caixa.innerHTML="";caixa.appendChild(b)};
      caixa.appendChild(h("p",{class:"hjaviso",role:"alert",text:av.texto}));
      if(av.semConfirmar){caixa.appendChild(h("div",{class:"vfil"},nao));return}
      var ok=h("button",{type:"button",class:"ghostbtn pri",text:av.rotuloOk||(av.paga===false?"Mostrar do cache (sem cobrança)":"Confirmar e chamar a IA")});
      ok.onclick=function(){if(HJ.ocupado)return;ok.disabled=true;fazer()};
      caixa.appendChild(h("div",{class:"vfil"},ok,nao));ok.focus()};
    caixa.appendChild(b);return caixa}
  /* chama a IA (só aqui e só pelos botões acima); um pedido por vez, e o pacote de fatos é o mesmo que a tela mostra */
  function hjAnalisar(o){if(HJ.ocupado)return;HJ.ocupado=true;HJ.erro=null;HJ.aviso="";hjDesenhar();
    hojeAnalisar(o).then(function(r){if(HOJE.suspenso)return;/* a sessão mudou no meio da chamada: o resultado não volta para a memória nem para a tela */
      HJ.ocupado=false;
      if(r.ok){HJ.sel=r.analise.chave;HJ.aviso=r.deCache?"Esta análise já existia neste aparelho, com os mesmos dados: nada foi cobrado.":"Chamada concluída e análise disponível (guardada neste aparelho)."}else{r.pedido=hjPedido(o,{});HJ.erro=r}
      return hojeMontar(false).then(function(x){HJ.x=x;hjDesenhar()})},
      function(e){if(HOJE.suspenso)return;HJ.ocupado=false;HJ.erro={motivo:"Não consegui analisar ("+(e&&e.message||e)+")."};hjDesenhar()})}
  function hjCarregar(forcar){var corpo=HJ.corpo;corpo.innerHTML="";corpo.appendChild(h("div",{class:"rh-largo"},rkEstado("carregando","Lendo as fontes do dia…")));
    return hjConfig().then(function(){return hojeMontar(forcar)}).then(function(x){HJ.x=x;hjDesenhar()})
      .catch(function(e){corpo.innerHTML="";corpo.appendChild(h("div",{class:"rh-largo"},rkEstado("erro","Não consegui carregar agora.",h("div",{class:"rac-linha-flex"},rkBtn("sec","tentar de novo",{onclick:null}),e?h("span",{class:"rac-t-mono",text:"Detalhe técnico: "+(e.message||e)}):null))));
        var b=corpo.querySelector("button");if(b)b.onclick=function(){hjCarregar(forcar)};logErro("hoje",e)})}
  function renderHoje(){var root=$("#rachoje-view");root.innerHTML="";
    if(!isOwner()){root.appendChild(h("div",{class:"panel"},h("p",{class:"empty",text:"O RAC Hoje é só da conta do dono."})));return}
    if(HOJE.suspenso){hojeOuvir();hjSessaoAviso(root);return}/* sessão mudou em outra aba: nada é lido nem mostrado */
    if(!HJ.ocupado){HJ.erro=null;HJ.aviso="";HJ.sel=null}
    /* uma resposta que chega depois do prazo é guardada pela camada de IA; aqui a tela só mostra */
    HOJE.aoChegar=function(f){if(!HJ.corpo||!HJ.x)return;if(f&&f.ok){HJ.sel=f.analise.chave;HJ.erro=null;HJ.aviso="A resposta de uma chamada anterior chegou depois do prazo e foi guardada. Nada foi cobrado de novo."}hjDesenhar()};
    /* outra aba deste aparelho mudou o que o RAC Hoje guarda (análise, chamada sem resultado): repinta só o histórico, as chamadas sem resultado e o aviso, sem chamar nada.
       O listener é um só (hojeOuvir, também usado pela sessão em outra aba). */
    hojeOuvir();
    HJ.corpo=h("div",{class:"rh"});root.appendChild(HJ.corpo);hjCarregar(false)}
  /* a vigilância da sessão começa quando o módulo carrega (antes de a tela abrir), para a memória do RAC Hoje não sobreviver a um logout em outra aba */
  hojeOuvir();
