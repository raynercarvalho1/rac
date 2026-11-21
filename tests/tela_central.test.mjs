// Lote F (docs/central-areas.md, "Lote F"): a Central e os painéis mostram primeiro o que importa (últimas compras e números), com filtros logo abaixo e as análises longas recolhidas;
// cabeçalho curto; + Adicionar nota abre a leitura que funciona (Central Fiscal). Telas com DOM falso; sem rede e sem banco.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

class El {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.style = {}; this.value = ""; this.hidden = false; this.classList = { add() {}, remove() {}, toggle() {} }; this.options = [{ hidden: false }]; this.className = ""; }
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
const ROWS = [L("2026-11-01", "Tauste (Sorocaba)", "1", "Arroz", "Mercearia", 40), L("2026-11-03", "Confiança (Sorocaba)", "2", "Feijão", "Mercearia", 30), L("2026-11-06", "Tauste (Sorocaba)", "3", "Sabão", "Limpeza", 12.5),
  L("2026-11-08", "Raia Drogasil (Sorocaba)", "4", "Dipirona", "Farmácia", 22.9), L("2026-11-09", "Confiança (Sorocaba)", "5", "Leite", "Mercearia", 8)];
function ambiente(dono = true) {
  globalThis.isOwner = () => dono; globalThis.isDonoOuCasa = () => true; globalThis.PESSOAL = {};
  T.hoje("2026-11-10"); T.usar(JSON.parse(JSON.stringify(ROWS)), { id: "u1", email: "x@x" }); T.usarOnline(Object.assign([], { pedidos: [] }));
  Object.assign(T.CU, { per: "2026-11", canal: "", estab: "", cat: "" }); Object.assign(T.PN, { area: "", cab: true, rota: "central", arg: "" }); Object.assign(T.st, { mes: "2026-11", kpi: null, kpiNota: null, pick: null });
}
const central = () => { const b = new El("div"); T.viewCentral(b); return b; };

test("a ordem da página: últimas compras, números do mês, período e filtros, depois os quadros; nada de análise longa antes dos números", () => {
  ambiente(); const t = texto(central()), i = (x) => t.indexOf(x);
  const ordem = ["Últimas compras", "Gasto em novembro 2026", "Compras no mês", "Itens comprados", "Todos os estabelecimentos", "Por área de consumo", "Por mercado", "Mês a mês", "Por categoria"];
  ordem.forEach((x) => assert.ok(i(x) >= 0, x)); for (let k = 1; k < ordem.length; k++) assert.ok(i(ordem[k - 1]) < i(ordem[k]), ordem[k - 1] + " antes de " + ordem[k]);
});
test("últimas compras: as 3 mais recentes em linhas curtas, a mais recente em destaque; tocar abre os itens", () => {
  ambiente(); const b = central(), lin = achar(b, (e) => e.tag === "button" && /\bmk-ultlin\b/.test(e.className));
  assert.equal(lin.length, 3); assert.ok(/\bdestaque\b/.test(lin[0].className) && !/destaque/.test(lin[1].className));
  assert.deepEqual(lin.map((l) => texto(l).split(" ")[0]), ["09/11/2026", "08/11/2026", "06/11/2026"], "da mais recente para a mais antiga");
  assert.ok(/Confiança/.test(texto(lin[0])) && /R\$ 8,00/.test(texto(lin[0])));
  assert.equal(lin[0].attrs["aria-expanded"], "false"); lin[0].onclick(); assert.equal(lin[0].attrs["aria-expanded"], "true", "toque abre");
});
test("blocos recolhidos: O que mais pesou, Explorar, Oportunidades, Preços que mais mudaram e Comparar períodos; Por mercado, Mês a mês e Por categoria ficam abertos", () => {
  ambiente(); const b = central(), rec = achar(b, (e) => e.tag === "details" && /\bmknota\b/.test(e.className)).map((d) => texto(achar(d, (x) => x.tag === "summary")[0]));
  for (const x of ["O que mais pesou", "Explorar por categoria e estabelecimento", "Oportunidades de economia", "Preços que mais mudaram", "Comparar períodos", "Conferência dos totais"]) assert.ok(rec.some((r) => r.includes(x)), x + " recolhido");
  const dentro = (t) => achar(b, (e) => e.tag === "details").some((d) => texto(achar(d, (x) => x.tag === "summary")[0]).includes(t));
  for (const x of ["Por mercado", "Mês a mês", "Por categoria", "Por área de consumo"]) assert.ok(!dentro(x), x + " fica aberto"); assert.match(ler("index.html"), /#mercado \.mk-rec-um>\.panel>h2:first-child\{display:none\}/);
});
test("cabeçalho curto: dois botões de adicionar lado a lado, Sair na linha do título, faixa Outras áreas sem rótulo; + Adicionar nota abre a Central Fiscal", () => {
  ambiente(); T.drawApp("central"); const cab = achar(RAIZ, (e) => /\bmk-cab\b/.test(e.className))[0];
  const tit = achar(cab, (e) => /\bmk-tit\b/.test(e.className))[0], acoes = achar(cab, (e) => /\bmk-acoes\b/.test(e.className))[0];
  assert.ok(/Sair/.test(texto(tit)) && !/Sair/.test(texto(acoes)), "Sair fica na linha do título"); const bot = achar(acoes, (e) => e.tag === "a");
  assert.deepEqual(bot.map((a) => a.attrs.href), ["#fiscal", "#alimentacao/novo"]); assert.ok(/Adicionar nota/.test(texto(bot[0])) && /Adicionar pedido/.test(texto(bot[1])));
  assert.ok(!/Outras áreas/.test(texto(RAIZ)), "sem o rótulo da faixa"); assert.match(ler("index.html"), /@media \(max-width:640px\)\{#mercado \.mk-acoes \.mkadd\{flex:1 1 calc\(50% - 6px\)/);
  const m = ler("mercado.js"); assert.ok(!/painelFoto\(body\);/.test(m), "a página antiga \"Nota pela foto\" (demonstração) não é mais aberta"); T.drawApp("importar"); const i = texto(RAIZ); assert.ok(/Abrir a Central Fiscal/.test(i) && !/Nota pela foto/.test(i));
});
