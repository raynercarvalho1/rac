/* Dia a Dia RAC — fonte da Agenda (Fase 2 · A4; contrato em js/fontes.js). Módulo leve, sem tela: tudo o que tem data no site. Lê os
   registros e a pasta de backups do servidor (só o dono), junta com a Família (js/fonte-familia.js), o MBA (js/fonte-mba.js), os
   aniversários, os lembretes e as candidaturas, e a escolha dos itens é a do núcleo (NUCLEO.agendaItens, Fase 2 · A5). Antes morava dentro
   da tela do Sistema (js/sistema.js), e o RAC Hoje precisava carregar a tela inteira; a tela da Agenda, a Próxima ação, o Painel e o resumo
   falado continuam usando as mesmas funções (agendaColetarLeitura e agendaColetar), agora daqui. */
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
  /* as leituras: registros e a pasta de backups (só o dono); o resto vem da memória do site. Uma falha vira item de "falhas", nunca some */
  function agendaLer(){
    var hoje=hojeISO(),falhas=[],dono=isOwner();
    function falhou(fonte,e){falhas.push({fonte:fonte,erro:String(e&&e.message||e).slice(0,100)})}
    var pReg=dono?SB.from("registros").select("id,quem,tipo,data,titulo,proxima,dados").order("data",{ascending:false}).then(sbOk).catch(function(e){logErro("agenda",e);falhou("registros",e);return []}):Promise.resolve([]);
    return pReg.then(function(regs){
      /* o backup automático de domingo (no cofre privado do servidor): {lido, ultimo} para o núcleo avisar se parou */
      var pBk=!dono?Promise.resolve(null):Promise.resolve().then(function(){return SB.storage.from("backups").list(EU.id,{sortBy:{column:"name",order:"desc"},limit:1})}).then(function(r){
        if(r&&r.error){falhou("backup",r.error.message||r.error);return null}
        return {lido:true,ultimo:r&&r.data&&r.data[0]&&r.data[0].name.slice(0,10)}},function(e){falhou("backup",e);return null});
      return pBk.then(function(bk){var m=dono?fonteMbaDados():{};
        return {eventos:NUCLEO.agendaItens({hoje:hoje,dono:dono,regs:regs,fam:FAM,ico:AGENDA_ICO,tipoInfo:tipoInfo,aulas:m.aulas,avals:m.avals,fin:m.fin,
          aniversarios:dono?withDates():[],lembretes:PESSOAL.lembretes,candidaturas:PESSOAL.candidaturas,ultimoBackup:PESSOAL.ultimoBackup,backup:bk}),falhas:falhas}})})}
  /* a fonte: {v: os eventos}; a leitura que falhou e não deixou nada é falha da fonte; a parcial segue, marcada (parcial e falhas) */
  fonteRegistrar("agenda",function(){return agendaColetarLeitura().then(function(r){
    if(r.estado==="falha")throw new Error("a leitura da Agenda falhou ("+r.falhas.join("; ")+")");
    return {v:r.eventos,vazio:r.estado==="vazia",parcial:r.estado==="parcial",falhas:r.falhas,origem:"banco e dados do site"}})});
