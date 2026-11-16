/* Dia a Dia RAC — módulo carregado quando a seção abre. RAC Inbox (#inbox), SÓ DO DONO (a Fernanda não vê; Documento 10, seção 6, item 7).
   Desktop: uma superfície com três áreas (lateral com caixas, pastas e categorias; lista agrupada por data com remetente, assunto, prévia e horário; leitura com cabeçalho, corpo e anexos).
   iPhone: a lista ocupa a tela com título grande; a leitura e as caixas abrem em tela própria (voltar no topo, barra de ações embaixo com alvo de toque de 44 px, áreas seguras respeitadas).
   I2: com a conta conectada, a lista é a REAL: o cache de cabeçalhos (inbox_mensagens_ref, migration 053; remetente, assunto, data, flags: sem corpo nem prévia), preenchido pela função "rac-inbox" quando se toca em
   Sincronizar. O TEXTO da mensagem e os ANEXOS são pedidos ao serviço na hora de abrir (ler_mensagem, baixar_anexo), chegam só em memória e não ficam guardados em lugar nenhum; o HTML nunca chega (vem convertido em texto).
   Este módulo só LÊ (inbox_contas, inbox_pastas, inbox_sincronizacao, inbox_mensagens_ref e o estado da credencial) e grava só o cadastro da conta; o cache é escrito pelo servidor. O "exemplo da interface" (js/inbox-demo.js)
   continua à parte: dados FICTÍCIOS, rotulados e nunca misturados com mensagens reais. I3.2: Arquivar, Excluir (Lixeira, com confirmação) e \"Mais\" (lida/não lida, spam, mover para pasta) agem sobre UMA mensagem real por vez, pelo serviço, e a tela só muda depois que o
   servidor confirma (inboxOrganizar). Abrir uma mensagem continua NÃO a marcando como lida no provedor.
   CREDENCIAL: o formulário de conexão pede o login do ID Apple e a senha ESPECÍFICA DE APP, envia UMA vez pelo serviço (js/inbox-servico.js, que a guarda no Vault) e limpa o campo na hora; a senha
   nunca entra no estado da tela (INBX), nunca é guardada no aparelho e nunca volta do servidor. A senha principal da conta Apple não é pedida nem aceita. O formulário só aparece com o serviço publicado (INBS.publicado).
   Regras no núcleo (NUCLEO.inb*), componentes do kit (js/kit.js). */
  var INBX={contas:[],pastas:[],cred:{},erro:null,carregando:false,conta:"todas",pasta:null,filtro:"todas",painel:"lista",msg:null,demo:false,form:false,erros:{},valores:{provedor:"icloud",apelido:"",endereco:""},aviso:null,
    credForm:null,credErros:{},credOcupado:false,msgs:[],sincs:{},sinc:null,leit:null,baixando:null,testando:null,opcoes:null,salvandoPref:false,compor:null,testandoSmtp:null,acao:null,menuMais:null,menuPasta:false,semMover:{}};
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
    nova:'<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',cadeado:'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',atualizar:'<path d="M20 11a8 8 0 0 0-14.5-4M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4"/>',
    lida:'<path d="M3 9l9 6 9-6"/><path d="M3 9l9-6 9 6v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',naolida:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',mover:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v5M9.5 13.5L12 11l2.5 2.5"/>'};
  function inboxIco(nome,cls){var s=h("span",{class:"inb-ico"+(cls?" "+cls:""),"aria-hidden":"true"});s.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(INBX_ICO[nome]||INBX_ICO.outra)+'</svg>';return s}
  function inboxLer(){
    INBX.carregando=true;INBX.erro=null;
    var cred=Promise.resolve(SB.from("inbox_credenciais").select("conta_id,estado")).then(sbOk).then(function(l){var m={};(l||[]).forEach(function(x){m[x.conta_id]=x.estado});return m},function(){return {}});   /* sem a 052 aplicada: sem credencial, sem erro */
    /* o cache de cabeçalhos (053) e o estado da sincronização: sem a 053 aplicada a lista fica vazia, sem erro */
    var msgs=Promise.resolve(SB.from("inbox_mensagens_ref").select("id,conta_id,pasta_id,uid,uidvalidity,recebida_em,assunto,remetente_nome,remetente_endereco,destinatarios,lida,sinalizada,respondida,tamanho,anexo_provavel").order("recebida_em",{ascending:false}).limit(1000)).then(sbOk).then(function(l){return l||[]},function(){return []});
    var sincs=Promise.resolve(SB.from("inbox_sincronizacao").select("*")).then(sbOk).then(function(l){var m={};(l||[]).forEach(function(x){m[x.pasta_id]=x});return m},function(){return {}});
    return Promise.all([SB.from("inbox_contas").select("*").order("apelido"),SB.from("inbox_pastas").select("*").order("nome_externo"),cred,msgs,sincs]).then(function(r){
      INBX.contas=sbOk(r[0])||[];INBX.pastas=sbOk(r[1])||[];INBX.cred=r[2]||{};INBX.msgs=r[3]||[];INBX.sincs=r[4]||{};INBX.carregando=false;inboxMarca()}).then(null,function(e){INBX.carregando=false;INBX.erro=e;INBX.contas=[];INBX.pastas=[];INBX.cred={};INBX.msgs=[];INBX.sincs={}})}
  function inboxSelo(estado){var e=NUCLEO.inbEstado(estado);return h("span",{class:"inb-estado inb-estado--"+e.tipo,title:e.rotulo},h("i",{"aria-hidden":"true"}),e.rotulo)}
  /* a pasta mostrada: a escolhida na lateral ou, numa conta, a caixa de entrada */
  function inboxPastaAtual(){
    var cont=inboxContaAtual();if(!cont)return null;
    var ps=INBX.pastas.filter(function(p){return p.conta_id===cont.id}),sel=INBX.pasta?ps.filter(function(p){return p.id===INBX.pasta})[0]:null;
    return sel||ps.filter(function(p){return p.uso==="entrada"})[0]||null}
  /* a lista: o exemplo (rotulado) ou as mensagens REAIS do cache; os dois nunca se misturam */
  function inboxMensagens(){
    if(INBX.demo)return window.INBOX_DEMO?NUCLEO.inbFiltrar(window.INBOX_DEMO,INBX.filtro):[];
    var ids={},cont=inboxContaAtual(),alvo=cont?inboxPastaAtual():null,linhas=[];
    if(cont){if(!alvo)return [];ids[alvo.id]=1}else INBX.pastas.forEach(function(p){if(p.uso==="entrada")ids[p.id]=1});
    INBX.msgs.forEach(function(r){if(r.pasta_id&&ids[r.pasta_id]){var l=NUCLEO.inbLinhaMensagem(r);if(l)linhas.push(l)}});
    return NUCLEO.inbFiltrar(linhas,INBX.filtro)}
  function inboxLinhaPorId(id){var r=INBX.msgs.filter(function(x){return x.id===id})[0];return r?NUCLEO.inbLinhaMensagem(r):null}
  /* abrir uma mensagem real: o texto vem do serviço na hora (sob demanda); se a pessoa abrir outra enquanto esta carrega, a resposta antiga é ignorada */
  function inboxAbrirMsg(id){
    if(INBX.compor&&!inboxDescartarCompor()){INBX.painel="leitura";inboxDesenhar();return}   /* envio em curso ou rascunho que a pessoa quis manter */
    INBX.form=false;INBX.msg=id;INBX.painel="leitura";INBX.leit=null;INBX.menuMais=null;INBX.menuPasta=false;
    var m=INBX.demo?null:inboxLinhaPorId(id);
    if(m)INBX.leit={id:id,estado:"carregando"};
    inboxDesenhar();if(m)inboxLerMensagem(m)}
  function inboxLerMensagem(m){
    return inboxChamar("ler_mensagem",{conta_id:m.conta_id,pasta_id:m.pasta_id,uid:m.uid}).then(function(r){
      if(!INBX.leit||INBX.leit.id!==m.id)return;
      INBX.leit=r.ok?{id:m.id,estado:"ok",dados:r}:{id:m.id,estado:"erro",erro:r.erro};inboxDesenhar()})}
  function inboxIr(conta,pasta){INBX.menuMais=null;INBX.menuPasta=false;INBX.form=false;INBX.conta=conta||"todas";INBX.pasta=pasta||null;INBX.msg=null;INBX.leit=null;INBX.opcoes=null;INBX.painel="lista";INBX.credForm=null;INBX.credErros={};inboxDesenhar()}
  function inboxContaAtual(){return INBX.contas.filter(function(c){return c.id===INBX.conta})[0]||null}
  /* a conta cujas ações de conexão (Sincronizar, Testar conexão) aparecem: a selecionada ou, em "Todas as contas", a ÚNICA conta (antes não havia linha de conexão nesse caso) */
  function inboxContaAcoes(){return inboxContaAtual()||(INBX.conta==="todas"&&INBX.contas.length===1?INBX.contas[0]:null)}
  /* sincronizar: as contas conectadas (a atual, ou todas na caixa unificada); cada uma lista as pastas se ainda não tem e sincroniza a pasta mostrada (ou a de entrada) */
  function inboxContasSincronizaveis(){var cont=inboxContaAtual(),l=cont?[cont]:INBX.contas;return l.filter(function(c){return INBX.cred[c.id]==="ativa"})}
  /* selo do ícone do app com o total de não lidas da caixa de entrada (onde o navegador suporta; o servidor também o atualiza a cada aviso) */
  function inboxMarca(){try{var n=0;INBX.pastas.forEach(function(p){if(p.uso==="entrada"&&p.nao_lidas>0)n+=p.nao_lidas});var f=n>0?navigator.setAppBadge:navigator.clearAppBadge;if(f)Promise.resolve(f.call(navigator,n)).catch(function(){})}catch(e){}}
  /* preferências por conta (migration 054): sincronizar sozinho a cada 10 min e avisar por notificação; o dono edita só as dele (RLS) */
  function inboxPreferencia(c,campo,valor){
    if(INBX.salvandoPref)return;INBX.salvandoPref=true;var corpo={};corpo[campo]=valor;
    Promise.resolve(SB.from("inbox_contas").update(corpo).eq("id",c.id)).then(sbOk).then(function(){return inboxLer()}).then(function(){INBX.salvandoPref=false;inboxDesenhar()},function(){INBX.salvandoPref=false;INBX.aviso={tipo:"erro",t:"Não consegui salvar a preferência. Confira se a migration 054 foi aplicada."};inboxDesenhar()})}
  function inboxOpcao(c,campo,rotulo){var id="inb-pref-"+campo,inp=h("input",{type:"checkbox",id:id});inp.checked=c[campo]!==false;inp.onchange=function(){inboxPreferencia(c,campo,inp.checked)};return h("label",{class:"inb-opcao","for":id},inp,h("span",{text:rotulo}))}
  function inboxSincronizarConta(c){
    var tinha=INBX.pastas.some(function(p){return p.conta_id===c.id}),prep=tinha?Promise.resolve({ok:true}):inboxChamar("listar_pastas",{conta_id:c.id});
    return prep.then(function(r){
      if(!r.ok)return r;
      return (tinha?Promise.resolve():inboxLer()).then(function(){
        var ps=INBX.pastas.filter(function(p){return p.conta_id===c.id}),sel=(INBX.conta===c.id&&INBX.pasta?ps.filter(function(p){return p.id===INBX.pasta})[0]:null)||ps.filter(function(p){return p.uso==="entrada"})[0]||ps[0];
        if(!sel)return {ok:false,erro:"pasta_inexistente"};
        return inboxChamar("sincronizar_pasta",{conta_id:c.id,pasta_id:sel.id}).then(function(s){return s.ok?{ok:true,frase:NUCLEO.inbFraseSincronizacao(s)}:s})})})}
  function inboxSincronizar(){
    if(INBX.sinc||!INBS.publicado||INBX.demo)return;
    var alvo=inboxContasSincronizaveis(),erro=null,frases=[];
    if(!alvo.length){INBX.aviso={tipo:"erro",t:"Conecte a conta com a senha específica de app para poder sincronizar."};inboxDesenhar();return}
    INBX.sinc=true;INBX.aviso=null;inboxDesenhar();
    alvo.reduce(function(p,c){return p.then(function(){
      if(erro)return null;
      var pre=alvo.length>1?c.apelido+": ":"";
      return inboxSincronizarConta(c).then(function(r){if(r.ok)frases.push(pre+r.frase);else erro=pre+NUCLEO.inbErroTexto(r.erro)})})},Promise.resolve())
    .then(function(){return inboxLer()}).then(function(){INBX.sinc=null;INBX.aviso=erro?{tipo:"erro",t:erro}:{tipo:"ok",t:frases.join(" ")};inboxDesenhar()})}
  /* baixar UM anexo: chega em memória, vira arquivo no aparelho e não fica guardado no RAC; tipo perigoso vira binário genérico e o nome é saneado (NUCLEO.inbRespostaAnexo) */
  function inboxBaixarAnexo(m,a){
    if(INBX.baixando)return;
    INBX.baixando=m.id+"|"+a.parte;INBX.aviso=null;inboxDesenhar();
    inboxChamar("baixar_anexo",{conta_id:m.conta_id,pasta_id:m.pasta_id,uid:m.uid,parte:a.parte}).then(function(r){
      INBX.baixando=null;
      if(!r.ok){INBX.aviso={tipo:"erro",t:NUCLEO.inbErroTexto(r.erro)};inboxDesenhar();return}
      try{
        var bin=atob(r.base64),bytes=new Uint8Array(bin.length),i;for(i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
        var url=URL.createObjectURL(new Blob([bytes],{type:r.tipo})),link=document.createElement("a");
        link.href=url;link.download=r.nome;link.rel="noopener";document.body.appendChild(link);link.click();document.body.removeChild(link);
        setTimeout(function(){URL.revokeObjectURL(url)},60000);
        INBX.aviso={tipo:"ok",t:"Anexo pronto: "+r.nome+". Ele não fica guardado no RAC."}}
      catch(e){INBX.aviso={tipo:"erro",t:"Não consegui preparar o anexo."}}
      inboxDesenhar()})}
  /* testar a conexão em duas provas, sem ler nem alterar nada: (1) o canal seguro com o servidor (sem credencial, sem Apple); (2) o login no iCloud. O aviso diz qual prova falhou e mostra as versões no ar. */
  function inboxTestarConexao(c){
    if(INBX.testando||!INBS.publicado)return;
    INBX.testando=c.id;INBX.aviso=null;inboxDesenhar();
    inboxChamar("testar_canal",{}).then(function(a){
      if(!a.ok){INBX.testando=null;INBX.aviso={tipo:"erro",t:"1 de 2 · O canal seguro com o servidor falhou: "+NUCLEO.inbErroTexto(a.erro)};inboxDesenhar();return null}
      var v="função "+a.funcao+", Worker "+a.worker;
      return inboxChamar("testar_conta",{conta_id:c.id}).then(function(b){
        INBX.testando=null;
        INBX.aviso=b.ok?{tipo:"ok",t:"Conexão ok. 1 de 2 · canal seguro com o servidor ("+v+"). 2 de 2 · login no iCloud. Nada foi lido nem alterado."}:{tipo:"erro",t:"1 de 2 · canal seguro ok ("+v+"). 2 de 2 · o login no iCloud falhou: "+NUCLEO.inbErroTexto(b.erro)};
        return inboxLer().then(inboxDesenhar)})}).then(null,function(){INBX.testando=null;INBX.aviso={tipo:"erro",t:NUCLEO.inbErroTexto("rede")};inboxDesenhar()})}
  function inboxTamanho(n){return n>=1048576?(n/1048576).toFixed(1).replace(".",",")+" MB":n>=1024?Math.round(n/1024)+" KB":n+" B"}
  function inboxExt(a){var m=/\.([A-Za-z0-9]{1,4})$/.exec(a.nome||"");return m?m[1].toUpperCase():"ARQ"}
  function inboxBtnIco(nome,rotulo,classe){return h("button",{type:"button",class:"inb-btn-ico"+(classe?" "+classe:""),"aria-disabled":"true","aria-label":rotulo,title:rotulo+" · "+INBX_FUTURO},inboxIco(nome),h("span",{class:"inb-btn-rot",text:rotulo}))}
  /* ação já implementada (I3): ativa com `fn`; sem `fn` (mensagem ainda carregando, exemplo, conta sem credencial) fica desligada e diz por quê */
  function inboxBtnAcao(nome,rotulo,fn){var b=h("button",{type:"button",class:"inb-btn-ico","aria-label":rotulo,title:fn?rotulo:rotulo+" · disponível com a mensagem carregada, numa conta conectada"},inboxIco(nome),h("span",{class:"inb-btn-rot",text:rotulo}));
    if(fn)b.onclick=fn;else b.setAttribute("aria-disabled","true");return b}
  /* ---- I3.2: gerenciar UMA mensagem real (lida/não lida, arquivar, excluir=Lixeira, spam, mover). A tela só muda DEPOIS da confirmação do servidor: a lista e as contagens vêm do cache que a função atualizou
     (relido do banco); se falhar, nada na tela muda e a frase diz o que aconteceu. Um toque por vez (INBX.acao); excluir pede confirmação; o exemplo e contas sem conexão nunca executam. ---- */
  function inboxOrganizar(m,acao,destino){
    if(INBX.acao||INBX.demo||!INBS.publicado||!m||INBX.cred[m.conta_id]!=="ativa")return;
    if(acao==="excluir"&&!window.confirm("Mover esta mensagem para a Lixeira? Ela sai desta pasta. O RAC não faz exclusão definitiva."))return;
    var ped={conta_id:m.conta_id,pasta_id:m.pasta_id,uid:m.uid,acao:acao};if(acao==="mover"){if(!destino)return;ped.destino_pasta_id=destino.id}
    INBX.acao={id:m.id,acao:acao};INBX.aviso=null;INBX.menuMais=null;INBX.menuPasta=false;inboxDesenhar();
    return inboxChamar("organizar_mensagem",ped).then(function(r){
      INBX.acao=null;
      if(!r.ok){   /* falha ou resultado incerto: o estado anterior fica como estava; o iCloud sem MOVE é lembrado nesta sessão para não oferecer o que não funciona */
        if(r.erro==="acao_indisponivel")INBX.semMover[m.conta_id]=true;
        INBX.aviso={tipo:r.erro==="acao_incerta"||r.erro==="confirmacao_ausente"?"aviso":"erro",t:NUCLEO.inbErroTexto(r.erro)};inboxDesenhar();return}
      INBX.aviso={tipo:"ok",t:NUCLEO.inbFraseOrganizacao(r,destino?(destino.nome_exibicao||destino.nome_externo):null)};
      return inboxLer().then(function(){
        if(acao!=="marcar_lida"&&acao!=="marcar_nao_lida"&&INBX.msg===m.id){INBX.msg=null;INBX.leit=null;INBX.painel="lista"}   /* a mensagem saiu desta pasta */
        inboxDesenhar()})})}
  /* botão de ação do gerenciamento: `est` = {ok,motivo} (NUCLEO.inbAcoesDisponiveis) ou nulo (exemplo, conta sem conexão); desligado explica por quê (também no toque, onde "title" não aparece) */
  function inboxBtnOrg(nome,rotulo,est,fn){
    var ocupado=!!INBX.acao,exec=INBX.acao&&INBX.acao.acao,b=h("button",{type:"button",class:"inb-btn-ico","aria-label":rotulo,title:est&&est.ok?rotulo:rotulo+" · "+(est&&est.motivo?est.motivo:"disponível com a mensagem carregada, numa conta conectada")},inboxIco(nome),h("span",{class:"inb-btn-rot",text:rotulo}));
    if(!est){b.setAttribute("aria-disabled","true");return b}
    if(!est.ok){b.setAttribute("aria-disabled","true");b.onclick=function(){INBX.aviso={tipo:"aviso",t:rotulo+": "+est.motivo};inboxDesenhar()};return b}
    if(ocupado){b.setAttribute("aria-disabled","true");b.setAttribute("disabled","disabled");if(exec&&exec===b.getAttribute("data-acao"))b.setAttribute("aria-busy","true");return b}
    b.onclick=fn;return b}
  /* "Mais": lida/não lida, spam / não é spam e mover para pasta (só pastas selecionáveis desta conta); no celular vira uma folha acima da barra de ações */
  function inboxMenuMais(m,org){
    var ocupado=!!INBX.acao,box=h("div",{class:"inb-menu",role:"menu","aria-label":"Mais ações da mensagem"}),pastaAtual=INBX.pastas.filter(function(p){return p.id===m.pasta_id})[0],noSpam=pastaAtual&&pastaAtual.uso==="spam";
    var item=function(acao,rotulo,ico,fn){var e=org[acao],b=h("button",{type:"button",class:"inb-menu-item",role:"menuitem"},inboxIco(ico),h("span",{class:"inb-menu-txt"},h("b",{text:rotulo}),e.ok?null:h("span",{text:e.motivo})));
      if(!e.ok||ocupado){b.setAttribute("aria-disabled","true");if(ocupado)b.setAttribute("disabled","disabled");if(!e.ok)b.onclick=function(){INBX.aviso={tipo:"aviso",t:rotulo+": "+e.motivo};INBX.menuMais=null;inboxDesenhar()}}else b.onclick=fn;
      return b};
    box.appendChild(m.lida?item("marcar_nao_lida","Marcar como não lida","naolida",function(){inboxOrganizar(m,"marcar_nao_lida")}):item("marcar_lida","Marcar como lida","lida",function(){inboxOrganizar(m,"marcar_lida")}));
    box.appendChild(noSpam?item("nao_spam","Não é spam","entrada",function(){inboxOrganizar(m,"nao_spam")}):item("spam","Mover para spam","spam",function(){inboxOrganizar(m,"spam")}));
    var pasta=item("mover","Mover para pasta…","mover",function(){INBX.menuPasta=!INBX.menuPasta;inboxDesenhar()});pasta.setAttribute("aria-expanded",INBX.menuPasta?"true":"false");box.appendChild(pasta);
    if(INBX.menuPasta&&org.mover.ok){var lista=h("div",{class:"inb-menu-pastas",role:"group","aria-label":"Pastas desta conta"});
      NUCLEO.inbDestinosMover(INBX.pastas,m.conta_id,m.pasta_id).forEach(function(p){var b=h("button",{type:"button",class:"inb-menu-item inb-menu-pasta",role:"menuitem"},inboxIco(p.uso),h("span",{class:"inb-menu-txt"},h("b",{text:p.nome_exibicao||p.nome_externo})));
        if(ocupado){b.setAttribute("aria-disabled","true");b.setAttribute("disabled","disabled")}else b.onclick=function(){inboxOrganizar(m,"mover",p)};lista.appendChild(b)});box.appendChild(lista)}
    if(ocupado)box.appendChild(h("p",{class:"inb-nota",role:"status",text:"Aguardando a confirmação do iCloud…"}));
    return box}
  /* ---- lateral: nova mensagem (desligada), caixas com contas e pastas, categorias ---- */
  function inboxLateral(){
    var u=NUCLEO.inbUnificada(INBX.contas,INBX.pastas),arv=NUCLEO.inbArvore(INBX.contas,INBX.pastas),box=h("aside",{class:"inb-lateral","aria-label":"Caixas de e-mail"});
    var fechar=h("button",{type:"button",class:"inb-voltar",text:"Mensagens"});fechar.onclick=function(){INBX.painel="lista";inboxDesenhar()};box.appendChild(fechar);
    var nova=h("button",{type:"button",class:"inb-novo",title:inboxPodeEnviar()?"Escrever uma nova mensagem":"Conecte uma conta para escrever"},inboxIco("nova"),"Nova mensagem");nova.onclick=function(){inboxCompor("novo")};if(!inboxPodeEnviar())nova.setAttribute("aria-disabled","true");box.appendChild(nova);
    box.appendChild(h("p",{class:"inb-grupo",text:"Caixas"}));
    var un=h("button",{type:"button",class:"inb-item"+(INBX.conta==="todas"?" inb-item--ativo":"")},inboxIco("caixa"),h("span",{class:"inb-item-nome",text:"Caixa unificada"}),
      h("span",{class:"inb-item-n",text:u.contas&&u.naoLidas!=null?String(u.naoLidas):""}));
    un.onclick=function(){inboxIr("todas")};box.appendChild(un);
    if(u.parcial)box.appendChild(h("p",{class:"inb-nota",text:"Contagem parcial: há conta sem conexão."}));
    arv.forEach(function(g){
      var c=g.conta,ativa=INBX.conta===c.id,t=h("button",{type:"button",class:"inb-conta"+(ativa&&!INBX.pasta?" inb-item--ativo":"")},h("span",{class:"inb-avatar inb-avatar--p","aria-hidden":"true",text:NUCLEO.inbIniciais(c.apelido)}),
        h("span",{class:"inb-conta-txt"},h("b",{text:c.apelido}),h("span",{text:c.endereco})),h("span",{class:"inb-ponto inb-ponto--"+g.estado.tipo,title:g.estado.rotulo,"aria-label":g.estado.rotulo}));
      t.onclick=function(){inboxIr(c.id)};box.appendChild(t);
      if(ativa){g.pastas.forEach(function(p){var b=h("button",{type:"button",class:"inb-pasta"+(INBX.pasta===p.id?" inb-item--ativo":"")},inboxIco(p.uso),h("span",{class:"inb-item-nome",text:p.nome_exibicao||p.nome_externo}),h("span",{class:"inb-item-n",text:p.nao_lidas==null?"":String(p.nao_lidas)}));
        b.onclick=function(){inboxIr(c.id,p.id)};box.appendChild(b)});
        if(!g.pastas.length)box.appendChild(h("p",{class:"inb-nota",text:INBX.cred[c.id]==="ativa"?"As pastas aparecem na primeira sincronização.":"Conecte a conta para ver as pastas."}))}});
    box.appendChild(h("p",{class:"inb-grupo"},"Categorias",h("span",{class:"inb-etiqueta",text:"Etapa I4"})));
    NUCLEO.INB_CATEGORIAS.forEach(function(k){box.appendChild(h("button",{type:"button",class:"inb-pasta inb-item--off","aria-disabled":"true",title:"Categorias inteligentes chegam na etapa I4"},inboxIco("tag"),h("span",{class:"inb-item-nome",text:k[1]})))});
    var rod=h("div",{class:"inb-lateral-rod"}),add=h("button",{type:"button",class:"inb-link","aria-expanded":INBX.form?"true":"false",text:"Adicionar conta"});add.onclick=inboxAlternarForm;rod.appendChild(add);
    var ex=h("button",{type:"button",class:"inb-link",text:INBX.demo?"Sair do exemplo":"Ver exemplo da interface"});ex.onclick=inboxAlternarDemo;rod.appendChild(ex);box.appendChild(rod);
    return box}
  function inboxAlternarDemo(){
    INBX.form=false;
    if(INBX.demo){INBX.demo=false;INBX.msg=null;INBX.painel="lista";inboxDesenhar();return}
    precisa(["inbox-demo"]).then(function(){INBX.demo=true;INBX.msg=null;INBX.painel="lista";inboxDesenhar()},function(){INBX.aviso={tipo:"erro",t:"Não consegui abrir o exemplo agora."};inboxDesenhar()})}
  /* ---- lista agrupada por data: remetente, assunto, prévia e horário ---- */
  function inboxFiltros(){var f=h("div",{class:"inb-filtros",role:"group","aria-label":"Filtrar mensagens"});
    NUCLEO.INB_FILTROS.forEach(function(x){var b=h("button",{type:"button",class:"inb-pilula"+(INBX.filtro===x[0]?" inb-pilula--ativa":""),"aria-pressed":INBX.filtro===x[0]?"true":"false",text:x[1]});b.onclick=function(){INBX.filtro=x[0];inboxDesenhar()};f.appendChild(b)});return f}
  function inboxLinha(m){
    var b=h("button",{type:"button",class:"inb-linha"+(INBX.msg===m.id?" inb-linha--ativa":"")+(m.lida?"":" inb-linha--nova"),"aria-label":(m.lida?"":"Não lida. ")+m.remetente+". "+m.assunto});
    b.appendChild(h("span",{class:"inb-avatar","aria-hidden":"true",text:NUCLEO.inbIniciais(m.remetente)}));
    b.appendChild(h("span",{class:"inb-linha-corpo"},h("span",{class:"inb-linha-topo"},h("span",{class:"inb-remetente",text:m.remetente}),h("span",{class:"inb-meta"},m.anexo?inboxIco("clip","inb-ico--anexo"):null,h("span",{class:"inb-hora",text:NUCLEO.inbHora(m.recebida)}))),
      h("span",{class:"inb-assunto",text:m.assunto}),m.previa?h("span",{class:"inb-previa",text:m.previa}):null));
    b.onclick=function(){inboxAbrirMsg(m.id)};return b}
  function inboxVazio(icone,titulo,texto,acoes){return h("div",{class:"inb-vazio"},inboxIco(icone,"inb-vazio-ico"),h("b",{text:titulo}),h("p",{text:texto}),acoes||null)}
  function inboxLista(){
    var col=h("section",{class:"inb-mensagens","aria-label":"Mensagens"}),cont=inboxContaAtual(),tit=INBX.conta==="todas"?"Caixa de entrada":(cont?cont.apelido:"Conta"),ms=inboxMensagens();
    var cab=h("div",{class:"inb-cabeca"}),topo=h("div",{class:"inb-lista-topo"}),menu=h("button",{type:"button",class:"inb-topo-btn inb-so-movel","aria-label":"Caixas"},inboxIco("menu"));menu.onclick=function(){INBX.painel="caixas";inboxDesenhar()};
    topo.appendChild(menu);
    topo.appendChild(h("div",{class:"inb-lista-tit"},h("h2",{class:"inb-titulo",text:tit}),h("span",{class:"inb-sub",text:INBX.demo||ms.length?ms.length+(ms.length===1?" mensagem":" mensagens")+" · "+NUCLEO.inbNaoLidas(ms)+" não lidas":(cont?cont.endereco:"Todas as contas")})));
    if(!INBX.demo&&INBS.publicado&&inboxContasSincronizaveis().length){var sinc=h("button",{type:"button",class:"inb-topo-btn inb-topo-sinc","aria-label":INBX.sinc?"Sincronizando":"Sincronizar",title:"Sincronizar agora"},inboxIco("atualizar"));
      if(INBX.sinc){sinc.setAttribute("disabled","disabled");sinc.setAttribute("aria-busy","true")}sinc.onclick=inboxSincronizar;topo.appendChild(sinc)}
    var novaTopo=h("button",{type:"button",class:"inb-topo-btn inb-so-movel inb-topo-nova","aria-label":"Nova mensagem",title:inboxPodeEnviar()?"Nova mensagem":"Conecte uma conta para escrever"},inboxIco("nova"));novaTopo.onclick=function(){inboxCompor("novo")};if(!inboxPodeEnviar())novaTopo.setAttribute("aria-disabled","true");topo.appendChild(novaTopo);cab.appendChild(topo);
    cab.appendChild(h("div",{class:"inb-busca","aria-disabled":"true",title:INBX_FUTURO},inboxIco("buscar"),h("span",{text:"Buscar mensagens"})));
    cab.appendChild(inboxFiltros());col.appendChild(cab);
    var contaAcoes=inboxContaAcoes();if(contaAcoes&&!INBX.demo)col.appendChild(inboxConexao(contaAcoes));
    if(ms.length){var l=h("div",{class:"inb-linhas",role:"list"});
      NUCLEO.inbAgrupar(ms).forEach(function(g){l.appendChild(h("h3",{class:"inb-data",text:g.rotulo}));g.itens.forEach(function(m){l.appendChild(inboxLinha(m))})});col.appendChild(l)}
    else if(INBX.demo)col.appendChild(inboxVazio("caixa","Nada neste filtro","Nenhuma mensagem de exemplo corresponde a este filtro."));
    else if(!INBX.contas.length)col.appendChild(inboxVazio("caixa","Nenhuma conta cadastrada","Adicione a sua conta do iCloud para começar, ou veja o exemplo da interface."));
    else if(cont&&INBX.cred[cont.id]!=="ativa")col.appendChild(inboxVazio("cadeado","Esta caixa ainda não foi lida","Conecte a conta com a senha específica de app para o RAC poder ler esta caixa. Sem conexão, o RAC não sabe quantas mensagens existem: ela não está vazia, está sem leitura."));
    else if(INBX.msgs.length&&NUCLEO.inbFiltrar(inboxMensagensSemFiltro(),"todas").length)col.appendChild(inboxVazio("caixa","Nada neste filtro","Nenhuma mensagem sincronizada corresponde a este filtro."));
    else{var sy=INBS.publicado&&inboxContasSincronizaveis().length?rkBtn("pri",INBX.sinc?"Sincronizando…":"Sincronizar agora"):null;
      if(sy){sy.onclick=inboxSincronizar;if(INBX.sinc){sy.setAttribute("disabled","disabled");sy.setAttribute("aria-busy","true")}}
      col.appendChild(inboxVazio("caixa","Nenhuma mensagem sincronizada ainda",cont?"Toque em Sincronizar para trazer as mensagens mais recentes. O RAC guarda só o cabeçalho; o texto e os anexos são lidos na hora de abrir.":"Escolha uma conta conectada e sincronize. Nada aqui é exemplo nem simulação.",sy))}
    return col}
  function inboxMensagensSemFiltro(){var f=INBX.filtro;INBX.filtro="todas";var l=inboxMensagens();INBX.filtro=f;return l}
  /* ---- conexão da conta: a credencial no cofre (estado, conectar, substituir, desconectar) ---- */
  function inboxConexao(c){
    var est=INBX.cred[c.id]||"ausente",box=h("div",{class:"inb-conexao"+(est==="invalida"?" inb-conexao--erro":"")}),txt={ausente:"Conecte a conta para o RAC poder ler esta caixa. A senha fica cifrada no cofre do servidor e não volta ao navegador.",
      ativa:"Guardada no cofre do servidor. O navegador não a recebe de volta.",invalida:"O provedor recusou a credencial. Gere uma nova senha de app e substitua."}[est];
    if(est==="ativa"&&INBS.publicado&&!INBX.demo)return inboxConexaoCompacta(c);   /* conectada: só uma linha discreta; as ações raras ficam em "Opções" */
    box.appendChild(h("div",{class:"inb-conexao-cab"},inboxIco("cadeado","inb-conexao-ico"),h("div",{class:"inb-conexao-txt"},h("b",{text:NUCLEO.INB_CRED_ROTULOS[est]||NUCLEO.INB_CRED_ROTULOS.ausente}),h("span",{text:txt})),inboxSelo(c.estado)));
    if(!INBS.publicado){box.appendChild(h("p",{class:"inb-nota",text:"A conexão será liberada quando o serviço de e-mail for publicado. Nada foi pedido nem guardado."}));return box}
    if(INBX.credForm===c.id){box.appendChild(inboxFormCredencial(c));return box}
    var acoes=h("div",{class:"inb-conexao-acoes"}),conectar=rkBtn(est==="ausente"?"pri":"sec",est==="ausente"?"Conectar":"Substituir senha");conectar.onclick=function(){INBX.credForm=c.id;INBX.credErros={};inboxDesenhar()};
    acoes.appendChild(conectar);
    if(est!=="ausente"){var rem=rkBtn("ter","Desconectar e remover a credencial");rem.onclick=function(){inboxRemoverCredencial(c)};acoes.appendChild(rem)}
    box.appendChild(acoes);return box}
  /* conexão em ordem (credencial guardada): UMA linha pequena com a última sincronização e um botão "Opções" que mostra, só quando pedido, testar a conexão, substituir a senha e desconectar. Sincronizar fica no ícone do topo da lista. */
  function inboxConexaoCompacta(c){
    var ent=INBX.pastas.filter(function(p){return p.conta_id===c.id&&p.uso==="entrada"})[0],sy=ent&&INBX.sincs[ent.id],aberto=INBX.opcoes===c.id,box=h("div",{class:"inb-conexao inb-conexao--compacta"}),
      info=NUCLEO.inbFraseSync(sy&&sy.ultima_ok_em);
    if(sy&&sy.erro)info+=" Última tentativa falhou: "+NUCLEO.inbErroTexto(sy.erro);
    var mais=h("button",{type:"button",class:"inb-conexao-mais","aria-label":"Opções da conexão","aria-expanded":aberto?"true":"false",title:"Opções da conexão"},inboxIco("mais"));
    mais.onclick=function(){INBX.opcoes=aberto?null:c.id;inboxDesenhar()};
    box.appendChild(h("div",{class:"inb-conexao-linha"},inboxIco("cadeado","inb-conexao-ico"),h("span",{class:"inb-conexao-info",text:info}),mais));
    /* as duas ações do dia a dia ficam À VISTA (não escondidas em "Opções") */
    var bSinc=rkBtn("sec",INBX.sinc?"Sincronizando…":"Sincronizar"),teste=rkBtn("sec",INBX.testando===c.id?"Testando…":"Testar conexão");
    bSinc.onclick=inboxSincronizar;if(INBX.sinc){bSinc.setAttribute("disabled","disabled");bSinc.setAttribute("aria-busy","true")}
    teste.onclick=function(){inboxTestarConexao(c)};if(INBX.testando){teste.setAttribute("disabled","disabled");teste.setAttribute("aria-busy","true")}
    box.appendChild(h("div",{class:"inb-conexao-botoes"},bSinc,teste));
    if(aberto){
      var op=h("div",{class:"inb-conexao-opcoes",role:"group","aria-label":"Opções da conexão"}),
        subst=h("button",{type:"button",class:"inb-link",text:"Substituir senha"}),rem=h("button",{type:"button",class:"inb-link inb-link--perigo",text:"Desconectar e remover a credencial"});
      subst.onclick=function(){INBX.credForm=c.id;INBX.credErros={};inboxDesenhar()};rem.onclick=function(){inboxRemoverCredencial(c)};
      var bProva=h("button",{type:"button",class:"inb-link",text:INBX.testandoSmtp===c.id?"Testando envio…":"Testar envio (SMTP)"}),bProvaMail=h("button",{type:"button",class:"inb-link",text:"Testar envio com e-mail de teste"});
      bProva.onclick=function(){inboxProvaSmtp(c,false)};bProvaMail.onclick=function(){inboxProvaSmtp(c,true)};if(INBX.testandoSmtp){bProva.setAttribute("disabled","disabled");bProvaMail.setAttribute("disabled","disabled")}
      op.appendChild(bProva);op.appendChild(bProvaMail);op.appendChild(subst);op.appendChild(rem);box.appendChild(op);
      if("sync_auto" in c){   /* só com a 054 aplicada */
        box.appendChild(inboxOpcao(c,"sync_auto","Sincronizar automaticamente a cada 10 minutos (no servidor, com o RAC aberto ou fechado)"));
        box.appendChild(inboxOpcao(c,"notificar","Avisar por notificação quando chegar e-mail novo"));
        box.appendChild(h("p",{class:"inb-nota",text:(sy&&sy.origem==="agenda"?"A última sincronização foi feita pela rotina do servidor. ":"A rotina do servidor ainda não sincronizou esta conta. ")+"O aviso mostra o assunto e o remetente (nunca o texto do e-mail) e abre a mensagem; chega neste aparelho se as notificações estiverem ativadas em Sistema."}))}
      box.appendChild(h("p",{class:"inb-nota",text:"A senha fica cifrada no cofre do servidor e não volta ao navegador."}))}
    if(INBX.credForm===c.id)box.appendChild(inboxFormCredencial(c));
    return box}
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
        if(r.ok){INBX.credForm=null;INBX.credErros={};INBX.aviso={tipo:"ok",t:"Credencial guardada no cofre. Ela não volta ao navegador. Toque em Sincronizar para ler a caixa."};return inboxLer()}
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
    if(INBX.compor)return inboxComposicao();
    var art=h("article",{class:"inb-leitura","aria-label":"Leitura"}),m=INBX.demo?(window.INBOX_DEMO?window.INBOX_DEMO.filter(function(x){return x.id===INBX.msg})[0]:null):(INBX.msg?inboxLinhaPorId(INBX.msg):null);
    var topo=h("div",{class:"inb-leitura-topo"}),v=h("button",{type:"button",class:"inb-voltar"},"Mensagens");v.onclick=function(){INBX.painel="lista";INBX.msg=null;inboxDesenhar()};topo.appendChild(v);
    var acoes=h("div",{class:"inb-acoes",role:"toolbar","aria-label":"Ações da mensagem"});
    var pronta=!INBX.demo&&m&&INBX.leit&&INBX.leit.id===m.id&&INBX.leit.estado==="ok"&&INBX.cred[m.conta_id]==="ativa"&&INBS.publicado;
    [["responder","Responder","responder"],["todos","Responder a todos","responder_todos"],["encaminhar","Encaminhar","encaminhar"]].forEach(function(a){acoes.appendChild(inboxBtnAcao(a[0],a[1],pronta?function(){inboxCompor(a[2],m)}:null))});
    var org=!INBX.demo&&m&&INBX.cred[m.conta_id]==="ativa"&&INBS.publicado?NUCLEO.inbAcoesDisponiveis(m,INBX.pastas,!!INBX.semMover[m.conta_id]):null;   /* I3.2: só mensagem real de conta conectada */
    var bArq=inboxBtnOrg("arquivo","Arquivar",org&&org.arquivar,function(){inboxOrganizar(m,"arquivar")}),bLix=inboxBtnOrg("lixo","Excluir",org&&org.excluir,function(){inboxOrganizar(m,"excluir")}),
      bMais=inboxBtnOrg("mais","Mais",org?{ok:true}:null,function(){INBX.menuMais=INBX.menuMais===m.id?null:m.id;INBX.menuPasta=false;inboxDesenhar()});
    bArq.setAttribute("data-acao","arquivar");bLix.setAttribute("data-acao","excluir");
    if(INBX.acao&&INBX.acao.id===(m&&m.id)){var bb=INBX.acao.acao==="arquivar"?bArq:INBX.acao.acao==="excluir"?bLix:bMais;bb.setAttribute("aria-busy","true")}
    if(org){bMais.setAttribute("aria-haspopup","menu");bMais.setAttribute("aria-expanded",INBX.menuMais===m.id?"true":"false")}
    acoes.appendChild(bArq);acoes.appendChild(bLix);acoes.appendChild(bMais);topo.appendChild(acoes);art.appendChild(topo);
    if(org&&INBX.menuMais===m.id)art.appendChild(inboxMenuMais(m,org));
    if(INBX.acao&&m&&INBX.acao.id===m.id)art.appendChild(h("p",{class:"inb-nota inb-andamento",role:"status","aria-live":"polite",text:"Aguardando a confirmação do iCloud… A lista só muda depois dela."}));
    if(!m){art.appendChild(inboxVazio("caixa","Nenhuma mensagem selecionada","Escolha uma mensagem na lista para ler."));return art}
    var corpo=h("div",{class:"inb-leitura-corpo"});
    corpo.appendChild(h("h2",{class:"inb-leitura-assunto",text:m.assunto}));
    corpo.appendChild(h("div",{class:"inb-de"},h("span",{class:"inb-avatar inb-avatar--g","aria-hidden":"true",text:NUCLEO.inbIniciais(m.remetente)}),h("span",{class:"inb-de-txt"},h("b",{text:m.remetente}),h("span",{class:"inb-de-end",text:m.endereco}),
      h("span",{class:"inb-de-para",text:"Para: "+(m.para||["você"]).join(", ")})),h("span",{class:"inb-de-data",text:NUCLEO.inbDataCompleta(m.recebida)})));
    if(!INBX.demo)corpo.appendChild(inboxCorpoReal(m));
    else corpo.appendChild(h("div",{class:"inb-texto"},m.corpo.map(function(p){return h("p",{text:p})})));
    if(INBX.demo&&m.anexos&&m.anexos.length)corpo.appendChild(h("div",{class:"inb-anexos"},h("span",{class:"inb-grupo",text:m.anexos.length+(m.anexos.length===1?" anexo":" anexos")}),
      m.anexos.map(function(n){return h("span",{class:"inb-arquivo"},h("span",{class:"inb-arquivo-tipo",text:n.tipo}),h("span",{class:"inb-arquivo-txt"},h("b",{text:n.nome}),h("span",{text:n.tam})))})));
    art.appendChild(corpo);return art}
  /* o corpo de uma mensagem REAL: carregando, erro com "tentar de novo" ou o texto (o HTML nunca chega: vem convertido) e os anexos, que só baixam se a pessoa pedir */
  function inboxCorpoReal(m){
    var L=INBX.leit;
    if(!L||L.id!==m.id||L.estado==="carregando")return rkEstado("carregando","Lendo a mensagem…");
    if(L.estado==="erro"){var t=rkBtn("sec","Tentar de novo");t.onclick=function(){INBX.leit={id:m.id,estado:"carregando"};inboxDesenhar();inboxLerMensagem(m)};return rkEstado("erro",NUCLEO.inbErroTexto(L.erro),t)}
    var d=L.dados,saida=h("div",{class:"rac-pilha"}),texto=h("div",{class:"inb-texto"});
    if(d.formato==="html_convertido")saida.appendChild(h("p",{class:"inb-nota",text:"Mensagem em HTML mostrada como texto simples (sem imagens nem formatação)."}));
    if(d.formato==="sem_corpo"||!d.texto.trim())texto.appendChild(h("p",{class:"inb-nota",text:"Esta mensagem não tem texto para mostrar."}));
    else NUCLEO.inbParagrafos(d.texto).forEach(function(p){texto.appendChild(h("p",{text:p}))});
    saida.appendChild(texto);
    if(d.truncado)saida.appendChild(h("p",{class:"inb-nota",text:"Mensagem longa: mostrando só o começo."}));
    if(d.anexos.length){var box=h("div",{class:"inb-anexos"},h("span",{class:"inb-grupo",text:d.anexos.length+(d.anexos.length===1?" anexo":" anexos")}));
      d.anexos.forEach(function(a){var chave=m.id+"|"+a.parte,b=rkBtn("sec",INBX.baixando===chave?"Baixando…":"Baixar");
        if(INBX.baixando)b.setAttribute("disabled","disabled");if(INBX.baixando===chave)b.setAttribute("aria-busy","true");
        b.onclick=function(){inboxBaixarAnexo(m,a)};
        box.appendChild(h("span",{class:"inb-arquivo"},h("span",{class:"inb-arquivo-tipo",text:inboxExt(a)}),h("span",{class:"inb-arquivo-txt"},h("b",{text:a.nome||"(sem nome)"}),h("span",{text:inboxTamanho(a.tamanho)+" · "+a.tipo})),b))});
      saida.appendChild(box)}
    return saida}
  /* ---- I3: escrever, responder, responder a todos e encaminhar (docs/inbox.md, "Envio"). O rascunho vive SÓ na memória desta tela: nada é guardado no navegador nem no servidor até o envio.
     O e-mail só sai com um toque explícito em "Enviar", na revisão (destinatários e assunto à vista). O resultado tem três faces, nunca misturadas: enviado e confirmado, falha confirmada e incerto. ---- */
  function inboxNovoId(){
    var c=window.crypto;if(c&&typeof c.randomUUID==="function")return c.randomUUID();
    var b=[],i;for(i=0;i<16;i++)b.push(c&&c.getRandomValues?c.getRandomValues(new Uint8Array(1))[0]:Math.floor(Math.random()*256));
    b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;var s=b.map(function(x){return (x+256).toString(16).slice(1)});
    return s.slice(0,4).join("")+"-"+s.slice(4,6).join("")+"-"+s.slice(6,8).join("")+"-"+s.slice(8,10).join("")+"-"+s.slice(10).join("")}
  function inboxContaDeEnvio(){var a=inboxContaAtual();if(a&&INBX.cred[a.id]==="ativa")return a;return INBX.contas.filter(function(c){return INBX.cred[c.id]==="ativa"})[0]||null}
  function inboxPodeEnviar(){return !INBX.demo&&INBS.publicado&&!!inboxContaDeEnvio()}
  /* quem escreve: "novo" (conta atual) ou uma resposta/encaminhamento da mensagem aberta (já lida, para citar o texto) */
  function inboxCompor(modo,m){
    var C=INBX.compor;if(C&&(C.etapa==="enviando"||C.etapa==="resultado")){INBX.painel="leitura";inboxDesenhar();return}
    if(INBX.demo){INBX.aviso={tipo:"aviso",t:"No exemplo não há envio. Conecte uma conta real para escrever."};inboxDesenhar();return}
    var conta=modo==="novo"?inboxContaDeEnvio():INBX.contas.filter(function(c){return m&&c.id===m.conta_id&&INBX.cred[c.id]==="ativa"})[0];
    if(!conta){INBX.aviso={tipo:"aviso",t:"Conecte uma conta (senha específica de app) para escrever e enviar e-mails."};inboxDesenhar();return}
    var r={modo:"novo",para:[],cc:[],cco:[],assunto:"",texto:"",avisos:[]},origem=null;
    if(modo!=="novo"){
      var L=INBX.leit;if(!m||!L||L.id!==m.id||L.estado!=="ok")return;
      var d=L.dados,orig={de:d.de||(m.endereco?{nome:m.remetente,endereco:m.endereco}:null),para:d.para,cc:d.cc,assunto:m.assunto,recebida:d.recebida||m.recebida,texto:d.texto,truncado:d.truncado,anexos:d.anexos};
      r=NUCLEO.inbMontarRascunho(modo,orig,conta.endereco);origem={pasta_id:m.pasta_id,uid:m.uid}}
    INBX.compor={modo:modo,conta_id:conta.id,origem:origem,de:conta.endereco,para:r.para.join(", "),cc:r.cc.join(", "),cco:"",assunto:r.assunto,texto:r.texto,avisos:r.avisos,inicial:r.texto,mostrarCc:r.cc.length>0,
      etapa:"editar",envioId:inboxNovoId(),erros:{},entrada:null,resultado:null,classe:null};
    INBX.painel="leitura";INBX.aviso=null;inboxDesenhar();
    setTimeout(function(){var el=document.getElementById(modo==="novo"||modo==="encaminhar"?"inb-c-para":"inb-c-texto");if(el&&typeof el.focus==="function"){el.focus();if(el.setSelectionRange&&el.id==="inb-c-texto")el.setSelectionRange(0,0)}},30)}
  function inboxDescartarCompor(){
    var C=INBX.compor;if(!C)return true;
    if(C.etapa==="enviando")return false;
    if(C.etapa!=="resultado"&&(C.para.trim()||C.assunto.trim()||C.texto!==C.inicial)&&!window.confirm("Descartar esta mensagem? O que foi escrito será perdido."))return false;
    INBX.compor=null;return true}
  function inboxRevisar(){
    var C=INBX.compor;if(!C)return;
    var v=NUCLEO.inbValidarRascunho({modo:C.modo,para:C.para,cc:C.cc,cco:C.cco,assunto:C.assunto,texto:C.texto,origem:C.origem});
    if(!v.ok){C.erros=v.erros;C.etapa="editar";inboxDesenhar();return}
    C.erros={};C.entrada=v.entrada;C.etapa="revisar";inboxDesenhar()}
  function inboxEnviar(){
    var C=INBX.compor;if(!C||C.etapa!=="revisar"&&C.etapa!=="resultado"||!C.entrada)return;
    var ped={conta_id:C.conta_id,envio_id:C.envioId},k;for(k in C.entrada)if(Object.prototype.hasOwnProperty.call(C.entrada,k))ped[k]=C.entrada[k];
    C.etapa="enviando";C.resultado=null;C.classe=null;inboxDesenhar();
    inboxChamar("enviar_mensagem",ped).then(function(r){
      C.resultado=r;C.classe=NUCLEO.inbClasseEnvio(r);C.etapa="resultado";
      if(INBX.compor===C)inboxDesenhar();
      if(r.ok)inboxLer().then(function(){if(INBX.compor===C||!INBX.compor)inboxDesenhar()})})}   /* o servidor já atualizou o cache da pasta Enviados; recarrega para a lista refletir (depois de mostrar o resultado) */
  /* "incerto": o dono confere Enviados; só um NOVO envio_id (decisão explícita) permite enviar de novo */
  function inboxEnviarDeNovo(){var C=INBX.compor;if(!C)return;C.envioId=inboxNovoId();C.etapa="revisar";C.resultado=null;C.classe=null;inboxDesenhar()}
  function inboxConferirEnviados(){
    var C=INBX.compor,conta=C&&INBX.contas.filter(function(c){return c.id===C.conta_id})[0];if(!conta)return;
    INBX.sinc=conta.id;inboxDesenhar();
    var env=INBX.pastas.filter(function(p){return p.conta_id===conta.id&&p.uso==="enviados"})[0];
    (env?inboxChamar("sincronizar_pasta",{conta_id:conta.id,pasta_id:env.id}):Promise.resolve({ok:false,erro:"pasta_inexistente"})).then(function(r){
      INBX.sinc=null;INBX.aviso=r.ok?{tipo:"ok",t:"Pasta Enviados atualizada. Abra Enviados e confira se a mensagem está lá antes de decidir enviar de novo."}:{tipo:"aviso",t:"Não consegui atualizar Enviados agora ("+NUCLEO.inbErroTexto(r.erro)+")."};
      return inboxLer()}).then(function(){INBX.compor=null;INBX.painel="lista";inboxDesenhar()})}
  function inboxCampoCompor(rotulo,id,campo,opc){
    opc=opc||{};var C=INBX.compor,erro=C.erros[campo],ajId=id+"-aj",el=opc.area?h("textarea",{class:"rac-campo-entrada inb-c-area",id:id,rows:opc.linhas||12,"aria-describedby":erro?ajId:null,"aria-invalid":erro?"true":null,enterkeyhint:"enter"}):
      h("input",{class:"rac-campo-entrada",id:id,type:"text",inputmode:opc.email?"email":"text",autocapitalize:opc.email?"none":"sentences",autocomplete:"off",autocorrect:opc.email?"off":"on",spellcheck:opc.email?"false":"true",enterkeyhint:"next","aria-describedby":erro?ajId:null,"aria-invalid":erro?"true":null});
    el.value=C[campo];el.oninput=function(){C[campo]=el.value};
    return h("div",{class:"rac-campo"+(erro?" rac-campo--erro":"")},h("label",{class:"rac-campo-rotulo","for":id,text:rotulo}),el,erro||opc.ajuda?h("span",{class:"rac-campo-ajuda",id:ajId,text:(erro?"✗ ":"")+(erro||opc.ajuda)}):null)}
  var INBC_TITULO={novo:"Nova mensagem",responder:"Responder",responder_todos:"Responder a todos",encaminhar:"Encaminhar"};
  function inboxComposicao(){
    var C=INBX.compor,art=h("article",{class:"inb-leitura inb-compor","aria-label":INBC_TITULO[C.modo]}),topo=h("div",{class:"inb-leitura-topo"}),v=h("button",{type:"button",class:"inb-voltar",text:C.etapa==="resultado"?"Mensagens":"Cancelar"});
    v.onclick=function(){if(C.etapa==="resultado"&&C.classe!=="falha"&&C.classe!=="confirmar"){INBX.compor=null;INBX.painel="lista";inboxDesenhar();return}if(inboxDescartarCompor()){INBX.painel="lista";inboxDesenhar()}};
    if(C.etapa==="enviando")v.setAttribute("disabled","disabled");
    topo.appendChild(v);topo.appendChild(h("b",{class:"inb-compor-tit",text:INBC_TITULO[C.modo]}));art.appendChild(topo);
    var corpo=h("div",{class:"inb-leitura-corpo inb-compor-corpo"});art.appendChild(corpo);
    if(C.etapa==="enviando"){corpo.appendChild(rkEstado("carregando","Enviando… Não feche esta tela. O RAC só dirá “enviado” depois que o servidor do iCloud confirmar."));return art}
    if(C.etapa==="resultado"){inboxResultadoEnvio(C,corpo);return art}
    if(C.etapa==="revisar"){
      var e=C.entrada,linhas=h("dl",{class:"inb-rev"});
      [["De",C.de],["Para",e.para.join(", ")],e.cc.length?["Cc",e.cc.join(", ")]:null,e.cco.length?["Cco",e.cco.join(", ")+" (oculto para os demais)"]:null,["Assunto",e.assunto||"(sem assunto)"]].forEach(function(p){if(p){linhas.appendChild(h("dt",{text:p[0]}));linhas.appendChild(h("dd",{text:p[1]}))}});
      corpo.appendChild(rkCard("Confira antes de enviar",h("div",{class:"rac-pilha"},linhas,h("pre",{class:"inb-rev-texto",text:e.texto.length>800?e.texto.slice(0,800)+"\n[… "+(e.texto.length-800)+" caracteres a mais]":e.texto||"(sem texto)"}),
        h("p",{class:"inb-nota",text:"Esta mensagem sai para "+(NUCLEO.inbValidarRascunho({modo:C.modo,para:e.para.join(","),cc:e.cc.join(","),cco:e.cco.join(","),assunto:e.assunto||"x",texto:e.texto||"x",origem:C.origem}).total||0)+" destinatário(s) e não pode ser desfeita. Só sai quando você tocar em Enviar."}))));
      var env=rkBtn("pri","Enviar"),volta=rkBtn("sec","Voltar e editar");env.onclick=inboxEnviar;volta.onclick=function(){C.etapa="editar";inboxDesenhar()};
      corpo.appendChild(h("div",{class:"inb-compor-acoes"},volta,env));return art}
    /* editar */
    C.avisos.forEach(function(a){corpo.appendChild(rkAlerta("aviso","Atenção",a))});
    if(C.erros.geral)corpo.appendChild(rkAlerta("erro","Confira a mensagem",C.erros.geral));
    corpo.appendChild(h("p",{class:"inb-compor-de"},h("span",{text:"De"}),h("b",{text:C.de})));
    corpo.appendChild(inboxCampoCompor("Para","inb-c-para","para",{email:true,ajuda:"Separe vários endereços por vírgula."}));
    if(C.mostrarCc||C.erros.cc||C.erros.cco){corpo.appendChild(inboxCampoCompor("Cc","inb-c-cc","cc",{email:true}));corpo.appendChild(inboxCampoCompor("Cco (cópia oculta)","inb-c-cco","cco",{email:true,ajuda:"Os endereços em Cco não aparecem para os outros destinatários."}))}
    else{var cc=h("button",{type:"button",class:"inb-link",text:"Adicionar Cc/Cco"});cc.onclick=function(){C.mostrarCc=true;inboxDesenhar()};corpo.appendChild(cc)}
    corpo.appendChild(inboxCampoCompor("Assunto","inb-c-assunto","assunto"));
    corpo.appendChild(inboxCampoCompor("Mensagem","inb-c-texto","texto",{area:true,linhas:12,ajuda:"Texto simples (sem formatação). Anexos ainda não são enviados nesta etapa."}));
    var rev=rkBtn("pri","Revisar e enviar"),des=rkBtn("ter","Descartar");rev.onclick=inboxRevisar;des.onclick=function(){if(inboxDescartarCompor()){INBX.painel="lista";inboxDesenhar()}};
    corpo.appendChild(h("div",{class:"inb-compor-acoes"},des,rev));return art}
  function inboxResultadoEnvio(C,corpo){
    var r=C.resultado||{},c=C.classe,bt=function(t,tipo,fn){var b=rkBtn(tipo,t);b.onclick=fn;return b};
    if(c==="enviado"){
      corpo.appendChild(rkAlerta("ok",r.repetido?"Este envio já tinha sido concluído":"Enviado e confirmado pelo servidor",
        (r.repetido?"O servidor reconheceu este envio e não enviou de novo. ":"O servidor de envio do iCloud aceitou a mensagem. ")+(r.enviados==="atualizada"?"A pasta Enviados foi atualizada.":"A pasta Enviados ainda não foi atualizada; use Sincronizar. ")+" A entrega na caixa de quem recebe depende do provedor dele."));
      corpo.appendChild(h("div",{class:"inb-compor-acoes"},bt("Concluir","pri",function(){INBX.compor=null;INBX.painel="lista";inboxDesenhar()})));return}
    if(c==="incerto"){
      corpo.appendChild(rkAlerta("aviso","Resultado incerto",NUCLEO.inbErroTexto("envio_incerto")));
      corpo.appendChild(h("div",{class:"inb-compor-acoes inb-compor-acoes--col"},bt("Atualizar Enviados e conferir","pri",inboxConferirEnviados),bt("Não chegou: enviar de novo","sec",inboxEnviarDeNovo),bt("Concluir sem enviar de novo","ter",function(){INBX.compor=null;INBX.painel="lista";inboxDesenhar()})));return}
    if(c==="confirmar"){
      corpo.appendChild(rkAlerta("aviso","Não consegui confirmar o resultado","A resposta do servidor não chegou ("+NUCLEO.inbErroTexto(r.erro)+") e o e-mail pode ou não ter sido enviado. Toque em Confirmar: o RAC pergunta ao servidor o que aconteceu com ESTE envio e nunca envia duas vezes."));
      corpo.appendChild(h("div",{class:"inb-compor-acoes inb-compor-acoes--col"},bt("Confirmar resultado","pri",inboxEnviar),bt("Voltar e editar","sec",function(){C.etapa="editar";C.resultado=null;C.classe=null;inboxDesenhar()})));return}
    corpo.appendChild(rkAlerta("erro","Não foi enviado",NUCLEO.inbErroTexto(r.erro)+" Seu texto foi mantido."));
    corpo.appendChild(h("div",{class:"inb-compor-acoes"},bt("Descartar","ter",function(){INBX.compor=null;INBX.painel="lista";inboxDesenhar()}),bt("Voltar e editar","pri",function(){C.etapa="editar";C.resultado=null;C.classe=null;inboxDesenhar()})))}
  /* prova de viabilidade do SMTP (opções da conexão): relata etapa por etapa. "Com e-mail de teste" manda UMA mensagem curta ao próprio endereço, só depois de confirmar. */
  function inboxProvaSmtp(c,comEmail){
    if(INBX.testandoSmtp||!INBS.publicado)return;
    if(comEmail&&!window.confirm("Enviar UM e-mail de teste de "+c.endereco+" para ele mesmo? É o único jeito de provar o envio de ponta a ponta."))return;
    INBX.testandoSmtp=c.id;INBX.aviso=null;inboxDesenhar();
    inboxChamar("smtp_prova",comEmail?{conta_id:c.id,enviar_teste:true}:{conta_id:c.id}).then(function(r){
      INBX.testandoSmtp=null;
      if(!r.ok)INBX.aviso={tipo:"erro",t:"A prova de envio não rodou: "+NUCLEO.inbErroTexto(r.erro)};
      else{var seq=r.etapas.map(function(e){return e.rotulo+(e.codigo?" ("+e.codigo+")":"")+" "+(e.ok?"✓":"✗")+" "+e.ms+" ms"}).join(" · ");
        INBX.aviso=r.aprovada?{tipo:"ok",t:"Prova de envio aprovada em "+r.total_ms+" ms. "+seq+(r.teste==="enviado"?" · E-mail de teste aceito pelo servidor: confira se ele chegou à caixa.":" · Nenhum e-mail foi enviado.")}:
          {tipo:"erro",t:"Prova de envio reprovada na etapa “"+(NUCLEO.INB_ETAPAS_PROVA[r.etapa_falha]||r.etapa_falha)+"” ("+r.erro+")"+(r.teste==="incerto"?"; o e-mail de teste ficou incerto, confira a caixa. ":". ")+seq}}
      inboxDesenhar()})}
  /* Abrir/fechar o formulário "Adicionar conta". O botão mora na lateral, que no celular é uma camada FIXA em tela cheia (painel "caixas"); o formulário é desenhado na página, por baixo dela.
     Por isso abrir o formulário FECHA a camada (painel "lista"): sem isso o formulário existia no DOM mas ficava coberto (causa do "botão não abre" no iPhone). Depois rola até ele. */
  function inboxAlternarForm(){
    var abrir=!INBX.form;INBX.form=abrir;INBX.aviso=null;INBX.painel="lista";inboxDesenhar();
    if(abrir)setTimeout(inboxRolarAoForm,30)}
  function inboxRolarAoForm(){var el=document.getElementById("inb-form-conta");if(el&&el.scrollIntoView)el.scrollIntoView({block:"start",behavior:"auto"})}
  function inboxFecharForm(){INBX.form=false;INBX.erros={};INBX.aviso=null;inboxDesenhar()}
  /* campo do formulário que guarda o que foi digitado em INBX.valores a cada tecla: uma nova renderização (sincronização, aviso, troca de painel) nunca apaga o que a pessoa escreveu */
  function inboxCampoConta(rotulo,id,campo,opc){
    var V=INBX.valores,erro=INBX.erros[campo],ajId=id+"-aj",inp=h("input",{class:"rac-campo-entrada",id:id,type:"text",inputmode:opc.email?"email":"text",autocapitalize:opc.email?"none":"words",autocomplete:"off",autocorrect:"off",spellcheck:"false","aria-describedby":opc.ajuda||erro?ajId:null,"aria-invalid":erro?"true":null});
    inp.value=V[campo]||"";inp.oninput=function(){INBX.valores[campo]=inp.value};
    return h("div",{class:"rac-campo"+(erro?" rac-campo--erro":"")},h("label",{class:"rac-campo-rotulo","for":id,text:rotulo}),inp,erro||opc.ajuda?h("span",{class:"rac-campo-ajuda",id:ajId,text:(erro?"✗ ":"")+(erro||opc.ajuda)}):null)}
  /* ---- adicionar conta: só provedor, apelido e endereço (a credencial é um passo à parte, na conta) ---- */
  function inboxForm(){
    var V=INBX.valores,E=INBX.erros,sel=h("select",{class:"rac-campo-entrada",id:"inb-prov","aria-label":"Provedor"});
    NUCLEO.INB_PROVEDORES.forEach(function(p){var o=h("option",{value:p.id,text:p.nome+(p.ativo?"":" (fase futura)")});if(!p.ativo)o.setAttribute("disabled","disabled");if(V.provedor===p.id)o.setAttribute("selected","selected");sel.appendChild(o)});
    sel.onchange=function(){INBX.valores.provedor=sel.value};
    var ap=inboxCampoConta("Nome da conta","inb-apelido","apelido",{ajuda:"Como você quer ver esta caixa (ex.: Pessoal)."}),en=inboxCampoConta("Endereço de e-mail","inb-endereco","endereco",{email:true});
    var salvar=rkBtn("pri","Cadastrar conta"),cancelar=rkBtn("ter","Cancelar");cancelar.onclick=inboxFecharForm;
    salvar.onclick=function(){
      INBX.valores={provedor:sel.value,apelido:document.getElementById("inb-apelido").value,endereco:document.getElementById("inb-endereco").value};   /* (relê dos campos: cobre o preenchimento automático do navegador, que não dispara tecla) */
      var v=NUCLEO.inbContaValida(INBX.valores);INBX.erros=v.ok?{}:v.erros;
      if(!v.ok){inboxDesenhar();return}
      salvar.setAttribute("disabled","disabled");salvar.setAttribute("aria-busy","true");
      Promise.resolve(SB.from("inbox_contas").insert(v.linha).select("*")).then(sbOk).then(function(){INBX.form=false;INBX.valores={provedor:"icloud",apelido:"",endereco:""};INBX.aviso={tipo:"ok",t:"Conta cadastrada. Conecte-a com a senha específica de app para poder sincronizar."};return inboxLer()},
        function(e){INBX.erros={endereco:e&&e.code==="23505"?"Esta conta já está cadastrada.":NUCLEO.segTabelaAusente(e&&(e.message||e.code))?"A estrutura do Inbox ainda não existe no banco (migration 051 pendente).":"Não consegui cadastrar agora."}}).then(inboxDesenhar)};
    /* "Cancelar" só existe quando há contas (sem nenhuma, o formulário é o próprio estado vazio e não se fecha) */
    return h("div",{id:"inb-form-conta"},rkCard("Adicionar conta",h("div",{class:"rac-pilha"},h("div",{class:"rac-campo"},h("label",{class:"rac-campo-rotulo","for":"inb-prov",text:"Provedor"}),sel,E.provedor?h("span",{class:"rac-campo-ajuda",text:"✗ "+E.provedor}):null),ap,en,
      rkInfo("i","Sem senha neste formulário","Aqui só se cadastra a conta. A credencial (senha específica de app) é um passo à parte, dentro da conta, e vai direto para o cofre do servidor."),h("div",{class:"inb-form-acoes"},INBX.contas.length?cancelar:null,salvar))))}
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
  function inboxCarregar(){if(!isOwner()){INBX.carregando=false;inboxDesenhar();return Promise.resolve()}   /* a casa (Fernanda) não vê o Inbox: nem consulta as tabelas */
    INBX.carregando=true;inboxDesenhar();return inboxLer().then(inboxDesenhar)}
  /* #inbox/<conta>/<pasta>/<mensagem>: o aviso de e-mail novo (Web Push) abre direto a leitura da mensagem. O id é o da linha de inbox_mensagens_ref (estável); assunto e remetente nunca identificam.
     Depois de abrir, o endereço volta a #inbox/<conta>/<pasta> (sem disparar a rota), para uma nova rota ou um recarregamento não reabrirem a mensagem. */
  var INB_RE_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  var INB_CAMPOS_MSG="id,conta_id,pasta_id,uid,uidvalidity,recebida_em,assunto,remetente_nome,remetente_endereco,destinatarios,lida,sinalizada,respondida,tamanho,anexo_provavel";
  function inboxAvisoResultado(ok,motivo){try{if(typeof notifAbriu==="function")notifAbriu(ok,motivo)}catch(e){}}
  function inboxAbrirDoAviso(id){
    var r=INBX.msgs.filter(function(x){return x.id===id})[0],busca=r?Promise.resolve(r):Promise.resolve(SB.from("inbox_mensagens_ref").select(INB_CAMPOS_MSG).eq("id",id).limit(1)).then(sbOk).then(function(l){return l&&l[0]||null},function(){return null});
    return busca.then(function(m){
      if(!m||!m.pasta_id){INBX.aviso={tipo:"erro",t:"Essa mensagem do aviso não está mais no cache. Toque em Sincronizar para atualizar a lista."};inboxDesenhar();inboxAvisoResultado(false,"mensagem_ausente");return false}
      if(!r)INBX.msgs.push(m);
      INBX.conta=m.conta_id;INBX.pasta=m.pasta_id;try{history.replaceState(history.state,"","#inbox/"+m.conta_id+"/"+m.pasta_id)}catch(e){}
      inboxAbrirMsg(m.id);inboxAvisoResultado(INBX.msg===m.id,INBX.msg===m.id?null:"rascunho_aberto");return true})}
  /* refresh = a atualização automática (ao voltar ao site) redesenha a MESMA rota: só relê os dados; nunca fecha a leitura aberta nem o rascunho. Sem isso, a atualização da página que estava aberta
     (o Início) rodava a rota do aviso por cima e a leitura recém-aberta voltava para a lista. */
  function renderInbox(conta,pasta,msg,refresh){
    var abrir=INB_RE_ID.test(msg||"")?msg:null;
    if(refresh){if(conta&&!INBX.msg){INBX.conta=conta;INBX.pasta=pasta||null}return inboxCarregar().then(function(){if(abrir&&INBX.msg!==abrir&&isOwner()&&!INBX.demo)return inboxAbrirDoAviso(abrir)})}
    INBX.form=false;INBX.painel="lista";INBX.msg=null;INBX.leit=null;INBX.credForm=null;INBX.credErros={};   /* entrar no Inbox de novo começa sem formulário aberto */
    if(conta){INBX.conta=conta;INBX.pasta=pasta||null}
    return inboxCarregar().then(function(){if(abrir&&isOwner()&&!INBX.demo)return inboxAbrirDoAviso(abrir)})}
