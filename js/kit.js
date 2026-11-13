/* Dia a Dia RAC — kit de componentes do Design System (Fase 3; docs/design-system.md). Módulo leve, sem tela, carregado sob demanda (MOD_DEPS) por quem
   desenha com o Design System: hoje (RAC Hoje, o piloto) e componentes (a página #componentes). Só monta elementos (h() da base) com as classes rac-* de
   css/rac.css: nada de banco, de regra de negócio nem de leitura de outra tela. Os dados chegam prontos de quem chama (as regras ficam no núcleo).
   Gráficos próprios daqui (medidor e comparação em pares) usam racDica; as colunas e barras vêm de js/graficos.js (rsColunas, rsBarras). */
  var RK_ICONE={ok:"✓",aviso:"⚠",erro:"✗",info:"i",neutro:"•"};
  /* selo de estado: ícone + palavra + cor, nunca só a cor */
  function rkSelo(tipo,texto){return h("span",{class:"rac-selo rac-selo--"+tipo},h("span",{"aria-hidden":"true",text:RK_ICONE[tipo]||"•"}),texto)}
  /* botão: tipo = pri, sec, ter, perigo, icone ou fantasma (sobre fundo azul); extra = atributos (disabled, aria-busy, aria-label…) */
  function rkBtn(tipo,texto,extra){var a={type:"button",class:"rac-btn rac-btn--"+tipo,text:texto};if(extra)Object.keys(extra).forEach(function(k){a[k]=extra[k]});return h("button",a)}
  function rkLink(tipo,texto,href){return h("a",{class:"rac-btn rac-btn--"+tipo,href:href,text:texto})}
  /* título de seção com rótulo pequeno em cima e ação opcional à direita */
  function rkSecao(rotulo,titulo,filhos,acao){
    var cab=h("div",{class:"rac-secao-cab"},h("div",null,rotulo?h("span",{class:"rac-t-rotulo",text:rotulo}):null,h("h2",{class:"rac-t-secao",text:titulo})),acao||null);
    return h("section",{class:"rac-secao","aria-label":titulo},cab,filhos)}
  /* cartão genérico: cabeçalho (título + ação), corpo, rodapé de origem; variantes: plano */
  function rkCard(titulo,filhos,opc){opc=opc||{};
    var c=h("div",{class:"rac-card"+(opc.variante?" rac-card--"+opc.variante:"")+(opc.classe?" "+opc.classe:"")});
    if(titulo||opc.acao)c.appendChild(h("div",{class:"rac-card-cab"},titulo?h("h3",{class:"rac-t-cartao",text:titulo}):null,opc.acao||null));
    if(opc.sub)c.appendChild(h("p",{class:"rac-t-sec",style:"margin:0",text:opc.sub}));
    c.appendChild(filhos);if(opc.origem)c.appendChild(h("div",{class:"rac-card-rod rac-t-legenda",text:opc.origem}));return c}
  /* variação com seta: pct positivo ou negativo; pior = "alta" quando subir é ruim (gasto) ou "queda" quando cair é ruim (prontidão) */
  function rkDelta(pct,pior,textoExtra){
    if(pct==null||!isFinite(pct))return null;
    var zero=pct===0,sobe=pct>0,ruim=pior==="alta"?sobe:pior==="queda"?!sobe:false,tipo=zero?"neutro":(pior?(ruim?"aviso":"ok"):"neutro");
    return h("span",{class:"rac-delta rac-delta--"+tipo,title:"Variação"},zero?null:h("span",{"aria-hidden":"true",text:sobe?"▲":"▼"}),(zero?"igual":(sobe?"+":"−")+Math.abs(pct)+"%")+(textoExtra?" "+textoExtra:""))}
  /* indicador principal/secundário: {rotulo, valor, delta (nó de rkDelta), apoio, href, destaque, sec, alerta, meter (nó)}; com href vira link para o módulo */
  function rkKpi(o){
    var el=h(o.href?"a":"div",o.href?{class:"rac-kpi",href:o.href}:{class:"rac-kpi"});
    el.className="rac-kpi"+(o.destaque?" rac-kpi--destaque":"")+(o.sec?" rac-kpi--sec":"")+(o.alerta?" rac-kpi--alerta":"");
    el.appendChild(h("span",{class:"rac-t-rotulo",text:o.rotulo}));
    el.appendChild(h("div",{class:"rac-kpi-v"},h("b",{class:"rac-t-num",text:String(o.valor)}),o.delta||null));
    if(o.meter)el.appendChild(o.meter);
    if(o.apoio)el.appendChild(h("span",{class:"rac-kpi-apoio",text:o.apoio}));
    return el}
  /* alerta: tipo = aviso, erro, ok ou info; acao = nó opcional (botão ou link) */
  function rkAlerta(tipo,titulo,texto,acao){
    return h("div",{class:"rac-alerta rac-alerta--"+tipo,role:tipo==="erro"?"alert":"status"},h("span",{class:"rac-alerta-ico","aria-hidden":"true",text:RK_ICONE[tipo]||"i"}),
      h("div",{class:"rac-alerta-corpo"},h("b",{class:"rac-t-cartao",text:titulo}),texto?h("span",{class:"rac-t-sec",text:texto}):null,acao||null))}
  /* atalho para um módulo: {href, titulo, sub, ico (svg do registro de rotas)} */
  function rkAtalho(o){var ic=h("span",{class:"rac-atalho-ico","aria-hidden":"true"});if(o.ico)ic.innerHTML=o.ico;
    return h("a",{class:"rac-atalho",href:o.href},ic,h("span",{class:"rac-atalho-txt"},h("b",{class:"rac-t-cartao",text:o.titulo}),o.sub?h("span",{class:"rac-t-legenda",text:o.sub}):null))}
  /* informação contextual (tempo, jogo, destaque): ícone + título + texto; com href, o título é link */
  function rkInfo(ico,titulo,texto,href){
    var t=href?h("a",{href:href,class:"rac-t-cartao",text:titulo}):h("b",{class:"rac-t-cartao",text:titulo});
    return h("div",{class:"rac-info"},h("span",{class:"rac-info-ico","aria-hidden":"true",text:ico}),h("div",{class:"rac-info-corpo"},t,texto?h("span",{class:"rac-t-sec",text:texto}):null))}
  /* lista: linhas {titulo, sub, meta (texto ou nó), href, marca (alta, media, ok, info)}; linha com href é link inteiro */
  function rkLista(linhas,leve){
    return h("ul",{class:"rac-lista"+(leve?" rac-lista--leve":"")},linhas.map(function(l){
      var corpo=[l.marca?h("span",{class:"rac-marca rac-marca--"+l.marca,"aria-hidden":"true"}):null,h("span",{class:"rac-linha-corpo"},h("b",{class:"rac-t-cartao",text:l.titulo}),l.sub?h("span",{class:"rac-t-sec",text:l.sub}):null),
        l.meta?h("span",{class:"rac-linha-meta"},l.meta):null];
      var ok=l.href&&String(l.href).charAt(0)==="#";
      return h("li",null,ok?h("a",{class:"rac-linha-item",href:l.href},corpo):h("div",{class:"rac-linha-item"},corpo))}))}
  /* recolher: <details> com resumo na linha e o detalhe técnico escondido até pedir */
  function rkRecolher(titulo,resumo,filhos,aberto){
    var d=h("details",{class:"rac-recolher"},h("summary",null,h("span",{text:titulo}),resumo||null),h("div",{class:"rac-recolher-corpo"},filhos));if(aberto)d.setAttribute("open","");return d}
  /* estado de interface: carregando (esqueleto), vazio, erro, ok (sucesso) ou aviso (atenção); acao = botão opcional */
  function rkEstado(tipo,texto,acao){
    if(tipo==="carregando")return h("div",{class:"rac-estado",role:"status","aria-busy":"true"},h("div",{class:"rac-esqueleto","aria-hidden":"true"},h("i"),h("i"),h("i")),h("span",{class:"rac-t-sec",text:texto||"Carregando…"}));
    var ic={erro:"✗ ",ok:"✓ ",aviso:"⚠ "}[tipo]||"";
    return h("div",{class:"rac-estado"+(ic?" rac-estado--"+tipo:""),role:tipo==="erro"?"alert":"status"},h("span",{class:"rac-t-texto",text:ic+texto}),acao||null)}
  /* campo de formulário: rótulo sempre visível, ajuda abaixo e erro no próprio campo (o que foi digitado não se apaga) */
  function rkCampo(rotulo,id,opc){opc=opc||{};
    var ajId=id+"-aj",inp=h("input",{class:"rac-campo-entrada",id:id,type:"text","aria-describedby":opc.ajuda||opc.erro?ajId:null,"aria-invalid":opc.erro?"true":null,disabled:opc.desligado?"disabled":null});
    if(opc.valor)inp.value=opc.valor;
    return h("div",{class:"rac-campo"+(opc.erro?" rac-campo--erro":"")},h("label",{class:"rac-campo-rotulo","for":id,text:rotulo}),inp,opc.erro||opc.ajuda?h("span",{class:"rac-campo-ajuda",id:ajId,text:(opc.erro?"✗ ":"")+(opc.erro||opc.ajuda)}):null)}
  /* medidor (ex.: orçamento do mês): usado em %, com a projeção como marca; passa de 100 → aviso, de 120 → erro; clicável (racDica) */
  function rkMedidor(pct,proj,rotulo,dicaTxt){
    var u=Math.max(0,Math.min(100,pct)),cls="rac-medidor"+(pct>=120?" rac-medidor--erro":pct>=100?" rac-medidor--aviso":"");
    var fio=h("span",{class:"rac-medidor-fio"},h("span",{class:"rac-medidor-barra",style:"width:"+u+"%"})),tr=h("button",{type:"button",class:"rac-medidor-trilho","aria-label":rotulo+": "+pct+"%"+(proj!=null?", projeção "+proj+"%":"")},fio);
    if(proj!=null)fio.appendChild(h("span",{class:"rac-medidor-proj",style:"left:calc("+Math.max(0,Math.min(100,proj))+"% - 1px)"}));
    racDica.ligar(tr,function(){return [rotulo+": "+pct+"%",dicaTxt||(proj!=null?"projeção do mês: "+proj+"%":"")]});
    return h("div",{class:cls},tr)}
  /* comparação em pares (atual × anterior) por categoria: [{nome, atual, anterior, txtAtual, txtAnterior}]; barras na mesma escala; clicável (racDica) */
  function rkComparar(linhas,rotAtual,rotAnterior){
    var mx=Math.max.apply(null,linhas.map(function(l){return Math.max(l.atual||0,l.anterior||0)}).concat([0]))||1;
    function barra(v,txt,ant){return h("div",{class:"rac-comp-barra"},h("span",{class:"rac-comp-trilho"},h("span",{class:"rac-comp-f"+(ant?" rac-comp-f--ant":""),style:"width:"+(v>0?Math.max(2,v/mx*100):0).toFixed(1)+"%"})),h("span",{class:"rac-comp-v",text:txt}))}
    var corpo=h("div",{class:"rac-comp"},linhas.map(function(l){
      var b=h("button",{type:"button",class:"rac-comp-linha","aria-label":l.nome+": "+rotAtual+" "+l.txtAtual+", "+rotAnterior+" "+l.txtAnterior},h("span",{class:"rac-comp-nome"},h("span",{text:l.nome})),
        h("span",{class:"rac-comp-par"},barra(l.atual||0,l.txtAtual,false),barra(l.anterior||0,l.txtAnterior,true)));
      racDica.ligar(b,function(){return [l.nome,rotAtual+" "+l.txtAtual+" · "+rotAnterior+" "+l.txtAnterior]});return b}));
    return h("div",{class:"rac-pilha",style:"gap:12px"},h("div",{class:"rac-legenda rac-t-legenda"},h("span",null,h("i"),rotAtual),h("span",null,h("i",{class:"ant"}),rotAnterior)),corpo)}
