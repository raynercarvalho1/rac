/* Dia a Dia RAC — provedor "agenda" (Lote 3 do novo RAC). Fonte: a fonte "agenda" (js/fonte-agenda.js, NUCLEO.agendaItens: retornos e vencimentos dos registros, aulas e boletos do MBA, aniversários, candidaturas, avisos de backup).
   NÃO é um segundo mecanismo de agendamento: reaproveita a Agenda como está. Chave estável: o id do item (candidaturas) ou tipo + data + título normalizado (nunca a posição na lista). Espaço: pessoal. PRIVADO (só do dono).
   lerProximos: o que está agendado de hoje em diante (marcado como futuro na Timeline). lerJanela: o que venceu e ainda está pendente (passado). Os lembretes ficam com o provedor "lembretes". Só LÊ. */
  var PV_AG={t:0,p:null};
  /* uma leitura da Agenda por vez, e a mesma por 60 s (a Timeline pede a janela e os próximos juntos; só nesta aba e só desta pessoa) */
  function pvAgLer(){var agora=Date.now();if(PV_AG.p&&agora-PV_AG.t<60e3)return PV_AG.p;
    PV_AG.t=agora;PV_AG.p=precisa(["fonte-agenda"]).then(function(){return fonteOuErro("agenda")}).then(function(c){return c.v||[]});PV_AG.p.catch(function(){PV_AG.p=null});return PV_AG.p}
  var PV_AG_CAT={familia:"familia",veiculo:"casa",docs:"casa",mba:"estudos",niver:"familia",carreira:"carreira",sistema:"sistema"};
  function pvAgEvento(e,hoje){if(e.lembrete)return null;
    var tipo=String(e.tipo||"outros").replace(/[^a-z0-9_]/g,"_"),chave=e.id?String(e.id).replace(/:/g,"_"):tipo+"_"+e.data+"_"+NUCLEO.bsNorm(e.t).replace(/[^a-z0-9]+/g,"_").slice(0,40),l=e.href||"#agenda";
    if(l.charAt(0)!=="#"&&!/^https:\/\//.test(l))l="#agenda";
    return {id:NUCLEO.tlId("agenda","itens",chave),quando:NUCLEO.tlQuandoDe(e.data),diaInteiro:true,categoria:PV_AG_CAT[e.tipo]||"casa",tipo:"agenda."+tipo,titulo:(e.pre?e.pre+": ":"")+e.t,resumo:e.sub||"",pendente:!e.semRetorno,link:l}}
  provRegistrar({dominio:"agenda",rotulo:"Agenda",categoria:"casa",categorias:["casa","familia","estudos","carreira","sistema"],tipos:[],espaco:"pessoal",compartilhavel:false,exige:{dono:true},
    lerProximos:function(op){return pvAgLer().then(function(l){return {eventos:l.filter(function(e){return e.data>=op.hoje&&e.data<=op.ate}).map(function(e){return pvAgEvento(e,op.hoje)}).filter(Boolean)}})},
    lerJanela:function(op){return pvAgLer().then(function(l){var ev=l.filter(function(e){return e.data<op.hoje&&e.data<=op.ate&&(!op.de||e.data>=op.de)&&!e.semRetorno}).map(function(e){return pvAgEvento(e,op.hoje)}).filter(Boolean);
      ev=NUCLEO.tlOrdenar(ev).slice(0,op.limite);return {eventos:ev,esgotado:ev.length<op.limite}})},
    buscar:function(op){return pvAgLer().then(function(l){return {itens:l.filter(function(e){return !e.lembrete&&NUCLEO.bsCasa(op.termos,[e.t,e.sub,e.pre,e.data])}).slice(0,op.limite).map(function(e){var v=pvAgEvento(e);return v?{id:v.id,tipo:v.tipo,titulo:v.titulo,resumo:dataBR(e.data)+(v.resumo?" · "+v.resumo:""),quando:v.quando,link:v.link}:null}).filter(Boolean)}})}});
