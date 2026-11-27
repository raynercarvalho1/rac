// Lote 2 do novo RAC · qualidade VISUAL e de UX da MINHA CASA, medida num navegador de verdade (Chromium): a página "Casa completa" (Hoje, Saúde e Compras com dados simulados) em três larguras (computador 1440,
// tablet 1000, celular 390), nos temas claro e escuro, nos modos ver e personalizar, e a tela de primeira utilização. Mesmas medições do Lote 1 (tests/workspace_visual.test.mjs): sem rolagem lateral, sem
// sobreposição entre componentes, alvos de toque de 44 px, contraste WCAG do texto, barra de personalizar fixa e janelas que cabem na tela; mais: nenhum texto cortado nos cartões e a barra do celular com 7 itens.
// RAC_CAPTURAS=1 grava as capturas em docs/planejamento/img/ (sem a variável o teste só mede). Validação em navegador automatizado: NÃO substitui o teste no iPhone real (docs/planejamento/20).
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
const lerFonte = (a) => fs.readFileSync(path.join(raiz, a), "utf8");
const fonteTela = lerFonte("tests/workspace_tela.test.mjs"), instalar = fonteTela.slice(fonteTela.indexOf("function instalar(cfg) {"), fonteTela.indexOf("const PESSOAL")).trim();
const fonteVis = lerFonte("tests/workspace_visual.test.mjs"), medir = new Function(fonteVis.slice(fonteVis.indexOf("const medir = {"), fonteVis.indexOf("for (const tema of")).replace(/^const medir = /, "return ").replace(/;\s*$/, ""))();   // as mesmas medições do Lote 1
const fonteCasa = lerFonte("tests/workspace_casa_tela.test.mjs"), dados = new Function(fonteCasa.slice(fonteCasa.indexOf("const pad ="), fonteCasa.indexOf("async function abrir(")) + "; return { TABELAS, LEMBRETES, PESSOAL, CASA };")();

async function abrir(tema, largura, altura) {
  const servidor = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html"; const f = path.join(raiz, p);
    if (!f.startsWith(raiz) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${servidor.address().port}`, nav = await abrirNavegador(), ctx = await nav.newContext({ viewport: { width: largura, height: altura }, colorScheme: tema }), pag = await ctx.newPage(), erros = [];
  { const esperar = pag.waitForFunction.bind(pag); pag.waitForFunction = (fn, arg, opt) => esperar(fn, arg, { polling: 100, ...opt }); }   // sondagem por intervalo, não por requestAnimationFrame: sob carga (vários navegadores em paralelo) o rAF de uma página pode não disparar e a espera ficava pendurada até o limite (instabilidade do waitForFunction no CI do Lote 1)
  pag.on("pageerror", (e) => erros.push("erro: " + e.message));
  await pag.goto(base + "/"); await pag.waitForSelector("#gate", { state: "visible", timeout: 20000 });
  await pag.evaluate(new Function("return " + instalar)(), { espacos: [dados.PESSOAL, dados.CASA], tabelas: dados.TABELAS() });
  await pag.evaluate((a) => { document.documentElement.setAttribute("data-theme", a.tema); window.PESSOAL.lembretes = a.lembretes; }, { tema, lembretes: dados.LEMBRETES });
  await pag.evaluate(async () => { document.documentElement.classList.add("logado"); document.getElementById("gate").hidden = true; await precisa(["workspace"]); history.replaceState(null, "", "#workspace"); route(); });   // a rota de verdade (título, menu marcado, barra), como o dono abre o app
  await pag.waitForSelector(".wk-bemvindo", { timeout: 10000 });
  return { pag, erros, fechar: async () => { await nav.close(); servidor.close(); } };
}
const assentou = (pag) => pag.waitForFunction(() => !document.querySelector(".wk-item .rac-estado[aria-busy='true']"), null, { timeout: 12000 });
const captura = async (pag, nome) => { if (process.env.RAC_CAPTURAS) { await pag.waitForTimeout(350); await pag.screenshot({ path: path.join(raiz, "docs/planejamento/img", nome + ".png"), fullPage: true }); } };
const CONTRASTE_VER = [".wk-item-tit", ".rac-kpi:not(.rac-kpi--destaque) .rac-t-rotulo", ".rac-kpi:not(.rac-kpi--destaque) .rac-t-num", ".rac-kpi:not(.rac-kpi--destaque) .rac-kpi-apoio", ".rac-linha-corpo .rac-t-cartao", ".rac-linha-corpo .rac-t-sec", ".rac-linha-meta", ".rac-estado .rac-t-sec", ".rac-card-rod", ".wm-mais .rac-btn"];
/* nenhum texto cortado: o conteúdo de cada cartão cabe na largura dele (scrollWidth ≤ clientWidth), exceto áreas de rolagem de propósito (gráficos) */
const cortados = () => [...document.querySelectorAll(".wk-item .rac-t-cartao, .wk-item .rac-t-sec, .wk-item .rac-kpi, .wk-item .rac-linha-item")].filter((e) => e.offsetParent && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === "visible").map((e) => (e.textContent || "").trim().slice(0, 40));

for (const tema of ["light", "dark"]) for (const [nome, w, h] of [["computador 1440", 1440, 900], ["tablet 1000", 1000, 800], ["celular 390", 390, 844]]) {
  test(`visual Minha Casa · ${nome} · tema ${tema}: primeira vez, página completa e personalizar sem rolagem lateral, sobreposição, texto cortado ou alvo pequeno; contraste e barra fixa`, { skip: pular, timeout: 180000 }, async () => {
    const { pag, erros, fechar } = await abrir(tema, w, h), tag = `${tema === "dark" ? "escuro" : "claro"}-${w}`;
    try {
      /* --- primeira utilização --- */
      assert.ok(await pag.evaluate(medir.semRolagemLateral), "primeira vez: sem rolagem lateral");
      assert.deepEqual(await pag.evaluate(medir.alvos, [".wk-modelo .rac-btn", ".wk-barra .rac-btn"]), [], "primeira vez: alvos de toque ≥ 44 px");
      const c0 = (await pag.evaluate(medir.contraste, [".wk-bv-cab .rac-t-secao", ".wk-bv-cab .rac-t-sec", ".wk-modelo .rac-t-cartao", ".wk-modelo .rac-t-sec", ".wk-modelo-itens"])).filter((x) => x.r < x.minimo); assert.deepEqual(c0, [], "primeira vez: contraste");
      assert.deepEqual(await pag.evaluate(cortados), [], "primeira vez: nenhum texto cortado");
      await captura(pag, "lote2-primeira-vez-" + tag);
      await pag.click('.wk-modelo:has-text("Casa completa") button'); await pag.waitForSelector(".wk-item"); await assentou(pag); await pag.waitForTimeout(200);
      /* --- modo ver --- */
      assert.ok(await pag.evaluate(medir.semRolagemLateral), "ver: sem rolagem lateral (scrollWidth " + await pag.evaluate(() => document.documentElement.scrollWidth) + ")");
      assert.deepEqual(await pag.evaluate(medir.sobrepostos), [], "ver: nenhum componente se sobrepõe");
      assert.deepEqual(await pag.evaluate(cortados), [], "ver: nenhum texto cortado");
      assert.deepEqual(await pag.evaluate(medir.alvos, [".wk-barra .rac-btn", ".rac-linha-item", ".wm-mais .rac-btn", ".wk-secao-nome"]), [], "ver: alvos de toque ≥ 44 px");
      assert.equal(await pag.locator(".wk-editbar, .wk-alca, .wk-redim, .wk-tam, .wk-mini:not(.wk-mini-pag)").count() <= 1, true, "ver: só o botão ⋯ da página; nenhum controle de edição");
      const f1 = (await pag.evaluate(medir.contraste, CONTRASTE_VER)).filter((x) => x.r < x.minimo); assert.deepEqual(f1, [], "ver: contraste do texto");
      const faixa = await pag.evaluate(() => getComputedStyle(document.querySelector(".wk-hero h2")).color); assert.match(faixa, /rgb\(255, 255, 255\)|rgba\(255, 255, 255/, "a faixa azul tem texto branco");
      await captura(pag, "lote2-casa-completa-" + tag);
      /* --- modo personalizar --- */
      await pag.click(".wk-barra button[aria-label^='Personalizar']"); await pag.waitForSelector(".wk-edicao"); await pag.waitForTimeout(250);
      assert.ok(await pag.evaluate(medir.semRolagemLateral), "personalizar: sem rolagem lateral"); assert.deepEqual(await pag.evaluate(medir.sobrepostos), [], "personalizar: nenhum componente se sobrepõe");
      assert.deepEqual(await pag.evaluate(medir.alvos, [".wk-editbar .rac-btn", ".wk-alca", ".wk-mini"]), [], "personalizar: alvos de toque ≥ 44 px");
      const b0 = await pag.locator(".wk-editbar").boundingBox(), p0 = await pag.locator(".wk-secao").first().boundingBox(); assert.ok(b0.y + b0.height <= p0.y + 2, "a barra não cobre o começo do conteúdo"); assert.ok(b0.x >= 0 && b0.x + b0.width <= w + 1);
      await pag.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await pag.waitForTimeout(200); const b1 = await pag.locator(".wk-editbar").boundingBox(); assert.ok(b1.y >= -1 && b1.y < 40, "a barra de personalizar continua fixa ao rolar: y=" + Math.round(b1.y));
      await pag.evaluate(() => window.scrollTo(0, 0));
      const f2 = (await pag.evaluate(medir.contraste, [".wk-editbar .rac-selo", ".wk-editbar .rac-btn--sec", ".wk-edit-nome", ".wk-tam", ".wk-item-tit", ".wk-secao-titulo"])).filter((x) => x.r < x.minimo); assert.deepEqual(f2, [], "personalizar: contraste do texto");
      assert.equal(await pag.$eval(".wk-edicao .wk-corpo", (e) => getComputedStyle(e).opacity), "1", "o conteúdo continua legível ao personalizar");
      await captura(pag, "lote2-personalizando-" + tag);
      /* --- catálogo com os componentes novos --- */
      await pag.click(".wk-barra button[aria-label='Adicionar componente']"); await pag.waitForSelector(".wk-catalogo");
      assert.ok(await pag.locator(".wk-cat-it").count() >= 14, "o catálogo traz os componentes dos módulos e os de utilidade");
      const fo = await pag.locator(".wk-folha").boundingBox(); assert.ok(fo.x >= -1 && fo.x + fo.width <= w + 1, "o catálogo cabe na largura"); assert.ok(await pag.evaluate(medir.semRolagemLateral), "catálogo: sem rolagem lateral");
      assert.deepEqual(await pag.evaluate(medir.alvos, [".wk-folha .rac-btn", ".wk-folha .rac-chip"]), [], "catálogo: alvos ≥ 44 px");
      const f3 = (await pag.evaluate(medir.contraste, [".wk-cat-card .rac-t-cartao", ".wk-cat-card .rac-t-sec", ".wk-cat-card .wk-cat-meta", ".wk-folha .rac-chip"])).filter((x) => x.r < x.minimo); assert.deepEqual(f3, [], "catálogo: contraste");
      await captura(pag, "lote2-catalogo-" + tag);
      assert.deepEqual(erros, []);
    } finally { await fechar(); }
  });
}
test("a barra inferior do celular (390 px) com a Casa e os cinco atalhos de antes: 7 itens, nenhum cortado, rótulos legíveis, alvos de 44 px", { skip: pular, timeout: 120000 }, async () => {
  const { pag, fechar } = await abrir("light", 390, 844);
  try {
    await pag.click('.wk-modelo:has-text("Meu dia") button'); await pag.waitForSelector(".wk-item");
    const r = await pag.$$eval("#barra > *", (l) => l.map((e) => { const b = e.getBoundingClientRect(), t = e.querySelector(".t"), f = t ? parseFloat(getComputedStyle(t).fontSize) : 0; return { w: b.width, h: b.height, r: b.right, fonte: f, corta: t ? t.scrollWidth > t.clientWidth + 1 : false }; }));
    assert.equal(r.length, 7); assert.ok(r.every((x) => x.w >= 44 && x.h >= 44 && x.r <= 391 && !x.corta), JSON.stringify(r));
    await captura(pag, "lote2-barra-celular-claro-390");
  } finally { await fechar(); }
});
