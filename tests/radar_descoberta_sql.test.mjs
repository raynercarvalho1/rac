// Radar de Preços · migration 048 (aplicada em produção em 12/11/2026): consultas e candidatos da descoberta. Texto do SQL e, num Postgres de verdade dentro do Node (PGlite), RLS, trava MFA, privilégios mínimos e restrições.
// Tudo fictício. Sem rede, sem tocar no Supabase. O PGlite só existe no teste (RAC_PGLITE=<caminho do dist/index.js>; no GitHub vem do testes.yml).
// Limitação: o PGlite prova o PostgreSQL (RLS, privilégios, checks); não prova o Supabase real, a Edge Function nem o cron.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const semComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite: pula */ }
const pular = !PGlite;
const S43 = ler("supabase/043_radar_precos.sql"), S47 = ler("supabase/047_radar_service_role.sql"), S48 = ler("supabase/048_radar_descoberta.sql");
const NOVAS = ["radar_consultas", "radar_candidatos", "radar_historico"];

test("048 (texto): aplicada (em supabase/, fora de propostas/), só cria, RLS + mfa + sem anon, service_role mínimo, e seguranca_estado() igual à da 043 mais as duas tabelas", () => {
  assert.match(S48.split("\n")[0], /^-- Aplicado em produção em 12\/11\/2026/); assert.ok(!/status: pendente|PROPOSTA 048/.test(S48.split("\n").slice(0, 6).join("\n")), "o cabeçalho não diz mais pendente"); assert.match(S48, /\nbegin;[\s\S]*\ncommit;/);
  assert.ok(fs.existsSync(new URL("../supabase/048_radar_descoberta.sql", import.meta.url)) && !fs.existsSync(new URL("../supabase/propostas/048_radar_descoberta.sql", import.meta.url)), "está entre as migrations aplicadas e saiu de propostas/");
  const s = semComent(S48); for (const t of NOVAS) assert.match(s, new RegExp(`create table if not exists public\\.${t} \\(`));
  assert.equal((s.match(/create table /g) || []).length, 3); assert.ok(!/\b(drop\s+table|truncate\s+(table\s+)?public\.|delete\s+from|alter\s+table\s+public\.(?!radar_|%I))/i.test(s), "nada destrutivo nem de outro módulo");
  assert.match(s, /foreach t in array array\['radar_consultas', 'radar_candidatos', 'radar_historico'\]/); assert.match(s, /create policy "so o dono"/); assert.match(s, /as restrictive for all to authenticated using \(\(select public\.rac_aal_ok\(\)\)\)/); assert.match(s, /revoke all on public\.%I from public, anon, authenticated/);
  assert.ok(!/grant[^;]*\banon\b/i.test(s.replace(/revoke[^;]*;/gi, "")), "nenhum grant para anon");
  const grants = s.match(/grant [^;]+;/gi) || []; assert.deepEqual(grants.filter((g) => /to service_role/i.test(g) && !/^grant execute/i.test(g)).map((g) => g.replace(/\s+/g, " ")), ["grant select, insert on public.radar_consultas, public.radar_historico to service_role;", "grant select, insert, update on public.radar_candidatos to service_role;"]);
  assert.ok(grants.some((g) => /grant select on public\.radar_consultas, public\.radar_historico to authenticated/i.test(g)) && grants.some((g) => /grant update \(decisao, oferta_id, atualizado_em\) on public\.radar_candidatos to authenticated/i.test(g)), "o site só lê consultas e só muda a decisão");
  assert.ok(!grants.some((g) => /\b(delete)\b/i.test(g) && /service_role/i.test(g)), "service_role não apaga");
  assert.ok(!/service_role/.test(semComent(S43)), "a 043 não foi editada");
  const fn = (t) => { const i = t.indexOf("create or replace function public.seguranca_estado()"); return t.slice(i, t.indexOf("grant execute on function public.seguranca_estado() to authenticated;", i)); };
  assert.equal(fn(S48).replace(/\s+/g, " ").replace("'radar_consultas', 'radar_candidatos', 'radar_historico', ", ""), fn(S43).replace(/\s+/g, " "), "a função de segurança é a da 043, só com as três tabelas a mais");
  assert.ok(!/provedor\s+text[^,]*check \(provedor in|engine\s+text[^,]*check \(engine in/.test(s), "provedor e engine são validados por formato, não por lista fechada: um provedor novo não exige migration");
  /* backup: só-exportar, depois dos pais, marcadas dep 048 (ignoradas sem falha enquanto a tabela não existir) */
  const N = globalThis.RACnucleo || (createRequire(import.meta.url)("../nucleo.js"), globalThis.RACnucleo), nomes = N.SEG_TABELAS.map((d) => d.t);
  for (const t of NOVAS) { const d = N.segDef(t); assert.ok(d, t + " está no backup"); assert.equal(d.so, "exportar"); assert.equal(d.dep, "048"); assert.equal(d.dono, "dono"); }
  for (const d of N.SEG_TABELAS) for (const pai of Object.values(d.fk || {})) assert.ok(nomes.indexOf(pai) >= 0 && nomes.indexOf(pai) < nomes.indexOf(d.t), pai + " antes de " + d.t);
  assert.ok(N.segTabelaAusente('relation "public.radar_candidatos" does not exist') && N.segTabelaAusente("42P01") && N.segTabelaAusente("Could not find the table 'public.x' in the schema cache") && !N.segTabelaAusente("permission denied for table radar_candidatos") && !N.segTabelaAusente("Failed to fetch"), "só a tabela ausente é ignorada; permissão e rede continuam sendo falha");
  const limpo = N.segLimpar("radar_candidatos", [{ id: "1", titulo: "x", page_token: "SEGREDO-DO-GOOGLE", token_observado_em: "2026-11-11T00:00:00Z", preco: 10 }]); assert.ok(!JSON.stringify(limpo.linhas).includes("SEGREDO-DO-GOOGLE") && limpo.fora.length >= 1, "o token do Google nunca sai no backup");
  assert.match(ler("js/seguranca.js"), /d\.dep&&NUCLEO\.segTabelaAusente\(e\.message\)\)return/, "a exportação JSON ignora a tabela ausente"); assert.match(ler("js/sistema.js"), /ainda não existe \(migration "\+d\.dep/, "o .zip registra que ela ainda não existe");
  assert.match(ler("supabase/functions/garmin/index.ts"), /for \(const t of \[/, "o backup semanal do servidor (função garmin, intocável) tem a própria lista e não inclui estas tabelas");
});

/* ---------- Postgres de verdade ---------- */
const R = "11111111-1111-4111-8111-111111111111", F = "22222222-2222-4222-8222-222222222222", X = "33333333-3333-4333-8333-333333333333", M = "44444444-4444-4444-8444-444444444444";
const I1 = "bbbbbbbb-0000-4000-8000-000000000001", L1 = "aaaaaaaa-0000-4000-8000-000000000001", O1 = "cccccccc-0000-4000-8000-000000000001";
const trecho = (arq, ini, fim) => { const t = ler(arq), i = t.indexOf(ini); assert.ok(i >= 0, ini); return t.slice(i, t.indexOf(fim, i) + fim.length); };
async function banco(comMigration = true) {
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
  await db.exec(S43); await db.exec(S47);
  await db.exec(`insert into public.radar_itens (id, dono, nome) values ('${I1}', '${R}', 'Creme Exemplo CH-02'); insert into public.radar_lojas (id, dono, nome) values ('${L1}', '${R}', 'Loja Exemplo');
    insert into public.radar_ofertas (id, dono, item_id, loja_id, url) values ('${O1}', '${R}', '${I1}', '${L1}', 'https://loja.exemplo/p');`);
  if (comMigration) await db.exec(S48);
  return db;
}
async function como(db, papel, uid, sql, params = [], aal = "aal1") {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, role: papel, aal })]); await db.exec("set role " + papel);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); }
}
const codigo = async (p) => { try { await p; } catch (e) { return e.code || String(e.message); } return null; };
const CONS = (extra = "") => `insert into public.radar_consultas (dono, item_id, engine, chave_cache, consulta, status, resultados, buscas_gastas ${extra ? "," + extra.split("=")[0] : ""}) values ('${R}', '${I1}', 'google_shopping', 'google_shopping?q=x', 'x', 'ok', 3, 1 ${extra ? "," + extra.split("=")[1] : ""}) returning id`;
const CAND = (id = "g1", extra = {}) => { const d = { dono: R, item_id: I1, engine: "google_shopping", id_externo: id, titulo: "Kit 2 Creme CH-02 454g", loja: "Magalu", link: "https://www.google.com/search?x", link_tipo: "google", preco: 133.92, chave_dedup: "magalu|kit2|" + id, observado_em: "2026-11-11T21:00:00Z", ...extra }, k = Object.keys(d);
  return [`insert into public.radar_candidatos (${k.join(",")}) values (${k.map((_, i) => "$" + (i + 1)).join(",")}) returning id`, k.map((x) => d[x])]; };

test("PGlite · a 048 roda duas vezes, cria as duas tabelas com RLS e as colunas que a função grava existem", { skip: pular }, async () => {
  const db = await banco(); await db.exec(S48);
  const t = (await db.query("select relname, relrowsecurity from pg_class where relname = any($1) order by 1", [NOVAS])).rows; assert.deepEqual(t.map((x) => [x.relname, x.relrowsecurity]), [["radar_candidatos", true], ["radar_consultas", true], ["radar_historico", true]]);
  const pol = (await db.query("select tablename, policyname, permissive from pg_policies where tablename = any($1) order by 1, 2", [NOVAS])).rows; assert.equal(pol.length, 6); assert.ok(pol.filter((p) => p.policyname === "mfa").every((p) => p.permissive === "RESTRICTIVE"));
  const idx = fs.readFileSync(new URL("../supabase/functions/radar/index.ts", import.meta.url), "utf8"), cols = [...idx.match(/COLUNAS_CAND = \[([\s\S]*?)\] as const/)[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  const existentes = new Set((await db.query("select column_name from information_schema.columns where table_name = 'radar_candidatos'")).rows.map((x) => x.column_name)); assert.deepEqual(cols.filter((c) => !existentes.has(c)), [], "toda coluna que a função grava existe na tabela");
  const consCols = ["item_id", "provedor", "engine", "origem", "variante", "chave_cache", "consulta", "status", "http_status", "erro_codigo", "erro_mensagem", "resultados", "buscas_gastas", "iniciada_em", "duracao_ms", "cache_de"], ec = new Set((await db.query("select column_name from information_schema.columns where table_name = 'radar_consultas'")).rows.map((x) => x.column_name));
  assert.deepEqual(consCols.filter((c) => !ec.has(c)), []);
  const histCols = ["produto_chave", "apresentacao_chave", "provedor", "engine", "id_externo", "loja", "titulo", "tipo_oferta", "quantidade", "medida_valor", "medida_unidade", "preco", "total", "preco_por_medida", "base_medida", "frete_situacao", "link_tipo", "observado_em", "dono", "item_id", "consulta_id"], hc = new Set((await db.query("select column_name from information_schema.columns where table_name = 'radar_historico'")).rows.map((x) => x.column_name));
  assert.deepEqual(histCols.filter((c) => !hc.has(c)), [], "toda coluna que a função grava no histórico existe");
});

test("PGlite · privilégios: service_role grava só o necessário; o site lê e só muda a decisão; anon e outras contas nada; a casa (Fernanda) nada", { skip: pular }, async () => {
  const db = await banco();
  const q = (await como(db, "service_role", R, CONS()))[0].id; const c = (await como(db, "service_role", R, ...CAND("g1", { consulta_id: q })))[0].id; assert.ok(q && c);
  await como(db, "service_role", R, "update public.radar_candidatos set preco = 120 where id = $1", [c]);
  assert.equal(await codigo(como(db, "service_role", R, "delete from public.radar_candidatos where id = $1", [c])), "42501", "service_role não apaga candidato");
  assert.equal(await codigo(como(db, "service_role", R, "update public.radar_consultas set resultados = 9")), "42501", "consulta é só de acréscimo");
  assert.equal(await codigo(como(db, "service_role", R, "delete from public.radar_consultas")), "42501");
  /* o dono, pelo site */
  assert.equal((await como(db, "authenticated", R, "select id from public.radar_candidatos")).length, 1); assert.equal((await como(db, "authenticated", R, "select id from public.radar_consultas")).length, 1);
  assert.equal(await codigo(como(db, "authenticated", R, ...CAND("g2"))), "42501", "o site não insere candidato"); assert.equal(await codigo(como(db, "authenticated", R, CONS())), "42501", "o site não registra consulta");
  await como(db, "authenticated", R, "update public.radar_candidatos set decisao = 'ignorado', atualizado_em = now() where id = $1", [c]);
  assert.equal(await codigo(como(db, "authenticated", R, "update public.radar_candidatos set preco = 1 where id = $1", [c])), "42501", "o site não edita preço"); assert.equal(await codigo(como(db, "authenticated", R, "update public.radar_candidatos set titulo = 'x' where id = $1", [c])), "42501");
  assert.equal(await codigo(como(db, "authenticated", R, "update public.radar_consultas set resultados = 1")), "42501");
  await como(db, "authenticated", R, "delete from public.radar_candidatos where id = $1", [c]); assert.equal((await como(db, "authenticated", R, "select id from public.radar_candidatos")).length, 0, "o dono pode limpar candidatos");
  /* quem não é o dono */
  const c2 = (await como(db, "service_role", R, ...CAND("g3")))[0].id; assert.ok(c2);
  for (const quem of [X, F]) { assert.equal((await como(db, "authenticated", quem, "select id from public.radar_candidatos")).length, 0, "outra conta ou a casa não vê"); assert.equal((await como(db, "authenticated", quem, "select id from public.radar_consultas")).length, 0); }
  assert.equal(await codigo(como(db, "anon", null, "select 1 from public.radar_candidatos")), "42501"); assert.equal(await codigo(como(db, "anon", null, "select 1 from public.radar_consultas")), "42501");
  for (const t of NOVAS) for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE"]) assert.equal((await db.query("select has_table_privilege('anon', $1, $2) as ok", ["public." + t, p])).rows[0].ok, false, `anon sem ${p} em ${t}`);
});

test("PGlite · trava MFA: com fator verificado, só vale com aal2", { skip: pular }, async () => {
  const db = await banco(); await db.exec(`insert into public.radar_itens (id, dono, nome) values ('${I1.replace(/1$/, "9")}', '${M}', 'Item do M');`);
  await db.exec(`insert into public.radar_candidatos (dono, item_id, engine, id_externo, titulo, chave_dedup, observado_em) values ('${M}', '${I1.replace(/1$/, "9")}', 'google_shopping', 'a', 'Teste', 'k', now());`);
  assert.equal((await como(db, "authenticated", M, "select id from public.radar_candidatos", [], "aal1")).length, 0, "aal1 com fator verificado: nada"); assert.equal((await como(db, "authenticated", M, "select id from public.radar_candidatos", [], "aal2")).length, 1);
});

test("PGlite · restrições: gasto só em busca ok, erro com código, acompanhando exige oferta, sem duplicar, link https, tipo e composição válidos; o histórico de preços do Radar não é tocado", { skip: pular }, async () => {
  const db = await banco(), sr = (sql, p = []) => como(db, "service_role", R, sql, p);
  assert.ok(await codigo(sr(`insert into public.radar_consultas (dono, item_id, engine, chave_cache, status, buscas_gastas, erro_codigo) values ('${R}', '${I1}', 'google_shopping', 'k', 'erro', 1, 'limite')`)), "erro não gasta busca");
  assert.ok(await codigo(sr(`insert into public.radar_consultas (dono, item_id, engine, chave_cache, status) values ('${R}', '${I1}', 'google_shopping', 'k', 'erro')`)), "erro sem código");
  assert.ok(await codigo(sr(`insert into public.radar_consultas (dono, item_id, engine, chave_cache, status, buscas_gastas) values ('${R}', '${I1}', 'google_shopping', 'k', 'cache', 1)`)), "cache não gasta busca");
  assert.ok(await codigo(sr(`insert into public.radar_consultas (dono, item_id, engine, chave_cache, status) values ('${R}', '${I1}', 'Google Maps', 'k', 'ok')`)), "engine fora do formato (letras minúsculas, números e _)");
  await sr(`insert into public.radar_consultas (dono, item_id, engine, chave_cache, status, erro_codigo) values ('${R}', '${I1}', 'google_shopping', 'k', 'erro', 'limite')`);
  await sr(...CAND("d1")); assert.equal(await codigo(sr(...CAND("d1"))), "23505", "mesmo anúncio (mesma chave) não duplica");
  for (const [extra, motivo] of [[{ link: "http://inseguro.exemplo" }, "link http"], [{ tipo_oferta: "inventado" }, "tipo"], [{ composicao: "{}" }, "composição fora de lista"], [{ preco: 0 }, "preço zero"], [{ frete_situacao: "gratis_confirmado" }, "frete confirmado não vem do provedor"], [{ decisao: "acompanhando" }, "acompanhando sem oferta"], [{ avaliacao: 7 }, "nota fora de 0 a 5"], [{ item_id: I1.replace(/1$/, "7") }, "item de outra conta/inexistente"]])
    assert.ok(await codigo(sr(...CAND("e" + motivo.length, { chave_dedup: "x" + motivo, ...extra }))), motivo);
  await sr(...CAND("ok1", { chave_dedup: "ok1", decisao: "acompanhando", oferta_id: O1 })); assert.equal(await codigo(sr(...CAND("ok2", { chave_dedup: "ok2", oferta_id: "dddddddd-0000-4000-8000-000000000009" }))), "23503", "a oferta ligada precisa existir e ser do dono");
  assert.equal((await db.query("select count(*)::int n from public.radar_precos")).rows[0].n, 0, "a descoberta não grava preço no histórico do Radar");
});

test("PGlite · seguranca_estado(): as duas tabelas novas entram na conferência da trava mfa e nada fica sem RLS nem aberto ao anon", { skip: pular }, async () => {
  const db = await banco(); const e = (await como(db, "authenticated", R, "select public.seguranca_estado() as e"))[0].e;
  assert.deepEqual(e.sem_trava_mfa.filter((t) => /^radar_/.test(t)), [], "(a tabela membros do teste não tem a trava; só as do Radar importam aqui)"); assert.deepEqual(e.sem_rls.filter((t) => /^radar_/.test(t)), []); assert.deepEqual(e.anon_le.filter((t) => /^radar_/.test(t)), []);
  await db.exec("drop policy \"mfa\" on public.radar_candidatos"); const e2 = (await como(db, "authenticated", R, "select public.seguranca_estado() as e"))[0].e; assert.deepEqual(e2.sem_trava_mfa.filter((t) => /^radar_/.test(t)), ["radar_candidatos"], "a auditoria enxerga a falta da trava");
});

test("PGlite · histórico só de acréscimo (nem o administrador edita ou apaga; só some junto com a conta), o site só lê, e provedor/engine novos passam sem migration", { skip: pular }, async () => {
  const db = await banco(), sr = (sql, p = []) => como(db, "service_role", R, sql, p);
  const q = (await sr(CONS()))[0].id;
  const OBS = (id = "a1", extra = {}) => { const d = { dono: R, item_id: I1, consulta_id: q, produto_chave: "principia|ch02", apresentacao_chave: "2x454g", provedor: "serpapi", engine: "google_shopping", id_externo: id, loja: "Magalu", titulo: "Kit 2 Creme CH-02 454g", tipo_oferta: "kit_mesmo_produto", quantidade: 2, preco: 133.92, observado_em: "2026-11-11T21:00:00Z", ...extra }, k = Object.keys(d);
    return [`insert into public.radar_historico (${k.join(",")}) values (${k.map((_, i) => "$" + (i + 1)).join(",")}) returning id`, k.map((x) => d[x])]; };
  const h = (await sr(...OBS()))[0].id; assert.ok(h);
  assert.equal(await codigo(sr("update public.radar_historico set preco = 1 where id = $1", [h])), "42501", "service_role não edita"); assert.equal(await codigo(sr("delete from public.radar_historico where id = $1", [h])), "42501", "service_role não apaga");
  assert.equal(await codigo(db.query("update public.radar_historico set preco = 1")), "42501", "nem o administrador edita"); assert.equal(await codigo(db.query("delete from public.radar_historico")), "42501", "nem apaga"); assert.equal(await codigo(db.query("truncate public.radar_historico")), "42501", "nem esvazia");
  assert.equal((await como(db, "authenticated", R, "select id from public.radar_historico")).length, 1, "o dono lê pelo site");
  for (const [nome, sql, p] of [["inserir", ...OBS("a2")], ["editar", "update public.radar_historico set preco = 1", []], ["apagar", "delete from public.radar_historico", []]]) assert.equal(await codigo(como(db, "authenticated", R, sql, p)), "42501", "o site não pode " + nome);
  for (const quem of [X, F]) assert.equal((await como(db, "authenticated", quem, "select id from public.radar_historico")).length, 0, "outra conta e a casa não veem");
  assert.equal(await codigo(como(db, "anon", null, "select 1 from public.radar_historico")), "42501");
  /* um provedor novo e um engine novo entram sem mudar o banco; formato inválido não */
  await sr(...OBS("m1", { provedor: "mercadolivre", engine: "items_search" })); assert.ok(await codigo(sr(...OBS("m2", { provedor: "Google Maps" }))), "provedor fora do formato"); assert.ok(await codigo(sr(...OBS("m3", { engine: "x" }))), "engine curto demais");
  for (const [extra, motivo] of [[{ preco: 0 }, "preço zero"], [{ tipo_oferta: "inventado" }, "tipo"], [{ frete_situacao: "gratis_confirmado" }, "frete confirmado não vem do provedor"], [{ item_id: I1.replace(/1$/, "7") }, "item inexistente"], [{ quantidade: 0 }, "quantidade"]]) assert.ok(await codigo(sr(...OBS("x" + motivo.length, extra))), motivo);
  /* consultas: origem e o status "incerto" (retém crédito) */
  await sr(`insert into public.radar_consultas (dono, item_id, provedor, engine, origem, chave_cache, status, erro_codigo, buscas_gastas) values ('${R}', '${I1}', 'serpapi', 'google_shopping', 'rotina', 'k', 'incerto', 'tempo_esgotado', 1)`);
  assert.ok(await codigo(sr(`insert into public.radar_consultas (dono, item_id, engine, chave_cache, status, buscas_gastas) values ('${R}', '${I1}', 'google_shopping', 'k', 'incerto', 1)`)), "incerto sem código");
  assert.ok(await codigo(sr(`insert into public.radar_consultas (dono, item_id, engine, origem, chave_cache, status) values ('${R}', '${I1}', 'google_shopping', 'automatica', 'k', 'ok')`)), "origem fora de manual/rotina");
  assert.ok(await codigo(sr(`insert into public.radar_consultas (dono, item_id, engine, chave_cache, status, buscas_gastas) values ('${R}', '${I1}', 'google_shopping', 'k', 'bloqueada_orcamento', 1)`)), "bloqueio não gasta");
  /* excluir a conta leva junto o histórico (gatilho dentro de gatilho), sem ser a porta para apagar à mão */
  const Z = "55555555-5555-4555-8555-555555555555", IZ = "bbbbbbbb-0000-4000-8000-0000000000ff"; await db.exec(`insert into auth.users values ('${Z}'); insert into public.radar_itens (id, dono, nome) values ('${IZ}', '${Z}', 'Item Z'); insert into public.radar_historico (dono, item_id, provedor, engine, id_externo, titulo, tipo_oferta, preco, observado_em) values ('${Z}', '${IZ}', 'serpapi', 'google_shopping', 'z', 'Z', 'individual', 10, now());`);
  await db.exec(`delete from auth.users where id = '${Z}'`); assert.equal((await db.query(`select count(*)::int n from public.radar_historico where dono = '${Z}'`)).rows[0].n, 0, "a exclusão da conta leva o histórico");
});
