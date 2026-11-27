/* Dia a Dia RAC — provedor "saude" (treinos do relógio; Lote 3 do novo RAC). Fonte: tabela garmin_ativ (RLS "so o dono" + mfa: só as linhas de quem está logado e só o dono da conta). Chave: id (bigint do Garmin).
   Data: inicio (timestamp SEM fuso = hora local de Brasília, como o resto do site). Só de 01/01/2026 em diante (NUCLEO.SAU_MARCO: o que veio antes não é do dono) e sem os tipos que o RAC Hoje também esconde.
   Espaço: pessoal. PRIVADO (compartilhavel:false): nunca roda em espaço compartilhado. Respeita "Ocultar valores" dos Ajustes (só o tipo e o dia). Evento: saude.atividade. Link: #saude/treino/<id>.
   Só LÊ. O resumo vem de NUCLEO.hojeTreinoLinha (a mesma linha do RAC Hoje). */
  var PV_SAUDE_TIPOS_FORA="("+NUCLEO.TREINO_OCULTOS.join(",")+")";
  function pvSaudeMasc(){try{return !!NUCLEO.sauPrefs(PESSOAL.saudePrefs).ocultar}catch(e){return false}}
  function pvSaudeEvento(a){var l=NUCLEO.hojeTreinoLinha(a);if(!l)return null;var d=a.dados||{},ini=String(a.inicio).slice(0,19),fim=null;
    if(d.duracao>0){var t=Date.parse(NUCLEO.tlQuandoDe(ini));if(isFinite(t)){var f=new Date(t+d.duracao*1000-3*3600e3);fim=f.getUTCFullYear()+"-"+("0"+(f.getUTCMonth()+1)).slice(-2)+"-"+("0"+f.getUTCDate()).slice(-2)+"T"+("0"+f.getUTCHours()).slice(-2)+":"+("0"+f.getUTCMinutes()).slice(-2)+":00-03:00"}}
    return {id:NUCLEO.tlId("saude","garmin_ativ",a.id),quando:NUCLEO.tlQuandoDe(ini),fim:fim||undefined,categoria:"saude",tipo:"saude.atividade",titulo:l.titulo,resumo:pvSaudeMasc()?"valores ocultos nos Ajustes da Saúde":l.sub,link:l.href}}
  provRegistrar({dominio:"saude",rotulo:"Saúde",categoria:"saude",tipos:["saude.atividade"],espaco:"pessoal",compartilhavel:false,exige:{dono:true},
    lerJanela:function(op){var min=op.de&&op.de>NUCLEO.SAU_MARCO.data?op.de:NUCLEO.SAU_MARCO.data,q=SB.from("garmin_ativ").select("id,inicio,tipo,dados").gte("inicio",min).not("tipo","in",PV_SAUDE_TIPOS_FORA);
      q=op.cursor?q.lte("inicio",String(op.cursor.quando).slice(0,19)):q.lte("inicio",op.ate+"T23:59:59");
      return q.order("inicio",{ascending:false}).order("id",{ascending:false}).limit(op.limite).then(sbOk).then(function(l){return {eventos:l.map(pvSaudeEvento).filter(Boolean),esgotado:l.length<op.limite}})},
    buscar:function(op){if(pvSaudeMasc())return {itens:[]};var q=provFiltroBusca(SB.from("garmin_ativ").select("id,inicio,tipo,dados").gte("inicio",NUCLEO.SAU_MARCO.data).not("tipo","in",PV_SAUDE_TIPOS_FORA),(NUCLEO.sauPrefs(PESSOAL.saudePrefs).esconderLocal?["tipo","dados->>nome"]:["tipo","dados->>nome","dados->>local"]),op.termos);
      return q.order("inicio",{ascending:false}).limit(op.limite).then(sbOk).then(function(l){return {itens:l.map(function(a){var e=pvSaudeEvento(a);return e?{id:e.id,tipo:e.tipo,titulo:e.titulo,resumo:e.resumo,quando:e.quando,link:e.link}:null}).filter(Boolean)}})}});
