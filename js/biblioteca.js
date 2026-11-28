/* Dia a Dia RAC — Biblioteca básica (Lote 4 do novo RAC; docs/planejamento/15, seção 4). Onde mora o que a pessoa guarda para consultar, SEM virar um depósito paralelo: cada item de biblioteca_itens é uma REFERÊNCIA
   com metadados (tipo, título, etiquetas, origem, espaço) que APONTA para o conteúdo: um link da internet, um arquivo do cofre "captura", um documento que já existe (registros da Família, arquivos da Central Fiscal, que
   continuam onde estão) ou um texto próprio. Nenhum arquivo e nenhum documento é copiado. Quem lê e edita é decidido pelo banco (RLS por espaço); arquivos abrem só por URL temporária.
   Os links do modelo antigo (Conexões → Guardados, PESSOAL.salvos) aparecem aqui como LEITURA, marcados como "Conexões" (migração com prévia fica para depois). Prepara a entrada futura de Descobrir, Newsletter, Inbox e Projetos
   (campos origem e projeto_id), sem antecipar essas telas. Depende de js/captura.js (espaço, arquivos, URL temporária). */
  var BBL={itens:[],legado:[],espacos:null,carregando:false,erro:null,f:{tipo:"",etiqueta:"",texto:"",espaco:"",arquivados:false},form:null,msg:null,raiz:null,seq:0,aberto:null,confirma:null};
  var BBL_TIPOS_FILTRO=[["","Tudo"],["link","Links"],["nota","Notas"],["documento","Documentos"],["arquivo","Arquivos"],["referencia","Referências"]];
  function bblChip(t,a,fn){var b=h("button",{type:"button",class:"rac-chip","aria-pressed":a?"true":"false",text:t});b.onclick=fn;return b}
  function bblEspNome(id){var n="";(BBL.espacos||[]).forEach(function(e){if(e.id===id)n=(e.tipo==="pessoal"?"🔒 ":"👥 ")+e.nome});return n}
  function renderBiblioteca(){var root=$("#biblioteca-view");root.innerHTML="";BBL.raiz=root;
    if(!isOwner()){root.appendChild(h("div",{class:"panel"},h("p",{class:"empty",text:"A Biblioteca ainda não está liberada para esta conta."})));return}
    var novo=rkBtn("fantasma","＋ Guardar"),cx=h("a",{class:"rac-btn rac-btn--fantasma",href:"#caixa"},"📥 Caixa de entrada");novo.onclick=function(){BBL.form={modo:"novo",tipo:"link"};bblDesenhar()};
    root.appendChild(h("div",{class:"bb"},h("div",{class:"rh-hero wk-hero"},h("div",null,h("h2",{text:"Biblioteca"}),h("p",{class:"rh-hero-data",text:"O que você guarda para consultar: links, notas, arquivos e documentos. Cada item aponta para o original, sem cópias."})),h("div",{class:"wk-barra"},novo,cx)),
      h("div",{class:"bb-corpo stack"})));
    bblCarregar()}
  function bblCarregar(){var seq=++BBL.seq;BBL.carregando=true;BBL.erro=null;bblDesenhar();
    return Promise.all([capEspacos().then(null,function(){return []}),Promise.resolve().then(function(){return SB.from("biblioteca_itens").select("*").order("criado_em",{ascending:false}).limit(500)}).then(sbOk)]).then(function(r){if(seq!==BBL.seq)return;
      BBL.espacos=r[0]||[];BBL.itens=r[1]||[];BBL.legado=NUCLEO.bibLegado(PESSOAL.salvos);BBL.carregando=false;bblDesenhar()},function(e){if(seq!==BBL.seq)return;BBL.carregando=false;
      BBL.erro=semRede(e)?"Sem conexão: não consegui ler a Biblioteca agora.":"Não consegui ler a Biblioteca agora.";logErro("biblioteca",e);BBL.legado=NUCLEO.bibLegado(PESSOAL.salvos);bblDesenhar()})}
  function bblDesenhar(){var corpo=BBL.raiz&&BBL.raiz.querySelector(".bb-corpo");if(!corpo)return;corpo.innerHTML="";
    if(BBL.msg){corpo.appendChild(rkAlerta(BBL.msg.tipo,BBL.msg.titulo,BBL.msg.texto||"",null));BBL.msg=null}
    if(BBL.form)corpo.appendChild(bblForm());
    var todos=BBL.itens.concat(BBL.f.arquivados?[]:BBL.legado),f=BBL.f;
    var ctl=h("div",{class:"rac-card bb-ctl"}),busca=h("input",{type:"search",class:"rac-campo-entrada","aria-label":"Buscar na Biblioteca",placeholder:"Buscar por título, texto, etiqueta ou endereço…",value:f.texto,enterkeyhint:"search","data-atu-filtro":"1"});
    busca.addEventListener("input",function(){f.texto=busca.value;bblLista(corpo,true)});ctl.appendChild(busca);
    var tp=h("div",{class:"cx-chips",role:"group","aria-label":"Tipo"});BBL_TIPOS_FILTRO.forEach(function(t){tp.appendChild(bblChip(t[1],f.tipo===t[0],function(){f.tipo=t[0];bblDesenhar()}))});ctl.appendChild(tp);
    var et=NUCLEO.bibEtiquetasDe(BBL.itens).slice(0,10);if(et.length){var eh=h("div",{class:"cx-chips",role:"group","aria-label":"Etiquetas"});et.forEach(function(x){eh.appendChild(bblChip("#"+x.etiqueta+" ("+x.n+")",f.etiqueta===x.etiqueta,function(){f.etiqueta=f.etiqueta===x.etiqueta?"":x.etiqueta;bblDesenhar()}))});ctl.appendChild(eh)}
    var lin=h("div",{class:"bb-linha"});
    if((BBL.espacos||[]).length>1){var se=h("select",{class:"rac-campo-entrada","aria-label":"Espaço"},h("option",{value:"",text:"Todos os espaços"}),BBL.espacos.map(function(e){return h("option",{value:e.id,text:bblEspNome(e.id)})}));se.value=f.espaco;se.onchange=function(){f.espaco=se.value;bblDesenhar()};lin.appendChild(se)}
    lin.appendChild(bblChip(f.arquivados?"Mostrando arquivados":"Ver arquivados",f.arquivados,function(){f.arquivados=!f.arquivados;bblDesenhar()}));ctl.appendChild(lin);corpo.appendChild(ctl);
    var lista=h("div",{class:"bb-lista stack"});corpo.appendChild(lista);bblLista(corpo,false)}
  function bblLista(corpo,soLista){var lista=corpo.querySelector(".bb-lista");if(!lista)return;lista.innerHTML="";
    if(BBL.carregando&&!BBL.itens.length){lista.appendChild(rkEstado("carregando","Lendo a Biblioteca…"));return}
    if(BBL.erro){var t=rkBtn("sec","Tentar de novo");t.onclick=bblCarregar;lista.appendChild(rkEstado("erro",BBL.erro,t))}
    var f=BBL.f,itens=NUCLEO.bibFiltrar(BBL.itens.concat(f.arquivados?[]:BBL.legado),f);
    if(!itens.length){if(!BBL.erro)lista.appendChild(rkEstado("vazio",BBL.itens.length+BBL.legado.length?"Nada com esses filtros.":"A Biblioteca está vazia. Use “＋ Guardar” ou capture algo e envie da caixa de entrada para cá.",null));return}
    lista.appendChild(h("p",{class:"rac-t-legenda",text:itens.length+(itens.length===1?" item":" itens")}));
    itens.forEach(function(i){lista.appendChild(bblCartao(i))})}
  function bblCartao(i){var ab=NUCLEO.bibAbrir(i),aberto=BBL.aberto===i.id,c=h("div",{class:"rac-card bb-item","data-id":i.id}),multi=(BBL.espacos||[]).length>1;
    var meta=[NUCLEO.BIB_ROTULO[i.tipo]];if(i.url)meta.push(NUCLEO.cpHost(i.url));if(i.ref&&i.ref.nome&&i.tipo!=="link")meta.push(i.ref.nome);if(i.origem&&i.origem!=="manual")meta.push("de "+({captura:"Captura",descobrir:"Descobrir",newsletter:"Newsletter",inbox:"Inbox",projetos:"Projetos"}[i.origem]||i.origem));
    if(multi&&i.espaco_id)meta.push(bblEspNome(i.espaco_id));
    c.appendChild(h("div",{class:"cx-cab"},h("span",{class:"cx-ico","aria-hidden":"true",text:NUCLEO.BIB_ICO[i.tipo]||"📄"}),h("div",{class:"cx-corpo-item"},h("b",{class:"rac-t-cartao",text:i.titulo}),h("span",{class:"rac-t-legenda",text:meta.join(" · ")})),
      i.legado?rkSelo("neutro","Conexões"):null));
    if(i.descricao)c.appendChild(h("p",{class:"rac-t-sec cx-texto",text:i.descricao}));
    if(i.texto)c.appendChild(h("p",{class:"rac-t-sec cx-texto bb-texto",text:aberto||i.texto.length<=240?i.texto:i.texto.slice(0,240)+"…"}));
    if((i.etiquetas||[]).length){var tg=h("div",{class:"bb-tags"});i.etiquetas.forEach(function(x){tg.appendChild(h("span",{class:"rac-t-legenda bb-tag",text:"#"+x}))});c.appendChild(tg)}
    var ac=h("div",{class:"cx-acoes"}),msg=h("div",{class:"cap-st","aria-live":"polite"});
    if(ab.modo==="url"){var a=h("a",{class:"rac-btn rac-btn--pri",href:ab.url,target:"_blank",rel:"noopener noreferrer"},"Abrir ↗");ac.appendChild(a)}
    else if(ab.modo==="arquivo"){var o=rkBtn("pri","Abrir");o.onclick=function(){o.disabled=true;capAbrirArquivo(ab.bucket,ab.path,ab.nome).then(function(){o.disabled=false},function(e){o.disabled=false;msg.innerHTML="";msg.appendChild(rkEstado("erro","Não consegui abrir o arquivo ("+(e&&e.message||"sem acesso")+").",null))})};ac.appendChild(o)}
    else if(ab.modo==="rota")ac.appendChild(rkLink("pri","Abrir no original",ab.rota));
    else if(i.texto&&i.texto.length>240){var v=rkBtn("sec",aberto?"Mostrar menos":"Ler tudo");v.onclick=function(){BBL.aberto=aberto?null:i.id;bblDesenhar()};ac.appendChild(v)}
    if(!i.legado){var ed=rkBtn("sec","Editar"),ar=rkBtn("ter",i.arquivada_em?"Restaurar":"Arquivar"),ex=BBL.confirma===i.id?rkBtn("perigo","Confirmar: excluir"):rkBtn("ter","Excluir");
      ed.onclick=function(){BBL.form={modo:"editar",item:i,tipo:i.tipo};bblDesenhar();window.scrollTo(0,0)};
      ar.onclick=function(){bblAtualizar(i,{arquivada_em:i.arquivada_em?null:new Date().toISOString()})};
      ex.onclick=function(){if(BBL.confirma!==i.id){BBL.confirma=i.id;bblDesenhar();return}BBL.confirma=null;bblExcluir(i)};ac.appendChild(ed);ac.appendChild(ar);ac.appendChild(ex)}
    else ac.appendChild(rkLink("ter","Ver em Conexões","#conexoes"));
    c.appendChild(ac);c.appendChild(msg);return c}
  function bblAtualizar(i,mud){return bancoOuFila({t:"biblioteca_itens",acao:"update",id:i.id,dados:mud,reter:true}).then(function(){BBL.itens=BBL.itens.map(function(x){return x.id===i.id?Object.assign({},x,mud):x});bblDesenhar()},function(e){BBL.msg={tipo:"erro",titulo:"Não consegui atualizar",texto:e&&e.message};bblDesenhar()})}
  /* excluir apaga SÓ a referência; o arquivo do cofre ou o documento original ficam (o item da Captura de onde veio ainda pode apontar para eles) */
  function bblExcluir(i){return bancoOuFila({t:"biblioteca_itens",acao:"delete",id:i.id,reter:true}).then(function(){BBL.itens=BBL.itens.filter(function(x){return x.id!==i.id});BBL.msg={tipo:"ok",titulo:"Item excluído da Biblioteca",texto:"O arquivo ou documento original continua onde estava."};bblDesenhar()},function(e){BBL.msg={tipo:"erro",titulo:"Não consegui excluir",texto:e&&e.message};bblDesenhar()})}
  /* ---------- o formulário (guardar novo e editar) ---------- */
  function bblLab(t,el){return h("label",{class:"cx-campo"},h("span",{class:"rac-t-rotulo",text:t}),el)}
  function bblForm(){var F=BBL.form,edit=F.modo==="editar",it=F.item||{},box=h("div",{class:"rac-card bb-form"}),campos=h("div",{class:"cx-campos"}),st=h("div",{class:"cap-st","aria-live":"polite"});
    box.appendChild(h("h3",{class:"rac-t-cartao",text:edit?"Editar “"+it.titulo+"”":"Guardar na Biblioteca"}));
    if(!edit){var tp=h("div",{class:"cx-chips",role:"group","aria-label":"O que guardar"});[["link","Link"],["nota","Nota"],["arquivo","Arquivo"],["documento","Documento existente"]].forEach(function(t){tp.appendChild(bblChip(t[1],F.tipo===t[0],function(){F.tipo=t[0];bblDesenhar()}))});box.appendChild(tp)}
    var ti=h("input",{class:"rac-campo-entrada",type:"text",maxlength:"200",value:it.titulo||"",placeholder:"Título"}),et=h("input",{class:"rac-campo-entrada",type:"text",placeholder:"separe por vírgula",value:(it.etiquetas||[]).join(", ")}),ler;
    var tipo=edit?it.tipo:F.tipo;
    if(tipo==="link"||tipo==="referencia"){var url=h("input",{class:"rac-campo-entrada",type:"url",inputmode:"url",placeholder:"https://…",value:it.url||""}),ds=h("textarea",{class:"rac-campo-entrada",rows:"2",placeholder:"Nota curta (opcional)"});ds.value=it.descricao||"";
      campos.appendChild(bblLab("Endereço",url));campos.appendChild(bblLab("Título (opcional: usa o site)",ti));campos.appendChild(bblLab("Descrição",ds));
      ler=function(){var u=NUCLEO.urlAbs?NUCLEO.urlAbs(url.value):url.value.trim();if(!/^https?:\/\//i.test(u||""))throw new Error("Informe um endereço que comece com http:// ou https://");return {url:u,titulo:ti.value.trim()||NUCLEO.cpHost(u),descricao:ds.value.trim()||null}}}
    else if(tipo==="nota"){var tx=h("textarea",{class:"rac-campo-entrada",rows:"6",maxlength:"20000"});tx.value=it.texto||"";campos.appendChild(bblLab("Título",ti));campos.appendChild(bblLab("Texto",tx));
      ler=function(){if(!tx.value.trim())throw new Error("A nota está vazia.");return {titulo:ti.value.trim()||NUCLEO.cpTitulo(tx.value,null,80)||"Nota",texto:tx.value}}}
    else if(tipo==="arquivo"&&!edit){var arq=h("input",{type:"file",class:"rac-campo-entrada",accept:CAP_ACEITA,"aria-label":"Escolher o arquivo"});campos.appendChild(bblLab("Arquivo (até 50 MB)",arq));campos.appendChild(bblLab("Título (opcional)",ti));
      ler=function(){if(!arq.files||!arq.files[0])throw new Error("Escolha o arquivo.");return {arquivo:arq.files[0],titulo:ti.value.trim()}}}
    else if(tipo==="documento"&&!edit){var lst=h("div",{class:"bb-docs"}),fonte=h("select",{class:"rac-campo-entrada","aria-label":"De onde"},h("option",{value:"registros",text:"Documentos e fotos da Família"}),h("option",{value:"notas_fiscais_docs",text:"Arquivos das notas fiscais"}));
      var escolhido=null;function carregar(){lst.innerHTML="";lst.appendChild(rkEstado("carregando","Procurando…"));bblDocs(fonte.value).then(function(l){lst.innerHTML="";if(!l.length){lst.appendChild(rkEstado("vazio","Nenhum documento encontrado aqui.",null));return}
        l.forEach(function(d){var r=h("input",{type:"radio",name:"bbdoc","aria-label":d.titulo});r.onchange=function(){escolhido=d};lst.appendChild(h("label",{class:"bb-doc"},r,h("span",{class:"cx-corpo-item"},h("b",{class:"rac-t-cartao",text:d.titulo}),h("span",{class:"rac-t-legenda",text:d.sub}))))})},function(e){lst.innerHTML="";lst.appendChild(rkEstado("erro","Não consegui listar agora.",null))})}
      fonte.onchange=function(){escolhido=null;carregar()};campos.appendChild(bblLab("De onde",fonte));campos.appendChild(lst);carregar();campos.appendChild(h("p",{class:"rac-t-legenda",text:"Só cria a referência: o documento continua onde está e não é copiado."}));
      ler=function(){if(!escolhido)throw new Error("Escolha um documento da lista.");return {doc:escolhido,titulo:ti.value.trim()||escolhido.titulo}}}
    else {campos.appendChild(bblLab("Título",ti));var dsc=h("textarea",{class:"rac-campo-entrada",rows:"3"});dsc.value=it.descricao||"";campos.appendChild(bblLab("Descrição",dsc));ler=function(){return {titulo:ti.value.trim()||it.titulo,descricao:dsc.value.trim()||null}}}
    campos.appendChild(bblLab("Etiquetas",et));box.appendChild(campos);
    var ok=rkBtn("pri",edit?"Salvar":"Guardar"),cancela=rkBtn("ter","Cancelar");cancela.onclick=function(){BBL.form=null;bblDesenhar()};
    ok.onclick=function(){var d;try{d=ler()}catch(e){st.innerHTML="";st.appendChild(rkEstado("erro",e.message,null));return}ok.disabled=true;st.innerHTML="";st.appendChild(rkEstado("carregando","Guardando…"));
      bblSalvar(edit,it,tipo,d,NUCLEO.cpEtiquetas(et.value)).then(function(r){BBL.form=null;BBL.msg={tipo:"ok",titulo:edit?"Salvo":"Guardado na Biblioteca",texto:r&&r.enfileirado?"Sem internet: sobe sozinho quando a conexão voltar.":""};if(!edit)BBL.itens.unshift(r.item);else BBL.itens=BBL.itens.map(function(x){return x.id===it.id?r.item:x});bblDesenhar()},
        function(e){ok.disabled=false;st.innerHTML="";st.appendChild(rkEstado("erro",(e&&e.message)||"Não consegui guardar.",null))})};
    box.appendChild(h("div",{class:"cx-acoes"},ok,cancela));box.appendChild(st);return box}
  /* as fontes de "documento existente": só a leitura de quem já tem esses dados (RLS da casa); a Biblioteca guarda a referência */
  function bblDocs(fonte){
    if(fonte==="registros")return Promise.resolve(SB.from("registros").select("id,quem,tipo,titulo,data,arquivos").order("data",{ascending:false}).limit(120)).then(sbOk).then(function(l){var o=[];
      (l||[]).forEach(function(r){(r.arquivos||[]).forEach(function(a){if(a&&a.path)o.push({titulo:(r.titulo||r.tipo||"Registro")+" · "+(a.nome||String(a.path).split("/").pop()),sub:(FAM_NOMES[r.quem]||r.quem)+" · "+(r.data?dataBR(r.data):""),tabela:"registros",id:r.id,bucket:"familia",path:a.path,nome:a.nome||String(a.path).split("/").pop(),mime:a.tipo||null,
        rota:r.quem==="eddie"||r.quem==="olivia"?"#"+r.quem:r.quem==="civic"||r.quem==="moto"?"#veiculos":"#documentos"})})});return o.slice(0,80)});
    return Promise.resolve(SB.from("notas_fiscais_docs").select("id,nota_id,tipo,nome,path,mime,criado_em").order("criado_em",{ascending:false}).limit(80)).then(sbOk).then(function(l){return (l||[]).map(function(d){return {titulo:d.nome,sub:"Nota fiscal · "+d.tipo+" · "+dataBR(String(d.criado_em).slice(0,10)),tabela:"notas_fiscais_docs",id:d.id,bucket:"familia",path:d.path,nome:d.nome,mime:d.mime,rota:"#fiscal"}})})}
  /* salvar: monta a linha, confere (as mesmas regras do banco) e grava pela fila de sempre (com internet, na hora; sem, fica guardado e sobe sozinho) */
  function bblSalvar(edit,it,tipo,d,etiquetas){
    if(edit){var mud={titulo:String(d.titulo||it.titulo).slice(0,200),etiquetas:etiquetas};if(d.url!==undefined)mud.url=d.url;if(d.texto!==undefined)mud.texto=d.texto;if(d.descricao!==undefined)mud.descricao=d.descricao;
      var novo=Object.assign({},it,mud),v=NUCLEO.bibValidar(novo);if(!v.ok)return Promise.reject(new Error(v.erros[0]));
      return bancoOuFila({t:"biblioteca_itens",acao:"update",id:it.id,dados:mud,reter:true}).then(function(r){return {item:novo,enfileirado:!!(r&&r.enfileirado)}})}
    return capEspaco().then(function(esp){var id=novoId(),base={id:id,espaco_id:esp.id,criado_por:EU.id,tipo:tipo,titulo:String(d.titulo||"").slice(0,200),descricao:d.descricao||null,url:null,texto:null,ref:null,etiquetas:etiquetas,origem:"manual",captura_id:null,projeto_id:null,criado_em:new Date().toISOString(),arquivada_em:null},arquivos=[],p=Promise.resolve();
      if(tipo==="link"||tipo==="referencia"){base.url=d.url}else if(tipo==="nota"){base.texto=d.texto}
      else if(tipo==="documento"){var x=d.doc;base.ref={tabela:x.tabela,id:x.id,bucket:x.bucket,path:x.path,nome:x.nome,mime:x.mime,rota:x.rota};
        if(BBL.itens.some(function(i){return i.ref&&i.ref.path===x.path&&!i.arquivada_em}))return Promise.reject(new Error("Esse documento já está na Biblioteca."))}
      else if(tipo==="arquivo"){p=capPreparar(d.arquivo).then(function(pr){var path=NUCLEO.cpCaminho(esp.id,EU.id,id,pr.nome);base.titulo=base.titulo||pr.nome.replace(/\.[A-Za-z0-9]{1,5}$/,"");base.ref={tabela:"storage",bucket:"captura",path:path,nome:pr.nome,mime:pr.tipo,tamanho:pr.blob.size};arquivos=[path];return capArqPut(path,pr.blob,{nome:pr.nome,tipo:pr.tipo})})}
      return p.then(function(){var v=NUCLEO.bibValidar(base);if(!v.ok)throw new Error(v.erros[0]);
        var linha=Object.assign({},base);delete linha.criado_em;delete linha.arquivada_em;
        return bancoOuFila({t:"biblioteca_itens",acao:"upsert",dados:linha,reter:true,arquivos:arquivos}).then(function(r){return {item:base,enfileirado:!!(r&&r.enfileirado)}})}).catch(function(e){return Promise.all(arquivos.map(capArqDel)).then(function(){throw e})})})}
