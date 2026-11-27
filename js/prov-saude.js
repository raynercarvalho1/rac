/* Dia a Dia RAC — provedor "saude" (treinos do relógio; Lote 3 do novo RAC). Fonte: a fonte única da Saúde (js/fonte-saude.js, que lê garmin_ativ; RLS "so o dono" + mfa: só as linhas de quem está logado e só o dono da conta). Chave: id (bigint do Garmin).
   Data: inicio (timestamp SEM fuso = hora local de Brasília, como o resto do site). Só de 01/01/2026 em diante (NUCLEO.SAU_MARCO: o que veio antes não é do dono) e sem os tipos que o RAC Hoje também esconde.
   Espaço: pessoal. PRIVADO (compartilhavel:false): nunca roda em espaço compartilhado. Respeita "Ocultar valores" dos Ajustes (só o tipo e o dia). Evento: saude.atividade. Link: #saude/treino/<id>.
   Só LÊ. O resumo vem de NUCLEO.hojeTreinoLinha (a mesma linha do RAC Hoje). */
    function pvSaudeMasc(){try{return !!NUCLEO.sauPrefs(PESSOAL.saudePrefs).ocultar}catch(e){return false}}
  function pvSaudeEvento(a){var l=NUCLEO.hojeTreinoLinha(a);if(!l)return null;var d=a.dados||{},ini=String(a.inicio).slice(0,19),fim=null;
    if(d.duracao>0){var t=Date.parse(NUCLEO.tlQuandoDe(ini));if(isFinite(t)){var f=new Date(t+d.duracao*1000-3*3600e3);fim=f.getUTCFullYear()+"-"+("0"+(f.getUTCMonth()+1)).slice(-2)+"-"+("0"+f.getUTCDate()).slice(-2)+"T"+("0"+f.getUTCHours()).slice(-2)+":"+("0"+f.getUTCMinutes()).slice(-2)+":00-03:00"}}
    return {id:NUCLEO.tlId("saude","garmin_ativ",a.id),quando:NUCLEO.tlQuandoDe(ini),fim:fim||undefined,categoria:"saude",tipo:"saude.atividade",titulo:l.titulo,resumo:pvSaudeMasc()?"valores ocultos nos Ajustes da Saúde":l.sub,link:l.href}}
  provRegistrar({dominio:"saude",rotulo:"Saúde",categoria:"saude",tipos:["saude.atividade"],espaco:"pessoal",compartilhavel:false,exige:{dono:true},
    lerJanela:function(op){var min=op.de&&op.de>NUCLEO.SAU_MARCO.data?op.de:NUCLEO.SAU_MARCO.data,ate=op.cursor?String(op.cursor.quando).slice(0,19):op.ate+"T23:59:59";
      return precisa(["fonte-saude"]).then(function(){return fonteOuErro("saude",{semDias:true,desdeAtiv:min,ateAtiv:ate,limiteAtiv:op.limite})}).then(function(c){var raw=(c.v&&c.v.ativs)||[],fora=NUCLEO.TREINO_OCULTOS;
        return {eventos:raw.filter(function(a){return fora.indexOf(a.tipo)<0}).map(pvSaudeEvento).filter(Boolean),esgotado:raw.length<op.limite}})},
    buscar:function(op){if(pvSaudeMasc())return Promise.resolve({itens:[]});var fora=NUCLEO.TREINO_OCULTOS,colunas=NUCLEO.sauPrefs(PESSOAL.saudePrefs).esconderLocal?["tipo","dados->>nome"]:["tipo","dados->>nome","dados->>local"];
      return precisa(["fonte-saude"]).then(function(){return fonteOuErro("saude",{semDias:true,desdeAtiv:NUCLEO.SAU_MARCO.data,limiteAtiv:op.limite*2,buscaAtiv:{termos:op.termos,colunas:colunas}})}).then(function(c){
        var out=((c.v&&c.v.ativs)||[]).filter(function(a){return fora.indexOf(a.tipo)<0}).slice(0,op.limite).map(pvSaudeEvento).filter(Boolean);
        return {itens:out.map(function(e){return {id:e.id,tipo:e.tipo,titulo:e.titulo,resumo:e.resumo,quando:e.quando,link:e.link}})}})}});
