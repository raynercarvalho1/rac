// RAC Inbox · menu do protótipo aprovado (Caixa unificada, Contas compactas, "Pastas (conta)" só da conta selecionada, Gerenciar contas no rodapé), Sincronizar sempre no cabeçalho e a área Gerenciar contas
// (uma linha por conta, ações por provedor, Sincronizar tudo). DOM de mentira, serviço de mentira. TUDO FICTÍCIO.
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
const IC = "11111111-1111-4111-8111-111111111111", G1 = "aaaaaaaa-0000-4000-8000-000000000001", G2 = "aaaaaaaa-0000-4000-8000-000000000002", OU = "aaaaaaaa-0000-4000-8000-000000000003";
const P = { ic: "bbbbbbbb-0000-4000-8000-000000000001", ic2: "bbbbbbbb-0000-4000-8000-000000000004", g1: "bbbbbbbb-0000-4000-8000-000000000002", g1b: "bbbbbbbb-0000-4000-8000-000000000005", g2: "bbbbbbbb-0000-4000-8000-000000000003", ou: "bbbbbbbb-0000-4000-8000-000000000006" };
const CONTAS = [{ id: IC, apelido: "iCloud", endereco: "eu@icloud.example", estado: "conectada", provedor: "icloud" }, { id: G1, apelido: "Rayner Carvalho", endereco: "rayner@gmail.example", estado: "conectada", provedor: "gmail" }, { id: G2, apelido: "Raynim", endereco: "raynim@gmail.example", estado: "conectada", provedor: "gmail" }];
const OUTLOOK = { id: OU, apelido: "Outlook", endereco: "eu@outlook.example", estado: "conectada", provedor: "outlook" };
const pasta = (id, conta, nome, uso, n) => ({ id, conta_id: conta, nome_externo: nome, nome_exibicao: nome, uso, total: 10, nao_lidas: n, ativa: true });
const PASTAS = [pasta(P.ic, IC, "Entrada iCloud", "entrada", 5), pasta(P.ic2, IC, "Enviados iCloud", "enviados", 0), pasta(P.g1, G1, "Entrada Rayner", "entrada", 3), pasta(P.g1b, G1, "Rascunhos Rayner", "rascunhos", 0), pasta(P.g2, G2, "Entrada Raynim", "entrada", 0), pasta(P.ou, OU, "Entrada Outlook", "entrada", 85)];
const SINC = [{ pasta_id: P.ic, ultima_ok_em: "2026-11-20T10:00:00Z", erro: null }, { pasta_id: P.g1, ultima_ok_em: "2026-11-20T10:05:00Z", erro: null }];
const CRED = [IC, G1, G2].map((c) => ({ conta_id: c, estado: "ativa" }));
const ok = (d) => ({ data: { ok: true, ...d }, error: null });
const SYNC_OK = () => ok({ sincronizacao: { tipo: "sem_mudanca", novas: 0, atualizadas: 0, removidas: 0 }, mensagens_na_pasta: 10, mais: false });
function amb(o = {}) { const a = ambiente({ contas: CONTAS, pastas: PASTAS, credenciais: CRED, sincs: SINC, mensagens: [], ...o }); a.ctx.location = { assign() {} }; return a; }
const bt = (a, t) => todos(a.raiz).find((n) => n.tag === "button" && texto(n).replace(/\s+/g, " ").trim() === t);
const btAria = (a, t) => todos(a.raiz).find((n) => n.tag === "button" && n.attrs["aria-label"] === t);
const ger = (a) => bt(a, "Gerenciar contas").onclick();
const lateral = (a) => comClasse(a.raiz, "inb-lateral")[0];
const unif = (a) => comClasse(a.raiz, "inb-unificada")[0];
const contaBtn = (a, id) => comClasse(lateral(a), "inb-conta").find((n) => n.attrs["data-conta"] === id);
const pastasMenu = (a) => comClasse(lateral(a), "inb-pasta").map((p) => texto(p).replace(/\s+/g, " ").trim());
const card = (a, id) => comClasse(a.raiz, "inb-gc").find((n) => n.attrs["data-conta"] === id);
const acoesDe = (n) => todos(n).filter((x) => x.tag === "button").map((x) => x.attrs["aria-label"]);
const tit = (a) => texto(comClasse(a.raiz, "inb-titulo")[0]).trim();
const sincHeader = (a) => comClasse(a.raiz, "inb-topo-sinc").filter((n) => !/inb-topo-sinc--tudo/.test(n.className))[0];

test("núcleo: ações por provedor, estado da conta e última sincronização — só o que está implementado (iCloud e Gmail leem e testam; Outlook só conecta e desconecta)", () => {
  const f = (prov, cred) => { const a = N.inbAcoesConta({ provedor: prov }, cred), r = {}; for (const k of ["sincronizar", "testar", "conectar", "reconectar", "desconectar"]) if (a[k]) r[k] = true; return Object.keys(r).join(","); };
  assert.equal(f("icloud", "ativa"), "sincronizar,testar,reconectar,desconectar"); assert.equal(f("gmail", "ativa"), "sincronizar,testar,reconectar,desconectar");
  assert.equal(f("outlook", "ativa"), "reconectar,desconectar", "Outlook ainda não lê: nada de sincronizar nem testar");
  for (const p of ["icloud", "gmail", "outlook"]) { assert.equal(f(p, "ausente"), "conectar", p); assert.equal(f(p, "invalida"), "reconectar,desconectar", p); }
  assert.equal(f("xyz", "ativa"), "", "provedor desconhecido não oferece nada");
  assert.deepEqual([[{ estado: "nova" }, "ativa"], [{ estado: "conectada" }, "ativa"], [{ estado: "sincronizando" }, "ativa"], [{ estado: "atrasada" }, "ativa"], [{ estado: "conectada" }, "ausente"], [{ estado: "conectada" }, "invalida"], [{ estado: "erro_autenticacao" }, "ativa"]].map(([c, k]) => N.inbEstadoConta(c, k).rotulo),
    ["Conectada", "Conectada", "Sincronizando", "Atrasada", "Sem conexão", "Erro de autenticação", "Erro de autenticação"]);
  const u = N.inbUltimaSync({ id: IC }, PASTAS, { [P.ic]: { ultima_ok_em: "2026-11-20T10:00:00Z", erro: null } }, "2026-11-20T12:00:00Z"); assert.match(u.frase, /^Sincronizada hoje às/); assert.equal(N.inbUltimaSync({ id: G2 }, PASTAS, {}).frase, "Ainda não sincronizada.");
});

test("menu (protótipo): Caixa unificada, título Contas, as três contas compactas (avatar, nome, endereço, não lidas, estado) e NENHUMA árvore de pastas quando nenhuma conta está selecionada", async () => {
  const a = amb(); await a.abrir(); await assentar(); const lat = lateral(a), t = texto(lat).replace(/\s+/g, " ");
  assert.match(t, /Caixa unificada 8/, "unificada soma as não lidas (5 + 3 + 0)"); assert.equal(comClasse(lat, "inb-subtit").map((n) => texto(n).trim()).join("|"), "Contas", "só o título Contas (sem pastas)");
  assert.equal(comClasse(lat, "inb-secao").length, 0, "Contas é um título, não uma seção recolhível"); assert.equal(comClasse(lat, "inb-exp").length, 0, "sem ▾/▸ por conta");
  assert.deepEqual(comClasse(lat, "inb-conta").map((c) => c.filhos[1].filhos[0].textContent).sort(), ["Rayner Carvalho", "Raynim", "iCloud"], "as três contas, cada uma uma vez");
  assert.deepEqual(pastasMenu(a), [], "nenhuma árvore de pastas ao abrir o menu"); assert.ok(/inb-item--ativo/.test(unif(a).className), "a Caixa unificada é a seleção");
  assert.match(texto(contaBtn(a, G1)), /Rayner Carvalho\s+rayner@gmail\.example\s*3/, "não lidas na linha da conta"); assert.ok(!/\b0\b/.test(texto(contaBtn(a, G2))), "sem não lidas não mostra zero");
  assert.ok(comClasse(contaBtn(a, G1), "inb-ponto")[0].attrs["aria-label"], "o estado tem palavra"); assert.ok(comClasse(contaBtn(a, G1), "inb-avatar").length === 1);
  assert.ok(bt(a, "Gerenciar contas") && !/Categorias/.test(t), "rodapé: Gerenciar contas; sem Categorias (protótipo)");
  const rod = comClasse(lat, "inb-lateral-rod")[0]; assert.ok(rod && todos(rod).includes(bt(a, "Gerenciar contas")), "Gerenciar contas fica no rodapé, separado da lista de contas e pastas"); assert.ok(!todos(comClasse(lat, "inb-contas")[0]).includes(bt(a, "Gerenciar contas")));
});

test("UMA conta expandida por vez: Rayner → só as pastas de Rayner; Raynim → recolhe Rayner e mostra só as de Raynim; Outlook (com pastas) idem; a Caixa unificada fecha tudo", async () => {
  const contas = [...CONTAS, OUTLOOK], a = amb({ contas, credenciais: [...CRED, { conta_id: OU, estado: "ativa" }] }); await a.abrir(); await assentar();
  const subtit = () => comClasse(lateral(a), "inb-subtit--pastas").map((n) => texto(n).trim());
  assert.deepEqual([pastasMenu(a), subtit()], [[], []]);
  contaBtn(a, G1).onclick(); assert.deepEqual(subtit(), ["Pastas (Rayner Carvalho)"]); assert.deepEqual(pastasMenu(a), ["Entrada Rayner 3", "Rascunhos Rayner 0"], "só as pastas de Rayner, com não lidas"); assert.equal(tit(a), "Rayner Carvalho");
  assert.ok(/inb-conta--sel/.test(contaBtn(a, G1).className) && contaBtn(a, G1).attrs["aria-current"] === "true", "indicação visual de seleção"); assert.ok(!/inb-item--ativo/.test(unif(a).className));
  contaBtn(a, G2).onclick(); assert.deepEqual(subtit(), ["Pastas (Raynim)"]); assert.deepEqual(pastasMenu(a), ["Entrada Raynim 0"], "recolheu Rayner e expandiu Raynim"); assert.ok(!/inb-conta--sel/.test(contaBtn(a, G1).className));
  contaBtn(a, OU).onclick(); assert.deepEqual(pastasMenu(a), ["Entrada Outlook 85"], "recolheu Raynim e expandiu Outlook"); assert.deepEqual(subtit(), ["Pastas (Outlook)"]);
  for (const id of [G1, G2, OU, IC, G1, OU]) { contaBtn(a, id).onclick(); assert.equal(comClasse(lateral(a), "inb-subtit--pastas").length, 1, "nunca duas árvores abertas"); assert.equal(comClasse(lateral(a), "inb-conta--sel").length, 1, "nunca duas contas selecionadas"); }
  comClasse(lateral(a), "inb-pasta")[0].onclick(); assert.equal(comClasse(lateral(a), "inb-subtit--pastas").length, 1, "navegar numa pasta mantém a mesma conta");
  unif(a).onclick(); assert.deepEqual(pastasMenu(a), [], "a Caixa unificada fecha a árvore"); assert.equal(tit(a), "Caixa de entrada"); assert.ok(/inb-item--ativo/.test(unif(a).className));
});

test("pastas: navegam, marcam a ativa, mantêm ícone/nome/não lidas; conta sem pastas explica; Gerenciar contas não mostra pastas", async () => {
  const a = amb(); await a.abrir(); await assentar(); contaBtn(a, IC).onclick();
  comClasse(lateral(a), "inb-pasta")[1].onclick(); assert.ok(comClasse(lateral(a), "inb-pasta").some((p) => /inb-item--ativo/.test(p.className) && /Enviados iCloud/.test(texto(p))), "a pasta ativa é marcada"); assert.equal(tit(a), "iCloud");
  assert.ok(comClasse(lateral(a), "inb-pasta").every((p) => comClasse(p, "inb-ico").length === 1), "cada pasta tem ícone");
  const b = amb({ pastas: [] }); await b.abrir(); await assentar(); contaBtn(b, G2).onclick(); assert.match(texto(lateral(b)), /As pastas aparecem na primeira sincronização/);
  ger(a); assert.deepEqual(pastasMenu(a), [], "em Gerenciar contas nenhuma conta está aberta no menu");
});

test("Sincronizar no cabeçalho: sempre à vista com a palavra; na Caixa unificada sincroniza as contas que leem; numa conta, só ela; ocupado trava o duplo toque; sucesso e erro dão feedback; Outlook inativo com explicação", async () => {
  const contas = [...CONTAS, OUTLOOK];
  let liberar; const lento = new Promise((r) => { liberar = r; });
  const a = amb({ contas, credenciais: [...CRED, { conta_id: OU, estado: "ativa" }], invoke: (n, o) => (o.body.operacao === "sincronizar_pasta" ? lento : ok({})) }); await a.abrir(); await assentar();
  const b = sincHeader(a); assert.ok(b && /Sincronizar/.test(texto(b)) && b.attrs["aria-label"] === "Sincronizar" && !b.attrs["aria-disabled"], "à vista, com o rótulo");
  b.onclick(); await esperar(); const ocup = sincHeader(a); assert.ok(ocup.attrs.disabled === "disabled" && ocup.attrs["aria-busy"] === "true" && /Sincronizando/.test(texto(ocup)), "estado visual de sincronização"); ocup.onclick && ocup.onclick(); await esperar();
  liberar(SYNC_OK()); await assentar();
  assert.deepEqual(a.chamadas.map((c) => [c[1].body.operacao, c[1].body.conta_id]).filter((x) => x[0] === "sincronizar_pasta").map((x) => x[1]).sort(), [IC, G1, G2].sort(), "unificada: todas as contas que leem, uma vez cada (sem Outlook, sem duplo toque)");
  assert.ok(!a.chamadas.some((c) => c[1].body.conta_id === OU), "o Outlook nunca é chamado"); assert.match(texto(a.raiz), /Sincroniz|sem mudança|Nenhuma|atualizad/i, "feedback de sucesso"); assert.ok(!sincHeader(a).attrs.disabled);
  a.chamadas.length = 0; contaBtn(a, G2).onclick(); sincHeader(a).onclick(); await assentar(); assert.deepEqual(a.chamadas.map((c) => [c[1].body.operacao, c[1].body.conta_id]).filter((x) => x[0] === "sincronizar_pasta"), [["sincronizar_pasta", G2]], "numa conta: só a selecionada");
  a.chamadas.length = 0; contaBtn(a, OU).onclick(); const so = sincHeader(a); assert.equal(so.attrs["aria-disabled"], "true", "Outlook: à vista mas inativo"); so.onclick(); assert.match(texto(a.raiz), /leitura de e-mails do Outlook/); assert.equal(a.chamadas.length, 0, "não tenta sincronizar provedor sem leitura");
  const e = amb({ invoke: () => ({ data: null, error: { context: { status: 502, json: () => Promise.resolve({ ok: false, erro: "servico_indisponivel" }) } } }) }); await e.abrir(); await assentar(); sincHeader(e).onclick(); await assentar(); assert.match(texto(e.raiz), /indisponível/, "feedback de erro");
});

test("Sincronizar no cabeçalho: na tela de mensagens não há cartão de conexão nem botões soltos; o botão fica à vista também numa conta Gmail e numa conta iCloud", async () => {
  for (const conta of [G1, IC, undefined]) {
    const a = amb({ invoke: SYNC_OK }); await a.abrir(conta); await assentar(); const t = texto(a.raiz);
    assert.ok(!/Autorização guardada|Testar conexão|Opções da conexão/.test(t) && comClasse(a.raiz, "inb-conexao").length === 0, String(conta)); assert.ok(sincHeader(a), String(conta) + ": Sincronizar à vista");
  }
});

test("cabeçalho da conta: subtítulo com o provedor e o estado ('● Gmail') à direita", async () => {
  const a = amb(); await a.abrir(G1); await assentar(); const tag = comClasse(a.raiz, "inb-prov-tag")[0]; assert.ok(tag && /Gmail/.test(texto(tag)) && tag.attrs.title === "Conectada");
  const b = amb(); await b.abrir(); await assentar(); assert.equal(comClasse(b.raiz, "inb-prov-tag").length, 0, "na Caixa unificada não há provedor");
});

test("Gerenciar contas (protótipo): uma linha por conta com logo, nome, endereço, provedor, estado e última sincronização; botões só do que o provedor implementa; Sincronizar tudo no cabeçalho", async () => {
  const contas = [...CONTAS, OUTLOOK];
  const a = amb({ contas, credenciais: [...CRED, { conta_id: OU, estado: "ativa" }] }); await a.abrir(); await assentar(); ger(a);
  assert.equal(comClasse(a.raiz, "inb-gc").length, 4); assert.equal(tit(a), "Gerenciar contas"); assert.ok(/inb-item--ativo/.test(todos(lateral(a)).find((n) => /inb-ger/.test(n.className || "")).className), "o item do menu fica marcado");
  const t = (id) => texto(card(a, id)).replace(/\s+/g, " ");
  assert.match(t(IC), /iCloud iCloud eu@icloud\.example.*Conectada.*Última sincronização: hoje às/); assert.match(t(G1), /Rayner Carvalho Gmail rayner@gmail\.example.*Conectada.*Última sincronização: hoje às/); assert.match(t(G2), /Raynim Gmail raynim@gmail\.example.*Conectada.*Última sincronização: ainda não houve/); assert.match(t(OU), /Outlook Outlook eu@outlook\.example.*Conectada.*Leitura de e-mails em breve/);
  assert.ok([IC, G1, G2, OU].every((c) => comClasse(card(a, c), "inb-logo").length === 1), "cada cartão tem o logo do provedor"); assert.ok(!/Última sincronização/.test(t(OU)));
  assert.deepEqual([IC, G1, G2, OU].map((c) => acoesDe(card(a, c))), [["Sincronizar", "Testar conexão", "Substituir senha", "Desconectar e remover a credencial", "Opções da conexão"], ["Sincronizar", "Testar conexão", "Reconectar com Google", "Desconectar"], ["Sincronizar", "Testar conexão", "Reconectar com Google", "Desconectar"], ["Reconectar com Microsoft", "Desconectar"]], "só as ações compatíveis com cada provedor");
  assert.ok(!acoesDe(card(a, OU)).some((x) => /Sincronizar|Testar/.test(x)), "Outlook sem sincronizar nem testar"); const tudo = comClasse(a.raiz, "inb-topo-sinc--tudo"); assert.equal(tudo.length, 1); assert.match(texto(tudo[0]), /Sincronizar tudo/);
});
test("Gerenciar contas: sem credencial só Conectar; recusada Reconectar; Sincronizar tudo só aparece com conta que lê; nada é chamado ao abrir", async () => {
  const a = amb({ credenciais: [{ conta_id: G1, estado: "invalida" }] }); await a.abrir(); await assentar(); ger(a);
  assert.deepEqual([IC, G1, G2].map((c) => acoesDe(card(a, c))), [["Conectar"], ["Reconectar com Google", "Desconectar"], ["Conectar com Google"]]); assert.match(texto(card(a, G1)), /Erro de autenticação/); assert.match(texto(card(a, G2)), /Sem conexão/);
  assert.equal(comClasse(a.raiz, "inb-topo-sinc--tudo").length, 0, "nenhuma conta lê: sem Sincronizar tudo"); assert.equal(a.chamadas.length, 0); assert.deepEqual(a.gravacoes, []);
});

test("Gerenciar contas: Sincronizar tudo (só as que leem), Sincronizar e Testar conexão agem SÓ na conta do cartão (Gmail: testar_conta sem Worker; iCloud: canal + login); Reconectar/Desconectar usam o fluxo existente", async () => {
  const contas = [...CONTAS, OUTLOOK];
  const a = amb({ contas, credenciais: [...CRED, { conta_id: OU, estado: "ativa" }], invoke: (n, o) => { const op = o.body.operacao; if (op === "sincronizar_pasta") return SYNC_OK(); if (op === "testar_canal") return ok({ canal: "ok", funcao: "rac-inbox@i4.1", worker: "rac-inbox-worker@p9.0" }); if (op === "oauth_iniciar") return ok({ provedor: "gmail", url: "https://accounts.google.com/o/oauth2/v2/auth?state=x" }); if (op === "credencial_remover") return ok({ removida: true }); return ok({}); } });
  const destinos = []; a.ctx.location = { assign: (u) => destinos.push(u) }; await a.abrir(); await assentar(); ger(a);
  const em = (id, t) => todos(card(a, id)).find((n) => n.tag === "button" && n.attrs["aria-label"] === t), sy = () => a.chamadas.filter((c) => c[1].body.operacao === "sincronizar_pasta").map((c) => c[1].body.conta_id).sort();
  todos(a.raiz).find((n) => /inb-topo-sinc--tudo/.test(n.className || "")).onclick(); await assentar(); assert.deepEqual(sy(), [IC, G1, G2].sort(), "Sincronizar tudo: iCloud e as duas Gmail, nunca o Outlook"); assert.ok(!a.chamadas.some((c) => c[1].body.conta_id === OU));
  a.chamadas.length = 0; em(G2, "Sincronizar").onclick(); await assentar(); assert.deepEqual(sy(), [G2], "só a conta G2 (a outra Gmail e o iCloud não são tocados)");
  a.chamadas.length = 0; em(IC, "Sincronizar").onclick(); await assentar(); assert.deepEqual(sy(), [IC], "Sincronização individual do iCloud");
  a.chamadas.length = 0; em(G1, "Testar conexão").onclick(); await assentar(); assert.deepEqual(a.chamadas.map((c) => [c[1].body.operacao, c[1].body.conta_id]), [["testar_conta", G1]], "Gmail: sem testar_canal"); assert.match(texto(a.raiz), /O acesso ao Google está funcionando/);
  a.chamadas.length = 0; em(IC, "Testar conexão").onclick(); await assentar(); assert.deepEqual(a.chamadas.map((c) => c[1].body.operacao), ["testar_canal", "testar_conta"], "iCloud: as duas provas de sempre");
  a.chamadas.length = 0; em(G2, "Reconectar com Google").onclick(); await assentar(); assert.deepEqual(a.chamadas.map((c) => [c[1].body.operacao, c[1].body.conta_id]), [["oauth_iniciar", G2]]); assert.deepEqual(destinos, ["https://accounts.google.com/o/oauth2/v2/auth?state=x"]);
  a.chamadas.length = 0; a.ctx.confirm = () => true; em(G1, "Desconectar").onclick(); await assentar(); assert.deepEqual(a.chamadas.map((c) => [c[1].body.operacao, c[1].body.conta_id]), [["credencial_remover", G1]]);
});

test("navegação: escolher Caixa unificada, conta ou pasta sai do Gerenciar contas; o ← do app e o botão do cabeçalho voltam às mensagens; abrir o Inbox de novo começa nas mensagens", async () => {
  const a = amb(); await a.abrir(); await assentar(); const voltar = () => a.ctx.inboxVoltar();
  ger(a); assert.equal(comClasse(a.raiz, "inb-gerenciar").length, 1); unif(a).onclick(); assert.equal(comClasse(a.raiz, "inb-gerenciar").length, 0);
  ger(a); contaBtn(a, G1).onclick(); assert.equal(comClasse(a.raiz, "inb-gerenciar").length, 0); assert.equal(tit(a), "Rayner Carvalho");
  ger(a); assert.equal(voltar(), true); assert.equal(comClasse(a.raiz, "inb-gerenciar").length, 0, "← do app: Gerenciar contas → mensagens");
  ger(a); btAria(a, "Voltar às mensagens").onclick(); assert.equal(comClasse(a.raiz, "inb-gerenciar").length, 0);
  ger(a); await a.abrir(); await assentar(); assert.equal(comClasse(a.raiz, "inb-gerenciar").length, 0, "reabrir o Inbox começa nas mensagens"); assert.deepEqual(a.gravacoes, []);
});

test("conta sem conexão na lista: o estado vazio leva ao Gerenciar contas (único lugar de conectar)", async () => {
  const a = amb({ credenciais: [] }); await a.abrir(G1); await assentar(); assert.match(texto(a.raiz), /Esta caixa ainda não foi lida/); assert.ok(sincHeader(a).attrs["aria-disabled"] === "true", "sem conexão: Sincronizar à vista e inativo"); bt(a, "Gerenciar contas").onclick(); assert.equal(comClasse(a.raiz, "inb-gerenciar").length, 1);
});

test("CSS e código do menu: só tokens, alvos de 44 px, sem estado por conta (uma árvore por vez), ícones com rótulo, sem estouro horizontal", () => {
  const css = lerArq("css/rac.css"), bloco = css.slice(css.indexOf("menu do protótipo (Contas")), js = lerArq("js/inbox.js"), lat = js.slice(js.indexOf("function inboxLateral()"), js.indexOf("var INBX_LOGO"));
  assert.ok(!/--rac-[a-z0-9-]+\s*:/.test(bloco) && !/#[0-9a-fA-F]{3,8}\b|rgb\(/.test(bloco), "só tokens, nenhuma cor nova no CSS"); assert.match(bloco, /\.inb-gc-btn\{[^}]*width:var\(--rac-alvo,44px\);height:var\(--rac-alvo,44px\)/); assert.match(bloco, /\.inb-topo-sinc\{[^}]*height:var\(--rac-alvo,44px\)/); assert.match(bloco, /text-overflow:ellipsis/);
  assert.match(bloco, /@media \(max-width:640px\)\{[\s\S]*grid-template-areas:"logo id" "est" "acoes"|@media \(max-width:640px\)\{[\s\S]*"est est"/, "no celular o cartão empilha (sem rolagem horizontal)");
  assert.ok(!/contasAbertas|secContas|inboxContaAberta/.test(js), "não existe estado de expansão por conta: só INBX.conta decide qual árvore aparece"); assert.ok((lat.match(/"inb-subtit inb-subtit--pastas"/g) || []).length === 1, "um único bloco de pastas no menu"); assert.ok(!/localStorage|sessionStorage/.test(lat));
  assert.match(js, /function inboxBtnConta\(icone,rotulo,fn,opc\)\{[^]*?"aria-label":rotulo/, "botões de ícone têm rótulo acessível");
});

test("painel lateral sobreposto: o véu só existe com o menu aberto, tocar nele fecha, a barra azul reúne menu, Sincronizar e Nova mensagem, e o menu abre também a partir de Gerenciar contas", async () => {
  const a = amb(); await a.abrir(); await assentar();
  assert.equal(comClasse(a.raiz, "inb-fundo").length, 0, "sem o menu aberto não há véu"); const barra = comClasse(a.raiz, "inb-barra")[0]; assert.ok(barra, "barra azul"); assert.ok(todos(barra).includes(sincHeader(a)), "Sincronizar dentro da barra"); assert.ok(todos(barra).includes(btAria(a, "Caixas")) && todos(barra).includes(btAria(a, "Nova mensagem")));
  btAria(a, "Caixas").onclick(); const j = () => comClasse(a.raiz, "inb-janela")[0]; assert.equal(j().attrs["data-painel"], "caixas"); assert.equal(comClasse(a.raiz, "inb-fundo").length, 1, "véu com o painel aberto"); assert.ok(comClasse(a.raiz, "inb-lateral").length === 1 && comClasse(a.raiz, "inb-mensagens").length === 1, "o painel e a tela de mensagens coexistem");
  comClasse(a.raiz, "inb-fundo")[0].onclick(); assert.equal(j().attrs["data-painel"], "lista", "tocar no véu fecha"); assert.equal(comClasse(a.raiz, "inb-fundo").length, 0);
  btAria(a, "Caixas").onclick(); contaBtn(a, G2).onclick(); assert.equal(j().attrs["data-painel"], "lista", "escolher uma conta fecha o painel (comportamento de sempre)");
  ger(a); btAria(a, "Caixas").onclick(); assert.equal(j().attrs["data-painel"], "caixas", "o menu abre também em Gerenciar contas"); assert.equal(comClasse(a.raiz, "inb-fundo").length, 1); assert.ok(todos(comClasse(a.raiz, "inb-barra")[0]).includes(btAria(a, "Voltar às mensagens")));
});
