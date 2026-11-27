/* Dia a Dia RAC — widgets de referência do Workspace (Lote 1 do novo RAC). Quatro tipos que provam o mecanismo do catálogo de ponta a ponta (registro, configuração, estados, permissão e dados reais pelo
   contrato de fontes); NÃO são a Minha Casa completa: os widgets dos módulos (Hoje, Saúde, Compras…) entram no Lote 2 pelo mesmo registro. Depende de js/widgets.js e do kit.
     nota.fixa        texto livre do usuário (visível a quem vê a página: a configuração só deve ter o que pode ser compartilhado)
     atalhos.rotas    atalhos para as páginas do RAC que a pessoa pode abrir (só mostra o que ela acessa)
     data.hoje        o dia de hoje
     agenda.proximos  os próximos itens da Agenda (lê a fonte "agenda"; só do dono e NÃO compartilhável: não entra em espaço compartilhado) */
  function wbRotas(){return RAC_ROTAS.filter(function(r){return r.grupo&&r.id!=="workspace"}).map(function(r){return {valor:r.id,rotulo:r.titulo}})}
  widgetRegistrar({tipo:"nota.fixa",versao:1,titulo:"Nota fixa",categoria:"Utilidade",dominio:"workspace",compartilhavel:true,
    descricao:"Um texto seu sempre à vista: lembrete, recado ou lista curta.",
    tamanhos:{min:[2,0],padrao:[4,0],max:[12,6]},
    config:[{chave:"titulo",rotulo:"Título",tipo:"texto-curto",max:60,padrao:"Anotação"},
      {chave:"texto",rotulo:"Texto",tipo:"texto-curto",max:500,longo:true,padrao:"",ajuda:"Quem vê esta página vê este texto: não escreva dado privado em página compartilhada."}],
    renderizar:function(ctx){var t=String(ctx.config.texto||"");
      if(!t)return {vazio:true,texto:"Nota vazia. Use Configurar para escrever."};
      return h("div",null,ctx.config.titulo?h("b",{class:"rac-t-cartao",text:ctx.config.titulo}):null,h("p",{class:"wk-nota",text:t}))}});
  widgetRegistrar({tipo:"atalhos.rotas",versao:1,titulo:"Atalhos",categoria:"Utilidade",dominio:"navegacao",compartilhavel:true,
    descricao:"Botões para as páginas do RAC que você mais usa.",
    tamanhos:{min:[3,0],padrao:[6,0],max:[12,3]},
    config:[{chave:"rotas",rotulo:"Páginas",tipo:"selecao",multiplo:true,max:8,opcoes:wbRotas(),padrao:["agenda","saude","mercado"]}],
    renderizar:function(ctx){var ids=(ctx.config.rotas||[]).filter(function(i){return ROTAS[i]&&ctx.acessivel(i)});
      if(!ids.length)return {vazio:true,texto:"Nenhum atalho. Use Configurar para escolher as páginas."};
      return h("div",{class:"wk-atalhos"},ids.map(function(i){var r=ROTAS[i];return h("a",{class:"wk-atalho",href:"#"+i},r.ico?svg(r.ico):null,h("span",{text:r.titulo}))}))}});
  widgetRegistrar({tipo:"data.hoje",versao:1,titulo:"Hoje",categoria:"Dia",dominio:"workspace",compartilhavel:true,
    descricao:"A data de hoje, com o dia da semana.",
    tamanhos:{min:[2,0],padrao:[3,0],max:[6,2]},
    config:[{chave:"formato",rotulo:"Formato",tipo:"selecao",opcoes:[{valor:"completo",rotulo:"Dia da semana e data"},{valor:"curto",rotulo:"Só a data"}],padrao:"completo"}],
    renderizar:function(ctx){var d=new Date(),o=ctx.config.formato==="curto"?{day:"numeric",month:"long"}:{weekday:"long",day:"numeric",month:"long",year:"numeric"};
      return h("p",{class:"rac-t-num wk-data",text:d.toLocaleDateString("pt-BR",o)})}});
  widgetRegistrar({tipo:"agenda.proximos",versao:1,titulo:"Agenda: próximos",categoria:"Dia",dominio:"agenda",compartilhavel:false,exige:{modulo:"agenda",dono:true},
    descricao:"Os próximos itens com data da Agenda (retornos, vencimentos, aulas, lembretes).",
    tamanhos:{min:[3,2],padrao:[6,3],max:[12,6]},
    config:[{chave:"dias",rotulo:"Olhar quantos dias à frente",tipo:"numero",min:1,max:60,padrao:7},{chave:"limite",rotulo:"No máximo quantos itens",tipo:"numero",min:1,max:10,padrao:5}],
    renderizar:function(ctx){
      return precisa(["fonte-agenda"]).then(function(){return ctx.ler("agenda")}).then(function(c){var hoje=hojeISO(),ate=NUCLEO.somaDiasISO(hoje,ctx.config.dias);
        var l=(c.v||[]).filter(function(e){return e.data>=hoje&&e.data<=ate}).sort(function(a,b){return a.data<b.data?-1:a.data>b.data?1:0}).slice(0,ctx.config.limite);
        if(!l.length)return {vazio:true,texto:"Nada com data nos próximos "+ctx.config.dias+" dias."};
        return h("ul",{class:"rac-lista"},l.map(function(e){var corpo=[h("span",{class:"rac-linha-corpo"},h("b",{class:"rac-t-cartao",text:e.t}),e.sub?h("span",{class:"rac-t-sec",text:e.sub}):null),
            h("span",{class:"rac-linha-meta rac-t-legenda",text:NUCLEO.agdQuando(e.data,hoje)})];
          return h("li",null,e.href&&e.href.charAt(0)==="#"?h("a",{class:"rac-linha-item",href:e.href},corpo):h("div",{class:"rac-linha-item"},corpo))}))})}});
