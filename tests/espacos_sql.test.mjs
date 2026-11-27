// Lote 1 do novo RAC · espaços, permissões e Workspace no banco (supabase/070_espacos_e_workspace.sql; docs/planejamento/14 e 16).
// Postgres de verdade (PGlite) com a 002 (membros e dono_da_casa), a 022 (rac_aal_ok), a 050 (catálogo) e a 070 rodada DUAS vezes. Tudo fictício, sem rede.
// O que se prova, sempre com o papel "authenticated" ou "anon" e o RLS ligado (o mesmo caminho da API do Supabase):
//   · isolamento: ninguém lê, cria, edita ou apaga página de espaço alheio; chamadas diretas (tabela e função) não furam;
//   · escalada de privilégio: ninguém se promove, o proprietário é intocável, administrador não mexe em administrador, nada de DML direto em espaços e participações;
//   · a casa legada: a participação vem de public.membros ao vivo (tirar a linha tira o acesso na hora);
//   · páginas: título único, versão e concorrência otimista, espaço imutável, limite, histórico das 30 últimas, arquivar antes de excluir;
//   · preferências por pessoa (ocultos, página inicial) nunca sobrescritas por outra; layout inválido é recusado pelo banco; MFA (aal2) vale nas tabelas e nas funções;
//   · a migration não toca em tabela de negócio.
// Limitação: o PGlite prova o PostgreSQL (RLS, privilégios, checks, gatilhos), não o Supabase real: a conferência em produção está em supabase/conferencias/070_conferir_producao.sql.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite: pula, menos no CI */ }
const pular = !PGlite;
createRequire(import.meta.url)("../nucleo.js");
const S70 = ler("supabase/070_espacos_e_workspace.sql"), S50 = ler("supabase/050_seguranca_catalogo.sql");
const trecho = (arq, ini, fim) => { const t = ler(arq), i = t.indexOf(ini); assert.ok(i >= 0, ini); return t.slice(i, t.indexOf(fim, i) + fim.length); };

const R = "11111111-1111-4111-8111-111111111111";   // o dono (Rayner)
const F = "22222222-2222-4222-8222-222222222222";   // a casa (Fernanda): linha em membros
const X = "33333333-3333-4333-8333-333333333333";   // de fora
const Y = "44444444-4444-4444-8444-444444444444";   // outra pessoa
const Z = "55555555-5555-4555-8555-555555555555";   // outra pessoa
const M = "66666666-6666-4666-8666-666666666666";   // tem 2ª etapa (MFA) cadastrada

test("no CI o PGlite está instalado: os testes de banco desta migration não podem ser pulados", () => {
  if (process.env.CI) assert.ok(PGlite, "sem PGlite no CI (testes.yml instala o @electric-sql/pglite)");
});

/* ---------- o banco de teste ---------- */
async function banco() {
  const db = await PGlite.create();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    create schema auth; grant usage on schema auth to anon, authenticated, service_role;
    create table auth.users (id uuid primary key);
    create table auth.mfa_factors (user_id uuid, status text);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub', '')::uuid $$;
    create schema storage; create table storage.buckets (id text primary key, name text, public boolean default false);
    insert into auth.users values ('${R}'), ('${F}'), ('${X}'), ('${Y}'), ('${Z}'), ('${M}');
    insert into auth.mfa_factors values ('${M}', 'verified');
  `);
  await db.exec(trecho("supabase/002_casa_compartilhada.sql", "create table if not exists public.membros", "grant execute on function public.dono_da_casa() to authenticated;"));
  await db.exec(trecho("supabase/022_seguranca.sql", "create or replace function public.rac_aal_ok()", "grant execute on function public.rac_aal_ok() to authenticated;"));
  await db.exec(S50);
  await db.exec(`insert into public.membros (membro, dono) values ('${F}', '${R}');`);
  await db.exec(S70); await db.exec(S70);   // reexecutável
  return db;
}
const com = async (db, uid, sql, params = [], { papel = "authenticated", aal = "aal1" } = {}) => {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(uid ? { sub: uid, role: papel, aal } : { role: papel })]);
  await db.exec(`set role ${papel}`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); }
};
const codigo = async (p) => { try { await p; } catch (e) { return e.code || String(e.message); } return null; };
const msg = async (p) => { try { await p; } catch (e) { return String(e.message); } return null; };
const layout = (itens = []) => JSON.stringify({ schema: 1, secoes: [{ id: "s1", titulo: "Dia", itens }] });
const item = (id, extra = {}) => ({ id: "w_" + id, tipo: "nota.fixa", v: 1, col: 4, lin: 0, estado: "ativo", config: {}, ...extra });
let seq = 0;
const pagina = (db, uid, espaco, titulo, lay = layout()) => com(db, uid, "insert into public.workspace_paginas (espaco_id, titulo, layout) values ($1, $2, $3::jsonb) returning id, versao", [espaco, titulo || "Página " + (++seq), lay]);
async function iniciar(db, uid) { const r = (await com(db, uid, "select public.rac_iniciar_espacos() as e"))[0].e; return r; }
const casaId = async (db) => (await db.query("select id from public.espacos where casa_de = $1", [R])).rows[0].id;
const pessoalId = async (db, uid) => (await db.query("select id from public.espacos where dono = $1 and tipo = 'pessoal'", [uid])).rows[0].id;
async function novoEspaco(db, uid, nome = "Viagem") { return (await com(db, uid, "select public.rac_espaco_criar($1) as id", [nome]))[0].id; }

/* ---------- a migration em si ---------- */
test("070 (texto): aditiva, uma transação, sem tocar em tabela de negócio, funções sem anon e com search_path vazio, catálogo e trava \"mfa\"", () => {
  assert.match(S70, /\nbegin;[\s\S]*\ncommit;/);
  const s = S70.replace(/--.*$/gm, "");
  assert.ok(!/\b(drop\s+(table|function|policy)\b(?!.*(if exists)))|truncate|delete\s+from\s+public\.(?!workspace_versoes|espaco_membros)|alter\s+table\s+public\.(?!espacos|espaco_membros|workspace_|%I)/i.test(s.replace(/drop (trigger|policy) if exists[^;]*;/gi, "")), "não apaga nem altera nada que já existe");
  assert.ok(!/(insert into|update|delete from)\s+public\.(mercados|produtos|notas|itens|registros|lista|bebe|pessoal|garmin_|compras|pedido|notas_fiscais|radar_|inbox_|newsletter|conhecimento|sinais|membros)/i.test(s), "nenhuma escrita em tabela de negócio nem em membros");
  /* toda função tem search_path fixo e fecha para anon */
  const funcoes = [...s.matchAll(/create or replace function (public\.[a-z_]+)\(([^)]*)\)/g)];
  assert.ok(funcoes.length >= 14, "achei " + funcoes.length + " funções");
  for (const f of funcoes) {
    const i = s.indexOf(f[0]), corpo = s.slice(i, s.indexOf("$$;", s.indexOf("$$", i + 40)) + 3);
    assert.match(corpo, /set search_path = ''/, f[1] + " sem search_path vazio");
    const tipos = f[2].split(",").map((x) => x.trim().split(/\s+/)[1]).filter(Boolean).join(", ");
    assert.ok(s.includes(`revoke all on function ${f[1]}(${tipos}) from public, anon;`), f[1] + " não fecha para anon (" + tipos + ")");
  }
  /* as funções que gravam em nome de quem chama exigem login e a 2ª etapa */
  for (const n of ["rac_iniciar_espacos", "rac_espaco_criar", "rac_espaco_membro_definir", "rac_espaco_membro_remover", "rac_espaco_arquivar"]) {
    const i = s.indexOf(`create or replace function public.${n}(`), c = s.slice(i, s.indexOf("$$;", i + 80));
    assert.match(c, /sem_login/); assert.match(c, /rac_aal_ok\(\)/);
  }
  for (const g of s.matchAll(/\bgrant\s[^;]*?\sto\s+([^;]+);/gi)) assert.ok(!/\b(anon|public)\b/i.test(g[1]), "grant para anon ou public: " + g[0]);
  assert.match(S70, /foreach t in array array\['espacos', 'espaco_membros', 'workspace_paginas', 'workspace_versoes', 'workspace_pessoal'\] loop/);
  for (const t of ["espacos", "espaco_membros", "workspace_paginas", "workspace_versoes", "workspace_pessoal"]) assert.match(S70, new RegExp(`insert into public\\.seguranca_catalogo[\\s\\S]*'${t}'`), t + " no catálogo");
});

test("PGlite · a 070 roda duas vezes; o seed cria o espaço pessoal de cada usuário e UM espaço da Casa; nenhuma linha legada muda", { skip: pular }, async () => {
  const db = await banco();
  assert.equal((await db.query("select count(*)::int n from public.espacos where tipo = 'pessoal'")).rows[0].n, 6);
  const casas = (await db.query("select id, dono, casa_de, nome, tipo from public.espacos where casa_de is not null")).rows;
  assert.equal(casas.length, 1); assert.equal(casas[0].dono, R); assert.equal(casas[0].casa_de, R); assert.equal(casas[0].tipo, "compartilhado");
  assert.deepEqual((await db.query("select membro, dono from public.membros")).rows, [{ membro: F, dono: R }]);
  assert.equal((await db.query("select count(*)::int n from public.espaco_membros")).rows[0].n, 0, "a casa não tem linhas explícitas: a participação vem de membros");
});

test("PGlite · catálogo: as 5 tabelas entram com trava; backup em 4 (o histórico fica de fora); ninguém do site lê o catálogo", { skip: pular }, async () => {
  const db = await banco();
  const c = (await db.query("select tabela, trava_mfa, backup, origem from public.seguranca_catalogo where origem = '070' order by 1")).rows;
  assert.deepEqual(c.map((x) => x.tabela), ["espaco_membros", "espacos", "workspace_paginas", "workspace_pessoal", "workspace_versoes"]);
  assert.ok(c.every((x) => x.trava_mfa)); assert.deepEqual(c.filter((x) => x.backup).map((x) => x.tabela), ["espaco_membros", "espacos", "workspace_paginas", "workspace_pessoal"]);
  for (const t of ["espacos", "espaco_membros", "workspace_paginas", "workspace_versoes", "workspace_pessoal"]) {
    assert.equal((await db.query("select relrowsecurity from pg_class where oid = $1::regclass", ["public." + t])).rows[0].relrowsecurity, true, t + " com RLS");
    assert.equal((await db.query("select exists (select 1 from pg_policies where schemaname = 'public' and tablename = $1 and policyname = 'mfa' and permissive = 'RESTRICTIVE') as ok", [t])).rows[0].ok, true, t + " com a trava mfa");
    for (const k of ["SELECT", "INSERT", "UPDATE", "DELETE"]) assert.equal((await db.query("select has_table_privilege('anon', $1, $2) as p", ["public." + t, k])).rows[0].p, false, `anon não tem ${k} em ${t}`);
  }
});

/* ---------- isolamento ---------- */
test("PGlite · isolamento: quem é de fora não vê espaço nem página alheia e não cria, edita ou apaga nada nelas", { skip: pular }, async () => {
  const db = await banco();
  await iniciar(db, R); const pR = await pessoalId(db, R);
  const [pg] = await pagina(db, R, pR, "Minha Casa");
  assert.ok(pg.id);
  await iniciar(db, X);
  assert.deepEqual((await com(db, X, "select id from public.espacos")).map((r) => r.id), [await pessoalId(db, X)], "X só vê o espaço pessoal dele");
  assert.deepEqual(await com(db, X, "select id from public.workspace_paginas"), [], "X não lista páginas de outro espaço");
  assert.deepEqual(await com(db, X, "select id from public.workspace_paginas where espaco_id = $1", [pR]), [], "nem pedindo o id do espaço de outra pessoa");
  assert.match(await msg(pagina(db, X, pR, "Invasão")), /row-level security|violates/i, "não cria página no espaço alheio");
  assert.deepEqual(await com(db, X, "update public.workspace_paginas set titulo = 'hack' where id = $1 returning id", [pg.id]), [], "não edita (0 linhas)");
  assert.deepEqual(await com(db, X, "delete from public.workspace_paginas where id = $1 returning id", [pg.id]), [], "não apaga (0 linhas)");
  assert.equal((await db.query("select titulo from public.workspace_paginas where id = $1", [pg.id])).rows[0].titulo, "Minha Casa");
  assert.deepEqual(await com(db, X, "select * from public.workspace_versoes"), [], "nem o histórico");
  assert.deepEqual(await com(db, X, "select public.rac_papel_no_espaco($1) as p", [pR]), [{ p: null }], "o papel de quem não pertence é null, igual a um espaço que não existe");
  assert.deepEqual(await com(db, X, "select public.rac_papel_no_espaco($1) as p", ["99999999-9999-4999-8999-999999999999"]), [{ p: null }]);
  assert.deepEqual(await com(db, X, "select * from public.rac_espaco_membros($1)", [pR]), [], "não lista participantes de espaço alheio");
});

test("PGlite · acesso direto: sem login (anon) nenhuma tabela nem função responde; DML direto em espaços e participações é negado a todos", { skip: pular }, async () => {
  const db = await banco();
  for (const t of ["espacos", "espaco_membros", "workspace_paginas", "workspace_versoes", "workspace_pessoal"]) assert.equal(await codigo(com(db, null, `select * from public.${t}`, [], { papel: "anon" })), "42501", "anon em " + t);
  for (const f of ["rac_iniciar_espacos()", "rac_espaco_criar('x')", "rac_espaco_arquivar('" + R + "')", "rac_meus_espacos()", "ws_layout_valido('{}'::jsonb)"]) assert.equal(await codigo(com(db, null, `select public.${f}`, [], { papel: "anon" })), "42501", "anon em " + f);
  await iniciar(db, R); const pR = await pessoalId(db, R);
  /* logado, mas sem passar pelas funções */
  assert.equal(await codigo(com(db, R, "insert into public.espacos (tipo, nome, dono) values ('compartilhado', 'x', $1)", [R])), "42501", "não cria espaço por INSERT direto");
  assert.equal(await codigo(com(db, R, "update public.espacos set nome = 'x' where id = $1", [pR])), "42501");
  assert.equal(await codigo(com(db, R, "delete from public.espacos where id = $1", [pR])), "42501");
  assert.equal(await codigo(com(db, R, "insert into public.espaco_membros (espaco_id, user_id, papel) values ($1, $2, 'editor')", [pR, X])), "42501", "não cria participação por INSERT direto");
  assert.equal(await codigo(com(db, R, "update public.espaco_membros set papel = 'administrador'")), "42501");
  assert.equal(await codigo(com(db, R, "insert into public.workspace_versoes (pagina_id, versao, layout, titulo, motivo) values (gen_random_uuid(), 1, '{}', 'x', 'editar')")), "42501", "ninguém escreve no histórico");
  assert.equal(await codigo(com(db, null, "select public.rac_iniciar_espacos()", [], { papel: "authenticated" })), "42501", "authenticated sem sub (sem login) também é recusado");
});

/* ---------- a casa legada ---------- */
test("PGlite · a Casa legada: a Fernanda edita; o dono vê o que ela cria; a participação vem de membros AO VIVO; ela não vê o espaço pessoal do dono nem administra", { skip: pular }, async () => {
  const db = await banco();
  const r = await iniciar(db, F); assert.deepEqual(r.map((x) => x.papel).sort(), ["editor", "proprietario"], "pessoal (proprietário) e Casa (editora)");
  const casa = await casaId(db);
  assert.deepEqual(await com(db, F, "select public.rac_papel_no_espaco($1) as p", [casa]), [{ p: "editor" }]);
  assert.deepEqual(await com(db, R, "select public.rac_papel_no_espaco($1) as p", [casa]), [{ p: "proprietario" }]);
  const [pg] = await pagina(db, F, casa, "Lista da casa", layout([item("abc123")]));
  assert.equal((await com(db, R, "select titulo from public.workspace_paginas where id = $1", [pg.id]))[0].titulo, "Lista da casa", "o dono vê a página da casa");
  assert.deepEqual(await com(db, F, "select id from public.espacos where id = $1", [await pessoalId(db, R)]), [], "a Fernanda não vê o espaço pessoal do dono");
  assert.equal(await codigo(com(db, F, "select public.rac_espaco_arquivar($1)", [casa])), "42501", "editora não arquiva");
  assert.equal(await codigo(com(db, F, "select public.rac_espaco_membro_definir($1, $2, 'leitor')", [casa, X])), "42501", "editora não administra participantes");
  assert.deepEqual((await com(db, R, "select user_id, papel, origem from public.rac_espaco_membros($1) order by origem", [casa])).map((x) => x.origem + ":" + x.papel), ["casa:editor", "proprietario:proprietario"]);
  /* tirar a linha de membros tira o acesso na hora, sem sincronizar nada */
  await db.exec(`delete from public.membros where membro = '${F}'`);
  assert.deepEqual(await com(db, F, "select id from public.workspace_paginas"), [], "sem a linha em membros, nenhuma página");
  assert.deepEqual(await com(db, F, "select public.rac_papel_no_espaco($1) as p", [casa]), [{ p: null }]);
  assert.match(await msg(pagina(db, F, casa, "De novo")), /row-level security|violates/i);
  await db.exec(`insert into public.membros (membro, dono) values ('${F}', '${R}')`);
  assert.deepEqual(await com(db, F, "select public.rac_papel_no_espaco($1) as p", [casa]), [{ p: "editor" }], "voltou a linha, voltou o acesso");
});

test("PGlite · rac_iniciar_espacos: cria só o espaço pessoal de quem chama e a Casa a que pertence; repetir não duplica; outro usuário não ganha nada", { skip: pular }, async () => {
  const db = await banco();
  await db.exec("delete from public.espacos");
  await iniciar(db, X); await iniciar(db, X);
  assert.deepEqual((await db.query("select dono, tipo from public.espacos")).rows, [{ dono: X, tipo: "pessoal" }], "X não é de casa nenhuma: só o pessoal");
  await iniciar(db, F); await iniciar(db, R); await iniciar(db, F);
  assert.equal((await db.query("select count(*)::int n from public.espacos where casa_de = $1", [R])).rows[0].n, 1, "uma Casa só, criada por quem chegou primeiro");
  assert.equal((await db.query("select count(*)::int n from public.espacos where tipo = 'pessoal'")).rows[0].n, 3);
});

/* ---------- espaços compartilhados, papéis e escalada de privilégio ---------- */
test("PGlite · espaço compartilhado: papéis, quem pode o quê, e ninguém se promove", { skip: pular }, async () => {
  const db = await banco();
  await iniciar(db, R); await iniciar(db, Y); await iniciar(db, Z); await iniciar(db, X);
  const s = await novoEspaco(db, R, "Reforma");
  assert.deepEqual(await com(db, R, "select public.rac_papel_no_espaco($1) as p", [s]), [{ p: "proprietario" }]);
  assert.deepEqual(await com(db, Y, "select id from public.espacos where id = $1", [s]), [], "antes de convidar, Y não vê");
  await com(db, R, "select public.rac_espaco_membro_definir($1, $2, 'editor')", [s, Y]);
  await com(db, R, "select public.rac_espaco_membro_definir($1, $2, 'leitor')", [s, Z]);
  const [pg] = await pagina(db, Y, s, "Plantas");
  assert.equal((await com(db, Z, "select titulo from public.workspace_paginas where id = $1", [pg.id]))[0].titulo, "Plantas", "o leitor lê");
  assert.match(await msg(pagina(db, Z, s, "Do leitor")), /row-level security|violates/i, "o leitor não cria");
  assert.deepEqual(await com(db, Z, "update public.workspace_paginas set titulo = 'x' where id = $1 returning id", [pg.id]), [], "o leitor não edita");
  assert.deepEqual(await com(db, Z, "select * from public.workspace_versoes"), [], "o leitor não vê o histórico (só quem edita)");
  assert.equal((await com(db, Y, "select count(*)::int n from public.workspace_versoes"))[0].n, 1, "o editor vê");
  /* escalada */
  assert.equal(await codigo(com(db, Y, "select public.rac_espaco_membro_definir($1, $2, 'administrador')", [s, Y])), "42501", "o editor não se promove (nem administra)");
  assert.equal(await codigo(com(db, Z, "select public.rac_espaco_membro_definir($1, $2, 'editor')", [s, Z])), "42501", "o leitor não se promove");
  assert.equal(await codigo(com(db, X, "select public.rac_espaco_membro_definir($1, $2, 'leitor')", [s, X])), "42501", "quem é de fora não entra sozinho");
  assert.match(await msg(com(db, R, "select public.rac_espaco_membro_definir($1, $2, 'proprietario')", [s, Y])), /papel_invalido/, "ninguém recebe 'proprietario' por função");
  assert.match(await msg(com(db, R, "select public.rac_espaco_membro_definir($1, $2, 'editor')", [s, R])), /nao_altera_o_proprio_papel/);
  assert.match(await msg(com(db, R, "select public.rac_espaco_membro_definir($1, $2, 'leitor')", [s, "99999999-9999-4999-8999-999999999999"])), /usuario_inexistente/);
  await com(db, R, "select public.rac_espaco_membro_definir($1, $2, 'administrador')", [s, Y]);
  assert.deepEqual(await com(db, Y, "select public.rac_papel_no_espaco($1) as p", [s]), [{ p: "administrador" }]);
  await com(db, Y, "select public.rac_espaco_membro_definir($1, $2, 'leitor')", [s, X]);   // administrador convida leitor
  assert.equal(await codigo(com(db, Y, "select public.rac_espaco_membro_definir($1, $2, 'administrador')", [s, X])), "42501", "o administrador não cria administrador");
  assert.equal(await codigo(com(db, Y, "select public.rac_espaco_membro_definir($1, $2, 'leitor')", [s, Y])), "P0001", "nem altera o próprio papel");
  assert.match(await msg(com(db, Y, "select public.rac_espaco_membro_definir($1, $2, 'leitor')", [s, R])), /proprietario_intocavel/, "o proprietário é intocável");
  assert.match(await msg(com(db, Y, "select public.rac_espaco_membro_remover($1, $2)", [s, R])), /proprietario_intocavel/);
  await com(db, R, "select public.rac_espaco_membro_definir($1, $2, 'administrador')", [s, Z]);
  assert.equal(await codigo(com(db, Y, "select public.rac_espaco_membro_definir($1, $2, 'leitor')", [s, Z])), "42501", "administrador não rebaixa outro administrador");
  assert.equal(await codigo(com(db, Y, "select public.rac_espaco_membro_remover($1, $2)", [s, Z])), "42501", "nem o remove");
  /* participantes visíveis a quem pertence */
  assert.deepEqual((await com(db, X, "select user_id, papel from public.rac_espaco_membros($1) order by papel", [s])).map((r) => r.papel).sort(), ["administrador", "administrador", "leitor", "proprietario"]);
  /* o proprietário remove; quem sai perde o acesso; o leitor pode sair sozinho */
  await com(db, R, "select public.rac_espaco_membro_remover($1, $2)", [s, Y]);
  assert.deepEqual(await com(db, Y, "select id from public.workspace_paginas"), [], "removido: nada mais");
  await com(db, X, "select public.rac_espaco_membro_remover($1, $2)", [s, X]);
  assert.deepEqual(await com(db, X, "select id from public.espacos where id = $1", [s]), [], "quem sai deixa de ver o espaço");
  assert.match(await msg(com(db, R, "select public.rac_espaco_membro_remover($1, $2)", [s, X])), /nao_e_membro/);
});

test("PGlite · espaço pessoal e Casa legada não aceitam participantes explícitos; DML por gatilho também é barrado", { skip: pular }, async () => {
  const db = await banco();
  await iniciar(db, R); const pR = await pessoalId(db, R), casa = await casaId(db);
  assert.match(await msg(com(db, R, "select public.rac_espaco_membro_definir($1, $2, 'leitor')", [pR, X])), /espaco_sem_membros_explicitos/);
  assert.match(await msg(com(db, R, "select public.rac_espaco_membro_definir($1, $2, 'leitor')", [casa, X])), /espaco_sem_membros_explicitos/, "a Casa legada usa só membros");
  assert.match(await msg(db.exec(`insert into public.espaco_membros (espaco_id, user_id, papel) values ('${pR}', '${X}', 'editor')`)), /espaco_sem_membros_explicitos/, "mesmo por quem tem poder total");
  const s = await novoEspaco(db, R);
  assert.match(await msg(db.exec(`insert into public.espaco_membros (espaco_id, user_id, papel) values ('${s}', '${R}', 'editor')`)), /proprietario_intocavel/);
});

test("PGlite · arquivar espaço: só o proprietário, nunca o pessoal nem a Casa; arquivado fica só para leitura e nada se apaga", { skip: pular }, async () => {
  const db = await banco();
  await iniciar(db, R); await iniciar(db, Y);
  const s = await novoEspaco(db, R, "Evento"); await com(db, R, "select public.rac_espaco_membro_definir($1, $2, 'editor')", [s, Y]);
  const [pg] = await pagina(db, Y, s, "Convidados");
  assert.equal(await codigo(com(db, Y, "select public.rac_espaco_arquivar($1)", [s])), "42501", "o editor não arquiva");
  assert.match(await msg(com(db, R, "select public.rac_espaco_arquivar($1)", [await pessoalId(db, R)])), /espaco_protegido/);
  assert.match(await msg(com(db, R, "select public.rac_espaco_arquivar($1)", [await casaId(db)])), /espaco_protegido/);
  await com(db, R, "select public.rac_espaco_arquivar($1)", [s]);
  assert.equal((await com(db, Y, "select titulo from public.workspace_paginas where id = $1", [pg.id]))[0].titulo, "Convidados", "arquivado: ainda se lê");
  assert.match(await msg(pagina(db, Y, s, "Nova")), /row-level security|violates/i, "arquivado: não se cria");
  assert.deepEqual(await com(db, Y, "update public.workspace_paginas set titulo = 'x' where id = $1 returning id", [pg.id]), [], "arquivado: não se edita");
  assert.match(await msg(com(db, R, "select public.rac_espaco_membro_definir($1, $2, 'leitor')", [s, X])), /espaco_arquivado/);
  await com(db, R, "select public.rac_espaco_arquivar($1, false)", [s]);
  assert.equal((await com(db, Y, "update public.workspace_paginas set titulo = 'Convidados 2' where id = $1 returning titulo", [pg.id]))[0].titulo, "Convidados 2", "restaurado: volta a editar");
  /* limite de espaços por proprietário */
  for (let i = 0; i < 9; i++) await novoEspaco(db, R, "E" + i);
  assert.match(await msg(novoEspaco(db, R, "Demais")), /limite_de_espacos/);
  assert.match(await msg(novoEspaco(db, R, "   ")), /nome_invalido/);
});

/* ---------- páginas ---------- */
test("PGlite · páginas: título único por espaço (sem diferença de maiúsculas), versão, concorrência otimista, espaço e autoria imutáveis, e arquivar libera o título", { skip: pular }, async () => {
  const db = await banco();
  await iniciar(db, R); await iniciar(db, Y); const pR = await pessoalId(db, R), pY = await pessoalId(db, Y);
  const [a] = await pagina(db, R, pR, "Minha Casa"); assert.equal(a.versao, 1);
  assert.equal(await codigo(pagina(db, R, pR, "  minha casa ")), "23505", "o mesmo título (maiúsculas e espaços nas pontas) não duplica");
  await pagina(db, Y, pY, "Minha Casa");   // em outro espaço pode
  /* concorrência: duas telas leram a versão 1; a primeira grava, a segunda perde */
  const gravar = (uid, id, ver, titulo) => com(db, uid, "update public.workspace_paginas set layout = $3::jsonb, titulo = $4 where id = $1 and versao = $2 returning versao", [id, ver, layout([item(titulo === "A" ? "aaaaaa" : "bbbbbb")]), titulo]);
  assert.equal((await gravar(R, a.id, 1, "A"))[0].versao, 2);
  assert.deepEqual(await gravar(R, a.id, 1, "B"), [], "a segunda gravação com a versão velha não grava nada (conflito)");
  assert.equal((await db.query("select titulo, versao from public.workspace_paginas where id = $1", [a.id])).rows[0].titulo, "A");
  /* o cliente não escolhe a versão nem a autoria */
  const [b] = await com(db, R, "update public.workspace_paginas set versao = 99, atualizado_por = $2 where id = $1 returning versao, atualizado_por", [a.id, Y]);
  assert.equal(b.versao, 3, "a versão é do servidor"); assert.equal(b.atualizado_por, R, "a autoria também");
  assert.match(await msg(com(db, R, "update public.workspace_paginas set espaco_id = $2 where id = $1", [a.id, pY])), /espaco_da_pagina_nao_muda/, "a página não muda de espaço");
  assert.match(await msg(db.exec(`update public.workspace_paginas set espaco_id = '${pY}' where id = '${a.id}'`)), /espaco_da_pagina_nao_muda/, "nem por quem tem poder total");
  assert.match(await msg(db.exec(`update public.workspace_paginas set criado_por = '${Y}' where id = '${a.id}'`)), /espaco_da_pagina_nao_muda/);
  const [c] = await pagina(db, R, pR, "Trabalho"); assert.notEqual(c.id, a.id);
  assert.equal((await com(db, R, "insert into public.workspace_paginas (espaco_id, titulo, criado_por) values ($1, 'Autoria', $2) returning criado_por", [pR, Y]))[0].criado_por, R, "a autoria é do servidor: pedir 'em nome' de outra pessoa grava o próprio usuário");
  /* arquivar não apaga e libera o título; excluir exige página arquivada e administração */
  assert.deepEqual(await com(db, R, "delete from public.workspace_paginas where id = $1 returning id", [c.id]), [], "página ativa não se exclui");
  await com(db, R, "update public.workspace_paginas set arquivada_em = now() where id = $1", [c.id]);
  await pagina(db, R, pR, "Trabalho");   // o título voltou a ficar livre
  assert.equal((await com(db, R, "delete from public.workspace_paginas where id = $1 returning id", [c.id])).length, 1, "arquivada: o dono exclui");
  assert.equal((await db.query("select count(*)::int n from public.workspace_versoes where pagina_id = $1", [c.id])).rows[0].n, 0, "as versões vão junto da página (só layout, nunca dado de negócio)");
});

test("PGlite · histórico: cada gravação vira uma versão, ficam as 30 últimas, e voltar a um layout antigo é registrado como restauração; limite de 30 páginas ativas", { skip: pular }, async () => {
  const db = await banco();
  await iniciar(db, R); const pR = await pessoalId(db, R);
  const [p] = await pagina(db, R, pR, "Histórico");
  for (let i = 1; i <= 34; i++) await com(db, R, "update public.workspace_paginas set layout = $2::jsonb where id = $1", [p.id, layout([item("n" + String(i).padStart(6, "0"))])]);
  const v = (await db.query("select versao, motivo from public.workspace_versoes where pagina_id = $1 order by versao", [p.id])).rows;
  assert.equal(v.length, 30); assert.equal(v[0].versao, 6); assert.equal(v[29].versao, 35, "versão 1 (criação) + 34 edições = 35");
  assert.equal(v[29].motivo, "editar");
  await com(db, R, "update public.workspace_paginas set layout = $2::jsonb where id = $1", [p.id, layout([item("n000030")])]);   // um layout que já esteve no histórico
  assert.equal((await db.query("select motivo from public.workspace_versoes where pagina_id = $1 order by versao desc limit 1", [p.id])).rows[0].motivo, "restaurar");
  for (let i = 1; i <= 29; i++) await pagina(db, R, pR, "P" + i);   // 1 + 29 = 30 ativas
  assert.match(await msg(pagina(db, R, pR, "P30")), /limite_de_paginas/);
});

test("PGlite · layout inválido é recusado pelo banco (a validação não depende da tela)", { skip: pular }, async () => {
  const db = await banco();
  await iniciar(db, R); const pR = await pessoalId(db, R);
  const ok = (l) => pagina(db, R, pR, "T" + (++seq), JSON.stringify(l));
  const base = (it) => ({ schema: 1, secoes: [{ id: "s1", itens: [it] }] });
  const it = () => ({ id: "w_abcdef", tipo: "nota.fixa", v: 1, col: 4, lin: 0, estado: "ativo", config: {} });
  assert.ok((await ok(base(it())))[0].id, "o documento certo entra");
  assert.ok((await ok({ schema: 1, secoes: [], futuro: { x: 1 } }))[0].id, "chaves desconhecidas são aceitas (compatibilidade)");
  const ruins = {
    "sem schema": { secoes: [] }, "schema 0": { schema: 0, secoes: [] }, "schema texto": { schema: "1", secoes: [] }, "secoes não é lista": { schema: 1, secoes: {} },
    "coluna 0": base({ ...it(), col: 0 }), "coluna 13": base({ ...it(), col: 13 }), "coluna decimal": base({ ...it(), col: 4.5 }), "linhas 13": base({ ...it(), lin: 13 }),
    "estado inválido": base({ ...it(), estado: "apagado" }), "sem estado": base((({ estado, ...r }) => r)(it())), "tipo sem ponto": base({ ...it(), tipo: "nota" }), "tipo maiúsculo": base({ ...it(), tipo: "Nota.Fixa" }),
    "id sem w_": base({ ...it(), id: "abcdef" }), "config lista": base({ ...it(), config: [] }), "sem config": base((({ config, ...r }) => r)(it())), "versão 0": base({ ...it(), v: 0 }),
    "mobile texto": base({ ...it(), mobile: "sim" }), "id repetido": { schema: 1, secoes: [{ id: "s1", itens: [it(), it()] }] },
    "seção repetida": { schema: 1, secoes: [{ id: "s1", itens: [] }, { id: "s1", itens: [] }] }, "seção sem itens": { schema: 1, secoes: [{ id: "s1" }] },
    "13 seções": { schema: 1, secoes: Array.from({ length: 13 }, (_, i) => ({ id: "s" + i, itens: [] })) },
    "61 instâncias": { schema: 1, secoes: [{ id: "s1", itens: Array.from({ length: 61 }, (_, i) => ({ ...it(), id: "w_aaaa" + String(i).padStart(3, "0") })) }] },
    "config enorme": base({ ...it(), config: { texto: "x".repeat(5000) } }),
  };
  for (const [nome, l] of Object.entries(ruins)) assert.equal(await codigo(ok(l)), "23514", nome + " deveria violar o check do layout");
  assert.equal(await codigo(com(db, R, "insert into public.workspace_paginas (espaco_id, titulo, layout) values ($1, 'Nula', null)", [pR])), "23502");
  assert.equal(await codigo(com(db, R, "insert into public.workspace_paginas (espaco_id, titulo, layout) values ($1, '   ', '{\"schema\":1,\"secoes\":[]}')", [pR])), "23514", "título vazio");
  assert.equal(await codigo(com(db, R, "insert into public.workspace_paginas (espaco_id, titulo, ambiente) values ($1, 'Amb', 'outro')", [pR])), "23514", "ambiente fora dos cinco");
});

/* ---------- preferências por pessoa ---------- */
test("PGlite · preferências pessoais: cada um só vê e muda as suas; uma página inicial por pessoa; sem acesso à página, sem preferência", { skip: pular }, async () => {
  const db = await banco();
  await iniciar(db, R); await iniciar(db, Y); await iniciar(db, Z);
  const s = await novoEspaco(db, R, "Família"); await com(db, R, "select public.rac_espaco_membro_definir($1, $2, 'editor')", [s, Y]); await com(db, R, "select public.rac_espaco_membro_definir($1, $2, 'leitor')", [s, Z]);
  const [pg] = await pagina(db, R, s, "Sala", layout([item("abc123"), item("def456")]));
  const [p2] = await pagina(db, R, s, "Cozinha");
  await com(db, Z, "insert into public.workspace_pessoal (pagina_id, ocultos, favorita) values ($1, '[\"w_abc123\"]', true)", [pg.id]);   // o leitor oculta para si e define a inicial
  await com(db, Y, "insert into public.workspace_pessoal (pagina_id, ocultos) values ($1, '[]')", [pg.id]);
  assert.deepEqual((await com(db, Z, "select ocultos from public.workspace_pessoal"))[0].ocultos, ["w_abc123"]);
  assert.deepEqual((await com(db, Y, "select ocultos from public.workspace_pessoal"))[0].ocultos, [], "Y não vê o que Z ocultou e a dele continua vazia");
  assert.deepEqual(await com(db, R, "select * from public.workspace_pessoal"), [], "nem o proprietário lê preferência alheia");
  assert.deepEqual(await com(db, Y, "update public.workspace_pessoal set ocultos = '[\"w_def456\"]' where user_id = $1 returning user_id", [Z]), [], "ninguém sobrescreve a preferência de outra pessoa");
  assert.equal(await codigo(com(db, Y, "insert into public.workspace_pessoal (user_id, pagina_id) values ($1, $2)", [Z, p2.id])), "42501", "nem cria em nome de outra pessoa");
  assert.equal(await codigo(com(db, Z, "insert into public.workspace_pessoal (pagina_id, favorita) values ($1, true)", [p2.id])), "23505", "uma página inicial só por pessoa");
  assert.equal(await codigo(com(db, Z, "update public.workspace_pessoal set ocultos = $2::jsonb where pagina_id = $1", [pg.id, JSON.stringify(Array(61).fill("w_x"))])), "23514", "limite de ocultos");
  /* a layout não sobrescreve a preferência de ninguém: a edição do dono mexe só na página */
  await com(db, R, "update public.workspace_paginas set layout = $2::jsonb where id = $1", [pg.id, layout([item("abc123", { col: 6 })])]);
  assert.deepEqual((await com(db, Z, "select ocultos, favorita from public.workspace_pessoal where pagina_id = $1", [pg.id]))[0], { ocultos: ["w_abc123"], favorita: true });
  /* perdeu o acesso: a preferência some da vista e não se cria de novo */
  await com(db, R, "select public.rac_espaco_membro_remover($1, $2)", [s, Z]);
  assert.deepEqual(await com(db, Z, "select * from public.workspace_pessoal"), []);
  assert.equal(await codigo(com(db, Z, "insert into public.workspace_pessoal (pagina_id) values ($1)", [p2.id])), "42501");
  assert.equal(await codigo(com(db, X, "insert into public.workspace_pessoal (pagina_id) values ($1)", [p2.id])), "42501", "de fora também não");
});

/* ---------- MFA ---------- */
test("PGlite · segunda etapa (MFA): quem cadastrou o app autenticador só usa tabelas e funções com aal2; quem não cadastrou segue como antes", { skip: pular }, async () => {
  const db = await banco();
  const ate = (aal) => ({ aal });
  await com(db, M, "select public.rac_iniciar_espacos()", [], ate("aal2")); const pM = await pessoalId(db, M);
  await com(db, M, "insert into public.workspace_paginas (espaco_id, titulo) values ($1, 'Com código')", [pM], ate("aal2"));
  assert.deepEqual(await com(db, M, "select id from public.workspace_paginas", [], ate("aal1")), [], "aal1 com fator verificado: as linhas somem (RESTRICTIVE)");
  assert.equal(await codigo(com(db, M, "insert into public.workspace_paginas (espaco_id, titulo) values ($1, 'x')", [pM], ate("aal1"))), "42501");
  assert.equal(await codigo(com(db, M, "select public.rac_iniciar_espacos()", [], ate("aal1"))), "42501", "as funções também exigem a 2ª etapa");
  assert.equal(await codigo(com(db, M, "select public.rac_espaco_criar('x')", [], ate("aal1"))), "42501");
  assert.equal((await com(db, M, "select id from public.workspace_paginas", [], ate("aal2"))).length, 1, "aal2: lê");
  assert.equal((await com(db, M, "select public.rac_espaco_criar('Com MFA') as id", [], ate("aal2")))[0].id.length, 36, "aal2: cria");
  assert.equal((await com(db, R, "select public.rac_iniciar_espacos() as e", [], ate("aal1")))[0].e.length, 2, "R não tem fator: aal1 basta (pessoal e Casa)");
});

/* ---------- compatibilidade com o legado ---------- */
test("PGlite · compatibilidade: dono_da_casa() e membros seguem iguais; a 070 não muda nada do que a 002 criou", { skip: pular }, async () => {
  const db = await banco();
  assert.deepEqual(await com(db, F, "select public.dono_da_casa() as d"), [{ d: R }]);
  assert.deepEqual(await com(db, R, "select public.dono_da_casa() as d"), [{ d: R }]);
  assert.deepEqual(await com(db, X, "select public.dono_da_casa() as d"), [{ d: X }]);
  assert.deepEqual((await db.query("select count(*)::int n from public.membros")).rows, [{ n: 1 }]);
});

test("PGlite · a conferência de produção da 070 (só leitura) dá TUDO OK sobre o banco de teste", { skip: pular }, async () => {
  const db = await banco();
  const r = (await db.query(ler("supabase/conferencias/070_conferir_producao.sql").replace(/^--.*$/gm, ""))).rows;
  const falhas = r.filter((x) => x.ok !== true).map((x) => x.ordem + " " + x.verificacao + " → " + x.encontrado);
  assert.deepEqual(falhas, [], "verificações que falharam");
  assert.equal(r[r.length - 1].verificacao, "TUDO OK");
});
