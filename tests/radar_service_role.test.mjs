// Radar de Preços · migration 047 (privilégios do service_role): texto do SQL e, num Postgres de verdade dentro do Node (PGlite), o erro de produção antes dela e o mínimo depois.
// Tudo fictício. Sem rede, sem tocar no Supabase. O PGlite só existe no teste (RAC_PGLITE=<caminho do dist/index.js>; no GitHub vem do testes.yml).
// Limitação: o PGlite não é o Supabase. Ele prova os privilégios de tabela e o RLS do PostgreSQL; não prova a Edge Function, a chave nem o cron em produção (isso é o disparo controlado da rotina).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const semComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite: pula */ }
const pular = !PGlite;
const S47 = ler("supabase/047_radar_service_role.sql"), S43 = ler("supabase/043_radar_precos.sql");
const TAB = ["radar_config", "radar_lojas", "radar_itens", "radar_ofertas", "radar_coletas", "radar_precos"];

test("047 (texto): só concede ao service_role o que a função usa; nada de revoke, política, anon, authenticated, update/delete em radar_precos", () => {
  const s = semComent(S47);
  assert.match(S47.split("\n")[0], /^-- Aplicado em produção em 10\/11\/2026/); assert.match(S47.split("\n")[1], /^-- 047 · Radar de Preços/); assert.match(S47, /\nbegin;[\s\S]*commit;\s*$/);
  const grants = s.match(/grant [^;]+;/gi) || []; assert.equal(grants.length, 3, "três grants");
  for (const g of grants) assert.match(g, /to service_role;$/i, g);
  assert.ok(grants.some((g) => /grant select on public\.radar_lojas, public\.radar_ofertas, public\.radar_itens to service_role/i.test(g)));
  assert.ok(grants.some((g) => /grant select, insert, update on public\.radar_coletas to service_role/i.test(g)));
  assert.ok(grants.some((g) => /grant select, insert on public\.radar_precos to service_role/i.test(g)));
  assert.ok(!/radar_config/.test(s), "a função não usa radar_config"); assert.ok(!/\b(delete|truncate|all)\b/i.test(s.replace(/grant /gi, "")), "sem delete/truncate/all");
  assert.ok(!/\b(revoke|policy|trigger|create|alter|drop|insert into|update public|delete from)\b/i.test(s), "só grant");
  assert.ok(!/\b(anon|authenticated|public\s*[,;])/i.test(s.replace(/public\.radar_/g, "")), "não toca em anon, authenticated nem public");
});
test("047: número único, 043/045 e as migrations aplicadas intactas, e a função usa só o que foi concedido", () => {
  const nums = [...fs.readdirSync(new URL("../supabase/", import.meta.url)), ...fs.readdirSync(new URL("../supabase/propostas/", import.meta.url))].filter((f) => /^\d{3}_.*\.sql$/.test(f)).map((f) => f.slice(0, 3));
  assert.equal(nums.filter((n) => n === "047").length, 1); assert.ok(fs.existsSync(new URL("../supabase/propostas/045_radar_rotina.sql", import.meta.url)), "a 045 não foi movida");
  assert.ok(!/service_role/.test(semComent(S43)), "a 043 (já aplicada) não foi editada");
  const idx = ler("supabase/functions/radar/index.ts"), usos = {};
  for (const m of idx.matchAll(/adm\.from\("(radar_[a-z]+)"\)\.(select|insert|update|delete|upsert)\(/g)) (usos[m[1]] ||= new Set()).add(m[2]);
  const dado = { radar_lojas: ["select"], radar_ofertas: ["select"], radar_itens: ["select"], radar_coletas: ["select", "insert", "update"], radar_precos: ["select", "insert"] };
  for (const [t, ops] of Object.entries(usos)) for (const o of ops) assert.ok((dado[t] || []).includes(o), `a função faz ${o} em ${t} e a 047 não concede`);
  for (const t of Object.keys(usos)) assert.ok(dado[t], t);
});

/* ---------- Postgres de verdade ---------- */
const R = "11111111-1111-4111-8111-111111111111", L1 = "aaaaaaaa-0000-4000-8000-000000000001", I1 = "bbbbbbbb-0000-4000-8000-000000000001", O1 = "cccccccc-0000-4000-8000-000000000001";
const trecho = (arq, ini, fim) => { const t = ler(arq), i = t.indexOf(ini); assert.ok(i >= 0, ini); return t.slice(i, t.indexOf(fim, i) + fim.length); };
/* como em produção: anon e authenticated com privilégios padrão (a 043 os recolhe), service_role SEM privilégio padrão de tabela */
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
    insert into auth.users values ('${R}'); create schema storage; create table storage.buckets (id text primary key, name text, public boolean default false);
  `);
  await db.exec(trecho("supabase/002_casa_compartilhada.sql", "create table if not exists public.membros", "grant execute on function public.dono_da_casa() to authenticated;"));
  await db.exec(trecho("supabase/022_seguranca.sql", "create or replace function public.rac_aal_ok()", "grant execute on function public.rac_aal_ok() to authenticated;"));
  await db.exec(S43);
  await db.exec(`insert into public.radar_lojas (id, dono, nome) values ('${L1}', '${R}', 'Loja Exemplo');
    insert into public.radar_itens (id, dono, nome, gtin, origem) values ('${I1}', '${R}', 'Produto Exemplo', '7891234567895', 'monitorado');
    insert into public.radar_ofertas (id, dono, item_id, loja_id, url) values ('${O1}', '${R}', '${I1}', '${L1}', 'https://loja.exemplo/produto');`);
  return db;
}
async function comoPapel(db, papel, sql, params = []) { await db.exec("set role " + papel); try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); } }
const codigo = async (prom) => { try { await prom; } catch (e) { return e.code || String(e.message); } return null; };
const PRIV = ["SELECT", "INSERT", "UPDATE", "DELETE"];
async function privilegios(db, papel) { const o = {}; for (const t of TAB) { o[t] = []; for (const p of PRIV) if ((await db.query("select has_table_privilege($1, $2, $3) as ok", [papel, "public." + t, p])).rows[0].ok) o[t].push(p); } return o; }
const NOVO_PRECO = `insert into public.radar_precos (dono, oferta_id, fonte, evidencia, modalidade, meio, preco_produto, frete_situacao, frete_valor, taxas, desconto, disponibilidade, observado_em)
  values ('${R}', '${O1}', 'coleta', 'coleta automática', 'a_vista', 'pix', 100, 'confirmado', 10, 0, 0, 'disponivel', '2026-11-01T12:00:00Z') returning id`;

test("PGlite · ANTES da 047 reproduz o erro de produção: service_role sem privilégio nas tabelas do Radar (42501)", { skip: pular }, async () => {
  const db = await banco();
  for (const t of ["radar_lojas", "radar_ofertas", "radar_itens", "radar_coletas", "radar_precos"]) assert.equal(await codigo(comoPapel(db, "service_role", `select 1 from public.${t} limit 1`)), "42501", t);
  assert.deepEqual((await privilegios(db, "service_role")).radar_lojas, []);
});
test("PGlite · DEPOIS da 047: lê o necessário, abre e fecha coleta, insere preço; não atualiza nem apaga preço; nada além do mínimo", { skip: pular }, async () => {
  const db = await banco(); await db.exec(S47);
  for (const t of ["radar_lojas", "radar_ofertas", "radar_itens", "radar_coletas", "radar_precos"]) await comoPapel(db, "service_role", `select 1 from public.${t} limit 1`);
  assert.equal((await comoPapel(db, "service_role", "select dono from public.radar_lojas")).length, 1, "a consulta de donos da rotina");
  const c = (await comoPapel(db, "service_role", `insert into public.radar_coletas (dono, loja_id, origem, status, iniciada_em) values ('${R}', '${L1}', 'rotina', 'em_andamento', '2026-11-10T09:20:00Z') returning id`))[0].id;
  await comoPapel(db, "service_role", "update public.radar_coletas set status = 'ok', terminada_em = '2026-11-10T09:21:00Z', ofertas_lidas = 1, precos_gravados = 1 where id = $1", [c]);
  const p = (await comoPapel(db, "service_role", NOVO_PRECO))[0].id; assert.ok(p);
  assert.equal(await codigo(comoPapel(db, "service_role", "update public.radar_precos set preco_produto = 1 where id = $1", [p])), "42501", "preço não se atualiza");
  assert.equal(await codigo(comoPapel(db, "service_role", "delete from public.radar_precos where id = $1", [p])), "42501", "preço não se apaga");
  assert.equal(await codigo(comoPapel(db, "service_role", "delete from public.radar_coletas where id = $1", [c])), "42501", "coleta não se apaga");
  assert.equal(await codigo(comoPapel(db, "service_role", "insert into public.radar_lojas (dono, nome) values ($1, 'X')", [R])), "42501", "loja só se lê");
  assert.equal(await codigo(comoPapel(db, "service_role", "update public.radar_ofertas set situacao = situacao")), "42501", "oferta só se lê");
  assert.equal(await codigo(comoPapel(db, "service_role", "select 1 from public.radar_config")), "42501", "radar_config não foi concedida");
  assert.deepEqual(await privilegios(db, "service_role"), { radar_config: [], radar_lojas: ["SELECT"], radar_itens: ["SELECT"], radar_ofertas: ["SELECT"], radar_coletas: ["SELECT", "INSERT", "UPDATE"], radar_precos: ["SELECT", "INSERT"] });
});
test("PGlite · a 047 não muda anon, public, authenticated nem as políticas, e pode rodar de novo", { skip: pular }, async () => {
  const db = await banco();
  const antes = { anon: await privilegios(db, "anon"), auth: await privilegios(db, "authenticated"), pol: (await db.query("select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2")).rows };
  await db.exec(S47); await db.exec(S47);
  assert.deepEqual(await privilegios(db, "anon"), antes.anon); assert.deepEqual(await privilegios(db, "authenticated"), antes.auth, "authenticated igual");
  assert.deepEqual((await db.query("select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2")).rows, antes.pol, "políticas iguais");
  for (const t of TAB) assert.deepEqual(antes.anon[t], [], "anon sem privilégio em " + t);
  assert.deepEqual(antes.auth.radar_precos, ["SELECT", "INSERT"], "o histórico do site continua só de acréscimo"); assert.ok(antes.auth.radar_lojas.length === 4);
  /* public (todos os papéis): um papel sem concessão nenhuma continua sem acesso */
  await db.exec("create role qualquer nologin; grant usage on schema public to qualquer");
  for (const t of TAB) assert.equal(await codigo(comoPapel(db, "qualquer", `select 1 from public.${t} limit 1`)), "42501", "public sem acesso a " + t);
  /* o RLS continua valendo para quem usa o site: authenticated de outra conta não vê a loja do dono */
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: "99999999-9999-4999-8999-999999999999", aal: "aal1" })]);
  assert.equal((await comoPapel(db, "authenticated", "select 1 from public.radar_lojas")).length, 0);
});
