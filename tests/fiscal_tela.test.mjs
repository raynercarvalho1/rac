// Central Fiscal, Lote A: leitura de XML e tela de conferência (js/fiscal.js). SÓ LEITURA: nada vai ao banco nem ao Storage.
// O XML abaixo é FICTÍCIO, no formato dos XML reais de NF-e (nfeProc, protocolo, ICMS, tributos da reforma IBS/CBS, itens repetidos).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { CASOS, BASES, cpfDe, formatar, corromper } from "./fixtures/fiscal/cpf_casos.mjs";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8");

const CPF = cpfDe(BASES.A); // CPF fictício gerado em memória, só no XML de entrada
const b43 = "31" + "2611" + "11222333000181" + "55" + "001" + "000000123" + "1" + "12345678"; // 43 dígitos
const CHAVE = b43 + N.nfDvChave(b43);
const XML = `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${CHAVE}" versao="4.00">
<ide><cUF>31</cUF><natOp>Venda de mercadoria</natOp><mod>55</mod><serie>1</serie><nNF>123</nNF><dhEmi>2026-11-06T10:00:00-03:00</dhEmi><tpEmis>1</tpEmis></ide>
<emit><CNPJ>11222333000181</CNPJ><xNome>LOJA EXEMPLO LTDA</xNome><enderEmit><xLgr>RUA DO EMITENTE</xLgr><UF>MG</UF></enderEmit></emit>
<dest><CPF>${CPF}</CPF><xNome>CONSUMIDOR FICTICIO DA SILVA</xNome><enderDest><xLgr>RUA DO CONSUMIDOR</xLgr></enderDest></dest>
<det nItem="1"><prod><cProd>10</cProd><xProd>PAPEL HIGIENICO EXEMPLO</xProd><qCom>1.0000</qCom><uCom>UN</uCom><vUnCom>13.29</vUnCom><vProd>13.29</vProd><vDesc>0.66</vDesc></prod>
<imposto><ICMS><ICMS00><CST>00</CST><vBC>13.29</vBC></ICMS00></ICMS><IBSCBS><CST>000</CST><gIBSCBS><vBC>13.29</vBC><gIBSUF><vIBSUF>0.01</vIBSUF></gIBSUF></gIBSCBS></IBSCBS></imposto></det>
<det nItem="2"><prod><cProd>10</cProd><xProd>PAPEL HIGIENICO EXEMPLO</xProd><qCom>1.0000</qCom><uCom>UN</uCom><vUnCom>13.29</vUnCom><vProd>13.29</vProd><vDesc>0.67</vDesc></prod></det>
<total><ICMSTot><vProd>26.58</vProd><vDesc>1.33</vDesc><vFrete>0.00</vFrete><vOutro>0.00</vOutro><vTotTrib>7.94</vTotTrib><vNF>25.25</vNF></ICMSTot></total>
<pag><detPag><tPag>03</tPag><vPag>25.25</vPag><card><tBand>02</tBand><cAut>999999</cAut></card></detPag></pag>
<infAdic><infCpl>CPF do consumidor ${CPF}</infCpl></infAdic></infNFe><protNFe><infProt><cStat>100</cStat><nProt>131260000000001</nProt><chNFe>${CHAVE}</chNFe></infProt></protNFe></NFe></nfeProc>`;

// o arquivo do navegador, simulado: só o que a tela usa (name, size, text())
const arq = (name, texto, size, type = "text/xml") => ({ name, size: size ?? texto.length, type, text: () => Promise.resolve(texto), arrayBuffer: () => Promise.resolve(new TextEncoder().encode(texto).buffer) });
const ctx = vm.createContext({ NUCLEO: N });
vm.runInContext(ler("js/fiscal.js"), ctx);

test("XML no formato real: lê tudo, a chave confere, itens repetidos continuam dois e a conta fecha", async () => {
  const r = await ctx.fxLerArquivo(arq("nota.xml", XML));
  assert.ok(!r.erro, r.erro);
  const n = r.nota;
  assert.equal(n.tipo, "NF-e"); assert.equal(n.chave, CHAVE); assert.equal(n.chave_valida, true);
  assert.equal(n.situacao, "autorizada"); assert.equal(n.data_emissao, "2026-11-06"); assert.equal(n.emitente.uf, "MG");
  assert.equal(n.itens.length, 2, "dois itens iguais não se fundem");
  assert.deepEqual([n.valores.produtos, n.valores.descontos, n.valores.total, n.valores.a_pagar], [26.58, 1.33, 25.25, 25.25]);
  assert.equal(n.pagamentos[0].forma && n.pagamentos[0].forma.length > 0, true);
  assert.deepEqual(n.avisos, []);
  assert.equal(n.gera_despesa, false);
});

test("privacidade: CPF, nome e endereço do consumidor do XML não saem na nota lida", async () => {
  const r = await ctx.fxLerArquivo(arq("nota.xml", XML));
  const txt = JSON.stringify(r);
  assert.ok(!txt.includes(CPF) && !/CONSUMIDOR/.test(txt) && !/RUA DO CONSUMIDOR/.test(txt));
  assert.equal(N.nfTemDadoPessoal(r.nota).ok, true);
});

test("arquivos que não são XML de nota viram erro claro, sem lançar e sem ler a foto", async () => {
  for (const nome of ["foto.jpeg", "NFS (1).JPG", "danfe.pdf"]) {
    const r = await ctx.fxLerArquivo({ name: nome, size: 10, text: () => { throw new Error("não deveria ler"); } });
    assert.match(r.erro, /sem OCR/); assert.equal(r.nota, undefined);
  }
  assert.match((await ctx.fxLerArquivo(arq("x.xml", "<html>não é nota</html>"))).erro, /Não é um XML de NF-e/);
  assert.match((await ctx.fxLerArquivo(arq("x.xml", XML, 3 * 1024 * 1024))).erro, /limite de 2 MB/);
  assert.match((await ctx.fxLerArquivo({ name: "x.xml", size: 5, text: () => Promise.reject(new Error("x")) })).erro, /Não consegui abrir/);
});

test("chave adulterada no XML: a nota é lida, mas a chave NÃO confere e há aviso", async () => {
  const ruim = XML.split(CHAVE).join(CHAVE.slice(0, 43) + ((+CHAVE[43] + 1) % 10));
  const r = await ctx.fxLerArquivo(arq("nota.xml", ruim));
  assert.equal(r.nota.chave_valida, false); assert.ok(r.nota.avisos.some((a) => /chave/i.test(a)));
});

test("lote: lê vários arquivos (no máximo 20) e mistura XML com foto sem travar", async () => {
  const l = await ctx.fxLote([arq("a.xml", XML), { name: "f.jpeg", size: 1, text: () => "" }, arq("b.xml", XML)]);
  assert.equal(Array.from(l, (x) => !!x.nota).join(), "true,false,true");
  const muitos = await ctx.fxLote(Array.from({ length: 25 }, (_, i) => arq(`n${i}.xml`, XML)));
  assert.equal(muitos.length, 20);
});

test("a leitura não toca em banco nem Storage; a gravação só usa o cofre privado e as duas funções do banco, sem IA, OCR ou escrita direta em tabela", () => {
  const js = ler("js/fiscal.js").replace(/\/\*[\s\S]*?\*\//g, "");
  const leitura = js.slice(js.indexOf("function fxLerArquivo"), js.indexOf("function fxHex"));
  assert.ok(!/\bSB\b|supabase|storage|fetch\(|rpc/i.test(leitura), "ler o XML não fala com o banco nem com o Storage");
  assert.ok(!/fetch\(|XMLHttpRequest|tesseract|createWorker|localStorage|sessionStorage|pessoalGravar|\.insert\(|\.update\(|\.upsert\(|\.delete\(/i.test(js), "nada de rede solta, IA, OCR nem escrita direta em tabela");
  assert.ok(!/\.(?:cpf|dest)\b|infCpl/i.test(js), "a tela não toca em CPF nem em destinatário");
  assert.deepEqual([...js.matchAll(/racIA\(([^)]*)\)/g)].map((m) => m[1].split(",").slice(0, 2).join(",")), ['"fiscal","fiscal.nota"'], "a única chamada de IA da tela é a ação fiscal.nota, pela porta racIA (Lote 1.4)");
  assert.deepEqual([...new Set([...js.matchAll(/fxRpc\("([a-z_]+)"/g)].map((m) => m[1]))].sort(), ["nota_fiscal_conferir", "nota_fiscal_salvar"]);
  assert.equal([...js.matchAll(/SB\.from\(/g)].length, 1, "uma única porta de leitura (fxLer), só com select");
  assert.deepEqual([...new Set([...js.matchAll(/fxLer\("([a-z_]+)"/g)].map((m) => m[1]))].sort(), ["compras_online", "notas", "notas_fiscais", "notas_fiscais_docs", "pedidos"], "as leituras da conferência de duplicidade, todas só leitura");
  assert.equal([...js.matchAll(/SB\.storage\.from\("([a-z]+)"\)/g)].every((m) => m[1] === "familia"), true, "só o cofre familia");
  assert.match(js, /NUCLEO\.nfLerXML/); assert.match(js, /NUCLEO\.nfNormalizar/); assert.match(js, /NUCLEO\.nfParaGravar/); assert.match(js, /NUCLEO\.nfRetentar/);
  assert.match(js, /upsert:false,contentType:mime/, "o envio nunca sobrescreve e leva o tipo do XML"); assert.match(js, /mime="text\/xml"/); const envio = js.slice(js.indexOf("function fxSalvar"), js.indexOf("function fxConferir"));
  assert.ok(envio.length > 500 && !/f\.type|\.type===/.test(envio), "o tipo que o navegador deu ao arquivo não decide nada no envio do XML (na leitura por IA ele só é conferido contra o conteúdo real)");
});

test("ligação ao site: rota, menu, seção, módulo no sw.js e acesso da Fernanda (papel casa)", () => {
  const app = ler("js/app.js"), html = ler("index.html"), sw = ler("sw.js");
  assert.match(app, /var DA_CASA=\["mercado","alimentacao","compras","fiscal",/);
  assert.match(app, /top==="fiscal"\)\{sideMark\("fiscal","fiscal"\);renderFiscal\(\)/);
  assert.match(app, /fiscal:\["fiscal"\]/);
  assert.match(html, /<section id="fiscal" hidden>/); assert.match(html, /href="#fiscal" data-k="fiscal"/);
  assert.match(html, /:not\(\[data-k="fiscal"\]\)/, "o menu da casa mostra a Central Fiscal");
  assert.match(sw, /"\.\/js\/fiscal\.js"/);
});

test("nenhuma ação da tela fiscal gera despesa e o texto diz quando algo é gravado", () => {
  const js = ler("js/fiscal.js");
  assert.match(js, /Não gera despesa\./); assert.match(js, /Só quando você clica em “Salvar na Central Fiscal”/); assert.match(js, /nada é lançado nas despesas/);
  assert.ok(!/gera_despesa/.test(js.replace(/\/\*[\s\S]*?\*\//g, "")), "a tela não mexe em despesa");
});

/* ---------- gravação: Storage de teste + função do banco de teste ---------- */
const DONO = "11111111-1111-4111-8111-111111111111";
function sbFalso(o = {}) {
  const ch = { rpc: [], upload: [], remove: [], select: [] }, fila = (o.rpc || []).slice();
  const limite = (t, c, v) => ({ limit: () => Promise.resolve((o.erroLeitura || {})[t] ? { error: { message: "falhou " + t } } : { data: ((o.tab || {})[t] || []).filter((r) => r[c] === v) }) });
  const sb = {
    rpc: (nome, args) => { ch.rpc.push([nome, args]); return Promise.resolve(fila.length ? fila.shift() : { data: o.dados }); },
    from: (t) => ({ select: () => ({ eq: (c, v) => { ch.select.push([t, c, v]); return limite(t, c, v); } }) }),
    storage: { from: (b) => ({
      upload: (p, blob, opt) => { ch.upload.push({ b, p, blob, opt }); return Promise.resolve(o.upload || {}); },
      remove: (ps) => { ch.remove.push(ps); return Promise.resolve({}); } }) },
  };
  const c = vm.createContext({ NUCLEO: N, SB: sb, DONO, crypto: globalThis.crypto, Blob, setTimeout: (f) => { f(); return 0; }, Math });
  vm.runInContext(ler("js/fiscal.js"), c);
  return { c, ch };
}
const OK = (id) => ({ data: { criado: true, id, conferida: true, itens: 2, docs_gravados: 1, avisos: [], semelhantes: [] } });
const lerNota = async (c, texto = XML) => c.fxLerArquivo(arq("nota.xml", texto));
const sha = async (texto) => { const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)); return Buffer.from(h).toString("hex"); };

test("gravar: envia o XML ao caminho exato (sem sobrescrever), chama a função uma vez com o payload sem CPF e mostra o resultado", async () => {
  const { c, ch } = sbFalso({ rpc: [OK("x")] }); const r = await lerNota(c);
  const x = await c.fxSalvar(r, true), id = r.idNota, h = await sha(XML), caminho = `${DONO}/notas-fiscais/${id}/${h}.xml`;
  assert.equal(x.estado, "gravada"); assert.equal(x.conferida, true);
  assert.equal(ch.upload.length, 1); assert.equal(ch.upload[0].b, "familia"); assert.equal(ch.upload[0].p, caminho);
  assert.deepEqual({ ...ch.upload[0].opt }, { upsert: false, contentType: "text/xml" }); assert.equal(ch.upload[0].blob.type, "text/xml");
  assert.equal(ch.rpc.length, 1); assert.equal(ch.rpc[0][0], "nota_fiscal_salvar");
  const a = ch.rpc[0][1]; assert.equal(a.p_conferir, true); assert.equal(a.p_nota.id, id); assert.equal(a.p_nota.chave, CHAVE); assert.equal(a.p_nota.protocolo, "131260000000001");
  assert.equal(a.p_itens.length, 2); assert.equal(a.p_docs[0].path, caminho); assert.equal(a.p_docs[0].tamanho, new TextEncoder().encode(XML).length); assert.equal(a.p_docs[0].sha256, h);
  assert.ok(!JSON.stringify(a).includes(CPF) && !/CONSUMIDOR/.test(JSON.stringify(a)), "nenhum CPF ou consumidor no que vai ao banco");
  assert.equal(ch.remove.length, 0);
});
test("gravar: o XML sobe SEMPRE como text/xml, seja qual for o tipo que o navegador deu ao arquivo (application/xml, vazio, octet-stream)", async () => {
  for (const tipo of ["text/xml", "application/xml", "", "application/octet-stream"]) {
    const { c, ch } = sbFalso({ rpc: [OK("x")] }); const r = await c.fxLerArquivo(arq("nota.xml", XML, undefined, tipo)), x = await c.fxSalvar(r, false);
    assert.equal(x.estado, "gravada", tipo); assert.deepEqual({ ...ch.upload[0].opt }, { upsert: false, contentType: "text/xml" }, tipo); assert.equal(ch.upload[0].blob.type, "text/xml", tipo);
    assert.equal(ch.rpc[0][1].p_docs[0].mime, "text/xml", tipo);
  }
});
test("gravar: chave já gravada = nada é enviado (evita arquivo solto)", async () => {
  const { c, ch } = sbFalso({ tab: { notas_fiscais: [{ id: "ja", chave: CHAVE, situacao: "autorizada" }] } }); const x = await c.fxSalvar(await lerNota(c), false);
  assert.equal(x.estado, "duplicada"); assert.equal(x.id, "ja"); assert.deepEqual([ch.upload.length, ch.rpc.length, ch.remove.length], [0, 0, 0]); assert.deepEqual(ch.select[0], ["notas_fiscais", "chave", CHAVE]);
});
test("gravar: erro de validação, permissão ou duplicidade NÃO repete; o arquivo enviado nesta tentativa é apagado", async () => {
  for (const code of ["22023", "42501", "23514", "23505", "P0002"]) {
    const { c, ch } = sbFalso({ rpc: [{ error: { code, message: "recusado " + code } }] }); const r = await lerNota(c), x = await c.fxSalvar(r, false);
    assert.equal(x.estado, "erro", code); assert.equal(ch.rpc.length, 1, "sem nova tentativa para " + code); assert.equal(ch.remove.length, 1); assert.equal(ch.remove[0][0], ch.upload[0].p);
  }
});
test("gravar: só o 40001 repete (no máximo 3 vezes), com a MESMA id; ao dar certo nada é apagado", async () => {
  const { c, ch } = sbFalso({ rpc: [{ error: { code: "40001", message: "x" } }, { error: { code: "40001", message: "x" } }, OK("x")] });
  const x = await c.fxSalvar(await lerNota(c), false);
  assert.equal(x.estado, "gravada"); assert.equal(ch.rpc.length, 3); assert.equal(new Set(ch.rpc.map((q) => q[1].p_nota.id)).size, 1, "a repetição usa a mesma id"); assert.equal(ch.remove.length, 0);
  const sempre = sbFalso({ rpc: [1, 2, 3, 4, 5].map(() => ({ error: { code: "40001", message: "serialização" } })) });
  const y = await sempre.c.fxSalvar(await lerNota(sempre.c), false);
  assert.equal(y.estado, "erro"); assert.equal(sempre.ch.rpc.length, 4, "1 chamada + 3 repetições"); assert.equal(sempre.ch.remove.length, 1);
  assert.deepEqual([0, 1, 2, 3, 4].map((n) => N.nfRetentar({ code: "40001" }, n)), [150, 300, 600, null, null]);
  assert.equal(N.nfRetentar({ code: "23505" }, 0), null); assert.equal(N.nfRetentar(null, 0), null); assert.equal(N.nfRetentar({ code: 40001 }, 0), 150, "código numérico também");
});
test("gravar: o banco diz 'duplicada' ou 'já existia': o arquivo recém-enviado e sem registro é descartado; nunca o registrado", async () => {
  const dup = sbFalso({ rpc: [{ data: { criado: false, duplicada: true, motivo: "arquivo", id: "a", docs_para_apagar: ["pasta/novo.xml"] } }] });
  const x = await dup.c.fxSalvar(await lerNota(dup.c), false);
  assert.equal(x.estado, "duplicada"); assert.deepEqual(dup.ch.remove, [["pasta/novo.xml"]]);
  const ja = sbFalso({ rpc: [{ data: { criado: false, ja_existia: true, id: "a", docs_para_apagar: [] } }] });
  const y = await ja.c.fxSalvar(await lerNota(ja.c), false); assert.equal(y.estado, "ja_existia"); assert.equal(ja.ch.remove.length, 0, "nada a apagar: o arquivo do envio é o registrado");
});
test("gravar: falha no envio não chama o banco; arquivo que já estava lá (409) segue sem ser apagado se o banco falhar", async () => {
  const ruim = sbFalso({ upload: { error: { message: "new row violates row-level security policy", statusCode: "403" } } });
  const x = await ruim.c.fxSalvar(await lerNota(ruim.c), false);
  assert.equal(x.estado, "erro"); assert.equal(ruim.ch.rpc.length, 0); assert.equal(ruim.ch.remove.length, 0, "nada foi enviado, nada a apagar");
  const ja = sbFalso({ upload: { error: { message: "The resource already exists", statusCode: "409" } }, rpc: [{ error: { code: "22023", message: "recusado" } }] });
  const y = await ja.c.fxSalvar(await lerNota(ja.c), false);
  assert.equal(y.estado, "erro"); assert.equal(ja.ch.rpc.length, 1); assert.equal(ja.ch.remove.length, 0, "não apaga um arquivo que esta tentativa não enviou");
});
test("gravar: nota que o núcleo não aceita (sem total, sem modelo) não envia nem grava nada", async () => {
  const { c, ch } = sbFalso(); const r = await lerNota(c); r.nota.valores.total = null; r.nota.modelo = null;
  const x = await c.fxSalvar(r, false); assert.equal(x.estado, "bloqueada", "sem total a conta nem se confere: baixa confiança"); assert.deepEqual([ch.upload.length, ch.rpc.length, ch.select.length], [0, 0, 0]); assert.ok(x.erros.length >= 2);
});
test("nota sem chave válida é baixa confiança: não grava nem envia nada (Lote 1.3); a conferência segue sendo uma ação separada", async () => {
  const sem = XML.split(CHAVE).join(CHAVE.slice(0, 43) + ((+CHAVE[43] + 1) % 10));
  const { c, ch } = sbFalso({ rpc: [OK("x")] }); const r = await lerNota(c, sem);
  assert.equal(r.nota.chave_valida, false);
  const x = await c.fxSalvar(r, true);
  assert.equal(x.estado, "bloqueada"); assert.match(x.mensagem, /Baixa confiança.*chave de acesso/); assert.deepEqual([ch.upload.length, ch.rpc.length, ch.remove.length, ch.select.length], [0, 0, 0, 0]);
  const conf = sbFalso({ rpc: [{ data: { ja_conferida: false } }] }), y = await conf.c.fxConferir("id-1");
  assert.equal(y.estado, "conferida"); assert.equal(JSON.stringify(conf.ch.rpc[0]), JSON.stringify(["nota_fiscal_conferir", { p_id: "id-1" }]));
});
test("gravar: função ainda não aplicada no banco vira mensagem clara (nada fica solto)", async () => {
  const { c, ch } = sbFalso({ rpc: [{ error: { code: "PGRST202", message: "Could not find the function public.nota_fiscal_salvar" } }] });
  const x = await c.fxSalvar(await lerNota(c), false); assert.equal(x.estado, "erro"); assert.match(x.mensagem, /migration 034 não foi aplicada/); assert.equal(ch.remove.length, 1);
});
