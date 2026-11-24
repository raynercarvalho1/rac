// Score do sono (23/11/2026): nota de 0 a 100 do relógio na Saúde (Visão geral e aba Sono), com médias, melhor/pior e escores por fase (extras.sono). Dados inventados.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo, HOJE = "2026-11-23", dia = (n) => N.somaDiasISO(HOJE, n);
const E = await import(new URL("../supabase/functions/garmin/extras.ts", import.meta.url));
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8");
const dias = (f = () => ({})) => Array.from({ length: 40 }, (_, k) => { const i = k - 39; return { data: dia(i), dados: { sono: { total: 7 * 3600, nota: 70 + (((i % 5) + 5) % 5) * 2, qualidade: "FAIR" }, ...f(i) } }; });

test("sauScoreSono: última nota com o rótulo da Garmin, médias de 7 e 30, melhor e pior das 14 noites; sem nota devolve null", () => {
  const S = N.sauScoreSono(dias(), HOJE);
  assert.equal(S.hoje, true); assert.equal(S.data, HOJE); assert.equal(S.nota, 70 + (0 % 5) * 2); assert.equal(S.rotulo, "Regular");
  assert.equal(S.n7, 7); assert.equal(S.n30, 30); assert.ok(S.media7 >= 70 && S.media7 <= 78 && S.media30 >= 70 && S.media30 <= 78);
  assert.ok(S.melhor.v >= S.pior.v && S.melhor.v === 78 && S.pior.v === 70);
  assert.equal(N.sauScoreSono([], HOJE), null); assert.equal(N.sauScoreSono(dias(() => ({ sono: { total: 3600 } })), HOJE), null, "sem nota não inventa");
  assert.equal(N.sauScoreSono(null, HOJE), null);
});
test("rótulo: o da Garmin em português; sem ele, a faixa do score (90 excelente, 80 bom, 60 regular, abaixo ruim)", () => {
  assert.equal(N.sauRotuloQual("EXCELLENT"), "Excelente"); assert.equal(N.sauRotuloQual("POOR"), "Ruim"); assert.equal(N.sauRotuloQual("XYZ"), null);
  assert.deepEqual([95, 85, 65, 40, null].map(N.sauFaixaScore), ["Excelente", "Bom", "Regular", "Ruim", null]);
  assert.equal(N.sauScoreSono(dias((i) => (i === 0 ? { sono: { total: 3600, nota: 91 } } : {})), HOJE).rotulo, "Excelente");
});
test("escores por fase vêm de extras.sono quando já buscados; sem eles a lista fica vazia", () => {
  const com = N.sauScoreSono(dias((i) => (i === 0 ? { extras: { sono: { escores: { profundo: "GOOD", rem: "POOR", duracao: "EXCELLENT" }, pct: { rem: 18 } } } } : {})), HOJE);
  assert.deepEqual(com.escores.map((e) => [e.nome, e.rotulo]), [["Duração", "Excelente"], ["Sono profundo", "Bom"], ["REM", "Ruim"]]); assert.deepEqual(com.pct, { rem: 18 });
  assert.deepEqual(N.sauScoreSono(dias(), HOJE).escores, []);
});
test("lerSonoIntervalo: formato real da Garmin (sleepScores com qualifierKey e value por fase), por dia; dia sem escores fica de fora", () => {
  const r = [{ calendarDate: "2026-11-22", sleepScores: { totalDuration: { qualifierKey: "GOOD", optimalStart: 1, optimalEnd: 2 }, stress: { qualifierKey: "FAIR" }, awakeCount: { qualifierKey: "EXCELLENT" }, overall: { value: 82, qualifierKey: "GOOD" },
    remPercentage: { value: 21.4, qualifierKey: "GOOD" }, restlessness: { qualifierKey: "FAIR" }, lightPercentage: { value: 55, qualifierKey: "OPTIMAL" }, deepPercentage: { value: 17.6, qualifierKey: "POOR" } } },
    { calendarDate: "2026-11-21", sleepScores: {} }, { calendarDate: "2026-11-20" }, { calendarDate: "ruim", sleepScores: { overall: { value: 1, qualifierKey: "GOOD" } } }];
  assert.deepEqual(E.lerSonoIntervalo(r), { "2026-11-22": { escores: { duracao: "GOOD", estresse: "FAIR", despertares: "EXCELLENT", rem: "GOOD", agitacao: "FAIR", leve: "OPTIMAL", profundo: "POOR" }, pct: { rem: 21, leve: 55, profundo: 18 } } });
  assert.deepEqual(E.lerSonoIntervalo(null), {}); assert.deepEqual(E.lerSonoIntervalo([{ calendarDate: "2026-11-22", sleepScores: { totalDuration: { qualifierKey: "<script>" } } }]), {}, "chave fora do padrão não passa");
  assert.equal(E.CAMINHOS.sono("2026-11-01", "2026-11-28"), "/sleep-service/sleep/dailySleepSummariesByDate?startDate=2026-11-01&endDate=2026-11-28");
});
test("função e telas: o sono entra no mesmo laço de intervalo (uma consulta por janela), só acrescenta em extras, e o score aparece na Visão geral e na aba Sono", () => {
  const idx = ler("supabase/functions/garmin/index.ts"), hub = ler("js/saude-hub.js");
  assert.match(idx, /tenta\("sono", CAMINHOS\.sono\(a, b\)\)/); assert.match(idx, /poe\("sono", sonoDet\[l\.data\]\)/);
  assert.match(hub, /shKpiItem\("Score do sono","nota"/); assert.match(hub, /L\.push\(h\("div",\{class:"rh-largo"\},shScoreSono\(C\)\)\)/); assert.match(hub, /shCardSerie\("Score do sono: tendência"/);
  const f = hub.slice(hub.indexOf("function shScoreSono"), hub.indexOf("function shSono(C)")); assert.match(f, /C\.pr\.ocultar/); assert.ok(!/racIA|fetch\(|saudeChamar/.test(f), "só lê; sem IA nem chamada");
});
