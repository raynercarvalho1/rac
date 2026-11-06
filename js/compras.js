/* Dia a Dia RAC — módulo carregado quando a seção abre. Central de Compras (docs/compras.md): pedidos de lojas online (Amazon primeiro;
   Mercado Livre e outras no mesmo formato), importados de PDF de resumo, DANFE, XML da NF-e, CSV/ZIP de exportação, e-mails (arquivo .eml,
   texto colado ou o Gmail já conectado no site) e prints (OCR no próprio aparelho). Guarda sempre o arquivo ORIGINAL no cofre "familia"
   (<dono>/compras/<compra>/) e o que foi extraído na tabela (025_compras_online.sql). As contas ficam no núcleo (NUCLEO.co*).
   Nada é gravado antes do Salvar; nenhuma IA em REAL; nenhuma ação na conta da loja. */
  var CC={aba:"resumo",dados:null,carregando:null,aberto:null,lote:null};
  var CC_ABAS=[["resumo","Resumo"],["lista","Compras"],["importar","Importar"],["produtos","Produtos e recorrências"],["nova","＋ Manual"]];
  /* bibliotecas do CDN, com versão exata, carregadas só quando precisam */
  var CC_PDF="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",CC_PDF_W="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  var CC_ZIP="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",CC_OCR="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  var CC_MIME={pdf:"application/pdf",xml:"text/xml",csv:"text/csv",zip:"application/zip",eml:"message/rfc822",txt:"text/plain",jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp",heic:"image/heic",gif:"image/gif"};
  var CC_COLS="id,loja,numero,data,vendedor,status,subtotal,desconto,frete,taxas,total_pago,pagamento,categoria,recorrencia_texto,recorrencia_meses,recorrencia_status,chave_nfe,numero_nf,emitente,cnpj,fora_das_contas,motivo_fora,divergencias,observacoes,origem,versoes,criado_em,atualizado_em";
  function ccNum(v){return v==null||v===""?null:+v}
  function ccCompra(r){var c={};Object.keys(r).forEach(function(k){c[k]=r[k]});["subtotal","desconto","frete","taxas","total_pago","recorrencia_meses"].forEach(function(k){c[k]=ccNum(r[k])});
    c.itens=(r.compras_online_itens||[]).slice().sort(function(a,b){return a.ordem-b.ordem}).map(function(i){return {id:i.id,descricao:i.descricao,codigo:i.codigo,qtd:ccNum(i.qtd),unitario:ccNum(i.unitario),total:ccNum(i.total),desconto:ccNum(i.desconto)||0,categoria:i.categoria,imagem_path:i.imagem_path}});
    c.docs=(r.compras_online_docs||[]).slice().sort(function(a,b){return a.criado_em<b.criado_em?-1:1});delete c.compras_online_itens;delete c.compras_online_docs;return c}
  function ccPag(q){var acc=[];function pag(f){return Promise.resolve().then(function(){return q(f)}).then(sbOk).then(function(l){acc=acc.concat(l);return l.length===1000?pag(f+1000):acc})}return pag(0)}
  function ccCarregar(forcar){
    if(CC.carregando&&!forcar)return CC.carregando;
    CC.carregando=ccLer().then(function(l){CC.dados=l;return CC.dados});
    CC.carregando.catch(function(){CC.carregando=null});return CC.carregando}
  /* só lê (não mexe em CC) */
  function ccLer(){return ccPag(function(f){return SB.from("compras_online").select(CC_COLS+",compras_online_itens(id,ordem,descricao,codigo,qtd,unitario,total,desconto,categoria,imagem_path),compras_online_docs(id,tipo,nome,path,mime,tamanho,sha256,criado_em)")
      .order("data",{ascending:false}).order("criado_em",{ascending:false}).order("id",{ascending:false}).range(f,f+999)}).then(function(l){return l.map(ccCompra)})}
  /* D2: as outras fontes para a checagem de duplicidade (só leitura; falhou → lista vazia, e a conferência segue sem elas).
     Mercado: notas agrupadas por data+mercado+número (total = soma das linhas); Alimentação: pedidos; Abastecimento: registros com custo.
     A comparação continua sendo a do núcleo (mesmo dia e mesmo total → "possível repetido", que só pergunta). */
  function ccOutras(){var mer=ccPag(function(f){return SB.from("compras").select("id,data,valor_total,mercado,numero").order("data").order("id").range(f,f+999)}).then(function(l){var g={},k=[];
        l.forEach(function(x){var ch=x.data+"|"+x.mercado+"|"+(x.numero||"");if(!g[ch]){g[ch]={origem:"Mercado",data:x.data,total:0,nome:x.mercado};k.push(ch)}g[ch].total+=+x.valor_total||0});
        return k.map(function(ch){g[ch].total=Math.round(g[ch].total*100)/100;return g[ch]})}),
      ali=ccPag(function(f){return SB.from("pedidos").select("id,data,total_pago,estabelecimento").order("data").order("id").range(f,f+999)}).then(function(l){return l.filter(function(x){return +x.total_pago>0}).map(function(x){return {origem:"Alimentação",data:x.data,total:+x.total_pago,nome:x.estabelecimento}})}),
      abs=ccPag(function(f){return SB.from("registros").select("id,data,titulo,dados").eq("tipo","abastecimento").order("data").order("id").range(f,f+999)}).then(function(l){return l.filter(function(x){return x.dados&&typeof x.dados.custo==="number"&&x.dados.custo>0}).map(function(x){return {origem:"Abastecimento",data:x.data,total:x.dados.custo,nome:x.titulo}})});
    function tolerante(p){return p.then(function(l){return l},function(){return []})}
    return Promise.all([tolerante(mer),tolerante(ali),tolerante(abs)]).then(function(r){CC.outras=[].concat(r[0],r[1],r[2]);return CC.outras})}
  function ccEsquecer(){CC.carregando=null;if(typeof PAINEL!=="undefined")PAINEL.cache={}}
  /* botão de atualizar: as compras de novo, trocadas só se a leitura vier inteira. Um lote importado esperando conferência não é
     redesenhado (sumiria sem ser salvo): primeiro salve ou saia de Importar */
  atuModulo("compras",{
    buscar:function(){return atuLer(ccLer).then(function(r){return {compras:r}})},
    antes:function(){return CC.dados?{compras:{ok:true}}:{}},
    trocar:function(n){CC.dados=n.compras.v;CC.carregando=Promise.resolve(CC.dados);if(typeof PAINEL!=="undefined")PAINEL.cache={}},
    ocupado:function(){return CC.aba==="importar"&&CC.lote&&CC.lote.isConnected?"a conferência da importação (salve os pedidos ou saia de Importar)":""}});
  function ccLoja(c){return NUCLEO.CO_LOJAS[c.loja]||c.loja}
  function ccFonte(t){return h("p",{class:"sub pnfonte",text:"Fonte: "+t})}
  function ccVazio(t){return h("p",{class:"empty",text:t})}
  function ccMes(m){return MES3[+m.slice(5,7)-1]+"/"+m.slice(0,4)}
  /* links temporários do cofre (1 hora), um pedido de cada vez */
  function ccUrls(paths){paths=paths.filter(Boolean);if(!paths.length)return Promise.resolve({});
    return SB.storage.from("familia").createSignedUrls(paths,3600).then(function(r){var o={};(r.data||[]).forEach(function(x){if(x.signedUrl)o[x.path]=x.signedUrl});return o},function(){return {}})}

  function renderCompras(sub,id){
    CC.aba=CC_ABAS.some(function(a){return a[0]===sub})||sub==="editar"?sub:"resumo";
    var root=$("#compras-view");root.innerHTML="";
    var topo=panel("Central de Compras","Pedidos de lojas online, importados dos documentos da própria loja (PDF, nota fiscal, XML, CSV, e-mail ou print). O arquivo original fica guardado junto do pedido."),
      abas=h("div",{class:"seg famseg ccabas",role:"group","aria-label":"Área"});
    CC_ABAS.forEach(function(a){abas.appendChild(h("a",{href:"#compras/"+a[0],"aria-pressed":String(CC.aba===a[0]),text:a[1]}))});
    topo.appendChild(abas);root.appendChild(topo);
    var corpo=h("div",{class:"stack"},h("div",{class:"panel"},loading()));root.appendChild(corpo);
    ccCarregar().then(function(){corpo.innerHTML="";
      if(CC.aba==="importar"){ccImportar(corpo);return}
      if(CC.aba==="nova"){corpo.appendChild(ccConferencia({cand:{loja:"amazon",itens:[{descricao:"",qtd:1,total:null}],docs:[],imagens:[],origem:"manual"},avulso:true}));return}
      if(CC.aba==="editar"){var c=CC.dados.filter(function(x){return x.id===id})[0];
        corpo.appendChild(c?ccConferencia({existente:c,cand:JSON.parse(JSON.stringify(c)),docs:[],avulso:true}):h("div",{class:"panel"},ccVazio("Essa compra não foi encontrada."),h("a",{class:"ghostbtn",href:"#compras/lista",text:"Ver as compras"})));return}
      ({resumo:ccResumo,lista:ccLista,produtos:ccProdutos}[CC.aba])().forEach(function(x){if(x)corpo.appendChild(x)})})
    .catch(function(e){corpo.innerHTML="";corpo.appendChild(h("div",{class:"panel"},failed(function(){ccEsquecer();renderCompras(CC.aba)},e)));logErro("compras",e)})}

  /* ---------- Resumo ---------- */
  function ccResumo(){
    var L=[],meses=NUCLEO.pnMeses(hojeISO(),12),mes=meses[11],D=NUCLEO.coDespesas(CC.dados),doMes=D.filter(function(x){return x.d.slice(0,7)===mes}),ano=D.filter(function(x){return x.d>=meses[0]+"-01"});
    var p=panel("Resumo","Pelo total efetivamente pago de cada pedido (com desconto, frete e taxas). Compras marcadas como já contadas em outro lugar ficam fora.");
    if(!CC.dados.length){p.appendChild(ccVazio("Nenhuma compra ainda. Use “Importar” para trazer o PDF, a nota fiscal, o CSV ou os e-mails da loja."));
      p.appendChild(h("div",{class:"vfil"},h("a",{class:"ghostbtn pri",href:"#compras/importar",text:"Importar compras"})));L.push(p);return L}
    var soma=function(l){return l.reduce(function(s,x){return s+x.v},0)};
    var econ=CC.dados.filter(function(c){return c.data>=meses[0]+"-01"&&!c.fora_das_contas}).reduce(function(s,c){return s+(c.desconto||0)},0);
    p.appendChild(rsKpis([["Este mês",brl(soma(doMes))],["Pedidos no mês",doMes.length],["Últimos 12 meses",brl(soma(ano))],["Descontos (12 meses)",brl(econ)],["Ticket médio",ano.length?brl(soma(ano)/ano.length):""]]));
    var B=meses.map(function(m){return {k:m,cima:MES3[+m.slice(5,7)-1],baixo:m.slice(2,4),nome:ccMes(m)}}),pm=NUCLEO.pnPorMes(D,meses);
    p.appendChild(h("h3",{class:"mbag",text:"Por mês"}));
    p.appendChild(rsColunas(B,meses.map(function(m){return pm[m].total}),function(v){return v>=1000?fmtN(Math.round(v/100)/10)+" mil":String(Math.round(v))},function(i,v){return [B[i].nome,v?brl(v)+" · "+pm[meses[i]].n+(pm[meses[i]].n===1?" pedido":" pedidos"):"sem compras"]}));
    var cat={},loja={};ano.forEach(function(x){cat[x.cat]=(cat[x.cat]||0)+x.v});
    CC.dados.forEach(function(c){if(c.fora_das_contas||c.data<meses[0]+"-01")return;var k=c.vendedor&&c.loja==="outra"?c.vendedor:ccLoja(c);loja[k]=(loja[k]||0)+(c.total_pago||0)});
    var barras=function(o,suf){return rsBarras(Object.keys(o).sort(function(a,b){return o[b]-o[a]}).slice(0,10).map(function(k){return {nome:k,v:o[k],txt:brl(o[k]),dica:brl(o[k])+" "+suf}}))};
    if(Object.keys(cat).length){p.appendChild(h("h3",{class:"mbag",text:"Por categoria (12 meses)"}));p.appendChild(barras(cat,"em 12 meses"))}
    if(Object.keys(loja).length){p.appendChild(h("h3",{class:"mbag",text:"Por loja (12 meses)"}));p.appendChild(barras(loja,"em 12 meses"))}
    p.appendChild(ccFonte("Central de Compras · "+dataBR(meses[0]+"-01")+" a "+dataBR(hojeISO())));L.push(p);
    var rec=NUCLEO.coRecorrencias(CC.dados).filter(function(r){return r.informada&&r.informada.status==="a_confirmar"});
    if(rec.length){var pr=panel("Recorrências a confirmar","A loja informou uma entrega automática. Nada foi criado para o futuro: confirme ou descarte na compra.");
      pr.appendChild(h("ul",{class:"wl"},rec.map(function(r){var c=r.compra,bx=h("div",{class:"vfil"});
        if(c)[["confirmada","Confirmar"],["descartada","Descartar"]].forEach(function(o){var b=h("button",{type:"button",class:"ghostbtn",text:o[1]});
          b.onclick=function(){b.disabled=true;SB.from("compras_online").update({recorrencia_status:o[0],atualizado_em:new Date().toISOString()}).eq("id",c.id).then(sbOk).then(function(){ccEsquecer();renderCompras("resumo")},function(){b.disabled=false})};bx.appendChild(b)});
        return h("li",{class:"ccli"},h("span",{class:"grow"},h("b",{text:r.produto}),h("span",{class:"sub",text:r.informada.texto+(r.proximaEstimada?" · próxima prevista (estimativa): "+dataBR(r.proximaEstimada):"")+" · a compra de "+dataBR(r.ultima)+" continua confirmada"})),bx)})));L.push(pr)}
    return L}

  /* ---------- Lista e detalhe ---------- */
  function ccLista(){
    var p=panel("Compras","Toque numa compra para ver os produtos, os documentos originais, as divergências e a recorrência.");
    if(!CC.dados.length){p.appendChild(ccVazio("Nenhuma compra ainda."));p.appendChild(h("div",{class:"vfil"},h("a",{class:"ghostbtn pri",href:"#compras/importar",text:"Importar compras"})));return [p]}
    var q=h("input",{type:"search",placeholder:"Buscar (produto, loja ou número do pedido)","aria-label":"Buscar compras"}),lista=h("div");p.appendChild(q);p.appendChild(lista);
    function draw(){lista.innerHTML="";var nq=NUCLEO.norm(q.value.trim()),por={};
      CC.dados.filter(function(c){return !nq||NUCLEO.norm([c.numero,c.vendedor,ccLoja(c),c.itens.map(function(i){return i.descricao}).join(" ")].join(" ")).indexOf(nq)>=0}).forEach(function(c){(por[c.data.slice(0,7)]=por[c.data.slice(0,7)]||[]).push(c)});
      var ks=Object.keys(por).sort().reverse();if(!ks.length){lista.appendChild(ccVazio("Nada encontrado."));return}
      ks.forEach(function(m){var l=por[m];lista.appendChild(h("h3",{class:"mbag",text:ccMes(m)+" · "+l.length+(l.length===1?" compra":" compras")+" · "+brl(l.reduce(function(s,c){return s+(c.fora_das_contas?0:c.total_pago)},0))}));
        lista.appendChild(h("ul",{class:"wl"},l.map(function(c){var b=h("button",{type:"button",class:"ccitem","aria-expanded":String(CC.aberto===c.id)},h("span",{class:"when",text:dataBR(c.data).slice(0,5)}),
            h("span",{class:"grow"},h("b",{text:c.itens.length?c.itens[0].descricao+(c.itens.length>1?" + "+(c.itens.length-1):""):"Pedido "+c.numero}),
              h("span",{class:"sub",text:ccLoja(c)+" · "+c.numero+(c.docs.length?" · 📎 "+c.docs.length:"")+(c.recorrencia_status==="a_confirmar"?" · 🔁 a confirmar":c.recorrencia_status==="confirmada"?" · 🔁":"")+((c.divergencias||[]).length?" · ⚠":"")+(c.fora_das_contas?" · fora das contas":"")})),
            h("b",{class:"mkt",text:brl(c.total_pago)}));var li=h("li",{class:"ccli"},b);
          b.onclick=function(){CC.aberto=CC.aberto===c.id?null:c.id;draw()};if(CC.aberto===c.id)li.appendChild(ccDetalhe(c));return li})))})}
    q.addEventListener("input",draw);draw();return [p]}
  function ccDetalhe(c){var d=h("div",{class:"ccdet"}),st=h("p",{class:"sub",role:"status"}),imgs={};
    var tab=h("div",{class:"famtabw"},h("table",{class:"famtab"},h("thead",null,h("tr",null,h("th",{text:""}),h("th",{text:"Produto"}),h("th",{class:"num",text:"Qtd"}),h("th",{class:"num",text:"Total"}))),
      h("tbody",null,c.itens.map(function(i){var im=h("span",{class:"ccthumb"});if(i.imagem_path)imgs[i.imagem_path]=im;
        return h("tr",null,h("td",null,im),h("td",null,i.descricao,h("small",{class:"sub",text:" · "+(i.categoria||"Outros")+(i.codigo?" · "+i.codigo:"")})),h("td",{class:"num",text:fmtN(i.qtd)}),
          h("td",{class:"num",text:brl(i.total)+(i.desconto?" (−"+brl(i.desconto)+")":"")}))}))));d.appendChild(tab);
    var conta=[["Subtotal",c.subtotal],["Desconto",c.desconto?-c.desconto:0],["Frete",c.frete],["Taxas",c.taxas]].filter(function(l){return l[1]||l[0]==="Subtotal"}).map(function(l){return h("li",null,h("span",{class:"grow",text:l[0]}),h("span",{text:(l[1]<0?"−":"")+brl(Math.abs(l[1]))}))});
    conta.push(h("li",null,h("b",{class:"grow",text:"Total pago (despesa)"}),h("b",{text:brl(c.total_pago)})));d.appendChild(h("ul",{class:"wl ccconta"},conta));
    d.appendChild(h("p",{class:"ccok",text:c.status==="cancelado"?"✕ Compra cancelada (confirmada por você): fora das despesas.":c.fora_das_contas?"Compra registrada, fora das despesas (já contada em outro lugar"+(c.motivo_fora?": "+c.motivo_fora:"")+").":"✓ Compra confirmada · despesa de "+brl(c.total_pago)+" em "+dataBR(c.data)}));
    if(c.status==="cancelamento_informado"||c.status==="reembolso_informado"){var cb=h("div",{class:"vfil"}),canc=c.status==="cancelamento_informado";
      d.appendChild(h("div",{class:"ccaviso"},h("b",{text:canc?"⚠ A loja informou um cancelamento":"⚠ A loja informou um reembolso"}),h("p",{class:"sub",text:canc?"Nada saiu das despesas sozinho. Se o pedido inteiro foi cancelado, confirme; se foi só uma parte, edite os valores.":"O valor não muda sozinho. Se o reembolso foi do pedido inteiro, confirme o cancelamento; se foi parcial, edite os valores."}),cb));
      [["cancelado","Confirmar cancelamento (sai das despesas)"],[null,"Não foi cancelado"]].forEach(function(o){var b=h("button",{type:"button",class:"ghostbtn",text:o[1]});
        b.onclick=function(){b.disabled=true;SB.from("compras_online").update({status:o[0],atualizado_em:new Date().toISOString()}).eq("id",c.id).then(sbOk).then(function(){ccEsquecer();CC.aberto=c.id;renderCompras("lista")},function(e){b.disabled=false;st.textContent="Não consegui salvar ("+e.message+")."})};cb.appendChild(b)})}
    var info=[c.vendedor?"Vendido por "+c.vendedor:"",c.pagamento||"",c.numero_nf?"NF "+c.numero_nf+(c.emitente?" · "+c.emitente:""):"",c.chave_nfe?"chave "+c.chave_nfe.replace(/(\d{4})(?=\d)/g,"$1 "):"",(c.versoes||[]).length?"editada "+c.versoes.length+(c.versoes.length===1?" vez":" vezes"):""].filter(Boolean);
    if(info.length)d.appendChild(h("p",{class:"sub",text:info.join(" · ")}));
    if((c.divergencias||[]).length)d.appendChild(h("div",{class:"ccaviso"},h("b",{text:"⚠ Divergências entre os documentos"}),h("ul",{class:"clean"},c.divergencias.map(function(x){return h("li",{text:x.texto||String(x)})}))));
    if(c.recorrencia_texto){var rb=h("div",{class:"vfil"});d.appendChild(h("div",{class:"ccrec"},h("h3",{class:"mbag",text:"Recorrência (separada da compra)"}),h("b",{text:"🔁 "+c.recorrencia_texto}),
        h("p",{class:"sub",text:(c.recorrencia_status==="confirmada"?"Confirmada por você.":c.recorrencia_status==="descartada"?"Descartada por você.":"Informada pela loja, a confirmar.")+" É só uma informação: nenhuma compra nem despesa futura é criada."}),rb));
      [["confirmada","Confirmar"],["descartada","Descartar"],["a_confirmar","Voltar para a confirmar"]].filter(function(o){return o[0]!==c.recorrencia_status}).forEach(function(o){var b=h("button",{type:"button",class:"ghostbtn",text:o[1]});
        b.onclick=function(){b.disabled=true;SB.from("compras_online").update({recorrencia_status:o[0],atualizado_em:new Date().toISOString()}).eq("id",c.id).then(sbOk).then(function(){c.recorrencia_status=o[0];ccEsquecer();renderCompras("lista")},function(e){b.disabled=false;st.textContent="Não consegui salvar ("+e.message+")."})};rb.appendChild(b)})}
    if(c.observacoes)d.appendChild(h("p",{text:c.observacoes}));
    /* documentos originais */
    var docs=h("ul",{class:"wl ccdocs"});d.appendChild(h("h3",{class:"mbag",text:"Documentos ("+c.docs.length+")"}));
    if(!c.docs.length)docs.appendChild(h("li",null,h("span",{class:"sub",text:"Nenhum documento guardado. Use “Adicionar documento” para anexar o PDF, a nota ou o e-mail original."})));
    d.appendChild(docs);
    ccUrls(c.docs.map(function(x){return x.path}).concat(Object.keys(imgs))).then(function(u){
      Object.keys(imgs).forEach(function(p){if(u[p])imgs[p].appendChild(h("img",{src:u[p],alt:"Imagem do produto",loading:"lazy"}))});
      c.docs.forEach(function(x){docs.appendChild(h("li",null,h("span",{class:"grow"},h("b",{text:NUCLEO.CO_DOC_NOME[x.tipo]||x.tipo}),h("span",{class:"sub",text:x.nome+(x.tamanho?" · "+Math.max(1,Math.round(x.tamanho/1024))+" KB":"")})),
        u[x.path]?h("a",{class:"ghostbtn",href:u[x.path],target:"_blank",rel:"noopener",text:"Abrir"}):h("span",{class:"sub",text:"sem link agora"})))})});
    var add=h("input",{type:"file",multiple:"",accept:".pdf,.xml,.csv,.zip,.eml,.txt,image/*","aria-label":"Adicionar documento a esta compra"});
    add.onchange=function(){if(!add.files.length)return;st.textContent="Lendo os arquivos…";ccProcessar([].slice.call(add.files)).then(function(lote){ccAnexarDocs(c,lote.docs,st)}).catch(function(e){st.textContent="Não consegui ler: "+e.message})};
    var fora=h("button",{type:"button",class:"ghostbtn",text:c.fora_das_contas?"Voltar a contar nas despesas":"Já está contada em outro lugar"});
    fora.onclick=function(){var motivo=c.fora_das_contas?null:prompt("Onde esta compra já está contada? (ex.: nota do Mercado de 01/11)","");if(!c.fora_das_contas&&motivo===null)return;fora.disabled=true;
      SB.from("compras_online").update({fora_das_contas:!c.fora_das_contas,motivo_fora:motivo?motivo.slice(0,200):null,atualizado_em:new Date().toISOString()}).eq("id",c.id).then(sbOk).then(function(){ccEsquecer();renderCompras("lista")},function(e){fora.disabled=false;st.textContent="Não consegui salvar ("+e.message+")."})};
    var ap=h("button",{type:"button",class:"ghostbtn",text:"Apagar"});
    ap.onclick=function(){if(!confirm("Apagar a compra "+c.numero+" ("+brl(c.total_pago)+")? Os produtos e os "+c.docs.length+" documentos guardados saem junto."))return;ap.disabled=true;st.textContent="Apagando…";
      var ps=c.docs.map(function(x){return x.path});SB.from("compras_online").delete().eq("id",c.id).then(sbOk).then(function(){return ps.length?SB.storage.from("familia").remove(ps).catch(function(){}):null})
        .then(function(){CC.aberto=null;ccEsquecer();renderCompras("lista")},function(e){ap.disabled=false;st.textContent="Não consegui apagar ("+e.message+")."})};
    d.appendChild(h("div",{class:"vfil"},h("label",{class:"ghostbtn ccadd"},"📎 Adicionar documento",add),h("a",{class:"ghostbtn pri",href:"#compras/editar/"+c.id,text:"Editar"}),fora,ap));d.appendChild(st);return d}
  /* o que a nota fiscal traz e o pedido ainda não tem (chave, número, emitente, CNPJ): só preenche o que está vazio */
  function ccCompletar(ex,fontes){var o={};(fontes||[]).forEach(function(e){if(!e)return;["chave_nfe","numero_nf","emitente","cnpj"].forEach(function(k){if(!ex[k]&&!o[k]&&e[k])o[k]=e[k]});
      if(!ex.status&&!o.status&&(e.tipo==="email_cancelamento"||e.tipo==="email_reembolso"))o.status=e.tipo==="email_cancelamento"?"cancelamento_informado":"reembolso_informado"});return o}
  /* documentos novos de uma compra que já existe: só os que ainda não estão guardados (mesmo conteúdo = mesmo arquivo) */
  function ccAnexarDocs(c,docs,st){var ja={};c.docs.forEach(function(x){ja[x.sha256]=1});var novos=docs.filter(function(x){return !ja[x.sha]});
    if(!novos.length){st.textContent="Esses arquivos já estão guardados nesta compra.";return}
    var div=[];novos.forEach(function(x){if(x.ext&&x.ext.numero&&NUCLEO.coNumeroPedido(x.ext.numero)!==NUCLEO.coNumeroPedido(c.numero))div.push({campo:"numero",texto:"O documento "+x.nome+" é do pedido "+x.ext.numero+"."});
      var m=x.ext?NUCLEO.coMesclar({subtotal:c.subtotal,desconto:c.desconto,frete:c.frete,total_pago:c.total_pago,divergencias:[]},x.ext):null;if(m)div=div.concat(m.divergencias)});
    st.textContent="Guardando "+novos.length+(novos.length===1?" arquivo…":" arquivos…");
    ccSubirDocs(c.id,novos).then(function(){var upd=ccCompletar(c,novos.map(function(x){return x.ext}));upd.atualizado_em=new Date().toISOString();if(div.length)upd.divergencias=(c.divergencias||[]).concat(div);
      return SB.from("compras_online").update(upd).eq("id",c.id).then(sbOk)}).then(function(){ccEsquecer();CC.aberto=c.id;renderCompras("lista")},function(e){st.textContent="Não consegui guardar ("+e.message+")."})}

  /* ---------- Produtos e recorrências ---------- */
  function ccProdutos(){var L=[],P=NUCLEO.coPrecos(CC.dados),imgs={};
    var p=panel("Produtos","Cada produto comprado (pelo nome padronizado): quantas vezes, o último preço, o menor e a variação.");
    if(!P.length){p.appendChild(ccVazio("Nenhum produto ainda."));L.push(p);return L}
    p.appendChild(h("ul",{class:"wl"},P.slice(0,200).map(function(x){var im=h("span",{class:"ccthumb"});if(x.img)imgs[x.img]=im;
      return h("li",null,im,h("span",{class:"grow"},h("b",{text:x.nome}),h("span",{class:"sub",text:x.vezes+(x.vezes===1?" compra":" compras")+" · último "+brl(x.ultimo.u)+" em "+dataBR(x.ultimo.d)+(x.vezes>1?" · menor "+brl(x.menor)+(x.variacao!=null?" · "+(x.variacao>0?"+":"")+Math.round(x.variacao)+"% desde a 1ª":""):"")})))})));
    ccUrls(Object.keys(imgs)).then(function(u){Object.keys(imgs).forEach(function(k){if(u[k])imgs[k].appendChild(h("img",{src:u[k],alt:"",loading:"lazy"}))})});
    p.appendChild(ccFonte("Central de Compras (preço unitário de cada compra)"));L.push(p);
    var R=NUCLEO.coRecorrencias(CC.dados);var pr=panel("Recorrências","Informadas pela loja (entrega automática, assinatura) ou percebidas (o mesmo produto comprado mais de uma vez). A próxima data é só uma estimativa: nenhuma compra é criada.");
    pr.appendChild(R.length?h("ul",{class:"wl"},R.map(function(r){return h("li",null,h("span",{class:"grow"},h("b",{text:r.produto}),h("span",{class:"sub",text:(r.informada?r.informada.texto+" ("+(r.informada.status==="confirmada"?"confirmada":r.informada.status==="descartada"?"descartada":"a confirmar")+")":"comprado "+r.vezes+" vezes"+(r.intervaloDias?", a cada ~"+r.intervaloDias+" dias":""))+
      " · última "+dataBR(r.ultima)+(r.proximaEstimada?" · próxima prevista: "+dataBR(r.proximaEstimada):"")})))})):ccVazio("Nenhuma recorrência informada ou percebida ainda."));L.push(pr);return L}

  /* ---------- Importação: lê os arquivos no aparelho, junta os documentos do mesmo pedido e mostra a conferência ---------- */
  function ccExt(nome,tipo){var e=(/\.([a-z0-9]+)$/i.exec(nome||"")||[])[1];e=e?e.toLowerCase():"";if(!e&&tipo)e=({"application/pdf":"pdf","text/xml":"xml","application/xml":"xml","text/csv":"csv","application/zip":"zip","message/rfc822":"eml","text/plain":"txt"})[tipo]||(/^image\//.test(tipo)?"jpg":"");return e}
  function ccSha(buf){return crypto.subtle.digest("SHA-256",buf).then(function(d){return [].map.call(new Uint8Array(d),function(b){return ("0"+b.toString(16)).slice(-2)}).join("")})}
  function ccTexto(buf,cs){try{return new TextDecoder(cs||"utf-8").decode(buf)}catch(e){return new TextDecoder("utf-8").decode(buf)}}
  /* PDF: o texto de todas as páginas e as imagens que parecem de produto (quadradas, nem minúsculas nem gigantes) */
  function ccPdf(buf){return carregarScript(CC_PDF).then(function(){var L=window.pdfjsLib;L.GlobalWorkerOptions.workerSrc=CC_PDF_W;
    return L.getDocument({data:new Uint8Array(buf.slice(0))}).promise.then(function(doc){var txt=[],imgs=[],n=Math.min(doc.numPages,15),p=Promise.resolve();
      for(var i=1;i<=n;i++)(function(i){p=p.then(function(){return doc.getPage(i).then(function(pg){
        return pg.getTextContent().then(function(tc){var y=null,linha=[];tc.items.forEach(function(it){var yy=Math.round(it.transform[5]);if(y!==null&&Math.abs(yy-y)>2){txt.push(linha.join(" "));linha=[]}y=yy;linha.push(it.str)});txt.push(linha.join(" "))})
          .then(function(){return i<=3?ccPdfImagens(pg,L).then(function(l){imgs=imgs.concat(l)},function(){}):null})})})})(i);
      return p.then(function(){return {texto:txt.join("\n"),imagens:imgs}})})})}
  function ccPdfImagens(pg,L){return pg.getOperatorList().then(function(ops){var nomes=[];ops.fnArray.forEach(function(f,i){if(f===L.OPS.paintImageXObject)nomes.push(ops.argsArray[i][0])});
    return Promise.all(nomes.slice(0,12).map(function(nm){return new Promise(function(ok){var t=setTimeout(function(){ok(null)},3000);try{pg.objs.get(nm,function(img){clearTimeout(t);ok(img)})}catch(e){clearTimeout(t);ok(null)}})}))
      .then(function(l){return Promise.all(l.filter(function(im){return im&&im.width>=60&&im.height>=60&&im.width<=1600&&im.height<=1600&&im.width/im.height>0.5&&im.width/im.height<2}).map(function(im){
        var cv=document.createElement("canvas");cv.width=im.width;cv.height=im.height;var cx=cv.getContext("2d");
        if(im.bitmap)cx.drawImage(im.bitmap,0,0);else if(im.data){var id=cx.createImageData(im.width,im.height),s=im.data,dd=id.data;
          if(s.length===im.width*im.height*4)dd.set(s);else if(s.length===im.width*im.height*3){for(var a=0,b=0;a<s.length;a+=3,b+=4){dd[b]=s[a];dd[b+1]=s[a+1];dd[b+2]=s[a+2];dd[b+3]=255}}else return null;cx.putImageData(id,0,0)}else return null;
        return new Promise(function(ok){cv.toBlob(function(bl){ok(bl?{blob:bl,w:im.width,h:im.height}:null)},"image/png")})})).then(function(l){return l.filter(Boolean).sort(function(a,b){return b.w*b.h-a.w*a.h}).slice(0,3)})})})}
  /* e-mail (.eml ou o "original" do Gmail): o texto das partes, decodificado (quoted-printable e base64) e sem HTML */
  function ccEml(raw){var cab=raw.split(/\r?\n\r?\n/)[0],out=[],imgs=[],anexos=[];
    function dec(corpo,enc,cs){if(/base64/i.test(enc)){try{var b=atob(corpo.replace(/\s+/g,"")),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return ccTexto(u,cs)}catch(e){return ""}}
      if(/quoted-printable/i.test(enc)){var bytes=[],s=corpo.replace(/=\r?\n/g,"");for(var j=0;j<s.length;j++){if(s[j]==="="&&/^[0-9A-F]{2}$/i.test(s.substr(j+1,2))){bytes.push(parseInt(s.substr(j+1,2),16));j+=2}else bytes.push(s.charCodeAt(j)&255)}return ccTexto(new Uint8Array(bytes),cs)}return corpo}
    function parte(txt){var i=txt.search(/\r?\n\r?\n/),h0=i<0?txt:txt.slice(0,i),corpo=i<0?"":txt.slice(i).replace(/^\r?\n\r?\n/,""),ct=(/content-type:\s*([^;\r\n]+)/i.exec(h0)||[,"text/plain"])[1].toLowerCase(),
        bd=/boundary="?([^";\r\n]+)"?/i.exec(h0),enc=(/content-transfer-encoding:\s*(\S+)/i.exec(h0)||[,""])[1],cs=(/charset="?([^";\s]+)"?/i.exec(h0)||[,"utf-8"])[1];
      if(/^multipart\//.test(ct)&&bd){corpo.split("--"+bd[1]).slice(1).forEach(function(s){if(!/^--/.test(s))parte(s.replace(/^\r?\n/,""))});return}
      /* anexo PDF ou XML (DANFE, NF-e): os bytes originais, para a mesma leitura dos arquivos */
      var nomeA=(/(?:file)?name\*?="?([^";\r\n]+)"?/i.exec(h0)||[])[1];
      if(nomeA&&/base64/i.test(enc)&&(/pdf|xml/.test(ct)||/\.(pdf|xml)$/i.test(nomeA))){try{var bb=atob(corpo.replace(/\s+/g,"")),ua=new Uint8Array(bb.length);for(var q=0;q<bb.length;q++)ua[q]=bb.charCodeAt(q);
        anexos.push({nome:nomeA.replace(/^.*[\\\/]/,"").slice(0,120),mime:/\.xml$/i.test(nomeA)||/xml/.test(ct)?"text/xml":"application/pdf",bytes:ua})}catch(e){anexos.push({nome:nomeA,erro:"anexo ilegível"})}return}
      if(ct==="text/html"){var html=dec(corpo,enc,cs);(html.match(/<img[^>]+src="(https:\/\/[^"]*(?:media-amazon|images-amazon|mlstatic)[^"]+)"/gi)||[]).forEach(function(m){imgs.push(/src="([^"]+)"/.exec(m)[1])});
        out.push(html.replace(/<(style|script)[\s\S]*?<\/\1>/gi," ").replace(/<br\s*\/?>|<\/(p|div|tr|td|li|h\d)>/gi,"\n").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/&#(\d+);/g,function(_,n){return String.fromCharCode(+n)}))}
      else if(ct==="text/plain")out.push(dec(corpo,enc,cs))}
    parte(raw);var assunto=(/^subject:\s*(.+)$/im.exec(cab)||[,""])[1],data=(/^date:\s*(.+)$/im.exec(cab)||[,""])[1],de=(/^from:\s*(.+)$/im.exec(cab)||[,""])[1];
    var d=new Date(data);return {texto:[assunto].concat(out).join("\n").replace(/[ \t]+/g," ").replace(/\n\s*\n+/g,"\n"),imagens:imgs,anexos:anexos,data:isNaN(d)?null:d.toISOString().slice(0,10),de:de}}
  /* OCR de prints, no próprio aparelho (Tesseract, português) */
  function ccOcr(blob){return carregarScript(CC_OCR).then(function(){return window.Tesseract.recognize(blob,"por")}).then(function(r){return (r&&r.data&&r.data.text)||""})}
  /* um arquivo → documento(s) {nome, tipo, mime, sha, blob, ext (o que foi lido), extras (pedidos do CSV), imagens} */
  function ccLerArquivo(f,st){var nome=f.name||"arquivo",ext=ccExt(nome,f.type),mime=CC_MIME[ext]||f.type||"application/octet-stream";
    return f.arrayBuffer().then(function(buf){return ccSha(buf).then(function(sha){var doc={nome:nome,mime:mime,sha:sha,blob:new Blob([buf],{type:mime}),tamanho:buf.byteLength,imagens:[],imagensUrl:[]};
      if(st)st.textContent="Lendo "+nome+"…";
      if(ext==="zip")return carregarScript(CC_ZIP).then(function(){return window.JSZip.loadAsync(buf)}).then(function(z){var arqs=[];z.forEach(function(p,e){if(!e.dir&&/\.(pdf|xml|csv|eml|txt|png|jpe?g|webp)$/i.test(p))arqs.push(e)});
        return Promise.all(arqs.slice(0,200).map(function(e){return e.async("arraybuffer").then(function(b){var n=e.name.split("/").pop();return ccLerArquivo({name:n,type:CC_MIME[ccExt(n)]||"",arrayBuffer:function(){return Promise.resolve(b)}})})}))
          .then(function(l){doc.tipo="zip";doc.ext=null;return [doc].concat([].concat.apply([],l))})});
      if(ext==="xml"){var x=NUCLEO.coLerNFe(ccTexto(buf));doc.tipo="nfe_xml";doc.ext=x;return [doc]}
      if(ext==="csv"){var cs=NUCLEO.coLerCSV(ccTexto(buf));doc.tipo="csv";doc.ext=null;doc.extras=cs;return [doc]}
      if(ext==="pdf")return ccPdf(buf).then(function(r){var e=NUCLEO.coLerTexto(r.texto);doc.tipo=/danfe|documento auxiliar da nota fiscal/i.test(r.texto)?"danfe":"resumo_pdf";e.tipo=doc.tipo;doc.ext=e;doc.texto=r.texto;doc.imagens=r.imagens;return [doc]});
      if(ext==="eml"||ext==="txt"){var m=ccEml(ccTexto(buf)),e=NUCLEO.coLerTexto(m.texto);if(!e.data&&m.data)e.data=m.data;doc.tipo=/^email_/.test(e.tipo)?e.tipo:"email_confirmacao";e.tipo=doc.tipo;doc.ext=e;doc.imagensUrl=m.imagens;return [doc]}
      if(/^(png|jpe?g|webp|gif|heic)$/.test(ext))return ccOcr(doc.blob).then(function(t){var e=NUCLEO.coLerTexto(t);e.tipo="imagem";doc.tipo="imagem";doc.ext=e.numero||e.total_pago!=null?e:null;doc.texto=t;doc.ocr=true;return [doc]},function(){doc.tipo="imagem";doc.ext=null;doc.ocrFalhou=true;return [doc]});
      doc.tipo="outro";doc.ext=null;return [doc]})})}
  /* vários arquivos (e textos colados / e-mails do Gmail) → candidatos: um por pedido, com todos os documentos dele */
  function ccProcessar(files,textos,st){var docs=[],fimT=atuTarefa("a leitura dos documentos");
    return files.reduce(function(p,f){return p.then(function(){return ccLerArquivo(f,st).then(function(l){docs=docs.concat(l)},function(e){docs.push({nome:f.name,erro:e.message})})})},Promise.resolve())
    .then(function(){var ignorados=0;
      return (textos||[]).reduce(function(p,t){return p.then(function(){var raw=t.raw||t.texto,m=/^[\w-]+:\s/m.test(raw.slice(0,400))&&/\r?\n\r?\n/.test(raw)?ccEml(raw):{texto:raw,imagens:[],anexos:[]},e=NUCLEO.coLerTexto(m.texto);if(!e.data&&(m.data||t.data))e.data=m.data||t.data;
        if(e.loja==="outra"&&/amazon\.com\.br/i.test(m.de||""))e.loja="amazon";
        /* e-mail da loja sem pedido, total nem nota (propaganda, aviso geral): não entra */
        if(t.soComPedido&&!e.numero&&!e.chave_nfe&&e.total_pago==null&&!(m.anexos||[]).length){ignorados++;return}
        var tipo=/^email_/.test(e.tipo)?e.tipo:"email_confirmacao";e.tipo=tipo;var bytes=t.bytes||new TextEncoder().encode(raw);
        docs.push({nome:t.nome||"email-"+(e.numero||Date.now())+".eml",mime:t.raw?"message/rfc822":"text/plain",blob:new Blob([bytes],{type:t.raw?"message/rfc822":"text/plain"}),tamanho:bytes.length,tipo:tipo,ext:e,imagens:[],imagensUrl:m.imagens||[],_bytes:bytes});
        /* anexos: lidos como arquivo; sem número de pedido próprio, ficam no pedido do e-mail */
        return (m.anexos||[]).slice(0,10).reduce(function(q,an){return q.then(function(){
          if(an.erro||!an.bytes){docs.push({nome:an.nome||"anexo",erro:an.erro||"anexo inválido"});return}
          if(an.bytes.length>CC_GM_ANEXO_MAX){docs.push({nome:an.nome,erro:"anexo grande demais"});return}
          return ccLerArquivo({name:an.nome,type:an.mime,arrayBuffer:function(){return Promise.resolve(an.bytes.buffer.slice(an.bytes.byteOffset,an.bytes.byteOffset+an.bytes.byteLength))}},st).then(function(l){
            l.forEach(function(d){if(!d.ext&&d.tipo==="nfe_xml"){d.erro="XML que não é uma NF-e";return}if(d.ext&&d.ext.loja==="outra"&&e.loja!=="outra")d.ext.loja=e.loja;if(d.ext&&!d.ext.numero&&!d.ext.chave_nfe&&e.numero){d.ext.numero=e.numero;d.ext.loja=e.loja}else if(!d.ext&&e.numero)d.ext={numero:e.numero,loja:e.loja,tipo:d.tipo}});
            docs=docs.concat(l)},function(){docs.push({nome:an.nome,erro:"anexo inválido"})})})},Promise.resolve())})},Promise.resolve()).then(function(){docs.ignorados=ignorados})})
    .then(function(){return Promise.all(docs.map(function(d){return d.sha||!d._bytes?d:ccSha(d._bytes.buffer.slice(d._bytes.byteOffset,d._bytes.byteOffset+d._bytes.byteLength)).then(function(s){d.sha=s;return d})}))})
    .then(function(){var grupos=[],porChave={};
      function grupo(e){var k=e&&e.numero?"n:"+NUCLEO.coNumeroPedido(e.numero):e&&e.chave_nfe?"c:"+e.chave_nfe:null;
        if(e&&e.chave_nfe&&porChave["c:"+e.chave_nfe])return porChave["c:"+e.chave_nfe];if(k&&porChave[k])return porChave[k];
        var g={cand:null,docs:[],imagens:[],imagensUrl:[]};grupos.push(g);if(k)porChave[k]=g;if(e&&e.chave_nfe)porChave["c:"+e.chave_nfe]=g;if(e&&e.numero)porChave["n:"+NUCLEO.coNumeroPedido(e.numero)]=g;return g}
      var soltos=[];
      docs.forEach(function(d){if(d.erro){soltos.push(d);return}
        if(d.extras&&d.extras.length){d.extras.forEach(function(e){var g=grupo(e);g.cand=NUCLEO.coMesclar(g.cand,e);g.docs.push(d)});return}
        if(!d.ext||(!d.ext.numero&&!d.ext.chave_nfe&&d.ext.total_pago==null)){if(d.tipo!=="zip")soltos.push(d);return}
        var g=grupo(d.ext);g.cand=NUCLEO.coMesclar(g.cand,d.ext);g.docs.push(d);g.imagens=g.imagens.concat(d.imagens||[]);g.imagensUrl=g.imagensUrl.concat(d.imagensUrl||[])});
      return {grupos:grupos,soltos:soltos,docs:docs,ignorados:docs.ignorados||0}}).then(function(r){return ccOutras().then(function(){return r})}).then(function(r){fimT();return r},function(e){fimT();throw e})}

  /* ---------- Gmail (só leitura): os e-mails da Amazon, com o login do Google que o site já usa ----------
     Reaproveita de js/app.js o Client ID público (GOOGLE_CLIENT_ID), a permissão gmail.readonly (GM_SCOPE), o script do login (GSI_JS),
     a chamada à API (gmApi, que recebe o token) e a lista de contas (gmContas). O token desta tela fica SÓ na memória (CC_GM): não vai para o
     navegador (localStorage/sessionStorage), o banco nem o GitHub, vale cerca de 1 hora e some ao desconectar ou fechar a página.
     Nada é enviado, apagado, movido ou marcado no Gmail; nenhum e-mail entra sem a conferência. */
  var CC_GM_PERIODOS=[30,90,180,365],CC_GM_MAX=200,CC_GM_ANEXO_MAX=15*1024*1024;
  var CC_GM={tk:null,exp:0,conta:null,dias:90,email:null};
  function ccGmToken(){return CC_GM.tk&&CC_GM.exp>Date.now()+60000?CC_GM.tk:null}
  function ccGmSair(){CC_GM.tk=null;CC_GM.exp=0;CC_GM.conta=null}
  /* as contas do Gmail do site (a lista fica na conta, em PESSOAL.emails: nenhum endereço no código público); a usada nas compras
     (PESSOAL.compras.gmail, guardada na primeira conexão certa: só o endereço, nunca o acesso) vem primeiro */
  function ccGmPreferida(){return String((PESSOAL.compras||{}).gmail||"").toLowerCase()}
  function ccGmContas(){var l=[],pref=ccGmPreferida();(typeof gmContas==="function"?gmContas():[]).forEach(function(c){var e=String(c.e||"").trim().toLowerCase();if(e&&l.indexOf(e)<0)l.push(e)});
    if(pref&&l.indexOf(pref)>0){l.splice(l.indexOf(pref),1);l.unshift(pref)}return l}
  function ccEspera(ms){return new Promise(function(ok){setTimeout(ok,ms)})}
  /* pede o token ao Google (janela do Google; precisa do toque do usuário), confere a permissão e a conta */
  function ccGmConectar(email){
    function pedir(){return new Promise(function(ok,nao){
      var cli=google.accounts.oauth2.initTokenClient({client_id:GOOGLE_CLIENT_ID,scope:GM_SCOPE,login_hint:email,include_granted_scopes:false,
        callback:function(r){if(r.error){nao(new Error(r.error==="access_denied"?"o acesso não foi permitido":"o Google recusou ("+r.error+")"));return}
          if(google.accounts.oauth2.hasGrantedAllScopes&&!google.accounts.oauth2.hasGrantedAllScopes(r,GM_SCOPE)){nao(new Error("a permissão de leitura do Gmail não foi concedida"));return}
          ok({tk:r.access_token,exp:Date.now()+(+r.expires_in||3600)*1000})},
        error_callback:function(e){nao(new Error(e&&e.type==="popup_closed"?"a janela do Google foi fechada":e&&e.type==="popup_failed_to_open"?"o navegador bloqueou a janela do Google":"a janela do Google não abriu"))}});
      cli.requestAccessToken({prompt:""})})}
    if(!GOOGLE_CLIENT_ID)return Promise.reject(new Error("o acesso do Google não está configurado no site"));
    var ja=window.google&&google.accounts&&google.accounts.oauth2;
    return (ja?pedir():carregarScript(GSI_JS).then(function(){throw new Error("o login do Google acabou de carregar; toque de novo")}))
      .then(function(t0){return gmApi(t0.tk,"profile").then(function(pf){var conta=String(pf&&pf.emailAddress||"").toLowerCase();
        if(conta!==email)throw new Error("o Google conectou "+(conta||"outra conta")+"; escolha "+email+" na janela do Google");
        CC_GM.tk=t0.tk;CC_GM.exp=t0.exp;CC_GM.conta=conta;
        if(ccGmPreferida()!==conta&&typeof pessoalGravar==="function")pessoalGravar("compras",Object.assign({},PESSOAL.compras||{},{gmail:conta}));return t0.tk})})}
  /* uma chamada à API do Gmail com o token da memória: expirou → desconecta; limite de uso → espera e tenta de novo (até 2 vezes) */
  function ccGmApi(caminho,n){var tk=ccGmToken();if(!tk)return Promise.reject(new Error("conecte o Gmail de novo"));n=n||0;
    return gmApi(tk,caminho).catch(function(e){var m=String(e&&e.message||e);
      if(m==="expirou"){ccGmSair();throw new Error("o acesso ao Gmail expirou; toque em Conectar de novo")}
      if(/respondeu (429|500|502|503)/.test(m)&&n<2)return ccEspera(1500*(n+1)).then(function(){return ccGmApi(caminho,n+1)});
      if(/respondeu 403/.test(m))throw new Error("o Google recusou a leitura (permissão ou limite de uso); tente mais tarde");
      throw new Error(m.replace(/[^\w\sà-ú().,:-]/gi,"").slice(0,80))})}
  function ccGmDataBusca(dias){var d=new Date(Date.now()-dias*864e5);return d.getFullYear()+"/"+(d.getMonth()+1)+"/"+d.getDate()}
  /* os ids dos e-mails da Amazon no período, página por página, até CC_GM_MAX */
  function ccGmIds(dias,st){var q="from:amazon.com.br after:"+ccGmDataBusca(dias),ids=[];
    function pag(pt){return ccGmApi("messages?maxResults=100&q="+encodeURIComponent(q)+(pt?"&pageToken="+encodeURIComponent(pt):"")).then(function(r){
      (r.messages||[]).forEach(function(m){if(ids.length<CC_GM_MAX)ids.push(m.id)});if(st)st.textContent="Encontrados "+ids.length+" e-mails da Amazon…";
      return r.nextPageToken&&ids.length<CC_GM_MAX?pag(r.nextPageToken):{ids:ids,mais:!!r.nextPageToken}})}
    return pag(null)}
  /* cada e-mail no original (formato raw do Gmail): os bytes exatos vão para o cofre como .eml */
  function ccGmBaixar(ids,st){var out=[],falhas=0;
    return ids.reduce(function(p,id,i){return p.then(function(){if(st)st.textContent="Baixando o e-mail "+(i+1)+" de "+ids.length+"…";
      return ccGmApi("messages/"+encodeURIComponent(id)+"?format=raw").then(function(r){var b=atob(String(r.raw||"").replace(/-/g,"+").replace(/_/g,"/")),u=new Uint8Array(b.length);
        for(var k=0;k<b.length;k++)u[k]=b.charCodeAt(k);var dt=r.internalDate?new Date(+r.internalDate).toISOString().slice(0,10):null;
        out.push({raw:ccTexto(u),bytes:u,nome:"gmail-"+(dt||"email")+"-"+id+".eml",data:dt,soComPedido:true})},function(e){if(/expirou|conecte/.test(e.message))throw e;falhas++})})},Promise.resolve())
      .then(function(){return {emails:out,falhas:falhas}})}
  /* o quadro do Gmail na importação: conta, período, conectar/desconectar, buscar; o resultado vai para a conferência (nada é salvo sozinho) */
  function ccGmailBloco(saida,st){var box=h("div",{class:"ccgm"});
    function desenhar(){box.innerHTML="";var tk=ccGmToken(),contas=ccGmContas(),email=CC_GM.email&&contas.indexOf(CC_GM.email)>=0?CC_GM.email:contas[0];
      if(!contas.length){box.appendChild(h("p",{class:"sub",text:"✉ Gmail: nenhuma conta do Gmail com endereço no cartão de E-mail. Cadastre a conta da Amazon lá (Início → E-mail) e volte aqui."}));return}
      var selC=h("select",{"aria-label":"Conta do Gmail","data-atu-filtro":""},contas.map(function(c){return h("option",{value:c,selected:c===email?"":null,text:c})}));
      var selP=h("select",{"aria-label":"Período","data-atu-filtro":""},CC_GM_PERIODOS.map(function(d){return h("option",{value:String(d),selected:d===CC_GM.dias?"":null,text:"Últimos "+d+" dias"})}));
      selC.onchange=function(){CC_GM.email=selC.value;if(CC_GM.conta&&CC_GM.conta!==selC.value)ccGmSair();desenhar()};selP.onchange=function(){CC_GM.dias=+selP.value};
      var b=h("button",{type:"button",class:"ghostbtn pri",text:tk?"✉ Buscar e-mails da Amazon":"✉ Conectar ao Gmail e buscar"}),sair=h("button",{type:"button",class:"ghostbtn",text:"Desconectar"});
      sair.onclick=function(){ccGmSair();desenhar();st.textContent="Gmail desconectado nesta tela (o acesso não fica guardado)."};
      b.onclick=function(){var em=selC.value,fimT=atuTarefa("a leitura do Gmail");CC_GM.email=em;b.disabled=true;st.textContent=ccGmToken()?"Procurando os e-mails da Amazon…":"Abrindo o login do Google…";
        (ccGmToken()&&CC_GM.conta===em?Promise.resolve():ccGmConectar(em)).then(function(){st.textContent="Procurando os e-mails da Amazon…";return ccGmIds(CC_GM.dias,st)})
        .then(function(r){if(!r.ids.length){st.textContent="Nenhum e-mail da Amazon nos últimos "+CC_GM.dias+" dias.";return null}
          return ccGmBaixar(r.ids,st).then(function(x){x.mais=r.mais;return x})})
        .then(function(x){if(!x)return null;return ccProcessar([],x.emails,st).then(function(r){r.gmail={total:x.emails.length,falhas:x.falhas,mais:x.mais};return r})})
        .then(function(r){fimT();b.disabled=false;desenhar();if(!r)return;ccMostrarLote(saida,r,st);
          st.textContent+=" "+r.gmail.total+" e-mails lidos"+(r.ignorados?", "+r.ignorados+" sem pedido (propaganda ou aviso geral) ignorados":"")+(r.gmail.falhas?", "+r.gmail.falhas+" não baixaram":"")+(r.gmail.mais?"; limite de "+CC_GM_MAX+" e-mails: escolha um período menor para ver os mais antigos":"")+"."},
          function(e){fimT();b.disabled=false;desenhar();st.textContent="Gmail: "+(e&&e.message||e)})};
      box.appendChild(h("div",{class:"two"},h("label",null,"Conta do Gmail",selC),h("label",null,"Período",selP)));
      box.appendChild(h("div",{class:"vfil"},b,tk?sair:null));
      box.appendChild(h("p",{class:"sub",text:tk?"Conectado (só leitura): "+CC_GM.conta+". O acesso fica só nesta tela e vence em cerca de 1 hora.":"Só leitura: o site não envia, apaga nem altera e-mails, e não guarda o acesso. Nada é salvo antes da conferência."}))}
    desenhar();return box}

  function ccImportar(corpo){CC.lote=null;
    var p=panel("Importar compras","Escolha vários arquivos de uma vez: PDF do pedido, DANFE, XML da nota, CSV ou ZIP exportado pela loja, e-mail (.eml) ou print. Tudo é lido neste aparelho; nada é gravado antes do Salvar.");
    var arq=h("input",{type:"file",multiple:"",accept:".pdf,.xml,.csv,.zip,.eml,.txt,image/*","aria-label":"Arquivos das compras"}),txt=h("textarea",{rows:"4",placeholder:"Ou cole aqui o texto do e-mail de confirmação ou do pedido"});
    var ler=h("button",{type:"button",class:"ghostbtn pri",text:"Ler os arquivos"}),st=h("p",{class:"sub",role:"status"}),saida=h("div",{class:"stack"});
    p.appendChild(h("label",{class:"filebtn"},"📂 Escolher arquivos",arq));p.appendChild(txt);p.appendChild(h("div",{class:"vfil"},ler));
    if(isOwner()&&typeof gmApi==="function")p.appendChild(ccGmailBloco(saida,st));p.appendChild(st);
    p.appendChild(h("details",{class:"famvals"},h("summary",{text:"Como trazer o histórico da Amazon (oficial, sem senha)"}),h("ol",null,
      h("li",{text:"Na Amazon, abra Conta → Seus pedidos e baixe o PDF (Imprimir resumo do pedido) ou a nota fiscal (DANFE/XML) de cada pedido."}),
      h("li",{text:"Para o histórico completo: Central de Privacidade da Amazon → “Solicitar seus dados” → “Seus pedidos”. A Amazon manda um ZIP com o CSV do histórico; importe o ZIP aqui."}),
      h("li",{text:"E-mails da Amazon no Gmail: o quadro do Gmail lê só os e-mails de amazon.com.br do período escolhido (pedido, pagamento, envio, entrega, cancelamento, reembolso e nota fiscal, com os anexos PDF e XML), somente leitura. Também dá para baixar o e-mail como .eml e importar como arquivo."}),
      h("li",{text:"O site nunca pede nem guarda a senha da loja e não faz nenhuma ação na sua conta."}))));
    corpo.appendChild(p);corpo.appendChild(saida);
    ler.onclick=function(){var fs=[].slice.call(arq.files||[]),ts=txt.value.trim()?[{texto:txt.value}]:[];if(!fs.length&&!ts.length){st.textContent="Escolha arquivos ou cole um texto.";return}
      ler.disabled=true;st.textContent="Lendo…";ccProcessar(fs,ts,st).then(function(r){ler.disabled=false;ccMostrarLote(saida,r,st)},function(e){ler.disabled=false;st.textContent="Não consegui ler: "+e.message;logErro("compras",e)})};
  }
  /* a conferência do lote: um quadro por pedido, já marcado como novo, já existente (só anexa os documentos) ou possível repetido */
  function ccMostrarLote(saida,r,st){saida.innerHTML="";var n=r.grupos.length;CC.lote=r.grupos.length?saida:null;
    st.textContent=n?n+(n===1?" pedido encontrado":" pedidos encontrados")+" em "+r.docs.filter(function(d){return d.tipo!=="zip"}).length+" documentos. Confira e salve.":"Nenhum pedido foi reconhecido nos documentos.";
    var salvarTodos=function(){return quadros.reduce(function(p,q){return p.then(function(){return q._salvar()}).catch(function(){})},Promise.resolve()).then(function(){st.textContent="Pronto: o que estava completo foi importado (pedidos que já existiam só ganharam os documentos novos). O que pede conferência continua aberto."})};
    var quadros=r.grupos.map(function(g){var dup=NUCLEO.coDuplicata(g.cand,CC.dados,CC.outras||[]);return ccConferencia({cand:g.cand,docs:g.docs,imagens:g.imagens,imagensUrl:g.imagensUrl,dup:dup,existente:dup&&dup.nivel==="confirmada"?dup.compra:null})});
    if(quadros.length>1){var todos=h("button",{type:"button",class:"ghostbtn pri",text:"Salvar todos os que estão prontos"});
      todos.onclick=function(){todos.disabled=true;salvarTodos().then(function(){todos.disabled=false})};
      saida.appendChild(h("div",{class:"panel"},h("div",{class:"vfil"},todos)))}
    quadros.forEach(function(q){saida.appendChild(q)});
    if(r.soltos.length)saida.appendChild(h("div",{class:"panel"},h("h2",{text:"Documentos sem pedido reconhecido"}),h("ul",{class:"wl"},r.soltos.map(function(d){
      return h("li",null,h("span",{class:"grow"},h("b",{text:d.nome}),h("span",{class:"sub",text:d.erro?"não consegui ler ("+d.erro+")":d.ocrFalhou?"a leitura do print não carregou neste aparelho":"não achei número de pedido nem total; abra a compra e use “Adicionar documento”, ou lance em ＋ Manual"})))}))));
    return {salvarTodos:salvarTodos}}
  /* quadro de conferência: todos os campos editáveis; Salvar só com a conta fechada */
  function ccConferencia(o){var c=o.cand||{},ex=o.existente,novo=!ex,sal=false,p=panel(ex?(o.avulso?"Editar compra":"Pedido já registrado: "+ccLoja(ex)+" "+ex.numero):"Pedido "+(c.numero||"(sem número)"),
      ex&&!o.avulso?"Este pedido já existe. Só os documentos novos serão guardados nele; os valores registrados não mudam (diferenças viram divergências).":o.dup&&o.dup.nivel==="possivel"?"⚠ Parece repetido: "+o.dup.motivo+". Confira antes de salvar.":"Confira olhando os documentos. Nada é gravado antes do Salvar."),f=h("div",{class:"wform"});
    var campo=function(rot,el){return h("label",null,rot,el)},num=function(v){return h("input",{type:"text",inputmode:"decimal",placeholder:"0,00",value:v==null?"":String(v).replace(".",",")})};
    var loja=h("select",null,Object.keys(NUCLEO.CO_LOJAS).map(function(k){return h("option",{value:k,selected:c.loja===k?"":null,text:NUCLEO.CO_LOJAS[k]})}));
    var numero=h("input",{type:"text",maxlength:"60",value:c.numero||""}),data=h("input",{type:"date",value:c.data||"",max:hojeISO()}),vend=h("input",{type:"text",maxlength:"120",value:c.vendedor||""});
    var pag=h("input",{type:"text",maxlength:"60",placeholder:"Ex.: Mastercard final 1234 (nunca o número inteiro)",value:c.pagamento||""});
    var V={subtotal:num(c.subtotal),desconto:num(c.desconto),frete:num(c.frete),taxas:num(c.taxas),total_pago:num(c.total_pago)};
    var cat=h("select",null,[h("option",{value:"",text:"Pela categoria dos produtos"})].concat(NUCLEO.CO_CATEGORIAS.map(function(k){return h("option",{value:k,selected:c.categoria===k?"":null,text:k})})));
    var rec=c.recorrencia||(c.recorrencia_texto?{texto:c.recorrencia_texto,meses:c.recorrencia_meses}:null),recEl=h("input",{type:"text",maxlength:"120",placeholder:"Ex.: Entrega automática a cada 4 meses",value:rec?rec.texto:""});
    var obs=h("textarea",{rows:"2",maxlength:"1000"},c.observacoes||""),itensBox=h("div"),regs=[];
    function linha(i){i=i||{};var r={i:i,d:h("input",{type:"text",maxlength:"200",value:i.descricao||"",placeholder:"Produto"}),q:h("input",{type:"text",inputmode:"decimal",value:i.qtd!=null?String(i.qtd).replace(".",","):"1"}),
        t:num(i.total),ds:num(i.desconto||null),c:h("select",null,NUCLEO.CO_CATEGORIAS.map(function(k){return h("option",{value:k,selected:(i.categoria||NUCLEO.coCategoria(i.descricao||""))===k?"":null,text:k})}))};
      var x=h("button",{type:"button",class:"ghostbtn",text:"×","aria-label":"Tirar este produto"});r.row=h("div",{class:"ccitemf"},h("div",{class:"two"},campo("Produto",r.d),campo("Qtd",r.q),campo("Total da linha (R$)",r.t),campo("Desconto do item",r.ds),campo("Categoria",r.c)),h("div",{class:"vfil"},x));
      x.onclick=function(){r.row.remove();regs.splice(regs.indexOf(r),1);conf()};[r.d,r.q,r.t,r.ds].forEach(function(e){e.addEventListener("input",conf)});r.d.addEventListener("change",function(){r.c.value=NUCLEO.coCategoria(r.d.value)});return r}
    (c.itens&&c.itens.length?c.itens:[{}]).forEach(function(i){var r=linha(i);regs.push(r);itensBox.appendChild(r.row)});
    var mais=h("button",{type:"button",class:"ghostbtn",text:"＋ Produto"});mais.onclick=function(){var r=linha();regs.push(r);itensBox.appendChild(r.row);conf()};
    var editavel=novo||o.avulso;
    if(editavel){f.appendChild(h("div",{class:"two"},campo("Loja",loja),campo("Número do pedido",numero),campo("Data do pedido",data),campo("Vendido por",vend)));
      f.appendChild(h("h3",{class:"mbag",text:"Produtos"}));f.appendChild(itensBox);f.appendChild(h("div",{class:"vfil"},mais));
      f.appendChild(h("h3",{class:"mbag",text:"Valores"}));f.appendChild(h("div",{class:"two"},campo("Subtotal",V.subtotal),campo("Desconto",V.desconto),campo("Frete",V.frete),campo("Taxas",V.taxas),campo("Total pago (despesa)",V.total_pago)));
      f.appendChild(h("div",{class:"two"},campo("Pagamento",pag),campo("Categoria da compra",cat)));f.appendChild(campo("Recorrência informada (fica a confirmar)",recEl));f.appendChild(campo("Observações",obs))}
    else f.appendChild(h("p",{class:"sub",text:"Registrado: "+brl(ex.total_pago)+" em "+dataBR(ex.data)+" · "+ex.itens.length+(ex.itens.length===1?" produto":" produtos")}));
    var divs=(c.divergencias||[]).slice();if(ex&&!o.avulso)divs=divs.concat(NUCLEO.coMesclar({subtotal:ex.subtotal,desconto:ex.desconto,frete:ex.frete,total_pago:ex.total_pago,divergencias:[]},Object.assign({tipo:"resumo"},c)).divergencias);
    if(divs.length)f.appendChild(h("div",{class:"ccaviso"},h("b",{text:"⚠ Divergências"}),h("ul",{class:"clean"},divs.map(function(x){return h("li",{text:x.texto})}))));
    var ds=o.docs||[],ja={};(ex?ex.docs:[]).forEach(function(x){ja[x.sha256]=1});var docsNovos=ds.filter(function(d){return d.sha&&!ja[d.sha]});
    if(ds.length)f.appendChild(h("p",{class:"sub",text:"Documentos: "+ds.map(function(d){return (NUCLEO.CO_DOC_NOME[d.tipo]||d.tipo)+" ("+d.nome+")"+(ja[d.sha]?" · já guardado":"")}).join(" · ")+((o.imagens||[]).length?" · imagem do produto encontrada no PDF":"")}));
    var salvar=h("button",{type:"button",text:ex&&!o.avulso?"Guardar "+docsNovos.length+(docsNovos.length===1?" documento":" documentos"):"Salvar compra"}),falta=h("p",{class:"sub",role:"status"});
    f.appendChild(h("div",{class:"qrsave"},salvar,falta));p.appendChild(f);
    [numero,data,vend,pag].concat(Object.keys(V).map(function(k){return V[k]})).forEach(function(e){e.addEventListener("input",conf)});loja.addEventListener("change",conf);
    var dupOk=!(o.dup&&o.dup.nivel==="possivel");
    function coletar(){var x={id:ex?ex.id:null,loja:loja.value,numero:numero.value.trim(),data:data.value,vendedor:vend.value.trim()||null,pagamento:NUCLEO.coPagamento(pag.value)||(pag.value.trim().replace(/\d{5,}/g,"")||null),
        categoria:cat.value||null,observacoes:obs.value.trim()||null,itens:regs.map(function(r){return {descricao:r.d.value.trim(),qtd:+String(r.q.value||"1").replace(",",".")||1,total:NUCLEO.coNum(r.t.value),desconto:NUCLEO.coNum(r.ds.value)||0,categoria:r.c.value,codigo:r.i.codigo||null,imagem_path:r.i.imagem_path||null}}).filter(function(i){return i.descricao})};
      Object.keys(V).forEach(function(k){x[k]=NUCLEO.coNum(V[k].value)});if(x.desconto==null)x.desconto=0;if(x.frete==null)x.frete=0;if(x.taxas==null)x.taxas=0;
      var rr=NUCLEO.coRecorrencia(recEl.value)||(recEl.value.trim()?{texto:recEl.value.trim(),meses:null}:null);x.recorrencia=rr;return x}
    function conf(){if(!editavel){salvar.disabled=!docsNovos.length||sal;falta.textContent=docsNovos.length?"":"Todos os documentos deste pedido já estão guardados.";return {ok:!!docsNovos.length}}
      var x=coletar(),r=NUCLEO.coConferir(x,{hoje:hojeISO()});
      if(r.ok&&novo){var d=NUCLEO.coDuplicata(x,CC.dados,[]);if(d&&d.nivel==="confirmada"){r.ok=false;r.erros=["Já existe: "+d.motivo+". Abra a compra e use “Adicionar documento”."]}}
      salvar.disabled=!r.ok||sal;falta.textContent=r.ok?(r.avisos.length?"⚠ "+r.avisos.join(" ")+" ":"")+(dupOk?"Tudo certo para salvar.":"Parece repetido: toque em Salvar de novo para confirmar."):"Para salvar: "+r.erros.slice(0,3).join(" ");return r}
    conf();
    salvar.onclick=function(){if(sal)return;var r=conf();if(!r.ok)return;if(!navigator.onLine){falta.textContent="Sem internet: não salvei. Os dados continuam aqui.";return}
      if(!dupOk){dupOk=true;salvar.textContent="Salvar mesmo assim";falta.textContent="Parece repetido: "+o.dup.motivo+". Se for outra compra, toque de novo.";return}
      sal=true;salvar.disabled=true;falta.textContent="Salvando…";var x0=editavel?coletar():{};
      var feito=!editavel?ccSubirDocs(ex.id,docsNovos).then(function(){var upd=ccCompletar(ex,[c].concat(docsNovos.map(function(x){return x.ext})));if(divs.length)upd.divergencias=(ex.divergencias||[]).concat(divs.filter(function(x){return !(ex.divergencias||[]).some(function(y){return y.texto===x.texto})}));
          if(!Object.keys(upd).length)return null;upd.atualizado_em=new Date().toISOString();return SB.from("compras_online").update(upd).eq("id",ex.id).then(sbOk)}).then(function(){return ex.id})
        :ccGravar(x0,ex&&o.avulso?ex:null,o.cand,docsNovos,o.imagens||[],o.imagensUrl||[],divs,function(t){falta.textContent=t});
      return feito.then(function(id){ccEsquecer();CC.aberto=id;
        /* na edição e no manual, volta para a lista; no lote, o quadro vira "Salvo" e os outros continuam na tela */
        if(o.avulso){location.hash="#compras/lista";return}
        p.innerHTML="";p.classList.add("ccsalvo");p.appendChild(h("p",{class:"qrok",text:"✓ Salvo: "+(x0.numero||ex&&ex.numero||"")+" · "+brl(x0.total_pago!=null?x0.total_pago:ex.total_pago)}),h("a",{class:"ghostbtn",href:"#compras/lista",text:"Ver nas compras"}));
        return ccCarregar(true)},function(e){sal=false;salvar.disabled=false;falta.textContent="Não consegui salvar ("+(e&&e.message||e)+"). Os dados continuam aqui.";logErro("compras",e)})};
    p._salvar=function(){return salvar.disabled?Promise.resolve():salvar.onclick()||Promise.resolve()};return p}
  /* grava (nova ou edição): compra, produtos, documentos originais e a imagem do produto. Edição guarda a versão anterior. */
  function ccGravar(x,ant,cand,docs,imagens,imagensUrl,divs,st){var fimT=atuTarefa("a gravação da compra"),id=ant?ant.id:novoId(),agora=new Date().toISOString(),orig=cand&&cand.tipo?({resumo_pdf:"pdf",danfe:"pdf",resumo:"pdf",nfe_xml:"xml",csv:"csv",imagem:"imagem"})[cand.tipo]||(/^email_/.test(cand.tipo)?"email":"manual"):"manual";
    var linha={loja:x.loja,numero:x.numero,data:x.data,vendedor:x.vendedor,subtotal:x.subtotal,desconto:x.desconto,frete:x.frete,taxas:x.taxas,total_pago:x.total_pago,pagamento:x.pagamento,categoria:x.categoria,
      recorrencia_texto:x.recorrencia?x.recorrencia.texto:null,recorrencia_meses:x.recorrencia?x.recorrencia.meses:null,observacoes:x.observacoes,divergencias:(ant?ant.divergencias||[]:[]).concat(divs||[])};
    if(x.recorrencia&&!(ant&&ant.recorrencia_status))linha.recorrencia_status="a_confirmar";if(!x.recorrencia)linha.recorrencia_status=null;
    if(cand){["chave_nfe","numero_nf","emitente","cnpj"].forEach(function(k){if(cand[k])linha[k]=cand[k]})}
    var itens=x.itens.map(function(i,n){return {compra_id:id,ordem:n,descricao:i.descricao.slice(0,200),codigo:i.codigo,qtd:i.qtd,unitario:i.total!=null?Math.round(i.total/i.qtd*100)/100:null,total:i.total,desconto:i.desconto||0,categoria:i.categoria,imagem_path:i.imagem_path}});
    var passo;
    if(ant){var v={em:ant.atualizado_em||ant.criado_em,quando:agora};["numero","data","subtotal","desconto","frete","taxas","total_pago","pagamento","vendedor","categoria"].forEach(function(k){if(ant[k]!=null)v[k]=ant[k]});v.itens=ant.itens.map(function(i){return {descricao:i.descricao,qtd:i.qtd,total:i.total}});
      linha.versoes=(ant.versoes||[]).concat([v]).slice(-10);linha.atualizado_em=agora;
      passo=SB.from("compras_online").update(linha).eq("id",id).then(sbOk).then(function(){return SB.from("compras_online_itens").delete().eq("compra_id",id).then(sbOk)}).then(function(){return SB.from("compras_online_itens").insert(itens).then(sbOk)})}
    else{linha.id=id;linha.origem=orig;st("Salvando a compra…");
      passo=SB.from("compras_online").insert(linha).then(sbOk).then(function(){return SB.from("compras_online_itens").insert(itens).then(function(r){if(r.error)return SB.from("compras_online").delete().eq("id",id).then(function(){throw new Error(r.error.message)})})})}
    return passo.then(function(){if(docs.length)st("Guardando os documentos originais…");return ccSubirDocs(id,docs)})
      .then(function(){return ccImagemProduto(id,itens,imagens,imagensUrl,st)}).then(function(){fimT();return id},function(e){fimT();throw e})}
  /* os tipos de documento que o banco aceita (025 e 026) */
  var CC_TIPOS_DB=["resumo_pdf","danfe","nfe_xml","csv","zip","email_confirmacao","email_envio","email_entrega","email_pagamento","email_cancelamento","email_reembolso","imagem","foto_produto","comprovante","outro"];
  function ccNomeSeguro(n){return NUCLEO.norm(n).replace(/[^a-z0-9.]+/g,"-").replace(/^-+|-+$/g,"").slice(-80)||"arquivo"}
  /* o arquivo original, como veio, no cofre; a linha em compras_online_docs com o que foi extraído (o mesmo arquivo não entra duas vezes) */
  function ccSubirDocs(id,docs){return atuDurante("o envio dos documentos",function(){return docs.reduce(function(p,d){return p.then(function(){var path=DONO+"/compras/"+id+"/"+Date.now()+"-"+ccNomeSeguro(d.nome);
      return SB.storage.from("familia").upload(path,d.blob,{contentType:d.mime,upsert:false}).then(function(r){if(r.error)throw new Error(d.nome+": "+r.error.message);
        var ext=d.ext?JSON.parse(JSON.stringify(d.ext)):{};if(d.extras)ext={pedidos:d.extras.map(function(e){return e.numero})};if(d.texto)ext.texto=String(d.texto).slice(0,20000);
        ext=NUCLEO.coLimparExtraido(ext);/* P1: nada pessoal vai para o banco (só o original, como veio, fica no cofre privado) */
        var tipoDb=d.tipo==="resumo"?"resumo_pdf":d.tipo;if(CC_TIPOS_DB.indexOf(tipoDb)<0){ext.tipo=ext.tipo||tipoDb;tipoDb="outro"}
        return SB.from("compras_online_docs").insert({compra_id:id,tipo:tipoDb,nome:d.nome.slice(0,200),path:path,mime:d.mime,tamanho:d.tamanho||d.blob.size,sha256:d.sha,extraido:ext}).then(function(x){
          if(x.error&&x.error.code==="23505")return SB.storage.from("familia").remove([path]).catch(function(){});if(x.error)throw new Error(x.error.message)})})})},Promise.resolve())})}
  /* imagem do produto: a que veio no PDF (ou no e-mail, quando a loja deixa baixar) vira um documento "foto do produto" e aparece no item */
  function ccImagemProduto(id,itens,imagens,urls,st){var fontes=(imagens||[]).map(function(x){return Promise.resolve(x.blob)}).concat((urls||[]).slice(0,2).map(function(u){return fetch(u).then(function(r){return r.ok?r.blob():null},function(){return null})}));
    if(!fontes.length||!itens.length)return Promise.resolve();
    return Promise.all(fontes).then(function(bs){bs=bs.filter(Boolean);if(!bs.length)return;st("Guardando a imagem do produto…");var b=bs[0];
      return b.arrayBuffer().then(ccSha).then(function(sha){var tipo=b.type||"image/png",nome="produto."+(/jpe?g/.test(tipo)?"jpg":"png");
        return ccSubirDocs(id,[{nome:nome,mime:tipo,blob:b,tamanho:b.size,sha:sha,tipo:"foto_produto",ext:null}]).then(function(){
          return SB.from("compras_online_docs").select("path").eq("compra_id",id).eq("tipo","foto_produto").limit(1).then(sbOk).then(function(l){if(!l.length)return;
            return SB.from("compras_online_itens").update({imagem_path:l[0].path}).eq("compra_id",id).eq("ordem",0).is("imagem_path",null).then(sbOk)})})})}).catch(function(){})}
