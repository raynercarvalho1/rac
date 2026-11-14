// Registro de USO ÚNICO (proteção contra replay): Durable Object com SQLite, objeto único e nomeado.
// Por que um Durable Object: ele processa uma requisição por vez e o SQLite dele é transacional, então "inserir se ainda não existe" é atômico
// mesmo com chamadas simultâneas vindas de qualquer ponto do mundo. Cache em memória do isolate e KV (consistência eventual, sem
// comparar-e-gravar) NÃO servem como exclusão mútua e não são usados aqui.
// O que se grava: só a chave run_id:run_attempt:operacao, o jti (auditoria) e dois instantes. Nunca token, senha, usuário nem conteúdo de e-mail.
// O Worker consome ANTES de executar a operação: falha, tempo esgotado ou resposta estranha do objeto = a operação NÃO acontece (falha fechada).
import { POLITICA, DETALHES_CONSUMO } from "./politica.mjs";
import { idNumerico } from "./jwt.mjs";

const CRIAR = "CREATE TABLE IF NOT EXISTS consumo (chave TEXT PRIMARY KEY, jti TEXT NOT NULL, consumido_em INTEGER NOT NULL, expira_em INTEGER NOT NULL) WITHOUT ROWID";
const FORMATO_CHAVE = /^[1-9][0-9]{0,19}:[1-9][0-9]{0,3}:[a-z][a-z0-9_]{0,39}$/;
const FORMATO_JTI = /^[A-Za-z0-9._:-]{8,128}$/;

export class ErroConsumo extends Error {
  constructor(codigo) {
    super(codigo);
    this.codigo = codigo;
  }
}

// chave de uso único: a execução do workflow (run_id + run_attempt) e a operação. Vários tokens da mesma execução dão a MESMA chave.
export function chaveDeConsumo(claims, operacao) {
  const runId = idNumerico(claims && claims.run_id, 20);
  const tentativa = idNumerico(claims && claims.run_attempt, 4);
  if (!runId || !tentativa || typeof operacao !== "string") throw new ErroConsumo("consumo_falha");
  return runId + ":" + tentativa + ":" + operacao;
}

// Lógica pura, testável: recebe um objeto com exec(consulta, ...valores) -> { toArray() } (o storage.sql do Durable Object).
// Limpeza preguiçosa: só apaga o que JÁ passou da retenção (expira_em < agora); nada ainda válido é removido.
// Devolve true se ESTA chamada consumiu a chave e false se ela já existia.
export function consumirChave(sql, { chave, jti, agoraS, retencaoS }) {
  sql.exec("DELETE FROM consumo WHERE expira_em < ?", agoraS);
  const inseridas = sql.exec(
    "INSERT INTO consumo (chave, jti, consumido_em, expira_em) VALUES (?, ?, ?, ?) ON CONFLICT(chave) DO NOTHING RETURNING chave",
    chave, jti, agoraS, agoraS + retencaoS,
  ).toArray();
  return inseridas.length === 1;
}

export function prepararTabela(sql) {
  sql.exec(CRIAR);
}

function resposta(status, corpo) {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

// Durable Object (forma clássica, sem importar nada de "cloudflare:"): só aceita POST com { chave, jti } bem formados.
export class ConsumoUnico {
  constructor(state, _env, opcoes = {}) {
    this.state = state;
    this.sql = state.storage.sql;
    this.agora = opcoes.agora || (() => Math.floor(Date.now() / 1000));
    this.retencaoS = opcoes.retencaoS || POLITICA.consumo.retencaoChaveS;
    prepararTabela(this.sql);
  }

  async fetch(request) {
    try {
      if (request.method !== "POST") return resposta(405, { erro: "metodo" });
      let dados;
      try { dados = await request.json(); } catch (_) { return resposta(400, { erro: "entrada_invalida" }); }
      if (dados === null || typeof dados !== "object" || Object.keys(dados).sort().join(",") !== "chave,jti"
        || typeof dados.chave !== "string" || !FORMATO_CHAVE.test(dados.chave) || typeof dados.jti !== "string" || !FORMATO_JTI.test(dados.jti)) {
        return resposta(400, { erro: "entrada_invalida" });
      }
      // a leitura do relógio e o SQL abaixo são síncronos: nenhuma outra requisição entra no meio
      const consumido = this.state.storage.transactionSync(() => consumirChave(this.sql, { chave: dados.chave, jti: dados.jti, agoraS: this.agora(), retencaoS: this.retencaoS }));
      return resposta(200, { consumido });
    } catch (_) {
      return resposta(500, { erro: "falha" });
    }
  }
}

// Lado do Worker: pede o consumo ao objeto único. Devolve true/false; QUALQUER problema lança ErroConsumo com código de lista fechada.
export async function pedirConsumo(namespace, dados, politica = POLITICA) {
  if (!namespace || typeof namespace.idFromName !== "function" || typeof namespace.get !== "function") throw new ErroConsumo("consumo_nao_configurado");
  let temporizador;
  const limite = new Promise((_, rejeita) => { temporizador = setTimeout(() => rejeita(new ErroConsumo("consumo_timeout")), politica.consumo.timeoutMs); });
  limite.catch(() => {});
  try {
    const stub = namespace.get(namespace.idFromName(politica.consumo.objeto));
    const pedido = Promise.resolve(stub.fetch("https://consumo.interno/consumir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chave: dados.chave, jti: dados.jti }) }));
    pedido.catch(() => {});
    const resp = await Promise.race([pedido, limite]);
    if (!resp || resp.status !== 200) throw new ErroConsumo("consumo_resposta_invalida");
    const corpo = await Promise.race([resp.json(), limite]);
    if (corpo === null || typeof corpo !== "object" || Object.keys(corpo).join(",") !== "consumido" || typeof corpo.consumido !== "boolean") throw new ErroConsumo("consumo_resposta_invalida");
    return corpo.consumido;
  } catch (erro) {
    if (erro instanceof ErroConsumo && DETALHES_CONSUMO.includes(erro.codigo)) throw erro;
    throw new ErroConsumo("consumo_falha");
  } finally {
    clearTimeout(temporizador);
  }
}
