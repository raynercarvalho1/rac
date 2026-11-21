// RAC Inbox · I4 lote 2 · LEITURA do Gmail (gmail.ts): adaptador com a forma do Worker do iCloud, sincronização pelo MESMO algoritmo (sync.ts) e o MESMO repositório SQL (PGlite com as migrations reais),
// uid sintético por pasta com o ID do Gmail em id_externo, leitura de mensagem e anexo, e o serviço completo (refresh do token, estados). Gmail de MENTIRA: nada vai ao Google. TUDO FICTÍCIO.
// NÃO prova a Gmail API real (formatos reais, cotas, MIME exóticos): isso só se prova com a conta real.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { criarWorkerGmail, palavrasCodificadas, enderecos, htmlParaTexto, partes, corpoDaMensagem, UIDVALIDITY_GMAIL } from "../supabase/functions/rac-inbox/gmail.ts";
import { sincronizarPasta, filtrarResumos, filtrarLeitura, filtrarAnexo, filtrarPastas } from "../supabase/functions/rac-inbox/sync.ts";
import { criarRepositorio } from "../supabase/functions/rac-inbox/repositorio.ts";
import { atender } from "../supabase/functions/rac-inbox/servico.ts";
import { empacotarOauth } from "../supabase/functions/rac-inbox/oauth.ts";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite: pula, menos no CI */ }
const pular = !PGlite;
const R = "11111111-1111-4111-8111-111111111111", X = "33333333-3333-4333-8333-333333333333";
const ACESSO = "ya29.acesso-ficticio-0123456789", REFRESH = "1//refresh-ficticio-0123456789", b64u = (t) => Buffer.from(t).toString("base64url");
const hex = (n) => n.toString(16).padStart(16, "0");

/* ---------- caixa do Gmail de mentira ---------- */
function caixa() {
  const msgs = new Map(), chamadas = []; let falha = null;
  const meta = (m) => ({ id: m.id, threadId: m.id, labelIds: m.labelIds, internalDate: String(m.data), sizeEstimate: m.tamanho ?? 1000, payload: { mimeType: m.mime ?? "text/plain", headers: [["From", m.de], ["To", m.para ?? "eu@gmail.example"], ["Subject", m.assunto], ["Message-ID", `<mensagem-${parseInt(m.id, 16)}@mail.example>`]].map(([name, value]) => ({ name, value })) } });
  const cheia = (m) => { const x = meta(m); x.payload = { ...x.payload, ...(m.payload ?? { body: { size: 5, data: b64u(m.texto ?? "texto") } }) }; if (m.cc) x.payload.headers.push({ name: "Cc", value: m.cc }); return x; };
  const http = async (url, init = {}) => {
    chamadas.push(url); const r = (status, corpo, bruto = false) => ({ ok: status >= 200 && status < 300, status, json: async () => { if (bruto) throw new Error("json"); return corpo; } });
    if (falha) { const f = typeof falha === "function" ? falha(url) : falha; if (f) { if (f instanceof Error) throw f; return r(f.status, f.corpo ?? {}); } }
    if ((init.headers || {}).Authorization !== "Bearer " + ACESSO) return r(401, { error: {} });
    const u = new URL(url), p = u.pathname.replace("/gmail/v1/users/me/", "");
    if (p === "profile") return r(200, { emailAddress: "rayner@gmail.example" });
    if (p === "labels") return r(200, { labels: [{ id: "INBOX", type: "system" }, { id: "SENT", type: "system" }, { id: "TRASH", type: "system" }, { id: "SPAM", type: "system" }, { id: "CATEGORY_PROMOTIONS", type: "system" }, { id: "Label_7", name: "Trabalho", type: "user" }] });
    const lb = /^labels\/(.+)$/.exec(p); if (lb) return r(200, { id: lb[1], messagesTotal: [...msgs.values()].filter((m) => m.labelIds.includes(lb[1])).length });
    if (p === "messages") {
      const rot = u.searchParams.get("labelIds"), q = u.searchParams.get("q"), max = Number(u.searchParams.get("maxResults"));
      let l = [...msgs.values()].filter((m) => (rot ? m.labelIds.includes(rot) : q ? !m.labelIds.some((x) => ["INBOX", "SENT", "DRAFT", "TRASH", "SPAM"].includes(x)) : true));
      l.sort((a, b) => b.data - a.data); const tot = l.length; l = l.slice(0, max);
      return r(200, { messages: l.map((m) => ({ id: m.id, threadId: m.id })), resultSizeEstimate: tot, ...(tot > max ? { nextPageToken: "x" } : {}) });
    }
    const at = /^messages\/([0-9a-f]+)\/attachments\/(.+)$/.exec(p); if (at) { const m = msgs.get(at[1]); const a = m?.anexos?.[at[2]]; return a ? r(200, { size: a.length, data: b64u(a) }) : r(404, {}); }
    const mm = /^messages\/([0-9a-f]+)$/.exec(p); if (mm) { const m = msgs.get(mm[1]); if (!m) return r(404, {}); return r(200, u.searchParams.get("format") === "full" ? cheia(m) : meta(m)); }
    return r(404, {});
  };
  return { msgs, chamadas, http, falha: (f) => { falha = f; },
    add: (n, o = {}) => { const m = { id: hex(n), labelIds: ["INBOX", "UNREAD"], data: 1760000000000 + n * 60000, de: `"Ana ${n}" <ana${n}@example.com>`, assunto: "Assunto " + n, ...o }; msgs.set(m.id, m); return m; } };
}

/* ---------- unidades ---------- */
test("cabeçalhos: palavras codificadas (B e Q, UTF-8 e Latin-1), endereços com aspas, vírgula no nome e lista", () => {
  assert.equal(palavrasCodificadas("=?UTF-8?B?w4PCoWd1YQ==?= x"), "Ã¡gua x"); assert.equal(palavrasCodificadas("=?UTF-8?Q?Jos=C3=A9_Silva?="), "José Silva"); assert.equal(palavrasCodificadas("=?ISO-8859-1?Q?A=E7=E3o?="), "Ação"); assert.equal(palavrasCodificadas("sem codificação"), "sem codificação");
  assert.deepEqual(enderecos('"Silva, José" <jose@example.com>, outra@example.com, =?UTF-8?Q?Ana_Maria?= <ana@example.com>, lixo sem arroba'), [{ nome: "Silva, José", endereco: "jose@example.com" }, { nome: "", endereco: "outra@example.com" }, { nome: "Ana Maria", endereco: "ana@example.com" }]);
  assert.deepEqual(enderecos("<a@b.co>"), [{ nome: "", endereco: "a@b.co" }]); assert.deepEqual(enderecos(""), []);
});
test("corpo: partes numeradas como no IMAP, texto preferido, HTML vira texto (sem script/estilo), anexos separados de corpo inline", () => {
  const payload = { mimeType: "multipart/mixed", parts: [{ mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { size: 3, data: b64u("Olá, mundo") }, headers: [{ name: "Content-Type", value: "text/plain; charset=UTF-8" }] }, { mimeType: "text/html", body: { size: 9, data: b64u("<p>html</p>") } }] },
    { mimeType: "application/pdf", filename: "nota.pdf", body: { attachmentId: "AID1", size: 1234 } }, { mimeType: "image/png", filename: "", headers: [{ name: "Content-ID", value: "<x>" }], body: { attachmentId: "AID2", size: 10 } }] };
  const ps = partes(payload); assert.deepEqual(ps.map((p) => [p.caminho, p.tipo]), [["1.1", "text/plain"], ["1.2", "text/html"], ["2", "application/pdf"], ["3", "image/png"]]);
  assert.deepEqual(corpoDaMensagem(ps), { texto: "Olá, mundo", formato: "texto", truncado: false });
  assert.deepEqual(corpoDaMensagem(partes({ mimeType: "text/html", body: { size: 1, data: b64u("<style>x{}</style><p>Oi&nbsp;<b>você</b></p><script>mal()</script><br>fim &amp; tchau") } })), { texto: "Oi você\n\nfim & tchau", formato: "html_convertido", truncado: false });
  assert.equal(corpoDaMensagem(partes({ mimeType: "multipart/mixed", parts: [{ mimeType: "application/pdf", filename: "a.pdf", body: { attachmentId: "A", size: 1 } }] })).formato, "sem_corpo");
  assert.equal(corpoDaMensagem(partes({ mimeType: "text/plain", body: { size: 1, data: b64u("x".repeat(70000)) } })).truncado, true);
  assert.equal(htmlParaTexto("<script>alert(1)</script>ok"), "ok", "script nunca vira texto");
});

/* ---------- Postgres de verdade ---------- */
const trecho = (arq, ini, fim) => { const t = ler(arq), i = t.indexOf(ini); return t.slice(i, t.indexOf(fim, i) + fim.length); };
async function banco() {
  const db = await PGlite.create();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; grant usage on schema public to anon, authenticated, service_role; alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role; create schema auth; grant usage on schema auth to anon, authenticated, service_role; create table auth.users (id uuid primary key); create table auth.mfa_factors (user_id uuid, status text);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$; create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub', '')::uuid $$;
    insert into auth.users values ('${R}'), ('${X}'); create schema storage; create table storage.buckets (id text primary key, name text, public boolean default false);`);
  await db.exec(trecho("supabase/002_casa_compartilhada.sql", "create table if not exists public.membros", "grant execute on function public.dono_da_casa() to authenticated;"));
  await db.exec(trecho("supabase/022_seguranca.sql", "create or replace function public.rac_aal_ok()", "grant execute on function public.rac_aal_ok() to authenticated;"));
  for (const f of ["051_inbox_fundacao", "053_inbox_cabecalhos", "054_inbox_automatico"]) await db.exec(ler(`supabase/${f}.sql`));
  return db;
}
const sessaoDe = (q) => ({ exec: async (t, p = []) => (await q.query(t, p)).rows, transacao: (f) => (q.transaction ? q.transaction(async (tx) => f(sessaoDe(tx))) : f(sessaoDe(q))) });
const nova = async (db, dono, prov = "gmail", end = "rayner@gmail.example") => (await db.query("insert into public.inbox_contas (dono, provedor, apelido, endereco) values ($1, $2, 'C', $3) returning id", [dono, prov, end])).rows[0].id;
async function preparar(db, repo, conta, cx, dono = R) {
  const w = criarWorkerGmail({ acesso: ACESSO, http: cx.http, banco: repo, dono, conta });
  const lp = await w.executar("listar_pastas", {}); const salvas = await repo.salvarPastas(dono, conta, filtrarPastas(lp.dados.pastas));
  return { w, pasta: (nome) => salvas.find((s) => s.nome_externo === nome), salvas };
}
const sinc = (w, repo, conta, pastaId, dono = R) => sincronizarPasta({ dono, conta, pastaId, worker: w, banco: repo, credencial: { usuario: "", senha: "" } });
const linhas = async (db, pasta) => (await db.query("select id_externo, uid, uidvalidity, lida, assunto, remetente_nome, remetente_endereco from public.inbox_mensagens_ref where pasta_id = $1 order by uid", [pasta])).rows;

test("listar_pastas: rótulos do sistema com nomes e usos do Inbox, mais 'Arquivo' e os rótulos do usuário; categorias do Gmail ficam de fora", { skip: pular }, async () => {
  const db = await banco(), repo = criarRepositorio(sessaoDe(db)), conta = await nova(db, R), cx = caixa(), { salvas } = await preparar(db, repo, conta, cx);
  assert.deepEqual(salvas.map((s) => [s.nome_externo, s.nome_exibicao, s.uso]), [["INBOX", "Caixa de entrada", "entrada"], ["SENT", "Enviados", "enviados"], ["TRASH", "Lixeira", "lixo"], ["SPAM", "Spam", "spam"], ["ARQUIVO", "Arquivo", "arquivo"], ["Label_7", "Trabalho", "outra"]]);
});

test("sincronização do Gmail pelo MESMO algoritmo: uid sintético crescente (o mais antigo recebe o menor), ID do Gmail em id_externo, uidvalidity 1, cabeçalhos decodificados; repetir não duplica nem muda", { skip: pular }, async () => {
  const db = await banco(), repo = criarRepositorio(sessaoDe(db)), conta = await nova(db, R), cx = caixa();
  cx.add(3, { de: "=?UTF-8?Q?Jos=C3=A9?= <jose@example.com>", assunto: "=?UTF-8?B?w4PCoWd1YQ==?=" }); cx.add(1); cx.add(2, { labelIds: ["INBOX"] }); cx.add(9, { labelIds: ["SENT"], assunto: "enviada" });
  const { w, pasta } = await preparar(db, repo, conta, cx), inbox = pasta("INBOX").id;
  const r1 = await sinc(w, repo, conta, inbox); assert.equal(r1.ok, true); assert.deepEqual(r1.dados.sincronizacao, { tipo: "primeira_leitura", novas: 3, atualizadas: 0, removidas: 0 }); assert.equal(r1.dados.mensagens_na_pasta, 3);
  const l = await linhas(db, inbox); assert.deepEqual(l.map((x) => [Number(x.uid), x.id_externo, Number(x.uidvalidity)]), [[1, hex(1), 1], [2, hex(2), 1], [3, hex(3), 1]], "uid 1 = a mais antiga");
  assert.deepEqual([l[2].assunto, l[2].remetente_nome, l[2].remetente_endereco, l[2].lida, l[1].lida], ["Ã¡gua", "José", "jose@example.com", false, true], "cabeçalhos decodificados; lida vem do rótulo UNREAD");
  assert.deepEqual((await db.query("select uidnext, uidvalidity from public.inbox_sincronizacao where pasta_id = $1", [inbox])).rows[0], { uidnext: 4, uidvalidity: 1 }, "o cursor é o contador");
  const r2 = await sinc(w, repo, conta, inbox); assert.equal(r2.dados.sincronizacao.tipo, "sem_mudanca"); assert.equal((await linhas(db, inbox)).length, 3, "não duplica");
  assert.equal(UIDVALIDITY_GMAIL, 1);
});

test("novas mensagens ganham uids MAIORES; mudança de leitura atualiza; mensagem removida no Gmail sai do cache; a de outra pasta não entra", { skip: pular }, async () => {
  const db = await banco(), repo = criarRepositorio(sessaoDe(db)), conta = await nova(db, R), cx = caixa(); cx.add(1); cx.add(2);
  const { w, pasta } = await preparar(db, repo, conta, cx), inbox = pasta("INBOX").id; await sinc(w, repo, conta, inbox);
  cx.add(5); cx.add(4);   // chegam fora de ordem de ID: o uid segue a data
  const r = await sinc(w, repo, conta, inbox); assert.deepEqual(r.dados.sincronizacao, { tipo: "novas_mensagens", novas: 2, atualizadas: 2, removidas: 0 });
  assert.deepEqual((await linhas(db, inbox)).map((x) => [Number(x.uid), x.id_externo]), [[1, hex(1)], [2, hex(2)], [3, hex(4)], [4, hex(5)]], "uid 3 = a mais antiga das duas novas");
  cx.msgs.get(hex(1)).labelIds = ["INBOX"]; cx.msgs.delete(hex(2));   // lida no Gmail e apagada no Gmail
  const r3 = await sinc(w, repo, conta, inbox); assert.equal(r3.dados.sincronizacao.removidas, 1); const l = await linhas(db, inbox);
  assert.deepEqual(l.map((x) => [Number(x.uid), x.lida]), [[1, true], [3, false], [4, false]]);
  assert.equal((await db.query("select nao_lidas, total from public.inbox_pastas where id = $1", [inbox])).rows[0].nao_lidas, 2);
});

test("ler_mensagem: o uid vira o ID do Gmail só no servidor; texto, Cc, anexos e formato passam pelo filtro de esquema fechado; uid de outra conta/pasta e inexistente são recusados", { skip: pular }, async () => {
  const db = await banco(), repo = criarRepositorio(sessaoDe(db)), conta = await nova(db, R), cx = caixa();
  cx.add(1, { mime: "multipart/mixed", cc: "Bia <bia@example.com>", payload: { parts: [{ mimeType: "text/plain", body: { size: 5, data: b64u("Olá, tudo bem?") } }, { mimeType: "application/pdf", filename: "nota fiscal.pdf", body: { attachmentId: "A1", size: 11 } }] }, anexos: { A1: "PDF-CONTEUDO" } });
  const { w, pasta } = await preparar(db, repo, conta, cx), inbox = pasta("INBOX").id; await sinc(w, repo, conta, inbox);
  const r = await w.executar("ler_mensagem", { pasta: "INBOX", uid: 1, uidvalidity_esperado: 1 }); assert.equal(r.ok, true); const f = filtrarLeitura(r.dados); assert.ok(f, "passa pelo filtro de esquema fechado");
  assert.deepEqual([f.mensagem.texto, f.mensagem.formato, f.mensagem.cc, f.mensagem.anexos], ["Olá, tudo bem?", "texto", [{ nome: "Bia", endereco: "bia@example.com" }], [{ parte: "2", nome: "nota fiscal.pdf", tipo: "application/pdf", tamanho: 11, inline: false }]]); assert.equal(f.mensagem.anexo_provavel, true);
  assert.ok(!JSON.stringify(f).includes(hex(1)), "o ID do Gmail nunca chega ao navegador (a resposta usa só o uid)");
  const a = await w.executar("baixar_anexo", { pasta: "INBOX", uid: 1, parte: "2" }); assert.equal(Buffer.from(filtrarAnexo(a.dados).anexo.base64, "base64").toString(), "PDF-CONTEUDO"); assert.equal(filtrarAnexo(a.dados).anexo.nome, "nota fiscal.pdf");
  assert.equal((await w.executar("baixar_anexo", { pasta: "INBOX", uid: 1, parte: "1" })).erro, "parte_inexistente", "o corpo não é anexo"); assert.equal((await w.executar("ler_mensagem", { pasta: "INBOX", uid: 99, uidvalidity_esperado: 1 })).erro, "mensagem_inexistente");
  assert.equal((await w.executar("ler_mensagem", { pasta: "INBOX", uid: 1, uidvalidity_esperado: 2 })).erro, "uidvalidity_mudou");
  const c2 = await nova(db, R, "gmail", "raynim@gmail.example"), w2 = (await preparar(db, repo, c2, caixa())).w; assert.equal((await w2.executar("ler_mensagem", { pasta: "INBOX", uid: 1, uidvalidity_esperado: 1 })).erro, "mensagem_inexistente", "a outra conta Gmail não alcança o uid da primeira");
  const wx = criarWorkerGmail({ acesso: ACESSO, http: cx.http, banco: repo, dono: X, conta }); assert.equal((await wx.executar("ler_mensagem", { pasta: "INBOX", uid: 1, uidvalidity_esperado: 1 })).erro, "pasta_inexistente", "outro usuário não alcança a pasta");
  cx.msgs.get(hex(1)).anexos.A1 = "x".repeat(3 * 1024 * 1024 + 1); cx.msgs.get(hex(1)).payload.parts[1].body.size = 3 * 1024 * 1024 + 1; assert.equal((await w.executar("baixar_anexo", { pasta: "INBOX", uid: 1, parte: "2" })).erro, "anexo_grande_demais");
});

test("erros da Gmail API viram códigos fechados: 401/403 = autenticação recusada (reconectar), cota = http_403, 5xx = http_NNN, rede = canal_falhou; nada do corpo do erro é repassado", async () => {
  const cx = caixa(), repoFalso = { pastaIdPorNome: async () => "p", idsExternos: async () => new Map(), maiorUid: async () => 0, idExterno: async () => hex(1) };
  const w = criarWorkerGmail({ acesso: ACESSO, http: cx.http, banco: repoFalso, dono: R, conta: R });
  for (const [f, esperado] of [[{ status: 401, corpo: { error: { message: "SEGREDO-DO-GOOGLE" } } }, "autenticacao_recusada"], [{ status: 403, corpo: { error: { errors: [{ reason: "insufficientPermissions" }] } } }, "autenticacao_recusada"], [{ status: 403, corpo: { error: { errors: [{ reason: "rateLimitExceeded" }] } } }, "http_403"],
    [{ status: 503, corpo: {} }, "http_503"], [{ status: 429, corpo: {} }, "http_429"], [new Error("SEGREDO-DE-REDE"), "canal_falhou"]]) {
    cx.falha(f); const r = await w.executar("testar_conta", {}); assert.deepEqual([r.ok, r.erro], [false, esperado]); assert.ok(!JSON.stringify(r).includes("SEGREDO"), "o texto do erro nunca é copiado");
  }
  cx.falha(null); assert.equal((await w.executar("testar_conta", {})).ok, true); assert.equal((await w.executar("enviar", {})).erro, "operacao_desconhecida", "verbo desconhecido continua recusado");
  const m = caixa(); const wm = criarWorkerGmail({ acesso: "token-errado", http: m.http, banco: repoFalso, dono: R, conta: R }); assert.equal((await wm.executar("listar_pastas", {})).erro, "autenticacao_recusada");
  assert.equal((await w.executar("listar_mensagens", { pasta: "../etc/passwd" })).erro, "pasta_inexistente", "o nome da pasta é validado antes de ir à URL");
  const src = ler("supabase/functions/rac-inbox/gmail.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""); assert.ok(!/method:\s*"(PUT|PATCH|DELETE)"|batchDelete|\/delete/i.test(src), "nenhuma chamada que apague de vez (o lote 4 só gerencia e envia; Lixeira é o fim)");
});

/* ---------- o serviço completo ---------- */
const CFG = { gmail: { clientId: "id.example", clientSecret: "SEGREDO-GOOGLE", redirectUri: "https://site.example/" } };
function ctxServico(db, repo, cx, conta, { refresh = REFRESH, tokenResp = { status: 200, corpo: { access_token: ACESSO, expires_in: 3599 } } } = {}) {
  const seg = new Map([[R + "|" + conta, empacotarOauth(refresh)]]), eventos = [], logs = [], tokens = [];
  const cofre = { async ler(d, c) { return seg.get(d + "|" + c) ?? null; }, async marcar(d, c, e) { eventos.push(["marcar", e]); }, async guardar() { throw new Error("nada deve ser guardado numa leitura"); }, async remover() { return true; }, async estado() { return "ativa"; } };
  const http = async (url, init) => { if (url.startsWith("https://oauth2.googleapis.com/token")) { tokens.push(init.body); return { ok: tokenResp.status === 200, status: tokenResp.status, json: async () => tokenResp.corpo }; } return cx.http(url, init); };
  const banco = { ...repo, async estadoConta(d, c, e, er) { eventos.push(["conta", e, er]); await repo.estadoConta(d, c, e, er); } };
  return { c: { usuario: { id: R, mfaOk: true }, cofre, banco, worker: null, oauth: CFG, http, registrar: (e) => logs.push(e) }, eventos, logs, tokens, seg };
}
test("serviço: conta Gmail lista pastas, sincroniza, lê e baixa SEM Worker do iCloud; o token de acesso vem do refresh a cada chamada e nunca é guardado nem devolvido", { skip: pular }, async () => {
  const db = await banco(), repo = criarRepositorio(sessaoDe(db)), conta = await nova(db, R), cx = caixa(); cx.add(1, { payload: { parts: [{ mimeType: "text/plain", body: { size: 4, data: b64u("corpo") } }] }, mime: "multipart/alternative" });
  const s = ctxServico(db, repo, cx, conta), pedir = (o) => atender({ conta_id: conta, ...o }, s.c);
  const lp = await pedir({ operacao: "listar_pastas" }); assert.equal(lp.status, 200); const inbox = lp.corpo.pastas.find((p) => p.uso === "entrada").id;
  const sy = await pedir({ operacao: "sincronizar_pasta", pasta_id: inbox }); assert.deepEqual([sy.status, sy.corpo.sincronizacao.tipo, sy.corpo.sincronizacao.novas, sy.corpo.mensagens_na_pasta], [200, "primeira_leitura", 1, 1]);
  const lm = await pedir({ operacao: "ler_mensagem", pasta_id: inbox, uid: 1 }); assert.deepEqual([lm.status, lm.corpo.mensagem.texto], [200, "corpo"]);
  assert.ok(s.tokens.length >= 3 && s.tokens.every((t) => new URLSearchParams(t).get("grant_type") === "refresh_token"), "um refresh por operação");
  const tudo = JSON.stringify([lp, sy, lm, s.logs]); for (const x of [ACESSO, REFRESH, "SEGREDO-GOOGLE", hex(1)]) assert.ok(!tudo.includes(x), "vazou: " + x);
  assert.ok(s.eventos.some((e) => e[0] === "conta" && e[1] === "conectada"));
  assert.equal(s.seg.size, 1, "o cofre continua só com o refresh original (o cofre de teste recusa guardar numa leitura)");
});
test("serviço: refresh recusado (invalid_grant) marca a credencial inválida e a conta em erro de autenticação (Reconectar); falha temporária do Google não invalida; envio/gerenciamento do Gmail respondem honestamente", { skip: pular }, async () => {
  const db = await banco(), repo = criarRepositorio(sessaoDe(db)), conta = await nova(db, R), cx = caixa();
  const ruim = ctxServico(db, repo, cx, conta, { tokenResp: { status: 400, corpo: { error: "invalid_grant" } } }); const r = await atender({ operacao: "testar_conta", conta_id: conta }, ruim.c);
  assert.deepEqual([r.status, r.corpo.erro], [ERRO_CRED, "credencial_invalida"].slice(0, 2).map((x, i) => (i === 0 ? 422 : x))); assert.ok(ruim.eventos.some((e) => e[0] === "marcar" && e[1] === "invalida")); assert.ok(ruim.eventos.some((e) => e[0] === "conta" && e[1] === "erro_autenticacao"));
  const fora = ctxServico(db, repo, cx, conta, { tokenResp: { status: 503, corpo: {} } }); const r2 = await atender({ operacao: "testar_conta", conta_id: conta }, fora.c); assert.equal(r2.corpo.erro, "servico_indisponivel"); assert.ok(!fora.eventos.some((e) => e[1] === "invalida"), "falha temporária não invalida");
  const ok = ctxServico(db, repo, cx, conta); const pasta = "bbbbbbbb-0000-4000-8000-000000000001", uuid = "aaaaaaaa-0000-4000-8000-000000000001";
  for (const o of [{ operacao: "organizar_mensagem", conta_id: conta, pasta_id: pasta, uid: 1, acao: "arquivar" }, { operacao: "smtp_prova", conta_id: conta, enviar_teste: false }, { operacao: "enviar_mensagem", conta_id: conta, envio_id: uuid, modo: "novo", para: ["a@example.com"], cc: [], cco: [], assunto: "x", texto: "y" }]) assert.equal((await atender(o, ok.c)).corpo.erro, "provedor_sem_operacao", o.operacao);
  const out = await nova(db, R, "outlook", "eu@outlook.example"); assert.equal((await atender({ operacao: "testar_conta", conta_id: out }, ok.c)).corpo.erro, "credencial_ausente", "o Outlook lê (lote 3): sem conexão guardada, pede a conexão");
  assert.equal((await atender({ operacao: "testar_conta", conta_id: conta }, { ...ok.c, oauth: {} })).corpo.erro, "oauth_nao_configurado");
});
const ERRO_CRED = 422;
