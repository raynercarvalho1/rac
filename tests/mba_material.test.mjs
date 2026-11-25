// MBA: lembrete do material da aula (sai cerca de 3 dias antes), disciplinas sempre visíveis, concluída automática e cadastro de avaliação.
process.env.TZ = "America/Sao_Paulo";
import { test } from "node:test";
import assert from "node:assert/strict";
import { N, ler } from "./_fontes_ambiente.mjs";

const mba = { aulas: [
  { id: 1, t: "Business Intelligence e Data Visualization III", data: "2026-11-24", hora: "19:00" },
  { id: 2, t: "Social Network Analysis I", data: "2026-12-01", hora: "19:00" },
  { id: 3, t: "Palestra: O fim do líder super-herói", data: "2026-12-09", hora: "18:00" },
  { id: 4, t: "Social Network Analysis II", data: "2026-12-08", hora: "19:00" },
] };

test("mbaMaterialPendente: só aulas dos próximos 3 dias (ou de hoje), sem palestra e sem as já conferidas", () => {
  assert.deepEqual(N.mbaMaterialPendente(mba, {}, {}, "2026-11-27").map(a => a.id), [], "4 dias antes: ainda não");
  assert.deepEqual(N.mbaMaterialPendente(mba, {}, {}, "2026-11-28").map(a => a.id), [2], "3 dias antes: lembra");
  assert.deepEqual(N.mbaMaterialPendente(mba, {}, {}, "2026-12-01").map(a => a.id), [2], "no dia da aula ainda lembra");
  assert.deepEqual(N.mbaMaterialPendente(mba, {}, {}, "2026-12-02").map(a => a.id), [], "aula que já passou não lembra");
  assert.deepEqual(N.mbaMaterialPendente(mba, {}, { "mat:2": "2026-11-29" }, "2026-11-30").map(a => a.id), [], "conferido some");
  assert.deepEqual(N.mbaMaterialPendente(mba, {}, {}, "2026-12-06").map(a => a.id), [4], "a palestra (09/12) nunca entra");
  assert.deepEqual(N.mbaMaterialPendente(null, null, null, "2026-11-28"), [], "sem dados, lista vazia");
});

test("js/mba.js: lembrete no Hoje e na página, todas as disciplinas, concluída automática, cadastro e importação por id", () => {
  const s = ler("js/mba.js");
  assert.match(s, /NUCLEO\.mbaMaterialPendente\(/);
  assert.match(s, /function mbaPainelMaterial\(\)/);
  assert.match(s, /\[mbaPainelMaterial\(\),mbaPainelAulas\(\)/);
  assert.match(s, /function mbaStatusDe\(d,f\)/);
  assert.match(s, /var discs=mbaDiscs\(\)\.filter\(function\(d\)\{return d\.nome\}\)/, "disciplina sem roteiro também aparece");
  assert.match(s, /\+ Nova avaliação ou atividade/);
  assert.match(s, /m\.avaliacoes=Object\.keys\(av\)/, "avaliações juntam por id na importação");
  assert.match(s, /m\.aulas=Object\.keys\(au\)/, "aulas juntam por id na importação");
});
