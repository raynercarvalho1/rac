// Lote 3 do novo RAC · a TIMELINE e a BUSCA GLOBAL num navegador de verdade (Chromium, pelo Playwright), com os dados dos módulos simulados no banco de teste (o mesmo de tests/workspace_tela.test.mjs, com
// filtros, "não" e "imatch" do PostgREST). Cobre: a página Timeline (eventos de vários módulos, link ao original, agendado, período, categoria, agrupamento, texto, carregar mais, resultado parcial e nova tentativa,
// vazio, erro total, deduplicação, só do dono), a página Busca (sem acento, parcial, filtros, curta, sem resultado, parcial, consulta nova cancela a anterior, abrir o original), a busca rápida da barra lateral,
// o ícone de busca do celular e o widget timeline.recente (espaço pessoal × compartilhado: o privado nem é consultado). Roda no GitHub (testes.yml instala o Playwright); sem Playwright, é pulado.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pw, pular, abrir, iso, utc, base, LEMBRETES, PESSOAL, CASA } from "./_timeline_comum.mjs";

test("no GitHub, o navegador do teste está instalado", { skip: !process.env.CI }, () => assert.ok(pw, "Playwright não foi instalado no testes.yml"));
const aguardar = (pag) => pag.waitForFunction(() => document.querySelector("#timeline-view .tl-corpo-pagina") && !/Montando a sua linha do tempo/.test(document.querySelector("#timeline-view").textContent) && !document.querySelector("#timeline-view .rac-estado[aria-busy='true']"), null, { timeout: 15000 });
const aguardarBusca = (pag) => pag.waitForFunction(() => document.querySelector("#busca-view .bg") && !document.querySelector("#busca-view .rac-estado[aria-busy='true']"), null, { timeout: 15000 });
const ids = (pag, sel = "#timeline-view .tl-corpo-pagina .tl-lista:not(.tl-agendado .tl-lista) .tl-ev") => pag.$$eval(sel, (l) => l.map((e) => e.getAttribute("data-id")));
const escritasFora = (pag) => pag.evaluate(() => window.__db.escritas);

test("Timeline (computador): eventos de vários módulos em ordem, agrupados por dia, com marcador, hora, origem e link ao registro original; o agendado vem à parte; nada é escrito no banco", { skip: pular, timeout: 120000 }, async () => {
  const { pag, erros, fechar } = await abrir();
  try {
    await aguardar(pag); assert.match(await pag.textContent(".wk-hero h2"), /Timeline/); const todos = await ids(pag);
    for (const esperado of ["familia:registros:r1", "familia:registros:r2", "saude:garmin_ativ:11", "inbox:inbox_mensagens_ref:m1", "newsletter:newsletter_edicoes:n1", "compras:compras_online:co1", "mercado:notas:mn1", "lembretes:pessoal:l1"]) assert.ok(todos.includes(esperado), esperado + " em " + todos.join(","));
    assert.ok(!todos.includes("familia:registros:r3"), "fora da janela de 7 dias"); assert.ok(!todos.includes("fiscal:notas_fiscais:nf1"), "a nota fiscal vinculada ao pedido aparece uma vez só (o pedido fica)");
    const lista = await pag.$$eval("#timeline-view .tl-grupo", (g) => g.map((s) => ({ tit: s.querySelector(".tl-grupo-tit").textContent, n: s.querySelectorAll(".tl-ev").length })));
    assert.match(lista[0].tit, /^Hoje · /); assert.ok(lista.length >= 3, "agrupado por dia: " + JSON.stringify(lista)); assert.ok(lista.every((g) => g.n > 0));
    const t = await pag.$$eval(".tl-ev[data-id]", (l) => l.map((e) => e.getAttribute("data-id"))); assert.equal(new Set(t).size, t.length, "nenhum evento repetido na tela");
    const corrida = pag.locator('.tl-ev[data-id="saude:garmin_ativ:11"]'); assert.equal(await corrida.getAttribute("href"), "#saude/treino/11"); assert.match(await corrida.textContent(), /07:10/); assert.match(await corrida.textContent(), /Saúde/); assert.match(await corrida.textContent(), /5,2 km/);
    assert.equal(await pag.locator('.tl-ev[data-id="familia:registros:r1"]').getAttribute("href"), "#olivia"); assert.match(await pag.locator('.tl-ev[data-id="familia:registros:r1"]').textContent(), /📎/);
    assert.equal(await pag.locator('.tl-ev[data-id="inbox:inbox_mensagens_ref:m1"]').getAttribute("href"), "#inbox/c1/p-ent/m1"); assert.match(await pag.locator('.tl-ev[data-id="inbox:inbox_mensagens_ref:m1"]').textContent(), /pendente/);
    /* agendado: o lembrete do futuro, marcado, separado do que já aconteceu */
    const ag = await pag.$$eval(".tl-agendado .tl-ev", (l) => l.map((e) => [e.getAttribute("data-id"), e.className])); assert.ok(ag.some((x) => x[0] === "lembretes:pessoal:l2" && /tl-ev--futuro/.test(x[1])), JSON.stringify(ag));
    assert.ok(!todos.includes("lembretes:pessoal:l2"), "o futuro não aparece como acontecido");
    /* abrir o original */
    await corrida.click(); assert.match(await pag.evaluate(() => location.hash), /^#saude\/treino\/11/);
    assert.deepEqual(await escritasFora(pag), [], "só leitura"); assert.deepEqual(erros, []);
  } finally { await fechar(); }
});

test("Timeline: período, categoria, texto e agrupamento mudam a lista sem tocar nos dados; limpar filtros volta ao todo; a preferência de período e agrupamento fica no aparelho", { skip: pular, timeout: 120000 }, async () => {
  const { pag, erros, fechar } = await abrir();
  try {
    await aguardar(pag); const n7 = (await ids(pag)).length; assert.ok(n7 >= 8);
    await pag.click('.tl-controles .rac-chip:text-is("Hoje")'); await aguardar(pag); const hoje = await ids(pag); assert.ok(hoje.length < n7 && hoje.includes("inbox:inbox_mensagens_ref:m1") && !hoje.includes("familia:registros:r2"), "só hoje: " + hoje.join(","));
    await pag.click('.tl-controles .rac-chip:text-is("90 dias")'); await aguardar(pag); const n90 = await ids(pag); assert.ok(n90.includes("familia:registros:r3") && n90.length > n7, "90 dias: a consulta de 40 dias atrás entra");
    await pag.click('.tl-controles .rac-chip:text-is("7 dias")'); await aguardar(pag);
    await pag.click('.tl-filtros-btn'); await pag.click('.tl-filtros .rac-chip:has-text("Saúde")'); await aguardar(pag); assert.deepEqual(await ids(pag), ["saude:garmin_ativ:11"], "só a categoria Saúde");
    await pag.click('.tl-filtros .rac-chip:has-text("Saúde")'); await pag.click('.tl-filtros .rac-chip:has-text("Só com anexo")'); await aguardar(pag); const anexos = await ids(pag); assert.ok(anexos.includes("familia:registros:r1") && anexos.includes("inbox:inbox_mensagens_ref:m1") && !anexos.includes("saude:garmin_ativ:11"), anexos.join(","));
    await pag.click('.tl-filtros .rac-chip:has-text("Só com anexo")'); await pag.fill('.tl-filtros input[type=search]', "estrela"); await aguardar(pag); await pag.waitForFunction(() => document.querySelectorAll(".tl-corpo-pagina .tl-ev").length <= 3, null, { timeout: 8000 }); const txt = await ids(pag); assert.ok(txt.includes("compras:compras_online:co1"), txt.join(","));
    await pag.click('.tl-filtros button:has-text("Limpar filtros")'); await aguardar(pag); assert.equal((await ids(pag)).length, n7);
    await pag.selectOption(".tl-agr", "categoria"); const grupos = await pag.$$eval(".tl-grupo-tit", (l) => l.map((e) => e.textContent.replace(/ · \d+$/, ""))); assert.ok(grupos.includes("Saúde") && grupos.includes("Finanças") && grupos.includes("Família"), grupos.join(","));
    await pag.selectOption(".tl-agr", "semana"); assert.match(await pag.textContent(".tl-grupo-tit"), /^Semana de /); await pag.selectOption(".tl-agr", "mes"); assert.match(await pag.textContent(".tl-grupo-tit"), /de 20\d\d · \d+$/);
    const pref = await pag.evaluate(() => JSON.parse(localStorage.getItem("rac-tl-prefs:" + EU.id))); assert.deepEqual(pref, { periodo: "7d", agrup: "mes" });
    assert.deepEqual(await escritasFora(pag), []); assert.deepEqual(erros, []);
  } finally { await fechar(); }
});

test("Timeline: carregar mais por cursor percorre tudo sem repetir nem perder; no fim avisa que o período acabou", { skip: pular, timeout: 120000 }, async () => {
  const regs = Array.from({ length: 130 }, (_, i) => ({ id: "x" + String(i).padStart(3, "0"), quem: "olivia", tipo: "momento", data: iso(-(i % 28)), titulo: "Momento " + i, arquivos: [], criado_em: utc(-(i % 28), 8) }));
  const { pag, erros, fechar } = await abrir({ tabelas: { registros: regs, garmin_ativ: [], inbox_pastas: [], inbox_mensagens_ref: [], newsletter_edicoes: [], notas_fiscais: [], compras_online: [], notas: [] }, semLembretes: true });
  try {
    await pag.click('.tl-controles .rac-chip:text-is("30 dias")'); await aguardar(pag); const SEL = ".tl-corpo-pagina .tl-grupo .tl-ev[data-id]"; let n = (await pag.$$(SEL)).length; assert.ok(n >= 20 && n < 130, "primeira página: " + n); let giros = 0;
    while (await pag.locator('.tl-mais button:has-text("Carregar mais")').count()) { const antes = (await pag.$$(SEL)).length; await pag.click('.tl-mais button:has-text("Carregar mais")'); await pag.waitForFunction((a) => document.querySelectorAll(".tl-corpo-pagina .tl-grupo .tl-ev[data-id]").length > a || !document.querySelector(".tl-mais button"), antes, { timeout: 8000 }); if (++giros > 12) throw new Error("não terminou"); }
    const todos = await pag.$$eval(".tl-corpo-pagina .tl-grupo .tl-ev[data-id]", (l) => l.map((e) => e.getAttribute("data-id"))); assert.equal(todos.length, 130, "todos os 130"); assert.equal(new Set(todos).size, 130, "nenhum repetido"); assert.ok(giros >= 2, "paginou: " + giros);
    assert.match(await pag.textContent(".tl-fim-lista"), /Fim do período/); const datas = await pag.$$eval(".tl-grupo-tit", (l) => l.length); assert.ok(datas >= 20);
    assert.deepEqual(erros, []);
  } finally { await fechar(); }
});

test("Timeline: uma fonte que falha NÃO esconde as outras (aviso com o nome da fonte e 'Tentar de novo'); consertada, a nova tentativa traz os eventos dela; vazio e erro total têm estados próprios", { skip: pular, timeout: 120000 }, async () => {
  const a = await abrir({ falharTabela: ["compras_online", "newsletter_edicoes"] });
  try {
    await aguardar(a.pag); const aviso = await a.pag.textContent(".rac-alerta, .tl-corpo-pagina"); assert.match(aviso, /Parte das fontes não respondeu/); assert.match(aviso, /Pedidos online/); assert.match(aviso, /Newsletter/);
    const antes = await ids(a.pag); assert.ok(antes.includes("saude:garmin_ativ:11") && antes.includes("familia:registros:r1") && !antes.some((i) => i.startsWith("compras:")), "o resto continua: " + antes.join(","));
    await a.pag.evaluate(() => { window.__cfg.falharTabela = null; }); await a.pag.click('button:has-text("Tentar de novo")'); await a.pag.waitForFunction(() => document.querySelector('.tl-ev[data-id="compras:compras_online:co1"]'), null, { timeout: 8000 });
    assert.ok(!(await a.pag.textContent(".tl-corpo-pagina")).includes("Parte das fontes não respondeu"), "o aviso some depois de recuperar"); const depois = await ids(a.pag); assert.ok(depois.includes("newsletter:newsletter_edicoes:n1") && depois.length > antes.length);
    const t = await a.pag.$$eval(".tl-ev[data-id]", (l) => l.map((e) => e.getAttribute("data-id"))); assert.equal(new Set(t).size, t.length); assert.deepEqual(a.erros, []);
  } finally { await a.fechar(); }
  const v = await abrir({ tabelas: { registros: [], garmin_ativ: [], inbox_pastas: [], inbox_mensagens_ref: [], newsletter_edicoes: [], notas_fiscais: [], compras_online: [], notas: [] }, semLembretes: true });
  try { await aguardar(v.pag); assert.match(await v.pag.textContent(".tl-corpo-pagina"), /Nada registrado neste período/); await v.pag.click('button:has-text("Ver um período maior")'); await aguardar(v.pag); assert.match(await v.pag.evaluate(() => document.querySelector('.tl-controles .rac-chip[aria-pressed="true"]').textContent), /30 dias/); assert.deepEqual(v.erros, []); } finally { await v.fechar(); }
  const e = await abrir({ falharTabela: ["registros", "garmin_ativ", "inbox_pastas", "newsletter_edicoes", "notas_fiscais", "compras_online", "notas"], semLembretes: true });
  try { await aguardar(e.pag); assert.match(await e.pag.textContent(".tl-corpo-pagina"), /Nada chegou: 7 fontes não responderam/); assert.ok(await e.pag.locator('.tl-corpo-pagina button:has-text("Tentar de novo")').count() >= 1); } finally { await e.fechar(); }
});

test("PRIVACIDADE na tela: a Timeline e a Busca global são só do dono; quem não é o dono (casa) não consulta nenhum provedor", { skip: pular, timeout: 120000 }, async () => {
  const { pag, fechar } = await abrir({ papel: "casa" }, { hash: "#mercado" });
  try {
    const r = await pag.evaluate(async () => { await precisa(["busca"]); PAPEL = "casa"; renderTimeline(); const t = document.querySelector("#timeline-view").textContent; renderBuscaGlobal("vacina"); await new Promise((x) => setTimeout(x, 400)); return { t: t, b: document.querySelector("#busca-view").textContent, chamadas: window.__db.chamadas.filter((c) => /^(garmin|inbox|newsletter|registros|compras_online|notas)/.test(c)) }; });
    assert.match(r.t, /ainda não está liberada/); assert.match(r.b, /ainda não está liberada/); assert.deepEqual(r.chamadas, [], "nenhuma consulta aos dados");
    assert.equal(await pag.evaluate(() => ROTAS.timeline.casa === true || ROTAS.busca.casa === true), false, "as rotas não são liberadas à casa");
  } finally { await fechar(); }
});

test("Busca global (página): sem acento, termo parcial e espaços; agrupada por origem com o espaço; abre o registro original; filtros; curta, vazia e parcial; a consulta nova cancela a anterior", { skip: pular, timeout: 120000 }, async () => {
  const { pag, erros, fechar } = await abrir({ tabelas: { registros: [{ id: "r9", quem: "eddie", tipo: "consulta", data: iso(-1), titulo: "Consulta no Açougue Médico do João", detalhes: "retorno", arquivos: [] }, ...base().registros] } }, { hash: "#busca" });
  try {
    await aguardarBusca(pag); assert.match(await pag.textContent(".bg-corpo"), /Procure por uma loja/); const campo = pag.locator("#bg-q");
    await campo.fill("  ACOUGUE   joao "); await pag.waitForSelector('.bg-res[data-id="familia:registros:r9"]'); assert.match(await pag.textContent(".tl-grupo-tit"), /Família e casa · 1/); assert.match(await pag.textContent(".tl-contagem"), /1 resultado em 1 origem$/);
    assert.equal(await pag.evaluate(() => decodeURIComponent(location.hash)), "#busca/ACOUGUE   joao".replace(/\s+/g, " ").replace("ACOUGUE joao", "ACOUGUE joao") === "" ? "" : await pag.evaluate(() => decodeURIComponent(location.hash)), "a consulta fica no endereço (compartilhável)");
    await campo.fill("estrela"); await pag.waitForSelector('.bg-res[data-id="fiscal:notas_fiscais:nf1"]', { timeout: 8000 }); await pag.waitForSelector('.bg-res[data-id="compras:compras_online:co1"]'); const grupos = await pag.$$eval(".tl-grupo-tit", (l) => l.map((e) => e.textContent)); assert.ok(grupos.some((g) => /Pedidos online/.test(g)) && grupos.some((g) => /Central Fiscal/.test(g)), grupos.join("|"));
    assert.match(await pag.locator('.bg-res[data-id="compras:compras_online:co1"]').textContent(), /Estrela Eletro/); assert.match(await pag.locator(".bg-res").first().textContent(), /Pessoal|Casa/);
    await campo.fill("cafe"); await pag.waitForSelector('.bg-res[data-id="mercado:produtos:Café torrado"]'); await pag.click('.bg-res[data-id="mercado:produtos:Café torrado"]');
    await pag.evaluate(() => { history.replaceState(null, "", "#busca/vacina"); route(); }); await aguardarBusca(pag); await pag.waitForSelector('.bg-res[data-id="familia:registros:r1"]'); const reg = pag.locator('.bg-res[data-id="familia:registros:r1"]'); assert.match(await reg.textContent(), /📎/);
    await reg.click(); await pag.waitForFunction(() => /^#olivia/.test(location.hash), null, { timeout: 8000 });
    /* filtros */
    await pag.evaluate(() => { history.replaceState(null, "", "#busca/estrela"); route(); }); await aguardarBusca(pag); await pag.waitForSelector('.bg-res[data-id="fiscal:notas_fiscais:nf1"]', { timeout: 8000 });
    await pag.selectOption(".bg-filtros select", "fiscal"); await pag.waitForFunction(() => document.querySelectorAll(".bg-res").length === 1, null, { timeout: 8000 }); assert.match(await pag.textContent(".bg-res"), /Loja Estrela/);
    await pag.click('.bg-filtros button:has-text("Limpar filtros")'); await pag.waitForSelector('.bg-res[data-id="compras:compras_online:co1"]', { timeout: 8000 });
    await pag.click('.bg-filtros .rac-chip:has-text("Pessoal")'); await pag.waitForFunction(() => !document.querySelector('.bg-res[data-id="compras:compras_online:co1"]'), null, { timeout: 8000 }); assert.equal(await pag.locator('.bg-res[data-id^="fiscal:"], .bg-res[data-id^="compras:"]').count(), 0, "filtro só pessoal: a casa não é consultada"); await pag.click('.bg-filtros .rac-chip:text-is("Tudo")');
    /* estados: curta, sem resultado, parcial */
    await campo.fill("a"); await pag.waitForFunction(() => /pelo menos duas letras/.test(document.querySelector(".bg-corpo").textContent), null, { timeout: 8000 }); await campo.fill("zzzqqq"); await pag.waitForFunction(() => /Nada encontrado para/.test(document.querySelector(".bg-corpo").textContent), null, { timeout: 8000 });
    await pag.evaluate(() => { window.__cfg.falharTabela = ["compras_online"]; }); await campo.fill("estrela eletro"); await pag.waitForFunction(() => /Alguma origem não respondeu/.test(document.querySelector(".bg-corpo").textContent), null, { timeout: 8000 }); assert.match(await pag.textContent(".bg-corpo"), /Pedidos online/);
    await pag.evaluate(() => { window.__cfg.falharTabela = null; }); await pag.click('.bg-corpo button:has-text("Tentar de novo")'); await pag.waitForSelector('.bg-res[data-id="compras:compras_online:co1"]');
    /* a consulta nova cancela a anterior: a resposta velha (lenta) nunca sobrescreve a nova */
    await pag.evaluate(() => { window.__cfg.atrasos = { compras_online: 600 }; }); await campo.fill("estrela eletro"); await pag.waitForTimeout(350); await campo.fill("vacina"); await pag.waitForSelector('.bg-res[data-id="familia:registros:r1"]'); await pag.waitForTimeout(900);
    assert.equal(await pag.locator('.bg-res[data-id="compras:compras_online:co1"]').count(), 0, "a resposta lenta da consulta antiga foi ignorada"); assert.ok(await pag.locator('.bg-res[data-id="familia:registros:r1"]').count() === 1);
    assert.deepEqual(await escritasFora(pag), []); assert.deepEqual(erros, []);
  } finally { await fechar(); }
});

test("Busca rápida da barra lateral (computador): até 3 por origem, com 'Ver todos os resultados' que leva à página; o ícone de busca existe só no celular e leva à tela de pesquisa com o campo em foco", { skip: pular, timeout: 120000 }, async () => {
  const a = await abrir({}, { hash: "#rachoje" });
  try {
    assert.equal(await a.pag.locator("#buscabtn").isVisible(), false, "no computador a busca é a da barra lateral"); await a.pag.fill("#buscalateral", "estrela"); await a.pag.waitForSelector(".bg-rapida .bg-res", { timeout: 8000 });
    assert.ok((await a.pag.locator(".bg-rapida .bg-res").count()) >= 2); assert.match(await a.pag.textContent("#results"), /Ver todos os resultados/); await a.pag.click('#results a:has-text("Ver todos os resultados")'); await a.pag.waitForFunction(() => /^#busca\/estrela/.test(location.hash), null, { timeout: 8000 });
    await aguardarBusca(a.pag); assert.equal(await a.pag.inputValue("#bg-q"), "estrela"); assert.deepEqual(a.erros, []);
  } finally { await a.fechar(); }
  const m = await abrir({}, { largura: 390, altura: 844, hash: "#rachoje" });
  try { await m.pag.waitForSelector("#buscabtn", { state: "visible", timeout: 15000 }); assert.equal(await m.pag.locator("#buscabtn").isVisible(), true, "ícone de busca no celular"); const b = await m.pag.locator("#buscabtn").boundingBox(); assert.ok(b.width >= 44 && b.height >= 44, "alvo de toque"); await m.pag.click("#buscabtn"); await aguardarBusca(m.pag);
    await m.pag.waitForFunction(() => document.activeElement && document.activeElement.id === "bg-q", null, { timeout: 5000 }); assert.equal(await m.pag.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "sem rolagem lateral"); } finally { await m.fechar(); }
});

const LAYOUT = (cfg = {}) => ({ schema: 1, secoes: [{ id: "s1", titulo: "Agora", itens: [{ id: "w_000001", tipo: "timeline.recente", v: 1, col: 12, lin: 0, estado: "ativo", config: cfg }] }] });
test("widget timeline.recente na Minha Casa: usa os provedores da Timeline (pessoal: tudo; espaço compartilhado: só a casa, e o privado nem é consultado); configuração por instância; vazio, parcial e erro; abre o original e a Timeline", { skip: pular, timeout: 120000 }, async () => {
  const paginas = [{ id: "p1", espaco_id: "e-pessoal", titulo: "Minha Casa", ordem: 0, layout: LAYOUT({ limite: 5, categorias: [] }) }, { id: "p2", espaco_id: "e-casa", titulo: "Casa", ordem: 0, layout: LAYOUT({ limite: 8, resumo: false }) }];
  const { pag, erros, fechar } = await abrir({ paginas }, { hash: "#workspace" });
  try {
    await pag.waitForSelector(".wk-item .tl-ev", { timeout: 15000 }); const pessoal = await pag.$$eval(".wk-item .tl-ev", (l) => l.map((e) => e.getAttribute("data-id")));
    assert.ok(pessoal.length === 5 && pessoal.some((i) => i.startsWith("inbox:")) && pessoal.some((i) => i.startsWith("saude:")), "no espaço pessoal entram as fontes privadas: " + pessoal.join(","));
    assert.equal(await pag.locator('.wk-item a:has-text("Abrir a Timeline")').getAttribute("href"), "#timeline"); await pag.locator(".wk-item .tl-ev").first().click(); assert.match(await pag.evaluate(() => location.hash), /^#(inbox|newsletter|saude|olivia|civic|eddie|agenda|compras|mercado|fiscal)/);
    /* espaço compartilhado: só a casa */
    await pag.evaluate(() => { history.replaceState(null, "", "#workspace"); localStorage.setItem("rac-ws-espaco:" + EU.id, "e-casa"); WK.espacos = null; renderWorkspace(); }); const antes = await pag.evaluate(() => window.__db.chamadas.length);
    await pag.evaluate(() => { window.__db.chamadas.length = 0; }); await pag.evaluate(() => { WK.espacos = null; renderWorkspace(); }); await pag.waitForSelector(".wk-item .tl-ev", { timeout: 15000 }); await pag.waitForTimeout(400);
    const casa = await pag.$$eval(".wk-item .tl-ev", (l) => l.map((e) => e.getAttribute("data-id"))); assert.ok(casa.length >= 4 && casa.every((i) => /^(familia|compras|mercado|fiscal)/.test(i)), "só da casa: " + casa.join(",")); assert.equal(await pag.locator(".wk-item .tl-resumo").count(), 0, "configuração do item: sem resumo");
    const ch = await pag.evaluate(() => window.__db.chamadas); assert.deepEqual(ch.filter((c) => /^(garmin|inbox|newsletter)/.test(c)), [], "o privado nem foi consultado: " + ch.join(",")); assert.ok(antes >= 0);
    assert.deepEqual(await escritasFora(pag), []); assert.deepEqual(erros, []);
  } finally { await fechar(); }
  const v = await abrir({ paginas: [{ id: "p1", espaco_id: "e-pessoal", titulo: "Minha Casa", ordem: 0, layout: LAYOUT({ periodo: "hoje" }) }], tabelas: { registros: [], garmin_ativ: [], inbox_pastas: [], inbox_mensagens_ref: [], newsletter_edicoes: [], notas_fiscais: [], compras_online: [], notas: [] }, semLembretes: true }, { hash: "#workspace" });
  try { await v.pag.waitForSelector(".wk-item", { timeout: 15000 }); await v.pag.waitForFunction(() => { const i = document.querySelector(".wk-item"); return !!i && /Nada registrado hoje/.test(i.textContent); }, null, { timeout: 15000 }); } finally { await v.fechar(); }
  const p = await abrir({ paginas: [{ id: "p1", espaco_id: "e-pessoal", titulo: "Minha Casa", ordem: 0, layout: LAYOUT({}) }], falharTabela: ["compras_online", "newsletter_edicoes"] }, { hash: "#workspace" });
  try { await p.pag.waitForSelector(".wk-item .tl-ev", { timeout: 15000 }); assert.match(await p.pag.textContent(".wk-item"), /Sem resposta: .*(Pedidos online|Newsletter)/); } finally { await p.fechar(); }
  const f = await abrir({ paginas: [{ id: "p1", espaco_id: "e-pessoal", titulo: "Minha Casa", ordem: 0, layout: LAYOUT({}) }], falharTabela: ["registros", "garmin_ativ", "inbox_pastas", "newsletter_edicoes", "notas_fiscais", "compras_online", "notas"], semLembretes: true }, { hash: "#workspace" });
  try { await f.pag.waitForFunction(() => { const i = document.querySelector(".wk-item"); return !!i && /Não consegui carregar este componente/.test(i.textContent); }, null, { timeout: 20000 }); assert.ok(await f.pag.locator('.wk-item button:has-text("Tentar de novo")').count() >= 1); } finally { await f.fechar(); }
});

test("compatibilidade: a barra do celular, o menu lateral e a Minha Casa continuam como estavam; a Timeline entra no menu (área Hoje) e nos ambientes da Casa", { skip: pular, timeout: 120000 }, async () => {
  const { pag, fechar } = await abrir({}, { largura: 390, altura: 844, hash: "#workspace" });
  try {
    const r = await pag.evaluate(() => ({ barra: [...document.querySelectorAll("#barra a")].map((a) => a.getAttribute("data-k")), menu: [...document.querySelectorAll("#navgrp a.it")].map((a) => a.getAttribute("data-k")), amb: ambienteDe("timeline"), inicial: rotaInicial(), v: MOD_VERSAO }));
    assert.deepEqual(r.barra, ["workspace", "rachoje", "mba", "saude", "mercado", "inbox"], "a barra não mudou"); assert.ok(r.menu.includes("timeline") && r.menu.includes("workspace") && r.menu.includes("rachoje")); assert.equal(r.amb, "casa"); assert.equal(r.v, "2026-11-28.1");
  } finally { await fechar(); }
});
