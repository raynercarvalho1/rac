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
