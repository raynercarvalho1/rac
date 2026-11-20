// RAC Inbox · menu lateral com a seção "Contas" (recolhível, com pastas por conta) e a área "Gerenciar contas": ações por provedor, sem cartões de conexão na tela de mensagens, navegação entre
// Caixa unificada, contas e pastas, e o ← do app. DOM de mentira, serviço de mentira. TUDO FICTÍCIO.
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
const P = { ic: "bbbbbbbb-0000-4000-8000-000000000001", ic2: "bbbbbbbb-0000-4000-8000-000000000004", g1: "bbbbbbbb-0000-4000-8000-000000000002", g2: "bbbbbbbb-0000-4000-8000-000000000003" };
const CONTAS = [{ id: IC, apelido: "iCloud", endereco: "eu@icloud.example", estado: "conectada", provedor: "icloud" }, { id: G1, apelido: "Rayner Carvalho", endereco: "rayner@gmail.example", estado: "conectada", provedor: "gmail" }, { id: G2, apelido: "Raynim", endereco: "raynim@gmail.example", estado: "conectada", provedor: "gmail" }];
const pasta = (id, conta, nome, uso, n) => ({ id, conta_id: conta, nome_externo: nome, nome_exibicao: nome, uso, total: 10, nao_lidas: n, ativa: true });
const PASTAS = [pasta(P.ic, IC, "INBOX", "entrada", 5), pasta(P.ic2, IC, "Sent", "enviados", 0), pasta(P.g1, G1, "INBOX", "entrada", 3), pasta(P.g2, G2, "INBOX", "entrada", 0)];
const SINC = [{ pasta_id: P.ic, ultima_ok_em: "2026-11-20T10:00:00Z", erro: null }, { pasta_id: P.g1, ultima_ok_em: "2026-11-20T10:05:00Z", erro: null }];
const CRED = [IC, G1, G2].map((c) => ({ conta_id: c, estado: "ativa" }));
const ok = (d) => ({ data: { ok: true, ...d }, error: null });
function amb(o = {}) { const a = ambiente({ contas: CONTAS, pastas: PASTAS, credenciais: CRED, sincs: SINC, mensagens: [], ...o }); a.ctx.location = { assign() {} }; return a; }
const bt = (a, t) => todos(a.raiz).find((n) => n.tag === "button" && texto(n).replace(/\s+/g, " ").trim() === t);
const btAria = (a, t) => todos(a.raiz).find((n) => n.tag === "button" && n.attrs["aria-label"] === t);
const ger = (a) => bt(a, "Gerenciar contas").onclick();
const lateral = (a) => comClasse(a.raiz, "inb-lateral")[0];
const card = (a, id) => comClasse(a.raiz, "inb-gc").find((n) => n.attrs["data-conta"] === id);
const botoes = (n) => todos(n).filter((x) => x.tag === "button").map((x) => texto(x).replace(/\s+/g, " ").trim()).filter(Boolean);

test("núcleo: ações por provedor e estado da credencial — só o que está implementado (iCloud e Gmail leem e testam; Outlook só conecta e desconecta)", () => {
  const f = (prov, cred) => { const a = N.inbAcoesConta({ provedor: prov }, cred), r = {}; for (const k of ["sincronizar", "testar", "conectar", "reconectar", "desconectar"]) if (a[k]) r[k] = true; return Object.keys(r).join(","); };
  assert.equal(f("icloud", "ativa"), "sincronizar,testar,reconectar,desconectar"); assert.equal(f("gmail", "ativa"), "sincronizar,testar,reconectar,desconectar");
  assert.equal(f("outlook", "ativa"), "reconectar,desconectar", "Outlook ainda não lê: nada de sincronizar nem testar"); assert.equal(N.inbAcoesConta({ provedor: "outlook" }, "ativa").motivo, "A leitura de mensagens deste provedor ainda não foi liberada no Inbox.");
  for (const p of ["icloud", "gmail", "outlook"]) { assert.equal(f(p, "ausente"), "conectar", p); assert.equal(f(p, "invalida"), "reconectar,desconectar", p); assert.equal(f(p, undefined), "conectar", p); }
  assert.equal(f("xyz", "ativa"), "", "provedor desconhecido não oferece nada"); assert.equal(N.inbAcoesConta(null, "ativa").conectar, false);
  assert.equal(N.inbAcoesConta({ provedor: "gmail" }, "ativa").oauth, true); assert.equal(N.inbAcoesConta({ provedor: "icloud" }, "ativa").oauth, false);
  const u = N.inbUltimaSync({ id: IC }, PASTAS, { [P.ic]: { ultima_ok_em: "2026-11-20T10:00:00Z", erro: null } }, "2026-11-20T12:00:00Z"); assert.match(u.frase, /^Sincronizada hoje às/); assert.equal(u.erro, null);
  assert.equal(N.inbUltimaSync({ id: G2 }, PASTAS, {}).frase, "Ainda não sincronizada."); assert.equal(N.inbUltimaSync({ id: IC }, PASTAS, { [P.ic]: { ultima_ok_em: null, erro: "rede" } }).erro, N.inbErroTexto("rede"));
});

test("tela de mensagens: sem cartão de conexão (nada de 'Autorização guardada', 'Sincronizar'/'Testar conexão' soltos); o botão de atualizar do cabeçalho continua e age como antes", async () => {
  for (const conta of [G1, IC, "todas"]) {
    const a = amb({ invoke: () => ok({ sincronizacao: { tipo: "sem_mudanca", novas: 0, atualizadas: 0, removidas: 0 }, mensagens_na_pasta: 10, mais: false }) }); await a.abrir(conta === "todas" ? undefined : conta); await assentar();
    const t = texto(a.raiz); assert.ok(!/Autorização guardada|Testar conexão|Opções da conexão/.test(t), conta + ": sem cartão de conexão"); assert.ok(!bt(a, "Sincronizar") && !bt(a, "Testar conexão") && comClasse(a.raiz, "inb-conexao").length === 0, conta);
    const sinc = comClasse(a.raiz, "inb-topo-sinc")[0]; assert.ok(sinc, conta + ": o ícone de atualizar do cabeçalho continua"); sinc.onclick(); await assentar();
    const esperadas = conta === "todas" ? [IC, G1, G2] : [conta]; assert.deepEqual(a.chamadas.map((c) => c[1].body.conta_id).sort(), esperadas.sort(), conta + ": mesmo comportamento de sempre (a conta aberta ou todas as conectadas)");
  }
});

test("menu: Caixa unificada, UMA seção 'Contas' expandida por padrão com as três contas (sem repetir cartões), pastas só da conta expandida, indicadores de não lidas, e Gerenciar contas", async () => {
  const a = amb(); await a.abrir(); await assentar(); const lat = lateral(a), t = texto(lat).replace(/\s+/g, " ");
  assert.match(t, /Caixa unificada\s*8/, "unificada soma as não lidas (5 + 3 + 0)"); assert.equal(comClasse(lat, "inb-secao").length, 1, "uma única seção Contas"); const sec = comClasse(lat, "inb-secao")[0];
  assert.deepEqual([sec.attrs["aria-expanded"], texto(sec).replace(/\s+/g, " ").trim()], ["true", "▾ Contas 3"]);
  assert.equal(comClasse(lat, "inb-conta").length, 3, "as três contas, cada uma uma vez"); assert.deepEqual(comClasse(lat, "inb-conta").map((c) => c.filhos[1].filhos[0].textContent), ["iCloud", "Rayner Carvalho", "Raynim"].sort((x, y) => x.localeCompare(y, "pt-BR")), "ordem alfabética, uma linha por conta");
  const linha = (id) => comClasse(lat, "inb-conta-linha").find((n) => n.attrs["data-conta"] === id); assert.match(texto(linha(G1)), /Rayner Carvalho\s+rayner@gmail\.example\s*3/, "não lidas na linha da conta"); assert.match(texto(linha(IC)), /5/); assert.ok(!/\b0\b/.test(texto(linha(G2)).replace(/gmail|\d{3}/g, "")), "conta sem não lidas não mostra zero");
  assert.equal(comClasse(lat, "inb-pasta").filter((p) => !/inb-item--off/.test(p.className)).length, 0, "nenhuma conta expandida ainda (nenhuma selecionada): sem pastas soltas");
  assert.ok(bt(a, "Gerenciar contas") && bt(a, "Adicionar conta")); assert.ok(comClasse(lat, "inb-conexao").length === 0);
});

test("menu: selecionar conta expande e filtra; o ▾/▸ expande e recolhe só as pastas daquela conta; a seção Contas recolhe tudo e reabre; pastas navegam; a Caixa unificada volta", async () => {
  const a = amb(); await a.abrir(); await assentar();
  const conta = (id) => comClasse(lateral(a), "inb-conta-linha").find((n) => n.attrs["data-conta"] === id), tit = () => texto(comClasse(a.raiz, "inb-titulo")[0]).trim();
  conta(IC).filhos[0].onclick(); assert.equal(tit(), "iCloud"); let pastas = () => comClasse(lateral(a), "inb-pasta").filter((p) => !/inb-item--off/.test(p.className)); assert.deepEqual(pastas().map((p) => texto(p).replace(/\s+/g, " ").trim()), ["INBOX 5", "Sent 0"], "pastas da conta selecionada, com não lidas");
  pastas()[1].onclick(); assert.equal(tit(), "iCloud"); assert.ok(pastas().some((p) => /inb-item--ativo/.test(p.className) && /Sent/.test(texto(p))), "a pasta ativa é marcada");
  conta(G1).filhos[0].onclick(); assert.equal(tit(), "Rayner Carvalho"); assert.deepEqual(pastas().map((p) => texto(p).replace(/\s+/g, " ").trim()), ["INBOX 5", "Sent 0", "INBOX 3"], "a conta aberta antes continua expandida; a nova também");
  /* expandir/recolher pelo ▾ de cada conta, sem trocar a conta aberta */
  const exp = (id) => comClasse(conta(id), "inb-exp")[0]; const abertas = () => comClasse(lateral(a), "inb-exp").map((e) => e.attrs["aria-expanded"]);
  const antes = abertas(); exp(G2).onclick(); assert.equal(tit(), "Rayner Carvalho", "expandir outra conta não troca a seleção"); assert.equal(exp(G2).attrs["aria-expanded"], "true"); exp(G2).onclick(); assert.equal(exp(G2).attrs["aria-expanded"], "false"); assert.deepEqual(abertas(), antes);
  const sec = () => comClasse(lateral(a), "inb-secao")[0]; sec().onclick(); assert.equal(sec().attrs["aria-expanded"], "false"); assert.equal(comClasse(lateral(a), "inb-contas")[0].attrs.hidden !== undefined, true, "recolhida: as contas ficam ocultas"); assert.equal(texto(sec()).includes("▸"), true);
  assert.ok(comClasse(a.raiz, "inb-unificada")[0] && bt(a, "Gerenciar contas"), "a unificada e o Gerenciar contas seguem à vista com a seção recolhida"); sec().onclick(); assert.equal(sec().attrs["aria-expanded"], "true"); assert.equal(comClasse(lateral(a), "inb-contas")[0].attrs.hidden, undefined);
  comClasse(a.raiz, "inb-unificada")[0].onclick(); assert.equal(tit(), "Caixa de entrada", "a unificada volta"); assert.ok(/inb-item--ativo/.test(comClasse(a.raiz, "inb-unificada")[0].className));
});

test("Gerenciar contas: cada conta individualmente com nome, endereço, provedor, estado e última sincronização; ações só do que o provedor implementa", async () => {
  const contas = [...CONTAS, { id: OU, apelido: "Outlook", endereco: "eu@outlook.example", estado: "conectada", provedor: "outlook" }];
  const a = amb({ contas, credenciais: [...CRED, { conta_id: OU, estado: "ativa" }] }); await a.abrir(); await assentar(); ger(a);
  assert.equal(comClasse(a.raiz, "inb-gc").length, 4); assert.equal(texto(comClasse(a.raiz, "inb-titulo")[0]).trim(), "Gerenciar contas"); assert.ok(/inb-item--ativo/.test(bt(a, "Gerenciar contas").className), "o item do menu fica marcado");
  const t = (id) => texto(card(a, id)).replace(/\s+/g, " ");
  assert.match(t(IC), /iCloud eu@icloud\.example iCloud Mail.*Última sincronização: hoje às/); assert.match(t(G1), /Rayner Carvalho rayner@gmail\.example Gmail.*Última sincronização: hoje às/); assert.match(t(G2), /Raynim raynim@gmail\.example Gmail.*Última sincronização: ainda não houve/); assert.match(t(OU), /Outlook eu@outlook\.example Outlook \/ Microsoft.*Leitura de mensagens ainda não liberada/);
  assert.deepEqual([IC, G1, G2, OU].map((c) => botoes(card(a, c)).filter((x) => /^(Sincronizar|Testar conexão|Reconectar com .*|Desconectar|Conectar.*|Substituir senha)$/.test(x))), [["Sincronizar", "Testar conexão"], ["Sincronizar", "Testar conexão", "Reconectar com Google", "Desconectar"], ["Sincronizar", "Testar conexão", "Reconectar com Google", "Desconectar"], ["Reconectar com Microsoft", "Desconectar"]]);
  assert.ok(comClasse(card(a, IC), "inb-conexao-mais").length === 1, "iCloud: Opções (substituir senha, desconectar, prova de envio) continuam no cartão da conta"); assert.ok(!/Testar envio|Substituir senha/.test(t(IC)), "...escondidas até pedir");
  assert.ok(!botoes(card(a, OU)).includes("Sincronizar") && !botoes(card(a, OU)).includes("Testar conexão"), "Outlook não oferece o que não existe");
});
test("Gerenciar contas: conta sem credencial só oferece Conectar; credencial recusada oferece Reconectar; nada é chamado ao abrir", async () => {
  const a = amb({ credenciais: [{ conta_id: G1, estado: "invalida" }] }); await a.abrir(); await assentar(); ger(a);
  assert.deepEqual([IC, G1, G2].map((c) => botoes(card(a, c)).filter((x) => /^(Sincronizar|Testar conexão|Reconectar com .*|Desconectar.*|Conectar.*|Substituir senha)$/.test(x))), [["Conectar"], ["Reconectar com Google", "Desconectar"], ["Conectar com Google"]]);
  assert.match(texto(card(a, G1)), /recusada|revogada/); assert.match(texto(card(a, G2)), /Sem conexão/); assert.equal(a.chamadas.length, 0); assert.deepEqual(a.gravacoes, []);
});

test("Gerenciar contas: Sincronizar e Testar conexão agem SÓ na conta do cartão (Gmail: testar_conta sem Worker; iCloud: canal + login); Reconectar/Desconectar usam o fluxo que já existia", async () => {
  const a = amb({ invoke: (n, o) => { const op = o.body.operacao; if (op === "sincronizar_pasta") return ok({ sincronizacao: { tipo: "sem_mudanca", novas: 0, atualizadas: 0, removidas: 0 }, mensagens_na_pasta: 10, mais: false }); if (op === "testar_canal") return ok({ canal: "ok", funcao: "rac-inbox@i4.1", worker: "rac-inbox-worker@p9.0" }); if (op === "oauth_iniciar") return ok({ provedor: "gmail", url: "https://accounts.google.com/o/oauth2/v2/auth?state=x" }); if (op === "credencial_remover") return ok({ removida: true }); return ok({}); } });
  const destinos = []; a.ctx.location = { assign: (u) => destinos.push(u) }; await a.abrir(); await assentar(); ger(a);
  const em = (id, t) => todos(card(a, id)).find((n) => n.tag === "button" && texto(n).replace(/\s+/g, " ").trim() === t);
  em(G2, "Sincronizar").onclick(); await assentar(); assert.deepEqual(a.chamadas.map((c) => [c[1].body.operacao, c[1].body.conta_id, c[1].body.pasta_id]), [["sincronizar_pasta", G2, P.g2]], "só a conta G2 (a outra Gmail e o iCloud não são tocados)");
  a.chamadas.length = 0; em(G1, "Testar conexão").onclick(); await assentar(); assert.deepEqual(a.chamadas.map((c) => [c[1].body.operacao, c[1].body.conta_id]), [["testar_conta", G1]], "Gmail: sem testar_canal (não passa pelo Worker do iCloud)"); assert.match(texto(a.raiz), /O acesso ao Google está funcionando/);
  a.chamadas.length = 0; em(IC, "Testar conexão").onclick(); await assentar(); assert.deepEqual(a.chamadas.map((c) => c[1].body.operacao), ["testar_canal", "testar_conta"], "iCloud: as duas provas de sempre");
  a.chamadas.length = 0; em(G2, "Reconectar com Google").onclick(); await assentar(); assert.deepEqual(a.chamadas.map((c) => [c[1].body.operacao, c[1].body.conta_id]), [["oauth_iniciar", G2]]); assert.deepEqual(destinos, ["https://accounts.google.com/o/oauth2/v2/auth?state=x"]);
  a.chamadas.length = 0; a.ctx.confirm = () => true; em(G1, "Desconectar").onclick(); await assentar(); assert.deepEqual(a.chamadas.map((c) => [c[1].body.operacao, c[1].body.conta_id]), [["credencial_remover", G1]]);
});

test("navegação: escolher Caixa unificada, conta ou pasta sai do Gerenciar contas; o ← do app e o botão do cabeçalho voltam às mensagens; abrir o Inbox de novo começa nas mensagens", async () => {
  const a = amb(); await a.abrir(); await assentar(); const voltar = () => a.ctx.inboxVoltar();
  ger(a); assert.equal(comClasse(a.raiz, "inb-gerenciar").length, 1); comClasse(a.raiz, "inb-unificada")[0].onclick(); assert.equal(comClasse(a.raiz, "inb-gerenciar").length, 0);
  ger(a); comClasse(lateral(a), "inb-conta-linha")[1].filhos[0].onclick(); assert.equal(comClasse(a.raiz, "inb-gerenciar").length, 0); assert.equal(texto(comClasse(a.raiz, "inb-titulo")[0]).trim(), "Rayner Carvalho");
  ger(a); assert.equal(voltar(), true); assert.equal(comClasse(a.raiz, "inb-gerenciar").length, 0, "← do app: Gerenciar contas → mensagens");
  ger(a); btAria(a, "Voltar às mensagens").onclick(); assert.equal(comClasse(a.raiz, "inb-gerenciar").length, 0);
  ger(a); await a.abrir(); await assentar(); assert.equal(comClasse(a.raiz, "inb-gerenciar").length, 0, "reabrir o Inbox começa nas mensagens");
  assert.deepEqual(a.gravacoes, []);
});

test("conta sem conexão na lista: o estado vazio leva ao Gerenciar contas (único lugar de conectar)", async () => {
  const a = amb({ credenciais: [] }); await a.abrir(G1); await assentar(); assert.match(texto(a.raiz), /Esta caixa ainda não foi lida/); bt(a, "Gerenciar contas").onclick(); assert.equal(comClasse(a.raiz, "inb-gerenciar").length, 1);
});

test("CSS e acessibilidade do menu: só tokens, alvos de 44 px, seção com aria-expanded/aria-controls, ▾/▸ com rótulo, sem estouro horizontal", () => {
  const css = lerArq("css/rac.css"), bloco = css.slice(css.indexOf('menu com seção "Contas"')), js = lerArq("js/inbox.js"), lat = js.slice(js.indexOf("function inboxLateral()"), js.indexOf("function inboxContaGerenciar"));
  assert.ok(!/--rac-[a-z0-9-]+\s*:/.test(bloco) && !/#[0-9a-fA-F]{3,8}\b|rgb\(/.test(bloco), "só tokens, nenhuma cor nova"); assert.match(bloco, /\.inb-exp\{[^}]*min-height:var\(--rac-alvo,44px\)/); assert.match(bloco, /\.inb-conta-linha>\.inb-conta\{flex:1;min-width:0/); assert.match(bloco, /text-overflow:ellipsis/);
  assert.match(lat, /"aria-expanded":INBX\.secContas/); assert.match(lat, /"aria-controls":"inb-contas"/); assert.match(lat, /"aria-label":\(aberta\?"Recolher as pastas de ":"Mostrar as pastas de "\)\+c\.apelido/);
  assert.ok(!/localStorage|sessionStorage/.test(lat), "o estado de expansão vive só na tela");
});
