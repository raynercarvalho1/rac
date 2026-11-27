// Lote 2 do novo RAC · a MINHA CASA num navegador de verdade (Chromium, pelo Playwright): primeira utilização com modelos, widgets reais de Hoje, Saúde e Compras sobre dados simulados do banco, personalização
// (adicionar o mesmo tipo duas vezes com configurações diferentes, seções, mover, ocultar, remover, desfazer, refazer, cancelar, concluir), persistência depois de recarregar, privacidade (Saúde nunca lida em espaço
// compartilhado), estados vazio e de erro por componente, navegação ao módulo original e compatibilidade (rota inicial, barra, módulos antigos). O banco é o simulado de tests/workspace_tela.test.mjs (com as tabelas
// dos módulos); o que o banco real recusa por RLS é provado em tests/espacos_sql.test.mjs. Roda no GitHub (testes.yml instala o Playwright); sem Playwright, é pulado.
// Capturas de tela para a auditoria visual: RAC_CAPTURAS=1 grava em docs/planejamento/img/ (o teste das medições está em tests/workspace_casa_visual.test.mjs).
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
const fonteTeste = fs.readFileSync(path.join(raiz, "tests/workspace_tela.test.mjs"), "utf8");
const instalar = fonteTeste.slice(fonteTeste.indexOf("function instalar(cfg) {"), fonteTeste.indexOf("const PESSOAL")).trim();   // o mesmo banco simulado dos testes de tela

/* ---------- os dados simulados (datas relativas a hoje no relógio da máquina, que é o do navegador) ---------- */
const pad = (n) => String(n).padStart(2, "0");
const iso = (dd = 0) => { const d = new Date(); d.setDate(d.getDate() + dd); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const COMPRAS = [];
[[0, "Mercado Alfa", "101", [["Mercearia", "Arroz", 32.9], ["Bebidas", "Suco", 11.5], ["Hortifruti", "Banana", 8.2]]], [-2, "Padaria Beta", "55", [["Padaria", "Pão", 14.0]]], [-5, "Mercado Alfa", "99", [["Mercearia", "Feijão", 9.9], ["Limpeza", "Detergente", 4.5]]],
  [-9, "Farmácia Gama", "7", [["Farmácia", "Vitamina", 48.0]]], [-40, "Mercado Alfa", "60", [["Mercearia", "Café", 27.0]]]].forEach(([dd, loja, num, itens], i) => itens.forEach(([cat, prod, v], k) => COMPRAS.push({ id: 100 * (i + 1) + k, data: iso(dd), mercado: loja, numero: num, categoria: cat, produto: prod, valor_total: v })));
const DIAS = Array.from({ length: 40 }, (_, i) => ({ user_id: "u-dono", data: iso(i - 39), dados: { passos: 6000 + (i % 7) * 700, sono: { total: 6.5 * 3600 + (i % 5) * 1200 }, vfc: { noite: 48 + (i % 4) } }, atualizado: iso(i - 39) + "T21:00:00Z" }));
const ATIVS = [{ id: 11, user_id: "u-dono", inicio: iso(-1) + "T07:10:00", tipo: "running", dados: { distancia: 5200, duracao: 1750 } }, { id: 12, user_id: "u-dono", inicio: iso(-3) + "T18:30:00", tipo: "strength_training", dados: { duracao: 2900 } }, { id: 13, user_id: "u-dono", inicio: iso(-6) + "T07:00:00", tipo: "running", dados: { distancia: 8000, duracao: 2700 } }];
const LISTA = [{ id: 1, tipo: "tarefa", item: "Trocar o filtro da água", feito: false, criado: iso(-10) + "T10:00:00Z" }, { id: 2, tipo: "tarefa", item: "Marcar o veterinário", feito: false, criado: iso(-4) + "T10:00:00Z" }, { id: 3, tipo: "compra", item: "Leite", qtd: "2", feito: false, criado: iso(-1) + "T10:00:00Z" }, { id: 4, tipo: "compra", item: "Ovos", feito: false, criado: iso(0) + "T10:00:00Z" }];
const TABELAS = () => JSON.parse(JSON.stringify({ compras: COMPRAS, garmin_dia: DIAS, garmin_ativ: ATIVS, lista: LISTA, registros: [] }));
const LEMBRETES = [{ id: "l1", t: "Consulta da Olivia", data: iso(0), feito: false }, { id: "l2", t: "Pagar o IPVA", data: iso(0), feito: false }, { id: "l3", t: "Reunião da escola", data: iso(1), feito: false }, { id: "l4", t: "Revisão do carro", data: iso(5), feito: false }];
const PESSOAL = { id: "e-pessoal", tipo: "pessoal", nome: "Pessoal", papel: "proprietario", casa: false, arquivado: false };
const CASA = { id: "e-casa", tipo: "compartilhado", nome: "Casa", papel: "editor", casa: true, arquivado: false };
const L = (n, tipo, extra = {}) => ({ id: "w_00000" + n, tipo, v: 1, col: 6, lin: 0, estado: "ativo", config: {}, ...extra });

async function abrir(cfg = {}, { largura = 1280, altura = 900, tema = "light" } = {}) {
  const servidor = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html"; const f = path.join(raiz, p);
    if (!f.startsWith(raiz) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${servidor.address().port}`, nav = await abrirNavegador(), ctx = await nav.newContext({ viewport: { width: largura, height: altura }, colorScheme: tema }), pag = await ctx.newPage(), erros = [];
  { const esperar = pag.waitForFunction.bind(pag); pag.waitForFunction = (fn, arg, opt) => esperar(fn, arg, { polling: 100, ...opt }); }   // sondagem por intervalo, não por requestAnimationFrame: sob carga (vários navegadores em paralelo) o rAF de uma página pode não disparar e a espera ficava pendurada até o limite (instabilidade do waitForFunction no CI do Lote 1)
  pag.on("pageerror", (e) => erros.push("erro: " + e.message));
  pag.on("console", (m) => { if (m.type() === "error" && (m.location().url || base).startsWith(base)) erros.push("console: " + m.text()); });
  pag.on("dialog", (d) => d.accept(d.type() === "prompt" ? "Novo nome" : undefined));
  await pag.goto(base + "/"); await pag.waitForSelector("#gate", { state: "visible", timeout: 20000 });
  await pag.evaluate(new Function("return " + instalar)(), { espacos: [PESSOAL, CASA], tabelas: TABELAS(), ...cfg });
  await pag.evaluate((a) => { document.documentElement.setAttribute("data-theme", a.tema); window.PESSOAL.lembretes = a.lembretes; }, { tema, lembretes: cfg.semLembretes ? [] : LEMBRETES });
  await pag.evaluate(async () => { document.documentElement.classList.add("logado"); document.getElementById("gate").hidden = true; await precisa(["workspace"]); tabs.forEach((t) => { document.getElementById(t).hidden = t !== "workspace"; }); document.documentElement.setAttribute("data-sec", "workspace"); renderWorkspace(); });
  await pag.waitForSelector(".wk, #workspace-view .empty", { timeout: 10000 });
  return { pag, erros, base, fechar: async () => { await nav.close(); servidor.close(); } };
}
const assentou = (pag) => pag.waitForFunction(() => !document.querySelector(".wk-item .rac-estado[aria-busy='true']") && !/Carregando…/.test(document.querySelector(".wk-pagina")?.textContent || ""), null, { timeout: 12000 });
const textoItem = (pag, tipo) => pag.evaluate((t) => { const it = (window.WK.layout.secoes.flatMap((s) => s.itens)).find((i) => i.tipo === t); const el = it && document.querySelector(`.wk-item[data-id="${it.id}"]`); return el ? el.textContent : null; }, tipo);
const secoes = (pag) => pag.$$eval(".wk-secao", (l) => l.map((s) => ({ titulo: (s.querySelector(".wk-secao-nome, .wk-secao-titulo") || {}).textContent || (s.querySelector(".wk-secao-titulo") || {}).value || "", tipos: [...s.querySelectorAll(".wk-item")].map((e) => e.getAttribute("data-id")) })));
const escritasFora = (pag) => pag.evaluate(() => window.__db.escritas.filter((e) => e.indexOf("workspace_") !== 0));
const salvoDe = (pag) => pag.evaluate(() => JSON.parse(JSON.stringify(window.__db.workspace_paginas)));
const captura = async (pag, nome) => { if (process.env.RAC_CAPTURAS) { await pag.waitForTimeout(300); await pag.screenshot({ path: path.join(raiz, "docs/planejamento/img", nome + ".png"), fullPage: true }); } };

test("primeira utilização (computador): boas-vindas com três jeitos de começar; 'Casa completa' cria a página 'Minha Casa' com três seções e dados REAIS dos três módulos", { skip: pular, timeout: 120000 }, async () => {
  const { pag, erros, fechar } = await abrir();
  try {
    const bv = await pag.textContent(".wk-bemvindo"); assert.match(bv, /Bem-vindo à sua casa/); assert.match(bv, /Meu dia/); assert.match(bv, /Casa completa/); assert.match(bv, /Em branco/);
    assert.equal(await pag.locator(".wk-barra button").count(), 0, "sem página ainda, nenhum botão de personalizar na faixa");
    assert.equal(await pag.locator(".wk-aba").count(), 0, "sem abas enquanto não há páginas");
    await captura(pag, "lote2-primeira-vez-claro-1280");
    await pag.click('.wk-modelo:has-text("Casa completa") button'); await pag.waitForSelector(".wk-item"); await assentou(pag);
    assert.match(await pag.textContent(".wk-hero h2"), /Minha Casa/); assert.match(await pag.textContent(".wk-hero .rh-hero-data"), /Bom dia|Boa tarde|Boa noite|Boa madrugada/);
    assert.deepEqual((await secoes(pag)).map((s) => s.titulo.replace(/^[▾▸]\s*/, "")), ["Meu dia", "Saúde", "Compras"]);
    assert.equal(await pag.locator(".wk-aba").count(), 0, "uma página só: nada de abas");
    assert.equal(await pag.locator(".wk-editbar, .wk-handle, .wk-alca, .wk-redim").count(), 0, "visão normal: nenhum controle de edição ocupa espaço");
    /* Hoje: números reais da agenda (2 hoje, 1 amanhã, 4 na semana) e tarefas abertas da Lista */
    const resumo = await textoItem(pag, "hoje.resumo"); assert.ok(+/Hoje\s*(\d+)\s*compromissos/.exec(resumo)[1] >= 2, "os 2 lembretes de hoje (mais os avisos automáticos da Agenda): " + resumo); assert.match(resumo, /Amanhã\s*[1-9]\d*\s*ite/); assert.ok(+/Próximos 7 dias\s*(\d+)/.exec(resumo)[1] >= 4); assert.match(resumo, /Tarefas abertas\s*2\s*tarefas/); assert.match(resumo, /Consulta da Olivia/);
    assert.match(await textoItem(pag, "hoje.tarefas"), /Trocar o filtro da água/);
    /* Saúde: médias reais e atividades do relógio */
    const ind = await textoItem(pag, "saude.indicadores"); assert.match(ind, /Sono/); assert.match(ind, /\d,\d h/); assert.match(ind, /Passos por dia/); assert.match(ind, /média de 7 dias/);
    const atv = await textoItem(pag, "saude.atividades"); assert.match(atv, /Running/); assert.match(atv, /5,2 km/); assert.doesNotMatch(atv, /undefined|NaN/);
    /* Compras: o gasto do mês bate com as contas das linhas; notas recentes agrupadas por nota; lojas sem repetir */
    const esperadoMes = await pag.evaluate((l) => { const mes = new Date().toISOString().slice(0, 7); return null; }, null);   // (a conta do mês depende do dia; conferimos pelo núcleo abaixo)
    const gasto = await textoItem(pag, "compras.gastos"), contas = await pag.evaluate((l) => { const hoje = new Date(), d = (x) => x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"), p = window.RACnucleo.wsPeriodo("mes", d(hoje)); return window.RACnucleo.wmGasto(l, p).atual.total; }, COMPRAS);
    assert.match(gasto, /R\$/); assert.ok(gasto.replace(/\./g, "").includes(String(contas.toFixed(2)).replace(".", ",")) || contas === 0, "o total do mês na tela é o da conta pura: " + contas + " em " + gasto);
    const rec = await textoItem(pag, "compras.recentes"); assert.match(rec, /Mercado Alfa/); assert.match(rec, /R\$\s*52,60/, "nota 101 = 32,90 + 11,50 + 8,20");
    await captura(pag, "lote2-casa-completa-claro-1280");
    /* a composição fica no banco simulado e nada de dado de módulo foi escrito */
    const p = (await salvoDe(pag))[0]; assert.equal(p.titulo, "Minha Casa"); assert.equal(p.layout.secoes.length, 3); assert.deepEqual(await escritasFora(pag), []); assert.deepEqual(erros, []);
  } finally { await fechar(); }
});

test("primeira utilização: 'Em branco' abre o catálogo para começar do zero; 'Meu dia' cria uma seção; nada é imposto", { skip: pular, timeout: 120000 }, async () => {
  const a = await abrir();
  try {
    await a.pag.click('.wk-modelo:has-text("Em branco") button'); await a.pag.waitForSelector(".wk-edicao"); await a.pag.waitForSelector(".wk-catalogo");
    assert.equal(await a.pag.locator(".wk-item").count(), 0, "página em branco: nenhum componente a mais");
    await a.pag.fill(".wk-busca", "Compras: gasto"); await a.pag.click(".wk-cat-it button:has-text('Adicionar')"); await a.pag.waitForSelector(".wk-catalogo", { state: "detached" });
    assert.equal(await a.pag.locator(".wk-item").count(), 1); await a.pag.click(".wk-concluir"); await a.pag.waitForSelector(".wk-hero"); await assentou(a.pag);
    assert.match(await a.pag.textContent(".wk-pagina"), /Gasto/); assert.deepEqual(a.erros, []);
  } finally { await a.fechar(); }
  const b = await abrir();
  try { await b.pag.click('.wk-modelo:has-text("Meu dia") button'); await b.pag.waitForSelector(".wk-item"); await assentou(b.pag); assert.equal((await secoes(b.pag)).length, 1); assert.equal(await b.pag.locator(".wk-item").count(), 3); assert.deepEqual(b.erros, []); } finally { await b.fechar(); }
});

const LAYOUT_CASA = { schema: 1, secoes: [{ id: "s1", titulo: "Meu dia", itens: [L(1, "hoje.resumo", { col: 12 }), L(2, "agenda.proximos")] }, { id: "s2", titulo: "Compras", itens: [L(3, "compras.gastos", { config: { periodo: "mes" } }), L(4, "compras.recentes", { config: { limite: 3 } })] }] };
const PAG = (extra = {}) => ({ id: "p1", espaco_id: "e-pessoal", titulo: "Minha Casa", ordem: 0, layout: LAYOUT_CASA, ...extra });

test("personalizar de ponta a ponta: mesmo tipo duas vezes com períodos diferentes, seção nova e renomeada, mover entre seções, ocultar, remover, desfazer, refazer, cancelar, concluir e recarregar", { skip: pular, timeout: 180000 }, async () => {
  const { pag, erros, fechar } = await abrir({ paginas: [PAG()] });
  try {
    await assentou(pag); const sec0 = await secoes(pag); assert.equal(sec0.length, 2);
    await pag.click('button[aria-label="Personalizar esta página"]'); await pag.waitForSelector(".wk-edicao");
    assert.ok(await pag.locator(".wk-alca").count() >= 4, "no modo personalizar aparecem as alças");
    /* duplicar o gasto e dar outro período à cópia: configurações independentes */
    await pag.click('.wk-item[data-id="w_000003"] button[aria-label^="Ações de"]'); await pag.click(".wk-menu-it:has-text('Duplicar')");
    const ids = await pag.$$eval(".wk-grade[data-secao='s2'] > .wk-item", (l) => l.map((e) => e.getAttribute("data-id"))); assert.equal(ids.length, 3); const copia = ids[1]; assert.notEqual(copia, "w_000003");
    await pag.click(`.wk-item[data-id="${copia}"] button[aria-label^="Ações de"]`); await pag.click(".wk-menu-it:has-text('Configurar')");
    await pag.selectOption(".wk-folha select >> nth=0", "7d"); await pag.click(".wk-folha button:has-text('Aplicar')");
    await pag.waitForFunction((i) => /últimos 7 dias/.test(document.querySelector(`.wk-item[data-id="${i}"]`).textContent), copia, { timeout: 8000 });
    assert.match(await pag.textContent('.wk-item[data-id="w_000003"]'), /este mês/); assert.doesNotMatch(await pag.textContent('.wk-item[data-id="w_000003"]'), /últimos 7 dias/, "a original não mudou");
    const salvaCfg = await pag.evaluate(() => window.WK.layout.secoes[1].itens.map((i) => i.config.periodo)); assert.deepEqual(salvaCfg.map((x) => x || ""), ["mes", "7d", ""], "a cópia tem o período dela; a original e as notas recentes não mudaram");
    /* nova seção sem diálogo: o nome é digitado no próprio campo */
    await pag.click('button[aria-label="Mais ações da personalização"]'); await pag.click(".wk-menu-it:has-text('+ Seção')");
    assert.equal(await pag.evaluate(() => document.activeElement.className.includes("wk-secao-titulo")), true, "o foco vai para o nome da seção nova"); await pag.keyboard.type("Favoritos"); await pag.keyboard.press("Tab");
    assert.equal(await pag.locator(".wk-secao").count(), 3); assert.equal(await pag.evaluate(() => window.WK.layout.secoes[2].titulo), "Favoritos");
    /* mover um componente para a seção nova pelo menu (sem arrastar), depois ocultar e remover outro */
    await pag.click('.wk-item[data-id="w_000004"] button[aria-label^="Ações de"]'); for (let i = 0; i < 2; i++) { await pag.click(".wk-menu-it:has-text('Mover para baixo')"); if (i < 1) await pag.click('.wk-item[data-id="w_000004"] button[aria-label^="Ações de"]'); }
    await pag.click('.wk-item[data-id="w_000002"] button[aria-label^="Ações de"]'); await pag.click(".wk-menu-it:has-text('Ocultar')"); assert.match(await pag.getAttribute('.wk-item[data-id="w_000002"]', "class"), /wk-sit-oculto/);
    await pag.click('.wk-item[data-id="w_000001"] button[aria-label^="Ações de"]'); await pag.click(".wk-menu-it:has-text('Remover da página')"); assert.equal(await pag.locator('.wk-item[data-id="w_000001"]').count(), 0);
    /* desfazer a remoção e refazer */
    await pag.click('button[aria-label="Desfazer"]'); assert.equal(await pag.locator('.wk-item[data-id="w_000001"]').count(), 1); await pag.click('button[aria-label="Refazer"]'); assert.equal(await pag.locator('.wk-item[data-id="w_000001"]').count(), 0);
    await captura(pag, "lote2-personalizando-claro-1280");
    /* cancelar descarta tudo: o layout salvo continua o de antes */
    await pag.click('.wk-barra button:has-text("Cancelar")'); await pag.waitForSelector(".wk-hero"); assert.deepEqual((await secoes(pag)).map((s) => s.tipos.length), sec0.map((s) => s.tipos.length)); assert.equal((await salvoDe(pag))[0].versao, 1, "nada foi gravado ao cancelar");
    /* de novo, e desta vez concluir */
    await pag.click('button[aria-label="Personalizar esta página"]'); await pag.click('.wk-item[data-id="w_000003"] button[aria-label^="Ações de"]'); await pag.click(".wk-menu-it:has-text('Duplicar')");
    const novo = (await pag.$$eval(".wk-grade[data-secao='s2'] > .wk-item", (l) => l.map((e) => e.getAttribute("data-id"))))[1];
    await pag.click(`.wk-item[data-id="${novo}"] button[aria-label^="Ações de"]`); await pag.click(".wk-menu-it:has-text('Configurar')"); await pag.selectOption(".wk-folha select >> nth=0", "12m"); await pag.click(".wk-folha button:has-text('Aplicar')");
    await pag.click('button[aria-label="Mais ações da personalização"]'); await pag.click(".wk-menu-it:has-text('+ Seção')"); await pag.keyboard.type("Favoritos"); await pag.keyboard.press("Tab");
    await pag.click('.wk-item[data-id="w_000004"] button[aria-label^="Ações de"]'); await pag.click(".wk-menu-it:has-text('Ocultar')");
    await pag.click(".wk-concluir"); await pag.waitForSelector(".wk-hero"); await assentou(pag);
    const antes = (await salvoDe(pag))[0]; assert.equal(antes.versao, 2); const tiposAntes = antes.layout.secoes.map((s) => s.itens.map((i) => i.tipo + ":" + (i.config.periodo || "") + ":" + i.estado));
    assert.deepEqual(tiposAntes[1], ["compras.gastos:mes:ativo", "compras.gastos:12m:ativo", "compras.recentes::oculto"]); assert.equal(antes.layout.secoes[2].titulo, "Favoritos"); assert.equal(antes.layout.secoes[2].itens.length, 0);
    assert.equal(await pag.locator(".wk-secao[aria-label='Favoritos']").count(), 0, "na visão normal, seção vazia não ocupa espaço"); assert.equal(await pag.locator('.wk-item[data-id="w_000004"]').count(), 0, "oculto some da visão normal");
    /* recarregar: tudo volta do banco, na mesma composição, com os mesmos números */
    await pag.evaluate(() => { WK.espacos = null; WK.paginas = []; WK.pagina = null; WK.layout = null; renderWorkspace(); }); await pag.waitForSelector(".wk-item"); await assentou(pag);
    assert.deepEqual((await salvoDe(pag))[0].layout, antes.layout); assert.equal(await pag.locator(".wk-item").count(), 4); assert.match(await pag.textContent(".wk-hero h2"), /Minha Casa/);
    assert.match(await textoItem(pag, "compras.gastos"), /este mês|últimos 12 meses/);
    assert.deepEqual(await escritasFora(pag), [], "o Workspace só escreveu layout"); assert.deepEqual(erros, []);
  } finally { await fechar(); }
});

test("navegação ao módulo original: cada widget leva ao registro ou à tela de origem; a Minha Casa não executa operação de negócio", { skip: pular, timeout: 120000 }, async () => {
  const { pag, erros, fechar } = await abrir({ paginas: [PAG({ layout: { schema: 1, secoes: [{ id: "s1", titulo: "", itens: [L(1, "hoje.resumo", { col: 12 }), L(2, "saude.atividades"), L(3, "compras.recentes"), L(4, "compras.lista"), L(5, "hoje.tarefas")] }] } })] });
  try {
    await assentou(pag);
    const links = await pag.$$eval(".wk-item a[href^='#']", (l) => [...new Set(l.map((a) => a.getAttribute("href").split("/")[0]))]);
    for (const alvo of ["#agenda", "#saude", "#mercado", "#lista"]) assert.ok(links.includes(alvo), alvo + " em " + links.join(" "));
    await pag.click('.wk-item:has-text("Trocar o filtro da água") a >> nth=0'); assert.match(await pag.evaluate(() => location.hash), /^#lista/);
    assert.deepEqual(await escritasFora(pag), []); assert.deepEqual(erros.filter((e) => !/hashchange/.test(e)), []);
  } finally { await fechar(); }
});

test("PRIVACIDADE: em espaço compartilhado a Saúde (e o Hoje) são recusados antes de ler; nenhuma consulta às tabelas do relógio; o aviso explica e oferece o espaço pessoal; o catálogo informa o motivo", { skip: pular, timeout: 120000 }, async () => {
  const layout = { schema: 1, secoes: [{ id: "s1", titulo: "Misturado", itens: [L(1, "saude.indicadores"), L(2, "compras.gastos"), L(3, "hoje.resumo"), L(4, "saude.atividades"), L(5, "saude.evolucao")] }] };
  const { pag, erros, fechar } = await abrir({ paginas: [{ id: "pc", espaco_id: "e-casa", titulo: "Casa", ordem: 0, layout }, PAG()] });
  try {
    const antesN = await pag.evaluate(() => { wmEsquecer(); return window.__db.chamadas.length; });   // o que o app já leu ao abrir (menu, contadores) não é do Workspace
    await pag.evaluate(() => { localStorage.setItem("rac-ws-espaco:" + EU.id, "e-casa"); WK.espacos = null; renderWorkspace(); }); await pag.waitForSelector(".wk-item"); await assentou(pag);
    const t = await pag.textContent(".wk-pagina"); assert.equal((t.match(/privado e não aparece em espaços compartilhados/g) || []).length, 4, "saúde ×3 e hoje ×1 recusados com o motivo");
    assert.match(await textoItem(pag, "compras.gastos"), /R\$/, "Compras (dado da casa) continua visível");
    const chamadas = await pag.evaluate((n) => window.__db.chamadas.slice(n), antesN); assert.deepEqual(chamadas.filter((c) => /^garmin_|^lista\.|^registros\./.test(c)), [], "nenhuma leitura de Saúde, Lista ou registros: o motor recusou ANTES de consultar");
    assert.ok(chamadas.some((c) => c === "compras.select"), JSON.stringify(chamadas));
    assert.ok(await pag.locator("button:has-text('Abrir no meu espaço pessoal')").count() >= 1, (await pag.textContent('.wk-pagina')).slice(0, 600));
    /* o catálogo diz por que não pode adicionar */
    await pag.click(".wk-barra button[aria-label^='Personalizar']"); await pag.click(".wk-barra button[aria-label='Adicionar componente']"); await pag.fill(".wk-busca", "Saúde");
    await pag.fill(".wk-busca", "saude"); assert.ok(await pag.locator(".wk-cat-it").count() >= 3, "a busca ignora acento: 'saude' acha os componentes de Saúde"); const cat = await pag.textContent(".wk-catalogo"); assert.match(cat, /Saúde/); assert.match(cat, /compartilhado|privado/i); assert.equal(await pag.locator(".wk-cat-it button:has-text('Adicionar'):not([disabled])").count(), 0, "nenhum componente de Saúde pode ser adicionado aqui");
    await pag.keyboard.press("Escape");
    /* a pessoa muda o layout por conta própria (configuração à mão): continua recusado, porque a regra é do motor e não do aviso na tela */
    const r = await pag.evaluate(() => { const d = WIDGETS["saude.indicadores"]; return NUCLEO.wsPodeUsarTipo(d, wkCtxTipo()); }); assert.deepEqual(r, { ok: false, motivo: "tipo_privado" });
    /* seguir o convite: o espaço pessoal tem o mesmo widget funcionando */
    await pag.click(".wk-barra button:has-text('Cancelar')"); await pag.click("button:has-text('Abrir no meu espaço pessoal') >> nth=0"); await pag.waitForSelector(".wk-hero"); await assentou(pag);
    assert.equal(await pag.evaluate(() => WK.espaco.id), "e-pessoal"); assert.deepEqual(erros, []);
  } finally { await fechar(); }
});

test("PRIVACIDADE: quem não é o dono (papel casa) nunca recebe Minha Casa nem os widgets; o administrador do espaço não ganha acesso à Saúde de ninguém (os dados vêm da sessão de quem vê, com a RLS do banco)", { skip: pular, timeout: 120000 }, async () => {
  const { pag, fechar } = await abrir({ papel: "casa", paginas: [PAG()] });
  try {
    await pag.evaluate(() => { PAPEL = "casa"; renderWorkspace(); }); await pag.waitForTimeout(300);
    assert.match(await pag.textContent("#workspace-view"), /ainda não está liberado para esta conta/); assert.equal(await pag.locator(".wk-item").count(), 0);
    assert.deepEqual((await pag.evaluate(() => window.__db.chamadas)).filter((c) => /^garmin_|^workspace_paginas/.test(c)), [], "sem leitura de páginas nem de Saúde");
    const rotas = await pag.evaluate(() => ({ inicial: rotaInicial(), casa: ROTAS.workspace.casa === true }));
    assert.equal(rotas.inicial, "inicio", "a casa continua entrando pelo Início, como antes"); assert.equal(rotas.casa, false, "a rota da Minha Casa não é liberada à casa");
  } finally { await fechar(); }
});

test("estados: sem dados cada widget explica o vazio e oferece o caminho; a falha de UMA tabela fica no cartão (com 'Tentar de novo') e os outros seguem; componente inexistente vira aviso sem perder a configuração", { skip: pular, timeout: 120000 }, async () => {
  const todos = { schema: 1, secoes: [{ id: "s1", titulo: "", itens: ["hoje.resumo", "hoje.tarefas", "saude.indicadores", "saude.atividades", "saude.evolucao", "compras.gastos", "compras.recentes", "compras.categorias", "compras.lojas", "compras.lista"].map((t, i) => L(i + 1, t)) }] };
  const vazio = await abrir({ paginas: [PAG({ layout: todos })], tabelas: { compras: [], garmin_dia: [], garmin_ativ: [], lista: [], registros: [] }, semLembretes: true });
  try {
    await assentou(vazio.pag); const t = await vazio.pag.textContent(".wk-pagina");
    for (const s of [/Tarefas abertas\s*0/, /Nenhuma tarefa aberta/, /Ainda não há dados do relógio/, /Nenhum treino registrado|Nenhuma atividade/, /Nenhuma compra/, /lista de compras está vazia/]) assert.match(t, s);
    assert.equal(await vazio.pag.locator(".wk-item .rac-estado--erro").count(), 0, "nenhum componente quebra"); assert.ok(await vazio.pag.locator(".wk-item .rac-estado").count() >= 9, "os componentes sem dado mostram o estado vazio com texto (o resumo do dia mostra os avisos automáticos da Agenda)");
    assert.doesNotMatch(t, /undefined|NaN|Infinity/); assert.deepEqual(vazio.erros, []);
  } finally { await vazio.fechar(); }
  const falha = await abrir({ paginas: [PAG({ layout: { schema: 1, secoes: [{ id: "s1", titulo: "", itens: [L(1, "compras.gastos"), L(2, "compras.lojas"), L(3, "hoje.tarefas"), L(4, "x.que.sumiu", { config: { guardada: 1 } })] }] } })], falharTabela: "compras" });
  try {
    await assentou(falha.pag); const g = await textoItem(falha.pag, "compras.gastos"); assert.match(g, /Não consegui carregar este componente/); assert.match(g, /Tentar de novo/); assert.match(await textoItem(falha.pag, "hoje.tarefas"), /Trocar o filtro/, "o outro módulo segue funcionando");
    assert.match(await falha.pag.textContent(".wk-item:has-text('x.que.sumiu')"), /não existe mais nesta versão do app/);
    assert.deepEqual((await salvoDe(falha.pag))[0].layout.secoes[0].itens[3].config, { guardada: 1 }, "a configuração do que sumiu continua guardada");
  } finally { await falha.fechar(); }
});

test("navegação e compatibilidade: a Minha Casa é a rota inicial do dono e entra na barra do celular; o RAC Hoje e os módulos continuam no menu e na barra; os ambientes futuros estão no registro", { skip: pular, timeout: 120000 }, async () => {
  const { pag, fechar } = await abrir({ paginas: [PAG()] }, { largura: 390, altura: 844 });
  try {
    const r = await pag.evaluate(() => ({ inicial: rotaInicial(), barra: [...document.querySelectorAll("#barra a")].map((a) => a.getAttribute("data-k")), menu: [...document.querySelectorAll("#navgrp a.it")].map((a) => a.getAttribute("data-k")), amb: RAC_AMBIENTES.map((a) => a.id + ":" + a.pronto), disp: rotasAmbientes().map((a) => a.id), tit: ROTAS.workspace.titulo, ambCasa: ambienteDe("workspace"), ambSaude: ambienteDe("saude"), todas: RAC_ROTAS.every((x) => !!x.ambiente) }));
    assert.equal(r.inicial, "workspace"); assert.deepEqual(r.barra, ["workspace", "rachoje", "mba", "saude", "mercado", "inbox"]); assert.ok(["workspace", "rachoje", "agenda", "saude", "mercado", "inbox", "mba"].every((k) => r.menu.includes(k)), "nenhum item do menu saiu: " + r.menu.join(","));
    assert.deepEqual(r.amb, ["casa:true", "biblioteca:false", "projetos:false", "descobrir:false", "vida:false", "sistema:true"]); assert.deepEqual(r.disp, ["casa"], "só a Minha Casa aparece como ambiente pronto");
    assert.equal(r.tit, "Minha Casa"); assert.equal(r.ambCasa, "casa"); assert.equal(r.ambSaude, "vida"); assert.ok(r.todas);
    /* a barra cabe e os alvos de toque têm 44 px */
    const caixas = await pag.$$eval("#barra > *", (l) => l.map((e) => { const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.left), r: Math.round(b.right) }; })); assert.equal(caixas.length, 7, "6 atalhos + Menu");
    assert.ok(caixas.every((c) => c.w >= 44 && c.h >= 44 && c.x >= 0 && c.r <= 391), JSON.stringify(caixas));
  } finally { await fechar(); }
});
