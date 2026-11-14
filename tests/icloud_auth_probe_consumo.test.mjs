// RAC Inbox · POC autenticada iCloud — registro de USO ÚNICO (proteção contra replay): lógica de consumo, expiração, limpeza e a classe do Durable Object.
// Usa o SQLite REAL do Node (node:sqlite) no lugar do SQLite do Durable Object: prova a lógica transacional (inserir se ausente, atômico), mas NÃO prova o runtime
// da Cloudflare. A prova no runtime publicado é a execução "validar_uso_unico" do workflow (Documento 10, seção 13.19). Sem rede e sem credencial.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { POLITICA } from "../experimentos/icloud-auth-probe/src/politica.mjs";
import { consumirChave, prepararTabela, chaveDeConsumo, ConsumoUnico, pedirConsumo, ErroConsumo } from "../experimentos/icloud-auth-probe/src/consumo.mjs";

const T0 = 1_800_000_000;
const RET = POLITICA.consumo.retencaoChaveS;

function sqlDe(db) {
  return {
    exec(consulta, ...valores) {
      if (/^\s*CREATE/i.test(consulta)) { db.exec(consulta); return { toArray: () => [] }; }
      const linhas = db.prepare(consulta).all(...valores);
      return { toArray: () => linhas };
    },
  };
}
function novoBanco() { const db = new DatabaseSync(":memory:"); const sql = sqlDe(db); prepararTabela(sql); return { db, sql }; }
const consumo = (sql, chave, t, jti = "jti-" + chave) => consumirChave(sql, { chave, jti, agoraS: t, retencaoS: RET });

test("retenção mínima: 24 horas", () => {
  assert.ok(RET >= 86400);
});

test("consumirChave: a primeira chamada consome; a repetição da mesma chave é recusada; chaves diferentes não se afetam", () => {
  const { sql } = novoBanco();
  assert.equal(consumo(sql, "1:1:p1_imap", T0), true);
  assert.equal(consumo(sql, "1:1:p1_imap", T0 + 1, "outro-jti-xx"), false, "mesma chave, jti diferente");
  assert.equal(consumo(sql, "1:1:p1_imap", T0), false, "mesmo instante");
  assert.equal(consumo(sql, "1:2:p1_imap", T0), true, "outra tentativa");
  assert.equal(consumo(sql, "2:1:p1_imap", T0), true, "outra execução");
  assert.equal(consumo(sql, "1:1:validar_uso_unico", T0), true, "outra operação");
});

test("expiração e limpeza preguiçosa: nada ainda dentro da retenção é removido; só o que passou dela é apagado, e só ao consumir", () => {
  const { db, sql } = novoBanco();
  assert.equal(consumo(sql, "10:1:p1_imap", T0), true);
  assert.equal(consumo(sql, "11:1:p1_imap", T0 + 3600), true);
  // dentro da retenção a chave segue consumida e NADA é limpo
  assert.equal(consumo(sql, "10:1:p1_imap", T0 + RET - 1), false);
  assert.equal(consumo(sql, "10:1:p1_imap", T0 + RET), false, "no instante exato da expiração ainda vale (a limpeza só apaga expira_em < agora)");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM consumo").get().n, 2, "nenhum registro válido foi removido");
  // 1 s depois a primeira expirou; a segunda (consumida 1 h depois) ainda NÃO
  assert.equal(consumo(sql, "12:1:p1_imap", T0 + RET + 1), true);
  assert.deepEqual(db.prepare("SELECT chave FROM consumo ORDER BY chave").all().map((l) => l.chave), ["11:1:p1_imap", "12:1:p1_imap"], "só a vencida foi apagada");
  assert.equal(consumo(sql, "11:1:p1_imap", T0 + RET + 1), false, "a que ainda está na retenção continua bloqueada");
  assert.equal(consumo(sql, "10:1:p1_imap", T0 + RET + 2), true, "depois da retenção a chave volta a ser consumível (um token dessa execução já seria inválido há horas)");
});

test("o relógio andando para trás nunca apaga nem libera um registro válido", () => {
  const { sql } = novoBanco();
  assert.equal(consumo(sql, "20:1:p1_imap", T0), true);
  assert.equal(consumo(sql, "20:1:p1_imap", T0 - 5000), false);
  assert.equal(consumo(sql, "21:1:p1_imap", T0 - 100000), true);
  assert.equal(consumo(sql, "20:1:p1_imap", T0 + 10), false);
});

test("chaveDeConsumo: run_id:run_attempt:operacao, com normalização e recusa de valores inválidos", () => {
  assert.equal(chaveDeConsumo({ run_id: "26600000001", run_attempt: "2" }, "p1_imap"), "26600000001:2:p1_imap");
  assert.equal(chaveDeConsumo({ run_id: 26600000001, run_attempt: 2 }, "p1_imap"), "26600000001:2:p1_imap");
  for (const ruim of [{}, { run_id: "x", run_attempt: "1" }, { run_id: "1", run_attempt: "0" }, { run_id: "1" }, { run_attempt: "1" }])
    assert.throws(() => chaveDeConsumo(ruim, "p1_imap"), ErroConsumo);
  assert.throws(() => chaveDeConsumo({ run_id: "1", run_attempt: "1" }, undefined), ErroConsumo);
});

// ---------- a classe do Durable Object ----------

function novoObjeto(opcoes = {}) {
  const db = new DatabaseSync(":memory:");
  const relogio = { t: T0 };
  const state = { storage: { sql: sqlDe(db), transactionSync: (fn) => fn() } };
  return { db, relogio, obj: new ConsumoUnico(state, {}, { agora: () => relogio.t, ...opcoes }) };
}
const pedido = (obj, corpo, metodo = "POST") => obj.fetch(new Request("https://consumo.interno/consumir", metodo === "POST" ? { method: "POST", body: typeof corpo === "string" ? corpo : JSON.stringify(corpo) } : { method: metodo }));
const lerJson = async (r) => ({ status: r.status, corpo: await r.json() });

test("DO: 20 chamadas simultâneas com a MESMA chave — exatamente uma consome", async () => {
  const { obj } = novoObjeto();
  const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => pedido(obj, { chave: "30:1:p1_imap", jti: "jti-concorrente-" + i }).then(lerJson)));
  assert.ok(rs.every((r) => r.status === 200));
  assert.equal(rs.filter((r) => r.corpo.consumido === true).length, 1);
  assert.equal(rs.filter((r) => r.corpo.consumido === false).length, 19);
});

test("DO: 50 chaves distintas simultâneas — todas consomem, uma vez cada; repetir todas depois recusa todas", async () => {
  const { obj, db } = novoObjeto();
  const chaves = Array.from({ length: 50 }, (_, i) => String(40 + i) + ":1:validar_uso_unico");
  const a = await Promise.all(chaves.map((chave, i) => pedido(obj, { chave, jti: "jti-distinto-" + i }).then(lerJson)));
  assert.ok(a.every((r) => r.corpo.consumido === true));
  const b = await Promise.all(chaves.map((chave, i) => pedido(obj, { chave, jti: "jti-repetido-" + i }).then(lerJson)));
  assert.ok(b.every((r) => r.corpo.consumido === false));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM consumo").get().n, 50);
});

test("DO: o registro guarda só chave, jti e instantes (auditoria), nunca o token, a senha ou outro dado", async () => {
  const { obj, db } = novoObjeto();
  await pedido(obj, { chave: "50:1:p1_imap", jti: "jti-auditoria-1" });
  const linhas = db.prepare("SELECT * FROM consumo").all();
  assert.deepEqual(linhas.map((l) => ({ ...l })), [{ chave: "50:1:p1_imap", jti: "jti-auditoria-1", consumido_em: T0, expira_em: T0 + RET }]);
  assert.deepEqual(db.prepare("PRAGMA table_info(consumo)").all().map((c) => c.name), ["chave", "jti", "consumido_em", "expira_em"]);
});

test("DO: entrada inválida é recusada com 400 sem gravar nada (campos extras, formatos, não JSON, método)", async () => {
  const { obj, db } = novoObjeto();
  const ruins = [
    "{nao json", "[]", "null", {}, { chave: "1:1:p1_imap" }, { jti: "jti-valido-1" },
    { chave: "1:1:p1_imap", jti: "jti-valido-1", senha: "x" }, { chave: "01:1:p1_imap", jti: "jti-valido-1" }, { chave: "1:0:p1_imap", jti: "jti-valido-1" },
    { chave: "1:1:P1", jti: "jti-valido-1" }, { chave: "1:1:p1_imap; DROP", jti: "jti-valido-1" }, { chave: "a:1:p1_imap", jti: "jti-valido-1" }, { chave: "1:1:p1_imap", jti: "curto" },
    { chave: "1:1:p1_imap", jti: "com espaço no jti" }, { chave: 1, jti: "jti-valido-1" }, { chave: "1:1:p1_imap", jti: ["jti-valido-1"] },
  ];
  for (const corpo of ruins) { const r = await lerJson(await pedido(obj, corpo)); assert.equal(r.status, 400, JSON.stringify(corpo)); assert.deepEqual(r.corpo, { erro: "entrada_invalida" }); }
  assert.equal((await pedido(obj, null, "GET")).status, 405);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM consumo").get().n, 0);
});

test("DO: erro interno vira 500 sem detalhes (o Worker trata como falha fechada)", async () => {
  const state = { storage: { sql: { exec: () => ({ toArray: () => [] }) }, transactionSync: () => { throw new Error("SEGREDO interno"); } } };
  const obj = new ConsumoUnico(state, {}, {});
  const r = await obj.fetch(new Request("https://consumo.interno/consumir", { method: "POST", body: JSON.stringify({ chave: "1:1:p1_imap", jti: "jti-valido-1" }) }));
  assert.equal(r.status, 500);
  const texto = await r.text();
  assert.ok(!texto.includes("SEGREDO"));
});

test("pedirConsumo: usa sempre o objeto único nomeado pela política e só aceita { consumido: boolean }", async () => {
  const { obj } = novoObjeto();
  const nomes = [];
  const ns = { idFromName: (n) => { nomes.push(n); return n; }, get: () => ({ fetch: (u, i) => obj.fetch(new Request(u, i)) }) };
  assert.equal(await pedirConsumo(ns, { chave: "60:1:p1_imap", jti: "jti-pedido-1" }), true);
  assert.equal(await pedirConsumo(ns, { chave: "60:1:p1_imap", jti: "jti-pedido-2" }), false);
  assert.deepEqual([...new Set(nomes)], [POLITICA.consumo.objeto], "um único objeto: é ele quem serializa");
  await assert.rejects(() => pedirConsumo({}, { chave: "1:1:p1_imap", jti: "jti-valido-1" }), (e) => e.codigo === "consumo_nao_configurado");
  await assert.rejects(() => pedirConsumo(null, { chave: "1:1:p1_imap", jti: "jti-valido-1" }), (e) => e.codigo === "consumo_nao_configurado");
});

test("o Worker só dispõe de UM mecanismo de exclusão: nada de KV, cache ou variável no módulo de consumo", async () => {
  const fs = await import("node:fs");
  const fonte = fs.readFileSync(new URL("../experimentos/icloud-auth-probe/src/consumo.mjs", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");
  for (const x of [/\bKV\b/, /\bcaches\b/, /\bglobalThis\b/, /\bMap\(/, /\bnew Set\(/, /localStorage/, /console/]) assert.ok(!x.test(fonte), "não deve usar: " + x);
});
