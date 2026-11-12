/* Dia a Dia RAC — módulo carregado quando a aba Radar do Mercado abre (docs/radar.md). SÓ DO DONO: a Fernanda não vê a aba e o banco recusa (RLS).
   Cadastro de produtos (comprados ou desejados), lojas, ofertas e observações de preço; histórico por série (à vista e parcelado nunca se misturam), janelas de 30/90/180/365 dias
   e todo o histórico, ranking só com preço final confirmado e oportunidades. As regras vêm de NUCLEO.rd* (nucleo.js); o banco (043) repete as mesmas.
   Leitura automática de página: função "radar" (ainda não publicada: sem ela o botão avisa e o preenchimento é manual). IA: só sugestão, hoje indisponível (aguarda liberação).
   O CEP padrão nunca aparece na tela, em log ou em arquivo: só "cadastrado" ou "não cadastrado". */
  var RT={sb:null,user:null,d:null,aba:"oport",item:null,janela:90,serie:null,leitura:null,aviso:"",form:null,carregando:false,corpo:null,abertos:{},arquivados:false,desc:null,embed:null};
  var RT_ABAS=[["oport","Oportunidades"],["desc","Descobrir"],["itens","Produtos"],["lojas","Lojas"],["ajustes","Ajustes"]];
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
    var nova={item_id:f.item_id,loja_id:f.loja_id,url:u.url||null,vendedor:rtTexto(f.vendedor,120),codigo_loja:rtTexto(f.codigo_loja,80)};if(Array.isArray(f.evidencias)&&f.evidencias.length)nova.evidencias=f.evidencias;
    return Promise.resolve(sb.from("radar_ofertas").insert(nova).select("*")).then(rtOk)}
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
      /* editar: nome, domínio e tipo. Domínio novo = termos novos: a coleta automática desliga e só volta se o dono liberar de novo */
      var ef={nome:rtIn(l.nome,"Nome da loja"),dominio:rtIn(l.dominio||"","Domínio (ex.: loja.com.br)"),tipo:rtSel(RT_TIPOS_LOJA,l.tipo||"varejo")},stE=rtMsg();
      c.appendChild(rtDet("editar-loja:"+l.id,"Editar",h("div",{class:"rtform"},rtCampo("Nome",ef.nome),rtCampo("Domínio",ef.dominio),rtCampo("Tipo",ef.tipo),
        h("p",{class:"sub",text:"Se mudar o domínio, a coleta automática é desligada até você liberar de novo (os termos da loja podem ser outros). As ofertas já cadastradas continuam com o link que têm."}),
        rtBotao("Salvar alterações",function(){var novo=String(ef.dominio.value||"").trim().toLowerCase().replace(/^https?:\/\//,"").replace(/^www\./,"").replace(/[\/?#].*$/,""),mudou=novo!==String(l.dominio||"");
          rtFeito(rtSalvarLoja(RT.sb,{nome:ef.nome.value,dominio:ef.dominio.value,tipo:ef.tipo.value,coleta_permitida:mudou?false:l.coleta_permitida},l.id),mudou&&l.coleta_permitida?"Loja atualizada. O domínio mudou: a coleta automática foi desligada; libere de novo depois de conferir os termos.":"Loja atualizada.",stE,"editar-loja:"+l.id)},"pri"),stE)));
      if(!d.ofertas.some(function(o){return o.loja_id===l.id}))c.appendChild(rtBotao("Excluir",function(){if(typeof confirm==="function"&&!confirm("Excluir a loja "+l.nome+"? Só é possível enquanto não houver ofertas ligadas a ela."))return;rtFeito(rtExcluir(RT.sb,"radar_lojas",l.id),"Loja excluída.")},"danger"));
      else c.appendChild(h("p",{class:"sub",text:"Para excluir esta loja, antes exclua ou troque as "+d.ofertas.filter(function(o){return o.loja_id===l.id}).length+" oferta(s) ligadas a ela (o histórico de preços nunca é apagado). Dá para desligar a coleta ou editar a loja."}));
      p.appendChild(c)});
    corpo.appendChild(p)}

  /* ---------- descobrir: ofertas encontradas pelo provedor (docs/radar.md, "Descoberta") ----------
     O dono escolhe um produto e o RAC pesquisa no Google Shopping (SerpApi, pela função "radar"). Cada anúncio vira um CANDIDATO classificado (individual, kit do mesmo produto, combo, outra apresentação, relacionado),
     com preço por medida quando dá para calcular. Nada é descartado por quantidade ou composição diferente. Candidato não é oferta confirmada: "Acompanhar" usa o fluxo de oferta que já existe.
     Os candidatos ficam em radar_candidatos (migration 048, proposta); sem ela esta aba avisa e o resto do Radar continua igual. A chave do provedor nunca passa por aqui. */
  var RT_TIPOS_OFERTA=[["individual","Individual"],["kit_mesmo_produto","Kit do mesmo produto"],["combo","Combo"],["outra_apresentacao","Outra apresentação"],["relacionado","Relacionado"],["indeterminado","Indeterminado"]];
  var RT_ORDENS=[["medida","Menor preço por medida"],["total","Menor total"],["preco","Menor preço"],["relevancia","Mais parecido"]];
  function rtDescEstado(){if(!RT.desc)RT.desc={itemId:null,cands:null,consultas:[],orc:null,tipo:"",ordem:"medida",ignorados:false,msg:"",pendente:false,ocupado:false,cota:null,hist:[],provedores:null};return RT.desc}
  function rtDescMsg(t){rtDescEstado().msg=t||"";rtDesenhar()}
  function rtDescChamar(corpo){return Promise.resolve(RT.sb.functions.invoke("radar",{body:corpo})).then(function(r){
    if(r&&r.error)throw new Error("A função do Radar não respondeu (a descoberta ainda não foi publicada).");var d=r&&r.data;if(!d)throw new Error("A função do Radar não respondeu.");return d})}
  var RT_ERROS_DESC={sem_chave_serpapi:"O Secret SERPAPI_API_KEY não está cadastrado na função.",migracao_pendente:"A migration 048 (descoberta) ainda não foi aplicada no banco.",item_nao_encontrado:"Produto não encontrado.",item_arquivado:"Este produto está arquivado.",
    token_vencido:"O token das lojas venceu. Refaça a busca para renovar.",sem_token:"Este anúncio não trouxe o token das lojas.",sem_identificador:"Sem token válido nem identificador de catálogo para consultar as lojas.",orcamento:"Limite de buscas do RAC atingido.",
    chave_recusada:"O SerpApi recusou a chave.",limite:"Limite de buscas do SerpApi (por hora ou da franquia).",rede:"Falha de rede ao falar com o SerpApi.",tempo_esgotado:"O SerpApi não respondeu a tempo.",erro_provedor:"O SerpApi devolveu erro.",candidato_nao_encontrado:"Anúncio não encontrado."};
  var RT_LIMITE_TXT="O limite de consultas foi atingido.";
  function rtDescErroTxt(d){if(d&&d.erro==="orcamento")return RT_LIMITE_TXT;return (d&&(d.mensagem||RT_ERROS_DESC[d.erro]))||"Não deu certo."}
  function rtDescCarregar(itemId){var D=rtDescEstado();D.itemId=itemId;D.cands=null;rtDesenhar();
    return Promise.all([Promise.resolve(RT.sb.from("radar_candidatos").select("*").eq("item_id",itemId).limit(2000)).then(rtOk),
      Promise.resolve(RT.sb.from("radar_consultas").select("id,provedor,engine,origem,variante,consulta,status,resultados,buscas_gastas,iniciada_em,erro_codigo").eq("item_id",itemId).order("iniciada_em",{ascending:false}).limit(8)).then(rtOk),
      Promise.resolve(RT.sb.from("radar_historico").select("produto_chave,apresentacao_chave,loja,preco,preco_por_medida,base_medida,observado_em").eq("item_id",itemId).order("observado_em",{ascending:false}).limit(3000)).then(rtOk).then(function(l){return l||[]},function(){return []})]).then(function(r){
      D.cands=r[0]||[];D.consultas=r[1]||[];D.hist=r[2]||[];D.pendente=false;rtDesenhar()},function(e){var m=(e&&e.message)||"";
      if(/42P01|does not exist|schema cache|radar_candidatos|radar_consultas/i.test(m)){D.pendente=true;D.cands=[];D.consultas=[]}else D.msg="Não consegui ler as ofertas encontradas: "+rtErro(e);rtDesenhar()})}
  function rtDescUso(){return rtDescChamar({tipo:"uso_descoberta"}).then(function(d){if(d.ok){rtDescEstado().orc=d.orcamento;rtDescEstado().provedores=d.provedores||null}rtDesenhar()},function(){})}
  /* histórico por IDENTIDADE do produto (produto_chave + apresentação), não por anúncio nem por loja; kit, combo e outro tamanho não se misturam com o avulso */
  function rtDescHistTxt(c){var h=rtDescEstado().hist||[];if(!c.produto_chave||!h.length)return [];var out=[];
    var mesma=h.filter(function(o){return o.produto_chave===c.produto_chave&&o.apresentacao_chave===c.apresentacao_chave});
    if(mesma.length){var min=mesma.reduce(function(a,o){return !a||+o.preco<+a.preco?o:a},null),lojas={};mesma.forEach(function(o){lojas[o.loja||"?"]=1});
      out.push("Histórico deste produto ("+c.apresentacao_chave+"): "+mesma.length+" observação(ões) em "+Object.keys(lojas).length+" loja(s) · menor "+rtMoeda(min.preco)+" ("+(min.loja||"loja não informada")+", "+rtData(min.observado_em)+")")}
    if(c.base_medida){var pm=h.filter(function(o){return o.produto_chave===c.produto_chave&&o.base_medida===c.base_medida&&o.preco_por_medida!=null});
      if(pm.length>1){var m2=pm.reduce(function(a,o){return !a||+o.preco_por_medida<+a.preco_por_medida?o:a},null);out.push("Menor preço por "+c.base_medida+" já visto (todos os tamanhos e kits do mesmo produto): "+rtMoeda(m2.preco_por_medida)+" ("+(m2.loja||"loja não informada")+", "+rtData(m2.observado_em)+")")}}
    return out}
  function rtDescMedida(c){if(!c.medida_valor)return "";var v=+c.medida_valor;return v>=1000?(v/1000).toString().replace(".",",")+(c.medida_unidade==="g"?" kg":" L"):v.toString().replace(".",",")+(c.medida_unidade==="g"?" g":" ml")}
  function rtDescFrete(c){return c.frete_situacao==="informado_provedor"?"Frete segundo o Google: "+rtMoeda(c.frete_valor)+" (não confirmado para o seu CEP)":c.frete_situacao==="gratis_informado_provedor"?"Frete grátis segundo o Google (não confirmado para o seu CEP)":"Frete: desconhecido (não conta como grátis)"}
  function rtDescTipoRot(t){var x=RT_TIPOS_OFERTA.filter(function(o){return o[0]===t})[0];return x?x[1]:t}
  function rtDescOrdenar(l,modo){var ch=function(c){return modo==="medida"?c.preco_por_medida:modo==="total"?(c.total!=null?c.total:c.preco):modo==="preco"?c.preco:-c.relevancia};
    return l.slice().sort(function(a,b){var x=ch(a),y=ch(b);if(x==null&&y==null)return b.relevancia-a.relevancia;if(x==null)return 1;if(y==null)return -1;return (+x)-(+y)||b.relevancia-a.relevancia})}
  function rtDescDecidir(c,decisao){return Promise.resolve(RT.sb.from("radar_candidatos").update({decisao:decisao,atualizado_em:new Date().toISOString()}).eq("id",c.id)).then(rtOk).then(function(){return rtDescCarregar(c.item_id)},function(e){rtDescMsg(rtErro(e))})}
  function rtDescAcompanhar(c){
    if(c.link_tipo!=="loja"||!c.link){rtDescMsg("Este anúncio só tem a página do Google. Use “Ver lojas” para achar o link da loja e acompanhe por lá.");return}
    var ev=[{tipo:"descoberta",provedor:c.provedor,titulo:String(c.titulo||"").slice(0,200),tipo_oferta:c.tipo_oferta,quantidade:c.quantidade,apresentacao:c.apresentacao_chave,observado_em:c.observado_em}],avulso=c.tipo_oferta==="individual";
    rtOfertaComLoja(RT.sb,{item_id:c.item_id,url:c.link,vendedor:c.loja,evidencias:ev},RT.d.lojas).then(function(r){var of=r&&r[0];if(!of)throw new Error("Não consegui cadastrar a oferta.");
      return Promise.resolve(RT.sb.from("radar_candidatos").update({decisao:"acompanhando",oferta_id:of.id,atualizado_em:new Date().toISOString()}).eq("id",c.id)).then(rtOk)})
      .then(function(){RT.aviso="Oferta cadastrada a partir do anúncio. Confirme a equivalência na tela do produto; o preço entra no histórico quando você registrar ou a coleta ler a página."+(avulso?"":" Atenção: este anúncio é "+rtDescTipoRot(c.tipo_oferta).toLowerCase()+" ("+(c.apresentacao_chave||"sem medida")+"): o preço dele não é o do frasco avulso. Só confirme a equivalência se quiser comparar pelo total.");return rtRecarregar().then(function(){return rtDescCarregar(c.item_id)})},function(e){rtDescMsg(rtErro(e))})}
  function rtDescCartao(c,lojas){
    var D=rtDescEstado(),pm=c.preco_por_medida!=null?rtMoeda(c.preco_por_medida)+" por "+(c.base_medida||""):"";
    var box=h("div",{class:"rtopo rtcard"+(c.decisao==="ignorado"?" rtign":"")});
    /* 1) imagem (só se o provedor trouxe e for https; senão um espaço neutro: nada é inventado), nome, apresentação, loja e avaliação, selo de classificação */
    var img=c.imagem&&/^https:\/\//.test(c.imagem)?h("img",{class:"rtc-img",src:c.imagem,alt:"",loading:"lazy",referrerpolicy:"no-referrer"}):h("span",{class:"rtc-img rtc-semimg","aria-hidden":"true"});
    var apres=[c.quantidade>1?c.quantidade+" unidades":"",c.medida_valor?rtDescMedida(c)+(c.quantidade>1&&c.tipo_oferta==="kit_mesmo_produto"?" no total":""):""].filter(Boolean).join(" · ");
    var tags=h("div",{class:"chips"},rtEtiqueta(rtDescTipoRot(c.tipo_oferta),c.tipo_oferta==="individual"?"rtok":""));
    if(c.decisao==="acompanhando")tags.appendChild(rtEtiqueta("Acompanhando","rtok"));
    var corpo=h("div",{class:"rtc-corpo"},h("b",{class:"rtc-titulo",title:c.titulo,text:c.titulo}));
    if(apres)corpo.appendChild(h("p",{class:"rtc-apres",text:apres}));
    var dif=NUCLEO.rdDiferenca(c);if(dif)corpo.appendChild(h("p",{class:"rtc-dif"+(c.tipo_oferta==="relacionado"||c.tipo_oferta==="indeterminado"?" rtc-dif-alerta":""),text:dif}));
    corpo.appendChild(h("p",{class:"rtc-meta",text:[c.loja||"loja não informada",c.avaliacao!=null?"★ "+c.avaliacao+(c.avaliacoes?" ("+c.avaliacoes+")":""):""].filter(Boolean).join(" · ")}));
    corpo.appendChild(tags);
    box.appendChild(h("div",{class:"rtc-cab"},img,corpo));
    /* 2) preço total em destaque e, abaixo, o preço por unidade/medida (quando dá para calcular) */
    var precos=h("div",{class:"rtc-precos"},h("span",{class:"rtpreco",text:c.preco!=null?rtMoeda(c.preco):"sem preço"}));
    if(pm)precos.appendChild(h("span",{class:"rtc-pm",text:pm}));
    if(c.preco_original)precos.appendChild(h("span",{class:"rtc-antes",text:"antes "+rtMoeda(c.preco_original)}));
    if(c.total!=null)precos.appendChild(h("span",{class:"rtc-total",text:"total "+rtMoeda(c.total)}));
    box.appendChild(precos);
    /* comparação INDICATIVA com o que o dono pagou (só na página do produto e só com a mesma base de medida); o preço do Google nunca vira preço pago */
    var cmp=RT.embed&&RT.embed.pago?NUCLEO.pcComparar(RT.embed.pago,c):null;
    if(cmp&&cmp.comparavel)box.appendChild(h("p",{class:"rtc-cmp",text:"Você pagou "+rtMoeda(cmp.pagoNaBase)+" por "+cmp.base+" · este anúncio: "+rtMoeda(cmp.ofertaNaBase)+" por "+cmp.base+" ("+cmp.leitura+"; indicativo, preço visto no Google)"}));
    /* 3) frete e condições SÓ quando a fonte informou (o frete do Google nunca é o confirmado do Radar) */
    var cond=[];if(c.frete_situacao!=="desconhecido")cond.push(rtDescFrete(c));
    var pag=[c.pagamento_texto,c.parcelamento_texto,c.entrega_texto].filter(Boolean).join(" · ");if(pag)cond.push(pag);
    cond.forEach(function(t){box.appendChild(h("p",{class:"rtc-cond",text:t}))});
    /* 4) ações */
    var acoes=h("div",{class:"rtc-acoes"});
    if(c.decisao!=="acompanhando")acoes.appendChild(rtBotao("Acompanhar",function(){rtDescAcompanhar(c)},"pri"));
    if(c.page_token&&!c.pai_externo)acoes.appendChild(rtBotao(lojas.length?"Atualizar lojas":"Ver lojas",function(){D.ocupado=true;D.msg="Buscando as lojas…";rtDesenhar();
      rtDescChamar({tipo:"expandir",candidato_id:c.id}).then(function(d){D.ocupado=false;D.msg=d.ok?(d.status==="cache"?"Lojas do cache (sem gastar busca): ":"Lojas encontradas: ")+d.lojas+"."+(d.gasto?" 1 busca gasta.":""):rtDescErroTxt(d);return rtDescCarregar(c.item_id).then(rtDescUso)},function(e){D.ocupado=false;rtDescMsg(rtErro(e))})}));
    acoes.appendChild(rtBotao(c.decisao==="ignorado"?"Desfazer":"Ignorar",function(){rtDescDecidir(c,c.decisao==="ignorado"?"pendente":"ignorado")}));
    if(c.link)acoes.appendChild(h("a",{class:"link",href:c.link,target:"_blank",rel:"noopener noreferrer",text:c.link_tipo==="loja"?"Abrir na loja":"Abrir no Google"}));
    box.appendChild(acoes);
    /* 5) data e origem, em texto secundário: é o preço que o Google mostrou, não o confirmado na loja */
    box.appendChild(h("p",{class:"rtc-origem",text:"Visto em "+rtData(c.observado_em)+" pelo "+(c.engine==="google_shopping"?"Google Shopping":"Google (lojas)")+" · ainda não confirmado na loja"}));
    /* 6) o resto, recolhido */
    var mais=h("details",{class:"rtc-mais"},h("summary",{text:"Mais detalhes"})),linha=function(t){mais.appendChild(h("p",{class:"sub",text:t}))};
    if(c.frete_situacao==="desconhecido")linha(rtDescFrete(c));
    if(cmp&&!cmp.comparavel)linha("Sem comparação com o que você pagou: "+cmp.motivo+".");
    if(c.detalhes||c.desconto_texto)linha([c.detalhes,c.desconto_texto].filter(Boolean).join(" · "));
    if(c.catalogo||c.varias_fontes)linha("O Google mostra este produto em várias lojas (use “Ver lojas”).");
    var ant=(c.precos_anteriores||[]).slice(-1)[0];if(ant)linha("Visto antes por "+rtMoeda(ant.preco)+" em "+rtData(ant.observado_em));
    var comp=(c.composicao||[]);if(comp.length&&(c.tipo_oferta==="kit_mesmo_produto"||c.tipo_oferta==="combo"))linha("Composição (sugerida pelo título): "+comp.map(function(x){return (x.quantidade>1?x.quantidade+" × ":"")+x.descricao+(x.medida?" "+x.medida.valor+" "+x.medida.unidade:"")}).join(" + "));
    if((c.evidencias||[]).length)linha("Por que esta classificação: "+c.evidencias.join("; "));
    rtDescHistTxt(c).forEach(linha);
    box.appendChild(mais);
    /* 7) lojas encontradas, em área expansível */
    if(lojas.length){var det=h("details",{class:"rtc-lojas"},h("summary",{text:"Lojas deste anúncio ("+lojas.length+")"}),h("div",{class:"rtc-lojas-lista"},rtDescOrdenar(lojas,"total").map(function(l){return rtDescCartao(l,[])})));box.appendChild(det)}
    return box}
  /* indicador compacto (consultas): valor "x de y" e uma barra de uso */
  function rtDescKpi(rotulo,usado,limite){var pct=limite>0?Math.min(100,Math.round(usado*100/limite)):100;
    return h("div",{class:"rtd-kpi"},h("span",{class:"kl",text:rotulo}),h("b",{class:"kv",text:usado+" de "+limite}),h("span",{class:"rtd-barra","aria-hidden":"true"},h("span",{style:"width:"+pct+"%"})))}
  function rtAbaDescobrir(corpo){
    var D=rtDescEstado(),d=RT.d,ativos=d.itens.filter(function(i){return RT.embed?i.id===RT.embed.itemId:i.ativo!==false}),raiz=h("div",{class:"rtdesc"}),
      p=h("div",{class:"panel rtd-pesq"},h("div",{class:"rtd-tit"},h("h2",{text:RT.embed?"Ofertas encontradas na internet":"Descobrir ofertas"}),h("p",{class:"sub",text:RT.embed?"Anúncios que o Google mostrou para este produto. É preço visto na internet: não é compra nem preço confirmado na loja.":"Pesquise um produto no Google Shopping e compare lojas, kits e tamanhos."})));
    raiz.appendChild(p);corpo.appendChild(raiz);
    if(!ativos.length){p.appendChild(h("p",{class:"empty",text:RT.embed?"Este produto do Radar não foi encontrado (talvez esteja arquivado). Refaça o vínculo.":"Cadastre um produto na aba Produtos para pesquisar."}));return}
    if(!D.itemId||!ativos.some(function(i){return i.id===D.itemId})){D.itemId=ativos[0].id;D.cands=null;Promise.resolve().then(function(){rtDescCarregar(D.itemId);rtDescUso()})}
    var sel=h("select",{"aria-label":"Produto a pesquisar"},ativos.map(function(i){return h("option",{value:i.id,text:i.nome+(i.marca?" · "+i.marca:"")})}));sel.value=D.itemId;
    sel.onchange=function(){D.tipo="";D.msg="";rtDescCarregar(sel.value)};
    var busca=rtBotao(D.ocupado?"Pesquisando…":"Buscar ofertas",function(){if(D.ocupado)return;D.ocupado=true;D.msg="Pesquisando no Google Shopping…";rtDesenhar();
      rtDescChamar({tipo:"descobrir",item_id:D.itemId}).then(function(r){D.ocupado=false;
        if(!r.ok){D.msg=rtDescErroTxt(r)}else{var gasto=0,novos=0,cache=0,limite=false;(r.consultas||[]).forEach(function(c){gasto+=c.gasto||0;novos+=c.novos||0;if(c.status==="cache")cache++;if(c.status==="bloqueada_orcamento")limite=true});
          D.msg=(r.consultas||[]).length+" consulta(s): "+gasto+" busca(s) gasta(s)"+(cache?", "+cache+" do cache":"")+(novos?", "+novos+" anúncio(s) novo(s)":"")+"."+(limite?" "+RT_LIMITE_TXT:((r.avisos||[]).length?" "+r.avisos.join(" "):""))}
        D.orc=r.orcamento||D.orc;return rtDescCarregar(D.itemId)},function(e){D.ocupado=false;rtDescMsg(rtErro(e))})},"pri");
    p.appendChild(h("div",{class:"rtd-busca"},RT.embed?h("p",{class:"rtd-prod"},h("b",{text:ativos[0].nome+(ativos[0].marca?" · "+ativos[0].marca:"")}),h("span",{class:"sub",text:" — produto do Radar vinculado"})):rtCampo("Produto",sel),busca));
    if(D.orc){var o=D.orc,eg=o.por_engine||{},ng=function(k){return eg[k]?eg[k].dia:0},exp=ng("google_immersive_product")+ng("google_product");
      p.appendChild(h("div",{class:"rtd-kpis"},rtDescKpi("Consultas hoje",o.dia_usado,o.dia_limite),rtDescKpi("Consultas no mês",o.mes_usado,o.mes_limite),rtDescKpi("Expansões de lojas hoje",exp,o.expansoes_limite_dia),rtDescKpi("Rotina hoje",o.rotina_dia,o.rotina_limite_dia)))}
    if(rtPagoTxt(D.itemId))p.appendChild(h("p",{class:"rtpago"},h("b",{text:rtPagoTxt(D.itemId)}),h("span",{class:"sub",text:" — compare com o preço por medida de cada anúncio."})));
    if(D.msg)p.appendChild(h("p",{class:"sub rtmsg",role:"status",text:D.msg}));
    /* explicações e informações técnicas: recolhidas */
    var aj=h("details",{class:"rtd-ajuda"},h("summary",{text:"Como funciona e detalhes técnicos"}));
    aj.appendChild(h("p",{class:"sub",text:"Escolha o produto e o RAC pesquisa no Google Shopping (SerpApi). Kits, combos e outros tamanhos entram na lista, identificados: nada é descartado. O que aparece aqui foi visto pelo Google e ainda não foi confirmado na loja; frete só vale quando você confirmar."}));
    if(D.orc){var o2=D.orc,eg2=o2.por_engine||{},ng2=function(k){return eg2[k]?eg2[k].dia:0};
      aj.appendChild(h("p",{class:"sub",text:"Créditos contados pelo RAC: hoje "+o2.dia_usado+" de "+o2.dia_limite+" · no mês "+o2.mes_usado+" de "+o2.mes_limite+" (limites do RAC, mais baixos que a franquia da conta). Hoje: "+ng2("google_shopping")+" busca(s), "+(ng2("google_immersive_product")+ng2("google_product"))+" expansão(ões) de lojas (máx. "+o2.expansoes_limite_dia+"/dia), rotina "+o2.rotina_dia+" de "+o2.rotina_limite_dia+". Cache e erro não gastam."}))}
    if(D.provedores)aj.appendChild(h("p",{class:"sub",text:"Fontes: "+D.provedores.map(function(x){return x.nome+(x.estado==="ativo"?" (ativa)":" (ainda não implementada)")}).join(" · ")}));
    aj.appendChild(rtBotao("Conferir cota no SerpApi",function(){rtDescChamar({tipo:"cota_provedor"}).then(function(r){D.cota=r.ok?r.cota:null;D.msg=r.ok?"":rtDescErroTxt(r);rtDesenhar()},function(e){rtDescMsg(rtErro(e))})}));
    if(D.cota)aj.appendChild(h("p",{class:"sub",text:"Cota real no SerpApi: usadas no mês "+(D.cota.this_month_usage==null?"—":D.cota.this_month_usage)+" · restantes "+(D.cota.total_searches_left==null?"—":D.cota.total_searches_left)+" · limite por hora "+(D.cota.account_rate_limit_per_hour==null?"—":D.cota.account_rate_limit_per_hour)}));
    p.appendChild(aj);
    if(D.pendente){p.appendChild(h("p",{class:"sub",role:"status",text:"A descoberta precisa da migration 048 no banco; sem ela esta aba não guarda os anúncios encontrados."}));return}
    if(D.cands==null){p.appendChild(h("p",{class:"sub",text:"Carregando…"}));return}
    var topo=D.cands.filter(function(c){return !c.pai_externo&&(D.ignorados||c.decisao!=="ignorado")}),porTipo={};topo.forEach(function(c){porTipo[c.tipo_oferta]=(porTipo[c.tipo_oferta]||0)+1});
    /* padrão: só o que é DO produto (individual, kit, combo, outra apresentação); relacionado e indeterminado (outros produtos da marca, por exemplo) ficam a um toque em "Todos" */
    var doProduto=topo.filter(function(c){return c.tipo_oferta!=="relacionado"&&c.tipo_oferta!=="indeterminado"}),separa=doProduto.length>0&&doProduto.length<topo.length,modo=D.tipo||(separa?"produto":"todos");
    /* filtros e ordenação */
    var fil=h("div",{class:"panel rtd-filtros"});
    fil.appendChild(h("div",{class:"chips",role:"group","aria-label":"Filtrar por classificação"},(separa?[["","Do produto ("+doProduto.length+")"],["todos","Todos ("+topo.length+")"]]:[["","Todos ("+topo.length+")"]]).concat(RT_TIPOS_OFERTA.filter(function(t){return porTipo[t[0]]}).map(function(t){return [t[0],t[1]+" ("+porTipo[t[0]]+")"]})).map(function(t){var b=h("button",{type:"button",class:"chipb"+(D.tipo===t[0]?" on":""),text:t[1]});b.onclick=function(){D.tipo=t[0];rtDesenhar()};return b})));
    var ordem=rtSel(RT_ORDENS,D.ordem);ordem.setAttribute("aria-label","Ordenar por");ordem.onchange=function(){D.ordem=ordem.value;rtDesenhar()};
    var ign=D.cands.filter(function(c){return !c.pai_externo&&c.decisao==="ignorado"}).length;
    /* loja e apresentação: só o espaço visual (desativados); o filtro de verdade ainda não existe */
    var emBreve=function(rot,txt){var s=h("select",{"aria-label":rot+" (em breve)",title:"Em breve"},h("option",{text:txt}));s.disabled=true;return rtCampo(rot+" (em breve)",s)};
    fil.appendChild(h("div",{class:"rtd-ctl"},rtCampo("Ordenar por",ordem),emBreve("Loja","Todas as lojas"),emBreve("Apresentação","Todas"),ign?rtBotao((D.ignorados?"Ocultar":"Mostrar")+" ignorados ("+ign+")",function(){D.ignorados=!D.ignorados;rtDesenhar()}):null));
    raiz.appendChild(fil);
    /* resultados */
    var lista=rtDescOrdenar(topo.filter(function(c){return modo==="produto"?(c.tipo_oferta!=="relacionado"&&c.tipo_oferta!=="indeterminado"):(modo==="todos"||c.tipo_oferta===modo)}),D.ordem);
    var res=h("div",{class:"rtd-res"});
    if(!lista.length)res.appendChild(h("p",{class:"empty",text:D.cands.length?"Nenhum anúncio neste filtro.":"Nenhuma busca feita para este produto ainda. Toque em “Buscar ofertas”."}));
    else{res.appendChild(h("p",{class:"rtd-cont",text:lista.length+(lista.length===1?" oferta":" ofertas")}));
      res.appendChild(h("div",{class:"rtd-grade"},lista.map(function(c){return rtDescCartao(c,D.cands.filter(function(x){return x.pai_externo&&x.pai_externo===c.id_externo}))})))}
    raiz.appendChild(res);
    if((D.consultas||[]).length)raiz.appendChild(rtDet("desc-consultas","Últimas consultas",h("div",null,D.consultas.map(function(q){return h("p",{class:"sub",text:rtData(q.iniciada_em)+" · "+(q.engine==="google_shopping"?"Shopping":q.engine==="google_immersive_product"?"Lojas":"Produto")+" · "+(q.status==="reservada"?"em andamento":q.status)+" · "+q.resultados+" resultado(s) · gasto "+q.buscas_gastas+(q.consulta?" · “"+q.consulta+"”":"")})}))))}

  /* chamada pela página do produto (Central de Compras): mostra SÓ as ofertas do produto do Radar já vinculado, com os mesmos cartões, filtros e ações da aba Descobrir.
     pago = { unitario, unidade } da última compra REGISTRADA (para a comparação indicativa); o preço descoberto nunca é gravado como compra nem como preço verificado. Só o dono. */
  function rtMontarOfertas(corpo,sb,user,itemId,pago){
    RT.sb=sb;RT.user=user;RT.corpo=corpo;RT.embed={itemId:itemId,pago:pago||null};
    var D=rtDescEstado();if(D.itemId!==itemId){D.itemId=null;D.cands=null;D.tipo=""}
    rtDesenhar();if(!rtDono())return Promise.resolve();return rtRecarregar()}
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
    if(RT.embed){rtAbaDescobrir(r);return}   /* modo embutido: só as ofertas de UM produto, dentro da página do produto da Central de Compras */
    if(RT.item){rtDetalhe(r);return}
    var abas=h("div",{class:"pills rtabas"},RT_ABAS.map(function(a){var b=h("a",{href:"#mercado/radar","aria-current":a[0]===RT.aba?"page":null,text:a[1]});b.onclick=function(e){if(e&&e.preventDefault)e.preventDefault();RT.aba=a[0];RT.aviso="";rtDesenhar()};return b}));
    r.appendChild(abas);
    ({oport:rtAbaOport,desc:rtAbaDescobrir,itens:rtAbaItens,lojas:rtAbaLojas,ajustes:rtAbaAjustes})[RT.aba](r)}
  /* chamada pelo Mercado: sb = cliente já logado; só o dono chega aqui (a aba nem aparece para a casa) */
  function rtMontar(corpo,sb,user){
    RT.sb=sb;RT.user=user;RT.corpo=corpo;RT.embed=null;
    if(!rtDono()){rtDesenhar();return Promise.resolve()}
    if(RT.d){rtDesenhar();return rtRecarregar()}
    rtDesenhar();return rtRecarregar()}
