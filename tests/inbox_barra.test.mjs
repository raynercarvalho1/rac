// RAC Inbox · I4 lote 4 · o Inbox como 6º botão da barra de baixo do celular, com o número de não lidas da Caixa de entrada (soma das contas). Só o dono vê a barra; a casa (Fernanda) não muda.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { registro, lerArq } from "./_rotas.mjs";

globalThis.window = globalThis; await import("../nucleo.js"); const N = globalThis.RACnucleo;
const barraHtml = () => { const ctx = { console, Object, Array, JSON, String, document: { getElementById: () => null } }; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(lerArq("js/rotas.js"), ctx, { filename: "js/rotas.js" }); return ctx.rotasBarraHtml(); };

test("barra: Hoje, Agenda, Saúde, Compras, Inbox e o botão do menu, nessa ordem; o Inbox leva o selo de não lidas (escondido até haver número); o menu lateral e o registro NÃO mudam de ordem", () => {
  const h = barraHtml(), links = [...h.matchAll(/<a href="#([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(links, ["rachoje", "agenda", "saude", "mercado", "inbox"]); assert.ok(h.indexOf('id="barramenu"') > h.indexOf('href="#inbox"'), "o menu continua por último");
  assert.match(h, /<a href="#inbox"[^>]*>[\s\S]*?<span class="t">Inbox<\/span>[\s\S]*?<span class="bcnt" id="cntbarrainbox" hidden><\/span><\/a>/, "selo dentro do atalho do Inbox, escondido");
  assert.equal((h.match(/id="cntbarrainbox"/g) || []).length, 1);
  const ids = registro().rotas.map((r) => r.id); assert.ok(ids.indexOf("inbox") < ids.indexOf("saude"), "a ordem do registro (e do menu lateral) segue a de antes");
  const inbox = registro().rotas.find((r) => r.id === "inbox"); assert.deepEqual([inbox.area, inbox.grupo, !!inbox.casa], ["hoje", "Painel", false], "o Inbox continua só do dono, na área Hoje do menu");
});

test("NUCLEO.inbContadorBarra soma só as pastas de ENTRADA, ignora número ausente e lista vazia dá 0", () => {
  assert.equal(N.inbContadorBarra([{ uso: "entrada", nao_lidas: 3 }, { uso: "entrada", nao_lidas: 4 }, { uso: "spam", nao_lidas: 50 }, { uso: "enviados", nao_lidas: 9 }]), 7);
  assert.equal(N.inbContadorBarra([{ uso: "entrada", nao_lidas: null }, { uso: "entrada" }, { uso: "entrada", nao_lidas: "x" }, { uso: "entrada", nao_lidas: -2 }, null]), 0);
  assert.equal(N.inbContadorBarra([]), 0); assert.equal(N.inbContadorBarra(undefined), 0);
});

/* o selo: as duas funções do app.js, entre marcadores, rodadas num ambiente falso */
const trecho = () => { const t = lerArq("js/app.js"), a = t.indexOf("/*BARRA-INBOX*/"), b = t.indexOf("/*FIM-BARRA-INBOX*/"); assert.ok(a > 0 && b > a, "marcadores da barra no app.js"); return t.slice(a, b); };
function ambiente({ papel = "dono", resposta = { data: [{ uso: "entrada", nao_lidas: 5 }, { uso: "entrada", nao_lidas: 2 }], error: null } } = {}) {
  const selo = { hidden: true, textContent: "", parentNode: { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } } }, consultas = [];
  const SB = { from: (t) => ({ select: (c) => { const f = []; const q = { eq: (k, v) => { f.push([k, v]); return q; }, then: (ok, ko) => { consultas.push([t, c, ...f.flat()]); return (typeof resposta === "function" ? Promise.resolve().then(resposta) : Promise.resolve(resposta)).then(ok, ko); } }; return q; } }) };
  const ctx = { console, Promise, Number, String, PAPEL: papel, isOwner: () => papel === "dono", NUCLEO: N, SB, $: (s) => (s === "#cntbarrainbox" ? selo : null), sbOk: (r) => { if (r.error) throw r.error; return r.data; } }; vm.createContext(ctx); vm.runInContext(trecho(), ctx);
  return { ctx, selo, consultas };
}
test("selo da barra: mostra o número (99+ acima de 99), esconde em zero e em erro (nunca inventa 0), descreve o atalho para leitor de tela e só consulta inbox_pastas de ENTRADA", async () => {
  const a = ambiente(); await a.ctx.inboxBarraAtualizar(); assert.deepEqual([a.selo.hidden, a.selo.textContent, a.selo.parentNode.attrs["aria-label"]], [false, "7", "Inbox, 7 não lidas"]); assert.deepEqual(a.consultas, [["inbox_pastas", "uso,nao_lidas", "uso", "entrada", "ativa", true]], "só pastas de entrada ATIVAS");
  a.ctx.inboxBarraMostrar(1); assert.equal(a.selo.parentNode.attrs["aria-label"], "Inbox, 1 não lida"); a.ctx.inboxBarraMostrar(120); assert.equal(a.selo.textContent, "99+");
  a.ctx.inboxBarraMostrar(0); assert.deepEqual([a.selo.hidden, a.selo.textContent, "aria-label" in a.selo.parentNode.attrs], [true, "", false]);
  const e = ambiente({ resposta: { data: null, error: { message: "SEGREDO" } } }); e.selo.hidden = false; e.selo.textContent = "9"; await e.ctx.inboxBarraAtualizar(); assert.deepEqual([e.selo.hidden, e.selo.textContent], [true, ""], "erro = sem número");
  const t = ambiente({ resposta: () => { throw new Error("rede"); } }); t.selo.hidden = false; await t.ctx.inboxBarraAtualizar(); assert.equal(t.selo.hidden, true, "exceção também esconde");
});
test("a casa (Fernanda) nunca consulta o Inbox nem ganha o selo; o CSS da barra continua só do dono e o selo não usa cor escrita", async () => {
  const c = ambiente({ papel: "casa" }); await c.ctx.inboxBarraAtualizar(); assert.equal(c.consultas.length, 0); const sem = ambiente({ papel: null }); await sem.ctx.inboxBarraAtualizar(); assert.equal(sem.consultas.length, 0, "papel ainda desconhecido (login/MFA) também não consulta");
  const css = lerArq("css/rac.css"), regras = css.match(/[^{}]*#barra[^{}]*\.bcnt[^{}]*\{[^}]*\}/g) || []; assert.ok(regras.length >= 1, "há regra do selo");
  for (const r of regras) { assert.match(r.trim(), /^html\.logado:not\(\.casa\) #barra/, "só do dono: " + r.trim().slice(0, 60)); assert.ok(!/rgba?\(|#[0-9a-fA-F]{3,8}\b/.test(r.slice(r.indexOf("{"))), "sem cor escrita: " + r); }
  assert.match(css, /html\.casa #navgrp h4\.areat,html\.casa #barra\{display:none\}/, "a casa continua sem barra");
  const inbox = lerArq("js/inbox.js"); assert.match(inbox, /inboxBarraMostrar\(NUCLEO\.inbContadorBarra\(INBX\.pastas\)\)/, "o Inbox atualiza o selo depois de ler (sincronizar e organizar já releem)");
  const app = lerArq("js/app.js"); assert.match(app, /if\(PAPEL!=="casa"\)inboxBarraAtualizar\(\)/, "ao entrar só o dono atualiza"); assert.match(app, /voltaOlhar[\s\S]{0,600}typeof inboxBarraAtualizar==="function"\)inboxBarraAtualizar\(\)/, "ao voltar para a aba também (com guarda)");
});
