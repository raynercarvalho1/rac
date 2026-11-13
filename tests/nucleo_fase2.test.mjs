// Regras das telas no núcleo (Fase 2 · A5, docs/planejamento/02-auditoria-arquitetural.md, P-08): saudeInsights (Saúde), famMeds (remédios
// da Família) e a escolha dos itens da Agenda viraram funções puras do nucleo.js (NUCLEO.saudeInsights, famMeds, agendaItens), e a
// normalização do MBA também (NUCLEO.mbaAulasDe, mbaAvalsDe, mbaFinDe, usada pela fonte do MBA na A4). Este teste prova:
//  · que são as MESMAS regras: o código de antes (tests/fixtures/fase2/regras-antes.js) e o de agora rodam com os mesmos dados, em muitos
//    casos sorteados, no fuso de Brasília e em UTC, e dão o mesmo resultado;
//  · casos conhecidos, com o resultado escrito à mão;
//  · que as telas usam o núcleo e que o núcleo não toca em tela, banco nem relógio.
process.env.TZ = "America/Sao_Paulo";
import { test } from "node:test";
import assert from "node:assert/strict";
import { N, ler, antes, agora, js, sorteio, mbaPessoal, agendaDados } from "./_fontes_ambiente.mjs";

const HOJE = "2026-11-13";
const iso = (d) => d.toISOString().slice(0, 10);
const somaDias = (base, n) => N.somaDiasISO(base, n);

/* ---------- Saúde ---------- */
function saudeDados(semente, { comHumor = true, dias = 150 } = {}) {
  const r = sorteio(semente), D = [], A = [];
  for (let i = dias; i >= 0; i--) {
    const data = somaDias(HOJE, -i), x = {};
    if (r() < 0.9) x.vfc = { noite: Math.round(30 + r() * 40) };
    if (r() < 0.9) { const h = 21 + Math.floor(r() * 4), m = Math.floor(r() * 60); x.sono = { nota: Math.round(40 + r() * 55), total: Math.round((5 + r() * 4) * 3600), inicio: String(h % 24).padStart(2, "0") + ":" + String(m).padStart(2, "0") }; }
    if (r() < 0.85) x.estresse = Math.round(15 + r() * 50);
    if (r() < 0.9) x.passos = Math.round(2000 + r() * 14000);
    if (comHumor && r() < 0.5) x.humor = 1 + Math.floor(r() * 5);
    D.push({ data, dados: x });
    if (r() < 0.45) A.push({ inicio: data + "T07:00:00", tipo: "corrida", dados: r() < 0.5 ? { carga: Math.round(r() * 300) } : { duracao: Math.round(r() * 5400) } });
  }
  return { dias: D, ativs: A };
}
test("Saúde: NUCLEO.saudeInsights dá exatamente as mesmas frases de antes (60 cenários sorteados, dono e casa, Brasília e UTC)", () => {
  let comFrases = 0;
  for (const tz of ["America/Sao_Paulo", "UTC"]) {
    process.env.TZ = tz;
    for (let s = 1; s <= 30; s++) for (const dono of [true, false]) {
      const d = saudeDados(s, { comHumor: s % 3 !== 0, dias: s % 5 === 0 ? 20 : 150 }), a = antes({ hoje: HOJE, dono });
      const velho = js(a.ctx.saudeInsights(d.dias, d.ativs)), novo = N.saudeInsights(d.dias, d.ativs, HOJE, dono);
      assert.deepEqual(novo, velho, `semente ${s} ${dono ? "dono" : "casa"} ${tz}`); if (novo.length > 1) comFrases++;
    }
  }
  process.env.TZ = "America/Sao_Paulo";
  assert.ok(comFrases > 20, "os cenários geram frases de verdade, não só listas vazias (" + comFrases + ")");
});
test("Saúde: casos conhecidos (treino forte derruba a VFC; convite do humor só para o dono; menos de 8 dias de humor)", () => {
  const dias = [], ativs = [];
  for (let i = 40; i >= 0; i--) { const data = somaDias(HOJE, -i), forte = i % 2 === 0; dias.push({ data, dados: { vfc: { noite: forte ? 60 : 40 } } }); if (forte) ativs.push({ inicio: somaDias(data, -1) + "T07:00:00", dados: { carga: 200 } }); }
  const f = N.saudeInsights(dias, ativs, HOJE, true);
  assert.match(f[0], /^Na noite depois de um treino forte, a sua variabilidade cardíaca fica em média 20 ms mais alta do que depois de um dia sem treino \(60 × 40 ms\)\.$/);
  assert.match(f.at(-1), /^Anote o humor por mais 8 dias/); assert.ok(!N.saudeInsights(dias, ativs, HOJE, false).some((t) => /Anote o humor/.test(t)), "a casa não recebe o convite");
  assert.deepEqual(N.saudeInsights([], [], HOJE, false), []);
});

/* ---------- Família: remédios ---------- */
test("Família: NUCLEO.famMeds igual ao de antes (início, fim, uso contínuo, em uso hoje, ordem) e casos conhecidos", () => {
  const r = sorteio(7), regs = [];
  for (let i = 0; i < 40; i++) {
    const data = somaDias(HOJE, -Math.floor(r() * 200)), meds = [];
    for (let k = 0; k < Math.floor(r() * 3); k++) meds.push({ nome: "Remédio " + i + k, dose: "1", ...(r() < 0.3 ? { continuo: true } : { dias: Math.floor(r() * 30) }), ...(r() < 0.4 ? { inicio: somaDias(data, Math.floor(r() * 10)) } : {}) });
    regs.push({ id: "r" + i, tipo: "tratamento", data, dados: r() < 0.2 ? null : { meds } });
  }
  for (const tz of ["America/Sao_Paulo", "UTC"]) {
    process.env.TZ = tz;
    for (const hoje of [HOJE, "2026-01-01", "2026-03-01", "2026-02-28"]) assert.deepEqual(N.famMeds(regs, hoje), js(antes({ hoje }).ctx.famMeds(js(regs))), hoje + " " + tz);
  }
  process.env.TZ = "America/Sao_Paulo";
  const um = N.famMeds([{ data: "2026-11-10", dados: { meds: [{ nome: "Amoxicilina", dias: 7 }, { nome: "Vitamina D", continuo: true, inicio: "2026-01-01" }] } }], HOJE);
  assert.deepEqual(um.map((x) => [x.m.nome, x.ini, x.fim, x.ativo]), [["Amoxicilina", "2026-11-10", "2026-11-16", true], ["Vitamina D", "2026-01-01", null, true]]);
  assert.equal(N.famMeds([{ data: "2026-10-01", dados: { meds: [{ nome: "X", dias: 3 }] } }], HOJE)[0].ativo, false, "terminou em 03/10");
});

/* ---------- MBA ---------- */
test("MBA: NUCLEO.mbaAulasDe, mbaAvalsDe e mbaFinDe iguais às funções de antes (20 contas sorteadas e a conta vazia)", () => {
  for (let s = 1; s <= 20; s++) {
    const p = mbaPessoal(sorteio(100 + s)), a = antes({ hoje: HOJE, pessoal: p }).ctx;
    assert.deepEqual(N.mbaAulasDe(p.mba, p.mbaLinks), js(a.mbaAulas()), "aulas " + s);
    assert.deepEqual(N.mbaAvalsDe(p.mba, p.mbaFeito, HOJE), js(a.mbaAvals()), "avaliações " + s);
    assert.deepEqual(js(N.mbaFinDe(p.mba, p.mbaFeito, HOJE)), js(a.mbaFin()), "financeiro " + s);
  }
  const vazio = antes({ hoje: HOJE, pessoal: {} }).ctx;
  assert.deepEqual([N.mbaAulasDe(undefined, undefined), N.mbaAvalsDe(undefined, undefined, HOJE), N.mbaFinDe(undefined, undefined, HOJE)], [js(vazio.mbaAulas()), js(vazio.mbaAvals()), null]);
  const f = N.mbaFinDe({ financeiro: { parcelas: [{ k: "1", n: "P1", venc: "2026-10-10", v: 100 }, { k: "2", n: "P2", venc: "2026-12-10", v: 100 }] } }, { "pg:1": "2026-10-09" }, HOJE);
  assert.deepEqual([f.pagas, f.falta, f.prox.n, f.atrasadas.length], [1, 100, "P2", 0]);
});

/* ---------- Agenda ---------- */
test("Agenda: a leitura de agora (fonte da Agenda + NUCLEO.agendaItens) dá os mesmos itens, falhas e estado de antes, em 160 cenários", async () => {
  const falhasReg = [undefined, { data: null, error: { message: "sem rede" } }, { rejeita: "timeout do banco" }, { data: [], error: null }];
  const backups = [undefined, { data: [], error: null }, { data: null, error: { message: "bucket fora do ar" } }, { rejeita: "sem rede" }, { data: [{ name: "2026-10-01.zip" }], error: null }];
  let n = 0, itens = 0;
  for (const tz of ["America/Sao_Paulo", "UTC"]) {
    process.env.TZ = tz;
    for (let s = 1; s <= 8; s++) for (const dono of [true, false]) for (const [k, registros] of falhasReg.entries()) {
      const d = agendaDados(s, { dono, registros, backup: backups[(s + k) % backups.length] });
      const velho = js(await antes(d).ctx.agendaColetarLeitura()), b = agora(d), novo = js(await b.ctx.agendaColetarLeitura());
      assert.deepEqual(novo, velho, `semente ${s} ${dono ? "dono" : "casa"} registros#${k} ${tz}`); n++; itens += novo.eventos.length;
      if (!dono) assert.deepEqual([b.lidas.registros, b.lidas.backups], [0, 0], "a casa não lê registros nem backups (como antes)");
    }
  }
  process.env.TZ = "America/Sao_Paulo";
  assert.ok(n >= 128 && itens > 1000, `${n} cenários, ${itens} itens comparados`);
});
test("Agenda: NUCLEO.agendaItens, casos conhecidos (só o registro mais novo vale; IPVA de novembro; follow-up; backup parado; casa sem MBA)", () => {
  const base = { hoje: HOJE, dono: true, fam: { civic: { n: "Civic", veic: true }, c3: { n: "C3 (antigo)", veic: true }, eddie: { n: "Eddie" } }, ico: { civic: "🚗", eddie: "🐶" }, tipoInfo: (t) => [t, t === "revisao" ? "Revisão" : "Outro"] };
  const regs = [{ quem: "civic", tipo: "revisao", data: "2026-11-01", titulo: "Revisão feita", proxima: null }, { quem: "civic", tipo: "revisao", data: "2026-06-01", titulo: "Revisão antiga", proxima: "2026-11-20" },
    { quem: "eddie", tipo: "vacina", data: "2026-10-01", titulo: "V10", proxima: "2026-11-01" }];
  const l = N.agendaItens({ ...base, regs, ultimoBackup: HOJE, backup: { lido: true, ultimo: "2026-11-01" }, candidaturas: [{ id: "c1", t: "Analista", coluna: "candidatei", datas: { candidatei: "2026-11-07" } }] });
  assert.deepEqual(l.map((e) => [e.data, e.t, e.sub]), [
    ["2026-11-01", "V10", "Eddie · Outro · estava previsto para 01/11/2026"],
    ["2026-11-12", "Analista", "candidatura de 07/11/2026"],
    ["2026-11-13", "O backup automático de domingo não rodou", "o último é de 01/11/2026"],
    ["2027-01-09", "IPVA 2027", "Civic · vence em janeiro conforme o final da placa · veja a data na Sefaz-SP"]]);
  assert.ok(!l.some((e) => /Revisão antiga/.test(e.t)), "o registro mais novo (sem próxima) substitui o aviso do anterior"); assert.equal(l[0].ico, "🐶");
  const casa = N.agendaItens({ ...base, dono: false, regs: [], aulas: [{ data: HOJE, t: "Aula" }], lembretes: [{ data: HOJE, t: "x" }], backup: { lido: true } });
  assert.deepEqual(casa.map((e) => e.t), ["IPVA 2027"], "a casa não recebe MBA, lembretes, candidaturas nem avisos de backup (como antes)");
  assert.deepEqual(N.agendaItens({ ...base, dono: true, regs: [], hoje: "2026-07-01", ultimoBackup: "2026-06-30" }), [], "fora de novembro a março não há IPVA");
});

/* ---------- as telas usam o núcleo; o núcleo não toca em tela, banco nem relógio ---------- */
test("as telas chamam o núcleo (sem cópia da regra) e as funções novas do núcleo são puras", () => {
  assert.match(ler("js/saude-hub.js"), /var ins=NUCLEO\.saudeInsights\(C\.dias,C\.ativs,C\.hoje,isOwner\(\)\);/); assert.ok(!/function saudeInsights\(/.test(ler("js/saude.js")) && !/function saudeInsights\(/.test(ler("js/saude-hub.js")));   /* DS-4.3: a tela é o hub */
  assert.match(ler("js/familia.js"), /function famMeds\(regs\)\{return NUCLEO\.famMeds\(regs,hojeISO\(\)\)\}/);
  const mba = ler("js/mba.js"); for (const [f, n] of [["mbaAulas", "mbaAulasDe"], ["mbaAvals", "mbaAvalsDe"], ["mbaFin", "mbaFinDe"]]) assert.match(mba, new RegExp(`function ${f}\\(\\)\\{return NUCLEO\\.${n}\\(`));
  assert.match(ler("js/fonte-agenda.js"), /NUCLEO\.agendaItens\(\{/); assert.ok(!/function agendaLer\(|visto\[k\+"p"\]|dIpva/.test(ler("js/sistema.js")), "a escolha dos itens saiu da tela do Sistema");
  const nuc = ler("nucleo.js"), i = nuc.indexOf("  /* ===== Fase 2 · A5"), j = nuc.indexOf("  /* ===== Fase 2 · A4"), trecho = nuc.slice(i, j > i ? j : nuc.indexOf("  raiz.RACnucleo={"));
  assert.ok(i > 0 && trecho.length > 3000);
  assert.ok(!/document\.|window\.|localStorage|SB\.|fetch\(|hojeISO\(|isOwner\(|PESSOAL|Date\.now\(\)|new Date\(\)/.test(trecho.replace(/\/\*[\s\S]*?\*\//g, "")), "sem tela, banco, conta ou relógio dentro do núcleo (fora dos comentários)");
});
