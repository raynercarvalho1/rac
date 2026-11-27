// Lote 3 do novo RAC · qualidade VISUAL e de UX da TIMELINE, da BUSCA GLOBAL e do widget timeline.recente, medida num navegador de verdade (Chromium): computador 1440, tablet 1000 e celular 390, nos temas claro e
// escuro. Mesmas medições dos Lotes 1 e 2 (tests/workspace_visual.test.mjs): sem rolagem lateral, sem sobreposição entre eventos, alvos de toque de 44 px (chips, botões, selects, cada linha de evento e de resultado),
// contraste WCAG do texto e nenhum texto cortado. RAC_CAPTURAS=1 grava as capturas em docs/planejamento/img/ (lote3-*). Validação em navegador automatizado: NÃO substitui o teste no iPhone real.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pular, abrir, raiz, iso, utc } from "./_timeline_comum.mjs";

const fonteVis = fs.readFileSync(path.join(raiz, "tests/workspace_visual.test.mjs"), "utf8");
const medir = new Function(fonteVis.slice(fonteVis.indexOf("const medir = {"), fonteVis.indexOf("for (const tema of")).replace(/^const medir = /, "return ").replace(/;\s*$/, ""))();   // as mesmas medições dos lotes anteriores
const captura = async (pag, nome) => { if (process.env.RAC_CAPTURAS) { await pag.waitForTimeout(350); const larg = await pag.evaluate(() => window.innerWidth); await pag.screenshot({ path: path.join(raiz, "docs/planejamento/img", nome + ".png"), fullPage: larg > 390 }); } };   // celular: a primeira tela (a página inteira tem milhares de pixels)
const sobrepostos = () => { const r = [...document.querySelectorAll(".tl-ev, .bg-res")].filter((e) => e.offsetParent).map((e) => ({ id: e.getAttribute("data-id"), b: e.getBoundingClientRect() })), bad = [];
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) { const a = r[i].b, b = r[j].b, w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); if (w > 1 && h > 1) bad.push(r[i].id + "×" + r[j].id); } return bad; };
const cortados = () => [...document.querySelectorAll(".tl-titulo, .tl-resumo, .tl-meta, .tl-grupo-tit, .rac-chip")].filter((e) => e.offsetParent && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === "visible" && getComputedStyle(e).display !== "inline").map((e) => (e.textContent || "").trim().slice(0, 40));
const semRolagem = () => document.documentElement.scrollWidth <= window.innerWidth + 1;
const CONTRASTE = [".tl-titulo", ".tl-resumo", ".tl-meta", ".tl-quando", ".tl-grupo-tit", ".tl-controles .rac-chip", ".tl-agendado-cab b", ".bg-rotulo", ".rac-estado .rac-t-sec", ".rac-estado .rac-t-texto", ".rac-card .rac-t-legenda"];
const LAYOUT = { schema: 1, secoes: [{ id: "s1", titulo: "Agora", itens: [{ id: "w_000001", tipo: "timeline.recente", v: 1, col: 12, lin: 0, estado: "ativo", config: { limite: 6 } }] }] };
const MUITOS = Array.from({ length: 14 }, (_, i) => ({ id: "x" + String(i).padStart(3, "0"), quem: i % 2 ? "olivia" : "eddie", tipo: i % 3 ? "momento" : "vacina", data: iso(-(i % 6)), titulo: "Momento de exemplo número " + i + " com um título um pouco mais longo para testar a quebra de linha no celular", valor: "detalhe " + i, arquivos: i % 4 ? [] : [{ path: "a" }], criado_em: utc(-(i % 6), 8) }));

for (const tema of ["light", "dark"]) for (const [nome, w, h] of [["computador 1440", 1440, 900], ["tablet 1000", 1000, 800], ["celular 390", 390, 844]]) {
  test(`visual Timeline e Busca · ${nome} · tema ${tema}: sem rolagem lateral, sobreposição, texto cortado ou alvo pequeno; contraste; estados`, { skip: pular, timeout: 180000 }, async () => {
    const tag = `${tema === "dark" ? "escuro" : "claro"}-${w}`, t = await abrir({ tabelas: { registros: MUITOS } }, { largura: w, altura: h, tema });
    try {
      /* --- Timeline --- */
      await t.pag.waitForFunction(() => document.querySelector(".tl-grupo .tl-ev") && !document.querySelector(".rac-estado[aria-busy='true']"), null, { timeout: 15000 }); await t.pag.waitForTimeout(250);
      assert.ok(await t.pag.evaluate(semRolagem), "Timeline: sem rolagem lateral (" + await t.pag.evaluate(() => document.documentElement.scrollWidth) + ")"); assert.deepEqual(await t.pag.evaluate(sobrepostos), [], "Timeline: nenhum evento se sobrepõe");
      assert.deepEqual(await t.pag.evaluate(cortados), [], "Timeline: nenhum texto cortado");
      assert.deepEqual(await t.pag.evaluate(medir.alvos, [".tl-controles .rac-chip", ".tl-controles .rac-btn", ".tl-agr", ".tl-ev", ".tl-agendado-cab", ".tl-mais .rac-btn", ".wk-barra .rac-btn"]), [], "Timeline: alvos de toque ≥ 44 px");
      const f1 = (await t.pag.evaluate(medir.contraste, CONTRASTE)).filter((x) => x.r < x.minimo); assert.deepEqual(f1, [], "Timeline: contraste do texto");
      assert.match(await t.pag.evaluate(() => getComputedStyle(document.querySelector(".wk-hero h2")).color), /rgb\(255, 255, 255\)|rgba\(255, 255, 255/, "a faixa azul tem texto branco");
      await captura(t.pag, "lote3-timeline-" + tag);
      await t.pag.click(".tl-filtros-btn"); await t.pag.waitForSelector(".tl-filtros"); await t.pag.waitForTimeout(150);
      assert.ok(await t.pag.evaluate(semRolagem), "filtros abertos: sem rolagem lateral"); assert.deepEqual(await t.pag.evaluate(medir.alvos, [".tl-filtros .rac-chip", ".tl-filtros input", ".tl-filtros .rac-btn"]), [], "filtros: alvos ≥ 44 px");
      const f2 = (await t.pag.evaluate(medir.contraste, [".tl-filtros .rac-chip", ".tl-filtros .rac-t-rotulo"])).filter((x) => x.r < x.minimo); assert.deepEqual(f2, [], "filtros: contraste");
      if (w === 390) await captura(t.pag, "lote3-timeline-filtros-" + tag);
      await t.pag.selectOption(".tl-agr", "categoria"); await t.pag.waitForTimeout(150); assert.ok(await t.pag.evaluate(semRolagem), "agrupado por categoria: sem rolagem lateral"); assert.deepEqual(await t.pag.evaluate(sobrepostos), []);
      /* estado parcial */
      await t.pag.evaluate(() => { window.__cfg.falharTabela = ["compras_online"]; }); await t.pag.click('.tl-controles .rac-chip:text-is("Hoje")'); await t.pag.waitForSelector(".rac-alerta", { timeout: 10000 });
      assert.ok(await t.pag.evaluate(semRolagem), "parcial: sem rolagem lateral"); const f3 = (await t.pag.evaluate(medir.contraste, [".rac-alerta .rac-t-sec", ".rac-alerta .rac-t-cartao", ".rac-alerta b"])).filter((x) => x.r < x.minimo); assert.deepEqual(f3, [], "parcial: contraste");
      if (w === 390) await captura(t.pag, "lote3-timeline-parcial-" + tag);
      /* --- Busca --- */
      await t.pag.evaluate(() => { window.__cfg.falharTabela = null; history.replaceState(null, "", "#busca"); route(); }); await t.pag.waitForSelector("#bg-q", { timeout: 10000 }); await t.pag.waitForTimeout(200);
      assert.ok(await t.pag.evaluate(semRolagem), "Busca vazia: sem rolagem lateral"); assert.deepEqual(await t.pag.evaluate(medir.alvos, ["#bg-q", ".bg-filtros .rac-chip", ".bg-filtros select"]), [], "Busca: alvos ≥ 44 px");
      const f4 = (await t.pag.evaluate(medir.contraste, [".bg-rotulo", ".rac-estado .rac-t-texto", ".bg-filtros .rac-chip"])).filter((x) => x.r < x.minimo); assert.deepEqual(f4, [], "Busca inicial: contraste");
      if (w !== 1000) await captura(t.pag, "lote3-busca-inicial-" + tag);
      await t.pag.fill("#bg-q", "momento"); await t.pag.waitForSelector(".bg-res", { timeout: 10000 }); await t.pag.waitForTimeout(250);
      assert.ok(await t.pag.evaluate(semRolagem), "Busca com resultados: sem rolagem lateral"); assert.deepEqual(await t.pag.evaluate(sobrepostos), [], "Busca: nenhum resultado se sobrepõe"); assert.deepEqual(await t.pag.evaluate(cortados), [], "Busca: nenhum texto cortado");
      assert.deepEqual(await t.pag.evaluate(medir.alvos, [".bg-res"]), [], "Busca: cada resultado tem alvo ≥ 44 px"); const f5 = (await t.pag.evaluate(medir.contraste, CONTRASTE.concat([".bg-res .tl-titulo"]))).filter((x) => x.r < x.minimo); assert.deepEqual(f5, [], "Busca: contraste");
      await captura(t.pag, "lote3-busca-resultados-" + tag);
      await t.pag.fill("#bg-q", "zzzqqq"); await t.pag.waitForFunction(() => /Nada encontrado/.test(document.querySelector(".bg-corpo").textContent), null, { timeout: 8000 }); assert.ok(await t.pag.evaluate(semRolagem), "Busca sem resultado: sem rolagem lateral");
      if (w === 390) await captura(t.pag, "lote3-busca-vazia-" + tag);
      assert.deepEqual(t.erros, []);
    } finally { await t.fechar(); }
  });
}
test("visual do widget timeline.recente na Minha Casa (3 larguras × 2 temas): linhas compactas sem corte, sem sobreposição, alvos de 44 px e contraste", { skip: pular, timeout: 180000 }, async () => {
  for (const tema of ["light", "dark"]) for (const w of [1440, 1000, 390]) {
    const tag = `${tema === "dark" ? "escuro" : "claro"}-${w}`, t = await abrir({ paginas: [{ id: "p1", espaco_id: "e-pessoal", titulo: "Minha Casa", ordem: 0, layout: LAYOUT }], tabelas: { registros: MUITOS } }, { largura: w, altura: 844, tema, hash: "#workspace" });
    try {
      await t.pag.waitForSelector(".wk-item .tl-ev", { timeout: 15000 }); await t.pag.waitForTimeout(250);
      assert.ok(await t.pag.evaluate(semRolagem), "widget: sem rolagem lateral em " + tag); assert.deepEqual(await t.pag.evaluate(sobrepostos), [], "widget: sem sobreposição em " + tag); assert.deepEqual(await t.pag.evaluate(cortados), [], "widget: nenhum texto cortado em " + tag);
      assert.deepEqual(await t.pag.evaluate(medir.alvos, [".wk-item .tl-ev", ".wk-item .wm-mais .rac-btn"]), [], "widget: alvos ≥ 44 px em " + tag);
      const f = (await t.pag.evaluate(medir.contraste, [".wk-item .tl-titulo", ".wk-item .tl-resumo", ".wk-item .tl-meta", ".wk-item .tl-quando", ".wk-item .wm-mais .rac-btn"])).filter((x) => x.r < x.minimo); assert.deepEqual(f, [], "widget: contraste em " + tag);
      if (tema === "light" && w === 1440 || tema === "dark" && w === 390) await captura(t.pag, "lote3-widget-" + tag); assert.deepEqual(t.erros, []);
    } finally { await t.fechar(); }
  }
});
