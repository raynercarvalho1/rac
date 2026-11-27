// Lote 1 do novo RAC · a TELA do Workspace num navegador de verdade (Chromium, pelo Playwright), nas três larguras (computador 1280, tablet 1000, celular 390; o app troca para o layout de celular abaixo de 861 px).
// O site abre de verdade (HTML, CSS, módulos); não há login nem rede: o banco (PostgREST) é simulado DENTRO da página, com as mesmas regras que o banco real aplica (título único, versão que sobe a cada
// gravação, layout válido, limite de páginas); o que o banco real recusa por RLS é provado em tests/espacos_sql.test.mjs (PGlite).
// Cobre: criar página (vazia e pelo modelo), catálogo, adicionar, configurar, mover (arrastar com o mouse, setas e menu), redimensionar (canto, Shift+setas e menu), ocultar, desativar, remover da página,
// desfazer/refazer, salvar e reabrir com a composição preservada, grade de 12/8/1 colunas, conflito entre aparelhos, falha ao salvar, widget que sumiu do catálogo, leitor sem edição, espaço
// compartilhado (tipo privado bloqueado; "ocultar só para mim") e que nada de dado de negócio é tocado. Roda no GitHub (testes.yml instala o Playwright); sem Playwright, é pulado.
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
test("no GitHub, o navegador do teste está instalado", { skip: !process.env.CI }, () => assert.ok(pw, "Playwright não foi instalado no testes.yml"));
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const abrirNavegador = () => pw.chromium.launch(process.env.RAC_CHROMIUM ? { executablePath: process.env.RAC_CHROMIUM } : {});

/* o banco simulado, instalado dentro da página */
function instalar(cfg) {
  window.__cfg = cfg;
  const db = window.__db = { workspace_paginas: [], workspace_versoes: [], workspace_pessoal: [], falhar: null, escritas: [], chamadas: [] };
  const res = (data, error) => Promise.resolve({ data: data === undefined ? null : data, error: error || null }), clone = (x) => JSON.parse(JSON.stringify(x));
  const ativa = (p) => !p.arquivada_em, chave = (p) => p.espaco_id + "|" + String(p.titulo).replace(/\s+/g, " ").trim().toLowerCase();
  (cfg.paginas || []).forEach((p) => db.workspace_paginas.push(Object.assign({ versao: 1, ordem: 0, criado_em: new Date().toISOString(), arquivada_em: null, schema_versao: 1 }, clone(p))));
  function exec(st) {
    const t = st.t, tabela = db[t] || (cfg.tabelas && cfg.tabelas[t]);   // tabelas de módulos (compras, lista, garmin…): só leitura, para os widgets da Minha Casa
    db.chamadas.push(t + "." + st.op);
    if (st.op !== "select" && db.falhar && (t === "workspace_paginas" || t === "workspace_pessoal")) return res(null, { message: db.falhar, code: "XX000" });
    if (window.__cfg.falharTabela && (window.__cfg.falharTabela === t || (Array.isArray(window.__cfg.falharTabela) && window.__cfg.falharTabela.includes(t))) && st.op === "select") return res(null, { message: "tabela fora: " + t, code: "XX000" });
    if (!tabela) return res(st.op === "select" ? [] : null);
    const col = (r, c) => (c.includes("->>") ? ((r[c.split("->>")[0]] || {})[c.split("->>")[1]]) : c.includes(".") ? ((r[c.split(".")[0]] || {})[c.split(".")[1]]) : r[c]);
    const casa = (r) => st.f.every((f) => (f[0] === "not" ? (f[2] === "is" ? col(r, f[1]) != null : !String(f[3]).replace(/[()]/g, "").split(",").includes(String(col(r, f[1])))) : f[0] === "or" ? f[1].split(/,(?=[a-z_>.-]+\.imatch\.)/).some((x) => { const m = /^(.+?)\.imatch\."(.*)"$/.exec(x); return !!m && new RegExp(m[2], "i").test(String(col(r, m[1]) == null ? "" : col(r, m[1]))); }) : f[0] === "eq" ? r[f[1]] === f[2] : f[0] === "gte" ? String(r[f[1]]) >= f[2] : f[0] === "lte" ? String(r[f[1]]) <= f[2] : f[0] === "in" ? f[2].indexOf(r[f[1]]) >= 0 : r[f[1]] === null || r[f[1]] === undefined));
    if (st.op !== "select") db.escritas.push(t + "." + st.op);
    if (st.op === "select") { let l = tabela.filter(casa).map(clone); if (st.ord) l.sort((a, b) => { for (const [c, d] of st.ord) { const r = (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * d; if (r) return r; } return 0; }); if (st.rg) l = l.slice(st.rg[0], st.rg[1] + 1); if (st.lim) l = l.slice(0, st.lim); return res(l); }
    if (t === "workspace_paginas") {
      const valido = (p) => window.RACnucleo.wsValidar(p.layout).ok;
      if (st.op === "insert") { const p = Object.assign({ versao: 1, ordem: 0, criado_em: new Date().toISOString(), arquivada_em: null, schema_versao: 1, layout: { schema: 1, secoes: [] } }, clone(st.payload));
        if (db.workspace_paginas.some((x) => ativa(x) && chave(x) === chave(p))) return res(null, { code: "23505", message: "duplicate key value violates unique constraint" });
        if (db.workspace_paginas.filter((x) => x.espaco_id === p.espaco_id && ativa(x)).length >= 30) return res(null, { message: "limite_de_paginas" });
        if (!valido(p)) return res(null, { code: "23514", message: "workspace_layout_valido" });
        db.workspace_paginas.push(p); db.workspace_versoes.push({ pagina_id: p.id, versao: 1, layout: clone(p.layout), titulo: p.titulo, quando: new Date().toISOString(), motivo: "criar" }); return res(st.ret ? [clone(p)] : null); }
      if (st.op === "update") { const alvo = tabela.filter(casa), fora = []; for (const p of alvo) { const n = Object.assign({}, p, clone(st.payload)); n.versao = p.versao + 1;
          if (ativa(n) && db.workspace_paginas.some((x) => x !== p && ativa(x) && chave(x) === chave(n))) return res(null, { code: "23505", message: "duplicate key" });
          if (!valido(n)) return res(null, { code: "23514", message: "workspace_layout_valido" }); Object.assign(p, n); db.workspace_versoes.push({ pagina_id: p.id, versao: p.versao, layout: clone(p.layout), titulo: p.titulo, quando: new Date().toISOString(), motivo: "editar" }); fora.push(clone(p)); }
        return res(st.ret ? fora : null); }
      if (st.op === "delete") { const alvo = tabela.filter(casa); alvo.forEach((p) => tabela.splice(tabela.indexOf(p), 1)); return res(null); }
    }
    if (t === "workspace_pessoal") {
      if (st.op === "upsert") { const p = clone(st.payload), i = tabela.findIndex((x) => x.user_id === p.user_id && x.pagina_id === p.pagina_id); if (i >= 0) tabela[i] = Object.assign(tabela[i], p); else tabela.push(p); return res(st.ret ? [clone(p)] : null); }
      if (st.op === "update") { const alvo = tabela.filter(casa); alvo.forEach((x) => Object.assign(x, clone(st.payload))); return res(st.ret ? alvo.map(clone) : null); }
    }
    return res(st.ret ? [] : null);
  }
  function B(t) { const st = { t, op: "select", f: [], ord: null, lim: null, payload: null, ret: false }, q = {
    select: () => { if (st.op !== "select") st.ret = true; return q; }, eq: (c, v) => { st.f.push(["eq", c, v]); return q; }, is: (c) => { st.f.push(["is", c]); return q; }, in: (c, v) => { st.f.push(["in", c, v]); return q; }, not: (c, op, v) => { st.f.push(["not", c, op, v]); return q; }, or: (x) => { st.f.push(["or", x]); return q; }, gte: (c, v) => { st.f.push(["gte", c, v]); return q; }, lte: (c, v) => { st.f.push(["lte", c, v]); return q; }, range: (a, b) => { st.rg = [a, b]; return q; }, maybeSingle: () => q,
    order: (c, o) => { (st.ord = st.ord || []).push([c, o && o.ascending === false ? -1 : 1]); return q; }, limit: (n) => { st.lim = n; return q; },
    insert: (p) => { st.op = "insert"; st.payload = p; return q; }, update: (p) => { st.op = "update"; st.payload = p; return q; }, upsert: (p) => { st.op = "upsert"; st.payload = p; return q; }, delete: () => { st.op = "delete"; return q; },
    then: (ok, no) => { const d = (window.__cfg.atrasos || {})[st.t], p = exec(st); return (d ? p.then((x) => new Promise((r) => setTimeout(() => r(x), d))) : p).then(ok, no); } }; return q; }
  window.SB = { from: B, rpc: (n) => (n === "rac_iniciar_espacos" ? res(clone(cfg.espacos)) : res(true)), storage: { from: () => ({ list: () => res([]) }) }, functions: { invoke: () => res(null) } };
  window.PAPEL = cfg.papel || "dono"; window.EU = { id: "u-dono" }; window.DONO = "u-dono";
  try { localStorage.clear(); } catch (e) { /* sem armazenamento */ }
}
const PESSOAL = { id: "e-pessoal", tipo: "pessoal", nome: "Pessoal", papel: "proprietario", casa: false, arquivado: false };
const CASA = { id: "e-casa", tipo: "compartilhado", nome: "Casa", papel: "editor", casa: true, arquivado: false };
const lay = (...secoes) => ({ schema: 1, secoes: secoes.map((itens, i) => ({ id: "s" + (i + 1), titulo: i === 0 ? "Principal" : "Outra", itens })) });
const it = (n, tipo = "nota.fixa", extra = {}) => ({ id: "w_" + String(n).padStart(6, "0"), tipo, v: 1, col: 4, lin: 0, estado: "ativo", config: tipo === "nota.fixa" ? { titulo: "Nota " + n, texto: "Texto " + n } : {}, ...extra });
const pg = (id, titulo, layout, extra = {}) => ({ id, espaco_id: "e-pessoal", titulo, layout, ...extra });

async function abrir(cfg, { largura = 1280, altura = 900 } = {}) {
  const servidor = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html";
    const f = path.join(raiz, p);
    if (!f.startsWith(raiz) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${servidor.address().port}`, nav = await abrirNavegador(), pag = await nav.newPage({ viewport: { width: largura, height: altura }, hasTouch: false }), erros = [];
  { const esperar = pag.waitForFunction.bind(pag); pag.waitForFunction = (fn, arg, opt) => esperar(fn, arg, { polling: 100, ...opt }); }   // sondagem por intervalo, não por requestAnimationFrame: sob carga (vários navegadores em paralelo) o rAF de uma página pode não disparar e a espera ficava pendurada até o limite (instabilidade do waitForFunction no CI do Lote 1)
  pag.on("pageerror", (e) => erros.push("erro: " + e.message));
  pag.on("console", (m) => { if (m.type() === "error" && (m.location().url || base).startsWith(base)) erros.push("console: " + m.text()); });
  pag.on("dialog", (d) => d.accept(d.type() === "prompt" ? "Meus atalhos" : undefined));
  await pag.goto(base + "/"); await pag.waitForSelector("#gate", { state: "visible", timeout: 20000 });
  await pag.evaluate(instalar, cfg);
  await pag.evaluate(async () => { document.documentElement.classList.add("logado"); await precisa(["workspace"]); tabs.forEach((t) => { document.getElementById(t).hidden = t !== "workspace"; }); document.documentElement.setAttribute("data-sec", "workspace"); renderWorkspace(); });
  await pag.waitForSelector(".wk", { timeout: 10000 });
  return { pag, erros, fechar: async () => { await nav.close(); servidor.close(); } };
}
const ordem = (pag, secao) => pag.$$eval(secao ? `.wk-grade[data-secao="${secao}"] > .wk-item` : ".wk-secao:first-child .wk-grade > .wk-item", (l) => l.map((e) => e.getAttribute("data-id")));
const salvo = (pag, id) => pag.evaluate((i) => JSON.parse(JSON.stringify(window.__db.workspace_paginas.find((p) => p.id === i))), id);
const barra = (pag, t) => pag.locator(".wk-barra button", { hasText: t });
const W = (n) => "w_" + String(n).padStart(6, "0");

test("computador (1280): sem páginas → criar pelo modelo → personalizar (catálogo, configurar, setas, menu, ocultar, desativar, remover) → desfazer → concluir → reabrir com a composição preservada", { skip: pular, timeout: 120000 }, async () => {
  const { pag, erros, fechar } = await abrir({ espacos: [PESSOAL, CASA] });
  try {
    assert.match(await pag.textContent(".wk-bemvindo"), /Bem-vindo à sua casa/);
    await pag.click('.wk-modelo:has-text("Meu dia") button');   // a primeira página nasce "Minha Casa", sem perguntar o nome
    await pag.waitForSelector(".wk-item", { timeout: 5000 }); assert.match(await pag.textContent(".wk-hero h2"), /Minha Casa/);
    await pag.click('button[aria-label="Personalizar esta página"]'); await pag.waitForSelector(".wk-edicao", { timeout: 5000 });
    const tipos = await pag.$$eval(".wk-item", (l) => l.map((e) => e.getAttribute("data-id")));
    assert.ok(tipos.length >= 2, "o modelo trouxe componentes: " + tipos.length);
    assert.match(await pag.textContent(".wk-editbar"), /Personalizando/);
    /* a grade tem 12 colunas */
    assert.equal(await pag.$eval(".wk-grade", (g) => getComputedStyle(g).gridTemplateColumns.split(" ").length), 12);
    /* adicionar pelo catálogo, com busca */
    await pag.click(".wk-add"); await pag.waitForSelector(".wk-catalogo");
    await pag.fill(".wk-busca", "nota fixa"); assert.equal(await pag.locator(".wk-cat-it").count(), 1, await pag.textContent(".wk-catalogo"));
    await pag.click(".wk-cat-it button:has-text('Adicionar')"); await pag.waitForSelector(".wk-catalogo", { state: "detached" });
    const nova = (await ordem(pag)).pop(); assert.equal(await pag.locator(`.wk-item[data-id="${nova}"]`).count(), 1);
    /* o foco vai para a alça do componente novo; setas movem (alternativa ao arrastar), com aviso para leitores de tela */
    assert.equal(await pag.evaluate(() => document.activeElement.getAttribute("data-foco")), "alca:" + nova);
    await pag.keyboard.press("ArrowUp"); assert.equal((await ordem(pag)).indexOf(nova), (tipos.length) - 1, "subiu uma posição");
    assert.match(await pag.textContent(".wk-anuncio"), /Movido para a posição/);
    /* Shift + setas: tamanho (col 4 → 5 → 4) */
    const col = (id) => pag.$eval(`.wk-item[data-id="${id}"]`, (e) => e.style.getPropertyValue("--c12"));
    await pag.keyboard.press("Shift+ArrowRight"); assert.equal(await col(nova), "5"); await pag.keyboard.press("Shift+ArrowLeft"); assert.equal(await col(nova), "4");
    /* configurar */
    await pag.click(`.wk-item[data-id="${nova}"] button[aria-label^="Ações de"]`); await pag.click(".wk-menu-it:has-text('Configurar')");
    await pag.fill('.wk-folha textarea', "Comprar pão\nLigar para a escola"); await pag.fill('.wk-folha input[type=text]', "Recados"); await pag.click(".wk-folha button:has-text('Aplicar')");
    await pag.waitForFunction((i) => document.querySelector(`.wk-item[data-id="${i}"]`).textContent.includes("Comprar pão"), nova);   /* o corpo do widget se desenha de forma assíncrona */
    assert.match(await pag.textContent(`.wk-item[data-id="${nova}"]`), /Recados/);
    /* ocultar, desativar e remover são coisas diferentes; nenhuma toca em dado de negócio */
    const primeiro = (await ordem(pag))[0];
    await pag.click(`.wk-item[data-id="${primeiro}"] button[aria-label^="Ações de"]`); await pag.click(".wk-menu-it:has-text('Ocultar')");
    assert.match(await pag.getAttribute(`.wk-item[data-id="${primeiro}"]`, "class"), /wk-sit-oculto/); assert.match(await pag.textContent(`.wk-item[data-id="${primeiro}"]`), /Oculto: não aparece na vista/);
    await pag.click(`.wk-item[data-id="${primeiro}"] button[aria-label^="Ações de"]`); await pag.click(".wk-menu-it:has-text('Desativar')");
    assert.match(await pag.getAttribute(`.wk-item[data-id="${primeiro}"]`, "class"), /wk-sit-desativado/); assert.match(await pag.textContent(`.wk-item[data-id="${primeiro}"]`), /não consulta dados nem gera avisos/);
    /* desfazer duas vezes volta ao ativo; refazer vai de novo */
    await barra(pag, "Desfazer").click(); await barra(pag, "Desfazer").click(); assert.match(await pag.getAttribute(`.wk-item[data-id="${primeiro}"]`, "class"), /wk-sit-(ok|erro)?/); assert.doesNotMatch(await pag.getAttribute(`.wk-item[data-id="${primeiro}"]`, "class"), /oculto|desativado/);
    await barra(pag, "Refazer").click(); assert.match(await pag.getAttribute(`.wk-item[data-id="${primeiro}"]`, "class"), /wk-sit-oculto/);
    await barra(pag, "Desfazer").click();
    /* remover da página: some do layout e NADA é escrito fora de workspace_* */
    const antesRemover = (await ordem(pag)).length;
    await pag.click(`.wk-item[data-id="${primeiro}"] button[aria-label^="Ações de"]`); await pag.click(".wk-menu-it:has-text('Remover da página')");
    assert.equal((await ordem(pag)).length, antesRemover - 1); assert.match(await pag.textContent(".wk-anuncio"), /nenhum dado foi apagado/);
    /* nada gravado ainda: só o rascunho do aparelho */
    const antes = await salvo(pag, (await pag.evaluate(() => window.__db.workspace_paginas[0].id)));
    assert.ok(antes.layout.secoes[0].itens.some((i) => i.id === primeiro), "enquanto não conclui, o banco ainda tem o componente");
    assert.ok(await pag.evaluate(() => Object.keys(localStorage).some((k) => k.indexOf("rac-ws-rascunho:") === 0)), "o rascunho fica no aparelho");
    /* concluir: grava uma vez, sai do modo de edição, versão sobe */
    await barra(pag, "Concluir").click(); await pag.waitForSelector(".wk-edicao", { state: "detached" });
    const depois = await salvo(pag, antes.id); assert.equal(depois.versao, antes.versao + 1); assert.ok(!depois.layout.secoes[0].itens.some((i) => i.id === primeiro), "removido do layout"); assert.ok(depois.layout.secoes[0].itens.some((i) => i.id === nova), "o novo ficou");
    assert.equal(await pag.evaluate(() => Object.keys(localStorage).filter((k) => k.indexOf("rac-ws-rascunho:") === 0).length), 0, "rascunho limpo");
    assert.deepEqual(await pag.evaluate(() => window.__db.escritas.filter((e) => e.indexOf("workspace_") !== 0)), [], "o Workspace só escreveu em tabelas workspace_*");
    /* reabrir (outra “abertura” da tela, lendo do banco): a composição é a mesma */
    const antesOrdem = await ordem(pag);
    await pag.evaluate(async () => { renderWorkspace(); }); await pag.waitForSelector(".wk-item"); assert.deepEqual(await ordem(pag), antesOrdem);
    await pag.waitForFunction((i) => document.querySelector(`.wk-item[data-id="${i}"]`).textContent.includes("Comprar pão"), nova);
    assert.match(await pag.textContent(`.wk-item[data-id="${nova}"]`), /Recados/); assert.match(await pag.textContent(`.wk-item[data-id="${nova}"]`), /Comprar pão/);
    assert.equal(await pag.locator(".wk-alca").count(), 0, "fora da edição não há alças"); assert.equal(await pag.locator("button:has-text('Personalizar')").count(), 1);
    assert.deepEqual(erros, [], "nenhum erro no navegador");
  } finally { await fechar(); }
});

test("computador: arrastar com o mouse pela alça reordena (entre seções também) e o canto redimensiona; o que passa dos limites é limitado", { skip: pular, timeout: 120000 }, async () => {
  /* janela alta de propósito: arrastar para perto da borda de baixo (70 px) liga a rolagem automática da página, e a posição dos componentes depende das fontes de cada máquina; sem rolagem, o teste mede só a regra de soltar (instabilidade vista no CI do Lote 2 com a janela de 900 px) */
  const { pag, erros, fechar } = await abrir({ espacos: [PESSOAL], paginas: [pg("p1", "Casa", lay([it(1), it(2), it(3)], [it(4)]))] }, { altura: 1400 });
  try {
    await barra(pag, "Personalizar").click(); await pag.waitForSelector(".wk-edicao");
    const centro = async (sel) => { const b = await pag.locator(sel).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; };
    /* arrasta o 3º para antes do 1º */
    let de = await centro(`.wk-item[data-id="${W(3)}"] .wk-alca`), para = await centro(`.wk-item[data-id="${W(1)}"]`);
    await pag.mouse.move(de.x, de.y); await pag.mouse.down(); await pag.mouse.move(de.x + 12, de.y + 12, { steps: 3 }); await pag.mouse.move(para.b.x + 20, para.b.y + 30, { steps: 12 });
    assert.ok(await pag.locator(".wk-alvo-antes").count() === 1, "mostra onde vai cair"); await pag.mouse.up();
    assert.deepEqual(await ordem(pag), [W(3), W(1), W(2)]);
    /* arrasta o 1º da seção 1 para a seção 2 (sobre o 4º, depois dele) */
    de = await centro(`.wk-item[data-id="${W(1)}"] .wk-alca`); para = await centro(`.wk-item[data-id="${W(4)}"]`);
    await pag.mouse.move(de.x, de.y); await pag.mouse.down(); await pag.mouse.move(de.x + 12, de.y + 12, { steps: 3 }); await pag.mouse.move(para.b.x + para.b.width - 10, para.y, { steps: 14 }); await pag.mouse.up();
    assert.deepEqual([await ordem(pag, "s1"), await ordem(pag, "s2")], [[W(3), W(2)], [W(4), W(1)]]);
    /* redimensionar pelo canto: arrasta para a direita e para baixo; fica dentro dos limites de 1..12 colunas */
    const rz = await centro(`.wk-item[data-id="${W(3)}"] .wk-redim`), item = await centro(`.wk-item[data-id="${W(3)}"]`);
    await pag.mouse.move(rz.x, rz.y); await pag.mouse.down(); await pag.mouse.move(rz.x + 600, rz.y + 200, { steps: 8 }); await pag.mouse.up();
    const t = await pag.$eval(`.wk-item[data-id="${W(3)}"]`, (e) => [Number(e.style.getPropertyValue("--c12")), Number(e.style.getPropertyValue("--lin"))]);
    assert.ok(t[0] > 4 && t[0] <= 12 && t[1] >= 1, "cresceu: " + t.join("x"));
    await barra(pag, "Desfazer").click(); assert.equal(await pag.$eval(`.wk-item[data-id="${W(3)}"]`, (e) => e.style.getPropertyValue("--c12")), "4", "desfazer devolve o tamanho");
    assert.deepEqual(erros, []);
  } finally { await fechar(); }
});

test("tablet (1000): grade de 8 colunas com o mesmo documento; celular (390): 1 coluna na ordem do fluxo, mover por menu (sem arrastar) e sem alça de canto", { skip: pular, timeout: 120000 }, async () => {
  const paginas = [pg("p1", "Casa", lay([it(1, "nota.fixa", { col: 6 }), it(2, "nota.fixa", { col: 12 }), it(3, "nota.fixa", { col: 3, mobile: false })]))];
  const a = await abrir({ espacos: [PESSOAL], paginas }, { largura: 1000 });
  try {
    assert.equal(await a.pag.$eval(".wk-grade", (g) => getComputedStyle(g).gridTemplateColumns.split(" ").length), 8, "8 colunas no tablet");
    const larg = await a.pag.$$eval(".wk-item", (l) => l.map((e) => Math.round(e.getBoundingClientRect().width)));
    assert.ok(larg[0] < larg[1] && larg[1] > larg[2], "a largura em colunas é escalada (6→4, 12→8, 3→2): " + larg.join(","));
    assert.deepEqual(a.erros, []);
  } finally { await a.fechar(); }
  const c = await abrir({ espacos: [PESSOAL], paginas }, { largura: 390, altura: 800 });
  try {
    assert.equal(await c.pag.$eval(".wk-grade", (g) => getComputedStyle(g).gridTemplateColumns.split(" ").length), 1, "1 coluna no celular");
    assert.deepEqual(await ordem(c.pag), [W(1), W(2)], "o item marcado para esconder no celular não aparece na vista");
    assert.ok(await c.pag.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "sem rolagem lateral");
    await barra(c.pag, "Personalizar").click(); await c.pag.waitForSelector(".wk-edicao");
    assert.deepEqual(await ordem(c.pag), [W(1), W(2), W(3)], "na edição aparece tudo (inclusive o que se esconde no celular)");
    assert.equal(await c.pag.locator(".wk-redim").count(), 0, "sem alça de canto: uma coluna só");
    const alvo = await c.pag.locator(".wk-alca").first().boundingBox(); assert.ok(alvo.width >= 44 && alvo.height >= 44, "alvo de toque ≥ 44 px: " + alvo.width + "x" + alvo.height);
    await c.pag.click(`.wk-item[data-id="${W(1)}"] button[aria-label^="Ações de"]`); await c.pag.click(".wk-menu-it:has-text('Mover para baixo')");
    assert.deepEqual(await ordem(c.pag), [W(2), W(1), W(3)], "mover pelo menu funciona sem arrastar");
    await c.pag.click(`.wk-item[data-id="${W(1)}"] button[aria-label^="Ações de"]`); assert.equal(await c.pag.locator(".wk-menu-it:has-text('Tamanho: Médio')").isDisabled(), true, "tamanho em colunas não se aplica a uma coluna só");
    await c.pag.keyboard.press("Escape"); await barra(c.pag, "Concluir").click(); await c.pag.waitForSelector(".wk-edicao", { state: "detached" });
    assert.deepEqual((await salvo(c.pag, "p1")).layout.secoes[0].itens.map((i) => i.id), [W(2), W(1), W(3)], "o mesmo documento serve às três larguras");
    assert.deepEqual(c.erros, []);
  } finally { await c.fechar(); }
});

test("conflito entre aparelhos, falha ao salvar, widget que sumiu do catálogo e cancelar", { skip: pular, timeout: 120000 }, async () => {
  const { pag, erros, fechar } = await abrir({ espacos: [PESSOAL], paginas: [pg("p1", "Casa", lay([it(1), it(2), it(9, "tipo.sumiu", { config: { guardada: "sim" } })]))] });
  try {
    /* widget indisponível: aparece o aviso, a configuração continua e sobrevive a salvar */
    assert.match(await pag.textContent(`.wk-item[data-id="${W(9)}"]`), /não existe mais nesta versão do app/);
    await barra(pag, "Personalizar").click(); await pag.waitForSelector(".wk-edicao");
    /* cancelar descarta */
    await pag.click(`.wk-item[data-id="${W(1)}"] button[aria-label^="Ações de"]`); await pag.click(".wk-menu-it:has-text('Remover da página')"); assert.equal((await ordem(pag)).length, 2);
    await barra(pag, "Cancelar").click(); await pag.waitForSelector(".wk-edicao", { state: "detached" }); assert.equal((await ordem(pag)).length, 3, "cancelar volta ao que estava salvo");
    /* falha ao salvar: avisa, continua editando, o rascunho fica */
    await barra(pag, "Personalizar").click(); await pag.click(`.wk-item[data-id="${W(2)}"] button[aria-label^="Ações de"]`); await pag.click(".wk-menu-it:has-text('Remover da página')");
    await pag.evaluate(() => { window.__db.falhar = "rede caiu"; }); await barra(pag, "Concluir").click();
    await pag.waitForFunction(() => /Não salvou/.test(document.querySelector(".wk-aviso").textContent)); assert.match(await pag.textContent(".wk-aviso"), /Suas alterações continuam aqui/);
    assert.equal(await pag.locator(".wk-edicao").count(), 1, "continua no modo de edição"); assert.ok(await pag.evaluate(() => Object.keys(localStorage).some((k) => k.indexOf("rac-ws-rascunho:") === 0)));
    /* outro aparelho altera o MESMO componente e a página (versão sobe): conflito de verdade */
    await pag.evaluate((w) => { window.__db.falhar = null; const p = window.__db.workspace_paginas[0]; p.layout.secoes[0].itens.find((i) => i.id === w).col = 9; p.versao += 1; }, W(1));
    await barra(pag, "Concluir").click(); await pag.waitForSelector(".wk-folha:has-text('Alteração em outro aparelho')");
    assert.match(await pag.textContent(".wk-folha"), /alterad/);
    await pag.click("button:has-text('Aplicar minhas alterações')");
    const s = await salvo(pag, "p1"), antesVersao = s.versao;
    assert.equal(s.layout.secoes[0].itens.find((i) => i.id === W(1)).col, 9, "a alteração do outro aparelho continua"); assert.ok(s.layout.secoes[0].itens.some((i) => i.id === W(2)), "ainda não gravou a minha remoção: a pessoa confere antes de concluir");
    assert.equal(await pag.locator(".wk-edicao").count(), 1, "depois de aplicar, continua editando para conferir"); await barra(pag, "Concluir").click(); await pag.waitForSelector(".wk-edicao", { state: "detached" });
    const f = await salvo(pag, "p1"); assert.equal(f.versao, antesVersao + 1); assert.ok(!f.layout.secoes[0].itens.some((i) => i.id === W(2)), "minha remoção foi salva sobre a versão nova"); assert.equal(f.layout.secoes[0].itens.find((i) => i.id === W(1)).col, 9);
    assert.deepEqual(f.layout.secoes[0].itens.find((i) => i.id === W(9)).config, { guardada: "sim" }, "a configuração do widget que sumiu ficou intacta");
    /* conflito só de título/ordem (layout igual ao que esta tela leu): salva sozinho, sem incomodar */
    await barra(pag, "Personalizar").click(); await pag.click(`.wk-item[data-id="${W(1)}"] button[aria-label^="Ações de"]`); await pag.click(".wk-menu-it:has-text('Duplicar')");
    await pag.evaluate(() => { const p = window.__db.workspace_paginas[0]; p.titulo = "Casa (renomeada)"; p.versao += 1; });
    await barra(pag, "Concluir").click(); await pag.waitForSelector(".wk-edicao", { state: "detached" }); assert.equal(await pag.locator(".wk-folha").count(), 0, "sem pergunta quando só o título mudou");
    const g = await salvo(pag, "p1"); assert.equal(g.titulo, "Casa (renomeada)"); assert.equal(g.layout.secoes[0].itens.filter((i) => i.tipo === "nota.fixa").length, 2);
    assert.deepEqual(erros, []);
  } finally { await fechar(); }
});

test("permissões na tela: o leitor não vê 'Personalizar'; em espaço compartilhado o tipo privado (Agenda) é bloqueado no catálogo e cada pessoa oculta 'só para mim'", { skip: pular, timeout: 120000 }, async () => {
  const LEITOR = { ...CASA, id: "e-leitor", nome: "Reforma", papel: "leitor", casa: false };
  const l = await abrir({ espacos: [PESSOAL, LEITOR] , paginas: [pg("p1", "Reforma", lay([it(1), it(2)]), { espaco_id: "e-leitor" })] });
  try {
    await l.pag.click(".wk-outros button:has-text('Reforma')"); await l.pag.waitForSelector(".wk-item");   // sem página no espaço pessoal, os outros espaços aparecem na boas-vindas
    assert.equal(await l.pag.locator("button:has-text('Personalizar')").count(), 0, "o leitor só vê");
    await l.pag.click(`.wk-item[data-id="${W(1)}"] button:has-text('Ocultar')`); await l.pag.waitForFunction((i) => !document.querySelector(`.wk-item[data-id="${i}"]`), W(1));
    assert.equal(await l.pag.evaluate(() => JSON.stringify(window.__db.workspace_pessoal.map((x) => x.ocultos))), JSON.stringify([[W(1)]]), "a preferência é só da pessoa (workspace_pessoal), o layout não mudou");
    assert.equal(await l.pag.evaluate(() => window.__db.escritas.filter((e) => e === "workspace_paginas.update").length), 0, "ocultar para mim não altera a página compartilhada");
    await l.pag.click("button:has-text('Mostrar 1 oculto')"); assert.equal(await l.pag.locator(`.wk-item[data-id="${W(1)}"]`).count(), 1);
    assert.deepEqual(l.erros, []);
  } finally { await l.fechar(); }
  const c = await abrir({ espacos: [CASA], paginas: [pg("p2", "Casa", lay([it(1)]), { espaco_id: "e-casa" })] });
  try {
    await barra(c.pag, "Personalizar").click(); await c.pag.waitForSelector(".wk-edicao"); await c.pag.click(".wk-add");
    const agenda = c.pag.locator(".wk-cat-it", { hasText: "Agenda: próximos" });
    assert.equal(await agenda.locator("button").isDisabled(), true, "tipo privado bloqueado em espaço compartilhado"); assert.match(await agenda.textContent(), /Privado: não pode ficar em espaço compartilhado/);
    assert.equal(await c.pag.locator(".wk-cat-it", { hasText: "Nota fixa" }).locator("button").isDisabled(), false, "tipos compartilháveis seguem liberados");
    assert.deepEqual(c.erros, []);
  } finally { await c.fechar(); }
});

test("páginas: criar vazia, nome repetido recusado, renomear, mover, página inicial e arquivar (nenhum dado de módulo é tocado)", { skip: pular, timeout: 120000 }, async () => {
  const { pag, erros, fechar } = await abrir({ espacos: [PESSOAL], paginas: [pg("p1", "Minha Casa", lay([it(1)]), { ordem: 0 }), pg("p2", "Trabalho", lay([it(2)]), { ordem: 1 })] });
  try {
    assert.deepEqual(await pag.$$eval(".wk-aba:not(.wk-aba-nova)", (l) => l.map((e) => e.textContent)), ["Minha Casa", "Trabalho"]);
    await pag.click(".wk-aba-nova"); await pag.fill('input[aria-label="Nome da página"]', "  minha   casa "); await pag.click(".wk-folha button:text-is('Criar página')");
    await pag.waitForFunction(() => /Já existe uma página com este nome/.test(document.querySelector(".wk-folha").textContent)); await pag.fill('input[aria-label="Nome da página"]', "Fim de semana"); await pag.click(".wk-folha button:text-is('Criar página')");
    await pag.waitForSelector(".wk-edicao"); assert.match(await pag.textContent(".wk-vazio, .wk-pagina"), /vazia|Adicionar componente/); await barra(pag, "Concluir").click();
    assert.deepEqual(await pag.$$eval(".wk-aba:not(.wk-aba-nova)", (l) => l.map((e) => e.textContent)), ["Minha Casa", "Trabalho", "Fim de semana"]);
    await pag.click('.wk-aba:has-text("Trabalho")'); await pag.click('button[aria-label="Mais ações da página"]'); await pag.click(".wk-menu-it:has-text('Definir como minha página inicial')");
    await pag.waitForSelector('.wk-aba:has-text("★ Trabalho")');
    await pag.click('button[aria-label="Mais ações da página"]'); await pag.click(".wk-menu-it:has-text('Mover página para a esquerda')"); await pag.waitForFunction(() => document.querySelector(".wk-aba").textContent.indexOf("Trabalho") >= 0);
    await pag.click('button[aria-label="Mais ações da página"]'); await pag.click(".wk-menu-it:has-text('Renomear')"); await pag.waitForSelector('.wk-aba:has-text("Meus atalhos")');
    await pag.click('button[aria-label="Mais ações da página"]'); await pag.click(".wk-menu-it:has-text('Arquivar página')"); await pag.waitForFunction(() => !/Meus atalhos/.test(document.querySelector(".wk-abas").textContent));
    assert.ok((await pag.evaluate(() => window.__db.workspace_paginas.find((p) => p.titulo === "Meus atalhos").arquivada_em)), "arquivada, não apagada");
    assert.equal(await pag.evaluate(() => window.__db.workspace_paginas.length), 3, "nenhuma página foi excluída");
    assert.deepEqual(await pag.evaluate(() => window.__db.escritas.filter((e) => e.indexOf("workspace_") !== 0)), []);
    assert.deepEqual(erros, []);
  } finally { await fechar(); }
});
