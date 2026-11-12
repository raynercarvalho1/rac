/* Dia a Dia RAC — módulo carregado quando a seção abre. Central de Segurança: proteção da conta, verificação em duas etapas (TOTP),
   backup em JSON, histórico, restauração com prévia e confirmação, auditoria das permissões e como recuperar o acesso (docs/seguranca.md).
   Usa as funções globais de js/app.js e o zip/backup de js/sistema.js. Nada é gravado sem o clique de confirmação. */
  var SEG={fatores:[],pendentes:[],passkeys:null,pkErro:null,aal:null,estado:null,semSql:false,eventos:null,servidor:null};
  function segShaBytes(u8){return crypto.subtle.digest("SHA-256",u8).then(function(b){return Array.prototype.map.call(new Uint8Array(b),function(x){return ("0"+x.toString(16)).slice(-2)}).join("")})}
  /* só os anexos da Central Fiscal (caminho com a pasta notas-fiscais): tamanho e SHA-256 do arquivo do pacote, para o plano conferir cada documento antes de gravar */
  function segAnexosFiscais(anexos){var m={};
    return (anexos||[]).reduce(function(p,a){return p.then(function(){var orig=String(a.nome).slice(7);if(orig.split("/")[1]!=="notas-fiscais")return;
      return segShaBytes(a.dados).then(function(x){m[orig]={tamanho:a.dados.length,sha256:x}})})},Promise.resolve()).then(function(){return m})}
  function segSha(txt){return crypto.subtle.digest("SHA-256",new TextEncoder().encode(txt)).then(function(b){return Array.prototype.map.call(new Uint8Array(b),function(x){return ("0"+x.toString(16)).slice(-2)}).join("")})}
  function segDias(iso){return iso?Math.floor((Date.now()-Date.parse(String(iso).slice(0,10)+"T12:00:00"))/864e5):null}
  function segN(n,um,varios){return n+" "+(n===1?um:varios)}
  function segQuando(iso){return new Date(iso).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})}
  /* registro no histórico de segurança (022). Antes do 022 a tabela não existe: o resto continua igual */
  function segEvento(tipo,resumo){return Promise.resolve().then(function(){return SB.from("seguranca_eventos").insert({tipo:tipo,resumo:resumo||{}})}).then(function(){},function(){})}
  function segCarregar(){return segLerTudo().then(segAplicar)}
  /* só lê (não mexe em SEG): cada fonte vem como {ok, v} ou {ok:false, erro} */
  function segLerTudo(){
    var L=[["fatores",function(){return SB.auth.mfa.listFactors()}],["passkeys",function(){return SB.auth.passkey.list()}],["aal",function(){return SB.auth.mfa.getAuthenticatorAssuranceLevel()}],
      ["estado",function(){return SB.rpc("seguranca_estado")}]];
    if(isOwner())L.push(["eventos",function(){return SB.from("seguranca_eventos").select("id,quando,tipo,resumo").order("quando",{ascending:false}).limit(40)}],
      ["servidor",function(){return SB.storage.from("backups").list(EU.id,{sortBy:{column:"name",order:"desc"}})}]);
    return Promise.all(L.map(function(x){return atuLer(x[1])})).then(function(r){var o={};L.forEach(function(x,i){o[x[0]]=r[i]});return o})}
  /* para o botão de atualizar, a fonte só está boa se respondeu sem erro */
  function segFontes(o){var f={};Object.keys(o).forEach(function(k){var r=o[k];f[k]={ok:r.ok&&!(r.v&&r.v.error),erro:r.erro||(r.v&&r.v.error&&r.v.error.message)}});return f}
  /* o que cada fonte deixa em SEG (como sempre foi: o que falha vira vazio ou "falta o SQL") */
  function segAplicar(o){var r;
    r=o.fatores;if(r.ok){var d=(r.v&&r.v.data)||{},todos=d.all||d.totp||[];SEG.fatores=todos.filter(function(f){return f.factor_type==="totp"&&f.status==="verified"});SEG.pendentes=todos.filter(function(f){return f.status!=="verified"})}else SEG.fatores=[];
    r=o.passkeys;if(r.ok){SEG.pkErro=r.v.error||null;SEG.passkeys=r.v.error?null:r.v.data||[]}else{SEG.pkErro=new Error(r.erro);SEG.passkeys=null}
    r=o.aal;if(r.ok)SEG.aal=r.v&&r.v.data?r.v.data.currentLevel:null;
    r=o.estado;if(r.ok){SEG.semSql=!!r.v.error;SEG.estado=r.v.error?null:r.v.data}else{SEG.semSql=true;SEG.estado=null}
    if(o.eventos){r=o.eventos;SEG.eventos=r.ok&&!r.v.error?r.v.data||[]:null}
    if(o.servidor){r=o.servidor;SEG.servidor=r.ok&&!r.v.error?(r.v.data||[]).filter(function(f){return /\.json$/.test(f.name)}):null}
    SEG.fontes=segFontes(o)}
  /* botão de atualizar: proteção, Face ID, código, histórico e backups do servidor de novo; troca só se nenhuma fonte que respondia
     passou a falhar. Uma prévia de restauração aberta, um backup ou uma restauração em andamento fazem o ↻ esperar */
  atuModulo("seguranca",{
    buscar:segLerTudo,
    fontes:segFontes,
    antes:function(){return NUCLEO.atuEstado(SEG.fontes)},
    trocar:segAplicar,
    ocupado:function(){var a=SEG.areaRestaurar;return a&&a.isConnected&&a.querySelector("button.segdesc:not(:disabled)")?"a prévia da restauração (grave ou descarte antes)":""}});
  function renderSeguranca(sub){
    var root=$("#seguranca-view");root.innerHTML="";root.appendChild(loading());
    /* pelo ↻ as leituras já chegaram novas (SEG): desenha com elas, sem ler de novo */
    (ATU.rodando&&SEG.fontes?Promise.resolve():segCarregar()).then(function(){root.innerHTML="";
      root.appendChild(segProtecao());root.appendChild(segPasskeys());root.appendChild(segMfa());
      if(isOwner()){root.appendChild(segBackupPainel());var pr=segRestaurarPainel();root.appendChild(pr);root.appendChild(segHistorico());root.appendChild(segAuditoria());
        if(sub==="restaurar")setTimeout(function(){pr.scrollIntoView({behavior:"smooth",block:"start"})},80)}
      root.appendChild(segRecuperacao())})
    .catch(function(e){root.innerHTML="";root.appendChild(failed(function(){renderSeguranca(sub)},e));logErro("segurança",e)})}
  /* problemas da auditoria de dentro do banco (vazio = tudo certo) */
  function segProblemasBanco(e){if(!e)return null;var p=[];
    if((e.sem_rls||[]).length)p.push("sem RLS: "+e.sem_rls.join(", "));
    if((e.anon_le||[]).length)p.push("o visitante sem login lê: "+e.anon_le.join(", "));
    if((e.sem_trava_mfa||[]).length)p.push("sem a trava da 2ª etapa: "+e.sem_trava_mfa.join(", "));
    if((e.cofres_publicos||[]).length)p.push("cofre de arquivos público: "+e.cofres_publicos.join(", "));
    if((e.funcoes_abertas||[]).length)p.push("função do servidor aberta a quem não entrou: "+e.funcoes_abertas.join(", "));
    return p}

  /* ---------- 1. estado da proteção ---------- */
  function segProtecao(){
    var casa=!isOwner(),ult=SEG.servidor&&SEG.servidor[0]?SEG.servidor[0].name.slice(0,10):null,pb=segProblemasBanco(SEG.estado);
    var c={senha:true,mfa:SEG.fatores.length>0,reserva:SEG.fatores.length>1,bancoMfa:!!SEG.estado&&!(SEG.estado.sem_trava_mfa||[]).length,
      diasBackup:casa?0:segDias(PESSOAL.ultimoBackup),diasServidor:casa?0:segDias(ult),auditoria:casa?true:!!(pb&&!pb.length)},n=NUCLEO.segNota(c);
    var p=panel("Proteção da conta",casa?"A sua conta na casa. O backup dos dados da casa é feito pelo dono.":"Quanto a conta e os dados estão protegidos hoje. O que falta se resolve nos quadros abaixo."),
      cls=n.nivel==="forte"?"forte":n.nivel==="média"?"media":"fraca";
    p.appendChild(h("div",{class:"segnota "+cls},h("b",{class:"n",text:String(n.nota)}),h("div",{class:"grow"},h("b",{text:"Proteção "+n.nivel}),h("div",{class:"sub",text:"de 100 pontos · "+EU.email})),h("div",{class:"barra"},h("i",{style:"width:"+n.nota+"%"}))));
    var ul=h("ul",{class:"wl sissaude"});p.appendChild(ul);
    function li(ok,rot,txt,aviso){ul.appendChild(h("li",{class:ok?null:"alerta"},h("span",{class:"sisdot",text:ok?"✓":aviso?"⚠":"✗"}),h("span",{class:"grow"},h("b",{text:rot}),h("span",{class:"sub",text:txt}))))}
    li(true,"Senha","Entrada com e-mail e senha; sem senha nenhum dado é lido (RLS em todas as tabelas).");
    /* o Face ID facilita a entrada, mas não fecha a porta da senha: fica fora da nota */
    var npk=(SEG.passkeys||[]).length;
    li(npk>0,"Entrar com Face ID",npk?segN(npk,"passkey cadastrada","passkeys cadastradas")+". A senha continua valendo como alternativa.":SEG.passkeys?"Nenhuma passkey ainda: cadastre o Face ID abaixo.":"Ainda não disponível (veja o quadro Entrar com Face ID).",true);
    li(c.mfa,"Verificação em duas etapas",c.mfa?SEG.fatores.length+(SEG.fatores.length===1?" app autenticador cadastrado":" apps autenticadores cadastrados")+(SEG.aal==="aal2"?" · esta sessão passou pelo código":""):"Desligada: quem souber a senha entra. Ative abaixo (é opcional).",!c.mfa);
    if(c.mfa)li(c.reserva,"App reserva",c.reserva?"Há um segundo app para entrar se perder o celular.":"Só um app: se perder o celular, só o dono do site libera a conta. Cadastre um reserva.",true);
    li(c.bancoMfa,"Banco exige a 2ª etapa",SEG.semSql?"Falta rodar o supabase/022_seguranca.sql: hoje o código é pedido pelo site, mas o banco ainda aceita só a senha.":c.bancoMfa?"Com um app cadastrado, o banco recusa a sessão que não passou pelo código.":"Algumas tabelas estão sem a trava: veja a Auditoria.",true);
    if(!casa){
      li(c.diasBackup!=null&&c.diasBackup<=30,"Backup baixado",PESSOAL.ultimoBackup?"O último foi em "+dataBR(PESSOAL.ultimoBackup)+(c.diasBackup>30?": baixe um novo (o ideal é todo mês)":""):"Nunca: baixe um e guarde fora do site (Google Drive, pendrive).",true);
      li(c.diasServidor!=null&&c.diasServidor<=9,"Backup automático",ult?"O último no servidor é de "+dataBR(ult)+(c.diasServidor>9?": a rotina de domingo parou":"")+" ("+SEG.servidor.length+" guardados)":"Nenhum no servidor ainda (sai todo domingo com a rotina).",true);
      li(c.auditoria,"Auditoria das permissões",!pb?"Falta rodar o 022 para conferir de dentro do banco.":pb.length?pb.length+(pb.length===1?" ponto para corrigir":" pontos para corrigir")+" (veja a Auditoria).":"Nada aberto além do necessário (conferido "+segQuando(SEG.estado.conferido)+").",true)}
    return p}

  /* ---------- 2. entrar com Face ID (passkeys do Supabase Auth) ---------- */
  function segAparelho(){var u=navigator.userAgent||"";return /iPhone/.test(u)?"iPhone":/iPad/.test(u)?"iPad":/Macintosh/.test(u)?"Mac":/Android/.test(u)?"Android":/Windows/.test(u)?"Windows":"Este aparelho"}
  function segPasskeys(){
    var p=panel("Entrar com Face ID","Uma passkey guardada nas Chaves do iCloud: o iPhone confirma com o Face ID e o site entra sem digitar a senha. É só desta conta: cada pessoa cadastra a sua, no próprio aparelho. A senha continua valendo como alternativa."),
      st=h("p",{class:"sub",role:"status"}),ul=h("ul",{class:"wl"});
    var desligado=SEG.pkErro&&(SEG.pkErro.code==="passkey_disabled"||/passkey/i.test(SEG.pkErro.message||""));
    if(!passkeyOk())p.appendChild(h("p",{class:"sub",text:"Este navegador não aceita passkeys. No iPhone, use o Safari ou o app instalado na tela de início (iOS 16 ou mais novo)."}));
    if(desligado)p.appendChild(h("p",{class:"sub alerta",text:"⚠ Ainda não ligado no Supabase: o dono liga em Authentication → Passkeys (veja docs/seguranca.md). Até lá, entre com a senha."}));
    else if(SEG.pkErro)p.appendChild(h("p",{class:"sub",text:"Não consegui ver as passkeys agora ("+(SEG.pkErro.message||SEG.pkErro)+")."}));
    (SEG.passkeys||[]).forEach(function(k){var rm=h("button",{type:"button",class:"ghostbtn",text:"Remover"});
      rm.onclick=function(){if(!confirm("Remover “"+(k.friendly_name||"passkey")+"”? Esse aparelho deixa de entrar com Face ID nesta conta (a senha continua valendo)."))return;
        rm.disabled=true;st.textContent="Removendo…";
        Promise.resolve().then(function(){return SB.auth.passkey.delete({passkeyId:k.id})}).then(function(r){if(r&&r.error)throw r.error;
          return segEvento("passkey_removida",{nome:k.friendly_name||""})}).then(function(){st.textContent="✓ Removida.";setTimeout(function(){renderSeguranca()},1200)})
        .catch(function(e){rm.disabled=false;st.textContent=passkeyMsg(e)})};
      ul.appendChild(h("li",null,h("span",{class:"grow"},h("b",{text:k.friendly_name||"Passkey"}),h("span",{class:"sub",text:"cadastrada em "+segQuando(k.created_at)+(k.last_used_at?" · usada por último em "+segQuando(k.last_used_at):" · ainda não usada para entrar")})),rm))});
    if(SEG.passkeys&&!SEG.passkeys.length)ul.appendChild(h("li",null,h("span",{class:"grow"},h("b",{text:"Nenhuma passkey"}),h("span",{class:"sub",text:"Hoje esta conta entra com e-mail e senha."}))));
    p.appendChild(ul);
    if(SEG.passkeys&&passkeyOk()&&SEG.passkeys.length<10){
      var cad=h("button",{type:"button",text:"Cadastrar o Face ID deste aparelho"});
      cad.onclick=function(){cad.disabled=true;st.textContent="Esperando o Face ID…";var nome=segAparelho()+" · "+dataBR(hojeISO());
        Promise.resolve().then(function(){return SB.auth.registerPasskey()}).then(function(r){if(r.error)throw r.error;
          /* o nome que o aparelho manda é genérico ("iCloud Keychain"): troca por um que diga qual é */
          return Promise.resolve().then(function(){return SB.auth.passkey.update({passkeyId:r.data.id,friendlyName:nome})}).catch(function(){})})
        .then(function(){return segEvento("passkey_cadastrada",{nome:nome,total:SEG.passkeys.length+1})})
        .then(function(){st.textContent="✓ Pronto. Na próxima vez, toque em Entrar com Face ID na tela de entrada.";setTimeout(function(){renderSeguranca()},1800)})
        .catch(function(e){cad.disabled=false;st.textContent=passkeyMsg(e)})};
      p.appendChild(h("div",{class:"vfil"},cad))}
    if(SEG.fatores.length)p.appendChild(h("p",{class:"sub",text:"Esta conta também usa o código do app autenticador: depois do Face ID o site pede o código uma vez, ao entrar; depois a sessão continua aberta (não pede de novo ao abrir o app). Para entrar só com o Face ID, desative o código abaixo."}));
    p.appendChild(st);return p}

  /* ---------- 3. verificação em duas etapas (TOTP) ---------- */
  function segMfa(){
    var p=panel("Verificação em duas etapas","Além da senha, um código de 6 dígitos de um app autenticador (Google Authenticator, Microsoft Authenticator, 1Password, Apple Senhas…). É opcional e vale só para esta conta."),
      st=h("p",{class:"sub",role:"status"}),caixa=h("div");
    var ul=h("ul",{class:"wl"});
    if(!SEG.fatores.length)ul.appendChild(h("li",null,h("span",{class:"grow"},h("b",{text:"Desligada"}),h("span",{class:"sub",text:"Hoje a conta entra só com e-mail e senha."}))));
    SEG.fatores.forEach(function(f){var b=h("button",{type:"button",class:"ghostbtn",text:"Desativar"});b.onclick=function(){segDesativar(f,caixa,st)};
      ul.appendChild(h("li",null,h("span",{class:"grow"},h("b",{text:f.friendly_name||"App autenticador"}),h("span",{class:"sub",text:"cadastrado em "+segQuando(f.created_at)})),b))});
    p.appendChild(ul);
    if(SEG.fatores.length<10){var at=h("button",{type:"button",class:SEG.fatores.length?"ghostbtn":null,text:SEG.fatores.length?"Cadastrar um app reserva":"Ativar a verificação em duas etapas"});
      at.onclick=function(){at.disabled=true;segAtivar(caixa,st).then(function(){at.disabled=false},function(){at.disabled=false})};p.appendChild(h("div",{class:"vfil"},at))}
    if(SEG.semSql&&SEG.fatores.length)p.appendChild(h("p",{class:"sub",text:"⚠ O site já pede o código no login. Para o banco também recusar quem não passou pelo código, falta rodar o supabase/022_seguranca.sql."}));
    p.appendChild(caixa);p.appendChild(st);return p}
  function segAtivar(caixa,st){
    caixa.innerHTML="";st.textContent="Preparando…";
    /* um cadastro começado e não confirmado fica pendurado na conta: some antes de começar outro */
    var limpar=SEG.pendentes.reduce(function(pr,f){return pr.then(function(){return SB.auth.mfa.unenroll({factorId:f.id}).catch(function(){})})},Promise.resolve());
    var nome=(SEG.fatores.length?"Reserva ":"Celular ")+(SEG.fatores.length+1)+" · "+dataBR(hojeISO());
    return limpar.then(function(){return SB.auth.mfa.enroll({factorType:"totp",friendlyName:nome,issuer:"Dia a Dia RAC"})}).then(function(r){
      if(r.error)throw r.error;var d=r.data,t=d.totp||{};st.textContent="";
      var cod=h("input",{type:"text",inputmode:"numeric",autocomplete:"one-time-code",maxlength:"6",placeholder:"000000","aria-label":"Código de 6 dígitos"}),
        ok=h("button",{type:"submit",text:"Confirmar e ativar"}),can=h("button",{type:"button",class:"ghostbtn",text:"Cancelar"}),m=h("p",{class:"sub",role:"status"});
      var f=h("form",{class:"iabox"},h("b",{text:"1. No app autenticador, adicione uma conta lendo o QR code"}),
        h("div",{class:"segqr"},t.qr_code?h("img",{src:t.qr_code,alt:"QR code para o app autenticador"}):null,h("span",{class:"sub",text:"Sem câmera? Digite esta chave no app:"}),h("code",{text:t.secret||""})),
        h("b",{text:"2. Digite o código de 6 dígitos que o app mostrar"}),h("div",{class:"vfil"},cod,ok,can),m,
        h("p",{class:"sub",text:"Não tire print do QR code nem guarde a chave em lugar aberto: com ela, outra pessoa gera os seus códigos."}));
      can.onclick=function(){SB.auth.mfa.unenroll({factorId:d.id}).catch(function(){}).then(function(){caixa.innerHTML="";st.textContent="Cancelado: nada mudou."})};
      f.onsubmit=function(e){e.preventDefault();var c=cod.value.replace(/\D/g,"");if(c.length!==6){m.textContent="O código tem 6 dígitos.";return}
        ok.disabled=true;m.textContent="Conferindo…";
        SB.auth.mfa.challengeAndVerify({factorId:d.id,code:c}).then(function(r2){if(r2.error)throw r2.error;
          return segEvento("mfa_ativado",{fator:nome,total:SEG.fatores.length+1})}).then(function(){
          caixa.innerHTML="";st.textContent="✓ Ativada. Nas próximas entradas, o site pede o código depois da senha."+(SEG.fatores.length?"":" Agora cadastre um app reserva noutro aparelho.");
          setTimeout(function(){renderSeguranca()},2200)})
        .catch(function(e2){ok.disabled=false;cod.value="";m.textContent=/invalid|expired/i.test(e2.message||"")?"Código errado ou vencido. Espere o próximo e tente de novo.":"Não consegui ativar: "+(e2.message||e2)})};
      caixa.appendChild(f);setTimeout(function(){cod.focus()},50)})
    .catch(function(e){st.textContent="Não consegui começar: "+(e.message||e)+(/disabled|not enabled/i.test(e.message||"")?" (o TOTP está desligado em Authentication → Multi-Factor no painel do Supabase).":"");logErro("segurança: MFA",e);throw e})}
  /* desativar pede um código atual (de qualquer app da conta): quem só tem a senha não desliga a proteção */
  function segDesativar(fator,caixa,st){
    caixa.innerHTML="";st.textContent="";
    var ultimo=SEG.fatores.length===1,cod=h("input",{type:"text",inputmode:"numeric",autocomplete:"one-time-code",maxlength:"6",placeholder:"000000","aria-label":"Código atual"}),
      ok=h("button",{type:"submit",text:"Desativar"}),can=h("button",{type:"button",class:"ghostbtn",text:"Cancelar"}),m=h("p",{class:"sub",role:"status"});
    var f=h("form",{class:"iabox"},h("b",{text:"Desativar “"+(fator.friendly_name||"app")+"”"}),
      h("p",{class:"sub",text:(ultimo?"É o único app: a conta volta a entrar só com a senha. ":"")+"Para confirmar, digite um código atual do app."}),h("div",{class:"vfil"},cod,ok,can),m);
    can.onclick=function(){caixa.innerHTML=""};
    f.onsubmit=function(e){e.preventDefault();var c=cod.value.replace(/\D/g,"");if(c.length!==6){m.textContent="O código tem 6 dígitos.";return}
      ok.disabled=true;m.textContent="Conferindo…";
      SB.auth.mfa.challengeAndVerify({factorId:fator.id,code:c}).then(function(r){if(r.error)throw r.error;return SB.auth.mfa.unenroll({factorId:fator.id})}).then(function(r){if(r.error)throw r.error;
        return segEvento("mfa_desativado",{fator:fator.friendly_name||"",restam:SEG.fatores.length-1})}).then(function(){caixa.innerHTML="";st.textContent="✓ Desativado.";setTimeout(function(){renderSeguranca()},1500)})
      .catch(function(e2){ok.disabled=false;cod.value="";m.textContent=/invalid|expired/i.test(e2.message||"")?"Código errado ou vencido.":"Não consegui desativar: "+(e2.message||e2)})};
    caixa.appendChild(f);setTimeout(function(){cod.focus()},50)}

  /* ---------- 3. backup e exportação ---------- */
  /* o backup em JSON (formato 2): todas as tabelas pessoais desta conta, sem segredos, com quantidade e SHA-256 de cada uma */
  function segExportar(st,motivo){return atuDurante("o backup",function(){return segExportarJa(st,motivo)})}
  function segExportarJa(st,motivo){
    var tabs={},hashes={},fora=[],falhas=[],criado=new Date().toISOString();
    return BKP_TABELAS.reduce(function(p,t){return p.then(function(){st("Lendo "+t+"…");
      return lerTabela(t).then(function(l0){var c=NUCLEO.segLimpar(t,l0);tabs[t]=c.linhas;fora=fora.concat(c.fora);return segSha(NUCLEO.segCanon(c.linhas)).then(function(x){hashes[t]=x})},
        function(e){var d=NUCLEO.segDef(t);if(d&&d.dep&&NUCLEO.segTabelaAusente(e.message))return;falhas.push(t+": "+e.message)})})},Promise.resolve())
    .then(function(){var j=NUCLEO.segBackup(EU.id,criado,tabs,hashes,fora,falhas),txt=JSON.stringify(j);
      return segSha(txt).then(function(arq){
        baixarArquivo(new Blob([txt],{type:"application/json"}),"rac-backup-"+hojeISO()+(motivo?"-"+motivo:"")+".json");
        pessoalGravar("ultimoBackup",hojeISO());
        var cont={};Object.keys(tabs).forEach(function(t){cont[t]=tabs[t].length});
        return segEvento("exportacao",{formato:"json",motivo:motivo||"manual",tabelas:cont,fora:fora.length,falhas:falhas,sha256:arq,tamanho:txt.length}).then(function(){return {tabelas:cont,fora:fora,falhas:falhas,sha256:arq,tamanho:txt.length}})})})}
  function segBackupPainel(){
    var p=panel("Backup e exportação","Uma cópia de todos os seus dados (Mercado, lista, Eddie, Olivia, veículos, documentos, bebê, saúde, MBA, carreira e o resto do pessoal) para guardar fora do site."),
      st=h("p",{class:"sub",role:"status"}),js=h("button",{type:"button",text:"Baixar backup (JSON)"}),zp=h("button",{type:"button",class:"ghostbtn",text:"Pacote .zip (JSON + Excel)"}),za=h("button",{type:"button",class:"ghostbtn",text:"Pacote com fotos e PDFs"});
    function trava(v){js.disabled=zp.disabled=za.disabled=v}
    js.onclick=function(){trava(true);segExportar(function(t){st.textContent=t}).then(function(r){trava(false);
      st.textContent="✓ Backup baixado ("+sisKb(r.tamanho)+"): "+Object.keys(r.tabelas).map(function(k){return k+" "+r.tabelas[k]}).join(", ")+"."+(r.fora.length?" Ficaram de fora "+r.fora.length+" segredos (senhas, chaves, tokens).":"")+(r.falhas.length?" ⚠ Não li: "+r.falhas.join("; "):"")})
      .catch(function(e){trava(false);st.textContent="Não consegui exportar: "+e.message;logErro("backup",e)})};
    function zip(c){trava(true);atuDurante("o backup",function(){return exportarTudo(c,function(t){st.textContent=t})}).then(function(m){trava(false);
      st.textContent="✓ Pacote baixado: "+Object.keys(m.tabelas).map(function(k){return k+" "+m.tabelas[k]}).join(", ")+(m.anexos!=null?", anexos "+m.anexos:"")+".";
      segEvento("exportacao",{formato:c?"zip com anexos":"zip",tabelas:m.tabelas,anexos:m.anexos||0,fora:(m.fora||[]).length})})
      .catch(function(e){trava(false);st.textContent="Não consegui exportar: "+e.message;logErro("backup",e)})}
    zp.onclick=function(){zip(false)};za.onclick=function(){zip(true)};
    p.appendChild(h("p",null,h("b",{text:"Último backup baixado: "}),PESSOAL.ultimoBackup?dataBR(PESSOAL.ultimoBackup):"nunca"));
    p.appendChild(h("div",{class:"vfil"},js,zp,za));p.appendChild(st);
    p.appendChild(h("p",{class:"sub",text:"Fica no backup só o que é desta conta. Não entram: senhas, chaves, tokens, a chave dos atalhos do iPhone, as inscrições de notificação nem os registros internos do servidor. O JSON leva a quantidade e a assinatura (SHA-256) de cada tabela, conferidas na restauração."}));
    return p}

  /* ---------- 4. restauração: lê, confere, mostra a prévia e só grava depois da confirmação ---------- */
  function segRestaurarPainel(){
    var p=panel("Restaurar um backup","Escolha um backup (.json ou .zip). Antes de gravar, o site confere o arquivo, compara com o que existe hoje e mostra o que entraria. Nada é apagado."),
      inp=h("input",{type:"file",accept:".json,.zip,application/json,application/zip",hidden:""}),b=h("button",{type:"button",class:"ghostbtn",text:"Escolher o arquivo do backup"}),
      area=h("div",{class:"segprev"});
    b.onclick=function(){inp.click()};
    inp.onchange=function(){var f=inp.files[0];inp.value="";if(f)segPrevia({nome:f.name,ler:function(){return bkpLerArquivo(f)}},area)};
    p.appendChild(h("div",{class:"vfil"},b,inp));p.appendChild(area);SEG.areaRestaurar=area;return p}
  function segRot(t,r){var x=r.titulo||r.nome||r.item||r.descricao||r.categoria||r.chave||r.data||r.inicio||r.id;
    return (r.data&&x!==r.data?dataBR(String(r.data).slice(0,10))+" · ":"")+String(x).slice(0,80)}
  function segPrevia(fonte,area){
    var st=h("p",{class:"sub",role:"status",text:"Lendo “"+fonte.nome+"”…"});area.innerHTML="";area.appendChild(st);
    var B,anexos=[],H,fimT=atuTarefa("a leitura do backup");
    function erro(lista,titulo){area.innerHTML="";area.appendChild(h("p",{class:"alerta",text:"✗ "+titulo}));var ul=h("ul",{class:"clean"});lista.forEach(function(x){ul.appendChild(h("li",{text:x}))});area.appendChild(ul);
      area.appendChild(h("p",{class:"sub",text:"Nada foi gravado."}))}
    return Promise.resolve().then(fonte.ler).then(function(r){anexos=r.anexos||[];B=NUCLEO.segLer(r.json);
      if(!B.ok){erro(B.problemas,"O arquivo não passou na conferência da estrutura");return null}
      var ts=Object.keys(B.tabelas),hs={};
      return Promise.all(ts.map(function(t){return segSha(NUCLEO.segCanon(B.tabelas[t])).then(function(x){hs[t]=x})})).then(function(){H=NUCLEO.segHashes(B,hs);
        if(!H.ok){erro(H.problemas,"O arquivo não passou na conferência de integridade");return null}
        var atual={};st.textContent="Comparando com o que existe hoje…";
        /* lê todas as tabelas (não só as do backup): um item do backup pode apontar para uma nota que já existe hoje */
        return NUCLEO.SEG_TABELAS.filter(function(d){return !d.so}).map(function(d){return d.t}).reduce(function(pr,t){return pr.then(function(){return lerTabela(t).then(function(l){atual[t]=l})})},Promise.resolve())
          .then(function(){return (/\.zip$/i.test(fonte.nome)?segAnexosFiscais(anexos):Promise.resolve(null)).then(function(fisc){return NUCLEO.segPlano(B,atual,{conta:EU.id,anexos:fisc})})})})})
    .then(function(plano){fimT();if(plano)segMostrarPlano(fonte,B,H,plano,anexos,area)})
    .catch(function(e){fimT();erro([e.message||String(e)],"Não consegui ler o backup");logErro("restaurar",e)})}
  function segMostrarPlano(fonte,B,H,plano,anexos,area){
    area.innerHTML="";var T=plano.total,linhas=[];
    area.appendChild(h("h3",{class:"mbag",text:"Prévia: "+fonte.nome}));
    area.appendChild(h("p",{class:"sub",text:"Backup de "+(B.criado?segQuando(B.criado):"data desconhecida")+" · formato "+B.versao+" · "+(plano.outraConta?"⚠ de OUTRA conta":"desta conta")+" · "+(H.aviso||"✓ estrutura e assinaturas conferidas")}));
    plano.tabelas.forEach(function(it){var n=it.so?it.soExportar:it.novas.length+it.iguais+it.diferentes.length+it.invalidas.length+it.fora;if(!n)return;
      linhas.push([it.t,String(n),it.so?"—":String(it.novas.length),it.so?"—":String(it.iguais),it.so?"—":String(it.diferentes.length),it.so?"só exportação":String(it.invalidas.length)])});
    area.appendChild(table(["Tabela","No backup","Novas","Iguais","Mudaram","Inválidas"],linhas,1));
    var av=[].concat(B.avisos||[]);
    plano.tabelas.forEach(function(it){if(it.remapeadas)av.push(it.t+": "+it.remapeadas+" com o mesmo nome de um registro de hoje (usam o registro de hoje, e os itens ligados a eles também)");
      if(it.semPai)av.push(it.t+": "+it.semPai+" apontavam para um produto que não existe (ficam sem produto)");
      if(it.fora)av.push(it.t+": "+it.fora+" chaves secretas ignoradas (não voltam por restauração)");
      if(it.so)av.push(it.t+": as edições da Newsletter ficam só no backup (as com IA dependem do registro da chamada)")});
    if(T.iguais)av.push(T.iguais+(T.iguais===1?" linha já existe igual e fica como está.":" linhas já existem iguais e ficam como estão."));
    if(plano.congeladas)av.push("Central Fiscal: "+plano.congeladas+(plano.congeladas===1?" linha já conferida (ou filha de nota conferida) não é alterada.":" linhas já conferidas (ou filhas de nota conferida) não são alteradas."));
    if(plano.docsInvalidos)av.push("Central Fiscal: "+plano.docsInvalidos+(plano.docsInvalidos===1?" documento inválido não entra (veja o motivo em notas_fiscais_docs).":" documentos inválidos não entram (veja os motivos em notas_fiscais_docs)."));
    plano.tabelas.forEach(function(it){if(it.semDocumento)av.push(it.t+": "+it.semDocumento+(it.semDocumento===1?" nota fica sem documento original válido: entra pendente, sem os itens e sem a conferência.":" notas ficam sem documento original válido: entram pendentes, sem os itens e sem a conferência."))});
    if(anexos.length)av.push(anexos.length+" fotos/PDFs no .zip: entram só os que não existem no cofre (nenhum é substituído).");
    if(av.length){var ul=h("ul",{class:"clean"});av.forEach(function(x){ul.appendChild(h("li",{class:"sub",text:"• "+x}))});area.appendChild(ul)}
    /* detalhes: o que entra e o que mudou, por tabela */
    plano.tabelas.forEach(function(it){if(it.so||(!it.novas.length&&!it.diferentes.length&&!it.invalidas.length))return;
      var d=h("details",null,h("summary",{text:it.t+": ver as linhas"})),w=h("ul",{class:"wl"});d.appendChild(w);
      it.novas.slice(0,8).forEach(function(r){w.appendChild(h("li",null,h("span",{class:"grow"},h("b",{text:"Nova"}),h("span",{class:"sub",text:segRot(it.t,r)}))))});
      if(it.novas.length>8)w.appendChild(h("li",null,h("span",{class:"sub",text:"… e mais "+(it.novas.length-8)+" novas"})));
      it.diferentes.slice(0,8).forEach(function(x){w.appendChild(h("li",null,h("span",{class:"grow"},h("b",{text:"Mudou"}),h("span",{class:"sub",text:segRot(it.t,x.atual)+" · campos: "+x.campos.join(", ")}))))});
      it.invalidas.slice(0,5).forEach(function(x){w.appendChild(h("li",{class:"alerta"},h("span",{class:"grow"},h("b",{text:"Inválida (não entra)"}),h("span",{class:"sub",text:segRot(it.t,x.linha)+" · "+x.motivo}))))});
      area.appendChild(d)});
    var cCopia=h("input",{type:"checkbox",checked:""}),cSub=h("input",{type:"checkbox"}),cConta=h("input",{type:"checkbox"}),
      grava=h("button",{type:"button"}),can=h("button",{type:"button",class:"ghostbtn segdesc",text:"Descartar a prévia"}),st=h("p",{class:"sub",role:"status"});
    area.appendChild(h("label",null,cCopia,h("span",{text:"Antes de gravar, baixar uma cópia (JSON) do que existe hoje."})));
    if(T.diferentes)area.appendChild(h("label",null,cSub,h("span",{text:"Também trocar "+(T.diferentes===1?"a linha que mudou":"as "+T.diferentes+" linhas que mudaram")+" pelo que está no backup (sem marcar, o que existe hoje fica como está)."})));
    if(plano.outraConta)area.appendChild(h("label",null,cConta,h("span",{class:"alerta",text:"Este backup é de outra conta. Quero trazer os dados dele para esta conta."})));
    function total(){return T.novas+(cSub.checked?T.diferentes:0)}
    function atualiza(){var n=total();grava.textContent=n?"Gravar "+n+(n===1?" linha":" linhas"):"Nada para gravar";grava.disabled=!n&&!anexos.length||(plano.outraConta&&!cConta.checked);
      if(!n&&anexos.length)grava.textContent="Enviar os anexos que faltam"}
    cSub.onchange=cConta.onchange=atualiza;atualiza();
    can.onclick=function(){area.innerHTML=""};
    grava.onclick=function(){var n=total();
      if(!confirm("Gravar agora?\n\n• "+segN(T.novas,"linha nova entra","linhas novas entram")+(cSub.checked?"\n• "+segN(T.diferentes,"linha de hoje é trocada","linhas de hoje são trocadas")+" pelo backup":"\n• nenhuma linha de hoje é alterada")+(anexos.length?"\n• anexos que faltam no cofre são enviados":"")+"\n• nada é apagado"))return;
      grava.disabled=can.disabled=true;
      var feito={inseridas:0,substituidas:0,anexos:0,anexosExistentes:0},fimT=atuTarefa("a restauração do backup");
      (cCopia.checked?segExportar(function(t){st.textContent="Cópia de hoje: "+t},"antes-de-restaurar"):Promise.resolve())
      .then(function(){return segGravar(NUCLEO.segEscrita(plano,cSub.checked),feito,function(t){st.textContent=t})})
      .then(function(){return segAnexos(anexos,B.conta,plano,feito,function(t){st.textContent=t})})
      .then(function(){return segEvento("restauracao",{arquivo:fonte.nome,criado:B.criado,formato:B.versao,outraConta:plano.outraConta,inseridas:feito.inseridas,substituidas:feito.substituidas,conferencias:feito.conferencias||0,anexos:feito.anexos,anexosIgnorados:feito.ignorados||0,congeladas:plano.congeladas||0,docsInvalidos:plano.docsInvalidos||0})})
      .then(function(){fimT();st.textContent="✓ Restaurado: "+segN(feito.inseridas,"linha nova","linhas novas")+(feito.substituidas?", "+segN(feito.substituidas,"trocada","trocadas"):"")+(feito.conferencias?", "+feito.conferencias+(feito.conferencias===1?" conferência restaurada":" conferências restauradas"):"")+(feito.anexos||feito.anexosExistentes?", "+feito.anexos+" anexos enviados ("+feito.anexosExistentes+" já existiam)":"")+(feito.ignorados?"; "+feito.ignorados+(feito.ignorados===1?" anexo fiscal ignorado (sem documento válido)":" anexos fiscais ignorados (sem documento válido)"):"")+".";
        var r=h("button",{type:"button",text:"Recarregar o site"});r.onclick=function(){location.reload()};area.appendChild(h("div",{class:"vfil"},r))})
      .catch(function(e){fimT();st.textContent="Parou com erro: "+e.message+". Gravado até aqui: "+feito.inseridas+" novas, "+feito.substituidas+" trocadas. Nada foi apagado; pode abrir a prévia de novo (o que já entrou aparece como igual).";
        logErro("restaurar",e);segEvento("restauracao",{arquivo:fonte.nome,erro:String(e.message).slice(0,300),inseridas:feito.inseridas,substituidas:feito.substituidas})})};
    area.appendChild(h("div",{class:"vfil"},grava,can));area.appendChild(st)}
  /* insert para as novas (se a linha passou a existir nesse meio-tempo, o banco recusa em vez de sobrescrever); upsert só no que o dono mandou trocar */
  function segGravar(ops,feito,st){
    return ops.reduce(function(p,op){return p.then(function(){var l=op.linhas;
      function lote(i){if(i>=l.length)return Promise.resolve();st((op.op==="insert"?"Gravando ":op.op==="conferencia"?"Restaurando a conferência de ":"Trocando ")+op.t+"… "+Math.min(i+500,l.length)+" de "+l.length);
        var q=op.op==="insert"?SB.from(op.t).insert(l.slice(i,i+500)):SB.from(op.t).upsert(l.slice(i,i+500));
        return q.then(function(r){if(r.error)throw new Error(op.t+": "+r.error.message);if(op.op==="insert")feito.inseridas+=Math.min(500,l.length-i);else if(op.op==="conferencia")feito.conferencias=(feito.conferencias||0)+Math.min(500,l.length-i);else feito.substituidas+=Math.min(500,l.length-i);return lote(i+500)})}
      return lote(0)})},Promise.resolve())}
  function segAnexos(anexos,velha,plano,feito,st){
    var ctx={velha:velha,conta:EU.id,renomear:(plano&&plano.renomear)||{}};
    /* sem tipo (Compras e demais): exatamente como antes. Com tipo (anexo fiscal): o Blob e o contentType levam o mime do registro */
    function enviar(path,dados,mime){return SB.storage.from("familia").upload(path,mime?new Blob([dados],{type:mime}):new Blob([dados]),mime?{upsert:false,contentType:mime}:{upsert:false})}
    return NUCLEO.segAnexosEnviar(anexos,ctx,enviar,function(n,t){st("Enviando anexos… "+n+" de "+t)}).then(function(r){
      feito.anexos+=r.anexos;feito.anexosExistentes+=r.anexosExistentes;feito.ignorados=(feito.ignorados||0)+r.ignorados})}

  /* ---------- 5. histórico ---------- */
  var SEG_TIPOS={exportacao:"Backup baixado",passkey_cadastrada:"Face ID cadastrado",passkey_removida:"Face ID removido",restauracao:"Restauração",teste_restauracao:"Teste de restauração",mfa_ativado:"Verificação em duas etapas ativada",mfa_desativado:"Verificação em duas etapas desativada",auditoria:"Auditoria"};
  function segResumoEvento(e){var r=e.resumo||{},p=[];
    if(r.formato)p.push(r.formato);if(r.motivo&&r.motivo!=="manual")p.push(r.motivo);
    if(r.tabelas)p.push(Object.keys(r.tabelas).reduce(function(s,k){return s+(+r.tabelas[k]||0)},0)+" linhas");
    if(r.inseridas!=null)p.push(r.inseridas+" novas"+(r.substituidas?", "+r.substituidas+" trocadas":""));
    if(r.arquivo)p.push(r.arquivo);if(r.fator)p.push(r.fator);if(r.erro)p.push("erro: "+r.erro);
    if(r.ok!=null)p.push(r.ok?"tudo certo":(r.problemas||[]).length+" problemas");if(r.sha256)p.push("SHA-256 "+r.sha256.slice(0,12)+"…");
    return p.join(" · ")}
  function segHistorico(){
    var p=panel("Histórico de backups","Os backups automáticos (todo domingo, no cofre privado do servidor; ficam os 8 mais novos) e o registro do que foi feito nesta Central."),st=h("p",{class:"sub",role:"status"});
    p.appendChild(h("h3",{class:"mbag",text:"No servidor"}));var ul=h("ul",{class:"wl acab"});p.appendChild(ul);
    if(!SEG.servidor||!SEG.servidor.length)ul.appendChild(h("li",null,h("span",{class:"sub",text:SEG.servidor?"Ainda nenhum. O primeiro sai no domingo, com a rotina das 6h.":"Não consegui ver o cofre de backups agora."})));
    (SEG.servidor||[]).forEach(function(f){var nome=f.name,bx=h("button",{type:"button",class:"ghostbtn",text:"Baixar"}),cf=h("button",{type:"button",class:"ghostbtn",text:"Conferir"}),pv=h("button",{type:"button",class:"ghostbtn",text:"Prévia da restauração"});
      bx.onclick=function(){SB.storage.from("backups").download(EU.id+"/"+nome).then(function(x){if(x.data)baixarArquivo(x.data,"rac-backup-servidor-"+nome)})};
      cf.onclick=function(){cf.disabled=true;st.textContent="Conferindo "+nome+"…";sisTesteRestauracao(f).then(function(r){cf.disabled=false;st.textContent=r.ok?"✓ "+nome+" restauraria tudo (JSON íntegro, todas as tabelas, sem repetidos).":"⚠ "+nome+": "+r.problemas.join("; ");
        segEvento("teste_restauracao",{arquivo:nome,ok:r.ok,problemas:r.problemas})},function(e){cf.disabled=false;st.textContent="Não consegui conferir: "+e.message})};
      pv.onclick=function(){var a=SEG.areaRestaurar;segPrevia({nome:"servidor/"+nome,ler:function(){return SB.storage.from("backups").download(EU.id+"/"+nome).then(function(r){if(r.error)throw r.error;return r.data.text()}).then(function(t){return {json:JSON.parse(t),anexos:[]}})}},a);
        a.scrollIntoView({behavior:"smooth",block:"start"})};
      var tam=f.metadata&&f.metadata.size;
      ul.appendChild(h("li",null,h("span",{class:"grow"},h("b",{text:dataBR(nome.slice(0,10))}),h("span",{class:"sub",text:tam?sisKb(tam):""})),h("div",{class:"vfil"},bx,cf,pv)))});
    p.appendChild(h("h3",{class:"mbag",text:"Registro de segurança"}));var ue=h("ul",{class:"wl"});p.appendChild(ue);
    if(SEG.eventos==null)ue.appendChild(h("li",null,h("span",{class:"sub",text:"O registro começa depois de rodar o supabase/022_seguranca.sql. Até lá vale a data do último backup baixado: "+(PESSOAL.ultimoBackup?dataBR(PESSOAL.ultimoBackup):"nunca")+"."})));
    else if(!SEG.eventos.length)ue.appendChild(h("li",null,h("span",{class:"sub",text:"Nada registrado ainda."})));
    else SEG.eventos.forEach(function(e){ue.appendChild(h("li",{class:e.resumo&&(e.resumo.erro||e.resumo.ok===false)?"alerta":null},h("span",{class:"grow"},h("b",{text:SEG_TIPOS[e.tipo]||e.tipo}),h("span",{class:"sub",text:segQuando(e.quando)+(segResumoEvento(e)?" · "+segResumoEvento(e):"")}))))});
    p.appendChild(st);return p}

  /* ---------- 6. auditoria ---------- */
  function segAuditoria(){
    var p=panel("Auditoria","O que o banco permite, conferido de dentro dele (só nomes de tabelas e regras, nenhum dado), e o resultado da revisão do código."),ul=h("ul",{class:"wl sissaude"}),st=h("p",{class:"sub",role:"status"});p.appendChild(ul);
    function li(ok,rot,txt){ul.appendChild(h("li",{class:ok?null:"alerta"},h("span",{class:"sisdot",text:ok?"✓":"⚠"}),h("span",{class:"grow"},h("b",{text:rot}),h("span",{class:"sub",text:txt}))))}
    var e=SEG.estado;
    if(!e)li(false,"Conferência do banco","Falta rodar o supabase/022_seguranca.sql (cria a conferência, o registro e a trava da 2ª etapa).");
    else{
      li(!(e.sem_rls||[]).length,"RLS ligado em todas as tabelas",(e.sem_rls||[]).length?"Sem RLS: "+e.sem_rls.join(", "):"Toda tabela só mostra as linhas de quem pode ver.");
      li(!(e.anon_le||[]).length,"Visitante sem login",(e.anon_le||[]).length?"Consegue ler: "+e.anon_le.join(", "):"Não lê nenhuma tabela.");
      li(!(e.sem_trava_mfa||[]).length,"Trava da 2ª etapa",(e.sem_trava_mfa||[]).length?"Faltam: "+e.sem_trava_mfa.join(", "):"Em todas as tabelas pessoais e nos cofres de arquivos.");
      li(!(e.cofres_publicos||[]).length,"Cofres de arquivos",(e.cofres_publicos||[]).length?"Públicos: "+e.cofres_publicos.join(", "):"Todos privados (fotos e PDFs só por link temporário).");
      li(!(e.funcoes_abertas||[]).length,"Funções do servidor",(e.funcoes_abertas||[]).length?"Abertas a quem não entrou: "+e.funcoes_abertas.join(", "):"Nenhuma função privilegiada aberta a quem não entrou.");
      p.appendChild(h("p",{class:"sub",text:"Conferido "+segQuando(e.conferido)+" · sessão "+(e.aal==="aal2"?"com código (aal2)":"só com senha (aal1)")}))}
    var rv=h("details",null,h("summary",{text:"Revisão do código (31/10/2026)"})),ur=h("ul",{class:"clean"});rv.appendChild(ur);
    ["Site: só a chave pública; nenhuma senha, token ou chave secreta no repositório (teste automático).",
     "Edge Functions garmin, rac-ia e rac-newsletter: recusam quem não entrou ou não tem a senha da rotina; CORS só para o próprio site (testes automáticos).",
     "Corrigido: a restauração antiga sobrescrevia linhas e anexos sem avisar e trazia de volta a chave dos atalhos do iPhone. Agora há prévia, conferência e confirmação, e nada é sobrescrito sem pedir.",
     "Corrigido: o backup baixado não levava a lista nem o diário do bebê, e levava a chave do Google Maps.",
     "Recomendado: ligar \"Leaked password protection\" e conferir o tamanho mínimo da senha em Authentication (painel do Supabase)."].forEach(function(t){ur.appendChild(h("li",{class:"sub",text:"• "+t}))});
    p.appendChild(rv);
    if(e){var b=h("button",{type:"button",class:"ghostbtn",text:"Conferir de novo"});b.onclick=function(){b.disabled=true;Promise.resolve().then(function(){return SB.rpc("seguranca_estado")}).then(function(r){if(r.error)throw r.error;SEG.estado=r.data;
      var pr=segProblemasBanco(r.data);return segEvento("auditoria",{ok:!pr.length,problemas:pr})}).then(function(){renderSeguranca()},function(x){b.disabled=false;st.textContent="Não consegui conferir: "+x.message})};
      p.appendChild(h("div",{class:"vfil"},b))}
    p.appendChild(st);return p}

  /* ---------- 7. recuperação ---------- */
  function segRecuperacao(){
    var p=panel("Se perder o acesso","Guarde estas orientações. Elas valem para a senha e para o app autenticador."),ul=h("ul",{class:"clean"});p.appendChild(ul);
    ["Face ID: se o aparelho for perdido, remova a passkey dele aqui (de outro aparelho) ou entre com a senha. As passkeys ficam nas Chaves do iCloud e voltam num iPhone novo com o mesmo Apple ID.",
     "Esqueceu a senha: na tela de entrar, digite o e-mail e toque em Esqueci a senha. O link chega por e-mail; com a verificação em duas etapas ligada, o código continua sendo pedido.",
     "Perdeu o celular do app: entre com o app reserva (cadastre um noutro aparelho, como o tablet ou o 1Password) e desative o app perdido aqui.",
     "Sem nenhum app: o dono do site abre o painel do Supabase → Authentication → Users → a conta → remove o fator (MFA). A conta volta a entrar só com a senha; depois cadastre de novo.",
     "Se o dono perder os dois apps: o acesso ao painel do Supabase (com a verificação da própria conta do Supabase) é a recuperação. Guarde esse acesso com cuidado.",
     "Dados apagados por engano: use a Restauração acima com o backup baixado ou com o do servidor (prévia antes de gravar).",
     "O Supabase não guarda códigos de recuperação: por isso o app reserva é o jeito seguro de não ficar trancado."].forEach(function(t){ul.appendChild(h("li",{class:"sub",text:"• "+t}))});
    return p}
