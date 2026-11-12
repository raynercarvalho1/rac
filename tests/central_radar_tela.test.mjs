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
  assert.match(b, /pessoalGravar\("radar-vinculos"/); assert.match(b, /if \(!ehDono\(\)\) \{ body\.appendChild\(reg\); return; \}/);
  assert.match(ler("js/app.js"), /RACmercado\.render\(parts\[1\]\|\|"",parts\[2\]\|\|""\)/);
});

/* ---------- ajustes pedidos pelo dono em 12/11/2026: ordem, compra de origem, Produtos, voltar ---------- */
globalThis.document.body = new El("body"); El.prototype.removeAttribute = function (k) { delete this.attrs[k]; }; const T2 = globalThis.window.RACmercado._teste, indice = (t, x) => t.indexOf(x);
const abrirComLinhas = async (sub, arg, linhas, { dono = true, db = {} } = {}) => {
  DONO = dono; gravacoes.length = 0; montarOfertas.length = 0; globalThis.PESSOAL = {}; const calls = []; T.trocarSb(fakeSb(db, calls)); T.usar(linhas, { email: "dono@exemplo.com" });
  T.drawApp(sub, arg); await esperar(); return calls;
};
const NOTA_FEV = "2026-11-02|Reinaldo|", NOTA_OUT = "2026-10-01|Confiança|";

test("produto: as ofertas da internet ficam ACIMA de 'Comprou? Registre a compra' (com e sem vínculo); para a casa nada de ofertas", async () => {
  await abrir("produto", encodeURIComponent("Pão Francês"), { db: { radar_itens: ITENS } }); let t = tudo();
  assert.ok(indice(t, "Ofertas na internet") > 0 && indice(t, "Ofertas na internet") < indice(t, "Comprou? Registre a compra"), "sem vínculo");
  await abrir("produto", encodeURIComponent("Pão Francês"), { vinculos: { [N.pcChave("Pão Francês")]: ID1 }, db: { radar_itens: ITENS } }); t = tudo();
  assert.ok(indice(t, "OFERTAS-EMBUTIDAS") > 0 && indice(t, "OFERTAS-EMBUTIDAS") < indice(t, "Comprou? Registre a compra"), "com vínculo: as ofertas vêm antes do registro de compra");
  await abrir("produto", encodeURIComponent("Pão Francês"), { dono: false }); t = tudo(); assert.ok(!t.includes("Ofertas na internet") && !t.includes("Radar de Preços"));
});

test("cada caixa de valor leva à COMPRA onde o valor foi registrado (tela Notas com a nota aberta); média e contagem levam ao histórico; cada linha do histórico também abre a sua compra", async () => {
  await abrir("produto", encodeURIComponent("Pão Francês"), { db: { radar_itens: ITENS } });
  const caixa = (rot) => achar(ROOT, (e) => e.tag === "a" && /mkkpi/.test(e.className) && texto(e).includes(rot))[0];
  for (const [rot, nota] of [["Último pago", NOTA_FEV], ["Menor pago", NOTA_FEV]]) {
    const a = caixa(rot); assert.ok(a, rot + " é um link"); assert.equal(a.attrs.href, "#mercado/notas"); assert.match(a.attrs.title, /Abrir a compra de 02\/11\/2026/); assert.ok(texto(a).includes("Ver a compra"));
    globalThis.location.hash = ""; T.st.notaAberta = null; a.onclick({ preventDefault() {} }); assert.equal(T.st.notaAberta, nota, rot + " → nota de origem"); assert.equal(globalThis.location.hash, "#mercado/notas");
  }
  for (const rot of ["Preço médio", "Compras"]) { const a = caixa(rot); assert.ok(a && texto(a).includes("Ver as compras"), rot + " leva ao histórico"); globalThis.location.hash = "x"; a.onclick({ preventDefault() {} }); assert.equal(globalThis.location.hash, "x", "não navega: só rola até o histórico"); }
  const linhas = achar(ROOT, (e) => e.tag === "a" && /plr/.test(e.className)); assert.equal(linhas.length, 2, "uma linha por compra");
  assert.equal(linhas[0].attrs.href, "#mercado/notas"); T.st.notaAberta = null; linhas[0].onclick({ preventDefault() {} }); assert.equal(T.st.notaAberta, NOTA_FEV, "a mais recente"); linhas[1].onclick({ preventDefault() {} }); assert.equal(T.st.notaAberta, NOTA_OUT, "a mais antiga");
  /* a tela Notas abre exatamente aquela nota */
  T.drawApp("notas"); await esperar(); const abertas = achar(ROOT, (e) => e.tag === "details" && e.attrs.open === "open"); assert.equal(abertas.length, 1, "só a nota de origem fica aberta");
  assert.deepEqual(gravacoes, [], "navegar não grava nada");
});

test("categoria: 'último preço pago' e 'menor pago' abrem a compra de origem", async () => {
  await abrir("categoria", "Padaria", {});
  const tx = (e) => texto(e).replace(/ /g, " "), ult = achar(ROOT, (e) => e.tag === "a" && /mkpc-pago/.test(e.className) && tx(e).includes("R$ 16,50")), menor = achar(ROOT, (e) => e.tag === "a" && /mk-inline/.test(e.className) && tx(e).includes("Menor pago R$ 16,50"));
  assert.equal(ult.length, 1); assert.equal(menor.length, 1); T.st.notaAberta = null; ult[0].onclick({ preventDefault() {} }); assert.equal(T.st.notaAberta, NOTA_FEV); T.st.notaAberta = null; menor[0].onclick({ preventDefault() {} }); assert.equal(T.st.notaAberta, NOTA_FEV);
});

test("Produtos (dono): o NOME abre a página do produto e 'Renomear' é um botão à parte; sem 'Abrir página'; a casa continua editando o nome direto", async () => {
  const linhas = ROWS.map((r) => ({ ...r, produto_id: r.produto === "Pão Francês" ? "p1" : "p9" })), prods = [{ id: "p1", nome: "Pão Francês", categoria: "Padaria", unidade: "kg" }, { id: "p0", nome: "Sem compra", categoria: "Padaria", unidade: "un" }];
  let calls = await abrirComLinhas("produtos", "", linhas, { db: { produtos: prods } }); await esperar(); const t = tudo();
  assert.ok(!t.includes("Abrir página")); const ver = achar(ROOT, (e) => e.tag === "a" && /mkplink/.test(e.className)); assert.equal(ver.length, 1, "só o produto que tem compras vira link"); assert.equal(ver[0].attrs.href, "#mercado/produto/" + encodeURIComponent("Pão Francês")); assert.equal(texto(ver[0]), "Pão Francês");
  const ren = botoes("Renomear"); assert.equal(ren.length, 1); assert.equal(achar(ROOT, (e) => e.tag === "input" && /mkpname/.test(e.className)).length, 1, "sem compras: o nome segue editável direto (não há página)");
  ren[0].onclick(); const inp = achar(ROOT, (e) => e.tag === "input" && /mkpname/.test(e.className)); assert.equal(inp.length, 2, "o campo aparece ao pedir para renomear"); assert.ok(botoes("Salvar").length === 1 && botoes("Cancelar").length === 1);
  const campo = inp.find((e) => e.value === "Pão Francês"); campo.value = "Pão Francês Novo"; botoes("Salvar")[0].onclick(); await esperar();
  assert.deepEqual(calls.filter((c) => c[0] === "update"), [["update", "produtos", { nome: "Pão Francês Novo" }]], "renomear grava só o nome");
  calls = await abrirComLinhas("produtos", "", linhas, { dono: false, db: { produtos: prods } }); await esperar(); assert.equal(achar(ROOT, (e) => e.tag === "a" && /mkplink/.test(e.className)).length, 0, "a casa não tem o link"); assert.equal(botoes("Renomear").length, 0); assert.equal(achar(ROOT, (e) => e.tag === "input" && /mkpname/.test(e.className)).length, 2, "campo direto, como antes");
});

test("botão voltar flutuante (celular): em TODAS as páginas do site (não só na Central), com a mesma regra do voltar da barra de título; acima do ☰; nada de voltar próprio no Mercado", () => {
  const app = ler("js/app.js"), css = ler("index.html"), mk = ler("mercado.js");
  assert.match(app, /function voltarPagina\(\)\{if\(PROF>0\)history\.back\(\);else if\(VOLTAR_PAI\)location\.hash=VOLTAR_PAI\}/, "uma função só: histórico do site, ou o nível acima");
  assert.match(app, /\$\("#voltarbtn"\)\.addEventListener\("click",voltarPagina\)/, "o da barra de título usa a mesma função");
  assert.match(app, /if\(!\$\("\.voltarbtn"\)\)\{var vb=h\("button",\{type:"button",class:"voltarbtn","aria-label":"Voltar",title:"Voltar",hidden:"",text:"←"\}\);vb\.onclick=voltarPagina;/, "criado uma vez, depois do login, para todas as seções");
  assert.match(app, /\$\("#voltarbtn"\)\.hidden=!\(PROF>0\|\|VOLTAR_PAI\);\s*var vf=\$\("\.voltarbtn"\);if\(vf\)vf\.hidden=!\(PROF>0\|\|VOLTAR_PAI\);/, "aparece/some em cada rota pela MESMA expressão do voltar da barra de título (some no Início)");
  assert.ok(!/top!=="mercado"\)\{var vb/.test(app), "sem regra só do Mercado");
  assert.ok(!/botaoVoltar|voltarBtn|class: "voltarbtn"/.test(mk), "o Mercado não cria voltar próprio: o do site vale em todas as páginas");
  assert.match(css, /\.voltarbtn\{position:fixed;left:max\(14px[^}]*bottom:calc\(76px/, "acima do ☰ (bottom 16 + 48 + 12)"); assert.match(css, /@media\(min-width:861px\)\{\.voltarbtn\{display:none!important\}\}/, "só no celular, onde os botões flutuantes existem");
  assert.match(css, /\.menuflut\[hidden\]~\.voltarbtn\{bottom:calc\(16px/, "sem o ☰ visível, o ← ocupa o lugar dele");
});
