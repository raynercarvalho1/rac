// Radar de Preços · descoberta pelo SerpApi: adaptador, cache, orçamento de buscas, expansão de lojas, rotina e higiene da chave (supabase/functions/radar/{serpapi,descoberta}.ts).
// Tudo com fetch e banco FALSOS: nenhuma chamada real ao SerpApi, nenhuma chave real, nenhum custo. A "chave" abaixo é um texto de teste.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { montarUrl, chaveDaConsulta, limparSegredo, chamarSerp, cotaDaConta, PARAMS_PERMITIDOS } from "../supabase/functions/radar/serpapi.ts";
import { descobrir, expandir, descobertaDaRotina, usoDescoberta, cotaDoProvedor, configDescoberta, orcamento, autorizar, prepararGravacao, provedoresDe } from "../supabase/functions/radar/descoberta.ts";
import { provedorSerpapi, registroDeProvedores, PROVEDORES_PLANEJADOS } from "../supabase/functions/radar/provedores.ts";
import { candidatosDoShopping, chaveObservacao } from "../supabase/functions/radar/ofertas.ts";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
import { KEY, UID, ITEM, ITEM_DADOS, T0, H, MIN, SHOP, LOJAS, fetchFalso, respostaPadrao, bancoFalso, montar } from "./radar_falsos.mjs";

/* ---------- adaptador ---------- */
test("adaptador: só os 3 engines e só os parâmetros da lista; a chave só vai no pedido (nunca em registro, chave de cache ou erro)", async () => {
  assert.deepEqual(Object.keys(PARAMS_PERMITIDOS).sort(), ["google_immersive_product", "google_product", "google_shopping"]);
  const u = montarUrl("google_shopping", { q: "creme", gl: "br", hl: "pt-br" }, KEY); assert.equal(typeof u, "string"); const x = new URL(u);
  assert.equal(x.origin + x.pathname, "https://serpapi.com/search.json"); assert.equal(x.searchParams.get("engine"), "google_shopping"); assert.equal(x.searchParams.get("api_key"), KEY);
  assert.match(montarUrl("google_shopping", { q: "x", api_key: "outra" }, KEY).erro, /não permitido/); assert.match(montarUrl("google_shopping", { q: "x", page_token: "t" }, KEY).erro, /não permitido/);
  assert.match(montarUrl("google_maps", { q: "x" }, KEY).erro, /engine/); assert.match(montarUrl("google_immersive_product", { page_token: "x".repeat(5000) }, KEY).erro, /grande demais/);
  assert.equal(montarUrl("google_shopping", { q: "x", gl: undefined, hl: "" }, KEY).includes("gl="), false, "vazio não vai");
  const k1 = chaveDaConsulta("google_shopping", { hl: "pt-br", q: "creme", gl: "br", no_cache: true }), k2 = chaveDaConsulta("google_shopping", { q: "creme", gl: "br", hl: "pt-br" });
  assert.equal(k1, k2, "ordem dos parâmetros e no_cache não mudam a chave"); assert.ok(!k1.includes("api_key") && !k1.includes(KEY));
  const longa = chaveDaConsulta("google_immersive_product", { page_token: "T".repeat(1700), more_stores: true }); assert.ok(longa.length < 200 && longa.includes("#"), "token longo vira resumo");
  assert.notEqual(chaveDaConsulta("google_immersive_product", { page_token: "A".repeat(1700) }), chaveDaConsulta("google_immersive_product", { page_token: "A".repeat(1699) + "B" }));
  assert.equal(limparSegredo("erro com " + KEY + " e api_key=" + KEY + "&x=1", KEY).includes(KEY), false);
});

test("adaptador: erros viram códigos claros, sem a chave; busca sem resultados é resposta válida e vazia", async () => {
  const via = (corpo, status = 200) => chamarSerp("google_shopping", { q: "x" }, KEY, fetchFalso(() => ({ status, body: corpo })));
  assert.equal((await chamarSerp("google_shopping", { q: "x" }, "", fetchFalso(respostaPadrao))).codigo, "sem_chave");
  assert.equal((await via({ error: "Invalid API key" }, 401)).codigo, "chave_recusada"); assert.equal((await via({}, 403)).codigo, "chave_recusada"); assert.equal((await via({ error: "limit" }, 429)).codigo, "limite");
  const e = await via({ error: "Invalid API key. Your key is " + KEY }); assert.equal(e.codigo, "erro_provedor"); assert.equal(e.mensagem.includes(KEY), false, "a chave ecoada pelo provedor é removida");
  assert.equal((await via({ search_metadata: { status: "Error" } })).codigo, "erro_provedor");
  const vazio = await via({ error: "Google hasn't returned any results for this query." }); assert.equal(vazio.ok, true); assert.deepEqual(vazio.json.shopping_results, []);
  const naoJson = await chamarSerp("google_shopping", { q: "x" }, KEY, async () => new Response("<html>", { status: 200 })); assert.equal(naoJson.codigo, "resposta_invalida");
  const rede = await chamarSerp("google_shopping", { q: "x" }, KEY, async (url) => { throw new Error("falhou em " + url); }); assert.equal(rede.codigo, "rede"); assert.equal(rede.mensagem.includes(KEY), false, "a URL (com a chave) não entra na mensagem");
  const tempo = await chamarSerp("google_shopping", { q: "x" }, KEY, async () => { throw Object.assign(new Error("abortado"), { name: "AbortError" }); }); assert.equal(tempo.codigo, "tempo_esgotado");
  const c = await cotaDaConta(KEY, fetchFalso(() => ({ body: { api_key: KEY, account_email: "alguem@exemplo.com", plan_name: "Free", searches_per_month: 250, this_month_usage: 3, plan_searches_left: 247, total_searches_left: 247, this_hour_searches: 1, account_rate_limit_per_hour: 50 } })));
  assert.deepEqual(c.cota, { searches_per_month: 250, this_month_usage: 3, plan_searches_left: 247, total_searches_left: 247, this_hour_searches: 1, account_rate_limit_per_hour: 50 });
  const txt = JSON.stringify(c); assert.ok(!txt.includes(KEY) && !txt.includes("alguem@") && !txt.includes("Free"), "e-mail, plano e chave nunca saem");
});

/* ---------- descobrir ---------- */
test("descobrir: variantes de consulta, candidatos classificados e gravados, consumo contado, e a chave nunca aparece no resultado nem no registro", async () => {
  const { banco, f, ctx } = montar(); const r = await descobrir(UID, { item_id: ITEM }, ctx);
  assert.equal(r.ok, true); assert.equal(r.consultas.length, 2, "2 variantes por busca (padrão)"); assert.deepEqual(r.consultas.map((c) => c.status), ["ok", "ok"]); assert.deepEqual(r.consultas.map((c) => c.gasto), [1, 1]);
  assert.equal(f.pedidos.length, 2); assert.ok(f.pedidos.every((p) => p.host === "serpapi.com" && p.caminho === "/search.json" && p.p.engine === "google_shopping" && p.p.gl === "br" && p.p.hl === "pt-br" && p.p.api_key === KEY));
  assert.match(f.pedidos[0].p.q, /Principia CH-02/); assert.equal(f.pedidos[1].p.q, "Principia CH-02");
  assert.equal(banco.cands.length, 3, "a mesma resposta nas duas variantes não duplica candidatos"); assert.deepEqual(banco.cands.map((c) => c.tipo_oferta).sort(), ["individual", "kit_mesmo_produto", "outra_apresentacao"]);
  assert.equal(r.consultas[1].novos, 0); assert.equal(r.consultas[1].atualizados, 3);
  assert.deepEqual([r.orcamento.dia_usado, r.orcamento.mes_usado, r.orcamento.dia_limite, r.orcamento.mes_limite], [2, 2, 20, 200]);
  for (const alvo of [r, banco.consultas, banco.cands]) assert.equal(JSON.stringify(alvo).includes(KEY), false, "a chave não está no resultado, nos registros nem nos candidatos");
  assert.ok(banco.consultas.every((c) => c.provedor === "serpapi" && c.engine === "google_shopping" && c.item_id === ITEM && c.buscas_gastas === 1 && !/api_key/.test(c.chave_cache)));
  assert.equal((await descobrir(UID, { item_id: "nao-existe" }, ctx)).erro, "item_nao_encontrado"); banco.itens[0].ativo = false; assert.equal((await descobrir(UID, { item_id: ITEM }, ctx)).erro, "item_arquivado");
});

test("cache de 24 h: a mesma consulta não gasta busca; forçar ou passar do prazo gasta", async () => {
  const { banco, f, t, ctx } = montar(); await descobrir(UID, { item_id: ITEM }, ctx); assert.equal(f.pedidos.length, 2);
  t.agora = T0 + 3 * H; const c = await descobrir(UID, { item_id: ITEM }, ctx); assert.deepEqual(c.consultas.map((x) => [x.status, x.gasto]), [["cache", 0], ["cache", 0]]); assert.equal(f.pedidos.length, 2, "nenhum pedido novo");
  assert.equal(c.orcamento.mes_usado, 2, "cache não conta"); assert.equal(banco.consultas.filter((x) => x.status === "cache").length, 2); assert.ok(banco.consultas.filter((x) => x.status === "cache").every((x) => x.buscas_gastas === 0 && x.cache_de));
  const forcada = await descobrir(UID, { item_id: ITEM, forcar: true, limiteConsultas: 1 }, ctx); assert.equal(forcada.consultas[0].status, "ok"); assert.equal(f.pedidos.length, 3);
  t.agora = T0 + 28 * H; const velho = await descobrir(UID, { item_id: ITEM, limiteConsultas: 1 }, ctx); assert.equal(velho.consultas[0].status, "ok", "passou de 24 h da última busca (a forçada às 3 h renovou o cache)"); assert.equal(f.pedidos.length, 4);
  assert.equal(banco.cands.length, 3); assert.equal(banco.cands.find((x) => x.titulo.startsWith("Kit 2")).precos_anteriores.length, 0, "preço igual não gera histórico");
});

test("orçamento: limite por dia e por mês bloqueiam ANTES da chamada; bloqueio, cache e erro não gastam", async () => {
  const dia = montar({ config: { limite_dia: 1 } }); const a = await descobrir(UID, { item_id: ITEM }, dia.ctx);
  assert.deepEqual(a.consultas.map((c) => c.status), ["ok", "bloqueada_orcamento"]); assert.equal(dia.f.pedidos.length, 1); assert.match(a.avisos.join(" "), /limite diário de buscas do RAC atingido \(1\/1\)/); assert.equal(dia.banco.consultas[1].erro_codigo, "orcamento_dia"); assert.equal(dia.banco.consultas[1].origem, "manual");
  assert.deepEqual(dia.banco.consultas.map((c) => [c.status, c.buscas_gastas]), [["ok", 1], ["bloqueada_orcamento", 0]]);
  const mes = montar({ config: { limite_mensal: 0 } }); const b = await descobrir(UID, { item_id: ITEM }, mes.ctx); assert.equal(mes.f.pedidos.length, 0); assert.equal(b.consultas[0].status, "bloqueada_orcamento");
  const amanha = montar({ config: { limite_dia: 1 } }); await descobrir(UID, { item_id: ITEM, limiteConsultas: 1 }, amanha.ctx); amanha.t.agora = T0 + 30 * H; const c = await descobrir(UID, { item_id: ITEM, limiteConsultas: 1 }, amanha.ctx);
  assert.equal(c.consultas[0].status, "ok", "o limite por dia volta no dia seguinte (de Brasília)");
  const cfg = configDescoberta({ limite_mensal: 99999, limite_dia: -3, consultas_por_busca: 9, ttl_cache_h: "x", ttl_token_min: 1, dominio_google: "evil.com/x", rotina: { ativa: "sim", max_itens: 50 } });
  assert.deepEqual(cfg, { limite_mensal: 200, limite_dia: 20, limite_expansoes_dia: 10, consultas_por_busca: 2, ttl_cache_h: 24, ttl_token_min: 30, dominio_google: "", custos: { google_shopping: 1, google_immersive_product: 1, google_product: 1 }, limites_engine: { google_shopping: { dia: null, mes: null }, google_immersive_product: { dia: null, mes: null }, google_product: { dia: null, mes: null } }, rotina: { ativa: false, max_itens: 3, limite_dia: 6 } }, "valores fora da faixa voltam ao padrão seguro");
  assert.equal(configDescoberta({ dominio_google: "google.com.br" }).dominio_google, "google.com.br"); assert.equal(configDescoberta({ rotina: { ativa: true } }).rotina.ativa, true);
  /* o mês e o dia contam pelo fuso de Brasília */
  const o = orcamento([{ iniciada_em: "2026-12-01T01:00:00Z", buscas_gastas: 1 }, { iniciada_em: "2026-11-01T02:00:00Z", buscas_gastas: 1 }], configDescoberta({}), Date.parse("2026-11-30T23:00:00Z"));
  assert.deepEqual([o.mes_usado, o.dia_usado], [1, 1], "01/12 01:00 UTC ainda é 30/11 em Brasília; 01/11 02:00 UTC é 31/10");
});

test("erros do provedor: não gastam busca, ficam registrados com o código, e erro fatal (chave, limite) interrompe as demais variantes", async () => {
  for (const [status, codigo] of [[429, "limite"], [401, "chave_recusada"]]) {
    const m = montar({}, () => ({ status, body: { error: "x" } })); const r = await descobrir(UID, { item_id: ITEM }, m.ctx);
    assert.deepEqual(r.consultas.map((c) => [c.status, c.gasto, c.erro?.codigo]), [["erro", 0, codigo]]); assert.equal(m.f.pedidos.length, 1, "parou na primeira"); assert.equal(m.banco.consultas[0].erro_codigo, codigo); assert.equal(m.banco.consultas[0].buscas_gastas, 0);
  }
  const eco = montar({}, () => ({ body: { error: "Invalid API key " + KEY, search_metadata: { status: "Error" } } })); const e = await descobrir(UID, { item_id: ITEM }, eco.ctx);
  assert.equal(e.consultas.length, 2, "erro comum não interrompe"); assert.equal(JSON.stringify([e, eco.banco.consultas]).includes(KEY), false);
  const vazio = montar({}, () => ({ body: { error: "Google hasn't returned any results for this query." } })); const v = await descobrir(UID, { item_id: ITEM, limiteConsultas: 1 }, vazio.ctx);
  assert.deepEqual([v.consultas[0].status, v.consultas[0].resultados, v.consultas[0].gasto], ["ok", 0, 1]); assert.match(v.avisos.join(" "), /não trouxe anúncios/);
  const sem = montar(); sem.ctx.chave = ""; const s = await descobrir(UID, { item_id: ITEM, limiteConsultas: 1 }, sem.ctx); assert.equal(s.consultas[0].erro.codigo, "sem_chave"); assert.equal(sem.f.pedidos.length, 0);
});

test("preço que muda entre as buscas: o anúncio continua o mesmo, guarda o preço anterior e preserva a decisão do dono", async () => {
  const m = montar(); await descobrir(UID, { item_id: ITEM, limiteConsultas: 1 }, m.ctx); const kit = m.banco.cands.find((c) => c.titulo.startsWith("Kit 2")); kit.decisao = "acompanhando"; kit.oferta_id = "o1";
  m.f.pedidos.length = 0; const novo = JSON.parse(JSON.stringify(SHOP)); novo.shopping_results[1].price = "R$ 119,90"; novo.shopping_results[1].extracted_price = 119.9;
  const m2 = Object.assign(m, {}); const f2 = fetchFalso(() => ({ body: novo })); m.ctx.fetch = f2; m.t.agora = T0 + 30 * H;
  const r = await descobrir(UID, { item_id: ITEM, limiteConsultas: 1 }, m.ctx); assert.equal(r.consultas[0].status, "ok"); assert.equal(m2.banco.cands.length, 3, "nenhum anúncio duplicado ou perdido");
  const k2 = m.banco.cands.find((c) => c.titulo.startsWith("Kit 2")); assert.equal(k2.preco, 119.9); assert.equal(k2.preco_por_medida, 13.2); assert.deepEqual(k2.precos_anteriores.map((x) => x.preco), [133.92]); assert.equal(k2.decisao, "acompanhando"); assert.equal(k2.oferta_id, "o1");
});

/* ---------- expandir ---------- */
async function comCandidatos(config = {}) { const m = montar({ config }); await descobrir(UID, { item_id: ITEM, limiteConsultas: 1 }, m.ctx); m.f.pedidos.length = 0; return m; }
const achar = (m, ini) => m.banco.cands.find((c) => c.titulo.startsWith(ini));

test("expandir (immersive): usa o token do anúncio com more_stores, grava as lojas ligadas ao anúncio, herda a classificação e usa cache", async () => {
  const m = await comCandidatos(), c = achar(m, "Kit 2"); const r = await expandir(UID, { candidato_id: c.id }, m.ctx);
  assert.deepEqual([r.ok, r.status, r.lojas, r.gasto, r.novos], [true, "ok", 2, 1, 2]); const p = m.f.pedidos[0];
  assert.equal(p.p.engine, "google_immersive_product"); assert.equal(p.p.page_token, "TOKEN-B"); assert.equal(p.p.more_stores, "true"); assert.ok(!("q" in p.p));
  const lojas = m.banco.cands.filter((x) => x.pai_externo === c.id_externo); assert.equal(lojas.length, 2); assert.ok(lojas.every((x) => x.tipo_oferta === "kit_mesmo_produto" && x.engine === "google_immersive_product" && x.link_tipo === "loja" && x.page_token === null));
  const d = lojas.find((x) => x.loja === "Drogasil"); assert.deepEqual([d.preco, d.preco_por_medida, d.total, d.frete_situacao, d.frete_valor], [130, 14.32, 139.9, "informado_provedor", 9.9]); assert.equal(lojas.find((x) => x.loja === "Loja Grátis").frete_situacao, "gratis_informado_provedor");
  const again = await expandir(UID, { candidato_id: c.id }, m.ctx); assert.deepEqual([again.status, again.gasto], ["cache", 0]); assert.equal(m.f.pedidos.length, 1, "o cache não chama o provedor");
  assert.equal(JSON.stringify([m.banco.cands, m.banco.consultas]).includes(KEY), false);
});

test("expandir: token vencido não gasta busca (a documentação não informa a validade); forçar tenta; sem token e sem identificador são avisos; erro do provedor invalida o token", async () => {
  const m = await comCandidatos(), kit = achar(m, "Kit 2"), cat = achar(m, "Creme Hidratante Principia Ch-02"), semToken = achar(m, "Creme Hidratante Corporal Principia CH-02, 250g");
  m.t.agora = T0 + 31 * MIN; const v = await expandir(UID, { candidato_id: kit.id }, m.ctx); assert.equal(v.erro, "token_vencido"); assert.match(v.mensagem, /30 min/); assert.equal(m.f.pedidos.length, 0);
  const f = await expandir(UID, { candidato_id: kit.id, forcar: true }, m.ctx); assert.equal(f.ok, true); assert.equal(m.f.pedidos.length, 1);
  assert.equal((await expandir(UID, { candidato_id: semToken.id }, m.ctx)).erro, "sem_token");
  const vencidoSemCatalogo = await expandir(UID, { candidato_id: achar(m, "Kit 2").id, engine: "produto" }, m.ctx); assert.equal(vencidoSemCatalogo.erro === "sem_identificador" || vencidoSemCatalogo.ok === true, true);
  const p = await expandir(UID, { candidato_id: cat.id, engine: "produto" }, m.ctx); assert.equal(p.erro, undefined, "token vencido + anúncio de catálogo: usa o product_id"); const ult = m.f.pedidos.at(-1).p;
  assert.deepEqual([ult.engine, ult.product_id, ult.offer_view, ult.gl, ult.hl], ["google_product", "P1", "true", "br", "pt-br"]); assert.ok(!("page_token" in ult));
  const ruim = montar({}, (engine) => (engine === "google_shopping" ? { body: SHOP } : { body: { error: "page token expired " + KEY, search_metadata: { status: "Error" } } })); await descobrir(UID, { item_id: ITEM, limiteConsultas: 1 }, ruim.ctx);
  const alvo = achar(ruim, "Kit 2"), e = await expandir(UID, { candidato_id: alvo.id }, ruim.ctx); assert.equal(e.ok, false); assert.equal(e.erro, "erro_provedor"); assert.equal(e.mensagem.includes(KEY), false);
  assert.deepEqual(ruim.banco.invalidados, [alvo.id]); assert.equal(achar(ruim, "Kit 2").page_token, null, "token que o provedor recusou não é reutilizado");
  assert.equal((await expandir(UID, { candidato_id: "nao-existe" }, ruim.ctx)).erro, "candidato_nao_encontrado");
  const sob = await comCandidatos({ limite_dia: 1 }); const sb = await expandir(UID, { candidato_id: achar(sob, "Kit 2").id }, sob.ctx); assert.equal(sb.erro, "orcamento"); assert.equal(sob.f.pedidos.length, 0, "orçamento esgotado: nenhuma chamada");
});

/* ---------- rotina, uso e cota ---------- */
test("rotina: desligada por padrão (não gasta nada); ligada, faz 1 consulta por produto monitorado, respeita o máximo de produtos e o orçamento", async () => {
  const itens = [1, 2, 3].map((n) => ({ ...ITEM_DADOS, id: "bbbbbbbb-0000-4000-8000-00000000000" + n, nome: "Produto " + n + " CH-0" + n })), off = montar({ itens });
  assert.deepEqual(await descobertaDaRotina(UID, off.ctx), { pulada: "desligada" }); assert.equal(off.f.pedidos.length, 0);
  const on = montar({ itens, config: { rotina: { ativa: true, max_itens: 2 } } }); const r = await descobertaDaRotina(UID, on.ctx);
  assert.deepEqual([r.consultas, r.gastas, r.cache, r.erros, r.parou], [2, 2, 0, 0, null]); assert.equal(on.f.pedidos.length, 2, "só 2 produtos, 1 consulta cada");
  const r2 = await descobertaDaRotina(UID, on.ctx); assert.deepEqual([r2.gastas, r2.cache], [0, 2], "a segunda rodada do mesmo dia usa o cache");
  const apertado = montar({ itens, config: { limite_dia: 1, rotina: { ativa: true, max_itens: 3 } } }); const r3 = await descobertaDaRotina(UID, apertado.ctx); assert.equal(r3.parou, "orcamento"); assert.equal(apertado.f.pedidos.length, 1);
});

test("uso e cota: o RAC informa o que contou; a cota real do provedor vem de um endpoint à parte, só com números", async () => {
  const m = await comCandidatos(); const u = await usoDescoberta(UID, m.ctx); assert.deepEqual([u.ok, u.orcamento.mes_usado, u.orcamento.restante], [true, 1, 19]); assert.equal(u.config.rotina.ativa, false);
  const c = montar({}, () => ({ body: { api_key: KEY, account_email: "alguem@exemplo.com", this_month_usage: 1, total_searches_left: 249 } })); const cota = await cotaDoProvedor(c.ctx);
  assert.equal(cota.ok, true); assert.equal(cota.cota.this_month_usage, 1); assert.ok(!JSON.stringify(cota).includes("alguem@") && !JSON.stringify(cota).includes(KEY)); assert.equal(c.f.pedidos[0].caminho, "/account.json");
  const sem = montar(); sem.ctx.chave = ""; assert.equal((await cotaDoProvedor(sem.ctx)).erro, "sem_chave");
});

test("gravação: anúncio com outro preço vira o mesmo anúncio (histórico), dois preços do mesmo título na rodada ficam os dois, nada é descartado", () => {
  const novos = candidatosDoShopping(SHOP, ITEM_DADOS, "2026-11-11T21:00:00Z"), ex = novos.map((c, i) => ({ ...c, id: "e" + i, item_id: ITEM, decisao: "pendente", oferta_id: null }));
  const mudou = { ...novos[1], preco: 100, chave_dedup: novos[1].chave_dedup.replace(/\|[\d.-]+$/, "|100.00") }, dupla = { ...novos[0], preco: 55, chave_dedup: novos[0].chave_dedup.replace(/\|[\d.-]+$/, "|55.00") };
  const g = prepararGravacao(ex, [mudou, dupla, novos[0]]); assert.equal(g.atualizar.length, 2, "kit mudou de preço e o 1º anúncio reapareceu"); assert.equal(g.inserir.length, 1, "o segundo preço do mesmo título entra como novo");
  assert.deepEqual(g.atualizar.find((x) => x.id === "e1").precos_anteriores.map((p) => p.preco), [133.92]); assert.equal(g.atualizar.find((x) => x.id === "e1").id, "e1");
  assert.deepEqual(prepararGravacao([], [novos[0], novos[0]]).inserir.length, 1, "repetido idêntico na mesma resposta entra uma vez");
});

/* ---------- o código do servidor ---------- */
test("higiene: a chave só é lida em index.ts pelo nome do Secret, nunca é registrada, e o adaptador só fala com serpapi.com", () => {
  const idx = ler("supabase/functions/radar/index.ts"), serp = ler("supabase/functions/radar/serpapi.ts"), desc = ler("supabase/functions/radar/descoberta.ts"), of = ler("supabase/functions/radar/ofertas.ts");
  const linhasChave = idx.split("\n").filter((l) => l.includes("SERPAPI_API_KEY")); assert.ok(linhasChave.length >= 3);
  assert.ok(linhasChave.every((l) => /ambiente\("SERPAPI_API_KEY"\)|^\s*\/\/|\/\*|mensagem:/.test(l)), "o Secret só é citado pelo nome (ambiente(...)), em comentário ou em mensagem");
  const prov = ler("supabase/functions/radar/provedores.ts"); for (const [nome, t] of [["serpapi.ts", serp], ["descoberta.ts", desc], ["ofertas.ts", of], ["provedores.ts", prov]]) { assert.ok(!/console\.(log|info|debug|error|warn)/.test(t), nome + " não escreve em log"); assert.ok(!/Deno\./.test(t), nome + " é puro (sem Deno)"); assert.ok(!/from\("(?!radar_)/.test(t), nome + " não toca tabela alheia"); }
  assert.ok(!/console\.(log|info|debug)/.test(idx), "index.ts sem console.log"); assert.ok(!/json\([^)]*\b(ctx\.chave|chaveSerp)\b/.test(idx), "nenhuma resposta leva a chave");
  const urls = [...serp.matchAll(/https?:\/\/[a-z0-9./?=_-]+/gi)].map((m) => m[0]).filter((u) => !/^https:\/\/serpapi\.com\//.test(u)); assert.deepEqual(urls, [], "só serpapi.com");
  assert.ok(idx.indexOf('"descobrir", "expandir"') > idx.indexOf("sem_permissao"), "a descoberta só vem depois do login e da recusa à casa");
  assert.match(idx, /MigracaoPendente/); assert.match(idx, /migracao_pendente/); assert.ok(!/garmin|rac-ia/i.test(semComentarios(serp + desc + of + prov)), "o código não toca Garmin nem rac-ia (só comentários citam a rac-ia)");
  assert.ok(!/\.(insert|update|upsert|delete)\([^)]*"pessoal"|from\("pessoal"\)\.(insert|update|upsert|delete)/.test(idx.slice(idx.indexOf("function bancoDescobertaSupabase"))), "a descoberta só LÊ a configuração em pessoal");
  assert.match(idx, /rotina_rpc_rac_rotina_ok[\s\S]*chaveSerp/, "a descoberta da rotina vem depois da senha da rotina");
});

/* ---------- orçamento por operação, incerto, limites, provedores e histórico (auditoria final) ---------- */
const SHOP2 = { search_metadata: { status: "Success" }, shopping_results: [
  ...SHOP.shopping_results,
  { title: "Principia, Kit Cremes Hidratantes Facial e Corporal CH-01 + CH-02", product_id: "P4", product_link: "https://www.google.com/search?ibp=oshop&prds=productid:P4", source: "Droga Raia", price: "R$ 74,80", extracted_price: 74.8 },
  { title: "Principia Kit Antissinais Trio Ch + Pm + Gr", product_id: "P5", product_link: "https://www.google.com/search?ibp=oshop&prds=productid:P5", source: "principiaskin.com", price: "R$ 227,00", extracted_price: 227 },
] };

test("orçamento por operação: busca, expansão (immersive) e Google Product contam no MESMO orçamento, separadas por engine e por origem; o resultado mostra cada uma", async () => {
  const m = await comCandidatos(), kit = achar(m, "Kit 2"), cat = achar(m, "Creme Hidratante Principia Ch-02");
  await expandir(UID, { candidato_id: kit.id }, m.ctx); await expandir(UID, { candidato_id: cat.id, engine: "produto" }, m.ctx);
  const u = await usoDescoberta(UID, m.ctx), o = u.orcamento;
  assert.deepEqual([o.dia_usado, o.mes_usado, o.expansoes_dia], [3, 3, 2]); assert.deepEqual(o.por_engine, { google_shopping: { dia: 1, mes: 1 }, google_immersive_product: { dia: 1, mes: 1 }, google_product: { dia: 1, mes: 1 } });
  assert.deepEqual(o.por_origem, { manual: { dia: 3, mes: 3 } }); assert.deepEqual(m.banco.consultas.map((c) => c.engine), ["google_shopping", "google_immersive_product", "google_product"]); assert.ok(m.banco.consultas.every((c) => c.provedor === "serpapi" && c.origem === "manual"));
  assert.deepEqual(u.custos, { google_shopping: 1, google_immersive_product: 1, google_product: 1 });
});

test("limites próprios: expansões de lojas têm teto diário (a busca continua livre) e a rotina tem teto diário próprio (a busca manual continua livre); o bloqueio diz o motivo", async () => {
  const m = await comCandidatos({ limite_expansoes_dia: 1 }), kit = achar(m, "Kit 2"), cat = achar(m, "Creme Hidratante Principia Ch-02");
  assert.equal((await expandir(UID, { candidato_id: kit.id }, m.ctx)).ok, true); const b = await expandir(UID, { candidato_id: cat.id, engine: "produto" }, m.ctx);
  assert.equal(b.erro, "orcamento"); assert.match(b.mensagem, /limite diário de expansões de lojas atingido \(1\/1\)/); assert.equal(m.banco.consultas.at(-1).erro_codigo, "orcamento_expansoes"); assert.equal(m.banco.consultas.at(-1).buscas_gastas, 0);
  m.t.agora = T0 + 1 * H; const busca = await descobrir(UID, { item_id: ITEM, limiteConsultas: 1, forcar: true }, m.ctx); assert.equal(busca.consultas[0].status, "ok", "o teto de expansões não bloqueia a busca");
  const itens = [1, 2, 3].map((n) => ({ ...ITEM_DADOS, id: "bbbbbbbb-0000-4000-8000-00000000000" + n, nome: "Produto " + n + " CH-0" + n })), r = montar({ itens, config: { rotina: { ativa: true, max_itens: 3, limite_dia: 1 } } });
  const res = await descobertaDaRotina(UID, r.ctx); assert.deepEqual([res.gastas, res.parou], [1, "orcamento"]); assert.equal(r.banco.consultas.find((c) => c.status === "bloqueada_orcamento").erro_codigo, "orcamento_rotina");
  assert.ok(r.banco.consultas.filter((c) => c.status === "ok").every((c) => c.origem === "rotina"), "o que a rotina gasta fica marcado como rotina");
  const manual = await descobrir(UID, { item_id: itens[2].id, limiteConsultas: 1 }, r.ctx); assert.equal(manual.consultas[0].status, "ok", "o teto da rotina não bloqueia o dono"); const o = (await usoDescoberta(UID, r.ctx)).orcamento;
  assert.deepEqual([o.por_origem.rotina.dia, o.por_origem.manual.dia, o.rotina_dia, o.rotina_limite_dia], [1, 1, 1, 1]);
  assert.deepEqual(autorizar({ ...o, rotina_dia: 0, mes_usado: 199, dia_usado: 0 }, { engine: "google_shopping", origem: "manual", custo: 2 }).motivo, "mes", "custo maior que o saldo bloqueia antes");
});

test("custo por engine configurável (nunca abaixo de 1) e contado na mesma conta; o provedor não documenta o custo dos engines de loja", async () => {
  const m = await comCandidatos({ custo_por_engine: { google_immersive_product: 3, google_product: 0 } }), kit = achar(m, "Kit 2"), cat = achar(m, "Creme Hidratante Principia Ch-02");
  const a = await expandir(UID, { candidato_id: kit.id }, m.ctx); assert.equal(a.gasto, 3); const b = await expandir(UID, { candidato_id: cat.id, engine: "produto" }, m.ctx); assert.equal(b.gasto, 1, "valor inválido volta ao mínimo de 1");
  assert.equal((await usoDescoberta(UID, m.ctx)).orcamento.dia_usado, 5, "1 busca + 3 + 1"); assert.deepEqual(m.banco.consultas.map((c) => c.buscas_gastas), [1, 3, 1]);
});

test("resultado incerto (rede, tempo esgotado, resposta ilegível, 5xx) RETÉM o crédito e interrompe; erro definitivo, vazio válido e bloqueio não retêm", async () => {
  const falhas = [["rede", () => { throw new Error("queda de rede " + KEY); }], ["tempo", () => { throw Object.assign(new Error("x"), { name: "AbortError" }); }], ["5xx", () => ({ status: 503, body: { error: "indisponível" } })], ["ilegivel", null]];
  for (const [nome, resp] of falhas) {
    const m = montar({}, resp ?? (() => ({ body: "texto" }))); if (!resp) m.ctx.fetch = async () => new Response("<html>", { status: 200 });
    const r = await descobrir(UID, { item_id: ITEM }, m.ctx); const c = m.banco.consultas[0];
    assert.deepEqual([c.status, c.buscas_gastas], ["incerto", 1], nome); assert.deepEqual([r.consultas.length, r.consultas[0].status, r.consultas[0].gasto], [1, "incerto", 1], nome + ": para na primeira (conservador)"); assert.match(r.avisos.join(" "), /incerta/);
    assert.equal(r.orcamento.dia_usado, 1, "o crédito incerto entra no orçamento"); assert.equal(JSON.stringify([r, m.banco.consultas]).includes(KEY), false, nome + ": sem a chave");
  }
  for (const [status, corpo] of [[401, { error: "x" }], [429, { error: "x" }], [200, { error: "Invalid parameter", search_metadata: { status: "Error" } }]]) { const m = montar({}, () => ({ status, body: corpo })); await descobrir(UID, { item_id: ITEM, limiteConsultas: 1 }, m.ctx); assert.deepEqual([m.banco.consultas[0].status, m.banco.consultas[0].buscas_gastas], ["erro", 0], "erro definitivo " + status); }
  const vazio = montar({}, () => ({ body: { error: "Google hasn't returned any results for this query." } })); await descobrir(UID, { item_id: ITEM, limiteConsultas: 1 }, vazio.ctx); assert.deepEqual([vazio.banco.consultas[0].status, vazio.banco.consultas[0].buscas_gastas], ["ok", 1], "vazio válido conta, como diz a documentação");
  const e = montar({}, (engine) => (engine === "google_shopping" ? { body: SHOP } : { status: 502, body: { error: "gateway" } })); await descobrir(UID, { item_id: ITEM, limiteConsultas: 1 }, e.ctx); const x = await expandir(UID, { candidato_id: achar(e, "Kit 2").id }, e.ctx);
  assert.deepEqual([x.ok, x.erro, x.incerto, x.gasto], [false, "erro_provedor", true, 1]); assert.equal(e.banco.invalidados.length, 0, "token não é invalidado quando o resultado é incerto"); assert.equal((await usoDescoberta(UID, e.ctx)).orcamento.dia_usado, 2);
});

test("provedores: o SerpApi é UM provedor com 3 engines; os demais estão só registrados (planejado) e NUNCA são chamados; um segundo provedor ativo entra sem mudar o orquestrador", async () => {
  const reg = registroDeProvedores([provedorSerpapi(KEY, fetchFalso(respostaPadrao))]); assert.deepEqual(reg.filter((x) => x.estado === "ativo").map((x) => [x.id, x.engines]), [["serpapi", ["google_shopping", "google_immersive_product", "google_product"]]]);
  assert.deepEqual(PROVEDORES_PLANEJADOS.map((x) => x.id), ["mercadolivre", "vtex_paginas", "consulta_direta_lojas", "afiliados"]); assert.ok(PROVEDORES_PLANEJADOS.every((x) => x.estado === "planejado" && x.motivo.length > 20));
  const u = await usoDescoberta(UID, montar().ctx); assert.deepEqual(u.provedores.filter((x) => x.estado === "planejado").map((x) => x.id), PROVEDORES_PLANEJADOS.map((x) => x.id));
  /* um provedor planejado nunca é chamado; um segundo provedor ativo recebe as buscas e é contado com o próprio nome */
  const chamadas = []; const falso = (id, estado) => ({ id, nome: id, estado, custos: { busca_x: 1 }, planejarBusca: (v) => ({ engine: "busca_x", chave_cache: id + ":" + v.q, consulta: v.q, params: {} }),
    executarBusca: async (plano, intencao, iso) => { chamadas.push(id); return { ok: true, status: 200, candidatos: candidatosDoShopping({ shopping_results: [{ title: "Creme Principia CH-02 454g", product_id: id + "1", source: "Loja " + id, price: "R$ 50,00", extracted_price: 50 }] }, intencao, iso).map((c) => ({ ...c, provedor: id, engine: "busca_x" })) }; },
    planejarExpansao: () => ({ erro: "nao_suportado", mensagem: "sem expansão" }), executarExpansao: async () => { throw new Error("não deveria"); } });
  const m = montar(); m.ctx.provedores = [falso("planejado_x", "planejado"), falso("outro", "ativo")]; const r = await descobrir(UID, { item_id: ITEM, limiteConsultas: 1 }, m.ctx);
  assert.deepEqual(chamadas, ["outro"], "só o provedor ativo é chamado"); assert.equal(r.consultas[0].provedor, "outro"); assert.equal(m.banco.consultas[0].provedor, "outro"); assert.equal(m.banco.cands[0].provedor, "outro"); assert.equal(m.f.pedidos.length, 0, "o SerpApi não foi chamado");
  assert.equal((await expandir(UID, { candidato_id: m.banco.cands[0].id }, m.ctx)).erro, "nao_suportado"); m.ctx.provedores = [falso("somente_planejado", "planejado")]; assert.equal((await expandir(UID, { candidato_id: m.banco.cands[0].id }, m.ctx)).erro, "provedor_indisponivel");
  assert.equal(provedoresDe(montar().ctx)[0].id, "serpapi");
});

test("histórico por IDENTIDADE do produto: a série não depende da loja nem do anúncio; kit, combo e outro tamanho têm apresentação própria; relacionado não entra em série; cache e preço igual não duplicam", async () => {
  const m = montar({}, (engine) => (engine === "google_shopping" ? { body: SHOP2 } : { body: LOJAS })); await descobrir(UID, { item_id: ITEM, limiteConsultas: 1 }, m.ctx);
  const h = m.banco.hist; assert.equal(h.length, 5, "uma observação por anúncio com preço (nada é descartado)"); const por = (ini) => h.find((x) => x.titulo.startsWith(ini));
  assert.deepEqual([por("Creme Hidratante Principia Ch-02"), por("Kit 2"), por("Creme Hidratante Corporal Principia CH-02, 250g")].map((x) => [x.produto_chave, x.apresentacao_chave]), [["principia|ch02", "sem_medida"], ["principia|ch02", "2x454g"], ["principia|ch02", "250g"]], "mesmo produto, apresentações distintas");
  assert.deepEqual([por("Principia, Kit Cremes").produto_chave, por("Principia, Kit Cremes").apresentacao_chave], ["combo:ch01+ch02", "combo"], "combo é outro produto"); assert.equal(por("Principia Kit Antissinais").produto_chave, null, "relacionado não entra em série");
  assert.ok(h.every((x) => x.preco > 0 && x.consulta_id && x.observado_em && x.provedor === "serpapi"));
  const antes = h.length; await descobrir(UID, { item_id: ITEM, limiteConsultas: 1 }, m.ctx); assert.equal(h.length, antes, "cache: nenhuma observação nova");
  m.t.agora = T0 + 2 * H; await descobrir(UID, { item_id: ITEM, limiteConsultas: 1, forcar: true }, m.ctx); assert.equal(h.length, antes, "mesmo preço, menos de 20 h: não duplica");
  m.t.agora = T0 + 21 * H; await descobrir(UID, { item_id: ITEM, limiteConsultas: 1, forcar: true }, m.ctx); assert.equal(h.length, antes * 2, "passou de 20 h: uma nova observação de cada anúncio");
  /* troca de loja e de anúncio: as lojas do kit entram na MESMA série do kit (mesma identidade e apresentação) */
  const kit = achar(m, "Kit 2"); await expandir(UID, { candidato_id: kit.id }, m.ctx); const serie = h.filter((x) => x.produto_chave === "principia|ch02" && x.apresentacao_chave === "2x454g");
  assert.deepEqual([...new Set(serie.map((x) => x.loja))].sort(), ["Drogasil", "Loja Grátis", "Magalu"], "a série atravessa lojas e anúncios"); assert.ok(serie.some((x) => x.engine === "google_immersive_product"));
  assert.ok(!h.some((x) => x.apresentacao_chave === "2x454g" && x.produto_chave !== "principia|ch02"), "nada de outro produto na série do kit");
  /* preço mudou: nova observação, preço anterior preservado no candidato */
  const novo = JSON.parse(JSON.stringify(SHOP2)); novo.shopping_results[1].price = "R$ 119,90"; novo.shopping_results[1].extracted_price = 119.9; m.ctx.fetch = fetchFalso(() => ({ body: novo })); m.t.agora = T0 + 40 * H;
  const n0 = h.length; await descobrir(UID, { item_id: ITEM, limiteConsultas: 1, forcar: true }, m.ctx); assert.equal(h.filter((x) => x.observado_em === new Date(m.t.agora).toISOString()).length, h.length - n0); assert.ok(h.some((x) => x.titulo.startsWith("Kit 2") && x.preco === 119.9));
  assert.deepEqual(achar(m, "Kit 2").precos_anteriores.at(-1).preco, 133.92);
});
