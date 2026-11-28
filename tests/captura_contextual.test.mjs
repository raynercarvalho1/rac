// Reestruturação visual, Lote 3 (docs/planejamento/11-reestruturacao-visual.md): o botão + do DONO abre as ações da própria tela; a Fernanda (papel casa) mantém a folha "Anotar rápido".
// As ações de cada tela moram no registro de rotas (js/rotas.js, campo acoes); js/app.js escolhe a lista da tela aberta e esconde o botão onde não há ação.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const app = ler("js/app.js"), rotasSrc = ler("js/rotas.js");
function registro() { const ctx = { console, Object, Array, JSON, String, document: { getElementById: () => null, body: null } }; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(rotasSrc, ctx, { filename: "js/rotas.js" }); return ctx; }
const R = registro();
const js = (x) => JSON.parse(JSON.stringify(x)), acoesDe = (id) => js((R.ROTAS[id].acoes || []).map((a) => a[0]));   // js: os arrays do vm têm outro protótipo

test("registro: cada tela do dono declara as suas ações, e as telas sem ação não têm campo", () => {
  const esperado = { rachoje: ["compra", "lembrete", "gasto"], agenda: ["lembrete"], inbox: ["inbox-novo"], mercado: ["#fiscal", "compra"], lista: ["compra", "tarefa"], mba: ["lembrete", "link"], estudos: ["lembrete", "link"],
    carreira: ["link", "ideia", "lembrete"], vagas: ["link", "lembrete"], conexoes: ["ideia", "link"], olivia: ["peso", "gasto"], eddie: ["peso", "gasto"], veiculos: ["km", "gasto"] };
  for (const [id, ids] of Object.entries(esperado)) assert.deepEqual(acoesDe(id), ids, id);
  const comAcoes = js(R.RAC_ROTAS.filter((r) => r.acoes).map((r) => r.id)).sort(); assert.deepEqual(comAcoes, Object.keys(esperado).sort(), "só estas telas têm ação");
  for (const id of ["saude", "esportes", "newsletter", "x", "sistema", "seguranca", "fiscal", "documentos", "inicio", "resumo", "painel", "iacustos", "conhecimento"]) assert.ok(!R.ROTAS[id].acoes, id + " não tem ação (sem ação, sem botão)");
});
test("registro: toda ação é um formulário que existe na folha, um endereço de página do site ou a ação do Inbox", () => {
  const formularios = [...app.slice(app.indexOf("function capOpcoes()"), app.indexOf("function abrirCaptura(")).matchAll(/\["([a-z]+)","[^"]+","[^"]+"\]/g)].map((m) => m[1]);
  assert.ok(formularios.length >= 8, "a folha tem os formulários de sempre: " + formularios);
  for (const r of R.RAC_ROTAS.filter((x) => x.acoes)) for (const a of r.acoes) {
    assert.equal(a.length, 3, r.id + ": [id, ícone, rótulo]"); assert.ok(a[1] && a[2], r.id + ": ícone e rótulo");
    if (a[0].charAt(0) === "#") assert.ok(R.tabs.includes(a[0].slice(1).split("/")[0]), `${r.id}: ${a[0]} aponta para página que existe`);
    else if (a[0] !== "inbox-novo") assert.ok(formularios.includes(a[0]), `${r.id}: ${a[0]} é um formulário da folha`);
  }
});

/* o trecho de app.js entre os marcadores roda num ambiente falso: o botão +, o papel e a tela aberta (data-sec) */
const trecho = app.slice(app.indexOf("/* [cap-ctx:ini] */"), app.indexOf("/* [cap-ctx:fim] */"));
function botaoFalso() { const cls = new Set(), b = { attrs: {}, classList: { toggle: (c, on) => { on ? cls.add(c) : cls.delete(c); }, contains: (c) => cls.has(c) }, setAttribute(k, v) { this.attrs[k] = v; }, title: "" }; return b; }
function ambiente(papel, sec) {
  const b = botaoFalso(), ctx = { ROTAS: R.ROTAS, PAPEL: papel, isOwner: () => papel === "dono", $: (s) => (s === ".capbtn" ? b : null), document: { documentElement: { getAttribute: () => sec } } };
  vm.createContext(ctx); vm.runInContext(trecho, ctx, { filename: "js/app.js (captura contextual)" }); return { ctx, b };
}
test("o + do dono (Lote 4, 28/11/2026): em TODA tela há Captura universal; nas telas com ação o título cita também 'Adicionar nesta tela'", () => {
  assert.ok(trecho.length > 100, "os marcadores existem em app.js");
  const a = ambiente("dono", "mercado"); a.ctx.capAtualizar(); assert.ok(!a.b.classList.contains("capoculto")); assert.match(a.b.title, /adicionar nesta tela/); assert.match(a.b.attrs["aria-label"], /Capturar ou adicionar nesta tela/); assert.match(a.b.title, /Capturar/); assert.deepEqual(js(a.ctx.capAcoes("mercado").map((x) => x[0])), ["#fiscal", "compra"]);
  /* o que mudou: a Saúde, os Esportes e qualquer tela sem ação TÊM o botão (a Captura universal vale em qualquer ambiente); a lista de atalhos da tela continua vindo de capAcoes (nula onde não há) */
  const s = ambiente("dono", "saude"); s.ctx.capAtualizar(); assert.ok(!s.b.classList.contains("capoculto"), "a Saúde tem a Captura universal"); assert.match(s.b.title, /Capturar/); assert.equal(s.ctx.capAcoes("saude"), null);
  const e = ambiente("dono", "esportes"); e.ctx.capAtualizar(); assert.ok(!e.b.classList.contains("capoculto"));
  const sem = ambiente("dono", ""); sem.ctx.capAtualizar(); assert.ok(!sem.b.classList.contains("capoculto"), "antes de qualquer tela aberta o botão também existe");
});
test("o + da Fernanda (casa) não muda: aparece em toda tela e abre a folha de sempre", () => {
  for (const sec of ["mercado", "lista", "olivia", "eddie", "veiculos", "saude", "esportes", ""]) {
    const c = ambiente("casa", sec); c.ctx.capAtualizar(); assert.ok(!c.b.classList.contains("capoculto"), "casa em " + sec); assert.match(c.b.title, /Anotar rápido/); assert.equal(c.ctx.capAcoes(sec), null, "sem lista contextual: abre a folha completa");
  }
});
test("a folha: aceita a lista da tela, mostra o campo de Captura universal ao dono, navega nos endereços e chama o Inbox; sem lista, é a de sempre", () => {
  const f = app.slice(app.indexOf("function abrirCaptura("), app.indexOf("var FAM_NOMES="));
  assert.match(f, /function abrirCaptura\(inicial,pre,ops\)/); assert.match(f, /ops\|\|capOpcoes\(\)/, "o menu usa a lista da tela, ou a completa sem ela");
  assert.match(f, /isOwner\(\)\?"Capturar":ops\?"Adicionar aqui":"Anotar rápido"/, "dono: Capturar; casa: como antes");
  assert.match(f, /if\(isOwner\(\)\)\{var uni=[\s\S]*capCompositor\(uni/, "o campo de captura vem antes dos atalhos, só para o dono");
  assert.ok(!/ops&&ops\.length===1/.test(f), "uma ação só não pula mais o campo de captura");
  assert.match(f, /charAt\(0\)==="#"[\s\S]*location\.hash=/, "endereço: navega"); assert.match(f, /inbox-novo[\s\S]*inboxCompor\("novo"\)/, "Inbox: Nova mensagem");
  assert.match(app, /new MutationObserver\(capAtualizar\)/, "o botão acompanha a tela aberta (data-sec)"); assert.match(app, /cb\.onclick=function\(\)\{capClicar\(\)\}/);
  assert.match(ler("index.html"), /\.capbtn\.capoculto\{display:none\}/);
});
