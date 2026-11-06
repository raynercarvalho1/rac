// Lote 2 · Compras multiorigem, histórico da Amazon e reembolsos: só regras puras, sem rede, sem banco e sem custo.
// Todos os pedidos, nomes, endereços e valores abaixo são FICTÍCIOS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;

// "Order History.csv" com os cabeçalhos reais diagnosticados (Total Amount, Original Quantity, Payment Method Type) + colunas pessoais.
const CAB = "Order ID,Order Date,Currency,Unit Price,Unit Price Tax,Shipping Charge,Total Discounts,Total Amount,Shipping Address,Billing Address,Payment Method Type,Order Status,Shipment Status,Ship Date,Shipping Option,Carrier Name & Tracking Number,Product Name,Original Quantity,ASIN,Recipient Name,Latitude,Longitude";
const PES = '"Rua Ficticia 100, Bairro Teste, 01234-567","Rua Ficticia 100, Bairro Teste, 01234-567"';
const lin = (id, data, un, imp, fr, de, tot, pag, st, env, dtEnv, opcao, rastro, nome, qtd, asin) =>
  [id, data, "BRL", un, imp, fr, de, tot, PES, pag, st, env, dtEnv, opcao, rastro, nome, qtd, asin, "Fulano de Tal", "-23.5000", "-46.6000"].join(",");
const FIS1 = lin("701-1000001-0000001", "2023-05-10T14:00:00Z", "40.00", "0", "8.00", "0", "48.00", '"Visa - 1111"', "Closed", "Delivered", "2023-05-11", "Standard", "TRK0001", "Ração Exemplo 1 kg", "1", "B0AAAAAAA1");
const FIS2A = lin("701-1000002-0000002", "2023-06-01T10:00:00Z", "25.00", "0", "5.00", "5.00", "75.00", '"Mastercard - 2222"', "Closed", "Delivered", "2023-06-03", "Standard", "TRK0002", "Cabo USB Exemplo", "3", "B0AAAAAAA2");
const FIS2B = lin("701-1000002-0000002", "2023-06-01T10:00:00Z", "100.00", "12.00", "0", "0", "112.00", '"Mastercard - 2222"', "Closed", "Delivered", "2023-06-03", "Standard", "TRK0003", "Fone Exemplo", "1", "B0AAAAAAA3");
const CANC = lin("701-1000003-0000003", "2023-07-02T09:00:00Z", "30.00", "0", "0", "0", "30.00", "Visa", "Cancelled", "Not Applicable", "Not Applicable", "Standard", "", "Item Cancelado", "1", "B0AAAAAAA4");
const AUTO = lin("701-1000004-0000004", "2023-08-05T09:00:00Z", "60.00", "0", "0", "0", "60.00", "Pix", "Authorized", "Shipped", "2023-08-06", "Standard", "TRK0004", "Mochila Exemplo", "1", "B0AAAAAAA5");
const DIG = lin("D01-2000005-0000005", "2022-03-15T20:00:00Z", "19.90", "0", "0", "0", "19.90", '"Visa - 1111"', "Closed", "Not Applicable", "Not Applicable", "Digital", "", "Livro Ficticio - Edição Kindle", "1", "B0DIGITAL1");
const BR = lin("701-1000006-0000006", "10/09/2024", '"1.100,00"', "0", "0", "0", '"2.200,00"', "Elo", "Closed", "Delivered", "2024-09-12", "Standard", "TRK0006", "Notebook Exemplo", "2", "B0AAAAAAA6");
const csv = (...l) => CAB + "\n" + l.join("\n") + "\n";
const ped = (r, n) => r.pedidos.find((p) => p.numero === n);

// ---------- multiorigem ----------
test("canais: Amazon, Shopee, Mercado Livre, outro marketplace e presencial; registro antigo (sem canal) é lido pela loja", () => {
  assert.deepEqual(Object.keys(N.CO_CANAIS), ["amazon", "shopee", "mercado_livre", "outro_marketplace", "presencial"]);
  assert.equal(N.coCanalDe({ loja: "amazon" }), "amazon");
  assert.equal(N.coCanalDe({ loja: "mercadolivre" }), "mercado_livre");
  assert.equal(N.coCanalDe({ loja: "magalu" }), "outro_marketplace");
  assert.equal(N.coCanalDe({ loja: "amazon", canal: "presencial" }), "presencial", "o canal gravado manda");
  assert.equal(N.coCanalDe({ canal: "inexistente", loja: "shopee" }), "shopee");
});
test("tratamento: compra atual (qualquer canal) e registro antigo seguem como despesa normal, pelo total pago", () => {
  for (const c of [{ loja: "amazon", total_pago: 95 }, { canal: "shopee", total_pago: 95 }, { canal: "presencial", total_pago: 95 }, { canal: "mercado_livre", natureza: "fisica", total_pago: 95 }]) {
    const k = N.coClassificar(c);
    assert.equal(k.tratamento, "despesa"); assert.equal(k.valor_despesa, 95); assert.equal(k.valor_referencia, 0); assert.equal(k.categoria, null);
  }
  assert.equal(N.coClassificar({ canal: "amazon", natureza: "fisica", historico: false, total_pago: 50 }).tratamento, "despesa", "Amazon físico ATUAL não é histórico");
});
test("tratamento: supermercado fica no Mercado e combustível em Veículos — nunca contados em Compras", () => {
  const s = N.coClassificar({ canal: "presencial", segmento: "supermercado", total_pago: 300 });
  const c = N.coClassificar({ canal: "presencial", segmento: "combustivel", total_pago: 200 });
  assert.deepEqual([s.modulo, s.tratamento, s.valor_despesa], ["mercado", "outro_modulo", 0]);
  assert.deepEqual([c.modulo, c.tratamento, c.valor_despesa], ["veiculos", "outro_modulo", 0]);
  assert.equal(N.coDespesas([{ data: "2026-10-01", canal: "presencial", segmento: "supermercado", total_pago: 300 }]).length, 0);
});
test("tratamento: Amazon físico histórico é só referência; digital histórico vira despesa em 'Compras online · Digital'", () => {
  const f = N.coClassificar({ canal: "amazon", historico: true, natureza: "fisica", total_pago: 120 });
  assert.deepEqual([f.tratamento, f.valor_despesa, f.valor_referencia], ["referencia_historica", 0, 120]);
  const d = N.coClassificar({ canal: "amazon", historico: true, status_norm: "concluido", natureza: "digital", total_pago: 20 });
  assert.deepEqual([d.tratamento, d.valor_despesa, d.valor_referencia, d.categoria], ["despesa_digital", 20, 0, "Compras online · Digital"]);
  const i = N.coClassificar({ canal: "amazon", historico: true, status_norm: "concluido", total_pago: 20 });
  assert.equal(i.tratamento, "referencia_historica", "sem natureza identificada nunca entra nas despesas por engano");
  assert.match(i.avisos.join(" "), /não identificada/);
  const m = N.coClassificar({ canal: "amazon", historico: true, status_norm: "concluido", total_pago: 70, itens: [{ natureza: "digital", total_linha: 20 }, { natureza: "fisica", total_linha: 50 }] });
  assert.deepEqual([m.tratamento, m.valor_despesa, m.valor_referencia], ["misto", 20, 50]);
});
test("Painel (coDespesas): registro antigo idêntico ao de antes; histórico físico fora; digital dentro, na categoria certa", () => {
  const antigo = { id: "a", data: "2026-10-03", loja: "amazon", total_pago: 95, itens: [{ descricao: "Ração", total: 100, desconto: 5, categoria: "Pet" }] };
  assert.deepEqual(N.coDespesas([antigo]), [{ d: "2026-10-03", v: 95, f: "Compras online", cat: "Pet", id: "a" }]);
  const r = N.amLerHistorico(csv(FIS1, DIG, FIS2A, FIS2B));
  const D = N.coDespesas(r.pedidos);
  assert.equal(D.length, 1, "só o digital entra");
  assert.deepEqual([D[0].d, D[0].v, D[0].cat], ["2022-03-15", 19.9, "Compras online · Digital"]);
  const hf = N.hojeFinancas({ compras: { ok: true, v: [{ data: "2026-11-02", total_pago: 100, canal: "amazon", historico: true, natureza: "fisica" }, { data: "2026-11-03", total_pago: 40, loja: "amazon" }] } }, "2026-11-05");
  assert.equal(hf.total, 40, "referência histórica não conta nas finanças do mês");
});

// ---------- Amazon: CSV ----------
test("cabeçalhos reais: Total Amount, Original Quantity e Payment Method Type são reconhecidos (e os antigos continuam valendo)", () => {
  const r = N.amLerHistorico(csv(FIS1));
  assert.equal(r.ok, true); assert.deepEqual(r.cabecalhos_ausentes, []);
  const p = r.pedidos[0];
  assert.deepEqual([p.numero, p.data, p.total_pago, p.itens[0].qtd, p.pagamento], ["701-1000001-0000001", "2023-05-10", 48, 1, "Visa final 1111"]);
  assert.ok(!r.cabecalhos_ignorados.includes("total amount") && !r.cabecalhos_ignorados.includes("original quantity") && !r.cabecalhos_ignorados.includes("payment method type"));
  const antigo = "Order ID,Order Date,Unit Price,Total Owed,Quantity,Payment Instrument Type,Product Name\n701-1111111-2222222,2024-01-02T10:00:00Z,10.00,20.00,2,Visa,Produto Antigo\n";
  const a = N.amLerHistorico(antigo).pedidos[0];
  assert.deepEqual([a.total_pago, a.itens[0].qtd], [20, 2]);
});
test("pedido com um item: valores, data original, status e natureza", () => {
  const p = ped(N.amLerHistorico(csv(FIS1)), "701-1000001-0000001");
  assert.deepEqual([p.subtotal, p.frete, p.taxas, p.desconto, p.total_pago], [40, 8, 0, 0, 48]);
  assert.equal(p.data_original, "2023-05-10T14:00:00Z"); assert.equal(p.status_norm, "concluido"); assert.equal(p.natureza, "fisica");
  assert.equal(p.itens.length, 1); assert.equal(p.itens[0].codigo, "B0AAAAAAA1");
});
test("pedido com vários itens: agrupa pelo número, soma as linhas uma vez só e separa frete, imposto e desconto", () => {
  const r = N.amLerHistorico(csv(FIS2A, FIS2B));
  assert.equal(r.pedidos.length, 1);
  const p = r.pedidos[0];
  assert.equal(p.itens.length, 2);
  assert.deepEqual([p.subtotal, p.frete, p.taxas, p.desconto, p.total_pago], [175, 5, 12, 5, 187]);
  assert.equal(p.subtotal - p.desconto + p.frete + p.taxas, p.total_pago, "a conta fecha");
  assert.equal(N.coConferir(p).ok, true, "passa na conferência que já existe");
});
test("quantidade maior que 1 é preservada (e vale no preço da linha)", () => {
  const p = ped(N.amLerHistorico(csv(FIS2A, FIS2B)), "701-1000002-0000002");
  const cabo = p.itens.find((i) => i.descricao === "Cabo USB Exemplo");
  assert.deepEqual([cabo.qtd, cabo.unitario, cabo.total, cabo.total_linha, cabo.frete, cabo.desconto_linha], [3, 25, 75, 75, 5, 5]);
  const fone = p.itens.find((i) => i.descricao === "Fone Exemplo");
  assert.deepEqual([fone.qtd, fone.impostos, fone.total_linha], [1, 12, 112]);
});
test("valores no formato brasileiro (1.100,00) e datas dd/mm/aaaa", () => {
  const p = ped(N.amLerHistorico(csv(BR)), "701-1000006-0000006");
  assert.deepEqual([p.itens[0].unitario, p.itens[0].qtd, p.total_pago, p.data], [1100, 2, 2200, "2024-09-10"]);
});
test("cancelado, autorizado e concluído são distintos; cancelado não conta no total", () => {
  const r = N.amLerHistorico(csv(FIS1, CANC, AUTO));
  assert.equal(ped(r, "701-1000003-0000003").status_norm, "cancelado");
  assert.equal(ped(r, "701-1000003-0000003").total_pago, 0, "linha cancelada não soma");
  assert.equal(ped(r, "701-1000004-0000004").status_norm, "autorizado");
  assert.equal(ped(r, "701-1000001-0000001").status_norm, "concluido");
  assert.deepEqual(N.coLerCSV(csv(FIS1, CANC, AUTO)).map((p) => p.numero), ["701-1000001-0000001", "701-1000004-0000004"], "coLerCSV (tela atual) deixa o cancelado de fora");
  const ind = N.amIndicadores(r.pedidos);
  assert.deepEqual([ind.pedidos, ind.cancelados, ind.valor], [2, 1, 108]);
  assert.deepEqual(ind.por_status, { concluido: 1, cancelado: 1, autorizado: 1 });
});
test("digital e físico: digital pelo envio 'Digital'/'Not Applicable'; físico por rastreio, data de envio ou entrega; sem sinal fica indefinido", () => {
  const r = N.amLerHistorico(csv(FIS1, DIG));
  assert.equal(ped(r, "D01-2000005-0000005").natureza, "digital"); assert.equal(ped(r, "D01-2000005-0000005").categoria, "Compras online · Digital");
  assert.equal(ped(r, "701-1000001-0000001").natureza, "fisica");
  assert.equal(N.amLerHistorico(csv(DIG), { arquivo: "Digital-Ordering/Digital Items.csv" }).pedidos[0].natureza, "digital");
  const vago = lin("701-1000009-0000009", "2023-01-01T00:00:00Z", "10.00", "0", "0", "0", "10.00", "Visa", "Closed", "", "", "", "", "Item Qualquer", "1", "B0VAGO0001");
  const v = N.amLerHistorico(csv(vago)).pedidos[0];
  assert.equal(v.natureza, "indefinida"); assert.equal(v.tratamento, "referencia_historica", "indefinida não entra nas despesas");
  const mix = N.amLerHistorico(csv(FIS1.replace("701-1000001-0000001", "701-1000010-0000010"), DIG.replace("D01-2000005-0000005", "701-1000010-0000010").replace("2022-03-15", "2023-05-10")));
  assert.equal(mix.pedidos[0].natureza, "mista"); assert.equal(mix.pedidos[0].tratamento, "misto");
});
test("total repetido em todas as linhas do pedido não é somado duas vezes", () => {
  const a = lin("701-1000011-0000011", "2023-02-01T00:00:00Z", "30.00", "0", "0", "0", "70.00", "Visa", "Closed", "Delivered", "2023-02-03", "S", "T1", "Item A", "1", "B0REP00001");
  const b = lin("701-1000011-0000011", "2023-02-01T00:00:00Z", "40.00", "0", "0", "0", "70.00", "Visa", "Closed", "Delivered", "2023-02-03", "S", "T2", "Item B", "1", "B0REP00002");
  const p = N.amLerHistorico(csv(a, b)).pedidos[0];
  assert.equal(p.total_pago, 70); assert.match(p.avisos.join(" "), /contado uma vez/);
});
test("cabeçalhos ausentes ou inesperados: erro claro, sem exceção; colunas desconhecidas só são listadas", () => {
  const sem = N.amLerHistorico("Order ID,Product Name\n701-1-1,X\n");
  assert.equal(sem.ok, false); assert.deepEqual(sem.pedidos, []); assert.deepEqual(sem.cabecalhos_ausentes, ["Order Date", "Total Amount"]); assert.match(sem.erro, /ausentes/);
  assert.equal(N.amLerHistorico("").ok, false); assert.equal(N.amLerHistorico(null).ok, false);
  assert.deepEqual(N.coLerCSV("Order ID,Product Name\n701-1-1,X\n"), []);
  const extra = N.amLerHistorico(CAB + ",Coluna Nova\n" + FIS1 + ",qualquer\n");
  assert.equal(extra.ok, true); assert.ok(extra.cabecalhos_ignorados.includes("coluna nova")); assert.equal(extra.pedidos.length, 1);
});
test("linhas inválidas são puladas e contadas; o resto da importação segue", () => {
  const semId = lin("", "2023-05-10T00:00:00Z", "1", "0", "0", "0", "1.00", "Visa", "Closed", "Delivered", "2023-05-11", "S", "T", "Sem id", "1", "B0X");
  const dataRuim = lin("701-1000020-0000020", "ontem", "1", "0", "0", "0", "1.00", "Visa", "Closed", "Delivered", "2023-05-11", "S", "T", "Data ruim", "1", "B0X");
  const totalRuim = lin("701-1000021-0000021", "2023-05-10T00:00:00Z", "1", "0", "0", "0", "abc", "Visa", "Closed", "Delivered", "2023-05-11", "S", "T", "Total ruim", "1", "B0X");
  const qtdRuim = lin("701-1000022-0000022", "2023-05-10T00:00:00Z", "1", "0", "0", "0", "1.00", "Visa", "Closed", "Delivered", "2023-05-11", "S", "T", "Qtd ruim", "0.5", "B0X");
  const negativo = lin("701-1000023-0000023", "2023-05-10T00:00:00Z", "1", "0", "0", "0", "-9.00", "Visa", "Closed", "Delivered", "2023-05-11", "S", "T", "Estorno", "1", "B0X");
  const r = N.amLerHistorico(csv(semId, FIS1, dataRuim, totalRuim, qtdRuim, negativo, "so,duas,colunas"));
  assert.equal(r.ok, true); assert.equal(r.pedidos.length, 1); assert.equal(r.pedidos[0].numero, "701-1000001-0000001");
  assert.equal(r.invalidas.length, 6); assert.match(r.invalidas.map((x) => x.motivo).join("|"), /sem número do pedido.*data.*valor total.*quantidade.*negativo/);
  assert.match(r.avisos.join(" "), /6 linhas foram ignoradas/);
});

// ---------- Amazon: indicadores ----------
test("indicadores: físico histórico e digital separados, evolução mensal e anual, produtos e quantidade de pedidos", () => {
  const r = N.amLerHistorico(csv(FIS1, FIS2A, FIS2B, DIG, CANC, AUTO));
  const x = N.amIndicadores(r.pedidos);
  assert.deepEqual([x.pedidos, x.cancelados, x.itens, x.unidades, x.valor], [4, 1, 5, 7, 314.9]);
  assert.deepEqual(x.por_natureza.fisica, { pedidos: 3, itens: 4, unidades: 6, valor: 295 });
  assert.deepEqual(x.por_natureza.digital, { pedidos: 1, itens: 1, unidades: 1, valor: 19.9 });
  assert.deepEqual(x.por_mes.map((m) => [m.mes, m.pedidos, m.valor]), [["2022-03", 1, 19.9], ["2023-05", 1, 48], ["2023-06", 1, 187], ["2023-08", 1, 60]]);
  assert.deepEqual(x.por_ano.map((a) => [a.ano, a.pedidos, a.valor, a.fisica, a.digital]), [["2022", 1, 19.9, 0, 19.9], ["2023", 3, 295, 295, 0]]);
  assert.deepEqual([x.primeiro, x.ultimo], ["2022-03-15", "2023-08-05"]);
  assert.equal(x.produtos[0].nome, "Fone Exemplo"); assert.equal(x.produtos[0].valor, 112);
  const cabo = x.produtos.find((p) => p.nome === "Cabo USB Exemplo"); assert.deepEqual([cabo.qtd, cabo.pedidos, cabo.natureza], [3, 1, "fisica"]);
});

// ---------- Amazon: ZIP, sanitização ----------
test("ZIP: só os CSVs de pedidos são lidos; imagens de entrega e o resto são ignorados", () => {
  const s = N.amSelecionarArquivos(["Your Orders/Order History.csv", "Retail.OrderHistory.1/Retail.OrderHistory.1.csv", "Digital-Ordering.1/Digital Items.csv", "Entregas/foto_entrega_1.JPEG", "Entregas/assinatura.png", "Your Addresses/Addresses.csv", "__MACOSX/Order History.csv", "leia-me.txt", "pasta/"]);
  assert.deepEqual(s.usar.map((u) => u.nome), ["Your Orders/Order History.csv", "Retail.OrderHistory.1/Retail.OrderHistory.1.csv", "Digital-Ordering.1/Digital Items.csv"]);
  assert.deepEqual(s.usar.map((u) => u.digital), [false, false, true]);
  assert.equal(s.ignorar.length, 5); assert.match(s.ignorar[0].motivo, /imagem/); assert.ok(s.ignorar.some((i) => /Addresses/.test(i.nome) && /não é de pedidos/.test(i.motivo)));
  const imp = N.amImportar([{ nome: "Order History.csv", texto: csv(FIS1, FIS1) }, { nome: "fotos/entrega.jpg", texto: "binário" }, { nome: "Digital Items.csv", texto: "Foo,Bar\n1,2\n" }]);
  assert.equal(imp.pedidos.length, 1, "pedido repetido vale uma vez"); assert.equal(imp.erros.length, 1); assert.equal(imp.arquivos_ignorados.length, 1);
});
test("sanitização: o CSV reconstruído tem só os campos permitidos e nenhum dado pessoal", () => {
  const sujo = lin("701-1000030-0000030", "2023-09-01T10:00:00Z", "15.00", "0", "0", "0", "15.00", '"Visa - 4444"', "Closed", "Delivered", "2023-09-02", "S", "TRK-SECRETO", "Capa de fone (contato joao@example.com)", "1", "B0SUJO0001");
  const formula = lin("701-1000031-0000031", "2023-09-01T10:00:00Z", "5.00", "0", "0", "0", "5.00", "Visa", "Closed", "Delivered", "2023-09-02", "S", "TRK2", "=HYPERLINK(\"http://x\")", "1", "B0SUJO0002");
  const out = N.amReconstruirCSV(csv(FIS1, sujo, formula));
  assert.equal(out.ok, true); assert.equal(out.linhas, 3);
  assert.equal(out.csv.split("\n")[0], N.AM_CAMPOS_SAIDA.join(","));
  for (const proibido of ["Rua Ficticia", "01234-567", "Fulano", "-23.5", "-46.6", "TRK", "joao@example.com", "Billing", "Latitude", "Standard"]) assert.ok(!out.csv.includes(proibido), "vazou: " + proibido);
  assert.match(out.csv, /\[removido\]/); assert.match(out.csv, /'=HYPERLINK/, "fórmula de planilha neutralizada");
  assert.match(out.csv, /Visa final 1111/, "só bandeira e final do cartão");
  assert.deepEqual(N.amAuditarSanitizado(out.csv), { ok: true, achados: [] });
  assert.equal(N.amAuditarSanitizado(out.csv.replace("Visa final 1111", "Visa joao@example.com")).ok, false);
  assert.equal(N.amAuditarSanitizado(CAB + "\n" + FIS1).ok, false, "o original nunca passa na auditoria");
});
test("o CSV reconstruído pode ser lido de novo e dá os mesmos pedidos (é ele que iria para o cofre)", () => {
  const a = N.amLerHistorico(csv(FIS1, FIS2A, FIS2B, DIG, CANC, AUTO));
  const b = N.amLerHistorico(N.amReconstruirCSV(csv(FIS1, FIS2A, FIS2B, DIG, CANC, AUTO)).csv);
  const res = (r) => r.pedidos.map((p) => [p.numero, p.data, p.status_norm, p.natureza, p.total_pago, p.subtotal, p.frete, p.taxas, p.desconto, p.itens.map((i) => i.qtd).join("+")]);
  assert.deepEqual(res(b), res(a)); assert.deepEqual(N.amIndicadores(b.pedidos).por_mes, N.amIndicadores(a.pedidos).por_mes);
});

// ---------- Reembolsos ----------
const COMPRA = { id: "c1", loja: "amazon", numero: "701-1000002-0000002", total_pago: 187, data: "2023-06-01" };
const RE = { id: "r1", numero: "701-1000002-0000002", valor: 50, estado: "recebido", recebido_confirmado: true, recebido_em: "2026-11-04" };
test("reembolso solicitado ou aprovado NÃO gera crédito", () => {
  for (const estado of ["solicitado", "aprovado"]) {
    const o = N.coReembCreditos([{ ...RE, estado }], [COMPRA]);
    assert.equal(o.creditos.length, 0); assert.match(o.sem_credito[0].motivo, /ainda não é crédito/);
  }
  const semConf = N.coReembCreditos([{ ...RE, recebido_confirmado: false }], [COMPRA]);
  assert.equal(semConf.creditos.length, 0); assert.match(semConf.sem_credito[0].motivo, /não confirmado/);
});
test("reembolso recebido e confirmado gera crédito no mês em que o dinheiro entrou, ligado ao pedido original", () => {
  const o = N.coReembCreditos([RE], [COMPRA]);
  assert.equal(o.creditos.length, 1);
  assert.deepEqual([o.creditos[0].mes, o.creditos[0].valor, o.creditos[0].compra_id, o.creditos[0].numero], ["2026-11", 50, "c1", "701-1000002-0000002"], "o mês é o do recebimento, não o do pedido (2023-06)");
  assert.equal(N.coReembCreditos([{ ...RE, recebido_em: "2026-12-01" }], [COMPRA]).creditos[0].mes, "2026-12");
  const sem = N.coReembCreditos([{ ...RE, numero: "999-0000000-0000000" }], [COMPRA]);
  assert.equal(sem.creditos.length, 0); assert.match(sem.sem_credito[0].motivo, /não encontrado/);
  assert.equal(N.coReembVincular({ numero: "701-1000002-0000002", canal: "shopee" }, [COMPRA]).ok, false, "o canal também precisa bater");
});
test("reembolso não duplica crédito: mesmo reembolso na lista, já lançado antes, ou acima do valor pago", () => {
  const dup = N.coReembCreditos([RE, { ...RE }], [COMPRA]);
  assert.equal(dup.creditos.length, 1); assert.match(dup.sem_credito[0].motivo, /já lançado/);
  const antes = N.coReembCreditos([RE], [COMPRA], dup.creditos);
  assert.equal(antes.creditos.length, 0); assert.match(antes.sem_credito[0].motivo, /já lançado/);
  const sem_id = { numero: RE.numero, valor: 30, estado: "recebido", recebido_confirmado: true, recebido_em: "2026-11-04" };
  assert.equal(N.coReembCreditos([sem_id, { ...sem_id }], [COMPRA]).creditos.length, 1, "sem id, a chave é pedido + valor + data");
  const exc = N.coReembCreditos([{ ...RE, id: "r2", valor: 150 }, { ...RE, id: "r3", valor: 100 }], [COMPRA]);
  assert.equal(exc.creditos.length, 1); assert.match(exc.sem_credito[0].motivo, /passariam do valor pago/);
  assert.equal(N.coReembCreditos([{ ...RE, recebido_em: "04/11/2026" }], [COMPRA]).creditos.length, 0);
});

// ---------- Lote 3 · autorizado = pendente (fora das despesas efetivas) ----------
const hojeD = (cs) => N.coDespesas(cs);
test("status: cancelado não contabiliza; autorizado é pendente; efetivado/enviado/entregue contabiliza", () => {
  const base = { id: "x", data: "2026-10-03", loja: "amazon", total_pago: 95 };
  assert.deepEqual(hojeD([{ ...base, status: "cancelado" }]), [], "cancelado fora");
  assert.deepEqual(hojeD([{ ...base, status: "autorizado" }]), [], "autorizado fora das despesas efetivas");
  const k = N.coClassificar({ ...base, status: "autorizado" });
  assert.deepEqual([k.tratamento, k.situacao, k.valor_despesa, k.valor_pendente], ["pendente", "pendente", 0, 95], "o valor fica visível como pendente");
  for (const s of ["concluido", "efetivado", "enviado", "entregue"]) assert.equal(hojeD([{ ...base, status: s }]).length, 1, s + " contabiliza");
  assert.equal(N.coClassificar({ ...base, status_norm: "cancelado" }).tratamento, "cancelado");
  assert.equal(N.coClassificar({ canal: "shopee", status: "autorizado", total_pago: 10 }).tratamento, "pendente", "vale para qualquer canal");
});
test("status: registro antigo não muda (sem status, cancelamento/reembolso informado seguem como despesa até o dono confirmar)", () => {
  const base = { id: "x", data: "2026-10-03", loja: "amazon", total_pago: 95 };
  for (const status of [undefined, null, "cancelamento_informado", "reembolso_informado"]) assert.equal(hojeD([{ ...base, status }]).length, 1, String(status));
  assert.equal(N.coSituacao({ loja: "amazon", status: "algum_texto_antigo" }), "efetiva", "fora do histórico, o legado não é reinterpretado");
});
test("status desconhecido ou ausente no histórico nunca vira compra efetivada sozinho", () => {
  for (const c of [{ status_norm: "desconhecido" }, { status: "Em análise" }, {}]) {
    const k = N.coClassificar({ canal: "amazon", historico: true, natureza: "digital", total_pago: 20, ...c });
    assert.equal(k.tratamento, "pendente"); assert.equal(k.valor_despesa, 0);
  }
  const p = N.amLerHistorico("Order ID,Order Date,Unit Price,Total Amount,Product Name,Order Status,Shipping Option\n701-1-2222222,2023-01-01T00:00:00Z,9.90,9.90,Ebook X,Em processamento,Digital\n").pedidos[0];
  assert.equal(p.status_norm, "desconhecido"); assert.equal(N.coDespesas([p]).length, 0);
});
test("digital histórico autorizado não contabiliza; efetivado contabiliza em 'Compras online · Digital'; físico histórico fica só como referência", () => {
  const dig = (st) => lin("D01-3000001-0000001", "2022-04-01T10:00:00Z", "19.90", "0", "0", "0", "19.90", "Visa", st, "Not Applicable", "Not Applicable", "Digital", "", "Livro Ficticio Kindle", "1", "B0DIG00001");
  const aut = N.amLerHistorico(csv(dig("Authorized"))).pedidos[0], ok = N.amLerHistorico(csv(dig("Closed"))).pedidos[0];
  assert.deepEqual([aut.natureza, aut.status_norm, aut.tratamento], ["digital", "autorizado", "pendente"]);
  assert.deepEqual(N.coDespesas([aut]), []);
  assert.equal(N.coClassificar(aut).valor_pendente, 19.9);
  assert.deepEqual(N.coDespesas([ok]).map((d) => [d.v, d.cat]), [[19.9, "Compras online · Digital"]]);
  for (const st of ["Closed", "Authorized"]) {
    const f = N.amLerHistorico(csv(lin("701-3000002-0000002", "2022-04-01T10:00:00Z", "40.00", "0", "0", "0", "40.00", "Visa", st, "Delivered", "2022-04-02", "S", "TRK9", "Item Fisico", "1", "B0FIS00001"))).pedidos[0];
    assert.deepEqual(N.coDespesas([f]), [], "físico histórico nunca entra nas despesas (" + st + ")");
    assert.equal(N.coClassificar(f).valor_referencia, 40);
  }
  const ind = N.amIndicadores(N.amLerHistorico(csv(dig("Authorized"), FIS1)).pedidos);
  assert.equal(ind.valor_pendente, 19.9);
});
test("finanças do mês: pendente e referência histórica não somam", () => {
  const f = { compras: { ok: true, v: [{ data: "2026-11-02", total_pago: 100, loja: "amazon", status: "autorizado" }, { data: "2026-11-03", total_pago: 40, loja: "amazon" }, { data: "2026-11-04", total_pago: 60, loja: "amazon", status: "entregue" }] } };
  assert.equal(N.hojeFinancas(f, "2026-11-05").total, 100);
});
