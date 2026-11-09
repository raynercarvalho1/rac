// Radar de Preços, Lote 2 · a aba Radar (js/radar.js) rodando de verdade num ambiente falso: tela mínima (árvore de elementos), banco que registra cada chamada e função que responde ou falha.
// Confere: só o dono, o que cada gravação envia (e o que ela RECUSA antes de enviar), o histórico só de acréscimo, o CEP que nunca aparece, o ranking por modalidade, o gráfico com racDica,
// a IA desabilitada e a integração com o Mercado (aba só do dono, módulo carregado sob demanda, service worker, layout do iPhone). Sem rede e sem custo.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const espera = () => new Promise((r) => setTimeout(r, 0));
const agora = () => Date.now(), iso = (dias) => new Date(agora() - dias * 86400000).toISOString();

/* ---- árvore de elementos mínima ---- */
class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.kids = []; this.style = {}; this.value = ""; this.checked = false; }
  setAttribute(k, v) { this.attrs[k] = v; }
  appendChild(c) { this.kids.push(c); return c; }
  set innerHTML(v) { assert.equal(v, "", "só se limpa a tela, nunca se injeta HTML"); this.kids = []; }
  get innerHTML() { return ""; }
  get texto() { return (this.attrs.text ?? "") + this.kids.map((k) => (typeof k === "string" ? k : k.texto)).join(" "); }
}
function h(tag, attrs, ...filhos) {
  const e = new El(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v === undefined || v === null || v === false) continue; if (k === "value") e.value = String(v); else e.attrs[k] = v; }
  const add = (c) => { if (c === null || c === undefined || c === false) return; if (Array.isArray(c)) c.forEach(add); else e.kids.push(typeof c === "string" ? c : c); };
  filhos.forEach(add);
  return e;
}
const todos = (no, f = () => true, acc = []) => { if (typeof no === "string") return acc; if (f(no)) acc.push(no); no.kids.forEach((k) => todos(k, f, acc)); return acc; };
const achar = (no, f) => todos(no, f)[0];
const botao = (no, txt) => todos(no, (e) => e.tag === "button" && (e.attrs.text ?? e.texto).includes(txt))[0];
const campo = (no, ph) => todos(no, (e) => (e.tag === "input" || e.tag === "textarea") && e.attrs.placeholder === ph)[0];
const igual = (a, b, m) => assert.equal(JSON.stringify(a), JSON.stringify(b), m); /* objetos criados dentro do vm têm outro Array/Object: compara pelo conteúdo */
const textoDe = (no) => (typeof no === "string" ? no : no.texto);

/* ---- banco falso ---- */
function bancoFalso(dados = {}, falhas = {}) {
  const log = [];
  const consulta = (t) => {
    const st = { t, ops: [] }; log.push(st);
    const p = new Proxy({}, { get(_, k) {
      if (k === "then") { const op = st.ops[0]?.[0]; const chave = t + ":" + op; const r = falhas[chave] ? { data: null, error: { message: falhas[chave] } } : { data: op === "select" ? (dados[t] ?? []) : [st.ops[0][1]], error: null }; return Promise.resolve(r).then.bind(Promise.resolve(r)); }
      return (...a) => { st.ops.push([k, ...a]); return p; };
    } });
    return p;
  };
  const chamadas = [];
  const SB = { from: consulta, functions: { invoke: (n, o) => { chamadas.push([n, o]); const r = falhas.invoke; return typeof r === "function" ? r() : Promise.resolve(r ?? { data: { ok: true, urlFinal: "x", extraido: {} }, error: null }); } } };
  return { SB, log, chamadas, gravacoes: () => log.filter((x) => ["insert", "update", "delete", "upsert"].includes(x.ops[0]?.[0])), de: (t, op) => log.filter((x) => x.t === t && x.ops[0]?.[0] === op) };
}
const CEP = "1234" + "5678";
const LOJA = { id: "l1", nome: "Loja A", dominio: "loja.com.br", tipo: "varejo", coleta_permitida: false, ativa: true };
const ITEM = { id: "i1", nome: "Fone XM-4", marca: "Marca A", modelo: "XM-4", variante: "Preto", apresentacao: null, gtin: "7891000100103", origem: "monitorado", ativo: true };
const OFERTA = { id: "o1", item_id: "i1", loja_id: "l1", url: "https://www.loja.com.br/p/xm4", vendedor: "Loja A", equivalencia: "confirmada", evidencias: [{ tipo: "gtin" }], situacao: "ativa" };
let seq = 0;
const P = (dias, preco, extra = {}) => ({ id: "p" + ++seq, oferta_id: "o1", modalidade: "a_vista", meio: "pix", fonte: "manual", evidencia: "print", preco_produto: preco, frete_situacao: "confirmado", frete_valor: 10, taxas: 0, desconto: 0, disponibilidade: "disponivel", observado_em: iso(dias), ...extra });

function montar({ dono = true, dados = {}, falhas = {}, pessoal = {} } = {}) {
  const banco = bancoFalso({ radar_config: [{ id: "c1", cep_padrao: CEP }], radar_itens: [ITEM], radar_lojas: [LOJA], radar_ofertas: [OFERTA], radar_precos: [], ...dados }, falhas), dicas = [], gravados = [];
  const ctx = vm.createContext({ NUCLEO: N, console, Promise, Object, Array, JSON, Date, Math, String, Number, Error, isFinite, isNaN, h, vbRotulo: (a, b) => h("span", { class: "vbl" }, h("b", { text: a }), h("small", { text: b })), isOwner: () => dono,
    PESSOAL: { ...pessoal }, pessoalGravar: (k, v) => { gravados.push([k, v]); ctx.PESSOAL[k] = v; }, confirm: () => true, window: { racDica: { ligar: (el, f) => { dicas.push([el, f]); } } } });
  vm.runInContext(ler("js/radar.js") + "\n;globalThis.RT=RT;", ctx);
  const corpo = new El("div");
  return { ctx, banco, corpo, dicas, gravados, abrir: () => ctx.rtMontar(corpo, banco.SB, { id: "u1" }) };
}

/* ---------- só o dono ---------- */
test("a casa não vê o Radar: a tela só diz que é do dono e nenhuma consulta é feita", async () => {
  const t = montar({ dono: false }); await t.abrir();
  assert.match(textoDe(t.corpo), /só do dono/); assert.equal(t.banco.log.length, 0);
  assert.ok(!todos(t.corpo, (e) => e.tag === "button").length, "sem botões");
});
test("o dono abre o Radar: lê as cinco tabelas, mostra as abas e o vazio explicado", async () => {
  const t = montar(); await t.abrir();
  assert.deepEqual([...new Set(t.banco.log.map((x) => x.t))].sort(), ["radar_config", "radar_itens", "radar_lojas", "radar_ofertas", "radar_precos"]);
  assert.ok(t.banco.log.every((x) => x.ops[0][0] === "select"), "abrir não grava nada");
  const abas = todos(t.corpo, (e) => e.tag === "a").map((a) => a.attrs.text); assert.deepEqual(abas, ["Oportunidades", "Produtos", "Lojas", "Ajustes"]);
  assert.match(textoDe(t.corpo), /Ainda não há preços registrados/); assert.match(textoDe(t.corpo), /equivalência confirmada/);
});
test("falha ao ler mostra o erro em português e não quebra a tela", async () => {
  const t = montar({ falhas: { "radar_itens:select": "permission denied for table radar_itens" } }); await t.abrir(); await espera();
  assert.match(textoDe(t.corpo), /Sem permissão: o Radar é só do dono/);
});

/* ---------- gravações: o que envia e o que recusa antes de enviar ---------- */
test("produto: nome e GTIN são conferidos antes de enviar; comprado e monitorado; texto vazio vira nulo", async () => {
  const t = montar(); await t.abrir(); const { ctx, banco } = t, sb = banco.SB;
  await assert.rejects(ctx.rtSalvarItem(sb, { nome: "  " }), /nome ao produto/); await assert.rejects(ctx.rtSalvarItem(sb, { nome: "X", gtin: "123" }), /GTIN/);
  assert.equal(banco.gravacoes().length, 0, "nada foi enviado");
  await ctx.rtSalvarItem(sb, { nome: "  Fone   Novo ", origem: "comprado", marca: "", gtin: "7891000100103" });
  const ins = banco.de("radar_itens", "insert")[0].ops[0][1]; assert.deepEqual([ins.nome, ins.origem, ins.marca, ins.gtin], ["Fone Novo", "comprado", null, "7891000100103"]);
  await ctx.rtSalvarItem(sb, { nome: "Outro", origem: "qualquer" }, "i1"); const up = banco.de("radar_itens", "update")[0]; assert.equal(up.ops[0][1].origem, "monitorado"); assert.deepEqual(up.ops[1], ["eq", "id", "i1"]);
});
test("loja: domínio normalizado (sem https, www e caminho), inválido recusado, coleta só com domínio", async () => {
  const t = montar(); await t.abrir(); const { ctx, banco } = t;
  await ctx.rtSalvarLoja(banco.SB, { nome: "Loja B", dominio: "https://www.LojaB.com.br/produto?x=1", coleta_permitida: true });
  const l = banco.de("radar_lojas", "insert")[0].ops[0][1]; assert.deepEqual([l.dominio, l.coleta_permitida], ["lojab.com.br", true]);
  await ctx.rtSalvarLoja(banco.SB, { nome: "Loja C", dominio: "", coleta_permitida: true }); assert.equal(banco.de("radar_lojas", "insert")[1].ops[0][1].coleta_permitida, false, "sem domínio a coleta não liga");
  await assert.rejects(ctx.rtSalvarLoja(banco.SB, { nome: "D", dominio: "loja_ruim" }), /Domínio inválido/); await assert.rejects(ctx.rtSalvarLoja(banco.SB, { nome: "" }), /nome à loja/);
});
test("oferta: link https obrigatório no formato, produto e loja escolhidos; endereço ruim não vai ao banco", async () => {
  const t = montar(); await t.abrir(); const { ctx, banco } = t;
  for (const url of ["http://loja.com.br/p", "https://127.0.0.1/x", "javascript:1"]) await assert.rejects(ctx.rtSalvarOferta(banco.SB, { item_id: "i1", loja_id: "l1", url }));
  await assert.rejects(ctx.rtSalvarOferta(banco.SB, { item_id: "i1", url: "https://loja.com.br/p" }), /produto e a loja/);
  assert.equal(banco.gravacoes().length, 0);
  await ctx.rtSalvarOferta(banco.SB, { item_id: "i1", loja_id: "l1", url: "https://www.loja.com.br/p/9", vendedor: " Vendedor X " });
  const o = banco.de("radar_ofertas", "insert")[0].ops[0][1]; assert.deepEqual([o.vendedor, o.url], ["Vendedor X", "https://www.loja.com.br/p/9"]); assert.ok(!("equivalencia" in o), "nasce não confirmada (padrão do banco)");
});
test("preço: as regras do núcleo valem antes de enviar (modalidades, frete, parcelas, data); frete desconhecido é aceito mas fica sem preço final", async () => {
  const t = montar(); await t.abrir(); const { ctx, banco } = t, base = { oferta_id: "o1", fonte: "manual", evidencia: "print", modalidade: "a_vista", meio: "pix", preco_produto: 100, frete_situacao: "confirmado", frete_valor: 10, taxas: 0, desconto: 0, disponibilidade: "disponivel", observado_em: new Date().toISOString() };
  for (const ruim of [{ parcelas: 3 }, { evidencia: "" }, { preco_produto: 0 }, { frete_situacao: "desconhecido", frete_valor: 0 }, { frete_situacao: "confirmado", frete_valor: null }, { desconto: 9999 },
    { modalidade: "parcelado", meio: "pix", parcelas: 3, valor_parcela: 100, total_parcelado: 300, sem_juros: true, preco_produto: 300 }, { modalidade: "parcelado", meio: "credito", parcelas: 3, valor_parcela: 90, total_parcelado: 300, sem_juros: true, preco_produto: 300 },
    { observado_em: new Date(Date.now() + 86400000).toISOString() }]) await assert.rejects(ctx.rtRegistrarPreco(banco.SB, { ...base, ...ruim }), JSON.stringify(ruim));
  assert.equal(banco.de("radar_precos", "insert").length, 0, "nenhuma observação inválida foi enviada");
  await ctx.rtRegistrarPreco(banco.SB, { ...base, frete_situacao: "desconhecido", frete_valor: null, cupom: "", parcelas: undefined });
  const e = banco.de("radar_precos", "insert")[0].ops[0][1]; assert.equal(e.frete_situacao, "desconhecido"); assert.ok(!("frete_valor" in e) && !("cupom" in e) && !("parcelas" in e), "campos vazios não vão");
  await ctx.rtRegistrarPreco(banco.SB, { ...base, observado_em: new Date(Date.now() - 1000).toISOString(), modalidade: "parcelado", meio: "credito", parcelas: 3, valor_parcela: 100, total_parcelado: 300, preco_produto: 300, sem_juros: true });
  const pa = banco.de("radar_precos", "insert")[1].ops[0][1]; assert.deepEqual([pa.modalidade, pa.parcelas, pa.sem_juros, pa.total_parcelado], ["parcelado", 3, true, 300]);
});
test("histórico só de acréscimo: corrigir o frete é uma NOVA linha com corrige_id; a tela nunca atualiza nem apaga uma observação", async () => {
  const antiga = P(2, 100, { frete_situacao: "desconhecido", frete_valor: null }), t = montar({ dados: { radar_precos: [antiga] } }); await t.abrir(); const { ctx, banco } = t;
  await ctx.rtCorrigirFrete(banco.SB, antiga, "confirmado", 19.9);
  const c = banco.de("radar_precos", "insert")[0].ops[0][1]; assert.equal(c.corrige_id, antiga.id); assert.equal(c.frete_situacao, "confirmado"); assert.equal(c.frete_valor, 19.9); assert.equal(c.fonte, "manual");
  assert.equal(Date.parse(c.observado_em) - Date.parse(antiga.observado_em), 1000, "1 s depois (a chave única não aceita o mesmo instante)"); assert.match(c.evidencia, /frete conferido pelo dono/); assert.ok(!("id" in c));
  await ctx.rtCorrigirFrete(banco.SB, antiga, "gratis_confirmado", 0); assert.equal(banco.de("radar_precos", "insert")[1].ops[0][1].frete_valor, 0);
  assert.equal(banco.de("radar_precos", "update").length + banco.de("radar_precos", "delete").length, 0);
  const fonte = ler("js/radar.js"); assert.ok(!/from\("radar_precos"\)\.(update|delete|upsert)/.test(fonte), "o código nem tem esse caminho");
});
test("equivalência: confirmar exige evidência e é do dono; a sugestão por regras nunca confirma sozinha; IA não aparece", async () => {
  const t = montar(); await t.abrir(); const { ctx, banco } = t, of = { ...OFERTA, equivalencia: "nao_confirmada", evidencias: [] };
  await assert.rejects(ctx.rtEquivalencia(banco.SB, of, "confirmada", []), /precisa de evidência/); assert.equal(banco.gravacoes().length, 0);
  await ctx.rtEquivalencia(banco.SB, of, "confirmada", [{ tipo: "gtin", texto: "GTIN igual" }]);
  const u = banco.de("radar_ofertas", "update")[0].ops[0][1]; assert.deepEqual([u.equivalencia, u.equivalencia_origem, !!u.confirmada_em], ["confirmada", "dono", true]);
  await ctx.rtEquivalencia(banco.SB, of, "rejeitada", []); assert.equal(banco.de("radar_ofertas", "update")[1].ops[0][1].confirmada_em, null);
});
test("CEP: só 8 dígitos, só o dono, a tela mostra apenas 'cadastrado' (nunca o valor) e o estado em memória não o guarda", async () => {
  const t = montar(); await t.abrir(); const { ctx, banco, corpo } = t;
  await assert.rejects(ctx.rtSalvarCep(banco.SB, "123", "c1"), /8 dígitos/); assert.equal(banco.gravacoes().length, 0);
  await ctx.rtSalvarCep(banco.SB, "1234" + "5-678", "c1"); assert.equal(banco.de("radar_config", "update")[0].ops[0][1].cep_padrao, CEP);
  await ctx.rtSalvarCep(banco.SB, CEP, null); assert.equal(banco.de("radar_config", "insert").length, 1);
  assert.equal(JSON.stringify(ctx.RT.d).includes(CEP), false, "o dado carregado guarda só 'cepOk'"); assert.equal(ctx.RT.d.cepOk, true);
  ctx.RT.aba = "ajustes"; ctx.rtDesenhar(); const tela = textoDe(corpo); assert.match(tela, /CEP padrão cadastrado ✓/); assert.ok(!tela.includes(CEP) && !tela.includes("1234-5678") && !tela.includes("1234 5678"));
  const campoCep = campo(corpo, "8 dígitos"); assert.equal(campoCep.value, "", "o campo nasce vazio"); assert.equal(campoCep.attrs.autocomplete, "off");
  const t2 = montar({ dados: { radar_config: [] } }); await t2.abrir(); t2.ctx.RT.aba = "ajustes"; t2.ctx.rtDesenhar(); assert.match(textoDe(t2.corpo), /ainda não cadastrado/);
  const src = ler("js/radar.js"); assert.ok(!/localStorage|console\.|logErro/.test(src), "nada de log nem cópia local do CEP");
});

/* ---------- leitura automática ---------- */
test("leitura da página: só envia {tipo, url}; sem a função publicada avisa e manda preencher à mão; página recusada mostra o motivo", async () => {
  const t = montar(); await t.abrir(); const { ctx, banco } = t;
  await assert.rejects(ctx.rtLerPagina(banco.SB, "http://loja.com.br/p"), /https/); assert.equal(banco.chamadas.length, 0);
  const ok = await ctx.rtLerPagina(banco.SB, "https://www.loja.com.br/p/1"); assert.equal(ok.ok, true); igual(banco.chamadas[0], ["radar", { body: { tipo: "ler_url", url: "https://www.loja.com.br/p/1" } }]);
  const sem = montar({ falhas: { invoke: { data: null, error: { message: "Function not found" } } } }); await sem.abrir();
  await assert.rejects(sem.ctx.rtLerPagina(sem.banco.SB, "https://www.loja.com.br/p/1"), /ainda não foi publicada[\s\S]*Preencha à mão/);
  const rec = montar({ falhas: { invoke: { data: { ok: false, erro: "robots_nao", motivo: "o robots.txt da loja não permite ler esta página" }, error: null } } }); await rec.abrir();
  await assert.rejects(rec.ctx.rtLerPagina(rec.banco.SB, "https://www.loja.com.br/p/1"), /robots\.txt da loja não permite/);
  assert.equal(t.banco.gravacoes().length, 0, "ler nunca grava");
});

/* ---------- telas com dados ---------- */
const DADOS = () => ({ radar_precos: [P(40, 130), P(20, 120), P(0, 100), P(30, 300, { modalidade: "parcelado", meio: "credito", parcelas: 3, valor_parcela: 100, total_parcelado: 300, sem_juros: true }), P(0, 270, { modalidade: "parcelado", meio: "credito", parcelas: 3, valor_parcela: 90, total_parcelado: 270, sem_juros: true, observado_em: iso(0.001) })] });
test("oportunidades: lista o preço final menor que a última e que o menor da janela, com o dica padrão; a janela troca no clique", async () => {
  const t = montar({ dados: DADOS() }); await t.abrir(); const txt = textoDe(t.corpo);
  assert.match(txt, /Fone XM-4/); assert.match(txt, /R\$ 110,00/); assert.match(txt, /Abaixo da última observação \(R\$ 130,00\)/); assert.match(txt, /Menor da janela/); assert.match(txt, /À vista/); assert.match(txt, /Parcelado 3x/);
  assert.ok(t.dicas.length >= 2, "cada cartão usa racDica"); assert.deepEqual(t.dicas[0][1]().length, 2);
  const j30 = botao(t.corpo, "30 dias"); j30.onclick(); assert.equal(t.ctx.RT.janela, 30);
  const sem = montar({ dados: { radar_precos: [P(0, 100, { frete_situacao: "desconhecido", frete_valor: null }), P(9, 120, { frete_situacao: "desconhecido", frete_valor: null })] } }); await sem.abrir();
  assert.match(textoDe(sem.corpo), /Nenhuma oportunidade agora/, "frete desconhecido nunca vira oportunidade");
});
test("produtos: cada modalidade mostra o seu melhor preço final, separadas; sem preço final aparece escrito", async () => {
  const t = montar({ dados: DADOS() }); await t.abrir(); t.ctx.RT.aba = "itens"; t.ctx.rtDesenhar(); const txt = textoDe(t.corpo);
  assert.match(txt, /À vista: R\$ 110,00/); assert.match(txt, /Parcelado: R\$ 280,00 em 3x/);
  const vazio = montar(); await vazio.abrir(); vazio.ctx.RT.aba = "itens"; vazio.ctx.rtDesenhar(); assert.match(textoDe(vazio.corpo), /À vista: sem preço final confirmado/);
});
test("detalhe: ranking separado por modalidade, 'fora do ranking' com o motivo, histórico com janelas, gráfico com dica, frete a confirmar e IA desabilitada", async () => {
  const dados = DADOS(); dados.radar_precos.push(P(3, 95, { oferta_id: "o2", frete_situacao: "desconhecido", frete_valor: null }));
  dados.radar_ofertas = [OFERTA, { ...OFERTA, id: "o2", url: "https://www.loja.com.br/p/2", vendedor: "Outro", equivalencia: "provavel" }];
  const t = montar({ dados }); await t.abrir(); t.ctx.RT.item = "i1"; t.ctx.rtDesenhar(); const txt = textoDe(t.corpo);
  assert.match(txt, /Ranking · à vista/); assert.match(txt, /Ranking · parcelado/); assert.match(txt, /1º Loja A/); assert.match(txt, /Fora do ranking: Loja A — equivalência não confirmada/);
  assert.match(txt, /Histórico de preços/); for (const j of ["30 dias", "90 dias", "180 dias", "365 dias", "Todo o histórico"]) assert.ok(txt.includes(j), j);
  assert.match(txt, /Menor registrado/); assert.match(txt, /Maior registrado/); assert.match(txt, /Variação/);
  const barras = todos(t.corpo, (e) => e.tag === "button" && String(e.attrs.class).startsWith("vb")); assert.ok(barras.length >= 3);
  for (const b of barras) { assert.ok(todos(b, (e) => e.attrs.class === "vbv").length === 1, "valor fixo em cada barra"); assert.ok(todos(b, (e) => e.attrs.class === "vbl").length === 1, "rótulo fixo em cada barra"); }
  assert.ok(t.dicas.length >= barras.length, "cada barra liga o racDica");
  const ia = botao(t.corpo, "Pedir sugestão da IA"); assert.equal(ia.attrs.disabled, "disabled"); assert.match(ia.attrs.title, /ainda não foi liberada/); assert.equal(ia.onclick, undefined, "sem ação: nada é chamado");
  assert.equal(botao(t.corpo, "Sugerir equivalência (regras)") !== undefined, true);
  /* série parcelada separada da à vista no seletor */
  const series = todos(t.corpo, (e) => e.attrs.class && String(e.attrs.class).startsWith("chipb")).map((c) => c.attrs.text); assert.ok(series.some((s) => /À vista/.test(s)) && series.some((s) => /Parcelado 3x/.test(s)));
});
test("detalhe: observação com frete desconhecido oferece confirmar o frete e isso grava uma nova linha (nada de editar)", async () => {
  const dados = { radar_precos: [P(5, 100, { frete_situacao: "desconhecido", frete_valor: null }), P(1, 99, { frete_situacao: "desconhecido", frete_valor: null })] };
  const t = montar({ dados }); await t.abrir(); t.ctx.RT.item = "i1"; t.ctx.rtDesenhar();
  assert.match(textoDe(t.corpo), /Nenhuma observação desta série tem frete confirmado/); assert.match(textoDe(t.corpo), /frete não confirmado/);
  const f = campo(t.corpo, "Frete (R$)"); f.value = "19,90"; botao(t.corpo, "Confirmar frete").onclick(); await espera(); await espera();
  const ins = t.banco.de("radar_precos", "insert"); assert.equal(ins.length, 1); assert.equal(ins[0].ops[0][1].frete_valor, 19.9); assert.ok(ins[0].ops[0][1].corrige_id);
  assert.equal(t.banco.de("radar_precos", "update").length, 0);
});
test("detalhe: registrar preço pelo formulário envia a observação com a evidência e a modalidade escolhida", async () => {
  const t = montar(); await t.abrir(); t.ctx.RT.item = "i1"; t.ctx.rtDesenhar();
  campo(t.corpo, "Preço do produto (R$)").value = "1.299,90"; campo(t.corpo, "Evidência: link da página, nº da nota ou descrição do print").value = "print da loja em 09/11";
  botao(t.corpo, "Registrar preço").onclick(); await espera(); await espera();
  const e = t.banco.de("radar_precos", "insert")[0].ops[0][1]; assert.deepEqual([e.preco_produto, e.modalidade, e.frete_situacao, e.fonte, e.evidencia, e.oferta_id], [1299.9, "a_vista", "desconhecido", "manual", "print da loja em 09/11", "o1"]);
  const sem = montar(); await sem.abrir(); sem.ctx.RT.item = "i1"; sem.ctx.rtDesenhar(); campo(sem.corpo, "Preço do produto (R$)").value = "50"; campo(sem.corpo, "Evidência: link da página, nº da nota ou descrição do print").value = ""; botao(sem.corpo, "Registrar preço").onclick(); await espera();
  assert.equal(sem.banco.de("radar_precos", "insert").length, 0, "sem evidência não grava"); assert.match(textoDe(sem.corpo), /evidência verificável/);
});
test("ajustes: avisos e vendedores bloqueados vão para a conta (pessoal), e valem nas oportunidades", async () => {
  const t = montar({ dados: { radar_precos: [P(10, 100), P(0, 90)] } }); await t.abrir(); t.ctx.RT.aba = "ajustes"; t.ctx.rtDesenhar();
  const venc = todos(t.corpo, (e) => e.tag === "textarea")[0]; venc.value = "Loja A\n  \nOutro"; botao(t.corpo, "Salvar ajustes").onclick();
  assert.equal(t.gravados[0][0], "radar-config"); igual(t.gravados[0][1].vendedoresBloqueados, ["Loja A", "Outro"]); assert.equal(t.gravados[0][1].push.on, true);
  t.ctx.RT.aba = "oport"; t.ctx.rtDesenhar(); assert.match(textoDe(t.corpo), /Nenhuma oportunidade agora/, "vendedor bloqueado some das oportunidades");
});

/* ---------- integração com o Mercado, segurança do código e iPhone ---------- */
test("Mercado: aba Radar só para o dono, módulo carregado sob demanda, sem mexer nas abas existentes; service worker e versão", () => {
  const m = ler("mercado.js");
  assert.match(m, /\["alertas", "Alertas"\], \["radar", "Radar"\], \["notas", "Notas"\]/); assert.match(m, /\(x\[0\] === "alertas" \|\| x\[0\] === "radar"\) && !ehDono\(\)/);
  assert.match(m, /x\[0\] === sub && \(x\[0\] !== "radar" \|\| ehDono\(\)\)/, "a casa não chega à aba nem pelo endereço");
  const vr = m.slice(m.indexOf("function viewRadar(body)"), m.indexOf("function viewAlertas(body)"));
  assert.match(vr, /if \(!ehDono\(\)\)[\s\S]*?return;/); assert.match(vr, /window\.precisa\(\["radar"\]\)/); assert.match(vr, /window\.rtMontar\(alvo, sb, user\)/); assert.ok(vr.indexOf("ehDono") < vr.indexOf("precisa"), "o dono é conferido antes de carregar o módulo");
  assert.match(m, /v !== "importar" && v !== "radar"/, "o Radar não depende de haver compras");
  for (const v of ["painel: viewPainel", "precos: viewPrecos", "consumo: viewConsumo", "comparar: viewComparar", "alertas: viewAlertas", "notas: viewNotas", "produtos: viewProdutos", "importar: viewImportar"]) assert.ok(m.includes(v), v);
  assert.ok(ler("sw.js").includes('"./js/radar.js"')); assert.equal(/VERSAO = "([^"]+)"/.exec(ler("sw.js"))[1], /MOD_VERSAO="([^"]+)"/.exec(ler("js/app.js"))[1]);
});
test("segurança do módulo: nenhum HTML injetado, links com noopener, sem eval, sem chamada de IA, sem CEP e sem segredos no arquivo", () => {
  const s = ler("js/radar.js");
  for (const m of s.matchAll(/innerHTML\s*=\s*([^;\n]+)/g)) assert.equal(m[1].trim().replace(/[;,)]+$/, ""), '""', "innerHTML só para limpar");
  assert.ok(!/\b(eval|Function)\s*\(|document\.write|insertAdjacentHTML|outerHTML/.test(s)); assert.match(s, /rel:"noopener noreferrer"/); assert.ok(!/racIA\(|anthropic|api\.openai/i.test(s));
  assert.ok(!/\b\d{5}-?\d{3}\b/.test(s), "nenhum CEP no código"); assert.ok(!/sb_secret|service_role|apikey/i.test(s));
  assert.ok(!/(fetch\(|XMLHttpRequest)/.test(s), "o navegador nunca busca página de loja: quem lê é a função, com as travas");
});
test("iPhone: coluna única, campos de 16px (sem zoom do Safari), alvos de toque e rolagem horizontal do gráfico e das abas", () => {
  const css = ler("index.html"), i = css.indexOf("Radar de Preços (js/radar.js)"), bloco = css.slice(i, css.indexOf("</style>", i));
  assert.match(bloco, /\.rtform\{display:grid;gap:10px/); assert.match(bloco, /\.rtcampo input,#mercado-view \.rtcampo select,#mercado-view \.rtform textarea\{width:100%;box-sizing:border-box;font-size:16px\}/);
  assert.match(bloco, /@media \(max-width:640px\)[\s\S]*min-height:40px/); assert.match(bloco, /\.rtgraf\{overflow-x:auto/); assert.match(bloco, /\.rtabas\{overflow-x:auto/); assert.match(bloco, /#mercado-view \.rtop\{[^}]*width:100%/);
  assert.ok(/<meta name="viewport"[^>]*width=device-width/.test(css));
});
