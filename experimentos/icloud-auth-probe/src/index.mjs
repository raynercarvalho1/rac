// Ponto de entrada do Worker temporário da POC autenticada iCloud (arquitetura S3).
// Valida o JWT OIDC do GitHub Actions, registra o USO ÚNICO da operação no Durable Object (proteção contra replay) e, só então, executa:
// validar_oidc (ensaio sem efeito), validar_uso_unico (prova sintética, sem credencial), p1_imap (autenticação IMAP somente leitura) e p2_imap
// (leitura controlada de uma mensagem da pasta de teste, somente leitura).
// A credencial da P1 e da P2 chega no corpo de cada chamada, vive só em memória durante ela e não é guardada, registrada nem devolvida.
// É o ÚNICO arquivo que importa "cloudflare:sockets" (o socket TLS do IMAP). A lógica testável está em rotas.mjs, imap.mjs e consumo.mjs.
import { connect } from "cloudflare:sockets";
import { POLITICA } from "./politica.mjs";
import { verificarJwt } from "./jwt.mjs";
import { criarProvedorChaves } from "./jwks.mjs";
import { tratar } from "./rotas.mjs";
import { pedirConsumo } from "./consumo.mjs";
import { executarP1 } from "./imap.mjs";
import { executarP2 } from "./mensagem.mjs";

export { ConsumoUnico } from "./consumo.mjs";

// TLS implícito na porta 993; o host vem sempre da política (nunca do cliente)
async function abrirSocket(host, porta) {
  const socket = connect({ hostname: host, port: porta }, { secureTransport: "on", allowHalfOpen: false });
  await socket.opened;
  return socket;
}

// o provedor de chaves vive no escopo do módulo: o cache do JWKS dura enquanto o isolate durar
const agora = () => Math.floor(Date.now() / 1000);
const provedor = criarProvedorChaves({ fetchFn: (u, o) => fetch(u, o), agora, politica: POLITICA });
const verificar = (token) => verificarJwt(token, { obterChave: provedor, agora, politica: POLITICA });

export default {
  fetch(request, ambiente) {
    return tratar(request, {
      verificar,
      consumir: (dados) => pedirConsumo(ambiente && ambiente.CONSUMO, dados, POLITICA),
      executarP1: (credencial) => executarP1({ abrir: abrirSocket, usuario: credencial.usuario, senha: credencial.senha, politica: POLITICA }),
      executarP2: (dados) => executarP2({ abrir: abrirSocket, usuario: dados.usuario, senha: dados.senha, uid: dados.uid, politica: POLITICA }),
    });
  },
};
