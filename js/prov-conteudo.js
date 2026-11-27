/* Dia a Dia RAC — provedores de BUSCA do conteúdo que mora na memória e nos arquivos do site (Lote 3 do novo RAC): MBA, aniversários, projetos e guardados, vagas e notícias. Só buscam (não entram na Timeline).
   Reaproveitam o índice que a busca antiga já montava (js/sistema.js, buscaMontar com semBanco:true: sem registros, treinos nem produtos, que agora vêm dos provedores de banco), então nada se perde da busca de antes.
   Fonte: PESSOAL (a tabela pessoal, já carregada) e os arquivos vagas.json, noticias.json, tecdados.json e newsletter.json do site. Espaço: pessoal. PRIVADOS (só do dono, como antes). O índice vale 10 minutos nesta aba. Só LÊ. */
  var PV_MEM={t:0,p:null};
  function pvMemIndice(){var agora=Date.now();if(PV_MEM.p&&agora-PV_MEM.t<10*60e3)return PV_MEM.p;
    PV_MEM.t=agora;PV_MEM.p=precisa(["sistema"]).then(function(){return buscaMontar({semBanco:true})}).then(function(m){return m.idx});PV_MEM.p.catch(function(){PV_MEM.p=null});return PV_MEM.p}
  function pvMemProv(dominio,rotulo,categoria,tiposAntigos){provRegistrar({dominio:dominio,rotulo:rotulo,categoria:categoria,tipos:[],espaco:"pessoal",compartilhavel:false,exige:{dono:true},
    buscar:function(op){return pvMemIndice().then(function(idx){var out=[];
      for(var i=0;i<idx.length&&out.length<op.limite;i++){var x=idx[i];if(tiposAntigos.indexOf(x.tipo)<0||!x.href)continue;if(!op.termos.every(function(t){return x.txt.indexOf(t)>=0}))continue;
        out.push({id:dominio+":memoria:"+NUCLEO.bsNorm(x.t+"|"+x.href).replace(/[^a-z0-9]+/g,"_").slice(0,90),tipo:dominio+".item",titulo:x.t,resumo:x.sub||"",link:x.ext?(/^https:/.test(x.href)?x.href:"#busca"):x.href})}
      return {itens:out}})}})}
  pvMemProv("mba","MBA","estudos",["MBA"]);
  pvMemProv("aniversarios","Aniversários","familia",["Aniversário"]);
  pvMemProv("projetos","Projetos e guardados","projetos",["Projeto","Guardado"]);
  pvMemProv("vagas","Vagas","carreira",["Vaga"]);
  pvMemProv("noticias","Notícias","descoberta",["Notícia"]);
