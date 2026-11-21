// RAC Inbox · I4 lote 4 · GERENCIAR mensagens do Gmail e do Outlook (marcar lida/não lida, arquivar, Lixeira, Spam, mover, verificar): os verbos que organizar.ts já usa com o Worker do iCloud,
// agora nos adaptadores gmail.ts e outlook.ts. Provedores de MENTIRA: nada vai ao Google nem à Microsoft. TUDO FICTÍCIO.
import { test } from "node:test";
import assert from "node:assert/strict";
import { criarWorkerGmail, rotulosDaAcao } from "../supabase/functions/rac-inbox/gmail.ts";

const ACESSO = "ya29.acesso-ficticio-0123456789";
const hex = (n) => n.toString(16).padStart(16, "0");
const ENTRADA = { dono: "d", conta: "c" };

/* ---------- Gmail de mentira (leitura e escrita) ---------- */
function gmailFalso() {
  const msgs = new Map(), chamadas = []; let falha = null;
  const r = (status, corpo) => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });
  const http = async (url, init = {}) => {
    const metodo = init.method ?? "GET"; chamadas.push({ metodo, url, corpo: init.body ? JSON.parse(init.body) : null });
    if (falha) { const f = falha(metodo, url); if (f instanceof Error) throw f; if (f) return r(f.status, f.corpo ?? {}); }
    if ((init.headers || {}).Authorization !== "Bearer " + ACESSO) return r(401, { error: {} });
    const p = new URL(url).pathname.replace("/gmail/v1/users/me/", ""), m = /^messages\/([0-9a-f]+)(?:\/(modify|trash|untrash))?$/.exec(p);
    const msg = m && msgs.get(m[1]); if (!msg) return r(404, {});
    if (m[2] && metodo !== "POST") return r(405, {});
    if (m[2] === "modify") { const b = JSON.parse(init.body); msg.labelIds = msg.labelIds.filter((x) => !(b.removeLabelIds || []).includes(x)); for (const x of b.addLabelIds || []) if (!msg.labelIds.includes(x)) msg.labelIds.push(x); return r(200, { id: msg.id, labelIds: msg.labelIds }); }
    if (m[2] === "trash") { msg.labelIds = ["TRASH"]; return r(200, { id: msg.id, labelIds: msg.labelIds }); }
    if (m[2] === "untrash") { msg.labelIds = msg.labelIds.filter((x) => x !== "TRASH").concat(["INBOX"]); return r(200, { id: msg.id, labelIds: msg.labelIds }); }
    return r(200, { id: msg.id, labelIds: msg.labelIds, payload: { headers: [{ name: "Message-ID", value: msg.mid }] } });
  };
  return { msgs, chamadas, http, falha: (f) => { falha = f; }, add: (n, rot = ["INBOX", "UNREAD"]) => { const m = { id: hex(n), labelIds: rot, mid: `<m${n}@mail.example>` }; msgs.set(m.id, m); return m; } };
}
const repoFalso = { pastaIdPorNome: async (_d, _c, nome) => "p-" + nome, idsExternos: async () => new Map(), maiorUid: async () => 0, idExterno: async (_d, _c, _p, uid) => (uid >= 1 && uid <= 9 ? hex(uid) : null) };
const workerGmail = (cx) => criarWorkerGmail({ acesso: ACESSO, http: cx.http, banco: repoFalso, ...ENTRADA });
const base = { uid: 1, uidvalidity_esperado: 1 };

test("rotulosDaAcao: arquivar tira a entrada, spam/entrada trocam de rótulo, rótulo de usuário vai para o Arquivo tirando também a entrada", () => {
  assert.deepEqual(rotulosDaAcao("INBOX", "ARQUIVO"), { adicionar: [], remover: ["INBOX"] });
  assert.deepEqual(rotulosDaAcao("INBOX", "SPAM"), { adicionar: ["SPAM"], remover: ["INBOX"] });
  assert.deepEqual(rotulosDaAcao("SPAM", "INBOX"), { adicionar: ["INBOX"], remover: ["SPAM"] });
  assert.deepEqual(rotulosDaAcao("Label_7", "ARQUIVO"), { adicionar: [], remover: ["Label_7", "INBOX"] });
  assert.deepEqual(rotulosDaAcao("ARQUIVO", "INBOX"), { adicionar: ["INBOX"], remover: [] });
  assert.deepEqual(rotulosDaAcao("INBOX", "Label_7"), { adicionar: ["Label_7"], remover: ["INBOX"] });
});

test("Gmail · marcar_lida liga e desliga UNREAD e confirma o estado; uid e uidvalidity são conferidos", async () => {
  const cx = gmailFalso(); cx.add(1); const w = workerGmail(cx);
  const a = await w.executar("marcar_lida", { ...base, pasta: "INBOX", lida: true }); assert.deepEqual([a.ok, a.dados.resultado, a.dados.lida], [true, "aplicada", true]); assert.ok(!cx.msgs.get(hex(1)).labelIds.includes("UNREAD"));
  const b = await w.executar("marcar_lida", { ...base, pasta: "INBOX", lida: false }); assert.deepEqual([b.ok, b.dados.lida], [true, false]); assert.ok(cx.msgs.get(hex(1)).labelIds.includes("UNREAD"));
  assert.equal((await w.executar("marcar_lida", { ...base, uidvalidity_esperado: 2, pasta: "INBOX", lida: true })).erro, "uidvalidity_mudou");
  assert.equal((await w.executar("marcar_lida", { ...base, uid: 99, pasta: "INBOX", lida: true })).erro, "mensagem_inexistente");
});

test("Gmail · mover_mensagem: arquivar, Spam, mover para rótulo, Lixeira (trash) e sair da Lixeira (untrash); verificar_mensagem acompanha a pasta de origem", async () => {
  const cx = gmailFalso(); cx.add(1); cx.add(2); cx.add(3); cx.add(4, ["TRASH"]); const w = workerGmail(cx);
  assert.equal((await w.executar("verificar_mensagem", { ...base, pasta: "INBOX" })).dados.existe, true);
  const ar = await w.executar("mover_mensagem", { ...base, pasta: "INBOX", destino: "ARQUIVO" }); assert.deepEqual([ar.ok, ar.dados.resultado], [true, "aplicada"]); assert.deepEqual(cx.msgs.get(hex(1)).labelIds, ["UNREAD"]);
  assert.deepEqual([(await w.executar("verificar_mensagem", { ...base, pasta: "INBOX" })).dados.existe, (await w.executar("verificar_mensagem", { ...base, pasta: "ARQUIVO" })).dados.existe], [false, true]);
  await w.executar("mover_mensagem", { uid: 2, uidvalidity_esperado: 1, pasta: "INBOX", destino: "SPAM" }); assert.deepEqual(cx.msgs.get(hex(2)).labelIds.sort(), ["SPAM", "UNREAD"]);
  await w.executar("mover_mensagem", { uid: 3, uidvalidity_esperado: 1, pasta: "INBOX", destino: "TRASH" }); assert.deepEqual(cx.msgs.get(hex(3)).labelIds, ["TRASH"]); assert.ok(cx.chamadas.some((c) => c.url.endsWith("messages/" + hex(3) + "/trash")), "Lixeira pelo endpoint trash");
  await w.executar("mover_mensagem", { uid: 4, uidvalidity_esperado: 1, pasta: "TRASH", destino: "INBOX" }); assert.deepEqual(cx.msgs.get(hex(4)).labelIds, ["INBOX"]);
  assert.equal((await w.executar("mover_mensagem", { ...base, uid: 2, pasta: "SPAM", destino: "SPAM" })).erro, "acao_recusada", "mesma pasta");
  assert.equal((await w.executar("mover_mensagem", { ...base, pasta: "INBOX", destino: "../x" })).erro, "pasta_inexistente", "o nome do destino é validado antes de ir à URL");
});

test("Gmail · a identidade da mensagem é conferida (Message-ID); 401 = autenticação recusada; 4xx = acao_recusada; rede ou 5xx depois do POST = acao_incerta; nunca DELETE", async () => {
  const cx = gmailFalso(); cx.add(1); const w = workerGmail(cx);
  assert.equal((await w.executar("marcar_lida", { ...base, pasta: "INBOX", lida: true, message_id_esperado: "<outra@mail.example>" })).erro, "identidade_divergente"); assert.ok(cx.msgs.get(hex(1)).labelIds.includes("UNREAD"), "nada foi alterado");
  assert.equal((await w.executar("marcar_lida", { ...base, pasta: "INBOX", lida: true, message_id_esperado: "<m1@mail.example>" })).ok, true);
  for (const [f, esperado] of [[{ status: 401, corpo: { error: { message: "SEGREDO-GOOGLE" } } }, "autenticacao_recusada"], [{ status: 400, corpo: {} }, "acao_recusada"], [{ status: 503, corpo: {} }, "acao_incerta"], [new Error("SEGREDO-DE-REDE"), "acao_incerta"]]) {
    cx.falha((m) => (m === "POST" ? f : null)); const r = await w.executar("mover_mensagem", { ...base, pasta: "INBOX", destino: "ARQUIVO" }); assert.deepEqual([r.ok, r.erro], [false, esperado]); assert.ok(!JSON.stringify(r).includes("SEGREDO"));
  }
  cx.falha(null); assert.ok(!cx.chamadas.some((c) => c.metodo === "DELETE" || /batchDelete|\/delete/i.test(c.url)), "nenhum caminho apaga de vez");
});
