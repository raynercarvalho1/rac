// Lote 5 (23/11/2026): lugares (mercados e passeios no mapa). Regras puras em nucleo.js (prefixo lug*); dados inventados, sem rede e sem coordenadas reais.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8");

const compra = (data, mercado, numero, v) => ({ data, mercado, numero, valor_total: v });
const COMPRAS = [compra("2026-11-01", "Mercado A", "1", 10), compra("2026-11-01", "Mercado A", "1", 5.5), compra("2026-11-08", "Mercado A", "2", 20), compra("2026-11-15", "Mercado A", "3", 30),
  compra("2026-11-04", "Mercado B", "9", 40), compra("2026-11-12", "Mercado B", "10", 60), compra("", "Mercado X", "1", 1), compra("2026-11-02", "", "1", 1), null];
const ativ = (id, d, local) => ({ id, inicio: d + "T08:00:00", tipo: "walking", dados: local ? { local } : {} });
/* casa em (1.000,1.000) aparece em TODO dia; o mercado A em (2.000,2.000) só nos dias de compra; o B em (3.000,3.000) em 1 dia só */
const rota = (a, b) => [a, [a[0] + 0.0001, a[1]], b];
const ATIVS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => ativ(i, "2026-11-" + String(i).padStart(2, "0")))
  .concat([ativ(20, "2026-11-01"), ativ(21, "2026-11-08"), ativ(22, "2026-11-15"), ativ(23, "2026-11-04")]);
const ROTAS = {}; ATIVS.forEach((a) => { ROTAS[a.id] = rota([1.0, 1.0], [1.0002, 1.0002]); });
ROTAS[20] = rota([2.0, 2.0], [1.0, 1.0]); ROTAS[21] = rota([1.0, 1.0], [2.0003, 2.0003]); ROTAS[22] = rota([2.0001, 2.0001], [1.0, 1.0]); ROTAS[23] = rota([3.0, 3.0], [1.0, 1.0]);

test("lugNotas: uma nota por data|mercado|número, soma os itens, ignora linha sem data ou sem mercado", () => {
  const n = N.lugNotas(COMPRAS); assert.equal(n.length, 5);
  assert.deepEqual(n.find((x) => x.d === "2026-11-01"), { d: "2026-11-01", mercado: "Mercado A", v: 15.5 });
  assert.deepEqual(N.lugNotas(null), []);
});
test("lugMercados: compras, total, última, ordem por gasto e o local marcado só quando é válido", () => {
  const m = N.lugMercados(N.lugNotas(COMPRAS), { "Mercado A": { lat: -23.5, lon: -47.4 }, "Mercado B": { lat: 0, lon: 0 } });
  assert.deepEqual(m.map((x) => [x.mercado, x.n, x.total, x.ultima]), [["Mercado A", 3, 65.5, "2026-11-15"], ["Mercado B", 2, 100, "2026-11-12"]].sort((a, b) => b[2] - a[2]));
  assert.deepEqual(m.find((x) => x.mercado === "Mercado A").local, { lat: -23.5, lon: -47.4 }); assert.equal(m.find((x) => x.mercado === "Mercado B").local, null, "0,0 não vale");
});
test("lugSugerir: acha o ponto que se repete nos dias de compra e quase só neles; a casa (todo dia) e o ponto de 1 dia não viram sugestão", () => {
  const notas = N.lugNotas(COMPRAS), pts = N.lugPontosDia(ATIVS, ROTAS), s = N.lugSugerir(notas, pts, {});
  assert.ok(s["Mercado A"], "Mercado A tem sugestão"); assert.ok(Math.abs(s["Mercado A"].lat - 2.0001) < 0.001 && Math.abs(s["Mercado A"].lon - 2.0001) < 0.001);
  assert.equal(s["Mercado A"].dias, 3); assert.equal(s["Mercado A"].de, 3); assert.equal(s["Mercado A"].confianca, "alta");
  assert.ok(!s["Mercado B"], "um dia só não basta (e a casa não conta: aparece em todo dia, lift baixo)");
  assert.ok(!Object.values(s).some((x) => Math.abs(x.lat - 1) < 0.01), "nunca sugere a casa");
  assert.deepEqual(N.lugSugerir(notas, pts, { "Mercado A": { lat: -23.5, lon: -47.4 } })["Mercado A"], undefined, "mercado já marcado não recebe sugestão");
  assert.deepEqual(N.lugSugerir([], [], {}), {}); assert.deepEqual(N.lugSugerir(null, null, null), {});
});
test("lugPasseios: por nome do local, contagem, último e posição da partida do treino mais recente com GPS; sem nome fica fora", () => {
  const A = [ativ(1, "2026-10-01", "Parque"), ativ(2, "2026-10-05", "Parque"), ativ(3, "2026-10-09", "Praça"), ativ(4, "2026-10-10", "")];
  const p = N.lugPasseios(A, { 1: [[5, 5], [5, 6]], 2: [[6, 6], [6, 7]], 3: [] });
  assert.deepEqual(p.map((x) => [x.nome, x.n, x.ultimo, x.lat, x.lon]), [["Parque", 2, "2026-10-05", 6, 6], ["Praça", 1, "2026-10-09", null, null]]);
});
test("lugValida e dados estranhos nunca lançam", () => {
  assert.ok(N.lugValida({ lat: -23.5, lon: -47.4 })); for (const x of [null, {}, { lat: "a", lon: 1 }, { lat: 91, lon: 0 }, { lat: 0, lon: 181 }, { lat: 0, lon: 0 }, { lat: NaN, lon: 1 }]) assert.ok(!N.lugValida(x));
  assert.doesNotThrow(() => { N.lugPontosDia([null, { id: 1 }], { 1: "x" }); N.lugPasseios([null, { dados: null }], null); N.lugMercados(null, null); });
});
test("telas: só do dono, respeita esconder o local, marcação só em PESSOAL (sem tabela nova, sem serviço de endereço), sugestão nunca grava sozinha", () => {
  const hub = ler("js/saude-hub.js"), sa = ler("js/saude.js"), f = hub.slice(hub.indexOf("function shLugares"), hub.indexOf("/* extras do relógio (Lote 2)"));
  assert.match(f, /if\(!isOwner\(\)\)return null/); assert.match(f, /C\.pr\.esconderLocal/); assert.match(f, /pessoalGravar\("saudeLugares"/);
  assert.match(f, /bc\.onclick=function\(\)\{gravar\(m\.mercado,\{lat:s\.lat,lon:s\.lon\}\)\}/, "só o clique em Confirmar grava a sugestão");
  assert.ok(!/fetch\(|nominatim|geocod|googleapis/i.test(f + sa.slice(sa.indexOf("function saudeLugaresLer"), sa.indexOf("function saudeMapaGeral"))), "nenhum serviço externo de endereço");
  assert.ok(!/\.(insert|upsert|update|delete)\(/.test(sa.slice(sa.indexOf("function saudeLugaresLer"), sa.indexOf("function saudeMapaGeral"))), "o site só lê compras e rotas");
  assert.match(hub, /var lu=shLugares\(fil,C\)/);
  const m = fs.readdirSync(new URL("../supabase/", import.meta.url)).filter((x) => /^06[6-9]_/.test(x)); assert.deepEqual(m, [], "nenhuma migration nova neste lote");
});
