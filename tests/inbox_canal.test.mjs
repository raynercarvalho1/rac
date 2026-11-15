// RAC Inbox · P7 · o lado SUPABASE do canal assinado (supabase/functions/rac-inbox/canal.ts). TUDO SIMULADO: o Worker é uma função de mentira e o `fetch` é injetado.
// A prova de que a assinatura confere com a do Worker é o VETOR FIXO abaixo: o mesmo vetor está em tests/rac_inbox_worker.test.mjs (branch do Worker), calculado pelo código do Worker.
// Não prova a rede real, o runtime do Deno nem a Cloudflare.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { assinar, sha256Hex, stringCanonica, criarWorkerHttp, nonceAleatorio, VERSAO_CANAL } from "../supabase/functions/rac-inbox/canal.ts";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const SEGREDO = "segredo-de-teste-com-mais-de-32-caracteres-xx", USUARIO = "pessoa@icloud.example", SENHA = "abcd-efgh-ijkl-mnop", CONTA = "11111111-1111-4111-8111-111111111111";
const enc = new TextEncoder();

test("VETOR FIXO: a assinatura calculada aqui é idêntica à calculada pelo código do Worker (mesma string canônica, mesmo HMAC)", async () => {
  const corpo = enc.encode('{"operacao":"testar_conta","conta_id":"' + CONTA + '","usuario":"' + USUARIO + '","senha":"' + SENHA + '"}');
  assert.equal(await sha256Hex(corpo), "953526b63b4a251a51c93df228aae1c80d153ad5b91d525c8c9ab08a0299cf21");
  assert.equal(await assinar({ segredo: SEGREDO, chave: "k1", timestamp: 1763200000, nonce: "nonce00000000000001", operacao: "testar_conta", corpoBytes: corpo }), "v1=9bbc98131ab5d61532e849a6f46fbb1e0a7e414f731020a5354264160226b81b");
  assert.equal(stringCanonica({ metodo: "POST", caminho: "/v1/op", chave: "k1", timestamp: "1", nonce: "n", operacao: "o", hashCorpo: "h" }), VERSAO_CANAL + "\nPOST\n/v1/op\nk1\n1\nn\no\nh");
  assert.notEqual(await assinar({ segredo: SEGREDO, chave: "k1", timestamp: 1763200001, nonce: "nonce00000000000001", operacao: "testar_conta", corpoBytes: corpo }), "v1=9bbc98131ab5d61532e849a6f46fbb1e0a7e414f731020a5354264160226b81b", "o instante entra na assinatura");
  assert.notEqual(await assinar({ segredo: SEGREDO, chave: "k1", timestamp: 1763200000, nonce: "nonce00000000000001", operacao: "ler_mensagem", corpoBytes: corpo }), "v1=9bbc98131ab5d61532e849a6f46fbb1e0a7e414f731020a5354264160226b81b", "a operação entra na assinatura");
  assert.match(nonceAleatorio(), /^[A-Za-z0-9_-]{16,43}$/); assert.notEqual(nonceAleatorio(), nonceAleatorio());
});

function fetchFalso(responder) {
  const chamadas = [];
  return { chamadas, fn: async (url, init) => { chamadas.push({ url, init }); return responder(url, init); } };
}
const resposta = (corpo, status = 200) => new Response(typeof corpo === "string" ? corpo : JSON.stringify(corpo), { status });
const cfg = (extra = {}) => ({ url: "https://rac-inbox-worker.exemplo.workers.dev", segredo: SEGREDO, agoraS: () => 1763200000, nonce: () => "nonce00000000000001", ...extra });

test("pedido ao Worker: HTTPS, POST, sem seguir redirecionamento, cabeçalhos do canal, corpo com a operação e a credencial, assinatura que confere", async () => {
  const f = fetchFalso(() => resposta({ ok: true, operacao: "testar_conta", dados: { duracao_ms: 5 } }));
  const w = criarWorkerHttp(cfg({ fetchFn: f.fn }));
  const r = await w.executar("testar_conta", { conta_id: CONTA }, { usuario: USUARIO, senha: SENHA });
  assert.deepEqual(r, { ok: true, dados: { duracao_ms: 5 } });
  const { url, init } = f.chamadas[0];
  assert.equal(url, "https://rac-inbox-worker.exemplo.workers.dev/v1/op"); assert.equal(init.method, "POST"); assert.equal(init.redirect, "error", "a credencial nunca segue um redirecionamento");
  assert.ok(init.signal instanceof AbortSignal, "tem tempo limite");
  const h = init.headers;
  assert.deepEqual([h["X-RAC-Key-Id"], h["X-RAC-Timestamp"], h["X-RAC-Nonce"], h["X-RAC-Operacao"], h["Content-Type"]], ["k1", "1763200000", "nonce00000000000001", "testar_conta", "application/json"]);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(init.body)), { operacao: "testar_conta", conta_id: CONTA, usuario: USUARIO, senha: SENHA });
  assert.equal(h["X-RAC-Assinatura"], "v1=9bbc98131ab5d61532e849a6f46fbb1e0a7e414f731020a5354264160226b81b", "a assinatura é a do vetor fixo (corpo idêntico ao do vetor)");
  assert.equal(await assinar({ segredo: SEGREDO, chave: "k1", timestamp: 1763200000, nonce: h["X-RAC-Nonce"], operacao: "testar_conta", corpoBytes: init.body }), h["X-RAC-Assinatura"], "recalcular sobre o corpo enviado dá a mesma assinatura");
  assert.ok(!JSON.stringify(Object.values(h)).includes(SENHA) && !JSON.stringify(Object.values(h)).includes(USUARIO), "a credencial vai SÓ no corpo, nunca em cabeçalho nem na URL"); assert.ok(!url.includes(SENHA));
  // chamadas seguidas usam nonces diferentes (gerador padrão)
  const g = fetchFalso(() => resposta({ ok: true, dados: {} })), w2 = criarWorkerHttp({ url: cfg().url, segredo: SEGREDO, fetchFn: g.fn });
  await w2.executar("listar_pastas", { conta_id: CONTA }, { usuario: USUARIO, senha: SENHA }); await w2.executar("listar_pastas", { conta_id: CONTA }, { usuario: USUARIO, senha: SENHA });
  assert.notEqual(g.chamadas[0].init.headers["X-RAC-Nonce"], g.chamadas[1].init.headers["X-RAC-Nonce"], "nonce novo a cada chamada (anti-replay)");
});

test("configuração insegura = sem canal (null): URL sem HTTPS, com caminho, com credencial, chave curta ou identificador de chave inválido; k2 serve na rotação", async () => {
  for (const ruim of [null, undefined, { ...cfg(), url: "http://w.exemplo.com" }, { ...cfg(), url: "https://u:p@w.exemplo.com" }, { ...cfg(), url: "https://w.exemplo.com/outra" }, { ...cfg(), url: "https://w.exemplo.com/?x=1" }, { ...cfg(), url: "não é url" }, { ...cfg(), url: "" },
    { ...cfg(), segredo: "curto" }, { ...cfg(), segredo: undefined }, { ...cfg(), chave: "x1" }, { ...cfg(), chave: "k0" }]) assert.equal(criarWorkerHttp(ruim), null, JSON.stringify(ruim)?.slice(0, 60));
  const f = fetchFalso(() => resposta({ ok: true, dados: {} }));
  await criarWorkerHttp(cfg({ fetchFn: f.fn, chave: "k2" })).executar("testar_conta", { conta_id: CONTA }, { usuario: USUARIO, senha: SENHA });
  assert.equal(f.chamadas[0].init.headers["X-RAC-Key-Id"], "k2");
});

test("respostas do Worker: sucesso, erro de lista fechada e qualquer outra coisa (HTML, JSON ruim, grande demais, rede caída) viram falha SEM texto do servidor nem credencial", async () => {
  const exec = (resp, cfgExtra = {}) => criarWorkerHttp(cfg({ fetchFn: fetchFalso(resp).fn, ...cfgExtra })).executar("listar_pastas", { conta_id: CONTA }, { usuario: USUARIO, senha: SENHA });
  assert.deepEqual(await exec(() => resposta({ ok: true, dados: { pastas: [] } })), { ok: true, dados: { pastas: [] } });
  assert.deepEqual(await exec(() => resposta({ ok: false, erro: "autenticacao_recusada" }, 422)), { ok: false, erro: "autenticacao_recusada" });
  assert.deepEqual(await exec(() => resposta({ ok: false, erro: "assinatura_invalida" }, 401)), { ok: false, erro: "assinatura_invalida" });
  const falhas = [() => resposta("<html>erro</html>", 502), () => resposta("nao json " + SENHA, 200), () => resposta({ ok: false, erro: "Texto Livre " + SENHA }, 500), () => resposta({ ok: true }, 200), () => resposta({ ok: true, dados: [] }, 200),
    () => resposta({ ok: true, dados: {} }, 500), () => resposta("x".repeat(6291457)), () => { throw new Error("ECONNRESET " + SENHA + " " + USUARIO); }, () => Promise.reject(new TypeError("redirect mode is set to error: https://x/?s=" + SENHA))];
  for (const [i, ruim] of falhas.entries()) {
    const e = await exec(ruim).then(() => null, (x) => x);
    assert.ok(e instanceof Error, "falha " + i);
    assert.match(e.message, /^(canal_falhou|resposta_invalida|resposta_grande_demais)$/, "mensagem fixa, sem o conteúdo recebido (falha " + i + ")");
    assert.ok(!e.message.includes(SENHA) && !e.message.includes(USUARIO));
  }
});

test("canal.ts (texto): sem Deno, sem ambiente, sem registro, redirecionamento recusado, tempo limite e nenhuma credencial fora do corpo", () => {
  const t = ler("supabase/functions/rac-inbox/canal.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
  assert.ok(!/Deno|console\.|process\.env|localStorage|service_role|SERVICE_ROLE/.test(t));
  assert.match(t, /redirect: "error"/); assert.match(t, /AbortSignal\.timeout\(/); assert.match(t, /protocol !== "https:"/); assert.match(t, /segredo\.length < 32/);
  const cab = t.slice(t.indexOf("headers: {"), t.indexOf("}", t.indexOf("headers: {")));
  assert.ok(!/senha|usuario|credencial/.test(cab), "nenhuma credencial nos cabeçalhos");
  assert.equal((t.match(/\bfetch\(/g) || []).length, 1, "um único ponto de rede");
  const idx = ler("supabase/functions/rac-inbox/index.ts"); assert.match(idx, /RAC_INBOX_WORKER_URL/); assert.match(idx, /RAC_CANAL_K1/); assert.ok(!/RAC_CANAL_K1["']\)\s*[,;]?\s*\n?\s*console/.test(idx));
});
