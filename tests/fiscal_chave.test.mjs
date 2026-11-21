// Central Fiscal · campo "Tenho só a chave" (21/11/2026, pedido do dono; docs/fiscal.md, "Só a chave").
// A chave colada é conferida NO APARELHO (44 dígitos, UF, mês, CNPJ, modelo e dígito verificador); o campo só informa o que a chave diz e se a nota já está na
// Central Fiscal (leitura). Não grava, não consulta a SEFAZ e não lança compra: itens e valores só vêm do documento. Tudo fictício; sem rede, sem IA e sem banco real.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const CNPJ = "11222333000181";
const chaveDe = (uf = "35", modelo = "65", n = "000080967", cnpj = CNPJ) => { const b = uf + "2611" + cnpj + modelo + "202" + n + "1" + "00519366"; return b + N.nfDvChave(b); };
const SP65 = chaveDe(), MG55 = chaveDe("31", "55"), RJ65 = chaveDe("33", "65");
const agrupar = (k) => k.replace(/(\d{4})(?=\d)/g, "$1 ");

test("nfChaveColada: aceita os 44 dígitos com espaços, pontos e traços e resume o que a chave diz", () => {
  for (const t of [SP65, agrupar(SP65), "  " + SP65.replace(/(\d{4})(?=\d)/g, "$1.") + "\n", SP65.replace(/(\d{4})(?=\d)/g, "$1-")]) {
    const r = N.nfChaveColada(t);
    assert.equal(r.ok, true, t); assert.equal(r.chave, SP65); assert.deepEqual(r.erros, []);
    assert.deepEqual({ ...r.resumo }, { uf: "SP", mes_emissao: "2026-11", cnpj: CNPJ, modelo: "65", tipo: "NFC-e", serie: 202, numero: 80967 });
  }
});

test("nfChaveColada: aceita o endereço do QR Code (parâmetro p) e devolve a mesma chave", () => {
  const r = N.nfChaveColada("https://www.nfce.fazenda.sp.gov.br/qrcode?p=" + SP65 + "|2|1|1|ABCDEF0123456789ABCDEF0123456789ABCDEF01");
  assert.equal(r.ok, true); assert.equal(r.chave, SP65);
});

test("nfChaveColada: recusa com o motivo (vazia, tamanho errado, dígito errado, URL sem chave válida) e nunca devolve resumo", () => {
  assert.match(N.nfChaveColada("").erros[0], /Cole a chave/); assert.match(N.nfChaveColada("   ").erros[0], /Cole a chave/);
  assert.match(N.nfChaveColada(SP65.slice(0, 43)).erros[0], /43 dígitos; são 44/);
  assert.match(N.nfChaveColada(SP65 + "1").erros[0], /45 dígitos; são 44/);
  const dvErrado = SP65.slice(0, 43) + ((+SP65[43] + 1) % 10);
  const e = N.nfChaveColada(dvErrado); assert.equal(e.ok, false); assert.match(e.erros.join(" "), /Dígito verificador incorreto/);
  const trocado = SP65.slice(0, 30) + (SP65[30] === "9" ? "8" : "9") + SP65.slice(31); assert.equal(N.nfChaveColada(trocado).ok, false, "um dígito errado não passa");
  const u = N.nfChaveColada("https://www.nfce.fazenda.sp.gov.br/qrcode?p=" + dvErrado + "|2|1|1|AB"); assert.equal(u.ok, false); assert.ok(u.erros.length);
  for (const r of [e, u, N.nfChaveColada("")]) { assert.equal(r.resumo, null); assert.equal(r.chave, null); assert.equal(r.consulta, null); }
});

test("nfChaveColada: o link da consulta oficial só existe onde é conhecido (NF-e nacional, NFC-e de SP), sempre https e .gov.br", () => {
  const a = N.nfChaveColada(SP65).consulta, b = N.nfChaveColada(MG55).consulta, c = N.nfChaveColada(RJ65).consulta;
  assert.match(a.link, /^https:\/\/www\.nfce\.fazenda\.sp\.gov\.br\//); assert.match(b.link, /^https:\/\/www\.nfe\.fazenda\.gov\.br\//); assert.equal(c, null, "NFC-e de outro estado: sem link inventado");
  assert.equal(a.link, "https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaPublica.aspx", "NFC-e de SP: consulta pública de PRODUÇÃO");
  assert.equal(b.link, "https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=resumo&tipoConteudo=7PhJ+gAVw2g=", "NF-e: consulta resumida do Portal Nacional");
  for (const x of [a, b]) { assert.match(x.link, /^https:\/\/[a-z0-9.-]+\.gov\.br\//); assert.ok(!/homologacao/i.test(x.link), "nunca o ambiente de homologação (teste da Fazenda)"); }
});

// ---------- a tela (js/fiscal.js), com DOM e banco de teste ----------
const stub = (tag, attrs, ...kids) => { const n = { tag, attrs: attrs || {}, kids: [], text: (attrs && attrs.text) || "" }; n.appendChild = (k) => { n.kids.push(k); return k; }; Object.defineProperty(n, "textContent", { get: () => n.text, set: (v) => { n.text = v; } }); kids.forEach((k) => { if (k != null) n.kids.push(typeof k === "string" ? { tag: "#t", attrs: {}, kids: [], text: k } : k); }); return n; };
const texto = (n) => (n.text || "") + " " + (n.kids || []).map(texto).join(" ");
const achar = (n, f) => { if (f(n)) return n; for (const k of n.kids || []) { const r = achar(k, f); if (r) return r; } return null; };
function tela(linhas = []) {
  const ch = { select: [], escrita: 0 };
  const SB = { from: (t) => ({ select: () => ({ eq: (c, v) => { ch.select.push([t, c, v]); return { limit: () => Promise.resolve({ data: linhas }) }; } }), insert: () => { ch.escrita++; }, update: () => { ch.escrita++; }, upsert: () => { ch.escrita++; } }), rpc: () => { ch.escrita++; return Promise.resolve({}); } };
  const c = vm.createContext({ NUCLEO: N, SB, h: stub, panel: (t, s) => stub("div", { class: "panel", text: t + " " + s }), brl: (v) => "R$ " + Number(v).toFixed(2).replace(".", ","), dataBR: (d) => d, setTimeout });
  vm.runInContext(ler("js/fiscal.js"), c);
  const card = c.fxCardChave(), inp = achar(card, (n) => n.tag === "input"), btn = achar(card, (n) => n.attrs.text === "Conferir chave"), res = achar(card, (n) => n.attrs.class === "stack");
  return { card, inp, btn, res, ch, espera: () => new Promise((ok) => setImmediate(ok)) };
}

test("tela: chave válida mostra o que ela informa, o link oficial e diz que a nota ainda não está na Central Fiscal; nada é gravado", async () => {
  const t = tela([]); t.inp.value = agrupar(SP65); t.btn.onclick(); await t.espera();
  const x = texto(t.res);
  assert.match(x, /Chave confere.*Sim/); assert.match(x, /NFC-e \(nota de consumidor\)/); assert.match(x, /Estado\s+SP/); assert.match(x, /11\/2026/); assert.match(x, /11\.222\.333\/0001-81/); assert.match(x, /202 · 80967/);
  assert.match(x, /Ainda não está na Central Fiscal/); assert.match(x, /não lança a compra só com ela/); assert.match(x, /não consulta a SEFAZ por você/);
  const a = achar(t.res, (n) => n.tag === "a"); assert.match(a.attrs.href, /^https:\/\/www\.nfce\.fazenda\.sp\.gov\.br\//); assert.equal(a.attrs.target, "_blank"); assert.match(a.attrs.rel, /noopener/);
  assert.deepEqual(t.ch.select, [["notas_fiscais", "chave", SP65]], "só uma leitura, por chave"); assert.equal(t.ch.escrita, 0, "nenhuma gravação");
});

test("tela: nota que já existe é avisada (não precisa lançar de novo); falha na leitura não trava", async () => {
  const t = tela([{ id: "n1", emitente_nome: "LOJA EXEMPLO", data_emissao: "2026-11-06", valor_total: 25.25, situacao: "autorizada" }]); t.inp.value = SP65; t.btn.onclick(); await t.espera();
  assert.match(texto(t.res), /JÁ está na Central Fiscal \(LOJA EXEMPLO · R\$ 25,25 · 2026-11-06\)\. Não precisa lançar de novo/);
  const f = tela();
  const SBq = { from: () => ({ select: () => ({ eq: () => ({ limit: () => Promise.reject(new Error("falhou")) }) }) }) };
  const c = vm.createContext({ NUCLEO: N, SB: SBq, h: stub, panel: (tt, s) => stub("div", { text: tt + s }), brl: String, dataBR: String, setTimeout }); vm.runInContext(ler("js/fiscal.js"), c);
  const card = c.fxCardChave(), i = achar(card, (n) => n.tag === "input"), b = achar(card, (n) => n.attrs.text === "Conferir chave"), r = achar(card, (n) => n.attrs.class === "stack");
  i.value = SP65; b.onclick(); await f.espera(); assert.match(texto(r), /Não consegui conferir se a nota já existe/);
});

test("tela: chave inválida mostra o motivo, não mostra link nem consulta o banco; NFC-e de outro estado não ganha link inventado", async () => {
  const t = tela(); t.inp.value = SP65.slice(0, 43) + ((+SP65[43] + 1) % 10); t.btn.onclick(); await t.espera();
  assert.match(texto(t.res), /Dígito verificador incorreto.*Confira os números/); assert.equal(achar(t.res, (n) => n.tag === "a"), null); assert.equal(t.ch.select.length, 0);
  t.inp.value = ""; t.btn.onclick(); assert.match(texto(t.res), /Cole a chave/);
  const o = tela(); o.inp.value = RJ65; o.btn.onclick(); await o.espera(); assert.equal(achar(o.res, (n) => n.tag === "a"), null); assert.match(texto(o.res), /Secretaria da Fazenda do seu estado/);
});

test("ligação: o cartão aparece na Central Fiscal e o campo não envia a chave a lugar nenhum (só leitura por fxLer)", () => {
  const js = ler("js/fiscal.js").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(js, /root\.appendChild\(topo\);root\.appendChild\(fxCardChave\(\)\)/);
  const corpo = js.slice(js.indexOf("function fxCardChave"), js.indexOf("function renderFiscal"));
  assert.ok(corpo.length > 800 && !/fxRpc|racIA|fetch\(|SB\b|localStorage|sessionStorage|window\.open/.test(corpo), "nada de rede, IA, gravação nem armazenamento no cartão");
  assert.deepEqual([...corpo.matchAll(/fxLer\("([a-z_]+)"/g)].map((m) => m[1]), ["notas_fiscais"]);
});
