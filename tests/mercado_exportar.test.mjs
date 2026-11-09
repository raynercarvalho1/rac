// Etapa: exportação de relatórios do Mercado em CSV (nucleo.js mkx* e o botão "Exportar CSV" nas abas). Só dados de teste: sem banco, sem rede.
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
globalThis.PESSOAL = {}; let DONO = true;
globalThis.isOwner = () => DONO;
globalThis.pessoalGravar = (k, v, cb) => { globalThis.PESSOAL[k] = v; if (cb) cb(); };
createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo || globalThis.window.RACnucleo; globalThis.window.RACnucleo = N;
createRequire(import.meta.url)("../mercado.js");
const T = globalThis.window.RACmercado._teste;
const ler = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");

const C = "Confiança (Sorocaba)", RE = "Reinaldo (Sorocaba)";
let seq = 0;
/* campos extras de propósito (user_id, observacao, numero, forma_pagamento): NUNCA podem aparecer num arquivo */
const R = (data, mercado, produto, categoria, un, q, vu, extra = {}) => ({
  id: "ID-SECRETO-" + String(++seq).padStart(3, "0"), user_id: "USUARIO-SECRETO", data, mk: data.slice(0, 7), mercado, numero: "NOTA-" + data, nota: data + "|" + mercado + "|NOTA-" + data, forma_pagamento: "CARTAO-FINAL-1234",
  categoria, descricao: "DESC-INTERNA", produto, produto_id: "PID", unidade: un, quantidade: q, valor_unitario: vu, valor_total: Math.round(q * vu * 100) / 100, desconto: 0, observacao: "OBS-PARTICULAR", ...extra
});
const ROWS = [
  R("2026-09-01", C, "Arroz", "Mercearia", "kg", 2, 5), R("2026-10-01", C, "Arroz", "Mercearia", "kg", 2, 5), R("2026-11-01", RE, "Arroz", "Mercearia", "kg", 2, 5), R("2026-11-02", C, "Arroz", "Mercearia", "kg", 2, 5.8),
  R("2026-11-03", C, "Arroz", "Mercearia", "un", 1, 12.5),
  R("2026-09-10", C, "Leite Integral 1L", "Mercearia", "un", 6, 6), R("2026-10-05", C, "Leite Integral 1L", "Mercearia", "un", 6, 5.5), R("2026-11-04", C, "Leite Integral 1L", "Mercearia", "un", 6, 4.5),
  R("2026-11-03", C, "Feijão", "Mercearia", "kg", 1, 8, { desconto: 0.5 }),
  R("2026-06-01", RE, "Queijo Minas", "Açougue/Frios", "kg", 0.5, 30), R("2026-11-02", C, "Queijo Minas", "Açougue/Frios", "kg", 0.5, 40), R("2026-11-03", RE, "Pão \"Francês\"; fresco\nquente", "Padaria", "un", 4, 1.1),
  R("2026-11-05", C, "=SOMA(1;1)", "Outros", "un", 1, 3.333333)
];
const HOJE = "2026-11-08";

/* leitor do CSV gerado (separador ";", aspas duplas): serve para provar que o arquivo volta inteiro */
function lerCsv(txt) {
  txt = txt.replace(/^﻿/, ""); const out = []; let linha = [], campo = "", q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i + 1] === '"') { campo += '"'; i++; } else q = false; } else campo += ch; }
    else if (ch === '"') q = true;
    else if (ch === ";") { linha.push(campo); campo = ""; }
    else if (ch === "\r") { /* CRLF */ }
    else if (ch === "\n") { linha.push(campo); out.push(linha); linha = []; campo = ""; }
    else campo += ch;
  }
  if (campo || linha.length) { linha.push(campo); out.push(linha); }
  return out;
}
/* seção pelo título → {cab, linhas} */
function secao(csv, titulo) {
  const L = lerCsv(csv), i = L.findIndex((l) => l.length === 1 && l[0] === titulo);
  assert.ok(i >= 0, "seção " + titulo + " não encontrada");
  const cab = L[i + 1], linhas = []; for (let j = i + 2; j < L.length && !(L[j].length === 1 && L[j][0] === ""); j++) linhas.push(L[j]);
  return { cab, linhas, col: (n) => { const k = cab.indexOf(n); assert.ok(k >= 0, "coluna " + n); return k; } };
}
const meta = (csv, k) => { const l = lerCsv(csv).find((x) => x[0] === k); return l ? l[1] : undefined; };
const FILTRO_TUDO = { de: "", ate: "", categoria: "", mercado: "", produto: "" };

test("CSV com acentos: UTF-8 com BOM, quebra CRLF, separador ponto e vírgula e cabeçalhos em português", () => {
  const r = N.mkxConsumo(ROWS, FILTRO_TUDO, { hoje: HOJE });
  assert.ok(r.ok); assert.equal(r.csv.charCodeAt(0), 0xFEFF, "BOM no começo");
  assert.match(r.csv, /Feijão/); assert.match(r.csv, /Açougue\/Frios/); assert.match(r.csv, /Confiança \(Sorocaba\)/); assert.match(r.csv, /Preço médio \(R\$ por unidade\)/);
  assert.ok(r.csv.endsWith("\r\n")); assert.ok(!/[ÃÂ]§|Ã£|Ã©/.test(r.csv), "nenhum texto estragado (mojibake)");
  const p = secao(r.csv, "Produtos (um por unidade)"); assert.deepEqual(p.cab.slice(0, 4), ["Produto", "Categoria", "Unidade", "Compras"]);
  /* o arquivo gravado em UTF-8 volta igual */
  assert.equal(Buffer.from(r.csv, "utf8").toString("utf8"), r.csv); assert.deepEqual([...Buffer.from(r.csv, "utf8").subarray(0, 3)], [0xEF, 0xBB, 0xBF]);
});

test("separadores, aspas, quebras de linha e fórmulas: o texto volta inteiro e nada vira fórmula no Excel", () => {
  assert.equal(N.mkxCelula('a;b'), '"a;b"'); assert.equal(N.mkxCelula('diz "oi"'), '"diz ""oi"""'); assert.equal(N.mkxCelula("a,b"), '"a,b"'); assert.equal(N.mkxCelula("l1\nl2"), '"l1\nl2"'); assert.equal(N.mkxCelula("l1\r\nl2"), '"l1\r\nl2"');
  for (const f of ["=1+1", "+1", "-1", "@SOMA", "\t=1"]) assert.ok(N.mkxCelula(f).startsWith("'") || N.mkxCelula(f).startsWith("\"'"), "fórmula neutralizada: " + JSON.stringify(f));
  assert.equal(N.mkxCelula(-1.5), "-1,5", "número negativo é número, não texto"); assert.equal(N.mkxCelula(null), ""); assert.equal(N.mkxCelula(undefined), ""); assert.equal(N.mkxCelula(NaN), ""); assert.equal(N.mkxCelula(""), "");
  const r = N.mkxConsumo(ROWS, FILTRO_TUDO, { hoje: HOJE }), p = secao(r.csv, "Produtos (um por unidade)"), nomes = p.linhas.map((l) => l[0]);
  assert.ok(nomes.includes('Pão "Francês"; fresco\nquente'), "ponto e vírgula, aspas e quebra de linha voltam iguais");
  assert.ok(nomes.includes("'=SOMA(1;1)"), "texto que começa com = ganha apóstrofo");
  assert.ok(p.linhas.every((l) => l.length === p.cab.length), "toda linha tem o mesmo número de colunas do cabeçalho");
});

test("valores monetários: números (vírgula decimal, sem R$), sem perder precisão", () => {
  assert.equal(N.mkxNum(5.8), "5,8"); assert.equal(N.mkxNum(0.1 + 0.2), "0,3"); assert.equal(N.mkxNum(1234.5), "1234,5", "sem separador de milhar"); assert.equal(N.mkxNum(3.333333), "3,333333"); assert.equal(N.mkxNum(0.0123), "0,0123");
  assert.equal(N.mkxNum(1e-7), "0"); assert.equal(N.mkxNum(12345678.9), "12345678,9"); assert.equal(N.mkxNum(-0), "0"); assert.equal(N.mkxNum(Infinity), ""); assert.equal(N.mkxNum("5"), "");
  const r = N.mkxConsumo(ROWS, { ...FILTRO_TUDO, produto: "arroz" }, { hoje: HOJE }), p = secao(r.csv, "Produtos (um por unidade)"), kg = p.linhas.find((l) => l[2] === "kg");
  assert.equal(kg[p.col("Preço médio (R$ por unidade)")], "5,2"); assert.equal(kg[p.col("Gasto (R$)")], "41,6");
});

test("valores monetários: o gasto exportado é a soma das compras (centavos exatos)", () => {
  const r = N.mkxConsumo(ROWS, { ...FILTRO_TUDO, produto: "arroz" }, { hoje: HOJE }), p = secao(r.csv, "Produtos (um por unidade)");
  const kg = p.linhas.find((l) => l[2] === "kg"), un = p.linhas.find((l) => l[2] === "un");
  assert.equal(kg[p.col("Gasto (R$)")], "41,6"); assert.equal(kg[p.col("Menor preço (R$)")], "5"); assert.equal(kg[p.col("Maior preço (R$)")], "5,8"); assert.equal(kg[p.col("Último preço (R$)")], "5,8");
  assert.equal(kg[p.col("Preço médio (R$ por unidade)")], "5,2", "média ponderada pela quantidade: (3×2×5 + 2×5,8) ÷ 8");
  assert.equal(un[p.col("Gasto (R$)")], "12,5"); assert.ok(!/R\$ ?\d/.test(r.csv.replace(/\(R\$[^)]*\)/g, "")), "nenhum valor com símbolo R$ (é número)");
  assert.equal(meta(r.csv, "Total gasto (R$)"), "54,1");
});

test("datas: sempre AAAA-MM-DD, nos relatórios todos", () => {
  const rs = [N.mkxConsumo(ROWS, FILTRO_TUDO, { hoje: HOJE }), N.mkxPrecos(ROWS, {}, { hoje: HOJE }), N.mkxComparar(ROWS, { de: "2026-11-01", ate: "2026-11-08" }, { de: "2026-10-01", ate: "2026-10-31" }, {}, { hoje: HOJE }), N.mkxPainel(ROWS, "2026-11", { hoje: HOJE })];
  for (const r of rs) {
    assert.ok(r.ok); assert.equal(meta(r.csv, "Gerado em"), HOJE);
    const datas = lerCsv(r.csv).flat().filter((c) => /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(c));
    assert.deepEqual(datas, [], "nenhuma data DD/MM/AAAA");
  }
  const p = secao(rs[1].csv, "Histórico de preços"); assert.ok(p.linhas.every((l) => /^\d{4}-\d{2}-\d{2}$/.test(l[p.col("Data da compra")])));
  assert.equal(secao(rs[0].csv, "Produtos (um por unidade)").linhas.find((l) => l[0] === "Feijão")[10], "2026-11-03");
});

test("arquivo vazio: sem dados não gera arquivo e avisa que não há dados para exportar", () => {
  const vazios = [N.mkxConsumo([], FILTRO_TUDO, { hoje: HOJE }), N.mkxConsumo(ROWS, { ...FILTRO_TUDO, produto: "inexistente" }, { hoje: HOJE }), N.mkxPrecos([], {}, {}), N.mkxPrecos(ROWS, { q: "zzz" }, {}), N.mkxPrecos(ROWS, { mes: "2020-01" }, {}),
    N.mkxPainel([], "2026-11", { hoje: HOJE }), N.mkxPainel(ROWS, "2020-01", { hoje: HOJE }), N.mkxPainel(ROWS, "lixo", { hoje: HOJE }), N.mkxComparar(ROWS, { de: "2020-01-01", ate: "2020-01-31" }, { de: "2020-02-01", ate: "2020-02-29" }, {}, {}), N.mkxAlertas([], { dono: true })];
  for (const r of vazios) { assert.equal(r.ok, false); assert.equal(r.vazio, true); assert.equal(r.aviso, "Não há dados para exportar."); assert.equal(r.csv, undefined, "nenhum arquivo"); }
  const e = N.mkxComparar(ROWS, { de: "2026-11-09", ate: "2026-11-01" }, { de: "2026-10-01", ate: "2026-10-31" }, {}, {}); assert.equal(e.ok, false); assert.match(e.aviso, /Período A: A data inicial é depois da final/);
});

test("filtro de período: só as compras do período saem (Consumo)", () => {
  const r = N.mkxConsumo(ROWS, { ...FILTRO_TUDO, de: "2026-10-01", ate: "2026-10-31" }, { hoje: HOJE }), p = secao(r.csv, "Produtos (um por unidade)");
  assert.deepEqual(p.linhas.map((l) => l[0]).sort(), ["Arroz", "Leite Integral 1L"]); assert.equal(meta(r.csv, "Período consultado"), "2026-10-01 a 2026-10-31"); assert.match(r.nome, /^rac-mercado-consumo_2026-10-01_a_2026-10-31\.csv$/);
  assert.equal(meta(r.csv, "Total gasto (R$)"), "43", "arroz 10 + leite 33"); assert.equal(secao(r.csv, "Mês a mês").linhas.length, 1);
  assert.ok(!/2026-09|2026-11/.test(r.csv.replace(/Gerado em;2026-11-08/, "")), "nenhuma data de fora do período");
  const a = N.mkxConsumo(ROWS, { ...FILTRO_TUDO, de: "2026-11-01", ate: "" }, { hoje: HOJE }); assert.match(a.nome, /desde|2026-11-01_a_2026-11-08/); assert.equal(meta(a.csv, "Período consultado"), "2026-11-01 a 2026-11-08");
  const t = N.mkxConsumo(ROWS, FILTRO_TUDO, { hoje: HOJE }); assert.equal(meta(t.csv, "Período consultado"), "Todo o histórico"); assert.equal(t.nome, "rac-mercado-consumo_todo-historico.csv");
  const preco = N.mkxPrecos(ROWS, { mes: "2026-09" }, { hoje: HOJE }); assert.equal(secao(preco.csv, "Histórico de preços").linhas.length, 2); assert.equal(preco.nome, "rac-mercado-precos_2026-09.csv");
});

test("filtro de categoria e de estabelecimento: o que está fora do filtro não sai", () => {
  const cat = N.mkxConsumo(ROWS, { ...FILTRO_TUDO, categoria: "Açougue/Frios" }, { hoje: HOJE }), p = secao(cat.csv, "Produtos (um por unidade)");
  assert.deepEqual(p.linhas.map((l) => l[0]), ["Queijo Minas"]); assert.equal(meta(cat.csv, "Categoria"), "Açougue/Frios"); assert.ok(!/Arroz|Leite|Feijão/.test(cat.csv));
  assert.equal(secao(cat.csv, "Por categoria").linhas.length, 1, "categoria filtrada: só ela");
  const rs = N.mkcResumo(N.mkcFiltrar(ROWS, { categoria: "Açougue/Frios" }), N.mkcFiltrar(ROWS, {}, { categoria: 1 })); assert.equal(meta(cat.csv, "Participação da categoria no gasto do período (%)"), String(Math.round(rs.pct * 1e6) / 1e4).replace(".", ","));
  const m = N.mkxConsumo(ROWS, { ...FILTRO_TUDO, mercado: RE }, { hoje: HOJE }), pm = secao(m.csv, "Produtos (um por unidade)");
  assert.deepEqual(pm.linhas.map((l) => l[0]).sort(), ['Arroz', 'Pão "Francês"; fresco\nquente', "Queijo Minas"].sort());
  assert.ok(pm.linhas.every((l) => l[pm.col("Estabelecimentos")] === RE), "só o mercado filtrado"); assert.deepEqual(secao(m.csv, "Por estabelecimento").linhas.map((l) => l[0]), [RE]);
  assert.equal(meta(m.csv, "Estabelecimento"), RE);
  const q = N.mkxConsumo(ROWS, { ...FILTRO_TUDO, produto: "leite" }, { hoje: HOJE }); assert.deepEqual(secao(q.csv, "Produtos (um por unidade)").linhas.map((l) => l[0]), ["Leite Integral 1L"]);
  /* quem passa linhas sem filtrar não consegue vazar: o filtro é aplicado de novo dentro do relatório */
  assert.equal(N.mkxConsumo(ROWS, { ...FILTRO_TUDO, categoria: "Padaria" }, { hoje: HOJE }).csv.includes("Arroz"), false);
});

test("produtos com unidades diferentes ficam em linhas separadas (Consumo, Preços e Comparação), sem somar kg com un", () => {
  const c = N.mkxConsumo(ROWS, { ...FILTRO_TUDO, produto: "arroz" }, { hoje: HOJE }), pc = secao(c.csv, "Produtos (um por unidade)");
  assert.deepEqual(pc.linhas.map((l) => [l[0], l[2], l[pc.col("Quantidade")]]).sort(), [["Arroz", "kg", "8"], ["Arroz", "un", "1"]], "8 kg e 1 un: nunca 9");
  const p = N.mkxPrecos(ROWS, { q: "arroz" }, {}), ps = secao(p.csv, "Produtos e unidades"); assert.deepEqual(ps.linhas.map((l) => l[1]), ["kg", "un"]);
  const h = secao(p.csv, "Histórico de preços"); assert.equal(h.linhas.filter((l) => l[1] === "kg").length, 4); assert.equal(h.linhas.filter((l) => l[1] === "un").length, 1);
  assert.equal(ps.linhas[0][ps.col("Variação do primeiro ao último preço (%)")], "16", "5,00 → 5,80 só entre as compras em kg"); assert.equal(ps.linhas[1][ps.col("Variação do primeiro ao último preço (%)")], "", "uma compra só: sem variação inventada");
  const cm = N.mkxComparar(ROWS, { de: "2026-11-01", ate: "2026-11-08" }, { de: "2026-10-01", ate: "2026-10-31" }, { produto: "arroz" }, { hoje: HOJE }), pr = secao(cm.csv, "Produtos: Todos os produtos");
  assert.deepEqual(pr.linhas.map((l) => l[1]).sort(), ["kg", "un"]); const g = secao(cm.csv, "Comparação geral"); assert.ok(g.linhas.some((l) => l[0] === "Quantidade (kg)")); assert.ok(g.linhas.some((l) => l[0] === "Quantidade (un)"));
  const kg = pr.linhas.find((l) => l[1] === "kg"); assert.equal(kg[pr.col("Quantidade A")], "4", "2 kg em 01/11 + 2 kg em 02/11"); assert.equal(kg[pr.col("Quantidade B")], "2");
});

test("Comparação entre períodos: A e B, totais, diferença absoluta e percentual, categorias, produtos e estabelecimentos", () => {
  const A = { de: "2026-11-01", ate: "2026-11-08" }, B = { de: "2026-10-01", ate: "2026-10-31" };
  const r = N.mkxComparar(ROWS, A, B, {}, { hoje: HOJE }), ref = N.mkcComparar(ROWS, A, B, {});
  assert.ok(r.ok); assert.equal(r.nome, "rac-mercado-comparacao_A-2026-11-01_a_2026-11-08_B-2026-10-01_a_2026-10-31.csv");
  assert.equal(meta(r.csv, "Período A (analisado)"), "2026-11-01 a 2026-11-08"); assert.equal(meta(r.csv, "Período B (comparação)"), "2026-10-01 a 2026-10-31"); assert.equal(meta(r.csv, "Dias do período A"), "8"); assert.equal(meta(r.csv, "Dias do período B"), "31");
  const g = secao(r.csv, "Comparação geral"), tot = g.linhas.find((l) => l[0] === "Gasto total (R$)");
  assert.equal(tot[1], N.mkxNum(ref.geral.total.a)); assert.equal(tot[2], N.mkxNum(ref.geral.total.b)); assert.equal(tot[3], N.mkxNum(ref.geral.total.dif)); assert.equal(tot[4], N.mkxNum(Math.round(ref.geral.total.pct * 1e6) / 1e4));
  assert.equal(ref.geral.total.b, 43); assert.equal(tot[5], "subiu");
  const cat = secao(r.csv, "Por categoria"), mer = cat.linhas.find((l) => l[0] === "Mercearia"); assert.equal(cat.linhas.some((l) => l[0] === "Bebidas"), false, "categoria sem compra nos dois períodos fica de fora, como na tela");
  assert.equal(mer[1], N.mkxNum(ref.categorias.find((x) => x.categoria === "Mercearia").m.a));
  const somaPart = cat.linhas.reduce((s, l) => s + +l[cat.col("Participação A (%)")].replace(",", "."), 0); assert.ok(Math.abs(somaPart - 100) < 0.01, "as participações de A somam 100%");
  const pr = secao(r.csv, "Produtos: Todos os produtos"); assert.equal(pr.linhas.length, ref.produtos.length);
  const queijo = pr.linhas.find((l) => l[0] === "Queijo Minas"); assert.equal(queijo[pr.col("Gasto B (R$)")], "", "sem compras em B: em branco, não zero"); assert.equal(queijo[pr.col("Variação do gasto (%)")], "", "sem base: sem percentual inventado"); assert.equal(queijo[pr.col("Explicação")], "só no período A");
  const arroz = pr.linhas.find((l) => l[0] === "Arroz" && l[1] === "kg"); assert.equal(arroz[pr.col("Gasto A (R$)")], "21,6"); assert.equal(arroz[pr.col("Gasto B (R$)")], "10"); assert.equal(arroz[pr.col("Diferença de gasto (R$)")], "11,6"); assert.equal(arroz[pr.col("Variação do gasto (%)")], "116");
  assert.equal(arroz[pr.col("Variação do preço (%)")], "8", "preço médio de A = (2×5,00 + 2×5,80) ÷ 4 = 5,40, contra 5,00 em B"); assert.equal(arroz[pr.col("Preço médio B (R$)")], "5");
  const es = secao(r.csv, "Estabelecimentos"); assert.deepEqual(es.linhas.map((l) => l[0]), ref.mercados.map((x) => x.mercado)); assert.equal(es.linhas.find((l) => l[0] === C)[es.col("Gasto A (R$)")], N.mkxNum(ref.mercados.find((x) => x.mercado === C).m.a));
  /* lista escolhida na tela */
  const sa = N.mkxComparar(ROWS, A, B, {}, { hoje: HOJE, lista: "soa" }); const rk = N.mkcCompRank(ref.produtos, 1000);
  assert.equal(secao(sa.csv, "Produtos: Só no período A").linhas.length, rk.soA.length); assert.equal(meta(sa.csv, "Lista de produtos"), "Só no período A");
  for (const [id, k] of [["aumento", "maiorAumentoGasto"], ["reducao", "maiorReducaoGasto"], ["qtdmais", "aumentoQtd"], ["qtdmenos", "reducaoQtd"], ["precomais", "precoSubiu"], ["precomenos", "precoCaiu"], ["sob", "soB"]])
    assert.equal(secao(N.mkxComparar(ROWS, A, B, {}, { lista: id }).csv, "Produtos: " + N.MKX_LISTAS[id]).linhas.length, rk[k].length, id);
  assert.equal(meta(N.mkxComparar(ROWS, A, B, {}, { lista: "invalida" }).csv, "Lista de produtos"), "Todos os produtos");
  /* mesmos filtros nos dois períodos */
  const f = N.mkxComparar(ROWS, A, B, { categoria: "Padaria" }, { hoje: HOJE }); assert.equal(meta(f.csv, "Categoria"), "Padaria"); assert.deepEqual(secao(f.csv, "Produtos: Todos os produtos").linhas.map((l) => l[0]), ['Pão "Francês"; fresco\nquente']);
  /* B sem compra: diferença existe, variação em branco */
  const nb = N.mkxComparar(ROWS, { de: "2026-11-01", ate: "2026-11-08" }, { de: "2026-07-01", ate: "2026-07-31" }, {}, {}), t2 = secao(nb.csv, "Comparação geral").linhas.find((l) => l[0] === "Gasto total (R$)");
  assert.equal(t2[2], "0"); assert.equal(t2[4], ""); assert.match(t2[5], /sem compras no período B/);
  assert.match(meta(N.mkxComparar(ROWS, A, { de: "2026-11-05", ate: "2026-11-30" }, {}, {}).csv, "Aviso"), /se sobrepõem/);
});

test("Painel mensal: total, participação por categoria, compras e comparação com o mesmo período do mês anterior", () => {
  const r = N.mkxPainel(ROWS, "2026-11", { hoje: HOJE }), doMes = ROWS.filter((x) => x.mk === "2026-11");
  assert.ok(r.ok); assert.equal(r.nome, "rac-mercado-painel_2026-11.csv"); assert.equal(meta(r.csv, "Mês"), "2026-11");
  const total = Math.round(doMes.reduce((s, x) => s + x.valor_total, 0) * 100) / 100; assert.equal(meta(r.csv, "Total gasto no mês (R$)"), N.mkxNum(total));
  assert.equal(meta(r.csv, "Compras no mês"), String(new Set(doMes.map((x) => x.nota)).size)); assert.equal(meta(r.csv, "Itens comprados"), String(doMes.length)); assert.equal(meta(r.csv, "Descontos (R$)"), "0,5");
  const cat = secao(r.csv, "Por categoria"); const soma = cat.linhas.reduce((s, l) => s + +l[1].replace(",", "."), 0); assert.ok(Math.abs(soma - total) < 0.005, "as categorias somam o total do mês");
  assert.ok(Math.abs(cat.linhas.reduce((s, l) => s + +l[2].replace(",", "."), 0) - 100) < 0.01, "as participações somam 100%"); assert.equal(cat.linhas[0][0], "Mercearia");
  const es = secao(r.csv, "Por estabelecimento"); assert.ok(Math.abs(es.linhas.reduce((s, l) => s + +l[1].replace(",", "."), 0) - total) < 0.005);
  assert.equal(es.linhas.reduce((s, l) => s + +l[3], 0), +meta(r.csv, "Compras no mês"));
  /* comparação com 1 a 8 de outubro (hoje = dia 8) */
  assert.equal(meta(r.csv, "Período de comparação (mesmo período do mês anterior)"), "2026-10-01 a 2026-10-08"); assert.equal(meta(r.csv, "Gasto no período de comparação (R$)"), "43", "01 a 08/10: arroz 10,00 + leite 33,00");
});

test("Painel mensal: o período de comparação segue a regra da tela (mês fechado = mês anterior inteiro)", () => {
  const r = N.mkxPainel(ROWS, "2026-10", { hoje: HOJE }); assert.equal(meta(r.csv, "Período de comparação (mesmo período do mês anterior)"), "2026-09-01 a 2026-09-30");
  const A = N.mkcResumo(ROWS.filter((x) => x.mk === "2026-10"), []), B = N.mkcResumo(ROWS.filter((x) => x.mk === "2026-09"), []);
  assert.equal(meta(r.csv, "Gasto no período de comparação (R$)"), N.mkxNum(B.total)); assert.equal(meta(r.csv, "Diferença (R$)"), N.mkxNum(Math.round((A.total - B.total) * 100) / 100));
  assert.equal(meta(r.csv, "Variação (%)"), N.mkxNum(Math.round(((A.total - B.total) / B.total) * 1e6) / 1e4));
  const sem = N.mkxPainel(ROWS.filter((x) => x.mk === "2026-11"), "2026-11", { hoje: HOJE }); assert.equal(meta(sem.csv, "Variação (%)"), "", "sem compras no mês anterior: sem percentual");
});

test("Preços: produtos e unidades, preços registrados, estabelecimentos, histórico e datas das compras", () => {
  const r = N.mkxPrecos(ROWS, {}, { hoje: HOJE }), ps = secao(r.csv, "Produtos e unidades"), h = secao(r.csv, "Histórico de preços");
  assert.equal(h.linhas.length, ROWS.length, "todas as compras no histórico"); assert.equal(ps.linhas.length, N.mkcPrecos(ROWS).length);
  const leite = ps.linhas.find((l) => l[0] === "Leite Integral 1L"); assert.equal(leite[ps.col("Primeira compra")], "2026-09-10"); assert.equal(leite[ps.col("Preço na primeira compra (R$)")], "6"); assert.equal(leite[ps.col("Último preço (R$)")], "4,5"); assert.equal(leite[ps.col("Estabelecimento da última compra")], C);
  assert.equal(leite[ps.col("Menor preço (R$)")], "4,5"); assert.equal(leite[ps.col("Maior preço (R$)")], "6"); assert.equal(leite[ps.col("Variação do primeiro ao último preço (%)")], "-25"); assert.equal(leite[ps.col("Compras")], "3");
  const hl = h.linhas.filter((l) => l[0] === "Leite Integral 1L"); assert.deepEqual(hl.map((l) => l[h.col("Data da compra")]), ["2026-09-10", "2026-10-05", "2026-11-04"], "histórico em ordem de data"); assert.deepEqual(hl.map((l) => l[h.col("Preço unitário (R$)")]), ["6", "5,5", "4,5"]);
  assert.equal(r.nome, "rac-mercado-precos_todo-historico.csv"); 
  const acento = N.mkxPrecos(ROWS, { q: "FEIJAO" }, {}); assert.deepEqual(secao(acento.csv, "Produtos e unidades").linhas.map((l) => l[0]), ["Feijão"], "busca sem acento e sem diferenciar maiúscula, como na tela");
  const mes = N.mkxPrecos(ROWS, { mes: "2026-11", q: "arroz" }, {}); assert.equal(secao(mes.csv, "Histórico de preços").linhas.length, 3, "novembro: 2 compras em kg + 1 em un"); assert.equal(meta(mes.csv, "Período consultado"), "2026-11");
});

test("Alertas: tipo, produto e unidade, preço de referência e atual, variação, data e situação", () => {
  const cfg = N.mkalConfig({}), cl = N.mkalClassificar(N.mkalGerar(ROWS, cfg), { lidos: [] }, HOJE, cfg), todos = cl.alertas;
  const r = N.mkxAlertas(todos, { dono: true, hoje: HOJE, tipo: "", filtro: "todos" });
  assert.ok(r.ok); assert.equal(r.nome, "rac-mercado-alertas_todos_2026-11-08.csv"); const s = secao(r.csv, "Alertas"); assert.equal(s.linhas.length, todos.length);
  assert.deepEqual(s.cab.slice(0, 3), ["Tipo", "Produto", "Unidade"]);
  const a = todos.find((x) => x.tipo === "aumento" && x.nome === "Arroz"), l = s.linhas.find((x) => x[0] === "Aumento de preço" && x[1] === "Arroz");
  assert.ok(l); assert.equal(l[s.col("Unidade")], "kg"); assert.equal(l[s.col("Preço de referência (R$)")], "5"); assert.equal(l[s.col("Preço atual (R$)")], "5,8"); assert.equal(l[s.col("Variação (%)")], "16"); assert.equal(l[s.col("Diferença (R$)")], "0,8");
  assert.equal(l[s.col("Data do alerta")], "2026-11-02"); assert.equal(l[s.col("Data de referência")], a.refData); assert.equal(l[s.col("Situação")], "Novo"); assert.match(l[s.col("Motivo")], /subiu 16%/);
  const queda = s.linhas.find((x) => x[1] === "Leite Integral 1L" && /Queda/.test(x[0])); assert.equal(queda[s.col("Variação (%)")], "-18,1818"); assert.equal(queda[s.col("Preço atual (R$)")], "4,5");
  /* lidos e anteriores */
  const lido = N.mkalClassificar(todos, { lidos: [a.id] }, "2027-06-01", cfg).alertas, r2 = N.mkxAlertas(lido, { dono: true, hoje: HOJE }), s2 = secao(r2.csv, "Alertas");
  assert.ok(s2.linhas.every((x) => x[s2.col("Situação")] === "Anterior" || x[s2.col("Situação")] === "Lido")); assert.ok(s2.linhas.some((x) => x[s2.col("Situação")] === "Lido"));
  /* "melhor preço em outro mercado": atual = o mais barato, referência = onde comprou */
  const m = todos.find((x) => x.tipo === "melhor"); if (m) { const lm = s.linhas.find((x) => /Melhor/i.test(x[0])); assert.equal(lm[s.col("Estabelecimento do preço atual")], m.mercado); assert.equal(lm[s.col("Estabelecimento de referência")], m.refMercado); assert.equal(lm[s.col("Data do preço atual")], m.dataEncontrado); }
  /* limite: sem data/estabelecimento de referência */
  const lim = N.mkalClassificar(N.mkalGerar(ROWS, { tipos: { limite: { on: true } }, limites: [{ chave: N.mkcChaveProd({ produto: "Feijão", unidade: "kg" }), nome: "Feijão", unidade: "kg", max: 9 }] }), {}, HOJE, {}).alertas.filter((x) => x.tipo === "limite");
  const rl = N.mkxAlertas(lim, { dono: true, hoje: HOJE, tipo: "limite" }), sl = secao(rl.csv, "Alertas"); assert.equal(sl.linhas.length, 1); assert.equal(sl.linhas[0][sl.col("Preço de referência (R$)")], "9"); assert.equal(sl.linhas[0][sl.col("Data de referência")], ""); assert.equal(rl.nome, "rac-mercado-alertas_limite_2026-11-08.csv");
});

test("escopo autorizado: alertas só para o dono e nenhum campo interno (id, usuário, observação, nota, pagamento) vai para o arquivo", () => {
  const cfg = N.mkalConfig({}), todos = N.mkalClassificar(N.mkalGerar(ROWS, cfg), {}, HOJE, cfg).alertas;
  for (const dono of [false, undefined, null, "true", 1]) { const r = N.mkxAlertas(todos, { dono, hoje: HOJE }); assert.equal(r.ok, false); assert.equal(r.negado, true); assert.equal(r.csv, undefined); assert.match(r.aviso, /só do dono/); }
  assert.equal(N.mkxAlertas(todos, undefined).ok, false);
  const arquivos = [N.mkxConsumo(ROWS, FILTRO_TUDO, { hoje: HOJE }), N.mkxPrecos(ROWS, {}, { hoje: HOJE }), N.mkxPainel(ROWS, "2026-11", { hoje: HOJE }), N.mkxComparar(ROWS, { de: "2026-11-01", ate: "2026-11-08" }, { de: "2026-10-01", ate: "2026-10-31" }, {}, { hoje: HOJE }), N.mkxAlertas(todos, { dono: true, hoje: HOJE })];
  for (const a of arquivos) { assert.ok(a.ok); for (const proibido of ["ID-SECRETO", "USUARIO-SECRETO", "OBS-PARTICULAR", "NOTA-2026", "CARTAO-FINAL", "DESC-INTERNA", "PID"]) assert.ok(!a.csv.includes(proibido), a.relatorio + " vazou " + proibido); }
  /* o relatório só enxerga as linhas que recebeu: sem linhas da conta, não há como exportar nada */
  assert.equal(N.mkxConsumo(undefined, FILTRO_TUDO, {}).ok, false); assert.equal(N.mkxConsumo(null, undefined, undefined).ok, false);
  /* o núcleo é puro: não usa tela, rede nem banco */
  const nuc = ler("nucleo.js"), i = nuc.indexOf("Mercado: exportação de relatórios em CSV"), parte = nuc.slice(i, nuc.indexOf("raiz.RACnucleo={", i));
  assert.ok(parte.length > 1000); assert.ok(!/\b(document|window|fetch|XMLHttpRequest|localStorage|sb\.|supabase|Blob|URL\.)\b/.test(parte), "mkx* é só texto");
});

// ---- tela: o botão em cada aba usa os filtros ativos ----
const botao = (raiz, rot) => achar(raiz, (e) => e.tag === "button" && texto(e).trim() === rot)[0];
const status = (raiz) => achar(raiz, (e) => e.tag === "span" && e.attrs.role === "status").map(texto).join(" | ");
function capturar() { const feitos = []; const antes = T.salvar((nome, csv) => feitos.push({ nome, csv })); return { feitos, volta: () => T.salvar(antes) }; }
function sel(raiz, aria) { return achar(raiz, (e) => e.tag === "select" && e.attrs["aria-label"] === aria)[0]; }

test("tela: Consumo exporta o que os filtros mostram e diz qual relatório vai sair", () => {
  DONO = true; T.st.c = null; T.usar(ROWS, { email: "dono@teste" }); T.hoje(HOJE);
  const body = new El("div"); T.viewConsumo(body); const cap = capturar();
  try {
    assert.match(status(body), /Vai exportar: Consumo · Todo o histórico · \d+ produtos/);
    sel(body, "Categoria").value = "Açougue/Frios"; sel(body, "Categoria").onchange();
    assert.match(status(body), /Vai exportar: Consumo · Todo o histórico · Açougue\/Frios · 1 produto\./);
    botao(body, "⬇ Exportar CSV").onclick();
    assert.equal(cap.feitos.length, 1); assert.equal(cap.feitos[0].nome, "rac-mercado-consumo_todo-historico.csv"); assert.deepEqual(secao(cap.feitos[0].csv, "Produtos (um por unidade)").linhas.map((l) => l[0]), ["Queijo Minas"]);
    assert.match(status(body), /Arquivo gerado: rac-mercado-consumo_todo-historico\.csv \(\d+ linhas de dados\)/);
    /* mês específico + busca sem resultado: avisa e não gera arquivo */
    sel(body, "Categoria").value = ""; sel(body, "Categoria").onchange();
    const busca = achar(body, (e) => e.tag === "input" && e.attrs["aria-label"] === "Buscar produto")[0]; busca.value = "nada-aqui"; busca.ev.input();
    assert.equal(status(body), "Não há dados para exportar."); botao(body, "⬇ Exportar CSV").onclick(); assert.equal(cap.feitos.length, 1, "nada novo foi baixado"); assert.equal(status(body), "Não há dados para exportar.");
    busca.value = ""; busca.ev.input(); const mes = sel(body, "Mês específico"); mes.value = "2026-10"; mes.onchange(); botao(body, "⬇ Exportar CSV").onclick();
    assert.equal(cap.feitos[1].nome, "rac-mercado-consumo_2026-10-01_a_2026-10-31.csv");
  } finally { cap.volta(); }
});

test("tela: Comparar exporta A, B, filtros e a lista de produtos escolhida", () => {
  DONO = true; T.st.cmp = null; T.usar(ROWS, { email: "dono@teste" }); T.hoje(HOJE);
  const body = new El("div"); T.viewComparar(body); const cap = capturar();
  try {
    assert.match(status(body), /Vai exportar: Comparação · A 2026-11-01 a 2026-11-08 × B 2026-10-01 a 2026-10-31 · Todos os produtos \(\d+\)/);
    sel(body, "Categoria").value = "Mercearia"; sel(body, "Categoria").onchange();
    sel(body, "Lista de produtos").value = "soa"; sel(body, "Lista de produtos").onchange();
    botao(body, "⬇ Exportar CSV").onclick();
    const f = cap.feitos[0]; assert.ok(f.nome.startsWith("rac-mercado-comparacao_A-2026-11-01_a_2026-11-08_B-2026-10-01_a_2026-10-31")); assert.equal(meta(f.csv, "Categoria"), "Mercearia"); assert.equal(meta(f.csv, "Lista de produtos"), "Só no período A");
    assert.ok(!f.csv.includes("Queijo"), "filtro de categoria vale para os dois períodos");
    T.st.cmp.a = { de: "2026-11-09", ate: "2026-11-01" }; const b2 = new El("div"); T.viewComparar(b2); assert.match(status(b2), /Período A: A data inicial é depois da final/); botao(b2, "⬇ Exportar CSV").onclick(); assert.equal(cap.feitos.length, 1);
  } finally { cap.volta(); T.st.cmp = null; }
});

test("tela: Painel e Preços exportam o mês e a busca ativos", () => {
  DONO = true; T.st.mes = "2026-10"; T.st.pmes = ""; T.st.q = ""; T.usar(ROWS, { email: "dono@teste" }); T.hoje(HOJE); const cap = capturar();
  try {
    const p = new El("div"); T.viewPainel(p); assert.match(status(p), /Vai exportar: Painel mensal · 2026-10 · 1 categoria · 2 compras\./); botao(p, "⬇ Exportar CSV").onclick();
    assert.equal(cap.feitos[0].nome, "rac-mercado-painel_2026-10.csv"); assert.equal(meta(cap.feitos[0].csv, "Mês"), "2026-10");
    T.st.pmes = "2026-11"; T.st.q = "leite"; const pr = new El("div"); T.viewPrecos(pr); assert.match(status(pr), /Vai exportar: Preços · 2026-11 · “leite” · 1 produto · 1 compra\b/); botao(pr, "⬇ Exportar CSV").onclick();
    assert.equal(cap.feitos[1].nome, "rac-mercado-precos_2026-11.csv"); assert.deepEqual(secao(cap.feitos[1].csv, "Produtos e unidades").linhas.map((l) => l[0]), ["Leite Integral 1L"]);
    T.st.q = "zzz"; const v = new El("div"); T.viewPrecos(v); assert.equal(status(v), "Não há dados para exportar.");
  } finally { cap.volta(); T.st.pmes = ""; T.st.q = ""; T.st.mes = null; }
});

test("tela: Alertas exportam o tipo aberto (só novos, ou também lidos e anteriores) e só aparecem para o dono", () => {
  DONO = true; globalThis.PESSOAL = {}; T.st.al = null; T.usar(ROWS, { email: "dono@teste" }); T.hoje(HOJE); const cap = capturar();
  try {
    const b = new El("div"); T.viewAlertas(b); assert.match(status(b), /Vai exportar: Alertas · todos os tipos ligados \(novos, lidos e anteriores\) · \d+ alertas/);
    botao(b, "⬇ Exportar CSV").onclick(); assert.equal(cap.feitos[0].nome, "rac-mercado-alertas_todos_" + HOJE + ".csv");
    const tile = achar(b, (e) => e.tag === "button" && (e.attrs["aria-label"] || "").startsWith("Aumento de preço"))[0]; tile.onclick();
    const l = new El("div"); T.viewAlertas(l); assert.match(status(l), /Aumento de preço \(só os novos\)/); botao(l, "⬇ Exportar CSV").onclick();
    const s = secao(cap.feitos[1].csv, "Alertas"); assert.ok(s.linhas.length >= 1 && s.linhas.every((x) => x[0] === "Aumento de preço" && x[s.col("Situação")] === "Novo")); assert.equal(cap.feitos[1].nome, "rac-mercado-alertas_aumento_" + HOJE + ".csv");
    /* fora do dono: a aba nem monta e a função recusa */
    DONO = false; const n = new El("div"); T.viewAlertas(n); assert.equal(botao(n, "⬇ Exportar CSV"), undefined); assert.match(texto(n), /só do dono/);
  } finally { cap.volta(); DONO = true; T.st.al = null; }
});

test("download real: Blob UTF-8 com BOM, nome do arquivo e link removido depois", () => {
  const criados = [], blobs = [], revogados = []; const orig = { Blob: globalThis.Blob, URL: globalThis.URL, body: document.body };
  globalThis.Blob = class { constructor(p, o) { this.partes = p; this.tipo = o.type; blobs.push(this); } };
  globalThis.URL = { createObjectURL: (b) => { criados.push(b); return "blob:x"; }, revokeObjectURL: (u) => revogados.push(u) };
  const corpo = new El("body"); let cliques = 0; document.body = corpo; const cre = document.createElement; document.createElement = (t) => { const e = cre(t); e.click = () => { cliques++; }; return e; };
  const antes = T.salvar(); T.salvar(antes);
  try {
    const cap = T.salvar(); // pega a função real
    T.salvar(cap); cap("rac-mercado-teste.csv", N.mkxCsv({ meta: [["Relatório", "Teste ç"]], secoes: [] }));
    assert.equal(cliques, 1); assert.equal(blobs[0].tipo, "text/csv;charset=utf-8"); assert.equal(blobs[0].partes[0].charCodeAt(0), 0xFEFF); assert.equal(corpo.children[0].attrs.download, "rac-mercado-teste.csv");
  } finally { globalThis.Blob = orig.Blob; globalThis.URL = orig.URL; document.body = orig.body; document.createElement = cre; }
});

test("código: sem nova dependência, sem rede no trecho da exportação e versões trocadas juntas", () => {
  const m = ler("mercado.js"), i = m.indexOf("Exportar CSV (docs/mercado-exportar.md)"), parte = m.slice(i, m.indexOf("Preços: histórico por produto", i));
  assert.ok(parte.length > 500); assert.ok(!/fetch\(|XMLHttpRequest|sb\.|supabase|\.from\(|\.rpc\(|\.insert|\.update|\.delete|localStorage/.test(parte), "o botão só gera e baixa o arquivo");
  assert.ok(!/XLSX|SheetJS/.test(parte), "CSV puro, sem biblioteca");
  const sw = ler("sw.js"), app = ler("js/app.js"); assert.equal(/VERSAO = "([^"]+)"/.exec(sw)[1], /MOD_VERSAO="([^"]+)"/.exec(app)[1]);
  assert.ok(!fs.existsSync(new URL("../supabase/044_mercado_exportar.sql", import.meta.url)), "sem migration nesta etapa");
});
