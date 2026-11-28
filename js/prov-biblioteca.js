/* Dia a Dia RAC — provedor "biblioteca" (Lote 4 do novo RAC; o da caixa de entrada está em js/prov-captura.js). Só BUSCA (a Biblioteca e a caixa não têm data de acontecimento; a Timeline não os lista neste lote). Só leem, com a sessão de quem vê (RLS).
   biblioteca: tabela biblioteca_itens (referências e metadados; nunca o conteúdo de arquivo). Espaço: o PESSOAL (a busca fica restrita ao espaço pessoal da pessoa, para o rótulo do espaço estar certo); compartilhavel:false até a
   busca por espaço compartilhado existir. Chave: id (uuid). Evento: biblioteca.item. Link: #biblioteca.
   Depende de js/prov.js. */
  var PV_BIB_ESP=null;
  function pvBibEspacoPessoal(){if(PV_BIB_ESP)return PV_BIB_ESP;PV_BIB_ESP=Promise.resolve().then(function(){return SB.rpc("rac_iniciar_espacos")}).then(sbOk).then(function(l){var p=(l||[]).filter(function(e){return e.tipo==="pessoal"})[0];return p?p.id:null});
    PV_BIB_ESP.then(null,function(){PV_BIB_ESP=null});setTimeout(function(){PV_BIB_ESP=null},60e3);return PV_BIB_ESP}
  var PV_BIB_ROT={link:"link",nota:"nota",documento:"documento",arquivo:"arquivo",referencia:"referência"};
  provRegistrar({dominio:"biblioteca",rotulo:"Biblioteca",categoria:"projetos",tipos:["biblioteca.item"],espaco:"pessoal",compartilhavel:false,exige:{dono:true},
    buscar:function(op){return pvBibEspacoPessoal().then(function(esp){if(!esp)return {itens:[]};
      var q=provFiltroBusca(SB.from("biblioteca_itens").select("id,tipo,titulo,descricao,url,criado_em").eq("espaco_id",esp).is("arquivada_em",null),["titulo","descricao","texto","url"],op.termos);
      return q.order("criado_em",{ascending:false}).limit(op.limite).then(sbOk).then(function(l){return {itens:l.map(function(i){return {id:NUCLEO.tlId("biblioteca","biblioteca_itens",i.id),tipo:"biblioteca.item",titulo:i.titulo,resumo:(PV_BIB_ROT[i.tipo]||"item")+(i.url?" · "+NUCLEO.cpHost(i.url):i.descricao?" · "+String(i.descricao).slice(0,80):""),quando:i.criado_em,link:"#biblioteca"}})}})})}});
