// Lote 5.0 · coResumo: uma só regra financeira de Compras para Resumo, lista, Painel e Hoje; preço histórico com desconto do item; selos de status.
// Só regras puras e leitura dos arquivos do site: sem rede, sem banco, sem custo. Todos os pedidos e valores abaixo são FICTÍCIOS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const HOJE = "2026-11-10", MES = "2026-11";
const r2 = (x) => Math.round(x * 100) / 100;
const soma = (l) => r2(l.reduce((s, x) => s + x.v, 0));

// ---------- os mesmos dados para o comportamento antigo e o novo ----------
const A = { id: "a", data: "2026-11-02", loja: "amazon", subtotal: 110, total_pago: 100, desconto: 10, itens: [{ descricao: "Ração Golden 10kg", qtd: 2, total: 110, desconto: 8, categoria: "Pet" }] };
const B = { id: "b", data: "2026-11-03", loja: "amazon", total_pago: 40, desconto: 5, status: "cancelado", itens: [{ descricao: "Panela", qtd: 1, total: 45, desconto: 0, categoria: "Casa" }] };
const C = { id: "c", data: "2026-11-04", loja: "amazon", total_pago: 60, desconto: 6, fora_das_contas: true, motivo_fora: "nota do Mercado", itens: [] };
const D = { id: "d", data: "2026-11-05", loja: "amazon", canal: "amazon", historico: true, natureza: "fisica", origem: "historico_amazon", status: "concluido", total_pago: 80, desconto: 0, itens: [] };
const E = { id: "e", data: "2026-11-06", loja: "amazon", canal: "amazon", historico: true, natureza: "digital", origem: "historico_amazon", status: "concluido", total_pago: 20, desconto: 1, itens: [{ descricao: "Livro Kindle", qtd: 1, total: 20, desconto: 0, natureza: "digital", total_linha: 20 }] };
const F = { id: "f", data: "2026-11-06", loja: "outra", canal: "presencial", segmento: "supermercado", vendedor: "Mercado X", total_pago: 300, itens: [] };
const G = { id: "g", data: "2026-11-07", loja: "amazon", total_pago: 70, status: "autorizado", itens: [] };
const H = { id: "h", data: "2026-11-08", loja: "amazon", total_pago: 25, status: "desconhecido", itens: [] };
const I = { id: "i", data: "2026-11-08", loja: "outra", vendedor: "Loja X", total_pago: 30, desconto: 3, status: "cancelamento_informado", itens: [] };
const J = { id: "j", data: "2026-10-15", loja: "outra", vendedor: "Loja Y", total_pago: 50, itens: [] };
const M = { id: "m", data: "2026-11-09", loja: "amazon", canal: "amazon", historico: true, natureza: "mista", origem: "historico_amazon", status: "concluido", total_pago: 50, desconto: 0,
  itens: [{ descricao: "Ebook", qtd: 1, total: 15, natureza: "digital", total_linha: 15 }, { descricao: "Capa", qtd: 1, total: 35, natureza: "fisica", total_linha: 35 }] };
const DS = [A, B, C, D, E, F, G, H, I, J, M];
const K = { id: "k", data: "2026-11-09", loja: "amazon", total_pago: null, itens: [] }, L = { id: "l", loja: "amazon", total_pago: 10, itens: [] };

// ---------- o comportamento ANTERIOR, copiado literalmente do código de antes do Lote 5.0 ----------
const antigoDespesas = (cs) => { const out = []; (cs || []).forEach((c) => { let v = +c.total_pago; if (!c || !c.data || !isFinite(v) || c.fora_das_contas || c.status === "cancelado") return;
  const cl = N.coClassificar(c); if (cl.tratamento !== "despesa") { v = cl.valor_despesa; if (!(v > 0)) return; }
  const cats = {}; (c.itens || []).forEach((i) => { const k = i.categoria || "Outros"; cats[k] = (cats[k] || 0) + (+i.total || 0) - (+i.desconto || 0); });
  const ks = Object.keys(cats), cat = ks.length ? ks.sort((a, b) => cats[b] - cats[a])[0] : (c.categoria || "Outros");
  out.push({ d: c.data, v, f: "Compras online", cat: cl.categoria || c.categoria || cat, id: c.id || null }); }); return out; };
const antigoResumo = (cs, hoje) => { const meses = N.pnMeses(hoje, 12), ini = meses[0] + "-01", D0 = antigoDespesas(cs), ano = D0.filter((x) => x.d >= ini);
  const desc = cs.filter((c) => c.data >= ini && !c.fora_das_contas).reduce((s, c) => s + (c.desconto || 0), 0), loja = {};
  cs.forEach((c) => { if (c.fora_das_contas || c.data < ini) return; const k = c.vendedor && c.loja === "outra" ? c.vendedor : (N.CO_LOJAS[c.loja] || c.loja); loja[k] = (loja[k] || 0) + (c.total_pago || 0); });
  const lista = {}; cs.forEach((c) => { const m = c.data.slice(0, 7); lista[m] = (lista[m] || 0) + (c.fora_das_contas ? 0 : c.total_pago); });
  return { doMes: soma(D0.filter((x) => x.d.slice(0, 7) === MES)), nMes: D0.filter((x) => x.d.slice(0, 7) === MES).length, ano: soma(ano), nAno: ano.length, descontos: desc, loja, lista }; };
const antigoHoje = (cs, hoje) => cs.filter((x) => String(x.data).slice(0, 10) >= hoje.slice(0, 7) + "-01" && String(x.data).slice(0, 10) <= hoje && !x.fora_das_contas && x.status !== "cancelado")
  .reduce((s, x) => { const k = N.coClassificar(x); return s + (k.tratamento === "despesa" ? (+x.total_pago || 0) : k.valor_despesa); }, 0);

// ---------- regras financeiras ----------
test("coRegra: cada tipo de pedido, com o valor que conta e o motivo de ficar fora", () => {
  const T = [
    [A, "conta", true, 100], [B, "cancelada", false, 0], [{ ...B, status: "Cancelada" }, "cancelada", false, 0], [C, "fora_das_contas", false, 0],
    [D, "referencia_historica", false, 0], [E, "conta", true, 20], [F, "outro_modulo", false, 0], [G, "pendente", false, 0], [H, "pendente", false, 0],
    [I, "conta", true, 30], [{ ...I, status: "reembolso_informado" }, "conta", true, 30], [J, "conta", true, 50], [M, "conta", true, 15],
    [{ ...E, status: "autorizado" }, "pendente", false, 0], [{ ...D, status: "autorizado" }, "referencia_historica", false, 0],
    [{ ...A, status: "concluido" }, "conta", true, 100], [{ ...A, status: "entregue" }, "conta", true, 100]];
  for (const [c, motivo, conta, valor] of T) { const r = N.coRegra(c); assert.deepEqual([r.motivo, r.conta, r.valor], [motivo, conta, valor], c.id + " " + (c.status || "") + " → " + motivo); }
  assert.equal(N.coRegra(E).tratamento, "despesa_digital"); assert.equal(N.coRegra(M).tratamento, "misto"); assert.equal(N.coRegra(M).referencia, 35);
  assert.equal(N.coRegra(G).pendente, 70, "o valor pendente fica visível, fora das despesas"); assert.equal(N.coRegra(D).referencia, 80);
  assert.equal(N.coValorDespesa(A), 100); assert.equal(N.coValorDespesa(B), 0); assert.equal(N.coValorDespesa(null), 0);
});
test("fora_das_contas, referencia_historica e outro_modulo são mecanismos distintos e nunca se misturam", () => {
  const R = N.coResumo(DS);
  assert.deepEqual([R.fora.fora_das_contas.n, R.fora.fora_das_contas.valor], [1, 60], "só o que o dono marcou");
  assert.deepEqual([R.fora.outro_modulo.n, R.fora.outro_modulo.valor], [1, 300], "só o que pertence a outro módulo");
  assert.deepEqual([R.fora.referencia_historica.n, R.fora.referencia_historica.valor], [2, 115], "físico histórico (80) e a parte física do misto (35)");
  assert.deepEqual([R.fora.cancelada.n, R.fora.cancelada.valor], [1, 40]); assert.deepEqual([R.fora.pendente.n, R.fora.pendente.valor], [2, 95]);
  // precedência do rótulo (o valor é zero em todos): cancelada > fora_das_contas > outro_modulo > histórico
  assert.equal(N.coRegra({ ...B, fora_das_contas: true }).motivo, "cancelada");
  assert.equal(N.coRegra({ ...D, fora_das_contas: true }).motivo, "fora_das_contas", "histórico físico marcado como fora das contas continua sendo fora das contas");
  assert.equal(N.coRegra({ ...F, fora_das_contas: true }).motivo, "fora_das_contas");
  assert.equal(N.coRegra({ ...C, segmento: "combustivel" }).motivo, "fora_das_contas");
  for (const c of [B, C, D, F, G, H]) assert.equal(N.coRegra(c).valor, 0, c.id + ": nenhum deles é despesa comum");
});
test("coResumo: os totais do período saem das mesmas linhas, então todos batem", () => {
  const R = N.coResumo(DS, { hoje: HOJE }), P = R.periodo;
  assert.deepEqual(R.despesas.map((x) => x.id), ["a", "e", "i", "j", "m"]);
  assert.equal(P.doMes.total, 165); assert.equal(P.doMes.n, 4); assert.equal(P.ano.total, 215); assert.equal(P.ano.n, 5); assert.equal(P.ano.ticket, 43);
  const s = (o) => r2(Object.values(o).reduce((a, b) => a + b, 0));
  assert.equal(r2(s(P.porCategoria) + P.ajustesPedidos.total), P.ano.total, "Lote 5.2: categorias (por produto) + ajustes dos pedidos = total"); assert.equal(s(P.porLoja), P.ano.total);
  assert.equal(r2(P.meses.reduce((a, m) => a + P.porMes[m].total, 0)), P.ano.total); assert.equal(P.porMes[MES].total, P.doMes.total);
  assert.deepEqual(P.porLoja, { [N.CO_LOJAS.amazon]: 135, "Loja X": 30, "Loja Y": 50 });
  assert.equal(P.porCategoria["Compras online · Digital"], 35, "digital do histórico (20 + 15 do misto)");
  assert.equal(R.mensal[MES].total, 165); assert.equal(R.mensal[MES].pedidos, 10, "todos os pedidos do mês listados, não só os que contam"); assert.equal(R.mensal[MES].contam, 4);
  assert.equal(R.mensal["2026-10"].total, 50);
});
test("descontos: gerais e individuais separados, economia total sem contar duas vezes", () => {
  const P = N.coResumo(DS, { hoje: HOJE }).periodo.descontos;
  assert.deepEqual(P, { gerais: 6, itens: 8, economia: 14, incertos: 0 }, "A: desconto do pedido 10 já contém os 8 dos itens (geral 2); E 1 e I 3 são gerais; cancelado (5) e fora das contas (6) não contam");
  assert.equal(r2(P.gerais + P.itens), P.economia);
});
test("coDescontos: contemplado, somado, incerto e sem itens, sempre com geral + itens = total", () => {
  const it = (total, desconto) => ({ descricao: "X", qtd: 1, total, desconto });
  const casos = [
    ["NF-e: subtotal bruto, desconto do pedido = soma dos itens", { subtotal: 100, desconto: 10, itens: [it(60, 4), it(40, 6)] }, { geral: 0, itens: 10, total: 10, modo: "contemplado" }],
    ["NF-e com cupom além dos itens", { subtotal: 100, desconto: 15, itens: [it(100, 10)] }, { geral: 5, itens: 10, total: 15, modo: "contemplado" }],
    ["subtotal líquido: o desconto do pedido é outra camada", { subtotal: 90, desconto: 5, itens: [it(100, 10)] }, { geral: 5, itens: 10, total: 15, modo: "somado" }],
    ["sem subtotal: não dá para provar, nunca soma", { desconto: 10, itens: [it(100, 10)] }, { geral: 0, itens: 10, total: 10, modo: "incerto" }],
    ["subtotal que não confere com nenhuma das duas contas", { subtotal: 77, desconto: 12, itens: [it(100, 10)] }, { geral: 2, itens: 10, total: 12, modo: "incerto" }],
    ["bruto, mas o desconto do pedido é menor que o dos itens (dado inconsistente)", { subtotal: 100, desconto: 3, itens: [it(100, 10)] }, { geral: 0, itens: 10, total: 10, modo: "incerto" }],
    ["só desconto do pedido", { subtotal: 100, desconto: 7, itens: [it(100, 0)] }, { geral: 7, itens: 0, total: 7, modo: "sem_itens" }],
    ["só desconto dos itens, subtotal líquido", { subtotal: 90, desconto: 0, itens: [it(100, 10)] }, { geral: 0, itens: 10, total: 10, modo: "somado" }],
    ["nada", {}, { geral: 0, itens: 0, total: 0, modo: "sem_itens" }]];
  for (const [nome, c, esperado] of casos) { const d = N.coDescontos(c); assert.deepEqual(d, esperado, nome); assert.equal(r2(d.geral + d.itens), d.total, nome + ": geral + itens = total"); assert.ok(d.total <= r2((+c.desconto || 0) + d.itens) + 0.001, nome + ": nunca passa da soma"); }
  assert.deepEqual(N.coDescontos(null), { geral: 0, itens: 0, total: 0, modo: "sem_itens" }); assert.equal(N.coDescontos({ desconto: -5, itens: [{ total: 10, desconto: -3 }] }).total, 0, "valor negativo não vira economia");
  // no resumo: contemplado não duplica, incerto é contado à parte, cancelado e fora das contas não entram
  const nfe = { id: "n1", data: "2026-11-01", loja: "amazon", subtotal: 100, desconto: 10, total_pago: 90, itens: [it(100, 10)] }, incerto = { id: "n2", data: "2026-11-02", loja: "amazon", desconto: 10, total_pago: 90, itens: [it(100, 10)] };
  const R = N.coResumo([nfe, incerto, { ...nfe, id: "n3", status: "cancelado" }, { ...nfe, id: "n4", fora_das_contas: true }], { hoje: HOJE }).periodo.descontos;
  assert.deepEqual(R, { gerais: 0, itens: 20, economia: 20, incertos: 1 }, "10 + 10, e não 40");
});
test("cancelamento fica fora de TODOS os indicadores", () => {
  const cs = [A, B], R = N.coResumo(cs, { hoje: HOJE }), P = R.periodo;
  assert.deepEqual([P.doMes.total, P.doMes.n, P.ano.total, P.ano.n, P.ano.ticket], [100, 1, 100, 1, 100]);
  assert.deepEqual(P.porLoja, { [N.CO_LOJAS.amazon]: 100 }); assert.deepEqual(P.porCategoria, { Pet: 102 }, "Lote 5.2: o item vale 102 (110 − 8 do item); o desconto geral de 2 vai para os ajustes"); assert.deepEqual([P.ajustesPedidos.total, P.ajustesPedidos.desconto_geral], [-2, -2]); assert.equal(P.descontos.economia, 10, "o desconto do cancelado (5) não entra"); assert.equal(P.porMes[MES].total, 100);
  assert.equal(R.mensal[MES].total, 100); assert.deepEqual(R.despesas.map((x) => x.id), ["a"]);
  assert.equal(N.hojeFinancas({ compras: { ok: true, v: cs } }, HOJE).atual.compras, 100);
  assert.deepEqual(N.pnDespesas([], [], [], null, [], cs).map((x) => x.id), ["a"]);
  assert.deepEqual(N.coPrecos(cs).map((p) => p.nome), ["Ração Golden 10kg"], "o produto do pedido cancelado nunca foi pago e não entra no histórico de preço");
  assert.equal(N.coRotulo(B).status.chave, "cancelada");
  assert.equal(N.coResumo([B], { hoje: HOJE }).periodo.ano.ticket, null, "sem pedido que conte, sem ticket");
});

// ---------- antes × depois, com os mesmos dados ----------
test("antes × depois: as despesas e o Hoje não mudam; só mudam os indicadores que somavam o que não é despesa", () => {
  const velho = antigoResumo(DS, HOJE), R = N.coResumo(DS, { hoje: HOJE }), P = R.periodo;
  // IGUAL: as despesas (Painel), o mês, os 12 meses, o ticket e o Hoje
  assert.deepEqual(N.coDespesas(DS), antigoDespesas(DS)); assert.deepEqual(R.despesas, antigoDespesas(DS));
  assert.deepEqual([P.doMes.total, P.doMes.n, P.ano.total, P.ano.n], [velho.doMes, velho.nMes, velho.ano, velho.nAno]);
  assert.equal(N.hojeFinancas({ compras: { ok: true, v: DS } }, HOJE).atual.compras, antigoHoje(DS, HOJE)); assert.equal(antigoHoje(DS, HOJE), 165);
  // DIFERENTE, e de propósito: eram somas "cruas" que ignoravam a regra
  assert.equal(velho.lista[MES], 715, "antes: o cabeçalho do mês somava cancelado (40), histórico físico (80), outro módulo (300), pendentes (95) e o parcial do misto");
  assert.equal(R.mensal[MES].total, 165, "agora: só o que conta, igual ao Resumo");
  assert.equal(velho.loja[N.CO_LOJAS.amazon], 385, "antes: 'Por loja' somava o total cru de cada pedido da Amazon (cancelado, pendentes, histórico)");
  assert.equal(P.porLoja[N.CO_LOJAS.amazon], 135);
  assert.equal(velho.loja["Mercado X"], 300, "antes: o pedido de outro módulo aparecia como uma 'loja'"); assert.equal(P.porLoja["Mercado X"], undefined);
  assert.equal(velho.descontos, 19, "antes: 'Descontos' incluía o desconto do cancelado (5)"); assert.equal(P.descontos.economia, 14);
  assert.equal(r2(Object.values(velho.loja).reduce((a, b) => a + b, 0)) > velho.ano, true, "antes: 'Por loja' não fechava com o total de 12 meses");
  assert.equal(r2(Object.values(P.porLoja).reduce((a, b) => a + b, 0)), P.ano.total, "agora fecha");
});
test("antes × depois: pedido sem valor (null) deixa de contar como 'pedido' de R$ 0; o total não muda", () => {
  assert.equal(antigoDespesas([K]).length, 1, "antes: +null = 0 virava uma despesa de zero e inflava 'Pedidos no mês'");
  assert.deepEqual(N.coDespesas([K]), []); assert.equal(N.coRegra(K).motivo, "sem_valor");
  assert.equal(N.coResumo([A, K], { hoje: HOJE }).periodo.doMes.n, 1);
  assert.equal(N.coRegra(L).motivo, "sem_data"); assert.deepEqual(N.coDespesas([L]), []);
});

// ---------- consistência entre Resumo, lista, Painel e Hoje ----------
// o que o banco entrega (itens em compras_online_itens, números às vezes como texto) e os 4 campos novos
const noBanco = (c) => ({ ...Object.fromEntries(Object.entries(c).filter(([k]) => k !== "itens")), total_pago: c.total_pago == null ? null : String(c.total_pago),
  compras_online_itens: (c.itens || []).map((i, n) => ({ ordem: n, descricao: i.descricao, qtd: String(i.qtd), total: String(i.total), desconto: String(i.desconto || 0), categoria: i.categoria || null, natureza: i.natureza || null, total_linha: i.total_linha == null ? null : String(i.total_linha), situacao: i.situacao || null })) });
test("Resumo, lista, Painel e Hoje chegam ao mesmo número com os mesmos dados (linhas como o banco entrega)", () => {
  const DB = DS.map((c) => noBanco(c.id === "f" ? { ...c, segmento: undefined, categoria: "Supermercado" } : c)), rows = DB.map(N.coDeBanco);   // o banco não tem a coluna segmento: o módulo vem de canal + categoria
  const resumo = N.coResumo(rows, { hoje: HOJE }).periodo.doMes.total;
  const lista = N.coResumo(rows).mensal[MES].total;
  const painel = N.pnPorMes(N.pnDespesas([], [], [], null, [], rows), [MES])[MES].total;
  const hoje = N.hojeFinancas({ compras: { ok: true, v: rows } }, HOJE).atual.compras;
  assert.deepEqual([resumo, lista, painel, r2(hoje)], [165, 165, 165, 165]);
  const nome = N.coResumo(rows, { hoje: HOJE }).periodo; assert.equal(nome.ano.total, 215);
});
test("o select antigo escondia canal, natureza, historico e origem: o histórico físico virava despesa; com os campos novos fica de fora", () => {
  const DB = [D, E, M, A].map(noBanco);
  const selectAntigo = (r) => ({ data: r.data, loja: r.loja, total_pago: +r.total_pago, fora_das_contas: r.fora_das_contas, status: r.status, itens: r.compras_online_itens.map((i) => ({ descricao: i.descricao, total: +i.total, desconto: +i.desconto, categoria: i.categoria })) });
  const antes = N.coDespesas(DB.map(selectAntigo)), depois = N.coDespesas(DB.map(N.coDeBanco));
  assert.equal(soma(antes), 250, "antes: físico histórico (80), digital (20), misto inteiro (50) e A (100) viravam despesa comum");
  assert.equal(soma(depois), 135, "depois: A 100 + digital 20 + parte digital do misto 15");
  assert.deepEqual([antes.length, depois.length], [4, 3], "o histórico físico (D) sai; E, M (parte digital) e A ficam");
  assert.deepEqual(N.coRegra(N.coDeBanco(noBanco(D))).motivo, "referencia_historica");
  assert.equal(N.hojeFinancas({ compras: { ok: true, v: DB.map(selectAntigo) } }, HOJE).atual.compras, 250, "o Hoje tinha o mesmo defeito");
  assert.equal(N.hojeFinancas({ compras: { ok: true, v: DB.map(N.coDeBanco) } }, HOJE).atual.compras, 135);
});
test("item cancelado do histórico (coluna situacao do banco) não entra na parte digital", () => {
  const c = { data: "2026-11-02", loja: "amazon", canal: "amazon", historico: true, natureza: "mista", origem: "historico_amazon", status: "concluido", total_pago: 50,
    compras_online_itens: [{ ordem: 0, descricao: "Ebook A", qtd: 1, total: 15, natureza: "digital", total_linha: 15, situacao: "concluido" }, { ordem: 1, descricao: "Ebook B", qtd: 1, total: 10, natureza: "digital", total_linha: 10, situacao: "cancelado" }, { ordem: 2, descricao: "Capa", qtd: 1, total: 25, natureza: "fisica", total_linha: 25, situacao: "concluido" }] };
  const r = N.coRegra(N.coDeBanco(c));
  assert.deepEqual([r.valor, r.referencia], [15, 25], "antes o cancelado (10) seria somado ao digital: o leitor procurava status_norm, e o banco grava situacao");
});

// ---------- dados ausentes, nulos e registros antigos ----------
test("dados ausentes ou nulos nunca quebram nem viram despesa", () => {
  for (const v of [null, undefined, [], [null], [undefined, {}], [{ data: "2026-11-01" }], [{ data: "2026-11-01", total_pago: "abc" }], [{ data: "2026-11-01", total_pago: "" }], [{ total_pago: 5 }]]) {
    const R = N.coResumo(v, { hoje: HOJE }); assert.equal(R.despesas.length, 0); assert.equal(R.periodo.doMes.total, 0); assert.equal(R.periodo.ano.ticket, null); assert.equal(R.total, 0);
    assert.deepEqual(N.coDespesas(v), []);
  }
  assert.equal(N.coResumo(null).periodo, null, "sem 'hoje', sem período"); assert.equal(N.hojeFinancas({ compras: { ok: true, v: [{ data: "2026-11-02", total_pago: null }, null].filter(Boolean) } }, HOJE).atual.compras, 0);
  assert.equal(N.coRegra(null).conta, false); assert.equal(N.coRegra({}).motivo, "sem_data");
  assert.deepEqual(N.coPrecos([null, {}, { data: "2026-01-01", itens: null }, { data: "2026-01-01", itens: [null, {}, { descricao: "X" }] }]), []);
  assert.equal(N.coRotulo({}).status.chave, "confirmada"); assert.equal(N.coRotulo(null).regra.conta, false);
  assert.deepEqual(N.coDeBanco(null), {}); assert.equal(N.coDeBanco({ total_pago: null }).total_pago, null); assert.equal(N.coDeBanco({ total_pago: "12.50", desconto: "" }).desconto, null);
  assert.deepEqual(N.coDeBanco({ compras_online_itens: [{ ordem: 1, descricao: "b" }, { ordem: 0, descricao: "a", desconto: null }] }).itens.map((i) => [i.descricao, i.desconto]), [["a", 0], ["b", 0]]);
});
test("registro antigo (só as colunas da 025) segue idêntico: mesma despesa, mesma categoria, mesmo selo", () => {
  const antigo = [{ id: "x1", data: "2026-10-03", loja: "amazon", total_pago: 95, categoria: "Pet", itens: [{ descricao: "Bravecto", total: 136.42, desconto: 0, categoria: "Pet" }] },
    { id: "x2", data: "2026-10-04", loja: "outra", vendedor: "V", total_pago: 20, fora_das_contas: true, itens: [] }, { id: "x3", data: "2026-10-05", loja: "mercadolivre", total_pago: 30, status: "cancelamento_informado", itens: [] },
    { id: "x4", data: "2026-10-06", loja: "shopee", total_pago: 12, status: "reembolso_informado", categoria: "Casa", itens: [] }];
  assert.deepEqual(N.coDespesas(antigo), antigoDespesas(antigo)); assert.deepEqual(N.coDespesas(antigo).map((x) => [x.id, x.v, x.cat]), [["x1", 95, "Pet"], ["x3", 30, "Outros"], ["x4", 12, "Casa"]]);
  assert.deepEqual(antigo.map((c) => N.coRotulo(c).status.chave), ["confirmada", "confirmada", "cancelamento_informado", "reembolso_informado"]);
  assert.deepEqual(N.coResumo(antigo, { hoje: "2026-10-31" }).periodo.porLoja, { [N.CO_LOJAS.amazon]: 95, [N.CO_LOJAS.mercadolivre]: 30, [N.CO_LOJAS.shopee]: 12 });
});

// ---------- histórico de preços ----------
test("coPrecos: o desconto individual do item entra no preço pago (antes o unitário bruto escondia o desconto)", () => {
  const cs = [{ data: "2026-09-01", loja: "amazon", itens: [{ descricao: "Ração Golden 10kg", qtd: 2, total: 200, desconto: 20, unitario: 100 }] }, { data: "2026-10-01", loja: "amazon", itens: [{ descricao: "Ração Golden 10kg", qtd: 1, total: 95, desconto: 0, unitario: 95 }] }];
  const p = N.coPrecos(cs)[0];
  assert.deepEqual([p.vezes, p.historico.map((x) => x.u), p.ultimo.u, p.menor], [2, [90, 95], 95, 90], "antes: [100, 95], menor 95");
  assert.equal(Math.round(p.variacao * 10) / 10, 5.6, "antes: −5%, ou seja, parecia que o preço tinha caído; com o desconto do item, subiu 5,6%");
  assert.equal(N.coPrecoLiquido({ qtd: 2, total: 100, desconto: 10, unitario: 50 }), 45); assert.equal(N.coPrecoLiquido({ qtd: 2, total: null, unitario: 50, desconto: 10 }), 45, "sem total, o unitário menos o desconto por unidade");
  assert.equal(N.coPrecoLiquido({ qtd: 0, total: 30 }), 30); assert.equal(N.coPrecoLiquido({}), null); assert.equal(N.coPrecoLiquido({ total: "abc" }), null);
  assert.equal(N.coPrecoLiquido({ qtd: 1, total: 10, desconto: 0 }), 10, "sem desconto o preço é o mesmo de antes");
  // o desconto geral do pedido não é rateado entre os itens
  assert.equal(N.coPrecos([{ data: "2026-09-01", desconto: 30, itens: [{ descricao: "Ração Golden 10kg", qtd: 1, total: 100, desconto: 0 }] }])[0].ultimo.u, 100);
  // item cancelado (situacao do banco) e pedido cancelado ficam fora; item de pedido fora das contas e histórico continuam (foi pago)
  const q = N.coPrecos([{ data: "2026-09-01", itens: [{ descricao: "Ração Golden 10kg", qtd: 1, total: 100 }, { descricao: "Ração Golden 10kg", qtd: 1, total: 1, situacao: "cancelado" }] },
    { data: "2026-09-02", status: "cancelado", itens: [{ descricao: "Ração Golden 10kg", qtd: 1, total: 1 }] }, { data: "2026-09-03", fora_das_contas: true, itens: [{ descricao: "Ração Golden 10kg", qtd: 1, total: 98 }] }])[0];
  assert.deepEqual(q.historico.map((x) => x.u), [100, 98]);
});
test("coPrecos: preço por kg/litro só quando o nome traz o tamanho e não é pacote; nada de equivalência inventada", () => {
  const um = (descricao, total, qtd = 1) => N.coPrecos([{ data: "2026-09-01", loja: "amazon", itens: [{ descricao, qtd, total, desconto: 0 }] }])[0];
  assert.deepEqual(um("Ração Golden 10kg", 90).base, { por: "kg", ultimo: 9, menor: 9, variacao: null });
  assert.deepEqual(um("Água mineral 500ml", 2).base, { por: "L", ultimo: 4, menor: 4, variacao: null });
  assert.equal(um("Ração Golden", 90).base, null, "sem tamanho no nome");
  assert.equal(um("Cerveja lata 350ml 12 latas", 40).base, null, "pacote: o tamanho do nome não é o da unidade");
  assert.equal(um("Cerveja lata 350ml x12", 40).base, null); assert.equal(um("Kit 3 shampoos 400ml", 50).base, null); assert.equal(um("Cápsulas 12 unidades 50g", 30).base, null);
  assert.equal(um("Suco 200ml e 1L", 5).base, null, "dois tamanhos no nome: ambíguo");
  const dois = N.coPrecos([{ data: "2026-09-01", itens: [{ descricao: "Ração Golden 10kg", qtd: 1, total: 90 }] }, { data: "2026-10-01", itens: [{ descricao: "Ração Golden 10kg", qtd: 1, total: 95 }] }])[0];
  assert.deepEqual([dois.base.por, dois.base.ultimo, dois.base.menor, Math.round(dois.base.variacao * 10) / 10], ["kg", 9.5, 9, 5.6]);
});

// ---------- selo de status ----------
test("coRotulo: só estados que já existem, mais o tratamento financeiro à parte", () => {
  const T = [[A, "confirmada", []], [{ ...A, status: "concluido" }, "concluida", []], [B, "cancelada", []], [I, "cancelamento_informado", []], [{ ...I, status: "reembolso_informado" }, "reembolso_informado", []],
    [G, "autorizada", []], [H, "desconhecido", []], [C, "confirmada", ["fora_das_contas"]], [D, "concluida", ["referencia_historica"]], [E, "concluida", ["despesa_digital"]], [M, "concluida", ["misto"]], [F, "confirmada", ["outro_modulo"]]];
  for (const [c, st, ex] of T) { const r = N.coRotulo(c); assert.deepEqual([r.status.chave, r.extras.map((x) => x.chave)], [st, ex], c.id + " " + (c.status || "")); assert.ok(r.status.texto && ["ok", "aviso", "off"].includes(r.status.tom)); }
  assert.equal(N.coRotulo(B).regra.conta, false); assert.equal(N.coRotulo(I).regra.conta, true, "cancelamento só informado continua sendo despesa até o dono confirmar");
  assert.equal(N.coRotulo({ ...B, fora_das_contas: true }).status.chave, "cancelada"); assert.deepEqual(N.coRotulo({ ...B, fora_das_contas: true }).extras, [], "cancelada vence na precedência: um selo só");
});

// ---------- os módulos usam a função central ----------
test("Compras, Painel e Hoje usam a função central e leem os campos da 030; nenhuma regra financeira duplicada", () => {
  const cc = ler("js/compras.js"), pn = ler("js/painel.js"), hj = ler("js/hoje.js"), nu = ler("nucleo.js");
  for (const f of [cc, pn, hj]) for (const campo of ["canal", "natureza", "historico", "impostos_info"]) assert.match(f, new RegExp("[,\"]" + campo + "[,\"]"), campo);
  assert.match(cc, /NUCLEO\.coResumo\(CC\.dados,\{hoje:hojeISO\(\)\}\)/); assert.match(cc, /NUCLEO\.coResumo\(vis\)\.mensal/); assert.match(cc, /NUCLEO\.coRotulo\(c\)/); assert.match(cc, /NUCLEO\.coRegra\(c\)/);
  assert.doesNotMatch(cc, /fora_das_contas\?0:/, "o cabeçalho do mês não soma 'cru'"); assert.doesNotMatch(cc, /NUCLEO\.coDespesas\(CC\.dados\)/);
  assert.doesNotMatch(cc, /c\.fora_das_contas\|\|c\.data</, "'Por loja' não filtra por conta própria"); assert.doesNotMatch(cc, /reduce\(function\(s,c\)\{return s\+\(c\.desconto\|\|0\)\}/, "'Descontos' não soma por conta própria");
  assert.match(pn, /NUCLEO\.coResumo\(D\.online\?D\.online\.v:\[\]\)\.despesas/); assert.match(pn, /map\(NUCLEO\.coDeBanco\)/);
  assert.match(hj, /map\(NUCLEO\.coDeBanco\)/); assert.match(hj, /compras_online_itens\(total,desconto,natureza,total_linha,situacao\)/);
  assert.doesNotMatch(nu, /coContaNaSoma/, "o Hoje usa coValorDespesa; a regra antiga duplicada saiu"); assert.match(nu, /online\?coValorDespesa\(x\)/);
  assert.match(nu, /function coDespesas\(compras\)\{return coResumo\(compras\)\.despesas\}/);
});
test("Lote 5.0 é só local: sem SQL novo, sem rede nova e sem tocar em Garmin, Esportes, Segurança nem recorrência/reembolso", () => {
  const cc = ler("js/compras.js");
  assert.doesNotMatch(cc, /\.rpc\((?!nome,args\))|supabase\.co|fetch\(\s*["']http/, "só ccRpc chama SB.rpc(nome,args); nenhuma outra chamada nova (Lote 5.1)");
  assert.deepEqual([...new Set([...cc.matchAll(/ccRpc\("([a-z_]+)"/g)].map((m) => m[1]))].sort(), ["compras_anexar", "compras_gravar_com_foto"], "as únicas RPCs são as de compras_gravar_com_foto e compras_anexar (035)");
  assert.match(cc, /NUCLEO\.coRecorrencias\(CC\.dados\)\.filter\(function\(r\)\{return r\.informada&&r\.informada\.status==="a_confirmar"\}\)/, "recorrência intacta");
  assert.doesNotMatch(cc, /compras_reembolsos|reembolso_confirmar/);
});

// ---------- histórico de preços: quem entra, quem sai, origem e reembolso ----------
const ped = (id, extra, preco = 100) => ({ id, numero: "P-" + id, data: "2026-09-0" + (id.length % 9 + 1), loja: "amazon", total_pago: preco, itens: [{ descricao: "Ração Golden 10kg", qtd: 1, total: preco, desconto: 0, categoria: "Pet" }], ...extra });
test("histórico de preços: entram confirmadas, fora das contas, histórico físico e digital e outro módulo; saem canceladas e pendentes", () => {
  const dig = { canal: "amazon", historico: true, natureza: "digital", origem: "historico_amazon", status: "concluido" };
  const entram = [ped("confirmada", {}), ped("concluida", { status: "concluido" }), ped("fora", { fora_das_contas: true }), ped("histfis", { canal: "amazon", historico: true, natureza: "fisica", origem: "historico_amazon", status: "concluido" }),
    ped("histdig", dig), ped("outro", { canal: "presencial", loja: "outra", categoria: "Supermercado" }), ped("antigo", { status: undefined }), ped("canc_inf", { status: "cancelamento_informado" }), ped("reemb_inf", { status: "reembolso_informado" })];
  const saem = [ped("cancelada", { status: "cancelado" }), ped("autorizada", { status: "autorizado" }), ped("desconhecida", { status: "desconhecido" }), ped("hist_aut", { ...dig, status: "autorizado" }), ped("hist_desc", { canal: "amazon", historico: true, natureza: "fisica", status: "Em análise" })];
  const P = N.coPrecos([...entram, ...saem]);
  assert.equal(P.length, 1); assert.equal(P[0].vezes, entram.length, "só os que entram"); assert.equal(P[0].historico.length, 9);
  for (const c of entram) assert.equal(N.coPedidoNoPreco(c), true, c.id); for (const c of saem) assert.equal(N.coPedidoNoPreco(c), false, c.id);
  // antes × depois com os mesmos dados: cancelado já saía; pendente e histórico antes entravam
  const antes = (cs) => cs.filter((c) => c.status !== "cancelado").length;
  assert.equal(antes([...entram, ...saem]), 13, "antes: só o cancelado era excluído; autorizado e desconhecido entravam");
});
test("histórico de preços: a origem fica em cada ponto e dá para distinguir compra de outro módulo, histórico e fora das contas", () => {
  const cs = [ped("a", {}), ped("b", { canal: "presencial", loja: "outra", categoria: "Supermercado" }, 96), ped("c", { canal: "presencial", loja: "outra", categoria: "Combustível" }, 97),
    ped("d", { fora_das_contas: true }, 98), ped("e", { canal: "amazon", historico: true, natureza: "digital", origem: "historico_amazon", status: "concluido" }, 99)];
  const P = N.coPrecos(cs)[0], por = Object.fromEntries(P.historico.map((x) => [x.u, x.origem]));
  assert.deepEqual([P.origens, P.outros_modulos], [{ compras: 3, mercado: 1, veiculos: 1 }, 2]);
  assert.deepEqual([por[100].modulo, por[96].modulo, por[97].modulo], ["compras", "mercado", "veiculos"]);
  assert.equal(por[98].fora_das_contas, true); assert.equal(por[99].historico, true); assert.equal(por[99].natureza, "digital"); assert.equal(por[96].canal, "presencial");
  assert.equal(N.coPrecos([ped("x", {})])[0].outros_modulos, 0);
  // preço incluído não significa despesa: o de outro módulo continua fora das despesas
  assert.equal(N.coRegra(cs[1]).motivo, "outro_modulo"); assert.deepEqual(N.coDespesas(cs).map((x) => x.id), ["a", "e"], "só a compra normal e o digital contam como despesa");
});
test("histórico de preços: item autorizado ou cancelado sai, mesmo dentro de pedido concluído", () => {
  const c = { id: "z", data: "2026-09-01", loja: "amazon", status: "concluido", total_pago: 60, itens: [{ descricao: "Ração Golden 10kg", qtd: 1, total: 20, situacao: "concluido" }, { descricao: "Ração Golden 10kg", qtd: 1, total: 10, situacao: "autorizado" }, { descricao: "Ração Golden 10kg", qtd: 1, total: 5, situacao: "cancelado" }, { descricao: "Ração Golden 10kg", qtd: 1, total: 25, status_norm: "autorizado" }] };
  assert.deepEqual(N.coPrecos([c])[0].historico.map((x) => x.u), [20]);
  assert.equal(N.coItemNoPreco({ situacao: "Autorizado" }), false); assert.equal(N.coItemNoPreco({ situacao: "concluido" }), true); assert.equal(N.coItemNoPreco({}), true); assert.equal(N.coItemNoPreco(null), false);
});
test("reembolso informado não apaga o preço; reembolso recebido mantém a compra no histórico e o evento vem separado", () => {
  const compra = { id: "c1", numero: "701-1000002-0000002", data: "2026-09-01", loja: "amazon", total_pago: 187, itens: [{ descricao: "Ração Golden 10kg", qtd: 1, total: 187 }] };
  const informado = { ...compra, status: "reembolso_informado" }, RE = { id: "r1", numero: compra.numero, valor: 50, estado: "recebido", recebido_confirmado: true, recebido_em: "2026-11-04" };
  const sem = N.coPrecos([compra])[0], inf = N.coPrecos([informado])[0], rec = N.coPrecos([compra], [RE])[0];
  assert.deepEqual([sem.ultimo.u, inf.ultimo.u, rec.ultimo.u], [187, 187, 187], "o preço da compra nunca muda por causa de reembolso");
  assert.deepEqual([sem.historico[0].reembolso, inf.historico[0].reembolso, rec.historico[0].reembolso], [null, "informado", "recebido"]);
  assert.deepEqual(rec.historico[0].eventos, [{ tipo: "reembolso_recebido", valor: 50, mes: "2026-11", recebido_em: "2026-11-04", reembolso_id: "r1" }], "o evento é separado, com o valor e o mês do recebimento");
  assert.deepEqual(inf.historico[0].eventos, []);
  // só recebido e confirmado vira evento; solicitado, aprovado e estornado não
  for (const x of [{ ...RE, estado: "aprovado" }, { ...RE, estado: "solicitado" }, { ...RE, recebido_confirmado: false }, { ...RE, estornado: true }]) assert.equal(N.coPrecos([compra], [x])[0].historico[0].reembolso, null);
  assert.equal(N.coPrecos([compra], [RE])[0].historico.length, 1, "continua uma compra só");
  assert.equal(N.coDespesas([compra]).length, 1, "a regra de despesa e a lógica de reembolso não mudaram");
});

// ---------- segmento deduzido sem coluna no banco ----------
test("segmento: dado do Supabase (sem coluna segmento) é deduzido de canal presencial + categoria; online nunca é deduzido", () => {
  const base = { id: "s", data: "2026-11-02", loja: "outra", vendedor: "Loja", total_pago: 80 };
  const T = [[{ canal: "presencial", categoria: "Supermercado" }, "mercado", "outro_modulo"], [{ canal: "presencial", categoria: "supermercado" }, "mercado", "outro_modulo"], [{ canal: "presencial", categoria: "MERCADO" }, "mercado", "outro_modulo"],
    [{ canal: "presencial", categoria: "Combustível" }, "veiculos", "outro_modulo"], [{ canal: "presencial", categoria: "Combustivel" }, "veiculos", "outro_modulo"], [{ canal: "presencial", categoria: "Abastecimento" }, "veiculos", "outro_modulo"],
    [{ canal: "presencial", categoria: "Casa" }, "compras", "conta"], [{ canal: "presencial", categoria: null }, "compras", "conta"], [{ canal: "presencial" }, "compras", "conta"],
    [{ canal: null, categoria: "Supermercado" }, "compras", "conta"], [{ canal: "outro_marketplace", categoria: "Supermercado" }, "compras", "conta"], [{ canal: "shopee", loja: "shopee", categoria: "Combustível" }, "compras", "conta"],
    [{ canal: "amazon", loja: "amazon", categoria: "Supermercado" }, "compras", "conta"], [{ categoria: "Supermercado" }, "compras", "conta"],
    [{ segmento: "supermercado" }, "mercado", "outro_modulo"], [{ segmento: "combustivel", canal: "amazon", loja: "amazon" }, "veiculos", "outro_modulo"], [{ segmento: "Supermercado", canal: "amazon", loja: "amazon" }, "mercado", "outro_modulo"],
    [{ segmento: "outro", canal: "presencial", categoria: "Supermercado" }, "compras", "conta"], [{ segmento: "compras", canal: "presencial", categoria: "Combustível" }, "compras", "conta"],
    [{ segmento: "online", canal: "presencial", categoria: "Supermercado" }, "compras", "conta"], [{ segmento: "", canal: "presencial", categoria: "Supermercado" }, "mercado", "outro_modulo"],
    [{ segmento: null, canal: "presencial", categoria: "Combustível" }, "veiculos", "outro_modulo"]];
  for (const [campos, mod, motivo] of T) { const c = { ...base, ...campos }, r = N.coRegra(N.coDeBanco(noBanco(c))); assert.deepEqual([N.coModuloDestino(c), r.motivo], [mod, motivo], JSON.stringify(campos)); assert.equal(r.valor, motivo === "conta" ? 80 : 0); }
  assert.equal(N.coSegmentoDe(null), null); assert.equal(N.coSegmentoDe({}), null);
  // os quatro consumidores concordam com a linha do banco sem segmento
  const rows = [{ ...base, canal: "presencial", categoria: "Supermercado" }, { ...base, id: "t", canal: "presencial", categoria: "Casa" }].map((c) => N.coDeBanco(noBanco(c)));
  assert.equal(N.coResumo(rows, { hoje: HOJE }).periodo.doMes.total, 80); assert.equal(N.coResumo(rows).mensal[MES].total, 80);
  assert.equal(N.pnPorMes(N.pnDespesas([], [], [], null, [], rows), [MES])[MES].total, 80); assert.equal(N.hojeFinancas({ compras: { ok: true, v: rows } }, HOJE).atual.compras, 80);
  assert.equal(N.coResumo(rows).fora.outro_modulo.valor, 80);
});

// ---------- item autorizado dentro de pedido concluído ----------
test("item autorizado em pedido concluído do histórico: o valor do item fica pendente, o resto segue o pedido", () => {
  const ped = (itens, extra) => ({ id: "h", data: "2026-11-02", loja: "amazon", canal: "amazon", historico: true, natureza: "digital", origem: "historico_amazon", status: "concluido", total_pago: 30, itens, ...extra });
  const dg = (total_linha, situacao, natureza = "digital") => ({ descricao: "Ebook", qtd: 1, total: total_linha, total_linha, natureza, situacao });
  const parcial = N.coRegra(ped([dg(20, "concluido"), dg(10, "autorizado")]));
  assert.deepEqual([parcial.conta, parcial.valor, parcial.pendente, parcial.tratamento], [true, 20, 10, "despesa_digital"], "só o item efetivado vira despesa; o autorizado fica pendente");
  assert.match(parcial.avisos.join(" "), /Item autorizado ou desconhecido em pedido concluído/);
  const todos = N.coRegra(ped([dg(20, "autorizado"), dg(10, "autorizado")]));
  assert.deepEqual([todos.conta, todos.motivo, todos.pendente, todos.valor], [false, "pendente", 30, 0], "todos autorizados: o pedido inteiro é pendente");
  const fis = N.coRegra(ped([dg(20, "concluido"), dg(10, "autorizado", "fisica")], { natureza: "mista" }));
  assert.deepEqual([fis.valor, fis.pendente, fis.referencia], [20, 0, 10], "físico autorizado continua só referência (físico histórico nunca é despesa)");
  const canc = N.coRegra(ped([dg(20, "concluido"), dg(10, "cancelado"), dg(5, "autorizado")]));
  assert.deepEqual([canc.valor, canc.pendente], [20, 5], "o cancelado não é pendente nem despesa");
  const antes = N.coRegra(ped([dg(20, "concluido"), dg(10, "concluido")]));
  assert.deepEqual([antes.valor, antes.pendente], [30, 0], "sem item autorizado, nada muda");
  // pelo status_norm do importador e pelo situacao do banco
  assert.equal(N.coRegra(ped([{ ...dg(10, null), status_norm: "autorizado" }, dg(20, "concluido")])).pendente, 10);
  // no resumo: o parcial pendente fica contabilizado à parte e não soma nas despesas; selo próprio
  const R = N.coResumo([ped([dg(20, "concluido"), dg(10, "autorizado")])], { hoje: HOJE });
  assert.equal(R.periodo.doMes.total, 20); assert.deepEqual([R.fora.pendente.n, R.fora.pendente.valor], [1, 10]);
  assert.deepEqual(N.coRotulo(ped([dg(20, "concluido"), dg(10, "autorizado")])).extras.map((x) => x.chave), ["despesa_digital", "parcial_pendente"]);
  // pelo banco (coDeBanco)
  const db = N.coDeBanco(noBanco(ped([dg(20, "concluido"), dg(10, "autorizado")])));
  assert.deepEqual([N.coRegra(db).valor, N.coRegra(db).pendente], [20, 10]);
  // pedido não histórico não olha a situação do item (o total pago do pedido não se divide por item): vale o status do pedido
  assert.equal(N.coRegra({ id: "n", data: "2026-11-02", loja: "amazon", total_pago: 30, itens: [dg(10, "autorizado")] }).valor, 30);
});

// ---------- os módulos usam as mesmas peças ----------
test("revisão do Lote 5.0: Hoje traz a categoria (para deduzir o módulo), Compras mostra a economia sem duplicidade e o histórico de preços mostra a origem", () => {
  const cc = ler("js/compras.js"), hj = ler("js/hoje.js");
  assert.match(hj, /impostos_info,categoria,compras_online_itens\(/); assert.match(cc, /categoria,recorrencia_texto/);
  assert.match(cc, /\["Economia \(12 meses\)",brl\(P\.descontos\.economia\)\]/); assert.match(cc, /Economia sem duplicidade/); assert.doesNotMatch(cc, /descontos\.gerais\)\],\["Ticket/);
  assert.match(cc, /x\.outros_modulos/); assert.match(cc, /o preço continua no histórico/);
  assert.doesNotMatch(cc, /\.rpc\((?!nome,args\))/, "só ccRpc chama a RPC (Lote 5.1)"); assert.doesNotMatch(cc, /compras_reembolsos/);
});

// ---------- situação desconhecida: pedido e item são pendentes ----------
test("pedido com situação desconhecida é pendente: fora das despesas, fora do histórico de preços, e todos os módulos concordam", () => {
  const nao = { id: "u", data: "2026-11-03", loja: "amazon", total_pago: 70, itens: [{ descricao: "Ração Golden 10kg", qtd: 1, total: 70 }] };
  const T = [["status desconhecido (pedido atual)", { ...nao, status: "desconhecido" }], ["status Desconhecido, maiúscula", { ...nao, status: "Desconhecido" }], ["status_norm do importador", { ...nao, status_norm: "desconhecido" }],
    ["histórico sem status", { ...nao, canal: "amazon", historico: true, natureza: "digital" }], ["histórico com status que não se reconhece", { ...nao, canal: "amazon", historico: true, natureza: "digital", status: "Em análise" }]];
  for (const [nome, c] of T) {
    const r = N.coRegra(c);
    assert.deepEqual([r.situacao, r.conta, r.valor, r.motivo, r.pendente], ["pendente", false, 0, "pendente", 70], nome);
    assert.equal(N.coPedidoNoPreco(c), false, nome + ": fora do histórico de preços"); assert.deepEqual(N.coPrecos([c]), [], nome);
    assert.deepEqual(N.coDespesas([c]), [], nome); assert.equal(N.coRotulo(c).status.chave, "desconhecido", nome);
  }
  // físico histórico com situação desconhecida: continua só referência, mas o preço não entra no histórico
  const fis = { ...nao, canal: "amazon", historico: true, natureza: "fisica", status: "desconhecido" };
  assert.equal(N.coRegra(fis).motivo, "referencia_historica"); assert.equal(N.coPedidoNoPreco(fis), false);
  // Resumo, lista, Painel e Hoje: o desconhecido não soma em nenhum, e o valor aparece como pendente
  const rows = [A, { ...nao, status: "desconhecido" }].map((c) => N.coDeBanco(noBanco(c)));
  const R = N.coResumo(rows, { hoje: HOJE });
  assert.deepEqual([R.periodo.doMes.total, N.coResumo(rows).mensal[MES].total, N.pnPorMes(N.pnDespesas([], [], [], null, [], rows), [MES])[MES].total, N.hojeFinancas({ compras: { ok: true, v: rows } }, HOJE).atual.compras], [100, 100, 100, 100]);
  assert.deepEqual([R.fora.pendente.n, R.fora.pendente.valor], [1, 70]); assert.equal(R.mensal[MES].pedidos, 2, "o pedido continua listado, com o selo de pendente");
  // depois de efetivado, entra normalmente (nada fica preso)
  assert.deepEqual([N.coRegra({ ...nao, status: "concluido" }).conta, N.coPedidoNoPreco({ ...nao, status: "concluido" })], [true, true]);
  // registro antigo não muda: só o literal "desconhecido" (e o histórico sem status reconhecido) é pendente; texto legado qualquer continua confirmado
  for (const st of [undefined, null, "", "algum_texto_antigo", "cancelamento_informado", "reembolso_informado"]) assert.equal(N.coSituacao({ ...nao, status: st }), "efetiva", String(st));
});
test("item com situação desconhecida dentro de pedido concluído é pendente: fora das despesas e do histórico de preços (igual ao autorizado)", () => {
  const ped = (itens, extra) => ({ id: "h", data: "2026-11-02", loja: "amazon", canal: "amazon", historico: true, natureza: "digital", origem: "historico_amazon", status: "concluido", total_pago: 30, itens, ...extra });
  const dg = (total_linha, situacao, natureza = "digital") => ({ descricao: "Ebook", qtd: 1, total: total_linha, total_linha, natureza, situacao });
  for (const sit of ["desconhecido", "autorizado", "Desconhecido"]) {
    const r = N.coRegra(ped([dg(20, "concluido"), dg(10, sit)]));
    assert.deepEqual([r.conta, r.valor, r.pendente, r.tratamento], [true, 20, 10, "despesa_digital"], sit);
    assert.match(r.avisos.join(" "), /Item autorizado ou desconhecido em pedido concluído/);
  }
  const mistura = N.coRegra(ped([dg(20, "concluido"), dg(10, "desconhecido"), dg(5, "autorizado")]));
  assert.deepEqual([mistura.valor, mistura.pendente], [20, 15], "autorizado e desconhecido somam no pendente");
  const todos = N.coRegra(ped([dg(20, "desconhecido"), dg(10, "desconhecido")]));
  assert.deepEqual([todos.conta, todos.motivo, todos.pendente, todos.valor], [false, "pendente", 30, 0], "todos desconhecidos: o pedido inteiro é pendente");
  const fis = N.coRegra(ped([dg(20, "concluido"), dg(10, "desconhecido", "fisica")], { natureza: "mista" }));
  assert.deepEqual([fis.valor, fis.pendente, fis.referencia], [20, 0, 10], "físico desconhecido continua só referência");
  assert.deepEqual([N.coRegra(ped([dg(20, "concluido"), dg(10, "cancelado"), dg(5, "desconhecido")])).valor, N.coRegra(ped([dg(20, "concluido"), dg(10, "cancelado"), dg(5, "desconhecido")])).pendente], [20, 5], "cancelado não é pendente");
  assert.deepEqual([N.coRegra(ped([dg(20, "concluido"), dg(10, null)])).valor, N.coRegra(ped([dg(20, "concluido"), dg(10, null)])).pendente], [30, 0], "item sem situação não é desconhecido: nada muda");
  assert.equal(N.coRegra(ped([{ ...dg(10, null), status_norm: "desconhecido" }, dg(20, "concluido")])).pendente, 10, "status_norm do importador");
  const db = N.coDeBanco(noBanco(ped([dg(20, "concluido"), dg(10, "desconhecido")])));
  assert.deepEqual([N.coRegra(db).valor, N.coRegra(db).pendente], [20, 10], "linha do banco (situacao)");
  const R = N.coResumo([ped([dg(20, "concluido"), dg(10, "desconhecido")])], { hoje: HOJE });
  assert.equal(R.periodo.doMes.total, 20); assert.deepEqual([R.fora.pendente.n, R.fora.pendente.valor], [1, 10]); assert.ok(N.coRotulo(ped([dg(20, "concluido"), dg(10, "desconhecido")])).extras.some((x) => x.chave === "parcial_pendente"));
  // histórico de preços: o item sai (autorizado ou desconhecido), o resto do pedido concluído fica; vale também para pedido que não é histórico
  const preco = { id: "z", data: "2026-09-01", loja: "amazon", status: "concluido", total_pago: 60, itens: [{ descricao: "Ração Golden 10kg", qtd: 1, total: 20, situacao: "concluido" }, { descricao: "Ração Golden 10kg", qtd: 1, total: 10, situacao: "desconhecido" },
    { descricao: "Ração Golden 10kg", qtd: 1, total: 15, situacao: "autorizado" }, { descricao: "Ração Golden 10kg", qtd: 1, total: 5, situacao: "cancelado" }, { descricao: "Ração Golden 10kg", qtd: 1, total: 25, status_norm: "desconhecido" }, { descricao: "Ração Golden 10kg", qtd: 1, total: 30 }] };
  assert.deepEqual(N.coPrecos([preco])[0].historico.map((x) => x.u), [20, 30], "só o efetivado e o sem situação");
  assert.deepEqual(N.coPrecos([{ ...preco, historico: false, canal: undefined }])[0].historico.map((x) => x.u), [20, 30]);
  assert.equal(N.coItemNoPreco({ situacao: "desconhecido" }), false); assert.equal(N.coItemNoPreco({ status_norm: "Desconhecido" }), false); assert.equal(N.coItemNoPreco({ situacao: "concluido" }), true);
  // pedido que não é histórico: o total pago não se divide por item, então a despesa segue o status do pedido
  assert.equal(N.coRegra({ id: "n", data: "2026-11-02", loja: "amazon", total_pago: 30, itens: [dg(10, "desconhecido")] }).valor, 30);
});
test("classificação explícita de módulo prevalece sobre a dedução por canal e categoria; sem ela, a dedução continua valendo", () => {
  const presencial = { id: "p", data: "2026-11-02", loja: "outra", canal: "presencial", vendedor: "Loja", total_pago: 80 };
  const val = (c) => N.coRegra(N.coDeBanco(noBanco(c)));
  assert.equal(N.coModuloDestino({ ...presencial, categoria: "Supermercado" }), "mercado", "sem classificação explícita: deduz");
  assert.equal(N.coModuloDestino({ ...presencial, categoria: "Supermercado", segmento: "compras" }), "compras", "explícito 'compras' mantém em Compras mesmo com categoria de supermercado");
  assert.equal(N.coModuloDestino({ ...presencial, categoria: "Supermercado", segmento: "combustivel" }), "veiculos", "explícito manda mesmo contra a categoria");
  assert.equal(N.coModuloDestino({ ...presencial, loja: "amazon", canal: "amazon", segmento: "supermercado" }), "mercado", "explícito vale até para canal online");
  assert.equal(val({ ...presencial, categoria: "Supermercado", segmento: "compras" }).valor, 80); assert.equal(val({ ...presencial, categoria: "Supermercado" }).valor, 0);
  const rows = [{ ...presencial, categoria: "Supermercado", segmento: "compras" }].map((c) => N.coDeBanco(noBanco(c)));
  assert.deepEqual([N.coResumo(rows, { hoje: HOJE }).periodo.doMes.total, N.pnPorMes(N.pnDespesas([], [], [], null, [], rows), [MES])[MES].total, N.hojeFinancas({ compras: { ok: true, v: rows } }, HOJE).atual.compras], [80, 80, 80]);
  assert.equal(N.coSegmentoDe({ segmento: "Combustivel" }), "combustivel"); assert.equal(N.coSegmentoDe({ segmento: "xyz", canal: "presencial", categoria: "Mercado" }), null);
});

// ---------- regressão: coMultipack com "c/ 12 rolos" ----------
test("coMultipack: 'c/ 12' (com barra e espaço) indica pacote; a regex antiga deixava passar e o preço por litro ficava errado", () => {
  const antiga = (nome) => /\d\s*x\s*\d|\bx\s*\d|\b(?:kit|pack|combo|caixa com|cx|c\/)\b|\b\d+\s*(?:un|und|unid|unidades?|latas?|garrafas?|pacotes?|pcs?|pecas?|potes?|saches?|capsulas?|tabletes?|comprimidos?|doses?)\b/.test(" " + nome.toLowerCase() + " ");
  const pacote = ["Papel higiênico c/ 12 rolos", "Papel higiênico c/12 rolos", "Detergente 500ml c/ 12", "Detergente 500ml C/ 12", "Detergente 500ml c / 12", "Sabonete c/ 6"];
  for (const n of pacote) assert.equal(N.coMultipack(n), true, n);
  assert.equal(antiga("Detergente 500ml c/ 12"), false, "o defeito: a regex antiga não via 'c/ 12', porque a barra não é caractere de palavra e o \\b depois dela falha");
  // o que já era coberto continua funcionando
  for (const n of ["Kit 3 shampoos 400ml", "Pack 6 Água 500ml", "Combo ração 10kg", "Cerveja cx 12", "Caixa com 12 sucos 200ml", "Cerveja lata 350ml x12", "Suco 200ml x 2", "Cerveja lata 350ml 12 latas", "Fralda M 3 pacotes", "Cápsulas 12 unidades 50g", "Pilha 4 un", "Café 2x500g"]) assert.equal(N.coMultipack(n), true, n);
  // sem número depois do "c/" não é pacote, e "c/" no meio de outra palavra não conta
  for (const n of ["Bicarbonato c/ tampa 500g", "Panela c/ cabo 3L", "Ração Golden 10kg", "Leite 1L", "Água mineral 500ml", "Abc/1 produto", "Arroz 5kg", "Lenço umedecido"]) assert.equal(N.coMultipack(n), false, n);
  assert.equal(N.coMultipack(""), false); assert.equal(N.coMultipack(null), false);
  // efeito no preço por litro: pacote não tem base (o tamanho do nome não é o da unidade); sem o "c/ 12" tem
  const um = (descricao, total) => N.coPrecos([{ data: "2026-09-01", loja: "amazon", itens: [{ descricao, qtd: 1, total, desconto: 0 }] }])[0];
  assert.equal(um("Detergente 500ml c/ 12", 24).base, null, "antes: R$ 48,00/L (preço do pacote dividido por 500 ml)");
  assert.deepEqual(um("Detergente 500ml", 2).base, { por: "L", ultimo: 4, menor: 4, variacao: null });
});
