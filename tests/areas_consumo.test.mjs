// Áreas de consumo (docs/central-areas.md): cada item numa única área; painéis por área; Central = soma de tudo; gestão de categorias; persistência e a casa.
// Núcleo puro (NUCLEO.ar*), telas com DOM falso (mercado.js) e o trecho real do js/app.js (pessoalGravar/pessoalCarregar) com um Supabase falso. Sem rede e sem banco real.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
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
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const NB = new RegExp(String.fromCharCode(160), "g");
const texto = (e) => (e == null ? "" : e.text !== undefined ? e.text : (e.children || []).map(texto).join(" ")).replace(NB, " ");
const achar = (e, f, acc = []) => { if (e && e.children) { if (f(e)) acc.push(e); e.children.forEach((c) => achar(c, f, acc)); } return acc; };
const BRL = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v).replace(NB, " ");
const r2 = (x) => Math.round(x * 100) / 100;

let n = 0;
const L = (data, mercado, numero, produto, categoria, total) => ({ id: "i" + ++n, data, mk: data.slice(0, 7), mercado, numero, forma_pagamento: "Crédito", categoria, subcategoria: null, descricao: produto, produto, produto_id: "p" + n,
  quantidade: 1, unidade: "un", valor_unitario: total, valor_total: total, desconto: 0, nota: data + "|" + mercado + "|" + numero });
const ROWS = [
  L("2026-11-03", "Tauste (Sorocaba)", "100", "Arroz", "Mercearia", 40), L("2026-11-03", "Tauste (Sorocaba)", "100", "Sabão", "Limpeza", 12.5),
  L("2026-11-03", "Tauste (Sorocaba)", "100", "Fralda M", "Bebê/Infantil", 55), L("2026-11-03", "Tauste (Sorocaba)", "100", "Carregador", "Tecnologia", 30),
  L("2026-11-06", "Raia Drogasil (Sorocaba)", "200", "Dipirona 500mg", "Farmácia", 22.9), L("2026-11-06", "Raia Drogasil (Sorocaba)", "200", "Ondansetrona", "Farmácia", 547.09),
  L("2026-11-08", "Posto Auto Peças", "300", "Cortina solar", "Automotivo", 19.9),
  L("2026-11-09", "Confiança (Sorocaba)", "555", "Feijão", "Mercearia", 30),
  L("2026-10-05", "Tauste (Sorocaba)", "90", "Arroz", "Mercearia", 38), L("2026-10-07", "Raia Drogasil (Sorocaba)", "91", "Paracetamol 750mg", "Farmácia", 15),
];
const ONL = [
  { id: "o1", data: "2026-11-02", loja: "amazon", numero: "111-1", subtotal: 110, desconto: 10, total_pago: 100, itens: [{ descricao: "Ração Golden", qtd: 2, total: 110, desconto: 8, categoria: "Pet" }] },
  { id: "o3", data: "2026-11-05", loja: "amazon", numero: "111-3", subtotal: 100, frete: 15, total_pago: 115, itens: [{ descricao: "Fralda G", qtd: 1, total: 60, categoria: "Bebê" }, { descricao: "Vitamina C", qtd: 1, total: 40, categoria: "Saúde e farmácia" }] },
  { id: "o4", data: "2026-11-07", loja: "amazon", numero: "111-4", subtotal: 30, total_pago: 30, itens: [{ descricao: "Organizador", qtd: 1, total: 30, categoria: "Casa" }] },
  { id: "o5", data: "2026-11-09", loja: "amazon", numero: "111-5", numero_nf: "555", subtotal: 30, total_pago: 30, itens: [{ descricao: "Feijão", qtd: 1, total: 30, categoria: "Alimentação" }] },   // mesma data, valor e NF da nota 555: já contada pela nota
  { id: "o6", data: "2026-11-09", loja: "amazon", numero: "111-6", subtotal: 77, total_pago: 77, fora_das_contas: true, itens: [{ descricao: "Pneu", qtd: 1, total: 77, categoria: "Veículos" }] },   // marcada como já contada em outro lugar
];
const NOTAS_EXTRA = ROWS.map((r) => ({ ...r }));
globalThis.window.RACnucleo = N;

function ambiente({ dono = true, pessoal = {} } = {}) {
  globalThis.isOwner = () => dono; globalThis.isDonoOuCasa = () => true; globalThis.PESSOAL = JSON.parse(JSON.stringify(pessoal));
  T.hoje("2026-11-10"); T.usar(JSON.parse(JSON.stringify(ROWS)), { id: "u1", email: "x@x" }); T.usarOnline(JSON.parse(JSON.stringify(ONL)));
  Object.assign(T.CU, { per: "2026-11", canal: "", estab: "", cat: "", aberta: null, todas: false, sel: null, area: "" }); Object.assign(T.PN, { area: "mercado", cab: false, rota: "painel", arg: "" }); Object.assign(T.st, { mes: null, kpi: null, kpiNota: null, pick: null });
}
/* o painel de uma área (mesmo motor da Central; docs/central-areas.md, Lote A) */
function painelArea(id) { Object.assign(T.PN, { area: id, cab: true, rota: "area", arg: id }); const b = new El("div"); T.viewPainel(b); return b; }
const unif = () => T.centralDados().compras;
const cfgPadrao = () => N.arConfig(null);
const nomesItens = (cs) => cs.flatMap((c) => c.itens.map((i) => i.nome));
const somaItens = (cs) => r2(cs.reduce((s, c) => s + c.itens.reduce((a, i) => a + i.valor, 0), 0));
const AREA = (id, cfg = cfgPadrao()) => N.arCompras(unif(), id, cfg);

// ---------- modelo: associações iniciais ----------
test("associações iniciais: as 13 categorias da lista oficial e nada além delas", () => {
  const c = cfgPadrao(), esperado = { Mercearia: "mercado", Padaria: "mercado", "Açougue/Frios": "mercado", Hortifruti: "mercado", "Chocolates/Doces": "mercado", Bebidas: "mercado", Limpeza: "mercado", "Higiene Pessoal": "mercado", Peixaria: "mercado",
    "Casa/Utilidades": "mercado", "Bebê/Infantil": "bebe", "Farmácia": "farmacia", Automotivo: "automotivo" };
  assert.deepEqual(N.AR_MAPA_PADRAO, esperado);
  Object.entries(esperado).forEach(([k, a]) => assert.equal(N.arAreaDe(c, k), a, k));
  for (const k of ["Tecnologia", "Saúde", "Vestuário", "Pet", "Alimentação", "Outros", "Sem categoria", "Compras online · Digital", "Livros e papelaria", "Presentes", "constructor", "__proto__"]) assert.equal(N.arAreaDe(c, k), "", k + " não é atribuída arbitrariamente");
  assert.deepEqual(c.areas.map((a) => a.id), ["mercado", "automotivo", "farmacia", "bebe"]);
  assert.equal(N.arAreaDe(c, "Veículos"), "automotivo", "o rótulo online Veículos já é Automotivo na leitura (cuCat)"); assert.equal(N.arAreaDe(c, "Bebê"), "bebe"); assert.equal(N.arAreaDe(c, "Casa"), "mercado");
});

// ---------- 1 a 4: cada área soma só os seus itens ----------
test("1 · Mercado não contabiliza Farmácia nem Automotivo", () => {
  ambiente();
  const m = AREA("mercado"), nomes = nomesItens(m);
  for (const x of ["Dipirona 500mg", "Ondansetrona", "Paracetamol 750mg", "Cortina solar", "Pneu"]) assert.ok(!nomes.includes(x), x);
  assert.ok(m.every((c) => Object.keys(c.categorias).every((k) => ["Mercearia", "Limpeza", "Casa/Utilidades"].includes(k))));
  assert.equal(somaItens(m), r2(40 + 12.5 + 30 + 38 + 30 /* Casa online */), "arroz, sabão, feijão (nota), arroz de outubro e o organizador; o feijão online (coberto pela nota) NÃO soma");
});
test("2 · Farmácia contabiliza exclusivamente sua área", () => {
  ambiente();
  const f = AREA("farmacia"); assert.deepEqual(nomesItens(f).sort(), ["Dipirona 500mg", "Ondansetrona", "Paracetamol 750mg"]);
  assert.equal(somaItens(f), r2(22.9 + 547.09 + 15)); assert.ok(f.every((c) => c.ajustes === 0 && Object.keys(c.categorias).join() === "Farmácia"));
});
test("3 · Automotivo contabiliza exclusivamente sua área (o pedido marcado como já contado em outro lugar não entra)", () => {
  ambiente();
  const a = AREA("automotivo"); assert.deepEqual(nomesItens(a), ["Cortina solar"]); assert.equal(somaItens(a), 19.9);
});
test("4 · Bebê/Infantil contabiliza exclusivamente sua área (nota e pedido online, pela categoria do item)", () => {
  ambiente();
  const b = AREA("bebe"); assert.deepEqual(nomesItens(b).sort(), ["Fralda G", "Fralda M"]); assert.equal(somaItens(b), 115);
  assert.equal(b.length, 2, "uma compra da nota e uma do pedido; a compra de 115 do pedido vale só os 60 do item de bebê: o frete de 15 fica fora");
  assert.equal(b.find((c) => c.fonte === "online").valor, 60); assert.equal(b.find((c) => c.fonte === "online").valor_compra, 115);
});

// ---------- 5 a 8: a Central e as regras financeiras ----------
test("5 · a Central é igual à soma das áreas + os não classificados + os ajustes (e cada parcela vem de cálculo independente)", () => {
  ambiente(); const cfg = cfgPadrao(), tudo = unif();
  for (const f of [{}, { de: "2026-11-01", ate: "2026-11-31" }, { canal: "online" }, { canal: "presencial", de: "2026-10-01", ate: "2026-10-31" }]) {
    const R = N.arResumo(tudo, cfg, f), C = N.cuResumo(N.cuFiltrar(tudo, f));
    assert.equal(R.total, C.total, "total da Central"); assert.equal(R.ajustes, C.ajustes, "ajustes iguais aos da Central");
    assert.equal(r2(R.areas.reduce((s, a) => s + a.total, 0) + R.semArea.total + R.ajustes), C.total); assert.equal(R.conferencia, 0);
    assert.equal(R.areas.reduce((s, a) => s + a.itens, 0) + R.semArea.itens, C.itens, "nenhum item a mais nem a menos");
  }
  const R = N.arResumo(tudo, cfg, { de: "2026-11-01", ate: "2026-11-31" });
  assert.equal(R.semArea.total, r2(30 + 102 + 40), "Tecnologia (30), Pet (102, o item líquido do desconto do próprio item) e Saúde (40) ainda não têm área e continuam na Central");
  assert.equal(R.ajustes, r2(-2 + 15), "desconto geral do pedido de ração (o que sobra além do desconto do item: −2) e frete (15): nenhum dos dois é de área");
  assert.equal(R.areas.find((a) => a.id === "farmacia").total, r2(22.9 + 547.09));
  const aMes = N.arResumo(tudo, cfg, { de: "2026-11-01", ate: "2026-11-31" }).total, viaCentral = N.cuResumo(N.cuFiltrar(tudo, { de: "2026-11-01", ate: "2026-11-31" })).total;
  assert.equal(aMes, viaCentral);
});
test("6 · nenhum item nem despesa aparece duas vezes: cada item está numa área só e o pedido coberto pela nota não entra", () => {
  ambiente(); const cfg = cfgPadrao(), tudo = unif();
  const ids = ["mercado", "automotivo", "farmacia", "bebe", ""].map((a) => N.arCompras(tudo, a, cfg));
  const chaves = ids.flatMap((cs) => cs.flatMap((c) => c.itens.map((i) => c.id + "|" + i.nome + "|" + i.valor)));
  assert.equal(new Set(chaves).size, chaves.length, "sem repetição entre as áreas e os não classificados");
  assert.equal(chaves.length, tudo.reduce((s, c) => s + c.itens.length, 0), "a união das áreas é exatamente o conjunto de itens da Central");
  assert.equal(tudo.filter((c) => c.id === "online:o5").length, 0, "o pedido o5 (mesma data, valor e NF da nota 555) já está na nota");
  assert.equal(nomesItens(tudo).filter((x) => x === "Feijão").length, 1);
});
test("7 · compras online e presenciais seguem as regras financeiras existentes: o que a Central exclui, nenhuma área soma", () => {
  ambiente(); const cfg = cfgPadrao(), tudo = unif(), D = T.centralDados();
  assert.ok(D.fora.fora_das_contas && D.fora.fora_das_contas.n === 1 && D.fora.coberta_por_nota && D.fora.coberta_por_nota.n === 1);
  const todas = ["mercado", "automotivo", "farmacia", "bebe", ""].flatMap((a) => N.arCompras(tudo, a, cfg));
  assert.ok(!todas.some((c) => c.id === "online:o6" || c.id === "online:o5"));
  const R = N.arResumo(tudo, cfg, {}), esperado = r2(ROWS.reduce((s, r) => s + r.valor_total, 0) + 100 + 115 + 30);   // notas + pedidos o1, o3, o4 (valor pago)
  assert.equal(R.total, esperado); assert.equal(D.totais.total, esperado, "mesmo total que a Central e que a regra de cada fonte");
});
test("8 · frete, taxas e descontos gerais nunca são atribuídos nem rateados entre áreas", () => {
  ambiente(); const cfg = cfgPadrao(), tudo = unif();
  ["mercado", "automotivo", "farmacia", "bebe", ""].forEach((a) => N.arCompras(tudo, a, cfg).forEach((c) => { assert.equal(c.ajustes, 0); assert.equal(c.aj, null); assert.equal(c.valor, r2(c.itens.reduce((s, i) => s + i.valor, 0)), "valor da compra na área = só a soma dos seus itens"); }));
  const o3 = tudo.find((c) => c.id === "online:o3"); assert.equal(o3.ajustes, 15); assert.equal(o3.valor, 115);
  assert.equal(N.arCompras(tudo, "bebe", cfg).find((c) => c.id === "online:o3").valor, 60, "bebê fica com os 60 do item, sem fatia do frete");
  assert.equal(N.arCompras(tudo, "", cfg).find((c) => c.id === "online:o3").valor, 40, "o item sem área também fica com o valor dele, sem fatia do frete");
  const R = N.arResumo(tudo, cfg, {}); assert.equal(R.ajustes, r2(-2 + 15));
});

// ---------- 9 a 11: alterar associações ----------
test("9 · alterar a área de uma categoria atualiza os painéis sem alterar nenhum registro original", () => {
  ambiente(); const antes = JSON.stringify([T.centralDados().compras, JSON.parse(JSON.stringify(ROWS)), ONL]), cfg0 = cfgPadrao();
  const r = N.arAssociar(cfg0, "Higiene Pessoal", "farmacia"); assert.ok(r.ok);
  const r2c = N.arAssociar(cfg0, "Tecnologia", "mercado"); assert.ok(r2c.ok);
  const cfg1 = N.arAssociar(N.arAssociar(cfg0, "Limpeza", "farmacia").cfg, "Tecnologia", "mercado").cfg;
  assert.equal(somaItens(N.arCompras(unif(), "mercado", cfg1)), r2(40 + 30 + 38 + 30 + 30), "Limpeza saiu do Mercado e Tecnologia entrou");
  assert.equal(somaItens(N.arCompras(unif(), "farmacia", cfg1)), r2(22.9 + 547.09 + 15 + 12.5));
  assert.equal(N.arResumo(unif(), cfg1, {}).total, N.arResumo(unif(), cfg0, {}).total, "a Central não muda quando a classificação muda");
  assert.equal(JSON.stringify([T.centralDados().compras, ROWS.map((x) => ({ ...x })), ONL]).length > 0, true);
  assert.equal(JSON.stringify([T.centralDados().compras, JSON.parse(JSON.stringify(ROWS)), ONL]), antes, "compras, itens, notas e pedidos idênticos");
  assert.deepEqual(N.arRaw(N.arAssociar(cfg0, "Limpeza", "mercado").cfg).associacoes, {}, "voltar ao padrão não deixa resto");
  assert.deepEqual(N.arRaw(cfg1).associacoes, { Limpeza: "farmacia", Tecnologia: "mercado" }, "só as mudanças do dono são gravadas");
});
test("10 · categorias personalizadas e áreas novas funcionam (criar, usar, remover sem perder item)", () => {
  ambiente(); let c = cfgPadrao(), tudo = unif();
  const a = N.arAreaCriar(c, "Pet shop"); assert.ok(a.ok); assert.equal(a.area, "pet-shop"); c = a.cfg;
  assert.equal(N.arAreaCriar(c, " pet SHOP ").ok, false, "nome repetido"); assert.equal(N.arAreaCriar(c, "<b>").ok, false); assert.equal(N.arAreaCriar(c, "").ok, false);
  c = N.arAssociar(c, "Pet", "pet-shop").cfg;
  assert.equal(somaItens(N.arCompras(tudo, "pet-shop", c)), 102, "a ração: valor líquido do item (110 − 8 do próprio item); o desconto geral do pedido não é rateado");
  assert.equal(N.arResumo(tudo, c, {}).total, N.arResumo(tudo, cfgPadrao(), {}).total);
  const cc = N.arCategoriaCriar(c, "Brinquedos", "bebe"); assert.ok(cc.ok); c = cc.cfg; assert.equal(N.arAreaDe(c, "brinquedos"), "bebe"); assert.equal(N.arCategoriaCriar(c, "brinquedos", "").ok, false, "já existe"); assert.equal(N.arCategoriaCriar(c, "Farmácia", "").ok, false);
  assert.equal(N.arCategoriaRemover(c, "Farmácia").ok, false, "só as suas");
  const raw = JSON.parse(JSON.stringify(N.arRaw(c))), c2 = N.arConfig(raw); assert.deepEqual(N.arRaw(c2), raw, "ida e volta da gravação");
  assert.equal(N.arAreaRemover(c2, "mercado").ok, false, "as áreas de fábrica ficam");
  const sem = N.arAreaRemover(c2, "pet-shop"); assert.ok(sem.ok); assert.equal(N.arAreaDe(sem.cfg, "Pet"), "", "a categoria fica sem área");
  assert.equal(N.arResumo(tudo, sem.cfg, {}).total, N.arResumo(tudo, cfgPadrao(), {}).total, "remover a área não apaga nada");
  assert.ok(N.arResumo(tudo, sem.cfg, {}).semArea.categorias.some((x) => x.categoria === "Pet"));
  assert.equal(N.arCategoriaRemover(c2, "Brinquedos").ok, true);
});
test("10b · a configuração gravada é validada na leitura (lixo, área inexistente, nomes repetidos, chaves perigosas)", () => {
  const c = N.arConfig({ v: 1, areas: [{ id: "ok", nome: "Casa nova" }, { id: "ok", nome: "Repetida" }, { id: "Ruim Id", nome: "x" }, { id: "mercado", nome: "Outro" }, { id: "a2", nome: "casa NOVA" }, null, 5],
    associacoes: { Tecnologia: "nao-existe", Pet: "ok", "__proto__": "ok", "": "ok", "<x>": "ok" }, categorias: ["Pet", "Mercearia", "<b>", 7, "Pet"] });
  assert.deepEqual(c.areas.filter((a) => a.propria).map((a) => a.id), ["ok"]); assert.equal(N.arAreaDe(c, "Tecnologia"), ""); assert.equal(N.arAreaDe(c, "Pet"), "ok");
  assert.deepEqual(c.personalizadas, ["Pet"]); assert.equal(({}).polluted, undefined);
  for (const lixo of [null, undefined, 5, "x", [], { areas: "x", associacoes: [], categorias: {} }]) assert.deepEqual(N.arConfig(lixo).areas.length, 4);
});
test("11 · categorias sem associação não desaparecem: ficam como não classificadas, na Central e na gestão", () => {
  ambiente(); const cfg = cfgPadrao(), tudo = unif(), lista = N.arCategorias(cfg, tudo);
  const semArea = lista.filter((x) => x.semArea && x.itens).map((x) => x.categoria).sort(); assert.deepEqual(semArea, ["Pet", "Saúde", "Tecnologia"]);
  assert.ok(lista.slice(0, 3).every((x) => x.semArea), "as sem área vêm primeiro"); assert.ok(lista.some((x) => x.categoria === "Vestuário" && x.semArea && !x.itens), "as sugeridas sem uso também aparecem");
  const nc = N.arCompras(tudo, "", cfg); assert.equal(somaItens(nc), 172); assert.ok(lista.find((x) => x.categoria === "Pet").explicacao.includes("não classificados"));
  assert.match(lista.find((x) => x.categoria === "Farmácia").explicacao, /painel Farmácia e na Central/);
  assert.equal(lista.filter((x) => x.categoria === "Mercearia").length, 1);
});

// ---------- telas ----------
test("14 · os painéis, gráficos, filtros e a evolução respeitam a área selecionada", () => {
  ambiente({ pessoal: {} });
  const t = texto(painelArea("farmacia"));
  assert.ok(/Área de consumo/.test(t) && /Farmácia/.test(t)); assert.ok(t.includes(BRL(22.9 + 547.09)), "gasto do mês só da Farmácia");
  assert.ok(/Raia Drogasil/.test(t) && !/Tauste/.test(t) && !/Cortina|Arroz|Amazon/.test(t), "estabelecimentos e produtos só da área");
  assert.ok(!/Automotivo|Mercearia/.test(t.replace(/Gerenciar categorias e áreas/, "")), "o painel não lista categorias de outras áreas");
  const b2 = painelArea("farmacia"); const selects = achar(b2, (e) => e.tag === "select"), opcs = selects.flatMap((s) => achar(s, (e) => e.tag === "option").map(texto));
  assert.ok(opcs.includes("Raia Drogasil") && !opcs.includes("Tauste") && opcs.includes("Farmácia") && !opcs.includes("Mercearia"), "filtros de estabelecimento e categoria só com o que é da área");
  const E = N.cmPorMes(AREA("farmacia"), {}, "2026-11", 12); assert.equal(E.total, r2(22.9 + 547.09 + 15)); assert.equal(E.meses.find((m) => m.mes === "2026-10").total, 15, "a evolução mensal da área");
  const cmp = N.cuComparar(AREA("farmacia"), {}, "2026-11", "2026-11-10"); assert.equal(cmp.atual.total, r2(22.9 + 547.09)); assert.equal(cmp.anterior.total, 15, "comparação com o período anterior na área");
  const tm = texto(painelArea("mercado"));
  assert.ok(!/Dipirona|Ondansetrona|Drogasil|Cortina/.test(tm), "o painel Mercado não mostra Farmácia nem Automotivo nos indicadores, categorias, estabelecimentos e produtos");
  assert.ok(/Essa área não existe/.test(texto(painelArea("inexistente"))));
  ambiente(); const bc = new El("div"); T.viewCentral(bc); const tc = texto(bc);
  assert.ok(/Por área de consumo/.test(tc) && /Não classificados/.test(tc) && /Farmácia/.test(tc) && /Automotivo/.test(tc), "a Central mostra todas as áreas e a participação delas");
  assert.ok(tc.includes("Total da Central no período: " + BRL(40 + 12.5 + 55 + 30 + 22.9 + 547.09 + 19.9 + 30 + 100 + 115 + 30)), "a Central soma tudo, uma vez");
});
test("Painel do Mercado (motor único) só soma a área Mercado, notas e pedidos online; a gestão mostra as sem área primeiro", () => {
  ambiente(); T.st.mes = "2026-11"; T.st.kpi = "mes"; T.st.pick = null;
  const p = new El("div"); T.viewPainel(p); const t = texto(p);
  assert.ok(!/Dipirona|Ondansetrona|Cortina|Drogasil/.test(t), "sem Farmácia nem Automotivo no Painel do Mercado"); assert.ok(/Gasto em novembro 2026/.test(t), "o painel abre no mês e mostra os indicadores do molde");
  assert.ok(T.linhasPainel().every((x) => ["Mercearia", "Limpeza", "Casa/Utilidades"].includes(x.categoria)) && T.linhasPainel().length === 5, "4 itens de notas + 1 do pedido online (Casa → Mercado)");
  const g = new El("div"); T.viewCategorias(g); const tg = texto(g);
  assert.ok(/Gestão de categorias/.test(tg) && /Sem área/.test(tg) && /Tecnologia/.test(tg) && /Pet/.test(tg) && /notas, pedidos, itens e valores não são alterados/.test(tg));
  assert.ok(tg.indexOf("Tecnologia") < tg.indexOf("Mercearia"), "as sem área aparecem antes das classificadas");
  assert.ok(achar(g, (e) => e.tag === "select").length >= 14, "um seletor de área por categoria"); assert.ok(/Criar categoria/.test(tg) && /Criar área/.test(tg));
});
test("a gestão grava só PESSOAL[mercado-areas] (pela camada pessoalGravar) e redesenha; nada mais é gravado", () => {
  ambiente(); const grav = []; globalThis.pessoalGravar = (k, v, cb) => { grav.push([k, JSON.parse(JSON.stringify(v))]); globalThis.PESSOAL[k] = v; cb && cb(""); };
  try {
    const g = new El("div"); T.viewCategorias(g);
    const sel = achar(g, (e) => e.tag === "select" && e.attrs["aria-label"] === "Área de Tecnologia")[0]; assert.ok(sel); sel.value = "mercado"; sel.onchange();
    assert.deepEqual(grav, [["mercado-areas", { v: 1, areas: [], associacoes: { Tecnologia: "mercado" }, categorias: [] }]]);
    assert.equal(N.arAreaDe(T.areaCfg(), "Tecnologia"), "mercado", "a mudança vale na próxima leitura (PESSOAL atualizado)");
  } finally { delete globalThis.pessoalGravar; }
  const m = ler("mercado.js"), i0 = m.indexOf("function viewCategorias"), i1 = m.indexOf("function adc(pai, filho)"); const b = m.slice(i0, i1);
  assert.ok(!/\.(insert|update|delete|upsert|rpc)\(|functions\.invoke|racIA|sb\.from\(/.test(b), "a gestão não toca nota, pedido nem item");
});

// ---------- 12: persistência entre sessões e aparelhos ----------
const app = ler("js/app.js"), ini = app.indexOf("var PAPEL=null,"), fim = app.indexOf("/* O que estava guardado só no navegador"), TRECHO = app.slice(ini, fim);
const ESPERA = () => new Promise((r) => setImmediate(r));
const D = "dono-uid", F = "fernanda-uid", T0 = "2026-11-20T10:00:00.000Z";
function montar({ papel, linhas: base }) {
  const linhas = base.map((l) => ({ ...l })), filtros = [], upserts = [], msgs = [], ls = {};
  const SB = { from(t) { assert.equal(t, "pessoal"); const f = []; const b = {
    select() { return b; }, eq(c, v) { f.push(["eq", c, v]); filtros.push(["eq", c, v]); return b; }, in(c, v) { f.push(["in", c, v]); filtros.push(["in", c, v]); return b; },
    then(ok, er) { const d = linhas.filter((l) => f.every(([k, c, v]) => (k === "eq" ? l[c] === v : v.includes(l[c])))); return Promise.resolve({ data: d, error: null }).then(ok, er); },
    upsert(o) { upserts.push(o); linhas.push({ ...o, atualizado: T0 }); return Promise.resolve({ error: null }); } }; return b; } };
  const ctx = vm.createContext({ SB, console, Promise, Object, Array, JSON, Date, Math, String, Number, Error, isFinite, parseInt, setTimeout: (f) => { f(); return 1; }, clearTimeout() {},
    localStorage: { get length() { return Object.keys(ls).length; }, key: (i) => Object.keys(ls)[i], getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; } },
    SIS: { erros: [], conflitos: {}, falhaSinc: null, ultimaSinc: null, versao: {} }, syncSelo() {}, logErro() {}, hojeAoEntrar() {} });
  vm.runInContext(TRECHO + "\n;globalThis.__t={set:function(p,eu,dono,sb){PAPEL=p;EU=eu;DONO=dono;SB=sb;SEM_TABELA=false},P:function(){return PESSOAL}};", ctx);
  ctx.__t.set(papel, { id: papel === "casa" ? F : D }, D, SB);
  return { ctx, linhas, filtros, upserts, msgs, pronto: (m) => msgs.push(m) };
}
test("12 · a configuração persiste: gravada numa sessão, lida igual por outra sessão/aparelho (a conta é a fonte)", async () => {
  const s1 = montar({ papel: "dono", linhas: [] }); await s1.ctx.pessoalCarregar();
  let cfg = N.arAreaCriar(N.arConfig(null), "Pet shop").cfg; cfg = N.arAssociar(cfg, "Pet", "pet-shop").cfg; cfg = N.arAssociar(cfg, "Tecnologia", "mercado").cfg; cfg = N.arCategoriaCriar(cfg, "Brinquedos", "bebe").cfg;
  s1.ctx.pessoalGravar("mercado-areas", N.arRaw(cfg), s1.pronto); for (let i = 0; i < 5; i++) await ESPERA();
  assert.equal(s1.upserts.length, 1); assert.equal(s1.upserts[0].user_id, D); assert.equal(s1.upserts[0].chave, "mercado-areas"); assert.deepEqual(s1.msgs, [""], "salvou na conta");
  const s2 = montar({ papel: "dono", linhas: s1.linhas }); await s2.ctx.pessoalCarregar();   // outro aparelho: memória vazia, lê a conta
  const cfg2 = N.arConfig(JSON.parse(JSON.stringify(s2.ctx.__t.P()["mercado-areas"])));
  assert.deepEqual(N.arRaw(cfg2), N.arRaw(cfg)); assert.equal(N.arAreaDe(cfg2, "Pet"), "pet-shop"); assert.equal(N.arAreaDe(cfg2, "Brinquedos"), "bebe");
  ambiente({ pessoal: { "mercado-areas": N.arRaw(cfg) } }); assert.equal(N.arAreaDe(T.areaCfg(), "Tecnologia"), "mercado", "a tela usa a configuração da conta");
  assert.match(ler("mercado.js"), /pessoalGravar\("mercado-areas"/); assert.ok(!/localStorage/.test(ler("mercado.js").slice(ler("mercado.js").indexOf("function areaCfg"), ler("mercado.js").indexOf("function areaContexto"))), "nada só no aparelho");
});

// ---------- 13: a Fernanda (casa) tem as mesmas operações e a mesma configuração do dono (correção de regra de 20/11/2026) ----------
const LINHA_AREAS = (valor) => ({ user_id: D, chave: "mercado-areas", valor, atualizado: T0 });
function telaDe(papel) {   // a mesma sequência de operações na tela, para o papel dado; devolve o que foi visto e o que foi gravado
  const grav = []; globalThis.pessoalGravar = (k, v, cb) => { grav.push([k, JSON.parse(JSON.stringify(v))]); globalThis.PESSOAL[k] = v; cb && cb(""); };
  try {
    ambiente({ dono: papel === "dono", pessoal: {} }); const vistas = {};
    T.drawApp("central"); vistas.central = texto(RAIZ); vistas.nav = achar(RAIZ, (e) => e.tag === "nav" && e.attrs["aria-label"] === "Análises e gestão de categorias").length;
    const b = new El("div"); T.viewCentral(b); vistas.porArea = /Por área de consumo/.test(texto(b)) && /Total da Central no período/.test(texto(b));
    for (const a of ["mercado", "automotivo", "farmacia", "bebe", "nao-classificados"]) { Object.assign(T.CU, { per: "2026-11" }); vistas[a] = texto(painelArea(a)); }
    Object.assign(T.PN, { area: "mercado", cab: false, rota: "painel" }); T.st.mes = "2026-11"; T.st.kpi = "mes"; T.st.pick = null; const p = new El("div"); T.viewPainel(p); vistas.painel = texto(p); vistas.linhasPainel = T.linhasPainel().length;
    const g = new El("div"); T.viewCategorias(g); vistas.gestao = texto(g);
    const sel = (rot) => achar(g, (e) => e.tag === "select" && e.attrs["aria-label"] === rot)[0];
    const s1 = sel("Área de Tecnologia"); s1.value = "mercado"; s1.onchange();                       // alterar associação
    const g2 = new El("div"); T.viewCategorias(g2);
    const entrada = (e, ph) => achar(e, (x) => x.tag === "input" && x.attrs.placeholder === ph)[0], botao = (e, t) => achar(e, (x) => x.tag === "button" && texto(x) === t)[0];
    entrada(g2, "Nome da nova área").value = "Pet shop"; botao(g2, "Criar área").onclick();                 // criar área
    const g3 = new El("div"); T.viewCategorias(g3); achar(g3, (e) => e.tag === "select" && e.attrs["aria-label"] === "Área de Pet")[0];
    entrada(g3, "Nome da categoria").value = "Brinquedos"; achar(g3, (x) => x.tag === "select" && x.attrs["aria-label"] === "Área da nova categoria")[0].value = "bebe"; botao(g3, "Criar categoria").onclick();   // criar categoria
    const g4 = new El("div"); T.viewCategorias(g4); botao(g4, "Remover da lista").onclick();                // excluir categoria criada
    const g5 = new El("div"); T.viewCategorias(g5); botao(g5, "Remover a área").onclick();                  // excluir área criada
    return { vistas, grav };
  } finally { delete globalThis.pessoalGravar; }
}
test("13 · dono e casa executam as mesmas operações e veem as mesmas telas, indicadores e gráficos", () => {
  const d = telaDe("dono"), c = telaDe("casa");
  assert.deepEqual(c.vistas, d.vistas, "mesmo texto em todas as telas e painéis (Central, 4 áreas, não classificados, Painel do Mercado, Gestão)");
  assert.ok(d.vistas.nav === 1 && d.vistas.porArea && /Gestão de categorias/.test(d.vistas.gestao));
  assert.ok(/Raia Drogasil/.test(d.vistas.farmacia) && !/Cortina/.test(d.vistas.farmacia) && /Cortina/.test(d.vistas.automotivo) && !/Drogasil/.test(d.vistas.automotivo), "cada painel mostra só a sua área, com os produtos dela");
  assert.ok(!/Dipirona|Cortina|Drogasil/.test(d.vistas.painel) && d.vistas.linhasPainel === 5, "o Painel do Mercado da casa também só soma a área Mercado");
  assert.deepEqual(c.grav, d.grav, "as mesmas gravações: alterar associação, criar área, criar categoria, excluir categoria e excluir área");
  assert.equal(d.grav.length, 5); assert.ok(d.grav.every(([k]) => k === "mercado-areas"), "só a chave das áreas é gravada");
  const cfg = N.arConfig(d.grav[2][1]); assert.equal(N.arAreaDe(cfg, "Tecnologia"), "mercado"); assert.equal(N.arAreaDe(cfg, "Brinquedos"), "bebe");
});
test("13b · a rota de área e a Gestão abrem para a casa; módulos só do dono continuam fechados", () => {
  const m = ler("mercado.js"); assert.match(m, /function ehProprietario\(\) \{ return ehDono\(\); \}/); assert.match(m, /\(x\[0\] !== "area" && x\[0\] !== "categorias"\) \|\| ehProprietario\(\)/);
  ambiente({ dono: false }); T.drawApp("area", "farmacia"); assert.ok(/Área de consumo/.test(texto(RAIZ)) && /Drogasil/.test(texto(RAIZ)));
  T.drawApp("categorias"); assert.ok(/Gestão de categorias/.test(texto(RAIZ)));
  ambiente({ dono: false }); T.drawApp("alertas"); assert.ok(/Central de Compras/.test(texto(RAIZ)));
  const app2 = ler("js/app.js"); assert.match(app2, /function pessoalDaCasa/); assert.match(app2, /function isOwner\(\)\{return PAPEL==="dono"\}/);
});
test("13c · a configuração é a MESMA para dono e casa, em qualquer aparelho (mesma linha do dono; sem divergência)", async () => {
  assert.match(app, /var PESSOAL_CASA=\["radar-config","radar-pagos","radar-vinculos","mercado-equivalencias","mercado-alertas","mercado-canais","mercado-areas"\]/);
  // 1) a Fernanda grava; o dono, em outro aparelho, lê a mesma coisa
  const casa = montar({ papel: "casa", linhas: [] }); await casa.ctx.pessoalCarregar();
  let cfg = N.arAssociar(N.arAreaCriar(N.arConfig(null), "Pet shop").cfg, "Pet", "pet-shop").cfg;
  casa.ctx.pessoalGravar("mercado-areas", N.arRaw(cfg), casa.pronto); for (let i = 0; i < 5; i++) await ESPERA();
  assert.equal(casa.upserts.length, 1); assert.equal(casa.upserts[0].user_id, D, "na linha do DONO, não numa linha dela"); assert.equal(casa.upserts[0].chave, "mercado-areas"); assert.deepEqual(casa.msgs, [""]);
  const dono = montar({ papel: "dono", linhas: casa.linhas }); await dono.ctx.pessoalCarregar();
  assert.deepEqual(N.arRaw(N.arConfig(dono.ctx.__t.P()["mercado-areas"])), N.arRaw(cfg), "o dono vê o que a Fernanda configurou");
  // 2) o dono muda; a Fernanda, em outro aparelho, lê a mesma coisa
  const cfg2 = N.arAssociar(cfg, "Tecnologia", "mercado").cfg;
  dono.ctx.pessoalGravar("mercado-areas", N.arRaw(cfg2), dono.pronto); for (let i = 0; i < 5; i++) await ESPERA();
  const casa2 = montar({ papel: "casa", linhas: dono.linhas.filter((l, i, a) => a.map((x) => x.chave).lastIndexOf(l.chave) === i) }); await casa2.ctx.pessoalCarregar();
  assert.deepEqual(N.arRaw(N.arConfig(casa2.ctx.__t.P()["mercado-areas"])), N.arRaw(cfg2));
  assert.ok(casa2.filtros.some(([k, c, v]) => k === "in" && c === "chave" && v.includes("mercado-areas")), "a casa pede a chave nova");
  // 3) edição concorrente: a casa não sobrescreve às cegas (vale a versão da conta, como nas outras chaves compartilhadas)
  const c3 = montar({ papel: "casa", linhas: [LINHA_AREAS({ v: 1, areas: [], associacoes: {}, categorias: [] })] }); await c3.ctx.pessoalCarregar();
  const l = c3.linhas[0]; l.valor = N.arRaw(cfg2); l.atualizado = "2026-11-20T11:00:00.000Z";
  c3.ctx.pessoalGravar("mercado-areas", { v: 1, areas: [], associacoes: { Pet: "mercado" }, categorias: [] }, c3.pronto); for (let i = 0; i < 5; i++) await ESPERA();
  assert.equal(c3.upserts.length, 0); assert.match(c3.msgs[0], /outra pessoa da casa/); assert.deepEqual(c3.ctx.__t.P()["mercado-areas"], N.arRaw(cfg2));
  // 4) outra chave pessoal continua invisível para a casa
  const c4 = montar({ papel: "casa", linhas: [LINHA_AREAS({ v: 1 }), { user_id: D, chave: "x-amigos", valor: ["segredo"], atualizado: T0 }] }); await c4.ctx.pessoalCarregar();
  assert.deepEqual(Object.keys(c4.ctx.__t.P()), ["mercado-areas"]);
});
test("código: áreas e gestão são de dono e casa; sem tabela nova; só a política da pessoal muda (064, aplicada)", () => {
  assert.ok(!fs.readdirSync(new URL("../supabase/", import.meta.url)).some((f) => /(^|_)(areas?|consumo)(_|\.)/i.test(f) && !/^064_casa_areas_consumo/.test(f)), "nenhuma tabela nem migration de dados para as áreas");
  const sql = ler("supabase/064_casa_areas_consumo.sql"); assert.match(sql, /^-- 064 · APLICADA EM PRODUÇÃO em 20\/11\/2026/);
  const n = ler("nucleo.js"), i0 = n.indexOf("/* ===== Áreas de consumo"), i1 = n.indexOf("/* ===== Central de Compras como um mercado"); assert.ok(i0 > 0 && i1 > i0);
  assert.ok(!/document|window\.|sb\.|fetch\(/.test(n.slice(i0, i1)), "o núcleo das áreas é puro: sem tela nem banco");
  assert.match(ler("index.html"), /#mercado \.mk-areas\{/);
});

test("navegação: a caixa grande tem Central e as áreas; Preços, Consumo, Comparar, Não classificados e Gestão ficam na faixa de baixo (dono e casa); o Painel do Mercado é a área Mercado", () => {
  for (const dono of [true, false]) {
    ambiente({ dono }); T.drawApp("area", "farmacia");
    const nav = (rot) => achar(RAIZ, (e) => e.tag === "nav" && e.attrs["aria-label"] === rot)[0], links = (n) => achar(n, (e) => e.tag === "a").map(texto);
    const grande = nav("Central de Compras"), baixo = nav("Análises e gestão de categorias");
    assert.deepEqual(links(grande), ["Central", "Mercado", "Automotivo", "Farmácia", "Bebê/Infantil"], "Central aparece uma vez só");
    assert.deepEqual(links(baixo).map((t) => t.replace(/\(\d+\)/, "(n)")), ["Preços", "Consumo", "Comparar", "Não classificados (n)", "⚙ Gestão de categorias"]);
    assert.deepEqual(achar(grande, (e) => e.attrs["aria-current"] === "page").map(texto), ["Farmácia"], "a área ativa fica marcada");
    assert.ok(!/Central \(todas\)/.test(texto(RAIZ)));
    T.st.mes = "2026-11"; T.st.kpi = "mes"; T.st.pick = null; T.drawApp("painel"); assert.deepEqual(achar(nav("Central de Compras"), (e) => e.attrs["aria-current"] === "page").map(texto), ["Mercado"], "o endereço antigo do Painel do Mercado abre a área Mercado");
  }
});

// ---------- Lote A: o motor único nas áreas e na Central ----------
test("Lote A · Central: o gasto é o valor pago (com os ajustes dos pedidos), o mês a mês bate com o gasto e a conta das áreas fecha", () => {
  ambiente(); Object.assign(T.st, { mes: "2026-11" });
  const b = new El("div"); T.viewCentral(b); const t = texto(b), total = 40 + 12.5 + 55 + 30 + 22.9 + 547.09 + 19.9 + 30 + 100 + 115 + 30;
  assert.ok(t.includes("Gasto em novembro 2026 " + BRL(total)), "o gasto da Central é o total da Central");
  assert.ok(t.includes("inclui +" + BRL(13)) || /inclui \+R\$\s*13,00/.test(t), "diz quanto vem de frete, taxas e descontos gerais");
  assert.ok(t.includes("Total da Central no período: " + BRL(total)), "a conta por área fecha com o mesmo total");
  const col = achar(b, (e) => e.tag === "button" && /\bvb\b/.test(e.className || "") && /nov\/26/.test(texto(e)))[0]; assert.ok(texto(col).includes(Math.round(total).toLocaleString("pt-BR")), "a coluna de novembro é o gasto");
  assert.ok(/Por canal/.test(t) && /Conferência dos totais/.test(t) && /Comparar períodos/.test(t) && /Preços que mais mudaram/.test(t));
});
test("Lote A · Central com 12 meses e Tudo: período novo no mesmo painel, sem comparação com o mês anterior", () => {
  for (const per of ["12m", "tudo"]) {
    ambiente(); T.CU.per = per; const b = new El("div"); T.viewCentral(b); const t = texto(b);
    assert.ok(per === "12m" ? /Gasto nos últimos 12 meses/.test(t) : /Gasto em todo o histórico/.test(t), per); assert.ok(/Compras no período/.test(t) && !/Até o dia/.test(t), "sem comparação de mês");
    assert.ok(/Total da Central no período/.test(t));
  }
});
test("Lote A · uma área criada depois ganha o painel do molde sozinha (mesmos blocos do Mercado)", () => {
  let cfg = N.arAssociar(N.arAreaCriar(N.arConfig(null), "Pet shop").cfg, "Pet", "pet-shop").cfg;
  ambiente({ pessoal: { "mercado-areas": N.arRaw(cfg) } }); T.CU.per = "2026-11"; T.st.mes = "2026-11";
  const t = texto(painelArea("pet-shop"));
  for (const x of ["Área de consumo", "Pet shop", "Gasto em novembro 2026", "Compras no mês", "Itens comprados", "Por canal", "Última compra", "Por mercado", "Mês a mês", "Por categoria", "O que mais pesou", "Explorar por categoria", "Comparar períodos", "Preços que mais mudaram"]) assert.ok(t.includes(x), x);
  assert.ok(t.includes(BRL(102)) && /Ração Golden/.test(t) && !/Arroz|Dipirona/.test(t), "só os itens da área, no valor líquido do item");
  assert.ok(texto(RAIZ) !== undefined && N.arResumo(unif(), cfg, {}).total === N.arResumo(unif(), cfgPadrao(), {}).total, "a Central não muda");
});
test("Lote A · cada painel de área traz o comparador de períodos e o quadro de variação de preço só com os itens da área", () => {
  ambiente(); T.CU.per = "tudo";
  const m = texto(painelArea("mercado"));
  assert.ok(/Comparar períodos/.test(m) && /Período A/.test(m) && /Período B/.test(m), "dois períodos livres");
  assert.ok(/Arroz R\$ 38,00 → R\$ 40,00 · 2 compras · un ▲ \+5,3%/.test(m), "variação do preço do arroz entre outubro e novembro: " + (m.match(/Preços que mais mudaram.{0,260}/) || [""])[0]);
  const f = texto(painelArea("farmacia")); assert.ok(!/Arroz/.test(f) && /Comparar períodos/.test(f), "a Farmácia não vê produtos do Mercado");
  assert.ok(!/Mercearia|Automotivo/.test(f.replace(/Gerenciar categorias e áreas/, "")), "o comparador da área só lista as categorias da área");
});
