// Lote D (docs/central-areas.md, "Lote D"): Preços, Consumo e Comparar ganham o seletor de área; as contas usam a fonte unificada (notas, pedidos online e delivery) reduzida à área escolhida.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

class El {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.style = {}; this.value = ""; this.hidden = false; this.classList = { add() {}, remove() {}, toggle() {} }; this.options = [{ hidden: false }]; }
  appendChild(c) { if (c == null || typeof c !== "object") throw new TypeError("appendChild"); this.children.push(c); return c; } setAttribute(k, v) { this.attrs[k] = v; } addEventListener() {} querySelectorAll() { return []; }
  set textContent(v) { this.children = [{ text: String(v) }]; } set innerHTML(v) { this.children = []; }
}
const RAIZ = new El("div");
globalThis.document = { createElement: (t) => new El(t), createElementNS: (n, t) => new El(t), createTextNode: (t) => ({ text: t }), querySelector: () => null, getElementById: (id) => (id === "mercado-view" ? RAIZ : null) };
globalThis.window = globalThis.window || {}; globalThis.window.scrollTo = () => {}; globalThis.window.racDica = { ligar(el, f) { el.dica = f; return el; } };
createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo || globalThis.window.RACnucleo; globalThis.window.RACnucleo = N;
createRequire(import.meta.url)("../mercado.js");
const T = globalThis.window.RACmercado._teste;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const NB = new RegExp(String.fromCharCode(160), "g");
const texto = (e) => (e == null ? "" : e.text !== undefined ? e.text : (e.children || []).map(texto).join(" ")).replace(NB, " ").replace(/\s+/g, " ").trim();
const achar = (e, f, acc = []) => { if (e && e.children) { if (f(e)) acc.push(e); e.children.forEach((c) => achar(c, f, acc)); } return acc; };

let n = 0;
const L = (data, mercado, numero, produto, categoria, total) => ({ id: "i" + ++n, data, mk: data.slice(0, 7), mercado, numero, forma_pagamento: "Crédito", categoria, subcategoria: null, descricao: produto, produto, produto_id: "p" + n,
  quantidade: 1, unidade: "un", valor_unitario: total, valor_total: total, desconto: 0, nota: data + "|" + mercado + "|" + numero });
const ROWS = [L("2026-10-03", "Tauste (Sorocaba)", "10", "Arroz", "Mercearia", 38), L("2026-11-03", "Tauste (Sorocaba)", "20", "Arroz", "Mercearia", 40), L("2026-10-06", "Raia Drogasil (Sorocaba)", "30", "Dipirona 500mg", "Farmácia", 15), L("2026-11-06", "Raia Drogasil (Sorocaba)", "31", "Dipirona 500mg", "Farmácia", 22.9)];
const ONL = Object.assign([{ id: "o1", data: "2026-11-05", loja: "amazon", numero: "111-3", subtotal: 60, total_pago: 60, itens: [{ descricao: "Fralda G", qtd: 1, total: 60, categoria: "Bebê" }] }],
  { pedidos: [{ id: "p1", data: "2026-11-07", estabelecimento: "Pizzaria Bella", plataforma: "ifood", modo: "delivery", total_pago: 55, itens: [{ descricao: "Pizza grande", qtd: 1, total: 55, desconto: 0 }] }] });
function ambiente(dono = true) {
  globalThis.isOwner = () => dono; globalThis.isDonoOuCasa = () => true; globalThis.PESSOAL = {};
  T.hoje("2026-11-10"); T.usar(JSON.parse(JSON.stringify(ROWS)), { id: "u1", email: "x@x" }); { const o = JSON.parse(JSON.stringify(ONL)); o.pedidos = JSON.parse(JSON.stringify(ONL.pedidos)); T.usarOnline(o); }
  Object.assign(T.st, { areaT: "", pmes: "", prod: null, c: null, cmp: null, q: "", ord: { k: "var", d: -1 } }); Object.assign(T.PN, { area: "mercado", cab: false, rota: "painel", arg: "" });
}
const tela = (v, area) => { T.st.areaT = area; T.st.c = null; T.st.cmp = null; const b = new El("div"); ({ precos: T.viewPrecos, consumo: T.viewConsumo, comparar: T.viewComparar })[v](b); return b; };

test("Todas as áreas: Preços, Consumo e Comparar enxergam notas, pedidos online e delivery; o seletor lista as áreas com dados", () => {
  ambiente(); const p = texto(tela("precos", ""));
  for (const x of ["Arroz", "Dipirona 500mg", "Fralda G", "Pizza grande"]) assert.ok(p.includes(x), x);
  const sel = achar(tela("precos", ""), (e) => e.tag === "div" && e.attrs["aria-label"] === "Área de consumo")[0], bot = achar(sel, (e) => e.tag === "button").map(texto);
  assert.deepEqual(bot, ["Todas as áreas", "Mercado", "Automotivo", "Farmácia", "Bebê/Infantil", "Delivery"]);
  assert.ok(/Pizza|Fralda/.test(texto(tela("consumo", ""))) && /Pizza|Fralda/.test(texto(tela("comparar", ""))));
  ambiente(); T.usarOnline(Object.assign([], { pedidos: [] })); const sem = texto(achar(tela("precos", ""), (e) => e.tag === "div" && e.attrs["aria-label"] === "Área de consumo")[0]); assert.ok(!/Delivery/.test(sem), "Delivery só aparece com pedidos");
});
test("escolher a área: cada tela mostra só os produtos, categorias e estabelecimentos dela", () => {
  ambiente();
  const f = { precos: texto(tela("precos", "farmacia")), consumo: texto(tela("consumo", "farmacia")), comparar: texto(tela("comparar", "farmacia")) };
  for (const [v, t] of Object.entries(f)) { assert.ok(/Dipirona/.test(t) || v === "comparar" || /Farmácia/.test(t), v); assert.ok(!/Arroz|Pizza|Fralda/.test(t), v + ": nada de outras áreas"); }
  assert.ok(/Dipirona/.test(f.precos)); assert.ok(/Farmácia/.test(f.consumo) && !/Mercearia/.test(f.consumo), "categorias só da área"); assert.ok(!/Mercearia|Automotivo/.test(f.comparar.replace(/^Todas as áreas.*?Delivery /, "")), "o comparador só lista categorias da área (fora o próprio seletor de áreas)");
  const d = texto(tela("precos", "delivery")); assert.ok(/Pizza grande/.test(d) && !/Arroz|Dipirona|Fralda/.test(d));
  const m = texto(tela("precos", "mercado")); assert.ok(/Arroz/.test(m) && !/Dipirona|Pizza/.test(m));
  assert.equal(N.arAreaDe(N.arConfig(null), "Farmácia"), "farmacia");
});
test("o seletor troca a área e zera o que era da área anterior; dono e casa veem o mesmo; só leitura", () => {
  ambiente(); const b = tela("precos", ""); const sel = achar(b, (e) => e.tag === "div" && e.attrs["aria-label"] === "Área de consumo")[0];
  T.st.prod = "x"; T.st.pmes = "2026-11"; T.st.c = { per: "tudo" }; T.st.cmp = { atalho: "mes" };
  const fa = achar(sel, (e) => e.tag === "button" && texto(e) === "Farmácia")[0]; assert.equal(fa.attrs["aria-pressed"], "false"); const antes = RAIZ.children; void antes;
  try { fa.onclick(); } catch (e) { /* repinta usa o root da página: o que importa é o estado */ }
  assert.equal(T.st.areaT, "farmacia"); assert.deepEqual([T.st.prod, T.st.pmes, T.st.c, T.st.cmp], [null, "", null, null]);
  const d = texto(tela("precos", "farmacia")), c = (ambiente(false), texto(tela("precos", "farmacia"))); assert.equal(c, d);
  const m = ler("mercado.js"), i0 = m.indexOf("function seletorAreaTela"), i1 = m.indexOf("function produtos(rs)"); assert.ok(!/\.(insert|update|delete|upsert|rpc)\(|pessoalGravar|sb\.from\(/.test(m.slice(i0, i1)), "só leitura");
});
