// RAC Inbox: a tela (js/inbox.js) num DOM de mentira, sem navegador e sem rede. Confere os estados (carregando, estrutura pendente, erro, vazio, desconectado), que NENHUMA mensagem aparece
// sem o "exemplo da interface" (rotulado e isolado em js/inbox-demo.js), que nenhuma ação altera caixa, que só o cadastro de conta grava, que a casa não vê nada, o fluxo da credencial
// (a senha vai UMA vez ao serviço, o campo é limpo na hora e ela nunca aparece na tela nem no estado), o desenho responsivo e a rota/versões/cache do site.
// TUDO FICTÍCIO: "abcd-efgh-ijkl-mnop" é um exemplo de formato, não a senha de ninguém.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { lerArq, registro } from "./_rotas.mjs";

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

test("estados: carregando, estrutura pendente (051 não aplicada), erro com 'tentar de novo' — e nunca uma mensagem inventada", async () => {
  const a = ambiente({ erroLeitura: { message: 'relation "public.inbox_contas" does not exist', code: "42P01" } });
  const p = a.ctx.renderInbox();
  assert.match(texto(a.raiz), /Carregando as caixas/, "mostra o carregando enquanto lê"); await p;
  assert.match(texto(a.raiz), /migration 051 pendente/); assert.equal(comClasse(a.raiz, "inb-linha").length, 0); assert.equal(a.titulo.textContent, "Inbox");
  const b = ambiente({ erroLeitura: { message: "Failed to fetch" } }); await b.abrir();
  assert.match(texto(b.raiz), /Não consegui carregar o Inbox agora/); assert.ok(botao(b.raiz, "Tentar de novo")); assert.ok(!/migration 051/.test(texto(b.raiz)), "erro de rede não é 'migration pendente'");
  assert.equal(comClasse(b.raiz, "inb-janela").length, 0, "no erro não desenha a janela de mensagens");
});

test("sem contas: estado vazio com o formulário de cadastro; com contas sem conexão: a caixa 'não está vazia, está sem leitura'; nenhuma mensagem sem o exemplo", async () => {
  const v = ambiente(); await v.abrir();
  assert.match(texto(v.raiz), /Nenhuma conta cadastrada/); assert.ok(botao(v.raiz, "Cadastrar conta")); assert.match(texto(v.raiz), /Sem senha neste formulário/);
  const d = ambiente({ contas: [CONTA, { ...CONTA, id: "22222222-2222-4222-8222-222222222222", apelido: "Trabalho", endereco: "t@icloud.example", estado: "desconectada" }] }); await d.abrir();
  let t = texto(d.raiz);
  assert.match(t, /Nenhuma mensagem sincronizada ainda\s+Escolha uma conta conectada e sincronize\. Nada aqui é exemplo nem simulação/);
  assert.equal(comClasse(d.raiz, "inb-linha").length, 0, "nenhuma linha de mensagem sem o exemplo"); assert.ok(!/DEMONSTRAÇÃO/.test(t), "e nada rotulado como exemplo sem o pedido");
  assert.match(t, /Caixa unificada/); assert.match(t, /Pessoal/); assert.match(t, /Trabalho/); assert.match(t, /Categorias/); assert.match(t, /Pessoal[\s\S]*Trabalho[\s\S]*Financeiro[\s\S]*Compras[\s\S]*Entregas[\s\S]*Newsletters[\s\S]*Notificações[\s\S]*Promoções/);
  assert.match(t, /Contagem parcial/, "a unificada avisa que a conta sem conexão não entra na soma");
  assert.ok(comClasse(d.raiz, "inb-ponto").every((p) => p.attrs["aria-label"] && p.attrs.title), "o estado da conta nunca é só a cor: tem rótulo");
  comClasse(d.raiz, "inb-conta")[0].onclick(); t = texto(d.raiz);
  assert.match(t, /Esta caixa ainda não foi lida/); assert.match(t, /não está vazia, está sem leitura/); assert.match(t, /Sem credencial/); assert.match(t, /Nova/, "o estado da conta aparece por extenso");
  assert.ok(!/A conexão será liberada quando o serviço de e-mail for publicado/.test(t), "com a função publicada, o aviso de espera some");
  assert.ok(botao(d.raiz, "Conectar"), "com o serviço publicado a conta oferece Conectar");
  assert.equal(todos(d.raiz).filter((n) => n.tag === "input" && n.attrs.type === "password").length, 0, "o campo de senha só aparece depois de pedir Conectar");
  assert.equal(d.chamadas.length, 0, "abrir a conta não chama o serviço nem manda credencial");
  const sp = ambiente({ contas: [CONTA], publicado: false }); await sp.abrir(); comClasse(sp.raiz, "inb-conta")[0].onclick();
  assert.match(texto(sp.raiz), /A conexão será liberada quando o serviço de e-mail for publicado/, "ramo de segurança: com a flag desligada, nada é pedido");
  assert.equal(todos(sp.raiz).filter((n) => n.tag === "input" && n.attrs.type === "password").length, 0, "sem serviço publicado não há campo de senha");
  assert.deepEqual(d.gravacoes, [], "abrir a tela só lê");
});

test("o 'exemplo da interface': isolado no módulo próprio, rotulado, com lista agrupada (remetente, assunto, prévia, horário), filtros e leitura completa; nenhuma ação funciona e nada é gravado", async () => {
  const a = ambiente({ contas: [CONTA] }); await a.abrir();
  assert.equal(a.ctx.INBOX_DEMO, undefined, "os dados de exemplo nem estão carregados até o dono pedir");
  botao(a.raiz, "Ver exemplo da interface").onclick(); await esperar();
  assert.ok(Array.isArray(a.ctx.INBOX_DEMO) && a.ctx.INBOX_DEMO.length >= 5);
  const linhas = comClasse(a.raiz, "inb-linha"); assert.equal(linhas.length, a.ctx.INBOX_DEMO.length);
  const t = texto(a.raiz); assert.equal(comClasse(a.raiz, "inb-demo").length, 1, "uma faixa só, no topo"); assert.match(texto(comClasse(a.raiz, "inb-demo")[0]), /DEMONSTRAÇÃO\s+Mensagens fictícias; nenhuma caixa real\./);
  for (const c of ["inb-remetente", "inb-assunto", "inb-previa", "inb-hora", "inb-avatar"]) assert.ok(comClasse(a.raiz, c).length >= linhas.length, c + " em cada linha");
  const grupos = comClasse(a.raiz, "inb-data").map((n) => n.textContent).filter((x, i, l) => l.indexOf(x) === i);
  /* o exemplo é de "minutos/horas atrás" pelo relógio real: entre 00:00 e ~03:10 UTC a mais antiga já cai em "Ontem" e a mais nova ainda em "Hoje" (ou as duas em "Ontem"); fora disso só há "Hoje" */
  const recentes = grupos.filter((g) => g === "Hoje" || g === "Ontem");
  assert.ok(recentes.length >= 1 && recentes.length <= 2 && grupos.slice(0, recentes.length).join() === recentes.join(), "os grupos mais recentes vêm primeiro: Hoje e, perto da meia-noite, Ontem");
  assert.deepEqual(grupos.slice(recentes.length), ["Esta semana", "Anteriores"], "grupos de data como no Mail");
  assert.ok(linhas.some((l) => / inb-linha--nova /.test(" " + l.className + " ")), "não lidas destacadas"); assert.ok(comClasse(a.raiz, "inb-ico--anexo").length >= 1, "anexo sinalizado por ícone");
  assert.ok(linhas.every((l) => /Não lida\. |^[^.]+\. /.test(l.attrs["aria-label"])), "cada linha tem rótulo de acessibilidade");
  /* filtros */
  botao(a.raiz, "Com anexo").onclick(); assert.ok(comClasse(a.raiz, "inb-linha").length < linhas.length && comClasse(a.raiz, "inb-linha").length >= 1); assert.equal(botao(a.raiz, "Com anexo").attrs["aria-pressed"], "true");
  botao(a.raiz, "Todas").onclick();
  /* leitura */
  assert.match(texto(comClasse(a.raiz, "inb-leitura")[0]), /Nenhuma mensagem selecionada/);
  comClasse(a.raiz, "inb-linha")[0].onclick(); let leitura = comClasse(a.raiz, "inb-leitura")[0], lt = texto(leitura);
  assert.match(lt, /Bem-vindo ao exemplo do RAC Inbox/); assert.match(lt, /equipe@example\.com/); assert.match(lt, /Para: você/); assert.match(lt, /\d{1,2} de [a-zç]+ de \d{4}, \d{2}:\d{2}/, "data por extenso");
  assert.equal(comClasse(a.raiz, "inb-janela")[0].attrs["data-painel"], "leitura", "no iPhone a leitura passa a ser a tela própria");
  const acoes = comClasse(leitura, "inb-btn-ico"); assert.deepEqual(acoes.map((b) => b.attrs["aria-label"]), ["Responder", "Responder a todos", "Encaminhar", "Arquivar", "Excluir", "Mais"]);
  for (const b of acoes) { assert.equal(b.attrs["aria-disabled"], "true", b.attrs["aria-label"] + " desligada"); assert.equal(b.onclick, null, b.attrs["aria-label"] + " não faz nada"); assert.match(b.attrs.title, /próximas etapas|mensagem carregada, numa conta conectada/, "diz por que está desligada"); }
  for (const b of acoes.slice(3)) assert.match(b.attrs.title, /próximas etapas/, b.attrs["aria-label"] + " ainda é de outra etapa");
  const novaDemo = todos(a.raiz).find((n) => n.tag === "button" && /Nova mensagem/.test(texto(n))); assert.equal(novaDemo.attrs["aria-disabled"], "true", "no exemplo não há envio: nova mensagem fica desligada (clicar só explica)");
  comClasse(a.raiz, "inb-linha")[1].onclick(); leitura = comClasse(a.raiz, "inb-leitura")[0]; lt = texto(leitura);
  assert.match(lt, /1 anexo/); assert.match(lt, /comprovante-exemplo\.pdf/); assert.match(lt, /PDF/); assert.match(lt, /184 KB/);
  comClasse(comClasse(a.raiz, "inb-leitura")[0], "inb-voltar")[0].onclick(); assert.equal(comClasse(a.raiz, "inb-janela")[0].attrs["data-painel"], "lista", "voltar leva à lista");
  assert.deepEqual(a.gravacoes, [], "nada foi gravado: o exemplo não toca o banco"); assert.equal(a.chamadas.length, 0, "nem chamou o serviço");
  botao(a.raiz, "Sair do exemplo").onclick(); assert.equal(comClasse(a.raiz, "inb-linha").length, 0);
  const demo = fs.readFileSync(new URL("../js/inbox-demo.js", import.meta.url), "utf8");
  for (const m of a.ctx.INBOX_DEMO) { assert.match(m.id, /^demo-/); assert.match(m.endereco, /@example\.com$/); assert.equal(m.conta_id, "demo"); }
  assert.ok(!/fetch|SB\.|XMLHttp|localStorage|import\(|require\(/.test(demo.replace(/\/\*[\s\S]*?\*\//g, "")), "o exemplo não usa rede, banco nem armazenamento");
  const srv = fs.readFileSync(new URL("../js/inbox-servico.js", import.meta.url), "utf8"); assert.ok(!/inbox-demo|INBOX_DEMO/.test(srv), "o serviço real nunca importa o exemplo");
});

test("credencial: o formulário só existe com o serviço publicado; a senha vai UMA vez, o campo é limpo antes do envio, e ela nunca aparece na tela nem no estado; remover pede confirmação", async () => {
  const a = ambiente({ contas: [CONTA], publicado: true }); await a.abrir();
  comClasse(a.raiz, "inb-conta")[0].onclick(); assert.match(texto(a.raiz), /Sem credencial/); botao(a.raiz, "Conectar").onclick();
  const senhaCampo = () => todos(a.raiz).find((n) => n.attrs.id === "inb-cred-senha"), usuCampo = () => todos(a.raiz).find((n) => n.attrs.id === "inb-cred-usuario");
  assert.equal(senhaCampo().attrs.type, "password"); assert.equal(senhaCampo().attrs.autocomplete, "off"); assert.equal(usuCampo().value, "pessoa@icloud.example", "o login vem preenchido com o endereço da conta");
  assert.match(texto(a.raiz), /Nunca use a senha principal da conta Apple/);
  /* formato errado (senha principal): nada é enviado e o erro não repete o digitado */
  const doc = a.ctx.document, vals = { "inb-cred-usuario": "pessoa@icloud.example", "inb-cred-senha": "MinhaSenhaPrincipal1!" }, campos = {};
  doc.getElementById = ((o) => (id) => { if (vals[id] !== undefined) { campos[id] ??= { get value() { return vals[id]; }, set value(v) { vals[id] = v; } }; return campos[id]; } return o(id); })(doc.getElementById);
  botao(a.raiz, "Guardar no cofre").onclick(); assert.match(texto(a.raiz), /senha específica de app/); assert.equal(a.chamadas.length, 0, "senha no formato errado nem sai do navegador");
  assert.ok(!texto(a.raiz).includes("MinhaSenhaPrincipal1!"), "o erro não repete o que foi digitado"); assert.equal(vals["inb-cred-senha"], "", "o campo foi limpo mesmo com erro");
  /* senha específica de app: vai uma vez ao serviço, com a sessão do dono */
  vals["inb-cred-senha"] = SENHA_APP; botao(a.raiz, "Guardar no cofre").onclick(); await esperar(); await esperar();
  assert.equal(a.chamadas.length, 1); assert.deepEqual(a.chamadas[0], ["rac-inbox", { body: { operacao: "credencial_guardar", conta_id: UUID, usuario: "pessoa@icloud.example", senha_app: SENHA_APP } }]);
  assert.equal(vals["inb-cred-senha"], "", "o campo da senha foi limpo na hora do envio");
  assert.match(texto(a.raiz), /Credencial guardada no cofre\. Ela não volta ao navegador/); assert.ok(!texto(a.raiz).includes(SENHA_APP), "a senha não aparece na tela");
  assert.ok(!JSON.stringify(vm.runInContext("INBX", a.ctx)).includes(SENHA_APP), "nem no estado da tela"); assert.deepEqual(a.gravacoes, [], "a tela não grava a credencial em tabela nenhuma");
  /* falhas do serviço: só mensagem fixa, nunca texto do servidor */
  const b = ambiente({ contas: [CONTA], publicado: true, invoke: () => ({ data: null, error: { name: "FunctionsHttpError", message: `erro cru com ${SENHA_APP}`, context: { status: 422, json: () => Promise.resolve({ ok: false, erro: "credencial_invalida" }) } } }) });
  await b.abrir(); comClasse(b.raiz, "inb-conta")[0].onclick(); botao(b.raiz, "Conectar").onclick();
  const vb = { "inb-cred-usuario": "pessoa@icloud.example", "inb-cred-senha": SENHA_APP }; b.ctx.document.getElementById = ((o) => (id) => (vb[id] !== undefined ? { get value() { return vb[id]; }, set value(v) { vb[id] = v; } } : o(id)))(b.ctx.document.getElementById);
  botao(b.raiz, "Guardar no cofre").onclick(); await esperar(); await esperar(); await esperar();
  assert.match(texto(b.raiz), /O provedor recusou a credencial/); assert.ok(!texto(b.raiz).includes(SENHA_APP) && !texto(b.raiz).includes("erro cru"), "nada do servidor vaza para a tela");
  /* conta com credencial: estado por extenso, substituir e desconectar (com confirmação), sem nunca mostrar a credencial */
  const c = ambiente({ contas: [CONTA], credenciais: [{ conta_id: UUID, estado: "ativa" }], publicado: true, invoke: () => ({ data: { ok: true, removida: true }, error: null }) });
  await c.abrir(); comClasse(c.raiz, "inb-conta")[0].onclick(); assert.match(texto(c.raiz), /Ainda não sincronizada/); assert.ok(!botao(c.raiz, "Substituir senha") && !botao(c.raiz, "Desconectar e remover a credencial"), "conexão em ordem: as ações raras ficam escondidas"); opcoes(c.raiz); assert.ok(botao(c.raiz, "Substituir senha")); assert.ok(!botao(c.raiz, "Conectar"));
  botao(c.raiz, "Desconectar e remover a credencial").onclick(); await esperar(); await esperar();
  assert.deepEqual(c.chamadas[0], ["rac-inbox", { body: { operacao: "credencial_remover", conta_id: UUID } }]); assert.match(texto(c.raiz), /Credencial removida do cofre/);
  const d = ambiente({ contas: [CONTA], credenciais: [{ conta_id: UUID, estado: "invalida" }], publicado: true }); await d.abrir(); comClasse(d.raiz, "inb-conta")[0].onclick();
  assert.match(texto(d.raiz), /Credencial recusada pelo provedor/); assert.match(texto(d.raiz), /Gere uma nova senha de app e substitua/);
  const e = ambiente({ contas: [CONTA], credenciais: [{ conta_id: UUID, estado: "ativa" }], publicado: true }); e.ctx.confirm = () => false; await e.abrir(); comClasse(e.raiz, "inb-conta")[0].onclick(); opcoes(e.raiz);
  botao(e.raiz, "Desconectar e remover a credencial").onclick(); await esperar(); assert.equal(e.chamadas.length, 0, "sem confirmar, nada é removido");
});

test("cadastrar conta: valida antes (sem senha em lugar nenhum), só 'inbox_contas.insert' com provedor, apelido, endereço e estado 'nova'; duplicada e estrutura pendente viram mensagem no campo", async () => {
  const a = ambiente(); await a.abrir();
  const campos = todos(a.raiz).filter((n) => n.tag === "input"); assert.deepEqual(campos.map((c) => c.attrs.id), ["inb-apelido", "inb-endereco"], "só dois campos de texto: nenhum para senha");
  assert.ok(!todos(a.raiz).some((n) => n.attrs && (n.attrs.type === "password" || /senha|password/i.test(n.attrs.id || ""))), "nenhum campo de senha no cadastro");
  const doc = a.ctx.document, vals = { "inb-apelido": "Pessoal", "inb-endereco": "invalido" };
  doc.getElementById = ((orig) => (id) => (vals[id] !== undefined ? { value: vals[id] } : orig(id)))(doc.getElementById);
  const sel = todos(a.raiz).find((n) => n.tag === "select"); sel.value = "icloud";
  botao(a.raiz, "Cadastrar conta").onclick(); assert.match(texto(a.raiz), /endereço de e-mail válido/); assert.deepEqual(a.gravacoes, [], "endereço inválido não chega ao banco");
  vals["inb-endereco"] = "pessoa@icloud.example";
  const sel2 = todos(a.raiz).find((n) => n.tag === "select"); sel2.value = "gmail"; botao(a.raiz, "Cadastrar conta").onclick(); assert.match(texto(a.raiz), /fase futura/); assert.deepEqual(a.gravacoes, []);
  todos(a.raiz).find((n) => n.tag === "select").value = "icloud"; botao(a.raiz, "Cadastrar conta").onclick(); await esperar();
  assert.deepEqual(a.gravacoes, [["inbox_contas", "insert", { provedor: "icloud", apelido: "Pessoal", endereco: "pessoa@icloud.example", estado: "nova" }]], "só o cadastro, sem dono (o banco preenche com auth.uid()) e sem credencial");
  assert.match(texto(a.raiz), /Conta cadastrada\. Conecte-a com a senha específica de app para poder sincronizar/);
  const dup = ambiente({ erroGravar: { code: "23505", message: "duplicate key" } }); await dup.abrir();
  dup.ctx.document.getElementById = ((o) => (id) => (vals[id] !== undefined ? { value: vals[id] } : o(id)))(dup.ctx.document.getElementById);
  todos(dup.raiz).find((n) => n.tag === "select").value = "icloud";
  botao(dup.raiz, "Cadastrar conta").onclick(); await esperar(); assert.match(texto(dup.raiz), /Esta conta já está cadastrada/);
});

test("a Fernanda (casa) não vê nada do Inbox; a rota é só do dono e não está no menu da casa; módulos e cache offline", async () => {
  const a = ambiente({ dono: false, contas: [CONTA] }); await a.abrir();
  assert.match(texto(a.raiz), /só da conta do dono/); assert.equal(comClasse(a.raiz, "inb-janela").length, 0);
  const R = registro(), r = R.rotas.find((x) => x.id === "inbox");
  assert.ok(r && r.grupo === "Painel" && !r.casa && JSON.stringify(r.mods) === '["inbox"]' && r.area === "hoje"); assert.ok(!R.DA_CASA.includes("inbox"));
  assert.match(lerArq("index.html"), /<section id="inbox" hidden><div id="inbox-view" class="stack"><\/div><\/section>/);
  assert.match(lerArq("js/app.js"), /inbox:\["kit","inbox-servico"\]/, "o módulo declara o kit e o cliente do serviço");
  for (const arq of ["js/inbox.js", "js/inbox-servico.js", "js/inbox-demo.js"]) assert.ok(lerArq("sw.js").includes(`"./${arq}"`), arq + " no cache offline");
});

test("desenho: três áreas no desktop (lista agrupada, leitura com cabeçalho e anexos); tablet com gaveta; iPhone com lista em tela cheia, leitura e caixas em telas próprias, barra de ações embaixo, áreas seguras e alvo de toque; só tokens", () => {
  const css = lerArq("css/rac.css"), i = css.indexOf("RAC Inbox · I1"); assert.ok(i > 0); const bloco = css.slice(i);
  assert.match(bloco, /\.inb-janela\{display:grid;grid-template-columns:220px minmax\(300px,34%\) minmax\(0,1fr\)/, "lateral + lista + leitura, com a leitura sempre larga");
  assert.match(bloco, /@media\(max-width:1180px\) and \(min-width:861px\)\{[\s\S]*\.inb-janela\{grid-template-columns:minmax\(280px,40%\) minmax\(0,1fr\)\}[\s\S]*\[data-painel="caixas"\]>\.inb-lateral\{display:flex;position:fixed/, "tablet: a lateral vira gaveta");
  const movel = bloco.slice(bloco.indexOf("@media(max-width:860px)")); assert.ok(movel.length > 400);
  assert.match(movel, /\.inb-janela\[data-painel="leitura"\]>\.inb-leitura\{[^}]*position:fixed;inset:0/, "a leitura abre em tela própria"); assert.match(movel, /\[data-painel="caixas"\]>\.inb-lateral/, "as caixas também");
  assert.match(movel, /\.inb-acoes\{position:fixed;left:0;right:0;bottom:0;/, "barra de ações embaixo"); assert.match(movel, /\.inb-titulo\{font-size:calc\(34px/, "título grande");
  for (const lado of ["top", "right", "bottom", "left"]) assert.ok(movel.includes(`env(safe-area-inset-${lado}`), "área segura: " + lado);
  assert.match(movel, /\.inb-item,\.inb-pasta,\.inb-conta\{min-height:var\(--rac-alvo\)\}/); assert.match(movel, /\.inb-btn-ico\{width:var\(--rac-alvo\);height:var\(--rac-alvo\)/); assert.match(bloco, /\.inb-voltar\{display:none;[^}]*min-height:var\(--rac-alvo\)/);
  assert.match(bloco, /\.inb-linha:focus-visible[\s\S]*\{outline:2px solid var\(--rac-foco\)/, "foco visível");
  assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(bloco.replace(/\/\*[\s\S]*?\*\//g, "")), "nenhuma cor escrita: só var(--rac-*) (os temas claro e escuro vêm dos tokens)");
  assert.match(movel, /\.inb-janela\[data-painel="leitura"\]>\.inb-leitura\{[^}]*background:var\(--rac-papel-2\)/, "fundo opaco na tela cheia (o papel é translúcido)");
  assert.match(movel, /z-index:var\(--rac-z-janela\)/, "acima da barra inferior");
  assert.ok(!/--rac-[a-z0-9-]+\s*:/.test(bloco.replace(/\/\*[\s\S]*?\*\//g, "")), "o Inbox não define token novo: nenhum Design System paralelo");
  const usados = new Set([...bloco.matchAll(/var\((--rac-[a-z0-9-]+)\)/g)].map((m) => m[1])), definidos = new Set([...css.matchAll(/(--rac-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  for (const t of usados) assert.ok(definidos.has(t), "token inexistente: " + t);
});

/* ---------- I2: a caixa REAL (lista do cache, sincronizar, ler sob demanda, anexo) ---------- */
const assentar = async () => { for (let i = 0; i < 14; i++) await esperar(); };
const P_IN = "aaaaaaaa-0000-4000-8000-0000000000a1", P_ENV = "aaaaaaaa-0000-4000-8000-0000000000a2";
const CONTA_OK = { ...CONTA, estado: "conectada" };
const PASTAS = () => [{ id: P_IN, conta_id: UUID, nome_externo: "INBOX", nome_exibicao: "INBOX", uso: "entrada", total: 3, nao_lidas: 1 }, { id: P_ENV, conta_id: UUID, nome_externo: "Sent Messages", nome_exibicao: "Enviados", uso: "enviados", total: 1, nao_lidas: 0 }];
const AGORA = Date.now();
const MSG = (n, extra = {}) => ({ id: "dddddddd-0000-4000-8000-00000000000" + n, conta_id: UUID, pasta_id: P_IN, uid: n, uidvalidity: 700, recebida_em: new Date(AGORA - n * 3600000).toISOString(), assunto: "Assunto " + n, remetente_nome: "Ana " + n, remetente_endereco: "ana" + n + "@exemplo.com", destinatarios: [{ nome: "Eu", endereco: "eu@icloud.com" }], lida: n !== 1, sinalizada: false, respondida: false, tamanho: 1000, anexo_provavel: n === 2, ...extra });
const REAL = (extra = {}) => ({ contas: [CONTA_OK], credenciais: [{ conta_id: UUID, estado: "ativa" }], pastas: PASTAS(), mensagens: [MSG(1), MSG(2), MSG(3), MSG(4, { pasta_id: P_ENV, assunto: "Enviada" })], sincs: [{ pasta_id: P_IN, ultima_ok_em: "2026-11-14T10:20:00.000Z", erro: null, falhas_seguidas: 0 }], ...extra });
const ok = (dados) => ({ data: { ok: true, ...dados }, error: null });
const erroHttp = (status, cod) => ({ data: null, error: { name: "FunctionsHttpError", message: "texto cru do servidor", context: { status, json: () => Promise.resolve({ ok: false, erro: cod }) } } });

test("lista REAL: as mensagens do cache da pasta de entrada, sem prévia (o corpo não é guardado), sem misturar com o exemplo; filtros, pastas, caixa unificada e última sincronização; só lê", async () => {
  const a = ambiente(REAL()); await a.abrir(UUID); await assentar();
  const linhas = () => comClasse(a.raiz, "inb-linha"), t0 = texto(a.raiz);
  assert.equal(linhas().length, 3, "só a caixa de entrada da conta"); for (const s of ["Assunto 1", "Assunto 2", "Assunto 3", "Ana 1"]) assert.ok(t0.includes(s), s);
  assert.ok(!t0.includes("Enviada") && !t0.includes("DEMONSTRAÇÃO"), "nada de outra pasta nem do exemplo");
  assert.equal(comClasse(a.raiz, "inb-previa").length, 0, "não há prévia: o corpo não é guardado");
  assert.equal(linhas().filter((l) => (" " + l.className + " ").includes(" inb-linha--nova ")).length, 1, "uma não lida, destacada");
  assert.match(t0, /3 mensagens · 1 não lidas/); assert.match(t0, /Sincronizada (hoje|ontem|em \d{2}\/\d{2}) às \d{2}:\d{2}\./); assert.ok(sincBtn(a.raiz), "sincronizar é o ícone do topo"); assert.ok(!botao(a.raiz, "Testar conexão") && !botao(a.raiz, "Substituir senha") && !botao(a.raiz, "Sincronizar agora"), "nada de botões grandes na conexão em ordem"); assert.equal(comClasse(a.raiz, "inb-conexao--compacta").length, 1);
  assert.ok(linhas().every((l) => /^(Não lida\. )?Ana \d\. Assunto \d$/.test(l.attrs["aria-label"])), "rótulo de acessibilidade em cada linha");
  botao(a.raiz, "Não lidas").onclick(); assert.equal(linhas().length, 1); botao(a.raiz, "Com anexo").onclick(); assert.equal(linhas().length, 1, "o anexo provável da mensagem 2"); assert.ok(texto(linhas()[0]).includes("Assunto 2"));
  botao(a.raiz, "Todas").onclick();
  comClasse(a.raiz, "inb-pasta").find((b) => texto(b).includes("Enviados")).onclick();
  assert.deepEqual(linhas().map((l) => texto(l).includes("Enviada")), [true], "a pasta Enviados mostra só as dela");
  const u = ambiente(REAL()); await u.abrir(); await assentar(); assert.equal(comClasse(u.raiz, "inb-linha").length, 3, "a caixa unificada reúne as caixas de ENTRADA");
  assert.deepEqual(a.gravacoes, [], "ler a lista não grava nada"); assert.equal(a.chamadas.length, 0, "e não chama o serviço (a lista vem do cache)");
});

test("sincronizar: a primeira vez lista as pastas e depois sincroniza a de entrada; o botão fica ocupado e não duplica; o resultado vira frase; erro vira texto fixo", async () => {
  const pastas = [], a = ambiente(REAL({ pastas, mensagens: [], sincs: [], invoke: (nome, o) => {
    const op = o.body.operacao;
    if (op === "listar_pastas") { PASTAS().forEach((p) => pastas.push(p)); return ok({ pastas: PASTAS().map((p) => ({ id: p.id, nome: p.nome_exibicao, uso: p.uso })) }); }
    return ok({ sincronizacao: { tipo: "primeira_leitura", novas: 3, atualizadas: 0, removidas: 0 }, mensagens_na_pasta: 3, mais: false });
  } })); await a.abrir(UUID); await assentar();
  assert.match(texto(a.raiz), /Nenhuma mensagem sincronizada ainda\s+Toque em Sincronizar/); assert.equal(a.chamadas.length, 0);
  botao(a.raiz, "Sincronizar agora").onclick(); await assentar();
  assert.deepEqual(a.chamadas.map((c) => [c[1].body.operacao, c[1].body.pasta_id ?? null]), [["listar_pastas", null], ["sincronizar_pasta", P_IN]], "primeiro as pastas, depois a de ENTRADA");
  assert.ok(a.chamadas.every((c) => c[0] === "rac-inbox" && c[1].body.conta_id === UUID && !JSON.stringify(c[1]).match(/senha|usuario|nome_externo|INBOX/)), "só IDs: o nome da pasta nunca vai do navegador");
  assert.match(texto(a.raiz), /Caixa lida pela primeira vez: 3 mensagens carregadas\./); assert.ok(a.gravacoes.length === 0, "o navegador não grava o cache");

  // ocupado: o botão fica desligado e um segundo toque não envia outro pedido
  let liberar; const pendente = new Promise((r) => { liberar = r; });
  const b = ambiente(REAL({ invoke: () => pendente })); await b.abrir(UUID); await assentar();
  sincBtn(b.raiz).onclick(); await esperar();
  const ocupado = sincBtn(b.raiz); assert.ok(ocupado && ocupado.attrs.disabled === "disabled" && ocupado.attrs["aria-busy"] === "true" && ocupado.attrs["aria-label"] === "Sincronizando");
  ocupado.onclick(); await esperar(); assert.equal(b.chamadas.length, 1, "um segundo toque não dispara outra sincronização");
  liberar(ok({ sincronizacao: { tipo: "novas_mensagens", novas: 2, atualizadas: 1, removidas: 1, }, mensagens_na_pasta: 5, mais: true })); await assentar();
  assert.match(texto(b.raiz), /2 mensagens novas\. 1 removida no provedor\. Há mais mensagens: sincronize de novo\./); assert.ok(sincBtn(b.raiz) && !sincBtn(b.raiz).attrs.disabled, "volta ao normal");

  for (const [st, cod, frase] of [[422, "credencial_invalida", /O provedor recusou a credencial/], [409, "sincronizacao_em_andamento", /Já há uma sincronização desta conta em andamento/], [502, "canal_recusado", /recusou o pedido/], [503, "banco_indisponivel", /banco do Inbox está indisponível/]]) {
    const c = ambiente(REAL({ invoke: () => erroHttp(st, cod) })); await c.abrir(UUID); await assentar(); sincBtn(c.raiz).onclick(); await assentar();
    assert.match(texto(c.raiz), frase, cod); assert.ok(!texto(c.raiz).includes("texto cru do servidor"), "nunca o texto do servidor");
  }
  const d = ambiente(REAL({ invoke: () => ok({ sincronizacao: { tipo: "inventado", novas: 1 } }) })); await d.abrir(UUID); await assentar(); sincBtn(d.raiz).onclick(); await assentar();
  assert.match(texto(d.raiz), /O serviço respondeu algo que o RAC não reconhece/, "resposta fora do esquema é recusada");
});

test("ler mensagem REAL: texto pedido na hora (só IDs e UID), parágrafos como TEXTO (nada vira HTML), anexos só baixam ao tocar; erro tem 'tentar de novo'; resposta atrasada de outra mensagem é ignorada", async () => {
  const LEIT = (texto, extra = {}) => ok({ mensagem: { texto, formato: "texto", truncado: false, anexos: [], ...extra } });
  const a = ambiente(REAL({ invoke: (nome, o) => o.body.operacao === "ler_mensagem" ? LEIT("Olá!\nlinha dois\n\nSegundo parágrafo <script>alert(1)</script> & <b>negrito</b>", { anexos: [{ parte: "2", nome: "relatório.pdf", tipo: "application/pdf", tamanho: 3, inline: false }, { parte: "3", nome: null, tipo: "image/png", tamanho: 2048, inline: true }] })
    : ok({ anexo: { nome: "../relatório.pdf", tipo: "application/pdf", tamanho_bytes: 3, base64: "QUJD" } }) })); await a.abrir(UUID); await assentar();
  comClasse(a.raiz, "inb-linha")[0].onclick();
  assert.match(texto(comClasse(a.raiz, "inb-leitura")[0]), /Lendo a mensagem…/, "carrega na hora"); await assentar();
  assert.deepEqual(a.chamadas[0], ["rac-inbox", { body: { operacao: "ler_mensagem", conta_id: UUID, pasta_id: P_IN, uid: 1 } }]);
  const L = texto(comClasse(a.raiz, "inb-leitura")[0]);
  assert.ok(L.includes("Assunto 1") && L.includes("Ana 1") && L.includes("ana1@exemplo.com") && L.includes("Para: Eu"), "cabeçalho vem do cache");
  assert.ok(L.includes("Segundo parágrafo <script>alert(1)</script> & <b>negrito</b>"), "o texto aparece LITERAL: nada é interpretado como HTML");
  assert.equal(todos(a.raiz).filter((n) => ["script", "img", "iframe", "a"].includes(n.tag)).length, 0, "nenhuma marcação perigosa na tela");
  assert.equal(comClasse(a.raiz, "inb-texto")[0].filhos.length, 2, "dois parágrafos (a quebra simples fica dentro do parágrafo)");
  assert.ok(L.includes("2 anexos") && L.includes("relatório.pdf") && L.includes("PDF") && L.includes("(sem nome)") && L.includes("2 KB"), "anexos listados, sem baixar nada ainda"); assert.equal(a.chamadas.length, 1, "só leu a mensagem");

  // baixar: vira arquivo no aparelho (Blob), com nome saneado; nada guardado
  const blobs = [], link = { click() { this.clicou = true; } };
  Object.assign(a.ctx, { atob: (s) => Buffer.from(s, "base64").toString("latin1"), Uint8Array, Blob, setTimeout: () => 0, URL: { createObjectURL: (b) => { blobs.push(b); return "blob:x"; }, revokeObjectURL() {} } });
  const origem = a.ctx.document.createElement; a.ctx.document.createElement = (tag) => (tag === "a" ? link : origem(tag)); a.ctx.document.body = { appendChild() {}, removeChild() {} };
  botao(a.raiz, "Baixar").onclick(); await assentar();
  assert.deepEqual(a.chamadas[1], ["rac-inbox", { body: { operacao: "baixar_anexo", conta_id: UUID, pasta_id: P_IN, uid: 1, parte: "2" } }]);
  assert.deepEqual([link.clicou, link.download, blobs[0].size, blobs[0].type], [true, "_relatório.pdf", 3, "application/pdf"], "nome sem caminho; conteúdo decodificado");
  assert.match(texto(a.raiz), /Anexo pronto: _relatório\.pdf\. Ele não fica guardado no RAC\./); assert.deepEqual(a.gravacoes, [], "nada gravado no banco");

  // erro de leitura: texto fixo e "tentar de novo"
  let falha = true; const b = ambiente(REAL({ invoke: () => (falha ? erroHttp(404, "mensagem_inexistente") : LEIT("Agora foi.")) })); await b.abrir(UUID); await assentar();
  comClasse(b.raiz, "inb-linha")[0].onclick(); await assentar();
  assert.match(texto(comClasse(b.raiz, "inb-leitura")[0]), /Esta mensagem não está mais na caixa\./); assert.ok(!texto(b.raiz).includes("texto cru do servidor"));
  falha = false; botao(b.raiz, "Tentar de novo").onclick(); await assentar(); assert.match(texto(comClasse(b.raiz, "inb-leitura")[0]), /Agora foi\./); assert.equal(b.chamadas.length, 2);

  // a resposta atrasada da mensagem 1 não pisa na mensagem 2 que a pessoa abriu depois
  let soltar; const lenta = new Promise((r) => { soltar = r; });
  const c = ambiente(REAL({ invoke: (nome, o) => (o.body.uid === 1 ? lenta : LEIT("Texto da dois")) })); await c.abrir(UUID); await assentar();
  comClasse(c.raiz, "inb-linha")[0].onclick(); await esperar(); comClasse(c.raiz, "inb-linha")[1].onclick(); await assentar();
  assert.match(texto(comClasse(c.raiz, "inb-leitura")[0]), /Texto da dois/); soltar(LEIT("Texto ATRASADO da um")); await assentar();
  assert.ok(!texto(c.raiz).includes("ATRASADO") && texto(comClasse(c.raiz, "inb-leitura")[0]).includes("Texto da dois"), "resposta antiga ignorada");
  // HTML convertido e mensagem longa avisam; sem corpo também
  const d = ambiente(REAL({ invoke: () => LEIT("Só o começo", { formato: "html_convertido", truncado: true }) })); await d.abrir(UUID); await assentar(); comClasse(d.raiz, "inb-linha")[0].onclick(); await assentar();
  assert.match(texto(d.raiz), /Mensagem em HTML mostrada como texto simples/); assert.match(texto(d.raiz), /Mensagem longa: mostrando só o começo\./);
  const e = ambiente(REAL({ invoke: () => LEIT("", { formato: "sem_corpo" }) })); await e.abrir(UUID); await assentar(); comClasse(e.raiz, "inb-linha")[0].onclick(); await assentar(); assert.match(texto(e.raiz), /Esta mensagem não tem texto para mostrar\./);
});

test("sem a 053, sem credencial ou sem o serviço publicado: a tela degrada com texto claro (nunca inventa mensagem, nunca erro cru) e só lê", async () => {
  const a = ambiente(REAL({ erroMsgs: true })); await a.abrir(UUID); await assentar();
  assert.ok(!/Não consegui carregar o Inbox/.test(texto(a.raiz)), "sem a 053 a lista fica vazia, sem erro"); assert.match(texto(a.raiz), /Nenhuma mensagem sincronizada ainda/); assert.equal(comClasse(a.raiz, "inb-linha").length, 0);
  const b = ambiente(REAL({ credenciais: [], mensagens: [] })); await b.abrir(UUID); await assentar();
  assert.match(texto(b.raiz), /Esta caixa ainda não foi lida\s+Conecte a conta com a senha específica de app/); assert.ok(!botao(b.raiz, "Sincronizar agora") && comClasse(b.raiz, "inb-topo-sinc").length === 0, "sem credencial não há sincronizar");
  const c = ambiente(REAL({ publicado: false })); await c.abrir(UUID); await assentar();
  assert.ok(!botao(c.raiz, "Sincronizar agora") && comClasse(c.raiz, "inb-topo-sinc").length === 0, "com o serviço desligado não há sincronizar"); assert.match(texto(c.raiz), /A conexão será liberada quando o serviço de e-mail for publicado/);
  const d = ambiente(REAL({ credenciais: [{ conta_id: UUID, estado: "invalida" }] })); await d.abrir(UUID); await assentar(); assert.match(texto(d.raiz), /O provedor recusou a credencial/);
  const e = ambiente(REAL({ sincs: [{ pasta_id: P_IN, ultima_ok_em: null, erro: "servico_indisponivel", falhas_seguidas: 2 }] })); await e.abrir(UUID); await assentar(); assert.match(texto(e.raiz), /Ainda não sincronizada\. Última tentativa falhou: O serviço de e-mail está indisponível agora\./);
  for (const x of [a, b, c, d, e]) { assert.deepEqual(x.gravacoes, []); assert.equal(x.chamadas.length, 0); }
  const f = ambiente({ dono: false, ...REAL() }); await f.abrir(UUID); assert.equal(comClasse(f.raiz, "inb-linha").length, 0, "a casa (Fernanda) não vê nada do Inbox"); assert.equal(f.lidas.length, 0, "nem consulta as tabelas");
});

test("Testar conexão: duas provas em sequência (canal, depois login no iCloud), sem ler nem gravar nada; o aviso mostra as versões e diz QUAL prova falhou", async () => {
  const CANAL = ok({ canal: "ok", funcao: "rac-inbox@i2.2", worker: "rac-inbox-worker@p7.2" });
  let liberar; const pendente = new Promise((r) => { liberar = r; });
  const a = ambiente(REAL({ invoke: (nome, o) => (o.body.operacao === "testar_canal" ? pendente : ok({})) })); await a.abrir(UUID); await assentar();
  assert.ok(!botao(a.raiz, "Testar conexão"), "discreto: só aparece em Opções"); opcoes(a.raiz); assert.ok(botao(a.raiz, "Testar conexão"), "o teste existe com a credencial guardada"); botao(a.raiz, "Testar conexão").onclick(); await esperar();
  const ocupado = botao(a.raiz, "Testando…"); assert.ok(ocupado && ocupado.attrs.disabled === "disabled" && ocupado.attrs["aria-busy"] === "true"); ocupado.onclick(); await esperar(); assert.equal(a.chamadas.length, 1, "um segundo toque não dispara outro teste");
  liberar(CANAL); await assentar();
  assert.deepEqual(a.chamadas.map((c) => c[1].body), [{ operacao: "testar_canal" }, { operacao: "testar_conta", conta_id: UUID }], "primeiro o canal (sem conta nem credencial), depois o login");
  assert.match(texto(a.raiz), /Conexão ok\. 1 de 2 · canal seguro com o servidor \(função rac-inbox@i2\.2, Worker rac-inbox-worker@p7\.2\)\. 2 de 2 · login no iCloud\. Nada foi lido nem alterado\./);
  assert.deepEqual(a.gravacoes, []); assert.ok(!a.chamadas.some((c) => /sincronizar|listar_pastas|ler_mensagem|baixar/.test(JSON.stringify(c))), "nada de sincronização nem de leitura");
  const b = ambiente(REAL({ invoke: () => erroHttp(502, "canal_recusado") })); await b.abrir(UUID); await assentar(); opcoes(b.raiz); botao(b.raiz, "Testar conexão").onclick(); await assentar();
  assert.equal(b.chamadas.length, 1, "falhou o canal: o login nem é tentado"); assert.match(texto(b.raiz), /1 de 2 · O canal seguro com o servidor falhou: O servidor de e-mail recusou o pedido/);
  const c = ambiente(REAL({ invoke: (nome, o) => (o.body.operacao === "testar_canal" ? CANAL : erroHttp(422, "credencial_invalida")) })); await c.abrir(UUID); await assentar(); opcoes(c.raiz); botao(c.raiz, "Testar conexão").onclick(); await assentar();
  assert.equal(c.chamadas.length, 2); assert.match(texto(c.raiz), /1 de 2 · canal seguro ok \(função rac-inbox@i2\.2, Worker rac-inbox-worker@p7\.2\)\. 2 de 2 · o login no iCloud falhou: O provedor recusou a credencial/); assert.ok(!texto(c.raiz).includes("texto cru do servidor"));
  const d = ambiente(REAL({ invoke: () => ok({ canal: "ok", funcao: "<script>", worker: "x" }) })); await d.abrir(UUID); await assentar(); opcoes(d.raiz); botao(d.raiz, "Testar conexão").onclick(); await assentar(); assert.match(texto(d.raiz), /O serviço respondeu algo que o RAC não reconhece/, "resposta fora do formato é recusada");
  for (const x of [ambiente(REAL({ credenciais: [] })), ambiente(REAL({ publicado: false }))]) { await x.abrir(UUID); await assentar(); assert.ok(!botao(x.raiz, "Testar conexão"), "sem credencial ou com o serviço desligado não há teste"); }
});

test("o estado da captura de produção (conta com credencial guardada e a pasta RAC-TESTE, de uso 'outra', selecionada): o botão Sincronizar existe no topo e na conexão e sincroniza A PASTA MOSTRADA", async () => {
  const P_TESTE = "aaaaaaaa-0000-4000-8000-0000000000a3";
  const pastas = [...PASTAS(), { id: P_TESTE, conta_id: UUID, nome_externo: "RAC-TESTE", nome_exibicao: "RAC-TESTE", uso: "outra", total: 1, nao_lidas: 0 }];
  const a = ambiente(REAL({ pastas, mensagens: [], sincs: [], invoke: () => ok({ sincronizacao: { tipo: "primeira_leitura", novas: 1, atualizadas: 0, removidas: 0 }, mensagens_na_pasta: 1, mais: false }) })); await a.abrir(UUID); await assentar();
  comClasse(a.raiz, "inb-pasta").find((b) => texto(b).includes("RAC-TESTE")).onclick();
  assert.equal(comClasse(a.raiz, "inb-topo-sinc").length, 1, "o botão do topo (inb-topo-sinc) é desenhado");
  assert.match(texto(comClasse(a.raiz, "inb-conexao")[0]), /Ainda não sincronizada/, "no estado da captura: conexão em ordem, em uma linha");
  sincBtn(a.raiz).onclick(); await assentar();
  assert.deepEqual(a.chamadas.map((c) => [c[1].body.operacao, c[1].body.pasta_id]), [["sincronizar_pasta", P_TESTE]], "sincroniza a pasta selecionada (RAC-TESTE), sem listar pastas de novo");
});

test("conexão em ordem: UMA linha discreta com a última sincronização e o botão Opções (testar, substituir, desconectar só quando pedido); credencial ausente ou recusada continua com os botões grandes", async () => {
  const a = ambiente(REAL()); await a.abrir(UUID); await assentar();
  const caixa = comClasse(a.raiz, "inb-conexao")[0]; assert.ok((" " + caixa.className + " ").includes(" inb-conexao--compacta "));
  assert.equal(todos(caixa).filter((n) => n.tag === "button").length, 1, "só o botão Opções está visível");
  const mais = comClasse(a.raiz, "inb-conexao-mais")[0]; assert.deepEqual([mais.attrs["aria-label"], mais.attrs["aria-expanded"]], ["Opções da conexão", "false"]);
  mais.onclick(); const aberto = comClasse(a.raiz, "inb-conexao")[0]; assert.equal(comClasse(a.raiz, "inb-conexao-mais")[0].attrs["aria-expanded"], "true");
  assert.deepEqual(todos(aberto).filter((n) => n.tag === "button" && !(" " + n.className + " ").includes(" inb-conexao-mais ")).map((n) => texto(n).trim()), ["Testar conexão", "Testar envio (SMTP)", "Testar envio com e-mail de teste", "Substituir senha", "Desconectar e remover a credencial"], "as ações raras (conexão, prova do envio, senha, desconectar), como texto discreto");
  assert.match(texto(aberto), /cifrada no cofre do servidor e não volta ao navegador/);
  comClasse(a.raiz, "inb-conexao-mais")[0].onclick(); assert.equal(comClasse(a.raiz, "inb-conexao-mais")[0].attrs["aria-expanded"], "false", "toca de novo e recolhe");
  // substituir senha abre o formulário dentro da conexão; a senha segue as regras de sempre
  opcoes(a.raiz); botao(a.raiz, "Substituir senha").onclick(); assert.ok(todos(a.raiz).some((n) => n.tag === "input" && n.attrs.type === "password"), "o formulário de credencial abre");
  const sem = ambiente(REAL({ credenciais: [], mensagens: [] })); await sem.abrir(UUID); await assentar(); assert.ok(botao(sem.raiz, "Conectar"), "sem credencial: botão grande Conectar"); assert.equal(comClasse(sem.raiz, "inb-conexao--compacta").length, 0);
  const inv = ambiente(REAL({ credenciais: [{ conta_id: UUID, estado: "invalida" }] })); await inv.abrir(UUID); await assentar(); assert.ok(botao(inv.raiz, "Substituir senha") && botao(inv.raiz, "Desconectar e remover a credencial"), "recusada: as ações ficam à vista (precisa agir)"); assert.equal(comClasse(inv.raiz, "inb-conexao--compacta").length, 0);
  assert.deepEqual(a.gravacoes, []);
});

test("rotina automática (054): preferências 'sincronizar sozinho' e 'avisar' só aparecem com a 054 aplicada, gravam só a coluna pedida na própria conta, e o selo do ícone acompanha as não lidas", async () => {
  const sem = ambiente(REAL()); await sem.abrir(UUID); await assentar(); opcoes(sem.raiz);
  assert.equal(todos(sem.raiz).filter((n) => n.tag === "input" && n.attrs.type === "checkbox").length, 0, "sem a 054 (colunas ausentes) as opções não aparecem");
  const a = ambiente(REAL({ contas: [{ ...CONTA_OK, sync_auto: true, notificar: true }], sincs: [{ pasta_id: P_IN, ultima_ok_em: "2026-11-14T10:20:00.000Z", erro: null, falhas_seguidas: 0, origem: "agenda" }] }));
  const selos = []; a.ctx.navigator = { setAppBadge: (n) => { selos.push(n); return Promise.resolve(); }, clearAppBadge: () => { selos.push(0); return Promise.resolve(); } };
  await a.abrir(UUID); await assentar(); opcoes(a.raiz);
  const caixas = todos(a.raiz).filter((n) => n.tag === "input" && n.attrs.type === "checkbox");
  assert.deepEqual(caixas.map((c) => [c.attrs.id, c.checked]), [["inb-pref-sync_auto", true], ["inb-pref-notificar", true]]);
  assert.match(texto(a.raiz), /Sincronizar automaticamente a cada 10 minutos/); assert.match(texto(a.raiz), /Avisar por notificação quando chegar e-mail novo/); assert.match(texto(a.raiz), /feita pela rotina do servidor/);
  assert.match(texto(a.raiz), /assunto e o remetente \(nunca o texto do e-mail\)/, "a tela diz o que o aviso mostra");
  caixas[1].checked = false; caixas[1].onchange(); await assentar();
  assert.deepEqual(JSON.parse(JSON.stringify(a.gravacoes)), [["inbox_contas", "update", { notificar: false }]], "só a coluna pedida; nenhuma senha, nenhum outro dado");
  assert.ok(selos.length >= 1 && selos.every((n) => Number.isInteger(n) && n >= 0), "o selo recebe um número de não lidas (ou limpa)");
  const rot = ambiente(REAL({ contas: [{ ...CONTA_OK, sync_auto: true, notificar: true }] })); await rot.abrir(UUID); await assentar(); opcoes(rot.raiz); assert.match(texto(rot.raiz), /ainda não sincronizou esta conta/, "sem origem 'agenda', não afirma que a rotina rodou");
});

test("aviso de e-mail (Web Push): #inbox/<conta>/<pasta>/<mensagem> abre DIRETO a leitura dessa mensagem (sem parar na lista), por ID; mensagens diferentes, destinos diferentes; id inválido ou ausente cai na lista", async () => {
  const LEIT = ok({ mensagem: { texto: "corpo", formato: "texto", truncado: false, anexos: [] } });
  const a = ambiente(REAL({ invoke: () => LEIT })), trocas = []; a.ctx.history = { state: null, replaceState: (s, t, u) => trocas.push(u) };
  await a.abrir(UUID, P_IN, MSG(2).id); await assentar();
  assert.deepEqual(a.chamadas[0], ["rac-inbox", { body: { operacao: "ler_mensagem", conta_id: UUID, pasta_id: P_IN, uid: 2 } }], "leu a mensagem do ID, não a primeira da lista");
  let L = texto(comClasse(a.raiz, "inb-leitura")[0]); assert.ok(L.includes("Assunto 2") && L.includes("ana2@exemplo.com") && !L.includes("Assunto 3"), "cabeçalho da mensagem certa");
  assert.equal(a.ctx.INBX.painel, "leitura"); assert.equal(a.ctx.INBX.msg, MSG(2).id); assert.deepEqual([...trocas], ["#inbox/" + UUID + "/" + P_IN], "o endereço volta ao da lista (recarregar não reabre a mensagem)");
  await a.abrir(UUID, P_IN, MSG(3).id); await assentar();   // outro aviso: outro destino
  assert.equal(a.chamadas.at(-1)[1].body.uid, 3); L = texto(comClasse(a.raiz, "inb-leitura")[0]); assert.ok(L.includes("Assunto 3") && !L.includes("Assunto 2"));
  // fora do cache da lista: busca a linha pelo ID (só leitura) e abre
  a.ctx.INBX.msgs = []; a.chamadas.length = 0; await a.ctx.inboxAbrirDoAviso(MSG(1).id); await assentar();
  assert.equal(a.chamadas[0][1].body.uid, 1); assert.equal(a.ctx.INBX.msg, MSG(1).id);
  // mensagem que não existe mais: aviso claro e a lista continua
  const b = ambiente(REAL({ invoke: () => LEIT })); b.ctx.history = { state: null, replaceState() {} }; await b.abrir(UUID, P_IN, "dddddddd-0000-4000-8000-0000000000ff"); await assentar();
  assert.equal(b.chamadas.length, 0); assert.match(texto(b.raiz), /não está mais no cache/); assert.equal(b.ctx.INBX.painel, "lista");
  // id inválido / sem id: lista normal
  for (const ruim of ["x", "1; drop", undefined]) { const c = ambiente(REAL({ invoke: () => LEIT })); await c.abrir(UUID, P_IN, ruim); await assentar(); assert.equal(c.chamadas.length, 0, String(ruim)); assert.equal(c.ctx.INBX.painel, "lista"); }
  assert.deepEqual(JSON.parse(JSON.stringify(a.gravacoes)), [], "abrir pelo aviso não grava nada");
});


/* ---------- I3: escrever, responder, responder a todos e encaminhar ---------- */
const campo = (raiz, id) => todos(raiz).find((n) => n.attrs && n.attrs.id === id);
const preencher = (raiz, id, v) => { const c = campo(raiz, id); assert.ok(c, "campo " + id); c.value = v; c.oninput(); };
const enviosDe = (a) => a.chamadas.filter((c) => c[1].body && c[1].body.operacao === "enviar_mensagem");
const LEITOK = (extra = {}) => ok({ mensagem: { texto: "Olá!\nVamos?", formato: "texto", truncado: false, anexos: [], de: { nome: "Ana 1", endereco: "ana1@exemplo.com" }, para: [{ nome: "Eu", endereco: "pessoa@icloud.example" }, { nome: "", endereco: "caio@exemplo.com" }], cc: [{ nome: "", endereco: "duda@exemplo.com" }], recebida: "2026-11-14T10:20:30.000Z", ...extra } });
const OKENVIO = ok({ resultado: "enviado", message_id: "<x@icloud.example>", enviados: "atualizada" });
async function abrirMsg(a) { await a.abrir(UUID); await assentar(); comClasse(a.raiz, "inb-linha")[0].onclick(); await assentar(); }

test("I3 · nova mensagem: só envia com o toque em Enviar, depois de revisar destinatários e assunto; confirma só com a resposta 'enviado'; toque duplo não envia duas vezes", async () => {
  const a = ambiente(REAL({ invoke: (nome, o) => o.body.operacao === "enviar_mensagem" ? OKENVIO : ok({ pastas: [] }) })); await a.abrir(UUID); await assentar();
  const nova = todos(a.raiz).find((n) => n.tag === "button" && /Nova mensagem/.test(texto(n))); assert.equal(nova.attrs["aria-disabled"], undefined, "com conta conectada, Nova mensagem está ativa"); nova.onclick();
  assert.equal(comClasse(a.raiz, "inb-janela")[0].attrs["data-painel"], "leitura", "no iPhone o editor é tela própria"); assert.match(texto(a.raiz), /De\s+pessoa@icloud\.example/);
  assert.ok(campo(a.raiz, "inb-c-para") && campo(a.raiz, "inb-c-assunto") && campo(a.raiz, "inb-c-texto") && !campo(a.raiz, "inb-c-cc"), "Para, Assunto e Mensagem; Cc/Cco sob demanda");
  botao(a.raiz, "Adicionar Cc/Cco").onclick(); assert.ok(campo(a.raiz, "inb-c-cc") && campo(a.raiz, "inb-c-cco"));
  assert.equal(campo(a.raiz, "inb-c-para").attrs.autocapitalize, "none"); assert.equal(campo(a.raiz, "inb-c-para").attrs.inputmode, "email");
  /* revisar com erro: nada vai ao servidor */
  botao(a.raiz, "Revisar e enviar").onclick(); assert.match(texto(a.raiz), /Informe ao menos um destinatário/); assert.equal(enviosDe(a).length, 0);
  preencher(a.raiz, "inb-c-para", "Bia@x.com, ruim"); preencher(a.raiz, "inb-c-assunto", "Oi"); preencher(a.raiz, "inb-c-texto", "Texto <b>bonito</b>");
  botao(a.raiz, "Revisar e enviar").onclick(); assert.match(texto(a.raiz), /Endereço inválido: ruim/); assert.equal(enviosDe(a).length, 0);
  preencher(a.raiz, "inb-c-para", "Bia@x.com"); preencher(a.raiz, "inb-c-cco", "oculto@x.com"); botao(a.raiz, "Revisar e enviar").onclick();
  const rev = texto(a.raiz); assert.match(rev, /Confira antes de enviar/); assert.match(rev, /Para\s+bia@x\.com/); assert.match(rev, /Cco\s+oculto@x\.com \(oculto para os demais\)/); assert.match(rev, /Assunto\s+Oi/); assert.match(rev, /Texto <b>bonito<\/b>/, "o texto é mostrado como TEXTO");
  assert.equal(enviosDe(a).length, 0, "revisar não envia");
  const enviar = botao(a.raiz, "Enviar"); enviar.onclick(); enviar.onclick();   // toque duplo
  assert.match(texto(a.raiz), /Enviando…/); assert.equal(todos(a.raiz).filter((n) => n.tag === "button" && /^Enviar$/.test(texto(n).trim())).length, 0, "durante o envio não há botão de enviar");
  await assentar(); await assentar();
  assert.equal(enviosDe(a).length, 1, "um único envio, mesmo com dois toques");
  const corpo = enviosDe(a)[0][1].body; assert.deepEqual(Object.keys(corpo).sort(), ["assunto", "cc", "cco", "conta_id", "envio_id", "modo", "operacao", "para", "texto"]);
  assert.deepEqual([corpo.modo, corpo.para, corpo.cc, corpo.cco, corpo.assunto, corpo.texto, corpo.conta_id], ["novo", ["bia@x.com"], [], ["oculto@x.com"], "Oi", "Texto <b>bonito</b>", UUID]); assert.match(corpo.envio_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(texto(a.raiz), /Enviado e confirmado pelo servidor/); assert.match(texto(a.raiz), /Enviados foi atualizada/); assert.ok(!/SENHA|abcd-efgh/.test(JSON.stringify(a.chamadas)));
  botao(a.raiz, "Concluir").onclick(); assert.equal(comClasse(a.raiz, "inb-compor").length, 0, "concluir fecha o editor"); assert.deepEqual(a.gravacoes, [], "nada é gravado no banco pelo navegador");
});

test("I3 · responder, responder a todos e encaminhar: destinatários, assunto e citação preenchidos; origem (pasta e UID) vai no pedido; a mensagem original não é alterada", async () => {
  const a = ambiente(REAL({ invoke: (nome, o) => o.body.operacao === "ler_mensagem" ? LEITOK({ anexos: [{ parte: "2", nome: "plano.pdf", tipo: "application/pdf", tamanho: 9, inline: false }] }) : o.body.operacao === "enviar_mensagem" ? OKENVIO : ok({}) })); await abrirMsg(a);
  const acao = (r) => comClasse(a.raiz, "inb-btn-ico").find((b) => b.attrs["aria-label"] === r);
  assert.equal(acao("Responder").attrs["aria-disabled"], undefined, "com a mensagem lida e a conta conectada, responder está ativo");
  acao("Responder").onclick(); assert.equal(campo(a.raiz, "inb-c-para").value, "ana1@exemplo.com"); assert.equal(campo(a.raiz, "inb-c-assunto").value, "Re: Assunto 1"); assert.match(campo(a.raiz, "inb-c-texto").value, /escreveu:\n> Olá!\n> Vamos\?/);
  botao(a.raiz, "Cancelar").onclick();
  comClasse(a.raiz, "inb-linha")[0].onclick(); await assentar();
  acao("Responder a todos").onclick(); assert.equal(campo(a.raiz, "inb-c-para").value, "ana1@exemplo.com, caio@exemplo.com", "o próprio endereço da conta fica de fora"); assert.equal(campo(a.raiz, "inb-c-cc").value, "duda@exemplo.com");
  botao(a.raiz, "Revisar e enviar").onclick(); botao(a.raiz, "Enviar").onclick(); await assentar(); await assentar();
  const ped = enviosDe(a).at(-1)[1].body; assert.deepEqual([ped.modo, ped.pasta_id, ped.uid, ped.para, ped.cc], ["responder_todos", P_IN, 1, ["ana1@exemplo.com", "caio@exemplo.com"], ["duda@exemplo.com"]]);
  botao(a.raiz, "Concluir").onclick(); comClasse(a.raiz, "inb-linha")[0].onclick(); await assentar();
  acao("Encaminhar").onclick(); assert.equal(campo(a.raiz, "inb-c-para").value, ""); assert.equal(campo(a.raiz, "inb-c-assunto").value, "Enc: Assunto 1"); assert.match(campo(a.raiz, "inb-c-texto").value, /Mensagem encaminhada[\s\S]*De: Ana 1 <ana1@exemplo\.com>[\s\S]*Olá!\nVamos\?/);
  assert.match(texto(a.raiz), /1 anexo da mensagem original não é encaminhado nesta etapa: plano\.pdf/, "avisa que o anexo não vai");
  assert.ok(!a.chamadas.some((c) => /store|append|marcar|arquivar|mover/.test(JSON.stringify(c[1]))), "nenhuma escrita na caixa: nem marcar como lida, nem mover");
});

test("I3 · falha confirmada mantém o texto e permite corrigir; INCERTO nunca reenvia sozinho e só um novo envio_id (decisão do dono) envia de novo; sem resposta (rede) confirma com o MESMO envio_id", async () => {
  /* falha confirmada */
  let resposta = erroHttp(422, "destinatario_recusado");
  const a = ambiente(REAL({ invoke: (nome, o) => o.body.operacao === "enviar_mensagem" ? resposta : ok({ pastas: [] }) })); await a.abrir(UUID); await assentar();
  const escrever = () => { preencher(a.raiz, "inb-c-para", "bia@x.com"); preencher(a.raiz, "inb-c-texto", "Meu texto importante"); botao(a.raiz, "Revisar e enviar").onclick(); botao(a.raiz, "Enviar").onclick(); };
  todos(a.raiz).find((n) => n.tag === "button" && /Nova mensagem/.test(texto(n))).onclick(); escrever(); await assentar(); await assentar();
  assert.match(texto(a.raiz), /Não foi enviado/); assert.match(texto(a.raiz), /recusou um dos destinatários\. Nada foi enviado/); assert.match(texto(a.raiz), /Seu texto foi mantido/);
  botao(a.raiz, "Voltar e editar").onclick(); assert.equal(campo(a.raiz, "inb-c-texto").value, "Meu texto importante", "nada se perde");
  const id1 = enviosDe(a)[0][1].body.envio_id;
  /* incerto: 202 */
  resposta = { data: { ok: false, erro: "envio_incerto" }, error: null }; botao(a.raiz, "Revisar e enviar").onclick(); botao(a.raiz, "Enviar").onclick(); await assentar(); await assentar();
  assert.equal(enviosDe(a)[1][1].body.envio_id, id1, "a tentativa depois de falha CONFIRMADA usa o mesmo envio_id (o servidor sabe que nada saiu)");
  let t = texto(a.raiz); assert.match(t, /Resultado incerto/); assert.match(t, /PODE ter sido enviado/); assert.ok(!/Enviado e confirmado/.test(t));
  await assentar(); await assentar(); assert.equal(enviosDe(a).length, 2, "incerto não dispara nenhuma repetição automática");
  assert.ok(botao(a.raiz, "Atualizar Enviados e conferir")); assert.ok(botao(a.raiz, "Concluir sem enviar de novo"));
  botao(a.raiz, "Não chegou: enviar de novo").onclick(); assert.match(texto(a.raiz), /Confira antes de enviar/, "enviar de novo passa pela revisão");
  resposta = OKENVIO; botao(a.raiz, "Enviar").onclick(); await assentar(); await assentar();
  const id2 = enviosDe(a)[2][1].body.envio_id; assert.notEqual(id2, id1, "novo envio_id: decisão explícita"); assert.match(texto(a.raiz), /Enviado e confirmado/);
  /* sem resposta (queda de rede): confirmar com o MESMO envio_id */
  botao(a.raiz, "Concluir").onclick(); resposta = { data: null, error: { name: "FunctionsFetchError", message: "Failed to fetch" } };
  todos(a.raiz).find((n) => n.tag === "button" && /Nova mensagem/.test(texto(n))).onclick(); escrever(); await assentar(); await assentar();
  assert.match(texto(a.raiz), /Não consegui confirmar o resultado/); const id3 = enviosDe(a)[3][1].body.envio_id;
  resposta = ok({ resultado: "enviado", message_id: "<x@icloud.example>", enviados: "nao_atualizada", repetido: true }); botao(a.raiz, "Confirmar resultado").onclick(); await assentar(); await assentar();
  assert.equal(enviosDe(a)[4][1].body.envio_id, id3, "confirmar repete o MESMO envio_id: o servidor responde o que já aconteceu"); assert.match(texto(a.raiz), /já tinha sido concluído/);
});

test("I3 · sem conta conectada ou no exemplo: Nova mensagem e Responder ficam desligados, nada é pedido ao servidor; descartar rascunho pede confirmação", async () => {
  const sem = ambiente({ contas: [CONTA], credenciais: [], pastas: PASTAS(), mensagens: [] }); await sem.abrir(UUID); await assentar();
  const nova = todos(sem.raiz).find((n) => n.tag === "button" && /Nova mensagem/.test(texto(n))); assert.equal(nova.attrs["aria-disabled"], "true"); nova.onclick(); assert.match(texto(sem.raiz), /Conecte uma conta/); assert.equal(comClasse(sem.raiz, "inb-compor").length, 0); assert.equal(sem.chamadas.length, 0);
  let pergunta = 0; const a = ambiente(REAL({ invoke: () => ok({}) })); a.ctx.confirm = () => { pergunta++; return false; }; a.ctx.window = a.ctx; await a.abrir(UUID); await assentar();
  todos(a.raiz).find((n) => n.tag === "button" && /Nova mensagem/.test(texto(n))).onclick(); botao(a.raiz, "Cancelar").onclick(); assert.equal(pergunta, 0, "sem nada escrito, cancelar não pergunta");
  todos(a.raiz).find((n) => n.tag === "button" && /Nova mensagem/.test(texto(n))).onclick(); preencher(a.raiz, "inb-c-texto", "rascunho"); botao(a.raiz, "Cancelar").onclick();
  assert.equal(pergunta, 1, "com texto escrito, pergunta antes de descartar"); assert.equal(comClasse(a.raiz, "inb-compor").length, 1, "respondeu não: o rascunho continua");
  assert.deepEqual(a.chamadas.filter((c) => c[1].body && c[1].body.operacao === "enviar_mensagem"), []);
});

test("I3 · prova de envio (SMTP) nas Opções: relata etapa por etapa, o e-mail de teste exige confirmação e a falha mostra a causa", async () => {
  const a = ambiente(REAL({ invoke: (nome, o) => o.body.operacao === "smtp_prova" ? ok({ aprovada: false, etapas: [{ etapa: "conexao_tcp", ok: true, ms: 41 }, { etapa: "starttls", ok: true, codigo: 220, ms: 80 }, { etapa: "autenticacao", ok: false, codigo: 535, ms: 99 }], total_ms: 300, teste: "nao_enviado", erro: "smtp_autenticacao_recusada", etapa_falha: "autenticacao" }) : ok({}) }));
  await a.abrir(UUID); await assentar(); opcoes(a.raiz); botao(a.raiz, "Testar envio (SMTP)").onclick(); await assentar(); await assentar();
  const t = texto(a.raiz); assert.match(t, /reprovada na etapa “Login \(AUTH\)” \(smtp_autenticacao_recusada\)/); assert.match(t, /Pedido de STARTTLS \(220\) ✓ 80 ms/); assert.deepEqual(a.chamadas.at(-1), ["rac-inbox", { body: { operacao: "smtp_prova", conta_id: UUID } }]);
  let confirmou = 0; a.ctx.confirm = () => { confirmou++; return false; }; opcoes(a.raiz); botao(a.raiz, "Testar envio com e-mail de teste").onclick(); await assentar(); assert.equal(confirmou, 1); assert.equal(a.chamadas.filter((c) => c[1].body.enviar_teste).length, 0, "sem confirmar, o e-mail de teste não é pedido");
});

/* ---------- "Adicionar conta" (correção de 16/11/2026: no celular a lateral é uma camada fixa e cobria o formulário) ---------- */
test("Adicionar conta: abre e fecha o formulário; abrir FECHA a camada das caixas (o formulário ficava coberto no iPhone); o que foi digitado sobrevive a nova renderização", async () => {
  const a = ambiente(REAL()); await a.abrir(UUID); await assentar();
  const janela = () => comClasse(a.raiz, "inb-janela")[0], formAberto = () => !!campo(a.raiz, "inb-apelido");
  const abrirCaixas = () => todos(a.raiz).find((n) => n.tag === "button" && n.attrs["aria-label"] === "Caixas").onclick();
  const adicionar = () => botao(a.raiz, "Adicionar conta");
  assert.equal(formAberto(), false, "com conta cadastrada o formulário começa fechado");
  abrirCaixas(); assert.equal(janela().attrs["data-painel"], "caixas", "no iPhone o botão fica na camada das caixas"); assert.equal(adicionar().attrs["aria-expanded"], "false");
  adicionar().onclick();
  assert.equal(formAberto(), true, "o formulário foi desenhado"); assert.equal(janela().attrs["data-painel"], "lista", "a camada fixa das caixas é fechada: o formulário não fica coberto");
  assert.ok(campo(a.raiz, "inb-prov") && campo(a.raiz, "inb-endereco") && campo(a.raiz, "inb-form-conta"), "provedor, apelido e endereço (e o âncora de rolagem)");
  /* digitar, e uma renderização qualquer no meio (sincronização, aviso, troca de painel) não apaga nada */
  preencher(a.raiz, "inb-apelido", "Trabalho"); preencher(a.raiz, "inb-endereco", "t@icloud.example"); campo(a.raiz, "inb-prov").onchange();
  a.ctx.inboxDesenhar(); a.ctx.inboxDesenhar();
  assert.equal(campo(a.raiz, "inb-apelido").value, "Trabalho"); assert.equal(campo(a.raiz, "inb-endereco").value, "t@icloud.example", "valores preservados durante a renderização");
  /* fechar pelo Cancelar e reabrir pelo botão (alterna) */
  botao(a.raiz, "Cancelar").onclick(); assert.equal(formAberto(), false, "Cancelar fecha");
  abrirCaixas(); adicionar().onclick(); assert.equal(formAberto(), true, "reabre"); adicionar().onclick; 
  abrirCaixas(); adicionar().onclick(); assert.equal(formAberto(), false, "o próprio botão também fecha (alterna)"); assert.equal(janela().attrs["data-painel"], "lista");
  assert.deepEqual(a.gravacoes, [], "abrir, digitar e fechar não gravam nada");
});

test("Adicionar conta: o cadastro continua usando o fluxo existente (insert em inbox_contas pelo Supabase, só a linha validada); sem contas o formulário é o estado vazio e não tem Cancelar", async () => {
  const v = ambiente(); await v.abrir(); assert.ok(campo(v.raiz, "inb-apelido"), "sem conta o formulário já está na tela"); assert.equal(botao(v.raiz, "Cancelar"), undefined, "sem contas não há o que cancelar");
  campo(v.raiz, "inb-prov").value = "icloud"; preencher(v.raiz, "inb-apelido", "Pessoal"); preencher(v.raiz, "inb-endereco", "pessoa@icloud.example"); botao(v.raiz, "Cadastrar conta").onclick(); await assentar();
  assert.deepEqual(v.gravacoes, [["inbox_contas", "insert", { provedor: "icloud", apelido: "Pessoal", endereco: "pessoa@icloud.example", estado: "nova" }]], "só o cadastro da conta, sem credencial e sem dono no pedido (o RLS define o dono)");
  const e = ambiente(); await e.abrir(); preencher(e.raiz, "inb-apelido", ""); preencher(e.raiz, "inb-endereco", "ruim"); botao(e.raiz, "Cadastrar conta").onclick();
  assert.match(texto(e.raiz), /Dê um nome de 1 a 60 caracteres/); assert.match(texto(e.raiz), /endereço de e-mail válido/); assert.deepEqual(e.gravacoes, [], "dados inválidos não saem do navegador");
});
