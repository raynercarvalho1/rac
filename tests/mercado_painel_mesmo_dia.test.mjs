// Painel do Mercado: gasto, compras e itens do mês comparados com o MESMO PERÍODO do mês anterior (dia 1 até o mesmo dia). Só dados de teste.
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
const R = (data, mercado, produto, vt, nota) => ({ id: "i" + String(++seq).padStart(3, "0"), data, mk: data.slice(0, 7), mercado, numero: nota || "", produto, categoria: "Mercearia", unidade: "un", quantidade: 1, valor_unitario: vt, valor_total: vt, desconto: 0, nota: data + "|" + mercado + "|" + (nota || "") });
/* outubro (anterior): até o dia 8 → 100 + 50 + 25 = 175 em 2 compras e 3 itens; depois do dia 8 → mais 300 (não entra na comparação) */
const ROWS = [
  R("2026-10-02", C, "Arroz", 100), R("2026-10-02", C, "Leite", 50), R("2026-10-08", RE, "Café", 25),
  R("2026-10-09", C, "Feijão", 200), R("2026-10-20", RE, "Óleo", 100),
  /* novembro (atual): até o dia 8 → 60 + 40 = 100 em 2 compras e 3 itens */
  R("2026-11-03", C, "Arroz", 60), R("2026-11-03", C, "Leite", 25), R("2026-11-08", RE, "Café", 15)
];

test("período equivalente: mês corrente (dia 1 até hoje × dia 1 até o mesmo dia) e mês fechado (inteiro × inteiro)", () => {
  assert.deepEqual(N.mkcMesmoDia("2026-11", "2026-11-08"), { mes: "2026-11", mesAnterior: "2026-10", parcial: true, dia: 8, diaAnterior: 8, anteriorInteiro: false, atual: { de: "2026-11-01", ate: "2026-11-08" }, anterior: { de: "2026-10-01", ate: "2026-10-08" } });
  const f = N.mkcMesmoDia("2026-10", "2026-11-08"); assert.deepEqual([f.parcial, f.atual.ate, f.anterior.de, f.anterior.ate, f.anteriorInteiro], [false, "2026-10-31", "2026-09-01", "2026-09-30", true]);
  const m31 = N.mkcMesmoDia("2026-03", "2026-03-31"); assert.deepEqual([m31.anterior.ate, m31.diaAnterior, m31.anteriorInteiro], ["2026-02-28", 28, true], "dia 31 × fevereiro de 28 dias: o mês anterior inteiro");
  assert.equal(N.mkcMesmoDia("2024-03", "2024-03-29").anterior.ate, "2024-02-29", "ano bissexto");
  assert.deepEqual([N.mkcMesmoDia("2026-01", "2026-01-15").mesAnterior, N.mkcMesmoDia("2026-01", "2026-01-15").anterior.de], ["2025-12", "2025-12-01"], "virada do ano");
  assert.equal(N.mkcMesmoDia("2026-11", "2026-11-01").anterior.ate, "2026-10-01", "dia 1 compara com o dia 1");
});

test("os números do mesmo período: só entra o que foi comprado até aquele dia nos dois meses", () => {
  const P = N.mkcMesmoDia("2026-11", "2026-11-08");
  const cur = N.mkcResumo(N.mkcFiltrar(ROWS.filter((x) => x.mk === "2026-11"), P.atual), []), prv = N.mkcResumo(N.mkcFiltrar(ROWS, P.anterior), []);
  assert.deepEqual([cur.total, cur.compras, cur.itens], [100, 2, 3]); assert.deepEqual([prv.total, prv.compras, prv.itens], [175, 2, 3], "o dia 8 entra e o dia 9 em diante não");
});

function painel(hoje, mes) {
  T.usar(ROWS, { email: "x" }); T.hoje(hoje);
  const body = new El("div"); T.viewPainel(body);
  if (mes) { achar(body, (e) => e.tag === "button" && /^\w{3}\/26$/.test(texto(e).trim())); }
  return body;
}

test("tela, hoje = dia 8: gasto em R$ e %, compras e itens do mesmo período do mês passado", () => {
  const t = texto(painel("2026-11-08"));
  assert.match(t, /Gasto em novembro 2026\s+R\$\s?100,00/);
  assert.match(t, /▼ −R\$\s?75,00 \(42,9%\) vs 1 a 8 de outubro \(R\$\s?175,00\)/, "diferença em reais, em % e o valor do período anterior");
  assert.match(t, /Compras no mês\s+2/); assert.match(t, /média de R\$\s?50,00 por compra/); assert.match(t, /Até o dia 8 de outubro: 2 compras · = 0/);
  assert.match(t, /Itens comprados\s+3/); assert.match(t, /Até o dia 8 de outubro: 3 itens · = 0/);
  assert.ok(!/vs outubro\b(?! \()/.test(t.replace(/vs 1 a 8 de outubro/, "")), "não compara mais com o mês inteiro");
});

test("tela: aumento, redução e igualdade; sem compras no período anterior não inventa percentual", () => {
  const mais = ROWS.concat([R("2026-11-05", C, "Pão", 400, "n5"), R("2026-11-06", C, "Bolo", 10, "n6")]);
  T.usar(mais, { email: "x" }); T.hoje("2026-11-08"); let b = new El("div"); T.viewPainel(b); let t = texto(b);
  assert.match(t, /▲ \+R\$\s?335,00 \(191,4%\) vs 1 a 8 de outubro/); assert.match(t, /Até o dia 8 de outubro: 2 compras · ▲ \+2/); assert.match(t, /Até o dia 8 de outubro: 3 itens · ▲ \+2/);
  const so = ROWS.filter((x) => x.mk === "2026-11" || x.data === "2026-10-20");
  T.usar(so, { email: "x" }); b = new El("div"); T.viewPainel(b); t = texto(b);
  assert.match(t, /sem compras em 1 a 8 de outubro/); assert.ok(!/NaN|Infinity/.test(t)); assert.match(t, /Até o dia 8 de outubro: 0 compras · ▲ \+2/);
  T.usar(ROWS.filter((x) => x.mk === "2026-11"), { email: "x" }); b = new El("div"); T.viewPainel(b); assert.match(texto(b), /primeiro mês registrado/);
});

test("tela: a classe de cor segue o gasto (subiu = alerta, caiu = bom); contagens ficam neutras", () => {
  const b = painel("2026-11-08"), notas = achar(b, (e) => e.className && /^kn /.test(e.className));
  assert.ok(notas.some((e) => /down/.test(e.className) && /▼/.test(texto(e))), "gasto menor em verde");
  assert.ok(!achar(b, (e) => e.className === "kn" && /Até o dia/.test(texto(e))).some((e) => /up|down/.test(e.className)), "linhas de compras e itens sem cor");
});

test("mês fechado: compara o mês inteiro com o mês anterior inteiro", () => {
  T.usar(ROWS.concat([R("2026-09-15", C, "Sal", 100, "s1")]), { email: "x" }); T.hoje("2026-11-08");
  const b = new El("div"); T.viewPainel(b);
  const seg = achar(b, (e) => e.tag === "button" && /^out\/26$/.test(texto(e).trim()))[0]; assert.ok(seg);
  /* o painel escolhe o último mês; para um mês fechado usamos a função diretamente com o mesmo critério */
  const P = N.mkcMesmoDia("2026-10", "2026-11-08"), cur = N.mkcResumo(N.mkcFiltrar(ROWS, P.atual), []), prv = N.mkcResumo(N.mkcFiltrar(ROWS.concat([R("2026-09-15", C, "Sal", 100, "s1")]), P.anterior), []);
  assert.deepEqual([cur.total, cur.compras, cur.itens, prv.total, prv.itens], [475, 4, 5, 100, 1]);
  T.hoje(null);
});

test("regressão: o resto do Painel continua (por mercado, por categoria, mês a mês, última compra) e nada é gravado", () => {
  const t = texto(painel("2026-11-08"));
  for (const f of ["Por mercado", "Por categoria", "Mês a mês", "Última compra", "O que mais pesou", "Total desde outubro"]) assert.ok(t.includes(f), f);
  const mk = ler("mercado.js"), a = mk.indexOf("function viewPainel"), b = mk.indexOf("function agruparProdutos");
  assert.ok(!/\.(insert|update|delete|upsert)\(|\.rpc\(/.test(mk.slice(a, b)));
  assert.ok(!fs.existsSync(new URL("../supabase/propostas/042_painel_mesmo_dia.sql", import.meta.url)), "sem migration");
  assert.match(mk, /function hojeLocal\(\)/);
});
