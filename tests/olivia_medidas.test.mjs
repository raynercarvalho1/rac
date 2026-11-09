// Olivia: o formulário de registro ganha Comprimento e Perímetro cefálico (cm) no tipo "Peso e medidas" (guardados em dados.altura e dados.cabeca, como os importados da OMS)
// e a opção "Antipulgas / vermífugo" sai da lista dela (continua para o Eddie). Roda o formulário de verdade (js/familia.js) com uma tela mínima e um banco falso. Sem rede.
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
const igual = (a, b, m) => assert.equal(JSON.stringify(a), JSON.stringify(b), m);

function montar() {
  const gravados = [];
  const SB = { from: () => ({ insert: (d) => { gravados.push(["insert", d]); return { select: () => ({ single: () => Promise.resolve({ data: { id: "r1", arquivos: [] }, error: null }) }) }; },
    update: (d) => { gravados.push(["update", d]); return { eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: "r1", arquivos: [] }, error: null }) }) }) }; } }) };
  const ctx = vm.createContext({ console, Promise, Object, Array, JSON, Date, Math, String, Number, Error, isFinite, parseInt, parseFloat, RegExp, h, panel: (t) => h("div", { class: "panel" }, h("h2", { text: t })), hojeISO: () => "2026-11-09", SB, sbOk: (r) => { if (r.error) throw new Error(r.error.message); return r.data; },
    atuModulo() {}, window: {}, document: {}, location: {}, localStorage: { getItem: () => null, setItem() {} } });
  vm.runInContext(ler("js/familia.js") + "\n;globalThis.__f={famForm:famForm,tiposDe:tiposDe,FAM:FAM};", ctx);
  return { ctx, gravados };
}
/* o select de verdade tem .value = opção marcada; o falso não: copia */
const marcar = (form) => { const sel = todos(form, (e) => e.tag === "select")[0]; const m = todos(sel, (e) => e.tag === "option" && e.attrs.selected !== undefined)[0]; sel.value = m ? m.value : ""; return form; };
const opcoes = (form) => todos(form, (e) => e.tag === "option").map((o) => o.value);
const medidas = (form) => todos(form, (e) => e.tag === "div" && e.attrs.class === "two" && e.kids.some((k) => typeof k !== "string" && k.texto.includes("Comprimento")))[0];

test("Olivia: a lista de tipos não tem mais Antipulgas / vermífugo e o Peso vira 'Peso e medidas'; o Eddie continua com Antipulgas", () => {
  const { ctx } = montar(), olivia = ctx.__f.famForm("olivia", null, () => {}, () => {}), eddie = ctx.__f.famForm("eddie", null, () => {}, () => {});
  assert.ok(!opcoes(olivia).includes("preventivo")); assert.ok(opcoes(olivia).includes("peso")); assert.ok(!todos(olivia, (e) => e.tag === "option").some((o) => /Antipulgas/.test(o.attrs.text)));
  assert.ok(todos(olivia, (e) => e.tag === "option").some((o) => o.value === "peso" && o.attrs.text === "Peso e medidas"));
  assert.ok(opcoes(eddie).includes("preventivo"), "o Eddie (cachorro) continua com antipulgas"); assert.ok(todos(eddie, (e) => e.tag === "option").some((o) => o.value === "peso" && o.attrs.text === "Peso"));
  assert.equal(medidas(eddie), undefined, "o Eddie não ganha os campos de bebê");
  /* um registro antigo da Olivia desse tipo, se existisse, continuaria editável */
  assert.ok(opcoes(ctx.__f.famForm("olivia", { id: "x", tipo: "preventivo", data: "2026-01-01", titulo: "x", dados: {} }, () => {}, () => {})).includes("preventivo"));
});
test("Olivia: Comprimento e Perímetro cefálico aparecem só no tipo Peso e medidas e gravam em dados.altura e dados.cabeca", async () => {
  const { ctx, gravados } = montar(), f = ctx.__f.famForm("olivia", null, () => {}, () => {}), sel = todos(f, (e) => e.tag === "select")[0], m = medidas(f);
  assert.ok(m); assert.equal(m.hidden, true, "escondidos no tipo Exame");
  sel.value = "peso"; sel.ouvintes.change.forEach((fn) => fn()); assert.equal(m.hidden, false);
  const titulo = porRot(f, "Título");
  titulo.value = "Consulta do 5º mês"; campo(f, "Ex.: 61,5").value = "65,5"; campo(f, "Ex.: 42").value = "43";
  botao(f, "Salvar").onclick(); await espera(); await espera();
  assert.equal(gravados.length, 1); const g = gravados[0][1]; assert.equal(g.tipo, "peso"); assert.equal(g.valor, null, "só medidas, sem peso no dia: vale");
  igual([g.dados.altura, g.dados.cabeca], [65.5, 43]);
});
test("Olivia: valida as medidas (faixa e número), exige ao menos uma medida no tipo peso e mantém o resto dos dados do registro", async () => {
  const { ctx, gravados } = montar(), reg = { id: "r1", tipo: "peso", data: "2026-10-13", titulo: "Pesagem", valor: "6,8", dados: { altura: 60, cabeca: 42, custo: 10, outro: "fica" }, arquivos: [] };
  const f = marcar(ctx.__f.famForm("olivia", reg, () => {}, () => {})), st = todos(f, (e) => e.tag === "p" && e.attrs.role === "status")[0], c = campo(f, "Ex.: 61,5"), k = campo(f, "Ex.: 42");
  assert.equal(c.value, "60"); assert.equal(k.value, "42", "edição mostra o que já está gravado (importado da OMS)");
  for (const [v, msg] of [["abc", /comprimento/], ["300", /comprimento/], ["5", /comprimento/]]) { c.value = v; botao(f, "Salvar").onclick(); await espera(); assert.match(st.attrs.text, msg); assert.equal(gravados.length, 0, v); }
  c.value = "60"; k.value = "70"; botao(f, "Salvar").onclick(); await espera(); assert.match(st.attrs.text, /perímetro cefálico/); assert.equal(gravados.length, 0);
  k.value = "42,5"; botao(f, "Salvar").onclick(); await espera(); await espera();
  const g = gravados[0][1]; igual([g.dados.altura, g.dados.cabeca, g.dados.custo, g.dados.outro], [60, 42.5, 10, "fica"]);
  /* limpar os dois campos num registro sem peso: nada a registrar */
  const vazio = marcar(ctx.__f.famForm("olivia", { ...reg, valor: null, dados: {} }, () => {}, () => {})), s2 = todos(vazio, (e) => e.tag === "p" && e.attrs.role === "status")[0];
  botao(vazio, "Salvar").onclick(); await espera(); assert.match(s2.attrs.text, /Informe o peso, o comprimento ou o perímetro cefálico/);
});
test("a lista e o quadro de Medidas mostram também as medições só de comprimento e de cabeça; o Eddie não muda", () => {
  const f = ler("js/familia.js"), b = ler("js/bebe.js");
  assert.match(f, /typeof r\.dados\[x\[0\]\]==="number"/); assert.match(b, /\(pesoNum\(r\)\|\|dm\.altura\|\|dm\.cabeca\)/); assert.match(b, /pesoNum\(r\)\?fmtN\(pesoNum\(r\)\)\+" kg":"—"/);
  assert.match(b, /ant&&pesoNum\(r\)&&pesoNum\(ant\)/, "o ganho por dia só conta quando os dois dias têm peso");
});

/* ---------- editar o que já foi levantado: o mesmo formulário de "Adicionar registro", já preenchido ---------- */
const porRot = (form, rot) => { const l = todos(form, (e) => e.tag === "label" && e.kids.some((k) => typeof k === "string" && k.startsWith(rot)))[0]; return l && l.kids.find((k) => typeof k !== "string"); };
const salvarForm = async (f) => { botao(f, "Salvar").onclick(); await espera(); await espera(); };
test("editar vacina da caderneta: Onde e Lote aparecem preenchidos, são corrigidos e o resto do registro (dose, data, custo) fica", async () => {
  const { ctx, gravados } = montar(), reg = { id: "v1", tipo: "vacina", data: "2026-09-01", titulo: "Men B (Bexsero)", valor: "1ª dose", proxima: null, dados: { clinica: "Vaccinate", lote: "ABXF46AB", custo: 120 }, arquivos: [] };
  const f = marcar(ctx.__f.famForm("olivia", reg, () => {}, () => {}));
  assert.equal(campo(f, "Ex.: Posto de saúde, Vaccinate").value, "Vaccinate"); assert.equal(campo(f, "Ex.: ABXF46AB").value, "ABXF46AB");
  campo(f, "Ex.: ABXF46AB").value = "ZZ9"; campo(f, "Ex.: Posto de saúde, Vaccinate").value = ""; await salvarForm(f);
  const d = gravados[0][1]; igual([d.dados.lote, "clinica" in d.dados, d.dados.custo, d.valor, d.data], ["ZZ9", false, 120, "1ª dose", "2026-09-01"]);
  /* o tipo Consulta mostra as anotações da caderneta e esconde o lote; o Eddie não ganha nada disso */
  const c = marcar(ctx.__f.famForm("olivia", { id: "c1", tipo: "consulta", data: "2026-10-01", titulo: "Consulta", dados: { notasCaderneta: "ok" } }, () => {}, () => {}));
  assert.equal(campo(c, "Anotações da caderneta").value, "ok"); assert.equal(todos(c, (e) => e.tag === "label" && e.kids.includes("Lote (opcional)"))[0].hidden, true);
  assert.equal(campo(ctx.__f.famForm("eddie", null, () => {}, () => {}), "Ex.: ABXF46AB"), undefined, "o Eddie não ganha Onde/Lote de bebê");
});
test("editar dados do nascimento e a ficha importados da caderneta: números continuam números, texto continua texto, erro de digitação não grava", async () => {
  const { ctx, gravados } = montar(), reg = { id: "n1", tipo: "nascimento", data: "2026-05-30", titulo: "Nascimento", valor: "Hospital Santa Lucinda", dados: { nasc: { hora: "10:30", hospital: "Hospital Santa Lucinda", peso: 3100, comprimento: 49.5, apgar: "9/10", alta: "2026-06-02" }, outro: "fica" }, arquivos: [] };
  const f = marcar(ctx.__f.famForm("olivia", reg, () => {}, () => {})), st = todos(f, (e) => e.tag === "p" && e.attrs.role === "status")[0];
  assert.equal(porRot(f, "Peso ao nascer (g)").value, "3100"); assert.equal(porRot(f, "Comprimento ao nascer (cm)").value, "49,5"); assert.equal(porRot(f, "Hospital").value, "Hospital Santa Lucinda");
  porRot(f, "Peso ao nascer (g)").value = "tres mil"; await salvarForm(f); assert.match(st.attrs.text, /“Peso ao nascer \(g\)” precisa ser um número/); assert.equal(gravados.length, 0);
  porRot(f, "Peso ao nascer (g)").value = "3150"; porRot(f, "Comprimento ao nascer (cm)").value = "50,5"; porRot(f, "Hospital").value = "Santa Lucinda"; porRot(f, "Apgar").value = ""; await salvarForm(f);
  const d = gravados[0][1].dados; igual([d.nasc.peso, d.nasc.comprimento, d.nasc.hospital, "apgar" in d.nasc, d.nasc.hora, d.nasc.alta, d.outro], [3150, 50.5, "Santa Lucinda", false, "10:30", "2026-06-02", "fica"]);
  /* a ficha: só texto */
  const fi = marcar(ctx.__f.famForm("olivia", { id: "c1", tipo: "outro", data: "2026-06-01", titulo: "Caderneta", dados: { caderneta: true, ficha: { "Nome completo": "Olivia X" } } }, () => {}, () => {}));
  porRot(fi, "Nome completo").value = "Olívia Y"; await salvarForm(fi); igual(gravados[1][1].dados.ficha, { "Nome completo": "Olívia Y" }); assert.equal(gravados[1][1].dados.caderneta, true);
});
test("botões Editar: caderneta (vacinas, medidas, consultas, nascimento, parto e ficha) e gráficos de medidas abrem o formulário do registro", () => {
  const b = ler("js/bebe.js"), f = ler("js/familia.js");
  assert.match(b, /function bebeEd\(r,txt\)[\s\S]*?famEditar\(r\)/); assert.equal((b.match(/bebeEd\(/g) || []).length >= 8, true);
  for (const t of ['h("td",null,bebeEd(r))', 'bebeEd(nasc,"Editar dados do nascimento")', 'bebeEd(nasc,"Editar estes dados")', 'bebeEd(cad,"Editar a ficha")', 'bebeEd(x.reg)', "reg:r}"]) assert.ok(b.includes(t), t);
  assert.match(f, /famEditar=abrirForm;/); assert.match(f, /edM\.onclick=function\(\)\{if\(famEditar\)famEditar\(pts\[selI\]\)\}/);
});
