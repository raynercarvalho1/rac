// Central de Compras: a tela (Mercado → Central) desenhada com dados fictícios, sem rede e sem banco; e o que o código garante por texto (só leitura, sem SQL novo).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { registro, rota } from "./_rotas.mjs";   // registro de rotas e do menu (js/rotas.js, Fase 2 · A3)

class El {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.style = {}; this.value = ""; this.hidden = false; this.classList = { add() {}, remove() {}, toggle() {} }; }
  appendChild(c) { if (c == null || (typeof c !== "object")) throw new TypeError("appendChild: parâmetro que não é Node"); this.children.push(c); return c; } setAttribute(k, v) { this.attrs[k] = v; } addEventListener() {}
  querySelectorAll() { return []; }
  set textContent(v) { this.children = [{ text: String(v) }]; } set innerHTML(v) { this.children = []; }
}
globalThis.document = { createElement: (t) => new El(t), createElementNS: (n, t) => new El(t), createTextNode: (t) => ({ text: t }), querySelector: () => null, getElementById: () => null };
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
let n = 0;
const L = (data, mercado, numero, produto, categoria, total, extra = {}) => ({ id: "i" + ++n, data, mk: data.slice(0, 7), mercado, numero, forma_pagamento: "Crédito", categoria, subcategoria: null, descricao: produto, produto, produto_id: "p" + n,
  quantidade: 1, unidade: "un", valor_unitario: total, valor_total: total, desconto: 0, nota: data + "|" + mercado + "|" + numero, ...extra });
const ROWS = [L("2026-11-03", "Tauste (Sorocaba)", "100", "Arroz", "Mercearia", 40), L("2026-11-08", "WILLIAM DA COSTA FREITAS LTDA", "300", "Cortina solar automotiva", "Automotivo", 19.9, { subcategoria: "Proteção" })];
const ONL = [{ id: "o1", data: "2026-11-02", loja: "amazon", numero: "111-1", subtotal: 110, desconto: 10, total_pago: 100, itens: [{ descricao: "Ração Golden", qtd: 2, total: 110, desconto: 8, categoria: "Pet" }] },
  { id: "o2", data: "2026-11-04", loja: "amazon", numero: "111-2", subtotal: 50, frete: 12.5, total_pago: 62.5, itens: [{ descricao: "Antipulgas", qtd: 1, total: 50, categoria: "Pet" }] }];

function desenhar(estado = {}, dono = true) {
  globalThis.isOwner = () => dono;
  globalThis.PESSOAL = { "mercado-canais": { v: 1, notas: { "2026-11-08|WILLIAM DA COSTA FREITAS LTDA|300": { canal: "online", plataforma: "Mercado Livre" } } } };
  T.hoje("2026-11-10"); T.usar(ROWS, { id: "u1" }); T.usarOnline(ONL);
  Object.assign(T.CU, { per: "2026-11", canal: "", estab: "", cat: "", aberta: null, todas: false, sel: null }, estado);
  const body = new El("div"); T.viewCentral(body); return body;
}

test("a tela mostra o total das duas fontes, o canal de cada compra e a conta fechando", () => {
  const t = texto(desenhar());
  assert.ok(t.includes(BRL(40 + 19.9 + 100 + 62.5)), "gasto do mês = Mercado + online");
  assert.ok(t.includes("Presencial " + BRL(40) + " (1)") && t.includes("Online " + BRL(19.9 + 162.5) + " (3)"), "por canal");
  assert.ok(/Mercado Livre/.test(t) && /Amazon/.test(t) && /Tauste/.test(t), "estabelecimentos das duas fontes");
  assert.ok(/Pet/.test(t) && /Automotivo/.test(t) && /Mercearia/.test(t), "categorias independentes do estabelecimento");
  assert.ok(/Conferência dos totais/.test(t), "bloco de conferência presente");
});
test("filtros combinados mudam os indicadores e as listas (Online + Pet; Presencial; estabelecimento)", () => {
  let t = texto(desenhar({ canal: "online", cat: "Pet" }));
  assert.ok(t.includes(BRL(102 + 50)), "só os itens de Pet, sem frete nem desconto geral");
  assert.ok(/não são divididos entre categorias/.test(t), "aviso de que o frete não é rateado");
  t = texto(desenhar({ canal: "presencial" })); assert.ok(t.includes(BRL(40)) && !/Antipulgas/.test(t));
  t = texto(desenhar({ estab: "Mercado Livre" })); assert.ok(t.includes(BRL(19.9)) && !/Ração/.test(t));
});
test("abrir uma compra mostra itens, emissor fiscal e a conta; a cortina fica no Mercado Livre sem perder o emissor da nota", () => {
  const t = texto(desenhar({ aberta: "nota:2026-11-08|WILLIAM DA COSTA FREITAS LTDA|300" }));
  assert.ok(/Emissor fiscal:\s+WILLIAM DA COSTA FREITAS LTDA/.test(t), "emissor preservado"); assert.ok(/Canal:\s+Online/.test(t)); assert.ok(/Automotivo › Proteção/.test(t));
  const o = texto(desenhar({ aberta: "online:o2" })); assert.ok(/Frete/.test(o) && o.includes(BRL(12.5)) && /Valor pago/.test(o) && o.includes(BRL(62.5)));
});
test("só o dono vê o botão de alterar o canal; a Fernanda vê a nota como está", () => {
  const com = (dono) => achar(desenhar({ aberta: "nota:2026-11-03|Tauste (Sorocaba)|100" }, dono), (e) => e.tag === "button").map(texto).join("|");
  assert.match(com(true), /Alterar canal/); assert.doesNotMatch(com(false), /Alterar canal/);
});
test("clicar numa barra de loja abre os produtos daquela loja; as barras usam a dica padrão", () => {
  const b = desenhar({ sel: { tipo: "estab", valor: "Amazon" } }), t = texto(b);
  assert.ok(/Ração Golden/.test(t) && /Antipulgas/.test(t)); assert.ok(achar(b, (e) => e.dica).length > 0, "barras com a dica padrão (racDica)");
});
test("só leitura nas tabelas de compras: a Central não insere, atualiza nem apaga; sem SQL novo; o canal vai para PESSOAL", () => {
  const src = ler("mercado.js"), ini = src.indexOf("Central de Compras: visão unificada"), fim = src.indexOf("function svgCart()"), bloco = src.slice(ini, fim);
  assert.ok(ini > 0 && fim > ini);
  assert.doesNotMatch(bloco, /\.(insert|update|upsert|delete|rpc)\(/, "a Central só lê");
  assert.match(bloco, /pessoalGravar\("mercado-canais"/); assert.match(bloco, /from\("compras_online"\)\.select\(/);
  /* a 049_tentativas_cpf_ignora_hash é da Central Fiscal (trava de CPF, 12/11/2026), não da Central de Compras */
  const novas = fs.readdirSync(new URL("../supabase/", import.meta.url)).filter((f) => /^(049|05)/.test(f) && f !== "049_tentativas_cpf_ignora_hash.sql");
  assert.deepEqual(novas, [], "a Central não criou migration (a 047 e a 048 são do Radar; a 049 é da Central Fiscal)");
});
test("o módulo se chama Central de Compras no menu e na casca, e as telas existentes continuam", () => {
  const idx = ler("index.html"), src = ler("mercado.js");
  const menu = registro().menu; assert.match(menu, /data-k="mercado"[^>]*>.*?<span class="t">Central de Compras<\/span>/s); assert.match(menu, /<span class="t">Compras online<\/span>/);
  assert.match(src, /\["central", "Central"\], \["painel", "Painel do Mercado"\], \["precos", "Preços"\], \["consumo", "Consumo"\], \["comparar", "Comparar"\]/);
  for (const k of ["notas", "produtos", "importar", "alertas", "radar"]) assert.match(src, new RegExp('\\["' + k + '"'));
});

test("Painel do Mercado e Notas mostram a compra marcada como online sob a plataforma, com o emissor ao lado e os totais iguais", () => {
  globalThis.isOwner = () => true;
  globalThis.PESSOAL = { "mercado-canais": { v: 1, notas: { "2026-11-08|WILLIAM DA COSTA FREITAS LTDA|300": { canal: "online", plataforma: "Mercado Livre" } } } };
  T.hoje("2026-11-10"); T.usar(ROWS, { id: "u1" }); T.st.mes = "2026-11"; T.st.kpi = "mes"; T.st.pick = null;
  const p = new El("div"); T.viewPainel(p); const t = texto(p);
  assert.ok(/Mercado Livre/.test(t), "o Painel mostra o Mercado Livre"); assert.ok(!/WILLIAM/.test(t.replace(/emissor: WILLIAM[^·]*/g, "")), "o emissor só aparece como emissor");
  assert.ok(/emissor: WILLIAM DA COSTA FREITAS LTDA/.test(t));
  assert.ok(t.includes(BRL(40 + 19.9)), "o total do mês do Mercado não mudou");
  const n = new El("div"); T.viewNotas(n); const tn = texto(n); assert.ok(/Mercado Livre/.test(tn) && /emissor: WILLIAM/.test(tn));
  globalThis.PESSOAL = {}; const q = new El("div"); T.viewPainel(q); assert.ok(/WILLIAM/.test(texto(q)), "sem a marcação, tudo como era");
});
