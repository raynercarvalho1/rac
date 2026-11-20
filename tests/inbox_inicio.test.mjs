// RAC Inbox · cartão E-mail do Início: as contas vêm do PRÓPRIO Inbox. Prova: as duas contas Gmail aparecem identificadas e isoladas ("Fora do Inbox", sem número inventado);
// contas do Inbox mostram não lidas reais, estado e problema; Atualizar sincroniza SÓ a conta tocada; Abrir leva ao Inbox da conta; o fluxo antigo (leitura direta do Gmail no cartão) saiu;
// a casa não vê; nada grava. TUDO FICTÍCIO (example.com / .example).
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

const assentar = async () => { for (let i = 0; i < 12; i++) await esperar(); };
const ok = (d) => ({ data: { ok: true, ...d }, error: null });
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", PA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", PB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const GMAIL = [{ n: "Rayner Carvalho", e: "rayner@gmail.example", u: "https://mail.google.com/mail/u/0/#inbox" }, { n: "Raynim Carvalho", e: "", u: "https://mail.google.com/mail/u/1/#inbox" }];
const CONTAS = [{ id: A, apelido: "Pessoal", endereco: "pessoa@icloud.example", estado: "conectada", provedor: "icloud" }, { id: B, apelido: "Trabalho", endereco: "trab@icloud.example", estado: "conectada", provedor: "icloud" }];
const PASTAS = [{ id: PA, conta_id: A, nome_externo: "INBOX", nome_exibicao: "Caixa de entrada", uso: "entrada", total: 10, nao_lidas: 4 }, { id: PB, conta_id: B, nome_externo: "INBOX", nome_exibicao: "Caixa de entrada", uso: "entrada", total: 5, nao_lidas: 0 }];
const MSGS = [{ id: "m1111111-1111-4111-8111-111111111111", conta_id: A, pasta_id: PA, recebida_em: "2026-11-20T10:00:00Z", assunto: "Olá", remetente_nome: "Ana", remetente_endereco: "ana@example.com", lida: false }];
const base = (o = {}) => ({ contas: CONTAS, pastas: PASTAS, credenciais: [{ conta_id: A, estado: "ativa" }, { conta_id: B, estado: "ativa" }], mensagens: MSGS, sincs: [{ pasta_id: PA, ultima_ok_em: "2026-11-20T10:05:00Z", erro: null }, { pasta_id: PB, ultima_ok_em: "2026-11-20T10:06:00Z", erro: null }], ...o });
async function cartao(o = {}, gmail = GMAIL) {
  const a = ambiente(base(o)), alvo = new No("div"); a.ctx.inboxCartao(alvo, gmail); await assentar(); return { ...a, alvo };
}
const contaEl = (alvo, chave) => comClasse(alvo, "inbc-conta").find((n) => n.attrs["data-conta"] === chave);

test("núcleo: duas contas do Inbox + duas Gmail antigas = quatro linhas, cada uma com a sua identidade; Gmail sem número e sem conexão inventados", () => {
  const v = N.inbCartao({ contas: CONTAS, pastas: PASTAS, cred: { [A]: "ativa", [B]: "ativa" }, sincs: {}, msgs: [], gmail: GMAIL }, "2026-11-20T12:00:00Z");
  assert.deepEqual(v.linhas.map((l) => [l.origem, l.nome, l.endereco, l.naoLidas]), [["inbox", "Pessoal", "pessoa@icloud.example", 4], ["inbox", "Trabalho", "trab@icloud.example", 0], ["externa", "Rayner Carvalho", "rayner@gmail.example", null], ["externa", "Raynim Carvalho", "", null]]);
  const g = v.linhas.filter((l) => l.origem === "externa");
  assert.ok(g.every((l) => l.estadoRotulo === "Fora do Inbox" && !l.podeAtualizar && l.hash === null && /^https:\/\/mail\.google\.com\//.test(l.url) && l.recentes.length === 0), "Gmail: só abre no Gmail; nada de atualizar nem de mensagens");
  assert.equal(new Set(v.linhas.map((l) => l.chave)).size, 4, "chaves distintas (isolamento)"); assert.equal(v.resumo.naoLidas, 4); assert.equal(v.resumo.parcial, true);
});
test("núcleo: conta Gmail que já está no Inbox não aparece duas vezes; sem contas e sem Gmail = lista vazia; URL fora do Gmail é descartada", () => {
  const gmInbox = { id: "33333333-3333-4333-8333-333333333333", apelido: "Gmail 1", endereco: "Rayner@Gmail.example", estado: "nova", provedor: "gmail" };
  const v = N.inbCartao({ contas: [gmInbox], pastas: [], cred: {}, sincs: {}, msgs: [], gmail: GMAIL });
  assert.deepEqual(v.linhas.map((l) => l.chave), [gmInbox.id, "gmail:1"], "a identidade já cadastrada no Inbox some da lista antiga");
  assert.match(v.linhas[0].problema, /ainda não pode ser conectado pelo Inbox/); assert.equal(v.linhas[0].naoLidas, null); assert.equal(v.linhas[0].podeAtualizar, false);
  assert.deepEqual(N.inbCartao({}).linhas, []); assert.equal(N.inbCartao({}).resumo.naoLidas, null);
  assert.equal(N.inbCartao({ gmail: [{ n: "X", u: "https://evil.example/mail.google.com/" }] }).linhas[0].url, null);
});
test("núcleo: estados e problemas (sem credencial, credencial recusada, falha de sincronização, atrasada) e frases fixas", () => {
  const f = (c, cred, sy) => N.inbCartao({ contas: [{ ...CONTAS[0], ...c }], pastas: PASTAS, cred: cred ? { [A]: cred } : {}, sincs: sy ? { [PA]: sy } : {}, msgs: [] }).linhas[0];
  assert.match(f({}, null).problema, /Sem conexão: conecte a conta no Inbox/); assert.equal(f({}, null).podeAtualizar, false);
  assert.match(f({}, "invalida").problema, /recusou a credencial/); assert.equal(f({}, "invalida").tom, "erro");
  assert.match(f({ estado: "erro_autenticacao" }, "ativa").problema, /recusou a credencial/);
  const e = f({}, "ativa", { erro: "servico_indisponivel", falhas_seguidas: 3 }); assert.equal(e.tom, "erro"); assert.equal(e.estadoRotulo, "Falha ao sincronizar"); assert.equal(e.problema, N.inbErroTexto("servico_indisponivel")); assert.equal(e.podeAtualizar, true);
  assert.equal(f({}, "ativa", { erro: "rede", falhas_seguidas: 1 }).tom, "aviso"); assert.equal(f({ estado: "atrasada" }, "ativa").estadoRotulo, "Atrasada");
  const ok1 = f({}, "ativa", { ultima_ok_em: "2026-11-20T10:05:00Z" }); assert.equal(ok1.problema, null); assert.match(ok1.frase, /^Sincronizada /); assert.equal(f({}, "ativa").frase, "Ainda não sincronizada.");
  assert.equal(N.inbCartao({ contas: [CONTAS[0]], pastas: [], cred: { [A]: "ativa" } }).linhas[0].naoLidas, null, "sem pasta de entrada conhecida o número é nulo, não zero");
});
test("núcleo: mensagens recentes só da caixa de entrada da própria conta, no máximo 3, da mais nova; sem assunto vira '(Sem assunto)'; o destino é o id da linha", () => {
  const m = (id, conta, pasta, t, assunto) => ({ id, conta_id: conta, pasta_id: pasta, recebida_em: t, assunto, remetente_nome: "", remetente_endereco: "x@example.com", lida: true });
  const v = N.inbCartao({ contas: CONTAS, pastas: PASTAS, cred: { [A]: "ativa" }, sincs: {}, msgs: [m("1", A, PA, "2026-11-01", "a"), m("2", A, PA, "2026-11-04", ""), m("3", A, PA, "2026-11-03", "c"), m("4", A, PA, "2026-11-02", "d"), m("5", B, PB, "2026-11-09", "outra conta"), m("6", A, "outra-pasta", "2026-11-10", "fora da entrada")] });
  assert.deepEqual(v.linhas[0].recentes.map((r) => r.assunto), ["(Sem assunto)", "c", "d"]); assert.equal(v.linhas[0].recentes[0].hash, "#inbox/" + A + "/" + PA + "/2"); assert.deepEqual(v.linhas[1].recentes.map((r) => r.assunto), ["outra conta"]);
});

test("Início: as duas contas Gmail aparecem identificadas e as do Inbox mostram não lidas reais, estado e frase", async () => {
  const a = await cartao(); const els = comClasse(a.alvo, "inbc-conta");
  assert.equal(els.length, 4); assert.deepEqual(els.map((e) => e.attrs["data-origem"]), ["inbox", "inbox", "externa", "externa"]);
  const t = (c) => texto(contaEl(a.alvo, c)).replace(/\s+/g, " ");
  assert.match(t(A), /Pessoal.*pessoa@icloud\.example.*4 não lidas.*Sincronizada/); assert.match(t(B), /Trabalho.*trab@icloud\.example.*0 não lidas/);
  assert.match(t("gmail:0"), /Rayner Carvalho.*rayner@gmail\.example.*—.*Fora do Inbox.*ainda não está conectado ao Inbox/); assert.match(t("gmail:1"), /Raynim Carvalho.*endereço não informado/);
  assert.ok(!/\d+ não lidas?/.test(t("gmail:0") + t("gmail:1")), "nenhum número de não lidas é inventado para o Gmail");
  assert.match(t(A), /Olá.*Ana/, "assunto e remetente vêm do cache do Inbox"); assert.deepEqual(a.gravacoes, []); assert.equal(a.chamadas.length, 0, "abrir o Início não sincroniza nem chama o serviço");
});
test("Início: Abrir leva ao Inbox da conta certa; o Gmail só abre no Gmail (nova aba, sem opener)", async () => {
  const a = await cartao(); const abrir = (c) => todos(contaEl(a.alvo, c)).find((n) => n.tag === "a" && /^Abrir/.test(n.textContent));
  assert.equal(abrir(A).attrs.href, "#inbox/" + A); assert.equal(abrir(B).attrs.href, "#inbox/" + B);
  assert.equal(abrir("gmail:0").attrs.href, GMAIL[0].u); assert.equal(abrir("gmail:0").attrs.target, "_blank"); assert.equal(abrir("gmail:0").attrs.rel, "noopener");
  assert.ok(todos(contaEl(a.alvo, A)).some((n) => n.tag === "a" && n.attrs.href === "#inbox/" + A + "/" + PA + "/" + MSGS[0].id), "a mensagem recente abre direto no Inbox");
  assert.ok(!todos(a.alvo).some((n) => n.tag === "button" && /Atualizar/.test(n.textContent) && contaEl(a.alvo, "gmail:0") && todos(contaEl(a.alvo, "gmail:0")).includes(n)), "Gmail não tem Atualizar");
});
test("Início: Atualizar sincroniza SÓ a conta tocada (a outra não é chamada nem muda); botão ocupado; contagem atualizada depois", async () => {
  const pastas = PASTAS.map((p) => ({ ...p })); let solta;
  const a = ambiente(base({ pastas, invoke: (nome, o) => { const op = o.body.operacao; if (op !== "sincronizar_pasta") return ok({}); return new Promise((r) => { solta = () => { pastas[0].nao_lidas = 7; r(ok({ sincronizacao: { tipo: "novas_mensagens", novas: 3, atualizadas: 0, removidas: 0 }, mensagens_na_pasta: 13, mais: false })); }; }); } })), alvo = new No("div");
  a.ctx.inboxCartao(alvo, GMAIL); await assentar();
  const at = (c) => todos(contaEl(alvo, c)).find((n) => n.tag === "button" && /Atualizar|Sincronizando/.test(n.textContent));
  at(A).onclick(); await assentar();
  assert.match(texto(contaEl(alvo, A)).replace(/\s+/g, " "), /Sincronizando/); assert.equal(at(A).attrs.disabled !== undefined || at(A).disabled === true || /Sincronizando…/.test(at(A).textContent), true);
  assert.match(texto(contaEl(alvo, B)), /Atualizar/, "a outra conta segue com o botão normal"); at(A).onclick && at(A).onclick(); await assentar();
  assert.deepEqual(a.chamadas.map((c) => [c[1].body.operacao, c[1].body.conta_id, c[1].body.pasta_id]), [["sincronizar_pasta", A, PA]], "um toque (o segundo, durante a sincronização, é ignorado) e só a conta A");
  solta(); await assentar();
  assert.match(texto(contaEl(alvo, A)).replace(/\s+/g, " "), /7 não lidas/); assert.match(texto(contaEl(alvo, B)).replace(/\s+/g, " "), /0 não lidas/); assert.deepEqual(a.gravacoes, [], "o cartão não grava nada: o servidor grava o cache");
});
test("Início: erro ao atualizar vira texto fixo na conta certa e não afeta a outra; conta sem credencial não oferece Atualizar", async () => {
  const a = await cartao({ credenciais: [{ conta_id: A, estado: "ativa" }], invoke: () => ({ data: null, error: { context: { status: 502, json: () => Promise.resolve({ ok: false, erro: "servico_indisponivel", detalhe: "SEGREDO-NAO-MOSTRAR" }) } } }) });
  const at = (c) => todos(contaEl(a.alvo, c)).find((n) => n.tag === "button" && /Atualizar/.test(n.textContent));
  assert.ok(!at(B), "sem credencial: não há Atualizar, e o motivo aparece"); assert.match(texto(contaEl(a.alvo, B)), /Sem conexão: conecte a conta no Inbox/);
  at(A).onclick(); await assentar();
  const t = texto(contaEl(a.alvo, A)).replace(/\s+/g, " "); assert.ok(t.includes(N.inbErroTexto("servico_indisponivel"))); assert.ok(!/SEGREDO/.test(texto(a.alvo)), "a mensagem do servidor nunca aparece");
  assert.ok(!/Falha|indispon/i.test(texto(contaEl(a.alvo, B)).replace(/Sem conexão[^.]*\./, "")), "a conta B não herda o erro de A");
});
test("Início: credencial recusada e falha de sincronização aparecem como problema com a palavra, não só a cor", async () => {
  const a = await cartao({ credenciais: [{ conta_id: A, estado: "invalida" }, { conta_id: B, estado: "ativa" }], sincs: [{ pasta_id: PB, ultima_ok_em: null, erro: "rede", falhas_seguidas: 4 }] });
  assert.match(texto(contaEl(a.alvo, A)), /Erro de autenticação/); assert.match(texto(contaEl(a.alvo, A)), /recusou a credencial/); assert.match(texto(contaEl(a.alvo, B)), /Falha ao sincronizar/);
  assert.ok(comClasse(contaEl(a.alvo, A), "inb-estado--erro").length === 1);
});
test("Início: sem contas, com tabela ausente e com falha de leitura: estados honestos, sem dado fictício", async () => {
  const v = await cartao({ contas: [], pastas: [], credenciais: [], mensagens: [], sincs: [] }, []); assert.match(texto(v.alvo), /Nenhuma conta de e-mail ainda/); assert.equal(comClasse(v.alvo, "inbc-conta").length, 0);
  const g = await cartao({ contas: [], pastas: [], credenciais: [], mensagens: [], sincs: [] }); assert.equal(comClasse(g.alvo, "inbc-conta").length, 2, "só as duas contas Gmail, ainda assim identificadas");
  const e = await cartao({ erroLeitura: { message: 'relation "public.inbox_contas" does not exist' } }); assert.match(texto(e.alvo), /Não consegui ler as contas do Inbox agora/); assert.ok(todos(e.alvo).some((n) => n.tag === "a" && n.attrs.href === "#inbox"));
  const sm = await cartao({ erroMsgs: true }); assert.equal(comClasse(sm.alvo, "inbc-conta").length, 4, "sem a tabela de cabeçalhos o cartão segue, só sem mensagens recentes");
});
test("Início: o cartão usa o mesmo estado e a mesma sincronização do Inbox (sem armazenamento, serviço ou autenticação próprios)", () => {
  const app = lerArq("js/app.js"), inbox = lerArq("js/inbox.js"), bloco = inbox.slice(inbox.indexOf("function inboxCartaoLer")), wem = app.slice(app.indexOf("function wEmail()"), app.indexOf("function wEmail()") + 1800);
  assert.match(bloco, /inboxSincronizarConta\(c\)/); assert.match(bloco, /NUCLEO\.inbCartao\(/); assert.ok(!/localStorage|sessionStorage|indexedDB|fetch\(|gmail\.googleapis|accounts\.google/.test(bloco), "nenhum armazenamento nem chamada direta de e-mail");
  assert.match(wem, /precisa\(\["inbox"\]\)/); assert.match(wem, /inboxCartao\(ul,contas\)/);
  assert.ok(!/gmailBloco|gmConectar|gmApi|gmToken/.test(wem), "o cartão do Início não lê o Gmail por conta própria"); assert.ok(!/function gmailBloco/.test(app), "o fluxo antigo do cartão foi removido");
  assert.ok(!/insert\(|update\(|upsert\(|delete\(/.test(bloco), "o cartão só lê");
});
test("Início: a casa (Fernanda) não é afetada — o Início é do dono e o Inbox continua fora de DA_CASA", () => {
  const rotas = lerArq("js/rotas.js"); assert.ok(!/id:"inbox"[^}]*casa:true/.test(rotas)); assert.match(lerArq("js/app.js"), /PAPEL==="casa"\?"lista":"inicio"|isOwner\(\)\?"inicio":"lista"/);
});
test("Início: layout do cartão só com tokens, alvos de 44 px e sem estouro horizontal a 390 px", () => {
  const css = lerArq("css/rac.css"), bloco = css.slice(css.indexOf("cartão E-mail do Início"));
  assert.ok(!/--rac-[a-z0-9-]+\s*:/.test(bloco), "nenhum token novo"); assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgb\(/.test(bloco), "nenhuma cor fixa");
  assert.match(bloco, /\.inbc-cab \.grow\{[^}]*min-width:0/); assert.match(bloco, /text-overflow:ellipsis/); assert.match(bloco, /min-height:var\(--rac-alvo,44px\)/); assert.match(bloco, /flex-wrap:wrap/);
});
