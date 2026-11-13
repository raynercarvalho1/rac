// Resumo diário dos alertas de preço por Web Push (supabase/functions/garmin/alertas_preco.ts + o passo na rotina). Sem rede, sem banco real e SEM Web Push real.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { bancoSupabase, configAlertas, contarPorTipo, diaEmSaoPaulo, gerarAlertas, lerResultadoPush, montarMensagem, PREFIXO_DIA, relevantes, resumoAlertasPreco, URL_ALERTAS, JANELA_PUSH_DIAS } from "../supabase/functions/garmin/alertas_preco.ts";
import { rota } from "./_rotas.mjs";   // registro de rotas (js/rotas.js, Fase 2 · A3)

globalThis.window = globalThis.window || {};
createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo || globalThis.window.RACnucleo;
const ler = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");

let seq = 0;
const C = "Confiança (Sorocaba)", RE = "Reinaldo (Sorocaba)";
const R = (data, mercado, produto, un, q, vu) => ({ id: "i" + String(++seq).padStart(3, "0"), data, mercado, produto, categoria: "Mercearia", unidade: un, quantidade: q, valor_unitario: vu, valor_total: q * vu, nota: data + "|" + mercado });
const ROWS = [
  R("2026-09-01", C, "Arroz", "kg", 2, 5), R("2026-10-01", C, "Arroz", "kg", 2, 5), R("2026-11-01", RE, "Arroz", "kg", 2, 5), R("2026-11-02", C, "Arroz", "kg", 2, 5.8),
  R("2026-09-10", C, "Leite Integral 1L", "un", 6, 6), R("2026-10-05", C, "Leite Integral 1L", "un", 6, 5.5), R("2026-11-04", C, "Leite Integral 1L", "un", 6, 4.5),
  R("2026-11-03", C, "Feijão", "kg", 1, 8),
  R("2026-06-01", RE, "Queijo Minas", "kg", 0.5, 30), R("2026-11-02", C, "Queijo Minas", "kg", 0.5, 40), R("2026-11-03", RE, "Queijo Minas", "un", 1, 5),
  R("2026-10-01", C, "Suco", "l", 1, 9), R("2026-11-01", C, "Suco", "ml", 500, 0.01)
];
const HOJE = "2026-11-08", DONO = "uid-dono", FERNANDA = "uid-fernanda";
const CAMPOS = ["id", "tipo", "chave", "nome", "unidade", "data", "mercado", "atual", "anterior", "pct", "refMercado", "refData", "motivo"];
const sub = (l) => l.map((a) => Object.fromEntries(CAMPOS.map((k) => [k, a[k]])));
const tipos = (l) => l.map((a) => a.tipo).sort();

/* ---------- banco e envio de mentira ---------- */
function bancoFalso(rows, pessoal = {}) {
  const calls = [], store = { ...pessoal };
  return { calls, store,
    async linhas(uid) { calls.push(["linhas", uid]); return rows; },
    async pessoal(uid, ch) { calls.push(["pessoal", uid, ch]); return store[ch] ?? null; },
    async dias(uid, desde) { calls.push(["dias", uid]); return Object.entries(store).filter(([k]) => k.startsWith(PREFIXO_DIA) && k >= PREFIXO_DIA + desde).map(([chave, valor]) => ({ chave, valor })); },
    async reservar(uid, ch, v) { calls.push(["reservar", uid, ch]); if (store[ch]) return false; store[ch] = JSON.parse(JSON.stringify(v)); return true; },
    async atualizar(uid, ch, v) { calls.push(["atualizar", uid, ch]); store[ch] = JSON.parse(JSON.stringify(v)); } };
}
function envio(resposta = "1 de 1 aparelhos") { const e = { msgs: [], async fn(m) { e.msgs.push(m); const r = typeof resposta === "function" ? resposta(e.msgs.length) : resposta; if (r instanceof Error) throw r; return r; } }; return e; }
/* 06:00 de Brasília (09:00 UTC) da data pedida; HOJE e 15/11 são domingos */
const rodar = (b, e, hoje = HOJE, uid = DONO, agora = new Date(hoje + "T09:00:00Z")) => resumoAlertasPreco(null, uid, hoje, (m) => e.fn(m), b, agora);

test("as regras do servidor são idênticas às do site (mesmos ids, preços, motivos), com várias configurações", () => {
  for (const cfg of [{}, { tipos: { minimo_periodo: { on: true, dias: 90 } } }, { tipos: { melhor: { on: true, pct: 0.1, dias: 200 } } }, { limites: [{ nome: "Leite Integral 1L", unidade: "un", max: 5 }] }, { tipos: { aumento: { on: true, pct: 0.2 }, queda: { on: false } } }]) {
    assert.deepEqual(sub(gerarAlertas(ROWS, cfg)), sub(N.mkalGerar(ROWS, cfg)), JSON.stringify(cfg));
  }
  assert.ok(gerarAlertas(ROWS, {}).length === 5);
  for (const raw of [null, {}, "x", { push: { on: false } }, { push: { on: "sim" } }, { tipos: { aumento: { pct: "abc" } }, novosDias: -1, limites: [{ nome: "A", unidade: "kg", max: 3 }, null] }]) assert.deepEqual(configAlertas(raw), N.mkalConfig(raw), JSON.stringify(raw));
  assert.equal(configAlertas({}).push.on, true, "padrão: ligado"); assert.equal(configAlertas({ push: { on: false } }).push.on, false);
  assert.equal(N.mkcChaveProd({ produto: "Queijo", unidade: "KG" }), "Queijo\u0001kg");
});

test("relevantes: só alertas ligados, recentes (até 7 dias), NÃO lidos e ainda não levados a um resumo anterior", () => {
  const cfg = configAlertas({}), todos = gerarAlertas(ROWS, cfg);
  assert.equal(JANELA_PUSH_DIAS, 7);
  assert.equal(relevantes(todos, { lidos: [] }, HOJE, cfg, new Set()).length, 5);
  assert.equal(relevantes(todos, { lidos: [] }, "2026-11-20", cfg, new Set()).length, 0, "compras de mais de 7 dias não viram resumo");
  assert.equal(relevantes(todos, { lidos: [] }, "2026-11-09", cfg, new Set()).length, 5, "a janela de 7 dias inclui o dia 02/11");
  assert.equal(relevantes(todos, { lidos: [] }, "2026-11-10", cfg, new Set()).length, 2, "dia 10: os eventos de 02/11 já saíram da janela");
  const lido = todos.find((a) => a.tipo === "queda"); assert.equal(relevantes(todos, { lidos: [lido.id] }, HOJE, cfg, new Set()).length, 4, "o que o dono já leu não entra");
  assert.equal(relevantes(todos, {}, HOJE, cfg, new Set([lido.id])).length, 4, "nem o que já foi num resumo anterior");
  assert.equal(relevantes(todos, {}, HOJE, configAlertas({ tipos: { aumento: { on: false } } }), new Set()).length, 3, "tipo desligado");
  assert.equal(relevantes(todos, {}, HOJE, configAlertas({ novosDias: 7 }), new Set()).length, 5);
  assert.equal(relevantes(todos, {}, "2026-11-03", cfg, new Set()).every((a) => a.data <= "2026-11-03"), true, "nada do futuro");
  /* mesmo critério de 'novo' do site dentro da janela */
  const site = N.mkalClassificar(N.mkalGerar(ROWS, {}), { lidos: [lido.id] }, HOJE, {}).alertas.filter((a) => a.novo).map((a) => a.id).sort();
  assert.deepEqual(relevantes(todos, { lidos: [lido.id] }, HOJE, cfg, new Set()).map((a) => a.id).sort(), site);
});

test("mensagem: todos os tipos, só quedas, só aumentos, singular/plural e sem alertas = sem mensagem", () => {
  const todos = montarMensagem({ queda: 3, aumento: 2, minimo: 1, melhor: 1, limite: 2 });
  assert.equal(todos.titulo, "RAC Mercado — Resumo de preços");
  assert.equal(todos.corpo, "Na última semana você teve:\n• 3 quedas de preço\n• 2 aumentos relevantes\n• 1 novo menor preço histórico\n• 1 oportunidade em outro mercado\n• 2 limites de preço atingidos\nAbra o RAC para consultar os produtos.");
  assert.equal(montarMensagem({ queda: 2 }).corpo, "Na última semana você teve:\n• 2 quedas de preço\nAbra o RAC para consultar os produtos.");
  assert.equal(montarMensagem({ aumento: 1 }).corpo, "Na última semana você teve:\n• 1 aumento relevante\nAbra o RAC para consultar os produtos.");
  assert.match(montarMensagem({ minimo: 2, minimo_periodo: 1 }).corpo, /2 novos menores preços históricos\n• 1 menor preço no período/);
  assert.equal(montarMensagem({}), null); assert.equal(montarMensagem({ queda: 0 }), null, "nunca notificação vazia");
  for (const m of [todos]) { assert.ok(!/R\$|Arroz|Leite|Queijo|Confiança|Reinaldo|\d+,\d\d/.test(m.corpo + m.titulo), "tela bloqueada: só contagens, sem produto, preço ou mercado"); assert.ok(m.corpo.length < 260); }
  assert.equal(todos.url, "./#mercado/alertas"); assert.equal(todos.tag, "mercado-alertas"); assert.equal(URL_ALERTAS, "./#mercado/alertas");
  assert.deepEqual(contarPorTipo(gerarAlertas(ROWS, {})), { aumento: 2, queda: 1, minimo: 1, melhor: 1 });
  assert.deepEqual(lerResultadoPush("2 de 3 aparelhos"), { ok: 2, total: 3 }); assert.deepEqual(lerResultadoPush("nenhum aparelho com notificações ativas"), { ok: 0, total: 0 }); assert.equal(lerResultadoPush("???"), null);
});

test("resumo com todos os tipos: manda uma notificação com as contagens e registra o dia; não marca nada como lido", async () => {
  const cfg = { limites: [{ nome: "Leite Integral 1L", unidade: "un", max: 5 }] }, estado = { lidos: ["x|y|z"] };
  const b = bancoFalso(ROWS, { "mercado-alertas": { v: 1, cfg, estado } }), e = envio("1 de 1 aparelhos");
  const r = await rodar(b, e);
  assert.equal(e.msgs.length, 1); assert.equal(e.msgs[0].corpo, "Na última semana você teve:\n• 1 queda de preço\n• 2 aumentos relevantes\n• 1 novo menor preço histórico\n• 1 oportunidade em outro mercado\n• 1 limite de preço atingido\nAbra o RAC para consultar os produtos.");
  assert.equal(e.msgs[0].url, "./#mercado/alertas"); assert.deepEqual([r.enviado, r.estado, r.alertas], [true, "enviado", 6]);
  const reg = b.store[PREFIXO_DIA + HOJE]; assert.equal(reg.estado, "enviado"); assert.equal(reg.ids.length, 6); assert.equal(reg.resultado, "1 de 1 aparelhos");
  assert.deepEqual(b.store["mercado-alertas"], { v: 1, cfg, estado }, "o estado de leitura e as preferências do dono ficam intactos: os alertas continuam não lidos no Dashboard");
  assert.ok(b.calls.filter((c) => c[0] === "atualizar" || c[0] === "reservar").every((c) => c[2].startsWith(PREFIXO_DIA)), "só grava a chave do resumo do dia");
});

test("resumo só com quedas e só com aumentos; sem alertas não envia nada nem reserva o dia", async () => {
  let e = envio(), b = bancoFalso(ROWS, { "mercado-alertas": { cfg: { tipos: { aumento: { on: false }, minimo: { on: false }, melhor: { on: false } } } } });
  await rodar(b, e); assert.equal(e.msgs[0].corpo, "Na última semana você teve:\n• 1 queda de preço\nAbra o RAC para consultar os produtos.");
  e = envio(); b = bancoFalso(ROWS, { "mercado-alertas": { cfg: { tipos: { queda: { on: false }, minimo: { on: false }, melhor: { on: false } } } } });
  await rodar(b, e); assert.equal(e.msgs[0].corpo, "Na última semana você teve:\n• 2 aumentos relevantes\nAbra o RAC para consultar os produtos.");
  e = envio(); b = bancoFalso([R("2026-11-01", C, "Feijão", "kg", 1, 8)]); const r = await rodar(b, e);
  assert.equal(e.msgs.length, 0); assert.equal(r.enviado, false); assert.equal(r.motivo, "sem alertas novos"); assert.equal(b.calls.filter((c) => c[0] === "reservar").length, 0);
});

test("alertas antigos e já lidos ficam de fora", async () => {
  const e = envio(), b = bancoFalso(ROWS); const r = await rodar(b, e, "2026-12-13");
  assert.equal(e.msgs.length, 0); assert.equal(r.motivo, "sem alertas novos");
  const lidos = gerarAlertas(ROWS, {}).map((a) => a.id), e2 = envio(); await rodar(bancoFalso(ROWS, { "mercado-alertas": { estado: { lidos } } }), e2); assert.equal(e2.msgs.length, 0, "tudo lido no Dashboard: nada a avisar");
});

test("semanal: elegível só no domingo de Brasília; segunda a sábado saem na hora, sem ler o banco nem enviar", async () => {
  /* 2026-11-02 (segunda) a 2026-11-08 (domingo), sempre às 06:00 de Brasília = 09:00 UTC */
  for (const [dia, nome] of [["2026-11-02", "Mon"], ["2026-11-03", "Tue"], ["2026-11-04", "Wed"], ["2026-11-05", "Thu"], ["2026-11-06", "Fri"], ["2026-11-07", "Sat"]]) {
    const b = bancoFalso(ROWS), e = envio(), r = await rodar(b, e, dia);
    assert.deepEqual([r.enviado, r.dia, r.data], [false, nome, dia], dia); assert.match(r.motivo, /só aos domingos/);
    assert.equal(e.msgs.length, 0, dia); assert.equal(b.calls.length, 0, "fora do domingo não lê nem grava nada: " + dia);
  }
  const b = bancoFalso(ROWS), e = envio(), r = await rodar(b, e, "2026-11-08");
  assert.deepEqual([r.enviado, r.estado], [true, "enviado"]); assert.equal(e.msgs.length, 1);
  assert.equal(e.msgs[0].titulo, "RAC Mercado — Resumo de preços"); assert.match(e.msgs[0].corpo, /^Na última semana você teve:\n/); assert.ok(!/Hoje você tem/.test(e.msgs[0].corpo));
});

test("semanal: o dia vem do fuso America/Sao_Paulo, não do dia UTC (sábado à noite e domingo à noite)", async () => {
  const casos = [
    ["2026-11-08T03:00:00Z", true, "domingo 00:00 em Brasília"], ["2026-11-08T09:00:00Z", true, "domingo 06:00 em Brasília (a rotina)"], ["2026-11-09T02:59:00Z", true, "domingo 23:59 em Brasília, já segunda em UTC"],
    ["2026-11-08T02:59:00Z", false, "sábado 23:59 em Brasília, já domingo em UTC"], ["2026-11-08T01:00:00Z", false, "sábado 22:00 em Brasília, domingo em UTC"], ["2026-11-09T03:00:00Z", false, "segunda 00:00 em Brasília"],
    ["2026-11-09T09:00:00Z", false, "segunda 06:00"], ["2026-11-14T09:00:00Z", false, "sábado 06:00"]];
  for (const [inst, esperado, rot] of casos) {
    const sp = diaEmSaoPaulo(new Date(inst)); assert.equal(sp.domingo, esperado, rot);
    const b = bancoFalso(ROWS), e = envio(); await rodar(b, e, "2026-11-08", DONO, new Date(inst)); assert.equal(e.msgs.length, esperado ? 1 : 0, rot);
  }
  assert.deepEqual(diaEmSaoPaulo(new Date("2026-11-08T02:59:00Z")), { data: "2026-11-07", semana: "Sat", domingo: false }); assert.deepEqual(diaEmSaoPaulo(new Date("2026-11-08T03:00:00Z")), { data: "2026-11-08", semana: "Sun", domingo: true });
  assert.equal(diaEmSaoPaulo(new Date("2026-11-09T02:59:00Z")).data, "2026-11-08", "domingo 23:59 em Brasília ainda é dia 08");
  assert.equal(diaEmSaoPaulo(new Date("2026-06-07T09:00:00Z")).domingo, true, "sem horário de verão no Brasil: 06:00 de Brasília é sempre 09:00 UTC");
});

test("semanal: no máximo um resumo por semana; reexecução no domingo não duplica; segunda não 'recupera'; domingo seguinte é outra semana", async () => {
  const b = bancoFalso(ROWS), e = envio();
  await rodar(b, e, "2026-11-08"); const r2 = await rodar(b, e, "2026-11-08", DONO, new Date("2026-11-08T21:30:00Z"));
  assert.equal(e.msgs.length, 1); assert.match(r2.motivo, /já foi tratado/); assert.equal(b.store[PREFIXO_DIA + "2026-11-08"].semana, "2026-11-08"); assert.equal(b.store[PREFIXO_DIA + "2026-11-08"].v, 2);
  const seg = await rodar(b, e, "2026-11-09"); assert.equal(seg.enviado, false); assert.equal(e.msgs.length, 1);
  assert.deepEqual(Object.keys(b.store).filter((k) => k.startsWith(PREFIXO_DIA)), [PREFIXO_DIA + "2026-11-08"], "uma chave por semana");
  /* falha total no domingo: nada de reenvio na segunda; só tenta de novo no mesmo domingo ou no domingo seguinte */
  const b2 = bancoFalso(ROWS), e2 = envio("0 de 2 aparelhos"); await rodar(b2, e2, "2026-11-08"); assert.equal(b2.store[PREFIXO_DIA + "2026-11-08"].estado, "falhou");
  await rodar(b2, e2, "2026-11-09"); assert.equal(e2.msgs.length, 1, "segunda-feira não tenta de novo");
  const b3 = bancoFalso(ROWS), e3 = envio("nenhum aparelho com notificações ativas"); const s1 = await rodar(b3, e3, "2026-11-08"); assert.equal(s1.estado, "sem_aparelho"); await rodar(b3, e3, "2026-11-10"); assert.equal(e3.msgs.length, 1);
});

test("idempotência: rodar a rotina duas vezes no mesmo dia envia uma vez só; na semana seguinte não repete os alertas já avisados", async () => {
  const b = bancoFalso(ROWS), e = envio();
  await rodar(b, e); const r2 = await rodar(b, e);
  assert.equal(e.msgs.length, 1); assert.equal(r2.enviado, false); assert.equal(r2.estado, "enviado"); assert.match(r2.motivo, /já foi tratado/);
  const r3 = await rodar(b, e, "2026-11-15"); assert.equal(e.msgs.length, 1, "os mesmos alertas não voltam em outro resumo"); assert.equal(r3.motivo, "sem alertas novos");
  assert.equal(b.calls.filter((c) => c[0] === "reservar").length, 1);
});

test("evento novo de um produto já alertado gera um novo resumo só com o que é novo", async () => {
  const b = bancoFalso(ROWS), e = envio(); await rodar(b, e);
  const mais = ROWS.concat([R("2026-11-12", C, "Arroz", "kg", 1, 7)]);
  b.linhas = async () => mais; const r = await rodar(b, e, "2026-11-15");
  assert.equal(e.msgs.length, 2); assert.equal(e.msgs[1].corpo, "Na última semana você teve:\n• 1 aumento relevante\n• 1 oportunidade em outro mercado\nAbra o RAC para consultar os produtos.");
  assert.equal(r.alertas, 2); assert.equal(b.store[PREFIXO_DIA + "2026-11-15"].ids.length, 2);
});

test("falha parcial: uma parte dos aparelhos recebeu, o resumo fica registrado e não é reenviado nem repetido nos dias seguintes", async () => {
  const b = bancoFalso(ROWS), e = envio("1 de 2 aparelhos"); const r = await rodar(b, e);
  assert.deepEqual([r.enviado, r.estado], [true, "parcial"]); assert.equal(b.store[PREFIXO_DIA + HOJE].estado, "parcial"); assert.equal(b.store[PREFIXO_DIA + HOJE].resultado, "1 de 2 aparelhos");
  await rodar(b, e); assert.equal(e.msgs.length, 1, "tentativa seguinte no mesmo dia não duplica no aparelho que já recebeu");
  await rodar(b, e, "2026-11-15"); assert.equal(e.msgs.length, 1, "os alertas já avisados não voltam");
});

test("falha total (nenhum aparelho recebeu) ou sem aparelho: pode tentar de novo no mesmo dia, e depois fecha", async () => {
  const b = bancoFalso(ROWS), e = envio((n) => (n === 1 ? "0 de 2 aparelhos" : "2 de 2 aparelhos"));
  const r1 = await rodar(b, e); assert.deepEqual([r1.enviado, r1.estado], [false, "falhou"]); assert.equal(b.store[PREFIXO_DIA + HOJE].estado, "falhou");
  const r2 = await rodar(b, e); assert.deepEqual([r2.enviado, r2.estado, e.msgs.length], [true, "enviado", 2]); assert.equal(b.calls.filter((c) => c[0] === "reservar").length, 1, "a reserva do dia é uma só");
  const r3 = await rodar(b, e); assert.equal(e.msgs.length, 2, "depois de entregue, não reenvia");
  const b2 = bancoFalso(ROWS), e2 = envio("nenhum aparelho com notificações ativas"); const s1 = await rodar(b2, e2); assert.equal(s1.estado, "sem_aparelho"); const s2 = await rodar(b2, e2, "2026-11-08"); assert.equal(e2.msgs.length, 2, "se ligar as notificações no mesmo dia, o resumo ainda sai");
  const b3 = bancoFalso(ROWS), e3 = envio("resposta inesperada"); const t1 = await rodar(b3, e3); assert.equal(t1.estado, "indefinido"); await rodar(b3, e3); assert.equal(e3.msgs.length, 1, "resultado desconhecido: não arrisca duplicar");
});

test("erro no envio: registra a falha, relança para a rotina anotar em 'erros' e deixa tentar de novo", async () => {
  const b = bancoFalso(ROWS), e = envio(new Error("VAPID inválida"));
  await assert.rejects(() => rodar(b, e), /VAPID inválida/); assert.equal(b.store[PREFIXO_DIA + HOJE].estado, "falhou"); assert.match(b.store[PREFIXO_DIA + HOJE].erro, /VAPID/);
  const e2 = envio("1 de 1 aparelhos"); const r = await rodar(b, e2); assert.equal(r.estado, "enviado"); assert.equal(e2.msgs.length, 1);
});

test("execuções simultâneas: quem não consegue reservar o dia não envia", async () => {
  const b = bancoFalso(ROWS), e = envio(); b.reservar = async () => false;
  const r = await rodar(b, e); assert.equal(e.msgs.length, 0); assert.match(r.motivo, /já reservou/);
});

test("resumo desligado nos ajustes do dono: nada é enviado", async () => {
  const b = bancoFalso(ROWS, { "mercado-alertas": { cfg: { push: { on: false } } } }), e = envio(); const r = await rodar(b, e);
  assert.equal(e.msgs.length, 0); assert.match(r.motivo, /desligado/); assert.ok(!b.calls.some((c) => c[0] === "linhas"), "nem lê o histórico");
});

test("destinatário: só o dono. Todas as leituras e gravações usam o uid do dono; sem uid, nada", async () => {
  const b = bancoFalso(ROWS), e = envio(); await rodar(b, e);
  assert.ok(b.calls.length > 0 && b.calls.every((c) => c[1] === DONO), "nenhuma chamada com outro usuário");
  const sem = envio(); const r = await resumoAlertasPreco(null, "", HOJE, (m) => sem.fn(m), bancoFalso(ROWS), new Date(HOJE + "T09:00:00Z")); assert.equal(sem.msgs.length, 0); assert.equal(r.motivo, "sem destinatário");
  /* contrato com o pushPara: envia só para as inscrições do uid recebido (Fernanda e outros ficam de fora) */
  const insc = [{ id: 1, user_id: DONO, ap: "iphone do dono" }, { id: 2, user_id: DONO, ap: "ipad do dono" }, { id: 3, user_id: FERNANDA, ap: "iphone da Fernanda" }, { id: 4, user_id: "outro", ap: "outro" }], recebeu = [];
  const pushParaFalso = async (uid, msg) => { const l = insc.filter((x) => x.user_id === uid); for (const x of l) recebeu.push([x.ap, msg.tag]); return l.length ? `${l.length} de ${l.length} aparelhos` : "nenhum aparelho com notificações ativas"; };
  await resumoAlertasPreco(null, DONO, HOJE, (m) => pushParaFalso(DONO, m), bancoFalso(ROWS), new Date(HOJE + "T09:00:00Z"));
  assert.deepEqual(recebeu.map((x) => x[0]), ["iphone do dono", "ipad do dono"]); assert.ok(!recebeu.some((x) => /Fernanda|outro/.test(x[0])));
});

test("integração na rotina (index.ts): só o dono já identificado, só pushPara(uid) e uma linha nova; o resto da Garmin intacto", () => {
  const g = ler("supabase/functions/garmin/index.ts");
  assert.match(g, /import \{ resumoAlertasPreco \} from "\.\/alertas_preco\.ts";/);
  assert.match(g, /await passo\("alertas_preco", \(\) => resumoAlertasPreco\(adm, uid, hoje, \(msg\) => pushPara\(adm, uid, msg\)\)\);/);
  /* o dono: quem tem dados pessoais e não é membro da casa (a Fernanda é membro) */
  assert.match(g, /const naoDono = new Set\(\(membros \?\? \[\]\)\.map\(\(m: any\) => m\.membro\)\);/); assert.match(g, /\.find\(\(u: string\) => !naoDono\.has\(u\)\);\s+if \(!uid\) return responder\(\{ erro: "dono não encontrado" \}, 404\);/);
  assert.match(g, /adm\.from\("push_inscricoes"\)\.select\("id,endpoint,p256dh,auth"\)\.eq\("user_id", uid\)/, "pushPara só lê as inscrições do uid recebido");
  assert.match(g, /await adm\.rpc\("rac_rotina_ok"/);
  /* ordem dos passos e o que já existia */
  const ordem = ["garmin_token", "garmin_dias", "garmin_treinos", '"chuva"', '"resumo_semana"', 'passo("acabando"', 'passo("alertas"', 'passo("alertas_preco"', 'passo("backup"', 'from("rotina_log").insert'].map((s) => g.indexOf(s));
  assert.ok(ordem.every((i) => i > 0) && ordem.every((v, i) => i === 0 || v > ordem[i - 1]), "o passo novo fica entre os avisos da agenda e o backup");
  for (const s of ["async function pushPara(", "async function enviarPush(", "async function chavesVapid(", "titulo: domingo ? \"Dia a Dia RAC — resumo da semana\" : \"Dia a Dia RAC — hoje\"", "tag: \"rotina\"", "corpo: \"Notificações funcionando neste aparelho ✓\"", "sincDias(adm, tok!, uid, {}, hoje, 13)", "sincAtiv(adm, tok!, uid, {})", "backupSemanal(adm, uid, hoje)"]) assert.ok(g.includes(s), s);
  assert.ok(!/mercado-alertas|mkal|PREFIXO_DIA/.test(g), "a lógica dos alertas fica no arquivo próprio");
  assert.ok(!/anthropic/i.test(g)); assert.ok(!/notas_fiscais|compras_reembolsos|compras_importacoes/.test(g));
  assert.ok(!/cron\.|schedule\(|jobname/.test(g), "a função não mexe no agendamento (a rotina continua a do banco, uma vez por dia)");
});

test("segurança do arquivo novo: sem segredos, sem VAPID, sem logs, sem apagar, sem tocar em dados Garmin nem nas preferências do dono", () => {
  const a = ler("supabase/functions/garmin/alertas_preco.ts"), cod = a.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/Deno\.|VAPID|jwk|rac_segredos|SECRET|TOKEN|apikey|Authorization|console\./i.test(cod), "nenhum segredo, chave ou log");
  assert.ok(!/\.delete\(|\.rpc\(|\.upsert\(|garmin_dia|garmin_ativ|\bfetch\(|Telegram/i.test(cod), "não apaga, não faz upsert, não chama a rede e não mexe no relógio");
  assert.ok(!/atualizar\(uid, "mercado-alertas"|reservar\(uid, "mercado-alertas"/.test(cod), "nunca grava a chave dos alertas do dono (leitura é do dono)");
  assert.ok(!/Fernanda|membros/.test(cod), "o destinatário vem pronto da rotina");
  assert.match(cod, /from\("pessoal"\)\.insert\(\{ user_id: uid, chave, valor \}\)/);
  /* o adaptador de banco só faz as leituras e escritas previstas */
  const from = [...cod.matchAll(/adm\.from\("(\w+)"\)/g)].map((m) => m[1]); assert.deepEqual([...new Set(from)].sort(), ["pessoal"]);
  assert.match(cod, /paginas\("notas"/); assert.match(cod, /paginas\("itens"/);
});

test("adaptador do banco: lê só o histórico do dono, monta as linhas como a view compras e reserva o dia com insert (duplicado = não envia)", async () => {
  const tabelas = { notas: [{ id: "n1", data: "2026-11-02", mercado_id: "m1", numero: "7" }], mercados: [{ id: "m1", nome: "Confiança (Sorocaba)" }], produtos: [{ id: "p1", nome: "Arroz", categoria: "Mercearia" }],
    itens: [{ id: "i1", nota_id: "n1", produto_id: "p1", descricao: "ARROZ T1", categoria: "Outros", quantidade: "2", unidade: "kg", valor_unitario: "5.8", valor_total: "11.6" }, { id: "i2", nota_id: "nx", produto_id: null, descricao: "SEM NOTA", categoria: "x", quantidade: 1, unidade: "un", valor_unitario: 1, valor_total: 1 }] };
  const usos = [], gravs = [];
  const adm = { from(t) { return { select(cols) { const q = { eq(c, v) { usos.push([t, c, v]); return q; }, order() { return q; }, range() { return Promise.resolve({ data: tabelas[t] ?? [], error: null }); },
    like() { return q; }, gte() { return q; }, maybeSingle() { return Promise.resolve({ data: t === "pessoal" ? { valor: { ok: 1 } } : null, error: null }); }, then(f) { return f({ data: [], error: null }); } }; return q; },
    insert(v) { gravs.push([t, "insert", v]); return Promise.resolve({ error: t === "pessoal" && v.chave === "dup" ? { code: "23505" } : null }); },
    update(v) { gravs.push([t, "update", v]); return { eq() { return { eq() { return Promise.resolve({ error: null }); } }; } }; } }; } };
  const b = bancoSupabase(adm), l = await b.linhas(DONO);
  assert.equal(l.length, 1); assert.deepEqual([l[0].produto, l[0].categoria, l[0].mercado, l[0].unidade, l[0].valor_unitario, l[0].nota], ["Arroz", "Mercearia", "Confiança (Sorocaba)", "kg", 5.8, "2026-11-02|Confiança (Sorocaba)|7"]);
  assert.ok(usos.length >= 4 && usos.every((u) => u[1] === "user_id" && u[2] === DONO), "toda leitura é filtrada pelo dono");
  assert.equal(await b.reservar(DONO, "novo", { a: 1 }), true); assert.equal(await b.reservar(DONO, "dup", {}), false);
  assert.deepEqual(await b.pessoal(DONO, "mercado-alertas"), { ok: 1 });
});

test("Service Worker e notificações existentes: nada mudou; a notificação do Mercado abre a aba Alertas", () => {
  const sw = ler("sw.js");
  assert.match(sw, /self\.addEventListener\("push", e => \{/); assert.match(sw, /data: \{ url: d\.url \|\| "\.\/#agenda" \}/); assert.match(sw, /tag: d\.tag \|\| undefined/); assert.match(sw, /self\.addEventListener\("notificationclick"/);
  const alvo = new URL(URL_ALERTAS, "https://raynercarvalho.com.br/sw.js").href; assert.equal(alvo, "https://raynercarvalho.com.br/#mercado/alertas");
  assert.ok(!/mercado-alertas|alertas_preco/.test(sw), "o sw.js não precisa mudar");
  const rm = rota("mercado"); assert.ok(rm && !rm.marcaPropria, "a rota #mercado existe no registro e marca o próprio item do menu"); assert.match(rm.abrirTexto, /if\(window\.RACmercado\)window\.RACmercado\.render\(p\[1\]\|\|"",p\[2\]\|\|""\)/, "#mercado/alertas chama a aba (e #mercado/categoria/X e #mercado/produto/X levam o segundo trecho da rota)");
  assert.match(ler("mercado.js"), /\["alertas", "Alertas"\]/); assert.ok(ler("supabase/functions/garmin/index.ts").includes('url: domingo && semana.length ? "./#resumo" : compra && !linhas.length ? "./#lista" : "./#agenda"'), "destinos antigos intactos");
});

test("cliente: o dono liga ou desliga o resumo nos ajustes; nenhuma tabela nova nem migration", () => {
  assert.equal(N.mkalConfig({}).push.on, true); assert.equal(N.mkalConfig({ push: { on: false } }).push.on, false);
  assert.match(ler("mercado.js"), /Receber o resumo semanal por notificação \(domingo, 6h\)/); assert.match(ler("mercado.js"), /push: \{ on: pushOn\.checked \}/);
  assert.ok(!fs.existsSync(new URL("../supabase/propostas/042_alertas_push.sql", import.meta.url)), "o estado do resumo cabe em pessoal (uma chave por domingo)");
  assert.match(ler("docs/mercado-alertas.md"), /Resumo semanal por Web Push/);
});
