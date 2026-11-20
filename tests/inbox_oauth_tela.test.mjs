// RAC Inbox · I4 · interface da conexão OAuth (Gmail/Outlook) e o retorno do provedor. DOM de mentira, serviço de mentira: nada vai ao Google nem à Microsoft. TUDO FICTÍCIO.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { lerArq } from "./_rotas.mjs";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;

class No {
  constructor(tag) { this.tag = tag; this.filhos = []; this.attrs = {}; this.className = ""; this.textContent = ""; this.onclick = null; this.value = ""; }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return this.attrs[k] ?? null; } removeAttribute(k) { delete this.attrs[k]; }
  appendChild(c) { this.filhos.push(c); return c; } get lastChild() { return this.filhos[this.filhos.length - 1]; }
  set innerHTML(_) { this.filhos = []; this.textContent = ""; }
  get id() { return this.attrs.id; }
}
const todos = (n, f = []) => { f.push(n); (n.filhos || []).forEach((c) => todos(c, f)); return f; };
const texto = (n) => (n.textContent || "") + " " + (n.filhos || []).map(texto).join(" ");
const comClasse = (raiz, c) => todos(raiz).filter((n) => (" " + n.className + " ").includes(" " + c + " "));
const botao = (raiz, t) => todos(raiz).find((n) => n.tag === "button" && texto(n).replace(/\s+/g, " ").trim() === t);
const sincBtn = (raiz) => comClasse(raiz, "inb-topo-sinc")[0];   // o ícone de sincronizar no topo da lista (conexão em ordem: é o único controle visível)
const opcoes = (raiz) => { const b = comClasse(raiz, "inb-conexao-mais")[0]; if (b && b.attrs["aria-expanded"] !== "true") b.onclick(); };   // abre "Opções da conexão" (testar, substituir, desconectar)
const esperar = () => new Promise((r) => setTimeout(r, 0));
const UUID = "11111111-1111-4111-8111-111111111111", SENHA_APP = "abcd-efgh-ijkl-mnop";

/* o ambiente: h() como o da base, o kit real, o núcleo real, um banco de mentira que REGISTRA toda gravação, e "precisa" que carrega módulos de verdade */
function ambiente({ dono = true, contas = [], pastas = [], credenciais = [], mensagens = [], sincs = [], erroMsgs = false, erroLeitura = null, erroGravar = null, publicado = true, invoke = null } = {}) {
  const raiz = new No("div"), titulo = new No("h1"), gravacoes = [], lidas = [], chamadas = [];
  const doc = { createElement: (t) => new No(t), createTextNode: (t) => { const n = new No("#texto"); n.textContent = t; return n; }, getElementById: (id) => (id === "inbox-view" ? raiz : todos(raiz).find((n) => n.attrs && n.attrs.id === id) || null) };
  const tabela = (t) => { const q = { _acao: "ler", select() { return q; }, order() { return q; }, limit() { return q; }, insert(l) { q._acao = "insert"; q._l = l; gravacoes.push([t, "insert", l]); return q; },
    update(l) { gravacoes.push([t, "update", l]); return q; }, eq(c, v) { q._eq = [c, v]; return q; }, delete() { gravacoes.push([t, "delete"]); return q; }, upsert(l) { gravacoes.push([t, "upsert", l]); return q; },
    then(ok, er) { lidas.push(t); const dados = t === "inbox_contas" ? contas : t === "inbox_credenciais" ? credenciais : t === "inbox_mensagens_ref" ? mensagens : t === "inbox_sincronizacao" ? sincs : pastas;
      const r = erroMsgs && t === "inbox_mensagens_ref" ? { data: null, error: { code: "42703", message: 'column "recebida_em" does not exist' } } : q._acao === "insert" ? { data: erroGravar ? null : [{ id: "novo" }], error: erroGravar } : (erroLeitura && t !== "inbox_credenciais" ? { data: null, error: erroLeitura } : { data: q._eq ? dados.filter((x) => x[q._eq[0]] === q._eq[1]) : dados, error: null }); return Promise.resolve(r).then(ok, er); } }; return q; };
  const ctx = { console, Promise, Object, Array, JSON, String, Date, Math, Number, setTimeout, NUCLEO: N, document: doc, isOwner: () => dono, $: () => titulo, confirm: () => true,
    sbOk: (r) => { if (r.error) throw r.error; return r.data; }, SB: { from: tabela, functions: { invoke: (nome, o) => { chamadas.push([nome, JSON.parse(JSON.stringify(o))]); return Promise.resolve(invoke ? invoke(nome, o) : { data: { ok: true, credencial: "guardada" }, error: null }); } } }, racDica: { ligar() {}, em() {} },
    precisa: (l) => Promise.all(l.map((m) => { vm.runInContext(fs.readFileSync(new URL(`../js/${m}.js`, import.meta.url), "utf8"), ctx, { filename: `js/${m}.js` }); })) };
  ctx.window = ctx; vm.createContext(ctx);
  ctx.h = (tag, attrs, ...filhos) => { const e = doc.createElement(tag); if (attrs) Object.keys(attrs).forEach((k) => { const v = attrs[k]; if (v === undefined || v === null || v === false) return; if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else e.setAttribute(k, v); });
    const add = (c) => { if (c === null || c === undefined || c === false) return; if (Array.isArray(c)) { c.forEach(add); return; } e.appendChild(typeof c === "string" || typeof c === "number" ? doc.createTextNode(String(c)) : c); }; filhos.forEach(add); return e; };
  for (const a of ["js/graficos.js", "js/kit.js", "js/inbox-servico.js", "js/inbox.js"]) vm.runInContext(lerArq(a), ctx, { filename: a });
  vm.runInContext("INBS.publicado=" + (publicado ? "true" : "false"), ctx);
  return { ctx, raiz, titulo, gravacoes, lidas, chamadas, abrir: async (...a) => { await ctx.renderInbox(...a); } };
}


const assentar = async () => { for (let i = 0; i < 14; i++) await esperar(); };
const G1 = "aaaaaaaa-0000-4000-8000-000000000001", G2 = "aaaaaaaa-0000-4000-8000-000000000002", O1 = "aaaaaaaa-0000-4000-8000-000000000003";
const STATE = "S".repeat(43), CODE = "4/0AeaYSHcodigo-ficticio-0123456789";
const CONTAS = [{ id: G1, apelido: "Rayner Carvalho", endereco: "rayner@gmail.example", estado: "nova", provedor: "gmail" }, { id: G2, apelido: "Raynim Carvalho", endereco: "raynim@gmail.example", estado: "nova", provedor: "gmail" }, { id: O1, apelido: "Outlook", endereco: "eu@outlook.example", estado: "nova", provedor: "outlook" }];
function amb(o = {}) {
  const a = ambiente({ contas: CONTAS, credenciais: [], pastas: [], mensagens: [], sincs: [], ...o }), destinos = [];
  a.ctx.location = { assign: (u) => destinos.push(u) }; a.destinos = destinos; return a;
}
const ger = (a) => todos(a.raiz).find((n) => n.tag === "button" && texto(n).replace(/\s+/g, " ").trim() === "Gerenciar contas").onclick();   /* a conexão mora em Gerenciar contas */
const rot = (a, t) => todos(a.raiz).filter((n) => n.tag === "button" && texto(n).replace(/\s+/g, " ").trim() === t);

test("conta Gmail/Outlook: a conexão é por OAuth (Conectar com Google/Microsoft), sem campo de senha, e o cadastro aceita os dois provedores", async () => {
  const a = amb(); await a.abrir(G1); await assentar(); ger(a);
  assert.ok(rot(a, "Conectar com Google").length, "botão do Google"); assert.match(texto(a.raiz), /O RAC nunca vê a sua senha/); assert.ok(!todos(a.raiz).some((n) => n.tag === "input" && /senha/i.test(n.attrs.id || n.attrs.name || "")), "nenhum campo de senha");
  const b = amb(); await b.abrir(O1); await assentar(); ger(b); assert.ok(rot(b, "Conectar com Microsoft").length);
  assert.deepEqual(b.gravacoes, [], "abrir a tela não grava nada");
});

test("Conectar com Google: pede a URL ao serviço (só a conta_id), vai ao provedor e não grava nada; erro vira texto fixo; URL de outro destino é recusada", async () => {
  const a = amb({ invoke: (n, o) => ({ data: { ok: true, provedor: "gmail", url: "https://accounts.google.com/o/oauth2/v2/auth?state=" + STATE }, error: null }) }); await a.abrir(G1); await assentar(); ger(a);
  rot(a, "Conectar com Google")[0].onclick(); await assentar();
  assert.deepEqual(a.chamadas.map((c) => c[1].body), [{ operacao: "oauth_iniciar", conta_id: G1 }]); assert.deepEqual(a.destinos, ["https://accounts.google.com/o/oauth2/v2/auth?state=" + STATE]); assert.deepEqual(a.gravacoes, []);
  const m = amb({ invoke: () => ({ data: { ok: true, provedor: "gmail", url: "https://evil.example/login" }, error: null }) }); await m.abrir(G1); await assentar(); ger(m); rot(m, "Conectar com Google")[0].onclick(); await assentar();
  assert.deepEqual(m.destinos, [], "só URLs do Google e da Microsoft"); assert.match(texto(m.raiz), /não reconhece/);
  const e = amb({ invoke: () => ({ data: null, error: { context: { status: 503, json: () => Promise.resolve({ ok: false, erro: "oauth_nao_configurado" }) } } }) }); await e.abrir(G1); await assentar(); ger(e); rot(e, "Conectar com Google")[0].onclick(); await assentar();
  assert.match(texto(e.raiz), /ainda não foi configurada no servidor/); assert.deepEqual(e.destinos, []);
});

test("retorno do provedor: o código é entregue UMA vez ao serviço (state + code), a tela confirma e relê; cancelamento e erro viram aviso; o código não fica na memória", async () => {
  const a = amb({ credenciais: [{ conta_id: G1, estado: "ativa" }], invoke: () => ({ data: { ok: true, conectada: true, provedor: "gmail" }, error: null }) });
  a.ctx.OAUTH_RETORNO = { state: STATE, code: CODE, erro: "" }; await a.abrir(G1); await assentar(); ger(a);
  assert.deepEqual(a.chamadas.map((c) => c[1].body), [{ operacao: "oauth_concluir", state: STATE, code: CODE }]); assert.match(texto(a.raiz), /Conta conectada/); assert.equal(a.ctx.OAUTH_RETORNO, null, "uso único");
  await a.abrir(G1); await assentar(); ger(a); assert.equal(a.chamadas.length, 1, "entrar de novo não reenvia o código");
  const c = amb(); c.ctx.OAUTH_RETORNO = { state: STATE, code: "", erro: "recusado" }; await c.abrir(G1); await assentar(); ger(c); assert.match(texto(c.raiz), /cancelada ou recusada/); assert.equal(c.chamadas.length, 0, "cancelado: nada é enviado");
  const f = amb({ invoke: () => ({ data: null, error: { context: { status: 409, json: () => Promise.resolve({ ok: false, erro: "oauth_conta_divergente" }) } } }) }); f.ctx.OAUTH_RETORNO = { state: STATE, code: CODE, erro: "" }; await f.abrir(G1); await assentar(); ger(f);
  assert.match(texto(f.raiz), /não é a cadastrada/); assert.ok(!texto(f.raiz).includes(CODE), "o código nunca aparece na tela");
});

test("conta Gmail conectada: a tela oferece Sincronizar, Reconectar e Desconectar e avisa que enviar/organizar ainda não existem; Outlook conectado continua sem leitura e sem Sincronizar", async () => {
  const a = amb({ credenciais: [{ conta_id: G1, estado: "ativa" }] }); await a.abrir(G1); await assentar(); const sincA = sincBtnOuNada(a); ger(a);
  assert.match(texto(a.raiz), /Toque em Sincronizar para trazer as mensagens/); assert.ok(rot(a, "Reconectar com Google").length && rot(a, "Desconectar").length); assert.ok(sincA, "Gmail sincroniza (ícone do topo da lista)");
  const o = amb({ credenciais: [{ conta_id: O1, estado: "ativa" }] }); await o.abrir(O1); await assentar(); const sincO = sincBtnOuNada(o); ger(o);
  assert.match(texto(o.raiz), /leitura de mensagens deste provedor ainda não foi liberada/); assert.ok(!sincO && !rot(o, "Sincronizar").length, "sem botão de sincronizar para provedor sem leitura");
});
const sincBtnOuNada = (a) => todos(a.raiz).some((n) => /inb-topo-sinc/.test(n.className || "") && !n.attrs.disabled);

test("Gmail na tela: Nova mensagem e as ações de organizar ficam desligadas (o servidor responderia provedor_sem_operacao); nenhuma chamada de escrita sai", async () => {
  const a = amb({ credenciais: [{ conta_id: G1, estado: "ativa" }], invoke: () => ({ data: { ok: true }, error: null }) }); await a.abrir(G1); await assentar(); ger(a);
  const c = a.ctx; assert.equal(vm.runInContext("inboxPodeEnviar()", c), false, "não envia a partir de conta Gmail"); assert.equal(vm.runInContext("!!inboxContaDeEnvio()", c), false);
  assert.deepEqual(a.chamadas, [], "abrir a conta não chama nada");
});

test("cartão do Início: contas Gmail/Outlook do Inbox aparecem separadas — Gmail conectado tem Atualizar; sem conexão e Outlook não; a identidade antiga não duplica", async () => {
  const a = amb({ credenciais: [{ conta_id: G2, estado: "ativa" }] }), alvo = new No("div");
  a.ctx.inboxCartao(alvo, [{ n: "Rayner Carvalho", e: "rayner@gmail.example", u: "https://mail.google.com/mail/u/0/#inbox" }, { n: "Raynim Carvalho", e: "raynim@gmail.example", u: "https://mail.google.com/mail/u/1/#inbox" }]); await assentar();
  const els = comClasse(alvo, "inbc-conta"); assert.equal(els.length, 3, "as duas Gmail e a Outlook, sem repetir a identidade antiga (mesmo endereço)"); const t = (c) => texto(els.find((e) => e.attrs["data-conta"] === c)).replace(/\s+/g, " ");
  assert.match(t(G1), /Rayner Carvalho.*rayner@gmail\.example.*Sem conexão/); assert.match(t(G2), /Raynim Carvalho.*raynim@gmail\.example.*Nova.*Ainda não sincronizada/); assert.ok(!/sem leitura/.test(t(G2))); assert.match(t(O1), /Outlook.*eu@outlook\.example.*Sem conexão/);
  const atualizar = (c) => todos(els.find((e) => e.attrs["data-conta"] === c)).some((n) => n.tag === "button" && /Atualizar/.test(n.textContent));
  assert.deepEqual([atualizar(G1), atualizar(G2), atualizar(O1)], [false, true, false]); assert.ok(!/\d+ não lidas?/.test(texto(alvo)), "nenhum número inventado antes da primeira sincronização");
});

test("app.js: o retorno do OAuth limpa o endereço, guarda o código só em memória e ignora parâmetros fora do formato", () => {
  const app = lerArq("js/app.js"), ini = app.indexOf("var OAUTH_RETORNO=("), trecho = app.slice(ini, app.indexOf("var MOD_VERSAO=")), run = (search) => { const hist = []; const ctx = { URLSearchParams, location: { search, pathname: "/rac/" }, history: { replaceState: (...x) => hist.push(x) }, localStorage: { setItem() { throw new Error("não pode gravar"); } } }; vm.createContext(ctx); vm.runInContext(trecho + ";globalThis.__r=OAUTH_RETORNO", ctx); return { r: ctx.__r, hist }; };
  const ok = run(`?state=${STATE}&code=${CODE}`); assert.equal(JSON.stringify(ok.r), JSON.stringify({ state: STATE, code: CODE, erro: "" })); assert.equal(JSON.stringify(ok.hist), JSON.stringify([[null, "", "/rac/#inbox"]]), "a URL com o código sai do histórico");
  assert.equal(JSON.stringify(run(`?state=${STATE}&error=access_denied`).r), JSON.stringify({ state: STATE, code: "", erro: "recusado" }));
  for (const s of ["", "?code=" + CODE, "?state=curto&code=" + CODE, `?state=${STATE}`, `?state=${STATE}&code=curto`.replace("curto", "x y")]) { const x = run(s); assert.ok(x.r === null || x.r.code === "", s); }
  assert.equal(run("?state=curto&code=" + CODE).hist.length, 0, "parâmetro inválido não mexe no endereço");
  assert.ok(!/localStorage|sessionStorage/.test(trecho), "o código não vai ao armazenamento do navegador");
});

test("nenhum token, segredo ou client secret no site: js/ e nucleo.js não têm client secret nem armazenam token de Gmail/Outlook para o Inbox", () => {
  const inbox = lerArq("js/inbox.js"), srv = lerArq("js/inbox-servico.js");
  assert.ok(!/localStorage|sessionStorage|indexedDB/.test(srv) && !/rac-gm-|setItem/.test(inbox.slice(inbox.indexOf("function inboxOAuthIniciar"), inbox.indexOf("function inboxConexao(c)"))), "o fluxo OAuth do Inbox não grava nada no navegador");
  assert.ok(!/GOCSPX-|client_secret|clientSecret/.test(inbox + srv + lerArq("nucleo.js")), "nenhum client secret no site");
});
