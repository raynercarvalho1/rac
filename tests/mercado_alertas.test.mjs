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
  DONO = true; gravacoes = []; globalThis.PESSOAL = pessoal || {}; seq = seq; globalThis.location.hash = ""; T.usar(ROWS, { email: "dono@teste" });
  const body = new El("div"); T.viewAlertas(body); return body;
}
const botao = (raiz, rot, i = 0) => achar(raiz, (e) => e.tag === "button" && texto(e).trim() === rot)[i];
const raiz = () => ROOT;

test("tela: alertas novos, cartões com produto, unidade, data, estabelecimento, preços, percentual e motivo", () => {
  const body = abrir(); const t = texto(body);
  assert.match(t, /Alertas de preço/); assert.match(t, /Novos\s+5/); assert.match(t, /Aumento de preço · novo/); assert.match(t, /Queda de preço · novo/); assert.match(t, /Menor preço histórico · novo/); assert.match(t, /Melhor preço em outro mercado · novo/);
  assert.match(t, /Arroz · kg · 02\/11\/2026 · Confiança/); assert.match(t, /Antes R\$\s?5,00\/kg → agora R\$\s?5,80\/kg/); assert.match(t, /subiu 16%/); assert.match(t, /Reinaldo R\$\s?5,00\/kg × Confiança R\$\s?5,80\/kg/);
  assert.match(t, /não é o menor preço do mercado|Não é o menor preço do mercado/i); assert.ok(!/Limite de preço atingido · novo/.test(t), "sem limite cadastrado não há alerta de limite");
  assert.ok(achar(body, (e) => e.tag === "span" && /vt/.test(e.className || "")).length >= 4, "variação em ▲/▼");
});

test("tela: ver histórico abre Preços no produto e unidade certos; marcar como lido grava e atualiza a contagem", () => {
  const body = abrir();
  botao(body, "Ver histórico do produto", 0).onclick();
  assert.equal(globalThis.location.hash, "#mercado/precos");
  /* o clique levou o produto certo (nome + unidade): a aba Preços abre o detalhe dele, e só da unidade do alerta */
  const precos = new El("div"); T.viewPrecos(precos); const tp = texto(precos);
  assert.match(tp, /Leite Integral 1L · un/); assert.match(tp, /3 compras/); assert.ok(!/Arroz · kg/.test(tp));
  const b2 = abrir(); botao(b2, "Marcar como lido", 0).onclick();
  assert.equal(gravacoes.length, 1); assert.equal(gravacoes[0][0], "mercado-alertas"); assert.equal(gravacoes[0][1].estado.lidos.length, 1);
  assert.match(texto(ROOT), /Novos\s+4/); assert.match(texto(ROOT), /Alertas \(4\)/, "a aba mostra quantos são novos");
  botao(ROOT, "Marcar todos como lidos").onclick(); assert.match(texto(ROOT), /Novos\s+0/); assert.match(texto(ROOT), /Nenhum alerta novo/); assert.ok(!/Alertas \(/.test(texto(ROOT)));
  assert.equal(gravacoes.length, 2);
  const chk = achar(ROOT, (e) => e.tag === "input" && e.attrs["aria-label"] === "Mostrar lidos e anteriores")[0]; chk.checked = true; chk.onchange();
  assert.match(texto(ROOT), /Lidos e anteriores \(5\)/);
});

test("tela: ajustes salvam preferências e limites, e o limite gera alerta; remover tira", () => {
  abrir(); const sub = ROOT;
  const inp = (rot) => achar(ROOT, (e) => e.tag === "input" && e.attrs["aria-label"] === rot)[0];
  const aumPct = inp("Aumento de preço: a partir de (%)"); aumPct.value = "30"; inp("Ativar: Queda de preço").checked = false; inp("Ativar: Aumento de preço").checked = true;
  for (const rot of ["Ativar: Menor preço histórico", "Ativar: Menor preço no período", "Ativar: Melhor preço em outro mercado", "Ativar: Limite de preço definido por mim"]) inp(rot).checked = rot !== "Ativar: Menor preço no período";
  botao(ROOT, "Salvar ajustes").onclick();
  const salvo = globalThis.PESSOAL["mercado-alertas"]; assert.equal(salvo.cfg.tipos.aumento.pct, 0.3); assert.equal(salvo.cfg.tipos.queda.on, false); assert.equal(salvo.cfg.tipos.minimo_periodo.on, false);
  assert.match(texto(ROOT), /Ajustes salvos/); assert.ok(!/Queda de preço · novo/.test(texto(ROOT)), "queda desligada");
  /* limite */
  const sel = achar(ROOT, (e) => e.tag === "select" && e.attrs["aria-label"] === "Produto do limite")[0], leite = N.mkalOpcoes(ROWS).find((o) => o.nome === "Leite Integral 1L");
  sel.value = leite.chave; inp("Limite de preço (R$)").value = "5"; botao(ROOT, "Salvar limite").onclick();
  assert.equal(globalThis.PESSOAL["mercado-alertas"].cfg.limites.length, 1); assert.match(texto(ROOT), /Limite de preço atingido · novo/); assert.match(texto(ROOT), /seu limite R\$\s?5,00\/un/); assert.match(texto(ROOT), /Leite Integral 1L\s+un\s+R\$\s?5,00/);
  /* editar: salvar de novo com outro valor */
  const sel2 = achar(ROOT, (e) => e.tag === "select" && e.attrs["aria-label"] === "Produto do limite")[0]; sel2.value = leite.chave; achar(ROOT, (e) => e.tag === "input" && e.attrs["aria-label"] === "Limite de preço (R$)")[0].value = "4"; botao(ROOT, "Salvar limite").onclick();
  assert.equal(globalThis.PESSOAL["mercado-alertas"].cfg.limites[0].max, 4); assert.ok(!/Limite de preço atingido · novo/.test(texto(ROOT)));
  achar(ROOT, (e) => e.tag === "button" && e.attrs["aria-label"] === "Remover limite de Leite Integral 1L")[0].onclick();
  assert.equal(globalThis.PESSOAL["mercado-alertas"].cfg.limites.length, 0); assert.match(texto(ROOT), /Nenhum limite cadastrado/);
  const ruim = achar(ROOT, (e) => e.tag === "select" && e.attrs["aria-label"] === "Produto do limite")[0]; ruim.value = ""; botao(ROOT, "Salvar limite").onclick();
  assert.match(texto(ROOT), /Escolha o produto|Escolha o produto\./);
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
