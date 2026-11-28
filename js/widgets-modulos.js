/* Dia a Dia RAC — widgets dos módulos para a Minha Casa (Lote 2 do novo RAC; docs/planejamento/14-arquitetura-do-workspace.md, "Minha Casa: catálogo de widgets").
   Os módulos Hoje, Saúde e Compras entram no MESMO catálogo do Workspace (js/widgets.js) como pedaços resumidos, cada um com finalidade, dados, configuração, estado vazio e
   um caminho para a tela original (que continua dona das funções completas). Regras:
   · só LÊ: pelo contrato de fontes (agenda, saúde) ou pelas mesmas tabelas que o módulo já lê (compras, lista), com a sessão de quem vê: o banco decide o que a pessoa pode ler (RLS);
   · nenhuma cópia de dado, nenhuma tabela nova, nenhuma escrita; abrir o original é só um link "#rota";
   · a configuração é da INSTÂNCIA (config do item no layout), nunca da posição: o mesmo tipo pode entrar várias vezes com ajustes diferentes;
   · Saúde é privada (compartilhavel:false, só do dono): o motor recusa em espaço compartilhado ANTES de ler e o banco só devolve as linhas do próprio dono (RLS de garmin_dia e garmin_ativ);
   · as contas são funções puras do núcleo (NUCLEO.wsPeriodo, wm*), testadas em tests/workspace_casa_nucleo.test.mjs.
   Depende de js/widgets.js, do kit, dos gráficos e das fontes Agenda e Saúde. */
  var WM={compras:{}};
  function wmReais(v){return NUCLEO.hojeReais(v)}
  function wmData(iso){return String(iso).slice(8,10)+"/"+String(iso).slice(5,7)}
  function wmMasc(){try{return !!NUCLEO.sauPrefs(PESSOAL.saudePrefs).ocultar}catch(e){return false}}
  function wmMaisLink(txt,href){return h("div",{class:"wm-mais"},rkLink("ter",txt,href))}
  function wmNum(v,d){var f=Math.pow(10,d||0);return (Math.round(v*f)/f).toLocaleString("pt-BR",{maximumFractionDigits:d||0})}
  var WM_PERIODOS=[{valor:"hoje",rotulo:"Hoje"},{valor:"7d",rotulo:"7 dias"},{valor:"30d",rotulo:"30 dias"},{valor:"mes",rotulo:"Este mês"},{valor:"12m",rotulo:"12 meses"}];
  /* ---------- HOJE ---------- */
  /* tarefas abertas da Lista da casa (tipo "tarefa", sem feito): a mesma tabela da tela Lista, só leitura */
  function wmTarefas(limite){return Promise.resolve().then(function(){return SB.from("lista").select("id,item,criado").eq("tipo","tarefa").eq("feito",false).order("criado",{ascending:true}).limit(limite||50)}).then(sbOk)}
  widgetRegistrar({tipo:"hoje.resumo",icone:"☀️",versao:1,titulo:"Resumo do dia",categoria:"Hoje",dominio:"hoje",compartilhavel:false,exige:{modulo:"agenda",dono:true},
    descricao:"Quantos compromissos você tem hoje, amanhã e na semana, mais as tarefas abertas e o que está marcado para hoje.",
    tamanhos:{min:[4,0],padrao:[12,0],max:[12,6]},acoes:[{rotulo:"Abrir o RAC Hoje",rota:"#rachoje"}],
    config:[{chave:"itens",rotulo:"Itens de hoje a mostrar",tipo:"numero",min:0,max:6,padrao:3},{chave:"tarefas",rotulo:"Contar as tarefas abertas",tipo:"booleano",padrao:true}],
    renderizar:function(ctx){var hoje=hojeISO();
      return precisa(["fonte-agenda"]).then(function(){return Promise.all([ctx.ler("agenda"),ctx.config.tarefas?wmTarefas(50).then(function(l){return l.length},function(){return null}):Promise.resolve(null)])}).then(function(r){
        var c=r[0],nt=r[1],d=NUCLEO.wmDiaResumo(c.v||[],hoje);
        var kpis=h("div",{class:"wm-kpis"},
          rkKpi({rotulo:"Hoje",valor:d.hoje.length,apoio:d.hoje.length===1?"compromisso":"compromissos",href:"#agenda",destaque:true}),
          rkKpi({rotulo:"Amanhã",valor:d.amanha,apoio:d.amanha===1?"item":"itens",href:"#agenda",sec:true}),
          rkKpi({rotulo:"Próximos 7 dias",valor:d.semana,apoio:d.semana===1?"item":"itens",href:"#agenda",sec:true}),
          nt==null?null:rkKpi({rotulo:"Tarefas abertas",valor:nt>=50?"50+":nt,apoio:nt===1?"tarefa":"tarefas",href:"#lista/tarefas",sec:true}));
        var corpo=h("div",{class:"rac-pilha"},kpis),n=ctx.config.itens;
        if(n>0&&d.hoje.length)corpo.appendChild(rkLista(d.hoje.slice(0,n).map(function(e){return {titulo:e.t,sub:e.sub||"",href:e.href}}),true));
        else if(!d.hoje.length&&!d.amanha&&!d.semana&&!nt)return {vazio:true,texto:"Nada marcado para os próximos dias e nenhuma tarefa aberta. Um dia livre."};
        else if(!d.hoje.length)corpo.appendChild(h("p",{class:"rac-t-sec",text:"Nada marcado para hoje."}));
        if(c.parcial)corpo.appendChild(h("p",{class:"rac-t-legenda",text:"Parte da Agenda não pôde ser lida agora; os números podem estar incompletos."}));
        return corpo})}});
  widgetRegistrar({tipo:"hoje.tarefas",icone:"✅",versao:1,titulo:"Tarefas da casa",categoria:"Hoje",dominio:"lista",compartilhavel:false,exige:{modulo:"lista",dono:true},
    descricao:"As tarefas abertas da Lista, da mais antiga para a mais nova. Marcar como feita continua na Lista.",
    tamanhos:{min:[3,0],padrao:[6,0],max:[12,8]},acoes:[{rotulo:"Abrir as tarefas",rota:"#lista/tarefas"}],
    config:[{chave:"limite",rotulo:"No máximo quantas tarefas",tipo:"numero",min:1,max:15,padrao:5}],
    renderizar:function(ctx){return wmTarefas(ctx.config.limite).then(function(l){
      if(!l.length)return {vazio:true,texto:"Nenhuma tarefa aberta."};
      return h("div",{class:"rac-pilha"},rkLista(l.map(function(t){return {titulo:t.item,href:"#lista/tarefas"}}),true),wmMaisLink("Abrir a Lista","#lista/tarefas"))})}});
  /* ---------- SAÚDE (privada: só do dono, nunca em espaço compartilhado) ---------- */
  /* uma leitura só para os widgets de indicadores e de evolução: 70 dias (a base de comparação da prontidão) e os treinos das últimas 5 semanas; leituras iguais e simultâneas dividem a consulta (fonte-saude) */
  function wmSaude(ctx){var hoje=hojeISO();
    return precisa(["fonte-saude"]).then(function(){return ctx.ler("saude",{desdeDias:NUCLEO.somaDiasISO(hoje,-70),desdeAtiv:NUCLEO.somaDiasISO(hoje,-35),colsDia:"data,dados,atualizado"})})}
  function wmSemSaude(c){return c.vazio||!c.v||(!(c.v.dias||[]).length&&!(c.v.ativs||[]).length)}
  var WM_IND={sono:{rot:"Sono",un:"h",dec:1,melhor:"alta"},passos:{rot:"Passos por dia",un:"",dec:0,melhor:"alta"},vfc:{rot:"Variabilidade cardíaca",un:"ms",dec:0,melhor:"alta"},fc:{rot:"Batimentos em repouso",un:"bpm",dec:0,melhor:"baixa"},estresse:{rot:"Estresse médio",un:"pts",dec:0,melhor:"baixa"}};
  widgetRegistrar({tipo:"saude.indicadores",icone:"❤️",versao:1,titulo:"Saúde: indicadores da semana",categoria:"Saúde",dominio:"saude",compartilhavel:false,exige:{modulo:"saude",dono:true},
    descricao:"A média dos últimos 7 dias dos indicadores do relógio que você escolher, comparada à semana anterior. Só do seu espaço pessoal.",
    tamanhos:{min:[4,0],padrao:[6,0],max:[12,6]},acoes:[{rotulo:"Abrir a Saúde",rota:"#saude"}],
    config:[{chave:"indicadores",rotulo:"Indicadores",tipo:"selecao",multiplo:true,max:4,padrao:["sono","passos","vfc"],opcoes:Object.keys(WM_IND).map(function(k){return {valor:k,rotulo:WM_IND[k].rot}})},
      {chave:"treinos",rotulo:"Mostrar os treinos da semana",tipo:"booleano",padrao:true}],
    renderizar:function(ctx){var hoje=hojeISO();
      return wmSaude(ctx).then(function(c){if(wmSemSaude(c))return {vazio:true,texto:"Ainda não há dados do relógio. Sincronize pela Saúde."};
        var r=NUCLEO.sauResumoSemana(c.v.dias||[],c.v.ativs||[],hoje);if(r.semDados)return {vazio:true,texto:"Poucos dias com dados nesta semana ("+r.diasComDado+" de 7). Os números aparecem com pelo menos 4 dias."};
        var mask=wmMasc(),ks=(ctx.config.indicadores||[]).filter(function(k){return WM_IND[k]}),corpo=h("div",{class:"rac-pilha"}),g=h("div",{class:"wm-kpis"});
        ks.forEach(function(k){var m=WM_IND[k],a=r.atual[k],b=r.anterior[k];if(!a||a.m==null)return;
          var pct=b&&b.m?Math.round((a.m-b.m)/b.m*100):null,pior=pct==null||pct===0?null:(m.melhor==="alta"?"queda":"alta");
          g.appendChild(rkKpi({rotulo:m.rot,valor:mask?"•••":wmNum(a.m,m.dec)+(m.un?" "+m.un:""),delta:mask?null:rkDelta(pct,pior),apoio:"média de "+a.n+(a.n===1?" dia":" dias"),href:"#saude",sec:true}))});
        if(g.childNodes.length)corpo.appendChild(g);
        if(ctx.config.treinos)corpo.appendChild(h("p",{class:"rac-t-sec",text:mask?"Treinos nos 7 dias: valor oculto nos Ajustes da Saúde.":r.treinos.n+(r.treinos.n===1?" treino":" treinos")+" nos últimos 7 dias"+(r.treinos.n?" · "+r.treinos.min+" min":"")+" (caminhada não conta)."}));
        if(!g.childNodes.length&&!ctx.config.treinos)return {vazio:true,texto:"Escolha ao menos um indicador em Configurar."};
        if(c.v.atualizado)corpo.appendChild(h("p",{class:"rac-t-legenda",text:"Último dia com dados: "+dataBR(c.ultimo||hoje)+(c.parcial?" · leitura parcial":"")}));
        return corpo})}});
  widgetRegistrar({tipo:"saude.atividades",icone:"🏃",versao:1,titulo:"Saúde: atividades recentes",categoria:"Saúde",dominio:"saude",compartilhavel:false,exige:{modulo:"saude",dono:true},
    descricao:"As atividades mais recentes do relógio, com tipo, data, distância e duração (as mesmas do RAC Hoje). Toque para ver o treino e o mapa.",
    tamanhos:{min:[3,0],padrao:[6,0],max:[12,8]},acoes:[{rotulo:"Abrir a Saúde",rota:"#saude"}],
    config:[{chave:"limite",rotulo:"Quantos treinos",tipo:"numero",min:1,max:10,padrao:4}],
    renderizar:function(ctx){return precisa(["fonte-saude"]).then(function(){return ctx.ler("saude",{semDias:true,limiteAtiv:Math.min(30,ctx.config.limite*3+6)})}).then(function(c){
      var oc=NUCLEO.TREINO_OCULTOS,l=((c.v&&c.v.ativs)||[]).filter(function(a){return oc.indexOf(a.tipo)<0}).slice(0,ctx.config.limite).map(NUCLEO.hojeTreinoLinha).filter(Boolean);
      if(!l.length)return {vazio:true,texto:"Nenhum treino registrado ainda."};
      var mask=wmMasc();
      return h("div",{class:"rac-pilha"},rkLista(l.map(function(t){return {titulo:t.titulo,sub:mask?t.sub.split(" · ")[0]:t.sub,href:t.href}}),true),wmMaisLink("Abrir a Saúde","#saude"))})}});
  widgetRegistrar({tipo:"saude.evolucao",icone:"📈",versao:1,titulo:"Saúde: evolução",categoria:"Saúde",dominio:"saude",compartilhavel:false,exige:{modulo:"saude",dono:true},
    descricao:"Um indicador do relógio dia a dia, nos últimos 7, 14 ou 30 dias. Dias sem registro ficam em branco, sem estimativa.",
    tamanhos:{min:[4,0],padrao:[6,0],max:[12,8]},acoes:[{rotulo:"Abrir a Saúde",rota:"#saude"}],
    config:[{chave:"indicador",rotulo:"Indicador",tipo:"selecao",padrao:"passos",opcoes:Object.keys(WM_IND).map(function(k){return {valor:k,rotulo:WM_IND[k].rot}})},
      {chave:"dias",rotulo:"Janela",tipo:"selecao",padrao:"14",opcoes:[{valor:"7",rotulo:"7 dias"},{valor:"14",rotulo:"14 dias"},{valor:"30",rotulo:"30 dias"}]}],
    renderizar:function(ctx){var hoje=hojeISO(),n=+ctx.config.dias||14,k=WM_IND[ctx.config.indicador]?ctx.config.indicador:"passos",m=WM_IND[k];
      return wmSaude(ctx).then(function(c){if(wmSemSaude(c))return {vazio:true,texto:"Ainda não há dados do relógio. Sincronize pela Saúde."};
        var s=NUCLEO.wmSaudeSerie(c.v.dias||[],k,hoje,n),com=s.filter(function(x){return x.valor!=null});
        if(com.length<2)return {vazio:true,texto:"Poucos registros de "+m.rot.toLowerCase()+" nesta janela ("+com.length+")."};
        if(wmMasc())return {vazio:true,texto:"Valores ocultos nos Ajustes da Saúde."};
        var dec=m.dec,B=s.map(function(x){return {nome:wmData(x.data),cima:n>14?"":wmData(x.data),baixo:""}}),V=s.map(function(x){return x.valor==null?0:x.valor}),med=com.reduce(function(t,x){return t+x.valor},0)/com.length;
        return h("div",{class:"rac-pilha rac-grafico"},h("span",{class:"rac-t-rotulo",text:m.rot+" · média "+wmNum(med,dec)+(m.un?" "+m.un:"")}),
          rsColunas(B,V,function(v){return wmNum(v,dec)},function(i,v){return [B[i].nome,s[i].valor==null?"sem registro do relógio":wmNum(v,dec)+(m.un?" "+m.un:"")]}))})}});
  /* ---------- COMPRAS (as mesmas linhas da Central; o resumo vem das contas da Central, NUCLEO.mkc*) ---------- */
  /* lê as linhas da visão "compras" desde uma data, uma vez para todos os widgets abertos juntos (60 s); falha não fica guardada */
  function wmLinhas(desde){var k=desde||"0000-00-00",agora=Date.now(),achou=null;
    Object.keys(WM.compras).forEach(function(c){var e=WM.compras[c];if(agora-e.t<60e3&&c<=k&&(!achou||c<achou))achou=c});   /* uma leitura que já cobre este período serve (a mais antiga ganha) */
    if(achou){var base=WM.compras[achou].p;return achou===k?base:base.then(function(l){return l.filter(function(x){return String(x.data).slice(0,10)>=k})})}
    var p=dadosPaginar(function(f){var q=SB.from("compras").select("id,data,mercado,numero,categoria,produto,valor_total");if(desde)q=q.gte("data",desde);return q.order("data",{ascending:false}).order("id",{ascending:false}).range(f,f+999)});
    WM.compras[k]={t:agora,p:p};p.catch(function(){delete WM.compras[k]});return p}
  /* limpa a memória curta (o botão ↻ do app e a troca de página chamam) */
  function wmEsquecer(){WM.compras={}}
  var WM_CAT_OPC=[{valor:"",rotulo:"Todas as categorias"}].concat((NUCLEO.MK_CATEGORIAS||[]).map(function(c){return {valor:c,rotulo:c}}));
  widgetRegistrar({tipo:"compras.gastos",icone:"💰",versao:1,titulo:"Compras: gasto do período",categoria:"Compras",dominio:"compras",compartilhavel:true,exige:{modulo:"mercado"},
    descricao:"Quanto foi gasto no período nas compras de mercado, comparado ao período anterior, com o gráfico da evolução.",
    tamanhos:{min:[4,0],padrao:[6,0],max:[12,6]},acoes:[{rotulo:"Abrir a Central de Compras",rota:"#mercado"}],
    config:[{chave:"periodo",rotulo:"Período",tipo:"periodo",padrao:"mes"},{chave:"categoria",rotulo:"Categoria",tipo:"selecao",padrao:"",opcoes:WM_CAT_OPC},{chave:"grafico",rotulo:"Mostrar o gráfico",tipo:"booleano",padrao:true}],
    renderizar:function(ctx){var hoje=hojeISO(),per=NUCLEO.wsPeriodo(ctx.config.periodo,hoje);
      return wmLinhas(per.antDe).then(function(l){var f=ctx.config.categoria?l.filter(function(x){return NUCLEO.mkCatOficial(x.categoria)===ctx.config.categoria}):l,g=NUCLEO.wmGasto(f,per);
        if(!g.atual.itens&&!g.anterior.itens)return {vazio:true,texto:"Nenhuma compra"+(ctx.config.categoria?" de "+ctx.config.categoria:"")+" no período ("+per.rotulo+") nem no anterior."};
        var corpo=h("div",{class:"rac-pilha"});
        corpo.appendChild(rkKpi({rotulo:"Gasto · "+per.rotulo+(ctx.config.categoria?" · "+ctx.config.categoria:""),valor:wmReais(g.atual.total),destaque:true,delta:rkDelta(g.pct,"alta"),
          apoio:g.atual.notas+(g.atual.notas===1?" nota":" notas")+" · antes ("+per.rotuloAnt+"): "+wmReais(g.anterior.total),href:"#mercado"}));
        if(ctx.config.grafico&&per.dias>1){var s=NUCLEO.wmGastoSerie(f,per);if(s.some(function(x){return x.total>0})){var B=s.map(function(x){return {nome:x.rotulo,cima:x.rotulo,baixo:""}}),V=s.map(function(x){return x.total});
          corpo.appendChild(h("div",{class:"rac-grafico"},rsColunas(B,V,function(v){return v>=1000?wmNum(v/1000,1)+"k":wmNum(v,0)},function(i,v){return [(per.dias>31?"Mês ":per.dias>7?"Semana de ":"Dia ")+s[i].rotulo,wmReais(v)]})))}}
        return corpo})}});
  widgetRegistrar({tipo:"compras.recentes",icone:"🧾",versao:1,titulo:"Compras: notas recentes",categoria:"Compras",dominio:"compras",compartilhavel:true,exige:{modulo:"mercado"},
    descricao:"As últimas notas lançadas (uma linha por nota), com loja, data e valor.",
    tamanhos:{min:[3,0],padrao:[6,0],max:[12,8]},acoes:[{rotulo:"Abrir a Central de Compras",rota:"#mercado"}],
    config:[{chave:"limite",rotulo:"Quantas notas",tipo:"numero",min:1,max:10,padrao:5},{chave:"modo",rotulo:"Apresentação",tipo:"selecao",padrao:"resumido",opcoes:[{valor:"resumido",rotulo:"Resumida"},{valor:"detalhado",rotulo:"Detalhada (itens e número da nota)"}]}],
    renderizar:function(ctx){return wmLinhas(NUCLEO.somaDiasISO(hojeISO(),-120)).then(function(l){var n=NUCLEO.mkUltimasNotas(l,ctx.config.limite);
      if(!n.length)return {vazio:true,texto:"Nenhuma compra lançada nos últimos 120 dias."};
      var det=ctx.config.modo==="detalhado";
      return h("div",{class:"rac-pilha"},rkLista(n.map(function(x){return {titulo:x.loja||"Compra",sub:dataBR(x.data).slice(0,5)+(det?" · "+x.itens+(x.itens===1?" item":" itens"):""),meta:h("b",{class:"rac-t-cartao",text:wmReais(x.total)}),href:"#mercado"}}),true),wmMaisLink("Abrir a Central de Compras","#mercado"))})}});
  widgetRegistrar({tipo:"compras.categorias",icone:"🏷️",versao:1,titulo:"Compras: por categoria",categoria:"Compras",dominio:"compras",compartilhavel:true,exige:{modulo:"mercado"},
    descricao:"As categorias em que mais se gastou no período, com valor e participação.",
    tamanhos:{min:[4,0],padrao:[6,0],max:[12,8]},acoes:[{rotulo:"Abrir as categorias",rota:"#mercado/categorias"}],
    config:[{chave:"periodo",rotulo:"Período",tipo:"periodo",padrao:"mes"},{chave:"limite",rotulo:"Quantas categorias",tipo:"numero",min:2,max:8,padrao:5}],
    renderizar:function(ctx){var per=NUCLEO.wsPeriodo(ctx.config.periodo,hojeISO());
      return wmLinhas(per.de).then(function(l){var c=NUCLEO.wmCategoriasTop(l,per,ctx.config.limite);
        if(!c.linhas.length||!c.total)return {vazio:true,texto:"Nenhuma compra no período ("+per.rotulo+")."};
        return h("div",{class:"rac-pilha rac-grafico"},h("span",{class:"rac-t-rotulo",text:per.rotulo+" · total "+wmReais(c.total)}),
          rsBarras(c.linhas.map(function(x){return {nome:x.categoria,v:x.total,txt:wmReais(x.total),dica:wmReais(x.total)+" · "+Math.round(x.pct*100)+"% do total",href:x.categoria==="Outras"?null:"#mercado/categorias"}})))})}});
  widgetRegistrar({tipo:"compras.lojas",icone:"🏪",versao:1,titulo:"Compras: últimos estabelecimentos",categoria:"Compras",dominio:"compras",compartilhavel:true,exige:{modulo:"mercado"},
    descricao:"Os estabelecimentos onde você comprou por último (sem repetir), com a data e o valor da última nota.",
    tamanhos:{min:[3,0],padrao:[6,0],max:[12,8]},acoes:[{rotulo:"Abrir a Central de Compras",rota:"#mercado"}],
    config:[{chave:"limite",rotulo:"Quantos estabelecimentos",tipo:"numero",min:1,max:8,padrao:4}],
    renderizar:function(ctx){return wmLinhas(NUCLEO.somaDiasISO(hojeISO(),-120)).then(function(l){var n=NUCLEO.wmLojasRecentes(l,ctx.config.limite);
      if(!n.length)return {vazio:true,texto:"Nenhuma compra lançada nos últimos 120 dias."};
      return rkLista(n.map(function(x){return {titulo:x.loja,sub:"última compra em "+dataBR(x.data).slice(0,5),meta:h("b",{class:"rac-t-cartao",text:wmReais(x.total)}),href:"#mercado"}}),true)})}});
  widgetRegistrar({tipo:"compras.lista",icone:"🛒",versao:1,titulo:"Compras: lista a comprar",categoria:"Compras",dominio:"lista",compartilhavel:true,exige:{modulo:"lista"},
    descricao:"Os itens que ainda faltam na Lista de compras da casa. Marcar como comprado continua na Lista.",
    tamanhos:{min:[3,0],padrao:[6,0],max:[12,8]},acoes:[{rotulo:"Abrir a Lista de compras",rota:"#lista"}],
    config:[{chave:"limite",rotulo:"No máximo quantos itens",tipo:"numero",min:1,max:15,padrao:6}],
    renderizar:function(ctx){return Promise.resolve().then(function(){return SB.from("lista").select("id,item,qtd,criado").eq("tipo","compra").eq("feito",false).order("criado",{ascending:true}).limit(ctx.config.limite)}).then(sbOk).then(function(l){
      if(!l.length)return {vazio:true,texto:"A lista de compras está vazia."};
      return h("div",{class:"rac-pilha"},rkLista(l.map(function(x){return {titulo:x.item,meta:x.qtd?h("span",{class:"rac-t-sec",text:String(x.qtd)}):null,href:"#lista"}}),true),wmMaisLink("Abrir a Lista de compras","#lista"))})}});

  /* ---------- TIMELINE (Lote 3): os acontecimentos recentes, pelos MESMOS provedores da página Timeline (js/prov.js); nenhuma consulta própria, nenhuma cópia ---------- */
  var WM_TL_CATS=NUCLEO.TL_CATEGORIAS.map(function(c){return {valor:c,rotulo:NUCLEO.TL_CAT_ROTULO[c]}});
  widgetRegistrar({tipo:"timeline.recente",icone:"🕒",versao:1,titulo:"Timeline: recentes",categoria:"Timeline",dominio:"timeline",compartilhavel:true,
    descricao:"Os acontecimentos mais recentes de todos os módulos (treinos, compras, registros, mensagens, compromissos), em ordem, com o caminho para o registro original. Em espaço compartilhado só aparecem fontes da casa.",
    tamanhos:{min:[4,0],padrao:[6,0],max:[12,8]},acoes:[{rotulo:"Abrir a Timeline",rota:"#timeline"}],
    config:[{chave:"limite",rotulo:"Quantos eventos",tipo:"numero",min:3,max:12,padrao:6},{chave:"periodo",rotulo:"Período",tipo:"periodo",padrao:"7d"},
      {chave:"categorias",rotulo:"Só estas categorias (vazio = todas)",tipo:"selecao",multiplo:true,max:10,opcoes:WM_TL_CATS,padrao:[]},{chave:"resumo",rotulo:"Mostrar o resumo",tipo:"booleano",padrao:true},{chave:"data",rotulo:"Mostrar a data",tipo:"booleano",padrao:true}],
    renderizar:function(ctx){var hoje=hojeISO(),per=NUCLEO.wsPeriodo(ctx.config.periodo,hoje),de=per.valor==="mes"?per.de:per.de,tipo=ctx.espaco&&ctx.espaco.tipo;
      return provEspacosParaWidget().then(function(esp){return provJanela({de:de,ate:hoje,limite:ctx.config.limite*2,tipoEspaco:tipo,espacos:esp,filtros:{categorias:ctx.config.categorias},tempo:6000})}).then(function(r){
        var l=NUCLEO.tlDeduplicar(r.eventos).slice(0,ctx.config.limite);
        if(r.falhas.length&&!l.length)throw new Error("as fontes não responderam")
        if(!l.length)return {vazio:true,texto:r.falhas.length?"Nada chegou e parte das fontes não respondeu.":"Nada registrado "+(ctx.config.periodo==="hoje"?"hoje":ctx.config.periodo==="mes"?"neste mês":"nos "+per.rotulo)+"."};
        var corpo=h("div",{class:"rac-pilha wm-tl"},h("div",{class:"tl-lista"},l.map(function(e){return tlLinha(e,{resumo:ctx.config.resumo,data:ctx.config.data,compacto:true})})));
        if(r.falhas.length)corpo.appendChild(h("p",{class:"rac-t-legenda",text:"Sem resposta: "+r.falhas.map(function(x){return x.rotulo}).join(", ")+"."}));
        corpo.appendChild(wmMaisLink("Abrir a Timeline","#timeline"));return corpo})}});
  /* ---------- CAPTURA (Lote 4): a caixa de entrada. Só LÊ a tabela captura_itens (privada do autor pelo RLS) e a fila deste aparelho; nada de escrita, nada de cópia ---------- */
  widgetRegistrar({tipo:"captura.caixa",icone:"📥",versao:1,titulo:"Captura: caixa de entrada",categoria:"Captura",dominio:"captura",compartilhavel:false,exige:{dono:true},
    descricao:"Quantos itens capturados esperam uma decisão, os mais recentes e o que ainda não subiu deste aparelho. Decidir o destino continua na caixa.",
    tamanhos:{min:[4,0],padrao:[6,0],max:[12,6]},acoes:[{rotulo:"Abrir a caixa",rota:"#caixa"}],
    config:[{chave:"limite",rotulo:"Quantos itens mostrar",tipo:"numero",min:1,max:8,padrao:3}],
    renderizar:function(ctx){return Promise.resolve().then(function(){return SB.from("captura_itens").select("id,tipo,conteudo,anexos,criado_em",{count:"exact"}).eq("estado","pendente").order("criado_em",{ascending:false}).limit(ctx.config.limite)}).then(function(r){
      if(r.error)throw new Error(r.error.message);var fila=NUCLEO.cpFilaItens(filaLer()).length,n=r.count||0,l=r.data||[];
      if(!n&&!fila)return {vazio:true,texto:"Caixa vazia. Use o botão + para capturar um texto, link, foto ou arquivo."};
      var corpo=h("div",{class:"rac-pilha"},rkKpi({rotulo:"Pendentes",valor:n,apoio:n===1?"item espera uma decisão":"itens esperam uma decisão",href:"#caixa",destaque:true}));
      if(fila)corpo.appendChild(h("p",{class:"rac-t-legenda",text:"⏳ "+fila+(fila===1?" item ainda não subiu deste aparelho.":" itens ainda não subiram deste aparelho.")}));
      if(l.length)corpo.appendChild(rkLista(l.map(function(i){return {titulo:NUCLEO.cpTitulo(i.conteudo,i.anexos,60)||"(anexo)",sub:NUCLEO.CP_TIPO_ROTULO[i.tipo]||"",href:"#caixa"}}),true));
      corpo.appendChild(wmMaisLink("Abrir a caixa","#caixa"));return corpo})}});
  /* os espaços da pessoa (para o filtro e para dar id real ao "pessoal" e à "casa"); uma leitura por abertura */
  var WM_ESP=null;
  function provEspacosParaWidget(){if(WM_ESP)return WM_ESP;WM_ESP=Promise.resolve().then(function(){return SB.rpc("rac_iniciar_espacos")}).then(sbOk).then(function(l){return l||[]},function(){return []});setTimeout(function(){WM_ESP=null},60e3);return WM_ESP}
