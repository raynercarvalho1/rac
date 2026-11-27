/* Dia a Dia RAC — provedor "newsletter" (edições do resumo do dia; Lote 3 do novo RAC). Fonte: newsletter_edicoes (RLS só do dono). NÃO lê o conteúdo (jsonb de até 300 KB): só dia, turno e origem.
   Chave: id (uuid). Data: data + hora do turno (manhã 06h, tarde 12h, noite 18h; fuso de Brasília). Atualização: atualizado_em. Espaço: pessoal. PRIVADO (só do dono). Evento: newsletter.edicao. Link: #newsletter. Só LÊ. */
  var PV_NL_HORA={manha:"06:00",tarde:"12:00",noite:"18:00"},PV_NL_ROT={manha:"da manhã",tarde:"da tarde",noite:"da noite"};
  function pvNlEvento(e){return {id:NUCLEO.tlId("newsletter","newsletter_edicoes",e.id),quando:NUCLEO.tlQuandoDe(e.data,PV_NL_HORA[e.turno]),categoria:"descoberta",tipo:"newsletter.edicao",titulo:"Newsletter "+(PV_NL_ROT[e.turno]||""),
      resumo:e.origem==="ia"?"resumo com IA":"resumo por regras",link:"#newsletter",versaoFonte:e.atualizado_em||e.criado_em}}
  provRegistrar({dominio:"newsletter",rotulo:"Newsletter",categoria:"descoberta",tipos:["newsletter.edicao"],espaco:"pessoal",compartilhavel:false,exige:{dono:true},
    lerJanela:function(op){var q=SB.from("newsletter_edicoes").select("id,data,turno,origem,criado_em,atualizado_em").lte("data",provDiaDoCursor(op.cursor,op.ate));if(op.de)q=q.gte("data",op.de);
      return q.order("data",{ascending:false}).order("id",{ascending:false}).limit(op.limite).then(sbOk).then(function(l){return {eventos:l.map(pvNlEvento),esgotado:l.length<op.limite}})}});
