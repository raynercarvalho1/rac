/* Núcleo do Dia a Dia RAC: funções puras (sem tela nem banco), usadas pelo site e pelos testes automáticos (tests/).
   Carregado antes do script principal; expõe window.RACnucleo. */
(function (raiz) {
  function norm(t){return String(t||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()}
  /* link digitado sem "https://" (ex.: site.com/pagina) abriria como página do próprio site e daria 404 */
  function urlAbs(u){u=String(u||"").trim();return !u||/^([a-z][a-z0-9+.-]*:|#|\/|\.)/i.test(u)?u:"https://"+u}

  /* Abastecimento pela foto: lê a resposta do Claude (JSON ou texto) e devolve veículo, data, km, litros, preço e total */
  function lerAbast(txt){
    var t=String(txt||"").replace(/[“”„]/g,'"').replace(/[‘’]/g,"'"),j=null,a=t.indexOf("{"),b=t.lastIndexOf("}");
    if(a>=0&&b>a){var x=t.slice(a,b+1);try{j=JSON.parse(x)}catch(e){try{j=JSON.parse(x.replace(/,\s*([}\]])/g,"$1").replace(/:\s*(-?\d+),(\d+)(?=\s*[,}])/g,":$1.$2"))}catch(e2){}}}
    j=j||{};
    /* sem JSON (ou faltando campos): procura no texto */
    function campo(k,re){if(j[k]==null){var m=re.exec(t);if(m)j[k]=m[1]}}
    campo("veiculo",/"?ve[ií]culo"?\s*[:=]\s*"?(carro|moto)/i);campo("km",/"?km"?\s*[:=]\s*"?([\d.]+)/i);campo("litros",/"?litros"?\s*[:=]\s*"?([\d.,]+)/i);
    campo("preco_litro",/"?pre[cç]o[_ ]?(?:por[_ ])?litro"?\s*[:=]\s*"?(?:R\$\s*)?([\d.,]+)/i);campo("total",/"?total"?\s*[:=]\s*"?(?:R\$\s*)?([\d.,]+)/i);campo("data",/(\d{4}-\d{2}-\d{2})/);
    function n(v){if(typeof v==="number")return v;v=String(v==null?"":v).replace(/[^\d,.-]/g,"");if(!v)return null;if(/,/.test(v))v=v.replace(/\./g,"").replace(",",".");var x=parseFloat(v);return isFinite(x)?x:null}
    var ve=String(j.veiculo||"");
    var r={veiculo:/moto/i.test(ve)?"moto":/c3/i.test(ve)?"c3":/carro|civic/i.test(ve)?"civic":"",
      data:/^\d{4}-\d{2}-\d{2}$/.test(j.data||"")?j.data:"",km:j.km==null?null:parseInt(String(j.km).replace(/\D/g,""),10)||null,
      litros:n(j.litros),preco:n(j.preco_litro!=null?j.preco_litro:j.precoLitro),total:n(j.total),
      alertas:(Array.isArray(j.alertas)?j.alertas:[]).map(function(a){return String(a||"").trim()}).filter(Boolean),combustivel:String(j.combustivel||(/gasolina|etanol|[aá]lcool|diesel/i.exec(t)||[""])[0]).toLowerCase().replace(/[aá]lcool/,"etanol"),posto:String(j.posto||"").trim()};
    if(r.total==null&&r.litros&&r.preco)r.total=Math.round(r.litros*r.preco*100)/100;
    if(r.preco==null&&r.litros&&r.total)r.preco=Math.round(r.total/r.litros*1000)/1000;
    return r}
  var TEMAS=[
    ["python","Python",/\bpython\b|\bpandas\b|jupyter|numpy/i,"python"],
    ["sql","SQL e bancos de dados",/\bsql\b|banco[s]? de dados|postgres|mysql|bigquery|snowflake|oracle db/i,"sql"],
    ["bi","BI e visualização de dados",/power ?bi|\bdax\b|tableau|looker|data ?vi[sz]|visualiza[cç][aã]o de dados|dashboards?|business intelligence|\bbi\b/i,"bi"],
    ["estat","Estatística",/estat[ií]stic|probabilidade|regress[aã]o|teste[s]? de hip[oó]tese|infer[eê]ncia|distribui[cç][aã]o normal/i],
    ["ml","Machine learning e ciência de dados",/machine learning|aprendizado de m[aá]quina|modelos? preditivos?|deep learning|redes neurais|ci[eê]ncia de dados|cientista de dados|data scien/i],
    ["ia","Inteligência artificial",/intelig[eê]ncia artificial|\bia\b|\bai\b|ia generativa|\bllms?\b|chatgpt|gemini|claude|copilot|agentes? de ia/i],
    ["eng","Engenharia de dados",/engenh\w* de dados|data engineer|pipelines? de dados|\betl\b|\belt\b|spark|databricks|airflow|data lake|lakehouse|\bdbt\b/i],
    ["cloud","Nuvem",/\baws\b|azure|google cloud|\bgcp\b|computa[cç][aã]o em nuvem|\bcloud\b/i],
    ["agil","Metodologias ágeis",/[aá]geis|\b[aá]gil\b|scrum|kanban/i],
    ["redes","Análise de redes",/social network|an[aá]lise de redes|\bgrafos?\b/i],
    ["analytics","Análise de dados",/an[aá]lise de dados|analista de dados|data analyst|analytics/i]];
  function temasDe(txt){txt=String(txt||"");return TEMAS.filter(function(t){return t[2].test(txt)}).map(function(t){return t[0]})}

  /* importação com "juntar": completa os dados de um registro sem apagar nada; devolve null se não mudou */
  function juntarDados(velho,novo){var d=Object.assign({},velho||{}),mudou=false;
    Object.keys(novo||{}).forEach(function(k){
      if(Array.isArray(novo[k])){var l=(d[k]||[]).slice(),chave=function(x){return norm(typeof x==="string"?x:x.nome||x.o||x.k||JSON.stringify(x))},tem={};l.forEach(function(x){tem[chave(x)]=1});
        novo[k].forEach(function(x){if(!tem[chave(x)]){l.push(x);mudou=true}});d[k]=l}
      else if(d[k]==null){d[k]=novo[k];mudou=true}});
    return mudou?d:null}
  /* Carreira: competências que aparecem em vagas de dados, para comparar com o seu perfil */
  var SKILLS=[
    ["sql","SQL",/\bsql\b|consultas? em banco|postgres|mysql|sql server|oracle|bigquery|snowflake|redshift/i],
    ["powerbi","Power BI",/power ?bi|\bdax\b|power query|\bpbi\b/i],
    ["excel","Excel avançado",/excel|planilhas?|vba|tabelas? din[aâ]micas?|proc ?v/i],
    ["python","Python",/\bpython\b|pandas|numpy|jupyter/i],
    ["r","R",/\blinguagem r\b|\bem r\b|\br\/|rstudio|tidyverse/i],
    ["estat","Estatística",/estat[ií]stic|teste[s]? de hip[oó]tese|regress[aã]o|infer[eê]ncia/i],
    ["ml","Machine learning",/machine learning|aprendizado de m[aá]quina|modelos? preditivos?|scikit|xgboost/i],
    ["viz","Visualização (Tableau, Looker…)",/tableau|looker|qlik|metabase|data ?viz|visualiza[cç][aã]o de dados|storytelling/i],
    ["etl","ETL e engenharia de dados",/\betl\b|\belt\b|pipelines?|airflow|\bdbt\b|spark|databricks|data lake|lakehouse|integra[cç][aã]o de dados/i],
    ["cloud","Nuvem (AWS, Azure, GCP)",/\baws\b|azure|google cloud|\bgcp\b|cloud/i],
    ["negocio","Requisitos de negócio",/requisitos|regras? de neg[oó]cio|stakeholders?|levantamento|vis[aã]o de neg[oó]cio|kpis?|indicadores/i],
    ["agil","Metodologias ágeis",/[aá]geis|\b[aá]gil\b|scrum|kanban|jira/i],
    ["ingles","Inglês",/ingl[eê]s|english/i],
    ["git","Git",/\bgit\b|github|gitlab/i],
    ["ia","IA generativa",/ia generativa|\bllms?\b|genai|chatgpt|prompt/i],
    ["sap","SAP / ERP",/\bsap\b|\berp\b|totvs|protheus/i]];
  /* o que o texto da vaga pede, o que você tem e o que falta (nota de 0 a 100) */
  function compatVaga(texto,meus){
    var pede=SKILLS.filter(function(k){return k[2].test(String(texto||""))}).map(function(k){return k[0]}),tem=pede.filter(function(k){return (meus||[]).indexOf(k)>=0});
    return {pede:pede,tem:tem,falta:pede.filter(function(k){return tem.indexOf(k)<0}),nota:pede.length?Math.round(tem.length/pede.length*100):null}}
  /* ===== Bebê: percentis da OMS, Napper e vacinas ===== */
  /* OMS (método LMS): z de uma medida e a medida de um z; percentil pela normal padrão */
  function omsZ(lms,x){var L=lms[0],M=lms[1],S=lms[2];return Math.abs(L)<1e-9?Math.log(x/M)/S:(Math.pow(x/M,L)-1)/(L*S)}
  function omsValor(lms,z){var L=lms[0],M=lms[1],S=lms[2];return Math.abs(L)<1e-9?M*Math.exp(S*z):M*Math.pow(1+L*S*z,1/L)}
  function percentilDeZ(z){var t=1/(1+0.2316419*Math.abs(z)),d=0.3989423*Math.exp(-z*z/2),p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return Math.round((z>0?1-p:p)*1000)/10}
  /* CSV do Napper: uma linha por evento; vira {chave, tipo, inicio, fim, dados} (a chave evita duplicar ao importar de novo) */
  function csvLinhas(txt){var out=[],linha=[],campo="",q=false;txt=String(txt||"").replace(/^﻿/,"");
    for(var i=0;i<txt.length;i++){var c=txt[i];if(q){if(c==='"'){if(txt[i+1]==='"'){campo+='"';i++}else q=false}else campo+=c}
      else if(c==='"')q=true;else if(c===","){linha.push(campo);campo=""}else if(c==="\n"||c==="\r"){if(c==="\r"&&txt[i+1]==="\n")i++;linha.push(campo);campo="";if(linha.length>1||linha[0])out.push(linha);linha=[]}else campo+=c}
    if(campo||linha.length){linha.push(campo);out.push(linha)}return out}
  var NAPPER_TIPOS={NURSING:"peito",BOTTLE:"mamadeira",NAP:"sono",CHANGED_DIAPER:"fralda",NIGHT_WAKING:"despertar",BED_TIME:"dormir",WOKE_UP:"acordar",PUMPING:"ordenha",MEDICINE:"remedio",SOLIDS:"papinha",TEMPERATURE:"temperatura",BATH:"banho"};
  function napperLer(txt){
    var l=csvLinhas(txt);if(!l.length)return [];var cab=l[0].map(function(x){return x.trim()}),ix={};cab.forEach(function(c,i){ix[c]=i});
    if(ix.category==null||ix.start==null)throw new Error("esse arquivo não parece uma exportação do Napper (faltam as colunas start e category)");
    function v(r,k){var x=ix[k]==null?"":r[ix[k]];return x==null||x===""?null:x}
    function num(r,k){var x=v(r,k);return x==null?null:+x}
    return l.slice(1).filter(function(r){return v(r,"category")&&v(r,"start")}).map(function(r){
      var cat=v(r,"category"),d={};
      if(cat==="NURSING"){d.esq=num(r,"breastLeftSeconds");d.dir=num(r,"breastRightSeconds")}
      if(cat==="BOTTLE"){d.ml=num(r,"feedingAmount");d.leite=v(r,"bottleFeedingType")==="BREAST_MILK"?"materno":v(r,"bottleFeedingType")==="FORMULA"?"formula":null}
      if(cat==="CHANGED_DIAPER")d.conteudo=({WET:"xixi",DIRTY:"coco",MIXED:"xixi e coco"})[v(r,"diaperContent")]||null;
      if(cat==="PUMPING"){d.esq=num(r,"amountPumpedLeft");d.dir=num(r,"amountPumpedRight")}
      if(cat==="NAP"){d.como=v(r,"howBabySlept");d.acordou=v(r,"howBabyWoke")}
      if(cat==="TEMPERATURE")d.temp=num(r,"temperature");
      if(v(r,"comment"))d.obs=v(r,"comment");
      Object.keys(d).forEach(function(k){if(d[k]==null)delete d[k]});
      return {chave:"napper:"+cat+":"+v(r,"start")+":"+(v(r,"createdAt")||""),tipo:NAPPER_TIPOS[cat]||cat.toLowerCase(),inicio:v(r,"start"),fim:v(r,"end")||v(r,"start"),dados:d}})}
  /* resumo por dia (data local do início): mamadas, ml, fraldas, sono e despertares.
     Noite = da hora de dormir até a de acordar (até 16 h depois), menos os despertares; ela conta no dia em que começou.
     Soneca registrada dentro de uma noite não é somada de novo. */
  function bebeDias(evs){
    var D={};function dia(k){return D[k]=D[k]||{data:k,peito:0,peitoMin:0,mamadeira:0,mlFormula:0,mlMaterno:0,fraldas:0,xixi:0,coco:0,sonoMin:0,sonecaMin:0,noiteMin:0,sonecas:0,despertares:0,ordenhaMl:0,remedios:0}}
    function t(x){return new Date(x).getTime()}
    var ord=evs.slice().sort(function(a,b){return t(a.inicio)-t(b.inicio)}),noites=[];
    ord.forEach(function(e,i){if(e.tipo!=="dormir")return;var ate=t(e.inicio)+16*36e5;
      for(var j=i+1;j<ord.length&&t(ord[j].inicio)<=ate;j++){if(ord[j].tipo==="dormir")break;if(ord[j].tipo==="acordar"){noites.push({de:t(e.inicio),ate:t(ord[j].inicio),dia:String(e.inicio).slice(0,10)});break}}});
    function naNoite(x){return noites.filter(function(n){return x>=n.de&&x<n.ate})[0]}
    noites.forEach(function(n){var acordado=ord.filter(function(e){return e.tipo==="despertar"&&t(e.inicio)>=n.de&&t(e.inicio)<n.ate}).reduce(function(s,e){return s+Math.max(0,t(e.fim)-t(e.inicio))},0);
      var d=dia(n.dia);d.noiteMin+=Math.round((n.ate-n.de-acordado)/6e4)});
    ord.forEach(function(e){var d=dia(String(e.inicio).slice(0,10)),x=e.dados||{},min=Math.max(0,(t(e.fim)-t(e.inicio))/6e4);
      if(e.tipo==="peito"){d.peito++;d.peitoMin+=Math.round(((x.esq||0)+(x.dir||0))/60)}
      else if(e.tipo==="mamadeira"){d.mamadeira++;if(x.leite==="materno")d.mlMaterno+=x.ml||0;else d.mlFormula+=x.ml||0}
      else if(e.tipo==="fralda"){d.fraldas++;if(/xixi/.test(x.conteudo||""))d.xixi++;if(/coco/.test(x.conteudo||""))d.coco++}
      else if(e.tipo==="sono"){if(!naNoite(t(e.inicio))){d.sonecaMin+=Math.round(min);d.sonecas++}}
      else if(e.tipo==="despertar")d.despertares++;
      else if(e.tipo==="ordenha")d.ordenhaMl+=(x.esq||0)+(x.dir||0);
      else if(e.tipo==="remedio")d.remedios++});
    return Object.keys(D).sort().map(function(k){var d=D[k];d.sonoMin=d.sonecaMin+d.noiteMin;return d})}
  /* calendário básico de vacinação do SUS (PNI) até 15 meses: [idade em meses, vacina, palavras para reconhecer no registro] */
  var VACINAS_PNI=[[0,"BCG",/bcg/i],[0,"Hepatite B (ao nascer)",/hepatite b|hep\.? ?b/i],
    [2,"Pentavalente (1ª dose)",/penta/i],[2,"Poliomielite VIP (1ª dose)",/vip|polio/i],[2,"Rotavírus (1ª dose)",/rota/i],[2,"Pneumocócica 10 (1ª dose)",/pneumo/i],
    [3,"Meningocócica C (1ª dose)",/meningo/i],
    [4,"Pentavalente (2ª dose)",/penta/i],[4,"Poliomielite VIP (2ª dose)",/vip|polio/i],[4,"Rotavírus (2ª dose)",/rota/i],[4,"Pneumocócica 10 (2ª dose)",/pneumo/i],
    [5,"Meningocócica C (2ª dose)",/meningo/i],[6,"Pentavalente (3ª dose)",/penta/i],[6,"Poliomielite VIP (3ª dose)",/vip|polio/i],[6,"Influenza (gripe)",/influenza|gripe/i],
    [9,"Febre amarela",/febre amarela/i],[12,"Tríplice viral",/tr[ií]plice viral|sarampo/i],[12,"Pneumocócica 10 (reforço)",/pneumo/i],[12,"Meningocócica (reforço)",/meningo/i],
    [15,"DTP (1º reforço)",/dtp|tr[ií]plice bacteriana/i],[15,"Poliomielite (reforço)",/vip|vop|polio/i],[15,"Hepatite A",/hepatite a|hep\.? ?a\b/i],[15,"Tetraviral",/tetra ?viral|varicela/i]];
  /* cada vacina do calendário com a data prevista e se já foi tomada (conta quantas vezes o nome aparece nos registros, na ordem das doses) */
  function vacinasCalendario(nasc,textosTomadas){
    var usados={};return VACINAS_PNI.map(function(v){var d=new Date(nasc+"T12:00:00");d.setMonth(d.getMonth()+v[0]);var prev=d.toISOString().slice(0,10);
      var k=String(v[2]),n=(textosTomadas||[]).filter(function(t){return v[2].test(t)}).length;usados[k]=(usados[k]||0)+1;
      return {meses:v[0],nome:v[1],prevista:prev,tomada:n>=usados[k]}})}
  /* ===== Saúde: prontidão do dia e cruzamentos ===== */
  function mediana(l){l=l.slice().sort(function(a,b){return a-b});var n=l.length;return n?(n%2?l[(n-1)/2]:(l[n/2-1]+l[n/2])/2):null}
  function quartis(l){l=l.slice().sort(function(a,b){return a-b});return [mediana(l.slice(0,Math.floor(l.length/2))),mediana(l.slice(Math.ceil(l.length/2)))]}
  /* nota de 0 a 100 do dia "data" contra a faixa normal dos 60 dias anteriores; dias = [{data, dados}] (garmin_dia) */
  function prontidao(dias,data){
    var hoje=dias.filter(function(d){return d.data===data})[0];if(!hoje)return null;
    var base=dias.filter(function(d){return d.data<data&&d.data>=somaDiasISO(data,-60)}),x=hoje.dados||{};
    function serie(f){return base.map(function(d){return f(d.dados||{})}).filter(function(v){return typeof v==="number"})}
    function comp(v,l,inverso){if(typeof v!=="number"||l.length<10)return null;var m=mediana(l),q=quartis(l),dp=Math.max((q[1]-q[0])/1.35,inverso?2:3),z=(v-m)/dp;if(inverso)z=-z;return {v:v,mediana:m,z:z,nota:Math.max(0,Math.min(100,Math.round(55+18*z)))}}
    var fVfc=function(d){return d.vfc&&d.vfc.noite},fFc=function(d){return d.fcRepouso},fSono=function(d){return d.sono&&d.sono.total?d.sono.total/3600:null},fEst=function(d){return d.estresse};
    var c={vfc:comp(fVfc(x),serie(fVfc)),fc:comp(fFc(x),serie(fFc),true),sono:null,bb:typeof x.bbMax==="number"?{v:x.bbMax,nota:x.bbMax}:null};
    var hs=fSono(x);if(hs!=null)c.sono={v:hs,nota:Math.max(0,Math.min(100,Math.round(hs/8*85+((x.sono.nota||70)-70)/2)))};
    var pesos={vfc:.35,fc:.25,sono:.25,bb:.15},soma=0,tot=0;Object.keys(pesos).forEach(function(k){if(c[k]){soma+=c[k].nota*pesos[k];tot+=pesos[k]}});
    if(!tot)return null;var nota=Math.round(soma/tot);
    var alertas=[];
    if(c.vfc&&(c.vfc.z<-1.5||(x.vfc.faixaMin&&c.vfc.v<x.vfc.faixaMin)))alertas.push("Variabilidade cardíaca de "+c.vfc.v+" ms, abaixo do seu normal ("+Math.round(c.vfc.mediana)+" ms)");
    if(c.fc&&c.fc.v>=c.fc.mediana+5)alertas.push("Batimentos em repouso em "+c.fc.v+" por minuto, "+Math.round(c.fc.v-c.fc.mediana)+" acima do seu normal");
    var ontem=dias.filter(function(d){return d.data===somaDiasISO(data,-1)})[0];
    if(hs!=null&&hs<6&&ontem&&fSono(ontem.dados||{})!=null&&fSono(ontem.dados)<6)alertas.push("Duas noites seguidas com menos de 6 h de sono");
    var est=fEst(x),le=serie(fEst);if(typeof est==="number"&&le.length>=10&&est>mediana(le)+15)alertas.push("Estresse médio de "+est+", bem acima do seu normal ("+Math.round(mediana(le))+")");
    return {nota:nota,rotulo:nota>=70?"Pronto para treinar forte":nota>=45?"Bom para treino moderado":"Dia de recuperação",partes:c,alertas:alertas}}
  function somaDiasISO(iso,n){var d=new Date(iso+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
  function correlacao(xs,ys){var n=xs.length;if(n<8)return null;var mx=xs.reduce(function(a,b){return a+b},0)/n,my=ys.reduce(function(a,b){return a+b},0)/n,sxy=0,sxx=0,syy=0;
    for(var i=0;i<n;i++){sxy+=(xs[i]-mx)*(ys[i]-my);sxx+=(xs[i]-mx)*(xs[i]-mx);syy+=(ys[i]-my)*(ys[i]-my)}return sxx&&syy?sxy/Math.sqrt(sxx*syy):null}
  /* ===== Saúde: marco de propriedade do relógio (DS-4.2, docs/planejamento/09-auditoria-saude-garmin.md, seção 16) =====
     O relógio foi comprado usado. A regra aprovada pelo dono é só temporal: o registro cuja DATA DO EVENTO é anterior ao marco é "legado"
     (preservado no banco e no backup, mas fora de toda análise pessoal); de 01/01/2026 em diante, inclusive, é "meu". A data de recebimento
     ou de sincronização nunca entra na regra, e a localização também não. Nada aqui apaga, grava ou altera linhas: só separa. */
  var SAU_MARCO={data:"2026-01-01",evento:"primeiro_login",regra:"data_do_evento",inclusivo:true,
    origem:"informado pelo dono em 13/11/2026: conta Garmin Connect pessoal, relógio restaurado de fábrica antes do primeiro login"};
  function sauDataDe(v){var s=String(v==null?"":v).slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:null}
  /* true = meu, false = legado, null = sem data utilizável (não dá para classificar) */
  function sauMeu(valor,marco){var d=sauDataDe(valor),m=sauDataDe(marco&&marco.data)||SAU_MARCO.data,inc=!marco||marco.inclusivo!==false;
    if(!d)return null;return inc?d>=m:d>m}
  /* dias = [{data,...}] (garmin_dia) e ativs = [{inicio,...}] (garmin_ativ). Dias e treinos são classificados cada um pela própria data (um nunca
     decide o outro). As linhas devolvidas são as MESMAS recebidas (nenhuma cópia, nenhuma alteração), na mesma ordem. */
  function sauClassificar(dias,ativs,marco){
    var m={data:sauDataDe(marco&&marco.data)||SAU_MARCO.data,evento:(marco&&marco.evento)||SAU_MARCO.evento,regra:SAU_MARCO.regra,inclusivo:!marco||marco.inclusivo!==false};
    var o={marco:m,meus:{dias:[],ativs:[]},legado:{dias:[],ativs:[]},semData:{dias:0,ativs:0}};
    (dias||[]).forEach(function(x){var r=sauMeu(x&&x.data,m);if(r===null)o.semData.dias++;else (r?o.meus:o.legado).dias.push(x)});
    (ativs||[]).forEach(function(x){var r=sauMeu(x&&x.inicio,m);if(r===null)o.semData.ativs++;else (r?o.meus:o.legado).ativs.push(x)});
    o.contagem={meus:{dias:o.meus.dias.length,ativs:o.meus.ativs.length},legado:{dias:o.legado.dias.length,ativs:o.legado.ativs.length}};
    return o}
  /* ===== Saúde: regras puras da modernização (DS-4.3; docs/saude.md e docs/planejamento/09-auditoria-saude-garmin.md, seções 5 a 13) =====
     Tudo aqui recebe linhas já classificadas como "meus" (sauClassificar) e devolve valores novos: nenhuma função altera as linhas recebidas, lê banco ou
     desenha. dias = [{data, dados, atualizado?}] (garmin_dia, em ordem crescente) e ativs = [{id, inicio, tipo, dados}] (garmin_ativ).
     Princípios: persistência antes de alerta; qualidade dos dados antes dos sinais; hipótese separada de observação; nada de diagnóstico. */
  var SAU_LIMITE="O relógio não substitui avaliação médica: diante de sintomas ou de alterações que persistem, procure orientação profissional.";
  var SAU_METAS={sonoH:7,treinos:3,minutos:150};
  var SAU_COBERTURA_MIN=.7,SAU_ATRASO_H=24,SAU_HISTERESE=2,SAU_BASE_MIN=14;
  function sauNum(v){return typeof v==="number"&&isFinite(v)?v:null}
  function sauMedia(l){return l.length?l.reduce(function(a,b){return a+b},0)/l.length:null}
  function sauArred(v,n){var f=Math.pow(10,n||0);return Math.round(v*f)/f}
  /* como ler cada medida de um dia (dados de garmin_dia): sempre número ou null */
  var SAU_CAMPOS={
    vfc:function(d){return sauNum(d.vfc&&d.vfc.noite)},fc:function(d){return sauNum(d.fcRepouso)},estresse:function(d){return sauNum(d.estresse)},
    sono:function(d){return d.sono&&sauNum(d.sono.total)?d.sono.total/3600:null},nota:function(d){return d.sono?sauNum(d.sono.nota):null},
    bb:function(d){return sauNum(d.bbMax)},passos:function(d){return sauNum(d.passos)}};
  /* as medidas das comparações de período (S11): limiar = mudança mínima da mediana para contar */
  var SAU_METRICAS=[{k:"vfc",nome:"Variabilidade cardíaca",un:"ms",limiar:5,maior:true,dec:0},{k:"fc",nome:"Batimentos em repouso",un:"por minuto",limiar:3,maior:false,dec:0},
    {k:"estresse",nome:"Estresse médio",un:"pontos",limiar:5,maior:false,dec:0},{k:"sono",nome:"Duração do sono",un:"h",limiar:.5,maior:true,dec:1},
    {k:"bb",nome:"Energia do corpo",un:"pontos",limiar:8,maior:true,dec:0},{k:"passos",nome:"Passos",un:"passos",limiar:1500,maior:true,dec:0}];
  function sauPor(dias){var o={};(dias||[]).forEach(function(x){var k=sauDataDe(x&&x.data);if(k)o[k]=x.dados||{}});return o}
  /* os valores de f nos n dias que terminam em fim (inclusive): [{data, v}], só dos dias que têm a medida */
  function sauJanela(por,fim,n,f){var out=[];for(var i=n-1;i>=0;i--){var k=somaDiasISO(fim,-i),d=por[k];if(!d)continue;var v=f(d);if(v!=null)out.push({data:k,v:v})}return out}
  function sauVals(l){return l.map(function(x){return x.v})}
  /* linha de base pessoal: n dias que terminam em fimBase; mediana e desvio robusto (quartis/1,35, como a prontidão); null com menos de minN valores */
  function sauBase(por,fimBase,n,f,minN){var l=sauJanela(por,fimBase,n,f);if(l.length<(minN||SAU_BASE_MIN))return null;var v=sauVals(l);return {med:mediana(v),dp:(quartis(v)[1]-quartis(v)[0])/1.35,n:l.length}}
  /* horário de dormir "HH:MM" em minutos contados desde o meio-dia anterior (23:30 → 690+...; 00:30 vem depois das 23:30); null se inválido */
  function sauMinNoite(s){var m=/^(\d{1,2}):(\d{2})/.exec(String(s||""));if(!m)return null;var v=+m[1]*60+ +m[2];if(+m[1]>23||+m[2]>59)return null;return v<720?v+1440:v}
  function sauHora(min){min=((Math.round(min)%1440)+1440)%1440;return String(Math.floor(min/60)).padStart(2,"0")+":"+String(min%60).padStart(2,"0")}
  /* regularidade do horário de dormir (e de acordar) nos n dias que terminam em fim: precisa de pelo menos 8 noites com horário */
  function sauRegularidade(por,fim,n){var b=[],a=[];
    for(var i=n-1;i>=0;i--){var d=por[somaDiasISO(fim,-i)],s=d&&d.sono;if(!s)continue;var m=sauMinNoite(s.inicio);if(m!=null)b.push(m);var w=sauMinNoite(s.fim);if(w!=null)a.push(w)}
    if(b.length<8)return {n:b.length,suficiente:false};
    function dp(l){var m=sauMedia(l);return Math.sqrt(l.reduce(function(s,x){return s+(x-m)*(x-m)},0)/l.length)}
    return {n:b.length,suficiente:true,dormirMedio:sauHora(sauMedia(b)),dormirDpMin:Math.round(dp(b)),acordarMedio:a.length?sauHora(sauMedia(a)):null,acordarDpMin:a.length>=8?Math.round(dp(a)):null,
      dormirMin:sauHora(Math.min.apply(null,b)),dormirMax:sauHora(Math.max.apply(null,b))}}

  /* ---- S12: saúde dos dados. suprime = nada confiável a dizer (sem registros ou o último dado tem mais de 24 h); cobertura de cada medida nos últimos 14 dias ---- */
  function sauQualidade(dias,hoje,opc){opc=opc||{};var por=sauPor(dias),ks=Object.keys(por).sort(),agora=opc.agora==null?Date.now():opc.agora;
    if(!ks.length)return {vazio:true,suprime:true,motivo:"nenhum registro do relógio",cobertura:{},baixa:[],atrasoH:null,ultimo:null};
    var ultimo=ks[ks.length-1],at=null;(dias||[]).forEach(function(x){var t=Date.parse(x&&x.atualizado);if(isFinite(t)&&(at==null||t>at))at=t});
    var dd=Math.round((Date.parse(hoje+"T12:00:00Z")-Date.parse(ultimo+"T12:00:00Z"))/864e5),horas=at!=null?(agora-at)/36e5:(dd>=2?dd*24:0);
    var cob={},baixa=[];["sono","vfc","fc","estresse","bb"].forEach(function(k){var n=sauJanela(por,hoje,14,SAU_CAMPOS[k]).length;cob[k]={n:n,de:14,pct:Math.round(n/14*100)};if(n/14<SAU_COBERTURA_MIN)baixa.push(k)});
    var vel=horas>SAU_ATRASO_H;
    return {vazio:false,suprime:vel,desatualizado:vel,atrasoH:Math.round(horas),ultimo:ultimo,atualizado:at!=null?new Date(at).toISOString():null,cobertura:cob,baixa:baixa,
      motivo:vel?"o último dado do relógio tem mais de "+SAU_ATRASO_H+" horas":baixa.length?"cobertura abaixo de "+Math.round(SAU_COBERTURA_MIN*100)+"% em parte das medidas":""}}

  /* ---- S1 a S4: avaliação de UM dia D (com os dados até D). estado: "sim" (critério cumprido), "nao" ou "sem" (amostra ou cobertura insuficiente: não dá para calcular) ---- */
  function sauAvS1(por,D){
    var noites=[];for(var i=4;i>=0;i--){var d=por[somaDiasISO(D,-i)];if(!d)continue;var v=SAU_CAMPOS.vfc(d);if(v!=null)noites.push({v:v,min:sauNum(d.vfc&&d.vfc.faixaMin)})}
    if(noites.length<4)return {estado:"sem",motivo:"menos de 4 das últimas 5 noites com VFC",amostra:noites.length};
    var abaixoFaixa=noites.filter(function(n){return n.min!=null&&n.v<n.min}).length,b=sauBase(por,somaDiasISO(D,-7),60,SAU_CAMPOS.vfc),j7=sauJanela(por,D,7,SAU_CAMPOS.vfc),m7=null,lim=null,abaixoBase=0;
    if(b&&j7.length>=5){m7=sauMedia(sauVals(j7));lim=b.med-Math.max(b.dp,3);abaixoBase=noites.filter(function(n){return n.v<lim}).length}
    var A=abaixoFaixa>=3,B=m7!=null&&m7<lim&&abaixoBase>=3;
    return {estado:A||B?"sim":"nao",regra:A?"faixa":B?"base":null,amostra:noites.length,abaixoFaixa:abaixoFaixa,abaixoBase:abaixoBase,m7:m7,mediana:b?b.med:null,limite:lim,baseN:b?b.n:0}}
  function sauAvS2(por,D){
    var j=sauJanela(por,D,5,SAU_CAMPOS.fc);if(j.length<4)return {estado:"sem",motivo:"menos de 4 dos últimos 5 dias com FC de repouso",amostra:j.length};
    var b=sauBase(por,somaDiasISO(D,-5),30,SAU_CAMPOS.fc);if(!b)return {estado:"sem",motivo:"menos de "+SAU_BASE_MIN+" dias de base para a mediana de 30 dias",amostra:j.length};
    var ac=j.filter(function(x){return x.v>=b.med+5}).length;
    return {estado:ac>=3?"sim":"nao",amostra:j.length,acima:ac,mediana:b.med,atual:mediana(sauVals(j)),baseN:b.n}}
  function sauAvS3(por,D){
    var j=sauJanela(por,D,7,SAU_CAMPOS.estresse);if(j.length<5)return {estado:"sem",motivo:"menos de 5 dos últimos 7 dias com estresse",amostra:j.length};
    var b=sauBase(por,somaDiasISO(D,-7),60,SAU_CAMPOS.estresse);if(!b)return {estado:"sem",motivo:"menos de "+SAU_BASE_MIN+" dias de base para a mediana de 60 dias",amostra:j.length};
    var m7=sauMedia(sauVals(j)),el=j.filter(function(x){return x.v>=b.med+10}).length;
    return {estado:m7>=b.med+10&&el>=5?"sim":"nao",amostra:j.length,elevados:el,m7:m7,mediana:b.med,baseN:b.n}}
  function sauAvS4(por,D,opc){var meta=(opc&&opc.sonoH)||SAU_METAS.sonoH,j5=sauJanela(por,D,5,SAU_CAMPOS.sono);
    if(j5.length<4)return {estado:"sem",motivo:"menos de 4 das últimas 5 noites com sono",amostra:j5.length};
    var curtas=j5.filter(function(x){return x.v<6}).length,reg=sauRegularidade(por,D,14),j7=sauJanela(por,D,7,SAU_CAMPOS.sono),m7=j7.length>=5?sauMedia(sauVals(j7)):null,
      irregular=!!(reg.suficiente&&reg.dormirDpMin>60),curto=curtas>=3,defic=m7!=null&&m7<meta;
    return {estado:curto||(irregular&&defic)?"sim":"nao",regra:curto?"curto":irregular&&defic?"irregular":null,amostra:j5.length,curtas:curtas,regularidade:reg,m7:m7,meta:meta,irregular:irregular}}
  var SAU_SINAIS=[["s1","VFC abaixo do seu normal",sauAvS1],["s2","Batimentos em repouso elevados",sauAvS2],["s3","Estresse persistente",sauAvS3],["s4","Sono curto e irregular",sauAvS4]];
  function sauAvaliar(id,por,D,opc){for(var i=0;i<SAU_SINAIS.length;i++)if(SAU_SINAIS[i][0]===id)return SAU_SINAIS[i][2](por,D,opc||{});return {estado:"sem",motivo:"sinal desconhecido"}}
  /* o texto de cada sinal: observação (o dado), comparação com o padrão pessoal, janela e amostra, hipótese (rotulada) e orientação leve. Nunca diagnóstico. */
  function sauTextoSinal(id,x){x=x||{};var n1=function(v){return String(sauArred(v,0)).replace(".",",")};
    if(id==="s1")return {titulo:"VFC abaixo do seu normal",
      obs:x.regra==="base"?"A média de 7 dias da variabilidade cardíaca ("+n1(x.m7)+" ms) está abaixo do seu normal menos um desvio, e "+x.abaixoBase+" das últimas 5 noites ficaram abaixo desse limite."
        :x.abaixoFaixa+" das últimas 5 noites a variabilidade cardíaca ficou abaixo da faixa normal calculada pela Garmin.",
      comparacao:x.mediana!=null?"Seu normal (mediana de "+x.baseN+" noites): "+n1(x.mediana)+" ms"+(x.m7!=null?" · média de 7 dias: "+n1(x.m7)+" ms.":"."):"A faixa normal vem da própria Garmin.",
      janela:"Últimas 5 noites ("+x.amostra+" com dado)"+(x.baseN?" · base de "+x.baseN+" noites":""),
      hipotese:"Hipótese: costuma acompanhar sono curto, álcool, carga de treino alta, estresse ou início de doença. Uma noite isolada varia muito; aqui o padrão se repetiu.",
      orientacao:"Considere um treino leve e mais descanso nos próximos dias."};
    if(id==="s2")return {titulo:"Batimentos em repouso elevados",
      obs:x.acima+" dos últimos 5 dias com os batimentos em repouso 5 ou mais acima do seu normal.",
      comparacao:"Seu normal (mediana de "+x.baseN+" dias): "+n1(x.mediana)+" por minuto · últimos 5 dias: mediana de "+n1(x.atual)+" (+"+n1(x.atual-x.mediana)+").",
      janela:"Últimos 5 dias ("+x.amostra+" com dado) · base de "+x.baseN+" dias",
      hipotese:"Hipótese: calor, café, treino pesado no dia anterior, sono ruim ou início de infecção podem elevar os batimentos em repouso.",orientacao:"Observe como você se sente e, se possível, alivie o treino."};
    if(id==="s3")return {titulo:"Estresse persistente",
      obs:"A média de estresse dos últimos 7 dias ("+n1(x.m7)+") está pelo menos 10 pontos acima do seu normal, com "+x.elevados+" dos 7 dias elevados.",
      comparacao:"Seu normal (mediana de "+x.baseN+" dias): "+n1(x.mediana)+" · últimos 7 dias: "+n1(x.m7)+".",janela:"Últimos 7 dias ("+x.amostra+" com dado) · base de "+x.baseN+" dias",
      hipotese:"Hipótese: o estresse do relógio é fisiológico (vem da variabilidade cardíaca), não emocional; treino, doença e sono ruim também o elevam.",orientacao:"Reserve momentos de pausa e de descanso nos próximos dias."};
    if(id==="s4"){var r=x.regularidade||{};return {titulo:"Sono curto e irregular",
      obs:x.regra==="curto"?x.curtas+" das últimas 5 noites com menos de 6 horas de sono."
        :"O horário de dormir variou cerca de "+r.dormirDpMin+" minutos nas últimas "+r.n+" noites e a média de 7 dias ("+String(sauArred(x.m7,1)).replace(".",",")+" h) ficou abaixo da meta de "+x.meta+" h.",
      comparacao:"Meta pessoal: "+x.meta+" h"+(x.m7!=null?" · média de 7 dias: "+String(sauArred(x.m7,1)).replace(".",",")+" h":"")+(r.suficiente?" · horário de dormir médio "+r.dormirMedio+" (variação de "+r.dormirDpMin+" min)":"")+".",
      janela:"Últimas 5 noites ("+x.amostra+" com dado)"+(r.suficiente?" · regularidade em "+r.n+" noites":""),
      hipotese:"Hipótese: rotina, trabalho em turnos ou noites tardias costumam explicar o padrão. O horário vem do relógio só como hora, sem a data.",orientacao:"Tente antecipar e regularizar o horário de dormir por alguns dias."}}
    return {titulo:id}}
  /* o histórico dia a dia dos sinais S1 a S4 com HISTERESE: o sinal liga no primeiro dia em que o critério vale e só desliga depois de 2 dias normais seguidos
     ("sem" não conta como normal nem liga nada). Devolve, por sinal: ativo, desde, episódios [{desde, ate, ultimoAtivo, aberto}], dias [{data, estado}] */
  function sauHistoricoSinais(dias,hoje,opc){opc=opc||{};var por=sauPor(dias),N=opc.dias||60,out={};
    SAU_SINAIS.forEach(function(S){var ativo=false,normais=0,ep=null,eps=[],lista=[],ultSim=null,ultAtivo=null,ult=null;
      for(var i=N-1;i>=0;i--){var D=somaDiasISO(hoje,-i),av=S[2](por,D,opc);lista.push({data:D,estado:av.estado});ult=av;
        if(av.estado==="sim"){if(!ativo){ativo=true;ep={desde:D,ate:null,ultimoAtivo:D,aberto:true};eps.push(ep)}normais=0;ep.ultimoAtivo=D;ultSim=av;ultAtivo=D}
        else if(av.estado==="nao"&&ativo){normais++;if(normais>=SAU_HISTERESE){ativo=false;ep.ate=D;ep.aberto=false;normais=0}}}
      out[S[0]]={id:S[0],nome:S[1],ativo:ativo,normaisSeguidos:ativo?normais:0,emSaida:ativo&&normais>0,desde:ativo&&ep?ep.desde:null,episodios:eps,dias:lista,ultimoSim:ultSim,ultimoAtivo:ultAtivo,hoje:ult}});
    return out}
  /* o conjunto dos sinais de hoje: a qualidade dos dados (S12) vem antes; se o dado está velho, nenhum sinal é afirmado. visiveis = no máximo 3 ativos. */
  function sauSinais(dias,hoje,opc){opc=opc||{};var q=sauQualidade(dias,hoje,opc),h=sauHistoricoSinais(dias,hoje,opc),lista=[];
    SAU_SINAIS.forEach(function(S){var x=h[S[0]],estado=q.suprime||(x.hoje&&x.hoje.estado==="sem")?"suprimido":x.ativo?"ativo":"normal",
      motivo=q.suprime?q.motivo:estado==="suprimido"?(x.hoje&&x.hoje.motivo)||"dados insuficientes":"";
      lista.push({id:S[0],nome:S[1],estado:estado,motivo:motivo,desde:x.desde,emSaida:x.emSaida,episodios:x.episodios,dias:x.dias,texto:x.ultimoSim?sauTextoSinal(S[0],x.ultimoSim):null,hoje:x.hoje})});
    var ativos=lista.filter(function(s){return s.estado==="ativo"});
    return {qualidade:q,sinais:lista,ativos:ativos,visiveis:ativos.slice(0,3),limite:SAU_LIMITE}}

  /* ---- indicadores do dia contra o padrão pessoal (60 dias anteriores); sem comparação com menos de 14 valores de base ---- */
  function sauIndicadores(dias,hoje){var ult=null;(dias||[]).forEach(function(x){var k=sauDataDe(x&&x.data);if(k&&k<=hoje&&(!ult||k>ult.data))ult={data:k,dados:x.dados||{}}});
    if(!ult)return null;var por=sauPor(dias),pr=prontidao(dias,ult.data),o={data:ult.data,hoje:ult.data===hoje,itens:{},prontidao:pr?{nota:pr.nota,rotulo:pr.rotulo,partes:pr.partes,alertas:pr.alertas}:null};
    ["sono","vfc","fc","bb","estresse","nota"].forEach(function(k){var v=SAU_CAMPOS[k](ult.dados),b=sauBase(por,somaDiasISO(ult.data,-1),60,SAU_CAMPOS[k]);
      o.itens[k]={v:v,med:b?b.med:null,n:b?b.n:0,dif:v!=null&&b?v-b.med:null,pct:v!=null&&b&&b.med?Math.round((v-b.med)/b.med*100):null}});
    return o}
  /* a frase da abertura: só o que os dados dizem */
  function sauFrase(ind,sin){if(!ind)return "Ainda não há dados do relógio para resumir.";
    var p=[];p.push(ind.prontidao?"Prontidão "+ind.prontidao.nota+": "+ind.prontidao.rotulo.charAt(0).toLowerCase()+ind.prontidao.rotulo.slice(1)+".":"Sem dados suficientes para a prontidão.");
    if(!ind.hoje)p[0]=p[0].replace(/\.$/,"")+" (último dado: "+ind.data.split("-").reverse().join("/")+").";
    if(sin){if(sin.qualidade.suprime)p.push("Os sinais estão suspensos: "+sin.qualidade.motivo+".");
      else p.push(sin.ativos.length?sin.ativos.length+(sin.ativos.length===1?" sinal persistente em observação.":" sinais persistentes em observação."):"Nenhum sinal persistente.")}
    return p.join(" ")}

  /* ---- S5: sono × VFC (associação, nunca causa). Janela de até 8 semanas, pelo menos 8 pares e |r| >= 0,4 para mostrar ---- */
  function sauAssociacao(pares,min,corte){min=min||8;corte=corte||.4;var xs=pares.map(function(p){return p[0]}),ys=pares.map(function(p){return p[1]}),r=pares.length>=min?correlacao(xs,ys):null;
    return {n:pares.length,r:r==null?null:Math.round(r*100)/100,mostrar:r!=null&&Math.abs(r)>=corte,minimo:min,corte:corte,
      motivo:pares.length<min?"amostra pequena: "+pares.length+" pares (mínimo "+min+")":r==null?"sem variação suficiente":Math.abs(r)<corte?"associação fraca (|r| < "+String(corte).replace(".",",")+"): não é mostrada":""}}
  function sauSonoVfc(dias,hoje){var por=sauPor(dias),pares=[];for(var i=55;i>=0;i--){var d=por[somaDiasISO(hoje,-i)];if(!d)continue;var s=SAU_CAMPOS.sono(d),v=SAU_CAMPOS.vfc(d);if(s!=null&&v!=null)pares.push([s,v])}
    var a=sauAssociacao(pares);a.janela="últimas 8 semanas";return a}

  /* ---- treinos: carga (escala da Garmin, nunca misturada com minutos), semanas, musculação ---- */
  function sauDataAtiv(a){return sauDataDe(a&&a.inicio)}
  function sauCargaDe(a){var c=a&&a.dados&&sauNum(a.dados.carga);return c!=null&&c>0?c:null}
  /* semanas de segunda a domingo, da mais antiga à atual (parcial): [{sem, carga, treinos (com carga), semCarga, dias, total}] */
  function sauCargaSemanal(ativs,hoje,nSem){var mapa={},sems=[];
    for(var i=nSem-1;i>=0;i--){var s=pnSemana(somaDiasISO(hoje,-7*i));mapa[s]={sem:s,carga:0,treinos:0,semCarga:0,dias:{},total:0};sems.push(mapa[s])}
    (ativs||[]).forEach(function(a){var d=sauDataAtiv(a);if(!d||d>hoje)return;var w=mapa[pnSemana(d)];if(!w)return;w.total++;w.dias[d]=1;var c=sauCargaDe(a);if(c==null)w.semCarga++;else{w.carga+=c;w.treinos++}});
    sems.forEach(function(w){w.dias=Object.keys(w.dias).length;w.carga=Math.round(w.carga)});return sems}
  /* S6: cada semana contra a média das 4 anteriores; só vale com pelo menos 3 treinos com carga nas 4 de referência. Persistente = as DUAS últimas semanas completas
     no mesmo lado (acima de 1,3 ou abaixo de 0,7); um pico isolado (>= 1,5 numa só) é mostrado como pico, não como sinal. */
  function sauCargaVariacao(sems){var out=sems.map(function(w,i){var ref=sems.slice(Math.max(0,i-4),i),tr=ref.reduce(function(s,x){return s+x.treinos},0),ok=ref.length===4&&tr>=3,m=ok?ref.reduce(function(s,x){return s+x.carga},0)/4:null;
      return {sem:w.sem,carga:w.carga,media4:m,treinosRef:tr,ok:ok&&m>0,razao:ok&&m>0?Math.round(w.carga/m*100)/100:null,parcial:i===sems.length-1}});
    var c=out.filter(function(x){return !x.parcial}).slice(-2),estado="insuficiente";
    if(c.length===2&&c[0].ok&&c[1].ok){var r0=c[0].razao,r1=c[1].razao;
      estado=r0>=1.3&&r1>=1.3?"alta_persistente":r0<=.7&&r1<=.7?"queda_persistente":(r0>=1.5||r1>=1.5)?"pico_isolado":"estavel"}
    return {semanas:out,estado:estado}}
  function sauMediana0(l){return l.length?mediana(l):null}
  /* S9: musculação (strength_training): intervalo entre sessões (em dias, por dia distinto), sessões em dias seguidos e totais de séries e repetições quando existem.
     Não infere grupo muscular: o histórico não guarda isso. */
  function sauMusculacao(ativs,hoje,periodo){var ini=somaDiasISO(hoje,-(periodo||90)+1),L=(ativs||[]).filter(function(a){var d=sauDataAtiv(a);return a.tipo==="strength_training"&&d&&d>=ini&&d<=hoje}),
      ds=[],vis={};L.forEach(function(a){var d=sauDataAtiv(a);if(!vis[d]){vis[d]=1;ds.push(d)}});ds.sort();
    var iv=[];for(var i=1;i<ds.length;i++)iv.push(Math.round((Date.parse(ds[i]+"T12:00:00Z")-Date.parse(ds[i-1]+"T12:00:00Z"))/864e5));
    var comS=L.filter(function(a){return sauNum(a.dados&&a.dados.series)!=null}),comR=L.filter(function(a){return sauNum(a.dados&&a.dados.repeticoes)!=null});
    var dur=L.map(function(a){return sauNum(a.dados&&a.dados.duracao)}).filter(function(v){return v!=null}),fc=L.map(function(a){return sauNum(a.dados&&a.dados.fc)}).filter(function(v){return v!=null});
    return {sessoes:L.length,dias:ds.length,intervalos:iv,mediana:sauMediana0(iv),maior:iv.length?Math.max.apply(null,iv):null,consecutivos:iv.filter(function(x){return x===1}).length,
      series:comS.reduce(function(s,a){return s+a.dados.series},0),repeticoes:comR.reduce(function(s,a){return s+a.dados.repeticoes},0),comSeries:comS.length,comRepeticoes:comR.length,
      duracaoMin:dur.length?Math.round(sauMedia(dur)/60):null,fcMedia:fc.length?Math.round(sauMedia(fc)):null,ultima:ds.length?ds[ds.length-1]:null,
      semAtividadeDias:ds.length?Math.round((Date.parse(hoje+"T12:00:00Z")-Date.parse(ds[ds.length-1]+"T12:00:00Z"))/864e5):null}}
  /* o resumo de um conjunto de treinos do período (a aba Atividades) */
  function sauResumoAtiv(ativs){var dist=0,seg=0,fcs=[],ea=[],en=[];
    (ativs||[]).forEach(function(a){var d=a.dados||{};dist+=sauNum(d.distancia)||0;seg+=sauNum(d.duracao)||0;if(sauNum(d.fc)!=null)fcs.push(d.fc);if(sauNum(d.efeitoAerobico)!=null)ea.push(d.efeitoAerobico);if(sauNum(d.efeitoAnaerobico)!=null)en.push(d.efeitoAnaerobico)});
    return {n:(ativs||[]).length,distanciaKm:dist/1000,duracaoSeg:seg,fcMedia:fcs.length?sauMedia(fcs):null,efeitoAerobico:ea.length?sauMedia(ea):null,efeitoAnaerobico:en.length?sauMedia(en):null,comFc:fcs.length,comEfeito:ea.length}}

  /* ---- S4 (condicionamento): VO2 máx só com o que está em garmin_ativ; mediana móvel de 4 semanas; sem valor, sem estimativa ---- */
  function sauVo2(ativs,hoje){var pts=(ativs||[]).map(function(a){var v=a&&a.dados&&sauNum(a.dados.vo2max),d=sauDataAtiv(a);return v!=null&&v>0&&d&&d<=hoje?{data:d,v:v,tipo:a.tipo}:null}).filter(Boolean).sort(function(a,b){return a.data<b.data?-1:1});
    if(!pts.length)return {n:0,pontos:[],movel:[],tendencia:"sem_dados"};
    function med(fim){var l=pts.filter(function(p){return p.data<=fim&&p.data>somaDiasISO(fim,-28)});return {med:l.length>=2?mediana(sauVals(l)):null,n:l.length}}
    var movel=[];for(var i=25;i>=0;i--){var fim=somaDiasISO(hoje,-7*i),m=med(fim);if(m.med!=null)movel.push({fim:fim,med:m.med,n:m.n})}
    var w0=med(hoje),w1=med(somaDiasISO(hoje,-28)),w0b=med(somaDiasISO(hoje,-14)),w1b=med(somaDiasISO(hoje,-42)),t="insuficiente";
    if(w0.med!=null&&w1.med!=null&&w0b.med!=null&&w1b.med!=null){var d0=w0.med-w1.med,d1=w0b.med-w1b.med;t=Math.abs(d0)>=1&&Math.abs(d1)>=1&&(d0>0)===(d1>0)?(d0>0?"subindo":"caindo"):"estavel"}
    function var2(dias){var a=med(somaDiasISO(hoje,-dias));return w0.med!=null&&a.med!=null?{de:a.med,para:w0.med,dif:Math.round((w0.med-a.med)*10)/10,n0:w0.n,n1:a.n}:null}
    var ult=pts[pts.length-1];
    return {n:pts.length,pontos:pts.slice(-60),movel:movel,atual:w0.med,atualN:w0.n,ultimo:{data:ult.data,v:ult.v},tendencia:t,v3:var2(91),v6:var2(182)}}
  /* minutos de intensidade por semana (moderados + 2 × vigorosos, a conta da Garmin) contra a meta de 150; semana sem nenhum dia medido fica null */
  function sauMinutosSemana(dias,hoje,nSem,meta){var mapa={},sems=[];meta=meta||SAU_METAS.minutos;
    for(var i=nSem-1;i>=0;i--){var s=pnSemana(somaDiasISO(hoje,-7*i));mapa[s]={sem:s,min:null,dias:0,meta:meta,parcial:i===0};sems.push(mapa[s])}
    (dias||[]).forEach(function(x){var d=sauDataDe(x&&x.data);if(!d||d>hoje)return;var w=mapa[pnSemana(d)];if(!w)return;var dd=x.dados||{},m=sauNum(dd.minModerados),v=sauNum(dd.minVigorosos);
      if(m==null&&v==null)return;w.min=(w.min||0)+(m||0)+2*(v||0);w.dias++});return sems}
  /* eficiência aeróbica: metros por batimento (velocidade em m/min ÷ FC média) em atividades do mesmo tipo, de terreno quase plano (até 20 m de subida por km, ou esteira)
     e de esforço parecido (FC média a até 10 bpm da mediana do tipo). Calor e vento não são guardados: por isso nunca se afirma melhora, só a diferença observada. */
  function sauEficiencia(ativs,hoje){var tipos=["running","treadmill_running","walking"],out=[],ini56=somaDiasISO(hoje,-55);
    tipos.forEach(function(t){var c=(ativs||[]).map(function(a){var d=sauDataAtiv(a),x=a.dados||{};if(a.tipo!==t||!d||d>hoje)return null;var dist=sauNum(x.distancia),tm=sauNum(x.emMovimento)||sauNum(x.duracao),fc=sauNum(x.fc);
        if(!dist||dist<2000||!tm||fc==null||fc<100||fc>185)return null;var relevo=t==="treadmill_running"?0:sauNum(x.subida)==null?null:x.subida/(dist/1000);if(relevo==null||relevo>20)return null;
        return {data:d,ef:Math.round(dist/(tm/60)/fc*1000)/1000,fc:fc,ritmoMinKm:tm/60/(dist/1000)}}).filter(Boolean);
      if(!c.length)return;var recent=c.filter(function(p){return p.data>=ini56}),mfc=recent.length?mediana(recent.map(function(p){return p.fc})):null;
      var par=mfc==null?[]:c.filter(function(p){return Math.abs(p.fc-mfc)<=10});
      var cur=par.filter(function(p){return p.data>somaDiasISO(hoje,-28)&&p.data<=hoje}),ant=par.filter(function(p){return p.data>somaDiasISO(hoje,-56)&&p.data<=somaDiasISO(hoje,-28)}),ok=cur.length>=3&&ant.length>=3;
      out.push({tipo:t,pontos:par.slice(-40),elegiveis:c.length,comparaveis:par.length,fcRef:mfc,comparavel:ok,atual:cur.length?mediana(cur.map(function(p){return p.ef})):null,anterior:ant.length?mediana(ant.map(function(p){return p.ef})):null,nAtual:cur.length,nAnterior:ant.length,
        motivo:ok?"":"poucas atividades com esforço e terreno parecidos nas duas janelas de 4 semanas (mínimo 3 em cada)"})});
    return out}

  /* ---- S8: recuperação depois de treino forte (percentil 60 da carga diária) ---- */
  function sauCargaDia(ativs){var o={};(ativs||[]).forEach(function(a){var d=sauDataAtiv(a),c=sauCargaDe(a);if(d&&c!=null)o[d]=(o[d]||0)+c});return o}
  function sauRecuperacaoTreino(dias,ativs,hoje){var por=sauPor(dias),ini=somaDiasISO(hoje,-120),cd=sauCargaDia(ativs),ks=Object.keys(cd).filter(function(k){return k>=ini&&k<=hoje}).sort(),
      vals=ks.map(function(k){return cd[k]}).sort(function(a,b){return a-b});
    if(vals.length<8)return {n:0,motivo:"poucos dias com treino e carga na janela de 120 dias ("+vals.length+"; mínimo 8)",treinos:vals.length};
    var forte=vals[Math.floor(vals.length*.6)],rec=[],nao=0,semBase=0,semVfc=0,fortes=0;
    ks.filter(function(k){return cd[k]>=forte}).forEach(function(T){fortes++;var b=sauBase(por,somaDiasISO(T,-1),60,SAU_CAMPOS.vfc);if(!b){semBase++;return}
      var tem=false,achou=null;for(var k=1;k<=5;k++){var D=somaDiasISO(T,k);if(D>hoje)break;var d=por[D],v=d?SAU_CAMPOS.vfc(d):null;if(v==null)continue;tem=true;if(v>=b.med){achou=k;break}}
      if(achou!=null)rec.push(achou);else if(tem&&somaDiasISO(T,5)<=hoje){rec.push(6);nao++}else semVfc++});
    if(rec.length<5)return {n:rec.length,motivo:"poucos treinos fortes com a VFC dos dias seguintes ("+rec.length+"; mínimo 5)",fortes:fortes,semBase:semBase,semVfc:semVfc,limiar:forte};
    return {n:rec.length,mediana:mediana(rec),naoVoltou:nao,fortes:fortes,limiar:Math.round(forte),semBase:semBase,semVfc:semVfc}}

  /* ---- S11: mudança persistente. 4 semanas × 4 anteriores, e a mesma comparação deslocada 2 semanas: só é "tendência" se a direção se repetir nas duas ---- */
  function sauMudancas(dias,hoje){var por=sauPor(dias);
    return SAU_METRICAS.map(function(M){var f=SAU_CAMPOS[M.k];
      function par(off){var c=sauJanela(por,somaDiasISO(hoje,-off),28,f),a=sauJanela(por,somaDiasISO(hoje,-off-28),28,f);return c.length>=20&&a.length>=20?{c:mediana(sauVals(c)),a:mediana(sauVals(a)),nc:c.length,na:a.length}:null}
      var p0=par(0),p1=par(14),o={k:M.k,nome:M.nome,un:M.un,dec:M.dec,limiar:M.limiar,maior:M.maior};
      if(!p0){o.estado="sem";o.motivo="menos de 20 dias com a medida em cada janela de 4 semanas";return o}
      o.atual=p0.c;o.anterior=p0.a;o.nAtual=p0.nc;o.nAnterior=p0.na;o.dif=p0.c-p0.a;var d1=p1?p1.c-p1.a:null;o.difDeslocada=d1;
      var m0=Math.abs(o.dif)>=M.limiar,m1=d1!=null&&Math.abs(d1)>=M.limiar;
      o.estado=m0&&m1&&(o.dif>0)===(d1>0)?"tendencia":m0?"oscilacao":"estavel";o.dir=o.dif>0?"subiu":"caiu";o.melhor=o.estado==="estavel"?null:(o.dif>0)===M.maior;return o})}
  /* tendência: a métrica agrupada em dias (30), semanas (90) ou meses (365) até hoje (antes dentro de js/saude.js) */
  function sauAgrupar(dias,f,per,hoje){var ini=somaDiasISO(hoje,-(+per)+1),g=[],mapa={};
    (dias||[]).forEach(function(d){if(!d||d.data<ini||d.data>hoje)return;var v=f(d.dados||{});if(v==null)return;var k=per==="30"?d.data:per==="90"?pnSemana(d.data):String(d.data).slice(0,7);
      if(!mapa[k]){mapa[k]={k:k,vs:[]};g.push(mapa[k])}mapa[k].vs.push(v)});g.forEach(function(x){x.v=sauMedia(x.vs)});return g}
  /* preferências do dono (guardadas em PESSOAL.saudePrefs): valores fora da faixa voltam ao padrão */
  function sauPrefs(raw){raw=raw&&typeof raw==="object"?raw:{};var s=sauNum(raw.sonoH),t=sauNum(raw.treinos);
    return {sonoH:s!=null&&s>=4&&s<=12?s:SAU_METAS.sonoH,treinos:t!=null&&t>=1&&t<=14&&Math.round(t)===t?t:SAU_METAS.treinos,ocultar:raw.ocultar===true,esconderLocal:raw.esconderLocal===true}}
  /* Meta de treinos por semana: caminhada NÃO conta (decisão do dono, 14/11/2026). Só a conta da meta muda: a caminhada continua na lista, no histórico e nos
     demais indicadores. Os tipos são as chaves de atividade da Garmin; "hiking" (trilha) não está aqui de propósito: o dono falou de caminhada. */
  var SAU_NAO_TREINO=["walking","casual_walking","speed_walking"];
  function sauContaTreino(a){return !!a&&SAU_NAO_TREINO.indexOf(a.tipo)<0}
  /* ===== Lugares (Lote 5, 23/11/2026): onde ficam os mercados e os passeios, no mapa. Regras puras, sem rede e sem banco. =====
     Local de mercado = marcação do dono (PESSOAL.saudeLugares.mercados) ou SUGESTÃO pelo GPS dos treinos: o ponto de partida ou chegada de um treino que, nos dias de
     compra daquele mercado, se repete (2+ dias) e quase só aparece nesses dias (o "lift" tira a casa, que aparece em todos os dias). Sugestão nunca grava sozinha:
     o dono confirma. Passeio = treino com nome de local (locationName do relógio), agrupado por nome. Nenhum serviço externo de endereço. */
  function lugNum(v){return typeof v==="number"&&isFinite(v)?v:null}
  function lugValida(l){return !!l&&lugNum(l.lat)!=null&&lugNum(l.lon)!=null&&Math.abs(l.lat)<=90&&Math.abs(l.lon)<=180&&!(l.lat===0&&l.lon===0)}
  /* busca por endereço (24/11/2026, pedido do dono): texto digitado → CEP de 8 dígitos (ou null); resposta do ViaCEP → "rua, bairro, cidade, UF" (ou null). Só o que o dono digitar sai do RAC. */
  function lugCep(t){var d=String(t==null?"":t).replace(/[\s.\-]/g,"");return /^\d{8}$/.test(d)?d:null}
  function lugEnderecoViaCep(o){if(!o||typeof o!=="object"||o.erro)return null;var p=[o.logradouro,o.bairro,o.localidade,o.uf].map(function(x){return typeof x==="string"?x.trim():""}).filter(Boolean);return p.length>=2?p.join(", "):null}
  /* endereço do mercado pelo cadastro do CNPJ (24/11/2026, pedido do dono: o RAC acha e o dono só confirma): CNPJ de 14 dígitos (ou null); resposta do BrasilAPI → "rua, número, bairro, cidade, UF" (ou null);
     cidade e UF que o nome do mercado traz entre parênteses, "Nome (Sorocaba/SP)" → {nome sem os parênteses, cidade, uf} */
  function lugCnpj(t){var d=String(t==null?"":t).replace(/\D/g,"");return d.length===14&&!/^(\d)\1+$/.test(d)?d:null}
  function lugEnderecoCnpj(o){if(!o||typeof o!=="object")return null;var tx=function(v){return typeof v==="string"?v.trim():""},rua=[tx(o.descricao_tipo_de_logradouro),tx(o.logradouro)].filter(Boolean).join(" "),
      p=[rua,tx(o.numero)&&tx(o.numero).toUpperCase()!=="S/N"?tx(o.numero):"",tx(o.bairro),tx(o.municipio),tx(o.uf)].filter(Boolean);return p.length>=3&&tx(o.municipio)?p.join(", "):null}
  function lugNomeCidade(nome){var m=/^(.*?)\s*\(([^()\/]+)\/([A-Za-z]{2})\)\s*$/.exec(String(nome||"").trim());return m?{nome:m[1].trim(),cidade:m[2].trim(),uf:m[3].toUpperCase()}:{nome:String(nome||"").trim(),cidade:null,uf:null}}
  /* linhas de compras (uma por item) → uma nota por data|mercado|numero: [{d, mercado, v}] */
  function lugNotas(compras){var m={},L=[];(compras||[]).forEach(function(x){var d=sauDataDe(x&&x.data),me=String((x&&x.mercado)||"").trim();if(!d||!me)return;
    var k=d+"|"+me+"|"+(x.numero||""),n=m[k];if(!n){n=m[k]={d:d,mercado:me,v:0};L.push(n)}n.v+=+x.valor_total||0});return L}
  /* um item por mercado: quantas compras, quanto, a última e o local marcado (ou null), do que mais gastou ao que menos */
  function lugMercados(notas,marcados){marcados=marcados||{};var m={};(notas||[]).forEach(function(n){var o=m[n.mercado]=m[n.mercado]||{mercado:n.mercado,n:0,total:0,ultima:null,dias:{}};o.n++;o.total+=n.v;o.dias[n.d]=1;if(!o.ultima||n.d>o.ultima)o.ultima=n.d});
    return Object.keys(m).map(function(k){var o=m[k],l=marcados[k];o.total=Math.round(o.total*100)/100;o.local=lugValida(l)?{lat:l.lat,lon:l.lon}:null;return o}).sort(function(a,b){return b.total-a.total})}
  /* treinos com GPS → pontos de partida e chegada por dia: ativs = [{id, inicio}], rotas = {id: [[lat,lon],...]} */
  function lugPontosDia(ativs,rotas){var out=[];(ativs||[]).forEach(function(a){var d=sauDataAtiv(a),r=a&&rotas&&rotas[a.id];if(!d||!r||!Array.isArray(r)||r.length<2)return;
    [r[0],r[r.length-1]].forEach(function(p){if(p&&lugNum(p[0])!=null&&lugNum(p[1])!=null)out.push({d:d,lat:p[0],lon:p[1]})})});return out}
  function lugSugerir(notas,pontos,marcados){marcados=marcados||{};var cl={},todosDias={},out={};
    (pontos||[]).forEach(function(p){var k=(Math.round(p.lat*1000)/1000)+","+(Math.round(p.lon*1000)/1000),c=cl[k]=cl[k]||{pts:[],dias:{}};c.pts.push(p);c.dias[p.d]=1});
    var mer={};(notas||[]).forEach(function(n){(mer[n.mercado]=mer[n.mercado]||{})[n.d]=1});
    Object.keys(mer).forEach(function(nome){if(lugValida(marcados[nome]))return;var best=null;
      Object.keys(cl).forEach(function(k){var c=cl[k],tot=Object.keys(c.dias).length,hit=Object.keys(c.dias).filter(function(d){return mer[nome][d]}),lift=tot?hit.length/tot:0;
        if(hit.length<2||lift<.5)return;if(!best||hit.length>best.dias||(hit.length===best.dias&&lift>best.lift)){
          var ps=c.pts.filter(function(p){return mer[nome][p.d]}),lat=ps.reduce(function(s,p){return s+p.lat},0)/ps.length,lon=ps.reduce(function(s,p){return s+p.lon},0)/ps.length;
          best={lat:Math.round(lat*1e5)/1e5,lon:Math.round(lon*1e5)/1e5,dias:hit.length,de:Object.keys(mer[nome]).length,lift:Math.round(lift*100)/100,confianca:hit.length>=3&&lift>=.6?"alta":"média"}}});
      if(best)out[nome]=best});return out}
  /* passeios: treinos com nome de local, agrupados por nome; a posição é o ponto de partida do treino mais recente com GPS */
  function lugPasseios(ativs,rotas){var m={};(ativs||[]).forEach(function(a){var nome=String(a&&a.dados&&a.dados.local||"").trim(),d=sauDataAtiv(a);if(!nome||!d)return;
    var o=m[nome]=m[nome]||{nome:nome,n:0,ultimo:null,lat:null,lon:null};o.n++;var r=rotas&&rotas[a.id];
    if(!o.ultimo||d>o.ultimo){o.ultimo=d;if(r&&r.length&&lugNum(r[0][0])!=null){o.lat=r[0][0];o.lon=r[0][1]}}
    else if(o.lat==null&&r&&r.length&&lugNum(r[0][0])!=null){o.lat=r[0][0];o.lon=r[0][1]}});
    return Object.keys(m).map(function(k){return m[k]}).sort(function(a,b){return b.n-a.n||(a.nome<b.nome?-1:1)})}
  /* ===== Score do sono (23/11/2026): a nota de 0 a 100 que o relógio dá a cada noite (dados.sono.nota), com o rótulo da Garmin, a média de 7 e de 30 noites, a melhor e a pior das
     14 últimas e os escores por fase (dados.extras.sono, quando já foram buscados). Só lê; não inventa nota: sem nota, devolve null. ===== */
  var SAU_QUAL={EXCELLENT:"Excelente",GOOD:"Bom",FAIR:"Regular",POOR:"Ruim",OPTIMAL:"Ideal",INSUFFICIENT:"Insuficiente",EXCESSIVE:"Excessivo",LOW:"Baixo",HIGH:"Alto",NORMAL:"Normal",
    VERY_LOW:"Muito baixo",VERY_HIGH:"Muito alto",MODERATE:"Moderado",MILD:"Leve",SEVERE:"Intenso"};
  function sauRotuloQual(k){return SAU_QUAL[k]||null}
  /* a faixa do score quando a Garmin não manda o rótulo */
  function sauFaixaScore(n){return n==null?null:n>=90?"Excelente":n>=80?"Bom":n>=60?"Regular":"Ruim"}
  var SAU_ESCORES=[["duracao","Duração"],["profundo","Sono profundo"],["rem","REM"],["leve","Sono leve"],["despertares","Despertares"],["agitacao","Agitação"],["estresse","Estresse"]];
  function sauScoreSono(dias,hoje){var por=sauPor(dias),nj=sauJanela(por,hoje,60,SAU_CAMPOS.nota);if(!nj.length)return null;
    var ult=nj[nj.length-1],d=por[ult.data]||{},q=d.sono&&d.sono.qualidade,ex=d.extras&&d.extras.sono&&d.extras.sono.escores,
      j7=nj.filter(function(x){return x.data>somaDiasISO(hoje,-7)}),j30=nj.filter(function(x){return x.data>somaDiasISO(hoje,-30)}),j14=nj.filter(function(x){return x.data>somaDiasISO(hoje,-14)});
    var melhor=null,pior=null;j14.forEach(function(x){if(!melhor||x.v>melhor.v)melhor=x;if(!pior||x.v<pior.v)pior=x});
    var esc=[];if(ex)SAU_ESCORES.forEach(function(e){var k=ex[e[0]];if(k)esc.push({id:e[0],nome:e[1],chave:k,rotulo:sauRotuloQual(k)||String(k).toLowerCase().replace(/_/g," ")})});
    var pct=d.extras&&d.extras.sono&&d.extras.sono.pct||null;
    return {data:ult.data,hoje:ult.data===hoje,nota:ult.v,rotulo:sauRotuloQual(q)||sauFaixaScore(ult.v),
      media7:j7.length>=4?sauArred(sauMedia(sauVals(j7)),0):null,n7:j7.length,media30:j30.length>=10?sauArred(sauMedia(sauVals(j30)),0):null,n30:j30.length,
      melhor:melhor,pior:pior,escores:esc,pct:pct}}
  /* ===== Resumo da semana (Lote 6, 23/11/2026): os 7 últimos dias contra os 7 anteriores. Regra pura; o TEXTO por regras é sempre mostrado (sem custo) e os FATOS
     (só agregados numéricos: nenhum local, nome, foto ou valor bruto) são o que vai à IA quando o dono pede o resumo com IA. Caminhada não conta como treino. ===== */
  function sauResumoSemana(dias,ativs,hoje){
    var por=sauPor(dias),fim=hoje,ini=somaDiasISO(fim,-6),afim=somaDiasISO(fim,-7),aini=somaDiasISO(fim,-13);
    function med(f,a,b){var v=[];for(var k=a;k<=b;k=somaDiasISO(k,1)){var d=por[k];if(!d)continue;var x=f(d);if(x!=null)v.push(x)}return {n:v.length,m:v.length?sauMedia(v):null}}
    var campos={sono:SAU_CAMPOS.sono,vfc:SAU_CAMPOS.vfc,fc:SAU_CAMPOS.fc,passos:SAU_CAMPOS.passos,estresse:SAU_CAMPOS.estresse},at={},ant={},m={};
    Object.keys(campos).forEach(function(k){at[k]=med(campos[k],ini,fim);ant[k]=med(campos[k],aini,afim)});
    var tr=(ativs||[]).filter(sauContaTreino);
    function trSem(a,b){var L=tr.filter(function(x){var d=sauDataAtiv(x);return d&&d>=a&&d<=b}),dias={},carga=0,seg=0;L.forEach(function(x){dias[sauDataAtiv(x)]=1;carga+=sauCargaDe(x)||0;seg+=(x.dados&&sauNum(x.dados.duracao))||0});
      return {n:L.length,dias:Object.keys(dias).length,carga:Math.round(carga),min:Math.round(seg/60)}}
    var ta=trSem(ini,fim),tp=trSem(aini,afim),diasComDado=0;for(var k=ini;k<=fim;k=somaDiasISO(k,1))if(por[k])diasComDado++;
    var pr=null;try{var ind=sauIndicadores(dias||[],hoje);pr=ind&&ind.prontidao&&ind.data>=somaDiasISO(hoje,-1)?ind.prontidao.nota:null}catch(e){pr=null}
    var rec=sauRecomendacao(dias,ativs,hoje);
    var out={ini:ini,fim:fim,antIni:aini,antFim:afim,diasComDado:diasComDado,semDados:diasComDado<4,atual:at,anterior:ant,treinos:ta,treinosAnt:tp,prontidao:pr,recomendacao:rec.estado};
    function r1(v){return v==null?null:Math.round(v*10)/10}
    function fmt(v,c){return v==null?"sem dado":String(r1(v)).replace(".",",")+(c||"")}
    function cmp(a,b,casas){if(a==null||b==null)return "";var d=a-b;if(Math.abs(d)<(casas||.05))return "igual à semana anterior";return (d>0?"+":"−")+String(r1(Math.abs(d))).replace(".",",")+" vs. semana anterior"}
    /* texto por regras (sem IA): uma linha por assunto, só com o que há */
    var L=[];
    if(at.sono.m!=null)L.push("Sono: média de "+fmt(at.sono.m," h")+" por noite"+(ant.sono.m!=null?" ("+cmp(at.sono.m,ant.sono.m,.1)+")":"")+", em "+at.sono.n+" noites com dado.");
    if(at.vfc.m!=null)L.push("Variabilidade cardíaca: "+fmt(at.vfc.m," ms")+(ant.vfc.m!=null?" ("+cmp(at.vfc.m,ant.vfc.m,.5)+")":"")+".");
    if(at.fc.m!=null)L.push("Batimentos em repouso: "+fmt(at.fc.m," bpm")+(ant.fc.m!=null?" ("+cmp(at.fc.m,ant.fc.m,.3)+")":"")+".");
    if(at.passos.m!=null)L.push("Passos: "+String(Math.round(at.passos.m)).replace(/\B(?=(\d{3})+(?!\d))/g,".")+" por dia"+(ant.passos.m!=null?" ("+(Math.abs(at.passos.m-ant.passos.m)<50?"igual à semana anterior":(at.passos.m>ant.passos.m?"+":"−")+String(Math.round(Math.abs(at.passos.m-ant.passos.m))).replace(/\B(?=(\d{3})+(?!\d))/g,".")+" vs. semana anterior")+")":"")+".");
    L.push("Treinos (sem caminhada): "+ta.n+(ta.n===1?" treino":" treinos")+" em "+ta.dias+(ta.dias===1?" dia":" dias")+(ta.carga?", carga "+ta.carga:"")+(ta.min?", "+ta.min+" min":"")+" (semana anterior: "+tp.n+").");
    if(pr!=null)L.push("Prontidão de hoje: "+pr+".");
    out.linhas=L;
    /* fatos para a IA: só números e rótulos, um por linha */
    var F=["semana: "+ini+" a "+fim,"semana_anterior: "+aini+" a "+afim,"dias_com_dado_na_semana: "+diasComDado,
      "sono_medio_horas: "+(at.sono.m==null?"sem dado":r1(at.sono.m))+" (noites: "+at.sono.n+")","sono_medio_horas_anterior: "+(ant.sono.m==null?"sem dado":r1(ant.sono.m)),
      "vfc_media_ms: "+(at.vfc.m==null?"sem dado":r1(at.vfc.m)),"vfc_media_ms_anterior: "+(ant.vfc.m==null?"sem dado":r1(ant.vfc.m)),
      "fc_repouso_media_bpm: "+(at.fc.m==null?"sem dado":r1(at.fc.m)),"fc_repouso_media_bpm_anterior: "+(ant.fc.m==null?"sem dado":r1(ant.fc.m)),
      "passos_por_dia: "+(at.passos.m==null?"sem dado":Math.round(at.passos.m)),"passos_por_dia_anterior: "+(ant.passos.m==null?"sem dado":Math.round(ant.passos.m)),
      "treinos_sem_caminhada: "+ta.n,"treinos_sem_caminhada_anterior: "+tp.n,"dias_com_treino: "+ta.dias,"carga_total: "+ta.carga,"carga_total_anterior: "+tp.carga,"minutos_de_treino: "+ta.min,
      "prontidao_hoje: "+(pr==null?"sem dado":pr)];
    out.fatos=F.join("\n");return out}
  /* ===== Recomendação do dia (Lote 4, 23/11/2026): treino forte, leve ou descanso. Regra pura do RAC, sem IA e sem chamada nova ao relógio. =====
     Parte da prontidão do RAC (VFC, FC de repouso, sono e Body Battery contra o seu normal de 60 dias) e a ajusta, no máximo, PARA BAIXO, com o que o treino
     recente pede: carga dos 3 últimos dias contra a sua média de 28 dias (razão >= 1,5), treino forte ontem (carga no seu quintil superior), 4+ dias seguidos
     de treino (sem caminhada) e 2+ alertas da prontidão. Nunca eleva a recomendação, nunca diagnostica; cada motivo traz o número que o gerou. É hipótese de
     apoio, não orientação médica. Sem a prontidão de hoje ou de ontem, devolve "sem_dados" e diz o porquê. */
  var SAU_REC_TXT={forte:["Dia para treino forte","Seus indicadores estão acima do seu normal e a carga recente permite."],
    leve:["Treino leve ou moderado","Vale treinar, sem forçar: algum indicador ou a carga recente pede cuidado."],
    descanso:["Descanso ou recuperação","Seus indicadores estão abaixo do seu normal: prefira descansar ou uma caminhada leve."]};
  function sauRecomendacao(dias,ativs,hoje){
    var ind=sauIndicadores(dias||[],hoje),base={estado:"sem_dados",titulo:"Sem dados para recomendar",resumo:"",motivos:[],fatores:{},limite:SAU_LIMITE,hipotese:"Regra do RAC (prontidão própria e carga de treino); não é orientação médica."};
    if(!ind||!ind.prontidao){base.motivos.push("Faltam a noite de sono, a variabilidade cardíaca ou a linha de base de 10 dias no relógio.");return base}
    var atraso=Math.round((Date.parse(hoje+"T12:00:00Z")-Date.parse(ind.data+"T12:00:00Z"))/864e5);
    if(atraso>1){base.motivos.push("O último dia com dados do relógio é "+ind.data.slice(8,10)+"/"+ind.data.slice(5,7)+" ("+atraso+" dias atrás): sincronize o relógio para recomendar.");base.fatores.atraso=atraso;return base}
    var pr=ind.prontidao,nivel=pr.nota>=70?0:pr.nota>=45?1:2,motivos=["Prontidão "+pr.nota+" ("+pr.rotulo.charAt(0).toLowerCase()+pr.rotulo.slice(1)+"), cálculo do RAC contra o seu normal de 60 dias."],f={prontidao:pr.nota};
    function baixa(n,m){if(nivel<n){nivel=n}motivos.push(m)}
    var tr=(ativs||[]).filter(sauContaTreino),cd=sauCargaDia(tr),soma=function(de,ate){var t=0,n=0;for(var k=de;k<=ate;k++){var c=cd[somaDiasISO(hoje,-k)];if(c!=null){t+=c;n++}}return {t:t,n:n}};
    var ag=soma(0,2),cr=soma(3,30);
    if(cr.n>=4&&cr.t>0){var razao=ag.t/((cr.t/28)*3);f.razaoCarga=Math.round(razao*100)/100;
      if(razao>=1.5)baixa(1,"Carga dos últimos 3 dias em "+f.razaoCarga.toString().replace(".",",")+"× a sua média de 28 dias: semana pesada, alivie hoje.");
      else motivos.push("Carga dos últimos 3 dias em "+f.razaoCarga.toString().replace(".",",")+"× a sua média de 28 dias.")}
    var vals=Object.keys(cd).filter(function(k){return k>=somaDiasISO(hoje,-120)&&k<=hoje}).map(function(k){return cd[k]}).sort(function(a,b){return a-b});
    if(vals.length>=8){var forte=vals[Math.floor(vals.length*.6)],ontem=cd[somaDiasISO(hoje,-1)];f.forteOntem=ontem!=null&&ontem>=forte;
      if(f.forteOntem)baixa(1,"Treino forte ontem (carga "+Math.round(ontem)+", acima do seu corte de "+Math.round(forte)+"): o corpo ainda está recuperando.")}
    var seg=0,d0=cd[hoje]!=null||tr.some(function(a){return sauDataAtiv(a)===hoje})?0:1;
    for(var i=d0;i<60;i++){var D=somaDiasISO(hoje,-i);if(tr.some(function(a){return sauDataAtiv(a)===D}))seg++;else break}
    f.diasSeguidos=seg;if(seg>=4)baixa(1,seg+" dias seguidos com treino: dê um respiro.");
    var ult=null;tr.forEach(function(a){var d=sauDataAtiv(a);if(d&&d<=hoje&&(!ult||d>ult))ult=d});
    if(ult){f.semTreino=Math.round((Date.parse(hoje+"T12:00:00Z")-Date.parse(ult+"T12:00:00Z"))/864e5);if(f.semTreino>=4&&nivel===0)motivos.push("Há "+f.semTreino+" dias sem treino: bom momento para voltar.")}
    var al=pr.alertas||[];f.alertas=al.length;
    if(al.length>=2)baixa(1,"Mais de um alerta de recuperação hoje.");
    al.forEach(function(x){motivos.push(x)});
    var est=nivel===0?"forte":nivel===1?"leve":"descanso";
    return {estado:est,titulo:SAU_REC_TXT[est][0],resumo:SAU_REC_TXT[est][1],motivos:motivos,fatores:f,data:ind.data,limite:SAU_LIMITE,hipotese:base.hipotese}}
  /* ===== Chuva: nas próximas "janela" horas da previsão horária do Open-Meteo, a partir da hora "agora" ("AAAA-MM-DDTHH:00") ===== */
  function chuvaAviso(hr,agora,janela){
    janela=janela||12;var t=hr&&hr.time||[],i0=t.indexOf(String(agora).slice(0,13)+":00");if(i0<0)return null;
    var pr=hr.precipitation_probability||[],mm=hr.precipitation||[],ini=-1,fim=-1,max=0,soma=0;
    for(var i=i0;i<Math.min(t.length,i0+janela);i++){var p=pr[i]||0,m=mm[i]||0,chove=p>=60||(p>=40&&m>=1);
      if(chove){if(ini<0)ini=i;fim=i}if(p>max)max=p;soma+=m}
    if(ini<0)return null;
    var hora=function(k){return +t[k].slice(11,13)+"h"},agoraJa=ini===i0;
    return {agora:agoraJa,inicio:t[ini],fim:t[fim],prob:max,mm:Math.round(soma*10)/10,
      texto:(agoraJa?"Chuva em Sorocaba agora":"Chuva em Sorocaba a partir das "+hora(ini))+(fim>ini?", até umas "+(+t[fim].slice(11,13)+1)+"h":"")+" (até "+max+"%"+(soma>=1?", ~"+Math.round(soma)+" mm":"")+")."}}
  /* ===== Compras: o que deve estar acabando, pelo intervalo entre as compras de cada produto =====
     linhas = [{data, produto, quantidade, valor}] (notas do Mercado); adiados = {chave: "AAAA-MM-DD"} ("ainda tem" até essa data).
     Precisa de 3 compras do produto; o intervalo é a mediana entre elas, esticado quando a última compra foi maior que o normal. */
  function diasEntre(a,b){return Math.round((Date.parse(b+"T12:00:00Z")-Date.parse(a+"T12:00:00Z"))/864e5)}
  function chaveProduto(t){return norm(t).replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ").trim()}
  function previsaoCompras(linhas,hoje,adiados){
    adiados=adiados||{};var por={},out=[];
    linhas.forEach(function(x){if(!x.produto||!x.data)return;var k=chaveProduto(x.produto),p=por[k]=por[k]||{produto:x.produto,dias:{}};p.dias[x.data]=(p.dias[x.data]||0)+(+x.quantidade||1)});
    Object.keys(por).forEach(function(k){
      var p=por[k],ds=Object.keys(p.dias).sort();if(ds.length<3)return;
      var iv=[];for(var i=1;i<ds.length;i++)iv.push(diasEntre(ds[i-1],ds[i]));
      var med=Math.max(3,mediana(iv)),qMed=mediana(ds.map(function(d){return p.dias[d]}))||1,ult=ds[ds.length-1];
      var esp=med*Math.max(.5,Math.min(3,p.dias[ult]/qMed)),desde=diasEntre(ult,hoje),r=desde/esp;
      if(desde>Math.max(21,esp*2.5))return; /* passou muito do normal: parou de comprar ou compra em outro lugar */
      if(adiados[k]&&adiados[k]>hoje)return;
      out.push({chave:k,produto:p.produto,ultima:ult,vezes:ds.length,intervalo:Math.round(esp),dias:desde,r:Math.round(r*100)/100,status:r>=.9?"acabando":r>=.7?"logo":"ok"})});
    /* primeiro o que está acabando; dentro disso, o que você mais compra (o básico do dia a dia vem na frente) */
    return out.sort(function(a,b){return (b.status==="acabando")-(a.status==="acabando")||b.vezes-a.vezes||b.r-a.r})}
  /* mais comprados (em quantas compras o produto apareceu) e os que só apareceram uma vez */
  function padraoCompras(linhas){
    var por={};linhas.forEach(function(x){var k=chaveProduto(x.produto);if(!k)return;var p=por[k]=por[k]||{produto:x.produto,dias:{},gasto:0};p.dias[x.data]=1;p.gasto+=+x.valor||0});
    var l=Object.keys(por).map(function(k){var p=por[k],ds=Object.keys(p.dias).sort();return {produto:p.produto,vezes:ds.length,gasto:Math.round(p.gasto*100)/100,ultima:ds[ds.length-1]}});
    return {total:l.length,mais:l.slice().sort(function(a,b){return b.vezes-a.vezes||b.gasto-a.gasto}).slice(0,15),
      menos:l.filter(function(x){return x.vezes===1}).sort(function(a,b){return b.ultima.localeCompare(a.ultima)}).slice(0,15)}}
  /* item da lista já está numa nota? (todas as palavras do item aparecem no nome do produto ou na descrição do cupom) */
  function itemBate(item,produto){var w=chaveProduto(item).split(" ").filter(function(x){return x.length>=3&&!/^(de|da|do|das|dos|com|para)$/.test(x)}),alvo=" "+chaveProduto(produto)+" ";
    return !!w.length&&w.every(function(x){return alvo.indexOf(" "+x)>=0})}
  /* texto de uma nota do iPhone: itens, sem o título, as seções ("Farmácia:", "Demais itens") e o que já foi marcado */
  function notaItens(texto){
    var out=[],secao="",primeira=true;
    String(texto||"").replace(/\r/g,"").split("\n").forEach(function(l){
      var t=l.replace(/\u00a0/g," ").trim();if(!t)return;
      var marcado=/^(?:- )?(?:☑|✅|✓|✔|\[[xX]\])/.test(t),marca=marcado||/^(?:- )?(?:[-*•·◦○◯⚪☐]|\[ ?\])/.test(t);
      t=t.replace(/^(?:- )?(?:\[[ xX]?\]|[-*•·◦○◯⚪☐☑✅✓✔])\s*/,"").trim();if(!t)return;
      var era1=primeira;primeira=false;
      if(era1&&!marca&&/\b(lista|compras|mercado)\b/.test(norm(t)))return;
      if(!marca&&(/:$/.test(t)||/^(demais itens|outros|outros itens|outras coisas)$/.test(norm(t)))){secao=t.replace(/:$/,"");return}
      if(marcado)return;
      out.push({item:t.slice(0,200),secao:secao})});
    return out}
  /* o que foi ditado ou digitado de uma vez ("leite, pão de forma e café") vira um item por coisa */
  function dividirItens(texto){
    return String(texto||"").split(/\s*(?:\n|;|,|\s+e\s+(?=\S))\s*/i).map(function(x){return x.replace(/^(?:- )?(?:\[[ xX]?\]|[-*•·◦○◯⚪☐])\s*/,"").replace(/[.!]+$/,"").trim()}).filter(Boolean)
      .map(function(x){return x.charAt(0).toUpperCase()+x.slice(1)})}
  /* ===== E-mails de vagas: o que cada um quer dizer para o funil (Gupy, Burh, Jobbol, Sólides, Quickin, LinkedIn, Indeed…) =====
     m = {de, assunto, trecho}; devolve {tipo, vaga, empresa, plataforma, etapa} ou null.
     tipo: candidatura (confirmação), etapa (teste/redação liberada), entrevista, retorno (resposta, geralmente negativa), cancelada, alerta (vaga sugerida) */
  function lerEmailVaga(m){
    var de=String(m.de||"").toLowerCase(),a=String(m.assunto||"").replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu,"").replace(/\s+/g," ").trim(),t=String(m.trecho||"").replace(/[\u034f\u200b-\u200d\u00ad]/g,"").replace(/\s+/g," ").trim(),x;
    var plat=/gupy/.test(de)?"Gupy":/burh/.test(de)?"Burh":/jobbol/.test(de)?"Jobbol":/solides/.test(de)?"Sólides":/quickin/.test(de)?"Quickin":/empregoshub/.test(de)?"Empregos Hub":
      /linkedin/.test(de)?"LinkedIn":/indeed/.test(de)?"Indeed":/catho/.test(de)?"Catho":/infojobs/.test(de)?"InfoJobs":/vagas\.com/.test(de)?"Vagas.com":/kenoby/.test(de)?"Kenoby":"";
    function r(tipo,vaga,empresa,extra){var o={tipo:tipo,vaga:(vaga||"").replace(/\s*[-–]\s*n[ºo°]\s*\w+$/i,"").trim(),empresa:(empresa||"").trim(),plataforma:plat};return extra?Object.assign(o,extra):o}
    /* alertas de vaga (não são candidaturas) */
    if(/jobalerts|match\.indeed|alert/.test(de)||(/jobbol/.test(de)&&!/avisos@/.test(de))){
      if((x=/^A empresa (.+?) está contratando:?\s*(.+)$/i.exec(a)))return r("alerta",x[2],x[1]);
      if((x=/^(?:Vaga de )?(.+?) na empresa (.+)$/i.exec(a)))return r("alerta",x[1].replace(/^\d+-/,""),x[2]);
      if((x=/^(.+?) (?:está contratando|abriu vaga)\s*(.*?)(?: hoje)?$/i.exec(a)))return r("alerta",x[2]||"",x[1]);
      return r("alerta",a.replace(/ e mais \d+ vagas?.*$/i,""),"")}
    if(/vaga cancelada/i.test(a)){x=/^(.+?)\s*\|\s*(.+?)\s*-\s*Vaga Cancelada/i.exec(a);return r("cancelada",x?x[2]:"",x?x[1]:"")}
    if(/entrevista/i.test(a)){x=/para a vaga (.+)$/i.exec(a);return r("entrevista",x?x[1]:"",(/^(.+?) [-–|] /.exec(t)||[])[1]||"")}
    if((x=/^Etapa (.+?) desbloqueada para a vaga (.+)$/i.exec(a)))return r("etapa",x[2],"",{etapa:x[1]});
    if(/obrigad[ao] pelo interesse|atualiza[çc][ãa]o sobre (a )?sua candidatura|agradecemos (a )?sua participa|infelizmente|n[ãa]o (foi|fomos|seguiremos|seguir[áa])|optamos por/i.test(a+" "+t)&&!/candidatura (recebida|enviada|confirmada|efetuada)/i.test(a)){
      var vg=(/referente [àa] vaga (.+?)\s*:/i.exec(t)||/para a vaga (.+?)[.,:]/i.exec(t)||[])[1]||"",em=(/^(.+?)\s+[-–]\s+/.exec(t)||[])[1]||(/^(.+?)\s+[-–|]\s+/.exec(a)||[])[1]||"";
      if(/\d{5,}/.test(em))em="";return r("retorno",vg,em)}
    if(/candidatura (recebida|enviada|confirmada|efetuada)|confirma[çc][ãa]o de inscri|sua candidatura (para|foi)|candidatou|application (was )?(sent|received)|recebemos sua candidatura/i.test(a+" "+t)){
      if((x=/^Sua candidatura para (.+)$/i.exec(a)))return r("candidatura",x[1],"");
      if((x=/^Candidatura efetuada em (.+)$/i.exec(a)))return r("candidatura",x[1],"");
      if((x=/^Confirma[çc][ãa]o de inscri[çc][ãa]o\s*[-–]\s*(.+)$/i.exec(a)))return r("candidatura","",x[1]);
      if((x=/candidatou na\(?s?\)? vaga\(?s?\)? (.+?)\. Ir para/i.exec(t)))return r("candidatura",x[1],"");
      if((x=/(?:sua candidatura foi enviada para|application was sent to) (.+?)(?:[.!]|$)/i.exec(a)))return r("candidatura",(/^(.+?) [-–·] /.exec(t)||[])[1]||"",x[1]);
      var emp=(/processo seletivo (?:na|da|do|no) (.+?)[.,!]/i.exec(t)||[])[1]||"",antes=(/^(.+?)\s+Ol[áa](?=[\s,!])/.exec(t)||[])[1]||"";
      return r("candidatura",emp&&antes.indexOf(emp)===0?antes.slice(emp.length):antes,emp)}
    return null}
  /* a vaga do e-mail é esta candidatura do funil? (todas as palavras importantes do título batem, e a empresa, quando as duas têm) */
  function vagaParecida(v,c){
    function ws(s){return chaveProduto(s).split(" ").filter(function(w){return w.length>=3&&!/^(de|da|do|das|dos|para|com|vaga|ii|iii|jr|pl|sr)$/.test(w)})}
    var a=ws(v.vaga),b=ws(c.t);if(!a.length||!b.length)return !!(v.empresa&&c.e&&chaveProduto(v.empresa)===chaveProduto(c.e)&&!a.length);
    var comum=a.filter(function(w){return b.indexOf(w)>=0}).length;if(comum/Math.min(a.length,b.length)<0.75)return false;
    return !(v.empresa&&c.e)||ws(v.empresa).some(function(w){return ws(c.e).indexOf(w)>=0})}
  /* RAC Intelligence → o mesmo texto que a pessoa colaria no fluxo manual: assim a conferência e o salvar continuam os
     de sempre. Resultado de demonstração (_demo) nunca vira texto (segunda proteção; a primeira é o botão não chamar). */
  function iaAbastTexto(r){if(!r||typeof r!=="object"||r._demo)return "";
    return JSON.stringify({veiculo:r.veiculo||null,data:r.data||null,km:r.km==null?null:r.km,litros:r.litros==null?null:r.litros,preco_litro:r.preco_litro==null?null:r.preco_litro,
      total:r.total==null?null:r.total,combustivel:r.combustivel||null,posto:r.posto||"",alertas:Array.isArray(r.alertas)?r.alertas:[]})}
  function iaNotaTexto(r){if(!r||typeof r!=="object"||r._demo||!Array.isArray(r.itens)||!r.itens.length)return "";
    return JSON.stringify({mercado:r.mercado||"",cnpj:r.cnpj||"",data:r.data||"",numero:r.numero||"",serie:r.serie||"",chave:r.chave||"",pagamento:r.pagamento||"",
      total_pago:r.total_pago==null?null:r.total_pago,desconto_nota:r.desconto_nota||0,
      itens:r.itens.map(function(x){return [x.descricao,x.qtd==null?null:x.qtd,x.un||"un",x.unitario==null?null:x.unitario,x.total==null?null:x.total,x.desconto||0]})})}
  /* ===== RAC Intelligence: contas e textos do painel do Sistema (sem tela nem banco; seguem as regras do banco, 015) ===== */
  /* número no formato brasileiro (1.234,56) */
  function iaNum(v,casas){var n=+v;if(!isFinite(n))n=0;var s=Math.abs(n).toFixed(casas).split("."),i=s[0].replace(/\B(?=(\d{3})+(?!\d))/g,".");
    return (n<0&&+s.join(".")!==0?"-":"")+i+(s[1]?","+s[1]:"")}
  /* dólar: 2 casas; abaixo de 1 centavo, até 4 (uma leitura custa frações de centavo) */
  function iaUsd(v){var n=+v||0,a=Math.abs(n);if(a>0&&a<0.00005)return "menos de US$ 0,0001";
    return "US$ "+(a>0&&a<0.01?iaNum(n,4).replace(/0{1,2}$/,""):iaNum(n,2))}
  /* dólar das telas de custo: até 4 casas abaixo de 1 dólar, sem zeros sobrando (0,026 e não 0,03: uma chamada custa frações de centavo) */
  function iaUsdFino(v){var n=+v||0,a=Math.abs(n);if(a===0)return "US$ 0,00";if(a<0.00005)return "menos de US$ 0,0001";
    return "US$ "+iaNum(n,a<1?4:2).replace(/(,\d\d\d*?)0+$/,"$1")}
  function iaReais(v){var n=+v||0;return n>0&&n<0.005?"menos de R$ 0,01":"R$ "+iaNum(n,2)}
  /* quanto um valor em dólar custa em reais, com o câmbio e os impostos da configuração (como emReais no servidor) */
  function iaBrl(usd,cfg){cfg=cfg||{};var c=+cfg.cambio_brl_usd>0?+cfg.cambio_brl_usd:6,i=+cfg.margem_impostos>=0?+cfg.margem_impostos:0.12;return iaReais((+usd||0)*c*(1+i))}
  /* o mês da tela, a partir dos totais do banco (ia_totais_mes): disponível, percentual e nível de alerta.
     O bloqueio acontece quando a PRÓXIMA reserva não cabe, então o aviso forte começa antes dos 100% */
  function iaResumo(t,cfg){t=t||{};var teto=+t.teto_usd||0,comp=+t.comprometido_usd||0,pct=teto>0?comp/teto*100:100;
    return {teto:teto,comprometido:comp,disponivel:Math.max(0,Math.round((teto-comp)*1e6)/1e6),pct:Math.round(pct),
      nivel:pct>=100?100:pct>=95?95:pct>=80?80:pct>=50?50:0,estimado:+t.estimado_usd||0,aberto:+t.reservado_aberto_usd||0,mes:t.mes||""}}
  function iaAlerta(s){if(!s||!s.nivel)return null;
    if(s.nivel>=100)return {forte:true,texto:"⚠ O limite do mês acabou: novas leituras com IA ficam bloqueadas até o mês virar. O jeito manual continua."};
    if(s.nivel>=95)return {forte:true,texto:"⚠ Quase no limite: a IA já usou "+s.pct+"% do mês e novas leituras podem ser recusadas."};
    if(s.nivel>=80)return {forte:true,texto:"⚠ A IA já usou "+s.pct+"% do limite do mês."};
    return {forte:false,texto:"A IA já usou "+s.pct+"% do limite do mês."}}
  /* quantas chamadas pagas o mês teve, por estado (por_estado de ia_totais_mes) */
  var IA_ESTADOS=[["concluido","leitura concluída","leituras concluídas"],["incerto","incerta","incertas"],["enviando","em andamento","em andamento"],
    ["reservado","reservada","reservadas"],["reconciliado","conferida","conferidas"],["falhou_sem_envio","falhou antes do envio","falharam antes do envio"]];
  function iaEstados(pe){pe=pe||{};var l=IA_ESTADOS.filter(function(e){return +pe[e[0]]>0}).map(function(e){var n=+pe[e[0]];return n+" "+(n===1?e[1]:e[2])});
    return l.length?l.join(" · "):"Nenhuma leitura paga neste mês."}
  var IA_MESES=["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  /* "2026-10-01" → "outubro de 2026" */
  function iaNomeMes(iso){var m=/^(\d{4})-(\d{2})/.exec(String(iso||""));return m?IA_MESES[+m[2]-1]+" de "+m[1]:""}
  /* os últimos n meses (competências), do atual para trás: "2026-10-01", "2026-09-01"… */
  function iaCompetencias(mes,n){var m=/^(\d{4})-(\d{2})/.exec(String(mes||"")),l=[];if(!m)return l;var a=+m[1],k=+m[2];
    for(var i=0;i<(n||12);i++){l.push(a+"-"+(k<10?"0":"")+k+"-01");k--;if(!k){k=12;a--}}return l}
  var IA_MODULOS={abastecimento:"Abastecimento",mercado:"Nota do mercado",newsletter:"Newsletter",esportes:"Central Esportiva",alimentacao:"Alimentação",compras:"Central de Compras",hoje:"RAC Hoje"};
  function iaModulo(m){return IA_MODULOS[m]||String(m||"")}
  var IA_ERROS={recusado:"a IA não quis ler este conteúdo",resposta_invalida:"resposta fora do formato",provedor_recusou_pedido:"a Anthropic recusou o pedido",
    provedor_ocupado:"serviço ocupado",provedor_indisponivel:"serviço fora do ar",tempo_esgotado:"tempo esgotado",rede:"falha de rede",registro_falhou:"a resposta não foi registrada",interno:"erro interno"};
  /* uma linha de ia_uso → estado em português, custo que conta e se o dono já pode conferir. "Parada" segue o banco
     (ia_reconciliar aceita "enviando" só com enviado_em há mais de 10 minutos) */
  function iaUsoLinha(u,agora){u=u||{};var e=u.estado,erro=u.erro_codigo?(IA_ERROS[u.erro_codigo]||u.erro_codigo):"",res=+u.reservado_usd||0,
      env=u.enviado_em?Date.parse(u.enviado_em):NaN,parada=e==="enviando"&&isFinite(env)&&(agora==null?Date.now():agora)-env>600000;
    function r(estado,custo,custoTxt,conferir){return {estado:estado,custo:custo,custoTxt:custoTxt,conferir:!!conferir}}
    if(e==="concluido")return erro?r("Recusada: "+erro,+u.estimado_usd||0,"estimado"):r("Concluída",+u.estimado_usd||0,"estimado");
    if(e==="incerto")return r("Incerta"+(erro?" ("+erro+")":""),res,"reserva contando",true);
    if(e==="enviando")return parada?r("Parada há mais de 10 minutos",res,"reserva contando",true):r("Em andamento",res,"reserva contando");
    if(e==="reservado")return r("Reservada, antes do envio",res,"reserva contando");
    if(e==="reconciliado")return u.reconciliado_cobrado?r("Conferida: foi cobrada",+u.reconciliado_usd||0,"cobrado"):r("Conferida: não foi cobrada",0,"sem custo");
    if(e==="falhou_sem_envio")return r("Falhou antes do envio"+(erro?" ("+erro+")":""),0,"sem custo");
    return r(String(e||"?"),null,"")}
  /* valor digitado pela pessoa ("0,0021", "US$ 0.0021", "1.234,50"): número entre 0 e o máximo, ou o motivo.
     brl=true: em reais (só muda as mensagens) */
  function iaValorUsd(txt,max,brl){var t=String(txt==null?"":txt).replace(/US\$|R\$|\$|\s/gi,""),moeda=brl?"R$ ":"US$ ";
    if(!t)return {ok:false,motivo:brl?"Digite o valor em reais.":"Digite o valor em dólar (pode ser 0)."};
    if(!/^-?\d[\d.,]*$/.test(t))return {ok:false,motivo:"Use só números, com vírgula ou ponto (ex.: 0,0021)."};
    if(t.indexOf(",")>=0)t=t.replace(/\./g,"").replace(",",".");else if((t.match(/\./g)||[]).length>1)return {ok:false,motivo:"Número inválido."};
    var v=parseFloat(t);if(!isFinite(v)||/^-?[.,]|[.,]$/.test(t))return {ok:false,motivo:"Número inválido."};
    if(v<0)return {ok:false,motivo:"O valor não pode ser negativo."};
    if(max!=null&&v>max)return {ok:false,motivo:"Valor acima de "+moeda+iaNum(max,2)+": confira no Console."};
    return {ok:true,valor:Math.round(v*1e6)/1e6}}
  /* "2026-10" (campo de mês) ou "2026-10-15" → "2026-10-01" */
  function iaMesIso(v){var m=/^(\d{4})-(\d{2})/.exec(String(v||""));return m&&+m[2]>=1&&+m[2]<=12?m[1]+"-"+m[2]+"-01":""}
  /* custo por mês: o que o RAC registrou (concluídas pelo estimado + conferidas pelo valor cobrado; sem o fator de
     correção) × o que a pessoa copiou do Console. Mês sem cobrança registrada fica "não conferido" (null), nunca zero.
     O Console mostra a organização inteira: outros usos da mesma conta entram lá e não no RAC */
  function iaMeses(linhas,cobrancas){var por={};
    function m(k){k=iaMesIso(k);return por[k]||(por[k]={mes:k,rac:0,aberto:0,n:0,cobrado:null,cobradoBrl:null,obs:""})}
    (linhas||[]).forEach(function(u){if(!iaMesIso(u.mes))return;var x=m(u.mes);x.n++;
      if(u.estado==="concluido")x.rac+=+u.estimado_usd||0;
      else if(u.estado==="reconciliado"){if(u.reconciliado_cobrado)x.rac+=+u.reconciliado_usd||0}
      else if(u.estado==="reservado"||u.estado==="enviando"||u.estado==="incerto")x.aberto+=+u.reservado_usd||0});
    (cobrancas||[]).forEach(function(c){if(!iaMesIso(c.mes))return;var x=m(c.mes);x.cobrado=c.valor_usd==null?null:+c.valor_usd;x.cobradoBrl=c.valor_brl==null?null:+c.valor_brl;x.obs=c.observacao||""});
    return Object.keys(por).sort().reverse().map(function(k){var x=por[k];x.rac=Math.round(x.rac*1e6)/1e6;x.aberto=Math.round(x.aberto*1e6)/1e6;
      if(x.cobrado==null){x.dif=null;x.difPct=null;x.difTxt="não conferido"}
      else{x.dif=Math.round((x.cobrado-x.rac)*1e6)/1e6;x.difPct=x.rac>0?Math.round(x.dif/x.rac*1000)/10:null;
        x.difTxt=Math.abs(x.dif)<0.00005?"igual ao RAC":"Console "+iaUsd(Math.abs(x.dif))+(x.dif>0?" acima":" abaixo")+(x.difPct==null?"":" ("+(x.dif>0?"+":"−")+iaNum(Math.abs(x.difPct),1)+"%)")}
      return x})}
  /* ===== Newsletter (newsletter.json, coletado por scripts/atualizar_newsletter.py; docs/newsletter.md) =====
     A relevância é a mesma fórmula do coletor (relevancia() no Python), com os pesos e as palavras do dono. */
  var NL_CATS=[
    {k:"ia",n:"Inteligência Artificial",cor:"#7C3AED"},{k:"tec",n:"Tecnologia",cor:"#2563EB"},
    {k:"cie",n:"Ciência e inovação",cor:"#0E8A6A"},{k:"eco",n:"Economia e negócios",cor:"#B45309"},
    {k:"pol",n:"Política e atualidades",cor:"#C8102E"},{k:"dados",n:"Ciência de Dados e Analytics",cor:"#0891B2"},
    {k:"games",n:"Games e entretenimento tecnológico",cor:"#DB2777"},{k:"soro",n:"Sorocaba e região",cor:"#4B5D73"}];
  var NL_TIPOS={noticia:"Notícia",analise:"Análise",opiniao:"Opinião"};
  var NL_PESOS=[[0,"Esconder"],[0.5,"Menos"],[1,"Normal"],[1.5,"Mais"],[2,"Muito mais"]];
  var NL_LIM={destaqueH:30,fontesRepercute:3,janelaH:48,destMax:10,destMin:5,porCat:3,secao:8};
  /* turnos das edições (coletas das 6h, 12h e 18h de Brasília): o mesmo turnoBRT da rotina do servidor */
  var NL_TURNOS={manha:"6h",tarde:"12h",noite:"18h"};
  function nlTurno(ms){var hr=new Date(ms-3*3600e3).getUTCHours();return hr<12?"manha":hr<18?"tarde":"noite"}
  /* aviso de coleta atrasada: mais de NL_ATRASO_H horas desde a última coleta E já passou (com 1 hora de folga) o início de
     um turno que não teve coleta. De madrugada o último turno esperado é o das 18h, então a noite sem coleta não é atraso.
     Conta pela hora da coleta (coletado), nunca pela data da edição. → null ou {horas, turno pendente, coletado} */
  var NL_ATRASO_H=8,NL_ATRASO_FOLGA_H=1;
  function nlAtraso(coletadoIso,agoraMs){var c=Date.parse(coletadoIso||"");if(!isFinite(c)||!isFinite(agoraMs))return null;
    var horas=(agoraMs-c)/36e5;if(!(horas>NL_ATRASO_H))return null;
    var b=new Date(agoraMs-NL_ATRASO_FOLGA_H*36e5-3*3600e3),hr=b.getUTCHours(),ini=hr>=18?18:hr>=12?12:hr>=6?6:-6;
    var esperado=Date.UTC(b.getUTCFullYear(),b.getUTCMonth(),b.getUTCDate())+ini*36e5+3*3600e3;
    if(c>=esperado)return null;
    return {horas:Math.floor(horas),turno:ini===6?"manha":ini===12?"tarde":"noite",coletado:coletadoIso}}
  /* a data da edição pela chave da chamada de IA (nl-AAAA-MM-DD-xxxxxxxx), para o painel de custos */
  function nlDataDaChave(k){var m=/^nl-(\d{4}-\d{2}-\d{2})-[0-9a-f]{8}/.exec(String(k||""));return m?m[1]:""}
  /* destaques mais novos que a última visita à Newsletter (desdeMs em milissegundos); sem visita válida não se inventa "novos" */
  function nlNovos(destaques,desdeMs){var n=0;if(!destaques||!(desdeMs>0))return 0;for(var i=0;i<destaques.length;i++){if(Date.parse(destaques[i]&&destaques[i].d)>desdeMs)n++}return n}
  function nlCat(k){for(var i=0;i<NL_CATS.length;i++)if(NL_CATS[i].k===k)return NL_CATS[i];return {k:k,n:String(k||"Outros"),cor:"#7B8CA3"}}
  /* configuração do dono (PESSOAL.newsletter): peso por categoria (0 esconde, até 3), palavras de interesse e para esconder, avisos */
  function nlConfig(c){c=c&&typeof c==="object"?c:{};var pe=c.pesos&&typeof c.pesos==="object"?c.pesos:{},p={};
    NL_CATS.forEach(function(x){var v=pe[x.k];p[x.k]=typeof v==="number"&&isFinite(v)?Math.max(0,Math.min(3,v)):1});
    function lista(l){return (Array.isArray(l)?l:String(l||"").split(/[,;\n]/)).map(function(s){return String(s==null?"":s).trim()}).filter(function(s){return s.length>=2}).slice(0,30)}
    return {pesos:p,interesse:lista(c.interesse),ocultar:lista(c.ocultar),avisos:c.avisos!==false,resumo_ia:c.resumo_ia!==false}}
  function nlOculto(g,cfg){if(!(cfg.pesos[g.c]>0))return true;var t=norm(g.t+" "+(g.r||""));
    return cfg.ocultar.some(function(p){return t.indexOf(norm(p))>=0})}
  /* peso × (atualidade + fontes + tipo + imagem + interesse); destaque só se recente ou ainda repercutindo, e nunca opinião */
  function nlRelevancia(g,agoraMs,cfg){cfg=cfg||nlConfig();
    var idade=Math.max(0,(agoraMs-Date.parse(g.d))/3.6e6),n=+g.n||1,peso=cfg.pesos[g.c]==null?1:cfg.pesos[g.c];
    var t=norm(g.t+" "+(g.r||"")),acertos=cfg.interesse.filter(function(p){return t.indexOf(norm(p))>=0}),bonus=Math.min(3,acertos.length*1.5);
    var base=4*Math.max(0,1-idade/36)+2*Math.log(1+n)+(g.tipo==="noticia"?0.5:g.tipo==="analise"?0.3:0)+(g.img?0.2:0);
    var s=Math.round(peso*(base+bonus)*1e4)/1e4,recente=idade<=NL_LIM.destaqueH,repercute=n>=NL_LIM.fontesRepercute&&idade<=NL_LIM.janelaH;
    var porque=[];
    if(n>1)porque.push(n+" veículos cobriram");
    if(!recente&&repercute)porque.push("ainda repercute, publicado há "+Math.round(idade)+" h");else if(idade<6)porque.push("das últimas horas");
    if(acertos.length)porque.push("fala de "+acertos.slice(0,2).join(" e "));
    if(peso>1)porque.push("categoria com peso maior");
    return {s:s,idade:idade,destaque:g.tipo!=="opiniao"&&peso>0&&(recente||repercute),porque:porque.join(" · ")}}
  function nlDataBRT(ms){return new Date(ms-3*3600e3).toISOString().slice(0,10)}
  /* FNV-1a de 32 bits: a mesma lista de notícias dá sempre a mesma chave */
  function nlHash(s){s=String(s);var h=0x811c9dc5;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=(h+((h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24)))>>>0}return ("0000000"+h.toString(16)).slice(-8)}
  /* chave de idempotência do resumo com IA: data + conjunto de notícias (a mesma edição nunca é paga duas vezes) */
  function nlChaveIA(data,ids){return "nl-"+String(data)+"-"+nlHash((ids||[]).slice().sort().join(","))}
  function nlFontes(g){return (g.itens&&g.itens.length?g.itens:(g.fontes&&g.fontes.length?g.fontes:[{t:g.t,u:g.u,f:g.f,d:g.d}])).map(function(i){return {f:i.f,u:i.u,t:i.t,d:i.d}})}
  function nlSnap(g,r){return {id:g.id,c:g.c,tags:(g.tags||[]).slice(0,3),tipo:g.tipo||"noticia",t:g.t,r:g.r||"",u:g.u,f:g.f,d:g.d,n:+g.n||1,img:g.img||null,s:r?r.s:+g.s||0,porque:r?r.porque:"",fontes:nlFontes(g)}}
  function nlTodos(c){return (c.destaques||[]).concat.apply(c.destaques||[],(c.categorias||[]).map(function(k){return k.grupos||[]}))}
  function nlIds(c){var v={},l=[];nlTodos(c).forEach(function(g){if(g&&!v[g.id]){v[g.id]=1;l.push(g.id)}});return l}
  /* a edição do dia com os pesos do dono: 5 a 10 destaques (no máximo 3 por categoria) e as seções */
  function nlEdicao(dados,cfgBruta,agoraMs){var cfg=nlConfig(cfgBruta);dados=dados||{};agoraMs=agoraMs||Date.now();
    var gs=(dados.grupos||[]).filter(function(g){return g&&g.id&&g.t&&g.u&&!nlOculto(g,cfg)}).map(function(g){return {g:g,r:nlRelevancia(g,agoraMs,cfg)}})
      .sort(function(a,b){return b.r.s-a.r.s||(a.g.id<b.g.id?-1:1)});
    var dest=[],porCat={};
    gs.forEach(function(x){if(dest.length<NL_LIM.destMax&&x.r.destaque&&dest.filter(function(y){return y.g.c===x.g.c}).length<NL_LIM.porCat)dest.push(x)});
    /* poucas notícias recentes: completa até 5 com as melhores que sobraram (nunca opinião), dizendo por quê */
    gs.forEach(function(x){if(dest.length<NL_LIM.destMin&&dest.indexOf(x)<0&&x.g.tipo!=="opiniao"){x.r.porque=(x.r.porque?x.r.porque+" · ":"")+"entre as mais recentes disponíveis";dest.push(x)}});
    gs.forEach(function(x){var l=porCat[x.g.c]=porCat[x.g.c]||[];if(l.length<NL_LIM.secao)l.push(x)});
    var ordem=NL_CATS.map(function(c,i){return {c:c,i:i}}).filter(function(o){return porCat[o.c.k]}).sort(function(a,b){return cfg.pesos[b.c.k]-cfg.pesos[a.c.k]||a.i-b.i});
    var fontes=dados.fontes||[],falhas=fontes.filter(function(f){return !f.ok});
    var c={versao:1,data:(dados.edicao&&dados.edicao.data)||nlDataBRT(agoraMs),turno:nlTurno(Date.parse(dados.coletado)||agoraMs),coletado:dados.coletado||null,origem:"regras",
      destaques:dest.map(function(x){return nlSnap(x.g,x.r)}),
      categorias:ordem.map(function(o){return {k:o.c.k,sintese:"",grupos:porCat[o.c.k].map(function(x){return nlSnap(x.g,x.r)})}}),
      fontes:{total:fontes.length,ok:fontes.length-falhas.length,falhas:falhas.map(function(f){return f.n+(f.erro?" ("+f.erro+")":"")})}};
    c.resumo_dia=nlResumoRegras(c);c.chave=nlChaveIA(c.data,nlIds(c));
    return c}
  /* resumo do dia sem IA: só números e a manchete mais coberta, sem inventar nada */
  function nlResumoRegras(c){var d=c.destaques||[];if(!d.length)return "Ainda não há notícias nesta edição.";
    var top=d.slice().sort(function(a,b){return b.n-a.n||b.s-a.s})[0],cats={};d.forEach(function(g){cats[g.c]=1});var nc=Object.keys(cats).length;
    return d.length+" destaques em "+nc+(nc===1?" categoria":" categorias")+". "+
      (top.n>1?"O assunto mais coberto: “"+top.t+"” ("+top.n+" veículos).":"Primeiro destaque: “"+d[0].t+"” ("+d[0].f+").")}
  /* o que vai para a IA: só manchete, trecho, veículos e categoria de cada grupo, com o id; sem links e sem "<" ou ">" */
  function nlEntradaIA(c,max){max=max||14000;var vistos={},grupos=[];
    (c.destaques||[]).forEach(function(g){if(!vistos[g.id]){vistos[g.id]=1;grupos.push({g:g,dest:true})}});
    (c.categorias||[]).forEach(function(k){(k.grupos||[]).slice(0,3).forEach(function(g){if(!vistos[g.id]){vistos[g.id]=1;grupos.push({g:g,dest:false})}})});
    function limpo(t){return String(t==null?"":t).replace(/[<>]/g,"").replace(/\s+/g," ").trim()}
    var txt="Edição de "+c.data+". Cada grupo é um acontecimento; use só o que está escrito aqui.\n",ids=[];
    for(var i=0;i<grupos.length&&ids.length<30;i++){var g=grupos[i].g;
      var b="<grupo id=\""+g.id+"\" categoria=\""+nlCat(g.c).n+"\" tipo=\""+(NL_TIPOS[g.tipo]||"Notícia")+"\" fontes=\""+g.n+"\" destaque=\""+(grupos[i].dest?"sim":"não")+"\">\n"+
        "Título: "+limpo(g.t)+"\n"+(g.r?"Trecho: "+limpo(g.r)+"\n":"")+"Veículos: "+limpo(nlFontes(g).map(function(f){return f.f}).filter(function(f,j,l){return l.indexOf(f)===j}).join(", "))+"\n</grupo>\n";
      if(txt.length+b.length>max)break;txt+=b;ids.push(g.id)}
    return {texto:txt,ids:ids}}
  /* junta a resposta da IA (já validada no servidor) com a edição: links, veículos e datas continuam vindo do coletor */
  function nlAplicarIA(c,res,ids){res=res||{};var mapa={},ok={},desconhecidos=[];
    (ids||nlIds(c)).forEach(function(id){ok[id]=1});
    nlTodos(c).forEach(function(g){mapa[g.id]=g});
    (res.destaques||[]).forEach(function(d){if(!ok[d.id]||!mapa[d.id])desconhecidos.push(d.id)});
    (res.categorias||[]).forEach(function(k){(k.ids||[]).forEach(function(id){if(!ok[id]||!mapa[id])desconhecidos.push(id)})});
    if(desconhecidos.length)return {ok:false,motivo:"a IA citou notícias que não estão na edição: "+desconhecidos.slice(0,3).join(", ")};
    if(!(res.destaques||[]).length||!String(res.resumo_dia||"").trim())return {ok:false,motivo:"a resposta veio sem resumo ou sem destaques"};
    var n=JSON.parse(JSON.stringify(c));n.origem="ia";n.resumo_dia=String(res.resumo_dia);
    n.destaques=res.destaques.map(function(d){var g=JSON.parse(JSON.stringify(mapa[d.id]));g.resumo_ia=String(d.resumo||"");g.relevancia_ia=String(d.relevancia||"");if(d.titulo)g.titulo_pt=String(d.titulo);return g});
    var sint={};(res.categorias||[]).forEach(function(k){sint[k.categoria]=String(k.sintese||"")});
    n.categorias.forEach(function(k){k.sintese=sint[k.k]||""});
    return {ok:true,conteudo:n}}
  /* confere o formato de uma edição guardada (do banco ou da rotina do servidor) antes de mostrar; "" = tudo certo */
  function nlConteudoOk(c){
    if(!c||typeof c!=="object")return "não é um objeto";
    if(c.versao!==1)return "versão desconhecida";
    if(!/^\d{4}-\d{2}-\d{2}$/.test(c.data||""))return "data inválida";
    if(c.origem!=="regras"&&c.origem!=="ia")return "origem inválida";
    if(c.turno!=null&&!NL_TURNOS[c.turno])return "turno inválido";
    if(!Array.isArray(c.destaques)||!Array.isArray(c.categorias))return "sem destaques ou categorias";
    if(c.categorias.some(function(k){return !k||!Array.isArray(k.grupos)}))return "categoria sem grupos";
    var gs=nlTodos(c);
    for(var i=0;i<gs.length;i++){var g=gs[i];
      if(!g||!/^g[0-9a-f]{10}$/.test(g.id||""))return "grupo sem id válido";
      if(!/^https?:\/\//.test(g.u||"")||typeof g.t!=="string"||!g.t)return "grupo "+g.id+" sem link ou manchete";
      if(!Array.isArray(g.fontes)||!g.fontes.length||g.fontes.some(function(f){return !f||!/^https?:\/\//.test(f.u||"")}))return "grupo "+g.id+" sem fontes"}
    if(c.categorias.some(function(k){return !NL_CATS.some(function(x){return x.k===k.k})}))return "categoria desconhecida";
    return ""}
  /* busca e filtros: todas as palavras precisam aparecer (manchete, trecho, veículos ou categoria); mais novas primeiro */
  function nlFiltrar(grupos,f){f=f||{};var ps=norm(f.q||"").split(/\s+/).filter(Boolean);
    return (grupos||[]).filter(function(g){
      if(f.c&&g.c!==f.c&&(g.tags||[]).indexOf(f.c)<0)return false;
      if(f.tipo&&g.tipo!==f.tipo)return false;
      var fs=nlFontes(g);if(f.fonte&&!fs.some(function(x){return x.f===f.fonte}))return false;
      if(!ps.length)return true;
      var t=norm([g.t,g.r,nlCat(g.c).n,(g.tags||[]).map(function(k){return nlCat(k).n}).join(" ")].concat(fs.map(function(x){return x.f+" "+x.t})).join(" "));
      return ps.every(function(p){return t.indexOf(p)>=0})})
      .sort(function(a,b){return f.ordem==="relevancia"?(b.s||0)-(a.s||0):Date.parse(b.d)-Date.parse(a.d)})}
  /* resumo da semana a partir das edições guardadas: dias, destaques por categoria e o que mais foi coberto */
  function nlSemana(edicoes){var dias={},cats={},vistos={},top=[],ia=0;
    (edicoes||[]).forEach(function(e){var c=e&&e.conteudo;if(!c||nlConteudoOk(c))return;if(!dias[c.data]&&c.origem==="ia")ia++;dias[c.data]=1;
      c.destaques.forEach(function(g){cats[g.c]=(cats[g.c]||0)+1;if(!vistos[g.id]){vistos[g.id]=1;top.push(g)}})});
    top.sort(function(a,b){return b.n-a.n||Date.parse(b.d)-Date.parse(a.d)});
    return {dias:Object.keys(dias).sort(),ia:ia,destaques:top.length,
      porCategoria:NL_CATS.filter(function(c){return cats[c.k]}).map(function(c){return {k:c.k,n:cats[c.k]}}).sort(function(a,b){return b.n-a.n}),
      maisCobertos:top.slice(0,5)}}
  /* item de "Guardados" (PESSOAL.salvos): o mesmo formato que as Conexões já usam (tipo, t, u, f, tema), mais categoria e grupo */
  function nlSalvo(g,hoje){return {tipo:"noticia",t:g.titulo_pt||g.t,u:g.u,f:g.f,tema:nlCat(g.c).n,c:g.c,gid:g.id,d:g.d,quando:hoje}}
  /* ===== Central de Segurança: backup em JSON, limpeza de segredos e plano de restauração (nada de tela nem de banco) =====
     Tabelas pessoais na ordem de gravação (pai antes do filho). pk: o que identifica a linha dentro da conta (sem a coluna do dono);
     nat: as chaves únicas do banco além do id (mesmo nome com outro id é o mesmo registro); fk: coluna → tabela pai (opc: pode ficar vazia);
     dono: coluna do dono quando não é user_id; so:"exportar" = vai no backup, mas não volta pela restauração (as edições com IA
     dependem do registro da chamada no banco, que não se recria). */
  var SEG_TABELAS=[{t:"mercados",pk:["id"],nat:[["nome"]]},{t:"produtos",pk:["id"],nat:[["nome"]]},
    {t:"notas",pk:["id"],nat:[["chave_nfce"],["mercado_id","numero","data"]],fk:{mercado_id:"mercados"}},{t:"itens",pk:["id"],fk:{nota_id:"notas",produto_id:"produtos"},opc:{produto_id:1}},
    {t:"orcamentos",pk:["categoria"]},{t:"registros",pk:["id"]},{t:"lista",pk:["id"]},{t:"bebe",pk:["id"],nat:[["chave"]]},
    {t:"pessoal",pk:["chave"]},{t:"garmin_dia",pk:["data"]},{t:"garmin_ativ",pk:["id"]},{t:"garmin_rotas",pk:["id"],dep:"065"},
    {t:"pedidos",pk:["id"]},{t:"pedido_itens",pk:["id"],fk:{pedido_id:"pedidos",produto_id:"produtos"},opc:{produto_id:1}},
    {t:"compras_importacoes",pk:["id"],nat:[["sha256"]]},{t:"compras_online",pk:["id"],fk:{importacao_id:"compras_importacoes"},opc:{importacao_id:1}},{t:"compras_online_itens",pk:["id"],fk:{compra_id:"compras_online"}},{t:"compras_online_docs",pk:["id"],nat:[["sha256"]],fk:{compra_id:"compras_online"}},{t:"compras_reembolsos",pk:["id"],fk:{compra_id:"compras_online"}},{t:"compras_reembolsos_estornos",pk:["id"],nat:[["reembolso_id"]],fk:{reembolso_id:"compras_reembolsos",compra_id:"compras_online"}},
    {t:"notas_fiscais",pk:["id"],nat:[["chave"]],cong:"conferida_em"},{t:"notas_fiscais_itens",pk:["id"],fk:{nota_id:"notas_fiscais"},congPai:{fk:"nota_id",pai:"notas_fiscais"}},{t:"notas_fiscais_docs",pk:["id"],nat:[["sha256"]],fk:{nota_id:"notas_fiscais"},congPai:{fk:"nota_id",pai:"notas_fiscais"},imutavel:true,docPath:true},{t:"notas_fiscais_vinculos",pk:["id"],nat:[["nota_id","modulo","registro_id"]],fk:{nota_id:"notas_fiscais"}},
    {t:"notas_fiscais_tentativas",pk:["id"],fk:{nota_id:"notas_fiscais"},opc:{nota_id:1},so:"exportar"},{t:"notas_fiscais_situacoes",pk:["id"],fk:{nota_id:"notas_fiscais",tentativa_id:"notas_fiscais_tentativas"},opc:{tentativa_id:1},so:"exportar"},{t:"notas_fiscais_entradas",pk:["id"],fk:{nota_id:"notas_fiscais",mercado_nota_id:"notas"},opc:{mercado_nota_id:1},so:"exportar",dep:"059"},{t:"notas_fiscais_consultas",pk:["id"],fk:{nota_id:"notas_fiscais"},so:"exportar",dep:"060"},
    {t:"newsletter_edicoes",pk:["id"],nat:[["data","turno"]],dono:"dono",so:"exportar"},
    {t:"radar_config",pk:["id"],dono:"dono",so:"exportar"},{t:"radar_lojas",pk:["id"],dono:"dono",so:"exportar"},{t:"radar_itens",pk:["id"],dono:"dono",so:"exportar"},
    {t:"radar_ofertas",pk:["id"],dono:"dono",fk:{item_id:"radar_itens",loja_id:"radar_lojas"},so:"exportar"},{t:"radar_coletas",pk:["id"],dono:"dono",fk:{loja_id:"radar_lojas"},opc:{loja_id:1},so:"exportar"},
    {t:"radar_precos",pk:["id"],dono:"dono",fk:{oferta_id:"radar_ofertas",coleta_id:"radar_coletas"},opc:{coleta_id:1},so:"exportar"},
    /* descoberta de ofertas (proposta 048): dados derivados, só exportam; "dep" = a tabela só existe depois da migration, então a exportação a ignora sem acusar falha enquanto ela não existir (segTabelaAusente). page_token nunca sai: segLimpar. */
    {t:"radar_consultas",pk:["id"],dono:"dono",fk:{item_id:"radar_itens"},so:"exportar",dep:"048"},
    {t:"radar_candidatos",pk:["id"],dono:"dono",fk:{item_id:"radar_itens",consulta_id:"radar_consultas",oferta_id:"radar_ofertas"},opc:{consulta_id:1,oferta_id:1},so:"exportar",dep:"048"},
    {t:"radar_historico",pk:["id"],dono:"dono",fk:{item_id:"radar_itens",consulta_id:"radar_consultas"},opc:{consulta_id:1},so:"exportar",dep:"048"},
    /* RAC Inbox I1 (051): metadados de contas, pastas, cursor e identidade de mensagens; sem credencial e sem conteúdo. Só exportam: o estado é reconstruível do provedor, e restaurar um cursor antigo faria a sincronização perder mensagens. */
    {t:"inbox_contas",pk:["id"],dono:"dono",so:"exportar",dep:"051"},{t:"inbox_pastas",pk:["id"],dono:"dono",fk:{conta_id:"inbox_contas"},so:"exportar",dep:"051"},
    {t:"inbox_sincronizacao",pk:["id"],dono:"dono",fk:{conta_id:"inbox_contas",pasta_id:"inbox_pastas"},so:"exportar",dep:"051"},
    {t:"inbox_mensagens_ref",pk:["id"],dono:"dono",fk:{conta_id:"inbox_contas",pasta_id:"inbox_pastas"},opc:{pasta_id:1},so:"exportar",dep:"051"},
    /* RAC Knowledge (062): memória técnica do projeto; só exporta (o histórico e a importação do repositório já guardam o que importa, e restaurar apagaria versões). */
    {t:"conhecimento",pk:["id"],dono:"dono",so:"exportar",dep:"062"},{t:"conhecimento_historico",pk:["id"],dono:"dono",so:"exportar",dep:"062"},
    /* Novo RAC, Lote 1 (070): espaços, participações e Workspace (layouts e preferências); só exportam: espaços e permissões se refazem pelas funções rac_* e restaurar apagaria o histórico de acesso. O histórico de versões fica de fora. */
    {t:"espacos",pk:["id"],dono:"dono",so:"exportar",dep:"070"},{t:"espaco_membros",pk:["espaco_id","user_id"],dono:"user_id",fk:{espaco_id:"espacos"},so:"exportar",dep:"070"},
    {t:"workspace_paginas",pk:["id"],dono:"criado_por",fk:{espaco_id:"espacos"},so:"exportar",dep:"070"},{t:"workspace_pessoal",pk:["pagina_id"],fk:{pagina_id:"workspace_paginas"},so:"exportar",dep:"070"}];
  /* nunca saem nem voltam: a chave dos atalhos (restaurar reativaria uma chave já trocada) e a chave do Google Maps */
  var SEG_CHAVES_FORA={atalho:"chave dos atalhos do iPhone",googleMaps:"chave do Google Maps"};
  var SEG_SEGREDO=/senha|password|passwd|token|secret|segredo|api_?key|apikey|chave_?api|private_?key|access_?key|p256dh|vapid/i;
  /* não comparam: dono e carimbos de hora que mudam sozinhos */
  var SEG_IGNORA={user_id:1,dono:1,atualizado:1,atualizado_em:1};
  /* a leitura falhou porque a tabela ainda não existe (migration pendente), e não por permissão ou rede */
  function segTabelaAusente(msg){return /42P01|PGRST205|does not exist|schema cache|could not find the table/i.test(String(msg||""))}
  function segDef(t){for(var i=0;i<SEG_TABELAS.length;i++)if(SEG_TABELAS[i].t===t)return SEG_TABELAS[i];return null}
  function segChave(d,r){var ok=true,k=d.pk.map(function(c){if(r[c]==null||r[c]==="")ok=false;return String(r[c])}).join("|");return ok?k:null}
  function segNat(cols,r){var ok=true,k=cols.map(function(c){if(r[c]==null||r[c]==="")ok=false;return String(r[c]).trim().toLowerCase()}).join("|");return ok?cols.join("+")+"="+k:null}
  /* JSON com as chaves em ordem: o mesmo conteúdo dá sempre o mesmo texto (e o mesmo SHA-256) */
  function segCanon(v){if(Array.isArray(v))return "["+v.map(segCanon).join(",")+"]";
    if(v&&typeof v==="object")return "{"+Object.keys(v).sort().filter(function(k){return v[k]!==undefined}).map(function(k){return JSON.stringify(k)+":"+segCanon(v[k])}).join(",")+"}";
    return JSON.stringify(v===undefined?null:v)}
  /* tira o que é segredo antes de sair do banco: as chaves proibidas do "pessoal" e qualquer campo com nome de senha/token, em qualquer nível */
  function segLimpar(t,linhas){var fora=[];
    function limpa(v,cam){if(Array.isArray(v))return v.map(function(x,i){return limpa(x,cam+"["+i+"]")});
      if(v&&typeof v==="object"){var o={};Object.keys(v).forEach(function(k){if(SEG_SEGREDO.test(k)){fora.push(cam+"."+k);return}o[k]=limpa(v[k],cam+"."+k)});return o}
      return v}
    var l=(linhas||[]).filter(function(r){if(t==="pessoal"&&r&&SEG_CHAVES_FORA[r.chave]){fora.push("pessoal."+r.chave);return false}return true})
      .map(function(r,i){return limpa(r,t+"#"+(i+1))});
    return {linhas:l,fora:fora}}
  /* o arquivo de backup (formato 2): tabelas + resumo com a quantidade e o SHA-256 de cada uma (hashes calculados por quem chama) */
  function segBackup(conta,criado,tabelas,hashes,fora,falhas){var resumo={};
    Object.keys(tabelas).forEach(function(t){resumo[t]={linhas:tabelas[t].length,sha256:hashes[t]||null}});
    return {formato:"rac-backup",versao:2,site:"Dia a Dia RAC",criado:criado,conta:conta,tabelas:tabelas,resumo:resumo,
      relacoes:[["notas.mercado_id","mercados.id"],["itens.nota_id","notas.id"],["itens.produto_id","produtos.id"]],
      fora:(fora||[]).slice(0,200),falhas:falhas||[]}}
  /* lê e confere um backup (formato 2, ou o 1: do servidor e do .zip): estrutura, identificadores e repetidos. Não confere o SHA-256 (segHashes) */
  function segLer(j){var p=[],av=[],tab={};
    if(!j||typeof j!=="object"||!j.tabelas||typeof j.tabelas!=="object"||Array.isArray(j.tabelas))return {ok:false,problemas:["o arquivo não tem a lista de tabelas: não parece um backup do RAC"],avisos:[],tabelas:{}};
    var v2=j.formato==="rac-backup";
    if(v2&&j.versao!==2)return {ok:false,problemas:["backup na versão "+j.versao+", que este site não conhece"],avisos:[],tabelas:{}};
    Object.keys(j.tabelas).forEach(function(t){var l=j.tabelas[t],d=segDef(t);
      if(!d){av.push(t+": tabela que não entra na restauração");return}
      if(!Array.isArray(l)){p.push(t+": não é uma lista de linhas");return}
      var visto={},ruins=0,rep=0;
      l.forEach(function(r){if(!r||typeof r!=="object"||Array.isArray(r)){ruins++;return}var k=segChave(d,r);if(k==null){ruins++;return}if(visto[k])rep++;visto[k]=1});
      if(ruins)p.push(t+": "+ruins+(ruins===1?" linha sem identificador":" linhas sem identificador"));
      if(rep)p.push(t+": "+rep+(rep===1?" linha repetida":" linhas repetidas")+" dentro do próprio backup");
      if(v2&&j.resumo&&j.resumo[t]&&j.resumo[t].linhas!==l.length)p.push(t+": o resumo diz "+j.resumo[t].linhas+" linhas e o arquivo tem "+l.length);
      tab[t]=l});
    if(v2&&j.resumo)Object.keys(j.resumo).forEach(function(t){if(segDef(t)&&!tab[t]&&!p.some(function(x){return x.indexOf(t+":")===0}))p.push(t+": está no resumo, mas falta no arquivo")});
    if(!Object.keys(tab).length&&!p.length)p.push("nenhuma tabela do RAC no arquivo");
    return {ok:!p.length,versao:v2?2:1,conta:(v2?j.conta:j.dono)||null,criado:j.criado||null,tabelas:tab,resumo:v2?(j.resumo||{}):null,problemas:p,avisos:av}}
  /* confere o SHA-256 de cada tabela com o do resumo (formato 1 não tem: vira aviso) */
  function segHashes(B,hashes){var p=[];if(!B.resumo)return {ok:true,problemas:[],aviso:"backup antigo, sem assinatura das tabelas: a integridade foi conferida só pela estrutura"};
    Object.keys(B.tabelas).forEach(function(t){var r=B.resumo[t];if(!r||!r.sha256)p.push(t+": sem assinatura no resumo");else if(r.sha256!==hashes[t])p.push(t+": o conteúdo não bate com a assinatura (arquivo alterado ou corrompido)")});
    return {ok:!p.length,problemas:p,aviso:""}}
  /* prepara a linha para a conta de destino: dono, caminhos dos anexos e "criado por" (de outra conta não existe aqui) */
  function segAjustar(d,r0,conta,velha){var r={},col=d.dono||"user_id";Object.keys(r0).forEach(function(k){r[k]=r0[k]});
    if(conta)r[col]=conta;
    if(velha&&conta&&velha!==conta){if(Array.isArray(r.arquivos))r.arquivos=r.arquivos.map(function(a){var b={};Object.keys(a||{}).forEach(function(k){b[k]=a[k]});if(b.path)b.path=String(b.path).replace(velha+"/",conta+"/");return b});
      if(r.criado_por!=null&&r.criado_por!==conta)r.criado_por=null}
    return r}
  /* devolve à linha do backup os campos secretos que a linha de hoje tem (em qualquer nível), para a troca não apagá-los */
  function segRepor(r,ex){if(Array.isArray(r)&&Array.isArray(ex))return r.map(function(x,i){return segRepor(x,ex[i])});
    if(!r||!ex||typeof r!=="object"||typeof ex!=="object"||Array.isArray(r)||Array.isArray(ex))return r;
    var o={};Object.keys(r).forEach(function(k){o[k]=segRepor(r[k],ex[k])});Object.keys(ex).forEach(function(k){if(SEG_SEGREDO.test(k)&&!(k in o))o[k]=ex[k]});return o}
  /* documento fiscal do backup: por que não pode ser restaurado (ou null). anexos = {caminhoOriginal:{tamanho,sha256}} do pacote .zip, ou null quando o backup é só JSON */
  function segDocInvalido(r0,o,res){
    var ok=r0.tipo==="xml"?!!NF_MIMES_XML[r0.mime]:(r0.tipo==="pdf"||r0.tipo==="danfe")?r0.mime==="application/pdf":/^image\//.test(String(r0.mime||""));
    if(!ok)return "tipo de arquivo não permitido ("+(r0.mime||"sem tipo")+")";
    var an=o.anexos;if(an==null)return res.outraConta?"restaurar em outra conta exige o pacote .zip com os anexos (o arquivo não veio)":null;
    var a=an[r0.path];if(!a)return "o arquivo do documento não está no pacote";
    if(+a.tamanho!==+r0.tamanho)return "o tamanho do arquivo ("+a.tamanho+") difere do registro ("+r0.tamanho+")";
    if(String(a.sha256)!==String(r0.sha256))return "o SHA-256 do arquivo não bate com o do registro";
    return null}
  /* compara o backup com o que a conta tem hoje e monta o plano (nada é gravado aqui). Cada linha do backup vira:
     nova (não existe), igual (existe idêntica), diferente (existe com outro conteúdo: só muda se o dono pedir) ou inválida (aponta para
     um pai que não existe). Mesmo nome com outro id conta como o mesmo registro, e os filhos passam a apontar para o id de hoje. */
  function segPlano(B,atual,o){o=o||{};var conta=o.conta||null,velha=B.conta||null,mapas={},validos={},congel={},fdocs={},
    res={outraConta:!!(velha&&conta&&velha!==conta),tabelas:[],total:{novas:0,iguais:0,diferentes:0,invalidas:0,fora:0,soExportar:0},renomear:{},semDocumento:{},congeladas:0,docsInvalidos:0},renomear=res.renomear,semDoc=res.semDocumento;
    SEG_TABELAS.forEach(function(d){var l=B.tabelas[d.t],hoje=(atual&&atual[d.t])||[],porPk={},porNat={},mapa={},val={};
      mapas[d.t]=mapa;validos[d.t]=val;
      /* o que existe hoje vale como pai mesmo quando a tabela não está no backup */
      hoje.forEach(function(r){var k=segChave(d,r);if(k!=null){porPk[k]=r;if(d.pk.length===1)val[k]=1}
        if(d.cong&&r[d.cong]!=null)(congel[d.t]=congel[d.t]||{})[r.id]=1;if(d.docPath&&r.nota_id)fdocs[r.nota_id]=(fdocs[r.nota_id]||0)+1;(d.nat||[]).forEach(function(c){var n=segNat(c,r);if(n)porNat[n]=r})});
      if(!l)return;
      var it={t:d.t,so:d.so||"",novas:[],iguais:0,diferentes:[],invalidas:[],remapeadas:0,fora:0,semPai:0,congeladas:0,semDocumento:0};
      if(d.so){it.soExportar=l.length;res.total.soExportar+=l.length;res.tabelas.push(it);return}
      var vistos={};
      l.forEach(function(r0){if(!r0||typeof r0!=="object")return;var k=segChave(d,r0);if(k==null||vistos[k])return;vistos[k]=1;
        if(d.t==="pessoal"&&SEG_CHAVES_FORA[r0.chave]){it.fora++;return}
        var r=segAjustar(d,segLimpar(d.t,[r0]).linhas[0],conta,velha),bad=null;
        /* filhos primeiro apontam para o id do pai de hoje (o pai pode ter sido reconhecido pelo nome) */
        if(d.fk)Object.keys(d.fk).forEach(function(c){if(r[c]==null||bad)return;var pai=d.fk[c],v=(mapas[pai]||{})[r[c]]||r[c];
          if((validos[pai]||{})[v])r[c]=v;else if(d.opc&&d.opc[c]){r[c]=null;it.semPai++}else bad=c+" aponta para "+pai+" que não existe"});
        if(bad){it.invalidas.push({linha:r0,motivo:bad});return}
        if(d.congPai){var pid=r[d.congPai.fk];if(pid!=null&&(congel[d.congPai.pai]||{})[pid]){it.congeladas++;res.congeladas++;return}}
        var ex=porPk[k];
        if(!ex&&d.nat&&d.pk[0]==="id")d.nat.some(function(c){var n=segNat(c,r);if(n&&porNat[n]){ex=porNat[n];mapa[r.id]=ex.id;r.id=ex.id;it.remapeadas++;return true}return false});
        if(ex&&d.cong&&ex[d.cong]!=null){it.congeladas++;res.congeladas++;return}
        /* documento fiscal novo: confere tipo, arquivo, tamanho e SHA-256 antes de gravar; o caminho passa a ser o da conta de destino */
        if(d.docPath&&!ex){var inv=segDocInvalido(r0,o,res);if(inv){it.invalidas.push({linha:r0,motivo:inv});res.docsInvalidos++;return}
          var fim=String(r0.path||"").split("/").pop(),novo=conta&&r.nota_id?conta+"/notas-fiscais/"+r.nota_id+"/"+fim:r0.path;
          renomear[r0.path]={path:novo,mime:r0.mime,tamanho:r0.tamanho,sha256:r0.sha256};r.path=novo;fdocs[r.nota_id]=(fdocs[r.nota_id]||0)+1}
        if(d.pk.length===1)val[String(r[d.pk[0]])]=1;
        /* duas linhas do backup que caem no mesmo registro por nome: a segunda não entra de novo */
        (d.nat||[]).forEach(function(c){var n=segNat(c,r);if(n&&!porNat[n])porNat[n]=r});
        if(!ex){it.novas.push(r);porPk[segChave(d,r)]=r;return}
        /* compara sem os segredos (o backup não os tem) e, se trocar, os segredos de hoje continuam na linha */
        var exL=segLimpar(d.t,[ex]).linhas[0]||{},campos=Object.keys(r).filter(function(c){return !SEG_IGNORA[c]&&segCanon(r[c])!==segCanon(exL[c]===undefined?null:exL[c])});
        if(!campos.length)it.iguais++;else if(d.imutavel){it.congeladas++;res.congeladas++}else it.diferentes.push({linha:segRepor(r,ex),atual:ex,campos:campos})});
      ["novas","diferentes","invalidas"].forEach(function(c){res.total[c]+=it[c].length});res.total.iguais+=it.iguais;res.total.fora+=it.fora;
      res.tabelas.push(it)});
    var tn=res.tabelas.filter(function(t){return t.t==="notas_fiscais"})[0],ti=res.tabelas.filter(function(t){return t.t==="notas_fiscais_itens"})[0];
    if(tn)tn.novas.concat(tn.diferentes.map(function(x){return x.linha})).forEach(function(r){if(!(fdocs[r.id]>0)){semDoc[r.id]=1;tn.semDocumento++}});
    if(ti){var fica=[];ti.novas.forEach(function(r){if(fdocs[r.nota_id]>0)fica.push(r);else{semDoc[r.nota_id]=1;ti.invalidas.push({linha:r,motivo:"a nota não tem documento original válido"});res.total.novas--;res.total.invalidas++}});ti.novas=fica}
    return res}
  /* o que será gravado, na ordem: novas sempre entram (insert, nunca sobrescreve); diferentes só com "substituir" (upsert) */
  function segEscrita(plano,substituir){var l=[],confs=[];
    plano.tabelas.forEach(function(it){if(it.so)return;
      /* Central Fiscal: nota conferida entra PENDENTE (itens e documentos só entram em nota ainda não conferida); a conferência original (quem e quando) volta no fim */
      function sem(r){if(it.t!=="notas_fiscais"||r.conferida_em==null)return r;var c={};Object.keys(r).forEach(function(k){c[k]=r[k]});
        if(!(plano.semDocumento&&plano.semDocumento[r.id]))confs.push(r);delete c.conferida_por;delete c.conferida_em;return c}
      if(it.novas.length)l.push({t:it.t,op:"insert",linhas:it.novas.map(sem)});
      if(substituir&&it.diferentes.length)l.push({t:it.t,op:"upsert",linhas:it.diferentes.map(function(x){return sem(x.linha)})})});
    if(confs.length)l.push({t:"notas_fiscais",op:"conferencia",linhas:confs});
    return l}
  /* para onde vai um anexo do .zip (nome = "anexos/<caminho original>"). Anexo fiscal (segmento 2 = notas-fiscais) só vai se estiver no mapa renomear do plano
     (linha válida do backup), ao caminho novo e com o tipo do registro; os demais seguem a regra de sempre (trocar a pasta da conta antiga pela da nova). */
  function segAnexoDestino(nome,ctx){ctx=ctx||{};var orig=String(nome||"").slice(7),seg=orig.split("/");
    if(seg[1]==="notas-fiscais"){var r=ctx.renomear&&ctx.renomear[orig];
      return r?{acao:"enviar",origem:orig,path:r.path,mime:r.mime||null}:{acao:"ignorar",origem:orig,path:null,mime:null,motivo:"anexo fiscal sem documento válido no plano"}}
    var path=orig;if(ctx.velha&&ctx.velha!==ctx.conta)path=path.replace(ctx.velha+"/",ctx.conta+"/");
    return {acao:"enviar",origem:orig,path:path,mime:null}}
  /* envia os anexos, um por vez. enviar(path,bytes,mime) devolve Promise de {error}. Um anexo fiscal ignorado não interrompe os demais;
     "já existe" conta como existente; qualquer outro erro de envio interrompe, como antes. */
  function segAnexosEnviar(anexos,ctx,enviar,progresso){var r={anexos:0,anexosExistentes:0,ignorados:0,motivos:[]},n=0;
    return (anexos||[]).reduce(function(p,a){return p.then(function(){var d=segAnexoDestino(a.nome,ctx);n++;
      if(d.acao==="ignorar"){r.ignorados++;r.motivos.push(d.origem+": "+d.motivo);return}
      if(progresso)progresso(n,anexos.length,d.path);
      return Promise.resolve(enviar(d.path,a.dados,d.mime)).then(function(x){x=x||{};var e=x.error;if(!e){r.anexos++;return}
        if(/exist|duplicate|409/i.test(e.message||"")||e.statusCode==="409"){r.anexosExistentes++;return}throw new Error("anexo "+d.path+": "+e.message)})})},Promise.resolve()).then(function(){return r})}
  /* nota da proteção da conta (0 a 100) a partir das conferências da Central */
  function segNota(c){var itens=[["senha",c.senha!==false,15],["mfa",!!c.mfa,25],["bancoMfa",!!c.bancoMfa,15],["reserva",!!c.reserva,10],
      ["backupManual",c.diasBackup!=null&&c.diasBackup<=30,15],["backupServidor",c.diasServidor!=null&&c.diasServidor<=9,10],["auditoria",!!c.auditoria,10]],
      n=0;itens.forEach(function(x){if(x[1])n+=x[2]});
    return {nota:n,nivel:n>=85?"forte":n>=55?"média":"fraca",faltam:itens.filter(function(x){return !x[1]}).map(function(x){return x[0]})}}
  /* ===== Painel de Produtividade: contas sobre dados reais (nada é inventado; sem dado, devolve vazio ou null) ===== */
  /* os n meses que terminam no mês de fimISO, do mais antigo ao mais novo: ["2026-05", …, "2026-10"] */
  function pnMeses(fimISO,n){var y=+fimISO.slice(0,4),m=+fimISO.slice(5,7),L=[];
    for(var i=0;i<n;i++){L.unshift(y+"-"+(m<10?"0":"")+m);if(--m<1){m=12;y--}}return L}
  /* soma por mês e por fonte: itens [{d:"AAAA-MM-DD", v:número, f:"fonte"}] → {mes:{total, por:{fonte:v}, n}} só dos meses pedidos */
  function pnPorMes(itens,meses){var o={};meses.forEach(function(m){o[m]={total:0,por:{},n:0}});
    (itens||[]).forEach(function(x){if(!x||typeof x.v!=="number"||!isFinite(x.v)||!x.d)return;var m=String(x.d).slice(0,7);if(!o[m])return;
      o[m].total+=x.v;o[m].n++;var f=x.f||"outros";o[m].por[f]=(o[m].por[f]||0)+x.v});
    return o}
  /* todas as despesas com data, de três fontes reais: itens do Mercado (view compras), registros com dados.custo (veículos, Eddie, Olivia,
     documentos) e parcelas do MBA marcadas como pagas (no mês do vencimento). O registro que veio de uma compra do Mercado
     (dados.compra, ex.: "Lata N aberta") fica de fora: o preço já está no Mercado. fonteDe(quem) dá o nome da fonte do registro. */
  /* compras online (Central de Compras): o total pago de cada pedido, uma vez (coDespesas). Pedidos (Alimentação e Delivery,
     tabela pedidos com os itens): outra fonte, separada em comida, taxas e gorjeta
     (alPedidoDespesas). Não se cruza com o Mercado: compra de mercado fica no Mercado, pedido fica em pedidos. */
  function pnDespesas(compras,registros,parcelas,fonteDe,pedidos,comprasOnline){var L=coDespesas(comprasOnline);
    (pedidos||[]).forEach(function(p){L=L.concat(alPedidoDespesas(p))});
    (compras||[]).forEach(function(x){var v=+x.valor_total;if(x.data&&isFinite(v))L.push({d:x.data,v:v,f:"Mercado",cat:mkCatOficial(x.categoria)||"Outros"})});
    (registros||[]).forEach(function(r){var d=r.dados||{};if(typeof d.custo!=="number"||!isFinite(d.custo)||d.compra||!r.data)return;L.push({d:r.data,v:d.custo,f:fonteDe?fonteDe(r.quem):r.quem,cat:r.tipo})});
    (parcelas||[]).forEach(function(p){if(p&&p.paga&&p.venc&&typeof p.v==="number")L.push({d:p.venc,v:p.v,f:"MBA",cat:"mensalidade"})});
    return L}
  /* variação entre dois valores; null quando não há base de comparação (anterior ausente ou zero) */
  function pnVariacao(atual,anterior){if(atual==null||anterior==null||!isFinite(atual)||!isFinite(anterior)||anterior===0)return null;
    return {dif:atual-anterior,pct:(atual-anterior)/Math.abs(anterior)*100}}
  /* orçamento × gasto do mês: gastos {categoria:valor}, orcamentos [{categoria, valor}] → linhas e totais (só categorias com orçamento ou gasto) */
  function pnOrcamento(gastos0,orcamentos){var orc={},cats={},gastos={};(orcamentos||[]).forEach(function(o){if(o&&o.categoria&&+o.valor>=0){var k=mkCatOficial(o.categoria);orc[k]=(orc[k]||0)+(+o.valor);cats[k]=1}});
    Object.keys(gastos0||{}).forEach(function(c){var k=mkCatOficial(c);gastos[k]=(gastos[k]||0)+(+gastos0[c]||0);cats[k]=1});
    var L=Object.keys(cats).map(function(c){var g=+(gastos||{})[c]||0,v=orc[c];
      return {categoria:c,gasto:g,orcado:v==null?null:v,pct:v?g/v*100:null,estado:v==null?"sem":g>v?"acima":g>=v*0.8?"perto":"ok"}})
      .sort(function(a,b){return b.gasto-a.gasto||a.categoria.localeCompare(b.categoria)});
    var com=L.filter(function(x){return x.orcado!=null});
    return {linhas:L,temOrcamento:com.length>0,orcado:com.reduce(function(s,x){return s+x.orcado},0),gastoOrcado:com.reduce(function(s,x){return s+x.gasto},0),
      acima:com.filter(function(x){return x.estado==="acima"}).length,dentro:com.filter(function(x){return x.estado!=="acima"}).length}}
  /* projeção simples do mês (ritmo até hoje × dias do mês); só depois do 5º dia, para não exagerar começo de mês */
  function pnProjecao(gastoAteHoje,hojeISO){var d=+hojeISO.slice(8,10),y=+hojeISO.slice(0,4),m=+hojeISO.slice(5,7),dm=new Date(Date.UTC(y,m,0)).getUTCDate();
    return d<5||!(gastoAteHoje>0)?null:gastoAteHoje/d*dm}
  /* segunda-feira (ISO) da semana de uma data */
  function pnSemana(iso){var t=new Date(iso.slice(0,10)+"T12:00:00Z"),w=(t.getUTCDay()+6)%7;t.setUTCDate(t.getUTCDate()-w);return t.toISOString().slice(0,10)}
  /* consistência de treinos no período [ini, fim]: dias e semanas com treino, média por semana e sequências de semanas seguidas */
  function pnConsistencia(datas,ini,fim){var dias={},sem={};(datas||[]).forEach(function(d){d=String(d).slice(0,10);if(d>=ini&&d<=fim){dias[d]=1;sem[pnSemana(d)]=1}});
    var semanas=[];for(var s=pnSemana(ini);s<=fim;){semanas.push(s);var t=new Date(s+"T12:00:00Z");t.setUTCDate(t.getUTCDate()+7);s=t.toISOString().slice(0,10)}
    var maior=0,cur=0;semanas.forEach(function(s){if(sem[s]){cur++;if(cur>maior)maior=cur}else cur=0});
    /* sequência atual: conta para trás; a semana corrente sem treino ainda não quebra a sequência */
    var atual=0,i=semanas.length-1;if(i>=0&&!sem[semanas[i]])i--;for(;i>=0&&sem[semanas[i]];i--)atual++;
    var n=(datas||[]).filter(function(d){d=String(d).slice(0,10);return d>=ini&&d<=fim}).length;
    return {treinos:n,diasAtivos:Object.keys(dias).length,semanas:semanas.length,semanasAtivas:semanas.filter(function(s){return sem[s]}).length,
      porSemana:semanas.length?n/semanas.length:0,sequenciaAtual:atual,maiorSequencia:maior}}
  /* média mensal de uma métrica diária: dias [{data, dados}], f(dados) → número ou null; meses sem nenhum valor ficam null */
  function pnMediaMes(dias,f,meses){var s={},c={};(dias||[]).forEach(function(d){var v=f(d.dados||{}),m=String(d.data).slice(0,7);if(typeof v==="number"&&isFinite(v)){s[m]=(s[m]||0)+v;c[m]=(c[m]||0)+1}});
    return meses.map(function(m){return c[m]?{mes:m,media:s[m]/c[m],dias:c[m]}:{mes:m,media:null,dias:0}})}
  /* competências: para cada habilidade de SKILLS, se o dono declarou e quantos estudos concluídos (com data) apontam para ela.
     evid: [{t:"título", d:"AAAA-MM-DD", skill?:"chave forçada"}]; a ligação vem do mesmo reconhecimento de texto das vagas */
  function pnCompetencias(evid,declaradas){var dec={};(declaradas||[]).forEach(function(k){dec[k]=1});
    return SKILLS.map(function(s){var l=(evid||[]).filter(function(e){return e&&e.d&&(e.skill===s[0]||(!e.skill&&s[2].test(e.t||"")))});
      var ult=l.reduce(function(m,e){return !m||e.d>m?e.d:m},null);
      return {k:s[0],n:s[1],declarada:!!dec[s[0]],estudos:l.length,ultima:ult}})}
  /* ===== Central Esportiva (docs/esportes.md): temporada de cada liga, desempenho recente e o pacote de fatos da IA ===== */
  var ESP_FASES={pre:"pré-temporada",regular:"temporada regular",pos:"playoffs",fora:"fora de temporada"},ESP_TIPOS={1:"pre",2:"regular",3:"pos",4:"fora"};
  /* temporada e fase de cada liga. mlb: info = a temporada do ano de hoje na API da MLB (/seasons); nba/nfl: info = o "season" da ESPN
     ({year, displayName, type}). Sem info, uma estimativa pelo calendário (estimada: true). NBA: o ano da ESPN é o do fim (2026-27 = 2027); NFL: o do começo */
  function espTemporada(liga,hoje,info){
    var d=String(hoje).slice(0,10),y=+d.slice(0,4),md=d.slice(5),ano,fase,rot;
    if(liga==="mlb"){var s=info&&info.regularSeasonStartDate?info:null;
      if(s){if(d<s.regularSeasonStartDate){ano=y-1;fase=d>=(s.springStartDate||s.regularSeasonStartDate)?"pre":"fora"}
        else if(d<=(s.regularSeasonEndDate||"9999")){ano=y;fase="regular"}
        else if(d<=(s.postSeasonEndDate||s.regularSeasonEndDate)){ano=y;fase="pos"}else{ano=y;fase="fora"}}
      else if(md<"03-25"){ano=y-1;fase=md>="02-20"?"pre":"fora"}else if(md<="09-28"){ano=y;fase="regular"}else if(md<="10-31"){ano=y;fase="pos"}else{ano=y;fase="fora"}
      return {liga:liga,ano:ano,rotulo:String(ano),fase:fase,faseNome:ESP_FASES[fase],estimada:!s}}
    var t=info&&info.type,tipo=ESP_TIPOS[t&&typeof t==="object"?(t.type||+t.id):t];
    if(liga==="nba"){ano=info&&info.year?+info.year:(md>="07-01"?y+1:y);rot=(info&&info.displayName)||((ano-1)+"-"+String(ano).slice(2));
      fase=tipo||(md>="10-20"||md<="04-13"?"regular":md<="06-25"?"pos":md>="10-01"?"pre":"fora")}
    else{ano=info&&info.year?+info.year:(md>="03-01"?y:y-1);rot=String(ano);
      fase=tipo||(md>="09-04"||md<="01-06"?"regular":md<="02-15"?"pos":md>="08-01"?"pre":"fora")}
    return {liga:liga,ano:ano,rotulo:rot,fase:fase,faseNome:ESP_FASES[fase],estimada:!info}}
  /* como terminou (ou está) a pós-temporada de um time da MLB, só com os jogos oficiais (agenda com hydrate=seriesStatus) */
  var MLB_SERIES={F:"Wild Card",D:"Série Divisional",L:"Final da Liga",W:"Série Mundial"};
  function mlbDesfecho(jogos,timeId){
    var pos=(jogos||[]).filter(function(g){return g&&/^[FDLW]$/.test(g.gameType)&&g.status&&g.status.abstractGameState==="Final"&&g.teams})
      .sort(function(a,b){return String(a.gameDate).localeCompare(String(b.gameDate))});
    if(!pos.length)return null;
    var u=pos[pos.length-1],ss=u.seriesStatus||{},casa=u.teams.home.team.id===timeId,adv=casa?u.teams.away.team:u.teams.home.team;
    var r={serie:MLB_SERIES[u.gameType]||"",adversario:{id:adv.id,nome:adv.name},data:String(u.gameDate||"").slice(0,10),jogos:pos.length};
    if(!ss.isOver){r.tipo="em_andamento";return r}
    var venceu=!!(ss.winningTeam&&ss.winningTeam.id===timeId);
    r.tipo=venceu?(u.gameType==="W"?"campeao":"avancou"):"eliminado";
    r.vitorias=venceu?ss.wins:ss.losses;r.derrotas=venceu?ss.losses:ss.wins;return r}
  function espDia(iso){var t=Date.parse(iso);return isFinite(t)?nlDataBRT(t):String(iso||"").slice(0,10)}
  function espUm(x){return Math.round(x*10)/10}
  /* desempenho nos n últimos jogos terminados (pular = quantos dos mais recentes deixar de fora, para comparar com o período anterior).
     jogos no formato do site ({state, date, home, away} com score); meu(time) diz qual lado é o time */
  function espUltimos(jogos,meu,n,pular){
    var fin=(jogos||[]).filter(function(g){return g&&g.state==="post"&&g.home&&g.away&&isFinite(parseFloat(g.home.score))&&isFinite(parseFloat(g.away.score))})
      .sort(function(a,b){return String(a.date).localeCompare(String(b.date))});
    var fim=Math.max(0,fin.length-(pular||0)),l=fin.slice(Math.max(0,fim-n),fim);
    var r={jogos:l.length,v:0,d:0,e:0,pro:0,contra:0,saldo:0,mediaPro:null,mediaContra:null,inicio:null,fim:null,seq:"",lista:[]};
    l.forEach(function(g){var eu=meu(g.home)?g.home:g.away,ele=eu===g.home?g.away:g.home,a=parseFloat(eu.score),b=parseFloat(ele.score),res=a>b?"V":a<b?"D":"E";
      r.pro+=a;r.contra+=b;r[res.toLowerCase()]++;
      r.lista.push({data:espDia(g.date),adversario:ele.abbr||ele.name||"",casa:eu===g.home,pro:a,contra:b,res:res})});
    if(!r.jogos)return r;
    r.saldo=r.pro-r.contra;r.mediaPro=espUm(r.pro/r.jogos);r.mediaContra=espUm(r.contra/r.jogos);
    r.inicio=r.lista[0].data;r.fim=r.lista[r.lista.length-1].data;
    var ult=r.lista[r.lista.length-1].res,k=0;for(var i=r.lista.length-1;i>=0&&r.lista[i].res===ult;i--)k++;r.seq=ult+k;
    return r}
  /* atividade recente de um time (Central Esportiva): o jogo mais recente que começou e já terminou ou está ao vivo.
     recente = ao vivo agora, ou jogo (terminado) que começou nas últimas "horas" horas (24 por padrão). Sem jogo, não há atividade. */
  function espAtividade(jogos,agora,horas){
    var lim=agora-(horas||24)*3600000,ult=null,vivo=false;
    (jogos||[]).forEach(function(g){var t=g&&Date.parse(g.date);if(!g||!isFinite(t)||t>agora)return;
      if(g.state==="live")vivo=true;
      if((g.state==="post"||g.state==="live")&&(ult==null||t>ult))ult=t});
    return {aoVivo:vivo,ultimo:ult,horasDesde:ult==null?null:Math.max(0,(agora-ult)/3600000),recente:vivo||(ult!=null&&ult>=lim)}}
  /* ordem da Central: quem tem atividade recente vem primeiro (ao vivo antes, depois o mais recente); os demais, do mais recente ao mais antigo.
     times: [{k, jogos}]. Empate mantém a ordem recebida. */
  function espCentralOrdem(times,agora,horas){
    var l=(times||[]).map(function(t,i){return {k:t.k,i:i,a:espAtividade(t.jogos,agora,horas)}});
    l.sort(function(x,y){if(x.a.aoVivo!==y.a.aoVivo)return x.a.aoVivo?-1:1;
      var ux=x.a.ultimo==null?-Infinity:x.a.ultimo,uy=y.a.ultimo==null?-Infinity:y.a.ultimo;
      return uy>ux?1:uy<ux?-1:x.i-y.i});
    return {recentes:l.filter(function(x){return x.a.recente}),demais:l.filter(function(x){return !x.a.recente})}}
  /* "há 5 horas", "há 3 dias", "há 2 meses" (horas desde o último jogo; sem jogo: texto próprio) */
  function espHa(horas){
    if(horas==null)return "sem jogos nesta temporada";
    if(horas<1)return "há menos de 1 hora";
    if(horas<24){var hh=Math.floor(horas);return "há "+hh+(hh===1?" hora":" horas")}
    var d=Math.floor(horas/24);
    if(d<60)return "há "+d+(d===1?" dia":" dias");
    var m=Math.floor(d/30);return "há "+m+(m===1?" mês":" meses")}
  /* variação de um período para o anterior, por jogo (positivo = mais pontos/corridas) */
  function espComparar(rec,ant){if(!rec||!ant||!rec.jogos||!ant.jogos)return null;return {pro:espUm(rec.mediaPro-ant.mediaPro),contra:espUm(rec.mediaContra-ant.mediaContra)}}
  /* pacote de fatos da IA: cada fato tem id (f01…), fonte e período, escritos pelo sistema; a IA só pode citar estes ids e os números deles */
  function espAttr(s){return String(s==null?"":s).replace(/["<>&]/g,"").replace(/\s+/g," ").trim().slice(0,80)}
  function espFatos(lista){var fatos=[],fontes=[],per=[];
    (lista||[]).forEach(function(f){if(!f||!f.texto||fatos.length>=90)return;
      var t=String(f.texto).replace(/[<>]/g,"").replace(/\s+/g," ").trim().slice(0,300);if(!t)return;
      var n=fatos.length+1,fo=espAttr(f.fonte),pe=espAttr(f.periodo);
      fatos.push({id:"f"+(n<10?"0":"")+n,texto:t,fonte:fo,periodo:pe,grupo:espAttr(f.grupo)});
      if(fo&&fontes.indexOf(fo)<0)fontes.push(fo);if(pe&&per.indexOf(pe)<0)per.push(pe)});
    return {fatos:fatos,ids:fatos.map(function(f){return f.id}),fontes:fontes,periodos:per,
      texto:fatos.map(function(f){return '<fato id="'+f.id+'"'+(f.fonte?' fonte="'+f.fonte+'"':"")+(f.periodo?' periodo="'+f.periodo+'"':"")+">"+f.texto+"</fato>"}).join("\n")}}
  /* chave de idempotência: a mesma ação, o mesmo foco e os mesmos fatos dão a mesma chave (o servidor não cobra duas vezes) */
  function espChaveIA(acao,foco,texto){return "esp-"+String(acao).replace(/^esportes\./,"").replace(/[^a-z]/g,"")+"-"+String(foco||"geral").replace(/[^a-z0-9]/g,"").slice(0,20)+"-"+nlHash(texto)}
  /* números de um texto (6-4 → 6 e 4; ,762 e .762 → 0.762), para conferir que a IA só usou números dos fatos */
  function espNumeros(s){return (String(s||"").match(/\d*[.,]?\d+/g)||[]).map(function(t){return parseFloat(t.replace(",","."))}).filter(function(x){return isFinite(x)})}
  /* segunda conferência, no aparelho, antes de mostrar (a primeira é a do servidor): ids conhecidos e números presentes nos fatos citados */
  function espAplicarIA(res,pacote){res=res||{};var mapa={};((pacote&&pacote.fatos)||[]).forEach(function(f){mapa[f.id]=f});
    function bloco(texto,ids,nome){ids=Array.isArray(ids)?ids:[];
      var fora=ids.filter(function(id){return !mapa[id]});if(fora.length)return {erro:nome+" cita um fato que não foi enviado ("+String(fora[0]).slice(0,10)+")"};
      if(!ids.length)return {erro:nome+" não cita nenhum fato"};
      var ok={};ids.forEach(function(id){var f=mapa[id];espNumeros(f.texto+" "+f.periodo).forEach(function(x){ok[x]=1})});
      var sem=espNumeros(texto).filter(function(x){return !ok[x]});
      if(sem.length)return {erro:nome+" tem um número que não está nos fatos citados ("+sem[0]+")"};
      return {texto:String(texto||""),fatos:ids.map(function(id){return mapa[id]})}}
    if(/\d/.test(String(res.titulo||"")))return {ok:false,motivo:"o título tem número"};
    var r=bloco(res.resumo,res.resumo_fatos,"o resumo");if(r.erro)return {ok:false,motivo:r.erro};
    var pontos=[],l=Array.isArray(res.pontos)?res.pontos:[];
    for(var i=0;i<l.length;i++){var b=bloco(l[i]&&l[i].texto,l[i]&&l[i].fatos,"o ponto "+(i+1));if(b.erro)return {ok:false,motivo:b.erro};b.tipo=String(l[i].tipo||"");pontos.push(b)}
    var ins=(Array.isArray(res.insuficiente)?res.insuficiente:[]).map(String).filter(function(t){return t&&!/\d/.test(t)});
    return {ok:true,titulo:String(res.titulo||""),resumo:r,pontos:pontos,insuficiente:ins}}
  /* cache local das análises REAIS: guarda as max mais recentes */
  function espCacheGuardar(cache,chave,item,max){var c={};Object.keys(cache||{}).forEach(function(k){c[k]=cache[k]});c[chave]=item;
    Object.keys(c).sort(function(a,b){return ((c[b]&&c[b].quando)||0)-((c[a]&&c[a].quando)||0)}).slice(max||8).forEach(function(k){delete c[k]});return c}
  /* ===== Veículos: abastecimentos (registros tipo "abastecimento"), consumo e custos (docs/veiculos.md) =====
     Nada é estimado: campo que falta fica null, e trecho com dado faltando ou incoerente sai da conta (com o motivo). */
  var AB_COMBUST=["gasolina comum","gasolina aditivada","etanol","diesel"];
  /* faixa possível de consumo (km/l): fora disso o trecho tem km ou litros errados */
  var AB_KML={min:3,max:70};
  function abNum(v){return typeof v==="number"&&isFinite(v)&&v>0?v:null}
  /* um registro → os campos do abastecimento (os registros antigos não têm tanque: fica null, "não informado") */
  function abLer(r){var d=r&&r.dados||{},km=abNum(d.km);
    return {id:r.id,quem:r.quem,data:r.data,hora:/^\d{2}:\d{2}$/.test(d.hora||"")?d.hora:null,km:km!=null&&Math.round(km)===km?km:null,litros:abNum(d.litros),preco:abNum(d.precoLitro),
      total:abNum(d.custo),tanque:d.tanque==="cheio"||d.tanque==="parcial"?d.tanque:null,combustivel:d.combustivel||null,posto:r.valor||null,pagamento:d.pagamento||null,origem:d.origem||null}}
  function abOrdem(a,b){return a.data<b.data?-1:a.data>b.data?1:(a.hora||"")<(b.hora||"")?-1:(a.hora||"")>(b.hora||"")?1:(a.km||0)-(b.km||0)}
  function abDoTipo(regs){return (regs||[]).filter(function(r){return r&&r.tipo==="abastecimento"&&r.data}).map(abLer).sort(abOrdem)}
  /* um trecho de tanque cheio (L[i]) a tanque cheio (L[j]): os litros são os colocados depois do primeiro, com os parciais do meio e o segundo cheio */
  function abTrecho(L,i,j){var A=L[i],B=L[j],meio=L.slice(i+1,j+1),t={de:A,ate:B,n:meio.length,km:null,litros:null,custo:null,kml:null,ok:false,motivo:null};
    if(A.km==null||B.km==null){t.motivo="falta a quilometragem";return t}
    if(B.km<=A.km){t.motivo="a quilometragem não aumentou";return t}
    var ant=A.km;for(var k=0;k<meio.length;k++){var x=meio[k];
      if(x.km!=null){if(x.km<ant||x.km>B.km){t.motivo="quilometragem fora de ordem";return t}ant=x.km}
      if(x.litros==null){t.motivo="faltam os litros de um abastecimento";return t}
      if(k<meio.length-1&&x.tanque==null){t.motivo="um abastecimento no meio está sem a marcação de tanque";return t}}
    t.km=B.km-A.km;t.litros=Math.round(meio.reduce(function(s,x){return s+x.litros},0)*1000)/1000;t.kml=t.km/t.litros;
    if(t.kml<AB_KML.min||t.kml>AB_KML.max){t.motivo="consumo impossível ("+(Math.round(t.kml*10)/10)+" km/l): confira km e litros";t.kml=null;return t}
    t.custo=meio.every(function(x){return x.total!=null})?Math.round(meio.reduce(function(s,x){return s+x.total},0)*100)/100:null;
    t.ok=true;return t}
  /* consumo pelo método do tanque cheio, separado por veículo. ini/fim (opcionais): só os trechos inteiros dentro do período.
     kml = soma dos km ÷ soma dos litros (média ponderada); kmlSimples = média dos km/l de cada trecho; custoKm = R$ ÷ km dos trechos com o total de todos */
  function abConsumo(regs,ini,fim){var L=abDoTipo(regs),por={},trechos=[],cheios=0;
    L.forEach(function(x){(por[x.quem]=por[x.quem]||[]).push(x)});
    Object.keys(por).forEach(function(q){var V=por[q],a=-1;for(var i=0;i<V.length;i++){if(V[i].tanque!=="cheio")continue;cheios++;if(a>=0)trechos.push(abTrecho(V,a,i));a=i}});
    trechos=trechos.filter(function(t){return (!ini||t.de.data>=ini)&&(!fim||t.ate.data<=fim)});
    var ok=trechos.filter(function(t){return t.ok}),km=ok.reduce(function(s,t){return s+t.km},0),l=ok.reduce(function(s,t){return s+t.litros},0),
      cc=ok.filter(function(t){return t.custo!=null}),ckm=cc.reduce(function(s,t){return s+t.km},0),cr=cc.reduce(function(s,t){return s+t.custo},0);
    return {trechos:trechos,validos:ok.length,descartados:trechos.length-ok.length,cheios:cheios,km:km,litros:Math.round(l*1000)/1000,
      kml:l?km/l:null,kmlSimples:ok.length?ok.reduce(function(s,t){return s+t.kml},0)/ok.length:null,custoKm:ckm?cr/ckm:null,custoKmBase:{km:ckm,custo:Math.round(cr*100)/100,trechos:cc.length}}}
  /* preço por litro: ponderado = total pago ÷ litros (só registros com os dois); simples = média dos preços anotados */
  function abPrecos(regs){var L=abDoTipo(regs),c=L.filter(function(x){return x.litros!=null&&x.total!=null}),p=L.filter(function(x){return x.preco!=null}),
      t=c.reduce(function(s,x){return s+x.total},0),l=c.reduce(function(s,x){return s+x.litros},0);
    return {ponderado:l?t/l:null,simples:p.length?p.reduce(function(s,x){return s+x.preco},0)/p.length:null,n:c.length,litros:Math.round(l*1000)/1000,total:Math.round(t*100)/100}}
  /* por mês: gasto (total pago), litros, quantidade e preço ponderado do mês */
  function abPorMes(regs,meses){var o={};meses.forEach(function(m){o[m]={gasto:0,litros:0,n:0,preco:null,_t:0,_l:0}});
    abDoTipo(regs).forEach(function(x){var b=o[x.data.slice(0,7)];if(!b)return;b.n++;if(x.total!=null)b.gasto+=x.total;if(x.litros!=null)b.litros+=x.litros;if(x.total!=null&&x.litros!=null){b._t+=x.total;b._l+=x.litros}});
    meses.forEach(function(m){var b=o[m];b.gasto=Math.round(b.gasto*100)/100;b.litros=Math.round(b.litros*1000)/1000;b.preco=b._l?b._t/b._l:null;delete b._t;delete b._l});return o}
  /* tudo de um período (ini..fim): gasto, litros, preços e consumo */
  function abResumo(regs,ini,fim){var L=(regs||[]).filter(function(r){return r&&r.tipo==="abastecimento"&&r.data&&(!ini||r.data>=ini)&&(!fim||r.data<=fim)}),A=abDoTipo(L);
    return {n:A.length,gasto:Math.round(A.reduce(function(s,x){return s+(x.total||0)},0)*100)/100,litros:Math.round(A.reduce(function(s,x){return s+(x.litros||0)},0)*1000)/1000,
      precos:abPrecos(L),consumo:abConsumo(regs,ini,fim)}}
  /* o mesmo abastecimento já lançado: mesmo veículo e data e (mesma km, ou mesmo total e litros). ignorar = o próprio registro, na edição */
  function abDuplicado(c,regs,ignorar){var perto=function(a,b){return a!=null&&b!=null&&Math.abs(a-b)<0.005};
    return abDoTipo(regs).filter(function(x){return x.id!==ignorar&&x.quem===c.quem&&x.data===c.data&&((c.km!=null&&x.km===c.km)||(perto(x.total,c.total)&&perto(x.litros,c.litros)))})[0]||null}
  /* conferência antes de salvar: erros impedem; avisos só alertam. ctx: {hoje, ultimaKm, exigirTanque, exigir}
     exigir: campos obrigatórios (km, litros, preco, total); vazio ou zero conta como não preenchido. Nada é calculado aqui: o que falta, falta. */
  var AB_TOL_RS=0.1,AB_CAMPOS={km:"a quilometragem do painel",litros:"os litros",preco:"o preço por litro",total:"o total pago"};
  function abConferir(c,ctx){ctx=ctx||{};var e=[],a=[];
    if(!c.quem)e.push("Escolha o veículo.");
    if(!/^\d{4}-\d{2}-\d{2}$/.test(c.data||""))e.push("Escolha a data.");else if(ctx.hoje&&c.data>ctx.hoje)e.push("A data está no futuro.");
    var falta=(ctx.exigir||[]).filter(function(k){return !(typeof c[k]==="number"&&c[k]>0)}).map(function(k){return AB_CAMPOS[k]});
    if(falta.length)e.push("Preencha "+(falta.length>1?falta.slice(0,-1).join(", ")+" e "+falta[falta.length-1]:falta[0])+" (maior que zero).");
    if(!(ctx.exigir||[]).length&&c.litros==null&&c.total==null)e.push("Preencha os litros e o total (estão na bomba).");
    if(c.litros!=null&&!(c.litros>=0.1&&c.litros<=200))e.push("Os litros parecem errados ("+c.litros+").");
    if(c.preco!=null&&!(c.preco>=1&&c.preco<=20))e.push("O preço por litro parece errado ("+c.preco+").");
    if(c.total!=null&&!(c.total>=0.5&&c.total<=5000))e.push("O total parece errado ("+c.total+").");
    if(c.km!=null&&!(c.km>0&&c.km<2e6&&Math.round(c.km)===c.km))e.push("A quilometragem precisa ser um número inteiro, como 18181.");
    if(ctx.exigirTanque&&c.tanque!=="cheio"&&c.tanque!=="parcial")e.push("Marque se o tanque ficou cheio ou parcial.");
    if(c.km==null&&(ctx.exigir||[]).indexOf("km")<0)a.push("Sem a quilometragem do painel, este abastecimento não entra no cálculo de consumo.");
    /* divergência relevante (mais de R$ 0,10 e de 1% do total) impede: a bomba arredonda centavos, não reais */
    if(c.litros!=null&&c.preco!=null&&c.total!=null&&Math.abs(c.litros*c.preco-c.total)>Math.max(AB_TOL_RS,c.total*0.01))e.push("Litros × preço dá "+(Math.round(c.litros*c.preco*100)/100).toFixed(2).replace(".",",")+", diferente do total ("+c.total.toFixed(2).replace(".",",")+"). Confira na foto da bomba.");
    if(c.km!=null&&ctx.ultimaKm!=null&&c.km<ctx.ultimaKm)a.push("A quilometragem é menor que a última anotada ("+ctx.ultimaKm+"). Confira se não leu o parcial (Trip).");
    if(c.km!=null&&ctx.ultimaKm!=null&&c.km-ctx.ultimaKm>5000)a.push("São mais de 5.000 km desde a última anotação. Confira o hodômetro.");
    return {erros:e,avisos:a}}
  /* o campo dados para gravar: mantém o que já havia (alertas, ficha…), troca os campos do abastecimento e, na edição,
     anota atualizadoEm e guarda os valores anteriores em versoes (até 10). criado_em não está aqui: o banco não muda. */
  function abDados(c,ant,agora){var d={},o=ant&&ant.dados||{};Object.keys(o).forEach(function(k){d[k]=o[k]});
    var m={km:c.km,litros:c.litros,precoLitro:c.preco,custo:c.total!=null?Math.round(c.total*100)/100:null,combustivel:c.combustivel||null,tanque:c.tanque||null,pagamento:c.pagamento||null,hora:c.hora||null};
    Object.keys(m).forEach(function(k){if(m[k]==null)delete d[k];else d[k]=m[k]});
    if(d.custo!=null)d.itensCusto=[[(d.litros?String(d.litros).replace(".",",")+" l de ":"")+(d.combustivel||"combustível"),d.custo]];else delete d.itensCusto;
    if(ant){var v={em:o.atualizadoEm||ant.criado_em||null,data:ant.data};["km","litros","precoLitro","custo","combustivel","tanque","pagamento","hora"].forEach(function(k){if(o[k]!=null)v[k]=o[k]});
      d.versoes=(Array.isArray(o.versoes)?o.versoes:[]).concat([v]).slice(-10);d.atualizadoEm=agora;d.origem=o.origem||"manual"}
    else d.origem=c.origem||"manual";
    return d}
  /* as despesas dos veículos em categorias separadas: combustível não se mistura com manutenção */
  function pnVeicCat(tipo){return tipo==="abastecimento"?"Combustível":/^(revisao|oleo|manutencao|bateria|pneu)$/.test(tipo)?"Manutenção":tipo==="seguro"?"Seguro":tipo==="documento"?"Impostos e licenciamento":"Outros"}
  /* ===== Alimentação e Delivery (docs/alimentacao.md): contas dos pedidos, categorias, nomes de produtos e duplicidade.
     Dinheiro em centavos inteiros por dentro (0,1 + 0,2 não vira 0,30000000000000004); a saída volta em reais. ===== */
  var AL_TOL=2,AL_MAX=10000000; /* tolerância de 2 centavos; acima de R$ 100.000 o valor parece errado */
  var AL_PLATAFORMAS={ifood:"iFood","99food":"99Food",direto:"Direto no estabelecimento",outro:"Outro"};
  var AL_MODOS={delivery:"Entrega",retirada:"Retirada",no_local:"No local"};
  /* reais (número ou texto "R$ 1.234,56") → centavos; vazio → null; negativo, infinito ou texto inválido → NaN */
  function alCent(v){if(v==null||v==="")return null;var n=v;
    if(typeof n==="string"){var s=n.replace(/R\$|\s/g,"");if(/,\d{1,2}$/.test(s))s=s.replace(/\./g,"").replace(",",".");if(!/^-?\d+(\.\d+)?$/.test(s))return NaN;n=parseFloat(s)}
    if(typeof n!=="number"||!isFinite(n)||n<0)return NaN;return Math.round(n*100+1e-7)}
  function alBRL(c){var s=(Math.abs(c)/100).toFixed(2).split("."),i=s[0].replace(/\B(?=(\d{3})+(?!\d))/g,".");return (c<0?"−":"")+"R$ "+i+","+s[1]}
  /* um item: total da linha (ou quantidade × unitário) e desconto do item; com os dois valores, confere */
  function alItem(it,i){it=it||{};var e=[],nome=String(it.descricao||"").trim(),rot=nome?"“"+nome.slice(0,40)+"”":"o item "+(i+1);
    if(!nome)e.push("Escreva o nome do item "+(i+1)+".");
    var q=it.qtd==null||it.qtd===""?1:+String(it.qtd).replace(",",".");if(!(q>0&&q<=1000))e.push("Confira a quantidade de "+rot+".");
    var u=alCent(it.unitario),t=alCent(it.total),d=alCent(it.desconto);
    if(u!==u)e.push("Confira o preço unitário de "+rot+".");if(t!==t)e.push("Confira o total de "+rot+".");if(d!==d)e.push("Confira o desconto de "+rot+".");
    if(e.length)return {ok:false,erros:e};
    var calc=u!=null?Math.round(q*u):null,bruto=t!=null?t:calc;d=d||0;
    if(bruto==null)return {ok:false,erros:["Preencha o valor de "+rot+"."]};
    if(bruto>AL_MAX)return {ok:false,erros:["O valor de "+rot+" parece errado."]};
    if(t!=null&&calc!=null&&Math.abs(t-calc)>AL_TOL)return {ok:false,erros:[rot.charAt(0).toUpperCase()+rot.slice(1)+": quantidade × unitário dá "+alBRL(calc)+", mas o total da linha é "+alBRL(t)+"."]};
    if(d>bruto)return {ok:false,erros:["O desconto de "+rot+" passa do valor do item."]};
    return {ok:true,erros:[],qtd:q,bruto:bruto,desconto:d,liquido:bruto-d}}
  var AL_CAMPOS=[["taxa_entrega","a taxa de entrega"],["taxa_servico","a taxa de serviço"],["gorjeta","a gorjeta"],["desconto_loja","o desconto da loja"],["desconto_plataforma","o desconto da plataforma"]];
  /* a conta do pedido: total = subtotal (itens já com o desconto de cada um) + entrega + serviço + gorjeta − desconto da loja − desconto da
     plataforma. O total pago é obrigatório e precisa bater com a conta (tolerância de 2 centavos); nada é calculado no lugar do que falta. */
  function alPedidoConta(p){p=p||{};var e=[],c={},itens=Array.isArray(p.itens)?p.itens:[],sub=0,bruto=0,itensOk=true;
    if(!itens.length){e.push("Inclua pelo menos um item.");itensOk=false}
    itens.forEach(function(it,i){var r=alItem(it,i);if(!r.ok){itensOk=false;e.push.apply(e,r.erros)}else{sub+=r.liquido;bruto+=r.bruto}});
    AL_CAMPOS.forEach(function(k){var v=alCent(p[k[0]]);if(v!==v||v>AL_MAX)e.push("Confira "+k[1]+" (um valor de zero para cima).");c[k[0]]=v>0?v:0});
    var sd=alCent(p.subtotal);if(sd!==sd)e.push("Confira o subtotal.");
    else if(sd!=null&&itensOk&&Math.abs(sd-sub)>AL_TOL&&Math.abs(sd-bruto)>AL_TOL)e.push("Os itens somam "+alBRL(sub)+", mas o subtotal do pedido é "+alBRL(sd)+".");
    var calc=sub+c.taxa_entrega+c.taxa_servico+c.gorjeta-c.desconto_loja-c.desconto_plataforma;
    if(itensOk&&calc<0)e.push("Os descontos passam do valor do pedido.");
    var pago=alCent(p.total_pago);
    if(pago==null)e.push("Preencha o total pago.");else if(pago!==pago||pago>AL_MAX)e.push("Confira o total pago.");
    else if(itensOk&&calc>=0&&Math.abs(pago-calc)>AL_TOL)e.push("A conta dá "+alBRL(calc)+" (itens + taxas + gorjeta − descontos), mas o total pago é "+alBRL(pago)+".");
    var R=function(x){return x==null||x!==x?null:x/100};
    return {ok:!e.length,erros:e,subtotal:R(sub),taxa_entrega:R(c.taxa_entrega),taxa_servico:R(c.taxa_servico),taxas:R(c.taxa_entrega+c.taxa_servico),gorjeta:R(c.gorjeta),
      desconto_loja:R(c.desconto_loja),desconto_plataforma:R(c.desconto_plataforma),descontos:R(c.desconto_loja+c.desconto_plataforma),calculado:R(calc),pago:R(pago)}}
  /* conferência antes de salvar: a conta acima + estabelecimento, data (não futura), plataforma e modo válidos */
  function alConferir(p,ctx){ctx=ctx||{};p=p||{};var e=[];
    if(!String(p.estabelecimento||"").trim())e.push("Escreva o estabelecimento.");
    if(!/^\d{4}-\d{2}-\d{2}$/.test(p.data||""))e.push("Escolha a data.");else if(ctx.hoje&&p.data>ctx.hoje)e.push("A data está no futuro.");
    if(!AL_PLATAFORMAS[p.plataforma])e.push("Escolha onde foi o pedido.");if(!AL_MODOS[p.modo])e.push("Escolha entrega, retirada ou no local.");
    var c=alPedidoConta(p);return {ok:!e.length&&c.ok,erros:e.concat(c.erros),conta:c}}
  /* categorias financeiras da alimentação; o que não é comida (limpeza, higiene, descartáveis, fraldas) fica fora do total */
  var AL_CAT={supermercado:"Alimentação · Supermercado",acougue:"Alimentação · Açougue/Peixaria",padaria:"Alimentação · Padaria",hortifruti:"Alimentação · Hortifrúti",
    delivery:"Alimentação · Delivery",restaurante:"Alimentação · Restaurante",taxas:"Alimentação · Taxas de entrega e serviço",gorjeta:"Alimentação · Gorjeta"};
  var AL_CATEGORIAS=["supermercado","acougue","padaria","hortifruti","delivery","restaurante","taxas","gorjeta"].map(function(k){return AL_CAT[k]});
  /* as categorias do Mercado de hoje (nenhuma muda): em qual grupo a comida entra */
  var AL_MERC_COMIDA={"bebidas":"supermercado","acougue/frios":"acougue","peixaria":"acougue","hortifruti":"hortifruti","padaria":"padaria","chocolates/doces":"supermercado","mercearia":"supermercado"};
  var AL_NAO_COMIDA=/limpeza|higiene|descartave|bebe|infantil|fralda|farmacia|remedio|utilidade|papelaria|cosmetic|perfum|bazar|racao|pet\b/;
  /* fraldas e lenços umedecidos nunca são comida, mesmo numa categoria de comida ("fraldinha" é carne e continua) */
  var AL_PROD_NAO_COMIDA=/(^|[^a-z])(fralda|fraldas|pampers|huggies)([^a-z]|$)|umedecid/;
  /* item do Mercado → categoria de alimentação; "" = não é comida; null = categoria desconhecida (aparece como "sem classificação") */
  function alCatMercado(categoria,produto){var c=norm(categoria).trim(),p=norm(produto);
    if(AL_PROD_NAO_COMIDA.test(p))return "";var g=AL_MERC_COMIDA[c];if(g)return AL_CAT[g];return AL_NAO_COMIDA.test(c)?"":null}
  /* delivery: modo entrega, ou pedido pelo iFood/99Food sem modo; o resto (retirada, no local, direto) é restaurante */
  function alModo(p){var m=String((p||{}).modo||""),pl=String((p||{}).plataforma||"");return m==="delivery"||(!m&&(pl==="ifood"||pl==="99food"))?"delivery":"restaurante"}
  /* o pedido em despesas que somam o total pago: a comida (itens − descontos) em Delivery ou Restaurante, taxas e gorjeta à parte.
     Desconto maior que a comida (ex.: entrega grátis) desconta o resto das taxas. Formato do Painel: [{d, v, f, cat}] */
  function alPedidoDespesas(p){var c=alPedidoConta(p);if(!c.ok||!p.data)return [];
    var C=function(x){return Math.round((x||0)*100)},comida=C(c.subtotal)-C(c.descontos),taxas=C(c.taxas),gorjeta=C(c.gorjeta);
    if(comida<0){taxas+=comida;comida=0}
    var dif=C(c.pago)-(comida+taxas+gorjeta);if(comida>0||!taxas)comida+=dif;else taxas+=dif;
    var modo=alModo(p),f=modo==="delivery"?"Delivery":"Restaurante",L=[];
    [[comida,AL_CAT[modo]],[taxas,AL_CAT.taxas],[gorjeta,AL_CAT.gorjeta]].forEach(function(x){if(x[0]>0)L.push({d:p.data,v:x[0]/100,f:f,cat:x[1],id:p.id||null})});
    return L}
  /* itens do Mercado (view compras) → só a comida, na categoria de alimentação; o resto fica contado à parte (não entra no total) */
  function alMercadoDespesas(compras){var o={linhas:[],fora:0,sem:{}};
    (compras||[]).forEach(function(x){var v=+x.valor_total;if(!x.data||!isFinite(v))return;var cat=alCatMercado(x.categoria,x.produto||x.descricao);
      if(cat)o.linhas.push({d:x.data,v:v,f:"Mercado",cat:cat,estab:x.mercado||""});else if(cat==="")o.fora+=v;else{var k=x.categoria||"Outros";o.sem[k]=(o.sem[k]||0)+v}});
    return o}
  /* soma por categoria, em centavos (sem erro de arredondamento) */
  function alSomar(linhas){var t=0,por={};(linhas||[]).forEach(function(x){var c=Math.round((+x.v||0)*100);t+=c;por[x.cat]=(por[x.cat]||0)+c});
    Object.keys(por).forEach(function(k){por[k]/=100});return {total:t/100,por:por}}
  /* ---- nomes de produtos: chave padrão, tamanho e comparação (nunca junta quando há dúvida) ---- */
  var AL_ABREV={refri:"refrigerante",refrig:"refrigerante",trad:"tradicional",integ:"integral",desn:"desnatado",choc:"chocolate",bisc:"biscoito",qj:"queijo",mus:"mussarela",mussar:"mussarela",
    pres:"presunto",fgo:"frango",frgo:"frango",cong:"congelado",min:"mineral",ling:"linguica",semidesnatado:"semidesnatado"};
  var AL_PARADA=/^(de|da|do|das|dos|com|c|e|un|und|unid|unidade|unidades|kg|g|gr|l|lt|ml)$/;
  var AL_VERSOES=["zero","diet","light","sem acucar","sem lactose","zero lactose","integral","desnatado","semidesnatado","sem gluten","organico","congelado","resfriado","fatiado","descafeinado","lata","pet","garrafa","long neck","retornavel","sem sal"];
  var AL_VERSOES_FRACAS={tradicional:1,original:1};
  /* tamanho no nome → {ml} ou {g}: 2 L, 2 litros, 2LT e 2000 ml dão o mesmo; 1,5 kg = 1500 g. Mais de um tamanho diferente: ambíguo (null) */
  function alTamanho(nome){var t=norm(nome).replace(/(\d),(\d)/g,"$1.$2"),re=/(\d+(?:\.\d+)?)\s*(litros?|lts?|l|ml|kgs?|quilos?|gramas?|grs?|g)(?![a-z])/g,m,v=null,ok=true;
    while((m=re.exec(t))){var n=parseFloat(m[1]),u=m[2],x=/^(ml)$/.test(u)?{ml:n}:/^(litros?|lts?|l)$/.test(u)?{ml:n*1000}:/^(kgs?|quilos?)$/.test(u)?{g:n*1000}:{g:n};
      x.ml!=null&&(x.ml=Math.round(x.ml*1000)/1000);x.g!=null&&(x.g=Math.round(x.g*1000)/1000);
      if(v&&(v.ml!==x.ml||v.g!==x.g))ok=false;v=x}
    return ok?v:null}
  function alProdutoInfo(nome){var base=norm(nome).replace(/(\d),(\d)/g,"$1.$2"),tam=alTamanho(nome);
    var semTam=base.replace(/(\d+(?:\.\d+)?)\s*(litros?|lts?|l|ml|kgs?|quilos?|gramas?|grs?|g)(?![a-z])/g," ");
    var pal=semTam.replace(/[^a-z0-9.]+/g," ").split(" ").map(function(w){w=w.replace(/^\.+|\.+$/g,"");return AL_ABREV[w]||w}).filter(function(w){return w&&!AL_PARADA.test(w)});
    var txt=" "+pal.join(" ")+" ",ver=AL_VERSOES.filter(function(v){return txt.indexOf(" "+v+" ")>=0}).sort(),fracas=pal.filter(function(w){return AL_VERSOES_FRACAS[w]});
    var tamTxt=tam?(tam.ml!=null?tam.ml+"ml":tam.g+"g"):"";
    return {palavras:pal,tamanho:tam,versoes:ver,fracas:fracas,numeros:pal.filter(function(w){return /\d/.test(w)}).sort(),
      chave:pal.slice().sort().join(" ")+(tamTxt?" "+tamTxt:""),colado:pal.join("")+tamTxt}}
  function alChaveProduto(nome){return alProdutoInfo(nome).chave}
  /* "igual" (pode juntar sozinho), "possivel" (pergunta antes) ou "diferente" (nunca junta), com o motivo */
  function alCompararProdutos(a,b){var A=alProdutoInfo(a),B=alProdutoInfo(b);
    if(!A.palavras.length||!B.palavras.length)return {resultado:"diferente",motivo:"nome vazio"};
    var mesmoTam=JSON.stringify(A.tamanho)===JSON.stringify(B.tamanho);
    if(A.tamanho&&B.tamanho&&!mesmoTam)return {resultado:"diferente",motivo:"tamanho diferente"};
    if(A.versoes.join("|")!==B.versoes.join("|"))return {resultado:"diferente",motivo:"versão diferente ("+(A.versoes.concat(B.versoes).filter(function(v){return A.versoes.indexOf(v)<0||B.versoes.indexOf(v)<0}).join(", "))+")"};
    if(A.numeros.length&&B.numeros.length&&A.numeros.join("|")!==B.numeros.join("|"))return {resultado:"diferente",motivo:"números diferentes no nome"};
    if(A.chave===B.chave||(A.colado===B.colado))return mesmoTam?{resultado:"igual",motivo:"mesmo produto"}:{resultado:"possivel",motivo:"um dos nomes não diz o tamanho"};
    var sA=A.palavras.filter(function(w){return !AL_VERSOES_FRACAS[w]}),sB=B.palavras.filter(function(w){return !AL_VERSOES_FRACAS[w]});
    var com=sA.filter(function(w){return sB.indexOf(w)>=0}).length,uni=sA.length+sB.length-com;
    var contido=com===Math.min(sA.length,sB.length)&&com>0;
    if((contido||com/uni>=0.5)&&(mesmoTam||!A.tamanho||!B.tamanho))return {resultado:"possivel",motivo:contido?"um nome tem palavras a mais":"nomes parecidos"};
    return {resultado:"diferente",motivo:"nomes diferentes"}}
  /* histórico de preços: só produtos (Mercado e itens de pedido ligados a um produto); prato de restaurante não entra */
  function alNoHistorico(it){return !!(it&&(it.origem==="mercado"||it.produto_id))}
  /* preço por litro ou quilo, para comparar tamanhos diferentes */
  function alPrecoBase(nome,unitario){var t=alTamanho(nome),v=+unitario;if(!t||!isFinite(v)||v<=0)return null;
    return t.ml?{v:Math.round(v/t.ml*1000*100)/100,por:"L"}:t.g?{v:Math.round(v/t.g*1000*100)/100,por:"kg"}:null}
  /* duplicidade: "confirmada" (mesmo lançamento, ou mesma plataforma e mesmo número de pedido) bloqueia; "possivel" (mesmo
     estabelecimento, data e valor, sem números que provem que são pedidos diferentes) só pede confirmação; null = nenhuma */
  function alNumeroPedido(n){return String(n||"").toUpperCase().replace(/[^A-Z0-9]/g,"").replace(/^0+(?=.)/,"")}
  function alEstab(n){return alChaveProduto(String(n||"").replace(/\s*\(.*\)$/,""))}
  function alDuplicata(novo,lista,ignorar){novo=novo||{};var num=alNumeroPedido(novo.numero),pl=String(novo.plataforma||""),est=alEstab(novo.estabelecimento),
    tot=alCent(novo.total_pago!=null?novo.total_pago:novo.total),possivel=null;
    for(var i=0;i<(lista||[]).length;i++){var x=lista[i];if(!x||(ignorar&&x.id===ignorar))continue;
      if(novo.id&&x.id===novo.id)return {nivel:"confirmada",pedido:x,motivo:"é o mesmo lançamento"};
      var xn=alNumeroPedido(x.numero),xp=String(x.plataforma||"");
      if(num&&xn&&xp===pl){if(num===xn)return {nivel:"confirmada",pedido:x,motivo:"mesma plataforma e mesmo número de pedido ("+x.numero+")"};continue}
      var xt=alCent(x.total_pago!=null?x.total_pago:x.total);
      if(!possivel&&x.data===novo.data&&tot!=null&&tot===tot&&xt!=null&&Math.abs(xt-tot)<=1&&alEstab(x.estabelecimento)===est&&est)
        possivel={nivel:"possivel",pedido:x,motivo:"mesmo estabelecimento, mesma data e mesmo valor"+(xp!==pl?" (lançado como outra origem)":"")}}
    return possivel}
  /* dados do pedido para gravar: números em reais com 2 casas; na edição, os valores anteriores vão para versoes (até 10) */
  var AL_VERSIONADOS=["data","estabelecimento","plataforma","modo","numero","pagamento","subtotal","taxa_entrega","taxa_servico","gorjeta","desconto_loja","desconto_plataforma","total_pago","observacoes"];
  function alVersao(ant,agora){if(!ant)return [];var v={em:ant.atualizado_em||ant.criado_em||null,quando:agora};AL_VERSIONADOS.forEach(function(k){if(ant[k]!=null&&ant[k]!=="")v[k]=ant[k]});
    if(Array.isArray(ant.itens))v.itens=ant.itens.map(function(i){return {descricao:i.descricao,qtd:i.qtd,total:i.total}});
    return (Array.isArray(ant.versoes)?ant.versoes:[]).concat([v]).slice(-10)}
  /* integridade de um pedido JÁ GRAVADO (como vem do banco: itens em pedido_itens, números podem vir como texto). Só aponta, nunca corrige.
     O unitário gravado é derivado (total ÷ quantidade, arredondado), então fica fora da conferência para não dar falso alarme. */
  function alIntegridade(p){p=p||{};var its=Array.isArray(p.pedido_itens)?p.pedido_itens:Array.isArray(p.itens)?p.itens:[];
    if(!its.length)return {ok:false,problemas:["O pedido está gravado sem nenhum item."]};
    var q={};Object.keys(p).forEach(function(k){q[k]=p[k]});
    q.itens=its.slice().sort(function(a,b){return (+a.ordem||0)-(+b.ordem||0)}).map(function(i){return {descricao:i.descricao,qtd:i.qtd,total:i.total,desconto:i.desconto}});
    var e=alPedidoConta(q).erros;return {ok:!e.length,problemas:e}}
  /* a lista de pedidos gravados: quantos têm problema e quais (só os que têm) */
  function alIntegridadeLista(pedidos){var L=[];(pedidos||[]).forEach(function(p){var r=alIntegridade(p);if(!r.ok)L.push({id:p&&p.id||null,data:p&&p.data||null,estabelecimento:p&&p.estabelecimento||"",problemas:r.problemas})});
    return {total:(pedidos||[]).length,comProblema:L.length,pedidos:L}}
  /* duplicidade ENTRE MÓDULOS: o mesmo gasto lançado como nota do Mercado e como pedido (ex.: padaria). Só "possivel", nunca bloqueia.
     notas: [{id, data, total, mercado}] com o nome do mercado já resolvido (ou {mercados:{nome}}, como o Supabase devolve no select embutido).
     Mesma data + mesmo estabelecimento (a normalização de alDuplicata) + valor a até 2 centavos; nota sem total não é comparada. */
  function alDuplicataMercado(p,notas){p=p||{};var est=alEstab(p.estabelecimento),tot=alCent(p.total_pago!=null?p.total_pago:p.total);
    if(!est||!p.data||tot==null||tot!==tot)return null;
    for(var i=0;i<(notas||[]).length;i++){var n=notas[i];if(!n||n.data!==p.data)continue;
      var nt=alCent(n.total),nome=n.mercado!=null?n.mercado:n.mercados&&n.mercados.nome;
      if(nt==null||nt!==nt||Math.abs(nt-tot)>AL_TOL||alEstab(nome)!==est)continue;
      return {nivel:"possivel",nota:n,motivo:"há uma nota do Mercado com o mesmo estabelecimento, a mesma data e o mesmo valor"}}
    return null}
  /* ===== Botão de atualizar (Etapa A): as regras, sem tela. A tela (js/app.js) coleta o estado e mostra o resultado. ===== */
  /* formulário com alteração não salva? campos: [{tipo, valor, inicial, marcado, marcadoInicial, arquivos, desligado, filtro}].
     Busca e filtro não contam (são preservados); campo desligado ou só de leitura também não; arquivo escolhido conta. */
  var ATU_IGNORA={search:1,button:1,submit:1,reset:1,hidden:1,image:1};
  function atuFormSujo(campos){return (campos||[]).some(function(c){if(!c||c.desligado||c.filtro||ATU_IGNORA[c.tipo])return false;
    if(c.tipo==="checkbox"||c.tipo==="radio")return !!c.marcado!==!!c.marcadoInicial;
    if(c.tipo==="file")return (c.arquivos||0)>0;
    return String(c.valor==null?"":c.valor)!==String(c.inicial==null?"":c.inicial)})}
  /* pode atualizar agora? Nesta ordem: já atualizando, sem internet, tarefa em andamento, formulário não salvo. Nunca descarta nada. */
  function atuPode(e){e=e||{};
    if(e.rodando)return {ok:false,motivo:"rodando",texto:"Já estou atualizando esta página."};
    if(e.online===false)return {ok:false,motivo:"offline",texto:"Sem internet: nada foi atualizado. Os dados de antes continuam na tela."};
    if(e.ocupado)return {ok:false,motivo:"ocupado",texto:"Espere terminar: "+e.ocupado+". Depois toque de novo."};
    if(e.sujo)return {ok:false,motivo:"formulario",texto:"Há um formulário com alterações não salvas. Salve ou cancele antes de atualizar; nada foi descartado."};
    return {ok:true,motivo:"",texto:""}}
  /* reler o PESSOAL só quando é seguro: dono, com a tabela, sem alteração esperando envio, sem conflito e sem gravação em curso */
  function atuRelerPessoal(e){e=e||{};return !!(e.dono&&!e.semTabela&&!(e.pendentes>0)&&!(e.conflitos>0)&&!(e.gravando>0))}
  /* JSON do próprio site com a marca que o service worker entende como "buscar na rede agora" */
  function atuUrlFresca(u){u=String(u||"");if(/^[a-z]+:\/\//i.test(u)||!/^[^?#]+\.json(\?|#|$)/.test(u)||/[?&]atualizar=1(&|#|$)/.test(u))return u;
    var i=u.indexOf("#"),base=i<0?u:u.slice(0,i),fim=i<0?"":u.slice(i);return base+(base.indexOf("?")<0?"?":"&")+"atualizar=1"+fim}
  /* hora local "14:32" de um instante (ms) */
  function atuHora(ms){var d=new Date(ms);if(!isFinite(d.getTime()))return "";return (d.getHours()<10?"0":"")+d.getHours()+":"+(d.getMinutes()<10?"0":"")+d.getMinutes()}
  /* Etapa B: as leituras novas de um módulo podem ocupar o lugar das de antes? novo e antes: {fonte:{ok, erro}}. Troca só se toda fonte
     veio boa; a que já falhava antes não impede (não há dado bom a perder); a que estava boa e sumiu impede. Nunca troca pela metade. */
  function atuConferir(novo,antes){novo=novo||{};antes=antes||{};var falhas=[];
    Object.keys(novo).forEach(function(k){var n=novo[k],a=antes[k];if(n&&n.ok)return;if(a&&a.ok===false)return;falhas.push(k+(n&&n.erro?" ("+n.erro+")":""))});
    Object.keys(antes).forEach(function(k){if(!(k in novo)&&antes[k]&&antes[k].ok)falhas.push(k+" (não veio)")});
    return {ok:!falhas.length,falhas:falhas,texto:falhas.length?"não consegui ler "+falhas.join(", "):""}}
  /* de cada fonte guardada ({ok, v} ou {ok:false, erro}), só se estava boa: é o "antes" do atuConferir */
  function atuEstado(fontes){var o={};Object.keys(fontes||{}).forEach(function(k){var f=fontes[k];if(f&&typeof f.ok==="boolean")o[k]={ok:f.ok}});return o}
  /* ===== Voltar ao site (Fase 1, P-16): depois de ATU_VOLTAR_MS fora, a página atual se atualiza sozinha pelo mesmo ↻ (atuAtualizar).
     Aqui só a decisão. Bloqueiam, nesta ordem: sem login, a casa (o que ela vê não muda sem o dono pedir), pouco tempo fora, página
     atualizada há pouco, campo com foco, captura rápida aberta e, por fim, as mesmas regras do ↻ (atuPode: já atualizando, sem
     internet, tarefa longa, formulário não salvo). O atuAtualizar confere o atuPode de novo e, nessa volta, não mostra aviso. ===== */
  var ATU_VOLTAR_MS=5*60*1000;
  function atuVoltar(e){e=e||{};var agora=+e.agora,saiu=+e.saiu,ult=+e.ultima;
    if(!e.logado)return {ok:false,motivo:"sem-login"};
    if(!e.dono)return {ok:false,motivo:"casa"};
    if(!(saiu>0)||!(agora>0))return {ok:false,motivo:"sem-saida"};
    if(agora-saiu<ATU_VOLTAR_MS)return {ok:false,motivo:"pouco-tempo"};
    if(ult>0&&agora-ult<ATU_VOLTAR_MS)return {ok:false,motivo:"recente"};
    if(e.foco)return {ok:false,motivo:"foco"};
    if(e.aberto)return {ok:false,motivo:"aberto"};
    var p=atuPode(e);return p.ok?{ok:true,motivo:""}:{ok:false,motivo:p.motivo}}
  /* ===== Notificação tocada (sw.js → js/app.js): o destino vem do servidor (Agenda, Resumo, Lista…; questão D-05) e não muda aqui.
     Só uma página DESTE site é aceita ("#secao/..."); endereço de outro site ou sem página vira "" (nada a fazer). O destino guardado
     pelo service worker vale NOTIF_VALIDADE_MS (reserva para o iPhone que abre o início e para a página que perdeu a mensagem). ===== */
  var NOTIF_VALIDADE_MS=5*60*1000;
  function notifHash(url,base){try{var b=new URL(String(base||"")),u=new URL(String(url||""),b.href);
      if(u.origin!==b.origin)return "";return /^#[a-z][a-z0-9-]*(\/[^\s<>"'`]*)?$/i.test(u.hash||"")?u.hash:""}catch(e){return ""}}
  function notifFresco(d,agora){agora=+agora;return !!(d&&typeof d.url==="string"&&+d.quando>0&&agora>=+d.quando&&agora-d.quando<=NOTIF_VALIDADE_MS)}
  /* ===== Monitor de integrações (Fase 1, M1 e M2; docs/planejamento/05-integracoes-e-automacoes.md, seção 4). Cada processo agendado
     no mesmo formato, calculado SÓ dos registros que já existem (rotina_log, newsletter_edicoes, radar_coletas, JSON dos robôs e as
     execuções públicas do GitHub): nenhum log novo, nenhuma cópia. O horário vem do agendamento real: os crons abaixo são cópias dos
     arquivos citados e tests/monitor.test.mjs falha se divergirem ou se faltar um agendamento. Tudo em UTC (pg_cron e GitHub).
     limite: "cron" = atrasado se não rodou desde o último horário previsto (com a tolerância em min); número = atrasado se a última
     execução tem mais que isso (min), para quem não tem horário fixo de verdade (o GitHub atrasa e pula; a Newsletter só grava
     quando há coleta). semRegistro: sem registro no horário previsto não prova atraso (o Radar só grava quando há oferta). ===== */
  var MON_JANELA_MS=7*864e5,MON_RODANDO_MAX=2*36e5;
  var MON_PROCESSOS=[
    {id:"rotina",nome:"Rotina das 6h",area:"Sistema",onde:"banco",job:"rac-rotina",arquivo:"supabase/008_sistema.sql",crons:["0 9 * * *"],limite:"cron",tolerancia:60,
      fonte:"rotina_log",rotulo:"Última execução",oque:"Garmin, tempo, agenda e avisos (notificação e Telegram); aos domingos, resumo da semana e backup"},
    {id:"newsletter",nome:"Newsletter (edições)",area:"Informação",onde:"banco",job:"rac-newsletter",arquivo:"supabase/023_newsletter_turnos.sql",crons:["50 0-2,9-23 * * *"],limite:14*60,
      fonte:"newsletter_edicoes",rotulo:"Última edição gravada",oque:"Tenta de hora em hora e grava a edição do turno (6h, 12h e 18h) quando chega a coleta; não registra as tentativas sem edição"},
    {id:"radar",nome:"Radar de Preços (coleta)",area:"Compras",onde:"banco",job:"radar-rotina",arquivo:"supabase/045_radar_rotina.sql",crons:["20 9,21 * * *"],limite:"cron",tolerancia:60,semRegistro:true,
      fonte:"radar_coletas",rotulo:"Última coleta",oque:"Lê as ofertas liberadas e avisa as oportunidades; só registra quando há oferta para ler"},
    {id:"noticias",nome:"Robô de notícias",area:"Informação",onde:"github",workflow:"noticias.yml",arquivo:".github/workflows/noticias.yml",crons:["15 */3 * * *","40 * * * *"],limite:8*60,
      fonte:"execuções do GitHub e os JSON",rotulo:"Última execução",oque:"Notícias de Sorocaba, tecnologia e rumores (a cada 3 h) e a coleta da Newsletter (de hora em hora, só quando falta a do turno)"},
    {id:"vagas",nome:"Robô de vagas",area:"Carreira",onde:"github",workflow:"vagas.yml",arquivo:".github/workflows/vagas.yml",crons:["0 10 * * *"],limite:30*60,
      fonte:"execuções do GitHub e vagas.json",rotulo:"Última execução",oque:"Vagas de Dados e BI e o \"oi\" diário no banco"},
    {id:"testes",nome:"Testes automáticos",area:"Sistema",onde:"github",workflow:"testes.yml",arquivo:".github/workflows/testes.yml",crons:["30 10 * * 1"],limite:8*24*60,
      fonte:"execuções do GitHub",rotulo:"Última execução",oque:"Toda segunda e a cada mudança publicada ou PR: os testes do site"},
    {id:"fiscal_entradas",nome:"Central Fiscal (entrada no Mercado)",area:"Compras",onde:"banco",job:"fiscal-entradas",arquivo:"supabase/060_central_fiscal_rotinas.sql",crons:["10 */6 * * *"],limite:"cron",tolerancia:90,semRegistro:true,
      fonte:"notas_fiscais_entradas",rotulo:"Última retomada",oque:"Retoma sozinha a entrada no Mercado das notas confirmadas que falharam e liga notas antigas a compras que já existem; só registra quando há o que fazer"},
    {id:"inbox",nome:"Inbox (sincronização)",area:"Inbox",onde:"banco",job:"inbox-sync",arquivo:"supabase/propostas/055_inbox_agendamento.sql",crons:["*/10 * * * *"],limite:30,donoSo:true,
      fonte:"inbox_sincronizacao",rotulo:"Última sincronização",oque:"A cada 10 minutos lê as caixas de e-mail conectadas e avisa as mensagens novas; só do dono (uma sincronização manual recente também conta)"}];
  function monMs(x){if(x==null||x==="")return null;var t=typeof x==="number"?x:Date.parse(x);return isFinite(t)?t:null}
  /* cron de 5 campos (minuto hora dia mês dia-da-semana), com *, n, a-b, lista e /passo; dia do mês e da semana juntos = qualquer um */
  function monCampo(txt,min,max,expr){var ok={};String(txt).split(",").forEach(function(p){var m=/^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(p);
      if(!m||(m[4]&&!(+m[4]>0)))throw new Error("cron inválido: "+expr);
      var a=m[1]==="*"?min:+m[2],b=m[1]==="*"?max:m[3]!=null?+m[3]:m[4]?max:a,s=m[4]?+m[4]:1;
      if(a<min||b>max||a>b)throw new Error("cron inválido: "+expr);for(var i=a;i<=b;i+=s)ok[i]=1});return ok}
  function monCron(expr){var f=String(expr||"").trim().split(/\s+/);if(f.length!==5)throw new Error("cron inválido: "+expr);
    var dw=monCampo(f[4],0,7,expr);if(dw[7])dw[0]=1;
    return {mi:monCampo(f[0],0,59,expr),h:monCampo(f[1],0,23,expr),dm:monCampo(f[2],1,31,expr),me:monCampo(f[3],1,12,expr),dw:dw,dmLivre:f[2]==="*",dwLivre:f[4]==="*"}}
  function monDia(c,d){var dm=!!c.dm[d.getUTCDate()],dw=!!c.dw[d.getUTCDay()];if(!c.me[d.getUTCMonth()+1])return false;
    return c.dmLivre&&c.dwLivre?true:c.dmLivre?dw:c.dwLivre?dm:dm||dw}
  /* o próximo horário (ms) DEPOIS de "depois" e o último horário ATÉ "antes" (inclusive), de uma expressão ou da lista */
  function monCronProxima(exprs,depois){var melhor=null;[].concat(exprs||[]).forEach(function(x){var c=monCron(x),t=Math.floor(+depois/6e4)*6e4+6e4;
      for(var n=0;n<200000;n++){var d=new Date(t);
        if(!monDia(c,d)){t=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()+1);continue}
        if(!c.h[d.getUTCHours()]){t=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),d.getUTCHours()+1);continue}
        if(c.mi[d.getUTCMinutes()]){if(melhor==null||t<melhor)melhor=t;break}t+=6e4}});return melhor}
  function monCronAnterior(exprs,antes){var melhor=null;[].concat(exprs||[]).forEach(function(x){var c=monCron(x),t=Math.floor(+antes/6e4)*6e4;
      for(var n=0;n<200000;n++){var d=new Date(t);
        if(!monDia(c,d)){t=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())-6e4;continue}
        if(!c.h[d.getUTCHours()]){t=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),d.getUTCHours())-6e4;continue}
        if(c.mi[d.getUTCMinutes()]){if(melhor==null||t>melhor)melhor=t;break}t-=6e4}});return melhor}
  function monVazio(origem){return {ultima_execucao:null,ultimo_sucesso:null,ultima_ok:null,duracao:null,falhas:null,registros:"",erro:"",origem:origem,ultima_falha:null,historico:null,janela_desde:null,rodando_desde:null}}
  /* rotina_log [{quando, ok, resumo}]: quando é o fim da rotina (não há início, então não há duração) */
  function monDeRotina(linhas,agora){var l=(linhas||[]).filter(function(x){return x&&monMs(x.quando)}).sort(function(a,b){return monMs(b.quando)-monMs(a.quando)}),o=monVazio("rotina_log");
    o.falhas=0;if(!l.length)return o;var u=l[0],s=u.resumo||{},ok=l.filter(function(x){return x.ok!==false})[0],partes=[];
    o.ultima_execucao=monMs(u.quando);o.ultima_ok=u.ok!==false;o.ultimo_sucesso=ok?monMs(ok.quando):null;
    o.falhas=l.filter(function(x){return x.ok===false&&monMs(x.quando)>=agora-MON_JANELA_MS}).length;
    var f0=l.filter(function(x){return x.ok===false})[0];o.ultima_falha=f0?monMs(f0.quando):null;o.historico=l.slice(0,7).map(function(x){return {t:monMs(x.quando),e:x.ok===false?"falha":"ok"}});
    if(s.garmin_dias&&s.garmin_dias.salvos!=null)partes.push(s.garmin_dias.salvos+" dias da Garmin");if(s.garmin_treinos&&s.garmin_treinos.salvas!=null)partes.push(s.garmin_treinos.salvas+" treinos conferidos");
    if(s.alertas&&s.alertas.itens!=null)partes.push(s.alertas.itens+" avisos");o.registros=partes.join(", ");
    o.erro=Object.keys(s).filter(function(k){return s[k]&&s[k].erro}).map(function(k){return k+": "+s[k].erro}).join("; ");
    var b=l.filter(function(x){return x.resumo&&x.resumo.backup})[0];if(b)o.backup={quando:monMs(b.quando),ok:!b.resumo.backup.erro,erro:b.resumo.backup.erro||""};
    return o}
  /* newsletter_edicoes [{data, turno, origem, criado_em, atualizado_em}]: só a edição gravada é registrada (as tentativas vazias não) */
  function monDeNewsletter(eds){var l=(eds||[]).map(function(e){return {e:e,t:monMs(e&&e.atualizado_em)||monMs(e&&e.criado_em)}}).filter(function(x){return x.t}).sort(function(a,b){return b.t-a.t}),o=monVazio("newsletter_edicoes");
    if(!l.length)return o;var u=l[0].e,d=String(u.data||"");o.ultima_execucao=o.ultimo_sucesso=l[0].t;o.ultima_ok=true;
    o.registros="edição "+({manha:"da manhã",tarde:"da tarde",noite:"da noite"}[u.turno]||String(u.turno||""))+(d.length>=10?" de "+d.slice(8,10)+"/"+d.slice(5,7):"")+(u.origem==="ia"?", com resumo da IA":", só regras");
    return o}
  /* radar_coletas da rotina [{iniciada_em, terminada_em, status, ofertas_lidas, precos_gravados, falhas, erro_mensagem}]: uma linha por loja;
     linhas que começaram até 30 min depois da primeira são a mesma execução. Execução com falha = todas as lojas com falha */
  function monDeRadar(cs,agora){var l=(cs||[]).map(function(c){return {c:c||{},i:monMs(c&&c.iniciada_em),f:monMs(c&&c.terminada_em)}}).filter(function(x){return x.i}).sort(function(a,b){return b.i-a.i}),o=monVazio("radar_coletas"),gs=[];
    o.falhas=0;if(!l.length)return o;
    l.forEach(function(x){var g=gs[gs.length-1];if(g&&g.topo-x.i<=30*6e4){g.l.push(x);g.ini=x.i}else gs.push({l:[x],topo:x.i,ini:x.i})});
    gs.forEach(function(g){var r={lidas:0,grav:0,fal:0,falhou:true,andando:false,fim:null,erro:""};g.l.forEach(function(x){var c=x.c;r.lidas+=+c.ofertas_lidas||0;r.grav+=+c.precos_gravados||0;r.fal+=+c.falhas||0;
      if(c.status!=="falha")r.falhou=false;if(c.status==="em_andamento")r.andando=true;if(x.f&&(r.fim==null||x.f>r.fim))r.fim=x.f;if(!r.erro&&c.erro_mensagem)r.erro=String(c.erro_mensagem)});g.r=r});
    var u=gs[0],ok=gs.filter(function(g){return !g.r.falhou&&!g.r.andando})[0];
    o.ultima_execucao=u.ini;o.ultima_ok=u.r.andando?null:!u.r.falhou;o.rodando=u.r.andando;o.ultimo_sucesso=ok?ok.ini:null;
    o.duracao=u.r.fim!=null&&!u.r.andando?Math.round((u.r.fim-u.ini)/1000):null;
    o.registros=u.r.lidas+" ofertas lidas, "+u.r.grav+" preços gravados"+(u.r.fal?", "+u.r.fal+" com falha":"");o.erro=u.r.falhou?u.r.erro:"";
    o.falhas=gs.filter(function(g){return g.r.falhou&&g.ini>=agora-MON_JANELA_MS}).length;
    var fg=gs.filter(function(g){return g.r.falhou&&!g.r.andando})[0];o.ultima_falha=fg?fg.ini:null;if(u.r.andando)o.rodando_desde=u.ini;
    o.historico=gs.slice(0,7).map(function(g){return {t:g.ini,e:g.r.andando?"rodando":g.r.falhou?"falha":"ok"}});return o}
  /* Central Fiscal: linhas [{t, texto}] (consultas do dia ou entradas retomadas); execuções = linhas até 30 min da primeira. "Indisponível" não é falha da rotina: ela rodou e registrou. */
  function monDeFiscal(rs,agora,unid){var l=(rs||[]).map(function(r){return {t:monMs(r&&r.t),r:r||{}}}).filter(function(x){return x.t}).sort(function(a,b){return b.t-a.t}),o=monVazio(unid||"notas_fiscais");
    o.falhas=null;if(!l.length)return o;var topo=l[0].t,g=l.filter(function(x){return topo-x.t<=30*6e4});
    o.ultima_execucao=topo;o.ultima_ok=true;o.ultimo_sucesso=topo;o.registros=g.length+" "+(unid==="notas_fiscais_entradas"?"entradas tratadas":"notas consultadas")+(g.filter(function(x){return x.r.mudou}).length?", "+g.filter(function(x){return x.r.mudou}).length+" mudaram de situação":"");return o}
  /* execuções públicas de um workflow do GitHub (API .../actions/workflows/<arquivo>/runs). Cancelada ou pulada não conta como
     sucesso nem como falha. Atraso típico (min): mediana entre o horário agendado e o início, só com um cron (com dois, não se sabe qual) */
  var MON_GH_FALHA={failure:1,timed_out:1,startup_failure:1};
  function monDeGithub(runs,crons,agora,estadoWf){var o=monVazio("GitHub"),l=(runs||[]).filter(Boolean).map(function(r){return {r:r,t:monMs(r.run_started_at)||monMs(r.created_at)}}).filter(function(x){return x.t}).sort(function(a,b){return b.t-a.t});
    o.falhas=0;o.rodando=l.some(function(x){return x.r.status==="in_progress"||x.r.status==="queued"});
    if(estadoWf&&estadoWf!=="active")o.desligado="desligado no GitHub ("+estadoWf+")";
    var fim=l.filter(function(x){return x.r.status==="completed"&&(x.r.conclusion==="success"||MON_GH_FALHA[x.r.conclusion])}),u=fim[0],s=fim.filter(function(x){return x.r.conclusion==="success"})[0];
    if(u){var t1=monMs(u.r.updated_at);o.ultima_execucao=u.t;o.ultima_ok=u.r.conclusion==="success";o.duracao=t1!=null&&t1>=u.t?Math.round((t1-u.t)/1000):null;
      if(!o.ultima_ok)o.erro=u.r.conclusion==="timed_out"?"passou do tempo limite":"o GitHub marcou a execução como falha"}
    o.ultimo_sucesso=s?s.t:null;o.falhas=fim.filter(function(x){return MON_GH_FALHA[x.r.conclusion]&&x.t>=agora-MON_JANELA_MS}).length;
    var f1=fim.filter(function(x){return MON_GH_FALHA[x.r.conclusion]})[0],em=l.filter(function(x){return x.r.status==="in_progress"||x.r.status==="queued"});
    o.ultima_falha=f1?f1.t:null;if(em.length)o.rodando_desde=em[em.length-1].t;
    o.historico=l.filter(function(x){return x.r.status!=="completed"||x.r.conclusion==="success"||MON_GH_FALHA[x.r.conclusion]}).slice(0,7).map(function(x){return {t:x.t,e:x.r.status!=="completed"?"rodando":x.r.conclusion==="success"?"ok":"falha"}});
    o.janela_desde=l.length?l[l.length-1].t:null;o.execucoes_lidas=l.length;
    if([].concat(crons||[]).length===1){var at=l.filter(function(x){return x.r.event==="schedule"}).map(function(x){var c=monMs(x.r.created_at),e=c==null?null:monCronAnterior(crons,c);return e==null?null:(c-e)/6e4}).filter(function(x){return x!=null&&x>=0});
      if(at.length)o.atraso_tipico=Math.round(mediana(at))}
    return o}
  /* inbox_sincronizacao [{conta_id, ultima_ok_em, ultima_tentativa_em, falhas_seguidas, duracao_ms, erro}] (uma linha por conta e pasta) e inbox_contas
     [{id, sync_auto}]. Uma rodada = as linhas até 2 min da mais nova; a duração é a soma delas. Contas com a sincronização automática desligada não contam;
     se todas estão desligadas o processo está desligado. Falhas em 7 dias não são registradas (só as seguidas): fica null. */
  function monDeInbox(linhas,contas){var o=monVazio("inbox_sincronizacao"),cs=(contas||[]).filter(Boolean),off={};cs.forEach(function(c){if(c.sync_auto===false)off[c.id]=1});
    var l=(linhas||[]).filter(function(x){return x&&!off[x.conta_id]&&monMs(x.ultima_tentativa_em)}).sort(function(a,b){return monMs(b.ultima_tentativa_em)-monMs(a.ultima_tentativa_em)});
    if(!l.length){if(cs.length&&cs.every(function(c){return c.sync_auto===false}))o.desligado="a sincronização automática está desligada nas contas";return o}
    var topo=monMs(l[0].ultima_tentativa_em),g=l.filter(function(x){return topo-monMs(x.ultima_tentativa_em)<=2*6e4}),ruim=g.filter(function(x){return +x.falhas_seguidas>0}),
      oks=l.map(function(x){return monMs(x.ultima_ok_em)}).filter(function(x){return x!=null}),soma=0,tem=true;
    g.forEach(function(x){if(x.duracao_ms==null||!isFinite(+x.duracao_ms))tem=false;else soma+=+x.duracao_ms});
    o.ultima_execucao=topo;o.ultima_ok=!ruim.length;o.ultimo_sucesso=oks.length?Math.max.apply(null,oks):null;o.duracao=tem?Math.round(soma/100)/10:null;
    o.registros=g.length+(g.length===1?" pasta sincronizada":" pastas sincronizadas");
    o.erro=ruim.length?(String(ruim[0].erro||"").slice(0,160)||ruim[0].falhas_seguidas+" falhas seguidas"):"";return o}
  /* os JSON dos robôs [{nome, d, campo, idadeMax (h)}]: itens, fontes fora do ar e o que está velho (os mesmos limites do painel antigo) */
  function monRobos(l,agora){var partes=[],avisos=[],ult=null;(l||[]).forEach(function(x){var d=x.d,t=d&&monMs(d.coletado),n=d&&Array.isArray(d[x.campo])?d[x.campo].length:0;
      if(!d){partes.push(x.nome+": não consegui ler");avisos.push(x.nome+" (sem arquivo)");return}
      var fal=(d.fontes||[]).filter(function(f){return f&&!f.ok}),ff=Array.isArray(d.fontes)?", "+(d.fontes.length-fal.length)+" de "+d.fontes.length+" fontes"+(fal.length?" (fora do ar: "+fal.map(function(f){return f.n}).join(", ")+")":""):"";
      var velho=t==null||agora-t>x.idadeMax*36e5||!n;if(velho)avisos.push(x.nome+(n?" parado":" vazio"));else if(fal.length>3)avisos.push(x.nome+": "+fal.length+" fontes fora do ar");
      if(t!=null&&(ult==null||t>ult))ult=t;partes.push(x.nome+": "+n+" itens"+ff)});
    return {texto:partes.join(" · "),avisos:avisos,ultimo:ult}}
  /* o contrato de cada processo: {processo, nome, area, onde, arquivo, crons, ultima_execucao, ultimo_sucesso, duracao, registros, falhas,
     erro, proxima_prevista, esperada, estado, motivo, rodando, atraso_tipico, origem}. Estado: ok · atrasado · falhou · desligado · desconhecido */
  function monAvaliar(p,d,agora){d=d||{};agora=+agora;
    var o={processo:p.id,nome:p.nome,area:p.area,onde:p.onde,arquivo:p.arquivo,crons:p.crons.slice(),rotulo:p.rotulo,ultima_execucao:d.ultima_execucao||null,ultimo_sucesso:d.ultimo_sucesso||null,
      duracao:d.duracao!=null?d.duracao:null,registros:d.registros||"",falhas:d.falhas!=null?d.falhas:null,erro:d.erro||"",proxima_prevista:monCronProxima(p.crons,agora),esperada:null,
      estado:"ok",motivo:"",rodando:!!d.rodando,atraso_tipico:d.atraso_tipico!=null?d.atraso_tipico:null,origem:d.origem||"",
      ultima_falha:d.ultima_falha||null,historico:d.historico||[],janela_desde:d.janela_desde||null,execucoes_lidas:d.execucoes_lidas!=null?d.execucoes_lidas:null,rodando_desde:d.rodando_desde||null,
      workflow:p.workflow||"",recuperou:false},
      rod=!!d.rodando&&!(d.rodando_desde&&agora-d.rodando_desde>MON_RODANDO_MAX);
    o.recuperou=d.ultima_ok!==false&&!!(o.ultima_falha&&o.ultimo_sucesso&&o.ultimo_sucesso>o.ultima_falha&&o.ultima_falha>=agora-MON_JANELA_MS);
    function fim(e,m){o.estado=e;o.motivo=m;return o}
    if(d.desligado)return fim("desligado",d.desligado);
    if(d.erroLeitura)return fim("desconhecido","não consegui ler ("+d.erroLeitura+")");
    if(!o.ultima_execucao)return fim("desconhecido",p.semRegistro?"nenhum registro (só registra quando há o que ler)":"nenhum registro encontrado");
    if(d.ultima_ok===false)return fim("falhou",o.erro||"a última execução falhou");
    if(d.rodando&&!rod)return fim("atrasado","execução em andamento há mais de 2 h (pode ter travado)");
    if(p.limite==="cron"){o.esperada=monCronAnterior(p.crons,agora-(p.tolerancia||0)*6e4);
      if(!rod&&o.esperada!=null&&o.ultima_execucao<o.esperada)return p.semRegistro?fim("desconhecido","sem registro no último horário previsto (pode não ter havido o que ler)"):fim("atrasado","não rodou no último horário previsto")}
    else if(!rod&&agora-o.ultima_execucao>p.limite*6e4)return fim("atrasado","sem "+(p.rotulo||"execução").toLowerCase()+" há mais de "+(p.limite>=2880?Math.round(p.limite/1440)+" dias":p.limite>=90?Math.round(p.limite/60)+" h":p.limite+" min"));
    if(d.avisos&&d.avisos.length)return fim("atrasado","coleta parada ou incompleta: "+d.avisos.join("; "));
    return o}
  /* ordem de gravidade para resumir o painel */
  var MON_ORDEM={falhou:0,atrasado:1,desligado:2,desconhecido:3,ok:4};
  /* os quatro cartões do painel: normais (ok), exigem atenção (falhou e atrasado), sem verificação (desligado e desconhecido). Cada alerta traz o que aconteceu,
     quando, onde o processo roda e a fonte que acusou; "info" é o que não é erro (sem registro, desligado). Nada é calculado sem evidência. */
  var MON_CAT={ok:"normais",atrasado:"atencao",falhou:"atencao",desligado:"semverif",desconhecido:"semverif"};
  function monFiltro(l,chave){return (l||[]).filter(function(x){return !chave||chave==="todos"||MON_CAT[x.estado]===chave})}
  function monPainel(l){l=l||[];var c={todos:l.length,normais:0,atencao:0,semverif:0},al=[];
    l.forEach(function(x){c[MON_CAT[x.estado]]++});
    l.filter(function(x){return x.estado!=="ok"}).sort(function(a,b){return MON_ORDEM[a.estado]-MON_ORDEM[b.estado]}).forEach(function(x){
      al.push({processo:x.processo,nome:x.nome,estado:x.estado,nivel:x.estado==="falhou"?"falha":x.estado==="atrasado"?"atraso":"info",motivo:x.motivo,erro:x.estado==="falhou"?"":x.erro,
        componente:x.onde==="github"?"GitHub Actions":"Supabase",quando:x.estado==="falhou"?(x.ultima_falha||x.ultima_execucao):x.ultima_execucao,fonte:x.origem||""})});
    return {cartoes:c,alertas:al}}
  function monResumo(l){var c={};(l||[]).forEach(function(x){c[x.estado]=(c[x.estado]||0)+1});return {contagem:c,pior:(l||[]).slice().sort(function(a,b){return MON_ORDEM[a.estado]-MON_ORDEM[b.estado]})[0]||null}}
  /* ===== RAC Hoje (docs/hoje.md): as regras do dia, sem tela e sem banco. O coletor (js/hoje.js) entrega cada fonte como
     {ok, v, quando} ou {ok:false, erro}; aqui se decide o que pede atenção, o que mudou, o que falta e o pacote de fatos que vai
     para a IA (ação hoje.analise). Contas, ordem e conferências são do código; a IA só interpreta. ===== */
  var HOJE_FONTES={agenda:"Agenda",tarefas:"Tarefas da casa",vagas:"Vagas e carreira",newsletter:"Newsletter",noticias:"Notícias de Sorocaba",esportes:"Esportes",
    mercado:"Mercado",alimentacao:"Alimentação",compras:"Compras online",orcamentos:"Orçamentos",saude:"Saúde e relógio",mba:"MBA",tempo:"Tempo em Sorocaba"};
  /* horas até a fonte ser considerada desatualizada (pela data do próprio dado, não da leitura) */
  var HOJE_VALIDADE={newsletter:14,noticias:12,vagas:48,saude:24,tempo:3};
  /* treinos que a Saúde esconde (pedido do dono): a Saúde, o Painel, o Resumo e o RAC Hoje usam esta mesma lista */
  var TREINO_OCULTOS=["fitness_equipment","open_water_swimming","cycling"];
  var HOJE_PESO={mba:12,familia:10,veiculo:8,carreira:8,financas:8,docs:6,lembrete:6,saude:6,tarefa:4,niver:4,sistema:2};
  function hojeReais(v){v=Math.round((+v||0)*100)/100;var s=Math.abs(v).toFixed(2).split("."),i=s[0].replace(/\B(?=(\d{3})+(?!\d))/g,".");return (v<0?"-":"")+"R$ "+i+","+s[1]}
  function hojeDias(de,ate){return Math.round((Date.parse(ate+"T12:00:00Z")-Date.parse(de+"T12:00:00Z"))/864e5)}
  /* estado de cada fonte: ok, vazia (respondeu sem dados), desatualizada (o dado é velho), falhou (a leitura deu erro) ou ausente */
  function hojeEstadoUma(k,nome,f,agoraMs){
    if(!f)return {k:k,nome:nome,estado:"ausente",detalhe:"não foi lida"};
    if(!f.ok)return {k:k,nome:nome,estado:"falhou",detalhe:String(f.erro||"erro desconhecido").slice(0,120)};
    /* leitura parcial: parte da fonte falhou (ex.: o banco) e o que veio é só o que estava na memória do site; nunca vira "ok" nem "vazia" */
    if(f.parcial)return {k:k,nome:nome,estado:"parcial",detalhe:"leitura parcial: "+((f.falhas||[]).join("; ")||"parte da leitura falhou").slice(0,160)};
    if(f.vazio)return {k:k,nome:nome,estado:"vazia",detalhe:"respondeu sem dados"};
    var q=Date.parse(f.quando||""),lim=HOJE_VALIDADE[k];
    if(lim&&isFinite(q)&&agoraMs-q>lim*3600e3)return {k:k,nome:nome,estado:"desatualizada",detalhe:"dado de "+Math.round((agoraMs-q)/3600e3)+" horas atrás",horas:Math.round((agoraMs-q)/3600e3)};
    return {k:k,nome:nome,estado:"ok",detalhe:""}}
  /* além do estado, cada fonte diz de onde veio (origem), a data do registro mais recente (ultimo) e a data que a própria fonte informa (quando);
     sem nenhuma das duas, "ok" quer dizer só que a leitura foi concluída (comData:false). Nada aqui é inventado: vem do que o coletor entregou. */
  function hojeEstadoFontes(fontes,agoraMs){fontes=fontes||{};return Object.keys(HOJE_FONTES).map(function(k){var f=fontes[k],e=hojeEstadoUma(k,HOJE_FONTES[k],f,agoraMs);
    e.origem=f&&f.origem||null;e.nota=f&&f.ok&&f.nota||null;e.ultimo=f&&f.ok&&f.ultimo||null;e.quando=f&&f.ok&&f.quando||null;e.comData=!!(e.ultimo||e.quando);return e})}
  /* as fontes com os dados PESSOAIS do dono. Vagas é uma fonte pública (a lista do portal; o funil só entra pela Agenda), e tempo, notícias, esportes e
     Newsletter também: são contexto e, sozinhos ou juntos, não bastam para uma análise do dia (docs/hoje.md, "Fonte útil"). */
  var HOJE_PESSOAIS=["agenda","tarefas","mercado","alimentacao","compras","orcamentos","saude","mba"];
  /* há fonte útil? Só conta a que respondeu COM dados e em dia; a data de hoje, o estado das fontes e a falha de leitura não são fonte */
  function hojeFontesUteis(estados){var uteis=[],parciais=[],c={falhou:0,vazia:0,desatualizada:0,ausente:0},nomes={falhou:"falharam",vazia:"sem dados",desatualizada:"desatualizadas",ausente:"não lidas"};
    /* "ok" e "parcial" (a parte lida trouxe dados válidos, mesmo sem data própria) contam; falha, vazio, desatualizada e não lida, não. Uma falha não bloqueia se outra fonte pessoal serve. */
    (estados||[]).forEach(function(e){if(HOJE_PESSOAIS.indexOf(e.k)<0)return;if(e.estado==="ok"||e.estado==="parcial"){uteis.push(e.nome);if(e.estado==="parcial")parciais.push(e.nome)}else if(c[e.estado]!=null)c[e.estado]++});
    var partes=Object.keys(c).filter(function(k){return c[k]}).map(function(k){return c[k]+" "+nomes[k]});
    return {ok:uteis.length>0,uteis:uteis,parciais:parciais,motivo:uteis.length?"":"Nenhuma fonte com os seus dados pessoais respondeu com dados utilizáveis"+(partes.length?" ("+partes.join(", ")+")":"")+
      ". Vagas, notícias, esporte, tempo e Newsletter são informação pública ou de contexto, e a data de hoje não é dado seu: sozinhos, não bastam para uma análise do dia. Nada foi chamado nem cobrado."}}
  /* o retrato das fontes (guardado com a análise): quantas estão ok e quais têm ressalva */
  function hojeQualidadeFontes(estados){estados=estados||[];var c={ok:0,parcial:0,vazia:0,falhou:0,desatualizada:0,ausente:0},prob=[];
    estados.forEach(function(e){if(c[e.estado]!=null)c[e.estado]++;if(e.estado!=="ok")prob.push({k:e.k,nome:e.nome,estado:e.estado,detalhe:e.detalhe||""})});
    var nomes={parcial:"com leitura parcial",vazia:"sem dados",falhou:"com falha",desatualizada:"desatualizada(s)",ausente:"não lida(s)"},
      resto=Object.keys(nomes).filter(function(k){return c[k]}).map(function(k){return c[k]+" "+nomes[k]});
    return {total:estados.length,ok:c.ok,contagem:c,problemas:prob,comRessalva:prob.length>0,
      resumo:c.ok+" de "+estados.length+" fontes lidas com dados"+(resto.length?"; "+resto.join(", "):"")}}
  /* ===== Régua de prioridades: a única, usada pela Próxima melhor ação, pela Agenda, pelo resumo falado e pelo RAC Hoje =====
     Três naturezas de prazo (prazo):
       real        = vencimento definido em um registro ou compromisso (revisão, boleto, avaliação, lembrete...): nunca perde a validade;
       calculado   = derivado de uma data (follow-up = candidatura + 5 dias): vale PRI_VALIDADE_CALC dias depois de vencer e nunca passa de um prazo real;
       informativo = oportunidade ou sugestão (vaga, treino): não exige ação, nunca é urgência.
     Níveis: urgente (real vencido ou de hoje), importante (real em até 3 dias, ou calculado vencido ainda válido), informativo (o resto).
     Tudo é função pura: a data de referência (hoje) é sempre um argumento. */
  var PRI_VALIDADE_CALC=10,PRI_NIVEL_HOJE={urgente:"alta",importante:"média",informativo:"baixa"};
  function priPontos(prazo,dias,area,extra){var peso=HOJE_PESO[area]||0,e=extra||0,d=dias==null?null:dias;
    if(prazo==="informativo")return 25+e;
    /* calculado: no máximo 46, abaixo de qualquer prazo real vencido, de hoje ou dos próximos 3 dias (que começam em 50) */
    if(prazo==="calculado")return (d==null?15:d<=0?38:d<=3?30:20)+Math.min(peso,8)+e;
    return (d==null?20:d<0?100+Math.min(-d,20):d===0?90:d===1?70:d<=3?50:d<=7?30:10)+peso+e}
  function priNivel(prazo,dias,p){
    if(prazo==="informativo")return "informativo";
    if(prazo==="calculado")return dias!=null&&dias<=0?"importante":"informativo";
    return p>=90?"urgente":p>=45?"importante":"informativo"}
  /* prioridade: atrasado > hoje > amanhã > 3 dias > semana > sem data, com peso por área; vale só para o prazo real (os outros: priPontos) */
  function hojePrioridade(it){return priPontos(it.prazo||"real",it.dias,it.area,it.extra)}
  function hojeNivel(p){return p>=90?"alta":p>=45?"média":"baixa"}
  function hojeItem(o,hoje){var it={area:o.area,titulo:String(o.titulo||"").trim(),data:o.data||null,sub:o.sub||"",fonte:o.fonte,extra:o.extra||0,href:o.href||"",prazo:o.prazo||"real"};
    it.dias=it.data?hojeDias(hoje,String(it.data).slice(0,10)):null;it.p=hojePrioridade(it);it.nivel=PRI_NIVEL_HOJE[priNivel(it.prazo,it.dias,it.p)];it.fontes=[o.fonte];return it}
  /* follow-up de uma candidatura do funil: "nenhum" (nada a fazer), "ativo" (vence até 10 dias atrás ou ainda vai vencer) ou "sem_retorno" (venceu há mais de 10 dias).
     Só a coluna "candidatei" gera follow-up; qualquer resultado preenchido (aprovado, recusado, sem retorno, vaga cancelada, desisti) ou o follow-up já feito encerra.
     Nada é gravado: "sem_retorno" é só como a candidatura é apresentada, o resultado real continua o que o dono marcou. */
  function priFollowup(c,hoje){var nada={estado:"nenhum",data:null,dias:null,desde:null};
    if(!c||c.coluna!=="candidatei"||c.followup||c.resultado)return nada;
    var d=String((c.datas||{}).candidatei||"").slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return nada;
    var data=String(c.followupEm||"").slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(data))data=somaDiasISO(d,5);
    var dias=hojeDias(hoje,data);return {estado:dias<-PRI_VALIDADE_CALC?"sem_retorno":"ativo",data:data,dias:dias,desde:d}}
  function priId(e){return e.id||(e.tipo||"")+"|"+(e.data||"")+"|"+norm(e.t).replace(/[^a-z0-9]+/g," ").trim()}
  function priQuando(dias){return dias<0?"venceu há "+(-dias)+(dias===-1?" dia":" dias"):dias===0?"vence hoje":dias===1?"vence amanhã":"vence em "+dias+" dias"}
  /* um evento da Agenda vira item da régua (ou null, se não pede nada: "sem retorno" é só informação da Agenda) */
  function priItem(ev,hoje){if(!ev||!ev.data||ev.semRetorno)return null;
    var prazo=ev.prazo||"real",dias=hojeDias(hoje,String(ev.data).slice(0,10)),p=priPontos(prazo,dias,ev.tipo,0),nivel=priNivel(prazo,dias,p),fu=ev.acao==="followup",
      quando=fu?(dias<0?"follow-up previsto há "+(-dias)+(dias===-1?" dia":" dias"):dias===0?"follow-up previsto para hoje":"follow-up em "+dias+(dias===1?" dia":" dias")):priQuando(dias),
      lid=ev.lembrete&&ev.lembrete.id||ev.lid||null;
    return {id:priId(ev),area:ev.tipo,prazo:prazo,data:String(ev.data).slice(0,10),dias:dias,p:p,nivel:nivel,titulo:ev.t,pre:ev.pre||"",ico:ev.ico||"",
      motivo:quando+(ev.sub?" · "+ev.sub:""),href:ev.href||"",ext:!!ev.ext,fonte:"agenda",cid:ev.cid||null,lid:lid,
      acoes:fu?["feito","adiar","semretorno"]:lid?["feito"]:[],cartao:nivel!=="informativo"}}
  /* oportunidade informativa (vaga compatível, sugestão de treino): nunca é urgência; extra só desempata entre elas */
  function priOportunidade(o){return {id:o.id,area:o.area,prazo:"informativo",data:null,dias:null,p:priPontos("informativo",null,o.area,o.extra),nivel:"informativo",titulo:o.titulo,pre:o.pre||"",
    ico:o.ico||"",motivo:o.motivo||"",href:o.href||"",ext:false,fonte:o.fonte||o.area,cid:null,lid:null,acoes:[],cartao:true}}
  var PRI_ORDEM_PRAZO={real:0,calculado:1,informativo:2};
  function priOrdenar(itens){return (itens||[]).slice().sort(function(a,b){return b.p-a.p||PRI_ORDEM_PRAZO[a.prazo]-PRI_ORDEM_PRAZO[b.prazo]||(a.dias==null?99999:a.dias)-(b.dias==null?99999:b.dias)||String(a.titulo).localeCompare(String(b.titulo))||String(a.id).localeCompare(String(b.id))})}
  /* o que o cartão mostra: no máximo 1 destaque (só se for urgente ou importante) e 3 secundárias, com no máximo 2 informativos. Sem urgente nem importante: sem destaque. */
  function priSelecionar(itens){var l=priOrdenar(itens).filter(function(i){return i.cartao}),destaque=l.length&&l[0].nivel!=="informativo"?l[0]:null,rest=destaque?l.slice(1):l,sec=[],info=0;
    rest.forEach(function(i){if(sec.length>=3)return;if(i.nivel==="informativo"){if(info>=2)return;info++}sec.push(i)});
    var mostrados=(destaque?[destaque]:[]).concat(sec);
    return {destaque:destaque,secundarias:sec,mostrados:mostrados,ids:mostrados.map(function(i){return i.id}),mais:l.length-mostrados.length,
      acoes:mostrados.filter(function(i){return i.nivel!=="informativo"}).length,vazio:!destaque}}
  /* a sugestão de Saúde só existe com dado de ontem ou de hoje, e só quando há o que recomendar: prontidão baixa (recuperação) ou 3+ dias sem treino */
  function priSaude(s){if(!s||s.semDados||s.prontidao==null||s.atraso==null||s.atraso>1)return null;
    if(s.prontidao<45)return {tipo:"recuperacao",prontidao:s.prontidao,semTreino:s.semTreino,alertas:s.alertas||[]};
    if(s.semTreino!=null&&s.semTreino>=3)return {tipo:"treino",prontidao:s.prontidao,semTreino:s.semTreino,forte:s.prontidao>=70,alertas:[]};
    return null}
  /* o mesmo assunto que aparece em duas fontes (ex.: avaliação do MBA na Agenda e no MBA) vira um item só, com as duas fontes */
  function hojeChaveItem(it){return norm(it.titulo).replace(/[^a-z0-9]+/g," ").trim()+"|"+(it.data||"")}
  function hojeDedup(itens){var por={},ordem=[];(itens||[]).forEach(function(it){var k=hojeChaveItem(it),achou=por[k];
      if(!achou)ordem.forEach(function(o){var a=hojeChaveItem(o).split("|"),b=k.split("|");if(!achou&&a[1]===b[1]&&a[0]&&b[0]&&(a[0].indexOf(b[0])>=0||b[0].indexOf(a[0])>=0))achou=o});
      if(!achou){var c={};Object.keys(it).forEach(function(x){c[x]=it[x]});c.fontes=it.fontes.slice();por[k]=c;ordem.push(c);return}
      it.fontes.forEach(function(f){if(achou.fontes.indexOf(f)<0)achou.fontes.push(f)});
      if(it.p>achou.p){achou.p=it.p;achou.nivel=it.nivel}if(it.titulo.length>achou.titulo.length)achou.titulo=it.titulo;if(!achou.sub&&it.sub)achou.sub=it.sub});
    return ordem}
  function hojeOrdenar(itens){return itens.slice().sort(function(a,b){return b.p-a.p||(a.data||"9").localeCompare(b.data||"9")||a.titulo.localeCompare(b.titulo)})}
  /* finanças do mês até hoje contra o mesmo trecho do mês anterior (Mercado, pedidos e compras online, cada um uma vez) */
  function hojeFinancas(f,hoje){f=f||{};var mes=hoje.slice(0,7),dia=+hoje.slice(8,10),dAnt=new Date(Date.UTC(+hoje.slice(0,4),+hoje.slice(5,7)-2,1)),ant=dAnt.toISOString().slice(0,7);
    var ultAnt=new Date(Date.UTC(+hoje.slice(0,4),+hoje.slice(5,7)-1,0)).getUTCDate(),fimAnt=ant+"-"+("0"+Math.min(dia,ultAnt)).slice(-2),ontem=somaDiasISO(hoje,-1);
    function soma(l,campo,de,ate,online){return (l||[]).reduce(function(s,x){var d=String(x.data||"").slice(0,10);if(d<de||d>ate)return s;return s+(online?coValorDespesa(x):(x.fora_das_contas||x.status==="cancelado"?0:(+x[campo]||0)))},0)}
    var o={mes:mes,dia:dia,fontes:[]},par=[["mercado","valor_total"],["alimentacao","total_pago"],["compras","total_pago"]];
    o.atual={};o.anterior={};o.ontem={};o.total=0;o.totalAnt=0;
    par.forEach(function(p){var fo=f[p[0]];if(!fo||!fo.ok)return;o.fontes.push(p[0]);var l=fo.v||[];
      var on=p[0]==="compras";o.atual[p[0]]=soma(l,p[1],mes+"-01",hoje,on);o.anterior[p[0]]=soma(l,p[1],ant+"-01",fimAnt,on);o.ontem[p[0]]=soma(l,p[1],ontem,ontem,on);o.total+=o.atual[p[0]];o.totalAnt+=o.anterior[p[0]]});
    o.delta=o.total-o.totalAnt;o.pct=o.totalAnt>0?Math.round(o.delta/o.totalAnt*100):null;
    var diasMes=new Date(Date.UTC(+hoje.slice(0,4),+hoje.slice(5,7),0)).getUTCDate();o.projecao=dia>=5?Math.round(o.total/dia*diasMes*100)/100:null;
    var orc=f.orcamentos&&f.orcamentos.ok?(f.orcamentos.v||[]).reduce(function(s,x){return s+(+x.valor||0)},0):0;
    o.orcamento=orc>0?{valor:orc,pct:Math.round(o.total/orc*100),projecaoPct:o.projecao!=null?Math.round(o.projecao/orc*100):null}:null;
    return o}
  /* relógio: o último dia com dados, a prontidão (NUCLEO.prontidao), dias sem treino e a noite anterior; nunca sincroniza */
  function hojeSaude(f,hoje){if(!f||!f.ok)return null;var dias=(f.v&&f.v.dias)||[],ativs=(f.v&&f.v.ativs)||[];if(!dias.length)return {semDados:true};
    var ult=dias[dias.length-1],x=ult.dados||{},pr=prontidao(dias,ult.data);
    /* passos: o dia de hoje ainda está em andamento; a comparação usa os dois últimos dias completos */
    var comp=dias.filter(function(d){return d.data<hoje}),c1=comp[comp.length-1],c2=comp[comp.length-2];
    var treinos=ativs.map(function(a){return String(a.inicio).slice(0,10)}).sort(),ultTreino=treinos[treinos.length-1]||null;
    return {ultimo:ult.data,atraso:hojeDias(ult.data,hoje),prontidao:pr?pr.nota:null,rotulo:pr?pr.rotulo:null,alertas:pr?pr.alertas.slice(0,2):[],
      sonoH:x.sono&&x.sono.total?Math.round(x.sono.total/360)/10:null,notaSono:x.sono&&x.sono.nota||null,
      diaPassos:c1?c1.data:null,passos:c1&&c1.dados&&c1.dados.passos||null,diaPassosAnt:c2?c2.data:null,passosAnt:c2&&c2.dados&&c2.dados.passos||null,vfc:x.vfc&&x.vfc.noite||null,ultTreino:ultTreino,semTreino:ultTreino?hojeDias(ultTreino,hoje):null,treinos7:treinos.filter(function(d){return d>=somaDiasISO(hoje,-6)}).length,
      dias7:Object.keys(ativs.reduce(function(o,a){var d=String(a.inicio).slice(0,10);if(d>=somaDiasISO(hoje,-6))o[d]=1;return o},{})).length,
      tipos7:ativs.reduce(function(o,a){if(String(a.inicio).slice(0,10)>=somaDiasISO(hoje,-6))o[a.tipo]=(o[a.tipo]||0)+1;return o},{})}}
  /* vagas novas (até 7 dias) e compatíveis com as competências do perfil, fora do funil e não escondidas */
  function hojeVagas(f,skills,noFunil,ocultas){if(!f||!f.ok)return [];noFunil=noFunil||[];ocultas=ocultas||{};
    return ((f.v&&f.v.vagas)||[]).filter(function(v){return v.d<=7&&noFunil.indexOf(v.id)<0&&!ocultas[v.id]})
      .map(function(v){var c=compatVaga(v.t+" "+(v.nv||""),skills||[]);return {t:v.t,e:v.e||"",cidade:v.cidade||"",d:v.d,nota:c.nota,falta:c.falta}})
      .filter(function(v){return v.nota!=null&&v.nota>=60}).sort(function(a,b){return b.nota-a.nota||a.d-b.d}).slice(0,4)}
  /* o que pede atenção, de todas as fontes, sem repetição e em ordem */
  function hojeItens(f,hoje,extras){f=f||{};var l=[];
    /* "sem retorno" é só informação da Agenda; o prazo calculado (follow-up) já vem com a validade aplicada e nunca passa de um prazo real */
    if(f.agenda&&f.agenda.ok)(f.agenda.v||[]).forEach(function(e){if(e.semRetorno)return;var d=hojeDias(hoje,e.data);if(d<-30||d>14)return;
      l.push(hojeItem({area:e.tipo,titulo:(e.pre&&!/^(Aula|Boleto|Responder|Aniversário de)$/.test(e.pre)?e.pre+": ":"")+e.t,data:e.data,sub:e.sub,fonte:"agenda",href:e.href,prazo:e.prazo},hoje))});
    if(f.mba&&f.mba.ok){var M=f.mba.v||{};(M.avals||[]).forEach(function(a){if(!a.feita)l.push(hojeItem({area:"mba",titulo:a.t+(a.disc?" ("+a.disc+")":""),data:a.ate,sub:"responder a avaliação do MBA",fonte:"mba"},hoje))});
      (M.aulas||[]).filter(function(a){return a.data>=hoje}).slice(0,2).forEach(function(a){l.push(hojeItem({area:"mba",titulo:a.t,data:a.data,sub:"aula às "+a.hora,fonte:"mba"},hoje))})}
    if(f.tarefas&&f.tarefas.ok)(f.tarefas.v||[]).forEach(function(t){var idade=t.criado?hojeDias(String(t.criado).slice(0,10),hoje):0;
      l.push(hojeItem({area:"tarefa",titulo:"Tarefa: "+t.item,sub:idade>=7?"aberta há "+idade+" dias":"",fonte:"tarefas",extra:Math.min(idade,20)},hoje))});
    if(f.compras&&f.compras.ok){var rec=(f.compras.v||[]).filter(function(c){return c.recorrencia_status==="a_confirmar"&&c.status!=="cancelado"});
      if(rec.length)l.push(hojeItem({area:"financas",titulo:"Confirmar "+rec.length+(rec.length===1?" recorrência":" recorrências")+" nas compras online",sub:rec.slice(0,3).map(function(c){return c.recorrencia_texto||c.loja}).join(", "),fonte:"compras",extra:10,href:"#compras"},hoje))}
    extras=extras||{};
    var sg=priSaude(extras.saude); /* a mesma regra de relevância da Próxima melhor ação; sugestão de Saúde é informativa */
    if(sg){if(sg.tipo==="recuperacao")l.push(hojeItem({area:"saude",titulo:"Dia de recuperação (prontidão "+sg.prontidao+")",data:hoje,sub:sg.alertas.join("; "),fonte:"saude",extra:15,href:"#saude",prazo:"informativo"},hoje));
      else l.push(hojeItem({area:"saude",titulo:(sg.forte?"Bom dia para treinar forte":"Que tal um treino moderado")+" (prontidão "+sg.prontidao+", "+sg.semTreino+" dias sem treino)",data:hoje,fonte:"saude",extra:sg.forte?8:3,href:"#saude",prazo:"informativo"},hoje))}
    if(extras.financas&&extras.financas.orcamento&&extras.financas.orcamento.projecaoPct!=null&&extras.financas.orcamento.projecaoPct>100)
      l.push(hojeItem({area:"financas",titulo:"Gastos do mês a caminho de "+extras.financas.orcamento.projecaoPct+"% do orçamento",data:hoje,fonte:"mercado",extra:-30,href:"#painel/financas"},hoje));
    (extras.vagas||[]).slice(0,2).forEach(function(v){if(v.nota>=70)l.push(hojeItem({area:"carreira",titulo:"Vaga "+v.nota+"% compatível: "+v.t+(v.e?" ("+v.e+")":""),sub:v.d<=1?"publicada hoje ou ontem":"há "+v.d+" dias",fonte:"vagas",extra:Math.round((v.nota-70)/2),prazo:"informativo"},hoje))});
    return hojeOrdenar(hojeDedup(l))}
  /* o que mudou desde ontem, só com contas do código (sem base, não compara) */
  function hojeMudancas(f,hoje,fin,saude){f=f||{};var l=[],ontem=somaDiasISO(hoje,-1);
    if(fin&&fin.fontes.length){var go=Object.keys(fin.ontem).reduce(function(s,k){return s+fin.ontem[k]},0);
      if(go>0)l.push({area:"financas",texto:"Gastos registrados ontem: "+hojeReais(go)});
      if(fin.totalAnt>0)l.push({area:"financas",texto:"Gastos do mês até hoje: "+hojeReais(fin.total)+" contra "+hojeReais(fin.totalAnt)+" no mesmo trecho do mês passado ("+(fin.pct>0?"+":"")+fin.pct+"%)"});
      else if(fin.total>0)l.push({area:"financas",texto:"Gastos do mês até hoje: "+hojeReais(fin.total)+" (sem base no mês passado para comparar)"})}
    if(f.vagas&&f.vagas.ok){var nv=((f.vagas.v&&f.vagas.v.vagas)||[]).filter(function(v){return v.d<=1}).length;if(nv)l.push({area:"carreira",texto:nv+(nv===1?" vaga nova":" vagas novas")+" desde ontem"})}
    if(saude&&!saude.semDados&&saude.ultimo){if(saude.passos!=null&&saude.passosAnt!=null)l.push({area:"saude",texto:"Passos em "+saude.diaPassos+" (dia completo): "+saude.passos+" contra "+saude.passosAnt+" em "+saude.diaPassosAnt});
      if(saude.ultTreino===ontem)l.push({area:"saude",texto:"Teve treino ontem"})}
    if(f.newsletter&&f.newsletter.ok&&f.newsletter.quando&&String(f.newsletter.quando).slice(0,10)>=ontem){var q=Date.parse(f.newsletter.quando);l.push({area:"noticias",texto:"Edição nova da Newsletter coletada em "+(isFinite(q)?new Date(q-3*3600e3).toISOString().slice(0,16).replace("T"," às ")+" (Brasília)":String(f.newsletter.quando).slice(0,10))})}
    return l}
  /* tira do texto o que nunca vai para a IA: links, e-mails, números longos (documentos, cartões, chaves) e os sinais < > */
  function hojeLimpar(t){return String(t==null?"":t).replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi,"").replace(/[^\s@]+@[^\s@]+\.[a-z]{2,}/gi,"[e-mail]")
    .replace(/\d[\d.\-\/ ]{9,}\d/g,function(m){return /^(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})( \d{2})?$/.test(m)?m:"[número]"}).replace(/[<>]/g,"").replace(/\s{2,}/g," ").trim()}
  var HOJE_PROIBIDO=/senha|password|token|api[_ -]?key|secret|chave (secreta|privada|da api)|service_role|bearer/i;
  /* o pacote de fatos que vai para a IA: cada fato com id, fonte e período; nada de segredo, link, e-mail ou documento; com teto */
  /* extra.quem: quem é quem no RAC (ex.: "Olivia é a filha bebê do dono"), para a IA não confundir pessoas, pets e veículos */
  function hojeContexto(f,hoje,agoraMs,max,extra){f=f||{};max=max||12000;extra=extra||{};var fatos=[],estados=hojeEstadoFontes(f,agoraMs);
    var fin=hojeFinancas(f,hoje),sau=hojeSaude(f.saude,hoje),vg=f.vagas&&f.vagas.ok?hojeVagas(f.vagas,f.vagas.v.skills,f.vagas.v.noFunil,f.vagas.v.ocultas):[];
    var itens=hojeItens(f,hoje,{saude:sau,financas:fin,vagas:vg}),mud=hojeMudancas(f,hoje,fin,sau);
    function add(fonte,periodo,texto){texto=hojeLimpar(texto);if(!texto||HOJE_PROIBIDO.test(texto)||fatos.length>=99)return;fatos.push({fonte:fonte,periodo:periodo,texto:texto.slice(0,300)})}
    add("rac","hoje","Hoje é "+hoje+".");
    if(extra.quem)add("rac","sempre","Quem é quem no RAC: "+extra.quem+".");
    estados.forEach(function(e){if(e.estado!=="ok")add("rac","hoje","Fonte "+e.nome+": "+(e.estado==="falhou"?"a leitura falhou ("+e.detalhe+")":e.estado==="parcial"?e.detalhe+" (pode faltar item)":e.estado==="vazia"?"sem dados":e.estado==="desatualizada"?"desatualizada, "+e.detalhe:"não foi lida")+".")});
    itens.slice(0,25).forEach(function(it){add(it.fontes.join("+"),it.data||"sem data","Prioridade "+it.nivel+": "+it.titulo+(it.sub?" — "+it.sub:"")+(it.dias==null?"":it.dias<0?" (atrasado há "+(-it.dias)+(it.dias===-1?" dia)":" dias)"):it.dias===0?" (hoje)":it.dias===1?" (amanhã)":" (em "+it.dias+" dias, "+it.data+")"))});
    mud.forEach(function(m){add(m.area,"desde ontem",m.texto)});
    if(fin.fontes.length){add("financas",fin.mes,"Gastos do mês até o dia "+fin.dia+": "+hojeReais(fin.total)+" (Mercado "+hojeReais(fin.atual.mercado||0)+", pedidos "+hojeReais(fin.atual.alimentacao||0)+", compras online "+hojeReais(fin.atual.compras||0)+").");
      if(fin.projecao!=null)add("financas",fin.mes,"No ritmo atual, o mês fecharia em "+hojeReais(fin.projecao)+".");
      if(fin.orcamento)add("financas",fin.mes,"Orçamentos somados: "+hojeReais(fin.orcamento.valor)+"; usado até agora: "+fin.orcamento.pct+"%"+(fin.orcamento.projecaoPct!=null?"; projeção: "+fin.orcamento.projecaoPct+"%":"")+".")}
    if(sau&&!sau.semDados){add("saude",sau.ultimo,"Último dia com dados do relógio: "+sau.ultimo+(sau.atraso>1?" ("+sau.atraso+" dias atrás; a Saúde precisa ser sincronizada pelo botão próprio)":"")+".");
      if(sau.prontidao!=null)add("saude",sau.ultimo,"Prontidão "+sau.prontidao+" ("+sau.rotulo+")"+(sau.alertas.length?"; "+sau.alertas.join("; "):"")+".");
      if(sau.sonoH!=null)add("saude",sau.ultimo,"Sono: "+String(sau.sonoH).replace(".",",")+" h"+(sau.notaSono?", nota "+sau.notaSono:"")+".");
      add("saude","últimos 7 dias",sau.treinos7+(sau.treinos7===1?" atividade registrada":" atividades registradas")+" nos últimos 7 dias, em "+sau.dias7+(sau.dias7===1?" dia":" dias")+
        (sau.treinos7?" ("+Object.keys(sau.tipos7).sort().map(function(k){return k.replace(/_/g," ")+": "+sau.tipos7[k]}).join(", ")+")":"")+(sau.semTreino!=null?"; último há "+sau.semTreino+(sau.semTreino===1?" dia":" dias"):"")+".")}
    vg.forEach(function(v){add("vagas","últimos 7 dias","Vaga "+v.t+(v.e?" na "+v.e:"")+(v.cidade?" ("+v.cidade+")":"")+": "+v.nota+"% compatível com o perfil"+(v.falta.length?"; faltam "+v.falta.join(", "):"")+"; publicada há "+v.d+(v.d===1?" dia":" dias")+".")});
    if(f.vagas&&f.vagas.ok&&f.vagas.v.funil)add("vagas","agora","Candidaturas no funil: "+f.vagas.v.funil+".");
    if(f.mba&&f.mba.ok&&f.mba.v.progresso)add("mba","agora",f.mba.v.progresso);
    if(f.newsletter&&f.newsletter.ok)(f.newsletter.v.destaques||[]).slice(0,6).forEach(function(g){add("newsletter",String(f.newsletter.quando||"").slice(0,10),"Destaque ("+g.cat+(g.n>1?", "+g.n+" veículos":"")+"): "+g.t)});
    if(f.noticias&&f.noticias.ok)(f.noticias.v||[]).slice(0,4).forEach(function(n){add("noticias",String(n.d||"").slice(0,10),"Sorocaba: "+n.t+(n.f?" ("+n.f+")":""))});
    if(f.esportes&&f.esportes.ok&&f.esportes.v)add("esportes",hoje,f.esportes.v);
    if(f.tempo&&f.tempo.ok&&f.tempo.v)add("tempo",hoje,f.tempo.v);
    var texto="",usados=[];
    fatos.forEach(function(x,i){var id="f"+("0"+(i+1)).slice(-2),l="<fato id=\""+id+"\" fonte=\""+x.fonte+"\" periodo=\""+x.periodo+"\">"+x.texto+"</fato>\n";if(texto.length+l.length>max)return;texto+=l;usados.push({id:id,fonte:x.fonte,texto:x.texto})});
    return {texto:texto,fatos:usados,itens:itens,mudancas:mud,financas:fin,saude:sau,vagas:vg,estados:estados}}
  /* chave da análise: o mesmo pacote de fatos (e a mesma pergunta) não é analisado nem pago duas vezes; nova análise manual = tentativa+1 */
  function hojeChave(hoje,texto,pergunta,tentativa){return "hoje-"+hoje+"-"+nlHash(String(texto)+"|"+String(pergunta||""))+(tentativa?"-"+tentativa:"")}
  /* o pacote que identifica a análise na chave: o mesmo texto que vai para a IA, sem o ruído (abaixo) e sem os ids dos fatos (que mudariam
     quando um fato entra ou sai). A IA continua recebendo tudo, inclusive o tempo e as notícias. */
  /* ruído: o que muda várias vezes ao dia sem mudar o seu dia (o tempo, as notícias e a Newsletter, e o estado dessas fontes) fica fora da chave e da
     comparação "a análise ainda vale?". Dados pessoais, financeiros e de saúde NÃO entram aqui: qualquer mudança neles é outra análise. */
  var HOJE_RUIDO=["tempo","noticias","newsletter"];
  function hojeRuido(f){f=f||{};if(HOJE_RUIDO.indexOf(f.fonte)>=0)return true;
    return f.fonte==="rac"&&HOJE_RUIDO.some(function(k){return String(f.texto||"").indexOf("Fonte "+HOJE_FONTES[k]+":")===0})}
  /* "dado de 14 horas atrás" vira "dado velho": o passar das horas não é mudança de dado */
  function hojeSemHoras(t){return String(t||"").replace(/dado de \d+ horas atrás/g,"dado velho")}
  var HOJE_CHAVE_SEM=[new RegExp('^<fato id="f\\d+" fonte="('+HOJE_RUIDO.join("|")+')" '),
    new RegExp('^<fato id="f\\d+" fonte="rac" periodo="hoje">Fonte ('+HOJE_RUIDO.map(function(k){return HOJE_FONTES[k]}).join("|")+'):')];
  function hojeTextoChave(texto){return String(texto||"").split("\n").filter(function(l){return l&&!HOJE_CHAVE_SEM.some(function(r){return r.test(l)})})
    .map(function(l){return hojeSemHoras(l.replace(/^<fato id="f\d+" /,"<fato "))}).join("\n")}
  /* ===== Monitor de custos da IA (view ia_custos do 029): as contas, sem tela e sem banco. Conhecido = o valor cobrado que o dono
     conferiu no Console; estimado = uso informado pela API × tabela de preços da hora; incerto = chamada sem resposta certa (conta a
     reserva cheia, o pior caso); sem custo = não chegou a ser enviada. Nada é inventado: sem tokens, sem estimativa. ===== */
  var IA_AVISOS_PADRAO=[50,75,90];
  function iaCustoChamada(l){l=l||{};
    if(l.conhecido_usd!=null)return {usd:+l.conhecido_usd||0,tipo:"conhecido"};
    if(l.estado==="concluido"||l.estado==="reconciliado")return l.estimado_usd!=null?{usd:+l.estimado_usd||0,tipo:"estimado"}:{usd:0,tipo:"sem_dado"};
    if(l.estado==="incerto"||l.estado==="enviando")return {usd:+l.reservado_usd||0,tipo:"incerto"};
    return {usd:0,tipo:"sem_custo"}}
  /* o dia (AAAA-MM-DD) de um instante em Brasília (UTC-3, sem horário de verão): criado_em vem em UTC, e uma chamada das 22h de Brasília
     já é do dia seguinte em UTC */
  function iaDiaBR(iso){var s=String(iso||"");if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;var t=Date.parse(s);return isFinite(t)?new Date(t-3*3600e3).toISOString().slice(0,10):s.slice(0,10)}
  function iaMediana(v){if(!v.length)return null;var s=v.slice().sort(function(a,b){return a-b}),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2}
  /* linhas: as da view ia_custos; hoje "AAAA-MM-DD" (fuso de Brasília, como o resto do site); filtro {de, ate, funcionalidade, modelo};
     cfg: ia_config (câmbio, impostos, limite em reais, avisos_pct, atipico_fator) */
  function iaMonitor(linhas,hoje,cfg,filtro){cfg=cfg||{};filtro=filtro||{};var vistos={},L=[];
    (linhas||[]).forEach(function(l){if(!l||!l.id||vistos[l.id])return;vistos[l.id]=1;var dia=iaDiaBR(l.criado_em);
      if(filtro.de&&dia<filtro.de||filtro.ate&&dia>filtro.ate||filtro.funcionalidade&&l.funcionalidade!==filtro.funcionalidade||filtro.modelo&&l.modelo!==filtro.modelo)return;
      var c=iaCustoChamada(l);L.push({l:l,dia:dia,mes:dia.slice(0,7),usd:c.usd,tipo:c.tipo})});
    var cambio=+cfg.cambio_brl_usd>0?+cfg.cambio_brl_usd:6,imp=+cfg.margem_impostos>=0?+cfg.margem_impostos:0.12;
    function brl(usd){return Math.round(usd*cambio*(1+imp)*100)/100}
    function soma(lista){var o={usd:0,conhecido:0,estimado:0,incerto:0,chamadas:0,pagas:0,falhas:0,tokensEntrada:0,tokensSaida:0,cacheLeitura:0,cacheEscrita:0};
      lista.forEach(function(x){o.usd+=x.usd;if(x.tipo==="conhecido")o.conhecido+=x.usd;else if(x.tipo==="estimado")o.estimado+=x.usd;else if(x.tipo==="incerto")o.incerto+=x.usd;
        o.chamadas++;if(x.tipo!=="sem_custo")o.pagas++;if(x.l.erro_codigo||x.tipo==="incerto"||x.tipo==="sem_custo")o.falhas++;
        o.tokensEntrada+=+x.l.tokens_entrada||0;o.tokensSaida+=+x.l.tokens_saida||0;o.cacheLeitura+=+x.l.tokens_cache_leitura||0;o.cacheEscrita+=+x.l.tokens_cache_escrita||0});
      ["usd","conhecido","estimado","incerto"].forEach(function(k){o[k]=Math.round(o[k]*1e6)/1e6});o.brl=brl(o.usd);o.medio=o.pagas?Math.round(o.usd/o.pagas*1e6)/1e6:null;return o}
    var d7=somaDiasISO(hoje,-6),mes=hoje.slice(0,7);
    var r={hoje:soma(L.filter(function(x){return x.dia===hoje})),semana:soma(L.filter(function(x){return x.dia>=d7&&x.dia<=hoje})),
      mes:soma(L.filter(function(x){return x.mes===mes})),total:soma(L),porFuncionalidade:{},porModelo:{},diario:[],mensal:[],cambio:cambio,impostos:imp};
    function agrupa(chave){var g={};L.forEach(function(x){var k=chave(x)||"?";(g[k]=g[k]||[]).push(x)});var o={};Object.keys(g).sort().forEach(function(k){o[k]=soma(g[k])});return o}
    r.porFuncionalidade=agrupa(function(x){return x.l.funcionalidade});r.porModelo=agrupa(function(x){return x.l.modelo});
    var dias=agrupa(function(x){return x.dia}),meses=agrupa(function(x){return x.mes});
    for(var i=29;i>=0;i--){var d=somaDiasISO(hoje,-i);r.diario.push({dia:d,usd:dias[d]?dias[d].usd:0,conhecido:dias[d]?dias[d].conhecido:0,estimado:dias[d]?dias[d].estimado:0,incerto:dias[d]?dias[d].incerto:0,chamadas:dias[d]?dias[d].chamadas:0})}
    r.mensal=Object.keys(meses).map(function(m){return {mes:m,usd:meses[m].usd,brl:meses[m].brl,conhecido:meses[m].conhecido,estimado:meses[m].estimado,incerto:meses[m].incerto,chamadas:meses[m].chamadas}});
    /* avisos: % do limite mensal em reais (com câmbio e impostos, como o servidor); nada é configurado aqui */
    var lim=+cfg.limite_brl>0?+cfg.limite_brl:null,avisos=(cfg.avisos_pct&&cfg.avisos_pct.length?cfg.avisos_pct:IA_AVISOS_PADRAO).slice().sort(function(a,b){return a-b});
    r.limite=lim?{brl:lim,pct:Math.round(r.mes.brl/lim*100),atingidos:avisos.filter(function(a){return r.mes.brl/lim*100>=a})}:null;
    /* consumo atípico: hoje acima de fator × a mediana dos dias com gasto nas duas semanas anteriores (precisa de 5 dias de base) */
    var base=[];for(var j=1;j<=14;j++){var dd=somaDiasISO(hoje,-j);if(dias[dd]&&dias[dd].usd>0)base.push(dias[dd].usd)}
    var fator=+cfg.atipico_fator>0?+cfg.atipico_fator:3,med=base.length>=5?iaMediana(base):null;
    r.atipico=med&&r.hoje.usd>fator*med?{hoje:r.hoje.usd,mediana:med,fator:fator}:null;
    /* funcionalidades com custo alto: mais da metade do gasto do mês */
    r.caras=Object.keys(r.porFuncionalidade).filter(function(k){var m=soma(L.filter(function(x){return x.mes===mes&&x.l.funcionalidade===k}));return r.mes.usd>0&&m.usd/r.mes.usd>0.5}).map(function(k){return k});
    return r}
  /* ===== Tela de Custos de IA (docs/hoje.md): a classe de cada custo, o histórico filtrado, ordenado e paginado, e os filtros disponíveis.
     Classes: reconciliado (valor cobrado que o dono conferiu no Console), estimado (tokens informados pela API × tabela de preços da
     hora), reserva (chamada sem resposta certa: conta a reserva cheia), sem dado e sem custo. A API da Anthropic informa tokens, não
     custo: não existe "custo informado pelo provedor" nos registros, e a tela diz isso em vez de inventar. ===== */
  var IA_CLASSES={reconciliado:"Reconciliado",estimado:"Estimado",reserva:"Reserva (incerta)",sem_dado:"Sem dado de uso",sem_custo:"Sem custo"};
  function iaClasse(l){var c=iaCustoChamada(l),k=c.tipo==="conhecido"?"reconciliado":c.tipo==="incerto"?"reserva":c.tipo;return {chave:k,rotulo:IA_CLASSES[k]||k,usd:c.usd}}
  /* o provedor informou o uso (tokens) e o id da requisição */
  function iaInformadoProvedor(l){return !!(l&&l.tokens_entrada!=null&&l.requisicao_id)}
  function iaStatusCustos(l){l=l||{};var e=l.estado,erro=l.erro_codigo?(IA_ERROS[l.erro_codigo]||l.erro_codigo):"";
    if(e==="concluido")return erro?"Recusada: "+erro:"Concluída";
    if(e==="reconciliado")return +l.conhecido_usd>0?"Conferida: cobrada":"Conferida: não cobrada";
    if(e==="incerto")return "Incerta"+(erro?" ("+erro+")":"");
    if(e==="enviando")return "Em andamento";if(e==="reservado")return "Reservada";
    if(e==="falhou_sem_envio")return "Falhou antes do envio"+(erro?" ("+erro+")":"");
    return String(e||"?")}
  function iaOpcoes(linhas){var f={},m={},s={};(linhas||[]).forEach(function(l){if(!l)return;if(l.funcionalidade)f[l.funcionalidade]=1;if(l.modelo)m[l.modelo]=1;if(l.estado)s[l.estado]=1});
    return {funcionalidades:Object.keys(f).sort(),modelos:Object.keys(m).sort(),estados:Object.keys(s).sort()}}
  /* o: {de, ate, funcionalidade, modelo, classe, estado, ordem:{campo, dir}, pagina, porPagina}; campos de ordem: data, funcionalidade,
     modelo, tokens, custo, status */
  function iaHistorico(linhas,o){o=o||{};var vistos={},L=[];
    (linhas||[]).forEach(function(l){if(!l||!l.id||vistos[l.id])return;vistos[l.id]=1;var dia=iaDiaBR(l.criado_em),c=iaClasse(l);
      if(o.de&&dia<o.de||o.ate&&dia>o.ate||o.funcionalidade&&l.funcionalidade!==o.funcionalidade||o.modelo&&l.modelo!==o.modelo||o.classe&&c.chave!==o.classe||o.estado&&l.estado!==o.estado)return;
      L.push({l:l,dia:dia,classe:c.chave,classeRotulo:c.rotulo,usd:c.usd,status:iaStatusCustos(l),tokens:(+l.tokens_entrada||0)+(+l.tokens_saida||0),
        informado:iaInformadoProvedor(l)})});
    var ord=o.ordem||{},campo=ord.campo||"data",dir=ord.dir==="asc"?1:-1;
    var chave={data:function(x){return String(x.l.criado_em||"")},funcionalidade:function(x){return String(x.l.funcionalidade||"")},modelo:function(x){return String(x.l.modelo||"")},
      tokens:function(x){return x.tokens},custo:function(x){return x.usd},status:function(x){return x.status}}[campo]||function(x){return String(x.l.criado_em||"")};
    L.sort(function(a,b){var p=chave(a),q=chave(b),c=p<q?-1:p>q?1:0;if(c)return c*dir;var d=String(b.l.criado_em||"")<String(a.l.criado_em||"")?-1:String(b.l.criado_em||"")>String(a.l.criado_em||"")?1:0;return d||(a.l.id<b.l.id?-1:1)});
    var soma={usd:0,reconciliado:0,estimado:0,reserva:0,tokensEntrada:0,tokensSaida:0};
    L.forEach(function(x){soma.usd+=x.usd;if(x.classe==="reconciliado")soma.reconciliado+=x.usd;else if(x.classe==="estimado")soma.estimado+=x.usd;else if(x.classe==="reserva")soma.reserva+=x.usd;
      soma.tokensEntrada+=+x.l.tokens_entrada||0;soma.tokensSaida+=+x.l.tokens_saida||0});
    ["usd","reconciliado","estimado","reserva"].forEach(function(k){soma[k]=Math.round(soma[k]*1e6)/1e6});
    var por=Math.max(5,Math.min(100,Math.round(+o.porPagina)||15)),paginas=Math.max(1,Math.ceil(L.length/por)),pag=Math.max(1,Math.min(paginas,Math.round(+o.pagina)||1));
    return {itens:L.slice((pag-1)*por,pag*por),total:L.length,soma:soma,pagina:pag,paginas:paginas,porPagina:por,de:L.length?(pag-1)*por+1:0,ate:Math.min(L.length,pag*por)}}
  /* ===== Tela do RAC Hoje: a análise guardada ainda vale? Compara o pacote de fatos de agora com o da análise (sem chamar a IA). ===== */
  var HOJE_IDADE_MAX_H=6;
  function hojeDefasagem(a,pacoteAtual,hoje,agoraMs){
    if(!a)return null;
    if(a.hoje&&hoje&&a.hoje!==hoje)return {atual:false,nivel:"outro_dia",motivo:"É de outro dia ("+String(a.hoje).split("-").reverse().join("/")+"). Os fatos de hoje podem ser outros."};
    if(!a.pacote||!pacoteAtual)return {atual:false,nivel:"sem_base",motivo:"Não dá para comparar com os dados de agora."};
    if(a.pacote!==pacoteAtual)return {atual:false,nivel:"dados_mudaram",motivo:"Os dados do RAC mudaram desde esta análise."};
    var q=Date.parse(a.quando||""),h=isFinite(q)&&agoraMs!=null?(agoraMs-q)/3600e3:0;
    if(h>HOJE_IDADE_MAX_H)return {atual:false,nivel:"velha",motivo:"Foi feita há "+Math.floor(h)+" horas, com os mesmos dados."};
    return {atual:true,nivel:"ok",motivo:"Feita com os dados de agora."}}
  /* os fatos que a análise cita, na ordem do pacote (para mostrar "Fatos utilizados" sem depender do pacote atual) */
  function hojeCitados(res,fatos){res=res||{};var ids={};
    function add(l){(l||[]).forEach(function(i){ids[i]=1})}
    add(res.resumo_fatos);["atencao","relacoes","recomendacoes"].forEach(function(k){(res[k]||[]).forEach(function(x){add(x.fatos)})});if(res.resposta)add(res.resposta.fatos);
    return (fatos||[]).filter(function(f){return ids[f.id]}).map(function(f){return {id:f.id,fonte:f.fonte,texto:f.texto}})}
  /* ===== Central de Compras (docs/compras.md): pedidos de lojas online (Amazon primeiro; Mercado Livre e outras pelo mesmo formato).
     Lê o texto do PDF/e-mail/OCR, a NF-e (XML) e o CSV de histórico; junta os documentos do mesmo pedido, aponta divergências,
     evita duplicidade e acha recorrências. Nunca guarda número de cartão: só a bandeira e os 4 últimos dígitos. ===== */
  var CO_LOJAS={amazon:"Amazon",mercadolivre:"Mercado Livre",shopee:"Shopee",magalu:"Magazine Luiza",outra:"Outra loja"};
  var CO_CATEGORIAS=["Pet","Saúde e farmácia","Casa","Eletrônicos","Higiene e beleza","Bebê","Alimentação","Livros e papelaria","Veículos","Vestuário","Presentes","Outros"];
  var CO_CAT_PALAVRAS=[["Pet",/bravecto|nexgard|simparic|credeli|ra[cç][aã]o|petisco|antipulga|vermifug|coleira|areia (?:sanit|higi)|\bpet\b(?!\s*\d+\s*(?:ml|l|litros?)\b)|\bcaes\b|\bcaes\b|gatos?\b/],["Bebê",/fralda|pampers|huggies|\bnan\b|aptamil|mamadeira|chupeta|len[cç]o umedecido|bebe\b/],
    ["Saúde e farmácia",/vitamina|suplemento|medicament|dipirona|paracetamol|ibuprofeno|termometro|curativo|whey|creatina/],["Higiene e beleza",/shampoo|condicionador|sabonete|desodorante|creme dental|escova de dente|perfume|protetor solar|hidratante/],
    ["Eletrônicos",/fone|cabo usb|carregador|celular|smartphone|notebook|tablet|kindle|echo|alexa|mouse|teclado|monitor|ssd|hd externo|pilha|bateria|smartwatch|hdmi/],
    ["Livros e papelaria",/livro|caderno|caneta|papel a4|agenda|lapis|marca texto/],["Veículos",/oleo de motor|lubrificante|pneu|palheta|automotiv|capacete|moto\b/],
    ["Casa",/panela|toalha|lencol|travesseiro|organizador|lampada|ferramenta|cozinha|limpeza|detergente|vassoura|aspirador|cafeteira|filtro de agua|limpador|desinfetante|amaciante/],
    ["Vestuário",/camiseta|camisa|calca|tenis|bermuda|meia|cueca|vestido|jaqueta/],["Alimentação",/cafe |capsula|chocolate|biscoito|azeite|arroz|feijao|leite|cerveja|refrigerante|coca-cola|milho|ketchup|maionese/]];
  function coCategoria(desc){var n=" "+norm(desc)+" ";for(var i=0;i<CO_CAT_PALAVRAS.length;i++)if(CO_CAT_PALAVRAS[i][1].test(n))return CO_CAT_PALAVRAS[i][0];return "Outros"}
  /* "R$ 1.234,56", "-R$ 6,82", "136.42" → número (≥ 0); vazio → null */
  function coNum(v){if(v==null||v==="")return null;if(typeof v==="number")return isFinite(v)?Math.abs(v):null;
    var s=String(v).replace(/R\$|\s| /g,"").replace(/^[-−–]/,"");if(/,\d{1,2}$/.test(s))s=s.replace(/\./g,"").replace(",",".");else if(/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s))s=s.replace(/,/g,"");
    var n=parseFloat(s);return isFinite(n)?Math.round(n*100)/100:null}
  var CO_MESES={janeiro:1,fevereiro:2,marco:3,abril:4,maio:5,junho:6,julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12,jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12};
  function coData(t){var s=norm(t),m=/(\d{1,2})\s+de\s+([a-z]+)\.?\s+de\s+(\d{4})/.exec(s);if(m&&CO_MESES[m[2]])return m[3]+"-"+(CO_MESES[m[2]]<10?"0":"")+CO_MESES[m[2]]+"-"+(m[1].length<2?"0":"")+m[1];
    m=/\b(\d{2})\/(\d{2})\/(\d{4})\b/.exec(s);if(m)return m[3]+"-"+m[2]+"-"+m[1];m=/\b(\d{4})-(\d{2})-(\d{2})/.exec(s);return m?m[1]+"-"+m[2]+"-"+m[3]:null}
  /* forma de pagamento: só bandeira + 4 últimos dígitos (o resto de qualquer número longo é descartado) */
  function coPagamento(t){var s=String(t||""),b=/\b(mastercard|master card|visa|elo|american express|amex|hipercard|diners)\b/i.exec(s);
    var d=/(?:final|terminad[oa] em|termina em|[uú]ltimos? (?:4 )?d[ií]gitos:?|\*{2,}|•{2,}|x{4})\s*(\d{4})\b/i.exec(s)||(b?/\b(?:mastercard|master card|visa|elo|american express|amex|hipercard|diners)\s*[-–:]\s*(\d{4})\b/i.exec(s):null);
    if(b){var nome={"master card":"Mastercard",amex:"American Express"}[b[1].toLowerCase()]||b[1].charAt(0).toUpperCase()+b[1].slice(1).toLowerCase();return nome+(d?" final "+d[1]:"")}
    if(/\bpix\b/i.test(s))return "Pix";if(/boleto/i.test(s))return "Boleto";if(/vale[- ]presente|saldo amazon|gift card/i.test(s))return "Vale-presente";return null}
  /* recorrência informada no documento (Programe e Poupe, entrega automática, assinatura): só informação, nunca uma compra futura */
  function coRecorrencia(t){var s=norm(t);if(!/programe e poupe|entrega automatica|assinatura|recorrente|subscribe|a cada \d+ (mes|semana)/.test(s))return null;
    var m=/a cada\s+(\d+)\s+(mes(?:es)?|semanas?)/.exec(s);if(!m)return {texto:"recorrência informada (frequência não lida)",meses:null};
    var n=+m[1],sem=/^semana/.test(m[2]);return {texto:"Entrega automática a cada "+n+" "+(sem?(n===1?"semana":"semanas"):(n===1?"mês":"meses")),meses:sem?Math.round(n*7/30.44*10)/10:n}}
  function coLinhaValor(txt,re){var m=re.exec(txt);return m?coNum(m[m.length-1]):null}
  /* texto de pedido (PDF de resumo, e-mail de confirmação/envio/entrega, print com OCR) → dados do pedido. Tolerante: o que não for
     lido fica null e vai para a conferência. */
  /* Mercado Livre · tela "Detalhes da transação" (print do app): data sem ano, "#número" do pedido, itens com "N unidade", "Desconto à vista",
     "Frete Grátis" e "Total pago". Devolve null se o texto não for dessa tela (aí vale o leitor geral). O ano que falta é o do dia de
     hoje (ou o anterior, se a data cair no futuro); o valor ao lado de cada item é tratado como o total da linha. */
  function coLerML(t,hoje){if(!/detalhes da transa[cç][aã]o/i.test(t)||!/mercado ?livre|mercadolivre|total pago/i.test(t))return null;
    var L=t.split("\n").map(function(x){return x.trim()}).filter(Boolean),J=[];
    L.forEach(function(x){if(/^R\$\s*[\d.,]+$/i.test(x)&&J.length&&!/R\$/.test(J[J.length-1]))J[J.length-1]+=" "+x;else J.push(x)});
    var o={itens:[],avisos:[],loja:"mercadolivre",tipo:"resumo",vendedor:null,recorrencia:null,chave_nfe:null,subtotal:null,desconto:null,frete:null,taxas:null,total_pago:null,numero:null,data:null};
    var tn=/#\s*(\d{14,20})\b/.exec(t);o.numero=tn?tn[1]:null;
    var dm=/(\d{1,2})\s+de\s+([a-zçãé]+)\.?(?:\s+de\s+(\d{4}))?/i.exec(t.replace(/\|/g," ")),mes=dm?CO_MESES[norm(dm[2])]:null;
    if(dm&&mes){var h=hoje instanceof Date?hoje:new Date(),ano=dm[3]?+dm[3]:h.getFullYear(),dd=+dm[1];
      if(!dm[3]&&new Date(ano,mes-1,dd)>h)ano-=1;o.data=ano+"-"+(mes<10?"0":"")+mes+"-"+(dd<10?"0":"")+dd}
    var desc=0,achouD=false;
    for(var i=0;i<J.length;i++){var x=J[i],m;
      if(/^desconto|^cupom/i.test(x)){if((m=/[-−–]\s*R\$\s*([\d.,]+)/.exec(x))){desc+=coNum(m[1])||0;achouD=true}continue}
      if(/^frete/i.test(x)){if(/gr[aá]tis|gratuito/i.test(x))o.frete=0;else if((m=/R\$\s*([\d.,]+)/.exec(x)))o.frete=coNum(m[1]);continue}
      if(/^total/i.test(x)){if((m=/R\$\s*([\d.,]+)/.exec(x)))o.total_pago=coNum(m[1]);continue}
      if(/^(?:juros|taxas?)\b/i.test(x)){if((m=/R\$\s*([\d.,]+)/.exec(x)))o.taxas=coNum(m[1]);continue}
      if((m=/^(.{3,}?)\s+R\$\s*([\d.,]+)$/i.exec(x))&&!/^\d+\s*x\b/i.test(x)&&!/^(?:mastercard|visa|elo|amex|hipercard|pix)\b/i.test(x)){
        var q=/^(\d+)\s*unidades?\b/i.exec(J[i+1]||"");o.itens.push({descricao:m[1].replace(/\s*(?:\.{2,}|…)\s*$/,"").trim().slice(0,160),qtd:q?+q[1]:1,total:coNum(m[2]),unitario:null});if(q)i++}}
    o.itens.forEach(function(it){if(it.total!=null&&it.qtd)it.unitario=Math.round(it.total/it.qtd*100)/100;it.categoria=coCategoria(it.descricao)});
    o.desconto=achouD?Math.round(desc*100)/100:null;
    if(o.itens.length&&o.itens.every(function(it){return it.total!=null}))o.subtotal=Math.round(o.itens.reduce(function(s,it){return s+it.total},0)*100)/100;
    o.pagamento=coPagamento(t);
    if(o.subtotal!=null&&o.total_pago!=null){var conta=Math.round((o.subtotal-(o.desconto||0)+(o.frete||0)+(o.taxas||0))*100)/100;
      if(Math.abs(conta-o.total_pago)>0.009)o.avisos.push("A soma dos itens menos o desconto ("+conta.toFixed(2).replace(".",",")+") não bate com o total pago ("+o.total_pago.toFixed(2).replace(".",",")+"): confira se algum item não foi lido.")}
    return o}
  function coLerTexto(texto,hoje){var t=String(texto||"").replace(/ /g," ").replace(/[ \t]+/g," "),n=norm(t),o={itens:[],avisos:[]};
    var ml=coLerML(t,hoje);if(ml)return ml;
    o.loja=/amazon/.test(n)?"amazon":/mercado ?livre|mercadolivre/.test(n)?"mercadolivre":/shopee/.test(n)?"shopee":/magalu|magazine luiza/.test(n)?"magalu":"outra";
    var num=/\b(\d{3}-\d{7}-\d{7})\b/.exec(t)||/(?:pedido|compra|order)\s*(?:n[ºo°.]*|#|numero|id)?\s*:?\s*#?(\d{8,20})\b/i.exec(t);o.numero=num?num[1]:null;
    var dl=/(?:pedido (?:feito|realizado|efetuado)(?: em)?|data do pedido|feito em|realizado em|order placed|compra realizada em)\s*:?\s*([^\n]{6,40})/i.exec(t);o.data=coData(dl?dl[1]:t);
    var vend=/(?:vendido por|vendedor)\s*:?\s*([^\n|]{2,60})/i.exec(t);o.vendedor=vend?vend[1].replace(/\s+(?:e entregue|fornecido|enviado).*$/i,"").replace(/[.,;]\s*$/,"").trim():null;
    o.subtotal=coLinhaValor(t,/subtotal(?: dos itens| do pedido)?\s*:?\s*R\$\s*([\d.,]+)/i);
    o.frete=coLinhaValor(t,/(?:frete(?: e manuseio)?|envio|entrega)\s*:?\s*R\$\s*([\d.,]+)/i);
    var desc=0,dr=/(?:desconto|promo[cç][aã]o|cupom|programe e poupe|economia)[^\n\d]{0,40}?[-−–]\s*R\$\s*([\d.,]+)|[-−–]\s*R\$\s*([\d.,]+)[^\n]{0,30}(?:desconto|promo|cupom)/gi,dm,achou=false;
    while((dm=dr.exec(t))){desc+=coNum(dm[1]||dm[2])||0;achou=true}
    if(!achou){var d2=coLinhaValor(t,/(?:desconto|promo[cç][oõ]es? aplicad[ao]s?|cupom)\s*:?\s*R\$\s*([\d.,]+)/i);if(d2!=null){desc=d2;achou=true}}
    o.desconto=achou?Math.round(desc*100)/100:null;
    o.taxas=coLinhaValor(t,/(?:taxa de servi[cç]o|taxas|impostos de importa[cç][aã]o)\s*:?\s*R\$\s*([\d.,]+)/i);
    o.total_pago=coLinhaValor(t,/(?:total do pedido|total geral|valor total|total da compra|total pago|total a pagar|grand total|total\s*\(.*?\))\s*:?\s*R\$\s*([\d.,]+)/i);
    if(o.total_pago==null)o.total_pago=coLinhaValor(t,/\btotal\s*:?\s*R\$\s*([\d.,]+)/i);
    o.pagamento=coPagamento((/(?:forma de pagamento|pagamento|m[eé]todo de pagamento|pago com)[\s\S]{0,120}/i.exec(t)||[t])[0]);
    o.recorrencia=coRecorrencia(t);
    o.tipo=/reembolso|estorno|refund/.test(n)?"email_reembolso":/foi cancelad|pedido cancelad|cancelamento d|item cancelad|cancelled/.test(n)?"email_cancelamento":/foi entregue|entregue em|seu pedido foi entregue/.test(n)?"email_entrega":/foi enviado|saiu para entrega|enviado em|a caminho/.test(n)?"email_envio":/obrigad[oa] pelo seu pedido|pedido confirmado|confirmacao do pedido/.test(n)?"email_confirmacao":/pagamento (?:aprovado|confirmado|recebido)|recebemos (?:o )?seu pagamento|problema com (?:o )?pagamento/.test(n)?"email_pagamento":/nota fiscal|nf-e|danfe/.test(n)?"email_nota_fiscal":"resumo";
    /* itens: "1 unidade de: X", "Quantidade: 2 X", "2 x X R$ 10,00", ou uma linha com descrição e preço */
    var ir=/(\d+)\s*(?:unidades?|un\.?|x)\s*(?:de:?\s*)?([^\n]{3,160}?)(?:\s+R\$\s*([\d.,]+))?(?:\n|$)/gi,im;
    while((im=ir.exec(t))){var dsc=im[2].replace(/\s*(?:vendido por|vendedor)\b.*$/i,"").trim();if(!dsc||/^r\$/i.test(dsc))continue;o.itens.push({descricao:dsc.slice(0,160),qtd:+im[1],total:coNum(im[3]),unitario:null})}
    if(!o.itens.length){var q=/quantidade\s*:?\s*(\d+)/i.exec(t),nome=/(?:produto|item|itens pedidos)\s*:?\s*\n?([^\n]{3,160})/i.exec(t);if(nome)o.itens.push({descricao:nome[1].trim(),qtd:q?+q[1]:1,total:null,unitario:null})}
    o.itens.forEach(function(i){if(i.total==null&&o.itens.length===1&&o.subtotal!=null)i.total=o.subtotal;if(i.total!=null&&i.qtd)i.unitario=Math.round(i.total/i.qtd*100)/100;i.categoria=coCategoria(i.descricao)});
    if(o.subtotal==null&&o.itens.length&&o.itens.every(function(i){return i.total!=null}))o.subtotal=Math.round(o.itens.reduce(function(s,i){return s+i.total},0)*100)/100;
    var chave=/\b(\d{4}\s?){10}\d{4}\b/.exec(t.replace(/(\d{4}) (?=\d{4})/g,"$1 "));o.chave_nfe=chave?chave[0].replace(/\s/g,""):null;
    if(o.chave_nfe&&o.chave_nfe.length!==44)o.chave_nfe=null;
    /* DANFE em PDF: número e série da nota, CNPJ e nome do emitente (os valores da tabela ficam com o resumo/XML) */
    if(/danfe|documento auxiliar da nota/.test(n)){var nn=/n[º°o.]*\s*(\d{3}\.\d{3}\.\d{3})/i.exec(t),se=/s[ée]rie\s*:?\s*(\d{1,3})\b/i.exec(t),cj=/\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/.exec(t),em=/recebemos de\s+(.+?)\s+os produtos/i.exec(t);
      if(nn)o.numero_nf=nn[1].replace(/\D/g,"");if(se)o.serie=se[1];if(cj)o.cnpj=cj[1].replace(/\D/g,"");if(em){o.emitente=em[1].trim();if(!o.vendedor)o.vendedor=o.emitente}}
    return o}
  /* NF-e (XML da nota ou da SEFAZ): emitente, número, chave, itens, totais e forma de pagamento */
  function coTag(x,tag){var m=new RegExp("<(?:\\w+:)?"+tag+"(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?"+tag+">","i").exec(x);return m?m[1].replace(/<!\[CDATA\[|\]\]>/g,"").trim():null}
  function coTags(x,tag){var re=new RegExp("<(?:\\w+:)?"+tag+"(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?"+tag+">","gi"),m,l=[];while((m=re.exec(x)))l.push(m[1]);return l}
  var CO_TPAG={"01":"Dinheiro","02":"Cheque","03":"Cartão de crédito","04":"Cartão de débito","05":"Crédito loja","10":"Vale alimentação","11":"Vale refeição","12":"Vale-presente","15":"Boleto","16":"Depósito","17":"Pix","18":"Transferência","19":"Programa de fidelidade","90":"Sem pagamento","99":"Outros"};
  function coLerNFe(xml){var x=String(xml||"");if(!/<(?:\w+:)?infNFe\b/i.test(x))return null;
    var id=/<(?:\w+:)?infNFe[^>]*\bId="NFe(\d{44})"/i.exec(x),emit=coTag(x,"emit")||"",ide=coTag(x,"ide")||"",tot=coTag(x,"ICMSTot")||"",pag=coTag(x,"pag")||"";
    var itens=coTags(x,"det").map(function(d){var p=coTag(d,"prod")||"";return {descricao:coTag(p,"xProd"),codigo:coTag(p,"cProd"),qtd:coNum(coTag(p,"qCom")),unitario:coNum(coTag(p,"vUnCom")),total:coNum(coTag(p,"vProd")),desconto:coNum(coTag(p,"vDesc"))||0}})
      .map(function(i){i.categoria=coCategoria(i.descricao);return i});
    var inf=coTag(x,"infCpl")||"",ped=/\b(\d{3}-\d{7}-\d{7})\b/.exec(inf);
    var o={tipo:"nfe_xml",chave_nfe:id?id[1]:null,numero_nf:coTag(ide,"nNF"),serie:coTag(ide,"serie"),data:(coTag(ide,"dhEmi")||coTag(ide,"dEmi")||"").slice(0,10)||null,
      emitente:coTag(emit,"xNome"),cnpj:(coTag(emit,"CNPJ")||"").replace(/\D/g,"")||null,itens:itens,
      subtotal:coNum(coTag(tot,"vProd")),desconto:coNum(coTag(tot,"vDesc")),frete:coNum(coTag(tot,"vFrete")),taxas:coNum(coTag(tot,"vOutro")),total_pago:coNum(coTag(tot,"vNF")),
      pagamento:(coTags(pag,"tPag").map(function(t){return CO_TPAG[t]||null}).filter(Boolean)[0])||null,numero:ped?ped[1]:null,
      loja:/amazon/i.test(coTag(emit,"xNome")||"")?"amazon":/mercado ?livre|ebazar/i.test(coTag(emit,"xNome")||"")?"mercadolivre":"outra",vendedor:coTag(emit,"xNome")};
    return o}
  /* conta: total pago = subtotal − desconto + frete + taxas (2 centavos de folga); itens somando o subtotal é aviso, não erro */
  function coConferir(c,ctx){ctx=ctx||{};c=c||{};var e=[],a=[],cent=function(v){return v==null||v===""?null:Math.round((+v)*100)};
    if(!CO_LOJAS[c.loja])e.push("Escolha a loja.");if(!String(c.numero||"").trim())e.push("Preencha o número do pedido.");
    if(!/^\d{4}-\d{2}-\d{2}$/.test(c.data||""))e.push("Preencha a data do pedido.");else if(ctx.hoje&&c.data>ctx.hoje)e.push("A data está no futuro.");
    var itens=(c.itens||[]).filter(function(i){return i&&String(i.descricao||"").trim()});if(!itens.length)e.push("Inclua pelo menos um produto.");
    itens.forEach(function(i,k){if(!(+i.qtd>0))e.push("Confira a quantidade do item "+(k+1)+".");if(!(+i.total>=0)||i.total===""||i.total==null)e.push("Preencha o valor do item "+(k+1)+".")});
    var V={};["subtotal","desconto","frete","taxas","total_pago"].forEach(function(k){var v=cent(c[k]);if(v!=null&&(!isFinite(v)||v<0))e.push("Confira "+k.replace("_"," ")+".");V[k]=v});
    if(V.total_pago==null)e.push("Preencha o total pago.");if(V.subtotal==null)e.push("Preencha o subtotal.");
    if(!e.length){var calc=V.subtotal-(V.desconto||0)+(V.frete||0)+(V.taxas||0);
      if(Math.abs(calc-V.total_pago)>2)e.push("A conta dá R$ "+(calc/100).toFixed(2).replace(".",",")+" (subtotal − desconto + frete + taxas), mas o total pago é R$ "+(V.total_pago/100).toFixed(2).replace(".",",")+".");
      var si=itens.reduce(function(s,i){return s+cent(i.total)-(cent(i.desconto)||0)},0);if(Math.abs(si-V.subtotal)>2)a.push("Os produtos somam R$ "+(si/100).toFixed(2).replace(".",",")+" e o subtotal é R$ "+(V.subtotal/100).toFixed(2).replace(".",",")+".")}
    return {ok:!e.length,erros:e,avisos:a}}
  function coNumeroPedido(n){return String(n||"").toUpperCase().replace(/[^A-Z0-9]/g,"").replace(/^0+(?=.)/,"")}
  /* duplicidade entre fontes: mesmo pedido (loja + número) ou mesma NF-e é "confirmada" (o documento novo vai para o pedido que já existe);
     mesmo dia e mesmo total em outra fonte (Mercado, Alimentação ou outra compra) é "possivel" (pergunta antes) */
  function coDuplicata(c,compras,outras,ignorar){c=c||{};var n=coNumeroPedido(c.numero),tot=c.total_pago==null?null:Math.round(+c.total_pago*100);
    for(var i=0;i<(compras||[]).length;i++){var x=compras[i];if(!x||x.id===ignorar)continue;
      if(n&&x.loja===c.loja&&coNumeroPedido(x.numero)===n)return {nivel:"confirmada",compra:x,motivo:"mesmo pedido ("+(CO_LOJAS[x.loja]||x.loja)+" "+x.numero+")"};
      if(c.chave_nfe&&x.chave_nfe===c.chave_nfe)return {nivel:"confirmada",compra:x,motivo:"mesma nota fiscal"}}
    if(tot==null||!c.data)return null;
    var todas=(compras||[]).filter(function(x){return x.id!==ignorar}).map(function(x){return {o:"Compras online",x:x,t:x.total_pago,d:x.data,nome:x.vendedor||CO_LOJAS[x.loja]}}).concat((outras||[]).map(function(x){return {o:x.origem,x:x,t:x.total,d:x.data,nome:x.nome}}));
    for(var k=0;k<todas.length;k++){var y=todas[k];if(y.d===c.data&&Math.abs(Math.round(+y.t*100)-tot)<=1)return {nivel:"possivel",compra:y.x,origem:y.o,motivo:"mesmo dia e mesmo total em "+y.o+(y.nome?" ("+y.nome+")":"")}}
    return null}
  /* dados pessoais fora do que é gravado: o texto lido do PDF/print (extraido.texto) perde CPF, telefone, e-mail, CEP, endereço, destinatário
     e saudação ANTES de ir para o banco. Mantém pedido, produtos, valores, datas, pagamento sem número e a loja/vendedor.
     Melhor esforço sobre texto de OCR: o original continua só no cofre privado, como veio. */
  var CO_PES_CAB=/^\s*(?:endere[cç]o|enviar para|entregar (?:em|para)|enviado para|entrega em|destinat[aá]rio|dados do (?:destinat[aá]rio|cliente|comprador)|cliente|comprador|faturad[oa] (?:para|a)|nome completo|nome\s*\/\s*raz[aã]o social|telefone|fone|celular|whatsapp|contato|e-?mail|cpf|bairro|munic[ií]pio|cidade|cep)\b/i,
    CO_PES_COM=/R\$|^\s*(?:itens?|produtos?|pedido|forma de pagamento|pagamento|subtotal|total|frete|data|vendido por|resumo|quantidade|desconto|taxas?|envio|c[aá]lculo|fatura|transportador)\b/i,
    CO_PES_SAUD=/^\s*(?:ol[aá]|oi|prezad[oa]s?|caro|cara|bom dia|boa tarde|boa noite)(?=[\s,!:.]|$)/i,
    CO_PES_RUA=/\b(?:rua|avenida|av\.|alameda|travessa|rodovia|estrada|pra[cç]a|largo)\s+[^\n,]{2,60},?\s*(?:n[ºo°.]*\s*)?\d+/i;
  function coLimparTokens(s){return String(s)
    .replace(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g,"[removido]")
    .replace(/\bcpf\b[^\n\d]{0,15}\d{11}\b/gi,"[removido]").replace(/[\d*]{3}\.[\d*]{3}\.[\d*]{3}-[\d*]{2}/g,"[removido]")
    .replace(/\+55[\s.-]?\d{2}[\s.-]?9?\d{4}[\s.-]?\d{4}/g,"[removido]").replace(/\(\d{2}\)\s*9?\d{4}[\s.-]?\d{4}/g,"[removido]").replace(/\b\d{2}\s9\d{4}-\d{4}\b/g,"[removido]")
    .replace(/(tel(?:efone)?|fone|cel(?:ular)?|whats(?:app)?|contato)\b[^\n\d]{0,12}[\d()\s.+-]{8,20}/gi,"$1 [removido]")
    .replace(/\b\d{5}-\d{3}\b/g,"[removido]")}
  function coLimparTexto(texto){var L=String(texto==null?"":texto).split(/\r?\n/),o=[];
    for(var i=0;i<L.length;i++){var l=L[i];
      if(CO_PES_CAB.test(l)){var n=0;while(n<4&&i+1<L.length&&L[i+1].trim()&&!CO_PES_COM.test(L[i+1])&&!CO_PES_CAB.test(L[i+1])){i++;n++}continue}
      if(CO_PES_SAUD.test(l)||CO_PES_RUA.test(l))continue;
      o.push(coLimparTokens(l))}
    return o.join("\n")}
  /* uma cópia do que foi extraído, pronta para gravar: o texto bruto limpo e, nos demais campos, só os padrões inequívocos (e-mail, CPF, telefone, CEP) */
  function coLimparExtraido(v){if(v==null)return v;if(typeof v==="string")return coLimparTokens(v);if(Array.isArray(v))return v.map(coLimparExtraido);
    if(typeof v==="object"){var o={};Object.keys(v).forEach(function(k){o[k]=k==="texto"&&typeof v[k]==="string"?coLimparTexto(v[k]):coLimparExtraido(v[k])});return o}return v}
  /* junta o que veio de vários documentos do mesmo pedido: o resumo/e-mail manda nos preços e no desconto, a NF-e na chave e no emitente;
     valores diferentes entre os documentos viram divergências (nada é trocado em silêncio) */
  var CO_CAMPOS_VAL=[["subtotal","subtotal"],["desconto","desconto"],["frete","frete"],["total_pago","total pago"]];
  function coMesclar(base,novo){if(!base)return JSON.parse(JSON.stringify(novo));var o=JSON.parse(JSON.stringify(base)),div=o.divergencias||[];
    ["numero","data","vendedor","pagamento","chave_nfe","numero_nf","emitente","cnpj","recorrencia"].forEach(function(k){if((o[k]==null||o[k]==="")&&novo[k]!=null)o[k]=novo[k]});
    if(o.loja==="outra"&&novo.loja&&novo.loja!=="outra")o.loja=novo.loja;
    CO_CAMPOS_VAL.forEach(function(k){var a=o[k[0]],b=novo[k[0]];if(a==null&&b!=null)o[k[0]]=b;else if(a!=null&&b!=null&&Math.abs(a-b)>0.02)div.push({campo:k[0],texto:"O "+k[1]+" é R$ "+(+a).toFixed(2).replace(".",",")+" num documento e R$ "+(+b).toFixed(2).replace(".",",")+" no "+(CO_DOC_NOME[novo.tipo]||novo.tipo)+"."})});
    if(!(o.itens||[]).length&&(novo.itens||[]).length)o.itens=novo.itens;
    else (novo.itens||[]).forEach(function(i){var p=(o.itens||[]).filter(function(j){return !j.codigo&&i.codigo&&alCompararProdutos(j.descricao,i.descricao).resultado!=="diferente"})[0];if(p)p.codigo=i.codigo});
    o.divergencias=div;return o}
  var CO_DOC_NOME={resumo:"resumo do pedido",resumo_pdf:"PDF do pedido",email_confirmacao:"e-mail de confirmação",email_envio:"e-mail de envio",email_entrega:"e-mail de entrega",email_pagamento:"e-mail de pagamento",email_cancelamento:"e-mail de cancelamento",email_reembolso:"e-mail de reembolso",email_nota_fiscal:"e-mail da nota fiscal",nfe_xml:"XML da nota fiscal",danfe:"DANFE",csv:"CSV de histórico",imagem:"print",foto_produto:"foto do produto",outro:"documento"};
  /* ===== Lote 5.0: a regra financeira de Compras, uma só (Resumo, lista, Painel e Hoje) =====
     coRegra(c) diz se o pedido entra nas despesas, com que valor e, quando não entra, por quê. Os mecanismos são distintos e nunca se misturam:
       fora_das_contas      o dono marcou "já está contada em outro lugar" (decisão manual, por pedido);
       referencia_historica Amazon físico histórico: só indicadores da Amazon, nunca nas despesas gerais;
       outro_modulo         supermercado/combustível: ficam no Mercado/Veículos;
     mais cancelada (status cancelado, confirmado pelo dono) e pendente (autorizado/desconhecido: o valor fica em "pendente", fora das despesas).
     Quando mais de um motivo vale, o valor é zero em todos; o rótulo segue a ordem: cancelada, fora_das_contas, outro_modulo, o resto.
     Sem data ou sem valor numérico (null, vazio, texto) o pedido não entra e não conta como pedido. */
  function coRegra(c){c=c||{};var k=coClassificar(c),tot=+c.total_pago,
      o={conta:false,valor:0,motivo:"conta",tratamento:k.tratamento,situacao:k.situacao,excluido:0,referencia:k.valor_referencia||0,pendente:k.valor_pendente||0,categoria:k.categoria||null,avisos:k.avisos||[]};
    if(!c.data){o.motivo="sem_data";return o}
    if(c.total_pago==null||c.total_pago===""||!isFinite(tot)){o.motivo="sem_valor";return o}
    if(k.situacao==="cancelada"){o.motivo="cancelada";o.excluido=tot;return o}
    if(c.fora_das_contas){o.motivo="fora_das_contas";o.excluido=tot;return o}
    if(k.tratamento==="outro_modulo"){o.motivo="outro_modulo";o.excluido=tot;return o}
    if(k.tratamento==="pendente"){o.motivo="pendente";o.excluido=k.valor_pendente;return o}
    if(k.tratamento==="referencia_historica"){o.motivo="referencia_historica";o.excluido=k.valor_referencia;return o}
    o.conta=true;o.valor=k.tratamento==="despesa"?tot:k.valor_despesa;return o}
  /* o que o pedido soma nas despesas (0 quando não entra): é o que o Hoje usa */
  function coValorDespesa(c){return coRegra(c).valor}
  /* a linha de despesa de um pedido que conta: total pago (ou a parte que conta), na data do pedido, na categoria do produto de maior valor
     (o desconto do item já abatido); o histórico digital vai para "Compras online · Digital" */
  function coLinha(c,r){var cats={};(c.itens||[]).forEach(function(i){var k=i.categoria||"Outros";cats[k]=(cats[k]||0)+(+i.total||0)-(+i.desconto||0)});
    var ks=Object.keys(cats),cat=ks.length?ks.sort(function(a,b){return cats[b]-cats[a]})[0]:(c.categoria||"Outros");
    return {d:c.data,v:r.valor,f:"Compras online",cat:r.categoria||c.categoria||cat,id:c.id||null,loja:c.loja,vendedor:c.vendedor}}
  /* Descontos de um pedido, sem contar duas vezes. O desconto do pedido ("geral") pode já conter o dos itens (NF-e: o vDesc do total é a soma dos vDesc dos itens)
     ou ser uma camada à parte (o subtotal já vem líquido dos itens). A evidência está nos valores gravados:
       subtotal ≈ soma dos itens BRUTOS e desconto do pedido ≥ desconto dos itens → "contemplado": a economia é o desconto do pedido; o geral é o que passa dos itens;
       subtotal ≈ soma dos itens LÍQUIDOS                                         → "somado": as duas camadas são distintas, a economia é a soma;
       sem subtotal ou sem nenhuma das duas conferências                           → "incerto": nunca se soma, a economia é o maior dos dois (piso, sem duplicidade).
     Retorna {geral, itens, total, modo}; geral + itens = total em todos os modos. */
  function coDescontos(c){c=c||{};var ger=amR2(Math.max(0,+c.desconto||0)),id=0,bruto=0,liq=0;
    (c.itens||[]).forEach(function(i){i=i||{};var d=Math.max(0,+i.desconto||0),t=+i.total||0;id+=d;bruto+=t;liq+=t-d});id=amR2(id);
    if(!(id>0))return {geral:ger,itens:0,total:ger,modo:"sem_itens"};
    var sub=c.subtotal==null||c.subtotal===""?NaN:+c.subtotal,m=null;
    if(isFinite(sub)){if(Math.abs(sub-bruto)<=0.02&&ger>=id-0.02)m="contemplado";else if(Math.abs(sub-liq)<=0.02)m="somado"}
    if(m==="somado")return {geral:ger,itens:id,total:amR2(ger+id),modo:m};
    if(m==="contemplado")return {geral:amR2(Math.max(0,ger-id)),itens:id,total:ger,modo:m};
    var tot=Math.max(ger,id);return {geral:amR2(tot-id),itens:id,total:amR2(tot),modo:"incerto"}}
  /* nome da loja como aparece nas barras do Resumo: o da loja; no marketplace "outra", o vendedor. Barras e detalhe usam esta mesma chave. */
  function coLojaDe(c){c=c||{};return c.vendedor&&c.loja==="outra"?c.vendedor:(CO_LOJAS[c.loja]||c.loja)}
  /* categoria de UM produto: a do próprio item; sem ela, coCategoria(descrição); sem identificação, "Outros". A categoria do pedido não manda nos itens. */
  function coCategoriaItem(i){i=i||{};var k=String(i.categoria==null?"":i.categoria).trim();return k||coCategoria(i.descricao||"")}
  /* ajustes dos pedidos: o que o pedido paga fora dos itens. total = valor que o pedido conta − soma dos itens listados; o resto da conta é aberto em:
       frete e taxas (campos do pedido, só positivos), desconto_geral (negativo; só a parte que passa dos itens, coDescontos) e outros = total − frete − taxas − desconto_geral.
     "outros" é aberto em detalhe: item_cancelado e item_sem_nome (identificados até o limite do que sobrou), sem_itens (pedido sem nenhum item listado)
     e nao_explicado (o que sobrar, inclusive valor negativo). Nada é forçado: o valor do pedido é o de coRegra. */
  function coAjZero(){return {total:0,frete:0,taxas:0,desconto_geral:0,outros:0,detalhe:{item_cancelado:0,item_sem_nome:0,sem_itens:0,nao_explicado:0}}}
  function coAjSomar(a,b){["total","frete","taxas","desconto_geral","outros"].forEach(function(k){a[k]=amR2(a[k]+b[k])});Object.keys(a.detalhe).forEach(function(k){a.detalhe[k]=amR2(a.detalhe[k]+b.detalhe[k])});return a}
  /* Partes de UM pedido que conta (r = coRegra do pedido): os itens que formam o valor, cada um com categoria, e os ajustes. Única fonte de coResumo e coDetalhe.
     Pedido comum: todo item não cancelado, pelo valor líquido (coItemTotal). Histórico Amazon: só o item digital efetivado (coItemHist), na categoria do digital (CO_CAT_DIGITAL). */
  function coPedidoPartes(c,r){c=c||{};r=r||coRegra(c);
    var hist=r.tratamento==="despesa_digital"||r.tratamento==="misto",nat=coNatureza(c),itens=[],soma=0,canc=0,semNome=0;
    (c.itens||[]).forEach(function(i){i=i||{};var k=alChaveProduto(i.descricao),v,cancelado=norm(i.status_norm||i.situacao||"")==="cancelado";
      if(hist){var x=coItemHist(i,nat);if(x.destino!=="digital")return;v=x.v}else{v=coItemTotal(i);if(cancelado){if(v>0)canc+=v;return}}
      if(!k){if(v>0)semNome+=v;return}
      itens.push({chave:k,nome:i.descricao,qtd:+i.qtd>0?+i.qtd:1,v:v,cat:hist?CO_CAT_DIGITAL:coCategoriaItem(i)});soma=amR2(soma+v)});
    var aj=coAjZero(),fr=0,tx=0,dg=0;aj.total=amR2(r.valor-soma);
    if(!hist){fr=amR2(Math.max(0,+c.frete||0));tx=amR2(Math.max(0,+c.taxas||0));dg=0-coDescontos(c).geral}
    aj.frete=fr;aj.taxas=tx;aj.desconto_geral=dg;aj.outros=amR2(aj.total-fr-tx-dg);
    var d=aj.detalhe,sobra=aj.outros,a;
    if(sobra>0&&canc>0){a=Math.min(sobra,amR2(canc));d.item_cancelado=a;sobra=amR2(sobra-a)}
    if(sobra>0&&semNome>0){a=Math.min(sobra,amR2(semNome));d.item_sem_nome=a;sobra=amR2(sobra-a)}
    if(sobra>0&&!itens.length)d.sem_itens=sobra;else d.nao_explicado=sobra;
    return {itens:itens,aj:aj}}
  /* Detalhe de uma barra do Resumo, com a mesma estrutura para loja e categoria. Só os pedidos que a regra manda contar (coRegra), no período (ctx.hoje, ctx.meses padrão 12).
     filtro: {loja:nome} e/ou {categoria:nome}. Devolve {total, pedidos, produtos, ajustes, escopo_ajustes}:
       produtos  por produto (alChaveProduto, a mesma chave de coPrecos): qtd, total, medio (total/qtd), compras, ultima, categoria, lojas (gasto por loja de origem);
       por loja       total = valor dos pedidos da loja = produtos + ajustes; escopo_ajustes "pedidos" (os ajustes dos pedidos da loja);
       por categoria  total = só os produtos da categoria (= porCategoria[categoria]); os ajustes NÃO são de nenhuma categoria: vêm separados, uma vez só, e cobrem todos os pedidos do período
                      (escopo_ajustes "periodo", igual a periodo.ajustesPedidos do coResumo). Σ categorias + ajustes = total do período. Nunca há rateio. */
  function coDetalhe(compras,ctx,filtro){ctx=ctx||{};filtro=filtro||{};if(!ctx.hoje)return null;
    var ini=pnMeses(ctx.hoje,ctx.meses||12)[0]+"-01",por={},ped=0,tot=0,aj=coAjZero(),cat=filtro.categoria!=null;
    (compras||[]).forEach(function(c){var r=coRegra(c);if(!r.conta)return;var l=coLinha(c,r);if(l.d<ini)return;
      if(filtro.loja!=null&&coLojaDe(l)!==filtro.loja)return;
      var pt=coPedidoPartes(c,r),contribui=false;
      pt.itens.forEach(function(it){if(cat&&it.cat!==filtro.categoria)return;contribui=true;
        var p=por[it.chave]||(por[it.chave]={chave:it.chave,nome:it.nome,categoria:it.cat,qtd:0,total:0,compras:0,ultima:null,lojas:{},_v:null});
        p.qtd+=it.qtd;p.total=amR2(p.total+it.v);if(p._v!==c){p._v=c;p.compras++}
        if(!p.ultima||c.data>p.ultima)p.ultima=c.data;
        var lj=coLojaDe(l);p.lojas[lj]=amR2((p.lojas[lj]||0)+it.v);if(cat)tot=amR2(tot+it.v)});
      if(!cat)tot=amR2(tot+r.valor);
      if(!cat||contribui)ped++;
      coAjSomar(aj,pt.aj)});
    var prods=Object.keys(por).map(function(k){var p=por[k];delete p._v;p.qtd=Math.round(p.qtd*1000)/1000;p.medio=p.qtd>0?amR2(p.total/p.qtd):null;return p})
      .sort(function(a,b){return b.total-a.total||(a.nome<b.nome?-1:1)});
    return {filtro:filtro,ini:ini,total:tot,pedidos:ped,produtos:prods,ajustes:aj,escopo_ajustes:cat?"periodo":"pedidos"}}
  function coDetalheLoja(compras,ctx,loja){return coDetalhe(compras,ctx,{loja:loja})}
  function coDetalheCategoria(compras,ctx,categoria){return coDetalhe(compras,ctx,{categoria:categoria})}
  var CO_FORA=["cancelada","fora_das_contas","outro_modulo","pendente","referencia_historica"];
  /* Resumo único de uma lista de pedidos. ctx.hoje (AAAA-MM-DD) liga o período (ctx.meses, padrão 12). Devolve:
     despesas/linhas  os pedidos que contam (o Painel soma estas); regras  a regra de cada pedido, na mesma ordem da entrada;
     mensal           por mês do pedido: pedidos (todos os listados), contam e total (só o que conta); é o cabeçalho da lista;
     fora             o que ficou de fora, por motivo ({n, valor}), sem misturar os mecanismos;
     periodo          mês, 12 meses, por mês/categoria/loja e descontos; todos saem das mesmas linhas, então os totais batem.
                      porCategoria é por PRODUTO (coCategoriaItem); o que o pedido paga fora dos itens (frete, taxas, desconto geral, outros) NÃO entra em nenhuma categoria:
                      fica em ajustesPedidos (coAjZero), uma vez só. Σ porCategoria + ajustesPedidos.total = ano.total.
     Descontos (coDescontos, só dos pedidos que contam): gerais e itens separados, economia = total sem duplicidade, incertos = pedidos em que não dá para provar
     se o desconto do pedido já contém o dos itens (nesses a economia é o piso, nunca a soma). */
  function coResumo(compras,ctx){ctx=ctx||{};var linhas=[],regras=[],mensal={},fora={},sem=0,tot=0;
    CO_FORA.forEach(function(m){fora[m]={n:0,valor:0}});
    (compras||[]).forEach(function(c){var r=coRegra(c);regras.push(r);if(!c)return;
      if(c.data){var m=String(c.data).slice(0,7),mm=mensal[m]||(mensal[m]={pedidos:0,contam:0,total:0});mm.pedidos++;if(r.conta){mm.contam++;mm.total=amR2(mm.total+r.valor)}}
      if(r.conta){var l=coLinha(c,r);l._c=c;l._r=r;linhas.push(l);tot+=r.valor;if(r.referencia>0){fora.referencia_historica.n++;fora.referencia_historica.valor=amR2(fora.referencia_historica.valor+r.referencia)}if(r.pendente>0){fora.pendente.n++;fora.pendente.valor=amR2(fora.pendente.valor+r.pendente)}}
      else if(fora[r.motivo]){fora[r.motivo].n++;fora[r.motivo].valor=amR2(fora[r.motivo].valor+r.excluido)}
      else sem++});
    var R={despesas:linhas.map(function(l){return {d:l.d,v:l.v,f:l.f,cat:l.cat,id:l.id}}),linhas:linhas.map(function(l){var o={};Object.keys(l).forEach(function(k){if(k!=="_c"&&k!=="_r")o[k]=l[k]});return o}),
      regras:regras,mensal:mensal,fora:fora,total:amR2(tot),ignorados:sem,periodo:null};
    if(ctx.hoje){var meses=pnMeses(ctx.hoje,ctx.meses||12),mes=meses[meses.length-1],ini=meses[0]+"-01",doMes=0,nMes=0,ano=0,nAno=0,cat={},loja={},ajp=coAjZero(),gerais=0,itens=0,econ=0,inc=0;
      linhas.forEach(function(l){if(l.d.slice(0,7)===mes){doMes+=l.v;nMes++}
        if(l.d>=ini){ano+=l.v;nAno++;var pt=coPedidoPartes(l._c,l._r);pt.itens.forEach(function(it){cat[it.cat]=amR2((cat[it.cat]||0)+it.v)});coAjSomar(ajp,pt.aj);var k=coLojaDe(l);loja[k]=(loja[k]||0)+l.v;
          var dc=coDescontos(l._c);gerais+=dc.geral;itens+=dc.itens;econ+=dc.total;if(dc.modo==="incerto")inc++}});
      R.periodo={meses:meses,mes:mes,ini:ini,doMes:{total:amR2(doMes),n:nMes},ano:{total:amR2(ano),n:nAno,ticket:nAno?amR2(ano/nAno):null},porMes:pnPorMes(linhas,meses),porCategoria:cat,ajustesPedidos:ajp,porLoja:loja,descontos:{gerais:amR2(gerais),itens:amR2(itens),economia:amR2(econ),incertos:inc}}}
    return R}
  /* despesas para o Painel: o total pago, uma vez por pedido, na data do pedido (a regra é a de coRegra) */
  function coDespesas(compras){return coResumo(compras).despesas}
  /* como identificar o pedido na tela, só com estados que já existem (nenhum estado novo): o status e, à parte, o tratamento financeiro */
  function coRotulo(c){c=c||{};var r=coRegra(c),s=norm(c.status_norm||c.status||"").trim(),st,ex=[];
    if(r.motivo==="cancelada")st={chave:"cancelada",texto:"Cancelada",tom:"off"};
    else if(s==="cancelamento_informado")st={chave:"cancelamento_informado",texto:"Cancelamento informado",tom:"aviso"};
    else if(s==="reembolso_informado")st={chave:"reembolso_informado",texto:"Reembolso informado",tom:"aviso"};
    else if(r.situacao==="pendente")st=s==="autorizado"||s==="autorizada"||s==="authorized"?{chave:"autorizada",texto:"Autorizada · pendente",tom:"aviso"}:{chave:"desconhecido",texto:"Status desconhecido · pendente",tom:"aviso"};
    else st=s==="concluido"?{chave:"concluida",texto:"Concluída",tom:"ok"}:{chave:"confirmada",texto:"Confirmada",tom:"ok"};
    if(r.motivo==="fora_das_contas")ex.push({chave:"fora_das_contas",texto:"Fora das contas",tom:"info"});
    if(r.motivo==="outro_modulo")ex.push({chave:"outro_modulo",texto:"Outro módulo",tom:"info"});
    if(r.motivo==="referencia_historica")ex.push({chave:"referencia_historica",texto:"Referência histórica",tom:"info"});
    if(r.conta&&r.tratamento==="despesa_digital")ex.push({chave:"despesa_digital",texto:"Digital · histórico",tom:"info"});
    if(r.conta&&r.tratamento==="misto")ex.push({chave:"misto",texto:"Histórico misto",tom:"info"});
    if(r.conta&&r.pendente>0)ex.push({chave:"parcial_pendente",texto:"Item pendente",tom:"aviso"});
    return {status:st,extras:ex,regra:r}}
  /* linha do banco (PostgREST) → o formato que as regras leem. Viram número (null só se o valor vier nulo, vazio ou ilegível; campo ausente continua ausente, não é criado): subtotal, desconto, frete, taxas, total_pago, impostos_info
     (numeric(12,2), só informativo: nunca entra no total) e recorrencia_meses. Os itens vão para "itens" (com natureza, total_linha e situacao, que o coClassificar usa
     no histórico). Todos os outros campos passam como vieram (canal, natureza, historico, origem, status, categoria…). Não deduz segmento nem normaliza situação: isso é
     de coSegmentoDe e coClassificar. */
  function coDeBanco(r){r=r||{};var c={},n=function(v){return v==null||v===""||!isFinite(+v)?null:+v};
    Object.keys(r).forEach(function(k){if(k!=="compras_online_itens")c[k]=r[k]});
    ["subtotal","desconto","frete","taxas","total_pago","impostos_info","recorrencia_meses"].forEach(function(k){if(k in r)c[k]=n(r[k])});
    var its=r.compras_online_itens||r.itens;
    if(its)c.itens=its.slice().sort(function(a,b){return (a.ordem||0)-(b.ordem||0)}).map(function(i){return {id:i.id,descricao:i.descricao,codigo:i.codigo,qtd:n(i.qtd),unitario:n(i.unitario),total:n(i.total),desconto:n(i.desconto)||0,
      categoria:i.categoria,imagem_path:i.imagem_path,natureza:i.natureza==null?null:i.natureza,total_linha:n(i.total_linha),situacao:i.situacao==null?null:i.situacao}});
    return c}
  /* ===== Gravação atômica (Lote 5.1, etapa 1): o que o site manda para compras_gravar (migration 030) e como entender o erro =====
     Só funções puras (sem rede, sem tela, sem banco): montam o JSON da RPC e traduzem os erros do PostgreSQL. As listas são as da RPC
     (tests/compras_gravar.test.mjs compara com o SQL da 030). Nenhuma regra financeira aqui: os valores passam como vieram. */
  var CO_GRAVAR_CAMPOS=["id","loja","canal","natureza","historico","numero","data","vendedor","status","subtotal","desconto","frete","taxas","impostos_info","total_pago","pagamento","categoria","recorrencia_texto","recorrencia_meses","recorrencia_status","chave_nfe","numero_nf","emitente","cnpj","fora_das_contas","motivo_fora","divergencias","observacoes","origem","importacao_id"];
  var CO_GRAVAR_ITEM=["codigo","descricao","qtd","unitario","total","desconto","categoria","imagem_path","natureza","total_linha","situacao"];
  var CO_GRAVAR_DOC=["tipo","nome","path","mime","tamanho","sha256","extraido"];
  var CO_DOC_TIPOS=["resumo_pdf","danfe","nfe_xml","csv","zip","email_confirmacao","email_envio","email_entrega","email_pagamento","email_cancelamento","email_reembolso","imagem","foto_produto","comprovante","outro"];
  /* o formulário só mexe nestes campos; origem, histórico e importação a RPC não deixa mudar na edição; os campos da nota vêm do documento (cand) */
  var CO_GRAVAR_PROTEGIDOS=["origem","historico","importacao_id"],CO_GRAVAR_FORM=["loja","numero","data","vendedor","pagamento","categoria","observacoes","subtotal","desconto","frete","taxas","total_pago"],
    CO_GRAVAR_FISCAL=["chave_nfe","numero_nf","emitente","cnpj"],CO_GRAVAR_NOVO=["canal","natureza","historico","status","impostos_info","importacao_id"];
  /* como o dado entrou (compras_online.origem), pelo tipo do documento que o originou */
  function coOrigemDe(cand){var t=cand&&cand.tipo;return t?({resumo_pdf:"pdf",danfe:"pdf",resumo:"pdf",nfe_xml:"xml",csv:"csv",imagem:"imagem"})[t]||(/^email_/.test(t)?"email":"manual"):"manual"}
  /* um produto no formato da RPC (sem compra_id nem ordem: a RPC põe). unitario já gravado é mantido; sem ele, total ÷ quantidade, como o site sempre fez */
  function coItemGravar(i){i=i||{};var q=+i.qtd>0?+i.qtd:1,o={descricao:String(i.descricao==null?"":i.descricao).trim().slice(0,200),qtd:q,total:i.total,desconto:i.desconto||0};
    o.unitario=i.unitario!==undefined?i.unitario:i.total!=null?Math.round(i.total/q*100)/100:null;
    ["codigo","categoria","imagem_path"].forEach(function(k){if(i[k]!==undefined)o[k]=i[k]});
    ["natureza","total_linha","situacao"].forEach(function(k){if(i[k]!=null)o[k]=i[k]});return o}
  /* O que vai para compras_gravar. ant = a compra já gravada (null = compra nova); form = o que o formulário coletou; cand = o que o documento trouxe;
     opc = {id (obrigatório na compra nova: o mesmo id em toda tentativa), divs (divergências novas)}.
     Edição: a base é a LINHA INTEIRA já gravada (a RPC substitui todas as colunas; campo que faltasse virava NULL ou falso) e só o que o formulário traz por cima:
       undefined = não mexeu (fica o gravado); null = o usuário limpou o campo. origem, historico e importacao_id vêm sempre do gravado.
     Compra nova: só o que o formulário e o documento trazem; canal, natureza, status, histórico e importação só se o documento disser. Devolve {id, p_novo, p_compra, p_itens}. */
  function coPayloadGravar(ant,form,cand,opc){form=form||{};opc=opc||{};var novo=!ant,id=ant?ant.id:opc.id,p={};
    if(!id)throw new Error("coPayloadGravar: falta o id da compra (opc.id) numa compra nova");
    if(ant)CO_GRAVAR_CAMPOS.forEach(function(k){if(ant[k]!==undefined)p[k]=ant[k]});
    CO_GRAVAR_FORM.forEach(function(k){if(form[k]!==undefined)p[k]=form[k]});
    if(form.recorrencia!==undefined){var r=form.recorrencia;p.recorrencia_texto=r?r.texto:null;p.recorrencia_meses=r&&r.meses!=null?r.meses:null;
      p.recorrencia_status=r?(ant&&ant.recorrencia_status?ant.recorrencia_status:"a_confirmar"):null}
    if(cand)CO_GRAVAR_FISCAL.forEach(function(k){if(cand[k])p[k]=cand[k]});
    if(novo){p.origem=coOrigemDe(cand);if(cand)CO_GRAVAR_NOVO.forEach(function(k){if(cand[k]!==undefined)p[k]=cand[k]})}
    p.divergencias=(ant&&Array.isArray(ant.divergencias)?ant.divergencias:[]).concat(opc.divs||[]);
    p.id=id;
    var its=form.itens!==undefined?form.itens:ant&&ant.itens?ant.itens:[],antIt=ant&&ant.itens||[],usado={};
    /* o imagem_path que já estava gravado no produto (mesma descrição) nunca se perde na edição, mesmo que o formulário não o traga */
    return {id:id,p_novo:novo,p_compra:p,p_itens:its.map(function(i){var o=coItemGravar(i),d=o.descricao;
      for(var j=0;j<antIt.length;j++)if(!usado[j]&&antIt[j]&&String(antIt[j].descricao==null?"":antIt[j].descricao).trim()===d){usado[j]=1;if(!o.imagem_path&&antIt[j].imagem_path)o.imagem_path=antIt[j].imagem_path;break}
      return o})}}
  /* um documento no formato da RPC: o texto bruto e o extraído passam por coLimparExtraido antes de gravar; tipo desconhecido vira "outro" (o tipo original fica em extraido) */
  function coDocPayload(d,path){d=d||{};var ext=d.ext?JSON.parse(JSON.stringify(d.ext)):{};if(d.extras)ext={pedidos:d.extras.map(function(e){return e.numero})};if(d.texto)ext.texto=String(d.texto).slice(0,20000);
    ext=coLimparExtraido(ext);var tipo=d.tipo==="resumo"?"resumo_pdf":d.tipo;if(CO_DOC_TIPOS.indexOf(tipo)<0){ext.tipo=ext.tipo||tipo;tipo="outro"}
    return {tipo:tipo,nome:String(d.nome==null?"":d.nome).slice(0,200),path:path,mime:d.mime==null?null:d.mime,tamanho:d.tamanho!=null?d.tamanho:d.blob&&d.blob.size!=null?d.blob.size:null,sha256:d.sha,extraido:ext}}
  /* só documentos numa compra que já existe (modo da RPC: p_itens nulo e p_compra só com o id): os campos da compra não mudam */
  function coPayloadSoDocs(id,docs){if(!id)throw new Error("coPayloadSoDocs: falta o id da compra");return {id:id,p_novo:false,p_compra:{id:id},p_itens:null,p_docs:docs||[]}}
  /* O "complemento" que o site manda a compras_anexar (035) ao anexar documento a uma compra que já existe: só o que a RPC aceita (mesmos formatos e limites da 035).
     O banco só preenche o que está VAZIO e só põe o status de aviso se a compra não tem status; aqui só se evita mandar o que a RPC recusaria (um valor ruim derrubaria o anexo inteiro).
     fontes = o que os documentos trouxeram; divs = divergências novas ({campo, texto}), sem repetir as que a compra já tem (o banco também não repete). */
  var CO_COMPLEMENTO_CAMPOS=["chave_nfe","numero_nf","emitente","cnpj","status","divergencias"];
  function coComplementoAnexo(ex,fontes,divs){ex=ex||{};var o={},ok={chave_nfe:function(v){return /^[0-9]{44}$/.test(v)},numero_nf:function(v){return v.length<=20},emitente:function(v){return v.length<=160},cnpj:function(v){return /^[0-9]{14}$/.test(v)}};
    (fontes||[]).forEach(function(e){if(!e)return;["chave_nfe","numero_nf","emitente","cnpj"].forEach(function(k){var v=e[k]==null?"":String(e[k]);if(!ex[k]&&!o[k]&&v&&ok[k](v))o[k]=v});
      if(!ex.status&&!o.status&&(e.tipo==="email_cancelamento"||e.tipo==="email_reembolso"))o.status=e.tipo==="email_cancelamento"?"cancelamento_informado":"reembolso_informado"});
    var ja=ex.divergencias||[],vistos={},novas=[];
    (divs||[]).forEach(function(x){var t=x&&x.texto!=null?String(x.texto).trim().slice(0,300):"";if(!t||vistos[t]||novas.length>=20||ja.some(function(y){return y&&y.texto===t}))return;vistos[t]=1;
      var d={texto:t};if(x.campo!=null&&String(x.campo).length>0&&String(x.campo).length<=40)d.campo=String(x.campo);novas.push(d)});
    if(novas.length)o.divergencias=novas;return o}
  /* divergências de documentos novos contra a compra que já existe: pedido diferente e valores diferentes (a mesma conta de coMesclar) */
  function coDivergenciasAnexo(c,docs){c=c||{};var div=[];
    (docs||[]).forEach(function(x){if(!x)return;if(x.ext&&x.ext.numero&&coNumeroPedido(x.ext.numero)!==coNumeroPedido(c.numero))div.push({campo:"numero",texto:"O documento "+x.nome+" é do pedido "+x.ext.numero+"."});
      var m=x.ext?coMesclar({subtotal:c.subtotal,desconto:c.desconto,frete:c.frete,total_pago:c.total_pago,divergencias:[]},x.ext):null;if(m)div=div.concat(m.divergencias)});return div}
  /* os argumentos de compras_anexar(p_id, p_docs, p_complemento) */
  function coPayloadAnexar(id,docs,complemento){if(!id)throw new Error("coPayloadAnexar: falta o id da compra");return {p_id:id,p_docs:docs||[],p_complemento:complemento||{}}}
  /* Os erros do PostgreSQL/PostgREST em português claro. Devolve {codigo, tipo, mensagem (para a tela), repetir (vale tentar de novo), tecnico (código | mensagem | detalhe | dica,
     para o diário de erros), original}. A mensagem original nunca se perde: vai em "tecnico" e em "original". */
  function coErroGravar(e){e=e||{};var cod=String(e.code||""),msg=String(e.message!=null?e.message:typeof e==="string"?e:""),det=e.details?String(e.details):"",dica=e.hint?String(e.hint):"",
      tec=[cod,msg,det,dica].filter(Boolean).join(" | "),t=norm(msg+" "+det),rpc=msg.replace(/^compras_(?:gravar_com_foto|gravar|anexar):\s*/,""),
      r=function(tipo,m,rep){return {codigo:cod||null,tipo:tipo,mensagem:m,repetir:!!rep,tecnico:tec,original:msg}};
    if(!cod&&/failed to fetch|networkerror|network request failed|load failed|timeout|timed out|offline/.test(t))return r("rede","Sem conexão com o servidor. Nada foi gravado: tente de novo quando a internet voltar.",true);
    if(cod==="23505"){
      if(/compras_online_pedido_unico/.test(t))return r("duplicado_pedido","Este pedido já está registrado (mesma loja e mesmo número). Abra a compra existente e use “Adicionar documento”.");
      if(/compras_online_nfe_unica/.test(t))return r("duplicado_nfe","Já existe uma compra com esta nota fiscal (mesma chave de acesso). Nada foi gravado.");
      if(/compras_online_docs_arquivo_unico/.test(t))return r("duplicado_documento","Este documento (o mesmo arquivo) já está guardado em outra compra. Nada foi gravado.");
      if(/compras_online_pkey/.test(t))return r("duplicado_id","Esta compra já foi gravada (toque duplo?). Atualize a lista para vê-la.");
      return r("duplicado","Já existe um registro igual a este. Nada foi gravado.")}
    if(cod==="22023"){
      if(/nao esta no cofre/.test(t))return r("arquivo_ausente","Um arquivo não chegou ao cofre. Nada foi gravado: envie os arquivos de novo.",true);
      if(/fora da pasta/.test(t))return r("arquivo_fora_da_pasta","Um arquivo está fora da pasta desta compra. Nada foi gravado.");
      if(/(origem|historico|importacao_id) nao muda/.test(t))return r("campo_protegido","Origem, histórico e importação não mudam depois de gravados. Nada foi gravado.");
      if(/campo nao permitido/.test(t))return r("campo_invalido","Um campo não aceito pelo banco foi enviado ("+rpc+"). Nada foi gravado.");
      return r("dados_invalidos","Dados inválidos: "+(rpc||"confira os valores")+". Nada foi gravado.")}
    if(cod==="42501"){
      if(/faca login/.test(t))return r("sessao","A sessão expirou: entre de novo para gravar.");
      return r("permissao","Sem permissão para gravar. Confirme a 2ª etapa (código) ou entre de novo.")}
    if(cod==="P0002"){
      if(/arquivo|cofre|objeto/.test(t))return r("arquivo_nao_encontrado","O arquivo não foi encontrado no cofre. Envie de novo.",true);
      return r("nao_encontrado","A compra não foi encontrada (talvez tenha sido apagada em outro aparelho). Atualize a lista.")}
    if(cod==="23514"){
      if(/compras_online_conta_fecha/.test(t))return r("conta","A conta não fecha: o total pago precisa ser subtotal − desconto + frete + taxas (folga de 2 centavos).");
      if(/reembolsado/.test(t))return r("reembolso","O total pago não pode ficar abaixo do que já foi reembolsado.");
      return r("regra_do_banco","O banco recusou um valor (regra de conferência). Nada foi gravado.")}
    if(cod==="23503")return r("vinculo","Esta compra tem registros ligados (como reembolsos) e não pode ser apagada.");
    return r("desconhecido","Não consegui gravar"+(cod?" (código "+cod+")":"")+". Nada foi salvo e os dados continuam na tela.")}
  /* recorrências: a informada no documento (a confirmar) e a percebida (o mesmo produto comprado 2+ vezes, com o intervalo médio).
     A próxima data é só uma estimativa para conferir: nenhuma compra é criada. */
  function coRecorrencias(compras,hoje){var por={},L=[];
    (compras||[]).forEach(function(c){(c.itens||[]).forEach(function(i){var k=alChaveProduto(i.descricao);if(!k)return;(por[k]=por[k]||{nome:i.descricao,datas:[],compras:[]}).datas.push(c.data);por[k].compras.push(c)})});
    Object.keys(por).forEach(function(k){var p=por[k],d=p.datas.slice().sort(),inf=null,dona=null;p.compras.forEach(function(c){if(c.recorrencia_texto&&!inf){inf={texto:c.recorrencia_texto,meses:c.recorrencia_meses,status:c.recorrencia_status||"a_confirmar"};dona=c}});
      var int=[];for(var i=1;i<d.length;i++)int.push(diasEntre(d[i-1],d[i]));var media=int.length?Math.round(int.reduce(function(a,b){return a+b},0)/int.length):null;
      if(!inf&&d.length<2)return;var ult=d[d.length-1],passo=inf&&inf.meses&&inf.meses%1?Math.round(inf.meses*30.44):media,meses=inf&&inf.meses&&!(inf.meses%1)?inf.meses:0;
      L.push({produto:p.nome,vezes:d.length,ultima:ult,informada:inf,compra:dona,intervaloDias:media,proximaEstimada:inf&&inf.status==="descartada"?null:meses?coMaisMeses(ult,meses):passo?somaDiasISO(ult,passo):null})});
    return L.sort(function(a,b){return (a.proximaEstimada||"9")<(b.proximaEstimada||"9")?-1:1})}
  /* soma meses de calendário (31/01 + 1 mês = 28 ou 29/02) */
  function coMaisMeses(iso,n){var y=+iso.slice(0,4),m=+iso.slice(5,7)-1+n,d=+iso.slice(8,10);y+=Math.floor(m/12);m=((m%12)+12)%12;var fim=new Date(Date.UTC(y,m+1,0)).getUTCDate();
    return y+"-"+(m<9?"0":"")+(m+1)+"-"+(Math.min(d,fim)<10?"0":"")+Math.min(d,fim)}
  /* histórico de preço por produto (pela chave padrão do nome): última, menor e variação.
     Preço pago = (total do item − desconto do item) ÷ quantidade; sem total, o unitário menos o desconto por unidade. O desconto geral do pedido (cupom) NÃO é rateado
     entre os itens: não há como saber a que item ele pertence.
     Quem entra: pedido confirmado (inclusive com cancelamento ou reembolso apenas INFORMADO), fora das contas, histórico físico e digital e compra de outro módulo; a origem
     fica em cada ponto (origem: módulo, canal, histórico, natureza, tratamento, fora_das_contas) e em "origens" (contagem por módulo), para distinguir. Quem sai: pedido
     cancelado, pedido pendente (autorizado ou status desconhecido) e item cancelado, autorizado ou desconhecido. Reembolso nunca apaga o preço: o ponto leva reembolso "informado" ou
     "recebido" e, no recebido, o evento (valor, mês) vem separado em "eventos" (só os reembolsos válidos de coReembCreditos, passados em "reembolsos").
     "base" é o preço por litro ou quilo (alPrecoBase), só quando todas as compras do produto têm o tamanho no nome, na mesma unidade, e o nome não indica pacote ou kit
     (nesse caso o tamanho do nome não é o da unidade): sem informação suficiente, fica null e nada é inventado. */
  /* valor do item: total (ou unitário × qtd) menos o desconto do próprio item; é o que coPrecos e o detalhe usam (nenhum outro cálculo de item) */
  function coItemTotal(i){i=i||{};var q=+i.qtd>0?+i.qtd:1,b=0;
    if(i.total!=null&&i.total!==""&&isFinite(+i.total))b=+i.total;else if(i.unitario!=null&&i.unitario!==""&&isFinite(+i.unitario))b=+i.unitario*q;
    return amR2(b-(+i.desconto||0))}
  /* Resumo de UM produto de coPrecos para a tela (nenhuma regra nova: só soma o que coPrecos já calculou por compra, qtd e total líquido).
     periodo  as compras com data >= ini (os 12 meses do Resumo): gasto, qtd, media (gasto/qtd), compras;
     lojas    todo o histórico, uma linha por loja (loja_chave, a mesma das barras do Resumo): compras, qtd, gasto, media, menor, ultimo, ultima;
              ordenadas pelo último preço (a mais barata primeiro), como "Onde saiu mais barato" do Mercado. */
  function coProdutoResumo(p,ini){var l=(p&&p.historico)||[],ja=l.filter(function(x){return !ini||x.d>=ini}),g=0,q=0,por={},ks=[];
    ja.forEach(function(x){g+=x.total;q+=x.qtd});g=amR2(g);q=Math.round(q*1000)/1000;
    l.forEach(function(x){var k=x.loja_chave||x.loja||"",o=por[k];if(!o){o=por[k]={loja:k,compras:0,qtd:0,gasto:0,menor:null,ultimo:null,ultima:null};ks.push(k)}
      o.compras++;o.qtd+=x.qtd;o.gasto=amR2(o.gasto+x.total);o.menor=o.menor==null?x.u:Math.min(o.menor,x.u);o.ultimo=x.u;o.ultima=x.d});
    var lojas=ks.map(function(k){var o=por[k];o.qtd=Math.round(o.qtd*1000)/1000;o.media=o.qtd>0?amR2(o.gasto/o.qtd):null;return o}).sort(function(a,b){return a.ultimo-b.ultimo||(a.loja<b.loja?-1:1)});
    return {periodo:{ini:ini||null,gasto:g,qtd:q,media:q>0?amR2(g/q):null,compras:ja.length},lojas:lojas}}
  function coPrecoLiquido(i){var q=+i.qtd>0?+i.qtd:1,d=+i.desconto||0,u=null;
    if(i.total!=null&&i.total!==""&&isFinite(+i.total))u=(+i.total-d)/q;else if(i.unitario!=null&&i.unitario!==""&&isFinite(+i.unitario))u=+i.unitario-d/q;
    return u==null||!isFinite(u)?null:Math.round(u*100)/100}
  function coMultipack(nome){return /\d\s*x\s*\d|\bx\s*\d|\b(?:kit|pack|combo|caixa com|cx)\b|\bc\s*\/\s*\d|\b\d+\s*(?:un|und|unid|unidades?|latas?|garrafas?|pacotes?|pcs?|pecas?|potes?|saches?|capsulas?|tabletes?|comprimidos?|doses?)\b/.test(" "+norm(nome)+" ")}
  function coPedidoNoPreco(c){return !!c&&coSituacao(c)==="efetiva"}
  function coItemNoPreco(i){var s=norm(i&&(i.status_norm||i.situacao)||"");return !!i&&s!=="cancelado"&&s!=="autorizado"&&s!=="desconhecido"}
  function coPrecos(compras,reembolsos){var por={},ev={};
    if(reembolsos&&reembolsos.length)coReembCreditos(reembolsos,compras).creditos.forEach(function(x){if(x.compra_id)(ev[x.compra_id]=ev[x.compra_id]||[]).push({tipo:"reembolso_recebido",valor:x.valor,mes:x.mes,recebido_em:x.recebido_em,reembolso_id:x.reembolso_id})});
    (compras||[]).forEach(function(c){if(!coPedidoNoPreco(c))return;var k0=coClassificar(c),origem={modulo:k0.modulo,canal:k0.canal,historico:k0.historico,natureza:k0.natureza,tratamento:k0.tratamento,fora_das_contas:!!c.fora_das_contas},
        eventos=(c.id&&ev[c.id])||[],reemb=eventos.length?"recebido":norm(c.status||"")==="reembolso_informado"?"informado":null;
      (c.itens||[]).forEach(function(i){if(!coItemNoPreco(i))return;
        var k=alChaveProduto(i.descricao),u=coPrecoLiquido(i);if(!k||u==null||!(u>=0))return;
        (por[k]=por[k]||{nome:i.descricao,l:[],img:null}).l.push({d:c.data,u:u,loja:c.vendedor||CO_LOJAS[c.loja],b:coMultipack(i.descricao)?null:alPrecoBase(i.descricao,u),origem:origem,reembolso:reemb,eventos:eventos,
          qtd:+i.qtd>0?+i.qtd:1,total:coItemTotal(i),compra_id:c.id||null,numero:c.numero||null,loja_chave:coLojaDe(c)});if(i.imagem_path&&!por[k].img)por[k].img=i.imagem_path})});
    return Object.keys(por).map(function(k){var p=por[k],l=p.l.sort(function(a,b){return a.d<b.d?-1:1}),u=l[l.length-1],base=null,og={};
      l.forEach(function(x){og[x.origem.modulo]=(og[x.origem.modulo]||0)+1});
      if(l.every(function(x){return x.b&&x.b.por===l[0].b.por})){var bs=l.map(function(x){return x.b.v});base={por:l[0].b.por,ultimo:bs[bs.length-1],menor:Math.min.apply(null,bs),variacao:bs.length>1&&bs[0]>0?(bs[bs.length-1]-bs[0])/bs[0]*100:null}}
      var gasto=amR2(l.reduce(function(s,x){return s+x.total},0)),qt=Math.round(l.reduce(function(s,x){return s+x.qtd},0)*1000)/1000;
      return {chave:k,nome:p.nome,img:p.img,gasto:gasto,qtd:qt,media:qt>0?amR2(gasto/qt):null,vezes:l.length,ultimo:u,menor:Math.min.apply(null,l.map(function(x){return x.u})),variacao:l.length>1&&l[0].u>0?(u.u-l[0].u)/l[0].u*100:null,base:base,origens:og,outros_modulos:l.length-(og.compras||0),historico:l}})
      .sort(function(a,b){return b.vezes-a.vezes||(a.nome<b.nome?-1:1)})}
  /* ===== Compras multiorigem (Lote 2) =====
     O canal diz de onde veio a compra; natureza (física/digital) e histórico dizem o tratamento. Registro antigo, sem canal, continua
     valendo pela loja: nada do que já está gravado muda de significado. Supermercado fica no Mercado e combustível em Veículos. */
  var CO_CANAIS={amazon:"Amazon",shopee:"Shopee",mercado_livre:"Mercado Livre",outro_marketplace:"Outro marketplace",presencial:"Loja presencial"};
  var CO_LOJA_CANAL={amazon:"amazon",shopee:"shopee",mercadolivre:"mercado_livre",magalu:"outro_marketplace",outra:"outro_marketplace"};
  var CO_CAT_DIGITAL="Compras online · Digital";
  function coCanalDe(c){c=c||{};if(CO_CANAIS[c.canal])return c.canal;return CO_LOJA_CANAL[c.loja]||"outro_marketplace"}
  /* "segmento" NÃO é coluna do banco. Num dado do Supabase ele é deduzido só de campos que existem: compra de canal "presencial" cuja categoria é Supermercado/Mercado
     (→ Mercado) ou Combustível/Abastecimento (→ Veículos). Compra online (Amazon, Shopee, Mercado Livre…) nunca é deduzida: fica em Compras. Um "segmento" explícito (qualquer valor preenchido) prevalece e nunca é deduzido:
     supermercado/combustivel levam ao módulo; qualquer outro valor mantém em Compras. Quem lê do banco precisa trazer canal e categoria no select. */
  function coSegmentoDe(c){c=c||{};var e=c.segmento==null?"":norm(c.segmento).trim();if(e)return e==="supermercado"||e==="combustivel"?e:null;if(c.canal!=="presencial")return null;
    var k=norm(c.categoria||"").trim();return /^(supermercado|mercado)$/.test(k)?"supermercado":/^(combustivel|combustiveis|abastecimento)$/.test(k)?"combustivel":null}
  function coModuloDestino(c){var s=coSegmentoDe(c);return s==="supermercado"?"mercado":s==="combustivel"?"veiculos":"compras"}
  function amR2(x){return Math.round(x*100)/100}
  /* Situação do pedido para as despesas (decisão de 06/11/2026):
     - cancelada: não contabiliza;
     - pendente: "autorizado" (cobrança só autorizada) e status desconhecido de histórico: fora das despesas efetivas até virar efetivado;
     - efetiva: compra confirmada, enviada ou entregue ("concluido" do histórico).
     Registro antigo continua igual: sem status (confirmada pelo dono), "cancelamento_informado" e "reembolso_informado" seguem como despesa
     até o dono confirmar o cancelamento. Status desconhecido nunca vira compra efetivada sozinho no histórico. */
  var CO_STATUS_EFETIVO={concluido:1,efetivado:1,efetivada:1,enviado:1,enviada:1,entregue:1,delivered:1,shipped:1,closed:1};
  function coSituacao(c){c=c||{};var s=norm(c.status_norm||c.status||"").trim();
    if(s==="cancelado"||s==="cancelada")return "cancelada";
    if(s==="autorizado"||s==="autorizada"||s==="authorized"||s==="desconhecido")return "pendente";
    if(c.historico===true||c.origem==="historico_amazon")return CO_STATUS_EFETIVO[s]?"efetiva":"pendente";
    return "efetiva"}
  /* tratamento financeiro de um registro de Compras:
     - despesa: entra nas despesas gerais pelo total pago (compra atual efetiva, de qualquer canal, e registro antigo);
     - pendente: autorizado ou status desconhecido; guarda o valor em valor_pendente e não entra nas despesas;
     - cancelado: não contabiliza;
     - referencia_historica: Amazon físico histórico, só nos indicadores da Amazon (nunca nas despesas gerais, qualquer que seja o status);
     - despesa_digital: Amazon digital histórico efetivado: entra sozinho em "Compras online · Digital";
     - misto: histórico com itens digitais efetivados e físicos (só a parte digital entra);
     - outro_modulo: supermercado/combustível, que não são contados em Compras.
     Histórico Amazon sem natureza identificada fica como referência até alguém revisar (nunca entra por engano). */
  /* natureza do pedido (digital ou fisica); qualquer outro valor é "não identificada" (null) */
  function coNatureza(c){c=c||{};return c.natureza==="digital"||c.natureza==="fisica"?c.natureza:null}
  /* destino de UM item de pedido histórico da Amazon, pela mesma regra de coClassificar (que usa esta função):
     cancelado (fora de tudo); digital (despesa); pendente (digital autorizado/desconhecido); referencia (físico); indefinido (natureza não identificada). v = valor da linha. */
  function coItemHist(i,nat){i=i||{};var n=i.natureza||nat,v=+(i.total_linha!=null?i.total_linha:i.total)||0,st=norm(i.status_norm||i.situacao||""),d;
    if(st==="cancelado")d="cancelado";else if(n==="digital")d=st==="autorizado"||st==="desconhecido"?"pendente":"digital";else if(n==="fisica")d="referencia";else d="indefinido";
    return {destino:d,v:v}}
  function coClassificar(c){c=c||{};var canal=coCanalDe(c),total=+c.total_pago,av=[],hist=c.historico===true||c.origem==="historico_amazon",
      nat=coNatureza(c),mod=coModuloDestino(c),sit=coSituacao(c);if(!isFinite(total))total=0;
    var o={canal:canal,modulo:mod,historico:hist,natureza:nat,situacao:sit,tratamento:"despesa",valor_despesa:total,valor_referencia:0,valor_pendente:0,categoria:null,avisos:av};
    if(mod!=="compras"){o.tratamento="outro_modulo";o.valor_despesa=0;av.push("Este registro pertence ao módulo "+(mod==="mercado"?"Mercado":"Veículos")+", não a Compras.");return o}
    if(sit==="cancelada"){o.tratamento="cancelado";o.valor_despesa=0;return o}
    if(hist&&canal==="amazon"){var dig=0,ref=0,ind=0,aut=0;
      /* item cancelado fica fora; item AUTORIZADO ou DESCONHECIDO (digital) é pendente mesmo dentro de pedido concluído: o valor dele não é despesa até ser efetivado.
         Físico autorizado ou desconhecido continua só referência (físico histórico nunca é despesa). O banco grava a situação do item em "situacao" (o importador, em "status_norm"). */
      (c.itens||[]).forEach(function(i){var x=coItemHist(i,nat);
        if(x.destino==="digital")dig+=x.v;else if(x.destino==="pendente")aut+=x.v;else if(x.destino==="referencia")ref+=x.v;else if(x.destino==="indefinido")ind+=x.v});
      if(!(dig+ref+ind+aut>0)){if(nat==="digital")dig=total;else if(nat==="fisica")ref=total;else ind=total}
      if(ind>0)av.push("Natureza (física ou digital) não identificada: fica só como referência até ser revisada.");
      o.valor_referencia=amR2(ref+ind);
      if(sit==="pendente"){o.valor_pendente=amR2(dig+aut);o.valor_despesa=0;av.push("Pedido autorizado ou com status desconhecido: fora das despesas até ser efetivado.")}
      else{o.valor_despesa=amR2(dig);if(aut>0){o.valor_pendente=amR2(aut);av.push("Item autorizado ou desconhecido em pedido concluído: o valor dele fica pendente, fora das despesas, até ser efetivado.")}}
      o.tratamento=o.valor_despesa>0&&o.valor_referencia>0?"misto":o.valor_despesa>0?"despesa_digital":o.valor_pendente>0?"pendente":"referencia_historica";if(dig>0)o.categoria=CO_CAT_DIGITAL;return o}
    if(sit==="pendente"){o.tratamento="pendente";o.valor_pendente=total;o.valor_despesa=0;av.push("Pedido autorizado ou com status desconhecido: fora das despesas até ser efetivado.")}
    return o}

  /* ===== Histórico Amazon (Solicitar seus dados) =====
     Colunas reais do "Order History.csv": Total Amount, Original Quantity, Payment Method Type (os nomes antigos continuam aceitos).
     Total Amount é o valor de CADA linha de item: o total do pedido é a soma das linhas, nunca o valor repetido. */
  var AM_COLUNAS={id:["order id","order number","numero do pedido","pedido"],data:["order date","data do pedido","data"],nome:["product name","nome do produto","produto","descricao"],
    qtd:["original quantity","quantity","quantidade"],un:["unit price","preco unitario"],imp:["unit price tax","imposto unitario","imposto"],tot:["total amount","total owed","valor total","total"],
    frete:["shipping charge","frete"],desc:["total discounts","descontos","desconto"],pag:["payment method type","payment instrument type","forma de pagamento","pagamento"],
    asin:["asin","codigo","sku"],site:["website","loja"],status:["order status","status"],envio:["shipment status"],dataenvio:["ship date"],opcao:["shipping option"],
    rastreio:["carrier name & tracking number","carrier name and tracking number","tracking number","carrier"],natureza:["natureza"]};
  var AM_OBRIG=["id","data","nome","tot"],AM_NOMES={id:"Order ID",data:"Order Date",nome:"Product Name",tot:"Total Amount"};
  /* campos permitidos no CSV reconstruído (lista explícita: o que não está aqui nunca sai do arquivo original) */
  var AM_CAMPOS_SAIDA=["pedido","data","status","natureza","produto","asin","quantidade","preco_unitario","imposto","frete","desconto","total","pagamento"];
  function amCab(c){return norm(c).replace(/[_\s]+/g," ").trim()}
  function amMapear(cab){var C={},usados={},ig=[],ausentes=[];
    Object.keys(AM_COLUNAS).forEach(function(k){C[k]=-1;for(var i=0;i<AM_COLUNAS[k].length;i++){var x=cab.indexOf(AM_COLUNAS[k][i]);if(x>=0){C[k]=x;usados[x]=1;break}}});
    cab.forEach(function(c,i){if(!usados[i]&&c)ig.push(c)});AM_OBRIG.forEach(function(k){if(C[k]<0)ausentes.push(AM_NOMES[k])});
    return {C:C,ausentes:ausentes,ignorados:ig}}
  /* valor com sinal: "1.234,56", "136.42", "-R$ 5,00", "Not Applicable" (→ null) */
  function amValor(v){if(v==null)return null;var s=String(v).replace(/R\$|\s| /g,"");if(!s||/^(n\/a|na|notapplicable|naoseaplica|-)$/i.test(norm(s)))return null;
    var neg=/^[-−–(]/.test(s);s=s.replace(/^[-−–(]|\)$/g,"");if(!/^[\d.,]+$/.test(s))return null;if(/^\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,"");
    var n=coNum(s);return n==null?null:neg?-n:n}
  function amData(t,hoje){var d=coData(t);if(!d)return null;var y=+d.slice(0,4),m=+d.slice(5,7),dia=+d.slice(8,10);if(y<1995||m<1||m>12||dia<1||dia>31)return null;if(hoje&&d>hoje)return null;return d}
  function amStatus(t){var s=norm(t);if(!s.trim())return "desconhecido";if(/cancel/.test(s))return "cancelado";if(/authori[sz]ed|autoriz/.test(s))return "autorizado";
    if(/closed|conclu|entreg|deliver|shipped|enviad|fechad|complete/.test(s))return "concluido";return "desconhecido"}
  /* física, digital ou indefinida: arquivo/site/opção de envio "digital" → digital; rastreio, data de envio ou status de entrega → física;
     "não se aplica" no envio ou produto de leitura/streaming → digital; sem sinal nenhum → indefinida (vai para revisão, não para as despesas) */
  function amNatureza(L,arq,cancelada){var d=norm(L.natureza||"");if(d==="digital"||d==="fisica")return d;
    var site=norm(L.site),a=norm(arq||""),op=norm(L.opcao),env=norm(L.envio),de=norm(L.dataenvio);
    if(/digital/.test(a)||/digital/.test(site)||/digital/.test(op))return "digital";
    if(String(L.rastreio||"").trim()||/delivered|shipped|entregue|enviado|in transit|a caminho|out for delivery/.test(env)||(de.trim()&&!/n\/a|not applicable|nao se aplica/.test(de)))return "fisica";
    if(!cancelada&&(/not applicable|n\/a|nao se aplica/.test(env)||/\b(e-?book|kindle edition|edicao kindle|prime video|audible|amazon music|assinatura|aplicativo)\b/.test(norm(L.nome))))return "digital";
    return "indefinida"}
  function amPagamento(raw){raw=String(raw||"").trim();if(!raw)return null;return (coPagamento(raw)||raw.replace(/\d{5,}/g,"").trim()||null)}
  /* lê o CSV: um pedido por número, itens agrupados; linha inválida vai para `invalidas` e o resto segue; nunca lança erro */
  function amLerHistorico(txt,opc){opc=opc||{};var r={ok:false,erro:null,pedidos:[],invalidas:[],avisos:[],cabecalhos_ausentes:[],cabecalhos_ignorados:[],linhas:0},L=csvLinhas(txt);
    if(L.length<2){r.erro="Arquivo vazio ou sem linhas de pedido.";return r}
    var m=amMapear(L[0].map(amCab)),C=m.C;r.cabecalhos_ausentes=m.ausentes;r.cabecalhos_ignorados=m.ignorados;
    if(m.ausentes.length){r.erro="Cabeçalhos obrigatórios ausentes: "+m.ausentes.join(", ")+".";return r}
    if(C.qtd<0)r.avisos.push("Sem coluna de quantidade: cada linha foi contada como 1 unidade.");
    function g(row,k){return C[k]>=0&&row[C[k]]!=null?String(row[C[k]]).trim():""}
    var por={},ordem=[];
    L.slice(1).forEach(function(row,ix){r.linhas++;var n=ix+1;function inv(t){r.invalidas.push({linha:n,motivo:t})}
      var id=g(row,"id");if(!id){inv("sem número do pedido");return}if(!/^[A-Za-z0-9-]{5,40}$/.test(id)){inv("número do pedido inválido");return}
      var dt=amData(g(row,"data"),opc.hoje);if(!dt){inv("data do pedido ausente ou inválida");return}
      var nome=g(row,"nome");if(!nome){inv("sem nome do produto");return}
      var tot=amValor(g(row,"tot"));if(tot==null){inv("valor total ausente ou inválido");return}if(tot<0){inv("valor negativo (reembolso não é compra)");return}
      var q=1,qa=[];if(C.qtd>=0){var qr=g(row,"qtd");if(!qr){qa.push("Quantidade ausente: assumida 1.")}else{q=amValor(qr);if(q==null||q<=0||q%1){inv("quantidade inválida");return}}}
      var un=amValor(g(row,"un")),imp=amValor(g(row,"imp"))||0,fr=Math.abs(amValor(g(row,"frete"))||0),de=Math.abs(amValor(g(row,"desc"))||0),st=amStatus(g(row,"status")),av=qa.slice(),sub,fecha=true;
      if(un!=null){sub=amR2(un*q);var t1=amR2(imp*q);
        if(Math.abs(sub+t1+fr-de-tot)<=0.02)imp=t1;else if(Math.abs(sub+imp+fr-de-tot)<=0.02)imp=amR2(imp);else{imp=t1;fecha=false;av.push("A conta da linha não fecha com o Total Amount (usado como valor pago).")}}
      else{imp=amR2(imp*q);sub=amR2(tot-imp-fr+de);av.push("Sem preço unitário: subtotal derivado do total.")}
      var nat=amNatureza({natureza:g(row,"natureza"),site:g(row,"site"),opcao:g(row,"opcao"),envio:g(row,"envio"),dataenvio:g(row,"dataenvio"),rastreio:g(row,"rastreio"),nome:nome},opc.arquivo,st==="cancelado");
      var p=por[id];if(!p){p=por[id]={tipo:"csv",origem:"historico_amazon",historico:true,loja:"amazon",canal:"amazon",numero:id,data:dt,data_original:g(row,"data"),status:g(row,"status")||null,status_norm:"desconhecido",natureza:"indefinida",
        pagamento:amPagamento(g(row,"pag")),categoria:null,itens:[],subtotal:0,desconto:0,frete:0,taxas:0,total_pago:0,avisos:[],_fecha:[],_tot:[]};ordem.push(id)}
      else{if(dt<p.data){p.data=dt;p.data_original=g(row,"data")}if(!p.pagamento)p.pagamento=amPagamento(g(row,"pag"))}
      p.itens.push({descricao:nome.slice(0,160),codigo:g(row,"asin")||null,qtd:q,unitario:un,total:sub,total_linha:amR2(tot),desconto:0,impostos:imp,frete:amR2(fr),desconto_linha:amR2(de),
        categoria:coCategoria(nome),natureza:nat,status:g(row,"status")||null,status_norm:st,avisos:av});p._fecha.push(fecha);p._tot.push(amR2(tot))});
    ordem.forEach(function(id){var p=por[id],vivos=p.itens.filter(function(i){return i.status_norm!=="cancelado"}),ns={};
      /* todas as linhas com o mesmo total e nenhuma fechando a conta: é o total do pedido repetido em cada linha; conta uma vez só */
      var repetido=vivos.length>1&&vivos.every(function(i){return i.total_linha===vivos[0].total_linha})&&p._fecha.every(function(f){return !f});
      vivos.forEach(function(i){p.subtotal+=i.total;p.desconto+=i.desconto_linha;p.frete+=i.frete;p.taxas+=i.impostos;p.total_pago+=i.total_linha;ns[i.natureza]=1});
      if(repetido){p.total_pago=vivos[0].total_linha;p.avisos.push("O mesmo total aparece em todas as linhas do pedido: contado uma vez só.")}
      ["subtotal","desconto","frete","taxas","total_pago"].forEach(function(k){p[k]=amR2(p[k])});
      var ks=Object.keys(ns);p.natureza=!ks.length?(p.itens[0]?p.itens[0].natureza:"indefinida"):ks.length===1?ks[0]:"mista";
      p.status_norm=!vivos.length?"cancelado":vivos.some(function(i){return i.status_norm==="autorizado"})?"autorizado":vivos.every(function(i){return i.status_norm==="concluido"})?"concluido":"desconhecido";
      if(p.natureza==="digital")p.categoria=CO_CAT_DIGITAL;
      p.itens.forEach(function(i){i.avisos.forEach(function(a){if(p.avisos.indexOf(a)<0)p.avisos.push(a)})});
      p.tratamento=coClassificar(p).tratamento;delete p._fecha;delete p._tot;r.pedidos.push(p)});
    if(r.invalidas.length)r.avisos.push(r.invalidas.length+(r.invalidas.length===1?" linha foi ignorada":" linhas foram ignoradas")+" por estarem incompletas ou inválidas.");
    r.ok=true;return r}
  /* compatível com a tela atual: um pedido por número, cancelados fora */
  function coLerCSV(txt){var r=amLerHistorico(txt);return r.pedidos.filter(function(p){return p.status_norm!=="cancelado"})}
  /* indicadores da Amazon: o histórico físico e o digital ficam separados; cancelado não conta */
  function amIndicadores(pedidos){var o={pedidos:0,cancelados:0,itens:0,unidades:0,valor:0,valor_pendente:0,primeiro:null,ultimo:null,por_natureza:{},por_status:{},por_mes:[],por_ano:[],produtos:[]},mes={},ano={},prod={},nat={};
    function bloco(){return {pedidos:0,itens:0,unidades:0,valor:0}}
    (pedidos||[]).forEach(function(p){if(!p)return;o.por_status[p.status_norm]=(o.por_status[p.status_norm]||0)+1;if(p.status_norm==="cancelado"){o.cancelados++;return}
      o.pedidos++;if(!o.primeiro||p.data<o.primeiro)o.primeiro=p.data;if(!o.ultimo||p.data>o.ultimo)o.ultimo=p.data;
      var m=p.data.slice(0,7),a=p.data.slice(0,4),vistoN={};mes[m]=mes[m]||{mes:m,pedidos:0,valor:0,fisica:0,digital:0,indefinida:0};ano[a]=ano[a]||{ano:a,pedidos:0,valor:0,fisica:0,digital:0,indefinida:0};mes[m].pedidos++;ano[a].pedidos++;
      p.itens.forEach(function(i){if(i.status_norm==="cancelado")return;var v=i.total_linha!=null?i.total_linha:i.total,n=i.natureza||"indefinida",b=nat[n]=nat[n]||bloco();
        if(!vistoN[n]){vistoN[n]=1;b.pedidos++}b.itens++;b.unidades+=i.qtd;b.valor+=v;o.itens++;o.unidades+=i.qtd;o.valor+=v;if(p.status_norm!=="concluido")o.valor_pendente+=v;
        mes[m].valor+=v;mes[m][n]+=v;ano[a].valor+=v;ano[a][n]+=v;
        var k=(alChaveProduto(i.descricao)||norm(i.descricao).slice(0,60))+"|"+n,pr=prod[k]=prod[k]||{chave:k.split("|")[0],nome:i.descricao,natureza:n,qtd:0,valor:0,pedidos:0,_p:{}};
        pr.qtd+=i.qtd;pr.valor+=v;if(!pr._p[p.numero]){pr._p[p.numero]=1;pr.pedidos++}})});
    Object.keys(nat).forEach(function(n){var b=nat[n];b.valor=amR2(b.valor);o.por_natureza[n]=b});o.valor=amR2(o.valor);o.valor_pendente=amR2(o.valor_pendente);
    o.por_mes=Object.keys(mes).sort().map(function(k){var x=mes[k];["valor","fisica","digital","indefinida"].forEach(function(f){x[f]=amR2(x[f])});return x});
    o.por_ano=Object.keys(ano).sort().map(function(k){var x=ano[k];["valor","fisica","digital","indefinida"].forEach(function(f){x[f]=amR2(x[f])});return x});
    o.produtos=Object.keys(prod).map(function(k){var x=prod[k];delete x._p;x.valor=amR2(x.valor);return x}).sort(function(a,b){return b.valor-a.valor||(a.nome<b.nome?-1:1)});
    return o}
  /* quais arquivos de dentro do ZIP interessam; imagens de entrega e o resto nem chegam a ser lidos */
  function amSelecionarArquivos(nomes){var usar=[],ignorar=[];
    (nomes||[]).forEach(function(n){var b=String(n||"").replace(/\\/g,"/");if(!b||/\/$/.test(b))return;var s=norm(b);
      if(/\.csv$/.test(s)&&!/__macosx\//.test(s)&&/order[ ._-]?history|digital[ ._-]?(orders?|items?)/.test(s))usar.push({nome:n,digital:/digital/.test(s)});
      else ignorar.push({nome:n,motivo:/\.(jpe?g|png|gif|webp|heic|bmp|pdf)$/.test(s)?"imagem ou documento sem uso na importação":/\.csv$/.test(s)?"CSV que não é de pedidos":"arquivo fora da importação"})});
    return {usar:usar,ignorar:ignorar}}
  /* vários arquivos {nome, texto} → pedidos (o mesmo pedido em dois arquivos vale uma vez) */
  function amImportar(arquivos,opc){opc=opc||{};var sel=amSelecionarArquivos((arquivos||[]).map(function(a){return a&&a.nome})),r={pedidos:[],arquivos_lidos:[],arquivos_ignorados:sel.ignorar,invalidas:[],avisos:[],erros:[]},visto={};
    sel.usar.forEach(function(u){var a=(arquivos||[]).filter(function(x){return x&&x.nome===u.nome})[0],l=amLerHistorico(a&&a.texto,{arquivo:u.nome,hoje:opc.hoje});
      if(!l.ok){r.erros.push({arquivo:u.nome,erro:l.erro});return}r.arquivos_lidos.push(u.nome);
      l.invalidas.forEach(function(x){r.invalidas.push({arquivo:u.nome,linha:x.linha,motivo:x.motivo})});
      l.pedidos.forEach(function(p){var k=coNumeroPedido(p.numero)+"|"+p.natureza;if(visto[k]){r.avisos.push("Pedido repetido entre arquivos, contado uma vez: "+p.numero);return}visto[k]=1;r.pedidos.push(p)})});
    return r}
  /* CSV reconstruído com a lista explícita de campos; endereço, telefone, coordenadas, destinatário, rastreio e o resto nunca saem do original.
     Texto livre (produto, status, pagamento) ainda passa pelo limpador de e-mail/CPF/telefone/CEP e contra fórmula de planilha. */
  function amCelula(v,texto){var s=v==null?"":String(v);if(texto){s=coLimparTokens(s);if(/^[=+\-@\t\r]/.test(s))s="'"+s}return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
  function amReconstruirCSV(txt,opc){var l=amLerHistorico(txt,opc),o={ok:l.ok,erro:l.erro,csv:null,campos:AM_CAMPOS_SAIDA.slice(),linhas:0,descartadas:l.invalidas.length,avisos:l.avisos.slice()};if(!l.ok)return o;
    var n2=function(v){return v==null?"":(+v).toFixed(2)},rows=[AM_CAMPOS_SAIDA.join(",")];
    l.pedidos.forEach(function(p){p.itens.forEach(function(i){rows.push([amCelula(p.numero,1),p.data,amCelula(i.status,1),i.natureza,amCelula(i.descricao,1),amCelula(i.codigo,1),i.qtd,n2(i.unitario),n2(i.impostos),n2(i.frete),n2(i.desconto_linha),n2(i.total_linha),amCelula(p.pagamento,1)].join(","));o.linhas++})});
    o.csv=rows.join("\n")+"\n";return o}
  /* confere que um CSV reconstruído tem só os campos permitidos e nenhum padrão de dado pessoal */
  function amAuditarSanitizado(csv){var L=csvLinhas(csv),ach=[];if(!L.length)return {ok:false,achados:["arquivo vazio"]};
    if(L[0].join(",")!==AM_CAMPOS_SAIDA.join(","))ach.push("cabeçalho fora da lista permitida");
    L.slice(1).forEach(function(r,i){if(r.length!==AM_CAMPOS_SAIDA.length)ach.push("linha "+(i+1)+": número de colunas diferente");
      r.forEach(function(c){if(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/.test(c)||/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(c)||/\b\d{5}-\d{3}\b/.test(c)||/\(\d{2}\)\s*9?\d{4}[\s.-]?\d{4}/.test(c)||/(^|\D)\d{11}(\D|$)/.test(c))ach.push("linha "+(i+1)+": possível dado pessoal")})});
    return {ok:!ach.length,achados:ach}}

  /* ===== Reembolsos da Amazon ===== Solicitado e aprovado NÃO são crédito: só o recebimento confirmado à mão, no mês em que o dinheiro entrou. */
  var CO_REEMB_ESTADOS={solicitado:"Solicitado",aprovado:"Aprovado",recebido:"Recebido",recusado:"Recusado"};
  function coReembChave(r){r=r||{};if(r.id)return "reemb:"+r.id;return "reemb:"+(r.canal||"amazon")+":"+coNumeroPedido(r.numero)+":"+Math.round((+r.valor||0)*100)+":"+(r.recebido_em||"")}
  function coReembVincular(r,compras){r=r||{};var n=coNumeroPedido(r.numero);if(!n)return {ok:false,compra:null,erro:"Informe o pedido original do reembolso."};
    for(var i=0;i<(compras||[]).length;i++){var c=compras[i];if(c&&coNumeroPedido(c.numero)===n&&(!r.canal||coCanalDe(c)===r.canal))return {ok:true,compra:c,erro:null}}
    return {ok:false,compra:null,erro:"Pedido original não encontrado: o reembolso não pode virar crédito."}}
  function coReembCreditos(reembolsos,compras,creditos){var o={creditos:[],sem_credito:[]},visto={},pago={};
    (creditos||[]).forEach(function(c){if(!c)return;visto[c.chave]=1;var n=coNumeroPedido(c.numero);pago[n]=(pago[n]||0)+Math.round((+c.valor||0)*100)});
    (reembolsos||[]).forEach(function(r){r=r||{};var no=function(t){o.sem_credito.push({reembolso:r,motivo:t})},val=Math.round((+r.valor||0)*100);
      if(r.estornado===true||r.estornado_em){no("Recebimento estornado: não conta como crédito.");return}
      if(r.estado!=="recebido"){no(r.estado==="aprovado"?"Aprovado ainda não é crédito: falta confirmar o recebimento.":"Solicitado ainda não é crédito.");return}
      if(r.recebido_confirmado!==true){no("Recebimento não confirmado manualmente.");return}
      if(!/^\d{4}-\d{2}-\d{2}$/.test(r.recebido_em||"")){no("Informe a data em que o dinheiro foi recebido.");return}
      if(!(val>0)){no("Valor do reembolso inválido.");return}
      var v=coReembVincular(r,compras);if(!v.ok){no(v.erro);return}
      var k=coReembChave(r);if(visto[k]){no("Crédito já lançado para este reembolso.");return}
      var n=coNumeroPedido(r.numero),limite=Math.round((+v.compra.total_pago||0)*100);if((pago[n]||0)+val>limite){no("Os reembolsos passariam do valor pago no pedido.");return}
      visto[k]=1;pago[n]=(pago[n]||0)+val;o.creditos.push({chave:k,numero:r.numero,compra_id:v.compra.id||null,valor:val/100,mes:r.recebido_em.slice(0,7),recebido_em:r.recebido_em,reembolso_id:r.id||null})});
    return o}

  /* ===== Núcleo fiscal (NF-e modelo 55, NFC-e modelo 65) ===== entidade própria, sem despesa automática e sem dado do consumidor. */
  var NF_UF={11:"RO",12:"AC",13:"AM",14:"RR",15:"PA",16:"AP",17:"TO",21:"MA",22:"PI",23:"CE",24:"RN",25:"PB",26:"PE",27:"AL",28:"SE",29:"BA",31:"MG",32:"ES",33:"RJ",35:"SP",41:"PR",42:"SC",43:"RS",50:"MS",51:"MT",52:"GO",53:"DF"};
  var NF_MODELOS={"55":"NF-e","65":"NFC-e"},NF_FORMATOS={xml:"XML",pdf:"PDF",danfe:"DANFE",imagem:"Imagem ou foto"},NF_CONTINGENCIA={2:1,4:1,5:1,6:1,7:1,9:1};
  var NF_SITUACOES={autorizada:"Autorizada",contingencia:"Contingência",pendente:"Pendente",rejeitada:"Rejeitada",cancelada:"Cancelada"};
  var NF_BANDEIRAS={"01":"Visa","02":"Mastercard","03":"American Express","04":"Sorocred","05":"Diners","06":"Elo","07":"Hipercard","08":"Aura","09":"Cabal","99":"Outra"};
  var NF_MODULOS={compras:"Compras online",mercado:"Mercado",alimentacao:"Alimentação",veiculos:"Veículos/Abastecimento"};
  /* componentes do total da nota além de produtos, descontos, frete e outras: seguro, ST, FCP ST, IPI, II, IPI devolvido (somam) e ICMS desonerado (subtrai) */
  var NF_COMP=["seguro","st","fcp_st","ipi","ii","ipi_devol","deson"];
  var NF_UNID={un:["un","und","unid","unidade","unidades","u","unit"],pc:["pc","pca","peca","pecas"],cx:["cx","caixa","caixas"],pct:["pct","pacote","pacotes"],par:["par","pares"],
    kg:["kg","kgs","kilo","kilos","quilo","quilos","quilograma","quilogramas"],g:["g","gr","grs","grama","gramas"],l:["l","lt","lts","litro","litros"],ml:["ml","mililitro","mililitros"],m:["m","metro","metros"]};
  var NF_FAMILIA={un:"contagem",pc:"contagem",cx:"contagem",pct:"contagem",par:"contagem",kg:"massa",g:"massa",l:"volume",ml:"volume",m:"comprimento"};
  function nfDigitos(s){return String(s==null?"":s).replace(/\D/g,"")}
  /* quantidade com casas decimais (não arredonda em centavos): "0.7340", "1,5", "1.234,500" */
  function nfDec(v){if(v==null||v==="")return null;if(typeof v==="number")return isFinite(v)?v:null;var s=String(v).replace(/\s| /g,"");if(!/^-?[\d.,]+$/.test(s))return null;
    if(/,\d+$/.test(s))s=s.replace(/\./g,"").replace(",",".");else if(/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s))s=s.replace(/,/g,"");var n=parseFloat(s);return isFinite(n)?Math.round(n*10000)/10000:null}
  /* dígito verificador da chave: módulo 11, pesos 2 a 9 da direita para a esquerda */
  function nfDvChave(b43){var p=2,s=0;for(var i=b43.length-1;i>=0;i--){s+=(+b43.charAt(i))*p;p=p===9?2:p+1}var r=s%11;return r<2?0:11-r}
  function nfCnpjValido(c){c=nfDigitos(c);if(c.length!==14||/^(\d)\1{13}$/.test(c))return false;
    function dv(n){var p=n-7,s=0;for(var i=0;i<n;i++){s+=(+c.charAt(i))*p;p=p===2?9:p-1}var r=s%11;return r<2?0:11-r}
    return dv(12)===+c.charAt(12)&&dv(13)===+c.charAt(13)}
  /* chave de 44 dígitos: UF(2) AAMM(4) CNPJ(14) modelo(2) série(3) número(9) tipo de emissão(1) código(8) DV(1).
     `ctx` (opcional) cruza com o que o documento diz: {cnpj, modelo, serie, numero, mes: "AAAA-MM", uf: sigla ou código, hoje} */
  function nfValidarChave(chave,ctx){ctx=ctx||{};var k=nfDigitos(chave),e=[],o={ok:false,chave:k,erros:e,campos:null};
    function er(c,t){e.push({codigo:c,texto:t})}
    if(k.length!==44){er("tamanho","A chave tem "+k.length+" dígitos; são 44.");return o}
    var c=o.campos={uf:k.slice(0,2),aamm:k.slice(2,6),cnpj:k.slice(6,20),modelo:k.slice(20,22),serie:+k.slice(22,25),numero:+k.slice(25,34),tp_emis:+k.charAt(34),codigo:k.slice(35,43),dv:+k.charAt(43)};
    c.sigla_uf=NF_UF[c.uf]||null;c.ano=2000+(+c.aamm.slice(0,2));c.mes=+c.aamm.slice(2,4);c.mes_emissao=c.ano+"-"+(c.mes<10?"0":"")+c.mes;
    if(/^(\d)\1{43}$/.test(k))er("repetida","A chave é uma sequência repetida.");
    if(!c.sigla_uf)er("uf","Código de UF inexistente ("+c.uf+").");
    if(c.mes<1||c.mes>12)er("mes","Mês de emissão inválido na chave ("+c.aamm.slice(2)+").");else if(c.ano<2006||(ctx.hoje&&c.mes_emissao>ctx.hoje.slice(0,7)))er("mes","Ano/mês de emissão fora do possível ("+c.mes_emissao+").");
    if(!nfCnpjValido(c.cnpj))er("cnpj","O CNPJ do emitente na chave é inválido.");
    if(!NF_MODELOS[c.modelo])er("modelo","Modelo "+c.modelo+" não é NF-e (55) nem NFC-e (65).");
    if(!(c.numero>0))er("numero","Número da nota zerado na chave.");
    if(c.tp_emis<1)er("tp_emis","Tipo de emissão inválido na chave.");
    if(nfDvChave(k.slice(0,43))!==c.dv)er("dv","Dígito verificador incorreto.");
    if(ctx.cnpj&&nfDigitos(ctx.cnpj)!==c.cnpj)er("cnpj_divergente","O CNPJ do emitente não bate com o da chave.");
    if(ctx.modelo&&String(ctx.modelo)!==c.modelo)er("modelo_divergente","O modelo informado não bate com o da chave.");
    if(ctx.serie!=null&&ctx.serie!==""&&+ctx.serie!==c.serie)er("serie_divergente","A série não bate com a da chave.");
    if(ctx.numero!=null&&ctx.numero!==""&&+ctx.numero!==c.numero)er("numero_divergente","O número da nota não bate com o da chave.");
    if(ctx.mes&&ctx.mes!==c.mes_emissao)er("mes_divergente","O mês de emissão não bate com o da chave.");
    if(ctx.uf&&String(ctx.uf).toUpperCase()!==c.sigla_uf&&String(ctx.uf)!==c.uf)er("uf_divergente","A UF não bate com a da chave.");
    o.ok=!e.length;return o}
  /* situação só com evidência: autorizada exige protocolo (15 dígitos) + cStat 100/150; contingência sem autorização continua contingência */
  function nfSituacao(ev){ev=ev||{};var cs=+ev.cStat||0,prot=nfDigitos(ev.protocolo),tp=+ev.tp_emis||0,t=norm(ev.situacao_texto||"");
    if(ev.cancelada===true||cs===101||cs===151||cs===155)return {situacao:"cancelada",evidencia:ev.cancelada===true?"evento de cancelamento registrado":"cStat "+cs};
    if(/cancel/.test(t))return {situacao:"cancelada",evidencia:"situação informada no documento"};
    if(cs===110||(cs>=301&&cs<=303))return {situacao:"rejeitada",denegada:true,evidencia:"uso denegado (cStat "+cs+")"};
    if(cs>=200&&cs<=999)return {situacao:"rejeitada",evidencia:"rejeição cStat "+cs};
    if(/rejeit/.test(t))return {situacao:"rejeitada",evidencia:"situação informada no documento"};
    if((cs===100||cs===150)&&prot.length===15)return {situacao:"autorizada",evidencia:"protocolo "+prot+" com cStat "+cs};
    if(NF_CONTINGENCIA[tp]||ev.contingencia===true||/conting/.test(t))return {situacao:"contingencia",evidencia:"emitida em contingência sem protocolo de autorização"};
    return {situacao:"pendente",evidencia:cs===100?"cStat 100 sem protocolo":"sem protocolo de autorização"}}
  function nfUnidade(u){var k=norm(u).replace(/[^a-z0-9]/g,""),cod=null;Object.keys(NF_UNID).forEach(function(c){if(NF_UNID[c].indexOf(k)>=0)cod=c});
    return cod?{cod:cod,familia:NF_FAMILIA[cod],reconhecida:true,original:String(u||"")}:{cod:k||null,familia:"outra",reconhecida:false,original:String(u||"")}}
  /* quantidade na unidade-base (kg para massa, litro para volume) para comparar preço */
  function nfQtdBase(item){var q=item&&item.qtd,c=item&&item.unidade&&item.unidade.cod;if(q==null)return null;if(c==="g")return {qtd:q/1000,unidade:"kg"};if(c==="ml")return {qtd:q/1000,unidade:"l"};return {qtd:q,unidade:c||null}}
  function nfData(t){var d=coData(t);return d&&d.slice(5,7)>="01"&&d.slice(5,7)<="12"?d:null}
  /* normaliza o que foi extraído (XML, PDF, DANFE ou foto) numa estrutura só; copia campo a campo (nada do consumidor entra) */
  function nfNormalizar(d){d=d||{};var av=[],em=d.emitente||{},v0=d.valores||{},cnpj=nfDigitos(em.cnpj),
      val=nfValidarChave(d.chave,{cnpj:cnpj||null,modelo:d.modelo,serie:d.serie,numero:d.numero,mes:(nfData(d.data_emissao)||"").slice(0,7)||null,uf:em.uf}),camp=val.campos,
      modelo=String(d.modelo||(camp&&camp.modelo)||"");if(!NF_MODELOS[modelo]){av.push("Modelo da nota não identificado.");modelo=null}
    var formato=NF_FORMATOS[d.formato]?d.formato:"imagem",din=function(x){return x==null||x===""?null:coNum(x)};
    var itens=(d.itens||[]).map(function(i){i=i||{};var u=nfUnidade(i.unidade),it={descricao:String(i.descricao||"").trim().slice(0,200),codigo:i.codigo!=null&&i.codigo!==""?String(i.codigo).slice(0,60):null,qtd:nfDec(i.qtd),unidade:u,unitario:i.unitario==null||i.unitario===""?null:(nfDec(i.unitario)==null?null:Math.abs(nfDec(i.unitario))),total:din(i.total),desconto:din(i.desconto)||0};
      if(it.qtd==null)av.push("Item sem quantidade: "+(it.descricao||"sem descrição")+".");if(!u.reconhecida&&u.cod)av.push("Unidade não reconhecida: "+u.original+".");it.qtd_base=nfQtdBase(it);return it});
    var pags=(d.pagamentos||[]).map(function(p){p=p||{};var cod=p.codigo!=null?String(p.codigo):null,fin=nfDigitos(p.final);
      return {codigo:cod,forma:CO_TPAG[cod]||(p.forma?String(p.forma).slice(0,40):null),valor:din(p.valor),bandeira:NF_BANDEIRAS[p.bandeira_codigo]||(p.bandeira?String(p.bandeira).slice(0,30):null),final:fin.length>=4?fin.slice(-4):null}});
    var troco=din(d.troco)||0,somaPag=pags.length&&pags.every(function(p){return p.valor!=null})?amR2(pags.reduce(function(s,p){return s+p.valor},0)-troco):null;
    var V={produtos:din(v0.produtos),descontos:din(v0.descontos),frete:din(v0.frete),outras:din(v0.outras),impostos:din(v0.impostos),total:din(v0.total),a_pagar:din(v0.a_pagar)};NF_COMP.forEach(function(k){var x=din(v0[k]);if(x!=null)V[k]=x});if(V.a_pagar==null)V.a_pagar=somaPag;
    if(V.produtos!=null&&V.total!=null){var calc=amR2(V.produtos-(V.descontos||0)-(V.deson||0)+(V.frete||0)+(V.outras||0)+(V.seguro||0)+(V.st||0)+(V.fcp_st||0)+(V.ipi||0)+(V.ii||0)+(V.ipi_devol||0));if(Math.abs(calc-V.total)>0.02)av.push("A conta dos valores da nota não fecha (produtos − descontos + frete + outras = R$ "+calc.toFixed(2).replace(".",",")+"; total R$ "+V.total.toFixed(2).replace(".",",")+"). Impostos como IPI e ST podem explicar.")}
    var sit=nfSituacao({cStat:d.cStat,protocolo:d.protocolo,tp_emis:d.tp_emis!=null?d.tp_emis:camp&&camp.tp_emis,cancelada:d.cancelada,contingencia:d.contingencia,situacao_texto:d.situacao_texto});
    var difPag=V.a_pagar!=null&&V.total!=null?amR2(V.a_pagar-V.total):null;if(difPag!=null&&Math.abs(difPag)>0.02)av.push("O valor a pagar difere do total da nota.");
    if(!val.ok)av.push("A chave de acesso não passou na validação.");
    return {modelo:modelo,tipo:modelo?NF_MODELOS[modelo]:null,formato:formato,chave:val.chave.length===44?val.chave:null,chave_valida:val.ok,validacao:{ok:val.ok,erros:val.erros},
      numero:d.numero!=null&&d.numero!==""?String(+d.numero||d.numero):(camp?String(camp.numero):null),serie:d.serie!=null&&d.serie!==""?String(+d.serie):(camp?String(camp.serie):null),data_emissao:nfData(d.data_emissao),
      emitente:{nome:em.nome?String(em.nome).slice(0,120):null,cnpj:cnpj.length===14?cnpj:null,uf:em.uf||(camp&&camp.sigla_uf)||null},
      situacao:sit.situacao,situacao_evidencia:sit.evidencia,protocolo:(nfDigitos(d.protocolo).length===15?nfDigitos(d.protocolo):null),denegada:sit.denegada===true,tp_emis:d.tp_emis!=null?+d.tp_emis:(camp?camp.tp_emis:null),
      valores:V,diferenca_pagamento:difPag,pagamentos:pags,itens:itens,requer_conferencia:formato!=="xml"||!val.ok,avisos:av,gera_despesa:false}}
  /* lê o XML da nota (nfeProc); nunca lê destinatário, transporte nem informações adicionais */
  function nfLerXML(xml){var x=String(xml||"");if(!/<(?:\w+:)?infNFe\b/i.test(x))return null;
    var id=/<(?:\w+:)?infNFe[^>]*\bId="NFe(\d{44})"/i.exec(x),ide=coTag(x,"ide")||"",emit=coTag(x,"emit")||"",ender=coTag(emit,"enderEmit")||"",tot=coTag(x,"ICMSTot")||"",pag=coTag(x,"pag")||"",prot=coTag(x,"infProt")||"";
    var canc=coTags(x,"retEvento").some(function(r){var cs=+coTag(r,"cStat");return coTag(r,"tpEvento")==="110111"&&(cs===135||cs===155||cs===151)});
    return {formato:"xml",chave:(id&&id[1])||coTag(prot,"chNFe"),modelo:coTag(ide,"mod"),serie:coTag(ide,"serie"),numero:coTag(ide,"nNF"),data_emissao:(coTag(ide,"dhEmi")||coTag(ide,"dEmi")||"").slice(0,10)||null,tp_emis:coTag(ide,"tpEmis"),
      emitente:{nome:coTag(emit,"xNome"),cnpj:coTag(emit,"CNPJ"),uf:coTag(ender,"UF")},cStat:coTag(prot,"cStat"),protocolo:coTag(prot,"nProt"),cancelada:canc,
      valores:{produtos:coTag(tot,"vProd"),descontos:coTag(tot,"vDesc"),frete:coTag(tot,"vFrete"),outras:coTag(tot,"vOutro"),impostos:coTag(tot,"vTotTrib"),total:coTag(tot,"vNF"),seguro:coTag(tot,"vSeg"),st:coTag(tot,"vST"),fcp_st:coTag(tot,"vFCPST"),ipi:coTag(tot,"vIPI"),ii:coTag(tot,"vII"),ipi_devol:coTag(tot,"vIPIDevol"),deson:coTag(tot,"vICMSDeson")},troco:coTag(pag,"vTroco"),
      pagamentos:coTags(pag,"detPag").map(function(p){return {codigo:coTag(p,"tPag"),valor:coTag(p,"vPag"),bandeira_codigo:coTag(p,"tBand")}}),
      itens:coTags(x,"det").map(function(dt){var p=coTag(dt,"prod")||"";return {descricao:coTag(p,"xProd"),codigo:coTag(p,"cProd"),qtd:coTag(p,"qCom"),unidade:coTag(p,"uCom"),unitario:coTag(p,"vUnCom"),total:coTag(p,"vProd"),desconto:coTag(p,"vDesc")}})}}
  /* auditoria de privacidade do objeto normalizado: chave de campo de consumidor, CPF formatado ou sequência de 11 dígitos */
  function nfTemDadoPessoal(o){var ach=[];(function ve(v,cam){if(v==null)return;if(Array.isArray(v)){v.forEach(function(x,i){ve(x,cam+"["+i+"]")});return}
      if(typeof v==="object"){Object.keys(v).forEach(function(k){if(/cpf|consumidor|destinat|cliente|comprador|endereco|telefone|e-?mail|cvv|cartao_numero|pan$/i.test(k))ach.push(cam+"."+k);ve(v[k],cam+"."+k)});return}
      var s=String(v);if(/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(s)||/(^|\D)\d{11}(\D|$)/.test(s))ach.push(cam+": padrão de CPF")})(o,"nota");return {ok:!ach.length,achados:ach}}
  /* ---- Lote B: gravação da nota (RPC nota_fiscal_salvar, migration 034) ---- */
  var NF_MIMES_XML={"text/xml":1,"application/xml":1};
  /* CPF: a MESMA regra do banco (nf_cpf_dv_ok e nf_tem_cpf, 034): 11 dígitos (com ou sem . - espaço) que não fazem parte de um número maior e cujos dígitos verificadores fecham */
  function nfCpfDvOk(c){c=String(c==null?"":c);if(!/^\d{11}$/.test(c)||/^(\d)\1{10}$/.test(c))return false;
    var s=0,i;for(i=0;i<9;i++)s+=(+c.charAt(i))*(10-i);s=(s*10)%11;if(s===10)s=0;if(s!==+c.charAt(9))return false;
    s=0;for(i=0;i<10;i++)s+=(+c.charAt(i))*(11-i);s=(s*10)%11;if(s===10)s=0;return s===+c.charAt(10)}
  function nfCpfsValidos(t){var n=0,re=/(?:^|[^0-9])(\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2})(?!\d)/g,m,x=String(t==null?"":t);
    while((m=re.exec(x))!==null)if(nfCpfDvOk(m[1].replace(/\D/g,"")))n++;return n}
  function nfTemCpf(t){return nfCpfsValidos(t)>0}
  /* o original fica em <dono>/notas-fiscais/<nota>/<sha256>.<ext>, no cofre privado "familia" */
  function nfCaminhoDoc(dono,nota,sha,ext){return dono+"/notas-fiscais/"+nota+"/"+sha+"."+(ext||"xml")}
  /* só o erro 40001 (falha de serialização) repete, no máximo 3 vezes, com espera crescente; validação, permissão e duplicidade nunca repetem.
     repeticoes = quantas já foram feitas; devolve a espera em ms ou null (não repetir) */
  function nfRetentar(erro,repeticoes){if(!erro||String(erro.code)!=="40001")return null;var n=+repeticoes||0;return n>=3?null:[150,300,600][n]}
  function nfArred(x,c){var f=Math.pow(10,c);return Math.round(x*f)/f}
  /* monta os argumentos da RPC a partir do que o leitor de XML e o normalizador devolveram. Nenhum campo de CPF; chave só se confere; nunca inventa
     identificador fiscal. o = {id, dono, nome, mime, tamanho, sha256, conferir}. Devolve {ok, erros, avisos, args:{p_nota,p_itens,p_docs,p_conferir}} */
  function nfParaGravar(lido,n,o){o=o||{};n=n||{};lido=lido||{};var er=[],av=[],V=n.valores||{},em=n.emitente||{};
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(o.id||"")))er.push("Falta o identificador da nota.");
    if(!o.dono)er.push("Falta o dono da casa.");
    if(n.formato!=="xml")er.push("Nesta etapa só se grava nota lida de XML.");
    if(!n.modelo)er.push("O modelo da nota (55 ou 65) não foi identificado.");
    if(V.total==null)er.push("A nota não tem valor total.");
    if(!/^[0-9a-f]{64}$/.test(String(o.sha256||"")))er.push("Falta o SHA-256 do arquivo.");
    if(!NF_MIMES_XML[o.mime])er.push("O tipo do arquivo precisa ser text/xml ou application/xml.");
    if(!(o.tamanho>=1&&o.tamanho<=2097152&&Math.floor(o.tamanho)===o.tamanho))er.push("O XML precisa ter entre 1 byte e 2 MB.");
    var chave=n.chave_valida&&n.chave?n.chave:null,cnpj=em.cnpj&&nfCnpjValido(em.cnpj)?em.cnpj:null;
    var itens=(n.itens||[]).map(function(i,k){i=i||{};var u=i.unidade||{},d=String(i.descricao||"").trim().slice(0,200);
      if(!d)er.push("O item "+(k+1)+" não tem descrição.");
      if(!(i.qtd>0))er.push("O item "+(k+1)+" não tem quantidade.");
      if(i.total==null)er.push("O item "+(k+1)+" não tem valor total.");
      var orig=String(u.original||"").slice(0,20);
      return {codigo:i.codigo!=null&&i.codigo!==""?String(i.codigo).slice(0,60):null,descricao:d,qtd:i.qtd>0?nfArred(i.qtd,4):null,unidade:u.reconhecida&&u.cod?u.cod:"outra",
        unidade_original:orig||null,unitario:i.unitario!=null?nfArred(i.unitario,4):null,total:i.total!=null?nfArred(i.total,2):null,desconto:nfArred(i.desconto||0,2)}});
    if(!itens.length)er.push("A nota não tem itens.");
    var pagamentos=(n.pagamentos||[]).map(function(p,k){p=p||{};if(p.valor==null)er.push("O pagamento "+(k+1)+" não tem valor.");
      return {codigo:p.codigo!=null?String(p.codigo):null,forma:p.forma?String(p.forma).slice(0,40):null,valor:p.valor!=null?nfArred(p.valor,2):null,bandeira:p.bandeira?String(p.bandeira).slice(0,30):null,final:p.final||null}});
    var protocolo=n.protocolo||(nfDigitos(lido.protocolo).length===15?nfDigitos(lido.protocolo):null);
    /* Lote 1.3: a mesma decisão da tela vale aqui (o núcleo não depende de quem chama): conta divergente, baixa confiança, cancelada e rejeitada não são gravadas;
       contingência/pendente consistente é gravada como pendente fiscal (nunca conferida, nunca validada) */
    var dec=nfDecisaoGravacao(n,null);dec.bloqueios.forEach(function(b){er.push("Gravação bloqueada: "+b)});
    var requer=chave==null?true:!!n.requer_conferencia,conferir=o.conferir===true&&chave!=null&&dec.conferir_permitido;
    if(dec.modo==="pendente_fiscal")requer=true;
    if(o.conferir===true&&dec.modo==="pendente_fiscal")av.push("Nota em "+dec.veredito.fiscal.rotulo.toLowerCase()+": fica sem validação oficial e sem conferência.");
    if(o.conferir===true&&chave==null)av.push("Nota sem chave de acesso válida fica pendente: a conferência é feita depois, em ação separada.");
    var nota={id:o.id,modelo:n.modelo,chave:chave,numero:/^\d{1,9}$/.test(String(n.numero||""))?String(n.numero):null,serie:/^\d{1,3}$/.test(String(n.serie||""))?String(n.serie):null,
      data_emissao:n.data_emissao||null,emitente_nome:em.nome?String(em.nome).slice(0,120):null,emitente_cnpj:cnpj,emitente_uf:/^[A-Z]{2}$/.test(String(em.uf||""))?em.uf:null,
      tp_emis:n.tp_emis!=null&&n.tp_emis>=1&&n.tp_emis<=9?n.tp_emis:null,situacao:n.situacao,situacao_evidencia:n.situacao_evidencia?String(n.situacao_evidencia).slice(0,200):null,protocolo:protocolo,
      denegada:!!n.denegada,valor_produtos:V.produtos!=null?nfArred(V.produtos,2):null,valor_descontos:V.descontos!=null?nfArred(V.descontos,2):null,valor_frete:V.frete!=null?nfArred(V.frete,2):null,
      valor_outras:V.outras!=null?nfArred(V.outras,2):null,valor_impostos:V.impostos!=null?nfArred(V.impostos,2):null,valor_total:V.total!=null?nfArred(V.total,2):null,
      valor_a_pagar:V.a_pagar!=null?nfArred(V.a_pagar,2):null,pagamentos:pagamentos,formato_origem:"xml",requer_conferencia:requer,observacoes:null};
    /* o CPF fica só no arquivo original; se algum campo de texto o trouxer, não segue */
    [nota.emitente_nome,nota.situacao_evidencia,JSON.stringify(pagamentos)].concat(itens.map(function(i){return (i.descricao||"")+" "+(i.unidade_original||"")})).forEach(function(t){if(nfTemCpf(t)&&er.indexOf("Um campo de texto da nota parece conter um CPF; ele fica só no arquivo original.")<0)er.push("Um campo de texto da nota parece conter um CPF; ele fica só no arquivo original.")});
    var nome=String(o.nome||"").trim();if(!nome||nome.length>200||nfTemCpf(nome))nome="nota-"+String(o.sha256||"").slice(0,8)+".xml";
    var docs=[{tipo:"xml",nome:nome,path:nfCaminhoDoc(o.dono,o.id,o.sha256,"xml"),mime:o.mime,tamanho:o.tamanho,sha256:o.sha256}];
    return {ok:!er.length,erros:er,avisos:av,modo:dec.modo,veredito:dec.veredito,args:{p_nota:nota,p_itens:itens,p_docs:docs,p_conferir:conferir}}}
  /* ---- Lote 1.6: gravação de nota lida de FOTO ou PDF (RPC nota_fiscal_salvar_doc, migration 037) ----
     O banco refaz a conta, aplica a confiança mínima (0,90) e a regra da situação; aqui só se monta o payload com os nomes EXATOS dos campos da 037 e se prevê o resultado
     (a tela mostra o que o banco decidiu, não o que previu). Nota bloqueada não vira nota: o banco guarda só a tentativa e o original, para auditoria.
     o = {id, dono, idem, tipo:"imagem"|"pdf", arquivos:[{nome,mime,tamanho,sha256}], confianca, revisada, incertos, modelo_ia, ia_uso_id}.
     Devolve {ok, erros, avisos, modo, pode_nota, veredito, args:{p_nota,p_itens,p_docs,p_proc}}. ok = payload válido para enviar (inclusive o de uma tentativa bloqueada). */
  var NF_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,NF_DOC_MIMES={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","application/pdf":"pdf"};
  function nfParaGravarDoc(lido,n,o){o=o||{};n=n||{};lido=lido||{};var er=[],av=[],V=n.valores||{},em=n.emitente||{},tipo=o.tipo==="pdf"?"pdf":"imagem",arqs=Array.isArray(o.arquivos)?o.arquivos:[];
    if(!NF_UUID.test(String(o.id||"")))er.push("Falta o identificador da nota.");
    if(!NF_UUID.test(String(o.idem||"")))er.push("Falta o identificador desta gravação.");
    if(!o.dono)er.push("Falta o dono da casa.");
    if(n.formato!==tipo)er.push("O formato da nota ("+(n.formato||"?")+") não combina com o dos arquivos ("+tipo+").");
    if(!n.modelo)er.push("O modelo da nota (55 ou 65) não foi identificado.");
    if(V.total==null)er.push("A nota não tem valor total.");
    if(n.data_emissao&&(n.data_emissao<"1995-01-01"||n.data_emissao>nfDataAmanha()))er.push("A data da nota está fora do esperado.");
    if(!arqs.length||(tipo==="pdf"&&arqs.length!==1)||arqs.length>NF_IA_MAX_PAG)er.push(tipo==="pdf"?"O PDF é um arquivo só.":"Envie de 1 a "+NF_IA_MAX_PAG+" fotos.");
    var vistos={};
    var docs=arqs.map(function(a){a=a||{};var ext=NF_DOC_MIMES[a.mime],lim=tipo==="pdf"?NF_IA_MAX_PDF:NF_IA_MAX_IMG;
      if(!ext||(tipo==="pdf")!==(a.mime==="application/pdf"))er.push("O tipo do arquivo ("+(a.mime||"sem tipo")+") não combina com a nota.");
      if(!/^[0-9a-f]{64}$/.test(String(a.sha256||"")))er.push("Falta o SHA-256 de um arquivo.");else if(vistos[a.sha256])er.push("O mesmo arquivo foi escolhido duas vezes.");else vistos[a.sha256]=1;
      if(!(a.tamanho>=1&&a.tamanho<=lim&&Math.floor(a.tamanho)===a.tamanho))er.push("Tamanho de arquivo inválido (limite de "+(lim/1048576)+" MB).");
      var nome=String(a.nome||"").trim();if(!nome||nome.length>200||nfTemCpf(nome))nome="nota-"+String(a.sha256||"").slice(0,8)+"."+(ext||"jpg");
      return {tipo:tipo,nome:nome,path:ext&&o.dono&&o.id?nfCaminhoDoc(o.dono,o.id,a.sha256,ext):null,mime:a.mime,tamanho:a.tamanho,sha256:a.sha256}});
    var chave=n.chave_valida&&n.chave?n.chave:null,cnpj=em.cnpj&&nfCnpjValido(em.cnpj)?em.cnpj:null;
    var itens=(n.itens||[]).map(function(i,k){i=i||{};var u=i.unidade||{},d=String(i.descricao||"").trim().slice(0,200);
      if(!d)er.push("O item "+(k+1)+" não tem descrição.");if(!(i.qtd>0))er.push("O item "+(k+1)+" não tem quantidade.");if(i.total==null)er.push("O item "+(k+1)+" não tem valor total.");
      var orig=String(u.original||"").slice(0,20);
      return {codigo:i.codigo!=null&&i.codigo!==""?String(i.codigo).slice(0,60):null,descricao:d,qtd:i.qtd>0?nfArred(i.qtd,4):null,unidade:u.reconhecida&&u.cod?u.cod:"outra",unidade_original:orig||null,
        unitario:i.unitario!=null?nfArred(i.unitario,4):null,total:i.total!=null?nfArred(i.total,2):null,desconto:nfArred(i.desconto||0,2)}});
    if(!itens.length||itens.length>990)er.push("A nota precisa de 1 a 990 itens.");
    var pagamentos=(n.pagamentos||[]).slice(0,10).map(function(p,k){p=p||{};if(p.valor==null)er.push("O pagamento "+(k+1)+" não tem valor.");
      return {codigo:null,forma:p.forma?String(p.forma).slice(0,40):null,valor:p.valor!=null?nfArred(p.valor,2):null,bandeira:p.bandeira?String(p.bandeira).slice(0,30):null,final:p.final||null}});
    var dec=nfDecisaoGravacao(n,null,{confianca:nfConfiancaIA({confianca:o.confianca}),qr_conflitos:o.qr_conflitos}),ve=dec.veredito,s=ve.soma;
    var comp=nfArred(((s.acrescimos||0)-((V.frete||0)+(V.outras||0)))-(s.desonerado||0),2);
    var protocolo=n.protocolo||null;
    var nota={id:o.id,modelo:n.modelo,chave:chave,numero:/^\d{1,9}$/.test(String(n.numero||""))?String(n.numero):null,serie:/^\d{1,3}$/.test(String(n.serie||""))?String(n.serie):null,
      data_emissao:n.data_emissao||null,emitente_nome:em.nome?String(em.nome).slice(0,120):null,emitente_cnpj:cnpj,emitente_uf:/^[A-Z]{2}$/.test(String(em.uf||""))?em.uf:null,
      tp_emis:n.tp_emis!=null&&n.tp_emis>=1&&n.tp_emis<=9?n.tp_emis:null,situacao:ve.sem_chave&&n.situacao==="autorizada"?"pendente":n.situacao,situacao_evidencia:n.situacao_evidencia?String(n.situacao_evidencia).slice(0,200):null,protocolo:protocolo,
      denegada:!!n.denegada,valor_produtos:V.produtos!=null?nfArred(V.produtos,2):null,valor_descontos:V.descontos!=null?nfArred(V.descontos,2):null,valor_frete:V.frete!=null?nfArred(V.frete,2):null,
      valor_outras:V.outras!=null?nfArred(V.outras,2):null,valor_impostos:V.impostos!=null?nfArred(V.impostos,2):null,valor_total:V.total!=null?nfArred(V.total,2):null,
      valor_a_pagar:V.a_pagar!=null?nfArred(V.a_pagar,2):null,pagamentos:pagamentos,formato_origem:tipo,requer_conferencia:true,observacoes:null};
    [nota.emitente_nome,nota.situacao_evidencia,JSON.stringify(pagamentos)].concat(itens.map(function(i){return (i.descricao||"")+" "+(i.unidade_original||"")})).forEach(function(t){
      if(nfTemCpf(t)&&er.indexOf("Um campo de texto da nota parece conter um CPF; corrija antes de gravar.")<0)er.push("Um campo de texto da nota parece conter um CPF; corrija antes de gravar.")});
    var inc=(Array.isArray(o.incertos)?o.incertos:[]).slice(0,20).map(function(x){return {campo:String(x&&x.campo||"").slice(0,60),motivo:String(x&&x.motivo||"").slice(0,200)}}).filter(function(x){return x.campo&&!nfTemCpf(x.campo+" "+x.motivo)}),
      mot=ve.motivos.map(function(m){return String(m.texto).slice(0,200)}).concat(ve.bloqueios.map(function(b){return String(b.texto).slice(0,200)})).slice(0,10);
    var proc={idem:o.idem,classe:ve.classe,confianca:nfArred(Math.min(1,Math.max(0,+o.confianca>=0?+o.confianca:0)),3),revisada:o.revisada===true,diferenca:s.diferenca!=null?nfArred(s.diferenca,2):null,componentes:comp,motivos:mot,incertos:inc,
      modelo_ia:o.modelo_ia?String(o.modelo_ia).slice(0,60):null,ia_uso_id:NF_UUID.test(String(o.ia_uso_id||""))?o.ia_uso_id:null};
    if(dec.modo==="pendente_fiscal")av.push("Nota em "+ve.fiscal.rotulo.toLowerCase()+": será guardada sem validação oficial.");
    return {ok:!er.length,erros:er,avisos:av,modo:dec.modo,pode_nota:dec.pode,veredito:ve,decisao:dec,args:{p_nota:nota,p_itens:itens,p_docs:docs,p_proc:proc}}}
  function nfDataAmanha(){var d=new Date(Date.now()+86400000+(-3*3600000));return d.toISOString().slice(0,10)}
  /* o que a resposta do banco quer dizer (nota_fiscal_salvar_doc): estado para a tela, texto e se a nota foi realmente gravada */
  function nfResultadoDoc(d){d=d||{};var r=d.resultado;
    if(d.criado===true&&(r==="validada"||r==="pendente_fiscal"))return {estado:r,gravada:true,id:d.id||null,texto:r==="validada"?"Nota gravada como validada (autorizada e consistente). Falta a sua conferência com o documento.":"Nota gravada sem validação oficial (a compra entra no Mercado normalmente)."};
    if(r==="bloqueada"||d.bloqueada===true)return {estado:"bloqueada",gravada:false,id:null,texto:"Bloqueada: a nota NÃO foi criada. O original e a tentativa ficaram registrados para auditoria."+((d.motivos||[]).length?" "+d.motivos.join(" "):"")};
    if(r==="duplicada"||d.duplicada===true)return {estado:"duplicada",gravada:false,id:d.id||null,texto:"Já existe uma nota igual na Central Fiscal ("+(d.motivo==="arquivo"?"o mesmo arquivo":d.motivo==="chave"?"a mesma chave de acesso":"o mesmo identificador")+"): nenhuma nota nova foi criada."};
    if(d.ja_existia===true)return {estado:r||"ja_existia",gravada:r==="validada"||r==="pendente_fiscal",id:d.id||null,texto:"Esta leitura já tinha sido processada ("+(r==="validada"?"validada":r==="pendente_fiscal"?"sem validação oficial":r==="bloqueada"?"bloqueada":r==="duplicada"?"duplicada":"registrada")+"): nada mudou."};
    return {estado:"desconhecido",gravada:false,id:null,texto:"O banco respondeu algo inesperado: não considere a nota gravada."}}
  /* atualizar a situação fiscal (RPC nota_fiscal_atualizar_situacao): o banco decide; aqui só se impede o que ele recusaria. nota = {id, situacao}; o = {para, protocolo, evidencia, fonte} */
  function nfAtualizarSituacao(nota,o){nota=nota||{};o=o||{};var er=[],para=o.para,prot=nfDigitos(o.protocolo),ev=o.evidencia==null?"":String(o.evidencia).trim(),fonte=o.fonte||"manual";
    if(!NF_UUID.test(String(nota.id||"")))er.push("Falta o identificador da nota.");
    if(["autorizada","cancelada","rejeitada"].indexOf(para)<0)er.push("A nova situação é autorizada, cancelada ou rejeitada.");
    else if((NF_TRANSICOES[nota.situacao]||[]).indexOf(para)<0)er.push("De "+(NF_SITUACOES[nota.situacao]||nota.situacao||"?").toLowerCase()+" para "+(NF_SITUACOES[para]||para).toLowerCase()+" não é permitido.");
    if(para==="autorizada"&&prot.length!==15)er.push("Autorizar exige o protocolo de 15 dígitos.");
    if(["foto","pdf","xml","manual"].indexOf(fonte)<0)er.push("Fonte inválida.");
    if(ev.length>200)er.push("A evidência passa de 200 caracteres.");if(ev&&nfTemCpf(ev))er.push("A evidência parece conter um CPF.");
    return {ok:!er.length,erros:er,args:{p_id:nota.id,p_situacao:para,p_protocolo:para==="autorizada"?prot:(prot.length===15?prot:null),p_evidencia:ev||null,p_fonte:fonte}}}
  /* vínculo de conferência com um registro de outro módulo; nunca cria despesa */
  function nfVincular(nota,alvo,existentes){nota=nota||{};alvo=alvo||{};var e=[],a=[];
    if(!nota.chave)e.push("A nota não tem chave de acesso para identificá-la.");if(!NF_MODULOS[alvo.modulo])e.push("Módulo de destino inválido.");if(alvo.id==null||alvo.id==="")e.push("Informe o registro que a nota documenta.");
    if(nota.situacao==="cancelada"||nota.situacao==="rejeitada")e.push("Nota "+(nota.situacao==="cancelada"?"cancelada":"rejeitada")+" não documenta compra.");
    else if(nota.situacao!=="autorizada")a.push("A nota está "+(NF_SITUACOES[nota.situacao]||"sem situação").toLowerCase()+": sem autorização comprovada.");
    if(nota.chave&&nota.chave_valida===false)a.push("A chave da nota não passou na validação.");
    (existentes||[]).forEach(function(x){if(!x||x.chave!==nota.chave||x.modulo!==alvo.modulo)return;if(String(x.registro_id)===String(alvo.id))e.push("Esta nota já está vinculada a este registro.");else a.push("A nota já está vinculada a outro registro de "+NF_MODULOS[alvo.modulo]+".")});
    var ref=nota.valores&&(nota.valores.a_pagar!=null?nota.valores.a_pagar:nota.valores.total),dif=ref!=null&&alvo.total!=null?amR2(+alvo.total-ref):null;
    if(dif!=null&&Math.abs(dif)>0.02)a.push("O valor do registro difere do valor da nota em R$ "+Math.abs(dif).toFixed(2).replace(".",",")+".");
    if(e.length)return {ok:false,erros:e,avisos:a,vinculo:null};
    return {ok:true,erros:[],avisos:a,vinculo:{chave:nota.chave,modulo:alvo.modulo,registro_id:alvo.id,tipo:"conferencia",confere:dif==null?null:Math.abs(dif)<=0.02,diferenca:dif,gera_despesa:false}}}
  /* ===== Lote 1.2: conferência aritmética e prevenção de duplicidade da nota (só regras puras; não grava, não envia, não cria despesa) =====
     Tudo em centavos inteiros. Tolerância de arredondamento: 1 centavo (NF_TOL_CENT). Confiança mínima de uma leitura de foto/PDF: 0,9. */
  var NF_TOL_CENT=1,NF_CONF_MIN=0.6,NF_CONF_ALERTA=0.7,NF_TRANSICOES={pendente:["autorizada","cancelada","rejeitada"],contingencia:["autorizada","cancelada","rejeitada"],autorizada:["cancelada"]};
  /* palavras do nome sem termos societários (LTDA, SA, ME…), para comparar "Mercado Exemplo Ltda" com "Mercado Exemplo" */
  function nfPalavras(k){return String(k||"").split(" ").filter(function(w){return w&&!/^(ltda|sa|s|a|me|epp|eireli|cia|comercio|de|da|do|e)$/.test(w)})}
  function nfCent(x){if(x==null||x==="")return null;var n=+x;return isFinite(n)?Math.round(n*100):null}
  function nfReais(c){return "R$ "+(Math.abs(c)/100).toFixed(2).replace(".",",")}
  /* confere a conta da nota normalizada (nfNormalizar): cada item (quantidade × unitário = total; desconto não passa do item), a soma dos itens
     contra o total de produtos e os descontos declarados, e (soma dos itens − descontos + frete + outras + seguro + ST + IPI + II … − ICMS desonerado)
     contra o total fiscal. `lacunas` = falta dado para conferir (baixa confiança); `divergencias` = a conta não fecha.
     diferenca (reais) = calculado − total fiscal: positivo, os itens somam mais que a nota. */
  function nfValidarSoma(nota){nota=nota||{};var V=nota.valores||{},its=Array.isArray(nota.itens)?nota.itens:[],lac=[],div=[],av=[],itens=[],bruta=0,descIt=0;
    function L(c,t,k){lac.push({codigo:c,texto:t,item:k||null})}
    function D(c,t,dif,k){div.push({codigo:c,texto:t,diferenca:dif==null?null:dif/100,item:k||null})}
    if(!its.length)L("sem_itens","A nota não tem itens para conferir.");
    its.forEach(function(i,k){i=i||{};var n=k+1,rot="Item "+n+(i.descricao?" ("+i.descricao+")":""),tot=nfCent(i.total),desc=nfCent(i.desconto)||0,q=+i.qtd,un=i.unitario==null||i.unitario===""?null:+i.unitario,r={indice:n,descricao:i.descricao||"",verificado:false,ok:true,esperado:null,informado:tot==null?null:tot/100,diferenca:null,desconto:desc/100};
      if(!(q>0)||tot==null){r.ok=false;L("item_incompleto",rot+": falta "+(!(q>0)?"a quantidade":"o valor total")+".",n);itens.push(r);return}
      if(un==null||!isFinite(un))av.push(rot+": sem preço unitário; a conta do item não foi conferida.");
      if(un!=null&&isFinite(un)){var esp=Math.round(q*un*100);r.verificado=true;r.esperado=esp/100;
        /* o total da nota é arredondado (ou truncado) em centavos; o unitário tem 4 casas, o que deixa uma folga proporcional à quantidade */
        if(Math.abs(tot-q*un*100)>NF_TOL_CENT+q*0.005+1e-6){r.ok=false;r.diferenca=(tot-esp)/100;D("item_conta",rot+": "+String(q).replace(".",",")+" × "+nfReais(Math.round(un*100))+" dá "+nfReais(esp)+", mas a nota traz "+nfReais(tot)+".",tot-esp,n)}}
      if(desc>tot){r.ok=false;D("item_desconto",rot+": o desconto ("+nfReais(desc)+") é maior que o valor do item ("+nfReais(tot)+").",desc-tot,n)}
      bruta+=tot;descIt+=desc;itens.push(r)});
    var prodD=nfCent(V.produtos),descD=nfCent(V.descontos),totD=nfCent(V.total),soma=!lac.length;
    if(soma&&prodD!=null&&Math.abs(bruta-prodD)>NF_TOL_CENT)D("soma_produtos","A soma dos itens ("+nfReais(bruta)+") difere do total de produtos da nota ("+nfReais(prodD)+").",bruta-prodD);
    if(soma&&descD!=null&&descIt>0&&Math.abs(descD-descIt)>NF_TOL_CENT)D("soma_descontos","A soma dos descontos dos itens ("+nfReais(descIt)+") difere do desconto total da nota ("+nfReais(descD)+").",descIt-descD);
    var desc=descD!=null?descD:descIt,mais=0,menos=nfCent(V.deson)||0;
    ["frete","outras"].concat(NF_COMP.filter(function(k){return k!=="deson"})).forEach(function(k){mais+=nfCent(V[k])||0});
    var calc=bruta-desc+mais-menos,dif=null,arred=false;
    if(totD==null)L("sem_total","A nota não tem valor total para comparar.");
    else if(soma){dif=calc-totD;if(Math.abs(dif)>NF_TOL_CENT)D("total","A conta dos itens ("+nfReais(calc)+") difere do total fiscal ("+nfReais(totD)+") em "+nfReais(dif)+" "+(dif>0?"a mais":"a menos")+"."+(dif<0?" Se a nota tem frete, taxa ou outro acréscimo que não foi lido, informe-o no formulário (Frete ou Outras despesas); se tem desconto geral, informe em Descontos.":" Se a nota tem um desconto geral que não foi lido, informe-o em Descontos no formulário."),dif);
      else if(dif!==0){arred=true;av.push("Diferença de "+nfReais(dif)+" entre a conta dos itens e o total fiscal: arredondamento aceito.")}}
    return {ok:!lac.length&&!div.length,verificavel:!lac.length,itens:itens,soma_itens:bruta/100,descontos:desc/100,acrescimos:mais/100,desonerado:menos/100,total_calculado:soma?calc/100:null,total_fiscal:totD==null?null:totD/100,
      diferenca:dif==null?null:dif/100,arredondamento:arred,tolerancia:NF_TOL_CENT/100,lacunas:lac,divergencias:div,avisos:av}}
  /* decide o que fazer com a nota. `classe` é só a CONTA: "consistente" (fecha), "divergente" (não fecha) ou "baixa_confianca" (falta dado, chave inválida ou
     leitura de foto/PDF incerta: pede nova leitura). `fiscal` é só a SITUAÇÃO (autorizada = definitiva; contingência/pendente = guardável como pendente de validação
     fiscal; cancelada/rejeitada = bloqueada). gravar_validada e pode_alimentar_financeiro exigem as duas coisas: conta consistente E nota autorizada.
     Baixa confiança vem primeiro: leitura incerta explica a divergência. opts.confianca (0 a 1) é a confiança da leitura de foto/PDF; XML não precisa. */
  function nfVeredito(nota,opts){nota=nota||{};opts=opts||{};var s=nfValidarSoma(nota),baixa=[],div=[],av=s.avisos.slice();
    s.lacunas.forEach(function(x){baixa.push(x)});s.divergencias.forEach(function(x){div.push(x)});
    /* dados ESSENCIAIS para registrar a compra (o Mercado precisa de estabelecimento, data, total e itens com descrição, quantidade e valor): ausentes = "dados incompletos", dito com clareza. Nada é inventado. */
    var emi=nota.emitente||{};
    if(!nota.data_emissao)baixa.push({codigo:"sem_data",texto:"Falta a data da nota (necessária para lançar a compra no Mercado).",item:null});
    if(!String(emi.nome||"").trim())baixa.push({codigo:"sem_emitente",texto:"Falta o nome do estabelecimento (necessário para lançar a compra no Mercado).",item:null});
    if(!nota.modelo)baixa.push({codigo:"sem_modelo",texto:"O modelo da nota (NFC-e 65 ou NF-e 55) não foi identificado: informe no formulário.",item:null});
    (Array.isArray(nota.itens)?nota.itens:[]).forEach(function(i,k){if(!i||!String(i.descricao||"").trim())baixa.push({codigo:"item_sem_descricao",texto:"Item "+(k+1)+": falta a descrição.",item:k+1})});
    /* confiança da IA (decisão do dono, 20/11/2026): abaixo de 60% NÃO se confirma (leia de novo); de 60% a 69% confirma COM AVISO de baixa confiança; a partir de 70% segue normal. Ela nunca é o único critério:
       a conta, os dados essenciais, a situação fiscal e a duplicidade valem do mesmo jeito. XML não tem confiança. */
    var cf=opts.confianca,min=opts.minimo!=null?+opts.minimo:NF_CONF_MIN,confInfo=null;
    if(nota.formato!=="xml"&&typeof cf==="number"&&isFinite(cf)){var pc=Math.round(cf*100);
      confInfo={valor:cf,nivel:cf<min?"bloqueia":cf<NF_CONF_ALERTA?"aviso":"normal",texto:"Confiança da leitura: "+pc+"%"+(cf<min?" (abaixo do mínimo de "+Math.round(min*100)+"%: leia de novo com outra foto)":cf<NF_CONF_ALERTA?" (baixa confiança: confira todos os valores com o documento)":" (informação)")+"."};
      if(cf<min)baixa.push({codigo:"confianca_baixa",texto:"Confiança da leitura ("+pc+"%) abaixo do mínimo de "+Math.round(min*100)+"%: leia de novo com outra foto (corrigir o formulário não muda a confiança da IA).",item:null});
      else if(cf<NF_CONF_ALERTA)av.push("Baixa confiança ("+pc+"%): confira todos os valores com o documento antes de dizer que está de acordo.")}
    /* foto/PDF sem chave legível NÃO bloqueia: a chave não é indispensável para registrar a compra. A nota entra como pendente fiscal (nunca validada) e sem a checagem de duplicidade pela chave. XML sem chave válida continua inválido. */
    var semChave=nota.formato!=="xml"&&!(nota.chave&&nota.chave_valida!==false);
    if(semChave)av.push(!nota.chave?"A chave de acesso não está impressa ou legível nesta nota: ela entra sem validação oficial e sem checagem de duplicidade pela chave.":"A chave de acesso lida não passou na validação e não será usada: a nota entra como pendente fiscal, sem checagem de duplicidade pela chave.");
    else if(!nota.chave||nota.chave_valida===false)baixa.push({codigo:"chave_invalida",texto:"A chave de acesso está ausente ou não passou na validação.",item:null});
    /* situação fiscal é independente da conta: valores certos não tornam a nota autorizada, e nota autorizada pode ter a conta errada */
    var sit=NF_SITUACOES[nota.situacao]?nota.situacao:"pendente",fiscal={situacao:sit,rotulo:NF_SITUACOES[sit],definitiva:sit==="autorizada",pendente:sit==="contingencia"||sit==="pendente",bloqueada:sit==="cancelada"||sit==="rejeitada"},bloqueios=[];
    if(fiscal.bloqueada)bloqueios.push({codigo:"situacao_"+sit,texto:"Nota "+(sit==="cancelada"?"cancelada":"rejeitada")+": não vale como compra fiscal validada e não alimenta o Financeiro. Refaça a leitura ou trate a compra por outra via; o documento e a tentativa ficam registrados para auditoria."});
    else if(fiscal.pendente)av.push("A nota está "+NF_SITUACOES[sit].toLowerCase()+": pode ser guardada sem validação oficial.");
    if(nota.diferenca_pagamento!=null&&Math.abs(nfCent(nota.diferenca_pagamento))>NF_TOL_CENT)av.push("O valor a pagar difere do total da nota em "+nfReais(nfCent(nota.diferenca_pagamento))+".");
    var classe=baixa.length?"baixa_confianca":div.length?"divergente":"consistente",motivos=baixa.map(function(x){return {tipo:"baixa_confianca",codigo:x.codigo,texto:x.texto,item:x.item}}).concat(div.map(function(x){return {tipo:"divergencia",codigo:x.codigo,texto:x.texto,item:x.item}}));
    var validada=classe==="consistente"&&fiscal.definitiva&&!semChave,pendente=classe==="consistente"&&(fiscal.pendente||(fiscal.definitiva&&semChave));
    var acao=fiscal.bloqueada?"bloquear":classe==="consistente"?(fiscal.definitiva&&!semChave?"gravar":"gravar_pendente_fiscal"):classe==="divergente"?"corrigir":"nova_leitura";
    var d=s.diferenca,txt=d==null?null:nfCent(d)===0?"Os itens fecham com o total fiscal.":nfReais(nfCent(d))+" "+(d>0?"a mais":"a menos")+" que o total fiscal.";
    return {classe:classe,rotulo:{consistente:"Consistente",divergente:"Divergente",baixa_confianca:baixa.length&&baixa.every(function(x){return x.codigo==="confianca_baixa"})?"Baixa confiança":"Dados incompletos"}[classe],fiscal:fiscal,sem_chave:semChave,confianca_info:confInfo,acao:acao,
      gravar_validada:validada,gravar_pendente:pendente,pode_alimentar_financeiro:validada,bloqueios:bloqueios,auditoria:{preservar_documento:true,registrar_tentativa:!validada},
      diferenca:d,diferenca_texto:txt,motivos:motivos,avisos:av,soma:s}}
  /* duplicidade da nota contra o que já existe: notas fiscais, compras online, notas do Mercado e despesas. existentes = {notas, compras, mercado, despesas}
     (linhas como o banco devolve; ver docs/fiscal.md). "confirmada" = é a mesma nota (chave, arquivo ou emitente + modelo + série + número) ou a compra/nota
     já cita a chave; "possivel" = mesma data e valor (a 1 centavo) do mesmo estabelecimento. Só aponta: nunca grava, nunca cria despesa.
     acao: "atualizar_situacao" (mesma nota, guardada como pendente/contingência e agora com situação definida: o histórico fica), "ja_gravada" (nada a fazer), "vincular" (compra confirmada), "confirmar_vinculo" (só possível), "gravar_nova". */
  function nfDuplicidade(nota,existentes,opts){nota=nota||{};existentes=existentes||{};opts=opts||{};var ig=opts.ignorar_id,ach=[],V=nota.valores||{},em=nota.emitente||{},
      chave=nfDigitos(nota.chave),sha=String(opts.sha256||"").toLowerCase(),cnpj=nfDigitos(em.cnpj),data=nota.data_emissao||null,estab_p=nfPalavras(alEstab(em.nome)),
      tots=[nfCent(V.total),nfCent(V.a_pagar)].filter(function(x){return x!=null});
    function perto(v){var c=nfCent(v);return c!=null&&tots.some(function(t){return Math.abs(t-c)<=NF_TOL_CENT})}
    function nomeBate(n){var a=nfPalavras(alEstab(n)),b=estab_p;if(!a.length||!b.length)return false;var m=a.length<=b.length?a:b,g=a.length<=b.length?b:a;return m.every(function(w){return g.indexOf(w)>=0})}
    function add(o,n,id,motivo,x){ach.push({origem:o,nivel:n,id:id==null?null:id,motivo:motivo,registro:x})}
    (existentes.notas||[]).forEach(function(x){if(!x||(ig!=null&&x.id===ig))return;
      if(chave.length===44&&nfDigitos(x.chave)===chave)add("nota","confirmada",x.id,"a chave de acesso já está gravada",x);
      else if(sha&&String(x.sha256||"").toLowerCase()===sha)add("nota","confirmada",x.id,"o mesmo arquivo (SHA-256) já foi gravado",x);
      else if(cnpj.length===14&&nfDigitos(x.emitente_cnpj)===cnpj&&nota.numero!=null&&String(+x.numero)===String(+nota.numero)&&String(+x.serie||0)===String(+nota.serie||0)&&String(x.modelo||"")===String(nota.modelo||""))add("nota","confirmada",x.id,"mesmo emitente, modelo, série e número",x);
      else if(data&&x.data_emissao===data&&perto(x.valor_total)&&(cnpj.length===14?nfDigitos(x.emitente_cnpj)===cnpj:false))add("nota","possivel",x.id,"mesmo emitente, mesma data e mesmo valor",x)});
    (existentes.compras||[]).forEach(function(x){if(!x)return;
      if(chave.length===44&&nfDigitos(x.chave_nfe)===chave)add("compras","confirmada",x.id,"a compra online já cita esta nota fiscal",x);
      else if(data&&x.data===data&&perto(x.total_pago)&&nomeBate(x.vendedor||CO_LOJAS[x.loja]))add("compras","possivel",x.id,"mesma data, mesmo valor e mesmo estabelecimento em Compras online",x)});
    (existentes.mercado||[]).forEach(function(x){if(!x)return;var nome=x.mercado!=null?x.mercado:x.mercados&&x.mercados.nome;
      if(chave.length===44&&nfDigitos(x.chave)===chave)add("mercado","confirmada",x.id,"a compra do Mercado já cita esta nota fiscal",x);
      else if(data&&x.data===data&&perto(x.total)&&nomeBate(nome))add("mercado","possivel",x.id,"mesma data, mesmo valor e mesmo estabelecimento no Mercado",x)});
    (existentes.despesas||[]).forEach(function(x){if(!x)return;var nome=x.estabelecimento||x.descricao||"";
      if(data&&x.data===data&&perto(x.valor!=null?x.valor:x.total)&&(!nome||nomeBate(nome)))add("despesa","possivel",x.id,"já há uma despesa com a mesma data e o mesmo valor",x)});
    var rank={confirmada:2,possivel:1},melhor=function(o){var r=null;ach.forEach(function(a){if(a.origem===o&&(!r||rank[a.nivel]>rank[r.nivel]))r=a});return r};
    var jaNota=melhor("nota"),jaGravada=!!(jaNota&&jaNota.nivel==="confirmada"),alvo=null;
    ["compras","mercado"].forEach(function(o){var a=melhor(o);if(a&&(!alvo||rank[a.nivel]>rank[alvo.nivel]))alvo=a});
    var reg=jaGravada?jaNota.registro:null,trans=reg&&NF_TRANSICOES[reg.situacao],atualiza=trans&&trans.indexOf(nota.situacao)>=0?{id:reg.id,de:reg.situacao,para:nota.situacao}:null;
    var acao=atualiza?"atualizar_situacao":jaGravada?"ja_gravada":alvo?(alvo.nivel==="confirmada"?"vincular":"confirmar_vinculo"):"gravar_nova";
    return {duplicada:jaGravada,atualizar_situacao:atualiza,possivel_duplicada:!!(jaNota&&jaNota.nivel==="possivel"),acao:acao,vinculo_sugerido:alvo?{modulo:alvo.origem,id:alvo.id,nivel:alvo.nivel,motivo:alvo.motivo}:null,
      pode_criar_despesa:false,tem_despesa:ach.some(function(a){return a.origem==="despesa"||a.origem==="compras"||a.origem==="mercado"}),achados:ach.map(function(a){return {origem:a.origem,nivel:a.nivel,id:a.id,motivo:a.motivo}})}}
  /* ===== Lote 1.3: a decisão de gravação que a tela #fiscal e nfParaGravar seguem (veredito + duplicidade; só regras puras) =====
     modo: "validada" (conta consistente E nota autorizada), "pendente_fiscal" (conta consistente, contingência/pendente: guarda sem validar nem conferir)
     ou "bloqueada" (conta divergente, baixa confiança, cancelada, rejeitada ou nota que já existe). Nunca gera despesa. dup = resultado de nfDuplicidade (ou null). */
  var NF_ORIGENS={nota:"na Central Fiscal",compras:"em Compras online",mercado:"no Mercado",despesa:"nas despesas"};
  function nfDecisaoGravacao(nota,dup,opts){var ve=nfVeredito(nota,opts),bl=[],av=ve.avisos.slice(),bd=[],ad=[];
    if(ve.acao==="bloquear")ve.bloqueios.forEach(function(b){bl.push(b.texto)});
    else if(ve.classe!=="consistente")ve.motivos.forEach(function(m){bl.push((ve.classe==="divergente"?"A conta não fecha: ":m.codigo==="confianca_baixa"?"Baixa confiança: ":"Dados incompletos: ")+m.texto)});
    if(opts&&Array.isArray(opts.qr_conflitos))opts.qr_conflitos.forEach(function(t){bl.push("Conflito com o QR Code: "+t)});
    if(dup){
      if(dup.duplicada){var at=dup.atualizar_situacao;
        bd.push(at?"Esta nota já está na Central Fiscal como "+(NF_SITUACOES[at.de]||at.de).toLowerCase()+" e o arquivo traz a situação "+(NF_SITUACOES[at.para]||at.para).toLowerCase()+": a atualização da situação ainda não é feita por esta tela.":"Esta nota já está na Central Fiscal: não é gravada de novo.")}
      else (dup.achados||[]).forEach(function(a){
        if(a.origem==="nota")ad.push("Possível duplicidade: já há nota do mesmo emitente, data e valor na Central Fiscal ("+a.motivo+"). Confira antes de seguir.");
        else if(a.nivel==="confirmada")ad.push("Esta compra já existe "+NF_ORIGENS[a.origem]+" ("+a.motivo+"). Nenhuma despesa será criada pela nota.");
        else ad.push("Possível duplicidade "+NF_ORIGENS[a.origem]+": "+a.motivo+". Nenhuma despesa será criada pela nota.")})}
    bl=bl.concat(bd);av=av.concat(ad);
    var modo=bl.length?"bloqueada":ve.fiscal.definitiva&&!ve.sem_chave?"validada":"pendente_fiscal";
    return {pode:!bl.length,modo:modo,bloqueios:bl,avisos:av,bloqueios_dup:bd,avisos_dup:ad,conferir_permitido:modo==="validada",gera_despesa:false,veredito:ve,duplicidade:dup||null}}
  /* ===== Lote 1.4: nota em foto ou PDF lida pela IA (ação fiscal.nota da rac-ia). Aqui só regras puras: o arquivo, o mascaramento, o mapa do JSON da IA para o leitor
     de XML, a confiança e a correção manual. A IA nunca aprova: o resultado entra em nfNormalizar e passa por nfVeredito/nfDuplicidade como qualquer nota. ===== */
  var NF_IA_MAX_IMG=12*1024*1024,NF_IA_MAX_PDF=10*1024*1024,NF_IA_MAX_PAG=4,NF_IA_CRITICOS=["chave","total","total_produtos","itens","data_emissao","emitente_cnpj","descontos","modelo"];
  /* tipo REAL do arquivo pelos primeiros bytes (a extensão e o tipo declarado não decidem nada) */
  function nfTipoReal(b){b=b||[];var s=function(i,n){var t="";for(var k=0;k<n;k++)t+=String.fromCharCode(b[i+k]||0);return t};
    if(b[0]===0xFF&&b[1]===0xD8&&b[2]===0xFF)return {tipo:"jpeg",mime:"image/jpeg"};
    if(b[0]===0x89&&s(1,3)==="PNG"&&b[4]===0x0D&&b[5]===0x0A&&b[6]===0x1A&&b[7]===0x0A)return {tipo:"png",mime:"image/png"};
    if(s(0,4)==="RIFF"&&s(8,4)==="WEBP")return {tipo:"webp",mime:"image/webp"};
    if(s(0,5)==="%PDF-")return {tipo:"pdf",mime:"application/pdf"};
    if(s(4,4)==="ftyp"&&/^(heic|heix|hevc|hevx|mif1|msf1)/.test(s(8,4)))return {tipo:"heic",mime:"image/heic"};
    return null}
  var NF_IA_EXT={jpg:"jpeg",jpeg:"jpeg",png:"png",webp:"webp",pdf:"pdf"},NF_IA_MIME={"image/jpeg":"jpeg","image/jpg":"jpeg","image/png":"png","image/webp":"webp","application/pdf":"pdf"};
  /* confere UM arquivo antes de qualquer envio: tamanho, conteúdo real e coerência com a extensão e o tipo declarado. info = {nome, tamanho, cabecalho (primeiros bytes), tipoDeclarado} */
  function nfArquivoIA(info){info=info||{};var nome=String(info.nome||"arquivo").slice(0,120),t=+info.tamanho;
    function no(e){return {ok:false,erro:nome+": "+e,tipo:null,mime:null}}
    if(!(t>0))return no("arquivo vazio.");
    var real=nfTipoReal(info.cabecalho);
    if(!real)return no("formato não suportado. Envie uma foto JPEG, PNG ou WebP, ou um PDF.");
    if(real.tipo==="heic")return no("foto em HEIC não é aceita. Tire a foto em JPEG (Ajustes > Câmera > Formatos > Mais compatível) ou exporte como JPEG.");
    var ext=(/\.([A-Za-z0-9]+)$/.exec(nome)||[])[1],e=ext?NF_IA_EXT[ext.toLowerCase()]:null,d=info.tipoDeclarado?NF_IA_MIME[String(info.tipoDeclarado).toLowerCase().split(";")[0].trim()]:null;
    if(e&&e!==real.tipo)return no("o conteúdo é "+real.tipo.toUpperCase()+", mas o nome diz "+ext.toUpperCase()+". Por segurança o arquivo não foi usado.");
    if(d&&d!==real.tipo)return no("o conteúdo é "+real.tipo.toUpperCase()+", mas o tipo informado pelo aparelho é outro. Por segurança o arquivo não foi usado.");
    if(real.tipo==="pdf"&&t>NF_IA_MAX_PDF)return no("PDF grande demais (limite de 10 MB).");
    if(real.tipo!=="pdf"&&t>NF_IA_MAX_IMG)return no("imagem grande demais (limite de 12 MB).");
    return {ok:true,erro:null,tipo:real.tipo==="pdf"?"pdf":"imagem",formato:real.tipo,mime:real.mime}}
  /* o conjunto escolhido: um PDF OU de 1 a 4 fotos (nunca misturados) */
  function nfLoteIA(lista){var L=lista||[];if(!L.length)return {ok:false,erro:"Escolha uma foto ou um PDF da nota.",tipo:null};
    var ruins=L.filter(function(x){return !x||!x.ok});if(ruins.length)return {ok:false,erro:ruins.map(function(x){return x&&x.erro||"arquivo inválido"}).join(" "),tipo:null};
    var pdfs=L.filter(function(x){return x.tipo==="pdf"}).length;
    if(pdfs&&L.length>1)return {ok:false,erro:"Envie um PDF sozinho ou até 4 fotos da mesma nota; não misture.",tipo:null};
    if(L.length>NF_IA_MAX_PAG)return {ok:false,erro:"No máximo "+NF_IA_MAX_PAG+" fotos por nota.",tipo:null};
    return {ok:true,erro:null,tipo:pdfs?"pdf":"imagem"}}
  /* PDF com conteúdo ativo (script, ação de lançar, arquivo embutido…): melhor esforço sobre os bytes lidos como texto latino; o PDF só é desenhado em imagem, nunca executado */
  function nfPdfAtivo(t){return /\/(JavaScript|JS|Launch|EmbeddedFiles?|RichMedia|SubmitForm|ImportData)(?![A-Za-z])/.test(String(t==null?"":t))}
  /* CPF válido no texto vira máscara antes de ir à IA */
  function nfMascararCpf(t){return String(t==null?"":t).replace(/(^|[^0-9])(\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2})(?!\d)/g,function(m,a,b){return nfCpfDvOk(b.replace(/\D/g,""))?a+"***.***.***-**":m})}
  /* JSON validado da IA → o mesmo formato do leitor de XML (entra em nfNormalizar). Situação só com evidência: "autorizada" exige protocolo de 15 dígitos legível.
     A confiança da IA é limitada a 0,85 quando ela mesma marca como incerto um item ou um campo crítico. */
  function nfLerIA(res,formato){res=res||{};var av=[],c=+res.confianca;if(!isFinite(c)||c<0||c>1)c=0;
    var inc=(Array.isArray(res.incertos)?res.incertos:[]).map(function(x){return {campo:String(x&&x.campo||"").slice(0,60),motivo:String(x&&x.motivo||"").slice(0,200)}}).filter(function(x){return x.campo});
    var comp=res.componentes||{},itens=(Array.isArray(res.itens)?res.itens:[]).map(function(i){i=i||{};return {descricao:i.descricao,codigo:i.codigo,qtd:i.qtd,unidade:i.unidade,unitario:i.unitario,total:i.total,desconto:i.desconto}}),
      itIncertos=(Array.isArray(res.itens)?res.itens:[]).map(function(i,k){return i&&i.incerto===true?k+1:0}).filter(Boolean);
    var critico=inc.some(function(x){return NF_IA_CRITICOS.indexOf(x.campo)>=0});
    if(itIncertos.length||critico)av.push("A IA marcou item ou campo importante como incerto: confira esses pontos antes de dizer que está de acordo.")
    var sit=res.situacao,prot=nfDigitos(res.protocolo),fmt=formato==="pdf"?"pdf":"imagem";
    if(sit==="autorizada"&&prot.length!==15){av.push("A IA leu a nota como autorizada, mas sem um protocolo legível de 15 dígitos: tratada como pendente.");sit="pendente"}
    var lido={formato:fmt,chave:res.chave,modelo:res.modelo,serie:res.serie,numero:res.numero,data_emissao:res.data_emissao,emitente:{nome:res.emitente_nome,cnpj:res.emitente_cnpj,uf:res.emitente_uf},
      protocolo:prot.length===15?prot:null,cStat:sit==="autorizada"?100:sit==="rejeitada"?204:null,cancelada:sit==="cancelada",contingencia:sit==="contingencia",
      valores:{produtos:res.total_produtos,descontos:res.descontos,frete:res.frete,outras:res.outras,impostos:res.impostos,total:res.total,a_pagar:res.valor_pago,seguro:comp.seguro,st:comp.st,fcp_st:comp.fcp_st,ipi:comp.ipi,ii:comp.ii,ipi_devol:comp.ipi_devol,deson:comp.deson},
      pagamentos:(Array.isArray(res.pagamentos)?res.pagamentos:[]).map(function(p){p=p||{};return {forma:p.forma,valor:p.valor}}),itens:itens};
    return {lido:lido,confianca:c,incertos:inc,itens_incertos:itIncertos,avisos:av,formato:fmt}}
  /* correção manual: aplica o que a pessoa digitou (texto, como na tela) sobre o lido; vazio vira ausente. Quem chama roda nfNormalizar de novo e revalida tudo. */
  function nfCorrigir(lido,c){var l=JSON.parse(JSON.stringify(lido||{}));c=c||{};l.emitente=l.emitente||{};l.valores=l.valores||{};
    var tx=function(v){v=v==null?"":String(v).trim();return v?v:null};
    if("emitente_nome" in c)l.emitente.nome=tx(c.emitente_nome);if("emitente_cnpj" in c)l.emitente.cnpj=nfDigitos(c.emitente_cnpj)||null;
    if("chave" in c)l.chave=nfDigitos(c.chave)||null;["data_emissao","numero","serie","modelo"].forEach(function(k){if(k in c)l[k]=tx(c[k])});
    ["produtos","descontos","frete","outras","total"].forEach(function(k){if(c.valores&&k in c.valores)l.valores[k]=tx(c.valores[k])});
    if(Array.isArray(c.itens))l.itens=c.itens.map(function(i){i=i||{};return {descricao:tx(i.descricao),codigo:tx(i.codigo),qtd:tx(i.qtd),unidade:tx(i.unidade),unitario:tx(i.unitario),total:tx(i.total),desconto:tx(i.desconto)}});
    return l}
  /* confiança da IA (0 a 1), só informação: não existe mais mínimo para confirmar nem "revisão" que a transforme em 100% */
  function nfConfiancaIA(ia){ia=ia||{};return +ia.confianca>=0&&+ia.confianca<=1?+ia.confianca:0}
  /* ===== QR Code da NFC-e (lido no próprio aparelho): a chave de acesso vem do parâmetro p da URL (p=CHAVE|versão|ambiente|…), de chNFe ou de 44 dígitos soltos.
     Só vale depois de passar na validação completa (44 dígitos, UF, mês, CNPJ, modelo e dígito verificador). Nada aqui fala com a rede. ===== */
  function nfQrChave(texto){var t=String(texto==null?"":texto).trim(),o={ok:false,chave:null,url:null,host:null,erros:[]};
    if(!t){o.erros.push("QR Code vazio.");return o}
    var m=/^https?:\/\/([^\/?#\s]+)[^\s]*$/i.exec(t),cand=null,q;
    if(m){o.url=t.slice(0,600);o.host=m[1].toLowerCase();
      q=/[?&]p=([^&#]*)/i.exec(t);if(q){var p0=q[1];try{p0=decodeURIComponent(p0)}catch(e){}cand=nfDigitos(p0.split("|")[0])}
      if(!cand||cand.length!==44){q=/[?&]chNFe=([^&#]*)/i.exec(t);if(q)cand=nfDigitos(q[1])}}
    if(!cand||cand.length!==44){q=/(?:^|\D)(\d{44})(?!\d)/.exec(t);if(q)cand=q[1]}
    if(!cand||cand.length!==44){o.erros.push("O QR Code não traz uma chave de acesso de 44 dígitos.");return o}
    var v=nfValidarChave(cand);if(!v.ok){o.erros=v.erros.map(function(e){return e.texto});return o}
    o.ok=true;o.chave=v.chave;o.campos=v.campos;return o}
  /* confronta a chave do QR Code com o que a IA leu. Nunca escolhe em silêncio:
     sem_qr / invalido → segue só com a IA; complementou → a IA não tinha chave válida e a do QR entra (com os campos que a nota não trazia: modelo, série, número, CNPJ, tirados da própria chave);
     confere → as duas são iguais; conflito → as duas são válidas e diferentes: fica a da leitura, o conflito é mostrado e impede confirmar até a pessoa decidir no formulário. */
  function nfQrConferir(lido,qr){var l=JSON.parse(JSON.stringify(lido||{})),r={estado:"sem_qr",lido:l,chave_qr:null,chave_ia:null,avisos:[],conflitos:[]};
    if(!qr)return r;
    if(!qr.ok){r.estado="invalido";r.avisos.push("O QR Code foi lido, mas não traz uma chave de acesso válida"+((qr.erros||[]).length?" ("+qr.erros[0]+")":"")+": seguimos só com a leitura da IA.");return r}
    var ia=nfDigitos(l.chave),iaOk=ia.length===44&&nfValidarChave(ia).ok,c=qr.campos||{};r.chave_qr=qr.chave;r.chave_ia=iaOk?ia:null;
    if(iaOk&&ia!==qr.chave){r.estado="conflito";r.conflitos.push("a chave de acesso do QR Code ("+qr.chave+") é diferente da chave lida pela IA ("+ia+"). Confira no documento e deixe a correta no formulário “Corrigir os dados lidos”.");return r}
    if(iaOk){r.estado="confere";r.avisos.push("A chave de acesso lida pela IA confere com a do QR Code.");return r}
    l.chave=qr.chave;l.emitente=l.emitente||{};r.estado="complementou";var comp=[];
    if(!l.modelo&&c.modelo){l.modelo=c.modelo;comp.push("modelo")}
    if((l.serie==null||l.serie==="")&&c.serie!=null){l.serie=String(c.serie);comp.push("série")}
    if((l.numero==null||l.numero==="")&&c.numero){l.numero=String(c.numero);comp.push("número")}
    if(!nfDigitos(l.emitente.cnpj)&&c.cnpj){l.emitente.cnpj=c.cnpj;comp.push("CNPJ do emitente")}
    r.avisos.push("A chave de acesso veio do QR Code da nota (validada pelo dígito verificador)"+(ia?"; a que a IA leu estava incompleta ou inválida":"")+(comp.length?". Também vieram da chave: "+comp.join(", "):"")+". A situação fiscal NÃO muda por causa do QR Code.");
    return r}
  /* consulta pública oficial: o RAC NÃO consulta a SEFAZ (a página pública tem proteção contra robôs, que não se contorna). Só oferece o endereço do próprio QR Code, se for https de um domínio oficial (.gov.br), para a pessoa abrir.
     A consulta indisponível nunca bloqueia a entrada no Mercado e nunca transforma pendente em autorizada: a situação só muda com evidência (protocolo), pelo caminho que já existe. */
  function nfConsultaSefaz(qr){var u=qr&&qr.ok&&qr.url?String(qr.url):"",ok=/^https:\/\/[a-z0-9.-]+\.gov\.br(?:[\/?#:]|$)/i.test(u);
    return {automatica:false,disponivel:ok,link:ok?u:null,bloqueia:false,altera_situacao:false,motivo:ok?"A consulta oficial é aberta por você, no site da Fazenda; o RAC não a lê nem muda a situação fiscal sozinho.":"Sem endereço oficial de consulta nesta nota. Isso não impede a entrada no Mercado."}}
  /* campo "Tenho só a chave" da Central Fiscal: aceita os 44 dígitos (com espaço, ponto ou traço) ou o endereço do QR Code.
     Só informa o que a chave diz: não grava, não acessa a rede e não faz a nota valer (itens e valores só vêm do documento).
     Devolve {ok, chave, erros[], resumo:{uf, mes_emissao, cnpj, modelo, tipo, serie, numero}, consulta:{nome, link}|null} */
  function nfConsultaChave(c){c=c||{};
    if(c.modelo==="55")return {nome:"Portal Nacional da NF-e",link:"https://www.nfe.fazenda.gov.br/portal/"};
    if(c.modelo==="65"&&c.sigla_uf==="SP")return {nome:"consulta de NFC-e da Fazenda de São Paulo",link:"https://www.nfce.fazenda.sp.gov.br/"};
    return null}
  function nfChaveColada(texto){var t=String(texto==null?"":texto).trim(),o={ok:false,chave:null,erros:[],resumo:null,consulta:null};
    if(!t){o.erros.push("Cole a chave de acesso (44 dígitos).");return o}
    var d=nfDigitos(t),q,v,c;
    if(d.length!==44){q=nfQrChave(t);if(q.ok)d=q.chave;else if(q.url){o.erros=q.erros;return o}}
    v=nfValidarChave(d);
    if(!v.ok){o.erros=v.erros.map(function(e){return e.texto});return o}
    c=v.campos;o.ok=true;o.chave=v.chave;
    o.resumo={uf:c.sigla_uf,mes_emissao:c.mes_emissao,cnpj:c.cnpj,modelo:c.modelo,tipo:NF_MODELOS[c.modelo],serie:c.serie,numero:c.numero};
    o.consulta=nfConsultaChave(c);return o}
  /* o que a nota NÃO trouxe: campo ausente (não impresso: não é erro, nada é inventado) × campo ilegível (a IA marcou incerto) */
  function nfCamposInfo(lido,incertos){var l=lido||{},V=l.valores||{},inc={},out=[];(incertos||[]).forEach(function(x){if(x&&x.campo)inc[String(x.campo)]=x.motivo||""});
    [["produtos","Total dos produtos","total_produtos"],["descontos","Descontos","descontos"],["frete","Frete","frete"],["outras","Outras despesas","outras"],["a_pagar","Valor pago","valor_pago"]].forEach(function(c){
      var v=V[c[0]],vazio=v==null||v==="",il=c[2] in inc||c[0] in inc;
      if(il)out.push({campo:c[1],estado:"ilegivel",texto:c[1]+": ilegível na leitura"+(inc[c[2]]||inc[c[0]]?" ("+(inc[c[2]]||inc[c[0]])+")":"")+(vazio?"; não entrou na conta":"; confira o valor lido")+"."});
      else if(vazio)out.push({campo:c[1],estado:"ausente",texto:c[1]+": não impresso na nota (não é erro; nada foi presumido)."})});
    var ch=nfDigitos(l.chave);if("chave" in inc)out.push({campo:"Chave de acesso",estado:"ilegivel",texto:"Chave de acesso: ilegível na leitura"+(inc.chave?" ("+inc.chave+")":"")+"."});else if(!ch)out.push({campo:"Chave de acesso",estado:"ausente",texto:"Chave de acesso: não impressa ou não lida (não impede registrar a compra)."});
    return out}
  /* ===== Mercado: categorias oficiais, nome normalizado e classificação de produto (docs/mercado-classificacao.md).
     Puro: sem tela e sem banco. A decisão segue a ordem: produto já cadastrado (inclui a correção manual feita em Mercado → Produtos, que grava
     produtos.categoria) → regras pelo tipo do produto → ambíguo: categoria null e revisar:true, nunca um palpite. Sem IA e sem chamada paga. */
  var MK_CATEGORIAS=["Mercearia","Padaria","Açougue/Frios","Hortifruti","Chocolates/Doces","Bebidas","Limpeza","Higiene Pessoal","Peixaria","Casa/Utilidades","Bebê/Infantil","Farmácia"];
  /* produto sem classificação segura NÃO ganha categoria de verdade: fica com esta etiqueta neutra (o banco exige categoria) e revisar:true; a tela e o Sistema ("produtos do Mercado sem categoria") a mostram para o dono escolher */
  var MK_CAT_REVISAR="Outros";
  /* nomes antigos que viram uma categoria oficial (a unificação de "Limpeza/Descartáveis" em "Limpeza") */
  var MK_CAT_ANTIGAS={"limpeza/descartaveis":"Limpeza","descartaveis":"Limpeza","bebe":"Bebê/Infantil","infantil":"Bebê/Infantil"};
  function mkCatOficial(c){var t=String(c==null?"":c).trim(),n=norm(t).replace(/\s*\/\s*/g,"/");if(!t)return t;
    for(var i=0;i<MK_CATEGORIAS.length;i++)if(norm(MK_CATEGORIAS[i])===n)return MK_CATEGORIAS[i];
    return MK_CAT_ANTIGAS[n]||t}
  /* abreviações do cupom → palavra inteira (só as sem dúvida: "SAB" pode ser sabão ou sabonete e fica como veio) */
  var MK_ABREV={refrig:"Refrigerante",refr:"Refrigerante",min:"Mineral",fgo:"Frango",frgo:"Frango",ling:"Linguiça",tosc:"Toscana",rep:"Refil",liq:"Líquido",cong:"Congelado",choc:"Chocolate",
    bisc:"Biscoito",qj:"Queijo",qjo:"Queijo",mus:"Mussarela",mussar:"Mussarela",pres:"Presunto",amac:"Amaciante",deterg:"Detergente",desinf:"Desinfetante",guard:"Guardanapo",
    bov:"Bovino",sui:"Suíno",trad:"Tradicional",integ:"Integral",desn:"Desnatado",sach:"Sachê",cerv:"Cerveja",achoc:"Achocolatado",extr:"Extrato",gde:"Grande",cx:"Caixa",pct:"Pacote",
    feijao:"Feijão",acucar:"Açúcar",cafe:"Café",limao:"Limão",macarrao:"Macarrão",oleo:"Óleo",sabao:"Sabão",agua:"Água",file:"Filé",pao:"Pão",requeijao:"Requeijão",guarana:"Guaraná",
    frances:"Francês",higienico:"Higiênico",linguica:"Linguiça",salmao:"Salmão",tilapia:"Tilápia",camarao:"Camarão",pure:"Purê",cha:"Chá",hig:"Higiênico",sanitaria:"Sanitária",fat:"Fatiado"};
  var MK_LIGA=/^(de|da|do|das|dos|com|sem|e|para|em|a|o)$/;
  /* o que o cupom escreve sobrando: código no começo, parênteses de código, "kg" da balança no fim */
  function mkLimpar(t){return String(t==null?"":t).replace(/\([^)]*\d{4,}[^)]*\)/g," ").replace(/^\s*\d{4,}[\s\-.:]+/,"").replace(/(\D)[\s.]*(kg|un|und)\s*$/i,"$1").replace(/\bc\//gi,"com ").replace(/\bs\//gi,"sem ")
    .replace(/(\D)\.(?=\S)/g,"$1 ").replace(/\s+/g," ").trim()}
  /* "BISC WAFER TUBIN CHOCO" → "Biscoito Wafer Tubin Choco": expande o conhecido, mantém marca e sabor, não inventa o que falta */
  function mkNome(t){return mkLimpar(t).split(" ").filter(Boolean).map(function(w,i){var k=norm(w).replace(/[^a-z0-9]/g,"");
      if(MK_ABREV[k])return MK_ABREV[k];if(/^\d/.test(w))return w.toLowerCase().replace(/(\d)l$/,"$1L");if(i&&MK_LIGA.test(k))return w.toLowerCase();
      return w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()}).join(" ")}
  /* texto sem acento e com abreviações expandidas, para casar regras e comparar produtos */
  function mkTexto(t){return norm(mkNome(t)).replace(/[^a-z0-9]+/g," ").trim()}
  /* chave de igualdade de produto: ignora caixa, acento, abreviatura e pontuação (não mistura tamanhos: "200ml" ≠ "1,5l") */
  function mkChave(t){return norm(mkNome(String(t==null?"":t).replace(/(\d)[.,](\d)/g,"$1p$2"))).replace(/[^a-z0-9]+/g," ").trim()}
  var MK_NAO_FRESCO=/\b(molho|extrato|polpa|ketchup|catchup|palha|chips|em po|seco|seca|lata|conserva|enlatad[oa]|congelad[oa]|geleia|sorvete|pure|temperado)\b/;
  /* regras em ordem; [categoria, regex, exceção]. categoria null = ambíguo, vai para revisão */
  var MK_REGRAS=[
    /* Farmácia: só o que é medicamento de verdade (princípio ativo, marca conhecida, dose em mg/mcg/UI, forma farmacêutica sem ambiguidade). Vem ANTES de Bebê/Infantil ("dipirona gotas infantil" é remédio) e de Higiene (hidratante, protetor solar, enxaguante bucal e fio dental seguem em Higiene Pessoal).
       Palavras que também existem em outros produtos (gotas, cápsulas, xarope, solução, creme) NÃO bastam sozinhas: precisam de dose ou de um complemento farmacêutico. O nome do estabelecimento nunca entra aqui. */
    ["Farmácia",/\b(dipiron\w*|paracetamol|acetaminofeno|ibuprofen\w*|naproxen\w*|diclofenac\w*|nimesulid\w*|cetoprofen\w*|cetorolac\w*|meloxicam\w*|piroxicam\w*|tenoxicam\w*|acido acetilsalicilico|aspirina|ondansetron\w*|metoclopramid\w*|domperidon\w*|bromoprid\w*|dimenidrinat\w*|dramin|omeprazol\w*|esomeprazol\w*|pantoprazol\w*|lansoprazol\w*|ranitidin\w*|simeticon\w*|loperamid\w*|escopolamin\w*|butilescopolamin\w*|lactulos\w*|bisacodil\w*|amoxicilin\w*|azitromicin\w*|claritromicin\w*|cefalexin\w*|cefadroxil\w*|ciprofloxacin\w*|levofloxacin\w*|norfloxacin\w*|nitrofurantoin\w*|metronidazol\w*|sulfametoxazol\w*|doxiciclin\w*|fluconazol\w*|cetoconazol\w*|nistatin\w*|aciclovir\w*|valaciclovir\w*|ivermectin\w*|albendazol\w*|nitazoxanid\w*|dexametason\w*|prednison\w*|prednisolon\w*|betametason\w*|hidrocortison\w*|loratadin\w*|desloratadin\w*|cetirizin\w*|fexofenadin\w*|hidroxizin\w*|prometazin\w*|salbutamol\w*|budesonid\w*|ambroxol\w*|acetilcisteina|bromexin\w*|losartan\w*|valsartan\w*|olmesartan\w*|enalapril\w*|captopril\w*|anlodipin\w*|atenolol\w*|propranolol\w*|metoprolol\w*|carvedilol\w*|hidroclorotiazid\w*|furosemid\w*|espironolacton\w*|sinvastatin\w*|atorvastatin\w*|rosuvastatin\w*|metformin\w*|glibenclamid\w*|gliclazid\w*|insulin\w*|levotiroxin\w*|puran t4|varfarin\w*|clopidogrel\w*|sertralin\w*|fluoxetin\w*|escitalopram\w*|citalopram\w*|paroxetin\w*|amitriptilin\w*|clonazepam\w*|alprazolam\w*|diazepam\w*|lorazepam\w*|zolpidem\w*|rivotril|tramadol\w*|codein\w*|morfin\w*|gabapentin\w*|pregabalin\w*|carbamazepin\w*|ciclobenzaprin\w*|carisoprodol\w*|orfenadrin\w*|tizanidin\w*|colecalciferol|cianocobalamin\w*|polivitaminic\w*|sulfato ferroso|acido folico|dorflex|tylenol|neosaldina|novalgina|advil|cataflam|buscopan|torsilax|benegrip|engov|sonrisal|rinosoro|soro fisiologico|clorexidin\w*|iodopovidon\w*|pomada|colirios?|supositorios?|injetaveis?|ampolas?|comprimidos?|drageas?|capsulas? (gelatinosas?|moles?|duras?)|solucao (oral|injetavel|nasal|oftalmica|otologica)|suspensao oral|xarope (para|expectorante|de ambroxol)|gotas? (oftalmicas?|nasais?|otologicas?|orais?)|medicamentos?|remedios?|\d+(p\d+)? ?(mg|mcg|ug|ui)|\d+ ?(comp|cps|caps))\b/,/\b(capilar|cabelos?|modeladora|sapatos?|calcados?|couro)\b/],
    ["Bebê/Infantil",/\b(fraldas?|pampers|huggies|lencos? umedecidos?|mamadeiras?|chupetas?|formula infantil|papinhas?|infantil|bebe)\b/],
    ["Limpeza",/\b(detergentes?|amaciantes?|desinfetantes?|sabao|saboes|lava (loucas?|roupas?)|esponjas?|guardanapos?|papel toalha|toalhas? de papel|hastes? flexiveis?|cotonetes?|agua sanitaria|alvejantes?|cloro|limpador|multiuso|inseticidas?|saco de lixo|sacos? (de )?lixo|papel aluminio|filme pvc|desengordurante|descartaveis?|veja|cif|omo|ype|bombril|lysoform|pinho sol)\b/],
    ["Higiene Pessoal",/\b(papel higienico|sabonetes?|fio dental|listerine|enxaguante bucal|shampoo|condicionador|creme dental|pasta de dente|escova dental|desodorante|absorventes?|barbear|hidratante|protetor solar)\b/],
    [null,/\b(sab|alcool|agua oxigenada|bolo|racao|sacola|embalagem)\b/],
    ["Chocolates/Doces",/\b(wafer|trident|nutella|petit four|goma de mascar|chicletes?|pudim|bombons?|balas?|chocolates?|doces?|pirulitos?|pacoca)\b/],
    ["Bebidas",/\b(agua( mineral| com gas| de coco)?|refrigerantes?|refri|sucos?|cervejas?|coca cola|guarana|sprite|fanta|pepsi|schweppes|energetico|isotonico|vinho|vodka|whisky|cachaca)\b/],
    ["Padaria",/\b(pao de forma|pao frances|pao de queijo|paes?|pao|bisnaguinhas?|bisnagas?|empadas?|coxinhas?|pasteis|pastel|salgados?|esfihas?|croissants?)\b/],
    ["Mercearia",/\b(atum|sardinha)\b.*\b(lata|oleo|ralado)\b|\b(lata|oleo)\b.*\b(atum|sardinha)\b/],
    [null,/\b(atum|sardinha)\b/],
    ["Peixaria",/\b(peixes?|tilapia|salmao|merluza|pescada|corvina|bacalhau|camarao|lulas?|polvo|mariscos?|filet de peixe)\b/],
    ["Mercearia",/\bqueijo ralado\b/],
    ["Açougue/Frios",/\b(carnes?|bovin[oa]|acem|miolo|patinho|alcatra|picanha|fraldinha|contrafile|costela|costelinha|cupim|maminha|frango|sobrecoxa|coxa|asa|linguica|salsichas?|embutidos?|presunto|apresuntado|mussarela|mortadela|salame|peru|bacon|toucinho|calabresa|hamburguer|suin[oa]|pernil|lombo|bisteca|queijo)\b/],
    ["Hortifruti",/\b(bananas?|tomates?|cebolas?|batatas?|alface|limao|limoes|uvas?|macas?|mamao|cenouras?|abobora|abobrinha|pepinos?|pimentao|alho|mandioca|laranjas?|morangos?|berinjelas?|couve|brocolis|repolho|beterraba|chuchu|abacates?|abacaxi|melancia|melao|mangas?|peras?|kiwi|goiabas?|mexerica|tangerina|cheiro verde|salsa|salsinha|cebolinha|coentro|manjericao|hortela|rucula|agriao|espinafre|gengibre|inhame|vagem)\b/,MK_NAO_FRESCO],
    ["Casa/Utilidades",/\b(pilhas?|lampadas?|velas?|fosforos?|isqueiros?|copos?|pratos?|talheres?|vassouras?|rodo|baldes?|pano de (prato|chao)|cabides?|potes?|marmitas?|baterias?|fita adesiva|carvao|panelas?|frigideiras?|jarras?)\b/],
    ["Mercearia",/\b(arroz|feijao|macarrao|massa|espaguete|oleo|azeite|vinagre|acucar|adocante|cafe|leite|manteiga|margarina|requeijao|creme de leite|molho|extrato|polpa|maionese|ketchup|catchup|mostarda|biscoitos?|bolachas?|cream cracker|torradas?|farinha|fuba|sal|tempero|oregano|pimenta do reino|colorau|milho|ervilha|ovos?|aveia|cereal|granola|achocolatado|gelatina|fermento|amendoim|batata palha|batata frita|salgadinho|chips|geleia|mel|cha|sopa|lentilha|farofa|tapioca)\b/]
  ];
  /* classifica um item do cupom. ctx (opcional): {produtos:[{id,nome,categoria}], apelidos:{chaveDaDescricao:produto_id}}.
     Devolve {categoria|null, origem:"produto"|"regra"|"revisar", revisar, produto_id?, motivo?} */
  function mkClassificar(desc,nome,ctx){ctx=ctx||{};var prods=ctx.produtos||[],ch=mkChave(desc),pid=(ctx.apelidos||{})[ch],pr=null,i;
    if(pid)for(i=0;i<prods.length;i++)if(prods[i].id===pid){pr=prods[i];break}
    if(!pr&&ch)for(i=0;i<prods.length;i++)if(mkChave(prods[i].nome)===ch||(nome&&mkChave(prods[i].nome)===mkChave(nome))){pr=prods[i];break}
    if(pr&&pr.categoria)return {categoria:mkCatOficial(pr.categoria),origem:"produto",revisar:false,produto_id:pr.id};
    var tx=mkTexto(desc)+" "+mkTexto(nome||"");if(!tx.trim())return {categoria:null,origem:"revisar",revisar:true,motivo:"sem descrição"};
    for(i=0;i<MK_REGRAS.length;i++){var r=MK_REGRAS[i];if(r[1].test(tx)&&!(r[2]&&r[2].test(tx))){
      return r[0]?{categoria:r[0],origem:"regra",revisar:false}:{categoria:null,origem:"revisar",revisar:true,motivo:"nome ambíguo: escolha a categoria"}}}
    return {categoria:null,origem:"revisar",revisar:true,motivo:"sem regra para este produto"}}
  /* ===== Central Fiscal · confirmação única (docs/fiscal.md): correspondência de produto e de estabelecimento, decisões da entrada no Mercado, estados da nota e leitura da resposta do banco.
     Puro (sem tela, sem banco): um só cálculo para a tela, para os testes e para o que vai ao banco. A correspondência NUNCA bloqueia a entrada: sem par bom, o produto é criado. ===== */
  var MK_CASAR_CORTE=70,MK_CASAR_EMPATE=5;
  var MK_CASAR_VAZIAS={de:1,da:1,do:1,das:1,dos:1,e:1,em:1,com:1,c:1,s:1,a:1,o:1,un:1,und:1,unid:1};
  var MK_CASAR_EMB={lata:1,latas:1,garrafa:1,pet:1,vidro:1,caixa:1,pacote:1,sache:1,refil:1,pote:1,bandeja:1,saco:1,tetra:1,spray:1,bisnaga:1,"long":1,neck:1};
  var MK_CASAR_ALIAS={pct:"pacote",pcte:"pacote",cx:"caixa"};
  var MK_CASAR_VARIANTES={zero:1,diet:1,light:1,integral:1,desnatado:1,semidesnatado:1,sem:1,lactose:1,vegano:1,organico:1,importado:1};
  /* palavras que identificam o produto: marca, tipo, tamanho ("5 kg" vira "5kg") e embalagem; sem acento, abreviação expandida, sem palavras de ligação */
  function mkTokensCasar(t){
    var s=mkChave(t).replace(/(^| )(\d+(?:p\d+)?) (ml|lts?|litros?|l|gr|g|kg|quilos?|mg|und?|unid)(?= |$)/g,"$1$2$3"),out=[];
    s.split(" ").forEach(function(w){if(!w||MK_CASAR_VAZIAS[w])return;
      w=w.replace(/^(\d+(?:p\d+)?)(?:lts?|litros?)$/,"$1l").replace(/^(\d+(?:p\d+)?)gr$/,"$1g").replace(/^(\d+(?:p\d+)?)quilos?$/,"$1kg").replace(/^(\d+(?:p\d+)?)(?:und?|unid)$/,"$1un");
      w=MK_CASAR_ALIAS[w]||w;if(out.indexOf(w)<0)out.push(w)});
    return out}
  /* semelhança de 0 a 100: Jaccard SIMÉTRICO (palavras em comum ÷ palavras de um ou do outro), com marca, tamanho e embalagem contando como palavras.
     Tamanho diferente (200ml × 2L) ou embalagem diferente (lata × garrafa) nunca passa de 50. Igual nos dois sentidos: casar(a,b) = casar(b,a). */
  function mkSimilaridade(a,b){var A=mkTokensCasar(a),B=mkTokensCasar(b);if(!A.length||!B.length)return 0;
    var c=A.filter(function(w){return B.indexOf(w)>=0}).length,p=c/(A.length+B.length-c),soA=A.filter(function(w){return B.indexOf(w)<0}),soB=B.filter(function(w){return A.indexOf(w)<0});
    if(soA.length&&soB.length)p=Math.min(p,0.69);                       /* uma palavra trocada pela outra (marca, sabor, variante) é outro produto; só "um contém o outro" pode passar de 70 */
    if(soA.concat(soB).some(function(w){return MK_CASAR_VARIANTES[w]===1}))p=Math.min(p,0.69);     /* zero, diet, light, integral, sem… mudam o produto */
    [function(l){return l.filter(function(w){return /^\d+(?:p\d+)?(?:ml|l|g|kg|mg|un)$/.test(w)})},function(l){return l.filter(function(w){return MK_CASAR_EMB[w]===1})}].forEach(function(f){
      var x=f(A),y=f(B);if(x.length&&y.length&&!x.some(function(w){return y.indexOf(w)>=0}))p=Math.min(p,0.5)});
    return Math.round(p*100)}
  /* produto do Mercado para um item da nota: apelido (descrição já ligada antes) → nome igual depois de normalizar → parecido (≥ 70, sem empate dentro de 5 pontos, mesma unidade) → produto novo.
     Empate entre dois candidatos bons (duas marcas, duas embalagens) é ambíguo: não escolhe, cria produto novo. Devolve {tipo, produto_id, nome, pontos, ambigua, candidatos, categoria, revisar}. */
  function mkCasarProduto(desc,un,produtos,apelidos){
    produtos=produtos||[];apelidos=apelidos||{};
    var ch=mkChave(desc),pid=ch?apelidos[ch]:null,i,r={tipo:"nova",produto_id:null,nome:mkNome(desc),pontos:0,ambigua:false,candidatos:[],categoria:null,revisar:false};
    function usa(tipo,p,pontos,cand){return {tipo:tipo,produto_id:p.id,nome:p.nome,pontos:pontos,ambigua:false,candidatos:cand||[],categoria:p.categoria?mkCatOficial(p.categoria):null,revisar:false}}
    if(pid)for(i=0;i<produtos.length;i++)if(produtos[i].id===pid)return usa("apelido",produtos[i],100);
    if(ch)for(i=0;i<produtos.length;i++)if(mkChave(produtos[i].nome)===ch)return usa("exata",produtos[i],100);
    var cand=produtos.filter(function(x){return !un||!x.unidade||x.unidade===un}).map(function(x){return {id:x.id,nome:x.nome,pontos:mkSimilaridade(desc,x.nome),categoria:x.categoria}})
      .filter(function(x){return x.pontos>0}).sort(function(a,b){return b.pontos-a.pontos||(a.nome<b.nome?-1:1)}).slice(0,3);
    r.candidatos=cand;r.pontos=cand.length?cand[0].pontos:0;
    if(cand.length&&cand[0].pontos>=MK_CASAR_CORTE){
      if(cand[1]&&cand[1].pontos>=MK_CASAR_CORTE&&cand[0].pontos-cand[1].pontos<=MK_CASAR_EMPATE)r.ambigua=true;
      else return usa("aproximada",cand[0],cand[0].pontos,cand)}
    var cl=mkClassificar(desc,r.nome,{produtos:produtos,apelidos:apelidos});
    r.categoria=cl.categoria||MK_CAT_REVISAR;r.revisar=!cl.categoria;     /* sem classificação segura: etiqueta neutra "Outros" + revisar (nunca Mercearia por palpite): o dono ajusta em Mercado → Produtos. Produto já cadastrado e correção manual vêm antes (mkClassificar) */
    return r}
  var MK_CASAR_EMPRESA={ltda:1,sa:1,s:1,a:1,me:1,epp:1,eireli:1,cia:1,comercio:1,industria:1,e:1,de:1,da:1,do:1,dos:1,das:1,supermercado:1,supermercados:1,mercado:1,mercados:1,hipermercado:1,atacadista:1,atacado:1,loja:1,lojas:1};
  function mkTokensEstab(t){var out=[];mkChave(t).split(" ").forEach(function(w){if(w&&!MK_CASAR_EMPRESA[w]&&out.indexOf(w)<0)out.push(w)});return out}
  /* estabelecimento: CNPJ igual → nome parecido (≥ 70; nome todo contido no outro vale 80; sem empate) → novo, com o nome sem "LTDA", "S.A.", "EPP"… no fim */
  function mkCasarEstabelecimento(em,mercados){
    em=em||{};mercados=mercados||[];
    var cnpj=String(em.cnpj==null?"":em.cnpj).replace(/\D/g,""),nome=String(em.nome==null?"":em.nome).trim(),i,A=mkTokensEstab(nome),cand=[];
    if(cnpj.length===14)for(i=0;i<mercados.length;i++)if(String(mercados[i].cnpj==null?"":mercados[i].cnpj).replace(/\D/g,"")===cnpj)return {tipo:"cnpj",id:mercados[i].id,nome:mercados[i].nome,pontos:100,cnpj:cnpj};
    if(A.length)cand=mercados.map(function(m){var B=mkTokensEstab(m.nome);if(!B.length)return {id:m.id,nome:m.nome,pontos:0};
      var c=A.filter(function(w){return B.indexOf(w)>=0}).length,p=Math.round(c*100/(A.length+B.length-c));if(c>0&&c===Math.min(A.length,B.length))p=Math.max(p,80);return {id:m.id,nome:m.nome,pontos:p}})
      .filter(function(x){return x.pontos>0}).sort(function(a,b){return b.pontos-a.pontos||(a.nome<b.nome?-1:1)}).slice(0,3);
    if(cand.length&&cand[0].pontos>=MK_CASAR_CORTE&&!(cand[1]&&cand[1].pontos>=MK_CASAR_CORTE&&cand[0].pontos-cand[1].pontos<=MK_CASAR_EMPATE))
      return {tipo:"nome",id:cand[0].id,nome:cand[0].nome,pontos:cand[0].pontos,cnpj:cnpj||null};
    var bonito=mkNome(nome.replace(/\s+(?:S\.?\/?A\.?|LTDA\.?|EPP|EIRELI|ME)\s*$/i,"")).trim();
    return {tipo:"nova",id:null,nome:(bonito||nome||"Estabelecimento da nota").slice(0,120),pontos:cand.length?cand[0].pontos:0,cnpj:cnpj||null}}
  /* unidade do Mercado (un, kg ou l) de um item da nota: g vira kg e ml vira l (a quantidade é convertida no banco) */
  function nfUnidadeMercado(i){var u=i&&i.unidade,c=u&&typeof u==="object"?u.cod:u;return c==="kg"||c==="g"?"kg":c==="l"||c==="ml"?"l":"un"}
  /* o que o RAC vai usar para cada item e para o estabelecimento, calculado ANTES do "Estou de acordo" e mostrado ao lado do item */
  function nfEntradaDecisoes(nota,produtos,mercados,apelidos){
    var itens=(nota&&nota.itens)||[],mercado=mkCasarEstabelecimento((nota&&nota.emitente)||{},mercados),nomes={},its=itens.map(function(i,k){
      var un=nfUnidadeMercado(i),d=mkCasarProduto(i.descricao,un,produtos,apelidos);
      return {ordem:k,descricao:i.descricao||"",unidade:un,tipo:d.tipo,pontos:d.pontos,ambigua:d.ambigua,produto_id:d.produto_id,nome:d.nome,categoria:d.categoria,revisar:d.revisar,candidatos:d.candidatos}});
    var novos=0,rev=0,ex=0;its.forEach(function(x){if(x.tipo==="nova"){if(!nomes[mkChave(x.nome)]){nomes[mkChave(x.nome)]=1;novos++}if(x.revisar)rev++}else ex++});
    return {mercado:mercado,itens:its,resumo:{existentes:ex,novos:novos,revisar:rev,ambiguos:its.filter(function(x){return x.ambigua}).length}}}
  /* o que vai ao banco (p_decisoes): o banco confere que o produto é da casa e, se faltar decisão, cria produto em vez de bloquear */
  function nfEntradaPayload(dec){dec=dec||{};var m=dec.mercado||{};
    return {mercado:{id:m.id||null,nome:String(m.nome||"").slice(0,120),cnpj:m.cnpj||null,tipo:m.tipo||null},
      itens:(dec.itens||[]).map(function(x){var o={ordem:x.ordem,tipo:x.tipo,pontos:x.pontos};
        if(x.produto_id)o.produto_id=x.produto_id;else o.novo={nome:String(x.nome||"").slice(0,120),categoria:String(x.categoria||MK_CAT_REVISAR).slice(0,40),unidade:x.unidade==="kg"||x.unidade==="l"?x.unidade:"un"};return o})}}
  /* as quatro situações separadas de uma nota gravada: leitura, conferência humana, situação fiscal e entrada no Mercado. n = linha de notas_fiscais; ent = linha de notas_fiscais_entradas (ou null) */
  var NF_ENTRADA_MAX=6;
  function nfEstadosNota(n,ent){n=n||{};var s=n.situacao,f=n.formato_origem,out=[];
    out.push({chave:"leitura",rotulo:f==="xml"?"XML":f==="pdf"?"PDF":f==="imagem"?"Foto":"Origem não informada",tom:"fxok"});
    out.push(ent&&ent.confirmado_em?{chave:"conferencia",rotulo:"Estou de acordo"+(n.conferida_em?" · conferida":""),tom:"fxok",quando:ent.confirmado_em}:n.conferida_em?{chave:"conferencia",rotulo:"Conferida",tom:"fxok",quando:n.conferida_em}:{chave:"conferencia",rotulo:"Sem confirmação",tom:"fxpend"});
    out.push({chave:"fiscal",rotulo:NF_SITUACOES[s]||s||"—",tom:s==="autorizada"?"fxok":s==="cancelada"||s==="rejeitada"?"fxruim":"fxpend"});
    var e=ent&&ent.estado,m;
    if(e==="concluida"||e==="ja_no_mercado")m={chave:"mercado",rotulo:e==="ja_no_mercado"?"Já estava no Mercado":"Lançada no Mercado",tom:ent.revisar?"fxruim":"fxok",revisar:ent.revisar||null};
    else if(e==="pendente"||e==="falhou"){var auto=e==="pendente"||(!!ent.proxima_em&&(+ent.tentativas||0)<NF_ENTRADA_MAX);   /* a rotina retoma sozinha (060); depois de 6 tentativas fica o botão */
      m=auto?{chave:"mercado",rotulo:"Aguardando nova tentativa",tom:"fxpend",tentar:true,automatica:true,proxima_em:ent.proxima_em||null,erro:ent.erro||null}:{chave:"mercado",rotulo:"Falha na entrada",tom:"fxruim",tentar:true,erro:ent.erro||null}}
    else m={chave:"mercado",rotulo:s==="cancelada"||s==="rejeitada"?"Não lançada ("+(NF_SITUACOES[s]||s).toLowerCase()+")":"Não lançada no Mercado",tom:s==="cancelada"||s==="rejeitada"?"fxruim":"fxpend",lancar:!(s==="cancelada"||s==="rejeitada")};
    if(m.revisar)m.rotulo+=" · revisar: nota "+(m.revisar==="nota_rejeitada"?"rejeitada":"cancelada")+" depois da entrada";
    out.push(m);return out}
  /* a última consulta oficial de uma nota (notas_fiscais_consultas) em uma frase honesta: sem consulta registrada, diz que a validação oficial ainda não está habilitada; nunca afirma autorização sem o resultado "autorizada" registrado */
  function nfConsultaTexto(c,lida,n){
    var SEM="Validação oficial automática ainda não habilitada: a situação fiscal vem do documento e só muda por atualização manual ou ao reler o documento. A entrada no Mercado não depende dela.";
    if(!c)return n&&(n.situacao==="cancelada"||n.situacao==="rejeitada")?"Nota "+(NF_SITUACOES[n.situacao]||n.situacao).toLowerCase()+": não há mais o que consultar.":SEM;
    var q=function(x){if(!x)return "";var d=new Date(x);return isFinite(d)?d.toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):""};
    var R={autorizada:"autorização confirmada pela fonte oficial",cancelada:"cancelamento confirmado pela fonte oficial",denegada:"uso denegado pela fonte oficial",pendente:"a fonte oficial ainda não concluiu",nao_encontrada:"a nota não consta na fonte oficial (ainda)",indisponivel:"consulta oficial indisponível: nada foi alterado",erro:"resposta inesperada da fonte oficial: nada foi alterado",invalida:"resposta sem evidência suficiente: nada foi alterado"};
    return "Última consulta em "+q(c.consultado_em)+": "+(R[c.resultado]||c.resultado)+(c.mudou?" · a situação fiscal foi atualizada":"")+(c.motivo?" ("+c.motivo+")":"")+". "+(c.encerrada?"Consulta encerrada.":c.proxima_em?"Próxima por volta de "+q(c.proxima_em)+".":"")+" A entrada no Mercado não depende da consulta."}
  /* lê a resposta de nota_fiscal_confirmar (ou nota_fiscal_entrada_mercado) e diz o que aconteceu, sem nunca afirmar o que o banco não confirmou. nota = a nota lida na tela (para a situação fiscal) */
  function nfResultadoConfirmar(d,nota){d=d||{};var e=d.entrada||null,sit=NF_SITUACOES[(nota&&nota.situacao)||(d.fiscal&&d.fiscal.situacao)]||"";sit=sit?sit.toLowerCase():"";
    if(d.gravada===false){var f=d.fiscal||{};
      if(f.bloqueada===true||f.resultado==="bloqueada")return {estado:"bloqueada",ok:false,gravada:false,id:null,texto:"Nada foi lançado: o banco recusou a nota."+((f.motivos||[]).length?" "+f.motivos.join(" "):"")};
      if(f.duplicada===true||f.resultado==="duplicada"){var ja=e&&(e.estado==="concluida"||e.estado==="ja_no_mercado");
        return {estado:"duplicada",ok:false,gravada:false,id:d.nota_id||f.id||null,texto:"Esta nota já existe na Central Fiscal ("+(f.motivo==="arquivo"?"o mesmo arquivo":"a mesma chave de acesso")+"): nada foi criado de novo."+(ja?" Ela já está lançada no Mercado.":" Ela ainda não deu entrada no Mercado: abra-a na lista para concluir.")}}
      return {estado:"desconhecido",ok:false,gravada:false,id:null,texto:"O banco respondeu algo inesperado: não considere a nota gravada nem lançada."}}
    if(d.gravada!==true||!e)return {estado:"desconhecido",ok:false,gravada:false,id:null,texto:"O banco respondeu algo inesperado: não considere a nota gravada nem lançada."};
    var id=d.nota_id||null,base="Nota gravada na Central Fiscal"+(sit?" ("+sit+")":"");
    if(e.estado==="concluida"&&e.ja_existia)return {estado:"concluida",ok:true,gravada:true,id:id,mercado_nota_id:e.mercado_nota_id||null,texto:base+". A compra desta nota já estava lançada no Mercado: nada foi criado de novo.",avisos:[]};
    if(e.estado==="concluida"){var n=+e.itens||0,nv=+e.produtos_novos||0;
      return {estado:"concluida",ok:true,gravada:true,id:id,mercado_nota_id:e.mercado_nota_id||null,texto:base+" e lançada no Mercado: "+n+(n===1?" item":" itens")+(e.total!=null?", total R$ "+Number(e.total).toFixed(2).replace(".",","):"")+(nv?". "+nv+(nv===1?" produto novo":" produtos novos"):"")+".",avisos:e.avisos||[]}}
    if(e.estado==="ja_no_mercado")return {estado:"ja_no_mercado",ok:true,gravada:true,id:id,mercado_nota_id:e.mercado_nota_id||null,texto:base+". A compra desta nota já estava no Mercado (mesma chave de acesso): nenhuma compra nova foi criada.",avisos:[]};
    return {estado:"mercado_pendente",ok:false,gravada:true,id:id,tentar:true,texto:base+" e a sua confirmação ficou registrada, mas o lançamento no Mercado não foi concluído"+(e.erro?": "+e.erro:".")+" Use “Tentar de novo”: não precisa ler nem confirmar outra vez.",avisos:[]}}
  /* ===== Mercado: consumo e histórico de preços por categoria e por produto (docs/mercado-consumo.md).
     Puro: recebe as linhas da view "compras" e devolve números. Nunca inventa dado: sem histórico suficiente o campo vem null.
     Preço sempre por unidade de medida: produto vendido em kg e em un tem um bloco para cada, nunca misturados. */
  function mkcR(v){return Math.round((+v||0)*100)/100}
  function mkcNota(x){return x.nota||(x.data+"|"+x.mercado+"|"+(x.numero||""))}
  function mkcUn(u){var t=String(u==null?"":u).trim().toLowerCase();return t===""||t==="un"||t==="und"||t==="unid"?"un":t}
  /* identidade do produto no histórico de preços: nome + unidade (Arroz kg e Arroz un têm históricos independentes), igual na aba Preços e na Consumo */
  function mkcChaveProd(x){return String(x.produto)+"\u0001"+mkcUn(x.unidade)}
  function mkcDias(a,b){return Math.round((Date.UTC(+b.slice(0,4),+b.slice(5,7)-1,+b.slice(8,10))-Date.UTC(+a.slice(0,4),+a.slice(5,7)-1,+a.slice(8,10)))/86400000)}
  function mkcOrd(a,b){return a.data<b.data?-1:a.data>b.data?1:String(a.id||"")<String(b.id||"")?-1:1}
  /* período → {de, ate} em AAAA-MM-DD ("" = sem limite): "tudo", "3m"/"6m"/"12m" (meses fechados até o de hoje) ou "AAAA-MM" */
  function mkcPeriodo(p,hoje){var m=/^(\d{4})-(\d{2})$/.exec(p||"");
    if(m){var u=new Date(+m[1],+m[2],0).getDate();return {de:p+"-01",ate:p+"-"+(u<10?"0":"")+u}}
    var n=/^(\d+)m$/.exec(p||"");
    if(n&&hoje){var a=+hoje.slice(0,4),b=+hoje.slice(5,7)-(+n[1]-1);while(b<1){b+=12;a--}return {de:a+"-"+(b<10?"0":"")+b+"-01",ate:""}}
    return {de:"",ate:""}}
  /* um filtro só para a tela inteira: período (de/ate), categoria, mercado e texto do produto, todos juntos. sem.categoria/sem.produto os deixa de fora
     (as barras de categoria precisam ver todas as categorias; o detalhe do produto não depende da busca) */
  function mkcFiltrar(rows,f,sem){f=f||{};sem=sem||{};var q=sem.produto?"":norm(f.produto||"").trim();
    return (rows||[]).filter(function(x){
      if(f.de&&x.data<f.de)return false;if(f.ate&&x.data>f.ate)return false;
      if(!sem.categoria&&f.categoria&&mkCatOficial(x.categoria)!==f.categoria)return false;
      if(f.mercado&&!sem.mercado&&x.mercado!==f.mercado)return false;
      if(q&&norm(x.produto).indexOf(q)<0)return false;return true})}
  function mkcAgrupa(l,f){var m={},o=[];l.forEach(function(x){var k=f(x);if(!m[k]){m[k]=[];o.push(k)}m[k].push(x)});return {m:m,o:o}}
  function mkcQtd(l){var q={};l.forEach(function(x){var u=mkcUn(x.unidade);q[u]=Math.round(((q[u]||0)+(+x.quantidade||0))*1000)/1000});return q}
  /* categorias do período: total, participação (sobre o total de todas as linhas recebidas), produtos diferentes, itens, compras e quantidade por unidade */
  function mkcCategorias(rows){var tot=mkcR((rows||[]).reduce(function(s,x){return s+(+x.valor_total||0)},0)),g=mkcAgrupa(rows||[],function(x){return mkCatOficial(x.categoria)||"Outros"});
    var linhas=g.o.map(function(c){var l=g.m[c],t=mkcR(l.reduce(function(s,x){return s+(+x.valor_total||0)},0));
      return {categoria:c,total:t,pct:tot?t/tot:0,produtos:mkcAgrupa(l,function(x){return x.produto}).o.length,itens:l.length,compras:mkcAgrupa(l,mkcNota).o.length,qtd:mkcQtd(l)}})
      .sort(function(a,b){return b.total-a.total||a.categoria.localeCompare(b.categoria)});
    return {total:tot,linhas:linhas}}
  /* resumo da seleção (KPIs): total, produtos diferentes, itens, compras; base = total sem o filtro de categoria, para a participação */
  function mkcResumo(rows,base){var t=mkcR((rows||[]).reduce(function(s,x){return s+(+x.valor_total||0)},0)),b=mkcR((base||[]).reduce(function(s,x){return s+(+x.valor_total||0)},0));
    return {total:t,base:b,pct:b?t/b:0,produtos:mkcAgrupa(rows||[],function(x){return x.produto}).o.length,itens:(rows||[]).length,compras:mkcAgrupa(rows||[],mkcNota).o.length}}
  /* produtos de um conjunto de linhas; ordem: "gasto" (maior), "nome" (A a Z) ou "frequencia" (mais compras). freqDias = intervalo médio entre dias de compra (null com menos de 2 dias) */
  function mkcProdutos(rows,ordem){var g=mkcAgrupa(rows||[],function(x){return x.produto});
    var l=g.o.map(function(p){var r=g.m[p].slice().sort(mkcOrd),u=r[r.length-1],dias=mkcAgrupa(r,function(x){return x.data}).o;
      return {nome:p,categoria:mkCatOficial(u.categoria),total:mkcR(r.reduce(function(s,x){return s+(+x.valor_total||0)},0)),itens:r.length,compras:mkcAgrupa(r,mkcNota).o.length,qtd:mkcQtd(r),
        unidades:Object.keys(mkcQtd(r)),ultimaData:u.data,freqDias:dias.length>1?Math.round(mkcDias(dias[0],dias[dias.length-1])/(dias.length-1)):null}});
    var o=ordem||"gasto";
    l.sort(function(a,b){var d=o==="nome"?a.nome.localeCompare(b.nome):o==="frequencia"?b.compras-a.compras||b.total-a.total:b.total-a.total;return d||a.nome.localeCompare(b.nome)});
    return l}
  /* detalhe de UM produto: um bloco por unidade (kg, l, un). preço médio = média dos preços unitários pagos ponderada pela quantidade (Σ preço×qtd ÷ Σ qtd);
     o desconto da nota não entra no preço unitário, só no total gasto. suficiente = pelo menos 2 compras na unidade (sem isso não há variação nem evolução) */
  function mkcProduto(rows){var r=(rows||[]).slice().sort(mkcOrd);if(!r.length)return null;
    var ug=mkcAgrupa(r,function(x){return mkcUn(x.unidade)});
    var blocos=ug.o.map(function(u){var l=ug.m[u],q=0,pq=0,ts=0;
      l.forEach(function(x){q+=+x.quantidade||0;pq+=(+x.valor_unitario||0)*(+x.quantidade||0);ts+=+x.valor_total||0});
      function ponto(x){return x?{data:x.data,preco:+x.valor_unitario||0,mercado:x.mercado}:null}
      var menor=null,maior=null;l.forEach(function(x){var v=+x.valor_unitario||0;if(!menor||v<=menor.v)menor={v:v,x:x};if(!maior||v>=maior.v)maior={v:v,x:x}});
      var ult=l[l.length-1],ant=l.length>1?l[l.length-2]:null,pa=ant?+ant.valor_unitario||0:0;
      var mg=mkcAgrupa(l,function(x){return x.mercado});
      var mercados=mg.o.map(function(m){var z=mg.m[m],zq=0,zp=0,zu=z[z.length-1],zmin=null;
        z.forEach(function(x){zq+=+x.quantidade||0;zp+=(+x.valor_unitario||0)*(+x.quantidade||0);if(zmin===null||+x.valor_unitario<zmin)zmin=+x.valor_unitario});
        return {mercado:m,compras:z.length,ultimo:+zu.valor_unitario||0,data:zu.data,menor:zmin,medio:zq?mkcR(zp/zq):null}})
        .sort(function(a,b){return a.ultimo-b.ultimo||a.mercado.localeCompare(b.mercado)});
      return {unidade:u,compras:l.length,qtd:Math.round(q*1000)/1000,total:mkcR(ts),precoMedio:q?mkcR(pq/q):null,ultimo:ponto(ult),anterior:ponto(ant),
        variacaoUltimo:ant&&pa?(((+ult.valor_unitario||0)-pa)/pa):null,menor:menor?ponto(menor.x):null,maior:maior?ponto(maior.x):null,suficiente:l.length>1,
        serie:l.map(function(x){return {data:x.data,v:+x.valor_unitario||0,mercado:x.mercado}}),mercados:mercados,
        historico:l.map(function(x){return {data:x.data,mercado:x.mercado,quantidade:+x.quantidade||0,unidade:mkcUn(x.unidade),unitario:+x.valor_unitario||0,total:+x.valor_total||0}})}})
      .sort(function(a,b){return b.compras-a.compras||a.unidade.localeCompare(b.unidade)});
    return {nome:r[r.length-1].produto,categoria:mkCatOficial(r[r.length-1].categoria),compras:mkcAgrupa(r,mkcNota).o.length,total:mkcR(r.reduce(function(s,x){return s+(+x.valor_total||0)},0)),
      mercados:mkcAgrupa(r,function(x){return x.mercado}).o,unidades:blocos}}
  /* tabela de Preços: uma linha por produto E unidade. Só registros reais; variação (primeira → última) e comparação com a anterior só com 2+ compras */
  function mkcPrecos(rows){var g=mkcAgrupa(rows||[],mkcChaveProd);
    return g.o.map(function(k){var l=g.m[k].slice().sort(mkcOrd),ult=l[l.length-1],pri=l[0],pen=l.length>1?l[l.length-2]:null,pr=l.map(function(x){return +x.valor_unitario||0}),u=+ult.valor_unitario||0;
      return {chave:k,nome:ult.produto,unidade:mkcUn(ult.unidade),categoria:mkCatOficial(ult.categoria),compras:l,ult:ult,pri:pri,
        varTotal:l.length>1&&pr[0]?(u-pr[0])/pr[0]:null,varUlt:pen&&(+pen.valor_unitario)?(u-(+pen.valor_unitario))/(+pen.valor_unitario):null,
        min:Math.min.apply(null,pr),max:Math.max.apply(null,pr),mercados:mkcAgrupa(l,function(x){return x.mercado}).o.length,
        gasto:mkcR(l.reduce(function(s,x){return s+(+x.valor_total||0)},0)),qtd:Math.round(l.reduce(function(s,x){return s+(+x.quantidade||0)},0)*1000)/1000}})}
  /* ===== Central de Compras × Radar (docs/central-radar.md). Funções PURAS: nada aqui lê banco nem desenha tela.
     Regra de ouro: o preço DESCOBERTO (anúncio visto no Google) nunca vira preço pago nem preço verificado; aqui ele só é COMPARADO, de forma indicativa, com o que o dono pagou.
     O vínculo entre um produto das compras e um produto do Radar fica em PESSOAL["radar-vinculos"] ({ "n:<chave do nome>": "<id do radar_itens>" }), sem migration. */
  var PC_TIPOS_DO_PRODUTO=["individual","kit_mesmo_produto","combo","outra_apresentacao"];
  var PC_LIGACOES=["de","da","do","das","dos","com","sem","para","e","em","a","o","as","os","un","kg","ml","pct","pacote","caixa"];
  var PC_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function pcR2(v){return Math.round(v*100)/100}
  /* chave do produto da Central no vínculo: o nome normalizado (o mesmo que junta nomes parecidos na aba Produtos) */
  function pcChave(nome){return "n:"+mkChave(nome)}
  function pcVinculos(raw){var o={};if(raw&&typeof raw==="object"&&!Array.isArray(raw))Object.keys(raw).slice(0,500).forEach(function(k){if(/^n:.{1,120}$/.test(k)&&typeof raw[k]==="string"&&PC_UUID.test(raw[k]))o[k]=raw[k]});return o}
  function pcVincular(raw,nome,itemId){var o=pcVinculos(raw);if(!String(nome||"").trim()||!PC_UUID.test(String(itemId||"")))return {erro:"Escolha um produto do Radar para vincular.",vinculos:o};o[pcChave(nome)]=String(itemId);return {vinculos:o}}
  function pcDesvincular(raw,nome){var o=pcVinculos(raw);delete o[pcChave(nome)];return o}
  function pcItemDe(raw,nome,itens){var id=pcVinculos(raw)[pcChave(nome)];if(!id)return null;var l=(itens||[]).filter(function(i){return i.id===id});return l[0]||null}
  /* palavras que identificam o produto (sem marca de unidade, números nem ligações) */
  function pcTokens(t){var out=[];norm(t).split(/[^a-z0-9]+/).forEach(function(w){if(w.length>=3&&!/\d/.test(w)&&PC_LIGACOES.indexOf(w)<0&&out.indexOf(w)<0)out.push(w)});return out}
  /* SUGESTÃO de produtos do Radar parecidos com o produto das compras (nunca vincula sozinha): semelhança = palavras em comum ÷ palavras de um ou de outro; só a partir de 40% */
  function pcSugerirItens(nome,itens){var a=pcTokens(nome);if(!a.length)return [];
    return (itens||[]).filter(function(i){return i&&i.ativo!==false}).map(function(i){var b=pcTokens([i.nome,i.marca].filter(Boolean).join(" ")),c=a.filter(function(w){return b.indexOf(w)>=0}).length,u=a.length+b.length-c;
      return {item:i,pontos:u?Math.round(c*100/u):0,comuns:c}}).filter(function(x){return x.comuns>=1&&x.pontos>=40}).sort(function(x,y){return y.pontos-x.pontos||String(x.item.nome).localeCompare(String(y.item.nome))}).slice(0,3)}
  /* unidade das compras → base do preço por medida do Radar (100 g, 100 ml ou unidade); fator = quanto multiplicar o preço unitário pago para chegar à base */
  function pcBase(un){var u=mkcUn(un);return u==="kg"?{base:"100 g",fator:0.1}:u==="g"?{base:"100 g",fator:100}:u==="l"||u==="lt"?{base:"100 ml",fator:0.1}:u==="ml"?{base:"100 ml",fator:100}:u==="un"?{base:"unidade",fator:1}:null}
  /* compara o PREÇO PAGO (da compra registrada) com o preço por medida de um anúncio. Só quando a base é a mesma (kg com 100 g, un com unidade): nada é convertido às cegas nem estimado.
     O resultado é INDICATIVO: o anúncio é preço visto no Google, não confirmado na loja, e o frete não entra. */
  function pcComparar(pago,oferta){
    if(!pago||!(+pago.unitario>0))return {comparavel:false,motivo:"sem preço pago registrado"};
    if(!oferta||!(+oferta.preco_por_medida>0))return {comparavel:false,motivo:"o anúncio não tem preço por medida calculável"};
    var u=pcBase(pago.unidade);if(!u)return {comparavel:false,motivo:"unidade da compra ("+String(pago.unidade||"?")+") sem equivalência"};
    if(u.base!==oferta.base_medida)return {comparavel:false,motivo:"o anúncio é por "+oferta.base_medida+" e a compra é por "+mkcUn(pago.unidade)};
    var p=pcR2(+pago.unitario*u.fator),o=pcR2(+oferta.preco_por_medida),dif=pcR2(o-p),pct=p>0?dif/p:null;
    return {comparavel:true,base:u.base,pagoNaBase:p,ofertaNaBase:o,dif:dif,pct:pct,leitura:pct==null||Math.abs(pct)<0.02?"parecido":pct<0?"abaixo do que você pagou":"acima do que você pagou"}}
  /* o que o anúncio TEM DE DIFERENTE do produto procurado (texto fixo por classificação; nada inventado: só usa campos já gravados) */
  function pcMed(c){var v=+c.medida_valor;return v>0?(v>=1000?String(v/1000).replace(".",",")+(c.medida_unidade==="g"?" kg":" L"):String(v).replace(".",",")+(c.medida_unidade==="g"?" g":" ml")):""}
  function rdDiferenca(c){if(!c)return "";var t=c.tipo_oferta,q=+c.quantidade||1,m=pcMed(c),comp=(c.composicao||[]).filter(function(x){return x&&x.descricao}).map(function(x){return (x.quantidade>1?x.quantidade+" × ":"")+x.descricao}).join(" + ");
    if(t==="individual")return "";
    if(t==="kit_mesmo_produto")return "Kit com "+q+" unidade"+(q>1?"s":"")+(m?" ("+m+" no total)":"")+": o preço total não é o da unidade avulsa; compare pelo preço por unidade ou por medida.";
    if(t==="combo")return "Combo"+(comp?" ("+comp+")":"")+": junta produtos diferentes e não é este produto avulso; não há preço por medida comparável.";
    if(t==="outra_apresentacao")return "Outra apresentação"+(m?" ("+m+")":"")+": o tamanho é diferente do produto procurado; compare pelo preço por medida, não pelo preço total.";
    if(t==="relacionado")return "Relacionado: outro produto (da mesma marca ou parecido), não este; só para referência.";
    return "Indeterminado: não deu para ligar este anúncio ao produto procurado.";}
  /* resumo das ofertas de um produto do Radar (para a lista da categoria e o topo da página do produto): conta por classificação e o menor preço por medida de cada base; ignoradas ficam de fora */
  function pcResumoOfertas(cands){var l=(cands||[]).filter(function(c){return c&&!c.pai_externo&&c.decisao!=="ignorado"}),por={},melhor={},doProduto=0,seguindo=0;
    l.forEach(function(c){por[c.tipo_oferta]=(por[c.tipo_oferta]||0)+1;if(PC_TIPOS_DO_PRODUTO.indexOf(c.tipo_oferta)>=0){doProduto++;var v=+c.preco_por_medida;if(v>0&&c.base_medida&&(!melhor[c.base_medida]||v<melhor[c.base_medida].valor))melhor[c.base_medida]={valor:pcR2(v),tipo:c.tipo_oferta,loja:c.loja||null}}if(c.decisao==="acompanhando")seguindo++});
    return {total:l.length,doProduto:doProduto,relacionadas:l.length-doProduto,acompanhando:seguindo,porTipo:por,melhorPorBase:melhor}}
  /* chave da compra (nota) de uma linha: a MESMA que a tela Notas usa para abrir uma nota (data|estabelecimento|número); cada valor mostrado leva à compra onde foi registrado */
  function pcNotaChave(x){return String(x.data)+"|"+String(x.mercado)+"|"+(x.numero||"")}
  /* produtos de uma categoria com o que importa para escolher: último preço pago (por unidade), menor pago, compras e data; a categoria vem da classificação oficial do Mercado */
  function pcCategoria(rows,categoria){var alvo=mkCatOficial(categoria)||String(categoria||""),l=(rows||[]).filter(function(x){return (mkCatOficial(x.categoria)||"Outros")===alvo});
    var prods=mkcProdutos(l,"gasto"),g=mkcAgrupa(l,function(x){return x.produto});
    return {categoria:alvo,total:mkcR(l.reduce(function(s,x){return s+(+x.valor_total||0)},0)),compras:mkcAgrupa(l,mkcNota).o.length,produtos:prods.map(function(p){var r=g.m[p.nome].slice().sort(mkcOrd),u=r[r.length-1],un=mkcUn(u.unidade),mesma=r.filter(function(x){return mkcUn(x.unidade)===un}),menor=null,linhaMenor=null;
      mesma.forEach(function(x){var v=+x.valor_unitario||0;if(v>0&&(menor===null||v<=menor)){menor=v;linhaMenor=x}});
      return {nome:p.nome,compras:p.compras,total:p.total,ultimaData:p.ultimaData,unidade:un,ultimo:{preco:+u.valor_unitario||0,data:u.data,mercado:u.mercado,nota:pcNotaChave(u)},menor:menor,menorNota:linhaMenor?pcNotaChave(linhaMenor):null}})}}
  /* ===== Mercado: comparação entre dois períodos (docs/mercado-comparar.md). A = período analisado, B = período de comparação (a base).
     diferença = A − B; variação % = (A − B) ÷ B, só com B > 0 (sem base: "novo" ou "sem base", nunca um número inventado). Mesmos filtros nos dois períodos.
     Produto = nome + unidade (mkcChaveProd): kg, L, un e unidades desconhecidas nunca se misturam. Só lê as linhas da view "compras". */
  function mkcP2(n){return n<10?"0"+n:""+n}
  function mkcDia(iso,n){var d=new Date(Date.UTC(+iso.slice(0,4),+iso.slice(5,7)-1,+iso.slice(8,10)+n));return d.getUTCFullYear()+"-"+mkcP2(d.getUTCMonth()+1)+"-"+mkcP2(d.getUTCDate())}
  function mkcIsoOk(s){return /^\d{4}-\d{2}-\d{2}$/.test(s||"")&&mkcDia(s,0)===s}
  /* atalhos → {a:{de,ate}, b:{de,ate}}: "mes" (este mês até hoje × mês anterior inteiro), "30d", "3m", "6m" (os N meses civis até hoje × os N anteriores inteiros). Outro id: null (personalizado) */
  function mkcAtalho(id,hoje){var a=+hoje.slice(0,4),m=+hoje.slice(5,7);
    if(id==="30d")return {a:{de:mkcDia(hoje,-29),ate:hoje},b:{de:mkcDia(hoje,-59),ate:mkcDia(hoje,-30)}};
    var n=id==="mes"?1:id==="3m"?3:id==="6m"?6:0;if(!n)return null;
    function mm(k){var x=m-k,y=a;while(x<1){x+=12;y--}return [y,x]}
    function ini(k){var t=mm(k);return t[0]+"-"+mkcP2(t[1])+"-01"}
    function fim(k){var t=mm(k);return t[0]+"-"+mkcP2(t[1])+"-"+mkcP2(new Date(Date.UTC(t[0],t[1],0)).getUTCDate())}
    return {a:{de:ini(n-1),ate:hoje},b:{de:ini(2*n-1),ate:fim(n)}}}
  /* período válido: as duas datas existem e de ≤ ate. dias = duração inclusiva (os dois períodos podem ter durações diferentes) */
  function mkcPeriodoInfo(p){p=p||{};if(!mkcIsoOk(p.de)||!mkcIsoOk(p.ate))return {ok:false,erro:"Escolha a data inicial e a final.",dias:0};
    if(p.de>p.ate)return {ok:false,erro:"A data inicial é depois da final.",dias:0};return {ok:true,erro:"",dias:mkcDias(p.de,p.ate)+1}}
  function mkcSobrepoe(a,b){return a.de<=b.ate&&b.de<=a.ate}
  /* indicador comparativo: a, b, dif, pct (null sem base) e estado: subiu|caiu|igual|novo (B zero)|sumiu (A zero)|zero (os dois zero)|sem_base (algum valor não existe) */
  function mkcMetric(a,b){if(a==null||b==null)return {a:a,b:b,dif:null,pct:null,estado:"sem_base"};
    var d=mkcR(a-b);return {a:a,b:b,dif:d,pct:b>0?(a-b)/b:null,estado:!a&&!b?"zero":!b?"novo":!a?"sumiu":d>0?"subiu":d<0?"caiu":"igual"}}
  function mkcSomaV(l){return mkcR(l.reduce(function(s,x){return s+(+x.valor_total||0)},0))}
  function mkcPeriodoResumo(l,info){var t=mkcSomaV(l),n=mkcAgrupa(l,mkcNota).o.length;
    return {total:t,compras:n,itens:l.length,produtos:mkcAgrupa(l,mkcChaveProd).o.length,qtd:mkcQtd(l),ticket:n?mkcR(t/n):null,porDia:info.dias?mkcR(t/info.dias):null,dias:info.dias}}
  function mkcLado(l){if(!l||!l.length)return null;var q=0,pq=0;l.forEach(function(x){q+=+x.quantidade||0;pq+=(+x.valor_unitario||0)*(+x.quantidade||0)});
    return {total:mkcSomaV(l),qtd:Math.round(q*1000)/1000,compras:mkcAgrupa(l,mkcNota).o.length,n:l.length,preco:q?mkcR(pq/q):null}}
  var MK_TOL=0.005;
  function mkcDir(p){return p==null?0:p>MK_TOL?1:p<-MK_TOL?-1:0}
  /* leitura do gasto de um produto presente nos dois períodos: o que explica a diferença (preço unitário, quantidade, os dois, ou efeitos que se compensam) */
  function mkcLeitura(g,preco,qtd){if(!g.dif||(g.pct!=null&&Math.abs(g.pct)<=MK_TOL))return "estavel";
    var s=g.dif>0?1:-1,p=mkcDir(preco?preco.pct:null)*s,q=mkcDir(qtd.pct)*s;
    return p>0&&q>0?"ambos":p>0&&q>=0?"preco":q>0&&p>=0?"quantidade":p>0?"preco":q>0?"quantidade":"misto"}
  /* a comparação inteira. rows = linhas da view compras; A e B = {de, ate}; f = {categoria, mercado, produto} aplicados igualmente aos dois períodos.
     Cada quadro usa o filtro sem a própria dimensão (categorias sem categoria, estabelecimentos sem mercado), para dar para trocar de uma para outra. */
  function mkcComparar(rows,A,B,f){f=f||{};var ia=mkcPeriodoInfo(A),ib=mkcPeriodoInfo(B);
    if(!ia.ok||!ib.ok)return {ok:false,erro:!ia.ok?"Período A: "+ia.erro:"Período B: "+ib.erro};
    function flt(p,sem){return mkcFiltrar(rows,{de:p.de,ate:p.ate,categoria:f.categoria,mercado:f.mercado,produto:f.produto},sem)}
    var ra=flt(A),rb=flt(B),sa=mkcPeriodoResumo(ra,ia),sb=mkcPeriodoResumo(rb,ib),un={};
    Object.keys(sa.qtd).concat(Object.keys(sb.qtd)).forEach(function(u){un[u]=1});
    var geral={total:mkcMetric(sa.total,sb.total),porDia:mkcMetric(sa.porDia,sb.porDia),compras:mkcMetric(sa.compras,sb.compras),itens:mkcMetric(sa.itens,sb.itens),produtos:mkcMetric(sa.produtos,sb.produtos),
      ticket:mkcMetric(sa.ticket,sb.ticket),qtd:Object.keys(un).sort().map(function(u){return {unidade:u,m:mkcMetric(sa.qtd[u]||0,sb.qtd[u]||0)}})};
    /* categorias: as oficiais (mesmo sem compra) + qualquer outra com compra */
    var ca=flt(A,{categoria:1}),cb=flt(B,{categoria:1}),ta=mkcSomaV(ca),tb=mkcSomaV(cb),cn=f.soPresentes?[]:MK_CATEGORIAS.slice(),ga=mkcAgrupa(ca,function(x){return mkCatOficial(x.categoria)||"Outros"}),gb=mkcAgrupa(cb,function(x){return mkCatOficial(x.categoria)||"Outros"});
    ga.o.concat(gb.o).forEach(function(c){if(cn.indexOf(c)<0)cn.push(c)});
    var categorias=cn.map(function(c){var a=mkcSomaV(ga.m[c]||[]),b=mkcSomaV(gb.m[c]||[]),pa=ta?a/ta:0,pb=tb?b/tb:0;
      return {categoria:c,m:mkcMetric(a,b),partA:pa,partB:pb,dPart:pa-pb,produtosA:mkcAgrupa(ga.m[c]||[],mkcChaveProd).o.length,produtosB:mkcAgrupa(gb.m[c]||[],mkcChaveProd).o.length}})
      .sort(function(x,y){return Math.max(y.m.a,y.m.b)-Math.max(x.m.a,x.m.b)||x.categoria.localeCompare(y.categoria)});
    /* produtos (nome + unidade) */
    var pa2=mkcAgrupa(ra,mkcChaveProd),pb2=mkcAgrupa(rb,mkcChaveProd),chaves=pa2.o.slice();pb2.o.forEach(function(k){if(chaves.indexOf(k)<0)chaves.push(k)});
    var produtos=chaves.map(function(k){var la=pa2.m[k]||[],lb=pb2.m[k]||[],a=mkcLado(la),b=mkcLado(lb),ref=(la.concat(lb)).sort(mkcOrd),u=ref[ref.length-1];
      var gasto=mkcMetric(a?a.total:0,b?b.total:0),qtd=mkcMetric(a?a.qtd:0,b?b.qtd:0),ambos=!!(a&&b);
      var preco=ambos&&a.preco!=null&&b.preco!=null?mkcMetric(a.preco,b.preco):null;
      return {chave:k,nome:u.produto,unidade:mkcUn(u.unidade),categoria:mkCatOficial(u.categoria),a:a,b:b,estado:ambos?"ambos":a?"so_a":"so_b",gasto:gasto,qtd:qtd,preco:preco,
        leitura:ambos?mkcLeitura(gasto,preco,qtd):(a?"so_a":"so_b")}})
      .sort(function(x,y){return Math.abs(y.gasto.dif)-Math.abs(x.gasto.dif)||x.nome.localeCompare(y.nome)||x.unidade.localeCompare(y.unidade)});
    /* estabelecimentos: gasto, participação e produtos de cada um (sem afirmar qual é mais barato: produtos e quantidades diferem) */
    var ma=flt(A,{mercado:1}),mb=flt(B,{mercado:1}),tma=mkcSomaV(ma),tmb=mkcSomaV(mb),mga=mkcAgrupa(ma,function(x){return x.mercado}),mgb=mkcAgrupa(mb,function(x){return x.mercado}),mn=mga.o.slice();
    mgb.o.forEach(function(m){if(mn.indexOf(m)<0)mn.push(m)});
    var mercados=mn.map(function(m){var a=mkcSomaV(mga.m[m]||[]),b=mkcSomaV(mgb.m[m]||[]),pa=tma?a/tma:0,pb=tmb?b/tmb:0;
      return {mercado:m,m:mkcMetric(a,b),partA:pa,partB:pb,dPart:pa-pb,comprasA:mkcAgrupa(mga.m[m]||[],mkcNota).o.length,comprasB:mkcAgrupa(mgb.m[m]||[],mkcNota).o.length,
        produtosA:mkcAgrupa(mga.m[m]||[],mkcChaveProd).o.length,produtosB:mkcAgrupa(mgb.m[m]||[],mkcChaveProd).o.length}})
      .sort(function(x,y){return Math.max(y.m.a,y.m.b)-Math.max(x.m.a,x.m.b)||x.mercado.localeCompare(y.mercado)});
    return {ok:true,a:{de:A.de,ate:A.ate,dias:ia.dias,resumo:sa},b:{de:B.de,ate:B.ate,dias:ib.dias,resumo:sb},sobrepoe:mkcSobrepoe(A,B),geral:geral,categorias:categorias,produtos:produtos,mercados:mercados}}
  /* listas prontas a partir dos produtos: as que a tela mostra. n = quantos por lista (padrão 10). Quantidade só entre os que aparecem nos dois períodos (mesma unidade). */
  function mkcCompRank(produtos,n){n=n||10;var P=produtos||[];function top(l,f){return l.slice().sort(f).slice(0,n)}
    var ambos=P.filter(function(x){return x.estado==="ambos"});
    return {maiorAumentoGasto:top(P.filter(function(x){return x.gasto.dif>0}),function(x,y){return y.gasto.dif-x.gasto.dif||x.nome.localeCompare(y.nome)}),
      maiorReducaoGasto:top(P.filter(function(x){return x.gasto.dif<0}),function(x,y){return x.gasto.dif-y.gasto.dif||x.nome.localeCompare(y.nome)}),
      aumentoQtd:top(ambos.filter(function(x){return x.qtd.pct!=null&&x.qtd.pct>MK_TOL}),function(x,y){return y.qtd.pct-x.qtd.pct||x.nome.localeCompare(y.nome)}),
      reducaoQtd:top(ambos.filter(function(x){return x.qtd.pct!=null&&x.qtd.pct<-MK_TOL}),function(x,y){return x.qtd.pct-y.qtd.pct||x.nome.localeCompare(y.nome)}),
      precoSubiu:top(P.filter(function(x){return x.preco&&x.preco.pct!=null&&x.preco.pct>MK_TOL}),function(x,y){return y.preco.pct-x.preco.pct||x.nome.localeCompare(y.nome)}),
      precoCaiu:top(P.filter(function(x){return x.preco&&x.preco.pct!=null&&x.preco.pct<-MK_TOL}),function(x,y){return x.preco.pct-y.preco.pct||x.nome.localeCompare(y.nome)}),
      soA:top(P.filter(function(x){return x.estado==="so_a"}),function(x,y){return y.a.total-x.a.total||x.nome.localeCompare(y.nome)}),
      soB:top(P.filter(function(x){return x.estado==="so_b"}),function(x,y){return y.b.total-x.b.total||x.nome.localeCompare(y.nome)})}}
  /* ===== Mercado: alertas de preço (docs/mercado-alertas.md). Regras fixas e auditáveis, sem IA, só sobre o histórico registrado no RAC.
     Produto = nome + unidade (mkcChaveProd); preço = valor_unitario da linha de compra. "Menor preço" é o menor REGISTRADO aqui, nunca o menor do mercado.
     Cada alerta tem um id determinístico (tipo | produto+unidade | compra que o originou [| regra]): rodar de novo não duplica; compra nova gera alerta novo. */
  var MKAL_TIPOS=[["aumento","Aumento de preço","▲"],["queda","Queda de preço","▼"],["minimo","Menor preço histórico","★"],["minimo_periodo","Menor preço no período","☆"],["melhor","Melhor preço em outro mercado","⇄"],["limite","Limite de preço atingido","⚑"]];
  /* padrões conservadores: variações de 15%+, melhor preço só com 10%+ de diferença e registros de até 60 dias entre si; "menor no período" começa desligado */
  var MKAL_PADRAO={tipos:{aumento:{on:true,pct:0.15},queda:{on:true,pct:0.15},minimo:{on:true},minimo_periodo:{on:false,dias:90},melhor:{on:true,pct:0.10,dias:60},limite:{on:true}},novosDias:30,limites:[]};
  function mkalNum(v,min,max,pad){v=+v;return isFinite(v)&&v>=min&&v<=max?v:pad}
  function mkalM(v){return "R$ "+(+v).toFixed(2).replace(".",",")}
  function mkalD(iso){return iso.slice(8,10)+"/"+iso.slice(5,7)+"/"+iso.slice(0,4)}
  function mkalP(v){return (Math.round(Math.abs(v)*1000)/10).toString().replace(".",",")+"%"}
  function mkalU(u){return u==="kg"?"/kg":u==="l"?"/L":u==="un"?"/un":"/"+u}
  /* configuração segura: valores fora do intervalo voltam ao padrão; limites inválidos saem; nunca lança */
  function mkalConfig(raw){raw=raw&&typeof raw==="object"?raw:{};var t=raw.tipos&&typeof raw.tipos==="object"?raw.tipos:{},P=MKAL_PADRAO.tipos,o={tipos:{},novosDias:Math.round(mkalNum(raw.novosDias,7,180,MKAL_PADRAO.novosDias)),limites:[],push:{on:!!raw.push&&typeof raw.push.on==="boolean"?raw.push.on:true}};
    Object.keys(P).forEach(function(k){var r=t[k]&&typeof t[k]==="object"?t[k]:{},p=P[k],c={on:typeof r.on==="boolean"?r.on:p.on};
      if(p.pct!=null)c.pct=mkalNum(r.pct,0.01,5,p.pct);if(p.dias!=null)c.dias=Math.round(mkalNum(r.dias,7,730,p.dias));o.tipos[k]=c});
    var vistos={};(Array.isArray(raw.limites)?raw.limites:[]).forEach(function(l){if(!l||typeof l.nome!=="string"||!l.nome.trim())return;var max=+l.max;if(!isFinite(max)||max<=0||max>100000)return;
      var u=mkcUn(l.unidade),ch=mkcChaveProd({produto:l.nome.trim(),unidade:u});vistos[ch]={chave:ch,nome:l.nome.trim(),unidade:u,max:Math.round(max*100)/100}});
    Object.keys(vistos).forEach(function(k){o.limites.push(vistos[k])});return o}
  function mkalLimiteSalvar(cfg,l){var max=+(l&&l.max);if(!l||!String(l.nome||"").trim())return {erro:"Escolha o produto."};if(!isFinite(max)||max<=0)return {erro:"O limite precisa ser maior que zero."};
    var c=mkalConfig(cfg);c.limites=c.limites.filter(function(x){return x.chave!==mkcChaveProd({produto:String(l.nome).trim(),unidade:l.unidade})});
    c.limites.push({nome:String(l.nome).trim(),unidade:l.unidade,max:max});return {cfg:mkalConfig(c)}}
  function mkalLimiteRemover(cfg,chave){var c=mkalConfig(cfg);c.limites=c.limites.filter(function(x){return x.chave!==chave});return c}
  /* produtos que já existem no histórico (nome + unidade), para escolher o limite sem inventar produto */
  function mkalOpcoes(rows){var g=mkcAgrupa(rows||[],mkcChaveProd);return g.o.map(function(k){var x=g.m[k][0];return {chave:k,nome:x.produto,unidade:mkcUn(x.unidade)}}).sort(function(a,b){return a.nome.localeCompare(b.nome)||a.unidade.localeCompare(b.unidade)})}
  /* todos os eventos que as regras reconhecem no histórico (inclusive antigos), mais novos primeiro. Sem histórico suficiente não há alerta:
     aumento/queda precisam de uma compra anterior; menor preço (histórico e no período) precisam de pelo menos 2 anteriores. */
  function mkalGerar(rows,cfg0){var cfg=mkalConfig(cfg0),T=cfg.tipos,out=[],g=mkcAgrupa(rows||[],mkcChaveProd);
    function ev(tipo,k,cur,o){var id=tipo+"|"+k+"|"+cur.id+(o.regra?"|"+o.regra:"");
      out.push({id:id,tipo:tipo,chave:k,nome:cur.produto,unidade:mkcUn(cur.unidade),categoria:mkCatOficial(cur.categoria),data:cur.data,mercado:cur.mercado,atual:+cur.valor_unitario,anterior:o.anterior==null?null:o.anterior,
        pct:o.pct==null?null:o.pct,refMercado:o.refMercado||"",refData:o.refData||"",motivo:o.motivo})}
    g.o.forEach(function(k){var l=g.m[k].slice().sort(mkcOrd),un=mkcUn(l[0].unidade),su=mkalU(un);
      for(var i=1;i<l.length;i++){var prev=l[i-1],cur=l[i],pp=+prev.valor_unitario,pc=+cur.valor_unitario;if(!(pp>0)||!(pc>0))continue;var v=(pc-pp)/pp;
        if(T.aumento.on&&v>=T.aumento.pct)ev("aumento",k,cur,{anterior:pp,pct:v,refMercado:prev.mercado,refData:prev.data,motivo:"O preço subiu "+mkalP(v)+" em relação à compra anterior ("+mkalM(pp)+su+" em "+mkalD(prev.data)+" → "+mkalM(pc)+su+"). Regra: aumento de "+mkalP(T.aumento.pct)+" ou mais."});
        if(T.queda.on&&v<=-T.queda.pct)ev("queda",k,cur,{anterior:pp,pct:v,refMercado:prev.mercado,refData:prev.data,motivo:"O preço caiu "+mkalP(v)+" em relação à compra anterior ("+mkalM(pp)+su+" em "+mkalD(prev.data)+" → "+mkalM(pc)+su+"). Regra: queda de "+mkalP(T.queda.pct)+" ou mais."});
        if(i>=2){var mn=null,mx=null;for(var j=0;j<i;j++){var q=+l[j].valor_unitario;if(q>0&&(mn===null||q<mn.v))mn={v:q,x:l[j]}}
          if(mn&&T.minimo.on&&pc<mn.v)ev("minimo",k,cur,{anterior:mn.v,pct:(pc-mn.v)/mn.v,refMercado:mn.x.mercado,refData:mn.x.data,motivo:"Menor preço registrado no RAC para este produto ("+mkalM(pc)+su+"), abaixo do mínimo anterior ("+mkalM(mn.v)+su+" em "+mkalD(mn.x.data)+"), com "+i+" compras anteriores. Não é o menor preço do mercado, só do seu histórico."});
          else if(mn&&T.minimo_periodo.on){var corte=mkcDia(cur.data,-T.minimo_periodo.dias),w=null,n=0;for(var m=0;m<i;m++){if(l[m].data>=corte&&+l[m].valor_unitario>0){n++;if(w===null||+l[m].valor_unitario<w.v)w={v:+l[m].valor_unitario,x:l[m]}}}
            if(n>=2&&pc<w.v)ev("minimo_periodo",k,cur,{anterior:w.v,pct:(pc-w.v)/w.v,refMercado:w.x.mercado,refData:w.x.data,motivo:"Menor preço registrado nos últimos "+T.minimo_periodo.dias+" dias ("+mkalM(pc)+su+"; antes "+mkalM(w.v)+su+" em "+mkalD(w.x.data)+"), com "+n+" compras no período."})}}
      }
      /* melhor preço em outro estabelecimento: para cada compra, a compra mais recente (até então) em cada OUTRO mercado, dentro da janela de dias */
      if(T.melhor.on)for(var a=1;a<l.length;a++){var ref=l[a],pr=+ref.valor_unitario;if(!(pr>0))continue;var corteM=mkcDia(ref.data,-T.melhor.dias),melhor=null,vistoM={};
        for(var b=a-1;b>=0;b--){var c=l[b];if(c.mercado===ref.mercado||vistoM[c.mercado])continue;vistoM[c.mercado]=1;var pcnd=+c.valor_unitario;if(pcnd>0&&c.data>=corteM&&(melhor===null||pcnd<melhor.v))melhor={v:pcnd,x:c}}
        if(melhor&&(pr-melhor.v)/pr>=T.melhor.pct){var d=(pr-melhor.v)/pr;
          out.push({id:"melhor|"+k+"|"+ref.id+"|"+melhor.x.id,tipo:"melhor",chave:k,nome:ref.produto,unidade:un,categoria:mkCatOficial(ref.categoria),data:ref.data,mercado:melhor.x.mercado,atual:melhor.v,anterior:pr,pct:-d,refMercado:ref.mercado,refData:ref.data,
            dataEncontrado:melhor.x.data,motivo:"Em "+semCidadeMk(melhor.x.mercado)+" o mesmo produto ("+mkalM(melhor.v)+su+" em "+mkalD(melhor.x.data)+") saiu "+mkalP(d)+" mais barato que em "+semCidadeMk(ref.mercado)+" ("+mkalM(pr)+su+" em "+mkalD(ref.data)+"). Mesma unidade, registros a no máximo "+T.melhor.dias+" dias um do outro. Regra: diferença de "+mkalP(T.melhor.pct)+" ou mais."})}}
    });
    /* limite definido por você: toda compra com preço igual ou menor que o limite */
    if(T.limite.on)cfg.limites.forEach(function(lim){(g.m[lim.chave]||[]).slice().sort(mkcOrd).forEach(function(cur){var p=+cur.valor_unitario;if(p>0&&p<=lim.max)
      ev("limite",lim.chave,cur,{anterior:lim.max,pct:(p-lim.max)/lim.max,regra:String(lim.max),motivo:"Preço pago "+mkalM(p)+mkalU(mkcUn(cur.unidade))+" ficou igual ou abaixo do seu limite de "+mkalM(lim.max)+mkalU(mkcUn(cur.unidade))+"."})})});
    var ordem={};MKAL_TIPOS.forEach(function(t,i){ordem[t[0]]=i});
    return out.sort(function(x,y){return x.data<y.data?1:x.data>y.data?-1:ordem[x.tipo]-ordem[y.tipo]||x.nome.localeCompare(y.nome)||(x.id<y.id?-1:1)})}
  function semCidadeMk(n){return String(n||"").replace(/\s*\(.*\)$/,"")}
  /* estado de leitura: lido por id; novo = ainda não lido e de uma compra dos últimos novosDias. Quem já passou da janela fica em "anteriores". */
  function mkalClassificar(alertas,estado,hoje,cfg0){var cfg=mkalConfig(cfg0),lidos={};((estado&&estado.lidos)||[]).forEach(function(i){lidos[i]=1});var corte=mkcDia(hoje,-cfg.novosDias),porTipo={},novos=0;
    var l=(alertas||[]).map(function(a){var lido=!!lidos[a.id],recente=a.data>=corte,novo=recente&&!lido;if(novo){novos++;porTipo[a.tipo]=(porTipo[a.tipo]||0)+1}
      return Object.assign({},a,{lido:lido,recente:recente,novo:novo})});
    return {alertas:l,resumo:{novos:novos,total:l.length,porTipo:porTipo}}}
  /* marca como lidos (sem repetir; guarda os 1500 mais recentes) */
  function mkalMarcarLido(estado,ids){var l=((estado&&estado.lidos)||[]).slice();(ids||[]).forEach(function(i){if(l.indexOf(i)<0)l.push(i)});return {lidos:l.slice(-1500)}}
  /* Painel: o mês escolhido × o MESMO PERÍODO do mês anterior. Mês corrente: dia 1 até hoje × dia 1 até o mesmo dia do anterior (no máximo o último dia dele);
     mês já fechado: mês inteiro × mês anterior inteiro. Sempre o mês anterior do calendário, mesmo que não tenha compra. */
  function mkcMesmoDia(mes,hoje){var a=+mes.slice(0,4),m=+mes.slice(5,7),pa=m===1?a-1:a,pm=m===1?12:m-1,ult=function(y,x){return new Date(Date.UTC(y,x,0)).getUTCDate()},
      parcial=mes===String(hoje||"").slice(0,7),dia=parcial?+hoje.slice(8,10):ult(a,m),pult=ult(pa,pm),pdia=parcial?Math.min(dia,pult):pult,pk=pa+"-"+mkcP2(pm);
    return {mes:mes,mesAnterior:pk,parcial:parcial,dia:dia,diaAnterior:pdia,anteriorInteiro:pdia===pult,atual:{de:mes+"-01",ate:mes+"-"+mkcP2(dia)},anterior:{de:pk+"-01",ate:pk+"-"+mkcP2(pdia)}}}
  /* gasto por mês (só meses com compra; mês sem compra não aparece e nada é inventado) */
  function mkcPorMes(rows){var g=mkcAgrupa(rows||[],function(x){return x.data.slice(0,7)});
    return g.o.sort().map(function(k){var l=g.m[k];return {mes:k,total:mkcR(l.reduce(function(s,x){return s+(+x.valor_total||0)},0)),itens:l.length,compras:mkcAgrupa(l,mkcNota).o.length,qtd:mkcQtd(l)}})}
  /* ===== Mercado: exportação de relatórios em CSV (docs/mercado-exportar.md).
     Só monta texto a partir das linhas JÁ carregadas da conta, com os mesmos filtros e as mesmas funções mkc e mkal das telas (nada de tela, banco ou rede aqui).
     Cada relatório aplica o filtro de novo (mkcFiltrar), então linha fora do filtro nunca sai. Só colunas escolhidas: ids, usuário, observação e nº da nota ficam de fora.
     Excel pt-BR: separador ";", decimal com vírgula, UTF-8 com BOM, datas AAAA-MM-DD, dinheiro como número (sem "R$"), percentual como número (12,5 = 12,5%). ===== */
  var MKX_REL={consumo:"Consumo",comparar:"Comparação entre períodos",painel:"Painel mensal",precos:"Preços",alertas:"Alertas de preço"};
  var MKX_NOME={consumo:"consumo",comparar:"comparacao",painel:"painel",precos:"precos",alertas:"alertas"};
  var MKX_LEITURA={ambos:"preço e quantidade",preco:"preço",quantidade:"quantidade",misto:"efeitos opostos",estavel:"estável",so_a:"só no período A",so_b:"só no período B"};
  var MKX_ESTADO={subiu:"subiu",caiu:"caiu",igual:"igual",novo:"sem compras no período B (sem base)",sumiu:"sem compras no período A",zero:"sem compras nos dois períodos",sem_base:"sem base"};
  var MKX_LISTAS={todos:"Todos os produtos",aumento:"Maior aumento de gasto",reducao:"Maior redução de gasto",qtdmais:"Aumento de quantidade",qtdmenos:"Redução de quantidade",precomais:"Preço unitário subiu",precomenos:"Preço unitário caiu",soa:"Só no período A",sob:"Só no período B"};
  function mkxNum(v){if(typeof v!=="number"||!isFinite(v))return "";var s=String(Math.round(v*1e6)/1e6);if(/e/i.test(s))s=v.toFixed(6).replace(/0+$/,"").replace(/\.$/,"");return s.replace(".",",")}
  function mkxPct(p){return p==null||!isFinite(p)?null:Math.round(p*1e6)/1e4}
  /* texto que começaria com = + - @ vira fórmula no Excel: ganha um apóstrofo na frente (números não passam por aqui) */
  function mkxCelula(v){if(typeof v==="number")return mkxNum(v);if(v==null)return "";var s=String(v).replace(/\u0000/g,"");if(/^[=+\-@\t\r]/.test(s))s="'"+s;return /[;,"\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
  function mkxLinha(a){return a.map(mkxCelula).join(";")}
  /* arquivo final: bloco de informações (relatório, período, filtros), depois cada seção com título, cabeçalho e linhas */
  function mkxCsv(rep){var L=[];(rep.meta||[]).forEach(function(m){L.push(mkxLinha(m))});
    (rep.secoes||[]).forEach(function(s){L.push("");if(s.titulo)L.push(mkxLinha([s.titulo]));L.push(mkxLinha(s.cab));s.linhas.forEach(function(r){L.push(mkxLinha(r))})});
    return "﻿"+L.join("\r\n")+"\r\n"}
  function mkxVazio(rel,aviso,negado){return {ok:false,vazio:!negado,negado:!!negado,relatorio:rel,aviso:aviso||"Não há dados para exportar."}}
  function mkxFinal(rel,meta,secoes,periodo,desc){var n=0;secoes.forEach(function(s){n+=s.linhas.length});
    return {ok:true,relatorio:rel,titulo:MKX_REL[rel],nome:"rac-mercado-"+MKX_NOME[rel]+"_"+periodo+".csv",csv:mkxCsv({meta:meta,secoes:secoes}),linhas:n,descricao:desc}}
  function mkxUn(u){u=mkcUn(u);return u==="l"?"L":u}
  function mkxQtdTxt(q){return Object.keys(q||{}).sort().map(function(u){return mkxNum(q[u])+" "+mkxUn(u)}).join(" + ")}
  function mkxPeriodo(de,ate,hoje){if(!de&&!ate)return {txt:"Todo o histórico",slug:"todo-historico"};var a=ate||hoje||"hoje";return {txt:(de||"início")+" a "+a,slug:(de||"inicio")+"_a_"+a}}
  function mkxFiltros(f){return [["Categoria",f.categoria||"Todas"],["Estabelecimento",f.mercado||"Todos"],["Produto (busca)",f.produto||"Todos"]]}
  function mkxFiltrosTxt(f){return [f.categoria,f.mercado?semCidadeMk(f.mercado):"",f.produto?"“"+f.produto+"”":""].filter(Boolean).join(" · ")}
  /* gasto, participação, compras e itens por estabelecimento (compras = notas distintas) */
  function mkxPorMercado(l){var tot=mkcR(l.reduce(function(s,x){return s+(+x.valor_total||0)},0)),g=mkcAgrupa(l,function(x){return x.mercado});
    return g.o.map(function(m){var z=g.m[m],t=mkcR(z.reduce(function(s,x){return s+(+x.valor_total||0)},0));return [m,t,mkxPct(tot?t/tot:0),mkcAgrupa(z,mkcNota).o.length,z.length]})
      .sort(function(a,b){return b[1]-a[1]||String(a[0]).localeCompare(String(b[0]))})}
  var MKX_COL_MERC=["Estabelecimento","Gasto (R$)","Participação (%)","Compras","Itens"];

  /* 1. Consumo: f = {de, ate, categoria, mercado, produto} (os da tela); opc = {hoje, ord}. Um produto por unidade (kg, L e un nunca se misturam). */
  function mkxConsumo(rows,f,opc){f=f||{};opc=opc||{};var sel=mkcFiltrar(rows,f);if(!sel.length)return mkxVazio("consumo");
    var R=mkcResumo(sel,mkcFiltrar(rows,f,{categoria:1})),per=mkxPeriodo(f.de,f.ate,opc.hoje);
    var ps=mkcPrecos(sel).map(function(p){return {p:p,d:mkcProduto(p.compras).unidades[0],n:mkcAgrupa(p.compras,mkcNota).o.length}});
    var o=opc.ord;ps.sort(function(a,b){var d=o==="nome"?a.p.nome.localeCompare(b.p.nome):o==="frequencia"?b.n-a.n||b.d.total-a.d.total:b.d.total-a.d.total;return d||a.p.nome.localeCompare(b.p.nome)||a.p.unidade.localeCompare(b.p.unidade)});
    var meta=[["Relatório","Consumo"],["Período consultado",per.txt]].concat(mkxFiltros(f),[["Total gasto (R$)",R.total],["Compras",R.compras],["Itens",R.itens],["Produtos diferentes",R.produtos]],
      f.categoria?[["Participação da categoria no gasto do período (%)",mkxPct(R.pct)]]:[],[["Gerado em",opc.hoje||""]]);
    var secoes=[{titulo:"Produtos (um por unidade)",cab:["Produto","Categoria","Unidade","Compras","Quantidade","Gasto (R$)","Preço médio (R$ por unidade)","Menor preço (R$)","Maior preço (R$)","Último preço (R$)","Data da última compra","Estabelecimentos"],
      linhas:ps.map(function(x){var d=x.d;return [x.p.nome,x.p.categoria,mkxUn(x.p.unidade),x.n,d.qtd,d.total,d.precoMedio,d.menor.preco,d.maior.preco,d.ultimo.preco,d.ultimo.data,d.mercados.map(function(m){return m.mercado}).sort().join(" | ")]})},
      {titulo:"Por categoria",cab:["Categoria","Gasto (R$)","Participação (%)","Produtos","Itens","Compras","Quantidades"],
        linhas:mkcCategorias(sel).linhas.map(function(c){return [c.categoria,c.total,mkxPct(c.pct),c.produtos,c.itens,c.compras,mkxQtdTxt(c.qtd)]})},
      {titulo:"Por estabelecimento",cab:MKX_COL_MERC,linhas:mkxPorMercado(sel)},
      {titulo:"Mês a mês",cab:["Mês","Gasto (R$)","Compras","Itens","Quantidades"],linhas:mkcPorMes(sel).map(function(m){return [m.mes,m.total,m.compras,m.itens,mkxQtdTxt(m.qtd)]})}];
    return mkxFinal("consumo",meta,secoes,per.slug,"Consumo · "+per.txt+(mkxFiltrosTxt(f)?" · "+mkxFiltrosTxt(f):"")+" · "+ps.length+(ps.length===1?" produto":" produtos"))}

  /* 2. Comparação entre períodos: A e B = {de, ate}; f = {categoria, mercado, produto}; opc = {hoje, lista} (lista = a escolhida na tela, ver MKX_LISTAS) */
  function mkxComparar(rows,A,B,f,opc){f=f||{};opc=opc||{};var r=mkcComparar(rows,A,B,f);if(!r.ok)return mkxVazio("comparar",r.erro);
    if(!r.a.resumo.itens&&!r.b.resumo.itens)return mkxVazio("comparar");
    var rk=mkcCompRank(r.produtos,1000),L={todos:r.produtos,aumento:rk.maiorAumentoGasto,reducao:rk.maiorReducaoGasto,qtdmais:rk.aumentoQtd,qtdmenos:rk.reducaoQtd,precomais:rk.precoSubiu,precomenos:rk.precoCaiu,soa:rk.soA,sob:rk.soB};
    var id=L[opc.lista]?opc.lista:"todos",prods=L[id],G=r.geral;
    function lm(rot,m){return [rot,m.a,m.b,m.dif,mkxPct(m.pct),MKX_ESTADO[m.estado]||""]}
    var geral=[lm("Gasto total (R$)",G.total),lm("Gasto por dia (R$)",G.porDia),lm("Compras",G.compras),lm("Itens comprados",G.itens),lm("Produtos diferentes",G.produtos),lm("Gasto médio por compra (R$)",G.ticket)]
      .concat(G.qtd.map(function(q){return lm("Quantidade ("+mkxUn(q.unidade)+")",q.m)}));
    var meta=[["Relatório","Comparação entre períodos"],["Período A (analisado)",A.de+" a "+A.ate],["Dias do período A",r.a.dias],["Período B (comparação)",B.de+" a "+B.ate],["Dias do período B",r.b.dias]]
      .concat(r.sobrepoe?[["Aviso","Os períodos A e B se sobrepõem: as compras das datas em comum entram nos dois."]]:[],mkxFiltros(f),[["Lista de produtos",MKX_LISTAS[id]],["Diferença","A − B; variação (%) = (A − B) ÷ B, em branco quando B não tem compras"],["Gerado em",opc.hoje||""]]);
    var secoes=[{titulo:"Comparação geral",cab:["Indicador","Período A","Período B","Diferença (A − B)","Variação (%)","Situação"],linhas:geral},
      {titulo:"Por categoria",cab:["Categoria","Gasto A (R$)","Gasto B (R$)","Diferença (R$)","Variação (%)","Participação A (%)","Participação B (%)","Mudança de participação (p.p.)","Produtos A","Produtos B","Situação"],
        linhas:r.categorias.filter(function(x){return x.m.a>0||x.m.b>0}).map(function(x){return [x.categoria,x.m.a,x.m.b,x.m.dif,mkxPct(x.m.pct),mkxPct(x.partA),mkxPct(x.partB),mkxPct(x.dPart),x.produtosA,x.produtosB,MKX_ESTADO[x.m.estado]||""]})},
      {titulo:"Produtos: "+MKX_LISTAS[id],cab:["Produto","Unidade","Categoria","Gasto A (R$)","Gasto B (R$)","Diferença de gasto (R$)","Variação do gasto (%)","Quantidade A","Quantidade B","Variação da quantidade (%)","Preço médio A (R$)","Preço médio B (R$)","Variação do preço (%)","Explicação"],
        linhas:prods.map(function(x){return [x.nome,mkxUn(x.unidade),x.categoria,x.a?x.a.total:null,x.b?x.b.total:null,x.gasto.dif,mkxPct(x.gasto.pct),x.a?x.a.qtd:null,x.b?x.b.qtd:null,x.estado==="ambos"?mkxPct(x.qtd.pct):null,
          x.a&&x.a.preco!=null?x.a.preco:null,x.b&&x.b.preco!=null?x.b.preco:null,x.preco?mkxPct(x.preco.pct):null,MKX_LEITURA[x.leitura]||""]})},
      {titulo:"Estabelecimentos",cab:["Estabelecimento","Gasto A (R$)","Gasto B (R$)","Diferença (R$)","Variação (%)","Participação A (%)","Participação B (%)","Mudança de participação (p.p.)","Compras A","Compras B","Produtos A","Produtos B"],
        linhas:r.mercados.map(function(x){return [x.mercado,x.m.a,x.m.b,x.m.dif,mkxPct(x.m.pct),mkxPct(x.partA),mkxPct(x.partB),mkxPct(x.dPart),x.comprasA,x.comprasB,x.produtosA,x.produtosB]})}];
    return mkxFinal("comparar",meta,secoes,"A-"+A.de+"_a_"+A.ate+"_B-"+B.de+"_a_"+B.ate,"Comparação · A "+A.de+" a "+A.ate+" × B "+B.de+" a "+B.ate+(mkxFiltrosTxt(f)?" · "+mkxFiltrosTxt(f):"")+" · "+MKX_LISTAS[id]+" ("+prods.length+")")}

  /* 3. Painel mensal: o mês (AAAA-MM) com o mesmo critério da tela, inclusive a comparação com o MESMO período do mês anterior */
  function mkxPainel(rows,mes,opc){opc=opc||{};var ok=/^\d{4}-\d{2}$/.test(mes||""),doMes=ok?(rows||[]).filter(function(x){return String(x.data).slice(0,7)===mes}):[];if(!doMes.length)return mkxVazio("painel");
    var P=mkcMesmoDia(mes,opc.hoje||""),rc=mkcResumo(mkcFiltrar(doMes,P.atual),[]),rp=mkcResumo(mkcFiltrar(rows,P.anterior),[]),m=mkcMetric(rc.total,rp.total),R=mkcResumo(doMes,[]);
    var meta=[["Relatório","Painel mensal"],["Mês",mes],["Total gasto no mês (R$)",R.total],["Compras no mês",R.compras],["Itens comprados",R.itens],["Descontos (R$)",mkcR(doMes.reduce(function(s,x){return s+(+x.desconto||0)},0))],
      ["Período de comparação (mesmo período do mês anterior)",P.anterior.de+" a "+P.anterior.ate],["Gasto no período de comparação (R$)",rp.total],["Diferença (R$)",m.dif],["Variação (%)",mkxPct(m.pct)],["Compras no período de comparação",rp.compras],["Gerado em",opc.hoje||""]];
    var secoes=[{titulo:"Por categoria",cab:["Categoria","Gasto (R$)","Participação (%)","Compras","Itens","Produtos"],linhas:mkcCategorias(doMes).linhas.map(function(c){return [c.categoria,c.total,mkxPct(c.pct),c.compras,c.itens,c.produtos]})},
      {titulo:"Por estabelecimento",cab:MKX_COL_MERC,linhas:mkxPorMercado(doMes)}];
    var nCat=secoes[0].linhas.length;
    return mkxFinal("painel",meta,secoes,mes,"Painel mensal · "+mes+" · "+nCat+(nCat===1?" categoria":" categorias")+" · "+R.compras+(R.compras===1?" compra":" compras"))}

  /* 4. Preços: f = {mes ("" = desde o início), q (busca)}, os mesmos da aba. Uma linha por produto E unidade, mais o histórico de cada compra */
  function mkxPrecos(rows,f,opc){f=f||{};opc=opc||{};var mes=/^\d{4}-\d{2}$/.test(f.mes||"")?f.mes:"",base=mes?(rows||[]).filter(function(x){return String(x.data).slice(0,7)===mes}):(rows||[]),nq=norm(f.q||"");
    var l=mkcPrecos(base).filter(function(p){return !nq||norm(p.nome+" "+p.categoria).indexOf(nq)>=0});if(!l.length)return mkxVazio("precos");
    l.sort(function(a,b){return a.nome.localeCompare(b.nome)||a.unidade.localeCompare(b.unidade)});
    var meta=[["Relatório","Preços"],["Período consultado",mes||"Desde o início"],["Produto (busca)",f.q||"Todos"],["Produtos e unidades",l.length],["Gerado em",opc.hoje||""]];
    var secoes=[{titulo:"Produtos e unidades",cab:["Produto","Unidade","Categoria","Compras","Primeira compra","Preço na primeira compra (R$)","Última compra","Último preço (R$)","Estabelecimento da última compra","Menor preço (R$)","Maior preço (R$)","Variação do primeiro ao último preço (%)","Quantidade comprada","Gasto (R$)"],
      linhas:l.map(function(p){return [p.nome,mkxUn(p.unidade),p.categoria,p.compras.length,p.pri.data,+p.pri.valor_unitario,p.ult.data,+p.ult.valor_unitario,p.ult.mercado,p.min,p.max,p.compras.length>1?mkxPct(p.varTotal):null,p.qtd,p.gasto]})},
      {titulo:"Histórico de preços",cab:["Produto","Unidade","Categoria","Data da compra","Estabelecimento","Quantidade","Preço unitário (R$)","Valor total (R$)"],linhas:[]}];
    l.forEach(function(p){p.compras.forEach(function(x){secoes[1].linhas.push([p.nome,mkxUn(p.unidade),p.categoria,x.data,x.mercado,+x.quantidade,+x.valor_unitario,+x.valor_total])})});
    return mkxFinal("precos",meta,secoes,mes||"todo-historico","Preços · "+(mes||"desde o início")+(f.q?" · “"+f.q+"”":"")+" · "+l.length+(l.length===1?" produto":" produtos")+" · "+secoes[1].linhas.length+(secoes[1].linhas.length===1?" compra":" compras"))}

  /* 5. Alertas (só do dono): alertas = os já classificados e escolhidos na tela (mkalGerar + mkalClassificar); opc = {dono, hoje, tipo, filtro} */
  function mkxAlertas(alertas,opc){opc=opc||{};if(opc.dono!==true)return mkxVazio("alertas","Os alertas de preço são só do dono.",true);var l=alertas||[];if(!l.length)return mkxVazio("alertas");
    var rot={};MKAL_TIPOS.forEach(function(t){rot[t[0]]=t[1]});
    var meta=[["Relatório","Alertas de preço"],["Filtro",opc.filtro||"Todos os tipos ligados"],["Alertas",l.length],["Gerado em",opc.hoje||""]];
    var secoes=[{titulo:"Alertas",cab:["Tipo","Produto","Unidade","Categoria","Data do alerta","Estabelecimento do preço atual","Data do preço atual","Preço atual (R$)","Estabelecimento de referência","Data de referência","Preço de referência (R$)","Diferença (R$)","Variação (%)","Situação","Motivo"],
      linhas:l.map(function(a){var mel=a.tipo==="melhor";return [rot[a.tipo]||a.tipo,a.nome,mkxUn(a.unidade),a.categoria,a.data,a.mercado,mel?a.dataEncontrado:a.data,a.atual,a.refMercado||"",a.refData||"",a.anterior,a.anterior!=null?mkcR(a.atual-a.anterior):null,mkxPct(a.pct),a.novo?"Novo":a.lido?"Lido":"Anterior",a.motivo]})}];
    return mkxFinal("alertas",meta,secoes,(opc.tipo||"todos")+"_"+(opc.hoje||""),"Alertas · "+(opc.filtro||"todos os tipos ligados")+" · "+l.length+(l.length===1?" alerta":" alertas"))}

  /* ===== Radar de Preços, Lote 1 (docs/radar.md): regras puras, sem tela e sem banco. Os nomes dos campos são os das colunas de radar_precos
     (migration 043 do Radar), que garante as mesmas regras no banco. À vista e parcelado nunca se misturam; frete desconhecido não é
     grátis e não gera preço final; o histórico só cresce; equivalência confirmada precisa de evidência e do dono (a IA só propõe). ===== */
  var RD_MODALIDADES=["a_vista","parcelado"],RD_FRETES=["desconhecido","confirmado","gratis_confirmado","retirada"],RD_MEIOS=["pix","boleto","debito","credito","dinheiro","outro"];
  var RD_FONTES=["manual","coleta","nota_fiscal"],RD_DISPONIB=["disponivel","indisponivel","desconhecida"];
  function rdIn(l,v){return l.indexOf(v)>=0}
  /* dinheiro em centavos inteiros: null = ausente, NaN = inválido (aceita 12.5, "12,50" e "R$ 1.234,56") */
  function rdCent(v){if(v==null||v==="")return null;var n;
    if(typeof v==="number")n=v;else{var s=String(v).replace(/[R$\s]/g,"");if(!/^-?[\d.,]+$/.test(s))return NaN;n=s.indexOf(",")>=0?parseFloat(s.replace(/\./g,"").replace(",",".")):parseFloat(s)}
    return isFinite(n)?Math.round((n+(n<0?-1:1)*1e-9)*100):NaN}
  /* CEP: só confere o formato (8 dígitos); o CEP em si nunca fica no código nem no repositório (fica em radar_config, privado) */
  function rdCep(v){var d=String(v==null?"":v).replace(/\D/g,"");return /^\d{8}$/.test(d)?d:""}
  /* confere uma observação de preço com as mesmas regras do banco; opc.agora (ms) para a data futura */
  function rdValidarPreco(o,opc){var er=[];o=o||{};opc=opc||{};
    if(!rdIn(RD_MODALIDADES,o.modalidade))er.push("Modalidade deve ser à vista ou parcelado.");
    if(!rdIn(RD_FONTES,o.fonte))er.push("Informe a fonte da observação.");
    if(!o.evidencia||!String(o.evidencia).replace(/\s/g,"").length||String(o.evidencia).length>500)er.push("Falta a evidência verificável (link, nota ou print conferido).");
    if(o.meio!=null&&!rdIn(RD_MEIOS,o.meio))er.push("Meio de pagamento desconhecido.");
    var pp=rdCent(o.preco_produto),tx=rdCent(o.taxas==null?0:o.taxas),ds=rdCent(o.desconto==null?0:o.desconto),fv=rdCent(o.frete_valor);
    if(pp==null||isNaN(pp)||pp<=0)er.push("Preço do produto deve ser maior que zero.");
    if(isNaN(tx)||tx<0)er.push("Taxas inválidas.");if(isNaN(ds)||ds<0)er.push("Desconto inválido.");
    var fs=o.frete_situacao==null?"desconhecido":o.frete_situacao;
    if(!rdIn(RD_FRETES,fs))er.push("Situação do frete inválida.");
    else if(fs==="desconhecido"){if(fv!=null)er.push("Frete desconhecido não pode ter valor (e não é grátis).")}
    else if(fs==="confirmado"){if(fv==null||isNaN(fv)||fv<=0)er.push("Frete confirmado precisa de valor maior que zero.")}
    else if(fv!==0)er.push("Frete grátis ou retirada precisa ter valor zero.");
    if(o.disponibilidade!=null&&!rdIn(RD_DISPONIB,o.disponibilidade))er.push("Disponibilidade inválida.");
    if(o.modalidade==="a_vista"){if(o.parcelas!=null||o.valor_parcela!=null||o.total_parcelado!=null||o.sem_juros!=null||o.juros_mensal_pct!=null)er.push("Preço à vista não tem parcelas, total parcelado nem juros.")}
    if(o.modalidade==="parcelado"){var n=o.parcelas,vp=rdCent(o.valor_parcela),tp=rdCent(o.total_parcelado);
      if(!(n>=2&&n<=48&&Math.floor(n)===n))er.push("Parcelas deve ser um número inteiro de 2 a 48.");
      if(vp==null||isNaN(vp)||vp<=0)er.push("Falta o valor de cada parcela.");
      if(tp==null||isNaN(tp)||tp<=0)er.push("Falta o total parcelado.");
      if(typeof o.sem_juros!=="boolean")er.push("Diga se o parcelamento é sem juros.");
      if(o.meio!=null&&!rdIn(["credito","boleto","outro"],o.meio))er.push("Parcelado só em crédito, boleto ou outro.");
      if(tp>0&&pp>0&&Math.abs(tp-pp)>2)er.push("No parcelado, o preço do produto é o total parcelado.");
      if(n>=2&&vp>0&&tp>0&&Math.abs(n*vp-tp)>n+1)er.push("Parcelas × valor da parcela não fecha com o total parcelado.");
      if(o.sem_juros===true&&o.juros_mensal_pct!=null&&+o.juros_mensal_pct!==0)er.push("Sem juros não combina com taxa de juros maior que zero.");
      if(o.juros_mensal_pct!=null&&!(+o.juros_mensal_pct>=0))er.push("Juros inválidos.")}
    if(pp>0&&!isNaN(tx)&&!isNaN(ds)&&ds>pp+(fv>0?fv:0)+tx)er.push("O desconto não pode passar do total.");
    if(o.observado_em&&opc.agora!=null){var t=Date.parse(o.observado_em);if(isNaN(t))er.push("Data da observação inválida.");else if(t>opc.agora+5*60000)er.push("A observação não pode ter data futura.")}
    return {ok:!er.length,erros:er}}
  /* preço final = produto + frete confirmado + taxas − desconto. Só é "confirmado" com frete conhecido e item disponível; senão final = null */
  function rdPrecoFinal(o){var v=rdValidarPreco(o);if(!v.ok)return {confirmado:false,final:null,motivo:"invalido",erros:v.erros};
    var fs=o.frete_situacao==null?"desconhecido":o.frete_situacao;
    if(fs==="desconhecido")return {confirmado:false,final:null,motivo:"frete_desconhecido"};
    if(o.disponibilidade==="indisponivel")return {confirmado:false,final:null,motivo:"indisponivel"};
    if(o.disponibilidade!=="disponivel")return {confirmado:false,final:null,motivo:"disponibilidade_desconhecida"};
    var pp=rdCent(o.preco_produto),fr=rdCent(o.frete_valor)||0,tx=rdCent(o.taxas==null?0:o.taxas),ds=rdCent(o.desconto==null?0:o.desconto);
    return {confirmado:true,final:(pp+fr+tx-ds)/100,motivo:null,componentes:{produto:pp/100,frete:fr/100,taxas:tx/100,desconto:ds/100}}}
  /* a mesma série: oferta + modalidade + meio + parcelas (nunca se compara à vista com parcelado, nem 3x com 10x) */
  function rdChaveSerie(o){return [o.oferta_id,o.modalidade,o.meio||"outro",o.parcelas||0].join("|")}
  function rdOrdem(a,b){var x=Date.parse(a.observado_em)-Date.parse(b.observado_em);if(x)return x;x=Date.parse(a.registrado_em||a.observado_em)-Date.parse(b.registrado_em||b.observado_em);return x||0}
  /* observações vigentes: tira as que uma correção (corrige_id) substituiu; o histórico em si nunca é alterado */
  function rdVigentes(precos){var subst={};(precos||[]).forEach(function(p){if(p.corrige_id)subst[p.corrige_id]=1});return (precos||[]).filter(function(p){return !subst[p.id]})}
  /* a última observação de cada série */
  function rdUltimas(precos){var m={};rdVigentes(precos).forEach(function(p){var k=rdChaveSerie(p);if(!m[k]||rdOrdem(m[k],p)<=0)m[k]=p});return Object.keys(m).sort().map(function(k){return m[k]})}
  /* ranking de UMA modalidade (obrigatória). Entram só ofertas ativas com equivalência confirmada e preço final confirmado (frete conhecido, disponível).
     Quem fica de fora vem em "fora", com o motivo; frete desconhecido nunca é tratado como grátis. */
  function rdRanking(precos,ofertas,opc){opc=opc||{};
    if(!rdIn(RD_MODALIDADES,opc.modalidade))return {ok:false,erro:"Escolha uma modalidade (à vista ou parcelado): elas não se misturam no ranking.",ranking:[],fora:[]};
    var ult=rdUltimas(precos).filter(function(p){return p.modalidade===opc.modalidade}),por={};
    ult.forEach(function(p){(por[p.oferta_id]=por[p.oferta_id]||[]).push(p)});
    var rk=[],fora=[];
    (ofertas||[]).forEach(function(of){
      if(of.situacao&&of.situacao!=="ativa"){fora.push({oferta_id:of.id,motivo:"oferta_inativa"});return}
      if(of.equivalencia!=="confirmada"){fora.push({oferta_id:of.id,motivo:"equivalencia_nao_confirmada"});return}
      var l=por[of.id]||[];if(!l.length){fora.push({oferta_id:of.id,motivo:"sem_observacao"});return}
      var melhor=null,motivo=null;
      l.forEach(function(p){var f=rdPrecoFinal(p);if(f.confirmado){if(!melhor||f.final<melhor.final)melhor={final:f.final,p:p}}else if(!motivo)motivo=f.motivo});
      if(melhor)rk.push({oferta_id:of.id,preco_id:melhor.p.id,final:melhor.final,meio:melhor.p.meio||"outro",parcelas:melhor.p.parcelas||null,valor_parcela:melhor.p.valor_parcela!=null?+melhor.p.valor_parcela:null,observado_em:melhor.p.observado_em});
      else fora.push({oferta_id:of.id,motivo:motivo})});
    rk.sort(function(a,b){return a.final-b.final||(a.oferta_id<b.oferta_id?-1:1)});
    return {ok:true,modalidade:opc.modalidade,ranking:rk,fora:fora}}
  /* a observação mais recente contra a anterior da mesma série (sem limite mínimo de desconto: só a diferença real) */
  function rdVariacao(serie){var l=rdVigentes(serie).slice().sort(rdOrdem);if(!l.length)return {ok:false,motivo:"sem_historico"};
    var at=l[l.length-1];if(l.length<2)return {ok:true,primeira:true,atual:at};var an=l[l.length-2],fa=rdPrecoFinal(at),fn=rdPrecoFinal(an),base="produto",a,b;
    if(fa.confirmado&&fn.confirmado){base="final";a=fa.final;b=fn.final}else{a=rdCent(at.preco_produto)/100;b=rdCent(an.preco_produto)/100}
    var dif=Math.round((a-b)*100)/100;return {ok:true,primeira:false,base:base,atual:a,anterior:b,diferenca:dif,pct:b>0?Math.round(dif/b*10000)/100:null}}
  /* janela histórica flexível (dias à escolha): só observações reais gravadas, com preço final confirmado; poucas observações = "insuficiente", nada é inventado */
  function rdJanela(serie,dias,agora){var ini=agora-dias*86400000,v=[];
    rdVigentes(serie).forEach(function(p){var t=Date.parse(p.observado_em);if(t>=ini&&t<=agora){var f=rdPrecoFinal(p);if(f.confirmado)v.push({t:t,v:f.final})}});
    v.sort(function(a,b){return a.t-b.t});if(v.length<2)return {n:v.length,suficiente:false};
    var vs=v.map(function(x){return x.v}),at=vs[vs.length-1],mn=Math.min.apply(null,vs),mx=Math.max.apply(null,vs);
    return {n:v.length,suficiente:true,dias:dias,minimo:mn,maximo:mx,atual:at,noMinimo:at===mn,acimaDoMinimo:Math.round((at-mn)*100)/100}}
  /* equivalência: "confirmada" exige evidência, a confirmação do dono (confirmada_em) e nunca vem da IA, que só propõe ("provavel") */
  function rdEquivalencia(of){of=of||{};var er=[],ev=of.evidencias;
    if(!rdIn(["confirmada","provavel","nao_confirmada","rejeitada"],of.equivalencia))er.push("Equivalência inválida.");
    if(of.equivalencia==="confirmada"){if(!ev||!ev.length)er.push("Equivalência confirmada precisa de evidência.");if(!of.confirmada_em)er.push("Só o dono confirma a equivalência.");if(of.equivalencia_origem==="ia")er.push("A IA não confirma equivalência: ela só propõe.")}
    return {ok:!er.length,erros:er}}

  /* ===== Radar de Preços, Lote 2: histórico por janelas, oportunidades, equivalência por regras e confirmação de endereço (docs/radar.md) ===== */
  var RD_JANELAS=[30,90,180,365],RD_ANOMALIA=0.5;
  function rdNorm(s){return String(s==null?"":s).normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/\s+/g," ").trim()}
  /* confere só o formato; quem decide de verdade (domínio permitido, IP interno, robots.txt) é a função do servidor */
  function rdUrlOk(u){var s=String(u==null?"":u).trim();if(!s||s.length>2000)return {ok:false,motivo:"Endereço vazio ou grande demais."};
    var m=/^https:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?::443)?(?:[\/?#]\S*)?$/i.exec(s);
    if(!m)return {ok:false,motivo:"Use um endereço https:// de uma loja (sem espaço, usuário ou porta)."};
    var host=m[1].toLowerCase();if(/^\d+(\.\d+)+$/.test(host)||/(^|\.)(localhost|local|internal|lan|home|corp)$/.test(host))return {ok:false,motivo:"Endereço interno ou IP não é aceito."};
    return {ok:true,host:host,url:s}}
  function rdHostDe(l){return l&&l.dominio?String(l.dominio).toLowerCase():""}
  function rdHostCasa(host,dominio){host=String(host||"").toLowerCase();dominio=String(dominio||"").toLowerCase();return !!dominio&&(host===dominio||host.slice(-dominio.length-1)==="."+dominio)}
  /* pontos de uma série (sem as observações substituídas), em ordem, com o preço final quando confirmado */
  function rdPontos(serie){return rdVigentes(serie).slice().sort(rdOrdem).map(function(p){var f=rdPrecoFinal(p);
    return {id:p.id,iso:p.observado_em,t:Date.parse(p.observado_em),produto:rdCent(p.preco_produto)/100,final:f.confirmado?f.final:null,motivo:f.motivo||null,frete:p.frete_situacao||"desconhecido",modalidade:p.modalidade,meio:p.meio||"outro",parcelas:p.parcelas||null,oferta_id:p.oferta_id}})}
  function rdEstat(l,campo){var v=l.filter(function(x){return x[campo]!=null});if(!v.length)return {n:0};
    var mn=v[0],mx=v[0];v.forEach(function(x){if(x[campo]<mn[campo])mn=x;if(x[campo]>=mx[campo])mx=x});
    return {n:v.length,minimo:{valor:mn[campo],iso:mn.iso,id:mn.id},maximo:{valor:mx[campo],iso:mx.iso,id:mx.id}}}
  /* histórico de UMA série (mesma oferta, modalidade, meio e parcelas): última, menor, maior, variação e as janelas de 30/90/180/365 dias e todo o histórico.
     Só observações reais gravadas; menos de 2 observações com preço final = "insuficiente", nunca se completa com estimativa. */
  function rdHistorico(serie,agora){var pts=rdPontos(serie);if(!pts.length)return {n:0,pontos:[],suficiente:false,semFinal:true,janelas:{}};
    var ult=pts[pts.length-1],ant=pts.length>1?pts[pts.length-2]:null,campo=pts.some(function(x){return x.final!=null})?"final":"produto",all=rdEstat(pts,campo),jan={};
    var ref=function(x){return x[campo]};
    var variacao=null;if(ant&&ref(ult)!=null&&ref(ant)!=null){var d=Math.round((ref(ult)-ref(ant))*100)/100;variacao={base:campo,anterior:ref(ant),atual:ref(ult),diferenca:d,pct:ref(ant)>0?Math.round(d/ref(ant)*10000)/100:null}}
    RD_JANELAS.concat([0]).forEach(function(dias){var l=dias?pts.filter(function(x){return x.t>=agora-dias*86400000&&x.t<=agora}):pts,e=rdEstat(l,campo);
      jan[dias||"todo"]={dias:dias||null,n:e.n,suficiente:e.n>=2,minimo:e.minimo||null,maximo:e.maximo||null,atualNoMinimo:e.n>=2&&ref(ult)!=null&&ref(ult)===e.minimo.valor&&l.indexOf(ult)>=0,
        acimaDoMinimo:e.n>=2&&ref(ult)!=null?Math.round((ref(ult)-e.minimo.valor)*100)/100:null}});
    return {n:pts.length,pontos:pts,ultima:ult,base:campo,minimo:all.minimo||null,maximo:all.maximo||null,variacao:variacao,janelas:jan,suficiente:all.n>=2,semFinal:campo!=="final"}}
  /* queda grande não é descartada: fica marcada como "sujeita a verificação" */
  function rdAnomalia(pct){return pct!=null&&pct<=-RD_ANOMALIA*100}
  /* oportunidades: o preço final ATUAL de cada série é menor que a última observação, que o menor da janela escolhida ou que o preço pago pelo dono (mesma modalidade).
     Sem desconto mínimo e sem mediana. Só entram ofertas ativas, com equivalência confirmada, vendedor aceitável, frete confirmado e item disponível (preço final).
     opc: {agora (ms), janela (dias; 0 = todo o histórico; padrão 90), pagos: {item_id:{a_vista,parcelado}}, vendedoresBloqueados:[texto]} */
  function rdOportunidades(precos,ofertas,opc){opc=opc||{};var jan=opc.janela==null?90:opc.janela,agora=opc.agora!=null?opc.agora:Date.now(),pagos=opc.pagos||{},bloq=(opc.vendedoresBloqueados||[]).map(rdNorm).filter(Boolean),porId={};
    (ofertas||[]).forEach(function(o){porId[o.id]=o});
    var series={};rdVigentes(precos).forEach(function(p){(series[rdChaveSerie(p)]=series[rdChaveSerie(p)]||[]).push(p)});
    var out=[];
    Object.keys(series).sort().forEach(function(k){var of=porId[series[k][0].oferta_id];if(!of||(of.situacao&&of.situacao!=="ativa")||of.equivalencia!=="confirmada")return;
      if(of.vendedor&&bloq.indexOf(rdNorm(of.vendedor))>=0)return;
      var pts=rdPontos(series[k]),at=pts[pts.length-1];if(!at||at.final==null)return;
      var mot=[],ant=pts.length>1?pts[pts.length-2]:null;
      function add(tipo,ref,extra){var dif=Math.round((at.final-ref)*100)/100,pct=ref>0?Math.round(dif/ref*10000)/100:null;var m={tipo:tipo,referencia:ref,diferenca:dif,pct:pct};for(var q in extra||{})m[q]=extra[q];mot.push(m)}
      if(ant&&ant.final!=null&&at.final<ant.final)add("menor_que_ultima",ant.final,{em:ant.iso});
      var base=pts.slice(0,-1).filter(function(x){return x.final!=null&&(!jan||(x.t>=agora-jan*86400000&&x.t<=agora))}),mn=null;
      base.forEach(function(x){if(!mn||x.final<mn.final)mn=x});
      if(mn&&at.final<mn.final)add("menor_na_janela",mn.final,{em:mn.iso,janela:jan||"todo"});
      var pago=(pagos[of.item_id]||{})[at.modalidade];if(pago!=null&&+pago>0&&at.final<+pago)add("menor_que_pago",+pago,{});
      if(!mot.length)return;
      var pior=mot.reduce(function(a,m){return m.pct!=null&&m.pct<a?m.pct:a},0);
      out.push({serie:k,preco_id:at.id,oferta_id:of.id,item_id:of.item_id,modalidade:at.modalidade,meio:at.meio,parcelas:at.parcelas,final:at.final,observado_em:at.iso,motivos:mot,pct:pior,verificar:rdAnomalia(pior),
        chave:rdChaveAviso(at.id)})});
    out.sort(function(a,b){return a.pct-b.pct||(a.chave<b.chave?-1:1)});return out}
  /* uma oportunidade por observação de preço: o mesmo preço nunca avisa duas vezes (a observação é imutável) */
  function rdChaveAviso(precoId){return "rdop:"+precoId}
  function rdNaoAvisadas(ops,jaAvisadas){var s={};(jaAvisadas||[]).forEach(function(k){s[k]=1});return (ops||[]).filter(function(o){return !s[o.chave]})}
  /* equivalência por REGRAS (sem IA): compara GTIN, marca, modelo e variante. Nunca confirma: só sugere, com as evidências e as divergências; quem confirma é o dono */
  function rdSugerirEquivalencia(item,cand){item=item||{};cand=cand||{};var ev=[],dv=[];
    var g1=String(item.gtin||"").replace(/\D/g,""),g2=String(cand.gtin||"").replace(/\D/g,"");
    if(g1&&g2){if(g1===g2)ev.push({tipo:"gtin",texto:"GTIN igual ("+g1+")"});else dv.push({tipo:"gtin",texto:"GTIN diferente (cadastrado "+g1+", anúncio "+g2+")"})}
    var m1=rdNorm(item.marca),m2=rdNorm(cand.marca),o1=rdNorm(item.modelo).replace(/[^a-z0-9]/g,""),o2=rdNorm(cand.modelo).replace(/[^a-z0-9]/g,"");
    if(m1&&m2){if(m1===m2)ev.push({tipo:"marca",texto:"Marca igual ("+item.marca+")"});else dv.push({tipo:"marca",texto:"Marca diferente ("+item.marca+" × "+cand.marca+")"})}
    if(o1&&o2){if(o1===o2)ev.push({tipo:"modelo",texto:"Modelo igual ("+item.modelo+")"});else dv.push({tipo:"modelo",texto:"Modelo diferente ("+item.modelo+" × "+cand.modelo+")"})}
    var v1=rdNorm(item.variante),v2=rdNorm(cand.variante);if(v1&&v2&&v1!==v2)dv.push({tipo:"variante",texto:"Variante diferente ("+item.variante+" × "+cand.variante+")"});
    var mc=rdCompararMedidas([item.nome,item.apresentacao,item.variante,item.modelo].join(" "),[cand.titulo||cand.nome,cand.apresentacao,cand.variante,cand.modelo].join(" "));ev=ev.concat(mc.evidencias);dv=dv.concat(mc.divergencias);
    var forte=ev.some(function(e){return e.tipo==="gtin"})||(ev.some(function(e){return e.tipo==="marca"})&&ev.some(function(e){return e.tipo==="modelo"}));
    var sug=dv.length?"divergente":forte?"provavel":"nao_confirmada";
    return {sugestao:sug,evidencias:ev,divergencias:dv,confirma:false,aviso:sug==="provavel"?"Evidência suficiente para SUGERIR; confirme você mesmo antes de entrar no ranking.":sug==="divergente"?"Há divergência: não confirme sem conferir.":"Faltam dados para sugerir (GTIN, ou marca e modelo)."}}

  /* ===== Mercado: categoria × subcategoria × estabelecimento (docs/mercado-classificacao.md) =====
     Estabelecimento (onde comprou) e categoria (o que é a despesa) são independentes: nada aqui deriva categoria do mercado. A categoria efetiva de um item é, nesta ordem:
     a do próprio item (categoria_item, só desse item) → a do produto (vale para todas as compras dele) → a gravada no item na compra. Subcategoria: do item → do produto. */
  var MK_CATEGORIAS_EXTRA=["Automotivo","Tecnologia","Saúde","Vestuário"];
  var MK_SUBCATEGORIAS={"Automotivo":["Acessórios","Manutenção","Combustível","Proteção"],"Bebê/Infantil":["Higiene","Alimentação","Vestuário","Acessórios"],"Casa/Utilidades":["Móveis","Eletrodomésticos","Limpeza","Utensílios"],
    "Tecnologia":["Informática","Celulares","Acessórios"],"Saúde":["Medicamentos","Consultas","Cuidados pessoais"],"Vestuário":["Roupas","Calçados","Acessórios"]};
  function mkCategoriaEfetiva(item,produto){item=item||{};produto=produto||{};var c=item.categoria_item||produto.categoria||item.categoria||"";return mkCatOficial(c)}
  function mkSubEfetiva(item,produto){item=item||{};produto=produto||{};return item.subcategoria||produto.subcategoria||""}
  /* opções do seletor: oficiais + sugeridas + as que já existem nos dados (inclui as personalizadas), sem repetir */
  function mkOpcoesCategoria(linhas,extras){var l=MK_CATEGORIAS.concat(MK_CATEGORIAS_EXTRA);(extras||[]).forEach(function(c){if(c&&l.indexOf(c)<0)l.push(c)});(linhas||[]).forEach(function(x){var c=mkCatOficial(x.categoria);if(c&&l.indexOf(c)<0)l.push(c)});return l}
  /* a lista ÚNICA de categorias de todos os seletores (Produtos, página do produto, Notas): as do Mercado, as extras, as das áreas, as de qualquer compra (nota ou pedido online) e as do vocabulário dos pedidos online (Pet, Eletrônicos→Tecnologia…) */
  function mkTodasCategorias(linhas,extras){var l=mkOpcoesCategoria(linhas,extras);
    CO_CATEGORIAS.forEach(function(c){var k=cuCat(c);if(k&&k!=="Sem categoria"&&l.indexOf(k)<0)l.push(k)});return l}
  function mkSubOpcoes(cat,linhas){var c=mkCatOficial(cat),l=(MK_SUBCATEGORIAS[c]||[]).slice();(linhas||[]).forEach(function(x){if(mkCatOficial(x.categoria)===c&&x.subcategoria&&l.indexOf(x.subcategoria)<0)l.push(x.subcategoria)});return l}
  /* valida o que o dono escolheu (nunca aceita estabelecimento como categoria); devolve {ok, categoria, subcategoria} ou {ok:false, erro} */
  function mkClasseValida(cat,sub,mercados){var c=mkCatOficial(String(cat==null?"":cat).replace(/\s+/g," ").trim()),sx=String(sub==null?"":sub).replace(/\s+/g," ").trim();
    if(!c)return {ok:false,erro:"Escolha a categoria."};if(c.length>40||sx.length>40)return {ok:false,erro:"Categoria e subcategoria aceitam até 40 caracteres."};
    if(/[<>]/.test(c+sx))return {ok:false,erro:"Use só letras, números e pontuação simples."};
    var n=norm(c),ms=(mercados||[]).map(function(m){return norm(String(m).replace(/\s*\(.*\)$/,""))});
    if(ms.indexOf(n)>=0)return {ok:false,erro:"“"+c+"” é um estabelecimento, não uma categoria. Escolha o tipo de despesa (ex.: Automotivo)."};
    return {ok:true,categoria:c,subcategoria:sx||null}}
  /* totais por categoria e subcategoria (usa a categoria/subcategoria já efetivas das linhas) */
  function mkResumoClasse(linhas){var cats={};(linhas||[]).forEach(function(x){var c=mkCatOficial(x.categoria)||"Sem categoria",s=x.subcategoria||"",o=cats[c]=cats[c]||{categoria:c,total:0,itens:0,subs:{}};
      o.total+=+x.valor_total||0;o.itens++;var k=s||"(sem subcategoria)",q=o.subs[k]=o.subs[k]||{subcategoria:k,total:0,itens:0};q.total+=+x.valor_total||0;q.itens++});
    return Object.keys(cats).map(function(k){var o=cats[k];o.total=Math.round(o.total*100)/100;o.subs=Object.keys(o.subs).map(function(z){var q=o.subs[z];q.total=Math.round(q.total*100)/100;return q}).sort(function(a,b){return b.total-a.total});return o}).sort(function(a,b){return b.total-a.total})}

  /* ===== Radar, Lote 3: medidas nos títulos e sinais de anúncio suspeito (sem IA, sem custo; docs/radar.md) ===== */
  var RD_MEDIDAS=[["volume",/(\d+(?:[.,]\d+)?)\s*(ml|l|lt|litros?)\b/g,function(n,u){return /^m/.test(u)?n:n*1000},"ml"],["massa",/(\d+(?:[.,]\d+)?)\s*(kg|g|gr|gramas?|quilos?)\b/g,function(n,u){return /^k|^q/.test(u)?n*1000:n},"g"],
    ["armazenamento",/(\d+(?:[.,]\d+)?)\s*(tb|gb|mb)\b/g,function(n,u){return u==="tb"?n*1000:u==="mb"?n/1000:n},"GB"],["unidades",/(\d+)\s*(un|und|unid\w*|pcs|pecas|pecas?|caps|capsulas|fraldas|rolos|pacotes)\b/g,function(n){return n},"un"],
    ["tela",/(\d+(?:[.,]\d+)?)\s*(?:"|''|pol\b|polegadas?)/g,function(n){return n},"pol"],["tensao",/\b(110|127|220)\s*v\b/g,function(n){return n},"V"],["potencia",/(\d+)\s*w\b/g,function(n){return n},"W"],["btu",/(\d+(?:\.\d{3})?)\s*btus?\b/g,function(n){return n},"BTU"]];
  /* medidas que o texto declara, por tipo: {volume:[{v:320000,txt:"320 L"}], ...}. Só o que está escrito; nada é inferido. */
  function rdMedidas(texto){var t=rdNorm(texto).replace(/ /g," "),out={};
    RD_MEDIDAS.forEach(function(d){var re=new RegExp(d[1].source,"g"),m;while((m=re.exec(t))){var bruto=m[1].replace(/\.(?=\d{3}\b)/,"");var n=parseFloat(bruto.replace(",","."));if(!isFinite(n)||n<=0)continue;
      var v=Math.round(d[2](n,m[2]||"")*1000)/1000;(out[d[0]]=out[d[0]]||[]);if(!out[d[0]].some(function(x){return x.v===v}))out[d[0]].push({v:v,txt:m[0].trim()})}});
    if(/\bbivolt\b/.test(t)){(out.tensao=out.tensao||[]).push({v:"bivolt",txt:"bivolt"})}
    return out}
  /* compara as medidas de dois textos: iguais = evidência fraca; tipo presente nos dois com valores sem nenhum em comum = divergência (capacidade, quantidade, voltagem...) */
  function rdCompararMedidas(a,b){var ma=rdMedidas(a),mb=rdMedidas(b),ev=[],dv=[],rot={volume:"Volume/capacidade",massa:"Peso",armazenamento:"Armazenamento",unidades:"Quantidade",tela:"Tela",tensao:"Tensão",potencia:"Potência",btu:"BTU"};
    Object.keys(ma).forEach(function(k){if(!mb[k])return;var comum=ma[k].some(function(x){return mb[k].some(function(y){return y.v===x.v||x.v==="bivolt"||y.v==="bivolt"})});
      var ta=ma[k].map(function(x){return x.txt}).join(" / "),tb=mb[k].map(function(x){return x.txt}).join(" / ");
      if(comum)ev.push({tipo:"medida",texto:rot[k]+" igual ("+ta+")"});else dv.push({tipo:"medida",texto:rot[k]+" diferente ("+ta+" × "+tb+")"})});
    return {evidencias:ev,divergencias:dv}}
  /* sinais de que uma oportunidade merece conferência antes de confiar (nunca descartam a oferta): queda muito grande, vendedor desconhecido em marketplace,
     disponibilidade incerta e parcelado mais barato que o à vista na mesma oferta. ctx: {op, oferta, loja, precos} */
  function rdSuspeitas(ctx){ctx=ctx||{};var op=ctx.op||{},of=ctx.oferta||{},lj=ctx.loja||{},sin=[];
    if(op.verificar)sin.push({tipo:"queda_grande",texto:"Queda muito grande em relação ao histórico: confira se o preço e o produto estão certos."});
    if(!rdNorm(of.vendedor)&&lj.tipo==="marketplace")sin.push({tipo:"vendedor_desconhecido",texto:"Marketplace sem vendedor identificado: pode não ser a loja oficial."});
    var ult=rdUltimas((ctx.precos||[]).filter(function(p){return p.oferta_id===(op.oferta_id||of.id)})),av=ult.filter(function(p){return p.modalidade==="a_vista"})[0],pa=ult.filter(function(p){return p.modalidade==="parcelado"})[0];
    if(av&&pa&&rdCent(pa.total_parcelado||pa.preco_produto)<rdCent(av.preco_produto))sin.push({tipo:"parcelado_menor",texto:"O total parcelado está abaixo do preço à vista: confira se não é erro da página."});
    var disp=ult.filter(function(p){return p.modalidade===op.modalidade&&p.disponibilidade==="desconhecida"})[0];if(disp)sin.push({tipo:"disponibilidade",texto:"Disponibilidade não confirmada."});
    return sin}

  /* ===== Central de Compras: visão unificada (notas do Mercado + compras online), só funções puras, sem tela e sem banco =====
     Nada aqui regrava nem recalcula a fonte: cada compra entra com o valor que a sua fonte já calcula (Mercado: soma de itens.valor_total; online: coRegra/coPedidoPartes).
     Três dimensões independentes: canal (presencial/online), estabelecimento (onde se comprou) e categoria (o que se comprou). O emissor fiscal fica à parte e nunca é trocado. */
  var CU_CAT_ALIAS={"veiculos":"Automotivo","eletronicos":"Tecnologia","bebe":"Bebê/Infantil","casa":"Casa/Utilidades","saude e farmacia":"Saúde","higiene e beleza":"Higiene Pessoal"};
  var CU_GRUPOS={"Alimentação":["Mercearia","Padaria","Açougue/Frios","Hortifruti","Chocolates/Doces","Bebidas","Peixaria","Alimentação"]};
  var CU_PLATAFORMAS=["Mercado Livre","Amazon","Shopee","Magazine Luiza","Americanas","Shein","AliExpress"];
  function cuSemCidade(n){return String(n==null?"":n).replace(/\s*\(.*\)$/,"").trim()}
  /* rótulo de categoria único para as duas fontes (só na leitura; nada é regravado) */
  function cuCat(c){var t=String(c==null?"":c).trim();if(!t)return "Sem categoria";return CU_CAT_ALIAS[norm(t)]||mkCatOficial(t)}
  function cuCatBate(cat,alvo){if(!alvo)return true;var g=CU_GRUPOS[alvo];return g?g.indexOf(cat)>=0:cat===alvo}
  /* canal de uma nota do Mercado: só "online" quando o dono informou (PESSOAL["mercado-canais"]); sem informação é presencial, o padrão do Mercado */
  function cuCanaisValidos(raw){var o={},n=raw&&raw.notas&&typeof raw.notas==="object"?raw.notas:{};
    Object.keys(n).slice(0,3000).forEach(function(k){var v=n[k]||{};if(v.canal!=="online"&&v.canal!=="presencial")return;var pl=v.plataforma==null?"":String(v.plataforma).trim().slice(0,40);if(/[<>]/.test(pl))pl="";o[k]={canal:v.canal,plataforma:v.canal==="online"&&pl?pl:null}});return o}
  function cuCanalDefinir(mapa,chave,canal,plataforma){var o=JSON.parse(JSON.stringify(mapa||{}));
    if(canal!=="online"&&canal!=="presencial")return {ok:false,erro:"Escolha presencial ou online.",mapa:o};
    var pl=String(plataforma==null?"":plataforma).trim();if(pl.length>40)return {ok:false,erro:"O nome da plataforma passa de 40 letras.",mapa:o};if(/[<>]/.test(pl))return {ok:false,erro:"O nome da plataforma tem caracteres que não são aceitos.",mapa:o};
    if(canal==="presencial"){delete o[chave];return {ok:true,mapa:o}}
    o[chave]={canal:"online",plataforma:pl||null};return {ok:true,mapa:o}}
  function cuNotaChave(x){return x.nota||(x.data+"|"+x.mercado+"|"+(x.numero||""))}
  /* uma compra por nota fiscal do Mercado (linhas da view compras) */
  function cuDeNotas(linhas,canais){canais=canais||{};var g={},ord=[];
    (linhas||[]).forEach(function(x){var k=cuNotaChave(x),n=g[k];if(!n){n=g[k]={chave:k,data:x.data,mercado:x.mercado,numero:x.numero||null,pagamento:x.forma_pagamento||null,linhas:[]};ord.push(k)}n.linhas.push(x)});
    return ord.map(function(k){var n=g[k],o=canais[k]||{},cats={},tot=0,desc=0,on=o.canal==="online",pl=on&&o.plataforma?o.plataforma:null;
      var itens=n.linhas.map(function(x){var v=+x.valor_total||0,c=cuCat(x.categoria);tot+=v;desc+=+x.desconto||0;cats[c]=amR2((cats[c]||0)+v);
        return {nome:x.produto||x.descricao,qtd:+x.quantidade||0,unidade:x.unidade||null,valor:amR2(v),desconto:amR2(+x.desconto||0),categoria:c,sub:x.subcategoria||null,produto_chave:x.produto||x.descricao,unitario:+x.valor_unitario||0,item_id:x.id||null}});
      return {id:"nota:"+k,fonte:"nota",chave:k,data:n.data,mes:String(n.data).slice(0,7),emissor:n.mercado,estabelecimento:cuSemCidade(pl||n.mercado),plataforma:pl,vendedor:null,
        canal:on?"online":"presencial",canal_informado:!!o.canal,nota_abre:String(n.data)+"|"+String(n.mercado)+"|"+(n.numero||""),valor:amR2(tot),desconto:amR2(desc),n_itens:itens.length,categorias:cats,ajustes:0,aj:null,numero:n.numero,numero_nf:n.numero,pagamento:n.pagamento,itens:itens}})}
  /* uma compra por pedido online que a regra financeira existente (coRegra) manda contar; o resto vai para "fora", com o motivo */
  function cuDeOnline(compras){var o={compras:[],fora:{}};
    (compras||[]).forEach(function(c){if(!c)return;var r=coRegra(c);
      if(!r.conta){var f=o.fora[r.motivo]||(o.fora[r.motivo]={n:0,valor:0});f.n++;f.valor=amR2(f.valor+(+r.excluido||0));return}
      var pt=coPedidoPartes(c,r),cats={},canal=coCanalDe(c),itens=pt.itens.map(function(i){var k=cuCat(i.cat);cats[k]=amR2((cats[k]||0)+i.v);return {nome:i.nome,qtd:i.qtd,unidade:null,valor:amR2(i.v),categoria:k,sub:null,produto_chave:i.chave}});
      o.compras.push({id:"online:"+c.id,fonte:"online",chave:c.id,data:c.data,mes:String(c.data).slice(0,7),emissor:c.emitente||null,estabelecimento:coLojaDe(c),plataforma:CO_LOJAS[c.loja]||null,vendedor:c.vendedor||null,
        canal:canal==="presencial"?"presencial":"online",canal_informado:true,canal_origem:canal,valor:r.valor,desconto:coDescontos(c).total,n_itens:itens.length,categorias:cats,ajustes:pt.aj.total,aj:pt.aj,
        numero:c.numero||null,numero_nf:c.numero_nf||null,pagamento:c.pagamento||null,itens:itens,tratamento:r.tratamento,situacao:r.situacao})});
    return o}
  /* uma compra por pedido de delivery/restaurante (tabelas pedidos e pedido_itens, módulo Alimentação até o lote B). Entra como as compras online: valor = total pago; os itens (valor líquido do
     desconto do próprio item) têm categoria Delivery (entrega) ou Restaurante (retirada, no local); taxa de entrega, taxa de serviço, gorjeta e descontos gerais são AJUSTES (nunca rateados). */
  function cuDeDelivery(pedidos){var o={compras:[],fora:{}};
    (pedidos||[]).forEach(function(p){if(!p||!p.data)return;var tot=+p.total_pago;if(!isFinite(tot)||tot<=0||p.total_pago==null){var f=o.fora.delivery_sem_valor||(o.fora.delivery_sem_valor={n:0,valor:0});f.n++;return}
      var modo=alModo(p),cat=modo==="delivery"?"Delivery":"Restaurante",pl=String(p.plataforma||""),app=pl==="ifood"||pl==="99food",cats={},soma=0,
        itens=(p.itens||[]).map(function(i){var v=amR2((+i.total||0)-(+i.desconto||0));soma=amR2(soma+v);cats[cat]=amR2((cats[cat]||0)+v);
          return {nome:i.descricao,qtd:+i.qtd>0?+i.qtd:1,unidade:null,valor:v,desconto:amR2(+i.desconto||0),categoria:cat,sub:null,produto_chave:i.descricao}}),
        aj={frete:amR2(+p.taxa_entrega||0),taxas:amR2(+p.taxa_servico||0),gorjeta:amR2(+p.gorjeta||0),desconto_geral:-amR2((+p.desconto_loja||0)+(+p.desconto_plataforma||0))};
      aj.total=amR2(tot-soma);aj.outros=amR2(aj.total-aj.frete-aj.taxas-aj.gorjeta-aj.desconto_geral);
      var est=app?(NUCLEO_AL_PLAT(pl)):cuSemCidade(p.estabelecimento);
      o.compras.push({id:"delivery:"+p.id,fonte:"delivery",chave:p.id,data:p.data,mes:String(p.data).slice(0,7),emissor:p.estabelecimento||null,estabelecimento:est,plataforma:app?est:null,vendedor:p.estabelecimento||null,
        canal:app?"online":"presencial",canal_informado:true,valor:amR2(tot),desconto:amR2((+p.desconto_loja||0)+(+p.desconto_plataforma||0)),n_itens:itens.length,categorias:cats,ajustes:aj.total,aj:aj,
        numero:p.numero||null,numero_nf:null,pagamento:p.pagamento||null,itens:itens,tratamento:"despesa",situacao:"",modo:modo})});
    return o}
  function NUCLEO_AL_PLAT(pl){return AL_PLATAFORMAS[pl]||pl}
  /* junta as duas fontes sem somar a mesma transação duas vezes:
       forte    mesma data, mesmo valor e o mesmo número de nota fiscal → a nota do Mercado fica e o pedido online sai da soma (vai para fora.coberta_por_nota);
       provável mesma data e mesmo valor (como coDuplicata) → os dois continuam contando e a dupla é sinalizada para o dono conferir (o pedido online ganha "possivel_duplicata").
     Nunca se apaga nem se altera registro: é só o que entra na soma desta tela. */
  function cuUnificar(notas,online){online=online||{compras:[],fora:{}};var porData={},dup=[],fora={},compras=(notas||[]).slice(),cob=0;
    (notas||[]).forEach(function(n){(porData[n.data]=porData[n.data]||[]).push(n)});
    Object.keys(online.fora||{}).forEach(function(k){fora[k]={n:online.fora[k].n,valor:online.fora[k].valor}});
    online.compras.forEach(function(p){var cand=(porData[p.data]||[]).filter(function(n){return Math.abs(n.valor-p.valor)<=0.01}),
        forte=cand.filter(function(n){return p.numero_nf&&n.numero_nf&&coNumeroPedido(n.numero_nf)===coNumeroPedido(p.numero_nf)})[0];
      if(forte){dup.push({nivel:"forte",online:p.id,nota:forte.id,valor:p.valor,data:p.data});var f=fora.coberta_por_nota||(fora.coberta_por_nota={n:0,valor:0});f.n++;f.valor=amR2(f.valor+p.valor);cob=amR2(cob+p.valor);return}
      var q=p;if(cand.length){q=Object.assign({},p,{possivel_duplicata:cand[0].id});dup.push({nivel:"provavel",online:p.id,nota:cand[0].id,valor:p.valor,data:p.data})}
      compras.push(q)});
    compras.sort(function(a,b){return a.data<b.data?1:a.data>b.data?-1:(a.id<b.id?1:-1)});
    var tm=0,to=0,td=0;compras.forEach(function(c){if(c.fonte==="nota")tm=amR2(tm+c.valor);else if(c.fonte==="delivery")td=amR2(td+c.valor);else to=amR2(to+c.valor)});
    return {compras:compras,fora:fora,duplicidades:dup,totais:{notas:tm,online:to,delivery:td,total:amR2(tm+to+td),coberta:cob}}}
  /* período: "AAAA-MM" (um mês), "12m" (últimos 12 meses até hoje) ou "tudo" */
  function cuPeriodo(sel,hoje){if(!sel||sel==="tudo")return {de:null,ate:null};if(/^\d{4}-\d{2}$/.test(sel))return {de:sel+"-01",ate:sel+"-31"};
    if(sel==="12m"&&hoje)return {de:pnMeses(hoje,12)[0]+"-01",ate:String(hoje).slice(0,10)};return {de:null,ate:null}}
  /* filtros combinados: {de, ate, canal, estab, categoria}. Com categoria, cada compra passa a valer só os itens daquela categoria (valor_f / n_f):
     frete, taxas e ajustes do pedido não pertencem a nenhuma categoria e NÃO são rateados (mesma regra de coDetalhe). */
  function cuFiltrar(compras,f){f=f||{};var out=[];
    (compras||[]).forEach(function(c){if(f.de&&c.data<f.de)return;if(f.ate&&c.data>f.ate)return;if(f.canal&&c.canal!==f.canal)return;if(f.estab&&c.estabelecimento!==f.estab)return;
      var o=Object.assign({},c);
      if(f.categoria){var v=0,fi=[];(c.itens||[]).forEach(function(i){if(cuCatBate(i.categoria,f.categoria)){v=amR2(v+i.valor);fi.push(i)}});if(!fi.length)return;o.valor_f=v;o.n_f=fi.length;o.ajustes_f=0;o._itensF=fi}
      else{o.valor_f=c.valor;o.n_f=c.n_itens;o.ajustes_f=c.ajustes}
      out.push(o)});return out}
  function cuResumo(lista){var R={total:0,compras:0,itens:0,media:null,ajustes:0,porCanal:{presencial:{n:0,total:0},online:{n:0,total:0}},porEstab:[],porCategoria:[],possiveisDuplicatas:0},est={},cat={};
    (lista||[]).forEach(function(c){R.total=amR2(R.total+c.valor_f);R.compras++;R.itens+=c.n_f;R.ajustes=amR2(R.ajustes+c.ajustes_f);var pc=R.porCanal[c.canal]||(R.porCanal[c.canal]={n:0,total:0});pc.n++;pc.total=amR2(pc.total+c.valor_f);
      var e=est[c.estabelecimento]||(est[c.estabelecimento]={nome:c.estabelecimento,n:0,total:0,itens:0});e.n++;e.total=amR2(e.total+c.valor_f);e.itens+=c.n_f;if(c.possivel_duplicata)R.possiveisDuplicatas++;
      (c._itensF||c.itens||[]).forEach(function(i){var k=i.categoria,x=cat[k]||(cat[k]={cat:k,total:0,itens:0,_v:{}});x.total=amR2(x.total+i.valor);x.itens++;x._v[c.id]=1})});
    R.media=R.compras?amR2(R.total/R.compras):null;
    R.porEstab=Object.keys(est).map(function(k){return est[k]}).sort(function(a,b){return b.total-a.total||(a.nome<b.nome?-1:1)});
    R.porCategoria=Object.keys(cat).map(function(k){var x=cat[k];x.compras=Object.keys(x._v).length;delete x._v;return x}).sort(function(a,b){return b.total-a.total||(a.cat<b.cat?-1:1)});
    return R}
  /* categorias dominantes de uma compra (as de maior valor), para a lista "Últimas compras" */
  function cuCategoriasDe(c,n){var k=Object.keys(c.categorias||{}).sort(function(a,b){return c.categorias[b]-c.categorias[a]||(a<b?-1:1)});return k.slice(0,n||2)}
  /* mês escolhido × o mesmo período do mês anterior (até o dia de hoje no mês corrente), com os mesmos filtros */
  function cuComparar(compras,f,mes,hoje){var P=mkcMesmoDia(mes,hoje||""),
      a=cuResumo(cuFiltrar(compras,Object.assign({},f,{de:P.atual.de,ate:P.atual.ate}))),p=cuResumo(cuFiltrar(compras,Object.assign({},f,{de:P.anterior.de,ate:P.anterior.ate})));
    return {periodo:P,atual:a,anterior:p,dif:amR2(a.total-p.total),pct:p.total>0?(a.total-p.total)/p.total:null}}
  /* itens de um conjunto de compras (para abrir "os produtos comprados naquela loja/categoria"), do maior valor para o menor */
  function cuItens(lista,f){f=f||{};var out=[];
    (lista||[]).forEach(function(c){(c.itens||[]).forEach(function(i){if(f.categoria&&!cuCatBate(i.categoria,f.categoria))return;
      out.push({compra:c.id,data:c.data,estabelecimento:c.estabelecimento,canal:c.canal,nome:i.nome,qtd:i.qtd,unidade:i.unidade,valor:i.valor,categoria:i.categoria,sub:i.sub})})});
    return out.sort(function(a,b){return b.valor-a.valor||(a.nome<b.nome?-1:1)})}
  function cuEstabelecimentos(compras){var s={};(compras||[]).forEach(function(c){s[c.estabelecimento]=(s[c.estabelecimento]||0)+c.valor});return Object.keys(s).sort(function(a,b){return s[b]-s[a]})}
  function cuCategorias(compras){var s={};(compras||[]).forEach(function(c){Object.keys(c.categorias||{}).forEach(function(k){s[k]=(s[k]||0)+c.categorias[k]})});var l=Object.keys(s).sort(function(a,b){return s[b]-s[a]});
    return l.some(function(k){return CU_GRUPOS["Alimentação"].indexOf(k)>=0})?["Alimentação"].concat(l):l}

  /* ===== Áreas de consumo (docs/central-areas.md): cada item pertence a UMA categoria e cada categoria a UMA área; a Central soma todas as áreas.
     Só funções puras. A configuração (áreas criadas, associações alteradas, categorias personalizadas) fica em PESSOAL["mercado-areas"] (tabela pessoal, só o dono, trava MFA, backup, sem migration):
       {v:1, areas:[{id,nome}] (só as criadas), associacoes:{"<categoria>":"<id da área>"|""} (só o que o dono mudou), categorias:["<personalizada>"]}
     Mudar a área de uma categoria NUNCA altera nota, pedido, item nem valor: só muda em qual painel o item é somado. Item cuja categoria não tem área fica "não classificado": a Central o soma, nenhum painel de área o mostra.
     Frete, taxas e desconto geral de pedido online não pertencem a nenhum item: não são rateados e ficam só na Central (linha "ajustes"). */
  var AR_AREAS_PADRAO=[{id:"mercado",nome:"Mercado"},{id:"automotivo",nome:"Automotivo"},{id:"farmacia",nome:"Farmácia"},{id:"bebe",nome:"Bebê/Infantil"},{id:"delivery",nome:"Delivery",ocultaVazia:true}];
  var AR_MAPA_PADRAO={"Mercearia":"mercado","Padaria":"mercado","Açougue/Frios":"mercado","Hortifruti":"mercado","Chocolates/Doces":"mercado","Bebidas":"mercado","Limpeza":"mercado","Higiene Pessoal":"mercado","Peixaria":"mercado","Casa/Utilidades":"mercado","Bebê/Infantil":"bebe","Farmácia":"farmacia","Automotivo":"automotivo","Delivery":"delivery","Restaurante":"delivery"};
  var AR_MAX_AREAS=24,AR_MAX_CATS=200;
  function arTem(o,k){return Object.prototype.hasOwnProperty.call(o,k)}
  function arNomeOk(t,max){if(typeof t!=="string")return "";t=t.replace(/\s+/g," ").trim();return t&&t.length<=max&&!/[<>]/.test(t)&&t.indexOf("__")!==0?t:""}
  function arChave(c){return norm(cuCat(c))}
  function arConfig(raw){var r=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw:{},areas=[],ids={},nomes={},assoc={},cats={},over={},pers=[];
    AR_AREAS_PADRAO.forEach(function(a){areas.push({id:a.id,nome:a.nome,propria:false,ocultaVazia:!!a.ocultaVazia});ids[a.id]=1;nomes[norm(a.nome)]=1});
    (Array.isArray(r.areas)?r.areas:[]).slice(0,AR_MAX_AREAS).forEach(function(a){var id=String(a&&a.id||"").trim(),nm=arNomeOk(a&&a.nome,40);
      if(!/^[a-z0-9-]{1,40}$/.test(id)||!nm||arTem(ids,id)||arTem(nomes,norm(nm)))return;ids[id]=1;nomes[norm(nm)]=1;areas.push({id:id,nome:nm,propria:true})});
    Object.keys(AR_MAPA_PADRAO).forEach(function(k){assoc[norm(k)]=AR_MAPA_PADRAO[k];cats[norm(k)]=k});
    (Array.isArray(r.categorias)?r.categorias:[]).slice(0,AR_MAX_CATS).forEach(function(n){var t=arNomeOk(n,40),k=t&&arChave(t);if(!t||arTem(cats,k))return;cats[k]=t;pers.push(t)});
    var as=r.associacoes&&typeof r.associacoes==="object"&&!Array.isArray(r.associacoes)?r.associacoes:{};
    Object.keys(as).slice(0,AR_MAX_CATS*2).forEach(function(n){var t=arNomeOk(n,40);if(!t)return;var k=arChave(t),a=as[n]==null?"":String(as[n]);if(a&&!arTem(ids,a))a="";if(!arTem(cats,k))cats[k]=t;over[k]={categoria:cats[k],area:a};assoc[k]=a});
    return {areas:areas,ids:ids,assoc:assoc,nomes:cats,over:over,personalizadas:pers}}
  /* a forma que se grava: só o que difere do padrão */
  function arRaw(cfg){var as={};Object.keys(cfg.over).forEach(function(k){var d=arTem(AR_MAPA_PADRAO_K,k)?AR_MAPA_PADRAO_K[k]:"";if(cfg.over[k].area!==d)as[cfg.over[k].categoria]=cfg.over[k].area});
    return {v:1,areas:cfg.areas.filter(function(a){return a.propria}).map(function(a){return {id:a.id,nome:a.nome}}),associacoes:as,categorias:cfg.personalizadas.slice()}}
  var AR_MAPA_PADRAO_K=(function(){var o={};Object.keys(AR_MAPA_PADRAO).forEach(function(k){o[norm(k)]=AR_MAPA_PADRAO[k]});return o})();
  function arAreaDe(cfg,categoria){var k=arChave(categoria);return arTem(cfg.assoc,k)&&cfg.assoc[k]&&arTem(cfg.ids,cfg.assoc[k])?cfg.assoc[k]:""}
  function arNomeArea(cfg,id){for(var i=0;i<cfg.areas.length;i++)if(cfg.areas[i].id===id)return cfg.areas[i].nome;return id?id:"Não classificados"}
  function arAssociar(cfg,categoria,areaId){var t=arNomeOk(categoria,40);if(!t)return {ok:false,erro:"Escolha uma categoria.",cfg:cfg};
    if(areaId&&!arTem(cfg.ids,areaId))return {ok:false,erro:"Essa área não existe.",cfg:cfg};
    var r=arRaw(cfg);r.associacoes[arNomeOk(cfg.nomes[arChave(t)]||t,40)||t]=areaId||"";return {ok:true,cfg:arConfig(r)}}
  function arAreaCriar(cfg,nome){var t=arNomeOk(nome,40);if(!t)return {ok:false,erro:"Dê um nome à área (até 40 letras, sem < ou >).",cfg:cfg};
    if(cfg.areas.some(function(a){return norm(a.nome)===norm(t)}))return {ok:false,erro:"Já existe uma área com esse nome.",cfg:cfg};
    if(cfg.areas.length>=AR_MAX_AREAS+AR_AREAS_PADRAO.length)return {ok:false,erro:"Limite de áreas atingido.",cfg:cfg};
    var base=norm(t).replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,30)||"area",id=base,n=2;while(arTem(cfg.ids,id))id=base+"-"+(n++);
    var r=arRaw(cfg);r.areas.push({id:id,nome:t});return {ok:true,cfg:arConfig(r),area:id}}
  /* só as áreas criadas podem ser removidas; as categorias dela ficam sem área (não classificadas), sem perder nenhum registro */
  function arAreaRemover(cfg,id){var a=cfg.areas.filter(function(x){return x.id===id})[0];if(!a||!a.propria)return {ok:false,erro:"Só as áreas criadas por você podem ser removidas.",cfg:cfg};
    var r=arRaw(cfg);r.areas=r.areas.filter(function(x){return x.id!==id});
    Object.keys(cfg.assoc).forEach(function(k){if(cfg.assoc[k]===id)r.associacoes[cfg.nomes[k]]=""});return {ok:true,cfg:arConfig(r)}}
  function arCategoriaCriar(cfg,nome,areaId){var t=arNomeOk(nome,40);if(!t)return {ok:false,erro:"Dê um nome à categoria (até 40 letras, sem < ou >).",cfg:cfg};
    if(areaId&&!arTem(cfg.ids,areaId))return {ok:false,erro:"Essa área não existe.",cfg:cfg};
    if(arTem(cfg.nomes,arChave(t)))return {ok:false,erro:"Essa categoria já existe.",cfg:cfg};
    if(cfg.personalizadas.length>=AR_MAX_CATS)return {ok:false,erro:"Limite de categorias atingido.",cfg:cfg};
    var r=arRaw(cfg);r.categorias.push(t);if(areaId)r.associacoes[t]=areaId;return {ok:true,cfg:arConfig(r)}}
  /* só as personalizadas saem da lista; itens que já usam o nome continuam como estão (passam a não classificados) */
  function arCategoriaRemover(cfg,nome){var k=arChave(nome),t=cfg.personalizadas.filter(function(x){return arChave(x)===k})[0];if(!t)return {ok:false,erro:"Só as categorias criadas por você podem ser removidas.",cfg:cfg};
    var r=arRaw(cfg);r.categorias=r.categorias.filter(function(x){return x!==t});delete r.associacoes[t];return {ok:true,cfg:arConfig(r)}}
  /* a compra reduzida aos itens de UMA área ("" = não classificados). Valor = soma dos itens; frete, taxas e descontos gerais não entram (ajustes 0). Nada é alterado na compra original. */
  function arCompras(compras,areaId,cfg){var out=[];
    (compras||[]).forEach(function(c){var fi=[],cats={},v=0;
      (c.itens||[]).forEach(function(i){if(arAreaDe(cfg,i.categoria)!==areaId)return;fi.push(i);v=amR2(v+i.valor);cats[i.categoria]=amR2((cats[i.categoria]||0)+i.valor)});
      if(!fi.length)return;var o=Object.assign({},c);o.itens=fi;o.n_itens=fi.length;o.valor=v;o.categorias=cats;o.ajustes=0;o.aj=null;o.desconto=0;o.valor_compra=c.valor;o.parcial=fi.length<(c.itens||[]).length||amR2(c.valor-v)!==0;out.push(o)});
    return out}
  /* a Central por área: Σ áreas + não classificados + ajustes = total da Central (cuResumo), no mesmo filtro. Ajustes = o que a compra paga além dos itens (frete, taxas, desconto geral). */
  function arResumo(compras,cfg,f){var lista=cuFiltrar(compras,f||{}),por={},R={total:0,compras:0,ajustes:0,areas:[],semArea:{id:"",nome:"Não classificados",total:0,itens:0,compras:0,categorias:[]}},sc={};
    cfg.areas.forEach(function(a){por[a.id]={id:a.id,nome:a.nome,total:0,itens:0,compras:0}});
    lista.forEach(function(c){var soma=0,vis={};R.compras++;R.total=amR2(R.total+c.valor);
      (c.itens||[]).forEach(function(i){var a=arAreaDe(cfg,i.categoria),x=a?por[a]:R.semArea;soma=amR2(soma+i.valor);x.total=amR2(x.total+i.valor);x.itens++;if(!vis[a]){vis[a]=1;x.compras++}if(!a)sc[i.categoria]=amR2((sc[i.categoria]||0)+i.valor)});
      R.ajustes=amR2(R.ajustes+(c.valor-soma))});
    R.areas=cfg.areas.map(function(a){return por[a.id]});R.semArea.categorias=Object.keys(sc).sort(function(a,b){return sc[b]-sc[a]||(a<b?-1:1)}).map(function(k){return {categoria:k,total:sc[k]}});
    R.conferencia=amR2(R.areas.reduce(function(s,a){return s+a.total},0)+R.semArea.total+R.ajustes-R.total)||0;return R}
  /* lista da Gestão de categorias: as oficiais, as extras, as personalizadas e todas as que existem nos dados (nenhuma some) */
  function arCategorias(cfg,compras){var m={},ordem=[];
    function add(nome){var k=arChave(nome);if(!arTem(m,k)){m[k]={categoria:nome,itens:0,total:0};ordem.push(k)}return m[k]}
    Object.keys(AR_MAPA_PADRAO).forEach(add);MK_CATEGORIAS.concat(MK_CATEGORIAS_EXTRA).forEach(add);cfg.personalizadas.forEach(add);Object.keys(cfg.over).forEach(function(k){add(cfg.over[k].categoria)});
    (compras||[]).forEach(function(c){(c.itens||[]).forEach(function(i){var x=add(i.categoria);x.itens++;x.total=amR2(x.total+i.valor)})});
    var pk={};cfg.personalizadas.forEach(function(x){pk[arChave(x)]=1});
    var l=ordem.map(function(k){var x=m[k],a=arAreaDe(cfg,x.categoria);x.area=a;x.areaNome=arNomeArea(cfg,a);x.padrao=arTem(AR_MAPA_PADRAO_K,k);x.personalizada=!!pk[k];x.semArea=!a;
      x.explicacao=a?"Os itens desta categoria são somados no painel "+x.areaNome+" e na Central.":"Sem área: os itens aparecem só na Central, como não classificados, até você escolher uma área.";return x});
    var ia={};cfg.areas.forEach(function(a,n){ia[a.id]=n+1});
    return l.sort(function(a,b){return (a.semArea?0:1)-(b.semArea?0:1)||(ia[a.area]||0)-(ia[b.area]||0)||(b.total-a.total)||(a.categoria<b.categoria?-1:1)})}

  /* ===== Central de Compras como um mercado (docs/central-compras.md, "Navegação de mercado"): categoria → produtos → preços; estabelecimento → compras e produtos;
     comparação entre estabelecimentos e oportunidades de economia. Puro: nada aqui lê banco nem desenha tela.
     Entrada: as compras unificadas (cuUnificar().compras), que já trazem a regra financeira de cada fonte; nada é recalculado nem regravado.
     Item = o que a Central já soma por categoria (Mercado: itens.valor_total; online: o valor líquido do item em coPedidoPartes).
     Preço unitário = o da fonte: Mercado, valor_unitario (o desconto da nota fica só no total, como em mkcProduto); online, valor líquido do item ÷ quantidade
     (frete, taxas e desconto geral do pedido nunca entram no preço nem são rateados). As linhas têm o formato das linhas do Mercado
     (produto, quantidade, unidade, valor_unitario, valor_total, mercado = estabelecimento, nota = compra), então mkcProduto e mkcProdutos valem para as duas fontes. */
  function cmLinhas(compras){var out=[];
    (compras||[]).forEach(function(c){(c.itens||[]).forEach(function(i,k){var q=+i.qtd>0?+i.qtd:0,v=amR2(+i.valor||0),u=c.fonte==="nota"?amR2(+i.unitario||0):amR2(q>0?v/q:v);
      out.push({id:c.id+"#"+k,compra:c.id,fonte:c.fonte,nota:c.id,abre:c.fonte==="nota"?(c.nota_abre||c.chave):null,item_id:c.fonte==="nota"?i.item_id||null:null,chave_online:c.fonte==="online"?i.produto_chave||null:null,
        data:c.data,mes:c.mes,mk:c.mes,estabelecimento:c.estabelecimento,mercado:c.estabelecimento,emissor:c.emissor||null,forma_pagamento:c.pagamento||null,desconto:amR2(+i.desconto||0),canal:c.canal,categoria:i.categoria,sub:i.sub||null,nome_original:i.nome_original||null,
        produto:String(i.nome==null?"":i.nome).trim()||"Sem nome",quantidade:q,unidade:mkcUn(i.unidade),valor_unitario:u,valor_total:v})})});
    return out}
  /* filtros das linhas: {de, ate, canal, estab, categoria (aceita o grupo Alimentação), produto} */
  function cmFiltrar(linhas,f){f=f||{};return (linhas||[]).filter(function(x){return (!f.de||x.data>=f.de)&&(!f.ate||x.data<=f.ate)&&(!f.canal||x.canal===f.canal)&&(!f.estab||x.estabelecimento===f.estab)&&
    cuCatBate(x.categoria,f.categoria)&&(!f.produto||x.produto===f.produto)})}
  /* preço por estabelecimento de UM produto numa unidade: compras (distintas), quantidade, gasto, médio ponderado pela quantidade (Σ preço×qtd ÷ Σ qtd), menor e último */
  function cmPorEstab(linhas){var g=mkcAgrupa((linhas||[]).slice().sort(mkcOrd),function(x){return x.estabelecimento});
    return g.o.map(function(e){var l=g.m[e],q=0,pq=0,t=0,men=null,u=l[l.length-1];
      l.forEach(function(x){var p=+x.valor_unitario||0,k=+x.quantidade||0;q+=k;pq+=p*k;t+=+x.valor_total||0;if(p>0&&(men===null||p<men))men=p});
      return {nome:e,compras:mkcAgrupa(l,mkcNota).o.length,qtd:Math.round(q*1000)/1000,total:mkcR(t),medio:q>0?mkcR(pq/q):(l.length?mkcR(l.reduce(function(s,x){return s+(+x.valor_unitario||0)},0)/l.length):null),
        menor:men,ultimo:{preco:+u.valor_unitario||0,data:u.data}}}).sort(function(a,b){return (a.medio==null)-(b.medio==null)||a.medio-b.medio||(a.nome<b.nome?-1:1)})}
  /* resumo de UM produto para as listas (categoria e estabelecimento): reaproveita mkcProduto; a unidade principal é a que tem mais compras (kg e un nunca se misturam) */
  function cmResumoProduto(r){var d=mkcProduto(r);if(!d)return null;var u=d.unidades[0],subs={},ult=r[0].data;
    r.forEach(function(x){subs[x.sub||""]=1;if(x.data>ult)ult=x.data});var sk=Object.keys(subs);
    return {nome:d.nome,categoria:d.categoria,sub:sk.length===1&&sk[0]?sk[0]:null,total:d.total,compras:d.compras,qtd:mkcQtd(r),unidade:u.unidade,unidades:d.unidades.length,
      medio:u.precoMedio,ultimo:u.ultimo,anterior:u.anterior,variacao:u.variacaoUltimo,menor:u.menor,maior:u.maior,estabelecimentos:d.mercados.length,ultimaData:ult}}
  /* ordem das listas de produtos: gasto (padrão), compras, nome, alta (maior aumento desde a compra anterior) e baixa; quem não tem variação fica no fim */
  function cmOrdenar(l,o){o=o||"gasto";return l.sort(function(a,b){var d;
    if(o==="alta"||o==="baixa"){var x=a.variacao,y=b.variacao;if(x==null||y==null)d=x===y?0:x==null?1:-1;else d=o==="alta"?y-x:x-y}
    else d=o==="nome"?a.nome.localeCompare(b.nome):o==="compras"?b.compras-a.compras||b.total-a.total:b.total-a.total;
    return d||a.nome.localeCompare(b.nome)})}
  /* uma categoria (ou o grupo Alimentação): total = soma dos itens dela (o mesmo valor da barra "Por categoria" da Central com os mesmos filtros), produtos e estabelecimentos */
  function cmCategoria(linhas,categoria,ordem){var cat=cuCat(categoria),l=cmFiltrar(linhas,{categoria:cat}),tot=mkcR(l.reduce(function(s,x){return s+(+x.valor_total||0)},0)),
      g=mkcAgrupa(l,function(x){return x.produto}),e=mkcAgrupa(l,function(x){return x.estabelecimento});
    return {categoria:cat,grupo:!!CU_GRUPOS[cat],total:tot,itens:l.length,compras:mkcAgrupa(l,mkcNota).o.length,
      produtos:cmOrdenar(g.o.map(function(p){return cmResumoProduto(g.m[p])}),ordem),
      estabelecimentos:e.o.map(function(n){var z=e.m[n],t=mkcR(z.reduce(function(s,x){return s+(+x.valor_total||0)},0));
        return {nome:n,total:t,compras:mkcAgrupa(z,mkcNota).o.length,produtos:mkcAgrupa(z,function(x){return x.produto}).o.length,pct:tot?t/tot:0}}).sort(function(a,b){return b.total-a.total||(a.nome<b.nome?-1:1)})}}
  /* um estabelecimento no conjunto de compras recebido (já filtrado por período e canal): total = soma do valor das compras dele (o mesmo da barra "Por estabelecimento");
     produtos + ajustes dos pedidos (frete, taxas, descontos gerais) = total; a participação é sobre o total de todas as compras recebidas; ranking = todos os estabelecimentos */
  function cmEstabelecimento(compras,nome,ordem){var todas=compras||[],cs=todas.filter(function(c){return c.estabelecimento===nome}),geral=0,tot=0,aj=0,can={presencial:0,online:0},emis={},rk={};
    todas.forEach(function(c){geral=amR2(geral+c.valor);var r=rk[c.estabelecimento]||(rk[c.estabelecimento]={nome:c.estabelecimento,total:0,compras:0});r.total=amR2(r.total+c.valor);r.compras++});
    cs.forEach(function(c){tot=amR2(tot+c.valor);aj=amR2(aj+(+c.ajustes||0));can[c.canal]=(can[c.canal]||0)+1;if(c.emissor&&cuSemCidade(c.emissor)!==nome)emis[c.emissor]=1});
    var l=cmLinhas(cs),g=mkcAgrupa(l,function(x){return x.produto}),k=mkcAgrupa(l,function(x){return x.categoria}),pv=mkcR(l.reduce(function(s,x){return s+x.valor_total},0));
    var ranking=Object.keys(rk).map(function(n){var r=rk[n];r.ticket=r.compras?amR2(r.total/r.compras):null;r.pct=geral?r.total/geral:0;return r}).sort(function(a,b){return b.total-a.total||(a.nome<b.nome?-1:1)});
    var hist=cs.slice().sort(function(a,b){return a.data<b.data?1:a.data>b.data?-1:(a.id<b.id?1:-1)}).map(function(c){return {id:c.id,fonte:c.fonte,data:c.data,valor:c.valor,itens:c.n_itens,canal:c.canal,abre:c.fonte==="nota"?(c.nota_abre||c.chave):null,categorias:cuCategoriasDe(c,2)}});
    return {nome:nome,total:tot,compras:cs.length,itens:l.length,ticket:cs.length?amR2(tot/cs.length):null,produtosValor:pv,ajustes:aj,pct:geral?tot/geral:0,geral:geral,
      primeira:hist.length?hist[hist.length-1].data:null,ultima:hist.length?hist[0].data:null,canais:can,emissores:Object.keys(emis),
      categorias:k.o.map(function(n){var z=k.m[n],t=mkcR(z.reduce(function(s,x){return s+x.valor_total},0));return {nome:n,total:t,produtos:mkcAgrupa(z,function(x){return x.produto}).o.length,pct:pv?t/pv:0}}).sort(function(a,b){return b.total-a.total||(a.nome<b.nome?-1:1)}),
      produtos:cmOrdenar(g.o.map(function(p){return cmResumoProduto(g.m[p])}),ordem),historico:hist,ranking:ranking,posicao:ranking.map(function(r){return r.nome}).indexOf(nome)+1}}
  /* o mesmo produto (e unidade) comprado AQUI e em outros estabelecimentos, nas linhas recebidas: preço médio daqui × o menor médio de outro lugar.
     leitura: igual (diferença < 2%), mais_barato_aqui ou mais_caro_aqui. Só compara a mesma unidade (kg com kg); nada é convertido. */
  function cmComparar(linhas,nome){var g=mkcAgrupa(linhas||[],mkcChaveProd),out=[],n={mais_barato_aqui:0,mais_caro_aqui:0,igual:0};
    g.o.forEach(function(k){var l=g.m[k],por=cmPorEstab(l).filter(function(e){return e.medio!=null&&e.medio>0}),aqui=por.filter(function(e){return e.nome===nome})[0],outros=por.filter(function(e){return e.nome!==nome});
      if(!aqui||!outros.length)return;var m=outros[0],dif=mkcR(aqui.medio-m.medio),pct=dif/m.medio;
      out.push({produto:l[0].produto,unidade:mkcUn(l[0].unidade),categoria:l[0].categoria,aqui:aqui,melhor:m,outros:outros.length,dif:dif,pct:pct,leitura:Math.abs(pct)<0.02?"igual":pct<0?"mais_barato_aqui":"mais_caro_aqui"})});
    out.forEach(function(x){n[x.leitura]++});
    return {produtos:out.sort(function(a,b){return b.pct-a.pct||(a.produto<b.produto?-1:1)}),contagem:n}}
  /* oportunidades de economia nas linhas recebidas: produto (e unidade) comprado em 2+ estabelecimentos por preços médios diferentes.
     economia = Σ (médio pago lá − médio do mais barato) × quantidade comprada lá, só onde a diferença passa de minPct (padrão 3%); só entra com economia ≥ minValor (padrão R$ 1).
     É uma ESTIMATIVA com os preços já pagos (mesmo período): o que se teria gasto comprando as mesmas quantidades pelo preço médio do mais barato. Nada é previsto nem inventado. */
  function cmOportunidades(linhas,opc){opc=opc||{};var minV=opc.minValor!=null?opc.minValor:1,minP=opc.minPct!=null?opc.minPct:0.03,g=mkcAgrupa(linhas||[],mkcChaveProd),out=[];
    g.o.forEach(function(k){var l=g.m[k],por=cmPorEstab(l).filter(function(e){return e.medio!=null&&e.medio>0&&e.qtd>0});if(por.length<2)return;
      var bar=por[0],eco=0,caros=[];
      por.slice(1).forEach(function(e){var d=e.medio-bar.medio;if(d<=0||d/bar.medio<minP)return;var x=mkcR(d*e.qtd);eco=mkcR(eco+x);caros.push({nome:e.nome,medio:e.medio,qtd:e.qtd,compras:e.compras,ultimo:e.ultimo,pct:d/bar.medio,extra:x})});
      if(!caros.length||eco<minV)return;
      out.push({produto:l[0].produto,unidade:mkcUn(l[0].unidade),categoria:l[0].categoria,economia:eco,barato:bar,caros:caros.sort(function(a,b){return b.extra-a.extra}),estabelecimentos:por.length})});
    return out.sort(function(a,b){return b.economia-a.economia||(a.produto<b.produto?-1:1)})}
  /* gasto mês a mês (os n meses até "fim", AAAA-MM ou AAAA-MM-DD), com os filtros da Central (canal, estab, categoria; com categoria valem só os itens dela, como em cuFiltrar).
     Meses sem compra aparecem com zero (nada é preenchido). media = média dos meses desde o primeiro com compra na janela. */
  function cmPorMes(compras,f,fim,n){f=f||{};if(!/^\d{4}-\d{2}/.test(String(fim||"")))return {meses:[],media:null,total:0,desde:null};
    var idx={},L=pnMeses(String(fim),n||12).map(function(k,i){idx[k]=i;return {mes:k,total:0,compras:0}});
    cuFiltrar(compras,{canal:f.canal,estab:f.estab,categoria:f.categoria}).forEach(function(c){var i=idx[c.mes];if(i==null)return;L[i].total=amR2(L[i].total+c.valor_f);L[i].compras++});
    var ini=-1;L.forEach(function(x,i){if(ini<0&&x.compras)ini=i});var ja=ini<0?[]:L.slice(ini),t=amR2(ja.reduce(function(s,x){return s+x.total},0));
    return {meses:L,media:ja.length?amR2(t/ja.length):null,total:t,desde:ini<0?null:L[ini].mes}}
  /* entrada da navegação: categorias e estabelecimentos do conjunto de compras (os totais são os de cuResumo, a mesma conta das barras), com produtos diferentes de cada um */
  function cmExplorar(compras){var R=cuResumo(cuFiltrar(compras,{})),l=cmLinhas(compras),pc=mkcAgrupa(l,function(x){return x.categoria}),pe=mkcAgrupa(l,function(x){return x.estabelecimento}),
      np=function(z){return z?mkcAgrupa(z,function(x){return x.produto}).o.length:0};
    return {total:R.total,categorias:R.porCategoria.map(function(c){return {nome:c.cat,total:c.total,compras:c.compras,produtos:np(pc.m[c.cat])}}),
      estabelecimentos:R.porEstab.map(function(e){return {nome:e.nome,total:e.total,compras:e.n,produtos:np(pe.m[e.nome])}})}}
  /* ===== Mesmo produto com nomes diferentes no pedido online e na nota do Mercado (docs/central-compras.md, "Juntar produtos"). Puro.
     A junção é decisão do dono (o sistema só SUGERE), guardada em PESSOAL["mercado-equivalencias"] = {v:1, itens:{"o:<chave do nome no pedido>": "<nome do produto>"}}, sem migration.
     Ela só RENOMEIA o item online na leitura da Central: o pedido gravado, os valores, a categoria e as regras financeiras não mudam; separar desfaz. Produtos do Mercado continuam
     sendo juntados pela aba Produtos (no banco). */
  function cmChaveOn(nome){return "o:"+mkChave(nome)}
  function cmEquivalencias(raw){var o={},n=raw&&raw.itens&&typeof raw.itens==="object"&&!Array.isArray(raw.itens)?raw.itens:{};
    Object.keys(n).slice(0,1000).forEach(function(k){var v=n[k];if(/^o:.{1,200}$/.test(k)&&typeof v==="string"&&v.trim()&&v.trim().length<=160)o[k]=v.trim()});return o}
  /* junta "origem" (nome do item no pedido online) ao produto "destino"; sem cadeia: se o destino já foi juntado, vai direto ao final, e quem apontava para a origem passa a apontar para o destino */
  function cmJuntar(mapa,origem,destino){var o=JSON.parse(JSON.stringify(mapa||{})),a=String(origem==null?"":origem).trim(),b=String(destino==null?"":destino).trim();
    if(!a||!b)return {ok:false,erro:"Escolha os dois produtos.",mapa:o};
    if(a.length>160||b.length>160)return {ok:false,erro:"O nome passa de 160 letras.",mapa:o};
    if(!mkChave(a)||!mkChave(b))return {ok:false,erro:"Nome sem letras nem números.",mapa:o};
    if(o[cmChaveOn(b)])b=o[cmChaveOn(b)];
    if(cmChaveOn(b)===cmChaveOn(a))return {ok:false,erro:"É o mesmo produto.",mapa:o};
    Object.keys(o).forEach(function(k){if(o[k]===a)o[k]=b});o[cmChaveOn(a)]=b;
    if(Object.keys(o).length>1000)return {ok:false,erro:"Limite de 1000 junções.",mapa:JSON.parse(JSON.stringify(mapa||{}))};
    return {ok:true,mapa:o}}
  function cmSeparar(mapa,origem){var o=JSON.parse(JSON.stringify(mapa||{}));delete o[cmChaveOn(origem)];return o}
  /* aplica as junções às compras unificadas: só itens de pedido online; o nome original fica em nome_original. Devolve compras novas (as recebidas não mudam) */
  function cmAplicarEquivalencias(compras,mapa,cats){mapa=mapa||{};cats=cats||{};if(!Object.keys(mapa).length&&!Object.keys(cats).length)return compras||[];
    return (compras||[]).map(function(c){if(!c||c.fonte!=="online")return c;var mud=false,catMud=false,its=(c.itens||[]).map(function(i){var d=mapa[cmChaveOn(i.nome)],n=d&&d!==i.nome?d:i.nome,k=cats[cmChaveOn(n)],novo=null;
        if(n!==i.nome)novo={nome:n,nome_original:i.nome};
        if(k){var cc=cuCat(k);if(cc!==i.categoria){novo=Object.assign(novo||{},{categoria:cc});catMud=true}}
        if(!novo)return i;mud=true;return Object.assign({},i,novo)});
      if(!mud)return c;var r=Object.assign({},c,{itens:its});
      if(catMud){var cs={};its.forEach(function(i){var k=cuCat(i.categoria);cs[k]=amR2((cs[k]||0)+(+i.valor||0))});r.categorias=cs}
      return r})}
  /* categoria escolhida pelo dono para um produto de pedido online (PESSOAL["mercado-equivalencias"].categorias, chave = cmChaveOn do nome final); só lê o que é válido */
  function cmCategoriasOn(raw){var o={},n=raw&&raw.categorias&&typeof raw.categorias==="object"&&!Array.isArray(raw.categorias)?raw.categorias:{};
    Object.keys(n).slice(0,1000).forEach(function(k){var v=n[k];if(/^o:.{1,200}$/.test(k)&&typeof v==="string"){var t=v.replace(/\s+/g," ").trim();if(t&&t.length<=40&&!/[<>]/.test(t))o[k]=t}});return o}
  function cmCategoriaOnDefinir(cats,nome,categoria){var o=JSON.parse(JSON.stringify(cats||{})),k=cmChaveOn(nome),t=String(categoria==null?"":categoria).replace(/\s+/g," ").trim();
    if(!mkChave(nome))return {ok:false,erro:"Produto sem nome.",categorias:o};
    if(!t){delete o[k];return {ok:true,categorias:o}}
    if(t.length>40||/[<>]/.test(t))return {ok:false,erro:"Categoria inválida (até 40 letras).",categorias:o};
    o[k]=mkCatOficial(t)||t;if(Object.keys(o).length>1000)return {ok:false,erro:"Limite de 1000 categorias de produtos online.",categorias:JSON.parse(JSON.stringify(cats||{}))};return {ok:true,categorias:o}}
  /* renomear um produto de pedido online: cada nome de origem passa a apontar para o novo nome (ou volta ao original, se o novo nome for o dele) e a categoria escolhida acompanha o produto */
  function cmRenomearOn(mapa,cats,origens,antigo,novo){var m=JSON.parse(JSON.stringify(mapa||{})),c=JSON.parse(JSON.stringify(cats||{})),b=String(novo==null?"":novo).trim(),a=String(antigo==null?"":antigo).trim();
    if(!b||!mkChave(b))return {ok:false,erro:"Escreva o novo nome.",mapa:m,categorias:c};
    if(b.length>160)return {ok:false,erro:"O nome passa de 160 letras.",mapa:m,categorias:c};
    if(cmChaveOn(a)===cmChaveOn(b))return {ok:false,erro:"É o mesmo nome.",mapa:m,categorias:c};
    var ka=cmChaveOn(a),kb=cmChaveOn(b),cat=c[ka];
    (origens||[]).forEach(function(o){var x=String(o).trim();if(!x)return;if(cmChaveOn(x)===kb)delete m[cmChaveOn(x)];else m[cmChaveOn(x)]=b});
    Object.keys(m).forEach(function(k){if(m[k]===a)m[k]=b});
    if(cat!==undefined){delete c[ka];if(c[kb]===undefined)c[kb]=cat}
    if(Object.keys(m).length>1000)return {ok:false,erro:"Limite de 1000 junções.",mapa:JSON.parse(JSON.stringify(mapa||{})),categorias:JSON.parse(JSON.stringify(cats||{}))};
    return {ok:true,mapa:m,categorias:c}}
  /* SUGESTÕES: produto que só aparece em pedidos online × outro produto com nome parecido (palavras em comum ÷ palavras dos dois, sem números nem unidades; nome igual depois de normalizar = 100).
     A partir de opc.min (padrão 40%) e com 1+ palavra em comum; até 3 por produto, os do Mercado primeiro no empate. Nada é juntado sozinho. */
  function cmSugerirJuncoes(linhas,opc){opc=opc||{};var min=opc.min!=null?opc.min:40,por={},nomes=[];
    (linhas||[]).forEach(function(x){var p=por[x.produto];if(!p){p=por[x.produto]={nota:0,online:0,compras:{},categoria:x.categoria,tk:pcTokens(x.produto),ch:mkChave(x.produto)};nomes.push(x.produto)}
      p[x.fonte==="online"?"online":"nota"]++;p.compras[x.compra]=1});
    var out=[];
    nomes.forEach(function(n){var o=por[n];if(!o.online||o.nota)return;
      var cs=nomes.filter(function(m){return m!==n}).map(function(m){var t=por[m],c=o.tk.filter(function(w){return t.tk.indexOf(w)>=0}).length,u=o.tk.length+t.tk.length-c;
          return {nome:m,pontos:o.ch&&o.ch===t.ch?100:u?Math.round(c*100/u):0,comuns:c,fonte:t.nota?"nota":"online",compras:Object.keys(t.compras).length,categoria:t.categoria}})
        .filter(function(x){return x.pontos===100||(x.comuns>=1&&x.pontos>=min)})
        .sort(function(a,b){return b.pontos-a.pontos||(b.fonte==="nota")-(a.fonte==="nota")||(a.nome<b.nome?-1:1)}).slice(0,3);
      if(cs.length)out.push({origem:n,categoria:o.categoria,compras:Object.keys(o.compras).length,candidatos:cs})});
    return out.sort(function(a,b){return b.candidatos[0].pontos-a.candidatos[0].pontos||(a.origem<b.origem?-1:1)})}
  /* ===== Fase 2 · A5: regras que estavam dentro das telas (docs/planejamento/02-auditoria-arquitetural.md, P-08), agora puras e testadas
     (tests/nucleo_fase2.test.mjs). As MESMAS regras de antes: a tela passa o "hoje", o papel e os dados; nada de tela, banco ou relógio aqui.
     Também a normalização do MBA, usada pela fonte do MBA (Fase 2 · A4) sem carregar a tela do MBA. ===== */
  /* os mesmos formatos de js/app.js: fmtN (número com até 2 casas), maisDias (data + n dias, no fuso do aparelho), dataBR e moeda */
  function nFmt(v){return typeof v==="number"?v.toLocaleString("pt-BR",{maximumFractionDigits:2}):String(v)}
  function maisDiasLocal(iso,n){var d=new Date(iso+"T12:00:00");d.setDate(d.getDate()+n);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
  function dataBRDe(iso){var p=String(iso).split("-");return p[2]+"/"+p[1]+"/"+p[0]}
  function reaisDe(v){return v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}
  /* Saúde: padrões treino × VFC × sono × estresse × passos × humor dos últimos 120 dias (antes saudeInsights, dentro de js/saude.js).
     dono = só o dono recebe o convite para anotar o humor */
  function saudeInsights(dias,ativs,hoje,dono){
    var ini=somaDiasISO(hoje,-120),D=dias.filter(function(x){return x.data>=ini}),por={},out=[];D.forEach(function(x){por[x.data]=x.dados||{}});
    function media(l){return l.length?l.reduce(function(a,b){return a+b},0)/l.length:null}
    /* carga de treino por dia (soma da "carga" do Garmin, ou minutos quando não tem) */
    var carga={};ativs.forEach(function(a){var k=a.inicio.slice(0,10);if(k<ini)return;carga[k]=(carga[k]||0)+(a.dados.carga||(a.dados.duracao||0)/60)});
    var cs=Object.keys(carga).map(function(k){return carga[k]}).sort(function(a,b){return a-b}),forte=cs.length?cs[Math.floor(cs.length*.6)]:Infinity;
    var vf=[],vd=[],sf=[],sd=[];
    D.forEach(function(x){var ont=somaDiasISO(x.data,-1);if(!por[ont])return;var c=carga[ont]||0,v=x.dados.vfc&&x.dados.vfc.noite,n=x.dados.sono&&x.dados.sono.nota;
      if(c>=forte){if(v)vf.push(v);if(n)sf.push(n)}else if(!c){if(v)vd.push(v);if(n)sd.push(n)}});
    if(vf.length>=5&&vd.length>=5){var dv=media(vf)-media(vd);if(Math.abs(dv)>=2)out.push("Na noite depois de um treino forte, a sua variabilidade cardíaca fica em média "+Math.abs(Math.round(dv))+" ms "+(dv<0?"mais baixa":"mais alta")+" do que depois de um dia sem treino ("+Math.round(media(vf))+" × "+Math.round(media(vd))+" ms).")}
    if(sf.length>=5&&sd.length>=5){var dn=media(sf)-media(sd);if(Math.abs(dn)>=3)out.push("A nota do sono é "+Math.abs(Math.round(dn))+" pontos "+(dn>0?"maior":"menor")+" nas noites depois de treino forte.")}
    /* horário de dormir contra a nota do sono */
    var cedo=[],tarde=[];D.forEach(function(x){var s2=x.dados.sono;if(!s2||!s2.inicio||!s2.nota)return;var m=+s2.inicio.slice(0,2)*60+ +s2.inicio.slice(3,5);if(m<12*60)m+=1440;(m<=23*60?cedo:m>=23*60+45?tarde:[]).push(s2.nota)});
    if(cedo.length>=5&&tarde.length>=5){var dc=media(cedo)-media(tarde);if(Math.abs(dc)>=3)out.push("Quando você dorme até 23h, a nota do sono fica em "+Math.round(media(cedo))+"; depois de 23h45, cai para "+Math.round(media(tarde))+".")}
    /* estresse por dia da semana */
    var DS=["domingo","segunda","terça","quarta","quinta","sexta","sábado"],sem=[[],[],[],[],[],[],[]];
    D.forEach(function(x){if(typeof x.dados.estresse==="number")sem[new Date(x.data+"T12:00:00").getDay()].push(x.dados.estresse)});
    var ms=sem.map(function(l,i){return [i,l.length>=4?media(l):null]}).filter(function(x){return x[1]!=null}).sort(function(a,b){return b[1]-a[1]});
    if(ms.length>=5&&ms[0][1]-ms[ms.length-1][1]>=5)out.push("O dia da semana mais estressante é "+DS[ms[0][0]]+" (média "+Math.round(ms[0][1])+"); o mais tranquilo, "+DS[ms[ms.length-1][0]]+" ("+Math.round(ms[ms.length-1][1])+").");
    /* passos do dia contra o sono da noite seguinte */
    var xs=[],ys=[];D.forEach(function(x){var am=por[somaDiasISO(x.data,1)];if(am&&am.sono&&am.sono.total&&x.dados.passos){xs.push(x.dados.passos);ys.push(am.sono.total/3600)}});
    var rc=correlacao(xs,ys);if(rc!=null&&Math.abs(rc)>=.25)out.push("Nos dias em que você anda mais, você "+(rc>0?"dorme mais":"dorme menos")+" na noite seguinte (correlação "+nFmt(Math.round(rc*100)/100)+").");
    /* humor do diário contra sono, treino e estresse */
    var hs=D.filter(function(x){return typeof x.dados.humor==="number"});
    if(hs.length>=8){
      var bom=[],ruim=[];hs.forEach(function(x){var s3=x.dados.sono&&x.dados.sono.total/3600;if(s3>=7)bom.push(x.dados.humor);else if(s3&&s3<6)ruim.push(x.dados.humor)});
      if(bom.length>=3&&ruim.length>=3&&media(bom)-media(ruim)>=.4)out.push("Depois de noites com 7 h ou mais de sono, o seu humor fica em "+nFmt(Math.round(media(bom)*10)/10)+" de 5; com menos de 6 h, cai para "+nFmt(Math.round(media(ruim)*10)/10)+".");
      var tr=[],des=[];hs.forEach(function(x){(carga[x.data]?tr:des).push(x.dados.humor)});
      if(tr.length>=3&&des.length>=3&&Math.abs(media(tr)-media(des))>=.3)out.push("Nos dias com treino o seu humor médio é "+nFmt(Math.round(media(tr)*10)/10)+"; sem treino, "+nFmt(Math.round(media(des)*10)/10)+".");
      var ex=[],ey=[];hs.forEach(function(x){if(typeof x.dados.estresse==="number"){ex.push(x.dados.estresse);ey.push(x.dados.humor)}});
      var re=correlacao(ex,ey);if(re!=null&&re<=-.3)out.push("Quanto mais estresse o relógio mede no dia, pior o humor que você anota (correlação "+nFmt(Math.round(re*100)/100)+").")}
    else if(dono)out.push("Anote o humor por mais "+(8-hs.length)+(8-hs.length===1?" dia":" dias")+" para o site cruzar com o sono e o treino.");
    return out}
  /* Eddie e demais não-bebês: o diagnóstico mais recente. Vale o registro mais novo entre os que trazem dados.diagnostico (laudo importado) e as consultas cadastradas
     à mão (o título da consulta é o diagnóstico, ex.: "Dermatite Bacteriana (Piodermite)"); na mesma data, o que tem diagnóstico escrito ganha. Devolve {r, texto, vet} ou null. */
  function famDiagnostico(regs){var c=[];
    (regs||[]).forEach(function(r){var d=r&&r.dados||{},t=d.diagnostico||(r&&r.tipo==="consulta"&&r.titulo)||"";
      if(!t||!r.data)return;c.push({r:r,texto:String(t),vet:d.vet||(r.tipo==="consulta"&&r.valor)||"",dx:!!d.diagnostico})});
    c.sort(function(a,b){return a.r.data<b.r.data?1:a.r.data>b.r.data?-1:(b.dx?1:0)-(a.dx?1:0)});
    return c[0]||null}
  /* Família: remédios de todas as receitas, com início, fim e se está em uso hoje (antes famMeds, em js/familia.js) */
  function famMeds(regs,hoje){var out=[];
    regs.forEach(function(r){((r.dados||{}).meds||[]).forEach(function(m){
      var ini=m.inicio||r.data,fim=m.continuo?null:maisDiasLocal(ini,Math.max(1,m.dias||1)-1);
      out.push({m:m,r:r,ini:ini,fim:fim,ativo:ini<=hoje&&(m.continuo||fim>=hoje)})})});
    return out.sort(function(a,b){return b.ini.localeCompare(a.ini)})}
  /* MBA (PESSOAL.mba, PESSOAL.mbaLinks e PESSOAL.mbaFeito): aulas com o link, avaliações e parcelas (antes só dentro de js/mba.js) */
  function mbaAulasDe(mba,links){var L=links||{};return ((mba||{}).aulas||[]).map(function(a){return Object.assign({},a,{link:L[a.id]||a.link||""})}).sort(function(a,b){return (a.data+a.hora).localeCompare(b.data+b.hora)})}
  function mbaAvalsDe(mba,feito,hoje){var f=feito||{};return ((mba||{}).avaliacoes||[]).map(function(a){return Object.assign({},a,{feita:!!f["av:"+a.id],vencida:a.ate<hoje})}).sort(function(a,b){return a.ate.localeCompare(b.ate)})}
  function mbaFinDe(mba,feito,hoje){var F=(mba||{}).financeiro;if(!F||!(F.parcelas||[]).length)return null;var f=feito||{};
    var ps=F.parcelas.map(function(p){return Object.assign({},p,{paga:!!f["pg:"+p.k],atrasada:!f["pg:"+p.k]&&p.venc<hoje})});
    var abertas=ps.filter(function(p){return !p.paga});
    return {F:F,ps:ps,pagas:ps.length-abertas.length,prox:abertas[0]||null,atrasadas:abertas.filter(function(p){return p.atrasada}),
      pago:ps.filter(function(p){return p.paga}).reduce(function(s,p){return s+p.v},0),falta:abertas.reduce(function(s,p){return s+p.v},0)}}
  /* Hoje, Lote 2 da reestruturação visual: o que pede ação no MBA. Horários de Brasília (-03:00, sem horário de verão). feito = PESSOAL.mbaFeito: "au:<id>" aula assistida,
     "av:<id>" avaliação respondida, "pg:<k>" parcela paga. Aula "passou" 3 h depois do início (como mbaProxAula); "para assistir" = passou, sem marca, nos últimos 14 dias. */
  function mbaHojeResumo(mba,links,feito,hoje,agoraMs){var f=feito||{},H3=3*3600e3,D14=14*864e5,
      aulas=mbaAulasDe(mba,links).map(function(a){return Object.assign({},a,{ini:Date.parse(a.data+"T"+(a.hora||"19:00")+":00-03:00")})}).filter(function(a){return !isNaN(a.ini)}).sort(function(a,b){return a.ini-b.ini}),
      emCurso=aulas.filter(function(a){return a.ini+H3>agoraMs}),aoVivo=emCurso.filter(function(a){return a.data===hoje})[0]||null,
      avs=mbaAvalsDe(mba,f,hoje).filter(function(a){return !a.feita}),fin=mbaFinDe(mba,f,hoje);
    return {aoVivo:aoVivo,proxima:emCurso.filter(function(a){return a!==aoVivo})[0]||null,
      paraAssistir:aulas.filter(function(a){return a.ini+H3<=agoraMs&&a.ini>=agoraMs-D14&&!f["au:"+a.id]}).sort(function(a,b){return b.ini-a.ini}),
      avalPendentes:avs.filter(function(a){return !a.vencida}),avalVencidas:avs.filter(function(a){return a.vencida}),
      boleto:fin&&fin.prox?{v:fin.prox.v,venc:fin.prox.venc,dias:Math.round((Date.parse(fin.prox.venc+"T12:00:00-03:00")-Date.parse(hoje+"T12:00:00-03:00"))/864e5),pagas:fin.pagas,total:fin.ps.length,falta:fin.falta}:null}}
  /* MBA: o material de cada aula só sai no portal cerca de 3 dias antes (aulas às terças). Devolve as aulas (menos palestras) que acontecem nos próximos 3 dias, ou hoje,
     e cujo material ainda não foi marcado como conferido ("mat:<id>" em mbaFeito). Conta pura: quem marca e desenha é js/mba.js. */
  function mbaMaterialPendente(mba,links,feito,hoje){var f=feito||{},h0=Date.parse(hoje+"T12:00:00-03:00");
    return mbaAulasDe(mba,links).filter(function(a){if(/^Palestra/i.test(a.t)||f["mat:"+a.id])return false;var d=Math.round((Date.parse(a.data+"T12:00:00-03:00")-h0)/864e5);return d>=0&&d<=3})}
  /* Hoje, Lote 2: as últimas notas de compra a partir das linhas da tabela compras (uma linha por item): agrupa por data, loja e número da nota, soma em centavos e ordena
     da mais recente (data e, no empate, o maior id). Linha sem data fica de fora. */
  function mkUltimasNotas(linhas,n){var g={},ks=[];
    (linhas||[]).forEach(function(x){if(!x||!x.data)return;var k=x.data+"|"+(x.mercado||"")+"|"+(x.numero||""),v=Number(x.valor_total),id=Number(x.id)||0;
      if(!g[k]){g[k]={chave:k,data:String(x.data).slice(0,10),loja:String(x.mercado||"").replace(/\s*\(.*\)$/,""),soma:0,itens:0,id:0};ks.push(k)}
      g[k].soma+=isNaN(v)?0:v;g[k].itens++;if(id>g[k].id)g[k].id=id});
    return ks.map(function(k){var o=g[k];return {chave:o.chave,data:o.data,loja:o.loja,total:Math.round(o.soma*100)/100,itens:o.itens,id:o.id}})
      .sort(function(a,b){return b.data.localeCompare(a.data)||b.id-a.id}).slice(0,n||5)}
  /* Hoje, Lote 2: a linha do último treino do relógio (tipo, dia, distância, duração) e o link para a página do treino (onde mora o mapa). Sem início válido, nada. */
  function hojeTreinoLinha(a){if(!a||!/^\d{4}-\d{2}-\d{2}/.test(String(a.inicio||"")))return null;var d=a.dados||{},ds=String(a.inicio).slice(0,10).split("-"),p=[ds[2]+"/"+ds[1]],t=String(a.tipo||"treino").replace(/_/g," ");
    if(d.distancia>0)p.push(/swimming/.test(a.tipo)?Math.round(d.distancia)+" m":String(Math.round(d.distancia/10)/100).replace(".",",")+" km");
    if(d.duracao>0){var h=Math.floor(d.duracao/3600),m=Math.round((d.duracao%3600)/60);p.push(h?h+"h"+(m<10?"0":"")+m:Math.round(d.duracao/60)+" min")}
    return {id:a.id==null?"":String(a.id),titulo:t.charAt(0).toUpperCase()+t.slice(1),sub:p.join(" · "),href:a.id==null?"#saude":"#saude/treino/"+a.id}}
  /* Hoje, Lote 4: a análise automática 2 vezes por dia (autorizada pelo dono em 22/11/2026: até 2 chamadas pagas por dia, a partir das 6h e a partir das 14h, com o app aberto,
     interruptor desligado por padrão). Horário de Brasília (-03:00, sem horário de verão). Tudo aqui é conta pura: quem chama, grava a marca e conta no servidor é js/hoje.js. */
  function hojeIaJanela(agoraMs){var d=new Date(agoraMs-3*3600e3),h=d.getUTCHours();return {dia:d.toISOString().slice(0,10),janela:h<6?null:h<14?"manha":"tarde"}}
  /* A chamada só pode sair se TODAS as travas passam; a primeira que falha dá o motivo. Sem conseguir contar no servidor, não chama (na dúvida, não gasta). */
  function hojeIaAutoPode(o){o=o||{};function nao(m){return {ok:false,motivo:m}}
    if(o.ligado!==true)return nao("desligado");
    if(o.janela!=="manha"&&o.janela!=="tarde")return nao("fora_da_janela");
    if(o.marcas&&o.marcas.dia===o.dia&&o.marcas[o.janela])return nao("janela_ja_rodou");
    if(o.ocupado)return nao("em_voo");
    if(typeof o.chamadasHoje!=="number"||isNaN(o.chamadasHoje))return nao("contagem_indisponivel");
    if(o.chamadasHoje>=(o.limite||2))return nao("limite_diario");
    if(o.jaTemAnalise)return nao("ja_analisado");
    return {ok:true,motivo:""}}
  /* a marca "esta janela já rodou": do dia, sem apagar a outra janela do mesmo dia; dia novo começa limpo; marca estragada é ignorada */
  function hojeIaMarcar(m,dia,janela){var o={dia:dia};if(m&&typeof m==="object"&&m.dia===dia){if(m.manha)o.manha=true;if(m.tarde)o.tarde=true}o[janela]=true;return o}
  /* O que mudou: a prontidão do último dia com dado contra a do dia anterior; só com as duas notas. Linha só de exibição (não entra no pacote de fatos da IA). */
  function hojeMudouProntidao(dias,hoje){if(!dias||!dias.length)return null;var ult=dias[dias.length-1],a=prontidao(dias,ult.data),b=prontidao(dias,somaDiasISO(ult.data,-1));if(!a||!b)return null;
    return {atual:a.nota,anterior:b.nota,texto:"Prontidão "+a.nota+(a.rotulo?" ("+String(a.rotulo).toLowerCase()+")":"")+" contra "+b.nota+(ult.data===hoje?" ontem":" no dia anterior")}}
  /* Agenda: o que tem data no site, já escolhido e em ordem de data (antes dentro de agendaLer, em js/sistema.js). Quem lê o banco é a fonte
     da Agenda (js/fonte-agenda.js); aqui entram os dados prontos:
       hoje, dono (papel), regs (registros: só o dono lê), fam (os integrantes: {chave: {n, veic, docs}}), ico ({chave: emoji}), tipoInfo (tipo → [chave, nome]),
       aulas, avals, fin (MBA), aniversarios (com .dias e .fav), lembretes, candidaturas, ultimoBackup (o baixado pelo dono),
       backup ({lido:true, ultimo:"AAAA-MM-DD" ou nada} quando a pasta de backups do servidor foi lida; sem isso, não há aviso de backup) */
  function agendaItens(e){
    var hoje=e.hoje,ev=[],regs=e.regs||[],FAM=e.fam||{},ICO=e.ico||{},visto={};
    function add(data,t,sub,tipo,href,extra){if(data)ev.push(Object.assign({data:String(data).slice(0,10),t:t,sub:sub||"",tipo:tipo,href:href||""},extra||{}))}
    regs.forEach(function(r){var F=FAM[r.quem];if(!F)return;var k=r.quem+"|"+r.tipo,tipo=F.veic?"veiculo":F.docs?"docs":"familia",href=F.veic?"#veiculos/"+r.quem:F.docs?"#documentos":"#"+r.quem,d=r.dados||{};
      /* vale só o registro mais novo de cada tipo: um mais novo sem "próxima" (ex.: revisão feita) substitui o aviso do anterior */
      var ex={reg:r,ico:ICO[r.quem],pre:F.n};
      if(!visto[k+"p"]){visto[k+"p"]=1;if(r.proxima&&r.proxima>=maisDiasLocal(hoje,-60))add(r.proxima,r.titulo,F.n+" · "+e.tipoInfo(r.tipo)[1]+(r.proxima<hoje?" · estava previsto para "+dataBRDe(r.proxima):""),tipo,href,ex)}
      if(d.vigenciaFim&&!visto[k+"v"]){visto[k+"v"]=1;add(d.vigenciaFim,"Fim do "+r.titulo,F.n+" · renovar antes",tipo,href,ex)}
      if(d.garantiaAte&&!visto[k+"g"]&&d.garantiaAte>=hoje){visto[k+"g"]=1;add(d.garantiaAte,"Fim da garantia de "+r.titulo,F.n,tipo,href,ex)}});
    /* rede em Sorocaba: contatos de RH com os posts sem olhar há 7 dias ou mais viram um lembrete só */
    var rede=regs.filter(function(r){return r.quem==="rede"&&r.tipo==="contato"}),atras=rede.filter(function(r){var v=(r.dados||{}).visto;return !v||String(v).slice(0,10)<=maisDiasLocal(hoje,-7)});
    if(atras.length)add(hoje,"Olhar os posts de "+atras.length+(atras.length===1?" contato":" contatos")+" de RH",atras.slice(0,4).map(function(r){return r.titulo+" ("+r.valor+")"}).join(", ")+(atras.length>4?"…":""),"carreira","#rede",{ico:"🤝",pre:"Rede",prazo:"calculado"});
    /* IPVA de SP: vence em janeiro pelo final da placa (cota única com desconto ou 1ª parcela); aparece de novembro até quitar.
       Some quando houver um registro "Licenciamento e impostos" com IPVA do ano. */
    var ano=+hoje.slice(0,4)+(+hoje.slice(5,7)>=11?1:0),dIpva=ano+"-01-09";
    if(dIpva>=maisDiasLocal(hoje,-60)&&dIpva<=maisDiasLocal(hoje,75))Object.keys(FAM).forEach(function(q){var F=FAM[q];if(!F.veic||/antigo/i.test(F.n))return;
      if(regs.some(function(r){return r.quem===q&&r.tipo==="documento"&&/ipva/i.test(r.titulo||"")&&(String(r.titulo).indexOf(String(ano))>=0||r.data>=(ano-1)+"-12-01")}))return;
      add(dIpva,"IPVA "+ano,F.n+" · vence em janeiro conforme o final da placa · veja a data na Sefaz-SP","veiculo","https://portal.fazenda.sp.gov.br/servicos/ipva",{ext:true,ico:ICO[q],pre:F.n})});
    if(e.dono){
      (e.aulas||[]).forEach(function(a){if(a.data>=hoje)add(a.data,a.t,"aula às "+a.hora+(a.prof?" · "+a.prof:""),"mba","#mba",{pre:"Aula"})});
      (e.avals||[]).forEach(function(a){if(!a.feita)add(a.ate,a.t+(a.disc?" ("+a.disc+")":""),"responder a avaliação do MBA","mba",a.link||"#mba",{ext:!!a.link,pre:"Responder"})});
      if(e.fin)e.fin.ps.forEach(function(q){if(!q.paga)add(q.venc,q.n,"boleto do MBA · "+reaisDe(q.v),"mba","#mba",{pre:"Boleto"})});
      (e.aniversarios||[]).forEach(function(x){if(x.dias<=7||(x.fav&&x.dias<=30))add(maisDiasLocal(hoje,x.dias),x.nome,"aniversário"+(x.fav?" · marcado":""), "niver","#aniversarios",{pre:"Aniversário de"})});
      (e.lembretes||[]).forEach(function(l){if(!l.feito)add(l.data,l.t,"lembrete","lembrete","",{lembrete:l})});
      /* carreira: 5 dias depois de se candidatar sem resposta, hora do follow-up. É um prazo CALCULADO (priFollowup): vale até 10 dias depois de vencer;
         depois vira "sem retorno" (só apresentação: o resultado real da candidatura não é tocado). Resultado preenchido ou follow-up feito: nada. */
      (e.candidaturas||[]).forEach(function(c){var f=priFollowup(c,hoje);if(f.estado==="nenhum")return;
        var ex={pre:"Follow-up",prazo:"calculado",acao:"followup",cid:c.id,id:"cand:"+c.id},t=c.t+(c.e?" · "+c.e:"");
        if(f.estado==="sem_retorno")add(f.data,t,"sem retorno · candidatura de "+dataBRDe(f.desde),"carreira","#carreira/editar/"+c.id,Object.assign(ex,{pre:"Sem retorno",prazo:"informativo",semRetorno:true}));
        else add(f.data,t,"candidatura de "+dataBRDe(f.desde),"carreira","#carreira/editar/"+c.id,ex)});
      if(!e.ultimoBackup||e.ultimoBackup<maisDiasLocal(hoje,-30))add(hoje,"Baixar um backup do site",e.ultimoBackup?"o último foi em "+dataBRDe(e.ultimoBackup):"nunca foi feito","sistema","#sistema",{prazo:"calculado"});
      /* o backup automático de domingo (no cofre privado do servidor): se o mais novo tiver mais de 9 dias, alguma coisa parou */
      if(e.backup&&e.backup.lido){var ult=e.backup.ultimo;if(!ult||ult<maisDiasLocal(hoje,-9))add(hoje,"O backup automático de domingo não rodou",ult?"o último é de "+dataBRDe(ult):"ainda não há nenhum no servidor","sistema","#sistema",{prazo:"calculado"})}}
    return ev.sort(function(a,b){return a.data.localeCompare(b.data)})}
  /* ===== DS-4.1 · Agenda (RAC Modern Workspace): como a página Agenda agrupa, conta e resume os eventos de agendaItens. Só apresentação: os prazos e a
     prioridade continuam os de agendaItens e priItem. Os critérios dos grupos são os de sempre (antes dentro de renderAgenda, js/sistema.js). Funções puras. ===== */
  var AGD_GRUPOS=[["atrasados","Atrasados"],["hoje","Hoje"],["sete","Próximos 7 dias"],["trinta","Até 30 dias"],["depois","Depois"],["semretorno","Candidaturas sem retorno"]];
  /* os 6 grupos, na ordem da página; cada um com os eventos que cabem nele (pode vir vazio: quem desenha pula). "sem retorno" não é atraso: fica no próprio grupo */
  function agdGrupos(ev,hoje){var l=ev||[],a7=maisDiasLocal(hoje,7),a30=maisDiasLocal(hoje,30),a120=maisDiasLocal(hoje,120);
    var P={atrasados:function(e){return e.data<hoje&&!e.semRetorno},hoje:function(e){return e.data===hoje},sete:function(e){return e.data>hoje&&e.data<=a7},
      trinta:function(e){return e.data>a7&&e.data<=a30},depois:function(e){return e.data>a30&&e.data<=a120},semretorno:function(e){return !!e.semRetorno}};
    return AGD_GRUPOS.map(function(g){return {k:g[0],rotulo:g[1],itens:l.filter(P[g[0]])}})}
  /* quando, em palavras: "há 3 dias", "hoje", "amanhã" ou o dia da semana com a data */
  function agdQuando(data,hoje){var dd=hojeDias(hoje,String(data).slice(0,10));
    return dd<0?"há "+(-dd)+(dd===-1?" dia":" dias"):dd===0?"hoje":dd===1?"amanhã":new Date(String(data).slice(0,10)+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"2-digit"})}
  /* contagens dos indicadores: só do que aparece na página (os mesmos grupos); maisAntigo = há quantos dias vence o mais antigo atrasado */
  function agdVisiveis(g){var v=[];g.forEach(function(x){x.itens.forEach(function(e){if(v.indexOf(e)<0)v.push(e)})});return v}
  function agdResumo(ev,hoje){var g=agdGrupos(ev,hoje),r={total:agdVisiveis(g).length,ateSete:maisDiasLocal(hoje,7),maisAntigo:null,primeiroHoje:""};
    g.forEach(function(x){r[x.k]=x.itens.length});
    var atr=g[0].itens;if(atr.length)r.maisAntigo=Math.max.apply(null,atr.map(function(e){return hojeDias(e.data,hoje)}));
    if(g[1].itens.length)r.primeiroHoje=g[1].itens[0].t;return r}
  /* uma frase só, só com contagens que existem */
  function agdFrase(r){if(!r.total)return "Nada com data por enquanto.";var p=[];
    if(r.atrasados)p.push(r.atrasados+(r.atrasados===1?" item atrasado":" itens atrasados"));if(r.hoje)p.push(r.hoje+" para hoje");if(r.sete)p.push(r.sete+(r.sete===1?" no próximo":" nos próximos")+" 7 dias");
    return p.length?p.join(" · ")+".":"Nada atrasado, para hoje ou nos próximos 7 dias."}
  /* quantos eventos em cada um dos n dias a partir de hoje (o que está "sem retorno" não conta: não pede nada) */
  function agdSerie(ev,hoje,n){var s=[];for(var i=0;i<n;i++){var d=maisDiasLocal(hoje,i);s.push({data:d,n:(ev||[]).filter(function(e){return e.data===d&&!e.semRetorno}).length})}return s}
  /* as áreas (tipo do evento) do que aparece na página, da mais cheia para a mais vazia */
  function agdAreas(ev,hoje){var c={};agdVisiveis(agdGrupos(ev,hoje)).forEach(function(e){var k=e.tipo||"outros";c[k]=(c[k]||0)+1});
    return Object.keys(c).map(function(k){return {k:k,n:c[k]}}).sort(function(a,b){return b.n-a.n||a.k.localeCompare(b.k)})}
  function agdFiltrar(ev,k){return !k||k==="todos"?(ev||[]):(ev||[]).filter(function(e){return (e.tipo||"outros")===k})}
  /* o peso visual da linha: atrasado é sempre "alta" (como o alerta de antes); o resto segue a régua de prioridades (urgente = alta, importante = média); sem retorno e informativo = nenhum */
  function agdTom(e,hoje){if(!e||e.semRetorno)return null;if(e.data<hoje)return "alta";var it=priItem(e,hoje);return !it?null:it.nivel==="urgente"?"alta":it.nivel==="importante"?"media":null}
  /* ===== Fase 2 · A4: contrato de fontes (docs/planejamento/02-auditoria-arquitetural.md, seção 8). Uma fonte devolve
     {v, vazio, quando, ultimo, origem, nota?, parcial?, falhas?}; o contrato completo é sempre o mesmo formato (o que o RAC Hoje já usava):
     {ok:true, v, vazio, quando, ultimo, origem, nota, parcial, falhas}. A falha vira {ok:false, erro} em js/fontes.js. ===== */
  function fonteContrato(r){r=r||{};return {ok:true,v:r.v,vazio:!!r.vazio,quando:r.quando||null,ultimo:r.ultimo||null,origem:r.origem||null,nota:r.nota||null,parcial:!!r.parcial,falhas:r.falhas||null}}
  /* os integrantes da família na configuração do site (FAM e os ícones da Agenda): tipo bebe, veiculo, docs, pet (o ícone do cachorro) ou outro */
  function famIntegrantes(fam,ico){fam=fam||{};ico=ico||{};return Object.keys(fam).map(function(k){var F=fam[k],i=ico[k]||null;
    return {k:k,n:F.n,tipo:F.bebe?"bebe":F.veic?"veiculo":F.docs?"docs":i==="🐶"?"pet":"outro",antigo:!!F.veic&&/antigo/i.test(F.n),ico:i}})}
  /* "quem é quem" para a IA do RAC Hoje (sem isso ela chamou a Olivia de pet): a mesma frase de antes, a partir dos integrantes */
  function hojeQuemDe(integrantes){return (integrantes||[]).map(function(x){if(x.tipo==="bebe")return x.n+" é a filha bebê do dono";if(x.tipo==="veiculo")return x.antigo?null:x.n+" é um veículo do dono";
    if(x.tipo==="docs")return null;return x.tipo==="pet"?x.n+" é o cachorro da família":null}).filter(Boolean).join("; ")}
  /* ===== RAC Inbox · I1 (docs/inbox.md; Documento 10): regras puras da fundação. Nada de tela, banco nem rede aqui. =====
     Honestidade de capacidade: cada recurso de cada provedor é "comprovado" (houve prova real), "nao_comprovado" (previsto, sem prova), "rac" (o RAC faz no lugar
     do provedor), "indisponivel" (o provedor não oferece) ou "planejado" (fase futura). Nada é prometido além da evidência. */
  var INB_RECURSOS=[["pastas","Listar pastas"],["estado","Estado da pasta (sincronização)"],["ler","Ler mensagens"],["organizar","Mover, arquivar, excluir e marcar"],["enviar","Enviar e responder"],["filtros","Filtros e regras"]];
  var INB_RECURSO_ROTULOS={comprovado:"Comprovado",nao_comprovado:"Não comprovado",rac:"Feito pelo RAC",indisponivel:"Indisponível no provedor",planejado:"Planejado"};
  var INB_PROVEDORES=[
    {id:"icloud",nome:"iCloud Mail",ativo:true,leitura:true,escrita:true,via:"IMAP/SMTP (Worker isolado)",rec:{pastas:"comprovado",estado:"comprovado",ler:"comprovado",organizar:"nao_comprovado",enviar:"nao_comprovado",filtros:"rac"},
      nota:"A Apple não tem API de filtros: as regras serão do RAC. O servidor respondeu READ-WRITE ao EXAMINE; a garantia de somente leitura é do Worker (lista fechada de comandos), não do servidor."},
    {id:"gmail",nome:"Gmail",ativo:true,oauth:true,leitura:true,escrita:true,via:"Gmail API (OAuth 2.0)",rec:{pastas:"nao_comprovado",estado:"nao_comprovado",ler:"nao_comprovado",organizar:"nao_comprovado",enviar:"nao_comprovado",filtros:"planejado"},nota:"Conexão OAuth validada pelo dono; leitura e sincronização implementadas (ainda sem prova com mensagens reais); envio e gerenciamento implementados (lote 4), ainda sem prova com mensagens reais."},
    {id:"outlook",nome:"Outlook / Microsoft",ativo:true,oauth:true,leitura:true,escrita:true,via:"Microsoft Graph (OAuth 2.0)",rec:{pastas:"nao_comprovado",estado:"nao_comprovado",ler:"nao_comprovado",organizar:"nao_comprovado",enviar:"nao_comprovado",filtros:"planejado"},nota:"Conexão OAuth validada pelo dono; leitura e sincronização implementadas (ainda sem prova com mensagens reais); envio e gerenciamento implementados (lote 4), ainda sem prova com mensagens reais."}];
  /* o provedor da conta pode ESCREVER na caixa (enviar, responder, mover, marcar)? Só o iCloud, por enquanto */
  function inbProvedorEscreve(id){var p=inbProvedor(id);return !!(p&&p.escrita)}
  function inbProvedor(id){for(var i=0;i<INB_PROVEDORES.length;i++)if(INB_PROVEDORES[i].id===id)return INB_PROVEDORES[i];return null}
  /* estado da conta: nunca só a cor (o kit mostra ícone + palavra). "nova" = cadastrada e nunca conectada; sem conexão nunca parece "vazia" */
  var INB_ESTADOS=[{id:"nova",rotulo:"Nova",tipo:"neutro"},{id:"conectada",rotulo:"Conectada",tipo:"ok"},{id:"sincronizando",rotulo:"Sincronizando",tipo:"info"},{id:"atrasada",rotulo:"Atrasada",tipo:"aviso"},
    {id:"erro_autenticacao",rotulo:"Erro de autenticação",tipo:"erro"},{id:"desconectada",rotulo:"Desconectada",tipo:"aviso"}];
  function inbEstado(id){for(var i=0;i<INB_ESTADOS.length;i++)if(INB_ESTADOS[i].id===id)return INB_ESTADOS[i];return INB_ESTADOS[5]}
  var INB_USOS=[["entrada","Caixa de entrada"],["rascunhos","Rascunhos"],["enviados","Enviados"],["arquivo","Arquivo"],["spam","Spam"],["lixo","Lixeira"],["outra","Outras pastas"]];
  function inbUsoRotulo(u){for(var i=0;i<INB_USOS.length;i++)if(INB_USOS[i][0]===u)return INB_USOS[i][1];return "Outras pastas"}
  var INB_TIPOS_SINC=["primeira_leitura","sem_mudanca","novas_mensagens","uidvalidity_mudou","uidnext_regrediu"];
  var INB_RE_PARTE=/^[1-9]\d{0,2}(\.[1-9]\d{0,2}){0,5}$/;
  var INB_UID_MAX=4294967295,INB_RE_EMAIL=/^[^@\s]+@[^@\s]+\.[^@\s]+$/,INB_RE_CODIGO=/^[a-z][a-z0-9_]{1,40}$/,INB_RE_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  /* o par usuário/senha (e qualquer parente) é credencial: o navegador nunca o envia nem o grava no Inbox */
  var INB_CREDENCIAL=/senha|password|passwd|token|secret|segredo|api_?key|apikey|credencial|authorization|usuario|username|bearer|cookie/i;
  function inbCredenciais(o){return o&&typeof o==="object"?Object.keys(o).filter(function(k){return INB_CREDENCIAL.test(k)}):[]}
  /* formulário "adicionar conta": só provedor, apelido e endereço; só provedor ativo; credencial no formulário é recusada */
  function inbContaValida(f){f=f||{};var e={},prov=inbProvedor(f.provedor),ap=String(f.apelido==null?"":f.apelido).trim(),en=String(f.endereco==null?"":f.endereco).trim();
    if(inbCredenciais(f).length)e.credencial="O Inbox não pede nem guarda senha, token ou usuário de acesso.";
    if(!prov)e.provedor="Escolha um provedor.";else if(!prov.ativo)e.provedor=prov.nome+" entra em uma fase futura.";
    if(!ap||ap.length>60)e.apelido="Dê um nome de 1 a 60 caracteres.";
    if(!INB_RE_EMAIL.test(en)||en.length>254)e.endereco="Informe um endereço de e-mail válido.";
    return Object.keys(e).length?{ok:false,erros:e}:{ok:true,linha:{provedor:prov.id,apelido:ap,endereco:en,estado:"nova"}}}
  /* o contrato com o serviço de e-mail (Edge Function "rac-inbox" → Worker; docs/inbox.md). Só operações de LEITURA, só IDs: nada de credencial, nada de escrita.
     escreve:false em todas, sempre; o verbo de escrita (enviar, mover, excluir…) é recusado com um código próprio, para nunca passar por engano. */
  var INB_MODOS_ENVIO=["novo","responder","responder_todos","encaminhar"],INB_LIM_ENVIO={destinatarios:20,assunto:300,texto:100000};
  var INB_OPERACOES={testar_canal:{escreve:false,campos:[],requer:[]},testar_conta:{escreve:false,campos:["conta_id"],requer:["conta_id"]},listar_pastas:{escreve:false,campos:["conta_id"],requer:["conta_id"]},
    estado_pasta:{escreve:false,campos:["conta_id","pasta_id"],requer:["conta_id","pasta_id"]},
    /* I2: sincronizar uma pasta (grava só o cache de cabeçalhos, no servidor), ler UMA mensagem e baixar UM anexo (sob demanda, nada guardado). Só IDs, UID e o caminho da parte: o NOME da pasta nunca vai do navegador. */
    sincronizar_pasta:{escreve:false,campos:["conta_id","pasta_id"],requer:["conta_id","pasta_id"]},
    ler_mensagem:{escreve:false,campos:["conta_id","pasta_id","uid"],requer:["conta_id","pasta_id","uid"]},
    baixar_anexo:{escreve:false,campos:["conta_id","pasta_id","uid","parte"],requer:["conta_id","pasta_id","uid","parte"]},
    /* custódia da credencial (Vault; docs/inbox.md): a ÚNICA operação que aceita credencial é guardar (que também substitui); remover e estado levam só o ID da conta */
    credencial_guardar:{escreve:false,credencial:true,campos:["conta_id","usuario","senha_app"],requer:["conta_id","usuario","senha_app"]},
    credencial_remover:{escreve:false,campos:["conta_id"],requer:["conta_id"]},
    /* I4: conexão OAuth do Gmail/Outlook: iniciar devolve só a URL do provedor; concluir entrega o código que o provedor devolveu ao site (o token nunca passa pelo navegador) */
    oauth_iniciar:{escreve:false,campos:["conta_id"],requer:["conta_id"]},oauth_concluir:{escreve:false,campos:["state","code"],requer:["state","code"]},credencial_estado:{escreve:false,campos:["conta_id"],requer:["conta_id"]},
    /* I3 (envio): "smtp_prova" só diagnostica (com enviar_teste manda UMA mensagem curta ao próprio endereço); "enviar_mensagem" é a ÚNICA operação que escreve no mundo e só sai de um clique explícito em Enviar */
    smtp_prova:{escreve:false,campos:["conta_id","enviar_teste"],requer:["conta_id"]},
    enviar_mensagem:{escreve:true,campos:["conta_id","envio_id","modo","pasta_id","uid","para","cc","cco","assunto","texto"],requer:["conta_id","envio_id","modo","para","assunto","texto"]},
    /* I3.2 (gerenciamento): a ÚNICA porta para alterar a caixa (lida/não lida, arquivar, excluir=Lixeira, spam, mover). Uma mensagem por vez, por pasta+UID; o destino especial é decidido pelo servidor e só "mover" leva a pasta de destino (UUID). Nada de nome de pasta nem comando. */
    organizar_mensagem:{escreve:true,campos:["conta_id","pasta_id","uid","acao","destino_pasta_id"],requer:["conta_id","pasta_id","uid","acao"]}};
  var INB_ACOES=[["marcar_lida","Marcar como lida"],["marcar_nao_lida","Marcar como não lida"],["arquivar","Arquivar"],["excluir","Excluir"],["spam","Mover para spam"],["nao_spam","Não é spam"],["mover","Mover para pasta"]];
  function inbAcaoOk(a){for(var i=0;i<INB_ACOES.length;i++)if(INB_ACOES[i][0]===a)return true;return false}
  /* SÓ a senha específica de app da Apple (xxxx-xxxx-xxxx-xxxx, minúsculas): a senha principal da conta nunca é aceita nem pedida */
  var INB_RE_SENHA_APP=/^[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}$/;
  var INB_ESCRITA=["enviar","responder","responder_a_todos","encaminhar","mover","arquivar","excluir","apagar","marcar","marcar_lida","anexar","criar_pasta","renomear_pasta","criar_filtro","spam","expunge","store","append"];
  function inbPedido(op,entrada){
    if(typeof op!=="string"||!op)return {ok:false,erro:"operacao_invalida"};
    if(INB_ESCRITA.indexOf(op)>=0)return {ok:false,erro:"escrita_fora_do_escopo"};
    if(!Object.prototype.hasOwnProperty.call(INB_OPERACOES,op))return {ok:false,erro:"operacao_invalida"};
    if(entrada===null||typeof entrada!=="object"||Array.isArray(entrada))return {ok:false,erro:"entrada_invalida"};
    var d=INB_OPERACOES[op],ks=Object.keys(entrada),i,pedido={operacao:op};
    if(!d.credencial&&inbCredenciais(entrada).length)return {ok:false,erro:"credencial_proibida"};
    for(i=0;i<ks.length;i++)if(d.campos.indexOf(ks[i])<0)return {ok:false,erro:"campos_inesperados"};
    for(i=0;i<d.campos.length;i++){var k=d.campos[i],v=entrada[k];
      if(v===undefined){if(d.requer.indexOf(k)>=0)return {ok:false,erro:"campo_ausente"};continue}
      if(k==="usuario"){if(typeof v!=="string"||v.length>254||!INB_RE_EMAIL.test(v))return {ok:false,erro:"usuario_invalido"}}
      else if(k==="senha_app"){if(typeof v!=="string"||!INB_RE_SENHA_APP.test(v))return {ok:false,erro:"senha_formato_invalido"}}
      else if(k==="state"){if(typeof v!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(v))return {ok:false,erro:"campo_ausente"}}
      else if(k==="code"){if(typeof v!=="string"||!/^[\x21-\x7e]{10,4096}$/.test(v))return {ok:false,erro:"campo_ausente"}}
      else if(k==="uid"){if(!inbUidOk(v))return {ok:false,erro:"id_invalido"}}
      else if(k==="parte"){if(typeof v!=="string"||!INB_RE_PARTE.test(v))return {ok:false,erro:"id_invalido"}}
      else if(k==="acao"){if(typeof v!=="string"||!inbAcaoOk(v))return {ok:false,erro:"acao_invalida"}}
      else if(k==="enviar_teste"){if(typeof v!=="boolean")return {ok:false,erro:"campo_ausente"}}
      else if(k==="modo"){if(INB_MODOS_ENVIO.indexOf(v)<0)return {ok:false,erro:"modo_invalido"}}
      else if(k==="para"||k==="cc"||k==="cco"){if(!Array.isArray(v)||v.length>INB_LIM_ENVIO.destinatarios||(k==="para"&&!v.length))return {ok:false,erro:"destinatario_invalido"};
        for(var j=0;j<v.length;j++)if(typeof v[j]!=="string"||v[j].length>254||!INB_RE_EMAIL.test(v[j]))return {ok:false,erro:"destinatario_invalido"}}
      else if(k==="assunto"){if(typeof v!=="string"||v.length>INB_LIM_ENVIO.assunto||/[\u0000-\u001f\u007f]/.test(v))return {ok:false,erro:"assunto_invalido"}}
      else if(k==="texto"){if(typeof v!=="string"||v.length>INB_LIM_ENVIO.texto)return {ok:false,erro:"texto_grande_demais"}}
      else if(typeof v!=="string"||!INB_RE_UUID.test(v))return {ok:false,erro:"id_invalido"};
      pedido[k]=v}
    if(op==="organizar_mensagem"&&((pedido.acao==="mover")!==(pedido.destino_pasta_id!==undefined)))return {ok:false,erro:pedido.acao==="mover"?"destino_invalido":"campos_inesperados"};
    if(op==="enviar_mensagem"){var resp=pedido.modo!=="novo";if(resp!==(pedido.pasta_id!==undefined&&pedido.uid!==undefined)||(!resp&&(pedido.pasta_id!==undefined||pedido.uid!==undefined)))return {ok:false,erro:"origem_invalida"}}
    return {ok:true,pedido:pedido}}
  /* formulário "conectar conta": o login (e-mail do ID Apple) e a senha específica de app; devolve os campos já conferidos, para enviar UMA vez e limpar o campo */
  function inbCredencialValida(f){f=f||{};var e={},u=String(f.usuario==null?"":f.usuario).trim(),s=String(f.senha==null?"":f.senha).trim();
    if(!INB_RE_EMAIL.test(u)||u.length>254)e.usuario="Informe o e-mail do seu ID Apple.";
    if(!INB_RE_SENHA_APP.test(s))e.senha_app="Use uma senha específica de app (quatro grupos de quatro letras, como abcd-efgh-ijkl-mnop). A senha principal da conta Apple não é aceita.";
    return Object.keys(e).length?{ok:false,erros:e}:{ok:true,usuario:u,senha:s}}
  var INB_CRED_ROTULOS={ausente:"Sem credencial",ativa:"Credencial guardada",invalida:"Credencial recusada pelo provedor"};
  /* cursor do IMAP (UIDVALIDITY/UIDNEXT): as mesmas regras do Worker da P6 (comprovadas em duas rodadas reais em 14/11/2026) */
  function inbUidOk(v){return typeof v==="number"&&isFinite(v)&&Math.floor(v)===v&&v>=1&&v<=INB_UID_MAX}
  function inbCursor(atual,anterior){
    if(!atual||!inbUidOk(atual.uidvalidity)||!inbUidOk(atual.uidnext))return {ok:false,erro:"cursor_invalido"};
    if(!anterior)return {ok:true,tipo:"primeira_leitura",uidvalidity_mudou:false,uids_novos_no_maximo:0};
    if(!inbUidOk(anterior.uidvalidity)||!inbUidOk(anterior.uidnext))return {ok:false,erro:"cursor_invalido"};
    if(atual.uidvalidity!==anterior.uidvalidity)return {ok:true,tipo:"uidvalidity_mudou",uidvalidity_mudou:true,uids_novos_no_maximo:0};
    if(atual.uidnext===anterior.uidnext)return {ok:true,tipo:"sem_mudanca",uidvalidity_mudou:false,uids_novos_no_maximo:0};
    if(atual.uidnext>anterior.uidnext)return {ok:true,tipo:"novas_mensagens",uidvalidity_mudou:false,uids_novos_no_maximo:atual.uidnext-anterior.uidnext};
    return {ok:true,tipo:"uidnext_regrediu",uidvalidity_mudou:false,uids_novos_no_maximo:0}}
  /* resposta do serviço para estado_pasta → a linha de inbox_sincronizacao (esquema fechado: copia só o que conhece; código de erro só de lista fechada). O formato é o da P6 real. */
  function inbRespostaEstado(r){
    if(!r||typeof r!=="object")return {ok:false,erro:"resposta_invalida"};
    if(r.ok!==true)return {ok:false,erro:typeof r.erro==="string"&&INB_RE_CODIGO.test(r.erro)?r.erro:"resposta_invalida"};
    var ex=r.exame,sy=r.sincronizacao;
    if(!ex||!inbUidOk(ex.uidvalidity)||!inbUidOk(ex.uidnext))return {ok:false,erro:"resposta_invalida"};
    if(sy!==undefined&&(!sy||INB_TIPOS_SINC.indexOf(sy.tipo)<0))return {ok:false,erro:"resposta_invalida"};   /* a decisão de sincronização é da função (com o cursor guardado); o campo só vem se o serviço mandar */
    var tot=r.mensagens_na_pasta,dur=r.duracao_ms;
    return {ok:true,linha:{uidvalidity:ex.uidvalidity,uidnext:ex.uidnext,tipo_ultima:sy?sy.tipo:null,total:typeof tot==="number"&&tot>=0&&Math.floor(tot)===tot?tot:null,duracao_ms:typeof dur==="number"&&dur>=0&&Math.floor(dur)===dur?dur:null}}}
  /* árvore da navegação: contas por apelido, pastas na ordem de uso (entrada primeiro) e por nome */
  function inbArvore(contas,pastas){
    var ordem={};INB_USOS.forEach(function(u,i){ordem[u[0]]=i});
    /* a ordem do protótipo é a da conexão (criado_em; sem a data, a ordem recebida), não a alfabética */
    return (contas||[]).map(function(c,i){return {c:c,i:i}}).sort(function(a,b){var x=a.c.criado_em&&b.c.criado_em?String(a.c.criado_em).localeCompare(String(b.c.criado_em)):0;return x||a.i-b.i}).map(function(w){return w.c}).map(function(c){
      var ps=(pastas||[]).filter(function(p){return p.conta_id===c.id}).sort(function(a,b){var x=(ordem[a.uso]==null?9:ordem[a.uso])-(ordem[b.uso]==null?9:ordem[b.uso]);return x||String(a.nome_externo).localeCompare(String(b.nome_externo),"pt-BR")});
      return {conta:c,estado:inbEstado(c.estado),pastas:ps}})}
  /* caixa unificada: soma só o que se sabe. "parcial" avisa quando alguma conta não está conectada ou não tem contagem: sem conexão nunca parece zero */
  function inbUnificada(contas,pastas){
    var n=(contas||[]).length,soma=0,parcial=false,algum=false;
    (contas||[]).forEach(function(c){
      var ok=c.estado==="conectada"||c.estado==="sincronizando",ent=(pastas||[]).filter(function(p){return p.conta_id===c.id&&p.uso==="entrada"})[0];
      if(!ok||!ent||ent.nao_lidas==null){parcial=true;return}
      algum=true;soma+=ent.nao_lidas});
    return {contas:n,naoLidas:algum?soma:null,parcial:n>0&&parcial}}
  /* o estado da tela do Inbox: carregando, estrutura_pendente (migration 051 não aplicada), erro, vazio (sem contas), desconectado (nenhuma conta conectada) ou ok */
  function inbTelaEstado(x){x=x||{};
    if(x.carregando)return {tipo:"carregando"};
    if(x.erro){var m=String((x.erro&&(x.erro.message||x.erro.code))||x.erro);return {tipo:segTabelaAusente(m)||segTabelaAusente(String(x.erro.code||""))?"estrutura_pendente":"erro"}}
    var c=x.contas||[];if(!c.length)return {tipo:"vazio"};
    return {tipo:c.some(function(a){return a.estado==="conectada"||a.estado==="sincronizando"||a.estado==="atrasada"})?"ok":"desconectado"}}
  /* ---- apresentação da lista de mensagens (I1; a lista real chega na I2). Linha de mensagem = {id, conta_id, remetente, endereco, assunto, previa, recebida, lida, anexo}. ---- */
  var INB_CATEGORIAS=[["pessoal","Pessoal"],["trabalho","Trabalho"],["financeiro","Financeiro"],["compras","Compras"],["entregas","Entregas"],["newsletters","Newsletters"],["notificacoes","Notificações"],["promocoes","Promoções"]];
  var INB_FILTROS=[["todas","Todas"],["nao_lidas","Não lidas"],["anexo","Com anexo"]];
  function inbDois(n){return (n<10?"0":"")+n}
  function inbIniciais(nome){var p=String(nome==null?"":nome).replace(/[<>"@]/g," ").trim().split(/\s+/).filter(Boolean);if(!p.length)return "?";return (p[0].charAt(0)+(p.length>1?p[p.length-1].charAt(0):"")).toUpperCase()}
  /* horário como no Mail: hora se for hoje, "Ontem", dia da semana nos últimos 7 dias, senão dd/mm */
  function inbHora(quando,agora){var d=new Date(quando),n=agora?new Date(agora):new Date();if(isNaN(d.getTime()))return "";
    function dia(x){return new Date(x.getFullYear(),x.getMonth(),x.getDate()).getTime()}
    var dif=Math.round((dia(n)-dia(d))/86400000);
    if(dif===0)return inbDois(d.getHours())+":"+inbDois(d.getMinutes());if(dif===1)return "Ontem";
    if(dif>1&&dif<7)return ["dom","seg","ter","qua","qui","sex","sáb"][d.getDay()];return inbDois(d.getDate())+"/"+inbDois(d.getMonth()+1)}
  function inbOrdenar(msgs){return (msgs||[]).slice().sort(function(a,b){return new Date(b.recebida).getTime()-new Date(a.recebida).getTime()})}
  function inbFiltrar(msgs,filtro){return (msgs||[]).filter(function(m){return filtro==="nao_lidas"?!m.lida:filtro==="anexo"?!!m.anexo:true})}
  /* grupos de data como no Mail: Hoje, Ontem, Esta semana (até 6 dias) e Anteriores; e a data por extenso para o cabeçalho da leitura */
  var INB_MESES=["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  function inbGrupoData(quando,agora){var d=new Date(quando),n=agora?new Date(agora):new Date();if(isNaN(d.getTime()))return "Anteriores";
    function dia(x){return new Date(x.getFullYear(),x.getMonth(),x.getDate()).getTime()}var dif=Math.round((dia(n)-dia(d))/86400000);
    return dif<=0?"Hoje":dif===1?"Ontem":dif<7?"Esta semana":"Anteriores"}
  function inbAgrupar(msgs,agora){var out=[],ult=null;inbOrdenar(msgs).forEach(function(m){var g=inbGrupoData(m.recebida,agora);if(!ult||ult.rotulo!==g){ult={rotulo:g,itens:[]};out.push(ult)}ult.itens.push(m)});return out}
  function inbDataCompleta(quando){var d=new Date(quando);if(isNaN(d.getTime()))return "";return d.getDate()+" de "+INB_MESES[d.getMonth()]+" de "+d.getFullYear()+", "+inbDois(d.getHours())+":"+inbDois(d.getMinutes())}
  function inbNaoLidas(msgs){return (msgs||[]).filter(function(m){return !m.lida}).length}
  /* o número do selo do Inbox na barra de baixo: soma das não lidas das pastas de ENTRADA de todas as contas (número ausente ou inválido não conta) */
  function inbContadorBarra(pastas){var t=0;(pastas||[]).forEach(function(p){if(p&&p.uso==="entrada"&&typeof p.nao_lidas==="number"&&p.nao_lidas>0)t+=p.nao_lidas});return t}
  /* código de falha do serviço → frase para o dono (nunca o texto do servidor) */
  var INB_ERROS={oauth_nao_configurado:"A conexão com este provedor ainda não foi configurada no servidor (credenciais do Google ou da Microsoft).",oauth_estado_invalido:"A autorização expirou ou já foi usada. Toque em Conectar de novo.",oauth_recusado:"O provedor recusou a autorização. Toque em Conectar e aceite as permissões.",oauth_conta_divergente:"A conta autorizada não é a cadastrada nesta conta do Inbox. Entre com o endereço certo e tente de novo.",oauth_indisponivel:"O provedor não respondeu agora. Tente de novo em instantes.",provedor_invalido:"Esta ação não vale para este provedor.",provedor_sem_leitura:"A leitura de mensagens deste provedor ainda não foi liberada no Inbox.",provedor_sem_operacao:"Enviar, responder e organizar mensagens ainda não estão disponíveis para este provedor.",servico_nao_publicado:"O serviço de e-mail não está publicado.",sem_login:"Entre de novo para usar o Inbox.",rede:"Sem conexão com o serviço.",servico_indisponivel:"O serviço de e-mail está indisponível agora.",
    limite:"Muitos pedidos seguidos; tente daqui a pouco.",resposta_invalida:"O serviço respondeu algo que o RAC não reconhece.",credencial_proibida:"O Inbox não aceita credencial no navegador.",escrita_fora_do_escopo:"Esta ação não existe no Inbox; use os botões da mensagem.",
    operacao_invalida:"Operação desconhecida.",entrada_invalida:"Pedido inválido.",campos_inesperados:"Pedido inválido.",campo_ausente:"Pedido incompleto.",id_invalido:"Pedido inválido.",
    usuario_invalido:"O e-mail do ID Apple não parece válido.",senha_formato_invalido:"Use uma senha específica de app (abcd-efgh-ijkl-mnop); a senha principal não é aceita.",mfa_requerido:"Confirme o código da 2ª etapa e tente de novo.",
    sem_permissao:"Sem permissão para esta conta.",conta_inexistente:"Conta não encontrada.",credencial_ausente:"Esta conta ainda não tem credencial guardada.",credencial_invalida:"O provedor recusou a credencial. Gere outra senha de app e substitua.",
    credencial_corrompida:"A credencial guardada está ilegível; substitua-a.",cofre_indisponivel:"O cofre de credenciais está indisponível; nada foi guardado.",worker_nao_configurado:"A conexão com o provedor ainda não está configurada no servidor.",pasta_inexistente:"Esta pasta não existe mais no provedor. Atualize as pastas.",mensagem_inexistente:"Esta mensagem não está mais na caixa.",parte_inexistente:"Este anexo não foi encontrado na mensagem.",anexo_grande_demais:"Este anexo é grande demais para baixar aqui (limite de 3 MB).",uidvalidity_mudou:"A caixa foi reorganizada no provedor. Sincronize de novo.",sincronizacao_em_andamento:"Já há uma sincronização desta conta em andamento. Aguarde terminar.",canal_recusado:"O servidor de e-mail recusou o pedido (falha de configuração do canal seguro). Avise o desenvolvedor.",banco_indisponivel:"O banco do Inbox está indisponível agora; nada foi alterado.",muito_grande:"Pedido grande demais.",corpo_invalido:"Pedido inválido.",metodo:"Pedido inválido.",interno:"Erro interno; nada foi guardado.",
    /* I3 (envio): falha confirmada ≠ resultado incerto */
    envio_incerto:"Não foi possível confirmar o envio: o e-mail PODE ter sido enviado. Confira a pasta Enviados antes de tentar de novo.",envio_recusado:"O servidor recusou a mensagem. Nada foi enviado.",
    destinatario_recusado:"O servidor recusou um dos destinatários. Nada foi enviado.",remetente_recusado:"O iCloud recusou o remetente desta conta. Nada foi enviado.",smtp_autenticacao_recusada:"O iCloud recusou o login de envio (SMTP). Nada foi enviado.",
    smtp_indisponivel:"O servidor de envio do iCloud está indisponível agora. Nada foi enviado.",envio_em_andamento:"Este envio já está em andamento. Aguarde alguns segundos.",registro_envio_indisponivel:"O controle de envios ainda não está disponível no servidor (migration 056 pendente). Nada foi enviado.",
    origem_invalida:"A mensagem de origem é inválida.",destinatario_invalido:"Confira os destinatários: algum endereço é inválido ou não sobrou nenhum.",destinatarios_demais:"Destinatários demais (máximo 20 por mensagem).",assunto_invalido:"O assunto é inválido ou longo demais (máximo 300 caracteres).",
    texto_grande_demais:"A mensagem é longa demais (máximo 100.000 caracteres).",mensagem_grande_demais:"A mensagem ficou grande demais para enviar.",modo_invalido:"Tipo de envio desconhecido.",
    /* I3.2 (gerenciamento): falha confirmada = nada foi alterado; incerto = confira antes de tentar de novo */
    acao_invalida:"Ação desconhecida.",destino_invalido:"Esta pasta não pode receber a mensagem. Escolha outra pasta desta conta. Nada foi alterado.",
    destino_ausente:"O iCloud não identificou a pasta especial (Arquivo, Lixeira ou Spam) desta conta. Toque em Sincronizar para atualizar as pastas. Nada foi alterado.",
    acao_indisponivel:"O iCloud desta conta não oferece mover mensagens por um caminho seguro (comando MOVE). Nada foi alterado, e o RAC não usa alternativa que apague.",
    identidade_divergente:"A mensagem que está na caixa não é mais a mesma do cache. Toque em Sincronizar e tente de novo. Nada foi alterado.",
    acao_recusada:"O iCloud recusou a ação. Nada foi alterado.",acao_parcial:"O iCloud copiou a mensagem para o destino, mas ainda não conseguiu tirar a original da pasta de origem. Toque de novo para concluir (a cópia não se repete).",acao_nao_aplicada:"A mensagem continua onde estava; nada foi alterado na pasta de origem. Você pode tentar de novo (se o iCloud já tiver copiado, a cópia não se repete).",
    acao_incerta:"Não foi possível confirmar o resultado. A mensagem PODE ter sido alterada: toque em Sincronizar para ver o estado real antes de tentar de novo.",
    acao_em_andamento:"Há outra operação em andamento nesta conta. Aguarde alguns segundos e tente de novo.",pasta_somente_leitura:"Esta pasta está só para leitura no iCloud. Nada foi alterado.",
    confirmacao_ausente:"O iCloud não confirmou a alteração. Toque em Sincronizar para ver o estado real.",uidvalidity_mudou:"A pasta foi reorganizada no iCloud. Toque em Sincronizar e tente de novo."};
  /* ---- I2: mensagens reais. A lista vem do cache de cabeçalhos (migration 053); a leitura e o anexo vêm do serviço, sob demanda, e NÃO ficam guardados. Esquema fechado: copia só o que conhece. ---- */
  function inbTexto(v,max){return typeof v==="string"&&v.length<=max?v:null}
  function inbInteiro(v){return typeof v==="number"&&isFinite(v)&&Math.floor(v)===v&&v>=0?v:null}
  function inbEnd(v){if(!v||typeof v!=="object")return null;var e=inbTexto(v.endereco,254),n=inbTexto(v.nome==null?"":v.nome,200);return e&&n!==null&&/^[^\s<>"]+@[^\s<>"]+$/.test(e)?{nome:n,endereco:e}:null}
  /* uma linha de inbox_mensagens_ref → a linha da lista (a MESMA forma do exemplo: id, remetente, endereco, assunto, previa, recebida, lida, anexo). Não há prévia: o corpo não é guardado. */
  function inbLinhaMensagem(r){
    if(!r||typeof r!=="object"||typeof r.id!=="string")return null;
    var nome=inbTexto(r.remetente_nome,200),end=inbTexto(r.remetente_endereco,254),para=[];
    if(Array.isArray(r.destinatarios))r.destinatarios.slice(0,20).forEach(function(x){var e=inbEnd(x);if(e)para.push(e.nome||e.endereco)});
    return {id:r.id,conta_id:r.conta_id,pasta_id:r.pasta_id,uid:Number(r.uid),remetente:(nome&&nome.trim())||end||"(sem remetente)",endereco:end||"",assunto:(inbTexto(r.assunto,500)||"").trim()||"(sem assunto)",previa:"",
      recebida:r.recebida_em||null,lida:r.lida===true,sinalizada:r.sinalizada===true,anexo:r.anexo_provavel===true,para:para}}
  /* resposta do testar_canal: só os carimbos de versão da função e do Worker (formato fixo); nada mais passa */
  function inbRespostaCanal(r){
    var re=/^[a-z0-9@._-]{1,60}$/;
    if(!r||r.ok!==true||r.canal!=="ok"||typeof r.funcao!=="string"||!re.test(r.funcao)||typeof r.worker!=="string"||!re.test(r.worker))return {ok:false,erro:"resposta_invalida"};
    return {ok:true,funcao:r.funcao,worker:r.worker}}
  function inbRespostaPastas(r){
    if(!r||typeof r!=="object"||r.ok!==true||!Array.isArray(r.pastas)||r.pastas.length>300)return {ok:false,erro:"resposta_invalida"};
    var usos=INB_USOS.map(function(u){return u[0]}),out=[],i,p;
    for(i=0;i<r.pastas.length;i++){p=r.pastas[i];
      if(!p||typeof p.id!=="string"||!INB_RE_UUID.test(p.id)||!inbTexto(p.nome,200)||usos.indexOf(p.uso)<0)return {ok:false,erro:"resposta_invalida"};
      out.push({id:p.id,nome:p.nome,uso:p.uso})}
    return {ok:true,pastas:out}}
  function inbRespostaSincronizacao(r){
    var s=r&&r.sincronizacao;
    if(!r||r.ok!==true||!s||INB_TIPOS_SINC.indexOf(s.tipo)<0||inbInteiro(s.novas)===null||inbInteiro(s.atualizadas)===null||inbInteiro(s.removidas)===null||typeof r.mais!=="boolean")return {ok:false,erro:"resposta_invalida"};
    return {ok:true,tipo:s.tipo,novas:s.novas,atualizadas:s.atualizadas,removidas:s.removidas,total:inbInteiro(r.mensagens_na_pasta),mais:r.mais}}
  function inbRespostaLeitura(r){
    var m=r&&r.mensagem,i,a,anexos=[];
    if(!r||r.ok!==true||!m||typeof m.texto!=="string"||m.texto.length>65536||["texto","html_convertido","sem_corpo"].indexOf(m.formato)<0||!Array.isArray(m.anexos)||m.anexos.length>30)return {ok:false,erro:"resposta_invalida"};
    for(i=0;i<m.anexos.length;i++){a=m.anexos[i];
      if(!a||typeof a.parte!=="string"||!INB_RE_PARTE.test(a.parte)||inbTexto(a.tipo,100)===null||inbInteiro(a.tamanho)===null||(a.nome!==null&&inbTexto(a.nome,200)===null))return {ok:false,erro:"resposta_invalida"};
      anexos.push({parte:a.parte,nome:a.nome,tipo:a.tipo,tamanho:a.tamanho,inline:a.inline===true})}
    var enderecos=function(l){var o=[];if(Array.isArray(l))l.slice(0,20).forEach(function(x){var e=inbEnd(x);if(e)o.push(e)});return o};
    return {ok:true,texto:m.texto,formato:m.formato,truncado:m.truncado===true,anexos:anexos,de:inbEnd(m.de),para:enderecos(m.para),cc:enderecos(m.cc),recebida:typeof m.recebida==="string"?m.recebida:null}}
  /* o que um anexo baixado pode ser no aparelho: nome sem caminho nem caractere de controle; tipo perigoso (HTML, XML, SVG, script) vira binário genérico, para nunca ser executado ao abrir */
  function inbNomeArquivoSeguro(n){return String(n==null?"":n).replace(/[\u0000-\u001f\u007f\/\\:*?"<>|]+/g,"_").replace(/^[.\s]+/,"").slice(0,120).trim()||"anexo"}
  function inbTipoDownload(t){var s=String(t==null?"":t).toLowerCase();
    if(!/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/.test(s))return "application/octet-stream";
    return /html|xml|svg|javascript|ecmascript|x-shockwave|x-msdownload|x-sh$|x-httpd|x-php/.test(s)?"application/octet-stream":s}
  function inbRespostaAnexo(r){
    var a=r&&r.anexo;
    if(!r||r.ok!==true||!a||typeof a.base64!=="string"||a.base64.length>4400000||!/^[A-Za-z0-9+\/]*={0,2}$/.test(a.base64)||inbTexto(a.tipo,100)===null||inbInteiro(a.tamanho_bytes)===null||(a.nome!==null&&inbTexto(a.nome,200)===null))return {ok:false,erro:"resposta_invalida"};
    return {ok:true,nome:inbNomeArquivoSeguro(a.nome),tipo:inbTipoDownload(a.tipo),tamanho:a.tamanho_bytes,base64:a.base64}}
  /* o texto do corpo em parágrafos (as quebras simples ficam, a tela as respeita); sem caractere de controle; no máximo 500 parágrafos */
  function inbParagrafos(texto){
    var t=String(texto==null?"":texto).replace(/\r\n?/g,"\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,"");
    return t.split(/\n{2,}/).map(function(p){return p.replace(/^\n+|\n+$/g,"")}).filter(function(p){return p.trim()!==""}).slice(0,500)}
  /* "Sincronizada hoje às 12:22." / "ontem às …" / "em 14/11 às …"; sem data: "Ainda não sincronizada." (o relógio é injetável, para teste) */
  function inbFraseSync(quando,agora){
    var d=quando?new Date(quando):null;if(!d||isNaN(d.getTime()))return "Ainda não sincronizada.";
    var n=agora?new Date(agora):new Date();function dia(x){return new Date(x.getFullYear(),x.getMonth(),x.getDate()).getTime()}
    var dif=Math.round((dia(n)-dia(d))/86400000),hm=inbDois(d.getHours())+":"+inbDois(d.getMinutes());
    return dif<=0?"Sincronizada hoje às "+hm+".":dif===1?"Sincronizada ontem às "+hm+".":"Sincronizada em "+inbDois(d.getDate())+"/"+inbDois(d.getMonth()+1)+" às "+hm+"."}
  /* ===== Cartão "E-mail" do Início (docs/inbox.md, "Início"): as linhas vêm do PRÓPRIO Inbox (inbox_contas, inbox_pastas, inbox_sincronizacao, credencial e cache de cabeçalhos).
     Nada é inventado: sem dado, o número é nulo e a linha diz o motivo. As identidades Gmail antigas (PESSOAL.emails) só aparecem como "Fora do Inbox" enquanto o Gmail não tiver conexão no Inbox. ===== */
  function inbCartao(e,agora){
    e=e||{};var contas=e.contas||[],pastas=e.pastas||[],cred=e.cred||{},sincs=e.sincs||{},msgs=e.msgs||[],gm=e.gmail||[],linhas=[],noInbox={};
    contas.forEach(function(c){
      var ps=pastas.filter(function(p){return p.conta_id===c.id}),ent=ps.filter(function(p){return p.uso==="entrada"})[0]||null,sy=ent&&sincs[ent.id]||null,prov=inbProvedor(c.provedor),est=inbEstado(c.estado),cr=cred[c.id]||"ausente",
        tom=est.tipo,rot=est.rotulo,problema=null,pode=!!(prov&&prov.ativo&&prov.leitura&&cr==="ativa");
      if(String(c.endereco||"")&&c.provedor==="gmail")noInbox[String(c.endereco).toLowerCase()]=1;
      if(!prov||!prov.ativo){problema="Este provedor ainda não pode ser conectado pelo Inbox.";tom="aviso";rot="Sem conexão"}
      else if(cr==="invalida"||c.estado==="erro_autenticacao"){problema=prov.oauth?"A autorização do provedor foi recusada ou revogada. Reconecte a conta no Inbox.":"O provedor recusou a credencial. Substitua a senha no Inbox.";tom="erro";rot="Erro de autenticação"}
      else if(cr!=="ativa"){problema="Sem conexão: conecte a conta no Inbox.";tom="aviso";rot="Sem conexão"}
      else if(sy&&sy.erro){problema=inbErroTexto(sy.erro);tom=(sy.falhas_seguidas||0)>=3?"erro":"aviso";rot="Falha ao sincronizar"}
      else if(!prov.leitura){problema="Conta conectada ("+prov.nome+"). A leitura de mensagens ainda não foi liberada no Inbox.";tom="aviso";rot="Conectada, sem leitura"}
      else if(c.estado==="atrasada"){problema="A sincronização está atrasada.";tom="aviso";rot="Atrasada"}
      var rec=msgs.filter(function(m){return m.conta_id===c.id&&(!ent||m.pasta_id===ent.id)}).sort(function(a,b){return String(b.recebida_em||"")<String(a.recebida_em||"")?-1:1}).slice(0,3).map(function(m){
        return {id:m.id,assunto:String(m.assunto||"").trim()||"(Sem assunto)",de:String(m.remetente_nome||m.remetente_endereco||"").trim(),lida:m.lida===true,quando:inbHora(m.recebida_em,agora),hash:"#inbox/"+c.id+"/"+m.pasta_id+"/"+m.id}});
      linhas.push({chave:c.id,origem:"inbox",nome:c.apelido,endereco:c.endereco,provedor:c.provedor,estadoRotulo:rot,tom:tom,problema:problema,
        naoLidas:ent?Math.max(0,Number(ent.nao_lidas)||0):null,frase:sy&&sy.ultima_ok_em?inbFraseSync(sy.ultima_ok_em,agora):"Ainda não sincronizada.",
        podeAtualizar:pode,hash:"#inbox/"+c.id,url:null,recentes:rec})});
    gm.forEach(function(g,i){
      var en=String(g&&g.e||"").trim(),u=String(g&&g.u||"");if(en&&noInbox[en.toLowerCase()])return;
      linhas.push({chave:"gmail:"+i,origem:"externa",nome:String(g&&g.n||"Gmail"),endereco:en,provedor:"gmail",estadoRotulo:"Fora do Inbox",tom:"aviso",
        problema:"O Gmail ainda não está conectado ao Inbox (a integração do Gmail é uma fase futura). Esta conta só abre no Gmail.",naoLidas:null,frase:"",podeAtualizar:false,hash:null,
        url:/^https:\/\/mail\.google\.com\//.test(u)?u:null,recentes:[]})});
    var nl=0,tem=false,prob=0;linhas.forEach(function(l){if(l.naoLidas!==null){nl+=l.naoLidas;tem=true}if(l.problema)prob++});
    return {linhas:linhas,resumo:{contas:linhas.length,naoLidas:tem?nl:null,comProblema:prob,parcial:linhas.some(function(l){return l.naoLidas===null})}}}
  /* Gerenciar contas (docs/inbox.md, "Menu e contas"): as ações oferecidas por conta SÓ existem se o provedor as implementa. iCloud e Gmail leem e testam; o Outlook só conecta e desconecta (a leitura ainda não existe). */
  function inbAcoesConta(conta,cred){
    var pv=conta?inbProvedor(conta.provedor):null,a={sincronizar:false,testar:false,conectar:false,reconectar:false,desconectar:false,oauth:!!(pv&&pv.oauth),motivo:null};
    if(!pv||!pv.ativo){a.motivo="Este provedor ainda não pode ser conectado pelo Inbox.";return a}
    cred=cred||"ausente";
    if(cred==="ausente"){a.conectar=true;return a}
    a.reconectar=true;a.desconectar=true;
    if(cred==="ativa"){a.sincronizar=!!pv.leitura;a.testar=!!pv.leitura;if(!pv.leitura)a.motivo="A leitura de mensagens deste provedor ainda não foi liberada no Inbox."}
    return a}
  /* o estado mostrado no cartão de Gerenciar contas e ao lado do provedor: nunca só a cor, sempre a palavra */
  function inbEstadoConta(conta,cred){
    cred=cred||"ausente";
    if(cred==="ausente")return {rotulo:"Sem conexão",tipo:"aviso"};
    if(cred==="invalida"||(conta&&conta.estado==="erro_autenticacao"))return {rotulo:"Erro de autenticação",tipo:"erro"};
    if(conta&&conta.estado==="sincronizando")return {rotulo:"Sincronizando",tipo:"info"};
    if(conta&&conta.estado==="atrasada")return {rotulo:"Atrasada",tipo:"aviso"};
    return {rotulo:"Conectada",tipo:"ok"}}
  /* a linha "última sincronização" da conta (caixa de entrada); nunca inventa: sem sincronização diz que ainda não houve */
  function inbUltimaSync(conta,pastas,sincs,agora){
    var ent=(pastas||[]).filter(function(p){return p.conta_id===conta.id&&p.uso==="entrada"})[0],sy=ent&&(sincs||{})[ent.id];
    return {frase:inbFraseSync(sy&&sy.ultima_ok_em,agora),erro:sy&&sy.erro?inbErroTexto(sy.erro):null}}
  function inbPlural(n,um,varios){return n+" "+(n===1?um:varios)}
  /* a frase do resultado de uma sincronização (para o aviso na tela) */
  function inbFraseSincronizacao(s){
    if(!s)return "";
    var f=s.tipo==="primeira_leitura"?"Caixa lida pela primeira vez: "+inbPlural(s.novas,"mensagem carregada.","mensagens carregadas.")
      :s.tipo==="sem_mudanca"?"Tudo em dia."+(s.novas?" "+inbPlural(s.novas,"mensagem nova.","mensagens novas."):"")
      :s.tipo==="novas_mensagens"?inbPlural(s.novas,"mensagem nova.","mensagens novas.")
      :"A caixa foi reorganizada no provedor e o RAC releu tudo ("+inbPlural(s.novas,"mensagem","mensagens")+").";
    if(s.removidas)f+=" "+inbPlural(s.removidas,"removida no provedor.","removidas no provedor.");
    if(s.mais)f+=" Há mais mensagens: sincronize de novo.";
    return f}
  /* ---- I3: composição e envio. Tudo puro: nenhuma rede, nenhuma tela. O envio de verdade é só na função rac-inbox; aqui se prepara o rascunho, se confere o que o dono vai ver antes de enviar e se classifica a resposta. ---- */
  /* "a@b.com, Ana <c@d.com>; e@f.com" → endereços em minúsculas, sem duplicidade; o que não for endereço volta em `invalidos` */
  function inbEnderecosDe(txt){
    var partes=String(txt==null?"":txt).split(/[,;\n]+/),lista=[],inv=[],vistos={};
    partes.forEach(function(p){p=p.trim();if(!p)return;var m=/<([^<>\s]+)>\s*$/.exec(p),e=(m?m[1]:p).trim().toLowerCase();
      if(e.length>254||!INB_RE_EMAIL.test(e)||/[<>",;]/.test(e)){inv.push(p.slice(0,60));return}
      if(!vistos[e]){vistos[e]=true;lista.push(e)}});
    return {lista:lista,invalidos:inv}}
  /* "Re: " e "Enc: " sem repetir (não vira "Re: Re: x"); "(sem assunto)" é só o texto de exibição da lista */
  function inbPrefixoAssunto(assunto,modo){
    var a=String(assunto==null?"":assunto).replace(/[\u0000-\u001f\u007f]+/g," ").trim();if(a==="(sem assunto)")a="";
    var re=modo==="encaminhar"?/^(enc|fwd|fw)\s*:/i:/^(re|res)\s*:/i;
    return re.test(a)?a:(modo==="encaminhar"?"Enc: ":"Re: ")+a}
  function inbRotuloEnd(x){return x&&x.nome&&x.nome.trim()?x.nome.trim()+" <"+x.endereco+">":(x?x.endereco:"")}
  function inbCitar(texto){return String(texto==null?"":texto).replace(/\r\n|\r/g,"\n").split("\n").map(function(l){return l?"> "+l:">"}).join("\n")}
  /* orig: { de:{nome,endereco}|null, para:[{nome,endereco}], cc:[…], assunto, recebida, texto, truncado, anexos:[{nome}] }; meu: o endereço da conta (o dono nunca vai nos destinatários de uma resposta).
     Devolve o rascunho: { modo, para:[], cc:[], cco:[], assunto, texto, avisos:[] }. Não altera `orig`. */
  function inbMontarRascunho(modo,orig,meu){
    orig=orig||{};var eu=String(meu||"").toLowerCase(),de=orig.de&&orig.de.endereco?String(orig.de.endereco).toLowerCase():"",vistos={},avisos=[];
    var lim=function(l){var o=[];(l||[]).forEach(function(x){var e=String(x&&x.endereco||"").toLowerCase();if(!e||e===eu||vistos[e])return;vistos[e]=true;o.push(e)});return o};
    var r={modo:modo,para:[],cc:[],cco:[],assunto:"",texto:"",avisos:avisos},assunto=orig.assunto,cab,corpo,max=INB_LIM_ENVIO.texto-3000;
    var corte=function(t){t=String(t==null?"":t);if(t.length>max){avisos.push("O texto original foi cortado para caber no limite da mensagem.");return t.slice(0,max)+"\n[…]"}return t};
    if(modo==="responder"||modo==="responder_todos"){
      var remetenteSouEu=de===eu;
      if(!remetenteSouEu&&de){vistos[de]=true;r.para.push(de)}
      if(modo==="responder"){if(remetenteSouEu)r.para=lim(orig.para).slice(0,1)}
      else{if(remetenteSouEu)r.para=lim(orig.para);else r.para=r.para.concat(lim(orig.para));r.cc=lim(orig.cc)}
      r.assunto=inbPrefixoAssunto(assunto,"responder");
      cab="Em "+(inbDataCompleta(orig.recebida)||"data desconhecida")+", "+(inbRotuloEnd(orig.de)||"o remetente")+" escreveu:";
      r.texto="\n\n"+cab+"\n"+corte(inbCitar(orig.texto))}
    else if(modo==="encaminhar"){
      r.assunto=inbPrefixoAssunto(assunto,"encaminhar");
      cab="---------- Mensagem encaminhada ----------\nDe: "+(inbRotuloEnd(orig.de)||"(desconhecido)")+"\nData: "+(inbDataCompleta(orig.recebida)||"(desconhecida)")+"\nAssunto: "+String(assunto==null?"":assunto).replace(/[\u0000-\u001f\u007f]+/g," ").trim()+
        "\nPara: "+((orig.para||[]).map(inbRotuloEnd).join(", ")||"(desconhecido)")+((orig.cc||[]).length?"\nCc: "+orig.cc.map(inbRotuloEnd).join(", "):"");
      corpo=corte(orig.texto);r.texto="\n\n"+cab+"\n\n"+corpo;
      if(orig.anexos&&orig.anexos.length)avisos.push((orig.anexos.length===1?"1 anexo da mensagem original não é encaminhado":orig.anexos.length+" anexos da mensagem original não são encaminhados")+" nesta etapa: "+orig.anexos.slice(0,5).map(function(a){return a.nome||"(sem nome)"}).join(", ")+(orig.anexos.length>5?"…":"")+".")}
    if(orig.truncado)avisos.push("A mensagem original era longa e só o começo foi lido; o texto citado está incompleto.");
    return r}
  /* confere o que a pessoa digitou ANTES de mostrar a revisão; devolve a entrada pronta para inboxChamar("enviar_mensagem") */
  function inbValidarRascunho(r){
    r=r||{};var e={},para=inbEnderecosDe(r.para),cc=inbEnderecosDe(r.cc),cco=inbEnderecosDe(r.cco),assunto=String(r.assunto==null?"":r.assunto).trim(),texto=String(r.texto==null?"":r.texto);
    if(INB_MODOS_ENVIO.indexOf(r.modo)<0)e.geral="Tipo de envio desconhecido.";
    [["para",para],["cc",cc],["cco",cco]].forEach(function(x){if(x[1].invalidos.length)e[x[0]]="Endereço inválido: "+x[1].invalidos.slice(0,3).join(", ")+"."});
    var vistos={},unico=function(l){return l.filter(function(a){if(vistos[a])return false;vistos[a]=true;return true})},p=unico(para.lista),c=unico(cc.lista),o=unico(cco.lista);
    if(!e.para&&!p.length)e.para="Informe ao menos um destinatário em Para.";
    if(p.length+c.length+o.length>INB_LIM_ENVIO.destinatarios)e.geral="Destinatários demais (máximo "+INB_LIM_ENVIO.destinatarios+" por mensagem).";
    if(assunto.length>INB_LIM_ENVIO.assunto)e.assunto="Assunto longo demais (máximo "+INB_LIM_ENVIO.assunto+" caracteres).";
    if(/[\u0000-\u001f\u007f]/.test(assunto))e.assunto="O assunto não pode ter quebra de linha.";
    if(texto.length>INB_LIM_ENVIO.texto)e.texto="Mensagem longa demais (máximo "+INB_LIM_ENVIO.texto+" caracteres).";
    if(!assunto&&!texto.trim())e.texto="Escreva um assunto ou uma mensagem.";
    if(Object.keys(e).length)return {ok:false,erros:e};
    var entrada={modo:r.modo,para:p,cc:c,cco:o,assunto:assunto,texto:texto};
    if(r.modo!=="novo"){if(!r.origem||!r.origem.pasta_id||!inbUidOk(r.origem.uid))return {ok:false,erros:{geral:"A mensagem de origem é inválida."}};entrada.pasta_id=r.origem.pasta_id;entrada.uid=r.origem.uid}
    return {ok:true,entrada:entrada,total:p.length+c.length+o.length}}
  /* de onde a pessoa vê o resultado: "enviado" (o servidor confirmou), "incerto" (pode ter saído: conferir Enviados), "confirmar" (a resposta não chegou; repetir o MESMO envio é seguro porque o servidor
     reconhece o envio_id e nunca transmite duas vezes) e "falha" (confirmado que nada saiu) */
  function inbClasseEnvio(r){
    if(r&&r.ok===true)return "enviado";
    var c=r&&r.erro;
    if(c==="envio_incerto")return "incerto";
    return ["rede","servico_indisponivel","resposta_invalida","limite"].indexOf(c)>=0?"confirmar":"falha"}
  function inbRespostaEnvio(d){
    if(!d||d.ok!==true||d.resultado!=="enviado"||typeof d.message_id!=="string"||d.message_id.length>255||(d.enviados!=="atualizada"&&d.enviados!=="nao_atualizada"))return {ok:false,erro:"resposta_invalida"};
    return {ok:true,resultado:"enviado",repetido:d.repetido===true,enviados:d.enviados}}
  /* I3.2: a resposta do gerenciamento (esquema fechado) e as regras de quais ações a tela oferece */
  function inbRespostaOrganizacao(d){
    if(!d||d.ok!==true||["aplicada","ja_estava","verificada"].indexOf(d.resultado)<0||!inbAcaoOk(d.acao)||(d.cache!=="atualizado"&&d.cache!=="nao_atualizado"))return {ok:false,erro:"resposta_invalida"};
    var marca=d.acao==="marcar_lida"||d.acao==="marcar_nao_lida";
    if(marca){if(typeof d.lida!=="boolean"||d.lida!==(d.acao==="marcar_lida"))return {ok:false,erro:"resposta_invalida"};return {ok:true,resultado:d.resultado,acao:d.acao,cache:d.cache,lida:d.lida}}
    if(typeof d.destino_pasta_id!=="string"||!INB_RE_UUID.test(d.destino_pasta_id))return {ok:false,erro:"resposta_invalida"};
    return {ok:true,resultado:d.resultado,acao:d.acao,cache:d.cache,destino_pasta_id:d.destino_pasta_id}}
  /* a frase de sucesso, só depois da confirmação do servidor; `nomeDestino` é o nome legível da pasta de destino (do cache de pastas) */
  function inbFraseOrganizacao(r,nomeDestino){
    var f={marcar_lida:"Mensagem marcada como lida.",marcar_nao_lida:"Mensagem marcada como não lida.",arquivar:"Mensagem arquivada.",excluir:"Mensagem movida para a Lixeira.",spam:"Mensagem movida para o Spam.",nao_spam:"Mensagem devolvida à Caixa de Entrada.",
      mover:"Mensagem movida"+(nomeDestino?" para “"+String(nomeDestino).slice(0,80)+"”":"")+"."}[r.acao]||"Ação concluída.";
    if(r.resultado==="ja_estava")f=r.acao==="marcar_lida"?"A mensagem já estava marcada como lida.":r.acao==="marcar_nao_lida"?"A mensagem já estava marcada como não lida.":f;
    if(r.resultado==="verificada")f+=" A resposta do iCloud não chegou, mas o RAC conferiu no servidor e a alteração está feita.";
    if(r.cache==="nao_atualizado")f+=" A lista ainda não foi atualizada: toque em Sincronizar.";
    return f}
  /* pastas de destino do "Mover para pasta": só da MESMA conta, ativas (selecionáveis no servidor) e diferentes da atual */
  function inbDestinosMover(pastas,contaId,pastaAtualId){
    var ordem={entrada:0,arquivo:1,enviados:2,rascunhos:3,outra:4,spam:5,lixo:6};
    return (pastas||[]).filter(function(p){return p&&p.conta_id===contaId&&p.id!==pastaAtualId&&p.ativa!==false}).sort(function(a,b){var x=ordem[a.uso]==null?4:ordem[a.uso],y=ordem[b.uso]==null?4:ordem[b.uso];return x-y||String(a.nome_exibicao||a.nome_externo).localeCompare(String(b.nome_exibicao||b.nome_externo))})}
  /* o que a tela oferece para UMA mensagem real: cada ação com {ok, motivo}. Só habilita o que o servidor tem como identificar (uso da pasta) e que faz sentido para a pasta atual. `semMover`: o iCloud desta conta já respondeu que não oferece MOVE. */
  function inbAcoesDisponiveis(m,pastas,semMover){
    var out={},ps=(pastas||[]).filter(function(p){return p.conta_id===m.conta_id&&p.ativa!==false}),atual=ps.filter(function(p){return p.id===m.pasta_id})[0],uso=atual?atual.uso:null,
      tem=function(u){return ps.some(function(p){return p.uso===u})},sem="O iCloud desta conta não oferece mover mensagens com segurança.",set=function(a,ok,motivo){out[a]={ok:!!ok,motivo:ok?null:motivo}};
    set("marcar_lida",!m.lida,"Já está lida.");set("marcar_nao_lida",m.lida,"Já está não lida.");
    set("arquivar",!semMover&&tem("arquivo")&&uso!=="arquivo",semMover?sem:uso==="arquivo"?"Já está no Arquivo.":"O iCloud não identificou a pasta de Arquivo.");
    set("excluir",!semMover&&tem("lixo")&&uso!=="lixo",semMover?sem:uso==="lixo"?"Já está na Lixeira. O RAC não faz exclusão definitiva.":"O iCloud não identificou a Lixeira.");
    set("spam",!semMover&&tem("spam")&&uso!=="spam",semMover?sem:uso==="spam"?"Já está no Spam.":"O iCloud não identificou a pasta de Spam.");
    set("nao_spam",!semMover&&uso==="spam"&&tem("entrada"),semMover?sem:uso!=="spam"?"Só para mensagens que estão no Spam.":"O iCloud não identificou a Caixa de Entrada.");
    set("mover",!semMover&&inbDestinosMover(ps,m.conta_id,m.pasta_id).length>0,semMover?sem:"Não há outra pasta selecionável nesta conta.");
    return out}
  var INB_ETAPAS_PROVA={conexao_tcp:"Conexão com o servidor",saudacao:"Saudação do servidor",ehlo:"Capacidades (EHLO)",starttls:"Pedido de STARTTLS",tls:"Camada TLS e certificado",ehlo_tls:"Capacidades sob TLS",autenticacao:"Login (AUTH)",remetente:"Remetente",destinatario:"Destinatário",dados:"Início dos dados",envio:"Aceite da mensagem"};
  function inbRespostaProva(d){
    if(!d||d.ok!==true||typeof d.aprovada!=="boolean"||!Array.isArray(d.etapas)||d.etapas.length>20||inbInteiro(d.total_ms)===null||["nao_enviado","enviado","incerto"].indexOf(d.teste)<0)return {ok:false,erro:"resposta_invalida"};
    var et=[],i,x;for(i=0;i<d.etapas.length;i++){x=d.etapas[i];if(!x||!INB_ETAPAS_PROVA[x.etapa]||typeof x.ok!=="boolean"||inbInteiro(x.ms)===null)return {ok:false,erro:"resposta_invalida"};et.push({etapa:x.etapa,rotulo:INB_ETAPAS_PROVA[x.etapa],ok:x.ok,ms:x.ms,codigo:inbInteiro(x.codigo)})}
    var o={ok:true,aprovada:d.aprovada,etapas:et,total_ms:d.total_ms,teste:d.teste};
    if(!d.aprovada){if(!INB_RE_CODIGO.test(String(d.erro))||!INB_RE_CODIGO.test(String(d.etapa_falha)))return {ok:false,erro:"resposta_invalida"};o.erro=d.erro;o.etapa_falha=d.etapa_falha}
    return o}
  function inbErroTexto(c){return INB_ERROS[c]||"Não foi possível concluir (código "+String(c||"desconhecido").replace(/[^a-z0-9_]/g,"").slice(0,41)+")."}
  /* ===== RAC Knowledge (docs/conhecimento.md): memória técnica do projeto. Só regras puras (validar, buscar, ler e gravar o arquivo .md, comparar com o banco). ===== */
  var KN_TIPOS=[{k:"regra",nome:"Regras",um:"Regra",dica:"O que vale sempre, para qualquer agente."},{k:"decisao",nome:"Decisões",um:"Decisão",dica:"O que foi decidido (ou recusado) e por quê."},
    {k:"erro",nome:"Erros e soluções",um:"Erro",dica:"O que deu errado, a causa-raiz e como evitar."},{k:"procedimento",nome:"Procedimentos",um:"Procedimento",dica:"Como fazer certo, passo a passo."},
    {k:"estado",nome:"Estado do projeto",um:"Estado",dica:"Onde o projeto está agora."},{k:"diario",nome:"Diário",um:"Diário",dica:"O que foi feito em cada lote."}];
  var KN_ESTADOS=[{k:"ativo",nome:"Ativo"},{k:"resolvido",nome:"Resolvido"},{k:"substituido",nome:"Substituído"},{k:"arquivado",nome:"Arquivado"}];
  /* os campos extras que o arquivo .md escreve como seção "## Nome" (o resto do texto é o conteúdo) */
  var KN_SECOES=[{k:"motivo",nome:"Motivo"},{k:"causa",nome:"Causa"},{k:"solucao",nome:"Solução"},{k:"prevencao",nome:"Prevenção"}];
  /* o mesmo detector que o gatilho do banco (migration 062): chave da Anthropic, do Supabase, do GitHub, JWT, chave privada, CPF */
  /* o prefixo da chave da Anthropic é montado em partes: os testes proíbem o texto inteiro em qualquer arquivo do site */
  var KN_SEGREDOS=[new RegExp("sk-"+"ant-[A-Za-z0-9_-]{20,}"),/sb_secret_[A-Za-z0-9_-]{10,}/,/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,/gh[pousr]_[A-Za-z0-9]{30,}/,/github_pat_[A-Za-z0-9_]{30,}/,/AIza[A-Za-z0-9_-]{30,}/,/-----BEGIN [A-Z ]*PRIVATE KEY-----/,/\d{3}\.\d{3}\.\d{3}-\d{2}/];
  function knSegredo(t){t=String(t||"");for(var i=0;i<KN_SEGREDOS.length;i++)if(KN_SEGREDOS[i].test(t))return true;return false}
  function knTipo(k){for(var i=0;i<KN_TIPOS.length;i++)if(KN_TIPOS[i].k===k)return KN_TIPOS[i];return null}
  function knEstado(k){for(var i=0;i<KN_ESTADOS.length;i++)if(KN_ESTADOS[i].k===k)return KN_ESTADOS[i];return null}
  /* tags: aceita lista ou texto separado por vírgula; minúsculas, sem repetir, até 12 de 40 letras (como o gatilho do banco) */
  function knTags(v){var l=Array.isArray(v)?v:String(v||"").split(","),vis={},r=[];
    l.forEach(function(x){x=String(x||"").trim().toLowerCase().slice(0,40);if(x&&!vis[x]){vis[x]=1;r.push(x)}});return r.slice(0,12)}
  function knSlug(t){var s=norm(t).replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,60).replace(/-+$/,"");return s.length>=3?s:"registro-"+(s||"novo")}
  var KN_REF=/^[a-z]+\/[a-z0-9][a-z0-9._-]{2,100}$/;
  /* confere um registro (do arquivo ou do formulário); devolve a lista de problemas, vazia se estiver bom */
  function knValidar(r){var p=[];r=r||{};
    if(!knTipo(r.tipo))p.push("tipo inválido");
    if(String(r.titulo||"").trim().length<3||String(r.titulo).length>200)p.push("título precisa ter de 3 a 200 letras");
    if(r.estado&&!knEstado(r.estado))p.push("estado inválido");
    if(String(r.conteudo||"").length>20000)p.push("conteúdo passa de 20.000 letras");
    KN_SECOES.forEach(function(s){if(String(r[s.k]||"").length>4000)p.push(s.nome+" passa de 4.000 letras")});
    if(String(r.categoria||"").length>60)p.push("categoria passa de 60 letras");
    if(String(r.origem||"").length>300)p.push("origem passa de 300 letras");
    if(r.ref&&!KN_REF.test(r.ref))p.push("ref inválida (use tipo/nome-em-minusculas)");
    if(r.data_ref&&!/^\d{4}-\d{2}-\d{2}$/.test(r.data_ref))p.push("data inválida (AAAA-MM-DD)");
    if(knSegredo([r.titulo,r.conteudo,r.motivo,r.causa,r.solucao,r.prevencao,r.origem,r.categoria,(r.tags||[]).join(" ")].join("\n")))p.push("o texto parece conter chave, token, chave privada ou CPF: registre só o fato, nunca o segredo");
    return p}
  /* o texto do arquivo .md → registro. Cabeçalho entre "---": titulo, tipo, categoria, tags, estado, origem, data, relacionados (refs separadas por vírgula). slug = nome do arquivo sem .md */
  function knLerArquivo(texto,slug){
    var t=String(texto||"").replace(/\r\n/g,"\n"),m=/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(t);
    if(!m)return {erro:"sem o cabeçalho entre ---"};
    var cab={};m[1].split("\n").forEach(function(l){var i=l.indexOf(":");if(i>0)cab[l.slice(0,i).trim().toLowerCase()]=l.slice(i+1).trim()});
    var r={tipo:cab.tipo,titulo:cab.titulo,categoria:cab.categoria||"",tags:knTags(cab.tags),estado:cab.estado||"ativo",origem:cab.origem||"",data_ref:cab.data||"",
      relacionados:String(cab.relacionados||"").split(",").map(function(x){return x.trim()}).filter(Boolean)};
    r.ref=r.tipo+"/"+slug;
    var corpo=m[2].split("\n"),atual="conteudo",acc={conteudo:[]};
    corpo.forEach(function(l){var h=/^##\s+(.+?)\s*$/.exec(l),sec=null;
      if(h){var n=norm(h[1]);KN_SECOES.forEach(function(s){if(norm(s.nome)===n)sec=s.k})}
      if(sec){atual=sec;acc[sec]=acc[sec]||[]}else acc[atual].push(l)});
    r.conteudo=acc.conteudo.join("\n").trim();KN_SECOES.forEach(function(s){r[s.k]=(acc[s.k]||[]).join("\n").trim()});
    var p=knValidar(r);if(!/^[a-z0-9][a-z0-9._-]{2,100}$/.test(slug))p.push("nome do arquivo inválido");
    return p.length?{erro:p.join("; "),reg:r}:{reg:r}}
  /* registro → texto do arquivo .md (o inverso de knLerArquivo; também é o "copiar para o agente" do site) */
  function knParaArquivo(r){
    var c=["---","titulo: "+String(r.titulo||"").replace(/\n/g," "),"tipo: "+r.tipo];
    if(r.categoria)c.push("categoria: "+r.categoria);if(r.tags&&r.tags.length)c.push("tags: "+r.tags.join(", "));
    c.push("estado: "+(r.estado||"ativo"));if(r.origem)c.push("origem: "+String(r.origem).replace(/\n/g," "));if(r.data_ref)c.push("data: "+r.data_ref);
    if(r.relacionados&&r.relacionados.length)c.push("relacionados: "+r.relacionados.join(", "));
    c.push("---","");if(r.conteudo)c.push(String(r.conteudo).trim(),"");
    KN_SECOES.forEach(function(s){if(r[s.k])c.push("## "+s.nome,"",String(r[s.k]).trim(),"")});
    return c.join("\n").replace(/\n+$/,"\n")}
  /* o registro do banco → o formato do arquivo/índice (relações viram refs quando o outro registro tem; as sem ref ficam de fora do arquivo) */
  function knDoBanco(row,todos){var rel=[];(row.relacionados||[]).forEach(function(id){(todos||[]).forEach(function(o){if(o.id===id&&o.ref_externa)rel.push(o.ref_externa)})});
    return {ref:row.ref_externa||(row.tipo+"/"+knSlug(row.titulo)),tipo:row.tipo,titulo:row.titulo,conteudo:row.conteudo||"",motivo:row.motivo||"",causa:row.causa||"",solucao:row.solucao||"",prevencao:row.prevencao||"",
      categoria:row.categoria||"",tags:row.tags||[],estado:row.estado||"ativo",origem:row.origem||"",data_ref:row.data_ref||"",relacionados:rel}}
  function knTexto(r){return norm([r.titulo,r.conteudo,r.motivo,r.causa,r.solucao,r.prevencao,r.categoria,r.origem,(r.tags||[]).join(" ")].join(" "))}
  /* busca e filtros da tela e do script: f = {q, tipo, categoria, tag, estado}; q com várias palavras exige todas (sem acento, sem maiúsculas); o título vale mais na ordem */
  function knBusca(lista,f){f=f||{};var ps=norm(f.q||"").split(/\s+/).filter(Boolean);
    var r=(lista||[]).filter(function(x){
      if(f.tipo&&x.tipo!==f.tipo)return false;if(f.estado==="vigentes"){if(x.estado!=="ativo"&&x.estado!=="resolvido")return false}else if(f.estado&&x.estado!==f.estado)return false;if(f.categoria&&x.categoria!==f.categoria)return false;if(f.tag&&(x.tags||[]).indexOf(f.tag)<0)return false;
      if(!ps.length)return true;var t=knTexto(x);return ps.every(function(p){return t.indexOf(p)>=0})});
    function pts(x){var t=norm(x.titulo),n=0;ps.forEach(function(p){if(t.indexOf(p)>=0)n+=2;if((x.tags||[]).some(function(g){return g===p}))n+=1});return n}
    return r.map(function(x,i){return {x:x,i:i,p:pts(x)}}).sort(function(a,b){return b.p-a.p||String(b.x.atualizado_em||b.x.data_ref||"").localeCompare(String(a.x.atualizado_em||a.x.data_ref||""))||a.i-b.i}).map(function(o){return o.x})}
  /* contagem por categoria e por tag (para os filtros) */
  function knFacetas(lista){var c={},t={};(lista||[]).forEach(function(x){if(x.categoria)c[x.categoria]=(c[x.categoria]||0)+1;(x.tags||[]).forEach(function(g){t[g]=(t[g]||0)+1})});
    function ord(o){return Object.keys(o).sort(function(a,b){return o[b]-o[a]||a.localeCompare(b)}).map(function(k){return {k:k,n:o[k]}})}return {categorias:ord(c),tags:ord(t)}}
  /* o que a importação do repositório faria: índice (docs/conhecimento/indice.json) × registros do banco, pela ref. igual = mesmo hash; conflito = o site editou depois da importação (nunca sobrescreve) */
  function knPlano(indice,banco){var porRef={},porTit={},p={novos:[],atualizar:[],conflitos:[],vincular:[],iguais:0,soSite:[]},casados={};
    (banco||[]).forEach(function(b){if(b.ref_externa)porRef[b.ref_externa]=b;else porTit[b.tipo+"|"+norm(b.titulo)]=b});
    (indice||[]).forEach(function(i){var b=porRef[i.ref];
      if(b){casados[b.id]=1;if(b.origem_hash===i.hash)p.iguais++;else if(b.editado_no_site)p.conflitos.push({item:i,banco:b});else p.atualizar.push({item:i,banco:b});return}
      b=porTit[i.tipo+"|"+norm(i.titulo)];if(b&&!casados[b.id]){casados[b.id]=1;p.vincular.push({item:i,banco:b})}else p.novos.push(i)});
    (banco||[]).forEach(function(b){if(!casados[b.id]&&(!b.ref_externa||b.editado_no_site))p.soSite.push(b);else if(casados[b.id]&&b.editado_no_site&&p.conflitos.every(function(c){return c.banco!==b}))p.soSite.push(b)});
    return p}
  /* a linha do banco que a importação grava (sem as relações, que dependem de ids e vêm num segundo passo) */
  function knLinha(i){return {tipo:i.tipo,titulo:i.titulo,conteudo:i.conteudo||"",motivo:i.motivo||null,causa:i.causa||null,solucao:i.solucao||null,prevencao:i.prevencao||null,categoria:i.categoria||null,tags:i.tags||[],
    estado:i.estado||"ativo",origem:i.origem||null,data_ref:i.data_ref||hoje0(),ref_externa:i.ref,origem_hash:i.hash,editado_no_site:false}}
  function hoje0(){var d=new Date();return d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2)}
  /* resumo para colar num chat com o agente: as regras ativas, o estado atual e as decisões e erros mais recentes (curto, sem inventar nada) */
  function knResumoAgente(lista,max){max=max||8;var at=(lista||[]).filter(function(x){return x.estado==="ativo"});
    function sec(tipo,tit,n){var l=at.filter(function(x){return x.tipo===tipo}).sort(function(a,b){return String(b.atualizado_em||b.data_ref||"").localeCompare(String(a.atualizado_em||a.data_ref||""))});if(n)l=l.slice(0,n);
      return l.length?"## "+tit+"\n"+l.map(function(x){return "- "+x.titulo+(x.conteudo?": "+String(x.conteudo).replace(/\s+/g," ").slice(0,220):"")}).join("\n"):""}
    return ["# RAC Knowledge · resumo",sec("regra","Regras permanentes"),sec("estado","Estado do projeto"),sec("decisao","Decisões recentes",max),sec("erro","Erros e como evitar",max)].filter(Boolean).join("\n\n")+"\n"}
  /* ===== Workspace (Lote 1 do novo RAC; docs/planejamento/14-arquitetura-do-workspace.md): o motor PURO de páginas, seções e widgets. Sem tela e sem banco: tudo recebe e devolve dados (o layout é um
     documento JSON; cada operação devolve um documento NOVO, o de entrada nunca é alterado). A tela (js/workspace.js) só chama estas funções e grava o resultado; o banco confere o mesmo formato
     (public.ws_layout_valido, migration 070 do banco) e tests/workspace_nucleo.test.mjs compara as duas validações caso a caso.
     Documento: { schema:1, secoes:[ { id, titulo, recolhida, itens:[ { id "w_…", tipo "dominio.nome", v, col 1..12, lin 0..12, estado ativo|oculto|desativado, config:{}, mobile? } ] } ] }
     Ocultar, remover da página, desativar e excluir o dado são coisas DIFERENTES (docs/planejamento/14, seção 6): aqui só existem as três primeiras, e nenhuma toca em dado de negócio. ===== */
  var WS_SCHEMA=1,WS_COLUNAS=12,WS_MAX_SECOES=12,WS_MAX_ITENS=60,WS_MAX_LAYOUT=60000,WS_MAX_CONFIG=3000,WS_MAX_TITULO=60,WS_MAX_PAGINAS=30,
      WS_ESTADOS=["ativo","oculto","desativado"],WS_PAPEIS=["proprietario","administrador","editor","leitor"],WS_AMBIENTES=["casa","biblioteca","projetos","descobrir","vida"],
      WS_PERIODOS=["hoje","7d","30d","mes","12m"],WS_CAMPOS=["periodo","selecao","numero","texto-curto","booleano"],WS_RE_ID=/^w_[a-z0-9]{6,32}$/,WS_RE_SECAO=/^[a-z0-9_-]{1,40}$/,WS_RE_TIPO=/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
  function wsInt(x,a,b){return typeof x==="number"&&isFinite(x)&&Math.floor(x)===x&&x>=a&&x<=b}
  function wsObj(x){return x!==null&&typeof x==="object"&&!Array.isArray(x)}
  function wsClonar(x){return x===undefined?x:JSON.parse(JSON.stringify(x))}
  /* ids: "w_" + letras minúsculas e números; rnd (opcional) devolve um número em [0,1) para o teste ser repetível */
  function wsNovoId(rnd,prefixo){rnd=rnd||Math.random;var s="",c="abcdefghijklmnopqrstuvwxyz0123456789",i;for(i=0;i<10;i++)s+=c.charAt(Math.floor(rnd()*c.length));return (prefixo||"w_")+s}
  function wsVazio(){return {schema:WS_SCHEMA,secoes:[{id:"principal",titulo:"",itens:[]}]}}
  /* a mesma conferência do banco (e as mesmas mensagens para a tela): {ok, erros:[texto]}. O limite de tamanho da configuração é um pouco menor que o do banco (3000 × 4096 bytes do jsonb) de propósito: o que passa aqui sempre passa lá. */
  function wsValidar(l){
    var erros=[],ids={},sids={},n=0;
    function er(m){erros.push(m);return false}
    if(!wsObj(l))return {ok:false,erros:["o layout não é um documento"]};
    if(JSON.stringify(l).length>WS_MAX_LAYOUT)er("o layout passou do tamanho máximo");
    if(!wsInt(l.schema,1,1000))er("schema inválido");
    if(!Array.isArray(l.secoes))return {ok:false,erros:erros.concat(["secoes não é uma lista"])};
    if(l.secoes.length>WS_MAX_SECOES)er("mais de "+WS_MAX_SECOES+" seções");
    l.secoes.forEach(function(s,i){
      if(!wsObj(s))return er("seção "+(i+1)+" inválida");
      if(typeof s.id!=="string"||!WS_RE_SECAO.test(s.id))er("seção "+(i+1)+" com id inválido");
      else if(sids[s.id])er("seção repetida: "+s.id);else sids[s.id]=1;
      if(s.titulo!==undefined&&(typeof s.titulo!=="string"||s.titulo.length>WS_MAX_TITULO))er("título da seção "+(i+1)+" inválido");
      if(s.recolhida!==undefined&&typeof s.recolhida!=="boolean")er("recolhida da seção "+(i+1)+" inválida");
      if(!Array.isArray(s.itens))return er("itens da seção "+(i+1)+" não é uma lista");
      s.itens.forEach(function(it){
        n++;if(n>WS_MAX_ITENS)return n===WS_MAX_ITENS+1&&er("mais de "+WS_MAX_ITENS+" componentes na página");
        if(!wsObj(it))return er("componente inválido");
        if(typeof it.id!=="string"||!WS_RE_ID.test(it.id))er("id de componente inválido");
        else if(ids[it.id])er("componente repetido: "+it.id);else ids[it.id]=1;
        if(typeof it.tipo!=="string"||it.tipo.length>60||!WS_RE_TIPO.test(it.tipo))er("tipo inválido: "+it.tipo);
        if(!wsInt(it.v,1,1000))er("versão do componente inválida ("+it.id+")");
        if(!wsInt(it.col,1,WS_COLUNAS))er("largura inválida ("+it.id+")");
        if(!wsInt(it.lin,0,12))er("altura inválida ("+it.id+")");
        if(typeof it.estado!=="string"||WS_ESTADOS.indexOf(it.estado)<0)er("estado inválido ("+it.id+")");
        if(!wsObj(it.config))er("configuração inválida ("+it.id+")");else if(JSON.stringify(it.config).length>WS_MAX_CONFIG)er("configuração grande demais ("+it.id+")");
        if(it.mobile!==undefined&&typeof it.mobile!=="boolean")er("mobile inválido ("+it.id+")")})});
    return {ok:erros.length===0,erros:erros}}
  /* versões do documento: hoje só existe a 1. Um documento de versão MAIS NOVA que o app (aparelho com app antigo) não é tocado: futuro=true e a tela só mostra, sem gravar. */
  var WS_MIGRACOES={};   /* { 1: function(doc){…→ doc da versão 2} } quando existir a versão 2 */
  function wsMigrar(doc){
    if(!wsObj(doc))return {doc:wsVazio(),migrou:true,futuro:false};
    var d=wsClonar(doc),v=wsInt(d.schema,1,1000)?d.schema:1,migrou=false;
    if(v>WS_SCHEMA)return {doc:d,migrou:false,futuro:true};
    while(v<WS_SCHEMA){var f=WS_MIGRACOES[v];if(!f)break;d=f(d);v=d.schema;migrou=true}
    if(!Array.isArray(d.secoes)){d.secoes=[];migrou=true}
    if(!wsInt(d.schema,1,1000)){d.schema=WS_SCHEMA;migrou=true}
    return {doc:d,migrou:migrou,futuro:false}}
  /* a migração das CONFIGURAÇÕES: cada tipo sabe levar a sua configuração de uma versão antiga à atual (def.migrarConfig); tipo ausente do catálogo não é mexido */
  function wsMigrarConfigs(l,catalogo){var d=wsClonar(l),avisos=[];
    d.secoes.forEach(function(s){s.itens.forEach(function(it){var def=catalogo&&catalogo[it.tipo];if(!def)return;
      if(it.v>def.versao){avisos.push({id:it.id,motivo:"versao_futura"});return}
      if(it.v<def.versao){try{it.config=def.migrarConfig?def.migrarConfig(wsClonar(it.config),it.v):it.config;it.v=def.versao}catch(e){avisos.push({id:it.id,motivo:"migracao_falhou"})}}})});
    return {layout:d,avisos:avisos}}
  /* o contrato de um tipo de widget (docs/planejamento/14, seção 4.1): confere antes de entrar no catálogo */
  function wsDefValida(def){
    var erros=[];function er(m){erros.push(m)}
    if(!wsObj(def))return {ok:false,erros:["a definição não é um objeto"]};
    if(typeof def.tipo!=="string"||!WS_RE_TIPO.test(def.tipo)||def.tipo.length>60)er("tipo inválido");
    if(!wsInt(def.versao,1,1000))er("versao inválida");
    ["titulo","categoria","descricao","dominio"].forEach(function(k){if(typeof def[k]!=="string"||!def[k])er(k+" ausente")});
    var t=def.tamanhos;
    if(!wsObj(t)||!Array.isArray(t.min)||!Array.isArray(t.padrao)||!Array.isArray(t.max))er("tamanhos ausentes");
    else{["min","padrao","max"].forEach(function(k){if(!wsInt(t[k][0],1,WS_COLUNAS)||!wsInt(t[k][1],0,12))er("tamanhos."+k+" inválido")});
      if(!erros.length&&(t.min[0]>t.padrao[0]||t.padrao[0]>t.max[0]||t.min[1]>t.padrao[1]||t.padrao[1]>t.max[1]))er("tamanhos fora de ordem (min ≤ padrão ≤ max)")}
    if(!Array.isArray(def.config))er("config deve ser uma lista de campos");
    else{var cs={};def.config.forEach(function(c){
      if(!wsObj(c)||typeof c.chave!=="string"||!/^[a-z][a-zA-Z0-9]{0,30}$/.test(c.chave))return er("campo de configuração sem chave válida");
      if(cs[c.chave])er("campo repetido: "+c.chave);cs[c.chave]=1;
      if(typeof c.rotulo!=="string"||!c.rotulo)er("campo "+c.chave+" sem rótulo");
      if(WS_CAMPOS.indexOf(c.tipo)<0)er("campo "+c.chave+" com tipo inválido");
      if(c.tipo==="selecao"&&(!Array.isArray(c.opcoes)||!c.opcoes.length))er("campo "+c.chave+" sem opções")})}
    if(def.versao>1&&typeof def.migrarConfig!=="function")er("versão acima de 1 exige migrarConfig");
    if(typeof def.renderizar!=="function")er("renderizar ausente");
    if(def.exige!==undefined&&!wsObj(def.exige))er("exige deve ser um objeto");
    if(typeof def.compartilhavel!=="boolean")er("compartilhavel deve ser true ou false (saúde, e-mail e custos são false)");
    return {ok:erros.length===0,erros:erros}}
  /* a configuração de uma instância: valores válidos ficam, os inválidos ou ausentes voltam ao padrão e as chaves desconhecidas são PRESERVADAS (compatibilidade com versões futuras) */
  function wsConfigNormalizar(def,config){
    var out=wsObj(config)?wsClonar(config):{},erros=[];
    (def&&def.config||[]).forEach(function(c){var v=out[c.chave],ok=true;
      if(c.tipo==="periodo")ok=WS_PERIODOS.indexOf(v)>=0;
      else if(c.tipo==="selecao"){var vals=(c.opcoes||[]).map(function(o){return o&&typeof o==="object"?o.valor:o});
        ok=c.multiplo?(Array.isArray(v)&&v.length<=(c.max||12)&&v.every(function(x){return vals.indexOf(x)>=0})):vals.indexOf(v)>=0}
      else if(c.tipo==="numero")ok=typeof v==="number"&&isFinite(v)&&(c.min==null||v>=c.min)&&(c.max==null||v<=c.max);
      else if(c.tipo==="texto-curto"){ok=typeof v==="string";if(ok&&v.length>(c.max||120)){v=v.slice(0,c.max||120);out[c.chave]=v}}
      else if(c.tipo==="booleano")ok=typeof v==="boolean";
      if(!ok){if(v!==undefined)erros.push({chave:c.chave,motivo:"valor inválido"});out[c.chave]=c.padrao!==undefined?c.padrao:(c.tipo==="selecao"&&c.multiplo?[]:c.tipo==="booleano"?false:c.tipo==="texto-curto"?"":c.tipo==="numero"?(c.min!=null?c.min:0):c.tipo==="periodo"?"7d":(c.opcoes&&c.opcoes[0]&&typeof c.opcoes[0]==="object"?c.opcoes[0].valor:c.opcoes&&c.opcoes[0]))}});
    return {config:out,erros:erros}}
  function wsLimitar(def,col,lin){var t=def&&def.tamanhos,c=col,l=lin;
    if(t){c=Math.max(t.min[0],Math.min(t.max[0],c));l=Math.max(t.min[1],Math.min(t.max[1],l))}
    return [Math.max(1,Math.min(WS_COLUNAS,Math.round(c))),Math.max(0,Math.min(12,Math.round(l)))]}
  /* ---- achar ---- */
  function wsAcharItem(l,id){var i,j;for(i=0;i<l.secoes.length;i++)for(j=0;j<l.secoes[i].itens.length;j++)if(l.secoes[i].itens[j].id===id)return {si:i,ii:j,item:l.secoes[i].itens[j]};return null}
  function wsSecaoIdx(l,id){var i;for(i=0;i<l.secoes.length;i++)if(l.secoes[i].id===id)return i;return -1}
  function wsTotalItens(l){return l.secoes.reduce(function(n,s){return n+s.itens.length},0)}
  /* ---- operações (cada uma devolve {layout, ...}; ok:false + motivo quando não pode, sem alterar nada) ---- */
  function wsNao(l,motivo){return {ok:false,layout:l,motivo:motivo}}
  function wsAdicionar(l,def,o){o=o||{};var d=wsClonar(l),si=o.secao?wsSecaoIdx(d,o.secao):0;
    if(!def||!def.tipo)return wsNao(l,"tipo_desconhecido");
    if(si<0||!d.secoes[si])return wsNao(l,"secao_inexistente");
    if(wsTotalItens(d)>=WS_MAX_ITENS)return wsNao(l,"limite_de_componentes");
    var id=o.id||wsNovoId(o.rnd),tam=wsLimitar(def,def.tamanhos.padrao[0],def.tamanhos.padrao[1]);
    if(wsAcharItem(d,id))return wsNao(l,"id_repetido");
    var cfg=wsConfigNormalizar(def,o.config||{}).config,it={id:id,tipo:def.tipo,v:def.versao,col:tam[0],lin:tam[1],estado:"ativo",config:cfg},ix=o.indice==null?d.secoes[si].itens.length:Math.max(0,Math.min(d.secoes[si].itens.length,o.indice));
    d.secoes[si].itens.splice(ix,0,it);return {ok:true,layout:d,id:id}}
  /* remover da página: tira a instância do layout; NADA do dado de negócio (nem do módulo) é tocado */
  function wsRemover(l,id){var d=wsClonar(l),a=wsAcharItem(d,id);if(!a)return wsNao(l,"componente_inexistente");d.secoes[a.si].itens.splice(a.ii,1);return {ok:true,layout:d,removido:a.item}}
  function wsMover(l,id,secaoId,indice){var d=wsClonar(l),a=wsAcharItem(d,id);if(!a)return wsNao(l,"componente_inexistente");
    var sj=secaoId==null?a.si:wsSecaoIdx(d,secaoId);if(sj<0)return wsNao(l,"secao_inexistente");
    var it=d.secoes[a.si].itens.splice(a.ii,1)[0],alvo=d.secoes[sj].itens,ix=indice==null?alvo.length:Math.max(0,Math.min(alvo.length,indice));
    alvo.splice(ix,0,it);return {ok:true,layout:d,secao:d.secoes[sj].id,indice:ix}}
  /* mover um passo (alternativa por teclado e por menu ao arrastar): delta -1 sobe, +1 desce; no começo ou no fim de uma seção, passa para a vizinha */
  function wsMoverPasso(l,id,delta){var a=wsAcharItem(l,id);if(!a)return wsNao(l,"componente_inexistente");
    var si=a.si,ii=a.ii+delta;
    if(ii<0){if(si===0)return wsNao(l,"ja_no_inicio");si--;ii=l.secoes[si].itens.length}
    else if(ii>=l.secoes[si].itens.length){if(si===l.secoes.length-1)return wsNao(l,"ja_no_fim");si++;ii=0}
    return wsMover(l,id,l.secoes[si].id,ii)}
  function wsRedimensionar(l,id,col,lin,def){var d=wsClonar(l),a=wsAcharItem(d,id);if(!a)return wsNao(l,"componente_inexistente");
    var t=wsLimitar(def,col==null?a.item.col:col,lin==null?a.item.lin:lin);a.item.col=t[0];a.item.lin=t[1];return {ok:true,layout:d,col:t[0],lin:t[1]}}
  function wsConfigurar(l,id,config,def){var d=wsClonar(l),a=wsAcharItem(d,id);if(!a)return wsNao(l,"componente_inexistente");
    var r=wsConfigNormalizar(def,config);if(JSON.stringify(r.config).length>WS_MAX_CONFIG)return wsNao(l,"configuracao_grande");
    a.item.config=r.config;return {ok:true,layout:d,erros:r.erros}}
  /* ativo | oculto | desativado: só muda o estado; posição, tamanho e configuração ficam */
  function wsEstado(l,id,estado){if(WS_ESTADOS.indexOf(estado)<0)return wsNao(l,"estado_invalido");
    var d=wsClonar(l),a=wsAcharItem(d,id);if(!a)return wsNao(l,"componente_inexistente");a.item.estado=estado;return {ok:true,layout:d}}
  /* mostrar ou não em tela de celular (só afeta a vista; a instância continua na página) */
  function wsMobile(l,id,mostrar){var d=wsClonar(l),a=wsAcharItem(d,id);if(!a)return wsNao(l,"componente_inexistente");if(mostrar===false)a.item.mobile=false;else delete a.item.mobile;return {ok:true,layout:d}}
  function wsDuplicar(l,id,def,rnd){var a=wsAcharItem(l,id);if(!a)return wsNao(l,"componente_inexistente");
    if(wsTotalItens(l)>=WS_MAX_ITENS)return wsNao(l,"limite_de_componentes");var d=wsClonar(l),b=wsAcharItem(d,id),c=wsClonar(b.item);c.id=wsNovoId(rnd);d.secoes[b.si].itens.splice(b.ii+1,0,c);return {ok:true,layout:d,id:c.id}}
  function wsSecaoAdicionar(l,titulo,id){var d=wsClonar(l);if(d.secoes.length>=WS_MAX_SECOES)return wsNao(l,"limite_de_secoes");
    var sid=id||("s"+Math.floor(Date.now()%1e8).toString(36)+Math.floor(Math.random()*1e4).toString(36));if(!WS_RE_SECAO.test(sid)||wsSecaoIdx(d,sid)>=0)return wsNao(l,"id_repetido");
    d.secoes.push({id:sid,titulo:String(titulo||"").slice(0,WS_MAX_TITULO),itens:[]});return {ok:true,layout:d,id:sid}}
  function wsSecaoRenomear(l,id,titulo){var d=wsClonar(l),i=wsSecaoIdx(d,id);if(i<0)return wsNao(l,"secao_inexistente");d.secoes[i].titulo=String(titulo||"").slice(0,WS_MAX_TITULO);return {ok:true,layout:d}}
  function wsSecaoRecolher(l,id,recolhida){var d=wsClonar(l),i=wsSecaoIdx(d,id);if(i<0)return wsNao(l,"secao_inexistente");d.secoes[i].recolhida=!!recolhida;return {ok:true,layout:d}}
  function wsSecaoMover(l,id,delta){var d=wsClonar(l),i=wsSecaoIdx(d,id),j=i+delta;if(i<0)return wsNao(l,"secao_inexistente");if(j<0||j>=d.secoes.length)return wsNao(l,"limite");
    var s=d.secoes.splice(i,1)[0];d.secoes.splice(j,0,s);return {ok:true,layout:d}}
  /* remover uma seção NUNCA perde componentes: eles vão para outra seção (a vizinha, ou a indicada); a última seção não se remove */
  function wsSecaoRemover(l,id,paraId){var d=wsClonar(l),i=wsSecaoIdx(d,id);if(i<0)return wsNao(l,"secao_inexistente");if(d.secoes.length<=1)return wsNao(l,"ultima_secao");
    var j=paraId?wsSecaoIdx(d,paraId):(i>0?i-1:1);if(j<0||j===i)return wsNao(l,"secao_inexistente");
    var s=d.secoes.splice(i,1)[0];if(j>i)j--;d.secoes[j].itens=d.secoes[j].itens.concat(s.itens);return {ok:true,layout:d,movidos:s.itens.length}}
  /* uma operação em forma de dado: o histórico de desfazer e a repetição sobre uma versão mais nova do servidor usam este formato */
  function wsAplicarOp(l,op,catalogo){var def=catalogo&&op.tipo?catalogo[op.tipo]:null;
    switch(op.op){
      case "adicionar":return wsAdicionar(l,def,{secao:op.secao,indice:op.indice,id:op.id,config:op.config});
      case "remover":return wsRemover(l,op.id);
      case "mover":return wsMover(l,op.id,op.secao,op.indice);
      case "redimensionar":return wsRedimensionar(l,op.id,op.col,op.lin,catalogo&&op.tipo?catalogo[op.tipo]:null);
      case "configurar":return wsConfigurar(l,op.id,op.config,def);
      case "estado":return wsEstado(l,op.id,op.estado);
      case "mobile":return wsMobile(l,op.id,op.mostrar);
      case "secao-adicionar":return wsSecaoAdicionar(l,op.titulo,op.id);
      case "secao-renomear":return wsSecaoRenomear(l,op.id,op.titulo);
      case "secao-recolher":return wsSecaoRecolher(l,op.id,op.recolhida);
      case "secao-remover":return wsSecaoRemover(l,op.id,op.para);
      case "secao-mover":return wsSecaoMover(l,op.id,op.delta)}
    return wsNao(l,"operacao_desconhecida")}
  /* repete as operações do usuário sobre o layout que o servidor tem agora (conflito de versão): as que não cabem mais (o componente sumiu) são devolvidas em "ignoradas", nunca em silêncio */
  function wsAplicarOps(l,ops,catalogo){var cur=l,aplicadas=0,ignoradas=[];
    (ops||[]).forEach(function(op){var r=wsAplicarOp(cur,op,catalogo);if(r.ok){cur=r.layout;aplicadas++}else ignoradas.push({op:op,motivo:r.motivo})});
    return {layout:cur,aplicadas:aplicadas,ignoradas:ignoradas}}
  /* o que mudou entre dois layouts, por id de componente (para dizer ao usuário o que o outro aparelho fez) */
  function wsDiff(a,b){var ia={},ib={},out={adicionados:[],removidos:[],alterados:[]};
    a.secoes.forEach(function(s,i){s.itens.forEach(function(it,j){ia[it.id]={it:it,s:s.id,j:j}})});b.secoes.forEach(function(s){s.itens.forEach(function(it,j){ib[it.id]={it:it,s:s.id,j:j}})});
    Object.keys(ib).forEach(function(k){if(!ia[k])out.adicionados.push(k);else if(JSON.stringify(ia[k].it)!==JSON.stringify(ib[k].it)||ia[k].s!==ib[k].s)out.alterados.push(k)});
    Object.keys(ia).forEach(function(k){if(!ib[k])out.removidos.push(k)});return out}
  /* ---- responsividade: 12 colunas no computador, 8 no tablet, 1 no celular; um único documento serve aos três ---- */
  function wsColunasPara(largura){return largura>=1181?12:largura>=861?8:1}
  function wsEscala(col,colunas){if(colunas>=WS_COLUNAS)return col;if(colunas<=1)return 1;return Math.max(1,Math.min(colunas,Math.round(col*colunas/WS_COLUNAS)))}
  /* o que desenhar: respeita ocultos (do layout e os pessoais), desativados (só no modo de edição), tipo fora do catálogo ("indisponivel": a configuração continua no layout) e permissão do tipo.
     opcoes: {edicao, ocultosPessoais:[ids], mostrarPessoais (traz de volta, marcados, os que a pessoa ocultou para si), catalogo:{tipo:def}, permite:function(def)→bool|{ok,motivo}, mobile:true} */
  function wsVisao(l,o){o=o||{};var cat=o.catalogo||{},pess={};(o.ocultosPessoais||[]).forEach(function(i){pess[i]=1});
    return l.secoes.map(function(s){var itens=[];
      s.itens.forEach(function(it){var def=cat[it.tipo]||null,sit="ok";
        if(!def)sit="indisponivel";
        else if(it.v>def.versao)sit="versao_futura";
        else if(o.permite){var p=o.permite(def);if(p===false||(p&&p.ok===false))sit="sem_permissao"}
        var oc=it.estado==="oculto",po=!!pess[it.id];
        if(oc||po){if(!o.edicao&&!(po&&!oc&&o.mostrarPessoais))return;sit=sit==="ok"?"oculto":sit}
        else if(it.estado==="desativado"){if(!o.edicao)return;sit="desativado"}
        if(o.mobile&&it.mobile===false&&!o.edicao)return;
        itens.push({item:it,def:def,situacao:sit,oculto:it.estado==="oculto",pessoalOculto:!!pess[it.id]})});
      return {id:s.id,titulo:s.titulo||"",recolhida:!!s.recolhida,itens:itens}})}
  /* ---- permissões (a mesma tabela do banco: rac_pode_no_espaco; o banco decide, isto só esconde o que ele recusaria) ---- */
  function wsPodeNoEspaco(papel,nivel,arquivado){
    if(WS_PAPEIS.indexOf(papel)<0)return false;if(nivel==="ler")return true;if(arquivado)return false;
    if(nivel==="editar")return papel!=="leitor";if(nivel==="administrar")return papel==="proprietario"||papel==="administrador";if(nivel==="proprietario")return papel==="proprietario";return false}
  /* um tipo pode entrar numa página? ctx: {tipoEspaco, papel, modulos:[ids que o usuário tem], dono:bool}. Tipo privado (saúde, e-mail, custos: compartilhavel=false) nunca entra em espaço compartilhado. */
  function wsPodeUsarTipo(def,ctx){ctx=ctx||{};var e=def&&def.exige||{};
    if(!def)return {ok:false,motivo:"tipo_desconhecido"};
    if(ctx.tipoEspaco==="compartilhado"&&def.compartilhavel!==true)return {ok:false,motivo:"tipo_privado"};
    if(e.espacos&&ctx.tipoEspaco&&e.espacos.indexOf(ctx.tipoEspaco)<0)return {ok:false,motivo:"espaco_nao_suportado"};
    if(e.papeis&&ctx.papel&&e.papeis.indexOf(ctx.papel)<0)return {ok:false,motivo:"papel_insuficiente"};
    if(e.modulo&&(ctx.modulos||[]).indexOf(e.modulo)<0)return {ok:false,motivo:"modulo_indisponivel"};
    if(e.dono&&!ctx.dono)return {ok:false,motivo:"so_do_dono"};
    return {ok:true}}
  /* ---- páginas ---- */
  function wsTitulo(t){return String(t==null?"":t).replace(/\s+/g," ").trim()}
  /* o mesmo título (sem diferença de maiúsculas nem de espaços) só uma vez por espaço entre as ativas: igual ao índice único do banco */
  function wsTituloOk(titulo,existentes,ignorarId){var t=wsTitulo(titulo);
    if(!t)return {ok:false,motivo:"vazio"};if(t.length>WS_MAX_TITULO)return {ok:false,motivo:"longo"};
    var dup=(existentes||[]).some(function(p){return p.id!==ignorarId&&!p.arquivada_em&&wsTitulo(p.titulo).toLowerCase()===t.toLowerCase()});
    return dup?{ok:false,motivo:"repetido"}:{ok:true,titulo:t}}
  function wsOrdenarPaginas(ps){return (ps||[]).filter(function(p){return !p.arquivada_em}).slice().sort(function(a,b){return (a.ordem||0)-(b.ordem||0)||String(a.criado_em||"").localeCompare(String(b.criado_em||""))||String(a.titulo).localeCompare(String(b.titulo))})}
  /* a página inicial de cada pessoa: a que ela marcou (favorita) se ainda existe e é visível; senão a primeira */
  function wsPaginaInicial(ps,prefs){var l=wsOrdenarPaginas(ps),i;for(i=0;i<(prefs||[]).length;i++)if(prefs[i].favorita)for(var j=0;j<l.length;j++)if(l[j].id===prefs[i].pagina_id)return l[j];return l[0]||null}
  /* reordenar: devolve só as páginas que mudam de número ({id, ordem}) */
  function wsMoverPagina(ps,id,delta){var l=wsOrdenarPaginas(ps),i=-1,k;for(k=0;k<l.length;k++)if(l[k].id===id)i=k;
    if(i<0)return [];var j=i+delta;if(j<0||j>=l.length)return [];var p=l.splice(i,1)[0];l.splice(j,0,p);
    return l.map(function(x,n){return {id:x.id,ordem:n,antes:x.ordem||0}}).filter(function(x){return x.ordem!==x.antes}).map(function(x){return {id:x.id,ordem:x.ordem}})}
  /* os ocultos pessoais de uma página: só ids que ainda existem no layout (o resto é lixo de uma versão antiga e sai) */
  function wsOcultosValidos(l,ocultos){var ids={};l.secoes.forEach(function(s){s.itens.forEach(function(it){ids[it.id]=1})});return (ocultos||[]).filter(function(i){return ids[i]}).slice(0,WS_MAX_ITENS)}
  /* a página padrão de quem ainda não personalizou nada: gerada por código (nada para configurar do zero) */
  function wsLayoutPadrao(catalogo,tipos,rnd){var l=wsVazio();(tipos||[]).forEach(function(t){var def=catalogo&&catalogo[t];if(!def)return;var r=wsAdicionar(l,def,{rnd:rnd});if(r.ok)l=r.layout});return l}

  raiz.RACnucleo={WS_SCHEMA:WS_SCHEMA,WS_COLUNAS:WS_COLUNAS,WS_MAX_SECOES:WS_MAX_SECOES,WS_MAX_ITENS:WS_MAX_ITENS,WS_MAX_LAYOUT:WS_MAX_LAYOUT,WS_MAX_CONFIG:WS_MAX_CONFIG,WS_MAX_TITULO:WS_MAX_TITULO,WS_MAX_PAGINAS:WS_MAX_PAGINAS,WS_ESTADOS:WS_ESTADOS,WS_PAPEIS:WS_PAPEIS,WS_AMBIENTES:WS_AMBIENTES,WS_PERIODOS:WS_PERIODOS,WS_CAMPOS:WS_CAMPOS,WS_MIGRACOES:WS_MIGRACOES,wsInt:wsInt,wsObj:wsObj,wsClonar:wsClonar,wsNovoId:wsNovoId,wsVazio:wsVazio,wsValidar:wsValidar,wsMigrar:wsMigrar,wsMigrarConfigs:wsMigrarConfigs,wsDefValida:wsDefValida,wsConfigNormalizar:wsConfigNormalizar,wsLimitar:wsLimitar,wsAcharItem:wsAcharItem,wsSecaoIdx:wsSecaoIdx,wsTotalItens:wsTotalItens,wsNao:wsNao,wsAdicionar:wsAdicionar,wsRemover:wsRemover,wsMover:wsMover,wsMoverPasso:wsMoverPasso,wsRedimensionar:wsRedimensionar,wsConfigurar:wsConfigurar,wsEstado:wsEstado,wsMobile:wsMobile,wsDuplicar:wsDuplicar,wsSecaoAdicionar:wsSecaoAdicionar,wsSecaoRenomear:wsSecaoRenomear,wsSecaoRecolher:wsSecaoRecolher,wsSecaoMover:wsSecaoMover,wsSecaoRemover:wsSecaoRemover,wsAplicarOp:wsAplicarOp,wsAplicarOps:wsAplicarOps,wsDiff:wsDiff,wsColunasPara:wsColunasPara,wsEscala:wsEscala,wsVisao:wsVisao,wsPodeNoEspaco:wsPodeNoEspaco,wsPodeUsarTipo:wsPodeUsarTipo,wsTitulo:wsTitulo,wsTituloOk:wsTituloOk,wsOrdenarPaginas:wsOrdenarPaginas,wsPaginaInicial:wsPaginaInicial,wsMoverPagina:wsMoverPagina,wsOcultosValidos:wsOcultosValidos,wsLayoutPadrao:wsLayoutPadrao,
    KN_TIPOS:KN_TIPOS,KN_ESTADOS:KN_ESTADOS,KN_SECOES:KN_SECOES,knSegredo:knSegredo,knTipo:knTipo,knEstado:knEstado,knTags:knTags,knSlug:knSlug,knValidar:knValidar,knLerArquivo:knLerArquivo,knParaArquivo:knParaArquivo,knDoBanco:knDoBanco,knBusca:knBusca,knFacetas:knFacetas,knPlano:knPlano,knLinha:knLinha,knResumoAgente:knResumoAgente,inbCartao:inbCartao,inbAcoesConta:inbAcoesConta,inbEstadoConta:inbEstadoConta,inbUltimaSync:inbUltimaSync,INB_ACOES:INB_ACOES,inbRespostaOrganizacao:inbRespostaOrganizacao,inbFraseOrganizacao:inbFraseOrganizacao,inbDestinosMover:inbDestinosMover,inbAcoesDisponiveis:inbAcoesDisponiveis,inbEnderecosDe:inbEnderecosDe,inbPrefixoAssunto:inbPrefixoAssunto,inbRotuloEnd:inbRotuloEnd,inbCitar:inbCitar,inbMontarRascunho:inbMontarRascunho,inbValidarRascunho:inbValidarRascunho,inbClasseEnvio:inbClasseEnvio,inbRespostaEnvio:inbRespostaEnvio,inbRespostaProva:inbRespostaProva,INB_MODOS_ENVIO:INB_MODOS_ENVIO,INB_LIM_ENVIO:INB_LIM_ENVIO,INB_ETAPAS_PROVA:INB_ETAPAS_PROVA,inbFraseSync:inbFraseSync,inbRespostaCanal:inbRespostaCanal,inbLinhaMensagem:inbLinhaMensagem,inbRespostaPastas:inbRespostaPastas,inbRespostaSincronizacao:inbRespostaSincronizacao,inbRespostaLeitura:inbRespostaLeitura,inbRespostaAnexo:inbRespostaAnexo,inbNomeArquivoSeguro:inbNomeArquivoSeguro,inbTipoDownload:inbTipoDownload,inbParagrafos:inbParagrafos,inbFraseSincronizacao:inbFraseSincronizacao,INB_RE_PARTE:INB_RE_PARTE,INB_RECURSOS:INB_RECURSOS,INB_RECURSO_ROTULOS:INB_RECURSO_ROTULOS,INB_PROVEDORES:INB_PROVEDORES,inbProvedor:inbProvedor,inbProvedorEscreve:inbProvedorEscreve,INB_ESTADOS:INB_ESTADOS,inbEstado:inbEstado,INB_USOS:INB_USOS,inbUsoRotulo:inbUsoRotulo,INB_TIPOS_SINC:INB_TIPOS_SINC,inbCredenciais:inbCredenciais,inbContaValida:inbContaValida,inbCredencialValida:inbCredencialValida,INB_CRED_ROTULOS:INB_CRED_ROTULOS,INB_OPERACOES:INB_OPERACOES,INB_ESCRITA:INB_ESCRITA,inbPedido:inbPedido,inbUidOk:inbUidOk,inbCursor:inbCursor,inbRespostaEstado:inbRespostaEstado,inbArvore:inbArvore,inbUnificada:inbUnificada,inbTelaEstado:inbTelaEstado,INB_ERROS:INB_ERROS,inbErroTexto:inbErroTexto,INB_CATEGORIAS:INB_CATEGORIAS,INB_FILTROS:INB_FILTROS,inbIniciais:inbIniciais,inbHora:inbHora,inbOrdenar:inbOrdenar,inbFiltrar:inbFiltrar,inbNaoLidas:inbNaoLidas,inbContadorBarra:inbContadorBarra,inbGrupoData:inbGrupoData,inbAgrupar:inbAgrupar,inbDataCompleta:inbDataCompleta,
    sauRecomendacao:sauRecomendacao,sauResumoSemana:sauResumoSemana,sauScoreSono:sauScoreSono,sauRotuloQual:sauRotuloQual,sauFaixaScore:sauFaixaScore,lugNotas:lugNotas,lugCep:lugCep,lugCnpj:lugCnpj,lugEnderecoCnpj:lugEnderecoCnpj,lugNomeCidade:lugNomeCidade,lugEnderecoViaCep:lugEnderecoViaCep,lugMercados:lugMercados,lugPontosDia:lugPontosDia,lugSugerir:lugSugerir,lugPasseios:lugPasseios,lugValida:lugValida,hojeIaJanela:hojeIaJanela,hojeIaAutoPode:hojeIaAutoPode,hojeIaMarcar:hojeIaMarcar,hojeMudouProntidao:hojeMudouProntidao,mbaHojeResumo:mbaHojeResumo,mkUltimasNotas:mkUltimasNotas,hojeTreinoLinha:hojeTreinoLinha,fonteContrato:fonteContrato,SAU_LIMITE:SAU_LIMITE,sauVals:sauVals,SAU_METAS:SAU_METAS,SAU_METRICAS:SAU_METRICAS,SAU_CAMPOS:SAU_CAMPOS,sauNum:sauNum,sauMedia:sauMedia,sauArred:sauArred,sauPor:sauPor,sauJanela:sauJanela,sauBase:sauBase,sauMinNoite:sauMinNoite,sauHora:sauHora,sauRegularidade:sauRegularidade,sauQualidade:sauQualidade,sauAvaliar:sauAvaliar,sauTextoSinal:sauTextoSinal,sauHistoricoSinais:sauHistoricoSinais,sauSinais:sauSinais,sauIndicadores:sauIndicadores,sauFrase:sauFrase,sauAssociacao:sauAssociacao,sauSonoVfc:sauSonoVfc,sauCargaSemanal:sauCargaSemanal,sauCargaVariacao:sauCargaVariacao,sauMusculacao:sauMusculacao,sauResumoAtiv:sauResumoAtiv,sauVo2:sauVo2,sauMinutosSemana:sauMinutosSemana,sauEficiencia:sauEficiencia,sauCargaDia:sauCargaDia,sauRecuperacaoTreino:sauRecuperacaoTreino,sauMudancas:sauMudancas,sauAgrupar:sauAgrupar,sauPrefs:sauPrefs,SAU_NAO_TREINO:SAU_NAO_TREINO,sauContaTreino:sauContaTreino,famIntegrantes:famIntegrantes,hojeQuemDe:hojeQuemDe,saudeInsights:saudeInsights,famMeds:famMeds,famDiagnostico:famDiagnostico,mbaAulasDe:mbaAulasDe,mbaAvalsDe:mbaAvalsDe,mbaMaterialPendente:mbaMaterialPendente,mbaFinDe:mbaFinDe,agendaItens:agendaItens,AGD_GRUPOS:AGD_GRUPOS,agdGrupos:agdGrupos,agdQuando:agdQuando,agdResumo:agdResumo,agdFrase:agdFrase,agdSerie:agdSerie,agdAreas:agdAreas,agdFiltrar:agdFiltrar,agdTom:agdTom,cmChaveOn:cmChaveOn,cmEquivalencias:cmEquivalencias,cmJuntar:cmJuntar,cmSeparar:cmSeparar,cmAplicarEquivalencias:cmAplicarEquivalencias,cmCategoriasOn:cmCategoriasOn,cmCategoriaOnDefinir:cmCategoriaOnDefinir,cmRenomearOn:cmRenomearOn,cmSugerirJuncoes:cmSugerirJuncoes,cmLinhas:cmLinhas,cmFiltrar:cmFiltrar,cmPorEstab:cmPorEstab,cmResumoProduto:cmResumoProduto,cmOrdenar:cmOrdenar,cmCategoria:cmCategoria,cmEstabelecimento:cmEstabelecimento,cmComparar:cmComparar,cmOportunidades:cmOportunidades,cmPorMes:cmPorMes,cmExplorar:cmExplorar,CU_PLATAFORMAS:CU_PLATAFORMAS,CU_GRUPOS:CU_GRUPOS,cuCat:cuCat,cuSemCidade:cuSemCidade,cuCanaisValidos:cuCanaisValidos,cuCanalDefinir:cuCanalDefinir,cuNotaChave:cuNotaChave,cuDeNotas:cuDeNotas,cuDeOnline:cuDeOnline,cuDeDelivery:cuDeDelivery,cuUnificar:cuUnificar,cuPeriodo:cuPeriodo,cuFiltrar:cuFiltrar,cuResumo:cuResumo,cuCategoriasDe:cuCategoriasDe,cuComparar:cuComparar,cuItens:cuItens,cuEstabelecimentos:cuEstabelecimentos,cuCategorias:cuCategorias,AR_AREAS_PADRAO:AR_AREAS_PADRAO,AR_MAPA_PADRAO:AR_MAPA_PADRAO,arConfig:arConfig,arRaw:arRaw,arAreaDe:arAreaDe,arNomeArea:arNomeArea,arAssociar:arAssociar,arAreaCriar:arAreaCriar,arAreaRemover:arAreaRemover,arCategoriaCriar:arCategoriaCriar,arCategoriaRemover:arCategoriaRemover,arCompras:arCompras,arResumo:arResumo,arCategorias:arCategorias,MK_CATEGORIAS_EXTRA:MK_CATEGORIAS_EXTRA,MK_SUBCATEGORIAS:MK_SUBCATEGORIAS,mkCategoriaEfetiva:mkCategoriaEfetiva,mkSubEfetiva:mkSubEfetiva,mkOpcoesCategoria:mkOpcoesCategoria,mkTodasCategorias:mkTodasCategorias,mkSubOpcoes:mkSubOpcoes,mkClasseValida:mkClasseValida,mkResumoClasse:mkResumoClasse,rdMedidas:rdMedidas,rdCompararMedidas:rdCompararMedidas,rdSuspeitas:rdSuspeitas,RD_JANELAS:RD_JANELAS,RD_ANOMALIA:RD_ANOMALIA,rdNorm:rdNorm,rdUrlOk:rdUrlOk,rdHostDe:rdHostDe,rdHostCasa:rdHostCasa,rdPontos:rdPontos,rdHistorico:rdHistorico,rdAnomalia:rdAnomalia,rdOportunidades:rdOportunidades,rdChaveAviso:rdChaveAviso,rdNaoAvisadas:rdNaoAvisadas,rdSugerirEquivalencia:rdSugerirEquivalencia,RD_MODALIDADES:RD_MODALIDADES,RD_FRETES:RD_FRETES,rdCent:rdCent,rdCep:rdCep,rdValidarPreco:rdValidarPreco,rdPrecoFinal:rdPrecoFinal,rdChaveSerie:rdChaveSerie,rdVigentes:rdVigentes,rdUltimas:rdUltimas,rdRanking:rdRanking,rdVariacao:rdVariacao,rdJanela:rdJanela,rdEquivalencia:rdEquivalencia,mkxNum:mkxNum,mkxCelula:mkxCelula,mkxCsv:mkxCsv,mkxConsumo:mkxConsumo,mkxComparar:mkxComparar,mkxPainel:mkxPainel,mkxPrecos:mkxPrecos,mkxAlertas:mkxAlertas,MKX_REL:MKX_REL,MKX_LISTAS:MKX_LISTAS,mkcMesmoDia:mkcMesmoDia,MKAL_TIPOS:MKAL_TIPOS,mkalConfig:mkalConfig,mkalGerar:mkalGerar,mkalClassificar:mkalClassificar,mkalMarcarLido:mkalMarcarLido,mkalLimiteSalvar:mkalLimiteSalvar,mkalLimiteRemover:mkalLimiteRemover,mkalOpcoes:mkalOpcoes,mkcAtalho:mkcAtalho,mkcPeriodoInfo:mkcPeriodoInfo,mkcMetric:mkcMetric,mkcComparar:mkcComparar,mkcCompRank:mkcCompRank,mkcChaveProd:mkcChaveProd,mkcPrecos:mkcPrecos,PC_TIPOS_DO_PRODUTO:PC_TIPOS_DO_PRODUTO,pcChave:pcChave,pcVinculos:pcVinculos,pcVincular:pcVincular,pcDesvincular:pcDesvincular,pcItemDe:pcItemDe,pcTokens:pcTokens,pcSugerirItens:pcSugerirItens,pcBase:pcBase,pcComparar:pcComparar,rdDiferenca:rdDiferenca,pcResumoOfertas:pcResumoOfertas,pcCategoria:pcCategoria,pcNotaChave:pcNotaChave,mkcPeriodo:mkcPeriodo,mkcFiltrar:mkcFiltrar,mkcCategorias:mkcCategorias,mkcResumo:mkcResumo,mkcProdutos:mkcProdutos,mkcProduto:mkcProduto,mkcPorMes:mkcPorMes,MK_CATEGORIAS:MK_CATEGORIAS,MK_CAT_REVISAR:MK_CAT_REVISAR,mkCatOficial:mkCatOficial,mkNome:mkNome,mkTexto:mkTexto,mkChave:mkChave,mkClassificar:mkClassificar,mkTokensCasar:mkTokensCasar,mkSimilaridade:mkSimilaridade,mkCasarProduto:mkCasarProduto,mkCasarEstabelecimento:mkCasarEstabelecimento,MK_CASAR_CORTE:MK_CASAR_CORTE,nfUnidadeMercado:nfUnidadeMercado,nfEntradaDecisoes:nfEntradaDecisoes,nfEntradaPayload:nfEntradaPayload,nfEstadosNota:nfEstadosNota,nfConsultaTexto:nfConsultaTexto,nfResultadoConfirmar:nfResultadoConfirmar,norm:norm,urlAbs:urlAbs,lerAbast:lerAbast,TEMAS:TEMAS,temasDe:temasDe,juntarDados:juntarDados,SKILLS:SKILLS,compatVaga:compatVaga,omsZ:omsZ,omsValor:omsValor,percentilDeZ:percentilDeZ,csvLinhas:csvLinhas,napperLer:napperLer,bebeDias:bebeDias,VACINAS_PNI:VACINAS_PNI,vacinasCalendario:vacinasCalendario,mediana:mediana,prontidao:prontidao,SAU_MARCO:SAU_MARCO,sauDataDe:sauDataDe,sauMeu:sauMeu,sauClassificar:sauClassificar,somaDiasISO:somaDiasISO,correlacao:correlacao,chuvaAviso:chuvaAviso,diasEntre:diasEntre,chaveProduto:chaveProduto,previsaoCompras:previsaoCompras,padraoCompras:padraoCompras,itemBate:itemBate,notaItens:notaItens,dividirItens:dividirItens,lerEmailVaga:lerEmailVaga,vagaParecida:vagaParecida,iaAbastTexto:iaAbastTexto,iaNotaTexto:iaNotaTexto,iaNum:iaNum,iaUsd:iaUsd,iaReais:iaReais,iaBrl:iaBrl,iaResumo:iaResumo,iaAlerta:iaAlerta,iaEstados:iaEstados,iaNomeMes:iaNomeMes,iaCompetencias:iaCompetencias,iaModulo:iaModulo,iaUsoLinha:iaUsoLinha,iaValorUsd:iaValorUsd,iaMesIso:iaMesIso,iaMeses:iaMeses,
    NL_CATS:NL_CATS,NL_TIPOS:NL_TIPOS,NL_PESOS:NL_PESOS,NL_LIM:NL_LIM,NL_TURNOS:NL_TURNOS,nlTurno:nlTurno,NL_ATRASO_H:NL_ATRASO_H,nlAtraso:nlAtraso,nlDataDaChave:nlDataDaChave,nlNovos:nlNovos,nlCat:nlCat,nlConfig:nlConfig,nlOculto:nlOculto,nlRelevancia:nlRelevancia,nlDataBRT:nlDataBRT,nlHash:nlHash,nlChaveIA:nlChaveIA,
    nlFontes:nlFontes,nlSnap:nlSnap,nlTodos:nlTodos,nlIds:nlIds,nlEdicao:nlEdicao,nlResumoRegras:nlResumoRegras,nlEntradaIA:nlEntradaIA,nlAplicarIA:nlAplicarIA,nlConteudoOk:nlConteudoOk,nlFiltrar:nlFiltrar,nlSemana:nlSemana,nlSalvo:nlSalvo,
    SEG_TABELAS:SEG_TABELAS,SEG_CHAVES_FORA:SEG_CHAVES_FORA,segDef:segDef,segTabelaAusente:segTabelaAusente,segChave:segChave,segCanon:segCanon,segLimpar:segLimpar,segBackup:segBackup,segLer:segLer,segHashes:segHashes,segAjustar:segAjustar,segRepor:segRepor,segPlano:segPlano,segEscrita:segEscrita,segAnexoDestino:segAnexoDestino,segAnexosEnviar:segAnexosEnviar,segNota:segNota,
    pnMeses:pnMeses,pnPorMes:pnPorMes,pnDespesas:pnDespesas,pnVariacao:pnVariacao,pnOrcamento:pnOrcamento,pnProjecao:pnProjecao,pnSemana:pnSemana,pnConsistencia:pnConsistencia,pnMediaMes:pnMediaMes,pnCompetencias:pnCompetencias,
    ESP_FASES:ESP_FASES,espTemporada:espTemporada,mlbDesfecho:mlbDesfecho,espDia:espDia,espUltimos:espUltimos,espAtividade:espAtividade,espCentralOrdem:espCentralOrdem,espHa:espHa,espComparar:espComparar,espFatos:espFatos,espChaveIA:espChaveIA,espNumeros:espNumeros,espAplicarIA:espAplicarIA,espCacheGuardar:espCacheGuardar,
    AB_COMBUST:AB_COMBUST,AB_KML:AB_KML,abLer:abLer,abConsumo:abConsumo,abPrecos:abPrecos,abPorMes:abPorMes,abResumo:abResumo,abDuplicado:abDuplicado,abConferir:abConferir,abDados:abDados,pnVeicCat:pnVeicCat,
    AL_PLATAFORMAS:AL_PLATAFORMAS,AL_MODOS:AL_MODOS,AL_CAT:AL_CAT,AL_CATEGORIAS:AL_CATEGORIAS,alCent:alCent,alBRL:alBRL,alItem:alItem,alPedidoConta:alPedidoConta,alConferir:alConferir,
    alCatMercado:alCatMercado,alModo:alModo,alPedidoDespesas:alPedidoDespesas,alMercadoDespesas:alMercadoDespesas,alSomar:alSomar,alTamanho:alTamanho,alProdutoInfo:alProdutoInfo,
    alChaveProduto:alChaveProduto,alCompararProdutos:alCompararProdutos,alNoHistorico:alNoHistorico,alPrecoBase:alPrecoBase,alNumeroPedido:alNumeroPedido,alDuplicata:alDuplicata,alVersao:alVersao,
    alIntegridade:alIntegridade,alIntegridadeLista:alIntegridadeLista,alDuplicataMercado:alDuplicataMercado,
    atuFormSujo:atuFormSujo,atuPode:atuPode,atuRelerPessoal:atuRelerPessoal,atuUrlFresca:atuUrlFresca,atuHora:atuHora,atuConferir:atuConferir,atuEstado:atuEstado,
    ATU_VOLTAR_MS:ATU_VOLTAR_MS,atuVoltar:atuVoltar,NOTIF_VALIDADE_MS:NOTIF_VALIDADE_MS,notifHash:notifHash,notifFresco:notifFresco,
    MON_PROCESSOS:MON_PROCESSOS,MON_JANELA_MS:MON_JANELA_MS,monCron:monCron,monCronProxima:monCronProxima,monCronAnterior:monCronAnterior,monDeRotina:monDeRotina,monDeNewsletter:monDeNewsletter,
    monDeRadar:monDeRadar,monDeFiscal:monDeFiscal,monDeInbox:monDeInbox,monDeGithub:monDeGithub,MON_RODANDO_MAX:MON_RODANDO_MAX,MON_CAT:MON_CAT,monPainel:monPainel,monFiltro:monFiltro,monRobos:monRobos,monAvaliar:monAvaliar,monResumo:monResumo,
    TREINO_OCULTOS:TREINO_OCULTOS,HOJE_FONTES:HOJE_FONTES,hojeReais:hojeReais,hojeEstadoFontes:hojeEstadoFontes,hojePrioridade:hojePrioridade,hojeNivel:hojeNivel,PRI_VALIDADE_CALC:PRI_VALIDADE_CALC,priPontos:priPontos,priNivel:priNivel,priId:priId,priFollowup:priFollowup,priItem:priItem,priOportunidade:priOportunidade,priOrdenar:priOrdenar,priSelecionar:priSelecionar,priSaude:priSaude,hojeItem:hojeItem,hojeDedup:hojeDedup,hojeOrdenar:hojeOrdenar,
    hojeFinancas:hojeFinancas,hojeSaude:hojeSaude,hojeVagas:hojeVagas,hojeItens:hojeItens,hojeMudancas:hojeMudancas,hojeLimpar:hojeLimpar,hojeContexto:hojeContexto,hojeChave:hojeChave,hojeTextoChave:hojeTextoChave,hojeRuido:hojeRuido,hojeSemHoras:hojeSemHoras,hojeFontesUteis:hojeFontesUteis,hojeQualidadeFontes:hojeQualidadeFontes,HOJE_PESSOAIS:HOJE_PESSOAIS,
    IA_AVISOS_PADRAO:IA_AVISOS_PADRAO,iaCustoChamada:iaCustoChamada,iaUsdFino:iaUsdFino,iaDiaBR:iaDiaBR,iaMonitor:iaMonitor,iaClasse:iaClasse,iaInformadoProvedor:iaInformadoProvedor,iaStatusCustos:iaStatusCustos,iaOpcoes:iaOpcoes,iaHistorico:iaHistorico,IA_CLASSES:IA_CLASSES,hojeDefasagem:hojeDefasagem,hojeCitados:hojeCitados,
    CO_LOJAS:CO_LOJAS,CO_CATEGORIAS:CO_CATEGORIAS,CO_DOC_NOME:CO_DOC_NOME,coCategoria:coCategoria,coNum:coNum,coData:coData,coPagamento:coPagamento,coRecorrencia:coRecorrencia,coLerTexto:coLerTexto,
    coLerNFe:coLerNFe,coLerCSV:coLerCSV,coConferir:coConferir,coNumeroPedido:coNumeroPedido,coDuplicata:coDuplicata,coLimparTexto:coLimparTexto,coLimparExtraido:coLimparExtraido,coMesclar:coMesclar,coDespesas:coDespesas,coRegra:coRegra,coValorDespesa:coValorDespesa,coResumo:coResumo,coRotulo:coRotulo,coDeBanco:coDeBanco,coPrecoLiquido:coPrecoLiquido,coMultipack:coMultipack,coDescontos:coDescontos,coSegmentoDe:coSegmentoDe,coPedidoNoPreco:coPedidoNoPreco,coItemNoPreco:coItemNoPreco,coRecorrencias:coRecorrencias,coPrecos:coPrecos,CO_GRAVAR_CAMPOS:CO_GRAVAR_CAMPOS,CO_GRAVAR_ITEM:CO_GRAVAR_ITEM,CO_GRAVAR_DOC:CO_GRAVAR_DOC,CO_DOC_TIPOS:CO_DOC_TIPOS,CO_GRAVAR_PROTEGIDOS:CO_GRAVAR_PROTEGIDOS,coOrigemDe:coOrigemDe,coItemGravar:coItemGravar,coPayloadGravar:coPayloadGravar,coDocPayload:coDocPayload,coPayloadSoDocs:coPayloadSoDocs,CO_COMPLEMENTO_CAMPOS:CO_COMPLEMENTO_CAMPOS,coComplementoAnexo:coComplementoAnexo,coDivergenciasAnexo:coDivergenciasAnexo,coPayloadAnexar:coPayloadAnexar,coErroGravar:coErroGravar,coLojaDe:coLojaDe,coItemTotal:coItemTotal,coItemHist:coItemHist,coNatureza:coNatureza,coProdutoResumo:coProdutoResumo,coDetalhe:coDetalhe,coCategoriaItem:coCategoriaItem,coPedidoPartes:coPedidoPartes,coDetalheLoja:coDetalheLoja,coDetalheCategoria:coDetalheCategoria,
    CO_CANAIS:CO_CANAIS,CO_CAT_DIGITAL:CO_CAT_DIGITAL,coCanalDe:coCanalDe,coModuloDestino:coModuloDestino,coSituacao:coSituacao,coClassificar:coClassificar,
    AM_CAMPOS_SAIDA:AM_CAMPOS_SAIDA,amLerHistorico:amLerHistorico,amIndicadores:amIndicadores,amSelecionarArquivos:amSelecionarArquivos,amImportar:amImportar,amReconstruirCSV:amReconstruirCSV,amAuditarSanitizado:amAuditarSanitizado,
    CO_REEMB_ESTADOS:CO_REEMB_ESTADOS,coReembChave:coReembChave,coReembVincular:coReembVincular,coReembCreditos:coReembCreditos,
    NF_MODELOS:NF_MODELOS,NF_FORMATOS:NF_FORMATOS,NF_SITUACOES:NF_SITUACOES,NF_TRANSICOES:NF_TRANSICOES,NF_MODULOS:NF_MODULOS,nfDvChave:nfDvChave,nfCnpjValido:nfCnpjValido,nfValidarChave:nfValidarChave,nfSituacao:nfSituacao,nfUnidade:nfUnidade,nfQtdBase:nfQtdBase,
    nfDec:nfDec,nfNormalizar:nfNormalizar,nfLerXML:nfLerXML,nfTemDadoPessoal:nfTemDadoPessoal,nfCpfDvOk:nfCpfDvOk,nfCpfsValidos:nfCpfsValidos,nfTemCpf:nfTemCpf,nfCaminhoDoc:nfCaminhoDoc,nfRetentar:nfRetentar,nfParaGravarDoc:nfParaGravarDoc,nfResultadoDoc:nfResultadoDoc,nfAtualizarSituacao:nfAtualizarSituacao,nfParaGravar:nfParaGravar,NF_MIMES_XML:NF_MIMES_XML,nfVincular:nfVincular,nfValidarSoma:nfValidarSoma,nfVeredito:nfVeredito,nfDuplicidade:nfDuplicidade,nfDecisaoGravacao:nfDecisaoGravacao,nfTipoReal:nfTipoReal,nfArquivoIA:nfArquivoIA,nfLoteIA:nfLoteIA,nfPdfAtivo:nfPdfAtivo,nfMascararCpf:nfMascararCpf,nfLerIA:nfLerIA,nfCorrigir:nfCorrigir,nfConfiancaIA:nfConfiancaIA,NF_CONF_MIN:NF_CONF_MIN,NF_ENTRADA_MAX:NF_ENTRADA_MAX,NF_CONF_ALERTA:NF_CONF_ALERTA,nfQrChave:nfQrChave,nfQrConferir:nfQrConferir,nfConsultaSefaz:nfConsultaSefaz,nfChaveColada:nfChaveColada,nfConsultaChave:nfConsultaChave,nfCamposInfo:nfCamposInfo,NF_IA_MAX_PAG:NF_IA_MAX_PAG};
})(typeof window!=="undefined"?window:globalThis);
