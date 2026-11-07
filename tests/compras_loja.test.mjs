// Lote 5.2 · etapa 1 (núcleo, corrigida): detalhe por loja e por categoria do Resumo de Compras (categoria POR PRODUTO; ajustes dos pedidos à parte) e campos novos de coPrecos.
// Garantias: (1) produtos + ajustes fecham, ao centavo, com a barra do Resumo; (2) o Resumo e as despesas continuam idênticos aos do Lote 5.0
// (o "esperado" de tests/compras_loja.golden.json foi gerado com o nucleo.js do commit d019d16, antes desta etapa); (3) coPrecos só ganhou campos.
// Só regras puras e leitura de arquivos do site: sem rede, sem banco, sem custo. Todos os pedidos e valores são FICTÍCIOS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const G = JSON.parse(readFileSync(new URL("./compras_loja.golden.json", import.meta.url), "utf8"));
const { compras, reembolsos, hoje } = G, CTX = { hoje };
const ler = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const cent = (x) => Math.round(x * 100);
const clone = (x) => JSON.parse(JSON.stringify(x));
const NOVOS = ["qtd", "total", "compra_id", "numero", "loja_chave"];

// ---------- 1. nada do Lote 5.0 mudou ----------
// única mudança permitida no Resumo: porCategoria passa a ser por produto e nasce ajustesPedidos. Todo o resto é idêntico ao Lote 5.0.
const sem = (r) => { const x = clone(r); if (x.periodo) { delete x.periodo.porCategoria; delete x.periodo.ajustesPedidos; } return x; };
test("coResumo (com e sem período) e coDespesas são idênticos aos do Lote 5.0, exceto porCategoria (agora por produto)", () => {
  assert.deepEqual(sem(N.coResumo(compras, CTX)), sem(G.esperado.resumo));
  assert.deepEqual(clone(N.coResumo(compras)), G.esperado.resumo_sem_periodo);
  assert.deepEqual(clone(N.coDespesas(compras)), G.esperado.resumo_sem_periodo.despesas);
  assert.equal(N.coResumo(compras, CTX).total, G.esperado.resumo.total, "o total das despesas não mudou");
});
test("porCategoria mudou de distribuição, não de total: Σ categorias (por produto) + ajustes = o mesmo total de antes", () => {
  const R = N.coResumo(compras, CTX), P = R.periodo, antigo = G.esperado.resumo.periodo;
  const soma = (o) => Object.values(o).reduce((s, v) => s + cent(v), 0);
  assert.equal(soma(antigo.porCategoria), cent(antigo.ano.total), "antes: as categorias (por pedido) somavam o total");
  assert.equal(soma(P.porCategoria) + cent(P.ajustesPedidos.total), cent(P.ano.total), "agora: categorias por produto + ajustes dos pedidos");
  assert.equal(cent(P.ano.total), cent(antigo.ano.total), "o total do período não mudou");
  assert.notDeepEqual(P.porCategoria, antigo.porCategoria, "e a distribuição realmente mudou");
});
test("coPrecos: tudo o que já existia continua igual; só entram campos novos", () => {
  for (const [atual, antigo] of [[N.coPrecos(compras, reembolsos), G.esperado.precos], [N.coPrecos(compras), G.esperado.precos_sem_reemb]]) {
    assert.equal(atual.length, antigo.length, "mesmos produtos, na mesma ordem");
    const limpo = clone(atual).map((p) => { delete p.gasto; delete p.qtd; delete p.media; p.historico.forEach((h) => NOVOS.forEach((k) => delete h[k])); p.ultimo && NOVOS.forEach((k) => delete p.ultimo[k]); return p; });
    assert.deepEqual(limpo, antigo);
  }
});
test("coPrecos: campos novos por compra (qtd, total líquido, pedido, número, loja) e por produto (gasto, qtd, média)", () => {
  const rac = N.coPrecos(compras).find((p) => /ra[cç][aã]o golden/i.test(p.nome));
  assert.equal(rac.historico.length, 3, "a compra de 2025 (fora dos 12 meses) continua no histórico de preços, como antes");
  const a1 = rac.historico.find((h) => h.compra_id === "a1");
  assert.deepEqual([a1.qtd, a1.total, a1.numero, a1.loja_chave, a1.u], [2, 100, "701-1", "Amazon", 50], "total líquido do item = total − desconto; u = total ÷ qtd");
  assert.deepEqual([rac.gasto, rac.qtd, rac.media], [700, 4, 175], "gasto e quantidade somam todas as compras do histórico de preços");
  assert.equal(rac.ultimo.compra_id, "a1");
  const cabo = N.coPrecos(compras).find((p) => /cabo usb/i.test(p.nome));
  assert.deepEqual(cabo.historico.map((h) => h.loja_chave).sort(), ["Loja do Zé", "Mercado Livre", "Shopee"], "a chave de loja é a mesma das barras (a 'loja' de exibição segue sendo o vendedor)");
  assert.equal(N.coPrecos([{ id: "z", data: "2026-11-01", loja: "amazon", total_pago: 9, itens: [{ descricao: "Coisa", qtd: 0, total: 9 }] }])[0].qtd, 1, "qtd zero conta como 1, como em coPrecoLiquido");
  assert.equal(N.coPrecos([{ data: "2026-11-01", loja: "amazon", total_pago: 9, itens: [{ descricao: "Coisa", total: 9 }] }])[0].historico[0].compra_id, null, "sem id, compra_id é null");
});

// ---------- 2. produtos + ajustes = a barra, ao centavo ----------
test("por loja: produtos + ajustes = total = valor da barra (porLoja), para TODAS as lojas", () => {
  const R = N.coResumo(compras, CTX), lojas = Object.keys(R.periodo.porLoja);
  assert.deepEqual(lojas.sort(), ["Amazon", "Loja do Zé", "Magazine Luiza", "Mercado Livre", "Outra loja", "Shopee"]);
  let soma = 0;
  for (const l of lojas) {
    const d = N.coDetalheLoja(compras, CTX, l), prod = d.produtos.reduce((s, p) => s + cent(p.total), 0);
    assert.equal(cent(d.total), cent(R.periodo.porLoja[l]), l + ": total do detalhe = barra");
    assert.equal(prod + cent(d.ajustes.total), cent(d.total), l + ": produtos + ajustes = total");
    assert.equal(cent(d.ajustes.frete + d.ajustes.taxas + d.ajustes.desconto_geral + d.ajustes.outros), cent(d.ajustes.total), l + ": a abertura dos ajustes soma o total dos ajustes");
    soma += cent(d.total);
  }
  assert.equal(soma, cent(R.periodo.ano.total), "as lojas somam o total dos 12 meses");
});
test("por categoria: total do detalhe = barra; Σ categorias + ajustes dos pedidos (uma vez só) = total do período, para TODAS as categorias", () => {
  const R = N.coResumo(compras, CTX), cats = Object.keys(R.periodo.porCategoria), AJ = R.periodo.ajustesPedidos;
  assert.ok(cats.length >= 4);
  let soma = 0;
  for (const k of cats) {
    const d = N.coDetalheCategoria(compras, CTX, k), prod = d.produtos.reduce((s, p) => s + cent(p.total), 0);
    assert.equal(cent(d.total), cent(R.periodo.porCategoria[k]), k + ": total do detalhe = barra");
    assert.equal(prod, cent(d.total), k + ": a categoria é só de produtos (nenhum ajuste dentro dela)");
    assert.ok(d.produtos.every((p) => p.categoria === k), k + ": todo produto listado é desta categoria");
    assert.equal(d.escopo_ajustes, "periodo");
    assert.deepEqual(d.ajustes, AJ, k + ": a linha 'Ajustes dos pedidos' é a mesma em toda categoria (o ajuste não é de categoria nenhuma)");
    soma += cent(d.total);
  }
  assert.equal(soma + cent(AJ.total), cent(R.periodo.ano.total), "Σ categorias + ajustes (contados uma vez) = total do período");
});
test("fecha também com outro período e depois de embaralhar a ordem dos pedidos", () => {
  for (const meses of [1, 3, 6, 12, 24]) {
    const c = { hoje, meses }, R = N.coResumo([...compras].reverse(), c);
    for (const l of Object.keys(R.periodo.porLoja)) {
      const d = N.coDetalheLoja([...compras].reverse(), c, l);
      assert.equal(cent(d.total), cent(R.periodo.porLoja[l]), meses + " meses · " + l);
      assert.equal(d.produtos.reduce((s, p) => s + cent(p.total), 0) + cent(d.ajustes.total), cent(d.total), meses + " meses · " + l + ": fecha");
    }
    const cs = Object.keys(R.periodo.porCategoria).reduce((s, k) => s + cent(R.periodo.porCategoria[k]), 0);
    assert.equal(cs + cent(R.periodo.ajustesPedidos.total), cent(R.periodo.ano.total), meses + " meses: categorias + ajustes = total");
  }
});

// ---------- 3. conteúdo do detalhe ----------
test("Amazon: só pedidos que a regra manda contar; histórico entra só pelo item digital efetivado", () => {
  const d = N.coDetalheLoja(compras, CTX, "Amazon"), por = Object.fromEntries(d.produtos.map((p) => [p.nome, p]));
  assert.equal(d.total, 417.33);
  assert.equal(d.pedidos, 8, "a1 a2 a3 a4 r1 + h1 h2 h4; (h3 físico, h5 pendente, x1 cancelada, x2 fora, x3 outro módulo, x4 pendente e v1 de 2025 NÃO entram) — h4 conta pelo total");
  assert.deepEqual(Object.keys(por).sort(), ["Coleira", "Garrafa 750ml", "Livro Kindle A", "Panela", "Ração Golden 10kg", "Tampa"]);
  for (const fora of ["Monitor", "Capa dura", "Livro Kindle B", "Livro Kindle C", "Filme", "Cadeira", "Arroz 5kg", "Fone", "Faca"]) assert.ok(!por[fora], fora + " não pode aparecer");
  assert.deepEqual([por["Ração Golden 10kg"].qtd, por["Ração Golden 10kg"].total, por["Ração Golden 10kg"].medio, por["Ração Golden 10kg"].compras, por["Ração Golden 10kg"].ultima], [3, 200, 66.67, 2, "2026-11-02"], "a compra de 2025 fica fora do período");
  assert.deepEqual([por["Tampa"].qtd, por["Tampa"].total, por["Tampa"].medio], [2, 20, 10], "item só com preço unitário");
  assert.deepEqual([por["Livro Kindle A"].qtd, por["Livro Kindle A"].total, por["Livro Kindle A"].compras], [2, 35, 2], "histórico digital: valor da linha de cada pedido");
  assert.equal(por["Coleira"].medio, 0, "item de valor zero aparece");
  assert.deepEqual(d.produtos.map((p) => p.total), [...d.produtos.map((p) => p.total)].sort((a, b) => b - a), "do maior para o menor gasto");
  assert.deepEqual(d.ajustes, { total: 72.33, frete: 24.9, taxas: 1.1, desconto_geral: 0, outros: 46.33, detalhe: { item_cancelado: 4, item_sem_nome: 0, sem_itens: 42.33, nao_explicado: 0 } },
    "frete 15 (a1) e 9,90 (a3), taxas 1,10 (a3); sobra: 4 do item cancelado de a3, 33,33 do a4 e 9 do h4 (sem itens); nada fica sem explicação");
});
test("os ajustes explicam o frete e o desconto geral do pedido", () => {
  const u = (c) => N.coDetalheLoja([c], CTX, N.coLojaDe(c));
  // frete 15, item líquido 100, desconto geral já contido nos itens → ajuste = só o frete
  const a1 = u(compras.find((c) => c.id === "a1"));
  assert.deepEqual([a1.total, a1.ajustes.total, a1.ajustes.frete, a1.ajustes.desconto_geral, a1.ajustes.outros], [115, 15, 15, 0, 0]);
  // desconto geral que NÃO está nos itens (camada à parte) vira ajuste negativo
  const so = { id: "d1", data: "2026-11-02", loja: "shopee", subtotal: 90, desconto: 10, frete: 5, total_pago: 85, itens: [{ descricao: "Camiseta", qtd: 1, total: 100, desconto: 10 }] };
  const d = u(so);
  assert.deepEqual([N.coDescontos(so).modo, d.produtos[0].total, d.ajustes.total, d.ajustes.frete, d.ajustes.desconto_geral, d.ajustes.outros], ["somado", 90, -5, 5, -10, 0], "90 de item + frete 5 − desconto geral 10 = 85");
  assert.equal(d.produtos[0].total + d.ajustes.total, d.total);
});
test("Mercado Livre, Shopee, Magalu e outras: mesma estrutura; marketplace 'outra' usa o vendedor", () => {
  const ml = N.coDetalheLoja(compras, CTX, "Mercado Livre"), sp = N.coDetalheLoja(compras, CTX, "Shopee"), mg = N.coDetalheLoja(compras, CTX, "Magazine Luiza");
  assert.deepEqual(ml.produtos.map((p) => [p.nome, p.total]), [["Cabo USB", 90], ["Suporte", 90]], "valor do item já sem o desconto dele");
  assert.equal(ml.ajustes.total, 0);
  assert.deepEqual([sp.produtos[0].nome, sp.produtos[0].qtd, sp.produtos[0].total, sp.produtos[0].medio], ["Cabo USB", 2, 59.8, 29.9]);
  assert.equal(mg.produtos[0].total, 300);
  assert.deepEqual(N.coDetalheLoja(compras, CTX, "Loja do Zé").produtos.map((p) => p.nome), ["Cabo USB"], "vendedor próprio");
  assert.deepEqual(N.coDetalheLoja(compras, CTX, "Outra loja").produtos.map((p) => p.nome), ["Pilha"], "sem vendedor: 'Outra loja'");
  assert.equal(N.coDetalheLoja(compras, CTX, "Loja que não existe").total, 0);
  assert.deepEqual(N.coDetalheLoja(compras, CTX, "Loja que não existe").produtos, []);
});
test("categoria: lista os produtos dos pedidos daquela categoria, de todas as lojas, com o valor por loja", () => {
  const d = N.coDetalheCategoria(compras, CTX, "Compras online · Digital");
  assert.deepEqual(d.produtos.map((p) => [p.nome, p.total]), [["Livro Kindle A", 35]]);
  assert.equal(d.total, 35, "só produtos: o h4 digital sem itens (9) é ajuste do pedido, não da categoria");
  assert.equal(N.coResumo(compras, CTX).periodo.ajustesPedidos.detalhe.sem_itens, 42.33, "e fica nos ajustes, como 'sem itens' (h4 9 + a4 33,33)");
  const eletr = N.coDetalheCategoria(compras, CTX, "Eletrônicos"), cabo = eletr.produtos.find((p) => p.nome === "Cabo USB");
  assert.deepEqual(Object.keys(cabo.lojas).sort(), ["Loja do Zé", "Mercado Livre", "Shopee"], "o mesmo produto em três lojas, com o gasto de cada uma");
  assert.equal(cent(Object.values(cabo.lojas).reduce((s, v) => s + v, 0)), cent(cabo.total));
});
test("a chave do produto é a mesma de coPrecos (liga o detalhe ao histórico de preços)", () => {
  const precos = new Set(N.coPrecos(compras).map((p) => p.chave));
  for (const l of Object.keys(N.coResumo(compras, CTX).periodo.porLoja)) for (const p of N.coDetalheLoja(compras, CTX, l).produtos) assert.ok(precos.has(p.chave), l + " · " + p.nome + ": existe no histórico de preços");
  const rac = N.coPrecos(compras).find((p) => p.chave === N.coDetalheLoja(compras, CTX, "Amazon").produtos[0].chave);
  assert.ok(rac, "o item mais gasto da Amazon tem histórico");
});

// ---------- 4. segurança do cálculo ----------
test("sem data de referência devolve null; entrada vazia ou estranha não quebra", () => {
  assert.equal(N.coDetalheLoja(compras, {}, "Amazon"), null);
  assert.equal(N.coDetalheLoja(compras, undefined, "Amazon"), null);
  for (const x of [undefined, null, [], [null], [{}], [{ data: "2026-11-01" }], [{ data: "2026-11-01", total_pago: 5, itens: [{}, { descricao: "x" }] }]]) {
    const d = N.coDetalheLoja(x, CTX, "Amazon");
    assert.equal(d.produtos.reduce((s, p) => s + cent(p.total), 0) + cent(d.ajustes.total), cent(d.total));
  }
});
test("não altera os pedidos recebidos", () => {
  const antes = clone(compras);
  N.coDetalheLoja(compras, CTX, "Amazon"); N.coDetalheCategoria(compras, CTX, "Casa"); N.coPrecos(compras, reembolsos); N.coResumo(compras, CTX);
  assert.deepEqual(compras, antes);
});
test("coLojaDe é a chave das barras: o Resumo usa a função, sem repetir a expressão", () => {
  assert.equal(N.coLojaDe({ loja: "amazon" }), "Amazon");
  assert.equal(N.coLojaDe({ loja: "outra", vendedor: "Fulano" }), "Fulano");
  assert.equal(N.coLojaDe({ loja: "shopee", vendedor: "Fulano" }), "Shopee", "vendedor só vale quando a loja é 'outra'");
  assert.equal(N.coLojaDe({ loja: "nova" }), "nova");
  const nu = ler("nucleo.js");
  assert.equal((nu.match(/l\.vendedor&&l\.loja==="outra"|c\.vendedor&&c\.loja==="outra"/g) || []).length, 1, "a expressão da loja existe uma vez só");
  assert.ok(/var k=coLojaDe\(l\);loja\[k\]/.test(nu), "coResumo usa coLojaDe");
});
test("a classificação do histórico usa coItemHist e o detalhe não duplica a regra de natureza", () => {
  const nu = ler("nucleo.js");
  assert.ok(/var x=coItemHist\(i,nat\);/.test(nu), "coClassificar usa coItemHist");
  assert.equal((nu.match(/"digital"\|\|c\.natureza==="fisica"|c\.natureza==="digital"\|\|c\.natureza==="fisica"/g) || []).length, 1, "natureza validada em um lugar só (coNatureza)");
  for (const [it, nat, esperado] of [[{ total: 5 }, "digital", "digital"], [{ total: 5, situacao: "autorizado" }, "digital", "pendente"], [{ total: 5, status_norm: "desconhecido" }, "digital", "pendente"], [{ total: 5, situacao: "cancelado" }, "digital", "cancelado"], [{ total: 5 }, "fisica", "referencia"], [{ total: 5, situacao: "autorizado" }, "fisica", "referencia"], [{ total: 5 }, null, "indefinido"], [{ total: 5, natureza: "digital" }, "fisica", "digital"]])
    assert.equal(N.coItemHist(it, nat).destino, esperado, JSON.stringify(it) + " " + nat);
  assert.equal(N.coItemHist({ total: 5, total_linha: 7 }, "digital").v, 7, "total_linha prevalece, como antes");
});
test("o núcleo continua puro: sem tela, sem banco, sem rede", () => {
  const nu = ler("nucleo.js"), i = nu.indexOf("function coLojaDe"), f = nu.indexOf("function coDetalheCategoria");
  const trecho = nu.slice(i, f);
  assert.ok(!/document\.|window\.|fetch\(|sb\.|supabase|localStorage|racIA/.test(trecho));
});

// ---------- 5. valores negativos, quantidades fracionadas e ajustes ausentes ----------
const fecha = (d, rotulo) => {
  assert.equal(d.produtos.reduce((s, p) => s + cent(p.total), 0) + cent(d.ajustes.total), cent(d.total), rotulo + ": produtos + ajustes = total");
  assert.equal(cent(d.ajustes.frete + d.ajustes.taxas + d.ajustes.desconto_geral + d.ajustes.outros), cent(d.ajustes.total), rotulo + ": abertura dos ajustes = total dos ajustes");
};
const um = (c) => ({ id: "t", data: "2026-11-02", loja: "shopee", ...c });
test("quantidade fracionada: soma sem ruído de ponto flutuante e a média sai de total ÷ quantidade", () => {
  const c = [um({ total_pago: 6, itens: [{ descricao: "Queijo", qtd: 0.1, total: 2 }, { descricao: "Queijo", qtd: 0.2, total: 4 }] })];
  const d = N.coDetalheLoja(c, CTX, "Shopee"), p = d.produtos[0];
  assert.deepEqual([p.qtd, p.total, p.medio, p.compras], [0.3, 6, 20, 1], "0,1 + 0,2 = 0,3 (não 0,30000000000000004)");
  fecha(d, "fracionada");
  const q = N.coDetalheLoja([um({ total_pago: 12.5, itens: [{ descricao: "Carne kg", qtd: 1.25, total: 12.5 }] })], CTX, "Shopee").produtos[0];
  assert.deepEqual([q.qtd, q.medio], [1.25, 10]);
  assert.equal(N.coPrecos(c)[0].qtd, 0.3, "coPrecos: a mesma soma");
  assert.equal(N.coPrecos(c)[0].media, 20);
  assert.equal(N.coPrecos(c)[0].ultimo.u, 20, "o preço unitário de cada compra continua o de antes (total ÷ qtd, arredondado)");
});
test("valores negativos: item de crédito, frete negativo e desconto maior que o item fecham ao centavo", () => {
  const casos = {
    "item negativo": um({ total_pago: 70, itens: [{ descricao: "Fone", qtd: 1, total: 100 }, { descricao: "Estorno parcial", qtd: 1, total: -30 }] }),
    "frete negativo": um({ total_pago: 90, frete: -10, itens: [{ descricao: "Fone", qtd: 1, total: 100 }] }),
    "desconto do item maior que o total": um({ total_pago: 0, itens: [{ descricao: "Brinde", qtd: 1, total: 5, desconto: 8 }] }),
    "taxa negativa e desconto geral": um({ total_pago: 93, taxas: -2, desconto: 5, subtotal: 100, itens: [{ descricao: "Fone", qtd: 1, total: 100 }] }),
  };
  for (const [nome, c] of Object.entries(casos)) {
    const d = N.coDetalheLoja([c], CTX, "Shopee"), r = N.coRegra(c);
    assert.equal(r.conta, true, nome + ": o pedido conta (a regra do Lote 5.0 não mudou)");
    assert.equal(cent(d.total), cent(r.valor), nome + ": total do detalhe = valor que a regra manda contar");
    fecha(d, nome);
  }
  const neg = N.coDetalheLoja([casos["item negativo"]], CTX, "Shopee");
  assert.deepEqual(neg.produtos.map((p) => [p.nome, p.total]), [["Fone", 100], ["Estorno parcial", -30]], "o item negativo aparece como é");
  assert.equal(neg.ajustes.total, 0);
  const fr = N.coDetalheLoja([casos["frete negativo"]], CTX, "Shopee").ajustes;
  assert.deepEqual([fr.total, fr.frete, fr.outros, fr.detalhe.nao_explicado], [-10, 0, -10, -10], "frete negativo não é tratado como frete: fica em 'não explicado', identificado, sem forçar o fechamento");
  const br = N.coDetalheLoja([casos["desconto do item maior que o total"]], CTX, "Shopee");
  assert.deepEqual([br.produtos[0].total, br.total, br.ajustes.total, br.ajustes.detalhe.nao_explicado], [-3, 0, 3, 3], "item com desconto maior que o valor fica negativo; o pedido soma 0; os 3 ficam em 'não explicado'");
});
test("ajustes ausentes (sem frete, taxas, desconto, subtotal ou itens) ficam em zero e o total fecha", () => {
  const d = N.coDetalheLoja([um({ total_pago: 50, itens: [{ descricao: "Livro", qtd: 1, total: 50 }] })], CTX, "Shopee");
  assert.deepEqual(d.ajustes, { total: 0, frete: 0, taxas: 0, desconto_geral: 0, outros: 0, detalhe: { item_cancelado: 0, item_sem_nome: 0, sem_itens: 0, nao_explicado: 0 } });
  for (const v of [null, "", "abc", undefined]) {
    const c = um({ total_pago: 50, frete: v, taxas: v, desconto: v, subtotal: v, itens: [{ descricao: "Livro", qtd: v, total: 50, desconto: v }] });
    const x = N.coDetalheLoja([c], CTX, "Shopee");
    assert.deepEqual([x.total, x.produtos[0].total, x.produtos[0].qtd, x.ajustes.total], [50, 50, 1, 0], JSON.stringify(v));
    fecha(x, "ausente " + JSON.stringify(v));
  }
  const sem = N.coDetalheLoja([um({ total_pago: 20 })], CTX, "Shopee");
  assert.deepEqual([sem.produtos.length, sem.ajustes.total, sem.ajustes.outros, sem.total], [0, 20, 20, 20], "pedido sem itens: o total inteiro é ajuste 'outros'");
});
test("sem dupla contagem de descontos: contemplado, somado e incerto fecham e a economia não passa do piso", () => {
  const base = { total_pago: 0, itens: [{ descricao: "Camiseta", qtd: 2, total: 200, desconto: 20 }] };
  const cenarios = {
    // desconto do pedido já contém o dos itens (subtotal = itens brutos): total = 200 + frete 10 − desconto 20 = 190; itens líquidos 180; ajuste = frete
    contemplado: { ...base, subtotal: 200, desconto: 20, frete: 10, total_pago: 190, modo: "contemplado", aj: { frete: 10, desconto_geral: 0, total: 10 } },
    // desconto do pedido é uma camada à parte (subtotal = itens líquidos): 180 + 10 − 15 = 175
    somado: { ...base, subtotal: 180, desconto: 15, frete: 10, total_pago: 175, modo: "somado", aj: { frete: 10, desconto_geral: -15, total: -5 } },
    // sem subtotal: não dá para provar; o geral é só o que passa dos itens (piso)
    incerto: { ...base, desconto: 30, frete: 0, total_pago: 170, modo: "incerto", aj: { frete: 0, desconto_geral: -10, total: -10 } },
  };
  for (const [nome, c] of Object.entries(cenarios)) {
    const { modo, aj, ...pedido } = c, ped = um(pedido), dc = N.coDescontos(ped), d = N.coDetalheLoja([ped], CTX, "Shopee");
    assert.equal(dc.modo, modo, nome);
    assert.equal(cent(dc.geral + dc.itens), cent(dc.total), nome + ": geral + itens = total de descontos");
    assert.equal(d.produtos[0].total, 180, nome + ": o desconto do item entra uma vez, no valor do item");
    assert.deepEqual([d.ajustes.frete, d.ajustes.desconto_geral, d.ajustes.total], [aj.frete, aj.desconto_geral, aj.total], nome + ": ajustes");
    assert.equal(d.ajustes.outros, 0, nome + ": nada sobra em 'outros'");
    fecha(d, nome);
  }
});
test("a soma dos descontos do detalhe nunca passa da economia do Lote 5.0 (sem dupla contagem)", () => {
  for (const c of compras) {
    if (!N.coRegra(c).conta) continue;
    const dc = N.coDescontos(c), d = N.coDetalhe([c], CTX, {});
    if (!d || !d.pedidos) continue;
    assert.ok(-d.ajustes.desconto_geral <= dc.geral + 0.005, c.id + ": o desconto geral do ajuste é o 'geral' de coDescontos, nunca o total");
    assert.ok(cent(dc.geral) + cent(dc.itens) === cent(dc.total), c.id + ": descontos gerais + itens = total");
  }
});
test("o detalhe sem filtro soma todos os pedidos do período e fecha com o total de 12 meses do Resumo", () => {
  const R = N.coResumo(compras, CTX), d = N.coDetalhe(compras, CTX, {});
  assert.equal(cent(d.total), cent(R.periodo.ano.total));
  assert.equal(d.pedidos, R.periodo.ano.n);
  fecha(d, "todas as lojas");
});

// ---------- 6. categoria POR PRODUTO e ajustes dos pedidos separados (correção da etapa 1) ----------
const ITENS3 = () => [{ descricao: "Ração Golden 10kg", qtd: 1, total: 100, categoria: "Pet" }, { descricao: "Panela", qtd: 1, total: 60, categoria: "Casa" }, { descricao: "Fone", qtd: 1, total: 40, categoria: "Eletrônicos" }];
const ped3 = (extra = {}) => ({ id: "t3", data: "2026-11-02", loja: "amazon", total_pago: 200, itens: ITENS3(), ...extra });
const porCat = (cs) => N.coResumo(cs, CTX).periodo.porCategoria;
const nomes = (d) => d.produtos.map((p) => [p.nome, p.total]);
test("pedido com Ração (Pet 100), Panela (Casa 60) e Fone (Eletrônicos 40): cada produto na sua categoria", () => {
  assert.deepEqual(porCat([ped3()]), { Pet: 100, Casa: 60, "Eletrônicos": 40 });
  const R = N.coResumo([ped3()], CTX);
  assert.equal(R.periodo.ano.total, 200, "o total geral continua sendo o do pedido");
  assert.equal(R.periodo.ajustesPedidos.total, 0);
  assert.deepEqual(nomes(N.coDetalheCategoria([ped3()], CTX, "Pet")), [["Ração Golden 10kg", 100]]);
  assert.deepEqual(nomes(N.coDetalheCategoria([ped3()], CTX, "Casa")), [["Panela", 60]]);
  assert.deepEqual(nomes(N.coDetalheCategoria([ped3()], CTX, "Eletrônicos")), [["Fone", 40]]);
  assert.deepEqual(N.coDetalheCategoria([ped3()], CTX, "Casa").produtos[0].lojas, { Amazon: 60 }, "a loja de origem de cada produto continua identificada");
  assert.equal(N.coDetalheCategoria([ped3()], CTX, "Livros e papelaria").produtos.length, 0);
});
test("categoria preenchida no pedido não manda nos itens: o resultado é o mesmo", () => {
  for (const cat of ["Casa", "Pet", "Livros e papelaria", "Outros", "Compras online · Digital"]) {
    assert.deepEqual(porCat([ped3({ categoria: cat })]), { Pet: 100, Casa: 60, "Eletrônicos": 40 }, "categoria do pedido: " + cat);
  }
  assert.deepEqual(nomes(N.coDetalheCategoria([ped3({ categoria: "Casa" })], CTX, "Casa")), [["Panela", 60]], "mesmo com o pedido em 'Casa', a Ração não aparece em Casa");
});
test("item sem categoria: coCategoria(descrição) como fallback; categoria do item prevalece sobre o fallback", () => {
  const itens = [{ descricao: "Coleira de couro", qtd: 1, total: 30 }, { descricao: "Panela de pressão", qtd: 1, total: 20, categoria: null }, { descricao: "Fone bluetooth", qtd: 1, total: 10, categoria: "   " }, { descricao: "Ração premium", qtd: 1, total: 40, categoria: "Casa" }];
  assert.deepEqual(N.coCategoria("Coleira de couro"), "Pet");
  assert.deepEqual(porCat([ped3({ total_pago: 100, itens })]), { Pet: 30, Casa: 60, "Eletrônicos": 10 }, "coleira→Pet, panela→Casa, fone→Eletrônicos (categoria vazia ou em branco usa o fallback); a ração marcada como Casa fica em Casa");
  assert.deepEqual(N.coCategoriaItem({ categoria: " Pet ", descricao: "Panela" }), "Pet", "categoria do item tem precedência (sem espaços sobrando)");
});
test("produto sem categoria identificável fica em 'Outros'", () => {
  const c = ped3({ total_pago: 50, categoria: "Casa", itens: [{ descricao: "Item misterioso zzz", qtd: 1, total: 50 }] });
  assert.deepEqual(porCat([c]), { Outros: 50 }, "nem a categoria do pedido (Casa) é usada");
  assert.deepEqual(nomes(N.coDetalheCategoria([c], CTX, "Outros")), [["Item misterioso zzz", 50]]);
  assert.equal(N.coCategoriaItem({ descricao: "" }), "Outros");
  assert.equal(N.coCategoriaItem(undefined), "Outros");
});
test("pedido com categorias diferentes e ajustes: frete, taxas e desconto geral ficam numa linha à parte, uma vez, sem ratear", () => {
  // 200 de itens + frete 20 + taxas 5 − desconto geral 10 (camada à parte: os itens não têm desconto) = 215
  const c = ped3({ total_pago: 215, frete: 20, taxas: 5, desconto: 10, subtotal: 200 });
  const R = N.coResumo([c], CTX), P = R.periodo, AJ = P.ajustesPedidos;
  assert.equal(P.ano.total, 215);
  assert.deepEqual(P.porCategoria, { Pet: 100, Casa: 60, "Eletrônicos": 40 }, "as categorias não recebem nada do frete, das taxas nem do desconto");
  assert.deepEqual([AJ.total, AJ.frete, AJ.taxas, AJ.desconto_geral, AJ.outros], [15, 20, 5, -10, 0]);
  assert.deepEqual(AJ.detalhe, { item_cancelado: 0, item_sem_nome: 0, sem_itens: 0, nao_explicado: 0 });
  const ds = ["Pet", "Casa", "Eletrônicos"].map((k) => N.coDetalheCategoria([c], CTX, k));
  for (const d of ds) assert.deepEqual(d.ajustes, AJ, "a mesma linha em todas as categorias: é o ajuste do período, não de uma categoria");
  assert.equal(ds.reduce((s, d) => s + cent(d.total), 0) + cent(AJ.total), 21500, "100 + 60 + 40 + 15 = 215, os ajustes contados UMA vez");
  assert.equal(AJ.frete, 20, "o frete aparece uma vez (e não 3 vezes, uma por categoria)");
  assert.equal(N.coDetalheCategoria([c], CTX, "Pet").pedidos, 1, "o mesmo pedido contribui para várias categorias");
  const loja = N.coDetalheLoja([c], CTX, "Amazon");
  assert.deepEqual([loja.total, loja.produtos.length, loja.ajustes.total], [215, 3, 15], "por loja: os 3 produtos + os ajustes do pedido");
  assert.deepEqual(loja.produtos.map((p) => p.categoria).sort(), ["Casa", "Eletrônicos", "Pet"], "cada produto da loja carrega a categoria dele");
});
test("reconciliação global: Σ categorias + ajustes = total do Lote 5.0, no golden, em vários períodos e com os pedidos embaralhados", () => {
  for (const [lista, meses] of [[compras, 12], [[...compras].reverse(), 12], [compras, 6], [compras, 3], [compras, 24]]) {
    const R = N.coResumo(lista, { hoje, meses }), P = R.periodo, AJ = P.ajustesPedidos;
    const cats = Object.values(P.porCategoria).reduce((s, v) => s + cent(v), 0);
    assert.equal(cats + cent(AJ.total), cent(P.ano.total), meses + " meses: categorias + ajustes = total");
    assert.equal(cent(AJ.frete + AJ.taxas + AJ.desconto_geral + AJ.outros), cent(AJ.total), "a abertura dos ajustes soma o total dos ajustes");
    assert.equal(cent(AJ.detalhe.item_cancelado + AJ.detalhe.item_sem_nome + AJ.detalhe.sem_itens + AJ.detalhe.nao_explicado), cent(AJ.outros), "a abertura de 'outros' soma 'outros'");
    // por loja: cada loja fecha com a soma dos produtos + ajustes dos pedidos dela, e as lojas somam os ajustes globais uma vez
    let ajLojas = 0;
    for (const l of Object.keys(P.porLoja)) { const d = N.coDetalheLoja(lista, { hoje, meses }, l); ajLojas += cent(d.ajustes.total); assert.equal(cent(d.total), cent(P.porLoja[l])); }
    assert.equal(ajLojas, cent(AJ.total), "os ajustes das lojas somam os ajustes globais: nenhum ajuste repetido nem perdido");
    assert.equal(cent(N.coDetalhe(lista, { hoje, meses }, {}).total), cent(P.ano.total));
  }
});
test("cada pedido do golden: itens + ajustes = valor que a regra do Lote 5.0 manda contar (o valor financeiro nunca é forçado)", () => {
  for (const c of compras) {
    const r = N.coRegra(c);
    if (!r.conta) continue;
    const pt = N.coPedidoPartes(c, r);
    assert.equal(pt.itens.reduce((s, i) => s + cent(i.v), 0) + cent(pt.aj.total), cent(r.valor), c.id);
    assert.equal(cent(pt.aj.frete + pt.aj.taxas + pt.aj.desconto_geral + pt.aj.outros), cent(pt.aj.total), c.id + ": abertura");
  }
});
test("'outros' é zero nos pedidos normais, em que todos os componentes são conhecidos", () => {
  for (const id of ["a1", "a2", "m1", "s1", "g1", "o1", "o2", "h1", "h2", "r1"]) {
    const c = compras.find((x) => x.id === id), pt = N.coPedidoPartes(c);
    assert.equal(pt.aj.outros, 0, id + ": outros = 0");
    assert.deepEqual(Object.values(pt.aj.detalhe), [0, 0, 0, 0], id + ": nada em item cancelado, sem nome, sem itens nem não explicado");
  }
  assert.equal(N.coDetalheLoja(compras.filter((c) => ["a1", "m1", "s1", "g1", "o1", "o2"].includes(c.id)), CTX, "Mercado Livre").ajustes.outros, 0);
  assert.deepEqual(N.coPedidoPartes(compras.find((c) => c.id === "a1")).aj, { total: 15, frete: 15, taxas: 0, desconto_geral: 0, outros: 0, detalhe: { item_cancelado: 0, item_sem_nome: 0, sem_itens: 0, nao_explicado: 0 } });
});
test("origem do residual: item cancelado, item sem nome, pedido sem itens e diferença não explicada, cada um no seu lugar", () => {
  const P = (c) => N.coPedidoPartes(um(c)).aj;
  const panela = { descricao: "Panela", qtd: 1, total: 80 };
  assert.deepEqual(P({ total_pago: 100, itens: [panela, { descricao: "Faca", qtd: 1, total: 20, situacao: "cancelado" }] }).detalhe, { item_cancelado: 20, item_sem_nome: 0, sem_itens: 0, nao_explicado: 0 }, "o valor do item cancelado explica a sobra");
  assert.deepEqual(P({ total_pago: 95, itens: [panela, { descricao: "", qtd: 1, total: 15 }] }).detalhe, { item_cancelado: 0, item_sem_nome: 15, sem_itens: 0, nao_explicado: 0 }, "item sem identificação");
  assert.deepEqual(P({ total_pago: 40 }).detalhe, { item_cancelado: 0, item_sem_nome: 0, sem_itens: 40, nao_explicado: 0 }, "pedido sem itens");
  assert.deepEqual(P({ total_pago: 85, itens: [panela, { descricao: "Faca", qtd: 1, total: 20, situacao: "cancelado" }] }).detalhe, { item_cancelado: 5, item_sem_nome: 0, sem_itens: 0, nao_explicado: 0 }, "identificado só até o limite da sobra (5), sem inventar valor");
  assert.deepEqual(P({ total_pago: 110, itens: [panela, { descricao: "Faca", qtd: 1, total: 20, situacao: "cancelado" }] }).detalhe, { item_cancelado: 20, item_sem_nome: 0, sem_itens: 0, nao_explicado: 10 }, "o que não se explica fica em não_explicado (10), claramente identificado");
  assert.deepEqual(P({ total_pago: 70, itens: [panela] }).detalhe, { item_cancelado: 0, item_sem_nome: 0, sem_itens: 0, nao_explicado: -10 }, "diferença negativa também aparece como não explicada");
  for (const c of [{ total_pago: 100, itens: [panela, { descricao: "Faca", qtd: 1, total: 20, situacao: "cancelado" }] }, { total_pago: 110, itens: [panela] }, { total_pago: 40 }]) {
    const a = P(c), r = N.coRegra(um(c));
    assert.equal(cent(a.detalhe.item_cancelado + a.detalhe.item_sem_nome + a.detalhe.sem_itens + a.detalhe.nao_explicado), cent(a.outros), "a abertura soma 'outros'");
    assert.equal(r.valor, c.total_pago, "o valor financeiro é o da regra, nunca alterado para fechar");
  }
});
test("histórico digital da Amazon: o item vai para a categoria do digital (regra do Lote 5.0) e o físico continua fora", () => {
  const P = N.coResumo(compras, CTX).periodo, d = N.coDetalheCategoria(compras, CTX, "Compras online · Digital");
  assert.equal(P.porCategoria["Compras online · Digital"], 35);
  assert.deepEqual(nomes(d), [["Livro Kindle A", 35]]);
  assert.equal(Object.values(P.porCategoria).length, Object.keys(P.porCategoria).length);
  assert.ok(!Object.keys(P.porCategoria).includes("Monitor"), "físico histórico não vira categoria");
});
test("a classificação por produto usa uma só função (coCategoriaItem) e o núcleo não olha a categoria do pedido para os itens", () => {
  const nu = ler("nucleo.js"), i = nu.indexOf("function coPedidoPartes"), f = nu.indexOf("function coDetalheLoja");
  assert.ok(/cat:hist\?CO_CAT_DIGITAL:coCategoriaItem\(i\)/.test(nu.slice(i, f)), "coPedidoPartes classifica cada item por coCategoriaItem");
  assert.ok(!/c\.categoria|l\.cat\b/.test(nu.slice(i, f)), "o detalhe não usa c.categoria nem l.cat (categoria do pedido)");
  assert.ok(/pt\.itens\.forEach\(function\(it\)\{cat\[it\.cat\]/.test(nu), "coResumo monta porCategoria pelos itens");
});

// ---------- 7. Etapa 2 (interface): resumo do produto e arquitetura das telas ----------
const juntar = (xs) => xs.reduce((s, v) => s + cent(v), 0);
test("coProdutoResumo: só soma o que coPrecos já calculou (12 meses do Resumo e todas as lojas)", () => {
  const ini = N.coResumo(compras, CTX).periodo.ini, precos = N.coPrecos(compras);
  const rac = precos.find((p) => /ra[cç][aã]o golden/i.test(p.nome)), S = N.coProdutoResumo(rac, ini);
  assert.deepEqual(S.periodo, { ini, gasto: 200, qtd: 3, media: 66.67, compras: 2 }, "a compra de 2025 (500) fica fora dos 12 meses");
  assert.deepEqual(S.lojas, [{ loja: "Amazon", compras: 3, qtd: 4, gasto: 700, menor: 50, ultimo: 50, ultima: "2026-11-02", media: 175 }], "o histórico das lojas é o inteiro");
  const todo = N.coProdutoResumo(rac, null);
  assert.deepEqual([todo.periodo.gasto, todo.periodo.qtd, todo.periodo.compras], [rac.gasto, rac.qtd, rac.vezes], "sem corte, bate com os campos do próprio coPrecos");
  for (const p of precos) {
    const r = N.coProdutoResumo(p, null);
    assert.equal(r.lojas.reduce((s, l) => s + l.compras, 0), p.vezes, p.nome + ": toda compra está em alguma loja");
    assert.equal(juntar(r.lojas.map((l) => l.gasto)), cent(p.gasto), p.nome + ": o gasto das lojas fecha com o do produto");
    assert.equal(Math.min(...r.lojas.map((l) => l.menor)), p.menor, p.nome + ": menor preço");
  }
  const cabo = N.coProdutoResumo(precos.find((p) => /cabo usb/i.test(p.nome)), ini);
  assert.deepEqual(cabo.lojas.map((l) => [l.loja, l.ultimo]), [["Loja do Zé", 25], ["Shopee", 29.9], ["Mercado Livre", 90]], "mais barata primeiro, como 'Onde saiu mais barato'");
  assert.deepEqual(N.coProdutoResumo(null, ini), { periodo: { ini, gasto: 0, qtd: 0, media: null, compras: 0 }, lojas: [] }, "entrada vazia");
});
const tela = () => { const js = ler("js/compras.js"), a = js.indexOf("/* ---------- Detalhamento (Lote 5.2)"), b = js.indexOf("/* ---------- Lista e detalhe"); return { js, bloco: js.slice(a, b), a, b }; };
test("Resumo: cada barra de loja e de categoria é um link para a tela própria (padrão do Mercado: tela, não modal)", () => {
  const { js, bloco } = tela();
  assert.ok(tela().a > 0 && tela().b > tela().a, "bloco do detalhamento existe");
  assert.match(js, /href:"#compras\/"\+rota\+"\/"\+encodeURIComponent\(k\)/, "a barra leva a #compras/<loja|categoria>/<nome>");
  assert.match(js, /barras\(cat,"em 12 meses","categoria"\)/); assert.match(js, /barras\(loja,"em 12 meses","loja"\)/);
  assert.ok(!/class:"modal|showModal|alert\(|confirm\(|prompt\(/.test(bloco), "nada de modal improvisado");
  assert.match(js, /function renderCompras\(sub,id,extra\)/); assert.match(js, /ccDetalheRota\(sub,id,extra\)/);
  assert.match(js, /href:ccRotaProduto\(x\.chave,"produtos"\)/, "a aba Produtos também leva ao histórico do produto");
  assert.match(ler("js/app.js"), /renderCompras\(parts\[1\],parts\[2\],parts\[3\]\)/);
});
test("as telas usam o núcleo e o gráfico do Mercado, sem regra financeira própria", () => {
  const { bloco } = tela();
  for (const f of ["NUCLEO.coDetalheLoja", "NUCLEO.coDetalheCategoria", "NUCLEO.coPrecos", "NUCLEO.coProdutoResumo", "NUCLEO.coResumo", "NUCLEO.coRotulo", "RACmercado.grafico"]) assert.ok(bloco.includes(f), f);
  assert.ok(!/NUCLEO\.coRegra|coDescontos|coClassificar|coPrecoLiquido|coItemTotal|\.frete\b|\.taxas\b/.test(bloco.replace(/A\.frete|A\.taxas/g, "")), "nenhuma regra de despesa, desconto ou preço repetida na tela");
  assert.ok(!/racIA|fetch\(|SB\./.test(bloco), "a tela só lê: sem IA, sem rede, sem banco");
  assert.ok(!/=>|\blet\b|\bconst\b|`/.test(bloco), "ES5 puro, como o resto do site");
});
test("o produto mostra todas as lojas e destaca a de origem (★) sem restringir o histórico a ela", () => {
  const { bloco } = tela();
  assert.match(bloco, /NUCLEO\.coPrecos\(CC\.dados\)\.filter\(function\(y\)\{return y\.chave===chave\}\)/, "o histórico vem de coPrecos, de todas as lojas");
  assert.match(bloco, /Preços em todas as lojas/); assert.match(bloco, /Datas das compras/); assert.match(bloco, /Evolução do preço/);
  assert.match(bloco, /r\.loja_chave===oi\?" ★"/); assert.match(bloco, /Histórico = pedido importado/); assert.match(bloco, /Provisório \(amarelo\)/);
  assert.match(bloco, /Total gasto \(12 meses\)/); assert.match(bloco, /Menor preço \(histórico\)/); assert.match(bloco, /"Último preço"/);
});
test("ccVoltarDe leva de volta à origem do clique; sem origem, ao Resumo", () => {
  const { bloco } = tela(), a = bloco.indexOf("function ccVoltarDe"), b = bloco.indexOf("function ccVoltar(v)");
  const dec = (s) => decodeURIComponent(s);
  const f = new Function("encodeURIComponent", bloco.slice(a, b) + "; return ccVoltarDe")(encodeURIComponent);
  assert.deepEqual(f("loja:Amazon"), { href: "#compras/loja/Amazon", texto: "← Voltar para Amazon", loja: "Amazon" });
  assert.equal(dec(f("loja:Loja do Zé").href.split("/").pop()), "Loja do Zé");
  assert.deepEqual(f("categoria:Pet"), { href: "#compras/categoria/Pet", texto: "← Voltar para Pet", loja: null });
  assert.equal(f("produtos").href, "#compras/produtos");
  for (const o of ["", undefined, "lixo", "loja:"]) assert.equal(f(o).href, "#compras/resumo", String(o));
});
test("ccNav: voltar à tela anterior devolve a rolagem de antes; abrir a mesma tela de novo não empilha", () => {
  const { bloco } = tela(), a = bloco.indexOf("function ccNav"), b = bloco.indexOf("function ccDetalheRota");
  const CCx = { nav: [] }, L = { hash: "#compras" };
  const nav = new Function("CC", "location", bloco.slice(a, b) + "; return ccNav")(CCx, L);
  assert.equal(nav(), 0); assert.deepEqual(CCx.nav.map((x) => x.h), ["#compras/resumo"], "'#compras' e '#compras/resumo' são a mesma tela");
  CCx.nav[0].y = 540;                               // rolou até 540 e clicou numa barra
  L.hash = "#compras/loja/Amazon"; assert.equal(nav(), 0, "ir adiante começa no topo");
  CCx.nav[1].y = 200;
  L.hash = "#compras/produto/x/loja%3AAmazon"; assert.equal(nav(), 0);
  L.hash = "#compras/loja/Amazon"; assert.equal(nav(), 200, "voltar ao produto → loja: rolagem da loja de volta");
  L.hash = "#compras/resumo"; assert.equal(nav(), 540, "voltar à loja → Resumo: rolagem do Resumo de volta");
  L.hash = "#compras/resumo"; assert.equal(nav(), 0, "redesenhar a mesma tela não mexe na pilha");
  assert.deepEqual(CCx.nav.map((x) => x.h), ["#compras/resumo"]);
  for (let i = 0; i < 60; i++) { L.hash = "#compras/loja/L" + i; nav(); }
  assert.ok(CCx.nav.length <= 40, "a pilha tem limite");
});
test("o Resumo mostra as categorias por produto mais a linha de ajustes, e a conta é conferida na tela", () => {
  const { js } = tela();
  assert.match(js, /Ajustes dos pedidos \(frete, taxas, descontos gerais e outros\)/);
  assert.match(js, /P\.ajustesPedidos/); assert.match(js, /Categorias \+ ajustes = /);
});
