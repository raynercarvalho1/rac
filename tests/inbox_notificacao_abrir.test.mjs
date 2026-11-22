// RAC · tocar na notificação do Inbox abre o Inbox (correção de 15/11/2026). Teste real no iPhone: o push chegou, o toque abriu o RAC, mas a tela dizia
// "não consegui carregar a seção inbox (sem internet?)". Aqui, sem rede: (1) o sw.js de verdade com janela fechada, em segundo plano e aberta, destino #inbox;
// (2) o destino #inbox preservado e o roteador só navegando com papel/sessão; (3) o carregador de módulos de js/app.js (trecho real) com falha, nova tentativa e erro identificável;
// (4) o sw.js devolvendo a cópia guardada quando a rede responde ERRO (a causa provada); (5) as demais rotas intactas.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const SITE = "https://raynercarvalho.com.br/", DESTINO = SITE + "__rac-destino", espera = () => new Promise((r) => setTimeout(r, 0));

/* ---------- o sw.js de verdade num ambiente falso ---------- */
function cachesFalsos(pre = {}) {
  const caixas = { "rac-app-x": new Map(Object.entries(pre)) };
  const de = (n) => (caixas[n] = caixas[n] || new Map());
  return { caixas, open: async (n) => ({ match: async (k) => de(n).get(String(k)), put: async (k, r) => { de(n).set(String(k), r); }, delete: async (k) => de(n).delete(String(k)) }),
    match: async (req) => { const u = typeof req === "string" ? req : req.url; for (const m of Object.values(caixas)) for (const [k, v] of m) if (k.split("?")[0] === u.split("?")[0]) return v; return undefined; }, keys: async () => Object.keys(caixas), delete: async () => true };
}
function janela({ url, focused = false, visivel = true, log }) {
  const j = { url, focused, visibilityState: visivel ? "visible" : "hidden", recebidas: [], navegou: [] };
  j.focus = () => { log.push("foco"); return Promise.resolve(j); }; j.postMessage = (m) => { j.recebidas.push(m); log.push("mensagem"); };
  j.navigate = (u) => { log.push("navigate"); j.navegou.push(u); return Promise.resolve(j); }; return j;
}
function sw({ janelas = [], caches = cachesFalsos(), fetchFn = async () => { throw new Error("sem rede"); }, responde = true } = {}) {
  const ouvintes = {}, log = [], abertas = [], mostradas = [];
  const ctx = { self: { location: { origin: SITE.slice(0, -1), href: SITE + "sw.js" }, addEventListener: (t, f) => (ouvintes[t] = f),
      clients: { matchAll: async () => janelas, openWindow: async (u) => { abertas.push(u); log.push("openWindow"); return null; }, claim: async () => {} },
      registration: { showNotification: async (t, o) => { mostradas.push({ titulo: t, ...o }); } }, skipWaiting: () => {}, navigator: {} },
    caches, URL, Response, Date, JSON, Promise, console, setTimeout, clearTimeout, fetch: fetchFn };
  vm.runInNewContext(ler("sw.js"), ctx, { filename: "sw.js" });
  /* a página de verdade confirma o aviso (rac-ack); com responde=false ela está congelada ou não tem o ouvinte */
  for (const j of janelas) { const original = j.postMessage; j.postMessage = (m) => { original(m); if (responde && m && m.tipo === "rac-abrir") setTimeout(() => ouvintes.message({ data: { tipo: "rac-ack" } }), 0); }; }
  const push = async (payload) => { let p; ouvintes.push({ data: { json: () => payload }, waitUntil: (x) => (p = x) }); await p; return mostradas.at(-1); };
  const tocar = async (data) => { let p = null; ouvintes.notificationclick({ notification: { data, close() {} }, waitUntil: (x) => (p = x) }); await p; await espera(); };
  const pedir = async (url, mode = "no-cors") => { let r; ouvintes.fetch({ request: { url, method: "GET", mode }, respondWith: (x) => (r = x) }); return await r; };
  return { push, tocar, pedir, log, abertas, mostradas, caches };
}
const AVISO_INBOX = { titulo: "RAC Inbox", corpo: "1 nova mensagem", url: "./#inbox", tag: "inbox-c1", badge: 1, renotificar: true };
const guardado = async (c) => { const r = await (await c.open("rac-dados")).match(DESTINO); return r ? JSON.parse(await r.text()) : null; };

test("RAC FECHADO: o toque no aviso do Inbox abre uma janela já em #inbox e guarda o destino (reserva para o iPhone que abre o início)", async () => {
  const a = sw(), n = await a.push(AVISO_INBOX);
  assert.equal(n.data.url, "./#inbox"); await a.tocar(n.data);
  assert.deepEqual([...a.abertas], [SITE + "#inbox"], "abre a janela no endereço do Inbox"); const g = await guardado(a.caches); assert.equal(g.url, SITE + "#inbox"); assert.ok(g.quando > 0);
});

test("RAC EM SEGUNDO PLANO e ABERTO: reutiliza a janela (foco + aviso à página + navegação só de hash); nunca abre outra", async () => {
  const log = [], bg = janela({ url: SITE + "#agenda", visivel: false, log }), a = sw({ janelas: [bg] }); a.log = log;
  const n = await a.push(AVISO_INBOX); await a.tocar(n.data);
  assert.deepEqual([...a.abertas], []); assert.deepEqual(JSON.parse(JSON.stringify(bg.recebidas)), [{ tipo: "rac-abrir", url: SITE + "#inbox" }]); assert.ok(log.includes("foco")); assert.deepEqual([...bg.navegou], [SITE + "#inbox"], "mesmo documento: só troca o #");
  assert.ok((await guardado(a.caches)).url.endsWith("#inbox"));
  const log2 = [], aberta = janela({ url: SITE + "#inbox", focused: true, log: log2 }), b = sw({ janelas: [aberta] }); await b.tocar((await b.push(AVISO_INBOX)).data);
  assert.deepEqual([...aberta.navegou], [], "já está no Inbox: não navega de novo"); assert.equal(aberta.recebidas.length, 1); assert.deepEqual([...b.abertas], []);
});

test("destino #inbox preservado e só do site: aviso com URL relativa, absoluta ou de outro site", () => {
  for (const u of ["./#inbox", SITE + "#inbox", SITE + "index.html#inbox"]) assert.equal(N.notifHash(u, SITE), "#inbox", u);
  assert.equal(N.notifHash("https://outro.example/#inbox", SITE), "", "outro site nunca");
  const app = ler("js/app.js"); assert.match(app, /function notifIr\(url\)\{var hs=NUCLEO\.notifHash\(url,location\.href\);if\(hs&&location\.hash!==hs\)location\.hash=hs;return !!hs\}/);
});

/* ---------- o roteador: o destino fica no endereço até haver papel; só então navega ---------- */
test("roteador: sem papel/sessão não navega (o #inbox continua no endereço); iniciar() chama route() com papel e só depois aplica o destino guardado; hashchange também chama route()", () => {
  const app = ler("js/app.js");
  assert.match(app, /function route\(\)\{\s*if\(!PAPEL\)return;/); assert.match(app, /window\.addEventListener\("hashchange",route\)/);
  assert.match(app, /route\(\);notifPendente\(true\);notifDiag\(\)\}/, "route() antes de notifPendente(true)");
  assert.match(app, /parts=\(location\.hash\|\|""\)\.replace\("#",""\)\.split\("\/"\)/, "o destino vem do endereço");
  const rotas = ler("js/rotas.js"); assert.match(rotas, /id:"inbox"[^\n]*mods:\["inbox"\][^\n]*abrir:function\(p\)\{renderInbox\(p\[1\],p\[2\],p\[3\],p\.refresh\)\}/);
  assert.match(ler("js/inbox.js"), /function renderInbox\(conta,pasta,msg,refresh\)/); assert.match(app, /inbox:\["kit","inbox-servico"\]/);
});

/* ---------- o carregador de módulos (trecho REAL de js/app.js) ---------- */
function carregador({ falhas = {}, online = true } = {}) {
  const app = ler("js/app.js"), trecho = app.slice(app.indexOf("  var MOD_TENTATIVAS=3;"), app.indexOf("  function precisa(l)"));
  const pedidos = [], temporizadores = [], tentativasPorModulo = {};
  const document = { createElement: () => ({}), head: { appendChild(s) { pedidos.push(s.src); const m = /js\/([a-z-]+)\.js/.exec(s.src)[1]; tentativasPorModulo[m] = (tentativasPorModulo[m] || 0) + 1; Promise.resolve().then(() => (tentativasPorModulo[m] <= (falhas[m] ?? 0) ? s.onerror() : s.onload())); } } };
  const ctx = { MOD_VERSAO: "V", MODULOS: {}, MOD_OK: {}, MOD_DEPS: { inbox: ["kit", "inbox-servico"], agenda: ["sistema", "kit", "graficos"] }, document, navigator: { onLine: online }, setTimeout: (f) => { temporizadores.push(1); f(); }, Promise, Error };
  vm.runInNewContext(trecho + "\nthis.modulo=modulo;", ctx); return { ctx, pedidos, temporizadores, tentativasPorModulo };
}

test("módulo que falha UMA vez: tenta de novo (com &t=) e abre; as dependências carregam antes; o módulo fica carregado", async () => {
  const c = carregador({ falhas: { inbox: 1 } }); await c.ctx.modulo("inbox");
  assert.ok(c.pedidos.indexOf("js/inbox.js?v=V") > c.pedidos.indexOf("js/kit.js?v=V") && c.pedidos.at(-1) === "js/inbox.js?v=V&t=1"); assert.equal(c.ctx.MOD_OK.inbox, 1); assert.equal(c.temporizadores.length, 1);
});

test("módulo que falha sempre: erro IDENTIFICÁVEL (codigo, modulo, online, tentativas), 3 tentativas, e a próxima chamada tenta de novo (nada fica preso); online=false diz 'sem internet'", async () => {
  const c = carregador({ falhas: { inbox: 99 } });
  const e = await c.ctx.modulo("inbox").then(() => null, (x) => x);
  assert.deepEqual([e.codigo, e.modulo, e.online, e.tentativas], ["modulo_indisponivel", "inbox", true, 3]); assert.equal(c.tentativasPorModulo.inbox, 3);
  assert.match(e.message, /^não consegui carregar a seção inbox \(o arquivo não chegou, mesmo com a conexão ativa/); assert.ok(!/sem internet/.test(e.message), "com a conexão ativa NÃO diz 'sem internet'");
  c.ctx.MODULOS = c.ctx.MODULOS; assert.equal(c.ctx.MODULOS.inbox, undefined, "o módulo falho sai do registro: o botão 'Tentar de novo' pede outra vez");
  const off = carregador({ falhas: { inbox: 99 }, online: false }); const eo = await off.ctx.modulo("inbox").then(() => null, (x) => x); assert.equal(eo.online, false); assert.match(eo.message, /\(sem internet\)$/);
  const dep = carregador({ falhas: { kit: 99 } }); const ed = await dep.ctx.modulo("inbox").then(() => null, (x) => x); assert.equal(ed.modulo, "kit", "o erro nomeia a dependência que falhou, não o módulo que a pediu");
});

test("outras rotas continuam: o mesmo carregador abre Agenda (3 dependências em ordem) e módulos simples; falha de um não afeta outro; botão 'Tentar de novo' refaz a rota", async () => {
  const c = carregador(); await Promise.all([c.ctx.modulo("agenda"), c.ctx.modulo("inbox")]);
  for (const m of ["sistema", "kit", "graficos", "agenda", "inbox-servico", "inbox"]) assert.equal(c.ctx.MOD_OK[m], 1, m); assert.equal(c.pedidos.filter((p) => p.startsWith("js/kit.js")).length, 1, "dependência compartilhada carrega uma vez");
  const app = ler("js/app.js"), f = app.slice(app.indexOf("  function rotaFalhou(top,e){"), app.indexOf("  function route(){"));
  const filhos = []; let refez = 0; const botoes = [];
  const h = (tag, at, ...fi) => { const e = { tag, at, fi, parentNode: null, removeu: false }; fi.forEach((x) => x && typeof x === "object" && (x.parentNode = e)); if (tag === "button") botoes.push(e); return e; };
  const v = { insertBefore(p) { filhos.push(p); p.parentNode = { removeChild(x) { x.removeu = true; } }; }, firstChild: null };
  const ctx = { h, tabs: ["inicio", "inbox"], document: { querySelector: () => v, getElementById: () => ({}) }, route: () => { refez++; } };
  vm.runInNewContext(f + "\nthis.rotaFalhou=rotaFalhou;", ctx); ctx.rotaFalhou("inbox", { message: "não consegui carregar a seção inbox (x)" });
  assert.equal(filhos.length, 1); assert.match(filhos[0].fi[0].at.text, /Não consegui abrir esta seção agora \(não consegui carregar a seção inbox/); botoes[0].onclick(); assert.equal(refez, 1); assert.ok(filhos[0].removeu);
});

test("todas as rotas: cada módulo declarado existe como arquivo, está no SHELL do sw.js e as dependências também (nenhuma rota perdeu o carregamento)", () => {
  const rotas = ler("js/rotas.js"), sw = ler("sw.js"), app = ler("js/app.js"), deps = JSON.parse("{" + /var MOD_DEPS=\{([\s\S]*?)\};/.exec(app)[1].replace(/([{,]\s*)([A-Za-z-]+):/g, '$1"$2":').replace(/\s+/g, " ") + "}");
  const mods = new Set([...rotas.matchAll(/mods:\[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/"([a-z-]+)"/g)].map((x) => x[1])));
  for (const m of [...mods, ...Object.values(deps).flat()]) { assert.ok(fs.existsSync(new URL("../js/" + m + ".js", import.meta.url)) || fs.existsSync(new URL("../" + m + ".js", import.meta.url)), m + " existe"); assert.ok(sw.includes(`"./js/${m}.js"`) || sw.includes(`"./${m}.js"`), m + " no SHELL"); }
  assert.ok(mods.has("inbox"));
});

/* ---------- a causa provada: erro da rede não pode esconder a cópia guardada ---------- */
test("sw.js: rede respondendo ERRO (503/429/404) devolve a cópia guardada do arquivo; sem cópia o erro segue; 200 guarda; redirecionamento e queda de rede como antes", async () => {
  const URL_JS = SITE + "js/inbox.js?v=2026-11-15.6";
  for (const st of [503, 429, 404, 500]) {
    const a = sw({ caches: cachesFalsos({ [SITE + "js/inbox.js"]: new Response("// inbox v-guardada", { status: 200 }) }), fetchFn: async () => new Response("erro", { status: st }) }), r = await a.pedir(URL_JS);
    assert.equal(r.status, 200, "status " + st + ": a cópia guardada vence a página de erro"); assert.match(await r.text(), /v-guardada/);
  }
  const sem = sw({ fetchFn: async () => new Response("erro", { status: 503 }) }); assert.equal((await sem.pedir(URL_JS)).status, 503, "sem cópia o erro segue como veio");
  const ok = sw({ fetchFn: async () => new Response("novo", { status: 200 }) }); assert.equal(await (await ok.pedir(URL_JS)).text(), "novo"); await espera();
  const caiu = sw({ caches: cachesFalsos({ [SITE + "js/inbox.js"]: new Response("// guardada") }), fetchFn: async () => { throw new TypeError("net"); } }); assert.match(await (await caiu.pedir(URL_JS)).text(), /guardada/, "queda de rede: cópia (como antes)");
  const redir = sw({ fetchFn: async () => ({ ok: false, status: 0, type: "opaqueredirect" }) }); assert.equal((await redir.pedir(SITE, "navigate")).type, "opaqueredirect", "redirecionamento passa como veio");
});

test("versões: VERSAO (sw.js) = MOD_VERSAO (app.js) = ?v= do index.html = 2026-11-22.6", () => {
  assert.match(ler("sw.js"), /const VERSAO = "2026-11-22\.6"/); assert.match(ler("js/app.js"), /MOD_VERSAO="2026-11-22\.6"/); assert.ok(ler("index.html").includes("2026-11-22.6"));
});

/* ---------- aviso de e-mail: título = assunto, corpo = remetente, toque abre a MENSAGEM ---------- */
const CONTA_ID = "aaaaaaaa-0000-4000-8000-000000000001", PASTA_ID = "bbbbbbbb-0000-4000-8000-000000000001", M1 = "dddddddd-0000-4000-8000-000000000001", M2 = "dddddddd-0000-4000-8000-000000000002";
const alvoMsg = (id) => "#inbox/" + CONTA_ID + "/" + PASTA_ID + "/" + id;
const avisoMsg = (id, assunto, corpo) => ({ titulo: assunto, corpo, url: "./" + alvoMsg(id), tag: "inbox-msg-" + id, badge: 2, renotificar: true });

test("a notificação mostra o assunto (título) e o remetente (corpo) enviados pelo servidor, com tag por mensagem; o destino #inbox/conta/pasta/mensagem passa pelo notifHash intacto", async () => {
  const a = sw(), n = await a.push(avisoMsg(M1, "Nota fiscal da compra", "João Silva — exemplo@email.com"));
  assert.deepEqual([n.titulo, n.body, n.tag, n.renotify, n.data.url], ["Nota fiscal da compra", "João Silva — exemplo@email.com", "inbox-msg-" + M1, true, "./" + alvoMsg(M1)]);
  assert.equal(N.notifHash(n.data.url, SITE), alvoMsg(M1), "o hash com o ID da mensagem é preservado"); assert.equal(N.notifHash("https://outro.example/" + alvoMsg(M1), SITE), "", "outro site nunca");
});

test("RAC FECHADO: cada notificação abre uma janela já na mensagem dela (destino guardado também); duas notificações = dois destinos diferentes", async () => {
  const a = sw(), n1 = await a.push(avisoMsg(M1, "Assunto 1", "A — a@x.co")), n2 = await a.push(avisoMsg(M2, "Assunto 2", "B — b@x.co"));
  await a.tocar(n1.data); assert.deepEqual([...a.abertas], [SITE + alvoMsg(M1)]); assert.equal((await guardado(a.caches)).url, SITE + alvoMsg(M1));
  await a.tocar(n2.data); assert.deepEqual([...a.abertas], [SITE + alvoMsg(M1), SITE + alvoMsg(M2)]); assert.equal((await guardado(a.caches)).url, SITE + alvoMsg(M2), "o destino guardado é o da última notificação tocada, não o da primeira");
});

test("RAC EM SEGUNDO PLANO e JÁ ABERTO: a janela é reutilizada e recebe o destino da mensagem tocada (mensagem certa em cada toque); nunca abre outra janela", async () => {
  const log = [], j = janela({ url: SITE + "#inbox/" + CONTA_ID + "/" + PASTA_ID, visivel: false, log }), a = sw({ janelas: [j] });
  const n1 = await a.push(avisoMsg(M1, "Assunto 1", "A — a@x.co")), n2 = await a.push(avisoMsg(M2, "Assunto 2", "B — b@x.co"));
  await a.tocar(n2.data); await a.tocar(n1.data);
  assert.deepEqual(JSON.parse(JSON.stringify(j.recebidas)), [{ tipo: "rac-abrir", url: SITE + alvoMsg(M2) }, { tipo: "rac-abrir", url: SITE + alvoMsg(M1) }], "cada toque leva à sua mensagem, na ordem em que foi tocado"); assert.deepEqual([...a.abertas], []);
  const log2 = [], aberta = janela({ url: SITE + alvoMsg(M1), focused: true, log: log2 }), b = sw({ janelas: [aberta] }); await b.tocar((await b.push(avisoMsg(M1, "Assunto 1", "A"))).data);
  assert.deepEqual([...aberta.navegou], [], "já está nesse endereço: não navega de novo"); assert.equal(aberta.recebidas.length, 1);
});

test("página: o aviso recebido leva ao hash da mensagem (notifIr) e o roteador entrega conta, pasta e mensagem ao Inbox (rotas.js → renderInbox)", () => {
  const rotas = ler("js/rotas.js"); assert.match(rotas, /renderInbox\(p\[1\],p\[2\],p\[3\],p\.refresh\)/);
  const app = ler("js/app.js"); assert.match(app, /function notifIr\(url\)\{var hs=NUCLEO\.notifHash\(url,location\.href\);if\(hs&&location\.hash!==hs\)location\.hash=hs;return !!hs\}/);
  const inbox = ler("js/inbox.js"); assert.match(inbox, /function renderInbox\(conta,pasta,msg,refresh\)/); assert.match(inbox, /INB_RE_ID\.test\(msg\|\|""\)/); assert.match(inbox, /inboxAbrirMsg\(m\.id\)/);
});


test("iPhone: a barra inferior e os botões flutuantes têm camada própria; a lista do Inbox recorta sem virar camada rolável; versão 2026-11-22.6", () => {
  const css = ler("css/rac.css");
  assert.match(css, /html\.logado:not\(\.casa\) #barra,\.voltarbtn,\.topobtn,\.capbtn\{-webkit-transform:translate3d\(0,0,0\);transform:translate3d\(0,0,0\)/);
  assert.match(css, /\.inb-linhas\{[^}]*overflow:hidden;overflow:clip/);
  assert.match(css, /html\.logado:not\(\.casa\) #barra\{display:flex;position:fixed;left:0;right:0;bottom:0/, "a barra continua fixa embaixo");
  for (const f of ["sw.js", "js/app.js", "index.html"]) assert.ok(ler(f).includes("2026-11-22.6"), f);
});

/* ---------- confirmação da página (rac-ack) e reserva do service worker ---------- */
const diagDe = async (c) => { const r = await (await c.open("rac-dados")).match(SITE + "__rac-diag"); return r ? JSON.parse(await r.text()) : null; };

test("página confirma (rac-ack): nenhuma reserva, nenhuma janela nova, diagnóstico com ack=true e sem erros", async () => {
  const log = [], j = janela({ url: SITE + "#inicio", focused: true, log }), a = sw({ janelas: [j] });
  await a.tocar((await a.push(avisoMsg(M1, "Assunto", "A — a@x.co"))).data);
  assert.deepEqual([...a.abertas], []); const d = await diagDe(a.caches); assert.deepEqual([d.ack, d.caminho, d.clientes, d.erros.length], [true, "janela", 1, 0]);
});

test("página NÃO confirma (congelada ou sem o ouvinte): em 1,5 s o service worker navega a janela até o destino; sem navigate, abre janela nova; o diagnóstico registra", { timeout: 15000 }, async () => {
  const log = [], j = janela({ url: SITE + "#inicio", focused: true, log }), a = sw({ janelas: [j], responde: false });
  const t0 = Date.now(); await a.tocar((await a.push(avisoMsg(M1, "Assunto", "A"))).data);
  assert.ok(Date.now() - t0 >= 1400, "esperou a confirmação"); assert.ok(j.navegou.includes(SITE + alvoMsg(M1)), "navegou a janela ao destino da mensagem");
  const d = await diagDe(a.caches); assert.deepEqual([d.ack, d.caminho], [false, "janela+reserva"]);
  const j2 = janela({ url: SITE + "#inicio", focused: true, log: [] }); delete j2.navigate; const b = sw({ janelas: [j2], responde: false });
  await b.tocar((await b.push(avisoMsg(M2, "Assunto 2", "B"))).data);
  assert.deepEqual([...b.abertas], [SITE + alvoMsg(M2)], "sem navigate: janela nova no destino"); assert.equal((await diagDe(b.caches)).caminho, "janela+openWindow");
  const j3 = janela({ url: SITE + "#inicio", focused: true, log: [] }); j3.navigate = () => Promise.reject(new TypeError("nao controlada")); const c = sw({ janelas: [j3], responde: false });
  await c.tocar((await c.push(avisoMsg(M2, "x", "y"))).data); assert.deepEqual([...c.abertas], [SITE + alvoMsg(M2)], "navigate falhou: janela nova"); assert.ok((await diagDe(c.caches)).erros.length >= 1);
});

test("página: responde rac-ack ao aviso, registra o RESULTADO da abertura (notifAbriu) e só loga o diagnóstico do toque quando a mensagem não chegou a abrir", () => {
  const app = ler("js/app.js");
  assert.match(app, /notifIr\(d\.url\);notifPendente\(false\);try\{if\(ev\.source&&ev\.source\.postMessage\)ev\.source\.postMessage\(\{tipo:"rac-ack"\}\)\}catch\(e\)\{\}/);
  assert.match(app, /function notifAbriu\(ok,motivo\)/); assert.match(app, /function notifDiag\(\)/); assert.match(app, /falhou=\(a&&a\.ok===false\)\|\|\(d\.erros&&d\.erros\.length\)\|\|\(d\.ack===false&&!\(a&&a\.ok\)\)/);
  assert.match(app, /voltaFoco[\s\S]*?notifPendente\(true\);notifDiag\(\);/);
  assert.match(ler("js/inbox.js"), /inboxAvisoResultado\(false,"mensagem_ausente"\)/); assert.match(ler("js/inbox.js"), /inboxAvisoResultado\(INBX\.msg===m\.id/);
});

