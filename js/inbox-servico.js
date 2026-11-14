/* Dia a Dia RAC — módulo carregado sob demanda pelo Inbox (MOD_DEPS). Cliente do serviço de e-mail (RAC Inbox · I1; docs/inbox.md, "Camada de integração").
   Caminho: navegador → Edge Function "rac-inbox" (Supabase, autentica o dono e resolve a credencial NO SERVIDOR) → Worker isolado (OIDC, pin e uso único).
   O navegador só manda a operação e os IDs: NUNCA usuário, senha, token ou código do provedor (NUCLEO.inbPedido recusa), e nunca recebe segredo.
   Só operações de LEITURA existem (testar_conta, listar_pastas, estado_pasta); verbo de escrita é recusado antes de qualquer rede.
   INBS.publicado é false enquanto a Edge Function não for publicada e a custódia da credencial (P7) não for decidida: nada é simulado, o pedido volta
   com o código "servico_nao_publicado". Toda falha volta como código fechado (INB_ERROS), nunca como texto do servidor. */
  var INBS={publicado:false,funcao:"rac-inbox"};
  function inboxStatusErro(status){return status===401||status===403?"sem_login":status===404?"servico_nao_publicado":status===429?"limite":"servico_indisponivel"}
  function inboxChamar(operacao,entrada){
    var v=NUCLEO.inbPedido(operacao,entrada);
    if(!v.ok)return Promise.resolve({ok:false,erro:v.erro});
    if(!INBS.publicado)return Promise.resolve({ok:false,erro:"servico_nao_publicado"});
    return SB.functions.invoke(INBS.funcao,{body:v.pedido}).then(function(r){
      if(r&&r.error){var c=r.error.context,st=c&&typeof c.status==="number"?c.status:0;return {ok:false,erro:st?inboxStatusErro(st):"rede"}}
      return operacao==="estado_pasta"?NUCLEO.inbRespostaEstado(r&&r.data):{ok:!!(r&&r.data&&r.data.ok===true),dados:null,erro:r&&r.data&&r.data.ok===true?null:"resposta_invalida"}},
      function(){return {ok:false,erro:"rede"}})}
