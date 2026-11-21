// RAC Inbox · I4 lote 4 · o SERVIÇO COMPLETO para contas Gmail e Outlook: sincronizar → gerenciar (arquivar, marcar lida, Lixeira) → enviar (novo e repetido) → resultado incerto, tudo pelo MESMO caminho do iCloud
// (organizar.ts e envio.ts), com o cache e a trava anti-duplicação num Postgres de verdade (PGlite com as migrations reais). Provedores de MENTIRA: nada vai ao Google nem à Microsoft. TUDO FICTÍCIO.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { criarRepositorio } from "../supabase/functions/rac-inbox/repositorio.ts";
import { atender } from "../supabase/functions/rac-inbox/servico.ts";
import { empacotarOauth } from "../supabase/functions/rac-inbox/oauth.ts";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite: pula, menos no CI */ }
const pular = !PGlite;
const R = "11111111-1111-4111-8111-111111111111";
const ACESSO = "acesso-ficticio-0123456789", REFRESH = "refresh-ficticio-0123456789";
const trecho = (arq, ini, fim) => { const t = ler(arq), i = t.indexOf(ini); return t.slice(i, t.indexOf(fim, i) + fim.length); };
async function banco() {
  const db = await PGlite.create();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; grant usage on schema public to anon, authenticated, service_role; alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role; create schema auth; grant usage on schema auth to anon, authenticated, service_role; create table auth.users (id uuid primary key); create table auth.mfa_factors (user_id uuid, status text);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$; create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub', '')::uuid $$;
    insert into auth.users values ('${R}'); create schema storage; create table storage.buckets (id text primary key, name text, public boolean default false);`);
  await db.exec(trecho("supabase/002_casa_compartilhada.sql", "create table if not exists public.membros", "grant execute on function public.dono_da_casa() to authenticated;"));
  await db.exec(trecho("supabase/022_seguranca.sql", "create or replace function public.rac_aal_ok()", "grant execute on function public.rac_aal_ok() to authenticated;"));
  for (const f of ["051_inbox_fundacao", "053_inbox_cabecalhos", "054_inbox_automatico", "056_inbox_envios"]) await db.exec(ler(`supabase/${f}.sql`));
  return db;
}
const sessaoDe = (q) => ({ exec: async (t, p = []) => (await q.query(t, p)).rows, transacao: (f) => (q.transaction ? q.transaction(async (tx) => f(sessaoDe(tx))) : f(sessaoDe(q))) });
const nova = async (db, prov, end) => (await db.query("insert into public.inbox_contas (dono, provedor, apelido, endereco) values ($1, $2, 'C', $3) returning id", [R, prov, end])).rows[0].id;
const r = (status, corpo, vazio = false) => ({ ok: status >= 200 && status < 300, status, json: async () => { if (vazio) throw new Error("sem corpo"); return corpo; } });
const hex = (n) => n.toString(16).padStart(16, "0");

/* ---------- Gmail de mentira ---------- */
function gmail() {
  const msgs = new Map(), envios = []; let falhaEnvio = null;
  const add = (n, rot = ["INBOX", "UNREAD"]) => msgs.set(hex(n), { id: hex(n), n, rot, data: 1760000000000 + n * 60000 });
  const meta = (m) => ({ id: m.id, labelIds: m.rot, internalDate: String(m.data), sizeEstimate: 900, payload: { mimeType: "text/plain", headers: [["From", `"Ana ${m.n}" <ana${m.n}@example.com>`], ["To", "eu@gmail.example"], ["Subject", "Assunto " + m.n], ["Message-ID", `<m${m.n}@mail.example>`]].map(([name, value]) => ({ name, value })) } });
  const http = async (url, init = {}) => {
    const u = new URL(url), p = u.pathname.replace("/gmail/v1/users/me/", ""), metodo = init.method ?? "GET";
    if ((init.headers || {}).Authorization !== "Bearer " + ACESSO) return r(401, { error: {} });
    if (p === "labels") return r(200, { labels: ["INBOX", "SENT", "TRASH", "SPAM"].map((id) => ({ id, type: "system" })) });
    const lb = /^labels\/(.+)$/.exec(p); if (lb) return r(200, { messagesTotal: [...msgs.values()].filter((m) => m.rot.includes(lb[1])).length });
    if (p === "messages" && metodo === "GET") { const rot = u.searchParams.get("labelIds"), l = [...msgs.values()].filter((m) => (rot ? m.rot.includes(rot) : false)).sort((a, b) => b.data - a.data); return r(200, { messages: l.map((m) => ({ id: m.id })), resultSizeEstimate: l.length }); }
    if (p === "messages/send") { if (falhaEnvio) return r(falhaEnvio, {}); envios.push(JSON.parse(init.body)); return r(200, { id: "x", labelIds: ["SENT"] }); }
    const m = /^messages\/([0-9a-f]+)(?:\/(modify|trash))?$/.exec(p), msg = m && msgs.get(m[1]); if (!msg) return r(404, {});
    if (m[2] === "modify") { const b = JSON.parse(init.body); msg.rot = msg.rot.filter((x) => !(b.removeLabelIds || []).includes(x)).concat((b.addLabelIds || []).filter((x) => !msg.rot.includes(x))); return r(200, { id: msg.id, labelIds: msg.rot }); }
    if (m[2] === "trash") { msg.rot = ["TRASH"]; return r(200, { id: msg.id, labelIds: msg.rot }); }
    return r(200, u.searchParams.get("format") === "minimal" ? { id: msg.id, labelIds: msg.rot } : meta(msg));
  };
  return { prov: "gmail", end: "eu@gmail.example", http, msgs, envios, falharEnvio: (s) => { falhaEnvio = s; }, cadastrar: (ns) => ns.forEach((n) => add(n)), temNaPasta: (n, uso) => ({ entrada: "INBOX", arquivo: null, lixo: "TRASH" })[uso] === null ? !msgs.get(hex(n)).rot.some((x) => ["INBOX", "SENT", "TRASH", "SPAM"].includes(x)) : msgs.get(hex(n)).rot.includes({ entrada: "INBOX", lixo: "TRASH" }[uso]), tokenUrl: "https://oauth2.googleapis.com/token" };
}
/* ---------- Outlook de mentira ---------- */
function outlook() {
  const msgs = new Map(), envios = []; let falhaEnvio = null;
  const IDS = { inbox: "F-inbox", sentitems: "F-sent", drafts: "F-draft", deleteditems: "F-del", junkemail: "F-junk", archive: "F-arch" }, USO = { entrada: "F-inbox", arquivo: "F-arch", lixo: "F-del" };
  const add = (n) => msgs.set("AAMk-M" + n + "=", { id: "AAMk-M" + n + "=", n, pasta: "F-inbox", lida: false, data: 1760000000000 + n * 60000 });
  const res = (m) => ({ id: m.id, receivedDateTime: new Date(m.data).toISOString(), isRead: m.lida, flag: { flagStatus: "notFlagged" }, from: { emailAddress: { name: "Ana " + m.n, address: `ana${m.n}@example.com` } }, toRecipients: [], subject: "Assunto " + m.n, internetMessageId: `<m${m.n}@mail.example>`, hasAttachments: false, parentFolderId: m.pasta });
  const http = async (url, init = {}) => {
    const u = new URL(url), p = decodeURIComponent(u.pathname.replace("/v1.0/me/", "")), metodo = init.method ?? "GET";
    if ((init.headers || {}).Authorization !== "Bearer " + ACESSO) return r(401, { error: { code: "InvalidAuthenticationToken" } });
    if (p === "mailFolders") return r(200, { value: [] });
    const pm = /^mailFolders\/([^/]+)\/messages$/.exec(p); if (pm) { const l = [...msgs.values()].filter((m) => m.pasta === (IDS[pm[1]] ?? pm[1])).sort((a, b) => b.data - a.data); return r(200, { value: l.map(res) }); }
    const pf = /^mailFolders\/([^/]+)$/.exec(p); if (pf) return IDS[pf[1]] ? r(200, { id: IDS[pf[1]], totalItemCount: [...msgs.values()].filter((m) => m.pasta === IDS[pf[1]]).length }) : r(404, { error: { code: "ErrorItemNotFound" } });
    if (p === "sendMail") { if (falhaEnvio) return r(falhaEnvio, {}); envios.push(JSON.parse(init.body)); return r(202, null, true); }
    const mm = /^messages\/(.+?)(?:\/(move))?$/.exec(p), msg = mm && msgs.get(mm[1]); if (!msg) return r(404, { error: { code: "ErrorItemNotFound" } });
    if (mm[2] === "move") { msg.pasta = IDS[JSON.parse(init.body).destinationId] ?? JSON.parse(init.body).destinationId; return r(201, res(msg)); }
    if (metodo === "PATCH") { msg.lida = JSON.parse(init.body).isRead; return r(200, res(msg)); }
    return r(200, res(msg));
  };
  return { prov: "outlook", end: "eu@outlook.example", http, msgs, envios, falharEnvio: (s) => { falhaEnvio = s; }, cadastrar: (ns) => ns.forEach(add), temNaPasta: (n, uso) => [...msgs.values()].find((m) => m.n === n).pasta === USO[uso], tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token" };
}

function ctxServico(repo, caixa, conta) {
  const seg = new Map([[R + "|" + conta, empacotarOauth(REFRESH)]]), logs = [];
  const cofre = { async ler(d, c) { return seg.get(d + "|" + c) ?? null; }, async marcar() {}, async guardar(d, c, s) { seg.set(d + "|" + c, s); }, async remover() { return true; }, async estado() { return "ativa"; } };
  const http = async (url, init) => (url === caixa.tokenUrl ? r(200, { access_token: ACESSO, expires_in: 3599 }) : caixa.http(url, init));
  const cfg = { clientId: "id.example", clientSecret: "SEGREDO-FICTICIO", redirectUri: "https://site.example/" };
  return { ctx: { usuario: { id: R, mfaOk: true }, cofre, banco: repo, worker: null, oauth: { gmail: cfg, outlook: cfg }, http, registrar: (e) => logs.push(e) }, logs, seg };
}
const U1 = "aaaaaaaa-0000-4000-8000-000000000001", U2 = "aaaaaaaa-0000-4000-8000-000000000002", U3 = "aaaaaaaa-0000-4000-8000-000000000003";

for (const fabrica of [gmail, outlook]) {
  const nome = fabrica.name === "gmail" ? "Gmail" : "Outlook";
  test(`${nome} · serviço completo: sincroniza, marca lida, arquiva e apaga (Lixeira) com o cache em dia; o ID do provedor e o token nunca saem`, { skip: pular }, async () => {
    const db = await banco(), repo = criarRepositorio(sessaoDe(db)), cx = fabrica(); cx.cadastrar([1, 2, 3]);
    const conta = await nova(db, cx.prov, cx.end), s = ctxServico(repo, cx, conta), pedir = (o) => atender({ conta_id: conta, ...o }, s.ctx);
    const lp = await pedir({ operacao: "listar_pastas" }); assert.equal(lp.status, 200); const pasta = (uso) => lp.corpo.pastas.find((p) => p.uso === uso);
    const sy = await pedir({ operacao: "sincronizar_pasta", pasta_id: pasta("entrada").id }); assert.deepEqual([sy.status, sy.corpo.sincronizacao.novas], [200, 3]);
    const em = async () => (await db.query("select uid, lida from public.inbox_mensagens_ref where pasta_id = $1 order by uid", [pasta("entrada").id])).rows.map((x) => [Number(x.uid), x.lida]);
    assert.deepEqual(await em(), [[1, false], [2, false], [3, false]]);
    const lida = await pedir({ operacao: "organizar_mensagem", pasta_id: pasta("entrada").id, uid: 1, acao: "marcar_lida" }); assert.deepEqual([lida.status, lida.corpo.resultado, lida.corpo.cache, lida.corpo.lida], [200, "aplicada", "atualizado", true]); assert.deepEqual((await em())[0], [1, true]);
    const ar = await pedir({ operacao: "organizar_mensagem", pasta_id: pasta("entrada").id, uid: 2, acao: "arquivar" }); assert.deepEqual([ar.status, ar.corpo.resultado, ar.corpo.cache], [200, "aplicada", "atualizado"]);
    assert.equal(cx.temNaPasta(2, "arquivo"), true, "no provedor a mensagem foi para o Arquivo"); assert.deepEqual((await em()).map((x) => x[0]), [1, 3], "saiu da entrada no cache");
    const ex = await pedir({ operacao: "organizar_mensagem", pasta_id: pasta("entrada").id, uid: 3, acao: "excluir" }); assert.deepEqual([ex.status, ex.corpo.resultado], [200, "aplicada"]); assert.equal(cx.temNaPasta(3, "lixo"), true, "excluir = Lixeira");
    const tudo = JSON.stringify([lp, sy, lida, ar, ex, s.logs]); for (const x of [ACESSO, REFRESH, "SEGREDO-FICTICIO"]) assert.ok(!tudo.includes(x), "vazou: " + x);
    assert.equal((await pedir({ operacao: "organizar_mensagem", pasta_id: pasta("entrada").id, uid: 2, acao: "marcar_lida" })).corpo.erro, "mensagem_inexistente", "a que já saiu da entrada não está mais lá");
  });
  test(`${nome} · enviar pelo serviço: o provedor recebe UMA vez; o mesmo envio_id repetido não transmite de novo; resposta incerta vira 'envio_incerto' e também nunca é repetida`, { skip: pular }, async () => {
    const db = await banco(), repo = criarRepositorio(sessaoDe(db)), cx = fabrica(); cx.cadastrar([1]);
    const conta = await nova(db, cx.prov, cx.end), s = ctxServico(repo, cx, conta), pedir = (o) => atender({ conta_id: conta, ...o }, s.ctx);
    const env = (id) => ({ operacao: "enviar_mensagem", envio_id: id, modo: "novo", para: ["ana@example.com"], cc: [], cco: [], assunto: "Olá", texto: "Teste" });
    const a = await pedir(env(U1)); assert.deepEqual([a.status, a.corpo.resultado], [200, "enviado"]); assert.equal(cx.envios.length, 1);
    const b = await pedir(env(U1)); assert.deepEqual([b.status, b.corpo.resultado, b.corpo.repetido], [200, "enviado", true]); assert.equal(cx.envios.length, 1, "o mesmo envio_id não transmite de novo");
    cx.falharEnvio(503); const c = await pedir(env(U2)); assert.deepEqual([c.status, c.corpo.erro], [202, "envio_incerto"]);
    cx.falharEnvio(null); const d = await pedir(env(U2)); assert.deepEqual([d.status, d.corpo.erro], [202, "envio_incerto"]); assert.equal(cx.envios.length, 1, "incerto nunca é repetido sozinho");
    cx.falharEnvio(400); const e = await pedir(env(U3)); assert.deepEqual([e.status, e.corpo.erro], [422, "envio_recusado"], "recusa confirmada é falha, não incerto");
    assert.deepEqual((await db.query("select id, estado from public.inbox_envios order by estado")).rows.map((x) => x.estado), ["enviado", "falha", "incerto"]);
    assert.ok(!JSON.stringify([a, b, c, d, e, s.logs]).includes(ACESSO), "o token nunca sai");
  });
}
