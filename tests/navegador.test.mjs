// Teste de fumaça num navegador de verdade (Chromium, pelo Playwright): o site abre, mostra a tela de entrada,
// todos os módulos de js/ carregam e nada dá erro no console. Pega o que os testes de Node não veem
// (erro que só acontece no navegador, módulo que não carrega, biblioteca de CDN fora do ar).
// Roda no GitHub (testes.yml instala o Playwright); no computador, sem o Playwright instalado, é pulado.
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
/* no GitHub o Playwright tem que estar lá: se faltar, o teste falha em vez de ser pulado sem ninguém ver */
test("no GitHub, o navegador do teste está instalado", { skip: !process.env.CI }, () => assert.ok(pw, "Playwright não foi instalado no testes.yml"));
/* no computador, onde o Chromium do Playwright pode ser bloqueado pelo Windows: RAC_CHROMIUM=<caminho de um Chrome ou Edge> */
const abrirNavegador = () => pw.chromium.launch(process.env.RAC_CHROMIUM ? { executablePath: process.env.RAC_CHROMIUM } : {});
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json" };

test("o site abre no navegador, todos os módulos carregam e nada dá erro", { skip: pular, timeout: 90000 }, async () => {
  const servidor = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const f = path.join(raiz, p);
    if (!f.startsWith(raiz) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const nav = await abrirNavegador();
  try {
    const pag = await nav.newPage(), erros = [];
    pag.on("pageerror", (e) => erros.push("erro: " + e.message));
    /* falha de rede de sites de fora (CDN, APIs) não é defeito do site; erro do próprio site é */
    pag.on("console", (m) => { if (m.type() === "error" && (m.location().url || base).startsWith(base)) erros.push("console: " + m.text()); });
    await pag.goto(base + "/");
    await pag.waitForSelector("#gate", { state: "visible", timeout: 20000 });
    const mods = fs.readdirSync(path.join(raiz, "js")).filter((f) => f.endsWith(".js") && f !== "app.js").map((f) => f.slice(0, -3));
    const r = await pag.evaluate((l) => precisa(l).then(() => "ok", (e) => "falhou: " + e.message), mods);
    assert.equal(r, "ok", "todos os módulos de js/ carregam");
    await pag.waitForTimeout(1500);
    assert.deepEqual(erros, [], "nenhum erro no navegador");
  } finally {
    await nav.close();
    servidor.close();
  }
});

// Interface do RAC Intelligence na fase só de demonstração, num navegador de verdade. O teste não tem login: as respostas
// do servidor (DEMO) e do banco (só leitura) são simuladas dentro da página, só para conferir o que a tela faz com elas.
test("IA: DEMO só na prévia, REAL vai à conferência com o texto certo, e o Sistema não oferece trocar o modo", { skip: pular, timeout: 90000 }, async () => {
  const servidor = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const f = path.join(raiz, p);
    if (!f.startsWith(raiz) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const nav = await abrirNavegador();
  try {
    const pag = await nav.newPage(), erros = [];
    pag.on("pageerror", (e) => erros.push("erro: " + e.message));
    await pag.goto(base + "/");
    await pag.waitForSelector("#gate", { state: "visible", timeout: 20000 });
    const r = await pag.evaluate(async () => {
      const espera = (ms) => new Promise((ok) => setTimeout(ok, ms)), out = { ligada: iaLigada(), soDemo: typeof IA_SO_DEMO };
      let realChamado = false;
      SB = { functions: { invoke: () => Promise.resolve({ error: null, data: { ok: true, versao: 1, modo: "DEMO", estado: "demo", mensagem: "DEMONSTRAÇÃO", avisos: [],
        resultado: { veiculo: "moto", km: 0, litros: 1, total: 1, posto: "POSTO DEMONSTRAÇÃO", _demo: true } } }) } };
      const el = iaBotao({ modulo: "abastecimento", acao: "abastecimento.interpretar", texto: "x", real: () => { realChamado = true; } });
      document.body.appendChild(el);
      el.querySelector("input[type=text]").value = "1 litro a 1,00";
      el.querySelector("button").click();
      await espera(400);
      Object.assign(out, { previa: !!el.querySelector(".iaprevia"), botoesNaPrevia: el.querySelectorAll(".iaprevia button").length, realChamado, textoBotao: el.textContent });
      /* resposta REAL (simulada aqui, sem rede): vai para a conferência e o texto diz REAL */
      let realRecebido = null;
      SB = { functions: { invoke: () => Promise.resolve({ error: null, data: { ok: true, versao: 1, modo: "REAL", estado: "concluido", mensagem: "Confira os dados antes de salvar.", avisos: [],
        resultado: { veiculo: "moto", km: 18240, litros: 6.1, preco_litro: 6.29, total: 38.37, combustivel: "gasolina", posto: "", alertas: [] }, consumo: { mes: { percentual: 1, alerta: 0 } } } }) } };
      const el2 = iaBotao({ modulo: "abastecimento", acao: "abastecimento.interpretar", texto: "x", real: (res) => { realRecebido = res; } });
      document.body.appendChild(el2);
      el2.querySelector("input[type=text]").value = "6,1 litros a 6,29";
      el2.querySelector("button").click();
      await espera(400);
      Object.assign(out, { realKm: realRecebido && realRecebido.km, statusReal: el2.querySelector("[role=status]").textContent, previaReal: !!el2.querySelector(".iaprevia") });
      await precisa(["sistema"]);
      const tabela = (d) => { const q = { select: () => q, in: () => q, order: () => q, limit: () => q, eq: () => q, gte: () => q, range: () => q, maybeSingle: () => q, then: (ok, no) => Promise.resolve({ data: d, error: null, count: Array.isArray(d) ? d.length : null }).then(ok, no) }; return q; };
      const dados = { ia_config: { modo: "REAL", acoes_reais: ["abastecimento.interpretar"], acoes_reais_casa: [], limite_brl: 50, cambio_brl_usd: 6, margem_impostos: 0.12, margem_seguranca: 0.1 }, ia_precos: [], ia_uso: [], ia_cobranca: [] };
      SB = { rpc: () => Promise.resolve({ error: null, data: { mes: "2026-10-01", teto_usd: 6.696429, comprometido_usd: 0, estimado_usd: 0, reservado_aberto_usd: 0, por_modulo: {}, por_estado: {} } }), from: (t) => tabela(dados[t]) };
      PAPEL = "dono"; EU = { id: "teste" };
      const painel = sisIA(); document.body.appendChild(painel);
      await espera(400);
      /* conferência de uma incerta (dados de mentira): inválido não chama o banco; válido chama uma vez */
      const recs = [], antes = Date.now() - 30 * 60000;
      dados.ia_uso = [{ id: "teste-incerta", mes: "2026-10-01", criado_em: new Date(antes).toISOString(), enviado_em: new Date(antes).toISOString(), modulo: "abastecimento", acao: "abastecimento.interpretar", modelo: "claude-haiku-5-5", estado: "incerto", reservado_usd: 0.0026, erro_codigo: "tempo_esgotado" }];
      const rpcTotais = SB.rpc; SB.rpc = (n, a) => { if (n === "ia_reconciliar") { recs.push(a); return Promise.resolve({ error: null, data: false }); } return rpcTotais(n, a); };
      const painel2 = sisIA(); document.body.appendChild(painel2); await espera(400);
      const li = [...painel2.querySelectorAll("h3")].find((x) => /conferir/.test(x.textContent)).parentElement.querySelector("li");
      const botao = (t) => [...li.querySelectorAll("button")].find((b) => b.textContent === t);
      botao("Foi cobrada").click(); await espera(30);
      const campoVazio = li.querySelector("input").value === "";
      li.querySelector("input").value = "abc"; botao("Confirmar").click(); await espera(30);
      const recsInvalido = recs.length;
      li.querySelector("input").value = "0,0021"; botao("Confirmar").click(); await espera(100);
      Object.assign(out, { campoVazio, recsInvalido, recs, msgConf: li.querySelector("p.sub").textContent });
      /* custos por mês (dados de mentira): barras com racDica e mês sem cobrança "não conferido" */
      const custos = [...painel2.querySelectorAll("details")].find((x) => /Custos por mês/.test(x.querySelector("summary").textContent));
      const custosAntes = custos.querySelectorAll(".hbars .hb").length; custos.open = true; await espera(300);
      Object.assign(out, { custosAntes, barras: custos.querySelectorAll(".hbars .hb").length, custosTexto: custos.textContent });
      return Object.assign(out, { painel: painel.textContent, botoesPainel: [...painel.querySelectorAll("button")].map((b) => b.textContent) });
    });
    assert.equal(r.ligada, true); assert.equal(r.soDemo, "undefined", "sem marca de modo no site");
    assert.ok(r.previa, "a resposta DEMO aparece na prévia"); assert.equal(r.botoesNaPrevia, 0, "a prévia não tem botão (nem de salvar)");
    assert.equal(r.realChamado, false, "resposta DEMO nunca chega à conferência que salva");
    assert.match(r.textoBotao, /DEMONSTRAÇÃO: resposta simulada, nada foi cobrado nem salvo/);
    assert.equal(r.realKm, 18240, "a resposta REAL chega à conferência"); assert.equal(r.previaReal, false, "REAL não mostra a prévia de demonstração");
    assert.match(r.statusReal, /^REAL · lido pelo Claude/); assert.match(r.statusReal, /nada foi gravado ainda/);
    assert.match(r.painel, /não pode ser trocado pelo site/); assert.match(r.painel, /Limite do mês/); assert.match(r.painel, /Modo\s*REAL/);
    assert.match(r.painel, /Abastecimento REAL \(só o dono; a casa em DEMO\)/);
    assert.equal(r.campoVazio, true, "o valor da conferência começa vazio"); assert.equal(r.recsInvalido, 0, "valor inválido não vai ao banco");
    assert.deepEqual(r.recs, [{ p_id: "teste-incerta", p_cobrado: true, p_valor_usd: 0.0021 }]); assert.match(r.msgConf, /não pode mais ser conferida/);
    assert.equal(r.custosAntes, 0, "custos só carregam quando a seção é aberta"); assert.equal(r.barras, 2, "um mês: barra do RAC e barra do Console"); assert.match(r.custosTexto, /não conferido/); assert.match(r.painel, /Nota do mercado DEMO \(fixo nesta fase\)/);
    assert.ok(!r.botoesPainel.some((b) => /modo REAL|Voltar para DEMO/i.test(b)) && !/Ligar o modo REAL/.test(r.painel), "nenhum botão de trocar o modo: " + r.botoesPainel.join(", "));
    assert.deepEqual(erros, [], "nenhum erro no navegador");
  } finally {
    await nav.close();
    servidor.close();
  }
});

// Newsletter num navegador de verdade, na tela do iPhone (375 px), com as notícias FICTÍCIAS de tests/fixtures/newsletter
// (datas trazidas para agora). Sem login e sem rede de fora: o banco e a IA são simulados dentro da página.
// Confere: destaques, link original, fonte e hora, guardar, busca e filtros, prévia DEMO sem salvar, conferência REAL
// simulada (só o toque em Salvar grava, e a mesma edição não chama a IA de novo), sem rolagem lateral e sem internet.
// Com NL_PRINTS=<pasta>, guarda as telas (evidência visual).
test("Newsletter: 375 px, destaques com link original, guardar, busca, IA DEMO só na prévia, REAL só salva no toque e funciona sem internet", { skip: pular, timeout: 120000 }, async () => {
  const fixt = JSON.parse(fs.readFileSync(path.join(raiz, "tests/fixtures/newsletter/newsletter.json"), "utf8"));
  const desloc = Date.now() - 20 * 60e3 - Date.parse(fixt.coletado), mover = (iso) => iso && new Date(Date.parse(iso) + desloc).toISOString();
  const dadosNl = { ...fixt, coletado: mover(fixt.coletado), edicao: { ...fixt.edicao, data: new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10) },
    grupos: fixt.grupos.map((g) => ({ ...g, d: mover(g.d), d0: mover(g.d0), itens: g.itens && g.itens.map((i) => ({ ...i, d: mover(i.d) })) })) };
  const servidor = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p === "/newsletter.json") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(dadosNl)); return; }
    if (p.endsWith("/")) p += "index.html";
    const f = path.join(raiz, p);
    if (!f.startsWith(raiz) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => servidor.listen(0, ok));
  /* "localhost" para o service worker registrar (ele exige https ou localhost) */
  const base = `http://localhost:${servidor.address().port}`, prints = process.env.NL_PRINTS;
  const nav = await abrirNavegador();
  try {
    const ctx = await nav.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const pag = await ctx.newPage(), erros = [];
    pag.on("pageerror", (e) => erros.push("erro: " + e.message));
    pag.on("console", (m) => { if (m.type() === "error" && (m.location().url || base).startsWith(base)) erros.push("console: " + m.text()); });
    pag.on("dialog", (d) => d.dismiss());
    const foto = async (nome) => { if (prints) await pag.screenshot({ path: path.join(prints, nome + ".png"), fullPage: false }); };
    /* banco e IA de mentira, dentro da página (o site chama SB.from(...) e SB.functions.invoke) */
    const preparar = () => pag.evaluate(() => {
      const reg = (window.__nl = window.__nl || { chamadas: [], gravacoes: [], modo: "DEMO" });
      const tabela = (nome) => { const q = { _op: "select", select: () => q, eq: () => q, order: () => q, limit: () => q, gte: () => q, lte: () => q,
        maybeSingle: () => q, insert: (v) => { q._op = "insert"; reg.gravacoes.push({ nome, op: "insert", v }); return q; },
        update: (v) => { q._op = "update"; reg.gravacoes.push({ nome, op: "update", v }); return q; },
        upsert: (v, o) => { q._op = "upsert"; reg.gravacoes.push({ nome, op: "upsert", v, o }); return q; },
        then: (ok, no) => Promise.resolve({ data: q._op === "select" ? (nome === "pessoal" ? [] : null) : [{}], error: null }).then(ok, no) }; return q; };
      SB = { from: tabela, functions: { invoke: (n, o) => { const b = o.body, ids = [...b.entrada.texto.matchAll(/<grupo id="(g[0-9a-f]{10})"/g)].map((m) => m[1]);
        reg.chamadas.push(b);
        const resultado = { resumo_dia: (reg.modo === "DEMO" ? "DEMONSTRAÇÃO: " : "") + "Resumo de teste do dia.", destaques: ids.slice(0, 5).map((id, i) => ({ id, titulo: "Destaque " + (i + 1), resumo: "Resumo do destaque " + (i + 1) + ".", relevancia: "Teste." })), categorias: [] };
        if (reg.modo === "DEMO") resultado._demo = true;
        return Promise.resolve({ error: null, data: { ok: true, versao: 1, id: reg.modo === "DEMO" ? null : "uso-teste-1", modo: reg.modo, estado: reg.modo === "DEMO" ? "demo" : "concluido", mensagem: "", avisos: [], resultado,
          consumo: { modelo: reg.modo === "DEMO" ? "nenhum (demonstração)" : "claude-haiku-5-5", mes: { percentual: 1, alerta: 0 } } } }); } } };
      PAPEL = "dono"; EU = { id: "dono-teste" }; PESSOAL = {};
      document.documentElement.classList.add("logado"); document.getElementById("gate").hidden = true;
    });
    /* troca o endereço (o site redesenha pelo hashchange); se já estiver nele, redesenha direto */
    const abrir = async (hash) => { await pag.evaluate((h) => { if (location.hash === h) route(); else location.hash = h; }, hash); await pag.waitForTimeout(150); };
    const botaoIA = () => pag.evaluate(() => [...document.querySelectorAll("#newsletter-view button")].find((x) => /Resumir com IA/.test(x.textContent)).click());
    await pag.goto(base + "/");
    await pag.waitForSelector("#gate", { state: "visible", timeout: 20000 });
    await pag.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await pag.reload(); await pag.waitForSelector("#gate", { state: "visible", timeout: 20000 });
    await preparar();

    /* Hoje */
    await abrir("#newsletter");
    await pag.waitForSelector("#newsletter-view .nlcard", { timeout: 20000 });
    await foto("1-hoje");
    const hoje = await pag.evaluate(() => {
      const pd = [...document.querySelectorAll("#newsletter-view .panel")].find((p) => p.querySelector("h2")?.textContent === "Destaques");
      const cards = [...pd.querySelectorAll(".nlcard")];
      return { n: cards.length, links: cards.map((c) => c.querySelector(".nltit a")).map((a) => [a.href, a.target, a.rel]),
        metas: cards.map((c) => c.querySelector(".nlmeta").textContent), fontes: [...document.querySelectorAll("#newsletter-view .vp.hib")].map((x) => x.textContent),
        largura: document.documentElement.scrollWidth, tela: innerWidth, abas: [...document.querySelectorAll(".nltabs a")].map((a) => a.textContent),
        secoes: document.querySelectorAll("#newsletter-view details.nlsec").length, resumo: document.querySelector(".nlresumo").textContent,
        menu: !!document.querySelector('.side a.it[data-k="newsletter"]'), atual: document.querySelector(".nlatual").textContent };
    });
    assert.ok(hoje.n >= 5 && hoje.n <= 10, "destaques: " + hoje.n);
    for (const [href, alvo, rel] of hoje.links) { assert.match(href, /^https:\/\//); assert.equal(alvo, "_blank"); assert.match(rel, /noopener/); }
    for (const m of hoje.metas) assert.match(m, /^.+ · \d{2}\/\d{2} · \d{2}:\d{2}$/, "veículo, data e hora: " + m);
    assert.ok(hoje.fontes.some((t) => /^\d+ fontes$/.test(t)), "quantas fontes cobriram");
    assert.ok(hoje.largura <= hoje.tela, `sem rolagem lateral em 375 px (${hoje.largura} > ${hoje.tela})`);
    assert.deepEqual(hoje.abas, ["Hoje", "Buscar", "Guardadas", "Edições", "Semana", "Ajustes"]);
    assert.ok(hoje.secoes >= 7, "seções por categoria"); assert.match(hoje.resumo, /destaques em \d+ categorias/); assert.ok(hoje.menu, "item no menu");
    assert.match(hoje.atual, /12 de 14 fontes/);
    /* cabeçalho em 375 px: o título inteiro, sem passar por baixo de Voltar e Início (que ficam só com o ícone nesta página) */
    const cabecalho = () => pag.evaluate(() => {
      const r = (el) => el.getBoundingClientRect(), t = document.getElementById("ptitle"), v = document.getElementById("voltarbtn"), i = document.getElementById("homebtn");
      const vis = [v, i].filter((b) => !b.hidden);
      return { titulo: t.textContent, cortado: t.scrollWidth > t.clientWidth + 1, direita: r(t).right, botoes: vis.map((b) => ({ esq: r(b).left, dir: r(b).right, texto: b.textContent.trim(), fonte: parseFloat(getComputedStyle(b).fontSize) })),
        largura: document.documentElement.scrollWidth };
    });
    const cab = await cabecalho();
    assert.equal(cab.titulo, "Newsletter"); assert.equal(cab.cortado, false, "título inteiro");
    assert.equal(cab.botoes.length, 2, "Voltar e Início continuam na tela");
    for (const b of cab.botoes) { assert.ok(b.esq >= cab.direita, `o botão ${b.texto} não cobre o título (${b.esq} < ${cab.direita})`); assert.ok(b.dir <= 375, "dentro da tela"); }
    assert.deepEqual(cab.botoes.map((b) => b.texto), ["Voltar", "Início"], "o nome dos botões continua para leitores de tela");
    assert.ok(cab.largura <= 375);
    const grav = await pag.evaluate(() => window.__nl.gravacoes.filter((g) => g.nome === "newsletter_edicoes"));
    assert.equal(grav.length, 1); assert.equal(grav[0].op, "insert"); assert.equal(grav[0].v.origem, "regras", "a edição de regras do turno vai para o histórico");
    assert.ok(["manha", "tarde", "noite"].includes(grav[0].v.turno) && grav[0].v.conteudo.turno === grav[0].v.turno, "com o turno da edição");

    /* Guardar e tirar (PESSOAL.salvos) */
    const guard = await pag.evaluate(() => {
      const b = [...document.querySelectorAll("#newsletter-view .nlcard button")].find((x) => x.textContent === "Guardar");
      b.click(); const depois = { texto: b.textContent, salvos: JSON.parse(JSON.stringify(PESSOAL.salvos)) };
      b.click(); return { ...depois, fim: PESSOAL.salvos.length, texto2: b.textContent };
    });
    assert.equal(guard.texto, "✓ Guardada"); assert.equal(guard.salvos.length, 1); assert.equal(guard.salvos[0].tipo, "noticia");
    assert.match(guard.salvos[0].u, /^https:\/\//); assert.ok(guard.salvos[0].tema && guard.salvos[0].f);
    assert.equal(guard.fim, 0); assert.equal(guard.texto2, "Guardar");

    /* IA em DEMO: só prévia, sem botão de salvar e sem gravar */
    await botaoIA();
    await pag.waitForSelector(".nlprevia", { timeout: 5000 });
    await pag.evaluate(() => document.querySelector(".iabox").scrollIntoView());
    await foto("2-ia-demo");
    const demo = await pag.evaluate(() => ({ previa: document.querySelector(".nlprevia").textContent, botoes: [...document.querySelectorAll(".nlprevia button")].map((b) => b.textContent),
      status: document.querySelector(".iabox [role=status]").textContent, gravIa: window.__nl.gravacoes.filter((g) => g.v && g.v.origem === "ia").length, chave: window.__nl.chamadas[0].idempotencia }));
    assert.match(demo.previa, /DEMONSTRAÇÃO · resumo simulado/); assert.match(demo.previa, /Fontes usadas: /);
    assert.ok(!demo.botoes.includes("Salvar edição"), "DEMO não tem salvar"); assert.equal(demo.gravIa, 0);
    assert.match(demo.status, /^DEMONSTRAÇÃO: resumo simulado, nada foi cobrado nem salvo/);
    assert.match(demo.chave, /^nl-\d{4}-\d{2}-\d{2}-[0-9a-f]{8}$/, "chave da edição");

    /* REAL (simulado): prévia com Salvar; só o toque grava; tocar de novo não chama a IA */
    await pag.evaluate(() => { window.__nl.modo = "REAL"; });
    await botaoIA();
    await pag.waitForFunction(() => [...document.querySelectorAll(".nlprevia button")].some((b) => b.textContent === "Salvar edição"), null, { timeout: 5000 });
    await pag.evaluate(() => document.querySelector(".iabox").scrollIntoView());
    await foto("3-ia-real-conferencia");
    assert.equal(await pag.evaluate(() => window.__nl.gravacoes.filter((g) => g.v && g.v.origem === "ia").length), 0, "nada gravado antes do toque em Salvar");
    await pag.evaluate(() => [...document.querySelectorAll(".nlprevia button")].find((b) => b.textContent === "Salvar edição").click());
    await pag.waitForFunction(() => /Edição salva/.test(document.querySelector(".nlprevia").textContent), null, { timeout: 5000 });
    const real = await pag.evaluate(() => { const g = window.__nl.gravacoes.find((x) => x.v && x.v.origem === "ia"), ch = window.__nl.chamadas;
      return { tabela: g.nome, op: g.op, uso: g.v.ia_uso_id, chave: g.v.chave, chamada: ch[ch.length - 1].idempotencia, modelo: g.v.modelo, o: g.o, n: ch.length, links: g.v.conteudo.destaques.map((d) => d.u) }; });
    assert.equal(real.tabela, "newsletter_edicoes"); assert.equal(real.op, "upsert"); assert.equal(real.uso, "uso-teste-1");
    assert.equal(real.chave, real.chamada, "a chave salva é a da chamada (o banco confere em ia_uso)"); assert.equal(real.modelo, "claude-haiku-5-5");
    assert.deepEqual(real.o, { onConflict: "dono,data,turno" }); assert.ok(real.links.every((u) => /^https:\/\//.test(u)));
    await botaoIA();
    assert.equal(await pag.evaluate(() => window.__nl.chamadas.length), real.n, "a mesma edição não chama a IA de novo (resultado guardado no aparelho)");

    /* Busca e filtros */
    await abrir("#newsletter/busca");
    await pag.waitForSelector("#newsletter-view input[type=search]");
    await pag.fill("#newsletter-view input[type=search]", "bicicletas");
    await pag.waitForFunction(() => /^1 notícia$/.test(document.querySelector("#newsletter-view [role=status]").textContent), null, { timeout: 5000 });
    await foto("4-busca");
    const status = () => pag.evaluate(() => document.querySelector("#newsletter-view [role=status]").textContent);
    await pag.selectOption("#newsletter-view select[aria-label=Tipo]", "opiniao");
    assert.match(await status(), /Nada encontrado/, "bicicletas + opinião: nada");
    await pag.fill("#newsletter-view input[type=search]", "");
    await pag.waitForFunction(() => document.querySelector("#newsletter-view [role=status]").textContent === "2 notícias", null, { timeout: 5000 }).catch(() => {});
    assert.equal(await status(), "2 notícias", "só as opiniões");
    assert.ok(await pag.evaluate(() => document.documentElement.scrollWidth <= 375));

    /* Ajustes */
    await abrir("#newsletter/ajustes"); await pag.waitForSelector(".nlpesos select");
    await foto("5-ajustes");
    assert.equal(await pag.evaluate(() => document.querySelectorAll(".nlpesos select").length), 8);
    assert.ok(await pag.evaluate(() => document.documentElement.scrollWidth <= 375));

    /* as outras páginas mantêm o cabeçalho de sempre (Voltar e Início com o texto à mostra) */
    await abrir("#estudos"); await pag.waitForTimeout(200);
    const outra = await cabecalho();
    assert.ok(outra.botoes.length >= 1 && outra.botoes.every((b) => b.fonte >= 12), "texto dos botões visível fora da Newsletter: " + JSON.stringify(outra.botoes));

    /* Início: cartão com os destaques */
    await abrir("#inicio");
    await pag.waitForFunction(() => { const p = [...document.querySelectorAll(".hgrid .panel")].find((x) => x.querySelector("h2")?.textContent === "Newsletter"); return p && p.querySelectorAll(".wl li").length >= 1; }, null, { timeout: 10000 });

    /* sem internet: a página e a edição abrem do que o service worker guardou */
    await ctx.setOffline(true);
    await pag.reload(); await pag.waitForSelector("#gate", { state: "visible", timeout: 20000 });
    await preparar();
    await abrir("#newsletter");
    await pag.waitForSelector("#newsletter-view .nlcard", { timeout: 20000 });
    await foto("6-sem-internet");
    const off = await pag.evaluate(() => ({ online: navigator.onLine, atual: document.querySelector(".nlatual").textContent, n: document.querySelectorAll("#newsletter-view .nlcard").length }));
    assert.equal(off.online, false); assert.match(off.atual, /sem internet: esta é a edição guardada neste aparelho/); assert.ok(off.n >= 5);
    await ctx.setOffline(false);
    /* falha de rede de serviços de fora (ESPN, MLB, tempo: o Início abre os cartões deles) não é defeito do site */
    assert.deepEqual(erros.filter((e) => !/Failed to load resource|ERR_INTERNET_DISCONNECTED|net::|Access to fetch at 'https:\/\/(?!localhost)/.test(e)), [], "nenhum erro no navegador");
  } finally {
    await nav.close();
    servidor.close();
  }
});

// Central de Segurança num iPhone (375 px), sem login: o banco e o Auth são simulados dentro da página.
// Confere os quadros, o backup em JSON sem segredos, a prévia da restauração sem gravar nada, a gravação só depois
// do confirm (e só com insert), o cadastro do app autenticador e o código pedido no login.
test("Segurança: 375 px, backup sem segredos, restauração com prévia e confirmação, MFA e o código no login", { skip: pular, timeout: 90000 }, async () => {
  const servidor = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const f = path.join(raiz, p);
    if (!f.startsWith(raiz) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const nav = await abrirNavegador();
  try {
    const ctx = await nav.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const pag = await ctx.newPage(), erros = [], dialogos = [];
    pag.on("pageerror", (e) => erros.push("erro: " + e.message));
    pag.on("console", (m) => { if (m.type() === "error" && (m.location().url || base).startsWith(base)) erros.push("console: " + m.text()); });
    pag.on("dialog", (d) => { dialogos.push(d.message()); d.accept(); });
    await pag.goto(base + "/");
    await pag.waitForSelector("#gate", { state: "visible", timeout: 20000 });
    await pag.evaluate(() => {
      const reg = (window.__seg = { gravacoes: [], mfa: [], baixados: [], fatores: [],
        banco: { lista: [{ id: "l1", user_id: "dono-teste", item: "Arroz", feito: false }, { id: "l2", user_id: "dono-teste", item: "Café", feito: false }],
          pessoal: [{ user_id: "dono-teste", chave: "mba", valor: { a: 1 } }, { user_id: "dono-teste", chave: "atalho", valor: { hash: "segredo" } }] } });
      const tabela = (nome) => { const q = { _op: "select", select: () => q, eq: () => q, order: () => q, limit: () => q, range: () => q,
        insert: (v) => { q._op = "insert"; reg.gravacoes.push({ nome, op: "insert", v }); return q; },
        upsert: (v) => { q._op = "upsert"; reg.gravacoes.push({ nome, op: "upsert", v }); return q; },
        then: (ok, no) => Promise.resolve(q._op === "select" ? { data: (reg.banco[nome] || []).map((x) => ({ ...x })), error: null } : { data: null, error: null }).then(ok, no) }; return q; };
      SB = { from: tabela, rpc: () => Promise.resolve({ data: { aal: "aal1", fatores: 0, sem_rls: [], anon_le: [], sem_trava_mfa: [], cofres_publicos: [], funcoes_abertas: [], conferido: new Date().toISOString() }, error: null }),
        auth: { mfa: { listFactors: () => Promise.resolve({ data: { all: reg.fatores, totp: reg.fatores } }),
          getAuthenticatorAssuranceLevel: () => Promise.resolve({ data: { currentLevel: "aal1", nextLevel: reg.fatores.length ? "aal2" : "aal1" } }),
          enroll: (o) => { reg.mfa.push(["enroll", o]); return Promise.resolve({ data: { id: "f1", totp: { qr_code: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'/>", secret: "JBSWY3DPEHPK3PXP" } } }); },
          challengeAndVerify: (o) => { reg.mfa.push(["verify", o]); reg.fatores = [{ id: o.factorId, factor_type: "totp", status: "verified", friendly_name: "Celular 1", created_at: new Date().toISOString() }]; return Promise.resolve({ data: {}, error: null }); },
          unenroll: (o) => { reg.mfa.push(["unenroll", o]); return Promise.resolve({ data: {}, error: null }); } } },
        storage: { from: () => ({ list: () => Promise.resolve({ data: [{ name: "2026-10-25.json", metadata: { size: 52000 } }], error: null }) }) } };
      PAPEL = "dono"; EU = { id: "dono-teste", email: "teste@exemplo.invalid" }; PESSOAL = {};
      document.documentElement.classList.add("logado"); document.getElementById("gate").hidden = true;
      location.hash = "#seguranca";
    });
    await pag.waitForSelector("#seguranca-view h2", { timeout: 20000 });
    const paineis = await pag.evaluate(() => [...document.querySelectorAll("#seguranca-view h2")].map((x) => x.textContent));
    assert.deepEqual(paineis, ["Proteção da conta", "Entrar com Face ID", "Verificação em duas etapas", "Backup e exportação", "Restaurar um backup", "Histórico de backups", "Auditoria", "Se perder o acesso"]);
    const largura = await pag.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(largura <= 375, "sem rolagem para o lado no iPhone (" + largura + " px)");

    /* backup em JSON: formato 2, sem a chave dos atalhos */
    await pag.evaluate(() => { baixarArquivo = (b, n) => { __seg.baixados.push({ n, b }); }; [...document.querySelectorAll("#seguranca-view button")].find((b) => /Baixar backup \(JSON\)/.test(b.textContent)).click(); });
    await pag.waitForFunction(() => __seg.baixados.length === 1, null, { timeout: 5000 });
    const bk = await pag.evaluate(async () => ({ nome: __seg.baixados[0].n, txt: await __seg.baixados[0].b.text() }));
    const j = JSON.parse(bk.txt);
    assert.match(bk.nome, /^rac-backup-\d{4}-\d{2}-\d{2}\.json$/);
    assert.equal(j.formato, "rac-backup"); assert.deepEqual(j.tabelas.pessoal.map((r) => r.chave), ["mba"]); assert.ok(!/segredo/.test(bk.txt));
    assert.match(j.resumo.lista.sha256, /^[0-9a-f]{64}$/);

    /* restauração: o Arroz sumiu e o Café mudou. A prévia não grava nada; depois do confirm, só o insert do Arroz */
    await pag.evaluate(() => { __seg.banco.lista = [{ id: "l2", user_id: "dono-teste", item: "Café", feito: true }]; __seg.gravacoes.length = 0; });
    await pag.setInputFiles("#seguranca-view input[type=file]", { name: "backup.json", mimeType: "application/json", buffer: Buffer.from(bk.txt) });
    await pag.waitForSelector(".segprev table", { timeout: 5000 });
    const prev = await pag.evaluate(() => ({ txt: document.querySelector(".segprev").innerText, n: __seg.gravacoes.length,
      botao: [...document.querySelectorAll(".segprev button")].map((b) => b.textContent) }));
    assert.equal(prev.n, 0, "a prévia não grava nada");
    assert.match(prev.txt, /estrutura e assinaturas conferidas/); assert.ok(prev.botao.includes("Gravar 1 linha"));
    await pag.evaluate(() => { document.querySelector(".segprev input[type=checkbox]").click(); [...document.querySelectorAll(".segprev button")].find((b) => /^Gravar/.test(b.textContent)).click(); });
    await pag.waitForFunction(() => /Restaurado/.test(document.querySelector(".segprev [role=status]").textContent), null, { timeout: 5000 });
    const grav = await pag.evaluate(() => __seg.gravacoes.map((g) => [g.nome, g.op, Array.isArray(g.v) ? g.v.map((x) => x.id) : g.v.tipo]));
    assert.ok(dialogos.some((d) => /nada é apagado/.test(d) && /nenhuma linha de hoje é alterada/.test(d)), "pediu confirmação");
    assert.deepEqual(grav, [["lista", "insert", ["l1"]], ["seguranca_eventos", "insert", "restauracao"]]);

    /* MFA: cadastrar o app (QR code + código) e, no login, o código antes de entrar */
    await pag.evaluate(() => renderSeguranca());
    await pag.waitForSelector("#seguranca-view h2");
    await pag.evaluate(() => [...document.querySelectorAll("#seguranca-view button")].find((b) => /Ativar a verificação/.test(b.textContent)).click());
    await pag.waitForSelector(".segqr img");
    await pag.fill("#seguranca-view form.iabox input", "123456");
    await pag.evaluate(() => document.querySelector("#seguranca-view form.iabox").requestSubmit());
    await pag.waitForFunction(() => __seg.fatores.length === 1, null, { timeout: 5000 });
    const login = await pag.evaluate(async () => { const precisa = await mfaPrecisa(); entrar = () => { window.__entrou = true; }; mfaPedir(); return precisa; });
    assert.equal(login, true, "com app cadastrado, a sessão só com senha precisa do código");
    await pag.fill(".mfabox input", "654321"); await pag.evaluate(() => document.querySelector(".mfabox").requestSubmit());
    await pag.waitForFunction(() => window.__entrou === true, null, { timeout: 5000 });
    const mfa = await pag.evaluate(() => __seg.mfa.map((x) => x[0]));
    assert.deepEqual(mfa, ["enroll", "verify", "verify"], "nunca remove fator sozinho");
    assert.deepEqual(erros, [], "nenhum erro no navegador");
  } finally {
    await nav.close();
    servidor.close();
  }
});

// Face ID (passkey) num iPhone simulado: o botão no login entra pelo mesmo caminho da senha, e na Central cada conta
// vê, cadastra e remove só as suas passkeys. O servidor do Supabase é simulado (a cerimônia real exige o domínio do site).
test("Face ID: entrar com passkey no login, cadastrar, listar e remover na Central (375 px)", { skip: pular, timeout: 90000 }, async () => {
  const servidor = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const f = path.join(raiz, p);
    if (!f.startsWith(raiz) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const nav = await abrirNavegador();
  try {
    const ctx = await nav.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const pag = await ctx.newPage(), erros = [], dialogos = [];
    pag.on("pageerror", (e) => erros.push("erro: " + e.message));
    pag.on("console", (m) => { if (m.type() === "error" && (m.location().url || base).startsWith(base)) erros.push("console: " + m.text()); });
    pag.on("dialog", (d) => { dialogos.push(d.message()); d.accept(); });
    await pag.goto(base + "/");
    await pag.waitForSelector("#gate", { state: "visible", timeout: 20000 });
    const login = await pag.evaluate(() => ({ botao: !document.getElementById("gate-passkey").hidden, senha: !!document.getElementById("gate-pw") }));
    assert.deepEqual(login, { botao: true, senha: true }, "o Chromium tem passkey: botão aparece, e a senha continua");
    /* login: o botão chama signInWithPasskey e segue pelo entrar() de sempre */
    await pag.evaluate(() => {
      const reg = (window.__pk = { chamadas: [], lista: [{ id: "p1", friendly_name: "iPhone · 30/10/2026", created_at: "2026-10-30T12:00:00Z", last_used_at: "2026-10-31T09:00:00Z" }] });
      const auth = { signInWithPasskey: () => { reg.chamadas.push("signIn"); return Promise.resolve({ data: { session: {} }, error: null }); },
        registerPasskey: () => { reg.chamadas.push("register"); reg.lista.push({ id: "p2", friendly_name: "iCloud Keychain", created_at: new Date().toISOString() }); return Promise.resolve({ data: { id: "p2" }, error: null }); },
        passkey: { list: () => Promise.resolve({ data: reg.lista.map((x) => ({ ...x })), error: null }),
          update: (o) => { reg.chamadas.push("update " + o.passkeyId + " " + o.friendlyName.split(" ·")[0]); return Promise.resolve({ data: {}, error: null }); },
          delete: (o) => { reg.chamadas.push("delete " + o.passkeyId); reg.lista = reg.lista.filter((x) => x.id !== o.passkeyId); return Promise.resolve({ data: {}, error: null }); } },
        mfa: { listFactors: () => Promise.resolve({ data: { all: [], totp: [] } }), getAuthenticatorAssuranceLevel: () => Promise.resolve({ data: { currentLevel: "aal1", nextLevel: "aal1" } }) } };
      const tabela = () => { const q = { select: () => q, order: () => q, limit: () => q, insert: () => q, then: (ok, no) => Promise.resolve({ data: [], error: null }).then(ok, no) }; return q; };
      window.__sbFalso = { auth, from: tabela, rpc: () => Promise.resolve({ data: null, error: { message: "Could not find the function" } }), storage: { from: () => ({ list: () => Promise.resolve({ data: [], error: null }) }) } };
      window.RACmercado.client = () => Promise.resolve(window.__sbFalso);
      entrar = () => { reg.chamadas.push("entrar"); };
    });
    await pag.click("#gate-passkey");
    await pag.waitForFunction(() => __pk.chamadas.includes("entrar"), null, { timeout: 5000 });
    assert.deepEqual(await pag.evaluate(() => __pk.chamadas), ["signIn", "entrar"]);
    /* Central de quem é da casa: vê o Face ID e cadastra o seu */
    await pag.evaluate(() => { __pk.chamadas.length = 0; SB = __sbFalso; PAPEL = "casa"; EU = { id: "membro-teste", email: "casa@exemplo.invalid" }; PESSOAL = {};
      document.documentElement.classList.add("logado", "casa"); document.getElementById("gate").hidden = true; location.hash = "#seguranca"; });
    await pag.waitForSelector("#seguranca-view h2", { timeout: 20000 });
    const tela = await pag.evaluate(() => { const p = [...document.querySelectorAll("#seguranca-view .panel")].find((x) => x.querySelector("h2").textContent === "Entrar com Face ID");
      return { paineis: [...document.querySelectorAll("#seguranca-view h2")].map((x) => x.textContent), itens: [...p.querySelectorAll("li b")].map((b) => b.textContent),
        largura: document.documentElement.scrollWidth }; });
    assert.deepEqual(tela.paineis, ["Proteção da conta", "Entrar com Face ID", "Verificação em duas etapas", "Se perder o acesso"]);
    assert.deepEqual(tela.itens, ["iPhone · 30/10/2026"]); assert.ok(tela.largura <= 375);
    await pag.evaluate(() => [...document.querySelectorAll("#seguranca-view button")].find((b) => b.textContent === "Cadastrar o Face ID deste aparelho").click());
    await pag.waitForFunction(() => __pk.chamadas.some((c) => c.startsWith("update")), null, { timeout: 5000 });
    await pag.waitForFunction(() => [...document.querySelectorAll("#seguranca-view li b")].some((b) => b.textContent === "iCloud Keychain"), null, { timeout: 6000 });
    /* remover pede confirmação e só mexe na passkey escolhida */
    await pag.evaluate(() => { const li = [...document.querySelectorAll("#seguranca-view li")].find((x) => /iPhone · 30\/10/.test(x.textContent)); li.querySelector("button").click(); });
    await pag.waitForFunction(() => __pk.chamadas.some((c) => c.startsWith("delete")), null, { timeout: 5000 });
    const ch = await pag.evaluate(() => __pk.chamadas);
    assert.equal(ch[0], "register"); assert.match(ch[1], /^update p2 (iPhone|Android|Windows|Mac|iPad|Este aparelho)$/); assert.equal(ch[2], "delete p1");
    assert.ok(dialogos.some((d) => /Remover “iPhone · 30\/10\/2026”/.test(d) && /senha continua valendo/.test(d)));
    assert.deepEqual(erros, [], "nenhum erro no navegador");
  } finally {
    await nav.close();
    servidor.close();
  }
});

// Painel de Produtividade num iPhone (375 px), com dados de teste simulados dentro da página (o banco não é tocado).
// Confere as quatro abas, a fonte e o período em todo quadro, rótulo fixo em toda coluna, a lata de fórmula que não conta duas vezes,
// os estados vazios e o orçamento, que só grava no botão Salvar.
test("Painel de Produtividade: 375 px, quatro abas, fontes, sem contar em dobro, vazios claros e orçamento só no Salvar", { skip: pular, timeout: 120000 }, async () => {
  const servidor = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const f = path.join(raiz, p);
    if (!f.startsWith(raiz) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const nav = await abrirNavegador();
  try {
    const ctx = await nav.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const pag = await ctx.newPage(), erros = [];
    pag.on("pageerror", (e) => erros.push("erro: " + e.message));
    pag.on("console", (m) => { if (m.type() === "error" && (m.location().url || base).startsWith(base)) erros.push("console: " + m.text()); });
    await pag.goto(base + "/");
    await pag.waitForSelector("#gate", { state: "visible", timeout: 20000 });
    await pag.evaluate(() => precisa(["painel"]));
    await pag.evaluate(() => {
      const hoje = hojeISO(), d = (n) => maisDias(hoje, -n), ant = maisDias(hoje.slice(0, 8) + "01", -10);
      const reg = (window.__pn = { gravacoes: [], banco: {
        compras: [{ data: d(1), categoria: "Mercearia", valor_total: 100, mercado: "Mercado A", numero: "1" }, { data: d(1), categoria: "Bebê", valor_total: 189.9, mercado: "Mercado A", numero: "1" },
          { data: ant, categoria: "Mercearia", valor_total: 80, mercado: "Mercado B", numero: "2" }],
        registros: [{ id: "r1", quem: "olivia", tipo: "outro", data: d(0), titulo: "Lata 7 aberta", dados: { custo: 189.9, compra: { id: "x" } }, criado_em: d(0) },
          { id: "r2", quem: "civic", tipo: "abastecimento", data: d(2), titulo: "Etanol", dados: { custo: 200, km: 104300 }, criado_em: d(2) }],
        lista: [{ id: "t1", item: "Trocar lâmpada", feito: true, feito_em: d(1) + "T10:00:00Z", criado: d(3) }, { id: "t2", item: "Ligar no banco", feito: false, feito_em: null, criado: d(3) }],
        orcamentos: [],
        garmin_dia: [{ data: d(1), dados: { passos: 9000, sono: { total: 25200, nota: 80 } }, atualizado: d(1) }, { data: d(2), dados: { passos: 11000 }, atualizado: d(2) }],
        garmin_ativ: [{ id: 1, inicio: d(1) + "T07:00:00", tipo: "running", dados: { distancia: 5000, duracao: 1800, nome: "Corrida" } }, { id: 2, inicio: d(9) + "T07:00:00", tipo: "walking", dados: { distancia: 3000, duracao: 2400 } }] } });
      const tabela = (nome) => { const q = { _op: "select", select: () => q, eq: (c, v) => { q._eq = [c, v]; return q; }, gte: () => q, lte: () => q, lt: () => q, in: () => q, order: () => q, limit: () => q, range: () => q, maybeSingle: () => q,
        upsert: (v, o) => { q._op = "upsert"; reg.gravacoes.push({ nome, v, o }); return q; }, insert: (v) => { q._op = "insert"; return q; }, delete: () => { q._op = "delete"; return q; },
        then: (ok, no) => Promise.resolve({ data: q._op === "select" ? (reg.banco[nome] || []).filter((r) => !q._eq || r[q._eq[0]] === q._eq[1] || nome === "lista" && q._eq[0] === "tipo").map((x) => ({ ...x })) : [], error: null }).then(ok, no) }; return q; };
      SB = { from: tabela, storage: { from: () => ({ list: () => Promise.resolve({ data: [], error: null }) }) }, rpc: () => Promise.resolve({ data: null, error: null }) };
      PAPEL = "dono"; EU = { id: "dono-teste", email: "teste@exemplo.invalid" };
      PESSOAL = { exercicios: { "kaggle-py": d(4) }, sqlFeitos: { "1": d(5) }, perfilCarreira: { skills: ["sql", "powerbi"] }, projetos: [{ id: "p1", t: "Painel de vendas", atualizado: d(6) }],
        mba: { disciplinas: [{ id: "est", n: "Estatística", status: "andamento", roteiro: [{ k: "a", t: "Testes de hipótese" }, { k: "b", t: "Regressão" }], exercicios: [{ n: 1 }] }],
          aulas: [{ id: "a1", data: d(10), hora: "19:00" }, { id: "a2", data: maisDias(hoje, 20), hora: "19:00" }] },
        mbaFeito: { "est:a": d(3) } };
      document.documentElement.classList.add("logado"); document.getElementById("gate").hidden = true;
    });
    const abrir = async (hash) => { await pag.evaluate((h) => { if (location.hash === h) route(); else location.hash = h; }, hash); await pag.waitForFunction(() => document.querySelectorAll("#painel-view .panel").length >= 2 && !/Carregando/.test(document.querySelector("#painel-view").innerText), null, { timeout: 15000 }); await pag.waitForTimeout(200); };
    const estado = () => pag.evaluate(() => {
      const ps = [...document.querySelectorAll("#painel-view .panel")].slice(1);
      return { titulos: ps.map((p) => p.querySelector("h2")?.textContent), semFonte: ps.filter((p) => !p.querySelector(".pnfonte")).map((p) => p.querySelector("h2")?.textContent),
        colunasSemRotulo: [...document.querySelectorAll("#painel-view .vb")].filter((b) => !b.querySelector(".vbv")?.textContent || !b.querySelector(".vbl b")?.textContent).length,
        colunas: document.querySelectorAll("#painel-view .vb").length, largura: document.documentElement.scrollWidth,
        texto: document.querySelector("#painel-view").innerText };
    });
    for (const [hash, titulos] of [["#painel", ["Este mês", "Evolução mensal", "Comparação entre períodos", "Atividades recentes", "Pendências e compromissos"]],
      ["#painel/financas", ["Indicadores de controle", "Gastos por mês", "Evolução das compras", "Categorias de despesas"]],
      ["#painel/saude", ["Frequência e consistência", "Evolução das atividades", "Histórico das métricas"]],
      ["#painel/estudos", ["MBA", "Evolução do aprendizado", "Competências", "Projetos e tarefas"]]]) {
      await abrir(hash);
      const e = await estado();
      for (const t of titulos) assert.ok(e.titulos.includes(t), `${hash}: falta o quadro ${t} (${e.titulos.join(", ")})`);
      assert.deepEqual(e.semFonte, [], `${hash}: todo quadro diz a fonte`);
      assert.ok(e.colunas > 0 && e.colunasSemRotulo === 0, `${hash}: toda coluna com valor e rótulo fixos`);
      assert.ok(e.largura <= 375, `${hash}: sem rolagem lateral (${e.largura} px)`);
      if (hash === "#painel/financas") {
        /* a lata (R$ 189,90) já está no Mercado: no período entram Mercado 369,90 (100 + 189,90 + 80) e Veículos 200, e não Olivia */
        assert.match(e.texto, /Mercado[\s\S]*R\$\s?369,90/); assert.match(e.texto, /Veículos[\s\S]*R\$\s?200,00/); assert.ok(!(await pag.evaluate(() => [...document.querySelectorAll("#painel-view .hbl")].some((x) => /Olivia/.test(x.textContent)))), "a lata não conta duas vezes (nenhuma barra da Olivia)");
        assert.match(e.texto, /Nenhum orçamento cadastrado ainda/);
      }
      if (hash === "#painel/estudos") { assert.match(e.texto, /Estatística/); assert.match(e.texto, /SQL/); assert.match(e.texto, /Painel de vendas/); }
    }
    /* toque numa coluna: o cartão destacado (racDica) aparece com o mês */
    await abrir("#painel/financas");
    await pag.evaluate(() => [...document.querySelectorAll("#painel-view .vb")].pop().click());
    const dica = await pag.evaluate(() => { const d = document.querySelector(".racdica"); return d && !d.hidden ? d.textContent : ""; });
    assert.match(dica, / de 20\d\d/);
    /* orçamento: abrir o ajuste não grava; Salvar grava só o que foi digitado */
    await pag.evaluate(() => document.querySelector("#painel-view details.famvals summary").click());
    assert.equal(await pag.evaluate(() => __pn.gravacoes.length), 0);
    await pag.fill('#painel-view input[aria-label="Orçamento de Mercearia"]', "400");
    await pag.evaluate(() => [...document.querySelectorAll("#painel-view button")].find((b) => b.textContent === "Salvar orçamentos").click());
    await pag.waitForFunction(() => __pn.gravacoes.length === 1, null, { timeout: 5000 });
    const g = await pag.evaluate(() => __pn.gravacoes[0]);
    assert.deepEqual(g, { nome: "orcamentos", v: [{ categoria: "Mercearia", valor: 400 }], o: { onConflict: "user_id,categoria" } });
    /* sem dado nenhum, os quadros avisam em vez de mostrar zero inventado */
    await pag.evaluate(() => { for (const k of Object.keys(__pn.banco)) __pn.banco[k] = []; PAINEL.cache = {}; SAUDE.dias = null; PESSOAL = {}; });
    await abrir("#painel/saude");
    assert.match((await estado()).texto, /Nenhum dado do relógio Garmin no período/);
    await abrir("#painel/financas");
    assert.match((await estado()).texto, /Nenhum gasto registrado no período/);
    assert.deepEqual(erros, [], "nenhum erro no navegador");
  } finally {
    await nav.close();
    servidor.close();
  }
});

// Veículos (docs/veiculos.md): o fluxo de abastecimento no iPhone (375 px), com banco de mentira dentro da página. Nada vai à produção:
// o registro da NMax é a fixture de teste. Confere conferência obrigatória, toque duplo, duplicidade, edição, tanque antigo com
// confirmação, IA em DEMO sem preencher, sem internet sem gravar, a Fernanda (casa) usando e o Painel com combustível separado.
test("Veículos: 375 px, DEMO não lê nem preenche, lançamento manual sem fotos, fotos não apagam campos, validação, toque duplo, duplicidade, edição, tanque antigo, sem internet e Painel", { skip: pular, timeout: 150000 }, async () => {
  const servidor = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const f = path.join(raiz, p);
    if (!f.startsWith(raiz) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${servidor.address().port}`, prints = process.env.AB_PRINTS;
  const FX = JSON.parse(fs.readFileSync(path.join(raiz, "tests/fixtures/veiculos/nmax-2026-10-31.json"), "utf8")).registro;
  const nav = await abrirNavegador();
  try {
    const ctx = await nav.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const pag = await ctx.newPage(), erros = [];
    pag.on("pageerror", (e) => erros.push("erro: " + e.message));
    pag.on("console", (m) => { if (m.type() === "error" && (m.location().url || base).startsWith(base)) erros.push("console: " + m.text()); });
    const foto = async (nome) => { if (prints) await pag.screenshot({ path: path.join(prints, nome + ".png"), fullPage: true }); };
    await pag.goto(base + "/");
    await pag.waitForSelector("#gate", { state: "visible", timeout: 20000 });
    await pag.evaluate(() => precisa(["familia", "painel"]));
    await pag.evaluate(() => {
      const hoje = hojeISO(), d = (n) => maisDias(hoje, -n);
      const B = (window.__ab = { gravacoes: [], envios: [], ia: [], banco: {
        registros: [{ id: "km1", quem: "moto", tipo: "outro", data: d(3), titulo: "Quilometragem", dados: { km: 18172 }, arquivos: [], criado_em: d(3) + "T10:00:00Z" },
          { id: "c-ant1", quem: "civic", tipo: "abastecimento", data: d(40), titulo: "Etanol", valor: "Posto A", dados: { km: 103900, litros: 38, precoLitro: 4.2, custo: 159.6, combustivel: "etanol" }, arquivos: [], criado_em: d(40) + "T10:00:00Z" },
          { id: "c-ant2", quem: "civic", tipo: "abastecimento", data: d(20), titulo: "Etanol", valor: "Posto A", dados: { km: 104308, litros: 36, precoLitro: 4.3, custo: 154.8, combustivel: "etanol" }, arquivos: [], criado_em: d(20) + "T10:00:00Z" },
          { id: "c-rev", quem: "civic", tipo: "revisao", data: d(15), titulo: "Revisão", dados: { custo: 650, km: 104400 }, arquivos: [], criado_em: d(15) + "T10:00:00Z" }],
        compras: [], lista: [], orcamentos: [], garmin_dia: [], garmin_ativ: [] } });
      const casa = (r, f) => f.every(([c, v]) => r[c] === v);
      const tabela = (nome) => { const q = { _op: "select", _f: [], _single: false,
        select: () => q, eq: (c, v) => { q._f.push([c, v]); return q; }, order: () => q, gte: () => q, lte: () => q, lt: () => q, in: () => q, limit: () => q, range: () => q, or: () => q,
        single: () => { q._single = true; return q; }, maybeSingle: () => { q._single = true; return q; },
        insert: (v) => { q._op = "insert"; q._v = v; return q; }, update: (v) => { q._op = "update"; q._v = v; return q; }, upsert: (v) => { q._op = "upsert"; q._v = v; return q; }, delete: () => { q._op = "delete"; return q; },
        then: (ok, no) => { const T = (B.banco[nome] = B.banco[nome] || []); let data = null, error = null;
          if (q._op === "select") data = T.filter((r) => casa(r, q._f)).map((x) => JSON.parse(JSON.stringify(x)));
          else if (q._op === "insert") { if (q._v.id && T.some((r) => r.id === q._v.id)) error = { code: "23505", message: "duplicate key value" };
            else { const r = { arquivos: [], criado_em: new Date().toISOString(), ...JSON.parse(JSON.stringify(q._v)) }; if (!r.id) r.id = "novo-" + T.length; T.push(r); B.gravacoes.push({ op: "insert", nome, v: q._v }); data = [r]; } }
          else if (q._op === "update") { const rs = T.filter((r) => casa(r, q._f)); rs.forEach((r) => Object.assign(r, JSON.parse(JSON.stringify(q._v)))); B.gravacoes.push({ op: "update", nome, f: q._f, v: q._v }); data = rs; }
          else { B.gravacoes.push({ op: q._op, nome }); data = []; }
          if (q._single && data) data = data[0] || null;
          return Promise.resolve({ data, error }).then(ok, no); } }; return q; };
      /* o servidor de IA de mentira só responde DEMO e guarda o que o site pediu (para provar que o site não pede REAL) */
      SB = { from: tabela, rpc: () => Promise.resolve({ data: null, error: null }),
        storage: { from: () => ({ upload: (p) => { B.envios.push(p); return Promise.resolve({ data: { path: p }, error: null }); }, createSignedUrls: (ps) => Promise.resolve({ data: ps.map((p) => ({ path: p, signedUrl: "data:image/png;base64,iVBORw0KGgo=" })), error: null }), remove: () => Promise.resolve({ data: [], error: null }), list: () => Promise.resolve({ data: [], error: null }) }) },
        functions: { invoke: (nome, o) => { B.ia.push({ nome, corpo: JSON.parse(JSON.stringify((o && o.body) || {})) }); return Promise.resolve({ error: null, data: { ok: true, versao: 1, modo: "DEMO", estado: "demo", mensagem: "DEMONSTRAÇÃO", avisos: [], resultado: { veiculo: "moto", data: null, km: 0, litros: 1, preco_litro: 1, total: 1, combustivel: "gasolina", posto: "POSTO DEMONSTRAÇÃO", alertas: [], _demo: true } } }); } } };
      PAPEL = "dono"; EU = { id: "dono-teste", email: "teste@exemplo.invalid" }; DONO = "dono-teste"; PESSOAL = {};
      try { localStorage.removeItem("rac-veic"); } catch (e) {}
      document.documentElement.classList.add("logado"); document.getElementById("gate").hidden = true;
    });
    const ir = async (hash, sel) => { await pag.evaluate((h) => { if (location.hash === h) route(); else location.hash = h; }, hash); await pag.waitForSelector(sel, { timeout: 15000 }); await pag.waitForTimeout(250); };
    const largura = () => pag.evaluate(() => document.documentElement.scrollWidth);
    const botao = (txt) => pag.evaluate((t) => { const b = [...document.querySelectorAll("#veiculos-view button")].find((x) => x.textContent.trim() === t && !x.closest("[hidden]")); if (!b) throw new Error("sem o botão " + t); b.click(); }, txt);
    const status = () => pag.evaluate(() => document.querySelector("#veiculos-view .abconf p[role=status]").textContent);
    const faltaTxt = () => pag.evaluate(() => document.querySelector("#veiculos-view .abconf .abfalta").textContent);
    const salvarDesligado = () => pag.evaluate(() => [...document.querySelectorAll("#veiculos-view .abconf button")].find((x) => /^Salvar/.test(x.textContent)).disabled);
    const conf = (rot) => pag.locator("#veiculos-view .abconf").getByLabel(rot, { exact: true });
    const preencher = async (v) => { for (const [k, x] of Object.entries(v)) await conf(k).fill(x); };
    const valores = () => pag.evaluate(() => [...document.querySelectorAll("#veiculos-view .abconf input:not([type=file]):not([type=date])")].map((i) => i.value));
    const ins = () => pag.evaluate(() => __ab.gravacoes.filter((g) => g.op === "insert"));
    const grav = () => pag.evaluate(() => __ab.gravacoes.length);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const ontem = await pag.evaluate(() => maisDias(hojeISO(), -1)), hoje = await pag.evaluate(() => hojeISO());
    const nmax = { "Data": ontem, "Quilometragem do painel (ODO)": "18181", "Litros": "4,581", "Preço por litro (R$)": "6,39", "Total pago (R$)": "29,27", "Forma de pagamento": FX.dados.pagamento, "Posto (opcional)": FX.valor };

    /* 1. formulário novo: campos vazios (nenhum valor padrão), Salvar desligado e o que falta escrito */
    await ir("#veiculos/moto", "#veiculos-view .famhead");
    await botao("⛽ Novo abastecimento");
    await pag.waitForSelector("#veiculos-view .abconf");
    assert.ok((await valores()).every((v) => v === ""), "nenhum campo vem preenchido");
    assert.equal(await salvarDesligado(), true);
    assert.match(await faltaTxt(), /quilometragem do painel, os litros, o preço por litro e o total pago/);
    assert.ok((await largura()) <= 375, "formulário sem rolagem lateral");
    /* 2. fotos + Ler com IA em DEMONSTRAÇÃO: só o aviso; nenhum valor simulado na tela nem nos campos; Salvar continua desligado */
    await pag.setInputFiles('#veiculos-view input[aria-label="Foto do painel"]', { name: "painel.png", mimeType: "image/png", buffer: png });
    await pag.setInputFiles('#veiculos-view input[aria-label="Foto da bomba"]', { name: "bomba.png", mimeType: "image/png", buffer: png });
    await pag.evaluate(() => [...document.querySelectorAll("#veiculos-view .iabox button")].find((b) => /Ler com IA/.test(b.textContent)).click());
    await pag.waitForSelector("#veiculos-view .iabox .iademo", { timeout: 5000 });
    const demo = await pag.evaluate(() => ({ caixa: document.querySelector("#veiculos-view .iabox").innerText, previa: !!document.querySelector("#veiculos-view .iaprevia") }));
    assert.match(demo.caixa, /Nada foi lido das fotos e nenhum campo foi preenchido/);
    assert.equal(demo.previa, false, "sem a lista de valores simulados");
    assert.ok(!/POSTO DEMONSTRAÇÃO|preco_litro|litros\s*\n\s*1/.test(demo.caixa), "nenhum número fictício na tela");
    assert.ok((await valores()).every((v) => v === ""), "DEMO não preenche nada");
    assert.equal(await salvarDesligado(), true, "DEMO não permite salvar");
    await foto("1-demo");
    /* 3. preencher à mão; trocar e tirar as fotos não apaga o que foi digitado */
    await preencher({ "Quilometragem do painel (ODO)": "18181", "Litros": "4,581" });
    await pag.setInputFiles('#veiculos-view input[aria-label="Foto do painel"]', []);
    await pag.setInputFiles('#veiculos-view input[aria-label="Foto da bomba"]', { name: "bomba2.png", mimeType: "image/png", buffer: png });
    assert.equal(await conf("Quilometragem do painel (ODO)").inputValue(), "18181");
    assert.equal(await conf("Litros").inputValue(), "4,581");
    await pag.setInputFiles('#veiculos-view input[aria-label="Foto do painel"]', { name: "painel.png", mimeType: "image/png", buffer: png });
    assert.equal(await conf("Litros").inputValue(), "4,581", "escolher a foto de novo também não apaga");
    /* 4. sem tanque, ou com dado inválido, o Salvar fica desligado e diz o porquê; tocar nele não grava */
    await preencher(nmax);
    await conf("Combustível").selectOption("gasolina comum");
    assert.equal(await salvarDesligado(), true); assert.match(await faltaTxt(), /tanque ficou cheio ou parcial/);
    await botao("Salvar abastecimento");
    assert.equal(await grav(), 0, "nada gravado");
    await botao("Tanque cheio");
    assert.equal(await salvarDesligado(), false); assert.match(await faltaTxt(), /Pronto para salvar/);
    for (const [campo, valor, motivo] of [["Total pago (R$)", "39,27", /diferente do total/], ["Litros", "0", /os litros/], ["Preço por litro (R$)", "", /o preço por litro/], ["Quilometragem do painel (ODO)", "", /quilometragem do painel/]]) {
      await conf(campo).fill(valor);
      assert.equal(await salvarDesligado(), true, `${campo}=${valor} desliga o Salvar`); assert.match(await faltaTxt(), motivo);
      await conf(campo).fill(nmax[campo]);
    }
    assert.equal(await salvarDesligado(), false);
    await foto("2-conferencia");
    /* 5. toque duplo: um registro só, com o id da tela, as fotos e os valores digitados (4,581 l, sem arredondar) */
    await pag.evaluate(() => { const b = [...document.querySelectorAll("#veiculos-view .abconf button")].find((x) => x.textContent === "Salvar abastecimento"); b.click(); b.click(); });
    await pag.waitForFunction(() => document.querySelector("#veiculos-view .abhist"), null, { timeout: 10000 });
    const i1 = await ins();
    assert.equal(i1.length, 1, "toque duplo grava uma vez");
    assert.ok(/^[0-9a-f-]{36}$/.test(i1[0].v.id), "o id nasce na tela");
    assert.deepEqual({ ...i1[0].v.dados }, { ...FX.dados, itensCusto: [["4,581 l de gasolina comum", 29.27]] });
    assert.deepEqual([i1[0].v.quem, i1[0].v.tipo, i1[0].v.data, i1[0].v.valor], ["moto", "abastecimento", ontem, FX.valor]);
    assert.equal(await pag.evaluate(() => __ab.envios.length), 2, "as fotos do painel e da bomba foram junto");
    /* 6. histórico: referência (primeiro tanque cheio, sem consumo inventado) */
    const hist = await pag.evaluate(() => document.querySelector("#veiculos-view .abhist").closest(".panel").innerText);
    assert.match(hist, /18\.181 km/); assert.match(hist, /4,581 l/); assert.match(hist, /R\$\s?29,27/); assert.match(hist, /Referência para o próximo tanque cheio/);
    assert.ok(!/km\/l/.test(hist), "sem consumo inventado");
    assert.ok((await largura()) <= 375, "histórico sem rolagem lateral");
    await foto("3-historico");
    /* 7. o mesmo abastecimento de novo: a conferência acha no banco e não grava */
    await botao("⛽ Novo abastecimento"); await pag.waitForSelector("#veiculos-view .abconf");
    await preencher(nmax); await botao("Tanque cheio"); await botao("Salvar abastecimento");
    await pag.waitForFunction(() => /já está lançado/.test(document.querySelector("#veiculos-view .abconf p[role=status]").textContent), null, { timeout: 5000 });
    assert.equal((await ins()).length, 1, "duplicado não grava");
    await botao("Cancelar");
    /* 8. sem internet: avisa e não grava */
    const parcial = { ...nmax, "Data": hoje, "Quilometragem do painel (ODO)": "18290", "Litros": "2", "Total pago (R$)": "12,78", "Forma de pagamento": "Débito" };
    await botao("⛽ Novo abastecimento"); await pag.waitForSelector("#veiculos-view .abconf");
    await preencher(parcial); await botao("Parcial");
    const antes = await grav();
    await ctx.setOffline(true);
    await botao("Salvar abastecimento");
    assert.match(await status(), /Sem internet: nada foi salvo/);
    await ctx.setOffline(false);
    assert.equal(await grav(), antes, "nada gravado sem internet");
    /* 9. lançamento manual, sem fotos e sem IA: grava (depois de a internet voltar), sem enviar arquivo nenhum */
    await botao("Salvar abastecimento");
    await pag.waitForFunction(() => __ab.gravacoes.filter((g) => g.op === "insert").length === 2, null, { timeout: 5000 });
    const i2 = (await ins())[1];
    assert.deepEqual([i2.v.dados.km, i2.v.dados.litros, i2.v.dados.custo, i2.v.dados.tanque, i2.v.dados.origem], [18290, 2, 12.78, "parcial", "manual"]);
    assert.equal(await pag.evaluate(() => __ab.envios.length), 2, "sem fotos, nada enviado");
    await pag.waitForSelector("#veiculos-view .abhist");
    /* 10. edição do primeiro: os 4,581 l aparecem como estão; mesmo registro, atualizadoEm e a versão anterior guardada */
    await pag.evaluate((id) => [...document.querySelectorAll(`#veiculos-view .abhist li[data-reg="${id}"] button`)].find((b) => b.textContent === "Editar").click(), i1[0].v.id);
    await pag.waitForSelector("#veiculos-view .abconf");
    assert.equal(await conf("Litros").inputValue(), "4,581");
    assert.equal(await salvarDesligado(), false, "registro completo pode ser salvo");
    await conf("Forma de pagamento").fill("Crédito Mastercard (corrigido)");
    const g0 = await grav();
    await botao("Salvar alterações");
    await pag.waitForFunction((n) => __ab.gravacoes.length === n + 1, g0, { timeout: 5000 });
    const ed = await pag.evaluate(() => __ab.gravacoes[__ab.gravacoes.length - 1]);
    assert.equal(ed.op, "update"); assert.deepEqual(ed.f, [["id", i1[0].v.id]], "atualiza o mesmo registro");
    assert.equal(ed.v.dados.litros, 4.581); assert.equal(ed.v.dados.pagamento, "Crédito Mastercard (corrigido)"); assert.ok(ed.v.dados.atualizadoEm);
    assert.equal(ed.v.dados.versoes.length, 1); assert.equal(ed.v.dados.versoes[0].pagamento, "Crédito Mastercard");
    assert.ok(!("criado_em" in ed.v), "a data de lançamento não muda");
    assert.equal((await ins()).length, 2, "editar não cria outro");
    /* 11. Civic: registros antigos sem tanque; marcar exige escolher e confirmar, um por um */
    await ir("#veiculos/civic", "#veiculos-view .abhist");
    const hc = await pag.evaluate(() => document.querySelector("#veiculos-view .abhist").closest(".panel").innerText);
    assert.match(hc, /marque “Tanque cheio”/); assert.equal((hc.match(/tanque \?/g) || []).length, 2);
    await pag.evaluate(() => [...document.querySelectorAll('#veiculos-view .abhist li[data-reg="c-ant1"] button')].find((b) => b.textContent === "Informar tanque").click());
    await pag.evaluate(() => [...document.querySelectorAll("#veiculos-view .abmarca button")].find((b) => b.textContent === "Cheio").click());
    const g1 = await grav();
    assert.match(await pag.evaluate(() => document.querySelector("#veiculos-view .abmarca").textContent), /Marcar o abastecimento de .* como tanque cheio\?/);
    await pag.evaluate(() => [...document.querySelectorAll("#veiculos-view .abmarca button")].find((b) => b.textContent === "Confirmar").click());
    await pag.waitForFunction((n) => __ab.gravacoes.length === n + 1, g1, { timeout: 5000 });
    const mt = await pag.evaluate(() => __ab.gravacoes[__ab.gravacoes.length - 1]);
    assert.deepEqual(mt.f, [["id", "c-ant1"]]); assert.equal(mt.v.dados.tanque, "cheio"); assert.equal(mt.v.dados.km, 103900); assert.ok(mt.v.dados.atualizadoEm);
    assert.equal(await pag.evaluate(() => __ab.banco.registros.find((r) => r.id === "c-ant2").dados.tanque), undefined, "o outro registro antigo não foi tocado");
    /* 12. Painel → Finanças: combustível, consumo e despesas dos veículos, com fonte; combustível separado da manutenção */
    await pag.evaluate(() => { PAINEL.cache = {}; });
    await ir("#painel/financas", "#painel-view .pnfonte");
    await pag.waitForFunction(() => !/Carregando/.test(document.querySelector("#painel-view").innerText), null, { timeout: 15000 });
    const pn = await pag.evaluate(() => { const ps = [...document.querySelectorAll("#painel-view .panel")].slice(1);
      return { titulos: ps.map((p) => p.querySelector("h2")?.textContent), semFonte: ps.filter((p) => !p.querySelector(".pnfonte")).map((p) => p.querySelector("h2")?.textContent),
        semRotulo: [...document.querySelectorAll("#painel-view .vb")].filter((b) => !b.querySelector(".vbv")?.textContent || !b.querySelector(".vbl b")?.textContent).length, texto: document.querySelector("#painel-view").innerText }; });
    for (const t of ["Combustível", "Consumo e custo por km", "Despesas dos veículos"]) assert.ok(pn.titulos.includes(t), "falta o quadro " + t);
    assert.deepEqual(pn.semFonte, []); assert.equal(pn.semRotulo, 0);
    assert.match(pn.texto, /Veículos · Combustível/); assert.match(pn.texto, /Veículos · Manutenção/); assert.match(pn.texto, /Civic · Manutenção/);
    assert.match(pn.texto, /Moto · Combustível[\s\S]*R\$\s?42,05/, "moto: 29,27 + 12,78, cada um uma vez");
    assert.ok((await largura()) <= 375, "Painel sem rolagem lateral");
    await foto("4-painel");
    /* 13. a Fernanda (papel casa) usa Veículos, mas o Painel continua só do dono */
    await pag.evaluate(() => { PAPEL = "casa"; });
    await ir("#veiculos/moto", "#veiculos-view .famhead");
    assert.ok(await pag.evaluate(() => [...document.querySelectorAll("#veiculos-view button")].some((b) => b.textContent === "⛽ Novo abastecimento")));
    await pag.evaluate(() => { location.hash = "#painel"; });
    await pag.waitForTimeout(400);
    assert.equal(await pag.evaluate(() => document.getElementById("painel").hidden), true, "casa não vê o Painel");
    /* 14. nenhuma chamada REAL: o site fez um único pedido, à rac-ia, sem modo no corpo (quem decide é o servidor) */
    const ia = await pag.evaluate(() => __ab.ia);
    assert.equal(ia.length, 1); assert.equal(ia[0].nome, "rac-ia"); assert.equal(ia[0].corpo.acao, "abastecimento.interpretar");
    assert.ok(!("modo" in ia[0].corpo) && !/REAL/.test(JSON.stringify(ia[0].corpo)), "o pedido não pede REAL");
    assert.deepEqual(erros, [], "nenhum erro no navegador");
  } finally {
    await nav.close();
    servidor.close();
  }
});
