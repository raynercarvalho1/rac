/* Dia a Dia RAC — módulo carregado quando a aba Radar do Mercado abre (docs/radar.md). SÓ DO DONO: a Fernanda não vê a aba e o banco recusa (RLS).
   Cadastro de produtos (comprados ou desejados), lojas, ofertas e observações de preço; histórico por série (à vista e parcelado nunca se misturam), janelas de 30/90/180/365 dias
   e todo o histórico, ranking só com preço final confirmado e oportunidades. As regras vêm de NUCLEO.rd* (nucleo.js); o banco (043) repete as mesmas.
   Leitura automática de página: função "radar" (ainda não publicada: sem ela o botão avisa e o preenchimento é manual). IA: só sugestão, hoje indisponível (aguarda liberação).
   O CEP padrão nunca aparece na tela, em log ou em arquivo: só "cadastrado" ou "não cadastrado". */
  var RT={sb:null,user:null,d:null,aba:"oport",item:null,janela:90,serie:null,leitura:null,aviso:"",form:null,carregando:false,corpo:null,abertos:{},arquivados:false};
  var RT_ABAS=[["oport","Oportunidades"],["itens","Produtos"],["lojas","Lojas"],["ajustes","Ajustes"]];
  var RT_TIPOS_LOJA=[["varejo","Varejo online"],["marketplace","Marketplace"],["fabricante","Fabricante"],["atacado","Atacado"],["fisica","Loja física"],["outro","Outro"]];
  var RT_MEIOS=[["pix","Pix"],["boleto","Boleto"],["debito","Débito"],["credito","Crédito"],["dinheiro","Dinheiro"],["outro","Outro"]];
  var RT_FRETES=[["desconhecido","Ainda não sei (não conta como grátis)"],["confirmado","Confirmado, com valor"],["gratis_confirmado","Grátis, confirmado para o meu CEP"],["retirada","Retirada na loja (zero)"]];
  /* fontes em que a coleta automática NÃO roda (a mesma lista de supabase/functions/radar/fontes.ts; um teste exige que sejam iguais) */
  var RT_BARRADAS={"a.co":"a Amazon só permite API oficial com credencial","amazon.com.br":"a Amazon só permite API oficial com credencial","casasbahia.com.br":"o robots.txt da loja não pôde ser conferido (403)","magazineluiza.com.br":"o robots.txt da loja não pôde ser conferido (403)",
    "mercadolibre.com":"o Mercado Livre exige a API oficial com credencial","mercadolivre.com.br":"o Mercado Livre exige a API oficial com credencial","pichau.com.br":"a loja recusa leitura automática (403)","produto.mercadolivre.com.br":"o Mercado Livre exige a API oficial com credencial","terabyteshop.com.br":"o robots.txt da loja não pôde ser conferido (403)"};
  function rtBarrada(dominio){var h=String(dominio||"").toLowerCase().replace(/^www\./,"");for(var d in RT_BARRADAS)if(h===d||h.slice(-d.length-1)==="."+d)return RT_BARRADAS[d];return ""}
  var RT_EQUIV=[["confirmada","Equivalente (confirmado)"],["provavel","Provável (a confirmar)"],["nao_confirmada","Não confirmada"],["rejeitada","Rejeitada"]];

  function rtDono(){return typeof isOwner==="function"&&isOwner()}
  function rtMoeda(v){return v==null?"—":"R$ "+(+v).toFixed(2).replace(".",",").replace(/\B(?=(\d{3})+(?!\d))/g,".")}
  function rtData(iso){var d=new Date(iso);if(isNaN(d.getTime()))return "—";var p=function(n){return n<10?"0"+n:""+n};return p(d.getDate())+"/"+p(d.getMonth()+1)+"/"+d.getFullYear()}
  function rtErro(e){var m=(e&&e.message)||String(e||"erro");return /foreign key|23503|still referenced/i.test(m)?"Há ofertas ou histórico ligados a isto: não dá para excluir. Pause ou arquive.":/duplicate key|23505|unique/i.test(m)?"Isso já está registrado.":/violates check|23514/i.test(m)?"O banco recusou os valores (confira modalidade, frete e preços).":/row-level security|42501|permission denied/i.test(m)?"Sem permissão: o Radar é só do dono, com a segunda etapa (código) concluída.":m}
  function rtOk(r){if(r&&r.error)throw r.error;return r?r.data:null}
  function rtPct(p){return p==null?"":(p>0?"+":p<0?"−":"")+Math.abs(p).toFixed(1).replace(".",",")+"%"}

  /* ---------- dados ---------- */
  function rtLerTudo(sb){
    function pag(t,cols,ord){var tudo=[];function pg(i){var q=sb.from(t).select(cols);if(ord)q=q.order(ord.c,{ascending:!!ord.a});return Promise.resolve(q.range(i*1000,i*1000+999)).then(function(r){var l=rtOk(r)||[];tudo=tudo.concat(l);return l.length===1000&&i<9?pg(i+1):tudo})}return pg(0)}
    return Promise.all([pag("radar_itens","*",{c:"criado_em",a:false}),pag("radar_lojas","*",{c:"nome",a:true}),pag("radar_ofertas","*",{c:"criado_em",a:true}),pag("radar_precos","*",{c:"observado_em",a:true}),
      Promise.resolve(sb.from("radar_config").select("id,cep_padrao")).then(rtOk)]).then(function(r){
      var cfg=(r[4]||[])[0];return {itens:r[0],lojas:r[1],ofertas:r[2],precos:r[3],cepOk:!!(cfg&&cfg.cep_padrao),cfgId:cfg?cfg.id:null}})}
  function rtCfg(){var raw=(typeof PESSOAL!=="undefined"&&PESSOAL&&PESSOAL["radar-config"])||{};
    return {ia:!!(raw.ia&&raw.ia.on===true),push:!(raw.push&&raw.push.on===false),janela:[0,30,90,180,365].indexOf(+raw.janela)>=0?+raw.janela:90,vendedoresBloqueados:Array.isArray(raw.vendedoresBloqueados)?raw.vendedoresBloqueados:[]}}
  function rtPagos(){return (typeof PESSOAL!=="undefined"&&PESSOAL&&PESSOAL["radar-pagos"])||{}}
  function rtPor(l,id){for(var i=0;i<l.length;i++)if(l[i].id===id)return l[i];return null}
  function rtRecarregar(){RT.carregando=true;return rtLerTudo(RT.sb).then(function(d){RT.d=d;RT.carregando=false;rtDesenhar()},function(e){RT.carregando=false;RT.aviso="Não consegui ler o Radar: "+rtErro(e);rtDesenhar()})}

  /* ---------- gravações (cada uma valida antes e devolve uma promessa; nada é gravado se a regra recusar) ---------- */
  function rtTexto(v,max){v=String(v==null?"":v).replace(/\s+/g," ").trim();return v?v.slice(0,max):null}
  function rtSalvarItem(sb,f,id){
    var nome=rtTexto(f.nome,160);if(!nome)return Promise.reject(new Error("Dê um nome ao produto."));
    var g=String(f.gtin||"").replace(/\D/g,"");if(g&&!/^(\d{8}|\d{12,14})$/.test(g))return Promise.reject(new Error("GTIN/EAN deve ter 8, 12, 13 ou 14 dígitos."));
    var o=f.origem==="comprado"?"comprado":"monitorado";
    var linha={nome:nome,marca:rtTexto(f.marca,80),modelo:rtTexto(f.modelo,120),variante:rtTexto(f.variante,120),apresentacao:rtTexto(f.apresentacao,120),gtin:g||null,origem:o,atualizado_em:new Date().toISOString()};
    return Promise.resolve(id?sb.from("radar_itens").update(linha).eq("id",id).select("*"):sb.from("radar_itens").insert(linha).select("*")).then(rtOk)}
  function rtSalvarLoja(sb,f,id){
    var nome=rtTexto(f.nome,80);if(!nome)return Promise.reject(new Error("Dê um nome à loja."));
    var dom=rtTexto(String(f.dominio||"").toLowerCase().replace(/^https?:\/\//,"").replace(/^www\./,"").replace(/[\/?#].*$/,""),120);
    if(dom&&!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(dom))return Promise.reject(new Error("Domínio inválido (ex.: loja.com.br, sem https:// nem caminho)."));
    var linha={nome:nome,dominio:dom,tipo:f.tipo||"varejo",coleta_permitida:!!f.coleta_permitida&&!!dom&&!rtBarrada(dom),atualizado_em:new Date().toISOString()};
    return Promise.resolve(id?sb.from("radar_lojas").update(linha).eq("id",id).select("*"):sb.from("radar_lojas").insert(linha).select("*")).then(rtOk)}
  function rtSalvarOferta(sb,f){
    var u=f.url?NUCLEO.rdUrlOk(f.url):{ok:true,url:null};if(!u.ok)return Promise.reject(new Error(u.motivo));
    if(!f.item_id||!f.loja_id)return Promise.reject(new Error("Escolha o produto e a loja."));
    return Promise.resolve(sb.from("radar_ofertas").insert({item_id:f.item_id,loja_id:f.loja_id,url:u.url||null,vendedor:rtTexto(f.vendedor,120),codigo_loja:rtTexto(f.codigo_loja,80)}).select("*")).then(rtOk)}
  /* equivalência: só o dono confirma, com evidência; a sugestão por regras nunca confirma sozinha */
  function rtEquivalencia(sb,oferta,estado,evidencias){
    var ev=evidencias||oferta.evidencias||[],linha={equivalencia:estado,equivalencia_origem:"dono",evidencias:ev,confirmada_em:estado==="confirmada"?new Date().toISOString():null,atualizado_em:new Date().toISOString()};
    var chk=NUCLEO.rdEquivalencia({equivalencia:estado,equivalencia_origem:"dono",evidencias:ev,confirmada_em:linha.confirmada_em});
    if(!chk.ok)return Promise.reject(new Error(chk.erros.join(" ")));
    return Promise.resolve(sb.from("radar_ofertas").update(linha).eq("id",oferta.id).select("*")).then(rtOk)}
  function rtSituacao(sb,oferta,s){return Promise.resolve(sb.from("radar_ofertas").update({situacao:s,atualizado_em:new Date().toISOString()}).eq("id",oferta.id).select("*")).then(rtOk)}
  /* observação de preço: cópia limpa dos campos do banco; regras do núcleo antes de enviar */
  var RT_CAMPOS_PRECO=["oferta_id","coleta_id","corrige_id","observado_em","fonte","evidencia","modalidade","meio","preco_produto","parcelas","valor_parcela","total_parcelado","sem_juros","juros_mensal_pct","frete_situacao","frete_valor","frete_cep_padrao","taxas","desconto","cupom","disponibilidade"];
  function rtRegistrarPreco(sb,obs){
    var v=NUCLEO.rdValidarPreco(obs,{agora:Date.now()});if(!v.ok)return Promise.reject(new Error(v.erros.join(" ")));
    var linha={};RT_CAMPOS_PRECO.forEach(function(k){if(obs[k]!==undefined&&obs[k]!==null&&obs[k]!=="")linha[k]=obs[k]});
    return Promise.resolve(sb.from("radar_precos").insert(linha).select("*")).then(rtOk)}
  /* correção (histórico só de acréscimo): nova linha com corrige_id; a observação antiga continua no banco */
  function rtCorrigirFrete(sb,antiga,situacao,valor){
    var c={};RT_CAMPOS_PRECO.forEach(function(k){if(antiga[k]!==undefined&&antiga[k]!==null)c[k]=antiga[k]});
    c.corrige_id=antiga.id;c.coleta_id=null;c.fonte="manual";c.observado_em=new Date(Date.parse(antiga.observado_em)+1000).toISOString();
    c.evidencia=(String(antiga.evidencia||"").slice(0,400))+" · frete conferido pelo dono";c.frete_situacao=situacao;c.frete_valor=situacao==="confirmado"?valor:situacao==="desconhecido"?null:0;c.frete_cep_padrao=situacao!=="desconhecido";
    ["preco_produto","valor_parcela","total_parcelado","taxas","desconto"].forEach(function(k){if(c[k]!=null)c[k]=+c[k]});
    return rtRegistrarPreco(sb,c)}
  function rtSalvarCep(sb,texto,cfgId){
    var cep=NUCLEO.rdCep(texto);if(!cep)return Promise.reject(new Error("O CEP deve ter 8 dígitos."));
    return Promise.resolve(cfgId?sb.from("radar_config").update({cep_padrao:cep,atualizado_em:new Date().toISOString()}).eq("id",cfgId):sb.from("radar_config").insert({cep_padrao:cep})).then(rtOk)}
  /* leitura automática: a função só lê domínios das lojas cadastradas; nada é gravado aqui */
  function rtLerPagina(sb,url){
    var u=NUCLEO.rdUrlOk(url);if(!u.ok)return Promise.reject(new Error(u.motivo));
    return Promise.resolve(sb.functions.invoke("radar",{body:{tipo:"ler_url",url:u.url}})).then(function(r){
      if(r&&r.error)throw new Error("A leitura automática não está disponível (a função do Radar ainda não foi publicada ou não respondeu). Preencha à mão.");
      var d=r&&r.data;if(!d||!d.ok)throw new Error(d&&d.motivo?d.motivo:"Não consegui ler a página.");return d})}

  /* ---------- peças de tela ---------- */
  function rtCampo(rot,input){return h("label",{class:"rtcampo"},h("span",{class:"sub",text:rot}),input)}
  function rtIn(v,ph,tipo,modo){return h("input",{type:tipo||"text",value:v==null?"":String(v),placeholder:ph||"",inputmode:modo||null,autocomplete:"off"})}
  function rtSel(op,v){var s=h("select",null,op.map(function(o){return h("option",{value:o[0],text:o[1],selected:o[0]===v?"selected":null})}));s.value=v;return s}
  function rtBotao(txt,fn,cls){var b=h("button",{type:"button",class:"ghostbtn"+(cls?" "+cls:""),text:txt});b.onclick=fn;return b}
  function rtAvisar(t){RT.aviso=t||"";rtDesenhar()}
  /* mensagem junto do formulário: um erro NÃO redesenha a tela (redesenhar apagava o que a pessoa tinha digitado) */
  function rtMsg(){return h("p",{class:"sub rtmsg",role:"status"})}
  function rtFeito(p,msg,st,chave){if(st)st.textContent="Salvando…";return p.then(function(){RT.aviso=msg||"";if(chave)delete RT.abertos[chave];return rtRecarregar()},function(e){if(st)st.textContent=rtErro(e);else rtAvisar(rtErro(e))})}
  /* <details> que continua aberto quando a tela é redesenhada */
  function rtDet(chave,rot,filho){var d=h("details",{class:"rtnovo",open:RT.abertos[chave]?"open":null},h("summary",{text:rot}),filho);
    if(d.addEventListener)d.addEventListener("toggle",function(){if(d.open)RT.abertos[chave]=1;else delete RT.abertos[chave]});return d}
  function rtNum(v){return v==null?"":(+v).toFixed(2).replace(".",",")}
  function rtPagoTxt(id){var g=rtPagos()[id]||{},l=[];if(g.a_vista!=null)l.push("à vista "+rtMoeda(g.a_vista));if(g.parcelado!=null)l.push("parcelado "+rtMoeda(g.parcelado));return l.length?"Paguei: "+l.join(" · "):""}
  function rtExcluir(sb,tabela,id){return Promise.resolve(sb.from(tabela).delete().eq("id",id)).then(rtOk)}
  /* arquivar: o produto sai da lista e as ofertas dele são pausadas (nada é apagado: o histórico continua) */
  function rtArquivarItem(sb,item,arquivar){var t=new Date().toISOString();
    return Promise.resolve(sb.from("radar_itens").update({ativo:!arquivar,atualizado_em:t}).eq("id",item.id).select("*")).then(rtOk).then(function(){
      if(!arquivar)return null;return Promise.resolve(sb.from("radar_ofertas").update({situacao:"pausada",atualizado_em:t}).eq("item_id",item.id)).then(rtOk)})}
  /* oferta pelo link: se a loja do endereço ainda não existe, ela é cadastrada junto (com o domínio do próprio link) */
  function rtOfertaComLoja(sb,f,lojas){var u=f.url?NUCLEO.rdUrlOk(f.url):null;
    if(f.loja_id||!u||!u.ok)return rtSalvarOferta(sb,f);
    var m=lojas.filter(function(l){return NUCLEO.rdHostCasa(u.host,NUCLEO.rdHostDe(l))})[0];
    if(m)return rtSalvarOferta(sb,Object.assign({},f,{loja_id:m.id}));
    return rtSalvarLoja(sb,{nome:u.host.replace(/^www\./,""),dominio:u.host,tipo:"varejo"}).then(function(r){var l=r&&r[0];if(!l)throw new Error("Não consegui cadastrar a loja.");return rtSalvarOferta(sb,Object.assign({},f,{loja_id:l.id}))})}
  function rtEtiqueta(t,cls){return h("span",{class:"tag rttag"+(cls?" "+cls:""),text:t})}
  function rtNomeItem(id){var i=RT.d&&rtPor(RT.d.itens,id);return i?i.nome:"Produto"}
  function rtRotSerie(s){var m=s.modalidade==="parcelado"?"Parcelado "+s.parcelas+"x":"À vista";var meio=RT_MEIOS.filter(function(x){return x[0]===(s.meio||"outro")})[0];return m+" · "+(meio?meio[1]:"")}

  /* ---------- IA: só sugere, desligada por padrão, paga por uso, nunca grava sozinha ---------- */
  /* o texto que vai para a IA: produto cadastrado e anúncio (título, marca, modelo, GTIN, vendedor); NUNCA preço, frete, CEP ou histórico */
  function rtEntradaIA(item,oferta,ex,titulo){
    var cad={nome:item.nome,marca:item.marca,modelo:item.modelo,variante:item.variante,apresentacao:item.apresentacao,gtin:item.gtin},an={titulo:String(titulo||"").slice(0,300)};
    ex=ex||{};if(ex.marca)an.marca=ex.marca.valor;if(ex.modelo)an.modelo=ex.modelo.valor;if(ex.gtin)an.gtin=ex.gtin.valor;if(oferta&&oferta.vendedor)an.vendedor=oferta.vendedor;
    function limpo(o){var r={};Object.keys(o).forEach(function(k){if(o[k]!=null&&o[k]!=="")r[k]=o[k]});return r}
    return "CADASTRADO: "+JSON.stringify(limpo(cad))+"\nANUNCIO: "+JSON.stringify(limpo(an))}
  function rtBotaoIA(item,o,tituloIn){
    var st=rtMsg();
    if(!rtCfg().ia)return h("div",{class:"rtia"},h("button",{type:"button",class:"ghostbtn",disabled:"disabled",title:"Desligada. Ative em Ajustes: cada sugestão da IA é paga (centavos).",text:"Pedir sugestão da IA (desligada)"}));
    var b=rtBotao("Pedir sugestão da IA",function(){
      var l=RT.leitura&&RT.leitura.oferta===o.id?RT.leitura.ex:null,tit=(tituloIn&&tituloIn.value.trim())||(l&&l.titulo&&l.titulo.valor)||(l&&l.nome&&l.nome.valor)||"";
      if(!tit){st.textContent="Cole o título do anúncio (ou use “Ler da página” antes).";return}
      if(typeof racIA!=="function"){st.textContent="A IA não está disponível neste aparelho.";return}
      if(typeof confirm==="function"&&!confirm("A IA vai comparar o produto cadastrado com o anúncio. Cada sugestão é PAGA (alguns centavos de real, dentro do limite mensal da IA) e só acontece agora, porque você tocou. Continuar?"))return;
      b.disabled=true;st.textContent="Consultando a IA…";
      Promise.resolve(racIA("radar","radar.equivalencia",{texto:rtEntradaIA(item,o,l,tit),imagens:[]},{})).then(function(r){b.disabled=false;var res=r&&r.resultado;
        if(!r||!r.ok||r.modo!=="REAL"||!res||res._demo){st.textContent=(r&&r.mensagem)||"A IA não respondeu. Nada foi aplicado.";return}
        RT.iaRes={oferta:o.id,res:res,aviso:(r.avisos||[]).join(" ")};st.textContent="";rtDesenhar()},function(e){b.disabled=false;st.textContent="Não consegui falar com a IA: "+rtErro(e)})});
    return h("div",{class:"rtia"},b,st)}
  function rtPainelIA(c,o){var ia=RT.iaRes;if(!ia||ia.oferta!==o.id)return;var r=ia.res,rot=r.sugestao==="provavel"?"provável":r.sugestao==="divergente"?"divergente":"não confirmada";
    c.appendChild(h("div",{class:"rtleitura"},h("b",{text:"Sugestão da IA: "+rot+" (confiança "+Math.round((+r.confianca||0)*100)+"%)"}),h("p",{class:"sub",text:"A IA só sugere. Confirmar é decisão sua, e o preço continua vindo só do que você registrou."}),
      r.resumo?h("p",{class:"sub",text:r.resumo}):null,r.evidencias.map(function(e){return h("span",{class:"sub",text:"✓ "+e.campo+": "+e.cadastrado+" × "+e.anuncio})}),r.divergencias.map(function(e){return h("span",{class:"sub",text:"✗ "+e.campo+": "+e.cadastrado+" × "+e.anuncio})}),
      (r.incertezas||[]).map(function(t){return h("span",{class:"sub",text:"? "+t})}),ia.aviso?h("span",{class:"sub",text:"⚠ "+ia.aviso}):null));
    if(r.sugestao==="provavel"&&r.evidencias.length)c.appendChild(rtBotao("Confirmar que é o mesmo produto (decisão minha)",function(){rtFeito(rtEquivalencia(RT.sb,o,"confirmada",r.evidencias.map(function(e){return {tipo:e.campo,texto:e.cadastrado+" × "+e.anuncio,origem:"ia"}})),"Equivalência confirmada por você, com as evidências da IA.")},"pri"));
    c.appendChild(rtBotao("Rejeitar equivalência",function(){rtFeito(rtEquivalencia(RT.sb,o,"rejeitada",r.evidencias.concat(r.divergencias).map(function(e){return {tipo:e.campo,texto:e.cadastrado+" × "+e.anuncio,origem:"ia"}})),"Equivalência rejeitada.")}))}

  /* ---------- oportunidades ---------- */
  function rtAbaOport(corpo){
    var d=RT.d,cfg=rtCfg(),jan=RT.janela;
    var seg=h("div",{class:"seg",role:"group","aria-label":"Janela de comparação"},[[30,"30 dias"],[90,"90 dias"],[180,"180 dias"],[365,"365 dias"],[0,"Tudo"]].map(function(j){
      var b=h("button",{type:"button","aria-pressed":String(jan===j[0]),text:j[1]});b.onclick=function(){RT.janela=j[0];rtDesenhar()};return b}));
    var ofertas=d.ofertas.filter(function(o){var i=rtPor(d.itens,o.item_id);return i&&i.ativo!==false}),ops=NUCLEO.rdOportunidades(d.precos,ofertas,{agora:Date.now(),janela:jan,pagos:rtPagos(),vendedoresBloqueados:cfg.vendedoresBloqueados});
    var p=h("div",{class:"panel"},h("h2",{text:"Oportunidades"}),h("p",{class:"sub",text:"Preço final de hoje menor que a última observação, que o menor da janela escolhida ou que o que você pagou (na mesma modalidade). Só entra: equivalência confirmada, oferta ativa e disponível, vendedor aceitável e frete confirmado."}),seg);
    if(!ops.length)p.appendChild(h("p",{class:"empty",text:d.precos.length?"Nenhuma oportunidade agora. O histórico só cresce quando você (ou a coleta) registra preços com frete confirmado.":"Ainda não há preços registrados. Cadastre um produto, uma oferta e registre o primeiro preço."}));
    ops.forEach(function(o){var of=rtPor(d.ofertas,o.oferta_id),lj=of&&rtPor(d.lojas,of.loja_id);
      var card=h("button",{type:"button",class:"rtop"},h("b",{text:rtNomeItem(o.item_id)}),h("span",{class:"sub",text:(lj?lj.nome:"")+" · "+(o.modalidade==="parcelado"?"Parcelado "+o.parcelas+"x":"À vista")}),
        h("span",{class:"rtpreco",text:rtMoeda(o.final)}),
        o.motivos.map(function(m){return h("span",{class:"sub",text:(m.tipo==="menor_que_ultima"?"Abaixo da última observação ("+rtMoeda(m.referencia)+")":m.tipo==="menor_na_janela"?"Menor da janela ("+rtMoeda(m.referencia)+")":"Abaixo do que você pagou ("+rtMoeda(m.referencia)+")")+" · "+rtPct(m.pct)})}),
        NUCLEO.rdSuspeitas({op:o,oferta:of,loja:lj,precos:d.precos}).map(function(sn){return rtEtiqueta(sn.tipo==="queda_grande"?"queda grande: conferir se o preço está certo":sn.texto,"rtverif")}));
      card.onclick=function(){RT.item=o.item_id;RT.serie=o.serie;rtDesenhar()};
      if(window.racDica)window.racDica.ligar(card,function(){return [rtNomeItem(o.item_id),rtMoeda(o.final)+" · "+rtPct(o.pct)+" · "+rtData(o.observado_em)]});
      p.appendChild(card)});
    corpo.appendChild(p)}

  /* ---------- produtos ---------- */
  function rtFormItem(item,fechar){
    var f={nome:rtIn(item&&item.nome,"Ex.: Fone Bluetooth XYZ"),origem:rtSel([["monitorado","Quero comprar"],["comprado","Já comprei"]],item?item.origem:"monitorado"),marca:rtIn(item&&item.marca,"Marca"),modelo:rtIn(item&&item.modelo,"Modelo"),
      variante:rtIn(item&&item.variante,"Cor, voltagem, tamanho"),apresentacao:rtIn(item&&item.apresentacao,"Ex.: caixa com 12, 2 L"),gtin:rtIn(item&&item.gtin,"GTIN/EAN (8 a 14 dígitos)",null,"numeric")};
    var st=rtMsg(),salvar=rtBotao(item?"Salvar produto":"Cadastrar produto",function(){
      rtFeito(rtSalvarItem(RT.sb,{nome:f.nome.value,origem:f.origem.value,marca:f.marca.value,modelo:f.modelo.value,variante:f.variante.value,apresentacao:f.apresentacao.value,gtin:f.gtin.value},item&&item.id).then(function(r){if(fechar)fechar()}),item?"Produto salvo.":"Produto cadastrado.",st,item?null:"novo-item")},"pri");
    return h("div",{class:"rtform"},rtCampo("Nome",f.nome),rtCampo("Situação",f.origem),rtCampo("Marca",f.marca),rtCampo("Modelo",f.modelo),rtCampo("Variante",f.variante),rtCampo("Apresentação",f.apresentacao),rtCampo("GTIN/EAN",f.gtin),salvar,st)}
  function rtAbaItens(corpo){
    var d=RT.d,p=h("div",{class:"panel"},h("h2",{text:"Produtos"}));
    p.appendChild(rtDet("novo-item","＋ Novo produto",rtFormItem(null,null)));
    var arq=d.itens.filter(function(i){return i.ativo===false});
    if(arq.length)p.appendChild(rtBotao((RT.arquivados?"Ocultar":"Mostrar")+" arquivados ("+arq.length+")",function(){RT.arquivados=!RT.arquivados;rtDesenhar()}));
    if(!d.itens.length)p.appendChild(h("p",{class:"empty",text:"Nenhum produto ainda. Cadastre o que você já comprou (para comparar com o que pagou) ou o que quer comprar."}));
    d.itens.filter(function(i){return RT.arquivados||i.ativo!==false}).forEach(function(i){var of=d.ofertas.filter(function(o){return o.item_id===i.id});
      var av=NUCLEO.rdRanking(d.precos.filter(function(x){return of.some(function(o){return o.id===x.oferta_id})}),of,{modalidade:"a_vista"}).ranking[0],pa=NUCLEO.rdRanking(d.precos.filter(function(x){return of.some(function(o){return o.id===x.oferta_id})}),of,{modalidade:"parcelado"}).ranking[0];
      var c=h("button",{type:"button",class:"rtop"},h("b",{text:i.nome}),h("span",{class:"sub",text:[i.marca,i.modelo,i.variante].filter(Boolean).join(" · ")||"sem marca/modelo"}),
        h("span",{class:"sub",text:(i.origem==="comprado"?"Já comprei":"Quero comprar")+" · "+of.length+(of.length===1?" oferta":" ofertas")+(i.ativo===false?" · arquivado":"")}),rtPagoTxt(i.id)?h("span",{class:"rtpago",text:rtPagoTxt(i.id)}):null,
        h("span",{class:"rtpreco",text:"À vista: "+(av?rtMoeda(av.final):"sem preço final confirmado")}),h("span",{class:"sub",text:"Parcelado: "+(pa?rtMoeda(pa.final)+" em "+pa.parcelas+"x":"sem preço final confirmado")}));
      c.onclick=function(){RT.item=i.id;RT.serie=null;RT.leitura=null;rtDesenhar()};p.appendChild(c)});
    corpo.appendChild(p)}

  /* ---------- lojas ---------- */
  function rtAbaLojas(corpo){
    var d=RT.d,p=h("div",{class:"panel"},h("h2",{text:"Lojas"}),h("p",{class:"sub",text:"O domínio libera a leitura automática de páginas dessa loja. “Coleta automática” só deve ser marcada depois de você conferir os termos da loja; o robots.txt é sempre respeitado e nada de captcha ou login é contornado."}));
    var f={nome:rtIn("","Nome da loja"),dominio:rtIn("","Domínio (ex.: loja.com.br)"),tipo:rtSel(RT_TIPOS_LOJA,"varejo"),coleta:h("input",{type:"checkbox"})};
    var stL=rtMsg();p.appendChild(rtDet("nova-loja","＋ Nova loja",h("div",{class:"rtform"},rtCampo("Nome",f.nome),rtCampo("Domínio",f.dominio),rtCampo("Tipo",f.tipo),h("label",{class:"rtchk"},f.coleta," Coleta automática liberada (conferi os termos)"),
      rtBotao("Cadastrar loja",function(){rtFeito(rtSalvarLoja(RT.sb,{nome:f.nome.value,dominio:f.dominio.value,tipo:f.tipo.value,coleta_permitida:f.coleta.checked}),"Loja cadastrada.",stL,"nova-loja")},"pri"),stL)));
    if(!d.lojas.length)p.appendChild(h("p",{class:"empty",text:"Nenhuma loja ainda."}));
    d.lojas.forEach(function(l){var c=h("div",{class:"rtlinha"},h("b",{text:l.nome}),h("span",{class:"sub",text:(l.dominio||"sem domínio")+" · "+(l.coleta_permitida?"coleta liberada":"só manual")+(rtBarrada(l.dominio)?" · coleta automática indisponível: "+rtBarrada(l.dominio):"")}));
      c.appendChild(rtBotao(l.coleta_permitida?"Desligar coleta":"Liberar coleta",function(){if(!l.coleta_permitida&&!l.dominio){rtAvisar("Cadastre o domínio antes de liberar a coleta.");return}
        if(!l.coleta_permitida&&rtBarrada(l.dominio)){rtAvisar("Coleta automática não disponível para "+l.nome+": "+rtBarrada(l.dominio)+". Os preços dessa loja continuam manuais.");return}
        if(!l.coleta_permitida&&typeof confirm==="function"&&!confirm("Você conferiu os termos de uso de "+l.nome+" e aceita a coleta automática? O robots.txt continua sendo respeitado."))return;
        rtFeito(Promise.resolve(RT.sb.from("radar_lojas").update({coleta_permitida:!l.coleta_permitida,atualizado_em:new Date().toISOString()}).eq("id",l.id)).then(rtOk),"Loja atualizada.")}));
      if(!d.ofertas.some(function(o){return o.loja_id===l.id}))c.appendChild(rtBotao("Excluir",function(){if(typeof confirm==="function"&&!confirm("Excluir a loja "+l.nome+"? Só é possível enquanto não houver ofertas ligadas a ela."))return;rtFeito(rtExcluir(RT.sb,"radar_lojas",l.id),"Loja excluída.")},"danger"));
      p.appendChild(c)});
    corpo.appendChild(p)}

  /* ---------- ajustes: CEP privado, avisos, vendedores ---------- */
  function rtAbaAjustes(corpo){
    var d=RT.d,cfg=rtCfg(),p=h("div",{class:"panel"},h("h2",{text:"Ajustes"}));
    var cep=rtIn("","8 dígitos","text","numeric");cep.setAttribute("maxlength","9");cep.setAttribute("autocomplete","off");
    p.appendChild(h("h3",{text:"CEP padrão do frete"}));
    p.appendChild(h("p",{class:"sub",text:d.cepOk?"CEP padrão cadastrado ✓ (por segurança ele não é mostrado).":"CEP padrão ainda não cadastrado. Sem ele, o frete só pode ser confirmado à mão."}));
    p.appendChild(h("div",{class:"rtform"},rtCampo(d.cepOk?"Trocar o CEP":"Cadastrar o CEP",cep),rtBotao("Salvar CEP",function(){
      if(!NUCLEO.rdCep(cep.value)){rtAvisar("O CEP deve ter 8 dígitos.");return}
      if(d.cepOk&&typeof confirm==="function"&&!confirm("Trocar o CEP padrão? O frete das próximas observações será conferido para o novo CEP."))return;
      var v=cep.value;cep.value="";rtFeito(rtSalvarCep(RT.sb,v,d.cfgId),"CEP salvo.")},"pri")));
    var iaChk=h("input",{type:"checkbox",checked:cfg.ia?"checked":null});iaChk.checked=cfg.ia;
    p.appendChild(h("h3",{text:"IA nas sugestões de equivalência"}));
    p.appendChild(h("p",{class:"sub",text:"Desligada por padrão. Ligada, aparece o botão “Pedir sugestão da IA”: cada toque é uma chamada PAGA (alguns centavos de real, dentro do limite mensal da IA do RAC), com confirmação antes. A IA só sugere; nunca confirma, nunca mexe em preço, frete ou histórico. Sem a liberação no servidor, nada roda nem é cobrado."}));
    p.appendChild(h("div",{class:"rtform"},h("label",{class:"rtchk"},iaChk," Usar a IA nas sugestões (por minha conta e risco de custo)")));
    p.appendChild(h("h3",{text:"Avisos de oportunidade"}));
    var push=h("input",{type:"checkbox",checked:cfg.push?"checked":null});push.checked=cfg.push;
    var jan=rtSel([["30","30 dias"],["90","90 dias"],["180","180 dias"],["365","365 dias"],["0","Todo o histórico"]],String(cfg.janela)),venc=h("textarea",{rows:"3",placeholder:"Um vendedor por linha"});venc.value=cfg.vendedoresBloqueados.join("\n");
    p.appendChild(h("p",{class:"sub",text:"Só você recebe (nunca a Fernanda), no máximo 1 aviso por dia e nunca repetindo o mesmo preço. O envio depende de a função do Radar ser publicada e agendada: enquanto isso, as oportunidades aparecem só aqui na aba."}));
    p.appendChild(h("div",{class:"rtform"},h("label",{class:"rtchk"},push," Avisar por notificação"),rtCampo("Janela padrão de comparação",jan),rtCampo("Vendedores que eu não aceito",venc),
      rtBotao("Salvar ajustes",function(){if(typeof pessoalGravar==="function")pessoalGravar("radar-config",{ia:{on:iaChk.checked},push:{on:push.checked},janela:+jan.value,vendedoresBloqueados:venc.value.split("\n").map(function(x){return x.trim()}).filter(Boolean).slice(0,100)});RT.janela=+jan.value;rtAvisar("Ajustes salvos.")},"pri")));
    p.appendChild(h("h3",{text:"Leitura automática e coleta"}));
    p.appendChild(h("p",{class:"sub",text:"Funcionam só para as lojas cadastradas com domínio, em páginas que o robots.txt permite e que trazem os dados do produto (schema.org). Mercado Livre exige credencial da API oficial: não está ligado. A função do Radar ainda precisa ser publicada pelo dono."}));
    corpo.appendChild(p)}

  /* ---------- detalhe do produto ---------- */
  function rtSeriesDoItem(item){var ids={};RT.d.ofertas.forEach(function(o){if(o.item_id===item.id)ids[o.id]=o});
    var por={};NUCLEO.rdVigentes(RT.d.precos.filter(function(x){return ids[x.oferta_id]})).forEach(function(p){var k=NUCLEO.rdChaveSerie(p);(por[k]=por[k]||[]).push(p)});
    return Object.keys(por).sort().map(function(k){var l=por[k],o=ids[l[0].oferta_id],lj=rtPor(RT.d.lojas,o.loja_id);return {chave:k,obs:l,oferta:o,rotulo:(lj?lj.nome:"Loja")+" · "+rtRotSerie(l[0]),modalidade:l[0].modalidade,meio:l[0].meio,parcelas:l[0].parcelas}})}
  function rtFormPreco(oferta,pre){
    pre=pre||{};var a={modalidade:rtSel([["a_vista","À vista (Pix, boleto ou dinheiro)"],["parcelado","Parcelado"]],pre.modalidade||"a_vista"),meio:rtSel(RT_MEIOS,pre.meio||"pix"),preco:rtIn(pre.preco,"Preço do produto (R$)",null,"decimal"),
      parcelas:rtIn("","Nº de parcelas",null,"numeric"),vparcela:rtIn("","Valor de cada parcela (R$)",null,"decimal"),semjuros:h("input",{type:"checkbox"}),juros:rtIn("","Juros ao mês (%)",null,"decimal"),
      frete:rtSel(RT_FRETES,"desconhecido"),vfrete:rtIn("","Valor do frete (R$)",null,"decimal"),taxas:rtIn("","Taxas (R$)",null,"decimal"),desc:rtIn("","Desconto/cupom aplicado (R$)",null,"decimal"),cupom:rtIn("","Código do cupom (opcional)"),
      disp:rtSel([["desconhecida","Não sei"],["disponivel","Disponível"],["indisponivel","Indisponível"]],pre.disp||"desconhecida"),fonte:rtSel([["manual","Conferi na loja (link/print)"],["nota_fiscal","Nota fiscal"]],"manual"),evid:rtIn(pre.evid,"Evidência: link da página, nº da nota ou descrição do print")};
    var parcelado=h("div",{class:"rtform"},rtCampo("Parcelas",a.parcelas),rtCampo("Valor da parcela",a.vparcela),h("label",{class:"rtchk"},a.semjuros," Sem juros"),rtCampo("Juros ao mês (%)",a.juros));
    function mostrar(){parcelado.style.display=a.modalidade.value==="parcelado"?"":"none"}a.modalidade.onchange=mostrar;mostrar();
    var st=rtMsg(),enviar=rtBotao("Registrar preço",function(){
      var par=a.modalidade.value==="parcelado",pr=NUCLEO.rdCent(a.preco.value),obs={oferta_id:oferta.id,fonte:a.fonte.value,evidencia:a.evid.value,modalidade:a.modalidade.value,meio:a.meio.value,preco_produto:pr==null||isNaN(pr)?null:pr/100,
        frete_situacao:a.frete.value,frete_valor:a.frete.value==="confirmado"?(NUCLEO.rdCent(a.vfrete.value)||0)/100:a.frete.value==="desconhecido"?null:0,frete_cep_padrao:a.frete.value!=="desconhecido",taxas:(NUCLEO.rdCent(a.taxas.value)||0)/100,desconto:(NUCLEO.rdCent(a.desc.value)||0)/100,cupom:a.cupom.value,
        disponibilidade:a.disp.value,observado_em:new Date().toISOString()};
      if(par){obs.parcelas=+a.parcelas.value;obs.valor_parcela=(NUCLEO.rdCent(a.vparcela.value)||0)/100;obs.total_parcelado=obs.preco_produto;obs.sem_juros=a.semjuros.checked;if(!a.semjuros.checked&&a.juros.value)obs.juros_mensal_pct=+String(a.juros.value).replace(",",".")}
      rtFeito(rtRegistrarPreco(RT.sb,obs),"Preço registrado.",st,"preco:"+oferta.id)},"pri");
    return h("div",{class:"rtform"},rtCampo("Modalidade",a.modalidade),rtCampo("Meio de pagamento",a.meio),rtCampo("Preço do produto",a.preco),parcelado,rtCampo("Frete",a.frete),rtCampo("Valor do frete",a.vfrete),rtCampo("Taxas",a.taxas),rtCampo("Desconto/cupom",a.desc),rtCampo("Cupom",a.cupom),rtCampo("Disponibilidade",a.disp),rtCampo("Fonte",a.fonte),rtCampo("Evidência",a.evid),
      h("p",{class:"sub",text:"Frete “ainda não sei” não é frete grátis: a observação fica sem preço final e não entra no ranking nem nas oportunidades."}),enviar,st)}
  function rtGrafico(serie,agora){
    var hs=NUCLEO.rdHistorico(serie.obs,agora),pts=hs.pontos.slice(-12),campo=hs.base,max=Math.max.apply(null,pts.map(function(x){return x[campo]||0}).concat([1]));
    return h("div",{class:"vbars rtgraf"},pts.map(function(x){var v=x[campo];
      var b=h("button",{type:"button",class:"vb"+(x.final==null?" rtsem":""),"aria-label":rtData(x.iso)+": "+rtMoeda(v)},h("span",{class:"vbv",text:v==null?"—":Math.round(v).toLocaleString("pt-BR")}),
        h("span",{class:"vbt"},h("span",{class:"vbf",style:"height:"+Math.max(2,(v||0)/max*100).toFixed(1)+"%"})),vbRotulo(rtData(x.iso).slice(0,5),x.final==null?"s/ frete":"final"));
      if(window.racDica)window.racDica.ligar(b,function(){return [rtData(x.iso),(x.final!=null?"Preço final "+rtMoeda(x.final):"Preço anunciado "+rtMoeda(x.produto)+" (frete não confirmado)")]});return b}))}
  function rtHistorico(serie,corpo){
    var agora=Date.now(),hs=NUCLEO.rdHistorico(serie.obs,agora),p=h("div",{class:"rtbloco"},h("h3",{text:serie.rotulo}));
    if(hs.semFinal)p.appendChild(h("p",{class:"sub",text:"Nenhuma observação desta série tem frete confirmado: os valores abaixo são o preço anunciado, não o final."}));
    p.appendChild(h("div",{class:"kpis"},h("div",{class:"kpi"},h("span",{class:"kl",text:"Última"}),h("span",{class:"kv",text:rtMoeda(hs.ultima[hs.base])}),h("span",{class:"kn",text:rtData(hs.ultima.iso)})),
      h("div",{class:"kpi"},h("span",{class:"kl",text:"Menor registrado"}),h("span",{class:"kv",text:hs.minimo?rtMoeda(hs.minimo.valor):"—"}),h("span",{class:"kn",text:hs.minimo?rtData(hs.minimo.iso):"histórico insuficiente"})),
      h("div",{class:"kpi"},h("span",{class:"kl",text:"Maior registrado"}),h("span",{class:"kv",text:hs.maximo?rtMoeda(hs.maximo.valor):"—"}),h("span",{class:"kn",text:hs.maximo?rtData(hs.maximo.iso):"histórico insuficiente"})),
      h("div",{class:"kpi"},h("span",{class:"kl",text:"Variação"}),h("span",{class:"kv",text:hs.variacao?rtPct(hs.variacao.pct):"—"}),h("span",{class:"kn"+(hs.variacao&&hs.variacao.diferenca>0?" up":hs.variacao&&hs.variacao.diferenca<0?" down":""),text:hs.variacao?"vs observação anterior ("+rtMoeda(hs.variacao.anterior)+")":"só há uma observação"}))));
    p.appendChild(h("div",{class:"tblwrap"},h("table",{class:"tbl"},h("thead",null,h("tr",null,["Janela","Obs.","Menor","Maior","Hoje vs menor"].map(function(c,i){return h("th",{class:i?"num":"",text:c})}))),
      h("tbody",null,[30,90,180,365,"todo"].map(function(k){var j=hs.janelas[k];return h("tr",null,h("td",{text:k==="todo"?"Todo o histórico":k+" dias"}),h("td",{class:"num",text:String(j.n)}),
        h("td",{class:"num",text:j.suficiente?rtMoeda(j.minimo.valor):"insuficiente"}),h("td",{class:"num",text:j.suficiente?rtMoeda(j.maximo.valor):"insuficiente"}),h("td",{class:"num",text:j.suficiente?(j.atualNoMinimo?"no menor preço":"+"+rtMoeda(j.acimaDoMinimo)):"—"}))})))));
    p.appendChild(rtGrafico(serie,agora));
    var lista=h("div",{class:"rtobs"},hs.pontos.slice().reverse().map(function(x){var orig=serie.obs.filter(function(o){return o.id===x.id})[0];
      var l=h("div",{class:"rtlinha"},h("span",{text:rtData(x.iso)+" · "+rtMoeda(x.produto)+(x.final!=null?" → final "+rtMoeda(x.final):" · sem preço final ("+(x.motivo==="frete_desconhecido"?"frete não confirmado":x.motivo==="indisponivel"?"indisponível":"sem disponibilidade")+")")}));
      if(x.motivo==="frete_desconhecido"&&orig){var v=rtIn("","Frete (R$)",null,"decimal");l.appendChild(h("span",{class:"rtfrete"},v,rtBotao("Confirmar frete",function(){var c=NUCLEO.rdCent(v.value);if(c==null||isNaN(c)||c<=0){rtAvisar("Informe o valor do frete conferido para o seu CEP.");return}rtFeito(rtCorrigirFrete(RT.sb,orig,"confirmado",c/100),"Frete confirmado em uma nova linha (a original continua no histórico).")}),
        rtBotao("Grátis",function(){if(typeof confirm==="function"&&!confirm("Confirme que você viu frete grátis para o seu CEP nesta oferta."))return;rtFeito(rtCorrigirFrete(RT.sb,orig,"gratis_confirmado",0),"Frete grátis confirmado em uma nova linha.")})))}
      return l}));
    p.appendChild(lista);corpo.appendChild(p)}
  function rtResultadoLeitura(corpo,oferta,ex){
    var b=h("div",{class:"rtleitura"},h("b",{text:"Lido da página"}),h("p",{class:"sub",text:"Só o que a página declara. O que não veio está marcado para você confirmar."}));
    [["nome","Nome"],["marca","Marca"],["modelo","Modelo"],["gtin","GTIN/EAN"],["preco","Preço anunciado"],["vendedor","Vendedor"],["disponibilidade","Disponibilidade"]].forEach(function(c){var x=ex[c[0]];
      b.appendChild(h("div",{class:"rtlinha"},h("span",{class:"sub",text:c[1]}),h("span",{text:x?(c[0]==="preco"?rtMoeda(x.valor):String(x.valor))+" · "+x.fonte:"pendente — confirmar à mão"})))});
    ["modalidade","frete"].forEach(function(k){b.appendChild(h("div",{class:"rtlinha"},h("span",{class:"sub",text:k==="modalidade"?"À vista ou parcelado":"Frete"}),h("span",{text:"pendente — depende de você"+(k==="frete"&&ex.frete&&ex.frete.dica?" ("+ex.frete.dica+")":"")})))});
    (ex.avisos||[]).forEach(function(t){b.appendChild(h("p",{class:"sub rtavisoleitura",text:"⚠ "+t}))});corpo.appendChild(b)}
  function rtOfertaCartao(item,o,corpo){
    var lj=rtPor(RT.d.lojas,o.loja_id),eq=RT_EQUIV.filter(function(x){return x[0]===o.equivalencia})[0],c=h("div",{class:"rtoferta"});
    c.appendChild(h("div",{class:"rtlinha"},h("b",{text:lj?lj.nome:"Loja"}),rtEtiqueta(eq?eq[1]:o.equivalencia,o.equivalencia==="confirmada"?"rtok":""),o.situacao!=="ativa"?rtEtiqueta(o.situacao):null));
    if(o.vendedor)c.appendChild(h("span",{class:"sub",text:"Vendedor: "+o.vendedor}));
    if(o.url&&/^https:\/\//i.test(o.url))c.appendChild(h("a",{class:"link",href:o.url,target:"_blank",rel:"noopener noreferrer",text:"Abrir a página da loja"}));
    var sug=null,tituloIA=rtCfg().ia?rtIn("","Título do anúncio (cole aqui para a IA)"):null;
    if(tituloIA)c.appendChild(h("label",{class:"rtcampo"},h("span",{class:"sub",text:"Título do anúncio (para a IA comparar)"}),tituloIA));
    c.appendChild(h("div",{class:"linksrow"},
      rtBotao("Sugerir equivalência (regras)",function(){var l=RT.leitura&&RT.leitura.oferta===o.id?RT.leitura.ex:null;
        sug=NUCLEO.rdSugerirEquivalencia(item,{nome:l&&l.nome&&l.nome.valor,marca:l&&l.marca&&l.marca.valor,modelo:l&&l.modelo&&l.modelo.valor,gtin:l&&l.gtin&&l.gtin.valor});RT.sug={oferta:o.id,sug:sug};rtDesenhar()}),
      rtBotao(o.situacao==="ativa"?"Pausar":"Reativar",function(){rtFeito(rtSituacao(RT.sb,o,o.situacao==="ativa"?"pausada":"ativa"),"Oferta atualizada.")}),
      !RT.d.precos.some(function(x){return x.oferta_id===o.id})?rtBotao("Excluir oferta",function(){if(typeof confirm==="function"&&!confirm("Excluir esta oferta?"))return;rtFeito(rtExcluir(RT.sb,"radar_ofertas",o.id),"Oferta excluída.")},"danger"):null,
      rtBotao("Ler da página",function(){if(!o.url){rtAvisar("Esta oferta não tem link.");return}rtAvisar("Lendo a página…");rtLerPagina(RT.sb,o.url).then(function(d){RT.leitura={oferta:o.id,ex:d.extraido};RT.aviso="";rtDesenhar()},function(e){rtAvisar(rtErro(e))})}),
      rtBotaoIA(item,o,tituloIA)));
    rtPainelIA(c,o);
    if(RT.sug&&RT.sug.oferta===o.id){var s=RT.sug.sug;c.appendChild(h("div",{class:"rtleitura"},h("b",{text:"Sugestão por regras: "+(s.sugestao==="provavel"?"provável":s.sugestao==="divergente"?"divergente":"não confirmada")}),h("p",{class:"sub",text:s.aviso}),
      s.evidencias.map(function(e){return h("span",{class:"sub",text:"✓ "+e.texto})}),s.divergencias.map(function(e){return h("span",{class:"sub",text:"✗ "+e.texto})})));
      if(s.sugestao==="provavel")c.appendChild(rtBotao("Confirmar que é o mesmo produto",function(){rtFeito(rtEquivalencia(RT.sb,o,"confirmada",s.evidencias),"Equivalência confirmada por você.")},"pri"));
      c.appendChild(rtBotao("Rejeitar equivalência",function(){rtFeito(rtEquivalencia(RT.sb,o,"rejeitada",s.evidencias.concat(s.divergencias)),"Equivalência rejeitada.")}))}
    if(RT.leitura&&RT.leitura.oferta===o.id)rtResultadoLeitura(c,o,RT.leitura.ex);
    var det=rtDet("preco:"+o.id,"＋ Registrar preço desta oferta",rtFormPreco(o,RT.leitura&&RT.leitura.oferta===o.id?{preco:RT.leitura.ex.preco?String(RT.leitura.ex.preco.valor).replace(".",","):"",disp:RT.leitura.ex.disponibilidade?RT.leitura.ex.disponibilidade.valor:"desconhecida",evid:o.url||""}:{evid:o.url||""}));c.appendChild(det);
    corpo.appendChild(c)}
  function rtDetalhe(corpo){
    var item=rtPor(RT.d.itens,RT.item);if(!item){RT.item=null;rtDesenhar();return}
    var p=h("div",{class:"panel"});p.appendChild(rtBotao("← Voltar",function(){RT.item=null;RT.serie=null;rtDesenhar()}));
    p.appendChild(h("h2",{text:item.nome}));p.appendChild(h("p",{class:"sub",text:[item.marca,item.modelo,item.variante,item.apresentacao].filter(Boolean).join(" · ")+(item.gtin?" · GTIN "+item.gtin:"")}));
    if(item.ativo===false)p.appendChild(h("p",{class:"sub"},rtEtiqueta("arquivado")," As ofertas ficam pausadas."));
    if(rtPagoTxt(item.id))p.appendChild(h("p",{class:"rtpago"},h("b",{text:rtPagoTxt(item.id)})));
    p.appendChild(rtDet("editar:"+item.id,"Editar produto",rtFormItem(item,null)));
    /* o que o dono pagou (para comparar na mesma modalidade) */
    var pg=rtPagos()[item.id]||{},pa=rtIn(rtNum(pg.a_vista),"Ex.: 71,00",null,"decimal"),pp=rtIn(rtNum(pg.parcelado),"Ex.: 780,00",null,"decimal"),stP=rtMsg();
    p.appendChild(rtDet("pago","O que eu paguei",h("div",{class:"rtform"},rtCampo("Preço pago à vista (R$)",pa),rtCampo("Total pago parcelado (R$)",pp),rtBotao("Salvar",function(){
      var a=pa.value.trim()?NUCLEO.rdCent(pa.value):null,b=pp.value.trim()?NUCLEO.rdCent(pp.value):null;
      if((a!=null&&!(a>0))||(b!=null&&!(b>0))){stP.textContent="Informe os valores como 71,00 (maiores que zero) ou deixe em branco.";return}
      var todos=JSON.parse(JSON.stringify(rtPagos())),r={};if(a>0)r.a_vista=a/100;if(b>0)r.parcelado=b/100;if(r.a_vista!=null||r.parcelado!=null)todos[item.id]=r;else delete todos[item.id];
      if(typeof pessoalGravar==="function")pessoalGravar("radar-pagos",todos);else PESSOAL["radar-pagos"]=todos;
      RT.abertos.pago=1;rtAvisar(todos[item.id]?"Valor pago salvo: "+rtPagoTxt(item.id).replace("Paguei: ","")+".":"Valor pago removido.")},"pri"),stP)));
    /* nova oferta: escolhe a loja (ou cria pela URL) e cola o link */
    var lojaSel=rtSel([["","— loja —"]].concat(RT.d.lojas.map(function(l){return [l.id,l.nome]})),""),url=rtIn("","Cole o link do produto na loja"),vend=rtIn("","Vendedor (se houver)");
    p.appendChild(h("h3",{text:"Ofertas"}));
    var stO=rtMsg();
    p.appendChild(rtDet("nova-oferta:"+item.id,"＋ Nova oferta (link da loja)",h("div",{class:"rtform"},rtCampo("Link do produto",url),rtCampo("Loja (deixe em branco para usar a do link)",lojaSel),rtCampo("Vendedor",vend),
      h("p",{class:"sub",text:"Use o link final da loja. Links encurtados (como a.co) levam a outro domínio e a leitura automática não os acompanha."}),
      rtBotao("Cadastrar oferta",function(){var u=url.value.trim()?NUCLEO.rdUrlOk(url.value):{ok:true,url:null},lj=lojaSel.value;
        if(!u.ok){stO.textContent=u.motivo;return}
        if(!lj&&!u.url){stO.textContent="Cole o link ou escolha a loja.";return}
        var existe=lj||RT.d.lojas.some(function(l){return NUCLEO.rdHostCasa(u.host,NUCLEO.rdHostDe(l))});
        if(!existe&&typeof confirm==="function"&&!confirm("A loja "+u.host+" ainda não está cadastrada. Cadastrar agora e usar nesta oferta?")){stO.textContent="Oferta não cadastrada: a loja "+u.host+" não existe ainda.";return}
        rtFeito(rtOfertaComLoja(RT.sb,{item_id:item.id,loja_id:lj,url:url.value.trim(),vendedor:vend.value},RT.d.lojas),"Oferta cadastrada. Use “Ler da página” ou registre o preço.",stO,"nova-oferta:"+item.id)},"pri"),stO)));
    var ofs=RT.d.ofertas.filter(function(o){return o.item_id===item.id});if(!ofs.length)p.appendChild(h("p",{class:"empty",text:"Nenhuma oferta ainda. Adicione o link do mesmo produto em uma ou mais lojas."}));
    ofs.forEach(function(o){rtOfertaCartao(item,o,p)});
    /* ranking: uma modalidade por vez */
    ["a_vista","parcelado"].forEach(function(m){var rk=NUCLEO.rdRanking(RT.d.precos.filter(function(x){return ofs.some(function(o){return o.id===x.oferta_id})}),ofs,{modalidade:m}),b=h("div",{class:"rtbloco"},h("h3",{text:"Ranking · "+(m==="a_vista"?"à vista":"parcelado")}));
      if(!rk.ranking.length)b.appendChild(h("p",{class:"sub",text:"Nenhuma oferta com preço final confirmado nesta modalidade."}));
      rk.ranking.forEach(function(r,i){var o=rtPor(RT.d.ofertas,r.oferta_id),lj=o&&rtPor(RT.d.lojas,o.loja_id);b.appendChild(h("div",{class:"rtlinha"},h("span",{text:(i+1)+"º "+(lj?lj.nome:"")}),h("b",{text:rtMoeda(r.final)+(r.parcelas?" ("+r.parcelas+"x de "+rtMoeda(r.valor_parcela)+")":"")})))});
      var f={frete_desconhecido:"frete não confirmado",equivalencia_nao_confirmada:"equivalência não confirmada",oferta_inativa:"oferta pausada",sem_observacao:"sem observação",indisponivel:"indisponível",disponibilidade_desconhecida:"disponibilidade desconhecida",invalido:"dados inválidos"};
      rk.fora.forEach(function(x){var o=rtPor(RT.d.ofertas,x.oferta_id),lj=o&&rtPor(RT.d.lojas,o.loja_id);b.appendChild(h("div",{class:"rtlinha"},h("span",{class:"sub",text:"Fora do ranking: "+(lj?lj.nome:"")+" — "+(f[x.motivo]||x.motivo)})))});p.appendChild(b)});
    /* histórico por série */
    var series=rtSeriesDoItem(item);p.appendChild(h("h3",{text:"Histórico de preços"}));
    if(!series.length)p.appendChild(h("p",{class:"empty",text:"Sem observações ainda. O histórico começa no primeiro preço que você registrar: nada é estimado para trás."}));
    else{var sel=series.filter(function(s){return s.chave===RT.serie})[0]||series[0];
      p.appendChild(h("div",{class:"chips"},series.map(function(s){var b=h("button",{type:"button",class:"chipb"+(s.chave===sel.chave?" on":""),text:s.rotulo});b.onclick=function(){RT.serie=s.chave;rtDesenhar()};return b})));rtHistorico(sel,p)}
    /* excluir só é possível sem ofertas (o histórico de preços nunca é apagado); com ofertas, o caminho é arquivar */
    var risco=h("div",{class:"rtbloco"},h("h3",{text:"Remover este produto"})),stX=rtMsg();
    if(!ofs.length)risco.appendChild(rtBotao("Excluir produto",function(){if(typeof confirm==="function"&&!confirm("Excluir “"+item.nome+"” de vez? Não dá para desfazer."))return;rtFeito(rtExcluir(RT.sb,"radar_itens",item.id),"Produto excluído.",stX)},"danger"));
    else risco.appendChild(h("p",{class:"sub",text:"Este produto tem ofertas (e talvez histórico de preços), que não são apagados. Arquive para tirar da lista e pausar as ofertas."}));
    risco.appendChild(rtBotao(item.ativo===false?"Desarquivar produto":"Arquivar produto",function(){if(item.ativo!==false&&typeof confirm==="function"&&!confirm("Arquivar “"+item.nome+"”? Ele sai da lista e as ofertas ficam pausadas."))return;
      var arquivando=item.ativo!==false;rtFeito(rtArquivarItem(RT.sb,item,arquivando).then(function(){if(arquivando)RT.item=null}),item.ativo===false?"Produto desarquivado (as ofertas continuam pausadas até você reativá-las).":"Produto arquivado.",stX)}));
    risco.appendChild(stX);p.appendChild(risco);
    corpo.appendChild(p)}

  /* ---------- casca ---------- */
  function rtDesenhar(){
    var r=RT.corpo;if(!r)return;r.innerHTML="";
    if(!rtDono()){r.appendChild(h("div",{class:"panel"},h("p",{class:"empty",text:"O Radar de Preços é só do dono."})));return}
    if(!RT.d){r.appendChild(h("div",{class:"panel"},h("p",{class:"empty",text:RT.aviso||"Carregando o Radar…"})));return}
    if(RT.aviso)r.appendChild(h("div",{class:"panel rtaviso",role:"status",text:RT.aviso}));
    if(RT.item){rtDetalhe(r);return}
    var abas=h("div",{class:"pills rtabas"},RT_ABAS.map(function(a){var b=h("a",{href:"#mercado/radar","aria-current":a[0]===RT.aba?"page":null,text:a[1]});b.onclick=function(e){if(e&&e.preventDefault)e.preventDefault();RT.aba=a[0];RT.aviso="";rtDesenhar()};return b}));
    r.appendChild(abas);
    ({oport:rtAbaOport,itens:rtAbaItens,lojas:rtAbaLojas,ajustes:rtAbaAjustes})[RT.aba](r)}
  /* chamada pelo Mercado: sb = cliente já logado; só o dono chega aqui (a aba nem aparece para a casa) */
  function rtMontar(corpo,sb,user){
    RT.sb=sb;RT.user=user;RT.corpo=corpo;
    if(!rtDono()){rtDesenhar();return Promise.resolve()}
    if(RT.d){rtDesenhar();return rtRecarregar()}
    rtDesenhar();return rtRecarregar()}
