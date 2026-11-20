// Central Fiscal · confirmação única: a correspondência de produto e de estabelecimento (NUCLEO.mkSimilaridade, mkCasarProduto, mkCasarEstabelecimento), as decisões enviadas ao banco
// (nfEntradaDecisoes/nfEntradaPayload), os quatro estados da nota (nfEstadosNota) e a leitura da resposta (nfResultadoConfirmar). Puro: sem tela, sem banco, sem rede.
// O corpus abaixo é FICTÍCIO (produtos comuns de supermercado, escritos como o cupom e como o cadastro). Os produtos REAIS do dono ficam fora do repositório:
// para calibrar com eles, use scripts/calibrar_correspondencia.mjs com um arquivo local (docs/fiscal.md, "Calibrar com os seus produtos").
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const P = (id, nome, un = "un", categoria = "Mercearia") => ({ id, nome, unidade: un, categoria });

// [descrição do cupom, nome já cadastrado, deve casar?, motivo]
const CORPUS = [
  ["REFRIG COCA COLA 2L", "Refrigerante Coca Cola 2L", true, "abreviação expandida"],
  ["LEITE UHT INTEGRAL ITALAC 1L", "Leite Integral Italac 1L", true, "uma palavra a mais no cupom (só um contém o outro)"],
  ["QJO MUSSARELA FATIADO KG", "Queijo Mussarela Fatiado", true, "abreviação e 'kg' da balança"],
  ["ARROZ TIO JOAO TIPO 1 5KG", "Arroz Tio João Tipo 1 5kg", true, "acento e caixa"],
  ["DETERG LIQ YPE NEUTRO 500ML", "Detergente Líquido Ypê Neutro 500ml", true, "abreviações"],
  ["AGUA MIN CRYSTAL S/GAS 500ML", "Água Mineral Crystal Sem Gás 500ml", true, "s/ = sem"],
  ["SABONETE DOVE 90G", "Sabonete Dove 90g", true, "igual"],
  ["LEITE INTEGRAL ITALAC 1L", "Leite Integral Piracanjuba 1L", false, "MARCA diferente (a semelhança antiga dava 75%)"],
  ["REFRIG COCA COLA 2L", "Refrigerante Coca Cola 200ml", false, "TAMANHO diferente"],
  ["LEITE INTEGRAL 1L", "Leite Desnatado 1L", false, "variante"],
  ["COCA COLA ZERO LATA 350ML", "Coca Cola Lata 350ml", false, "'zero' muda o produto"],
  ["CERVEJA SKOL LATA 350ML", "Cerveja Skol Garrafa 600ml", false, "EMBALAGEM e tamanho"],
  ["CERVEJA SKOL LATA 350ML", "Cerveja Skol Latao 473ml", false, "tamanho"],
  ["SABONETE DOVE 90G", "Sabonete Lux 90g", false, "marca"],
  ["PAO DE FORMA PULLMAN 500G", "Pão de Forma Wickbold 500g", false, "marca"],
  ["IOGURTE NATURAL NESTLE MORANGO POTE 170G", "Iogurte Natural Nestlé Chocolate Pote 170g", false, "sabor (5 de 7 palavras iguais: 71% no Jaccard puro)"],
  ["AGUA MINERAL CRYSTAL SEM GAS 500ML", "Água Mineral Crystal Com Gás 500ml", false, "com × sem gás"],
  ["ARROZ INTEGRAL TIO JOAO 1KG", "Arroz Tio João Tipo 1 1kg", false, "integral × tipo 1"],
  ["BANANA PRATA KG", "Banana Nanica", false, "variedade"],
  ["LEITE CONDENSADO MOCA 395G", "Leite Condensado Italac 395g", false, "marca"],
  ["FEIJAO CARIOCA KICALDO 1KG", "Feijão Preto Kicaldo 1kg", false, "tipo"],
];
test("corpus: nenhuma associação ambígua entre marcas, tamanhos, embalagens ou variantes diferentes (cada par com o motivo)", () => {
  for (const [a, b, casa, motivo] of CORPUS) {
    const s = N.mkSimilaridade(a, b); assert.equal(s, N.mkSimilaridade(b, a), "simétrica: " + a + " × " + b);
    if (casa) assert.ok(s >= N.MK_CASAR_CORTE, `deveria casar (${motivo}): ${a} × ${b} = ${s}`); else assert.ok(s < N.MK_CASAR_CORTE, `NÃO pode casar (${motivo}): ${a} × ${b} = ${s}`);
  }
});
test("a regra dos 70%: limite exato (70 casa), 69 não; tamanho e embalagem diferentes nunca passam de 50", () => {
  assert.equal(N.MK_CASAR_CORTE, 70);
  const [x, y] = ["leite integral italac 1l", "leite integral italac 1l caixa"]; assert.equal(N.mkSimilaridade(x, y), 80);
  assert.ok(N.mkSimilaridade("coca cola 2l", "coca cola 200ml") <= 50); assert.ok(N.mkSimilaridade("cerveja skol lata", "cerveja skol garrafa") <= 50);
  assert.equal(N.mkSimilaridade("", "arroz"), 0);
});
test("mkCasarProduto: apelido → nome igual → parecido (≥ 70, mesma unidade) → novo; empate entre dois bons é ambíguo e cria produto novo; nunca bloqueia", () => {
  const prods = [P("1", "Leite Integral Italac 1L"), P("2", "Leite Integral Piracanjuba 1L"), P("3", "Refrigerante Coca Cola 2L", "un", "Bebidas"), P("4", "Queijo Mussarela Fatiado", "kg", "Açougue/Frios"), P("5", "Arroz Tio João Tipo 1 5kg")];
  const ap = (d) => ({ [N.mkChave(d)]: "5" });
  const a = N.mkCasarProduto("ARROZ T1 TIO JOAO 5KG", "un", prods, ap("ARROZ T1 TIO JOAO 5KG")); assert.deepEqual([a.tipo, a.produto_id, a.pontos], ["apelido", "5", 100], "descrição já ligada antes a um produto");
  const e = N.mkCasarProduto("REFRIG COCA COLA 2L", "un", prods, {}); assert.deepEqual([e.tipo, e.produto_id, e.categoria], ["exata", "3", "Bebidas"]);
  const ap2 = N.mkCasarProduto("LEITE UHT INTEGRAL ITALAC 1L", "un", prods, {}); assert.deepEqual([ap2.tipo, ap2.produto_id], ["aproximada", "1"]); assert.ok(ap2.pontos >= 70 && ap2.pontos < 100);
  const amb = N.mkCasarProduto("LEITE INTEGRAL 1L", "un", prods, {}); assert.deepEqual([amb.tipo, amb.ambigua, amb.produto_id], ["nova", true, null], "75 × 75: não escolhe nenhum"); assert.equal(amb.candidatos.length, 2);
  const nv = N.mkCasarProduto("REFRIG COCA COLA 200ML", "un", prods, {}); assert.deepEqual([nv.tipo, nv.produto_id, nv.ambigua], ["nova", null, false]); assert.equal(nv.nome, "Refrigerante Coca Cola 200ml"); assert.equal(nv.categoria, "Bebidas", "categoria pelas regras do Mercado");
  const un = N.mkCasarProduto("QJO MUSSARELA FATIADO", "un", prods, {}); assert.equal(un.tipo, "exata", "nome igual vale para a unidade que for");
  const un2 = N.mkCasarProduto("QUEIJO MUSSARELA FATIADO FRESCO", "un", prods, {}); assert.equal(un2.tipo, "nova", "parecido mas de OUTRA unidade (kg × un): não reaproveita");
  const rev = N.mkCasarProduto("XYZW QQ 17", "un", prods, {}); assert.deepEqual([rev.tipo, rev.categoria, rev.revisar], ["nova", "Mercearia", true], "sem regra de categoria: Mercearia marcada para revisar, sem bloquear");
  assert.deepEqual(N.mkCasarProduto("QUALQUER COISA", "un", [], {}).tipo, "nova", "sem produtos cadastrados");
});
test("mkCasarEstabelecimento: CNPJ → nome parecido (contido vale 80; empate não escolhe) → novo sem LTDA/S.A.", () => {
  const ms = [{ id: "a", nome: "Tauste Ribeirão", cnpj: null }, { id: "b", nome: "Confiança", cnpj: "11222333000181" }, { id: "c", nome: "Exemplo Norte", cnpj: null }, { id: "d", nome: "Exemplo Sul", cnpj: null }];
  assert.deepEqual([N.mkCasarEstabelecimento({ nome: "OUTRO NOME", cnpj: "11.222.333/0001-81" }, ms).tipo, N.mkCasarEstabelecimento({ nome: "X", cnpj: "11222333000181" }, ms).id], ["cnpj", "b"]);
  const t = N.mkCasarEstabelecimento({ nome: "TAUSTE SUPERMERCADOS LTDA", cnpj: "99888777000166" }, ms); assert.deepEqual([t.tipo, t.id, t.pontos], ["nome", "a", 80]);
  assert.equal(N.mkCasarEstabelecimento({ nome: "EXEMPLO COMERCIO LTDA" }, ms).tipo, "nova", "Exemplo Norte × Exemplo Sul: empate, não escolhe");
  const n = N.mkCasarEstabelecimento({ nome: "SUPER NOVO S.A.", cnpj: "11222333000181".replace("181", "000") }, []); assert.deepEqual([n.tipo, n.nome], ["nova", "Super Novo"]);
  assert.equal(N.mkCasarEstabelecimento({}, ms).tipo, "nova");
});
test("nfEntradaDecisoes/nfEntradaPayload: uma decisão por item (g vira kg, ml vira l), resumo, e o que vai ao banco só tem produto_id OU novo{nome,categoria,unidade} com limites", () => {
  const nota = { emitente: { nome: "MERCADO EXEMPLO LTDA", cnpj: "11222333000181" }, itens: [
    { descricao: "REFRIG COCA COLA 2L", unidade: { cod: "un" } }, { descricao: "QJO MUSSARELA", unidade: { cod: "g" } }, { descricao: "SUCO LARANJA", unidade: { cod: "ml" } }, { descricao: "A".repeat(300), unidade: { cod: "cx" } }] };
  const d = N.nfEntradaDecisoes(nota, [P("3", "Refrigerante Coca Cola 2L", "un", "Bebidas")], [], {});
  assert.deepEqual(d.itens.map((x) => [x.ordem, x.unidade, x.tipo]), [[0, "un", "exata"], [1, "kg", "nova"], [2, "l", "nova"], [3, "un", "nova"]]); assert.deepEqual({ ...d.resumo }, { existentes: 1, novos: 3, revisar: d.resumo.revisar, ambiguos: 0 });
  const p = N.nfEntradaPayload(d); assert.equal(p.itens[0].produto_id, "3"); assert.ok(!("novo" in p.itens[0])); assert.deepEqual(Object.keys(p.itens[1]).sort(), ["novo", "ordem", "pontos", "tipo"]); assert.equal(p.itens[1].novo.unidade, "kg"); assert.ok(p.itens[3].novo.nome.length <= 120); assert.ok(p.itens[1].novo.categoria.length <= 40);
  assert.deepEqual(Object.keys(p.mercado).sort(), ["cnpj", "id", "nome", "tipo"]); assert.equal(N.nfUnidadeMercado({ unidade: "ml" }), "l", "também aceita a unidade como texto (itens já gravados)");
  assert.deepEqual(JSON.parse(JSON.stringify(N.nfEntradaPayload(null))), { mercado: { id: null, nome: "", cnpj: null, tipo: null }, itens: [] });
});
test("nfEstadosNota: leitura, confirmação, situação fiscal e Mercado são quatro coisas separadas; pendente fiscal continua pendente e a compra continua lançada", () => {
  const n = { situacao: "pendente", formato_origem: "imagem", conferida_em: null }, ent = { estado: "concluida", confirmado_em: "2026-11-16T10:00:00Z", mercado_nota_id: "m", revisar: null };
  const e = N.nfEstadosNota(n, ent), por = Object.fromEntries(e.map((x) => [x.chave, x]));
  assert.deepEqual(e.map((x) => x.chave), ["leitura", "conferencia", "fiscal", "mercado"]); assert.equal(por.leitura.rotulo, "Foto"); assert.equal(por.conferencia.rotulo, "Estou de acordo"); assert.equal(por.fiscal.rotulo, "Pendente"); assert.equal(por.fiscal.tom, "fxpend"); assert.equal(por.mercado.rotulo, "Lançada no Mercado"); assert.equal(por.mercado.tom, "fxok");
  const f = Object.fromEntries(N.nfEstadosNota(n, { estado: "falhou", erro: "x" }).map((x) => [x.chave, x])); assert.deepEqual([f.mercado.rotulo, f.mercado.tentar, f.conferencia.rotulo], ["Falha na entrada", true, "Sem confirmação"]);
  /* estados de Mercado separados da situação fiscal: nota pendente na SEFAZ não espera segunda ação; falha com retomada automática é "Aguardando nova tentativa"; esgotadas as 6 tentativas, "Falha na entrada" */
  const mer = (n, e) => N.nfEstadosNota(n, e).find((x) => x.chave === "mercado"), fis = (n, e) => N.nfEstadosNota(n, e).find((x) => x.chave === "fiscal");
  const pend = { situacao: "pendente", formato_origem: "imagem" };
  assert.deepEqual([fis(pend, null).rotulo, mer(pend, null).rotulo, mer(pend, null).lancar], ["Pendente", "Não lançada no Mercado", true], "pendente fiscal pode entrar: o Mercado não espera a SEFAZ");
  assert.deepEqual([mer({ situacao: "contingencia" }, { estado: "concluida", confirmado_em: "2026-11-20T10:00:00Z" }).rotulo, fis({ situacao: "contingencia" }, null).rotulo], ["Lançada no Mercado", "Contingência"]);
  const aut = mer(pend, { estado: "falhou", tentativas: 2, proxima_em: "2026-11-21T10:00:00Z", erro: "x", confirmado_em: "2026-11-20T10:00:00Z" }); assert.deepEqual([aut.rotulo, aut.automatica, aut.tentar, aut.tom], ["Aguardando nova tentativa", true, true, "fxpend"]);
  assert.equal(mer(pend, { estado: "pendente", confirmado_em: "2026-11-20T10:00:00Z" }).rotulo, "Aguardando nova tentativa");
  const esg = mer(pend, { estado: "falhou", tentativas: N.NF_ENTRADA_MAX, proxima_em: null, erro: "x", confirmado_em: "2026-11-20T10:00:00Z" }); assert.deepEqual([esg.rotulo, esg.automatica, esg.tentar, esg.tom], ["Falha na entrada", undefined, true, "fxruim"]);
  assert.equal(mer(pend, { estado: "falhou", tentativas: 6, proxima_em: "2026-11-21T10:00:00Z", confirmado_em: "x" }).rotulo, "Falha na entrada", "6 tentativas: acabou a retomada, mesmo com data");
  assert.deepEqual([mer({ situacao: "cancelada" }, null).lancar, mer({ situacao: "rejeitada" }, null).lancar], [false, false], "cancelada/rejeitada não entram");
  /* texto da validação oficial: honesto, nunca afirma autorização sem o resultado registrado */
  const T = N.nfConsultaTexto, base = { chave: "1".repeat(44), situacao: "pendente" };
  for (const x of [T(null, false, base), T(null, true, base), T(null, true, { situacao: "pendente", chave: null })]) { assert.match(x, /Validação oficial automática ainda não habilitada.*A entrada no Mercado não depende dela/); assert.doesNotMatch(x, /autorizad|validad/i); } assert.match(T(null, true, { situacao: "cancelada" }), /não há mais o que consultar/);
  assert.match(T({ resultado: "indisponivel", consultado_em: "2026-11-20T10:00:00Z", mudou: false, motivo: "sem certificado digital configurado nos Secrets", proxima_em: "2026-11-27T10:00:00Z" }, true, base), /indisponível: nada foi alterado.*sem certificado.*Próxima/);
  assert.doesNotMatch(T({ resultado: "indisponivel", consultado_em: "2026-11-20T10:00:00Z", mudou: false }, true, base), /autoriza/i);
  assert.match(T({ resultado: "autorizada", consultado_em: "2026-11-20T10:00:00Z", mudou: true, encerrada: false }, true, base), /autorização confirmada pela fonte oficial.*situação fiscal foi atualizada/);
  assert.match(T({ resultado: "cancelada", consultado_em: "2026-11-20T10:00:00Z", mudou: true, encerrada: true }, true, base), /cancelamento confirmado.*Consulta encerrada/);
  const s = Object.fromEntries(N.nfEstadosNota({ situacao: "autorizada", formato_origem: "xml", conferida_em: "2026-11-16" }, null).map((x) => [x.chave, x])); assert.deepEqual([s.mercado.rotulo, s.mercado.lancar, s.conferencia.rotulo, s.leitura.rotulo], ["Não lançada no Mercado", true, "Conferida", "XML"]);
  const c = Object.fromEntries(N.nfEstadosNota({ situacao: "cancelada", formato_origem: "pdf" }, null).map((x) => [x.chave, x])); assert.deepEqual([c.mercado.rotulo, c.mercado.lancar, c.fiscal.tom], ["Não lançada (cancelada)", false, "fxruim"]);
  assert.equal(Object.fromEntries(N.nfEstadosNota({ situacao: "autorizada", formato_origem: "xml", conferida_em: "x" }, { estado: "concluida", confirmado_em: "y" }).map((x) => [x.chave, x])).conferencia.rotulo, "Estou de acordo · conferida");
});
test("nfResultadoConfirmar: só diz 'lançada' quando o banco confirmou; falha do Mercado vira pendência com 'Tentar de novo'; bloqueada, duplicada e resposta estranha nunca viram sucesso", () => {
  const nota = { situacao: "contingencia" };
  const ok = N.nfResultadoConfirmar({ gravada: true, nota_id: "n", fiscal: {}, entrada: { estado: "concluida", mercado_nota_id: "m", itens: 1, total: 5, produtos_novos: 1, avisos: ["x"] } }, nota); assert.deepEqual([ok.estado, ok.ok, ok.gravada, ok.id], ["concluida", true, true, "n"]); assert.match(ok.texto, /Nota gravada na Central Fiscal \(contingência\) e lançada no Mercado: 1 item, total R\$ 5,00\. 1 produto novo\./);
  const ja = N.nfResultadoConfirmar({ gravada: true, nota_id: "n", entrada: { estado: "ja_no_mercado", mercado_nota_id: "m" } }, nota); assert.deepEqual([ja.estado, ja.ok], ["ja_no_mercado", true]); assert.match(ja.texto, /nenhuma compra nova foi criada/);
  const rep = N.nfResultadoConfirmar({ gravada: true, nota_id: "n", entrada: { estado: "concluida", ja_existia: true, mercado_nota_id: "m" } }, nota); assert.match(rep.texto, /já estava lançada no Mercado: nada foi criado de novo/);
  const fal = N.nfResultadoConfirmar({ gravada: true, nota_id: "n", entrada: { estado: "falhou", erro: "motivo" } }, nota); assert.deepEqual([fal.estado, fal.ok, fal.gravada, fal.tentar], ["mercado_pendente", false, true, true]); assert.match(fal.texto, /confirmação ficou registrada.*motivo.*Tentar de novo.*não precisa ler nem confirmar outra vez/); assert.doesNotMatch(fal.texto, /lançada no Mercado:/);
  const b = N.nfResultadoConfirmar({ gravada: false, fiscal: { bloqueada: true, resultado: "bloqueada", motivos: ["M1"] } }, nota); assert.deepEqual([b.estado, b.ok, b.gravada], ["bloqueada", false, false]); assert.match(b.texto, /Nada foi lançado.*M1/);
  const d = N.nfResultadoConfirmar({ gravada: false, nota_id: "n", fiscal: { duplicada: true, motivo: "chave" }, entrada: { estado: "falhou" } }, nota); assert.equal(d.estado, "duplicada"); assert.match(d.texto, /ainda não deu entrada no Mercado/);
  for (const x of [null, {}, { gravada: true }, { gravada: true, entrada: null }, { gravada: "sim" }]) { const r = N.nfResultadoConfirmar(x, nota); assert.deepEqual([r.ok, r.gravada], [false, false], JSON.stringify(x)); }
});
