// Auditoria de segurança sem lista fixa (Fase 2 · A6; docs/planejamento/02-auditoria-arquitetural.md, P-11; docs/seguranca.md, "Catálogo da
// auditoria"). A migration 050 (PREPARADA, NÃO APLICADA) cria o catálogo public.seguranca_catalogo e recria seguranca_estado() lendo dele.
// Duas partes:
//  · texto e cobertura (sem banco): o catálogo tem as mesmas 44 tabelas da 048 com a trava, o backup do site (NUCLEO.SEG_TABELAS) e o teste de
//    segurança com o banco real cobrem as pessoais, toda tabela criada pelas migrations está catalogada, e migration nova não escapa do catálogo;
//  · Postgres de verdade (PGlite): a 050 roda duas vezes, ninguém do site mexe no catálogo, as verificações de antes dão o mesmo resultado, e
//    uma tabela nova aparece na auditoria só quando entra no catálogo, SEM recriar a função (e não entra sozinha por existir).
// Tudo fictício, sem rede e sem tocar no Supabase. Limitação: o PGlite prova o PostgreSQL (RLS, privilégios, checks), não o Supabase real.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const semComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite: pula, menos no CI */ }
const pular = !PGlite;
createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const S48 = ler("supabase/048_radar_descoberta.sql"), S50 = ler("supabase/050_seguranca_catalogo.sql");
const PESSOAIS_048 = [...(/pessoais text\[\] := array\[([\s\S]*?)\];/.exec(S48)[1].matchAll(/'([a-z_]+)'/g))].map((m) => m[1]);
/* as linhas do catálogo, lidas do texto da 050 */
const CATALOGO = [...S50.matchAll(/^  \('([a-z_]+)', (true|false), (true|false), '([0-9a-z]+)', '([^']+)'\)/gm)].map((m) => ({ tabela: m[1], trava: m[2] === "true", backup: m[3] === "true", origem: m[4] }));
const MIGRATIONS = fs.readdirSync(new URL("../supabase/", import.meta.url)).filter((f) => /^\d{3}_.*\.sql$|^schema\.sql$/.test(f)).sort();
const fn = (t) => { const i = t.indexOf("create or replace function public.seguranca_estado()"); return t.slice(i, t.indexOf("grant execute on function public.seguranca_estado() to authenticated;", i)); };

test("no CI o PGlite está instalado: os testes de banco desta migration não podem ser pulados", () => {
  if (process.env.CI) assert.ok(PGlite, "sem PGlite no CI (testes.yml instala o @electric-sql/pglite)");
});

test("050 (texto): pendente (não aplicada), uma transação, reexecutável, nada destrutivo, e a função é a da 048 com o catálogo no lugar da lista", () => {
  assert.equal(S50.split("\n")[0], "-- status: pendente", "o banco real ainda não tem: tests/banco.test.mjs a trata como pendente (todo)");
  assert.match(S50, /NÃO APLICADA/); assert.match(S50, /\nbegin;[\s\S]*\ncommit;/);
  const s = semComent(S50);
  assert.match(s, /create table if not exists public\.seguranca_catalogo \(/); assert.match(s, /on conflict \(tabela\) do nothing;/); assert.match(s, /create or replace function public\.seguranca_estado\(\)/);
  assert.ok(!/\b(drop\s+(table|policy|function)|truncate|delete\s+from|update\s+public\.|alter\s+table\s+public\.(?!seguranca_catalogo))/i.test(s), "não apaga nem altera nada que já existe");
  assert.match(s, /alter table public\.seguranca_catalogo enable row level security;/); assert.match(s, /revoke all on public\.seguranca_catalogo from public, anon, authenticated, service_role;/);
  assert.ok(!/grant[^;]*seguranca_catalogo/i.test(s), "nenhum privilégio no catálogo para o site");
  assert.match(s, /revoke all on function public\.seguranca_estado\(\) from public, anon;/); assert.match(s, /grant execute on function public\.seguranca_estado\(\) to authenticated;/);
  /* a função: igual à da 048, trocando só a lista fixa pelo catálogo e acrescentando os dois itens informativos */
  const novo = fn(S50).replace(/\s+/g, " "), velho = fn(S48).replace(/\s+/g, " ");
  assert.ok(!/pessoais text\[\]|unnest\(pessoais\)/.test(novo), "sem lista fixa");
  const semNovos = novo.replace(/ 'fora_do_catalogo', [\s\S]*?'catalogo_sem_tabela', [\s\S]*?'\[\]'::jsonb\),/, "")
    .replace("'sem_trava_mfa', coalesce((select jsonb_agg(k.tabela order by k.tabela) from public.seguranca_catalogo k where k.trava_mfa and pg_catalog.to_regclass('public.' || k.tabela) is not null and not exists (select 1 from pg_catalog.pg_policies p where p.schemaname = 'public' and p.tablename = k.tabela and",
      "'sem_trava_mfa', coalesce((select jsonb_agg(t order by t) from unnest(pessoais) t where pg_catalog.to_regclass('public.' || t) is not null and not exists (select 1 from pg_catalog.pg_policies p where p.schemaname = 'public' and p.tablename = t and");
  assert.equal(semNovos, velho.replace(/ pessoais text\[\] := array\[[^\]]*\];/, ""), "o resto da conferência (RLS, anon, cofres, funções abertas, sem login) é o de antes");
});

test("o catálogo: as 44 tabelas da 048 com a trava, ia_precos e rac_segredos de fora de propósito, e ele mesmo; backup igual ao do site", () => {
  assert.equal(CATALOGO.length, 47);
  assert.deepEqual(CATALOGO.filter((c) => c.trava).map((c) => c.tabela), PESSOAIS_048, "as mesmas 44, na mesma ordem");
  assert.deepEqual(CATALOGO.filter((c) => !c.trava).map((c) => c.tabela), ["ia_precos", "rac_segredos", "seguranca_catalogo"]);
  const seg = N.SEG_TABELAS.map((d) => d.t);
  assert.deepEqual(CATALOGO.filter((c) => c.backup).map((c) => c.tabela).sort(), [...seg].sort(), "backup = true exatamente nas tabelas do backup do site (NUCLEO.SEG_TABELAS)");
  assert.ok(CATALOGO.every((c) => !c.backup || c.trava), "o que vai para o backup tem a trava");
  /* a origem de cada linha é a migration que criou a tabela */
  const origem = {};
  for (const a of MIGRATIONS) for (const m of ler("supabase/" + a).matchAll(/create table (?:if not exists )?public\.([a-z_]+)/g)) if (!origem[m[1]]) origem[m[1]] = a === "schema.sql" ? "schema" : a.slice(0, 3);
  for (const c of CATALOGO) assert.equal(c.origem, origem[c.tabela], c.tabela);
});

test("cobertura: toda tabela criada pelas migrations está no catálogo; toda tabela com trava tem a política \"mfa\" e está no teste de segurança com o banco real", () => {
  const nomes = new Set(CATALOGO.map((c) => c.tabela));
  for (const a of MIGRATIONS) {
    const t = ler("supabase/" + a), criadas = [...t.matchAll(/create table (?:if not exists )?public\.([a-z_]+)/g)].map((m) => m[1]);
    const numero = a === "schema.sql" ? 0 : +a.slice(0, 3);
    for (const x of criadas) {
      if (numero > 50) assert.match(t, new RegExp(`insert into public\\.seguranca_catalogo[\\s\\S]*'${x}'`), `${a} cria ${x} e não a inclui no catálogo da auditoria (docs/seguranca.md, "Catálogo da auditoria")`);
      else assert.ok(nomes.has(x), `${x} (${a}) fora do catálogo da 050`);
    }
  }
  const listaMfa = (txt) => [...(/foreach t in array array\[([\s\S]*?)\] loop/.exec(txt) || [, ""])[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  const comMfa = new Set(["022_seguranca.sql", "033_seguranca_compras_fiscal.sql", "037_notas_fiscais_foto_pdf.sql", "043_radar_precos.sql", "048_radar_descoberta.sql"].flatMap((a) => listaMfa(ler("supabase/" + a))));
  comMfa.add("seguranca_eventos");   // a 022 cria a trava dela à parte (create policy "mfa" on public.seguranca_eventos)
  assert.match(ler("supabase/022_seguranca.sql"), /create policy "mfa" on public\.seguranca_eventos as restrictive/);
  const testeReal = JSON.parse(/for \(const t of (\[[^\]]+\])\)/.exec(ler("tests/seguranca.test.mjs"))[1]);
  for (const c of CATALOGO.filter((x) => x.trava)) {
    assert.ok(comMfa.has(c.tabela), c.tabela + " sem a política \"mfa\" em nenhuma migration");
    assert.ok(testeReal.includes(c.tabela), c.tabela + " fora de tests/seguranca.test.mjs (sem login não lê)");
  }
  assert.match(ler("docs/seguranca.md"), /### Catálogo da auditoria/, "o procedimento para tabela nova está documentado");
});

test("a página Segurança: a Auditoria do dono mostra o catálogo só quando a função nova existe; a casa não vê nada novo", () => {
  const seg = ler("js/seguranca.js");
  assert.match(seg, /if\(\(e\.fora_do_catalogo\|\|\[\]\)\.length\)p\.push\("tabela fora do catálogo da auditoria: "/);
  assert.match(seg, /if\(e\.fora_do_catalogo\)li\(!e\.fora_do_catalogo\.length,"Catálogo da auditoria"/, "sem a 050 aplicada, a linha não aparece");
  assert.match(seg, /if\(isOwner\(\)\)\{root\.appendChild\(segBackupPainel\(\)\)[^\n]*segAuditoria\(\)/, "a Auditoria continua só do dono");
  assert.match(seg, /auditoria:casa\?true:/, "para a casa a nota de proteção não depende da auditoria (como antes)");
});

/* ---------------- Postgres de verdade (PGlite) ---------------- */
const R = "11111111-1111-4111-8111-111111111111";
async function banco({ com048 = true } = {}) {
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
    insert into auth.users values ('${R}');
    create schema storage; create table storage.buckets (id text primary key, name text, public boolean default false);
    insert into storage.buckets (id, name) values ('familia', 'familia'), ('backups', 'backups');
  `);
  /* as 46 tabelas de produção, só com o que a auditoria olha: RLS, nada para anon e a trava "mfa" nas pessoais */
  const todas = [...PESSOAIS_048, "ia_precos", "rac_segredos"];
  await db.exec(todas.map((t) => `create table public.${t} (id int); alter table public.${t} enable row level security; revoke all on public.${t} from anon;` +
    (PESSOAIS_048.includes(t) ? ` create policy "mfa" on public.${t} as restrictive for all to authenticated using (true);` : "")).join("\n"));
  if (com048) await db.exec(fn(S48) + "grant execute on function public.seguranca_estado() to authenticated; revoke all on function public.seguranca_estado() from public, anon;");
  return db;
}
async function como(db, papel, sql, params = [], uid = R) {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(uid ? { sub: uid, role: papel, aal: "aal1" } : { role: papel })]); await db.exec("set role " + papel);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); }
}
const codigo = async (p) => { try { await p; } catch (e) { return e.code || String(e.message); } return null; };
const estado = async (db) => (await como(db, "authenticated", "select public.seguranca_estado() as e"))[0].e;
const assinatura = async (db) => (await db.query("select p.oid::text as oid, md5(p.prosrc) as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'seguranca_estado'")).rows[0];

test("PGlite · a 050 roda duas vezes; o catálogo tem 47 linhas; anon, authenticated e service_role não leem nem gravam nele", { skip: pular }, async () => {
  const db = await banco(); await db.exec(S50); await db.exec(S50);
  assert.equal((await db.query("select count(*)::int n from public.seguranca_catalogo")).rows[0].n, 47);
  assert.equal((await db.query("select count(*)::int n from public.seguranca_catalogo where trava_mfa")).rows[0].n, 44);
  for (const papel of ["anon", "authenticated", "service_role"]) {
    assert.equal(await codigo(como(db, papel, "select * from public.seguranca_catalogo")), "42501", papel + " não lê");
    assert.equal(await codigo(como(db, papel, "insert into public.seguranca_catalogo (tabela, trava_mfa, backup, origem, motivo) values ('x', false, false, '051', 'teste')")), "42501", papel + " não inclui tabela");
    assert.equal(await codigo(como(db, papel, "update public.seguranca_catalogo set trava_mfa = false where tabela = 'pessoal'")), "42501", papel + " não tira a trava de ninguém");
    assert.equal(await codigo(como(db, papel, "delete from public.seguranca_catalogo where tabela = 'pessoal'")), "42501", papel + " não apaga");
  }
  assert.equal((await db.query("select relrowsecurity from pg_class where oid = 'public.seguranca_catalogo'::regclass")).rows[0].relrowsecurity, true);
  assert.equal(await codigo(db.query("insert into public.seguranca_catalogo (tabela, trava_mfa, backup, origem, motivo) values ('Nome Ruim', true, true, '051', 'teste')")), "23514", "nome de tabela validado");
  assert.equal(await codigo(db.query("insert into public.seguranca_catalogo (tabela, trava_mfa, backup, origem, motivo) values ('x', false, true, '051', 'teste')")), "23514", "backup sem trava não passa");
});

test("PGlite · as verificações de antes dão o mesmo resultado com a 050 (RLS, anon, trava, cofres, funções abertas), inclusive com problemas", { skip: pular }, async () => {
  const db = await banco();
  await db.exec(`drop policy "mfa" on public.pessoal; drop policy "mfa" on public.radar_precos;
    alter table public.lista disable row level security; grant select on public.orcamentos to anon; update storage.buckets set public = true where id = 'familia';
    create function public.aberta() returns int language sql security definer as $$ select 1 $$;`);
  const a = await estado(db); await db.exec(S50); const b = await estado(db);
  for (const k of ["aal", "fatores", "sem_rls", "anon_le", "sem_trava_mfa", "cofres_publicos", "funcoes_abertas"]) assert.deepEqual(b[k], a[k], k);
  assert.deepEqual(b.sem_trava_mfa, ["pessoal", "radar_precos"]); assert.deepEqual(b.sem_rls, ["lista"]); assert.deepEqual(b.anon_le, ["orcamentos"]);
  assert.deepEqual(b.cofres_publicos, ["familia"]); assert.ok(b.funcoes_abertas.includes("aberta"));
  assert.deepEqual([b.fora_do_catalogo, b.catalogo_sem_tabela], [[], []], "com as tabelas de produção, nada fora do catálogo");
  assert.ok(!("fora_do_catalogo" in a), "a função da 048 não tinha o item novo (a página só mostra a linha nova depois da 050)");
});

test("PGlite · tabela nova: não entra sozinha por existir; incluída no catálogo, aparece na auditoria SEM recriar a função", { skip: pular }, async () => {
  const db = await banco(); await db.exec(S50);
  const antes = await assinatura(db);
  await db.exec("create table public.casa_medicamentos (id int); alter table public.casa_medicamentos enable row level security; revoke all on public.casa_medicamentos from anon;");
  let e = await estado(db);
  assert.deepEqual(e.fora_do_catalogo, ["casa_medicamentos"], "aparece como pendência"); assert.ok(!e.sem_trava_mfa.includes("casa_medicamentos"), "mas não é tratada como pessoal confiável só por existir");
  /* o dono inclui no catálogo, como manda o procedimento (na migration que cria a tabela) */
  await db.exec("insert into public.seguranca_catalogo (tabela, trava_mfa, backup, origem, motivo) values ('casa_medicamentos', true, true, '051', 'teste: medicamentos da casa') on conflict (tabela) do nothing;");
  e = await estado(db);
  assert.deepEqual(e.sem_trava_mfa, ["casa_medicamentos"], "a auditoria já cobra a trava da tabela nova"); assert.deepEqual(e.fora_do_catalogo, []);
  await db.exec(`create policy "mfa" on public.casa_medicamentos as restrictive for all to authenticated using (true);`);
  e = await estado(db); assert.deepEqual(e.sem_trava_mfa, [], "com a trava, nada a apontar");
  assert.deepEqual(await assinatura(db), antes, "a função é a mesma (mesmo oid, mesmo código): nada foi recriado");
  /* catálogo com tabela que não existe: informativo, e não quebra a conferência da trava */
  await db.exec("insert into public.seguranca_catalogo (tabela, trava_mfa, backup, origem, motivo) values ('casa_contas', true, true, '052', 'teste: tabela ainda não criada')");
  e = await estado(db); assert.deepEqual([e.catalogo_sem_tabela, e.sem_trava_mfa], [["casa_contas"], []]);
});

test("PGlite · com a função de antes (048), a mesma tabela nova nunca aparecia sem recriar a função (o problema P-11)", { skip: pular }, async () => {
  const db = await banco();
  await db.exec("create table public.casa_medicamentos (id int); alter table public.casa_medicamentos enable row level security;");
  const e = await estado(db); assert.ok(!e.sem_trava_mfa.includes("casa_medicamentos") && !("fora_do_catalogo" in e));
});

test("PGlite · continua fechada: sem login recusa; o visitante (anon) não executa", { skip: pular }, async () => {
  const db = await banco(); await db.exec(S50);
  assert.equal(await codigo(como(db, "authenticated", "select public.seguranca_estado()", [], null)), "42501", "sem login");
  assert.equal(await codigo(como(db, "anon", "select public.seguranca_estado()")), "42501", "anon não executa");
});
