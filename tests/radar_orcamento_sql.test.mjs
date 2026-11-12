// Radar de Preços · orçamento ATÔMICO da descoberta (migration 048, aplicada em 12/11/2026): radar_reservar_consulta, radar_concluir_consulta, num Postgres de verdade dentro do Node (PGlite).
// Tudo fictício. Sem rede, sem tocar no Supabase, sem SerpApi. O PGlite só existe no teste (RAC_PGLITE=<caminho do dist/index.js>; no GitHub vem do testes.yml).
// LIMITAÇÃO HONESTA: o PGlite tem UMA conexão: as "chamadas simultâneas" abaixo são enfileiradas pelo próprio PGlite. O que o teste prova é que conferir e reservar são UM passo indivisível dentro da função (não há intervalo
// entre ler o uso e gravar a reserva) e que a regra está certa; a exclusão entre conexões paralelas vem do pg_advisory_xact_lock por dono (o mesmo mecanismo de ia_reservar, 015), que só o Postgres/Supabase real exercita.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { orcamento, autorizar, configDescoberta } from "../supabase/functions/radar/descoberta.ts";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const semComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite: pula */ }
const pular = !PGlite;
const S43 = ler("supabase/043_radar_precos.sql"), S47 = ler("supabase/047_radar_service_role.sql"), S48 = ler("supabase/048_radar_descoberta.sql");
const R = "11111111-1111-4111-8111-111111111111", X = "33333333-3333-4333-8333-333333333333", I1 = "bbbbbbbb-0000-4000-8000-000000000001";
const AGORA = "2026-11-11T15:00:00Z", T0 = Date.parse(AGORA), MIN = 60_000, H = 3600_000, DIA = 24 * H;
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
    insert into auth.users values ('${R}'), ('${X}');
    create schema storage; create table storage.buckets (id text primary key, name text, public boolean default false);
  `);
  await db.exec(trecho("supabase/002_casa_compartilhada.sql", "create table if not exists public.membros", "grant execute on function public.dono_da_casa() to authenticated;"));
  await db.exec(trecho("supabase/022_seguranca.sql", "create or replace function public.rac_aal_ok()", "grant execute on function public.rac_aal_ok() to authenticated;"));
  await db.exec(S43); await db.exec(S47); await db.exec(S48);
  await db.exec(`insert into public.radar_itens (id, dono, nome) values ('${I1}', '${R}', 'Creme Exemplo CH-02'), ('bbbbbbbb-0000-4000-8000-000000000002', '${X}', 'Item do X');`);
  return db;
}
const codigo = async (p) => { try { await p; } catch (e) { return e.code || String(e.message); } return null; };
const lim = (o = {}) => JSON.stringify({ mes: 200, dia: 20, expansoes_dia: 10, rotina_dia: 6, engine_dia: null, engine_mes: null, ...o });
let n = 0;
const RES = "select public.radar_reservar_consulta($1::uuid, $2::uuid, 'serpapi', $3, $4, null, $5, 'consulta', $6::int, $7::jsonb, $8::boolean, $9::timestamptz, $10::timestamptz) as r";
const pedido = (o = {}) => [o.dono ?? R, o.item ?? I1, o.engine ?? "google_shopping", o.origem ?? "manual", o.chave ?? "k" + ++n, o.custo ?? 1, lim(o.lim), o.forcar ?? false, o.cacheDesde ?? new Date(T0 - 24 * H).toISOString(), o.agora ?? AGORA];
/* como service_role (a função radar) */
async function sr(db, sql, p = []) { await db.exec("set role service_role"); try { return (await db.query(sql, p)).rows; } finally { await db.exec("reset role"); } }
const reservar = async (db, o) => (await sr(db, RES, pedido(o)))[0].r;
const concluir = async (db, id, s, o = {}) => (await sr(db, "select public.radar_concluir_consulta($1::uuid, $2::uuid, $3, $4::int, $5, $6, $7::int, $8::int) as r", [o.dono ?? R, id, s, o.http ?? 200, o.codigo ?? null, o.msg ?? null, o.res ?? 3, o.dur ?? 10]))[0].r;
const gasto = async (db, w = "true") => Number((await db.query(`select coalesce(sum(buscas_gastas), 0)::int g from public.radar_consultas where ${w}`)).rows[0].g);
/* semeia o uso anterior: cada linha vale no máximo 5 créditos (restrição da tabela), então g maior vira várias linhas */
const semear = (db, linhas) => db.exec(linhas.flatMap((l) => { const partes = l.g === 0 ? [0] : Array.from({ length: Math.ceil(l.g / 5) }, (_, i) => Math.min(5, l.g - i * 5));
  return partes.map((x) => `insert into public.radar_consultas (dono, item_id, engine, origem, chave_cache, status, buscas_gastas, iniciada_em, erro_codigo) values ('${R}', '${I1}', '${l.engine ?? "google_shopping"}', '${l.origem ?? "manual"}', 'semente${++n}', '${l.status ?? "ok"}', ${x}, '${l.em ?? AGORA}', ${["erro", "incerto"].includes(l.status) ? "'semente'" : "null"});`); }).join("\n"));

test("048 (texto): as duas funções do orçamento existem, são security definer com search_path vazio, só service_role executa, e o texto não ganhou nada destrutivo", () => {
  const s = semComent(S48);
  for (const f of ["radar_reservar_consulta", "radar_concluir_consulta"]) {
    assert.match(s, new RegExp(`create or replace function public\\.${f}\\(`)); assert.match(s, new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from public, anon, authenticated;`)); assert.match(s, new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to service_role;`));
  }
  assert.equal((s.match(/security definer set search_path = ''/g) || []).length >= 3, true, "as duas funções (e seguranca_estado) com search_path vazio");
  assert.match(s, /pg_advisory_xact_lock\(pg_catalog\.hashtextextended\('radar-consultas:' \|\| p_dono::text, 0\)\)/, "trava por dono, como ia_reservar");
  assert.deepEqual((s.match(/grant execute on function [^;]+;/gi) || []).map((g) => g.replace(/^[\s\S]*\) to /, "")), ["service_role;", "service_role;", "authenticated;"], "execute só para service_role (e a seguranca_estado() de sempre para authenticated)");
  assert.ok(!/\b(delete\s+from|drop\s+table)\b/i.test(s), "nada destrutivo");
  assert.match(s, /status in \('ok', 'erro', 'cache', 'bloqueada_orcamento', 'incerto', 'reservada'\)/); assert.match(s, /buscas_gastas = 0 or status in \('ok', 'incerto', 'reservada'\)/, "só reserva, ok e incerto contam");
});

test("PGlite · DUAS ou mais chamadas disputando o último crédito: só uma passa; o total nunca ultrapassa o limite (dia e mês)", { skip: pular }, async () => {
  for (const [limite, motivo] of [[{ dia: 1 }, "dia"], [{ mes: 1 }, "mes"]]) {
    const db = await banco(); await db.exec("set role service_role");
    const rs = await Promise.all([1, 2, 3, 4, 5].map(() => db.query(RES, pedido({ lim: limite })).then((x) => x.rows[0].r))); await db.exec("reset role");
    assert.equal(rs.filter((r) => r.ok).length, 1, "exatamente 1 de 5 pega o último crédito (" + motivo + ")"); assert.deepEqual([...new Set(rs.filter((r) => !r.ok).map((r) => r.motivo))], [motivo]);
    assert.equal(await gasto(db), 1, "o gasto reservado é 1, nunca 5"); assert.equal((await db.query("select count(*)::int n from public.radar_consultas where status = 'reservada'")).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::int n from public.radar_consultas where status = 'bloqueada_orcamento' and erro_codigo = $1 and buscas_gastas = 0", ["orcamento_" + motivo])).rows[0].n, 4, "as 4 bloqueadas ficam registradas, sem gasto");
  }
  /* vários créditos: 6 disputam 3 */
  const db = await banco(); await db.exec("set role service_role"); const rs = await Promise.all([1, 2, 3, 4, 5, 6].map(() => db.query(RES, pedido({ lim: { dia: 3 } })).then((x) => x.rows[0].r))); await db.exec("reset role");
  assert.equal(rs.filter((r) => r.ok).length, 3); assert.equal(await gasto(db), 3);
  /* custo 2 com saldo 1: não cabe (o custo inteiro é conferido) */
  const d2 = await banco(); await semear(d2, [{ g: 19 }]); const c2 = await reservar(d2, { custo: 2 }); assert.deepEqual([c2.ok, c2.motivo], [false, "dia"]); assert.equal((await reservar(d2, { custo: 1 })).ok, true);
});

test("PGlite · rotina e operação manual disputando o mesmo crédito; teto próprio da rotina não bloqueia o dono, e o teto diário geral vale para os dois", { skip: pular }, async () => {
  const db = await banco(); await db.exec("set role service_role");
  const rs = await Promise.all([db.query(RES, pedido({ origem: "rotina", lim: { dia: 1 } })), db.query(RES, pedido({ origem: "manual", lim: { dia: 1 } })), db.query(RES, pedido({ origem: "rotina", lim: { dia: 1 } }))].map((p) => p.then((x) => x.rows[0].r))); await db.exec("reset role");
  assert.equal(rs.filter((r) => r.ok).length, 1, "só um dos três leva o último crédito do dia, venha da rotina ou do dono"); assert.equal(await gasto(db), 1);
  const o = await banco(); await semear(o, [{ origem: "rotina", g: 6 }]);
  const r1 = await reservar(o, { origem: "rotina" }); assert.deepEqual([r1.ok, r1.motivo, r1.usado, r1.limite], [false, "rotina", 6, 6]); assert.match(r1.mensagem, /rotina automática atingido \(6\/6\)/);
  assert.equal((await reservar(o, { origem: "manual" })).ok, true, "o teto da rotina não bloqueia a busca manual");
  assert.equal((await o.query("select erro_codigo from public.radar_consultas where status = 'bloqueada_orcamento'")).rows[0].erro_codigo, "orcamento_rotina");
  /* rotina + manual juntos contam no limite diário */
  const g = await banco(); await semear(g, [{ origem: "rotina", g: 5 }, { origem: "manual", g: 15 }]); assert.equal((await reservar(g, { origem: "manual" })).motivo, "dia"); assert.equal((await reservar(g, { origem: "rotina" })).motivo, "dia");
});

test("PGlite · limites por engine (dia e mês), expansões e fuso de Brasília; a reserva pendente e o incerto contam, cache, bloqueio e erro não", { skip: pular }, async () => {
  const e = await banco(); await semear(e, [{ engine: "google_immersive_product", g: 2 }]);
  const a = await reservar(e, { engine: "google_immersive_product", lim: { engine_dia: 2 } }); assert.deepEqual([a.ok, a.motivo, a.usado, a.limite], [false, "engine_dia", 2, 2]); assert.match(a.mensagem, /limite diário do engine google_immersive_product atingido \(2\/2\)/);
  assert.equal((await reservar(e, { engine: "google_product", lim: { engine_dia: 2 } })).ok, true, "o limite de um engine não bloqueia outro");
  assert.equal((await reservar(e, { engine: "google_shopping", lim: { engine_dia: 0 } })).motivo, "engine_dia", "engine com limite 0 não gasta");
  const m = await banco(); await semear(m, [{ engine: "google_product", g: 3, em: "2026-11-02T15:00:00Z" }]);
  const b = await reservar(m, { engine: "google_product", lim: { engine_mes: 3, engine_dia: 5 } }); assert.deepEqual([b.ok, b.motivo], [false, "engine_mes"]); assert.equal((await reservar(m, { engine: "google_product", lim: { engine_mes: 4 } })).ok, true, "o mês conta os dias anteriores");
  const x = await banco(); await semear(x, [{ engine: "google_product", g: 10 }]); assert.deepEqual([(await reservar(x, { engine: "google_immersive_product" })).motivo, (await reservar(x, { engine: "google_shopping" })).ok], ["expansoes", true], "expansões têm teto próprio; a busca segue livre");
  /* o que conta e o que não conta */
  const c = await banco(); await semear(c, [{ status: "reservada", g: 4 }, { status: "incerto", g: 4 }, { status: "ok", g: 4 }, { status: "cache", g: 0 }, { status: "bloqueada_orcamento", g: 0 }, { status: "erro", g: 0 }]);
  assert.equal((await reservar(c, { lim: { dia: 12 } })).ok, false, "12/12: reserva, incerto e ok contam"); assert.equal((await reservar(c, { lim: { dia: 13 } })).ok, true);
  /* o dia e o mês são os de Brasília: 12/11 01:00 UTC ainda é 11/11; 01/11 02:00 UTC ainda é 31/10 */
  const f = await banco(); await semear(f, [{ g: 1, em: "2026-11-12T01:00:00Z" }, { g: 1, em: "2026-11-01T02:00:00Z" }]);
  assert.equal((await reservar(f, { agora: "2026-11-11T23:30:00Z", lim: { dia: 1 } })).ok, false, "12/11 01:00 UTC conta no dia 11/11 de Brasília"); assert.equal((await reservar(f, { agora: "2026-11-11T23:30:00Z", lim: { mes: 1 } })).ok, false);
  assert.equal((await reservar(f, { agora: "2026-11-12T03:30:00Z", lim: { dia: 1 } })).ok, true, "no dia seguinte (de Brasília) o limite diário volta");
  assert.deepEqual((await reservar(f, { agora: "2026-11-05T12:00:00Z", lim: { mes: 0 } })).motivo, "mes");
  /* entrada inválida nunca reserva */
  const v = await banco(); for (const o of [{ custo: 0 }, { custo: 6 }, { origem: "automatica" }]) assert.equal((await reservar(v, o)).motivo, "entrada_invalida"); assert.equal(await gasto(v), 0);
});

test("PGlite · paridade: a regra do banco e autorizar() em descoberta.ts decidem igual (mesma ordem, mesmos motivos)", { skip: pular }, async () => {
  const cenarios = [
    { usos: [], op: {}, lim: {} }, { usos: [{ g: 20 }], op: {}, lim: {} }, { usos: [{ g: 200, em: "2026-11-03T15:00:00Z" }], op: {}, lim: {} }, { usos: [{ g: 9, engine: "google_product" }], op: { engine: "google_product", custo: 2 }, lim: { expansoes_dia: 10 } },
    { usos: [{ g: 6, origem: "rotina" }], op: { origem: "rotina" }, lim: {} }, { usos: [{ g: 3, engine: "google_shopping" }], op: {}, lim: { engine_dia: 3 } }, { usos: [{ g: 3, em: "2026-11-01T15:00:00Z" }], op: {}, lim: { engine_mes: 3, engine_dia: 9 } },
    { usos: [{ g: 19 }], op: { custo: 2 }, lim: {} }, { usos: [{ g: 10, engine: "google_immersive_product", origem: "rotina" }], op: { engine: "google_immersive_product", origem: "rotina" }, lim: { rotina_dia: 10, expansoes_dia: 10 } },
    { usos: [{ g: 4, origem: "rotina" }, { g: 2, origem: "manual" }], op: { origem: "rotina", custo: 2 }, lim: { rotina_dia: 6 } }, { usos: [{ g: 2 }], op: { custo: 3 }, lim: { dia: 4, mes: 4 } },
  ];
  for (const [i, c] of cenarios.entries()) {
    const db = await banco(); if (c.usos.length) await semear(db, c.usos);
    const op = { engine: "google_shopping", origem: "manual", custo: 1, ...c.op }, L = { mes: 200, dia: 20, expansoes_dia: 10, rotina_dia: 6, engine_dia: null, engine_mes: null, ...c.lim };
    const cfg = { ...configDescoberta({}), limite_mensal: L.mes, limite_dia: L.dia, limite_expansoes_dia: L.expansoes_dia, rotina: { ativa: true, max_itens: 3, limite_dia: L.rotina_dia }, limites_engine: { [op.engine]: { dia: L.engine_dia, mes: L.engine_mes } } };
    const js = autorizar(orcamento(c.usos.map((u) => ({ iniciada_em: u.em ?? AGORA, buscas_gastas: u.g, engine: u.engine ?? "google_shopping", origem: u.origem ?? "manual" })), cfg, T0), op);
    const sql = await reservar(db, { engine: op.engine, origem: op.origem, custo: op.custo, lim: c.lim });
    assert.equal(sql.ok, js.ok, "cenário " + i + ": ok"); if (!js.ok) { assert.equal(sql.motivo, js.motivo, "cenário " + i + ": motivo"); assert.equal(sql.mensagem, js.mensagem, "cenário " + i + ": mensagem igual"); }
  }
});

test("PGlite · a mesma consulta em andamento não é paga duas vezes; o cache é conferido DENTRO da trava; forçar vale só sem outra em andamento", { skip: pular }, async () => {
  const db = await banco(); await db.exec("set role service_role");
  const rs = await Promise.all([1, 2, 3].map(() => db.query(RES, pedido({ chave: "mesma" })).then((x) => x.rows[0].r))); await db.exec("reset role");
  assert.deepEqual(rs.map((r) => r.ok ? "ok" : r.motivo).sort(), ["em_andamento", "em_andamento", "ok"], "três toques iguais: uma reserva só"); assert.equal(await gasto(db), 1);
  assert.equal((await reservar(db, { chave: "mesma", forcar: true })).motivo, "em_andamento", "nem forçar paga por cima de uma chamada em curso (toque duplo)");
  const id = rs.find((r) => r.ok).id; assert.equal(await concluir(db, id, "ok", { res: 5 }), true);
  const c = await reservar(db, { chave: "mesma" }); assert.deepEqual([c.ok, c.motivo, c.cache_de, c.resultados], [false, "cache", id, 5], "resultado recente = cache, sem gasto"); assert.equal(await gasto(db), 1);
  const f = await reservar(db, { chave: "mesma", forcar: true }); assert.equal(f.ok, true, "forçado e sem nada em curso: gasta"); assert.equal(await gasto(db), 2);
  assert.equal((await reservar(db, { chave: "mesma", forcar: true, agora: "2026-11-11T15:01:00Z" })).motivo, "em_andamento");
  /* erro não vira cache: depois de um erro definitivo, a mesma consulta pode ser tentada */
  const e = await banco(); const r1 = await reservar(e, { chave: "k-erro" }); await concluir(e, r1.id, "erro", { http: 401, codigo: "chave_recusada" }); assert.equal((await reservar(e, { chave: "k-erro" })).ok, true);
  /* cache vencido (mais de 24 h) não vale */
  const v = await banco(); const r2 = await reservar(v, { chave: "k-v" }); await concluir(v, r2.id, "ok"); assert.equal((await reservar(v, { chave: "k-v", agora: "2026-11-12T16:00:00Z", cacheDesde: "2026-11-11T16:00:00Z" })).ok, true);
});

test("PGlite · a reserva só é consumida UMA vez; erro libera o crédito; ok e incerto o retêm; resposta atrasada não desfaz um incerto; outro dono não mexe", { skip: pular }, async () => {
  const db = await banco(); const a = await reservar(db), b = await reservar(db), c = await reservar(db); assert.equal(await gasto(db), 3);
  assert.equal(await concluir(db, a.id, "ok"), true); assert.equal(await concluir(db, a.id, "ok"), false, "segunda conclusão da mesma reserva: recusada"); assert.equal(await concluir(db, a.id, "erro", { codigo: "x1" }), false, "e não vira erro depois de ok");
  assert.equal(await gasto(db), 3, "ok retém");
  assert.equal(await concluir(db, b.id, "erro", { http: 429, codigo: "limite" }), true); assert.equal(await gasto(db), 2, "erro definitivo LIBERA o crédito"); assert.equal(await concluir(db, b.id, "incerto", { codigo: "rede" }), false, "erro resolvido não vira incerto nem gasta de novo"); assert.equal(await gasto(db), 2);
  assert.equal(await concluir(db, c.id, "incerto", { http: null, codigo: "tempo_esgotado", res: 0 }), true); assert.equal(await gasto(db), 2, "incerto RETÉM"); assert.equal(await concluir(db, c.id, "ok"), false, "resposta atrasada não transforma incerto em ok");
  const o = await reservar(db); assert.equal(await concluir(db, o.id, "ok", { dono: X }), false, "outro dono não resolve a reserva"); assert.equal(await concluir(db, "99999999-9999-4999-8999-999999999999", "ok"), false, "reserva inexistente");
  assert.ok(await codigo(sr(db, "select public.radar_concluir_consulta($1::uuid, $2::uuid, 'cache', null, null, null, 0, 0)", [R, o.id])), "só ok, erro e incerto concluem"); assert.ok(await codigo(sr(db, "select public.radar_concluir_consulta($1::uuid, $2::uuid, 'erro', null, null, null, 0, 0)", [R, o.id])), "erro sempre traz o código (a restrição do banco)");
  const L = (await db.query("select status, erro_codigo, http_status, resultados, buscas_gastas, finalizada_em is not null as fim from public.radar_consultas where id = $1", [c.id])).rows[0]; assert.deepEqual([L.status, L.erro_codigo, L.buscas_gastas, L.fim], ["incerto", "tempo_esgotado", 1, true]);
});

test("PGlite · HTTP 200 vazio: concluído como ok com 0 resultados CONTA o crédito e vira cache; falha de gravação depois da chamada fica incerta e retida", { skip: pular }, async () => {
  const db = await banco(); const a = await reservar(db, { chave: "vazio" }); assert.equal(await concluir(db, a.id, "ok", { codigo: "sem_resultados", res: 0 }), true);
  const L = (await db.query("select status, resultados, erro_codigo, buscas_gastas from public.radar_consultas where id = $1", [a.id])).rows[0]; assert.deepEqual([L.status, L.resultados, L.erro_codigo, L.buscas_gastas], ["ok", 0, "sem_resultados", 1], "vazio conta e não é erro gratuito");
  assert.deepEqual([(await reservar(db, { chave: "vazio" })).motivo], ["cache"], "a mesma busca vazia não é paga de novo dentro do prazo");
  const p = await reservar(db, { chave: "persist" }); assert.equal(await concluir(db, p.id, "incerto", { codigo: "falha_persistencia", res: 7 }), true);
  assert.equal(await gasto(db, "chave_cache = 'persist'"), 1, "a resposta chegou (cobrança certa) mas a gravação falhou: o crédito fica retido"); assert.equal((await reservar(db, { chave: "persist" })).ok, true, "incerto não vira cache: o dono pode tentar de novo conscientemente");
});

test("PGlite · reserva órfã (a função parou depois de reservar): vira incerto e CONTINUA contando; nunca é liberada por prazo; nada a reconciliar", { skip: pular }, async () => {
  const db = await banco(); await reservar(db, { agora: new Date(T0 - 11 * MIN).toISOString(), chave: "orfa" }); const prazo = await reservar(db, { agora: new Date(T0 - 5 * MIN).toISOString(), chave: "recente" });
  assert.equal((await db.query("select count(*)::int n from public.radar_consultas where status = 'reservada'")).rows[0].n, 2);
  const x = await reservar(db, { chave: "outra" }); assert.equal(x.ok, true);
  const orfas = (await db.query("select id, status, erro_codigo, buscas_gastas, finalizada_em is not null as fim from public.radar_consultas where chave_cache = 'orfa'")).rows; assert.deepEqual([orfas[0].status, orfas[0].erro_codigo, orfas[0].buscas_gastas, orfas[0].fim], ["incerto", "reserva_orfa", 1, true], "mais de 10 min sem resposta: incerto, crédito mantido");
  assert.equal((await db.query("select status from public.radar_consultas where id = $1", [prazo.id])).rows[0].status, "reservada", "a reserva recente (em curso) não é tocada");
  assert.equal(await concluir(db, orfas[0].id, "ok"), false, "a resposta que chega depois que virou órfã não desfaz o incerto");
  /* dois dias depois: continua contando no mês e nunca foi liberada pelo tempo */
  assert.equal((await reservar(db, { agora: new Date(T0 + 2 * DIA).toISOString(), lim: { mes: 3 } })).motivo, "mes", "órfã, a que ficou sem resposta e a nova (3 no mês): dois dias depois o incerto continua contando");
  assert.equal((await db.query("select count(*)::int n from public.radar_consultas where status = 'incerto'")).rows[0].n >= 1, true);
  /* não existe reconciliação: nada no banco devolve o crédito de um incerto (só a virada do dia e do mês) */
  assert.equal((await db.query("select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'radar_reconcil%'")).rows[0].n, 0);
  assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_name = 'radar_consultas' and column_name like 'reconcil%'")).rows[0].n, 0);
  assert.equal(await codigo(sr(db, "update public.radar_consultas set buscas_gastas = 0 where status = 'incerto'")), "42501", "nem o service_role zera um incerto");
});

test("PGlite · privilégios: só service_role executa as funções; o site, o anon e outras contas não; e a tabela continua só de acréscimo para o service_role", { skip: pular }, async () => {
  const db = await banco(); await db.exec(`set role anon`); for (const f of ["radar_reservar_consulta", "radar_concluir_consulta"]) for (const papel of ["anon", "authenticated"]) {
    await db.exec("reset role"); assert.equal((await db.query("select has_function_privilege($1, p.oid, 'EXECUTE') as ok from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $2", [papel, f])).rows[0].ok, false, `${papel} não executa ${f}`);
    assert.equal((await db.query("select has_function_privilege('service_role', p.oid, 'EXECUTE') as ok from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1", [f])).rows[0].ok, true);
  }
  await db.exec("reset role"); await db.exec("set role authenticated"); assert.equal(await codigo(db.query(RES, pedido())), "42501", "o site não reserva crédito"); await db.exec("reset role");
  const r = await reservar(db); assert.equal(await codigo(sr(db, "update public.radar_consultas set status = 'ok' where id = $1", [r.id])), "42501", "o service_role não edita a consulta direto: só pelas funções"); assert.equal(await codigo(sr(db, "delete from public.radar_consultas")), "42501");
  assert.equal((await db.query("select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'radar_reservar_consulta'")).rows[0].prosecdef, true);
  const e = (await db.query("select public.seguranca_estado() as e").catch(() => null)); /* seguranca_estado exige login: a auditoria de funções abertas está em radar_descoberta_sql */
  const abertas = (await db.query("select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and p.proname like 'radar_%' and has_function_privilege('anon', p.oid, 'EXECUTE')")).rows; assert.deepEqual(abertas, [], "nenhuma função security definer do Radar aberta ao anon"); void e;
});
