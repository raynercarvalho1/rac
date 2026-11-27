/* Dia a Dia RAC — Workspace (Lote 1 do novo RAC; docs/planejamento/14-arquitetura-do-workspace.md): a TELA e a persistência. Páginas e layouts moram no banco (workspace_paginas, 070) e valem por espaço
   (espacos, 070); todas as contas do motor (mover, redimensionar, configurar, ocultar, remover, desativar, desfazer, conflito) são funções puras do núcleo (NUCLEO.ws*), e os tipos de
   widget vêm do catálogo (js/widgets.js, js/widgets-base.js). Aqui só se desenha, se liga ao banco e se trata a interação.
   O banco é quem decide o que cada pessoa pode ler e gravar (RLS); a tela só esconde o que ele recusaria. O Workspace guarda LAYOUT: nunca apaga nem altera dado de negócio.
   Só o dono vê esta página no Lote 1 (a Fernanda continua com as telas de sempre; os espaços dela chegam no Lote 8). */
  var WK={seq:0,raiz:null,espacos:null,espaco:null,paginas:[],prefs:[],pagina:null,layout:null,salvo:null,edicao:false,sujo:false,futuro:false,undo:[],redo:[],ops:[],opsRedo:[],
    foco:null,anuncio:null,recolhidas:{},mostrarOcultos:false,arrastando:null,menu:null,salvando:false,larg:0};
  var WK_CHAVE_ESPACO="rac-ws-espaco:",WK_CHAVE_RASCUNHO="rac-ws-rascunho:";
  function wkLS(k,v){try{if(v===undefined)return localStorage.getItem(k);if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){}return null}
  function wkMsg(e){var m=String(e&&e.message||e||"");
    if(/row-level security|42501|permission denied/i.test(m))return "Você não tem permissão para isso neste espaço.";
    if(/23505|duplicate key|unique/i.test(m))return "Já existe uma página com este nome neste espaço.";
    if(/limite_de_paginas/.test(m))return "Este espaço já tem o máximo de 30 páginas ativas.";
    if(/23514|workspace_layout_valido/.test(m))return "O banco recusou este layout (fora do formato ou grande demais).";
    if(/mfa/i.test(m))return "Falta a segunda etapa do login (código do app autenticador).";
    return m||"Falha desconhecida."}
  /* ---------- contexto: papel, permissões, ctx dos widgets ---------- */
  function wkPapel(){return WK.espaco?WK.espaco.papel:null}
  function wkPode(nivel){return !!WK.espaco&&NUCLEO.wsPodeNoEspaco(WK.espaco.papel,nivel,WK.espaco.arquivado)}
  function wkAcessivel(id){return isOwner()||DA_CASA.indexOf(id)>=0}
  function wkCtxTipo(){return {tipoEspaco:WK.espaco&&WK.espaco.tipo,papel:wkPapel(),modulos:tabs.filter(wkAcessivel),dono:isOwner()}}
  function wkLer(nome){return fonteOuErro(nome,{})}
  function wkCtxWidget(it){return {config:it.config,tamanho:{col:it.col,lin:it.lin},edicao:WK.edicao,usuario:{id:EU&&EU.id},espaco:WK.espaco,ler:wkLer,acessivel:wkAcessivel,abrir:function(a){location.hash=a}}}
  function wkAnunciar(t){if(WK.anuncio)WK.anuncio.textContent=t}
  function wkOcultosPessoais(){var p=WK.pagina,r=null;WK.prefs.forEach(function(x){if(p&&x.pagina_id===p.id)r=x});return r?r.ocultos||[]:[]}
  function wkFavorita(id){var f=false;WK.prefs.forEach(function(x){if(x.pagina_id===id&&x.favorita)f=true});return f}
  /* ---------- carregar ---------- */
  function renderWorkspace(a){
    var root=$("#workspace-view"),seq=++WK.seq;WK.raiz=root;root.innerHTML="";
    if(!isOwner()){root.appendChild(h("div",{class:"panel"},h("p",{class:"empty",text:"O Workspace ainda não está liberado para esta conta."})));return}
    if(WK.edicao&&WK.sujo&&WK.pagina&&(!a||a===WK.pagina.id)){wkDesenhar();return}   /* voltou para a página com alterações não salvas: continua de onde estava */
    WK.edicao=false;WK.sujo=false;
    root.appendChild(h("div",{class:"panel"},loading()));
    wkCarregar(a).then(function(){if(seq!==WK.seq)return;wkDesenhar()},function(e){if(seq!==WK.seq)return;root.innerHTML="";root.appendChild(h("div",{class:"panel"},failed(function(){renderWorkspace(a)},e)))})}
  /* a mesma leitura do botão ↻ (js/app.js): se há alteração não salva, a atualização espera */
  atuRegistrar("workspace",{ocupado:function(){return WK.edicao&&WK.sujo?"Você está personalizando esta página: salve ou cancele antes de atualizar.":""},
    atualizar:function(){return wkCarregar(WK.pagina&&WK.pagina.id).then(function(){if(document.documentElement.getAttribute("data-sec")==="workspace")wkDesenhar();return 0})}});
  function wkCarregar(paginaId){
    return Promise.resolve().then(function(){return SB.rpc("rac_iniciar_espacos")}).then(sbOk).then(function(lista){
      WK.espacos=lista||[];var id=wkLS(WK_CHAVE_ESPACO+EU.id),achou=null,pess=null;
      WK.espacos.forEach(function(e){if(e.id===id)achou=e;if(e.tipo==="pessoal")pess=e});
      WK.espaco=achou||pess||WK.espacos[0]||null;
      if(!WK.espaco)throw new Error("nenhum espaço disponível para esta conta");
      return Promise.all([SB.from("workspace_paginas").select("*").eq("espaco_id",WK.espaco.id).is("arquivada_em",null).order("ordem",{ascending:true}).then(sbOk),
        SB.from("workspace_pessoal").select("pagina_id,ocultos,favorita").then(sbOk)])}).then(function(r){
      WK.paginas=r[0]||[];WK.prefs=r[1]||[];var p=null;
      if(paginaId)WK.paginas.forEach(function(x){if(x.id===paginaId)p=x});
      WK.pagina=p||NUCLEO.wsPaginaInicial(WK.paginas,WK.prefs);
      wkAbrirPagina(WK.pagina)})}
  function wkAbrirPagina(p){
    try{WK.recolhidas=JSON.parse(wkLS("rac-ws-recolhidas:"+EU.id)||"{}")||{}}catch(e){WK.recolhidas={}}
    WK.pagina=p;WK.undo=[];WK.redo=[];WK.ops=[];WK.opsRedo=[];WK.sujo=false;WK.futuro=false;WK.rascunho=null;
    if(!p){WK.layout=null;WK.salvo=null;return}
    var m=NUCLEO.wsMigrar(p.layout);WK.futuro=m.futuro;
    var c=m.futuro?{layout:m.doc,avisos:[]}:NUCLEO.wsMigrarConfigs(m.doc,WIDGETS);
    WK.layout=c.layout;WK.salvo=NUCLEO.wsClonar(c.layout);
    var raw=wkLS(WK_CHAVE_RASCUNHO+EU.id+":"+p.id);if(raw){try{var d=JSON.parse(raw);if(d&&d.versao===p.versao&&d.layout)WK.rascunho=d;else wkLS(WK_CHAVE_RASCUNHO+EU.id+":"+p.id,null)}catch(e){}}}
  /* ---------- ações sobre páginas e espaços (persistência) ---------- */
  function wkAtualizarPagina(p,campos){
    return SB.from("workspace_paginas").update(campos).eq("id",p.id).eq("versao",p.versao).select("*").then(sbOk).then(function(rows){
      if(!rows||!rows.length){var e=new Error("a página mudou em outro aparelho");e.conflito=true;throw e}
      return rows[0]})}
  function wkSubstituirPagina(row){var i;for(i=0;i<WK.paginas.length;i++)if(WK.paginas[i].id===row.id)WK.paginas[i]=row;if(WK.pagina&&WK.pagina.id===row.id)WK.pagina=row}
  function wkCriarPagina(titulo,modelo){
    var t=NUCLEO.wsTituloOk(titulo,WK.paginas);if(!t.ok)return Promise.reject(new Error(t.motivo==="repetido"?"Já existe uma página com este nome.":t.motivo==="vazio"?"Dê um nome à página.":"Nome grande demais (máximo 60)."));
    if(WK.paginas.length>=NUCLEO.WS_MAX_PAGINAS)return Promise.reject(new Error("Este espaço já tem o máximo de 30 páginas ativas."));
    var lay=NUCLEO.wsLayoutPadrao(WIDGETS,modelo==="dia"?["data.hoje","atalhos.rotas"].concat(wkPodeTipo(WIDGETS["agenda.proximos"])?["agenda.proximos"]:[]):[]);
    return SB.from("workspace_paginas").insert({id:novoId(),espaco_id:WK.espaco.id,titulo:t.titulo,ordem:WK.paginas.length,layout:lay}).select("*").then(sbOk).then(function(rows){
      WK.paginas.push(rows[0]);wkAbrirPagina(rows[0]);return rows[0]})}
  function wkPodeTipo(def){return !!def&&NUCLEO.wsPodeUsarTipo(def,wkCtxTipo()).ok}
  function wkRenomear(p,titulo){var t=NUCLEO.wsTituloOk(titulo,WK.paginas,p.id);if(!t.ok)return Promise.reject(new Error(t.motivo==="repetido"?"Já existe uma página com este nome.":"Nome inválido."));
    return wkAtualizarPagina(p,{titulo:t.titulo}).then(wkSubstituirPagina)}
  function wkArquivar(p){return wkAtualizarPagina(p,{arquivada_em:new Date().toISOString()}).then(function(){WK.paginas=WK.paginas.filter(function(x){return x.id!==p.id});wkLS(WK_CHAVE_RASCUNHO+EU.id+":"+p.id,null);wkAbrirPagina(NUCLEO.wsPaginaInicial(WK.paginas,WK.prefs))})}
  function wkMoverPagina(p,delta){var ups=NUCLEO.wsMoverPagina(WK.paginas,p.id,delta);if(!ups.length)return Promise.resolve();
    return Promise.all(ups.map(function(u){return SB.from("workspace_paginas").update({ordem:u.ordem}).eq("id",u.id).select("*").then(sbOk).then(function(r){if(r&&r[0])wkSubstituirPagina(r[0])})}))}
  function wkPrefGravar(paginaId,campos){
    var antes=WK.prefs.filter(function(x){return x.pagina_id===paginaId})[0],novo=Object.assign({pagina_id:paginaId,ocultos:antes?antes.ocultos:[],favorita:antes?!!antes.favorita:false},campos);
    function sub(){var ok=false;WK.prefs=WK.prefs.map(function(x){if(x.pagina_id===paginaId){ok=true;return novo}return x});if(!ok)WK.prefs.push(novo)}
    return Promise.resolve().then(function(){if(!campos.favorita)return;return SB.from("workspace_pessoal").update({favorita:false}).eq("user_id",EU.id).eq("favorita",true).select("pagina_id").then(sbOk).then(function(){WK.prefs.forEach(function(x){x.favorita=false})})})
      .then(function(){return SB.from("workspace_pessoal").upsert({user_id:EU.id,pagina_id:paginaId,ocultos:novo.ocultos,favorita:novo.favorita,atualizado_em:new Date().toISOString()},{onConflict:"user_id,pagina_id"}).select("pagina_id").then(sbOk)}).then(sub)}
  /* ---------- operações de edição (tudo vira operação: desfazer, refazer e repetir sobre uma versão mais nova) ---------- */
  function wkOp(op,anuncio){
    var r=NUCLEO.wsAplicarOp(WK.layout,op,WIDGETS);
    if(!r.ok){wkAviso(wkMotivo(r.motivo),"aviso");return r}
    WK.undo.push(WK.layout);if(WK.undo.length>50)WK.undo.shift();WK.redo=[];WK.opsRedo=[];WK.ops.push(op);WK.layout=r.layout;WK.sujo=true;
    wkGuardarRascunho();if(anuncio)wkAnunciar(anuncio);wkDesenharGrade();wkBarra();return r}
  function wkMotivo(m){return {limite_de_componentes:"A página já tem o máximo de 60 componentes.",limite_de_secoes:"A página já tem o máximo de 12 seções.",ja_no_inicio:"Já está no início.",ja_no_fim:"Já está no fim.",ultima_secao:"A página precisa ter ao menos uma seção.",tipo_desconhecido:"Este componente não está mais disponível."}[m]||"Não foi possível: "+m}
  function wkDesfazer(){if(!WK.undo.length)return;WK.redo.push(WK.layout);WK.opsRedo.push(WK.ops.pop());WK.layout=WK.undo.pop();WK.sujo=WK.undo.length>0||WK.ops.length>0;wkGuardarRascunho();wkDesenharGrade();wkBarra();wkAnunciar("Desfeito.")}
  function wkRefazer(){if(!WK.redo.length)return;WK.undo.push(WK.layout);WK.ops.push(WK.opsRedo.pop());WK.layout=WK.redo.pop();WK.sujo=true;wkGuardarRascunho();wkDesenharGrade();wkBarra();wkAnunciar("Refeito.")}
  function wkGuardarRascunho(){if(!WK.pagina)return;wkLS(WK_CHAVE_RASCUNHO+EU.id+":"+WK.pagina.id,WK.sujo?JSON.stringify({versao:WK.pagina.versao,layout:WK.layout,ops:WK.ops,t:Date.now()}):null)}
  function wkEntrarEdicao(){if(!WK.pagina||!wkPode("editar")||WK.futuro)return;WK.edicao=true;WK.mostrarOcultos=true;wkDesenhar()}
  function wkSair(descartar){WK.edicao=false;WK.mostrarOcultos=false;if(descartar){WK.layout=NUCLEO.wsClonar(WK.salvo);WK.undo=[];WK.redo=[];WK.ops=[];WK.opsRedo=[];WK.sujo=false;wkLS(WK_CHAVE_RASCUNHO+EU.id+":"+WK.pagina.id,null)}wkDesenhar()}
  /* salvar: a versão esperada é a que esta tela leu; se outro aparelho gravou antes, ou só mexeu na ordem/título (layout igual), ou há conflito de verdade e a pessoa escolhe */
  function wkSalvar(){
    var p=WK.pagina,v=NUCLEO.wsValidar(WK.layout);if(!v.ok){wkAviso("Não dá para salvar: "+v.erros[0],"erro");return Promise.resolve(false)}
    if(WK.salvando)return Promise.resolve(false);WK.salvando=true;wkBarra();
    var fim=atuTarefa("salvando a página");
    return wkAtualizarPagina(p,{layout:WK.layout,schema_versao:NUCLEO.WS_SCHEMA}).then(function(row){wkSubstituirPagina(row);return wkSalvou(row)},function(e){
      if(!e.conflito)throw e;return wkConflito()}).then(function(ok){WK.salvando=false;fim();wkBarra();return ok},function(e){WK.salvando=false;fim();logErro("workspace",e);wkAviso("Não salvou: "+wkMsg(e)+" Suas alterações continuam aqui (e neste aparelho).","erro");wkBarra();return false})}
  function wkSalvou(row){WK.salvo=NUCLEO.wsClonar(WK.layout);WK.undo=[];WK.redo=[];WK.ops=[];WK.opsRedo=[];WK.sujo=false;WK.edicao=false;WK.mostrarOcultos=false;wkLS(WK_CHAVE_RASCUNHO+EU.id+":"+row.id,null);wkDesenhar();wkAviso("Salvo.","ok");return true}
  function wkConflito(){
    var p=WK.pagina;
    return SB.from("workspace_paginas").select("*").eq("id",p.id).then(sbOk).then(function(rows){var s=rows&&rows[0];
      if(!s)throw new Error("esta página não existe mais");
      var sl=NUCLEO.wsMigrar(s.layout).doc;
      /* o servidor só mudou título, ordem ou arquivamento (o layout é o mesmo que esta tela leu): tenta de novo com a versão nova, sem incomodar */
      if(JSON.stringify(sl)===JSON.stringify(WK.salvo)){return wkAtualizarPagina(s,{layout:WK.layout,schema_versao:NUCLEO.WS_SCHEMA}).then(function(row){wkSubstituirPagina(row);return wkSalvou(row)})}
      return wkDecidirConflito(s,sl)})}
  function wkDecidirConflito(s,sl){
    return new Promise(function(ok){
      var d=NUCLEO.wsDiff(WK.salvo,sl),corpo=h("div",{class:"stack"}),mine=h("button",{type:"button",text:"Aplicar minhas alterações sobre a versão nova"}),srv=h("button",{type:"button",class:"ghostbtn",text:"Usar a versão do outro aparelho (descartar as minhas)"});
      corpo.appendChild(h("p",null,"Esta página foi alterada em outro aparelho depois que você começou ("+d.adicionados.length+" componente(s) novo(s), "+d.removidos.length+" removido(s), "+d.alterados.length+" alterado(s))."));
      corpo.appendChild(h("div",{class:"vfil"},mine,srv));
      var f=wkFolha("Alteração em outro aparelho",corpo,function(){ok(false)});
      mine.onclick=function(){var r=NUCLEO.wsAplicarOps(sl,WK.ops,WIDGETS);WK.pagina=s;WK.layout=r.layout;WK.salvo=NUCLEO.wsClonar(sl);WK.sujo=true;f.fechar(true);
        if(r.ignoradas.length)wkAviso(r.ignoradas.length+" alteração(ões) sua(s) não coube(ram) (o componente já tinha sido removido). Confira e salve de novo.","aviso");else wkAviso("Suas alterações foram aplicadas sobre a versão nova. Confira e salve.","aviso");wkDesenhar();ok(false)};
      srv.onclick=function(){WK.pagina=s;WK.layout=NUCLEO.wsClonar(sl);WK.salvo=NUCLEO.wsClonar(sl);WK.undo=[];WK.redo=[];WK.ops=[];WK.opsRedo=[];WK.sujo=false;WK.edicao=false;wkLS(WK_CHAVE_RASCUNHO+EU.id+":"+s.id,null);f.fechar(true);wkSubstituirPagina(s);wkDesenhar();ok(false)}})}
  /* ---------- folhas (janelas), menus e avisos ---------- */
  function wkFolha(titulo,corpo,aoFechar){
    var fundo=h("div",{class:"capfundo wk-fundo",role:"presentation"}),folha=h("div",{class:"capfolha panel wk-folha",role:"dialog","aria-modal":"true","aria-label":titulo}),fx=h("button",{type:"button",class:"ghostbtn",text:"Fechar"}),
      foco=document.activeElement,feito=false;
    folha.appendChild(h("div",{class:"caph"},h("b",{text:titulo}),fx));folha.appendChild(corpo);fundo.appendChild(folha);document.body.appendChild(fundo);
    function fechar(mudo){if(feito)return;feito=true;document.removeEventListener("keydown",tecla,true);if(fundo.parentNode)fundo.parentNode.removeChild(fundo);if(!mudo&&aoFechar)aoFechar();try{if(foco&&foco.focus&&document.body.contains(foco))foco.focus()}catch(e){}}
    function tecla(e){if(e.key==="Escape"){e.stopPropagation();fechar()}else if(e.key==="Tab"){var els=[].slice.call(folha.querySelectorAll("button,input,select,textarea,a[href]")).filter(function(x){return !x.disabled&&x.offsetParent!==null});if(!els.length)return;
      var i=els.indexOf(document.activeElement);if(e.shiftKey&&i<=0){e.preventDefault();els[els.length-1].focus()}else if(!e.shiftKey&&i===els.length-1){e.preventDefault();els[0].focus()}}}
    fx.onclick=function(){fechar()};fundo.onclick=function(e){if(e.target===fundo)fechar()};document.addEventListener("keydown",tecla,true);
    setTimeout(function(){var el=folha.querySelector("input,select,textarea,button:not(.ghostbtn)");if(el)el.focus()},30);
    return {fechar:fechar,folha:folha}}
  function wkFecharMenu(){if(WK.menu){var m=WK.menu;WK.menu=null;if(m.el.parentNode)m.el.parentNode.removeChild(m.el);document.removeEventListener("pointerdown",m.fora,true);document.removeEventListener("keydown",m.tecla,true);try{if(m.botao&&document.body.contains(m.botao))m.botao.focus()}catch(e){}}}
  /* menu de ações ancorado num botão; itens: [{rotulo, acao, perigo?, desligado?, titulo?}] ou "-" para separar */
  function wkMenu(botao,itens){
    wkFecharMenu();var el=h("div",{class:"wk-menu",role:"menu"}),btns=[];
    itens.forEach(function(it){if(it==="-"){el.appendChild(h("hr",{class:"wk-menu-sep"}));return}
      var b=h("button",{type:"button",role:"menuitem",class:"wk-menu-it"+(it.perigo?" perigo":""),text:it.rotulo,title:it.titulo||null,disabled:it.desligado?"":null});
      b.onclick=function(){wkFecharMenu();it.acao()};el.appendChild(b);btns.push(b)});
    document.body.appendChild(el);
    var r=botao.getBoundingClientRect(),w=el.offsetWidth,x=Math.max(8,Math.min(window.innerWidth-w-8,r.right-w)),y=r.bottom+4;if(y+el.offsetHeight>window.innerHeight-8)y=Math.max(8,r.top-el.offsetHeight-4);
    el.style.left=(x+window.scrollX)+"px";el.style.top=(y+window.scrollY)+"px";
    function fora(e){if(!el.contains(e.target)&&e.target!==botao)wkFecharMenu()}
    function tecla(e){if(e.key==="Escape"){e.preventDefault();wkFecharMenu()}else if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();var ativos=btns.filter(function(b){return !b.disabled}),i=ativos.indexOf(document.activeElement);i=e.key==="ArrowDown"?(i+1)%ativos.length:(i<=0?ativos.length-1:i-1);ativos[i].focus()}}
    WK.menu={el:el,botao:botao,fora:fora,tecla:tecla};document.addEventListener("pointerdown",fora,true);document.addEventListener("keydown",tecla,true);
    var p=btns.filter(function(b){return !b.disabled})[0];if(p)p.focus()}
  function wkAviso(txt,tipo){var a=WK.raiz&&WK.raiz.querySelector(".wk-aviso");if(!a)return;a.innerHTML="";if(!txt)return;a.appendChild(rkEstado(tipo==="erro"?"erro":tipo==="ok"?"ok":"aviso",txt));wkAnunciar(txt)}
  /* ---------- desenho da página ---------- */
  function wkDesenhar(){
    var root=WK.raiz;if(!root)return;wkFecharMenu();root.innerHTML="";
    WK.larg=window.innerWidth;
    var cab=h("div",{class:"wk-topo"}),aviso=h("div",{class:"wk-aviso",role:"status"});WK.anuncio=h("div",{class:"sr-only wk-anuncio","aria-live":"polite",role:"status"});
    root.appendChild(h("div",{class:"wk"+(WK.edicao?" wk-edicao":"")},cab,aviso,WK.anuncio,h("div",{class:"wk-pagina"})));
    wkTopo(cab);
    if(!WK.pagina){root.querySelector(".wk-pagina").appendChild(wkVazio());return}
    if(WK.rascunho&&!WK.edicao){var c=h("button",{type:"button",text:"Continuar o rascunho"}),d=h("button",{type:"button",class:"ghostbtn",text:"Descartar"});
      c.onclick=function(){WK.layout=NUCLEO.wsClonar(WK.rascunho.layout);WK.ops=WK.rascunho.ops||[];WK.sujo=true;WK.rascunho=null;WK.edicao=true;wkDesenhar()};
      d.onclick=function(){wkLS(WK_CHAVE_RASCUNHO+EU.id+":"+WK.pagina.id,null);WK.rascunho=null;wkDesenhar()};
      aviso.appendChild(h("div",{class:"rac-estado rac-estado--aviso",role:"status"},h("span",{class:"rac-t-texto",text:"Há alterações não salvas desta página neste aparelho."}),h("span",{class:"vfil"},c,d)))}
    if(WK.futuro)aviso.appendChild(rkEstado("aviso","Esta página foi salva por uma versão mais nova do app. Atualize o app para editar; por enquanto ela só pode ser vista."));
    wkDesenharGrade();wkBarra()}
  function wkVazio(){
    var box=h("div",{class:"panel wk-vazio"}),pode=wkPode("editar");
    box.appendChild(h("h2",{text:"Nenhuma página ainda"}));
    box.appendChild(h("p",{class:"sub",text:pode?"Crie uma página e monte a tela do seu jeito: você escolhe os componentes, o tamanho e a ordem, sem depender de ninguém.":"Este espaço ainda não tem páginas e você só pode ver."}));
    if(pode){var v=h("button",{type:"button",text:"Criar página vazia"}),m=h("button",{type:"button",class:"ghostbtn",text:"Criar a partir do modelo “Dia a dia”"});
      v.onclick=function(){wkNovaPagina("vazia")};m.onclick=function(){wkNovaPagina("dia")};box.appendChild(h("div",{class:"vfil"},v,m))}
    return box}
  function wkNovaPagina(modelo){
    var corpo=h("div",{class:"stack"}),inp=h("input",{type:"text",maxlength:"60",placeholder:"Ex.: Minha Casa, Trabalho, Fim de semana","aria-label":"Nome da página"}),st=h("p",{class:"sub",role:"status"}),ok=h("button",{type:"button",text:"Criar página"});
    inp.value=modelo==="dia"?"Dia a dia":(WK.paginas.length?"":"Minha Casa");
    corpo.appendChild(h("label",null,"Nome da página",inp));corpo.appendChild(h("div",{class:"vfil"},ok));corpo.appendChild(st);
    var f=wkFolha(modelo==="dia"?"Nova página (modelo Dia a dia)":"Nova página",corpo);
    function criar(){ok.disabled=true;st.textContent="Criando…";wkCriarPagina(inp.value,modelo).then(function(){f.fechar(true);wkDesenhar();wkEntrarEdicao()},function(e){ok.disabled=false;st.textContent=wkMsg(e)})}
    ok.onclick=criar;inp.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();criar()}})}
  /* o topo: espaço, páginas (abas) e ações */
  function wkTopo(cab){
    var linha=h("div",{class:"wk-linha"});
    if(WK.espacos&&WK.espacos.length>1){var sel=h("select",{"aria-label":"Espaço",class:"wk-sel-espaco"});WK.espacos.forEach(function(e){sel.appendChild(h("option",{value:e.id,text:(e.tipo==="pessoal"?"🔒 ":"👥 ")+e.nome+(e.papel!=="proprietario"?" ("+e.papel+")":""),selected:e.id===WK.espaco.id?"":null}))});
      sel.onchange=function(){if(WK.edicao&&WK.sujo&&!confirm("Descartar as alterações não salvas desta página?")){sel.value=WK.espaco.id;return}wkLS(WK_CHAVE_ESPACO+EU.id,sel.value);WK.edicao=false;WK.sujo=false;WK.raiz.innerHTML="";WK.raiz.appendChild(h("div",{class:"panel"},loading()));var s=++WK.seq;wkCarregar().then(function(){if(s===WK.seq)wkDesenhar()},function(e){WK.raiz.innerHTML="";WK.raiz.appendChild(h("div",{class:"panel"},failed(function(){renderWorkspace()},e)))})};
      linha.appendChild(sel)}
    else if(WK.espaco)linha.appendChild(h("span",{class:"rac-selo rac-selo--neutro",text:(WK.espaco.tipo==="pessoal"?"🔒 ":"👥 ")+WK.espaco.nome}));
    var abas=h("div",{class:"wk-abas",role:"tablist","aria-label":"Páginas"});
    NUCLEO.wsOrdenarPaginas(WK.paginas).forEach(function(p){var b=h("button",{type:"button",role:"tab",class:"wk-aba","aria-selected":WK.pagina&&WK.pagina.id===p.id?"true":"false",text:(wkFavorita(p.id)?"★ ":"")+p.titulo});
      b.onclick=function(){if(WK.pagina&&WK.pagina.id===p.id)return;if(WK.edicao&&WK.sujo&&!confirm("Descartar as alterações não salvas desta página?"))return;WK.edicao=false;wkAbrirPagina(p);wkDesenhar()};abas.appendChild(b)});
    if(wkPode("editar")){var n=h("button",{type:"button",class:"wk-aba wk-aba-nova",text:"+ Nova página","aria-label":"Criar nova página"});n.onclick=function(){wkNovaPagina("vazia")};abas.appendChild(n)}
    linha.appendChild(abas);cab.appendChild(linha);cab.appendChild(h("div",{class:"wk-barra"}))}
  /* a barra de ações da página: muda com o modo (ver × personalizar) */
  function wkBarra(){
    var barra=WK.raiz&&WK.raiz.querySelector(".wk-barra");if(!barra)return;barra.innerHTML="";var p=WK.pagina;if(!p)return;
    if(WK.edicao){
      var ok=h("button",{type:"button",text:WK.salvando?"Salvando…":"Concluir",disabled:WK.salvando?"":null,class:"wk-concluir"}),ca=h("button",{type:"button",class:"ghostbtn",text:"Cancelar"}),
        de=h("button",{type:"button",class:"ghostbtn",text:"↶ Desfazer","aria-label":"Desfazer",disabled:WK.undo.length?null:""}),re=h("button",{type:"button",class:"ghostbtn",text:"↷ Refazer","aria-label":"Refazer",disabled:WK.redo.length?null:""}),
        sec=h("button",{type:"button",class:"ghostbtn",text:"+ Seção"}),hi=h("button",{type:"button",class:"ghostbtn",text:"Histórico"});
      ok.onclick=function(){wkSalvar()};ca.onclick=function(){if(WK.sujo&&!confirm("Descartar as alterações não salvas desta página?"))return;wkSair(true)};de.onclick=wkDesfazer;re.onclick=wkRefazer;
      sec.onclick=function(){var t=prompt("Nome da nova seção (pode ficar em branco):","");if(t===null)return;wkOp({op:"secao-adicionar",titulo:t},"Seção adicionada.")};hi.onclick=wkHistorico;
      barra.appendChild(h("span",{class:"rac-selo rac-selo--aviso",text:WK.sujo?"Personalizando · alterações não salvas":"Personalizando"}));
      [de,re,sec,hi,ca,ok].forEach(function(b){barra.appendChild(b)});
    }else{
      if(wkPode("editar")&&!WK.futuro){var e=h("button",{type:"button",text:"Personalizar"});e.onclick=wkEntrarEdicao;barra.appendChild(e)}
      var m=h("button",{type:"button",class:"ghostbtn","aria-haspopup":"menu","aria-label":"Mais ações da página",text:"⋯"});
      m.onclick=function(){wkMenuPagina(m)};barra.appendChild(m);
      var ocultos=wkOcultosPessoais().length;if(ocultos){var mo=h("button",{type:"button",class:"ghostbtn",text:(WK.mostrarOcultos?"Esconder":"Mostrar")+" "+ocultos+" oculto"+(ocultos>1?"s":"")+" por mim"});mo.onclick=function(){WK.mostrarOcultos=!WK.mostrarOcultos;wkDesenhar()};barra.appendChild(mo)}}
  }
  function wkMenuPagina(botao){
    var p=WK.pagina,pode=wkPode("editar");
    wkMenu(botao,[{rotulo:wkFavorita(p.id)?"✓ É minha página inicial":"Definir como minha página inicial",acao:function(){wkPrefGravar(p.id,{favorita:true}).then(wkDesenhar,function(e){wkAviso(wkMsg(e),"erro")})},desligado:wkFavorita(p.id)},
      "-",{rotulo:"Renomear página…",acao:function(){var t=prompt("Novo nome da página:",p.titulo);if(t===null)return;wkRenomear(p,t).then(wkDesenhar,function(e){wkAviso(e.conflito?"A página mudou em outro aparelho. Atualize e tente de novo.":wkMsg(e),"erro")})},desligado:!pode},
      {rotulo:"Mover página para a esquerda",acao:function(){wkMoverPagina(p,-1).then(wkDesenhar,function(e){wkAviso(wkMsg(e),"erro")})},desligado:!pode},
      {rotulo:"Mover página para a direita",acao:function(){wkMoverPagina(p,1).then(wkDesenhar,function(e){wkAviso(wkMsg(e),"erro")})},desligado:!pode},
      {rotulo:"Histórico de versões",acao:wkHistorico,desligado:!pode},"-",
      {rotulo:"Arquivar página…",perigo:true,titulo:"A página sai da lista; os dados dos módulos não são tocados.",desligado:!wkPode("administrar")&&!(WK.espaco&&WK.espaco.tipo==="pessoal"),
        acao:function(){if(!confirm("Arquivar a página “"+p.titulo+"”? Ela deixa de aparecer, mas nenhum dado dos módulos é apagado."))return;wkArquivar(p).then(wkDesenhar,function(e){wkAviso(wkMsg(e),"erro")})}}])}
  /* histórico: as últimas versões salvas; escolher uma abre a edição já com aquele layout (a pessoa confere e conclui) */
  function wkHistorico(){
    var p=WK.pagina,corpo=h("div",{class:"stack"},loading()),f=wkFolha("Histórico de versões",corpo);
    SB.from("workspace_versoes").select("versao,layout,titulo,quando,motivo").eq("pagina_id",p.id).order("versao",{ascending:false}).limit(30).then(sbOk).then(function(v){corpo.innerHTML="";
      if(!v.length){corpo.appendChild(h("p",{class:"empty",text:"Ainda não há versões anteriores."}));return}
      var ul=h("ul",{class:"wl"});v.forEach(function(x){var b=h("button",{type:"button",class:"ghostbtn",text:"Restaurar"});
        b.onclick=function(){var m=NUCLEO.wsMigrar(x.layout);f.fechar(true);if(!WK.edicao)WK.edicao=true;WK.undo.push(WK.layout);WK.redo=[];WK.opsRedo=[];WK.ops=[];WK.layout=m.doc;WK.sujo=true;wkGuardarRascunho();wkDesenhar();wkAviso("Versão "+x.versao+" carregada. Confira e toque em Concluir para salvar.","aviso")};
        ul.appendChild(h("li",null,h("span",{class:"grow"},h("b",{text:"Versão "+x.versao+" · "+x.motivo}),h("span",{class:"sub",text:new Date(x.quando).toLocaleString("pt-BR")+" · "+x.titulo})),b))});
      corpo.appendChild(ul)},function(e){corpo.innerHTML="";corpo.appendChild(h("p",{class:"empty",text:wkMsg(e)}))})}
  /* ---------- a grade ---------- */
  function wkDesenharGrade(){
    var alvo=WK.raiz&&WK.raiz.querySelector(".wk-pagina");if(!alvo||!WK.pagina)return;
    var y=window.scrollY;alvo.innerHTML="";
    var vis=NUCLEO.wsVisao(WK.layout,{edicao:WK.edicao,ocultosPessoais:wkOcultosPessoais(),mostrarPessoais:WK.mostrarOcultos,catalogo:WIDGETS,mobile:window.innerWidth<=860,permite:function(def){return NUCLEO.wsPodeUsarTipo(def,wkCtxTipo())}});
    var total=0;
    vis.forEach(function(s,si){total+=s.itens.length;alvo.appendChild(wkSecao(s,si,vis.length))});
    if(!total&&!WK.edicao){alvo.appendChild(h("div",{class:"panel wk-vazio"},h("h2",{text:"Esta página está vazia"}),h("p",{class:"sub",text:wkPode("editar")?"Toque em Personalizar para adicionar componentes.":"Ainda não há nada aqui."})))}
    window.scrollTo(0,y);
    if(WK.foco){var el=alvo.querySelector('[data-foco="'+WK.foco+'"]');if(el)el.focus();WK.foco=null}}
  function wkSecao(s,si,n){
    var box=h("section",{class:"wk-secao","data-secao":s.id,"aria-label":s.titulo||"Seção "+(si+1)});
    if(s.titulo||WK.edicao){var cab=h("div",{class:"wk-secao-cab"});
      if(WK.edicao){var t=h("input",{type:"text",class:"wk-secao-titulo",value:s.titulo,maxlength:"60","aria-label":"Nome da seção "+(si+1),placeholder:"Nome da seção"});
        t.onchange=function(){wkOp({op:"secao-renomear",id:s.id,titulo:t.value})};cab.appendChild(t);
        var mn=h("button",{type:"button",class:"ghostbtn wk-mini","aria-haspopup":"menu","aria-label":"Ações da seção "+(si+1),text:"⋯"});
        mn.onclick=function(){wkMenu(mn,[{rotulo:"+ Adicionar componente",acao:function(){wkCatalogo(s.id)}},"-",{rotulo:s.recolhida?"Expandir seção":"Recolher seção",acao:function(){wkOp({op:"secao-recolher",id:s.id,recolhida:!s.recolhida})}},
          {rotulo:"Subir seção",acao:function(){wkOp({op:"secao-mover",id:s.id,delta:-1})},desligado:si===0},{rotulo:"Descer seção",acao:function(){wkOp({op:"secao-mover",id:s.id,delta:1})},desligado:si===n-1},"-",
          {rotulo:"Remover seção",perigo:true,titulo:"Os componentes dela vão para a seção vizinha; nada é apagado.",desligado:n<=1,acao:function(){wkOp({op:"secao-remover",id:s.id},"Seção removida; os componentes foram para a vizinha.")}}])};cab.appendChild(mn)}
      else{var rec=wkRecolhida(s),rb=h("button",{type:"button",class:"wk-secao-nome","aria-expanded":rec?"false":"true",text:(rec?"▸ ":"▾ ")+s.titulo});
        rb.onclick=function(){wkRecolherLocal(s.id,!wkRecolhida(s));wkDesenharGrade()};cab.appendChild(rb)}
      box.appendChild(cab)}
    if(!wkRecolhida(s)||WK.edicao){var g=h("div",{class:"wk-grade","data-secao":s.id});
      s.itens.forEach(function(x){g.appendChild(wkItem(x,s.id))});
      if(!s.itens.length&&WK.edicao){var a=h("button",{type:"button",class:"wk-add-vazio",text:"+ Adicionar componente"});a.onclick=function(){wkCatalogo(s.id)};g.appendChild(a)}
      box.appendChild(g);
      if(WK.edicao&&s.itens.length){var b=h("button",{type:"button",class:"ghostbtn wk-add",text:"+ Adicionar componente"});b.onclick=function(){wkCatalogo(s.id)};box.appendChild(b)}}
    return box}
  /* recolher uma seção na vista (sem personalizar) é só da pessoa: vale neste aparelho, não altera o layout compartilhado */
  function wkRecolhidaChave(secaoId){return WK.pagina.id+":"+secaoId}
  function wkRecolhida(s){var v=WK.recolhidas[wkRecolhidaChave(s.id)];return v===undefined?!!s.recolhida:v}
  function wkRecolherLocal(secaoId,rec){WK.recolhidas[wkRecolhidaChave(secaoId)]=rec;try{wkLS("rac-ws-recolhidas:"+EU.id,JSON.stringify(WK.recolhidas))}catch(e){}}
  function wkItem(x,secaoId){
    var it=x.item,def=x.def,sit=x.situacao,cols=NUCLEO.wsColunasPara(window.innerWidth),
      el=h("article",{class:"rac-card wk-item wk-sit-"+sit+(it.estado!=="ativo"||x.pessoalOculto?" wk-apagado":""),"data-id":it.id,"data-secao":secaoId,
        style:"--c12:"+it.col+";--c8:"+NUCLEO.wsEscala(it.col,8)+";--lin:"+it.lin}),
      tit=def?def.titulo:"Componente indisponível",cab=h("div",{class:"wk-item-cab"});
    if(WK.edicao){var al=h("button",{type:"button",class:"wk-alca","data-foco":"alca:"+it.id,"aria-label":"Mover "+tit+". Setas movem; Shift com as setas muda o tamanho.",title:"Arraste para mover (ou use as setas)",text:"⠿"});
      wkLigarArrasto(al,it.id);al.addEventListener("keydown",function(e){wkTeclaAlca(e,x)});cab.appendChild(al)}
    cab.appendChild(h("h3",{class:"rac-t-cartao wk-item-tit",text:tit+(it.estado==="oculto"?" (oculto)":it.estado==="desativado"?" (desativado)":x.pessoalOculto?" (oculto por mim)":"")}));
    if(WK.edicao){var mn=h("button",{type:"button",class:"ghostbtn wk-mini","data-foco":"menu:"+it.id,"aria-haspopup":"menu","aria-label":"Ações de "+tit,text:"⋯"});mn.onclick=function(){wkMenuItem(mn,x)};cab.appendChild(mn)}
    else if(WK.espaco&&WK.espaco.tipo==="compartilhado"){var oc=h("button",{type:"button",class:"ghostbtn wk-mini","aria-label":"Ocultar "+tit+" só para mim",title:"Ocultar só para mim",text:x.pessoalOculto?"Mostrar":"Ocultar"});
      oc.onclick=function(){var l=wkOcultosPessoais().slice(),i=l.indexOf(it.id);if(i>=0)l.splice(i,1);else l.push(it.id);wkPrefGravar(WK.pagina.id,{ocultos:NUCLEO.wsOcultosValidos(WK.layout,l)}).then(wkDesenhar,function(e){wkAviso(wkMsg(e),"erro")})};cab.appendChild(oc)}
    el.appendChild(cab);
    var corpo=h("div",{class:"wk-corpo"});
    if(sit==="indisponivel"){var r=h("button",{type:"button",class:"ghostbtn",text:"Remover da página"});r.onclick=function(){wkOp({op:"remover",id:it.id},"Componente removido da página.")};
      corpo.appendChild(rkEstado("aviso","Este componente ("+it.tipo+") não existe mais nesta versão do app. A configuração dele foi guardada.",WK.edicao?r:null))}
    else if(sit==="versao_futura")corpo.appendChild(rkEstado("aviso","Salvo por uma versão mais nova do app. Atualize o app para usar este componente."));
    else if(sit==="sem_permissao")corpo.appendChild(rkEstado("aviso","Você não tem acesso a este conteúdo."));
    else if(sit==="desativado")corpo.appendChild(rkEstado("aviso","Componente desativado: não consulta dados nem gera avisos. Reative no menu ⋯."));
    else if(sit==="oculto"&&WK.edicao)corpo.appendChild(rkEstado("aviso","Oculto: não aparece na vista. Mostre pelo menu ⋯."));
    else corpo.appendChild(widgetCorpo(def,it,wkCtxWidget(it)));
    el.appendChild(corpo);
    if(WK.edicao&&cols>1){var rz=h("button",{type:"button",class:"wk-redim","aria-label":"Redimensionar "+tit,title:"Arraste para redimensionar",text:"◢"});wkLigarRedim(rz,x,el);el.appendChild(rz)}
    return el}
  /* ---------- menu de um componente, configuração e catálogo ---------- */
  function wkMenuItem(botao,x){
    var it=x.item,def=x.def,cols=NUCLEO.wsColunasPara(window.innerWidth),compart=WK.espaco&&WK.espaco.tipo==="compartilhado",tam=[["Pequeno",3],["Médio",6],["Grande",9],["Largura total",12]].map(function(t){return {rotulo:"Tamanho: "+t[0],desligado:!def||cols===1,acao:function(){wkOp({op:"redimensionar",id:it.id,tipo:it.tipo,col:t[1]},"Tamanho: "+t[0]+".")}}});
    var itens=[{rotulo:"Configurar…",desligado:!def||!def.config.length,acao:function(){wkConfigurar(x)}},"-"].concat(tam,
      [{rotulo:"Altura: automática",desligado:!def,acao:function(){wkOp({op:"redimensionar",id:it.id,tipo:it.tipo,lin:0},"Altura automática.")}},{rotulo:"Altura: média",desligado:!def,acao:function(){wkOp({op:"redimensionar",id:it.id,tipo:it.tipo,lin:3},"Altura média.")}},
       {rotulo:"Altura: alta",desligado:!def,acao:function(){wkOp({op:"redimensionar",id:it.id,tipo:it.tipo,lin:5},"Altura alta.")}},"-",
       {rotulo:"Mover para cima",acao:function(){WK.foco="menu:"+it.id;wkMoverPasso(it.id,-1)}},{rotulo:"Mover para baixo",acao:function(){WK.foco="menu:"+it.id;wkMoverPasso(it.id,1)}},"-",
       {rotulo:it.estado==="oculto"?"Mostrar":"Ocultar",titulo:"Só esconde da vista; a configuração e a posição ficam."+(compart?" Para esconder só de você, use “Ocultar” fora do modo de edição.":""),acao:function(){wkOp({op:"estado",id:it.id,estado:it.estado==="oculto"?"ativo":"oculto"},it.estado==="oculto"?"Componente visível.":"Componente oculto.")}},
       {rotulo:it.estado==="desativado"?"Reativar":"Desativar",titulo:"Pausa o componente: ele não consulta dados nem gera avisos, mas continua na página.",acao:function(){wkOp({op:"estado",id:it.id,estado:it.estado==="desativado"?"ativo":"desativado"},it.estado==="desativado"?"Componente reativado.":"Componente desativado.")}},
       {rotulo:"Duplicar",desligado:!def,acao:function(){wkOp({op:"adicionar",tipo:it.tipo,secao:wkSecaoDe(it.id),indice:wkIndiceDe(it.id)+1,config:NUCLEO.wsClonar(it.config)},"Componente duplicado.")}},
       {rotulo:(it.mobile===false?"Mostrar":"Esconder")+" no celular",acao:function(){wkOp({op:"mobile",id:it.id,mostrar:it.mobile===false},"Ajustado para o celular.")}},"-",
       {rotulo:"Remover da página",perigo:true,titulo:"Tira o componente desta página. Nenhum dado do módulo é apagado.",acao:function(){wkOp({op:"remover",id:it.id},"Componente removido da página (nenhum dado foi apagado).")}}]);
    if(def&&def.acoes&&def.acoes.length)itens.splice(1,0,{rotulo:def.acoes[0].rotulo,acao:function(){location.hash=def.acoes[0].rota}});
    wkMenu(botao,itens)}
  function wkSecaoDe(id){var a=NUCLEO.wsAcharItem(WK.layout,id);return a?WK.layout.secoes[a.si].id:null}
  function wkIndiceDe(id){var a=NUCLEO.wsAcharItem(WK.layout,id);return a?a.ii:0}
  function wkMoverPasso(id,delta){var r=NUCLEO.wsMoverPasso(WK.layout,id,delta);if(!r.ok){wkAviso(wkMotivo(r.motivo),"aviso");return}
    var a=NUCLEO.wsAcharItem(r.layout,id);wkOp({op:"mover",id:id,secao:r.layout.secoes[a.si].id,indice:a.ii},"Movido para a posição "+(a.ii+1)+" da seção "+(a.si+1)+".")}
  function wkConfigurar(x){
    var it=x.item,def=x.def,corpo=h("div",{class:"stack"}),campos={},st=h("p",{class:"sub",role:"status"});
    def.config.forEach(function(c){var v=it.config[c.chave],el,rot=h("label",null,c.rotulo);
      if(c.tipo==="periodo"){el=h("select");[["hoje","Hoje"],["7d","7 dias"],["30d","30 dias"],["mes","Este mês"],["12m","12 meses"]].forEach(function(o){el.appendChild(h("option",{value:o[0],text:o[1],selected:o[0]===v?"":null}))})}
      else if(c.tipo==="selecao"&&c.multiplo){el=h("div",{class:"wk-checks",role:"group","aria-label":c.rotulo});(c.opcoes||[]).forEach(function(o){var val=o.valor!==undefined?o.valor:o,ck=h("input",{type:"checkbox",value:val,checked:(v||[]).indexOf(val)>=0?"":null});el.appendChild(h("label",{class:"wk-check"},ck,o.rotulo||val))})}
      else if(c.tipo==="selecao"){el=h("select");(c.opcoes||[]).forEach(function(o){var val=o.valor!==undefined?o.valor:o;el.appendChild(h("option",{value:val,text:o.rotulo||val,selected:val===v?"":null}))})}
      else if(c.tipo==="numero"){el=h("input",{type:"number",min:c.min,max:c.max,value:v})}
      else if(c.tipo==="booleano"){el=h("input",{type:"checkbox",checked:v?"":null})}
      else if(c.longo){el=h("textarea",{rows:"4",maxlength:String(c.max||500)});el.value=v||""}
      else{el=h("input",{type:"text",maxlength:String(c.max||120),value:v||""})}
      campos[c.chave]={el:el,c:c};rot.appendChild(el);corpo.appendChild(rot);if(c.ajuda)corpo.appendChild(h("p",{class:"sub",text:c.ajuda}))});
    var ok=h("button",{type:"button",text:"Aplicar"});corpo.appendChild(h("div",{class:"vfil"},ok));corpo.appendChild(st);
    var f=wkFolha("Configurar: "+def.titulo,corpo);
    ok.onclick=function(){var cfg=NUCLEO.wsClonar(it.config);
      Object.keys(campos).forEach(function(k){var c=campos[k].c,el=campos[k].el;
        if(c.tipo==="numero")cfg[k]=el.value===""?undefined:Number(el.value);else if(c.tipo==="booleano")cfg[k]=el.checked;
        else if(c.tipo==="selecao"&&c.multiplo)cfg[k]=[].slice.call(el.querySelectorAll("input:checked")).map(function(i){return i.value});
        else if(c.tipo==="selecao"){var o=(c.opcoes||[]).filter(function(o){return String(o.valor!==undefined?o.valor:o)===el.value})[0];cfg[k]=o?(o.valor!==undefined?o.valor:o):el.value}
        else cfg[k]=el.value});
      var r=wkOp({op:"configurar",id:it.id,tipo:it.tipo,config:cfg},"Configuração aplicada.");if(r.ok){f.fechar(true)}else st.textContent=wkMotivo(r.motivo)}}
  /* o catálogo: busca, categorias, o que cada um faz e por que não pode (privado em espaço compartilhado, sem acesso ao módulo…) */
  function wkCatalogo(secaoId){
    var corpo=h("div",{class:"stack"}),busca=h("input",{type:"search",placeholder:"Buscar componente…","aria-label":"Buscar componente",class:"wk-busca"}),lista=h("div",{class:"wk-catalogo"});
    corpo.appendChild(busca);corpo.appendChild(lista);var f=wkFolha("Adicionar componente",corpo);
    function pintar(){lista.innerHTML="";var q=NUCLEO.norm?NUCLEO.norm(busca.value):busca.value.toLowerCase(),ult="",n=0;
      widgetLista().forEach(function(d){var txt=(d.titulo+" "+d.descricao+" "+d.categoria).toLowerCase();if(q&&txt.indexOf(q)<0)return;n++;
        if(d.categoria!==ult){ult=d.categoria;lista.appendChild(h("h3",{class:"wk-cat",text:d.categoria}))}
        var pode=NUCLEO.wsPodeUsarTipo(d,wkCtxTipo()),b=h("button",{type:"button",text:"Adicionar",disabled:pode.ok?null:""}),
          why={tipo_privado:"Privado: não pode ficar em espaço compartilhado.",modulo_indisponivel:"Você não tem acesso a este módulo.",so_do_dono:"Só do dono.",papel_insuficiente:"Seu papel neste espaço não permite.",espaco_nao_suportado:"Não disponível neste tipo de espaço."}[pode.motivo];
        b.onclick=function(){var r=wkOp({op:"adicionar",tipo:d.tipo,secao:secaoId},d.titulo+" adicionado.");if(r.ok){WK.foco="alca:"+r.id;f.fechar(true);wkDesenharGrade();var el=WK.raiz.querySelector('[data-id="'+r.id+'"]');if(el&&el.scrollIntoView)el.scrollIntoView({block:"nearest"})}};
        lista.appendChild(h("div",{class:"wk-cat-it"},h("div",{class:"grow"},h("b",{text:d.titulo}),h("span",{class:"sub",text:d.descricao}),why?h("span",{class:"sub wk-why",text:why}):null),b))});
      if(!n)lista.appendChild(h("p",{class:"empty",text:"Nenhum componente encontrado."}))}
    busca.addEventListener("input",pintar);pintar()}
  /* ---------- arrastar, redimensionar e teclado ---------- */
  function wkTeclaAlca(e,x){var it=x.item;
    if(e.key.indexOf("Arrow")!==0)return;e.preventDefault();WK.foco="alca:"+it.id;
    if(e.shiftKey){var cols=NUCLEO.wsColunasPara(window.innerWidth),dc=e.key==="ArrowRight"?1:e.key==="ArrowLeft"?-1:0,dl=e.key==="ArrowDown"?1:e.key==="ArrowUp"?-1:0;
      if(cols===1)dc=0;wkOp({op:"redimensionar",id:it.id,tipo:it.tipo,col:it.col+dc,lin:it.lin+dl},"Tamanho: "+(it.col+dc)+" colunas, altura "+(it.lin+dl)+".");return}
    wkMoverPasso(it.id,e.key==="ArrowUp"||e.key==="ArrowLeft"?-1:1)}
  /* arrastar pela alça: mouse e caneta começam ao mover; o dedo precisa de um toque longo (para não brigar com a rolagem). O destino vem da posição do ponteiro sobre os outros componentes. */
  function wkLigarArrasto(al,id){
    al.addEventListener("pointerdown",function(e){
      if(e.button>0)return;var ini={x:e.clientX,y:e.clientY},toque=e.pointerType==="touch",ativo=false,alvo=null,rolar=null,tmo=null,item=al.closest(".wk-item");
      function comecar(){ativo=true;WK.arrastando=id;item.classList.add("wk-arrastando");document.body.classList.add("wk-no-arrasto");try{al.setPointerCapture(e.pointerId)}catch(x){}}
      function limpar(){clearTimeout(tmo);clearInterval(rolar);item.classList.remove("wk-arrastando");document.body.classList.remove("wk-no-arrasto");[].slice.call(document.querySelectorAll(".wk-alvo-antes,.wk-alvo-depois,.wk-alvo-fim")).forEach(function(n){n.classList.remove("wk-alvo-antes","wk-alvo-depois","wk-alvo-fim")});
        al.removeEventListener("pointermove",mover);al.removeEventListener("pointerup",soltar);al.removeEventListener("pointercancel",cancelar);WK.arrastando=null}
      function destino(x,y){[].slice.call(document.querySelectorAll(".wk-alvo-antes,.wk-alvo-depois,.wk-alvo-fim")).forEach(function(n){n.classList.remove("wk-alvo-antes","wk-alvo-depois","wk-alvo-fim")});
        var els=document.elementsFromPoint(x,y),it2=null,gr=null,i;for(i=0;i<els.length;i++){if(!it2&&els[i].classList&&els[i].classList.contains("wk-item")&&els[i]!==item)it2=els[i];if(!gr&&els[i].classList&&els[i].classList.contains("wk-grade"))gr=els[i]}
        if(it2){var r=it2.getBoundingClientRect(),estreito=r.width<r.height*1.3||r.width<(it2.parentNode.getBoundingClientRect().width/2),depois=estreito?x>r.left+r.width/2:y>r.top+r.height/2;it2.classList.add(depois?"wk-alvo-depois":"wk-alvo-antes");return {item:it2,depois:depois,secao:it2.getAttribute("data-secao")}}
        if(gr){gr.classList.add("wk-alvo-fim");return {grade:gr,secao:gr.getAttribute("data-secao")}}return null}
      function mover(ev){if(!ativo){var d=Math.abs(ev.clientX-ini.x)+Math.abs(ev.clientY-ini.y);if(!toque&&d>5)comecar();else return}
        ev.preventDefault();alvo=destino(ev.clientX,ev.clientY);clearInterval(rolar);var vy=ev.clientY<70?-14:ev.clientY>window.innerHeight-70?14:0;if(vy)rolar=setInterval(function(){window.scrollBy(0,vy)},16)}
      function soltar(){var a=alvo,ia=ativo;limpar();if(!ia||!a)return;
        var base=WK.layout,idx;
        if(a.item){var aid=a.item.getAttribute("data-id"),pos=NUCLEO.wsAcharItem(base,aid);if(!pos)return;idx=pos.ii+(a.depois?1:0);
          var atual=NUCLEO.wsAcharItem(base,id);if(atual&&atual.si===pos.si&&atual.ii<idx)idx--;a.secaoId=base.secoes[pos.si].id}
        else{a.secaoId=a.secao;idx=null}
        WK.foco="alca:"+id;var r=NUCLEO.wsMover(base,id,a.secaoId,idx);if(r.ok&&JSON.stringify(r.layout)!==JSON.stringify(base))wkOp({op:"mover",id:id,secao:a.secaoId,indice:idx==null?undefined:idx},"Componente movido.");else wkDesenharGrade()}
      function cancelar(){limpar()}
      if(toque)tmo=setTimeout(function(){comecar();if(navigator.vibrate)try{navigator.vibrate(10)}catch(x){}},350);
      al.addEventListener("pointermove",mover);al.addEventListener("pointerup",soltar);al.addEventListener("pointercancel",cancelar);
      if(!toque)e.preventDefault()})}
  /* redimensionar pelo canto: converte a posição do ponteiro em colunas (da grade atual) e em unidades de altura */
  function wkLigarRedim(rz,x,el){
    rz.addEventListener("pointerdown",function(e){
      if(e.button>0)return;e.preventDefault();e.stopPropagation();var grade=el.parentNode,gr=grade.getBoundingClientRect(),cols=NUCLEO.wsColunasPara(window.innerWidth),colw=gr.width/cols,esq=el.getBoundingClientRect().left,ult=null;
      try{rz.setPointerCapture(e.pointerId)}catch(z){}document.body.classList.add("wk-no-arrasto");
      function mover(ev){var c12=Math.max(1,Math.round((ev.clientX-esq)/colw)),col=cols===12?c12:Math.round(c12*12/cols),lin=Math.max(0,Math.round((ev.clientY-el.getBoundingClientRect().top)/96)),t=NUCLEO.wsLimitar(x.def,col,lin>1?lin:0);
        ult=t;el.style.setProperty("--c12",t[0]);el.style.setProperty("--c8",NUCLEO.wsEscala(t[0],8));el.style.setProperty("--lin",t[1])}
      function fim(){rz.removeEventListener("pointermove",mover);rz.removeEventListener("pointerup",fim);rz.removeEventListener("pointercancel",fim);document.body.classList.remove("wk-no-arrasto");
        if(ult&&(ult[0]!==x.item.col||ult[1]!==x.item.lin)){WK.foco="menu:"+x.item.id;wkOp({op:"redimensionar",id:x.item.id,tipo:x.item.tipo,col:ult[0],lin:ult[1]},"Tamanho: "+ult[0]+" colunas.")}else wkDesenharGrade()}
      rz.addEventListener("pointermove",mover);rz.addEventListener("pointerup",fim);rz.addEventListener("pointercancel",fim)})}
