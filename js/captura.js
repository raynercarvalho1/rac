/* Dia a Dia RAC — Captura universal e Caixa de entrada (Lote 4 do novo RAC; docs/planejamento/15, seção 3). Duas peças:
   1) o CAMPO de captura (capCompositor), que aparece em qualquer tela pelo botão "+" (js/app.js, abrirCaptura): texto, link, foto (câmera no celular) e arquivo. O que se captura vira na hora um item PENDENTE
      (tabela captura_itens, privada do autor): com internet grava direto; sem internet entra na MESMA fila de sempre (bancoOuFila, js/app.js), com o arquivo guardado neste aparelho (IndexedDB) até subir.
      O id nasce no aparelho e a gravação é "upsert, ignora repetido": reenviar nunca duplica.
   2) a CAIXA DE ENTRADA (#caixa): a pessoa vê o que está pendente, a sugestão de destino (classificação determinística, sem IA: NUCLEO.cpClassificar), edita e CONFIRMA. Só a confirmação encaminha: o registro nasce
      no módulo de destino (Lista, Lembretes, Biblioteca) usando a gravação que ele já tem, e o item guarda o destino ("classificado"); Desfazer remove o que foi criado e devolve o item a "pendente".
   Erros de sincronização ficam visíveis (a fila retém o item com o motivo) e dá para tentar de novo. Nada é enviado a IA. Só do dono neste lote (a Fernanda segue com a folha de antes). */
  var CAPX={espacos:null,itens:[],carregando:false,erro:null,filtro:"pendente",aberto:null,pend:0,confirmaTudo:false,msg:null,raiz:null,seq:0,edit:{}};
  var CAPX_MEM={},CAPX_DB=null,CAPX_LS_ESP="rac-cap-espacos:";
  function capLs(k,v){try{if(v===undefined)return JSON.parse(localStorage.getItem(k)||"null");localStorage.setItem(k,JSON.stringify(v))}catch(e){return null}}
  /* ---------- espaço: o ativo da Minha Casa (se a pessoa pode editar nele), senão o pessoal; a lista fica guardada no aparelho para capturar sem internet ---------- */
  function capEspacos(){if(CAPX.espacos)return Promise.resolve(CAPX.espacos);
    return Promise.resolve().then(function(){return SB.rpc("rac_iniciar_espacos")}).then(sbOk).then(function(l){CAPX.espacos=l||[];capLs(CAPX_LS_ESP+(EU&&EU.id),CAPX.espacos);return CAPX.espacos},
      function(){var c=capLs(CAPX_LS_ESP+(EU&&EU.id));if(c&&c.length){CAPX.espacos=c;return c}throw new Error("Abra o app com internet uma vez para preparar a captura.")})}
  function capEspaco(){return capEspacos().then(function(l){var ativo=null;try{ativo=localStorage.getItem("rac-ws-espaco:"+(EU&&EU.id))}catch(e){}var achou=null,pess=null;
      l.forEach(function(e){if(e.id===ativo)achou=e;if(e.tipo==="pessoal")pess=e});
      var esc=achou&&NUCLEO.wsPodeNoEspaco(achou.papel,"editar",achou.arquivado)?achou:pess;if(!esc)throw new Error("Nenhum espaço disponível para guardar.");return esc})}
  /* ---------- arquivos guardados neste aparelho até subirem (IndexedDB; sem ele, só na memória desta aba) ---------- */
  function capIdb(){if(CAPX_DB)return CAPX_DB;
    CAPX_DB=new Promise(function(ok,no){try{var r=indexedDB.open("rac-captura",1);r.onupgradeneeded=function(){r.result.createObjectStore("arquivos",{keyPath:"path"})};r.onsuccess=function(){ok(r.result)};r.onerror=function(){no(r.error)};r.onblocked=function(){no(new Error("bloqueado"))}}catch(e){no(e)}});return CAPX_DB}
  function capIdbOp(modo,fn){return capIdb().then(function(db){return new Promise(function(ok,no){var t=db.transaction("arquivos",modo),r=fn(t.objectStore("arquivos"));t.oncomplete=function(){ok(r&&r.result)};t.onerror=function(){no(t.error)};t.onabort=function(){no(t.error)}})})}
  function capArqPut(path,blob,meta){var reg={path:path,blob:blob,nome:meta.nome,tipo:meta.tipo};return capIdbOp("readwrite",function(s){return s.put(reg)}).then(function(){return true},function(){CAPX_MEM[path]=reg;return true})}
  function capArqGet(path){if(CAPX_MEM[path])return Promise.resolve(CAPX_MEM[path]);return capIdbOp("readonly",function(s){return s.get(path)}).then(function(r){return r||null},function(){return null})}
  function capArqDel(path){delete CAPX_MEM[path];return capIdbOp("readwrite",function(s){return s["delete"](path)}).then(function(){return true},function(){return true})}
  /* sobe os arquivos de uma operação da fila (chamado por executarOp em js/app.js); de novo é inofensivo (upsert); o arquivo sai do aparelho só depois de subir */
  function capSubirArquivos(paths){return (paths||[]).reduce(function(p,path){return p.then(function(){return capArqGet(path).then(function(a){if(!a)return;
      return Promise.resolve(SB.storage.from("captura").upload(path,a.blob,{contentType:a.tipo||a.blob.type||"application/octet-stream",upsert:true})).then(function(r){
        if(r&&r.error)throw new Error(r.error.message||"o arquivo não subiu");return capArqDel(path)})})})},Promise.resolve())}
  /* a foto grande vira JPEG de até 2000 px (o mesmo encolher() do resto do site) e o formato e o tamanho são conferidos ANTES de gravar */
  function capPreparar(f){return encolher(f).then(function(b){var nome=(b.name||f.name||"").trim()||("foto-"+Date.now()+".jpg");if(!/\.[A-Za-z0-9]{1,5}$/.test(nome))nome+=/^image\//.test(b.type||"")?".jpg":"";
      var tipo=NUCLEO.cpMimeDe(nome,b.type||f.type),v=NUCLEO.cpArquivoOk({nome:nome,tipo:tipo,tamanho:b.size});if(!v.ok)throw new Error(v.motivo);return {blob:b,nome:nome,tipo:v.mime}})}
  /* ---------- criar um item pendente: o ponto único de entrada (campo, foto, arquivo e compartilhar) ---------- */
  function capCriar(o){o=o||{};var texto=String(o.texto||"").trim(),files=(o.arquivos||[]).slice(0,1);
    if(!texto&&!files.length)return Promise.reject(new Error("Escreva algo ou anexe uma foto ou arquivo."));
    if(texto.length>NUCLEO.CP_MAX_TEXTO)return Promise.reject(new Error("O texto passa de 20 mil letras."));
    return capEspaco().then(function(esp){var id=novoId();
      return Promise.all(files.map(capPreparar)).then(function(prep){
        var anexos=prep.map(function(p){return {path:NUCLEO.cpCaminho(esp.id,EU.id,id,p.nome),nome:p.nome,tipo:p.tipo,tamanho:p.blob.size}});
        return Promise.all(prep.map(function(p,i){return capArqPut(anexos[i].path,p.blob,anexos[i])})).then(function(){
          var row=NUCLEO.cpItem({id:id,espaco:esp.id,usuario:EU.id,texto:texto,tipo:o.tipo,anexos:anexos,origem:o.origem,hoje:hojeISO()}),v=NUCLEO.cpValidar(row);
          if(!v.ok)throw new Error(v.erros[0]);
          return bancoOuFila({t:"captura_itens",acao:"upsert",dados:row,reter:true,arquivos:anexos.map(function(a){return a.path})}).then(function(r){
            if(!(r&&r.enfileirado))CAPX.pend++;capBadge();return {id:id,item:row,enfileirado:!!(r&&r.enfileirado)}})
        }).catch(function(e){return Promise.all(anexos.map(function(a){return capArqDel(a.path)})).then(function(){throw e})})})})}
  /* ---------- o número no botão "+" (pendentes no banco + o que espera na fila deste aparelho) ---------- */
  function capContar(){return Promise.resolve().then(function(){return SB.from("captura_itens").select("id",{count:"exact",head:true}).eq("estado","pendente")}).then(function(r){if(r.error)throw new Error(r.error.message);CAPX.pend=r.count||0;capBadge()},function(){capBadge()})}
  function capBadge(){var b=$(".capbtn");if(!b||!isOwner())return;var n=CAPX.pend+NUCLEO.cpFilaItens(filaLer()).length,c=b.querySelector(".capcnt");
    if(!n){if(c)c.remove();return}if(!c){c=h("span",{class:"capcnt","aria-hidden":"true"});b.appendChild(c)}c.textContent=n>99?"99+":String(n)}
  function capAquecer(){capEspaco().then(function(){return capContar()},function(){capBadge()})}
  function capAbrirArquivo(bucket,path,nome){var w=window.open("","_blank");   /* abre a janela no toque (o iPhone bloqueia depois) e só depois pede a URL temporária */
    return Promise.resolve(SB.storage.from(bucket).createSignedUrl(path,120)).then(function(r){if(r.error||!r.data||!r.data.signedUrl)throw new Error(r.error&&r.error.message||"sem acesso ao arquivo");if(w){w.opener=null;w.location.href=r.data.signedUrl}else location.href=r.data.signedUrl},
      function(e){if(w)w.close();throw e})}

  /* ===================== o campo de captura (dentro da folha do botão "+") ===================== */
  var CAP_TIPOS_ESC=[["","Tipo: automático"],["ideia","Ideia"],["tarefa","Tarefa"],["referencia","Referência"],["observacao","Observação"]];
  var CAP_ACEITA="image/*,application/pdf,text/plain,text/markdown,text/csv,application/zip,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,video/mp4,video/quicktime";
  function capCompositor(host,opc){opc=opc||{};host.innerHTML="";
    var txt=h("textarea",{class:"rac-campo-entrada cap-txt",rows:"3",maxlength:"20000",placeholder:"Escreva, cole um link ou anexe uma foto ou arquivo…","aria-label":"O que você quer guardar?"}),
      tipo=h("select",{class:"rac-campo-entrada cap-tipo","aria-label":"Tipo do que você está guardando"},CAP_TIPOS_ESC.map(function(t){return h("option",{value:t[0],text:t[1]})})),
      cam=h("input",{type:"file",accept:"image/*",capture:"environment",hidden:"","aria-hidden":"true",tabindex:"-1"}),arq=h("input",{type:"file",accept:CAP_ACEITA,hidden:"","aria-hidden":"true",tabindex:"-1"}),
      bFoto=rkBtn("sec","📷 Foto",{"aria-label":"Tirar uma foto ou escolher da galeria"}),bArq=rkBtn("sec","📎 Arquivo"),bOk=rkBtn("pri","Guardar"),st=h("div",{class:"cap-st","aria-live":"polite"});
    function ocupado(sim){[txt,tipo,bFoto,bArq,bOk].forEach(function(e){e.disabled=!!sim})}
    function mostrar(no){st.innerHTML="";if(no)st.appendChild(no)}
    function enviar(arquivos){var t=txt.value;if(!t.trim()&&!arquivos.length){txt.focus();return}
      ocupado(true);mostrar(rkEstado("carregando","Guardando…"));
      capCriar({texto:t,tipo:tipo.value,arquivos:arquivos,origem:opc.origem||"app"}).then(function(r){txt.value="";tipo.value="";
        var sug=r.item.sugestao&&r.item.sugestao.rotulo,a=h("a",{class:"rac-btn rac-btn--ter",href:"#caixa"},"Abrir a caixa"+(CAPX.pend?" ("+CAPX.pend+")":""));a.onclick=function(){if(opc.fechar)opc.fechar()};
        mostrar(rkEstado("ok",(r.enfileirado?"⏳ Sem internet: guardado neste aparelho, sobe sozinho. ":"Guardado na caixa. ")+(sug?"Sugestão: "+sug+".":""),a));ocupado(false);txt.focus()},
        function(e){mostrar(rkEstado("erro",(e&&e.message)||"Não consegui guardar.",null));ocupado(false)})}
    bOk.onclick=function(){enviar([])};
    bFoto.onclick=function(){cam.value="";cam.click()};bArq.onclick=function(){arq.value="";arq.click()};
    [cam,arq].forEach(function(inp){inp.onchange=function(){var f=inp.files&&inp.files[0];inp.value="";if(f)enviar([f])}});
    txt.addEventListener("keydown",function(e){if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();bOk.click()}});
    txt.addEventListener("paste",function(e){var f=e.clipboardData&&e.clipboardData.files&&e.clipboardData.files[0];if(f){e.preventDefault();enviar([f])}});
    host.appendChild(h("div",{class:"cap-comp"},txt,h("div",{class:"cap-linha"},tipo,bFoto,bArq,bOk),cam,arq,st));
    setTimeout(function(){if(!(window.matchMedia&&matchMedia("(pointer:coarse)").matches))txt.focus()},60)}

  /* ===================== a Caixa de entrada (#caixa) ===================== */
  var CX_FILTROS=[["pendente","Pendentes"],["classificado","Encaminhados"],["arquivado","Arquivados"],["descartado","Descartados"]];
  var CX_ROTA={lista:"#lista",lembretes:"#agenda",biblioteca:"#biblioteca",fiscal:"#fiscal"};
  function cxQuando(iso){var d=new Date(iso);if(isNaN(d))return "";var hoje=hojeISO(),dia=d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2),hm=("0"+d.getHours()).slice(-2)+":"+("0"+d.getMinutes()).slice(-2);
    return dia===hoje?"hoje "+hm:dia.slice(8,10)+"/"+dia.slice(5,7)+" "+hm}
  function cxChip(texto,ativo,fn){var b=h("button",{type:"button",class:"rac-chip","aria-pressed":ativo?"true":"false",text:texto});b.onclick=fn;return b}
  function renderCaixa(){var root=$("#caixa-view");root.innerHTML="";CAPX.raiz=root;
    if(!isOwner()){root.appendChild(h("div",{class:"panel"},h("p",{class:"empty",text:"A Caixa de entrada ainda não está liberada para esta conta."})));return}
    var novo=rkBtn("fantasma","＋ Capturar"),bib=h("a",{class:"rac-btn rac-btn--fantasma",href:"#biblioteca"},"📚 Biblioteca");novo.onclick=function(){abrirCaptura()};
    root.appendChild(h("div",{class:"cx"},h("div",{class:"rh-hero wk-hero"},h("div",null,h("h2",{text:"Caixa de entrada"}),h("p",{class:"rh-hero-data",text:"Tudo o que você capturou e ainda não decidiu onde guardar. Nada vai a lugar nenhum sem a sua confirmação."})),h("div",{class:"wk-barra"},novo,bib)),
      h("div",{class:"cx-corpo stack"})));
    cxCarregar()}
  function cxCarregar(){var seq=++CAPX.seq;CAPX.carregando=true;CAPX.erro=null;cxDesenhar();
    return Promise.resolve().then(function(){return SB.from("captura_itens").select("*").order("criado_em",{ascending:false}).limit(300)}).then(sbOk).then(function(l){if(seq!==CAPX.seq)return;CAPX.itens=l||[];CAPX.carregando=false;
      CAPX.pend=CAPX.itens.filter(function(i){return i.estado==="pendente"}).length;capBadge();cxDesenhar()},
      function(e){if(seq!==CAPX.seq)return;CAPX.carregando=false;CAPX.erro=semRede(e)?"Sem conexão: mostrando só o que está neste aparelho.":"Não consegui ler a caixa agora.";logErro("captura",e);cxDesenhar()})}
  function cxItemLocal(id,mud){CAPX.itens=CAPX.itens.map(function(i){return i.id===id?Object.assign({},i,mud):i})}
  function cxTitulo(i){return NUCLEO.cpTitulo(i.conteudo,i.anexos,90)||"(sem título)"}
  function cxDesenhar(){var corpo=CAPX.raiz&&CAPX.raiz.querySelector(".cx-corpo");if(!corpo)return;corpo.innerHTML="";
    var c=NUCLEO.cpContar(CAPX.itens),fila=NUCLEO.cpFilaItens(filaLer());
    if(CAPX.msg){corpo.appendChild(rkAlerta(CAPX.msg.tipo,CAPX.msg.titulo,CAPX.msg.texto||"",null));CAPX.msg=null}
    if(c.antigos)corpo.appendChild(rkAlerta("aviso",c.antigos+(c.antigos===1?" item espera":" itens esperam")+" há mais de 3 dias","Decida o destino, arquive ou descarte. Nada expira sozinho.",null));
    if(fila.length)corpo.appendChild(cxFila(fila));
    var chips=h("div",{class:"cx-chips",role:"group","aria-label":"Estado dos itens"});CX_FILTROS.forEach(function(f){chips.appendChild(cxChip(f[1]+" ("+c[f[0]]+")",CAPX.filtro===f[0],function(){CAPX.filtro=f[0];CAPX.aberto=null;CAPX.confirmaTudo=false;cxDesenhar()}))});
    corpo.appendChild(h("div",{class:"rac-card cx-ctl"},chips));
    if(CAPX.carregando&&!CAPX.itens.length){corpo.appendChild(rkEstado("carregando","Lendo a caixa…"));return}
    if(CAPX.erro){var tenta=rkBtn("sec","Tentar de novo");tenta.onclick=cxCarregar;corpo.appendChild(rkEstado("erro",CAPX.erro,tenta))}
    var lista=NUCLEO.cpOrdenar(CAPX.itens.filter(function(i){return i.estado===CAPX.filtro}));
    if(!lista.length){if(!CAPX.erro)corpo.appendChild(rkEstado("vazio",CAPX.filtro==="pendente"?"Caixa vazia. Use o botão + para capturar um texto, link, foto ou arquivo.":"Nada aqui por enquanto.",null));return}
    if(CAPX.filtro==="pendente"&&lista.length>1){var tudo=CAPX.confirmaTudo?rkBtn("perigo","Confirmar: arquivar "+lista.length+" itens"):rkBtn("ter","Arquivar tudo");
      tudo.onclick=function(){if(!CAPX.confirmaTudo){CAPX.confirmaTudo=true;cxDesenhar();return}CAPX.confirmaTudo=false;lista.reduce(function(p,i){return p.then(function(){return cxMudar(i,"arquivado")})},Promise.resolve()).then(cxDesenhar)};
      corpo.appendChild(h("div",{class:"rac-card cx-tudo"},tudo))}
    lista.forEach(function(i){corpo.appendChild(cxCartao(i))})}
  /* o que espera na fila DESTE aparelho: ainda não chegou ao banco (sem internet) ou travou com erro (dá para tentar de novo ou descartar) */
  function cxFila(fila){var lis=fila.map(function(f){var it=f.dados,erro=f.erro,linha=h("div",{class:"cx-fila-item"},h("span",{class:"cx-ico","aria-hidden":"true",text:NUCLEO.CP_TIPO_ICO[it.tipo]||"📝"}),
        h("div",{class:"cx-corpo-item"},h("b",{class:"rac-t-cartao",text:cxTitulo(it)}),h("span",{class:"rac-t-legenda",text:erro?"Não subiu: "+erro:"Aguardando a conexão"+(f.arquivos?" · "+f.arquivos+(f.arquivos===1?" arquivo guardado no aparelho":" arquivos guardados no aparelho"):"")})),
        h("div",{class:"cx-acoes"},erro?rkSelo("erro","erro"):rkSelo("info","na fila")));
      if(erro){var t=rkBtn("sec","Tentar novamente"),d=rkBtn("ter","Descartar da fila");t.onclick=function(){filaTentarDe(it.id);cxCarregar()};
        d.onclick=function(){filaRemoverDe(it.id).forEach(function(op){(op.arquivos||[]).forEach(capArqDel)});capBadge();cxDesenhar()};linha.querySelector(".cx-acoes").appendChild(t);linha.querySelector(".cx-acoes").appendChild(d)}
      return linha});
    return rkCard("Aguardando envio neste aparelho",h("div",{class:"cx-fila"},lis),{sub:"Nada se perde: fica guardado aqui e sobe quando a conexão voltar."})}
  /* mudar o estado de um item (arquivar, descartar, voltar): na mesma fila; a tela muda na hora */
  function cxMudar(it,estado,extra){var mud=Object.assign({estado:estado},extra||{}),local=Object.assign({},mud);if(estado!=="classificado"){mud.destino=null;mud.classificado_em=null;local.destino=null;local.classificado_em=null}
    return bancoOuFila({t:"captura_itens",acao:"update",id:it.id,dados:mud,reter:true}).then(function(){cxItemLocal(it.id,local);CAPX.pend=CAPX.itens.filter(function(i){return i.estado==="pendente"}).length;capBadge()},
      function(e){CAPX.msg={tipo:"erro",titulo:"Não consegui atualizar",texto:e&&e.message};cxDesenhar();throw e})}
  function cxCartao(it){var sug=it.estado==="pendente"?NUCLEO.cpClassificar({texto:it.conteudo,tipo:it.tipo==="texto"||it.tipo==="link"||it.tipo==="foto"||it.tipo==="arquivo"?"":it.tipo,anexos:it.anexos,hoje:hojeISO()}):null,
      aberto=CAPX.aberto===it.id,anexo=(it.anexos||[])[0];
    var cab=h("div",{class:"cx-cab"},h("span",{class:"cx-ico","aria-hidden":"true",text:NUCLEO.CP_TIPO_ICO[it.tipo]||"📝"}),
      h("div",{class:"cx-corpo-item"},h("b",{class:"rac-t-cartao",text:cxTitulo(it)}),h("span",{class:"rac-t-legenda",text:NUCLEO.CP_TIPO_ROTULO[it.tipo]+" · "+cxQuando(it.criado_em)+(anexo?" · "+anexo.nome:"")+(it._local?" · ⏳ sincronizando":"")})));
    var c=h("div",{class:"rac-card cx-item","data-id":it.id},cab),ac=h("div",{class:"cx-acoes"});
    if(it.conteudo&&it.conteudo.length>cxTitulo(it).length+3)c.appendChild(h("p",{class:"rac-t-sec cx-texto",text:it.conteudo.length>400?it.conteudo.slice(0,400)+"…":it.conteudo}));
    if(it.estado==="pendente"){var s=sug.sugestao;c.appendChild(h("p",{class:"rac-t-legenda cx-sug"},"Sugestão: ",h("b",{text:s.rotulo}),"  ·  "+s.motivo));
      var ok=rkBtn("pri","✓ "+s.rotulo),alt=rkBtn("sec",aberto?"Fechar":"Alterar e conferir"),desc=rkBtn("ter","Descartar");
      ok.onclick=function(){cxConfirmar(it,{destino:s.destino,dados:s.dados},ok)};alt.onclick=function(){CAPX.aberto=aberto?null:it.id;cxDesenhar()};desc.onclick=function(){cxMudar(it,"descartado").then(cxDesenhar,function(){})};
      ac.appendChild(ok);ac.appendChild(alt);ac.appendChild(desc);c.appendChild(ac);if(aberto)c.appendChild(cxPainel(it,sug))}
    else if(it.estado==="classificado"){var d=it.destino||{},rota=CX_ROTA[d.modulo],des=rkBtn("sec","Desfazer"),abre=rota?rkLink("ter","Abrir",rota):null;
      c.appendChild(h("p",{class:"rac-t-legenda cx-sug"},"Enviado para ",h("b",{text:NUCLEO.cpDestinoRotulo(d)}),it.classificado_em?" · "+cxQuando(it.classificado_em):""));
      des.onclick=function(){cxDesfazer(it,des)};ac.appendChild(des);if(abre)ac.appendChild(abre);c.appendChild(ac)}
    else{var volta=rkBtn("sec","Voltar para pendentes");volta.onclick=function(){cxMudar(it,"pendente").then(cxDesenhar,function(){})};ac.appendChild(volta);
      var exc=rkBtn("ter","Excluir de vez");exc.onclick=function(){cxExcluir(it)};ac.appendChild(exc);c.appendChild(ac)}
    return c}
  /* o painel de conferência: o destino (a sugestão e as outras possibilidades) e os campos do destino, editáveis, antes de confirmar */
  function cxPainel(it,sug){var edit=CAPX.edit[it.id]||(CAPX.edit[it.id]={}),cands=[sug.sugestao].concat(sug.alternativas);
    var box=h("div",{class:"cx-painel"}),opcoes=h("div",{class:"cx-chips",role:"group","aria-label":"Destino"}),campos=h("div",{class:"cx-campos"}),conf=rkBtn("pri","Confirmar e enviar"),msg=h("div",{class:"cap-st","aria-live":"polite"});
    function chave(c){return c.destino+":"+(c.dados.tipo||"")+":"+(c.dados.tag||"")}
    var atual=cands.filter(function(c){return chave(c)===edit.chave})[0]||cands[0];
    function escolher(c){edit.chave=chave(c);atual=c;opcoes.innerHTML="";cands.forEach(function(x){opcoes.appendChild(cxChip(x.rotulo,x===c,function(){escolher(x)}))});cxCampos(it,c,campos,edit)}
    conf.onclick=function(){var d=edit.ler?edit.ler():atual.dados;cxConfirmar(it,{destino:atual.destino,dados:d},conf,msg)};
    box.appendChild(h("span",{class:"rac-t-rotulo",text:"Para onde vai"}));box.appendChild(opcoes);box.appendChild(campos);box.appendChild(h("div",{class:"cx-acoes"},conf));box.appendChild(msg);escolher(atual);return box}
  function cxLab(texto,el){return h("label",{class:"cx-campo"},h("span",{class:"rac-t-rotulo",text:texto}),el)}
  function cxCampos(it,c,host,edit){host.innerHTML="";var d=c.dados||{},des=c.destino;
    if(des==="lista"){var tipo=h("select",{class:"rac-campo-entrada"},h("option",{value:"compra",text:"Lista de compras"}),h("option",{value:"tarefa",text:"Tarefas da casa"})),ta=h("textarea",{class:"rac-campo-entrada",rows:"4"});
      tipo.value=d.tipo==="tarefa"?"tarefa":"compra";ta.value=(d.itens||NUCLEO.cpLinhas(it.conteudo)).join("\n");host.appendChild(cxLab("Lista",tipo));host.appendChild(cxLab("Itens (um por linha)",ta));
      edit.ler=function(){return {tipo:tipo.value,itens:ta.value.split("\n")}}}
    else if(des==="lembrete"){var t=h("input",{class:"rac-campo-entrada",type:"text",maxlength:"200",value:d.titulo||""}),dt=h("input",{class:"rac-campo-entrada",type:"date",value:d.data||hojeISO()}),hr=h("input",{class:"rac-campo-entrada",type:"time",value:d.hora||""});
      host.appendChild(cxLab("O quê",t));host.appendChild(h("div",{class:"cx-duplo"},cxLab("Quando",dt),cxLab("Hora (opcional)",hr)));edit.ler=function(){return {titulo:t.value,data:dt.value,hora:hr.value||null}}}
    else if(des==="projeto"){var tg=h("input",{class:"rac-campo-entrada",type:"text",maxlength:"40",value:d.tag||""}),ti=h("input",{class:"rac-campo-entrada",type:"text",maxlength:"200",value:d.titulo||""});
      host.appendChild(cxLab("Projeto (marca #)",tg));host.appendChild(cxLab("Título da nota",ti));host.appendChild(h("p",{class:"rac-t-legenda",text:"Projetos completos chegam depois: por enquanto a nota fica na Biblioteca, com a marca do projeto."}));
      edit.ler=function(){return {tag:NUCLEO.cpEtiquetas([tg.value])[0]||"",titulo:ti.value}}}
    else if(des==="fiscal"){host.appendChild(h("p",{class:"rac-t-sec",text:"Abre a Central Fiscal para você lançar a nota. O arquivo continua guardado aqui, na caixa."}));edit.ler=function(){return {}}}
    else{var tipos=[["nota","Nota"],["link","Link"],["referencia","Referência"]];if((it.anexos||[]).length)tipos.push(["arquivo","Arquivo"]);
      var sel=h("select",{class:"rac-campo-entrada"},tipos.map(function(x){return h("option",{value:x[0],text:x[1]})})),ti2=h("input",{class:"rac-campo-entrada",type:"text",maxlength:"200",value:d.titulo||cxTitulo(it)}),
        url=h("input",{class:"rac-campo-entrada",type:"url",inputmode:"url",placeholder:"https://…",value:d.url||NUCLEO.cpUrls(it.conteudo)[0]||""}),tx=h("textarea",{class:"rac-campo-entrada",rows:"4"}),et=h("input",{class:"rac-campo-entrada",type:"text",placeholder:"separe por vírgula",value:(d.etiquetas||[]).join(", ")});
      tx.value=it.conteudo||"";sel.value=d.tipo&&tipos.some(function(x){return x[0]===d.tipo})?d.tipo:"nota";
      var uCampo=cxLab("Endereço",url),tCampo=cxLab("Texto",tx);
      function ver(){uCampo.hidden=!(sel.value==="link"||sel.value==="referencia");tCampo.hidden=sel.value==="link"||sel.value==="arquivo"}
      sel.onchange=ver;host.appendChild(cxLab("Guardar como",sel));host.appendChild(cxLab("Título",ti2));host.appendChild(uCampo);host.appendChild(tCampo);host.appendChild(cxLab("Etiquetas",et));ver();
      edit.ler=function(){return {tipo:sel.value,titulo:ti2.value,url:url.value.trim()||null,texto:tx.value,etiquetas:et.value}}}}
  /* CONFIRMAR: cria o registro no módulo de destino com a gravação que ele já tem e marca o item. Tudo na mesma fila; o id do destino é gerado aqui (reenviar não duplica). */
  function cxConfirmar(it,escolha,botao,msg){var plano=NUCLEO.cpPlano(it,escolha,novoId);
    function erro(t){if(msg){msg.innerHTML="";msg.appendChild(rkEstado("erro",t,null))}else{CAPX.msg={tipo:"erro",titulo:"Não consegui encaminhar",texto:t};cxDesenhar()}}
    if(!plano.ok){erro(plano.erro);return Promise.resolve()}
    if(botao)botao.disabled=true;var agora=new Date().toISOString(),destino=Object.assign({em:agora},plano.destino),p=Promise.resolve(),fila=false;
    function nota(r){if(r&&r.enfileirado)fila=true}
    if(plano.lista)p=p.then(function(){return bancoOuFila({t:"lista",acao:"upsert",dados:plano.lista.linhas,reter:true}).then(nota)});
    if(plano.lembrete)p=p.then(function(){pessoalGravar("lembretes",[{id:plano.lembrete.id,data:plano.lembrete.data,t:plano.lembrete.t}].concat(PESSOAL.lembretes||[]))});
    if(plano.biblioteca)p=p.then(function(){return bancoOuFila({t:"biblioteca_itens",acao:"upsert",dados:plano.biblioteca,reter:true}).then(nota)});
    return p.then(function(){return cxMudar(it,"classificado",{destino:destino,classificado_em:agora})}).then(function(){
      if(fila)cxItemLocal(it.id,{_local:true});CAPX.aberto=null;delete CAPX.edit[it.id];
      CAPX.msg={tipo:"ok",titulo:"Enviado para "+NUCLEO.cpDestinoRotulo(destino),texto:"Dá para desfazer em Encaminhados."};
      if(plano.fiscal){location.hash=plano.fiscal.rota;return}cxDesenhar()},function(e){if(botao)botao.disabled=false;if(!CAPX.msg)erro((e&&e.message)||"Não consegui encaminhar.")})}
  /* DESFAZER: remove o que o encaminhamento criou (só o que ele criou) e devolve o item a pendente */
  function cxDesfazer(it,botao){var d=it.destino||{},p=Promise.resolve();if(botao)botao.disabled=true;
    if(d.modulo==="lista")(d.ids||[]).forEach(function(id){p=p.then(function(){return bancoOuFila({t:"lista",acao:"delete",id:id,reter:true})})});
    else if(d.modulo==="lembretes")p=p.then(function(){pessoalGravar("lembretes",(PESSOAL.lembretes||[]).filter(function(l){return l.id!==d.id}))});
    else if(d.modulo==="biblioteca")p=p.then(function(){return bancoOuFila({t:"biblioteca_itens",acao:"delete",id:d.id,reter:true})});
    return p.then(function(){return cxMudar(it,"pendente")}).then(function(){CAPX.filtro="pendente";CAPX.msg={tipo:"ok",titulo:"Desfeito",texto:"O item voltou para os pendentes."};cxDesenhar()},function(e){if(botao)botao.disabled=false;CAPX.msg={tipo:"erro",titulo:"Não consegui desfazer",texto:e&&e.message};cxDesenhar()})}
  /* EXCLUIR DE VEZ (só arquivado ou descartado): apaga a linha e o arquivo; o banco não deixa apagar arquivo que a Biblioteca ainda usa */
  function cxExcluir(it){var paths=(it.anexos||[]).map(function(a){return a.path});
    Promise.resolve(paths.length?SB.storage.from("captura").remove(paths):null).then(function(){return bancoOuFila({t:"captura_itens",acao:"delete",id:it.id,reter:true})}).then(function(){CAPX.itens=CAPX.itens.filter(function(i){return i.id!==it.id});cxDesenhar()},function(e){CAPX.msg={tipo:"erro",titulo:"Não consegui excluir",texto:e&&e.message};cxDesenhar()})}
