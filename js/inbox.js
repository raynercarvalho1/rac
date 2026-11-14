/* Dia a Dia RAC — módulo carregado quando a seção abre. RAC Inbox (#inbox), SÓ DO DONO (a Fernanda não vê; Documento 10, seção 6, item 7).
   I1 · fundação (docs/inbox.md). Desktop: três áreas numa só superfície (lateral com contas, pastas e categorias; lista com remetente, assunto, prévia e horário; leitura à direita).
   iPhone: a lista ocupa a tela, a leitura abre em tela própria (voltar no topo, ações com alvo de toque de 44 px, áreas seguras respeitadas) e as caixas abrem em tela própria.
   Lê e grava só os METADADOS do cadastro (inbox_contas e inbox_pastas, migration 051). NENHUM e-mail é lido, listado ou guardado nesta etapa. A lista só tem linhas no
   "exemplo da interface" (js/inbox-demo.js): dados FICTÍCIOS, rotulados o tempo todo, isolados em outro módulo e nunca gravados. Ações que alteram a caixa existem na tela
   desligadas ("disponível nas próximas etapas"): nada aqui escreve em e-mail. Estados: carregando, vazio, erro, estrutura pendente (051 não aplicada) e desconectado.
   Regras no núcleo (NUCLEO.inb*), componentes do kit (js/kit.js), serviço em js/inbox-servico.js. Nenhuma senha é pedida, guardada ou enviada aqui. */
  var INBX={contas:[],pastas:[],erro:null,carregando:false,conta:"todas",pasta:null,categoria:null,filtro:"todas",painel:"lista",msg:null,demo:false,form:false,erros:{},valores:{provedor:"icloud",apelido:"",endereco:""},aviso:null};
  var INBX_FUTURO="Disponível nas próximas etapas";
  function inboxLer(){
    INBX.carregando=true;INBX.erro=null;
    return Promise.all([SB.from("inbox_contas").select("*").order("apelido"),SB.from("inbox_pastas").select("*").order("nome_externo")]).then(function(r){
      INBX.contas=sbOk(r[0])||[];INBX.pastas=sbOk(r[1])||[];INBX.carregando=false}).then(null,function(e){INBX.carregando=false;INBX.erro=e;INBX.contas=[];INBX.pastas=[]})}
  function inboxSelo(estado){var e=NUCLEO.inbEstado(estado);return rkSelo(e.tipo,e.rotulo)}
  function inboxMensagens(){return INBX.demo&&window.INBOX_DEMO?NUCLEO.inbOrdenar(NUCLEO.inbFiltrar(window.INBOX_DEMO,INBX.filtro)):[]}
  function inboxAbrirMsg(id){INBX.msg=id;INBX.painel="leitura";inboxDesenhar()}
  function inboxIr(conta,pasta,categoria){INBX.conta=conta||"todas";INBX.pasta=pasta||null;INBX.categoria=categoria||null;INBX.msg=null;INBX.painel="lista";inboxDesenhar()}
  function inboxBtnDesligado(texto,classe){return h("button",{type:"button",class:classe,"aria-disabled":"true",title:INBX_FUTURO,text:texto})}
  /* ---- lateral: nova mensagem (desligada), caixas, categorias ---- */
  function inboxLateral(){
    var u=NUCLEO.inbUnificada(INBX.contas,INBX.pastas),arv=NUCLEO.inbArvore(INBX.contas,INBX.pastas),box=h("aside",{class:"inb-lateral","aria-label":"Caixas de e-mail"});
    var fechar=h("button",{type:"button",class:"inb-voltar",text:"Mensagens"});fechar.onclick=function(){INBX.painel="lista";inboxDesenhar()};box.appendChild(fechar);
    box.appendChild(h("button",{type:"button",class:"inb-novo","aria-disabled":"true",title:INBX_FUTURO,text:"Nova mensagem"}));
    box.appendChild(h("p",{class:"inb-grupo",text:"Caixas"}));
    var un=h("button",{type:"button",class:"inb-item"+(INBX.conta==="todas"&&!INBX.categoria?" inb-item--ativo":"")},h("span",{class:"inb-item-nome",text:"Caixa unificada"}),
      h("span",{class:"inb-item-n",text:u.contas?(u.naoLidas==null?"—":String(u.naoLidas)):""}));
    un.onclick=function(){inboxIr("todas")};box.appendChild(un);
    if(u.parcial)box.appendChild(h("p",{class:"inb-nota",text:"Contagem parcial: há conta sem conexão."}));
    arv.forEach(function(g){
      var c=g.conta,t=h("button",{type:"button",class:"inb-item"+(INBX.conta===c.id&&!INBX.pasta?" inb-item--ativo":"")},h("span",{class:"inb-item-nome",text:c.apelido}),inboxSelo(c.estado));
      t.onclick=function(){inboxIr(c.id)};box.appendChild(t);
      g.pastas.forEach(function(p){var b=h("button",{type:"button",class:"inb-pasta"+(INBX.pasta===p.id?" inb-item--ativo":"")},h("span",{class:"inb-item-nome",text:p.nome_externo}),h("span",{class:"inb-item-n",text:p.nao_lidas==null?"—":String(p.nao_lidas)}));
        b.onclick=function(){inboxIr(c.id,p.id)};box.appendChild(b)});
      if(!g.pastas.length)box.appendChild(h("p",{class:"inb-nota",text:"Pastas aparecem quando a sincronização existir (etapa I2)."}))});
    box.appendChild(h("p",{class:"inb-grupo",text:"Categorias"}));
    NUCLEO.INB_CATEGORIAS.forEach(function(k){box.appendChild(h("button",{type:"button",class:"inb-pasta inb-item--off","aria-disabled":"true",title:"Categorias inteligentes chegam na etapa I4"},h("span",{class:"inb-item-nome",text:k[1]})))});
    box.appendChild(h("p",{class:"inb-nota",text:"Categorias inteligentes chegam na etapa I4."}));
    var add=rkBtn("ter","Adicionar conta",{"aria-expanded":INBX.form?"true":"false"});add.onclick=function(){INBX.form=!INBX.form;INBX.aviso=null;inboxDesenhar()};box.appendChild(add);
    var ex=rkBtn("ter",INBX.demo?"Sair do exemplo":"Ver exemplo da interface");ex.onclick=inboxAlternarDemo;box.appendChild(ex);
    return box}
  function inboxAlternarDemo(){
    if(INBX.demo){INBX.demo=false;INBX.msg=null;INBX.painel="lista";inboxDesenhar();return}
    precisa(["inbox-demo"]).then(function(){INBX.demo=true;INBX.msg=null;INBX.painel="lista";inboxDesenhar()},function(){INBX.aviso={tipo:"erro",t:"Não consegui abrir o exemplo agora."};inboxDesenhar()})}
  /* ---- lista: remetente, assunto, prévia e horário; sem mensagem real, o estado diz por quê ---- */
  function inboxFiltros(){var f=h("div",{class:"inb-filtros",role:"group","aria-label":"Filtrar mensagens"});
    NUCLEO.INB_FILTROS.forEach(function(x){var b=h("button",{type:"button",class:"inb-pilula"+(INBX.filtro===x[0]?" inb-pilula--ativa":""),"aria-pressed":INBX.filtro===x[0]?"true":"false",text:x[1]});b.onclick=function(){INBX.filtro=x[0];inboxDesenhar()};f.appendChild(b)});return f}
  function inboxLinha(m){
    var b=h("button",{type:"button",class:"inb-linha"+(INBX.msg===m.id?" inb-linha--ativa":"")+(m.lida?"":" inb-linha--nova"),"aria-label":(m.lida?"":"Não lida. ")+m.remetente+". "+m.assunto});
    b.appendChild(h("span",{class:"inb-avatar","aria-hidden":"true",text:NUCLEO.inbIniciais(m.remetente)}));
    b.appendChild(h("span",{class:"inb-linha-corpo"},h("span",{class:"inb-linha-topo"},h("span",{class:"inb-remetente",text:m.remetente}),h("span",{class:"inb-hora",text:NUCLEO.inbHora(m.recebida)})),
      h("span",{class:"inb-assunto",text:m.assunto}),h("span",{class:"inb-previa",text:m.previa}),m.anexo?h("span",{class:"inb-anexo-tag",text:"Anexo"}):null));
    b.onclick=function(){inboxAbrirMsg(m.id)};return b}
  function inboxLista(){
    var col=h("section",{class:"inb-mensagens","aria-label":"Mensagens"}),cont=INBX.contas.filter(function(c){return c.id===INBX.conta})[0],tit=INBX.conta==="todas"?"Caixa de entrada":(cont?cont.apelido:"Conta");
    var topo=h("div",{class:"inb-lista-topo"}),voltar=h("button",{type:"button",class:"inb-voltar",text:"Caixas"});voltar.onclick=function(){INBX.painel="caixas";inboxDesenhar()};
    topo.appendChild(voltar);topo.appendChild(h("h2",{class:"inb-titulo",text:tit}));col.appendChild(topo);
    if(INBX.demo)col.appendChild(h("p",{class:"inb-demo",role:"note",text:"DEMONSTRAÇÃO · mensagens fictícias, nenhuma caixa real"}));
    col.appendChild(inboxFiltros());
    var ms=inboxMensagens();
    if(ms.length){var l=h("div",{class:"inb-linhas",role:"list"});ms.forEach(function(m){l.appendChild(inboxLinha(m))});col.appendChild(l)}
    else{
      if(!INBX.demo&&INBX.conta!=="todas"&&cont&&cont.estado!=="conectada"&&cont.estado!=="sincronizando")
        col.appendChild(rkAlerta(cont.estado==="erro_autenticacao"?"erro":"aviso","Conta "+NUCLEO.inbEstado(cont.estado).rotulo.toLowerCase(),"Sem conexão o RAC não sabe quantas mensagens existem; a caixa não está vazia, está sem leitura."));
      col.appendChild(rkEstado("vazio",INBX.demo?"Nenhuma mensagem de exemplo neste filtro.":"Nenhuma mensagem carregada. A leitura de e-mails chega na etapa I2; nada aqui é exemplo nem simulação."))}
    return col}
  /* ---- leitura: no iPhone é uma tela própria (voltar + ações de toque) ---- */
  function inboxLeitura(){
    var art=h("article",{class:"inb-leitura","aria-label":"Leitura"}),m=INBX.demo&&window.INBOX_DEMO?window.INBOX_DEMO.filter(function(x){return x.id===INBX.msg})[0]:null;
    var topo=h("div",{class:"inb-leitura-topo"}),v=h("button",{type:"button",class:"inb-voltar",text:"Mensagens"});v.onclick=function(){INBX.painel="lista";INBX.msg=null;inboxDesenhar()};topo.appendChild(v);
    var acoes=h("div",{class:"inb-acoes",role:"toolbar","aria-label":"Ações da mensagem"});["Responder","Encaminhar","Arquivar","Excluir"].forEach(function(t){acoes.appendChild(inboxBtnDesligado(t,"inb-acao"))});topo.appendChild(acoes);art.appendChild(topo);
    if(!m){art.appendChild(rkEstado("vazio","Selecione uma mensagem para ler."));return art}
    art.appendChild(h("h2",{class:"inb-leitura-assunto",text:m.assunto}));
    art.appendChild(h("div",{class:"inb-de"},h("span",{class:"inb-avatar inb-avatar--g","aria-hidden":"true",text:NUCLEO.inbIniciais(m.remetente)}),h("span",{class:"inb-de-txt"},h("b",{text:m.remetente}),h("span",{class:"rac-t-legenda",text:m.endereco})),h("span",{class:"inb-hora",text:NUCLEO.inbHora(m.recebida)})));
    art.appendChild(h("div",{class:"inb-corpo"},m.corpo.map(function(p){return h("p",{text:p})})));
    if(m.anexos&&m.anexos.length)art.appendChild(h("div",{class:"inb-anexos"},h("span",{class:"inb-grupo",text:m.anexos.length+(m.anexos.length===1?" anexo":" anexos")}),m.anexos.map(function(n){return h("span",{class:"inb-chip",text:n})})));
    art.appendChild(h("p",{class:"inb-demo",role:"note",text:"DEMONSTRAÇÃO · texto fictício; nenhuma ação altera uma caixa real."}));
    return art}
  /* ---- adicionar conta: só provedor, apelido e endereço (nenhuma senha) ---- */
  function inboxForm(){
    var V=INBX.valores,E=INBX.erros,sel=h("select",{class:"rac-campo-entrada",id:"inb-prov","aria-label":"Provedor"});
    NUCLEO.INB_PROVEDORES.forEach(function(p){var o=h("option",{value:p.id,text:p.nome+(p.ativo?"":" (fase futura)")});if(!p.ativo)o.setAttribute("disabled","disabled");if(V.provedor===p.id)o.setAttribute("selected","selected");sel.appendChild(o)});
    var ap=rkCampo("Nome da conta","inb-apelido",{valor:V.apelido,erro:E.apelido,ajuda:"Como você quer ver esta caixa (ex.: Pessoal)."}),en=rkCampo("Endereço de e-mail","inb-endereco",{valor:V.endereco,erro:E.endereco});
    var salvar=rkBtn("pri","Cadastrar conta");
    salvar.onclick=function(){
      INBX.valores={provedor:sel.value,apelido:document.getElementById("inb-apelido").value,endereco:document.getElementById("inb-endereco").value};
      var v=NUCLEO.inbContaValida(INBX.valores);INBX.erros=v.ok?{}:v.erros;
      if(!v.ok){inboxDesenhar();return}
      salvar.setAttribute("disabled","disabled");salvar.setAttribute("aria-busy","true");
      Promise.resolve(SB.from("inbox_contas").insert(v.linha).select("*")).then(sbOk).then(function(){INBX.form=false;INBX.valores={provedor:"icloud",apelido:"",endereco:""};INBX.aviso={tipo:"ok",t:"Conta cadastrada. Ela fica \"Nova\" até a conexão existir (etapa I2); nenhuma senha foi pedida."};return inboxLer()},
        function(e){INBX.erros={endereco:e&&e.code==="23505"?"Esta conta já está cadastrada.":NUCLEO.segTabelaAusente(e&&(e.message||e.code))?"A estrutura do Inbox ainda não existe no banco (migration 051 pendente).":"Não consegui cadastrar agora."}}).then(inboxDesenhar)};
    return rkCard("Adicionar conta",h("div",{class:"rac-pilha"},h("div",{class:"rac-campo"},h("label",{class:"rac-campo-rotulo","for":"inb-prov",text:"Provedor"}),sel,E.provedor?h("span",{class:"rac-campo-ajuda",text:"✗ "+E.provedor}):null),ap,en,
      rkInfo("i","Sem senha aqui","O RAC não pede, guarda nem envia senha, token ou usuário de acesso neste formulário. A forma de conectar é decidida na etapa I2."),salvar))}
  /* ---- paridade honesta: o que cada provedor faz de verdade, com o nível de evidência ---- */
  function inboxMatriz(){
    var tab=h("table",{class:"rac-tabela inb-matriz"}),cab=h("tr",null,h("th",{text:"Recurso"}));
    NUCLEO.INB_PROVEDORES.forEach(function(p){cab.appendChild(h("th",{text:p.nome}))});tab.appendChild(h("thead",null,cab));
    var tb=h("tbody");NUCLEO.INB_RECURSOS.forEach(function(r){var tr=h("tr",null,h("th",{scope:"row",text:r[1]}));
      NUCLEO.INB_PROVEDORES.forEach(function(p){var v=p.rec[r[0]],tipo=v==="comprovado"?"ok":v==="indisponivel"?"erro":v==="nao_comprovado"?"aviso":"neutro";tr.appendChild(h("td",null,rkSelo(tipo,NUCLEO.INB_RECURSO_ROTULOS[v])))});tb.appendChild(tr)});tab.appendChild(tb);
    return rkRecolher("Paridade entre provedores","Evidência de cada recurso",h("div",{class:"rac-pilha"},h("div",{class:"rac-tabela-rolo"},tab),h("p",{class:"rac-t-legenda",text:NUCLEO.inbProvedor("icloud").nota})))}
  function inboxDesenhar(){
    var root=document.getElementById("inbox-view");if(!root)return;root.innerHTML="";
    if(!isOwner()){root.appendChild(h("div",{class:"panel"},h("p",{class:"empty",text:"O Inbox é só da conta do dono."})));return}
    $("#ptitle").textContent="Inbox";
    var st=NUCLEO.inbTelaEstado({carregando:INBX.carregando,erro:INBX.erro,contas:INBX.contas}),pg=h("div",{class:"inb"});root.appendChild(pg);
    if(st.tipo==="carregando"){pg.appendChild(rkEstado("carregando","Carregando as caixas…"));return}
    pg.appendChild(h("p",{class:"inb-faixa",text:"RAC Inbox · fundação (I1): estrutura e cadastro de contas. Leitura, envio e sincronização vêm nas próximas etapas."}));
    if(INBX.aviso)pg.appendChild(rkAlerta(INBX.aviso.tipo,INBX.aviso.t));
    if(st.tipo==="estrutura_pendente")pg.appendChild(rkEstado("aviso","A estrutura do Inbox ainda não foi criada no banco (migration 051 pendente). Quando o dono aplicar, as contas aparecem aqui."));
    else if(st.tipo==="erro"){var re=rkBtn("sec","Tentar de novo");re.onclick=function(){inboxCarregar()};pg.appendChild(rkEstado("erro","Não consegui carregar o Inbox agora.",re))}
    else if(st.tipo==="desconectado"&&!INBX.demo)pg.appendChild(rkAlerta("aviso","Nenhuma conta conectada","As contas cadastradas ainda não têm conexão (etapa I2). Elas não estão vazias: ainda não foram lidas."));
    if(INBX.form||(st.tipo==="vazio"&&!INBX.demo))pg.appendChild(inboxForm());
    if(st.tipo!=="erro"){
      if(st.tipo==="vazio"&&!INBX.demo)pg.appendChild(rkEstado("vazio","Nenhuma conta cadastrada. Adicione a sua conta do iCloud, ou veja o exemplo da interface."));
      pg.appendChild(h("div",{class:"inb-janela","data-painel":INBX.painel},inboxLateral(),inboxLista(),inboxLeitura()))}
    pg.appendChild(inboxMatriz())}
  function inboxCarregar(){INBX.carregando=true;inboxDesenhar();return inboxLer().then(inboxDesenhar)}
  function renderInbox(conta,pasta){
    INBX.painel="lista";INBX.msg=null;
    if(conta){INBX.conta=conta;INBX.pasta=pasta||null}
    return inboxCarregar()}
