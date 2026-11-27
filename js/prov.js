/* Dia a Dia RAC — provedores da Timeline e da Busca global (Lote 3 do novo RAC; docs/planejamento/15, seções 1, 2 e 5). Módulo leve, sem tela, carregado sob demanda (MOD_DEPS).
   Princípio (N-07): cada módulo continua DONO do próprio dado. Quem agrega (Timeline, Busca, widget timeline.recente) pede ao módulo, por um PROVEDOR registrado em js/prov-<dominio>.js:
     provRegistrar({dominio, rotulo, categoria, categorias, tipos, espaco:"pessoal"|"casa", compartilhavel, exige:{dono}, lerJanela, lerProximos, buscar})
       lerJanela({de, ate, cursor, limite, filtros, hoje})  → {eventos:[…], esgotado}   eventos já em ordem (quando, id) do mais novo ao mais antigo, só "quando <= cursor.quando"
       lerProximos({ate, limite, hoje})                      → {eventos:[…]}                o que está AGENDADO (futuro), em ordem de data
       buscar({termos, texto, limite, filtros})              → {itens:[…]}                  resultados leves da busca (nunca cópias do registro)
   Todos leem com a SESSÃO de quem vê (RLS é a autoridade); nada aqui usa chave de serviço, cache compartilhado ou tabela de cópia. O orquestrador abaixo dá a cada provedor um tempo-limite, isola a falha de
   um (resultado "parcial", os outros seguem), confere cada evento pelo contrato (NUCLEO.tlEvento), IMPÕE o espaço e a origem (o provedor não escolhe), nunca roda provedor privado em espaço compartilhado
   e mescla por (quando, id) com cursor por provedor (NUCLEO.tlMesclar). Só LÊ. */
  var PROV={defs:{},ordem:[]},PROV_TEMPO=8000;
  var PROV_ESPACOS=["pessoal","casa"];
  function provRegistrar(def){var er=[];
    if(!def||typeof def!=="object")return false;
    if(typeof def.dominio!=="string"||!/^[a-z0-9_]{2,30}$/.test(def.dominio))er.push("dominio inválido");
    if(typeof def.rotulo!=="string"||!def.rotulo)er.push("rotulo ausente");
    if(NUCLEO.TL_CATEGORIAS.indexOf(def.categoria)<0)er.push("categoria desconhecida");
    if(PROV_ESPACOS.indexOf(def.espaco)<0)er.push("espaco deve ser pessoal ou casa");
    if(typeof def.compartilhavel!=="boolean")er.push("compartilhavel deve ser true ou false (saúde, e-mail e agenda pessoal são false)");
    if(!def.lerJanela&&!def.buscar&&!def.lerProximos)er.push("sem lerJanela, lerProximos nem buscar");
    ["lerJanela","lerProximos","buscar"].forEach(function(k){if(def[k]!==undefined&&typeof def[k]!=="function")er.push(k+" deve ser função")});
    if(er.length){try{console.warn("provedor recusado: "+(def&&def.dominio)+" · "+er.join("; "))}catch(e){}return false}
    if(!PROV.defs[def.dominio])PROV.ordem.push(def.dominio);
    def.categorias=def.categorias&&def.categorias.length?def.categorias:[def.categoria];def.tipos=def.tipos||[];PROV.defs[def.dominio]=def;return true}
  function provLista(){return PROV.ordem.map(function(k){return PROV.defs[k]})}
  /* quem é quem: dono (papel), em que tipo de espaço a leitura acontece ("compartilhado" corta tudo que é privado), e os espaços da pessoa (para dar id real ao "pessoal" e à "casa") */
  function provContexto(e){e=e||{};return {dono:typeof isOwner==="function"?isOwner():false,tipoEspaco:e.tipoEspaco||null,espacos:e.espacos||[]}}
  /* a regra de privacidade do provedor, a mesma do catálogo de widgets (NUCLEO.wsPodeUsarTipo): privado nunca roda em espaço compartilhado; "só do dono" exige o dono */
  function provPodeUsar(def,ctx){if(ctx.tipoEspaco==="compartilhado"&&def.compartilhavel!==true)return false;if(def.exige&&def.exige.dono&&!ctx.dono)return false;return true}
  function provUsaveis(ctx,metodo){return provLista().filter(function(d){return typeof d[metodo]==="function"&&provPodeUsar(d,ctx)})}
  /* "pessoal" e "casa" viram o id do espaço real da pessoa (rac_iniciar_espacos), quando há */
  function provEspacoIds(espacos){var o={pessoal:"pessoal",casa:"casa"};(espacos||[]).forEach(function(e){if(e.tipo==="pessoal")o.pessoal=e.id;else if(e.casa)o.casa=e.id});return o}
  /* um erro sem conteúdo do registro: só o que a pessoa precisa para entender (e nunca o texto cru do banco) */
  function provMsgErro(e){var m=String(e&&e.message||e||"");
    if(/demorou demais/.test(m))return "demorou demais";if(/row-level security|42501|permission denied|mfa/i.test(m))return "sem acesso";if(/fetch|network|rede|offline/i.test(m))return "sem conexão";return "não respondeu"}
  function provTempo(p,ms){var tmo;return Promise.race([p,new Promise(function(_,no){tmo=setTimeout(function(){no(new Error("demorou demais"))},ms)})]).then(function(r){clearTimeout(tmo);return r},function(e){clearTimeout(tmo);throw e})}
  /* o provedor só entra se o filtro de categoria/tipo pode dar evento dele */
  function provRelevante(d,f){f=f||{};if(f.categorias&&f.categorias.length&&!d.categorias.some(function(c){return f.categorias.indexOf(c)>=0}))return false;
    if(f.tipos&&f.tipos.length&&d.tipos.length&&!d.tipos.some(function(t){return f.tipos.indexOf(t)>=0}))return false;return true}
  function provNormalizar(d,esp,raw,extra){var out=[],inv=0;
    (raw||[]).forEach(function(x){var v=NUCLEO.tlEvento(Object.assign({categoria:d.categoria},x,{espaco:esp[d.espaco]||d.espaco,origem:d.rotulo},extra||{}));if(v.ok)out.push(v.evento);else inv++});
    return {eventos:out,invalidos:inv}}
  /* LÊ UMA JANELA: op = {de, ate, cursores, limite, filtros, provedores, tipoEspaco, espacos, tempo}. Devolve {eventos, cursores, esgotados, falhas, parcial, sobrou, temMais, ms}. */
  function provJanela(op){op=op||{};
    var hoje=hojeISO(),ctx=provContexto(op),limite=Math.max(1,Math.min(200,op.limite||40)),tempo=op.tempo||PROV_TEMPO,cur=op.cursores||{},esp=provEspacoIds(op.espacos),f=op.filtros||{},t0=Date.now(),
      de=op.de||"",ate=op.ate||hoje,listas={},brutas={},esgot={},falhas=[],invalidos=0,
      defs=provUsaveis(ctx,"lerJanela").filter(function(d){return (!op.provedores||op.provedores.indexOf(d.dominio)>=0)&&provRelevante(d,f)});
    return Promise.all(defs.map(function(d){var c=cur[d.dominio]||null;
      return provTempo(Promise.resolve().then(function(){return d.lerJanela({de:de,ate:ate,cursor:c,limite:limite+(c?(c.vistos||[]).length:0),filtros:f,hoje:hoje})}),tempo).then(function(r){
        var n=provNormalizar(d,esp,r&&r.eventos);invalidos+=n.invalidos;
        var ev=NUCLEO.tlCursorFiltrar(NUCLEO.tlOrdenar(n.eventos),c).filter(function(e){var dia=NUCLEO.tlDia(e.quando);return (!de||dia>=de)&&dia<=ate});
        brutas[d.dominio]=ev;esgot[d.dominio]=!!(r&&r.esgotado)},function(e){falhas.push({dominio:d.dominio,rotulo:d.rotulo,erro:provMsgErro(e)});try{logErro("timeline "+d.dominio,e)}catch(x){}})})).then(function(){
      var filtrados={};Object.keys(brutas).forEach(function(k){filtrados[k]=NUCLEO.tlFiltrar(brutas[k],{categorias:f.categorias,tipos:f.tipos,espacos:f.espacos,pessoas:f.pessoas,comAnexo:f.comAnexo,pendentes:f.pendentes,texto:f.texto})});
      var m=NUCLEO.tlMesclar(filtrados,cur,limite),usados={};m.eventos.forEach(function(e){usados[e.id]=1});
      var esgotados={},temMais=m.sobrou>0;
      Object.keys(filtrados).forEach(function(k){var tudo=filtrados[k].every(function(e){return usados[e.id]});
        /* se tudo o que passou no filtro foi entregue, o cursor vai até o fim da página lida (o que o filtro descartou não precisa ser lido de novo; sem isto um filtro que descarta tudo nunca avançaria) */
        if(tudo&&brutas[k].length)m.cursores[k]=NUCLEO.tlCursorAvancar(cur[k]||null,brutas[k]);
        esgotados[k]=!!esgot[k]&&tudo;if(!esgotados[k])temMais=true});
      /* quem falhou continua com o cursor de antes e ainda "tem mais": uma nova tentativa o relê */
      falhas.forEach(function(x){temMais=true;esgotados[x.dominio]=false;m.cursores[x.dominio]=cur[x.dominio]||null});
      return {eventos:m.eventos,cursores:m.cursores,esgotados:esgotados,falhas:falhas,invalidos:invalidos,parcial:falhas.length>0,sobrou:m.sobrou,temMais:temMais,provedores:defs.map(function(d){return d.dominio}),ms:Date.now()-t0}})}
  /* O QUE ESTÁ AGENDADO: op = {ate, limite, provedores, tipoEspaco, espacos, tempo}; eventos futuros (marcados futuro:true), do mais próximo ao mais distante */
  function provProximos(op){op=op||{};var hoje=hojeISO(),ctx=provContexto(op),esp=provEspacoIds(op.espacos),tempo=op.tempo||PROV_TEMPO,limite=op.limite||50,
      ate=op.ate||NUCLEO.somaDiasISO(hoje,30),all=[],falhas=[],f=op.filtros||{},
      defs=provUsaveis(ctx,"lerProximos").filter(function(d){return (!op.provedores||op.provedores.indexOf(d.dominio)>=0)&&provRelevante(d,f)});
    return Promise.all(defs.map(function(d){return provTempo(Promise.resolve().then(function(){return d.lerProximos({ate:ate,limite:limite,hoje:hoje})}),tempo).then(function(r){
        all=all.concat(provNormalizar(d,esp,r&&r.eventos,{futuro:true}).eventos)},function(e){falhas.push({dominio:d.dominio,rotulo:d.rotulo,erro:provMsgErro(e)});try{logErro("timeline "+d.dominio,e)}catch(x){}})})).then(function(){
      var l=NUCLEO.tlFiltrar(NUCLEO.tlDeduplicar(all),f).filter(function(e){var dia=NUCLEO.tlDia(e.quando);return dia>=hoje&&dia<=ate});
      return {eventos:NUCLEO.tlOrdenar(l,true).slice(0,limite),falhas:falhas,parcial:falhas.length>0}})}
  /* resultado leve da busca: confere o que o provedor devolveu (id, título e link válidos) e impõe domínio, origem e espaço */
  function provResultado(d,esp,x){if(!x||typeof x!=="object")return null;var t=String(x.titulo==null?"":x.titulo).replace(/\s+/g," ").trim().slice(0,160),l=String(x.link||"");
    if(!t||!x.id||(l.charAt(0)!=="#"&&!/^https:\/\//.test(l)))return null;
    return {id:String(x.id).slice(0,160),dominio:d.dominio,origem:d.rotulo,tipo:String(x.tipo||d.dominio+".item"),titulo:t,resumo:String(x.resumo==null?"":x.resumo).replace(/\s+/g," ").trim().slice(0,200),quando:x.quando?String(x.quando):"",
      espaco:esp[d.espaco]||d.espaco,link:l,externo:/^https:/.test(l),anexo:!!x.anexo,acao:x.acao||null,categoria:x.categoria||d.categoria}}
  /* BUSCA: op = {texto, filtros:{dominios, espacos, tipos}, limite (por provedor), tempo, tipoEspaco, espacos}. Texto com menos de 2 letras úteis não consulta ninguém. Devolve {itens, termos, falhas, parcial, ms}. */
  function provBuscar(op){op=op||{};var termos=NUCLEO.bsTermos(op.texto),f=op.filtros||{},ctx=provContexto(op),esp=provEspacoIds(op.espacos),tempo=op.tempo||6000,limite=Math.max(1,Math.min(50,op.limite||12)),t0=Date.now(),itens=[],falhas=[],
      defs=provUsaveis(ctx,"buscar").filter(function(d){if(f.dominios&&f.dominios.length&&f.dominios.indexOf(d.dominio)<0)return false;if(f.espacos&&f.espacos.length){var id=esp[d.espaco]||d.espaco;if(f.espacos.indexOf(id)<0)return false}return true});
    if(!termos.length)return Promise.resolve({itens:[],termos:termos,falhas:[],parcial:false,provedores:[],ms:0,curta:true});
    return Promise.all(defs.map(function(d){return provTempo(Promise.resolve().then(function(){return d.buscar({termos:termos,texto:op.texto,limite:limite,filtros:f})}),tempo).then(function(r){
        ((r&&r.itens)||[]).slice(0,limite).forEach(function(x){var v=provResultado(d,esp,x);if(v&&(!f.tipos||!f.tipos.length||f.tipos.indexOf(v.tipo)>=0))itens.push(v)})},
        function(e){falhas.push({dominio:d.dominio,rotulo:d.rotulo,erro:provMsgErro(e)});try{logErro("busca "+d.dominio,e)}catch(x){}})})).then(function(){
      var vistos={};itens=itens.filter(function(x){var k=x.dominio+"|"+x.id;if(vistos[k])return false;vistos[k]=1;return true});
      return {itens:itens,termos:termos,falhas:falhas,parcial:falhas.length>0,provedores:defs.map(function(d){return d.dominio}),ms:Date.now()-t0}})}
  /* busca no banco sem extensão nem índice novo: cada termo vira uma expressão regular que ignora acento e maiúscula (NUCLEO.bsRegex, operador ~* do Postgres via PostgREST "imatch"), e todos os
     termos precisam aparecer (um ".or()" por termo = E entre termos, OU entre colunas). Quem lê é a sessão da pessoa: o RLS continua decidindo o que existe para ela. */
  function provFiltroBusca(q,colunas,termos){(termos||[]).forEach(function(t){var re=NUCLEO.bsRegex(t);q=q.or(colunas.map(function(c){return c+'.imatch."'+re+'"'}).join(","))});return q}
  /* AAAA-MM-DD do cursor, para o "<=" do banco (o descarte exato do que já foi entregue é do orquestrador) */
  function provDiaDoCursor(cursor,ate){return cursor?NUCLEO.tlDia(cursor.quando):ate}
