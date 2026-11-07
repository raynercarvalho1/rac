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
  assert.match(pn, /SB\.from\("compras_online"\)\.select\("id,data,loja,vendedor,total_pago,categoria,fora_das_contas,status,canal,natureza,historico,origem,impostos_info,compras_online_itens/);
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
  assert.match(app, /var DA_CASA=\["mercado","alimentacao","compras","fiscal",/); assert.match(app, /renderCompras\(parts\[1\],parts\[2\],parts\[3\]\)/, "Lote 5.2: a rota passa o 3º trecho (origem do produto)");
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
  assert.match(ler("nucleo.js"), /o\.status=e\.tipo==="email_cancelamento"\?"cancelamento_informado":"reembolso_informado"/, "o e-mail só avisa (Lote 5.1: a regra está em coComplementoAnexo, no núcleo)");
  assert.match(js, /\["cancelado","Confirmar cancelamento \(sai das despesas\)"\]/);
  assert.match(js, /Recorrência \(separada da compra\)/); assert.match(js, /nenhuma compra nem despesa futura é criada/);
});
test("Gmail: reaproveita o login do site (Client ID e gmail.readonly de js/app.js), token só na memória, conta da Amazon conferida", () => {
  const js = ler("js/compras.js"), app = ler("js/app.js");
  assert.match(app, /var GSI_JS="https:\/\/accounts\.google\.com\/gsi\/client",GM_SCOPE="https:\/\/www\.googleapis\.com\/auth\/gmail\.readonly";/, "a permissão do site é só leitura");
  assert.match(js, /initTokenClient\(\{client_id:GOOGLE_CLIENT_ID,scope:GM_SCOPE,login_hint:email,include_granted_scopes:false,/, "o mesmo Client ID e só gmail.readonly");
  assert.ok(!/googleapis\.com\/auth\/(?!gmail\.readonly)/.test(js) && !/gmail\.(send|modify|compose|insert|labels)|mail\.google\.com\/?"/.test(js), "nenhuma permissão de escrita");
  assert.ok(!/client_secret|refresh_token|access_type|offline/.test(js), "sem segredo e sem token de renovação");
  /* token só na memória: nada de localStorage/sessionStorage no módulo (fora o comentário que explica) */
  const codigo = js.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(codigo), "o módulo não guarda nada no navegador");
  assert.ok(!/gmConectar\(|gmBuscar\(|gmToken\(/.test(codigo), "não usa as funções que gravam o token no navegador");
  assert.ok(!/@gmail\.com/i.test(js), "nenhum endereço de e-mail no código público");
  assert.match(js, /function ccGmPreferida\(\)\{return String\(\(PESSOAL\.compras\|\|\{\}\)\.gmail\|\|""\)\.toLowerCase\(\)\}/, "a conta vem da conta (PESSOAL), não do código");
  assert.match(js, /pessoalGravar\("compras",Object\.assign\(\{\},PESSOAL\.compras\|\|\{\},\{gmail:conta\}\)\)/, "guarda só o endereço da conta usada");
  assert.match(js, /if\(conta!==email\)throw new Error\("o Google conectou "/, "confere a conta conectada");
  assert.match(js, /function ccGmSair\(\)\{CC_GM\.tk=null;CC_GM\.exp=0;CC_GM\.conta=null\}/, "desconectar apaga o token da memória");
  assert.ok(!/logErro\("compras",[^)]*raw|console\.log/.test(codigo), "nenhum conteúdo de e-mail nos logs");
  /* o resto do site continua igual: cartão de E-mail e alertas de vagas */
  assert.match(app, /function gmConectar\(slot,email\)\{/); assert.match(app, /function gmBuscar\(q,max\)\{/);
});
test("Gmail: período (30/90/180/365, padrão 90), paginação até 200, só GET, erros tratados, sem importação automática", () => {
  const js = ler("js/compras.js"), codigo = js.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(js, /CC_GM_PERIODOS=\[30,90,180,365\],CC_GM_MAX=200/); assert.match(js, /var CC_GM=\{tk:null,exp:0,conta:null,dias:90,email:null\};/);
  assert.match(js, /var q="from:amazon\.com\.br after:"\+ccGmDataBusca\(dias\)/);
  assert.match(js, /return r\.nextPageToken&&ids\.length<CC_GM_MAX\?pag\(r\.nextPageToken\)/, "segue as páginas até o limite");
  assert.match(js, /"messages\/"\+encodeURIComponent\(id\)\+"\?format=raw"/, "o original do e-mail");
  const api = codigo.slice(codigo.indexOf("function ccGmConectar"), codigo.indexOf("function ccGmailBloco"));
  assert.ok(!/method:|fetch\(/.test(api), "só gmApi (GET): nada é enviado, alterado ou apagado");
  assert.match(js, /if\(m==="expirou"\)\{ccGmSair\(\);/); assert.match(js, /respondeu \(429\|500\|502\|503\)/); assert.match(js, /respondeu 403/);
  assert.ok(!/auto\.checked|salvarTodos\(\)\}|importar sozinho/.test(codigo), "nenhuma importação automática");
  assert.match(js, /ccMostrarLote\(saida,r,st\)/, "tudo passa pela conferência em lote");
  assert.match(js, /if\(isOwner\(\)&&typeof gmApi==="function"\)p\.appendChild\(ccGmailBloco\(saida,st\)\)/);
});
test("Gmail: anexos PDF e XML (DANFE, NF-e) no original, ligados ao pedido do e-mail; e-mail da nota fiscal; inválidos à parte", () => {
  const js = ler("js/compras.js");
  assert.match(js, /if\(nomeA&&\/base64\/i\.test\(enc\)&&\(\/pdf\|xml\/\.test\(ct\)\|\|\/\\.\(pdf\|xml\)\$\/i\.test\(nomeA\)\)\)/);
  assert.match(js, /if\(an\.bytes\.length>CC_GM_ANEXO_MAX\)\{docs\.push\(\{nome:an\.nome,erro:"anexo grande demais"\}\)/);
  assert.match(js, /d\.erro="XML que não é uma NF-e"/); assert.match(js, /if\(d\.ext&&!d\.ext\.numero&&!d\.ext\.chave_nfe&&e\.numero\)\{d\.ext\.numero=e\.numero/);
  assert.match(js, /var bytes=t\.bytes\|\|new TextEncoder\(\)\.encode\(raw\)/, "os bytes exatos do Gmail vão para o cofre");
  assert.match(ler("nucleo.js"), /if\(CO_DOC_TIPOS\.indexOf\(tipo\)<0\)\{ext\.tipo=ext\.tipo\|\|tipo;tipo="outro"\}/, "sem SQL novo (Lote 5.1: a regra de tipo está em coDocPayload)");
  assert.match(js, /NUCLEO\.coDocPayload\(u\.d,u\.path\)/, "o site monta o documento pelo núcleo");
  assert.equal(N.coLerTexto("A nota fiscal do seu pedido 701-0000001-0000002 está disponível").tipo, "email_nota_fiscal");
  assert.equal(N.coLerTexto("Obrigado pelo seu pedido 701-0000001-0000002. A nota fiscal será enviada").tipo, "email_confirmacao");
  assert.equal(N.CO_DOC_NOME.email_nota_fiscal, "e-mail da nota fiscal");
});
test("Outlook removido: sem ms.html, sem Microsoft Graph, sem código ou documentação do Outlook", () => {
  assert.ok(!fs.existsSync(new URL("../ms.html", import.meta.url)), "ms.html saiu");
  for (const a of ["js/compras.js", "docs/compras.md", "README.md", "sw.js", "index.html"]) assert.ok(!/outlook|graph\.microsoft|login\.microsoftonline|ms\.html|CC_MS|ccMs/i.test(ler(a)), a);
});
test("Lote 1 · P1: o texto extraído é gravado sem CPF, telefone, e-mail, CEP, endereço, destinatário e saudação; pedido e valores ficam", () => {
  const bruto = ["Olá, Fulano de Tal", "Pedido 701-0000001-0000002", "Enviar para:", "Fulano de Tal", "Rua das Flores, 123", "Sorocaba - SP 18000-000", "Telefone: (15) 99999-1234",
    "Contato fulano@exemplo.com", "CPF: 123.456.789-09", "1 unidade de: Cabo USB R$ 25,00", "Total do pedido: R$ 95,00"].join("\n");
  const t = N.coLimparTexto(bruto);
  for (const p of [/Fulano/, /Rua das Flores/, /18000/, /99999/, /@/, /123\.456/, /Olá/]) assert.ok(!p.test(t), String(p));
  assert.match(t, /701-0000001-0000002/); assert.match(t, /Cabo USB R\$ 25,00/); assert.match(t, /Total do pedido: R\$ 95,00/);
  const e = N.coLimparExtraido({ numero: "701-0000001-0000002", total_pago: 95, texto: bruto, avisos: ["fale com a@b.com"], itens: [{ descricao: "Cabo", total: 25 }] });
  assert.equal(e.numero, "701-0000001-0000002"); assert.equal(e.total_pago, 95); assert.equal(e.itens[0].total, 25); assert.ok(!/@/.test(JSON.stringify(e)) && !/Fulano/.test(e.texto));
  /* Lote 5.1: a limpeza roda em coDocPayload, antes do que vai para a RPC; o site não grava mais linha de documento por conta própria */
  const nu = ler("nucleo.js"), dp = nu.slice(nu.indexOf("function coDocPayload"), nu.indexOf("function coErroGravar"));
  assert.match(dp, /ext=coLimparExtraido\(ext\);var tipo=/, "limpa antes de montar o documento");
  assert.match(ler("js/compras.js"), /p_docs:up\.map\(function\(u\)\{return NUCLEO\.coDocPayload\(u\.d,u\.path\)\}\)/, "só o documento limpo vai para a RPC");
  assert.doesNotMatch(ler("js/compras.js"), /SB\.from\("compras_online_docs"\)\.insert|SB\.from\("compras_online"\)\.insert|SB\.from\("compras_online_itens"\)\.insert/, "nenhuma gravação fora da RPC");
});
test("Lote 1 · D1: compra cancelada fica fora do Painel e do Hoje (e não pede recorrência)", () => {
  assert.match(ler("js/painel.js"), /fora_das_contas,status,canal,natureza,historico,origem,impostos_info,compras_online_itens\(descricao,total,desconto,categoria,natureza,total_linha,situacao\)"\)/); assert.match(ler("js/painel.js"), /return l\.map\(NUCLEO\.coDeBanco\)\}\)\)\]\)/);
  assert.match(ler("js/hoje.js"), /select\("data,loja,total_pago,fora_das_contas,status,recorrencia_status/);
  const f = { compras: { ok: true, v: [{ data: "2026-11-02", total_pago: 100 }, { data: "2026-11-03", total_pago: 40, status: "cancelado" }, { data: "2026-11-03", total_pago: 7, status: "cancelamento_informado" }] } };
  assert.equal(N.hojeFinancas(f, "2026-11-05").atual.compras, 107, "só o cancelado confirmado sai");
  const r = N.hojeItens({ compras: { ok: true, v: [{ data: "2026-11-02", total_pago: 1, status: "cancelado", recorrencia_status: "a_confirmar" }] } }, "2026-11-05");
  assert.ok(!(r || []).some((x) => /recorr/i.test(x.titulo || "")));
});
test("Lote 1 · D2/D4: duplicidade lê Mercado, Alimentação e Abastecimento; leituras de compras ordenam por data e id", () => {
  const js = ler("js/compras.js");
  assert.match(js, /NUCLEO\.coDuplicata\(g\.cand,CC\.dados,CC\.outras\|\|\[\]\)/);
  for (const o of ["Mercado", "Alimentação", "Abastecimento"]) assert.match(js, new RegExp('origem:"' + o + '"'));
  assert.match(js, /SB\.from\("registros"\)\.select\("id,data,titulo,dados"\)\.eq\("tipo","abastecimento"\)/);
  assert.match(js, /\.order\("criado_em",\{ascending:false\}\)\.order\("id",\{ascending:false\}\)/);
  assert.match(ler("js/painel.js"), /\.order\("data"\)\.order\("id"\)\.range\(f,f\+999\)\}\)\n\s+\.then\(function\(l\)\{return l\.map\(NUCLEO\.coDeBanco\)\}\)\)\]\)/);
  assert.match(ler("js/hoje.js"), /order\("data"\)\.order\("id"\)\.range\(f,f\+999\)\}\)\.then\(function\(l\)\{l=l\.map\(NUCLEO\.coDeBanco\);return \{v:l,vazio:!l\.length,ultimo:hojeUltimo\(l,"data"\),origem:"banco"\}\}\)\},\r?\n\s+orcamentos/);
  assert.equal(N.coDuplicata({ loja: "outra", numero: "9", data: "2026-10-05", total_pago: 30 }, [], [{ origem: "Abastecimento", data: "2026-10-05", total: 30, nome: "Posto" }]).nivel, "possivel");
  assert.equal(N.coDuplicata({ loja: "outra", numero: "9", data: "2026-10-05", total_pago: 30 }, [], [{ origem: "Mercado", data: "2026-10-06", total: 30 }]), null);
});
