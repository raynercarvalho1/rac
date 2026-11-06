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
