// Lote A · passo 1 (docs/central-areas.md, "Lote A · desenho"): regressão do Painel do Mercado. A saída de hoje (só notas, só categorias do Mercado) fica
// gravada em tests/fixtures/areas/painel_mercado_antes.json; o motor novo (mesmo painel para todas as áreas, linhas vindas das compras unificadas) tem de gerar o MESMO texto.
// Mudanças de tela pedidas depois da gravação (só estas): quadro de barra aberta ganha o link "Abrir a categoria/o estabelecimento" no lugar do botão "Analisar a categoria"; a compra aberta mostra o detalhe unificado (cenário à parte abaixo).
// Para regravar a referência (só quando a mudança de tela for pedida): UPDATE_GOLDEN=1 node --test tests/painel_molde.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

class El {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.style = {}; this.value = ""; this.hidden = false; this.classList = { add() {}, remove() {}, toggle() {} }; }
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
const NB = new RegExp(String.fromCharCode(160), "g");
const texto = (e) => (e == null ? "" : e.text !== undefined ? e.text : (e.children || []).map(texto).join(" ")).replace(NB, " ").replace(/\s+/g, " ").trim();
const achar = (e, f, acc = []) => { if (e && e.children) { if (f(e)) acc.push(e); e.children.forEach((c) => achar(c, f, acc)); } return acc; };

let n = 0;
const L = (data, mercado, numero, produto, categoria, qtd, un, vu, extra = {}) => ({ id: "i" + ++n, data, mk: data.slice(0, 7), mercado, numero, forma_pagamento: extra.pg || "Crédito", categoria, subcategoria: null, descricao: produto, produto, produto_id: "p" + produto,
  quantidade: qtd, unidade: un, valor_unitario: vu, valor_total: Math.round(qtd * vu * 100) / 100 - (extra.desconto || 0), desconto: extra.desconto || 0, nota: data + "|" + mercado + "|" + numero });
export const ROWS = [
  L("2026-09-12", "Tauste (Sorocaba)", "10", "Arroz", "Mercearia", 2, "un", 22.5), L("2026-09-12", "Tauste (Sorocaba)", "10", "Sabão em pó", "Limpeza", 1, "un", 18.9),
  L("2026-10-03", "Tauste (Sorocaba)", "20", "Arroz", "Mercearia", 1, "un", 24), L("2026-10-03", "Tauste (Sorocaba)", "20", "Pão francês", "Padaria", 0.6, "kg", 18, { desconto: 1 }),
  L("2026-10-09", "Confiança (Sorocaba)", "21", "Refrigerante", "Bebidas", 3, "un", 8.5), L("2026-10-09", "Confiança (Sorocaba)", "21", "Feijão", "Mercearia", 2, "un", 9.9, { pg: "Pix" }),
  L("2026-11-03", "Tauste (Sorocaba)", "30", "Arroz", "Mercearia", 1, "un", 25.5), L("2026-11-03", "Tauste (Sorocaba)", "30", "Sabão em pó", "Limpeza", 1, "un", 19.9), L("2026-11-03", "Tauste (Sorocaba)", "30", "Pão francês", "Padaria", 0.45, "kg", 18, { desconto: 0.5 }),
  L("2026-11-08", "Confiança (Sorocaba)", "31", "Feijão", "Mercearia", 3, "un", 9.9), L("2026-11-08", "Confiança (Sorocaba)", "31", "Refrigerante", "Bebidas", 2, "un", 8.9),
];
const GOLDEN = new URL("./fixtures/areas/painel_mercado_antes.json", import.meta.url);

/* cenários: o estado do Painel (mês, quadro aberto, compra aberta, barra escolhida) e o texto que a tela mostra */
const CENARIOS = {
  padrao: {}, mes_anterior: { mes: "2026-10" }, quadro_mes: { kpi: "mes" }, quadro_total: { kpi: "total" },
  barra_mercado: { pick: { mes: "2026-11", tipo: "mercado", valor: "Tauste" } }, barra_categoria: { pick: { mes: "2026-11", tipo: "categoria", valor: "Mercearia" } },
};
export function renderPainel(estado, ambiente = {}) {
  globalThis.isOwner = () => true; globalThis.isDonoOuCasa = () => true; globalThis.PESSOAL = {};
  T.hoje("2026-11-10"); T.usar(ROWS.map((r) => ({ ...r })), { id: "u1", email: "x@x" }); T.usarOnline([]);
  Object.assign(T.st, { mes: "2026-11", kpi: null, kpiNota: null, pick: null, voltarY: null }, estado);
  const b = new El("div"); (ambiente.ver || T.viewPainel)(b);
  return texto(b);
}
test("referência: o Painel do Mercado de hoje (só notas) fica gravado e o motor novo gera o mesmo texto em todos os cenários", () => {
  const atual = {}; for (const [k, e] of Object.entries(CENARIOS)) atual[k] = renderPainel(e);
  if (process.env.UPDATE_GOLDEN) { fs.writeFileSync(GOLDEN, JSON.stringify(atual, null, 1) + "\n"); return; }
  const ref = JSON.parse(fs.readFileSync(GOLDEN, "utf8"));
  assert.deepEqual(Object.keys(atual), Object.keys(ref));
  for (const k of Object.keys(ref)) assert.equal(atual[k], ref[k], "cenário " + k);
  assert.ok(/Gasto em novembro 2026/.test(ref.padrao) && /O que mais pesou/.test(ref.padrao) && /Mês a mês/.test(ref.padrao), "a referência tem o painel completo");
});

test("compra aberta no painel: mostra o detalhe unificado (itens com categoria, a conta, o canal e o botão de abrir a nota) em vez de apagar a nota por aqui", () => {
  const t = renderPainel({ kpi: "mes", kpiNota: "nota:2026-11-08|Confiança (Sorocaba)|31" });
  assert.ok(/Confiança · 08\/11\/2026/.test(t) && /Feijão/.test(t) && /Mercearia/.test(t), "a compra e os itens");
  assert.ok(/Valor pago/.test(t) && /Itens R\$ 47,50/.test(t) && /Canal: Presencial/.test(t), "a conta e o canal");
  assert.ok(/Abrir a nota em Notas/.test(t) && !/Apagar esta nota/.test(t), "a nota se abre em Notas (onde se edita e apaga), nunca apagada por um painel que pode mostrar só parte dela");
});
