// Lote 2 (23/11/2026): leitores dos dados extras do relógio (curvas, estado de treino, prontidão, peso). Dados inventados; nenhuma chamada à Garmin.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const E = await import(new URL("../supabase/functions/garmin/extras.ts", import.meta.url));
const idx = fs.readFileSync(new URL("../supabase/functions/garmin/index.ts", import.meta.url), "utf8");
const D = "2026-03-10", t0 = Date.parse(D + "T00:00:00Z");

test("curvas do dia: 96 blocos de 15 min com a média; bloco sem leitura é null; valor inválido fica fora", () => {
  const fc = E.bloquear([[t0 + 60e3, 60], [t0 + 600e3, 70], [t0 + 15 * 60e3, 80], [t0 + 30 * 60e3, -1], ["x", 1]], D, (v) => v > 0);
  assert.equal(fc.length, 96); assert.equal(fc[0], 65); assert.equal(fc[1], 80); assert.equal(fc[2], null);
  assert.equal(E.bloquear([], D), undefined); assert.equal(E.bloquear("x", D), undefined);
  assert.equal(E.bloquear([[t0 + 24 * 3600e3, 50]], D), undefined, "fora do dia não entra");
});
test("estresse e Body Battery: estresse negativo (sem medida) fica fora; Body Battery vem do nível (3º valor)", () => {
  const r = E.lerEstresseDia({ stressValuesArray: [[t0, 30], [t0 + 900e3, -1]], bodyBatteryValuesArray: [[t0, "MEASURED", 80, 1]] }, D);
  assert.equal(r.estresse[0], 30); assert.equal(r.estresse[1], null); assert.equal(r.bb[0], 80);
  assert.equal(E.lerEstresseDia({}, D), undefined);
});
test("batimentos do dia trazem o repouso; sem lista, não inventa", () => {
  assert.equal(E.lerFcDia({ heartRateValues: [[t0, 55]], restingHeartRate: 50 }, D).fcRepouso, 50);
  assert.equal(E.lerFcDia({}, D), undefined);
});
test("estado de treino, prontidão e recuperação: só o que a Garmin mandou", () => {
  const e = E.lerEstadoTreino({ mostRecentTrainingStatus: { latestTrainingStatusData: { 1: { trainingStatusFeedbackPhrase: "PRODUCTIVE_1", acuteTrainingLoadDTO: { dailyTrainingLoadAcute: 410.4, dailyTrainingLoadChronic: 380, acwrPercent: 62, acwrStatus: "OPTIMAL" } } } }, mostRecentVO2Max: { generic: { vo2MaxPreciseValue: 47.34 } } });
  assert.deepEqual(e, { status: "PRODUCTIVE_1", cargaAguda: 410, cargaCronica: 380, razao: 62, razaoStatus: "OPTIMAL", vo2max: 47.3 });
  assert.equal(E.lerEstadoTreino({}), undefined);
  assert.deepEqual(E.lerProntidao([{ score: 72, level: "HIGH", recoveryTime: 600 }]), { pontos: 72, nivel: "HIGH", recuperacaoMin: 600 });
  assert.equal(E.lerProntidao([]), undefined);
});
test("peso: gramas viram kg, vale por dia, composição só quando existe", () => {
  const p = E.lerPeso({ dateWeightList: [{ calendarDate: "2026-03-10", weight: 82500, bodyFat: 18.46, muscleMass: 36200 }, { calendarDate: "ruim", weight: 1 }, { calendarDate: "2026-03-11" }] });
  assert.deepEqual(p, { "2026-03-10": { kg: 82.5, gordura: 18.5, musculo: 36.2 } });
  assert.deepEqual(E.lerPeso({}), {}); assert.deepEqual(E.lerPeso(null), {});
});
test("a função só acrescenta chaves (extras), nunca apaga, e a sondagem não grava; rotina faz poucos dias por vez", () => {
  const f = idx.slice(idx.indexOf("async function sincExtras"), idx.indexOf("/* ---------- notificações push"));
  assert.match(f, /dados = \{ \.\.\.l\.dados, extras: \{ \.\.\.\(l\.dados\?\.extras \?\? \{\}\), \.\.\.ex/);
  assert.match(f, /if \(!sondar && Object\.keys\(ex\)\.length\)/);
  assert.ok(!/\.delete\(|\.insert\(|\.upsert\(/.test(f), "só update de linhas existentes");
  assert.match(idx, /sincExtras\(adm, tok!, uid, \{ max: 3 \}, hoje\)/);
  assert.match(idx, /corpo\.tipo === "extras"/);
});
test("formato(): só nomes de chaves e tamanhos, nenhum valor", () => {
  assert.deepEqual(E.formato({ a: [1, 2], b: "segredo" }), { a: { lista: 2, item: "number" }, b: "string" });
});
