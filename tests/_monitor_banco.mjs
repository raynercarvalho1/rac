// Auxiliar dos testes do Monitor (M3 e M4): o Postgres de verdade (PGlite) com a migration 067 e cópias mínimas das tabelas que a view lê (a 008 entra com o DDL real).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
export const N = globalThis.RACnucleo;
export const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
export const S67 = ler("supabase/067_monitor_sinais.sql"), S68 = ler("supabase/068_monitor_leitura_servico.sql");
export let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite: pula, menos no CI */ }
export const pular = !PGlite;
export const R = "11111111-1111-4111-8111-111111111111", F = "22222222-2222-4222-8222-222222222222", X = "33333333-3333-4333-8333-333333333333";
export const trecho = (arq, ini, fim) => { const t = ler(arq), i = t.indexOf(ini); assert.ok(i >= 0, ini); return t.slice(i, t.indexOf(fim, i) + fim.length); };
export const AGORA = Date.parse("2026-11-26T15:00:00Z"), MIN = 6e4, H = 36e5;
export const iso = (ms) => new Date(ms).toISOString(), ha = (min) => iso(AGORA - min * MIN), P = (id) => N.MON_PROCESSOS.find((p) => p.id === id);


// ---------- o banco de teste ----------
export async function banco() {
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
    insert into auth.users values ('${R}'), ('${F}'), ('${X}');
  `);
  await db.exec(trecho("supabase/002_casa_compartilhada.sql", "create table if not exists public.membros", "grant execute on function public.dono_da_casa() to authenticated;"));
  await db.exec(trecho("supabase/022_seguranca.sql", "create or replace function public.rac_aal_ok()", "grant execute on function public.rac_aal_ok() to authenticated;"));
  await db.exec(`insert into public.membros (membro, dono) values ('${F}', '${R}');`);
  await db.exec(trecho("supabase/008_sistema.sql", "create table if not exists public.rotina_log", "grant select on public.rotina_log to authenticated;"));   // o DDL e a política reais
  await db.exec(`
    create table public.newsletter_edicoes (id uuid primary key default gen_random_uuid(), dono uuid not null references auth.users(id), data date, turno text, criado_em timestamptz default now(), atualizado_em timestamptz default now());
    create table public.inbox_contas (id uuid primary key default gen_random_uuid(), dono uuid not null references auth.users(id), sync_auto boolean not null default true, endereco text);
    create table public.inbox_sincronizacao (id uuid primary key default gen_random_uuid(), dono uuid not null references auth.users(id), conta_id uuid, ultima_ok_em timestamptz, ultima_tentativa_em timestamptz,
      falhas_seguidas integer not null default 0, duracao_ms integer, erro text);
    create table public.radar_coletas (id uuid primary key default gen_random_uuid(), dono uuid not null references auth.users(id), origem text, status text, iniciada_em timestamptz, terminada_em timestamptz,
      ofertas_lidas integer not null default 0, precos_gravados integer not null default 0, falhas integer not null default 0, erro_mensagem text);
    create table public.notas_fiscais_entradas (id uuid primary key default gen_random_uuid(), user_id uuid not null default public.dono_da_casa(), atualizado_em timestamptz default now());
  `);
  for (const t of ["newsletter_edicoes", "inbox_contas", "inbox_sincronizacao", "radar_coletas"]) await db.exec(`alter table public.${t} enable row level security; create policy "dono" on public.${t} for select to authenticated using (dono = auth.uid());`);
  await db.exec(`alter table public.notas_fiscais_entradas enable row level security; create policy "casa" on public.notas_fiscais_entradas for select to authenticated using (user_id = (select public.dono_da_casa()));`);
  await db.exec(S67); await db.exec(S67);   // reexecutável
  /* como na PRODUÇÃO: o service_role não tem SELECT nestas tabelas até a 068 (o harness dava tudo a ele e escondeu o erro do ensaio) */
  await db.exec("revoke all on public.rotina_log, public.newsletter_edicoes, public.inbox_contas, public.inbox_sincronizacao, public.radar_coletas, public.notas_fiscais_entradas from service_role;");
  await db.exec("grant select on public.newsletter_edicoes, public.radar_coletas to service_role;");   // estas duas já eram legíveis
  await db.exec(S68); await db.exec(S68);
  return db;
}
export const com = async (db, uid, sql, params = [], papel = "authenticated") => {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, role: papel, aal: "aal1" })]);
  await db.exec(`set role ${uid || papel === "service_role" ? papel : "anon"}`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); }
};
export const adm = async (db, sql, params = []) => { await db.query("select set_config('request.jwt.claims', '', false)"); await db.exec("reset role"); return (await db.query(sql, params)).rows; };
export const falha = async (p, rot = "") => { try { await p; } catch (e) { return e; } assert.fail("era para dar erro " + rot); };
export const limpar = (db) => adm(db, "truncate public.rotina_log, public.newsletter_edicoes, public.inbox_contas, public.inbox_sincronizacao, public.radar_coletas, public.notas_fiscais_entradas restart identity");
export const visao = async (db, uid = R) => Object.fromEntries((await adm(db, "select * from public.monitor_processos_em($1::timestamptz) where dono = $2::uuid", [iso(AGORA), uid])).map((r) => [r.processo, r]));
