/* Dia a Dia RAC — hub da Saúde (DS-4.3 · RAC Modern Workspace; docs/saude.md). A página #saude deixa de ser uma página longa: abertura, 7 áreas por aba (Visão geral,
   Recuperação, Sono, Atividades, Condicionamento, Tendências e Inteligência) e a página do treino (#saude/treino/ID, em js/saude.js) como sempre. Só a tela: a leitura é a da
   fonte única (js/fonte-saude.js, via saudeColetarLeitura/saudeLer), todas as regras, sinais e comparações são do núcleo (NUCLEO.sau*) e o desenho usa o kit (js/kit.js) e os
   gráficos (js/graficos.js; toda barra com racDica). Sem IA, sem chamada paga e sem escrever no banco de saúde: a única gravação é a preferência do dono (pessoalGravar "saudePrefs")
   e o diário de humor, como sempre. "Ocultar valores" é só máscara de apresentação: os dados e as contas não mudam. Só o dono abre a página. */
  var SH_ABAS=[["geral","Visão geral"],["recuperacao","Recuperação"],["sono","Sono"],["atividades","Atividades"],["condicionamento","Condicionamento"],["tendencias","Tendências"],["inteligencia","Inteligência"]];
  /* o que sobrevive a um novo desenho da página: a aba, o filtro, o período e a leitura; ultAuto evita pedir ao relógio de novo a cada troca de aba */
  var SH={aba:"geral",lei:null,seq:0,per:"30",met:"sono",tipo:"",pAtiv:"90",mais:30,ultAuto:0};
  var SH_PER_ATIV={"30":30,"90":90,"180":180,"tudo":3650};
  function shPrefs(){return NUCLEO.sauPrefs(PESSOAL.saudePrefs)}
  /* máscara de apresentação: valores viram •••; as datas, nomes e rótulos continuam. Os dados originais e as contas não mudam. */
  function shV(t){return shPrefs().ocultar?"•••":t}
  function shDados(){return {dias:SAUDE.dias||(SH.lei&&SH.lei.dias)||[],ativs:SAUDE.ativs||(SH.lei&&SH.lei.ativs)||[]}}
  function shN(v,d){if(v==null)return "—";var f=Math.pow(10,d||0);return fmtN(Math.round(v*f)/f)}
  function shHm(h2){return h2==null?"—":hmDur(h2*3600)}
  function shData(iso){return iso?iso.slice(8,10)+"/"+iso.slice(5,7):"—"}
  function shDiaInfo(iso){var d=new Date(iso+"T12:00:00");return {cima:iso.slice(8),baixo:"DSTQQSS".charAt(d.getDay()),nome:d.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"2-digit"})}}
  /* a abertura, a leitura e o contexto de uma pintura: tudo calculado uma vez, pelo núcleo */
  function shContexto(){var D=shDados(),hoje=hojeISO(),pr=shPrefs(),por=NUCLEO.sauPor(D.dias);
    return {dias:D.dias,ativs:D.ativs,hoje:hoje,pr:pr,por:por,ind:NUCLEO.sauIndicadores(D.dias,hoje),sin:NUCLEO.sauSinais(D.dias,hoje,{sonoH:pr.sonoH})}}
  /* colunas dos últimos n dias de uma medida (valor fixo em cima, dia embaixo, toque mostra o cartão). base: as colunas começam perto do menor valor, senão ficariam todas iguais */
  function shColunas(C,get,fmt,n,base){var B=[],vals=[];
    for(var i=n-1;i>=0;i--){var iso=maisDias(C.hoje,-i),d=C.por[iso],v=d?get(d):null,m=shDiaInfo(iso);B.push({nome:m.nome,cima:m.cima,baixo:m.baixo});vals.push(v)}
    var b0=base||0,sh=vals.map(function(v){return v==null?0:Math.max(1,v-b0)});
    return rsColunas(B,sh,function(s){return shV(fmt(s+b0))},function(i){var v=vals[i];return [B[i].nome,v==null?"sem registro do relógio":(shPrefs().ocultar?"valor oculto":fmt(v))]})}
  function shResumoSerie(C,get,fmt,n){var l=NUCLEO.sauJanela(C.por,C.hoje,n,get),vs=NUCLEO.sauVals(l);if(!vs.length)return null;
    return [["Último",shV(fmt(l[l.length-1].v))],["Mediana "+n+" dias",shV(fmt(mediana0(vs)))],["Menor · maior",shV(fmt(Math.min.apply(null,vs))+" · "+fmt(Math.max.apply(null,vs)))],["Dias com dado",l.length+" de "+n]]}
  function mediana0(l){return NUCLEO.sauMedia(l)}
  function shCardSerie(titulo,sub,C,get,fmt,base,origem){var vs=NUCLEO.sauJanela(C.por,C.hoje,30,get);
    var corpo=h("div",{class:"rac-pilha",style:"gap:12px"});
    if(vs.length<2)corpo.appendChild(rkEstado("vazio","Poucos dados nos últimos 30 dias."));
    else{corpo.appendChild(h("div",{class:"rac-grafico"},shColunas(C,get,fmt,30,base)));var r=shResumoSerie(C,get,fmt,30);if(r)corpo.appendChild(rsKpis(r))}
    return rkCard(titulo,corpo,{sub:sub,origem:origem||"Últimos 30 dias; a mediana é a do próprio período."})}
  /* ---- sinais: uma linha (Visão geral) ou um cartão completo (Recuperação, Sono, Inteligência) ---- */
  var SH_SELO={ativo:["aviso","em observação"],normal:["ok","sem sinal"],suprimido:["neutro","não calculado"]};
  function shEp(ep){return ep.aberto?"desde "+shData(ep.desde)+" (em observação)":shData(ep.desde)+" a "+shData(ep.ultimoAtivo)+" (deixou de ser relevante em "+shData(ep.ate)+", depois de 2 dias normais)"}
  function shSinalCard(s){var corpo=h("div",{class:"rac-pilha",style:"gap:12px"}),t=s.texto,oc=shPrefs().ocultar;
    if(s.estado==="ativo"&&t){
      corpo.appendChild(rkAlerta("aviso",t.titulo,oc?"Sinal em observação (detalhes ocultos).":t.obs+(s.emSaida?" Voltou ao normal há 1 dia; segue em observação até 2 dias normais.":"")));
      if(!oc)[["Comparação com o seu normal",t.comparacao],["Janela e amostra",t.janela],["Hipótese",t.hipotese],["Orientação",t.orientacao]].forEach(function(x){corpo.appendChild(h("p",{class:"rac-t-sec",style:"margin:0"},h("b",{text:x[0]+": "}),x[1]))})}
    else if(s.estado==="suprimido")corpo.appendChild(rkEstado("aviso","Não calculado agora: "+s.motivo+". Sem dados confiáveis, o RAC não afirma nada."));
    else{var ult=s.episodios.length?s.episodios[s.episodios.length-1]:null;corpo.appendChild(rkEstado("ok","Sem sinal persistente agora."+(ult&&!ult.aberto?" Último episódio: "+shEp(ult)+".":"")))}
    return rkCard(s.nome,corpo,{acao:rkSelo(SH_SELO[s.estado][0],SH_SELO[s.estado][1]),classe:"sh-sinal sh-sinal--"+s.estado})}
  function shCabSinais(C,ids){return ids.map(function(id){return shSinalCard(C.sin.sinais.filter(function(s){return s.id===id})[0])})}
  /* ---- Visão geral ---- */
  function shKpiItem(rot,v,fmt,ind,pior,href,sufixo){var it=ind.itens[v],val=it&&it.v!=null?shV(fmt(it.v)+(sufixo||"")):"—",delta=it&&it.pct!=null&&it.v!=null?rkDelta(it.pct,pior):null,
      apoio=it&&it.v==null?"sem registro neste dia":it&&it.med!=null?"seu normal "+shV(fmt(it.med)+(sufixo||""))+" ("+it.n+" dias)":"sem base de 14 dias para comparar";
    return rkKpi({rotulo:rot,valor:val,delta:delta,apoio:apoio,href:href})}
  function shGeral(C){var L=[],I=C.ind;
    if(!I){L.push(h("div",{class:"rh-largo"},rkEstado("vazio","Ainda sem dados do relógio. Toque em “Atualizar agora”.")));return L}
    var pr=I.prontidao,k=h("section",{class:"sh-kpis","aria-label":"Indicadores principais"});
    k.appendChild(rkKpi({rotulo:"Prontidão",valor:pr?shV(String(pr.nota)):"—",apoio:pr?pr.rotulo+" · cálculo do RAC":"dados insuficientes",href:"#saude/recuperacao",destaque:true,alerta:!!(pr&&pr.nota<45)}));
    k.appendChild(shKpiItem("Sono","sono",shHm,I,"queda","#saude/sono"));k.appendChild(shKpiItem("VFC (noite)","vfc",function(v){return Math.round(v)},I,"queda","#saude/recuperacao"," ms"));
    k.appendChild(shKpiItem("FC de repouso","fc",function(v){return Math.round(v)},I,"alta","#saude/recuperacao"," bpm"));k.appendChild(shKpiItem("Body Battery","bb",function(v){return Math.round(v)},I,"queda","#saude/recuperacao"));
    L.push(k);
    /* sinais persistentes: no máximo 3, só os que passaram da persistência e da cobertura mínima */
    var cs=h("div",{class:"rac-pilha",style:"gap:12px"}),S=C.sin;
    if(S.qualidade.suprime)cs.appendChild(rkEstado("aviso","Sinais suspensos: "+S.qualidade.motivo+"."));
    else if(S.visiveis.length){S.visiveis.forEach(function(s){cs.appendChild(rkAlerta("aviso",s.nome,C.pr.ocultar?"Em observação (detalhes ocultos).":s.texto.obs,rkLink("ter","Entender por quê","#saude/inteligencia")))});
      if(S.ativos.length>3)cs.appendChild(h("span",{class:"rac-t-sec",text:"e mais "+(S.ativos.length-3)+" na Inteligência"}))}
    else cs.appendChild(rkEstado("ok","Nenhum sinal persistente agora."));
    cs.appendChild(h("span",{class:"rac-t-legenda",text:S.limite}));
    L.push(h("div",{class:"rh-largo"},rkCard("Sinais persistentes",cs,{sub:"Só aparecem quando o padrão se repete por vários dias e há dados suficientes; uma noite ruim isolada não conta.",
      acao:rkLink("ter","Todos os sinais","#saude/inteligencia")})));
    /* último treino e a semana */
    var esq=h("div",{class:"rh-prio sh-col"}),dir=h("div",{class:"rh-lado sh-col"});L.push(esq,dir);
    var a=C.ativs[0];
    if(a){var T=ativTipo(a.tipo),d=a.dados,l=[distTxt(a),d.duracao?durTxt(d.duracao):"",ritmo(a),d.fc?"batimentos "+Math.round(d.fc):""].filter(Boolean).join(" · ");
      esq.appendChild(rkCard("Último treino",rkLista([{titulo:T[1]+" "+(d.nome||T[0]),sub:dataBR(a.inicio.slice(0,10))+", "+a.inicio.slice(11,16)+(d.local&&!C.pr.esconderLocal&&(d.nome||"").indexOf(d.local)<0?" · "+d.local:"")+(l?" · "+shV(l):""),href:"#saude/treino/"+a.id,meta:d.efeitoAerobico?"efeito "+shV(fmtN(d.efeitoAerobico)):null}])))}
    else esq.appendChild(rkCard("Último treino",rkEstado("vazio","Nenhum treino registrado.")));
    var sem=NUCLEO.pnSemana(C.hoje),ts=C.ativs.filter(function(x){return x.inicio.slice(0,10)>=sem}),dsem={};ts.forEach(function(x){dsem[x.inicio.slice(0,10)]=1});
    var meta=C.pr.treinos,pct=Math.min(100,Math.round(ts.length/meta*100)),cw=h("div",{class:"rac-pilha",style:"gap:12px"});
    cw.appendChild(rsKpis([["Treinos",shV(String(ts.length))],["Dias ativos",shV(String(Object.keys(dsem).length))],["Meta",meta+(meta===1?" treino":" treinos")]]));
    cw.appendChild(rkMedidor(pct,null,"Meta da semana",shV(ts.length+" de "+meta)));
    dir.appendChild(rkCard("Esta semana",cw,{sub:"De segunda a hoje.",origem:"A meta é sua e editável em Inteligência → Ajustes."}));
    dir.appendChild(shDiario());
    return L}
  /* diário de humor (só o dono): uma linha por dia; com algumas semanas dá para cruzar com sono, treino e estresse */
  function shDiario(){var hoje=hojeISO(),di=PESSOAL.diario||{},x=di[hoje]||{},sel=x.h||0,corpo=h("div",{class:"rac-pilha",style:"gap:12px"});
    var esc=h("div",{class:"humor",role:"group","aria-label":"Humor de hoje"});
    HUMOR.forEach(function(e,i){var b=h("button",{type:"button","aria-pressed":String(sel===i+1),title:["Péssimo","Ruim","Normal","Bom","Ótimo"][i],text:e});b.onclick=function(){sel=i+1;[].forEach.call(esc.children,function(c,j){c.setAttribute("aria-pressed",String(j===i))})};esc.appendChild(b)});
    var t=h("input",{type:"text",class:"rac-campo-entrada",maxlength:"140",placeholder:"Uma linha sobre o dia (opcional)","aria-label":"Uma linha sobre o dia",value:x.t||""}),sv=rkBtn("pri",x.h?"Atualizar":"Salvar"),st=h("span",{class:"rac-t-sec",role:"status"});
    sv.onclick=function(){if(!sel){st.textContent="Escolha um rosto.";return}var n=Object.assign({},PESSOAL.diario||{});n[hoje]={h:sel,t:t.value.trim()||undefined};pessoalGravar("diario",n);st.textContent="✓ Anotado.";sv.textContent="Atualizar"};
    var fx=h("div",{class:"humorfx"});for(var i=13;i>=0;i--){var dt=maisDias(hoje,-i),y=di[dt];fx.appendChild(h("span",{title:dataBR(dt)+(y&&y.t?": "+y.t:""),class:y?null:"vazio",text:y?HUMOR[y.h-1]:"·"}))}
    [esc,h("div",{class:"rac-linha-flex"},t,sv),st,fx].forEach(function(n){corpo.appendChild(n)});
    return rkCard("Como foi hoje?",corpo,{sub:"Diário de humor: uma linha por dia."})}
  /* ---- Recuperação ---- */
  function shRecuperacao(C){var L=[],I=C.ind;
    if(!I){L.push(h("div",{class:"rh-largo"},rkEstado("vazio","Sem dados para a recuperação.")));return L}
    var pr=I.prontidao,esq=h("div",{class:"rh-prio sh-col"}),dir=h("div",{class:"rh-lado sh-col"});L.push(esq,dir);
    if(pr){var P=pr.partes,itens=[P.vfc?["Variabilidade cardíaca",P.vfc.v+" ms","normal "+Math.round(P.vfc.mediana)+" ms",P.vfc.nota]:null,P.fc?["Batimentos em repouso",P.fc.v+" bpm","normal "+Math.round(P.fc.mediana)+" bpm",P.fc.nota]:null,
        P.sono?["Sono",shHm(P.sono.v),"",P.sono.nota]:null,P.bb?["Body Battery",String(P.bb.v),"",P.bb.nota]:null].filter(Boolean),corpo=h("div",{class:"rac-pilha",style:"gap:12px"});
      corpo.appendChild(rkKpi({rotulo:"Prontidão "+(I.hoje?"de hoje":"em "+dataBR(I.data)),valor:shV(String(pr.nota)),apoio:pr.rotulo,destaque:true,alerta:pr.nota<45}));
      corpo.appendChild(rkLista(itens.map(function(i){return {titulo:i[0],sub:i[2]?shV(i[2]):"",meta:shV(i[1]+" · nota "+i[3]),marca:i[3]>=70?"ok":i[3]>=45?"media":"alta"}})));
      var serie=C.dias.slice(-14).map(function(x){var q=NUCLEO.prontidao(C.dias,x.data);return [x.data,q&&q.nota]}),B=serie.map(function(x){var m=shDiaInfo(x[0]);return {nome:m.nome,cima:m.cima,baixo:m.baixo}});
      corpo.appendChild(h("span",{class:"rac-t-rotulo",text:"Prontidão dos últimos 14 dias"}));
      corpo.appendChild(h("div",{class:"rac-grafico"},rsColunas(B,serie.map(function(x){return x[1]||0}),function(v){return shV(String(v))},function(i){var q=serie[i][1];return [B[i].nome,q==null?"sem dados do relógio":shPrefs().ocultar?"valor oculto":"Prontidão "+q+" · "+(q>=70?"pronto para treinar forte":q>=45?"bom para treino moderado":"dia de recuperação")]})));
      if(pr.alertas.length)corpo.appendChild(rkAlerta("aviso","Atenção neste dia",C.pr.ocultar?"detalhes ocultos":pr.alertas.join("; ")+"."));
      esq.appendChild(rkCard("Prontidão",corpo,{sub:"Nota do RAC, de 0 a 100: compara a sua variabilidade cardíaca, os batimentos em repouso, o sono e a Body Battery de hoje com o seu normal dos últimos 60 dias.",
        origem:"É um cálculo do RAC. Não é o Training Readiness (a “Prontidão para o treino”) da Garmin, que o RAC não coleta."}))}
    else esq.appendChild(rkCard("Prontidão",rkEstado("vazio","Dados insuficientes para calcular a prontidão neste dia.")));
    shCabSinais(C,["s1","s2","s3"]).forEach(function(c){dir.appendChild(c)});
    var G=h("div",{class:"rh-dois"});L.push(G);
    var vv=I.itens.vfc,fx=C.dias.length?C.dias[C.dias.length-1].dados.vfc:null;
    G.appendChild(shCardSerie("VFC (variabilidade cardíaca)","Média da noite, em ms. Mais alta que o seu normal costuma indicar corpo recuperado.",C,SAU_C.vfc,function(v){return Math.round(v)+" ms"},30,
      "Faixa pessoal: mediana ± desvio de 60 dias"+(vv.med!=null?" ("+(C.pr.ocultar?"•••":Math.round(vv.med)+" ms")+")":" (ainda sem base)")+(fx&&fx.faixaMin?"; faixa normal da Garmin "+(C.pr.ocultar?"•••":fx.faixaMin+"–"+fx.faixaMax+" ms"):"")+"."));
    G.appendChild(shCardSerie("Batimentos em repouso","Menor frequência do dia. Cinco ou mais acima do seu normal, por vários dias, merece atenção.",C,SAU_C.fc,function(v){return Math.round(v)+" bpm"},40));
    G.appendChild(shCardSerie("Body Battery","Estimativa da Garmin da energia do corpo (0 a 100); o RAC guarda o máximo do dia.",C,SAU_C.bb,function(v){return String(Math.round(v))},0));
    G.appendChild(shCardSerie("Estresse","Calculado pela variabilidade cardíaca ao longo do dia (0 a 100). É fisiológico, não emocional.",C,SAU_C.estresse,function(v){return String(Math.round(v))},0));
    L.push(h("div",{class:"rh-largo"},saudeGlossario()));return L}
  var SAU_C=NUCLEO.SAU_CAMPOS;
  /* ---- Sono ---- */
  var SH_FASES=[["profundo","Profundo","sh-f1"],["rem","REM","sh-f2"],["leve","Leve","sh-f3"],["acordado","Acordado","sh-f4"]];
  function shSono(C){var L=[],noites=NUCLEO.sauJanela(C.por,C.hoje,14,SAU_C.sono),I=C.ind;
    if(!noites.length&&!I){L.push(h("div",{class:"rh-largo"},rkEstado("vazio","Sem dados de sono.")));return L}
    var j7=NUCLEO.sauJanela(C.por,C.hoje,7,SAU_C.sono),m7=j7.length>=5?NUCLEO.sauMedia(NUCLEO.sauVals(j7)):null,meta=C.pr.sonoH,reg=NUCLEO.sauRegularidade(C.por,C.hoje,14),ult=noites[noites.length-1],uSono=ult?C.por[ult.data].sono:null;
    var k=h("section",{class:"rh-kpis","aria-label":"Indicadores do sono"});
    k.appendChild(rkKpi({rotulo:"Última noite",valor:ult?shV(shHm(ult.v)):"—",apoio:ult?(dataBR(ult.data).slice(0,5)+(uSono&&uSono.nota!=null?" · nota "+shV(String(uSono.nota)):"")):"sem registro"}));
    k.appendChild(rkKpi({rotulo:"Média de 7 dias",valor:m7!=null?shV(shHm(m7)):"—",apoio:m7!=null?"meta "+meta+" h · "+j7.length+" noites":"menos de 5 noites com dado"}));
    k.appendChild(rkKpi({rotulo:"Dorme em média às",valor:reg.suficiente?shV(reg.dormirMedio):"—",apoio:reg.suficiente?"variação de "+shV(reg.dormirDpMin+" min")+" · "+reg.n+" noites":"menos de 8 noites com horário"}));
    k.appendChild(rkKpi({rotulo:"Acorda em média às",valor:reg.suficiente&&reg.acordarMedio?shV(reg.acordarMedio):"—",apoio:reg.acordarDpMin!=null?"variação de "+shV(reg.acordarDpMin+" min"):"horário só em parte das noites"}));
    L.push(k);
    var esq=h("div",{class:"rh-prio sh-col"}),dir=h("div",{class:"rh-lado sh-col"});L.push(esq,dir);
    esq.appendChild(shCardSerie("Duração do sono: tendência","Horas por noite nos últimos 30 dias.",C,SAU_C.sono,shHm,0,"As colunas partem do zero. A meta pessoal é de "+meta+" h."));
    /* estágios: estimativa do relógio (frequência cardíaca e movimento), nunca diagnóstico */
    var comE=noites.slice(-14).filter(function(n){var s=C.por[n.data].sono;return s&&(s.profundo||s.rem||s.leve)});
    var ce=h("div",{class:"rac-pilha",style:"gap:12px"});
    if(!comE.length)ce.appendChild(rkEstado("vazio","O relógio não enviou os estágios do sono nestas noites."));
    else{var mx=Math.max.apply(null,comE.map(function(n){var s=C.por[n.data].sono;return s.total+(s.acordado||0)}));
      ce.appendChild(h("div",{class:"sh-leg"},SH_FASES.map(function(f){return h("span",null,h("i",{class:f[2]}),f[1])})));
      ce.appendChild(h("div",{class:"sh-estagios"},comE.map(function(n){var s=C.por[n.data].sono,tot=s.total+(s.acordado||0);
        return racDica.ligar(h("div",{class:"sh-estrow",tabindex:"0"},h("span",{class:"sh-estd",text:shData(n.data)}),
          h("span",{class:"sh-estbar",style:"width:"+(tot/mx*100).toFixed(1)+"%"},SH_FASES.map(function(f){return s[f[0]]?h("i",{class:f[2],style:"flex:"+s[f[0]]}):null})),h("span",{class:"sh-estt",text:shV(shHm(s.total))})),
          function(){var m=shDiaInfo(n.data);return [m.nome,shPrefs().ocultar?"valor oculto":shHm(s.total)+" de sono"+(s.nota?" · nota "+s.nota:"")+" · "+SH_FASES.filter(function(f){return s[f[0]]}).map(function(f){return f[1].toLowerCase()+" "+shHm(s[f[0]]/3600)}).join(", ")]})})))}
    esq.appendChild(rkCard("Estágios do sono",ce,{sub:"Profundo, REM, leve e acordado nas últimas noites.",origem:"Estimativa do relógio por frequência cardíaca e movimento: serve para ver tendência, não é exame de sono nem diagnóstico."}));
    /* horários e regularidade */
    var ch=h("div",{class:"rac-pilha",style:"gap:12px"}),hs=noites.slice(-7).map(function(n){var s=C.por[n.data].sono;return {titulo:dataBR(n.data).slice(0,5)+" · "+shDiaInfo(n.data).nome.split(",")[0],sub:s.inicio?"dormiu "+shV(s.inicio)+" · acordou "+shV(s.fim||"—"):"horário não informado",meta:shV(shHm(n.v)+(s.nota!=null?" · "+s.nota:""))}});
    ch.appendChild(hs.length?rkLista(hs):rkEstado("vazio","Sem horários."));
    ch.appendChild(h("span",{class:"rac-t-sec",text:reg.suficiente?"Regularidade em "+reg.n+" noites: dormir entre "+shV(reg.dormirMin+" e "+reg.dormirMax)+" (variação de "+shV(reg.dormirDpMin+" min")+").":"Regularidade: menos de 8 noites com horário, então ainda não é calculada."}));
    dir.appendChild(rkCard("Horários e regularidade",ch,{origem:"O horário vem do relógio só como hora, sem a data; trabalho em turnos distorce."}));
    /* meta pessoal */
    var cm=h("div",{class:"rac-pilha",style:"gap:12px"});
    if(m7==null)cm.appendChild(rkEstado("vazio","Sem 5 noites com dado nos últimos 7 dias para comparar com a meta."));
    else{var def=j7.reduce(function(s,x){return s+Math.max(0,meta-x.v)},0);cm.appendChild(rkMedidor(Math.round(m7/meta*100),null,"Média de 7 dias frente à meta",shV(shHm(m7)+" de "+meta+" h")));
      cm.appendChild(h("span",{class:"rac-t-sec",text:"Déficit de sono nas "+j7.length+" noites com dado: "+shV(shHm(def))+" (soma do que ficou abaixo da meta; noites acima não compensam)."}))}
    dir.appendChild(rkCard("Meta pessoal de sono",cm,{sub:"A meta é "+meta+" h e pode ser alterada em Inteligência → Ajustes."}));
    shCabSinais(C,["s4"]).forEach(function(c){dir.appendChild(c)});
    var a5=NUCLEO.sauSonoVfc(C.dias,C.hoje),c5=h("div",{class:"rac-pilha",style:"gap:12px"});
    c5.appendChild(a5.mostrar?rkAlerta("info","Associação entre sono e VFC",C.pr.ocultar?"detalhes ocultos":"Nas "+a5.n+" noites com os dois dados das últimas 8 semanas, a VFC "+(a5.r>0?"acompanha":"anda no sentido oposto d")+(a5.r>0?" a duração do sono":"a duração do sono")+" (correlação "+String(a5.r).replace(".",",")+"). É uma associação, não prova que um causa o outro."):
      rkEstado("neutro","Sem associação para mostrar: "+a5.motivo+". Janela: "+a5.janela+"; "+a5.n+" pares válidos."));
    dir.appendChild(rkCard("Sono × VFC",c5,{origem:"Só aparece com pelo menos 8 pares e correlação de 0,4 ou mais (em módulo)."}));
    return L}
  /* ---- Atividades ---- */
  function shLinhaAtiv(a,esc){var d=a.dados,T=ativTipo(a.tipo),l=[distTxt(a),d.duracao?durTxt(d.duracao):"",ritmo(a),d.fc?"batimentos "+Math.round(d.fc)+(d.fcMax?" (máx. "+Math.round(d.fcMax)+")":""):"",d.carga?"carga "+Math.round(d.carga):"",d.series?d.series+" séries":""].filter(Boolean).join(" · ");
    return {titulo:T[1]+" "+(d.nome||T[0])+(d.recorde?" 🏅":""),sub:new Date(a.inicio).toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"2-digit",year:"2-digit"})+", "+a.inicio.slice(11,16)+(d.local&&!esc&&(d.nome||"").indexOf(d.local)<0?" · "+d.local:"")+(l?" · "+shV(l):""),
      meta:d.efeitoAerobico?"efeito "+shV(fmtN(d.efeitoAerobico)):null,href:"#saude/treino/"+a.id}}
  function shChips(opcs,atual,aoMudar,rotulo){var cx=h("div",{class:"ag-chips",role:"group","aria-label":rotulo});
    opcs.forEach(function(o){var b=h("button",{type:"button",class:"rac-chip","aria-pressed":String(atual===o[0]),text:o[1]});b.onclick=function(){aoMudar(o[0])};cx.appendChild(b)});return cx}
  function shAtividades(C,S){var L=[],todas=C.ativs;
    if(!todas.length){L.push(h("div",{class:"rh-largo"},rkEstado("vazio","Nenhum treino registrado ainda.")));return L}
    var usados=[];todas.forEach(function(a){if(usados.indexOf(a.tipo)<0)usados.push(a.tipo)});if(usados.indexOf(SH.tipo)<0)SH.tipo="";
    var dias=SH_PER_ATIV[SH.pAtiv]||90,ini=maisDias(C.hoje,-dias+1),mar=NUCLEO.SAU_MARCO.data;if(ini<mar)ini=mar;
    var fil=todas.filter(function(a){return (!SH.tipo||a.tipo===SH.tipo)&&a.inicio.slice(0,10)>=ini});
    var nos=h("div",{class:"rh-largo rac-pilha",style:"gap:12px"});
    nos.appendChild(shChips([["","Todos"]].concat(usados.map(function(t){return [t,ativTipo(t)[1]+" "+ativTipo(t)[0]]})),SH.tipo,function(t){SH.tipo=t;SH.mais=30;shPintar(S)},"Modalidade"));
    nos.appendChild(shChips([["30","30 dias"],["90","3 meses"],["180","6 meses"],["tudo","Tudo"]],SH.pAtiv,function(p){SH.pAtiv=p;SH.mais=30;shPintar(S)},"Período"));
    L.push(nos);
    var cons=NUCLEO.pnConsistencia(fil.map(function(a){return a.inicio}),ini,C.hoje),r=NUCLEO.sauResumoAtiv(fil);
    var k=h("section",{class:"rh-kpis","aria-label":"Indicadores das atividades"});
    k.appendChild(rkKpi({rotulo:"Atividades",valor:shV(String(r.n)),apoio:cons.diasAtivos+" dias ativos no período"}));
    k.appendChild(rkKpi({rotulo:"Por semana",valor:shV(shN(cons.porSemana,1)),apoio:"meta pessoal "+C.pr.treinos+(C.pr.treinos===1?" treino":" treinos")+" por semana",alerta:cons.porSemana<C.pr.treinos&&r.n>0}));
    k.appendChild(rkKpi({rotulo:"Semanas ativas",valor:shV(cons.semanasAtivas+" de "+cons.semanas),apoio:"sequência atual: "+cons.sequenciaAtual+(cons.sequenciaAtual===1?" semana":" semanas")+" · recorde "+cons.maiorSequencia}));
    k.appendChild(rkKpi({rotulo:"Tempo e distância",valor:shV(durTxt(r.duracaoSeg)),apoio:shV(shN(r.distanciaKm,0)+" km")+(r.fcMedia?" · FC média "+shV(String(Math.round(r.fcMedia))):"")}));
    L.push(k);
    var esq=h("div",{class:"rh-prio sh-col"}),dir=h("div",{class:"rh-lado sh-col"});L.push(esq,dir);
    /* a lista, com todos os tipos (inclusive os que o quadro antigo escondia) */
    var cl=h("div",{class:"rac-pilha",style:"gap:12px"});
    if(!fil.length)cl.appendChild(rkEstado("vazio","Nenhuma atividade nesta modalidade e período.",(SH.tipo||SH.pAtiv!=="tudo")?(function(){var b=rkBtn("sec","Mostrar tudo");b.onclick=function(){SH.tipo="";SH.pAtiv="tudo";shPintar(S)};return b})():null));
    else{cl.appendChild(rkLista(fil.slice(0,SH.mais).map(function(a){return shLinhaAtiv(a,C.pr.esconderLocal)}),true));
      if(fil.length>SH.mais){var mais=rkBtn("sec","Ver mais ("+(fil.length-SH.mais)+")");mais.onclick=function(){SH.mais+=50;shPintar(S)};cl.appendChild(mais)}}
    esq.appendChild(rkCard("Histórico de atividades",cl,{sub:fil.length+(fil.length===1?" atividade":" atividades")+" desde "+dataBR(ini)+". Toque numa para ver o treino completo.",origem:"Inclui aparelhos, águas abertas e bike, que o quadro antigo escondia."}));
    /* S6: carga semanal, na escala da Garmin (sem misturar com minutos) */
    var sems=NUCLEO.sauCargaSemanal(todas,C.hoje,8),v=NUCLEO.sauCargaVariacao(sems),cc=h("div",{class:"rac-pilha",style:"gap:12px"}),B=sems.map(function(w){return {nome:"semana de "+dataBR(w.sem),cima:w.sem.slice(8),baixo:"seg"}});
    if(!sems.some(function(w){return w.carga>0}))cc.appendChild(rkEstado("vazio","Nenhum treino com carga de exercício registrada nas últimas 8 semanas."));
    else{cc.appendChild(h("div",{class:"rac-grafico"},rsColunas(B,sems.map(function(w){return w.carga}),function(x){return shV(String(Math.round(x)))},function(i){var w=sems[i],q=v.semanas[i];return [B[i].nome+(q.parcial?" (em andamento)":""),shPrefs().ocultar?"valor oculto":"carga "+w.carga+" · "+w.treinos+(w.treinos===1?" treino":" treinos")+(q.media4!=null?" · média das 4 anteriores "+Math.round(q.media4):"")+(w.semCarga?" · "+w.semCarga+" sem carga":"")]})));
      var FR={alta_persistente:["aviso","Carga acima do habitual nas duas últimas semanas completas (1,3× a média das 4 anteriores ou mais). Observe a recuperação."],queda_persistente:["info","Carga abaixo do habitual nas duas últimas semanas completas (0,7× a média das 4 anteriores ou menos)."],
        pico_isolado:["neutro","Houve uma semana bem acima da média, mas isolada: um pico não é tendência."],estavel:["ok","Carga dentro do habitual."],insuficiente:["neutro","Sem base para comparar: é preciso 4 semanas de referência com pelo menos 3 treinos com carga."]};
      cc.appendChild(rkEstado(FR[v.estado][0]==="ok"?"ok":FR[v.estado][0]==="aviso"?"aviso":"vazio",FR[v.estado][1]));
      var sc=sems.reduce(function(s,w){return s+w.semCarga},0);if(sc)cc.appendChild(h("span",{class:"rac-t-sec",text:sc+(sc===1?" treino sem carga registrada não entra":" treinos sem carga registrada não entram")+" (a carga da Garmin não é substituída por minutos)."}))}
    dir.appendChild(rkCard("Carga semanal",cc,{sub:"Soma da carga de exercício da Garmin, de segunda a domingo, comparada com a média das 4 semanas anteriores.",origem:"A semana em andamento aparece, mas não decide a leitura. A carga é uma estimativa da Garmin."}));
    /* S9: musculação */
    var mu=NUCLEO.sauMusculacao(todas,C.hoje,Math.min(dias,365)),cmu=h("div",{class:"rac-pilha",style:"gap:12px"});
    if(!mu.sessoes)cmu.appendChild(rkEstado("vazio","Nenhuma sessão de musculação no período."));
    else{cmu.appendChild(rsKpis([["Sessões",shV(String(mu.sessoes))],["Mediana do intervalo",mu.mediana!=null?shV(mu.mediana+(mu.mediana===1?" dia":" dias")):"—"],["Maior intervalo",mu.maior!=null?shV(mu.maior+(mu.maior===1?" dia":" dias")):"—"],["Em dias seguidos",mu.intervalos.length?shV(String(mu.consecutivos)):"—"],
        ["Séries (total)",mu.comSeries?shV(String(mu.series)):"—"],["Repetições (total)",mu.comRepeticoes?shV(String(mu.repeticoes)):"—"]]));
      cmu.appendChild(h("span",{class:"rac-t-sec",text:(mu.dias<2?"Com uma sessão só não há intervalo. ":"")+"Séries e repetições somam só as sessões em que o relógio registrou ("+mu.comSeries+" de "+mu.sessoes+"). O histórico não guarda exercício nem grupo muscular, então o RAC não diz o que foi treinado."}))}
    dir.appendChild(rkCard("Musculação",cmu,{sub:"Intervalo entre sessões, em dias."}));
    var rs=NUCLEO.sauResumoAtiv(fil);
    if(rs.n)dir.appendChild(rkCard("Esforço no período",rsKpis([["Efeito aeróbico (média)",rs.efeitoAerobico!=null?shV(shN(rs.efeitoAerobico,1)):"—"],["Efeito anaeróbico (média)",rs.efeitoAnaerobico!=null?shV(shN(rs.efeitoAnaerobico,1)):"—"],["FC média",rs.fcMedia!=null?shV(String(Math.round(rs.fcMedia))):"—"]]),
      {sub:"Efeito de 0 a 5: de 2 a 3 mantém o condicionamento, de 3 a 4 melhora, acima de 4 é muito puxado.",origem:"Médias só das "+rs.comEfeito+" atividades que têm o dado."}));
    return L}
  /* ---- Condicionamento ---- */
  function shCondicionamento(C){var L=[],v=NUCLEO.sauVo2(C.ativs,C.hoje),esq=h("div",{class:"rh-prio sh-col"}),dir=h("div",{class:"rh-lado sh-col"});L.push(esq,dir);
    var cv=h("div",{class:"rac-pilha",style:"gap:12px"});
    if(!v.n)cv.appendChild(rkEstado("vazio","Nenhuma atividade registrou VO₂ máx. A Garmin só informa esse valor em certos treinos (em geral corrida e bike ao ar livre); o RAC não estima o que não existe."));
    else{var TD={subindo:["ok","Subindo: a mediana de 4 semanas subiu 1 ponto ou mais nas duas comparações seguidas."],caindo:["aviso","Caindo: a mediana de 4 semanas caiu 1 ponto ou mais nas duas comparações seguidas."],estavel:["ok","Estável: sem mudança persistente de 1 ponto ou mais."],insuficiente:["vazio","Ainda sem amostra para dizer a tendência (precisa de pelo menos 2 valores em cada janela de 4 semanas)."]};
      cv.appendChild(rsKpis([["Mediana das últimas 4 semanas",v.atual!=null?shV(shN(v.atual,1)):"—"],["Último valor",shV(shN(v.ultimo.v,1))+" ("+shData(v.ultimo.data)+")"],["Há 3 meses",v.v3?shV(shN(v.v3.de,1)+" → "+shN(v.v3.para,1)):"sem amostra"],["Há 6 meses",v.v6?shV(shN(v.v6.de,1)+" → "+shN(v.v6.para,1)):"sem amostra"]]));
      cv.appendChild(rkEstado(TD[v.tendencia][0],TD[v.tendencia][1]));
      if(v.movel.length>=2){var B=v.movel.map(function(m){return {nome:"4 semanas até "+dataBR(m.fim),cima:m.fim.slice(8),baixo:MES3[+m.fim.slice(5,7)-1]}}),mn=Math.min.apply(null,v.movel.map(function(m){return m.med}))-2;
        cv.appendChild(h("div",{class:"rac-grafico"},rsColunas(B,v.movel.map(function(m){return Math.max(1,m.med-mn)}),function(s){return shV(shN(s+mn,1))},function(i){return [B[i].nome,shPrefs().ocultar?"valor oculto":"mediana "+shN(v.movel[i].med,1)+" · "+v.movel[i].n+" valores"]})))}}
    esq.appendChild(rkCard("VO₂ máx",cv,{sub:"Mediana móvel de 4 semanas, só com valores presentes nas atividades.",origem:"O valor muda pouco e depende do tipo de treino; períodos de 3 e 6 meses só aparecem com amostra nas duas pontas."}));
    /* minutos de intensidade por semana */
    var ms=NUCLEO.sauMinutosSemana(C.dias,C.hoje,12),cm=h("div",{class:"rac-pilha",style:"gap:12px"}),B2=ms.map(function(w){return {nome:"semana de "+dataBR(w.sem),cima:w.sem.slice(8),baixo:"seg"}});
    if(!ms.some(function(w){return w.min!=null}))cm.appendChild(rkEstado("vazio","O relógio não registrou minutos de intensidade nestas semanas."));
    else{cm.appendChild(h("div",{class:"rac-grafico"},rsColunas(B2,ms.map(function(w){return w.min||0}),function(x){return shV(String(Math.round(x)))},function(i){var w=ms[i];return [B2[i].nome+(w.parcial?" (em andamento)":""),w.min==null?"sem registro":shPrefs().ocultar?"valor oculto":w.min+" min de "+w.meta+" · "+w.dias+(w.dias===1?" dia":" dias")+" medidos"]})));
      var at=ms[ms.length-1],ant=ms[ms.length-2];cm.appendChild(rkMedidor(Math.min(100,Math.round((at.min||0)/at.meta*100)),null,"Semana atual frente à meta de "+at.meta+" min",shV((at.min||0)+" de "+at.meta+" min (em andamento)")));
      cm.appendChild(h("span",{class:"rac-t-sec",text:"Semana anterior: "+(ant&&ant.min!=null?shV(ant.min+" min")+(ant.min>=ant.meta?" (meta atingida)":" (abaixo da meta)"):"sem registro")+". Conta da Garmin: minutos moderados + 2 × minutos vigorosos."}))}
    dir.appendChild(rkCard("Minutos de intensidade",cm,{sub:"Meta semanal de 150 minutos.",origem:"Vêm do resumo diário; semanas com dias sem medida podem ficar abaixo do real."}));
    /* eficiência aeróbica */
    var ef=NUCLEO.sauEficiencia(C.ativs,C.hoje),ce=h("div",{class:"rac-pilha",style:"gap:12px"}),NT={running:"Corrida",treadmill_running:"Esteira",walking:"Caminhada"};
    if(!ef.length)ce.appendChild(rkEstado("vazio","Sem atividades comparáveis (corrida, esteira ou caminhada de 2 km ou mais, com batimentos e relevo registrados)."));
    else ef.forEach(function(e){if(e.comparavel){var dif=(e.atual-e.anterior)/e.anterior*100;ce.appendChild(rkLista([{titulo:NT[e.tipo],sub:"mediana das últimas 4 semanas × 4 anteriores, em metros por batimento",
        meta:shV(shN(e.atual,2)+" × "+shN(e.anterior,2)+" ("+(dif>0?"+":"−")+Math.abs(Math.round(dif))+"%)")}]));ce.appendChild(h("span",{class:"rac-t-sec",text:"Diferença observada em "+e.nAtual+" e "+e.nAnterior+" atividades de esforço e terreno parecidos (FC perto de "+shV(String(Math.round(e.fcRef)))+" bpm). Calor, vento e sono não são guardados: o RAC não afirma melhora."}))}
      else ce.appendChild(rkEstado("vazio",NT[e.tipo]+": comparação inadequada ("+e.motivo+"). "+e.comparaveis+" de "+e.elegiveis+" atividades elegíveis têm esforço parecido."))});
    dir.appendChild(rkCard("Eficiência aeróbica",ce,{sub:"Metros por batimento em atividades do mesmo tipo, de terreno quase plano e esforço parecido.",origem:"Maior costuma ser melhor, desde que as condições sejam as mesmas."}));
    var fit=(C.dias.slice().reverse().filter(function(q){return q.dados.idadeFitness})[0]);
    dir.appendChild(rkCard("Idade do condicionamento",fit?rsKpis([["Valor atual",shV(shN(fit.dados.idadeFitness.fitness,1)+" anos")],["Idade real",shV(String(fit.dados.idadeFitness.real))],["Possível",shV(shN(fit.dados.idadeFitness.possivel,1)+" anos")]]):rkEstado("vazio","Sem valor registrado."),
      {sub:fit?"Valor atual, de "+dataBR(fit.data)+".":"",origem:"O relógio só guarda o valor mais recente: não há histórico nem tendência."}));
    return L}
  /* ---- Tendências ---- */
  function shTendencias(C,S){var L=[],M=SAUDE_MET.filter(function(m){return m[0]===SH.met})[0]||SAUDE_MET[0],di=PESSOAL.diario||{};
    var dh=C.dias.map(function(d){var x=di[d.data];return {data:d.data,dados:Object.assign({},d.dados,{humor:x?x.h:undefined})}});   /* cópia: o humor entra só nesta tela e os dados originais não mudam */
    var ct=h("div",{class:"rac-pilha",style:"gap:12px"});
    ct.appendChild(shChips(SAUDE_MET.map(function(m){return [m[0],m[1]]}),M[0],function(k){SH.met=k;shPintar(S)},"Métrica"));
    ct.appendChild(shChips([["30","30 dias"],["90","3 meses"],["365","1 ano"]],SH.per,function(p){SH.per=p;shPintar(S)},"Período"));
    var g=NUCLEO.sauAgrupar(dh,M[2],SH.per,C.hoje);
    if(g.length<2)ct.appendChild(rkEstado("vazio","Poucos dados nesse período."));
    else{g.forEach(function(x){var dt=new Date((SH.per==="365"?x.k+"-01":x.k)+"T12:00:00");
        if(SH.per==="30"){x.cima=x.k.slice(8);x.baixo="DSTQQSS".charAt(dt.getDay());x.det=dt.toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"2-digit",year:"numeric"})}
        else if(SH.per==="90"){x.cima=x.k.slice(8);x.baixo=MES3[+x.k.slice(5,7)-1];x.det="semana de "+dataBR(x.k)+" · média de "+x.vs.length+(x.vs.length===1?" dia":" dias")}
        else{x.cima=MES3[+x.k.slice(5,7)-1];x.baixo=x.k.slice(2,4);x.det=x.cima+"/"+x.baixo+" · média de "+x.vs.length+(x.vs.length===1?" dia":" dias")}});
      var vs=g.map(function(x){return x.v}),media=NUCLEO.sauMedia(vs),mx=Math.max.apply(null,vs),mn=Math.min.apply(null,vs),ult=g[g.length-1].v,dif=ult-media,bom=M[5]?dif>=0:dif<=0,base=M[0]==="passos"||M[0]==="sono"?0:Math.max(0,Math.floor(mn*0.85));
      ct.appendChild(rsKpis([["Média do período",shV(M[3](media))],["Melhor",shV(M[3](M[5]?mx:mn))],["Pior",shV(M[3](M[5]?mn:mx))],["Último × média",shV((dif>0?"+":"−")+M[3](Math.abs(dif)))+(Math.abs(dif)<media*0.03?"":bom?" ✓":" ⚠")]]));
      ct.appendChild(h("div",{class:"rac-grafico"},rsColunas(g.map(function(x){return {nome:x.det,cima:x.cima,baixo:x.baixo}}),vs.map(function(v){return Math.max(1,v-base)}),function(s){return shV(M[0]==="sono"?shHm(s+base).replace(/^(\d+)h(\d+)$/,"$1:$2"):M[0]==="passos"?(s+base>=1000?fmtN(Math.round((s+base)/100)/10)+"k":String(Math.round(s+base))):String(Math.round(s+base)))},function(i){return [g[i].det,shPrefs().ocultar?"valor oculto":M[1]+": "+M[3](vs[i])]})));
      if(base)ct.appendChild(h("span",{class:"rac-t-legenda",text:"As colunas começam perto do menor valor para destacar a variação."}))}
    L.push(h("div",{class:"rh-largo"},rkCard("Tendência: "+M[1],ct,{sub:"30 dias = um valor por dia; 3 meses = média por semana; 1 ano = média por mês."})));
    /* S11: últimas 4 semanas × 4 anteriores, separando tendência de oscilação */
    var mu=NUCLEO.sauMudancas(C.dias,C.hoje),SE={tendencia:["aviso","tendência"],oscilacao:["neutro","oscilação"],estavel:["ok","estável"],sem:["neutro","sem amostra"]};
    L.push(h("div",{class:"rh-largo"},rkCard("Últimas 4 semanas × 4 anteriores",rkLista(mu.map(function(m){var f=function(v){return shN(v,m.dec)+" "+m.un};
        return {titulo:m.nome,sub:m.estado==="sem"?m.motivo:"mediana "+shV(f(m.atual))+" × "+shV(f(m.anterior))+" ("+shV((m.dif>0?"+":"−")+shN(Math.abs(m.dif),m.dec))+") · "+m.nAtual+" e "+m.nAnterior+" dias com dado"+
          (m.estado==="tendencia"?" · repetiu na janela deslocada 2 semanas ("+(m.melhor?"a favor":"contra")+")":m.estado==="oscilacao"?" · não se repetiu na janela deslocada: oscilação":""),meta:rkSelo(SE[m.estado][0],SE[m.estado][1])}})),
      {sub:"Mediana de 4 semanas contra as 4 anteriores, com limiar próprio de cada medida. Só vira tendência se a mesma direção se repetir numa segunda janela, deslocada 2 semanas; senão é oscilação normal.",origem:"Precisa de 20 dias com a medida em cada janela. Sazonalidade, férias e doença também mudam estes números."})));
    return L}
  /* ---- Inteligência ---- */
  function shInteligencia(C,S){var L=[],oc=C.pr.ocultar;
    L.push(h("div",{class:"rh-largo"},rkAlerta("info","Regras abertas, sem IA","Tudo aqui é cálculo do RAC a partir dos seus registros do relógio, sem chamada paga. Cada sinal mostra o que foi observado, a comparação com o seu normal, a janela e a amostra, uma hipótese (marcada) e uma orientação leve. "+NUCLEO.SAU_LIMITE)));
    var G=h("div",{class:"rh-dois"});L.push(G);shCabSinais(C,["s1","s2","s3","s4"]).forEach(function(c){G.appendChild(c)});
    /* análises semanais e mensais, só com amostra suficiente */
    var sems=NUCLEO.sauCargaVariacao(NUCLEO.sauCargaSemanal(C.ativs,C.hoje,8)),a5=NUCLEO.sauSonoVfc(C.dias,C.hoje),r8=NUCLEO.sauRecuperacaoTreino(C.dias,C.ativs,C.hoje),mu=NUCLEO.sauMudancas(C.dias,C.hoje),tend=mu.filter(function(m){return m.estado==="tendencia"}),v=NUCLEO.sauVo2(C.ativs,C.hoje);
    var linhas=[
      {titulo:"Sono × VFC",sub:a5.mostrar&&!oc?"correlação "+String(a5.r).replace(".",",")+" em "+a5.n+" noites (associação, não causa)":"não mostrada: "+a5.motivo,meta:rkSelo(a5.mostrar?"info":"neutro",a5.mostrar?"associação":"sem associação")},
      {titulo:"Recuperação depois de treino forte",sub:r8.n&&!oc?"a VFC costuma voltar à mediana em "+shN(r8.mediana,0)+(r8.mediana===1?" dia":" dias")+" (mediana de "+r8.n+" treinos; treino forte = carga de "+r8.limiar+" ou mais)"+(r8.naoVoltou?"; "+r8.naoVoltou+" não voltaram em 5 dias":""):r8.n?"calculada (valores ocultos)":"não calculada: "+r8.motivo,meta:rkSelo(r8.n?"info":"neutro",r8.n?"calculada":"sem amostra")},
      {titulo:"Carga de treino",sub:{alta_persistente:"acima do habitual nas 2 últimas semanas completas",queda_persistente:"abaixo do habitual nas 2 últimas semanas completas",pico_isolado:"um pico isolado, não é tendência",estavel:"dentro do habitual",insuficiente:"sem base (4 semanas de referência com 3 treinos com carga)"}[sems.estado],meta:rkSelo(sems.estado==="alta_persistente"?"aviso":sems.estado==="estavel"?"ok":"neutro",sems.estado==="alta_persistente"?"em observação":sems.estado==="estavel"?"estável":"sem sinal")},
      {titulo:"Mudança persistente (4 semanas × 4)",sub:tend.length?tend.map(function(m){return m.nome.toLowerCase()+" "+m.dir+(m.melhor?" (a favor)":" (contra)")}).join("; "):"nenhuma medida com a mesma direção em duas janelas",meta:rkSelo(tend.length?"aviso":"ok",tend.length?tend.length+(tend.length===1?" tendência":" tendências"):"sem tendência")},
      {titulo:"VO₂ máx",sub:v.n?"tendência "+{subindo:"subindo",caindo:"caindo",estavel:"estável",insuficiente:"ainda sem amostra"}[v.tendencia]:"nenhum treino registrou VO₂ máx",meta:rkSelo(v.n?"info":"neutro",v.n?"calculada":"sem dados")}];
    L.push(h("div",{class:"rh-largo"},rkCard("Análises de padrão",rkLista(linhas),{sub:"Cada uma só aparece com a amostra mínima definida na regra; senão diz por que não foi calculada.",origem:"Os detalhes estão nas abas Sono, Atividades, Condicionamento e Tendências."})));
    /* histórico dos sinais: quando começaram e quando deixaram de ser relevantes */
    var eps=[];C.sin.sinais.forEach(function(s){s.episodios.forEach(function(e){eps.push({nome:s.nome,e:e})})});eps.sort(function(a,b){return a.e.desde<b.e.desde?1:-1});
    var ch=eps.length?rkLista(eps.map(function(x){return {titulo:x.nome,sub:shEp(x.e),marca:x.e.aberto?"media":"ok"}})):rkEstado("vazio","Nenhum sinal persistente nos últimos 60 dias.");
    L.push(h("div",{class:"rh-largo"},rkCard("Histórico dos sinais",ch,{sub:"Um sinal liga quando o padrão se repete e só desliga depois de 2 dias normais seguidos (histerese).",origem:"Janela de 60 dias."})));
    L.push(h("div",{class:"rh-dois"},shQualidade(C),shAjustes(C,S)));
    /* padrões do diário e do treino: as regras anteriores, preservadas */
    var ins=NUCLEO.saudeInsights(C.dias,C.ativs,C.hoje,isOwner());
    if(ins.length&&!oc)L.push(h("div",{class:"rh-largo"},rkRecolher("Padrões do diário e do treino","(regras anteriores)",h("div",{class:"rac-pilha",style:"gap:8px"},rkLista(ins.map(function(t){return {titulo:t}})),
      h("span",{class:"rac-t-legenda",text:"Cálculo anterior à modernização, mantido como estava: a “carga” pode usar minutos quando a Garmin não informa carga, e a correlação mínima é mais baixa que a das análises acima. Use como pista, não como conclusão."})))));
    var lg=shLegado(S);if(lg)L.push(h("div",{class:"rh-largo"},lg));
    return L}
  /* S12: saúde dos dados */
  function shQualidade(C){var q=C.sin.qualidade,NM={sono:"Sono",vfc:"VFC",fc:"FC de repouso",estresse:"Estresse",bb:"Body Battery"},corpo=h("div",{class:"rac-pilha",style:"gap:12px"});
    if(q.vazio)corpo.appendChild(rkEstado("vazio","Nenhum registro do relógio ainda."));
    else{corpo.appendChild(rkEstado(q.suprime?"aviso":"ok",q.suprime?"Dados desatualizados: "+q.motivo+". Os sinais ficam suspensos até o relógio sincronizar.":"Dados em dia (última atualização há cerca de "+q.atrasoH+" h)."));
      corpo.appendChild(rkLista(Object.keys(q.cobertura).map(function(k){var c=q.cobertura[k];return {titulo:NM[k],sub:c.n+" de "+c.de+" dias com dado",meta:rkSelo(c.pct>=70?"ok":"aviso",c.pct+"%"),marca:c.pct>=70?"ok":"media"}})));
      corpo.appendChild(h("span",{class:"rac-t-sec",text:"Último dia com registro: "+dataBR(q.ultimo)+". Dia sem linha pode ser relógio sem sincronizar ou sem uso: o RAC não os distingue."}))}
    var lei=SH.lei;if(lei&&lei.estado==="parcial")corpo.appendChild(rkAlerta("aviso","Leitura parcial",lei.falhas.join("; ")));
    if(isOwner()){var L2=SAUDE.legado||{dias:0,ativs:0};corpo.appendChild(h("span",{class:"rac-t-legenda",text:"Preservados e fora das análises: "+L2.dias+" dias e "+L2.ativs+" treinos anteriores a "+dataBR(NUCLEO.SAU_MARCO.data)+"."}))}
    return rkCard("Saúde dos dados",corpo,{sub:"Cobertura nos últimos 14 dias. Abaixo de 70% numa medida, o sinal que depende dela não é calculado.",origem:"Origem: garmin_dia e garmin_ativ, lidos do banco (o relógio só envia ao Garmin Connect quando sincroniza)."})}
  /* ajustes do dono: metas, ocultar valores e esconder o local (preferências pessoais, PESSOAL.saudePrefs) */
  function shAjustes(C,S){var P=C.pr,corpo=h("div",{class:"rac-pilha",style:"gap:12px"}),fs=rkCampo("Meta de sono (horas por noite)","sh-meta-sono",{ajuda:"Entre 4 e 12. Padrão: 7."}),ft=rkCampo("Meta de treinos por semana","sh-meta-treino",{ajuda:"Inteiro de 1 a 14. Padrão: 3."}),
      is=fs.querySelector("input"),it=ft.querySelector("input"),st=h("p",{class:"rac-t-sec",role:"status",style:"margin:0"});
    is.type="number";it.type="number";is.value=String(P.sonoH);it.value=String(P.treinos);is.step="0.5";
    function chk(id,rot,v){var c=h("input",{type:"checkbox",id:id}),l=h("label",{class:"sh-chk","for":id},c,h("span",{text:rot}));if(v)c.checked=true;return {l:l,c:c}}
    var o1=chk("sh-oculta","Ocultar os valores de saúde na tela (celular compartilhado)",P.ocultar),o2=chk("sh-local","Esconder o local dos treinos (telas e busca global)",P.esconderLocal),ok=rkBtn("pri","Salvar ajustes");
    ok.onclick=function(){var s=parseFloat(String(is.value).replace(",",".")),t=parseInt(it.value,10);
      if(!(s>=4&&s<=12)){st.textContent="A meta de sono precisa ficar entre 4 e 12 horas.";is.focus();return}
      if(!(t>=1&&t<=14)){st.textContent="A meta de treinos precisa ser um número inteiro de 1 a 14.";it.focus();return}
      pessoalGravar("saudePrefs",{sonoH:s,treinos:t,ocultar:o1.c.checked,esconderLocal:o2.c.checked},function(m){st.textContent=m||"✓ Ajustes salvos."});st.textContent="✓ Ajustes salvos.";shPintar(S)};
    [fs,ft,o1.l,o2.l,h("div",{class:"rac-linha-flex"},ok),st].forEach(function(n){corpo.appendChild(n)});
    return rkCard("Ajustes de Saúde",corpo,{sub:"Só mudam a apresentação e as metas dos sinais. Os dados e as contas continuam os mesmos.",origem:"Guardado na sua conta (preferências pessoais), sem tabela nova."})}
  /* histórico anterior ao marco de propriedade: preservado e fora das análises; só o dono mede e recupera (saudeRecuperar, em js/saude.js) */
  function shLegado(S){
    if(!isOwner())return null;var L=SAUDE.legado||{dias:0,ativs:0},M=NUCLEO.SAU_MARCO.data,corpo=h("div",{class:"rac-pilha",style:"gap:12px"});
    corpo.appendChild(h("p",{class:"rac-t-sec",style:"margin:0",text:"Guardados no banco: "+L.dias+(L.dias===1?" dia":" dias")+" e "+L.ativs+(L.ativs===1?" treino":" treinos")+" anteriores a "+dataBR(M)+"."}));
    var bm=rkBtn("sec","Medir o que a Garmin ainda tem"),br=rkBtn("pri","Recuperar o que falta"),st=h("p",{class:"rac-t-sec",role:"status",style:"margin:0"}),rel=h("div",{class:"famtabw"});br.disabled=true;
    function mostrar(r){rel.innerHTML="";var ms={};Object.keys(r.dias).concat(Object.keys(r.ativs)).forEach(function(k){ms[k]=1});var ks=Object.keys(ms).sort().reverse();
      if(!ks.length){rel.appendChild(h("p",{class:"empty",text:"A Garmin não devolveu nenhum dia nem treino anterior a "+dataBR(M)+"."}));return}
      var tb=h("table",{class:"famtab"});tb.appendChild(h("thead",null,h("tr",null,["Mês","Dias na Garmin","Dias novos","Treinos na Garmin","Treinos novos"].map(function(c){return h("th",{text:c})}))));
      tb.appendChild(h("tbody",null,ks.map(function(k){var d=r.dias[k]||{garmin:0,novos:0},a=r.ativs[k]||{garmin:0,novos:0};return h("tr",null,h("td",{text:k.slice(5)+"/"+k.slice(0,4)}),h("td",{text:String(d.garmin)}),h("td",{text:String(d.novos)}),h("td",{text:String(a.garmin)}),h("td",{text:String(a.novos)}))})));rel.appendChild(tb)}
    function rodar(contar){bm.disabled=br.disabled=true;
      saudeRecuperar(contar,function(t){st.textContent=t}).then(function(r){mostrar(r);
        if(contar){st.textContent="✓ Medição pronta. Nada foi gravado. “Dias novos” e “Treinos novos” são o que a Garmin devolveu e ainda não está no banco.";SAUDE.relLegado={msg:st.textContent,r:r};bm.disabled=false;br.disabled=false;return}
        st.textContent="✓ Recuperação concluída: "+r.novosDias+" dias e "+r.novosAtivs+" treinos gravados. Nenhuma linha existente foi alterada ou apagada.";
        SAUDE.relLegado={msg:st.textContent,r:r};   /* o relatório sobrevive ao redesenho da tela */
        return saudeCarregar().then(function(){bm.disabled=false;shPintar(S)})})
      .catch(function(e){logErro("Garmin (histórico)",e);bm.disabled=false;st.textContent="Não consegui: "+e.message})}
    if(SAUDE.relLegado){st.textContent=SAUDE.relLegado.msg;mostrar(SAUDE.relLegado.r);br.disabled=false}
    bm.onclick=function(){rodar(true)};
    br.onclick=function(){if(window.confirm("Gravar na sua conta os dias e treinos anteriores a "+dataBR(M)+" que a Garmin ainda devolve e que ainda não estão no banco? Nada que já existe é alterado ou apagado."))rodar(false)};
    [h("div",{class:"rac-linha-flex"},bm,br),st,rel].forEach(function(n){corpo.appendChild(n)});
    return rkCard("Histórico anterior à posse",corpo,{sub:"A posse do relógio começa em "+dataBR(M)+". O que veio antes é legado: continua guardado no banco e no backup, não entra em nenhuma análise e nunca é apagado.",origem:"Opcional: a recuperação só roda se você pedir."})}
  /* ---- a página ---- */
  var SH_ABA_FN={geral:shGeral,recuperacao:shRecuperacao,sono:shSono,atividades:shAtividades,condicionamento:shCondicionamento,tendencias:shTendencias,inteligencia:shInteligencia};
  function shAbertura(S,C){var hero=S.hero;hero.innerHTML="";
    var sinc=rkBtn("fantasma","Atualizar agora"),ocu=rkBtn("fantasma",C.pr.ocultar?"Mostrar valores":"Ocultar valores",{"aria-pressed":String(C.pr.ocultar)});S.bt=sinc;if(SAUDE.sinc)sinc.disabled=true;
    sinc.onclick=function(){shSincronizar(S)};
    ocu.onclick=function(){pessoalGravar("saudePrefs",Object.assign({},PESSOAL.saudePrefs||{},{ocultar:!C.pr.ocultar}));shPintar(S)};
    var q=C.sin.qualidade;
    hero.appendChild(h("div",null,h("h2",{text:"Saúde"}),h("p",{class:"rh-hero-data",text:new Date(C.hoje+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}),
      h("p",{class:"rh-hero-resumo",text:NUCLEO.sauFrase(C.ind,C.sin)}),h("p",{class:"rh-hero-resumo ag-hero-desc",text:"Recuperação, sono, treino e condicionamento a partir do relógio Garmin, sempre comparados com o seu normal, não com a média da população."})));
    hero.appendChild(h("div",{class:"rh-hero-acoes"},sinc,ocu));
    var ctx=h("div",{class:"rh-hero-ctx"});
    if(q.ultimo)ctx.appendChild(h("span",{class:"rh-chip",text:"Último dado: "+dataBR(q.ultimo)}));
    ctx.appendChild(h("span",{class:"rh-chip",text:"Origem: banco (relógio Garmin)"}));if(C.pr.ocultar)ctx.appendChild(h("span",{class:"rh-chip",text:"Valores ocultos"}));
    ctx.appendChild(S.st);hero.appendChild(ctx)}
  function shAviso(S,C){var q=C.sin.qualidade,a=S.aviso;a.innerHTML="";
    if(SH.lei&&SH.lei.estado==="parcial")a.appendChild(rkAlerta("aviso","Leitura parcial do relógio","Parte da leitura falhou ("+SH.lei.falhas.join("; ")+"). O que aparece vem do resto; tabelas que falharam não são tratadas como vazias."));
    if(q.suprime&&!q.vazio)a.appendChild(rkAlerta("aviso","Dados do relógio desatualizados","O último dado tem mais de 24 horas ("+(q.atrasoH>=48?Math.round(q.atrasoH/24)+" dias":q.atrasoH+" h")+"). Os sinais ficam suspensos até a próxima sincronização."));
    else if(q.baixa.length&&!q.vazio)a.appendChild(rkAlerta("info","Cobertura baixa","Menos de 70% dos últimos 14 dias têm "+q.baixa.map(function(k){return {sono:"sono",vfc:"VFC",fc:"FC de repouso",estresse:"estresse",bb:"Body Battery"}[k]}).join(", ")+". Os sinais que dependem dessas medidas só aparecem quando a janela tem dados suficientes."))}
  /* pinta a aba atual com o que já foi lido (sem reler o banco) */
  function shPintar(S){var D=shDados(),b=S.corpo;b.innerHTML="";
    if(!D.dias.length&&!D.ativs.length){S.hero.innerHTML="";S.hero.appendChild(h("div",null,h("h2",{text:"Saúde"}),h("p",{class:"rh-hero-resumo",text:"Ainda sem dados do relógio. Toque em “Atualizar agora”."})));
      var bt=rkBtn("fantasma","Atualizar agora");bt.onclick=function(){shSincronizar(S)};S.bt=bt;S.hero.appendChild(h("div",{class:"rh-hero-acoes"},bt));S.aviso.innerHTML="";b.appendChild(h("div",{class:"rh-largo"},rkEstado("vazio","Nenhum registro seu do relógio (a partir de "+dataBR(NUCLEO.SAU_MARCO.data)+").")));return}
    var C=shContexto();shAbertura(S,C);shAviso(S,C);S.raiz.classList.toggle("sh-oculto",C.pr.ocultar);
    try{SH_ABA_FN[SH.aba](C,S).forEach(function(n){if(n)b.appendChild(n)})}catch(e){logErro("saúde (aba "+SH.aba+")",e);b.appendChild(h("div",{class:"rh-largo"},rkEstado("erro","Não consegui montar esta área ("+e.message+").")))}
    b.appendChild(h("p",{class:"rh-largo rac-t-legenda",text:NUCLEO.SAU_LIMITE}))}
  /* "Atualizar agora": o mesmo pedido de sempre à função garmin (dias e treinos); depois relê o banco */
  function shSincronizar(S){if(SAUDE.sinc)return;if(S.bt)S.bt.disabled=true;
    SAUDE.sinc=saudeSincronizar(function(t){S.st.textContent=t}).then(function(){SH.lei=null;return saudeCarregar()}).then(function(){SAUDE.sinc=null;S.st.textContent="✓ Atualizado agora.";if(S.raiz.isConnected)shPintar(S)})
      .catch(function(e){SAUDE.sinc=null;if(S.bt)S.bt.disabled=false;logErro("Garmin",e);S.st.textContent=/Failed to send|not found|404|FunctionsFetchError/i.test(e.message)?"A função “garmin” ainda não está no Supabase (veja o passo a passo).":"Não consegui atualizar: "+e.message})}
  function shCarregar(S){var n=++SH.seq;function vale(){return n===SH.seq&&S.raiz.isConnected}
    var p=SAUDE.dias?Promise.resolve(SH.lei):saudeColetarLeitura().then(function(r){SH.lei=r;if(r.estado==="completa"||r.estado==="vazia"){SAUDE.dias=r.dias;SAUDE.ativs=r.ativs;SAUDE.legado=r.legado}
      if(r.estado==="falha")throw new Error(r.falhas.join("; "));return r});
    p.then(function(){if(!vale())return;shPintar(S);
      var D=shDados(),ult=null;D.dias.forEach(function(d){if(d.atualizado&&(!ult||d.atualizado>ult))ult=d.atualizado});
      S.st.textContent=ult?"Última atualização: "+new Date(ult).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"";
      /* abre atualizando se faz mais de 2 horas (como sempre), no máximo uma vez a cada 30 minutos */
      if(!SAUDE.sinc&&!ATU.semExternos&&Date.now()-SH.ultAuto>30*60e3&&(!ult||Date.now()-Date.parse(ult)>2*3600e3)){SH.ultAuto=Date.now();shSincronizar(S)}},
    function(e){if(!vale())return;logErro("saúde",e);S.corpo.innerHTML="";var bt=rkBtn("sec","Tentar de novo");bt.onclick=function(){SH.lei=null;renderSaude(null,SH.aba)};
      S.corpo.appendChild(h("div",{class:"rh-largo"},rkEstado("erro",/relation .* does not exist|schema cache|Could not find the table/i.test(e.message)?"Falta rodar o supabase/007_garmin.sql no Supabase para ligar esta área.":"Não consegui ler os dados do relógio ("+e.message+").",bt)))})}
  function renderSaude(treino,aba){
    var root=$("#saude-view");root.innerHTML="";window.scrollTo(0,0);
    if(treino){(SAUDE.ativs?Promise.resolve():saudeCarregar()).then(function(){saudeTreino(root,treino)}).catch(function(e){root.appendChild(h("div",{class:"panel"},h("p",{class:"empty",text:"Não consegui carregar ("+e.message+")."})))});return}
    SH.aba=SH_ABAS.some(function(a){return a[0]===aba})?aba:"geral";
    var S={raiz:h("div",{class:"rh sh"}),hero:h("section",{class:"rh-hero","aria-label":"Resumo da saúde"}),aviso:h("div",{class:"rh-largo"}),corpo:h("div",{class:"rh rh-largo sh-corpo"}),st:h("p",{class:"rh-chip",role:"status"}),bt:null,
      abas:h("nav",{class:"rh-largo sh-abas","aria-label":"Áreas da Saúde"},SH_ABAS.map(function(a){return h("a",{class:"rac-chip",href:"#saude"+(a[0]==="geral"?"":"/"+a[0]),"aria-pressed":String(SH.aba===a[0]),"aria-current":SH.aba===a[0]?"page":null,text:a[1]})}))};
    S.hero.appendChild(h("div",null,h("h2",{text:"Saúde"}),h("p",{class:"rh-hero-resumo",text:"Lendo os dados do relógio…"})));
    S.corpo.appendChild(rkEstado("carregando","Lendo os dados do relógio…"));
    [S.hero,S.abas,S.aviso,S.corpo].forEach(function(x){S.raiz.appendChild(x)});root.appendChild(S.raiz);
    shCarregar(S)}
