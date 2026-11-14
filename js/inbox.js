/* Dia a Dia RAC — módulo carregado quando a seção abre. RAC Inbox (#inbox), SÓ DO DONO (a Fernanda não vê; Documento 10, seção 6, item 7).
   Desktop: uma superfície com três áreas (lateral com caixas, pastas e categorias; lista agrupada por data com remetente, assunto, prévia e horário; leitura com cabeçalho, corpo e anexos).
   iPhone: a lista ocupa a tela com título grande; a leitura e as caixas abrem em tela própria (voltar no topo, barra de ações embaixo com alvo de toque de 44 px, áreas seguras respeitadas).
   Lê e grava só METADADOS (inbox_contas, inbox_pastas e o estado da credencial em inbox_credenciais, migrations 051 e 052). NENHUM e-mail é lido, listado ou guardado nesta etapa. A lista só tem linhas no
   "exemplo da interface" (js/inbox-demo.js): dados FICTÍCIOS, rotulados, isolados em outro módulo e nunca gravados. Ações que alteram a caixa existem na tela desligadas: nada aqui escreve em e-mail.
   CREDENCIAL: o formulário de conexão pede o login do ID Apple e a senha ESPECÍFICA DE APP, envia UMA vez pelo serviço (js/inbox-servico.js, que a guarda no Vault) e limpa o campo na hora; a senha
   nunca entra no estado da tela (INBX), nunca é guardada no aparelho e nunca volta do servidor. A senha principal da conta Apple não é pedida nem aceita. O formulário só aparece com o serviço publicado.
   Regras no núcleo (NUCLEO.inb*), componentes do kit (js/kit.js). */
  var INBX={contas:[],pastas:[],cred:{},erro:null,carregando:false,conta:"todas",pasta:null,filtro:"todas",painel:"lista",msg:null,demo:false,form:false,erros:{},valores:{provedor:"icloud",apelido:"",endereco:""},aviso:null,
    credForm:null,credErros:{},credOcupado:false};
  var INBX_FUTURO="Disponível nas próximas etapas";
  /* ícones (traço de 1.8, herdam a cor do texto) */
  var INBX_ICO={caixa:'<path d="M3 13l2.5-7.5A2 2 0 0 1 7.4 4h9.2a2 2 0 0 1 1.9 1.5L21 13"/><path d="M3 13v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5h-5a3 3 0 0 1-6 0z"/>',
    entrada:'<path d="M3 13l2.5-7.5A2 2 0 0 1 7.4 4h9.2a2 2 0 0 1 1.9 1.5L21 13"/><path d="M3 13v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5h-5a3 3 0 0 1-6 0z"/>',
    rascunhos:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',enviados:'<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>',
    arquivo:'<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"/><path d="M10 13h4"/>',spam:'<path d="M12 3l8 3v6c0 4.5-3.2 7.7-8 9-4.8-1.3-8-4.5-8-9V6z"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/>',
    lixo:'<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',outra:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    tag:'<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.3"/>',clip:'<path d="M20 11l-8.5 8.5a5 5 0 0 1-7-7L13 4a3.3 3.3 0 0 1 4.7 4.7L9.2 17.2a1.7 1.7 0 0 1-2.4-2.4L14.5 7"/>',
    responder:'<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v3"/>',todos:'<path d="M7 14L2 9l5-5"/><path d="M12 14L7 9l5-5"/><path d="M7 9h8a6 6 0 0 1 6 6v3"/>',encaminhar:'<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0-6 6v3"/>',
    mais:'<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',voltar:'<path d="M15 5l-7 7 7 7"/>',buscar:'<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>',
    nova:'<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',cadeado:'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',menu:'<path d="M4 7h16M4 12h16M4 17h16"/>'};
  function inboxIco(nome,cls){var s=h("span",{class:"inb-ico"+(cls?" "+cls:""),"aria-hidden":"true"});s.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(INBX_ICO[nome]||INBX_ICO.outra)+'</svg>';return s}
  function inboxLer(){
    INBX.carregando=true;INBX.erro=null;
    var cred=Promise.resolve(SB.from("inbox_credenciais").select("conta_id,estado")).then(sbOk).then(function(l){var m={};(l||[]).forEach(function(x){m[x.conta_id]=x.estado});return m},function(){return {}});   /* sem a 052 aplicada: sem credencial, sem erro */
    return Promise.all([SB.from("inbox_contas").select("*").order("apelido"),SB.from("inbox_pastas").select("*").order("nome_externo"),cred]).then(function(r){
      INBX.contas=sbOk(r[0])||[];INBX.pastas=sbOk(r[1])||[];INBX.cred=r[2]||{};INBX.carregando=false}).then(null,function(e){INBX.carregando=false;INBX.erro=e;INBX.contas=[];INBX.pastas=[];INBX.cred={}})}
  function inboxSelo(estado){var e=NUCLEO.inbEstado(estado);return h("span",{class:"inb-estado inb-estado--"+e.tipo,title:e.rotulo},h("i",{"aria-hidden":"true"}),e.rotulo)}
  function inboxMensagens(){return INBX.demo&&window.INBOX_DEMO?NUCLEO.inbFiltrar(window.INBOX_DEMO,INBX.filtro):[]}
  function inboxAbrirMsg(id){INBX.msg=id;INBX.painel="leitura";inboxDesenhar()}
  function inboxIr(conta,pasta){INBX.conta=conta||"todas";INBX.pasta=pasta||null;INBX.msg=null;INBX.painel="lista";INBX.credForm=null;INBX.credErros={};inboxDesenhar()}
  function inboxContaAtual(){return INBX.contas.filter(function(c){return c.id===INBX.conta})[0]||null}
  function inboxBtnIco(nome,rotulo,classe){return h("button",{type:"button",class:"inb-btn-ico"+(classe?" "+classe:""),"aria-disabled":"true","aria-label":rotulo,title:rotulo+" · "+INBX_FUTURO},inboxIco(nome),h("span",{class:"inb-btn-rot",text:rotulo}))}
  /* ---- lateral: nova mensagem (desligada), caixas com contas e pastas, categorias ---- */
  function inboxLateral(){
    var u=NUCLEO.inbUnificada(INBX.contas,INBX.pastas),arv=NUCLEO.inbArvore(INBX.contas,INBX.pastas),box=h("aside",{class:"inb-lateral","aria-label":"Caixas de e-mail"});
    var fechar=h("button",{type:"button",class:"inb-voltar",text:"Mensagens"});fechar.onclick=function(){INBX.painel="lista";inboxDesenhar()};box.appendChild(fechar);
    box.appendChild(h("button",{type:"button",class:"inb-novo","aria-disabled":"true",title:INBX_FUTURO},inboxIco("nova"),"Nova mensagem"));
    box.appendChild(h("p",{class:"inb-grupo",text:"Caixas"}));
    var un=h("button",{type:"button",class:"inb-item"+(INBX.conta==="todas"?" inb-item--ativo":"")},inboxIco("caixa"),h("span",{class:"inb-item-nome",text:"Caixa unificada"}),
      h("span",{class:"inb-item-n",text:u.contas&&u.naoLidas!=null?String(u.naoLidas):""}));
    un.onclick=function(){inboxIr("todas")};box.appendChild(un);
    if(u.parcial)box.appendChild(h("p",{class:"inb-nota",text:"Contagem parcial: há conta sem conexão."}));
    arv.forEach(function(g){
      var c=g.conta,ativa=INBX.conta===c.id,t=h("button",{type:"button",class:"inb-conta"+(ativa&&!INBX.pasta?" inb-item--ativo":"")},h("span",{class:"inb-avatar inb-avatar--p","aria-hidden":"true",text:NUCLEO.inbIniciais(c.apelido)}),
        h("span",{class:"inb-conta-txt"},h("b",{text:c.apelido}),h("span",{text:c.endereco})),h("span",{class:"inb-ponto inb-ponto--"+g.estado.tipo,title:g.estado.rotulo,"aria-label":g.estado.rotulo}));
      t.onclick=function(){inboxIr(c.id)};box.appendChild(t);
      if(ativa){g.pastas.forEach(function(p){var b=h("button",{type:"button",class:"inb-pasta"+(INBX.pasta===p.id?" inb-item--ativo":"")},inboxIco(p.uso),h("span",{class:"inb-item-nome",text:p.nome_externo}),h("span",{class:"inb-item-n",text:p.nao_lidas==null?"":String(p.nao_lidas)}));
        b.onclick=function(){inboxIr(c.id,p.id)};box.appendChild(b)});
        if(!g.pastas.length)box.appendChild(h("p",{class:"inb-nota",text:"As pastas aparecem quando a sincronização existir (etapa I2)."}))}});
    box.appendChild(h("p",{class:"inb-grupo"},"Categorias",h("span",{class:"inb-etiqueta",text:"Etapa I4"})));
    NUCLEO.INB_CATEGORIAS.forEach(function(k){box.appendChild(h("button",{type:"button",class:"inb-pasta inb-item--off","aria-disabled":"true",title:"Categorias inteligentes chegam na etapa I4"},inboxIco("tag"),h("span",{class:"inb-item-nome",text:k[1]})))});
    var rod=h("div",{class:"inb-lateral-rod"}),add=h("button",{type:"button",class:"inb-link","aria-expanded":INBX.form?"true":"false",text:"Adicionar conta"});add.onclick=function(){INBX.form=!INBX.form;INBX.aviso=null;inboxDesenhar()};rod.appendChild(add);
    var ex=h("button",{type:"button",class:"inb-link",text:INBX.demo?"Sair do exemplo":"Ver exemplo da interface"});ex.onclick=inboxAlternarDemo;rod.appendChild(ex);box.appendChild(rod);
    return box}
  function inboxAlternarDemo(){
    if(INBX.demo){INBX.demo=false;INBX.msg=null;INBX.painel="lista";inboxDesenhar();return}
    precisa(["inbox-demo"]).then(function(){INBX.demo=true;INBX.msg=null;INBX.painel="lista";inboxDesenhar()},function(){INBX.aviso={tipo:"erro",t:"Não consegui abrir o exemplo agora."};inboxDesenhar()})}
  /* ---- lista agrupada por data: remetente, assunto, prévia e horário ---- */
  function inboxFiltros(){var f=h("div",{class:"inb-filtros",role:"group","aria-label":"Filtrar mensagens"});
    NUCLEO.INB_FILTROS.forEach(function(x){var b=h("button",{type:"button",class:"inb-pilula"+(INBX.filtro===x[0]?" inb-pilula--ativa":""),"aria-pressed":INBX.filtro===x[0]?"true":"false",text:x[1]});b.onclick=function(){INBX.filtro=x[0];inboxDesenhar()};f.appendChild(b)});return f}
  function inboxLinha(m){
    var b=h("button",{type:"button",class:"inb-linha"+(INBX.msg===m.id?" inb-linha--ativa":"")+(m.lida?"":" inb-linha--nova"),"aria-label":(m.lida?"":"Não lida. ")+m.remetente+". "+m.assunto});
    b.appendChild(h("span",{class:"inb-avatar","aria-hidden":"true",text:NUCLEO.inbIniciais(m.remetente)}));
    b.appendChild(h("span",{class:"inb-linha-corpo"},h("span",{class:"inb-linha-topo"},h("span",{class:"inb-remetente",text:m.remetente}),h("span",{class:"inb-meta"},m.anexo?inboxIco("clip","inb-ico--anexo"):null,h("span",{class:"inb-hora",text:NUCLEO.inbHora(m.recebida)}))),
      h("span",{class:"inb-assunto",text:m.assunto}),h("span",{class:"inb-previa",text:m.previa})));
    b.onclick=function(){inboxAbrirMsg(m.id)};return b}
  function inboxVazio(icone,titulo,texto,acoes){return h("div",{class:"inb-vazio"},inboxIco(icone,"inb-vazio-ico"),h("b",{text:titulo}),h("p",{text:texto}),acoes||null)}
  function inboxLista(){
    var col=h("section",{class:"inb-mensagens","aria-label":"Mensagens"}),cont=inboxContaAtual(),tit=INBX.conta==="todas"?"Caixa de entrada":(cont?cont.apelido:"Conta"),ms=inboxMensagens();
    var cab=h("div",{class:"inb-cabeca"}),topo=h("div",{class:"inb-lista-topo"}),menu=h("button",{type:"button",class:"inb-topo-btn inb-so-movel","aria-label":"Caixas"},inboxIco("menu"));menu.onclick=function(){INBX.painel="caixas";inboxDesenhar()};
    topo.appendChild(menu);
    topo.appendChild(h("div",{class:"inb-lista-tit"},h("h2",{class:"inb-titulo",text:tit}),h("span",{class:"inb-sub",text:INBX.demo?ms.length+(ms.length===1?" mensagem":" mensagens")+" · "+NUCLEO.inbNaoLidas(ms)+" não lidas":(cont?cont.endereco:"Todas as contas")})));
    topo.appendChild(h("button",{type:"button",class:"inb-topo-btn inb-so-movel","aria-disabled":"true","aria-label":"Nova mensagem",title:INBX_FUTURO},inboxIco("nova")));cab.appendChild(topo);
    cab.appendChild(h("div",{class:"inb-busca","aria-disabled":"true",title:INBX_FUTURO},inboxIco("buscar"),h("span",{text:"Buscar mensagens"})));
    cab.appendChild(inboxFiltros());col.appendChild(cab);
    if(cont&&!INBX.demo)col.appendChild(inboxConexao(cont));
    if(ms.length){var l=h("div",{class:"inb-linhas",role:"list"});
      NUCLEO.inbAgrupar(ms).forEach(function(g){l.appendChild(h("h3",{class:"inb-data",text:g.rotulo}));g.itens.forEach(function(m){l.appendChild(inboxLinha(m))})});col.appendChild(l)}
    else if(INBX.demo)col.appendChild(inboxVazio("caixa","Nada neste filtro","Nenhuma mensagem de exemplo corresponde a este filtro."));
    else if(!INBX.contas.length)col.appendChild(inboxVazio("caixa","Nenhuma conta cadastrada","Adicione a sua conta do iCloud para começar, ou veja o exemplo da interface."));
    else if(cont&&cont.estado!=="conectada"&&cont.estado!=="sincronizando")col.appendChild(inboxVazio("cadeado","Esta caixa ainda não foi lida","Sem conexão, o RAC não sabe quantas mensagens existem: ela não está vazia, está sem leitura. A leitura de e-mails chega na etapa I2."));
    else col.appendChild(inboxVazio("caixa","Nenhuma mensagem carregada","A leitura de e-mails chega na etapa I2; nada aqui é exemplo nem simulação."));
    return col}
  /* ---- conexão da conta: a credencial no cofre (estado, conectar, substituir, desconectar) ---- */
  function inboxConexao(c){
    var est=INBX.cred[c.id]||"ausente",box=h("div",{class:"inb-conexao"+(est==="invalida"?" inb-conexao--erro":"")}),txt={ausente:"Conecte a conta para o RAC poder ler esta caixa. A senha fica cifrada no cofre do servidor e não volta ao navegador.",
      ativa:"Guardada no cofre do servidor. O navegador não a recebe de volta.",invalida:"O provedor recusou a credencial. Gere uma nova senha de app e substitua."}[est];
    box.appendChild(h("div",{class:"inb-conexao-cab"},inboxIco("cadeado","inb-conexao-ico"),h("div",{class:"inb-conexao-txt"},h("b",{text:NUCLEO.INB_CRED_ROTULOS[est]||NUCLEO.INB_CRED_ROTULOS.ausente}),h("span",{text:txt})),inboxSelo(c.estado)));
    if(!INBS.publicado){box.appendChild(h("p",{class:"inb-nota",text:"A conexão será liberada quando o serviço de e-mail for publicado (etapa I2). Nada foi pedido nem guardado."}));return box}
    if(INBX.credForm===c.id){box.appendChild(inboxFormCredencial(c));return box}
    var acoes=h("div",{class:"inb-conexao-acoes"}),conectar=rkBtn(est==="ausente"?"pri":"sec",est==="ausente"?"Conectar":"Substituir senha");conectar.onclick=function(){INBX.credForm=c.id;INBX.credErros={};inboxDesenhar()};acoes.appendChild(conectar);
    if(est!=="ausente"){var rem=rkBtn("ter","Desconectar e remover a credencial");rem.onclick=function(){inboxRemoverCredencial(c)};acoes.appendChild(rem)}
    box.appendChild(acoes);return box}
  function inboxFormCredencial(c){
    var E=INBX.credErros,usu=h("input",{class:"rac-campo-entrada",id:"inb-cred-usuario",type:"email",autocomplete:"off",autocapitalize:"off",spellcheck:"false","aria-label":"E-mail do ID Apple","aria-invalid":E.usuario?"true":null}),
      sen=h("input",{class:"rac-campo-entrada",id:"inb-cred-senha",type:"password",autocomplete:"off",autocapitalize:"off",spellcheck:"false",placeholder:"abcd-efgh-ijkl-mnop","aria-label":"Senha específica de app","aria-invalid":E.senha_app?"true":null});
    usu.value=c.endereco;
    var enviar=rkBtn("pri","Guardar no cofre"),cancelar=rkBtn("ter","Cancelar");cancelar.onclick=function(){INBX.credForm=null;INBX.credErros={};inboxDesenhar()};
    enviar.onclick=function(){
      var login=document.getElementById("inb-cred-usuario").value,campo=document.getElementById("inb-cred-senha"),senha=campo.value;
      campo.value="";   /* o campo é limpo na hora: a senha só existe nesta variável local, até o envio */
      var v=NUCLEO.inbCredencialValida({usuario:login,senha:senha});senha=null;
      if(!v.ok){INBX.credErros=v.erros;inboxDesenhar();return}
      INBX.credOcupado=true;enviar.setAttribute("disabled","disabled");enviar.setAttribute("aria-busy","true");
      var entrada={conta_id:c.id,usuario:v.usuario,senha_app:v.senha};
      inboxChamar("credencial_guardar",entrada).then(function(r){entrada=null;INBX.credOcupado=false;
        if(r.ok){INBX.credForm=null;INBX.credErros={};INBX.aviso={tipo:"ok",t:"Credencial guardada no cofre. Ela não volta ao navegador; a conexão com o provedor é verificada na etapa I2."};return inboxLer()}
        INBX.credErros={geral:NUCLEO.inbErroTexto(r.erro)}}).then(inboxDesenhar)};
    return h("div",{class:"inb-form"},
      h("div",{class:"rac-campo"+(E.usuario?" rac-campo--erro":"")},h("label",{class:"rac-campo-rotulo","for":"inb-cred-usuario",text:"E-mail do ID Apple"}),usu,E.usuario?h("span",{class:"rac-campo-ajuda",text:"✗ "+E.usuario}):null),
      h("div",{class:"rac-campo"+(E.senha_app?" rac-campo--erro":"")},h("label",{class:"rac-campo-rotulo","for":"inb-cred-senha",text:"Senha específica de app"}),sen,
        h("span",{class:"rac-campo-ajuda",text:E.senha_app?"✗ "+E.senha_app:"No site da sua conta Apple, em Segurança, gere uma \"senha específica de app\". Nunca use a senha principal da conta Apple."})),
      E.geral?h("p",{class:"inb-erro",role:"alert",text:"✗ "+E.geral}):null,
      h("p",{class:"rac-t-legenda",text:"Enviada uma vez, por conexão segura, e guardada cifrada no cofre do servidor. Não fica neste aparelho nem volta para cá."}),
      h("div",{class:"inb-conexao-acoes"},enviar,cancelar))}
  function inboxRemoverCredencial(c){
    if(!window.confirm("Remover a credencial guardada desta conta? A caixa de e-mail em si não é tocada, mas o RAC deixa de conseguir lê-la até você conectar de novo."))return;
    inboxChamar("credencial_remover",{conta_id:c.id}).then(function(r){
      INBX.aviso=r.ok?{tipo:"ok",t:"Credencial removida do cofre. A conta ficou desconectada."}:{tipo:"erro",t:NUCLEO.inbErroTexto(r.erro)};return r.ok?inboxLer():null}).then(inboxDesenhar)}
  /* ---- leitura: cabeçalho, corpo e anexos; no iPhone é uma tela própria com barra de ações embaixo ---- */
  function inboxLeitura(){
    var art=h("article",{class:"inb-leitura","aria-label":"Leitura"}),m=INBX.demo&&window.INBOX_DEMO?window.INBOX_DEMO.filter(function(x){return x.id===INBX.msg})[0]:null;
    var topo=h("div",{class:"inb-leitura-topo"}),v=h("button",{type:"button",class:"inb-voltar"},"Mensagens");v.onclick=function(){INBX.painel="lista";INBX.msg=null;inboxDesenhar()};topo.appendChild(v);
    var acoes=h("div",{class:"inb-acoes",role:"toolbar","aria-label":"Ações da mensagem"});
    [["responder","Responder"],["todos","Responder a todos"],["encaminhar","Encaminhar"],["arquivo","Arquivar"],["lixo","Excluir"],["mais","Mais"]].forEach(function(a){acoes.appendChild(inboxBtnIco(a[0],a[1]))});topo.appendChild(acoes);art.appendChild(topo);
    if(!m){art.appendChild(inboxVazio("caixa","Nenhuma mensagem selecionada","Escolha uma mensagem na lista para ler."));return art}
    var corpo=h("div",{class:"inb-leitura-corpo"});
    corpo.appendChild(h("h2",{class:"inb-leitura-assunto",text:m.assunto}));
    corpo.appendChild(h("div",{class:"inb-de"},h("span",{class:"inb-avatar inb-avatar--g","aria-hidden":"true",text:NUCLEO.inbIniciais(m.remetente)}),h("span",{class:"inb-de-txt"},h("b",{text:m.remetente}),h("span",{class:"inb-de-end",text:m.endereco}),
      h("span",{class:"inb-de-para",text:"Para: "+(m.para||["você"]).join(", ")})),h("span",{class:"inb-de-data",text:NUCLEO.inbDataCompleta(m.recebida)})));
    corpo.appendChild(h("div",{class:"inb-texto"},m.corpo.map(function(p){return h("p",{text:p})})));
    if(m.anexos&&m.anexos.length)corpo.appendChild(h("div",{class:"inb-anexos"},h("span",{class:"inb-grupo",text:m.anexos.length+(m.anexos.length===1?" anexo":" anexos")}),
      m.anexos.map(function(n){return h("span",{class:"inb-arquivo"},h("span",{class:"inb-arquivo-tipo",text:n.tipo}),h("span",{class:"inb-arquivo-txt"},h("b",{text:n.nome}),h("span",{text:n.tam})))})));
    art.appendChild(corpo);return art}
  /* ---- adicionar conta: só provedor, apelido e endereço (a credencial é um passo à parte, na conta) ---- */
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
      Promise.resolve(SB.from("inbox_contas").insert(v.linha).select("*")).then(sbOk).then(function(){INBX.form=false;INBX.valores={provedor:"icloud",apelido:"",endereco:""};INBX.aviso={tipo:"ok",t:"Conta cadastrada. Ela fica \"Nova\" até a conexão existir (etapa I2)."};return inboxLer()},
        function(e){INBX.erros={endereco:e&&e.code==="23505"?"Esta conta já está cadastrada.":NUCLEO.segTabelaAusente(e&&(e.message||e.code))?"A estrutura do Inbox ainda não existe no banco (migration 051 pendente).":"Não consegui cadastrar agora."}}).then(inboxDesenhar)};
    return rkCard("Adicionar conta",h("div",{class:"rac-pilha"},h("div",{class:"rac-campo"},h("label",{class:"rac-campo-rotulo","for":"inb-prov",text:"Provedor"}),sel,E.provedor?h("span",{class:"rac-campo-ajuda",text:"✗ "+E.provedor}):null),ap,en,
      rkInfo("i","Sem senha neste formulário","Aqui só se cadastra a conta. A credencial (senha específica de app) é um passo à parte, dentro da conta, e vai direto para o cofre do servidor."),salvar))}
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
    if(INBX.demo){var sair=h("button",{type:"button",class:"inb-link",text:"Sair do exemplo"});sair.onclick=inboxAlternarDemo;pg.appendChild(h("div",{class:"inb-demo",role:"note"},h("b",{text:"DEMONSTRAÇÃO"}),h("span",{text:"Mensagens fictícias; nenhuma caixa real."}),sair))}
    if(INBX.aviso)pg.appendChild(rkAlerta(INBX.aviso.tipo,INBX.aviso.t));
    if(st.tipo==="estrutura_pendente")pg.appendChild(rkEstado("aviso","A estrutura do Inbox ainda não foi criada no banco (migration 051 pendente). Quando o dono aplicar, as contas aparecem aqui."));
    else if(st.tipo==="erro"){var re=rkBtn("sec","Tentar de novo");re.onclick=function(){inboxCarregar()};pg.appendChild(rkEstado("erro","Não consegui carregar o Inbox agora.",re))}
    if(INBX.form||(st.tipo==="vazio"&&!INBX.demo))pg.appendChild(inboxForm());
    if(st.tipo!=="erro")pg.appendChild(h("div",{class:"inb-janela","data-painel":INBX.painel},inboxLateral(),inboxLista(),inboxLeitura()));
    pg.appendChild(inboxMatriz())}
  function inboxCarregar(){INBX.carregando=true;inboxDesenhar();return inboxLer().then(inboxDesenhar)}
  function renderInbox(conta,pasta){
    INBX.painel="lista";INBX.msg=null;INBX.credForm=null;INBX.credErros={};
    if(conta){INBX.conta=conta;INBX.pasta=pasta||null}
    return inboxCarregar()}
