// Áreas de consumo · acesso igual da Fernanda (correção do dono em 20/11/2026) · migration 064 (supabase/064_casa_areas_consumo.sql, PROPOSTA não aplicada)
// no Postgres de verdade (PGlite): a tabela pessoal com a política "casa compartilha" da 057 (6 chaves) e depois da 064 (7 chaves). Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite: pula */ }
const pular = !PGlite && !process.env.CI;
const R = "11111111-1111-4111-8111-111111111111", F = "22222222-2222-4222-8222-222222222222", X = "33333333-3333-4333-8333-333333333333";
const trecho = (arq, ini, fim) => { const t = ler(arq), i = t.indexOf(ini); assert.ok(i >= 0, ini); return t.slice(i, t.indexOf(fim, i) + fim.length); };

async function banco({ com064 }) {
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
  await db.exec(ler("supabase/003_pessoal.sql"));
  await db.exec(`create policy "mfa" on public.pessoal as restrictive for all to authenticated using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok()))`);
  await db.exec(trecho("supabase/057_casa_radar_fiscal.sql", 'drop policy if exists "casa compartilha" on public.pessoal;', "'mercado-canais'));"));
  if (com064) { await db.exec(ler("supabase/064_casa_areas_consumo.sql")); await db.exec(ler("supabase/064_casa_areas_consumo.sql")); }   // roda duas vezes: reexecutável
  return db;
}
async function como(db, uid, sql, params = [], aal = "aal1") {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, role: "authenticated", aal })]);
  await db.exec(uid ? "set role authenticated" : "set role anon");
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); }
}
async function admin(db, sql, params = []) { await db.query("select set_config('request.jwt.claims', '', false)"); await db.exec("reset role"); return (await db.query(sql, params)).rows; }
const falha = async (p) => { try { await p; } catch (e) { return e; } assert.fail("era para dar erro"); };
const CFG = '{"v":1,"areas":[{"id":"pet-shop","nome":"Pet shop"}],"associacoes":{"Pet":"pet-shop"},"categorias":[]}';

test("texto da 064: proposta, só a política da pessoal, sem tocar dado nem RLS, mfa nem anon", () => {
  const t = ler("supabase/064_casa_areas_consumo.sql"), s = t.replace(/--.*$/gm, "");
  assert.match(t, /^-- PROPOSTA 064 · NÃO APLICADA EM PRODUÇÃO/); assert.match(s, /^\s*begin;/); assert.match(s, /commit;\s*notify pgrst, 'reload schema';\s*$/);
  assert.doesNotMatch(s, /disable row level security|"mfa"|grant .* to anon|insert into|delete from|update |truncate|drop table|drop function|create table/i);
  for (const k of ["radar-config", "radar-pagos", "radar-vinculos", "mercado-equivalencias", "mercado-alertas", "mercado-canais", "mercado-areas"]) assert.ok(s.includes("'" + k + "'"), k);
  assert.ok(!s.includes("'x-amigos'") && !/garmin/i.test(s));
});
test("PGlite · ANTES da 064 a Fernanda não vê mercado-areas (o que o dono quer corrigir); DEPOIS vê e grava a MESMA linha do dono", { skip: pular }, async () => {
  const antes = await banco({ com064: false });
  await como(antes, R, "insert into public.pessoal (user_id, chave, valor) values ($1,'mercado-areas',$2::jsonb)", [R, CFG]);
  assert.deepEqual(await como(antes, F, "select chave from public.pessoal"), [], "sem a 064 a casa não enxerga");
  const db = await banco({ com064: true });
  await como(db, R, "insert into public.pessoal (user_id, chave, valor) values ($1,'mercado-areas',$2::jsonb), ($1,'x-amigos','[\"segredo\"]'), ($1,'mercado-canais','{}')", [R, CFG]);
  assert.deepEqual((await como(db, F, "select chave from public.pessoal order by chave")).map((x) => x.chave), ["mercado-areas", "mercado-canais"], "só as chaves da casa; x-amigos continua invisível");
  assert.deepEqual((await como(db, F, "select valor from public.pessoal where chave = 'mercado-areas'"))[0].valor, JSON.parse(CFG), "a mesma configuração do dono");
  const nova = '{"v":1,"areas":[],"associacoes":{"Tecnologia":"mercado"},"categorias":[]}';
  await como(db, F, "update public.pessoal set valor = $2::jsonb where user_id = $1 and chave = 'mercado-areas'", [R, nova]);   // editar
  assert.deepEqual((await como(db, R, "select valor from public.pessoal where chave = 'mercado-areas'"))[0].valor, JSON.parse(nova), "o dono vê o que a Fernanda gravou");
  await como(db, F, "delete from public.pessoal where user_id = $1 and chave = 'mercado-areas'", [R]);   // excluir
  assert.equal((await admin(db, "select count(*)::int n from public.pessoal where chave = 'mercado-areas'"))[0].n, 0);
  await como(db, F, "insert into public.pessoal (user_id, chave, valor) values ($1,'mercado-areas',$2::jsonb)", [R, CFG]);   // criar, na linha do dono
  assert.equal((await admin(db, "select count(*)::int n from public.pessoal where user_id = $1 and chave = 'mercado-areas'", [R]))[0].n, 1);
});
test("PGlite · a 064 não abre mais nada: chave fora da lista, linha na conta dela, MFA e gente de fora seguem barrados", { skip: pular }, async () => {
  const db = await banco({ com064: true });
  assert.match((await falha(como(db, F, "insert into public.pessoal (user_id, chave, valor) values ($1,'x-amigos','[]')", [R]))).message, /row-level security|violates/i);
  assert.match((await falha(como(db, F, "insert into public.pessoal (user_id, chave, valor) values ($1,'mercado-areas','{}')", [F]))).message, /row-level security|violates/i, "linha na conta dela: recusada");
  await como(db, R, "insert into public.pessoal (user_id, chave, valor) values ($1,'mercado-areas',$2::jsonb)", [R, CFG]);
  assert.deepEqual(await como(db, X, "select chave from public.pessoal"), [], "quem é de fora não vê nada");
  assert.match((await falha(como(db, null, "select chave from public.pessoal"))).message, /permission denied/i, "anon nem chega na tabela");
  await db.exec("insert into auth.mfa_factors values ('" + F + "','verified')");
  assert.deepEqual(await como(db, F, "select chave from public.pessoal", [], "aal1"), [], "com MFA cadastrado e sessão aal1, a trava mfa barra a casa também");
  assert.equal((await como(db, F, "select chave from public.pessoal", [], "aal2")).length, 1);
});
