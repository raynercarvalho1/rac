/* Dia a Dia RAC — módulo carregado quando a seção abre. Central Fiscal (docs/fiscal.md): leitura de XML de NF-e/NFC-e, conferência na tela e, quando a pessoa
   clica em "Salvar nota", a gravação segura (Lote B): o XML original vai para o cofre privado "familia" em <dono>/notas-fiscais/<nota>/<sha256>.xml e a função do banco
   nota_fiscal_salvar grava nota, itens, pagamentos e a referência do original numa transação só (migration 034). A leitura é no próprio aparelho; nada sai dele antes do Salvar.
   Nenhuma nota gera despesa. Foto e PDF (Lote 1.4; dono e casa desde 16/11/2026): lidos pela IA (racIA, ação fiscal.nota) e validados pelas mesmas regras; Lote 1.6: gravados pela função nota_fiscal_salvar_doc (migration 037) com o original no cofre privado. Toda regra fica no núcleo (NUCLEO.nf*) e no banco.
   Lote 1.3: a tela mostra a validação (conta, situação fiscal, diferença) e só grava o que o núcleo permite (NUCLEO.nfDecisaoGravacao); a duplicidade é conferida antes de enviar qualquer arquivo.
   Confirmação única (16/11/2026, migration 059): um só botão de confirmação humana, "Estou de acordo". Ele grava a nota na Central Fiscal e lança a compra no Mercado numa chamada (nota_fiscal_confirmar);
   a situação fiscal não impede a entrada (só cancelada e rejeitada); sem o clique nada é gravado; falha técnica no Mercado tem só o "Tentar de novo" (retoma o que já foi confirmado). Não existe fluxo de recusa. */
  var FX={lote:[],recarregar:null};
  var FX_MAX=2*1024*1024;
  function fxGrupos(s,n){return String(s||"").replace(new RegExp("(\\d{"+n+"})(?=\\d)","g"),"$1 ")}
  function fxCnpj(c){c=String(c||"");return c.length===14?c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,"$1.$2.$3/$4-$5"):c}
  function fxMoeda(v){return v==null?"—":brl(v)}
  function fxQtd(q){return q==null?"—":String(q).replace(".",",")}
  function fxExt(nome){var m=/\.([A-Za-z0-9]+)$/.exec(nome||"");return m?m[1].toLowerCase():""}
  /* lê um arquivo escolhido; devolve {nome, nota, lido, arquivo} ou {nome, erro} (nunca lança) */
  function fxLerArquivo(f){
    var nome=f.name||"arquivo",ext=fxExt(nome);
    if(ext!=="xml")return Promise.resolve({nome:nome,erro:(ext==="pdf"?"PDF":"Foto ou imagem")+": a leitura ainda não existe nesta etapa (sem OCR). Use o XML da nota; este arquivo não foi lido nem enviado a lugar nenhum."});
    if(f.size>FX_MAX)return Promise.resolve({nome:nome,erro:"Arquivo grande demais para um XML de nota (limite de 2 MB)."});
    return f.text().then(function(t){
      var lido=NUCLEO.nfLerXML(t);
      if(!lido)return {nome:nome,erro:"Não é um XML de NF-e ou NFC-e (não achei a nota dentro do arquivo)."};
      return {nome:nome,nota:NUCLEO.nfNormalizar(lido),lido:lido,arquivo:f}},function(){return {nome:nome,erro:"Não consegui abrir o arquivo."}})}

  /* ---------- gravação: Storage + função do banco, com limpeza do que falhou ---------- */
  function fxHex(buf){return Array.prototype.map.call(new Uint8Array(buf),function(x){return ("0"+x.toString(16)).slice(-2)}).join("")}
  function fxEsperar(ms){return new Promise(function(ok){setTimeout(ok,ms)})}
  /* chama a função do banco; só o erro 40001 repete (no máximo 3 vezes, com espera crescente). Validação, permissão e duplicidade nunca repetem. */
  function fxRpc(nome,args,rep){rep=rep||0;
    return Promise.resolve(SB.rpc(nome,args)).then(function(r){var e=r&&r.error;if(!e)return r.data;
      var ms=NUCLEO.nfRetentar(e,rep);
      if(ms==null){var x=new Error(e.message||"erro do banco");x.code=e.code;throw x}
      return fxEsperar(ms+Math.floor(Math.random()*50)).then(function(){return fxRpc(nome,args,rep+1)})})}
  function fxMsgErro(e){var c=e&&e.code,m=String(e&&e.message||e||"erro");
    if(c==="PGRST202"||/Could not find the function/i.test(m))return /nota_fiscal_(confirmar|entrada_mercado)/.test(m)?"A confirmação com entrada no Mercado ainda não está disponível no banco (a migration 059 não foi aplicada).":"A gravação ainda não está disponível no banco (a migration 034 não foi aplicada).";
    if(c==="42501")return "Sem permissão para gravar (faça login de novo e confirme o código de segurança, se pedido).";
    if(c==="23514")return "O banco recusou os dados por uma regra de segurança: "+m;
    return m}
  /* remove só arquivos sem registro (o banco recusa apagar o registrado); falha na limpeza nunca vira erro da gravação */
  function fxLimpar(paths){if(!paths||!paths.length)return Promise.resolve();
    return Promise.resolve().then(function(){return SB.storage.from("familia").remove(paths)}).then(function(){},function(){})}
  /* ---------- duplicidade: lê o que já existe (só leitura) e entrega ao núcleo ---------- */
  /* única porta de leitura (só select): filtro por igualdade (c,v) opcional; o=ordem {col,asc,lim} opcional */
  function fxLer(t,cols,c,v,o){var q=SB.from(t).select(cols);if(c)q=q.eq(c,v);if(o)q=q.order(o.col,{ascending:!!o.asc});
    return Promise.resolve(q.limit(o&&o.lim||200)).then(function(x){if(x&&x.error)throw x.error;return (x&&x.data)||[]})}
  function fxJuntar(listas,chave){var m={},o=[];listas.forEach(function(l){(l||[]).forEach(function(x){var k=x&&x[chave];if(k==null)return;if(!m[k]){m[k]={};o.push(m[k])}Object.keys(x).forEach(function(c){m[k][c]=x[c]})})});return o}
  /* notas_fiscais e a conferência do arquivo (SHA-256) são obrigatórias: se falharem, nada é enviado. Compras, Mercado e pedidos são melhor esforço (avisam se não leram). */
  function fxExistentes(n,sha){
    var chave=n.chave_valida&&n.chave?n.chave:null,cnpj=n.emitente&&n.emitente.cnpj,data=n.data_emissao,av=[],
      NF="id,chave,modelo,serie,numero,emitente_cnpj,data_emissao,valor_total,situacao";
    function opc(rotulo,p){return Promise.resolve(p).catch(function(){av.push("Não consegui conferir duplicidade com "+rotulo+"; vale a conferência do banco.");return []})}
    return Promise.all([
      chave?fxLer("notas_fiscais",NF,"chave",chave):[],cnpj?fxLer("notas_fiscais",NF,"emitente_cnpj",cnpj):[],sha?fxLer("notas_fiscais_docs","nota_id,sha256","sha256",sha):[],
      chave?opc("Compras online",fxLer("compras_online","id,chave_nfe,data,total_pago,loja,vendedor","chave_nfe",chave)):[],
      data?opc("Compras online",fxLer("compras_online","id,chave_nfe,data,total_pago,loja,vendedor","data",data)):[],
      data?opc("o Mercado",fxLer("notas","id,data,total,mercados(nome)","data",data)):[],
      data?opc("os pedidos",fxLer("pedidos","id,data,total_pago,estabelecimento","data",data)):[]
    ]).then(function(r){
      var docs=(r[2]||[]).map(function(d){return {id:d.nota_id,sha256:d.sha256}});
      return {avisos:av.filter(function(x,i){return av.indexOf(x)===i}),dados:{notas:fxJuntar([r[0],r[1],docs],"id"),compras:fxJuntar([r[3],r[4]],"id"),mercado:r[5],
        despesas:(r[6]||[]).map(function(p){return {id:p.id,data:p.data,valor:p.total_pago,estabelecimento:p.estabelecimento}})}}})}
  /* grava uma nota lida do XML. r = {nota, lido, arquivo}; devolve {estado, mensagem, ...} (nunca lança):
     gravada | ja_existia | duplicada | invalido | erro */
  function fxArgsConfirmar(formato,a,entrada){
    return {p_formato:formato,p_nota:a.p_nota,p_itens:a.p_itens,p_docs:a.p_docs,p_proc:formato==="doc"?a.p_proc:null,p_conferir:formato==="xml"?a.p_conferir===true:false,p_decisoes:entrada}}
  /* entrada (opcional) = decisões de produto e estabelecimento (NUCLEO.nfEntradaPayload): com ela a gravação é a CONFIRMAÇÃO ÚNICA (RPC nota_fiscal_confirmar: grava a nota, registra o "Estou de acordo" e lança no Mercado);
     sem ela é a gravação antiga (nota_fiscal_salvar), que a tela não usa mais */
  function fxSalvar(r,conferir,entrada){
    var f=r.arquivo,n=r.nota,id=r.idNota||(r.idNota=crypto.randomUUID()),path=null,enviou=false;
    function fim(estado,mensagem,extra){var o=extra||{};o.estado=estado;o.mensagem=mensagem;return o}
    return Promise.resolve().then(function(){
      return f.arrayBuffer().then(function(buf){
        return crypto.subtle.digest("SHA-256",buf).then(function(h){var sha=fxHex(h),mime="text/xml";   /* sempre text/xml, qualquer que seja o tipo que o navegador deu ao arquivo: o conteúdo já foi lido como NF-e; menos variação a confirmar no Storage */
          var g=NUCLEO.nfParaGravar(r.lido,n,{id:id,dono:DONO,nome:f.name,mime:mime,tamanho:buf.byteLength,sha256:sha,conferir:!!conferir});
          if(!g.ok)return fim(g.modo==="bloqueada"?"bloqueada":"invalido","Não dá para gravar: "+g.erros.join(" ")+(g.modo==="bloqueada"?" Nada foi enviado nem gravado.":""),{erros:g.erros});
          path=g.args.p_docs[0].path;
          /* antes de enviar qualquer arquivo: confere duplicidade (nota, arquivo, Compras, Mercado, pedidos) e a decisão do núcleo; bloqueado = nada é enviado */
          return fxExistentes(n,sha).then(function(ex){
            var dup=NUCLEO.nfDuplicidade(n,ex.dados,{sha256:sha}),dec=NUCLEO.nfDecisaoGravacao(n,dup),avisos0=dec.avisos.concat(ex.avisos);
            var a0=dup.achados.filter(function(x){return x.origem==="nota"&&x.nivel==="confirmada"})[0],mesma=!!(entrada&&a0&&a0.id===id&&dec.bloqueios.length===dec.bloqueios_dup.length);     /* a nota que já existe é desta mesma leitura (a resposta se perdeu): segue, o banco devolve o estado e conclui a entrada */
            if(!dec.pode&&!mesma)return fim("duplicada",dec.bloqueios.join(" ")+" Nada foi enviado.",{id:a0?a0.id:null,atualizar:dup.atualizar_situacao})
            return Promise.resolve(SB.storage.from("familia").upload(path,new Blob([buf],{type:mime}),{upsert:false,contentType:mime})).then(function(u){
              var e=u&&u.error;
              if(e&&!(/exist|duplicate|409/i.test(e.message||"")||e.statusCode==="409"))throw e;     // 409: o mesmo arquivo já está lá (tentativa anterior): segue
              enviou=!e;
              return (entrada?fxRpc("nota_fiscal_confirmar",fxArgsConfirmar("xml",g.args,entrada)):fxRpc("nota_fiscal_salvar",g.args)).then(function(dd){
                var d=entrada?(dd&&dd.fiscal)||{}:dd,apagar=(d&&d.docs_para_apagar)||[],conf=entrada?NUCLEO.nfResultadoConfirmar(dd,n):null;
                function com(o){if(conf){o.confirmar=conf;o.entrada=dd.entrada||null}return o}
                if(conf&&conf.gravada)return fxLimpar(apagar).then(function(){return fim("gravada",conf.texto,com({id:conf.id,conferida:!!g.args.p_conferir,modo:g.modo,avisos:(d.avisos||[]).concat(g.avisos,avisos0,conf.avisos||[]),semelhantes:d.semelhantes||[]}))});
                if(d&&d.criado)return fim("gravada",g.args.p_conferir?"Nota gravada e conferida.":g.modo==="pendente_fiscal"?"Nota gravada como pendente fiscal (sem validação até a autorização).":"Nota gravada (pendente de conferência).",{id:d.id,conferida:!!d.conferida,modo:g.modo,avisos:(d.avisos||[]).concat(g.avisos,avisos0),semelhantes:d.semelhantes||[]});
                if(d&&d.ja_existia)return fxLimpar(apagar).then(function(){return fim("ja_existia","Esta nota já estava gravada.",com({id:d.id}))});
                return fxLimpar(apagar).then(function(){return fim("duplicada",conf?conf.texto:"Já existe uma nota igual na Central Fiscal ("+(d&&d.motivo==="arquivo"?"o mesmo arquivo":"a mesma chave de acesso")+"). O arquivo enviado foi descartado.",com({id:d&&d.id}))})})})})})})
    }).catch(function(e){
      /* qualquer falha: apaga o que ESTA tentativa enviou (o banco recusa apagar arquivo já registrado, então nada de uma gravação que deu certo se perde) */
      return fxLimpar(enviou&&path?[path]:[]).then(function(){return fim("erro","Não gravei: "+fxMsgErro(e))})})}
  /* conferir depois uma nota que ficou pendente */
  function fxConferir(id){
    return fxRpc("nota_fiscal_conferir",{p_id:id}).then(function(d){return {estado:"conferida",mensagem:d&&d.ja_conferida?"Esta nota já estava conferida.":"Nota conferida.",dados:d}},
      function(e){return {estado:"erro",mensagem:"Não conferi: "+fxMsgErro(e)}})}

  /* ---------- tela ---------- */
  function fxLinha(r,v){return h("div",{class:"row"},h("span",{class:"grow",text:r}),h("b",{text:v}))}
  /* validação à vista: a conta (consistente / divergente / baixa confiança), o total calculado contra o fiscal, a diferença em reais e o que a gravação pode fazer. A situação fiscal tem linha própria no cartão. */
  /* conflito de chave com o QR Code: impede confirmar até a pessoa decidir no formulário (aplicar a correção); depois vale a chave que ela deixou, desde que seja uma das duas */
  function fxQrConflitos(r){var q=r&&r.qr;if(!q||q.estado!=="conflito")return [];
    if(!q.decidida)return (q.conflitos||[]).slice();
    var ch=String(r.nota&&r.nota.chave||"").replace(/\D/g,"");
    return ch&&(q.chaves||[]).indexOf(ch)<0?["a chave informada ("+ch+") não é nenhuma das chaves lidas (QR Code ou IA): use uma delas ou deixe o campo vazio."]:[]}
  function fxValidacao(n,r){
    var ia=r&&r.ia,d=NUCLEO.nfDecisaoGravacao(n,r&&r.dup||null,ia?{confianca:ia.confianca,qr_conflitos:fxQrConflitos(r)}:undefined),dc=d,v=d.veredito,s=v.soma,box=h("div",{class:"fxvalid"});
    box.appendChild(h("h4",{text:"Validação da nota"}));
    box.appendChild(fxLinha("Conta dos itens",v.rotulo));
    if(s.total_calculado!=null&&s.total_fiscal!=null){box.appendChild(fxLinha("Total calculado pelos itens",fxMoeda(s.total_calculado)));box.appendChild(fxLinha("Total fiscal",fxMoeda(s.total_fiscal)));box.appendChild(fxLinha("Diferença",v.diferenca_texto||"—"))}
    v.motivos.forEach(function(m){box.appendChild(h("div",{class:"fxaviso fxbloq",text:(m.tipo==="divergencia"?"Divergência: ":m.codigo==="confianca_baixa"?"Baixa confiança: ":"Dados incompletos: ")+m.texto}))});
    v.bloqueios.forEach(function(b){box.appendChild(h("div",{class:"fxaviso fxbloq",text:b.texto}))});
    fxQrConflitos(r).forEach(function(t){box.appendChild(h("div",{class:"fxaviso fxbloq",text:"Conflito com o QR Code: "+t}))});
    v.avisos.forEach(function(a){if((n.avisos||[]).indexOf(a)<0)box.appendChild(h("div",{class:"fxaviso",text:a}))});
    d.bloqueios_dup.forEach(function(b){box.appendChild(h("div",{class:"fxaviso fxbloq",text:b}))});d.avisos_dup.forEach(function(a){box.appendChild(h("div",{class:"fxaviso",text:a}))});
    /* a linha "Gravação" diz se o "Estou de acordo" vai existir: dados essenciais, conta, situação fiscal, conflito de chave e duplicidade (a confiança da IA só informa) */
    box.appendChild(fxLinha("Gravação",dc.modo==="validada"?"Pode ser gravada como validada e lançada no Mercado":dc.modo==="pendente_fiscal"?"Só como pendente fiscal (sem validação); a entrada no Mercado não espera a SEFAZ":"Bloqueada: não pode ser confirmada"));
    return box}
  function fxCartao(r,repetida){
    var n=r.nota,c=h("div",{class:"panel fxnota"});
    c.appendChild(h("h3",{text:r.nome}));
    if(r.erro){c.appendChild(h("div",{class:"fxaviso",text:r.erro}));return c}
    var em=n.emitente||{},V=n.valores||{};
    c.appendChild(h("p",{class:"sub",text:(n.tipo||"Nota")+" · nº "+(n.numero||"?")+" · série "+(n.serie||"?")+" · "+(n.data_emissao?dataBR(n.data_emissao):"data não identificada")}));
    c.appendChild(fxLinha("Situação fiscal",(NUCLEO.NF_SITUACOES[n.situacao]||n.situacao)+(n.situacao==="autorizada"?"":n.situacao==="cancelada"||n.situacao==="rejeitada"?" — não vale como compra":" — pendente na SEFAZ: a compra entra no Mercado mesmo assim")));
    c.appendChild(fxLinha("Emitente",(em.nome||"não identificado")+(em.cnpj?" · "+fxCnpj(em.cnpj):"")+(em.uf?" · "+em.uf:"")));
    c.appendChild(fxLinha("Chave de acesso",n.chave?fxGrupos(n.chave,4):"não identificada"));
    c.appendChild(fxLinha("Chave confere",n.chave_valida?"Sim (dígito verificador, CNPJ, modelo, série, número e mês batem)":"NÃO — veja os avisos"));
    var it=h("ul",{class:"fxitens"});
    (n.itens||[]).forEach(function(i){
      it.appendChild(h("li",null,h("div",{class:"fxitem"},
        h("b",{class:"fxnome",text:i.descricao||"(sem descrição)"}),
        h("span",{class:"fxqtd",text:fxQtd(i.qtd)+" "+(i.unidade&&i.unidade.original||"")+" × "+fxMoeda(i.unitario)}),
        i.desconto?h("span",{class:"fxdesc",text:"Desconto: − "+fxMoeda(i.desconto)}):null),
        h("b",{class:"fxtot",text:fxMoeda(i.total)})))});
    c.appendChild(h("h4",{text:(n.itens||[]).length+(((n.itens||[]).length===1)?" item":" itens")}));c.appendChild(it);
    c.appendChild(fxLinha("Produtos",fxMoeda(V.produtos)));
    if(V.descontos)c.appendChild(fxLinha("Descontos","− "+fxMoeda(V.descontos)));
    if(V.frete)c.appendChild(fxLinha("Frete",fxMoeda(V.frete)));
    if(V.outras)c.appendChild(fxLinha("Outras despesas",fxMoeda(V.outras)));
    c.appendChild(fxLinha("Total da nota",fxMoeda(V.total)));
    c.appendChild(fxLinha("Valor pago",fxMoeda(V.a_pagar)));
    (n.pagamentos||[]).forEach(function(p){c.appendChild(fxLinha("Pagamento",(p.forma||"forma não identificada")+(p.bandeira?" · "+p.bandeira:"")+(p.final?" · final "+p.final:"")+" · "+fxMoeda(p.valor)))});
    if(V.impostos!=null)c.appendChild(fxLinha("Tributos aproximados",fxMoeda(V.impostos)));
    (n.avisos||[]).forEach(function(a){c.appendChild(h("div",{class:"fxaviso",text:a}))});
    c.appendChild(fxValidacao(n,r));
    if(r.ia)c.appendChild(fxBlocoIA(r,c));
    if(repetida)c.appendChild(h("div",{class:"fxaviso",text:"Esta chave de acesso já apareceu neste lote: provável arquivo repetido."}));
    if(r.arquivo)c.appendChild(fxBlocoConfirmar(r));
    c.appendChild(h("p",{class:"sub",text:r.ia?"Não gera despesa. O arquivo original só vai ao cofre privado da casa quando você clica em “Estou de acordo”.":"Não gera despesa. CPF e nome do consumidor do XML não são lidos nem mostrados; o arquivo original, que os contém, é guardado inteiro no cofre privado da casa."}));
    return c}
  /* ---------- Lote 1.4: nota em foto ou PDF lida pela IA (dono e casa; ação fiscal.nota da rac-ia; docs/fiscal.md) ----------
     O arquivo é conferido pelo CONTEÚDO (bytes), o PDF só é desenhado (nunca executado), o texto do PDF perde o CPF antes de sair do aparelho e a IA só devolve JSON:
     quem valida é o núcleo (conta, situação fiscal, confiança mínima de 0,90, duplicidade). A leitura em si não grava nada; a gravação (Lote 1.6) só acontece no clique em salvar e nunca lança despesa. */
  var FX_PDF="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",FX_PDF_W="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  var FX_IA={cache:{},lendo:false};
  /* ---------- QR Code da NFC-e, lido NO APARELHO (nada sai daqui): fotos e páginas de PDF. Se o leitor não carregar, ou não houver QR, ou ele estiver ilegível, o fluxo segue só com a IA. ---------- */
  var FX_QR_URL="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
  function fxQrCarregar(){return Promise.resolve().then(function(){return window.jsQR||carregarScript(FX_QR_URL).then(function(){return window.jsQR})}).then(function(f){return typeof f==="function"?f:null},function(){return null})}
  function fxQrCanvas(L,cv){try{var id=cv.getContext("2d").getImageData(0,0,cv.width,cv.height),q=L(id.data,id.width,id.height,{inversionAttempts:"attemptBoth"});return q&&q.data?String(q.data).slice(0,2000):null}catch(e){return null}}
  function fxImgCanvas(f,max){
    return Promise.resolve().then(function(){if(typeof createImageBitmap==="function")return createImageBitmap(f);
      return new Promise(function(ok,no){var u=URL.createObjectURL(f),i=new Image();i.onload=function(){URL.revokeObjectURL(u);ok(i)};i.onerror=function(){URL.revokeObjectURL(u);no(new Error("imagem"))};i.src=u})}).then(function(im){
      var w=im.width||im.naturalWidth,hh=im.height||im.naturalHeight,k=Math.min(1,max/Math.max(w,hh)),cv=document.createElement("canvas");cv.width=Math.max(1,Math.round(w*k));cv.height=Math.max(1,Math.round(hh*k));
      cv.getContext("2d").drawImage(im,0,0,cv.width,cv.height);if(im.close)im.close();return cv})}
  /* uma foto, em dois tamanhos (o QR é pequeno na foto); devolve o texto do primeiro QR achado */
  function fxQrFoto(L,f){return [2600,1400].reduce(function(p,max){return p.then(function(ach){return ach||fxImgCanvas(f,max).then(function(cv){return fxQrCanvas(L,cv)},function(){return null})})},Promise.resolve(null))}
  function fxQrFotos(lista){return fxQrCarregar().then(function(L){if(!L)return {textos:[],leitor:"indisponivel"};
    return lista.reduce(function(p,f){return p.then(function(acc){return fxQrFoto(L,f).then(function(t){if(t&&acc.indexOf(t)<0)acc.push(t);return acc})})},Promise.resolve([])).then(function(t){return {textos:t,leitor:"ok"}})}).then(null,function(){return {textos:[],leitor:"indisponivel"}})}
  function fxCabecalho(f){return f.slice(0,16).arrayBuffer().then(function(b){return Array.prototype.slice.call(new Uint8Array(b))})}
  function fxLatin1(buf){var u=new Uint8Array(buf),s="",i,p=8192;for(i=0;i<u.length;i+=p)s+=String.fromCharCode.apply(null,u.subarray(i,Math.min(u.length,p+i)));return s}
  /* identidade do documento = SHA-256 dos SHA-256 dos arquivos (a mesma foto ou PDF lida de novo não é enviada de novo na mesma tela) */
  function fxIdDoc(bufs){return Promise.all(bufs.map(function(b){return crypto.subtle.digest("SHA-256",b).then(fxHex)})).then(function(hs){return crypto.subtle.digest("SHA-256",new TextEncoder().encode(hs.join(":"))).then(fxHex)})}
  /* PDF → texto (CPF mascarado) e imagens JPEG das páginas (até 1568 px); no máximo NF_IA_MAX_PAG páginas */
  function fxPdfParaImagens(buf){
    var qrs=[],LQ=null;
    return fxQrCarregar().then(function(Lq){LQ=Lq;return carregarScript(FX_PDF)}).then(function(){var L=window.pdfjsLib;L.GlobalWorkerOptions.workerSrc=FX_PDF_W;return L.getDocument({data:new Uint8Array(buf.slice(0)),isEvalSupported:false}).promise}).then(function(doc){
      if(doc.numPages>NUCLEO.NF_IA_MAX_PAG)throw new Error("O PDF tem "+doc.numPages+" páginas; o limite é "+NUCLEO.NF_IA_MAX_PAG+". Envie só as páginas da nota.");
      var txt=[],imgs=[],p=Promise.resolve();
      for(var i=1;i<=doc.numPages;i++)(function(i){p=p.then(function(){return doc.getPage(i).then(function(pg){
        return pg.getTextContent().then(function(tc){txt.push(tc.items.map(function(x){return x.str}).join(" "))}).then(function(){
          var v0=pg.getViewport({scale:1}),v=pg.getViewport({scale:Math.min(3,1568/Math.max(v0.width,v0.height))}),cv=document.createElement("canvas");cv.width=Math.max(1,Math.round(v.width));cv.height=Math.max(1,Math.round(v.height));
          return pg.render({canvasContext:cv.getContext("2d"),viewport:v}).promise.then(function(){var q=LQ?fxQrCanvas(LQ,cv):null;if(q&&qrs.indexOf(q)<0)qrs.push(q);var d=cv.toDataURL("image/jpeg",0.85);imgs.push({tipo:"image/jpeg",base64:d.slice(d.indexOf(",")+1)})})})})})})(i);
      return p.then(function(){return {texto:txt.join("\n"),imagens:imgs,paginas:doc.numPages,qr:{textos:qrs,leitor:LQ?"ok":"indisponivel"}}})})}
  /* o que vai à IA: fotos reduzidas (iaFoto) ou páginas do PDF + o texto do PDF sem CPF */
  function fxPreparar(lote,lista,bufs){
    if(lote.tipo==="pdf")return fxPdfParaImagens(bufs[0]).then(function(r){return {texto:NUCLEO.nfMascararCpf(r.texto).replace(/\s+/g," ").trim().slice(0,5800),imagens:r.imagens.slice(0,4),qr:r.qr}});
    return Promise.all([Promise.all(lista.map(function(f){return iaFoto(f)})),fxQrFotos(lista)]).then(function(x){return {texto:"",imagens:x[0],qr:x[1]}})}
  var FX_NAO_LIBERADO={sem_real:1,acao_em_demo:1,modo_demo:1,papel_em_demo:1};
  function fxResultadoIA(resp,lote,lista,id,qrAch){
    var nao="A leitura de foto e PDF por IA ainda não está liberada no servidor. Nada foi lido, cobrado nem gravado.";
    if(!resp||!resp.ok){var c=resp&&resp.erro&&resp.erro.codigo,m=resp&&resp.erro&&resp.erro.mensagem;
      if(FX_NAO_LIBERADO[c]||(c==="entrada_invalida"&&/Ação desconhecida/i.test(m||"")))return {estado:"nao_liberado",mensagem:nao};
      return {estado:"erro",mensagem:"A IA não leu o documento: "+(resp&&resp.mensagem||m||"sem resposta")+(resp&&resp.estado==="incerto"&&resp.id?" Id da chamada: "+resp.id+".":"")+" Nada foi gravado."}}
    if(resp.modo!=="REAL"||!resp.resultado||resp.resultado._demo)return {estado:"nao_liberado",mensagem:nao};
    var ia=NUCLEO.nfLerIA(resp.resultado,lote.tipo);
    /* QR Code: a chave validada complementa a leitura da IA; se divergir da chave da IA, vira conflito mostrado (nunca escolhe em silêncio) */
    var ach=((qrAch&&qrAch.textos)||[]).map(NUCLEO.nfQrChave),vq=ach.filter(function(x){return x.ok}),chs=[];vq.forEach(function(x){if(chs.indexOf(x.chave)<0)chs.push(x.chave)});
    var cq=chs.length>1?{estado:"conflito",lido:ia.lido,chave_qr:null,chave_ia:null,avisos:[],conflitos:["há mais de um QR Code com chaves de acesso diferentes ("+chs.join(" e ")+"): confira qual é a nota e deixe a chave correta no formulário “Corrigir os dados lidos”."]}:NUCLEO.nfQrConferir(ia.lido,vq[0]||ach[0]||null);
    ia.lido=cq.lido;var nota=NUCLEO.nfNormalizar(ia.lido);
    var r={nome:lista.map(function(f){return f.name||"arquivo"}).join(", ").slice(0,160),nota:nota,lido:ia.lido,arquivo:null,fotos:lista,tipoDoc:lote.tipo,
      ia:{confianca:ia.confianca,incertos:ia.incertos,itens_incertos:ia.itens_incertos,avisos:ia.avisos.concat(resp.avisos||[]),formato:ia.formato,idChamada:resp.id||null,modelo:resp.modelo||null,consumo:resp.consumo||null},
      qr:{estado:cq.estado,leitor:(qrAch&&qrAch.leitor)||"indisponivel",chave_qr:cq.chave_qr,chave_ia:cq.chave_ia,chaves:chs.length>1?chs:[cq.chave_qr,cq.chave_ia].filter(Boolean),avisos:cq.avisos,conflitos:cq.conflitos,decidida:false,consulta:NUCLEO.nfConsultaSefaz(vq[0]||null)}};
    FX_IA.cache[id]=r;return {estado:"lido",r:r}}
  /* a conferência de duplicidade da leitura (só leitura no banco; sem arquivo, sem SHA) */
  function fxDuplicarIA(r){return fxExistentes(r.nota,"").then(function(ex){r.dup=NUCLEO.nfDuplicidade(r.nota,ex.dados,{});r.dupAvisos=ex.avisos;return r},function(){r.dup=null;r.dupAvisos=["Não consegui conferir duplicidade agora; ela será conferida de novo."];return r})}
  /* ponto de entrada: arquivos escolhidos → {estado: lido | cache | invalido | nao_liberado | erro | ocupado, mensagem, r}. Nunca lança; um documento por vez. */
  function fxIA(files){
    var lista=Array.prototype.slice.call(files||[],0,6);
    if(FX_IA.lendo)return Promise.resolve({estado:"ocupado",mensagem:"Já estou lendo um documento. Espere terminar."});
    FX_IA.lendo=true;
    function fim(x){FX_IA.lendo=false;return x}
    return Promise.all(lista.map(function(f){return fxCabecalho(f).then(function(cab){return NUCLEO.nfArquivoIA({nome:f.name,tamanho:f.size,cabecalho:cab,tipoDeclarado:f.type})})})).then(function(infos){
      var lote=NUCLEO.nfLoteIA(infos);if(!lote.ok)return fim({estado:"invalido",mensagem:lote.erro});
      return Promise.all(lista.map(function(f){return f.arrayBuffer()})).then(function(bufs){
        if(lote.tipo==="pdf"&&NUCLEO.nfPdfAtivo(fxLatin1(bufs[0])))return fim({estado:"invalido",mensagem:"O PDF tem conteúdo ativo (script ou arquivo embutido) e não foi aberto. Use o PDF original da nota ou uma foto."});
        return fxIdDoc(bufs).then(function(id){
          if(FX_IA.cache[id])return fim({estado:"cache",mensagem:"Este documento já foi lido nesta tela: nada foi enviado de novo à IA.",r:FX_IA.cache[id]});
          var qrAch=null;
          return fxPreparar(lote,lista,bufs).then(function(ent){qrAch=ent.qr;return racIA("fiscal","fiscal.nota",{texto:ent.texto,imagens:ent.imagens},{})}).then(function(resp){
            var x=fxResultadoIA(resp,lote,lista,id,qrAch);return x.r?fxDuplicarIA(x.r).then(function(){return fim(x)}):fim(x)})})})
    }).catch(function(e){return fim({estado:"erro",mensagem:"Não consegui ler o documento: "+(e&&e.message||e)+" Nada foi gravado."})})}
  /* ---------- tela da leitura por IA: confiança, campos incertos, correção manual e revalidação ---------- */
  function fxPct(x){return Math.round(x*100)+"%"}
  function fxBlocoQr(r,box){
    var q=r.qr;if(!q)return;
    var t={sem_qr:q.leitor==="indisponivel"?"QR Code: o leitor não está disponível neste aparelho; segui só com a leitura da IA.":"QR Code: não encontrei QR Code na imagem; segui só com a leitura da IA.",
      invalido:"QR Code: lido, mas sem chave de acesso válida; segui só com a leitura da IA.",confere:"QR Code: a chave de acesso confere com a da leitura da IA.",complementou:"QR Code: a chave de acesso veio do QR Code (validada pelo dígito verificador).",conflito:"QR Code: CONFLITO de chave de acesso (detalhes na validação)."}[q.estado];
    box.appendChild(h("div",{class:q.estado==="conflito"?"fxaviso fxbloq":q.estado==="complementou"||q.estado==="confere"?"sub":"fxaviso",text:t}));
    (q.avisos||[]).forEach(function(a){box.appendChild(h("div",{class:"sub",text:a}))});
    var cs=q.consulta;if(cs)box.appendChild(h("div",{class:"sub"},"Consulta pública oficial: não é feita automaticamente. "+cs.motivo+" ",cs.link?h("a",{href:cs.link,target:"_blank",rel:"noopener noreferrer",text:"Abrir a consulta no site oficial"}):null))}
  function fxBlocoIA(r,c){
    var ia=r.ia,box=h("div",{class:"fxvalid fxia"});
    box.appendChild(h("h4",{text:"Leitura por IA ("+(ia.formato==="pdf"?"PDF":"foto")+")"}));
    box.appendChild(fxLinha("Confiança da leitura (informação)",fxPct(ia.confianca)));
    box.appendChild(h("p",{class:"sub",text:"Confiança abaixo de 60%: não confirma (leia de novo). De 60% a 69%: confirma com aviso de baixa confiança. A partir de 70%: segue normal. Além dela, impedem a confirmação dado essencial faltando, conta que não fecha, nota cancelada ou rejeitada, conflito de chave e duplicidade."}));
    fxBlocoQr(r,box);
    NUCLEO.nfCamposInfo(r.lido,ia.incertos).forEach(function(x){box.appendChild(h("div",{class:x.estado==="ilegivel"?"fxaviso":"sub",text:x.texto}))});
    (ia.incertos||[]).forEach(function(x){box.appendChild(h("div",{class:"fxaviso",text:"Incerto — "+x.campo+(x.motivo?": "+x.motivo:"")}))});
    (ia.itens_incertos||[]).forEach(function(k){box.appendChild(h("div",{class:"fxaviso",text:"Item "+k+" marcado pela IA como incerto."}))});
    (ia.avisos||[]).forEach(function(a){box.appendChild(h("div",{class:"fxaviso",text:a}))});
    (r.dupAvisos||[]).forEach(function(a){box.appendChild(h("div",{class:"fxaviso",text:a}))});
    if(ia.consumo&&ia.consumo.mes&&ia.consumo.mes.alerta)box.appendChild(h("div",{class:"fxaviso",text:"A IA já usou "+ia.consumo.mes.percentual+"% do limite do mês."}));
    box.appendChild(fxEditor(r,c));
    box.appendChild(fxOriginais(r));
    box.appendChild(fxBlocoConfirmar(r));
    return box}
  function fxCampo(rotulo,valor,inp){var i=h("input",{type:"text","aria-label":rotulo});i.value=valor==null?"":String(valor);inp[rotulo]=i;return h("label",{class:"fxcampo"},rotulo+": ",i)}
  /* correção manual: o que a pessoa digita volta pelo núcleo (nfCorrigir → nfNormalizar) e TODAS as regras rodam de novo e o cartão é atualizado. Não há caixa de "conferi": a única confirmação humana é o botão "Estou de acordo". */
  function fxEditor(r,c){
    var d=h("details",{class:"fxeditor"}),l=r.lido||{},V=l.valores||{},E=l.emitente||{},inp={},itIn=[];
    d.appendChild(h("summary",{text:"Corrigir os dados lidos"}));
    [["Emitente",E.nome],["CNPJ do emitente",E.cnpj],["Chave de acesso",l.chave],["Data (AAAA-MM-DD)",l.data_emissao],["Número",l.numero],["Série",l.serie],["Modelo (55 ou 65)",l.modelo],
      ["Total dos produtos",V.produtos],["Descontos",V.descontos],["Frete",V.frete],["Outras despesas",V.outras],["Total da nota",V.total]].forEach(function(x){d.appendChild(fxCampo(x[0],x[1],inp))});
    (l.itens||[]).forEach(function(i,k){var o={},linha=h("div",{class:"fxitenscorr"},h("b",{text:"Item "+(k+1)}));
      [["descricao","Descrição",i.descricao],["qtd","Quantidade",i.qtd],["unitario","Unitário",i.unitario],["total","Total do item",i.total],["desconto","Desconto do item",i.desconto]].forEach(function(x){
        var e=h("input",{type:"text","aria-label":x[1]+" do item "+(k+1)});e.value=x[2]==null?"":String(x[2]);o[x[0]]=e;linha.appendChild(h("label",{class:"fxcampo"},x[1]+": ",e))});
      o.unidade=i.unidade;o.codigo=i.codigo;itIn.push(o);d.appendChild(linha)});
    var btn=h("button",{type:"button",class:"ghostbtn pri",text:"Aplicar correção e revalidar"}),st=h("p",{class:"sub",role:"status"});
    d.appendChild(h("p",{class:"sub",text:"Corrija o que estiver errado e aplique: a conta, a situação fiscal, o QR Code e a duplicidade são conferidos de novo e o cartão é atualizado. Campo que a nota não traz pode ficar vazio. Não há outra confirmação além do botão “Estou de acordo”."}));
    d.appendChild(h("div",{class:"vfil"},btn));d.appendChild(st);
    btn.onclick=function(){
      var val=function(k){return inp[k].value};
      var corr={emitente_nome:val("Emitente"),emitente_cnpj:val("CNPJ do emitente"),chave:val("Chave de acesso"),data_emissao:val("Data (AAAA-MM-DD)"),numero:val("Número"),serie:val("Série"),modelo:val("Modelo (55 ou 65)"),
        valores:{produtos:val("Total dos produtos"),descontos:val("Descontos"),frete:val("Frete"),outras:val("Outras despesas"),total:val("Total da nota")},
        itens:itIn.map(function(o){return {descricao:o.descricao.value,codigo:o.codigo,unidade:o.unidade,qtd:o.qtd.value,unitario:o.unitario.value,total:o.total.value,desconto:o.desconto.value}})};
      btn.disabled=true;st.textContent="Revalidando…";
      r.lido=NUCLEO.nfCorrigir(r.lido,corr);r.nota=NUCLEO.nfNormalizar(r.lido);if(r.qr)r.qr.decidida=true;r.idem=null;if(!(r.gravado&&r.gravado.gravada))r.gravado=null;     /* correção = gravação nova: identificador de idempotência novo */
      fxDuplicarIA(r).then(function(){var novo=fxCartao(r,false);r.ultimoCartao=novo;if(c&&c.parentNode&&c.parentNode.replaceChild)c.parentNode.replaceChild(novo,c)})};
    return d}
  /* ---------- Lote 1.6: gravar nota de FOTO ou PDF (função do banco nota_fiscal_salvar_doc, migration 037) ----------
     Ordem: confere o arquivo pelo conteúdo, calcula o SHA-256, monta o payload (NUCLEO.nfParaGravarDoc), confere duplicidade ANTES de enviar qualquer coisa, envia o original ao cofre
     privado "familia" (<dono>/notas-fiscais/<nota>/<sha256>.<ext>) e só então chama a função, que refaz a conta, aplica a confiança mínima e decide (validada, pendente fiscal, bloqueada, duplicada).
     A tela só afirma "gravada" depois que o banco respondeu que criou a nota e a nota foi lida de volta. Foto e PDF nunca são conferidos aqui; nada gera despesa.
     Falha no envio ou na função: o que ESTA tentativa enviou é apagado (o banco recusa apagar o que já está registrado); a mesma tentativa repetida (mesmo identificador) não grava duas vezes. */
  function fxUpload(path,buf,mime){
    return Promise.resolve(SB.storage.from("familia").upload(path,new Blob([buf],{type:mime}),{upsert:false,contentType:mime})).then(function(u){
      var e=u&&u.error;
      if(e&&!(/exist|duplicate|409/i.test(e.message||"")||e.statusCode==="409"))throw e;
      return !e})}                                  /* true = esta tentativa enviou o arquivo; false = ele já estava lá */
  /* duplicidade obrigatória (se falhar, nada é enviado): a nota, cada arquivo (SHA-256), Compras, Mercado e pedidos (melhor esforço) */
  function fxDuplicidadeDoc(n,shas){
    return fxExistentes(n,"").then(function(ex){
      return Promise.all(shas.map(function(s){return fxLer("notas_fiscais_docs","nota_id,sha256","sha256",s)})).then(function(L){
        var dups=shas.map(function(s,i){var d=ex.dados,docs=L[i].map(function(x){return {id:x.nota_id,sha256:x.sha256}});
          return NUCLEO.nfDuplicidade(n,{notas:fxJuntar([d.notas,docs],"id"),compras:d.compras,mercado:d.mercado,despesas:d.despesas},{sha256:s})});
        return {dup:dups.filter(function(d){return d.duplicada})[0]||dups[0],avisos:ex.avisos}})})}
  /* lê a nota de volta: a confirmação visual só vale se ela existe e tem os documentos */
  function fxConfirmarDoc(id,qtd){
    return Promise.all([fxLer("notas_fiscais","id,situacao,formato_origem,conferida_em","id",id),fxLer("notas_fiscais_docs","id,sha256","nota_id",id)]).then(function(l){
      return {ok:!!l[0][0]&&l[1].length>=qtd,nota:l[0][0]||null,docs:l[1].length}},function(){return {ok:false,nota:null,docs:0,falhou:true}})}
  /* r = leitura por IA (r.fotos = arquivos escolhidos). Devolve {estado, mensagem, ...} (nunca lança):
     validada | pendente_fiscal | bloqueada | duplicada | ja_existia | invalido | erro | ocupado */
  function fxSalvarDoc(r,entrada){
    if(r.salvando)return Promise.resolve({estado:"ocupado",mensagem:"Já estou gravando esta nota. Espere terminar."});
    r.salvando=true;
    var id=r.idNota||(r.idNota=crypto.randomUUID()),idem=r.idem||(r.idem=crypto.randomUUID()),novos=[];
    function fim(estado,mensagem,extra){r.salvando=false;var o=extra||{};o.estado=estado;o.mensagem=mensagem;return o}
    return Promise.resolve().then(function(){
      var fs=r.fotos||[];
      if(!fs.length)return fim("invalido","Os arquivos da leitura não estão mais nesta tela. Leia o documento de novo. Nada foi enviado nem gravado.");
      return Promise.all(fs.map(function(f){return fxCabecalho(f).then(function(cab){return NUCLEO.nfArquivoIA({nome:f.name,tamanho:f.size,cabecalho:cab,tipoDeclarado:f.type})})})).then(function(infos){
        var ruim=infos.filter(function(i){return !i.ok})[0];if(ruim)return fim("invalido","Arquivo recusado: "+ruim.erro+" Nada foi enviado nem gravado.");
        return Promise.all(fs.map(function(f){return f.arrayBuffer()})).then(function(bufs){
          return Promise.all(bufs.map(function(b){return crypto.subtle.digest("SHA-256",b).then(fxHex)})).then(function(shas){
            var arqs=fs.map(function(f,i){return {nome:f.name,mime:infos[i].mime,tamanho:bufs[i].byteLength,sha256:shas[i]}}),
              g=NUCLEO.nfParaGravarDoc(r.lido,r.nota,{id:id,dono:DONO,idem:idem,tipo:r.tipoDoc,arquivos:arqs,confianca:r.ia.confianca,revisada:true,qr_conflitos:fxQrConflitos(r),incertos:r.ia.incertos,modelo_ia:r.ia.modelo,ia_uso_id:r.ia.idChamada});
            if(!g.ok)return fim("invalido","Não dá para gravar: "+g.erros.join(" ")+" Nada foi enviado nem gravado.",{erros:g.erros});
            return fxDuplicidadeDoc(r.nota,shas).then(function(dx){
              var dec=NUCLEO.nfDecisaoGravacao(r.nota,dx.dup,{confianca:r.ia.confianca,qr_conflitos:fxQrConflitos(r)});
              r.dup=dx.dup;
              var a0=dx.dup.achados.filter(function(x){return x.origem==="nota"&&x.nivel==="confirmada"})[0];
              if(dec.bloqueios_dup.length&&!(entrada&&a0&&a0.id===id)){      /* com a confirmação única, a nota que já existe sendo desta mesma leitura não é duplicidade: o banco devolve o estado e conclui a entrada */
                /* a nota que já existe é desta mesma leitura (a resposta anterior se perdeu depois de gravar): não é duplicidade, é a mesma gravação */
                if(a0&&a0.id===id)return fxConfirmarDoc(id,g.args.p_docs.length).then(function(cf){
                  var t="Esta leitura já tinha sido gravada (a resposta anterior se perdeu): a nota existe no banco"+(cf.ok?" e foi lida de volta com "+cf.docs+(cf.docs===1?" documento":" documentos")+".":", mas não consegui lê-la de volta agora; confira na lista.")+" Nada foi enviado de novo.";
                  r.gravado={id:id,gravada:cf.ok,estado:"ja_existia",texto:t,avisos:[]};return fim("ja_existia",t,r.gravado)});
                return fim("duplicada",dec.bloqueios_dup.join(" ")+" Nada foi enviado nem gravado.",{id:a0?a0.id:null,atualizar:dx.dup.atualizar_situacao})}
              /* enviar um por vez: se um falhar, só o que já subiu nesta tentativa é apagado */
              return g.args.p_docs.reduce(function(p,d,i){return p.then(function(){return fxUpload(d.path,bufs[i],d.mime).then(function(novo){if(novo)novos.push(d.path)})})},Promise.resolve()).then(function(){
                return entrada?fxRpc("nota_fiscal_confirmar",fxArgsConfirmar("doc",g.args,entrada)):fxRpc("nota_fiscal_salvar_doc",g.args)}).then(function(dd){
                var d=entrada?(dd&&dd.fiscal)||{}:dd,conf=entrada?NUCLEO.nfResultadoConfirmar(dd,r.nota):null,res=NUCLEO.nfResultadoDoc(d),apagar=(d&&d.docs_para_apagar)||[];
                if(conf&&conf.gravada){res={estado:conf.estado,gravada:true,id:conf.id,texto:conf.texto}}
                else if(conf&&conf.estado==="duplicada")res={estado:"duplicada",gravada:false,id:conf.id,texto:conf.texto};
                return fxLimpar(apagar).then(function(){
                  var base={id:res.id,gravada:res.gravada,estado:res.estado,tentativa_id:d&&d.tentativa_id||null,resultado:d&&d.resultado||null,avisos:(d&&d.avisos||[]).concat(g.avisos,dec.avisos_dup,dx.avisos,conf&&conf.avisos||[]),texto:res.texto};
                  if(conf){base.confirmar=conf;base.entrada=dd.entrada||null}
                  if(!res.gravada){r.gravado=base;return fim(res.estado,res.texto,base)}
                  return fxConfirmarDoc(res.id,g.args.p_docs.length).then(function(cf){
                    base.confirmacao=cf.ok?"Conferido no banco: a nota e "+cf.docs+(cf.docs===1?" documento foram":" documentos foram")+" lidos de volta.":"O banco respondeu que gravou, mas não consegui ler a nota de volta agora: confira na lista abaixo.";
                    r.gravado=base;
                    return fim(res.estado,res.texto+" "+base.confirmacao,base)})})})})})})})
    }).catch(function(e){
      return fxLimpar(novos).then(function(){return fim("erro","Não gravei: "+fxMsgErro(e)+(e&&e.code?"":" Se a conexão caiu, tente de novo: a mesma tentativa não grava duas vezes.")+" Nenhuma nota foi criada por esta tentativa.")})})}
  /* atualizar a situação fiscal (nota_fiscal_atualizar_situacao): o sucesso só aparece depois que o banco confirmou e a nota foi lida de volta */
  function fxAtualizarSituacao(nota,o){
    var v=NUCLEO.nfAtualizarSituacao(nota,o);
    if(!v.ok)return Promise.resolve({estado:"invalido",mensagem:"Não atualizei: "+v.erros.join(" ")});
    return fxRpc("nota_fiscal_atualizar_situacao",v.args).then(function(d){
      if(d&&d.sem_mudanca)return {estado:"sem_mudanca",mensagem:"A nota já estava "+(NUCLEO.NF_SITUACOES[d.situacao]||d.situacao||"nessa situação").toLowerCase()+": nada mudou."};
      return fxLer("notas_fiscais","id,situacao","id",nota.id).then(function(l){
        var n=l[0];if(n&&n.situacao===v.args.p_situacao)return {estado:"atualizada",mensagem:"Situação atualizada: "+(NUCLEO.NF_SITUACOES[nota.situacao]||nota.situacao)+" → "+NUCLEO.NF_SITUACOES[n.situacao]+". O histórico foi registrado.",de:nota.situacao,para:n.situacao};
        return {estado:"incerto",mensagem:"O banco respondeu que atualizou, mas não confirmei a nova situação ao reler a nota. Confira na lista."}},function(){return {estado:"incerto",mensagem:"O banco respondeu que atualizou, mas não consegui reler a nota agora. Confira na lista."}})
    },function(e){return {estado:"erro",mensagem:"Não atualizei: "+fxMsgErro(e)}})}
  /* ---------- Confirmação única (docs/fiscal.md, "Redesenho"): "Estou de acordo" grava a nota na Central Fiscal e lança a compra no Mercado numa chamada só (RPC nota_fiscal_confirmar, migration 059).
     A situação fiscal NÃO impede a entrada (autorizada, pendente e contingência entram; cancelada e rejeitada não). Nunca cria despesa. Sem o clique nada é enviado nem gravado: não existe botão, tela ou estado de recusa. ---------- */
  /* retoma uma entrada já confirmada ("Tentar de novo": sem nova leitura nem nova confirmação) ou, com decisoes, lança uma nota antiga depois do "Estou de acordo" dela. Só diz que entrou depois de o banco responder e a compra ser lida de volta. */
  function fxEntradaMercado(notaId,nota,decisoes){
    var args={p_nota_id:notaId};if(decisoes){args.p_concordo=true;args.p_decisoes=decisoes}
    return fxRpc("nota_fiscal_entrada_mercado",args).then(function(d){
      var x=NUCLEO.nfResultadoConfirmar({gravada:true,nota_id:notaId,entrada:d&&d.entrada},nota);
      if(x.estado==="mercado_pendente")return x;
      if(!x.ok)return {estado:"erro",ok:false,texto:x.texto};
      return Promise.all([fxLer("notas","id,total","id",x.mercado_nota_id),fxLer("itens","id","nota_id",x.mercado_nota_id)]).then(function(l){
        x.confirmacao=!!l[0][0]&&l[1].length>=1?"Conferido no banco: a compra e "+l[1].length+(l[1].length===1?" item foram":" itens foram")+" lidos de volta.":"O banco respondeu que lançou, mas não consegui ler a compra de volta agora: confira no Mercado.";return x},
        function(){x.confirmacao="O banco respondeu que lançou, mas não consegui ler a compra de volta agora: confira no Mercado.";return x})
    },function(e){return {estado:"erro",ok:false,texto:"Não concluí a entrada no Mercado: "+fxMsgErro(e)}})}
  /* o que o RAC vai usar em cada item e no estabelecimento (NUCLEO.nfEntradaDecisoes), calculado com os produtos que o Mercado já tem. Se a leitura falhar, o banco decide (mesmo produto se a descrição for igual; senão cria). */
  function fxPrepararEntrada(nota){
    return Promise.resolve().then(function(){return Promise.all([fxLer("mercados","id,nome,cnpj",null,null,{col:"nome",asc:true,lim:1000}),fxLer("produtos","id,nome,categoria,unidade",null,null,{col:"nome",asc:true,lim:1000}),
      fxLer("itens","descricao,produto_id",null,null,{col:"created_at",asc:false,lim:1000})])}).then(function(l){
      var ap={};l[2].forEach(function(x){var k=x.produto_id&&x.descricao?NUCLEO.mkChave(x.descricao):"";if(k&&!ap[k])ap[k]=x.produto_id});
      return {dec:NUCLEO.nfEntradaDecisoes(nota,l[1],l[0],ap),aviso:null}},function(){
      return {dec:null,aviso:"Não consegui ler seus produtos do Mercado agora: o RAC usa o mesmo produto quando a descrição for igual a uma já comprada e cria os demais."}})}
  function fxResumoEntrada(dec){
    var box=h("div",{class:"fxdet"}),m=dec.mercado,rs=dec.resumo;
    box.appendChild(h("h4",{text:"Compra no Mercado"}));
    box.appendChild(fxLinha("Estabelecimento",m.nome+(m.tipo==="cnpj"?" · já cadastrado (mesmo CNPJ)":m.tipo==="nome"?" · já cadastrado (nome parecido, "+m.pontos+"%)":" · novo estabelecimento")));
    dec.itens.forEach(function(x){
      var t=x.tipo==="nova"?"produto novo “"+x.nome+"” · "+x.categoria+(x.revisar?" (categoria a revisar)":"")+(x.ambigua?" · parecido com mais de um produto: não escolhi nenhum":""):"produto “"+x.nome+"” · já existe"+(x.tipo==="aproximada"?" ("+x.pontos+"% parecido)":"");
      box.appendChild(h("div",{class:"sub",text:(x.ordem+1)+". "+(x.descricao||"(sem descrição)")+" → "+t}))});
    box.appendChild(h("p",{class:"sub",text:rs.existentes+(rs.existentes===1?" item usa":" itens usam")+" produto já cadastrado; "+rs.novos+(rs.novos===1?" produto novo será criado":" produtos novos serão criados")+". Depois você pode trocar o produto de qualquer item no Mercado: a nota fiscal não muda."}));
    return box}
  function fxLinkMercado(){return h("a",{href:"#mercado",class:"ghostbtn",style:"display:inline-block;margin-top:8px",text:"Abrir o Mercado"})}
  /* "Tentar de novo": retoma o que já foi confirmado, sem repetir a leitura e sem pedir outra confirmação */
  function fxBotaoTentar(notaId,nota,st,aoFim){
    var b=h("button",{type:"button",class:"ghostbtn pri",text:"Tentar de novo"});
    b.onclick=function(){if(b.disabled)return;b.disabled=true;st.className="sub";st.textContent="Concluindo a entrada no Mercado…";
      fxEntradaMercado(notaId,nota).then(function(x){var bom=x.estado==="concluida"||x.estado==="ja_no_mercado";
        st.className=bom?"qrok":"qrwarn";st.textContent=(bom?"✓ ":"⚠ ")+x.texto+(x.confirmacao?" "+x.confirmacao:"");
        if(bom){b.textContent="✓ Lançada";if(aoFim)aoFim(x)}else b.disabled=false})};
    return b}
  /* o resultado único de uma nota confirmada: sucesso, ou a pendência técnica específica com o "Tentar de novo" */
  function fxResultadoBloco(rc){
    var c=rc.conf,bom=!!c.ok,box=h("div",{class:"fxsalvar"}),st=h("p",{class:"sub",role:"status"});
    box.appendChild(h("p",{class:bom?"qrok":"qrwarn",role:"status",text:(bom?"✓ ":"⚠ ")+rc.texto}));
    if(bom)box.appendChild(fxLinkMercado());
    else if(c.tentar)box.appendChild(h("div",{class:"vfil"},fxBotaoTentar(rc.notaId,rc.nota,st,function(){if(FX.recarregar)FX.recarregar()})));
    box.appendChild(st);return box}
  /* a duplicidade com o que já existe, para os avisos aparecerem ANTES do "Estou de acordo" (XML: o SHA-256 do arquivo entra na conferência) */
  function fxDuplicarXML(r){
    return r.arquivo.arrayBuffer().then(function(buf){return crypto.subtle.digest("SHA-256",buf)}).then(function(dg){var sha=fxHex(dg);
      return fxExistentes(r.nota,sha).then(function(ex){r.dup=NUCLEO.nfDuplicidade(r.nota,ex.dados,{sha256:sha});r.dupAvisos=ex.avisos;return r})}).then(null,function(){
      r.dup=null;r.dupAvisos=["Não consegui conferir duplicidade agora; ela será conferida de novo ao confirmar."];return r})}
  /* o único botão de confirmação humana. Só existe quando há condição real para registrar: dados essenciais, conta que fecha, nota não cancelada/rejeitada, sem conflito de chave e sem duplicidade. A confiança da IA só informa. */
  function fxBlocoConfirmar(r){
    var n=r.nota,ia=r.ia,box=h("div",{class:"fxsalvar"}),st=h("p",{class:"sub",role:"status"}),av=h("div"),pv=h("div"),
      btn=h("button",{type:"button",class:"ghostbtn pri",text:"Estou de acordo"}),bw=h("div",{class:"vfil"},btn),
      opc=ia?{confianca:ia.confianca,qr_conflitos:fxQrConflitos(r)}:undefined,dec0=NUCLEO.nfDecisaoGravacao(n,r.dup||null,opc);
    if(r.confirmado)return fxResultadoBloco(r.confirmado);
    if(!dec0.pode&&dec0.bloqueios_dup.length<dec0.bloqueios.length)return h("div",{class:"fxsalvar"},h("div",{class:"fxaviso fxbloq",role:"status",text:"Ainda não dá para confirmar: "+dec0.bloqueios.join(" ")+" Leia de novo com outra foto"+(ia?" ou corrija os dados lidos no formulário acima":"")+". Nada foi enviado nem gravado."}));
    box.appendChild(av);box.appendChild(pv);
    box.appendChild(h("p",{class:"sub",text:"Ao clicar, o RAC grava a nota na Central Fiscal (o original vai ao cofre privado) e lança a compra no Mercado"+(dec0.modo==="pendente_fiscal"?". A situação fiscal pendente não impede a entrada: ela continua pendente na Central Fiscal até a autorização":"")+". Não cria despesa."}));
    btn.disabled=true;box.appendChild(bw);box.appendChild(st);
    function pronto(){
      var dec=NUCLEO.nfDecisaoGravacao(n,r.dup||null,opc);
      (r.dupAvisos||[]).forEach(function(a){av.appendChild(h("div",{class:"fxaviso",text:a}))});
      dec.avisos_dup.forEach(function(a){av.appendChild(h("div",{class:"fxaviso",text:a}))});
      if(dec.bloqueios_dup.length){dec.bloqueios_dup.forEach(function(b){av.appendChild(h("div",{class:"fxaviso fxbloq",text:b+" Nada será enviado."}))});
        var at=ia&&r.dup&&r.dup.atualizar_situacao;if(at)av.appendChild(fxBotaoAtualizarDup(r,at));btn.hidden=true;return}
      if(r.entrada)pv.appendChild(fxResumoEntrada(r.entrada));
      if(r.entradaAviso)av.appendChild(h("div",{class:"fxaviso",text:r.entradaAviso}));
      btn.disabled=false}
    (r.arquivo&&r.dup===undefined?fxDuplicarXML(r):Promise.resolve(r)).then(function(){return fxPrepararEntrada(n)}).then(function(x){r.entrada=x.dec;r.entradaAviso=x.aviso}).then(pronto,pronto);
    btn.onclick=function(){
      if(btn.disabled||r.salvando)return;
      btn.disabled=true;st.className="sub";st.textContent="Gravando na Central Fiscal e lançando no Mercado…";
      var entrada=NUCLEO.nfEntradaPayload(r.entrada||{mercado:{},itens:[]});
      (ia?fxSalvarDoc(r,entrada):fxSalvar(r,true,entrada)).then(function(x){
        var c=x.confirmar||null;
        if(x.estado==="erro"||x.estado==="invalido"||x.estado==="ocupado"){st.className="qrwarn";st.textContent="⚠ "+x.mensagem;btn.disabled=false;return}
        if(!c||!c.gravada){st.className="qrwarn";st.textContent="ℹ "+x.mensagem;btn.hidden=true;return}
        r.confirmado={texto:x.mensagem,conf:c,notaId:c.id,nota:{id:c.id,situacao:n.situacao}};
        if(FX.recarregar)FX.recarregar();
        var novo=fxResultadoBloco(r.confirmado);bw.hidden=true;btn.hidden=true;st.textContent="";
        if(box.parentNode&&box.parentNode.replaceChild)box.parentNode.replaceChild(novo,box);else box.appendChild(novo)})};
    return box}
  /* na lista de notas gravadas: a entrada no Mercado de cada nota (lançada, falta concluir, ou nota antiga que ainda pede o "Estou de acordo" dela) */
  function fxBlocoEntradaLista(n,ent,entOk){
    if(!entOk)return null;
    var box=h("div",{class:"fxdet"}),st=h("p",{class:"sub",role:"status"}),e=ent&&ent.estado;
    box.appendChild(h("h4",{text:"Entrada no Mercado"}));
    if(e==="concluida"||e==="ja_no_mercado"){
      box.appendChild(h("p",{class:"qrok",role:"status",text:"✓ "+(e==="ja_no_mercado"?"A compra desta nota já estava no Mercado":"Lançada no Mercado")+(ent.confirmado_em?" · “Estou de acordo” em "+fxFmtDH(ent.confirmado_em):"")+"."}));
      if(ent.revisar)box.appendChild(h("div",{class:"fxaviso fxbloq",text:"Revisar: a nota fiscal foi "+(ent.revisar==="nota_rejeitada"?"rejeitada":"cancelada")+" depois da entrada. A compra foi mantida no Mercado."}));
      box.appendChild(fxLinkMercado());return box}
    if(e==="pendente"||e==="falhou"){
      var est=NUCLEO.nfEstadosNota(n,ent).filter(function(x){return x.chave==="mercado"})[0]||{};
      box.appendChild(h("p",{class:"qrwarn",role:"status",text:"⚠ "+(est.automatica?"Aguardando nova tentativa: a nota está gravada e confirmada, o lançamento no Mercado não foi concluído"+(ent.erro?" ("+ent.erro+")":"")+". O RAC tenta de novo sozinho"+(est.proxima_em?" (próxima por volta de "+fxFmtDH(est.proxima_em)+")":"")+"; você não precisa confirmar outra vez.":"Falha na entrada: a nota está gravada e confirmada, mas o lançamento no Mercado não foi concluído"+(ent.erro?": "+ent.erro:".")+" As tentativas automáticas se esgotaram: use “Tentar de novo” (não precisa ler nem confirmar outra vez).")}));
      box.appendChild(h("div",{class:"vfil"},fxBotaoTentar(n.id,n,st,function(){if(FX.recarregar)FX.recarregar()})));box.appendChild(st);return box}
    if(n.situacao==="cancelada"||n.situacao==="rejeitada"){box.appendChild(h("p",{class:"sub",text:"Nota "+(NUCLEO.NF_SITUACOES[n.situacao]||n.situacao).toLowerCase()+": não vale como compra e não entra no Mercado."}));return box}
    /* nota gravada antes da confirmação única: cada nota pede o seu "Estou de acordo" */
    var btn=h("button",{type:"button",class:"ghostbtn pri",text:"Estou de acordo"}),pv=h("div"),dec=null;
    btn.disabled=true;
    box.appendChild(h("p",{class:"sub",text:"Esta nota foi gravada antes da entrada automática e ainda não está no Mercado. Confira os itens e clique em “Estou de acordo” para lançá-la (não cria despesa; a situação fiscal não impede)."}));
    box.appendChild(pv);box.appendChild(h("div",{class:"vfil"},btn));box.appendChild(st);
    fxLer("notas_fiscais_itens","ordem,descricao,unidade","nota_id",n.id,{col:"ordem",asc:true,lim:1000}).then(function(its){
      return fxPrepararEntrada({emitente:{nome:n.emitente_nome,cnpj:n.emitente_cnpj},itens:its.map(function(i){return {descricao:i.descricao,unidade:i.unidade}})})}).then(function(x){
      dec=x.dec;if(dec)pv.appendChild(fxResumoEntrada(dec));else st.textContent=x.aviso;btn.disabled=false},function(){st.textContent="Não consegui ler os itens da nota agora.";btn.disabled=false});
    btn.onclick=function(){if(btn.disabled)return;btn.disabled=true;st.className="sub";st.textContent="Lançando no Mercado…";
      fxEntradaMercado(n.id,n,NUCLEO.nfEntradaPayload(dec||{mercado:{},itens:[]})).then(function(x){var bom=x.estado==="concluida"||x.estado==="ja_no_mercado";
        st.className=bom?"qrok":"qrwarn";st.textContent=(bom?"✓ ":"⚠ ")+x.texto+(x.confirmacao?" "+x.confirmacao:"");
        if(bom){btn.textContent="✓ Lançada";box.appendChild(fxLinkMercado());if(FX.recarregar)FX.recarregar()}else btn.disabled=false})};
    return box}
  /* ---------- tela da gravação de foto ou PDF ---------- */
  function fxOriginais(r){
    var box=h("div",{class:"fxdet"});r.urls=r.urls||[];
    (r.fotos||[]).forEach(function(f,i){var u=r.urls[i];
      if(!u){try{u=typeof URL!=="undefined"&&URL.createObjectURL?URL.createObjectURL(f):null}catch(e){u=null}r.urls[i]=u}
      if(u)box.appendChild(h("div",null,h("a",{href:u,target:"_blank",rel:"noopener",text:"Ver o original: "+(f.name||"arquivo "+(i+1))})))});
    return box}
  function fxBotaoAtualizarDup(r,at){
    var fonte=r.tipoDoc==="pdf"?"pdf":"foto",btn=h("button",{type:"button",class:"ghostbtn",text:"Atualizar a nota já gravada: "+(NUCLEO.NF_SITUACOES[at.de]||at.de)+" → "+(NUCLEO.NF_SITUACOES[at.para]||at.para)}),st=h("p",{class:"sub",role:"status"});
    btn.onclick=function(){if(btn.disabled)return;btn.disabled=true;st.textContent="Atualizando…";
      fxAtualizarSituacao({id:at.id,situacao:at.de},{para:at.para,protocolo:r.nota.protocolo,evidencia:"lido de "+(fonte==="pdf"?"PDF":"foto"),fonte:fonte}).then(function(x){
        st.textContent=x.mensagem;btn.disabled=x.estado==="atualizada"||x.estado==="sem_mudanca"||x.estado==="incerto";if(FX.recarregar&&x.estado==="atualizada")FX.recarregar()})};
    return h("div",null,btn,st)}

  /* ---------- notas já gravadas: situação fiscal, histórico, tentativas e original (dono e casa leem as notas, as tentativas e o histórico) ---------- */
  var FX_NOTA_COLS="id,chave,modelo,serie,numero,emitente_nome,emitente_cnpj,data_emissao,valor_total,situacao,protocolo,formato_origem,requer_conferencia,conferida_em";
  function fxFmtDH(t){t=String(t||"");if(!t)return "";var d=new Date(t),p=function(n){return ("0"+n).slice(-2)};
    if(isNaN(d.getTime()))return dataBR(t.slice(0,10))+" "+t.slice(11,16);     /* o banco guarda em UTC: mostra no horário do aparelho */
    return p(d.getDate())+"/"+p(d.getMonth()+1)+"/"+d.getFullYear()+" "+p(d.getHours())+":"+p(d.getMinutes())}
  function fxAbrirOriginal(path,st){
    st.textContent="Gerando o link temporário…";
    Promise.resolve(SB.storage.from("familia").createSignedUrl(path,300)).then(function(r){
      if(r&&r.error)throw r.error;var u=r&&r.data&&(r.data.signedUrl||r.data.signedURL);if(!u)throw new Error("sem link");
      st.textContent="Link aberto (vale 5 minutos).";window.open(u,"_blank","noopener")}).then(null,function(e){st.textContent="Não consegui abrir o original: "+(e&&e.message||e)})}
  function fxLinkOriginal(d,st){var b=h("button",{type:"button",class:"ghostbtn",text:"Abrir original: "+(d.nome||"arquivo")+" ("+Math.round((d.tamanho||0)/1024)+" KB)"});b.onclick=function(){fxAbrirOriginal(d.path,st)};return b}
  function fxLinhaTentativa(t,st){
    var l=h("div",{class:"sub",text:fxFmtDH(t.criado_em)+" · "+t.origem+" · "+String(t.resultado).replace("_"," ")+" · conta "+String(t.classe).replace("_"," ")+" · confiança "+Math.round(t.confianca*100)+"%"+(t.revisada?" (revisada)":"")+(t.situacao_fiscal?" · "+(NUCLEO.NF_SITUACOES[t.situacao_fiscal]||t.situacao_fiscal):"")}),
      w=h("div",null,l);
    (t.motivos||[]).forEach(function(m){w.appendChild(h("div",{class:"fxaviso",text:String(m)}))});
    (t.docs||[]).forEach(function(d){w.appendChild(h("div",null,fxLinkOriginal(d,st)))});
    return w}
  /* conferir (nota autorizada de foto/PDF) e mudar a situação (pendente → autorizada/cancelada/rejeitada; autorizada → cancelada): dono e casa; o banco confere MFA e as transições */
  function fxAcoesNota(n,foto,corpo,st){
    var trans=NUCLEO.NF_TRANSICOES[n.situacao]||[];
    if(foto&&n.situacao==="autorizada"&&!n.conferida_em){
      var cb=h("button",{type:"button",class:"ghostbtn pri",text:"Marcar como conferida"});
      corpo.appendChild(h("h4",{text:"Conferência"}));
      corpo.appendChild(h("p",{class:"sub",text:"A nota já foi confirmada com “Estou de acordo”. Esta marca só registra, com o seu nome e a data, que a nota autorizada foi conferida; depois dela a nota não muda."}));
      corpo.appendChild(h("div",{class:"vfil"},cb));
      cb.onclick=function(){cb.disabled=true;st.textContent="Conferindo…";
        fxConferir(n.id).then(function(x){st.textContent=x.mensagem;cb.disabled=x.estado==="conferida";if(x.estado==="conferida"&&FX.recarregar)FX.recarregar()})}}
    if(trans.length){
      var sel=h("select",{"aria-label":"Nova situação"}),prot=h("input",{type:"text",inputmode:"numeric","aria-label":"Protocolo de autorização (15 dígitos)",placeholder:"Protocolo (15 dígitos, para autorizar)"}),
        ev=h("input",{type:"text","aria-label":"Evidência",maxlength:"200",placeholder:"Evidência (opcional)"}),ub=h("button",{type:"button",class:"ghostbtn pri",text:"Atualizar situação"});
      trans.forEach(function(s){sel.appendChild(h("option",{value:s,text:NUCLEO.NF_SITUACOES[s]}))});
      corpo.appendChild(h("h4",{text:"Atualizar a situação fiscal"}));
      corpo.appendChild(h("div",null,sel));corpo.appendChild(h("div",null,prot));corpo.appendChild(h("div",null,ev));corpo.appendChild(h("div",{class:"vfil"},ub));
      ub.onclick=function(){if(ub.disabled)return;ub.disabled=true;st.textContent="Atualizando…";
        fxAtualizarSituacao({id:n.id,situacao:n.situacao},{para:sel.value,protocolo:prot.value,evidencia:ev.value,fonte:n.formato_origem==="pdf"?"pdf":n.formato_origem==="imagem"?"foto":"manual"}).then(function(x){
          st.textContent=x.mensagem;ub.disabled=x.estado==="atualizada"||x.estado==="sem_mudanca"||x.estado==="incerto";if(x.estado==="atualizada"&&FX.recarregar)FX.recarregar()})}}}
  function fxDetalheNota(n,tent,dono,corpo,ents){
    var st=h("p",{class:"sub",role:"status"}),foto=!!n.formato_origem&&n.formato_origem!=="xml";
    corpo.appendChild(h("p",{class:"sub",text:(n.chave?"Chave: "+fxGrupos(n.chave,4)+". ":"Sem chave. ")+(n.protocolo?"Protocolo "+n.protocolo+". ":"")+"Origem: "+(n.formato_origem==="xml"?"XML":n.formato_origem==="pdf"?"PDF":n.formato_origem==="imagem"?"foto":"?")+"."}));
    corpo.appendChild(st);
    Promise.all([fxLer("notas_fiscais_docs","id,tipo,nome,path,tamanho,mime","nota_id",n.id),dono?fxLer("notas_fiscais_vinculos","id,modulo,registro_id,valido,criado_em","nota_id",n.id).then(null,function(){return null}):Promise.resolve(null),dono?fxLer("notas_fiscais_situacoes","de,para,protocolo,evidencia,origem,fonte,criado_em","nota_id",n.id,{col:"criado_em",asc:true,lim:100}).then(null,function(){return null}):Promise.resolve(null),
      dono?fxLer("notas_fiscais_consultas","resultado,origem,cstat,motivo,mudou,consultado_em,proxima_em,encerrada","nota_id",n.id,{col:"consultado_em",asc:false,lim:5}).then(null,function(){return null}):Promise.resolve(null)]).then(function(l){
      var docs=l[0],vincs=l[1],hist=l[2],cons=l[3];
      corpo.appendChild(h("h4",{text:"Documento original"}));
      if(!docs.length)corpo.appendChild(h("p",{class:"sub",text:"Nenhum documento registrado."}));
      docs.forEach(function(d){corpo.appendChild(h("div",null,fxLinkOriginal(d,st)))});
      if(dono){corpo.appendChild(h("h4",{text:"Histórico da situação fiscal"}));
        if(!hist||!hist.length)corpo.appendChild(h("p",{class:"sub",text:hist?"Sem mudanças registradas (nota de XML não guarda o histórico da gravação).":"Não consegui ler o histórico."}));
        else hist.forEach(function(x){corpo.appendChild(h("div",{class:"sub",text:fxFmtDH(x.criado_em)+" · "+(x.de?(NUCLEO.NF_SITUACOES[x.de]||x.de)+" → ":"gravada como ")+(NUCLEO.NF_SITUACOES[x.para]||x.para)+(x.protocolo?" · protocolo "+x.protocolo:"")+" · "+x.origem+" ("+x.fonte+")"+(x.evidencia?" · "+x.evidencia:"")}))});
        corpo.appendChild(h("h4",{text:"Validação fiscal oficial (rotina diária)"}));
        corpo.appendChild(h("p",{class:"sub",text:NUCLEO.nfConsultaTexto(cons&&cons[0]||null,cons!==null&&cons!==undefined,n)}));
        var mine=(tent||[]).filter(function(t){return t.nota_id===n.id});
        if(mine.length){corpo.appendChild(h("h4",{text:"Tentativas de leitura"}));mine.forEach(function(t){corpo.appendChild(fxLinhaTentativa(t,st))})}
        fxAcoesNota(n,foto,corpo,st);
        /* entrada no Mercado: não espera a SEFAZ; cancelada/rejeitada não entra; quem falhou tem "Tentar de novo"; nota antiga pede o "Estou de acordo" dela */
        var bl=fxBlocoEntradaLista(n,ents&&ents[n.id]||null,ents!==null&&ents!==undefined);if(bl)corpo.appendChild(bl)}})
    .then(null,function(e){st.textContent="Não consegui ler os detalhes: "+(e&&e.message||e)})}
  function fxListaPainel(){
    var p=h("div",{class:"panel"}),corpo=h("div"),st=h("p",{class:"sub",role:"status"}),dono=typeof isDonoOuCasa==="function"&&isDonoOuCasa();
    p.appendChild(h("h3",{text:"Notas já gravadas"}));
    p.appendChild(h("p",{class:"sub",text:"Cada nota mostra quatro coisas separadas: a leitura, a sua confirmação, a situação fiscal (SEFAZ) e a entrada no Mercado. Abra uma nota para ver o documento original"+(dono?", o histórico da situação fiscal e as tentativas de leitura":"")+"."}));
    p.appendChild(st);p.appendChild(corpo);
    function linha(n,tent,ents){
      var est=NUCLEO.nfEstadosNota(n,ents?ents[n.id]:null).filter(function(x){return ents||x.chave!=="mercado"}),d=h("details",{class:"fxdet"}),cor=h("div"),aberto=false,sm=h("summary",null,h("span",{text:(n.emitente_nome||"Emitente não identificado")+" · "+(n.valor_total!=null?fxMoeda(n.valor_total):"—")+" · "+(n.data_emissao?dataBR(n.data_emissao):"sem data")+" "}));
      est.forEach(function(x){sm.appendChild(h("span",{class:"fxchip "+x.tom,title:x.chave,text:x.rotulo}))});     /* leitura, conferência, situação fiscal e Mercado: quatro coisas separadas */
      d.appendChild(sm);d.appendChild(cor);
      d.ontoggle=function(){if(d.open&&!aberto){aberto=true;fxDetalheNota(n,tent,dono,cor,ents)}};
      return h("li",null,d)}
    function carregar(){
      st.textContent="Carregando as notas…";
      return Promise.all([fxLer("notas_fiscais",FX_NOTA_COLS,null,null,{col:"data_emissao",asc:false,lim:60}),
        dono?fxLer("notas_fiscais_tentativas","id,nota_id,origem,resultado,classe,situacao_fiscal,confianca,revisada,motivos,docs,criado_em",null,null,{col:"criado_em",asc:false,lim:60}).then(null,function(){return null}):Promise.resolve([]),
        fxLer("notas_fiscais_entradas","nota_id,estado,confirmado_em,mercado_nota_id,erro,revisar,tentativas,proxima_em,origem",null,null,{col:"criado_em",asc:false,lim:500}).then(null,function(){return fxLer("notas_fiscais_entradas","nota_id,estado,confirmado_em,mercado_nota_id,erro,revisar,tentativas",null,null,{col:"criado_em",asc:false,lim:500}).then(null,function(){return null})})]).then(function(r){
        var notas=r[0]||[],tent=r[1],ents=null,sem=(tent||[]).filter(function(t){return !t.nota_id&&(t.resultado==="bloqueada"||t.resultado==="duplicada")});
        corpo.innerHTML="";st.textContent=notas.length?"":"Nenhuma nota gravada ainda.";
        if(r[2]){ents={};r[2].forEach(function(x){ents[x.nota_id]=x})}
        if(ents===null)corpo.appendChild(h("div",{class:"fxaviso",text:"A entrada no Mercado ainda não está disponível no banco (migration 059 pendente) ou não consegui ler agora."}));
        else{var falta=notas.filter(function(n){var e=ents[n.id];return e?(e.estado==="pendente"||e.estado==="falhou"):(n.situacao!=="cancelada"&&n.situacao!=="rejeitada")});
          if(falta.length)corpo.appendChild(h("div",{class:"fxaviso",role:"status",text:falta.length+(falta.length===1?" nota ainda não está lançada no Mercado":" notas ainda não estão lançadas no Mercado")+": abra a nota para concluir."}))}
        var ul=h("ul",{class:"fxlista"});notas.forEach(function(n){ul.appendChild(linha(n,tent||[],ents))});corpo.appendChild(ul);
        if(dono&&tent===null)corpo.appendChild(h("div",{class:"fxaviso",text:"Não consegui ler as tentativas de leitura agora (faça login de novo e confirme o código de segurança, se pedido)."}));
        if(sem.length){var s2=h("div",{class:"fxdet"}),sst=h("p",{class:"sub",role:"status"});s2.appendChild(h("h4",{text:"Tentativas sem nota (bloqueadas ou duplicadas): "+sem.length}));
          sem.forEach(function(t){s2.appendChild(fxLinhaTentativa(t,sst))});s2.appendChild(sst);corpo.appendChild(s2)}
      }).then(null,function(e){st.textContent="Não consegui ler as notas: "+(e&&e.message||e)})}
    FX.recarregar=carregar;carregar();
    return p}
  function fxExtTipo(f){var e=fxExt(f.name),t=String(f.type||"");return e==="xml"||/xml/i.test(t)?"xml":e==="pdf"||t==="application/pdf"?"pdf":/^image\//.test(t)||/^(jpe?g|png|webp|heic|heif)$/.test(e)?"foto":"outro"}
  /* um XML = uma nota; um PDF = uma nota; fotos = UMA nota (até 4) ou, se a pessoa marcar, uma nota por foto */
  function fxTarefas(files,separadas){
    var l=Array.prototype.slice.call(files||[]),xml=[],pdf=[],fot=[],out=[],t=[],erro=null;
    l.forEach(function(f){var k=fxExtTipo(f);if(k==="xml")xml.push(f);else if(k==="pdf")pdf.push(f);else if(k==="foto")fot.push(f);else out.push(f)});
    xml.slice(0,20).forEach(function(f){t.push({tipo:"xml",arquivos:[f]})});
    pdf.forEach(function(f){t.push({tipo:"pdf",arquivos:[f]})});
    if(fot.length){if(separadas)fot.forEach(function(f){t.push({tipo:"foto",arquivos:[f]})});
      else if(fot.length>4)erro="São "+fot.length+" fotos e uma nota aceita até 4. Marque “Cada foto é uma nota separada” ou escolha menos fotos.";else t.push({tipo:"foto",arquivos:fot})}
    return {tarefas:t,outros:out,erro:erro,excedeu:xml.length>20}}
  function fxLerTarefa(t){
    if(t.tipo==="xml")return fxLerArquivo(t.arquivos[0]);
    return fxIA(t.arquivos).then(function(x){return x.r?x.r:{nome:t.arquivos.map(function(f){return f.name||"arquivo"}).join(", ").slice(0,160),erro:x.mensagem}})}
  /* lê as notas escolhidas, uma por vez, mostrando o progresso e cada cartão assim que fica pronto. Nada é gravado: quem grava é o "Estou de acordo" de cada nota. */
  function fxFila(files,separadas,corpo,st){
    var pl=fxTarefas(files,separadas),total=pl.tarefas.length,lista=[],vistas={};
    corpo.innerHTML="";
    if(pl.erro){st.textContent=pl.erro;return Promise.resolve([])}
    if(!total&&!pl.outros.length){st.textContent="Escolha ao menos uma nota.";return Promise.resolve([])}
    pl.outros.forEach(function(f){corpo.appendChild(fxCartao({nome:f.name||"arquivo",erro:"Tipo de arquivo não aceito (use XML, PDF, JPEG, PNG ou WebP). Nada foi lido nem enviado."},false))});
    if(pl.excedeu)corpo.appendChild(fxCartao({nome:"Muitos arquivos",erro:"Só os 20 primeiros XML foram lidos."},false));
    return pl.tarefas.reduce(function(p,t,i){return p.then(function(){
      st.textContent="Lendo "+(i+1)+" de "+total+(t.tipo==="xml"?"":" (a IA lê um documento por vez; pode levar cerca de um minuto)")+"…";
      return fxLerTarefa(t).then(function(r){var k=r.nota&&r.nota.chave,rep=!!(k&&vistas[k]);if(k)vistas[k]=1;lista.push(r);corpo.appendChild(fxCartao(r,rep))},
        function(e){corpo.appendChild(fxCartao({nome:"documento",erro:"Não consegui ler: "+(e&&e.message||e)},false))})})},Promise.resolve()).then(function(){
      var ok=lista.filter(function(r){return r.nota}).length;FX.lote=lista;
      st.textContent=ok?ok+(ok===1?" nota lida":" notas lidas")+" de "+total+". Confira cada uma e clique em “Estou de acordo”: nada foi gravado ainda.":"Nenhuma nota foi lida. Veja os avisos abaixo.";return lista})}
  function renderFiscal(){
    var root=$("#fiscal-view");root.innerHTML="";
    var casa=typeof isDonoOuCasa==="function"&&isDonoOuCasa(),
      topo=panel("Central Fiscal","Escolha uma ou várias notas (XML, PDF ou foto). O RAC lê, mostra o que entendeu e, se estiver tudo certo, você clica em “Estou de acordo”: a nota é gravada na Central Fiscal e a compra é lançada no Mercado, sem criar despesa. Nada é gravado antes do seu clique."),
      sel=h("input",{type:"file",accept:casa?".xml,text/xml,application/xml,image/jpeg,image/png,image/webp,application/pdf,.pdf":".xml,text/xml,application/xml",multiple:"multiple","aria-label":"Escolher notas fiscais (XML, PDF ou foto)"}),
      cam=casa?h("input",{type:"file",accept:"image/*",capture:"environment","aria-label":"Fotografar a nota"}):null,
      sep=h("input",{type:"checkbox","aria-label":"Cada foto é uma nota separada"}),lerb=h("button",{type:"button",class:"ghostbtn pri",text:"Ler as notas escolhidas"}),
      st=h("p",{class:"sub",role:"status"}),corpo=h("div",{class:"stack"}),ocupado=false;
    function arquivos(){var a=[];[sel,cam].forEach(function(i){if(i&&i.files)Array.prototype.forEach.call(i.files,function(f){a.push(f)})});return a}
    function ler(){
      if(ocupado)return;var fs=arquivos();if(!fs.length){st.textContent="Escolha ao menos uma nota.";return}
      ocupado=true;lerb.disabled=true;
      fxFila(fs,sep.checked,corpo,st).then(function(){ocupado=false;lerb.disabled=false},function(e){ocupado=false;lerb.disabled=false;corpo.innerHTML="";corpo.appendChild(h("div",{class:"panel"},failed(ler,e)));logErro("fiscal",e)})}
    /* só XML: lê na hora (é no próprio aparelho e não custa nada); com foto ou PDF espera o botão, porque a IA usa o orçamento da casa */
    sel.onchange=function(){var fs=arquivos();if(!fs.length)return;
      if(fs.every(function(f){return fxExtTipo(f)==="xml"}))ler();
      else st.textContent=fs.length+(fs.length===1?" arquivo escolhido":" arquivos escolhidos")+". Toque em “Ler as notas escolhidas”: foto e PDF são lidos pela IA e usam o orçamento de IA da casa."};
    lerb.onclick=ler;
    topo.appendChild(h("label",{class:"fxsel"},"Notas (XML"+(casa?", PDF ou foto":"")+"; uma ou várias):",sel));
    if(cam)topo.appendChild(h("label",{class:"fxsel"},"Ou fotografar agora:",cam));
    if(casa)topo.appendChild(h("label",{class:"fxconf"},sep,h("span",{text:" Cada foto é uma nota separada (por padrão, até 4 fotos formam uma nota só)."})));
    topo.appendChild(h("div",{class:"vfil"},lerb));topo.appendChild(st);
    topo.appendChild(h("p",{class:"sub",text:(casa?"O XML é lido neste aparelho. Foto e PDF são lidos pela IA (Claude Sonnet) com o orçamento de IA da casa, um documento por vez: nada é enviado antes do clique em ler. Um PDF vale uma nota; JPEG, PNG ou WebP, até 4 fotos por nota. O texto do PDF perde o CPF antes de sair do aparelho; numa foto não dá para apagar o CPF da imagem, então evite enquadrá-lo. ":"Fotos e PDF ainda não são lidos. ")+"O XML original, inclusive com CPF, fica no cofre privado como está; nenhum CPF vai para campo do banco. Se a leitura errar, tire outra foto e leia de novo; se continuar errando, faça a entrada manual dos itens no Mercado."}));
    root.appendChild(topo);root.appendChild(corpo);
    if(casa)root.appendChild(fxListaPainel())}
