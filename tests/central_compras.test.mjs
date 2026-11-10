// Central de Compras: visão unificada (notas do Mercado + compras online). Núcleo puro `NUCLEO.cu*`: canal, estabelecimento e categoria independentes,
// filtros combinados, conciliação financeira contra as fontes originais e prevenção de duplicidade. Dados FICTÍCIOS; sem rede, sem banco, sem IA.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const r2 = (x) => Math.round(x * 100) / 100;
const HOJE = "2026-11-10";

/* linhas da view "compras" (um item por linha), como o Mercado as carrega */
let seq = 0;
const L = (nota, data, mercado, numero, produto, categoria, total, extra = {}) => ({ id: "i" + ++seq, data, mk: data.slice(0, 7), mercado, numero, forma_pagamento: "Crédito", categoria, subcategoria: null, descricao: produto.toUpperCase(), produto,
  produto_id: "p" + seq, quantidade: 1, unidade: "un", valor_unitario: total, valor_total: total, desconto: 0, nota: data + "|" + mercado + "|" + numero, ...extra });
const MERC = [
  L("t1", "2026-11-03", "Tauste (Sorocaba)", "100", "Arroz 5kg", "Mercearia", 30), L("t1", "2026-11-03", "Tauste (Sorocaba)", "100", "Leite", "Mercearia", 10), L("t1", "2026-11-03", "Tauste (Sorocaba)", "100", "Sabão", "Limpeza", 12),
  L("c1", "2026-11-07", "Confiança (Sorocaba)", "200", "Pão", "Padaria", 8.5),
  L("w1", "2026-11-08", "WILLIAM DA COSTA FREITAS LTDA", "300", "Cortina solar automotiva", "Automotivo", 19.9, { subcategoria: "Proteção" }),
  L("t0", "2026-10-04", "Tauste (Sorocaba)", "90", "Arroz 5kg", "Mercearia", 28),
];
const somaLinhas = (l) => r2(l.reduce((s, x) => s + x.valor_total, 0));

/* pedidos online (formato do núcleo, depois de coDeBanco) */
const AMZ_PET = { id: "o1", data: "2026-11-02", loja: "amazon", numero: "111-0000001-0000001", subtotal: 110, desconto: 10, frete: 0, taxas: 0, total_pago: 100, numero_nf: null,
  itens: [{ descricao: "Ração Golden 10kg", qtd: 2, total: 110, desconto: 8, categoria: "Pet" }] };
const AMZ_FRETE = { id: "o2", data: "2026-11-04", loja: "amazon", numero: "111-0000002-0000002", subtotal: 50, desconto: 0, frete: 12.5, taxas: 0, total_pago: 62.5,
  itens: [{ descricao: "Antipulgas", qtd: 1, total: 50, desconto: 0, categoria: "Pet" }] };
const CANCELADO = { id: "o3", data: "2026-11-05", loja: "amazon", numero: "X3", total_pago: 40, status: "cancelado", itens: [{ descricao: "Panela", qtd: 1, total: 40, categoria: "Casa" }] };
const FORA = { id: "o4", data: "2026-11-06", loja: "amazon", numero: "X4", total_pago: 60, fora_das_contas: true, motivo_fora: "já contada no Mercado", itens: [{ descricao: "Pilha", qtd: 1, total: 60, categoria: "Casa" }] };
const SUPER = { id: "o5", data: "2026-11-06", loja: "outra", canal: "presencial", segmento: "supermercado", vendedor: "Mercado X", total_pago: 300, itens: [] };
const VEIC = { id: "o6", data: "2026-11-09", loja: "mercadolivre", numero: "ML-1", total_pago: 80, itens: [{ descricao: "Tapete automotivo", qtd: 1, total: 80, categoria: "Veículos" }] };
const ONLINE = [AMZ_PET, AMZ_FRETE, CANCELADO, FORA, SUPER, VEIC];

const CANAIS = { "2026-11-08|WILLIAM DA COSTA FREITAS LTDA|300": { canal: "online", plataforma: "Mercado Livre" } };
const montar = (linhas = MERC, canais = CANAIS, online = ONLINE) => N.cuUnificar(N.cuDeNotas(linhas, canais), N.cuDeOnline(online));
const U = montar();
const por = (id) => U.compras.find((c) => c.id === id);

test("canal, estabelecimento e categoria são independentes; o emissor fiscal da nota é preservado (cortina do Mercado Livre)", () => {
  const c = por("nota:2026-11-08|WILLIAM DA COSTA FREITAS LTDA|300");
  assert.equal(c.emissor, "WILLIAM DA COSTA FREITAS LTDA", "o emissor fiscal nunca é trocado pelo marketplace");
  assert.equal(c.estabelecimento, "Mercado Livre"); assert.equal(c.plataforma, "Mercado Livre"); assert.equal(c.canal, "online"); assert.equal(c.canal_informado, true);
  assert.deepEqual(Object.keys(c.categorias), ["Automotivo"]); assert.equal(c.itens[0].sub, "Proteção"); assert.equal(c.valor, 19.9);
  /* sem a informação do dono, a nota fica como está: estabelecimento = emissor, canal presencial (padrão), sem inventar plataforma */
  const sem = montar(MERC, {}).compras.find((x) => x.id === c.id);
  assert.deepEqual([sem.canal, sem.estabelecimento, sem.plataforma, sem.canal_informado], ["presencial", "WILLIAM DA COSTA FREITAS LTDA", null, false]);
  /* a categoria não vem do estabelecimento: Tauste tem Mercearia e Limpeza; o Mercado Livre tem Automotivo (e a Amazon, Pet) */
  assert.deepEqual(Object.keys(por("nota:2026-11-03|Tauste (Sorocaba)|100").categorias).sort(), ["Limpeza", "Mercearia"]);
  assert.equal(por("online:o1").estabelecimento, "Amazon"); assert.deepEqual(Object.keys(por("online:o1").categorias), ["Pet"]);
  assert.equal(por("nota:2026-11-07|Confiança (Sorocaba)|200").estabelecimento, "Confiança", "a cidade sai só do rótulo");
});

test("rótulos de categoria equivalentes entre as duas fontes (só na leitura)", () => {
  assert.equal(N.cuCat("Veículos"), "Automotivo"); assert.equal(N.cuCat("Eletrônicos"), "Tecnologia"); assert.equal(N.cuCat("Bebê"), "Bebê/Infantil");
  assert.equal(N.cuCat("Pet"), "Pet"); assert.equal(N.cuCat(""), "Sem categoria"); assert.equal(N.cuCat("limpeza/descartáveis"), "Limpeza");
  assert.deepEqual(Object.keys(por("online:o6").categorias), ["Automotivo"], "o pedido de Veículos soma com o Automotivo do Mercado");
});

test("conciliação: o total unificado = total do Mercado + o que a regra online (coResumo) manda contar, sem duplicidade", () => {
  const rs = N.coResumo(ONLINE);
  assert.equal(U.totais.notas, somaLinhas(MERC), "as notas batem com a soma de valor_total do Mercado");
  assert.equal(U.totais.online, rs.total, "o online bate com coResumo (a regra financeira única)");
  assert.equal(U.totais.total, r2(somaLinhas(MERC) + rs.total));
  assert.equal(rs.total, r2(100 + 62.5 + 80), "cancelado, fora das contas e supermercado presencial ficam de fora");
  /* o que ficou de fora é contado com o motivo e o valor, para a conta fechar */
  assert.deepEqual([U.fora.cancelada, U.fora.fora_das_contas, U.fora.outro_modulo].map((x) => [x.n, x.valor]), [[1, 40], [1, 60], [1, 300]]);
  const bruto = r2(ONLINE.reduce((s, c) => s + c.total_pago, 0));
  assert.equal(r2(U.totais.online + U.fora.cancelada.valor + U.fora.fora_das_contas.valor + U.fora.outro_modulo.valor), bruto, "contam + fora = todos os pedidos");
  /* a soma das compras listadas é o total */
  assert.equal(r2(U.compras.reduce((s, c) => s + c.valor, 0)), U.totais.total);
});

test("valores, descontos e fretes originais preservados; ajustes do pedido não viram produto nem são rateados", () => {
  const a = por("online:o1"), b = por("online:o2");
  assert.equal(a.valor, 100, "valor pago do pedido (subtotal 110 − desconto 10)"); assert.equal(b.valor, 62.5);
  assert.equal(b.categorias.Pet, 50, "o frete não entra na categoria do produto"); assert.equal(b.aj.frete, 12.5); assert.equal(b.ajustes, 12.5);
  assert.equal(a.categorias.Pet, 102, "o item vale o total menos o desconto do item (110 − 8)"); assert.equal(a.ajustes, -2, "o resto do desconto fica como ajuste do pedido");
  for (const c of U.compras) assert.equal(r2(Object.values(c.categorias).reduce((s, v) => s + v, 0) + c.ajustes), c.valor, "Σ categorias + ajustes = valor pago: " + c.id);
  assert.equal(por("nota:2026-11-03|Tauste (Sorocaba)|100").ajustes, 0);
  /* nenhum item novo foi criado para o frete ou o desconto */
  assert.deepEqual(b.itens.map((i) => i.nome), ["Antipulgas"]); assert.deepEqual(a.itens.map((i) => i.nome), ["Ração Golden 10kg"]);
});

test("filtros individuais e combinados atualizam o resumo (Novembro + Online + Pet etc.)", () => {
  const nov = N.cuPeriodo("2026-11", HOJE);
  const R = (f) => N.cuResumo(N.cuFiltrar(U.compras, { ...nov, ...f }));
  const todos = R({});
  assert.equal(todos.total, r2(somaLinhas(MERC.filter((x) => x.mk === "2026-11")) + 100 + 62.5 + 80));
  assert.equal(todos.porCanal.presencial.total + todos.porCanal.online.total, todos.total, "presencial + online = total");
  /* presenciais: as notas que não foram marcadas como online */
  assert.deepEqual([R({ canal: "presencial" }).compras, R({ canal: "presencial" }).total], [2, r2(30 + 10 + 12 + 8.5)]);
  assert.deepEqual([R({ canal: "online" }).compras, R({ canal: "online" }).total], [4, r2(19.9 + 100 + 62.5 + 80)]);
  /* Novembro + Online + Pet: só os itens de Pet; o frete (ajuste) não é rateado */
  const pet = R({ canal: "online", categoria: "Pet" });
  assert.deepEqual([pet.compras, pet.itens, pet.total], [2, 2, r2(102 + 50)], "só os itens Pet, sem frete nem desconto geral");
  assert.equal(r2(pet.total + pet.ajustes), pet.total, "com categoria escolhida os ajustes não entram (ficam fora, sem rateio)");
  /* Novembro + Presencial + Alimentação (grupo): Mercearia + Padaria */
  const ali = R({ canal: "presencial", categoria: "Alimentação" });
  assert.deepEqual([ali.compras, ali.total], [2, r2(30 + 10 + 8.5)]);
  /* Novembro + Automotivo junta a cortina (Mercado) e o tapete (Mercado Livre online) */
  const auto = R({ categoria: "Automotivo" }); assert.equal(auto.total, r2(19.9 + 80)); assert.deepEqual(auto.porEstab.map((e) => e.nome).sort(), ["Mercado Livre"]);
  /* 12 meses + Mercado Livre: a cortina e o tapete; a estabelecimento Mercado Livre é a plataforma */
  const ml = N.cuResumo(N.cuFiltrar(U.compras, { ...N.cuPeriodo("12m", HOJE), estab: "Mercado Livre" })); assert.deepEqual([ml.compras, ml.total], [2, r2(19.9 + 80)]);
  /* estabelecimento + canal */
  assert.equal(R({ estab: "Tauste", canal: "presencial" }).total, 52); assert.equal(R({ estab: "Tauste", canal: "online" }).total, 0);
  /* outubro não entra em novembro e entra em "tudo" */
  assert.equal(N.cuResumo(N.cuFiltrar(U.compras, N.cuPeriodo("tudo", HOJE))).total, U.totais.total);
});

test("totais por categoria e por estabelecimento fecham com o total (Σ categorias + ajustes = total)", () => {
  const nov = N.cuFiltrar(U.compras, N.cuPeriodo("2026-11", HOJE)), R = N.cuResumo(nov);
  assert.equal(r2(R.porCategoria.reduce((s, c) => s + c.total, 0) + R.ajustes), R.total);
  assert.equal(r2(R.porEstab.reduce((s, e) => s + e.total, 0)), R.total);
  assert.equal(R.itens, nov.reduce((s, c) => s + c.n_itens, 0));
  const pet = R.porCategoria.find((c) => c.cat === "Pet"); assert.deepEqual([pet.total, pet.compras, pet.itens], [152, 2, 2]);
  assert.equal(R.media, r2(R.total / R.compras));
  /* abrir os itens de uma loja e de uma categoria */
  assert.deepEqual(N.cuItens(N.cuFiltrar(nov, { estab: "Amazon" })).map((i) => i.nome), ["Ração Golden 10kg", "Antipulgas"]);
  assert.deepEqual(N.cuItens(nov, { categoria: "Automotivo" }).map((i) => [i.nome, i.estabelecimento]), [["Tapete automotivo", "Mercado Livre"], ["Cortina solar automotiva", "Mercado Livre"]]);
});

test("histórico por categoria e preços/quantidades dos itens continuam acessíveis (nome, quantidade e valor por item)", () => {
  const it = N.cuItens(U.compras, { categoria: "Pet" });
  assert.deepEqual(it.map((i) => [i.nome, i.qtd, i.valor]), [["Ração Golden 10kg", 2, 102], ["Antipulgas", 1, 50]]);
  assert.deepEqual(N.cuCategorias(U.compras).filter((c) => ["Alimentação", "Pet", "Automotivo"].includes(c)).sort(), ["Alimentação", "Automotivo", "Pet"]);
});

test("comparação com o mesmo período do mês anterior respeita os filtros", () => {
  const c = N.cuComparar(U.compras, { canal: "presencial" }, "2026-11", HOJE);
  assert.equal(c.atual.total, 60.5); assert.equal(c.anterior.total, 28); assert.equal(c.dif, 32.5); assert.equal(r2(c.pct * 100), 116.07);
  const sem = N.cuComparar(U.compras, { canal: "online" }, "2026-11", HOJE); assert.equal(sem.anterior.total, 0); assert.equal(sem.pct, null, "sem base, sem percentual inventado");
});

test("duplicidade: nota + pedido da mesma transação não somam duas vezes; coincidência só de data e valor é sinalizada, não removida", () => {
  const nf = [L("n", "2026-11-09", "Loja Pet X", "000777", "Ração", "Pet", 100)];
  const pedF = { id: "d1", data: "2026-11-09", loja: "amazon", numero: "111-9", total_pago: 100, numero_nf: "777", itens: [{ descricao: "Ração", qtd: 1, total: 100, categoria: "Pet" }] };
  const f = montar(nf, {}, [pedF]);
  assert.equal(f.totais.total, 100, "mesma data, mesmo valor e mesmo número de NF: conta uma vez só");
  assert.deepEqual(f.duplicidades.map((d) => d.nivel), ["forte"]); assert.equal(f.fora.coberta_por_nota.valor, 100); assert.equal(f.compras.length, 1); assert.equal(f.compras[0].fonte, "nota");
  const pedP = { ...pedF, id: "d2", numero_nf: null };
  const p = montar(nf, {}, [pedP]);
  assert.equal(p.totais.total, 200, "só data e valor iguais não prova nada: continua contando e avisa");
  assert.deepEqual(p.duplicidades.map((d) => d.nivel), ["provavel"]); assert.equal(p.compras.find((c) => c.fonte === "online").possivel_duplicata, "nota:" + nf[0].nota);
  assert.equal(N.cuResumo(N.cuFiltrar(p.compras, {})).possiveisDuplicatas, 1);
  /* valores diferentes (frete, por exemplo) não se casam */
  assert.deepEqual(montar(nf, {}, [{ ...pedF, id: "d3", total_pago: 112.5, numero_nf: null }]).duplicidades, []);
  /* o que o dono já marcou como "contada em outro lugar" nem entra */
  assert.equal(montar(nf, {}, [{ ...pedF, id: "d4", fora_das_contas: true }]).totais.total, 100);
});

test("as fontes originais não são alteradas pela consolidação", () => {
  const antes = JSON.stringify([MERC, ONLINE, CANAIS]);
  montar(); N.cuResumo(N.cuFiltrar(U.compras, { categoria: "Pet", canal: "online" })); N.cuComparar(U.compras, {}, "2026-11", HOJE);
  assert.equal(JSON.stringify([MERC, ONLINE, CANAIS]), antes);
});

test("canal informado pelo dono: validação, plataforma opcional e remoção volta ao padrão presencial", () => {
  let r = N.cuCanalDefinir({}, "k", "online", " Mercado Livre "); assert.deepEqual(r, { ok: true, mapa: { k: { canal: "online", plataforma: "Mercado Livre" } } });
  assert.deepEqual(N.cuCanalDefinir({}, "k", "online", "").mapa.k, { canal: "online", plataforma: null }, "online sem plataforma informada: nada é inventado");
  assert.deepEqual(N.cuCanalDefinir(r.mapa, "k", "presencial", "").mapa, {}, "voltar a presencial remove a anotação");
  assert.equal(N.cuCanalDefinir({}, "k", "talvez", "").ok, false); assert.equal(N.cuCanalDefinir({}, "k", "online", "<b>x</b>").ok, false); assert.equal(N.cuCanalDefinir({}, "k", "online", "x".repeat(41)).ok, false);
  assert.deepEqual(N.cuCanaisValidos({ notas: { a: { canal: "online", plataforma: "Amazon" }, b: { canal: "xx" }, c: null, d: { canal: "presencial", plataforma: "Z" } } }), { a: { canal: "online", plataforma: "Amazon" }, d: { canal: "presencial", plataforma: null } });
  assert.deepEqual(N.cuCanaisValidos(null), {});
});

test("pedido online presencial (não supermercado) e histórico Amazon seguem as regras existentes", () => {
  const loja = { id: "p1", data: "2026-11-05", loja: "outra", canal: "presencial", vendedor: "Loja do Bairro", total_pago: 45, itens: [{ descricao: "Vaso", qtd: 1, total: 45, categoria: "Casa" }] };
  const hist = { id: "h1", data: "2026-11-05", loja: "amazon", canal: "amazon", historico: true, natureza: "fisica", origem: "historico_amazon", status: "concluido", total_pago: 80, itens: [] };
  const u = montar([], {}, [loja, hist]);
  assert.equal(u.compras.length, 1); assert.equal(u.compras[0].canal, "presencial"); assert.equal(u.compras[0].estabelecimento, "Loja do Bairro"); assert.deepEqual(Object.keys(u.compras[0].categorias), ["Casa/Utilidades"]);
  assert.deepEqual(u.fora.referencia_historica, { n: 1, valor: 80 }, "o histórico físico da Amazon sai pela regra existente (coRegra: só referência)");
  assert.equal(N.coRegra(hist).conta, false);
});
