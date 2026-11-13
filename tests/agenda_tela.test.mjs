// A página Agenda (DS-4.1 · RAC Modern Workspace, js/agenda.js): roda o código de verdade (a tela, o kit, os gráficos, a fonte da Agenda e a régua e as ações rápidas de
// js/sistema.js) num ambiente falso, sem banco e sem rede. Confere o que a tela mostra com os dados de teste, que as ações rápidas gravam pelos mesmos caminhos de antes,
// que o filtro e o formulário se comportam, e o que a página NÃO faz (nenhum acesso próprio ao banco, nada para a casa).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { registro } from "./_rotas.mjs";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const HOJE = "2026-11-13", dia = (n) => N.somaDiasISO(HOJE, n);

/* elemento falso: o bastante para o h() da base, o kit e a tela (atributos, filhos, innerHTML, busca por tag, foco, rolagem) */
function el(tag, attrs, ...kids) {
  const e = { tag, attrs: { ...(attrs || {}) }, children: [], isConnected: true, classList: { add: (c) => { e.attrs.class = ((e.attrs.class || "") + " " + c).trim(); } },
    appendChild(c) { e.children.push(c); return c; }, setAttribute(k, v) { e.attrs[k] = v; }, getAttribute(k) { return e.attrs[k]; }, remove() {}, focus() { e.focado = true; }, scrollIntoView() { e.rolou = true; },
    querySelectorAll(sel) { return todos(e, (x) => x.tag === sel).filter((x) => x !== e); }, querySelector(sel) { return e.querySelectorAll(sel)[0] || null; } };
  if (tag === "input" || tag === "textarea") e.value = "";
  Object.defineProperty(e, "innerHTML", { set() { e.children = []; }, get() { return ""; } });
  const add = (k) => { if (Array.isArray(k)) k.forEach(add); else if (k != null && k !== false) e.children.push(typeof k === "number" ? String(k) : k); };
  kids.forEach(add); return e;
}
const todos = (e, f, acc = []) => { if (e && typeof e === "object") { if (f(e)) acc.push(e); (e.children || []).forEach((c) => todos(c, f, acc)); } return acc; };
const texto = (e) => (e == null ? "" : typeof e === "string" ? e : [e.attrs && e.attrs.text, ...(e.children || []).map(texto)].filter(Boolean).join(" "));
const classe = (e, c) => ((e.attrs && e.attrs.class) || "").split(/\s+/).includes(c);
const porClasse = (raiz, c) => todos(raiz, (x) => x.attrs && classe(x, c));
const botao = (raiz, rot) => todos(raiz, (x) => x.tag === "button" && texto(x) === rot)[0];
const pausa = () => new Promise((r) => setTimeout(r, 20));

const CAND_VELHA = { id: "c-velha", t: "Técnico de Suporte N2", e: "Acme", coluna: "candidatei", datas: { candidatei: "2026-09-20" } };
const CAND_RECENTE = { id: "c-rec", t: "Analista de Dados Jr", e: "Beta", coluna: "candidatei", datas: { candidatei: dia(-5) } }; /* follow-up hoje */
/* o registro do IPVA do ano que vem existe (senão a Agenda de novembro cria o aviso do IPVA de janeiro, que cairia em "Depois" e atrapalharia as contas dos cenários) */
const IPVA = { id: 10, quem: "civic", tipo: "documento", data: "2026-11-01", titulo: "IPVA 2027", proxima: null, dados: {} };
const REG = { data: [{ id: 9, quem: "civic", tipo: "revisao", data: "2026-10-01", titulo: "Revisão 30 mil", proxima: dia(2), dados: {} }, IPVA], error: null }, REG_VAZIO = { data: [IPVA], error: null };

function telaAgenda({ registros = REG, lembretes = [], candidaturas = [], aulas = [], backup = true, nuvemFalha = false, selFalha = false } = {}) {
  const gravados = [], erros = [], root = el("div"), abertos = [];
  const ok = (data) => Promise.resolve({ data, error: null });
  const ctx = { console, Promise, Object, Array, JSON, Date, Math, String, Number, Error, isFinite, RegExp, hojeISO: () => HOJE, isOwner: () => true, logErro: (o, e) => erros.push([o, e && e.message]),
    sbOk: (r) => { if (r.error) throw new Error(r.error.message); return r.data; }, maisDias: (d, n) => N.somaDiasISO(d, n), tipoInfo: () => ["x", "Revisão"], dataBR: (d) => d.split("-").reverse().join("/"), BRL: (v) => "R$ " + v,
    FAM: { civic: { n: "Civic", veic: true } }, AGENDA_ICO: {}, withDates: () => [], fonteMbaDados: () => ({ aulas, avals: [], fin: null }), NUCLEO: N, EU: { id: "dono-1" }, location: { hash: "" }, window: { open: (...a) => abertos.push(a) },
    PESSOAL: { ultimoBackup: backup ? HOJE : undefined, candidaturas, lembretes }, VG: { all: [] }, vgHidden: {}, h: el, $: () => root, document: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} }, Event: class { constructor(t) { this.type = t; } },
    racDica: { ligar: (alvo, f) => { alvo.dica = f; return alvo; } }, vbFim() {}, vbRotulo: (c, b) => el("span", { class: "vbl" }, el("b", { text: c }), el("small", { text: b })),
    saudacao: () => "Bom dia", recolhidos: () => ({}),
    pessoalGravar: (k, v) => { ctx.PESSOAL[k] = v; gravados.push(k); },
    SB: { from: (t) => (t === "registros" ? { select: () => ({ order: () => Promise.resolve(registros) }) } : t === "garmin_dia" ? { select: () => ({ gte: () => ({ order: () => ok([]) }) }) } : { select: () => ({ gte: () => ok([]) }) }),
      storage: { from: () => ({ list: () => ok([{ name: HOJE + ".zip" }]) }) } } };
  vm.createContext(ctx);
  for (const f of ["js/fontes.js", "js/fonte-agenda.js"]) vm.runInContext(ler(f), ctx, { filename: f });
  const sis = ler("js/sistema.js"), i = sis.indexOf("  var AGENDA_TIPOS"), j = sis.indexOf("  /* A página Agenda (renderAgenda:");
  assert.ok(i > 0 && j > i, "a régua e as ações rápidas continuam em js/sistema.js");
  vm.runInContext(sis.slice(i, j), ctx, { filename: "sistema.js (régua e ações da Agenda)" });
  for (const f of ["js/kit.js", "js/graficos.js", "js/agenda.js"]) vm.runInContext(ler(f), ctx, { filename: f });
  if (selFalha) ctx.proximasSelecao = () => Promise.reject(new Error("régua fora do ar"));
  if (nuvemFalha) ctx.agendaColetarLeitura = () => Promise.reject(new Error("banco fora do ar"));
  return Object.assign(ctx, { gravados, erros, root, abertos });
}
const kpi = (raiz, rot) => { const k = todos(raiz, (x) => classe(x, "rac-kpi")).find((x) => texto(x).startsWith(rot)); return k ? { valor: texto(todos(k, (x) => classe(x, "rac-t-num"))[0]), apoio: texto(todos(k, (x) => classe(x, "rac-kpi-apoio"))[0]) } : null; };
const grupos = (raiz) => porClasse(raiz, "ag-grupo").map((g) => ({ titulo: texto(todos(g, (x) => classe(x, "rac-t-cartao"))[0]), itens: porClasse(g, "ag-item").map((li) => texto(todos(li, (x) => classe(x, "rac-linha-corpo"))[0])) }));

const CENARIO = { lembretes: [{ id: "l1", data: dia(-3), t: "Ligar para o seguro" }, { id: "l2", data: dia(20), t: "Renovar assinatura" }], candidaturas: [CAND_VELHA, CAND_RECENTE], aulas: [{ data: HOJE, hora: "19:00", t: "Python II" }] };

test("Agenda: a abertura, os indicadores e os grupos mostram só o que existe, com os mesmos critérios de antes", async () => {
  const c = telaAgenda(CENARIO); c.renderAgenda(); await pausa(); await pausa();
  const hero = texto(porClasse(c.root, "rh-hero")[0]);
  assert.match(hero, /Agenda/); assert.match(hero, /sexta-feira, 13 de novembro de 2026/); assert.match(hero, /1 item atrasado · 2 para hoje · 1 no próximo 7 dias\./, "a frase vem só de contagens reais");
  assert.match(hero, /Tudo que tem data no site num lugar só/, "o texto de apoio de antes continua");
  assert.deepEqual(kpi(c.root, "Atrasados"), { valor: "1", apoio: "o mais antigo venceu há 3 dias" });
  assert.deepEqual(kpi(c.root, "Hoje"), { valor: "2", apoio: "Python II e mais 1" }); assert.equal(kpi(c.root, "Próximos 7 dias").valor, "1"); assert.equal(kpi(c.root, "Próximos 7 dias").apoio, "até 20/11/2026");
  assert.deepEqual(kpi(c.root, "Até 30 dias"), { valor: "1", apoio: "nada mais adiante" });
  const g = grupos(c.root); assert.deepEqual(g.map((x) => x.titulo), ["Atrasados", "Hoje", "Próximos 7 dias", "Até 30 dias", "Candidaturas sem retorno"], "os grupos de antes, na mesma ordem; o vazio ('Depois') não aparece");
  assert.match(g[0].itens.join("|"), /Ligar para o seguro/); assert.match(g[1].itens.join("|"), /Python II/); assert.match(g[1].itens.join("|"), /Analista de Dados Jr/); assert.match(g[2].itens.join("|"), /Revisão 30 mil/);
  assert.match(g[3].itens.join("|"), /Renovar assinatura/); assert.match(g[4].itens.join("|"), /Técnico de Suporte N2/);
  const sr = porClasse(c.root, "ag-grupo--semretorno")[0]; assert.match(texto(sr), /Sem resposta há mais de 10 dias do follow-up\. Não exigem ação; o resultado da candidatura não foi alterado\. “Encerrar” marca o resultado como “sem retorno”\./);
  assert.ok(botao(sr, "Encerrar") && !botao(sr, "Feito"), "sem retorno só oferece encerrar");
  assert.equal(c.erros.length, 0);
});

test("Agenda: cada linha é um link inteiro (do site ou de fora em outra aba) e o atraso aparece com palavra, cor e marca, nunca só a cor", async () => {
  const c = telaAgenda({ ...CENARIO, aulas: [] }); c.renderAgenda(); await pausa(); await pausa();
  const linha = (t) => porClasse(c.root, "ag-item").find((li) => texto(li).includes(t));
  const rev = linha("Revisão 30 mil"), a = todos(rev, (x) => x.tag === "a")[0]; assert.equal(a.attrs.href, "#veiculos/civic"); assert.ok(!a.attrs.target, "link do próprio site não abre outra aba");
  const atr = linha("Ligar para o seguro"); assert.ok(porClasse(atr, "rac-marca--alta").length === 1, "atrasado tem a marca de prioridade alta"); assert.match(texto(atr), /há 3 dias/); assert.ok(porClasse(atr, "rac-selo--erro").length === 1, "e o selo de erro, com o texto");
  assert.equal(todos(atr, (x) => x.tag === "a").length, 0, "lembrete não tem destino: a linha não é link");
  /* IPVA: link de fora (http), em outra aba, sem referência; um destino que não é http nunca vira link */
  const e1 = { data: dia(1), t: "IPVA", sub: "", tipo: "veiculo", href: "https://portal.fazenda.sp.gov.br/servicos/ipva", ext: true }, e2 = { data: dia(1), t: "Esquisito", sub: "", tipo: "veiculo", href: "javascript:alert(1)", ext: true };
  const l1 = c.agdLinha(e1, HOJE, () => {}), l2 = c.agdLinha(e2, HOJE, () => {});
  const a1 = todos(l1, (x) => x.tag === "a")[0]; assert.deepEqual([a1.attrs.href, a1.attrs.target, a1.attrs.rel], ["https://portal.fazenda.sp.gov.br/servicos/ipva", "_blank", "noopener"]); assert.equal(todos(l2, (x) => x.tag === "a").length, 0, "javascript: não vira link");
});

test("Agenda: Próxima melhor ação é a seleção da régua de sempre; o destaque tem as ações e as outras linhas só levam ao módulo", async () => {
  const c = telaAgenda(CENARIO); c.renderAgenda(); await pausa(); await pausa();
  const s = await c.proximasSelecao(), card = porClasse(c.root, "ag-prox")[0];
  assert.match(texto(card), /Próxima melhor ação/); assert.match(texto(card), /Só o que pede algo de você, agora/);
  const dest = porClasse(card, "ag-destaque")[0]; assert.ok(dest && texto(dest).includes(s.destaque.titulo), "o destaque é o da régua: " + s.destaque.titulo); assert.match(texto(dest), /Urgente/);
  const rot = todos(dest, (x) => x.tag === "button").map(texto); assert.deepEqual(rot, s.destaque.acoes.map((a) => ({ feito: "Feito", adiar: "Adiar 3 dias", semretorno: "Sem retorno" })[a]));
  assert.equal(todos(porClasse(card, "rac-lista")[0] || el("x"), (x) => x.tag === "button").length, 0, "as linhas secundárias não têm botões (como no cartão do Início)");
  assert.equal(s.mostrados.length, 1 + s.secundarias.length);
  /* sem nada urgente: a frase de sempre, sem inventar ação */
  const v = telaAgenda({ registros: REG_VAZIO, backup: true }); v.renderAgenda(); await pausa(); await pausa();
  assert.match(texto(porClasse(v.root, "ag-prox")[0]), /Tudo em dia\. Nenhuma ação urgente agora\./);
  /* a régua falhou: só esse cartão avisa; a agenda aparece inteira */
  const f = telaAgenda({ ...CENARIO, selFalha: true }); f.renderAgenda(); await pausa(); await pausa();
  assert.match(texto(porClasse(f.root, "ag-prox")[0]), /Não consegui montar agora\./); assert.ok(grupos(f.root).length >= 4, "a lista segue"); assert.deepEqual(f.erros.map((x) => x[0]), ["próxima ação"]);
});

test("Agenda: as ações rápidas gravam pelos mesmos caminhos de antes (Feito, Adiar 3 dias, Encerrar), desligam os botões e redesenham", async () => {
  /* Feito num lembrete */
  let c = telaAgenda({ lembretes: [{ id: "l1", data: dia(-3), t: "Ligar para o seguro" }], backup: true, registros: REG_VAZIO }); c.renderAgenda(); await pausa(); await pausa();
  let li = porClasse(c.root, "ag-item").find((x) => texto(x).includes("Ligar para o seguro")), b = botao(li, "Feito"); assert.ok(b); assert.equal(b.attrs["aria-label"], "Feito: Ligar para o seguro", "o leitor de tela sabe de qual item é");
  b.onclick({ stopPropagation() {} }); assert.equal(b.disabled, true, "desligado até o redesenho"); assert.deepEqual(c.gravados, ["lembretes"]); assert.equal(c.PESSOAL.lembretes[0].feito, HOJE);
  await pausa(); await pausa(); assert.ok(!grupos(c.root).some((g) => g.itens.join().includes("Ligar para o seguro")), "o lembrete feito sai da lista");
  /* Adiar 3 dias num follow-up: soma 3 dias a partir de hoje (ou da data futura) */
  c = telaAgenda({ candidaturas: [JSON.parse(JSON.stringify(CAND_RECENTE))], registros: REG_VAZIO }); c.renderAgenda(); await pausa(); await pausa();
  li = porClasse(c.root, "ag-item").find((x) => texto(x).includes("Analista de Dados Jr")); assert.deepEqual(todos(li, (x) => x.tag === "button").map(texto), ["Feito", "Adiar 3 dias", "Sem retorno"]);
  botao(li, "Adiar 3 dias").onclick({ stopPropagation() {} }); assert.equal(c.PESSOAL.candidaturas[0].followupEm, dia(3)); assert.deepEqual(c.gravados, ["candidaturas"]);
  assert.equal(c.PESSOAL.candidaturas[0].resultado, undefined, "adiar não mexe no resultado");
  /* Encerrar uma candidatura sem retorno: resultado "sem retorno" e uma linha no histórico; nada é apagado */
  c = telaAgenda({ candidaturas: [JSON.parse(JSON.stringify(CAND_VELHA))], registros: REG_VAZIO }); c.renderAgenda(); await pausa(); await pausa();
  botao(porClasse(c.root, "ag-grupo--semretorno")[0], "Encerrar").onclick({ stopPropagation() {} });
  assert.equal(c.PESSOAL.candidaturas[0].resultado, "sem retorno"); assert.equal(c.PESSOAL.candidaturas[0].interacoes.slice(-1)[0].t, "Marcada como sem retorno");
});

test("Agenda: o filtro por área só aparece com mais de uma área, filtra os grupos sem reler e sobrevive ao redesenho; área que some volta para 'Todas'", async () => {
  const c = telaAgenda(CENARIO); c.renderAgenda(); await pausa(); await pausa();
  const chips = porClasse(c.root, "rac-chip"); assert.ok(chips.length >= 3, "Todas e as áreas presentes"); assert.equal(chips[0].attrs["aria-pressed"], "true"); assert.match(texto(chips[0]), /^Todas/);
  const nomes = chips.map(texto).join("|"); assert.match(nomes, /Veículos/); assert.match(nomes, /Lembrete/); assert.match(nomes, /MBA/);
  const lei = c.AGD.ult; chips.find((x) => /Veículos/.test(texto(x))).onclick(); assert.equal(c.AGD.ult, lei, "filtrar não relê a agenda");
  assert.deepEqual(grupos(c.root).map((g) => g.titulo), ["Próximos 7 dias"]); assert.ok(porClasse(c.root, "rac-chip").find((x) => /Veículos/.test(texto(x))).attrs["aria-pressed"] === "true");
  assert.equal(kpi(c.root, "Atrasados").valor, "1", "os indicadores seguem os do total (o filtro só mexe na lista)");
  /* desenhar a página de novo (como o botão de atualizar) mantém o filtro */
  c.renderAgenda(); await pausa(); await pausa(); assert.equal(c.AGD.filtro, "veiculo"); assert.deepEqual(grupos(c.root).map((g) => g.titulo), ["Próximos 7 dias"]);
  /* a área do filtro deixa de existir: volta para Todas (a lista nunca fica vazia por um filtro esquecido) */
  c.PESSOAL.lembretes = []; c.PESSOAL.candidaturas = []; c.fonteMbaDados = () => ({ aulas: [], avals: [], fin: null });
  c.AGD.filtro = "mba"; c.renderAgenda(); await pausa(); await pausa(); assert.equal(c.AGD.filtro, "todos"); assert.ok(grupos(c.root).length >= 1);
  /* uma área só: sem chips */
  const u = telaAgenda({ registros: REG }); u.renderAgenda(); await pausa(); await pausa(); assert.equal(porClasse(u.root, "rac-chip").length, 0, "sem o que filtrar, sem filtro");
});

test("Agenda: os próximos 14 dias têm uma célula por dia com data, dia da semana e quantidade fixas; toque mostra o detalhe", async () => {
  const c = telaAgenda(CENARIO); c.renderAgenda(); await pausa(); await pausa();
  const cel = porClasse(c.root, "ag-dia"); assert.equal(cel.length, 14); assert.ok(classe(cel[0], "ag-dia--hoje") && classe(cel[0], "ag-dia--1") && !classe(cel[0], "ag-dia--2"), "hoje: contorno e 2 itens (aula e follow-up) = nível 1 (3 ou mais seria o nível 2)");
  assert.deepEqual([texto(cel[0]), texto(cel[1]), texto(cel[2])], ["hoje 13 2", "sáb 14 –", "dom 15 1"], "dia da semana, data e quantidade sempre visíveis (zero vira traço)");
  assert.equal(cel[0].attrs["aria-label"], "13/11 (hoje): 2 itens"); assert.equal(cel[1].attrs["aria-label"], "14/11 (sáb): nada");
  assert.deepEqual([...cel[0].dica()], ["13/11 · hoje", "2 itens: Python II; Analista de Dados Jr · Beta"]); assert.deepEqual([...cel[1].dica()], ["14/11 · sáb", "nada neste dia"]);
  assert.equal(porClasse(c.root, "ag-dia--1").length, 2, "hoje (2 itens) e o dia da revisão... só o que tem item é azul"); assert.match(texto(porClasse(c.root, "ag-dias")[0].children[0]), /hoje/);
});

test("Agenda: o formulário de lembrete grava como sempre (id, data, texto, no começo da lista) e não grava vazio", async () => {
  const c = telaAgenda({ ...CENARIO, aulas: [] }); c.renderAgenda(); await pausa(); await pausa();
  const campos = todos(c.root, (x) => x.tag === "input"), t = campos[0], d = campos[1], status = todos(c.root, (x) => x.tag === "p" && x.attrs.role === "status")[0], ad = botao(c.root, "Adicionar");
  assert.equal(d.type, "date"); assert.equal(d.value, HOJE, "a data começa em hoje"); assert.match(t.placeholder, /Google Cloud/);
  ad.onclick(); assert.equal(c.gravados.length, 0, "vazio não grava"); assert.equal(t.focado, true); assert.match(status.textContent, /Escreva o que precisa lembrar/);
  t.value = "  Pagar o IPTU  "; d.value = dia(4); const antes = c.PESSOAL.lembretes.length; ad.onclick();
  assert.deepEqual(c.gravados, ["lembretes"]); assert.equal(c.PESSOAL.lembretes.length, antes + 1); const n = c.PESSOAL.lembretes[0];
  assert.deepEqual([n.t, n.data, /^l[0-9a-z]+$/.test(n.id)], ["Pagar o IPTU", dia(4), true], "texto aparado, a data escolhida e o id de sempre, no começo"); assert.equal(t.value, "", "o campo é limpo"); assert.match(status.textContent, /Lembrete adicionado/);
  await pausa(); await pausa(); assert.match(texto(c.root), /Pagar o IPTU/, "o novo lembrete aparece na lista");
  const novo = c.root; assert.ok(botao(novo, "+ Novo lembrete"), "a abertura tem o atalho do formulário"); botao(novo, "+ Novo lembrete").onclick(); assert.equal(t.focado, true);
});

test("Agenda: leitura parcial, vazia e com falha total dizem a verdade (nunca 'nada' quando a leitura falhou)", async () => {
  /* parcial: o banco recusou os registros; o resto da agenda aparece com o aviso */
  let c = telaAgenda({ ...CENARIO, registros: { data: null, error: { message: "permissão negada" } } }); c.renderAgenda(); await pausa(); await pausa();
  const av = texto(porClasse(c.root, "rac-alerta")[0]); assert.match(av, /Agenda incompleta/); assert.match(av, /Leitura parcial da agenda \(registros: permissão negada\)/); assert.ok(grupos(c.root).length >= 3, "o que foi lido aparece");
  /* vazia de verdade */
  c = telaAgenda({ registros: REG_VAZIO, backup: true }); c.renderAgenda(); await pausa(); await pausa();
  assert.match(texto(c.root), /Nada com data por enquanto\./); assert.equal(grupos(c.root).length, 0); assert.equal(porClasse(c.root, "rac-alerta").length, 0);
  /* falha total: nenhum item e a leitura falhou */
  c = telaAgenda({ registros: { data: null, error: { message: "fora do ar" } }, backup: true }); c.FAM = {}; /* sem veículos, o IPVA que a Agenda calcula sozinho também não existe */ c.renderAgenda(); await pausa(); await pausa();
  assert.match(texto(c.root), /Nenhum item na parte que foi lida \(a leitura falhou: não dá para dizer que não há nada\)\./); assert.doesNotMatch(texto(c.root), /Nada com data por enquanto/);
  /* erro inesperado ao montar: mensagem e registro do erro, o resto da página (formulário) continua */
  c = telaAgenda({ nuvemFalha: true }); c.renderAgenda(); await pausa(); await pausa();
  assert.match(texto(c.root), /Não consegui montar a agenda \(banco fora do ar\)\./); assert.deepEqual(c.erros[0], ["agenda", "banco fora do ar"]); assert.ok(botao(c.root, "Adicionar"), "o formulário continua");
});

test("Agenda: a leitura que chega atrasada não apaga a que veio depois (descarta a resposta de um desenho já substituído)", async () => {
  const c = telaAgenda(CENARIO); const S = { raiz: el("div"), hero: el("div"), aviso: el("div"), kpis: el("div"), prox: el("div"), lista: el("div"), graf: el("div") };
  c.agdCarregar(S); const n1 = c.AGD.seq; c.agdCarregar(S); assert.equal(c.AGD.seq, n1 + 1, "cada leitura tem o seu número"); await pausa(); await pausa();
  assert.equal(porClasse(S.lista, "ag-grupo").length, 5, "pintou uma vez só, com a leitura mais nova"); S.raiz.isConnected = false; const antes = S.lista.children.length; c.agdCarregar(S); await pausa(); await pausa(); assert.equal(S.lista.children.length, antes, "página que saiu da tela não é repintada");
});

test("Agenda: a página não acessa o banco nem a rede por conta própria, não grava fora do pessoalGravar e não é da casa", () => {
  const js = ler("js/agenda.js"), limpo = js.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/\bSB\b|supabase|fetch\(|XMLHttpRequest|localStorage|sessionStorage|\.storage\b|createClient/.test(limpo), "só usa a fonte da Agenda, a régua e o pessoalGravar");
  assert.deepEqual([...new Set(limpo.match(/pessoalGravar\(/g))], ["pessoalGravar("], "a única gravação direta é a do formulário de lembrete"); assert.equal((limpo.match(/pessoalGravar\(/g) || []).length, 1);
  assert.match(limpo, /agendaColetarLeitura\(\)/); assert.match(limpo, /proximasSelecao\(\)/); assert.match(limpo, /proximaAcao\(/);
  assert.ok(!/\bwindow\.open\(|innerHTML\s*=\s*[^"'\s]/.test(limpo.replace(/innerHTML\s*=\s*""/g, "")), "nada de HTML montado de texto");
  const R = registro(), ag = R.rotas.find((r) => r.id === "agenda"); assert.deepEqual(ag.mods, ["agenda"]); assert.ok(!ag.casa && !R.DA_CASA.includes("agenda"), "a casa (Fernanda) não vê a Agenda");
  assert.equal(ag.area, "hoje"); assert.equal(ag.curto, "Agenda", "continua na barra inferior do celular e na área Hoje do menu");
  assert.match(ler("sw.js"), /"\.\/js\/agenda\.js"/, "no cache offline");
});
