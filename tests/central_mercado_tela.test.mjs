// Central de Compras como um mercado: as TELAS (mercado.js) desenhadas num DOM falso, sem banco real, sem rede e sem IA.
// Garante a navegação de ponta a ponta: Central → categoria → produto → compra; Central → estabelecimento → produtos e comparação; pedido online e nota abrem a compra;
// os totais das páginas batem com as barras da Central; só o dono vê as páginas e os painéis novos (a experiência da casa não muda); nada é gravado.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

class El {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.style = {}; this.value = ""; this.className = ""; this.cl = new Set(); this.ev = {}; this.classList = { add: (c) => this.cl.add(c), remove: (c) => this.cl.delete(c), toggle() {} }; }
  appendChild(c) { if (c == null || typeof c !== "object") throw new TypeError("appendChild: parâmetro que não é Node"); this.children.push(c); return c; }
  setAttribute(k, v) { this.attrs[k] = v; } removeAttribute(k) { delete this.attrs[k]; }
  set textContent(v) { this.children = [{ text: String(v) }]; }
  get textContent() { return texto(this); }
  set innerHTML(v) { this.children = []; }
  querySelectorAll(sel) { return achar(this, (e) => e.tag === sel); }
  addEventListener(n, f) { this.ev[n] = f; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; }
}
const NB = new RegExp(String.fromCharCode(160), "g");
const texto = (e) => (e == null ? "" : e.text != null ? e.text : (e.children || []).map(texto).join(" "));
const achar = (e, f, out = []) => { if (e && e.tag && f(e)) out.push(e); ((e && e.children) || []).forEach((c) => achar(c, f, out)); return out; };
const ROOT = new El("div");
globalThis.document = { createElement: (t) => new El(t), createElementNS: (n, t) => new El(t), createTextNode: (t) => ({ text: t }), querySelector: () => null, getElementById: (i) => (i === "mercado-view" ? ROOT : null), body: new El("body") };
globalThis.window = globalThis.window || {};
globalThis.window.scrollTo = () => {}; globalThis.window.scrollY = 0; globalThis.window.racDica = { ligar: (el, f) => { el.dica = f; return el; } };
globalThis.location = { hash: "" };
globalThis.PESSOAL = {}; let DONO = true;
globalThis.isOwner = () => DONO;
globalThis.pessoalGravar = (k, v, cb) => { throw new Error("a navegação não pode gravar em PESSOAL (" + k + ")"); };
createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo || globalThis.window.RACnucleo; globalThis.window.RACnucleo = N;
createRequire(import.meta.url)("../mercado.js");
const M = globalThis.window.RACmercado, T = M._teste;
const ler = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const esperar = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };
const tudo = () => texto(ROOT).replace(NB, " ");
const BRL = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v).replace(NB, " ");
const r2 = (x) => Math.round(x * 100) / 100;

let seq = 0;
const L = (data, mercado, numero, produto, categoria, q, vu, un = "un") => ({ id: "i" + ++seq, data, mk: data.slice(0, 7), mercado, numero, forma_pagamento: "Crédito", categoria, subcategoria: null, descricao: produto, produto,
  produto_id: "p" + seq, quantidade: q, unidade: un, valor_unitario: vu, valor_total: r2(q * vu), desconto: 0, nota: data + "|" + mercado + "|" + numero });
const ROWS = [
  L("2026-09-05", "Tauste (Sorocaba)", "10", "Pão Francês", "Padaria", 0.5, 20, "kg"),
  L("2026-10-01", "Tauste (Sorocaba)", "11", "Pão Francês", "Padaria", 1, 18, "kg"), L("2026-10-01", "Tauste (Sorocaba)", "11", "Leite", "Mercearia", 6, 5),
  L("2026-11-02", "Confiança (Sorocaba)", "20", "Pão Francês", "Padaria", 0.5, 16, "kg"), L("2026-11-02", "Confiança (Sorocaba)", "20", "Leite", "Mercearia", 12, 4.5),
  L("2026-11-02", "Confiança (Sorocaba)", "20", "Bolo de Fubá", "Padaria", 1, 12)];
const ONL = [
  { id: "o1", data: "2026-11-04", loja: "amazon", numero: "111-1", subtotal: 110, desconto: 10, frete: 12.5, taxas: 0, total_pago: 112.5, itens: [{ descricao: "Ração Golden 10kg", qtd: 2, total: 110, desconto: 10, categoria: "Pet" }] },
  { id: "o2", data: "2026-10-04", loja: "amazon", numero: "111-2", subtotal: 60, desconto: 0, frete: 0, taxas: 0, total_pago: 60, itens: [{ descricao: "Ração Golden 10kg", qtd: 1, total: 60, desconto: 0, categoria: "Pet" }] }];

function fakeSb(db, calls) {
  return { auth: { signOut: () => Promise.resolve() }, from(nome) {
    const q = {};
    const res = () => { calls.push(["select", nome]); return { data: db[nome] || [] }; };
    for (const m of ["select", "order", "limit", "eq", "single", "range", "in"]) q[m] = () => q;
    for (const m of ["insert", "update", "delete", "upsert"]) q[m] = () => { calls.push([m, nome]); return q; };
    q.then = (ok, er) => Promise.resolve(res()).then(ok, er); return q; }, rpc(n) { calls.push(["rpc", n]); return Promise.resolve({ data: null }); } };
}
const abrir = async (sub, arg = "", { dono = true, cu = {}, db = {} } = {}) => {
  DONO = dono; globalThis.PESSOAL = {}; const calls = []; T.trocarSb(fakeSb(db, calls)); T.usar(ROWS, { email: "dono@exemplo.com" }); T.usarOnline(ONL); T.hoje("2026-11-10");
  Object.assign(T.CU, { per: "", canal: "", estab: "", cat: "", aberta: null, todas: false, sel: null, alvo: false }, cu); Object.assign(T.CM, { ord: "gasto", ordE: "gasto", histTodas: false, opoTodas: false });
  globalThis.location.hash = ""; T.drawApp(sub, arg); await esperar(); return calls;
};
const links = (href) => achar(ROOT, (e) => e.tag === "a" && e.attrs.href === href);
const botoes = (txt) => achar(ROOT, (e) => e.tag === "button" && texto(e).replace(NB, " ").includes(txt));
const escritas = (calls) => calls.filter((c) => c[0] !== "select");

test("Central (dono): evolução mês a mês com valor e mês fixos e a dica padrão; tocar num mês escolhe o mês; mês sem compra fica desligado", async () => {
  const calls = await abrir("central", "", { cu: { per: "12m" } }), t = tudo();
  assert.ok(t.includes("Evolução dos gastos"));
  const ev = achar(ROOT, (e) => e.tag === "div" && e.className === "vbars cmvbars")[0]; assert.ok(ev, "o gráfico de colunas existe");
  const cols = ev.children; assert.equal(cols.length, 12, "12 meses até o mês atual");
  for (const b of cols) { assert.ok(typeof b.dica === "function", "cada coluna usa racDica"); assert.ok(achar(b, (e) => e.className === "vbv").length === 1 && achar(b, (e) => e.className === "vbl").length === 1, "valor e mês fixos"); }
  const nov = cols[11], ago = cols[8]; assert.equal(texto(achar(nov, (e) => e.className === "vbl")[0]), "nov/26"); assert.equal(texto(achar(nov, (e) => e.className === "vbv")[0]), Math.round(8 + 54 + 12 + 112.5).toLocaleString("pt-BR"));
  assert.equal(ago.attrs.disabled, "", "agosto sem compra: desligado"); assert.equal(ago.onclick, undefined);
  assert.deepEqual(nov.dica().map((x) => x.replace(NB, " ")), ["novembro 2026", BRL(186.5) + " gastos · 2 compras"], "a dica diz o mês, o valor e as compras");
  cols[10].onclick(); await esperar(); assert.equal(T.CU.per, "2026-10", "tocar em outubro escolhe outubro na Central"); assert.ok(tudo().includes("Gasto em outubro 2026"));
  assert.deepEqual(escritas(calls), [], "só leitura");
});

test("Central (dono): Explorar por categoria e por estabelecimento (as duas fontes) e Oportunidades de economia levam às páginas; o detalhe de uma barra tem 'Abrir a categoria'", async () => {
  await abrir("central", "", { cu: { per: "tudo" } }); const t = tudo();
  for (const x of ["Explorar por categoria", "Explorar por estabelecimento", "Oportunidades de economia"]) assert.ok(t.includes(x), x);
  for (const h of ["#mercado/categoria/Pet", "#mercado/categoria/Padaria", "#mercado/estabelecimento/Amazon", "#mercado/estabelecimento/Tauste", "#mercado/estabelecimento/Confian%C3%A7a"]) assert.equal(links(h).length, 1, h);
  assert.ok(t.includes("Mais barato em Confiança") && t.includes(BRL(r2((5 - 4.5) * 6))), "Leite: 6 un a R$ 0,50 a mais na Tauste");
  assert.ok(links("#mercado/produto/Leite").length === 1, "a oportunidade leva ao produto");
  await abrir("central", "", { cu: { per: "tudo", sel: { tipo: "cat", valor: "Pet" } } });
  const ab = links("#mercado/categoria/Pet").filter((a) => /Abrir a categoria/.test(texto(a))); assert.equal(ab.length, 1, "o detalhe da barra leva à página da categoria");
  await abrir("central", "", { cu: { per: "tudo", sel: { tipo: "estab", valor: "Amazon" } } });
  assert.equal(links("#mercado/estabelecimento/Amazon").filter((a) => /Abrir o estabelecimento/.test(texto(a))).length, 1);
});

test("a casa (Fernanda) não vê nada novo: nem evolução, explorar, oportunidades ou links de página; a rota do estabelecimento volta para a Central", async () => {
  await abrir("central", "", { dono: false, cu: { per: "tudo", sel: { tipo: "cat", valor: "Pet" } } }); const t = tudo();
  for (const x of ["Evolução dos gastos", "Explorar por", "Oportunidades de economia", "Abrir a categoria"]) assert.ok(!t.includes(x), x);
  assert.ok(t.includes("Por categoria") && t.includes("Últimas compras") && t.includes("Ração Golden 10kg"), "a Central dela continua como era (barras e detalhe)");
  assert.equal(achar(ROOT, (e) => e.tag === "a" && /^#mercado\/(categoria|produto|estabelecimento)\//.test(e.attrs.href || "")).length, 0);
  await abrir("estabelecimento", "Amazon", { dono: false }); assert.ok(!tudo().includes("Comparação com outros estabelecimentos") && tudo().includes("Últimas compras"));
  await abrir("categoria", "Pet", { dono: false }); assert.ok(!tudo().includes("Onde você compra"));
});

test("categoria só online (Pet): produtos do pedido, gasto sem o frete, onde comprou e a evolução; o último preço abre o PEDIDO na Central", async () => {
  const calls = await abrir("categoria", "Pet", { cu: { per: "tudo" } }); const t = tudo();
  for (const x of ["Pet", "Ração Golden 10kg", "Gasto " + BRL(160), "Último preço pago", BRL(50) + "/un", "Menor pago " + BRL(50) + "/un", "Maior pago " + BRL(60) + "/un", "Onde você compra Pet", "Evolução de Pet"]) assert.ok(t.includes(x), x);
  assert.ok(!t.includes(BRL(172.5)), "o frete do pedido não é da categoria");
  assert.equal(links("#mercado/produto/" + encodeURIComponent("Ração Golden 10kg")).length, 1, "o nome leva ao produto (uma vez só)");
  assert.equal(links("#mercado/estabelecimento/Amazon").length, 1, "a barra do estabelecimento leva à página dele");
  const ult = achar(ROOT, (e) => e.tag === "a" && /mkpc-pago/.test(e.className))[0]; assert.equal(ult.attrs.href, "#mercado/central");
  ult.onclick({ preventDefault() {} }); assert.equal(globalThis.location.hash, "#mercado/central"); assert.deepEqual([T.CU.aberta, T.CU.per, T.CU.todas, T.CU.alvo], ["online:o1", "2026-11", true, true]);
  assert.equal(calls.filter((c) => c[1] === "radar_candidatos").length, 0, "sem vínculo, nem consulta ofertas"); assert.deepEqual(escritas(calls), []);
});

test("categoria: totais iguais à barra da Central no mesmo período; cada produto com gasto, quantidade, médio, último/menor/maior pago (abrem a nota) e variação; ordenar e trocar o período", async () => {
  await abrir("categoria", "Padaria", { cu: { per: "tudo" } }); let t = tudo();
  const R = N.cuResumo(N.cuFiltrar(T.centralDados().compras, {})), bar = R.porCategoria.find((c) => c.cat === "Padaria");
  assert.ok(t.includes(BRL(bar.total) + " gastos em todo o histórico"), "o mesmo total da barra 'Por categoria'");
  for (const x of ["Gasto " + BRL(10 + 18 + 8), "2 kg", "preço médio " + BRL(r2((0.5 * 20 + 18 + 0.5 * 16) / 2)) + "/kg", "em 2 lugares", "Maior pago " + BRL(20) + "/kg", "desde a compra anterior", "Onde você compra Padaria"]) assert.ok(t.includes(x), x);
  const maior = achar(ROOT, (e) => e.tag === "a" && /mk-inline/.test(e.className) && texto(e).replace(NB, " ").includes("Maior pago " + BRL(20)))[0];
  T.st.notaAberta = null; maior.onclick({ preventDefault() {} }); assert.equal(T.st.notaAberta, "2026-09-05|Tauste (Sorocaba)|10", "o maior preço abre a nota de origem");
  await abrir("categoria", "Padaria", { cu: { per: "tudo" } });
  const sel = achar(ROOT, (e) => e.tag === "select" && e.attrs["aria-label"] === "Ordenar produtos")[0]; sel.value = "nome"; sel.onchange(); await esperar();
  const nomes = achar(ROOT, (e) => e.tag === "a" && /mkpc-nome/.test(e.className)).map(texto); assert.deepEqual(nomes, ["Bolo de Fubá", "Pão Francês"]);
  botoes("nov/26")[0].onclick(); await esperar(); t = tudo(); assert.equal(T.CU.per, "2026-11"); assert.ok(t.includes(BRL(8 + 12) + " gastos em novembro 2026"));
  botoes("Online")[0].onclick(); await esperar(); assert.equal(T.CU.canal, "online"); assert.ok(tudo().includes("Nenhuma compra registrada nesta categoria") && botoes("Ver todo o histórico").length === 1);
});

test("produto: o que foi pago nas duas fontes, maior pago, variação, gráfico do preço, onde comprou (★ o mais barato, cada loja leva à página dela) e cada compra abre a nota", async () => {
  const calls = await abrir("produto", encodeURIComponent("Pão Francês"), { db: { radar_itens: [] } }); const t = tudo();
  for (const x of ["Último pago", "Menor pago", "Maior pago", "Preço médio", "Onde você comprou", "★ Confiança", "mais barato", "desde a compra anterior", "desde a primeira", "comprado em 2 lugares"]) assert.ok(t.includes(x), x);
  assert.equal(achar(ROOT, (e) => e.tag === "svg" && e.attrs.class === "lchart").length, 1, "a evolução do preço (3 compras em kg)");
  assert.equal(links("#mercado/estabelecimento/Tauste").length, 1); assert.equal(links("#mercado/estabelecimento/Confian%C3%A7a").length, 1);
  const linhas = achar(ROOT, (e) => e.tag === "a" && /plr/.test(e.className)); assert.equal(linhas.length, 3, "uma linha por compra");
  T.st.notaAberta = null; linhas[0].onclick({ preventDefault() {} }); assert.equal(T.st.notaAberta, "2026-11-02|Confiança (Sorocaba)|20");
  const maior = achar(ROOT, (e) => e.tag === "a" && /mkkpi/.test(e.className) && texto(e).includes("Maior pago"))[0]; T.st.notaAberta = null; maior.onclick({ preventDefault() {} }); assert.equal(T.st.notaAberta, "2026-09-05|Tauste (Sorocaba)|10");
  assert.deepEqual(escritas(calls), []);
});

test("produto comprado online: a linha do histórico abre o PEDIDO na Central; link para o produto em Compras online; o frete não entra no preço", async () => {
  await abrir("produto", encodeURIComponent("Ração Golden 10kg"), { db: { radar_itens: [] } }); const t = tudo();
  for (const x of ["Pet", "Último pago", BRL(50) + "/un", "Inclui 2 compras online", "frete e taxas do pedido não entram", "Comprado só em", "Amazon · online"]) assert.ok(t.includes(x), x);
  const ver = achar(ROOT, (e) => e.tag === "a" && texto(e) === "Ver em Compras online")[0]; assert.match(ver.attrs.href, /^#compras\/produto\/[^/]+\/produtos$/);
  const linhas = achar(ROOT, (e) => e.tag === "a" && /plr/.test(e.className)); assert.equal(linhas[0].attrs.href, "#mercado/central");
  linhas[1].onclick({ preventDefault() {} }); assert.deepEqual([T.CU.aberta, T.CU.per], ["online:o2", "2026-10"]); assert.equal(globalThis.location.hash, "#mercado/central");
  T.drawApp("central"); await esperar(); assert.ok(tudo().includes("Valor pago") && tudo().includes(BRL(60)), "a Central abre o pedido com a conta");
});

test("estabelecimento: total igual à barra, produtos + ajustes = total, compras abrem a nota ou o pedido, categorias e produtos levam às páginas, comparação com os outros lugares", async () => {
  let calls = await abrir("estabelecimento", "Amazon", { cu: { per: "tudo" } }); let t = tudo();
  for (const x of ["Amazon", "2 compras · " + BRL(172.5) + " em todo o histórico (online)", "Gasto aqui", "Produtos " + BRL(160) + " + ajustes dos pedidos", "+" + BRL(12.5), "Compras em todo o histórico", "Categorias", "Produtos comprados aqui", "Comparação com outros estabelecimentos", "Nenhum produto daqui foi comprado também em outro lugar"]) assert.ok(t.includes(x), x);
  assert.equal(links("#mercado/categoria/Pet").length, 1); assert.equal(links("#mercado/produto/" + encodeURIComponent("Ração Golden 10kg")).length, 1);
  const rk = achar(ROOT, (e) => e.tag === "a" && /^hb/.test(e.className) && e.attrs.href === "#mercado/estabelecimento/Amazon")[0]; assert.equal(rk.attrs["aria-current"], "page", "o ranking destaca este estabelecimento");
  assert.ok(achar(ROOT, (e) => e.tag === "a" && /^hb/.test(e.className)).every((a) => typeof a.dica === "function"), "barras com a dica padrão");
  const compra = achar(ROOT, (e) => e.tag === "a" && /plr mk-linkcompra/.test(e.className))[0]; compra.onclick({ preventDefault() {} }); assert.deepEqual([T.CU.aberta, globalThis.location.hash], ["online:o1", "#mercado/central"]);
  assert.deepEqual(escritas(calls), []);
  calls = await abrir("estabelecimento", "Tauste", { cu: { per: "tudo" } }); t = tudo();
  assert.ok(t.includes("2 mais caros aqui") && t.includes("menor médio em outro lugar"), "Leite e Pão Francês saíram mais baratos na Confiança");
  const nota = achar(ROOT, (e) => e.tag === "a" && /plr mk-linkcompra/.test(e.className))[0]; T.st.notaAberta = null; nota.onclick({ preventDefault() {} }); assert.equal(T.st.notaAberta, "2026-10-01|Tauste (Sorocaba)|11");
  await abrir("estabelecimento", "Loja Nenhuma", { cu: { per: "2026-11" } }); assert.ok(tudo().includes("Nenhuma compra neste estabelecimento") && botoes("Ver todo o histórico").length === 1);
});

test("o total de cada página é o da barra da Central no mesmo período e canal (categorias e estabelecimentos)", async () => {
  for (const per of ["2026-11", "12m", "tudo"]) for (const canal of ["", "online", "presencial"]) {
    await abrir("central", "", { cu: { per, canal } });
    const lista = N.cuFiltrar(T.centralDados().compras, { ...N.cuPeriodo(per, "2026-11-10"), canal }), R = N.cuResumo(lista);
    for (const c of R.porCategoria) assert.equal(N.cmCategoria(N.cmLinhas(lista), c.cat).total, c.total, per + canal + c.cat);
    for (const e of R.porEstab) assert.equal(N.cmEstabelecimento(lista, e.nome).total, e.total, per + canal + e.nome);
  }
});

test("novo registro alimenta a Central: Compras online avisa (ccEsquecer → esquecerOnline) e os pedidos são lidos de novo; Mercado já relê as notas depois de salvar", async () => {
  await abrir("central", "", { cu: { per: "tudo" } });
  const db = { compras_online: ONL.map((c) => ({ ...c, itens: undefined, compras_online_itens: c.itens })).concat([{ id: "o9", data: "2026-11-09", loja: "shopee", numero: "S-9", total_pago: 33, compras_online_itens: [{ ordem: 1, descricao: "Capa de celular", qtd: 1, total: 33, categoria: "Tecnologia" }] }]) };
  const calls = []; T.trocarSb(fakeSb(db, calls));
  M.esquecerOnline(); T.drawApp("central"); await esperar(10);
  assert.equal(calls.filter((c) => c[1] === "compras_online").length, 1, "os pedidos foram lidos de novo"); assert.ok(tudo().includes("Capa de celular") || tudo().includes("Shopee"), "o pedido novo aparece");
  assert.match(ler("js/compras.js"), /function ccEsquecer\(\)\{.*window\.RACmercado\.esquecerOnline\(\)\}/, "Compras online chama o aviso depois de cada gravação (ccEsquecer)");
  assert.ok((ler("mercado.js").match(/return loadRows\(true\)/g) || []).length >= 2, "o Mercado relê as notas depois de salvar/importar");
});

test("código: a navegação nova só lê (nenhuma escrita, RPC, IA ou função), e a rota do estabelecimento é só do dono", () => {
  const m = ler("mercado.js"), i0 = m.indexOf("/* ---------- Navegação de mercado"), i1 = m.indexOf("/* 2) registrar uma compra:"); assert.ok(i0 > 0 && i1 > i0);
  const b = m.slice(i0, i1); assert.ok(!/\.(insert|update|delete|upsert|rpc)\(|functions\.invoke|racIA|pessoalGravar/.test(b), "só leitura");
  assert.ok(!/sb\.from\(/.test(b.replace(/sb\.from\("radar_candidatos"\)\.select\(/, "")), "a única consulta nova é a de ofertas que já existia (radar_candidatos)");
  assert.match(m, /x\[0\] !== "estabelecimento"\) \|\| ehDono\(\)/, "a casa não abre a página do estabelecimento");
  assert.match(m, /sub === "categoria" \|\| sub === "produto" \|\| sub === "estabelecimento" \? loadOnline\(\)/, "as páginas carregam as compras online junto");
  assert.match(ler("index.html"), /\.cmvbars\{[^}]*overflow-x:auto[^}]*\}\.cmvbars \.vb\{flex:1 0 36px\}/, "colunas com largura mínima: rolam para o lado em vez de espremer ou vazar do quadro");
});

/* ---------- ajustes pedidos pelo dono em 12/11/2026 (depois da publicação): a nota aberta por um item e os dados que demoravam a aparecer ---------- */
test("abrir a compra por um item: a nota abre pelo TOPO, com o item em destaque logo abaixo do cabeçalho e marcado na lista", async () => {
  await abrir("produto", "Leite", { db: { radar_itens: [] } });
  const leite = ROWS.find((x) => x.produto === "Leite" && x.data === "2026-11-02");
  const linhas = achar(ROOT, (e) => e.tag === "a" && /plr/.test(e.className)); linhas[0].onclick({ preventDefault() {} });
  assert.deepEqual([T.st.notaAberta, T.st.notaItem], ["2026-11-02|Confiança (Sorocaba)|20", leite.id], "a nota e o item clicado");
  T.drawApp("notas"); await esperar();
  const aberta = achar(ROOT, (e) => e.tag === "details" && e.attrs.open === "open"); assert.equal(aberta.length, 1);
  const topo = achar(aberta[0], (e) => e.className === "mkalvotopo"); assert.equal(topo.length, 1, "o item aparece no topo da nota");
  assert.equal(aberta[0].children[1], topo[0], "logo abaixo do cabeçalho (data, loja, NF e total)");
  const tt = texto(topo[0]).replace(NB, " "); assert.ok(tt.includes("Leite") && tt.includes("12 un × " + BRL(4.5) + " = " + BRL(54)), tt);
  const marcados = achar(ROOT, (e) => /\bmkitem\b/.test(e.className) && /\bmkalvo\b/.test(e.className)); assert.equal(marcados.length, 1); assert.ok(texto(marcados[0]).includes("Leite"), "o item fica em destaque na lista");
  assert.match(ler("mercado.js"), /p\.querySelector\("details\[open\]"\); if \(ab && ab\.scrollIntoView\) ab\.scrollIntoView\(\{ block: "start" \}\)/, "rola até o topo da nota, não até o meio dos itens");
  /* abrir a nota pela Central (sem item) não deixa destaque velho */
  await abrir("central", "", { cu: { per: "tudo", aberta: "nota:2026-11-02|Confiança (Sorocaba)|20" } }); botoes("Abrir a nota em Notas")[0].onclick(); assert.equal(T.st.notaItem, null);
  T.drawApp("notas"); await esperar(); assert.equal(achar(ROOT, (e) => e.className === "mkalvotopo").length, 0);
});

const NOVO = { id: "o9", data: "2026-11-09", loja: "shopee", numero: "S-9", total_pago: 33, compras_online_itens: [{ ordem: 1, descricao: "Capa de celular", qtd: 1, total: 33, categoria: "Tecnologia" }] };
const banco = (extra = []) => ({ compras: ROWS, compras_online: ONL.map((c) => ({ ...c, itens: undefined, compras_online_itens: c.itens })).concat(extra) });

test("dados frescos: passado o prazo, a Central relê as fontes em segundo plano e só redesenha se algo mudou; nunca nas telas de edição nem depois de trocar de tela", async () => {
  await abrir("central", "", { cu: { per: "tudo" } }); globalThis.location.hash = "#mercado/central";
  let calls = []; T.trocarSb(fakeSb(banco([NOVO]), calls));
  T.lidoEm.notas = T.lidoEm.online = Date.now(); assert.equal(T.reler("central", ""), null, "dentro do prazo: não lê nada"); assert.equal(calls.length, 0);
  T.lidoEm.notas = T.lidoEm.online = 0;
  assert.equal(await T.reler("central", ""), true, "o pedido novo mudou os dados"); assert.ok(tudo().includes("Shopee"), "e aparece sem recarregar o site");
  assert.deepEqual(calls.map((c) => c[1]).sort(), ["compras", "compras_online"], "uma leitura de cada fonte");
  const tela = ROOT.children; T.lidoEm.notas = T.lidoEm.online = 0; calls.length = 0;
  assert.equal(await T.reler("central", ""), false, "nada mudou"); assert.equal(ROOT.children, tela, "sem redesenhar à toa");
  T.lidoEm.notas = T.lidoEm.online = 0; calls.length = 0;
  for (const v of ["notas", "produtos", "importar"]) assert.equal(T.reler(v, ""), null, v + ": tela de edição não relê"); assert.equal(calls.length, 0);
  assert.equal(T.reler("painel", "") !== null, true, "o Painel do Mercado relê as notas"); await esperar(); assert.deepEqual(calls.map((c) => c[1]), ["compras"], "no Painel só as notas (ele não usa os pedidos online)");
  T.lidoEm.notas = T.lidoEm.online = 0; T.trocarSb(fakeSb(banco(), calls = []));
  const p = T.reler("central", ""); globalThis.location.hash = "#mercado/precos"; assert.equal(await p, false, "trocou de tela durante a leitura: descarta");
  await esperar();
});

test("botão ↻ do topo: o Mercado se registra no atualizar da página (busca as duas fontes, só troca se as duas vierem) e espera a tela Adicionar nota", async () => {
  await abrir("central", "", { cu: { per: "tudo" } });
  const regs = []; globalThis.atuModulo = (sec, o) => regs.push([sec, o]);
  globalThis.atuLer = (f) => Promise.resolve().then(f).then((v) => ({ ok: true, v }), (e) => ({ ok: false, erro: e.message }));
  T.ligarAtualizar(); T.ligarAtualizar(); assert.equal(regs.length, 1, "registra uma vez só"); assert.equal(regs[0][0], "mercado");
  const o = regs[0][1], calls = []; T.trocarSb(fakeSb(banco([NOVO]), calls));
  const n = await o.buscar(); assert.ok(n.notas.ok && n.online.ok); assert.ok(n.online.v.some((c) => c.id === "o9"));
  assert.deepEqual(o.antes(), { notas: { ok: true }, online: { ok: true } });
  o.trocar(n); T.drawApp("central"); await esperar(); assert.ok(tudo().includes("Shopee"));
  globalThis.location.hash = "#mercado/importar"; assert.match(o.ocupado(), /Adicionar nota/); globalThis.location.hash = "#mercado/central"; assert.equal(o.ocupado(), "");
  assert.deepEqual(escritas(calls), [], "atualizar só lê");
  const m = ler("mercado.js"), reg = m.slice(m.indexOf("function ligarAtualizar()"), m.indexOf("/* Todas as linhas") > 0 ? m.indexOf("/* Todas as linhas") : m.indexOf("function ligarAtualizar()") + 1200);
  assert.ok(!/\.(insert|update|delete|upsert|rpc)\(|functions\.invoke|racIA/.test(reg.slice(0, 1200)), "o registro só lê");
  assert.match(m, /drawApp\(sub, arg\); reler\(sub, arg\);/, "abrir uma tela do Mercado usa a memória na hora e relê em segundo plano");
  delete globalThis.atuModulo; delete globalThis.atuLer;
});
