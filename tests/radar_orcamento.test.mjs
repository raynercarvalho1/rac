// Radar de Preços · orçamento atômico e contabilização das respostas da descoberta (supabase/functions/radar/{descoberta,serpapi,index}.ts).
// Só mocks e fixtures: NENHUMA chamada real ao SerpApi, nenhuma chave real, nenhum crédito, nenhum banco real. A regra do banco está em radar_orcamento_sql.test.mjs (PGlite).
// Aqui se prova o orquestrador: ele nunca decide o orçamento sozinho (só pede a reserva ao banco), conta cada tipo de resposta do jeito certo e trata falhas DEPOIS da chamada externa sem perder nem repetir crédito.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { descobrir, expandir, descobertaDaRotina, usoDescoberta, configDescoberta } from "../supabase/functions/radar/descoberta.ts";
import { chamarSerp } from "../supabase/functions/radar/serpapi.ts";
import { KEY, UID, ITEM, ITEM_DADOS, T0, MIN, H, SHOP, fetchFalso, montar } from "./radar_falsos.mjs";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const ITEM_B = { ...ITEM_DADOS, id: "bbbbbbbb-0000-4000-8000-000000000002", nome: "Sabonete Líquido Exemplo SB-09", marca: "Exemplo", modelo: "SB-09", apresentacao: "300 ml", gtin: null };
const ITEM_C = { ...ITEM_DADOS, id: "bbbbbbbb-0000-4000-8000-000000000003", nome: "Shampoo Exemplo SH-07", marca: "Exemplo", modelo: "SH-07", apresentacao: "400 ml", gtin: null };
const achar = (m, ini) => m.banco.cands.find((c) => c.titulo.startsWith(ini));
const um = { limiteConsultas: 1 };
const lento = (ms = 1) => () => new Promise((r) => setTimeout(r, ms));
const gasto = (m) => m.banco.consultas.reduce((s, c) => s + (c.buscas_gastas || 0), 0);

/* ---------- 1) concorrência: o último crédito ---------- */
test("duas chamadas simultâneas disputando o ÚLTIMO crédito: só uma chega ao provedor (a reserva é do banco, não uma checagem em JavaScript)", async () => {
  const m = montar({ itens: [ITEM_DADOS, ITEM_B], config: { limite_dia: 1 } }); m.banco.latencia = lento();
  const [a, b] = await Promise.all([descobrir(UID, { item_id: ITEM, ...um }, m.ctx), descobrir(UID, { item_id: ITEM_B.id, ...um }, m.ctx)]);
  assert.equal(m.f.pedidos.length, 1, "um único pedido ao provedor"); assert.deepEqual([a.consultas[0].status, b.consultas[0].status].sort(), ["bloqueada_orcamento", "ok"]);
  assert.equal(gasto(m), 1, "o total reservado é 1, nunca 2"); assert.equal(m.banco.consultas.filter((c) => c.status === "bloqueada_orcamento")[0].erro_codigo, "orcamento_dia");
  /* a decisão não vem da leitura do uso: com a leitura (usos) enganada, devolvendo sempre vazio, o limite continua valendo */
  const e = montar({ itens: [ITEM_DADOS, ITEM_B, ITEM_C], config: { limite_dia: 1 } }); e.banco.latencia = lento(); e.banco.usos = async () => [];
  await Promise.all([ITEM, ITEM_B.id, ITEM_C.id].map((id) => descobrir(UID, { item_id: id, ...um }, e.ctx))); assert.equal(e.f.pedidos.length, 1, "uma leitura de uso velha ou vazia não libera crédito");
  /* 5 disputam 3, no dia e no mês */
  for (const cfg of [{ limite_dia: 3 }, { limite_mensal: 3 }]) {
    const itens = [1, 2, 3, 4, 5].map((n) => ({ ...ITEM_DADOS, id: "bbbbbbbb-0000-4000-8000-00000000001" + n, nome: "Produto " + n + " ZZ-0" + n, modelo: "ZZ-0" + n }));
    const x = montar({ itens, config: cfg }); x.banco.latencia = lento(); await Promise.all(itens.map((i) => descobrir(UID, { item_id: i.id, ...um }, x.ctx)));
    assert.equal(x.f.pedidos.length, 3, JSON.stringify(cfg)); assert.equal(gasto(x), 3); assert.equal(x.banco.consultas.filter((c) => c.status === "bloqueada_orcamento").length, 2);
  }
});

test("a MESMA consulta em dois toques simultâneos é paga uma vez só (em andamento), inclusive forçada", async () => {
  const m = montar(); m.banco.latencia = lento();
  const [a, b, c] = await Promise.all([descobrir(UID, { item_id: ITEM, ...um }, m.ctx), descobrir(UID, { item_id: ITEM, ...um }, m.ctx), descobrir(UID, { item_id: ITEM, forcar: true, ...um }, m.ctx)]);
  assert.equal(m.f.pedidos.length, 1); assert.deepEqual([a, b, c].map((r) => r.consultas[0].status).sort(), ["em_andamento", "em_andamento", "ok"]); assert.equal(gasto(m), 1);
  assert.match([a, b, c].flatMap((r) => r.avisos).join(" "), /já está em andamento: nada foi cobrado de novo/);
  const d = await descobrir(UID, { item_id: ITEM, ...um }, m.ctx); assert.equal(d.consultas[0].status, "cache", "depois de concluída, é cache");
});

test("rotina e operação manual simultâneas disputando o mesmo crédito: uma só gasta; a origem de cada uma fica marcada", async () => {
  const m = montar({ itens: [ITEM_DADOS, ITEM_B], config: { limite_dia: 1, rotina: { ativa: true, max_itens: 1, limite_dia: 6 } } }); m.banco.latencia = lento();
  const [r, man] = await Promise.all([descobertaDaRotina(UID, m.ctx), descobrir(UID, { item_id: ITEM_B.id, ...um }, m.ctx)]);
  assert.equal(m.f.pedidos.length, 1, "um único pedido"); assert.equal(gasto(m), 1); const origens = m.banco.consultas.map((c) => c.origem + ":" + c.status).sort();
  assert.ok(origens.includes("manual:ok") !== origens.includes("rotina:ok") && origens.some((x) => x.endsWith("bloqueada_orcamento")), "um passa (rotina ou manual) e o outro é bloqueado: " + origens.join(","));
  assert.ok(r.parou === "orcamento" || r.gastas === 1); assert.ok(man.consultas.length === 1);
  /* o teto próprio da rotina não bloqueia o dono; o geral vale para os dois */
  const g = montar({ itens: [ITEM_DADOS, ITEM_B], config: { rotina: { ativa: true, max_itens: 1, limite_dia: 1 } } });
  await descobertaDaRotina(UID, g.ctx); assert.equal((await descobrir(UID, { item_id: ITEM_B.id, ...um }, g.ctx)).consultas[0].status, "ok", "o dono segue livre depois do teto da rotina"); assert.equal(gasto(g), 2);
});

test("limites diário, mensal e por engine bloqueiam ANTES da chamada, com o motivo; engine não bloqueia outro engine", async () => {
  const dia = montar({ config: { limite_dia: 2 } }); await descobrir(UID, { item_id: ITEM }, dia.ctx); const d = await descobrir(UID, { item_id: ITEM, forcar: true, ...um }, dia.ctx);
  assert.equal(d.consultas[0].status, "bloqueada_orcamento"); assert.match(d.avisos.join(" "), /limite diário de buscas do RAC atingido \(2\/2\)/); assert.equal(dia.f.pedidos.length, 2, "o terceiro nunca saiu");
  const mes = montar({ config: { limite_mensal: 1 } }); await descobrir(UID, { item_id: ITEM, ...um }, mes.ctx); mes.t.agora = T0 + 30 * H; const m2 = await descobrir(UID, { item_id: ITEM, ...um }, mes.ctx);
  assert.equal(m2.consultas[0].status, "bloqueada_orcamento", "30 h depois é outro dia (12/11), mas o MÊS é o mesmo e o limite mensal é 1"); assert.match(m2.avisos.join(" "), /limite mensal de buscas do RAC atingido \(1\/1\)/); assert.equal(mes.f.pedidos.length, 1);
  mes.t.agora = T0 + 25 * H * 24; const m3 = await descobrir(UID, { item_id: ITEM, ...um }, mes.ctx); assert.equal(m3.consultas[0].status, "ok", "em 06/12 é outro mês: o limite mensal volta");
  const eng = montar({ config: { limite_por_engine: { google_shopping: { dia: 1 }, google_immersive_product: { dia: 0 } } } }); await descobrir(UID, { item_id: ITEM, ...um }, eng.ctx);
  const b = await descobrir(UID, { item_id: ITEM, forcar: true, ...um }, eng.ctx); assert.equal(b.consultas[0].status, "bloqueada_orcamento"); assert.match(b.avisos.join(" "), /limite diário do engine google_shopping atingido \(1\/1\)/); assert.equal(eng.banco.consultas.at(-1).erro_codigo, "orcamento_engine_dia");
  const kit = achar(eng, "Kit 2"), x = await expandir(UID, { candidato_id: kit.id }, eng.ctx); assert.equal(x.erro, "orcamento"); assert.match(x.mensagem, /limite diário do engine google_immersive_product atingido \(0\/0\)/);
  const prod = await expandir(UID, { candidato_id: achar(eng, "Creme Hidratante Principia Ch-02").id, engine: "produto" }, eng.ctx); assert.equal(prod.ok, true, "o limite de um engine não bloqueia o outro");
  assert.equal(eng.f.pedidos.length, 2, "1 busca + 1 google_product; nada nos engines bloqueados");
  const mesEng = montar({ config: { limite_por_engine: { google_shopping: { mes: 1 } } } }); await descobrir(UID, { item_id: ITEM, ...um }, mesEng.ctx); mesEng.t.agora = T0 + 26 * H;
  assert.match((await descobrir(UID, { item_id: ITEM, ...um }, mesEng.ctx)).avisos.join(" "), /limite mensal do engine google_shopping atingido \(1\/1\)/);
  const cfg = configDescoberta({ limite_por_engine: { google_shopping: { dia: "x", mes: -1 }, google_product: { dia: 3 }, inventado: { dia: 1 } } }); assert.deepEqual([cfg.limites_engine.google_shopping, cfg.limites_engine.google_product, "inventado" in cfg.limites_engine], [{ dia: null, mes: null }, { dia: 3, mes: null }, false], "valor inválido = sem limite próprio; engine desconhecido é ignorado");
});

/* ---------- 2) HTTP: cada tipo de resposta ---------- */
const MATRIZ = [
  // [nome, resposta do fetch, status da consulta, créditos contados, código gravado, resultados]
  ["HTTP 200 com resultados", () => ({ body: SHOP }), "ok", 1, null, 3],
  ["HTTP 200 Success sem a lista de resultados (vazio)", () => ({ body: { search_metadata: { status: "Success" } } }), "ok", 1, "sem_resultados", 0],
  ["HTTP 200 'não achou resultados' (vazio)", () => ({ body: { search_metadata: { status: "Success" }, error: "Google hasn't returned any results for this query." } }), "ok", 1, "sem_resultados", 0],
  ["HTTP 200 'nenhum resultado' sem search_metadata (vazio)", () => ({ body: { error: "Google hasn't returned any results for this query." } }), "ok", 1, "sem_resultados", 0],
  ["HTTP 200 erro com search_metadata Error (documentado como não cobrado)", () => ({ body: { error: "Invalid parameter", search_metadata: { status: "Error" } } }), "erro", 0, "erro_provedor", 0],
  ["HTTP 200 Success com texto de erro qualquer (documentado: Success pode vir vazio com a chave error)", () => ({ body: { search_metadata: { status: "Success" }, error: "Google Shopping hasn't any listings" } }), "ok", 1, "sem_resultados", 0],
  ["HTTP 200 erro SEM search_metadata (não dá para saber)", () => ({ body: { error: "Something went wrong" } }), "incerto", 1, "erro_provedor", 0],
  ["HTTP 200 search_metadata Processing (não terminou)", () => ({ body: { search_metadata: { status: "Processing" } } }), "incerto", 1, "erro_provedor", 0],
  ["HTTP 400 com erro (4xx genérico: sem respaldo documental de gratuidade)", () => ({ status: 400, body: { error: "Missing query `q` parameter" } }), "incerto", 1, "erro_provedor", 0],
  ["HTTP 422 com erro (4xx genérico)", () => ({ status: 422, body: { error: "unprocessable" } }), "incerto", 1, "erro_provedor", 0],
  ["HTTP 401 (chave recusada)", () => ({ status: 401, body: { error: "Invalid API key" } }), "erro", 0, "chave_recusada", 0],
  ["HTTP 403 (chave recusada)", () => ({ status: 403, body: {} }), "erro", 0, "chave_recusada", 0],
  ["HTTP 429 (limite do provedor)", () => ({ status: 429, body: { error: "Your account has run out of searches." } }), "erro", 0, "limite", 0],
  ["HTTP 500", () => ({ status: 500, body: { error: "internal" } }), "incerto", 1, "erro_provedor", 0],
  ["HTTP 503", () => ({ status: 503, body: { error: "indisponível" } }), "incerto", 1, "erro_provedor", 0],
  ["HTTP 404 sem campo de erro (corpo desconhecido)", () => ({ status: 404, body: {} }), "incerto", 1, "erro_provedor", 0],
  ["resposta que não é JSON", { cru: true }, "incerto", 1, "resposta_invalida", 0],
  ["timeout", () => { throw Object.assign(new Error("abortado"), { name: "AbortError" }); }, "incerto", 1, "tempo_esgotado", 0],
  ["falha de rede", () => { throw new Error("queda de rede em https://serpapi.com/search.json?api_key=" + KEY); }, "incerto", 1, "rede", 0],
];
test("cada tipo de resposta: vazio conta, erro definitivo libera, incerto retém; nada disso vaza a chave", async () => {
  for (const [nome, resp, status, creditos, codigo, resultados] of MATRIZ) {
    const m = montar({}); if (resp.cru) m.ctx.fetch = async () => new Response("<html>", { status: 200 }); else m.ctx.fetch = fetchFalso(async () => resp());
    const r = await descobrir(UID, { item_id: ITEM, ...um }, m.ctx), c = m.banco.consultas[0];
    assert.deepEqual([c.status, c.buscas_gastas, c.erro_codigo, c.resultados], [status, creditos, codigo, resultados], nome); assert.equal(r.orcamento.dia_usado, creditos, nome + ": o orçamento reflete a contabilização");
    assert.equal(r.consultas[0].status, status, nome); assert.equal(r.consultas[0].gasto, creditos, nome); assert.equal(m.banco.consultas.length, 1, nome + ": uma linha só, sem duplicar a reserva");
    assert.ok(!c.status.includes("reservada"), nome + ": a reserva sempre é resolvida"); assert.equal(JSON.stringify([r, m.banco.consultas]).includes(KEY), false, nome + ": sem a chave");
    if (status === "incerto" || (codigo === "chave_recusada" || codigo === "limite")) assert.equal(r.consultas.length, 1, nome + ": interrompe as demais variantes");
  }
});

test("HTTP 200 vazio não é erro gratuito: conta, vira cache (não paga de novo no prazo) e avisa", async () => {
  const m = montar({}, () => ({ body: { search_metadata: { status: "Success" }, shopping_results: [] } })); const a = await descobrir(UID, { item_id: ITEM, ...um }, m.ctx);
  assert.deepEqual([a.consultas[0].status, a.consultas[0].resultados, a.consultas[0].gasto, a.orcamento.dia_usado], ["ok", 0, 1, 1]); assert.match(a.avisos.join(" "), /conta a busca mesmo vazia/);
  const b = await descobrir(UID, { item_id: ITEM, ...um }, m.ctx); assert.deepEqual([b.consultas[0].status, b.orcamento.dia_usado, m.f.pedidos.length], ["cache", 1, 1], "a mesma busca vazia no prazo é cache");
});

test("timeout de verdade (AbortController) e queda de rede no adaptador: incerto, sem a chave, sem demora além do prazo", async () => {
  const preso = (url, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("abortado " + url), { name: "AbortError" }))));
  const t0 = Date.now(), r = await chamarSerp("google_shopping", { q: "x" }, KEY, preso, 25); assert.deepEqual([r.ok, r.incerto, r.codigo, r.status], [false, true, "tempo_esgotado", null]); assert.ok(Date.now() - t0 < 2000); assert.equal(JSON.stringify(r).includes(KEY), false);
  const rede = await chamarSerp("google_shopping", { q: "x" }, KEY, async (u) => { throw new TypeError("fetch failed " + u); }); assert.deepEqual([rede.incerto, rede.codigo], [true, "rede"]); assert.equal(JSON.stringify(rede).includes(KEY), false);
  const m = montar(); m.ctx.provedores = [{ id: "serpapi", nome: "x", estado: "ativo", custos: { google_shopping: 1 }, planejarBusca: () => ({ engine: "google_shopping", chave_cache: "k", consulta: "x", params: {} }), executarBusca: async () => { throw new Error("quebrou"); }, planejarExpansao: () => ({ erro: "x", mensagem: "x" }), executarExpansao: async () => { throw new Error("x"); } }];
  const e = await descobrir(UID, { item_id: ITEM, ...um }, m.ctx); assert.deepEqual([m.banco.consultas[0].status, m.banco.consultas[0].buscas_gastas, e.consultas[0].erro.codigo], ["incerto", 1, "rede"], "um provedor que lança uma exceção inesperada: incerto (a chamada pode ter saído)");
});

/* ---------- 3) falha de persistência DEPOIS da chamada externa ---------- */
test("a resposta chegou mas a gravação dos candidatos falhou: crédito retido (incerto, falha_persistencia), uma chamada só, nada repetido sozinho", async () => {
  for (const falha of ["gravar", "historico"]) {
    const m = montar(); m.banco.falhas[falha] = true; const r = await descobrir(UID, { item_id: ITEM }, m.ctx), c = m.banco.consultas[0];
    assert.equal(m.f.pedidos.length, 1, falha + ": 1 chamada, sem repetir e sem seguir para a próxima variante"); assert.deepEqual([c.status, c.erro_codigo, c.buscas_gastas, c.resultados], ["incerto", "falha_persistencia", 1, 3], falha);
    assert.deepEqual([r.consultas.length, r.consultas[0].status, r.consultas[0].gasto, r.consultas[0].erro.codigo], [1, "incerto", 1, "falha_persistencia"]); assert.equal(r.orcamento.dia_usado, 1, "o crédito continua contado"); assert.match(r.avisos.join(" "), /incerta/);
    m.banco.falhas[falha] = false; const nova = await descobrir(UID, { item_id: ITEM, ...um }, m.ctx); assert.equal(nova.consultas[0].status, "ok", "incerto não vira cache: o dono pode tentar de novo, conscientemente"); assert.equal(m.f.pedidos.length, 2); assert.equal(m.banco.consultas.filter((x) => x.buscas_gastas > 0).reduce((s, x) => s + x.buscas_gastas, 0), 2, "o crédito retido segue contado");
  }
  /* na expansão também */
  const e = montar(); await descobrir(UID, { item_id: ITEM, ...um }, e.ctx); e.banco.falhas.gravar = true; const x = await expandir(UID, { candidato_id: achar(e, "Kit 2").id }, e.ctx);
  assert.deepEqual([x.ok, x.erro, x.incerto, x.gasto], [false, "falha_persistencia", true, 1]); assert.equal(e.banco.invalidados.length, 0, "o token não é invalidado: a resposta foi boa"); assert.equal(e.banco.consultas.at(-1).status, "incerto"); assert.equal(e.f.pedidos.length, 2);
});

test("a conclusão da reserva não pôde ser gravada: a reserva segue contada (nunca liberada por prazo) e vira incerto 'reserva_orfa' na próxima reserva", async () => {
  const m = montar(); m.banco.falhas.concluir = true; const r = await descobrir(UID, { item_id: ITEM, ...um }, m.ctx);
  assert.equal(m.banco.cands.length, 3, "os anúncios foram gravados"); assert.deepEqual([r.consultas[0].status, r.consultas[0].gasto, r.consultas[0].registro_pendente], ["ok", 1, true]); assert.match(r.avisos.join(" "), /fechamento do registro de consumo falhou/);
  assert.equal(m.banco.consultas[0].status, "reservada"); assert.equal(m.banco.consultas[0].buscas_gastas, 1, "reservada conta no orçamento"); assert.equal(r.orcamento.dia_usado, 1);
  m.banco.falhas.concluir = false; m.t.agora = T0 + 11 * MIN; const n = await descobrir(UID, { item_id: ITEM_DADOS.id, forcar: true, ...um }, m.ctx);
  assert.equal(n.consultas[0].status, "ok"); const velha = m.banco.consultas[0]; assert.deepEqual([velha.status, velha.erro_codigo, velha.buscas_gastas], ["incerto", "reserva_orfa", 1], "a que ficou sem resposta virou incerto e continua contando"); assert.equal(n.orcamento.dia_usado, 2);
  m.t.agora = T0 + 3 * 24 * H; assert.equal((await usoDescoberta(UID, m.ctx)).orcamento.mes_usado, 2, "dias depois (mesmo mês) nada foi liberado por prazo");
  /* erro definitivo + conclusão que falha: não dá para liberar sem registrar; fica retido */
  const e = montar({}, () => ({ status: 429, body: { error: "x" } })); e.banco.falhas.concluir = true; const x = await descobrir(UID, { item_id: ITEM, ...um }, e.ctx);
  assert.deepEqual([x.consultas[0].status, x.consultas[0].gasto, x.consultas[0].registro_pendente], ["incerto", 1, true], "sem a conclusão gravada, o crédito NÃO é liberado"); assert.equal(e.banco.consultas[0].buscas_gastas, 1);
});

test("falha ao RESERVAR (banco fora): nenhuma chamada externa e nenhum crédito; erro sobe", async () => {
  const m = montar(); m.banco.falhas.reservar = true; await assert.rejects(descobrir(UID, { item_id: ITEM }, m.ctx), /banco fora/); assert.equal(m.f.pedidos.length, 0, "sem reserva, não há chamada paga"); assert.equal(gasto(m), 0);
  const e = montar(); await descobrir(UID, { item_id: ITEM, ...um }, e.ctx); e.banco.falhas.reservar = true; await assert.rejects(expandir(UID, { candidato_id: achar(e, "Kit 2").id }, e.ctx), /banco fora/); assert.equal(e.f.pedidos.length, 1);
});

/* ---------- 4) a mesma reserva nunca é consumida duas vezes ---------- */
test("resposta atrasada depois que a reserva virou órfã/incerta NÃO consome de novo nem desfaz o incerto; um crédito, uma linha", async () => {
  let soltar; const m = montar({}, () => new Promise((res) => { soltar = () => res({ body: SHOP }); })); const lenta = descobrir(UID, { item_id: ITEM, ...um }, m.ctx);
  await new Promise((r) => setTimeout(r, 5)); assert.equal(m.banco.consultas[0].status, "reservada"); assert.equal(m.banco.consultas[0].buscas_gastas, 1, "reservada antes da resposta");
  const outra = montar({}).ctx; /* outro relógio e o MESMO banco: 11 min depois, uma nova reserva varre a órfã */
  m.t.agora = T0 + 11 * MIN; const f2 = fetchFalso(() => ({ body: SHOP })); const n = await descobrir(UID, { item_id: ITEM_DADOS.id, forcar: true, ...um, }, { ...m.ctx, fetch: f2 }); void outra;
  assert.equal(n.consultas[0].status, "ok"); assert.deepEqual([m.banco.consultas[0].status, m.banco.consultas[0].erro_codigo], ["incerto", "reserva_orfa"]);
  soltar(); const r = await lenta; assert.equal(m.banco.consultas[0].status, "incerto", "a conclusão tardia foi recusada: segue incerto"); assert.equal(m.banco.consultas[0].buscas_gastas, 1);
  assert.equal(gasto(m), 2, "duas reservas, dois créditos: ninguém consumiu duas vezes a mesma"); assert.equal(m.banco.consultas.filter((c) => c.status === "ok").length, 1); assert.equal(r.consultas[0].status, "ok", "a chamada lenta devolve o que recebeu; o orçamento é que não muda");
  assert.equal(await m.banco.concluir(UID, m.banco.consultas[1].id, { status: "ok", http: 200, codigo: null, mensagem: null, resultados: 1, duracao_ms: 1 }), false, "concluir de novo uma reserva já resolvida: recusado");
});

/* ---------- 5) incertas: ficam contadas, sem reconciliação ---------- */
test("incerto segue contado nos dias seguintes do mês, não há caminho para liberá-lo, e só a virada do dia/mês devolve folga", async () => {
  const m = montar({ config: { limite_dia: 1 } }, () => { throw new Error("rede"); }); await descobrir(UID, { item_id: ITEM, ...um }, m.ctx); assert.equal(m.banco.consultas[0].status, "incerto");
  m.t.agora = T0 + 5 * 24 * H; assert.equal((await usoDescoberta(UID, m.ctx)).orcamento.mes_usado, 1, "cinco dias depois o incerto continua contado no mês"); assert.ok(!("incertas" in (await usoDescoberta(UID, m.ctx))), "nada a reconciliar: não há lista de pendências");
  assert.equal(m.banco.consultas[0].buscas_gastas, 1, "nada mudou a linha"); for (const k of ["reconciliar", "incertas"]) assert.equal(typeof m.banco[k], "undefined", "o contrato do banco não tem " + k);
  const outro = montar({ config: { limite_mensal: 1 } }, () => ({ status: 503, body: { error: "x" } })); await descobrir(UID, { item_id: ITEM, ...um }, outro.ctx); outro.t.agora = T0 + 3 * 24 * H;
  assert.equal((await descobrir(UID, { item_id: ITEM, ...um }, outro.ctx)).consultas[0].status, "bloqueada_orcamento", "no mesmo mês o incerto ainda ocupa o limite mensal"); outro.t.agora = T0 + 25 * 24 * H;
  assert.notEqual((await descobrir(UID, { item_id: ITEM, ...um }, outro.ctx)).consultas[0].status, "bloqueada_orcamento", "no mês seguinte o limite volta");
});

test("rotina: depois de um incerto ela para (não repete), e o crédito retido continua no orçamento do dia", async () => {
  const m = montar({ itens: [ITEM_DADOS, ITEM_B, ITEM_C], config: { rotina: { ativa: true, max_itens: 3, limite_dia: 6 } } }, () => { throw new Error("rede"); });
  const r = await descobertaDaRotina(UID, m.ctx); assert.deepEqual([r.consultas, r.gastas, r.erros], [1, 1, 1]); assert.equal(m.f.pedidos.length, 1, "uma tentativa e para"); assert.equal(m.banco.consultas[0].origem, "rotina");
  assert.equal((await usoDescoberta(UID, m.ctx)).orcamento.rotina_dia, 1);
});

/* ---------- 6) a função publicável usa o banco, não o JavaScript, para decidir ---------- */
test("código: o orquestrador só PEDE a reserva (autorizar() é só a regra-espelho do banco); index.ts reserva e conclui por funções do banco, e não existe ação de reconciliação", () => {
  const d = semComentarios(ler("supabase/functions/radar/descoberta.ts")), i = ler("supabase/functions/radar/index.ts"), ic = semComentarios(i);
  assert.equal((d.match(/\bautorizar\(/g) || []).length, 1, "autorizar só é DEFINIDA em descoberta.ts; ninguém a chama para decidir o gasto"); assert.ok(!/ctx\.banco\.consultaEmCache|orcamentoAgora\([^)]*\)[^;]*autorizar/.test(d));
  assert.match(d, /ctx\.banco\.reservar\(uid, \{ \.\.\.base, custo/); assert.equal((d.match(/ctx\.banco\.reservar\(/g) || []).length, 1, "uma porta só para gastar crédito: operacaoPaga"); assert.equal((d.match(/prov\.executarBusca|prov\.executarExpansao/g) || []).length, 2, "e só descobrir e expandir chamam o provedor, ambos por operacaoPaga");
  for (const f of ["radar_reservar_consulta", "radar_concluir_consulta"]) assert.match(ic, new RegExp(`adm\\.rpc\\("${f}"`));
  assert.ok(!/consultaEmCache/.test(ic), "o cache agora é conferido dentro da reserva (banco)"); assert.ok(!/from\("radar_consultas"\)\.(update|delete|upsert)/.test(ic), "a função não altera consulta direto (o service_role nem pode)");
  assert.ok(!/reconcil/i.test(ic) && !/reconcil/i.test(d) && !/reconcil/i.test(semComentarios(ler("js/radar.js"))), "nenhuma ação, função ou botão de reconciliação (decisão do dono)"); assert.ok(!/reconcil/i.test(semComentarios(ler("supabase/048_radar_descoberta.sql"))), "a 048 não tem a função de reconciliação nem as colunas reconciliada_*");
  assert.match(ler("js/radar.js"), /O limite de consultas foi atingido\./, "sem orçamento: uma mensagem simples na aba");
  assert.match(i, /MigracaoPendente/); assert.match(i, /42883/, "sem a migration 048 a função responde migracao_pendente também para as funções do orçamento");
});
