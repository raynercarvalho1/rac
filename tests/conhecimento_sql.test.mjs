// RAC Knowledge · banco (migration 062) contra o Postgres de verdade (PGlite): isolamento do dono (RLS), a casa e o estranho sem acesso, anon e service_role fechados,
// a trava "mfa", histórico só de leitura e gravado pelo gatilho, versão, dono fixo, tags normalizadas, segredo recusado e nada de DELETE pelo site.
// Dados fictícios; sem rede. Limitação: o PGlite prova o PostgreSQL (RLS, privilégios, gatilhos), não o Supabase real: depois de aplicar, rode supabase/conferencias/062_conferir_producao.sql.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite: pula, menos no CI */ }
const pular = !PGlite && !process.env.CI;
const S62 = ler("supabase/062_conhecimento.sql");
const R = "11111111-1111-4111-8111-111111111111", F = "22222222-2222-4222-8222-222222222222", X = "33333333-3333-4333-8333-333333333333";
const trecho = (arq, ini, fim) => { const t = ler(arq), i = t.indexOf(ini); assert.ok(i >= 0, ini); return t.slice(i, t.indexOf(fim, i) + fim.length); };

test("062 (texto): aplicada, uma transação, reexecutável, só cria (não apaga nem altera o que existe), RLS e mfa nas duas tabelas, nada para anon, sem DELETE e sem escrita no histórico", () => {
  const sem = S62.replace(/^--.*$/gm, "");
  assert.match(S62.split("\n")[0], /^-- Aplicado em produção em 20\/11\/2026/); assert.ok(!/-- status: pendente/.test(S62), "aplicada: o banco real tem as tabelas"); assert.match(sem, /\nbegin;[\s\S]*\ncommit;/);
  assert.ok(!/\b(drop\s+(table|policy\s+if\s+exists\s+"[^"]*"\s+on\s+public\.(?!%I)|function)|truncate|delete\s+from|alter\s+table\s+public\.(?!%I))/i.test(sem.replace(/drop policy if exists "[^"]+" on public\.%I/g, "")), "nada destrutivo fora das duas tabelas novas");
  assert.match(sem, /foreach t in array array\['conhecimento', 'conhecimento_historico'\] loop/);
  assert.match(sem, /enable row level security/); assert.match(sem, /create policy "mfa" on public\.%I as restrictive/); assert.match(sem, /revoke all on public\.%I from public, anon, authenticated, service_role/);
  assert.ok(!/grant[^;]*\b(delete)\b/i.test(sem), "o site não apaga registro"); assert.match(sem, /grant select on public\.conhecimento_historico to authenticated;/);
  assert.ok(!/grant[^;]*(anon|service_role)/i.test(sem.replace(/revoke[^;]*;/g, "")), "nenhum privilégio para anon nem service_role");
  assert.match(sem, /create or replace function public\.conhecimento_guarda\(\) returns trigger\s+language plpgsql security definer set search_path = ''/);
  assert.match(sem, /revoke all on function public\.conhecimento_guarda\(\) from public, anon, authenticated, service_role;/); assert.match(sem, /revoke all on function public\.conhecimento_segredo\(text\) from public, anon, authenticated, service_role;/);
  assert.match(sem, /insert into public\.seguranca_catalogo[\s\S]*'conhecimento'[\s\S]*'conhecimento_historico'/);
  const conf = ler("supabase/conferencias/062_conferir_producao.sql"); assert.ok(!/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate)\b/i.test(conf.replace(/^--.*$/gm, "").replace(/'[^']*'/g, "''")), "a conferência é só leitura");
});

async function banco({ com050 = false } = {}) {
  const db = await PGlite.create();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    create schema auth; grant usage on schema auth to anon, authenticated, service_role;
    create table auth.users (id uuid primary key); create table auth.mfa_factors (user_id uuid, status text);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub', '')::uuid $$;
    insert into auth.users values ('${R}'), ('${F}'), ('${X}');
  `);
  await db.exec(trecho("supabase/002_casa_compartilhada.sql", "create table if not exists public.membros", "grant execute on function public.dono_da_casa() to authenticated;"));
  await db.exec(trecho("supabase/022_seguranca.sql", "create or replace function public.rac_aal_ok()", "grant execute on function public.rac_aal_ok() to authenticated;"));
  await db.exec(`insert into public.membros (membro, dono) values ('${F}', '${R}');`);
  if (com050) await db.exec(ler("supabase/050_seguranca_catalogo.sql"));
  await db.exec(S62); await db.exec(S62);   // idempotente
  return db;
}
async function como(db, uid, sql, params = [], aal = "aal1", papel = "authenticated") {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(uid ? { sub: uid, role: papel, aal } : { role: papel })]);
  await db.exec("set role " + papel);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); }
}
async function admin(db, sql, params = []) { await db.query("select set_config('request.jwt.claims', '', false)"); await db.exec("reset role"); return (await db.query(sql, params)).rows; }
const codigo = async (p) => { try { await p; } catch (e) { return e.code || String(e.message); } return null; };
const novo = (db, uid, o = {}, aal = "aal1") => como(db, uid, `insert into public.conhecimento (tipo, titulo, conteudo, tags, categoria${o.ref ? ", ref_externa" : ""}) values ($1, $2, $3, $4, $5${o.ref ? ", $6" : ""}) returning id, versao`,
  [o.tipo || "regra", o.titulo || "Regra de teste", o.conteudo || "texto", o.tags || ["Banco", " banco ", "rls"], o.categoria || "teste", ...(o.ref ? [o.ref] : [])], aal);

test("PGlite · a 062 roda duas vezes; o dono cria e lê; versão 1; tags normalizadas (minúsculas, sem repetir); data e estado com padrão", { skip: pular }, async () => {
  const db = await banco(); const [a] = await novo(db, R);
  assert.equal(a.versao, 1);
  const l = await como(db, R, "select tags, estado, data_ref, editado_no_site, origem_hash from public.conhecimento");
  assert.deepEqual(l[0].tags, ["banco", "rls"]); assert.equal(l[0].estado, "ativo"); assert.ok(l[0].data_ref); assert.equal(l[0].editado_no_site, false);
});

test("PGlite · isolamento: a casa (Fernanda), um estranho e o anon não leem, não gravam e não alteram; o service_role não tem privilégio de tabela", { skip: pular }, async () => {
  const db = await banco(); await novo(db, R);
  /* a casa nunca lê nem grava; outro usuário autenticado (que não existe no uso real) só enxerga o que ele mesmo criou, nunca o do dono */
  assert.equal((await como(db, F, "select * from public.conhecimento")).length, 0, "a casa não lê"); assert.equal(await codigo(novo(db, F)), "42501", "a casa não grava (RLS)");
  assert.equal((await como(db, F, "update public.conhecimento set titulo = 'invadido' returning id")).length, 0, "a casa não altera");
  assert.equal((await como(db, X, "select * from public.conhecimento")).length, 0, "o estranho não lê o do dono");
  assert.equal((await como(db, X, "update public.conhecimento set titulo = 'invadido' returning id")).length, 0, "o estranho não altera o do dono");
  await novo(db, X, { titulo: "Do estranho" }); assert.equal((await como(db, R, "select * from public.conhecimento")).length, 1, "o dono não vê o do estranho");
  assert.equal(await codigo(como(db, null, "select * from public.conhecimento", [], "aal1", "anon")), "42501", "anon sem privilégio");
  assert.equal(await codigo(como(db, null, "select * from public.conhecimento_historico", [], "aal1", "anon")), "42501");
  assert.equal(await codigo(como(db, R, "select * from public.conhecimento", [], "aal1", "service_role")), "42501", "service_role sem privilégio de tabela");
  assert.equal(await codigo(como(db, R, "select * from public.conhecimento_historico", [], "aal1", "service_role")), "42501");
  assert.equal((await admin(db, "select count(*)::int n from public.conhecimento where titulo = 'Regra de teste'"))[0].n, 1, "o registro do dono está intacto");
  assert.equal(await codigo(como(db, R, `insert into public.conhecimento (dono, tipo, titulo) values ('${X}', 'regra', 'em nome de outro')`)), "42501", "o dono não grava em nome de outro");
});

test("PGlite · trava mfa: quem tem fator confirmado só lê e grava com aal2; quem não tem passa como hoje", { skip: pular }, async () => {
  const db = await banco(); await novo(db, R);
  await admin(db, `insert into auth.mfa_factors values ('${R}', 'verified')`);
  assert.equal((await como(db, R, "select * from public.conhecimento", [], "aal1")).length, 0, "aal1 com fator: não vê nada");
  assert.equal(await codigo(novo(db, R, {}, "aal1")), "42501", "aal1 com fator: não grava");
  assert.equal((await como(db, R, "select * from public.conhecimento", [], "aal2")).length, 1, "aal2 vê");
  assert.equal((await como(db, R, "select * from public.conhecimento_historico", [], "aal1")).length, 0);
  const pol = (await admin(db, "select tablename, policyname, permissive from pg_policies where schemaname = 'public' and tablename like 'conhecimento%' order by 1, 2")).map((p) => `${p.tablename}:${p.policyname}:${p.permissive}`);
  assert.deepEqual(pol, ["conhecimento:mfa:RESTRICTIVE", "conhecimento:so o dono:PERMISSIVE", "conhecimento_historico:mfa:RESTRICTIVE", "conhecimento_historico:so o dono:PERMISSIVE"]);
});

test("PGlite · histórico: cada alteração guarda a versão anterior (pelo gatilho); o site só lê; não se burla nem se apaga; o dono é fixo", { skip: pular }, async () => {
  const db = await banco(); const [a] = await novo(db, R, { tipo: "erro", titulo: "Erro original", conteudo: "v1" });
  const u1 = await como(db, R, "update public.conhecimento set conteudo = 'v2' where id = $1 returning versao, editado_no_site, criado_em, atualizado_em", [a.id]);
  assert.equal(u1[0].versao, 2); assert.equal(u1[0].editado_no_site, true, "alterado pelo site");
  await como(db, R, "update public.conhecimento set titulo = 'Erro novo', versao = 99, criado_em = '2000-01-01' where id = $1", [a.id]);
  const atual = (await como(db, R, "select versao, criado_em from public.conhecimento"))[0];
  assert.equal(atual.versao, 3, "a versão é do gatilho, não do cliente"); assert.ok(atual.criado_em.getFullYear() >= 2025, "criado_em não é reescrito");
  const h = await como(db, R, "select versao, operacao, snapshot->>'titulo' as titulo, snapshot->>'conteudo' as conteudo from public.conhecimento_historico order by versao");
  assert.deepEqual(h.map((x) => [x.versao, x.operacao, x.titulo, x.conteudo]), [[1, "atualizacao", "Erro original", "v1"], [2, "atualizacao", "Erro original", "v2"]]);
  assert.equal(await codigo(como(db, R, `insert into public.conhecimento_historico (conhecimento_id, versao, operacao, snapshot) values ('${a.id}', 9, 'atualizacao', '{}')`)), "42501", "o site não escreve no histórico");
  assert.equal(await codigo(como(db, R, "update public.conhecimento_historico set versao = 1")), "42501"); assert.equal(await codigo(como(db, R, "delete from public.conhecimento_historico")), "42501");
  assert.equal(await codigo(como(db, R, "delete from public.conhecimento where id = $1", [a.id])), "42501", "o site não apaga registro (arquiva)");
  assert.equal(await codigo(como(db, R, `update public.conhecimento set dono = '${X}' where id = $1`, [a.id])), "42501", "o dono não muda");
  /* a exclusão por fora do site (administrador) também deixa o registro no histórico */
  await admin(db, "delete from public.conhecimento where id = $1", [a.id]);
  assert.equal((await admin(db, "select count(*)::int n from public.conhecimento_historico where operacao = 'exclusao'"))[0].n, 1);
});

test("PGlite · importação do repositório: mudar o hash na mesma gravação não marca como editado no site; mudar só o texto marca; ref única por dono", { skip: pular }, async () => {
  const db = await banco(); const H1 = "a".repeat(64), H2 = "b".repeat(64);
  const [a] = await como(db, R, "insert into public.conhecimento (tipo, titulo, ref_externa, origem_hash) values ('regra', 'Da importação', 'regra/da-importacao', $1) returning id, editado_no_site", [H1]);
  assert.equal(a.editado_no_site, false);
  const i = await como(db, R, "update public.conhecimento set conteudo = 'novo do arquivo', origem_hash = $2, editado_no_site = false where id = $1 returning editado_no_site", [a.id, H2]);
  assert.equal(i[0].editado_no_site, false, "atualização vinda do arquivo");
  const e = await como(db, R, "update public.conhecimento set conteudo = 'editei no celular' where id = $1 returning editado_no_site", [a.id]);
  assert.equal(e[0].editado_no_site, true, "edição no site");
  assert.equal(await codigo(como(db, R, "insert into public.conhecimento (tipo, titulo, ref_externa) values ('regra', 'Outra', 'regra/da-importacao')")), "23505", "a mesma ref não entra duas vezes");
  assert.equal(await codigo(como(db, R, "insert into public.conhecimento (tipo, titulo, ref_externa) values ('regra', 'Ref ruim', 'Regra Ruim')")), "23514", "ref inválida");
});

test("PGlite · validações: tipo, estado, título curto, texto enorme e relações demais são recusados", { skip: pular }, async () => {
  const db = await banco();
  const ins = (cols, vals) => codigo(como(db, R, `insert into public.conhecimento (${cols}) values (${vals})`));
  assert.equal(await ins("tipo, titulo", "'bobagem', 'Título bom'"), "23514"); assert.equal(await ins("tipo, titulo, estado", "'regra', 'Título bom', 'apagado'"), "23514");
  assert.equal(await ins("tipo, titulo", "'regra', 'ab'"), "23514"); assert.equal(await ins("tipo, titulo, conteudo", "'regra', 'Título bom', repeat('x', 20001)"), "23514");
  assert.equal(await ins("tipo, titulo, tags", "'regra', 'Título bom', (select array_agg('t' || n) from generate_series(1, 13) n)"), "23514", "mais de 12 tags");
  assert.equal(await ins("tipo, titulo, relacionados", "'regra', 'Título bom', (select array_agg(gen_random_uuid()) from generate_series(1, 31))"), "23514", "mais de 30 relações");
  assert.equal((await como(db, R, "select count(*)::int n from public.conhecimento"))[0].n, 0);
});

test("PGlite · segredo: chave da Anthropic, do Supabase, do GitHub, JWT, chave privada e CPF são recusados em qualquer campo; texto normal passa", { skip: pular }, async () => {
  const db = await banco();
  const ruins = ["sk-ant-api03-" + "A".repeat(30), "sb_secret_" + "b".repeat(20), "ghp_" + "c".repeat(36), "github_pat_" + "d".repeat(40), "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk1234", "-----BEGIN PRIVATE KEY-----", "123.456.789-09", "AIza" + "e".repeat(35)];
  for (const r of ruins) {
    assert.equal(await codigo(como(db, R, "insert into public.conhecimento (tipo, titulo, conteudo) values ('erro', 'Com segredo', $1)", [r])), "23514", "conteúdo: " + r.slice(0, 12));
    assert.equal(await codigo(como(db, R, "insert into public.conhecimento (tipo, titulo, causa) values ('erro', 'Com segredo', $1)", [r])), "23514", "causa: " + r.slice(0, 12));
  }
  assert.equal(await codigo(como(db, R, "insert into public.conhecimento (tipo, titulo, tags) values ('erro', 'Com segredo', array[$1])", ["sk-ant-api03-" + "A".repeat(30)])), "23514", "tag");
  const ok = await como(db, R, "insert into public.conhecimento (tipo, titulo, conteudo) values ('regra', 'Chave pública ok', 'A chave sb_publishable_xyz é pública; service_role nunca vai ao navegador (CPF 12345678909 sem máscara não casa)') returning id");
  assert.equal(ok.length, 1);
});

test("PGlite · as funções do gatilho estão fechadas: ninguém do site chama conhecimento_segredo nem conhecimento_guarda", { skip: pular }, async () => {
  const db = await banco();
  assert.equal(await codigo(como(db, R, "select public.conhecimento_segredo('x')")), "42501"); assert.equal(await codigo(como(db, null, "select public.conhecimento_segredo('x')", [], "aal1", "anon")), "42501");
  const f = await admin(db, "select proname, prosecdef, proconfig::text from pg_proc where pronamespace = 'public'::regnamespace and proname = 'conhecimento_guarda'");
  assert.equal(f[0].prosecdef, true); assert.ok(f[0].proconfig.includes("search_path="), "search_path fixo (vazio)");
});

test("PGlite · com a 050 já aplicada, as duas tabelas entram no catálogo da auditoria (e a 062 roda de novo sem erro)", { skip: pular }, async () => {
  const db = await banco({ com050: true });
  const c = await admin(db, "select tabela, trava_mfa, backup, origem from public.seguranca_catalogo where tabela like 'conhecimento%' order by 1");
  assert.deepEqual(c.map((x) => [x.tabela, x.trava_mfa, x.backup, x.origem]), [["conhecimento", true, true, "062"], ["conhecimento_historico", true, true, "062"]]);
});
