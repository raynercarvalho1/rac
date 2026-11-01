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
  var IA_MODULOS={abastecimento:"Abastecimento",mercado:"Nota do mercado",newsletter:"Newsletter",esportes:"Central Esportiva"};
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
    {t:"pessoal",pk:["chave"]},{t:"garmin_dia",pk:["data"]},{t:"garmin_ativ",pk:["id"]},
    {t:"newsletter_edicoes",pk:["id"],nat:[["data","turno"]],dono:"dono",so:"exportar"}];
  /* nunca saem nem voltam: a chave dos atalhos (restaurar reativaria uma chave já trocada) e a chave do Google Maps */
  var SEG_CHAVES_FORA={atalho:"chave dos atalhos do iPhone",googleMaps:"chave do Google Maps"};
  var SEG_SEGREDO=/senha|password|passwd|token|secret|segredo|api_?key|apikey|chave_?api|private_?key|access_?key|p256dh|vapid/i;
  /* não comparam: dono e carimbos de hora que mudam sozinhos */
  var SEG_IGNORA={user_id:1,dono:1,atualizado:1,atualizado_em:1};
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
  /* compara o backup com o que a conta tem hoje e monta o plano (nada é gravado aqui). Cada linha do backup vira:
     nova (não existe), igual (existe idêntica), diferente (existe com outro conteúdo: só muda se o dono pedir) ou inválida (aponta para
     um pai que não existe). Mesmo nome com outro id conta como o mesmo registro, e os filhos passam a apontar para o id de hoje. */
  function segPlano(B,atual,o){o=o||{};var conta=o.conta||null,velha=B.conta||null,mapas={},validos={},
    res={outraConta:!!(velha&&conta&&velha!==conta),tabelas:[],total:{novas:0,iguais:0,diferentes:0,invalidas:0,fora:0,soExportar:0}};
    SEG_TABELAS.forEach(function(d){var l=B.tabelas[d.t],hoje=(atual&&atual[d.t])||[],porPk={},porNat={},mapa={},val={};
      mapas[d.t]=mapa;validos[d.t]=val;
      /* o que existe hoje vale como pai mesmo quando a tabela não está no backup */
      hoje.forEach(function(r){var k=segChave(d,r);if(k!=null){porPk[k]=r;if(d.pk.length===1)val[k]=1}(d.nat||[]).forEach(function(c){var n=segNat(c,r);if(n)porNat[n]=r})});
      if(!l)return;
      var it={t:d.t,so:d.so||"",novas:[],iguais:0,diferentes:[],invalidas:[],remapeadas:0,fora:0,semPai:0};
      if(d.so){it.soExportar=l.length;res.total.soExportar+=l.length;res.tabelas.push(it);return}
      var vistos={};
      l.forEach(function(r0){if(!r0||typeof r0!=="object")return;var k=segChave(d,r0);if(k==null||vistos[k])return;vistos[k]=1;
        if(d.t==="pessoal"&&SEG_CHAVES_FORA[r0.chave]){it.fora++;return}
        var r=segAjustar(d,segLimpar(d.t,[r0]).linhas[0],conta,velha),bad=null;
        /* filhos primeiro apontam para o id do pai de hoje (o pai pode ter sido reconhecido pelo nome) */
        if(d.fk)Object.keys(d.fk).forEach(function(c){if(r[c]==null||bad)return;var pai=d.fk[c],v=(mapas[pai]||{})[r[c]]||r[c];
          if((validos[pai]||{})[v])r[c]=v;else if(d.opc&&d.opc[c]){r[c]=null;it.semPai++}else bad=c+" aponta para "+pai+" que não existe"});
        if(bad){it.invalidas.push({linha:r0,motivo:bad});return}
        var ex=porPk[k];
        if(!ex&&d.nat&&d.pk[0]==="id")d.nat.some(function(c){var n=segNat(c,r);if(n&&porNat[n]){ex=porNat[n];mapa[r.id]=ex.id;r.id=ex.id;it.remapeadas++;return true}return false});
        if(d.pk.length===1)val[String(r[d.pk[0]])]=1;
        /* duas linhas do backup que caem no mesmo registro por nome: a segunda não entra de novo */
        (d.nat||[]).forEach(function(c){var n=segNat(c,r);if(n&&!porNat[n])porNat[n]=r});
        if(!ex){it.novas.push(r);porPk[segChave(d,r)]=r;return}
        /* compara sem os segredos (o backup não os tem) e, se trocar, os segredos de hoje continuam na linha */
        var exL=segLimpar(d.t,[ex]).linhas[0]||{},campos=Object.keys(r).filter(function(c){return !SEG_IGNORA[c]&&segCanon(r[c])!==segCanon(exL[c]===undefined?null:exL[c])});
        if(!campos.length)it.iguais++;else it.diferentes.push({linha:segRepor(r,ex),atual:ex,campos:campos})});
      ["novas","diferentes","invalidas"].forEach(function(c){res.total[c]+=it[c].length});res.total.iguais+=it.iguais;res.total.fora+=it.fora;
      res.tabelas.push(it)});
    return res}
  /* o que será gravado, na ordem: novas sempre entram (insert, nunca sobrescreve); diferentes só com "substituir" (upsert) */
  function segEscrita(plano,substituir){var l=[];
    plano.tabelas.forEach(function(it){if(it.so)return;
      if(it.novas.length)l.push({t:it.t,op:"insert",linhas:it.novas});
      if(substituir&&it.diferentes.length)l.push({t:it.t,op:"upsert",linhas:it.diferentes.map(function(x){return x.linha})})});
    return l}
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
  function pnDespesas(compras,registros,parcelas,fonteDe){var L=[];
    (compras||[]).forEach(function(x){var v=+x.valor_total;if(x.data&&isFinite(v))L.push({d:x.data,v:v,f:"Mercado",cat:x.categoria||"Outros"})});
    (registros||[]).forEach(function(r){var d=r.dados||{};if(typeof d.custo!=="number"||!isFinite(d.custo)||d.compra||!r.data)return;L.push({d:r.data,v:d.custo,f:fonteDe?fonteDe(r.quem):r.quem,cat:r.tipo})});
    (parcelas||[]).forEach(function(p){if(p&&p.paga&&p.venc&&typeof p.v==="number")L.push({d:p.venc,v:p.v,f:"MBA",cat:"mensalidade"})});
    return L}
  /* variação entre dois valores; null quando não há base de comparação (anterior ausente ou zero) */
  function pnVariacao(atual,anterior){if(atual==null||anterior==null||!isFinite(atual)||!isFinite(anterior)||anterior===0)return null;
    return {dif:atual-anterior,pct:(atual-anterior)/Math.abs(anterior)*100}}
  /* orçamento × gasto do mês: gastos {categoria:valor}, orcamentos [{categoria, valor}] → linhas e totais (só categorias com orçamento ou gasto) */
  function pnOrcamento(gastos,orcamentos){var orc={},cats={};(orcamentos||[]).forEach(function(o){if(o&&o.categoria&&+o.valor>=0){orc[o.categoria]=+o.valor;cats[o.categoria]=1}});
    Object.keys(gastos||{}).forEach(function(c){cats[c]=1});
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
  raiz.RACnucleo={norm:norm,urlAbs:urlAbs,lerAbast:lerAbast,TEMAS:TEMAS,temasDe:temasDe,juntarDados:juntarDados,SKILLS:SKILLS,compatVaga:compatVaga,omsZ:omsZ,omsValor:omsValor,percentilDeZ:percentilDeZ,csvLinhas:csvLinhas,napperLer:napperLer,bebeDias:bebeDias,VACINAS_PNI:VACINAS_PNI,vacinasCalendario:vacinasCalendario,mediana:mediana,prontidao:prontidao,somaDiasISO:somaDiasISO,correlacao:correlacao,chuvaAviso:chuvaAviso,diasEntre:diasEntre,chaveProduto:chaveProduto,previsaoCompras:previsaoCompras,padraoCompras:padraoCompras,itemBate:itemBate,notaItens:notaItens,dividirItens:dividirItens,lerEmailVaga:lerEmailVaga,vagaParecida:vagaParecida,iaAbastTexto:iaAbastTexto,iaNotaTexto:iaNotaTexto,iaNum:iaNum,iaUsd:iaUsd,iaReais:iaReais,iaBrl:iaBrl,iaResumo:iaResumo,iaAlerta:iaAlerta,iaEstados:iaEstados,iaNomeMes:iaNomeMes,iaCompetencias:iaCompetencias,iaModulo:iaModulo,iaUsoLinha:iaUsoLinha,iaValorUsd:iaValorUsd,iaMesIso:iaMesIso,iaMeses:iaMeses,
    NL_CATS:NL_CATS,NL_TIPOS:NL_TIPOS,NL_PESOS:NL_PESOS,NL_LIM:NL_LIM,NL_TURNOS:NL_TURNOS,nlTurno:nlTurno,NL_ATRASO_H:NL_ATRASO_H,nlAtraso:nlAtraso,nlDataDaChave:nlDataDaChave,nlCat:nlCat,nlConfig:nlConfig,nlOculto:nlOculto,nlRelevancia:nlRelevancia,nlDataBRT:nlDataBRT,nlHash:nlHash,nlChaveIA:nlChaveIA,
    nlFontes:nlFontes,nlSnap:nlSnap,nlTodos:nlTodos,nlIds:nlIds,nlEdicao:nlEdicao,nlResumoRegras:nlResumoRegras,nlEntradaIA:nlEntradaIA,nlAplicarIA:nlAplicarIA,nlConteudoOk:nlConteudoOk,nlFiltrar:nlFiltrar,nlSemana:nlSemana,nlSalvo:nlSalvo,
    SEG_TABELAS:SEG_TABELAS,SEG_CHAVES_FORA:SEG_CHAVES_FORA,segDef:segDef,segChave:segChave,segCanon:segCanon,segLimpar:segLimpar,segBackup:segBackup,segLer:segLer,segHashes:segHashes,segAjustar:segAjustar,segRepor:segRepor,segPlano:segPlano,segEscrita:segEscrita,segNota:segNota,
    pnMeses:pnMeses,pnPorMes:pnPorMes,pnDespesas:pnDespesas,pnVariacao:pnVariacao,pnOrcamento:pnOrcamento,pnProjecao:pnProjecao,pnSemana:pnSemana,pnConsistencia:pnConsistencia,pnMediaMes:pnMediaMes,pnCompetencias:pnCompetencias,
    ESP_FASES:ESP_FASES,espTemporada:espTemporada,mlbDesfecho:mlbDesfecho,espDia:espDia,espUltimos:espUltimos,espComparar:espComparar,espFatos:espFatos,espChaveIA:espChaveIA,espNumeros:espNumeros,espAplicarIA:espAplicarIA,espCacheGuardar:espCacheGuardar,
    AB_COMBUST:AB_COMBUST,AB_KML:AB_KML,abLer:abLer,abConsumo:abConsumo,abPrecos:abPrecos,abPorMes:abPorMes,abResumo:abResumo,abDuplicado:abDuplicado,abConferir:abConferir,abDados:abDados,pnVeicCat:pnVeicCat};
})(typeof window!=="undefined"?window:globalThis);
