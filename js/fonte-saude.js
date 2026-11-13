/* Dia a Dia RAC — fonte da Saúde (DS-4.3 · S1; contrato em js/fontes.js, modelo em js/fonte-agenda.js). Módulo leve, sem tela: a ÚNICA leitura de garmin_dia e
   garmin_ativ para análise. Antes, seis lugares liam as tabelas do relógio por caminhos próprios (Saúde, RAC Hoje, Sistema, Painel, Resumo e Carreira); agora todos
   passam por aqui: leitura paginada (RACdados), classificação de propriedade (NUCLEO.sauClassificar, inalterada: só os registros de 01/01/2026 em diante são
   "meus"; o legado continua no banco e fica fora de toda análise) e o estado da leitura. Só LÊ: nunca grava, apaga nem altera uma linha. */
  /* leituras iguais pedidas ao mesmo tempo (Saúde, Painel e Resumo abrem juntos) usam a mesma consulta; terminada, nada fica guardado */
  var SAUDE_EM_CURSO={};
  var SAUDE_COLUNAS={dia:"data,dados,atualizado",ativ:"id,inicio,tipo,dados"};
  /* opc: desdeDias e desdeAtiv (AAAA-MM-DD: só do dia em diante), colsDia e colsAtiv (colunas), limiteAtiv (os N treinos mais novos), semDias e semAtiv (não lê a tabela) */
  function saudeChaveLeitura(o){return JSON.stringify([o.desdeDias||"",o.desdeAtiv||"",o.colsDia||"",o.colsAtiv||"",o.limiteAtiv||0,!!o.semDias,!!o.semAtiv])}
  /* saudeColetarLeitura devolve {dias, ativs, legado:{dias,ativs}, semData, falhas, estado, ultimo, atualizado}: os dias em ordem crescente e os treinos do mais novo ao mais antigo.
     estado: "completa" (tudo lido), "vazia" (tudo lido, sem registros seus), "parcial" (uma tabela falhou; o que veio é utilizável) ou "falha" (nada foi lido). Falha nunca vira vazia. */
  function saudeColetarLeitura(opc){opc=opc||{};var k=saudeChaveLeitura(opc);if(SAUDE_EM_CURSO[k])return SAUDE_EM_CURSO[k];
    var p=saudeLerTabelas(opc).then(function(r){delete SAUDE_EM_CURSO[k];return r},function(e){delete SAUDE_EM_CURSO[k];throw e});SAUDE_EM_CURSO[k]=p;return p}
  function saudeLerTabelas(opc){var falhas=[],tentadas=0;
    function falhou(t,e){logErro("saúde",e);falhas.push(t+": "+String(e&&e.message||e).slice(0,100));return null}
    var pD=opc.semDias?Promise.resolve([]):(tentadas++,dadosPaginar(function(f){var q=SB.from("garmin_dia").select(opc.colsDia||SAUDE_COLUNAS.dia);if(opc.desdeDias)q=q.gte("data",opc.desdeDias);return q.order("data",{ascending:true}).range(f,f+999)}).catch(function(e){return falhou("garmin_dia",e)}));
    var pA=opc.semAtiv?Promise.resolve([]):(tentadas++,(opc.limiteAtiv?Promise.resolve().then(function(){var q=SB.from("garmin_ativ").select(opc.colsAtiv||SAUDE_COLUNAS.ativ);if(opc.desdeAtiv)q=q.gte("inicio",opc.desdeAtiv);return q.order("inicio",{ascending:false}).limit(opc.limiteAtiv)}).then(sbOk)
      :dadosPaginar(function(f){var q=SB.from("garmin_ativ").select(opc.colsAtiv||SAUDE_COLUNAS.ativ);if(opc.desdeAtiv)q=q.gte("inicio",opc.desdeAtiv);return q.order("inicio",{ascending:false}).range(f,f+999)})).catch(function(e){return falhou("garmin_ativ",e)}));
    return Promise.all([pD,pA]).then(function(r){
      /* a ordem é garantida aqui (e não só pelo banco): dias do mais antigo ao mais novo, treinos do mais novo ao mais antigo */
      var c=NUCLEO.sauClassificar((r[0]||[]).slice().sort(function(a,b){return a.data<b.data?-1:a.data>b.data?1:0}),(r[1]||[]).slice().sort(function(a,b){return a.inicio<b.inicio?1:a.inicio>b.inicio?-1:0})),dias=c.meus.dias,ativs=c.meus.ativs,ult=dias.length?dias[dias.length-1].data:ativs.length?String(ativs[0].inicio).slice(0,10):null,at=null;
      dias.forEach(function(d){var t=Date.parse(d.atualizado);if(isFinite(t)&&(at==null||t>at))at=t});
      return {dias:dias,ativs:ativs,legado:c.contagem.legado,semData:c.semData,falhas:falhas,ultimo:ult,atualizado:at!=null?new Date(at).toISOString():null,
        estado:falhas.length&&falhas.length>=tentadas?"falha":falhas.length?"parcial":(dias.length||ativs.length)?"completa":"vazia"}})}
  /* a leitura estrita de sempre (Painel, Resumo e Saúde): {dias, ativs, legado}; qualquer falha é erro, como antes */
  function saudeLer(){return saudeColetarLeitura().then(function(r){if(r.estado==="falha"||r.estado==="parcial")throw new Error(r.falhas[0]||"a leitura do relógio falhou");return {dias:r.dias,ativs:r.ativs,legado:r.legado}})}
  /* a fonte: {v:{dias, ativs, legado, semData, atualizado}}; leitura sem nada é falha da fonte; a parcial segue, marcada (parcial e falhas) */
  fonteRegistrar("saude",function(ctx){return saudeColetarLeitura(ctx).then(function(r){
    if(r.estado==="falha")throw new Error("a leitura do relógio falhou ("+r.falhas.join("; ")+")");
    return {v:{dias:r.dias,ativs:r.ativs,legado:r.legado,semData:r.semData,atualizado:r.atualizado},vazio:r.estado==="vazia",parcial:r.estado==="parcial",falhas:r.falhas,
      ultimo:r.ultimo,quando:r.ultimo?r.ultimo+"T23:59:00-03:00":null,origem:"banco"}})});
