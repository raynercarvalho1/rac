// Lote: comparação entre dois períodos no Mercado (nucleo.js mkcComparar e a aba "Comparar"). Só dados de teste: sem banco e sem IA.
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
const C = "Confiança (Sorocaba)", RE = "Reinaldo (Sorocaba)";
const R = (data, mercado, produto, categoria, un, q, vu) => ({ id: "i" + String(++seq).padStart(3, "0"), data, mk: data.slice(0, 7), mercado, produto, categoria, unidade: un, quantidade: q, valor_unitario: vu, valor_total: Math.round(q * vu * 100) / 100, desconto: 0, nota: data + "|" + mercado });
const ROWS = [
  /* B = outubro/2026 (31 dias): total 97 */
  R("2026-10-05", RE, "Arroz", "Mercearia", "kg", 2, 5), R("2026-10-05", RE, "Leite Integral 1L", "Mercearia", "un", 6, 5), R("2026-10-05", RE, "Detergente", "Limpeza/Descartáveis", "un", 2, 3),
  R("2026-10-10", C, "Pão Francês", "Padaria", "kg", 1, 16), R("2026-10-10", C, "Queijo Minas", "Açougue/Frios", "kg", 0.5, 40), R("2026-10-10", C, "Queijo Minas", "Açougue/Frios", "un", 1, 9),
  R("2026-10-20", RE, "Banana", "Hortifruti", "kg", 1, 6),
  /* A = novembro/2026 (30 dias): total 131 */
  R("2026-11-03", C, "Arroz", "Mercearia", "kg", 2, 6), R("2026-11-03", C, "Leite Integral 1L", "Mercearia", "un", 12, 5), R("2026-11-03", C, "Pão Francês", "Padaria", "kg", 1, 16),
  R("2026-11-03", C, "Queijo Minas", "Açougue/Frios", "kg", 0.5, 40), R("2026-11-03", C, "Maçã", "Hortifruti", "kg", 1, 8), R("2026-11-03", C, "Nutella", "Chocolates/Doces", "un", 1, 12),
  R("2026-11-04", RE, "Detergente", "Limpeza", "un", 1, 3)
];
const A = { de: "2026-11-01", ate: "2026-11-30" }, B = { de: "2026-10-01", ate: "2026-10-31" };
const arred = (v, n = 4) => Math.round(v * 10 ** n) / 10 ** n;
const prod = (r, nome, un) => r.produtos.find((x) => x.nome === nome && x.unidade === un);

test("atalhos: este mês × anterior, 30 dias, 3 e 6 meses (inclusive na virada do ano); personalizado não tem atalho", () => {
  assert.deepEqual(N.mkcAtalho("mes", "2026-11-08"), { a: { de: "2026-11-01", ate: "2026-11-08" }, b: { de: "2026-10-01", ate: "2026-10-31" } });
  assert.deepEqual(N.mkcAtalho("30d", "2026-11-08"), { a: { de: "2026-10-10", ate: "2026-11-08" }, b: { de: "2026-09-10", ate: "2026-10-09" } });
  assert.deepEqual(N.mkcAtalho("3m", "2026-11-08"), { a: { de: "2026-09-01", ate: "2026-11-08" }, b: { de: "2026-06-01", ate: "2026-08-31" } });
  assert.deepEqual(N.mkcAtalho("6m", "2026-02-10"), { a: { de: "2025-09-01", ate: "2026-02-10" }, b: { de: "2025-03-01", ate: "2025-08-31" } });
  assert.deepEqual(N.mkcAtalho("mes", "2026-01-15").b, { de: "2025-12-01", ate: "2025-12-31" });
  assert.equal(N.mkcAtalho("custom", "2026-11-08"), null);
});

test("datas inicial e final: duração inclusiva, ordem e datas que não existem", () => {
  assert.deepEqual(N.mkcPeriodoInfo(A), { ok: true, erro: "", dias: 30 }); assert.equal(N.mkcPeriodoInfo(B).dias, 31);
  assert.equal(N.mkcPeriodoInfo({ de: "2026-11-03", ate: "2026-11-03" }).dias, 1);
  assert.equal(N.mkcPeriodoInfo({ de: "2026-11-30", ate: "2026-11-01" }).ok, false);
  assert.equal(N.mkcPeriodoInfo({ de: "", ate: "2026-11-01" }).ok, false); assert.equal(N.mkcPeriodoInfo({ de: "2026-02-30", ate: "2026-03-01" }).ok, false);
  const r = N.mkcComparar(ROWS, { de: "2026-11-30", ate: "2026-11-01" }, B); assert.equal(r.ok, false); assert.match(r.erro, /Período A/);
  /* a data final entra, o dia anterior à inicial não */
  const d = N.mkcComparar(ROWS, { de: "2026-11-04", ate: "2026-11-04" }, { de: "2026-11-03", ate: "2026-11-03" });
  assert.equal(d.geral.total.a, 3); assert.equal(d.geral.total.b, 128);
});

test("comparação entre dois meses: total, diferença, variação, compras, itens, produtos, ticket e gasto por dia", () => {
  const r = N.mkcComparar(ROWS, A, B), G = r.geral;
  assert.equal(r.ok, true);
  assert.deepEqual([G.total.a, G.total.b, G.total.dif, G.total.estado], [131, 97, 34, "subiu"]);
  assert.equal(arred(G.total.pct), arred(34 / 97));
  assert.deepEqual([G.compras.a, G.compras.b], [2, 3]); assert.deepEqual([G.itens.a, G.itens.b], [7, 7]); assert.deepEqual([G.produtos.a, G.produtos.b], [7, 7]);
  assert.deepEqual([G.ticket.a, G.ticket.b], [65.5, 32.33]); assert.equal(G.ticket.estado, "subiu");
  assert.deepEqual([r.a.dias, r.b.dias], [30, 31], "períodos de durações diferentes");
  assert.deepEqual([G.porDia.a, G.porDia.b], [4.37, 3.13], "gasto por dia = total ÷ dias do período");
  assert.equal(r.sobrepoe, false);
  assert.equal(N.mkcComparar(ROWS, A, { de: "2026-11-15", ate: "2026-12-15" }).sobrepoe, true);
});

test("duração diferente: 3 meses × 3 anteriores usa o intervalo de cada um, sem presumir igualdade", () => {
  const at = N.mkcAtalho("3m", "2026-11-08"), r = N.mkcComparar(ROWS, at.a, at.b);
  assert.equal(r.a.dias, 69); assert.equal(r.b.dias, 92); assert.equal(r.geral.total.a, 228, "set a 8/nov"); assert.equal(r.geral.total.b, 0);
  assert.equal(r.geral.total.estado, "novo");
});

test("período sem compras: sem variação inventada (denominador zero) e indicadores sem base", () => {
  const vazio = { de: "2025-01-01", ate: "2025-01-31" };
  const r = N.mkcComparar(ROWS, A, vazio), G = r.geral;
  assert.deepEqual([G.total.b, G.total.pct, G.total.estado], [0, null, "novo"]); assert.equal(G.ticket.estado, "sem_base"); assert.equal(G.ticket.pct, null); assert.equal(G.ticket.dif, null);
  const s = N.mkcComparar(ROWS, vazio, A); assert.deepEqual([s.geral.total.a, s.geral.total.estado, s.geral.total.pct], [0, "sumiu", -1], "A zerou: −100% é conta real, não inventada");
  const z = N.mkcComparar(ROWS, vazio, { de: "2025-02-01", ate: "2025-02-28" }); assert.equal(z.geral.total.estado, "zero"); assert.equal(z.categorias.every((c) => c.m.estado === "zero" && c.partA === 0), true);
  assert.deepEqual(z.produtos, []); assert.deepEqual(z.mercados, []);
  assert.deepEqual([N.mkcMetric(5, 0).estado, N.mkcMetric(0, 5).estado, N.mkcMetric(0, 0).estado, N.mkcMetric(3, null).estado, N.mkcMetric(5, 5).estado, N.mkcMetric(4, 5).estado], ["novo", "sumiu", "zero", "sem_base", "igual", "caiu"]);
  assert.equal(N.mkcMetric(5, 0).pct, null); assert.equal(N.mkcMetric(5, 4).pct, 0.25);
});

test("categorias: as 11 oficiais, Limpeza unificada, categoria sem compras em um dos períodos e participação", () => {
  const r = N.mkcComparar(ROWS, A, B), c = (n) => r.categorias.find((x) => x.categoria === n);
  assert.ok(N.MK_CATEGORIAS.every((n) => c(n)), "todas as oficiais aparecem"); assert.ok(!r.categorias.some((x) => /descart/i.test(x.categoria)));
  assert.deepEqual([c("Limpeza").m.a, c("Limpeza").m.b, c("Limpeza").m.estado, arred(c("Limpeza").m.pct)], [3, 6, "caiu", -0.5], "Limpeza/Descartáveis + Limpeza são uma categoria só");
  assert.deepEqual([c("Chocolates/Doces").m.a, c("Chocolates/Doces").m.b, c("Chocolates/Doces").m.estado, c("Chocolates/Doces").m.pct], [12, 0, "novo", null], "só no período A");
  assert.deepEqual([c("Hortifruti").m.a, c("Hortifruti").m.b], [8, 6]);
  assert.deepEqual([c("Peixaria").m.a, c("Peixaria").m.b, c("Peixaria").m.estado, c("Peixaria").partA], [0, 0, "zero", 0], "sem compras: zero, sem dado fictício");
  assert.equal(arred(c("Mercearia").partA), arred(72 / 131)); assert.equal(arred(c("Mercearia").partB), arred(40 / 97)); assert.equal(arred(c("Mercearia").dPart), arred(72 / 131 - 40 / 97));
  assert.equal(arred(r.categorias.reduce((s, x) => s + x.partA, 0)), 1); assert.equal(arred(r.categorias.reduce((s, x) => s + x.partB, 0)), 1);
  assert.equal(r.categorias.reduce((s, x) => s + x.m.a, 0), 131);
});

test("produto: aumento de preço sem mudar a quantidade; aumento de quantidade sem mudar o preço; redução de gasto; estável", () => {
  const r = N.mkcComparar(ROWS, A, B);
  const arroz = prod(r, "Arroz", "kg"); assert.deepEqual([arroz.gasto.dif, arroz.qtd.pct, arred(arroz.preco.pct), arroz.leitura], [2, 0, 0.2, "preco"], "gastou mais porque o preço subiu");
  const leite = prod(r, "Leite Integral 1L", "un"); assert.deepEqual([leite.gasto.dif, leite.qtd.pct, leite.preco.pct, leite.leitura], [30, 1, 0, "quantidade"], "gastou mais porque comprou mais; o preço não subiu");
  const det = prod(r, "Detergente", "un"); assert.deepEqual([det.gasto.dif, det.qtd.pct, det.preco.pct, det.leitura], [-3, -0.5, 0, "quantidade"], "redução de gasto por comprar menos");
  const pao = prod(r, "Pão Francês", "kg"); assert.deepEqual([pao.gasto.dif, pao.leitura], [0, "estavel"]);
  assert.equal(arroz.a.preco, 6); assert.equal(arroz.b.preco, 5, "preço = média ponderada pela quantidade");
});

test("produto presente só num período e unidades diferentes (kg × un) nunca se misturam", () => {
  const r = N.mkcComparar(ROWS, A, B);
  assert.equal(prod(r, "Banana", "kg").estado, "so_b"); assert.equal(prod(r, "Maçã", "kg").estado, "so_a"); assert.equal(prod(r, "Nutella", "un").estado, "so_a");
  assert.equal(prod(r, "Banana", "kg").preco, null, "sem os dois períodos não há comparação de preço"); assert.equal(prod(r, "Banana", "kg").leitura, "so_b");
  const qkg = prod(r, "Queijo Minas", "kg"), qun = prod(r, "Queijo Minas", "un");
  assert.equal(qkg.estado, "ambos"); assert.equal(qun.estado, "so_b", "o queijo em un só existe em B: não é comparado com o de kg"); assert.equal(qun.preco, null);
  assert.deepEqual(r.produtos.filter((x) => x.nome === "Queijo Minas").map((x) => x.unidade).sort(), ["kg", "un"]);
  const q = Object.fromEntries(r.geral.qtd.map((x) => [x.unidade, [x.m.a, x.m.b]])); assert.deepEqual(q, { kg: [4.5, 4.5], un: [14, 9] }, "quantidades por unidade");
  assert.equal(N.mkcChaveProd({ produto: "Queijo Minas", unidade: "kg" }), qkg.chave, "mesma identidade da aba Consumo e de Preços");
});

test("listas prontas: maiores aumentos e reduções de gasto, quantidade, preço e produtos de um período só", () => {
  const k = N.mkcCompRank(N.mkcComparar(ROWS, A, B).produtos);
  const nomes = (l) => l.map((x) => x.nome + ":" + x.unidade);
  assert.deepEqual(nomes(k.maiorAumentoGasto), ["Leite Integral 1L:un", "Nutella:un", "Maçã:kg", "Arroz:kg"]);
  assert.deepEqual(nomes(k.maiorReducaoGasto), ["Queijo Minas:un", "Banana:kg", "Detergente:un"]);
  assert.deepEqual(nomes(k.aumentoQtd), ["Leite Integral 1L:un"]); assert.deepEqual(nomes(k.reducaoQtd), ["Detergente:un"]);
  assert.deepEqual(nomes(k.precoSubiu), ["Arroz:kg"]); assert.deepEqual(nomes(k.precoCaiu), []);
  assert.deepEqual(nomes(k.soA), ["Nutella:un", "Maçã:kg"]); assert.deepEqual(nomes(k.soB), ["Queijo Minas:un", "Banana:kg"]);
  assert.equal(N.mkcCompRank(N.mkcComparar(ROWS, A, B).produtos, 2).maiorAumentoGasto.length, 2);
});

test("estabelecimentos: gasto, diferença, participação e mudança de participação; sem afirmar qual é mais barato", () => {
  const r = N.mkcComparar(ROWS, A, B), m = (n) => r.mercados.find((x) => x.mercado === n);
  assert.deepEqual([m(C).m.a, m(C).m.b, m(RE).m.a, m(RE).m.b], [128, 45, 3, 52]);
  assert.equal(arred(m(C).partA), arred(128 / 131)); assert.equal(arred(m(C).partB), arred(45 / 97)); assert.equal(arred(m(C).dPart), arred(128 / 131 - 45 / 97));
  assert.deepEqual([m(C).comprasA, m(C).comprasB, m(RE).comprasA, m(RE).comprasB], [1, 1, 1, 2]); assert.deepEqual([m(C).produtosA, m(C).produtosB], [6, 3]);
  assert.equal(r.mercados[0].mercado, C, "ordenado pelo maior gasto");
  assert.match(ler("mercado.js"), /Gasto maior não quer dizer preço maior/);
});

test("filtros combinados valem para os dois períodos; cada quadro ignora só a própria dimensão", () => {
  const f = { categoria: "Mercearia", mercado: C };
  const r = N.mkcComparar(ROWS, A, B, f);
  assert.deepEqual([r.geral.total.a, r.geral.total.b, r.geral.total.estado], [72, 0, "novo"], "Mercearia na Confiança: em outubro foi tudo no Reinaldo");
  assert.ok(r.categorias.find((x) => x.categoria === "Padaria").m.a === 16, "o quadro de categorias ignora o filtro de categoria (continua dando para trocar)");
  assert.deepEqual([r.mercados.find((x) => x.mercado === RE).m.b], [40], "o quadro de estabelecimentos ignora o filtro de mercado e respeita a categoria");
  const p = N.mkcComparar(ROWS, A, B, { produto: "pao" }); assert.equal(p.geral.total.a, 16); assert.equal(p.geral.total.b, 16); assert.deepEqual(p.produtos.map((x) => x.nome), ["Pão Francês"]);
  const q = N.mkcComparar(ROWS, A, B, { categoria: "Limpeza" }); assert.deepEqual([q.geral.total.a, q.geral.total.b], [3, 6], "filtro pela categoria unificada pega os dois nomes");
});

function abrir() {
  T.usar(ROWS); const body = new El("div"); T.viewComparar(body);
  /* o estado da tela persiste de propósito; cada teste começa sem filtros */
  for (const rot of ["Categoria", "Mercado"]) { const s = achar(body, (e) => e.tag === "select" && e.attrs["aria-label"] === rot)[0]; s.value = ""; s.onchange(); }
  const q = achar(body, (e) => e.tag === "input" && e.attrs["aria-label"] === "Buscar produto")[0]; q.value = ""; q.ev.input();
  return body;
}
const input = (body, rot) => achar(body, (e) => e.tag === "input" && e.attrs["aria-label"] === rot)[0];
function periodos(body, a, b) { for (const [rot, v] of [["Período A: data inicial", a.de], ["Período A: data final", a.ate], ["Período B: data inicial", b.de], ["Período B: data final", b.ate]]) { const i = input(body, rot); i.value = v; i.ev.change(); } }

test("tela Comparar: períodos independentes, indicadores, aumento/redução e variação", () => {
  const body = abrir(); periodos(body, A, B);
  const t = texto(body);
  assert.match(t, /Comparar períodos/); assert.match(t, /Gasto no período A/); assert.match(t, /R\$\s?131,00/); assert.match(t, /R\$\s?97,00/); assert.match(t, /\+R\$\s?34,00/);
  assert.match(t, /gastou mais/); assert.match(t, /35,1/); assert.match(t, /durações diferentes \(A: 30 dias, B: 31 dias\)/);
  assert.match(t, /Comparação geral/); assert.match(t, /Gasto por dia/); assert.match(t, /Gasto médio por compra/); assert.match(t, /Quantidade \(kg\)/); assert.match(t, /Quantidade \(un\)/);
  assert.ok(!/sobrepõem/.test(t));
  const ant = achar(body, (e) => e.tag === "select" && e.attrs["aria-label"] === "Atalho de períodos")[0]; assert.equal(ant.value, "custom");
});

test("tela Comparar: categorias lado a lado com dica padrão; clicar detalha a categoria e a lista de produtos", () => {
  const body = abrir(); periodos(body, A, B);
  const barra = achar(body, (e) => e.attrs.title && /^Mercearia:/.test(e.attrs.title))[0];
  assert.ok(barra && barra.dica); assert.match(barra.dica()[1], /A R\$\s?72,00.*B R\$\s?40,00/);
  assert.equal(achar(barra, (e) => /hbf/.test(e.className || "")).length, 2, "duas barras: A e B");
  assert.match(texto(body), /Sem compras nos dois períodos: .*Peixaria/);
  barra.onclick();
  const t = texto(body); assert.match(t, /Arroz/); assert.match(t, /Leite Integral 1L/); assert.ok(!/Pão Francês/.test(t), "só a categoria escolhida"); assert.match(t, /categoria Mercearia/);
});

test("tela Comparar: produtos separam gasto, quantidade e preço; lista por tipo; detalhe do produto", () => {
  const body = abrir(); periodos(body, A, B);
  const th = achar(body, (e) => e.tag === "th").map((e) => texto(e).replace(/[▲▼↕]/g, "").trim());
  for (const c of ["Gasto A", "Gasto B", "Dif. gasto", "Qtd A", "Qtd B", "Var. qtd", "Preço A", "Preço B", "Var. preço", "Explicação"]) assert.ok(th.includes(c), c);
  const linhas = () => achar(body, (e) => e.tag === "tr").filter((tr) => /Arroz|Leite|Queijo/.test(texto(tr)) && achar(tr, (e) => e.tag === "td").length);
  const arroz = linhas().find((tr) => /^\s*Arroz/.test(texto(tr))); assert.match(texto(arroz), /preço/); assert.match(texto(arroz), /R\$\s?6,00\/kg/); assert.match(texto(arroz), /R\$\s?5,00\/kg/);
  const lista = achar(body, (e) => e.tag === "select" && e.attrs["aria-label"] === "Lista de produtos")[0];
  lista.value = "soa"; lista.onchange(); const so = texto(body); assert.match(so, /Maçã/); assert.match(so, /Nutella/); assert.ok(!/Banana/.test(so.split("Estabelecimentos")[0]));
  lista.value = "todos"; lista.onchange();
  achar(body, (e) => e.tag === "button" && e.className === "mkprod" && texto(e) === "Arroz")[0].onclick();
  const d = texto(body); assert.match(d, /Arroz · kg/); assert.match(d, /Preço médio \(ponderado\)/); assert.match(d, /Menor preço/); assert.match(d, /Onde comprou em A: Confiança/); assert.match(d, /Onde comprou em B: Reinaldo/);
  /* produto só em B: sem preço comparável e sem inventar */
  lista.value = "sob"; lista.onchange(); achar(body, (e) => e.tag === "button" && e.className === "mkprod" && texto(e) === "Banana")[0].onclick();
  const b = texto(body); assert.match(b, /Banana · kg/); assert.match(b, /O preço só é comparado quando o produto foi comprado nos dois períodos/); assert.match(b, /Onde comprou em A: sem compras/);
});

test("tela Comparar: ordenar por coluna, estabelecimentos clicáveis, erro de datas e sobreposição", () => {
  const body = abrir(); periodos(body, A, B);
  const thGasto = achar(body, (e) => e.tag === "th").find((e) => /^\s*Gasto A/.test(texto(e))); thGasto.onclick();
  const A1 = achar(body, (e) => e.tag === "tr").map((tr) => achar(tr, (e) => e.tag === "td").map(texto)).filter((c) => c.length === 11 && /\d/.test(c[1])).map((c) => +c[1].replace(/[^\d,]/g, "").replace(",", "."));
  assert.deepEqual(A1, A1.slice().sort((a, b) => a - b), "ordenado pelo gasto A");
  const mercBtn = achar(body, (e) => e.tag === "button" && e.attrs.title === "Filtrar a página por este mercado" && /Reinaldo/.test(texto(e)))[0]; mercBtn.onclick();
  const t = texto(body); assert.match(t, /mercado Reinaldo/); assert.match(t, /R\$\s?3,00/);
  input(body, "Período A: data inicial").value = "2026-12-01"; input(body, "Período A: data inicial").ev.change();
  assert.match(texto(body), /A data inicial é depois da final/); assert.ok(!/Comparação geral/.test(texto(body)));
  periodos(body, A, { de: "2026-11-15", ate: "2026-12-15" }); assert.match(texto(body), /sobrepõem/);
});

test("regressão: Consumo, Preços, Produtos e Notas continuam; a nova aba só lê, sem IA e sem migration", () => {
  const mk = ler("mercado.js"), i0 = mk.indexOf("/* ---------- Comparar períodos"), i1 = mk.indexOf("/* ---------- Notas ----------"); assert.ok(i0 > 0 && i1 > i0);
  const bloco = mk.slice(i0, i1);
  assert.ok(!/\.(insert|update|delete|upsert)\(|\.rpc\(|from\(/.test(bloco)); assert.ok(!/racIA|anthropic/i.test(bloco));
  assert.match(mk, /\["painel", "Painel"\], \["precos", "Preços"\], \["consumo", "Consumo"\], \["comparar", "Comparar"\], \["alertas", "Alertas"\], \["notas", "Notas"\], \["produtos", "Produtos"\]/);
  for (const f of ["function viewConsumo", "function viewPrecos", "function viewProdutos", "function viewNotas", "function detalheProduto"]) assert.ok(mk.includes(f), f);
  const nu = ler("nucleo.js"); assert.ok(!/\.(insert|update|delete|upsert)\(/.test(nu.slice(nu.indexOf("function mkcComparar"), nu.indexOf("function mkcComparar") + 6000)));
  assert.equal(N.mkClassificar("BISC WAFER TUBIN CHOCO").categoria, "Chocolates/Doces"); assert.equal(N.mkCatOficial("Limpeza/Descartáveis"), "Limpeza");
  assert.equal(N.mkcPrecos(ROWS).filter((p) => p.nome === "Queijo Minas").length, 2, "Preços segue separando por unidade");
  assert.ok(!fs.existsSync(new URL("../supabase/propostas/042_mercado_comparar.sql", import.meta.url)), "sem migration");
});
