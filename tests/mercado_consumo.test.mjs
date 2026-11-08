// Lote Mercado: consumo por categoria, produtos e histórico de preços (nucleo.js mkc* e a tela "Consumo"). Só dados de teste: sem banco e sem IA.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

/* DOM mínimo para desenhar a tela sem navegador */
class El {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.style = {}; this.value = ""; this.className = ""; this.cl = new Set(); this.classList = { add: (c) => this.cl.add(c), remove: (c) => this.cl.delete(c) }; this.ev = {}; }
  appendChild(c) { this.children.push(c); return c; }
  setAttribute(k, v) { this.attrs[k] = v; }
  set textContent(v) { this.children = [{ text: String(v) }]; }
  get textContent() { return texto(this); }
  set innerHTML(v) { this.children = []; }
  addEventListener(n, f) { this.ev[n] = f; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; }
}
const texto = (e) => (e.text != null ? e.text : (e.children || []).map(texto).join(" "));
const achar = (e, f, out = []) => { if (e.tag && f(e)) out.push(e); (e.children || []).forEach((c) => achar(c, f, out)); return out; };
globalThis.document = { createElement: (t) => new El(t), createElementNS: (n, t) => new El(t), createTextNode: (t) => ({ text: t }), querySelector: () => null, getElementById: () => null };
globalThis.window = globalThis.window || {};
globalThis.window.scrollTo = () => {}; globalThis.window.racDica = { ligar: (el, f) => { el.dica = f; return el; } };
createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo || globalThis.window.RACnucleo; globalThis.window.RACnucleo = N;
createRequire(import.meta.url)("../mercado.js");
const T = globalThis.window.RACmercado._teste;
const ler = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");

let seq = 0;
const R = (data, mercado, produto, categoria, un, q, vu, vt, nota) => ({ id: "i" + (++seq), data, mk: data.slice(0, 7), mercado, produto, categoria, unidade: un, quantidade: q, valor_unitario: vu, valor_total: vt != null ? vt : Math.round(q * vu * 100) / 100, desconto: 0, nota: nota || data + "|" + mercado });
const ROWS = [
  R("2026-09-05", "Confiança (Sorocaba)", "Pão Francês", "Padaria", "kg", 0.5, 15, 7.5),
  R("2026-10-05", "Reinaldo (Sorocaba)", "Pão Francês", "Padaria", "kg", 0.4, 18, 7.2),
  R("2026-11-02", "Confiança (Sorocaba)", "Pão Francês", "Padaria", "kg", 0.6, 16, 9.6),
  R("2026-10-05", "Reinaldo (Sorocaba)", "Pão de Forma", "Padaria", "un", 1, 8, 8),
  R("2026-11-02", "Confiança (Sorocaba)", "Pão de Forma", "Padaria", "un", 2, 7, 14),
  R("2026-11-02", "Confiança (Sorocaba)", "Arroz 5kg", "Mercearia", "un", 1, 30, 30),
  R("2026-10-05", "Reinaldo (Sorocaba)", "Detergente", "Limpeza/Descartáveis", "un", 2, 3, 6),
  R("2026-10-05", "Reinaldo (Sorocaba)", "Queijo Minas", "Açougue/Frios", "kg", 0.3, 40, 12),
  R("2026-11-02", "Confiança (Sorocaba)", "Queijo Minas", "Açougue/Frios", "un", 1, 9, 9)
];
const soma = (l) => Math.round(l.reduce((s, x) => s + x.valor_total, 0) * 100) / 100;

test("período: tudo, últimos N meses (inclusive na virada do ano) e mês específico", () => {
  assert.deepEqual(N.mkcPeriodo("tudo", "2026-11-08"), { de: "", ate: "" });
  assert.deepEqual(N.mkcPeriodo("3m", "2026-11-08"), { de: "2026-09-01", ate: "" });
  assert.deepEqual(N.mkcPeriodo("3m", "2026-02-10"), { de: "2025-12-01", ate: "" });
  assert.deepEqual(N.mkcPeriodo("2026-02", ""), { de: "2026-02-01", ate: "2026-02-28" });
  assert.deepEqual(N.mkcPeriodo("2024-02", ""), { de: "2024-02-01", ate: "2024-02-29" });
});

test("filtros funcionam juntos e o total bate com a soma das linhas filtradas", () => {
  const f = { de: "2026-10-01", ate: "2026-10-31", categoria: "Padaria", mercado: "Reinaldo (Sorocaba)", produto: "pao" };
  const l = N.mkcFiltrar(ROWS, f);
  assert.deepEqual(l.map((x) => x.produto).sort(), ["Pão Francês", "Pão de Forma"]);
  assert.equal(soma(l), 15.2);
  assert.equal(N.mkcFiltrar(ROWS, { ...f, mercado: "Confiança (Sorocaba)" }).length, 0, "Reinaldo em outubro e Confiança juntos não têm compra");
  assert.equal(N.mkcFiltrar(ROWS, { categoria: "Limpeza" }).length, 1, "a categoria antiga já casa com a unificada");
  assert.equal(N.mkcFiltrar(ROWS, f, { categoria: 1, produto: 1 }).length, N.mkcFiltrar(ROWS, { de: f.de, ate: f.ate, mercado: f.mercado }).length);
});

test("totais por categoria: total, participação, produtos diferentes, itens e compras", () => {
  const c = N.mkcCategorias(ROWS);
  assert.equal(c.total, soma(ROWS));
  assert.equal(Math.round(c.linhas.reduce((s, x) => s + x.pct, 0) * 1e6) / 1e6, 1, "as participações somam 100%");
  assert.equal(Math.round(c.linhas.reduce((s, x) => s + x.total, 0) * 100) / 100, c.total);
  const pad = c.linhas.find((x) => x.categoria === "Padaria");
  assert.equal(pad.total, 46.3); assert.equal(pad.produtos, 2); assert.equal(pad.itens, 5); assert.equal(pad.compras, 3);
  assert.deepEqual(pad.qtd, { kg: 1.5, un: 3 }, "quantidade por unidade, nunca somando kg com un");
  assert.equal(c.linhas[0].categoria, "Padaria", "ordenado por maior gasto");
  assert.ok(c.linhas.some((x) => x.categoria === "Limpeza") && !c.linhas.some((x) => /descart/i.test(x.categoria)), "Limpeza unificada");
});

test("categoria sem compras: tudo zerado, sem NaN", () => {
  const l = N.mkcFiltrar(ROWS, { categoria: "Peixaria" });
  assert.equal(l.length, 0);
  const r = N.mkcResumo(l, N.mkcFiltrar(ROWS, {}));
  assert.deepEqual([r.total, r.pct, r.produtos, r.itens, r.compras], [0, 0, 0, 0, 0]);
  assert.deepEqual(N.mkcResumo([], []), { total: 0, base: 0, pct: 0, produtos: 0, itens: 0, compras: 0 });
  assert.equal(N.mkcCategorias([]).linhas.length, 0); assert.deepEqual(N.mkcProdutos([]), []); assert.equal(N.mkcProduto([]), null); assert.deepEqual(N.mkcPorMes([]), []);
});

test("produtos da categoria: gasto, ordenação por gasto, nome e frequência, e intervalo entre compras", () => {
  const p = N.mkcProdutos(N.mkcFiltrar(ROWS, { categoria: "Padaria" }));
  assert.deepEqual(p.map((x) => [x.nome, x.total]), [["Pão de Forma", 22], ["Pão Francês", 24.3]].sort((a, b) => b[1] - a[1]));
  assert.deepEqual(N.mkcProdutos(N.mkcFiltrar(ROWS, { categoria: "Padaria" }), "nome").map((x) => x.nome), ["Pão de Forma", "Pão Francês"]);
  const fr = N.mkcProdutos(N.mkcFiltrar(ROWS, { categoria: "Padaria" }), "frequencia")[0];
  assert.equal(fr.nome, "Pão Francês"); assert.equal(fr.compras, 3);
  assert.equal(fr.freqDias, Math.round(58 / 2), "5/9 a 2/11 = 58 dias em 2 intervalos");
  assert.equal(N.mkcProdutos(N.mkcFiltrar(ROWS, { categoria: "Mercearia" }))[0].freqDias, null, "uma compra só: sem frequência");
});

test("histórico de preços: último, anterior, variação, menor, maior e média ponderada (metodologia definida)", () => {
  const d = N.mkcProduto(ROWS.filter((x) => x.produto === "Pão Francês"));
  assert.equal(d.unidades.length, 1); const u = d.unidades[0];
  assert.equal(u.unidade, "kg"); assert.equal(u.compras, 3); assert.equal(u.qtd, 1.5); assert.equal(u.total, 24.3);
  assert.deepEqual([u.ultimo.preco, u.ultimo.data], [16, "2026-11-02"]); assert.equal(u.anterior.preco, 18);
  assert.equal(Math.round(u.variacaoUltimo * 10000) / 10000, -0.1111);
  assert.deepEqual([u.menor.preco, u.menor.mercado], [15, "Confiança (Sorocaba)"]); assert.equal(u.maior.preco, 18);
  assert.equal(u.precoMedio, 16.2, "Σ(preço × qtd) ÷ Σ qtd = 24,30 ÷ 1,5");
  assert.deepEqual(u.serie.map((x) => x.data), ["2026-09-05", "2026-10-05", "2026-11-02"], "série em ordem de data, só com compras reais");
  assert.equal(u.historico.length, 3);
});

test("comparação entre estabelecimentos: último, menor e médio por mercado, do mais barato ao mais caro", () => {
  const u = N.mkcProduto(ROWS.filter((x) => x.produto === "Pão Francês")).unidades[0];
  assert.deepEqual(u.mercados.map((m) => [m.mercado, m.compras, m.ultimo]), [["Confiança (Sorocaba)", 2, 16], ["Reinaldo (Sorocaba)", 1, 18]]);
  assert.equal(u.mercados[0].menor, 15); assert.equal(u.mercados[0].medio, Math.round(((0.5 * 15 + 0.6 * 16) / 1.1) * 100) / 100);
});

test("produto com poucos dados: uma compra só não inventa variação nem evolução", () => {
  const u = N.mkcProduto(ROWS.filter((x) => x.produto === "Arroz 5kg")).unidades[0];
  assert.equal(u.suficiente, false); assert.equal(u.variacaoUltimo, null); assert.equal(u.anterior, null);
  assert.deepEqual([u.menor.preco, u.maior.preco, u.ultimo.preco], [30, 30, 30]); assert.equal(u.serie.length, 1); assert.equal(u.mercados.length, 1);
});

test("unidades diferentes não se misturam: um bloco por unidade, com seus próprios preços", () => {
  const d = N.mkcProduto(ROWS.filter((x) => x.produto === "Queijo Minas"));
  assert.deepEqual(d.unidades.map((u) => u.unidade).sort(), ["kg", "un"]);
  const kg = d.unidades.find((u) => u.unidade === "kg"), un = d.unidades.find((u) => u.unidade === "un");
  assert.equal(kg.ultimo.preco, 40); assert.equal(un.ultimo.preco, 9);
  assert.equal(kg.variacaoUltimo, null, "40/kg e 9/un não geram variação"); assert.equal(d.total, 21);
  assert.deepEqual(N.mkcProdutos(ROWS.filter((x) => x.produto === "Queijo Minas"))[0].qtd, { kg: 0.3, un: 1 });
});

test("consumo por mês: só meses com compra, na ordem; filtro de período muda o resultado de forma consistente", () => {
  const m = N.mkcPorMes(ROWS);
  assert.deepEqual(m.map((x) => x.mes), ["2026-09", "2026-10", "2026-11"]);
  assert.equal(Math.round(m.reduce((s, x) => s + x.total, 0) * 100) / 100, soma(ROWS));
  const out = N.mkcFiltrar(ROWS, N.mkcPeriodo("2026-10", ""));
  assert.equal(soma(out), 33.2); assert.deepEqual(N.mkcPorMes(out).map((x) => x.mes), ["2026-10"]);
  assert.equal(soma(N.mkcFiltrar(ROWS, N.mkcPeriodo("3m", "2026-11-08"))), soma(ROWS));
});

test("tela Consumo: abre, escolhe categoria, abre o produto e mostra os preços (dados reais da lista, sem inventar)", () => {
  T.usar(ROWS);
  const body = new El("div"); T.viewConsumo(body);
  let t = texto(body);
  assert.match(t, /Consumo e histórico de preços/); assert.match(t, /Por categoria/); assert.match(t, /Padaria/); assert.ok(!/Descartáveis/.test(t));
  const barra = achar(body, (e) => e.attrs.title && /^Padaria:/.test(e.attrs.title))[0];
  assert.ok(barra && barra.dica, "a barra usa a dica padrão (racDica) com valor e rótulo");
  assert.match(barra.dica()[1], /46[,.]30|R\$\s?46/);
  barra.onclick();
  t = texto(body); assert.match(t, /Pão Francês/); assert.match(t, /Pão de Forma/); assert.ok(!/Arroz 5kg/.test(t), "só a categoria escolhida");
  achar(body, (e) => e.attrs.title === "Ver compras e preços de Pão Francês")[0].onclick();
  t = texto(body);
  assert.match(t, /Preço por kg/); assert.match(t, /Último preço/); assert.match(t, /Menor preço/); assert.match(t, /Preço médio/); assert.match(t, /Comparação entre mercados/); assert.match(t, /Histórico de compras/);
  assert.ok(achar(body, (e) => e.attrs.class === "lchart").length === 1, "gráfico de evolução com 3 pontos reais");
  assert.equal(achar(body, (e) => /lhit/.test(e.attrs.class || "")).length, 3);
});

test("tela Consumo: produto em duas unidades avisa e separa; produto de uma compra não desenha evolução", () => {
  T.usar(ROWS);
  const b1 = new El("div"); T.viewConsumo(b1);
  achar(b1, (e) => e.attrs.title && /^Açougue\/Frios:/.test(e.attrs.title))[0].onclick();
  achar(b1, (e) => e.attrs.title === "Ver compras e preços de Queijo Minas")[0].onclick();
  const t = texto(b1); assert.match(t, /mais de uma unidade de medida/); assert.match(t, /Preço por kg/); assert.match(t, /Preço por unidade/);
  assert.equal(achar(b1, (e) => e.attrs.class === "lchart").length, 0, "cada unidade tem uma compra: sem gráfico");
  assert.match(t, /ainda não dá para mostrar a evolução/);
});

test("tela Consumo: categoria sem compras mostra aviso e totais zerados", () => {
  T.usar(ROWS);
  const body = new El("div"); T.viewConsumo(body);
  const sels = achar(body, (e) => e.tag === "select" && e.attrs["aria-label"] === "Categoria");
  sels[0].value = "Peixaria"; sels[0].onchange();
  const t = texto(body); assert.match(t, /Sem compras em Peixaria/); assert.ok(!/NaN/.test(t));
});

test("regressão: Painel, Preços e gravação de notas continuam como eram; a nova tela só lê e não chama IA", () => {
  const mk = ler("mercado.js"), i0 = mk.indexOf("/* ---------- Consumo:"), i1 = mk.indexOf("/* ---------- Notas ----------");
  assert.ok(i0 > 0 && i1 > i0); const bloco = mk.slice(i0, i1);
  assert.ok(!/\.(insert|update|delete|upsert)\(|\.rpc\(|from\(/.test(bloco), "a tela Consumo não grava nem consulta o banco: usa as linhas já carregadas");
  assert.ok(!/racIA|anthropic/i.test(bloco));
  for (const f of ["function viewPainel", "function viewPrecos", "function viewNotas", "function viewProdutos", "function lineChart", "Preços ao longo do tempo", "Onde saiu mais barato", "function salvarNota", "Por categoria"]) assert.ok(mk.includes(f), f);
  assert.match(mk, /\["painel", "Painel"\], \["precos", "Preços"\], \["consumo", "Consumo"\], \["comparar", "Comparar"\], \["alertas", "Alertas"\], \["notas", "Notas"\], \["produtos", "Produtos"\]/);
  assert.ok(!/supabase\/\d{3}/.test(bloco));
  assert.ok(!fs.existsSync(new URL("../supabase/propostas/042_mercado_consumo.sql", import.meta.url)), "este lote não precisa de migration");
});
