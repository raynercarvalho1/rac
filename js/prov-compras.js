/* Dia a Dia RAC — provedores "compras" (pedidos online) e "mercado" (notas do Mercado e produtos; Lote 3 do novo RAC). Só leem; RLS "casa"; espaço casa; compartilháveis.
   compras: tabela compras_online. Chave: id. Data: data (dia). Atualização: criado_em. Evento: compras.pedido. Link: #compras. PRIORIDADE 2 (vence a nota fiscal que a confere).
   mercado: tabela notas (uma nota = uma ida ao mercado; o nome vem de mercados). Chave: id. Data: data. Evento: mercado.nota. Link: #mercado. PRIORIDADE 2. A busca também acha produtos (tabela produtos).
   Ocultar valores não se aplica (são compras da casa). Depende de js/prov.js. */
  var PV_LOJAS={amazon:"Amazon",mercadolivre:"Mercado Livre",shopee:"Shopee",magalu:"Magalu",outra:"Loja online"};
  function pvPedidoEvento(p){return {id:NUCLEO.tlId("compras","compras_online",p.id),quando:NUCLEO.tlQuandoDe(p.data),diaInteiro:true,categoria:"financas",tipo:"compras.pedido",titulo:(PV_LOJAS[p.loja]||"Loja online")+(p.vendedor?" · "+p.vendedor:""),
      resumo:NUCLEO.hojeReais(p.total_pago)+(p.status?" · "+p.status:"")+(p.categoria?" · "+p.categoria:""),prioridade:2,link:"#compras",versaoFonte:p.criado_em}}
  provRegistrar({dominio:"compras",rotulo:"Pedidos online",categoria:"financas",tipos:["compras.pedido"],espaco:"casa",compartilhavel:true,
    lerJanela:function(op){var q=SB.from("compras_online").select("id,loja,numero,data,vendedor,status,total_pago,categoria,criado_em").lte("data",provDiaDoCursor(op.cursor,op.ate));if(op.de)q=q.gte("data",op.de);
      return q.order("data",{ascending:false}).order("id",{ascending:false}).limit(op.limite).then(sbOk).then(function(l){return {eventos:l.map(pvPedidoEvento),esgotado:l.length<op.limite}})},
    buscar:function(op){var q=provFiltroBusca(SB.from("compras_online").select("id,loja,numero,data,vendedor,status,total_pago,categoria,criado_em"),["vendedor","categoria","numero","emitente"],op.termos);
      return q.order("data",{ascending:false}).limit(op.limite).then(sbOk).then(function(l){return {itens:l.map(function(p){var e=pvPedidoEvento(p);return {id:e.id,tipo:e.tipo,titulo:e.titulo,resumo:e.resumo+" · "+dataBR(p.data),quando:e.quando,link:e.link}})}})}});
  function pvNotaEvento(n){var nome=n.mercados&&n.mercados.nome?String(n.mercados.nome).replace(/\s*\(.*\)$/,""):"Mercado";
    return {id:NUCLEO.tlId("mercado","notas",n.id),quando:NUCLEO.tlQuandoDe(n.data),diaInteiro:true,categoria:"financas",tipo:"mercado.nota",titulo:nome,resumo:(n.total!=null?NUCLEO.hojeReais(n.total):"")+(n.numero?" · nota "+n.numero:""),prioridade:2,link:"#mercado",versaoFonte:n.created_at}}
  provRegistrar({dominio:"mercado",rotulo:"Mercado",categoria:"financas",tipos:["mercado.nota"],espaco:"casa",compartilhavel:true,
    lerJanela:function(op){var q=SB.from("notas").select("id,data,numero,total,created_at,mercados(nome)").lte("data",provDiaDoCursor(op.cursor,op.ate));if(op.de)q=q.gte("data",op.de);
      return q.order("data",{ascending:false}).order("id",{ascending:false}).limit(op.limite).then(sbOk).then(function(l){return {eventos:l.map(pvNotaEvento),esgotado:l.length<op.limite}})},
    buscar:function(op){return Promise.all([provFiltroBusca(SB.from("produtos").select("nome,categoria"),["nome","categoria"],op.termos).order("nome").limit(op.limite).then(sbOk),
        provFiltroBusca(SB.from("notas").select("id,data,numero,total,created_at,mercados!inner(nome)"),["mercados.nome","numero"],op.termos).order("data",{ascending:false}).limit(op.limite).then(sbOk).catch(function(){return []})]).then(function(r){
      var it=r[0].map(function(p){return {id:"mercado:produtos:"+p.nome,tipo:"mercado.produto",titulo:p.nome,resumo:p.categoria||"produto",link:"#mercado/precos",acao:{produto:p.nome}}});
      r[1].forEach(function(n){var e=pvNotaEvento(n);it.push({id:e.id,tipo:e.tipo,titulo:e.titulo,resumo:e.resumo+" · "+dataBR(n.data),quando:e.quando,link:e.link})});return {itens:it}})}});
