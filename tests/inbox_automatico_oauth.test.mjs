// RAC Inbox · I4 lote 4 · ROTINA AUTOMÁTICA (a cada 10 min) também para contas Gmail e Outlook: mesma rotina do iCloud (rotina.ts), token de acesso pedido a cada rodada (abrirWorkerOauth), primeira leitura nunca avisa,
// nada avisado duas vezes, refresh recusado tira a conta da rotina, falha ao regravar o refresh novo não derruba a rodada. Provedores de MENTIRA e PGlite com as migrations reais. TUDO FICTÍCIO.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { criarRepositorio } from "../supabase/functions/rac-inbox/repositorio.ts";
import { atender, abrirWorkerOauth } from "../supabase/functions/rac-inbox/servico.ts";
import { rodarRotina } from "../supabase/functions/rac-inbox/rotina.ts";
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
    if (p === "messages" && metodo === "GET") { const rot = u.searchParams.get("labelIds"), max = Number(u.searchParams.get("maxResults")) || 1000, l = [...msgs.values()].filter((m) => (rot ? m.rot.includes(rot) : false)).sort((a, b) => b.data - a.data), pag = l.slice(0, max); return r(200, { messages: pag.map((m) => ({ id: m.id })), resultSizeEstimate: l.length, ...(l.length > max ? { nextPageToken: "x" } : {}) }); }
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
    const pm = /^mailFolders\/([^/]+)\/messages$/.exec(p); if (pm) { const max = Number(u.searchParams.get("$top")) || 1000, l = [...msgs.values()].filter((m) => m.pasta === (IDS[pm[1]] ?? pm[1])).sort((a, b) => b.data - a.data); return r(200, { value: l.slice(0, max).map(res), ...(l.length > max ? { "@odata.nextLink": "https://graph.microsoft.com/v1.0/x" } : {}) }); }
    const pf = /^mailFolders\/([^/]+)$/.exec(p); if (pf) return IDS[pf[1]] ? r(200, { id: IDS[pf[1]], totalItemCount: [...msgs.values()].filter((m) => m.pasta === IDS[pf[1]]).length }) : r(404, { error: { code: "ErrorItemNotFound" } });
    if (p === "sendMail") { if (falhaEnvio) return r(falhaEnvio, {}); envios.push(JSON.parse(init.body)); return r(202, null, true); }
    const mm = /^messages\/(.+?)(?:\/(move))?$/.exec(p), msg = mm && msgs.get(mm[1]); if (!msg) return r(404, { error: { code: "ErrorItemNotFound" } });
    if (mm[2] === "move") { msg.pasta = IDS[JSON.parse(init.body).destinationId] ?? JSON.parse(init.body).destinationId; return r(201, res(msg)); }
    if (metodo === "PATCH") { msg.lida = JSON.parse(init.body).isRead; return r(200, res(msg)); }
    return r(200, res(msg));
  };
  return { prov: "outlook", end: "eu@outlook.example", http, msgs, envios, falharEnvio: (s) => { falhaEnvio = s; }, cadastrar: (ns) => ns.forEach(add), temNaPasta: (n, uso) => [...msgs.values()].find((m) => m.n === n).pasta === USO[uso], tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token" };
}


const CFG = { clientId: "id.example", clientSecret: "SEGREDO-FICTICIO", redirectUri: "https://site.example/" };
async function montar(db, fabrica, { token = null, falharGuardar = false } = {}) {
  const padrao = { status: 200, corpo: (n) => ({ access_token: ACESSO, refresh_token: "refresh-novo-ficticio-" + n, expires_in: 3599 }) }; let atual = padrao;   // o token "ruim" só vale DEPOIS de a conta ter pastas
  const repo = criarRepositorio(sessaoDe(db)), cx = fabrica(), conta = await nova(db, cx.prov, cx.end); cx.cadastrar([1, 2]);
  await db.exec(`create table if not exists public.inbox_credenciais (conta_id uuid primary key, dono uuid not null, estado text not null default 'ativa'); insert into public.inbox_credenciais (conta_id, dono) values ('${conta}', '${R}') on conflict do nothing;`);
  const seg = new Map([[R + "|" + conta, empacotarOauth(REFRESH)]]), eventos = [], avisos = [], logs = []; let n = 0;
  const cofre = { async ler(d, c) { return seg.get(d + "|" + c) ?? null; }, async marcar(d, c, e) { eventos.push(["marcar", e]); }, async guardar(d, c, s) { if (falharGuardar) throw new Error("cofre fora"); seg.set(d + "|" + c, s); eventos.push(["guardar"]); }, async remover() { return true; }, async estado() { return "ativa"; } };
  const http = async (url, init) => (url === cx.tokenUrl ? r(atual.status, atual.corpo instanceof Function ? atual.corpo(++n) : atual.corpo) : cx.http(url, init));
  const banco = { ...repo, async estadoConta(d, c, e, er) { eventos.push(["conta", e, er]); await repo.estadoConta(d, c, e, er); } };
  const ctx = { usuario: { id: R, mfaOk: true }, cofre, banco, worker: null, oauth: { gmail: CFG, outlook: CFG }, http, registrar: () => {} };
  const lp = await atender({ operacao: "listar_pastas", conta_id: conta }, ctx);   // 1ª abertura da conta no Inbox: cria as pastas
  if (token) atual = token; n = 0;
  const sem = { async executar() { throw new Error("o Worker do iCloud não pode ser chamado por conta OAuth"); } };
  const aviso = { async enviar(dono, m) { avisos.push({ dono, m }); return { aparelhos: 1, enviados: 1, removidas: 0, semChaves: false }; } };
  const rodada = () => rodarRotina({ banco, cofre, worker: sem, aviso, registrar: (e) => logs.push(e), workerDaConta: (c, bruto) => abrirWorkerOauth({ cofre, oauth: { gmail: CFG, outlook: CFG }, http, banco, dono: c.dono, conta: c.conta, prov: c.provedor, bruto }) });
  return { repo, cx, conta, eventos, avisos, logs, seg, rodada, lp, entrada: lp.corpo.pastas.find((p) => p.uso === "entrada").id };
}
const naCaixa = async (db, pasta) => Number((await db.query("select count(*)::int as n from public.inbox_mensagens_ref where pasta_id = $1", [pasta])).rows[0].n);

for (const fabrica of [gmail, outlook]) {
  const nome = fabrica.name === "gmail" ? "Gmail" : "Outlook";
  test(`${nome} · a rotina de 10 min sincroniza a conta OAuth sem o Worker do iCloud: 1ª leitura silenciosa, 1 aviso por mensagem nova (sem conteúdo do e-mail), nunca duas vezes, sem mudança = nada`, { skip: pular }, async () => {
    const db = await banco(), m = await montar(db, fabrica);
    const r1 = await m.rodada(); assert.deepEqual([r1.contas, r1.sincronizadas, r1.falhas, r1.avisos], [1, 1, 0, 0], "primeira leitura: grava e NÃO avisa"); assert.equal(await naCaixa(db, m.entrada), 2);
    m.cx.cadastrar([3]); const r2 = await m.rodada(); assert.deepEqual([r2.sincronizadas, r2.novas, r2.avisos], [1, 1, 1]); assert.equal(m.avisos.length, 1); assert.ok(!JSON.stringify(m.avisos[0].m).includes("Teste de corpo"), "só cabeçalho no aviso");
    const r3 = await m.rodada(); assert.deepEqual([r3.sem_mudanca, r3.avisos, r3.falhas], [1, 0, 0]); assert.equal(m.avisos.length, 1, "nada avisado duas vezes");
    assert.ok(m.eventos.some((e) => e[0] === "conta" && e[1] === "conectada")); const tudo = JSON.stringify([r1, r2, r3, m.logs]); for (const x of [ACESSO, REFRESH, "SEGREDO-FICTICIO"]) assert.ok(!tudo.includes(x), "vazou: " + x);
    assert.equal(m.seg.get(R + "|" + m.conta), empacotarOauth("refresh-novo-ficticio-3"), "o refresh token novo (a cada renovação) é regravado, quando o provedor devolve um");
  });
  test(`${nome} · refresh recusado tira a conta da rotina (credencial inválida, erro de autenticação) e ela não é tentada de novo; falha ao regravar o refresh novo não derruba a rodada`, { skip: pular }, async () => {
    const db = await banco(), ruim = await montar(db, fabrica, { token: { status: 400, corpo: { error: "invalid_grant" } } });
    const r1 = await ruim.rodada(); assert.deepEqual([r1.contas, r1.falhas, r1.sincronizadas], [1, 1, 0]); assert.ok(ruim.eventos.some((e) => e[0] === "marcar" && e[1] === "invalida")); assert.ok(ruim.eventos.some((e) => e[0] === "conta" && e[1] === "erro_autenticacao"));
    const r2 = await ruim.rodada(); assert.equal(r2.contas, 0, "fora da rotina até reconectar");
    const db2 = await banco(), mudo = await montar(db2, fabrica, { falharGuardar: true }); const r3 = await mudo.rodada(); assert.deepEqual([r3.sincronizadas, r3.falhas], [1, 0], "o refresh anterior segue valendo");
    const db3 = await banco(), fora = await montar(db3, fabrica, { token: { status: 503, corpo: {} } }); const r4 = await fora.rodada(); assert.equal(r4.falhas, 1); assert.ok(!fora.eventos.some((e) => e[0] === "marcar" && e[1] === "invalida"), "falha temporária não invalida");
  });
}
test("a rotina sem a configuração OAuth não chama o Worker do iCloud nem derruba a rodada: registra e segue", { skip: pular }, async () => {
  const db = await banco(), m = await montar(db, gmail), logs = [];
  const res = await rodarRotina({ banco: { ...m.repo }, cofre: { async ler() { return empacotarOauth(REFRESH); }, async marcar() {}, async guardar() {}, async remover() { return true; }, async estado() { return "ativa"; } }, worker: { async executar() { throw new Error("não pode"); } }, aviso: null, registrar: (e) => logs.push(e) });
  assert.deepEqual([res.contas, res.falhas, res.sincronizadas], [1, 1, 0]); assert.ok(logs.some((e) => e.codigo === "oauth_nao_configurado"));
});

for (const fabrica of [gmail, outlook]) {
  const nome = fabrica.name === "gmail" ? "Gmail" : "Outlook";
  test(`${nome} · caixa com MAIS de 50 mensagens: a rotina avisa só da mensagem realmente nova, nunca de antigas das posições 51 a 100, e não repete o aviso depois da releitura da janela`, { skip: pular }, async () => {
    const db = await banco(), m = await montar(db, fabrica); m.cx.cadastrar(Array.from({ length: 78 }, (_, i) => i + 3));   // 80 não lidas no total
    const r1 = await m.rodada(); assert.deepEqual([r1.sincronizadas, r1.avisos], [1, 0], "primeira leitura: janela de 50, silenciosa"); assert.equal(await naCaixa(db, m.entrada), 50);
    m.cx.cadastrar([81]); const r2 = await m.rodada(); assert.deepEqual([r2.novas, r2.avisos], [1, 1], "só a nova é novidade (as das posições 51 a 100 nunca viram aviso)"); assert.equal(m.avisos.length, 1); assert.match(JSON.stringify(m.avisos[0].m), /Assunto 81/);
    await db.exec("update public.inbox_sincronizacao set reconciliada_em = now() - interval '2 hours'");   // a releitura de hora em hora
    const r3 = await m.rodada(); assert.equal(r3.avisos, 0, "a releitura da janela não avisa"); m.cx.cadastrar([82]); const r4 = await m.rodada();
    assert.deepEqual([r4.novas, r4.avisos], [1, 1]); assert.equal(m.avisos.length, 2); assert.match(JSON.stringify(m.avisos[1].m), /Assunto 82/); assert.ok(!m.avisos.some((a) => /Assunto (29|30)\b/.test(JSON.stringify(a.m))), "nenhuma antiga reaparece");
  });
}
