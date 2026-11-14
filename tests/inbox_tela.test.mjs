// RAC Inbox · I1: a tela (js/inbox.js) num DOM de mentira, sem navegador e sem rede. Confere os estados (carregando, estrutura pendente, erro, vazio, desconectado), que NENHUMA
// mensagem aparece sem o "exemplo da interface" (rotulado e isolado em js/inbox-demo.js), que nenhuma ação altera caixa, que só o cadastro de conta grava, que a casa não vê
// nada, o desenho responsivo (três áreas no desktop; lista, leitura e caixas em telas próprias no iPhone, áreas seguras e alvo de toque) e a rota/versões/cache do site.
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
const UUID = "11111111-1111-4111-8111-111111111111";

/* o ambiente: h() como o da base, o kit real, o núcleo real, um banco de mentira que REGISTRA toda gravação, e "precisa" que carrega módulos de verdade */
function ambiente({ dono = true, contas = [], pastas = [], erroLeitura = null, erroGravar = null } = {}) {
  const raiz = new No("div"), titulo = new No("h1"), gravacoes = [], lidas = [];
  const doc = { createElement: (t) => new No(t), createTextNode: (t) => { const n = new No("#texto"); n.textContent = t; return n; }, getElementById: (id) => (id === "inbox-view" ? raiz : null) };
  const tabela = (t) => { const q = { _acao: "ler", select() { return q; }, order() { return q; }, insert(l) { q._acao = "insert"; q._l = l; gravacoes.push([t, "insert", l]); return q; },
    update(l) { gravacoes.push([t, "update", l]); return q; }, delete() { gravacoes.push([t, "delete"]); return q; }, upsert(l) { gravacoes.push([t, "upsert", l]); return q; },
    then(ok, er) { lidas.push(t); const r = q._acao === "insert" ? { data: erroGravar ? null : [{ id: "novo" }], error: erroGravar } : (erroLeitura ? { data: null, error: erroLeitura } : { data: t === "inbox_contas" ? contas : pastas, error: null }); return Promise.resolve(r).then(ok, er); } }; return q; };
  const ctx = { console, Promise, Object, Array, JSON, String, Date, Math, Number, NUCLEO: N, document: doc, isOwner: () => dono, $: () => titulo,
    sbOk: (r) => { if (r.error) throw r.error; return r.data; }, SB: { from: tabela }, racDica: { ligar() {}, em() {} },
    precisa: (l) => Promise.all(l.map((m) => { vm.runInContext(fs.readFileSync(new URL(`../js/${m}.js`, import.meta.url), "utf8"), ctx, { filename: `js/${m}.js` }); })) };
  ctx.window = ctx; vm.createContext(ctx);
  ctx.h = (tag, attrs, ...filhos) => { const e = doc.createElement(tag); if (attrs) Object.keys(attrs).forEach((k) => { const v = attrs[k]; if (v === undefined || v === null || v === false) return; if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else e.setAttribute(k, v); });
    const add = (c) => { if (c === null || c === undefined || c === false) return; if (Array.isArray(c)) { c.forEach(add); return; } e.appendChild(typeof c === "string" || typeof c === "number" ? doc.createTextNode(String(c)) : c); }; filhos.forEach(add); return e; };
  for (const a of ["js/graficos.js", "js/kit.js", "js/inbox-servico.js", "js/inbox.js"]) vm.runInContext(lerArq(a), ctx, { filename: a });
  return { ctx, raiz, titulo, gravacoes, lidas, abrir: async (...a) => { await ctx.renderInbox(...a); } };
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

test("sem contas: estado vazio com o formulário de cadastro; com contas sem conexão: aviso 'não estão vazias'; lista sem nenhuma mensagem", async () => {
  const v = ambiente(); await v.abrir();
  assert.match(texto(v.raiz), /Nenhuma conta cadastrada/); assert.ok(botao(v.raiz, "Cadastrar conta")); assert.match(texto(v.raiz), /Sem senha aqui/);
  const d = ambiente({ contas: [CONTA] }); await d.abrir();
  const t = texto(d.raiz);
  assert.match(t, /Nenhuma conta conectada/); assert.match(t, /não estão vazias: ainda não foram lidas/); assert.match(t, /Nenhuma mensagem carregada\. A leitura de e-mails chega na etapa I2; nada aqui é exemplo nem simulação/);
  assert.equal(comClasse(d.raiz, "inb-linha").length, 0, "nenhuma linha de mensagem sem o exemplo"); assert.ok(!/DEMONSTRAÇÃO/.test(t), "e nada rotulado como exemplo sem o pedido");
  assert.match(t, /Caixa unificada/); assert.match(t, /Pessoal/); assert.match(t, /Nova/); assert.match(t, /Categorias/); assert.match(t, /Pessoal[\s\S]*Trabalho[\s\S]*Financeiro[\s\S]*Compras[\s\S]*Entregas[\s\S]*Newsletters[\s\S]*Notificações[\s\S]*Promoções/);
  assert.match(t, /Contagem parcial/, "a unificada avisa que a conta sem conexão não entra na soma");
  assert.deepEqual(d.gravacoes, [], "abrir a tela só lê");
});

test("o 'exemplo da interface': isolado no módulo próprio, rotulado em todo lugar, com lista (remetente, assunto, prévia, horário), filtros e leitura; nenhuma ação funciona e nada é gravado", async () => {
  const a = ambiente({ contas: [CONTA] }); await a.abrir();
  assert.equal(a.ctx.INBOX_DEMO, undefined, "os dados de exemplo nem estão carregados até o dono pedir");
  botao(a.raiz, "Ver exemplo da interface").onclick(); await new Promise((r) => setTimeout(r, 0));
  assert.ok(Array.isArray(a.ctx.INBOX_DEMO) && a.ctx.INBOX_DEMO.length >= 4);
  const linhas = comClasse(a.raiz, "inb-linha"); assert.equal(linhas.length, a.ctx.INBOX_DEMO.length);
  const t = texto(a.raiz); assert.match(t, /DEMONSTRAÇÃO · mensagens fictícias, nenhuma caixa real/);
  for (const c of ["inb-remetente", "inb-assunto", "inb-previa", "inb-hora", "inb-avatar"]) assert.ok(comClasse(a.raiz, c).length >= linhas.length, c + " em cada linha");
  assert.ok(linhas.some((l) => / inb-linha--nova /.test(" " + l.className + " ")), "não lidas destacadas"); assert.ok(comClasse(a.raiz, "inb-anexo-tag").length >= 1, "anexo sinalizado");
  assert.ok(linhas.every((l) => /Não lida\. |^[^.]+\. /.test(l.attrs["aria-label"])), "cada linha tem rótulo de acessibilidade");
  /* filtros */
  botao(a.raiz, "Com anexo").onclick(); assert.ok(comClasse(a.raiz, "inb-linha").length < linhas.length && comClasse(a.raiz, "inb-linha").length >= 1); assert.equal(botao(a.raiz, "Com anexo").attrs["aria-pressed"], "true");
  botao(a.raiz, "Todas").onclick();
  /* leitura */
  assert.match(texto(comClasse(a.raiz, "inb-leitura")[0]), /Selecione uma mensagem/);
  comClasse(a.raiz, "inb-linha")[0].onclick(); const leitura = comClasse(a.raiz, "inb-leitura")[0], lt = texto(leitura);
  assert.match(lt, /Bem-vindo ao exemplo do RAC Inbox/); assert.match(lt, /equipe@example\.com/); assert.match(lt, /DEMONSTRAÇÃO · texto fictício/);
  assert.equal(comClasse(a.raiz, "inb-janela")[0].attrs["data-painel"], "leitura", "no iPhone a leitura passa a ser a tela própria");
  const acoes = comClasse(leitura, "inb-acao"); assert.deepEqual(acoes.map((b) => texto(b).trim()), ["Responder", "Encaminhar", "Arquivar", "Excluir"]);
  for (const b of acoes) { assert.equal(b.attrs["aria-disabled"], "true", texto(b) + " desligada"); assert.equal(b.onclick, null, texto(b) + " não faz nada"); assert.match(b.attrs.title, /próximas etapas/); }
  assert.equal(botao(a.raiz, "Nova mensagem").attrs["aria-disabled"], "true"); assert.equal(botao(a.raiz, "Nova mensagem").onclick, null);
  botao(a.raiz, "Mensagens").onclick(); assert.equal(comClasse(a.raiz, "inb-janela")[0].attrs["data-painel"], "lista", "voltar leva à lista");
  assert.deepEqual(a.gravacoes, [], "nada foi gravado: o exemplo não toca o banco");
  /* sair do exemplo some com as linhas */
  botao(a.raiz, "Sair do exemplo").onclick(); assert.equal(comClasse(a.raiz, "inb-linha").length, 0);
  /* o módulo de exemplo: só dados fictícios, em domínio reservado, sem rede e sem banco */
  const demo = fs.readFileSync(new URL("../js/inbox-demo.js", import.meta.url), "utf8");
  for (const m of a.ctx.INBOX_DEMO) { assert.match(m.id, /^demo-/); assert.match(m.endereco, /@example\.com$/); assert.equal(m.conta_id, "demo"); }
  assert.ok(!/fetch|SB\.|XMLHttp|localStorage|import\(|require\(/.test(demo.replace(/\/\*[\s\S]*?\*\//g, "")), "o exemplo não usa rede, banco nem armazenamento");
  assert.ok(!/inbox-demo/.test(fs.readFileSync(new URL("../js/inbox-servico.js", import.meta.url), "utf8")) && !/INBOX_DEMO/.test(fs.readFileSync(new URL("../js/inbox-servico.js", import.meta.url), "utf8")), "o serviço real nunca importa o exemplo");
});

test("cadastrar conta: valida antes (sem senha em lugar nenhum), só 'inbox_contas.insert' com provedor, apelido, endereço e estado 'nova'; duplicada e estrutura pendente viram mensagem no campo", async () => {
  const a = ambiente(); await a.abrir();
  const campos = todos(a.raiz).filter((n) => n.tag === "input"); assert.deepEqual(campos.map((c) => c.attrs.id), ["inb-apelido", "inb-endereco"], "só dois campos de texto: nenhum para senha");
  assert.ok(!todos(a.raiz).some((n) => n.attrs && (n.attrs.type === "password" || /senha|password/i.test(n.attrs.id || ""))), "nenhum campo de senha");
  const doc = a.ctx.document, vals = { "inb-apelido": "Pessoal", "inb-endereco": "invalido" };
  doc.getElementById = ((orig) => (id) => (vals[id] !== undefined ? { value: vals[id] } : orig(id)))(doc.getElementById);
  const sel = todos(a.raiz).find((n) => n.tag === "select"); sel.value = "icloud";
  botao(a.raiz, "Cadastrar conta").onclick(); assert.match(texto(a.raiz), /endereço de e-mail válido/); assert.deepEqual(a.gravacoes, [], "endereço inválido não chega ao banco");
  vals["inb-endereco"] = "pessoa@icloud.example";
  const sel2 = todos(a.raiz).find((n) => n.tag === "select"); sel2.value = "gmail"; botao(a.raiz, "Cadastrar conta").onclick(); assert.match(texto(a.raiz), /fase futura/); assert.deepEqual(a.gravacoes, []);
  todos(a.raiz).find((n) => n.tag === "select").value = "icloud"; botao(a.raiz, "Cadastrar conta").onclick(); await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(a.gravacoes, [["inbox_contas", "insert", { provedor: "icloud", apelido: "Pessoal", endereco: "pessoa@icloud.example", estado: "nova" }]], "só o cadastro, sem dono (o banco preenche com auth.uid()) e sem credencial");
  assert.match(texto(a.raiz), /Conta cadastrada\. Ela fica "Nova" até a conexão existir/);
  const dup = ambiente({ erroGravar: { code: "23505", message: "duplicate key" } }); await dup.abrir();
  dup.ctx.document.getElementById = ((o) => (id) => (vals[id] !== undefined ? { value: vals[id] } : o(id)))(dup.ctx.document.getElementById);
  todos(dup.raiz).find((n) => n.tag === "select").value = "icloud";
  botao(dup.raiz, "Cadastrar conta").onclick(); await new Promise((r) => setTimeout(r, 0)); assert.match(texto(dup.raiz), /Esta conta já está cadastrada/);
});

test("a Fernanda (casa) não vê nada do Inbox e nada é lido do banco; a rota é só do dono e não está no menu da casa", async () => {
  const a = ambiente({ dono: false, contas: [CONTA] }); await a.abrir();
  assert.match(texto(a.raiz), /só da conta do dono/); assert.equal(comClasse(a.raiz, "inb-janela").length, 0); assert.deepEqual(a.lidas.slice(0, 2), ["inbox_contas", "inbox_pastas"].slice(0, a.lidas.length), "(a leitura em si é barrada pelo banco; a tela não desenha nada)");
  const R = registro(), r = R.rotas.find((x) => x.id === "inbox");
  assert.ok(r && r.grupo === "Painel" && !r.casa && JSON.stringify(r.mods) === '["inbox"]' && r.area === "hoje"); assert.ok(!R.DA_CASA.includes("inbox"));
  assert.match(lerArq("index.html"), /<section id="inbox" hidden><div id="inbox-view" class="stack"><\/div><\/section>/);
  assert.match(lerArq("js/app.js"), /inbox:\["kit","inbox-servico"\]/, "o módulo declara o kit e o cliente do serviço");
  for (const arq of ["js/inbox.js", "js/inbox-servico.js", "js/inbox-demo.js"]) assert.ok(lerArq("sw.js").includes(`"./${arq}"`), arq + " no cache offline");
});

test("desenho: três áreas no desktop; no iPhone lista em tela cheia, leitura e caixas em telas próprias; áreas seguras; alvo de toque; só tokens do Design System; temas claro e escuro herdados", () => {
  const css = lerArq("css/rac.css"), i = css.indexOf("RAC Inbox · I1"); assert.ok(i > 0); const bloco = css.slice(i);
  assert.match(bloco, /\.inb-janela\{display:grid;grid-template-columns:minmax\(210px,250px\) minmax\(280px,380px\) minmax\(0,1fr\)/, "lateral + lista + leitura");
  const movel = bloco.slice(bloco.indexOf("@media(max-width:860px)")); assert.ok(movel.length > 200);
  assert.match(movel, /\.inb-janela\[data-painel="leitura"\]>\.inb-leitura\{[^}]*position:fixed;inset:0/, "a leitura abre em tela própria"); assert.match(movel, /\[data-painel="caixas"\]>\.inb-lateral/, "as caixas também");
  for (const lado of ["top", "right", "bottom", "left"]) assert.ok(movel.includes(`env(safe-area-inset-${lado}`), "área segura: " + lado);
  assert.match(bloco, /\.inb-item,\.inb-pasta\{[^}]*min-height:var\(--rac-alvo\)/); assert.match(bloco, /\.inb-acao\{[^}]*min-height:var\(--rac-alvo\)/); assert.match(bloco, /\.inb-voltar\{[^}]*min-height:var\(--rac-alvo\)/);
  assert.match(bloco, /:focus-visible\{outline:2px solid var\(--rac-foco\)/, "foco visível");
  assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(bloco.replace(/\/\*[\s\S]*?\*\//g, "")), "nenhuma cor escrita: só var(--rac-*) (os temas claro e escuro vêm dos tokens)");
  assert.match(movel, /\.inb-janela\[data-painel="leitura"\]>\.inb-leitura\{background:var\(--rac-papel-2\)\}/, "fundo opaco na tela cheia (o papel é translúcido)");
  const z = /\.inb-janela\[data-painel="caixas"\]>\.inb-lateral[^{]*\{[^}]*z-index:var\(--rac-z-janela\)/; assert.match(movel, z, "acima da barra inferior");
});
