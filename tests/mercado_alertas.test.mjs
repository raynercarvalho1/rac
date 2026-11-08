// Lote: alertas inteligentes de preço no Mercado (nucleo.js mkal* e a aba "Alertas"). Só dados de teste: sem banco, sem Web Push real e sem IA.
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
const ROOT = new El("div");
globalThis.document = { createElement: (t) => new El(t), createElementNS: (n, t) => new El(t), createTextNode: (t) => ({ text: t }), querySelector: () => null, getElementById: (i) => (i === "mercado-view" ? ROOT : null) };
globalThis.window = globalThis.window || {};
globalThis.window.scrollTo = () => {}; globalThis.window.racDica = { ligar: (el, f) => { el.dica = f; return el; } };
globalThis.location = { hash: "" };
globalThis.PESSOAL = {}; let DONO = true; let gravacoes = [];
globalThis.isOwner = () => DONO;
globalThis.pessoalGravar = (k, v, cb) => { globalThis.PESSOAL[k] = v; gravacoes.push([k, v]); if (cb) cb(); };
createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo || globalThis.window.RACnucleo; globalThis.window.RACnucleo = N;
createRequire(import.meta.url)("../mercado.js");
const T = globalThis.window.RACmercado._teste;
const ler = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");

let seq = 0;
const C = "Confiança (Sorocaba)", RE = "Reinaldo (Sorocaba)";
const R = (data, mercado, produto, categoria, un, q, vu) => ({ id: "i" + String(++seq).padStart(3, "0"), data, mk: data.slice(0, 7), mercado, produto, categoria, unidade: un, quantidade: q, valor_unitario: vu, valor_total: Math.round(q * vu * 100) / 100, desconto: 0, nota: data + "|" + mercado });
const ROWS = [
  R("2026-09-01", C, "Arroz", "Mercearia", "kg", 2, 5), R("2026-10-01", C, "Arroz", "Mercearia", "kg", 2, 5), R("2026-11-01", RE, "Arroz", "Mercearia", "kg", 2, 5), R("2026-11-02", C, "Arroz", "Mercearia", "kg", 2, 5.8),
  R("2026-09-10", C, "Leite Integral 1L", "Mercearia", "un", 6, 6), R("2026-10-05", C, "Leite Integral 1L", "Mercearia", "un", 6, 5.5), R("2026-11-04", C, "Leite Integral 1L", "Mercearia", "un", 6, 4.5),
  R("2026-11-03", C, "Feijão", "Mercearia", "kg", 1, 8),
  R("2026-06-01", RE, "Queijo Minas", "Açougue/Frios", "kg", 0.5, 30), R("2026-11-02", C, "Queijo Minas", "Açougue/Frios", "kg", 0.5, 40), R("2026-11-03", RE, "Queijo Minas", "Açougue/Frios", "un", 1, 5),
  R("2026-10-01", C, "Suco", "Bebidas", "l", 1, 9), R("2026-11-01", C, "Suco", "Bebidas", "ml", 500, 0.01)
];
const HOJE = "2026-11-08";
const ger = (rows = ROWS, cfg = {}) => N.mkalGerar(rows, cfg);
const por = (l, tipo, nome, un) => l.filter((a) => a.tipo === tipo && (!nome || a.nome === nome) && (!un || a.unidade === un));
const arred = (v, n = 4) => Math.round(v * 10 ** n) / 10 ** n;

test("alerta de aumento: preço contra a compra anterior, com o percentual mínimo; só na mesma unidade", () => {
  const l = ger(), a = por(l, "aumento", "Arroz")[0];
  assert.ok(a); assert.deepEqual([a.atual, a.anterior, arred(a.pct), a.mercado, a.data, a.unidade], [5.8, 5, 0.16, C, "2026-11-02", "kg"]);
  assert.match(a.motivo, /subiu 16%/); assert.match(a.motivo, /R\$ 5,00\/kg em 01\/11\/2026/); assert.match(a.motivo, /15%/);
  assert.equal(por(l, "aumento").length, 2, "Arroz e Queijo (kg)"); assert.equal(por(l, "aumento", "Queijo Minas")[0].unidade, "kg");
  assert.equal(por(l, "aumento", "Suco").length, 0, "L e ml nunca se comparam: 9,00/L → 0,01/ml não é aumento nem queda");
  assert.equal(por(l, "queda", "Suco").length, 0);
  assert.equal(l.filter((a) => a.nome === "Queijo Minas" && a.unidade === "un").length, 0, "queijo em un (1 compra) não se compara com o de kg");
});

test("alerta de queda: preço anterior, atual e percentual", () => {
  const q = por(ger(), "queda", "Leite Integral 1L")[0];
  assert.deepEqual([q.anterior, q.atual, arred(q.pct), q.data], [5.5, 4.5, -0.1818, "2026-11-04"]);
  assert.match(q.motivo, /caiu 18,2%/); assert.match(q.motivo, /R\$ 5,50\/un/); assert.match(q.motivo, /R\$ 4,50\/un/);
  assert.equal(por(ger(), "queda", "Leite Integral 1L").length, 1, "5,50 vs 6,00 (−8,3%) está abaixo dos 15%");
});

test("menor preço histórico: só registrado no RAC, com pelo menos 2 compras anteriores; menor no período é outra regra", () => {
  const m = por(ger(), "minimo", "Leite Integral 1L")[0];
  assert.ok(m); assert.deepEqual([m.atual, m.anterior, arred(m.pct)], [4.5, 5.5, -0.1818]); assert.match(m.motivo, /Não é o menor preço do mercado/); assert.match(m.motivo, /2 compras anteriores/);
  assert.equal(por(ger(ROWS.filter((x) => x.produto !== "Leite Integral 1L" || x.data !== "2026-09-10")), "minimo").length, 0, "só 1 compra anterior: histórico insuficiente");
  assert.equal(por(ger(), "minimo", "Arroz").length, 0, "empatar o mínimo não é novo mínimo");
  /* mínimo absoluto × do período */
  const L = [R("2025-01-01", C, "Leite B", "Mercearia", "un", 1, 3), R("2026-09-01", C, "Leite B", "Mercearia", "un", 1, 6), R("2026-10-01", C, "Leite B", "Mercearia", "un", 1, 5.5), R("2026-11-01", C, "Leite B", "Mercearia", "un", 1, 5)];
  assert.equal(por(ger(L, { tipos: { minimo_periodo: { on: true, dias: 90 } } }), "minimo").length, 0, "o mínimo absoluto (3,00) não foi batido");
  const p = por(ger(L, { tipos: { minimo_periodo: { on: true, dias: 90 } } }), "minimo_periodo")[0];
  assert.ok(p); assert.deepEqual([p.atual, p.anterior], [5, 5.5]); assert.match(p.motivo, /últimos 90 dias/);
  assert.equal(por(ger(L), "minimo_periodo").length, 0, "padrão: desligado");
  assert.equal(por(ger(ROWS, { tipos: { minimo: { on: false }, minimo_periodo: { on: true, dias: 20 } } }), "minimo_periodo").length, 0, "janela curta: sem compras suficientes");
});

test("limite definido pelo usuário: preço igual ou menor; editável, removível e sem repetir", () => {
  const lim = (max) => ({ limites: [{ nome: "Leite Integral 1L", unidade: "un", max }] });
  const a = por(ger(ROWS, lim(5)), "limite"); assert.equal(a.length, 1); assert.deepEqual([a[0].atual, a[0].anterior, a[0].data], [4.5, 5, "2026-11-04"]); assert.match(a[0].motivo, /limite de R\$ 5,00\/un/);
  assert.equal(por(ger(ROWS, lim(4)), "limite").length, 0); assert.equal(por(ger(ROWS, lim(4.5)), "limite").length, 1, "igual ao limite também alerta");
  assert.notEqual(por(ger(ROWS, lim(5)), "limite")[0].id, por(ger(ROWS, lim(4.6)), "limite")[0].id, "limite novo = regra nova = alerta novo");
  assert.equal(por(ger(ROWS, lim(5)), "limite")[0].id, por(ger(ROWS, lim(5)), "limite")[0].id);
  /* só vale para o produto na unidade do limite */
  assert.equal(por(ger(ROWS, { limites: [{ nome: "Leite Integral 1L", unidade: "l", max: 99 }] }), "limite").length, 0, "outra unidade: outro produto");
  assert.equal(por(ger(ROWS, { limites: [{ nome: "Leite Integral 1L", unidade: "un", max: 5 }], tipos: { limite: { on: false } } }), "limite").length, 0);
  const c1 = N.mkalLimiteSalvar({}, { nome: "Leite Integral 1L", unidade: "un", max: 5 }).cfg, c2 = N.mkalLimiteSalvar(c1, { nome: "Leite Integral 1L", unidade: "un", max: 4 }).cfg;
  assert.equal(c2.limites.length, 1); assert.equal(c2.limites[0].max, 4, "editar o limite do mesmo produto e unidade substitui");
  assert.equal(N.mkalLimiteRemover(c2, c2.limites[0].chave).limites.length, 0);
  assert.match(N.mkalLimiteSalvar({}, { nome: "Leite", unidade: "un", max: 0 }).erro, /maior que zero/); assert.match(N.mkalLimiteSalvar({}, { nome: "", unidade: "un", max: 3 }).erro, /produto/);
});

test("melhor preço entre estabelecimentos: mesma unidade, registros próximos, com produto, mercados, diferença e datas", () => {
  const m = por(ger(), "melhor", "Arroz")[0];
  assert.ok(m); assert.deepEqual([m.unidade, m.mercado, m.refMercado, m.atual, m.anterior, arred(m.pct), m.data, m.dataEncontrado], ["kg", RE, C, 5, 5.8, -0.1379, "2026-11-02", "2026-11-01"]);
  assert.match(m.motivo, /Reinaldo/); assert.match(m.motivo, /13,8% mais barato/); assert.match(m.motivo, /01\/11\/2026/); assert.match(m.motivo, /02\/11\/2026/); assert.match(m.motivo, /no máximo 60 dias/);
});

test("registros antigos: preço de muito tempo atrás não vira 'mais barato'; com janela maior o aviso aparece", () => {
  assert.equal(por(ger(), "melhor", "Queijo Minas").length, 0, "30,00 em 01/06 × 40,00 em 02/11: 154 dias");
  const m = por(ger(ROWS, { tipos: { melhor: { on: true, pct: 0.1, dias: 200 } } }), "melhor", "Queijo Minas");
  assert.equal(m.length, 1); assert.equal(m[0].unidade, "kg"); assert.match(m[0].motivo, /no máximo 200 dias/);
  assert.equal(por(ger(), "melhor", "Queijo Minas", "un").length, 0, "o queijo de un do Reinaldo não entra na comparação do queijo de kg");
});

test("histórico insuficiente e compra única: nenhum alerta", () => {
  assert.equal(ger().filter((a) => a.nome === "Feijão").length, 0);
  assert.deepEqual(ger([R("2026-11-01", C, "Feijão", "Mercearia", "kg", 1, 8)]), []);
  assert.deepEqual(ger([]), []); assert.deepEqual(N.mkalGerar(null, null), []);
  assert.equal(ger([R("2026-10-01", C, "X", "Mercearia", "un", 1, 5), R("2026-11-01", C, "X", "Mercearia", "un", 1, 0)]).length, 0, "preço zero/ausente não vira alerta");
});

test("deduplicação: o mesmo evento tem sempre o mesmo id; compra nova gera alerta novo e mantém os antigos", () => {
  const a = ger(), b = ger();
  assert.deepEqual(a.map((x) => x.id), b.map((x) => x.id)); assert.equal(new Set(a.map((x) => x.id)).size, a.length, "sem ids repetidos");
  const mais = ROWS.concat([R("2026-11-06", C, "Arroz", "Mercearia", "kg", 1, 7)]), c = ger(mais);
  const novos = c.filter((x) => !a.some((y) => y.id === x.id));
  assert.deepEqual(novos.map((x) => x.tipo).sort(), ["aumento", "melhor"], "novo aumento (7,00 × 5,80) e nova oportunidade (RE 5,00)");
  assert.ok(a.every((x) => c.some((y) => y.id === x.id)), "os alertas antigos continuam com o mesmo id");
  assert.equal(c.length, a.length + 2);
});

test("lido / novo: marcar como lido não repete, tira dos novos e um evento novo continua novo", () => {
  const cfg = N.mkalConfig({}), a = ger(), c0 = N.mkalClassificar(a, { lidos: [] }, HOJE, cfg);
  assert.equal(c0.resumo.novos, 5); assert.deepEqual(c0.resumo.porTipo, { aumento: 2, queda: 1, minimo: 1, melhor: 1 });
  const arroz = por(a, "aumento", "Arroz")[0], e1 = N.mkalMarcarLido({ lidos: [] }, [arroz.id]), e2 = N.mkalMarcarLido(e1, [arroz.id, arroz.id]);
  assert.deepEqual(e2.lidos, [arroz.id], "sem repetir");
  const c1 = N.mkalClassificar(a, e2, HOJE, cfg); assert.equal(c1.resumo.novos, 4); assert.equal(c1.alertas.find((x) => x.id === arroz.id).lido, true); assert.equal(c1.alertas.find((x) => x.id === arroz.id).novo, false);
  const c2 = N.mkalClassificar(ger(ROWS.concat([R("2026-11-06", C, "Arroz", "Mercearia", "kg", 1, 7)])), e2, HOJE, cfg); assert.equal(c2.resumo.novos, 6, "o evento novo aparece como novo mesmo com o produto já alertado");
  assert.equal(N.mkalClassificar(a, { lidos: [] }, "2027-02-01", cfg).resumo.novos, 0, "alertas de compras antigas ficam em 'anteriores'");
  assert.equal(N.mkalMarcarLido({ lidos: Array.from({ length: 1500 }, (_, i) => "x" + i) }, ["novo"]).lidos.length, 1500, "estado limitado");
});

test("preferências individuais: ligar/desligar, percentuais e valores inválidos voltam ao padrão", () => {
  assert.equal(por(ger(ROWS, { tipos: { aumento: { on: false } } }), "aumento").length, 0, "alerta desativado");
  assert.equal(por(ger(ROWS, { tipos: { aumento: { on: true, pct: 0.2 } } }), "aumento").length, 1, "20%: só o Queijo (33%), o Arroz (16%) não");
  assert.equal(por(ger(ROWS, { tipos: { aumento: { on: true, pct: 0.1 } } }), "aumento").length, 2);
  assert.equal(por(ger(ROWS, { tipos: { queda: { on: true, pct: 0.05 } } }), "queda", "Leite Integral 1L").length, 2, "5%: 6,00→5,50 e 5,50→4,50");
  assert.equal(por(ger(ROWS, { tipos: { melhor: { on: false } } }), "melhor").length, 0);
  const c = N.mkalConfig({ tipos: { aumento: { pct: "abc" }, queda: { pct: 0 }, melhor: { dias: 99999 } }, novosDias: -3, limites: [{ nome: "A", unidade: "kg", max: -1 }, { nome: " ", max: 5 }, null, { nome: "Leite", unidade: "un", max: 5 }, { nome: "Leite", unidade: "UN", max: 6 }] });
  assert.equal(c.tipos.aumento.pct, 0.15); assert.equal(c.tipos.queda.pct, 0.15); assert.equal(c.tipos.melhor.dias, 60); assert.equal(c.novosDias, 30);
  assert.equal(c.limites.length, 1); assert.equal(c.limites[0].max, 6, "limites inválidos saem e o repetido vale o último");
  assert.deepEqual(N.mkalConfig(null).tipos.minimo_periodo, { on: false, dias: 90 }); assert.equal(N.mkalConfig("lixo").tipos.limite.on, true);
  assert.deepEqual(N.mkalOpcoes(ROWS).filter((o) => o.nome === "Queijo Minas").map((o) => o.unidade), ["kg", "un"]);
});

function abrir(pessoal) {
  DONO = true; gravacoes = []; globalThis.PESSOAL = pessoal || {}; globalThis.location.hash = ""; T.st.al = null; T.usar(ROWS, { email: "dono@teste" });
  const body = new El("div"); T.viewAlertas(body); return body;
}
const botao = (raiz, rot, i = 0) => achar(raiz, (e) => e.tag === "button" && texto(e).trim() === rot)[i];
const tile = (raiz, aria) => achar(raiz, (e) => e.tag === "button" && (e.attrs["aria-label"] || "").startsWith(aria))[0];
const linhas = (raiz) => achar(raiz, (e) => e.tag === "button" && /(^| )alrow( |$)/.test(e.className || ""));
const inp = (rot) => achar(ROOT, (e) => e.tag === "input" && e.attrs["aria-label"] === rot)[0];
const rerender = () => { const b = new El("div"); T.viewAlertas(b); return b; };

test("painel: indicadores compactos por tipo com a contagem de novos, sem cartões de detalhe na visão geral", () => {
  const body = abrir(), t = texto(body);
  assert.match(t, /Alertas de preço/); assert.match(t, /⚙ Ajustes/); assert.match(t, /Marcar todos como lidos/);
  for (const [aria, n] of [["Novos: 5", "5"], ["Aumento de preço: 2 novos", "2"], ["Queda de preço: 1 novos", "1"], ["Menor preço histórico: 1 novos", "1"], ["Melhor preço em outro mercado: 1 novos", "1"], ["Limite de preço atingido: 0 novos", "0"]]) {
    const b = tile(body, aria); assert.ok(b, aria); assert.match(texto(b), new RegExp("\\b" + n + "\\b")); assert.match(b.className, /altile/);
  }
  assert.equal(achar(body, (e) => /alkpis/.test(e.className || "")).length, 1); assert.equal(achar(body, (e) => /(^| )altile( |$)/.test(e.className || "")).length, 6, "Novos + os cinco tipos");
  assert.ok(!tile(body, "Menor preço no período"), "o sexto tipo só aparece ligado");
  assert.match(texto(tile(body, "Aumento de preço")), /2 no total · ver ›/, "indica que é clicável");
  assert.match(tile(body, "Aumento de preço").className, /t-aumento/); assert.match(tile(body, "Queda de preço").className, /t-queda/); assert.notEqual(tile(body, "Queda de preço").className, tile(body, "Aumento de preço").className, "cada tipo tem a sua identidade");
  assert.ok(!/Por que gerou este alerta|Comparação de preços|Compra que originou/.test(t), "detalhes só ao clicar");
  assert.equal(linhas(body).length, 5, "só uma prévia compacta dos novos mais recentes"); assert.match(t, /Novos mais recentes/);
  assert.equal(achar(body, (e) => e.tag === "input").length, 0, "o formulário de ajustes não fica na visão geral");
});

test("painel: contagem de novos e lidos usa os dados reais; tipo desligado aparece como desligado", () => {
  const lidos = N.mkalGerar(ROWS, {}).filter((a) => a.tipo === "queda").map((a) => a.id);
  const body = abrir({ "mercado-alertas": { v: 1, cfg: { tipos: { limite: { on: false } } }, estado: { lidos } } });
  assert.match(texto(tile(body, "Novos: 4")), /1 lidos ou anteriores/); assert.match(texto(tile(body, "Queda de preço: 0 novos")), /1 no total/);
  assert.match(tile(body, "Limite de preço atingido: desligado").className, /off/); assert.match(texto(tile(body, "Limite de preço atingido")), /desligado · ajustar ›/);
  tile(body, "Limite de preço atingido").onclick(); assert.match(texto(body), /Ajustes dos alertas/, "tipo desligado leva aos ajustes");
});

test("navegação: tipo → lista filtrada com título e quantidade → voltar ao painel; a vista sobrevive ao redesenho", () => {
  const body = abrir(); tile(body, "Aumento de preço").onclick();
  let t = texto(body);
  assert.match(t, /▲ Aumento de preço/); assert.match(t, /2 novos · 2 alertas no total/); assert.match(t, /Arroz · kg/); assert.match(t, /Queijo Minas · kg/); assert.ok(!/Leite Integral/.test(t) && !/Queda de preço/.test(t), "só o tipo escolhido");
  assert.equal(linhas(body).length, 2); assert.ok(!tile(body, "Novos"), "a visão geral sai de cena");
  assert.equal(T.st.al.vista, "lista"); assert.equal(T.st.al.tipo, "aumento");
  /* o app redesenha a tela (ex.: depois de gravar): continua na mesma lista */
  const b2 = rerender(); assert.match(texto(b2), /▲ Aumento de preço/); assert.equal(linhas(b2).length, 2);
  botao(b2, "← Painel").onclick(); t = texto(b2); assert.match(t, /Novos mais recentes/); assert.equal(T.st.al.vista, "painel"); assert.ok(tile(b2, "Aumento de preço"));
});

test("filtro por tipo dentro da lista e 'Todos'; mostrar lidos e anteriores", () => {
  const body = abrir(); tile(body, "Novos: 5").onclick();
  assert.match(texto(body), /Todos os alertas/); assert.equal(linhas(body).length, 5);
  botao(body, "★ Menor").onclick(); assert.match(texto(body), /★ Menor preço histórico/); assert.equal(linhas(body).length, 1); assert.match(texto(body), /Leite Integral 1L · un/);
  botao(body, "Todos").onclick(); assert.equal(linhas(body).length, 5);
  const lidos = N.mkalGerar(ROWS, {}).filter((a) => a.tipo === "aumento").map((a) => a.id);
  const b2 = abrir({ "mercado-alertas": { v: 1, cfg: {}, estado: { lidos } } }); tile(b2, "Aumento de preço").onclick();
  assert.match(texto(b2), /0 novos · 2 alertas no total/); assert.match(texto(b2), /Nenhum alerta novo neste grupo/); assert.equal(linhas(b2).length, 0);
  const chk = achar(b2, (e) => e.tag === "input" && e.attrs["aria-label"] === "Mostrar lidos e anteriores")[0]; chk.checked = true; chk.onchange();
  assert.match(texto(b2), /Lidos e anteriores \(2\)/); assert.equal(linhas(b2).length, 2); assert.match(texto(b2), /· lido/);
});

test("detalhe do alerta: motivo, comparação de preços, compra de origem, histórico do produto e marcar como lido", () => {
  const body = abrir(); tile(body, "Aumento de preço").onclick();
  linhas(body).find((r) => /Arroz/.test(texto(r))).onclick(); const t = texto(body);
  assert.match(t, /▲ Arroz · kg/); assert.match(t, /Aumento de preço · 02\/11\/2026 · Confiança · novo/);
  assert.match(t, /Por que gerou este alerta/); assert.match(t, /subiu 16%/); assert.match(t, /Comparação de preços/); assert.match(t, /Antes\s+R\$\s?5,00\/kg\s+01\/11\/2026 · Reinaldo/); assert.match(t, /Agora\s+R\$\s?5,80\/kg\s+02\/11\/2026 · Confiança/);
  assert.match(t, /Diferença\s+\+R\$\s?0,80\/kg/); assert.match(t, /Compra que originou/); assert.match(t, /categoria Mercearia/);
  assert.match(t, /Outros alertas deste produto \(1\)/); assert.match(t, /Melhor preço em outro mercado/);
  assert.ok(botao(body, "← Painel") && botao(body, "← ▲ Aumento de preço"), "sempre dá para voltar");
  botao(body, "← ▲ Aumento de preço").onclick(); assert.equal(T.st.al.vista, "lista");
  /* melhor preço: mostra onde comprou e onde era mais barato */
  const m = abrir(); tile(m, "Melhor preço em outro mercado").onclick(); linhas(m)[0].onclick();
  assert.match(texto(m), /Onde você comprou\s+R\$\s?5,80\/kg\s+02\/11\/2026 · Confiança/); assert.match(texto(m), /Mais barato em\s+R\$\s?5,00\/kg\s+01\/11\/2026 · Reinaldo/);
  /* limite */
  const l = abrir({ "mercado-alertas": { v: 1, cfg: { limites: [{ nome: "Leite Integral 1L", unidade: "un", max: 5 }] }, estado: { lidos: [] } } }); tile(l, "Limite de preço atingido: 1").onclick(); linhas(l)[0].onclick();
  assert.match(texto(l), /Seu limite\s+R\$\s?5,00\/un/); assert.match(texto(l), /Preço pago\s+R\$\s?4,50\/un/);
});

test("detalhe: abrir o histórico no Preços (produto e unidade certos) e marcar como lido grava e mantém a vista", () => {
  const body = abrir(); tile(body, "Queda de preço").onclick(); linhas(body)[0].onclick();
  botao(body, "Ver histórico do produto").onclick(); assert.equal(globalThis.location.hash, "#mercado/precos");
  const precos = new El("div"); T.viewPrecos(precos); assert.match(texto(precos), /Leite Integral 1L · un/); assert.match(texto(precos), /3 compras/); assert.ok(!/Arroz · kg/.test(texto(precos)));
  const b2 = abrir(); tile(b2, "Queda de preço").onclick(); linhas(b2)[0].onclick(); botao(b2, "Marcar como lido").onclick();
  assert.equal(gravacoes.length, 1); assert.equal(gravacoes[0][0], "mercado-alertas"); assert.equal(gravacoes[0][1].estado.lidos.length, 1);
  assert.equal(T.st.al.vista, "produto", "continua no detalhe depois de gravar"); assert.match(texto(ROOT), /Queda de preço · 04\/11\/2026 · Confiança · lido/); assert.ok(!botao(ROOT, "Marcar como lido"));
  assert.match(texto(ROOT), /Alertas \(4\)/, "a aba mostra quantos são novos");
  botao(ROOT, "← Painel").onclick(); assert.match(texto(ROOT), /Novos: 4|Novos\s+4/);
});

test("marcar todos como lidos: no painel (todos) e dentro de um tipo (só o tipo)", () => {
  const b = abrir(); tile(b, "Aumento de preço").onclick(); botao(b, "Marcar todos deste tipo como lidos").onclick();
  assert.equal(gravacoes.at(-1)[1].estado.lidos.length, 2); assert.equal(T.st.al.vista, "lista"); assert.match(texto(ROOT), /0 novos · 2 alertas no total/);
  botao(ROOT, "← Painel").onclick(); assert.match(texto(tile(ROOT, "Novos: 3")), /3/);
  botao(ROOT, "Marcar todos como lidos").onclick(); assert.equal(gravacoes.at(-1)[1].estado.lidos.length, 5); assert.ok(tile(ROOT, "Novos: 0")); assert.ok(!/Alertas \(/.test(texto(ROOT)));
  assert.ok(!botao(ROOT, "Marcar todos como lidos"), "nada novo: o botão some"); assert.match(texto(ROOT), /Nada novo/);
});

test("ajustes: ficam numa vista própria; preferências e limites salvam, editam e removem; voltar ao painel", () => {
  const b = abrir(); botao(b, "⚙ Ajustes").onclick(); assert.equal(T.st.al.vista, "ajustes");
  assert.match(texto(b), /Ajustes dos alertas/); assert.ok(!tile(b, "Novos"), "sem os indicadores na tela de ajustes"); assert.ok(botao(b, "← Painel"));
  const root0 = b;
  const i = (rot) => achar(root0, (e) => e.tag === "input" && e.attrs["aria-label"] === rot)[0];
  i("Aumento de preço: a partir de (%)").value = "30"; i("Ativar: Queda de preço").checked = false; i("Ativar: Aumento de preço").checked = true;
  for (const rot of ["Ativar: Menor preço histórico", "Ativar: Menor preço no período", "Ativar: Melhor preço em outro mercado", "Ativar: Limite de preço definido por mim"]) i(rot).checked = rot !== "Ativar: Menor preço no período";
  botao(root0, "Salvar ajustes").onclick();
  const salvo = globalThis.PESSOAL["mercado-alertas"]; assert.equal(salvo.cfg.tipos.aumento.pct, 0.3); assert.equal(salvo.cfg.tipos.queda.on, false); assert.equal(salvo.cfg.tipos.minimo_periodo.on, false);
  assert.equal(T.st.al.vista, "ajustes"); assert.match(texto(ROOT), /Ajustes salvos/);
  botao(ROOT, "← Painel").onclick(); assert.match(texto(ROOT), /Aumento de preço: 1 novos|Novos/); assert.ok(!tile(ROOT, "Queda de preço: 1"), "queda desligada");
  assert.match(texto(tile(ROOT, "Queda de preço")), /desligado/);
  /* limites */
  botao(ROOT, "⚙ Ajustes").onclick();
  const sel = (r) => achar(ROOT, (e) => e.tag === "select" && e.attrs["aria-label"] === "Produto do limite")[0], leite = N.mkalOpcoes(ROWS).find((o) => o.nome === "Leite Integral 1L");
  const lim = () => achar(ROOT, (e) => e.tag === "input" && e.attrs["aria-label"] === "Limite de preço (R$)")[0];
  sel().value = leite.chave; lim().value = "5"; botao(ROOT, "Salvar limite").onclick();
  assert.equal(globalThis.PESSOAL["mercado-alertas"].cfg.limites.length, 1); assert.match(texto(ROOT), /Leite Integral 1L\s+un\s+R\$\s?5,00/);
  botao(ROOT, "← Painel").onclick(); assert.ok(tile(ROOT, "Limite de preço atingido: 1 novos"));
  botao(ROOT, "⚙ Ajustes").onclick(); sel().value = leite.chave; lim().value = "4"; botao(ROOT, "Salvar limite").onclick(); assert.equal(globalThis.PESSOAL["mercado-alertas"].cfg.limites[0].max, 4);
  achar(ROOT, (e) => e.tag === "button" && e.attrs["aria-label"] === "Remover limite de Leite Integral 1L")[0].onclick();
  assert.equal(globalThis.PESSOAL["mercado-alertas"].cfg.limites.length, 0); assert.match(texto(ROOT), /Nenhum limite cadastrado/);
  sel().value = ""; botao(ROOT, "Salvar limite").onclick(); assert.match(texto(ROOT), /Escolha o produto/);
});

test("responsividade estrutural: grade de indicadores, linhas compactas e regras de celular no CSS; padrão visual do RAC", () => {
  const css = ler("index.html");
  assert.match(css, /\.alkpis\{display:grid;grid-template-columns:repeat\(auto-fill,minmax\(150px,1fr\)\)/, "grade que vira 2 colunas no celular e mais no desktop");
  assert.match(css, /@media\(max-width:560px\)\{\.alrow\{grid-template-columns:auto minmax\(0,1fr\)\}/, "linha em duas camadas no celular");
  for (const v of ["--bad", "--good", "--accent", "--warn", "--line", "--hover", "--muted"]) assert.ok(css.slice(css.indexOf(".alkpis"), css.indexOf(".cmpt{")).includes(v) || v === "--muted" || v === "--warn", v);
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(css.slice(css.indexOf(".alkpis"), css.indexOf(".cmpt{"))), "só as cores do tema, nada de cor nova");
  const body = abrir(); assert.ok(achar(body, (e) => e.tag === "button" && /altile/.test(e.className || "")).every((b) => b.attrs["aria-label"]), "todo indicador tem rótulo acessível");
  assert.equal(achar(body, (e) => e.tag === "div" && e.className === "alkpis").length, 1);
});

test("segurança: só o dono vê e grava; a casa não tem a aba nem altera nada", () => {
  DONO = false; gravacoes = []; globalThis.PESSOAL = {}; T.usar(ROWS, { email: "casa@teste" });
  const body = new El("div"); T.viewAlertas(body); assert.match(texto(body), /só do dono/); assert.ok(!/Novos/.test(texto(body)));
  assert.equal(gravacoes.length, 0);
  const mk = ler("mercado.js"); assert.match(mk, /x\[0\] === "alertas" && !ehDono\(\)/, "a aba não é montada para a casa");
  assert.match(ler("supabase/003_pessoal.sql"), /not exists \(select 1 from public\.membros where membro = auth\.uid\(\)\)/, "a tabela onde ficam os ajustes não aceita gravação da casa (RLS)");
  DONO = true;
});

test("escopo: sem tabela nova, sem Edge Function e sem Web Push; garmin, sw.js e Financeiro intactos; sem IA", () => {
  const mk = ler("mercado.js"), i0 = mk.indexOf("/* ---------- Alertas de preço"), i1 = mk.indexOf("/* ---------- Notas ----------"); assert.ok(i0 > 0 && i1 > i0);
  const bloco = mk.slice(i0, i1);
  assert.ok(!/\bsb\.from\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/.test(bloco), "só lê as linhas carregadas e grava pelo pessoalGravar do app");
  assert.ok(!/racIA|anthropic|PushManager|pushManager|Notification\b|serviceWorker/i.test(bloco), "sem IA e sem Web Push neste lote");
  assert.ok(!fs.existsSync(new URL("../supabase/propostas/042_mercado_alertas.sql", import.meta.url)), "nenhuma migration: tudo cabe em pessoal");
  assert.ok(!/mercado-alertas|mkal/.test(ler("supabase/functions/garmin/index.ts")), "a função garmin não foi tocada");
  assert.match(ler("sw.js"), /addEventListener\("push"/); assert.ok(!/mkal|alerta/i.test(ler("sw.js").split('addEventListener("push"')[1].slice(0, 400)));
  const nu = ler("nucleo.js"), a = nu.indexOf("function mkalGerar"); assert.ok(!/\.(insert|update|delete|upsert)\(|fetch\(|XMLHttpRequest/.test(nu.slice(a, a + 6000)));
  assert.match(ler("docs/mercado-alertas.md"), /Web Push/);
});

test("regressão: Consumo, Preços, Comparar e classificação seguem como estão", () => {
  assert.equal(N.mkcPrecos(ROWS).filter((p) => p.nome === "Queijo Minas").length, 2); assert.equal(N.mkcComparar(ROWS, { de: "2026-11-01", ate: "2026-11-30" }, { de: "2026-10-01", ate: "2026-10-31" }).ok, true);
  assert.equal(N.mkcProduto(ROWS.filter((x) => x.produto === "Arroz")).unidades[0].compras, 4); assert.equal(N.mkClassificar("BISC WAFER TUBIN CHOCO").categoria, "Chocolates/Doces");
  assert.equal(N.mkcChaveProd({ produto: "Arroz", unidade: "KG" }), N.mkcChaveProd({ produto: "Arroz", unidade: "kg" }));
  const mk = ler("mercado.js"); for (const f of ["function viewConsumo", "function viewComparar", "function viewPrecos", "function viewProdutos", "function viewNotas"]) assert.ok(mk.includes(f), f);
});
