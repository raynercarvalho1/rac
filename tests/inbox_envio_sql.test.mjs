// RAC Inbox · I3 · migration 056 (PREPARADA, NÃO APLICADA em produção) e o repositório SQL do controle de envio (supabase/functions/rac-inbox/repositorio.ts), num Postgres de verdade dentro do Node (PGlite).
// Prova o que o envio precisa do banco: o mesmo envio_id nunca vira dois envios, "falha" confirmada pode ser tentada de novo, "incerto" e "enviado" nunca, o id de outro dono não revela nada, e a tabela não guarda
// conteúdo (assunto, texto, endereços de destinatário, credencial). Limitação: o PGlite prova o PostgreSQL, não o Supabase real nem a concorrência entre conexões.
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
const S56 = ler("supabase/056_inbox_envios.sql");
const R = "11111111-1111-4111-8111-111111111111", F = "22222222-2222-4222-8222-222222222222", X = "33333333-3333-4333-8333-333333333333";
const E1 = "eeeeeeee-0000-4000-8000-000000000001", MID = "<eeeeeeee-0000-4000-8000-000000000001@icloud.example>";

test("no CI o PGlite está instalado: os testes de banco da 056 não podem ser pulados", () => { if (process.env.CI) assert.ok(PGlite, "sem PGlite no CI"); });

test("056 (texto): pendente, uma transação, reexecutável, nada destrutivo, só metadados (nenhuma coluna de conteúdo ou segredo) e o site só LÊ", () => {
  assert.equal(S56.split("\n")[0], "-- status: pendente"); assert.match(S56, /NÃO APLICADA/); assert.match(S56, /\nbegin;[\s\S]*\ncommit;/);
  const s = semComent(S56);
  assert.ok(!/\bdrop\s+(table|column)|\btruncate\b|\bdelete\s+from|service_role|disable row level/i.test(s), "nada destrutivo");
  assert.match(s, /create table if not exists public\.inbox_envios/); assert.match(s, /enable row level security/); assert.match(s, /foreach t in array array\['inbox_envios'\] loop/);
  assert.match(s, /grant select on public\.inbox_envios to authenticated;/); assert.ok(!/grant\s+(insert|update|delete|all)[^;]*inbox_envios/i.test(s), "o navegador não grava nem apaga");
  assert.match(s, /as restrictive for all to authenticated/); assert.match(s, /revoke all on public\.%I from public, anon, authenticated/);
  const colunas = [...s.matchAll(/^\s{2}(\w+)\s+(?:uuid|text|smallint|timestamptz)\b/gm)].map((m) => m[1]);
  assert.deepEqual(colunas, ["id", "dono", "conta_id", "estado", "message_id", "modo", "destinatarios", "codigo", "criado_em", "atualizado_em"]);
  assert.ok(!colunas.some((c) => /assunto|texto|corpo|body|html|destinatario_|endereco|cc|cco|senha|token|segredo|credencial|anexo/i.test(c)), "nada do conteúdo do e-mail");
  assert.match(S56, /'056'/, "catalogada na auditoria (seguranca_catalogo)");
});

async function banco() {
  const db = await PGlite.create();
  const trecho = (arq, ini, fim) => { const t = ler(arq), i = t.indexOf(ini); assert.ok(i >= 0, ini); return t.slice(i, t.indexOf(fim, i) + fim.length); };
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    create schema auth; grant usage on schema auth to anon, authenticated, service_role;
    create table auth.users (id uuid primary key); create table auth.mfa_factors (user_id uuid, status text);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub', '')::uuid $$;
    insert into auth.users values ('${R}'), ('${F}'), ('${X}');
    create schema storage; create table storage.buckets (id text primary key, name text, public boolean default false);
  `);
  await db.exec(trecho("supabase/002_casa_compartilhada.sql", "create table if not exists public.membros", "grant execute on function public.dono_da_casa() to authenticated;"));
  await db.exec(trecho("supabase/022_seguranca.sql", "create or replace function public.rac_aal_ok()", "grant execute on function public.rac_aal_ok() to authenticated;"));
  await db.exec(`insert into public.membros (membro, dono) values ('${F}', '${R}');`);
  await db.exec(ler("supabase/051_inbox_fundacao.sql")); await db.exec(ler("supabase/053_inbox_cabecalhos.sql"));
  await db.exec(S56); await db.exec(S56);   // reexecutável
  return db;
}
const sessaoDe = (q) => ({ exec: async (t, p = []) => (await q.query(t, p)).rows, transacao: (f) => (q.transaction ? q.transaction(async (tx) => f(sessaoDe(tx))) : f(sessaoDe(q))) });
async function como(db, papel, uid, sql, params = [], aal = "aal1") {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, role: papel, aal })]); await db.exec("set role " + papel);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); }
}
const codigo = async (p) => { try { await p; } catch (e) { return e.code || String(e.message); } return null; };
async function conta(db, dono = R, ender = "pessoa@icloud.example") { return (await db.query("insert into public.inbox_contas (dono, provedor, apelido, endereco) values ($1, 'icloud', 'Pessoal', $2) returning id", [dono, ender])).rows[0].id; }
const A = (n = 1, modo = "novo") => ({ message_id: MID, modo, destinatarios: n });

test("PGlite · envioIniciar: primeira vez reserva; repetição do MESMO envio não vira dois; falha confirmada pode tentar de novo; enviado e incerto nunca", { skip: pular }, async () => {
  const db = await banco(), repo = criarRepositorio(sessaoDe(db)), c = await conta(db);
  assert.deepEqual(await repo.envioIniciar(R, c, E1, A(2)), { novo: true, estado: "pendente", message_id: MID });
  assert.deepEqual(await repo.envioIniciar(R, c, E1, A(2)), { novo: false, estado: "pendente", message_id: MID }, "dois toques seguidos: o segundo não transmite");
  await repo.envioFinalizar(R, c, E1, "falha", "destinatario_recusado");
  assert.deepEqual(await repo.envioIniciar(R, c, E1, A(2)), { novo: true, estado: "pendente", message_id: MID }, "recusa confirmada: tentar de novo é seguro");
  await repo.envioFinalizar(R, c, E1, "incerto", "envio_incerto");
  assert.deepEqual(await repo.envioIniciar(R, c, E1, A(2)), { novo: false, estado: "incerto", message_id: MID }, "incerto: nunca reenvia sozinho");
  await repo.envioFinalizar(R, c, E1, "enviado", null);   // só finaliza quem está pendente: o incerto não vira enviado por engano
  assert.equal((await db.query("select estado from public.inbox_envios where id = $1", [E1])).rows[0].estado, "incerto");
  const E2 = "eeeeeeee-0000-4000-8000-000000000002";
  await repo.envioIniciar(R, c, E2, A(1)); await repo.envioFinalizar(R, c, E2, "enviado", null);
  assert.deepEqual(await repo.envioIniciar(R, c, E2, A(1)), { novo: false, estado: "enviado", message_id: MID }); assert.equal((await db.query("select count(*)::int n from public.inbox_envios")).rows[0].n, 2);
});

test("PGlite · pendente de mais de 2 minutos (a chamada morreu) vira incerto, nunca é reenviado", { skip: pular }, async () => {
  const db = await banco(), repo = criarRepositorio(sessaoDe(db)), c = await conta(db);
  await repo.envioIniciar(R, c, E1, A()); await db.exec("alter table public.inbox_envios disable trigger inbox_integridade");   // (o gatilho de integridade carimba atualizado_em; aqui envelhecemos o registro de propósito)
  await db.query("update public.inbox_envios set atualizado_em = now() - interval '5 minutes' where id = $1", [E1]); await db.exec("alter table public.inbox_envios enable trigger inbox_integridade");
  assert.deepEqual(await repo.envioIniciar(R, c, E1, A()), { novo: false, estado: "incerto", message_id: MID });
});

test("PGlite · isolamento: o envio_id de outro dono ou de outra conta não revela estado e não reserva; endereço da conta e pasta por uso só do dono", { skip: pular }, async () => {
  const db = await banco(), repo = criarRepositorio(sessaoDe(db)), c = await conta(db), cX = await conta(db, X, "outra@icloud.example");
  await repo.envioIniciar(R, c, E1, A()); await repo.envioFinalizar(R, c, E1, "enviado", null);
  assert.equal(await repo.envioIniciar(X, cX, E1, A()), null, "outro dono usando o mesmo id: nada"); assert.equal(await repo.envioIniciar(R, cX, E1, A()), null, "conta de outro dono");
  assert.equal(await repo.contaEndereco(R, c), "pessoa@icloud.example"); assert.equal(await repo.contaEndereco(X, c), null, "endereço de conta alheia não sai"); assert.equal(await repo.contaEndereco(R, cX), null);
  await db.query("insert into public.inbox_pastas (dono, conta_id, nome_externo, nome_exibicao, uso) values ($1, $2, 'Sent Messages', 'Enviados', 'enviados')", [R, c]);
  assert.equal((await repo.pastaPorUso(R, c, "enviados")).nome_externo, "Sent Messages"); assert.equal(await repo.pastaPorUso(X, c, "enviados"), null); assert.equal(await repo.pastaPorUso(R, c, "lixeira"), null);
});

test("PGlite · RLS: o dono só LÊ os próprios envios (com MFA); a casa, o anônimo e outro dono não veem nada; ninguém do site grava; checks e integridade", { skip: pular }, async () => {
  const db = await banco(), repo = criarRepositorio(sessaoDe(db)), c = await conta(db); await repo.envioIniciar(R, c, E1, A(3, "responder_todos"));
  assert.equal((await como(db, "authenticated", R, "select count(*)::int n from public.inbox_envios")).at(0).n, 1, "o dono lê");
  assert.equal((await como(db, "authenticated", F, "select count(*)::int n from public.inbox_envios")).at(0).n, 0, "a casa (Fernanda) não vê");
  assert.equal((await como(db, "authenticated", X, "select count(*)::int n from public.inbox_envios")).at(0).n, 0, "outro dono não vê");
  assert.equal(await codigo(como(db, "anon", R, "select * from public.inbox_envios")), "42501", "anônimo não tem acesso");
  for (const sql of ["insert into public.inbox_envios (id, conta_id, estado, message_id, modo, destinatarios) values (gen_random_uuid(), '" + c + "', 'enviado', '<x@y.z>', 'novo', 1)", "update public.inbox_envios set estado = 'enviado'", "delete from public.inbox_envios"]) assert.equal(await codigo(como(db, "authenticated", R, sql)), "42501", sql.split(" ")[0] + " negado ao site");
  await db.query("insert into auth.mfa_factors values ($1, 'verified')", [R]);
  assert.equal(await codigo(como(db, "authenticated", R, "select * from public.inbox_envios", [], "aal1")), null, "RLS restritiva do MFA: sem 2ª etapa não lê (0 linhas ou erro)");
  assert.equal((await como(db, "authenticated", R, "select count(*)::int n from public.inbox_envios", [], "aal1")).at(0).n, 0, "sessão aal1 de quem tem fator verificado não lê");
  assert.equal((await como(db, "authenticated", R, "select count(*)::int n from public.inbox_envios", [], "aal2")).at(0).n, 1);
  for (const [sql, esperado] of [["insert into public.inbox_envios (id, dono, conta_id, estado, message_id, modo, destinatarios) values (gen_random_uuid(), $1, $2, 'xx', '<a@b.c>', 'novo', 1)", "23514"], ["insert into public.inbox_envios (id, dono, conta_id, estado, message_id, modo, destinatarios) values (gen_random_uuid(), $1, $2, 'enviado', '<a@b.c>', 'novo', 21)", "23514"], ["insert into public.inbox_envios (id, dono, conta_id, estado, message_id, modo, destinatarios, codigo) values (gen_random_uuid(), $1, $2, 'falha', '<a@b.c>', 'novo', 1, 'Texto livre com espaço e acento ç')", "23514"]])
    assert.equal(await codigo(db.query(sql, [R, c])), esperado);
  assert.equal(await codigo(db.query("update public.inbox_envios set dono = $1", [X])), "42501", "o dono nunca muda"); assert.equal(await codigo(db.query("update public.inbox_envios set conta_id = gen_random_uuid()")), "42501", "a conta nunca muda");
  await db.query("delete from public.inbox_contas where id = $1", [c]); assert.equal((await db.query("select count(*)::int n from public.inbox_envios")).rows[0].n, 0, "apagar a conta apaga o controle (cascata)");
});
