// Reestruturação visual, Lote 2 (docs/planejamento/11-reestruturacao-visual.md): o bloco "MBA e estudos" do Hoje (wMbaHoje, js/mba.js).
// Roda o js/mba.js de verdade num DOM mínimo, com relógio fixo e sem rede nem banco; as contas puras ficam em tests/nucleo.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo, ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");

class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.attrs = {}; this.className = ""; this._t = null; this.parentNode = null; this.dataset = {}; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === "class") this.className = String(v); }
  get textContent() { return this._t != null ? this._t : this.children.map((c) => c.textContent).join(" "); }
  set textContent(v) { this._t = String(v); this.children = []; }
  set innerHTML(v) { this.children = []; this._t = null; }
  get innerHTML() { return ""; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  addEventListener() {}
}
const doc = { createElement: (t) => new El(t), createTextNode: (t) => { const e = new El("#text"); e._t = String(t); return e; } };
const varre = (e, f, acc = []) => { if (f(e)) acc.push(e); e.children.forEach((c) => varre(c, f, acc)); return acc; };
const botoes = (e, txt) => varre(e, (x) => x.tagName === "BUTTON" && x.textContent.includes(txt));
const links = (e, txt) => varre(e, (x) => x.tagName === "A" && x.textContent.includes(txt));

const AGORA = Date.parse("2026-11-22T10:00:00-03:00");
function mbaFixo(extra = {}) {
  const gravou = [], app = ler("js/app.js"), helpers = app.slice(app.indexOf("  function h(tag,attrs){"), app.indexOf("  /* Bloco com título de editoria"));
  const mba = { curso: "MBA Data Science", aulas: [{ id: "a4", data: "2026-11-22", hora: "18:00", t: "Palestra de carreira" }, { id: "a2", data: "2026-11-20", hora: "19:00", t: "Estatística" }],
    avaliacoes: [{ id: "v1", t: "Prova de SQL", ate: "2026-11-25", link: "https://prova.exemplo" }], financeiro: { parcelas: [{ k: "1", v: 626.85, venc: "2026-12-10" }] },
    disciplinas: [{ id: "d1", nome: "Estatística", status: "andamento", roteiro: [{ k: "t1", t: "Testes de médias" }], exercicios: [] }], ...(extra.mba || {}) };
  const ctx = { console, Object, Array, JSON, String, Number, Math, Promise, isNaN, parseInt, parseFloat, NUCLEO: N, PESSOAL: { mba, mbaLinks: {}, mbaFeito: {}, ...(extra.pessoal || {}) }, document: doc,
    Date: class extends Date { static now() { return AGORA; } }, hojeISO: () => "2026-11-22", dataBR: (d) => d.split("-").reverse().join("/"), quando: (x) => x, BRL: (v) => "R$ " + v.toFixed(2).replace(".", ","),
    ext: (href, text, cls) => { const a = new El("a"); a.attrs.href = href; a.className = cls || "link"; a.textContent = text; return a; }, urlAbs: (x) => x,
    wCard: (t) => { const p = new El("div"); p.className = "panel"; p.titulo = t; return p; }, logErro: () => {},
    pessoalGravar: (k, v) => { gravou.push([k, JSON.parse(JSON.stringify(v))]); ctx.PESSOAL[k] = v; }, window: {}, location: { hash: "#rachoje" } };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(helpers, ctx, { filename: "app.js (h)" }); vm.runInContext(ler("js/mba.js"), ctx, { filename: "js/mba.js" });
  return { ctx, gravou };
}

test("MBA no Hoje: mostra a aula ao vivo, a aula para assistir, a avaliação, o boleto e onde parei, cada um com o botão que resolve", () => {
  const { ctx } = mbaFixo(), p = ctx.wMbaHoje(), t = p.textContent;
  assert.equal(p.titulo, "MBA e estudos");
  for (const s of ["Aula hoje às 18:00", "Palestra de carreira", "Aula para assistir", "Estatística", "Prova de SQL", "Próximo boleto: R$ 626,85", "Onde parei: Testes de médias"]) assert.ok(t.includes(s), s);
  assert.equal(links(p, "▶ Ao vivo").length, 1); assert.ok(links(p, "▶ Assistir").length >= 1); assert.equal(botoes(p, "Assistida").length, 1); assert.equal(botoes(p, "Já respondi").length, 1);
  assert.ok(links(p, "Continuar").some((a) => a.attrs.href === "#mba/disc-d1"), "Continuar leva à disciplina");
});
test("MBA no Hoje: 'Assistida' e 'Já respondi' gravam a marca certa em PESSOAL.mbaFeito (sem tabela nova) e o item sai da lista", () => {
  const { ctx, gravou } = mbaFixo(), p = ctx.wMbaHoje();
  botoes(p, "Assistida")[0].onclick();
  assert.equal(gravou.length, 1); assert.equal(gravou[0][0], "mbaFeito"); assert.ok(gravou[0][1]["au:a2"], "marca au:<id> da aula");
  assert.equal(botoes(p, "Assistida").length, 0, "a aula marcada some do bloco"); assert.ok(!p.textContent.includes("Aula para assistir"));
  botoes(p, "Já respondi")[0].onclick();
  assert.ok(gravou[1][1]["av:v1"] && gravou[1][1]["au:a2"], "marca av:<id> sem apagar a anterior"); assert.ok(!p.textContent.includes("Prova de SQL"), "a avaliação respondida some");
});
test("MBA no Hoje: sem curso cadastrado orienta, e sem pendência diz que não há nada, sem quebrar", () => {
  assert.match(mbaFixo({ pessoal: { mba: null } }).ctx.wMbaHoje().textContent, /ainda não foi preenchido/);
  const vazio = mbaFixo({ mba: { aulas: [], avaliacoes: [], financeiro: null, disciplinas: [] } }).ctx.wMbaHoje();
  assert.match(vazio.textContent, /Nada pendente no MBA agora/); assert.equal(botoes(vazio, "").length, 0);
});
test("MBA no Hoje: avaliação vencida e boleto atrasado aparecem como alerta", () => {
  const { ctx } = mbaFixo({ mba: { avaliacoes: [{ id: "v9", t: "Pesquisa antiga", ate: "2026-11-10" }], financeiro: { parcelas: [{ k: "1", v: 100, venc: "2026-11-05" }] } } }), p = ctx.wMbaHoje();
  assert.match(p.textContent, /1 avaliação vencida sem resposta/); assert.match(p.textContent, /atrasado/);
  assert.ok(varre(p, (x) => x.tagName === "LI" && /alerta/.test(x.className)).length >= 2, "os dois itens carregam a classe de alerta");
});
test("MBA no Hoje: entrega a linha do MBA ao 'O que mudou' (aulas para assistir e a próxima avaliação), e a atualiza ao marcar", () => {
  const { ctx } = mbaFixo(), got = []; ctx.hjMudouAdd = (k, l) => got.push([k, JSON.parse(JSON.stringify(l))]);
  const p = ctx.wMbaHoje(); assert.deepEqual(got[0], ["mba", [{ texto: "MBA: 1 aula para assistir · avaliação até 25/11", href: "#mba" }]]);
  botoes(p, "Assistida")[0].onclick(); assert.deepEqual(got[got.length - 1], ["mba", [{ texto: "MBA: avaliação até 25/11", href: "#mba" }]], "marcar atualiza a linha");
  const { ctx: c2 } = mbaFixo({ mba: { aulas: [], avaliacoes: [], financeiro: null, disciplinas: [] } }), g2 = []; c2.hjMudouAdd = (k, l) => g2.push([k, JSON.parse(JSON.stringify(l))]); c2.wMbaHoje(); assert.deepEqual(g2[0], ["mba", []], "sem pendência, nenhuma linha");
});
