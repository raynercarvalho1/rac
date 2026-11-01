// Central de Compras sem rede e sem custo: leitura do texto de pedido (PDF/e-mail/OCR), da NF-e (XML) e do CSV de histórico, a conta,
// a junção de documentos do mesmo pedido com divergências, a duplicidade entre fontes, recorrência só informativa, a entrada no Painel
// (uma vez, pelo total pago) e o SQL 025 (casa, RLS, trava da 2ª etapa, sem dado de cartão). Os pedidos dos testes são fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const semComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
const RESUMO = `Detalhes do pedido
Pedido feito em 3 de outubro de 2026   Pedido nº 701-0000001-0000002
Programe e Poupe: entrega automática a cada 2 meses
Itens pedidos
1 unidade de: Ração Exemplo 1 kg para cães
Vendido por: Amazon.com.br
R$ 100,00
Forma de pagamento
Visa terminado em 1234
Subtotal dos itens: R$ 100,00
Frete e manuseio: R$ 0,00
Desconto Programe e Poupe: -R$ 5,00
Total do pedido: R$ 95,00`;
const XML = `<nfeProc><NFe><infNFe Id="NFe35261000000000000100550010000000011000000011" versao="4.00"><ide><serie>1</serie><nNF>11</nNF><dhEmi>2026-10-03T10:00:00-03:00</dhEmi></ide>
<emit><CNPJ>00000000000100</CNPJ><xNome>AMAZON EXEMPLO LTDA</xNome></emit><det nItem="1"><prod><cProd>B0EX</cProd><xProd>RACAO EXEMPLO 1KG</xProd><qCom>1.0000</qCom><vUnCom>100.00</vUnCom><vProd>100.00</vProd><vDesc>5.00</vDesc></prod></det>
<total><ICMSTot><vProd>100.00</vProd><vFrete>0.00</vFrete><vDesc>5.00</vDesc><vOutro>0.00</vOutro><vNF>95.00</vNF></ICMSTot></total><pag><detPag><tPag>03</tPag></detPag></pag>
<infAdic><infCpl>Pedido Amazon 701-0000001-0000002</infCpl></infAdic></infNFe></NFe></nfeProc>`;

test("texto do pedido (PDF de resumo ou e-mail): loja, número, data, produto, valores, desconto, pagamento e recorrência", () => {
  const o = N.coLerTexto(RESUMO);
  assert.equal(o.loja, "amazon"); assert.equal(o.numero, "701-0000001-0000002"); assert.equal(o.data, "2026-10-03");
  assert.deepEqual([o.subtotal, o.desconto, o.frete, o.total_pago], [100, 5, 0, 95]);
  assert.equal(o.vendedor, "Amazon.com.br"); assert.equal(o.pagamento, "Visa final 1234");
  assert.deepEqual(o.recorrencia, { texto: "Entrega automática a cada 2 meses", meses: 2 });
  assert.equal(o.itens.length, 1); assert.equal(o.itens[0].total, 100); assert.equal(o.itens[0].categoria, "Pet");
  assert.equal(N.coConferir(o, { hoje: "2026-11-01" }).ok, true);
  assert.equal(N.coLerTexto("Seu pedido foi entregue. Pedido nº 701-0000001-0000002").tipo, "email_entrega");
});
test("pagamento: só bandeira e 4 últimos dígitos; número de cartão inteiro nunca é guardado", () => {
  assert.equal(N.coPagamento("Mastercard terminado em 1234"), "Mastercard final 1234");
  assert.equal(N.coPagamento("Mastercard - 1234"), "Mastercard final 1234"); assert.equal(N.coPagamento("Elo ****9876"), "Elo final 9876");
  assert.equal(N.coPagamento("Cartão 5555666677778888"), null); assert.equal(N.coPagamento("Pix"), "Pix");
  assert.match(semComent(ler("supabase/025_compras_online.sql")), /pagamento !~ '\\d\{5,\}'/, "o banco recusa números longos no pagamento");
});
test("NF-e (XML): chave, número, emitente, itens, totais, forma de pagamento e o número do pedido nas informações complementares", () => {
  const x = N.coLerNFe(XML);
  assert.equal(x.chave_nfe.length, 44); assert.equal(x.numero_nf, "11"); assert.equal(x.data, "2026-10-03"); assert.equal(x.cnpj, "00000000000100");
  assert.equal(x.numero, "701-0000001-0000002"); assert.equal(x.loja, "amazon"); assert.equal(x.pagamento, "Cartão de crédito");
  assert.deepEqual([x.subtotal, x.desconto, x.frete, x.total_pago], [100, 5, 0, 95]); assert.equal(x.itens[0].codigo, "B0EX");
  assert.equal(N.coLerNFe("<html>não é nota</html>"), null);
});
test("CSV de histórico (Amazon Solicitar seus dados): um pedido por número, cancelados fora, pagamento sem número de cartão", () => {
  const csv = "Website,Order ID,Order Date,Unit Price,Total Owed,Shipping Charge,Total Discounts,Quantity,Payment Instrument Type,ASIN,Product Name,Order Status\n" +
    "Amazon.com.br,701-1111111-2222222,2026-09-10T12:00:00Z,50.00,95.00,0,5.00,2,\"Mastercard - 1234\",B01,Produto A,Closed\n" +
    "Amazon.com.br,701-1111111-2222222,2026-09-10T12:00:00Z,10.00,10.00,0,0,1,\"Mastercard - 1234\",B02,Produto B,Closed\n" +
    "Amazon.com.br,701-3333333-4444444,2026-09-12T12:00:00Z,30.00,30.00,0,0,1,Visa,B03,Produto C,Cancelled";
  const l = N.coLerCSV(csv);
  assert.equal(l.length, 1); assert.equal(l[0].numero, "701-1111111-2222222"); assert.equal(l[0].data, "2026-09-10");
  assert.equal(l[0].itens.length, 2); assert.deepEqual([l[0].subtotal, l[0].desconto, l[0].total_pago], [110, 5, 105]); assert.equal(l[0].pagamento, "Mastercard final 1234");
});
test("conta: total pago = subtotal − desconto + frete + taxas; total ausente ou divergente impede; produtos que não somam é aviso", () => {
  const ok = { loja: "amazon", numero: "1", data: "2026-11-01", itens: [{ descricao: "X", qtd: 1, total: 136.42 }], subtotal: 136.42, desconto: 6.82, frete: 0, total_pago: 129.6 };
  assert.equal(N.coConferir(ok, { hoje: "2026-11-01" }).ok, true);
  assert.match(N.coConferir({ ...ok, total_pago: 130 }).erros.join(" "), /A conta dá R\$ 129,60/);
  assert.match(N.coConferir({ ...ok, total_pago: null }).erros.join(" "), /total pago/);
  assert.match(N.coConferir({ ...ok, data: "2026-12-01" }, { hoje: "2026-11-01" }).erros.join(" "), /futuro/);
  assert.match(N.coConferir({ ...ok, itens: [{ descricao: "X", qtd: 1, total: 100 }] }).avisos.join(" "), /Os produtos somam/);
});
test("documentos do mesmo pedido se juntam; valores diferentes viram divergência (nada é trocado em silêncio)", () => {
  const m = N.coMesclar(N.coLerTexto(RESUMO), N.coLerNFe(XML));
  assert.equal(m.chave_nfe.length, 44); assert.equal(m.emitente, "AMAZON EXEMPLO LTDA"); assert.equal(m.total_pago, 95); assert.deepEqual(m.divergencias, []);
  assert.equal(m.itens[0].codigo, "B0EX", "o código da nota vai para o produto do resumo");
  const d = N.coMesclar(N.coLerTexto(RESUMO), { ...N.coLerNFe(XML), total_pago: 96 });
  assert.equal(d.total_pago, 95); assert.match(d.divergencias[0].texto, /total pago é R\$ 95,00 num documento e R\$ 96,00 no XML da nota fiscal/);
});
test("duplicidade: mesmo pedido ou mesma nota é o mesmo registro (só anexa); mesmo dia e total em outra fonte só pergunta", () => {
  const ex = [{ id: "a", loja: "amazon", numero: "701-0000001-0000002", data: "2026-10-03", total_pago: 95, chave_nfe: null }];
  assert.equal(N.coDuplicata({ loja: "amazon", numero: "7010000001 0000002", data: "2026-10-03", total_pago: 95 }, ex).nivel, "confirmada");
  assert.equal(N.coDuplicata({ loja: "amazon", numero: "701-0000009-0000009", data: "2026-10-03", total_pago: 95 }, ex).nivel, "possivel");
  assert.equal(N.coDuplicata({ loja: "amazon", numero: "701-0000009-0000009", data: "2026-10-04", total_pago: 95 }, ex), null);
  assert.match(N.coDuplicata({ loja: "outra", numero: "9", data: "2026-10-05", total_pago: 30 }, [], [{ origem: "Mercado", data: "2026-10-05", total: 30, nome: "Mercado Exemplo" }]).motivo, /Mercado/);
  const sql = semComent(ler("supabase/025_compras_online.sql"));
  assert.match(sql, /create unique index if not exists compras_online_pedido_unico on public\.compras_online/);
  assert.match(sql, /create unique index if not exists compras_online_nfe_unica/); assert.match(sql, /create unique index if not exists compras_online_docs_arquivo_unico on public\.compras_online_docs \(user_id, sha256\)/);
});
test("recorrência: só informação a confirmar, com a próxima data como estimativa; nenhuma compra futura", () => {
  const c = [{ id: "a", data: "2026-11-01", total_pago: 129.6, recorrencia_texto: "Entrega automática a cada 4 meses", recorrencia_meses: 4, recorrencia_status: "a_confirmar", itens: [{ descricao: "Remédio Exemplo 250 mg", qtd: 1, total: 136.42 }] }];
  const r = N.coRecorrencias(c);
  assert.equal(r.length, 1); assert.equal(r[0].informada.status, "a_confirmar"); assert.equal(r[0].proximaEstimada, "2027-03-01", "4 meses de calendário depois");
  assert.equal(N.coDespesas(c).length, 1, "só a compra real vira despesa");
  /* percebida: o mesmo produto 2 vezes */
  const p = N.coRecorrencias([{ data: "2026-07-01", itens: [{ descricao: "Ração Exemplo 1kg" }] }, { data: "2026-09-01", itens: [{ descricao: "Racao Exemplo 1 kg" }] }]);
  assert.equal(p[0].vezes, 2); assert.equal(p[0].intervaloDias, 62);
});
test("Painel: cada compra entra uma vez pelo total pago; marcada como já contada fica fora; as outras fontes não mudam", () => {
  const c = [{ id: "a", data: "2026-11-01", total_pago: 129.6, itens: [{ descricao: "Bravecto", total: 136.42, desconto: 0, categoria: "Pet" }] }, { id: "b", data: "2026-11-01", total_pago: 50, fora_das_contas: true, itens: [] }];
  const d = N.coDespesas(c); assert.deepEqual(d.map((x) => [x.v, x.f, x.cat]), [[129.6, "Compras online", "Pet"]]);
  const compras = [{ data: "2026-10-01", valor_total: 30, categoria: "Mercearia" }];
  assert.deepEqual(N.pnDespesas(compras, [], [], null, [], c).slice(1), N.pnDespesas(compras, [], [], null, []));
  const pn = ler("js/painel.js");
  assert.match(pn, /SB\.from\("compras_online"\)\.select\("id,data,loja,vendedor,total_pago,categoria,fora_das_contas,compras_online_itens/);
  assert.match(pn, /D\.online&&D\.online\.ok\?D\.online\.v:\[\]\)/); assert.match(pn, /function pnOnline\(D,B\)/);
});
test("SQL 025: casa, RLS, trava da 2ª etapa, nada para anon, conta fechada, cofre com os originais; 022, backup e tela integrados", () => {
  const s = semComent(ler("supabase/025_compras_online.sql"));
  assert.match(s, /^\s*begin;/m); assert.match(s, /commit;/);
  for (const t of ["compras_online", "compras_online_itens", "compras_online_docs"]) assert.match(s, new RegExp(`create table if not exists public\\.${t} `));
  assert.match(s, /foreach t in array array\['compras_online', 'compras_online_itens', 'compras_online_docs'\] loop/);
  assert.match(s, /enable row level security/); assert.match(s, /create policy "mfa" on public\.%I as restrictive/);
  assert.match(s, /create policy "casa" on public\.compras_online for all to authenticated\s+using \(user_id = public\.dono_da_casa\(\)\)/);
  assert.match(s, /revoke all on public\.compras_online, public\.compras_online_itens, public\.compras_online_docs from anon;/);
  assert.match(s, /constraint compras_online_conta_fecha check \(abs\(total_pago - \(subtotal - desconto \+ frete \+ taxas\)\) <= 0\.02\)/);
  assert.match(s, /update storage\.buckets\s+set allowed_mime_types = array\['image\/\*', 'video\/\*', 'application\/pdf'/); assert.match(s, /where id = 'familia' and public = false;/);
  assert.ok(!/ia_config|acoes_reais|limite_brl|vault|cron\.|drop table|delete from/i.test(s));
  assert.match(ler("supabase/022_seguranca.sql"), /'pedido_itens', 'compras_online', 'compras_online_itens', 'compras_online_docs'\] loop/);
  assert.deepEqual(N.segDef("compras_online_itens").fk, { compra_id: "compras_online" }); assert.deepEqual(N.segDef("compras_online_docs").nat, [["sha256"]]);
  assert.match(ler("js/sistema.js"), /t==="compras_online_docs"/);
  const app = ler("js/app.js"), html = ler("index.html"), js = ler("js/compras.js");
  assert.match(app, /var DA_CASA=\["mercado","alimentacao","compras",/); assert.match(app, /renderCompras\(parts\[1\],parts\[2\]\)/);
  assert.match(html, /<section id="compras" hidden>/); assert.match(html, /href="#compras" data-k="compras"/); assert.match(ler("sw.js"), /"\.\/js\/compras\.js"/);
  assert.match(js, /pdf\.js\/3\.11\.174\//); assert.match(js, /jszip\/3\.10\.1\//); assert.match(js, /tesseract\.js@5\.1\.1\//);
  assert.match(js, /upload\(path,d\.blob,\{contentType:d\.mime,upsert:false\}\)/, "o original vai como veio");
  assert.ok(!/racIA\(|rac-ia|anthropic|type:"password"/i.test(js), "sem IA paga e sem campo de senha da loja");
});
test("DANFE em PDF: número e série da nota, chave, CNPJ, emitente e o pedido nas informações complementares (dados fictícios)", () => {
  const t = "NF-e N° 000.111.222 SÉRIE: 1\nRECEBEMOS DE LOJA EXEMPLO LTDA OS PRODUTOS CONSTANTES NA NOTA FISCAL\nDANFE DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRÔNICA\n" +
    "11.222.333/0001-81\n3526 1111 2223 3300 0181 5500 1000 1112 2210 0000 0009\nNumero do pedido da compra: 701-0000001-0000002";
  const o = N.coLerTexto(t);
  assert.equal(o.numero_nf, "000111222"); assert.equal(o.serie, "1"); assert.equal(o.cnpj, "11222333000181"); assert.equal(o.emitente, "LOJA EXEMPLO LTDA");
  assert.equal(o.chave_nfe, "35261111222333000181550010001112221000000009"); assert.equal(o.numero, "701-0000001-0000002");
  const m = N.coMesclar({ numero: "701-0000001-0000002", subtotal: 100, total_pago: 95, divergencias: [] }, o);
  assert.equal(m.chave_nfe.length, 44); assert.equal(m.total_pago, 95, "os valores registrados não mudam");
});
test("e-mails de pagamento, cancelamento e reembolso; cancelamento só sai das despesas quando o dono confirma", () => {
  assert.equal(N.coLerTexto("Seu pedido 702-1111111-2222222 foi cancelado").tipo, "email_cancelamento");
  assert.equal(N.coLerTexto("Reembolso do pedido 702-1111111-2222222").tipo, "email_reembolso");
  assert.equal(N.coLerTexto("Recebemos seu pagamento do pedido 702-1111111-2222222").tipo, "email_pagamento");
  const c = (status) => ({ data: "2026-11-01", total_pago: 10, status, itens: [] });
  assert.equal(N.coDespesas([c("cancelado"), c("cancelamento_informado"), c("reembolso_informado"), c(null)]).length, 3);
  assert.match(ler("supabase/026_compras_emails.sql"), /'email_pagamento',\s+'email_cancelamento', 'email_reembolso'/);
  const js = ler("js/compras.js");
  assert.match(js, /o\.status=e\.tipo==="email_cancelamento"\?"cancelamento_informado":"reembolso_informado"/, "o e-mail só avisa");
  assert.match(js, /\["cancelado","Confirmar cancelamento \(sai das despesas\)"\]/);
  assert.match(js, /Recorrência \(separada da compra\)/); assert.match(js, /nenhuma compra nem despesa futura é criada/);
});
test("Outlook: OAuth com PKCE (sem segredo), só Mail.Read de contas pessoais, só leitura dos e-mails da Amazon, sem senha", () => {
  const js = ler("js/compras.js"), ms = ler("ms.html");
  assert.match(js, /var CC_MS_AUT="https:\/\/login\.microsoftonline\.com\/consumers\/oauth2\/v2\.0\/",CC_MS_ESCOPO="https:\/\/graph\.microsoft\.com\/Mail\.Read"/);
  assert.equal((js.match(/graph\.microsoft\.com\/[A-Za-z.]+(?=")/g) || []).filter((s) => !/Mail\.Read$|v1\.0/.test(s)).length, 0, "nenhuma outra permissão");
  assert.ok(!/offline_access|Mail\.Send|Mail\.ReadWrite|client_secret|User\.Read|Calendars|Files\./.test(js), "só leitura de e-mail, sem segredo e sem acesso offline");
  assert.match(js, /"code_challenge_method=S256"/); assert.match(js, /"grant_type=authorization_code"/); assert.match(js, /"code_verifier="\+ver/);
  assert.match(js, /if\(r\.state!==estado\)/, "confere o state");
  assert.match(js, /var CC_MS_BUSCA="\\"from:amazon\.com\.br\\""/); assert.match(js, /cancel\|reembols\|estorno/);
  assert.match(js, /"messages\/"\+encodeURIComponent\(m\.id\)\+"\/\$value"/, "o e-mail original (.eml)");
  /* nada além de GET no Graph: nenhum envio, mudança ou exclusão */
  const graph = js.slice(js.indexOf("function ccMsGet"), js.indexOf("function ccMsEmails"));
  assert.ok(!/method:/.test(graph), "só GET no Graph");
  assert.match(js, /var CC_MS_CLIENT_ID="";/, "nenhum Client ID inventado");
  assert.match(js, /pessoalGravar\("outlook"/); assert.ok(!/type:"password"/.test(js));
  assert.match(ms, /window\.opener\.postMessage\(d, location\.origin\)/); assert.ok(!/fetch\(|access_token|oauth2\/v2\.0\/token/.test(ms), "a página de retorno não troca o código");
  assert.match(js, /if\(isOwner\(\)\)p\.appendChild\(ccOutlookBloco\(saida,st\)\)/);
  assert.match(js, /typeof gmBuscar==="function"\?gm:null/, "o Gmail continua");
});
