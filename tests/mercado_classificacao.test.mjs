// Lote Mercado: categorias oficiais, normalização de nomes e classificação de produtos (nucleo.js, mk*). Sem banco e sem IA paga.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

globalThis.window = globalThis.window || {};
createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo || globalThis.window.RACnucleo;
const ler = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const cat = (d, nome, ctx) => N.mkClassificar(d, nome, ctx).categoria;

test("categorias oficiais: as 11, na ordem, e Limpeza/Descartáveis não existe mais", () => {
  assert.deepEqual(N.MK_CATEGORIAS, ["Mercearia", "Padaria", "Açougue/Frios", "Hortifruti", "Chocolates/Doces", "Bebidas", "Limpeza", "Higiene Pessoal", "Peixaria", "Casa/Utilidades", "Bebê/Infantil"]);
  assert.ok(!N.MK_CATEGORIAS.some((c) => /descart/i.test(c)));
});

test("unificação: as duas Limpeza viram uma só, em qualquer escrita; as outras ficam como estão", () => {
  for (const c of ["Limpeza/Descartáveis", "limpeza/descartaveis", " Limpeza / Descartáveis ", "Limpeza", "LIMPEZA"]) assert.equal(N.mkCatOficial(c), "Limpeza", c);
  assert.equal(N.mkCatOficial("Açougue/Frios"), "Açougue/Frios");
  assert.equal(N.mkCatOficial("acougue/frios"), "Açougue/Frios");
  assert.equal(N.mkCatOficial("Bebê/Infantil"), "Bebê/Infantil");
  assert.equal(N.mkCatOficial("Outros"), "Outros", "categoria de fora da lista não é inventada nem apagada");
  assert.equal(N.mkCatOficial(null), "");
});

test("normalização: expande o conhecido, preserva marca e sabor, não inventa", () => {
  assert.equal(N.mkNome("BISC WAFER TUBIN CHOCO"), "Biscoito Wafer Tubin Choco");
  assert.equal(N.mkNome("REFRIG COCA COLA 2L"), "Refrigerante Coca Cola 2L");
  assert.equal(N.mkNome("PAPEL HIG FOLHA DUPLA"), "Papel Higiênico Folha Dupla");
  assert.equal(N.mkNome("PEITO FGO KG"), "Peito Frango", "tira o kg da balança");
  assert.equal(N.mkNome("00123456 ARROZ TIO JOAO 5KG"), "Arroz Tio Joao 5kg", "tira o código do começo e não muda a marca");
  assert.equal(N.mkNome("SAB LUX"), "Sab Lux", "abreviatura com dúvida (sabão ou sabonete) fica como veio");
  assert.equal(N.mkNome(""), "");
});

test("a descrição original não é alterada pela normalização nem pela classificação", () => {
  const d = "BISC WAFER TUBIN CHOCO"; N.mkNome(d); N.mkClassificar(d);
  assert.equal(d, "BISC WAFER TUBIN CHOCO");
  const mk = ler("mercado.js");
  assert.match(mk, /descricao: it\.desc, categoria:/, "o item gravado leva a descrição original do cupom (auditoria)");
  assert.match(mk, /itens\.insert|from\("itens"\)\.insert/);
});

test("chave de produto: ignora caixa, acento, abreviatura e pontuação, mas não mistura tamanhos", () => {
  assert.equal(N.mkChave("BISC. WAFER TUBIN CHOCO"), N.mkChave("Biscoito Wafer Tubin Choco"));
  assert.equal(N.mkChave("CAFÉ PILÃO 500G"), N.mkChave("cafe pilao 500g"));
  assert.notEqual(N.mkChave("Coca Cola 2L"), N.mkChave("Coca Cola 200ml"));
  assert.notEqual(N.mkChave("Leite Integral 1L"), N.mkChave("Leite Desnatado 1L"));
});

test("exemplos do dono: wafer, biscoito comum, Trident, leite, padaria, detergente e esponja", () => {
  assert.equal(cat("BISC WAFER TUBIN CHOCO"), "Chocolates/Doces");
  assert.equal(cat("WAFER BAUDUCCO"), "Chocolates/Doces");
  assert.equal(cat("BISC CREAM CRACKER"), "Mercearia");
  assert.equal(cat("BISC MAIZENA 170G"), "Mercearia");
  assert.equal(cat("TRIDENT MENTA"), "Chocolates/Doces");
  assert.equal(cat("LEITE UHT INTEGRAL 1L"), "Mercearia");
  assert.equal(cat("LEITE CONDENSADO"), "Mercearia");
  for (const p of ["PAO DE FORMA PULLMAN", "PAO FRANCES", "PAO DE QUEIJO CONG", "BISNAGUINHA SEVEN BOYS", "EMPADA FRANGO", "COXINHA", "PASTEL CARNE"]) assert.equal(cat(p), "Padaria", p);
  assert.equal(cat("DETERGENTE YPE NEUTRO"), "Limpeza");
  assert.equal(cat("ESPONJA SCOTCH BRITE"), "Limpeza");
});

test("Limpeza cobre os exemplos da unificação; Higiene Pessoal e Bebê não se misturam", () => {
  for (const p of ["AMACIANTE COMFORT", "DESINFETANTE PINHO SOL", "SABAO EM PO OMO", "LAVA LOUCAS", "GUARDANAPO", "PAPEL TOALHA", "HASTES FLEXIVEIS", "SACO DE LIXO 50L"]) assert.equal(cat(p), "Limpeza", p);
  for (const p of ["PAPEL HIG FOLHA DUPLA", "SABONETE DOVE", "FIO DENTAL", "LISTERINE", "SHAMPOO"]) assert.equal(cat(p), "Higiene Pessoal", p);
  assert.equal(cat("FRALDA PAMPERS G"), "Bebê/Infantil");
  assert.equal(cat("FRALDINHA BOVINA"), "Açougue/Frios", "fraldinha é carne, não fralda");
});

test("demais categorias pelo tipo do produto", () => {
  assert.equal(cat("NUTELLA 350G"), "Chocolates/Doces"); assert.equal(cat("CHOCOLATE LACTA"), "Chocolates/Doces"); assert.equal(cat("PUDIM"), "Chocolates/Doces");
  assert.equal(cat("AGUA MINERAL 1,5L"), "Bebidas"); assert.equal(cat("AGUA DE COCO 1L"), "Bebidas"); assert.equal(cat("SUCO DE UVA"), "Bebidas"); assert.equal(cat("CERV BRAHMA LT"), "Bebidas");
  assert.equal(cat("AGUA SANITARIA"), "Limpeza", "água sanitária não é bebida");
  assert.equal(cat("QJO MUSSARELA FAT"), "Açougue/Frios"); assert.equal(cat("PRESUNTO FATIADO"), "Açougue/Frios"); assert.equal(cat("LINGUICA TOSCANA"), "Açougue/Frios"); assert.equal(cat("PEITO FGO"), "Açougue/Frios");
  assert.equal(cat("REQUEIJAO CREMOSO"), "Mercearia"); assert.equal(cat("CREME DE LEITE"), "Mercearia"); assert.equal(cat("MARGARINA QUALY"), "Mercearia");
  assert.equal(cat("BANANA PRATA KG"), "Hortifruti"); assert.equal(cat("CHEIRO VERDE"), "Hortifruti");
  assert.equal(cat("SALMAO FILE"), "Peixaria"); assert.equal(cat("CAMARAO"), "Peixaria");
  assert.equal(cat("PILHA DURACELL"), "Casa/Utilidades");
});

test("não é só palavra solta: o contexto decide", () => {
  assert.equal(cat("TOMATE KG"), "Hortifruti"); assert.equal(cat("MOLHO DE TOMATE"), "Mercearia"); assert.equal(cat("EXTRATO DE TOMATE"), "Mercearia");
  assert.equal(cat("BATATA INGLESA KG"), "Hortifruti"); assert.equal(cat("BATATA PALHA"), "Mercearia");
  assert.equal(cat("PAO DE QUEIJO"), "Padaria", "pão de queijo não é queijo"); assert.equal(cat("QUEIJO RALADO"), "Mercearia");
  assert.equal(cat("LIMAO KG"), "Hortifruti"); assert.equal(cat("SUCO DE LIMAO"), "Bebidas");
  assert.equal(cat("ATUM RALADO LATA"), "Mercearia");
});

test("produto ambíguo ou desconhecido: vai para revisão, sem categoria arbitrária (nada de Mercearia por padrão)", () => {
  for (const p of ["SAB LUX", "ALCOOL 70", "AGUA OXIGENADA", "BOLO", "SARDINHA", "XYZ ABC", "7891234567890", ""]) {
    const r = N.mkClassificar(p);
    assert.equal(r.categoria, null, p); assert.equal(r.revisar, true, p); assert.equal(r.origem, "revisar", p); assert.ok(r.motivo, p);
  }
  assert.equal(N.mkClassificar("ARROZ TIO JOAO").revisar, false);
});

const PRODS = [{ id: "p1", nome: "Biscoito Wafer Tubin Choco", categoria: "Mercearia" }, { id: "p2", nome: "Esponja Scotch", categoria: "Limpeza/Descartáveis" }, { id: "p3", nome: "Pão Especial da Casa", categoria: "Mercearia" }];

test("produto já cadastrado: reaproveita a categoria dele, mesmo com a regra dizendo outra (correção manual vale)", () => {
  const r = N.mkClassificar("BISC WAFER TUBIN CHOCO", "", { produtos: PRODS });
  assert.equal(r.categoria, "Mercearia"); assert.equal(r.origem, "produto"); assert.equal(r.produto_id, "p1");
  assert.equal(cat("BISC WAFER TUBIN CHOCO"), "Chocolates/Doces", "sem cadastro, a regra manda");
  assert.equal(cat("PAO ESPECIAL DA CASA", "", { produtos: PRODS }), "Mercearia", "a correção manual do dono vence a regra de padaria");
});

test("reconhece o mesmo produto por abreviatura, caixa e acento, em outro estabelecimento", () => {
  for (const d of ["BISC. WAFER TUBIN CHOCO", "biscoito wafer tubin choco", "Bisc Wafer Tubin Choco"]) { const r = N.mkClassificar(d, "", { produtos: PRODS }); assert.equal(r.produto_id, "p1", d); }
  assert.equal(N.mkClassificar("ESPONJA SCOTCH", "", { produtos: PRODS }).categoria, "Limpeza", "categoria antiga cadastrada sai unificada");
});

test("apelido: a descrição já usada numa nota anterior leva ao mesmo produto", () => {
  const r = N.mkClassificar("COD 77 WAFER TB", "", { produtos: PRODS, apelidos: { [N.mkChave("COD 77 WAFER TB")]: "p1" } });
  assert.equal(r.produto_id, "p1"); assert.equal(r.categoria, "Mercearia");
});

test("a correção de um produto não classifica outro sem evidência (só chave igual, nunca parecido)", () => {
  const r = N.mkClassificar("BISC WAFER MORANGO", "", { produtos: PRODS });
  assert.equal(r.origem, "regra", "outro sabor de wafer não herda a categoria do Tubin Choco"); assert.equal(r.categoria, "Chocolates/Doces");
  assert.equal(N.mkClassificar("ESPONJA DE ACO", "", { produtos: PRODS }).origem, "regra");
});

test("a tela do Mercado usa o núcleo, não chama IA e não deixa categoria ambígua passar sem escolha", () => {
  const mk = ler("mercado.js");
  assert.match(mk, /mkClassificar\(/); assert.ok(!/CATS_PALAVRAS|categoriaPalpite/.test(mk), "o palpite antigo (padrão Mercearia) saiu");
  assert.ok(!/racIA\(|anthropic/i.test(mk), "classificação sem IA paga");
  assert.match(mk, /Escolher categoria/); assert.match(mk, /semCat\.length/);
  assert.match(mk, /x\.categoria = catOf\(x\.categoria\)/, "as linhas lidas do banco saem com a categoria unificada");
  assert.match(mk, /update\(\{ categoria: cat\.value \}\)\.eq\("id", x\.id\)/, "a correção manual em Produtos continua simples e grava produtos.categoria");
  assert.ok(!/produtos"\)\.update\(\{ categoria: [^}]*mkClassificar/.test(mk), "classificação automática nunca sobrescreve produto existente");
});

test("filtros e consultas: a visão por categoria não separa Limpeza de Limpeza/Descartáveis", () => {
  const o = N.pnOrcamento({ "Limpeza/Descartáveis": 30, Limpeza: 50, Mercearia: 100 }, [{ categoria: "Limpeza/Descartáveis", valor: 40 }, { categoria: "Limpeza", valor: 60 }]);
  const l = o.linhas.find((x) => x.categoria === "Limpeza");
  assert.equal(o.linhas.filter((x) => /limpeza/i.test(x.categoria)).length, 1, "uma linha só");
  assert.equal(l.gasto, 80); assert.equal(l.orcado, 100);
  const d = N.pnDespesas([{ data: "2026-11-01", valor_total: 10, categoria: "Limpeza/Descartáveis" }, { data: "2026-11-02", valor_total: 5, categoria: "Limpeza" }], [], [], null);
  assert.deepEqual(d.map((x) => x.cat), ["Limpeza", "Limpeza"]);
  assert.equal(N.alCatMercado("Limpeza/Descartáveis", "Guardanapo"), "", "limpeza (qualquer nome) segue fora da comida");
  assert.equal(N.alCatMercado("Bebê/Infantil", "Papinha"), "", "bebê/infantil não é comida do Alimentação e não vira 'sem classificação'");
  assert.equal(N.alCatMercado("Mercearia", "Arroz"), "Alimentação · Supermercado");
});

test("regressão: histórico de preços e notas ficam intactos (a lógica de gravação e de preço não mudou)", () => {
  const mk = ler("mercado.js");
  assert.match(mk, /valor_unitario: it\.vu, valor_total: Math\.round\(\(it\.vt - \(it\.desc_rateio \|\| 0\)\) \* 100\) \/ 100, desconto: it\.desc_rateio/, "valores do item gravados como antes");
  assert.match(mk, /categoria: pr \? pr\.categoria : it\.sel\.value/, "item de produto existente herda a categoria do produto");
  assert.match(mk, /insert\(lista\)\.select\("id,nome,categoria,unidade"\)/, "produto novo continua sendo criado com a categoria escolhida");
  assert.match(mk, /valor_total, quantidade|c: e\[1\]\[0\]\.categoria/, "preços e visão por categoria seguem lendo categoria dos itens");
});

test("a proposta 041 só unifica categorias: nada apaga produto, nota ou item, nada muda valor, e não foi aplicada", () => {
  const f = "supabase/propostas/041_mercado_categorias_oficiais.sql", s = ler(f), sem = s.replace(/^--.*$/gm, "");
  assert.match(s.slice(0, 200), /status: pendente/); assert.match(s, /NÃO APLICADA EM PRODUÇÃO/);
  assert.ok(!/drop |truncate|delete from public\.(produtos|itens|notas|mercados)|alter table|create (table|policy|function|trigger)/i.test(sem));
  assert.ok(!/valor_total|valor_unitario|quantidade|\bdata\b\s*=|produto_id\s*=|nota_id\s*=/i.test(sem.replace(/'[^']*'/g, "")), "não mexe em valor, quantidade, data nem vínculo");
  const upd = sem.match(/update public\.\w+ set [^;]+;/gi) || [];
  assert.equal(upd.length, 2); assert.ok(upd.every((u) => /set categoria = 'Limpeza'/i.test(u)));
  assert.ok((sem.match(/delete from public\.\w+/gi) || []).every((d) => /orcamentos/.test(d)), "o único delete é a linha de orçamento da categoria antiga, já somada");
  assert.ok(/^begin;[\s\S]*commit;\s*$/m.test(sem.trim().replace(/\n/g, "\n")));
  const c = ler("supabase/conferencias/041_conferir_producao.sql"); assert.ok(!/\b(insert|update|delete|drop|alter|truncate|create)\b/i.test(c.replace(/^--.*$/gm, "")), "a conferência só lê");
});
