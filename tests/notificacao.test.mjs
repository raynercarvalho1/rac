// Notificação tocada (Fase 1, P-17): o sw.js de verdade num ambiente falso (janelas, cache e relógio) e o bloco "Notificação tocada"
// de js/app.js. Tocar no aviso abre o destino que ele traz (hoje Agenda, Resumo ou Lista; qual destino é a questão D-05 e não muda
// aqui) com o app aberto, fechado e recém-atualizado. Sem rede. O que só o iPhone prova está em docs/planejamento/historico-diario.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const SITE = "https://raynercarvalho.com.br/";
const espera = () => new Promise((r) => setTimeout(r, 0));
const DESTINO = SITE + "__rac-destino";

/* caches em memória, iguais para o service worker e para a página (é o mesmo armazenamento no aparelho) */
function cachesFalsos() {
  const caixas = {};
  const de = (n) => (caixas[n] = caixas[n] || new Map());
  return {
    caixas,
    open: async (n) => ({ match: async (k) => de(n).get(String(k)), put: async (k, r) => { de(n).set(String(k), r); }, delete: async (k) => de(n).delete(String(k)) }),
    match: async () => undefined, keys: async () => Object.keys(caixas), delete: async () => true,
  };
}

/* uma janela do site: navigate existe (Chrome) ou não (navegador sem a função); controlada ou não pelo service worker */
function janela({ url = SITE + "#inicio", focused = false, visivel = true, navigate = true, controlada = true, log }) {
  const j = { url, focused, visibilityState: visivel ? "visible" : "hidden", recebidas: [], focos: 0, navegou: [] };
  j.focus = () => { j.focos++; log.push("foco"); return Promise.resolve(j); };
  j.postMessage = (m) => { j.recebidas.push(m); log.push("mensagem"); };
  if (navigate) j.navigate = (u) => { log.push("navigate"); if (!controlada) return Promise.reject(new TypeError("This service worker is not the client's active service worker.")); j.navegou.push(u); return Promise.resolve(j); };
  return j;
}

function sw({ janelas = [], caches = cachesFalsos() } = {}) {
  const ouvintes = {}, log = [], abertas = [], mostradas = [];
  const ctx = {
    self: {
      location: { origin: SITE.slice(0, -1), href: SITE + "sw.js" }, addEventListener: (t, f) => (ouvintes[t] = f),
      clients: { matchAll: async (o) => { log.push("matchAll:" + JSON.stringify(o)); return janelas; }, openWindow: async (u) => { abertas.push(u); log.push("openWindow"); return null; }, claim: async () => {} },
      registration: { showNotification: async (t, o) => { mostradas.push({ titulo: t, ...o }); } }, skipWaiting: () => {},
    },
    caches, URL, Response, Date, JSON, Promise, console, fetch: async () => { throw new Error("sem rede no teste"); },
  };
  vm.runInNewContext(ler("sw.js"), ctx, { filename: "sw.js" });
  const tocar = async (data) => {
    let p = null;
    const notification = { data, close() { log.push("fechou"); } };
    ouvintes.notificationclick({ notification, waitUntil: (x) => (p = x) });
    await p; await espera();
    return p;
  };
  const push = async (payload) => { let p; ouvintes.push({ data: { json: () => payload, text: () => JSON.stringify(payload) }, waitUntil: (x) => (p = x) }); await p; return mostradas.at(-1); };
  const guardado = async () => { const r = await (await caches.open("rac-dados")).match(DESTINO); return r ? JSON.parse(await r.text()) : null; };
  return { tocar, push, log, abertas, caches, guardado };
}

test("app aberto: traz a janela para a frente, avisa a página e guarda o destino antes do aviso; não abre outra janela", async () => {
  const log = [], j = janela({ focused: true, log });
  const s = sw({ janelas: [j] });
  s.log.push = (x) => log.push(x);
  await s.tocar({ url: "./#agenda" });
  assert.equal(j.focos, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(j.recebidas)), [{ tipo: "rac-abrir", url: SITE + "#agenda" }]);
  assert.deepEqual(j.navegou, [SITE + "#agenda"], "página de antes desta versão (sem o aviso) também troca, pelo navigate");
  assert.deepEqual(s.abertas, []);
  assert.ok(log.indexOf("foco") < log.indexOf("mensagem"), "o foco vem primeiro (o toque libera por pouco tempo)");
  const g = await s.guardado();
  assert.equal(g.url, SITE + "#agenda");
  assert.ok(Math.abs(g.quando - Date.now()) < 5000);
});

test("navegador sem navigate (ou janela não controlada pelo service worker): o aviso à página basta e nada quebra", async () => {
  for (const op of [{ navigate: false }, { navigate: true, controlada: false }]) {
    const log = [], j = janela({ ...op, log });
    const s = sw({ janelas: [j] });
    const p = await s.tocar({ url: "./#resumo" });
    assert.equal(p.length, 3, "o waitUntil termina sem rejeitar");
    assert.equal(j.focos, 1);
    assert.equal(j.recebidas[0].url, SITE + "#resumo");
    assert.deepEqual(s.abertas, []);
  }
});

test("app fechado: abre uma janela já no destino e guarda o destino (reserva para quem abre o início)", async () => {
  const s = sw({ janelas: [] });
  await s.tocar({ url: "./#lista" });
  assert.deepEqual(s.abertas, [SITE + "#lista"]);
  assert.equal((await s.guardado()).url, SITE + "#lista");
});

test("várias janelas: usa a que está em foco, senão a visível; janela já no destino não é navegada de novo", async () => {
  const log = [];
  const a = janela({ url: SITE + "#mercado", visivel: false, log }), b = janela({ url: SITE + "#agenda", visivel: true, log });
  const s = sw({ janelas: [a, b] });
  await s.tocar({ url: "./#agenda" });
  assert.equal(a.focos + a.recebidas.length, 0);
  assert.equal(b.focos, 1); assert.equal(b.recebidas.length, 1);
  assert.deepEqual(b.navegou, [], "já está lá: sem navigate");
});

test("janela em outro endereço do site (ex.: /index.html): sem navigate (que recarregaria a página); o aviso leva ao destino", async () => {
  const log = [], j = janela({ url: SITE + "index.html#mercado", log });
  const s = sw({ janelas: [j] });
  await s.tocar({ url: "./#agenda" });
  assert.deepEqual(j.navegou, []);
  assert.equal(log.includes("navigate"), false);
  assert.equal(j.recebidas[0].url, SITE + "#agenda");
  assert.equal(j.focos, 1);
});

test("destinos que a rotina das 6h manda (Agenda, Resumo, Lista) chegam iguais; sem endereço vai ao início; outro site nunca abre", async () => {
  for (const d of ["agenda", "resumo", "lista", "newsletter/semana", "mercado/radar"]) {
    const s = sw();
    await s.tocar({ url: "./#" + d });
    assert.deepEqual(s.abertas, [SITE + "#" + d], d);
  }
  const s1 = sw(); await s1.tocar({});
  assert.deepEqual(s1.abertas, [SITE]);
  const s2 = sw(); await s2.tocar({ url: "https://exemplo.invalid/#agenda" });
  assert.deepEqual(s2.abertas, [SITE], "endereço de fora vira o início do site");
  const s3 = sw(); await s3.tocar({ url: "javascript:alert(1)" });
  assert.deepEqual(s3.abertas, [SITE]);
});

test("aviso sem endereço continua indo para a Agenda (o padrão do push não mudou) e o toque abre lá", async () => {
  const s = sw();
  const n = await s.push({ titulo: "Dia a Dia RAC — hoje", corpo: "teste" });
  assert.equal(n.data.url, "./#agenda");
  await s.tocar(n.data);
  assert.deepEqual(s.abertas, [SITE + "#agenda"]);
});

test("o servidor manda os mesmos destinos de antes (D-05 em aberto: nada mudou na função garmin)", () => {
  const g = ler("supabase/functions/garmin/index.ts");
  assert.match(g, /url: domingo && semana\.length \? "\.\/#resumo" : compra && !linhas\.length \? "\.\/#lista" : "\.\/#agenda"/);
  assert.match(g, /url: "\.\/#sistema", tag: "teste"/, "o \"Mandar um teste\" abre o Sistema");
});

/* ----- a página: o bloco "Notificação tocada" de js/app.js num ambiente falso ----- */
const APP = ler("js/app.js");
const BLOCO = APP.slice(APP.indexOf("  /* ===== Notificação tocada"), APP.indexOf("  /* ===== Voltar ao site"));

function pagina({ hash = "#inicio", caches = cachesFalsos(), semCaches = false } = {}) {
  const ouvintes = {}, trocas = [];
  const location = { get href() { return SITE + location._h; }, _h: hash, get hash() { return location._h; }, set hash(v) { trocas.push(v); location._h = v; } };
  const ctx = { NUCLEO: N, location, URL, Date, Promise, JSON, navigator: { serviceWorker: { addEventListener: (t, f) => (ouvintes[t] = f) } } };
  ctx.window = semCaches ? {} : { caches };
  if (!semCaches) ctx.caches = caches;
  vm.createContext(ctx);
  vm.runInContext(BLOCO, ctx, { filename: "app.js (notificação)" });
  const guardar = async (d) => (await caches.open("rac-dados")).put(DESTINO, new Response(JSON.stringify(d)));
  const guardado = async () => !!(await (await caches.open("rac-dados")).match(DESTINO));
  return { ctx, ouvintes, trocas, location, guardar, guardado };
}

test("página aberta recebe o aviso: vai ao destino e apaga o destino guardado (não volta a levar lá depois)", async () => {
  const p = pagina({ hash: "#mercado" });
  await p.guardar({ url: SITE + "#agenda", quando: Date.now() });
  p.ouvintes.message({ data: { tipo: "rac-abrir", url: SITE + "#agenda" } });
  await espera(); await espera();
  assert.deepEqual(p.trocas, ["#agenda"]);
  assert.equal(await p.guardado(), false);
});

test("página aberta ignora aviso de outro tipo, endereço de outro site e o destino em que já está", async () => {
  const p = pagina({ hash: "#agenda" });
  p.ouvintes.message({ data: { tipo: "outro", url: SITE + "#lista" } });
  p.ouvintes.message({ data: { tipo: "rac-abrir", url: "https://exemplo.invalid/#lista" } });
  p.ouvintes.message({ data: { tipo: "rac-abrir", url: SITE + "#agenda" } });
  p.ouvintes.message({});
  await espera();
  assert.deepEqual(p.trocas, []);
});

test("destino guardado: dentro do prazo leva até ele uma vez; vencido ou sem aplicar só é apagado; sem caches nada quebra", async () => {
  const p = pagina();
  await p.guardar({ url: SITE + "#resumo", quando: Date.now() - 60e3 });
  assert.equal(await p.ctx.notifPendente(true), true);
  assert.deepEqual(p.trocas, ["#resumo"]);
  assert.equal(await p.guardado(), false, "vale uma vez só");
  assert.equal(await p.ctx.notifPendente(true), false);
  await p.guardar({ url: SITE + "#lista", quando: Date.now() - N.NOTIF_VALIDADE_MS - 1000 });
  assert.equal(await p.ctx.notifPendente(true), false, "vencido");
  assert.deepEqual(p.trocas, ["#resumo"]);
  assert.equal(await p.guardado(), false);
  await p.guardar({ url: SITE + "#lista", quando: Date.now() });
  assert.equal(await p.ctx.notifPendente(false), false);
  assert.equal(await p.guardado(), false);
  assert.equal(await pagina({ semCaches: true }).ctx.notifPendente(true), false);
});

test("ponta a ponta: o service worker guarda, o app abre no início (iPhone que ignora o endereço) e a página vai ao destino", async () => {
  const caches = cachesFalsos();
  const s = sw({ janelas: [], caches });
  await s.tocar({ url: "./#agenda" });
  const p = pagina({ hash: "", caches });
  assert.equal(await p.ctx.notifPendente(true), true);
  assert.deepEqual(p.trocas, ["#agenda"]);
});

test("ligações: o login chama o destino guardado depois de desenhar a página; o ouvinte é do service worker; ES5", () => {
  assert.match(APP, /route\(\);notifPendente\(true\)\}/);
  assert.match(BLOCO, /navigator\.serviceWorker\.addEventListener\("message"/);
  assert.ok(!/\bconst |\blet |=>/.test(BLOCO), "ES5 puro");
  const sw = ler("sw.js");
  assert.ok(!/c\.navigate\(alvo\); return c\.focus\(\)/.test(sw), "o navigate sem tratamento saiu");
  assert.match(sw, /data: \{ url: d\.url \|\| "\.\/#agenda" \}/, "o padrão do push continua a Agenda");
});

test("regras do núcleo: só página deste site; destino guardado vale 5 minutos", () => {
  const H = N.notifHash, B = SITE + "#inicio";
  assert.equal(H("./#agenda", B), "#agenda");
  assert.equal(H(SITE + "#newsletter/semana", B), "#newsletter/semana");
  assert.equal(H("./#busca/caf%C3%A9", B), "#busca/caf%C3%A9");
  assert.equal(H("./", B), "", "sem página: nada a fazer");
  assert.equal(H("https://exemplo.invalid/#agenda", B), "");
  assert.equal(H("javascript:alert(1)", B), "");
  assert.equal(H("./#<img>", B), "");
  assert.equal(H(null, B), ""); assert.equal(H("./#agenda", "nada"), "");
  const F = N.notifFresco, t = 1_700_000_000_000;
  assert.equal(N.NOTIF_VALIDADE_MS, 5 * 60 * 1000);
  assert.equal(F({ url: "x", quando: t }, t + 299_000), true);
  assert.equal(F({ url: "x", quando: t }, t + 301_000), false);
  assert.equal(F({ url: "x", quando: t + 10 }, t), false, "do futuro não vale");
  assert.equal(F({ quando: t }, t), false); assert.equal(F(null, t), false);
});
