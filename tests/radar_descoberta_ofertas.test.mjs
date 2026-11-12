// Radar de Preços · descoberta de ofertas: leitura, classificação e comparação dos anúncios do provedor (supabase/functions/radar/ofertas.ts). Sem rede, sem banco, sem IA, sem custo.
// Os títulos e preços abaixo são os que o Google Shopping devolveu na consulta real de 11/11/2026 (produtos públicos de loja; nenhum dado pessoal). Regra do dono: NADA é descartado por quantidade ou composição diferente.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classificar, medidasDe, quantidadeDe, codigosDe, precoPorMedida, numeroBRL, linkSeguro, candidatosDoShopping, lojasDoProduto, mesclarCandidato, agrupar, ordenar, variantesDeConsulta, chaveDedup, observacaoDoCandidato, deveRegistrarObservacao, chaveObservacao } from "../supabase/functions/radar/ofertas.ts";

const INT = { nome: "Creme Hidratante Corporal Principia CH-02", marca: "Principia", modelo: "CH-02", apresentacao: "454 g", gtin: "0042882100690" };
const AGORA = "2026-11-11T21:32:20.000Z";

test("peso, volume e quantidade escritos no título (kg e L viram g e ml; promoção não é quantidade)", () => {
  assert.deepEqual(medidasDe("Creme 454g"), [{ valor: 454, unidade: "g" }]); assert.deepEqual(medidasDe("Sabão 1,5 kg"), [{ valor: 1500, unidade: "g" }]);
  assert.deepEqual(medidasDe("Suco 2 L"), [{ valor: 2000, unidade: "ml" }]); assert.deepEqual(medidasDe("Serum 30ml"), [{ valor: 30, unidade: "ml" }]); assert.deepEqual(medidasDe("CH-02 250Gr"), [{ valor: 250, unidade: "g" }]);
  assert.deepEqual(medidasDe("Kit 250g + 454g").map((m) => m.valor), [250, 454]); assert.deepEqual(medidasDe("Principia CH-02"), []);
  assert.equal(quantidadeDe("Kit 2 Creme Hidratante Principia CH-02 454g").qtd, 2); assert.equal(quantidadeDe("Kit com 3 unidades").qtd, 3); assert.equal(quantidadeDe("Caixa com 12").qtd, 12);
  assert.equal(quantidadeDe("2x 454g").qtd, 2); assert.equal(quantidadeDe("Trio antissinais").qtd, 3); assert.equal(quantidadeDe("Kit Principia AH-2 - Sérum Facial (2 Produtos)").qtd, 2);
  assert.equal(quantidadeDe("Leve 2 e pague 1").qtd, 1, "promoção não é quantidade"); assert.equal(quantidadeDe("Creme CH-02 454g").qtd, 1, "o 02 do modelo não é quantidade");
  assert.deepEqual(codigosDe("Kit CH-01 + CH-02 e PS-02, Mix-02 AH-2"), ["ch01", "ch02", "ps02", "mix02", "ah2"]);
});

test("classificação sem descartar: individual, kit do mesmo produto, combo, outra apresentação, relacionado e indeterminado", () => {
  const c = (t, loja = null) => classificar(t, loja, INT);
  const a = c("Creme Hidratante Principia Ch-02", "principiaskin.com"); assert.equal(a.tipo, "individual"); assert.ok(a.sinais.includes("medida_nao_informada")); assert.equal(a.relevancia, 70);
  const b = c("Kit 2 Creme Hidratante Principia CH-02 454g", "Magalu"); assert.equal(b.tipo, "kit_mesmo_produto"); assert.equal(b.quantidade, 2); assert.deepEqual(b.medida_total, { valor: 908, unidade: "g" }); assert.equal(b.composicao[0].quantidade, 2);
  const d = c("Creme Hidratante Corporal Principia CH-02, 250g | Com 5% Óleo de Semente de Girassol, 5% Glicerina, 3% Manteiga de Abacate", "Amazon.com.br"); assert.equal(d.tipo, "outra_apresentacao"); assert.deepEqual(d.medida_total, { valor: 250, unidade: "g" });
  const e = c("Kit Cremes Hidratantes Principia CH-02 250g + 454g", "Drogasil"); assert.equal(e.tipo, "kit_mesmo_produto"); assert.deepEqual(e.medida_total, { valor: 704, unidade: "g" }); assert.equal(e.composicao.length, 2);
  const f = c("Principia, Kit Cremes Hidratantes Facial e Corporal CH-01 + CH-02", "Droga Raia"); assert.equal(f.tipo, "combo"); assert.ok(f.sinais.includes("composicao_sugerida")); assert.deepEqual(f.composicao.map((x) => x.modelo), ["ch02", "ch01"]); assert.equal(f.medida_total, null);
  const g = c("Principia Kit Antissinais Trio Ch + Pm + Gr", "principiaskin.com"); assert.equal(g.tipo, "relacionado");
  const h = c("Sérum Principia AH-2 Hidratante Antissinais 2% Ácidos Hialurônicos", "Magalu"); assert.equal(h.tipo, "relacionado");
  const i = c("Hidratante corporal para pele seca 454g", "Loja X"); assert.equal(i.tipo, "indeterminado"); assert.equal(i.relevancia, 5);
  const j = c("Principia hidratante 0042882100690", "Loja Y"); assert.equal(j.tipo, "individual", "o EAN no título liga ao produto"); assert.ok(j.motivos.some((m) => /EAN/.test(m)));
  const k = c("Creme Hidratante Corporal Principia CH-02 454g", "Drogal"); assert.equal(k.tipo, "individual"); assert.equal(k.relevancia, 80, "o tamanho confere com o pesquisado");
  for (const x of [a, b, d, e, f, g, h, i, j, k]) assert.ok(x.motivos.length >= 1 && ["individual", "kit_mesmo_produto", "combo", "outra_apresentacao", "relacionado", "indeterminado"].includes(x.tipo), "todo anúncio recebe tipo e motivo");
  assert.ok(k.relevancia > b.relevancia && b.relevancia > f.relevancia && f.relevancia > g.relevancia && g.relevancia > i.relevancia, "a ordem de parecença faz sentido");
});

test("preço por medida: kit de 2 × 454 g sai mais caro por 100 g que o frasco avulso; combos e anúncios sem medida ficam sem valor (nada é estimado)", () => {
  const ppm = (t, preco) => precoPorMedida(preco, classificar(t, null, INT));
  assert.deepEqual(ppm("Creme Hidratante Corporal Principia CH-02 454g", 49), { valor: 10.79, base: "100 g" });
  assert.deepEqual(ppm("Kit 2 Creme Hidratante Principia CH-02 454g", 133.92), { valor: 14.75, base: "100 g" });
  assert.deepEqual(ppm("Creme Hidratante Corporal Principia CH-02, 250g", 38.99), { valor: 15.6, base: "100 g" });
  assert.equal(ppm("Principia, Kit Cremes Hidratantes Facial e Corporal CH-01 + CH-02", 74.8), null, "combo: sem medida total");
  assert.equal(ppm("Creme Hidratante Principia Ch-02", 49), null, "sem medida no título: não se estima");
  assert.equal(ppm("Creme CH-02 454g", null), null); assert.equal(ppm("Creme CH-02 454g", 0), null);
  assert.deepEqual(precoPorMedida(60, { tipo: "kit_mesmo_produto", medida_total: null, quantidade: 3 }), { valor: 20, base: "unidade" });
});

test("leitura dos campos: preço em R$, links só https, página do Google × página da loja, chave estável", () => {
  assert.equal(numeroBRL("R$ 108,80 agora"), 108.8); assert.equal(numeroBRL("R$ 1.234,50"), 1234.5); assert.equal(numeroBRL(49), 49); assert.equal(numeroBRL("grátis"), null); assert.equal(numeroBRL(0), null);
  assert.deepEqual(linkSeguro("https://www.google.com/search?ibp=oshop&q=x"), { link: "https://www.google.com/search?ibp=oshop&q=x", tipo: "google" });
  assert.equal(linkSeguro("https://www.drogal.com.br/p").tipo, "loja"); assert.equal(linkSeguro("http://loja.com/p").link, null); assert.equal(linkSeguro("javascript:alert(1)").link, null); assert.equal(linkSeguro("").tipo, "desconhecido");
  assert.equal(chaveDedup("Magalu", "Kit 2 Creme CH-02", 133.9), chaveDedup("MAGALU", "kit 2  creme ch-02", 133.9)); assert.notEqual(chaveDedup("Magalu", "x", 1), chaveDedup("Magalu", "x", 2));
});

/* ---------- resposta do Google Shopping (forma real, enxuta) ---------- */
const SHOP = { search_metadata: { status: "Success" }, shopping_results: [
  { position: 1, title: "Creme Hidratante Principia Ch-02", product_id: "13735544944203438719", product_link: "https://www.google.com/search?ibp=oshop&q=x&prds=catalogid:13735544944203438719,productid:1", immersive_product_page_token: "TOKEN-A", source: "principiaskin.com", multiple_sources: true, price: "R$ 49,00", extracted_price: 49, rating: 4.9, reviews: 2300 },
  { position: 2, title: "Kit 2 Creme Hidratante Principia CH-02 454g", product_id: "4589298327372393555", product_link: "https://www.google.com/search?ibp=oshop&q=x&prds=productid:4589298327372393555", immersive_product_page_token: "TOKEN-B", source: "Magalu", price: "R$ 133,92", extracted_price: 133.92, installment: { price: "R$ 36,27/mês", period: 3 } },
  { position: 3, title: "Creme Hidratante Corporal Principia CH-02, 250g", product_id: "2825918504266305665", product_link: "https://www.google.com/search?ibp=oshop&prds=productid:2825918504266305665", source: "Amazon.com.br - Retail", price: "R$ 38,99", extracted_price: 38.99 },
  { position: 4, title: "Anúncio sem preço informado CH-02", product_id: "9", product_link: "http://inseguro.exemplo/p", source: "Loja Z" },
  { position: 5, product_id: "10", source: "sem título" },
] };

test("Google Shopping: um candidato por anúncio com título; nada de preço, frete ou entrega inventado; kit e outro tamanho entram classificados", () => {
  const l = candidatosDoShopping(SHOP, INT, AGORA);
  assert.equal(l.length, 4, "o item sem título é ignorado; os demais ficam (inclusive o sem preço)");
  const [a, b, c, d] = l;
  assert.deepEqual([a.tipo_oferta, b.tipo_oferta, c.tipo_oferta, d.tipo_oferta], ["individual", "kit_mesmo_produto", "outra_apresentacao", "individual"]);
  assert.equal(a.link_tipo, "google"); assert.equal(a.catalogo, true); assert.equal(a.varias_fontes, true); assert.equal(a.page_token, "TOKEN-A"); assert.equal(a.token_observado_em, AGORA); assert.equal(a.moeda, "BRL"); assert.equal(a.avaliacoes, 2300);
  assert.equal(b.catalogo, false); assert.equal(b.parcelamento_texto, "R$ 36,27/mês em 3x"); assert.equal(b.preco_por_medida, 14.75); assert.equal(b.base_medida, "100 g");
  for (const x of l) { assert.equal(x.frete_situacao, "desconhecido", "frete nunca é presumido"); assert.equal(x.entrega_texto, null); assert.equal(x.frete_valor, null); assert.equal(x.total, null); }
  assert.equal(d.preco, null, "sem preço do provedor: fica sem preço"); assert.equal(d.link, null, "link http é recusado"); assert.equal(d.preco_por_medida, null);
  assert.ok(l.every((x) => x.provedor === "serpapi" && x.engine === "google_shopping" && x.evidencias.length >= 1 && x.chave_dedup.length > 3 && x.observado_em === AGORA && x.precos_anteriores.length === 0));
  assert.deepEqual(candidatosDoShopping({}, INT, AGORA), []); assert.deepEqual(candidatosDoShopping(null, INT, AGORA), []);
});

/* ---------- lojas do anúncio (immersive / product) ---------- */
const LOJAS = { product_results: { stores: [
  { name: "Drogasil", link: "https://www.drogasil.com.br/p/1", title: "Kit 2 Creme Hidratante Principia CH-02 454g", price: "R$ 130,00", extracted_price: 130, shipping: "+ R$ 9,90", shipping_extracted: 9.9, total: "R$ 139,90", extracted_total: 139.9, payment_methods: "Pix, cartão", details_and_offers: "Em estoque", rating: 4.8, reviews: 120, merchant_id: "m1" },
  { name: "Loja Grátis", link: "https://loja.exemplo/p2", price: "R$ 135,00", extracted_price: 135, shipping: "Free" },
  { name: "Loja Sem Frete", link: "https://loja2.exemplo/p3", price: "R$ 128,00", extracted_price: 128 },
  { link: "https://sem-nome.exemplo/p" },
] } };

test("lojas do anúncio: herdam a classificação, o preço por medida usa o preço DA LOJA, frete do Google nunca vira frete confirmado", () => {
  const pai = candidatosDoShopping(SHOP, INT, AGORA)[1], l = lojasDoProduto(LOJAS, pai, INT, "google_immersive_product", AGORA);
  assert.equal(l.length, 3, "loja sem nome é ignorada");
  assert.ok(l.every((x) => x.tipo_oferta === "kit_mesmo_produto" && x.pai_externo === pai.id_externo && x.engine === "google_immersive_product" && x.page_token === null && x.quantidade === 2));
  const [a, b, c] = l; assert.equal(a.link_tipo, "loja"); assert.equal(a.preco, 130); assert.equal(a.preco_por_medida, 14.32, "130 / 908 g × 100"); assert.equal(a.total, 139.9);
  assert.deepEqual([a.frete_situacao, a.frete_valor], ["informado_provedor", 9.9]); assert.equal(b.frete_situacao, "gratis_informado_provedor"); assert.equal(c.frete_situacao, "desconhecido"); assert.equal(c.frete_valor, null);
  assert.equal(a.pagamento_texto, "Pix, cartão"); assert.equal(a.detalhes, "Em estoque"); assert.equal(new Set(l.map((x) => x.id_externo)).size, 3, "cada loja tem identificador próprio");
  assert.notEqual(ordenar(l, "medida")[0].loja, "Loja Grátis"); assert.equal(ordenar(l, "medida")[0].loja, "Loja Sem Frete");
});

test("agrupar não remove nada; ordenar põe quem não tem valor por último; reaparecer guarda o preço anterior só se mudou e preserva a decisão do dono", () => {
  const l = candidatosDoShopping(SHOP, INT, AGORA), g = agrupar(l); assert.equal(g.reduce((s, x) => s + x.n, 0), l.length, "todos os anúncios continuam nos grupos");
  assert.deepEqual(ordenar(l, "medida").map((x) => x.preco_por_medida), [14.75, 15.6, null, null]); assert.equal(ordenar(l, "preco")[0].preco, 38.99); assert.equal(ordenar(l, "preco").at(-1).preco, null);
  const antigo = { ...l[1], id: "c1", decisao: "acompanhando", oferta_id: "o1", observado_em: "2026-11-10T10:00:00Z" };
  const igual = mesclarCandidato(antigo, { ...l[1], observado_em: AGORA }); assert.deepEqual(igual.precos_anteriores, []); assert.equal(igual.decisao, "acompanhando"); assert.equal(igual.oferta_id, "o1"); assert.equal(igual.id, "c1");
  const mudou = mesclarCandidato(antigo, { ...l[1], preco: 119.9, observado_em: AGORA }); assert.deepEqual(mudou.precos_anteriores, [{ preco: 133.92, observado_em: "2026-11-10T10:00:00Z" }]); assert.equal(mudou.preco, 119.9);
  const semToken = mesclarCandidato({ ...antigo, page_token: "VELHO", token_observado_em: "2026-11-10T10:00:00Z" }, { ...l[1], page_token: null, token_observado_em: null }); assert.equal(semToken.page_token, "VELHO", "token anterior não se perde quando a nova leitura não traz outro");
  let x = antigo; for (let i = 0; i < 25; i++) x = mesclarCandidato(x, { ...l[1], preco: 100 + i, observado_em: AGORA }); assert.equal(x.precos_anteriores.length, 20, "no máximo 20 preços anteriores");
});

test("variantes de consulta: completa, marca e modelo, e o EAN sozinho (o EAN misturado a muitas palavras prejudicou a relevância na PoC)", () => {
  const v = variantesDeConsulta(INT); assert.deepEqual(v.map((x) => x.id), ["completa", "marca_modelo", "ean"]);
  assert.match(v[0].q, /Principia CH-02/); assert.match(v[0].q, /454 g/); assert.equal(v[1].q, "Principia CH-02"); assert.equal(v[2].q, "0042882100690");
  assert.deepEqual(variantesDeConsulta({ nome: "Fone XM-4" }).map((x) => x.id), ["completa", "marca_modelo"]);
  assert.ok(variantesDeConsulta({ nome: "Fone" }).every((x) => x.q.length > 0 && x.q.length <= 200));
});

test("identidade do produto e da apresentação: não depende da loja nem do anúncio; combo, relacionado e indeterminado não se misturam com o produto avulso", () => {
  const c = (t, loja = null) => classificar(t, loja, INT);
  const a = c("Creme Hidratante Principia Ch-02", "principiaskin.com"), b = c("Creme Hidratante Corporal Principia CH-02 454g", "Drogal"), k = c("Kit 2 Creme Hidratante Principia CH-02 454g", "Magalu"), d = c("Creme Hidratante Corporal Principia CH-02, 250g", "Amazon.com.br");
  const m = c("Kit Cremes Hidratantes Principia CH-02 250g + 454g", "Drogasil"), f = c("Principia, Kit Cremes Hidratantes Facial e Corporal CH-01 + CH-02", "Droga Raia"), g = c("Principia Kit Antissinais Trio Ch + Pm + Gr", "principiaskin.com");
  const i = c("Hidratante corporal para pele seca 454g", "Loja X"), j = c("Principia hidratante 0042882100690", "Loja Y");
  for (const x of [a, b, k, d, m]) assert.equal(x.produto_chave, "principia|ch02", "o mesmo produto em qualquer tamanho, kit ou loja");
  assert.deepEqual([a, b, k, d, m].map((x) => x.apresentacao_chave), ["sem_medida", "454g", "2x454g", "250g", "250g+454g"], "cada apresentação tem a sua chave");
  assert.deepEqual([f.produto_chave, f.apresentacao_chave], ["combo:ch01+ch02", "combo"], "combo é outro produto"); assert.equal(g.produto_chave, null, "relacionado não tem identidade"); assert.equal(i.produto_chave, null, "indeterminado não tem identidade");
  assert.equal(j.produto_chave, "gtin:42882100690", "com o EAN no título, a identidade é o EAN");
  assert.equal(c("Creme Hidratante Corporal Principia CH-02 454g", "Loja A").produto_chave, c("Creme Hidratante Corporal Principia CH-02 454g", "Loja B").produto_chave, "trocar de loja não muda a identidade");
  /* os candidatos herdam a identidade, e as lojas de um anúncio também */
  const l = candidatosDoShopping(SHOP, INT, AGORA); assert.deepEqual(l.map((x) => [x.produto_chave, x.apresentacao_chave]), [["principia|ch02", "sem_medida"], ["principia|ch02", "2x454g"], ["principia|ch02", "250g"], ["principia|ch02", "sem_medida"]]);
  const lojas = lojasDoProduto(LOJAS, l[1], INT, "google_immersive_product", AGORA); assert.ok(lojas.every((x) => x.produto_chave === "principia|ch02" && x.apresentacao_chave === "2x454g"));
});

test("observação de histórico: só com preço, sem inventar; grava na primeira vez, quando o preço muda ou após 20 h; a chave do anúncio não depende do texto da loja", () => {
  const l = candidatosDoShopping(SHOP, INT, AGORA), o = observacaoDoCandidato(l[1]);
  assert.deepEqual([o.produto_chave, o.apresentacao_chave, o.preco, o.preco_por_medida, o.base_medida, o.tipo_oferta, o.loja, o.provedor, o.engine], ["principia|ch02", "2x454g", 133.92, 14.75, "100 g", "kit_mesmo_produto", "Magalu", "serpapi", "google_shopping"]);
  assert.equal(observacaoDoCandidato(candidatosDoShopping(SHOP, INT, AGORA)[3]), null, "sem preço do provedor: sem observação (nada é estimado)"); assert.equal(Object.keys(o).includes("page_token"), false, "o token não vai para o histórico");
  const t = Date.parse(AGORA), h = 3600_000, ult = (preco, horas) => ({ preco, observado_em: new Date(t - horas * h).toISOString() });
  assert.equal(deveRegistrarObservacao(undefined, l[1], t), true); assert.equal(deveRegistrarObservacao(ult(133.92, 2), l[1], t), false); assert.equal(deveRegistrarObservacao(ult(133.92, 21), l[1], t), true);
  assert.equal(deveRegistrarObservacao(ult(120, 1), l[1], t), true, "preço mudou"); assert.equal(deveRegistrarObservacao(ult(133.92, 30), { ...l[1], preco: null }, t), false);
  assert.equal(chaveObservacao({ provedor: "serpapi", id_externo: "P2", loja: "Magalu" }), chaveObservacao({ provedor: "serpapi", id_externo: "P2", loja: "MAGALU " }));
});
