/* Dia a Dia RAC — provedor "inbox" (e-mails que chegaram; Lote 3 do novo RAC). Fonte: inbox_mensagens_ref (só o CACHE DE CABEÇALHOS: assunto, remetente, data, lida, anexo provável; RLS "so o dono" + mfa) das pastas de entrada
   (inbox_pastas.uso = 'entrada'). Chave: id (uuid da referência). Data: recebida_em (timestamptz, convertido para Brasília). Espaço: pessoal. PRIVADO (compartilhavel:false, só do dono). O corpo e os anexos NUNCA são lidos
   aqui (continuam só sob demanda, no provedor de e-mail); o resumo é só o remetente. Evento: inbox.mensagem. Link: #inbox/<conta>/<pasta>/<id>. Só LÊ. */
  function pvInboxPastas(){return SB.from("inbox_pastas").select("id").eq("uso","entrada").eq("ativa",true).then(sbOk).then(function(l){return l.map(function(p){return p.id})})}
  function pvInboxEvento(m){var quando=NUCLEO.tlQuandoDe(m.recebida_em);if(!quando)return null;
    return {id:NUCLEO.tlId("inbox","inbox_mensagens_ref",m.id),quando:quando,categoria:"comunicacao",tipo:"inbox.mensagem",titulo:m.assunto||"(sem assunto)",resumo:m.remetente_nome||m.remetente_endereco||"",anexo:!!m.anexo_provavel,pendente:!m.lida,
      link:"#inbox/"+m.conta_id+"/"+(m.pasta_id||"")+"/"+m.id}}
  var PV_INBOX_COLS="id,conta_id,pasta_id,recebida_em,assunto,remetente_nome,remetente_endereco,lida,anexo_provavel";
  provRegistrar({dominio:"inbox",rotulo:"E-mail",categoria:"comunicacao",tipos:["inbox.mensagem"],espaco:"pessoal",compartilhavel:false,exige:{dono:true},
    lerJanela:function(op){return pvInboxPastas().then(function(ids){if(!ids.length)return {eventos:[],esgotado:true};
      var q=SB.from("inbox_mensagens_ref").select(PV_INBOX_COLS).in("pasta_id",ids).not("recebida_em","is",null);
      q=op.cursor?q.lte("recebida_em",op.cursor.quando):q.lte("recebida_em",op.ate+"T23:59:59-03:00");if(op.de)q=q.gte("recebida_em",op.de+"T00:00:00-03:00");
      return q.order("recebida_em",{ascending:false}).order("id",{ascending:false}).limit(op.limite).then(sbOk).then(function(l){return {eventos:l.map(pvInboxEvento).filter(Boolean),esgotado:l.length<op.limite}})})},
    buscar:function(op){return pvInboxPastas().then(function(ids){if(!ids.length)return {itens:[]};
      var q=provFiltroBusca(SB.from("inbox_mensagens_ref").select(PV_INBOX_COLS).in("pasta_id",ids).not("recebida_em","is",null),["assunto","remetente_nome","remetente_endereco"],op.termos);
      return q.order("recebida_em",{ascending:false}).limit(op.limite).then(sbOk).then(function(l){return {itens:l.map(function(m){var e=pvInboxEvento(m);return e?{id:e.id,tipo:e.tipo,titulo:e.titulo,resumo:e.resumo,quando:e.quando,anexo:e.anexo,link:e.link}:null}).filter(Boolean)}})})}});
