// Central Fiscal, Lote 1.3 (docs/fiscal.md): a validação do núcleo (conta, situação fiscal, duplicidade) integrada à tela #fiscal e à gravação.
// Sem banco, sem rede e sem IA: o Supabase e o Storage são objetos de teste. XML, CNPJ, chaves e nomes abaixo são FICTÍCIOS.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8");
const DONO = "11111111-1111-4111-8111-111111111111", CNPJ = "11222333000181";

// ---------- XML de teste: uma variação por situação ----------
const chaveDe = (tp) => { const b = "31" + "2611" + CNPJ + "55" + "001" + "000000123" + tp + "12345678"; return b + N.nfDvChave(b); };
function xml({ tp = "1", prot = true, cStat = "100", vNF = "25.25", semQtd = false, cancelada = false } = {}) {
  const ch = chaveDe(tp);
  return `<nfeProc><NFe><infNFe Id="NFe${ch}" versao="4.00"><ide><mod>55</mod><serie>1</serie><nNF>123</nNF><dhEmi>2026-11-06T10:00:00-03:00</dhEmi><tpEmis>${tp}</tpEmis></ide>
<emit><CNPJ>${CNPJ}</CNPJ><xNome>LOJA EXEMPLO LTDA</xNome><enderEmit><UF>MG</UF></enderEmit></emit>
<det nItem="1"><prod><cProd>10</cProd><xProd>PAPEL HIGIENICO EXEMPLO</xProd><qCom>${semQtd ? "" : "1.0000"}</qCom><uCom>UN</uCom><vUnCom>13.29</vUnCom><vProd>13.29</vProd><vDesc>0.66</vDesc></prod></det>
<det nItem="2"><prod><cProd>11</cProd><xProd>SUCO EXEMPLO</xProd><qCom>1.0000</qCom><uCom>UN</uCom><vUnCom>13.29</vUnCom><vProd>13.29</vProd><vDesc>0.67</vDesc></prod></det>
<total><ICMSTot><vProd>26.58</vProd><vDesc>1.33</vDesc><vFrete>0.00</vFrete><vOutro>0.00</vOutro><vNF>${vNF}</vNF></ICMSTot></total>
<pag><detPag><tPag>03</tPag><vPag>${vNF}</vPag></detPag></pag></infNFe>${prot ? `<protNFe><infProt><cStat>${cStat}</cStat><nProt>131260000000001</nProt><chNFe>${ch}</chNFe></infProt></protNFe>` : ""}${cancelada ? "<retEvento><infEvento><tpEvento>110111</tpEvento><cStat>135</cStat></infEvento></retEvento>" : ""}</NFe></nfeProc>`;
}
const CASOS = {
  autorizada: xml(),
  pendente: xml({ prot: false }),
  contingencia: xml({ tp: "9", prot: false }),
  divergente: xml({ vNF: "30.00" }),
  baixa: xml({ semQtd: true }),
  cancelada: xml({ cancelada: true }),
  rejeitada: xml({ cStat: "204" }),
};
const CHAVE = chaveDe("1"), CHAVE_CONT = chaveDe("9");

// ---------- ambiente: o arquivo, o Supabase e o Storage de teste ----------
const arq = (texto) => ({ name: "nota.xml", size: texto.length, type: "text/xml", text: () => Promise.resolve(texto), arrayBuffer: () => Promise.resolve(new TextEncoder().encode(texto).buffer) });
function ambiente(o = {}) {
  const ch = { rpc: [], upload: [], remove: [], select: [] };
  const sb = {
    rpc: (nome, args) => { ch.rpc.push([nome, args]); return Promise.resolve(o.rpc || { data: { criado: true, id: "novo", conferida: !!args.p_conferir, itens: 2, docs_gravados: 1, avisos: [], semelhantes: [] } }); },
    from: (t) => ({ select: () => ({ eq: (c, v) => { ch.select.push([t, c, v]); return { limit: () => Promise.resolve((o.erroLeitura || {})[t] ? { error: { message: "falhou " + t } } : { data: ((o.tab || {})[t] || []).filter((r) => r[c] === v) }) }; } }) }),
    storage: { from: () => ({ upload: (p, blob, opt) => { ch.upload.push({ p, opt }); return Promise.resolve({}); }, remove: (ps) => { ch.remove.push(ps); return Promise.resolve({}); } }) },
  };
  const stub = (tag, attrs, ...kids) => { const n = { tag, attrs: attrs || {}, kids: [], text: (attrs && attrs.text) || "" };
    n.appendChild = (k) => { n.kids.push(k); return k; }; kids.forEach((k) => { if (k != null) n.kids.push(typeof k === "string" ? { tag: "#t", attrs: {}, kids: [], text: k } : k); }); return n; };
  const c = vm.createContext({ NUCLEO: N, SB: sb, DONO, crypto: globalThis.crypto, Blob, setTimeout: (f) => { f(); return 0; }, Math, h: stub,
    brl: (v) => "R$ " + Number(v).toFixed(2).replace(".", ","), dataBR: (d) => d });
  vm.runInContext(ler("js/fiscal.js"), c);
  return { c, ch };
}
const texto = (n) => (n.textContent !== undefined ? n.textContent : n.text) + (n.kids || []).map(texto).join(" ");
const achar = (n, f) => (f(n) ? [n] : []).concat(...(n.kids || []).map((k) => achar(k, f)));
const lerNota = (c, t) => c.fxLerArquivo(arq(t));
const esperar = async (bloco) => { for (let i = 0; i < 600; i++) { await new Promise((r) => setTimeout(r, 5)); if (!/Salvando…/.test(texto(bloco))) return; } assert.fail("a gravação não terminou"); };

// ================= decisão do núcleo (a mesma que a tela e a gravação seguem) =================
test("decisão: autorizada e consistente = validada; pendente/contingência consistente = pendente fiscal; o resto é bloqueado", () => {
  const dec = (k) => N.nfDecisaoGravacao(N.nfNormalizar(N.nfLerXML(CASOS[k])), null);
  const aut = dec("autorizada"); assert.deepEqual([aut.pode, aut.modo, aut.conferir_permitido, aut.veredito.classe, aut.veredito.fiscal.situacao], [true, "validada", true, "consistente", "autorizada"]);
  for (const k of ["pendente", "contingencia"]) { const d = dec(k); assert.deepEqual([d.pode, d.modo, d.conferir_permitido, d.veredito.classe, d.veredito.pode_alimentar_financeiro], [true, "pendente_fiscal", false, "consistente", false], k); assert.match(d.avisos.join(" "), /pendente de validação fiscal/); }
  assert.equal(dec("pendente").veredito.fiscal.situacao, "pendente"); assert.equal(dec("contingencia").veredito.fiscal.situacao, "contingencia");
  const div = dec("divergente"); assert.deepEqual([div.pode, div.modo, div.veredito.classe], [false, "bloqueada", "divergente"]); assert.match(div.bloqueios.join(" "), /A conta não fecha.*R\$ 4,75 a menos/);
  const baixa = dec("baixa"); assert.deepEqual([baixa.pode, baixa.modo, baixa.veredito.classe], [false, "bloqueada", "baixa_confianca"]); assert.match(baixa.bloqueios.join(" "), /Baixa confiança.*Item 1.*quantidade/);
  for (const k of ["cancelada", "rejeitada"]) { const d = dec(k); assert.deepEqual([d.pode, d.modo, d.veredito.fiscal.bloqueada], [false, "bloqueada", true], k); assert.match(d.bloqueios.join(" "), new RegExp(k)); assert.equal(d.veredito.pode_alimentar_financeiro, false); }
  for (const k of Object.keys(CASOS)) assert.equal(dec(k).gera_despesa, false, k);
});
test("nfParaGravar aplica a mesma decisão: bloqueado não gera payload aceito; pendente fiscal nunca é conferida", () => {
  const para = (k, conferir = true) => { const l = N.nfLerXML(CASOS[k]), n = N.nfNormalizar(l); return N.nfParaGravar(l, n, { id: "5f1c2d3e-4a5b-4c6d-8e7f-90a1b2c3d4e5", dono: DONO, nome: "n.xml", mime: "text/xml", tamanho: 500, sha256: "a".repeat(64), conferir }); };
  const aut = para("autorizada"); assert.equal(aut.ok, true, aut.erros.join(" ")); assert.equal(aut.modo, "validada"); assert.equal(aut.args.p_conferir, true); assert.equal(aut.args.p_nota.requer_conferencia, false);
  for (const k of ["pendente", "contingencia"]) { const g = para(k); assert.equal(g.ok, true, g.erros.join(" ")); assert.equal(g.modo, "pendente_fiscal"); assert.equal(g.args.p_conferir, false, "pedir para conferir não vale"); assert.equal(g.args.p_nota.requer_conferencia, true); assert.equal(g.args.p_nota.situacao, k); assert.match(g.avisos.join(" "), /pendente fiscal/); }
  for (const k of ["divergente", "baixa", "cancelada", "rejeitada"]) { const g = para(k); assert.equal(g.ok, false, k); assert.equal(g.modo, "bloqueada"); assert.match(g.erros.join(" "), /Gravação bloqueada/, k); }
});

// ================= gravação pela tela (fxSalvar): o que vai e o que não vai =================
test("nota autorizada e consistente: grava como validada (envia o XML, chama a função uma vez e confere se a pessoa marcou)", async () => {
  const { c, ch } = ambiente(); const r = await lerNota(c, CASOS.autorizada), x = await c.fxSalvar(r, true);
  assert.equal(x.estado, "gravada"); assert.equal(x.modo, "validada"); assert.match(x.mensagem, /gravada e conferida/);
  assert.deepEqual([ch.upload.length, ch.rpc.length], [1, 1]); assert.equal(ch.rpc[0][0], "nota_fiscal_salvar"); assert.equal(ch.rpc[0][1].p_conferir, true);
  const lidas = ch.select.map((q) => q[0]).sort(); assert.ok(lidas.includes("notas_fiscais") && lidas.includes("notas_fiscais_docs") && lidas.includes("compras_online") && lidas.includes("notas") && lidas.includes("pedidos"), "a duplicidade foi conferida antes de gravar");
  assert.ok(ch.select.length >= 5);
});
test("nota pendente ou em contingência, consistente: grava só como pendente fiscal, sem conferência e sem despesa", async () => {
  for (const k of ["pendente", "contingencia"]) {
    const { c, ch } = ambiente(); const r = await lerNota(c, CASOS[k]), x = await c.fxSalvar(r, true);
    assert.equal(x.estado, "gravada", k); assert.equal(x.modo, "pendente_fiscal"); assert.match(x.mensagem, /pendente fiscal/); assert.ok(!/conferida\./.test(x.mensagem));
    const a = ch.rpc[0][1]; assert.equal(a.p_conferir, false); assert.equal(a.p_nota.requer_conferencia, true); assert.equal(a.p_nota.situacao, k); assert.equal(a.p_nota.protocolo, null);
    assert.match((x.avisos || []).join(" "), /pendente de validação fiscal|pendente fiscal/);
    assert.deepEqual(ch.rpc.map((q) => q[0]), ["nota_fiscal_salvar"], "nenhuma outra função: nada de despesa ou Financeiro");
  }
});
test("nota divergente, de baixa confiança, cancelada ou rejeitada: nada é enviado, nada é gravado, nada vira despesa", async () => {
  for (const k of ["divergente", "baixa", "cancelada", "rejeitada"]) {
    const { c, ch } = ambiente(); const r = await lerNota(c, CASOS[k]);
    assert.ok(r.nota, k); const x = await c.fxSalvar(r, true);
    assert.equal(x.estado, "bloqueada", k); assert.match(x.mensagem, /Nada foi enviado nem gravado/);
    assert.deepEqual([ch.upload.length, ch.rpc.length, ch.remove.length, ch.select.length], [0, 0, 0, 0], k + ": sem Storage, sem banco, sem leitura");
  }
  const canc = ambiente(); const x = await canc.c.fxSalvar(await lerNota(canc.c, CASOS.cancelada), false); assert.match(x.mensagem, /cancelada.*não vale como compra fiscal validada.*não alimenta o Financeiro/);
});
test("nenhum caminho da tela cria despesa: só a função de gravar e a de conferir; sem escrita direta", () => {
  const js = ler("js/fiscal.js").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.deepEqual([...new Set([...js.matchAll(/fxRpc\("([a-z_]+)"/g)].map((m) => m[1]))].sort(), ["nota_fiscal_conferir", "nota_fiscal_salvar"]);
  assert.ok(!/\.insert\(|\.update\(|\.upsert\(|\.delete\(|gera_despesa|despesa\s*[:=]/i.test(js.replace(/Nenhuma nota gera despesa|Não gera despesa|despesas?\./gi, "")), "sem escrita em tabela nem criação de despesa");
});

// ================= duplicidade antes de gravar =================
test("duplicidade confirmada: mesma chave, mesmo arquivo ou compra que cita a chave — a nota não é gravada de novo e nada é enviado", async () => {
  const sha = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(CASOS.autorizada))).toString("hex");
  const casos = [["chave", { notas_fiscais: [{ id: "n1", chave: CHAVE, situacao: "autorizada" }] }, "n1"], ["arquivo", { notas_fiscais_docs: [{ nota_id: "n2", sha256: sha }] }, "n2"],
    ["emitente + número", { notas_fiscais: [{ id: "n3", chave: null, modelo: "55", serie: 1, numero: 123, emitente_cnpj: CNPJ, situacao: "autorizada" }] }, "n3"]];
  for (const [rot, tab, id] of casos) {
    const { c, ch } = ambiente({ tab }); const x = await c.fxSalvar(await lerNota(c, CASOS.autorizada), true);
    assert.equal(x.estado, "duplicada", rot); assert.equal(x.id, id); assert.match(x.mensagem, /já está na Central Fiscal.*Nada foi enviado/); assert.deepEqual([ch.upload.length, ch.rpc.length], [0, 0], rot);
  }
});
test("atualização de situação: nota guardada como contingência e agora autorizada é reconhecida, sem criar outra nota", async () => {
  const { c, ch } = ambiente({ tab: { notas_fiscais: [{ id: "n9", chave: CHAVE, situacao: "contingencia" }] } });
  const x = await c.fxSalvar(await lerNota(c, CASOS.autorizada), true);
  assert.equal(x.estado, "duplicada"); assert.deepEqual({ ...x.atualizar }, { id: "n9", de: "contingencia", para: "autorizada" }); assert.match(x.mensagem, /contingência.*autorizada.*atualização da situação ainda não é feita por esta tela/);
  assert.deepEqual([ch.upload.length, ch.rpc.length], [0, 0]);
});
test("possível duplicidade (Mercado, pedido ou nota parecida) só avisa: a nota é gravada e nenhuma despesa é criada", async () => {
  const nota = { notas: [{ id: "m1", data: "2026-11-06", total: 25.25, mercados: { nome: "Loja Exemplo" } }] };
  const m = ambiente({ tab: nota }); const x = await m.c.fxSalvar(await lerNota(m.c, CASOS.autorizada), false);
  assert.equal(x.estado, "gravada"); assert.match(x.avisos.join(" "), /Possível duplicidade no Mercado.*Nenhuma despesa será criada/); assert.equal(m.ch.rpc.length, 1);
  const p = ambiente({ tab: { pedidos: [{ id: "p1", data: "2026-11-06", total_pago: 25.25, estabelecimento: "Loja Exemplo" }] } }); const y = await p.c.fxSalvar(await lerNota(p.c, CASOS.autorizada), false);
  assert.equal(y.estado, "gravada"); assert.match(y.avisos.join(" "), /Possível duplicidade nas despesas/);
  const n = ambiente({ tab: { notas_fiscais: [{ id: "n5", chave: chaveDe("2"), modelo: "55", serie: 1, numero: 999, emitente_cnpj: CNPJ, data_emissao: "2026-11-06", valor_total: 25.25, situacao: "autorizada" }] } });
  const z = await n.c.fxSalvar(await lerNota(n.c, CASOS.autorizada), false); assert.equal(z.estado, "gravada"); assert.match(z.avisos.join(" "), /Possível duplicidade: já há nota do mesmo emitente, data e valor/);
});
test("compra online que já cita a nota: a nota é gravada como documento, com aviso de que a compra existe e sem despesa nova", async () => {
  const { c, ch } = ambiente({ tab: { compras_online: [{ id: "c1", chave_nfe: CHAVE, data: "2026-11-01", total_pago: 99, loja: "amazon" }] } });
  const x = await c.fxSalvar(await lerNota(c, CASOS.autorizada), false);
  assert.equal(x.estado, "gravada"); assert.match(x.avisos.join(" "), /Esta compra já existe em Compras online.*Nenhuma despesa será criada/); assert.deepEqual(ch.rpc.map((q) => q[0]), ["nota_fiscal_salvar"]);
});
test("sem falso positivo: mesma data e valor em outro estabelecimento não gera aviso", async () => {
  const { c } = ambiente({ tab: { notas: [{ id: "m1", data: "2026-11-06", total: 25.25, mercados: { nome: "Padaria Qualquer" } }] } });
  const x = await c.fxSalvar(await lerNota(c, CASOS.autorizada), false); assert.equal(x.estado, "gravada"); assert.deepEqual(x.avisos.filter((a) => /duplicidade/i.test(a)), []);
});
test("leitura obrigatória falhou = nada é enviado; leitura opcional falhou = avisa e a conferência do banco segue valendo", async () => {
  const obrig = ambiente({ erroLeitura: { notas_fiscais: true } }); const x = await obrig.c.fxSalvar(await lerNota(obrig.c, CASOS.autorizada), false);
  assert.equal(x.estado, "erro"); assert.deepEqual([obrig.ch.upload.length, obrig.ch.rpc.length], [0, 0]);
  const opc = ambiente({ erroLeitura: { notas: true, pedidos: true } }); const y = await opc.c.fxSalvar(await lerNota(opc.c, CASOS.autorizada), false);
  assert.equal(y.estado, "gravada"); assert.match(y.avisos.join(" "), /Não consegui conferir duplicidade com o Mercado/); assert.match(y.avisos.join(" "), /os pedidos/);
});

// ================= interface: o cartão e o bloco de salvar =================
test("interface: cada situação mostra a conta, a diferença em reais e a situação fiscal em linhas separadas", async () => {
  const { c } = ambiente(); const cartao = async (k) => texto(c.fxCartao(await lerNota(c, CASOS[k]), false));
  const aut = await cartao("autorizada");
  assert.match(aut, /Situação fiscal.*Autorizada/); assert.match(aut, /Conta dos itens.*Consistente/); assert.match(aut, /Total calculado pelos itens.*R\$ 25,25/); assert.match(aut, /Total fiscal.*R\$ 25,25/); assert.match(aut, /Os itens fecham com o total fiscal/); assert.match(aut, /Pode ser gravada como validada/);
  const pend = await cartao("contingencia");
  assert.match(pend, /Situação fiscal.*Contingência — pendente de validação fiscal/); assert.match(pend, /Conta dos itens.*Consistente/, "a conta certa não torna a nota autorizada"); assert.match(pend, /Só como pendente fiscal \(sem validação\)/);
  const div = await cartao("divergente");
  assert.match(div, /Conta dos itens.*Divergente/); assert.match(div, /Total calculado pelos itens.*R\$ 25,25/); assert.match(div, /Total fiscal.*R\$ 30,00/); assert.match(div, /R\$ 4,75 a menos que o total fiscal/); assert.match(div, /Situação fiscal.*Autorizada/, "autorizada com conta errada"); assert.match(div, /Gravação.*Bloqueada/);
  const baixa = await cartao("baixa"); assert.match(baixa, /Conta dos itens.*Baixa confiança/); assert.match(baixa, /Baixa confiança: Item 1.*falta a quantidade/);
  for (const k of ["cancelada", "rejeitada"]) { const t = await cartao(k); assert.match(t, new RegExp("Situação fiscal.*" + (k === "cancelada" ? "Cancelada" : "Rejeitada") + " — não vale como compra"), k); assert.match(t, /Conta dos itens.*Consistente/); assert.match(t, /não vale como compra fiscal validada/); assert.match(t, /Gravação.*Bloqueada/); }
});
test("interface: o botão de salvar existe só quando a gravação é possível; pendente fiscal não pode ser conferida", async () => {
  const { c } = ambiente(); const bloco = async (k) => c.fxBlocoSalvar(await lerNota(c, CASOS[k]));
  const botoes = (n) => achar(n, (x) => x.tag === "button"), caixas = (n) => achar(n, (x) => x.tag === "input");
  const aut = await bloco("autorizada"); assert.equal(botoes(aut).length, 1); assert.equal(botoes(aut)[0].attrs.text, "Salvar na Central Fiscal"); assert.ok(!caixas(aut)[0].disabled, "pode marcar 'Conferi'");
  for (const k of ["pendente", "contingencia"]) { const b = await bloco(k); assert.equal(botoes(b)[0].attrs.text, "Salvar como pendente fiscal"); assert.equal(caixas(b)[0].disabled, true); assert.match(texto(b), /sem conferência e sem validação até ser autorizada/); }
  for (const k of ["divergente", "baixa", "cancelada", "rejeitada"]) { const b = await bloco(k); assert.equal(botoes(b).length, 0, k + ": sem botão"); assert.match(texto(b), /Gravação bloqueada.*Refaça a leitura.*Nada foi enviado nem gravado/, k); }
});
test("interface: clicar em salvar mostra sucesso só se gravou; bloqueio por duplicidade mostra o motivo e não diz 'gravada'", async () => {
  const ok = ambiente(); const bOk = ok.c.fxBlocoSalvar(await lerNota(ok.c, CASOS.autorizada)); achar(bOk, (x) => x.tag === "button")[0].onclick(); await esperar(bOk);
  assert.match(texto(bOk), /Nota gravada \(pendente de conferência\)/); assert.equal(ok.ch.rpc.length, 1);
  const dup = ambiente({ tab: { notas_fiscais: [{ id: "n1", chave: CHAVE, situacao: "autorizada" }] } }); const bDup = dup.c.fxBlocoSalvar(await lerNota(dup.c, CASOS.autorizada)); const btn = achar(bDup, (x) => x.tag === "button")[0]; btn.onclick(); await esperar(bDup);
  const t = texto(bDup); assert.match(t, /já está na Central Fiscal/); assert.ok(!/Nota gravada/.test(t), "nenhuma mensagem de sucesso"); assert.equal(btn.disabled, true, "não dá para tentar de novo"); assert.equal(dup.ch.rpc.length, 0);
  const pf = ambiente(); const bPf = pf.c.fxBlocoSalvar(await lerNota(pf.c, CASOS.contingencia)); achar(bPf, (x) => x.tag === "button")[0].onclick(); await esperar(bPf);
  assert.match(texto(bPf), /gravada como pendente fiscal \(sem validação até a autorização\)/);
  const falha = ambiente({ rpc: { error: { code: "42501", message: "x" } } }); const bF = falha.c.fxBlocoSalvar(await lerNota(falha.c, CASOS.autorizada)); const bt = achar(bF, (x) => x.tag === "button")[0]; bt.onclick(); await esperar(bF);
  assert.match(texto(bF), /Não gravei/); assert.ok(!/Nota gravada/.test(texto(bF))); assert.equal(bt.disabled, false, "falha de rede/permissão permite tentar de novo");
});
test("estilo e versão: a classe de bloqueio existe no CSS e a versão do site e dos módulos mudou junto", () => {
  assert.match(ler("index.html"), /#fiscal \.fxbloq\{/);
  const v = /const VERSAO = "([^"]+)"/.exec(ler("sw.js"))[1], m = /MOD_VERSAO="([^"]+)"/.exec(ler("js/app.js"))[1];
  assert.equal(v, m); assert.notEqual(v, "2026-11-07.7");
});
