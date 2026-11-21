// Lote B (docs/central-areas.md, "Lote B"): pedidos de delivery e restaurante viram a área Delivery da Central; a página Alimentação deixa de ser tela de consulta e fica só como entrada do pedido.
// Núcleo puro (NUCLEO.cuDeDelivery), telas com DOM falso (mercado.js) e o que o código garante por texto. Sem rede e sem banco.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { registro } from "./_rotas.mjs";

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
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const NB = new RegExp(String.fromCharCode(160), "g");
const texto = (e) => (e == null ? "" : e.text !== undefined ? e.text : (e.children || []).map(texto).join(" ")).replace(NB, " ").replace(/\s+/g, " ").trim();
const achar = (e, f, acc = []) => { if (e && e.children) { if (f(e)) acc.push(e); e.children.forEach((c) => achar(c, f, acc)); } return acc; };
const BRL = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v).replace(NB, " ");
const r2 = (x) => Math.round(x * 100) / 100;

let n = 0;
const L = (data, mercado, numero, produto, categoria, total) => ({ id: "i" + ++n, data, mk: data.slice(0, 7), mercado, numero, forma_pagamento: "Crédito", categoria, subcategoria: null, descricao: produto, produto, produto_id: "p" + n,
  quantidade: 1, unidade: "un", valor_unitario: total, valor_total: total, desconto: 0, nota: data + "|" + mercado + "|" + numero });
const ROWS = [L("2026-11-03", "Tauste (Sorocaba)", "100", "Arroz", "Mercearia", 40), L("2026-11-08", "Padaria Central (Sorocaba)", "200", "Pão", "Padaria", 44)];
const PEDIDOS = [
  { id: "p1", data: "2026-11-06", estabelecimento: "Pizzaria Bella", plataforma: "ifood", modo: "delivery", numero: "A1", pagamento: "Pix", subtotal: 60, taxa_entrega: 8, taxa_servico: 2, gorjeta: 5, desconto_loja: 0, desconto_plataforma: 10, total_pago: 65,
    itens: [{ descricao: "Pizza grande", qtd: 2, total: 60, desconto: 0 }] },
  { id: "p2", data: "2026-11-07", estabelecimento: "Cantina Nonna", plataforma: "direto", modo: "no_local", numero: null, pagamento: "Crédito", subtotal: 40, taxa_entrega: 0, taxa_servico: 0, gorjeta: 4, desconto_loja: 0, desconto_plataforma: 0, total_pago: 44,
    itens: [{ descricao: "Almoço executivo", qtd: 1, total: 40, desconto: 0 }] },
  { id: "p3", data: "2026-11-08", estabelecimento: "Padaria Central", plataforma: "99food", modo: "retirada", numero: "Z9", pagamento: "Pix", subtotal: 44, taxa_entrega: 0, taxa_servico: 0, gorjeta: 0, desconto_loja: 0, desconto_plataforma: 0, total_pago: 44,
    itens: [{ descricao: "Pão", qtd: 1, total: 44, desconto: 0 }] },   // mesma data e valor da nota da padaria: possível duplicidade (os dois somam; a tela avisa)
  { id: "p4", data: "2026-11-09", estabelecimento: "Sem valor", plataforma: "ifood", modo: "delivery", total_pago: null, itens: [] },
];
function ambiente({ dono = true, pedidos = PEDIDOS } = {}) {
  globalThis.isOwner = () => dono; globalThis.isDonoOuCasa = () => true; globalThis.PESSOAL = {};
  T.hoje("2026-11-10"); T.usar(JSON.parse(JSON.stringify(ROWS)), { id: "u1", email: "x@x" });
  const lista = []; lista.pedidos = JSON.parse(JSON.stringify(pedidos)); T.usarOnline(lista);
  Object.assign(T.CU, { per: "2026-11", canal: "", estab: "", cat: "", aberta: null, todas: false, sel: null }); Object.assign(T.PN, { area: "mercado", cab: false, rota: "painel", arg: "", areaAnt: undefined }); Object.assign(T.st, { mes: "2026-11", kpi: null, kpiNota: null, pick: null });
}
function painelArea(id) { Object.assign(T.PN, { area: id, cab: true, rota: "area", arg: id }); const b = new El("div"); T.viewPainel(b); return b; }

test("cuDeDelivery: valor = total pago; itens por categoria (Delivery × Restaurante); taxas, gorjeta e descontos são ajustes, nunca rateados", () => {
  const D = N.cuDeDelivery(PEDIDOS), c1 = D.compras.find((c) => c.chave === "p1"), c2 = D.compras.find((c) => c.chave === "p2"), c3 = D.compras.find((c) => c.chave === "p3");
  assert.equal(D.compras.length, 3, "o pedido sem valor não vira compra"); assert.deepEqual(D.fora, { delivery_sem_valor: { n: 1, valor: 0 } });
  assert.deepEqual([c1.fonte, c1.valor, c1.canal, c1.estabelecimento, c1.vendedor, c1.emissor], ["delivery", 65, "online", "iFood", "Pizzaria Bella", "Pizzaria Bella"], "app: canal online, estabelecimento = plataforma");
  assert.deepEqual(c1.itens.map((i) => [i.nome, i.valor, i.categoria]), [["Pizza grande", 60, "Delivery"]]);
  assert.deepEqual([c1.aj.frete, c1.aj.taxas, c1.aj.gorjeta, c1.aj.desconto_geral, c1.aj.outros, c1.aj.total, c1.ajustes], [8, 2, 5, -10, 0, 5, 5], "a conta: itens 60 + 8 + 2 + 5 − 10 = 65");
  assert.equal(r2(c1.itens.reduce((s, i) => s + i.valor, 0) + c1.ajustes), c1.valor, "itens + ajustes = valor pago");
  assert.deepEqual([c2.canal, c2.estabelecimento, c2.itens[0].categoria, c2.ajustes], ["presencial", "Cantina Nonna", "Restaurante", 4], "no local: presencial, categoria Restaurante, gorjeta como ajuste");
  assert.deepEqual([c3.canal, c3.estabelecimento, c3.itens[0].categoria], ["online", "99Food", "Restaurante"], "retirada pelo app: restaurante (regra alModo), canal online");
  for (const c of D.compras) assert.equal(r2(c.itens.reduce((s, i) => s + i.valor, 0) + c.ajustes), c.valor, c.chave);
});
test("a área Delivery é de fábrica; Delivery e Restaurante vão para ela; ela só aparece na navegação quando tem dados", () => {
  const c = N.arConfig(null); assert.equal(N.arAreaDe(c, "Delivery"), "delivery"); assert.equal(N.arAreaDe(c, "Restaurante"), "delivery"); assert.equal(N.arAreaDe(c, "Mercearia"), "mercado");
  assert.ok(c.areas.find((a) => a.id === "delivery").ocultaVazia);
  const chips = () => achar(RAIZ, (e) => e.tag === "nav" && e.attrs["aria-label"] === "Central de Compras").flatMap((x) => achar(x, (e) => e.tag === "a").map(texto));
  ambiente(); T.drawApp("central"); assert.deepEqual(chips(), ["Central", "Mercado", "Automotivo", "Farmácia", "Bebê/Infantil", "Delivery"]);
  ambiente({ pedidos: [] }); T.drawApp("central"); assert.ok(!chips().includes("Delivery"), "sem pedidos a área não aparece (nunca vazia)");
});
test("a Central soma os pedidos de delivery uma vez; as áreas somam só itens; a conta fecha", () => {
  ambiente(); const D = T.centralDados(), cfg = N.arConfig(null);
  assert.equal(D.totais.delivery, r2(65 + 44 + 44), "os 3 pedidos válidos"); assert.equal(D.totais.total, r2(40 + 44 + 65 + 44 + 44));
  assert.ok(D.fora.delivery_sem_valor && D.fora.delivery_sem_valor.n === 1);
  const R = N.arResumo(D.compras, cfg, {}), C = N.cuResumo(N.cuFiltrar(D.compras, {}));
  assert.equal(R.total, C.total); assert.equal(R.ajustes, r2(5 + 4)); assert.equal(R.conferencia, 0);
  assert.equal(R.areas.find((a) => a.id === "delivery").total, r2(60 + 40 + 44), "só os itens dos pedidos (as taxas, a gorjeta e o desconto ficam nos ajustes)");
  assert.equal(R.areas.find((a) => a.id === "mercado").total, 40 + 44, "o Mercado não ganha nada do delivery");
  const dup = D.compras.find((c) => c.id === "delivery:p3"); assert.ok(dup.possivel_duplicata, "mesma data e valor de uma nota: aviso de possível duplicidade, os dois somam (regra da Central)");
  assert.equal(D.duplicidades.filter((d) => d.nivel === "provavel").length, 1);
});
test("painel Delivery: mesmo motor do Mercado, só com os pedidos; compra aberta mostra a conta com taxas, gorjeta e desconto e o link do pedido", () => {
  ambiente(); const t = texto(painelArea("delivery"));
  for (const x of ["Área de consumo", "Delivery", "Gasto em novembro 2026", "Por mercado", "Mês a mês", "Por categoria", "O que mais pesou", "Comparar períodos"]) assert.ok(t.includes(x), x);
  assert.ok(t.includes(BRL(60 + 40 + 44)) && /Pizza grande/.test(t) && /Almoço executivo/.test(t) && !/Arroz/.test(t), "só os itens dos pedidos");
  assert.ok(/iFood/.test(t) && /Cantina Nonna/.test(t) && /Delivery/.test(t) && /Restaurante/.test(t), "plataforma e restaurante");
  Object.assign(T.st, { kpi: "mes", kpiNota: "delivery:p1" }); const a = texto(painelArea("delivery"));
  assert.ok(/Soma dos itens desta área/.test(a) && a.includes("o valor pago no total foi " + BRL(65)), "no painel da área: só os itens; o valor pago total é dito, sem ratear taxas");
  const cc = new El("div"); T.viewCentral(cc); const tcc = texto(cc);
  assert.ok(/Frete/.test(tcc) && /Taxas/.test(tcc) && /Gorjeta/.test(tcc) && /Desconto do pedido/.test(tcc) && /Valor pago/.test(tcc) && tcc.includes(BRL(65)), "na Central, a conta completa do pedido");
  const link = achar(RAIZ, () => false); const b = painelArea("delivery"); const ln = achar(b, (e) => e.tag === "a" && /#alimentacao\/pedido\/p1/.test(e.attrs.href || ""));
  assert.equal(ln.length, 1, "link para ver, editar ou apagar o pedido"); void link;
  const m = texto(painelArea("mercado")); assert.ok(!/Pizza|Almoço/.test(m), "o painel Mercado não mostra delivery");
  const c = new El("div"); T.viewCentral(c); const tc = texto(c); assert.ok(tc.includes(BRL(40 + 44 + 65 + 44 + 44)) && /Delivery/.test(tc) && /delivery/.test(tc), "a Central soma tudo");
});
test("a Fernanda (casa) vê e usa o painel Delivery e o botão + Adicionar pedido igual ao dono", () => {
  const vistas = (dono) => { ambiente({ dono }); T.drawApp("area", "delivery"); const r = texto(RAIZ); return { r, add: achar(RAIZ, (e) => e.tag === "a" && e.attrs.href === "#alimentacao/novo").length, nota: achar(RAIZ, (e) => e.tag === "a" && e.attrs.href === "#fiscal").length }; };
  const d = vistas(true), c = vistas(false); assert.deepEqual(c, d); assert.equal(d.add, 1); assert.equal(d.nota, 1); assert.ok(/Adicionar pedido/.test(d.r) && /Adicionar nota/.test(d.r) && /Área de consumo/.test(d.r));
});
test("página Alimentação: só a entrada do pedido (novo, editar, ver); o resto abre o painel Delivery; menu, links e dados", () => {
  const js = ler("js/alimentacao.js");
  assert.match(js, /if\(sub!=="novo"&&sub!=="editar"&&sub!=="pedido"\)\{location\.replace\("#mercado\/area\/delivery"\);return\}/);
  for (const f of ["aliResumo", "aliLista", "aliPrecos", "alimentacao_gastos"]) assert.ok(!js.includes(f), f + " saiu");
  assert.ok((js.match(/location\.hash="#mercado\/area\/delivery"/g) || []).length >= 3, "salvar e apagar voltam ao painel Delivery"); assert.ok(!/#alimentacao\/pedidos/.test(js));
  assert.match(js, /SB\.rpc\("pedido_salvar"/, "a gravação (versões, duplicidade, fotos) é a de sempre"); assert.match(js, /\.from\("pedidos"\)\.delete\(\)/, "apagar continua com confirmação");
  assert.match(js, /RACmercado\.esquecerOnline/, "depois de gravar, o painel Delivery lê de novo");
  const RT = registro(); assert.ok(RT.DA_CASA.includes("alimentacao") && !RT.menu.includes('href="#alimentacao"'), "a rota existe para a casa e o dono, sem item no menu");
  assert.match(ler("js/painel.js"), /href:"#mercado\/area\/delivery"/); assert.match(ler("js/hoje.js"), /alimentacao:"#mercado\/area\/delivery"/);
  const m = ler("mercado.js"), i0 = m.indexOf("function lerPedidos"), i1 = m.indexOf("function assOnlineDe"); const b = m.slice(i0, i1);
  assert.ok(/\.from\("pedidos"\)\.select\(/.test(b) && !/\.(insert|update|delete|upsert|rpc)\(/.test(b), "a Central só LÊ os pedidos");
  for (const f of ["supabase/024_alimentacao.sql", "supabase/027_pedido_salvar.sql"]) assert.ok(fs.existsSync(new URL("../" + f, import.meta.url)), "tabelas e função intactas: " + f);
  assert.ok(N.SEG_TABELAS.some((x) => x.t === "pedidos" || x === "pedidos" || x.nome === "pedidos"), "pedidos continuam no backup");
});
