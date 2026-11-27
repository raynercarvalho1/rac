/* Dia a Dia RAC — provedor "registros" (Família, Veículos e Documentos; Lote 3 do novo RAC). Fonte: tabela registros (RLS "casa": quem é da casa lê). Chave: id (uuid). Data: data (só dia, vira "dia inteiro").
   Atualização: criado_em. Espaço: casa. Compartilhável (é dado da casa). Evento: familia.<tipo> | veiculos.<tipo> | documentos.<tipo>. Link: a página do integrante (#olivia, #veiculos/civic, #documentos).
   Só LÊ. Depende de js/prov.js e js/fonte-familia.js (FAM e rótulos dos tipos). */
  function pvRegAlvo(F,quem){return F.veic?"#veiculos/"+quem:F.docs?"#documentos":"#"+quem}
  function pvRegEvento(r){var F=FAM[r.quem];if(!F)return null;var info=tipoInfo(r.tipo),dom=F.veic?"veiculos":F.docs?"documentos":"familia",resumo=[F.n,info[1],r.valor].filter(Boolean).join(" · ");
    return {id:NUCLEO.tlId("familia","registros",r.id),quando:NUCLEO.tlQuandoDe(r.data),diaInteiro:true,categoria:F.veic||F.docs?"casa":"familia",tipo:dom+"."+String(r.tipo||"outro").replace(/[^a-z0-9_]/g,"_"),
      titulo:r.titulo,resumo:resumo,pessoa:F.n,anexo:Array.isArray(r.arquivos)&&r.arquivos.length>0,link:pvRegAlvo(F,r.quem),versaoFonte:r.criado_em}}
  provRegistrar({dominio:"registros",rotulo:"Família e casa",categoria:"familia",categorias:["familia","casa"],tipos:[],espaco:"casa",compartilhavel:true,
    lerJanela:function(op){var q=SB.from("registros").select("id,quem,tipo,data,titulo,valor,arquivos,criado_em").lte("data",provDiaDoCursor(op.cursor,op.ate));
      if(op.de)q=q.gte("data",op.de);
      return q.order("data",{ascending:false}).order("id",{ascending:false}).limit(op.limite).then(sbOk).then(function(l){return {eventos:l.map(pvRegEvento).filter(Boolean),esgotado:l.length<op.limite}})},
    buscar:function(op){var q=provFiltroBusca(SB.from("registros").select("id,quem,tipo,data,titulo,detalhes,valor,arquivos"),["titulo","detalhes","valor"],op.termos);
      return q.order("data",{ascending:false}).limit(op.limite).then(sbOk).then(function(l){return {itens:l.map(function(r){var F=FAM[r.quem];if(!F)return null;
        return {id:"familia:registros:"+r.id,tipo:(F.veic?"veiculos.":F.docs?"documentos.":"familia.")+String(r.tipo||"outro").replace(/[^a-z0-9_]/g,"_"),titulo:r.titulo,resumo:F.n+" · "+tipoInfo(r.tipo)[1]+" · "+dataBR(r.data),quando:NUCLEO.tlQuandoDe(r.data),
          link:pvRegAlvo(F,r.quem),anexo:Array.isArray(r.arquivos)&&r.arquivos.length>0,acao:{registro:{id:r.id,quem:r.quem}},categoria:F.veic||F.docs?"casa":"familia"}}).filter(Boolean)}})}});
