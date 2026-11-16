// Mercado Livre · print da tela "Detalhes da transação": leitura do texto (OCR) em pedido com itens, desconto, frete e total.
// Pedido fictício construído a partir do formato da tela; sem rede e sem custo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const HOJE = new Date(2026, 10, 16);
const PRINT = `Detalhes da transação
14 de novembro | #2000016048898959
Limpador Perfumado De Ambientes Coala - Or… R$ 71,70
1 unidade
Milho Verde Em Conserva Pronto Para Servir Lata 1… R$ 8
1 unidade
Refrigerante Coca-cola Original Pet 200ml - 12 … R$ 27,48
1 unidade
Ketchup Heinz Tradicional 1,033kg R$ 24,99
1 unidade
Fraldas Pampers Confort Sec M X 70 Unidade… R$ 82,90
1 unidade
Desconto à vista - R$ 75,90
Frete Grátis
Total pago 1x R$ 139,17
1x R$ 139,17
Mastercard **** 7648
# 189609158104
Constará como MERCADOLIVRE*MERCADOLIVRE na fatura do seu cartão.`;

test("print do Mercado Livre: número, data, itens, desconto, frete, total e cartão", () => {
  const r = N.coLerTexto(PRINT, HOJE);
  assert.equal(r.loja, "mercadolivre");
  assert.equal(r.numero, "2000016048898959");   // o # do pedido, não o # do pagamento
  assert.equal(r.data, "2026-11-14");
  assert.equal(r.itens.length, 5);               // "Desconto" não vira produto
  assert.equal(r.subtotal, 215.07);
  assert.equal(r.desconto, 75.9);
  assert.equal(r.frete, 0);
  assert.equal(r.total_pago, 139.17);
  assert.equal(r.pagamento, "Mastercard final 7648");
  assert.deepEqual(r.avisos, []);
});

test("print do Mercado Livre: categorias sugeridas e garrafa PET não é animal", () => {
  const c = Object.fromEntries(N.coLerTexto(PRINT, HOJE).itens.map((i) => [i.descricao.split(" ")[0], i.categoria]));
  assert.equal(c.Limpador, "Casa");
  assert.equal(c.Refrigerante, "Alimentação");
  assert.equal(c.Fraldas, "Bebê");
  assert.equal(N.coCategoria("Ração Pet para cães"), "Pet");
});

test("print do Mercado Livre: data sem ano no futuro vira o ano anterior; total que não bate gera aviso", () => {
  assert.equal(N.coLerTexto(PRINT, new Date(2026, 0, 5)).data, "2025-11-14");
  const r = N.coLerTexto(PRINT.replace("Total pago 1x R$ 139,17", "Total pago 1x R$ 150,00"), HOJE);
  assert.equal(r.avisos.length, 1);
});

test("texto de outras lojas continua pelo leitor geral", () => {
  const r = N.coLerTexto("Amazon.com.br Pedido feito em 3 de outubro de 2026 Pedido nº 701-0000001-0000002\nTotal do pedido: R$ 50,00", HOJE);
  assert.equal(r.loja, "amazon");
  assert.equal(r.numero, "701-0000001-0000002");
});
