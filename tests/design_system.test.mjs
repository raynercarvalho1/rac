// Design System RAC · "RAC Modern Workspace" (Fase 3; docs/design-system.md). Trava o que não pode estragar:
// (1) catraca de cores soltas, (2) tokens --rac-* nos três temas, (3) contraste WCAG, (4) componentes só com variáveis,
// (5) o shell novo só vale para o dono (a Fernanda, papel "casa", não muda), (6) kit e página #componentes, (7) RAC Hoje (piloto),
// (8) ES5 e nomes globais, (9) versões e cache offline.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { lerArq, registro } from "./_rotas.mjs";

const html = lerArq("index.html"), antigo = html.slice(html.indexOf("<style>"), html.indexOf("</style>")), css = lerArq("css/rac.css");
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const ehToken = (l) => /^\s*(--|:root|@media \(prefers-color-scheme: dark\)\{:root)/.test(l);
const SEC = (ini, fim) => { const a = css.indexOf(ini); assert.ok(a >= 0, ini); const b = fim ? css.indexOf(fim, a) : css.length; return css.slice(a, b); };
const tokens = SEC("/* ---------- 1. TOKENS", "/* ---------- 2. COMPONENTES"), comps = SEC("/* ---------- 2. COMPONENTES", "/* ---------- 3. SHELL"), shell = SEC("/* ---------- 3. SHELL", "/* ---------- 4. PILOTO"), piloto = SEC("/* ---------- 4. PILOTO");

/** Linha de base de 13/11/2026 (início da Fase 3): 115 cores escritas fora de variáveis no CSS antigo (index.html). A catraca só deixa DESCER. */
const LINHA_DE_BASE_CORES = 115;

test("catraca: cores escritas fora de variáveis não aumentam no CSS antigo e não existem no CSS novo fora dos tokens", () => {
  const n = (antigo.split("\n").filter((l) => !ehToken(l)).join("\n").match(HEX) || []).length;
  assert.ok(n <= LINHA_DE_BASE_CORES, `há ${n} cores escritas fora de variáveis em index.html; o limite é ${LINHA_DE_BASE_CORES}. Use var(--rac-*). Se migrou telas e o número baixou, baixe também LINHA_DE_BASE_CORES.`);
  for (const [nome, t] of [["componentes", comps], ["shell", shell], ["piloto", piloto]]) {
    assert.deepEqual(t.match(HEX) || [], [], `css/rac.css (${nome}) com cor escrita`); assert.deepEqual(t.match(/\b(?:hsl)a?\(/g) || [], [], nome + " com hsl()");
  }
  /* rgba só em sombras, véus e transparências (nunca como cor de texto ou de marca) */
  for (const m of (comps + shell + piloto).matchAll(/([a-z-]+):[^;{}]*rgba\(/g)) assert.ok(/^(box-shadow|background|border-color|border|--rac-sombra|backdrop-filter)$/.test(m[1]), "rgba em " + m[1]);
});

const nomes = (t) => [...new Set([...t.matchAll(/--rac-[a-z0-9-]+(?=:)/g)].map((m) => m[0]))];
const TOKENS = nomes(tokens);
const bloco = (ini, fim) => { const a = tokens.indexOf(ini); assert.ok(a >= 0, ini); return tokens.slice(a, tokens.indexOf(fim, a)); };
const claro = bloco(":root{\n  --rac-dodger:", "\n}"), escAuto = bloco("@media (prefers-color-scheme: dark){:root:not([data-theme=\"light\"]){", "}}"), escManual = bloco(":root[data-theme=\"dark\"]{", "}\n");

test("tokens --rac-*: marca, superfícies, estados, escalas e tipografia existem; o que muda por tema vale nos dois escuros igual", () => {
  for (const t of ["--rac-dodger", "--rac-dodger-forte", "--rac-dodger-claro", "--rac-vermelho", "--rac-prata", "--rac-azul-grad", "--rac-papel", "--rac-papel-2", "--rac-papel-3", "--rac-azul-suave", "--rac-borda", "--rac-ok", "--rac-aviso", "--rac-erro", "--rac-info", "--rac-neutro",
    "--rac-tinta-ok", "--rac-tinta-aviso", "--rac-tinta-erro", "--rac-tinta-info", "--rac-linha-campo", "--rac-foco", "--rac-texto", "--rac-texto-2", "--rac-esp-1", "--rac-esp-12", "--rac-raio-1", "--rac-raio-3", "--rac-raio-pilula", "--rac-sombra-1", "--rac-sombra-3",
    "--rac-mov-rapido", "--rac-z-barra", "--rac-z-dica", "--rac-alvo", "--rac-barra-h", "--rac-fs-num", "--rac-fs-num-g", "--rac-fs-mono"]) assert.ok(TOKENS.includes(t), "falta o token " + t);
  assert.match(tokens, /--rac-alvo:44px/);
  const porTema = ["--rac-papel", "--rac-papel-2", "--rac-papel-3", "--rac-azul-suave", "--rac-borda", "--rac-info", "--rac-linha-campo", "--rac-neutro", "--rac-ok", "--rac-aviso", "--rac-erro", "--rac-tinta-ok", "--rac-tinta-aviso", "--rac-tinta-erro", "--rac-tinta-info", "--rac-azul-grad", "--rac-sombra-1"];
  const v = (b, t) => new RegExp(t.replace(/-/g, "\\-") + ":([^;]+);?").exec(b);
  for (const t of porTema) { assert.ok(v(claro, t), t + " no claro"); assert.ok(v(escAuto, t), t + " no escuro automático"); assert.ok(v(escManual, t), t + " no escuro manual"); assert.equal(v(escAuto, t)[1].trim(), v(escManual, t)[1].trim(), t + ": os dois escuros são iguais"); }
});

/* contraste pela fórmula da WCAG 2.x */
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const hexDe = (b, t) => new RegExp(t.replace(/-/g, "\\-") + ":(#[0-9A-Fa-f]{6})").exec(b)[1];
const grad = (b) => [...new RegExp("--rac-azul-grad:linear-gradient\\([^)]*\\)").exec(b)[0].matchAll(/#[0-9A-Fa-f]{6}/g)].map((m) => m[0]);

test("contraste (WCAG): texto ≥ 4,5:1 sobre cada fundo do sistema, nos dois temas; borda de campo ≥ 3:1", () => {
  const BR = "#FFFFFF", escuroPapel = "#0E1B2E", cl = (t) => hexDe(claro, t), es = (t) => hexDe(escManual, t);
  const pares = [
    ["branco sobre Dodger", BR, cl("--rac-dodger"), 4.5], ["branco sobre Dodger forte", BR, cl("--rac-dodger-forte"), 4.5], ["branco sobre sucesso", BR, cl("--rac-ok-fill"), 4.5], ["branco sobre atenção", BR, cl("--rac-aviso-fill"), 4.5], ["branco sobre erro", BR, cl("--rac-erro-fill"), 4.5],
    ...grad(claro).map((g, i) => ["branco sobre o degradê claro #" + (i + 1), BR, g, 4.5]), ...grad(escManual).map((g, i) => ["branco sobre o degradê escuro #" + (i + 1), BR, g, 4.5]),
    ["texto do tema claro sobre papel", "#0E1B2C", BR, 4.5], ["secundário claro sobre papel", "#53627A", BR, 4.5], ["secundário claro sobre papel-2", "#53627A", cl("--rac-papel-2"), 4.5],
    ["info sobre papel (claro)", cl("--rac-info"), BR, 4.5], ["info sobre tinta azul (claro)", cl("--rac-info"), cl("--rac-azul-suave"), 4.5], ["borda de campo (claro)", cl("--rac-linha-campo"), BR, 3],
    ["sucesso sobre papel (claro)", cl("--rac-ok"), BR, 4.5], ["atenção sobre papel (claro)", cl("--rac-aviso"), BR, 4.5], ["erro sobre papel (claro)", cl("--rac-erro"), BR, 4.5],
    ["sucesso sobre tinta (claro)", cl("--rac-ok"), cl("--rac-tinta-ok"), 4.5], ["atenção sobre tinta (claro)", cl("--rac-aviso"), cl("--rac-tinta-aviso"), 4.5], ["erro sobre tinta (claro)", cl("--rac-erro"), cl("--rac-tinta-erro"), 4.5], ["neutro sobre papel-2 (claro)", cl("--rac-neutro"), cl("--rac-papel-2"), 4.5],
    ["texto do escuro sobre papel", "#E7EEF7", escuroPapel, 4.5], ["secundário escuro sobre papel", "#9AAAC0", escuroPapel, 4.5], ["secundário escuro sobre papel-2", "#9AAAC0", es("--rac-papel-2"), 4.5],
    ["info sobre papel (escuro)", es("--rac-info"), escuroPapel, 4.5], ["info sobre tinta azul (escuro)", es("--rac-info"), es("--rac-azul-suave"), 4.5], ["borda de campo (escuro)", es("--rac-linha-campo"), escuroPapel, 3],
    ["sucesso sobre papel (escuro)", es("--rac-ok"), escuroPapel, 4.5], ["atenção sobre papel (escuro)", es("--rac-aviso"), escuroPapel, 4.5], ["erro sobre papel (escuro)", es("--rac-erro"), escuroPapel, 4.5],
    ["sucesso sobre tinta (escuro)", es("--rac-ok"), es("--rac-tinta-ok"), 4.5], ["atenção sobre tinta (escuro)", es("--rac-aviso"), es("--rac-tinta-aviso"), 4.5], ["erro sobre tinta (escuro)", es("--rac-erro"), es("--rac-tinta-erro"), 4.5], ["neutro sobre papel-2 (escuro)", es("--rac-neutro"), es("--rac-papel-2"), 4.5],
  ];
  for (const [nome, a, b, min] of pares) { const c = contraste(a, b); assert.ok(c >= min, `${nome}: ${c.toFixed(2)}:1 (mínimo ${min}:1)`); }
  assert.ok(pares.length >= 35);
});

test("componentes: um por função, só tokens que existem, foco visível, alvo de 44 px, movimento desligável", () => {
  for (const c of [".rac-card{", ".rac-kpi{", ".rac-kpi--destaque", ".rac-kpi--sec", ".rac-delta{", ".rac-alerta{", ".rac-atalho{", ".rac-info{", ".rac-btn{", ".rac-btn--pri", ".rac-btn--sec", ".rac-btn--ter", ".rac-btn--perigo", ".rac-btn--icone", ".rac-chip{", ".rac-selo{",
    ".rac-lista{", ".rac-linha-item{", ".rac-tabela{", ".rac-recolher", ".rac-medidor", ".rac-comp{", ".rac-grafico .hbf", ".rac-grafico .vbf", ".rac-estado{", ".rac-esqueleto", ".rac-campo{", ".rac-campo--erro", ".rac-t-num{", ".rac-t-rotulo{"]) assert.ok(comps.includes(c), "falta " + c);
  for (const u of new Set(comps.match(/var\(--rac-[a-z0-9-]+\)/g) || [])) assert.ok(TOKENS.includes(u.slice(4, -1)), "usa token que não existe: " + u);
  assert.match(comps, /\.rac-btn:focus-visible/); assert.match(comps, /min-height:var\(--rac-alvo\)/); assert.match(comps, /prefers-reduced-motion/); assert.match(comps, /\.rac-btn:disabled/); assert.match(comps, /aria-busy="true"/);
  assert.match(comps, /\.rac-medidor-trilho\{[^}]*min-height:var\(--rac-alvo\)/, "o medidor clicável também tem alvo de 44 px");
});

test("shell do dono: toda regra nova vale só para html.logado:not(.casa) (ou esconde o que é do dono para a casa); Central de Compras fica de fora", () => {
  const regras = shell.replace(/\/\*[\s\S]*?\*\//g, "").split(/\}\s*(?=[^}]*\{)/).map((r) => r.trim().replace(/^@media[^{]*\{\s*/, "")).filter((r) => r && !/^\}/.test(r));
  assert.ok(regras.length > 20);
  for (const r of regras) { const sel = r.split("{")[0].trim(); if (!sel) continue; for (const s of sel.split(",")) assert.match(s.trim(), /^(html\.logado:not\(\.casa\)|html\.casa|#barra\{?$|#barra)/, "seletor fora do escopo do dono: " + s.trim()); }
  assert.match(shell, /section:not\(#mercado\) \.panel/, "a Central de Compras não é tocada"); assert.ok(!/#mercado/.test(shell.replace(/\/\*[\s\S]*?\*\//g, "").replace(/section:not\(#mercado\)/g, "")), "nenhuma regra mira o #mercado");
  assert.match(shell, /html\.casa #navgrp h4\.areat,html\.casa #barra\{display:none\}/, "a casa não vê grupos nem a barra");
  assert.match(shell, /\n#barra\{display:none\}/, "a barra inferior é escondida por padrão");
  assert.match(shell, /@media\(min-width:861px\)\{html\.logado:not\(\.casa\) \.app\{/, "a grade de duas colunas é só do computador (no celular vale a de uma coluna)");
  /* a classe "casa" é posta no <html> pelo login; a regra de sempre para a casa continua no index.html */
  assert.match(lerArq("js/app.js"), /html\.classList\.toggle\("casa",PAPEL==="casa"\)/); assert.match(html, /html\.casa \.side \.search/);
});

test("menu por área: o registro de rotas tem a área de cada item, a ordem do registro NÃO mudou e a barra inferior sai do mesmo registro", () => {
  const R = registro(), com = R.rotas.filter((r) => r.grupo);
  assert.equal(com.length, 29); assert.ok(com.every((r) => r.area), "todo item do menu tem área");
  const areas = [...R.menu.matchAll(/<h4 class="areat" data-area="([a-z]+)"[^>]*>([^<]+)<\/h4>/g)].map((m) => m[1]);
  assert.deepEqual(areas, ["hoje", "vida", "fin", "carreira", "info", "sis"]);
  for (const r of com) assert.ok(areas.includes(r.area), r.id);
  const ordem = [...R.menu.matchAll(/<a class="it" href="#([a-z-]+)"/g)].map((m) => m[1]); assert.deepEqual(ordem, com.map((r) => r.id), "o menu da casa (sem grupos) segue a ordem de sempre");
  const barra = [...registroBarra().matchAll(/<a href="#([a-z]+)"/g)].map((m) => m[1]); assert.deepEqual(barra, ["rachoje", "agenda", "saude", "mercado"], "na ordem do registro");
  assert.match(registroBarra(), /id="barramenu"/); assert.ok(barra.every((id) => com.some((r) => r.id === id)), "a barra só aponta para rotas do registro");
});
function registroBarra() { const ctx = { console, Object, Array, JSON, String, document: { getElementById: () => null } }; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(lerArq("js/rotas.js"), ctx); return ctx.rotasBarraHtml(); }

/* ---------- kit e página #componentes, num ambiente falso ---------- */
class No { constructor(t) { this.tag = t; this.filhos = []; this.attrs = {}; this.className = ""; this.textContent = ""; this.style = {}; this.dataset = {}; this.listeners = {};
  this.classList = { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false }; }
  setAttribute(k, v) { this.attrs[k] = v; } getAttribute(k) { return this.attrs[k]; } removeAttribute(k) { delete this.attrs[k]; } appendChild(c) { this.filhos.push(c); return c; } insertBefore(c) { this.filhos.push(c); }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  set innerHTML(v) { this._h = v; if (v === "") this.filhos = []; } get innerHTML() { return this._h || ""; } get children() { return this.filhos; } querySelector() { return null; } }
function montar(dono) {
  const raiz = new No("div"), titulo = new No("h1"), el = { "#componentes-view": raiz, "#ptitle": titulo }, ligados = [];
  const R = registro();
  const ctx = { console, Object, Array, JSON, String, Number, Math, isFinite, isOwner: () => dono, $: (s) => el[s], NUCLEO: globalThis.RACnucleo, racDica: { ligar: (a, f) => { ligados.push(f); return a; } },
    vbFim: () => {}, vbRotulo: (c, b) => { const s = new No("span"); s.textContent = (c || "") + (b || ""); return s; },
    RAC_ROTAS: R.rotas.map((r) => ({ ...r, ico: "<svg></svg>" })), RAC_AREAS: [["hoje", "Hoje"], ["vida", "Vida e família"], ["fin", "Finanças e compras"], ["carreira", "Carreira e estudos"], ["info", "Informação"], ["sis", "Sistema"]],
    document: { createElement: (t) => new No(t), createTextNode: (t) => { const n = new No("#texto"); n.textContent = t; return n; } } };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(`function h(tag,attrs){var e=document.createElement(tag);if(attrs)Object.keys(attrs).forEach(function(k){var v=attrs[k];if(v===undefined||v===null||v===false)return;if(k==="class")e.className=v;else if(k==="text")e.textContent=v;else e.setAttribute(k,v)});
    function add(c){if(c===null||c===undefined||c===false)return;if(Array.isArray(c)){c.forEach(add);return}e.appendChild((typeof c==="string"||typeof c==="number")?document.createTextNode(String(c)):c)}for(var i=2;i<arguments.length;i++)add(arguments[i]);return e}`, ctx);
  for (const f of ["js/graficos.js", "js/kit.js", "js/componentes.js"]) vm.runInContext(lerArq(f), ctx, { filename: f });
  ctx.renderComponentes(); return { raiz, titulo, ctx, ligados };
}
const texto = (n) => (n.textContent || "") + n.filhos.map(texto).join(" ");
const todos = (n, f, o = []) => { if (f(n)) o.push(n); n.filhos.forEach((c) => todos(c, f, o)); return o; };
import "node:module";
import { createRequire } from "node:module"; createRequire(import.meta.url)("../nucleo.js");

test("a página #componentes mostra o Design System definitivo para o dono (cartões por função, gráficos, navegação, estados) e recusa a casa", () => {
  const { raiz, titulo, ligados } = montar(true), t = texto(raiz);
  assert.equal(titulo.textContent, "Componentes");
  for (const s of ["RAC Modern Workspace", "Cores", "Tipografia", "Indicadores", "Alerta, atalho, informação e resumo", "Lista", "Comparação", "Colunas (evolução)", "Barras (distribuição)", "Áreas do menu", "Botões", "Chips (selecionado) e selos (estado)", "Carregando, vazio, erro, sucesso e atenção", "Campos", "Tabela e detalhe recolhido", "Ícones"]) assert.ok(t.includes(s), "falta " + s);
  assert.ok(todos(raiz, (n) => /rac-kpi/.test(n.className)).length >= 4 && todos(raiz, (n) => /rac-alerta/.test(n.className)).length >= 4);
  assert.ok(ligados.length >= 8, "os gráficos da página usam racDica (medidor, comparação, colunas, barras)");
  assert.ok(/Hoje/.test(t) && /Sistema/.test(t), "as áreas do menu aparecem");
  const casa = montar(false); assert.match(texto(casa.raiz), /só da conta do dono/); assert.equal(casa.raiz.filhos.length, 1); assert.equal(casa.titulo.textContent, "");
});

test("kit: componentes de interface sem banco, sem regra de negócio e sem cor escrita; variação com seta + número; estado nunca só pela cor", () => {
  const kit = lerArq("js/kit.js");
  assert.ok(!/\bSB\b|\.from\(|supabase|fetch\(|localStorage|racIA|XMLHttp/.test(kit.replace(/\/\*[\s\S]*?\*\//g, "")), "o kit só monta elementos");
  assert.deepEqual(kit.match(HEX) || [], []);
  const { ctx } = montar(true);
  const d = ctx.rkDelta(12, "alta"), z = ctx.rkDelta(0, "alta"), n = ctx.rkDelta(-5, "queda");
  assert.match(texto(d), /▲.*\+12%/); assert.match(d.className, /aviso/); assert.match(texto(z), /igual/); assert.match(z.className, /neutro/); assert.match(texto(n), /▼.*−5%/); assert.match(n.className, /aviso/);
  assert.equal(ctx.rkDelta(null, "alta"), null);
  for (const tipo of ["ok", "aviso", "erro", "info", "neutro"]) assert.match(texto(ctx.rkSelo(tipo, "Palavra")), /Palavra/), assert.ok(/[✓⚠✗i•]/.test(texto(ctx.rkSelo(tipo, "x"))), "ícone no selo " + tipo);
  const aviso = ctx.rkEstado("aviso", "x"), erro = ctx.rkEstado("erro", "x"), vazio = ctx.rkEstado("vazio", "x"), carrega = ctx.rkEstado("carregando");
  assert.match(texto(aviso), /⚠/); assert.match(texto(erro), /✗/); assert.equal(erro.attrs.role, "alert"); assert.equal(carrega.attrs["aria-busy"], "true"); assert.ok(!/[⚠✗]/.test(texto(vazio)));
  const med = ctx.rkMedidor(130, 140, "Orçamento"); assert.match(med.className, /erro/); assert.match(ctx.rkMedidor(105, null, "x").className, /aviso/); assert.doesNotMatch(ctx.rkMedidor(50, null, "x").className, /erro|aviso/);
});

test("RAC Hoje (piloto): usa o kit e o kit de gráficos declarados no MOD_DEPS, mantém a IA e a cobrança onde estavam e aponta cada área para uma rota que existe", () => {
  const app = lerArq("js/app.js"), hoje = lerArq("js/hoje.js"), R = registro();
  assert.match(app, /hoje:\["fonte-agenda","fonte-newsletter","fonte-mba","fonte-familia","kit","graficos"\]/); assert.match(app, /componentes:\["kit","graficos"\]/);
  const dest = JSON.parse(/var HJ_DESTINO=(\{[^;]*\});/.exec(hoje)[1].replace(/([{,])([a-z]+):/g, '$1"$2":'));
  for (const [area, href] of Object.entries(dest)) assert.ok(R.tabs.includes(href.slice(1)), `${area} aponta para ${href}, que não é rota`);
  for (const f of ["hjAnalisar", "hjBotaoPago", "hjAnalise", "hjErro", "hojeAnalisar", "hojeCoordenar", "hojeReenviar", "hojePendMarcar"]) assert.match(hoje, new RegExp("function " + f + "\\("), f + " continua no módulo");
  assert.ok(!/racIA\(/.test(hoje.slice(hoje.indexOf("function hjDesenhar"), hoje.indexOf("function hjPintarHist"))), "desenhar o painel não chama a IA");
  for (const f of ["rkKpi", "rkLista", "rkComparar", "rkMedidor", "rsColunas", "rsBarras", "rkRecolher", "rkEstado", "rkAlerta"]) assert.match(hoje, new RegExp("\\b" + f + "\\("), "o painel usa " + f);
  assert.ok(!/\.from\("/.test(hoje.slice(hoje.indexOf("function hjDesenhar"), hoje.indexOf("function hjPintarHist"))), "o desenho do painel não abre outra leitura de banco");
});

test("JavaScript novo em ES5 puro e sem nome global repetido (kit e componentes)", () => {
  for (const a of ["js/kit.js", "js/componentes.js"]) {
    const js = lerArq(a), limpo = js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
    assert.ok(!/\b(let|const)\s|=>|`|\bclass\s+\w|\.\.\.|\basync\b|\bawait\b/.test(limpo), a + ": sintaxe além do ES5");
    const nomesTopo = [...js.matchAll(/^\s{2}(?:function|var)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
    assert.ok(nomesTopo.length >= 3 && new Set(nomesTopo).size === nomesTopo.length, a + ": nome repetido");
    const outros = ["js/app.js", "js/rotas.js", "nucleo.js", "mercado.js", ...["hoje", "sistema", "familia", "mba", "saude", "painel", "resumo", "radar", "compras", "fiscal", "iacustos", "seguranca", "newsletter", "carreira", "lista", "alimentacao", "esportes", "graficos", "fontes", "dados", "bebe", "conexoes", "rede", "oms", "kit", "componentes"].map((m) => "js/" + m + ".js").filter((x) => x !== a)].map(lerArq).join("\n");
    for (const n of nomesTopo) assert.ok(!new RegExp("(?:function|var)\\s+" + n.replace("$", "\\$") + "\\b").test(outros), `${a}: o nome ${n} já existe em outro arquivo`);
  }
});

test("versões e cache offline: VERSAO = MOD_VERSAO = ?v= do CSS; css, kit e componentes no cache; nenhuma biblioteca nova", () => {
  const sw = lerArq("sw.js"), app = lerArq("js/app.js"), v = /VERSAO\s*=\s*"([^"]+)"/.exec(sw)[1];
  assert.equal(v, /MOD_VERSAO="([^"]+)"/.exec(app)[1]); assert.match(html, new RegExp(`<link rel="stylesheet" href="css/rac\\.css\\?v=${v.replace(/\./g, "\\.")}">`));
  for (const a of ["./css/rac.css", "./js/kit.js", "./js/componentes.js"]) assert.ok(sw.includes(`"${a}"`), a);
  assert.ok(html.indexOf('href="css/rac.css') > html.indexOf("</style>"), "o CSS novo vem depois do antigo (é ele quem refina)");
  assert.deepEqual([...html.matchAll(/<script[^>]+src="https?:\/\/[^"]+"/g)].length, [...lerArq("index.html").matchAll(/<script[^>]+src="https?:\/\/[^"]+"/g)].length);
  assert.match(html, /<section id="componentes" hidden><div id="componentes-view" class="stack"><\/div><\/section>/);
  const r = registro().rotas.find((x) => x.id === "componentes"); assert.ok(r && r.grupo === null && !r.casa && JSON.stringify(r.mods) === '["componentes"]');
});
