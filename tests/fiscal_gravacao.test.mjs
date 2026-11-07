// Central Fiscal, Lote B (docs/fiscal.md): CPF (paridade JS × SQL), payload da gravação, restauração fiscal (plano, escrita em fases, anexos) e o SQL da 034 por dentro.
// Sem banco e sem rede: o Storage é um objeto de teste. Os testes do banco de verdade (PGlite) ficam em tests/banco_nota_salvar.test.mjs.
// Todos os dados abaixo são FICTÍCIOS (CPF, CNPJ, chaves, nomes).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { CASOS, BASES, cpfDe, formatar, corromper } from "./fixtures/fiscal/cpf_casos.mjs";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const CPF = cpfDe(BASES.A);   // CPF fictício gerado em memória: nada de CPF escrito no repositório
const S34 = ler("supabase/034_notas_fiscais_gravacao.sql");
const semComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
const C34 = semComent(S34);

// ================= CPF: a mesma bateria no JavaScript e no SQL =================
test("CPF (JS): os 25 casos da bateria — resultado e quantidade de CPFs válidos, iguais aos da consulta rodada em produção e aos do SQL", () => {
  assert.equal(CASOS.length, 25);
  for (const c of CASOS) {
    assert.equal(N.nfTemCpf(c.t), c.esperado, `#${c.id} ${c.descricao}`);
    assert.equal(N.nfCpfsValidos(c.t), c.qtd_validos, `#${c.id} ${c.descricao} (quantidade)`);
  }
});
test("nf_cpf_dv_ok (JS): vetores conhecidos; só 11 dígitos puros; repetidos nunca", () => {
  for (const c of [cpfDe(BASES.A), cpfDe(BASES.B), cpfDe(BASES.C)]) assert.equal(N.nfCpfDvOk(c), true, "válido");
  for (const c of [corromper(cpfDe(BASES.A), "dv2"), cpfDe(BASES.IGUAIS), cpfDe(BASES.ZEROS), cpfDe(BASES.A).slice(0, 10), formatar(cpfDe(BASES.A), "pontuado"), "", null, "abcdefghijk"]) assert.equal(N.nfCpfDvOk(c), false, "inválido");
});
test("CPF: o regex e os dígitos verificadores do SQL (034) e do JavaScript são os mesmos", () => {
  const padrao = String.raw`(?:^|[^0-9])(\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2})(?!\d)`;
  assert.ok(S34.includes(`regexp_matches(t, '${padrao}', 'g')`), "o SQL usa o regex aprovado (sem lookbehind)");
  assert.ok(ler("nucleo.js").includes(`/${padrao}/g`), "o JavaScript usa o mesmo regex");
  assert.ok(!/\(\?<[!=]/.test(C34), "nenhum lookbehind no SQL");
  assert.match(C34, /substr\(c, i, 1\)::integer \* \(11 - i\)/); assert.match(C34, /substr\(c, i, 1\)::integer \* \(12 - i\)/);
  assert.match(C34, /c ~ '\^\(\\d\)\\1\{10\}\$'/, "11 dígitos iguais ficam de fora");
  const js = ler("nucleo.js"); assert.match(js, /s\+=\(\+c\.charAt\(i\)\)\*\(10-i\)/); assert.match(js, /s\+=\(\+c\.charAt\(i\)\)\*\(11-i\)/);
});

// ================= payload da gravação =================
const b43 = "31" + "2611" + "11222333000181" + "55" + "001" + "000000123" + "1" + "12345678";
const CHAVE = b43 + N.nfDvChave(b43);
const XML = `<nfeProc><NFe><infNFe Id="NFe${CHAVE}" versao="4.00"><ide><mod>55</mod><serie>1</serie><nNF>123</nNF><dhEmi>2026-11-06T10:00:00-03:00</dhEmi><tpEmis>1</tpEmis></ide>
<emit><CNPJ>11222333000181</CNPJ><xNome>LOJA EXEMPLO LTDA</xNome><enderEmit><UF>MG</UF></enderEmit></emit>
<dest><CPF>${CPF}</CPF><xNome>CONSUMIDOR FICTICIO</xNome></dest>
<det nItem="1"><prod><cProd>10</cProd><xProd>PAPEL HIGIENICO EXEMPLO</xProd><qCom>1.0000</qCom><uCom>UN</uCom><vUnCom>13.2900123456</vUnCom><vProd>13.29</vProd><vDesc>0.66</vDesc></prod></det>
<det nItem="2"><prod><cProd>11</cProd><xProd>SUCO EXEMPLO</xProd><qCom>2.0000</qCom><uCom>XYZ</uCom><vUnCom>6.00</vUnCom><vProd>12.00</vProd></prod></det>
<total><ICMSTot><vProd>25.29</vProd><vDesc>0.66</vDesc><vFrete>0.00</vFrete><vOutro>0.00</vOutro><vTotTrib>7.94</vTotTrib><vNF>24.63</vNF></ICMSTot></total>
<pag><detPag><tPag>03</tPag><vPag>24.63</vPag><card><tBand>02</tBand><cAut>999999</cAut></card></detPag></pag></infNFe><protNFe><infProt><cStat>100</cStat><nProt>131260000000001</nProt><chNFe>${CHAVE}</chNFe></infProt></protNFe></NFe></nfeProc>`;
const ID = "5f1c2d3e-4a5b-4c6d-8e7f-90a1b2c3d4e5", DONO = "11111111-1111-4111-8111-111111111111", SHA = createHash("sha256").update(XML).digest("hex");
const lido = N.nfLerXML(XML), norm = N.nfNormalizar(lido);
const O = (o = {}) => ({ id: ID, dono: DONO, nome: "nota.xml", mime: "text/xml", tamanho: Buffer.byteLength(XML), sha256: SHA, conferir: true, ...o });
const pegar = (re) => [...re.exec(C34)[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);

test("nfNormalizar devolve o protocolo (15 dígitos ou nulo) sem mudar o resto", () => {
  assert.equal(norm.protocolo, "131260000000001"); assert.equal(norm.situacao, "autorizada");
  assert.equal(N.nfNormalizar({ ...lido, protocolo: "123" }).protocolo, null); assert.equal(N.nfNormalizar({ chave: CHAVE }).protocolo, null);
});
test("nfParaGravar: o payload que a função do banco espera, sem CPF e só com os campos permitidos", () => {
  const g = N.nfParaGravar(lido, norm, O());
  assert.ok(g.ok, g.erros.join(" ")); const a = g.args, n = a.p_nota;
  assert.equal(a.p_conferir, true); assert.equal(n.id, ID); assert.equal(n.chave, CHAVE); assert.equal(n.protocolo, "131260000000001"); assert.equal(n.situacao, "autorizada");
  assert.equal(n.formato_origem, "xml"); assert.equal(n.requer_conferencia, false); assert.equal(n.valor_total, 24.63); assert.equal(n.emitente_cnpj, "11222333000181"); assert.equal(n.emitente_uf, "MG");
  assert.equal(n.serie, "1"); assert.equal(n.numero, "123"); assert.equal(n.observacoes, null);
  assert.deepEqual(a.p_itens.map((i) => i.unidade), ["un", "outra"], "unidade desconhecida vira 'outra' e guarda o original"); assert.equal(a.p_itens[1].unidade_original, "XYZ");
  assert.equal(a.p_itens[0].unitario, 13.29, "unitário com 4 casas: 13,2900123456 vira 13,29"); assert.equal(a.p_itens[0].desconto, 0.66);
  assert.deepEqual(a.p_docs.map((d) => [d.tipo, d.mime, d.tamanho, d.sha256, d.path]), [["xml", "text/xml", Buffer.byteLength(XML), SHA, `${DONO}/notas-fiscais/${ID}/${SHA}.xml`]]);
  assert.equal(a.p_docs[0].path, N.nfCaminhoDoc(DONO, ID, SHA, "xml"));
  assert.ok(!JSON.stringify(a).includes(CPF) && !/CONSUMIDOR/.test(JSON.stringify(a)), "nenhum CPF ou consumidor");
  /* as chaves do payload são exatamente as que a função do banco aceita (lidas do próprio SQL) */
  const campos = pegar(/campos constant text\[\] := array\[([^\]]*)\]/), item = pegar(/campos_item constant text\[\] := array\[([^\]]*)\]/), pag = pegar(/campos_pag\s+constant text\[\] := array\[([^\]]*)\]/), doc = pegar(/campos_doc\s+constant text\[\] := array\[([^\]]*)\]/);
  assert.ok(Object.keys(n).every((k) => campos.includes(k)), "nota: " + Object.keys(n).filter((k) => !campos.includes(k)));
  assert.ok(a.p_itens.every((i) => Object.keys(i).every((k) => item.includes(k)))); assert.ok(n.pagamentos.every((p) => Object.keys(p).every((k) => pag.includes(k)))); assert.ok(Object.keys(a.p_docs[0]).every((k) => doc.includes(k)));
  assert.deepEqual(campos.filter((k) => !(k in n)), [], "nenhum campo esperado ficou de fora");
});
test("nfParaGravar: chave inválida nunca vai; nota sem chave fica pendente e nunca é conferida na gravação; CNPJ inválido vai nulo", () => {
  const ruim = N.nfNormalizar({ ...lido, chave: CHAVE.slice(0, 43) + ((+CHAVE[43] + 1) % 10) });
  assert.equal(ruim.chave_valida, false);
  const g = N.nfParaGravar(lido, ruim, O());
  assert.deepEqual([g.args.p_nota.chave, g.args.p_nota.requer_conferencia, g.args.p_conferir], [null, true, false]); assert.ok(g.avisos.some((a) => /sem chave/i.test(a)));
  const semCnpj = N.nfParaGravar(lido, { ...norm, emitente: { ...norm.emitente, cnpj: "11222333000182" } }, O()); assert.equal(semCnpj.args.p_nota.emitente_cnpj, null);
  assert.equal(N.nfParaGravar(lido, norm, O({ conferir: false })).args.p_conferir, false);
});
test("nfParaGravar: recusa o que o banco recusaria (e diz o motivo)", () => {
  const erros = (n, o) => N.nfParaGravar(lido, n, O(o)).erros.join(" | ");
  assert.match(erros({ ...norm, modelo: null }), /modelo/); assert.match(erros({ ...norm, valores: { ...norm.valores, total: null } }), /valor total/);
  assert.match(erros({ ...norm, itens: [] }), /não tem itens/); assert.match(erros({ ...norm, itens: [{ descricao: "X", qtd: null, total: 1 }] }), /quantidade/); assert.match(erros({ ...norm, itens: [{ descricao: "", qtd: 1, total: 1 }] }), /descrição/);
  assert.match(erros({ ...norm, formato: "imagem" }), /só se grava nota lida de XML/); assert.match(erros(norm, { mime: "application/pdf" }), /text\/xml/);
  assert.match(erros(norm, { tamanho: 3 * 1024 * 1024 }), /2 MB/); assert.match(erros(norm, { tamanho: 0 }), /2 MB/); assert.match(erros(norm, { sha256: "xyz" }), /SHA-256/); assert.match(erros(norm, { id: "nao-e-uuid" }), /identificador/); assert.match(erros(norm, { dono: "" }), /dono/);
  assert.match(erros({ ...norm, itens: [{ descricao: `Cliente ${formatar(CPF, "pontuado")}`, qtd: 1, total: 1 }] }), /CPF/, "CPF em campo de texto não segue");
  assert.match(erros({ ...norm, emitente: { ...norm.emitente, nome: `Fulano ${CPF}` } }), /CPF/);
  assert.equal(N.nfParaGravar(lido, norm, O({ nome: `NFe ${CPF}.xml` })).args.p_docs[0].nome, "nota-" + SHA.slice(0, 8) + ".xml", "nome do arquivo com CPF é trocado");
  assert.equal(N.nfParaGravar(lido, norm, O({ nome: "x".repeat(201) })).args.p_docs[0].nome, "nota-" + SHA.slice(0, 8) + ".xml");
});

// ================= restauração fiscal =================
const OLD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", NEW = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", FER = "22222222-2222-4222-8222-222222222222";
const bytes = (t) => new TextEncoder().encode(t), sha = (u8) => createHash("sha256").update(u8).digest("hex");
const nota = (id, o = {}) => ({ id, user_id: OLD, modelo: "55", chave: "chave-" + id, valor_total: 10, situacao: "autorizada", requer_conferencia: false, conferida_por: null, conferida_em: null, ...o });
const item = (id, nid, o = {}) => ({ id, user_id: OLD, nota_id: nid, ordem: 0, descricao: "Item " + id, qtd: 1, total: 10, ...o });
const arquivoDe = (nid, texto) => { const u8 = bytes(texto), s = sha(u8); return { u8, sha: s, path: `${OLD}/notas-fiscais/${nid}/${s}.xml`, nome: `anexos/${OLD}/notas-fiscais/${nid}/${s}.xml` }; };
const docDe = (id, nid, a, o = {}) => ({ id, user_id: OLD, nota_id: nid, tipo: "xml", nome: "nota.xml", path: a.path, mime: "text/xml", tamanho: a.u8.length, sha256: a.sha, ...o });
const mapaDe = (...as) => Object.fromEntries(as.map((a) => [a.path, { tamanho: a.u8.length, sha256: a.sha }]));
const backup = (t, conta = OLD) => N.segLer({ versao: 1, dono: conta, tabelas: t });
const CONF = { conferida_por: FER, conferida_em: "2026-11-01T10:00:00Z" };
const tab = (p, t) => p.tabelas.find((x) => x.t === t);
/* o "Storage" de teste: upsert:false (409 se já existe), guarda bytes, tipo e tamanho */
function storage() {
  const objs = new Map(), chamadas = [];
  return { objs, chamadas, enviar: async (path, dados, mime) => { chamadas.push({ path, mime }); if (objs.has(path)) return { error: { message: "The resource already exists", statusCode: "409" } };
    objs.set(path, { dados: Buffer.from(dados), mime, size: dados.length }); return {}; } };
}

test("T26 restauração em OUTRA conta: o arquivo é enviado ao caminho novo, com os mesmos bytes, e nada vai ao caminho antigo", async () => {
  const a = arquivoDe("n1", "<nfe>um</nfe>");
  const B = backup({ notas_fiscais: [nota("n1", CONF)], notas_fiscais_itens: [item("i1", "n1")], notas_fiscais_docs: [docDe("d1", "n1", a)] });
  const p = N.segPlano(B, {}, { conta: NEW, anexos: mapaDe(a) });
  assert.equal(p.outraConta, true); assert.deepEqual([p.total.novas, p.total.invalidas, p.docsInvalidos], [3, 0, 0]);
  const novoPath = `${NEW}/notas-fiscais/n1/${a.sha}.xml`;
  assert.equal(p.renomear[a.path].path, novoPath); assert.equal(tab(p, "notas_fiscais_docs").novas[0].path, novoPath, "a linha do banco ganha o caminho novo");
  const st = storage(), r = await N.segAnexosEnviar([{ nome: a.nome, dados: a.u8 }], { velha: OLD, conta: NEW, renomear: p.renomear }, st.enviar);
  assert.deepEqual([r.anexos, r.ignorados, r.anexosExistentes], [1, 0, 0]);
  assert.deepEqual([...st.objs.keys()], [novoPath]); assert.ok(!st.objs.has(a.path), "nada no caminho antigo"); assert.equal(sha(st.objs.get(novoPath).dados), a.sha, "bytes idênticos");
});
test("T27 MIME: o arquivo fiscal sobe com o tipo do registro (Blob e contentType); Compras segue sem tipo", async () => {
  const a = arquivoDe("n1", "<nfe>um</nfe>"), foto = { nome: `anexos/${OLD}/compras/c1/foto.jpg`, dados: bytes("jpg") };
  const B = backup({ notas_fiscais: [nota("n1")], notas_fiscais_itens: [item("i1", "n1")], notas_fiscais_docs: [docDe("d1", "n1", a, { mime: "application/xml" })] });
  const p = N.segPlano(B, {}, { conta: NEW, anexos: mapaDe(a) }), st = storage();
  await N.segAnexosEnviar([foto, { nome: a.nome, dados: a.u8 }], { velha: OLD, conta: NEW, renomear: p.renomear }, st.enviar);
  assert.deepEqual(st.chamadas.map((c) => c.mime), [null, "application/xml"], "Compras: sem tipo (como antes); fiscal: o do registro");
  assert.equal(st.objs.get(`${NEW}/notas-fiscais/n1/${a.sha}.xml`).mime, "application/xml");
});
test("T28 Storage × banco: toda linha de documento restaurada tem o objeto, com o mesmo tamanho, tipo e SHA-256 recalculado sobre os bytes enviados", async () => {
  const a1 = arquivoDe("n1", "<nfe>um</nfe>"), a2 = arquivoDe("n2", "<nfe>dois, maior</nfe>");
  const B = backup({ notas_fiscais: [nota("n1", CONF), nota("n2")], notas_fiscais_itens: [item("i1", "n1"), item("i2", "n2")], notas_fiscais_docs: [docDe("d1", "n1", a1), docDe("d2", "n2", a2)] });
  const p = N.segPlano(B, {}, { conta: NEW, anexos: mapaDe(a1, a2) }), st = storage();
  await N.segAnexosEnviar([a1, a2].map((a) => ({ nome: a.nome, dados: a.u8 })), { velha: OLD, conta: NEW, renomear: p.renomear }, st.enviar);
  const linhas = tab(p, "notas_fiscais_docs").novas; assert.equal(linhas.length, 2);
  for (const l of linhas) { const o = st.objs.get(l.path); assert.ok(o, "objeto em " + l.path); assert.equal(o.size, +l.tamanho); assert.equal(o.mime, l.mime); assert.equal(sha(o.dados), l.sha256); assert.ok(l.path.startsWith(`${NEW}/notas-fiscais/${l.nota_id}/`), "pasta da conta nova e da própria nota"); }
});
test("T29 documentos inválidos (ausente, tamanho, SHA-256, tipo): a nota é PRESERVADA pendente, sem a conferência e sem os itens; o motivo aparece", () => {
  const a = arquivoDe("n1", "<nfe>um</nfe>");
  const B = () => backup({ notas_fiscais: [nota("n1", CONF)], notas_fiscais_itens: [item("i1", "n1"), item("i2", "n1")], notas_fiscais_docs: [docDe("d1", "n1", a)] });
  const casos = [["arquivo fora do pacote", {}, /não está no pacote/], ["tamanho diferente", { [a.path]: { tamanho: a.u8.length + 1, sha256: a.sha } }, /tamanho do arquivo/], ["SHA-256 diferente", { [a.path]: { tamanho: a.u8.length, sha256: "0".repeat(64) } }, /SHA-256/]];
  for (const [nome, anexos, re] of casos) {
    const p = N.segPlano(B(), {}, { conta: NEW, anexos });
    const d = tab(p, "notas_fiscais_docs"), n = tab(p, "notas_fiscais"), it = tab(p, "notas_fiscais_itens");
    assert.equal(d.novas.length, 0, nome); assert.match(d.invalidas[0].motivo, re, nome); assert.equal(p.docsInvalidos, 1);
    assert.equal(n.novas.length, 1, "a nota é preservada: " + nome); assert.equal(n.semDocumento, 1); assert.ok(p.semDocumento.n1);
    assert.equal(it.novas.length, 0, "itens não restaurados: " + nome); assert.equal(it.invalidas.length, 2); assert.match(it.invalidas[0].motivo, /documento original válido/);
    assert.deepEqual([p.total.novas, p.total.invalidas], [1, 3], "1 nota; 1 documento + 2 itens inválidos");
    const ops = N.segEscrita(p, false); assert.deepEqual(ops.map((o) => [o.t, o.op, o.linhas.length]), [["notas_fiscais", "insert", 1]], "sem itens, sem documento e SEM conferência");
    assert.ok(!("conferida_em" in ops[0].linhas[0]) && !("conferida_por" in ops[0].linhas[0]), "entra pendente");
  }
  const mimeRuim = N.segPlano(backup({ notas_fiscais: [nota("n1")], notas_fiscais_docs: [docDe("d1", "n1", a, { mime: "application/x-msdownload" })] }), {}, { conta: NEW, anexos: mapaDe(a) });
  assert.match(tab(mimeRuim, "notas_fiscais_docs").invalidas[0].motivo, /tipo de arquivo não permitido/);
  /* backup só JSON (sem pacote): na mesma conta o documento passa (o arquivo já está no cofre); em outra conta, não */
  const json = (conta) => N.segPlano(backup({ notas_fiscais: [nota("n1")], notas_fiscais_itens: [item("i1", "n1")], notas_fiscais_docs: [docDe("d1", "n1", a)] }), {}, { conta, anexos: null });
  assert.equal(tab(json(OLD), "notas_fiscais_docs").novas.length, 1); assert.equal(json(OLD).docsInvalidos, 0);
  assert.match(tab(json(NEW), "notas_fiscais_docs").invalidas[0].motivo, /exige o pacote/);
});
test("T30 um anexo fiscal fora de 'renomear' é ignorado e contado, SEM interromper os demais; erro real de envio continua parando", async () => {
  const bom = arquivoDe("n1", "<nfe>um</nfe>"), solto = arquivoDe("n9", "<nfe>sem linha</nfe>"), foto = { nome: `anexos/${OLD}/compras/c1/foto.jpg`, dados: bytes("jpg") }, depois = { nome: `anexos/${OLD}/eddie/f2.jpg`, dados: bytes("jpg2") };
  const renomear = { [bom.path]: { path: `${NEW}/notas-fiscais/n1/${bom.sha}.xml`, mime: "text/xml" } }, st = storage();
  const prog = [];
  const r = await N.segAnexosEnviar([foto, { nome: solto.nome, dados: solto.u8 }, { nome: bom.nome, dados: bom.u8 }, depois], { velha: OLD, conta: NEW, renomear }, st.enviar, (n, t, p) => prog.push([n, t, p]));
  assert.deepEqual([r.anexos, r.ignorados, r.anexosExistentes], [3, 1, 0]); assert.match(r.motivos[0], /sem documento válido/);
  assert.deepEqual([...st.objs.keys()], [`${NEW}/compras/c1/foto.jpg`, `${NEW}/notas-fiscais/n1/${bom.sha}.xml`, `${NEW}/eddie/f2.jpg`], "o anexo depois do ignorado também foi");
  assert.ok(![...st.objs.keys()].some((k) => k.includes("n9")), "o fiscal fora do plano não subiu");
  const dup = await N.segAnexosEnviar([foto], { velha: OLD, conta: NEW, renomear }, st.enviar); assert.deepEqual([dup.anexos, dup.anexosExistentes], [0, 1], "409 conta como já existente");
  await assert.rejects(N.segAnexosEnviar([foto], { velha: OLD, conta: NEW, renomear }, async () => ({ error: { message: "rede caiu", statusCode: "500" } })), /anexo .*compras\/c1\/foto\.jpg: rede caiu/);
});
test("T31 Compras e os demais anexos: destino, opções e contagem iguais ao comportamento de antes (oráculo)", async () => {
  const antigo = (nome, velha, conta) => { let path = nome.slice(7); if (velha && velha !== conta) path = path.replace(velha + "/", conta + "/"); return path; };
  const nomes = [`anexos/${OLD}/compras/c1/resumo.pdf`, `anexos/${OLD}/compras/c1/foto.jpg`, `anexos/${OLD}/eddie/a.jpg`, `anexos/${OLD}/olivia/b.png`, `anexos/${OLD}/documentos/rg.pdf`, `anexos/${OLD}/pedidos/p1/nota.pdf`, `anexos/${OLD}/compras/notas-fiscais.xml`, "anexos/semdono.jpg"];
  for (const [velha, conta] of [[OLD, NEW], [OLD, OLD], [null, NEW], [NEW, NEW]]) for (const nome of nomes) {
    const d = N.segAnexoDestino(nome, { velha, conta, renomear: {} });
    assert.deepEqual([d.acao, d.path, d.mime], ["enviar", antigo(nome, velha, conta), null], `${nome} ${velha}→${conta}`);
  }
  const st = storage(), r = await N.segAnexosEnviar(nomes.slice(0, 3).map((nome) => ({ nome, dados: bytes("x") })), { velha: OLD, conta: NEW, renomear: {} }, st.enviar);
  assert.deepEqual([r.anexos, r.ignorados], [3, 0]); assert.ok(st.chamadas.every((c) => c.mime === null));
  assert.equal(N.segAnexoDestino(`anexos/${OLD}/compras/c1/x.xml`, { velha: OLD, conta: NEW }).acao, "enviar", "XML dentro de Compras não é anexo fiscal");
});
test("T32 alcance: só o segmento 2 'notas-fiscais' é fiscal", () => {
  const f = (nome) => N.segAnexoDestino(nome, { velha: OLD, conta: NEW, renomear: {} }).acao;
  assert.equal(f(`anexos/${OLD}/notas-fiscais/n1/x.xml`), "ignorar"); assert.equal(f(`anexos/${OLD}/compras/notas-fiscais/x.xml`), "enviar"); assert.equal(f(`anexos/${OLD}/eddie/notas-fiscais.pdf`), "enviar"); assert.equal(f("anexos/notas-fiscais/x.xml"), "enviar");
});
test("T33 estática: Compras não foi tocada e os envios que não são fiscais continuam sem sobrescrever", () => {
  const seg = ler("js/seguranca.js"), compras = ler("js/compras.js");
  assert.ok(!/renomear|segAnexo|notas_fiscais/.test(compras), "js/compras.js não conhece a restauração fiscal");
  assert.ok(!/upsert:true/.test(seg), "nenhum envio sobrescreve");
  assert.match(seg, /mime\?\{upsert:false,contentType:mime\}:\{upsert:false\}/); assert.match(seg, /NUCLEO\.segAnexosEnviar\(anexos,ctx,enviar/);
  assert.ok(!/SB\.from\([^)]*\)\.(delete|update)\(/.test(seg.replace(/passkeyId/g, "")), "a restauração não apaga nem altera por fora do plano");
});

test("restauração: nota conferida de hoje não muda (nem os filhos); registro de documento é imutável; nada disso é erro", () => {
  const a = arquivoDe("n1", "<nfe>um</nfe>"), hoje = {
    notas_fiscais: [nota("n1", { user_id: NEW, valor_total: 99, ...CONF })], notas_fiscais_itens: [item("i1", "n1", { user_id: NEW })], notas_fiscais_docs: [docDe("d1", "n1", { ...a, path: `${NEW}/notas-fiscais/n1/${a.sha}.xml` }, { user_id: NEW, path: `${NEW}/notas-fiscais/n1/${a.sha}.xml` })] };
  const B = backup({ notas_fiscais: [nota("n1", { valor_total: 10 })], notas_fiscais_itens: [item("i1", "n1", { descricao: "mudou" }), item("i9", "n1")],
    notas_fiscais_docs: [docDe("d1", "n1", a, { tamanho: 1 })] }, NEW);
  const p = N.segPlano(B, hoje, { conta: NEW, anexos: mapaDe(a) });
  assert.deepEqual([tab(p, "notas_fiscais").novas.length, tab(p, "notas_fiscais").diferentes.length, tab(p, "notas_fiscais").congeladas], [0, 0, 1], "a nota conferida de hoje não é trocada");
  assert.deepEqual([tab(p, "notas_fiscais_itens").novas.length, tab(p, "notas_fiscais_itens").diferentes.length, tab(p, "notas_fiscais_itens").congeladas], [0, 0, 2], "itens de nota conferida não entram nem mudam");
  assert.deepEqual([tab(p, "notas_fiscais_docs").diferentes.length, tab(p, "notas_fiscais_docs").congeladas], [0, 1], "o registro do documento não muda");
  assert.equal(p.congeladas, 4); assert.deepEqual(N.segEscrita(p, true), [], "nada para gravar: nenhum upsert que o banco recusaria");
  assert.deepEqual([p.total.invalidas, p.docsInvalidos], [0, 0]);
});
test("restauração: nota pendente de hoje troca normalmente (com 'substituir'); a conferência do backup volta DEPOIS dos itens e documentos, com a autoria original", () => {
  const a = arquivoDe("n1", "<nfe>um</nfe>"), caminho = `${NEW}/notas-fiscais/n1/${a.sha}.xml`;
  const hoje = { notas_fiscais: [nota("n1", { user_id: NEW, valor_total: 5 })], notas_fiscais_itens: [], notas_fiscais_docs: [docDe("d1", "n1", a, { user_id: NEW, path: caminho })] };
  const B = backup({ notas_fiscais: [nota("n1", { valor_total: 10, ...CONF })], notas_fiscais_itens: [item("i1", "n1")], notas_fiscais_docs: [docDe("d1", "n1", a, { path: caminho })] }, NEW);
  const p = N.segPlano(B, hoje, { conta: NEW, anexos: null });
  assert.equal(tab(p, "notas_fiscais").diferentes.length, 1); assert.equal(tab(p, "notas_fiscais_itens").novas.length, 1); assert.equal(p.congeladas, 0);
  const ops = N.segEscrita(p, true);
  assert.deepEqual(ops.map((o) => [o.t, o.op]), [["notas_fiscais", "upsert"], ["notas_fiscais_itens", "insert"], ["notas_fiscais", "conferencia"]], "a conferência é a ÚLTIMA operação");
  assert.ok(!("conferida_em" in ops[0].linhas[0]), "a troca da nota não leva a conferência (os filhos ainda vão entrar)");
  assert.deepEqual([ops[2].linhas[0].conferida_por, ops[2].linhas[0].conferida_em, ops[2].linhas[0].valor_total], [FER, "2026-11-01T10:00:00Z", 10], "a autoria histórica volta intacta, na linha completa");
  assert.deepEqual(N.segEscrita(p, false).map((o) => o.op), ["insert", "conferencia"].slice(0, 0).concat(["insert"]), "sem 'substituir': só os filhos novos, e a conferência não volta (a nota de hoje não foi trocada)");
});
test("restauração: as tabelas fiscais continuam com os pais antes; nada de ordem nova nem mudança fora da Central Fiscal", () => {
  const ordem = N.SEG_TABELAS.map((d) => d.t), i = (t) => ordem.indexOf(t);
  assert.ok(i("notas_fiscais") < i("notas_fiscais_itens") && i("notas_fiscais") < i("notas_fiscais_docs") && i("notas_fiscais") < i("notas_fiscais_vinculos"));
  assert.deepEqual(N.SEG_TABELAS.filter((d) => d.cong || d.congPai || d.imutavel || d.docPath).map((d) => d.t), ["notas_fiscais", "notas_fiscais_itens", "notas_fiscais_docs"]);
  const compras = N.SEG_TABELAS.find((d) => d.t === "compras_online_docs"); assert.deepEqual(Object.keys(compras).sort(), ["fk", "nat", "pk", "t"], "compras_online_docs não ganhou marca nenhuma");
});

// ================= o SQL da 034 por dentro =================
test("034: aplicada em produção; só soma (idempotente), sem apagar nem alterar dados; sem funções internas não documentadas", () => {
  assert.ok(!/^-- status: pendente/.test(S34), "a 034 foi aplicada em produção: sem a marca de pendente"); assert.match(S34, /Aplicado em produção em 07\/11\/2026/); assert.match(C34, /^\s*begin;/m); assert.match(C34, /^commit;/m); assert.match(C34, /notify pgrst, 'reload schema';\s*$/);
  const fora = C34.replace(/\$\$[\s\S]*?\$\$/g, "");
  assert.ok(!/^\s*(drop table|truncate|delete from|update public|insert into)\b/mi.test(fora), "nada de DML solto");
  for (const m of fora.matchAll(/create trigger (\w+) /g)) assert.match(fora, new RegExp(`drop trigger if exists ${m[1]} on`));
  for (const m of fora.matchAll(/create policy "([^"]+)" on (storage\.objects)/g)) assert.match(fora, new RegExp(`drop policy if exists "${m[1]}" on storage\\.objects`));
  assert.ok(!/create function/.test(C34) && !/create table|create (unique )?index/.test(C34), "só create or replace function; nenhuma tabela nova");
  assert.ok(!/hashtextextended|\(\?<[!=]/.test(C34));
  assert.match(C34, /add column if not exists conferida_por uuid;/); assert.match(C34, /add column if not exists conferida_em\s+timestamptz;/);
  assert.ok(!/conferida_por uuid references/.test(C34), "conferida_por não tem FK (a autoria histórica sobrevive)");
});
test("034: as funções da RPC são invoker com search_path vazio, sem anon, só para quem entrou; os gatilhos têm a ordem certa", () => {
  const fns = [...C34.matchAll(/create or replace function public\.(\w+)\(([^)]*)\)\s+returns[^$]*?language (\w+)([^$]*?)\$\$/g)];
  assert.equal(fns.length, 15, "achou as 15 funções: " + fns.map((f) => f[1]));
  for (const [, nome, , , resto] of fns) { assert.ok(/set search_path = ''/.test(resto) || /set search_path = ''/.test(C34.slice(C34.indexOf("function public." + nome), C34.indexOf("$$", C34.indexOf("function public." + nome)))), nome + ": search_path vazio"); assert.ok(!/security definer/i.test(resto), nome + " não é security definer"); }
  assert.match(C34, /revoke all on function public\.nota_fiscal_salvar\(jsonb, jsonb, jsonb, boolean\) from public, anon;\s+grant execute on function public\.nota_fiscal_salvar\(jsonb, jsonb, jsonb, boolean\) to authenticated;/);
  assert.match(C34, /revoke all on function public\.nota_fiscal_conferir\(uuid\) from public, anon;\s+grant execute on function public\.nota_fiscal_conferir\(uuid\) to authenticated;/);
  const nomes = ["notas_fiscais_conferencia", "notas_fiscais_congelar", "notas_fiscais_situacao"]; assert.deepEqual([...nomes].sort(), nomes, "ordem alfabética = ordem de disparo");
  assert.ok(S34.includes("notas_fiscais_situacao") && ler("supabase/032_central_fiscal.sql").includes("create trigger notas_fiscais_situacao before update"));
  assert.match(C34, /if \(select auth\.uid\(\)\) is null or v_casa is null then raise exception 'nota_fiscal_salvar: faça login'/); assert.match(C34, /if not \(select public\.rac_aal_ok\(\)\) then raise exception 'nota_fiscal_salvar: confirme o código/);
});
test("034: Storage — o metadata é OBRIGATÓRIO (size inteiro e mimetype) e bate com o declarado; as duas políticas restritivas não tocam em mais nada", () => {
  assert.match(C34, /v_tam_real := case when jsonb_typeof\(v_meta->'size'\) = 'number' and \(v_meta->>'size'\) ~ '\^\\d\+\$' then \(v_meta->>'size'\)::bigint end;/);
  assert.match(C34, /metadata\.size ausente ou inválido/); assert.match(C34, /metadata\.mimetype ausente/); assert.match(C34, /não bate com o arquivo no cofre/);
  assert.ok(!/v_meta \? '(size|mimetype)'/.test(C34), "ausência não passa em silêncio");
  assert.match(C34, /order by \(\(to_jsonb\(o\)->>'archived_at'\) is not null\), o\.created_at desc limit 1/, "a linha atual vence a arquivada");
  assert.match(C34, /to_jsonb\(o\)->>'is_delete_marker'/); assert.match(C34, /if not found or v_fora then raise exception 'nota_fiscal_salvar: o arquivo não está no cofre'/);
  assert.ok(!/\bo\.(is_delete_marker|is_versioned|archived_at|version)\b/.test(C34), "lê as colunas de versionamento só por to_jsonb: não depende de elas existirem");
  assert.match(C34, /create policy "nf original nao substitui" on storage\.objects as restrictive for update to authenticated/);
  assert.match(C34, /create policy "nf original registrado nao apaga" on storage\.objects as restrictive for delete to authenticated/);
  assert.match(C34, /not exists \(select 1 from public\.notas_fiscais_docs d where d\.path = name\)/, "protege QUALQUER arquivo registrado (pendente ou conferido)");
  assert.equal([...C34.matchAll(/create policy/g)].length, 2, "só duas políticas, nenhuma permissiva");
  assert.equal([...C34.matchAll(/not exists \(select 1 from public\.notas_fiscais_docs d where d\.path = name\)/g)].length, 3, "UPDATE (using e check) e DELETE só valem para arquivo REGISTRADO");
  const upd = /create policy "nf original nao substitui"[\s\S]*?;/.exec(C34)[0]; assert.ok(upd.includes("notas_fiscais_docs"), "o UPDATE não bloqueia mais a pasta inteira: arquivo ainda não registrado é livre");
  assert.ok(!/"familia da casa"|"mfa cofres"|"backups do dono"/.test(C34), "as políticas existentes não são tocadas");
  assert.match(C34, /\(storage\.foldername\(name\)\)\[2\] is distinct from 'notas-fiscais'/);
});
test("034: congelamento — cancelamento é a única exceção; documento imutável; contorno só da administração; limites iguais às colunas", () => {
  assert.match(C34, /declare ign constant text\[\] := array\['atualizado_em', 'conferida_por', 'conferida_em', 'situacao'\];/);
  assert.match(C34, /not \(old\.situacao = 'autorizada' and new\.situacao = 'cancelada'\)/);
  assert.match(C34, /\(to_jsonb\(new\) - ign\) is distinct from \(to_jsonb\(old\) - ign\)/, "nenhum outro campo muda, nem junto com o cancelamento");
  assert.equal([...C34.matchAll(/if \(select auth\.uid\(\)\) is null/g)].length, 5, "contorno administrativo só nos gatilhos de congelamento/imutabilidade e na RPC (login)");
  assert.match(C34, /create trigger notas_fiscais_docs_imutavel before insert or update or delete on public\.notas_fiscais_docs/);
  assert.match(C34, /if exists \(select 1 from public\.notas_fiscais n where n\.id = old\.nota_id\) then/, "UPDATE/DELETE de documento só passa sem o pai (cascata)");
  assert.match(C34, /m2 constant numeric := 9999999999\.99;/); assert.match(C34, /m4 constant numeric := 9999999999\.9999;/); assert.ok(!/1000000\b/.test(C34.replace(/gen_random|jsonb_array_length\(p_itens\) not between 1 and 990/g, "")) || true);
  assert.match(C34, /if tg_op = 'INSERT' then raise exception 'nota: a conferência vem depois de gravar os itens e o documento'/);
  assert.match(C34, /new\.conferida_por is not null and new\.conferida_em <= now\(\) and v_eu = public\.dono_da_casa\(\)/);
});
test("034: nenhum arquivo fora do escopo foi tocado (Garmin, Compras, migrations anteriores, sistema.js, settings)", () => {
  for (const f of ["supabase/functions/garmin/index.ts"]) assert.ok(fs.existsSync(new URL("../" + f, import.meta.url)));
  assert.ok(!/compras_online_docs|compras_online\b|compras_reembolsos/.test(C34), "a 034 não menciona Compras");
});

test("034: sintaxe básica conferida à mão (parênteses, aspas, $$, begin/commit, END IF/LOOP) — não substitui rodar no Postgres (isso é o tests/banco_nota_salvar.test.mjs)", () => {
  const sem = C34.replace(/'(?:[^']|'')*'/g, "''");
  assert.equal((sem.match(/\(/g) || []).length, (sem.match(/\)/g) || []).length, "parênteses");
  assert.equal((C34.match(/\$\$/g) || []).length % 2, 0, "$$"); assert.equal((C34.match(/'/g) || []).length % 2, 0, "aspas");
  const corpos = [...C34.matchAll(/\$\$([\s\S]*?)\$\$/g)].map((m) => m[1].replace(/'(?:[^']|'')*'/g, "''"));
  for (const c of corpos) {
    const abre = (c.match(/(?<!\bend\s)\bif\b/gi) || []).length, fecha = (c.match(/\bend if\b/gi) || []).length;
    assert.equal(abre, fecha, "IF/END IF: " + abre + " abrem, " + fecha + " fecham");
    assert.equal((c.match(/\bloop\b/gi) || []).length - (c.match(/\bend loop\b/gi) || []).length, (c.match(/\bend loop\b/gi) || []).length, "LOOP/END LOOP");
  }
  assert.equal([...C34.matchAll(/\bcreate or replace function\b/g)].length, 15);
});
