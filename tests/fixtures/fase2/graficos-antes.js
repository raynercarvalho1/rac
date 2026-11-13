/* Cópia de js/resumo.js na main 95940e4 (antes da Fase 2 · A2): RS_MESES e os gráficos rs*. Usada por tests/graficos.test.mjs para provar que o código movido é o mesmo. */
  var RS_MESES=["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  /* colunas no padrão do site: valor fixo em cima, dia embaixo, toque mostra o cartão destacado */
  function rsColunas(B,vals,curto,dica){var mx=Math.max.apply(null,vals.concat([0]))||1;
    var vb=h("div",{class:"vbars vbpeso rsvb"},B.map(function(b,i){var v=vals[i]||0;
      var c=h("button",{type:"button",class:"vb","aria-label":b.nome+": "+(v?curto(v):"nada")},h("span",{class:"vbv",text:v?curto(v):"–"}),
        h("span",{class:"vbt"},h("span",{class:"vbf",style:"height:"+(v?Math.max(2,v/mx*100):0).toFixed(1)+"%"})),vbRotulo(b.cima,b.baixo));
      racDica.ligar(c,function(){return dica(i,v)});return c}));
    vbFim(vb);return vb}
  /* barras deitadas: nome, barra e valor; com href viram link */
  function rsBarras(L){var mx=Math.max.apply(null,L.map(function(x){return x.v}).concat([0]))||1;
    return h("div",{class:"hbars"},L.map(function(x){var b=h(x.href?"a":"button",x.href?{class:"hb",href:x.href}:{type:"button",class:"hb"},
      h("span",{class:"hbl"},x.nome,x.sub?h("small",{text:x.sub}):null),h("span",{class:"hbt"},h("span",{class:"hbf",style:"width:"+Math.max(2,x.v/mx*100).toFixed(1)+"%"})),h("span",{class:"hbv",text:x.txt}));
      racDica.ligar(b,function(){return [x.nome,x.dica||x.txt]});return b}))}
  function rsKpis(L){return h("div",{class:"kgasto"},L.filter(function(x){return x&&x[1]!=null&&x[1]!==""}).map(function(x){return h("div",null,h("span",{class:"kl",text:x[0]}),h("b",{class:"kv",text:String(x[1])}))}))}
  /* tabela em que a linha inteira leva a outra tela */
  function rsTabela(cols,linhas){var tb=h("table",{class:"famtab rstab"});tb.appendChild(h("thead",null,h("tr",null,cols.map(function(c){return h("th",{text:c})}))));
    var bd=h("tbody");linhas.forEach(function(l){var tr=h("tr",l.href?{class:"clic",tabindex:"0"}:null,l.c.map(function(c){return h("td",null,c==null?"":c)}));
      if(l.href){tr.onclick=function(e){if(!e.target.closest("a"))location.hash=l.href};tr.onkeydown=function(e){if(e.key==="Enter")location.hash=l.href}}bd.appendChild(tr)});
    tb.appendChild(bd);return h("div",{class:"famtabw"},tb)}
