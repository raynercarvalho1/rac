// Voltar ao site (Fase 1, P-16): depois de pelo menos 5 minutos fora, a página atual se atualiza sozinha pelo MESMO ↻ (atuAtualizar),
// sem apagar o que está sendo digitado. Regras puras (NUCLEO.atuVoltar) e o código de verdade de js/app.js (blocos "Botão de
// atualizar", "Notificação tocada" e "Voltar ao site") num ambiente falso com relógio controlado. Sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const APP = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const BOTAO = APP.slice(APP.indexOf("/* ===== Botão de atualizar"), APP.indexOf("/* ===== Captura rápida"));
const VOLTA = APP.slice(APP.indexOf("  /* ===== Notificação tocada"), APP.indexOf("  /* ===== Estudos"));
const MIN = 60 * 1000;
const espera = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

test("regra: volta depois de 5 min atualiza; antes disso, com foco, captura aberta, formulário, tarefa, sem internet ou logo depois de outra, não", () => {
  const V = N.atuVoltar, t = 1_700_000_000_000, base = { logado: true, dono: true, saiu: t, agora: t + 6 * MIN, online: true };
  assert.equal(N.ATU_VOLTAR_MS, 5 * MIN);
  assert.deepEqual(V(base), { ok: true, motivo: "" });
  assert.equal(V({ ...base, agora: t + 5 * MIN }).ok, true, "exatamente 5 min já vale");
  assert.equal(V({ ...base, agora: t + 5 * MIN - 1 }).motivo, "pouco-tempo");
  assert.equal(V({ ...base, agora: t + 30e3 }).motivo, "pouco-tempo");
  assert.equal(V({ ...base, foco: true }).motivo, "foco");
  assert.equal(V({ ...base, aberto: true }).motivo, "aberto");
  assert.equal(V({ ...base, sujo: true }).motivo, "formulario");
  assert.equal(V({ ...base, ocupado: "leitura com IA" }).motivo, "ocupado");
  assert.equal(V({ ...base, rodando: true }).motivo, "rodando");
  assert.equal(V({ ...base, online: false }).motivo, "offline");
  assert.equal(V({ ...base, ultima: t + 2 * MIN }).motivo, "recente", "atualizada há 4 min");
  assert.equal(V({ ...base, ultima: t - 1 * MIN }).ok, true, "atualizada há 7 min");
  assert.equal(V({ ...base, dono: false }).motivo, "casa", "o que a casa vê não muda sem o dono pedir");
  assert.equal(V({ ...base, logado: false }).motivo, "sem-login");
  assert.equal(V({ ...base, saiu: 0 }).motivo, "sem-saida");
  assert.equal(V().ok, false);
});

/* o site num ambiente falso: o ↻ de verdade (com o redesenho trocado por um contador) e os blocos novos */
function montar({ dono = true, papel = "dono" } = {}) {
  let agora = 1_700_000_000_000;
  class Relogio extends Date { constructor(...a) { if (a.length) super(...a); else super(agora); } static now() { return agora; } }
  const ouvDoc = {}, ouvJan = {}, avisos = [], estado = { pings: 0, portao: null };
  const campos = [];
  const raiz = { querySelectorAll: (s) => (/search|data-atu-filtro/.test(s) ? [] : campos), querySelector: () => null };
  const atust = { set textContent(t) { avisos.push(t); }, get textContent() { return avisos.at(-1); }, className: "", hidden: true };
  const ctx = {
    NUCLEO: N, Date: Relogio, console, Promise, Object, Array, JSON, Math, String, Number, Error, URL, isFinite, clearTimeout,
    setTimeout: (f, ms) => { const t = setTimeout(f, ms); if (ms > 50 && t.unref) t.unref(); return t; },
    document: {
      visibilityState: "visible", activeElement: null, body: { tagName: "BODY" }, documentElement: { getAttribute: () => "mercado" },
      getElementById: (id) => (id === "mercado" ? raiz : null), querySelector: () => null,
      addEventListener: (t, f) => ((ouvDoc[t] = ouvDoc[t] || []).push(f)),
    },
    navigator: { onLine: true, serviceWorker: { addEventListener() {} } },
    location: { hash: "#mercado", href: "https://raynercarvalho.com.br/#mercado" }, scrollY: 0, scrollTo() {},
    SB: { rpc: (n) => { if (n === "ping") estado.pings++; return estado.portao ? estado.portao.then(() => ({ data: null, error: null })) : Promise.resolve({ data: null, error: null }); } },
    sbOk: (r) => { if (r.error) throw new Error(r.error.message); return r.data; },
    $: (s) => (s === "#atust" ? atust : s === "#capfundo" ? ctx.captura : null), captura: null,
    PAPEL: papel, isOwner: () => dono, SEM_TABELA: false, pendentes: () => [], SIS: { conflitos: {} }, pessoalCarregar: () => Promise.resolve(),
    novoId: (() => { let i = 0; return () => "id" + ++i; })(), logErro() {}, redesenhos: 0, route() {}, Event: class { constructor(t) { this.type = t; } },
  };
  ctx.window = ctx;
  ctx.addEventListener = (t, f) => ((ouvJan[t] = ouvJan[t] || []).push(f));
  vm.createContext(ctx);
  vm.runInContext(BOTAO, ctx, { filename: "app.js (botão de atualizar)" });
  vm.runInContext("function atuPadrao(raiz){redesenhos++;return Promise.resolve(0)}", ctx);
  vm.runInContext(VOLTA, ctx, { filename: "app.js (voltar ao site)" });
  const disparar = (lista, ev) => (lista || []).forEach((f) => f(ev));
  const sair = async () => { ctx.document.visibilityState = "hidden"; disparar(ouvDoc.visibilitychange, { type: "visibilitychange" }); await espera(); };
  const voltar = async (ms, { pageshow = false } = {}) => {
    agora += ms; ctx.document.visibilityState = "visible";
    disparar(ouvDoc.visibilitychange, { type: "visibilitychange" });
    if (pageshow) disparar(ouvJan.pageshow, { type: "pageshow", persisted: true });
    await espera();
  };
  const campo = (valor, inicial) => campos.push({ tagName: "INPUT", type: "text", value: valor, __atu: { v: inicial }, checked: false, hasAttribute: () => false });
  return { ctx, sair, voltar, campo, avisos, estado, ouvJan, avancar: (ms) => (agora += ms) };
}

test("volta depois de 6 min: a página atualiza pelo mesmo ↻ (ping no banco antes de redesenhar) e mostra a hora", async () => {
  const s = montar();
  await s.sair(); await s.voltar(6 * MIN);
  assert.equal(s.estado.pings, 1);
  assert.equal(s.ctx.redesenhos, 1);
  assert.equal(s.avisos[0], "Atualizando…");
  assert.match(s.avisos.at(-1), /^Atualizado às \d\d:\d\d\.$/);
});

test("volta antes de 5 min: nada acontece", async () => {
  const s = montar();
  await s.sair(); await s.voltar(4 * MIN + 59e3);
  assert.equal(s.estado.pings, 0);
  assert.deepEqual(s.avisos, []);
});

test("campo com foco (o teclado estava aberto): não atualiza; botão com foco não conta como campo", async () => {
  const s = montar();
  s.ctx.document.activeElement = { tagName: "TEXTAREA" };
  await s.sair(); await s.voltar(10 * MIN);
  s.ctx.document.activeElement = { tagName: "INPUT", type: "search" };
  await s.sair(); await s.voltar(10 * MIN);
  assert.equal(s.estado.pings, 0, "a busca digitada também é um campo com foco");
  s.ctx.document.activeElement = { tagName: "INPUT", type: "checkbox" };
  await s.sair(); await s.voltar(10 * MIN);
  assert.equal(s.estado.pings, 1);
});

test("formulário alterado e não salvo: não atualiza, nada é apagado e nenhum aviso aparece (o ↻ manual continua avisando)", async () => {
  const s = montar();
  s.campo("Pizza grande", "Pizza");
  await s.sair(); await s.voltar(30 * MIN);
  assert.equal(s.estado.pings, 0);
  assert.equal(s.ctx.redesenhos, 0, "a tela não foi redesenhada: o texto digitado continua");
  assert.deepEqual(s.avisos, []);
  await s.ctx.atuAtualizar();
  assert.match(s.avisos.at(-1), /formulário com alterações não salvas/, "o toque no ↻ explica por que não atualizou");
});

test("operação em andamento (leitura com IA, envio, importação) ou módulo ocupado: não atualiza", async () => {
  const s = montar();
  const fim = s.ctx.atuTarefa("leitura com IA");
  await s.sair(); await s.voltar(8 * MIN);
  assert.equal(s.estado.pings, 0);
  assert.deepEqual(s.avisos, []);
  fim();
  s.ctx.atuRegistrar("mercado", { ocupado: () => "salvando a nota" });
  await s.sair(); await s.voltar(8 * MIN);
  assert.equal(s.estado.pings, 0);
  s.ctx.atuRegistrar("mercado", {});
  await s.sair(); await s.voltar(8 * MIN);
  assert.equal(s.estado.pings, 1, "terminada a operação, a próxima volta atualiza");
});

test("captura rápida aberta, sem internet ou a casa (Fernanda): não atualiza", async () => {
  const s = montar();
  s.ctx.captura = {};
  await s.sair(); await s.voltar(8 * MIN);
  s.ctx.captura = null; s.ctx.navigator.onLine = false;
  await s.sair(); await s.voltar(8 * MIN);
  assert.equal(s.estado.pings, 0);
  assert.deepEqual(s.avisos, [], "sem aviso de 'sem internet' na volta");
  const c = montar({ dono: false, papel: "casa" });
  await c.sair(); await c.voltar(8 * MIN);
  assert.equal(c.estado.pings, 0);
});

test("sem repetição: visibilitychange e pageshow da mesma volta contam uma vez; trocas rápidas de aba depois não atualizam de novo", async () => {
  const s = montar();
  await s.sair(); await s.voltar(6 * MIN, { pageshow: true });
  assert.equal(s.estado.pings, 1);
  for (let i = 0; i < 5; i++) { await s.sair(); await s.voltar(20e3); }
  assert.equal(s.estado.pings, 1, "idas e voltas curtas");
  await s.sair(); await s.voltar(5 * MIN);
  assert.equal(s.estado.pings, 2, "nova ausência longa: atualiza de novo");
});

test("volta enquanto uma atualização ainda está em curso: não começa outra", async () => {
  const s = montar();
  let abrir; s.estado.portao = new Promise((r) => (abrir = r));
  const manual = s.ctx.atuAtualizar();
  await espera();
  assert.equal(s.estado.pings, 1);
  await s.sair(); await s.voltar(6 * MIN);
  assert.equal(s.estado.pings, 1, "ATU.rodando segura a segunda");
  abrir(); assert.equal(await manual, true);
});

test("pageshow da primeira carga (não veio do cache de páginas) não faz nada; voltar sem ter saído também não", async () => {
  const s = montar();
  (s.ouvJan.pageshow || []).forEach((f) => f({ type: "pageshow", persisted: false }));
  await s.voltar(10 * MIN);
  assert.equal(s.estado.pings, 0);
});

test("ligações: um só caminho de atualização (atuAtualizar), sem Garmin, Gmail ou IA, e ES5", () => {
  assert.match(VOLTA, /\.ok\)atuAtualizar\(true\)\}/);
  assert.match(VOLTA, /document\.addEventListener\("visibilitychange",voltaOlhar\)/);
  assert.match(VOLTA, /window\.addEventListener\("pageshow",voltaOlhar\)/);
  assert.match(BOTAO, /if\(pode\.motivo!=="rodando"&&!auto\)atuAviso\(pode\.texto,"aviso"\)/);
  assert.ok(!/SB\.|functions\.invoke|racIA\(|gmBuscar|saudeSincronizar|location\.reload|setInterval/.test(VOLTA), "não lê o banco nem chama nada externo por conta própria");
  assert.ok(!/\bconst |\blet |=>|\.finally\(/.test(VOLTA), "ES5 puro");
  assert.equal((APP.match(/addEventListener\("visibilitychange"/g) || []).length, 1, "um ouvinte só");
});
