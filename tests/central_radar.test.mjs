// Central de Compras × Radar (nucleo.js pc* e rdDiferenca): vínculo produto↔Radar, sugestões, comparação INDICATIVA entre preço pago e preço descoberto, diferença de apresentação e resumo de ofertas.
// Só funções puras e dados de teste: sem banco, sem rede, sem SerpApi. Regra de ouro: o preço descoberto nunca vira preço pago.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";

test("vínculo: chave pelo nome normalizado; só ids válidos entram; vincular e desvincular não mexem no original; lixo é ignorado", () => {
  assert.equal(N.pcChave("Pão Francês"), N.pcChave("pao  frances"), "acento e caixa não separam o mesmo produto");
  const bruto = { [N.pcChave("Pão Francês")]: A, "n:x": "nao-e-uuid", "sem-prefixo": A, [N.pcChave("Leite")]: 42 };
  assert.deepEqual(N.pcVinculos(bruto), { [N.pcChave("Pão Francês")]: A }); assert.deepEqual(N.pcVinculos(null), {}); assert.deepEqual(N.pcVinculos([A]), {}); assert.deepEqual(N.pcVinculos("x"), {});
  const v = N.pcVincular({}, "Pão Francês", A); assert.deepEqual(v.vinculos, { [N.pcChave("Pão Francês")]: A }); assert.ok(!v.erro);
  assert.ok(N.pcVincular({}, "Pão Francês", "").erro, "sem produto do Radar não vincula"); assert.ok(N.pcVincular({}, "  ", A).erro); assert.ok(N.pcVincular({}, "Pão", "abc").erro, "id inválido");
  const original = { [N.pcChave("Leite")]: B }; const dois = N.pcVincular(original, "Pão Francês", A).vinculos; assert.equal(Object.keys(original).length, 1, "o objeto recebido não é alterado"); assert.equal(Object.keys(dois).length, 2);
  assert.deepEqual(N.pcDesvincular(dois, "pao frances"), { [N.pcChave("Leite")]: B });
  const itens = [{ id: A, nome: "Pão francês 50 g" }, { id: B, nome: "Leite" }];
  assert.equal(N.pcItemDe(dois, "Pão Francês", itens).id, A); assert.equal(N.pcItemDe(dois, "Café", itens), null); assert.equal(N.pcItemDe(dois, "Pão Francês", [itens[1]]), null, "vínculo para item que não existe mais não aparece");
});

test("sugestão: só sugere (nunca vincula), exige palavras em comum, ignora ligações e arquivados, ordena pela semelhança", () => {
  const itens = [{ id: A, nome: "Pão francês 50 g", ativo: true }, { id: B, nome: "Pão de forma integral", ativo: true }, { id: "33333333-3333-4333-8333-333333333333", nome: "Fone XM-4", ativo: true }, { id: "44444444-4444-4444-8444-444444444444", nome: "Pão francês", ativo: false }];
  const s = N.pcSugerirItens("Pão Francês", itens); assert.deepEqual(s.map((x) => x.item.id), [A], "o arquivado e o sem relação ficam de fora; 'pão de forma' é parecido demais só no 'pão' e não passa de 40%");
  assert.ok(s[0].pontos >= 40 && s[0].comuns === 2); assert.deepEqual(N.pcSugerirItens("", itens), []); assert.deepEqual(N.pcSugerirItens("Pão", []), []);
  assert.deepEqual(N.pcTokens("Pão de Forma 500g com sem"), ["pao", "forma"], "sem ligações e sem palavras com número (tamanhos)");
});

test("comparação indicativa: só com a mesma base (kg↔100 g, L↔100 ml, un↔unidade); nada é convertido às cegas e nada é gravado", () => {
  const kgg = N.pcComparar({ unitario: 30, unidade: "kg" }, { preco_por_medida: 2.5, base_medida: "100 g" });
  assert.deepEqual([kgg.comparavel, kgg.base, kgg.pagoNaBase, kgg.ofertaNaBase, kgg.dif, kgg.leitura], [true, "100 g", 3, 2.5, -0.5, "abaixo do que você pagou"]); assert.ok(kgg.pct < -0.16 && kgg.pct > -0.17);
  assert.equal(N.pcComparar({ unitario: 8, unidade: "L" }, { preco_por_medida: 0.8, base_medida: "100 ml" }).pagoNaBase, 0.8); assert.equal(N.pcComparar({ unitario: 8, unidade: "L" }, { preco_por_medida: 0.8, base_medida: "100 ml" }).leitura, "parecido");
  assert.equal(N.pcComparar({ unitario: 1.5, unidade: "un" }, { preco_por_medida: 2, base_medida: "unidade" }).leitura, "acima do que você pagou");
  assert.equal(N.pcComparar({ unitario: 6, unidade: "un" }, { preco_por_medida: 2.5, base_medida: "100 g" }).comparavel, false, "unidade × peso não se compara"); assert.match(N.pcComparar({ unitario: 6, unidade: "un" }, { preco_por_medida: 2.5, base_medida: "100 g" }).motivo, /100 g.*un/);
  for (const [p, o, m] of [[null, { preco_por_medida: 1, base_medida: "100 g" }, /sem preço pago/], [{ unitario: 0, unidade: "kg" }, { preco_por_medida: 1, base_medida: "100 g" }, /sem preço pago/], [{ unitario: 5, unidade: "kg" }, { preco_por_medida: null, base_medida: "100 g" }, /não tem preço por medida/], [{ unitario: 5, unidade: "caixa" }, { preco_por_medida: 1, base_medida: "100 g" }, /sem equivalência/]]) { const r = N.pcComparar(p, o); assert.equal(r.comparavel, false); assert.match(r.motivo, m); }
  assert.deepEqual(N.pcBase("KG"), { base: "100 g", fator: 0.1 }); assert.equal(N.pcBase("xícara"), null);
});

test("diferença em relação ao procurado: cada classificação diz o que tem de diferente; o individual não precisa; nada é inventado", () => {
  assert.equal(N.rdDiferenca({ tipo_oferta: "individual" }), ""); assert.equal(N.rdDiferenca(null), "");
  assert.match(N.rdDiferenca({ tipo_oferta: "kit_mesmo_produto", quantidade: 2, medida_valor: 908, medida_unidade: "g" }), /Kit com 2 unidades \(908 g no total\).*não é o da unidade avulsa/);
  assert.match(N.rdDiferenca({ tipo_oferta: "kit_mesmo_produto", quantidade: 30, medida_valor: null }), /Kit com 30 unidades:/);
  assert.match(N.rdDiferenca({ tipo_oferta: "combo", composicao: [{ descricao: "Creme CH-02", quantidade: 1 }, { descricao: "Sérum NC-10", quantidade: 2 }] }), /Combo \(Creme CH-02 \+ 2 × Sérum NC-10\).*não é este produto avulso/);
  assert.match(N.rdDiferenca({ tipo_oferta: "outra_apresentacao", medida_valor: 250, medida_unidade: "g" }), /Outra apresentação \(250 g\).*compare pelo preço por medida/); assert.match(N.rdDiferenca({ tipo_oferta: "outra_apresentacao", medida_valor: 1500, medida_unidade: "ml" }), /\(1,5 L\)/);
  assert.match(N.rdDiferenca({ tipo_oferta: "relacionado" }), /outro produto.*não este/); assert.match(N.rdDiferenca({ tipo_oferta: "indeterminado" }), /não deu para ligar/);
});

test("resumo de ofertas: ignoradas e lojas do anúncio ficam de fora; conta 'do produto' × relacionadas; menor preço por medida só entre as do produto, por base", () => {
  const c = (o) => Object.assign({ pai_externo: null, decisao: "pendente", loja: "Loja" }, o);
  const r = N.pcResumoOfertas([c({ tipo_oferta: "individual", preco_por_medida: 10.79, base_medida: "100 g", loja: "Magalu" }), c({ tipo_oferta: "kit_mesmo_produto", preco_por_medida: 9.5, base_medida: "100 g", decisao: "acompanhando" }), c({ tipo_oferta: "individual", preco_por_medida: 1.7, base_medida: "unidade" }),
    c({ tipo_oferta: "relacionado", preco_por_medida: 0.5, base_medida: "100 g" }), c({ tipo_oferta: "individual", preco_por_medida: 1, base_medida: "100 g", decisao: "ignorado" }), c({ tipo_oferta: "individual", preco_por_medida: 1, base_medida: "100 g", pai_externo: "x" })]);
  assert.deepEqual([r.total, r.doProduto, r.relacionadas, r.acompanhando], [4, 3, 1, 1]); assert.deepEqual(r.melhorPorBase["100 g"], { valor: 9.5, tipo: "kit_mesmo_produto", loja: "Loja" }, "o relacionado (0,50) não entra no melhor preço"); assert.equal(r.melhorPorBase.unidade.valor, 1.7);
  assert.deepEqual(N.pcResumoOfertas(null), { total: 0, doProduto: 0, relacionadas: 0, acompanhando: 0, porTipo: {}, melhorPorBase: {} }); assert.deepEqual(N.PC_TIPOS_DO_PRODUTO, ["individual", "kit_mesmo_produto", "combo", "outra_apresentacao"]);
});

test("categoria: produtos da categoria com último preço pago, menor pago e compras; só o que foi comprado; outras categorias ficam de fora", () => {
  const L = (id, data, produto, categoria, un, q, vu, mercado = "Confiança") => ({ id, data, mk: data.slice(0, 7), produto, categoria, unidade: un, quantidade: q, valor_unitario: vu, valor_total: Math.round(q * vu * 100) / 100, mercado, nota: data + "|" + mercado });
  const rows = [L("1", "2026-10-01", "Pão Francês", "Padaria", "kg", 0.5, 18), L("2", "2026-11-02", "Pão Francês", "Padaria", "kg", 0.4, 16.5, "Reinaldo"), L("3", "2026-11-02", "Bolo de Fubá", "Padaria", "un", 1, 12), L("4", "2026-11-03", "Leite", "Mercearia", "un", 6, 5)];
  const c = N.pcCategoria(rows, "Padaria"); assert.equal(c.categoria, "Padaria"); assert.deepEqual(c.produtos.map((p) => p.nome).sort(), ["Bolo de Fubá", "Pão Francês"]); assert.equal(c.compras, 3, "notas diferentes (data + mercado)");
  const pao = c.produtos.find((p) => p.nome === "Pão Francês"); assert.deepEqual([pao.ultimo.preco, pao.ultimo.data, pao.ultimo.mercado, pao.menor, pao.compras, pao.unidade], [16.5, "2026-11-02", "Reinaldo", 16.5, 2, "kg"]);
  assert.deepEqual(N.pcCategoria(rows, "Inexistente").produtos, []); assert.ok(!c.produtos.some((p) => p.nome === "Leite"));
});
