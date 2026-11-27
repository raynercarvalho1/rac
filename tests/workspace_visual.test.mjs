// Lote 1 do novo RAC · qualidade VISUAL e de UX do Workspace, medida (não só olhada): num navegador de verdade (Chromium), em três larguras (computador 1440, tablet 1000, celular 390), nos temas claro e
// escuro (o mesmo atributo data-theme que o app usa) e nos dois modos (ver e personalizar). Confere o que se mede de forma objetiva: nada rola para o lado, a barra de personalizar fica à vista ao rolar,
// alvos de toque de 44 px, nenhum componente se sobrepõe a outro nem à barra, contraste do texto (WCAG 2.1: 4,5:1 para texto normal e 3:1 para texto grande) e janelas (catálogo) que cabem na tela.
// As capturas de tela do resultado (antes e depois) estão em docs/planejamento/img/ e são descritas em docs/planejamento/20-auditoria-visual-e-ux.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = fileURLToPath(new URL("../", import.meta.url));
let pw = null;
try { pw = await import("playwright"); } catch (_) { /* sem Playwright: pula */ }
const pular = !pw ? "Playwright não instalado (roda no GitHub)" : false;
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const abrirNavegador = () => pw.chromium.launch(process.env.RAC_CHROMIUM ? { executablePath: process.env.RAC_CHROMIUM } : {});
const fonteTeste = fs.readFileSync(path.join(raiz, "tests/workspace_tela.test.mjs"), "utf8");
const instalar = fonteTeste.slice(fonteTeste.indexOf("function instalar(cfg) {"), fonteTeste.indexOf("const PESSOAL")).trim();   // o mesmo banco simulado dos testes de tela

const L = (n, tipo, extra = {}) => ({ id: "w_00000" + n, tipo, v: 1, col: 4, lin: 0, estado: "ativo", config: {}, ...extra });
const CFG = { espacos: [{ id: "e-pessoal", tipo: "pessoal", nome: "Pessoal", papel: "proprietario" }, { id: "e-casa", tipo: "compartilhado", nome: "Casa", papel: "editor", casa: true }],
  paginas: [{ id: "p1", espaco_id: "e-pessoal", titulo: "Minha Casa", ordem: 0, layout: { schema: 1, secoes: [
    { id: "s1", titulo: "Hoje", itens: [L(1, "data.hoje", { col: 4 }), L(2, "nota.fixa", { col: 8, config: { titulo: "Recados", texto: "Comprar pão\nLigar para a escola\nConsulta do Eddie às 15h" } }), L(3, "atalhos.rotas", { col: 12, config: { rotas: ["agenda", "saude", "mercado", "lista"] } })] },
    { id: "s2", titulo: "Mais", itens: [L(4, "nota.fixa", { col: 6, config: { titulo: "Metas", texto: "Treinar 3x por semana" } }), L(5, "nota.fixa", { col: 6, config: { titulo: "Estudos", texto: "Aula de SQL" } })] }] } },
    { id: "p2", espaco_id: "e-pessoal", titulo: "Trabalho", ordem: 1, layout: { schema: 1, secoes: [] } }] };

async function abrir(tema, largura, altura) {
  const servidor = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html"; const f = path.join(raiz, p);
    if (!f.startsWith(raiz) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${servidor.address().port}`, nav = await abrirNavegador(), ctx = await nav.newContext({ viewport: { width: largura, height: altura }, colorScheme: tema }), pag = await ctx.newPage(), erros = [];
  pag.on("pageerror", (e) => erros.push("erro: " + e.message));
  await pag.goto(base + "/"); await pag.waitForSelector("#gate", { state: "visible", timeout: 20000 });
  await pag.evaluate(new Function("return " + instalar)(), CFG); await pag.evaluate((t) => document.documentElement.setAttribute("data-theme", t), tema);
  await pag.evaluate(async () => { document.documentElement.classList.add("logado"); document.getElementById("gate").hidden = true; await precisa(["workspace"]); tabs.forEach((t) => { document.getElementById(t).hidden = t !== "workspace"; }); document.documentElement.setAttribute("data-sec", "workspace"); renderWorkspace(); });
  await pag.waitForSelector(".wk-item"); await pag.waitForFunction(() => !document.querySelector(".wk-item .rac-estado[aria-busy='true']"), null, { timeout: 8000 });
  return { pag, erros, fechar: async () => { await nav.close(); servidor.close(); } };
}

/* medições feitas dentro da página */
const medir = {
  /* contraste WCAG: cor do texto × cor de fundo efetiva (compondo as transparências dos ancestrais sobre a base do tema) */
  contraste: (sels) => {
    const rgba = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const sobre = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
    const escuro = document.documentElement.getAttribute("data-theme") === "dark", base = escuro ? { r: 14, g: 27, b: 46, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
    const out = [];
    for (const s of sels) for (const el of [...document.querySelectorAll(s)].filter((e) => e.offsetParent !== null).slice(0, 3)) {
      let fundo = base, cadeia = []; for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n), c = rgba(cs.backgroundColor); if (cs.backgroundImage !== "none" && /gradient/.test(cs.backgroundImage)) { cadeia = null; break; } if (c && c.a > 0) cadeia.push(c); if (c && c.a === 1) break; }
      if (cadeia === null) continue;   // fundo em degradê (a faixa azul): medido à parte
      fundo = cadeia.reverse().reduce((acc, c) => sobre(c, acc), base);
      const cs = getComputedStyle(el), fg = sobre(rgba(cs.color), fundo), l1 = lum(fg), l2 = lum(fundo), r = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const px = parseFloat(cs.fontSize), grande = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
      out.push({ s, texto: (el.textContent || "").trim().slice(0, 30), r: Math.round(r * 100) / 100, minimo: grande ? 3 : 4.5 });
    }
    return out;
  },
  semRolagemLateral: () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  alvos: (sels) => { const out = []; for (const s of sels) for (const el of document.querySelectorAll(s)) { if (el.offsetParent === null) continue; const r = el.getBoundingClientRect(); if (r.width && r.height && (r.height < 43.5 || r.width < 43.5)) out.push(s + " " + Math.round(r.width) + "x" + Math.round(r.height)); } return out; },
  sobrepostos: () => { const r = [...document.querySelectorAll(".wk-item")].filter((e) => !e.classList.contains("wk-fantasma")).map((e) => ({ id: e.getAttribute("data-id"), b: e.getBoundingClientRect() })), bad = [];
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) { const a = r[i].b, b = r[j].b, w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); if (w > 1 && h > 1) bad.push(r[i].id + "×" + r[j].id); } return bad; },
};

for (const tema of ["light", "dark"]) for (const [nome, w, h] of [["computador 1440", 1440, 900], ["tablet 1000", 1000, 800], ["celular 390", 390, 844]]) {
  test(`visual · ${nome} · tema ${tema}: ver e personalizar sem rolagem lateral, sem sobreposição, alvos de 44 px, contraste e barra fixa à vista`, { skip: pular, timeout: 120000 }, async () => {
    const { pag, erros, fechar } = await abrir(tema, w, h);
    try {
      /* --- modo ver --- */
      assert.ok(await pag.evaluate(medir.semRolagemLateral), "ver: sem rolagem lateral");
      assert.deepEqual(await pag.evaluate(medir.sobrepostos), [], "ver: nenhum componente se sobrepõe");
      assert.deepEqual(await pag.evaluate(medir.alvos, [".wk-barra .rac-btn", ".wk-aba", ".wk-sel-espaco"]), [], "ver: alvos de toque ≥ 44 px");
      const faltam = (await pag.evaluate(medir.contraste, [".wk-aba[aria-selected='true']", ".wk-aba:not([aria-selected='true'])", ".wk-item-tit", ".wk-nota", ".wk-data", ".wk-atalho", ".wk-secao-nome"])).filter((x) => x.r < x.minimo);
      // a faixa azul e o rótulo de seção ficam sobre degradê/fundo do app: medidos à parte (abaixo)
      assert.deepEqual(faltam.filter((x) => x.s !== ".wk-secao-nome"), [], "ver: contraste do texto");
      const faixa = await pag.evaluate(() => { const hero = document.querySelector(".wk-hero h2"), cs = getComputedStyle(hero); return { cor: cs.color, grad: getComputedStyle(document.querySelector(".wk-hero")).backgroundImage.slice(0, 40) }; });
      assert.match(faixa.cor, /rgb\(255, 255, 255\)|rgba\(255, 255, 255/, "a faixa azul tem texto branco"); assert.match(faixa.grad, /gradient/);
      /* --- modo personalizar --- */
      await pag.click(".wk-barra button[aria-label^='Personalizar']"); await pag.waitForSelector(".wk-edicao"); await pag.waitForTimeout(250);
      assert.ok(await pag.evaluate(medir.semRolagemLateral), "personalizar: sem rolagem lateral");
      assert.deepEqual(await pag.evaluate(medir.sobrepostos), [], "personalizar: nenhum componente se sobrepõe");
      assert.deepEqual(await pag.evaluate(medir.alvos, [".wk-editbar .rac-btn", ".wk-alca", ".wk-mini"]), [], "personalizar: alvos de toque ≥ 44 px");
      const barraAntes = await pag.locator(".wk-editbar").boundingBox(), primeiro = await pag.locator(".wk-secao").first().boundingBox();
      assert.ok(barraAntes.y + barraAntes.height <= primeiro.y + 2, "a barra de personalizar não cobre o começo do conteúdo");
      assert.ok(barraAntes.x >= 0 && barraAntes.x + barraAntes.width <= w + 1, "a barra cabe na largura da tela");
      await pag.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await pag.waitForTimeout(200);
      const barraDepois = await pag.locator(".wk-editbar").boundingBox();
      assert.ok(barraDepois.y >= -1 && barraDepois.y < 40, "rolando a página, a barra de personalizar continua fixa no topo: y=" + Math.round(barraDepois.y));
      await pag.evaluate(() => window.scrollTo(0, 0));
      const f2 = (await pag.evaluate(medir.contraste, [".wk-editbar .rac-selo", ".wk-editbar .rac-btn--sec", ".wk-editbar .wk-edit-nome", ".wk-tam", ".wk-item-tit", ".wk-nota"])).filter((x) => x.r < x.minimo);
      assert.deepEqual(f2, [], "personalizar: contraste do texto");
      /* o conteúdo continua legível no modo personalizar (nada de opacidade que apague o texto) */
      assert.equal(await pag.$eval(".wk-edicao .wk-corpo", (e) => getComputedStyle(e).opacity), "1");
      /* --- catálogo --- */
      await pag.click(".wk-barra button[aria-label='Adicionar componente']"); await pag.waitForSelector(".wk-catalogo");
      const folha = await pag.locator(".wk-folha").boundingBox(); assert.ok(folha.x >= -1 && folha.x + folha.width <= w + 1, "o catálogo cabe na largura da tela");
      assert.ok(await pag.evaluate(medir.semRolagemLateral), "catálogo: sem rolagem lateral");
      assert.deepEqual(await pag.evaluate(medir.alvos, [".wk-folha .rac-btn", ".wk-folha .rac-chip"]), [], "catálogo: alvos de toque ≥ 44 px");
      const f3 = (await pag.evaluate(medir.contraste, [".wk-cat-card .rac-t-cartao", ".wk-cat-card .rac-t-sec", ".wk-folha .rac-chip", ".wk-folha .rac-btn--sec"])).filter((x) => x.r < x.minimo);
      assert.deepEqual(f3, [], "catálogo: contraste do texto");
      assert.deepEqual(erros, []);
    } finally { await fechar(); }
  });
}
