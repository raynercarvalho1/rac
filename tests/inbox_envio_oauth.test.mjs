// RAC Inbox · I4 lote 4 · ENVIAR pelo Gmail e pelo Outlook (verbo `enviar`, o mesmo que envio.ts usa com o Worker do iCloud): MIME do Gmail, resposta encadeada, resultado incerto nunca confundido com falha.
// Provedores de MENTIRA: nada vai ao Google nem à Microsoft. TUDO FICTÍCIO (só endereços @example.*).
import { test } from "node:test";
import assert from "node:assert/strict";
import { criarWorkerGmail, montarMime } from "../supabase/functions/rac-inbox/gmail.ts";

const ACESSO = "ya29.acesso-ficticio-0123456789";
const ENTRADA = { dono: "d", conta: "c" }, repoFalso = { pastaIdPorNome: async () => "p", idsExternos: async () => new Map(), maiorUid: async () => 0, idExterno: async () => null };
const decB64u = (t) => Buffer.from(t, "base64url").toString("utf8");
const PEDIDO = { de: "eu@example.com", para: ["ana@example.com"], cc: [], cco: [], assunto: "Reunião às 15h", texto: "Olá,\nnos vemos amanhã.\n", message_id: "<e1@example.com>", data: "2026-11-21T14:00:00Z" };
const cabecalhos = (mime) => Object.fromEntries(mime.split("\r\n\r\n")[0].replace(/\r\n /g, " ").split("\r\n").map((l) => [l.slice(0, l.indexOf(":")).toLowerCase(), l.slice(l.indexOf(":") + 1).trim()]));
const palavra = (v) => v.replace(/=\?UTF-8\?B\?([^?]*)\?=\s*/g, (_m, b) => Buffer.from(b, "base64").toString("utf8"));

test("montarMime: cabeçalhos, assunto com acento em palavra codificada, corpo em base64 com linhas de até 76 e \\r\\n, Bcc só quando há, In-Reply-To e References só em resposta", () => {
  const m = montarMime({ ...PEDIDO, cco: ["oculta@example.com"], cc: ["bia@example.com", "caio@example.com"] }), c = cabecalhos(m);
  assert.deepEqual([c.from, c.to, c.cc, c.bcc, c["message-id"], c["mime-version"], c["content-type"], c["content-transfer-encoding"]], ["eu@example.com", "ana@example.com", "bia@example.com, caio@example.com", "oculta@example.com", "<e1@example.com>", "1.0", "text/plain; charset=UTF-8", "base64"]);
  assert.equal(palavra(c.subject), "Reunião às 15h"); assert.equal(c.date, "Sat, 21 Nov 2026 14:00:00 +0000"); assert.ok(!("in-reply-to" in c) && !("references" in c));
  const corpo = m.split("\r\n\r\n")[1]; assert.equal(Buffer.from(corpo.replace(/\r\n/g, ""), "base64").toString("utf8"), "Olá,\r\nnos vemos amanhã.\r\n", "o texto vai com \\r\\n"); assert.ok(corpo.split("\r\n").every((l) => l.length <= 76));
  const semBcc = cabecalhos(montarMime(PEDIDO)); assert.ok(!("bcc" in semBcc) && !("cc" in semBcc));
  const r = cabecalhos(montarMime({ ...PEDIDO, em_resposta_a: "<orig@mail.example>", referencias: ["<a@mail.example>", "<orig@mail.example>"] })); assert.deepEqual([r["in-reply-to"], r.references], ["<orig@mail.example>", "<a@mail.example> <orig@mail.example>"]);
});
test("montarMime: assunto longo com acentos é dividido em palavras codificadas de até 75 caracteres sem partir letras; quebras de linha no assunto viram espaço; assunto simples fica como está", () => {
  const longo = "Ação ".repeat(60).trim(), c = montarMime({ ...PEDIDO, assunto: longo }).split("\r\n\r\n")[0];
  assert.ok(c.split("\r\n").every((l) => l.length <= 78), "nenhuma linha passa do limite do cabeçalho"); assert.equal(palavra(cabecalhos(montarMime({ ...PEDIDO, assunto: longo })).subject), longo);
  assert.equal(palavra(cabecalhos(montarMime({ ...PEDIDO, assunto: "linha1\r\nBcc: x@example.com" })).subject), "linha1 Bcc: x@example.com"); assert.ok(!("bcc" in cabecalhos(montarMime({ ...PEDIDO, assunto: "a\r\nBcc: x@example.com" }))), "injeção de cabeçalho barrada");
  assert.equal(cabecalhos(montarMime({ ...PEDIDO, assunto: "Simples" })).subject, "Simples");
});

/* ---------- Gmail de mentira (só o que o envio usa) ---------- */
function gmailEnvio(resp = {}) {
  const chamadas = []; let falha = null;
  const r = (status, corpo) => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });
  const http = async (url, init = {}) => {
    const metodo = init.method ?? "GET"; chamadas.push({ metodo, url, corpo: init.body ? JSON.parse(init.body) : null });
    if (falha) { const f = falha(metodo, url); if (f instanceof Error) throw f; if (f) return r(f.status, f.corpo ?? {}); }
    if ((init.headers || {}).Authorization !== "Bearer " + ACESSO) return r(401, { error: {} });
    const u = new URL(url);
    if (metodo === "POST" && u.pathname.endsWith("/messages/send")) return r(200, { id: "abc123", threadId: "T9", labelIds: ["SENT"] });
    if (metodo === "GET" && u.pathname.endsWith("/messages")) return r(200, resp.busca ?? {});
    return r(404, {});
  };
  return { chamadas, http, falha: (f) => { falha = f; }, envios: () => chamadas.filter((c) => c.metodo === "POST") };
}
const workerGmail = (cx) => criarWorkerGmail({ acesso: ACESSO, http: cx.http, banco: repoFalso, ...ENTRADA });

test("Gmail · enviar: mensagem nova vai em raw (base64url do MIME), sem threadId, e a resposta é só 'enviado'", async () => {
  const cx = gmailEnvio(), w = workerGmail(cx), r = await w.executar("enviar", PEDIDO);
  assert.deepEqual([r.ok, r.dados], [true, { resultado: "enviado" }]); const e = cx.envios(); assert.equal(e.length, 1); assert.ok(!("threadId" in e[0].corpo));
  const mime = decB64u(e[0].corpo.raw), c = cabecalhos(mime); assert.deepEqual([c.to, palavra(c.subject)], ["ana@example.com", "Reunião às 15h"]); assert.ok(!JSON.stringify(r).includes("abc123"), "o ID do Gmail não sai");
});
test("Gmail · responder: acha a conversa pelo Message-ID e envia com threadId e In-Reply-To; se não achar, envia mesmo assim (sem threadId)", async () => {
  const cx = gmailEnvio({ busca: { messages: [{ id: "aaa111", threadId: "T7" }] } }), w = workerGmail(cx);
  const r = await w.executar("enviar", { ...PEDIDO, em_resposta_a: "<orig@mail.example>", referencias: ["<orig@mail.example>"] }); assert.equal(r.ok, true);
  assert.ok(cx.chamadas.some((c) => c.metodo === "GET" && decodeURIComponent(c.url).includes("rfc822msgid:orig@mail.example")), "a busca usa o Message-ID sem < >");
  const e = cx.envios()[0].corpo; assert.equal(e.threadId, "T7"); assert.equal(cabecalhos(decB64u(e.raw))["in-reply-to"], "<orig@mail.example>");
  const sem = gmailEnvio({ busca: {} }), r2 = await workerGmail(sem).executar("enviar", { ...PEDIDO, em_resposta_a: "<nao@mail.example>" }); assert.equal(r2.ok, true);
  const e2 = sem.envios()[0].corpo; assert.ok(!("threadId" in e2)); assert.equal(cabecalhos(decB64u(e2.raw))["in-reply-to"], "<nao@mail.example>");
});
test("Gmail · enviar: endereço inválido é recusado ANTES de qualquer chamada; 400 = envio_recusado; 401 = smtp_autenticacao_recusada; rede, timeout e 5xx depois do pedido = envio_incerto", async () => {
  const cx = gmailEnvio(), w = workerGmail(cx);
  assert.deepEqual([(await w.executar("enviar", { ...PEDIDO, para: ["ana@example.com", "lixo sem arroba"] })).erro, cx.chamadas.length], ["destinatario_invalido", 0]);
  assert.equal((await w.executar("enviar", { ...PEDIDO, para: ["a@example.com>\r\nBcc: x@example.com"] })).erro, "destinatario_invalido", "injeção por endereço barrada");
  for (const [f, esperado] of [[{ status: 400, corpo: { error: { message: "SEGREDO-GOOGLE" } } }, "envio_recusado"], [{ status: 401, corpo: {} }, "smtp_autenticacao_recusada"], [{ status: 503, corpo: {} }, "envio_incerto"], [{ status: 429, corpo: {} }, "envio_incerto"], [new Error("SEGREDO-DE-REDE"), "envio_incerto"]]) {
    cx.falha((m) => (m === "POST" ? f : null)); const r = await w.executar("enviar", PEDIDO); assert.deepEqual([r.ok, r.erro], [false, esperado]); assert.ok(!JSON.stringify(r).includes("SEGREDO"));
  }
});

/* ---------- Outlook / Graph de mentira (só o que o envio usa) ---------- */
import { criarWorkerOutlook } from "../supabase/functions/rac-inbox/outlook.ts";
function graphEnvio({ original = "AAMk-Orig=" } = {}) {
  const chamadas = []; let falha = null;
  const r = (status, corpo, vazio = false) => ({ ok: status >= 200 && status < 300, status, json: async () => { if (vazio) throw new Error("sem corpo"); return corpo; } });
  const http = async (url, init = {}) => {
    const metodo = init.method ?? "GET", p = decodeURIComponent(new URL(url).pathname.replace("/v1.0/me/", "")); chamadas.push({ metodo, p, url: decodeURIComponent(url), corpo: init.body ? JSON.parse(init.body) : null });
    if (falha) { const f = falha(metodo, p); if (f instanceof Error) throw f; if (f) return r(f.status, f.corpo ?? {}); }
    if ((init.headers || {}).Authorization !== "Bearer " + ACESSO) return r(401, { error: { code: "InvalidAuthenticationToken" } });
    if (metodo === "POST" && p === "sendMail") return r(202, null, true);
    if (metodo === "GET" && p === "messages") return r(200, { value: original ? [{ id: original }] : [] });
    if (metodo === "POST" && p.endsWith("/createReply")) return r(201, { id: "AAMk-Draft=" });
    if (metodo === "PATCH" && p === "messages/AAMk-Draft=") return r(200, { id: "AAMk-Draft=" });
    if (metodo === "POST" && p === "messages/AAMk-Draft=/send") return r(202, null, true);
    if (metodo === "DELETE" && p === "messages/AAMk-Draft=") return r(204, null, true);
    return r(404, { error: { code: "ErrorItemNotFound" } });
  };
  return { chamadas, http, falha: (f) => { falha = f; }, ordem: () => chamadas.map((c) => c.metodo + " " + c.p.replace(/\?.*$/, "")) };
}
const workerMs = (cx) => criarWorkerOutlook({ acesso: ACESSO, http: cx.http, banco: repoFalso, ...ENTRADA });
const RESP = { ...PEDIDO, em_resposta_a: "<orig@mail.example>", referencias: ["<orig@mail.example>"] };

test("Outlook · enviar mensagem nova: sendMail em texto puro; 202 SEM corpo é sucesso; salva em Enviados; só 'enviado' volta", async () => {
  const cx = graphEnvio(), r = await workerMs(cx).executar("enviar", { ...PEDIDO, cc: ["bia@example.com"], cco: ["oculta@example.com"] });
  assert.deepEqual([r.ok, r.dados], [true, { resultado: "enviado" }]); assert.deepEqual(cx.ordem(), ["POST sendMail"]);
  const m = cx.chamadas[0].corpo; assert.equal(m.saveToSentItems, true); assert.deepEqual([m.message.subject, m.message.body, m.message.toRecipients, m.message.ccRecipients, m.message.bccRecipients],
    ["Reunião às 15h", { contentType: "Text", content: PEDIDO.texto }, [{ emailAddress: { address: "ana@example.com" } }], [{ emailAddress: { address: "bia@example.com" } }], [{ emailAddress: { address: "oculta@example.com" } }]]);
});
test("Outlook · responder: acha a mensagem pelo Message-ID e faz createReply → PATCH do rascunho com o SEU texto → send, nessa ordem; sem DELETE", async () => {
  const cx = graphEnvio(), r = await workerMs(cx).executar("enviar", RESP); assert.equal(r.ok, true);
  assert.deepEqual(cx.ordem(), ["GET messages", "POST messages/AAMk-Orig=/createReply", "PATCH messages/AAMk-Draft=", "POST messages/AAMk-Draft=/send"]); assert.ok(cx.chamadas[0].url.includes("internetMessageId eq '<orig@mail.example>'"));
  assert.equal(cx.chamadas[2].corpo.body.content, PEDIDO.texto, "o texto já traz a citação: a Graph não acrescenta outra"); assert.ok(!cx.chamadas.some((c) => c.metodo === "DELETE"));
});
test("Outlook · responder a algo que o provedor não acha: envia como mensagem nova em vez de falhar", async () => {
  const cx = graphEnvio({ original: null }), r = await workerMs(cx).executar("enviar", RESP); assert.equal(r.ok, true); assert.deepEqual(cx.ordem(), ["GET messages", "POST sendMail"]);
});
test("Outlook · falha ANTES do envio (createReply ou PATCH) é falha confirmada e apaga só o rascunho que o próprio envio criou; recusa no send também; nada é enviado", async () => {
  let cx = graphEnvio(); cx.falha((m, p) => (m === "PATCH" ? { status: 400, corpo: { error: { message: "SEGREDO-MS" } } } : null));
  let r = await workerMs(cx).executar("enviar", RESP); assert.deepEqual([r.ok, r.erro], [false, "envio_recusado"]); assert.deepEqual(cx.ordem().slice(-2), ["PATCH messages/AAMk-Draft=", "DELETE messages/AAMk-Draft="]); assert.ok(!cx.ordem().some((o) => o.endsWith("/send"))); assert.ok(!JSON.stringify(r).includes("SEGREDO"));
  cx = graphEnvio(); cx.falha((m, p) => (p.endsWith("/createReply") ? { status: 503 } : null)); r = await workerMs(cx).executar("enviar", RESP); assert.deepEqual([r.ok, r.erro], [false, "envio_recusado"], "nada foi enviado: falha confirmada"); assert.ok(!cx.ordem().some((o) => o.startsWith("DELETE")), "sem rascunho para apagar");
  cx = graphEnvio(); cx.falha((m, p) => (p.endsWith("/send") ? { status: 400 } : null)); r = await workerMs(cx).executar("enviar", RESP); assert.deepEqual([r.ok, r.erro], [false, "envio_recusado"]); assert.equal(cx.ordem().at(-1), "DELETE messages/AAMk-Draft=");
});
test("Outlook · rede ou 5xx NO send/sendMail = envio_incerto (o rascunho NÃO é apagado); 401 = smtp_autenticacao_recusada; endereço inválido não faz chamada", async () => {
  for (const f of [{ status: 503 }, { status: 429 }, new Error("SEGREDO-DE-REDE")]) {
    let cx = graphEnvio(); cx.falha((m, p) => (p.endsWith("/send") ? f : null)); let r = await workerMs(cx).executar("enviar", RESP); assert.deepEqual([r.ok, r.erro], [false, "envio_incerto"]); assert.ok(!cx.ordem().some((o) => o.startsWith("DELETE")), "pode ter saído: o rascunho fica"); assert.ok(!JSON.stringify(r).includes("SEGREDO"));
    cx = graphEnvio(); cx.falha((m, p) => (p === "sendMail" ? f : null)); r = await workerMs(cx).executar("enviar", PEDIDO); assert.deepEqual([r.ok, r.erro], [false, "envio_incerto"]);
  }
  const cx = graphEnvio(); cx.falha(() => ({ status: 401 })); assert.equal((await workerMs(cx).executar("enviar", PEDIDO)).erro, "smtp_autenticacao_recusada");
  const nada = graphEnvio(); assert.deepEqual([(await workerMs(nada).executar("enviar", { ...PEDIDO, para: ["lixo"] })).erro, nada.chamadas.length], ["destinatario_invalido", 0]);
});
