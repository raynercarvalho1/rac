// Central de Compras × Radar, telas (mercado.js: viewCategoria, viewProduto, painel da Central): ambiente falso, sem banco real, sem rede, sem SerpApi.
// Garante: só o dono vê; compras PAGAS separadas das ofertas; vínculo só em PESSOAL; criar o produto no Radar só insere em radar_itens; NADA grava em compras nem em preços; registrar compra é o fluxo normal.
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
const esperar = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };
const tudo = () => texto(ROOT).replace(/ /g, " ");   /* o formatador de moeda usa espaço não separável */
const ID1 = "11111111-1111-4111-8111-111111111111", ID2 = "22222222-2222-4222-8222-222222222222", NOVO = "99999999-9999-4999-8999-999999999999";
const L = (id, data, produto, categoria, un, q, vu, mercado = "Confiança") => ({ id, data, mk: data.slice(0, 7), produto, categoria, unidade: un, quantidade: q, valor_unitario: vu, valor_total: Math.round(q * vu * 100) / 100, mercado, nota: data + "|" + mercado });
const ROWS = [L("1", "2026-10-01", "Pão Francês", "Padaria", "kg", 0.5, 18), L("2", "2026-11-02", "Pão Francês", "Padaria", "kg", 0.4, 16.5, "Reinaldo"), L("3", "2026-11-02", "Bolo de Fubá", "Padaria", "un", 1, 12), L("4", "2026-11-03", "Leite", "Mercearia", "un", 6, 5)];
function fakeSb(db, calls) {
  return { auth: { signOut: () => Promise.resolve() }, from(nome) {
    const q = { _acao: null };
    const res = () => { if (q._acao === "insert") { calls.push(["insert", nome, q._dado]); db[nome] = (db[nome] || []).concat([Object.assign({ id: NOVO, ativo: true }, q._dado)]); return { data: { id: NOVO } }; } calls.push(["select", nome]); let d = db[nome] || []; if (q._in) d = d.filter((x) => q._in[1].includes(x[q._in[0]])); return { data: d }; };
    for (const m of ["select", "order", "limit", "eq", "single", "range"]) q[m] = () => q;
    q.in = (c, v) => { q._in = [c, v]; return q; }; q.insert = (d) => { q._acao = "insert"; q._dado = d; return q; };
    q.update = (d) => { calls.push(["update", nome, d]); return q; }; q.delete = () => { calls.push(["delete", nome]); return q; };
    q.then = (ok, er) => Promise.resolve(res()).then(ok, er); return q; } };
}
const montarOfertas = []; globalThis.window.precisa = () => Promise.resolve(); globalThis.window.rtMontarOfertas = (alvo, sb, user, id, pago) => { montarOfertas.push([id, pago]); alvo.appendChild({ tag: "p", attrs: {}, children: [{ text: "OFERTAS-EMBUTIDAS " + id }] }); return Promise.resolve(); };
const abrir = async (sub, arg, { dono = true, vinculos, db = {} } = {}) => {
  DONO = dono; gravacoes.length = 0; montarOfertas.length = 0; globalThis.PESSOAL = vinculos ? { "radar-vinculos": vinculos } : {}; const calls = []; T.trocarSb(fakeSb(db, calls)); T.usar(ROWS, { email: "dono@exemplo.com" });
  T.drawApp(sub, arg); await esperar(); return calls;
};
const botoes = (txt) => achar(ROOT, (e) => e.tag === "button" && texto(e).includes(txt)), links = (href) => achar(ROOT, (e) => e.tag === "a" && e.attrs.href === href);
const ITENS = [{ id: ID1, nome: "Pão francês 50 g", ativo: true, origem: "monitorado" }, { id: ID2, nome: "Fone XM-4", ativo: true, origem: "monitorado" }];

test("produto (dono, sem vínculo): histórico do que foi PAGO, registrar compra pelo fluxo normal, sugestão do Radar; nada é gravado até o dono clicar", async () => {
  const calls = await abrir("produto", encodeURIComponent("Pão Francês"), { db: { radar_itens: ITENS } }), t = tudo();
  for (const x of ["Pão Francês", "Padaria", "O que você pagou", "R$ 16,50", "R$ 18,00", "Último pago", "Menor pago", "Preço médio", "Comprou? Registre a compra", "Ofertas na internet", "Parecidos no Radar", "Vincular a “Pão francês 50 g”", "Monitorar este produto no Radar"]) assert.ok(t.includes(x), x);
  assert.equal(links("#mercado/importar").filter((e) => /Registrar compra/.test(texto(e))).length, 1, "registrar compra usa o fluxo normal (adicionar nota)");
  assert.match(t, /Nada é gravado automaticamente/, "o aviso de que preço de anúncio não é preço pago");
  assert.deepEqual(calls.filter((c) => c[0] !== "select"), [], "só leitura ao abrir"); assert.deepEqual(gravacoes, []); assert.equal(montarOfertas.length, 0, "sem vínculo, as ofertas não são mostradas");
  assert.ok(links("#mercado/categoria/Padaria").length >= 1, "a trilha leva à categoria");
});

test("vincular: grava SÓ o vínculo em PESSOAL (nada em compras, preços ou ofertas) e passa a mostrar as ofertas do produto, com o último preço pago para a comparação", async () => {
  const calls = await abrir("produto", encodeURIComponent("Pão Francês"), { db: { radar_itens: ITENS } });
  botoes("Vincular a “Pão francês 50 g”")[0].onclick(); await esperar(8);
  assert.deepEqual(gravacoes, [["radar-vinculos", { [N.pcChave("Pão Francês")]: ID1 }]], "só o vínculo");
  assert.deepEqual(calls.filter((c) => c[0] !== "select"), [], "nenhuma escrita no banco de compras nem do Radar");
  assert.equal(montarOfertas.length, 1); assert.equal(montarOfertas[0][0], ID1); assert.deepEqual([montarOfertas[0][1].unitario, montarOfertas[0][1].unidade, montarOfertas[0][1].data], [16.5, "kg", "2026-11-02"], "o preço pago enviado é o da última compra registrada");
  assert.ok(tudo().includes("OFERTAS-EMBUTIDAS " + ID1) && tudo().includes("Produto do Radar vinculado: Pão francês 50 g") && botoes("Desvincular").length === 1);
  botoes("Desvincular")[0].onclick(); await esperar(8); assert.deepEqual(gravacoes.at(-1), ["radar-vinculos", {}], "desvincular remove só o vínculo");
});

test("monitorar este produto: cria UM produto no Radar (origem comprado) e o vincula; não cria oferta, preço nem compra", async () => {
  const calls = await abrir("produto", encodeURIComponent("Bolo de Fubá"), { db: { radar_itens: [] } });
  assert.equal(botoes("Vincular a").length, 0, "sem parecidos no Radar"); botoes("Monitorar este produto no Radar")[0].onclick(); await esperar(10);
  assert.deepEqual(calls.filter((c) => c[0] === "insert"), [["insert", "radar_itens", { nome: "Bolo de Fubá", origem: "comprado" }]]); assert.deepEqual(calls.filter((c) => c[0] === "update" || c[0] === "delete"), []);
  assert.deepEqual(gravacoes, [["radar-vinculos", { [N.pcChave("Bolo de Fubá")]: NOVO }]]); assert.equal(montarOfertas[0][0], NOVO);
});

test("a casa (Fernanda) não vê categoria, produto nem o painel de categorias: a experiência dela não muda", async () => {
  const c1 = await abrir("produto", encodeURIComponent("Pão Francês"), { dono: false, db: { radar_itens: ITENS } }); assert.ok(!tudo().includes("O que você pagou") && !tudo().includes("Ofertas na internet")); assert.deepEqual(c1.filter((x) => x[1] === "radar_itens"), [], "nem consulta o Radar");
  await abrir("categoria", "Padaria", { dono: false }); assert.ok(!tudo().includes("Último preço pago"));
  T.usarOnline([]); await abrir("central", "", { dono: false }); assert.ok(!tudo().includes("Explorar por categoria"));
  assert.ok(!links("#mercado/categoria/Padaria").length && !links("#mercado/produto/P%C3%A3o%20Franc%C3%AAs").length);
});

test("categoria: produtos com último preço pago e menor pago, links para cada produto e selo de ofertas SÓ dos vinculados; preço de anúncio vem rotulado como não confirmado", async () => {
  const db = { radar_candidatos: [
    { item_id: ID1, tipo_oferta: "individual", preco: 3, preco_por_medida: 2.5, base_medida: "100 g", decisao: "pendente", pai_externo: null, loja: "Magalu" },
    { item_id: ID1, tipo_oferta: "kit_mesmo_produto", preco: 20, preco_por_medida: 3.1, base_medida: "100 g", decisao: "acompanhando", pai_externo: null, loja: "Amazon" },
    { item_id: ID1, tipo_oferta: "relacionado", preco: 5, preco_por_medida: 0.4, base_medida: "100 g", decisao: "pendente", pai_externo: null, loja: "X" }] };
  const calls = await abrir("categoria", "Padaria", { vinculos: { [N.pcChave("Pão Francês")]: ID1 }, db }), t = tudo();
  for (const x of ["Padaria", "Pão Francês", "Bolo de Fubá", "Último preço pago", "R$ 16,50/kg", "Menor pago", "R$ 12,00/un", "Sem vínculo com o Radar", "2 ofertas do produto", "1 relacionada(s)", "melhor R$ 2,50 por 100 g", "1 acompanhando", "preço visto na internet, não confirmado"]) assert.ok(t.includes(x), x);
  assert.ok(!t.includes("R$ 0,40"), "o relacionado barato não vira 'melhor preço'"); assert.ok(!t.includes("Leite"), "só a categoria pedida");
  assert.equal(links("#mercado/produto/" + encodeURIComponent("Bolo de Fubá")).length, 1); assert.deepEqual(calls.filter((c) => c[0] !== "select"), []);
  assert.equal(calls.filter((c) => c[1] === "radar_candidatos").length, 1, "uma consulta só para todos os vinculados");
});

test("Central (dono): painel 'Explorar por categoria' com link para cada categoria", async () => {
  T.usarOnline([]); await abrir("central", "", {}); const t = tudo();
  assert.ok(t.includes("Explorar por categoria") && t.includes("Padaria") && t.includes("Mercearia")); assert.equal(links("#mercado/categoria/Padaria").length, 1);
});

test("código: as visões novas só leem as compras e só escrevem em radar_itens (criar o produto) e no vínculo (PESSOAL); sem IA, sem SerpApi, sem função do Radar, sem tocar em preços ou compras", () => {
  const m = ler("mercado.js"), i0 = m.indexOf("/* ---------- Categoria e Produto:"), i1 = m.indexOf("/* ---------- Produtos: renomear"); assert.ok(i0 > 0 && i1 > i0); const b = m.slice(i0, i1);
  assert.equal([...b.matchAll(/\.insert\(/g)].length, 1); assert.match(b, /from\("radar_itens"\)\.insert\(\{ nome: nome\.slice\(0, 160\), origem: "comprado" \}\)/);
  assert.ok(!/\.(update|delete|upsert|rpc)\(|functions\.invoke|racIA|anthropic|serpapi/i.test(b)); assert.ok(!/from\("(compras|radar_precos|radar_ofertas|radar_coletas|radar_lojas)"\)/.test(b), "não toca em compras nem em preços");
  assert.match(b, /pessoalGravar\("radar-vinculos"/); assert.match(b, /if \(!ehDono\(\)\) return;/);
  assert.match(ler("js/app.js"), /RACmercado\.render\(parts\[1\]\|\|"",parts\[2\]\|\|""\)/);
});
