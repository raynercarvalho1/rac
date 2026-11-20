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
  Object.assign(T.CU, { per: "2026-11", canal: "", estab: "", cat: "", aberta: null, todas: false, sel: null, area: "" });
}
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
  ambiente({ pessoal: {} }); T.CU.area = "farmacia";
  const t = texto((() => { const b = new El("div"); T.viewCentral(b); return b; })());
  assert.ok(/Área de consumo/.test(t) && /Farmácia/.test(t)); assert.ok(t.includes(BRL(22.9 + 547.09)), "gasto do mês só da Farmácia");
  assert.ok(/Raia Drogasil/.test(t) && !/Tauste/.test(t) && !/Cortina|Arroz|Amazon/.test(t), "estabelecimentos e produtos só da área");
  assert.ok(!/Automotivo|Mercearia/.test(t.replace(/Gerenciar categorias e áreas/, "")), "o painel não lista categorias de outras áreas");
  const b2 = new El("div"); T.viewCentral(b2); const selects = achar(b2, (e) => e.tag === "select"), opcs = selects.flatMap((s) => achar(s, (e) => e.tag === "option").map(texto));
  assert.ok(opcs.includes("Raia Drogasil") && !opcs.includes("Tauste") && opcs.includes("Farmácia") && !opcs.includes("Mercearia"), "filtros de estabelecimento e categoria só com o que é da área");
  const E = N.cmPorMes(AREA("farmacia"), {}, "2026-11", 12); assert.equal(E.total, r2(22.9 + 547.09 + 15)); assert.equal(E.meses.find((m) => m.mes === "2026-10").total, 15, "a evolução mensal da área");
  const cmp = N.cuComparar(AREA("farmacia"), {}, "2026-11", "2026-11-10"); assert.equal(cmp.atual.total, r2(22.9 + 547.09)); assert.equal(cmp.anterior.total, 15, "comparação com o período anterior na área");
  T.CU.area = "mercado"; const bm = new El("div"); T.viewCentral(bm); const tm = texto(bm);
  assert.ok(!/Dipirona|Ondansetrona|Drogasil|Cortina/.test(tm), "o painel Mercado não mostra Farmácia nem Automotivo nos indicadores, categorias, estabelecimentos e produtos");
  T.CU.area = "inexistente"; const bi = new El("div"); T.viewCentral(bi); assert.ok(/Essa área não existe/.test(texto(bi)));
  T.CU.area = ""; ambiente(); const bc = new El("div"); T.viewCentral(bc); const tc = texto(bc);
  assert.ok(/Por área de consumo/.test(tc) && /Não classificados/.test(tc) && /Farmácia/.test(tc) && /Automotivo/.test(tc), "a Central mostra todas as áreas e a participação delas");
  assert.ok(tc.includes("Total da Central no período: " + BRL(40 + 12.5 + 55 + 30 + 22.9 + 547.09 + 19.9 + 30 + 100 + 115 + 30)), "a Central soma tudo, uma vez");
});
test("Painel do Mercado (dono) só soma a área Mercado e avisa o que ficou fora; a gestão mostra as sem área primeiro", () => {
  ambiente(); T.st.mes = "2026-11"; T.st.kpi = "mes"; T.st.pick = null;
  const p = new El("div"); T.viewPainel(p); const t = texto(p);
  assert.ok(!/Dipirona|Ondansetrona|Cortina|Drogasil/.test(t), "sem Farmácia nem Automotivo no Painel do Mercado"); assert.ok(/Este painel mostra só a área Mercado/.test(t) && /Fora dele/.test(t));
  assert.ok(T.rowsP().every((x) => ["Mercearia", "Limpeza"].includes(x.categoria)) && T.rowsP().length === 4);
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

// ---------- 13: a Fernanda e as permissões ----------
test("13 · a Fernanda (casa) não vê nem grava as áreas: o banco, o app e a tela continuam como eram", async () => {
  assert.ok(!/mercado-areas/.test(ler("supabase/057_casa_radar_fiscal.sql")), "a política da casa (057) não inclui a chave nova");
  assert.match(app, /var PESSOAL_CASA=\["radar-config","radar-pagos","radar-vinculos","mercado-equivalencias","mercado-alertas","mercado-canais"\]/); assert.ok(!/PESSOAL_CASA=[^\]]*mercado-areas/.test(app));
  const c = montar({ papel: "casa", linhas: [{ user_id: D, chave: "mercado-areas", valor: { v: 1, areas: [], associacoes: { Pet: "mercado" }, categorias: [] }, atualizado: T0 }, { user_id: D, chave: "mercado-canais", valor: {}, atualizado: T0 }] });
  await c.ctx.pessoalCarregar(); assert.deepEqual(Object.keys(c.ctx.__t.P()), ["mercado-canais"], "a casa não recebe a configuração das áreas");
  c.ctx.pessoalGravar("mercado-areas", { v: 1 }, c.pronto); await ESPERA(); await ESPERA(); assert.equal(c.upserts.length, 0, "a casa não grava"); assert.match(c.msgs[0], /só neste aparelho/);
  // tela da casa: sem faixa de áreas, sem painel por área, rota de área/gestão cai na Central, Painel completo como sempre
  ambiente({ dono: false, pessoal: {} }); T.st.mes = "2026-11"; T.st.kpi = "mes"; T.st.pick = null;
  assert.equal(T.rowsP().length, ROWS.length, "o Painel da Fernanda soma tudo, como antes");
  const p = new El("div"); T.viewPainel(p); const tp = texto(p); assert.ok(/Dipirona|Drogasil/.test(tp) && !/Este painel mostra só a área Mercado/.test(tp));
  T.drawApp("area", "farmacia"); const r = texto(RAIZ); assert.ok(!/Áreas de consumo|Gestão de categorias|Área de consumo/.test(r), "a casa não vê nada de áreas");
  assert.ok(/Central de Compras/.test(r) && /Tauste/.test(r), "a rota de área cai na Central da casa");
  T.drawApp("categorias"); assert.ok(!/Gestão de categorias/.test(texto(RAIZ)));
  const b = new El("div"); T.viewCentral(b); assert.ok(!/Por área de consumo/.test(texto(b)), "a Central da casa não ganha painel novo");
  // o dono vê a faixa de áreas e a gestão
  ambiente(); T.drawApp("central"); const rd = texto(RAIZ); assert.ok(/Áreas de consumo/.test(rd) && /Gestão de categorias/.test(rd) && /Central \(todas\)/.test(rd) && /Farmácia/.test(rd) && /Não classificados \(/.test(rd));
  const nav = achar(RAIZ, (e) => e.tag === "nav" && e.attrs["aria-label"] === "Áreas de consumo")[0]; assert.ok(achar(nav, (e) => e.tag === "a").length >= 6);
  T.drawApp("area", "automotivo"); const ra = RAIZ; const cur = achar(ra, (e) => e.tag === "a" && e.attrs["aria-current"] === "page").map(texto); assert.ok(cur.includes("Automotivo"), "a área ativa fica identificada"); assert.ok(/Área de consumo/.test(texto(ra)));
});
test("código: áreas e gestão só abrem para o dono; sem migration; nada novo no catálogo do banco", () => {
  const m = ler("mercado.js"); assert.match(m, /\(x\[0\] !== "area" && x\[0\] !== "categorias"\) \|\| ehProprietario\(\)/);
  assert.ok(!fs.readdirSync(new URL("../supabase/", import.meta.url)).some((f) => /(^|_)(areas?|consumo)(_|\.)/i.test(f)), "nenhuma migration para as áreas (usa a tabela pessoal)");
  const n = ler("nucleo.js"), i0 = n.indexOf("/* ===== Áreas de consumo"), i1 = n.indexOf("/* ===== Central de Compras como um mercado"); assert.ok(i0 > 0 && i1 > i0);
  assert.ok(!/document|window\.|sb\.|fetch\(/.test(n.slice(i0, i1)), "o núcleo das áreas é puro: sem tela nem banco");
  const css = ler("index.html"); assert.match(css, /#mercado \.mk-areas\{/);
});
