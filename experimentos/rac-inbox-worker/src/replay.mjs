// P7 · proteção contra REPLAY do canal: registro de nonces de USO ÚNICO num Durable Object com SQLite (mesma ideia comprovada em experimentos/icloud-auth-probe/src/consumo.mjs).
// Por que um Durable Object: processa uma requisição por vez e o SQLite é transacional, então "inserir se ainda não existe" é atômico mesmo com chamadas simultâneas.
// KV (consistência eventual, sem comparar-e-gravar) e cache em memória NÃO servem como exclusão mútua e não são usados.
// Grava só o nonce e dois instantes (nunca assinatura, corpo, usuário, senha ou conteúdo). Falha ou resposta estranha do registro = a operação NÃO acontece (falha fechada).
import { POLITICA } from "./politica.mjs";
import { ErroCanal } from "./canal.mjs";

const CRIAR = "CREATE TABLE IF NOT EXISTS nonces (nonce TEXT PRIMARY KEY, visto_em INTEGER NOT NULL, expira_em INTEGER NOT NULL) WITHOUT ROWID";
const FORMATO_NONCE = /^[A-Za-z0-9_-]{16,43}$/;

// Lógica pura e testável: `sql` tem exec(consulta, ...valores) → { toArray() }. Devolve true se ESTA chamada registrou o nonce; false se ele já existia.
export function registrarNonce(sql, { nonce, agoraS, retencaoS }) {
  sql.exec("DELETE FROM nonces WHERE expira_em < ?", agoraS);   // só apaga o que JÁ passou da retenção
  const novas = sql.exec("INSERT INTO nonces (nonce, visto_em, expira_em) VALUES (?, ?, ?) ON CONFLICT(nonce) DO NOTHING RETURNING nonce", nonce, agoraS, agoraS + retencaoS).toArray();
  return novas.length === 1;
}
export const prepararNonces = (sql) => sql.exec(CRIAR);

const resposta = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export class NonceUnico {
  constructor(state, _env, opcoes = {}) {
    this.state = state; this.sql = state.storage.sql;
    this.agora = opcoes.agora || (() => Math.floor(Date.now() / 1000));
    this.retencaoS = opcoes.retencaoS || POLITICA.canal.nonceRetencaoS;
    prepararNonces(this.sql);
  }
  async fetch(request) {
    try {
      if (request.method !== "POST") return resposta(405, { erro: "metodo" });
      let d; try { d = await request.json(); } catch (_) { return resposta(400, { erro: "entrada_invalida" }); }
      if (d === null || typeof d !== "object" || Object.keys(d).join(",") !== "nonce" || typeof d.nonce !== "string" || !FORMATO_NONCE.test(d.nonce)) return resposta(400, { erro: "entrada_invalida" });
      const novo = this.state.storage.transactionSync(() => registrarNonce(this.sql, { nonce: d.nonce, agoraS: this.agora(), retencaoS: this.retencaoS }));
      return resposta(200, { novo });
    } catch (_) { return resposta(500, { erro: "falha" }); }
  }
}

// Lado do Worker: true = nonce novo (pode seguir); false = replay. Qualquer outro problema lança ErroCanal("registro_indisponivel"): a operação não acontece.
export async function consumirNonce(namespace, nonce, timeoutMs = 3000) {
  if (!namespace || typeof namespace.idFromName !== "function" || typeof namespace.get !== "function") throw new ErroCanal("registro_indisponivel");
  let t; const limite = new Promise((_, rej) => { t = setTimeout(() => rej(new ErroCanal("registro_indisponivel")), timeoutMs); }); limite.catch(() => {});
  try {
    const stub = namespace.get(namespace.idFromName("nonces-v1"));
    const pedido = Promise.resolve(stub.fetch("https://registro.interno/nonce", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nonce }) })); pedido.catch(() => {});
    const r = await Promise.race([pedido, limite]);
    if (!r || r.status !== 200) throw new ErroCanal("registro_indisponivel");
    const c = await Promise.race([r.json(), limite]);
    if (c === null || typeof c !== "object" || Object.keys(c).join(",") !== "novo" || typeof c.novo !== "boolean") throw new ErroCanal("registro_indisponivel");
    return c.novo;
  } catch (_) { throw new ErroCanal("registro_indisponivel"); } finally { clearTimeout(t); }
}
