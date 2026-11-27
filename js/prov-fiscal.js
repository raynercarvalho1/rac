/* Dia a Dia RAC — provedor "fiscal" (Central Fiscal; Lote 3 do novo RAC). Fonte: notas_fiscais (RLS "casa") e, só para ligar fatos iguais, notas_fiscais_vinculos (nota → compra online, nota do Mercado, pedido ou registro de veículo).
   Chave: id (uuid). Data: data_emissao (dia). Atualização: criado_em. Espaço: casa. Compartilhável. Evento: fiscal.nota. Link: #fiscal. PRIORIDADE 1 (a menor): quando a nota confere uma compra que também está na lista, a
   compra fica e a nota é absorvida (NUCLEO.tlDeduplicar), sem apagar nem fundir nenhum registro original. Só LÊ. */
  var PV_FISC_MOD={compras:["compras","compras_online"],mercado:["mercado","notas"],alimentacao:["delivery","pedidos"],veiculos:["familia","registros"]};
  function pvFiscRelacionados(ids){if(!ids.length)return Promise.resolve({});
    return SB.from("notas_fiscais_vinculos").select("nota_id,modulo,registro_id").in("nota_id",ids).eq("valido",true).then(sbOk).then(function(l){var por={};
      l.forEach(function(v){var m=PV_FISC_MOD[v.modulo];if(!m)return;(por[v.nota_id]=por[v.nota_id]||[]).push(NUCLEO.tlId(m[0],m[1],v.registro_id))});return por},function(){return {}})}
  function pvFiscEvento(n,rel){var v=n.valor_a_pagar!=null?n.valor_a_pagar:n.valor_total;
    return {id:NUCLEO.tlId("fiscal","notas_fiscais",n.id),quando:NUCLEO.tlQuandoDe(n.data_emissao),diaInteiro:true,categoria:"financas",tipo:"fiscal.nota",titulo:n.emitente_nome||"Nota fiscal",
      resumo:NUCLEO.hojeReais(v)+(n.numero?" · nº "+n.numero:"")+(n.situacao&&n.situacao!=="autorizada"?" · "+n.situacao:""),relacionados:rel[n.id]||[],prioridade:1,link:"#fiscal",versaoFonte:n.criado_em}}
  provRegistrar({dominio:"fiscal",rotulo:"Central Fiscal",categoria:"financas",tipos:["fiscal.nota"],espaco:"casa",compartilhavel:true,
    lerJanela:function(op){var q=SB.from("notas_fiscais").select("id,numero,data_emissao,emitente_nome,valor_total,valor_a_pagar,situacao,criado_em").not("data_emissao","is",null).lte("data_emissao",provDiaDoCursor(op.cursor,op.ate));
      if(op.de)q=q.gte("data_emissao",op.de);
      return q.order("data_emissao",{ascending:false}).order("id",{ascending:false}).limit(op.limite).then(sbOk).then(function(l){
        return pvFiscRelacionados(l.map(function(n){return n.id})).then(function(rel){return {eventos:l.map(function(n){return pvFiscEvento(n,rel)}),esgotado:l.length<op.limite}})})},
    buscar:function(op){var q=provFiltroBusca(SB.from("notas_fiscais").select("id,numero,data_emissao,emitente_nome,valor_total,valor_a_pagar,situacao,criado_em"),["emitente_nome","numero"],op.termos);
      return q.order("data_emissao",{ascending:false,nullsFirst:false}).limit(op.limite).then(sbOk).then(function(l){return {itens:l.map(function(n){var e=pvFiscEvento(n,{});return {id:e.id,tipo:e.tipo,titulo:e.titulo,resumo:e.resumo+(n.data_emissao?" · "+dataBR(n.data_emissao):""),quando:n.data_emissao?e.quando:"",link:e.link}})}})}});
