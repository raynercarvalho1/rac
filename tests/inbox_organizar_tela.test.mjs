// RAC Inbox · I3.2 · a TELA do gerenciamento (js/inbox.js) num DOM de mentira, sem navegador e sem rede (o navegador real, a 390 e 1440 px, é o teste de Chromium à parte). O serviço é de mentira e REGISTRA cada chamada.
// Prova: a tela só muda DEPOIS da confirmação do servidor; falha ou resultado incerto preserva o estado anterior com frase clara; um toque por vez; excluir pede confirmação; pastas de destino só da conta e selecionáveis;
// o exemplo e a conta sem conexão nunca executam; o nome da pasta nunca vai do navegador. TUDO FICTÍCIO.
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
const CONTA = { id: UUID, apelido: "Pessoal", endereco: "pessoa@icloud.example", estado: "nova", provedor: "icloud" };

const assentar = async () => { for (let i = 0; i < 14; i++) await esperar(); };
const P_IN = "aaaaaaaa-0000-4000-8000-0000000000a1", P_ENV = "aaaaaaaa-0000-4000-8000-0000000000a2";
const CONTA_OK = { ...CONTA, estado: "conectada" };
const PASTAS = () => [{ id: P_IN, conta_id: UUID, nome_externo: "INBOX", nome_exibicao: "INBOX", uso: "entrada", total: 3, nao_lidas: 1 }, { id: P_ENV, conta_id: UUID, nome_externo: "Sent Messages", nome_exibicao: "Enviados", uso: "enviados", total: 1, nao_lidas: 0 }];
const AGORA = Date.now();
const MSG = (n, extra = {}) => ({ id: "dddddddd-0000-4000-8000-00000000000" + n, conta_id: UUID, pasta_id: P_IN, uid: n, uidvalidity: 700, recebida_em: new Date(AGORA - n * 3600000).toISOString(), assunto: "Assunto " + n, remetente_nome: "Ana " + n, remetente_endereco: "ana" + n + "@exemplo.com", destinatarios: [{ nome: "Eu", endereco: "eu@icloud.com" }], lida: n !== 1, sinalizada: false, respondida: false, tamanho: 1000, anexo_provavel: n === 2, ...extra });
const REAL = (extra = {}) => ({ contas: [CONTA_OK], credenciais: [{ conta_id: UUID, estado: "ativa" }], pastas: PASTAS(), mensagens: [MSG(1), MSG(2), MSG(3), MSG(4, { pasta_id: P_ENV, assunto: "Enviada" })], sincs: [{ pasta_id: P_IN, ultima_ok_em: "2026-11-14T10:20:00.000Z", erro: null, falhas_seguidas: 0 }], ...extra });
const ok = (dados) => ({ data: { ok: true, ...dados }, error: null });
const erroHttp = (status, cod) => ({ data: null, error: { name: "FunctionsHttpError", message: "texto cru do servidor", context: { status, json: () => Promise.resolve({ ok: false, erro: cod }) } } });

const P_ARQ = "aaaaaaaa-0000-4000-8000-0000000000a3", P_LIX = "aaaaaaaa-0000-4000-8000-0000000000a4", P_SPM = "aaaaaaaa-0000-4000-8000-0000000000a5", P_PRJ = "aaaaaaaa-0000-4000-8000-0000000000a6", P_OFF = "aaaaaaaa-0000-4000-8000-0000000000a7", P_OUTRA = "aaaaaaaa-0000-4000-8000-0000000000b1";
const UUID2 = "22222222-2222-4222-8222-222222222222";
const PASTAS_G = () => [...PASTAS(), { id: P_ARQ, conta_id: UUID, nome_externo: "Archive", nome_exibicao: "Arquivo", uso: "arquivo", total: 0, nao_lidas: 0, ativa: true }, { id: P_LIX, conta_id: UUID, nome_externo: "Deleted Messages", nome_exibicao: "Lixeira", uso: "lixo", total: 0, nao_lidas: 0, ativa: true },
  { id: P_SPM, conta_id: UUID, nome_externo: "Junk", nome_exibicao: "Spam", uso: "spam", total: 0, nao_lidas: 0, ativa: true }, { id: P_PRJ, conta_id: UUID, nome_externo: "Projetos", nome_exibicao: "Projetos", uso: "outra", total: 0, nao_lidas: 0, ativa: true },
  { id: P_OFF, conta_id: UUID, nome_externo: "Pai", nome_exibicao: "Pai (não selecionável)", uso: "outra", total: 0, nao_lidas: 0, ativa: false }, { id: P_OUTRA, conta_id: UUID2, nome_externo: "Archive", nome_exibicao: "Arquivo da outra conta", uso: "arquivo", total: 0, nao_lidas: 0, ativa: true }];
const LEIT = ok({ mensagem: { texto: "Olá, mundo", formato: "texto", truncado: false, anexos: [] } });

/* ambiente com um "servidor" que guarda o cache: aoOrganizar(corpo) devolve a resposta e, se confirmar, muda o cache que a tela relê */
function montar({ aoOrganizar, extra = {} } = {}) {
  const dados = REAL({ pastas: PASTAS_G(), mensagens: [MSG(1), MSG(2), MSG(3)], ...extra });
  const a = ambiente({ ...dados, invoke: (nome, o) => { const op = o.body.operacao; if (op === "ler_mensagem") return LEIT; if (op === "organizar_mensagem") return aoOrganizar(o.body, dados); return ok({}); } });
  a.dados = dados; a.org = () => a.chamadas.filter((c) => c[1].body.operacao === "organizar_mensagem"); return a;
}
const abrirMsg = async (a, n = 0) => { await a.abrir(UUID); await assentar(); comClasse(a.raiz, "inb-linha")[n].onclick(); await assentar(); };
const acaoBtn = (a, rotulo) => comClasse(comClasse(a.raiz, "inb-leitura")[0], "inb-btn-ico").find((b) => b.attrs["aria-label"] === rotulo);
const maisMenu = async (a) => { acaoBtn(a, "Mais").onclick(); await esperar(); return comClasse(a.raiz, "inb-menu")[0]; };
const item = (menu, t) => todos(menu).find((n) => n.tag === "button" && (n.attrs.role === "menuitem") && texto(n).replace(/\s+/g, " ").trim().startsWith(t));
const lidaSim = (a, id) => { const m = a.dados.mensagens.find((x) => x.id === id); m.lida = true; };

test("barra de ações da mensagem real: Arquivar, Excluir e Mais ficam ATIVAS (e as do exemplo e as de conta sem conexão continuam desligadas, sem executar nada)", async () => {
  const a = montar({ aoOrganizar: () => ok({}) }); await abrirMsg(a);
  for (const r of ["Responder", "Responder a todos", "Encaminhar", "Arquivar", "Excluir", "Mais"]) assert.notEqual(acaoBtn(a, r).attrs["aria-disabled"], "true", r + " ativa");
  assert.equal(a.org().length, 0, "abrir a mensagem não altera nada, nem a marca como lida no provedor");
  const sem = montar({ aoOrganizar: () => ok({}), extra: { credenciais: [] } }); await abrirMsg(sem);
  for (const r of ["Arquivar", "Excluir", "Mais"]) { assert.equal(acaoBtn(sem, r).attrs["aria-disabled"], "true", r + " desligada sem conexão"); assert.equal(acaoBtn(sem, r).onclick, null); }
  assert.equal(sem.org().length, 0);
  const d = ambiente(REAL({ pastas: PASTAS_G() })); await d.abrir(UUID); await assentar(); botao(d.raiz, "Ver exemplo da interface").onclick(); await assentar(); comClasse(d.raiz, "inb-linha")[0].onclick();
  for (const r of ["Arquivar", "Excluir", "Mais"]) { const b = acaoBtn(d, r); assert.equal(b.attrs["aria-disabled"], "true"); assert.equal(b.onclick, null, r + " no exemplo não faz nada"); }
  assert.equal(d.chamadas.length, 0);
});

test("marcar como lida: a tela NÃO muda enquanto o servidor não confirma (botões travados, sem segundo pedido); depois da confirmação a lista é relida e a mensagem deixa de ser 'não lida'", async () => {
  let liberar; const pendente = new Promise((r) => { liberar = r; });
  const a = montar({ aoOrganizar: () => pendente }); await abrirMsg(a, 0);   // a mais recente da lista: a MSG 1, a única não lida
  const nova = () => comClasse(a.raiz, "inb-linha").filter((l) => (" " + l.className + " ").includes(" inb-linha--nova "));
  assert.equal(nova().length, 1); const id = a.dados.mensagens[0].id;
  const menu = await maisMenu(a); assert.ok(item(menu, "Marcar como lida") && !item(menu, "Marcar como não lida"), "oferece só o que faz sentido para o estado atual");
  item(menu, "Marcar como lida").onclick(); await esperar();
  assert.deepEqual(a.org().map((c) => c[1].body), [{ operacao: "organizar_mensagem", conta_id: UUID, pasta_id: P_IN, uid: 1, acao: "marcar_lida" }], "só IDs, UID e a ação: nenhum nome de pasta");
  assert.equal(nova().length, 1, "enquanto o servidor não confirma, a lista NÃO mostra como lida"); assert.equal(a.dados.mensagens[0].lida, false);
  assert.equal(acaoBtn(a, "Arquivar").attrs.disabled, "disabled", "travado enquanto a operação roda");
  acaoBtn(a, "Arquivar").onclick?.(); acaoBtn(a, "Excluir").onclick?.(); await esperar(); assert.equal(a.org().length, 1, "cliques repetidos não enviam outro pedido");
  assert.match(texto(a.raiz), /Aguardando a confirmação do iCloud… A lista só muda depois dela/, "o estado de execução é visível"); assert.equal(acaoBtn(a, "Mais").attrs["aria-busy"], "true");
  lidaSim(a, id); liberar(ok({ resultado: "aplicada", acao: "marcar_lida", cache: "atualizado", lida: true })); await assentar();
  assert.equal(nova().length, 0, "agora, relida do cache já atualizado pelo servidor"); assert.match(texto(a.raiz), /Mensagem marcada como lida\./); assert.match(texto(a.raiz), /3 mensagens · 0 não lidas/);
  const m2 = await maisMenu(a); assert.ok(item(m2, "Marcar como não lida") && !item(m2, "Marcar como lida"), "agora oferece o inverso");
  assert.equal(a.org().length, 1);
});

test("arquivar: pede ao servidor, e só depois da confirmação a mensagem sai da lista e a leitura fecha; excluir pede confirmação e vai para a Lixeira; recusar a confirmação não envia nada", async () => {
  const sai = (a, uid, para) => { const i = a.dados.mensagens.findIndex((m) => m.uid === uid && m.pasta_id === P_IN); const [m] = a.dados.mensagens.splice(i, 1); a.dados.mensagens.push({ ...m, pasta_id: para, uid: 20 }); };
  const a = montar({ aoOrganizar: (b, d) => { sai(a, b.uid, b.acao === "arquivar" ? P_ARQ : P_LIX); return ok({ resultado: "aplicada", acao: b.acao, cache: "atualizado", destino_pasta_id: b.acao === "arquivar" ? P_ARQ : P_LIX }); } }); await abrirMsg(a, 0);
  assert.equal(comClasse(a.raiz, "inb-linha").length, 3); const antes = acaoBtn(a, "Arquivar"); antes.onclick(); await assentar();
  assert.deepEqual(a.org().map((c) => c[1].body.acao), ["arquivar"]); assert.ok(!JSON.stringify(a.org()[0][1]).includes("Archive"), "o NOME da pasta nunca vai do navegador");
  assert.equal(comClasse(a.raiz, "inb-linha").length, 2, "saiu da lista"); assert.equal(comClasse(a.raiz, "inb-janela")[0].attrs["data-painel"], "lista", "a leitura fechou: a mensagem não está mais aqui"); assert.match(texto(a.raiz), /Mensagem arquivada\./);
  comClasse(a.raiz, "inb-linha")[0].onclick(); await assentar();
  a.ctx.confirm = () => false; acaoBtn(a, "Excluir").onclick(); await assentar(); assert.equal(a.org().length, 1, "sem confirmar, nada é enviado"); assert.equal(comClasse(a.raiz, "inb-linha").length, 2);
  let perguntas = []; a.ctx.confirm = (t) => { perguntas.push(t); return true; }; acaoBtn(a, "Excluir").onclick(); await assentar();
  assert.match(perguntas[0], /Lixeira/); assert.match(perguntas[0], /não faz exclusão definitiva/i); assert.deepEqual(a.org().map((c) => c[1].body.acao), ["arquivar", "excluir"]); assert.equal(comClasse(a.raiz, "inb-linha").length, 1); assert.match(texto(a.raiz), /movida para a Lixeira/);
});

test("falha preserva o estado: erro definitivo, 'nada foi alterado', resultado incerto, resposta fora do esquema, rede e sessão — a lista, a leitura e as contagens ficam como estavam, com frase clara e sem reler o cache", async () => {
  const casos = [[() => erroHttp(422, "acao_recusada"), /O iCloud recusou a ação\. Nada foi alterado\./, "erro"], [() => erroHttp(409, "identidade_divergente"), /não é mais a mesma/, "erro"], [() => erroHttp(409, "uidvalidity_mudou"), /reorganizada/, "erro"], [() => erroHttp(404, "mensagem_inexistente"), /não está mais na caixa/, "erro"],
    [() => erroHttp(409, "acao_em_andamento"), /outra operação em andamento/, "erro"], [() => erroHttp(422, "acao_nao_aplicada"), /nada foi alterado/, "erro"], [() => ({ data: { ok: false, erro: "acao_incerta" }, error: null }), /PODE ter sido alterada/, "aviso"], [() => erroHttp(502, "confirmacao_ausente"), /não confirmou/, "aviso"],
    [() => ok({ resultado: "talvez", acao: "arquivar", cache: "atualizado" }), /não reconhece/, "erro"], [() => ({ data: null, error: { name: "FunctionsFetchError", message: "x" } }), /Sem conexão/, "erro"], [() => erroHttp(401, "sem_login"), /Entre de novo/, "erro"], [() => erroHttp(500, "interno"), /Erro interno/, "erro"]];
  for (const [resp, frase, tipo] of casos) {
    const a = montar({ aoOrganizar: resp }); await abrirMsg(a, 0); const lidasAntes = a.lidas.filter((t) => t === "inbox_mensagens_ref").length, linhasAntes = comClasse(a.raiz, "inb-linha").length, tAntes = texto(comClasse(a.raiz, "inb-sub")[0] || a.raiz);
    acaoBtn(a, "Arquivar").onclick(); await assentar();
    assert.match(texto(a.raiz), frase, String(frase)); assert.equal(a.org().length, 1);
    assert.equal(comClasse(a.raiz, "inb-linha").length, linhasAntes, "a lista não mudou"); assert.equal(comClasse(a.raiz, "inb-janela")[0].attrs["data-painel"], "leitura", "a leitura continua aberta");
    assert.equal(a.lidas.filter((t) => t === "inbox_mensagens_ref").length, lidasAntes, "o cache NÃO foi relido: nada mudou"); assert.ok(!acaoBtn(a, "Arquivar").attrs.disabled, "destravou para tentar de novo");
    const aviso = todos(a.raiz).find((n) => /rac-alerta/.test(n.className || "") && frase.test(texto(n))); assert.ok(aviso, "o aviso aparece como alerta"); assert.deepEqual(a.gravacoes, [], "o navegador nunca grava o cache");
    assert.ok(!texto(a.raiz).includes("texto cru do servidor"));
  }
});

test("iCloud sem MOVE: o primeiro 'acao_indisponivel' explica, e a tela passa a não oferecer arquivar, excluir, spam nem mover (com o motivo); marcar lida continua", async () => {
  const a = montar({ aoOrganizar: () => erroHttp(422, "acao_indisponivel") }); await abrirMsg(a, 0); acaoBtn(a, "Arquivar").onclick(); await assentar();
  assert.match(texto(a.raiz), /não oferece mover mensagens por um caminho seguro/); assert.match(texto(a.raiz), /não usa alternativa que apague/);
  for (const r of ["Arquivar", "Excluir"]) { const b = acaoBtn(a, r); assert.equal(b.attrs["aria-disabled"], "true"); assert.match(b.attrs.title, /não oferece mover mensagens com segurança/); b.onclick(); await esperar(); assert.match(texto(a.raiz), /Arquivar: O iCloud desta conta não oferece|Excluir: O iCloud desta conta não oferece/, "tocar explica o motivo (no celular não há title)"); }
  const menu = await maisMenu(a); assert.ok(item(menu, "Marcar como lida"), "lida/não lida não depende de MOVE"); assert.equal(item(menu, "Marcar como lida").attrs["aria-disabled"], undefined);
  for (const t of ["Mover para spam", "Mover para pasta"]) assert.equal(item(menu, t).attrs["aria-disabled"], "true", t); assert.equal(a.org().length, 1, "não insiste: nenhum pedido novo");
});

test("Mais: spam e 'Não é spam' conforme a pasta; mover para pasta lista SÓ pastas selecionáveis da MESMA conta (sem a atual, sem a inativa, sem a de outra conta) e envia o ID, nunca o nome", async () => {
  const a = montar({ aoOrganizar: (b) => { const i = a.dados.mensagens.findIndex((m) => m.uid === b.uid && m.pasta_id === b.pasta_id); a.dados.mensagens.splice(i, 1); return ok({ resultado: "aplicada", acao: b.acao, cache: "atualizado", destino_pasta_id: b.destino_pasta_id || P_SPM }); } }); await abrirMsg(a, 0);
  let menu = await maisMenu(a); assert.ok(item(menu, "Mover para spam") && !item(menu, "Não é spam"));
  item(menu, "Mover para pasta").onclick(); await esperar(); menu = comClasse(a.raiz, "inb-menu")[0];
  const nomes = comClasse(menu, "inb-menu-pasta").map((b) => texto(b).trim()); assert.equal(nomes.length, 5, "Arquivo, Enviados, Projetos, Spam e Lixeira: " + nomes.join("|"));
  assert.ok(!nomes.some((n) => /INBOX|Pai|outra conta/.test(n)), "sem a pasta atual, sem a não selecionável, sem pasta de outra conta"); assert.ok(["Arquivo", "Projetos", "Spam", "Lixeira", "Enviados"].every((n) => nomes.includes(n)), nomes.join("|"));
  comClasse(menu, "inb-menu-pasta").find((b) => texto(b).includes("Projetos")).onclick(); await assentar();
  assert.deepEqual(a.org().map((c) => c[1].body), [{ operacao: "organizar_mensagem", conta_id: UUID, pasta_id: P_IN, uid: 1, acao: "mover", destino_pasta_id: P_PRJ }]); assert.match(texto(a.raiz), /Mensagem movida para “Projetos”\./); assert.equal(comClasse(a.raiz, "inb-linha").length, 2);
  // numa mensagem que está no Spam: "Não é spam" no lugar de "Mover para spam"
  const b = montar({ aoOrganizar: () => ok({}), extra: { mensagens: [MSG(5, { pasta_id: P_SPM })] } }); await b.abrir(UUID, P_SPM); await assentar(); comClasse(b.raiz, "inb-linha")[0].onclick(); await assentar();
  const m2 = await maisMenu(b); assert.ok(item(m2, "Não é spam") && !item(m2, "Mover para spam")); assert.notEqual(item(m2, "Não é spam").attrs["aria-disabled"], "true");
  const c = montar({ aoOrganizar: () => ok({}), extra: { mensagens: [MSG(6, { pasta_id: P_LIX })] } }); await c.abrir(UUID, P_LIX); await assentar(); comClasse(c.raiz, "inb-linha")[0].onclick(); await assentar();
  assert.equal(acaoBtn(c, "Excluir").attrs["aria-disabled"], "true", "já está na Lixeira: não há exclusão definitiva"); assert.match(acaoBtn(c, "Excluir").attrs.title, /exclusão definitiva/);
});

test("código: o navegador só pede ao serviço (organizar_mensagem), nunca grava o cache, nunca monta comando IMAP nem nome de pasta; a lista só muda por releitura do banco depois da confirmação", () => {
  const js = lerArq("js/inbox.js").replace(/\/\*[\s\S]*?\*\//g, ""), srv = lerArq("js/inbox-servico.js");
  assert.ok(!/EXPUNGE|\\Deleted|\bUID\s+(STORE|MOVE|COPY)\b|\bSTORE\b/.test(js + srv.replace(/\/\*[\s\S]*?\*\//g, "")), "nenhum comando IMAP no navegador");
  assert.deepEqual([...js.matchAll(/\.(insert|update|upsert|delete)\(/g)].map((m) => m[1]).sort(), ["insert", "update"], "só o cadastro da conta (insert) e as preferências (update de inbox_contas): nada de inbox_mensagens_ref nem de inbox_pastas");
  assert.ok(!/from\("inbox_(mensagens_ref|pastas)"\)\.(insert|update|upsert|delete)/.test(js));
  const org = js.slice(js.indexOf("function inboxOrganizar"), js.indexOf("function inboxBtnOrg")); assert.ok(org.indexOf("inboxChamar(\"organizar_mensagem\"") < org.indexOf("inboxLer()"), "primeiro o servidor, depois a releitura");
  assert.ok(!/INBX\.msgs\.(push|splice|filter\(.*=\s*)|\.lida\s*=|\.pasta_id\s*=/.test(org), "a função não altera as mensagens em memória: só relê");
});
