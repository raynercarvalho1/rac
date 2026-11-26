// Monitor de integrações (Fase 1, M1 e M2; docs/planejamento/05-integracoes-e-automacoes.md, seção 4).
// 1) Divergência: os horários do monitor (NUCLEO.MON_PROCESSOS) são comparados com os agendamentos REAIS, lidos dos arquivos
//    (.github/workflows/*.yml e o pg_cron das migrations em supabase/*.sql, a última que agenda cada job). Faltou um agendamento,
//    sobrou um inventado ou mudou um horário: o teste falha. O banco de produção não é lido aqui (conferência só leitura do dono:
//    select jobname, schedule, active from cron.job).
// 2) Regras puras (cron, normalização de cada registro e estado). 3) A tela do Sistema (bloco real de js/sistema.js num DOM falso).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const raiz = new URL("../", import.meta.url);
const ler = (a) => fs.readFileSync(new URL(a, raiz), "utf8").replace(/\r\n/g, "\n");
const H = 36e5, MIN = 6e4;
const copia = (x) => JSON.parse(JSON.stringify(x));

/* ----- os agendamentos reais ----- */
/* Agendamentos APLICADOS em produção cujo arquivo ficou em supabase/propostas/ (o job está ativo em cron.job, conferido em 26/11/2026; os testes do
   Inbox tratam esse arquivo como proposta). Qualquer outra proposta continua sem contar. */
const APLICADAS_EM_PROPOSTAS = ["055_inbox_agendamento.sql"];
function agendamentosReais() {
  const workflows = {};
  for (const f of fs.readdirSync(new URL(".github/workflows/", raiz)).filter((x) => /\.ya?ml$/.test(x)).sort()) {
    const crons = [...ler(".github/workflows/" + f).matchAll(/^\s*-\s*cron:\s*["']([^"']+)["']/gm)].map((m) => m[1].trim());
    if (crons.length) workflows[f] = { arquivo: ".github/workflows/" + f, crons };
  }
  /* pg_cron: na ordem das migrations, sem comentários; unschedule tira, schedule põe (a última vale). Propostas não contam. */
  const jobs = {};
  const sqls = fs.readdirSync(new URL("supabase/", raiz)).filter((x) => /^\d{3}_.*\.sql$/.test(x)).map((f) => ({ f, caminho: "supabase/" + f }))
    .concat(APLICADAS_EM_PROPOSTAS.map((f) => ({ f, caminho: "supabase/propostas/" + f }))).sort((a, b) => (a.f < b.f ? -1 : 1));
  for (const { f, caminho } of sqls) {
    const txt = ler(caminho).split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
    for (const m of txt.matchAll(/cron\.(unschedule|schedule)\(\s*'([^']+)'(?:\s*,\s*'([^']+)')?/g)) {
      if (m[1] === "unschedule") delete jobs[m[2]]; else jobs[m[2]] = { arquivo: caminho, crons: [m[3].trim()] };
    }
  }
  return { workflows, jobs };
}
/* agendamentos que NÃO entram no catálogo, cada um com o motivo: o vigia (monitor-alerta, 069) é o próprio Monitor e não tem como se avisar da própria falha (precisaria de um
   serviço externo, fora do escopo); a Edge Function e os incidentes dele são vistos em Sistema → Monitor → Ocorrências recentes */
const FORA_DO_CATALOGO = { "monitor-alerta": "o vigia do próprio Monitor (M4, 069)" };
/* o que diverge entre o catálogo do monitor e os agendamentos reais (lista vazia = tudo igual) */
function divergencias(catalogo, real) {
  const d = [], igual = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  for (const [job, r] of Object.entries(real.jobs)) {
    const p = catalogo.find((x) => x.job === job);
    if (!p && FORA_DO_CATALOGO[job]) continue;
    if (!p) d.push(`pg_cron "${job}" (${r.arquivo}) não aparece no monitor`);
    else { if (!igual(p.crons, r.crons)) d.push(`"${job}": monitor ${p.crons} × real ${r.crons}`); if (p.arquivo !== r.arquivo) d.push(`"${job}": monitor cita ${p.arquivo}, o agendamento vigente está em ${r.arquivo}`); }
  }
  for (const [wf, r] of Object.entries(real.workflows)) {
    const p = catalogo.find((x) => x.workflow === wf);
    if (!p) d.push(`workflow ${wf} agendado não aparece no monitor`);
    else { if (!igual(p.crons, r.crons)) d.push(`${wf}: monitor ${p.crons} × real ${r.crons}`); if (p.arquivo !== r.arquivo) d.push(`${wf}: arquivo ${p.arquivo}`); }
  }
  for (const p of catalogo) {
    if (p.job && !real.jobs[p.job]) d.push(`monitor mostra "${p.job}", que não está agendado em nenhuma migration`);
    if (p.workflow && !real.workflows[p.workflow]) d.push(`monitor mostra ${p.workflow}, sem agendamento no GitHub`);
    if (!p.job && !p.workflow) d.push(`${p.id}: processo sem agendamento real`);
  }
  return d;
}

test("divergência: todo processo agendado (pg_cron e GitHub) aparece no monitor com o MESMO horário e o arquivo vigente", () => {
  const real = agendamentosReais();
  assert.ok(Object.keys(real.jobs).length >= 3 && Object.keys(real.workflows).length >= 3, "achou os agendamentos");
  assert.deepEqual(divergencias(N.MON_PROCESSOS, real), []);
  assert.deepEqual(Object.keys(real.jobs).sort(), ["fiscal-entradas", "inbox-sync", "monitor-alerta", "rac-newsletter", "rac-rotina", "radar-rotina"]);
  assert.deepEqual(Object.keys(real.workflows).sort(), ["noticias.yml", "testes.yml", "vagas.yml"]);
});

test("o teste de divergência pega horário trocado, agendamento esquecido, processo inventado e arquivo velho", () => {
  const real = agendamentosReais(), cat = copia(N.MON_PROCESSOS);
  cat.find((p) => p.id === "rotina").crons = ["0 10 * * *"];
  const d1 = divergencias(cat, real);
  assert.equal(d1.length, 1); assert.match(d1[0], /rac-rotina.*0 10 \* \* \*.*0 9 \* \* \*/);
  assert.match(divergencias(copia(N.MON_PROCESSOS).filter((p) => p.id !== "vagas"), real).join(), /vagas\.yml agendado não aparece/);
  assert.match(divergencias([...copia(N.MON_PROCESSOS), { id: "x", job: "inventado", crons: ["0 1 * * *"] }], real).join(), /"inventado", que não está agendado/);
  const velho = copia(N.MON_PROCESSOS); velho.find((p) => p.id === "newsletter").arquivo = "supabase/019_newsletter_avisos.sql";
  assert.match(divergencias(velho, real).join(), /agendamento vigente está em supabase\/023_newsletter_turnos\.sql/, "a 019 foi substituída pela 023");
  const r2 = copia(real); r2.workflows["noticias.yml"].crons = ["15 */3 * * *"];
  assert.match(divergencias(N.MON_PROCESSOS, r2).join(), /noticias\.yml: monitor/);
});

test("a tabela de agendamentos do Documento 05 cita os mesmos horários do monitor", () => {
  const doc = ler("docs/planejamento/05-integracoes-e-automacoes.md");
  for (const p of N.MON_PROCESSOS) for (const c of p.crons) assert.ok(doc.includes("`" + c + "`"), `${p.id}: ${c} fora do Documento 05`);
});

/* ----- regras puras ----- */
const T = (s) => Date.parse(s);
const BR = (ms) => new Date(ms).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

test("cron: próximo e anterior horário em UTC; 9h UTC é 6h de Brasília; lista, faixa, passo, dia da semana", () => {
  const P = N.monCronProxima, A = N.monCronAnterior, iso = (x) => new Date(x).toISOString().slice(0, 16);
  assert.equal(iso(P("0 9 * * *", T("2026-11-13T02:30:00Z"))), "2026-11-13T09:00");
  assert.equal(BR(P("0 9 * * *", T("2026-11-13T02:30:00Z"))), "13/11, 06:00", "a rotina das 6h é às 6h de Brasília");
  assert.equal(iso(P("0 9 * * *", T("2026-11-13T09:00:00Z"))), "2026-11-14T09:00", "depois de, não no mesmo minuto");
  assert.equal(iso(A("0 9 * * *", T("2026-11-13T09:00:00Z"))), "2026-11-13T09:00", "até, inclusive");
  assert.equal(iso(A("0 9 * * *", T("2026-11-13T08:59:00Z"))), "2026-11-12T09:00");
  assert.equal(iso(P("50 0-2,9-23 * * *", T("2026-11-13T02:55:00Z"))), "2026-11-13T09:50", "pula das 3h às 8h UTC");
  assert.equal(iso(A("50 0-2,9-23 * * *", T("2026-11-13T08:00:00Z"))), "2026-11-13T02:50");
  assert.equal(iso(P("20 9,21 * * *", T("2026-11-13T10:00:00Z"))), "2026-11-13T21:20");
  assert.equal(BR(P("20 9,21 * * *", T("2026-11-13T10:00:00Z"))), "13/11, 18:20");
  assert.equal(iso(P(["15 */3 * * *", "40 * * * *"], T("2026-11-13T02:30:00Z"))), "2026-11-13T02:40", "dois crons: o mais cedo");
  assert.equal(iso(P("15 */3 * * *", T("2026-11-13T02:30:00Z"))), "2026-11-13T03:15");
  assert.equal(iso(P("30 10 * * 1", T("2026-11-13T12:00:00Z"))), "2026-11-16T10:30", "13/11/2026 é sexta; a próxima segunda é 16/11");
  assert.equal(iso(A("30 10 * * 1", T("2026-11-13T12:00:00Z"))), "2026-11-09T10:30");
  assert.equal(iso(P("0 12 * * 7", T("2026-11-13T12:00:00Z"))), "2026-11-15T12:00", "7 também é domingo");
  assert.equal(iso(P("0 0 1 * *", T("2026-11-13T12:00:00Z"))), "2026-12-01T00:00");
  assert.equal(iso(P("0 0 31 12 *", T("2026-12-31T00:00:00Z"))), "2027-12-31T00:00", "virada de ano");
  for (const ruim of ["", "0 9 * *", "60 9 * * *", "0 24 * * *", "*/0 * * * *", "a b c d e", "0 9 * * 8"]) assert.throws(() => N.monCron(ruim), /cron inválido/, ruim);
});

test("rotina das 6h (rotina_log): última, último sucesso, falhas em 7 dias, registros, erro do passo e backup de domingo", () => {
  const agora = T("2026-11-13T12:00:00Z");
  const l = [
    { quando: "2026-11-12T09:01:30Z", ok: true, resumo: { garmin_dias: { salvos: 2 }, garmin_treinos: { salvas: 1 }, alertas: { itens: 3, push: "1 de 1" } } },
    { quando: "2026-11-13T09:01:40Z", ok: false, resumo: { garmin_token: { erro: "a Garmin recusou a chave" }, alertas: { itens: 0 } } },
    { quando: "2026-11-08T09:03:00Z", ok: true, resumo: { backup: { tabelas: 30 } } },
    { quando: "2026-11-01T09:03:00Z", ok: false, resumo: {} },
  ];
  const r = N.monDeRotina(l, agora);
  assert.equal(r.ultima_execucao, T("2026-11-13T09:01:40Z"));
  assert.equal(r.ultima_ok, false);
  assert.equal(r.ultimo_sucesso, T("2026-11-12T09:01:30Z"));
  assert.equal(r.falhas, 1, "a de 01/11 está fora dos 7 dias");
  assert.equal(r.erro, "garmin_token: a Garmin recusou a chave");
  assert.equal(r.registros, "0 avisos");
  assert.deepEqual(copia(r.backup), { quando: T("2026-11-08T09:03:00Z"), ok: true, erro: "" });
  assert.equal(N.monDeRotina(l.slice(0, 1), agora).registros, "2 dias da Garmin, 1 treinos conferidos, 3 avisos");
  const v = N.monDeRotina([], agora); assert.equal(v.ultima_execucao, null); assert.equal(v.falhas, 0);
});

test("Radar (radar_coletas da rotina): as lojas da mesma rodada viram uma execução, com duração, contagem e falha só se todas falharem", () => {
  const agora = T("2026-11-13T22:00:00Z");
  const c = (i, f, status, lidas, grav, fal, erro) => ({ iniciada_em: i, terminada_em: f, status, ofertas_lidas: lidas, precos_gravados: grav, falhas: fal, erro_mensagem: erro || null });
  const l = [
    c("2026-11-13T21:20:05Z", "2026-11-13T21:20:40Z", "ok", 4, 2, 0),
    c("2026-11-13T21:20:41Z", "2026-11-13T21:21:30Z", "parcial", 3, 1, 1, "página sem preço"),
    c("2026-11-13T09:20:03Z", "2026-11-13T09:20:30Z", "falha", 2, 0, 2, "recusada"),
    c("2026-11-13T09:20:31Z", "2026-11-13T09:21:00Z", "falha", 1, 0, 1, "captcha"),
    c("2026-11-01T09:20:00Z", "2026-11-01T09:21:00Z", "falha", 1, 0, 1, "velha"),
  ];
  const r = N.monDeRadar(l, agora);
  assert.equal(r.ultima_execucao, T("2026-11-13T21:20:05Z"));
  assert.equal(r.ultima_ok, true, "parcial não é falha da execução");
  assert.equal(r.duracao, 85);
  assert.equal(r.registros, "7 ofertas lidas, 3 preços gravados, 1 com falha");
  assert.equal(r.falhas, 1, "a rodada das 9h20 falhou inteira; a de 01/11 está fora dos 7 dias");
  const s = N.monDeRadar(l.slice(2), agora);
  assert.equal(s.ultima_ok, false); assert.equal(s.erro, "captcha", "a mensagem da loja lida por último"); assert.equal(s.ultimo_sucesso, null);
  const a = N.monDeRadar([c("2026-11-13T21:20:05Z", null, "em_andamento", 0, 0, 0)], agora);
  assert.equal(a.rodando, true); assert.equal(a.ultima_ok, null); assert.equal(a.duracao, null);
});

test("Newsletter (newsletter_edicoes): a última edição gravada; tentativas sem edição não são registradas", () => {
  const r = N.monDeNewsletter([{ data: "2026-11-13", turno: "manha", origem: "ia", criado_em: "2026-11-13T09:52:00Z", atualizado_em: "2026-11-13T09:53:00Z" },
    { data: "2026-11-12", turno: "noite", origem: "regras", criado_em: "2026-11-12T21:50:00Z", atualizado_em: null }]);
  assert.equal(r.ultima_execucao, T("2026-11-13T09:53:00Z"));
  assert.equal(r.registros, "edição da manhã de 13/11, com resumo da IA");
  assert.equal(r.falhas, null, "não há registro das tentativas: falhas não registradas");
});

test("GitHub (M2): duração, falhas em 7 dias, cancelada não conta, rodando agora, desligado e o atraso típico do agendamento", () => {
  const agora = T("2026-11-13T22:00:00Z");
  const run = (c, ini, fim, conclusion, ev = "schedule", status = "completed") => ({ status, conclusion, event: ev, created_at: c, run_started_at: ini, updated_at: fim });
  const l = [
    run("2026-11-13T17:47:31Z", "2026-11-13T17:47:31Z", "2026-11-13T17:48:19Z", "success"),
    run("2026-11-12T17:30:00Z", "2026-11-12T17:30:05Z", "2026-11-12T17:31:00Z", "failure"),
    run("2026-11-11T17:32:49Z", "2026-11-11T17:32:49Z", "2026-11-11T17:33:37Z", "cancelled"),
    run("2026-11-10T17:21:57Z", "2026-11-10T17:21:57Z", "2026-11-10T17:22:40Z", "success"),
    run("2026-11-10T12:00:00Z", "2026-11-10T12:00:00Z", "2026-11-10T12:01:00Z", "success", "workflow_dispatch"),
  ];
  const r = N.monDeGithub(l, ["0 10 * * *"], agora, "active");
  assert.equal(r.ultima_execucao, T("2026-11-13T17:47:31Z"));
  assert.equal(r.duracao, 48);
  assert.equal(r.ultima_ok, true);
  assert.equal(r.falhas, 1);
  assert.equal(r.atraso_tipico, 451, "mediana das rodadas agendadas (começaram 7h22, 7h30, 7h33 e 7h48 depois das 10h): ~7,5 h");
  assert.equal(r.desligado, undefined);
  assert.equal(N.monDeGithub(l, ["15 */3 * * *", "40 * * * *"], agora).atraso_tipico, undefined, "com dois crons não se sabe qual disparou");
  const f = N.monDeGithub([run("2026-11-13T21:00:00Z", "2026-11-13T21:00:00Z", null, null, "schedule", "in_progress"), l[1]], ["0 10 * * *"], agora);
  assert.equal(f.rodando, true); assert.equal(f.ultima_ok, false); assert.equal(f.erro, "o GitHub marcou a execução como falha");
  assert.match(N.monDeGithub(l, ["0 10 * * *"], agora, "disabled_inactivity").desligado, /desligado no GitHub \(disabled_inactivity\)/);
});

test("robôs (JSON): itens, fontes fora do ar e os mesmos limites do painel antigo (8 h, 14 h e 30 h)", () => {
  const agora = T("2026-11-13T22:00:00Z"), ha = (h) => new Date(agora - h * H).toISOString();
  const r = N.monRobos([
    { nome: "Sorocaba", d: { coletado: ha(2), noticias: [1, 2, 3] }, campo: "noticias", idadeMax: 8 },
    { nome: "rumores", d: { coletado: ha(9), liga: [1] }, campo: "liga", idadeMax: 8 },
    { nome: "Newsletter", d: { coletado: ha(1), grupos: [1, 2], fontes: [{ n: "A", ok: true }, { n: "B", ok: false }] }, campo: "grupos", idadeMax: 14 },
    { nome: "vagas", d: { coletado: ha(1), vagas: [] }, campo: "vagas", idadeMax: 30 },
    { nome: "tecnologia", d: null, campo: "noticias", idadeMax: 8 }], agora);
  assert.equal(r.texto, "Sorocaba: 3 itens · rumores: 1 itens · Newsletter: 2 itens, 1 de 2 fontes (fora do ar: B) · vagas: 0 itens · tecnologia: não consegui ler");
  assert.deepEqual(copia(r.avisos), ["rumores parado", "vagas vazio", "tecnologia (sem arquivo)"]);
  assert.equal(r.ultimo, agora - 1 * H);
  const muitas = N.monRobos([{ nome: "Newsletter", d: { coletado: ha(1), grupos: [1], fontes: [1, 2, 3, 4].map((i) => ({ n: "F" + i, ok: false })).concat([{ n: "ok", ok: true }]) }, campo: "grupos", idadeMax: 14 }], agora);
  assert.deepEqual(copia(muitas.avisos), ["Newsletter: 4 fontes fora do ar"]);
});

test("estado: ok, atrasado (pelo horário previsto ou pela idade), falhou, desligado e sem informação; próxima pelo cron real", () => {
  const P = (id) => N.MON_PROCESSOS.find((p) => p.id === id), agora = T("2026-11-13T12:00:00Z"), A = N.monAvaliar;
  const ok = A(P("rotina"), { ultima_execucao: T("2026-11-13T09:01:00Z"), ultima_ok: true }, agora);
  assert.equal(ok.estado, "ok"); assert.equal(ok.proxima_prevista, T("2026-11-14T09:00:00Z"));
  assert.deepEqual(Object.keys(ok).sort(), ["area", "arquivo", "atraso_tipico", "crons", "duracao", "erro", "esperada", "estado", "execucoes_lidas", "falhas", "historico", "janela_desde", "motivo", "nome", "onde", "origem", "processo", "proxima_prevista", "recuperou", "registros", "rodando", "rodando_desde", "rotulo", "ultima_execucao", "ultima_falha", "ultimo_sucesso", "workflow"].sort(), "o contrato do Documento 05");
  const at = A(P("rotina"), { ultima_execucao: T("2026-11-12T09:01:00Z"), ultima_ok: true }, agora);
  assert.equal(at.estado, "atrasado"); assert.equal(at.esperada, T("2026-11-13T09:00:00Z"));
  assert.equal(A(P("rotina"), { ultima_execucao: T("2026-11-12T09:01:00Z"), ultima_ok: true }, T("2026-11-13T09:59:00Z")).estado, "ok", "dentro da tolerância de 60 min");
  assert.equal(A(P("rotina"), { ultima_execucao: T("2026-11-13T09:01:00Z"), ultima_ok: false, erro: "garmin_token: x" }, agora).motivo, "garmin_token: x");
  assert.equal(A(P("rotina"), {}, agora).estado, "desconhecido");
  assert.equal(A(P("rotina"), { erroLeitura: "sem permissão" }, agora).motivo, "não consegui ler (sem permissão)");
  const rd = A(P("radar"), { ultima_execucao: T("2026-11-12T21:20:00Z"), ultima_ok: true }, agora);
  assert.equal(rd.estado, "desconhecido", "o Radar só registra quando há oferta: falta de registro não é atraso");
  assert.equal(A(P("radar"), { ultima_execucao: T("2026-11-13T09:20:00Z"), ultima_ok: true }, agora).estado, "ok");
  assert.equal(A(P("vagas"), { ultima_execucao: agora - 29 * H, ultima_ok: true }, agora).estado, "ok", "o GitHub atrasa: vale a idade, não o horário");
  assert.match(A(P("vagas"), { ultima_execucao: agora - 31 * H, ultima_ok: true }, agora).motivo, /há mais de 30 h/);
  assert.match(A(P("testes"), { ultima_execucao: agora - 9 * 24 * H, ultima_ok: true }, agora).motivo, /há mais de 8 dias/);
  assert.equal(A(P("noticias"), { ultima_execucao: agora - H, ultima_ok: true, avisos: ["rumores parado"] }, agora).estado, "atrasado");
  assert.equal(A(P("noticias"), { desligado: "desligado no GitHub (disabled_manually)", ultima_execucao: agora }, agora).estado, "desligado");
  assert.equal(A(P("newsletter"), { ultima_execucao: agora - 15 * H, ultima_ok: true }, agora).estado, "atrasado");
  const r = N.monResumo([at, ok, rd]); assert.equal(r.pior.estado, "atrasado"); assert.deepEqual(copia(r.contagem), { atrasado: 1, ok: 1, desconhecido: 1 });
});


/* ----- M1/M2 concluídos: inbox-sync, janela, rodando, recuperou, histórico e o painel ----- */
test("inbox-sync (inbox_sincronizacao): rodada, duração somada, falha com erro, conta desligada, sem registro e limite de 30 min", () => {
  const agora = T("2026-11-26T12:00:00Z"), P = N.MON_PROCESSOS.find((p) => p.id === "inbox"), A = N.monAvaliar, iso = (m) => new Date(agora - m * MIN).toISOString();
  const L = (m, o = {}) => ({ conta_id: "a", ultima_ok_em: iso(m), ultima_tentativa_em: iso(m), falhas_seguidas: 0, duracao_ms: 400, erro: null, ...o });
  assert.deepEqual([P.job, P.crons, P.limite, P.donoSo], ["inbox-sync", ["*/10 * * * *"], 30, true]);
  const d = N.monDeInbox([L(5), L(5, { conta_id: "b", duracao_ms: 1600 }), L(15)], [{ id: "a", sync_auto: true }, { id: "b", sync_auto: true }]);
  assert.equal(d.ultima_execucao, agora - 5 * MIN); assert.equal(d.duracao, 2, "soma da rodada (400 + 1600 ms), sem a rodada anterior"); assert.equal(d.registros, "2 pastas sincronizadas");
  assert.equal(d.falhas, null, "falhas em 7 dias não são registradas"); assert.equal(d.ultima_ok, true);
  const ok = A(P, d, agora); assert.equal(ok.estado, "ok"); assert.equal(ok.proxima_prevista, T("2026-11-26T12:10:00Z"));
  const f = A(P, N.monDeInbox([L(5, { falhas_seguidas: 3, erro: "AUTHENTICATIONFAILED", ultima_ok_em: iso(300) })], []), agora);
  assert.equal(f.estado, "falhou"); assert.equal(f.motivo, "AUTHENTICATIONFAILED"); assert.equal(f.ultimo_sucesso, agora - 300 * MIN);
  assert.equal(N.monDeInbox([L(5, { duracao_ms: null })], []).duracao, null, "sem a duração de uma pasta não há duração da rodada");
  const off = A(P, N.monDeInbox([L(5)], [{ id: "a", sync_auto: false }]), agora); assert.equal(off.estado, "desligado"); assert.match(off.motivo, /desligada nas contas/);
  assert.equal(A(P, N.monDeInbox([], []), agora).estado, "desconhecido");
  assert.equal(A(P, N.monDeInbox([L(29)], []), agora).estado, "ok"); const at = A(P, N.monDeInbox([L(31)], []), agora);
  assert.equal(at.estado, "atrasado"); assert.match(at.motivo, /há mais de 30 min/, "limite curto em minutos, não em horas");
});

test("execução em andamento nunca é atraso; passou de 2 h vira alerta; falha continua falha; cancelada não conta", () => {
  const agora = T("2026-11-26T12:00:00Z"), P = (id) => N.MON_PROCESSOS.find((p) => p.id === id), A = N.monAvaliar, base = { ultima_execucao: agora - 40 * H, ultima_ok: true };
  assert.equal(A(P("vagas"), base, agora).estado, "atrasado");
  const r1 = A(P("vagas"), { ...base, rodando: true, rodando_desde: agora - 10 * MIN }, agora); assert.equal(r1.estado, "ok"); assert.equal(r1.rodando, true);
  const r2 = A(P("vagas"), { ...base, rodando: true, rodando_desde: agora - 3 * H }, agora); assert.equal(r2.estado, "atrasado"); assert.match(r2.motivo, /andamento há mais de 2 h/);
  assert.equal(A(P("rotina"), { ultima_execucao: agora - 30 * H, ultima_ok: true, rodando: true, rodando_desde: agora - MIN }, agora).estado, "ok", "pelo horário também");
  assert.equal(A(P("vagas"), { ...base, ultima_ok: false, rodando: true, rodando_desde: agora - MIN, erro: "x" }, agora).estado, "falhou", "a falha vale até um sucesso");
  const run = (m, st, c) => ({ status: st, conclusion: c, event: "schedule", created_at: new Date(agora - m * MIN).toISOString(), run_started_at: new Date(agora - m * MIN).toISOString(), updated_at: new Date(agora - m * MIN + 60e3).toISOString() });
  const g = N.monDeGithub([run(5, "in_progress", null), run(100, "completed", "cancelled"), run(200, "completed", "success")], ["0 10 * * *"], agora);
  assert.equal(g.rodando, true); assert.equal(g.rodando_desde, agora - 5 * MIN); assert.deepEqual(copia(g.historico.map((x) => x.e)), ["rodando", "ok"], "a cancelada não entra no histórico");
});

test("GitHub: janela real das execuções lidas, histórico de 7, última falha e respostas incompletas sem quebrar", () => {
  const agora = T("2026-11-26T12:00:00Z"), run = (m, c) => ({ status: "completed", conclusion: c, event: "schedule", created_at: new Date(agora - m * MIN).toISOString(), run_started_at: new Date(agora - m * MIN).toISOString(), updated_at: new Date(agora - m * MIN + 30e3).toISOString() });
  const runs = Array.from({ length: 30 }, (_, i) => run(30 + i * 60, i === 9 ? "failure" : "success"));
  const g = N.monDeGithub(runs, ["15 */3 * * *", "40 * * * *"], agora);
  assert.equal(g.execucoes_lidas, 30); assert.equal(g.janela_desde, agora - (30 + 29 * 60) * MIN, "as 30 mais novas cobrem ~1 dia, não 7");
  assert.equal(g.ultima_falha, agora - (30 + 9 * 60) * MIN); assert.equal(g.historico.length, 7); assert.equal(g.historico[0].t, agora - 30 * MIN);
  assert.equal(g.falhas, 1); assert.equal(g.ultima_ok, true);
  const v = N.monDeGithub([{}, null, { status: "completed" }, { status: "completed", conclusion: "success", created_at: "lixo" }], ["0 10 * * *"], agora);
  assert.equal(v.ultima_execucao, null); assert.deepEqual(copia(v.historico), []); assert.equal(v.janela_desde, null);
  assert.equal(N.monAvaliar(N.MON_PROCESSOS.find((p) => p.id === "vagas"), v, agora).estado, "desconhecido", "resposta incompleta não é falha");
});

test("rotina: última falha, recuperou (sucesso depois da falha) e histórico com horário; falha sem sucesso depois continua falhou", () => {
  const agora = T("2026-11-26T12:00:00Z"), P = N.MON_PROCESSOS.find((p) => p.id === "rotina"), iso = (m) => new Date(agora - m * MIN).toISOString();
  const d = N.monDeRotina([{ quando: iso(180), ok: true, resumo: {} }, { quando: iso(25 * 60), ok: false, resumo: {} }, { quando: iso(49 * 60), ok: true, resumo: {} }], agora);
  assert.equal(d.ultima_falha, agora - 25 * 60 * MIN); assert.deepEqual(copia(d.historico.map((x) => x.e)), ["ok", "falha", "ok"]);
  const a = N.monAvaliar(P, d, agora); assert.equal(a.estado, "ok"); assert.equal(a.recuperou, true);
  const f = N.monAvaliar(P, N.monDeRotina([{ quando: iso(180), ok: false, resumo: {} }, { quando: iso(25 * 60), ok: true, resumo: {} }], agora), agora);
  assert.equal(f.estado, "falhou"); assert.equal(f.recuperou, false);
  assert.equal(N.monAvaliar(P, N.monDeRotina([{ quando: iso(180), ok: true, resumo: {} }], agora), agora).recuperou, false, "sem falha, nada a recuperar");
});

test("painel: quatro cartões, alertas por gravidade com componente e fonte, e o filtro de cada cartão", () => {
  const agora = T("2026-11-26T12:00:00Z"), P = (id) => N.MON_PROCESSOS.find((p) => p.id === id), A = N.monAvaliar;
  const lista = [A(P("rotina"), { ultima_execucao: agora - H, ultima_ok: true }, agora),
    A(P("testes"), { ultima_execucao: agora - H, ultima_ok: false, ultima_falha: agora - H, erro: "o GitHub marcou a execução como falha", origem: "GitHub" }, agora),
    A(P("vagas"), { ultima_execucao: agora - 40 * H, ultima_ok: true, origem: "GitHub" }, agora),
    A(P("radar"), {}, agora), A(P("noticias"), { desligado: "desligado no GitHub (disabled_manually)", ultima_execucao: agora }, agora)];
  const pn = N.monPainel(lista); assert.deepEqual(copia(pn.cartoes), { todos: 5, normais: 1, atencao: 2, semverif: 2 });
  assert.deepEqual(pn.alertas.map((a) => [a.processo, a.nivel]), [["testes", "falha"], ["vagas", "atraso"], ["noticias", "info"], ["radar", "info"]], "falha primeiro, depois atraso, depois o que não é erro");
  assert.equal(pn.alertas[0].componente, "GitHub Actions"); assert.equal(pn.alertas[0].quando, agora - H); assert.equal(pn.alertas[3].componente, "Supabase");
  assert.deepEqual(N.monFiltro(lista, "atencao").map((x) => x.processo), ["testes", "vagas"]); assert.equal(N.monFiltro(lista, "todos").length, 5); assert.equal(N.monFiltro(lista, "semverif").length, 2);
  assert.deepEqual(copia(N.monPainel([]).cartoes), { todos: 0, normais: 0, atencao: 0, semverif: 0 }); assert.deepEqual(N.monPainel(null).alertas, []);
});

/* ----- a tela: o bloco "Monitor de integrações" de js/sistema.js num DOM falso ----- */
class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.attrs = {}; this.className = ""; this._t = null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  get textContent() { return this._t != null ? this._t : this.children.map((c) => c.textContent).join(" "); }
  set textContent(v) { this._t = String(v); this.children = []; }
  set innerHTML(v) { this.children = []; this._t = null; }
  appendChild(c) { this.children.push(c); return c; }
  querySelector(s) { const k = s.replace(/^\./, ""); for (const c of this.children) { if (String(c.className || "").split(" ").includes(k)) return c; const x = c.querySelector(s); if (x) return x; } return null; }
}
function h(tag, attrs, ...kids) {
  const e = new El(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else e.setAttribute(k, v); }
  for (const c of kids.flat()) if (c != null && c !== false) e.appendChild(c);
  return e;
}
const SIS = ler("js/sistema.js");
const BLOCO = SIS.slice(SIS.indexOf("  /* ===== Monitor de integrações"), SIS.indexOf("  /* baixa o backup automático"));
const SISHA = /^  function sisHa\(iso\)\{.*$/m.exec(SIS)[0];
const espera = () => new Promise((r) => setTimeout(r, 30));


const todos = (el, f, acc = []) => { if (f(el)) acc.push(el); for (const c of el.children || []) todos(c, f, acc); return acc; };
const comClasse = (el, k) => todos(el, (x) => String(x.className || "").split(" ").includes(k));

function tela({ resp = {}, gh = "ok", cache = null, dono = true } = {}) {
  const ops = [], buscas = [], guardado = {}, dicas = [], raiz = new El("div");
  if (cache) guardado["rac-monitor-gh"] = JSON.stringify(cache);
  const consulta = (t) => { const st = { t, ops: [] }; ops.push(st); const p = new Proxy({}, { get(_, k) {
    if (k === "then") { const r = Promise.resolve(typeof resp[t] === "function" ? resp[t]() : resp[t]).then((x) => (x && x.erro ? { data: null, error: { message: x.erro } } : { data: x || [], error: null })); return r.then.bind(r); }
    return (...a) => { st.ops.push(k); return p; }; } }); return p; };
  const ctx = {
    NUCLEO: N, h, panel: (t, s) => h("div", { class: "panel" }, h("h2", { text: t }), h("p", { class: "sub", text: s })), ext: (u, t, c) => h("a", { class: c, href: u, text: t }),
    SB: { from: consulta, rpc: (n) => consulta("rpc:" + n) }, sbOk: (r) => { if (r.error) throw new Error(r.error.message); return r.data; }, isOwner: () => dono, $: () => raiz,
    racDica: { ligar: (el, f) => dicas.push([el, f]) },
    atuLer: (f) => Promise.resolve().then(f).then((v) => ({ ok: true, v }), (e) => ({ ok: false, erro: e && e.message || String(e) })),
    getJson: (u) => { const x = resp["json:" + u.replace(/\?.*$/, "")]; return x ? Promise.resolve(x) : Promise.reject(new Error("HTTP 404")); },
    fetch: (u, o) => { buscas.push({ u, o }); if (gh !== "ok") return Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) });
      const wf = /workflows\/([^/]+)\/runs/.exec(u); return Promise.resolve({ ok: true, json: () => Promise.resolve(wf ? { workflow_runs: resp["gh:" + wf[1]] || [] } : { workflows: resp["gh:workflows"] || [] }) }); },
    localStorage: { getItem: (k) => guardado[k] ?? null, setItem: (k, v) => { guardado[k] = v; } },
    logErro() {}, Date, JSON, Promise, Object, Array, String, Math, Error, console,
  };
  vm.createContext(ctx);
  vm.runInContext(SISHA + "\n" + BLOCO, ctx, { filename: "sistema.js (monitor)" });
  const p = ctx.sisMonitor();
  const linhas = () => comClasse(p, "monint")[0].children.map((li) => ({ dot: li.children[0].textContent, cls: li.className, nome: li.children[1] && li.children[1].children[0] ? li.children[1].children[0].textContent : li.textContent, txt: li.textContent }));
  const cartoes = () => comClasse(p, "moncards")[0].children;
  return { p, ctx, linhas, cartoes, ops, buscas, guardado, dicas, raiz, barra: () => comClasse(p, "monbar")[0].textContent, alertas: () => comClasse(p, "monalert").length ? comClasse(p, "monalert")[0].children.map((li) => li.textContent) : [] };
}
function dadosBons() {
  const agora = Date.now(), iso = (ms) => new Date(ms).toISOString();
  const rot = N.monCronAnterior("0 9 * * *", agora - 60 * MIN) + 2 * MIN, rad = N.monCronAnterior("20 9,21 * * *", agora - 60 * MIN) + MIN;
  const run = (ms, dur) => ({ status: "completed", conclusion: "success", event: "schedule", created_at: iso(ms), run_started_at: iso(ms), updated_at: iso(ms + dur * 1000) });
  return {
    rotina_log: [{ quando: iso(rot), ok: true, resumo: { garmin_dias: { salvos: 2 }, alertas: { itens: 1 } } }],
    newsletter_edicoes: [{ data: iso(agora).slice(0, 10), turno: "manha", origem: "regras", criado_em: iso(agora - 2 * H), atualizado_em: iso(agora - 2 * H) }],
    radar_coletas: [{ iniciada_em: iso(rad), terminada_em: iso(rad + 30e3), status: "ok", ofertas_lidas: 3, precos_gravados: 1, falhas: 0 }],
    garmin_dia: [{ atualizado: iso(agora - 3 * H) }],
    notas_fiscais_entradas: [{ atualizado_em: iso(N.monCronAnterior("10 */6 * * *", agora - 90 * MIN) + MIN) }],
    inbox_sincronizacao: [{ conta_id: "a", ultima_ok_em: iso(agora - 5 * MIN), ultima_tentativa_em: iso(agora - 5 * MIN), falhas_seguidas: 0, duracao_ms: 385, erro: null },
      { conta_id: "b", ultima_ok_em: iso(agora - 5 * MIN), ultima_tentativa_em: iso(agora - 5 * MIN), falhas_seguidas: 0, duracao_ms: 1459, erro: null }],
    inbox_contas: [{ id: "a", sync_auto: true }, { id: "b", sync_auto: true }],
    "json:noticias.json": { coletado: iso(agora - H), noticias: [1, 2] }, "json:tecdados.json": { coletado: iso(agora - H), noticias: [1] },
    "json:rumores.json": { coletado: iso(agora - H), liga: [1] }, "json:newsletter.json": { coletado: iso(agora - H), grupos: [1], fontes: [{ n: "A", ok: true }] },
    "json:vagas.json": { coletado: iso(agora - 5 * H), vagas: [1, 2, 3] },
    "gh:workflows": [{ path: ".github/workflows/noticias.yml", state: "active" }, { path: ".github/workflows/vagas.yml", state: "active" }, { path: ".github/workflows/testes.yml", state: "active" }],
    "gh:noticias.yml": [run(agora - H, 20)], "gh:vagas.yml": [run(agora - 5 * H, 47)], "gh:testes.yml": [run(agora - 2 * 24 * H, 200)],
  };
}
const NOMES8 = ["Rotina das 6h", "Newsletter (edições)", "Radar de Preços (coleta)", "Robô de notícias", "Robô de vagas", "Testes automáticos", "Central Fiscal (entrada no Mercado)", "Inbox (sincronização)"];

test("tela (dono): 8 processos, 4 cartões, estado, última e próxima execução, duração, registros, fonte e o agendamento real", async () => {
  const t = tela({ resp: dadosBons() });
  await espera();
  assert.deepEqual(t.cartoes().map((c) => c.children[1].textContent), ["8", "8", "0", "0"]);
  assert.deepEqual(t.cartoes().map((c) => c.children[0].textContent), ["Monitoradas", "Normais", "Exigem atenção", "Sem verificação"]);
  assert.equal(t.alertas().length, 0, "tudo normal: sem bloco de alertas");
  assert.match(t.barra(), /Consultado em \d\d\/\d\d,? \d\d:\d\d · GitHub: consulta nova/);
  const l = t.linhas();
  assert.deepEqual(l.map((x) => x.nome), NOMES8.map((n) => n + " · ok"));
  for (const x of l) {
    assert.equal(x.dot, "✓");
    assert.match(x.txt, /Último sucesso: \d\d\/\d\d,? \d\d:\d\d · falhas (em 7 dias|nas últimas \d+ execuções \(desde [^)]+\)): (\d+|não registradas)/);
    assert.match(x.txt, /Próxima prevista: (a partir de )?\d\d\/\d\d,? \d\d:\d\d/);
    assert.match(x.txt, /Onde roda: (GitHub Actions|Supabase \(pg_cron\)) · fonte da informação: .+/);
    assert.match(x.txt, /Agendamento: .+ \(UTC\) · (supabase|\.github)\//);
  }
  assert.match(l[0].txt, /Agendamento: 0 9 \* \* \* \(UTC\) · supabase\/008_sistema\.sql/); assert.match(l[0].txt, /2 dias da Garmin, 1 avisos/); assert.match(l[0].txt, /Relógio: último dado há 3 h/);
  assert.match(l[0].txt, /fonte da informação: rotina_log/); assert.doesNotMatch(l[0].txt, /duração/, "a rotina não registra o início: sem duração");
  assert.match(l[4].txt, /duração 47\u00a0s · vagas: 3 itens/); assert.match(l[3].txt, /Agendamento: 15 \*\/3 \* \* \* e 40 \* \* \* \* \(UTC\) · \.github\/workflows\/noticias\.yml/);
  assert.match(l[1].txt, /Última edição gravada: .*edição da manhã/); assert.match(l[1].txt, /falhas em 7 dias: não registradas/);
  assert.match(l[7].txt, /Última sincronização: .*duração 1,8\u00a0s · 2 pastas sincronizadas/); assert.match(l[7].txt, /Agendamento: \*\/10 \* \* \* \* \(UTC\) · supabase\/propostas\/055_inbox_agendamento\.sql/);
  assert.match(l[4].txt, /Ver este robô no GitHub/); assert.doesNotMatch(l[0].txt, /Ver este robô/, "link só dos robôs do GitHub");
  assert.match(l[3].txt, /falhas nas últimas 1 execuções|falhas em 7 dias: 0/);
});

test("tela: só lê (nenhuma gravação), o GitHub é a API pública sem login, as 4 consultas ficam 15 min e a tela diz que é cópia", async () => {
  const d = dadosBons(), t = tela({ resp: d });
  await espera();
  assert.deepEqual(t.ops.map((o) => o.t).sort(), ["garmin_dia", "inbox_contas", "inbox_sincronizacao", "newsletter_edicoes", "notas_fiscais_entradas", "radar_coletas", "rotina_log", "sinais"]);
  for (const o of t.ops) for (const k of o.ops) assert.ok(["select", "order", "limit", "eq"].includes(k), o.t + ": " + k);
  assert.equal(t.buscas.length, 4, "workflows + 3 listas de execuções");
  assert.equal(t.buscas.filter((b) => /\/runs\?branch=main&per_page=30$/.test(b.u)).length, 3, "só as execuções da main: um PR com teste falhando não vira falha do processo");
  for (const b of t.buscas) { assert.match(b.u, /^https:\/\/api\.github\.com\/repos\/raynercarvalho1\/rac\/actions\/workflows/); assert.equal(b.o, undefined, "sem cabeçalho, sem credencial"); }
  const salvo = JSON.parse(t.guardado["rac-monitor-gh"]);
  const t2 = tela({ resp: d, cache: salvo });
  await espera();
  assert.equal(t2.buscas.length, 0, "dentro de 15 min usa a cópia deste aparelho");
  assert.match(t2.barra(), /GitHub: cópia de \d\d\/\d\d,? \d\d:\d\d \(renovada a cada 15 min\)/);
  const velho = { quando: Date.now() - 16 * MIN, dados: salvo.dados }, t3 = tela({ resp: d, cache: velho, gh: "403" });
  await espera();
  assert.match(t3.barra(), /cópia de .* \(a consulta nova falhou\)/, "limite do GitHub: vale a cópia do mesmo dia, dita como tal");
});

test("tela: sem a API do GitHub (limite de consultas), os robôs usam a data do arquivo e os testes ficam 'sem informação'", async () => {
  const t = tela({ resp: dadosBons(), gh: "403" });
  await espera();
  const l = t.linhas();
  assert.equal(l[3].nome, "Robô de notícias · ok"); assert.match(l[3].txt, /sem as execuções do GitHub agora: vale a data do arquivo do robô/);
  assert.equal(l[5].nome, "Testes automáticos · sem informação"); assert.match(l[5].txt, /execuções do GitHub indisponíveis: limite de consultas do GitHub/);
  assert.equal(l[5].dot, "?"); assert.equal(l[5].cls, "alerta"); assert.match(t.barra(), /GitHub: indisponível \(limite de consultas do GitHub\)/);
  assert.deepEqual(t.cartoes().map((c) => c.children[1].textContent), ["8", "7", "0", "1"], "ausência de informação não é falha");
});

test("tela: falha, Radar sem registro, robô parado e tabela ilegível aparecem como tal; alertas, cartões e a recuperação", async () => {
  const d = dadosBons(), agora = Date.now(), iso = (ms) => new Date(ms).toISOString();
  d.rotina_log = [{ quando: iso(agora - 3 * H), ok: false, resumo: { garmin_token: { erro: "a Garmin recusou a chave" } } }, { quando: iso(agora - 30 * H), ok: true, resumo: {} }];
  d.radar_coletas = [];
  d["json:rumores.json"] = { coletado: iso(agora - 20 * H), liga: [1] };
  d.newsletter_edicoes = { erro: "permission denied" };
  const t = tela({ resp: d });
  await espera();
  const l = t.linhas();
  assert.equal(l[0].nome, "Rotina das 6h · falhou"); assert.equal(l[0].dot, "✗"); assert.match(l[0].txt, /garmin_token: a Garmin recusou a chave/); assert.match(l[0].txt, /Falha em \d\d\/\d\d,? \d\d:\d\d; o último sucesso foi antes dela/);
  assert.equal(l[1].nome, "Newsletter (edições) · sem informação"); assert.match(l[1].txt, /não consegui ler \(permission denied\)/);
  assert.equal(l[2].nome, "Radar de Preços (coleta) · sem informação"); assert.match(l[2].txt, /só registra quando há o que ler/);
  assert.equal(l[3].nome, "Robô de notícias · atrasado"); assert.match(l[3].txt, /rumores da MLB parado/); assert.equal(l[4].nome, "Robô de vagas · ok");
  assert.deepEqual(t.cartoes().map((c) => c.children[1].textContent), ["8", "4", "2", "2"]);
  const al = t.alertas(); assert.equal(al.length, 4); assert.match(al[0], /Rotina das 6h.*Falhou em .*Onde: Supabase · fonte: rotina_log/); assert.match(al[1], /Robô de notícias.*Onde: GitHub Actions/);
  assert.match(al[1], /Investigar no GitHub/); assert.doesNotMatch(al[0], /Investigar/, "a rotina roda no banco: sem link do GitHub");
  assert.match(al[2] + al[3], /Radar de Preços/);
  const d2 = dadosBons(); d2.rotina_log = [{ quando: iso(Date.now() - 2 * H), ok: true, resumo: {} }, { quando: iso(Date.now() - 26 * H), ok: false, resumo: {} }];
  const r = tela({ resp: d2 }); await espera();
  assert.match(r.linhas()[0].txt, /Falhou em \d\d\/\d\d,? \d\d:\d\d e recuperou em \d\d\/\d\d,? \d\d:\d\d\./); assert.equal(r.linhas()[0].nome, "Rotina das 6h · ok", "falha resolvida não deixa o painel vermelho");
});

test("tela: o filtro dos cartões, a fita de execuções com dica fixa e o rótulo da janela real do GitHub", async () => {
  const d = dadosBons(), agora = Date.now(), iso = (ms) => new Date(ms).toISOString();
  d["json:vagas.json"] = { coletado: iso(agora - 40 * H), vagas: [1] }; d["gh:vagas.yml"] = [];
  const mk = (ms, c) => ({ status: "completed", conclusion: c, event: "schedule", created_at: iso(ms), run_started_at: iso(ms), updated_at: iso(ms + 30e3) });
  d["gh:noticias.yml"] = Array.from({ length: 30 }, (_, i) => mk(agora - (i + 1) * H, i === 4 ? "failure" : "success"));
  const t = tela({ resp: d });
  await espera();
  const l = t.linhas();
  assert.match(l[3].txt, /falhas nas últimas 30 execuções \(desde \d\d\/\d\d,? \d\d:\d\d\): 1/, "30 execuções horárias não cobrem 7 dias: o rótulo diz a janela real");
  assert.match(l[5].txt, /falhas em 7 dias: 0/, "com poucas execuções (todas as da main) vale 7 dias");
  const fita = comClasse(t.p, "monhist"); assert.ok(fita.length >= 2); const f0 = fita.find((x) => x.children.length === 7);
  assert.ok(f0, "o robô de notícias tem 30 execuções: fita de 7"); assert.match(f0.attrs["aria-label"], /^Últimas 7 execuções: /);
  assert.equal(t.dicas.length, fita.reduce((n, x) => n + x.children.length, 0), "cada barra tem a dica (racDica) com data e resultado");
  const [titulo, linha] = t.dicas[0][1](); assert.match(titulo, /\d\d\/\d\d,? \d\d:\d\d/); assert.match(linha, /execução com (sucesso|falha)|em execução/);
  t.cartoes()[2].onclick(); await espera();
  assert.deepEqual(t.linhas().map((x) => x.nome), ["Robô de vagas · atrasado"]); assert.match(t.cartoes()[2].className, /\bon\b/); assert.equal(t.cartoes()[2].attrs["aria-pressed"], "true");
  t.cartoes()[2].onclick(); await espera(); assert.equal(t.linhas().length, 8, "tocar de novo volta a todos");
  t.cartoes()[3].onclick(); await espera(); assert.equal(t.cartoes()[3].children[1].textContent, "0"); assert.match(comClasse(t.p, "monint")[0].textContent, /Nenhum processo nesta categoria/, "categoria vazia diz que está vazia");
});

test("tela (dono): Ocorrências recentes: incidentes de sinais, se já foi avisado por push ou espera o próximo envio, a sequência e a recuperação", async () => {
  const d = dadosBons(), q = (m) => new Date(Date.now() - m * MIN).toISOString();
  d.sinais = [
    { entidade: "inbox", estado: "aberto", severidade: "urgente", fatos: { nome: "Inbox (sincronização)", estado: "falhou", motivo: "autenticacao" }, historico: [{ estado: "atrasado" }, { estado: "falhou" }], detectado_em: q(90), encerrado_em: null, encerramento: null, notificado_em: null },
    { entidade: "rotina", estado: "aberto", severidade: "atencao", fatos: { nome: "Rotina das 6h", estado: "atrasado", motivo: "sem execução há mais de 25 h" }, historico: [{ estado: "atrasado" }], detectado_em: q(300), encerrado_em: null, encerramento: null, notificado_em: q(290) },
    { entidade: "vagas", estado: "fechado", severidade: "atencao", fatos: { nome: "Robô de vagas", estado: "atrasado" }, historico: [{ estado: "atrasado" }, { estado: "recuperou" }], detectado_em: q(1000), encerrado_em: q(800), encerramento: "recuperou", notificado_em: null },
    { entidade: "noticias", estado: "fechado", severidade: "urgente", fatos: { nome: "Robô de notícias", estado: "falhou" }, historico: [{ estado: "falhou" }, { estado: "desligado" }], detectado_em: q(2000), encerrado_em: q(1900), encerramento: "desligado", notificado_em: q(1990) }];
  const t = tela({ resp: d }); await espera();
  const oco = comClasse(t.p, "monocor")[0];
  assert.equal(oco.children[0].textContent, "Ocorrências recentes"); const lis = oco.children[1].children;
  assert.equal(lis.length, 4); assert.deepEqual(lis.map((li) => li.className), ["falha", "atraso", "", ""]);
  assert.deepEqual(lis.map((li) => li.children[0].textContent), ["✗", "⚠", "✓", "✓"]);
  assert.match(lis[0].textContent, /Inbox \(sincronização\) · falhou[\s\S]*Aberta em \d\d\/\d\d,? \d\d:\d\d · ainda aberta[\s\S]*ainda não enviado \(silêncio das 22h às 7h ou limite de 3 por dia\)[\s\S]*autenticacao[\s\S]*Sequência: atrasado → falhou/);
  assert.match(lis[1].textContent, /Rotina das 6h · atrasado[\s\S]*Aviso por push em \d\d\/\d\d,? \d\d:\d\d/); assert.doesNotMatch(lis[1].textContent, /Sequência/, "uma situação só: sem sequência");
  assert.match(lis[2].textContent, /Robô de vagas · resolvida[\s\S]*resolvida em \d\d\/\d\d,? \d\d:\d\d[\s\S]*Sem push: resolvida antes do aviso[\s\S]*Sequência: atrasado → recuperou/);
  assert.match(lis[3].textContent, /\(processo desligado\)/); assert.doesNotMatch(lis[3].textContent, /Sem push/, "esta foi avisada antes de fechar");
  /* sem ocorrência: diz que está vazio; tabela ilegível (migration ainda não aplicada): o bloco some, sem erro na tela */
  const v = tela({ resp: dadosBons() }); await espera(); assert.match(comClasse(v.p, "monocor")[0].textContent, /Nenhuma ocorrência registrada pelo vigia/);
  const e = dadosBons(); e.sinais = { erro: "relation \"public.sinais\" does not exist" }; const x = tela({ resp: e }); await espera();
  assert.equal(comClasse(x.p, "monocor")[0].children.length, 0); assert.equal(x.linhas().length, 8, "o resto do Monitor segue normal");
});

test("tela (casa): sem o Inbox (só do dono): 7 processos e nenhuma leitura do Inbox", async () => {
  const t = tela({ resp: dadosBons(), dono: false });
  await espera();
  assert.deepEqual(t.linhas().map((x) => x.nome), NOMES8.slice(0, 7).map((n) => n + " · ok"));
  assert.ok(!t.ops.some((o) => /inbox|sinais/.test(o.t)), "nem consulta (o Inbox e os sinais são só do dono)");
  assert.equal(comClasse(t.p, "monocor")[0].children.length, 0, "a casa não vê o bloco de ocorrências");
});

test("resumo no Sistema e página #monitor: a mesma coleta (sem ler de novo) e só rótulos reais", async () => {
  const t = tela({ resp: dadosBons() });
  await espera();
  const antes = t.ops.length, r = t.ctx.sisMonitorResumo();
  await espera();
  assert.equal(t.ops.length, antes, "usa a coleta guardada por 60 s");
  assert.equal(r.children[2].textContent, "8 processos: 8 normais, 0 exigem atenção, 0 sem verificação.");
  assert.equal(r.children[3].children[0].attrs.href, "#monitor");
  t.ctx.renderMonitor(); await espera();
  assert.equal(t.raiz.children[0].attrs.href, "#sistema"); assert.ok(comClasse(t.raiz, "monint").length === 1);
  assert.match(t.ctx.sisQuando(Date.parse("2026-11-13T09:00:00Z")), /^13\/11,? 06:00$/, "sempre o horário de Brasília, mesmo com o aparelho em outro fuso");
});

test("ligações: rota #monitor (subpágina de Sistema), seção, resumo no Sistema, sem gravação nem credencial, ES5", () => {
  assert.match(ler("js/rotas.js"), /\{id:"monitor",titulo:"Monitor de integrações",grupo:null,mods:\["sistema"\],abrir:function\(\)\{\$\("#ptitle"\)\.textContent="Monitor de integrações";renderMonitor\(\)\}\}/);
  assert.match(ler("index.html"), /<section id="monitor" hidden><div id="monitor-view" class="stack"><\/div><\/section>/);
  assert.match(SIS, /try\{root\.appendChild\(sisSaude\(\)\)\}catch\(e\)\{logErro\("saúde do RAC",e\)\}\n\s+try\{root\.appendChild\(sisMonitorResumo\(\)\)\}/);
  assert.ok(!/panel\("Robôs de coleta"/.test(SIS), "um lugar só para os robôs");
  assert.ok(!/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(|Authorization|token/i.test(BLOCO), "só leitura, sem credencial");
  assert.ok(!/\bconst |\blet |=>/.test(BLOCO), "ES5 puro");
  assert.ok(/\.monhist i\{/.test(ler("index.html")) && /\.moncards\{/.test(ler("index.html")), "o CSS do painel está no index.html");
});
