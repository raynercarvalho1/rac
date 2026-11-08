// Lote: Mercado → Preços com histórico separado por produto E unidade (mkcPrecos, a mesma identidade da aba Consumo). Só dados de teste; sem banco e sem IA.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

class El {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.style = {}; this.value = ""; this.className = ""; this.cl = new Set(); this.ev = {}; this.classList = { add: (c) => this.cl.add(c), remove: (c) => this.cl.delete(c) }; }
  appendChild(c) { this.children.push(c); return c; }
  setAttribute(k, v) { this.attrs[k] = v; }
  set textContent(v) { this.children = [{ text: String(v) }]; }
  get textContent() { return texto(this); }
  set innerHTML(v) { this.children = []; }
  get options() { return achar(this, (e) => e.tag === "option"); }
  querySelectorAll(sel) { return achar(this, (e) => e.tag === sel); }
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
const R = (data, mercado, produto, categoria, un, q, vu, nota) => ({ id: "i" + String(++seq).padStart(3, "0"), data, mk: data.slice(0, 7), mercado, produto, categoria, unidade: un, quantidade: q, valor_unitario: vu, valor_total: Math.round(q * vu * 100) / 100, desconto: 0, nota: nota || data + "|" + mercado });
const C = "Confiança (Sorocaba)", RE = "Reinaldo (Sorocaba)";
const ROWS = [
  R("2026-09-01", C, "Arroz", "Mercearia", "kg", 2, 5.99), R("2026-10-01", RE, "Arroz", "Mercearia", "kg", 1, 6.5), R("2026-11-01", C, "Arroz", "Mercearia", "kg", 3, 6.9),
  R("2026-10-01", RE, "Arroz", "Mercearia", "un", 1, 8.5),
  R("2026-10-01", RE, "Leite Integral 1L", "Mercearia", "un", 6, 5), R("2026-11-01", C, "Leite Integral 1L", "Mercearia", "un", 6, 5.5),
  R("2026-11-01", C, "Leite Integral 500ml", "Mercearia", "un", 2, 3),
  R("2026-10-15", RE, "Suco", "Bebidas", "l", 1, 9), R("2026-11-15", RE, "Suco", "Bebidas", "ml", 500, 0.01),
  R("2026-11-01", C, "Arroz Tio João 5kg", "Mercearia", "un", 1, 30), R("2026-11-01", C, "Arroz Tio João", "Mercearia", "un", 1, 25)
];
const P = N.mkcPrecos(ROWS);
const get = (nome, un) => P.find((x) => x.nome === nome && x.unidade === un);

test("mesmo produto em kg e un: duas linhas, cada uma com os seus indicadores", () => {
  const kg = get("Arroz", "kg"), un = get("Arroz", "un");
  assert.ok(kg && un && kg.chave !== un.chave);
  assert.deepEqual([kg.compras.length, kg.min, kg.max, kg.ult.valor_unitario, kg.qtd, kg.gasto], [3, 5.99, 6.9, 6.9, 6, 39.18], "só as 3 compras em kg");
  assert.deepEqual([un.compras.length, un.min, un.max, un.ult.valor_unitario, un.qtd, un.gasto], [1, 8.5, 8.5, 8.5, 1, 8.5], "o preço em un não entra no mínimo/máximo do kg");
  assert.equal(P.filter((x) => x.nome === "Arroz").length, 2);
});

test("variação primeira → última e contra a anterior, por unidade; uma compra só não inventa variação", () => {
  const kg = get("Arroz", "kg");
  assert.equal(Math.round(kg.varTotal * 10000) / 10000, Math.round(((6.9 - 5.99) / 5.99) * 10000) / 10000);
  assert.equal(Math.round(kg.varUlt * 10000) / 10000, Math.round(((6.9 - 6.5) / 6.5) * 10000) / 10000);
  const un = get("Arroz", "un"); assert.equal(un.varTotal, null); assert.equal(un.varUlt, null);
  assert.equal(un.compras.length, 1); assert.equal(un.min, un.max);
});

test("L e ml não se convertem nem se misturam (unidade desconhecida fica à parte)", () => {
  const l = get("Suco", "l"), ml = get("Suco", "ml");
  assert.ok(l && ml); assert.equal(l.ult.valor_unitario, 9); assert.equal(ml.ult.valor_unitario, 0.01);
  assert.equal(l.varTotal, null); assert.equal(ml.varTotal, null);
  assert.equal(N.mkcChaveProd({ produto: "Suco", unidade: "L" }), N.mkcChaveProd({ produto: "Suco", unidade: "l" }), "só caixa não separa");
  assert.equal(N.mkcChaveProd({ produto: "X", unidade: "" }), N.mkcChaveProd({ produto: "X", unidade: "un" }));
});

test("embalagens e nomes parecidos continuam produtos diferentes", () => {
  assert.ok(get("Leite Integral 1L", "un") && get("Leite Integral 500ml", "un"));
  assert.notEqual(get("Leite Integral 1L", "un").chave, get("Leite Integral 500ml", "un").chave);
  assert.equal(get("Leite Integral 1L", "un").compras.length, 2); assert.equal(get("Leite Integral 500ml", "un").compras.length, 1);
  assert.ok(get("Arroz Tio João 5kg", "un") && get("Arroz Tio João", "un") && get("Arroz", "un"));
  assert.equal(P.length, 8);
});

test("produtos com a mesma unidade continuam agrupando todas as compras no mesmo histórico", () => {
  const leite = get("Leite Integral 1L", "un");
  assert.deepEqual(leite.compras.map((x) => x.data), ["2026-10-01", "2026-11-01"]); assert.equal(leite.mercados, 2); assert.equal(leite.gasto, 63);
  assert.equal(Math.round(leite.varTotal * 100) / 100, 0.1);
});

test("consistência com a aba Consumo: mesma identidade, mesmos números por produto e unidade", () => {
  for (const p of P) {
    const d = N.mkcProduto(ROWS.filter((x) => x.produto === p.nome)), b = d.unidades.find((u) => u.unidade === p.unidade);
    assert.ok(b, p.chave);
    assert.equal(b.compras, p.compras.length, p.chave); assert.equal(b.total, p.gasto, p.chave); assert.equal(b.ultimo.preco, +p.ult.valor_unitario, p.chave);
    assert.equal(b.menor.preco, p.min, p.chave); assert.equal(b.maior.preco, p.max, p.chave); assert.equal(b.qtd, p.qtd, p.chave);
  }
});

function abrir() {
  T.usar(ROWS); const body = new El("div"); T.viewPrecos(body);
  const linhas = () => achar(body, (e) => e.tag === "tr").filter((tr) => achar(tr, (e) => e.tag === "td").length);
  const cel = (tr) => achar(tr, (e) => e.tag === "td").map(texto);
  return { body, linhas, cel };
}

test("tela Preços: coluna Unidade; Arroz aparece em kg e em un, com preços próprios", () => {
  const { body, linhas, cel } = abrir();
  assert.deepEqual(achar(body, (e) => e.tag === "th").map((e) => texto(e).replace(/[▲▼↕]/g, "").trim()), ["Produto", "Unidade", "Último preço", "Menor preço", "Variação", "Compras", "Total gasto"]);
  const arroz = linhas().map(cel).filter((c) => /^\s*Arroz\s+·/.test(c[0]) && !/Tio/.test(c[0]));
  assert.equal(arroz.length, 2);
  const kg = arroz.find((c) => c[1].trim() === "kg"), un = arroz.find((c) => c[1].trim() === "un");
  assert.match(kg[2], /6,90/); assert.match(kg[3], /5,99/); assert.match(kg[5], /3/);
  assert.match(un[2], /8,50/); assert.match(un[3], /8,50/); assert.match(un[4], /—/); assert.match(un[5], /1/);
  assert.equal(linhas().length, 8, "uma linha por produto e unidade");
});

test("tela Preços: o detalhe abre só o histórico da unidade escolhida", () => {
  const { body, linhas } = abrir();
  const tr = linhas().find((r) => /Arroz\s+·/.test(texto(r)) && !/Tio/.test(texto(r)) && /\bun\b/.test(texto(r)));
  achar(tr, (e) => e.tag === "button")[0].onclick();
  const t = texto(body); assert.match(t, /Arroz · un/); assert.match(t, /1 compra/); assert.match(t, /outras unidades deste produto têm histórico próprio/);
  assert.ok(!/3 compras/.test(t.split("Último preço")[0] || ""), "não herda as compras do kg");
});

test("tela Preços: filtro por mês, desde o início, busca e ordenação continuam funcionando", () => {
  const { body, linhas, cel } = abrir();
  const per = achar(body, (e) => e.tag === "select" && e.attrs["aria-label"] === "Período")[0];
  per.value = "2026-10"; per.ev.change();
  let c = linhas().map(cel); assert.ok(c.every((x) => /\d/.test(x[5])) && c.length > 0);
  const arrKg = c.find((x) => /^\s*Arroz\s+·/.test(x[0]) && x[1].trim() === "kg"); assert.match(arrKg[5], /1/, "em outubro o Arroz kg tem 1 compra");
  per.value = ""; per.ev.change(); assert.equal(linhas().length, 8, "desde o início volta tudo");
  const q = achar(body, (e) => e.tag === "input" && e.attrs["aria-label"] === "Buscar produto")[0];
  q.value = "arroz"; q.ev.input(); assert.equal(linhas().length, 4, "Arroz kg, Arroz un e os dois Arroz Tio João");
  q.value = "xyz"; q.ev.input(); assert.equal(linhas().length, 0);
  q.value = ""; q.ev.input();
  const th = achar(body, (e) => e.tag === "th").find((e) => /Total gasto/.test(texto(e))); th.onclick();
  const gastos = linhas().map(cel).map((x) => +x[6].replace(/[^\d,]/g, "").replace(",", ".")); assert.deepEqual(gastos, gastos.slice().sort((a, b) => a - b), "ordenado pela coluna escolhida");
  const thU = achar(body, (e) => e.tag === "th").find((e) => /Unidade/.test(texto(e))); thU.onclick();
  const un = linhas().map(cel).map((x) => x[1].trim()); assert.deepEqual(un, un.slice().sort((a, b) => a.localeCompare(b)), "dá para ordenar por unidade");
});

test("Painel: a lista de produtos também separa por unidade e abre o histórico certo", () => {
  const mk = ler("mercado.js");
  assert.match(mk, /groupBy\(l, function \(x\) \{ return NU\(\)\.mkcChaveProd\(x\); \}\)/); assert.match(mk, /st\.prod = x\.k;/);
  assert.ok(!/function produtos\(rs\) \{\s*return Object\.entries\(groupBy\(rs \|\| rows, function \(x\) \{ return x\.produto; \}\)\)/.test(mk), "o agrupamento só pelo nome saiu de Preços");
});

test("regressão: Consumo, classificação e dados históricos (nada é gravado pelo código novo)", () => {
  const c = N.mkcProduto(ROWS.filter((x) => x.produto === "Arroz"));
  assert.deepEqual(c.unidades.map((u) => u.unidade).sort(), ["kg", "un"]);
  assert.equal(N.mkClassificar("BISC WAFER TUBIN CHOCO").categoria, "Chocolates/Doces"); assert.equal(N.mkCatOficial("Limpeza/Descartáveis"), "Limpeza");
  const nu = ler("nucleo.js"), i0 = nu.indexOf("function mkcPrecos"); assert.ok(i0 > 0);
  assert.ok(!/\.(insert|update|delete|upsert)\(|\.rpc\(/.test(nu.slice(i0, i0 + 1500)));
  const mk = ler("mercado.js"), a = mk.indexOf("function produtos(rs)"), b = mk.indexOf("/* Ordenação da lista"); assert.ok(!/\.(insert|update|delete|upsert)\(/.test(mk.slice(a, b)));
  assert.ok(!fs.existsSync(new URL("../supabase/propostas/042_precos_unidade.sql", import.meta.url)), "sem migration neste lote");
  assert.ok(!/racIA|anthropic/i.test(mk.slice(a, b)));
});
