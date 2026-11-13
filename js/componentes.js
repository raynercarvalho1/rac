/* Dia a Dia RAC — módulo carregado quando a seção abre. Componentes (#componentes): página interna SÓ DO DONO, sem item no menu, que mostra o Design System
   definitivo (Fase 3, direção "RAC Modern Workspace"; docs/design-system.md): identidade, tipografia, cartões por função, gráficos, navegação, botões,
   selos, estados, campos, lista e tabela. Todo exemplo é ilustrativo e marcado como tal; nada aqui lê ou grava dado, nenhuma IA é chamada e nenhum outro
   módulo depende deste. Os componentes vêm de js/kit.js e os gráficos de js/graficos.js (os mesmos que o RAC Hoje usa). */
  /* cada bloco de exemplo fica numa bandeja plana (papel 2), para os cartões de exemplo (papel) se destacarem dela */
  function dscBloco(rotulo,titulo,filhos,acao){return h("div",{class:"rac-card rac-card--plano"},rkSecao(rotulo,titulo,filhos,acao))}
  function dscCores(lista){var g=h("div",{class:"rac-grade"});lista.forEach(function(c){g.appendChild(h("div",{class:"rac-pilha",style:"gap:4px"},h("div",{class:"rac-cor",style:"background:var("+c[0]+")"}),h("span",{class:"rac-t-sec",text:c[1]}),h("code",{class:"rac-t-mono",text:c[0]})))});return g}
  function renderComponentes(){var root=$("#componentes-view");root.innerHTML="";
    if(!isOwner()){root.appendChild(h("div",{class:"panel"},h("p",{class:"empty",text:"Esta página é só da conta do dono."})));return}
    $("#ptitle").textContent="Componentes";
    var pg=h("div",{class:"rh"});root.appendChild(pg);
    function bloco(x,larg){var d=h("div",{class:larg?"rh-largo":null},x);pg.appendChild(d);return d}
    /* abertura */
    pg.appendChild(h("section",{class:"rh-hero","aria-label":"Design System RAC"},h("div",null,h("h2",{text:"RAC Modern Workspace"}),h("p",{class:"rh-hero-data",text:"Design System RAC · Fase 3"}),
      h("p",{class:"rh-hero-resumo",text:"Estrutura de aplicativo de produtividade, acabamento de analytics minimalista e gráficos de painel analítico, com o azul Dodger como identidade e o tema claro como padrão. Esta página é só para conferir: os exemplos são ilustrativos."})),
      h("div",{class:"rh-hero-acoes"},rkLink("fantasma","Ver o RAC Hoje (piloto)","#rachoje")),h("div",{class:"rh-hero-ctx"},h("span",{class:"rh-chip",text:"Tema claro padrão"}),h("span",{class:"rh-chip",text:"Escuro funcional"}),h("span",{class:"rh-chip",text:"Alvo de toque 44 px"}))));
    /* identidade */
    bloco(dscBloco("Fundamentos","Cores",dscCores([["--rac-dodger","Azul Dodger (marca, ação principal)"],["--rac-dodger-forte","Dodger forte (pressionado)"],["--rac-dodger-claro","Dodger claro (texto no escuro)"],["--rac-vermelho","Vermelho (urgente, ao vivo)"],["--rac-prata","Prata (comparação, detalhe)"],
      ["--rac-ok-fill","Sucesso"],["--rac-aviso-fill","Atenção"],["--rac-erro-fill","Erro"],["--rac-azul-suave","Tinta azul (item ativo)"],["--rac-papel","Papel (cartão)"],["--rac-papel-2","Papel 2 (área interna)"],["--rac-papel-3","Papel 3 (trilho de gráfico)"]])),true);
    var tp=h("div",{class:"rac-grade"});
    [["Número grande","rac-t-num-g","R$ 1.240"],["Número de indicador","rac-t-num","853,60"],["Título da página","rac-t-pagina","Título da página"],["Título de seção","rac-t-secao","Título de seção"],["Título de cartão","rac-t-cartao","Título de cartão"],["Texto","rac-t-texto","Texto corrido, a leitura principal."],["Secundário","rac-t-sec","Apoio e ajuda"],["Rótulo","rac-t-rotulo","Rótulo de seção"],["Dado técnico","rac-t-mono","a1b2c3 · 12:30"]].forEach(function(t){
      tp.appendChild(h("div",{class:"rac-pilha",style:"gap:2px"},h("span",{class:"rac-t-legenda",text:t[0]+" · "+t[1]}),h("div",{class:t[1],text:t[2]})))});
    bloco(dscBloco("Fundamentos","Tipografia",tp),true);
    /* indicadores e cartões por função */
    bloco(dscBloco("Cartões por função","Indicadores",h("div",{class:"rh-kpis"},
      rkKpi({rotulo:"Indicador principal",valor:"R$ 853,60",delta:rkDelta(12,"alta","vs. mês passado"),apoio:"Exemplo: valor, variação e apoio",href:"#componentes"}),
      rkKpi({rotulo:"Com medidor",valor:"43%",meter:rkMedidor(43,98,"Exemplo de orçamento","projeção do mês: 98%"),apoio:"Projeção como marca"}),
      rkKpi({rotulo:"Alerta",valor:"2",alerta:true,apoio:"Número em vermelho só quando urgente"}),
      rkKpi({rotulo:"Secundário",valor:"48",sec:true,apoio:"Menos peso visual"}))),true);
    var cf=h("div",{class:"rh-dois"});
    cf.appendChild(h("div",{class:"rac-pilha"},rkAlerta("aviso","Alerta","Faixa lateral, ícone e palavra; nunca só a cor.",rkBtn("sec","Ver")),rkAlerta("erro","Erro","Algo falhou e o que fazer."),rkAlerta("ok","Sucesso","Salvo e conferido."),rkAlerta("info","Informação","Contexto que não pede ação.")));
    cf.appendChild(h("div",{class:"rac-pilha"},rkAtalho({href:"#rachoje",titulo:"Atalho de módulo",sub:"Ícone, nome e dica",ico:(RAC_ROTAS.filter(function(r){return r.id==="rachoje"})[0]||{}).ico}),
      rkInfo("⛅","Informação contextual","Tinta suave com ícone, para tempo, jogo ou destaque."),
      rkCard("Resumo",h("p",{class:"rac-t-texto",style:"margin:0",text:"Cartão genérico: título, corpo e rodapé de origem."}),{acao:rkLink("ter","Ver tudo","#componentes"),origem:"Fonte: exemplo · atualizado há 2 h"})));
    bloco(dscBloco("Cartões por função","Alerta, atalho, informação e resumo",cf),true);
    /* lista e comparação e gráficos */
    var lc=h("div",{class:"rh-dois"});
    lc.appendChild(rkCard("Lista",rkLista([{titulo:"Linha que leva a um módulo",sub:"atrasado há 2 dias · vencido",marca:"alta",meta:rkSelo("erro","Alta"),href:"#componentes"},{titulo:"Prioridade média",sub:"amanhã",marca:"media",meta:rkSelo("aviso","Média"),href:"#componentes"},{titulo:"Sem destino",sub:"linha informativa",meta:rkSelo("neutro","Baixa")}]),{sub:"Linha inteira clicável quando leva a outro módulo; marca lateral de prioridade."}));
    lc.appendChild(rkCard("Comparação",h("div",{class:"rac-grafico"},rkComparar([{nome:"Categoria A",atual:500,anterior:730,txtAtual:"R$ 500,00",txtAnterior:"R$ 730,00"},{nome:"Categoria B",atual:113,anterior:120,txtAtual:"R$ 113,00",txtAnterior:"R$ 120,00"}],"Este mês","Mês passado")),{sub:"Atual × anterior na mesma escala; toque para ver os valores."}));
    bloco(lc,true);
    var gr=h("div",{class:"rh-dois"}),B=[1,2,3,4,5,6,7].map(function(i){return {nome:"0"+i+"/11",cima:"0"+i+"/11",baixo:""}}),V=[5200,7800,6100,9300,8400,4900,7000];
    gr.appendChild(rkCard("Colunas (evolução)",h("div",{class:"rac-grafico"},rsColunas(B,V,function(v){return NUCLEO.iaNum(v,0)},function(i,v){return [B[i].nome,NUCLEO.iaNum(v,0)+" (exemplo)"]})),{sub:"Do kit js/graficos.js: valor fixo em cada coluna e dica ao tocar."}));
    gr.appendChild(rkCard("Barras (distribuição)",h("div",{class:"rac-grafico"},rsBarras([{nome:"Tipo A",v:6,txt:"6",dica:"6 (exemplo)"},{nome:"Tipo B",v:3,txt:"3",dica:"3 (exemplo)"},{nome:"Tipo C",v:1,txt:"1",dica:"1 (exemplo)"}])),{sub:"Barras deitadas, ordenadas, com valor ao lado."}));
    bloco(gr,true);
    /* navegação */
    var nv=h("div",{class:"rac-pilha"});RAC_AREAS.forEach(function(a){var its=RAC_ROTAS.filter(function(r){return r.grupo&&r.area===a[0]});
      nv.appendChild(h("div",{class:"rac-pilha",style:"gap:6px"},h("span",{class:"rac-t-rotulo",text:a[1]}),h("div",{class:"rac-linha-flex"},its.map(function(r){var ic=h("span",{class:"rac-ico"});ic.innerHTML=r.ico;return h("a",{class:"rac-chip",href:"#"+r.id,style:"gap:8px"},ic,r.titulo)}))))});
    bloco(dscBloco("Navegação","Áreas do menu",nv),true);
    /* controles */
    bloco(dscBloco("Controles","Botões",h("div",{class:"rac-linha-flex"},rkBtn("pri","Salvar"),rkBtn("sec","Editar"),rkBtn("ter","Ver tudo"),rkBtn("perigo","Excluir"),rkBtn("icone","↻",{"aria-label":"Atualizar"}),rkBtn("pri","Desligado",{disabled:"disabled"}),rkBtn("sec","Ocupado",{"aria-busy":"true"}))),true);
    var ch=h("div",{class:"rac-linha-flex"});["Todos","Casa","Finanças"].forEach(function(t,i){var b=h("button",{type:"button",class:"rac-chip","aria-pressed":i===0?"true":"false",text:t});b.onclick=function(){Array.prototype.forEach.call(ch.children,function(x){x.setAttribute("aria-pressed",x===b?"true":"false")})};ch.appendChild(b)});
    bloco(dscBloco("Controles","Chips (selecionado) e selos (estado)",h("div",{class:"rac-pilha"},ch,h("div",{class:"rac-linha-flex"},rkSelo("ok","Em dia"),rkSelo("aviso","Atrasado"),rkSelo("erro","Falhou"),rkSelo("info","Novo"),rkSelo("neutro","Sem dado")))),true);
    bloco(dscBloco("Estados","Carregando, vazio, erro, sucesso e atenção",h("div",{class:"rac-grade"},rkEstado("carregando"),rkEstado("vazio","Nada por aqui ainda. Toque em Criar para começar.",rkBtn("sec","Criar")),rkEstado("erro","Não consegui carregar agora.",rkBtn("sec","Tentar de novo")),rkEstado("ok","Salvo com sucesso."),rkEstado("aviso","Dados de 3 dias atrás."))),true);
    bloco(dscBloco("Formulários","Campos",h("div",{class:"rac-grade"},rkCampo("Nome","dsc-c1",{ajuda:"Como aparece nas listas."}),rkCampo("Valor","dsc-c2",{erro:"Informe um número maior que zero.",valor:"valor digitado, mantido"}),rkCampo("Desligado","dsc-c3",{desligado:true,valor:"somente leitura"}))),true);
    var tb=h("table",{class:"rac-tabela"},h("thead",null,h("tr",null,h("th",{text:"Mês"}),h("th",{class:"rac-n",text:"Gasto"}),h("th",{class:"rac-n",text:"Variação"}))),
      h("tbody",null,[["Setembro","R$ 1.110,00","+4%"],["Outubro","R$ 1.180,00","+6%"],["Novembro","R$ 1.240,00","+12%"]].map(function(r){return h("tr",null,h("td",{text:r[0]}),h("td",{class:"rac-n",text:r[1]}),h("td",{class:"rac-n",text:r[2]}))})));
    bloco(dscBloco("Dados","Tabela e detalhe recolhido",h("div",{class:"rac-pilha"},h("div",{class:"rac-tabela-rolo",tabindex:"0",role:"region","aria-label":"Tabela de exemplo"},tb),
      rkRecolher("Detalhe técnico sob demanda",rkSelo("neutro","exemplo"),h("p",{class:"rac-t-sec",style:"margin:0",text:"O que é técnico fica recolhido; o resumo fica na linha."})))),true);
    var ic=h("div",{class:"rac-grade"});RAC_ROTAS.filter(function(r){return r.grupo}).forEach(function(r){var s=h("span",{class:"rac-ico"});s.innerHTML=r.ico;ic.appendChild(h("div",{class:"rac-amostra"},s,h("span",{class:"rac-t-sec",text:r.titulo})))});
    bloco(dscBloco("Fundamentos","Ícones",ic),true)}
