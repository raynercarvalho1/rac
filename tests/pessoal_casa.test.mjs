// Finanças e compras igual para a Fernanda (16/11/2026) · js/app.js: a casa lê e grava SÓ as 6 chaves de "pessoal" (Mercado e Radar), sempre na linha do dono,
// sem sobrescrever às cegas; o dono continua como era. Roda o trecho real do app.js (pessoalCarregar/pessoalGravar) com um Supabase falso. Sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const app = ler("js/app.js");
const ini = app.indexOf("var PAPEL=null,"), fim = app.indexOf("/* O que estava guardado só no navegador");
assert.ok(ini > 0 && fim > ini, "trecho do app.js");
const TRECHO = app.slice(ini, fim);
const ESPERA = () => new Promise((r) => setImmediate(r));
const D = "dono-uid", F = "fernanda-uid", T0 = "2026-11-16T10:00:00.000Z";

function montar({ papel, linhas: base }) {
  const linhas = base.map((l) => ({ ...l })), filtros = [], upserts = [], msgs = [], ls = {};
  const SB = { from(t) {
    assert.equal(t, "pessoal");
    const f = []; const b = {
      select() { return b; }, eq(c, v) { f.push(["eq", c, v]); filtros.push(["eq", c, v]); return b; }, in(c, v) { f.push(["in", c, v]); filtros.push(["in", c, v]); return b; },
      then(ok, er) { const d = linhas.filter((l) => f.every(([k, c, v]) => k === "eq" ? l[c] === v : v.includes(l[c]))); return Promise.resolve({ data: d, error: null }).then(ok, er); },
      upsert(o) { upserts.push(o); return Promise.resolve({ error: null }); },
    }; return b; } };
  const ctx = vm.createContext({ SB, console, Promise, Object, Array, JSON, Date, Math, String, Number, Error, isFinite, parseInt, setTimeout: (f) => { f(); return 1; }, clearTimeout() {},
    localStorage: { get length() { return Object.keys(ls).length; }, key: (i) => Object.keys(ls)[i], getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; } },
    SIS: { erros: [], conflitos: {}, falhaSinc: null, ultimaSinc: null, versao: {} }, syncSelo() {}, logErro() {}, hojeAoEntrar() {} });
  vm.runInContext(TRECHO + "\n;globalThis.__t={set:function(p,eu,dono,sb){PAPEL=p;EU=eu;DONO=dono;SB=sb;SEM_TABELA=false},P:function(){return PESSOAL}};", ctx);
  ctx.__t.set(papel, { id: papel === "casa" ? F : D }, D, SB);
  return { ctx, linhas, filtros, upserts, msgs, ls, pronto: (m) => msgs.push(m) };
}
const LINHAS = [
  { user_id: D, chave: "radar-vinculos", valor: { a: 1 }, atualizado: T0 }, { user_id: D, chave: "mercado-canais", valor: { c: 1 }, atualizado: T0 },
  { user_id: D, chave: "x-amigos", valor: ["segredo"], atualizado: T0 }, { user_id: D, chave: "aniversarios", valor: [1], atualizado: T0 },
];

test("casa: carrega só as 7 chaves, da linha do dono (filtro user_id e chave no pedido); o resto de pessoal não entra", async () => {
  const m = montar({ papel: "casa", linhas: LINHAS });
  await m.ctx.pessoalCarregar();
  const P = m.ctx.__t.P();
  assert.deepEqual(Object.keys(P).sort(), ["mercado-canais", "radar-vinculos"]);
  assert.deepEqual(P["radar-vinculos"], { a: 1 });
  assert.ok(m.filtros.some(([k, c, v]) => k === "eq" && c === "user_id" && v === D), "pede a linha do dono");
  assert.ok(m.filtros.some(([k, c, v]) => k === "in" && c === "chave" && ["radar-config", "radar-pagos", "radar-vinculos", "mercado-equivalencias", "mercado-alertas", "mercado-canais", "mercado-areas"].every((x) => v.includes(x)) && v.length === 7), "só as 7 chaves");
});
test("casa: grava chave compartilhada na linha do DONO (user_id do dono, não o dela); sem escrever chave fora da lista", async () => {
  const m = montar({ papel: "casa", linhas: LINHAS });
  await m.ctx.pessoalCarregar();
  m.ctx.pessoalGravar("radar-vinculos", { a: 2 }, m.pronto); await ESPERA(); await ESPERA(); await ESPERA();
  assert.equal(m.upserts.length, 1); assert.equal(m.upserts[0].user_id, D, "na linha do dono"); assert.equal(m.upserts[0].chave, "radar-vinculos"); assert.deepEqual(m.upserts[0].valor, { a: 2 });
  assert.deepEqual(m.msgs, [""], "salvou na conta");
  m.ctx.pessoalGravar("compras", { x: 1 }, m.pronto); await ESPERA(); await ESPERA();
  assert.equal(m.upserts.length, 1, "chave fora da lista não vai para a conta");
  assert.match(m.msgs[1], /só neste aparelho/);
});
test("casa: se o dono (ou outra pessoa da casa) mudou o dado depois, vale a versão da conta e nada é sobrescrito", async () => {
  const m = montar({ papel: "casa", linhas: LINHAS });
  await m.ctx.pessoalCarregar();
  const l = m.linhas.find((x) => x.chave === "radar-vinculos"); l.valor = { a: 99 }; l.atualizado = "2026-11-16T11:00:00.000Z";   /* o dono mudou na conta depois que ela carregou */
  m.ctx.pessoalGravar("radar-vinculos", { a: 2 }, m.pronto); await ESPERA(); await ESPERA(); await ESPERA();
  assert.equal(m.upserts.length, 0, "não sobrescreve às cegas");
  assert.match(m.msgs[0], /outra pessoa da casa/); assert.deepEqual(m.ctx.__t.P()["radar-vinculos"], { a: 99 }, "passa a valer a da conta");
});

test("dono: continua como era (lê sem filtro de chave; grava na própria linha)", async () => {
  const m = montar({ papel: "dono", linhas: LINHAS });
  await m.ctx.pessoalCarregar();
  assert.equal(Object.keys(m.ctx.__t.P()).length, 4, "o dono lê todas as chaves dele");
  assert.ok(!m.filtros.some(([k]) => k === "in"), "sem filtro de chave para o dono");
  m.ctx.pessoalGravar("x-amigos", ["novo"], m.pronto); await ESPERA(); await ESPERA(); await ESPERA();
  assert.equal(m.upserts.length, 1); assert.equal(m.upserts[0].user_id, D); assert.equal(m.upserts[0].chave, "x-amigos");
});
test("código: entrar como casa limpa o RAC Hoje ANTES e só então lê as 6 chaves; Gmail e Sistema continuam só do dono", () => {
  assert.match(app, /if\(PAPEL!=="dono"\)\{hojeLimparLocal\(\);return pessoalCarregar\(\)/);
  assert.match(ler("js/compras.js"), /if\(isOwner\(\)&&typeof gmApi==="function"\)p\.appendChild\(ccGmailBloco\(saida,st\)\)/, "o Gmail do dono não aparece para a casa");
  assert.match(ler("js/iacustos.js"), /if\(!isOwner\(\)\)\{root\.appendChild/, "custos de IA seguem só do dono");
});
