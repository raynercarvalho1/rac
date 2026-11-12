// Central de Compras como um mercado (núcleo puro NUCLEO.cm*): categoria → produtos → preços; estabelecimento → compras e produtos; comparação e oportunidades.
// Garante que tudo sai das MESMAS compras da Central (cuUnificar), sem recalcular a fonte, sem contar duas vezes e com os totais batendo com as barras da Central.
// Dados FICTÍCIOS; sem rede, sem banco, sem IA.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const r2 = (x) => Math.round(x * 100) / 100;
const HOJE = "2026-11-10";

let seq = 0;
/* linha da view "compras" (um item por linha), como o Mercado a carrega */
const L = (data, mercado, numero, produto, categoria, q, vu, un = "un", extra = {}) => ({ id: "i" + ++seq, data, mk: data.slice(0, 7), mercado, numero, forma_pagamento: "Crédito", categoria, subcategoria: null,
  descricao: produto.toUpperCase(), produto, produto_id: "p" + seq, quantidade: q, unidade: un, valor_unitario: vu, valor_total: r2(q * vu), desconto: 0, nota: data + "|" + mercado + "|" + numero, ...extra });
const MERC = [
  L("2026-09-05", "Tauste (Sorocaba)", "10", "Pão Francês", "Padaria", 0.5, 20, "kg"),
  L("2026-10-01", "Tauste (Sorocaba)", "11", "Pão Francês", "Padaria", 1, 18, "kg"), L("2026-10-01", "Tauste (Sorocaba)", "11", "Leite", "Mercearia", 6, 5),
  L("2026-11-02", "Confiança (Sorocaba)", "20", "Pão Francês", "Padaria", 0.5, 16, "kg"), L("2026-11-02", "Confiança (Sorocaba)", "20", "Leite", "Mercearia", 12, 4.5),
  L("2026-11-02", "Confiança (Sorocaba)", "20", "Bolo de Fubá", "Padaria", 1, 12), L("2026-11-03", "Tauste (Sorocaba)", "12", "Pão Francês", "Padaria", 2, 1.2, "un"),
];
const RACAO = { id: "o1", data: "2026-11-04", loja: "amazon", numero: "111-1", subtotal: 110, desconto: 10, frete: 12.5, taxas: 0, total_pago: 112.5,
  itens: [{ descricao: "Ração Golden 10kg", qtd: 2, total: 110, desconto: 10, categoria: "Pet" }] };
const RACAO2 = { id: "o2", data: "2026-10-04", loja: "amazon", numero: "111-2", subtotal: 60, desconto: 0, frete: 0, taxas: 0, total_pago: 60,
  itens: [{ descricao: "Ração Golden 10kg", qtd: 1, total: 60, desconto: 0, categoria: "Pet" }] };
const CANCELADO = { id: "o3", data: "2026-11-05", loja: "amazon", numero: "X3", total_pago: 40, status: "cancelado", itens: [{ descricao: "Panela", qtd: 1, total: 40, categoria: "Casa" }] };
const FORA = { id: "o4", data: "2026-11-06", loja: "amazon", numero: "X4", total_pago: 30, fora_das_contas: true, itens: [{ descricao: "Leite", qtd: 6, total: 30, categoria: "Mercearia" }] };
const ONLINE = [RACAO, RACAO2, CANCELADO, FORA];
const U = N.cuUnificar(N.cuDeNotas(MERC, {}), N.cuDeOnline(ONLINE));
const LIN = N.cmLinhas(U.compras);
const per = (p) => N.cuFiltrar(U.compras, N.cuPeriodo(p, HOJE));

test("cmLinhas: um item por linha, das duas fontes, com o preço da fonte; frete e desconto geral do pedido nunca entram no preço", () => {
  assert.equal(LIN.length, MERC.length + 2, "7 itens das notas + 2 itens online que contam (cancelado e fora das contas ficam de fora, como na Central)");
  assert.ok(!LIN.some((x) => /Panela/.test(x.produto)), "pedido cancelado não vira produto");
  assert.equal(LIN.filter((x) => x.produto === "Leite").length, 2, "o pedido marcado como 'já contado em outro lugar' não entra (não duplica o Leite da nota)");
  const pao = LIN.find((x) => x.produto === "Pão Francês" && x.data === "2026-11-02");
  assert.deepEqual([pao.fonte, pao.estabelecimento, pao.mercado, pao.unidade, pao.valor_unitario, pao.valor_total, pao.abre], ["nota", "Confiança", "Confiança", "kg", 16, 8, "2026-11-02|Confiança (Sorocaba)|20"]);
  const rac = LIN.find((x) => x.compra === "online:o1");
  assert.deepEqual([rac.fonte, rac.estabelecimento, rac.unidade, rac.quantidade, rac.valor_total, rac.valor_unitario, rac.abre, rac.canal], ["online", "Amazon", "un", 2, 100, 50, null, "online"],
    "item: 110 − 10 de desconto do item = 100; preço = 100 ÷ 2; o frete de 12,50 não entra");
  assert.ok(rac.chave_online, "guarda a chave do produto em Compras online");
  const soma = r2(LIN.reduce((s, x) => s + x.valor_total, 0)), R = N.cuResumo(N.cuFiltrar(U.compras, {}));
  assert.equal(soma, r2(R.total - R.ajustes), "Σ linhas = total da Central − ajustes dos pedidos (frete, taxas, descontos gerais)");
});

test("cmCategoria: o total de cada categoria é o MESMO da barra 'Por categoria' da Central, no mesmo período; produtos com gasto, quantidade, médio, último, menor e maior", () => {
  for (const p of ["2026-11", "12m", "tudo"]) {
    const lista = per(p), lin = N.cmLinhas(lista), R = N.cuResumo(lista);
    for (const b of R.porCategoria) { const c = N.cmCategoria(lin, b.cat); assert.equal(c.total, b.total, p + " · " + b.cat); assert.equal(c.compras, b.compras, p + " · compras " + b.cat); }
  }
  const c = N.cmCategoria(N.cmLinhas(per("tudo")), "padaria");
  assert.equal(c.categoria, "Padaria", "o nome da rota é normalizado");
  const pao = c.produtos.find((x) => x.nome === "Pão Francês");
  assert.deepEqual([pao.unidade, pao.unidades, pao.compras, pao.estabelecimentos], ["kg", 2, 4, 2], "kg é a unidade principal; un fica à parte (nunca mistura)");
  assert.deepEqual([pao.ultimo.preco, pao.anterior.preco, pao.menor.preco, pao.maior.preco], [16, 18, 16, 20]);
  assert.equal(pao.medio, r2((0.5 * 20 + 1 * 18 + 0.5 * 16) / 2), "médio ponderado pela quantidade, só em kg");
  assert.equal(r2(pao.variacao), r2((16 - 18) / 18));
  assert.deepEqual(pao.qtd, { kg: 2, un: 2 });
  assert.equal(pao.total, r2(10 + 18 + 8 + 2.4), "o gasto do produto soma todas as unidades");
  assert.deepEqual(c.estabelecimentos.map((e) => e.nome), ["Tauste", "Confiança"]);
  assert.equal(r2(c.estabelecimentos.reduce((s, e) => s + e.total, 0)), c.total, "Σ estabelecimentos da categoria = total da categoria");
  const ali = N.cmCategoria(N.cmLinhas(per("tudo")), "Alimentação");
  assert.ok(ali.grupo && ali.produtos.some((x) => x.nome === "Leite") && ali.produtos.some((x) => x.nome === "Bolo de Fubá"), "o grupo Alimentação junta as categorias de comida");
  assert.ok(!ali.produtos.some((x) => /Ração/.test(x.nome)), "Pet não é Alimentação");
});

test("cmOrdenar: gasto, compras, nome, maior alta e maior queda (sem variação vai para o fim)", () => {
  const ps = N.cmCategoria(N.cmLinhas(per("tudo")), "Padaria").produtos;
  assert.deepEqual(N.cmOrdenar(ps.slice(), "gasto").map((x) => x.nome), ["Pão Francês", "Bolo de Fubá"]);
  assert.deepEqual(N.cmOrdenar(ps.slice(), "alta").map((x) => x.nome), ["Pão Francês", "Bolo de Fubá"], "Bolo tem 1 compra: sem variação, fica no fim");
  assert.deepEqual(N.cmOrdenar(ps.slice(), "nome").map((x) => x.nome), ["Bolo de Fubá", "Pão Francês"]);
  const l = [{ nome: "a", variacao: 0.1, total: 1, compras: 1 }, { nome: "b", variacao: -0.3, total: 1, compras: 1 }, { nome: "c", variacao: null, total: 1, compras: 1 }];
  assert.deepEqual(N.cmOrdenar(l.slice(), "alta").map((x) => x.nome), ["a", "b", "c"]); assert.deepEqual(N.cmOrdenar(l.slice(), "baixa").map((x) => x.nome), ["b", "a", "c"]);
});

test("cmEstabelecimento: total = barra 'Por estabelecimento'; produtos + ajustes dos pedidos = total; histórico, categorias, participação e ranking", () => {
  for (const p of ["2026-11", "12m", "tudo"]) {
    const lista = per(p), R = N.cuResumo(lista);
    for (const b of R.porEstab) {
      const E = N.cmEstabelecimento(lista, b.nome);
      assert.equal(E.total, b.total, p + " · " + b.nome); assert.equal(E.compras, b.n);
      assert.equal(r2(E.produtosValor + E.ajustes), E.total, "produtos + ajustes = total (" + b.nome + ")");
      assert.equal(r2(E.categorias.reduce((s, k) => s + k.total, 0)), E.produtosValor, "Σ categorias = produtos");
    }
    const E0 = N.cmEstabelecimento(lista, R.porEstab[0].nome);
    assert.equal(r2(E0.ranking.reduce((s, r) => s + r.total, 0)), E0.geral, "o ranking cobre todas as compras do período"); assert.equal(E0.posicao, 1);
  }
  const A = N.cmEstabelecimento(per("tudo"), "Amazon");
  assert.deepEqual([A.total, A.produtosValor, A.ajustes, A.compras, A.ticket], [172.5, 160, 12.5, 2, 86.25], "o frete de 12,50 aparece como ajuste, não como produto");
  assert.deepEqual(A.historico.map((h) => [h.id, h.abre]), [["online:o1", null], ["online:o2", null]], "mais recente primeiro; pedido online não tem nota para abrir");
  assert.deepEqual([A.canais.online, A.canais.presencial], [2, 0]);
  const T = N.cmEstabelecimento(per("tudo"), "Tauste");
  assert.equal(T.historico[0].abre, "2026-11-03|Tauste (Sorocaba)|12", "a nota abre pela mesma chave da tela Notas"); assert.equal(T.ajustes, 0);
  assert.deepEqual([T.primeira, T.ultima], ["2026-09-05", "2026-11-03"]);
  const nada = N.cmEstabelecimento(per("2026-11"), "Loja que não existe"); assert.deepEqual([nada.compras, nada.total, nada.posicao], [0, 0, 0]);
});

test("cmComparar: o mesmo produto, na mesma unidade, aqui × o menor preço médio de outro lugar", () => {
  const C = N.cmComparar(N.cmLinhas(per("tudo")), "Tauste");
  const pao = C.produtos.find((x) => x.produto === "Pão Francês"), leite = C.produtos.find((x) => x.produto === "Leite");
  assert.equal(pao.unidade, "kg", "o pão em 'un' (só na Tauste) não é comparado com o de kg");
  assert.deepEqual([pao.aqui.medio, pao.melhor.nome, pao.melhor.medio, pao.leitura], [r2((0.5 * 20 + 18) / 1.5), "Confiança", 16, "mais_caro_aqui"]);
  assert.deepEqual([leite.aqui.medio, leite.melhor.medio, leite.leitura], [5, 4.5, "mais_caro_aqui"]);
  assert.deepEqual(C.contagem, { mais_barato_aqui: 0, mais_caro_aqui: 2, igual: 0 });
  const D = N.cmComparar(N.cmLinhas(per("tudo")), "Confiança"); assert.equal(D.contagem.mais_barato_aqui, 2);
  assert.deepEqual(N.cmComparar(N.cmLinhas(per("tudo")), "Amazon").produtos, [], "a ração só foi comprada na Amazon: nada para comparar");
});

test("cmOportunidades: economia estimada = (médio pago − médio do mais barato) × quantidade comprada lá; só a mesma unidade; limites de 3% e R$ 1", () => {
  const O = N.cmOportunidades(N.cmLinhas(per("tudo")));
  const leite = O.find((x) => x.produto === "Leite"), pao = O.find((x) => x.produto === "Pão Francês");
  assert.deepEqual([leite.barato.nome, leite.caros[0].nome, leite.economia], ["Confiança", "Tauste", r2((5 - 4.5) * 6)]);
  assert.equal(pao.unidade, "kg"); assert.equal(pao.economia, r2((r2((0.5 * 20 + 18) / 1.5) - 16) * 1.5));
  assert.equal(O.length, 2); assert.ok(O[0].economia >= O[1].economia, "maior economia primeiro");
  assert.deepEqual(N.cmOportunidades(N.cmLinhas(per("tudo")), { minValor: 100 }), [], "abaixo do valor mínimo não aparece");
  const quase = N.cmLinhas(N.cuUnificar(N.cuDeNotas([L("2026-11-01", "A", "1", "Arroz", "Mercearia", 10, 10), L("2026-11-02", "B", "2", "Arroz", "Mercearia", 10, 10.2)], {}), N.cuDeOnline([])).compras);
  assert.deepEqual(N.cmOportunidades(quase), [], "diferença de 2% não é oportunidade (padrão: 3%)");
  assert.equal(N.cmOportunidades(quase, { minPct: 0.01 }).length, 1);
});

test("cmPorMes: gasto mês a mês com os filtros da Central; meses sem compra ficam com zero; com categoria valem só os itens dela", () => {
  const E = N.cmPorMes(U.compras, {}, HOJE, 4);
  assert.deepEqual(E.meses.map((m) => m.mes), ["2026-08", "2026-09", "2026-10", "2026-11"]);
  assert.deepEqual(E.meses.map((m) => m.total), [0, 10, r2(18 + 30 + 60), r2(8 + 54 + 12 + 2.4 + 112.5)]);
  assert.equal(E.desde, "2026-09"); assert.equal(E.media, r2(E.total / 3), "média desde o primeiro mês com compra");
  assert.equal(r2(E.meses.reduce((s, m) => s + m.total, 0)), N.cuResumo(N.cuFiltrar(U.compras, {})).total, "Σ meses = total da Central");
  const pet = N.cmPorMes(U.compras, { categoria: "Pet" }, "2026-11", 2); assert.deepEqual(pet.meses.map((m) => m.total), [60, 100], "Pet: só os itens, sem o frete");
  const on = N.cmPorMes(U.compras, { canal: "presencial", estab: "Tauste" }, "2026-11", 3); assert.deepEqual(on.meses.map((m) => m.total), [10, 48, 2.4]);
  assert.deepEqual(N.cmPorMes(U.compras, {}, "", 3).meses, [], "sem data final, nada");
});

test("cmExplorar: categorias e estabelecimentos com os totais de cuResumo e os produtos diferentes de cada um", () => {
  const lista = per("tudo"), X = N.cmExplorar(lista), R = N.cuResumo(lista);
  assert.deepEqual(X.categorias.map((c) => [c.nome, c.total]), R.porCategoria.map((c) => [c.cat, c.total]));
  assert.deepEqual(X.estabelecimentos.map((e) => [e.nome, e.total, e.compras]), R.porEstab.map((e) => [e.nome, e.total, e.n]));
  assert.equal(X.categorias.find((c) => c.nome === "Padaria").produtos, 2); assert.equal(X.estabelecimentos.find((e) => e.nome === "Tauste").produtos, 2);
});

test("sem duplicidade: o pedido online que é a mesma compra de uma nota (mesma data, valor e NF) não vira produto duas vezes", () => {
  const nota = [L("2026-11-08", "Loja X", "300", "Cortina", "Automotivo", 1, 19.9)];
  const pedido = { id: "d1", data: "2026-11-08", loja: "mercadolivre", numero: "ML-9", total_pago: 19.9, numero_nf: "300", itens: [{ descricao: "Cortina solar", qtd: 1, total: 19.9, categoria: "Automotivo" }] };
  const u = N.cuUnificar(N.cuDeNotas(nota, {}), N.cuDeOnline([pedido])), l = N.cmLinhas(u.compras);
  assert.equal(l.length, 1); assert.equal(l[0].fonte, "nota"); assert.equal(N.cmCategoria(l, "Automotivo").total, 19.9);
});

test("as funções cm* não alteram o que recebem", () => {
  const antes = JSON.stringify(U.compras), lin = N.cmLinhas(U.compras), lAntes = JSON.stringify(lin);
  N.cmCategoria(lin, "Padaria"); N.cmEstabelecimento(U.compras, "Tauste"); N.cmComparar(lin, "Tauste"); N.cmOportunidades(lin); N.cmPorMes(U.compras, {}, HOJE, 12); N.cmExplorar(U.compras);
  assert.equal(JSON.stringify(U.compras), antes); assert.equal(JSON.stringify(lin), lAntes);
});
