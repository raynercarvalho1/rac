// Design System RAC (Fase 3 · DS-0 e DS-1; docs/design-system.md). Trava o que não pode estragar: (1) a catraca de cores soltas no CSS,
// (2) os tokens --rac-* existem e valem nos três temas, (3) os pares de cor principais atingem o contraste da WCAG,
// (4) as classes rac- não usam cor escrita, (5) a página interna #componentes é só do dono, não está no menu e desenha sem erro,
// (6) o JavaScript novo é ES5 e não repete nome de função global.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { lerArq, registro } from "./_rotas.mjs";

const html = lerArq("index.html"), css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
/* linhas que só declaram tokens (variáveis) ou abrem os blocos de tema: nelas cor escrita é permitida */
const ehToken = (l) => /^\s*(--|:root|@media \(prefers-color-scheme: dark\)\{:root)/.test(l);
const soltas = css.split("\n").filter((l) => !ehToken(l)).join("\n");

/** Linha de base de 13/11/2026 (início da Fase 3): 115 cores escritas fora de variáveis. A catraca só deixa DESCER: cada migração baixa este número. */
const LINHA_DE_BASE_CORES = 115;

test("catraca: as cores escritas fora de variáveis não podem aumentar", () => {
  const n = (soltas.match(HEX) || []).length;
  assert.ok(n <= LINHA_DE_BASE_CORES, `há ${n} cores escritas fora de variáveis; o limite é ${LINHA_DE_BASE_CORES}. Use var(--rac-*) ou um token. Se migrou telas e o número baixou, baixe também LINHA_DE_BASE_CORES.`);
});

const bloco = (ini, fim) => { const a = css.indexOf(ini); assert.ok(a >= 0, ini); return css.slice(a, css.indexOf(fim, a)); };
const TOKENS_RAC = [...new Set([...css.matchAll(/--rac-[a-z0-9-]+(?=:)/g)].map((m) => m[0]))];

test("os tokens --rac-* existem (marca, estados, espaço, raio, sombra, movimento, camadas, tipografia) e o que muda por tema vale nos três temas", () => {
  for (const t of ["--rac-dodger", "--rac-dodger-forte", "--rac-dodger-claro", "--rac-vermelho", "--rac-prata", "--rac-ok", "--rac-aviso", "--rac-erro", "--rac-info", "--rac-fundo", "--rac-sup-1", "--rac-sup-2", "--rac-texto", "--rac-texto-2", "--rac-linha", "--rac-linha-campo", "--rac-foco",
    "--rac-esp-1", "--rac-esp-4", "--rac-esp-12", "--rac-raio-1", "--rac-raio-3", "--rac-raio-pilula", "--rac-sombra-1", "--rac-sombra-3", "--rac-mov-rapido", "--rac-z-janela", "--rac-alvo", "--rac-fs-num", "--rac-fs-mono"])
    assert.ok(TOKENS_RAC.includes(t), "falta o token " + t);
  assert.equal(/--rac-alvo:44px/.test(css), true, "alvo de toque de 44 px");
  /* o que depende do tema (cor de informação/foco e borda de campo) tem valor no claro, no escuro automático e no escuro manual */
  const claro = bloco(":root{\n  --rac-dodger:", "}"), escAuto = bloco('@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--rac-info', "}}"), escManual = bloco(':root[data-theme="dark"]{--rac-info', "}");
  for (const [nome, b] of [["claro", claro], ["escuro automático", escAuto], ["escuro manual", escManual]]) {
    assert.match(b, /--rac-info:#[0-9A-Fa-f]{6}/, "--rac-info no tema " + nome); assert.match(b, /--rac-linha-campo:#[0-9A-Fa-f]{6}/, "--rac-linha-campo no tema " + nome);
  }
  assert.equal(/--rac-info:(#[0-9A-Fa-f]{6})/.exec(escAuto)[1], /--rac-info:(#[0-9A-Fa-f]{6})/.exec(escManual)[1], "os dois escuros são iguais");
  assert.equal(/--rac-linha-campo:(#[0-9A-Fa-f]{6})/.exec(escAuto)[1], /--rac-linha-campo:(#[0-9A-Fa-f]{6})/.exec(escManual)[1]);
});

/* contraste pela fórmula da WCAG 2.x */
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const valor = (b, t) => new RegExp(t + ":(#[0-9A-Fa-f]{6})").exec(b)[1];

test("contraste (WCAG): texto ≥ 4,5:1 e bordas de campo ≥ 3:1, nos dois temas", () => {
  const claro = css.slice(css.indexOf(":root{\n  --bg:"), css.indexOf("@media (prefers-color-scheme: dark)")), escuro = css.slice(css.indexOf(':root[data-theme="dark"]{'), css.indexOf("/* ===== Design System RAC · DS-0"));
  const marca = bloco(":root{\n  --rac-dodger:", "}"), esc = bloco(':root[data-theme="dark"]{--rac-info', "}");
  const BRANCO = "#FFFFFF", pares = [
    ["branco sobre azul Dodger (botão primário)", BRANCO, valor(marca, "--rac-dodger"), 4.5], ["branco sobre Dodger forte", BRANCO, valor(marca, "--rac-dodger-forte"), 4.5],
    ["branco sobre sucesso", BRANCO, valor(marca, "--rac-ok-fill"), 4.5], ["branco sobre alerta", BRANCO, valor(marca, "--rac-aviso-fill"), 4.5], ["branco sobre erro", BRANCO, valor(marca, "--rac-erro-fill"), 4.5],
    ["texto no claro", valor(claro, "--ink"), valor(claro, "--bg"), 4.5], ["secundário no claro sobre branco", valor(claro, "--muted"), BRANCO, 4.5],
    ["info no claro sobre branco", valor(marca, "--rac-info"), BRANCO, 4.5], ["borda de campo no claro sobre branco", valor(marca, "--rac-linha-campo"), BRANCO, 3],
    ["texto no escuro", valor(escuro, "--ink"), valor(escuro, "--bg"), 4.5], ["secundário no escuro", valor(escuro, "--muted"), valor(escuro, "--bg"), 4.5],
    ["info no escuro", valor(esc, "--rac-info"), valor(escuro, "--bg"), 4.5], ["borda de campo no escuro", valor(esc, "--rac-linha-campo"), valor(escuro, "--bg"), 3],
    ["sucesso no escuro", valor(escuro, "--good"), valor(escuro, "--bg"), 4.5], ["alerta no escuro", valor(escuro, "--warn"), valor(escuro, "--bg"), 4.5], ["erro no escuro", valor(escuro, "--bad"), valor(escuro, "--bg"), 4.5],
    ["sucesso no claro", valor(claro, "--good"), BRANCO, 4.5], ["alerta no claro", valor(claro, "--warn"), BRANCO, 4.5], ["erro no claro", valor(claro, "--bad"), BRANCO, 4.5],
  ];
  for (const [nome, a, b, min] of pares) { const c = contraste(a, b); assert.ok(c >= min, `${nome}: ${c.toFixed(2)}:1 (mínimo ${min}:1)`); }
});

test("as classes rac- usam só variáveis: nenhuma cor escrita, só tokens que existem", () => {
  const regras = css.slice(css.indexOf("/* ===== Design System RAC · DS-1"));
  assert.ok(regras.includes(".rac-card{") && regras.includes(".rac-btn{") && regras.includes(".rac-estado{") && regras.includes(".rac-campo{"));
  assert.deepEqual(regras.match(HEX) || [], [], "classe rac- com cor escrita");
  assert.deepEqual(regras.match(/\b(rgb|hsl)a?\(/g) || [], [], "classe rac- com rgb()/hsl()");
  assert.match(regras, /prefers-reduced-motion/, "movimento desligado para quem pede");
  assert.match(regras, /\.rac-btn:focus-visible/, "foco visível");
  assert.match(regras, /min-height:var\(--rac-alvo\)/, "alvo de toque");
  for (const v of regras.match(/var\(--rac-[a-z0-9-]+\)/g) || []) assert.ok(TOKENS_RAC.includes(v.slice(4, -1)), "usa token que não existe: " + v);
});

test("a página #componentes é só do dono, não está no menu, a casa não a vê e o módulo está no cache offline", () => {
  const R = registro(), r = R.rotas.find((x) => x.id === "componentes");
  assert.ok(r && r.grupo === null && !r.casa && JSON.stringify(r.mods) === '["componentes"]');
  assert.ok(!R.html.includes('data-k="componentes"'), "sem item no menu");
  assert.match(html, /<section id="componentes" hidden><div id="componentes-view" class="stack"><\/div><\/section>/);
  assert.match(lerArq("sw.js"), /"\.\/js\/componentes\.js"/);
  const v = (a) => /VERSAO\s*=\s*"([^"]+)"/.exec(a)[1];
  assert.equal(v(lerArq("sw.js")), /MOD_VERSAO="([^"]+)"/.exec(lerArq("js/app.js"))[1], "VERSAO (sw.js) e MOD_VERSAO (js/app.js) trocadas juntas");
});

/* ---------- a página desenha sem erro, para o dono, e recusa a casa ---------- */
class No { constructor(t) { this.tag = t; this.filhos = []; this.attrs = {}; this.className = ""; this.textContent = ""; this.style = {}; }
  setAttribute(k, v) { this.attrs[k] = v; } appendChild(c) { this.filhos.push(c); return c; } insertBefore(c) { this.filhos.push(c); }
  set innerHTML(v) { this._h = v; if (v === "") this.filhos = []; } get innerHTML() { return this._h || ""; }
  get children() { return this.filhos; } }
function montar(dono) {
  const raiz = new No("div"), titulo = new No("h1"), el = { "#componentes-view": raiz, "#ptitle": titulo };
  const ctx = { console, Object, Array, JSON, String, Number, isOwner: () => dono, $: (s) => el[s], RAC_ROTAS: registro().rotas.map((r) => ({ ...r, ico: "<svg></svg>" })),
    document: { createElement: (t) => new No(t), createTextNode: (t) => { const n = new No("#texto"); n.textContent = t; return n; } } };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(`function h(tag,attrs){var e=document.createElement(tag);if(attrs)Object.keys(attrs).forEach(function(k){var v=attrs[k];if(v===undefined||v===null||v===false)return;if(k==="class")e.className=v;else if(k==="text")e.textContent=v;else e.setAttribute(k,v)});
    function add(c){if(c===null||c===undefined||c===false)return;if(Array.isArray(c)){c.forEach(add);return}e.appendChild((typeof c==="string"||typeof c==="number")?document.createTextNode(String(c)):c)}for(var i=2;i<arguments.length;i++)add(arguments[i]);return e}`, ctx);
  vm.runInContext(lerArq("js/componentes.js"), ctx, { filename: "js/componentes.js" });
  ctx.renderComponentes(); return { raiz, titulo, ctx };
}
const texto = (n) => (n.textContent || "") + n.filhos.map(texto).join(" ");

test("a página desenha todas as seções do Design System para o dono", () => {
  const { raiz, titulo } = montar(true), t = texto(raiz);
  assert.equal(titulo.textContent, "Componentes");
  for (const s of ["Design System RAC", "Cores", "Tipografia", "Botões", "Chips e selos", "Cartões", "Carregando, vazio e erro", "Campos", "Lista e tabela", "Ícones"]) assert.ok(t.includes(s), "falta a seção " + s);
  assert.equal(raiz.filhos.length, 10, "cabeçalho + 9 seções");
});
test("a casa (Fernanda) não vê nada: só a recusa", () => {
  const { raiz, titulo } = montar(false);
  assert.match(texto(raiz), /só da conta do dono/); assert.equal(raiz.filhos.length, 1); assert.equal(titulo.textContent, "");
});

test("JavaScript novo em ES5 puro e sem nome global repetido", () => {
  const js = lerArq("js/componentes.js");
  assert.ok(!/\b(let|const)\s|=>|`|\bclass\s+\w|\.\.\.|\basync\b|\bawait\b/.test(js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"(?:[^"\\\n]|\\.)*"/g, '""')), "sintaxe além do ES5");
  const nomes = [...js.matchAll(/^\s{2}(?:function|var)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  assert.ok(nomes.length >= 8); assert.equal(new Set(nomes).size, nomes.length, "nome repetido dentro do módulo");
  const outros = ["js/app.js", "js/rotas.js", "nucleo.js", "mercado.js", ...["hoje", "sistema", "familia", "mba", "saude", "painel", "resumo", "radar", "compras", "fiscal", "iacustos", "seguranca", "newsletter", "carreira", "lista", "alimentacao", "esportes", "graficos", "fontes", "dados", "bebe", "conexoes", "rede", "oms"].map((m) => "js/" + m + ".js")].map(lerArq).join("\n");
  for (const n of nomes) assert.ok(!new RegExp("(?:function|var)\\s+" + n.replace("$", "\\$") + "\\b").test(outros), "o nome " + n + " já existe em outro arquivo");
});
