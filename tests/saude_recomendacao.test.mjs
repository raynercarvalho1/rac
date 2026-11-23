// Lote 4 (23/11/2026): recomendação do dia (treino forte, leve ou descanso). Regra pura em nucleo.js, sem IA. Dados inventados, hoje = 23/11/2026.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo, HOJE = "2026-11-23", dia = (n) => N.somaDiasISO(HOJE, n);
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8");

/* 70 dias estáveis (VFC 50, FC 52, sono 7,5 h, Body Battery 85); f(i) altera o dia hoje+i */
const bom = (i) => (i === 0 ? { vfc: { noite: 57 }, fcRepouso: 50, bbMax: 95 } : {});   // hoje um pouco melhor que o normal
const dias = (f = bom) => Array.from({ length: 70 }, (_, k) => { const i = k - 69, d = { vfc: { noite: 50 + (i % 3) }, fcRepouso: 52 + (i % 2), sono: { total: 7.5 * 3600, nota: 80 }, bbMax: 85, ...f(i) }; return { data: dia(i), dados: d }; });
const ativ = (i, carga, tipo = "running") => ({ id: 1000 + i, inicio: dia(i) + "T07:00:00", tipo, dados: { carga } });
const MES = Array.from({ length: 12 }, (_, k) => ativ(-4 - k * 2, 100));            // base: 12 treinos de carga 100 nos últimos ~28 dias

test("dia bom, carga normal: treino forte, com a prontidão e o motivo", () => {
  const r = N.sauRecomendacao(dias(), MES, HOJE);
  assert.equal(r.estado, "forte"); assert.equal(r.titulo, "Dia para treino forte"); assert.ok(r.fatores.prontidao >= 70);
  assert.match(r.motivos[0], /^Prontidão \d+/); assert.match(r.limite, /não substitui avaliação médica/); assert.match(r.hipotese, /não é orientação médica/);
});
test("prontidão média: treino leve ou moderado; prontidão baixa: descanso", () => {
  const medio = N.sauRecomendacao(dias((i) => i === 0 ? { vfc: { noite: 44 }, fcRepouso: 54, sono: { total: 6.5 * 3600, nota: 70 }, bbMax: 60 } : {}), MES, HOJE);
  assert.ok(["leve", "descanso"].includes(medio.estado), medio.estado);
  const ruim = N.sauRecomendacao(dias((i) => i === 0 ? { vfc: { noite: 30 }, fcRepouso: 62, sono: { total: 4.5 * 3600, nota: 40 }, bbMax: 30 } : {}), MES, HOJE);
  assert.equal(ruim.estado, "descanso"); assert.equal(ruim.titulo, "Descanso ou recuperação"); assert.ok(ruim.fatores.alertas >= 2);
});
test("só reduz, nunca eleva: carga alta, treino forte ontem, 4 dias seguidos e 2 alertas derrubam 'forte' para 'leve'", () => {
  const forteOntem = [...MES, ativ(-1, 300)];
  const a = N.sauRecomendacao(dias(), forteOntem, HOJE); assert.equal(a.estado, "leve"); assert.ok(a.fatores.forteOntem); assert.match(a.motivos.join(" "), /Treino forte ontem/);
  const pesada = [...MES, ativ(0, 250), ativ(-1, 250), ativ(-2, 250)]; const b = N.sauRecomendacao(dias(), pesada, HOJE); assert.equal(b.estado, "leve"); assert.ok(b.fatores.razaoCarga >= 1.5); assert.match(b.motivos.join(" "), /semana pesada/);
  const seguidos = [...MES, ativ(-1, 50), ativ(-2, 50), ativ(-3, 50), ativ(-4, 50)]; const c = N.sauRecomendacao(dias(), seguidos, HOJE); assert.equal(c.estado, "leve"); assert.equal(c.fatores.diasSeguidos, 4);
  const d = N.sauRecomendacao(dias((i) => i === 0 ? { vfc: { noite: 38 }, fcRepouso: 60, sono: { total: 8 * 3600, nota: 85 }, bbMax: 95 } : {}), MES, HOJE); assert.ok(d.estado !== "forte" || d.fatores.alertas < 2);
  for (const r of [a, b, c]) assert.ok(r.fatores.prontidao >= 70, "a prontidão alta continua alta: só a recomendação desce");
});
test("caminhada não conta como treino na carga, nos dias seguidos nem no 'sem treino'", () => {
  const so = [...MES, ...[-1, -2, -3, -4, -5].map((i) => ativ(i, 400, "walking"))];
  const r = N.sauRecomendacao(dias(), so, HOJE); assert.equal(r.estado, "forte"); assert.equal(r.fatores.diasSeguidos, 0);
  assert.match(N.sauRecomendacao(dias(), MES.slice(2), HOJE).motivos.join(" "), /dias sem treino: bom momento para voltar/);
});
test("sem dados: sem prontidão, ou o último dia do relógio com mais de 1 dia de atraso, não recomenda e diz por quê", () => {
  const a = N.sauRecomendacao([], [], HOJE); assert.equal(a.estado, "sem_dados"); assert.match(a.motivos[0], /Faltam/);
  const velho = dias().filter((d) => d.data <= dia(-3)); const b = N.sauRecomendacao(velho, MES, HOJE); assert.equal(b.estado, "sem_dados"); assert.equal(b.fatores.atraso, 3); assert.match(b.motivos[0], /sincronize o relógio/);
  assert.equal(N.sauRecomendacao(null, null, HOJE).estado, "sem_dados");
});
test("pura: não altera a entrada, é determinística e nunca lança com dados estranhos", () => {
  const d = dias(), a = MES.slice(); const antes = JSON.stringify([d, a]); const r1 = N.sauRecomendacao(d, a, HOJE), r2 = N.sauRecomendacao(d, a, HOJE);
  assert.equal(JSON.stringify([d, a]), antes); assert.deepEqual(r1, r2);
  assert.doesNotThrow(() => N.sauRecomendacao(d, [{ inicio: "lixo", dados: null }, null, { inicio: dia(-1) + "T07:00:00", tipo: "running", dados: { carga: "x" } }], HOJE));
});
test("telas: a Saúde mostra o cartão (com 'ocultar valores' só a decisão) e o Hoje mostra a linha; nenhuma chamada nova ao relógio nem à IA", () => {
  const hub = ler("js/saude-hub.js"), hj = ler("js/hoje.js");
  assert.match(hub, /L\.push\(h\("div",\{class:"rh-largo"\},shRecomendacao\(C\)\)\)/); assert.match(hub, /C\.pr\.ocultar&&r\.estado!=="sem_dados"/);
  assert.match(hj, /NUCLEO\.sauRecomendacao\(sf\.dias,sf\.ativs,hojeISO\(\)\)/);
  const f = hub.slice(hub.indexOf("function shRecomendacao"), hub.indexOf("function shGeral")); assert.ok(!/saudeChamar|racIA|SB\.|invoke/.test(f));
});
