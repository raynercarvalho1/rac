// Testes do abastecimento e dos veículos: leitura das fotos (painel e bomba), conferência, duplicidade, edição, consumo de tanque
// cheio a tanque cheio, custo por km, preços e a entrada no Painel. Sem rede, sem banco e sem chamada paga (docs/veiculos.md).
// O registro da NMax de 31/10/2026 é só fixture: não existe no banco de produção.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { ACOES } from "../supabase/functions/rac-ia/acoes.ts";
import { respostaDemo } from "../supabase/functions/rac-ia/demo.ts";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const raiz = new URL("../", import.meta.url);
const FX = JSON.parse(fs.readFileSync(new URL("tests/fixtures/veiculos/nmax-2026-10-31.json", raiz), "utf8"));
const NMAX = FX.registro;
const famJs = fs.readFileSync(new URL("js/familia.js", raiz), "utf8");
const painelJs = fs.readFileSync(new URL("js/painel.js", raiz), "utf8");
const IA = ACOES["abastecimento.interpretar"];

/* um abastecimento no formato do banco */
let seq = 0;
const ab = (quem, data, km, litros, total, tanque, extra = {}) => ({ id: "r" + (++seq), quem, tipo: "abastecimento", data, valor: null,
  dados: { ...(km != null ? { km } : {}), ...(litros != null ? { litros } : {}), ...(total != null ? { custo: total } : {}), ...(tanque ? { tanque } : {}), ...extra } });
const perto = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
/* a mesma conta da tela: lê os campos de um registro como a conferência coleta */
const campos = (r) => { const A = N.abLer(r); return { quem: A.quem, data: A.data, hora: A.hora, km: A.km, litros: A.litros, preco: A.preco, total: A.total, combustivel: A.combustivel, tanque: A.tanque, pagamento: A.pagamento, origem: A.origem }; };

/* ---------- leitura das fotos (a ação da IA) ---------- */
test("foto da bomba: lê combustível, litros, preço e total; sem painel, a km fica vazia", () => {
  const v = IA.validar(FX.leituras.bomba, { veiculo_sugerido: "moto" });
  assert.equal(v.ok, true);
  assert.deepEqual([v.resultado.km, v.resultado.litros, v.resultado.preco_litro, v.resultado.total, v.resultado.combustivel], [null, 4.581, 6.39, 29.27, "gasolina"]);
  assert.deepEqual(v.avisos, [], "4,581 × 6,39 = 29,27: a conta da bomba fecha");
  const r = N.lerAbast(N.iaAbastTexto(v.resultado));
  assert.equal(r.km, null); assert.equal(r.litros, 4.581); assert.equal(r.total, 29.27); assert.equal(r.posto, "Posto dos Tropeiros");
});

test("foto do painel: lê o hodômetro e o veículo; sem bomba, litros e valores ficam vazios", () => {
  const v = IA.validar(FX.leituras.painel, { veiculo_sugerido: "moto", ultima_km: 18172 });
  assert.equal(v.ok, true);
  assert.deepEqual([v.resultado.veiculo, v.resultado.km, v.resultado.litros, v.resultado.total], ["moto", 18181, null, null]);
  const r = N.lerAbast(N.iaAbastTexto(v.resultado));
  assert.equal(r.veiculo, "moto"); assert.equal(r.km, 18181); assert.equal(r.litros, null); assert.equal(r.preco, null);
});

test("fotos ilegíveis: nada é inventado e a leitura é recusada; número que não é número também", () => {
  assert.equal(IA.validar(FX.leituras.ilegivel, {}).ok, false);
  assert.equal(IA.validar({ ...FX.leituras.bomba, litros: "4,58" }, {}).ok, false);
  assert.equal(IA.validar({ ...FX.leituras.painel, km: 18181.5 }, {}).ok, false);
  const r = N.lerAbast("não consegui ler a foto");
  assert.deepEqual([r.km, r.litros, r.preco, r.total], [null, null, null, null]);
});

test("painel com km menor que a última: avisa que pode ser o Trip", () => {
  const v = IA.validar({ ...FX.leituras.painel, km: 1818 }, { ultima_km: 18172 });
  assert.equal(v.ok, true); assert.match(v.avisos.join(" "), /Trip/);
});

test("DEMO nunca chega à conferência (a resposta simulada não vira texto)", () => {
  const demo = { ...respostaDemo("abastecimento.interpretar", { veiculo_sugerido: "moto" }), _demo: true };
  assert.equal(N.iaAbastTexto(demo), "");
  assert.equal(IA.real, true, "o teto do código não mudou");
  assert.match(famJs, /real:function\(r\)\{var t=NUCLEO\.iaAbastTexto\(r\);if\(!t\)return;preencher\(/, "a IA só preenche a conferência");
  const cb = /real:function\(r\)\{[^}]*\}/.exec(famJs)[0];
  assert.ok(!/SB\.|insert|update/.test(cb), "a resposta da IA não grava nada");
});

test("DEMO no abastecimento: só o aviso de que nada foi lido, sem valores simulados; o Salvar depende da conferência completa", () => {
  const appJs = fs.readFileSync(new URL("js/app.js", raiz), "utf8").replace(/\r\n/g, "\n"); /* no Windows o git pode trazer CRLF */
  const b = appJs.slice(appJs.indexOf("function iaBotao("), appJs.indexOf("function briefingBtn("));
  const ramo = /if\(r&&r\.ok&&r\.modo==="DEMO"&&o\.demo\)\{(.*)\}\n/.exec(b);
  assert.ok(ramo, "existe o ramo DEMO com o aviso próprio");
  assert.ok(!/iaPrevia|o\.real/.test(ramo[1]) && /text:o\.demo/.test(ramo[1]) && /return$/.test(ramo[1]), "nesse ramo não há prévia com valores nem caminho para a conferência");
  assert.ok(b.indexOf('modo==="DEMO"&&o.demo') < b.indexOf('if(r&&r.ok&&r.modo==="DEMO"){'), "o aviso vem antes da prévia genérica");
  const f = famJs.slice(famJs.indexOf("function abForm("), famJs.indexOf("/* registro antigo"));
  assert.match(f, /demo:"DEMONSTRAÇÃO: a leitura das fotos com IA ainda não está ligada\. Nada foi lido das fotos e nenhum campo foi preenchido/);
  assert.match(f, /salvar\.disabled=!gravado&&r\.erros\.length>0/, "Salvar desabilitado enquanto houver erro");
  assert.match(f, /var exigir=\["km","litros","preco","total"\]/);
  assert.ok(!/c\.total=Math\.round|c\.preco=Math\.round/.test(f), "a tela não calcula o campo que falta");
  assert.ok(!/gravarKm|soKm/.test(f), "sem atalho que salve só a km por aqui (há o Atualizar km)");
  assert.ok(!/fPainel\.addEventListener|fBomba\.addEventListener|fPainel\.onchange|fBomba\.onchange/.test(f), "escolher foto não mexe nos campos");
});

/* ---------- conferência e correção manual ---------- */
test("o abastecimento da NMax (31/10) passa na conferência sem erro nem aviso", () => {
  const A = N.abLer(NMAX);
  assert.deepEqual([A.km, A.litros, A.preco, A.total, A.tanque, A.combustivel, A.posto, A.pagamento], [18181, 4.581, 6.39, 29.27, "cheio", "gasolina comum", "Posto dos Tropeiros, Sorocaba", "Crédito Mastercard"]);
  const r = N.abConferir(campos(NMAX), { hoje: "2026-11-01", ultimaKm: 18172, exigirTanque: true, exigir: ["km", "litros", "preco", "total"] });
  assert.deepEqual(r, { erros: [], avisos: [] });
});

test("campos ausentes ou ilegíveis: a conferência pede o que falta e não salva", () => {
  const c = { quem: "moto", data: "2026-10-31", km: 18181, litros: null, preco: null, total: null, tanque: null };
  const r = N.abConferir(c, { hoje: "2026-11-01", exigirTanque: true });
  assert.ok(r.erros.some((e) => /litros e o total/.test(e)));
  assert.ok(r.erros.some((e) => /tanque/.test(e)), "tanque cheio ou parcial é obrigatório no lançamento novo");
  assert.ok(N.abConferir({ ...c, quem: "", litros: 4.58, total: 29.27, tanque: "cheio" }, {}).erros.some((e) => /veículo/.test(e)));
  assert.ok(N.abConferir({ ...c, data: "2026-11-05", litros: 4.58, total: 29.27, tanque: "cheio" }, { hoje: "2026-11-01" }).erros.some((e) => /futuro/.test(e)));
  assert.ok(N.abConferir({ ...c, km: 18181.5, litros: 4.58, total: 29.27, tanque: "cheio" }, {}).erros.some((e) => /inteiro/.test(e)));
  assert.ok(N.abConferir({ ...c, litros: 450, total: 29.27, tanque: "cheio" }, {}).erros.some((e) => /litros parecem/.test(e)));
  const semKm = N.abConferir({ ...c, km: null, litros: 4.58, total: 29.27, tanque: "cheio" }, {});
  assert.deepEqual(semKm.erros, []); assert.match(semKm.avisos.join(" "), /não entra no cálculo de consumo/);
});

test("correção manual: a conta errada impede salvar, e o valor corrigido passa", () => {
  const base = { quem: "moto", data: "2026-10-31", km: 18181, litros: 4.58, preco: 6.39, total: 92.7, tanque: "cheio" };
  assert.match(N.abConferir(base, {}).erros.join(" "), /diferente do total/, "divergência relevante impede salvar");
  assert.deepEqual(N.abConferir({ ...base, total: 29.27 }, {}).avisos, []);
  assert.match(N.abConferir({ ...base, total: 29.27, km: 1818 }, { ultimaKm: 18172 }).avisos.join(" "), /Trip/);
  assert.match(N.abConferir({ ...base, total: 29.27, km: 28181 }, { ultimaKm: 18172 }).avisos.join(" "), /5\.000 km/);
});

test("gravação nova: dados com os campos da conferência, origem e custo; nada de atualizadoEm", () => {
  const d = N.abDados(campos(NMAX), null, "2026-11-01T12:00:00Z");
  assert.deepEqual(d, { ...NMAX.dados, itensCusto: [["4,581 l de gasolina comum", 29.27]] });
  assert.equal(d.atualizadoEm, undefined);
  assert.equal(N.abDados({ ...campos(NMAX), origem: "ia" }, null, "x").origem, "ia");
});

test("edição: atualiza atualizadoEm, guarda a versão anterior, preserva o resto e nunca mexe em criado_em", () => {
  const reg = { ...NMAX, dados: { ...NMAX.dados, alertas: ["injeção eletrônica (motor)"], origem: "ia" } };
  const d1 = N.abDados({ ...campos(reg), litros: 4.6, total: 29.39 }, reg, "2026-11-02T10:00:00Z");
  assert.equal(d1.atualizadoEm, "2026-11-02T10:00:00Z");
  assert.deepEqual(d1.alertas, ["injeção eletrônica (motor)"], "o que já estava no registro continua");
  assert.equal(d1.origem, "ia", "a origem do lançamento não muda na edição");
  assert.deepEqual(d1.versoes, [{ em: "2026-11-01T12:00:00Z", data: "2026-10-31", km: 18181, litros: 4.581, precoLitro: 6.39, custo: 29.27, combustivel: "gasolina comum", tanque: "cheio", pagamento: "Crédito Mastercard" }]);
  assert.ok(!("criado_em" in d1));
  const d2 = N.abDados({ ...campos({ ...reg, dados: d1 }), pagamento: null }, { ...reg, dados: d1 }, "2026-11-03T10:00:00Z");
  assert.equal(d2.versoes.length, 2); assert.equal(d2.versoes[1].em, "2026-11-02T10:00:00Z");
  assert.ok(!("pagamento" in d2), "campo apagado na correção sai do registro");
  assert.ok(famJs.includes('SB.from("registros").update(row).eq("id",id)'), "a edição atualiza o mesmo registro (não cria outro)");
});

test("lançamento novo: km, litros, preço e total obrigatórios (vazio, zero ou negativo impedem); nada é calculado no lugar", () => {
  const ex = { hoje: "2026-11-01", exigirTanque: true, exigir: ["km", "litros", "preco", "total"] };
  const ok = { quem: "moto", data: "2026-10-31", km: 18181, litros: 4.581, preco: 6.39, total: 29.27, tanque: "cheio" };
  assert.deepEqual(N.abConferir(ok, ex).erros, []);
  for (const [k, nome] of [["km", "quilometragem"], ["litros", "litros"], ["preco", "preço por litro"], ["total", "total pago"]]) {
    for (const v of [null, 0, -1]) assert.ok(N.abConferir({ ...ok, [k]: v }, ex).erros.some((e) => e.includes(nome)), `${k}=${v} tem que impedir`);
  }
  assert.match(N.abConferir({ ...ok, km: null, litros: null }, ex).erros[0], /a quilometragem do painel e os litros/);
  /* divergência pequena (arredondamento da bomba) passa; relevante impede */
  assert.deepEqual(N.abConferir({ ...ok, total: 29.3 }, ex).erros, []);
  assert.ok(N.abConferir({ ...ok, total: 29.9 }, ex).erros.some((e) => /diferente do total/.test(e)));
  /* os números simulados da DEMO (km 0, litros 1, preço 1, total 1) nunca formam um lançamento válido */
  assert.ok(N.abConferir({ ...ok, km: 0, litros: 1, preco: 1, total: 1 }, ex).erros.some((e) => /quilometragem/.test(e)));
  /* edição de registro antigo: só exige o que ele já tinha */
  assert.deepEqual(N.abConferir({ ...ok, km: null, preco: null, total: 160 , litros: 38 }, { exigir: ["litros", "total"] }).erros, []);
});

/* ---------- duplicidade ---------- */
test("duplicidade: mesmo veículo e data com a mesma km, ou com o mesmo total e litros", () => {
  const l = [NMAX];
  assert.equal(N.abDuplicado(campos(NMAX), l, null).id, NMAX.id);
  assert.ok(N.abDuplicado({ ...campos(NMAX), km: null }, l, null), "sem km, total e litros iguais bastam");
  assert.equal(N.abDuplicado({ ...campos(NMAX), km: 18300, total: 30, litros: 5 }, l, null), null, "outro abastecimento no mesmo dia");
  assert.equal(N.abDuplicado({ ...campos(NMAX), quem: "civic" }, l, null), null, "outro veículo");
  assert.equal(N.abDuplicado({ ...campos(NMAX), data: "2026-11-01" }, l, null), null, "outro dia");
  assert.equal(N.abDuplicado(campos(NMAX), l, NMAX.id), null, "na edição, o próprio registro não conta");
});

test("toque duplo e nova tentativa não gravam duas vezes (id da tela, trava e consulta antes de gravar)", () => {
  const f = famJs.slice(famJs.indexOf("function abForm("), famJs.indexOf("/* registro antigo"));
  const clique = f.slice(f.indexOf("salvar.onclick=function(){"));
  assert.match(clique, /^salvar\.onclick=function\(\)\{\s*if\(salvando\)return;/, "a trava é a primeira coisa do clique");
  assert.ok(clique.indexOf("salvando=true;salvar.disabled=true;") < clique.indexOf("gravarAbast(c)"), "trava antes de qualquer gravação");
  assert.match(f, /id=reg\?reg\.id:abNovoId\(\)/, "um id por tela");
  assert.match(f, /row\.id=id;return inserir\(row\)/, "o insert leva o id da tela");
  assert.match(f, /r\.error\.code==="23505"/, "id repetido = mesma gravação, não outra");
  const g = f.slice(f.indexOf("function gravarAbast("));
  assert.ok(g.indexOf("abDuplicado") < g.indexOf("inserir(row)"), "procura no banco antes de gravar");
  assert.match(f, /navigator\.onLine===false/, "sem internet não tenta gravar");
});

/* ---------- consumo ---------- */
test("primeiro abastecimento completo, sem histórico: só referência, sem consumo", () => {
  const c = N.abConsumo([NMAX]);
  assert.deepEqual([c.trechos.length, c.cheios, c.kml, c.custoKm], [0, 1, null, null]);
});

test("cheio em 18.181 e o próximo cheio em 18.400: 219 km ÷ litros do segundo", () => {
  const c = N.abConsumo([NMAX, ab("moto", "2026-11-06", 18400, 5.1, 32.59, "cheio")]);
  assert.equal(c.validos, 1); assert.equal(c.km, 219); perto(c.kml, 219 / 5.1); perto(c.custoKm, 32.59 / 219);
});

test("parcial no meio: os litros dele entram no trecho até o próximo cheio", () => {
  const c = N.abConsumo([NMAX, ab("moto", "2026-11-03", 18290, 2, 12.78, "parcial"), ab("moto", "2026-11-06", 18400, 3.1, 19.81, "cheio")]);
  assert.equal(c.trechos.length, 1); perto(c.litros, 5.1); perto(c.kml, 219 / 5.1); perto(c.custoKm, (12.78 + 19.81) / 219);
});

test("completos e parciais em sequência: média ponderada ≠ média simples", () => {
  const L = [ab("moto", "2026-09-01", 18000, 4, 25, "cheio"), ab("moto", "2026-09-05", 18100, 2, 12.6, "parcial"), ab("moto", "2026-09-08", 18150, 1.5, 9.45, "parcial"),
    ab("moto", "2026-09-12", 18300, 3, 18.9, "cheio"), ab("moto", "2026-09-20", 18420, 2.5, 15.75, "parcial"), ab("moto", "2026-09-25", 18600, 5, 32, "cheio")];
  const c = N.abConsumo(L);
  assert.equal(c.validos, 2);
  perto(c.trechos[0].litros, 6.5); perto(c.trechos[0].kml, 300 / 6.5); perto(c.trechos[1].litros, 7.5); perto(c.trechos[1].kml, 40);
  perto(c.kml, 600 / 14, 1e-9); perto(c.kmlSimples, (300 / 6.5 + 40) / 2, 1e-9);
  perto(c.custoKm, (40.95 + 47.75) / 600, 1e-9);
  /* a ordem de entrada não importa */
  perto(N.abConsumo(L.slice().reverse()).kml, 600 / 14, 1e-9);
});

test("parcial antes do primeiro cheio e depois do último não geram média", () => {
  const c = N.abConsumo([ab("moto", "2026-10-01", 17900, 2, 12, "parcial"), NMAX, ab("moto", "2026-11-02", 18250, 2, 12.78, "parcial")]);
  assert.deepEqual([c.trechos.length, c.kml], [0, null]);
});

test("trecho com dado incompleto, incoerente ou km inválida é descartado (com o motivo), nunca estimado", () => {
  const caso = (meio, fim) => N.abConsumo([NMAX, ...meio, fim || ab("moto", "2026-11-06", 18400, 3.1, 19.81, "cheio")]).trechos[0];
  assert.match(caso([ab("moto", "2026-11-03", 18290, null, 12.78, "parcial")]).motivo, /litros/);
  assert.match(caso([ab("moto", "2026-11-03", 18290, 2, 12.78, null)]).motivo, /sem a marcação de tanque/, "registro antigo não informado no meio");
  assert.match(caso([ab("moto", "2026-11-03", 18100, 2, 12.78, "parcial")]).motivo, /fora de ordem/);
  assert.match(caso([], ab("moto", "2026-11-06", 18100, 3.1, 19.81, "cheio")).motivo, /não aumentou/);
  assert.match(caso([], ab("moto", "2026-11-06", null, 3.1, 19.81, "cheio")).motivo, /quilometragem/);
  assert.match(caso([], ab("moto", "2026-11-06", 28400, 3.1, 19.81, "cheio")).motivo, /impossível/, "10.219 km com 3,1 l");
  for (const t of [caso([ab("moto", "2026-11-03", 18290, null, 12.78, "parcial")]), caso([], ab("moto", "2026-11-06", 28400, 3.1, 19.81, "cheio"))]) {
    assert.equal(t.ok, false); assert.equal(t.kml, null);
  }
  const c = N.abConsumo([NMAX, ab("moto", "2026-11-03", 18290, null, 12.78, "parcial"), ab("moto", "2026-11-06", 18400, 3.1, 19.81, "cheio")]);
  assert.deepEqual([c.validos, c.descartados, c.kml], [0, 1, null]);
});

test("registros antigos sem tanque: ficam fora do consumo até a pessoa marcar, um por um", () => {
  const L = [ab("civic", "2026-08-01", 103000, 40, 240), ab("civic", "2026-08-20", 103500, 38, 228)];
  assert.deepEqual([N.abConsumo(L).cheios, N.abConsumo(L).kml], [0, null]);
  assert.equal(N.abLer(L[0]).tanque, null, "não informado");
  /* marcar exige escolha e confirmação na tela, e grava só aquele registro */
  const m = famJs.slice(famJs.indexOf("function abMarcarTanque("), famJs.indexOf("/* histórico do veículo"));
  assert.ok(m.indexOf("function passo1(") < m.indexOf("function passo2(") && m.indexOf("passo2(o[0])") > 0 && m.indexOf("Confirmar") > m.indexOf("function passo2("), "duas etapas: escolher e confirmar");
  assert.equal((m.match(/SB\.from\("registros"\)\.update/g) || []).length, 1); assert.match(m, /\.eq\("id",r\.id\)/);
  assert.ok(m.indexOf("SB.from") > m.indexOf("ok.onclick"), "só grava no Confirmar");
});

test("veículos separados: moto e carro intercalados não se misturam", () => {
  const L = [ab("moto", "2026-09-01", 18000, 4, 25, "cheio"), ab("civic", "2026-09-02", 103000, 40, 240, "cheio"), ab("moto", "2026-09-10", 18200, 5, 31, "cheio"), ab("civic", "2026-09-20", 103420, 35, 210, "cheio")];
  const c = N.abConsumo(L);
  assert.equal(c.validos, 2);
  perto(c.trechos.find((t) => t.ate.quem === "moto").kml, 40); perto(c.trechos.find((t) => t.ate.quem === "civic").kml, 12);
});

test("consumo por período: só trechos inteiros dentro do período", () => {
  const L = [ab("moto", "2026-08-25", 17800, 4, 25, "cheio"), ab("moto", "2026-09-05", 18000, 5, 31, "cheio"), ab("moto", "2026-09-20", 18200, 5, 31, "cheio")];
  assert.equal(N.abConsumo(L, "2026-09-01", "2026-09-30").validos, 1);
  assert.equal(N.abConsumo(L).validos, 2);
});

test("custo por km: trecho sem o total de algum abastecimento fica fora do custo, mas entra no consumo", () => {
  const c = N.abConsumo([NMAX, ab("moto", "2026-11-06", 18400, 5.1, null, "cheio"), ab("moto", "2026-11-12", 18600, 4.5, 28.76, "cheio")]);
  assert.equal(c.validos, 2); perto(c.kml, 419 / 9.6);
  perto(c.custoKm, 28.76 / 200); assert.deepEqual(c.custoKmBase, { km: 200, custo: 28.76, trechos: 1 });
});

/* ---------- preços e meses ---------- */
test("preço médio ponderado (total ÷ litros) é diferente da média simples dos preços", () => {
  const L = [ab("moto", "2026-09-01", null, 10, 60, "parcial", { precoLitro: 6 }), ab("moto", "2026-09-10", null, 2, 14, "parcial", { precoLitro: 7 })];
  const p = N.abPrecos(L);
  perto(p.ponderado, 74 / 12); perto(p.simples, 6.5); assert.deepEqual([p.n, p.litros, p.total], [2, 12, 74]);
  assert.deepEqual(N.abPrecos([]), { ponderado: null, simples: null, n: 0, litros: 0, total: 0 });
});

test("por mês: gasto, litros e preço ponderado; mês sem abastecimento fica zerado (sem preço)", () => {
  const o = N.abPorMes([NMAX, ab("moto", "2026-10-10", 18050, 3, 19.5, "parcial"), ab("civic", "2026-09-15", 103000, 40, 240, "cheio")], ["2026-09", "2026-10", "2026-11"]);
  assert.deepEqual(o["2026-09"], { gasto: 240, litros: 40, n: 1, preco: 6 });
  assert.equal(o["2026-10"].gasto, 48.77); perto(o["2026-10"].preco, 48.77 / 7.581);
  assert.deepEqual(o["2026-11"], { gasto: 0, litros: 0, n: 0, preco: null });
});

/* ---------- Painel ---------- */
test("Painel: cada abastecimento conta uma vez nos gastos e combustível fica separado de manutenção", () => {
  const regs = [NMAX, { id: "m1", quem: "moto", tipo: "oleo", data: "2026-10-20", dados: { custo: 80 } }, { id: "c1", quem: "civic", tipo: "seguro", data: "2026-10-05", dados: { custo: 900 } },
    { id: "x", quem: "moto", tipo: "abastecimento", data: "2026-10-30", dados: { custo: 30, compra: { id: "nota-1" } } }];
  const g = N.pnDespesas([], regs, [], (q) => (q === "moto" || q === "civic" ? "Veículos" : q));
  assert.equal(g.length, 3, "o que veio de uma compra do Mercado não conta de novo");
  assert.equal(g.filter((x) => x.cat === "abastecimento").reduce((s, x) => s + x.v, 0), 29.27);
  assert.deepEqual(["abastecimento", "oleo", "revisao", "pneu", "seguro", "documento", "outro"].map(N.pnVeicCat), ["Combustível", "Manutenção", "Manutenção", "Manutenção", "Seguro", "Impostos e licenciamento", "Outros"]);
  assert.match(painelJs, /x\.f==="Veículos"\?NUCLEO\.pnVeicCat\(x\.cat\)/, "as categorias do Painel separam combustível e manutenção");
  const r = N.abResumo(regs.slice(0, 1), "2026-10-01", "2026-10-31");
  assert.deepEqual([r.n, r.gasto, r.litros], [1, 29.27, 4.581]);
});

test("Painel: quadros de combustível, consumo e despesas dos veículos, com fonte e período", () => {
  const f = painelJs.slice(painelJs.indexOf("function pnVeiculos("), painelJs.indexOf("function fmtKm0("));
  for (const t of ['panel("Combustível"', 'panel("Consumo e custo por km"', 'panel("Despesas dos veículos"']) assert.ok(f.includes(t), "falta " + t);
  assert.equal((f.match(/pnFonte\(/g) || []).length, 3, "todo quadro diz a fonte e o período");
  assert.match(f, /abConsumo\(ab\.filter\(function\(r\)\{return r\.quem===q\}\),D\.ini,hoje\)/, "consumo por veículo e no período");
});
