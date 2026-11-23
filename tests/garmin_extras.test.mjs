// Lote 2 (corrigido em 23/11/2026): leitores e coleta dos dados extras do relógio com os endpoints oficiais da Personal API.
// Fixtures fictícias, sem rede e sem credenciais. O formato real das respostas não é descrito pela Garmin no cliente oficial: os leitores aceitam os nomes
// conhecidos e devolvem undefined quando não reconhecem o dado.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const E = await import(new URL("../supabase/functions/garmin/extras.ts", import.meta.url));
const idx = fs.readFileSync(new URL("../supabase/functions/garmin/index.ts", import.meta.url), "utf8");
const D = "2026-03-10", t0 = Date.parse(D + "T00:00:00Z"), BR = -3 * 3600e3;
const bloco = idx.slice(idx.indexOf("type Consulta ="), idx.indexOf("/* Rotas simplificadas (Lote 3"));

test("os cinco endpoints oficiais, com caminho e parâmetros exatos", () => {
  assert.equal(E.CAMINHOS.fc(D), "/wellness-service/wellness/dailyHeartRate?date=2026-03-10");
  assert.equal(E.CAMINHOS.estresse("2026-03-01", D), "/usersummary-service/stats/stress/daily/2026-03-01/2026-03-10");
  assert.equal(E.CAMINHOS.peso("2026-03-01", D), "/weight-service/weight/range/2026-03-01/2026-03-10?includeAll=true");
  assert.equal(E.CAMINHOS.spo2(D), "/wellness-service/wellness/daily/spo2acclimation/2026-03-10");
  assert.equal(E.CAMINHOS.bb("2026-03-01", D), "/wellness-service/wellness/bodyBattery/reports/daily?startDate=2026-03-01&endDate=2026-03-10");
  assert.equal(E.CAMINHOS.vo2("2026-03-01", D), "/metrics-service/metrics/maxmet/daily/2026-03-01/2026-03-10");
  assert.equal(E.JANELA_DIAS, 28);
});

test("por data (fc, spo2) versus por intervalo (estresse, bb, peso): intervalo uma vez por janela, nunca por dia", () => {
  assert.match(bloco, /tenta\("estresse", CAMINHOS\.estresse\(a, b\)\), tenta\("bb", CAMINHOS\.bb\(a, b\)\), tenta\("peso", CAMINHOS\.peso\(a, b\)\)/);
  assert.match(bloco, /tenta\("fc", CAMINHOS\.fc\(l\.data\)\), tenta\("spo2", CAMINHOS\.spo2\(l\.data\)\)/);
  const dentroDoLaco = bloco.slice(bloco.indexOf("for (let i = 0; i < dias.length; i += 7)"));
  assert.ok(!/CAMINHOS\.(estresse|bb|peso)\(/.test(dentroDoLaco), "nenhuma consulta de intervalo dentro do laço por dia");
  assert.match(bloco, /JANELA_DIAS - 1/);
});

test("Training Status e Training Readiness não são chamados nem gravados; ficam como fora da API pessoal", () => {
  assert.ok(!/trainingstatus|trainingreadiness|metrics\/training/i.test(idx + fs.readFileSync(new URL("../supabase/functions/garmin/extras.ts", import.meta.url), "utf8").replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "")));
  assert.deepEqual(E.INDISPONIVEIS, ["treino", "prontidao"]);
  assert.match(bloco, /indisponiveis/);
  assert.ok(!/lerEstadoTreino|lerProntidao|lerRespiracaoDia/.test(idx));
});

test("batimentos: 96 blocos na hora local (relógio em GMT, Brasília UTC-3), repouso/mín/máx, sem inventar", () => {
  const meiaNoiteLocalGmt = t0 - BR;      // 00:00 de Brasília = 03:00 GMT
  const r = { heartRateValues: [[meiaNoiteLocalGmt + 60e3, 60], [meiaNoiteLocalGmt + 600e3, 70], [meiaNoiteLocalGmt + 900e3, 80], [meiaNoiteLocalGmt, null]], restingHeartRate: 50, minHeartRate: 45, maxHeartRate: 150 };
  const f = E.lerFcDia(r, D);
  assert.equal(f.fc.length, 96); assert.equal(f.fc[0], 65); assert.equal(f.fc[1], 80); assert.equal(f.fc[2], null);
  assert.equal(f.fcRepouso, 50); assert.equal(f.fcMin, 45); assert.equal(f.fcMax, 150);
  const comLocal = E.lerFcDia({ startTimestampGMT: t0, startTimestampLocal: t0, heartRateValues: [[t0 + 60e3, 60]] }, D);
  assert.equal(comLocal.fc[0], 60, "com a hora local na resposta, ela manda");
  assert.equal(E.lerFcDia({}, D), undefined); assert.equal(E.lerFcDia({ heartRateValues: [] }, D), undefined);
});

test("estresse por intervalo: agrupado por dia, durações em segundos, dia sem número fora; aceita 'values' ou campos soltos", () => {
  const r = [{ calendarDate: "2026-03-09", values: { overallStressLevel: 31, highStressDuration: 3600, mediumStressDuration: 7200, lowStressDuration: 10800, restStressDuration: 20000 } },
    { calendarDate: "2026-03-10", overallStressLevel: 28 }, { calendarDate: "2026-03-11", values: {} }, { values: { overallStressLevel: 5 } }];
  assert.deepEqual(E.lerEstresseIntervalo(r), { "2026-03-09": { nivel: 31, alto: 3600, medio: 7200, baixo: 10800, descanso: 20000 }, "2026-03-10": { nivel: 28 } });
  assert.deepEqual(E.lerEstresseIntervalo({ data: [{ calendarDate: "2026-03-09", values: { overallStressLevel: 40 } }] }), { "2026-03-09": { nivel: 40 } });
  assert.deepEqual(E.lerEstresseIntervalo(null), {}); assert.deepEqual(E.lerEstresseIntervalo({}), {});
});

test("Body Battery por intervalo: agrupado por dia, curva de 96 blocos, nível do 2º valor (ou do 3º quando o 2º é status), mín e máx", () => {
  const g = t0 - BR - 86400e3;   // 00:00 de Brasília do dia 09 em GMT
  const r = [{ date: "2026-03-09", charged: 60, drained: 55, startTimestampGMT: g, startTimestampLocal: t0 - 86400e3, bodyBatteryValuesArray: [[g + 60e3, 40], [g + 900e3, "MEASURED", 80, 1], [g + 1800e3, 200]] },
    { date: "2026-03-10", bodyBatteryValuesArray: [] }, { bodyBatteryValuesArray: [[t0, 50]] }];
  const o = E.lerBodyBatteryIntervalo(r);
  assert.deepEqual(Object.keys(o), ["2026-03-09"]);
  const d = o["2026-03-09"];
  assert.equal(d.curva.length, 96); assert.equal(d.curva[0], 40); assert.equal(d.curva[1], 80); assert.equal(d.curva[2], null, "nível fora de 0 a 100 não entra");
  assert.equal(d.min, 40); assert.equal(d.max, 80); assert.equal(d.carregou, 60); assert.equal(d.gastou, 55);
  assert.deepEqual(E.lerBodyBatteryIntervalo({}), {});
});

test("SpO2 por data: média, mínimo, último e do sono; sem campo, não inventa", () => {
  assert.deepEqual(E.lerSpo2Dia({ averageSpO2: 95.4, lowestSpO2: 88, latestSpO2: 96, avgSleepSpO2: 94 }), { media: 95.4, min: 88, ultimo: 96, sono: 94 });
  assert.equal(E.lerSpo2Dia({}), undefined); assert.equal(E.lerSpo2Dia(null), undefined);
});

test("peso por intervalo: gramas viram kg, última pesagem do dia, kg já em kg ficam, dia inválido fora", () => {
  const r = { dailyWeightSummaries: [{ summaryDate: "2026-03-10", latestWeight: { weight: 82500, bodyFat: 18.46, muscleMass: 36200, bmi: 25.04 } },
    { summaryDate: "2026-03-09", allWeightMetrics: [{ weight: 83000, timestampGMT: 1 }, { weight: 82800, timestampGMT: 2 }] }, { summaryDate: "ruim", latestWeight: { weight: 1 } }, { summaryDate: "2026-03-08" }] };
  assert.deepEqual(E.lerPeso(r), { "2026-03-10": { kg: 82.5, gordura: 18.5, musculo: 36.2, imc: 25 }, "2026-03-09": { kg: 82.8 } });
  assert.deepEqual(E.lerPeso({ dateWeightList: [{ calendarDate: "2026-03-07", weight: 80.2 }] }), { "2026-03-07": { kg: 80.2 } });
  assert.deepEqual(E.lerPeso({}), {}); assert.deepEqual(E.lerPeso(null), {});
});

test("consulta: HTTP 204 e corpo vazio são 'sem dado'; erro HTTP e rede são erros distintos; cada consulta é isolada", () => {
  assert.match(bloco, /r\.status === 204\) return \{ estado: "sem dado"/);
  assert.match(bloco, /if \(!r\.ok\) return \{ estado: "erro " \+ r\.status/);
  assert.match(bloco, /!t\.trim\(\)\) return \{ estado: "sem dado"/);
  assert.match(bloco, /catch \(_\) \{ return \{ estado: "falha de rede"/);
  assert.match(bloco, /const tenta = async/);          // nunca lança: um endpoint fora do ar não derruba os outros
});

test("sondagem: só endpoints documentados, não grava, devolve estado e estrutura (nunca valores)", () => {
  const s = bloco.slice(bloco.indexOf("if (sondar) {"), bloco.indexOf("const ini = (corpo.desde"));
  assert.ok(!/\.update\(|\.insert\(|\.upsert\(|\.delete\(/.test(s), "a sondagem não grava");
  assert.match(s, /return \{ salvos: 0, mais: false/);
  assert.ok(!/training/i.test(s));
  const f = E.formato({ a: [{ x: 1, y: "segredo" }], b: "valor", c: 7, d: null });
  assert.deepEqual(f, { a: { lista: 1, item: { x: "number", y: "string" } }, b: "string", c: "number", d: "vazio" });
  assert.ok(!JSON.stringify(f).includes("segredo") && !JSON.stringify(f).includes("valor"));
});

test("gravação: só acrescenta em garmin_dia.dados.extras, preserva extras anteriores, não grava resposta vazia, só update de dia existente", () => {
  assert.match(bloco, /extras: \{ \.\.\.\(l\.dados\?\.extras \?\? \{\}\), \.\.\.ex, atualizado: hoje \}/);
  assert.match(bloco, /if \(!Object\.keys\(ex\)\.length\) return;/);
  assert.match(bloco, /const poe = \(k: string, v: unknown\) => \{ if \(v !== undefined\) ex\[k\] = v; \}/);
  const g = bloco.slice(bloco.indexOf("const ini = (corpo.desde"));
  assert.ok(!/\.insert\(|\.upsert\(|\.delete\(/.test(g));
  assert.match(g, /\.update\(\{ dados,/);
  assert.match(idx, /corpo\.tipo === "extras"/);
  assert.match(idx, /sincExtras\(adm, tok!, uid, \{\}, hoje\)/);
});
