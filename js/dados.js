/* Dia a Dia RAC — camada de dados (Fase 2, A1; docs/planejamento/02-auditoria-arquitetural.md, seções 8 e 9). Carregada em toda página,
   antes de mercado.js e de js/app.js. Um cliente só do Supabase para o site inteiro (login, Mercado, Lista, fila sem internet e todos os
   módulos), a leitura paginada e o erro do banco num formato só. Não esconde o Supabase: quem precisa usa o próprio cliente (SB.from,
   SB.rpc, SB.storage, SB.auth). O endereço e a chave abaixo são os públicos (publishable), feitos para ficar no site; a segurança vem do
   RLS. window.RACmercado.client, .url e .chave continuam como apelidos destes (compatibilidade). */
  var DADOS_URL="https://hofnhbxnfebfnncwxrds.supabase.co",DADOS_CHAVE="sb_publishable_kpEqdxunDeIbStJrgxrngg_tNPv6VTL";
  var DADOS_SUPA_JS="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js",DADOS_PAGINA=1000;
  /* criados conta quantas vezes createClient rodou (o teste exige 1, mesmo com pedidos simultâneos antes da biblioteca chegar) */
  var DADOS={cliente:null,pedido:null,criados:0};
  function dadosScript(src){return new Promise(function(ok,erro){
    var s=document.createElement("script");s.src=src;s.onload=function(){ok()};s.onerror=function(){erro(new Error("não carregou "+src))};document.head.appendChild(s)})}
  /* o cliente único: a sessão continua na mesma chave do aparelho ("rac-mercado-auth"), então ninguém precisa entrar de novo */
  function dadosCliente(){
    if(DADOS.cliente)return Promise.resolve(DADOS.cliente);
    if(DADOS.pedido)return DADOS.pedido;
    DADOS.pedido=(window.supabase?Promise.resolve():dadosScript(DADOS_SUPA_JS)).then(function(){
      if(!DADOS.cliente){DADOS.cliente=window.supabase.createClient(DADOS_URL,DADOS_CHAVE,{ auth: { persistSession: true, autoRefreshToken: true, storageKey: "rac-mercado-auth", experimental: { passkey: true } } });DADOS.criados++}
      DADOS.pedido=null;return DADOS.cliente},function(e){DADOS.pedido=null;throw e});
    return DADOS.pedido}
  /* erro do banco num formato só: a mesma mensagem de sempre (quem já mostra e.message não muda) e o código do Postgres/PostgREST quando vem */
  function dadosErro(e){var x=new Error(e&&e.message);if(e&&e.code)x.code=e.code;return x}
  /* resposta do Supabase → dados, ou lança o erro padronizado (o nome sbOk é o de sempre, usado pelos módulos) */
  function sbOk(r){if(r.error)throw dadosErro(r.error);return r.data}
  /* leitura paginada: consulta(de) devolve a consulta já com .range(de,de+999); junta as páginas até vir uma incompleta */
  function dadosPaginar(consulta){var acc=[];
    function pag(de){return Promise.resolve().then(function(){return consulta(de)}).then(sbOk).then(function(l){acc=acc.concat(l);return l.length===DADOS_PAGINA?pag(de+DADOS_PAGINA):acc})}
    return pag(0)}
  window.RACdados={url:DADOS_URL,chave:DADOS_CHAVE,cliente:dadosCliente,paginar:dadosPaginar,ok:sbOk,erro:dadosErro,PAGINA:DADOS_PAGINA,
    /* só para os testes automáticos: quantos clientes foram criados */
    _criados:function(){return DADOS.criados}};
