// RAC Inbox · I3.2 · o repositório SQL do gerenciamento de mensagens (supabase/functions/rac-inbox/repositorio.ts: pastaDetalhe, mensagemRef, aplicarOrganizacao) num Postgres de verdade dentro do Node (PGlite),
// com as migrations REAIS 051, 053 e 054. SEM migration nova: o gerenciamento só usa as tabelas que já existem (RLS, trava "mfa", chaves compostas dono+conta+pasta). Tudo fictício.
// Limitação: o PGlite prova o PostgreSQL; NÃO prova o Supabase real nem o driver postgres.js da função (Deno).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { criarRepositorio } from "../supabase/functions/rac-inbox/repositorio.ts";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const semComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite: pula, menos no CI */ }
const pular = !PGlite;
const S53 = ler("supabase/053_inbox_cabecalhos.sql"), S54 = ler("supabase/054_inbox_automatico.sql");
const R = "11111111-1111-4111-8111-111111111111", F = "22222222-2222-4222-8222-222222222222", X = "33333333-3333-4333-8333-333333333333", M = "44444444-4444-4444-8444-444444444444";

/* ---------- Postgres de verdade ---------- */
const trecho = (arq, ini, fim) => { const t = ler(arq), i = t.indexOf(ini); assert.ok(i >= 0, ini); return t.slice(i, t.indexOf(fim, i) + fim.length); };
async function banco() {
  const db = await PGlite.create();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    create schema auth; grant usage on schema auth to anon, authenticated, service_role;
    create table auth.users (id uuid primary key); create table auth.mfa_factors (user_id uuid, status text);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub', '')::uuid $$;
    insert into auth.users values ('${R}'), ('${F}'), ('${X}'), ('${M}'); insert into auth.mfa_factors values ('${M}', 'verified');
    create schema storage; create table storage.buckets (id text primary key, name text, public boolean default false);
  `);
  await db.exec(trecho("supabase/002_casa_compartilhada.sql", "create table if not exists public.membros", "grant execute on function public.dono_da_casa() to authenticated;"));
  await db.exec(trecho("supabase/022_seguranca.sql", "create or replace function public.rac_aal_ok()", "grant execute on function public.rac_aal_ok() to authenticated;"));
  await db.exec(`insert into public.membros (membro, dono) values ('${F}', '${R}');`);
  await db.exec(ler("supabase/051_inbox_fundacao.sql"));
  await db.exec(S53);
  await db.exec(S53);   // reexecutável: roda de novo sem erro
  await db.exec(S54);   // 054 (rotina automática: preferências, controle e deduplicação do aviso)
  await db.exec(S54);
  return db;
}
const sessaoDe = (q) => ({ exec: async (t, p = []) => (await q.query(t, p)).rows, transacao: (f) => (q.transaction ? q.transaction(async (tx) => f(sessaoDe(tx))) : f(sessaoDe(q))) });
async function como(db, papel, uid, sql, params = [], aal = "aal1") {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, role: papel, aal })]); await db.exec("set role " + papel);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); }
}
const codigo = async (p) => { try { await p; } catch (e) { return e.code || String(e.message); } return null; };
async function conta(db, dono = R, end = "pessoa@icloud.example") { return (await db.query("insert into public.inbox_contas (dono, provedor, apelido, endereco) values ($1, 'icloud', 'Pessoal', $2) returning id", [dono, end])).rows[0].id; }
const msg = (uid, extra = {}) => ({ uid, recebida: "2026-11-14T10:" + String(uid).padStart(2, "0") + ":00.000Z", tamanho: 1000 + uid, lida: false, sinalizada: false, respondida: false, de: { nome: "Ana", endereco: "ana@exemplo.com" }, para: [{ nome: "Eu", endereco: "eu@icloud.com" }], assunto: "Assunto " + uid, message_id: "<m" + uid + "@x>", anexo_provavel: false, ...extra });
const sync = (uidvalidity, mensagens, extra = {}) => ({ uidvalidity, cursor: Math.max(...mensagens.map((m) => m.uid), 0) + 1, tipo: "primeira_leitura", total: mensagens.length, duracao_ms: 12, mensagens, purgar: false, removerDe: 1, removerAte: Math.max(...mensagens.map((m) => m.uid), 1), ...extra });

const P = (nome, uso) => ({ nome, nome_exibicao: nome, uso, selecionavel: true });
async function cenario(db, repo, dono = R) {
  const c = await conta(db, dono);
  const [entrada, arquivo, lixo] = await repo.salvarPastas(dono, c, [P("INBOX", "entrada"), P("Archive", "arquivo"), P("Deleted Messages", "lixo")]);
  await repo.aplicarSync(dono, c, entrada.id, sync(700, [msg(1), msg(2, { lida: true }), msg(3)]));
  await repo.aplicarSync(dono, c, arquivo.id, sync(810, [msg(7, { lida: true })]));
  return { c, entrada, arquivo, lixo };
}
const linhas = async (db, pasta) => (await db.query("select id, uid, uidvalidity, lida, id_externo, assunto, message_id, notificada_em from public.inbox_mensagens_ref where pasta_id = $1 order by uid", [pasta])).rows;
const contagem = async (db, pasta) => (await db.query("select total, nao_lidas from public.inbox_pastas where id = $1", [pasta])).rows[0];

test("PGlite · sem migration nova: o gerenciamento usa só as tabelas 051/053/054 (a 063 é só do OAuth)", () => {
  const arqs = fs.readdirSync(new URL("../supabase/", import.meta.url)).filter((f) => /^\d{3}_inbox/.test(f)).sort();
  assert.deepEqual(arqs, ["051_inbox_fundacao.sql", "052_inbox_cofre.sql", "053_inbox_cabecalhos.sql", "054_inbox_automatico.sql", "056_inbox_envios.sql", "063_inbox_oauth.sql"]);   // a 063 (OAuth) é da conexão Gmail/Outlook, não do gerenciamento
});

test("PGlite · pastaDetalhe e mensagemRef: só do dono e da conta; pasta inativa (não selecionável) e mensagem de outra conta não aparecem", { skip: pular }, async () => {
  const db = await banco(), repo = criarRepositorio(sessaoDe(db)), { c, entrada, arquivo } = await cenario(db, repo), c2 = await conta(db, X);
  assert.deepEqual(await repo.pastaDetalhe(R, c, arquivo.id), { id: arquivo.id, nome_externo: "Archive", uso: "arquivo" });
  assert.equal(await repo.pastaDetalhe(X, c, arquivo.id), null, "outro dono"); assert.equal(await repo.pastaDetalhe(R, c2, arquivo.id), null, "outra conta"); assert.equal(await repo.pastaDetalhe(R, c, "99999999-9999-4999-8999-999999999999"), null);
  const m = await repo.mensagemRef(R, c, entrada.id, 2); assert.deepEqual([m.uid, m.uidvalidity, m.lida, m.message_id, m.tamanho], [2, 700, true, m.message_id, 1002]);
  assert.equal(await repo.mensagemRef(X, c, entrada.id, 2), null, "a mensagem de outro dono não é vista"); assert.equal(await repo.mensagemRef(R, c, arquivo.id, 2), null, "UID de outra pasta"); assert.equal(await repo.mensagemRef(R, c, entrada.id, 99), null);
  await repo.salvarPastas(R, c, [P("INBOX", "entrada")]);   // o Arquivo sumiu do provedor
  assert.equal(await repo.pastaDetalhe(R, c, arquivo.id), null, "pasta inativa não é destino");
});

test("PGlite · lida: muda só a flag da mensagem e recalcula as não lidas; outro dono não consegue; repetir não duplica nada", { skip: pular }, async () => {
  const db = await banco(), repo = criarRepositorio(sessaoDe(db)), { c, entrada } = await cenario(db, repo);
  assert.deepEqual(await contagem(db, entrada.id), { total: 3, nao_lidas: 2 });
  const m1 = await repo.mensagemRef(R, c, entrada.id, 1);
  await repo.aplicarOrganizacao(R, c, { tipo: "lida", mensagemId: m1.id, pastaId: entrada.id, lida: true });
  assert.deepEqual((await linhas(db, entrada.id)).map((l) => [l.uid, l.lida]), [[1, true], [2, true], [3, false]]); assert.deepEqual(await contagem(db, entrada.id), { total: 3, nao_lidas: 1 });
  await repo.aplicarOrganizacao(R, c, { tipo: "lida", mensagemId: m1.id, pastaId: entrada.id, lida: true });   // repetição
  assert.deepEqual(await contagem(db, entrada.id), { total: 3, nao_lidas: 1 }); assert.equal((await linhas(db, entrada.id)).length, 3);
  await repo.aplicarOrganizacao(R, c, { tipo: "lida", mensagemId: m1.id, pastaId: entrada.id, lida: false });
  assert.deepEqual(await contagem(db, entrada.id), { total: 3, nao_lidas: 2 }, "não lida de novo");
  await repo.aplicarOrganizacao(X, c, { tipo: "lida", mensagemId: m1.id, pastaId: entrada.id, lida: true });   // outro dono: o filtro por dono não acha a linha
  assert.equal((await linhas(db, entrada.id))[0].lida, false, "a mensagem do dono R não muda por pedido de X");
});

test("PGlite · mover com o UID novo (COPYUID): a linha sai da origem e entra no destino já tratada (sem aviso), com o novo id_externo; totais e não lidas das DUAS pastas; repetir não duplica nem desconta duas vezes", { skip: pular }, async () => {
  const db = await banco(), repo = criarRepositorio(sessaoDe(db)), { c, entrada, arquivo } = await cenario(db, repo);
  const m1 = await repo.mensagemRef(R, c, entrada.id, 1);   // não lida
  const a = { tipo: "mover", mensagemId: m1.id, pastaId: entrada.id, destinoPastaId: arquivo.id, destinoUidvalidity: 810, destinoUid: 20 };
  await repo.aplicarOrganizacao(R, c, a);
  assert.deepEqual((await linhas(db, entrada.id)).map((l) => l.uid), [2, 3], "saiu da origem");
  const dest = await linhas(db, arquivo.id); assert.deepEqual(dest.map((l) => [l.uid, l.uidvalidity, l.id_externo, l.lida, l.assunto]), [["7", "810", "810:7", true, "Assunto 7"], ["20", "810", "810:20", false, "Assunto 1"]].map((x) => [Number(x[0]), Number(x[1]), x[2], x[3], x[4]]));
  assert.ok(dest[1].notificada_em, "a linha do destino nasce tratada: mover não gera aviso de e-mail novo"); assert.equal(dest[1].message_id, m1.message_id, "a identidade (Message-ID) acompanha");
  assert.deepEqual(await contagem(db, entrada.id), { total: 2, nao_lidas: 1 }); assert.deepEqual(await contagem(db, arquivo.id), { total: 2, nao_lidas: 1 });
  await repo.aplicarOrganizacao(R, c, a);   // repetição acidental
  assert.deepEqual((await linhas(db, arquivo.id)).map((l) => l.uid), [7, 20], "sem duplicar no destino"); assert.deepEqual(await contagem(db, entrada.id), { total: 2, nao_lidas: 1 }); assert.deepEqual(await contagem(db, arquivo.id), { total: 2, nao_lidas: 1 }, "sem descontar nem somar de novo");
  // depois da próxima sincronização do destino a mesma linha é atualizada, nunca duplicada (a identidade é uidvalidity:uid)
  await repo.aplicarSync(R, c, arquivo.id, sync(810, [msg(20), msg(7, { lida: true })]));
  assert.equal((await linhas(db, arquivo.id)).length, 2);
});

test("PGlite · mover sem o UID novo: só tira da origem (a próxima sincronização traz o destino); linha já existente no destino não é duplicada nem recontada", { skip: pular }, async () => {
  const db = await banco(), repo = criarRepositorio(sessaoDe(db)), { c, entrada, arquivo, lixo } = await cenario(db, repo);
  const m3 = await repo.mensagemRef(R, c, entrada.id, 3);
  await repo.aplicarOrganizacao(R, c, { tipo: "mover", mensagemId: m3.id, pastaId: entrada.id, destinoPastaId: lixo.id });
  assert.deepEqual((await linhas(db, entrada.id)).map((l) => l.uid), [1, 2]); assert.equal((await linhas(db, lixo.id)).length, 0); assert.deepEqual(await contagem(db, entrada.id), { total: 2, nao_lidas: 1 });
  const m1 = await repo.mensagemRef(R, c, entrada.id, 1);
  await repo.aplicarOrganizacao(R, c, { tipo: "mover", mensagemId: m1.id, pastaId: entrada.id, destinoPastaId: arquivo.id, destinoUidvalidity: 810, destinoUid: 7 });   // o destino JÁ tem 810:7
  assert.deepEqual((await linhas(db, arquivo.id)).map((l) => l.uid), [7], "sem duplicar"); assert.deepEqual(await contagem(db, arquivo.id), { total: 1, nao_lidas: 0 }, "não conta duas vezes");
});

test("PGlite · integridade: destino de OUTRA conta ou de outro dono derruba a transação inteira (a mensagem NÃO some da origem); a função nunca passa pelo RLS, mas as chaves compostas mantêm o isolamento", { skip: pular }, async () => {
  const db = await banco(), repo = criarRepositorio(sessaoDe(db)), { c, entrada } = await cenario(db, repo), c2 = await conta(db, R, "outra@icloud.example");
  const [outra] = await repo.salvarPastas(R, c2, [P("INBOX", "entrada")]), [alheia] = await repo.salvarPastas(X, await conta(db, X), [P("INBOX", "entrada")]);
  const m1 = await repo.mensagemRef(R, c, entrada.id, 1);
  for (const destino of [outra.id, alheia.id]) {
    await assert.rejects(repo.aplicarOrganizacao(R, c, { tipo: "mover", mensagemId: m1.id, pastaId: entrada.id, destinoPastaId: destino, destinoUidvalidity: 5, destinoUid: 5 }), /./);
    assert.deepEqual((await linhas(db, entrada.id)).map((l) => l.uid), [1, 2, 3], "tudo ou nada: a mensagem continua na origem");
  }
  assert.deepEqual(await contagem(db, entrada.id), { total: 3, nao_lidas: 2 });
});

test("PGlite · RLS, trava MFA e privilégios das tabelas do Inbox seguem como estavam (o gerenciamento não pediu nada novo para o site: ele só LÊ o cache; quem grava é a função)", { skip: pular }, async () => {
  const db = await banco(), repo = criarRepositorio(sessaoDe(db)), { c, entrada } = await cenario(db, repo);
  const m1 = await repo.mensagemRef(R, c, entrada.id, 1);
  assert.ok(await codigo(como(db, "anon", R, "select id from public.inbox_mensagens_ref")), "anon não tem nem o privilégio de ler");
  assert.equal((await como(db, "authenticated", R, "select id from public.inbox_mensagens_ref where id = $1", [m1.id])).length, 1, "o dono lê o próprio cache");
  assert.equal((await como(db, "authenticated", X, "select id from public.inbox_mensagens_ref where id = $1", [m1.id])).length, 0, "outro usuário não vê");
  assert.equal((await como(db, "authenticated", F, "select id from public.inbox_mensagens_ref")).length, 0, "a casa (Fernanda) não vê nada do Inbox");
  assert.equal((await como(db, "authenticated", M, "select id from public.inbox_mensagens_ref where id = $1", [m1.id])).length, 0, "com 2ª etapa exigida e sessão aal1, nada");
  const upd = await codigo(como(db, "authenticated", R, "update public.inbox_mensagens_ref set lida = true where id = $1", [m1.id])); assert.ok(upd, "o site não altera o cache (sem privilégio de update): só a função grava");
});
