// RAC Inbox · ponta a ponta do aviso de e-mail novo, SEM mocks do nosso código: PostgreSQL de teste (PGlite) com as migrations reais (051, 053, 054), o repositório real, a rotina real, o Web Push real
// (cifrado e decifrado como o aparelho faz) e o sw.js real recebendo o push e o toque. Só o que é de fora é simulado: o Worker/iCloud (devolve cabeçalhos fictícios), o serviço de push e as janelas.
// Prova que assunto, remetente e id gravados na sincronização chegam ao título, ao corpo e ao destino da notificação, e que o toque (app fechado, aberto, suspenso) leva ao endereço da MESMA mensagem.
// Dados 100% fictícios. Não prova o iPhone nem o serviço de push da Apple.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { rodarRotina } from "../supabase/functions/rac-inbox/rotina.ts";
import { entregar } from "../supabase/functions/rac-inbox/push.ts";
import { criarRepositorio, criarBancoPush } from "../supabase/functions/rac-inbox/repositorio.ts";
import { empacotar } from "../supabase/functions/rac-inbox/contrato.ts";

createRequire(import.meta.url)("../nucleo.js"); const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite */ }
const pular = !PGlite;
test("no CI o PGlite está instalado: o ponta a ponta do aviso não pode ser pulado", () => { if (process.env.CI) assert.ok(PGlite); });
const R = "11111111-1111-4111-8111-111111111111", C = "cccccccc-0000-4000-8000-000000000001", P = "dddddddd-0000-4000-8000-000000000001", SITE = "https://raynercarvalho.com.br/";
const trecho = (arq, ini, fim) => { const t = ler(arq), i = t.indexOf(ini); return t.slice(i, t.indexOf(fim, i) + fim.length); };
const sessaoDe = (q) => ({ exec: async (t, p = []) => (await q.query(t, p)).rows, transacao: (f) => (q.transaction ? q.transaction(async (tx) => f(sessaoDe(tx))) : f(sessaoDe(q))) });
async function banco() {
  const db = await PGlite.create();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated; alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    create schema auth; grant usage on schema auth to anon, authenticated, service_role; create table auth.users (id uuid primary key); create table auth.mfa_factors (user_id uuid, status text);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub', '')::uuid $$; insert into auth.users values ('${R}');
    create schema storage; create table storage.buckets (id text primary key, name text, public boolean default false);`);
  await db.exec(trecho("supabase/002_casa_compartilhada.sql", "create table if not exists public.membros", "grant execute on function public.dono_da_casa() to authenticated;"));
  await db.exec(trecho("supabase/022_seguranca.sql", "create or replace function public.rac_aal_ok()", "grant execute on function public.rac_aal_ok() to authenticated;"));
  for (const f of ["051_inbox_fundacao", "053_inbox_cabecalhos", "054_inbox_automatico"]) await db.exec(ler("supabase/" + f + ".sql"));
  await db.exec(`create table public.inbox_credenciais (conta_id uuid primary key, dono uuid not null, estado text not null default 'ativa');
    create table public.push_inscricoes (id bigint generated always as identity primary key, user_id uuid not null, endpoint text not null unique, p256dh text not null, auth text not null, aparelho text, criado timestamptz default now());
    create table public.rac_segredos (chave text primary key, valor jsonb not null, criado timestamptz default now());
    insert into public.inbox_contas (id, dono, provedor, apelido, endereco, estado) values ('${C}', '${R}', 'icloud', 'Pessoal', 'pessoa@icloud.example', 'conectada');
    insert into public.inbox_credenciais values ('${C}', '${R}', 'ativa');
    insert into public.inbox_pastas (id, dono, conta_id, nome_externo, uso) values ('${P}', '${R}', '${C}', 'INBOX', 'entrada');`);
  return db;
}
const b64u = (u) => Buffer.from(u).toString("base64url");
const hmac = async (k, d) => new Uint8Array(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", k, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), d));
const tt = (s) => new TextEncoder().encode(s), junta = (...l) => Buffer.concat(l.map((x) => Buffer.from(x)));
async function aparelho() {
  const par = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]), pub = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey)), auth = crypto.getRandomValues(new Uint8Array(16));
  return { par, pub, auth, p256dh: b64u(pub), authB: b64u(auth) };
}
async function decifrar(corpo, ap) {
  const sal = corpo.slice(0, 16), idlen = corpo[20], as = corpo.slice(21, 21 + idlen), cif = corpo.slice(21 + idlen);
  const asK = await crypto.subtle.importKey("raw", as, { name: "ECDH", namedCurve: "P-256" }, false, []), ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asK }, ap.par.privateKey, 256));
  const prk = await hmac(sal, await hmac(await hmac(ap.auth, ecdh), junta(tt("WebPush: info\0"), ap.pub, as, [1])));
  const cek = (await hmac(prk, tt("Content-Encoding: aes128gcm\0\x01"))).slice(0, 16), nonce = (await hmac(prk, tt("Content-Encoding: nonce\0\x01"))).slice(0, 12);
  return new TextDecoder().decode(new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]), cif)).slice(0, -1));
}
const msg = (uid, assunto, nome, endereco) => ({ uid, recebida: "2026-11-15T12:00:00.000Z", tamanho: 900, lida: false, sinalizada: false, respondida: false, de: { nome, endereco }, para: [], assunto, message_id: null, anexo_provavel: false });

/* o service worker de verdade */
function swReal({ janelas = [], responde = true } = {}) {
  const ouvintes = {}, abertas = [], mostradas = [], mem = {};
  const caches = { open: async (n) => ({ match: async (k) => mem[n + k], put: async (k, r) => { mem[n + String(k)] = r; }, delete: async () => true }), match: async () => undefined, keys: async () => [], delete: async () => true };
  const ctx = { self: { location: { origin: SITE.slice(0, -1), href: SITE + "sw.js" }, addEventListener: (t, f) => (ouvintes[t] = f), clients: { matchAll: async () => janelas, openWindow: async (u) => { abertas.push(u); return null; }, claim: async () => {} },
      registration: { showNotification: async (t, o) => { mostradas.push({ titulo: t, ...o }); } }, skipWaiting: () => {}, navigator: {} }, caches, URL, Response, Date, JSON, Promise, console, setTimeout, clearTimeout, fetch: async () => { throw new Error("sem rede"); } };
  vm.runInNewContext(ler("sw.js"), ctx, { filename: "sw.js" });
  for (const j of janelas) { const o = j.postMessage; j.postMessage = (m) => { o(m); if (responde && m.tipo === "rac-abrir") setTimeout(() => ouvintes.message({ data: { tipo: "rac-ack" } }), 0); }; }
  return { abertas, mostradas, push: async (payload) => { let p; ouvintes.push({ data: { json: () => payload }, waitUntil: (x) => (p = x) }); await p; return mostradas.at(-1); },
    tocar: async (data) => { let p; ouvintes.notificationclick({ notification: { data, close() {} }, waitUntil: (x) => (p = x) }); await p; } };
}
const janela = (url, log = []) => { const j = { url, focused: true, visibilityState: "visible", recebidas: [], navegou: [] }; j.focus = () => Promise.resolve(j); j.postMessage = (m) => j.recebidas.push(m); j.navigate = (u) => { j.navegou.push(u); return Promise.resolve(j); }; return j; };

test("PONTA A PONTA: e-mail novo no iCloud → sincronização da rotina → título = assunto, corpo = remetente, destino = id da linha → push cifrado → sw.js mostra e o toque leva ao endereço da MESMA mensagem (fechado, aberto e suspenso)", { skip: pular, timeout: 30000 }, async () => {
  const db = await banco(), repo = criarRepositorio(sessaoDe(db)), bp = criarBancoPush(sessaoDe(db)), ap = await aparelho();
  const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]), vapid = { publica: b64u(new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey))), jwk: await crypto.subtle.exportKey("jwk", par.privateKey) };
  await db.query("insert into public.rac_segredos (chave, valor) values ('vapid', $1::text::jsonb)", [JSON.stringify(vapid)]);
  await db.query("insert into public.push_inscricoes (user_id, endpoint, p256dh, auth) values ($1, 'https://push.exemplo.net/send/1', $2, $3)", [R, ap.p256dh, ap.authB]);
  const cofre = { async ler() { return empacotar("pessoa@icloud.example", "aaaa-bbbb-cccc-dddd"); }, async marcar() {}, async guardar() {}, async remover() { return true; }, async estado() { return "ativa"; } };
  let caixa = [msg(1, "Antigo", "Velho", "velho@exemplo.com")];   // o que o "iCloud" tem agora
  const worker = { async executar(op, ped) {
    const uidnext = caixa.length + 1;
    if (op === "estado_pasta") return { ok: true, dados: { exame: { uidvalidity: 700, uidnext }, mensagens_na_pasta: caixa.length, duracao_ms: 10 } };
    const desde = ped.desde_uid ?? 1; return { ok: true, dados: { exame: { uidvalidity: 700, uidnext }, mensagens_na_pasta: caixa.length, mensagens: caixa.filter((m) => m.uid >= desde).sort((a, b) => b.uid - a.uid), mais: false, duracao_ms: 10 } };
  } };
  const enviados = [], fetchFalso = async (url, init) => { enviados.push({ url, init }); return { status: 201 }; };
  const aviso = { enviar: (dono, m) => entregar(bp, dono, m, fetchFalso) };
  const rodada = () => rodarRotina({ banco: repo, cofre, worker, aviso, registrar: () => {} });

  // 1) primeira rodada: linha de base (nada de aviso retroativo)
  const r1 = await rodada(); assert.deepEqual([r1.sincronizadas, r1.avisos, enviados.length], [1, 0, 0]);
  // 2) chega um e-mail: assunto com acento/símbolos e remetente com nome
  caixa.push(msg(2, "Nota fiscal da compra — R$ 1.234,50 <ok>", "João Silva", "exemplo@email.com"));
  const r2 = await rodada(); assert.deepEqual([r2.novas, r2.avisos, r2.falhas], [1, 1, 0]); assert.equal(enviados.length, 1);
  const linha = (await db.query("select id, pasta_id, assunto, remetente_nome, remetente_endereco, notificada_em from public.inbox_mensagens_ref where uid = 2")).rows[0];
  assert.deepEqual([linha.assunto, linha.remetente_nome, linha.remetente_endereco], ["Nota fiscal da compra — R$ 1.234,50 <ok>", "João Silva", "exemplo@email.com"], "gravados pela sincronização");
  assert.ok(linha.notificada_em, "tratada SÓ depois de o push ser aceito (201)");
  // 3) o que o aparelho recebe (decifrado)
  const payload = JSON.parse(await decifrar(enviados[0].init.body, ap));
  assert.deepEqual(payload, { titulo: "Nota fiscal da compra — R$ 1.234,50 <ok>", corpo: "João Silva — exemplo@email.com", url: "./#inbox/" + C + "/" + P + "/" + linha.id, tag: "inbox-msg-" + linha.id, badge: payload.badge, renotificar: true });
  assert.ok(Number.isInteger(payload.badge)); assert.ok(!JSON.stringify(payload).includes("Antigo"), "nada de outra mensagem");
  // 4) o sw.js mostra título/corpo/destino/tag sem alterar
  const j0 = swReal(), n = await j0.push(payload);
  assert.deepEqual([n.titulo, n.body, n.tag, n.renotify, n.data.url], [payload.titulo, payload.corpo, payload.tag, true, payload.url]);
  // 5) o toque: o destino absoluto é o do ID; o roteador aceita; o ID é o que a tela Inbox procura
  const alvo = SITE + "#inbox/" + C + "/" + P + "/" + linha.id;
  assert.equal(N.notifHash(n.data.url, SITE), "#inbox/" + C + "/" + P + "/" + linha.id);
  const fechado = swReal(); await fechado.tocar(n.data); assert.deepEqual([...fechado.abertas], [alvo], "app fechado: abre a janela no endereço da mensagem");
  const aberto = swReal({ janelas: [janela(SITE + "#inbox")] }); await aberto.tocar(n.data); /* janela já no Inbox: navega só o hash */
  const susp = janela(SITE + "#inicio"); susp.visibilityState = "hidden"; susp.focused = false; const suspenso = swReal({ janelas: [susp] }); await suspenso.tocar(n.data);
  assert.deepEqual(JSON.parse(JSON.stringify(susp.recebidas)), [{ tipo: "rac-abrir", url: alvo }]); assert.deepEqual([...susp.navegou], [alvo]); assert.deepEqual([...suspenso.abertas], []);
  const inbox = ler("js/inbox.js"); assert.match(inbox, /select\(INB_CAMPOS_MSG\)\.eq\("id",id\)/, "a tela procura a mensagem pelo id da linha");
  // 6) rodada seguinte: nada repete
  const r3 = await rodada(); assert.deepEqual([r3.avisos, enviados.length], [0, 1]);
});

test("PONTA A PONTA: três e-mails no mesmo ciclo = três notificações, cada uma com assunto/remetente/destino da própria mensagem; seis = três individuais + resumo", { skip: pular, timeout: 30000 }, async () => {
  const db = await banco(), repo = criarRepositorio(sessaoDe(db)), bp = criarBancoPush(sessaoDe(db)), ap = await aparelho();
  const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  await db.query("insert into public.rac_segredos (chave, valor) values ('vapid', $1::text::jsonb)", [JSON.stringify({ publica: b64u(new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey))), jwk: await crypto.subtle.exportKey("jwk", par.privateKey) })]);
  await db.query("insert into public.push_inscricoes (user_id, endpoint, p256dh, auth) values ($1, 'https://push.exemplo.net/send/2', $2, $3)", [R, ap.p256dh, ap.authB]);
  const cofre = { async ler() { return empacotar("pessoa@icloud.example", "aaaa-bbbb-cccc-dddd"); }, async marcar() {} };
  let caixa = [msg(1, "base", "B", "b@exemplo.com")];
  const worker = { async executar(op, ped) { const uidnext = caixa.length + 1, ex = { uidvalidity: 700, uidnext };
    return op === "estado_pasta" ? { ok: true, dados: { exame: ex, mensagens_na_pasta: caixa.length, duracao_ms: 1 } } : { ok: true, dados: { exame: ex, mensagens_na_pasta: caixa.length, mensagens: caixa.filter((m) => m.uid >= (ped.desde_uid ?? 1)).sort((a, b) => b.uid - a.uid), mais: false, duracao_ms: 1 } }; } };
  const env = []; const aviso = { enviar: (d, m) => entregar(bp, d, m, async (u, i) => { env.push(i); return { status: 201 }; }) };
  const rodada = () => rodarRotina({ banco: repo, cofre, worker, aviso, registrar: () => {} });
  await rodada();
  for (const u of [2, 3, 4]) caixa.push(msg(u, "Assunto " + u, "Nome " + u, "n" + u + "@exemplo.com"));
  await rodada(); const cargas = []; for (const e of env) cargas.push(JSON.parse(await decifrar(e.body, ap)));
  assert.equal(cargas.length, 3); for (const c of cargas) { const k = c.titulo.split(" ")[1]; assert.equal(c.corpo, "Nome " + k + " — n" + k + "@exemplo.com", "assunto e remetente da MESMA mensagem"); const id = c.url.split("/").pop(); const l = (await db.query("select uid from public.inbox_mensagens_ref where id = $1", [id])).rows[0]; assert.equal(String(l.uid), k, "o destino aponta para a linha dessa mensagem"); }
  assert.equal(new Set(cargas.map((c) => c.url)).size, 3); env.length = 0;
  for (const u of [5, 6, 7, 8, 9, 10]) caixa.push(msg(u, "Assunto " + u, "Nome " + u, "n" + u + "@exemplo.com"));
  await rodada(); const c2 = []; for (const e of env) c2.push(JSON.parse(await decifrar(e.body, ap)));
  assert.equal(c2.length, 4); assert.equal(c2.filter((c) => c.tag.startsWith("inbox-msg-")).length, 3); assert.deepEqual(c2.filter((c) => !c.tag.startsWith("inbox-msg-")).map((c) => [c.titulo, c.corpo]), [["RAC Inbox", "Mais 3 novas mensagens"]]);
});
