// Registro de rotas e do menu (Fase 2 · A3, docs/planejamento/02-auditoria-arquitetural.md, seção 9). As páginas, o menu lateral, quem vê cada
// página (dono e casa) e os módulos de cada rota saem de uma tabela só (js/rotas.js). Este teste compara com a cópia de ANTES
// (tests/fixtures/fase2/, tirada da main 95940e4): o mesmo menu (HTML igual), as mesmas listas e o mesmo comportamento do route() —
// o código antigo e o novo rodam lado a lado no mesmo ambiente falso, para todas as páginas e subpáginas, como dono e como casa.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { lerArq, registro } from "./_rotas.mjs";

const R = registro(), ANTES_JS = lerArq("tests/fixtures/fase2/rotas-antes.js"), ANTES_MENU = lerArq("tests/fixtures/fase2/menu-antes.html");
const app = lerArq("js/app.js"), html = lerArq("index.html");
const antes = (() => { const c = {}; vm.createContext(c); vm.runInContext(ANTES_JS.replace(/function route\(\)\{[\s\S]*$/, ""), c); return JSON.parse(JSON.stringify({ tabs: c.tabs, DA_CASA: c.DA_CASA, ROTA_MODS: c.ROTA_MODS })); })();
const ordenado = (l) => [...l].sort();
/* Fase 3 · DS-1: a ÚNICA rota nova desde a cópia de antes é a página interna "componentes" (só do dono, sem item no menu); o resto tem de ser igual */
const NOVAS = ["componentes"], semNovas = (l) => l.filter((x) => !NOVAS.includes(x));

test("as mesmas páginas, a mesma lista da casa e os mesmos módulos por rota (antes × depois)", () => {
  assert.equal(R.tabs.length, 31); assert.deepEqual(ordenado(semNovas(R.tabs)), ordenado(antes.tabs), "todas as rotas de antes, só a página de componentes a mais");
  assert.ok(R.tabs.includes("componentes") && !R.DA_CASA.includes("componentes"), "a página de componentes existe e a casa não a vê");
  assert.deepEqual(ordenado(R.DA_CASA), ordenado(antes.DA_CASA), "a Fernanda vê exatamente as mesmas páginas");
  assert.deepEqual(ordenado(R.DA_CASA), ["alimentacao", "compras", "documentos", "eddie", "fiscal", "lista", "mercado", "olivia", "rede", "seguranca", "veiculos"]);
  assert.deepEqual(R.ROTA_MODS.componentes, ["componentes"]); const { componentes: _c, ...modsSemNova } = R.ROTA_MODS;
  assert.deepEqual(modsSemNova, antes.ROTA_MODS, "cada rota carrega os mesmos módulos sob demanda");
  for (const r of R.rotas) assert.ok(!r.mods || r.mods.every((m) => lerArq("js/" + m + ".js")), r.id);
  for (const id of R.tabs) assert.match(html, new RegExp(`<section id="${id}" hidden>`), id + " tem a sua <section>");
  assert.ok(!/var tabs=|var DA_CASA=|var ROTA_MODS=|var sports=/.test(app), "as listas não são mais mantidas à mão em js/app.js");
});

test("o menu lateral gerado é o mesmo HTML de antes, item por item e na mesma ordem; a regra da casa vem da mesma tabela", () => {
  const velho = [...ANTES_MENU.matchAll(/<a class="it"[\s\S]*?<\/a>/g)].map((m) => m[0]);
  const novo = [...R.menu.matchAll(/<a class="it"[\s\S]*?<\/a>/g)].map((m) => m[0]);
  assert.equal(velho.length, 29); assert.equal(R.menu, R.html, "o menu inserido na página é o do registro");
  /* Fase 3: cada item ganhou data-area e --o (o menu do dono é agrupado por CSS); fora isso o HTML é o de antes */
  const semFase3 = (x) => x.replace(' data-casa="1"', "").replace(/ data-area="[a-z]+" style="--o:\d+"/, "");
  assert.deepEqual(novo.map(semFase3), velho, "mesmo HTML (ícone, cor, nome, contador), na mesma ordem");
  /* antes: uma regra de CSS listava as páginas da casa; agora o item traz data-casa e a regra só olha para ele */
  const naCss = [...ANTES_MENU.matchAll(/:not\(\[data-k="([a-z-]+)"\]\)/g)].map((m) => m[1]);
  assert.deepEqual(ordenado(novo.filter((a) => / data-casa="1"/.test(a)).map((a) => /data-k="([^"]+)"/.exec(a)[1])), ordenado(naCss));
  assert.match(html, /html\.casa #navgrp a\.it:not\(\[data-casa\]\)/); assert.ok(!/html\.casa #navgrp a\.it:not\(\[data-k=/.test(html));
  const resto = ANTES_MENU.match(/<style>\n([^\n]*)\n/)[1].replace(/html\.casa #navgrp a\.it(:not\(\[data-k="[a-z-]+"\]\))+/, "html.casa #navgrp a.it:not([data-casa])");
  assert.ok(html.includes(resto), "o resto da regra de CSS da casa ficou igual");
  assert.match(html, /<nav class="grp" id="navgrp" aria-label="Seções">\n      <h4>Painel<\/h4>/, "o título do grupo continua");
  assert.ok(!/<a class="it" href="#inicio"/.test(html), "o menu não é mais HTML fixo");
  assert.ok(R.rotas.filter((r) => r.grupo).every((r) => r.grupo === "Painel"), "o grupo do registro continua um só (\"Painel\"); as áreas da Fase 3 são o campo area, aplicado por CSS só para o dono");
  assert.deepEqual(R.rotas.filter((r) => !r.grupo).map((r) => r.id).sort(), ["busca", "componentes"], "só a Busca (como antes) e a página de componentes (Fase 3) ficam sem item no menu");
  const idx = ["js/dados.js", "mercado.js", "js/rotas.js", "js/app.js"].map((s) => html.indexOf(`<script src="${s}"></script>`));
  assert.ok(idx.every((x, i) => x > 0 && (!i || x > idx[i - 1])), "o registro carrega antes do app (a busca lateral lê o menu ao abrir)");
  assert.match(lerArq("sw.js"), /"\.\/js\/rotas\.js"/);
});

/* ---------- route(): o código de antes e o de agora no mesmo ambiente falso, registrando tudo o que cada um faz ---------- */
const RENDER = ["renderX", "renderInicio", "renderEstudos", "renderMba", "renderFamilia", "renderRede", "renderCarreira", "renderLista", "renderAgenda", "renderResumo", "renderPainel",
  "renderAlimentacao", "renderCompras", "renderFiscal", "renderHoje", "renderCustosIa", "renderBusca", "renderSistema", "renderSeguranca", "renderConexoes", "renderNewsletter", "renderSaude",
  "renderVeiculos", "renderCentral", "renderMlb", "renderEspn", "vgAlertas", "abrirCaptura", "sideMark", "mark", "atuBotao", "atuAviso", "fundoPagina", "marcarProfundidade", "setSide", "logErro"];
const TODOS_MODS = ["esportes", "esportes-central", "familia", "mba", "saude", "conexoes", "newsletter", "sistema", "lista", "carreira", "resumo", "rede", "seguranca", "painel", "alimentacao", "compras", "fiscal", "hoje", "iacustos"];
function rodar(codigo, { papel, hash, carregados }) {
  const log = [], el = (nome) => new Proxy({}, { set(_, k, v) { log.push(["set", nome, k, v]); return true; }, get(_, k) { if (k === "insertAdjacentHTML") return () => {}; if (k === "insertBefore") return () => log.push(["erro na tela", nome]); return undefined; } });
  const ctx = { console, Promise, Object, Array, JSON, String, decodeURIComponent, PAPEL: papel, PROF: 0, VOLTAR_PAI: "", ATU: { rodando: false },
    location: { hash }, history: { state: null, replaceState: (s, t, u) => log.push(["replaceState", u]) }, isOwner: () => papel === "dono",
    setTimeout: (f, ms) => log.push(["setTimeout", ms]), scrollTo: (x, y) => log.push(["scrollTo", x, y]), xCats: () => [{ k: "jornalistas" }, { k: "tech" }],
    MOD_OK: Object.fromEntries((carregados ? TODOS_MODS : []).map((m) => [m, 1])), precisa: (l) => { log.push(["precisa", l.join(",")]); return { then: () => {} }; },
    h: () => ({}), $: (s) => el(s), RACmercado: { render: (...a) => log.push(["RACmercado.render", ...a]) },
    document: { getElementById: (id) => el("#" + id), querySelector: (s) => el(s), documentElement: { setAttribute: (k, v) => log.push(["attr", k, v]) } } };
  for (const n of RENDER) ctx[n] = (...a) => { log.push([n, ...a]); };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(codigo, ctx); ctx.route();
  return juntarSecoes(log);
}
/* a única diferença aceita: a ORDEM em que as <section> são escondidas dentro do mesmo laço (tabs.forEach), que antes seguia a lista
   escrita à mão e agora segue o registro. É um laço síncrono, sem desenho no meio: o resultado na tela é o mesmo. Cada sequência de
   "esconde/mostra seção" vira um bloco ordenado; todo o resto (o que é chamado, com que argumentos e em que ordem) é comparado como veio */
function juntarSecoes(log) {
  const out = []; let bloco = null;
  for (const x of log) {
    if (x[0] === "set" && x[1] === "#componentes") continue;   // a seção nova (Fase 3) não existia na cópia de antes
    if (x[0] === "set" && x[2] === "hidden" && /^#[a-z-]+$/.test(x[1]) && !/^#(sp-|homebtn|voltarbtn)/.test(x[1])) { if (!bloco) { bloco = []; out.push(["seções", bloco]); } bloco.push(x[1] + "=" + x[3]); continue; }
    if (bloco) bloco.sort(); bloco = null; out.push(x);
  }
  if (bloco) bloco.sort();
  return out;
}
const NOVO = lerArq("js/rotas.js") + "\n" + app.slice(app.indexOf("  function route(){"), app.indexOf("  window.addEventListener(\"hashchange\",route);"));
const HASHES = ["", "#", "#inexistente", "#captura", "#x/jornalistas", "#x/nada", "#mercado/central", "#mercado/categoria/Pet", "#mercado/produto/Leite%20integral", "#mercado/estabelecimento/Mercado%20A", "#mercado/radar",
  "#esportes/beisebol", "#esportes/beisebol/dodgers", "#esportes/beisebol/time-119", "#esportes/beisebol/jogo-849805", "#esportes/basquete/jogo-1", "#esportes/futebol-americano", "#esportes/futebol", "#esportes/giro", "#esportes/central",
  "#busca/leite%20integral", "#busca/a/b", "#newsletter/semana", "#newsletter/busca/x%2Fy", "#conexoes/x/a%20b", "#saude/treino/123", "#saude/sono", "#compras/loja/amazon/x", "#carreira/editar/1", "#mba/aulas",
  "#resumo/2026/treinos", "#seguranca/restaurar", "#veiculos/civic", "#lista/x", "#alimentacao/a/b", "#painel/x", "#documentos/x", "#sistema", "#rachoje", "#iacustos", "#agenda"];

test("route() faz exatamente o mesmo de antes em todas as páginas e subpáginas, para o dono e para a casa, com e sem os módulos carregados", () => {
  const casos = [...new Set([...HASHES, ...semNovas(R.tabs).map((t) => "#" + t)])];
  let n = 0;
  for (const papel of ["dono", "casa"]) for (const carregados of [true, false]) for (const hash of casos) {
    const a = rodar(ANTES_JS, { papel, hash, carregados }), d = rodar(NOVO, { papel, hash, carregados });
    assert.deepEqual(d, a, `${papel} ${carregados ? "com" : "sem"} módulos em "${hash}"`); n++;
  }
  assert.ok(n > 250, n + " casos");
  /* e o que se espera de alguns, para o teste não comparar dois "nada" */
  const dono = rodar(NOVO, { papel: "dono", hash: "#saude/treino/123", carregados: true }), casa = rodar(NOVO, { papel: "casa", hash: "#rachoje", carregados: true });
  assert.ok(dono.some((x) => x[0] === "renderSaude" && x[1] === "123")); assert.ok(casa.some((x) => x[0] === "RACmercado.render"), "a casa num endereço do dono vai para a Central de Compras");
  assert.deepEqual(rodar(NOVO, { papel: "dono", hash: "#agenda", carregados: false }).filter((x) => x[0] === "precisa"), [["precisa", "sistema"]], "carrega o módulo antes de abrir");
});

test("destinos das notificações (Agenda, Resumo, Lista e outros do site) abrem a mesma página de antes", () => {
  for (const hash of ["#agenda", "#resumo", "#lista", "#sistema", "#newsletter/semana", "#mercado/radar"]) for (const papel of ["dono", "casa"])
    assert.deepEqual(rodar(NOVO, { papel, hash, carregados: true }), rodar(ANTES_JS, { papel, hash, carregados: true }), papel + " " + hash);
});
