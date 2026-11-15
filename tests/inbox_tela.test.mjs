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
const esperar = () => new Promise((r) => setTimeout(r, 0));
const UUID = "11111111-1111-4111-8111-111111111111", SENHA_APP = "abcd-efgh-ijkl-mnop";

/* o ambiente: h() como o da base, o kit real, o núcleo real, um banco de mentira que REGISTRA toda gravação, e "precisa" que carrega módulos de verdade */
function ambiente({ dono = true, contas = [], pastas = [], credenciais = [], erroLeitura = null, erroGravar = null, publicado = true, invoke = null } = {}) {
  const raiz = new No("div"), titulo = new No("h1"), gravacoes = [], lidas = [], chamadas = [];
  const doc = { createElement: (t) => new No(t), createTextNode: (t) => { const n = new No("#texto"); n.textContent = t; return n; }, getElementById: (id) => (id === "inbox-view" ? raiz : null) };
  const tabela = (t) => { const q = { _acao: "ler", select() { return q; }, order() { return q; }, insert(l) { q._acao = "insert"; q._l = l; gravacoes.push([t, "insert", l]); return q; },
    update(l) { gravacoes.push([t, "update", l]); return q; }, delete() { gravacoes.push([t, "delete"]); return q; }, upsert(l) { gravacoes.push([t, "upsert", l]); return q; },
    then(ok, er) { lidas.push(t); const dados = t === "inbox_contas" ? contas : t === "inbox_credenciais" ? credenciais : pastas;
      const r = q._acao === "insert" ? { data: erroGravar ? null : [{ id: "novo" }], error: erroGravar } : (erroLeitura && t !== "inbox_credenciais" ? { data: null, error: erroLeitura } : { data: dados, error: null }); return Promise.resolve(r).then(ok, er); } }; return q; };
  const ctx = { console, Promise, Object, Array, JSON, String, Date, Math, Number, NUCLEO: N, document: doc, isOwner: () => dono, $: () => titulo, confirm: () => true,
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
  assert.match(t, /Nenhuma mensagem carregada\s+A leitura de e-mails chega na etapa I2; nada aqui é exemplo nem simulação/);
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
  assert.ok(["Hoje", "Ontem"].includes(grupos[0]), "o exemplo mais recente é de 'minutos atrás': Hoje, ou Ontem se o teste rodar logo após a meia-noite");   // (relógio real: não depende da hora do dia)
  assert.deepEqual(grupos.slice(1), ["Esta semana", "Anteriores"], "grupos de data como no Mail");
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
  for (const b of acoes) { assert.equal(b.attrs["aria-disabled"], "true", b.attrs["aria-label"] + " desligada"); assert.equal(b.onclick, null, b.attrs["aria-label"] + " não faz nada"); assert.match(b.attrs.title, /próximas etapas/); }
  assert.equal(todos(a.raiz).find((n) => n.tag === "button" && /Nova mensagem/.test(texto(n))).onclick, null, "nova mensagem desligada");
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
  await c.abrir(); comClasse(c.raiz, "inb-conta")[0].onclick(); assert.match(texto(c.raiz), /Credencial guardada/); assert.ok(botao(c.raiz, "Substituir senha")); assert.ok(!botao(c.raiz, "Conectar"));
  botao(c.raiz, "Desconectar e remover a credencial").onclick(); await esperar(); await esperar();
  assert.deepEqual(c.chamadas[0], ["rac-inbox", { body: { operacao: "credencial_remover", conta_id: UUID } }]); assert.match(texto(c.raiz), /Credencial removida do cofre/);
  const d = ambiente({ contas: [CONTA], credenciais: [{ conta_id: UUID, estado: "invalida" }], publicado: true }); await d.abrir(); comClasse(d.raiz, "inb-conta")[0].onclick();
  assert.match(texto(d.raiz), /Credencial recusada pelo provedor/); assert.match(texto(d.raiz), /Gere uma nova senha de app e substitua/);
  const e = ambiente({ contas: [CONTA], credenciais: [{ conta_id: UUID, estado: "ativa" }], publicado: true }); e.ctx.confirm = () => false; await e.abrir(); comClasse(e.raiz, "inb-conta")[0].onclick();
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
  assert.match(texto(a.raiz), /Conta cadastrada\. Ela fica "Nova" até a conexão existir/);
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
