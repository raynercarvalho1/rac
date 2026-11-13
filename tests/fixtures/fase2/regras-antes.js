/* Cópia das regras como estavam na main 95940e4 (antes da Fase 2 · A4 e A5), dentro das telas: saudeInsights (js/saude.js), famMeds
   (js/familia.js), a Agenda (js/sistema.js), o MBA (js/mba.js) e hojeQuem e os leitores de Agenda, Newsletter e MBA (js/hoje.js). Só para tests/nucleo_fase2.test.mjs comparar
   o resultado de antes com o das funções do núcleo. Não é carregado pelo site. */
    function saudeInsights(dias,ativs){
      var ini=NUCLEO.somaDiasISO(hojeISO(),-120),D=dias.filter(function(x){return x.data>=ini}),por={},out=[];D.forEach(function(x){por[x.data]=x.dados||{}});
      function media(l){return l.length?l.reduce(function(a,b){return a+b},0)/l.length:null}
      /* carga de treino por dia (soma da "carga" do Garmin, ou minutos quando não tem) */
      var carga={};ativs.forEach(function(a){var k=a.inicio.slice(0,10);if(k<ini)return;carga[k]=(carga[k]||0)+(a.dados.carga||(a.dados.duracao||0)/60)});
      var cs=Object.keys(carga).map(function(k){return carga[k]}).sort(function(a,b){return a-b}),forte=cs.length?cs[Math.floor(cs.length*.6)]:Infinity;
      var vf=[],vd=[],sf=[],sd=[];
      D.forEach(function(x){var ont=NUCLEO.somaDiasISO(x.data,-1);if(!por[ont])return;var c=carga[ont]||0,v=x.dados.vfc&&x.dados.vfc.noite,n=x.dados.sono&&x.dados.sono.nota;
        if(c>=forte){if(v)vf.push(v);if(n)sf.push(n)}else if(!c){if(v)vd.push(v);if(n)sd.push(n)}});
      if(vf.length>=5&&vd.length>=5){var dv=media(vf)-media(vd);if(Math.abs(dv)>=2)out.push("Na noite depois de um treino forte, a sua variabilidade cardíaca fica em média "+Math.abs(Math.round(dv))+" ms "+(dv<0?"mais baixa":"mais alta")+" do que depois de um dia sem treino ("+Math.round(media(vf))+" × "+Math.round(media(vd))+" ms).")}
      if(sf.length>=5&&sd.length>=5){var dn=media(sf)-media(sd);if(Math.abs(dn)>=3)out.push("A nota do sono é "+Math.abs(Math.round(dn))+" pontos "+(dn>0?"maior":"menor")+" nas noites depois de treino forte.")}
      /* horário de dormir contra a nota do sono */
      var cedo=[],tarde=[];D.forEach(function(x){var s2=x.dados.sono;if(!s2||!s2.inicio||!s2.nota)return;var m=+s2.inicio.slice(0,2)*60+ +s2.inicio.slice(3,5);if(m<12*60)m+=1440;(m<=23*60?cedo:m>=23*60+45?tarde:[]).push(s2.nota)});
      if(cedo.length>=5&&tarde.length>=5){var dc=media(cedo)-media(tarde);if(Math.abs(dc)>=3)out.push("Quando você dorme até 23h, a nota do sono fica em "+Math.round(media(cedo))+"; depois de 23h45, cai para "+Math.round(media(tarde))+".")}
      /* estresse por dia da semana */
      var DS=["domingo","segunda","terça","quarta","quinta","sexta","sábado"],sem=[[],[],[],[],[],[],[]];
      D.forEach(function(x){if(typeof x.dados.estresse==="number")sem[new Date(x.data+"T12:00:00").getDay()].push(x.dados.estresse)});
      var ms=sem.map(function(l,i){return [i,l.length>=4?media(l):null]}).filter(function(x){return x[1]!=null}).sort(function(a,b){return b[1]-a[1]});
      if(ms.length>=5&&ms[0][1]-ms[ms.length-1][1]>=5)out.push("O dia da semana mais estressante é "+DS[ms[0][0]]+" (média "+Math.round(ms[0][1])+"); o mais tranquilo, "+DS[ms[ms.length-1][0]]+" ("+Math.round(ms[ms.length-1][1])+").");
      /* passos do dia contra o sono da noite seguinte */
      var xs=[],ys=[];D.forEach(function(x){var am=por[NUCLEO.somaDiasISO(x.data,1)];if(am&&am.sono&&am.sono.total&&x.dados.passos){xs.push(x.dados.passos);ys.push(am.sono.total/3600)}});
      var rc=NUCLEO.correlacao(xs,ys);if(rc!=null&&Math.abs(rc)>=.25)out.push("Nos dias em que você anda mais, você "+(rc>0?"dorme mais":"dorme menos")+" na noite seguinte (correlação "+fmtN(Math.round(rc*100)/100)+").");
      /* humor do diário contra sono, treino e estresse */
      var hs=D.filter(function(x){return typeof x.dados.humor==="number"});
      if(hs.length>=8){
        var bom=[],ruim=[];hs.forEach(function(x){var s3=x.dados.sono&&x.dados.sono.total/3600;if(s3>=7)bom.push(x.dados.humor);else if(s3&&s3<6)ruim.push(x.dados.humor)});
        if(bom.length>=3&&ruim.length>=3&&media(bom)-media(ruim)>=.4)out.push("Depois de noites com 7 h ou mais de sono, o seu humor fica em "+fmtN(Math.round(media(bom)*10)/10)+" de 5; com menos de 6 h, cai para "+fmtN(Math.round(media(ruim)*10)/10)+".");
        var tr=[],des=[];hs.forEach(function(x){(carga[x.data]?tr:des).push(x.dados.humor)});
        if(tr.length>=3&&des.length>=3&&Math.abs(media(tr)-media(des))>=.3)out.push("Nos dias com treino o seu humor médio é "+fmtN(Math.round(media(tr)*10)/10)+"; sem treino, "+fmtN(Math.round(media(des)*10)/10)+".");
        var ex=[],ey=[];hs.forEach(function(x){if(typeof x.dados.estresse==="number"){ex.push(x.dados.estresse);ey.push(x.dados.humor)}});
        var re=NUCLEO.correlacao(ex,ey);if(re!=null&&re<=-.3)out.push("Quanto mais estresse o relógio mede no dia, pior o humor que você anota (correlação "+fmtN(Math.round(re*100)/100)+").")}
      else if(isOwner())out.push("Anote o humor por mais "+(8-hs.length)+(8-hs.length===1?" dia":" dias")+" para o site cruzar com o sono e o treino.");
      return out}
  function famMeds(regs){
    var hoje=hojeISO(),out=[];
    regs.forEach(function(r){(dadosDe(r).meds||[]).forEach(function(m){
      var ini=m.inicio||r.data,fim=m.continuo?null:maisDias(ini,Math.max(1,m.dias||1)-1);
      out.push({m:m,r:r,ini:ini,fim:fim,ativo:ini<=hoje&&(m.continuo||fim>=hoje)})})});
    return out.sort(function(a,b){return b.ini.localeCompare(a.ini)})}
  var AGENDA_TIPOS={familia:["🐾","Família"],veiculo:["🚗","Veículos"],mba:["🎓","MBA"],niver:["🎂","Aniversário"],lembrete:["📌","Lembrete"],sistema:["🛟","Sistema"],carreira:["💼","Carreira"],docs:["📄","Documentos"],saude:["❤️","Saúde"]};
  /* a área de cada item aparece só como ícone (o título fica curto e cabe no celular); "pre" é a área por extenso, usada no briefing falado */
  var AGENDA_ICO={eddie:"🐶",olivia:"👶",civic:"🚗",moto:"🛵",c3:"🚙",docs:"📄"};
  function agendaIco(e){return e.ico||(AGENDA_TIPOS[e.tipo]||["•"])[0]}
  /* a Agenda, a Próxima ação, o resumo falado e o RAC Hoje pedem a agenda quase juntos: quem chega enquanto uma leitura está em curso
     usa a mesma (uma consulta a registros em vez de duas ou três); terminada, nada fica guardado, então a próxima vem sempre nova */
  var AGENDA_EM_CURSO=null;
  /* agendaColetarLeitura devolve {eventos, falhas, estado}: estado "completa" (tudo lido), "vazia" (tudo lido, sem itens), "parcial" (uma leitura falhou e o que
     aparece vem do resto, por exemplo da memória do site) ou "falha" (uma leitura falhou e não sobrou nada). Falha nunca vira "vazia" nem "completa".
     agendaColetar devolve só os eventos, como sempre (quem não precisa do estado). */
  function agendaColetarLeitura(){if(AGENDA_EM_CURSO)return AGENDA_EM_CURSO;
    AGENDA_EM_CURSO=agendaLer().then(function(r){AGENDA_EM_CURSO=null;var f=r.falhas.map(function(x){return x.fonte+": "+x.erro});
      return {eventos:r.eventos,falhas:f,estado:f.length?(r.eventos.length?"parcial":"falha"):(r.eventos.length?"completa":"vazia")}},function(e){AGENDA_EM_CURSO=null;throw e});return AGENDA_EM_CURSO}
  function agendaColetar(){return agendaColetarLeitura().then(function(r){return r.eventos})}
  function agendaAviso(r){return r&&r.falhas&&r.falhas.length?"Leitura parcial da agenda ("+r.falhas.join("; ")+"): o que aparece vem do que o site já tinha na memória e pode estar incompleto.":""}
  function agendaLer(){
    var hoje=hojeISO(),ev=[],falhas=[];
    function add(data,t,sub,tipo,href,extra){if(data)ev.push(Object.assign({data:String(data).slice(0,10),t:t,sub:sub||"",tipo:tipo,href:href||""},extra||{}))}
    var pReg=isOwner()?SB.from("registros").select("id,quem,tipo,data,titulo,proxima,dados").order("data",{ascending:false}).then(sbOk).catch(function(e){logErro("agenda",e);falhas.push({fonte:"registros",erro:String(e&&e.message||e).slice(0,100)});return []}):Promise.resolve([]);
    return pReg.then(function(regs){
      var visto={};
      regs.forEach(function(r){var F=FAM[r.quem];if(!F)return;var k=r.quem+"|"+r.tipo,tipo=F.veic?"veiculo":F.docs?"docs":"familia",href=F.veic?"#veiculos/"+r.quem:F.docs?"#documentos":"#"+r.quem,d=r.dados||{};
        /* vale só o registro mais novo de cada tipo: um mais novo sem "próxima" (ex.: revisão feita) substitui o aviso do anterior */
        var ex={reg:r,ico:AGENDA_ICO[r.quem],pre:F.n};
        if(!visto[k+"p"]){visto[k+"p"]=1;if(r.proxima&&r.proxima>=maisDias(hoje,-60))add(r.proxima,r.titulo,F.n+" · "+tipoInfo(r.tipo)[1]+(r.proxima<hoje?" · estava previsto para "+dataBR(r.proxima):""),tipo,href,ex)}
        if(d.vigenciaFim&&!visto[k+"v"]){visto[k+"v"]=1;add(d.vigenciaFim,"Fim do "+r.titulo,F.n+" · renovar antes",tipo,href,ex)}
        if(d.garantiaAte&&!visto[k+"g"]&&d.garantiaAte>=hoje){visto[k+"g"]=1;add(d.garantiaAte,"Fim da garantia de "+r.titulo,F.n,tipo,href,ex)}});
      /* rede em Sorocaba: contatos de RH com os posts sem olhar há 7 dias ou mais viram um lembrete só */
      var rede=regs.filter(function(r){return r.quem==="rede"&&r.tipo==="contato"}),atras=rede.filter(function(r){var v=(r.dados||{}).visto;return !v||String(v).slice(0,10)<=maisDias(hoje,-7)});
      if(atras.length)add(hoje,"Olhar os posts de "+atras.length+(atras.length===1?" contato":" contatos")+" de RH",atras.slice(0,4).map(function(r){return r.titulo+" ("+r.valor+")"}).join(", ")+(atras.length>4?"…":""),"carreira","#rede",{ico:"🤝",pre:"Rede",prazo:"calculado"});
      /* IPVA de SP: vence em janeiro pelo final da placa (cota única com desconto ou 1ª parcela); aparece de novembro até quitar.
         Some quando houver um registro "Licenciamento e impostos" com IPVA do ano. */
      var ano=+hoje.slice(0,4)+(+hoje.slice(5,7)>=11?1:0),dIpva=ano+"-01-09";
      if(dIpva>=maisDias(hoje,-60)&&dIpva<=maisDias(hoje,75))Object.keys(FAM).forEach(function(q){var F=FAM[q];if(!F.veic||/antigo/i.test(F.n))return;
        if(regs.some(function(r){return r.quem===q&&r.tipo==="documento"&&/ipva/i.test(r.titulo||"")&&(String(r.titulo).indexOf(String(ano))>=0||r.data>=(ano-1)+"-12-01")}))return;
        add(dIpva,"IPVA "+ano,F.n+" · vence em janeiro conforme o final da placa · veja a data na Sefaz-SP","veiculo","https://portal.fazenda.sp.gov.br/servicos/ipva",{ext:true,ico:AGENDA_ICO[q],pre:F.n})});
      if(isOwner()){
        mbaAulas().forEach(function(a){if(a.data>=hoje)add(a.data,a.t,"aula às "+a.hora+(a.prof?" · "+a.prof:""),"mba","#mba",{pre:"Aula"})});
        mbaAvals().forEach(function(a){if(!a.feita)add(a.ate,a.t+(a.disc?" ("+a.disc+")":""),"responder a avaliação do MBA","mba",a.link||"#mba",{ext:!!a.link,pre:"Responder"})});
        var fin=mbaFin();if(fin)fin.ps.forEach(function(q){if(!q.paga)add(q.venc,q.n,"boleto do MBA · "+BRL(q.v),"mba","#mba",{pre:"Boleto"})});
        withDates().forEach(function(x){if(x.dias<=7||(x.fav&&x.dias<=30))add(maisDias(hoje,x.dias),x.nome,"aniversário"+(x.fav?" · marcado":""), "niver","#aniversarios",{pre:"Aniversário de"})});
        (PESSOAL.lembretes||[]).forEach(function(l){if(!l.feito)add(l.data,l.t,"lembrete","lembrete","",{lembrete:l})});
        /* carreira: 5 dias depois de se candidatar sem resposta, hora do follow-up. É um prazo CALCULADO (NUCLEO.priFollowup): vale até 10 dias depois de vencer;
           depois vira "sem retorno" (só apresentação: o resultado real da candidatura não é tocado). Resultado preenchido ou follow-up feito: nada. */
        (PESSOAL.candidaturas||[]).forEach(function(c){var f=NUCLEO.priFollowup(c,hoje);if(f.estado==="nenhum")return;
          var ex={pre:"Follow-up",prazo:"calculado",acao:"followup",cid:c.id,id:"cand:"+c.id},t=c.t+(c.e?" · "+c.e:"");
          if(f.estado==="sem_retorno")add(f.data,t,"sem retorno · candidatura de "+dataBR(f.desde),"carreira","#carreira/editar/"+c.id,Object.assign(ex,{pre:"Sem retorno",prazo:"informativo",semRetorno:true}));
          else add(f.data,t,"candidatura de "+dataBR(f.desde),"carreira","#carreira/editar/"+c.id,ex)});
        if(!PESSOAL.ultimoBackup||PESSOAL.ultimoBackup<maisDias(hoje,-30))add(hoje,"Baixar um backup do site",PESSOAL.ultimoBackup?"o último foi em "+dataBR(PESSOAL.ultimoBackup):"nunca foi feito","sistema","#sistema",{prazo:"calculado"})}
      /* o backup automático de domingo (no cofre privado do servidor): se o mais novo tiver mais de 9 dias, alguma coisa parou */
      if(!isOwner())return {eventos:ev.sort(function(a,b){return a.data.localeCompare(b.data)}),falhas:falhas};
      return Promise.resolve().then(function(){return SB.storage.from("backups").list(EU.id,{sortBy:{column:"name",order:"desc"},limit:1})}).then(function(r){
        var ult=r&&r.data&&r.data[0]&&r.data[0].name.slice(0,10);
        if(r&&r.error)falhas.push({fonte:"backup",erro:String(r.error.message||r.error).slice(0,100)});
        else if(!ult||ult<maisDias(hoje,-9))add(hoje,"O backup automático de domingo não rodou",ult?"o último é de "+dataBR(ult):"ainda não há nenhum no servidor","sistema","#sistema",{prazo:"calculado"})},function(e){falhas.push({fonte:"backup",erro:String(e&&e.message||e).slice(0,100)})})
        .then(function(){return {eventos:ev.sort(function(a,b){return a.data.localeCompare(b.data)}),falhas:falhas}})})}
  function mbaFeito(){return PESSOAL.mbaFeito||{}}
  function mbaAulas(){var L=PESSOAL.mbaLinks||{};return ((PESSOAL.mba||{}).aulas||[]).map(function(a){return Object.assign({},a,{link:L[a.id]||a.link||""})}).sort(function(a,b){return (a.data+a.hora).localeCompare(b.data+b.hora)})}
  function mbaAvals(){var f=mbaFeito(),hoje=hojeISO();return ((PESSOAL.mba||{}).avaliacoes||[]).map(function(a){return Object.assign({},a,{feita:!!f["av:"+a.id],vencida:a.ate<hoje})}).sort(function(a,b){return a.ate.localeCompare(b.ate)})}
  function mbaFin(){var F=(PESSOAL.mba||{}).financeiro;if(!F||!(F.parcelas||[]).length)return null;var f=mbaFeito(),hoje=hojeISO();
    var ps=F.parcelas.map(function(p){return Object.assign({},p,{paga:!!f["pg:"+p.k],atrasada:!f["pg:"+p.k]&&p.venc<hoje})});
    var abertas=ps.filter(function(p){return !p.paga});
    return {F:F,ps:ps,pagas:ps.length-abertas.length,prox:abertas[0]||null,atrasadas:abertas.filter(function(p){return p.atrasada}),
      pago:ps.filter(function(p){return p.paga}).reduce(function(s,p){return s+p.v},0),falta:abertas.reduce(function(s,p){return s+p.v},0)}}
  function hojeQuem(){if(typeof FAM==="undefined")return "";
    return Object.keys(FAM).map(function(k){var F=FAM[k];if(F.bebe)return F.n+" é a filha bebê do dono";if(F.veic)return /antigo/i.test(F.n)?null:F.n+" é um veículo do dono";
      if(F.docs)return null;return typeof AGENDA_ICO!=="undefined"&&AGENDA_ICO[k]==="🐶"?F.n+" é o cachorro da família":null}).filter(Boolean).join("; ")}

  /* os leitores do RAC Hoje de antes (js/hoje.js, HOJE_LEITORES) para Agenda, Newsletter e MBA */
  var HOJE_LEITORES_ANTES={
    agenda:function(){return agendaColetarLeitura().then(function(r){
      if(r.estado==="falha")throw new Error("a leitura da Agenda falhou ("+r.falhas.join("; ")+")");
      return {v:r.eventos,vazio:r.estado==="vazia",parcial:r.estado==="parcial",falhas:r.falhas,origem:"banco e dados do site"}})},
    newsletter:function(){var mem=typeof NLS!=="undefined"&&NLS.dados,d0=mem?Promise.resolve(NLS.dados):getJson("newsletter.json?v="+Math.floor(Date.now()/6e5));
      return d0.then(function(d){var c=NUCLEO.nlEdicao(d,PESSOAL.newsletter,Date.now());
        return {v:{destaques:(c.destaques||[]).map(function(g){return {t:g.titulo_pt||g.t,cat:NUCLEO.nlCat(g.c).n,n:g.n||1}})},vazio:!(c.destaques||[]).length,quando:d.coletado||null,origem:mem?"memória do site":"arquivo do site"}})},
    mba:function(){var hoje=hojeISO(),fin=mbaFin();
      var o={aulas:mbaAulas().filter(function(a){return a.data>=hoje}).slice(0,3),avals:mbaAvals().filter(function(a){return !a.feita}),
        progresso:fin?"MBA: "+fin.pagas+" de "+fin.ps.length+" parcelas pagas; falta pagar "+NUCLEO.hojeReais(fin.falta)+(fin.prox?"; próxima de "+NUCLEO.hojeReais(fin.prox.v)+" vence em "+fin.prox.venc:"")+".":""};
      return {v:o,vazio:!o.aulas.length&&!o.avals.length&&!fin,origem:"memória do site"}}};
