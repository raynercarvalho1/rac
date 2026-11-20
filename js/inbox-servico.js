/* Dia a Dia RAC — módulo carregado sob demanda pelo Inbox (MOD_DEPS). Cliente do serviço de e-mail (RAC Inbox · I1; docs/inbox.md, "Custódia da credencial" e "Camada de integração").
   Caminho: navegador → função "rac-inbox" (Supabase, autentica o dono, guarda e lê a credencial no Vault) → Worker isolado (OIDC, pin, uso único) → provedor.
   A credencial (login do ID Apple + senha ESPECÍFICA DE APP) é enviada UMA vez, por HTTPS e com a sessão do dono, só na operação "credencial_guardar" (que também substitui), e
   NUNCA mais volta ao navegador: nenhuma resposta a traz, e este arquivo não a guarda, não a registra e não a repassa a nenhum outro lugar. As demais operações levam só IDs.
   Só existem operações de LEITURA, de custódia da credencial, o envio (I3) e o gerenciamento de UMA mensagem por vez (I3.2, "organizar_mensagem"); verbo solto de escrita (mover, excluir, expunge…) é recusado antes de qualquer rede (NUCLEO.inbPedido).
   I2: também sincroniza uma pasta (o servidor grava o cache de cabeçalhos), lê UMA mensagem e baixa UM anexo, sob demanda; o corpo e o anexo chegam em memória e NÃO ficam guardados em lugar nenhum.
   INBS.publicado é true desde 15/11/2026 (função rac-inbox publicada em produção, versão 1, verify_jwt=true). Se a função faltar (404) ou a flag voltar a false, nada é simulado: o pedido volta com "servico_nao_publicado".
   Toda falha volta como código fechado (INB_ERROS), nunca como texto do servidor. */
  var INBS={publicado:true,funcao:"rac-inbox"};
  function inboxStatusErro(status){return status===401||status===403?"sem_login":status===404?"servico_nao_publicado":status===429?"limite":"servico_indisponivel"}
  /* o corpo de um erro HTTP da função é {ok:false,erro:<código>}: só o código conhecido passa; o resto cai no código do status */
  function inboxCodigoDoErro(contexto,status){
    var padrao=inboxStatusErro(status);
    if(!contexto||typeof contexto.json!=="function")return Promise.resolve(padrao);
    return Promise.resolve().then(function(){return contexto.json()}).then(function(j){return j&&typeof j.erro==="string"&&NUCLEO.INB_ERROS[j.erro]?j.erro:padrao},function(){return padrao})}
  function inboxResposta(operacao,d){
    if(!d||d.ok!==true)return {ok:false,erro:d&&typeof d.erro==="string"&&NUCLEO.INB_ERROS[d.erro]?d.erro:"resposta_invalida"};
    if(operacao==="estado_pasta")return NUCLEO.inbRespostaEstado(d);
    if(operacao==="testar_canal")return NUCLEO.inbRespostaCanal(d);
    if(operacao==="listar_pastas")return NUCLEO.inbRespostaPastas(d);
    if(operacao==="sincronizar_pasta")return NUCLEO.inbRespostaSincronizacao(d);
    if(operacao==="ler_mensagem")return NUCLEO.inbRespostaLeitura(d);
    if(operacao==="baixar_anexo")return NUCLEO.inbRespostaAnexo(d);
    if(operacao==="enviar_mensagem")return NUCLEO.inbRespostaEnvio(d);
    if(operacao==="smtp_prova")return NUCLEO.inbRespostaProva(d);
    if(operacao==="organizar_mensagem")return NUCLEO.inbRespostaOrganizacao(d);
    if(operacao==="oauth_iniciar")return typeof d.url==="string"&&/^https:\/\/(accounts\.google\.com|login\.microsoftonline\.com)\//.test(d.url)?{ok:true,url:d.url,provedor:d.provedor==="outlook"?"outlook":"gmail"}:{ok:false,erro:"resposta_invalida"};   /* só a URL do provedor: nunca outro destino */
    if(operacao==="oauth_concluir")return d.conectada===true?{ok:true,conectada:true,provedor:d.provedor==="outlook"?"outlook":"gmail"}:{ok:false,erro:"resposta_invalida"};
    if(operacao==="credencial_estado")return {ok:true,credencial:d.credencial==="ativa"||d.credencial==="invalida"?d.credencial:"ausente"};
    if(operacao==="credencial_guardar")return {ok:true,credencial:"guardada"};
    if(operacao==="credencial_remover")return {ok:true,removida:d.removida===true};
    return {ok:true}}
  function inboxChamar(operacao,entrada){
    var v=NUCLEO.inbPedido(operacao,entrada);
    if(!v.ok)return Promise.resolve({ok:false,erro:v.erro});
    if(!INBS.publicado)return Promise.resolve({ok:false,erro:"servico_nao_publicado"});
    return SB.functions.invoke(INBS.funcao,{body:v.pedido}).then(function(r){
      if(r&&r.error){var c=r.error.context,st=c&&typeof c.status==="number"?c.status:0;
        return st?inboxCodigoDoErro(c,st).then(function(cod){return {ok:false,erro:cod}}):{ok:false,erro:"rede"}}
      return inboxResposta(operacao,r&&r.data)},
      function(){return {ok:false,erro:"rede"}})}
