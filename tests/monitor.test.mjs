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
function agendamentosReais() {
  const workflows = {};
  for (const f of fs.readdirSync(new URL(".github/workflows/", raiz)).filter((x) => /\.ya?ml$/.test(x)).sort()) {
    const crons = [...ler(".github/workflows/" + f).matchAll(/^\s*-\s*cron:\s*["']([^"']+)["']/gm)].map((m) => m[1].trim());
    if (crons.length) workflows[f] = { arquivo: ".github/workflows/" + f, crons };
  }
  /* pg_cron: na ordem das migrations, sem comentários; unschedule tira, schedule põe (a última vale). Propostas não contam. */
  const jobs = {};
  const sqls = fs.readdirSync(new URL("supabase/", raiz)).filter((x) => /^\d{3}_.*\.sql$/.test(x)).sort();
  for (const f of sqls) {
    const txt = ler("supabase/" + f).split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
    for (const m of txt.matchAll(/cron\.(unschedule|schedule)\(\s*'([^']+)'(?:\s*,\s*'([^']+)')?/g)) {
      if (m[1] === "unschedule") delete jobs[m[2]]; else jobs[m[2]] = { arquivo: "supabase/" + f, crons: [m[3].trim()] };
    }
  }
  return { workflows, jobs };
}
/* o que diverge entre o catálogo do monitor e os agendamentos reais (lista vazia = tudo igual) */
function divergencias(catalogo, real) {
  const d = [], igual = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  for (const [job, r] of Object.entries(real.jobs)) {
    const p = catalogo.find((x) => x.job === job);
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
  assert.deepEqual(Object.keys(real.jobs).sort(), ["rac-newsletter", "rac-rotina", "radar-rotina"]);
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
  assert.deepEqual(Object.keys(ok).sort(), ["area", "arquivo", "atraso_tipico", "crons", "duracao", "erro", "esperada", "estado", "falhas", "motivo", "nome", "onde", "origem", "processo", "proxima_prevista", "registros", "rodando", "rotulo", "ultima_execucao", "ultimo_sucesso"].sort(), "o contrato do Documento 05");
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

function tela({ resp = {}, gh = "ok", cache = null } = {}) {
  const ops = [], buscas = [], guardado = {};
  if (cache) guardado["rac-monitor-gh"] = JSON.stringify(cache);
  const consulta = (t) => { const st = { t, ops: [] }; ops.push(st); const p = new Proxy({}, { get(_, k) {
    if (k === "then") { const r = Promise.resolve(typeof resp[t] === "function" ? resp[t]() : resp[t]).then((x) => (x && x.erro ? { data: null, error: { message: x.erro } } : { data: x || [], error: null })); return r.then.bind(r); }
    return (...a) => { st.ops.push(k); return p; }; } }); return p; };
  const ctx = {
    NUCLEO: N, h, panel: (t, s) => h("div", { class: "panel" }, h("h2", { text: t }), h("p", { class: "sub", text: s })), ext: (u, t, c) => h("a", { class: c, href: u, text: t }),
    SB: { from: consulta, rpc: (n) => consulta("rpc:" + n) }, sbOk: (r) => { if (r.error) throw new Error(r.error.message); return r.data; },
    atuLer: (f) => Promise.resolve().then(f).then((v) => ({ ok: true, v }), (e) => ({ ok: false, erro: e && e.message || String(e) })),
    getJson: (u) => { const x = resp["json:" + u.replace(/\?.*$/, "")]; return x ? Promise.resolve(x) : Promise.reject(new Error("HTTP 404")); },
    fetch: (u, o) => { buscas.push({ u, o }); if (gh !== "ok") return Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) });
      const wf = /workflows\/([^/]+)\/runs/.exec(u); return Promise.resolve({ ok: true, json: () => Promise.resolve(wf ? { workflow_runs: resp["gh:" + wf[1]] || [] } : { workflows: resp["gh:workflows"] || [] }) }); },
    localStorage: { getItem: (k) => guardado[k] ?? null, setItem: (k, v) => { guardado[k] = v; } },
    logErro() {}, Date, JSON, Promise, Object, Array, String, Math, console,
  };
  vm.createContext(ctx);
  vm.runInContext(SISHA + "\n" + BLOCO, ctx, { filename: "sistema.js (monitor)" });
  const p = ctx.sisMonitor();
  const linhas = () => p.children[3].children.map((li) => ({ dot: li.children[0].textContent, cls: li.className, txt: li.children[1].children.map((c) => c.textContent) }));
  return { p, linhas, ops, buscas, guardado };
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
    "json:noticias.json": { coletado: iso(agora - H), noticias: [1, 2] }, "json:tecdados.json": { coletado: iso(agora - H), noticias: [1] },
    "json:rumores.json": { coletado: iso(agora - H), liga: [1] }, "json:newsletter.json": { coletado: iso(agora - H), grupos: [1], fontes: [{ n: "A", ok: true }] },
    "json:vagas.json": { coletado: iso(agora - 5 * H), vagas: [1, 2, 3] },
    "gh:workflows": [{ path: ".github/workflows/noticias.yml", state: "active" }, { path: ".github/workflows/vagas.yml", state: "active" }, { path: ".github/workflows/testes.yml", state: "active" }],
    "gh:noticias.yml": [run(agora - H, 20)], "gh:vagas.yml": [run(agora - 5 * H, 47)], "gh:testes.yml": [run(agora - 2 * 24 * H, 200)],
  };
}

test("tela: os 6 processos agendados aparecem com estado, última execução, último sucesso, falhas, próxima prevista e o agendamento real", async () => {
  const t = tela({ resp: dadosBons() });
  await espera();
  assert.match(t.p.children[2].textContent, /^6 rotinas agendadas: 6 ok\.$/);
  const l = t.linhas();
  assert.deepEqual(l.map((x) => x.txt[0]), ["Rotina das 6h · ok", "Newsletter (edições) · ok", "Radar de Preços (coleta) · ok", "Robô de notícias · ok", "Robô de vagas · ok", "Testes automáticos · ok"]);
  for (const x of l) {
    assert.equal(x.dot, "✓");
    const tudo = x.txt.join("\n");
    assert.match(tudo, /Último sucesso: \d\d\/\d\d,? \d\d:\d\d · falhas em 7 dias: (0|não registradas)/);
    assert.match(tudo, /Próxima prevista: (a partir de )?\d\d\/\d\d,? \d\d:\d\d/);
    assert.match(tudo, /Agendamento: .+ \(UTC\) · (supabase|\.github)\//);
  }
  const rot = l[0].txt.join("\n");
  assert.match(rot, /Agendamento: 0 9 \* \* \* \(UTC\) · supabase\/008_sistema\.sql/);
  assert.match(rot, /2 dias da Garmin, 1 avisos/); assert.match(rot, /Relógio: último dado há 3 h/);
  assert.match(l[4].txt.join("\n"), /duração 47\u00a0s · vagas: 3 itens/);
  assert.match(l[3].txt.join("\n"), /Agendamento: 15 \*\/3 \* \* \* e 40 \* \* \* \* \(UTC\) · \.github\/workflows\/noticias\.yml/);
  assert.match(l[1].txt.join("\n"), /Última edição gravada: .*edição da manhã/);
  assert.match(l[1].txt.join("\n"), /falhas em 7 dias: não registradas/);
});

test("tela: só lê (nenhuma gravação no banco), a API do GitHub é a pública sem login e fica guardada 15 min", async () => {
  const d = dadosBons(), t = tela({ resp: d });
  await espera();
  const tabelas = t.ops.map((o) => o.t).sort();
  assert.deepEqual(tabelas, ["garmin_dia", "newsletter_edicoes", "radar_coletas", "rotina_log"]);
  for (const o of t.ops) for (const k of o.ops) assert.ok(["select", "order", "limit", "eq"].includes(k), o.t + ": " + k);
  assert.equal(t.buscas.length, 4, "workflows + 3 listas de execuções");
  assert.equal(t.buscas.filter((b) => /\/runs\?branch=main&per_page=30$/.test(b.u)).length, 3, "só as execuções da main: um PR com teste falhando não vira falha do processo");
  for (const b of t.buscas) { assert.match(b.u, /^https:\/\/api\.github\.com\/repos\/raynercarvalho1\/rac\/actions\/workflows/); assert.equal(b.o, undefined, "sem cabeçalho, sem token"); }
  const salvo = JSON.parse(t.guardado["rac-monitor-gh"]);
  const t2 = tela({ resp: d, cache: salvo });
  await espera();
  assert.equal(t2.buscas.length, 0, "dentro de 15 min usa a cópia deste aparelho");
});

test("tela: sem a API do GitHub (limite de consultas), os robôs usam a data do próprio arquivo e os testes ficam 'sem informação'", async () => {
  const t = tela({ resp: dadosBons(), gh: "403" });
  await espera();
  const l = t.linhas();
  assert.equal(l[3].txt[0], "Robô de notícias · ok");
  assert.match(l[3].txt.join("\n"), /sem as execuções do GitHub agora: vale a data do arquivo do robô/);
  assert.equal(l[5].txt[0], "Testes automáticos · sem informação");
  assert.match(l[5].txt.join("\n"), /execuções do GitHub indisponíveis: limite de consultas do GitHub/);
  assert.equal(l[5].dot, "?"); assert.equal(l[5].cls, "alerta");
});

test("tela: rotina com falha, Radar sem registro, robô parado e tabela ilegível aparecem como tal, sem quebrar as outras linhas", async () => {
  const d = dadosBons(), agora = Date.now(), iso = (ms) => new Date(ms).toISOString();
  d.rotina_log = [{ quando: iso(agora - 3 * H), ok: false, resumo: { garmin_token: { erro: "a Garmin recusou a chave" } } }];
  d.radar_coletas = [];
  d["json:rumores.json"] = { coletado: iso(agora - 20 * H), liga: [1] };
  d.newsletter_edicoes = { erro: "permission denied" };
  const t = tela({ resp: d });
  await espera();
  const l = t.linhas();
  assert.equal(l[0].txt[0], "Rotina das 6h · falhou"); assert.equal(l[0].dot, "✗"); assert.match(l[0].txt[1], /garmin_token: a Garmin recusou a chave/);
  assert.equal(l[1].txt[0], "Newsletter (edições) · sem informação"); assert.match(l[1].txt[1], /não consegui ler \(permission denied\)/);
  assert.equal(l[2].txt[0], "Radar de Preços (coleta) · sem informação"); assert.match(l[2].txt[1], /só registra quando há o que ler/);
  assert.equal(l[3].txt[0], "Robô de notícias · atrasado"); assert.match(l[3].txt[1], /rumores da MLB parado/);
  assert.equal(l[4].txt[0], "Robô de vagas · ok");
  assert.match(t.p.children[2].textContent, /6 rotinas agendadas: 1 falhou, 1 atrasado, 2 sem informação, 2 ok\./);
});

test("ligações: o Sistema mostra o monitor logo depois da Saúde do RAC; o painel antigo dos robôs saiu (sem duplicar); ES5", () => {
  assert.match(SIS, /try\{root\.appendChild\(sisSaude\(\)\)\}catch\(e\)\{logErro\("saúde do RAC",e\)\}\n\s+try\{root\.appendChild\(sisMonitor\(\)\)\}/);
  assert.ok(!/panel\("Robôs de coleta"/.test(SIS), "um lugar só para os robôs");
  assert.ok(!/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(|Authorization|token/i.test(BLOCO), "só leitura, sem credencial");
  assert.ok(!/\bconst |\blet |=>/.test(BLOCO), "ES5 puro");
});
