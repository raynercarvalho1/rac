/* Dia a Dia RAC — módulo carregado quando a seção abre. Componentes (#componentes): página interna SÓ DO DONO, sem item no menu, que mostra o
   Design System RAC (Fase 3 · DS-1; docs/design-system.md): tokens, tipografia, cartões, botões, chips e selos, estados, campos, lista e tabela.
   Serve para conferir no celular e no computador, nos dois temas (o tema se troca na barra lateral, como sempre). Não lê nem grava dado nenhum,
   não chama IA e nenhum outro módulo depende dele. As funções dsc* são o "como usar": cada módulo que migrar copia o jeito de montar. */
  /* ícone de estado: sempre ícone + palavra, nunca só a cor */
  var DSC_ICONE={ok:"✓",aviso:"⚠",erro:"✗",info:"i",neutro:"•"};
  function dscSelo(tipo,texto){return h("span",{class:"rac-selo rac-selo--"+tipo},h("span",{"aria-hidden":"true",text:DSC_ICONE[tipo]||"•"}),texto)}
  function dscBtn(tipo,texto,extra){var a={type:"button",class:"rac-btn rac-btn--"+tipo,text:texto};if(extra)Object.keys(extra).forEach(function(k){a[k]=extra[k]});return h("button",a)}
  function dscCard(titulo,filhos,opc){opc=opc||{};
    var c=h("div",{class:"rac-card"+(opc.variante?" rac-card--"+opc.variante:"")},h("div",{class:"rac-card-cab"},h("h3",{class:"rac-t-cartao",text:titulo}),opc.acao||null),h("div",{class:"rac-card-corpo"},filhos));
    if(opc.origem)c.appendChild(h("div",{class:"rac-card-rod rac-t-legenda",text:opc.origem}));return c}
  /* um só componente para carregando (esqueleto), vazio (diz o que fazer) e erro (o que falhou + tentar de novo) */
  function dscEstado(tipo,texto,acao){
    if(tipo==="carregando")return h("div",{class:"rac-estado",role:"status","aria-busy":"true"},h("div",{class:"rac-esqueleto","aria-hidden":"true"},h("i"),h("i"),h("i")),h("span",{class:"rac-t-sec",text:texto||"Carregando…"}));
    return h("div",{class:"rac-estado"+(tipo==="erro"?" rac-estado--erro":""),role:tipo==="erro"?"alert":"status"},h("span",{class:"rac-t-texto",text:(tipo==="erro"?"✗ ":"")+texto}),acao||null)}
  function dscCampo(rotulo,id,ajuda,erro){
    var ajId=id+"-aj",inp=h("input",{class:"rac-campo-entrada",id:id,type:"text","aria-describedby":ajuda||erro?ajId:null,"aria-invalid":erro?"true":null});
    if(erro)inp.value="valor digitado, mantido";
    return h("div",{class:"rac-campo"+(erro?" rac-campo--erro":"")},h("label",{class:"rac-campo-rotulo","for":id,text:rotulo}),inp,erro||ajuda?h("span",{class:"rac-campo-ajuda",id:ajId,text:(erro?"✗ ":"")+(erro||ajuda)}):null)}
  function dscSecao(titulo,sub,filhos){
    var p=h("section",{class:"rac-card","aria-label":titulo},h("h2",{class:"rac-t-secao",text:titulo}),sub?h("p",{class:"rac-t-sec",style:"margin:0",text:sub}):null);
    p.appendChild(filhos);return p}

  function renderComponentes(){var root=$("#componentes-view");root.innerHTML="";
    if(!isOwner()){root.appendChild(h("div",{class:"panel"},h("p",{class:"empty",text:"Esta página é só da conta do dono."})));return}
    $("#ptitle").textContent="Componentes";
    root.appendChild(h("div",{class:"rac-card"},h("h1",{class:"rac-t-pagina",text:"Design System RAC"}),
      h("p",{class:"rac-t-sec",style:"margin:0",text:"Página interna da Fase 3 (DS-1). Confira no celular e no computador; troque o tema na barra lateral para ver os dois. Nada aqui lê ou grava dado."}),
      h("div",{class:"rac-linha-flex"},dscSelo("info","DS-1"),dscSelo("neutro","só o dono"))));
    /* tokens: cores de marca, estados e superfícies, sempre mostrando o nome do token */
    var cores=[["--rac-dodger","Azul Dodger (preenchimento)"],["--rac-dodger-forte","Dodger forte (pressionado)"],["--rac-dodger-claro","Dodger claro (texto no escuro)"],["--rac-vermelho","Vermelho (urgente, ao vivo)"],["--rac-prata","Prata (detalhe)"],
      ["--rac-ok-fill","Sucesso"],["--rac-aviso-fill","Alerta"],["--rac-erro-fill","Erro"],["--rac-info-fill","Informação"],["--rac-fundo","Fundo"],["--rac-sup-1","Superfície 1 (cartão)"],["--rac-sup-2","Superfície 2 (campo, realce)"]];
    var g=h("div",{class:"rac-grade"});cores.forEach(function(c){g.appendChild(h("div",{class:"rac-pilha",style:"gap:4px"},h("div",{class:"rac-cor",style:"background:var("+c[0]+")"}),h("span",{class:"rac-t-sec",text:c[1]}),h("code",{class:"rac-t-mono",text:c[0]})))});
    root.appendChild(dscSecao("Cores","Os nomes --rac-* apontam para os tokens atuais; trocar o tema troca tudo junto.",g));
    var esc=h("div",{class:"rac-pilha"});
    [["Número de destaque","rac-t-num","R$ 1.240"],["Título da página","rac-t-pagina","Título da página"],["Título de seção","rac-t-secao","Título de seção"],["Título de cartão","rac-t-cartao","Título de cartão"],["Texto","rac-t-texto","Texto corrido, a leitura principal das telas."],["Secundário","rac-t-sec","Texto secundário e ajuda"],["Legenda e selo","rac-t-legenda","LEGENDA"],["Dado técnico","rac-t-mono","a1b2c3 · 12:30"]].forEach(function(t){
      esc.appendChild(h("div",{class:"rac-pilha",style:"gap:2px"},h("span",{class:"rac-t-legenda",text:t[0]+" · "+t[1]}),h("div",{class:t[1],text:t[2]})))});
    root.appendChild(dscSecao("Tipografia","Oito papéis (hoje são 25 tamanhos). No computador tudo cresce 2 px, pelo --fz que já existia.",esc));
    /* botões */
    var bt=h("div",{class:"rac-linha-flex"},dscBtn("pri","Salvar"),dscBtn("sec","Editar"),dscBtn("ter","Ver tudo"),dscBtn("perigo","Excluir"),dscBtn("icone","↻",{"aria-label":"Atualizar"}),
      dscBtn("pri","Desligado",{disabled:"disabled"}),dscBtn("sec","Ocupado",{"aria-busy":"true"}));
    root.appendChild(dscSecao("Botões","Uma ação primária por área. Alvo de toque de 44 px; foco visível; desligado e ocupado têm aparência própria.",bt));
    var ch=h("div",{class:"rac-linha-flex"}),pp=h("div",{class:"rac-linha-flex"},dscSelo("ok","Em dia"),dscSelo("aviso","Atrasado"),dscSelo("erro","Falhou"),dscSelo("info","Novo"),dscSelo("neutro","Sem dado"));
    ["Todos","Casa","Finanças"].forEach(function(t,i){var b=h("button",{type:"button",class:"rac-chip","aria-pressed":i===0?"true":"false",text:t});
      b.onclick=function(){Array.prototype.forEach.call(ch.children,function(x){x.setAttribute("aria-pressed",x===b?"true":"false")})};ch.appendChild(b)});
    root.appendChild(dscSecao("Chips e selos","Chip de filtro (toque para alternar) e selo de estado: sempre ícone, palavra e cor.",h("div",{class:"rac-pilha"},ch,pp)));
    /* cartões */
    var cs=h("div",{class:"rac-grade"});
    cs.appendChild(dscCard("Gasto do mês",h("div",null,h("div",{class:"rac-t-num",text:"R$ 1.240"}),h("div",{class:"rac-t-sec",text:"+12% vs. mês passado"})),{variante:"kpi",origem:"Fonte: exemplo · atualizado há 2 h"}));
    cs.appendChild(dscCard("Precisa de atenção",h("div",{class:"rac-pilha",style:"gap:8px"},h("span",{class:"rac-t-texto",text:"Exemplo de sinal: por que estou vendo isto."}),h("div",{class:"rac-linha-flex"},dscBtn("sec","Ver"),dscBtn("ter","Adiar"))),{variante:"sinal",acao:dscSelo("aviso","1")}));
    var at=h("a",{class:"rac-card rac-card--atalho",href:"#componentes"},h("div",{class:"rac-card-cab"},h("h3",{class:"rac-t-cartao",text:"Atalho de módulo"}),dscSelo("ok","Em dia")),h("span",{class:"rac-t-sec",text:"Cartão inteiro clicável."}));cs.appendChild(at);
    root.appendChild(dscSecao("Cartões","Cabeçalho, corpo e rodapé de origem; variantes resumo, sinal e atalho.",cs));
    /* estados */
    var es=h("div",{class:"rac-grade"},dscEstado("carregando"),dscEstado("vazio","Nada por aqui ainda. Toque em Salvar para criar o primeiro.",dscBtn("sec","Criar")),dscEstado("erro","Não consegui carregar agora.",dscBtn("sec","Tentar de novo")));
    root.appendChild(dscSecao("Carregando, vazio e erro","Um componente só: o esqueleto não faz a página pular; o vazio diz o que fazer; o erro oferece tentar de novo.",es));
    /* formulários */
    var fm=h("div",{class:"rac-grade"},dscCampo("Nome","dsc-c1","Como aparece nas listas."),dscCampo("Valor","dsc-c2",null,"Informe um número maior que zero."));
    root.appendChild(dscSecao("Campos","Rótulo sempre visível, ajuda abaixo; o erro fica no próprio campo e não apaga o que foi digitado.",fm));
    /* lista e tabela */
    var ls=h("ul",{class:"rac-lista"});[["Conta de luz","vence em 2 dias","aviso","Atenção"],["Condomínio","pago","ok","Pago"],["Seguro","sem dado","neutro","Sem dado"]].forEach(function(r){
      ls.appendChild(h("li",null,h("div",{class:"rac-grow"},h("b",{text:r[0]}),h("div",{class:"rac-t-sec",text:r[1]})),dscSelo(r[2],r[3])))});
    var tb=h("table",{class:"rac-tabela"},h("thead",null,h("tr",null,h("th",{text:"Mês"}),h("th",{class:"rac-n",text:"Gasto"}),h("th",{class:"rac-n",text:"Variação"}))),
      h("tbody",null,[["Setembro","R$ 1.110,00","+4%"],["Outubro","R$ 1.180,00","+6%"],["Novembro","R$ 1.240,00","+12%"]].map(function(r){return h("tr",null,h("td",{text:r[0]}),h("td",{class:"rac-n",text:r[1]}),h("td",{class:"rac-n",text:r[2]}))})));
    root.appendChild(dscSecao("Lista e tabela","A tabela rola de lado no celular sem quebrar a página; números alinhados à direita.",h("div",{class:"rac-pilha"},ls,h("div",{class:"rac-tabela-rolo",tabindex:"0",role:"region","aria-label":"Tabela de exemplo"},tb))));
    /* ícones: os do menu, os mesmos desenhos (nada novo) */
    var ic=h("div",{class:"rac-grade"});RAC_ROTAS.filter(function(r){return r.grupo}).forEach(function(r){var s=h("span",{class:"rac-ico"});s.innerHTML=r.ico;ic.appendChild(h("div",{class:"rac-amostra"},s,h("span",{class:"rac-t-sec",text:r.titulo})))});
    root.appendChild(dscSecao("Ícones","Os desenhos do menu (contorno, traço 2 px, grade 24), reaproveitados sem biblioteca nova.",ic))}
