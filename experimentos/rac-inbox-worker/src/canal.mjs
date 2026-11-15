// P7 · canal assinado Supabase → Worker. Autenticação ENTRE SERVIÇOS (separada da autenticação do usuário, que a função já fez).
// Assinatura: HMAC-SHA256 sobre uma "string canônica" que liga TUDO que importa: versão, método, caminho, chave, instante, nonce, operação e o hash do corpo.
//   canônica = rac-canal-v1 \n POST \n /v1/op \n <keyId> \n <timestamp> \n <nonce> \n <operacao> \n <sha256 hex do corpo>
// Cabeçalhos: X-RAC-Key-Id, X-RAC-Timestamp (segundos Unix), X-RAC-Nonce (base64url, 16 a 43 caracteres), X-RAC-Operacao, X-RAC-Assinatura (v1=<hex>).
// Ordem de defesa: formato → chave conhecida → janela de tempo → assinatura (comparação em tempo constante, pelo próprio subtle.verify) → SÓ ENTÃO o nonce é consumido
// (quem não assina nunca enche o registro) → só então o corpo é interpretado. Replay (mesmo nonce) = recusado; corpo/operação adulterados = assinatura inválida.
// Chaves: vêm de variáveis SECRETAS do Worker (RAC_CANAL_K1 e, na rotação, RAC_CANAL_K2); este arquivo nunca as lê do ambiente por conta própria e nunca as registra.
import { POLITICA } from "./politica.mjs";

export class ErroCanal extends Error {
  constructor(codigo) { super(codigo); this.codigo = codigo; }
}
// códigos fechados desta camada → HTTP
export const ERROS_CANAL = Object.freeze({
  cabecalhos_invalidos: 401, chave_desconhecida: 401, timestamp_fora_da_janela: 401, assinatura_invalida: 401, operacao_divergente: 400,
  replay: 409, registro_indisponivel: 503, canal_nao_configurado: 503,
});

const RE_CHAVE = /^k[1-9]$/, RE_TS = /^[1-9]\d{9,10}$/, RE_NONCE = /^[A-Za-z0-9_-]{16,43}$/, RE_OP = /^[a-z_]{1,40}$/, RE_ASSIN = /^v1=([0-9a-f]{64})$/;
const codificador = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const deHex = (s) => Uint8Array.from(s.match(/../g).map((h) => parseInt(h, 16)));

export async function sha256Hex(bytes) {
  return hex(await crypto.subtle.digest("SHA-256", bytes));
}

export function stringCanonica({ metodo, caminho, chave, timestamp, nonce, operacao, hashCorpo }, politica = POLITICA) {
  return [politica.canal.versao, metodo, caminho, chave, timestamp, nonce, operacao, hashCorpo].join("\n");
}

async function importarChave(segredo) {
  return crypto.subtle.importKey("raw", codificador.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

// usado pela função (lado Supabase) e pelos testes: assina um pedido
export async function assinar({ segredo, chave, timestamp, nonce, operacao, corpoBytes, metodo = "POST", caminho = POLITICA.canal.caminho }, politica = POLITICA) {
  const canonica = stringCanonica({ metodo, caminho, chave, timestamp: String(timestamp), nonce, operacao, hashCorpo: await sha256Hex(corpoBytes) }, politica);
  const assinatura = await crypto.subtle.sign("HMAC", await importarChave(segredo), codificador.encode(canonica));
  return "v1=" + hex(assinatura);
}

// Verifica a assinatura. `segredos`: { k1: "...", k2?: "..." } (do ambiente do Worker). `corpoBytes`: o corpo EXATO recebido. Lança ErroCanal com código fechado.
export async function verificarCanal({ request, corpoBytes, segredos, agoraS, politica = POLITICA }) {
  const h = (n) => request.headers.get(n);
  const chave = h("X-RAC-Key-Id"), ts = h("X-RAC-Timestamp"), nonce = h("X-RAC-Nonce"), operacao = h("X-RAC-Operacao"), assin = h("X-RAC-Assinatura");
  if (!segredos || typeof segredos !== "object") throw new ErroCanal("canal_nao_configurado");
  if (![chave, ts, nonce, operacao, assin].every((v) => typeof v === "string") || !RE_CHAVE.test(chave) || !RE_TS.test(ts) || !RE_NONCE.test(nonce) || !RE_OP.test(operacao) || !RE_ASSIN.test(assin)) throw new ErroCanal("cabecalhos_invalidos");
  const segredo = politica.canal.chavesAceitas.includes(chave) ? segredos[chave] : undefined;
  if (typeof segredo !== "string" || segredo.length < 32) throw new ErroCanal("chave_desconhecida");   // chave não aceita, ausente ou fraca (<32 caracteres)
  if (Math.abs(agoraS - Number(ts)) > politica.canal.janelaS) throw new ErroCanal("timestamp_fora_da_janela");
  const canonica = stringCanonica({ metodo: request.method, caminho: new URL(request.url).pathname, chave, timestamp: ts, nonce, operacao, hashCorpo: await sha256Hex(corpoBytes) }, politica);
  const ok = await crypto.subtle.verify("HMAC", await importarChave(segredo), deHex(assin.slice(3)), codificador.encode(canonica));
  if (!ok) throw new ErroCanal("assinatura_invalida");
  return { chave, timestamp: Number(ts), nonce, operacao };
}
