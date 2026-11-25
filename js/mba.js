/* Dia a Dia RAC — módulo carregado quando a seção abre. MBA: quadro da tela inicial, aulas, avaliações, financeiro, roteiro, exercícios e materiais.
   Usa as funções do núcleo (js/app.js), que ficam no escopo global. */
  /* link para assistir: "aulas" virou a lista de aulas importada; o link fica em "aulasLink" (o antigo, se for texto, ainda vale) */
  function mbaLinkAulas(m){m=m||{};return m.aulasLink||(typeof m.aulas==="string"?m.aulas:"")}
  /* cada linha do quadro leva à parte da página que trata daquilo (#mba/aulas, #mba/avaliacoes, #mba/financeiro, #mba/disc-<id>) */
  function mbaLinha(li,alvo){li.classList.add("clic");li.tabIndex=0;li.title="Abrir";li.onclick=function(e){if(e.target.closest("a"))return;location.hash="#mba/"+alvo};
    li.onkeydown=function(e){if(e.key==="Enter")li.onclick(e)};return li}
  /* Hoje, Lote 2 da reestruturação visual: o que pede ação no MBA, com botões que resolvem ali mesmo. Aula assistida fica em PESSOAL.mbaFeito ("au:<id>"), junto com as
     outras marcas do MBA (sem tabela nova). Só o dono vê o Hoje; as contas vêm de NUCLEO.mbaHojeResumo. */
  function wMbaHoje(){
    var p=wCard("MBA e estudos","mba","#5B5BD6",["#mba","abrir o MBA"]),corpo=h("div");p.appendChild(corpo);
    function desenhar(){corpo.innerHTML="";
      if(!PESSOAL.mba||!PESSOAL.mba.curso){corpo.appendChild(h("p",{class:"sub",text:"O MBA ainda não foi preenchido. Abra o MBA para cadastrar o curso."}));return}
      var r=NUCLEO.mbaHojeResumo(PESSOAL.mba,PESSOAL.mbaLinks,mbaFeito(),hojeISO(),Date.now()),ul=h("ul",{class:"wl"}),op=mbaOndeParei();
      /* a linha do MBA no "O que mudou desde ontem" do Hoje (só exibição; o cartão do Hoje se repinta) */
      if(typeof hjMudouAdd==="function"){var ps=[];if(r.paraAssistir.length)ps.push(r.paraAssistir.length+(r.paraAssistir.length===1?" aula para assistir":" aulas para assistir"));if(r.avalPendentes.length)ps.push("avaliação até "+dataBR(r.avalPendentes[0].ate).slice(0,5));hjMudouAdd("mba",ps.length?[{texto:"MBA: "+ps.join(" · "),href:"#mba",rota:"mba"}]:[])}
      function li(cls,tit,sub,acoes){ul.appendChild(h("li",{class:cls||null},h("span",{class:"grow"},h("b",{text:tit}),sub?h("span",{class:"sub",text:sub}):null),acoes?h("span",{class:"end vfil"},acoes):null))}
      function marcar(k,rot){var b=h("button",{type:"button",class:"ghostbtn",text:rot});b.onclick=function(){mbaMarcar(k,true);desenhar()};return b}
      function ver(href,rot){return h("a",{class:"ghostbtn",href:href,text:rot})}
      if(r.avalVencidas.length)li("alerta",r.avalVencidas.length+(r.avalVencidas.length===1?" avaliação vencida sem resposta":" avaliações vencidas sem resposta"),r.avalVencidas[0].t+" · era até "+dataBR(r.avalVencidas[0].ate).slice(0,5),[ver("#mba/avaliacoes","Ver")]);
      if(r.aoVivo)li(null,"Aula hoje às "+(r.aoVivo.hora||"19:00"),r.aoVivo.t,[ext(mbaLinkAula(r.aoVivo),"▶ Ao vivo","ghostbtn pri")]);
      else if(r.proxima)li(null,"Próxima aula",r.proxima.t,[h("span",{class:"sub",text:quando(r.proxima.data+"T"+(r.proxima.hora||"19:00"))})]);
      NUCLEO.mbaMaterialPendente(PESSOAL.mba,PESSOAL.mbaLinks,mbaFeito(),hojeISO()).slice(0,2).forEach(function(a){li("alerta","Conferir o material da aula",a.t+" · "+dataBR(a.data).slice(0,5)+" (sai cerca de 3 dias antes)",[ext(mbaLinkAula(a),"Abrir portal","ghostbtn"),marcar("mat:"+a.id,"Material conferido")])});
      r.paraAssistir.slice(0,3).forEach(function(a){li("alerta","Aula para assistir",a.t+" · "+dataBR(a.data).slice(0,5),[ext(mbaLinkAula(a),"▶ Assistir","ghostbtn pri"),marcar("au:"+a.id,"Assistida")])});
      if(r.paraAssistir.length>3)li(null,"+ "+(r.paraAssistir.length-3)+(r.paraAssistir.length-3===1?" aula":" aulas")+" para assistir",null,[ver("#mba/aulas","Ver")]);
      r.avalPendentes.slice(0,3).forEach(function(a){var d=diasAte(a.ate);li(d<=5?"alerta":null,a.t,"Avaliação até "+dataBR(a.ate).slice(0,5)+(a.disc?" · "+a.disc:""),[a.link?ext(a.link,"Abrir","ghostbtn"):null,marcar("av:"+a.id,"Já respondi")])});
      if(r.boleto){var dv=r.boleto.dias;li(dv<=5?"alerta":null,"Próximo boleto: "+BRL(r.boleto.v),r.boleto.pagas+" de "+r.boleto.total+" pagas · faltam "+BRL(r.boleto.falta),[h("span",{class:"sub",text:dv<0?"atrasado":dv===0?"vence hoje":"vence "+dataBR(r.boleto.venc).slice(0,5)})])}
      if(op)li(null,op.prox?"Onde parei: "+op.prox.t:"Tópicos de "+op.d.nome+" concluídos",op.d.nome+(op.ext?" · exercícios "+op.exf+" de "+op.ext:""),[ver("#mba/disc-"+op.d.id,"Continuar")]);
      if(!ul.children.length)corpo.appendChild(h("p",{class:"sub",text:"Nada pendente no MBA agora."}));else corpo.appendChild(ul)}
    desenhar();return p}
  function wMba(){
    var p=wCard("MBA","mba","#5B5BD6",location.hash.indexOf("#mba")===0?null:["#mba","página do MBA"]),m=PESSOAL.mba;
    function form(){
      var v=m||{},f=h("div",{class:"wform"});
      function campo(rot,k,tipo,ph){var i=h("input",{type:tipo||"text",value:v[k]!=null?v[k]:"",placeholder:ph||""});i.dataset.k=k;return h("label",null,rot,i)}
      f.appendChild(campo("Curso e instituição","curso","text","MBA em …"));
      f.appendChild(h("div",{class:"two"},campo("Link para assistir as aulas","aulasLink","url","https://…"),campo("Link do portal","portal","url","https://…")));
      f.querySelector('[data-k="aulasLink"]').value=mbaLinkAulas(v);
      f.appendChild(h("div",{class:"two"},campo("Próxima aula (data e hora)","proxData","datetime-local"),campo("Tema da próxima aula","proxTema")));
      f.appendChild(h("div",{class:"two"},campo("Disciplinas concluídas","feitas","number"),campo("Total de disciplinas","total","number")));
      f.appendChild(h("div",{class:"two"},campo("Parcelas pagas","pagas","number"),campo("Total de parcelas","parcelas","number")));
      f.appendChild(h("div",{class:"two"},campo("Valor da parcela (R$)","valor","text","0,00"),campo("Dia do vencimento","venc","number")));
      var ok=h("button",{type:"button",text:"Salvar"});
      ok.onclick=function(){var o=Object.assign({},PESSOAL.mba||{});f.querySelectorAll("input").forEach(function(i){o[i.dataset.k]=i.value.trim()});pessoalGravar("mba",o);location.hash="#mba"};
      f.appendChild(ok);return f}
    if(!m||!m.curso){p.appendChild(h("p",{class:"sub",text:"Preencha uma vez e o quadro passa a mostrar aulas, progresso e parcelas."}));p.appendChild(form());return p}
    var corpo=h("div");
    corpo.appendChild(h("p",null,h("b",{text:m.curso})));
    var acts=h("div",{class:"vfil"});if(mbaLinkAulas(m))acts.appendChild(ext(mbaLinkAulas(m),"Assistir aulas","ghostbtn pri"));if(m.portal)acts.appendChild(ext(m.portal,"Portal","ghostbtn"));corpo.appendChild(acts);
    var ul=h("ul",{class:"wl"});
    var pa=mbaProxAula();
    if(pa)ul.appendChild(mbaLinha(h("li",null,h("span",{class:"grow"},h("b",{text:"Próxima aula"}),h("span",{class:"sub",text:pa.t})),h("span",{class:"end",text:quando(pa.data+"T"+pa.hora)})),"aulas"));
    else if(m.proxData)ul.appendChild(h("li",null,h("span",{class:"grow"},h("b",{text:"Próxima aula"}),h("span",{class:"sub",text:m.proxTema||""})),h("span",{class:"end",text:quando(m.proxData)})));
    if(+m.total){var pc=Math.min(1,(+m.feitas||0)/+m.total);
      ul.appendChild(mbaLinha(h("li",null,h("span",{class:"grow"},h("b",{text:"Progresso: "+(+m.feitas||0)+" de "+m.total+" disciplinas"}),h("div",{class:"bar"},h("i",{style:"width:"+Math.round(pc*100)+"%"}))),h("span",{class:"end",text:Math.round(pc*100)+"%"})),"disciplinas"))}
    var avs=mbaAvals().filter(function(a){return !a.feita&&!a.vencida});
    if(avs.length){var da=diasAte(avs[0].ate);ul.appendChild(mbaLinha(h("li",{class:da<=5?"alerta":null},h("span",{class:"grow"},h("b",{text:avs.length+(avs.length===1?" avaliação para responder":" avaliações para responder")}),
      h("span",{class:"sub",text:avs[0].t+(avs[0].disc?" · "+avs[0].disc:"")})),avs[0].link?ext(avs[0].link,"até "+dataBR(avs[0].ate).slice(0,5),"ghostbtn"):h("span",{class:"end",text:"até "+dataBR(avs[0].ate).slice(0,5)})),"avaliacoes"))}
    var fin=mbaFin();
    if(fin&&fin.prox){var dv=diasAte(fin.prox.venc);ul.appendChild(mbaLinha(h("li",{class:dv<=5?"alerta":null},h("span",{class:"grow"},h("b",{text:"Próximo boleto: "+BRL(fin.prox.v)}),
      h("span",{class:"sub",text:fin.pagas+" de "+fin.ps.length+" pagas · faltam "+BRL(fin.falta)})),h("span",{class:"end",text:dv<0?"atrasado":dv===0?"vence hoje":"vence "+dataBR(fin.prox.venc).slice(0,5)})),"financeiro"))}
    else if(+m.parcelas){var falta=(+m.parcelas)-(+m.pagas||0),vl=num2(m.valor),vc=proxVenc(+m.venc);
      ul.appendChild(h("li",null,h("span",{class:"grow"},h("b",{text:"Financeiro: "+(+m.pagas||0)+" de "+m.parcelas+" parcelas pagas"}),
        h("span",{class:"sub",text:(vl?"Faltam "+falta+" × "+BRL(vl)+" = "+BRL(falta*vl):"Faltam "+falta+" parcelas")+(vc&&falta>0?" · vence "+vc.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"}):"")}))))}
    var op=mbaOndeParei();
    if(op)ul.appendChild(mbaLinha(h("li",null,h("span",{class:"grow"},h("b",{text:op.prox?"Onde parei: "+op.prox.t:"Tópicos de "+op.d.nome+" concluídos"}),h("span",{class:"sub",text:op.d.nome+(op.ext?" · exercícios "+op.exf+" de "+op.ext:"")}))),"disc-"+op.d.id));
    corpo.appendChild(ul);
    var ed=h("button",{type:"button",class:"ghostbtn",text:"Editar"});ed.onclick=function(){location.hash="#mba/editar"};
    p.appendChild(corpo);p.appendChild(ed);
    p.mbaForm=form;return p}
  /* ===== MBA: disciplinas, onde parei, lista de exercícios, anotações e materiais =====
     A estrutura (disciplinas, tópicos, exercícios, links do Drive) vem de um .json importado e fica em PESSOAL.mba;
     o que já foi feito fica à parte em PESSOAL.mbaFeito, para uma nova importação não apagar o progresso. */
  function mbaFeito(){return PESSOAL.mbaFeito||{}}
  function mbaMarcar(k,on){var o=Object.assign({},mbaFeito());if(on)o[k]=hojeISO();else delete o[k];pessoalGravar("mbaFeito",o)}
  /* disciplina com todos os tópicos do roteiro marcados conta como concluída, mesmo que o arquivo importado ainda diga "andamento" */
  function mbaStatusDe(d,f){var r=d.roteiro||[];return d.status==="concluida"||(r.length&&r.every(function(t){return f[d.id+":"+t.k]}))?"concluida":d.status}
  function mbaDiscs(){var f=mbaFeito();return ((PESSOAL.mba||{}).disciplinas||[]).slice().sort(function(a,b){var o={andamento:0,proxima:1,concluida:2};return (o[mbaStatusDe(a,f)]||0)-(o[mbaStatusDe(b,f)]||0)})}
  /* próximo tópico ainda não marcado da disciplina em andamento */
  function mbaOndeParei(){var f=mbaFeito(),d=mbaDiscs().filter(function(x){return mbaStatusDe(x,f)!=="concluida"})[0];if(!d)return null;
    var r=(d.roteiro||[]).filter(function(t){return !f[d.id+":"+t.k]})[0],ex=(d.exercicios||[]),exf=ex.filter(function(e){return f[d.id+":ex"+e.n]}).length;
    return {d:d,prox:r,exf:exf,ext:ex.length}}
  function mbaAulasTxt(a){return (a||[]).map(function(x){var p=x.split("-");return p[2]+"/"+p[1]}).join(", ")}
  /* calendário de aulas do portal (PESSOAL.mba.aulas); o link de cada aula pode ser colado depois (PESSOAL.mbaLinks) */
  /* aulas, avaliações e parcelas: a normalização mora no núcleo (NUCLEO.mba*De, Fase 2 · A4), a mesma que a fonte do MBA usa (js/fonte-mba.js) */
  function mbaAulas(){return NUCLEO.mbaAulasDe(PESSOAL.mba,PESSOAL.mbaLinks)}
  function mbaQuando(a){return new Date(a.data+"T"+(a.hora||"19:00")+":00")}
  /* a próxima aula ainda não terminada (conta 3 horas de aula) */
  function mbaProxAula(){var ag=Date.now()-3*3600e3;return mbaAulas().filter(function(a){return mbaQuando(a).getTime()>ag})[0]||null}
  /* financeiro: parcelas com vencimento; pagas ficam marcadas em PESSOAL.mbaFeito ("pg:…") */
  function mbaFin(){return NUCLEO.mbaFinDe(PESSOAL.mba,mbaFeito(),hojeISO())}
  /* aula ao vivo: no portal, quem não dá o play durante a transmissão só assiste 48 horas depois.
     No dia da aula o Início mostra o aviso; 15 minutos antes vira "ao vivo agora" com o botão para entrar */
  var MBA_PORTAL="https://newdashboard.mbx.academy/classes";
  function mbaLinkAula(a){return a.link||mbaLinkAulas(PESSOAL.mba)||MBA_PORTAL}
  function mbaAvisoAula(){
    var agora=Date.now(),hoje=hojeISO(),a=mbaAulas().filter(function(x){return x.data===hoje&&mbaQuando(x).getTime()+3*3600e3>agora})[0];if(!a)return null;
    var ini=mbaQuando(a).getTime(),vivo=agora>=ini-15*60e3,b=ext(mbaLinkAula(a),vivo?"▶ Entrar na aula":"Abrir a aula","ghostbtn pri");b.target="mbx-aula";
    return h("div",{class:"chuva mbavivo"+(vivo?" on":""),role:"status"},h("b",{text:(vivo?"🔴 Aula ao vivo agora: ":"🎓 Hoje às "+a.hora+": ")+a.t}),
      h("span",{class:"sub",text:vivo?"Dê o play agora: se perder a transmissão, a gravação só libera 48 horas depois.":"Às "+a.hora+" o botão vira “Entrar na aula”. Dê o play ao vivo para não esperar 48 horas pela gravação."+(a.link?"":" O link de hoje ainda não está no site: o botão abre as aulas no portal.")}),
      h("div",{class:"vfil"},b))}
  /* calendário do celular: um .ics com as próximas aulas, alarme 10 minutos antes e na hora, e o link para entrar */
  function mbaIcs(){
    function z(d){return d.toISOString().replace(/[-:]/g,"").replace(/\.\d+/,"")}
    function esc(t){return String(t||"").replace(/\\/g,"\\\\").replace(/[,;]/g,"\\$&").replace(/\n/g,"\\n")}
    var ag=Date.now()-3*3600e3,L=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Dia a Dia RAC//MBA//PT","CALSCALE:GREGORIAN","X-WR-CALNAME:MBA"];
    mbaAulas().filter(function(a){return mbaQuando(a).getTime()>ag}).forEach(function(a){var i=mbaQuando(a),u=mbaLinkAula(a);
      L.push("BEGIN:VEVENT","UID:mba-"+a.id+"@raynercarvalho.com.br","DTSTAMP:"+z(new Date()),"DTSTART:"+z(i),"DTEND:"+z(new Date(i.getTime()+3*3600e3)),
        "SUMMARY:"+esc("MBA: "+a.t),"URL:"+u,"DESCRIPTION:"+esc("Dê o play ao vivo: se perder a transmissão, a gravação só libera 48 horas depois.\nEntrar: "+u+(a.prof?"\nProfessor: "+a.prof:"")),
        "BEGIN:VALARM","ACTION:DISPLAY","DESCRIPTION:"+esc("Aula do MBA em 10 minutos"),"TRIGGER:-PT10M","END:VALARM",
        "BEGIN:VALARM","ACTION:DISPLAY","DESCRIPTION:"+esc("Aula do MBA começando: dê o play"),"TRIGGER:PT0M","END:VALARM","END:VEVENT")});
    L.push("END:VCALENDAR");return L.join("\r\n")}
  function mbaIcsBaixar(){var u=URL.createObjectURL(new Blob([mbaIcs()],{type:"text/calendar"}));
    /* no iPhone, abrir o arquivo mostra direto a tela "Adicionar todos" do Calendário */
    if(/iPhone|iPad|iPod/.test(navigator.userAgent)){location.href=u;return}
    var a=h("a",{href:u,download:"aulas-mba.ics"});document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},2000)}
  function diasAte(iso){return Math.round((new Date(iso+"T12:00:00")-new Date(hojeISO()+"T12:00:00"))/864e5)}
  function mbaPainelAulas(){
    var aulas=mbaAulas();if(!aulas.length)return null;
    var prox=mbaProxAula(),p=panel("Aulas",prox?"Próxima: "+prox.t+", "+quando(prox.data+"T"+prox.hora):"Todas as aulas já aconteceram");p.id="mba-aulas";
    var hoje=hojeISO(),ul=h("ul",{class:"wl mbaaulas"}),mes=null;
    aulas.forEach(function(a){
      var m=a.data.slice(0,7);if(m!==mes){mes=m;ul.appendChild(h("li",{class:"mbames",text:new Date(a.data+"T12:00:00").toLocaleDateString("pt-BR",{month:"long",year:"numeric"})}))}
      var passou=mbaQuando(a).getTime()<Date.now()-3*3600e3,ehHoje=a.data===hoje,acts=h("span",{class:"end vfil"});
      /* o portal não deixa a aula tocar dentro de outro site (o login dele recusa), então abre numa aba só das aulas */
      if(a.link&&(passou||ehHoje)){var b=ext(a.link,ehHoje&&!passou?"▶ Ao vivo":"▶ Assistir","ghostbtn pri");b.target="mbx-aula";acts.appendChild(b)}
      else if(passou||ehHoje){var c=h("button",{type:"button",class:"ghostbtn",text:"Colar link"});
        c.title="No portal, abra a aula, copie o link do botão Assistir Aula e cole aqui";
        c.onclick=function(){var v=(window.prompt("Cole o link do botão “Assistir Aula” do portal (começa com https://class.mbx.academy/):")||"").trim();
          if(!v)return;if(!/^https:\/\/class\.mbx\.academy\//.test(v)){alert("O link precisa começar com https://class.mbx.academy/");return}
          var L=Object.assign({},PESSOAL.mbaLinks||{});L[a.id]=v;pessoalGravar("mbaLinks",L);renderMba()};acts.appendChild(c)}
      ul.appendChild(h("li",{class:(passou?"mbapassou":"")+(prox&&a.id===prox.id?" mbaprox":"")||null},
        h("span",{class:"grow"},h("b",{text:a.t}),h("span",{class:"sub",text:new Date(a.data+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"2-digit"})+" · "+a.hora+(a.prof?" · "+a.prof:"")+(ehHoje?" · hoje":"")})),acts))});
    p.appendChild(h("details",{class:"famvals",open:""},h("summary",{text:aulas.length+" aulas no semestre"}),ul));
    var cal=h("button",{type:"button",class:"ghostbtn",text:"📅 Pôr as aulas no calendário do celular"});cal.onclick=mbaIcsBaixar;
    p.appendChild(h("div",{class:"vfil"},cal,mbaLinkAulas(PESSOAL.mba)?ext(mbaLinkAulas(PESSOAL.mba),"Aulas no portal","ghostbtn"):null));
    p.appendChild(h("p",{class:"sub",text:"O calendário avisa 10 minutos antes e na hora de cada aula, com o link para entrar. Quando sair aula nova, baixe de novo: as que já estão lá são atualizadas, sem repetir."}));
    return p}
  /* o material de cada aula só sai no portal cerca de 3 dias antes: lembrete até o dono marcar "Material conferido" (mbaFeito "mat:<id>") */
  function mbaPainelMaterial(){
    var l=NUCLEO.mbaMaterialPendente(PESSOAL.mba,PESSOAL.mbaLinks,mbaFeito(),hojeISO());if(!l.length)return null;
    var p=panel("Material das próximas aulas","O portal libera o material cerca de 3 dias antes de cada aula (terças). Confira e marque.");p.id="mba-material";
    p.appendChild(h("ul",{class:"wl"},l.map(function(a){var b=h("button",{type:"button",class:"ghostbtn",text:"Material conferido"});b.onclick=function(){mbaMarcar("mat:"+a.id,true);renderMba()};
      return h("li",{class:"alerta"},h("span",{class:"grow"},h("b",{text:a.t}),h("span",{class:"sub",text:dataBR(a.data)+" · "+(a.hora||"19:00")})),h("span",{class:"end vfil"},ext(mbaLinkAula(a),"Abrir portal","ghostbtn"),b))})));return p}
  function mbaPainelFin(){
    var x=mbaFin();if(!x)return null;
    var p=panel("Financeiro",x.pagas+" de "+x.ps.length+" pagas · faltam "+BRL(x.falta)),f=mbaFeito();p.id="mba-financeiro";
    var bol=x.F.link?ext(x.F.link,"Baixar o boleto no portal","ghostbtn pri"):null,pasta=x.F.pasta?ext(x.F.pasta,"Boletos salvos no Drive","ghostbtn"):null;
    if(x.prox){var dd=diasAte(x.prox.venc),cls=dd<0?"qrwarn":dd<=5?"qrwarn":"sub";
      p.appendChild(h("div",{class:"kgasto"},h("div",null,h("span",{class:"kl",text:"Próximo boleto: "+x.prox.n}),h("b",{class:"kv",text:BRL(x.prox.v)})),
        h("div",null,h("span",{class:"kl",text:"Vencimento"}),h("b",{class:"kv",text:dataBR(x.prox.venc)})),h("div",null,h("span",{class:"kl",text:"Já pago"}),h("b",{class:"kv",text:BRL(x.pago)}))));
      p.appendChild(h("p",{class:cls,text:dd<0?"⚠ Venceu há "+(-dd)+(dd===-1?" dia":" dias")+". Se já pagou, marque abaixo.":dd===0?"⚠ Vence hoje.":"Vence em "+dd+(dd===1?" dia":" dias")+"."}))}
    else p.appendChild(h("p",{class:"sub",text:"Tudo pago 🎉"}));
    if(bol||pasta)p.appendChild(h("div",{class:"vfil"},pasta,bol));
    var l=h("div",{class:"exl"});
    x.ps.forEach(function(q){var cb=h("input",{type:"checkbox"});cb.checked=q.paga;
      cb.onchange=function(){mbaMarcar("pg:"+q.k,cb.checked);renderMba()};
      l.appendChild(h("label",{class:q.paga?"done":null},cb,h("span",{class:"grow"},h("b",{text:q.n+" · "+BRL(q.v)}),h("span",{class:q.atrasada?"qrwarn":"sub",style:"display:block",text:"vence "+dataBR(q.venc)+(q.paga&&f["pg:"+q.k]?" · marcada como paga":q.atrasada?" · atrasada":"")}))))});
    p.appendChild(h("details",{class:"famvals"},h("summary",{text:"Todas as parcelas (marque quando pagar)"}),l));
    return p}
  /* avaliações do portal (pesquisas e provas): o link abre direto a avaliação; "já respondi" fica em PESSOAL.mbaFeito */
  function mbaAvals(){return NUCLEO.mbaAvalsDe(PESSOAL.mba,mbaFeito(),hojeISO())}
  function mbaPainelAval(){
    var l=mbaAvals();var abertas=l.filter(function(a){return !a.feita&&!a.vencida});
    var p=panel("Avaliações",abertas.length?abertas.length+(abertas.length===1?" para responder":" para responder")+", a próxima até "+dataBR(abertas[0].ate):"Nenhuma pendente");p.id="mba-avaliacoes";
    var box=h("div",{class:"exl"});
    l.forEach(function(a){var cb=h("input",{type:"checkbox"});cb.checked=a.feita;cb.onchange=function(){mbaMarcar("av:"+a.id,cb.checked);renderMba()};
      var dd=diasAte(a.ate),quando=a.feita?"respondida":a.vencida?"prazo encerrado em "+dataBR(a.ate):dd===0?"termina hoje":"até "+dataBR(a.ate)+" (faltam "+dd+(dd===1?" dia)":" dias)");
      box.appendChild(h("label",{class:a.feita?"done":null},cb,h("span",{class:"grow"},h("b",{text:a.t+(a.disc?" · "+a.disc:"")}),
        h("span",{class:!a.feita&&!a.vencida&&dd<=5?"qrwarn":"sub",style:"display:block",text:[a.prof?"Prof. "+a.prof:"",quando].filter(Boolean).join(" · ")})),
        !a.feita&&!a.vencida&&a.link?ext(a.link,"Responder","ghostbtn pri"):null))});
    p.appendChild(box);
    p.appendChild(h("p",{class:"sub",text:"Depois de responder no portal, marque aqui para sair da lista de pendências."}));
    /* cadastro de avaliação ou atividade nova (grava em PESSOAL.mba.avaliacoes; importar o .json de novo junta por id e não apaga estas) */
    var det=h("details",{class:"famvals"},h("summary",{text:"+ Nova avaliação ou atividade"})),fm=h("div",{class:"wform"});
    function cp(r,k,t){var i=h("input",{type:t||"text"});i.dataset.k=k;return h("label",null,r,i)}
    fm.appendChild(cp("Título","t"));fm.appendChild(h("div",{class:"two"},cp("Disciplina","disc"),cp("Prazo final","ate","date")));fm.appendChild(cp("Link no portal (opcional)","link","url"));
    var sv=h("button",{type:"button",class:"ghostbtn pri",text:"Salvar"}),ms=h("p",{class:"sub",role:"status"});
    sv.onclick=function(){var v={};[].forEach.call(fm.querySelectorAll("input"),function(i){v[i.dataset.k]=i.value.trim()});
      if(!v.t||!/^\d{4}-\d{2}-\d{2}$/.test(v.ate)){ms.textContent="Preencha o título e o prazo.";return}
      if(v.link&&!/^https:\/\//.test(v.link)){ms.textContent="O link precisa começar com https://";return}
      var m=Object.assign({},PESSOAL.mba||{}),L=(m.avaliacoes||[]).slice(),o={id:"m"+Date.now(),t:v.t,ate:v.ate};if(v.disc)o.disc=v.disc;if(v.link)o.link=v.link;
      L.push(o);m.avaliacoes=L;pessoalGravar("mba",m);renderMba()};
    fm.appendChild(h("div",{class:"vfil"},sv));fm.appendChild(ms);det.appendChild(fm);p.appendChild(det);
    return p}
  function mbaPainelGeral(){var g=(PESSOAL.mba||{}).materiaisGerais||[];if(!g.length)return null;
    var p=panel("Materiais do curso","Guardados também no seu Google Drive.");
    p.appendChild(h("ul",{class:"wl"},g.map(function(m){return h("li",null,h("span",{class:"grow"},h("b",{text:m.n}),m.sub?h("span",{class:"sub",text:m.sub}):null),ext(m.url,"Abrir","ghostbtn"))})));return p}

  function renderMba(sub){
    var root=$("#mba-view");root.innerHTML="";var f=mbaFeito();
    if(sub==="editar"){var w=wMba(),fp=panel("Editar o MBA","Curso, links e os números do quadro.");fp.appendChild(h("div",{class:"vfil"},h("a",{href:"#mba",class:"ghostbtn",text:"‹ MBA"})));
      fp.appendChild(w.mbaForm?w.mbaForm():h("p",{class:"sub",text:"Nada para editar."}));root.appendChild(fp);return}
    if(sub)setTimeout(function(){var alvo=$("#mba-"+sub)||(sub==="disciplinas"?root.querySelector('[id^="mba-disc-"]'):null);if(alvo){alvo.scrollIntoView({behavior:"smooth",block:"start"});alvo.classList.add("pisca");setTimeout(function(){alvo.classList.remove("pisca")},1800)}},60);
    root.appendChild(wMba());
    [mbaPainelMaterial(),mbaPainelAulas(),mbaPainelAval(),mbaPainelFin()].forEach(function(x){if(x)root.appendChild(x)});
    var discs=mbaDiscs().filter(function(d){return d.nome});/* todas as disciplinas, inclusive as próximas, só com as datas das aulas */
    var imp=h("input",{type:"file",accept:".json,application/json",hidden:""}),bimp=h("button",{type:"button",class:"ghostbtn",text:"Importar do arquivo (.json)"}),imsg=h("p",{class:"sub",role:"status"});
    bimp.onclick=function(){imp.click()};
    imp.onchange=function(){var fl=imp.files[0];if(!fl)return;fl.text().then(function(t){
      var j=JSON.parse(t),m=Object.assign({},PESSOAL.mba||{}),n=0;
      /* campos do quadro (curso, links…) só entram se ainda estiverem vazios */
      Object.keys(j.curso||{}).forEach(function(k){if(!m[k]&&j.curso[k])m[k]=j.curso[k]});
      var porId={};(m.disciplinas||[]).forEach(function(d){porId[d.id]=d});
      (j.disciplinas||[]).forEach(function(d){porId[d.id]=d;n++});
      m.disciplinas=Object.keys(porId).map(function(k){return porId[k]});
      ["financeiro","materiaisGerais","aulasLink"].forEach(function(k){if(j[k])m[k]=j[k]});
      /* aulas também juntam por id (o link de cada aula já guardado não se perde) */
      if(j.aulas){var au={};(m.aulas||[]).forEach(function(x){au[x.id]=x});j.aulas.forEach(function(x){au[x.id]=Object.assign({},au[x.id]||{},x)});m.aulas=Object.keys(au).map(function(k){return au[k]})}
      /* avaliações juntam por id: as cadastradas pelo formulário não se perdem */
      if(j.avaliacoes){var av={};(m.avaliacoes||[]).forEach(function(x){av[x.id]=x});j.avaliacoes.forEach(function(x){av[x.id]=x});m.avaliacoes=Object.keys(av).map(function(k){return av[k]})}
      pessoalGravar("mba",m);
      /* o que o arquivo diz que já foi feito só entra se ainda não estiver marcado */
      var o=Object.assign({},mbaFeito());(j.feitos||[]).forEach(function(k){if(!o[k])o[k]=hojeISO()});pessoalGravar("mbaFeito",o);
      renderMba();$("#mba-view").scrollIntoView({block:"start"})
    }).catch(function(e){imsg.textContent="Não consegui ler o arquivo ("+e.message+")."})};
    if(!discs.length){root.appendChild(h("div",{class:"panel"},h("p",{class:"empty",text:"Nenhuma disciplina ainda. Importe o arquivo do MBA para ver o roteiro, a lista de exercícios e os materiais."}),h("div",{class:"vfil"},bimp),imp,imsg));return}
    discs.forEach(function(d){
      var rot=d.roteiro||[],ex=d.exercicios||[],nf=rot.filter(function(t){return f[d.id+":"+t.k]}).length,exf=ex.filter(function(e){return f[d.id+":ex"+e.n]}).length;
      var st={andamento:"em andamento",proxima:"próxima",concluida:"concluída"}[mbaStatusDe(d,f)]||"",ab=mbaStatusDe(d,f)==="concluida"?{class:"famvals"}:{class:"famvals",open:""};/* disciplina concluída abre recolhida */
      var p=panel(d.nome,[d.prof?"Prof. "+d.prof:"",d.aulas&&d.aulas.length?"aulas em "+mbaAulasTxt(d.aulas):"",st].filter(Boolean).join(" · "));p.id="mba-disc-"+d.id;
      if(d.status==="concluida"&&!rot.length){root.appendChild(p);return}
      /* onde parei: barra de progresso e o próximo tópico */
      if(rot.length){
        var prox=rot.filter(function(t){return !f[d.id+":"+t.k]})[0],pc=Math.round(nf/rot.length*100);
        p.appendChild(h("div",{class:"trilha"},h("div",{class:"top"},h("span",{text:"Onde parei"}),h("span",{class:"sub",text:nf+" de "+rot.length+" tópicos"})),
          h("div",{class:"bar"},h("i",{style:"width:"+pc+"%;background:#5B5BD6"})),
          h("span",{class:"sub"},prox?h("span",null,"Próximo: ",h("b",{text:prox.t})):"Todos os tópicos estudados 🎉")));
        var grupo=null,l=h("div",{class:"exl"});
        rot.forEach(function(t){
          if(t.g&&t.g!==grupo){grupo=t.g;l.appendChild(h("h3",{class:"mbag",text:grupo}))}
          var k=d.id+":"+t.k,cb=h("input",{type:"checkbox"});cb.checked=!!f[k];
          cb.onchange=function(){mbaMarcar(k,cb.checked);renderMba()};
          l.appendChild(h("label",{class:(cb.checked?"done":"")+(t===prox?" mbaprox":"")||null},cb,h("span",{class:"grow"},h("b",{text:t.t}),t.sub?h("span",{class:"sub",style:"display:block",text:t.sub}):null)))});
        p.appendChild(h("details",ab,h("summary",{text:"Roteiro da disciplina"}),l))}
      /* lista de exercícios: cada um com o tema (o tópico do roteiro) e a aba da planilha */
      if(ex.length){
        var le=h("div",{class:"exl"}),tema={};rot.forEach(function(t){tema[t.k]=t.t});
        ex.forEach(function(e){var k=d.id+":ex"+e.n,cb=h("input",{type:"checkbox"});cb.checked=!!f[k];
          cb.onchange=function(){mbaMarcar(k,cb.checked);renderMba()};
          var pronto=!e.tema||f[d.id+":"+e.tema];
          le.appendChild(h("label",{class:cb.checked?"done":null},cb,h("span",{class:"grow"},h("b",{text:e.n+". "+e.t}),
            h("span",{class:"sub",style:"display:block",text:[e.tema&&tema[e.tema]?"Tema: "+tema[e.tema]:"",e.aba?"planilha, aba "+e.aba:"",!cb.checked&&!pronto?"tópico ainda não estudado":""].filter(Boolean).join(" · ")}))))});
        var lk=(d.materiais||[]).filter(function(m){return m.lista});
        p.appendChild(h("details",ab,h("summary",{text:"Lista de exercícios: "+exf+" de "+ex.length+" feitos"}),
          lk.length?h("div",{class:"vfil"},lk.map(function(m){return ext(m.url,m.n,"ghostbtn")})):null,le))}
      /* anotações: o documento e a colinha de fórmulas do Excel */
      if(d.notas||(d.cola||[]).length){
        var box=h("div");
        if(d.notas)box.appendChild(h("div",{class:"vfil"},ext(d.notas.url,d.notas.n||"Abrir minhas anotações","ghostbtn pri")));
        if((d.cola||[]).length){var tb=h("table",{class:"famtab"});
          tb.appendChild(h("thead",null,h("tr",null,h("th",{text:"O quê"}),h("th",{text:"Fórmula"}),h("th",{text:"Para que serve"}))));
          tb.appendChild(h("tbody",null,d.cola.map(function(c){return h("tr",null,h("td",null,h("b",{text:c.t})),h("td",null,h("code",{class:"mbaf",text:c.f||"—"})),h("td",{class:"sub",text:c.d||""}))})));
          box.appendChild(h("div",{class:"famtabw"},tb))}
        p.appendChild(h("details",{class:"famvals"},h("summary",{text:"Minhas anotações"+((d.cola||[]).length?" e colinha de fórmulas":"")}),box))}
      var mats=(d.materiais||[]).filter(function(m){return !m.lista});
      if(mats.length)p.appendChild(h("details",{class:"famvals"},h("summary",{text:"Materiais ("+mats.length+")"}),
        h("ul",{class:"wl"},mats.map(function(m){return h("li",null,h("span",{class:"grow"},h("b",{text:m.n}),m.sub?h("span",{class:"sub",text:m.sub}):null),ext(m.url,"Abrir","ghostbtn"))}))));
      root.appendChild(p)});
    var ger=mbaPainelGeral();if(ger)root.appendChild(ger);
    root.appendChild(h("div",{class:"panel"},h("p",{class:"sub",text:"Quando chegar uma disciplina nova, me mande os materiais e eu monto o arquivo; importar de novo não apaga o que você já marcou."}),h("div",{class:"vfil"},bimp),imp,imsg))}
