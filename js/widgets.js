/* Dia a Dia RAC — catálogo de widgets do Workspace (Lote 1 do novo RAC; docs/planejamento/14-arquitetura-do-workspace.md, seção 4). Módulo leve, sem tela: o REGISTRO onde cada tipo de
   widget se inscreve (widgetRegistrar) e o contêiner do corpo de um widget com todos os estados tratados (carregando, vazio, erro, tempo esgotado). Acrescentar um widget é só registrar
   uma definição (js/widgets-base.js é o exemplo): o motor (nucleo.js, ws*) e a tela (js/workspace.js) não mudam. A definição é conferida por NUCLEO.wsDefValida antes de entrar.
   Um widget só DESENHA e LÊ pelo contrato de fontes (fonteLer) com a sessão de quem está vendo: o banco decide o que a pessoa pode ler. Ele nunca grava dado de negócio. */
  var WIDGETS={},WIDGETS_ERROS=[];
  function widgetRegistrar(def){
    var v=NUCLEO.wsDefValida(def);
    if(!v.ok){WIDGETS_ERROS.push({tipo:def&&def.tipo,erros:v.erros});try{console.warn("widget recusado: "+(def&&def.tipo)+" · "+v.erros.join("; "))}catch(e){}return false}
    WIDGETS[def.tipo]=def;return true}
  /* o catálogo, por categoria e nome */
  function widgetLista(){return Object.keys(WIDGETS).map(function(k){return WIDGETS[k]}).sort(function(a,b){return a.categoria.localeCompare(b.categoria)||a.titulo.localeCompare(b.titulo)})}
  /* o corpo de um widget: esqueleto enquanto lê; o que renderizar() devolve (elemento, {vazio:true,texto} ou uma promessa dos dois) vira o conteúdo; falha ou mais de 15 s vira
     um aviso com "Tentar de novo" dentro do próprio cartão (a falha de um widget nunca derruba a página nem os outros) */
  function widgetCorpo(def,item,ctx){
    var caixa=h("div",{class:"wk-corpo-in"},rkEstado("carregando","Carregando…")),fim=false,tmo=null;
    function mostrar(no){if(fim)return;fim=true;clearTimeout(tmo);caixa.innerHTML="";caixa.appendChild(no)}
    function erro(e){logErro("widget "+def.tipo,e);var b=rkBtn("sec","Tentar de novo");b.onclick=function(){if(caixa.parentNode)caixa.parentNode.replaceChild(widgetCorpo(def,item,ctx),caixa)};
      mostrar(rkEstado("erro","Não consegui carregar este componente"+(e&&e.message?" ("+String(e.message).slice(0,80)+")":"")+".",b))}
    function resolver(r){if(r&&r.vazio)return mostrar(rkEstado("vazio",r.texto||"Nada por aqui."));if(r&&r.nodeType)return mostrar(r);mostrar(rkEstado("vazio","Nada por aqui."))}
    tmo=setTimeout(function(){if(!fim)erro(new Error("demorou demais"))},15000);
    try{Promise.resolve(def.renderizar(ctx)).then(resolver,erro)}catch(e){erro(e)}
    return caixa}
