/* Cópia de js/app.js na main 95940e4 (antes da Fase 2 · A3): as listas de rotas e a função route(). Só para tests/rotas.test.mjs
   comparar o comportamento de antes com o de agora (registro de rotas em js/rotas.js). Não é carregado pelo site. */
  var tabs=["inicio","esportes","vagas","mercado","aniversarios","em-breve","x","estudos","mba","saude","conexoes","agenda","busca","sistema","resumo","lista","carreira","rede","documentos","eddie","olivia","veiculos","seguranca","painel","alimentacao","compras","fiscal","newsletter","rachoje","iacustos"];
  var DA_CASA=["mercado","alimentacao","compras","fiscal","lista","eddie","olivia","veiculos","documentos","rede","seguranca"];
  var sports=["central","beisebol","basquete","futebol-americano","futebol"],SP_CENTRAL=["central","futebol"];
  var ROTA_MODS={esportes:["esportes","esportes-central"],eddie:["familia"],olivia:["familia"],veiculos:["familia"],mba:["mba"],saude:["saude"],
    conexoes:["conexoes"],newsletter:["newsletter"],agenda:["sistema"],busca:["sistema"],sistema:["sistema"],lista:["lista"],carreira:["carreira"],documentos:["familia"],resumo:["resumo"],rede:["rede"],seguranca:["seguranca"],painel:["painel"],alimentacao:["alimentacao"],compras:["compras"],fiscal:["fiscal"],rachoje:["hoje"],iacustos:["iacustos"]};
  function route(){
    if(!PAPEL)return;
    var parts=(location.hash||"").replace("#","").split("/");
    if(parts[0]==="captura"){history.replaceState(history.state,"","#"+(isOwner()?"inicio":"lista"));setTimeout(function(){abrirCaptura()},300);parts=[isOwner()?"inicio":"lista"]}
    var top=tabs.indexOf(parts[0])<0?"inicio":parts[0];
    /* a esposa vê o Mercado, o Eddie, a Olivia e os Veículos; o resto leva ao Mercado */
    if(PAPEL==="casa"&&DA_CASA.indexOf(top)<0){top="mercado";parts=["mercado"]}
    var faltam=(ROTA_MODS[top]||[]).filter(function(n){return !MOD_OK[n]});
    if(faltam.length){precisa(faltam).then(route,function(e){logErro("módulo",e);var v=document.querySelector("#"+top+" .stack, #"+top);
      tabs.forEach(function(t){document.getElementById(t).hidden=(t!==top)});if(v)v.insertBefore(h("div",{class:"panel"},h("p",{class:"empty",text:"Não consegui abrir esta seção agora ("+e.message+"). Tente de novo."})),v.firstChild)});return}
    tabs.forEach(function(t){document.getElementById(t).hidden=(t!==top)});
    document.documentElement.setAttribute("data-sec",top);atuBotao();if(!ATU.rodando)atuAviso("");
    if(top!=="eddie"&&top!=="olivia"&&top!=="veiculos")fundoPagina(null);
    /* voltar ao Início em todas as páginas (a esposa não tem o Início) */
    $("#homebtn").hidden=top==="inicio"||PAPEL==="casa";
    /* Voltar no topo: volta pelo histórico quando ele é deste site; senão, sobe um nível (ex.: da candidatura para a Carreira) */
    marcarProfundidade();VOLTAR_PAI=parts.length>1&&parts[1]?"#"+parts[0]:(top==="inicio"?"":PAPEL==="casa"?"":"#inicio");
    $("#voltarbtn").hidden=!(PROF>0||VOLTAR_PAI);
    var vf=$(".voltarbtn");if(vf)vf.hidden=!(PROF>0||VOLTAR_PAI);   /* o ← flutuante (celular) segue a MESMA regra do voltar da barra de título: em todas as páginas, menos onde não há para onde voltar (Início) */
    setSide(false);
    window.scrollTo(0,0);
    if(top==="x"){var cat=xCats().some(function(c){return c.k===parts[1]})?parts[1]:"";sideMark(cat?"x/"+cat:"x","x");renderX(cat);return}
    if(top==="mercado"){sideMark("mercado","mercado");if(window.RACmercado)window.RACmercado.render(parts[1]||"",parts[2]||"");return}
    if(top==="inicio"){sideMark("inicio","inicio");renderInicio();return}
    if(top==="estudos"){sideMark("estudos","estudos");renderEstudos();return}
    if(top==="mba"){sideMark("mba","mba");renderMba(parts[1]);return}
    if(top==="documentos"){sideMark("documentos","documentos");renderFamilia("docs");return}
    if(top==="vagas")vgAlertas();
    if(top==="rede"){sideMark("rede","rede");renderRede();return}
    if(top==="carreira"){sideMark("carreira","carreira");renderCarreira(parts[1],parts[2]);return}
    if(top==="lista"){sideMark("lista","lista");renderLista(parts[1]);return}
    if(top==="agenda"){sideMark("agenda","agenda");renderAgenda();return}
    if(top==="resumo"){sideMark("resumo","resumo");renderResumo(parts[1],parts[2]);return}
    if(top==="painel"){sideMark("painel","painel");renderPainel(parts[1]);return}
    if(top==="alimentacao"){sideMark("alimentacao","alimentacao");renderAlimentacao(parts[1],parts[2]);return}
    if(top==="compras"){sideMark("compras","compras");renderCompras(parts[1],parts[2],parts[3]);return}
    if(top==="fiscal"){sideMark("fiscal","fiscal");renderFiscal();return}
    if(top==="rachoje"){sideMark("rachoje","rachoje");renderHoje();return}
    if(top==="iacustos"){sideMark("iacustos","iacustos");renderCustosIa();return}
    if(top==="busca"){sideMark("busca","busca");$("#ptitle").textContent="Busca";renderBusca(decodeURIComponent(parts.slice(1).join("/")||""));return}
    if(top==="sistema"){sideMark("sistema","sistema");renderSistema();return}
    if(top==="seguranca"){sideMark("seguranca","seguranca");renderSeguranca(parts[1]);return}
    if(top==="conexoes"){sideMark("conexoes","conexoes");renderConexoes(parts[1],decodeURIComponent(parts[2]||""));return}
    if(top==="newsletter"){sideMark("newsletter","newsletter");renderNewsletter(parts[1],decodeURIComponent(parts.slice(2).join("/")||""));return}
    if(top==="saude"){sideMark("saude","saude");renderSaude(parts[1]==="treino"?parts[2]:null);return}
    if(top==="eddie"||top==="olivia"){sideMark(top,top);renderFamilia(top);return}
    if(top==="veiculos"){sideMark("veiculos","veiculos");renderVeiculos(parts[1]);return}
    if(top!=="esportes"){sideMark(top,top);return}
    var sp=sports.indexOf(parts[1])<0?"central":parts[1],naCentral=SP_CENTRAL.indexOf(sp)>=0;
    ["central","beisebol","basquete","futebol-americano"].forEach(function(x){document.getElementById("sp-"+x).hidden=(x!==(naCentral?"central":sp))});
    var v=parts[2]||"";
    mark(".espnav a","v",sp==="beisebol"&&v==="dodgers"?"dodgers":sp);
    sideMark(sp==="central"?"esportes":"esportes/"+sp+(sp==="beisebol"&&v==="dodgers"?"/dodgers":""),"esportes");
    if(naCentral){renderCentral(sp);return}
    if(sp==="beisebol"){
      v=v||"liga";
      mark("#sp-beisebol .pills a","v",/^time-/.test(v)?"times":v);
      renderMlb(v)}
    else renderEspn(sp==="basquete"?"nba":"nfl",v)
  }
