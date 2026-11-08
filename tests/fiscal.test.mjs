// Lote 2 · Núcleo fiscal (NF-e modelo 55 e NFC-e modelo 65): chave de acesso, situação, valores, itens, privacidade e vínculos.
// Só regras puras. Chaves, CNPJ (válido só no dígito verificador), emitentes, itens e CPF abaixo são FICTÍCIOS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;

// chaves calculadas à parte (fora do código testado): UF 35, 2026-10, CNPJ 11222333000181
const K55 = "35261011222333000181550010000123451876543218"; // modelo 55, série 1, nº 12345
const K65 = "35261011222333000181650020000006781112233448"; // modelo 65, série 2, nº 678
const K65_CONT = "35261011222333000181650020000006799112233440"; // modelo 65, nº 679, tipo de emissão 9 (contingência offline)
const base = (cnpj, modelo = "65", tp = "1") => "35" + "2610" + cnpj + modelo + "002" + "000000678" + tp + "11223344"; // 43 dígitos, sem o DV
const comDv = (b43) => b43 + N.nfDvChave(b43);
const CPF_CONSUMIDOR = "52998224725"; // CPF fictício que aparece só no XML de entrada

function xmlNFCe({ chave = K65, numero = 678, tpEmis = "1", prot = '<protNFe><infProt><cStat>100</cStat><nProt>135260000000123</nProt><chNFe>' + K65 + '</chNFe></infProt></protNFe>', extra = "" } = {}) {
  return `<nfeProc><NFe><infNFe Id="NFe${chave}" versao="4.00"><ide><mod>65</mod><serie>2</serie><nNF>${numero}</nNF><dhEmi>2026-10-20T11:30:00-03:00</dhEmi><tpEmis>${tpEmis}</tpEmis></ide>
<emit><CNPJ>11222333000181</CNPJ><xNome>MERCADO EXEMPLO LTDA</xNome><enderEmit><xLgr>RUA DO EMITENTE</xLgr><UF>SP</UF></enderEmit></emit>
<dest><CPF>${CPF_CONSUMIDOR}</CPF><xNome>CONSUMIDOR FICTICIO DA SILVA</xNome></dest>
<det nItem="1"><prod><cProd>001</cProd><xProd>BANANA PRATA</xProd><qCom>0.7340</qCom><uCom>KG</uCom><vUnCom>6.99</vUnCom><vProd>5.13</vProd></prod></det>
<det nItem="2"><prod><cProd>002</cProd><xProd>AZEITE EXEMPLO</xProd><qCom>2.0000</qCom><uCom>LT</uCom><vUnCom>10.00</vUnCom><vProd>20.00</vProd></prod></det>
<det nItem="3"><prod><cProd>003</cProd><xProd>BOLACHA EXEMPLO</xProd><qCom>3.0000</qCom><uCom>UN</uCom><vUnCom>4.00</vUnCom><vProd>12.00</vProd></prod></det>
<det nItem="4"><prod><cProd>004</cProd><xProd>COMINHO EM PO</xProd><qCom>500.0000</qCom><uCom>G</uCom><vUnCom>0.0200</vUnCom><vProd>10.00</vProd></prod></det>
<det nItem="5"><prod><cProd>005</cProd><xProd>SUCO EXEMPLO</xProd><qCom>900.0000</qCom><uCom>ML</uCom><vUnCom>0.0100</vUnCom><vProd>9.00</vProd><vDesc>2.13</vDesc></prod></det>
<total><ICMSTot><vProd>56.13</vProd><vDesc>2.13</vDesc><vFrete>0.00</vFrete><vOutro>0.00</vOutro><vTotTrib>9.50</vTotTrib><vNF>54.00</vNF></ICMSTot></total>
<pag><detPag><tPag>03</tPag><vPag>50.00</vPag><card><tBand>02</tBand><cAut>999999</cAut></card></detPag></pag>
<infAdic><infCpl>CPF do consumidor ${CPF_CONSUMIDOR}</infCpl></infAdic>${extra}</infNFe>${prot}</NFe></nfeProc>`;
}
const normXML = (xml) => N.nfNormalizar(N.nfLerXML(xml));

// ---------- chave de acesso ----------
test("chave válida: dígito verificador, CNPJ, modelo, série, número, mês e UF são extraídos e conferidos", () => {
  const v = N.nfValidarChave(K65, { cnpj: "11.222.333/0001-81", modelo: "65", serie: 2, numero: 678, mes: "2026-10", uf: "SP", hoje: "2026-11-06" });
  assert.equal(v.ok, true); assert.deepEqual(v.erros, []);
  assert.deepEqual([v.campos.sigla_uf, v.campos.cnpj, v.campos.modelo, v.campos.serie, v.campos.numero, v.campos.mes_emissao, v.campos.tp_emis, v.campos.dv], ["SP", "11222333000181", "65", 2, 678, "2026-10", 1, 8]);
  assert.equal(N.nfValidarChave("3526 1011 2223 3300 0181 5500 1000 0123 4518 7654 3218").ok, true, "aceita a chave como vem impressa no DANFE (com espaços)");
  assert.equal(N.nfValidarChave(K55).campos.modelo, "55");
});
test("44 dígitos não bastam: dígito verificador errado, tamanho errado e sequência repetida são recusados", () => {
  const dv = N.nfValidarChave(K65.slice(0, 43) + "9");
  assert.equal(dv.ok, false); assert.deepEqual(dv.erros.map((e) => e.codigo), ["dv"]);
  const tam = N.nfValidarChave(K65.slice(0, 43)); assert.equal(tam.ok, false); assert.equal(tam.erros[0].codigo, "tamanho"); assert.equal(tam.campos, null);
  assert.ok(N.nfValidarChave("0".repeat(44)).erros.some((e) => e.codigo === "repetida"));
  assert.equal(N.nfValidarChave("").ok, false);
  assert.equal(N.nfValidarChave(undefined).ok, false);
});
test("modelo 55 e modelo 65 são aceitos; qualquer outro modelo é recusado", () => {
  assert.equal(N.nfValidarChave(K55).ok, true); assert.equal(N.NF_MODELOS["55"], "NF-e"); assert.equal(N.NF_MODELOS["65"], "NFC-e");
  const m57 = N.nfValidarChave(comDv(base("11222333000181", "57")));
  assert.equal(m57.ok, false); assert.ok(m57.erros.some((e) => e.codigo === "modelo"));
});
test("CNPJ inconsistente: dígito do CNPJ inválido na chave, ou CNPJ do emitente diferente do da chave", () => {
  const invalido = N.nfValidarChave(comDv(base("11222333000182")));
  assert.equal(invalido.ok, false); assert.ok(invalido.erros.some((e) => e.codigo === "cnpj"), "DV da chave certo, CNPJ errado");
  assert.equal(N.nfCnpjValido("11222333000181"), true); assert.equal(N.nfCnpjValido("11222333000182"), false); assert.equal(N.nfCnpjValido("11111111111111"), false);
  const div = N.nfValidarChave(K65, { cnpj: "45.543.915/0001-81" });
  assert.equal(div.ok, false); assert.deepEqual(div.erros.map((e) => e.codigo), ["cnpj_divergente"]);
});
test("série, número, mês de emissão e UF que não batem com a chave são apontados", () => {
  const v = N.nfValidarChave(K65, { serie: 3, numero: 999, mes: "2026-09", uf: "RJ" });
  assert.deepEqual(v.erros.map((e) => e.codigo), ["serie_divergente", "numero_divergente", "mes_divergente", "uf_divergente"]);
  const futura = N.nfValidarChave(K65, { hoje: "2026-09-01" }); assert.ok(futura.erros.some((e) => e.codigo === "mes"), "emissão depois de hoje");
  const mes13 = comDv(base("11222333000181").replace("352610", "352613")); assert.ok(N.nfValidarChave(mes13).erros.some((e) => e.codigo === "mes"));
  const uf99 = comDv("99" + K65.slice(2, 43)); assert.ok(N.nfValidarChave(uf99).erros.some((e) => e.codigo === "uf"));
});

// ---------- situação fiscal ----------
test("nota autorizada: XML com protocolo + cStat 100; guarda a evidência", () => {
  const n = normXML(xmlNFCe());
  assert.equal(n.situacao, "autorizada"); assert.match(n.situacao_evidencia, /protocolo 135260000000123 com cStat 100/);
  assert.deepEqual([n.modelo, n.tipo, n.chave_valida, n.formato, n.requer_conferencia], ["65", "NFC-e", true, "xml", false]);
});
test("NFC-e em contingência NÃO é tratada como autorizada sem protocolo", () => {
  const n = normXML(xmlNFCe({ chave: K65_CONT, numero: 679, tpEmis: "9", prot: "" }));
  assert.equal(n.situacao, "contingencia"); assert.equal(n.tp_emis, 9); assert.equal(n.chave_valida, true);
  assert.notEqual(n.situacao, "autorizada");
  assert.equal(N.nfSituacao({ cStat: 100, tp_emis: 9 }).situacao, "contingencia", "cStat sem protocolo não autoriza");
  assert.equal(N.nfSituacao({ cStat: 100, protocolo: "135260000000999", tp_emis: 9 }).situacao, "autorizada", "com protocolo, a contingência já foi autorizada depois");
  assert.equal(N.nfSituacao({ situacao_texto: "Autorizada o uso" }).situacao, "pendente", "texto sozinho não é evidência de autorização");
});
test("nota rejeitada e nota denegada", () => {
  const rej = normXML(xmlNFCe({ prot: "<protNFe><infProt><cStat>539</cStat><xMotivo>Rejeicao</xMotivo></infProt></protNFe>" }));
  assert.equal(rej.situacao, "rejeitada"); assert.match(rej.situacao_evidencia, /539/); assert.equal(rej.denegada, false);
  const den = N.nfSituacao({ cStat: 302 }); assert.deepEqual([den.situacao, den.denegada], ["rejeitada", true]);
});
test("nota cancelada: evento de cancelamento homologado (110111, cStat 135) vence a autorização", () => {
  const ev = '<procEventoNFe><retEvento><infEvento><cStat>135</cStat><tpEvento>110111</tpEvento></infEvento></retEvento></procEventoNFe>';
  const n = normXML(xmlNFCe({ extra: ev }));
  assert.equal(n.situacao, "cancelada"); assert.match(n.situacao_evidencia, /cancelamento/);
  const outroEvento = '<procEventoNFe><retEvento><infEvento><cStat>135</cStat><tpEvento>110110</tpEvento></infEvento></retEvento></procEventoNFe>';
  assert.equal(normXML(xmlNFCe({ extra: outroEvento })).situacao, "autorizada", "carta de correção não cancela");
  assert.equal(N.nfSituacao({ cStat: 101 }).situacao, "cancelada");
  assert.equal(N.nfSituacao({}).situacao, "pendente");
  assert.deepEqual(Object.keys(N.NF_SITUACOES), ["autorizada", "contingencia", "pendente", "rejeitada", "cancelada"]);
});

// ---------- itens, unidades e valores ----------
test("itens em unidade, kg, g, litro e mililitro: quantidade com casas decimais e quantidade-base", () => {
  const n = normXML(xmlNFCe());
  const por = Object.fromEntries(n.itens.map((i) => [i.descricao, i]));
  assert.deepEqual([por["BANANA PRATA"].qtd, por["BANANA PRATA"].unidade.cod, por["BANANA PRATA"].unidade.familia], [0.734, "kg", "massa"]);
  assert.deepEqual([por["AZEITE EXEMPLO"].qtd, por["AZEITE EXEMPLO"].unidade.cod, por["AZEITE EXEMPLO"].unidade.familia], [2, "l", "volume"]);
  assert.deepEqual([por["BOLACHA EXEMPLO"].qtd, por["BOLACHA EXEMPLO"].unidade.cod], [3, "un"]);
  assert.deepEqual(por["COMINHO EM PO"].qtd_base, { qtd: 0.5, unidade: "kg" }, "500 g = 0,5 kg");
  assert.deepEqual(por["SUCO EXEMPLO"].qtd_base, { qtd: 0.9, unidade: "l" }, "900 ml = 0,9 l");
  assert.deepEqual([por["SUCO EXEMPLO"].desconto, por["BANANA PRATA"].unitario, por["BANANA PRATA"].total], [2.13, 6.99, 5.13]);
  for (const [txt, cod] of [["Quilograma", "kg"], ["KGS", "kg"], ["Grama", "g"], ["Litro", "l"], ["Mililitro", "ml"], ["UND", "un"], ["Unidade", "un"], ["CX", "cx"]]) assert.equal(N.nfUnidade(txt).cod, cod, txt);
  const estranha = N.nfUnidade("ARROBA"); assert.deepEqual([estranha.reconhecida, estranha.familia], [false, "outra"]);
  assert.equal(N.nfDec("1.234,500"), 1234.5); assert.equal(N.nfDec("0.7340"), 0.734); assert.equal(N.nfDec("1,5"), 1.5); assert.equal(N.nfDec("abc"), null);
  assert.match(N.nfNormalizar({ itens: [{ descricao: "X", qtd: "1", unidade: "ARROBA" }] }).avisos.join(" "), /Unidade não reconhecida: ARROBA/);
});
test("desconto, e total da nota diferente do valor efetivamente pago (não são presumidos iguais)", () => {
  const n = normXML(xmlNFCe());
  assert.deepEqual([n.valores.produtos, n.valores.descontos, n.valores.frete, n.valores.impostos, n.valores.total], [56.13, 2.13, 0, 9.5, 54]);
  assert.equal(n.valores.a_pagar, 50, "vem do pagamento, não do total");
  assert.equal(n.diferenca_pagamento, -4); assert.match(n.avisos.join(" "), /valor a pagar difere do total/);
  assert.ok(!/não fecha/.test(n.avisos.join(" ")), "56,13 − 2,13 = 54,00: a conta da nota fecha");
  const troco = N.nfNormalizar({ valores: { total: 45 }, pagamentos: [{ codigo: "01", valor: 50 }], troco: 5 });
  assert.equal(troco.valores.a_pagar, 45); assert.equal(troco.diferenca_pagamento, 0);
  const semPag = N.nfNormalizar({ valores: { total: 45 } }); assert.equal(semPag.valores.a_pagar, null); assert.equal(semPag.diferenca_pagamento, null);
  const furo = N.nfNormalizar({ valores: { produtos: 100, descontos: 10, total: 95 } }); assert.match(furo.avisos.join(" "), /conta dos valores da nota não fecha/);
  const frete = N.nfNormalizar({ valores: { produtos: 100, descontos: 10, frete: 5, total: 95 } }); assert.ok(!/não fecha/.test(frete.avisos.join(" ")));
});
test("normalização completa: emitente, data, número, série, chave, modelo e pagamento (bandeira, nunca cartão inteiro)", () => {
  const n = normXML(xmlNFCe());
  assert.deepEqual([n.chave, n.numero, n.serie, n.data_emissao, n.emitente.nome, n.emitente.cnpj, n.emitente.uf], [K65, "678", "2", "2026-10-20", "MERCADO EXEMPLO LTDA", "11222333000181", "SP"]);
  assert.deepEqual(n.pagamentos, [{ codigo: "03", forma: "Cartão de crédito", valor: 50, bandeira: "Mastercard", final: null }]);
  const dan = N.nfNormalizar({ formato: "danfe", chave: K55, pagamentos: [{ codigo: "04", valor: 10, bandeira: "Visa", final: "4111111111111234" }] });
  assert.equal(dan.pagamentos[0].final, "1234", "só os 4 últimos dígitos"); assert.ok(!JSON.stringify(dan).includes("4111111111111234"));
  assert.equal(dan.requer_conferencia, true, "DANFE/PDF/foto sempre pedem conferência"); assert.deepEqual([dan.modelo, dan.numero, dan.serie], ["55", "12345", "1"]);
  const foto = N.nfNormalizar({ formato: "imagem", chave: K65.slice(0, 40) });
  assert.deepEqual([foto.chave, foto.chave_valida, foto.requer_conferencia, foto.modelo], [null, false, true, null]);
  assert.deepEqual(Object.keys(N.NF_FORMATOS), ["xml", "pdf", "danfe", "imagem"]);
  const errada = N.nfNormalizar({ formato: "xml", chave: K65, modelo: "55", emitente: { cnpj: "45543915000181" } });
  assert.equal(errada.chave_valida, false); assert.equal(errada.requer_conferencia, true);
});

// ---------- privacidade ----------
test("nenhum CPF nem dado do consumidor no objeto normalizado (nem na estrutura, nem nos valores)", () => {
  const xml = xmlNFCe();
  assert.ok(xml.includes(CPF_CONSUMIDOR) && xml.includes("CONSUMIDOR FICTICIO"), "o XML de entrada tem os dados pessoais");
  const n = normXML(xml);
  const texto = JSON.stringify(n);
  assert.ok(!texto.includes(CPF_CONSUMIDOR), "CPF fora"); assert.ok(!/CONSUMIDOR FICTICIO/.test(texto), "nome do consumidor fora"); assert.ok(!/RUA DO EMITENTE/.test(texto), "endereço fora");
  assert.deepEqual(N.nfTemDadoPessoal(n), { ok: true, achados: [] });
  assert.deepEqual(Object.keys(n).filter((k) => /cpf|consumidor|destin|cliente/i.test(k)), []);
  const lido = N.nfLerXML(xml); assert.ok(!JSON.stringify(lido).includes(CPF_CONSUMIDOR), "nem o leitor do XML copia o CPF");
  const entrada = N.nfNormalizar({ chave: K65, cpf_consumidor: CPF_CONSUMIDOR, consumidor: { nome: "Fulano" }, pagamentos: [{ codigo: "03", valor: 1, numero_cartao: "4111111111111111", cvv: "123" }] });
  assert.ok(!JSON.stringify(entrada).includes(CPF_CONSUMIDOR) && !JSON.stringify(entrada).includes("4111111111111111") && !JSON.stringify(entrada).includes("123\""), "campos extras da entrada são descartados");
  assert.equal(N.nfTemDadoPessoal({ consumidor: { cpf: "1" } }).ok, false); assert.equal(N.nfTemDadoPessoal({ x: "CPF 529.982.247-25" }).ok, false);
  assert.equal(N.nfTemDadoPessoal({ cpf_consumidor: CPF_CONSUMIDOR }).ok, false);
});

// ---------- vínculos ----------
const AUTORIZADA = () => normXML(xmlNFCe());
test("vínculo é só conferência: nunca gera despesa e avisa quando o valor do registro difere da nota", () => {
  const nota = AUTORIZADA();
  assert.equal(nota.gera_despesa, false);
  const ok = N.nfVincular(nota, { modulo: "mercado", id: "m1", total: 50 });
  assert.equal(ok.ok, true); assert.equal(ok.vinculo.gera_despesa, false); assert.equal(ok.vinculo.tipo, "conferencia"); assert.equal(ok.vinculo.confere, true);
  const dif = N.nfVincular(nota, { modulo: "compras", id: "c1", total: 54 });
  assert.equal(dif.ok, true); assert.equal(dif.vinculo.confere, false); assert.match(dif.avisos.join(" "), /difere do valor da nota em R\$ 4,00/);
  for (const m of ["compras", "mercado", "alimentacao", "veiculos"]) assert.equal(N.nfVincular(nota, { modulo: m, id: 1 }).ok, true, m);
  assert.deepEqual(Object.keys(N.NF_MODULOS), ["compras", "mercado", "alimentacao", "veiculos"]);
  assert.equal(N.nfVincular(nota, { modulo: "saude", id: 1 }).ok, false);
  assert.equal(N.nfVincular(nota, { modulo: "mercado" }).ok, false);
});
test("vínculo: nota cancelada ou rejeitada não documenta compra; contingência/pendente vinculam com aviso; repetido é recusado", () => {
  const canc = { ...AUTORIZADA(), situacao: "cancelada" }, rej = { ...AUTORIZADA(), situacao: "rejeitada" };
  assert.match(N.nfVincular(canc, { modulo: "mercado", id: 1 }).erros.join(" "), /cancelada/);
  assert.match(N.nfVincular(rej, { modulo: "mercado", id: 1 }).erros.join(" "), /rejeitada/);
  const cont = normXML(xmlNFCe({ chave: K65_CONT, numero: 679, tpEmis: "9", prot: "" }));
  const c = N.nfVincular(cont, { modulo: "mercado", id: 1 }); assert.equal(c.ok, true); assert.match(c.avisos.join(" "), /contingência.*sem autorização comprovada/i);
  const nota = AUTORIZADA(), v1 = N.nfVincular(nota, { modulo: "mercado", id: "m1" }).vinculo;
  const dup = N.nfVincular(nota, { modulo: "mercado", id: "m1" }, [v1]); assert.equal(dup.ok, false); assert.match(dup.erros.join(" "), /já está vinculada/);
  const outro = N.nfVincular(nota, { modulo: "mercado", id: "m2" }, [v1]); assert.equal(outro.ok, true); assert.match(outro.avisos.join(" "), /outro registro/);
  assert.equal(N.nfVincular(nota, { modulo: "compras", id: "m1" }, [v1]).ok, true, "mesmo id em outro módulo é outro registro");
});
test("o núcleo fiscal não cria lançamento: nada na API exporta despesa e as despesas de Compras seguem sem as notas", () => {
  assert.deepEqual(Object.keys(N).filter((k) => /^nf/.test(k) && /desp|lanc|credito/i.test(k)), []);
  assert.deepEqual(N.coDespesas([]), []);
  assert.equal(AUTORIZADA().gera_despesa, false);
});

// ---------- Lote 1.2 · validação aritmética (nfValidarSoma, nfVeredito) e duplicidade (nfDuplicidade) ----------
// Notas e valores FICTÍCIOS. Diferença (reais) = calculado − total fiscal: positivo = os itens somam mais que a nota.
const NOTA = (itens, valores, extra = {}) => N.nfNormalizar({ formato: "xml", chave: K65, modelo: "65", serie: 2, numero: 678, data_emissao: "2026-10-20",
  emitente: { nome: "MERCADO EXEMPLO LTDA", cnpj: "11222333000181", uf: "SP" }, cStat: 100, protocolo: "135260000000123", itens, valores, ...extra });
const it = (descricao, qtd, unidade, unitario, total, desconto) => ({ descricao, qtd, unidade, unitario, total, desconto });
const cods = (v) => v.motivos.map((m) => m.codigo);

test("XML no formato real: a conta dos itens fecha com o total fiscal e a nota é consistente", () => {
  const v = N.nfVeredito(normXML(xmlNFCe()));
  assert.equal(v.classe, "consistente"); assert.equal(v.gravar_validada, true); assert.equal(v.acao, "gravar");
  assert.equal(v.diferenca, 0); assert.equal(v.soma.soma_itens, 56.13); assert.equal(v.soma.descontos, 2.13); assert.equal(v.soma.total_calculado, 54); assert.equal(v.soma.total_fiscal, 54);
  assert.deepEqual(v.motivos, []);
  assert.match(v.avisos.join(" "), /valor a pagar difere do total da nota em R\$ 4,00/, "aviso, não bloqueio");
  assert.ok(v.soma.itens.every((i) => i.ok && i.verificado), "os 5 itens foram conferidos");
});
test("desconto por item: líquido fecha com o total; desconto maior que o item e soma de descontos errada são divergência", () => {
  const ok = N.nfVeredito(NOTA([it("A", 2, "UN", "10.00", "20.00", "3.00"), it("B", 1, "UN", "5.50", "5.50")], { produtos: 25.5, descontos: 3, total: 22.5 }));
  assert.equal(ok.classe, "consistente"); assert.equal(ok.soma.descontos, 3);
  const sem = N.nfVeredito(NOTA([it("A", 2, "UN", "10.00", "20.00", "3.00"), it("B", 1, "UN", "5.50", "5.50")], { total: 22.5 }));
  assert.equal(sem.classe, "consistente", "sem os totais de produtos e descontos, vale a soma dos itens");
  const maior = N.nfVeredito(NOTA([it("A", 1, "UN", "4.00", "4.00", "5.00")], { produtos: 4, descontos: 5, total: 0 }));
  assert.equal(maior.classe, "divergente"); assert.ok(cods(maior).includes("item_desconto"));
  const soma = N.nfVeredito(NOTA([it("A", 2, "UN", "10.00", "20.00", "3.00")], { produtos: 20, descontos: 1, total: 19 }));
  assert.equal(soma.classe, "divergente"); assert.ok(cods(soma).includes("soma_descontos"));
});
test("produto pesado com três casas: quantidade × unitário confere; total trocado é divergência do item", () => {
  const ok = N.nfVeredito(NOTA([it("BANANA", "0.734", "KG", "6.99", "5.13"), it("QUEIJO", "0.333", "KG", "9.99", "3.32")], { produtos: 8.45, total: 8.45 }));
  assert.equal(ok.classe, "consistente", "5,13066 arredonda; 3,32667 truncado em 3,32 cabe na tolerância de 1 centavo");
  const errado = N.nfVeredito(NOTA([it("BANANA", "0.734", "KG", "6.99", "6.13")], { produtos: 6.13, total: 6.13 }));
  assert.equal(errado.classe, "divergente"); assert.deepEqual(cods(errado), ["item_conta"]);
  assert.equal(errado.soma.divergencias[0].item, 1); assert.equal(errado.soma.divergencias[0].diferenca, 1);
  assert.match(errado.motivos[0].texto, /Item 1 \(BANANA\).*0,734 × R\$ 6,99 dá R\$ 5,13.*traz R\$ 6,13/);
});
test("combustível em litros: unitário com 4 casas (R$ 5,899) não perde o milésimo e a conta fecha com desconto", () => {
  const n = NOTA([it("GASOLINA COMUM", "37.123", "LT", "5.8990", "218.99", "1.50")], { produtos: 218.99, descontos: 1.5, total: 217.49 });
  assert.equal(n.itens[0].unitario, 5.899, "o normalizador mantém 4 casas");
  assert.equal(n.itens[0].qtd_base.unidade, "l");
  const v = N.nfVeredito(n); assert.equal(v.classe, "consistente"); assert.equal(v.diferenca, 0);
  const errado = N.nfVeredito(NOTA([it("GASOLINA COMUM", "37.123", "LT", "5.8990", "228.99")], { produtos: 228.99, total: 228.99 }));
  assert.equal(errado.classe, "divergente"); assert.ok(cods(errado).includes("item_conta"));
});
test("acréscimos e componentes fiscais: frete, outras, seguro, ST, FCP ST, IPI somam; ICMS desonerado subtrai", () => {
  const itens = [it("A", 2, "UN", "10.00", "20.00"), it("B", 1, "UN", "30.00", "30.00")];
  const val = { produtos: 50, descontos: 5, frete: 10, outras: 3, seguro: 2, st: 4.5, fcp_st: 0.5, ipi: 1.25, deson: 3, total: 63.25 };
  const v = N.nfVeredito(NOTA(itens, val)); assert.equal(v.classe, "consistente"); assert.equal(v.soma.acrescimos, 21.25); assert.equal(v.soma.desonerado, 3); assert.equal(v.soma.total_calculado, 63.25);
  assert.ok(!/não fecha/.test(NOTA(itens, val).avisos.join(" ")), "o aviso do normalizador também conhece os componentes");
  const sem = N.nfVeredito(NOTA(itens, { ...val, total: 50 })); assert.equal(sem.classe, "divergente"); assert.equal(sem.diferenca, 13.25);
  assert.equal(N.nfVeredito(NOTA(itens, { produtos: 50, frete: 8, total: 50 })).diferenca, 8, "frete que não está no total aparece como diferença");
});
test("XML lê os componentes do ICMSTot (seguro, ST, IPI, desonerado) e a conta fecha com eles", () => {
  const xml = xmlNFCe().replace("<vTotTrib>9.50</vTotTrib><vNF>54.00</vNF>", "<vST>3.00</vST><vIPI>1.00</vIPI><vSeg>0.50</vSeg><vICMSDeson>0.50</vICMSDeson><vTotTrib>9.50</vTotTrib><vNF>58.00</vNF>");
  const l = N.nfLerXML(xml); assert.deepEqual([l.valores.st, l.valores.ipi, l.valores.seguro, l.valores.deson], ["3.00", "1.00", "0.50", "0.50"]);
  const v = N.nfVeredito(N.nfNormalizar(l)); assert.equal(v.classe, "consistente"); assert.equal(v.soma.total_calculado, 58);
  assert.equal(N.nfVeredito(normXML(xmlNFCe())).soma.acrescimos, 0, "XML sem esses campos não muda");
});
test("um centavo é arredondamento aceito (com aviso); dois centavos ou mais é divergência com a diferença em reais", () => {
  const itens = [it("A", 3, "UN", "4.00", "12.00")];
  const um = N.nfVeredito(NOTA(itens, { produtos: 12, total: 12.01 }));
  assert.equal(um.classe, "consistente"); assert.equal(um.soma.arredondamento, true); assert.equal(um.diferenca, -0.01); assert.match(um.avisos.join(" "), /arredondamento aceito/);
  const um2 = N.nfVeredito(NOTA(itens, { produtos: 12, total: 11.99 })); assert.equal(um2.classe, "consistente"); assert.equal(um2.diferenca, 0.01);
  const dois = N.nfVeredito(NOTA(itens, { produtos: 12, total: 12.02 }));
  assert.equal(dois.classe, "divergente"); assert.equal(dois.diferenca, -0.02); assert.equal(dois.acao, "corrigir"); assert.equal(dois.gravar_validada, false);
  assert.equal(dois.diferenca_texto, "R$ 0,02 a menos que o total fiscal.");
  const grande = N.nfVeredito(NOTA(itens, { produtos: 12, total: 6 }));
  assert.equal(grande.diferenca, 6); assert.equal(grande.diferenca_texto, "R$ 6,00 a mais que o total fiscal."); assert.match(grande.motivos[0].texto, /R\$ 6,00 a mais/);
  assert.equal(N.nfVeredito(NOTA(itens, { produtos: 12, total: 12 })).soma.arredondamento, false);
});
test("soma dos itens diferente do total de produtos declarado é divergência própria", () => {
  const v = N.nfVeredito(NOTA([it("A", 1, "UN", "10.00", "10.00"), it("B", 1, "UN", "5.00", "5.00")], { produtos: 20, total: 15 }));
  assert.equal(v.classe, "divergente"); assert.deepEqual(cods(v), ["soma_produtos"]); assert.equal(v.soma.divergencias[0].diferenca, -5);
});
test("baixa confiança: falta quantidade/valor do item, total ausente, nota sem itens ou chave inválida pedem nova leitura", () => {
  const semQtd = N.nfVeredito(NOTA([it("A", null, "UN", "10.00", "10.00")], { total: 10 }));
  assert.equal(semQtd.classe, "baixa_confianca"); assert.equal(semQtd.acao, "nova_leitura"); assert.deepEqual(cods(semQtd), ["item_incompleto"]); assert.equal(semQtd.gravar_validada, false);
  assert.equal(N.nfVeredito(NOTA([it("A", 1, "UN", "10.00", null)], { total: 10 })).classe, "baixa_confianca");
  assert.deepEqual(cods(N.nfVeredito(NOTA([it("A", 1, "UN", "10.00", "10.00")], {}))), ["sem_total"]);
  assert.deepEqual(cods(N.nfVeredito(NOTA([], { total: 10 }))), ["sem_itens"]);
  const chave = N.nfVeredito(NOTA([it("A", 1, "UN", "10.00", "10.00")], { total: 10 }, { chave: K65.slice(0, 43) + "9" }));
  assert.equal(chave.classe, "baixa_confianca"); assert.deepEqual(cods(chave), ["chave_invalida"]);
  assert.equal(N.nfVeredito(null).classe, "baixa_confianca", "entrada vazia nunca vira consistente");
});
test("foto ou PDF: só vale com a confiança da leitura informada e no mínimo 0,9; baixa confiança vem antes da divergência", () => {
  const foto = (v) => NOTA([it("A", 2, "UN", "5.00", "10.00")], v || { produtos: 10, total: 10 }, { formato: "imagem" });
  assert.equal(N.nfVeredito(foto()).classe, "baixa_confianca"); assert.deepEqual(cods(N.nfVeredito(foto())), ["confianca_ausente"]);
  const b = N.nfVeredito(foto(), { confianca: 0.62 }); assert.deepEqual(cods(b), ["confianca_baixa"]); assert.match(b.motivos[0].texto, /62%.*90%/);
  assert.equal(N.nfVeredito(foto(), { confianca: 0.95 }).classe, "consistente");
  assert.equal(N.nfVeredito(foto(), { confianca: 0.9 }).classe, "consistente", "o mínimo é inclusivo");
  assert.equal(N.nfVeredito(foto(), { confianca: 0.85, minimo: 0.8 }).classe, "consistente");
  const ambos = N.nfVeredito(foto({ produtos: 10, total: 25 }), { confianca: 0.5 });
  assert.equal(ambos.classe, "baixa_confianca"); assert.deepEqual(cods(ambos), ["confianca_baixa", "total"]);
  assert.equal(N.nfVeredito(foto({ produtos: 10, total: 25 }), { confianca: 0.97 }).classe, "divergente", "leitura confiável que não fecha é divergência real");
  assert.equal(N.nfVeredito(normXML(xmlNFCe()), { confianca: 0.1 }).classe, "consistente", "XML não depende de confiança de leitura");
});
test("nfValidarSoma não altera a nota, usa só centavos inteiros e devolve a conta item a item", () => {
  const n = NOTA([it("A", 3, "UN", "0.10", "0.30"), it("B", 3, "UN", "0.20", "0.60")], { produtos: 0.9, total: 0.9 }), copia = JSON.stringify(n);
  const s = N.nfValidarSoma(n); assert.equal(JSON.stringify(n), copia);
  assert.equal(s.ok, true); assert.equal(s.soma_itens, 0.9, "0,3 + 0,6 não gera 0,8999999999999999"); assert.equal(s.total_calculado, 0.9);
  assert.deepEqual(s.itens.map((i) => [i.indice, i.ok, i.esperado, i.informado]), [[1, true, 0.3, 0.3], [2, true, 0.6, 0.6]]);
  assert.equal(s.tolerancia, 0.01);
  assert.equal(N.nfValidarSoma().ok, false);
});

// ---------- duplicidade ----------
const NOTA_DUP = () => NOTA([it("A", 1, "UN", "54.00", "54.00")], { produtos: 54, total: 54 });
const gravada = (o = {}) => ({ id: "n1", chave: K65, modelo: "65", serie: 2, numero: 678, emitente_cnpj: "11222333000181", data_emissao: "2026-10-20", valor_total: 54, sha256: "a".repeat(64), ...o });
test("duplicidade entre notas: a mesma chave (mesmo formatada), o mesmo arquivo ou emitente+modelo+série+número é a mesma nota", () => {
  const nota = NOTA_DUP();
  const porChave = N.nfDuplicidade(nota, { notas: [gravada({ chave: K65.replace(/(.{4})/g, "$1 ") })] });
  assert.equal(porChave.duplicada, true); assert.equal(porChave.acao, "ja_gravada"); assert.equal(porChave.achados[0].origem, "nota"); assert.equal(porChave.achados[0].nivel, "confirmada"); assert.match(porChave.achados[0].motivo, /chave/);
  const porSha = N.nfDuplicidade(nota, { notas: [gravada({ chave: null, numero: 1, sha256: "B".repeat(64) })] }, { sha256: "b".repeat(64) });
  assert.equal(porSha.duplicada, true); assert.match(porSha.achados[0].motivo, /SHA-256/);
  const porNumero = N.nfDuplicidade(nota, { notas: [gravada({ chave: null, sha256: null })] });
  assert.equal(porNumero.duplicada, true); assert.match(porNumero.achados[0].motivo, /emitente, modelo, série e número/);
  assert.equal(N.nfDuplicidade(nota, { notas: [gravada({ chave: null, sha256: null, numero: 999 })] }).duplicada, false, "outro número: outra nota");
  assert.equal(N.nfDuplicidade(nota, { notas: [gravada({ chave: null, sha256: null, modelo: "55" })] }).duplicada, false, "outro modelo: outra nota");
  assert.equal(N.nfDuplicidade(nota, { notas: [gravada()] }, { ignorar_id: "n1" }).duplicada, false, "regravar a própria nota não é duplicidade");
});
test("mesma data, valor e emitente em outra nota é só 'possível': não bloqueia", () => {
  const p = N.nfDuplicidade(NOTA_DUP(), { notas: [gravada({ chave: null, sha256: null, numero: 999, valor_total: 54.01 })] });
  assert.equal(p.duplicada, false); assert.equal(p.possivel_duplicada, true); assert.equal(p.achados[0].nivel, "possivel"); assert.equal(p.acao, "gravar_nova");
  assert.equal(N.nfDuplicidade(NOTA_DUP(), { notas: [gravada({ chave: null, sha256: null, numero: 999, valor_total: 54.5 })] }).possivel_duplicada, false);
  assert.equal(N.nfDuplicidade(NOTA_DUP(), { notas: [gravada({ chave: null, sha256: null, numero: 999, emitente_cnpj: "45543915000181" })] }).possivel_duplicada, false);
});
test("compra online e Mercado: chave citada vincula; mesma data, valor e estabelecimento pede confirmação; nunca cria despesa", () => {
  const nota = NOTA_DUP();
  const c = N.nfDuplicidade(nota, { compras: [{ id: "c1", chave_nfe: K65, total_pago: 99, data: "2026-01-01", loja: "amazon" }] });
  assert.equal(c.acao, "vincular"); assert.deepEqual(c.vinculo_sugerido, { modulo: "compras", id: "c1", nivel: "confirmada", motivo: "a compra online já cita esta nota fiscal" }); assert.equal(c.duplicada, false);
  const m = N.nfDuplicidade(nota, { mercado: [{ id: "m1", data: "2026-10-20", total: 54, mercados: { nome: "Mercado Exemplo" } }] });
  assert.equal(m.acao, "confirmar_vinculo"); assert.equal(m.vinculo_sugerido.modulo, "mercado"); assert.equal(m.vinculo_sugerido.nivel, "possivel");
  const mc = N.nfDuplicidade(nota, { mercado: [{ id: "m2", chave: K65, data: "2026-10-01", total: 1, mercado: "Outro" }] });
  assert.equal(mc.acao, "vincular"); assert.equal(mc.vinculo_sugerido.id, "m2");
  const outroNome = N.nfDuplicidade(nota, { mercado: [{ id: "m3", data: "2026-10-20", total: 54, mercado: "Padaria Qualquer" }] });
  assert.equal(outroNome.acao, "gravar_nova", "mesmo dia e valor, mas outro estabelecimento");
  const diaDiferente = N.nfDuplicidade(nota, { mercado: [{ id: "m4", data: "2026-10-21", total: 54, mercado: "Mercado Exemplo" }] }); assert.equal(diaDiferente.acao, "gravar_nova");
  const comp = N.nfDuplicidade(nota, { compras: [{ id: "c2", total_pago: 54, data: "2026-10-20", vendedor: "Mercado Exemplo Ltda" }] });
  assert.equal(comp.acao, "confirmar_vinculo"); assert.equal(comp.vinculo_sugerido.modulo, "compras");
  const ambos = N.nfDuplicidade(nota, { mercado: [{ id: "m1", data: "2026-10-20", total: 54, mercado: "Mercado Exemplo" }], compras: [{ id: "c1", chave_nfe: K65 }] });
  assert.equal(ambos.vinculo_sugerido.modulo, "compras", "a confirmada vence a possível");
  for (const r of [c, m, mc, outroNome, comp, ambos]) assert.equal(r.pode_criar_despesa, false);
});
test("despesa já lançada com a mesma data e valor impede segunda despesa; sem nada parecido grava como nova", () => {
  const nota = NOTA_DUP();
  const d = N.nfDuplicidade(nota, { despesas: [{ id: "d1", data: "2026-10-20", valor: 54, descricao: "Mercado Exemplo" }] });
  assert.equal(d.tem_despesa, true); assert.equal(d.pode_criar_despesa, false); assert.equal(d.achados[0].origem, "despesa");
  const livre = N.nfDuplicidade(nota, { notas: [gravada({ chave: null, sha256: null, numero: 5, data_emissao: "2026-09-01", valor_total: 10 })], compras: [], mercado: [], despesas: [{ id: "d2", data: "2026-10-20", valor: 70 }] });
  assert.equal(livre.acao, "gravar_nova"); assert.equal(livre.tem_despesa, false); assert.deepEqual(livre.achados, []); assert.equal(livre.vinculo_sugerido, null); assert.equal(livre.pode_criar_despesa, false);
  assert.equal(N.nfDuplicidade(nota).acao, "gravar_nova"); assert.equal(N.nfDuplicidade().acao, "gravar_nova");
});
test("o Lote 1.2 só exporta regras puras: nada de despesa, gravação ou rede na API", () => {
  for (const f of ["nfValidarSoma", "nfVeredito", "nfDuplicidade"]) assert.equal(typeof N[f], "function", f);
  assert.deepEqual(Object.keys(N).filter((k) => /^nf/.test(k) && /desp|lanc|credito|gravar_validada/i.test(k)), []);
});

// ---------- revisão final do Lote 1.2 ----------
test("situação fiscal e conta são independentes: contingência/pendente consistentes são guardáveis como pendentes, nunca como validadas", () => {
  const itens = [it("A", 1, "UN", "10.00", "10.00")];
  const cont = N.nfVeredito(NOTA(itens, { total: 10 }, { chave: K65_CONT, numero: 679, tp_emis: 9, cStat: null, protocolo: null }));
  assert.equal(cont.classe, "consistente", "a conta está certa"); assert.equal(cont.fiscal.situacao, "contingencia"); assert.equal(cont.fiscal.pendente, true); assert.equal(cont.fiscal.definitiva, false);
  assert.equal(cont.acao, "gravar_pendente_fiscal"); assert.equal(cont.gravar_pendente, true); assert.equal(cont.gravar_validada, false); assert.equal(cont.pode_alimentar_financeiro, false);
  assert.match(cont.avisos.join(" "), /contingência.*pendente de validação fiscal.*até a autorização/i); assert.deepEqual(cont.bloqueios, []);
  const pend = N.nfVeredito(NOTA(itens, { total: 10 }, { cStat: null, protocolo: null }));
  assert.equal(pend.fiscal.situacao, "pendente"); assert.equal(pend.acao, "gravar_pendente_fiscal"); assert.equal(pend.gravar_validada, false);
  const aut = N.nfVeredito(NOTA(itens, { total: 10 }));
  assert.equal(aut.fiscal.situacao, "autorizada"); assert.equal(aut.fiscal.definitiva, true); assert.equal(aut.acao, "gravar"); assert.equal(aut.gravar_validada, true); assert.equal(aut.pode_alimentar_financeiro, true); assert.equal(aut.gravar_pendente, false);
  // o inverso: autorizada com a conta errada continua autorizada, mas não é validada
  const errada = N.nfVeredito(NOTA(itens, { total: 99 }));
  assert.equal(errada.fiscal.situacao, "autorizada"); assert.equal(errada.classe, "divergente"); assert.equal(errada.gravar_validada, false); assert.equal(errada.pode_alimentar_financeiro, false); assert.equal(errada.gravar_pendente, false);
  // pendente com a conta errada não vira "gravar pendente"
  const pErrada = N.nfVeredito(NOTA(itens, { total: 99 }, { cStat: null, protocolo: null })); assert.equal(pErrada.acao, "corrigir"); assert.equal(pErrada.gravar_pendente, false);
  assert.equal(N.nfVeredito({ ...NOTA(itens, { total: 10 }), situacao: undefined }).fiscal.situacao, "pendente", "sem situação conhecida, nunca definitiva");
});
test("pendente é gravável sem ser conferida nem 'autorizada': nfParaGravar leva a situação e não confere sozinha", () => {
  const lido = N.nfLerXML(xmlNFCe({ chave: K65_CONT, numero: 679, tpEmis: "9", prot: "" })), n = N.nfNormalizar(lido);
  const g = N.nfParaGravar(lido, n, { id: "11111111-1111-4111-8111-111111111111", dono: "u", nome: "n.xml", mime: "text/xml", tamanho: 100, sha256: "c".repeat(64), conferir: false });
  assert.equal(g.ok, true, g.erros.join(" ")); assert.equal(g.args.p_nota.situacao, "contingencia"); assert.equal(g.args.p_nota.protocolo, null); assert.equal(g.args.p_conferir, false);
});
test("nota cancelada ou rejeitada: bloqueada com motivo, auditoria preservada, nada de Financeiro (mesmo com a conta certa)", () => {
  const itens = [it("A", 1, "UN", "10.00", "10.00")];
  for (const [rot, extra] of [["cancelada", { cancelada: true }], ["rejeitada", { cStat: 204 }]]) {
    const v = N.nfVeredito(NOTA(itens, { total: 10 }, extra));
    assert.equal(v.classe, "consistente", rot + ": a conta continua sendo só a conta"); assert.equal(v.fiscal.situacao, rot); assert.equal(v.fiscal.bloqueada, true);
    assert.equal(v.acao, "bloquear"); assert.equal(v.gravar_validada, false); assert.equal(v.gravar_pendente, false); assert.equal(v.pode_alimentar_financeiro, false);
    assert.equal(v.bloqueios[0].codigo, "situacao_" + rot); assert.match(v.bloqueios[0].texto, /não vale como compra fiscal validada.*Financeiro.*nova leitura|não alimenta o Financeiro.*Refaça a leitura/);
    assert.deepEqual(v.auditoria, { preservar_documento: true, registrar_tentativa: true });
    assert.equal(N.nfVincular(NOTA(itens, { total: 10 }, extra), { modulo: "mercado", id: 1 }).ok, false, "nem vínculo");
  }
  assert.equal(N.nfVeredito(NOTA(itens, { total: 99 }, { cancelada: true })).acao, "bloquear", "o bloqueio vence a correção");
});
test("nenhum veredito deixa a nota alimentar o Financeiro sem ser consistente E autorizada", () => {
  const itens = [it("A", 1, "UN", "10.00", "10.00")];
  const casos = [[{ total: 10 }, {}, true], [{ total: 10 }, { cancelada: true }, false], [{ total: 10 }, { cStat: 204 }, false], [{ total: 10 }, { cStat: null, protocolo: null }, false], [{ total: 11 }, {}, false], [{}, {}, false], [{ total: 10 }, { chave: "123" }, false]];
  for (const [val, extra, esperado] of casos) { const v = N.nfVeredito(NOTA(itens, val, extra)); assert.equal(v.pode_alimentar_financeiro, esperado, JSON.stringify([val, extra])); assert.equal(v.pode_alimentar_financeiro, v.gravar_validada); }
  assert.equal(N.nfVeredito(NOTA(itens, { total: 10 }, { formato: "imagem" })).pode_alimentar_financeiro, false, "foto sem confiança informada");
});
test("desconto não é subtraído duas vezes: total do item é bruto; item já líquido não fecha e é apontado", () => {
  const bruto = N.nfVeredito(NOTA([it("A", 2, "UN", "10.00", "20.00", "5.00")], { produtos: 20, descontos: 5, total: 15 }));
  assert.equal(bruto.classe, "consistente"); assert.equal(bruto.soma.total_calculado, 15);
  const liquido = N.nfVeredito(NOTA([it("A", 2, "UN", "10.00", "15.00", "5.00")], { produtos: 15, descontos: 5, total: 10 }));
  assert.equal(liquido.classe, "divergente"); assert.ok(cods(liquido).includes("item_conta"), "20 ≠ 15: o item já vinha líquido");
  const dupla = N.nfVeredito(NOTA([it("A", 2, "UN", "10.00", "20.00", "5.00")], { produtos: 20, descontos: 5, total: 10 }));
  assert.equal(dupla.diferenca, 5); assert.equal(dupla.classe, "divergente", "desconto contado duas vezes no total da nota aparece como R$ 5,00");
  const doCabecalho = N.nfVeredito(NOTA([it("A", 2, "UN", "10.00", "20.00")], { produtos: 20, descontos: 5, total: 15 }));
  assert.equal(doCabecalho.classe, "consistente", "desconto só no cabeçalho (sem desconto por item) vale uma vez");
});
test("item sem preço unitário é somado, mas avisa que a conta do item não foi conferida; item incompleto nunca é ignorado", () => {
  const v = N.nfVeredito(NOTA([it("A", 2, "UN", null, "20.00")], { total: 20 }));
  assert.equal(v.classe, "consistente"); assert.match(v.avisos.join(" "), /Item 1 \(A\): sem preço unitário/); assert.equal(v.soma.itens[0].verificado, false);
  const inc = N.nfVeredito(NOTA([it("A", 2, "UN", "10.00", "20.00"), it("B", null, "UN", "5.00", "5.00")], { produtos: 25, total: 25 }));
  assert.equal(inc.classe, "baixa_confianca"); assert.deepEqual(inc.soma.divergencias, [], "sem somar parcial: não inventa divergência"); assert.equal(inc.soma.total_calculado, null);
});
test("nota legítima com ST, IPI e FCP ST (NF-e modelo 55) não é recusada; sem o componente no total ela divergiria", () => {
  const itens = [it("PECA", 10, "UN", "100.0000", "1000.00"), it("PARAFUSO", 100, "UN", "0.5000", "50.00")];
  const val = { produtos: 1050, frete: 20, seguro: 5, st: 120.55, fcp_st: 2.4, ipi: 52.5, ii: 0, outras: 1.5, total: 1251.95 };
  assert.equal(N.nfVeredito(NOTA(itens, val, { modelo: "55", chave: K55, serie: 1, numero: 12345 })).classe, "consistente");
  const soST = N.nfVeredito(NOTA(itens, { ...val, st: 0, fcp_st: 0, ipi: 0 }));
  assert.equal(soST.classe, "divergente"); assert.equal(soST.diferenca, -175.45, "o que falta é exatamente ST + FCP ST + IPI");
  assert.equal(N.nfVeredito(NOTA(itens, { ...val, ipi_devol: 10, total: 1261.95 })).classe, "consistente", "IPI devolvido soma");
  assert.equal(N.nfVeredito(NOTA(itens, { produtos: 1050, ii: 30, total: 1080 })).classe, "consistente", "imposto de importação soma");
});
test("atualização posterior da situação: pendente/contingência → autorizada/cancelada mantém a mesma nota; autorizada só pode ser cancelada; cancelada é definitiva", () => {
  const nota = (extra) => NOTA([it("A", 1, "UN", "54.00", "54.00")], { produtos: 54, total: 54 }, extra);
  const guardada = (situacao) => gravada({ situacao });
  const a = N.nfDuplicidade(nota(), { notas: [guardada("contingencia")] });
  assert.equal(a.duplicada, true); assert.equal(a.acao, "atualizar_situacao"); assert.deepEqual(a.atualizar_situacao, { id: "n1", de: "contingencia", para: "autorizada" });
  assert.deepEqual(N.nfDuplicidade(nota({ cancelada: true }), { notas: [guardada("pendente")] }).atualizar_situacao, { id: "n1", de: "pendente", para: "cancelada" });
  assert.deepEqual(N.nfDuplicidade(nota({ cancelada: true }), { notas: [guardada("autorizada")] }).atualizar_situacao, { id: "n1", de: "autorizada", para: "cancelada" });
  assert.equal(N.nfDuplicidade(nota(), { notas: [guardada("autorizada")] }).acao, "ja_gravada", "nada mudou");
  assert.equal(N.nfDuplicidade(nota(), { notas: [guardada("cancelada")] }).acao, "ja_gravada", "cancelada nunca volta");
  assert.equal(N.nfDuplicidade(nota({ cStat: null, protocolo: null }), { notas: [guardada("autorizada")] }).acao, "ja_gravada", "autorizada não volta a pendente");
  assert.equal(N.nfDuplicidade(nota(), { notas: [gravada()] }).acao, "ja_gravada", "sem situação guardada, não presume transição");
  assert.equal(N.nfDuplicidade(nota(), { notas: [] }).atualizar_situacao, null);
});
test("duplicidade sem falso positivo: mesmo valor no mesmo dia em outro estabelecimento, outra data ou outro valor não aponta nada", () => {
  const nota = NOTA([it("A", 1, "UN", "54.00", "54.00")], { produtos: 54, total: 54 });
  const outros = { notas: [gravada({ chave: null, sha256: null, numero: 7, emitente_cnpj: "45543915000181" })], compras: [{ id: "c", total_pago: 54, data: "2026-10-20", vendedor: "Livraria Tal" }],
    mercado: [{ id: "m", data: "2026-10-20", total: 54.02, mercado: "Mercado Exemplo" }, { id: "m2", data: "2026-10-19", total: 54, mercado: "Mercado Exemplo" }], despesas: [{ id: "d", data: "2026-10-20", valor: 53.9, descricao: "Mercado Exemplo" }] };
  const r = N.nfDuplicidade(nota, outros); assert.deepEqual(r.achados, []); assert.equal(r.acao, "gravar_nova");
  const semNome = N.nfDuplicidade({ ...nota, emitente: { nome: null, cnpj: null } }, { mercado: [{ id: "m", data: "2026-10-20", total: 54, mercado: "Qualquer" }] });
  assert.deepEqual(semNome.achados, [], "sem nome do emitente não se adivinha");
});
