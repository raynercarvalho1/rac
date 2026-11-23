// Lote 3 (23/11/2026): rotas simplificadas dos treinos para o mapa geral. Fixtures fictícias, sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const R = await import(new URL("../supabase/functions/garmin/rotas.ts", import.meta.url));
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8");
const idx = ler("supabase/functions/garmin/index.ts"), sql = ler("supabase/065_garmin_rotas.sql"), hub = ler("js/saude-hub.js"), sa = ler("js/saude.js");

test("simplificarRota: até 150 pontos [lat, lon] com 5 casas, passo regular, primeiro e último sempre presentes", () => {
  const rota = Array.from({ length: 1500 }, (_, i) => [-23.5 + i * 1e-5 + 1e-8, -47.46 + i * 1e-5, 2.5]);
  const o = R.simplificarRota(rota);
  assert.equal(o.length, 150); assert.equal(R.MAX_PONTOS, 150);
  assert.deepEqual(o[0], [-23.5, -47.46]); assert.deepEqual(o[149], [-23.48501, -47.44501]);
  assert.ok(o.every((p) => p.length === 2 && String(p[0]).split(".")[1].length <= 5));
  assert.equal(R.simplificarRota(rota.slice(0, 40)).length, 40, "rota curta fica inteira");
  assert.equal(R.simplificarRota(rota, 10).length, 10);
});
test("simplificarRota: sem GPS, ponto inválido, fora do globo ou 0,0 não entram; nunca lança", () => {
  assert.deepEqual(R.simplificarRota([]), []); assert.deepEqual(R.simplificarRota(null), []); assert.deepEqual(R.simplificarRota("x"), []);
  assert.deepEqual(R.simplificarRota([[0, 0], [91, 0], [0, 181], [null, 1], ["a", "b"], [NaN, 2]]), []);
  assert.deepEqual(R.simplificarRota([[-23.5, -47.4, 1], [0, 0], [-23.6, -47.5]]), [[-23.5, -47.4], [-23.6, -47.5]]);
});
test("migration 065: tabela nova só do dono, com mfa, sem anon, limite de 150 pontos, aditiva (sem drop/delete de dados)", () => {
  assert.match(sql, /create table if not exists public\.garmin_rotas/);
  assert.match(sql, /jsonb_array_length\(pontos\) <= 150/);
  assert.match(sql, /foreach t in array array\['garmin_rotas'\] loop/);
  assert.match(sql, /not exists \(select 1 from public\.membros m where m\.membro = \(select auth\.uid\(\)\)\)/);
  assert.match(sql, /create policy "mfa" on public\.%I as restrictive/);
  assert.match(sql, /revoke all on public\.%I from public, anon/);
  const so = sql.replace(/--.*$/gm, "");
  assert.ok(!/\bdelete from\b|\btruncate\b|alter table public\.garmin_(dia|ativ)|drop table public\.garmin_(dia|ativ)/i.test(so));
  assert.match(sql, /^-- 065 · .*APLICADA EM PRODUÇÃO em 23\/11\/2026/);
  assert.match(sql, /grant select, insert, update on public\.garmin_rotas to service_role/, "a rotina (service_role) precisa ler e gravar, como na garmin_ativ");
});
test("função: tipo 'rotas' só acrescenta em garmin_rotas, nunca toca garmin_ativ, treino sem GPS grava pontos vazios, falha isolada por treino", () => {
  const f = idx.slice(idx.indexOf("async function sincRotas"), idx.indexOf("/* ---------- notificações push"));
  assert.match(f, /from\("garmin_rotas"\)\.upsert\(/);
  assert.ok(!/from\("garmin_ativ"\)\.(update|upsert|insert|delete)/.test(f));
  assert.match(f, /simplificarRota\(fit\.rota\)/);
  assert.match(f, /catch \(e\) \{ falhas\.push/);
  assert.match(f, /Math\.min\(Math\.max\(Number\(corpo\.max\) \|\| 4, 1\), 10\)/);
  assert.match(idx, /corpo\.tipo === "rotas"/); assert.match(idx, /passo\("garmin_rotas"/);
});
test("site: mapa geral só do dono, respeita 'esconder o local', usa os filtros da aba, nunca grava e denuncia a função antiga", () => {
  const m = hub.slice(hub.indexOf("function shMapaGeral"), hub.indexOf("/* extras do relógio (Lote 2)"));
  assert.match(m, /if\(!isOwner\(\)\)return null/); assert.match(m, /C\.pr\.esconderLocal/);
  assert.match(m, /saudeRotasLer\(\)/); assert.match(m, /saudeRotasBuscar\(/); assert.match(m, /window\.confirm\(/);
  assert.match(hub, /var mg=shMapaGeral\(fil,C\)/);
  assert.match(sa, /d\.restantes==null\)throw new Error\("a função garmin publicada ainda é a versão antiga/);
  assert.ok(!/\.(insert|upsert|update|delete)\(/.test(sa.slice(sa.indexOf("function saudeRotasLer"), sa.indexOf("function carregarGoogle"))), "o site só lê garmin_rotas; quem grava é a função");
});

test("429 da Garmin: a função para sem erro e avisa (limitado), faz pausa entre downloads e usa blocos de 4; o site espera entre rodadas e para com mensagem amigável", () => {
  const f = idx.slice(idx.indexOf("async function sincRotas"), idx.indexOf("/* ---------- notificações push"));
  assert.match(f, /r\.status === 429\) \{ limitado = true;/); assert.match(f, /setTimeout\(ok, 900\)/); assert.match(f, /mais: restantes > 0 && salvas > 0 && !limitado, limitado/);
  assert.match(idx, /sincRotas\(adm, tok!, uid, \{ max: 4 \}\)/);
  assert.match(sa, /d\.limitado\)\{st\("A Garmin pediu uma pausa/); assert.match(sa, /setTimeout\(ok,2500\)/); assert.match(sa, /\/429\/\.test\(e\.message\)/);
});
