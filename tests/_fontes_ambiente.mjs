// Auxiliar dos testes da Fase 2 (A4 e A5): monta dois ambientes falsos com os MESMOS dados (banco falso, PESSOAL, data de hoje e papel):
//  · antes: as regras como estavam nas telas (tests/fixtures/fase2/regras-antes.js, cópia da main 95940e4);
//  · agora: as fontes de verdade (js/fontes.js e js/fonte-*.js), a camada de dados e o núcleo.
// Formatos de data e moeda: as funções de verdade de js/app.js (maisDias, dataBR, brl), copiadas do arquivo na hora do teste.
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

export const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
createRequire(import.meta.url)("../nucleo.js");
export const N = globalThis.RACnucleo;
const APP = ler("js/app.js");
const daApp = (re) => { const m = re.exec(APP); if (!m) throw new Error("não achei " + re); return m[0]; };
export const FORMATOS = [/  function fmtN\(v\)\{[^\n]*/, /  function dd\(n\)\{[^\n]*/, /  function maisDias\(iso,n\)\{[^\n]*/, /  function dataBR\(iso\)\{[^\n]*/, /  function brl\(v\)\{[^\n]*/].map(daApp).join("\n") + "\n  var BRL=brl;\n";
export const js = (x) => JSON.parse(JSON.stringify(x === undefined ? null : x));

/* banco falso: registros (select→order) e a pasta de backups (storage.list); conta as leituras */
function banco(d) {
  const lidas = { registros: 0, backups: 0 };
  const resp = (r) => (r && r.rejeita ? Promise.reject(new Error(r.rejeita)) : Promise.resolve(r));
  return { lidas, SB: { from: (t) => ({ select: () => ({ order: () => { lidas[t] = (lidas[t] || 0) + 1; return resp(d.registros || { data: [], error: null }); } }) }),
    storage: { from: () => ({ list: () => { lidas.backups++; return resp(d.backup || { data: [{ name: d.hoje + ".zip" }], error: null }); } }) } } };
}
function base(d) {
  const b = banco(d);
  const ctx = { console, Promise, Object, Array, JSON, Date, Math, String, Number, Error, isFinite, RegExp, parseInt, parseFloat, NUCLEO: N,
    hojeISO: () => d.hoje, isOwner: () => d.dono !== false, logErro: () => {}, EU: { id: "dono-1" }, SB: b.SB, PESSOAL: JSON.parse(JSON.stringify(d.pessoal || {})),
    withDates: () => JSON.parse(JSON.stringify(d.aniversarios || [])),
    getJson: (u) => (d.newsletterJson ? Promise.resolve(JSON.parse(JSON.stringify(d.newsletterJson))) : Promise.reject(new Error("HTTP 404 " + u))) };
  ctx.window = ctx;
  return { ctx: vm.createContext(ctx), lidas: b.lidas };
}
export function antes(d) {
  const a = base(d);
  vm.runInContext(FORMATOS + "  function sbOk(r){if(r.error)throw new Error(r.error.message);return r.data}\n  function dadosDe(r){return r.dados||{}}\n", a.ctx);
  vm.runInContext(ler("js/fonte-familia.js").replace(/\n  fonteRegistrar\([\s\S]*$/, "\n"), a.ctx, { filename: "configuração da Família" });   // FAM e os tipos (os mesmos de antes)
  vm.runInContext(ler("tests/fixtures/fase2/regras-antes.js"), a.ctx, { filename: "regras-antes.js" });
  if (d.nlMem) vm.runInContext("var NLS={dados:" + JSON.stringify(d.nlMem) + "};", a.ctx);
  return a;
}
export function agora(d) {
  const a = base(d);
  for (const f of ["js/dados.js", "js/fontes.js", "js/fonte-familia.js", "js/fonte-mba.js", "js/fonte-newsletter.js", "js/fonte-agenda.js"]) vm.runInContext(ler(f), a.ctx, { filename: f });
  if (d.nlMem) a.ctx.fonteNewsletterGuardar(JSON.parse(JSON.stringify(d.nlMem)));
  /* os leitores de verdade do RAC Hoje (js/hoje.js), para comparar com os de antes */
  const h = ler("js/hoje.js"), i = h.indexOf("  var HOJE_LEITORES={"), j = h.indexOf("  /* todas as fontes, em paralelo");
  vm.runInContext("function hojePag(q){return dadosPaginar(q)}\n" + h.slice(i, j), a.ctx, { filename: "hoje.js (leitores)" });
  return a;
}

/* dados de exemplo, montados de forma previsível (o mesmo "sorteio" a cada vez) */
export function sorteio(semente) { let s = semente >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/* dados de exemplo do MBA e da Agenda (a mesma data de hoje dos testes, 13/11/2026: há IPVA, follow-up, boletos e aniversários) */
const HOJE = "2026-11-13", somaDias = (b, n) => N.somaDiasISO(b, n);
export function mbaPessoal(r) {
  const aulas = [], avaliacoes = [], parcelas = [], feito = {}, links = {};
  for (let i = 0; i < 12; i++) aulas.push({ id: "a" + i, data: somaDias(HOJE, Math.floor(r() * 60) - 30), hora: ["19:00", "08:30", "21:15"][i % 3], t: "Aula " + i, ...(r() < 0.3 ? { link: "#mba/aula" + i } : {}) });
  for (let i = 0; i < 6; i++) { avaliacoes.push({ id: "v" + i, ate: somaDias(HOJE, Math.floor(r() * 40) - 20), t: "Avaliação " + i, ...(r() < 0.5 ? { disc: "Disciplina " + i } : {}) }); if (r() < 0.4) feito["av:v" + i] = HOJE; }
  for (let i = 0; i < 10; i++) { parcelas.push({ k: "p" + i, n: "Parcela " + (i + 1), venc: somaDias(HOJE, (i - 5) * 30), v: 350 + i }); if (r() < 0.5) feito["pg:p" + i] = HOJE; }
  if (r() < 0.5) links.a1 = "#mba/link-a1";
  return { mba: { aulas, avaliacoes, financeiro: r() < 0.8 ? { parcelas } : undefined }, mbaFeito: feito, mbaLinks: links };
}
export function agendaDados(semente, { dono = true, registros, backup } = {}) {
  const r = sorteio(semente), regs = [], quem = ["eddie", "olivia", "civic", "moto", "c3", "docs", "rede", "desconhecido"];
  const tipos = ["vacina", "consulta", "revisao", "seguro", "documento", "garantia", "contato", "exame"];
  for (let i = 0; i < 30; i++) {
    const q = quem[Math.floor(r() * quem.length)], t = q === "rede" ? "contato" : tipos[Math.floor(r() * tipos.length)], dados = {};
    if (r() < 0.2) dados.vigenciaFim = somaDias(HOJE, Math.floor(r() * 200) - 50);
    if (r() < 0.2) dados.garantiaAte = somaDias(HOJE, Math.floor(r() * 200) - 50);
    if (q === "rede" && r() < 0.6) dados.visto = somaDias(HOJE, -Math.floor(r() * 20)) + "T10:00:00";
    regs.push({ id: i, quem: q, tipo: t, data: somaDias(HOJE, -Math.floor(r() * 300)), titulo: (t === "documento" && r() < 0.3 ? "IPVA 2027 " : "Registro ") + i, valor: "v" + i,
      proxima: r() < 0.6 ? somaDias(HOJE, Math.floor(r() * 160) - 80) : null, dados: r() < 0.1 ? null : dados });
  }
  regs.sort((a, b) => b.data.localeCompare(a.data));
  const p = mbaPessoal(r);
  p.lembretes = [{ id: "l1", data: somaDias(HOJE, 2), t: "Ligar para o seguro" }, { id: "l2", data: somaDias(HOJE, -3), t: "Feito", feito: HOJE }];
  p.candidaturas = [{ id: "c1", t: "Analista de Dados", e: "Empresa A", coluna: "candidatei", datas: { candidatei: somaDias(HOJE, -6) } },
    { id: "c2", t: "Analista BI", coluna: "candidatei", datas: { candidatei: somaDias(HOJE, -40) } }, { id: "c3", t: "Cientista", coluna: "candidatei", datas: { candidatei: somaDias(HOJE, -8) }, resultado: "não" }];
  p.ultimoBackup = r() < 0.5 ? somaDias(HOJE, -Math.floor(r() * 60)) : undefined;
  const aniversarios = [{ nome: "Ana", dias: 3 }, { nome: "Bia", dias: 20, fav: true }, { nome: "Caio", dias: 45, fav: true }];
  return { hoje: HOJE, dono, pessoal: p, aniversarios, registros: registros || { data: regs, error: null }, backup: backup || { data: [{ name: somaDias(HOJE, -Math.floor(r() * 20)) + ".zip" }], error: null } };
}
