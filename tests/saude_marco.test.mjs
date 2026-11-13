// DS-4.2 · Marco de propriedade do relógio Garmin (docs/planejamento/09-auditoria-saude-garmin.md, seção 16).
// Regra: data do evento anterior a 01/01/2026 = legado; de 01/01/2026 em diante, inclusive = meu. Nada é apagado nem alterado: a classificação
// só separa na leitura. Os dados abaixo são inventados.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");

/* ---------- o núcleo ---------- */
test("marco: 01/01/2026, inclusive, com origem registrada", () => {
  assert.equal(N.SAU_MARCO.data, "2026-01-01");
  assert.equal(N.SAU_MARCO.inclusivo, true);
  assert.equal(N.SAU_MARCO.regra, "data_do_evento");
  assert.match(N.SAU_MARCO.origem, /dono/);
});

test("marco: as bordas (31/12 legado, 01/01 meu, 02/01 meu) valem para dias e para treinos", () => {
  const dias = ["2025-11-01", "2025-12-31", "2026-01-01", "2026-01-02"].map((data) => ({ data, dados: {} }));
  const ativs = ["2025-12-31T23:50:00", "2026-01-01T00:05:00", "2026-01-01T07:00:00"].map((inicio, i) => ({ id: i + 1, inicio, tipo: "running", dados: {} }));
  const c = N.sauClassificar(dias, ativs);
  assert.deepEqual(c.meus.dias.map((d) => d.data), ["2026-01-01", "2026-01-02"]);
  assert.deepEqual(c.legado.dias.map((d) => d.data), ["2025-11-01", "2025-12-31"]);
  assert.deepEqual(c.legado.ativs.map((a) => a.id), [1], "treino iniciado em 31/12 às 23:50 é legado, mesmo que termine em 01/01");
  assert.deepEqual(c.meus.ativs.map((a) => a.id), [2, 3], "o dia 01/01 pertence ao dono (sem revisão automática)");
  assert.deepEqual(c.contagem, { meus: { dias: 2, ativs: 2 }, legado: { dias: 2, ativs: 1 } });
});

test("marco: dias e treinos são classificados cada um pela própria data (um nunca decide o outro)", () => {
  const c = N.sauClassificar([{ data: "2025-12-30", dados: {} }], [{ id: 9, inicio: "2026-03-01T08:00:00", dados: {} }]);
  assert.equal(c.legado.dias.length, 1); assert.equal(c.meus.ativs.length, 1);
});

test("marco: vale a data do evento; a data de recebimento (atualizado) nunca entra", () => {
  const velho = { data: "2025-12-15", dados: {}, atualizado: "2026-11-10T09:00:00Z" };    /* recebido hoje, mas é de 2025 */
  const novo = { data: "2026-02-10", dados: {}, atualizado: "2025-01-01T00:00:00Z" };     /* recebimento "antes" do marco: irrelevante */
  const c = N.sauClassificar([velho, novo], []);
  assert.deepEqual(c.legado.dias, [velho]); assert.deepEqual(c.meus.dias, [novo]);
});

test("marco: não altera nem copia as linhas (as mesmas, na mesma ordem) e aceita entrada congelada", () => {
  const d1 = Object.freeze({ data: "2026-05-01", dados: Object.freeze({ passos: 1 }) }), d0 = Object.freeze({ data: "2025-05-01", dados: Object.freeze({}) });
  const a1 = Object.freeze({ id: 1, inicio: "2026-05-01T07:00:00", dados: Object.freeze({}) });
  const dias = Object.freeze([d0, d1]), ativs = Object.freeze([a1]);
  const antes = JSON.stringify([dias, ativs]);
  const c = N.sauClassificar(dias, ativs);
  assert.equal(c.meus.dias[0], d1); assert.equal(c.legado.dias[0], d0); assert.equal(c.meus.ativs[0], a1);
  assert.equal(JSON.stringify([dias, ativs]), antes);
});

test("marco: entradas vazias, nulas e sem data não quebram nem viram dado seu", () => {
  assert.deepEqual(N.sauClassificar([], []).contagem, { meus: { dias: 0, ativs: 0 }, legado: { dias: 0, ativs: 0 } });
  assert.deepEqual(N.sauClassificar(null, undefined).contagem.meus, { dias: 0, ativs: 0 });
  const c = N.sauClassificar([{ dados: {} }, { data: "lixo" }, null], [{ id: 1 }, { inicio: "" }]);
  assert.deepEqual(c.semData, { dias: 3, ativs: 2 }); assert.equal(c.meus.dias.length + c.legado.dias.length, 0);
  assert.equal(N.sauMeu("2026-01-01"), true); assert.equal(N.sauMeu("2025-12-31"), false); assert.equal(N.sauMeu(undefined), null);
});

/* ---------- guarda permanente: nenhuma exclusão, nenhum corte antigo ---------- */
const ARQ_JS = fs.readdirSync(new URL("../js/", import.meta.url)).filter((f) => f.endsWith(".js")).map((f) => "js/" + f).concat(["nucleo.js", "mercado.js"]);
const FUNCAO = "supabase/functions/garmin/index.ts";

test("guarda: nenhum código apaga linhas de garmin_dia ou garmin_ativ (site e função)", () => {
  for (const f of ARQ_JS.concat([FUNCAO])) {
    const t = ler(f);
    assert.ok(!/from\(\s*["']garmin_(dia|ativ)["']\s*\)\s*\.delete\s*\(/.test(t), `${f} apaga linhas do relógio`);
    assert.ok(!/garmin_(dia|ativ)["'`][^;\n]{0,80}\.delete\s*\(/.test(t), `${f} apaga linhas do relógio (outra forma)`);
    assert.ok(!/delete\s+from\s+(public\.)?garmin_(dia|ativ)/i.test(t), `${f} tem DELETE em tabela do relógio`);
  }
});

test("guarda: o corte antigo (01/11/2025, GARMIN_DESDE) não existe mais", () => {
  for (const f of ARQ_JS.concat([FUNCAO])) {
    const t = ler(f);
    assert.ok(!/GARMIN_DESDE/.test(t), `${f} ainda usa GARMIN_DESDE`);
    assert.ok(!/2025-11-01/.test(t) || f === "nucleo.js", `${f} ainda tem o corte de 01/11/2025`);
  }
});

test("leitores: todo ponto que lê o relógio passa pela classificação do núcleo", () => {
  /* cada arquivo que lê garmin_dia ou garmin_ativ deve classificar (a função e o backup guardam tudo, de propósito) */
  for (const f of ["js/saude.js", "js/hoje.js", "js/sistema.js", "js/carreira.js"]) assert.match(ler(f), /NUCLEO\.sauClassificar/, `${f} lê o relógio sem classificar`);
  for (const f of ["js/painel.js", "js/resumo.js"]) assert.match(ler(f), /NUCLEO\.SAU_MARCO/, `${f} não usa o marco`);
  /* quem lê as tabelas diretamente fica na lista conhecida: um leitor novo precisa entrar aqui e passar pela classificação */
  const leem = ARQ_JS.filter((f) => f.startsWith("js/") && /["']garmin_(dia|ativ)["']/.test(ler(f))).sort();
  assert.deepEqual(leem, ["js/carreira.js", "js/hoje.js", "js/saude.js", "js/sistema.js"], "leitor novo do relógio: classifique com NUCLEO.sauClassificar");
});

/* ---------- a função: sincronização sem corte e sem exclusão, recuperação sem sobrescrever ---------- */
const fonte = ler(FUNCAO);
const ini = fonte.indexOf("const BASE ="), fim = fonte.indexOf("/* ---------- notificações push");
assert.ok(ini > 0 && fim > ini, "trecho da sincronização encontrado");
const trecho = fonte.slice(ini, fim).replace("type Sb = ReturnType<typeof createClient>;", "type Sb = any;");
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "racsinc-")), "sinc.mts");
fs.writeFileSync(tmp, trecho + "\nexport { sincAtiv, sincDias, ativ };\n");
const { sincAtiv, sincDias } = await import(pathToFileURL(tmp).href);

/* banco de mentira: guarda as linhas e REGISTRA todas as chamadas (inclusive delete) */
function bancoFalso(inicial = {}) {
  const tab = { garmin_dia: [...(inicial.garmin_dia || [])], garmin_ativ: [...(inicial.garmin_ativ || [])] }, chamadas = [];
  const from = (t) => {
    const f = { op: "select", cols: "", filtros: [] };
    const q = {
      select(c) { f.cols = c; return q; }, in(c, v) { f.filtros.push([c, "in", v]); return q; }, eq() { return q; }, order() { return q; }, limit() { return q; },
      gte(c, v) { f.filtros.push([c, "gte", v]); return q; }, lte(c, v) { f.filtros.push([c, "lte", v]); return q; },
      delete() { f.op = "delete"; chamadas.push({ t, op: "delete" }); return q; },
      upsert(linhas, opt) { f.op = "upsert"; f.linhas = linhas; f.opt = opt; return q; },
      then(ok, erro) {
        let r;
        if (f.op === "upsert") {
          chamadas.push({ t, op: "upsert", n: f.linhas.length, ignora: !!(f.opt && f.opt.ignoreDuplicates) });
          const chave = t === "garmin_dia" ? "data" : "id";
          for (const l of f.linhas) { const i = tab[t].findIndex((x) => x[chave] === l[chave]); if (i < 0) tab[t].push(l); else if (!(f.opt && f.opt.ignoreDuplicates)) tab[t][i] = l; }
          r = { data: null, error: null };
        } else if (f.op === "delete") r = { data: null, error: null };
        else {
          let d = tab[t];
          for (const [c, o, v] of f.filtros) d = d.filter((x) => (o === "in" ? v.includes(x[c]) : o === "gte" ? x[c] >= v : x[c] <= v));
          r = { data: d.map((x) => ({ [t === "garmin_dia" ? "data" : "id"]: x[t === "garmin_dia" ? "data" : "id"] })), error: null };
        }
        return Promise.resolve(r).then(ok, erro);
      },
    };
    return q;
  };
  return { sb: { from }, tab, chamadas };
}

/* a Garmin de mentira: lista de atividades e resumos de dia, sono e VFC */
function garminFalsa({ ativs = [], dias = [] }) {
  globalThis.fetch = async (url) => {
    const u = String(url), ok = (j) => ({ ok: true, status: 200, text: async () => JSON.stringify(j) });
    if (u.includes("/activitylist-service/")) { const s = +/start=(\d+)/.exec(u)[1]; return ok(ativs.slice(s, s + 100)); }
    if (u.includes("/usersummary-service/")) return ok({ data: dias.map((d) => ({ calendarDate: d, movement: { steps: { value: 5000 } } })) });
    if (u.includes("/sleep-service/") || u.includes("/hrv-service/")) return ok(u.includes("/sleep-service/") ? [] : { hrvSummaries: [] });
    return { ok: false, status: 404, text: async () => "" };
  };
}
const A = (id, dia) => ({ activityId: id, startTimeLocal: dia + " 07:00:00", activityType: { typeKey: "running" }, activityName: "x", distance: 5000, duration: 1800 });

test("função: guarda treinos de qualquer data (sem o corte de 01/11/2025) e nunca apaga", async () => {
  const { sb, tab, chamadas } = bancoFalso();
  garminFalsa({ ativs: [A(1, "2024-06-01"), A(2, "2025-10-31"), A(3, "2025-12-31"), A(4, "2026-01-01"), A(5, "2026-06-01")] });
  const r = await sincAtiv(sb, "tok", "u1", {});
  assert.equal(r.salvas, 5, "todos os cinco, inclusive os anteriores a 01/11/2025");
  assert.deepEqual(tab.garmin_ativ.map((x) => x.id).sort(), [1, 2, 3, 4, 5]);
  assert.ok(!chamadas.some((c) => c.op === "delete"), "nenhuma exclusão");
});

test("função: a rotina (início 0, sem 'completo') para na página já conhecida e continua sem apagar nada", async () => {
  const { sb, chamadas } = bancoFalso({ garmin_ativ: Array.from({ length: 100 }, (_, i) => ({ id: i + 1 })) });
  garminFalsa({ ativs: Array.from({ length: 250 }, (_, i) => A(i + 1, "2026-02-01")) });
  const r = await sincAtiv(sb, "tok", "u1", {});
  assert.equal(r.mais, false, "primeira página toda conhecida: encerra");
  assert.ok(!chamadas.some((c) => c.op === "delete"));
});

test("função: apenasContar não grava nada e conta por mês o que é novo", async () => {
  const { sb, tab, chamadas } = bancoFalso({ garmin_ativ: [{ id: 2 }] });
  garminFalsa({ ativs: [A(1, "2025-09-10"), A(2, "2025-09-20"), A(3, "2025-10-05")] });
  const r = await sincAtiv(sb, "tok", "u1", { apenasContar: true, completo: true });
  assert.equal(r.salvas, 0); assert.equal(tab.garmin_ativ.length, 1);
  assert.deepEqual(r.porMes, { "2025-09": { garmin: 2, novos: 1 }, "2025-10": { garmin: 1, novos: 1 } });
  assert.ok(!chamadas.some((c) => c.op === "upsert" || c.op === "delete"), "só leitura");
});

test("função: somenteNovos insere o que falta e NUNCA sobrescreve uma linha existente", async () => {
  const existente = { id: 2, inicio: "2025-09-20T07:00:00", tipo: "running", dados: { nome: "original" } };
  const { sb, tab, chamadas } = bancoFalso({ garmin_ativ: [existente] });
  garminFalsa({ ativs: [A(1, "2025-09-10"), A(2, "2025-09-20"), A(3, "2025-10-05")] });
  const r = await sincAtiv(sb, "tok", "u1", { somenteNovos: true, completo: true });
  assert.equal(r.salvas, 2, "só os dois novos");
  assert.deepEqual(tab.garmin_ativ.find((x) => x.id === 2), existente, "a linha que já existia ficou idêntica");
  assert.ok(chamadas.filter((c) => c.op === "upsert").every((c) => c.ignora), "duplicados ignorados no banco também");
  const again = await sincAtiv(sb, "tok", "u1", { somenteNovos: true, completo: true });
  assert.equal(again.salvas, 0, "idempotente: rodar de novo não grava nada");
  assert.equal(tab.garmin_ativ.length, 3);
});

test("função: dias de qualquer data são gravados (sem corte) e a recuperação por janela não sobrescreve", async () => {
  const { sb, tab, chamadas } = bancoFalso({ garmin_dia: [{ data: "2025-10-02", dados: { passos: 111 } }] });
  garminFalsa({ dias: ["2025-10-01", "2025-10-02", "2025-10-03"] });
  const r = await sincDias(sb, "tok", "u1", { desde: "2025-10-01", ate: "2025-10-28", somenteNovos: true }, "2026-11-13", 1);
  assert.equal(r.salvos, 2, "só 01 e 03; o dia 02 já existia");
  assert.deepEqual(tab.garmin_dia.find((x) => x.data === "2025-10-02").dados, { passos: 111 }, "dia existente intacto");
  assert.deepEqual(r.porMes, { "2025-10": { garmin: 3, novos: 2 } });
  assert.equal(r.mais, false, "a janela 'ate' encerra");
  assert.ok(!chamadas.some((c) => c.op === "delete"));
  const m = await sincDias(sb, "tok", "u1", { desde: "2025-10-01", ate: "2025-10-28", apenasContar: true }, "2026-11-13", 1);
  assert.equal(m.salvos, 0); assert.deepEqual(m.porMes, { "2025-10": { garmin: 3, novos: 0 } });
});

test("função: a sincronização normal (sem modos) continua gravando por cima, como sempre, e sem exclusão", async () => {
  const { sb, tab, chamadas } = bancoFalso({ garmin_dia: [{ data: "2026-11-12", dados: { passos: 1 } }] });
  garminFalsa({ dias: ["2026-11-12", "2026-11-13"] });
  const r = await sincDias(sb, "tok", "u1", {}, "2026-11-13", 1);
  assert.equal(r.salvos, 2);
  assert.equal(tab.garmin_dia.find((x) => x.data === "2026-11-12").dados.passos, 5000);
  assert.ok(chamadas.filter((c) => c.op === "upsert").every((c) => !c.ignora));
  assert.ok(!chamadas.some((c) => c.op === "delete"));
});

test("recuperação na tela: só começa se a função respondeu no formato novo (a antiga gravaria por cima) e nunca pede o modo que sobrescreve", () => {
  const s = ler("js/saude.js"), r = s.slice(s.indexOf("function saudeRecuperar"), s.indexOf("function saudeSincronizar"));
  assert.match(r, /function versao\(\)/); assert.match(r, /!d\.porMes/); assert.match(r, /return versao\(\)\.then/);
  assert.match(r, /apenasContar:true/); assert.match(r, /somenteNovos:true/);
  assert.equal((r.match(/Object\.assign\(\{tipo:"(dias|ativ)"/g) || []).length, 2, "as duas chamadas do histórico (dias e treinos) levam os flags");
  /* a sincronização comum do site não mudou: sem flags, como sempre */
  assert.match(s, /chamar\(\{tipo:"dias"\}\)/);
});
