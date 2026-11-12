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
const exato = (no, txt) => todos(no, (e) => e.tag === "button" && e.attrs.text === txt)[0];
const campo = (no, ph) => todos(no, (e) => (e.tag === "input" || e.tag === "textarea") && e.attrs.placeholder === ph)[0];
const igual = (a, b, m) => assert.equal(JSON.stringify(a), JSON.stringify(b), m); /* objetos criados dentro do vm têm outro Array/Object: compara pelo conteúdo */
const msgs = (no) => todos(no, (e) => String(e.attrs.class || "").includes("rtmsg")).map((e) => e.textContent || "").join(" | ");
const textoDe = (no) => (typeof no === "string" ? no : no.texto);

/* ---- banco falso ---- */
function bancoFalso(dados = {}, falhas = {}) {
  const log = [];
  const consulta = (t) => {
    const st = { t, ops: [] }; log.push(st);
    const p = new Proxy({}, { get(_, k) {
      if (k === "then") { const op = st.ops[0]?.[0]; const chave = t + ":" + op; const r = falhas[chave] ? { data: null, error: { message: falhas[chave] } } : { data: op === "select" ? (dados[t] ?? []) : [{ id: "novo-" + t, ...st.ops[0][1] }], error: null }; return Promise.resolve(r).then.bind(Promise.resolve(r)); }
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
  const abas = todos(t.corpo, (e) => e.tag === "a").map((a) => a.attrs.text); assert.deepEqual(abas, ["Oportunidades", "Descobrir", "Produtos", "Lojas", "Ajustes"]);
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
  const ia = botao(t.corpo, "Pedir sugestão da IA"); assert.equal(ia.attrs.disabled, "disabled"); assert.match(ia.attrs.title, /Desligada/); assert.equal(ia.onclick, undefined, "sem ação: nada é chamado");
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
  assert.equal(sem.banco.de("radar_precos", "insert").length, 0, "sem evidência não grava"); assert.match(msgs(sem.corpo), /evidência verificável/, "o erro aparece junto do formulário, sem redesenhar a tela");
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
  assert.ok(!/\b(eval|Function)\s*\(|document\.write|insertAdjacentHTML|outerHTML/.test(s)); assert.match(s, /rel:"noopener noreferrer"/); assert.equal((s.match(/racIA\(/g) || []).length, 1, "a IA só é chamada num lugar (o botão, com confirmação)"); assert.ok(!/anthropic|api\.openai/i.test(s));
  assert.ok(!/\b\d{5}-?\d{3}\b/.test(s), "nenhum CEP no código"); assert.ok(!/sb_secret|service_role|apikey/i.test(s));
  assert.ok(!/(fetch\(|XMLHttpRequest)/.test(s), "o navegador nunca busca página de loja: quem lê é a função, com as travas");
});
test("iPhone: coluna única, campos de 16px (sem zoom do Safari), alvos de toque e rolagem horizontal do gráfico e das abas", () => {
  const css = ler("index.html"), i = css.indexOf("Radar de Preços (js/radar.js)"), bloco = css.slice(i, css.indexOf("</style>", i));
  assert.match(bloco, /\.rtform\{display:grid;gap:10px/); assert.match(bloco, /\.rtcampo input,#mercado-view \.rtcampo select,#mercado-view \.rtform textarea\{width:100%;box-sizing:border-box;font-size:16px\}/);
  assert.match(bloco, /@media \(max-width:640px\)[\s\S]*min-height:40px/); assert.match(bloco, /\.rtgraf\{overflow-x:auto/); assert.match(bloco, /\.rtabas\{overflow-x:auto/); assert.match(bloco, /#mercado-view \.rtop\{[^}]*width:100%/);
  assert.ok(/<meta name="viewport"[^>]*width=device-width/.test(css));
});

/* ---------- correções do uso real: link que sumia, valor pago invisível, falta de excluir ---------- */
const abrirItem = async (t) => { await t.abrir(); t.ctx.RT.item = "i1"; t.ctx.rtDesenhar(); };
test("oferta pelo link: loja desconhecida é cadastrada junto (com a confirmação), erro não apaga o que foi digitado e link ruim avisa no formulário", async () => {
  const t = montar({ dados: { radar_ofertas: [] } }); await abrirItem(t); const url = campo(t.corpo, "Cole o link do produto na loja");
  url.value = "https://a.co/d/abc123"; t.ctx.confirm = () => false; botao(t.corpo, "Cadastrar oferta").onclick(); await espera();
  assert.equal(t.banco.gravacoes().length, 0); assert.match(msgs(t.corpo), /a\.co não existe ainda/); assert.equal(url.value, "https://a.co/d/abc123", "o link continua no campo"); assert.equal(t.ctx.RT.aviso, "", "sem redesenhar a tela");
  url.value = "http://a.co/x"; botao(t.corpo, "Cadastrar oferta").onclick(); await espera(); assert.match(msgs(t.corpo), /https/); assert.equal(url.value, "http://a.co/x");
  url.value = ""; botao(t.corpo, "Cadastrar oferta").onclick(); await espera(); assert.match(msgs(t.corpo), /Cole o link ou escolha a loja/);
  url.value = "https://a.co/d/abc123"; t.ctx.confirm = () => true; botao(t.corpo, "Cadastrar oferta").onclick(); await espera(); await espera(); await espera();
  const lj = t.banco.de("radar_lojas", "insert"), of = t.banco.de("radar_ofertas", "insert");
  assert.equal(lj.length, 1); igual([lj[0].ops[0][1].nome, lj[0].ops[0][1].dominio, lj[0].ops[0][1].coleta_permitida], ["a.co", "a.co", false]);
  assert.equal(of.length, 1); igual([of[0].ops[0][1].loja_id, of[0].ops[0][1].url, of[0].ops[0][1].item_id], ["novo-radar_lojas", "https://a.co/d/abc123", "i1"]);
  /* loja já cadastrada: usa a existente, sem perguntar nem criar outra */
  const t2 = montar({ dados: { radar_ofertas: [] } }); await abrirItem(t2); campo(t2.corpo, "Cole o link do produto na loja").value = "https://www.loja.com.br/p/7"; t2.ctx.confirm = () => { throw new Error("não devia perguntar"); };
  botao(t2.corpo, "Cadastrar oferta").onclick(); await espera(); await espera(); assert.equal(t2.banco.de("radar_lojas", "insert").length, 0); assert.equal(t2.banco.de("radar_ofertas", "insert")[0].ops[0][1].loja_id, "l1");
});
test("erro ao salvar fica no formulário e os campos continuam preenchidos", async () => {
  const t = montar({ falhas: { "radar_precos:insert": "violates check constraint" } }); await abrirItem(t);
  const preco = campo(t.corpo, "Preço do produto (R$)"); preco.value = "100"; campo(t.corpo, "Evidência: link da página, nº da nota ou descrição do print").value = "print";
  botao(t.corpo, "Registrar preço").onclick(); await espera(); await espera();
  assert.match(msgs(t.corpo), /banco recusou os valores/); assert.equal(preco.value, "100", "o valor digitado não some"); assert.equal(t.ctx.RT.aviso, "");
});
test("quanto paguei: aparece no produto e na lista, o bloco continua aberto, valor inválido avisa e em branco remove", async () => {
  const t = montar(); await abrirItem(t); const pa = campo(t.corpo, "Ex.: 71,00"), st = () => msgs(t.corpo);
  pa.value = "abc"; exato(t.corpo, "Salvar").onclick(); assert.match(st(), /71,00/); assert.equal(t.gravados.length, 0);
  pa.value = "71"; exato(t.corpo, "Salvar").onclick();
  assert.equal(t.gravados[0][0], "radar-pagos"); igual(t.gravados[0][1].i1, { a_vista: 71 });
  assert.match(textoDe(t.corpo), /Paguei: à vista R\$ 71,00/); assert.match(textoDe(t.corpo), /Valor pago salvo: à vista R\$ 71,00/); assert.equal(t.ctx.RT.abertos.pago, 1);
  const d = todos(t.corpo, (e) => e.tag === "details").find((e) => e.kids.some((k) => k.attrs && k.attrs.text === "O que eu paguei")); assert.equal(d.attrs.open, "open", "continua aberto depois de salvar");
  assert.equal(campo(t.corpo, "Ex.: 71,00").value, "71,00", "o campo mostra o valor formatado");
  t.ctx.RT.item = null; t.ctx.RT.aba = "itens"; t.ctx.rtDesenhar(); assert.match(textoDe(t.corpo), /Paguei: à vista R\$ 71,00/, "também na lista de produtos");
  t.ctx.RT.item = "i1"; t.ctx.rtDesenhar(); campo(t.corpo, "Ex.: 71,00").value = ""; exato(t.corpo, "Salvar").onclick(); igual(t.gravados[1][1], {}); assert.match(textoDe(t.corpo), /Valor pago removido/);
  campo(t.corpo, "Ex.: 780,00").value = "780,50"; exato(t.corpo, "Salvar").onclick(); igual(t.gravados.at(-1)[1].i1, { parcelado: 780.5 }); assert.match(textoDe(t.corpo), /parcelado R\$ 780,50/);
});
test("excluir: produto sem ofertas é excluído (com confirmação); com ofertas só arquiva; oferta sem preços e loja sem ofertas podem ser excluídas; histórico nunca é apagado", async () => {
  const t = montar({ dados: { radar_ofertas: [], radar_precos: [] } }); await abrirItem(t);
  t.ctx.confirm = () => false; botao(t.corpo, "Excluir produto").onclick(); await espera(); assert.equal(t.banco.de("radar_itens", "delete").length, 0, "sem confirmar, nada");
  t.ctx.confirm = () => true; botao(t.corpo, "Excluir produto").onclick(); await espera(); await espera();
  const del = t.banco.de("radar_itens", "delete"); assert.equal(del.length, 1); igual(del[0].ops[1], ["eq", "id", "i1"]);
  /* com oferta: não existe botão de excluir produto; arquivar pausa as ofertas e tira o produto da lista */
  const a = montar(); await abrirItem(a); assert.equal(botao(a.corpo, "Excluir produto"), undefined); assert.match(textoDe(a.corpo), /Arquive para tirar da lista/);
  a.ctx.confirm = () => true; botao(a.corpo, "Arquivar produto").onclick(); await espera(); await espera(); await espera();
  const up = a.banco.de("radar_itens", "update").at(-1); assert.equal(up.ops[0][1].ativo, false);
  const pausa = a.banco.de("radar_ofertas", "update")[0]; assert.equal(pausa.ops[0][1].situacao, "pausada"); igual(pausa.ops[1], ["eq", "item_id", "i1"]);
  assert.equal(a.ctx.RT.item, null, "volta para a lista");
  const b = montar({ dados: { radar_itens: [{ ...ITEM, ativo: false }] } }); await b.abrir(); b.ctx.RT.aba = "itens"; b.ctx.rtDesenhar(); assert.ok(!textoDe(b.corpo).includes("Fone XM-4"), "arquivado não aparece"); assert.match(textoDe(b.corpo), /Mostrar arquivados \(1\)/);
  botao(b.corpo, "Mostrar arquivados").onclick(); assert.match(textoDe(b.corpo), /Fone XM-4[\s\S]*arquivado/);
  const op = montar({ dados: { radar_ofertas: [OFERTA, { ...OFERTA, id: "o2", url: "https://www.loja.com.br/p/2" }], radar_precos: [P(1, 100)] } }); await abrirItem(op);
  assert.equal(todos(op.corpo, (e) => e.tag === "button" && e.attrs.text === "Excluir oferta").length, 1, "só a oferta sem preços tem Excluir");
  op.ctx.confirm = () => true; botao(op.corpo, "Excluir oferta").onclick(); await espera(); igual(op.banco.de("radar_ofertas", "delete")[0].ops[1], ["eq", "id", "o2"]);
  const lo = montar({ dados: { radar_ofertas: [], radar_lojas: [LOJA, { ...LOJA, id: "l2", nome: "Loja B" }] } }); await lo.abrir(); lo.ctx.RT.aba = "lojas"; lo.ctx.rtDesenhar(); lo.ctx.confirm = () => true;
  assert.equal(todos(lo.corpo, (e) => e.tag === "button" && e.attrs.text === "Excluir").length, 2); todos(lo.corpo, (e) => e.tag === "button" && e.attrs.text === "Excluir")[1].onclick(); await espera(); igual(lo.banco.de("radar_lojas", "delete")[0].ops[1], ["eq", "id", "l2"]);
  const nunca = ler("js/radar.js"); assert.ok(!/rtExcluir\(RT\.sb,"radar_precos"|from\("radar_precos"\)\.delete/.test(nunca), "o histórico de preços nunca é apagado pela tela");
  assert.match(montar().ctx.rtErro({ message: 'update or delete on table "radar_itens" violates foreign key constraint 23503' }), /não dá para excluir/);
});

/* ---------- Lote 3: IA na tela (desligada por padrão, paga só quando tocar, nunca grava sozinha) ---------- */
const montarIA = (extra = {}, ia = true) => { const t = montar({ pessoal: ia ? { "radar-config": { ia: { on: true } } } : {}, ...extra }); t.chamadasIA = []; t.ctx.racIA = (...a) => { t.chamadasIA.push(a); return Promise.resolve(t.respostaIA ?? { ok: true, modo: "REAL", resultado: RESP_IA, avisos: [] }); }; return t; };
const RESP_IA = { sugestao: "provavel", confianca: 0.9, variante_cadastrada: "Preto", variante_anuncio: "Preto", evidencias: [{ campo: "gtin", cadastrado: "7891000100103", anuncio: "7891000100103" }, { campo: "modelo", cadastrado: "XM-4", anuncio: "XM-4" }], divergencias: [], incertezas: [], resumo: "Mesmo GTIN e modelo." };
test("IA desligada por padrão: o botão não faz nada e nenhuma chamada é possível; ligar só em Ajustes", async () => {
  const t = montarIA({}, false); await abrirItem(t); const b = botao(t.corpo, "Pedir sugestão da IA"); assert.equal(b.attrs.disabled, "disabled"); assert.match(b.attrs.text, /desligada/); assert.equal(t.chamadasIA.length, 0);
  t.ctx.RT.item = null; t.ctx.RT.aba = "ajustes"; t.ctx.rtDesenhar(); const caixa = todos(t.corpo, (e) => e.tag === "input" && e.attrs.type === "checkbox")[0]; assert.match(textoDe(t.corpo), /Desligada por padrão/); assert.match(textoDe(t.corpo), /PAGA|paga/);
  caixa.checked = true; exato(t.corpo, "Salvar ajustes").onclick(); assert.equal(t.gravados[0][0], "radar-config"); assert.equal(t.gravados[0][1].ia.on, true);
});
test("IA ligada: pede confirmação do custo, exige título, manda só dados do produto e do anúncio (nunca preço, frete ou CEP) e mostra a sugestão sem aplicar nada", async () => {
  const t = montarIA({ dados: { radar_ofertas: [{ ...OFERTA, equivalencia: "nao_confirmada", evidencias: [] }], radar_precos: [P(1, 4321.5)] } }); await abrirItem(t);
  const b = botao(t.corpo, "Pedir sugestão da IA"); assert.notEqual(b.attrs.disabled, "disabled");
  b.onclick(); assert.equal(t.chamadasIA.length, 0, "sem título não chama"); assert.match(msgs(t.corpo), /Cole o título do anúncio/);
  campo(t.corpo, "Título do anúncio (cole aqui para a IA)").value = "Fone Bluetooth Marca A XM-4 Preto"; t.ctx.confirm = () => false; b.onclick(); await espera(); assert.equal(t.chamadasIA.length, 0, "sem confirmar o custo, não chama");
  let texto = ""; t.ctx.confirm = (m) => { texto = m; return true; }; b.onclick(); await espera(); await espera();
  assert.match(texto, /PAGA/); assert.match(texto, /centavos/); assert.equal(t.chamadasIA.length, 1);
  const [mod, acao, entrada, ctx2, chave] = t.chamadasIA[0]; assert.deepEqual([mod, acao, entrada.imagens.length, chave], ["radar", "radar.equivalencia", 0, undefined]);
  assert.match(entrada.texto, /^CADASTRADO: \{.*"gtin":"7891000100103".*\}\nANUNCIO: \{"titulo":"Fone Bluetooth Marca A XM-4 Preto","vendedor":"Loja A"\}$/);
  assert.ok(!/4321|R\$|frete|cep|preco/i.test(entrada.texto), "nenhum preço, frete ou CEP vai para a IA"); assert.ok(entrada.texto.length < 1000);
  assert.match(textoDe(t.corpo), /Sugestão da IA: provável \(confiança 90%\)/); assert.match(textoDe(t.corpo), /A IA só sugere/);
  assert.equal(t.banco.gravacoes().length, 0, "a sugestão não grava nada: nem equivalência, nem preço");
  /* o dono decide: confirmar grava origem 'dono' com as evidências marcadas como vindas da IA */
  botao(t.corpo, "Confirmar que é o mesmo produto").onclick(); await espera(); await espera();
  const u = t.banco.de("radar_ofertas", "update")[0].ops[0][1]; assert.deepEqual([u.equivalencia, u.equivalencia_origem, !!u.confirmada_em], ["confirmada", "dono", true]); assert.equal(u.evidencias[0].origem, "ia");
});
test("IA ligada mas sem liberação no servidor (DEMO/sem_real), erro de rede ou resposta suspeita: mostra o motivo, não aplica nada e não trava o Radar", async () => {
  for (const r of [{ ok: false, modo: "DEMO", mensagem: "Esta análise só existe com a IA real, e ela não está liberada agora. Nada foi analisado, reservado nem cobrado." }, { ok: true, modo: "DEMO", resultado: { ...RESP_IA, _demo: true } }, { ok: true, modo: "REAL" }]) {
    const t = montarIA(); t.respostaIA = r; await abrirItem(t); campo(t.corpo, "Título do anúncio (cole aqui para a IA)").value = "Fone"; botao(t.corpo, "Pedir sugestão da IA").onclick(); await espera(); await espera();
    assert.equal(t.chamadasIA.length, 1); assert.ok(!textoDe(t.corpo).includes("Sugestão da IA:"), JSON.stringify(r).slice(0, 40)); assert.equal(t.banco.gravacoes().length, 0); assert.ok(msgs(t.corpo).length > 3);
  }
  const t = montarIA(); t.ctx.racIA = () => Promise.reject(new Error("sem internet")); await abrirItem(t); campo(t.corpo, "Título do anúncio (cole aqui para a IA)").value = "Fone"; botao(t.corpo, "Pedir sugestão da IA").onclick(); await espera(); await espera();
  assert.match(msgs(t.corpo), /Não consegui falar com a IA/); assert.ok(botao(t.corpo, "Sugerir equivalência (regras)"), "o resto do Radar continua funcionando");
  const sem = montarIA(); delete sem.ctx.racIA; await abrirItem(sem); campo(sem.corpo, "Título do anúncio (cole aqui para a IA)").value = "x"; botao(sem.corpo, "Pedir sugestão da IA").onclick(); assert.match(msgs(sem.corpo), /não está disponível/);
});
test("IA: sugestão 'divergente' nunca oferece confirmar; 'provável' sem evidência também não", async () => {
  for (const r of [{ ...RESP_IA, sugestao: "divergente", evidencias: [], divergencias: [{ campo: "modelo", cadastrado: "XM-4", anuncio: "XM-5" }] }, { ...RESP_IA, sugestao: "provavel", evidencias: [] }]) {
    const t = montarIA(); t.respostaIA = { ok: true, modo: "REAL", resultado: r, avisos: [] }; await abrirItem(t); campo(t.corpo, "Título do anúncio (cole aqui para a IA)").value = "Fone"; botao(t.corpo, "Pedir sugestão da IA").onclick(); await espera(); await espera();
    assert.equal(botao(t.corpo, "Confirmar que é o mesmo produto (decisão minha)"), undefined); assert.ok(botao(t.corpo, "Rejeitar equivalência"));
  }
});
test("sinais de anúncio suspeito aparecem na oportunidade sem descartá-la", async () => {
  const dados = { radar_lojas: [{ ...LOJA, tipo: "marketplace" }], radar_ofertas: [{ ...OFERTA, vendedor: null }], radar_precos: [P(10, 200), P(0, 20), P(0, 10, { modalidade: "parcelado", meio: "credito", parcelas: 2, valor_parcela: 5, total_parcelado: 10, sem_juros: true, observado_em: iso(0.0005) })] };
  const t = montar({ dados }); await t.abrir(); const txt = textoDe(t.corpo);
  assert.match(txt, /R\$ 30,00/); assert.match(txt, /queda grande/); assert.match(txt, /Marketplace sem vendedor identificado/); assert.match(txt, /total parcelado está abaixo do preço à vista/);
});

test("Lojas: Editar muda nome e tipo sem mexer na coleta; domínio novo desliga a coleta; domínio inválido é recusado; Excluir sem ofertas e explicação com ofertas", async () => {
  const lib = { ...LOJA, coleta_permitida: true };
  const t = montar({ dados: { radar_lojas: [lib], radar_ofertas: [] } }); await t.abrir(); t.ctx.RT.aba = "lojas"; t.ctx.rtDesenhar();
  const ult = (no, ph) => todos(no, (e) => e.tag === "input" && e.attrs.placeholder === ph).at(-1) /* o da última loja: o 1º é o do formulário "Nova loja" */; const nome = ult(t.corpo, "Nome da loja"), dom = ult(t.corpo, "Domínio (ex.: loja.com.br)");
  assert.ok(nome && dom && todos(t.corpo, (e) => e.tag === "button" && (e.attrs.text ?? e.texto).includes("Salvar alterações")).at(-1), "formulário de edição");
  nome.value = "Loja Renomeada"; todos(t.corpo, (e) => e.tag === "button" && (e.attrs.text ?? e.texto).includes("Salvar alterações")).at(-1).onclick(); await espera(); await espera();
  let u = t.banco.de("radar_lojas", "update").at(-1); assert.equal(u.ops[0][1].nome, "Loja Renomeada"); assert.equal(u.ops[0][1].coleta_permitida, true, "mesmo domínio: a coleta liberada continua"); igual(u.ops[1], ["eq", "id", "l1"]);
  /* domínio novo: a coleta desliga e o domínio sai normalizado */
  t.ctx.RT.aba = "lojas"; t.ctx.rtDesenhar(); ult(t.corpo, "Domínio (ex.: loja.com.br)").value = "https://www.OutraLoja.com.br/p?x=1"; todos(t.corpo, (e) => e.tag === "button" && (e.attrs.text ?? e.texto).includes("Salvar alterações")).at(-1).onclick(); await espera(); await espera();
  u = t.banco.de("radar_lojas", "update").at(-1); assert.equal(u.ops[0][1].dominio, "outraloja.com.br"); assert.equal(u.ops[0][1].coleta_permitida, false, "domínio novo: coleta desligada até liberar de novo");
  /* domínio inválido: nada é gravado */
  const antes = t.banco.de("radar_lojas", "update").length; t.ctx.RT.aba = "lojas"; t.ctx.rtDesenhar(); ult(t.corpo, "Domínio (ex.: loja.com.br)").value = "isso nao e dominio"; todos(t.corpo, (e) => e.tag === "button" && (e.attrs.text ?? e.texto).includes("Salvar alterações")).at(-1).onclick(); await espera(); await espera();
  assert.equal(t.banco.de("radar_lojas", "update").length, antes, "domínio inválido não grava"); assert.match(msgs(t.corpo), /Domínio inválido/);
  /* com ofertas: sem Excluir, com a explicação; o histórico de preços não é tocado */
  const c = montar({ dados: { radar_lojas: [LOJA], radar_ofertas: [OFERTA] } }); await c.abrir(); c.ctx.RT.aba = "lojas"; c.ctx.rtDesenhar();
  assert.equal(botao(c.corpo, "Excluir"), undefined); assert.match(textoDe(c.corpo), /antes exclua ou troque as 1 oferta\(s\) ligadas/); assert.ok(botao(c.corpo, "Salvar alterações"), "editar continua disponível");
  assert.equal(c.banco.de("radar_precos", "update").length + c.banco.de("radar_precos", "delete").length, 0);
});

/* ---------- aba Descobrir (descoberta pelo provedor; candidatos ainda não confirmados na loja) ---------- */
const CAND = (id, titulo, extra = {}) => ({ id, item_id: "i1", consulta_id: "q1", provedor: "serpapi", engine: "google_shopping", id_externo: id, pai_externo: null, titulo, loja: "Magalu", link: "https://www.google.com/search?x=" + id, link_tipo: "google", preco: 100, preco_texto: "R$ 100,00",
  moeda: "BRL", preco_original: null, desconto_texto: null, frete_situacao: "desconhecido", frete_valor: null, frete_texto: null, total: null, pagamento_texto: null, parcelamento_texto: null, entrega_texto: null, detalhes: null, avaliacao: 4.9, avaliacoes: 2300,
  tipo_oferta: "individual", relevancia: 70, quantidade: 1, medida_valor: 454, medida_unidade: "g", composicao: [], preco_por_medida: 10.79, base_medida: "100 g", grupo_chave: "g", chave_dedup: id, catalogo: false, varias_fontes: false, product_id: id, page_token: null,
  token_observado_em: null, evidencias: ["o modelo CH-02 aparece no título"], sinais: [], observado_em: "2026-11-11T21:32:00Z", precos_anteriores: [], decisao: "pendente", oferta_id: null, ...extra });
const CANDS = [
  CAND("c1", "Creme Hidratante Corporal Principia CH-02 454g", { preco: 49, preco_por_medida: 10.79, page_token: "TOKEN-1", catalogo: true, produto_chave: "principia|ch02", apresentacao_chave: "454g" }),
  CAND("c2", "Kit 2 Creme Hidratante Principia CH-02 454g", { preco: 133.92, tipo_oferta: "kit_mesmo_produto", quantidade: 2, medida_valor: 908, preco_por_medida: 14.75, relevancia: 65, produto_chave: "principia|ch02", apresentacao_chave: "2x454g", composicao: [{ descricao: "Creme Hidratante Corporal Principia CH-02", modelo: "ch02", medida: { valor: 454, unidade: "g" }, quantidade: 2 }] }),
  CAND("c3", "Kit Cremes Hidratantes CH-01 + CH-02", { preco: 74.8, tipo_oferta: "combo", medida_valor: null, medida_unidade: null, preco_por_medida: null, base_medida: null, relevancia: 40, produto_chave: "combo:ch01+ch02", apresentacao_chave: "combo", composicao: [{ descricao: "Creme Hidratante Corporal Principia CH-02", modelo: "ch02", medida: null, quantidade: 1 }, { descricao: "Produto CH-01", modelo: "ch01", medida: null, quantidade: 1 }] }),
  CAND("c4", "Creme Hidratante Corporal Principia CH-02 250g", { preco: 38.99, tipo_oferta: "outra_apresentacao", medida_valor: 250, preco_por_medida: 15.6, relevancia: 50 }),
  CAND("c5", "Principia Kit Antissinais Trio Ch + Pm + Gr", { preco: 227, tipo_oferta: "relacionado", medida_valor: null, medida_unidade: null, preco_por_medida: null, base_medida: null, relevancia: 15, loja: "principiaskin.com" }),
  CAND("c6", "Anúncio que o dono já ignorou", { decisao: "ignorado", tipo_oferta: "indeterminado", relevancia: 5, preco_por_medida: null }),
  CAND("l1", "Kit 2 Creme Hidratante Principia CH-02 454g", { pai_externo: "c2", engine: "google_immersive_product", loja: "Drogasil", link: "https://www.drogasil.com.br/p/1", link_tipo: "loja", preco: 130, total: 139.9, frete_situacao: "informado_provedor", frete_valor: 9.9, pagamento_texto: "Pix, cartão", tipo_oferta: "kit_mesmo_produto", quantidade: 2, medida_valor: 908, preco_por_medida: 14.32, produto_chave: "principia|ch02", apresentacao_chave: "2x454g" }),
];
const abrirDesc = async (extra = {}, fn = {}, pessoal = {}) => {
  const t = montar({ pessoal, dados: { radar_candidatos: CANDS, radar_consultas: [{ id: "q1", engine: "google_shopping", variante: "completa", consulta: "Principia CH-02", status: "ok", resultados: 6, buscas_gastas: 1, iniciada_em: "2026-11-11T21:32:00Z", erro_codigo: null }], ...extra } });
  t.corpos = []; t.banco.SB.functions.invoke = (n, o) => { t.corpos.push(o.body); const r = fn[o.body.tipo]; return Promise.resolve(typeof r === "function" ? r(o.body) : r ?? { data: { ok: false, erro: "sem_chave_serpapi" } }); };
  await t.abrir(); t.ctx.RT.aba = "desc"; t.ctx.rtDesenhar(); await espera(); await espera(); await espera(); return t;
};

test("Descobrir: lista TODOS os anúncios (nada é descartado), tipos identificados, preço por medida, frete desconhecido e a ressalva de que não foi confirmado na loja", async () => {
  const t = await abrirDesc({}, { uso_descoberta: { data: { ok: true, orcamento: { dia_usado: 2, dia_limite: 20, mes_usado: 5, mes_limite: 200, restante: 15 } } } }), txt = textoDe(t.corpo);
  assert.deepEqual(todos(t.corpo, (e) => e.tag === "a" && /^(Oportunidades|Descobrir|Produtos|Lojas|Ajustes)$/.test(e.attrs.text)).map((a) => a.attrs.text), ["Oportunidades", "Descobrir", "Produtos", "Lojas", "Ajustes"]);
  for (const x of ["Individual", "Kit do mesmo produto", "Combo", "Outra apresentação", "Relacionado"]) assert.ok(txt.includes(x), x);
  const titulos = ["CH-02 454g", "Kit 2 Creme Hidratante Principia CH-02 454g", "CH-01 + CH-02", "CH-02 250g"]; for (const x of titulos) assert.ok(txt.includes(x), "aparece: " + x);
  assert.ok(!txt.includes("Trio Ch + Pm + Gr"), "padrão: o relacionado (outro produto da marca) fica fora da lista, mas contado"); assert.match(txt, /Do produto \(4\)/); assert.match(txt, /Todos \(5\)/);
  botao(t.corpo, "Todos (5)").onclick(); await espera(); const txt2 = textoDe(t.corpo); assert.ok(txt2.includes("Trio Ch + Pm + Gr"), "Todos traz o relacionado de volta: nada é descartado");
  assert.ok(!txt.includes("já ignorou"), "o ignorado fica oculto, mas contado"); assert.match(txt, /Mostrar ignorados \(1\)/);
  assert.ok(txt2.includes("R$ 14,75 por 100 g") && txt2.includes("R$ 10,79 por 100 g") && txt2.includes("R$ 15,60 por 100 g"), "preço por medida");
  assert.ok(txt2.indexOf("R$ 10,79 por 100 g") < txt2.indexOf("R$ 14,75 por 100 g") && txt2.indexOf("R$ 14,75 por 100 g") < txt2.indexOf("R$ 15,60 por 100 g"), "ordem padrão: menor preço por medida primeiro");
  assert.ok(txt2.indexOf("R$ 15,60 por 100 g") < txt2.indexOf("Kit Cremes Hidratantes CH-01 + CH-02"), "o que não tem preço por medida vem depois (combo, relacionado)");
  assert.ok(txt2.includes("Frete: desconhecido (não conta como grátis)")); assert.ok(txt2.includes("ainda não confirmado na loja")); assert.ok(txt2.includes("Composição (sugerida pelo título): 2 × Creme Hidratante Corporal Principia CH-02 454 g")); assert.ok(txt2.includes("Creme Hidratante Corporal Principia CH-02 + Produto CH-01"));
  assert.ok(txt2.includes("Frete segundo o Google: R$ 9,90 (não confirmado para o seu CEP)") && txt2.includes("Pix, cartão") && txt2.includes("total R$ 139,90"), "a loja do anúncio aparece aninhada, com o frete do Google rotulado como não confirmado");
  assert.ok(txt2.includes("hoje 2 de 20") && txt2.includes("no mês 5 de 200"), "orçamento de buscas"); assert.ok(txt2.includes("2 unidades") && txt2.includes("908 g no total"));
  botao(t.corpo, "Combo (1)").onclick(); await espera(); const so = textoDe(t.corpo); assert.ok(so.includes("CH-01 + CH-02") && !so.includes("CH-02 250g")); botao(t.corpo, "Todos").onclick();
  botao(t.corpo, "Mostrar ignorados").onclick(); await espera(); assert.ok(textoDe(t.corpo).includes("já ignorou"), "mostrar ignorados traz de volta");
  assert.equal(t.banco.gravacoes().length, 0, "só ler e mostrar não grava nada");
});

test("Descobrir: buscar chama a função com o produto (sem chave), mostra consumo e cache, erros em português; Ver lojas usa o anúncio; nada grava direto", async () => {
  const t = await abrirDesc({}, {
    descobrir: { data: { ok: true, consultas: [{ variante: "completa", status: "ok", gasto: 1, novos: 3 }, { variante: "marca_modelo", status: "cache", gasto: 0 }], orcamento: { dia_usado: 1, dia_limite: 20, mes_usado: 1, mes_limite: 200, restante: 19 }, avisos: [] } },
    expandir: (b) => ({ data: b.candidato_id === "c1" ? { ok: true, status: "ok", lojas: 2, gasto: 1 } : { ok: false, erro: "token_vencido" } }), cota_provedor: { data: { ok: true, cota: { this_month_usage: 3, total_searches_left: 247, account_rate_limit_per_hour: 50 } } },
  });
  exato(t.corpo, "Buscar ofertas").onclick(); await espera(); await espera(); await espera(); igual(t.corpos.find((b) => b.tipo === "descobrir"), { tipo: "descobrir", item_id: "i1" });
  assert.match(textoDe(t.corpo), /2 consulta\(s\): 1 busca\(s\) gasta\(s\), 1 do cache, 3 anúncio\(s\) novo\(s\)/); assert.match(textoDe(t.corpo), /hoje 1 de 20/);
  botao(t.corpo, "Ver lojas").onclick(); await espera(); await espera(); await espera(); igual(t.corpos.find((b) => b.tipo === "expandir"), { tipo: "expandir", candidato_id: "c1" }); assert.match(textoDe(t.corpo), /Lojas encontradas: 2\. 1 busca gasta\./);
  botao(t.corpo, "Conferir cota").onclick(); await espera(); await espera(); assert.match(textoDe(t.corpo), /usadas no mês 3 · restantes 247 · limite por hora 50/);
  for (const corpo of t.corpos) assert.ok(!/api_?key|chave|token/i.test(JSON.stringify(corpo)), "o site nunca manda chave nem token"); assert.equal(t.banco.gravacoes().length, 0);
  const e1 = await abrirDesc({}, { descobrir: { data: { ok: false, erro: "sem_chave_serpapi" } } }); exato(e1.corpo, "Buscar ofertas").onclick(); await espera(); await espera(); assert.match(textoDe(e1.corpo), /SERPAPI_API_KEY não está cadastrado/);
  const e2 = await abrirDesc({}, { descobrir: { error: { message: "FunctionsHttpError" } } }); exato(e2.corpo, "Buscar ofertas").onclick(); await espera(); await espera(); assert.match(textoDe(e2.corpo), /não respondeu/);
  const e3 = await abrirDesc({}, { descobrir: { data: { ok: false, erro: "orcamento", mensagem: "Limite de buscas atingido (dia 20/20, mês 40/200)." } } }); exato(e3.corpo, "Buscar ofertas").onclick(); await espera(); await espera(); assert.match(textoDe(e3.corpo), /O limite de consultas foi atingido\./); assert.ok(!/dia 20\/20/.test(textoDe(e3.corpo)), "só a mensagem simples, sem números nem fluxo extra");
});

test("Descobrir: Acompanhar só vale com link de loja (cria loja e oferta pelo fluxo existente e liga o candidato); anúncio só do Google pede 'Ver lojas'; Ignorar só muda a decisão", async () => {
  const t = await abrirDesc(); const cartoes = (ini) => todos(t.corpo, (e) => String(e.attrs.class || "").includes("rtopo") && textoDe(e).startsWith(ini));
  const g = todos(cartoes("Creme Hidratante Corporal Principia CH-02 454g")[0], (e) => e.tag === "button" && e.attrs.text === "Acompanhar")[0]; g.onclick(); await espera();
  assert.match(textoDe(t.corpo), /só tem a página do Google/); assert.equal(t.banco.gravacoes().length, 0, "link do Google não vira oferta");
  const loja = cartoes("Kit 2 Creme Hidratante Principia CH-02 454g").filter((e) => textoDe(e).includes("Drogasil")).pop(), ac = todos(loja, (e) => e.tag === "button" && e.attrs.text === "Acompanhar")[0]; assert.ok(ac, "a loja do anúncio tem o botão");
  ac.onclick(); for (let i = 0; i < 6; i++) await espera();
  assert.equal(t.banco.de("radar_lojas", "insert").length, 1); assert.equal(t.banco.de("radar_lojas", "insert")[0].ops[0][1].dominio, "drogasil.com.br"); const of = t.banco.de("radar_ofertas", "insert")[0].ops[0][1]; assert.equal(of.url, "https://www.drogasil.com.br/p/1"); assert.equal(of.item_id, "i1"); assert.equal(of.vendedor, "Drogasil");
  const up = t.banco.de("radar_candidatos", "update")[0].ops[0][1]; assert.equal(up.decisao, "acompanhando"); assert.ok(up.oferta_id); assert.deepEqual(Object.keys(up).sort(), ["atualizado_em", "decisao", "oferta_id"], "só decisão e oferta");
  assert.equal(of.evidencias.length, 1); assert.deepEqual([of.evidencias[0].tipo, of.evidencias[0].tipo_oferta, of.evidencias[0].quantidade, of.evidencias[0].apresentacao], ["descoberta", "kit_mesmo_produto", 2, "2x454g"], "a oferta nasce com a evidência de onde veio");
  assert.equal(of.equivalencia, undefined, "a equivalência não é decidida aqui (continua não confirmada)"); assert.match(t.ctx.RT.aviso, /Atenção: este anúncio é kit do mesmo produto \(2x454g\): o preço dele não é o do frasco avulso/);
  assert.equal(t.banco.de("radar_precos", "insert").length, 0, "acompanhar não inventa preço no histórico");
  const t2 = await abrirDesc(); todos(t2.corpo, (e) => e.tag === "button" && e.attrs.text === "Ignorar")[0].onclick(); await espera(); await espera(); const u = t2.banco.de("radar_candidatos", "update")[0].ops[0][1]; assert.equal(u.decisao, "ignorado"); assert.deepEqual(Object.keys(u).sort(), ["atualizado_em", "decisao"]);
});

test("Descobrir: sem a migration 048 a aba avisa e o resto do Radar continua; sem produto pede o cadastro; a tela não conhece a chave do provedor", async () => {
  const t = montar({ falhas: { "radar_candidatos:select": 'relation "public.radar_candidatos" does not exist', "radar_consultas:select": 'relation "public.radar_consultas" does not exist' } });
  t.banco.SB.functions.invoke = () => Promise.resolve({ data: { ok: false, erro: "migracao_pendente" } }); await t.abrir(); t.ctx.RT.aba = "desc"; t.ctx.rtDesenhar(); await espera(); await espera(); await espera();
  assert.match(textoDe(t.corpo), /precisa da migration 048/); t.ctx.RT.aba = "itens"; t.ctx.rtDesenhar(); assert.match(textoDe(t.corpo), /Fone XM-4/, "as outras abas seguem normais");
  const v = montar({ dados: { radar_itens: [] } }); await v.abrir(); v.ctx.RT.aba = "desc"; v.ctx.rtDesenhar(); assert.match(textoDe(v.corpo), /Cadastre um produto/);
  const src = ler("js/radar.js"); assert.ok(!/api_key=|"api_key"|bearer|authorization/i.test(src.slice(src.indexOf("descobrir: ofertas encontradas"), src.indexOf("ajustes: CEP privado"))), "a tela não conhece a chave do provedor");
});

test("Descobrir: histórico por identidade do produto (atravessa lojas e anúncios, sem misturar combo), créditos por operação, fontes implementadas × planejadas e o valor pago", async () => {
  const hist = [
    { produto_chave: "principia|ch02", apresentacao_chave: "2x454g", loja: "Magalu", preco: 133.92, preco_por_medida: 14.75, base_medida: "100 g", observado_em: "2026-11-10T10:00:00Z" },
    { produto_chave: "principia|ch02", apresentacao_chave: "2x454g", loja: "Drogasil", preco: 130, preco_por_medida: 14.32, base_medida: "100 g", observado_em: "2026-11-11T10:00:00Z" },
    { produto_chave: "principia|ch02", apresentacao_chave: "454g", loja: "Drogal", preco: 48.99, preco_por_medida: 10.79, base_medida: "100 g", observado_em: "2026-11-11T11:00:00Z" },
    { produto_chave: "principia|ch02", apresentacao_chave: "454g", loja: "Magalu", preco: 49, preco_por_medida: 10.79, base_medida: "100 g", observado_em: "2026-11-09T11:00:00Z" },
    { produto_chave: "combo:ch01+ch02", apresentacao_chave: "combo", loja: "Droga Raia", preco: 74.8, preco_por_medida: null, base_medida: null, observado_em: "2026-11-11T12:00:00Z" },
  ];
  const t = await abrirDesc({ radar_historico: hist }, { uso_descoberta: { data: { ok: true, orcamento: { dia_usado: 3, dia_limite: 20, mes_usado: 7, mes_limite: 200, restante: 13, expansoes_dia: 1, expansoes_limite_dia: 10, rotina_dia: 0, rotina_limite_dia: 6, por_engine: { google_shopping: { dia: 2, mes: 6 }, google_immersive_product: { dia: 1, mes: 1 } }, por_origem: { manual: { dia: 3, mes: 7 } } },
    provedores: [{ id: "serpapi", nome: "SerpApi (Google Shopping)", estado: "ativo" }, { id: "mercadolivre", nome: "Mercado Livre (API oficial)", estado: "planejado" }, { id: "vtex_paginas", nome: "Páginas de lojas VTEX (leitura direta)", estado: "planejado" }] } } }, { "radar-pagos": { i1: { a_vista: 52.5 } } });
  const txt = textoDe(t.corpo);
  assert.ok(txt.includes("Histórico deste produto (2x454g): 2 observação(ões) em 2 loja(s) · menor R$ 130,00 (Drogasil, "), "o kit: série do kit, atravessando lojas");
  assert.ok(txt.includes("Histórico deste produto (454g): 2 observação(ões) em 2 loja(s) · menor R$ 48,99 (Drogal, "), "o avulso: série própria");
  assert.ok(txt.includes("Menor preço por 100 g já visto (todos os tamanhos e kits do mesmo produto): R$ 10,79"), "comparação por medida entre tamanhos e kits do MESMO produto");
  assert.ok(txt.includes("Histórico deste produto (combo): 1 observação(ões) em 1 loja(s) · menor R$ 74,80 (Droga Raia, "), "o combo tem a série PRÓPRIA, só com o que é do combo"); const porMedida = [...txt.matchAll(/Menor preço por 100 g já visto \(todos os tamanhos e kits do mesmo produto\): (R\$ [\d.,]+)/g)].map((m) => m[1]); assert.ok(porMedida.length >= 1 && porMedida.every((v) => v === "R$ 10,79"), "o combo não entra na comparação por medida do produto");
  assert.ok(txt.includes("Créditos contados pelo RAC: hoje 3 de 20 · no mês 7 de 200") && txt.includes("Hoje: 2 busca(s), 1 expansão(ões) de lojas (máx. 10/dia), rotina 0 de 6"), "créditos por operação");
  assert.ok(txt.includes("Fontes: SerpApi (Google Shopping) (ativa) · Mercado Livre (API oficial) (ainda não implementada) · Páginas de lojas VTEX (leitura direta) (ainda não implementada)"), "o que está implementado e o que é futuro");
  assert.match(txt, /Paguei: à vista R\$ 52,50/); assert.equal(t.banco.gravacoes().length, 0, "mostrar histórico, créditos e fontes não grava nada");
  const sem = await abrirDesc({ radar_historico: [] }); assert.ok(!textoDe(sem.corpo).includes("Histórico deste produto"), "sem observações, sem histórico inventado");
  const quebrado = await abrirDesc({}, {}, {}); quebrado.banco.log.length = 0;
  const falha = montar({ dados: { radar_candidatos: CANDS }, falhas: { "radar_historico:select": 'relation "public.radar_historico" does not exist' } }); falha.banco.SB.functions.invoke = () => Promise.resolve({ data: { ok: false } }); await falha.abrir(); falha.ctx.RT.aba = "desc"; falha.ctx.rtDesenhar(); await espera(); await espera(); await espera();
  assert.ok(textoDe(falha.corpo).includes("Kit 2 Creme Hidratante Principia CH-02 454g") && !/precisa da migration/.test(textoDe(falha.corpo)), "sem a tabela de histórico a aba continua mostrando os candidatos");
});
