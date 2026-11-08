/* Dia a Dia RAC — módulo carregado quando a seção abre. Central Fiscal (docs/fiscal.md): leitura de XML de NF-e/NFC-e, conferência na tela e, quando a pessoa
   clica em "Salvar nota", a gravação segura (Lote B): o XML original vai para o cofre privado "familia" em <dono>/notas-fiscais/<nota>/<sha256>.xml e a função do banco
   nota_fiscal_salvar grava nota, itens, pagamentos e a referência do original numa transação só (migration 034). A leitura é no próprio aparelho; nada sai dele antes do Salvar.
   Nenhuma nota gera despesa. Foto e PDF ainda não são lidos (sem OCR). Sem IA. Toda regra fica no núcleo (NUCLEO.nf*) e no banco.
   Lote 1.3: a tela mostra a validação (conta, situação fiscal, diferença) e só grava o que o núcleo permite (NUCLEO.nfDecisaoGravacao); a duplicidade é conferida antes de enviar qualquer arquivo. */
  var FX={lote:[]};
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
  function fxLote(files){
    return Array.prototype.slice.call(files,0,20).reduce(function(p,f){return p.then(function(acc){return fxLerArquivo(f).then(function(r){acc.push(r);return acc})})},Promise.resolve([]))}

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
    if(c==="PGRST202"||/Could not find the function/i.test(m))return "A gravação ainda não está disponível no banco (a migration 034 não foi aplicada).";
    if(c==="42501")return "Sem permissão para gravar (faça login de novo e confirme o código de segurança, se pedido).";
    if(c==="23514")return "O banco recusou os dados por uma regra de segurança: "+m;
    return m}
  /* remove só arquivos sem registro (o banco recusa apagar o registrado); falha na limpeza nunca vira erro da gravação */
  function fxLimpar(paths){if(!paths||!paths.length)return Promise.resolve();
    return Promise.resolve().then(function(){return SB.storage.from("familia").remove(paths)}).then(function(){},function(){})}
  /* ---------- duplicidade: lê o que já existe (só leitura) e entrega ao núcleo ---------- */
  function fxLer(t,cols,c,v){return Promise.resolve(SB.from(t).select(cols).eq(c,v).limit(200)).then(function(q){if(q&&q.error)throw q.error;return (q&&q.data)||[]})}
  function fxJuntar(listas,chave){var m={},o=[];listas.forEach(function(l){(l||[]).forEach(function(x){var k=x&&x[chave];if(k==null)return;if(!m[k]){m[k]={};o.push(m[k])}Object.keys(x).forEach(function(c){m[k][c]=x[c]})})});return o}
  /* notas_fiscais e a conferência do arquivo (SHA-256) são obrigatórias: se falharem, nada é enviado. Compras, Mercado e pedidos são melhor esforço (avisam se não leram). */
  function fxExistentes(n,sha){
    var chave=n.chave_valida&&n.chave?n.chave:null,cnpj=n.emitente&&n.emitente.cnpj,data=n.data_emissao,av=[],
      NF="id,chave,modelo,serie,numero,emitente_cnpj,data_emissao,valor_total,situacao";
    function opc(rotulo,p){return Promise.resolve(p).catch(function(){av.push("Não consegui conferir duplicidade com "+rotulo+"; vale a conferência do banco.");return []})}
    return Promise.all([
      chave?fxLer("notas_fiscais",NF,"chave",chave):[],cnpj?fxLer("notas_fiscais",NF,"emitente_cnpj",cnpj):[],fxLer("notas_fiscais_docs","nota_id,sha256","sha256",sha),
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
  function fxSalvar(r,conferir){
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
            if(!dec.pode){var a0=dup.achados.filter(function(x){return x.origem==="nota"&&x.nivel==="confirmada"})[0];
              return fim("duplicada",dec.bloqueios.join(" ")+" Nada foi enviado.",{id:a0?a0.id:null,atualizar:dup.atualizar_situacao})}
            return Promise.resolve(SB.storage.from("familia").upload(path,new Blob([buf],{type:mime}),{upsert:false,contentType:mime})).then(function(u){
              var e=u&&u.error;
              if(e&&!(/exist|duplicate|409/i.test(e.message||"")||e.statusCode==="409"))throw e;     // 409: o mesmo arquivo já está lá (tentativa anterior): segue
              enviou=!e;
              return fxRpc("nota_fiscal_salvar",g.args).then(function(d){
                var apagar=(d&&d.docs_para_apagar)||[];
                if(d&&d.criado)return fim("gravada",g.args.p_conferir?"Nota gravada e conferida.":g.modo==="pendente_fiscal"?"Nota gravada como pendente fiscal (sem validação até a autorização).":"Nota gravada (pendente de conferência).",{id:d.id,conferida:!!d.conferida,modo:g.modo,avisos:(d.avisos||[]).concat(g.avisos,avisos0),semelhantes:d.semelhantes||[]});
                if(d&&d.ja_existia)return fxLimpar(apagar).then(function(){return fim("ja_existia","Esta nota já estava gravada.",{id:d.id})});
                return fxLimpar(apagar).then(function(){return fim("duplicada","Já existe uma nota igual na Central Fiscal ("+(d&&d.motivo==="arquivo"?"o mesmo arquivo":"a mesma chave de acesso")+"). O arquivo enviado foi descartado.",{id:d&&d.id})})})})})})})
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
  function fxValidacao(n){
    var d=NUCLEO.nfDecisaoGravacao(n,null),v=d.veredito,s=v.soma,box=h("div",{class:"fxvalid"});
    box.appendChild(h("h4",{text:"Validação da nota"}));
    box.appendChild(fxLinha("Conta dos itens",v.rotulo));
    if(s.total_calculado!=null&&s.total_fiscal!=null){box.appendChild(fxLinha("Total calculado pelos itens",fxMoeda(s.total_calculado)));box.appendChild(fxLinha("Total fiscal",fxMoeda(s.total_fiscal)));box.appendChild(fxLinha("Diferença",v.diferenca_texto||"—"))}
    v.motivos.forEach(function(m){box.appendChild(h("div",{class:"fxaviso fxbloq",text:(m.tipo==="divergencia"?"Divergência: ":"Baixa confiança: ")+m.texto}))});
    v.bloqueios.forEach(function(b){box.appendChild(h("div",{class:"fxaviso fxbloq",text:b.texto}))});
    v.avisos.forEach(function(a){if((n.avisos||[]).indexOf(a)<0)box.appendChild(h("div",{class:"fxaviso",text:a}))});
    box.appendChild(fxLinha("Gravação",d.modo==="validada"?"Pode ser gravada como validada":d.modo==="pendente_fiscal"?"Só como pendente fiscal (sem validação)":"Bloqueada"));
    return box}
  function fxBlocoSalvar(r){
    var n=r.nota,dec=NUCLEO.nfDecisaoGravacao(n,null),pendFiscal=dec.modo==="pendente_fiscal",semChave=!(n.chave_valida&&n.chave),chk=h("input",{type:"checkbox"}),btn=h("button",{type:"button",class:"ghostbtn pri",text:pendFiscal?"Salvar como pendente fiscal":"Salvar na Central Fiscal"}),
      st=h("p",{class:"sub",role:"status"}),box=h("div",{class:"fxsalvar"});
    if(!dec.pode)return h("div",{class:"fxsalvar"},h("div",{class:"fxaviso fxbloq",role:"status",text:"Gravação bloqueada. "+dec.bloqueios.join(" ")+" Refaça a leitura com outro arquivo ou trate a compra por outra via. Nada foi enviado nem gravado."}));
    if(semChave||pendFiscal)chk.disabled=true;
    box.appendChild(h("label",{class:"fxconf"},chk,h("span",{text:pendFiscal?" Nota pendente fiscal: fica guardada sem conferência e sem validação até ser autorizada.":semChave?" A chave de acesso não confere: a nota é salva pendente e conferida depois.":" Conferi os dados com o documento (a conferência fica registrada com o seu nome e a data; depois dela a nota não muda)."})));
    box.appendChild(h("div",{class:"vfil"},btn));box.appendChild(st);
    btn.onclick=function(){btn.disabled=chk.disabled=true;st.textContent="Salvando…";
      fxSalvar(r,chk.checked).then(function(x){var t=x.mensagem+((x.avisos||[]).length?" Avisos: "+x.avisos.join(" "):"")+((x.semelhantes||[]).length?" Há nota parecida já gravada.":"");
        st.textContent=t;if(x.estado==="erro"||x.estado==="invalido"){btn.disabled=false;chk.disabled=semChave||pendFiscal}})};
    return box}
  function fxCartao(r,repetida){
    var n=r.nota,c=h("div",{class:"panel fxnota"});
    c.appendChild(h("h3",{text:r.nome}));
    if(r.erro){c.appendChild(h("div",{class:"fxaviso",text:r.erro}));return c}
    var em=n.emitente||{},V=n.valores||{};
    c.appendChild(h("p",{class:"sub",text:(n.tipo||"Nota")+" · nº "+(n.numero||"?")+" · série "+(n.serie||"?")+" · "+(n.data_emissao?dataBR(n.data_emissao):"data não identificada")}));
    c.appendChild(fxLinha("Situação fiscal",(NUCLEO.NF_SITUACOES[n.situacao]||n.situacao)+(n.situacao==="autorizada"?"":n.situacao==="cancelada"||n.situacao==="rejeitada"?" — não vale como compra":" — pendente de validação fiscal")));
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
    c.appendChild(fxValidacao(n));
    if(repetida)c.appendChild(h("div",{class:"fxaviso",text:"Esta chave de acesso já apareceu neste lote: provável arquivo repetido."}));
    if(r.arquivo)c.appendChild(fxBlocoSalvar(r));
    c.appendChild(h("p",{class:"sub",text:"Não gera despesa. CPF e nome do consumidor do XML não são lidos nem mostrados; o arquivo original, que os contém, é guardado inteiro no cofre privado da casa."}));
    return c}
  function fxResultado(corpo,lista){
    corpo.innerHTML="";
    var vistas={};
    lista.forEach(function(r){var k=r.nota&&r.nota.chave,rep=!!(k&&vistas[k]);if(k)vistas[k]=1;corpo.appendChild(fxCartao(r,rep))})}
  function renderFiscal(){
    var root=$("#fiscal-view");root.innerHTML="";
    var topo=panel("Central Fiscal","Confira uma nota fiscal pelo XML. A leitura acontece neste aparelho. Só quando você clica em “Salvar na Central Fiscal” o XML original vai para o cofre privado da casa e a nota é gravada; nada é lançado nas despesas.");
    var sel=h("input",{type:"file",accept:".xml,text/xml,application/xml",multiple:"multiple","aria-label":"Escolher XML de nota fiscal"}),corpo=h("div",{class:"stack"});
    sel.onchange=function(){
      if(!sel.files||!sel.files.length)return;
      corpo.innerHTML="";corpo.appendChild(h("div",{class:"panel"},loading()));
      fxLote(sel.files).then(function(l){FX.lote=l;fxResultado(corpo,l)}).catch(function(e){corpo.innerHTML="";corpo.appendChild(h("div",{class:"panel"},failed(sel.onchange,e)));logErro("fiscal",e)})};
    topo.appendChild(h("label",{class:"fxsel"},"XML da nota (um ou vários):",sel));
    topo.appendChild(h("p",{class:"sub",text:"Fotos e PDF ainda não são lidos (sem OCR). O XML original, inclusive com CPF, fica guardado como está no cofre privado; nenhum CPF vai para campo do banco."}));
    root.appendChild(topo);root.appendChild(corpo)}
