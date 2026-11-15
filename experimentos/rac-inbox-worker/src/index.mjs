// Ponto de entrada do Worker de produto do RAC Inbox (P7/I2). Só liga as peças ao runtime: o socket TLS do IMAP, o ambiente (secrets do canal e o Durable Object) e o relógio.
// É o ÚNICO arquivo que importa "cloudflare:sockets". Não lê nem registra credencial; não usa KV, D1 nem R2; nenhuma variável com a senha existe.
import { connect } from "cloudflare:sockets";
import { tratar, executarOperacao } from "./rotas.mjs";
import { consumirNonce } from "./replay.mjs";

export { NonceUnico } from "./replay.mjs";

// TLS implícito na porta 993; o host vem sempre da política (nunca do cliente)
async function abrirSocket(host, porta) {
  const socket = connect({ hostname: host, port: porta }, { secureTransport: "on", allowHalfOpen: false });
  await socket.opened;
  return socket;
}

export default {
  fetch(request, ambiente) {
    return tratar(request, {
      // as chaves do canal vêm só dos secrets do Worker (RAC_CANAL_K1 e, na rotação, RAC_CANAL_K2): nunca do corpo, de cabeçalho ou de código
      segredos: ambiente ? { k1: ambiente.RAC_CANAL_K1, k2: ambiente.RAC_CANAL_K2 } : null,
      agora: () => Math.floor(Date.now() / 1000),
      consumir: (nonce) => consumirNonce(ambiente && ambiente.NONCES, nonce),
      executar: executarOperacao({ abrir: abrirSocket }),
    });
  },
};
