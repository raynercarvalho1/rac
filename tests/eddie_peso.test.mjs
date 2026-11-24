// Eddie: todo tipo de registro aceita o "Peso do dia (kg, opcional)". Preenchido, vira uma pesagem de verdade (tipo "peso", ligada por dados.pesoDe) que alimenta
// o quadro, o gráfico e o resumo de peso; em branco, nada muda. Olivia não ganha o campo. Roda o formulário real (js/familia.js) com uma tela mínima e um banco falso. Sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const espera = () => new Promise((r) => setTimeout(r, 0));
class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.kids = []; this.value = ""; this.hidden = false; this.ouvintes = {}; this.files = []; }
  setAttribute(k, v) { this.attrs[k] = v; } appendChild(c) { this.kids.push(c); return c; } addEventListener(t, f) { (this.ouvintes[t] = this.ouvintes[t] || []).push(f); }
  get firstChild() { return this.kids[0]; } set textContent(v) { this.attrs.text = v; } get textContent() { return this.attrs.text ?? ""; }
  get texto() { return (this.attrs.text ?? "") + this.kids.map((k) => (typeof k === "string" ? k : k.texto)).join(" "); }
}
function h(tag, attrs, ...filhos) {
  const e = new El(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v === undefined || v === null || v === false) continue; if (k === "value") e.value = String(v); else e.attrs[k] = v; }
  const add = (c) => { if (c === null || c === undefined || c === false) return; if (Array.isArray(c)) c.forEach(add); else e.kids.push(c); };
  filhos.forEach(add);
  return e;
}
const todos = (no, f, acc = []) => { if (typeof no === "string") return acc; if (f(no)) acc.push(no); no.kids.forEach((k) => todos(k, f, acc)); return acc; };
const campo = (no, ph) => todos(no, (e) => e.tag === "input" && e.attrs.placeholder === ph)[0];
const botao = (no, t) => todos(no, (e) => e.tag === "button" && e.attrs.text === t)[0];
const rotulo = (no, t) => todos(no, (e) => e.tag === "label" && e.kids[0] === t)[0];
const porRot = (no, t) => todos(no, (e) => e.tag === "label" && e.kids[0] === t)[0].kids[1];

function montar() {
  const gravados = []; let seq = 0;
  const fim = (d) => Promise.resolve({ data: d, error: null });
  const SB = { from: () => ({
    insert: (d) => { const id = "n" + ++seq; gravados.push(["insert", d, id]); return { select: () => ({ single: () => fim({ id, arquivos: [] }) }) }; },
    update: (d) => ({ eq: (c, v) => { gravados.push(["update", d, v]); const r = fim({ id: v, arquivos: [] }); r.select = () => ({ single: () => fim({ id: v, arquivos: [] }) }); return r; } }),
    delete: () => ({ eq: (c, v) => { gravados.push(["delete", null, v]); return fim(null); } }) }) };
  const ctx = vm.createContext({ console, Promise, Object, Array, JSON, Date, Math, String, Number, Error, isFinite, parseInt, parseFloat, RegExp, h, panel: (t) => h("div", { class: "panel" }, h("h2", { text: t })), hojeISO: () => "2026-11-24",
    SB, sbOk: (r) => { if (r.error) throw r.error; return r.data; }, enviarArquivos: () => Promise.resolve([]), dataBR: (d) => d, fmtN: String, dadosDe: (r) => (r && r.dados) || {},
    atuModulo() {}, window: {}, document: {}, location: {}, localStorage: { getItem: () => null, setItem() {} } });
  for (const f of ["js/fontes.js", "js/fonte-familia.js"]) vm.runInContext(ler(f), ctx, { filename: f });
  vm.runInContext(ler("js/familia.js") + "\n;globalThis.__f={famForm:famForm};", ctx);
  return { ctx, gravados };
}
const tipoSel = (f) => todos(f, (e) => e.tag === "select")[0];
const trocar = (f, v) => { const s = tipoSel(f); s.value = v; (s.ouvintes.change || []).forEach((fn) => fn()); };
const campoPeso = (f) => campo(f, "Ex.: 12,5");
const titulo = (f) => porRot(f, "Título");
const salvar = async (f) => { botao(f, "Salvar").onclick(); await espera(); await espera(); await espera(); await espera(); };
const statusTxt = (f) => todos(f, (e) => e.tag === "p" && e.attrs.role === "status")[0].attrs.text;

test("Eddie: o campo Peso do dia aparece em todos os tipos, menos em Peso (que já tem o seu); a Olivia não ganha o campo", () => {
  const { ctx } = montar(), f = ctx.__f.famForm("eddie", null, () => {}, () => {}), lPeso = rotulo(f, "Peso do dia (kg, opcional)");
  assert.ok(lPeso, "o campo existe para o Eddie"); assert.ok(campoPeso(f));
  for (const o of todos(tipoSel(f), (e) => e.tag === "option").map((x) => x.value)) {
    if (o === "peso") continue;
    trocar(f, o); assert.equal(lPeso.hidden, false, "visível no tipo " + o);
  }
  trocar(f, "peso"); assert.equal(lPeso.hidden, true, "no tipo Peso já existe o campo Peso (kg)");
  const ol = ctx.__f.famForm("olivia", null, () => {}, () => {}); assert.equal(rotulo(ol, "Peso do dia (kg, opcional)"), undefined, "a Olivia fica como estava");
});

test("Eddie: sem o peso o registro grava como sempre, uma vez só e sem criar pesagem", async () => {
  const { ctx, gravados } = montar(), f = ctx.__f.famForm("eddie", null, () => {}, () => {});
  titulo(f).value = "Consulta de rotina"; trocar(f, "consulta"); await salvar(f);
  assert.equal(gravados.length, 1); assert.equal(gravados[0][1].tipo, "consulta"); assert.equal((gravados[0][1].dados || {}).peso, undefined); assert.equal((gravados[0][1].dados || {}).pesoRegId, undefined);
});

test("Eddie: com o peso, grava o registro e cria a pesagem (tipo peso, mesma data, ligada ao registro) e guarda o vínculo", async () => {
  const { ctx, gravados } = montar(); let pronto = 0, f = ctx.__f.famForm("eddie", null, () => { pronto++; }, () => {});
  titulo(f).value = "Vacina V10"; trocar(f, "vacina"); campoPeso(f).value = "12,5"; await salvar(f);
  assert.equal(pronto, 1);
  const [reg, pes, lig] = gravados;
  assert.equal(reg[0], "insert"); assert.equal(reg[1].tipo, "vacina"); assert.equal(reg[1].dados.peso, 12.5);
  assert.equal(pes[0], "insert"); assert.equal(pes[1].tipo, "peso"); assert.equal(pes[1].valor, "12,5"); assert.equal(pes[1].data, reg[1].data); assert.equal(pes[1].quem, "eddie");
  assert.equal(pes[1].dados.pesoDe, reg[2], "a pesagem aponta para o registro"); assert.match(pes[1].titulo, /vacina/i);
  assert.equal(lig[0], "update"); assert.equal(lig[2], reg[2]); assert.equal(lig[1].dados.pesoRegId, pes[2], "o registro guarda o vínculo e o peso");
});

test("Eddie: peso inválido (texto, zero, absurdo) é recusado sem gravar nada", async () => {
  for (const ruim of ["abc", "0", "400", "12,5kg", "-3"]) {
    const { ctx, gravados } = montar(), f = ctx.__f.famForm("eddie", null, () => {}, () => {});
    titulo(f).value = "Consulta"; campoPeso(f).value = ruim; await salvar(f);
    assert.equal(gravados.length, 0, "nada gravado com " + ruim); assert.match(statusTxt(f), /peso precisa ser um número/);
  }
});

test("Eddie: editar um registro que já tem pesagem a atualiza (valor e data) e apagar o campo apaga só essa pesagem", async () => {
  const reg = { id: "r9", tipo: "consulta", data: "2026-11-01", titulo: "Consulta", dados: { peso: 12.5, pesoRegId: "p9" } };
  let { ctx, gravados } = montar(), f = ctx.__f.famForm("eddie", reg, () => {}, () => {});
  assert.equal(campoPeso(f).value, "12,5", "o campo vem preenchido na edição");
  campoPeso(f).value = "12,8"; await salvar(f);
  assert.deepEqual(gravados.map((g) => g[0] + ":" + g[2]), ["update:r9", "update:p9"]); assert.equal(gravados[1][1].valor, "12,8"); assert.equal(gravados[0][1].dados.pesoRegId, "p9");
  ({ ctx, gravados } = montar()); f = ctx.__f.famForm("eddie", reg, () => {}, () => {});
  campoPeso(f).value = ""; await salvar(f);
  assert.deepEqual(gravados.map((g) => g[0] + ":" + g[2]), ["update:r9", "delete:p9"], "só a pesagem ligada é apagada");
  assert.equal(gravados[0][1].dados.peso, undefined); assert.equal(gravados[0][1].dados.pesoRegId, undefined);
});

test("Eddie: registro do tipo Peso continua como antes (usa o campo Peso (kg), sem pesagem extra)", async () => {
  const { ctx, gravados } = montar(), f = ctx.__f.famForm("eddie", null, () => {}, () => {});
  trocar(f, "peso"); titulo(f).value = "Pesagem"; todos(f, (e) => e.tag === "label" && e.kids[0] && e.kids[0].tag === "span")[0];
  const valor = todos(f, (e) => e.tag === "input" && e.attrs.type === "text")[1]; valor.value = "12,4"; await salvar(f);
  assert.equal(gravados.length, 1); assert.equal(gravados[0][1].tipo, "peso"); assert.equal(gravados[0][1].valor, "12,4");
});
