// Lote 5.1 · etapa 1 (núcleo puro): o payload de compras_gravar (migration 030) e o mapa de erros do PostgreSQL.
// Só regras puras e leitura de arquivos: sem rede, sem banco, sem custo. Todos os pedidos e valores abaixo são FICTÍCIOS.
// O SQL da 030 é LIDO (não executado) para provar que o payload cabe na RPC: as listas de campos e as colunas que a edição substitui vêm de lá.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const SQL = ler("supabase/030_compras_multiorigem.sql").replace(/\r\n/g, "\n");
const RPC = SQL.slice(SQL.indexOf("create or replace function public.compras_gravar"));
const clone = (x) => JSON.parse(JSON.stringify(x));
const ID = "11111111-1111-4111-8111-111111111111";

// ---------- o que a RPC aceita e o que ela grava, lidos do SQL ----------
const listas = {};
for (const m of RPC.matchAll(/(\w+) constant text\[\] := array\[([\s\S]*?)\];/g)) listas[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
const upd = RPC.slice(RPC.indexOf("update public.compras_online set"), RPC.indexOf("where id = v_id;", RPC.indexOf("update public.compras_online set")));
/* cada "coluna = expressão" do UPDATE da edição; a coluna lê p_compra->>'chave' (ou p_compra->'chave') */
const atribuicoes = [...upd.replace("update public.compras_online set", ", ").matchAll(/,\s*(\w+)\s*=\s*([\s\S]*?)(?=,\s*\w+\s*=\s|$)/g)].map((m) => ({ col: m[1], expr: m[2].trim() }));
const chaveDe = (expr) => (/p_compra->>?'(\w+)'/.exec(expr) || [])[1];
/* o que a RPC deixaria em cada coluna, dado o p_compra recebido (campo ausente = NULL, e os coalesce do SQL) */
function simularUpdate(p) {
  const o = {};
  for (const { col, expr } of atribuicoes) {
    const k = chaveDe(expr); if (!k) continue;
    if (/jsonb_typeof\(p_compra->'divergencias'\)/.test(expr)) { o[col] = Array.isArray(p.divergencias) ? p.divergencias : []; continue; }
    let v = p[k] === undefined ? null : p[k];
    const d = /^coalesce\(.*,\s*(false|0)\)$/.exec(expr);
    if (v === null && d) v = d[1] === "false" ? false : 0;
    o[col] = v;
  }
  return o;
}
const itemRpc = (e) => ({ descricao: String(e.descricao).trim(), codigo: e.codigo ?? null, qtd: e.qtd ?? 1, unitario: e.unitario ?? null, total: e.total, desconto: e.desconto ?? 0, categoria: e.categoria ?? null,
  imagem_path: e.imagem_path ?? null, natureza: e.natureza ?? null, total_linha: e.total_linha ?? null, situacao: e.situacao ?? null });

// ---------- uma compra já gravada, como o site a lê (PostgREST → coDeBanco), com TODAS as colunas preenchidas ----------
const LINHA = () => ({ id: ID, user_id: "u1", loja: "amazon", numero: "701-0000001-0000001", data: "2026-10-03", vendedor: "Loja do Zé", status: "reembolso_informado", subtotal: "110.00", desconto: "10.00", frete: "15.00",
  taxas: "5.00", total_pago: "120.00", pagamento: "Mastercard final 1234", categoria: "Pet", recorrencia_texto: "Entrega a cada 2 meses", recorrencia_meses: "2.0", recorrencia_status: "confirmada",
  chave_nfe: "35260111222333000144550010000012341000012345", numero_nf: "1234", emitente: "Loja do Zé LTDA", cnpj: "11222333000144", fora_das_contas: true, motivo_fora: "já contada na nota do Mercado",
  divergencias: [{ campo: "total_pago", texto: "O PDF diz 119,90." }], observacoes: "caixa amassada", origem: "pdf", versoes: [{ numero: "antigo" }], criado_por: "u1", criado_em: "2026-10-03T10:00:00Z",
  atualizado_em: "2026-10-04T10:00:00Z", canal: "amazon", natureza: "fisica", historico: false, impostos_info: "7.50",
  compras_online_itens: [{ id: "i2", ordem: 1, descricao: "Coleira", codigo: "B0COLEIRA", qtd: "2.000", unitario: "10.00", total: "20.00", desconto: "0.00", categoria: "Pet", imagem_path: null, natureza: "fisica", total_linha: "21.00", situacao: "concluido" },
    { id: "i1", ordem: 0, descricao: "Ração Golden 10kg", codigo: null, qtd: "1.000", unitario: "100.00", total: "100.00", desconto: "10.00", categoria: "Pet", imagem_path: `u1/compras/${ID}/foto.png`, natureza: null, total_linha: null, situacao: null }] });
const ANT = () => N.coDeBanco(LINHA());
const ITENS_ANT = (a) => a.itens.map((i) => ({ descricao: i.descricao, codigo: i.codigo, qtd: i.qtd, unitario: i.unitario, total: i.total, desconto: i.desconto, categoria: i.categoria, imagem_path: i.imagem_path, natureza: i.natureza, total_linha: i.total_linha, situacao: i.situacao }));
const FORM_NOVO = () => ({ loja: "shopee", numero: "S-1", data: "2026-11-02", vendedor: null, pagamento: null, categoria: null, observacoes: null, subtotal: 100, desconto: 0, frete: 0, taxas: 0, total_pago: 100, recorrencia: null,
  itens: [{ descricao: " Ração Golden 10kg ", qtd: 2, total: 100, desconto: 0, categoria: "Pet", codigo: null, imagem_path: null, natureza: null, total_linha: null, situacao: null }] });

// ---------- 1. a whitelist é a da RPC ----------
test("as listas de campos do núcleo são exatamente as da RPC (030): compra, produto, documento e tipos", () => {
  assert.deepEqual(N.CO_GRAVAR_CAMPOS, listas.campos, "campos da compra");
  assert.deepEqual(N.CO_GRAVAR_ITEM, listas.campos_item, "campos do produto");
  assert.deepEqual(N.CO_GRAVAR_DOC, listas.campos_doc, "campos do documento");
  assert.deepEqual(N.CO_DOC_TIPOS, listas.tipos_doc, "tipos de documento");
  assert.ok(N.CO_GRAVAR_CAMPOS.length > 25 && atribuicoes.length > 25, "o SQL foi lido (e o UPDATE da edição também)");
  for (const k of ["user_id", "criado_por", "criado_em", "versoes", "atualizado_em"]) assert.ok(!N.CO_GRAVAR_CAMPOS.includes(k), k + ": o banco preenche, o site não manda");
});
test("o payload só tem chaves que a RPC aceita, em compra nova e em edição, e nenhum campo que o banco preenche", () => {
  const novo = N.coPayloadGravar(null, FORM_NOVO(), { tipo: "danfe", chave_nfe: "1".repeat(44), cnpj: "11222333000144", canal: "shopee", status: "concluido" }, { id: ID });
  const edit = N.coPayloadGravar(ANT(), { numero: "X" }, null);
  for (const p of [novo, edit]) {
    for (const k of Object.keys(p.p_compra)) assert.ok(listas.campos.includes(k), "compra: " + k);
    for (const i of p.p_itens) for (const k of Object.keys(i)) assert.ok(listas.campos_item.includes(k), "produto: " + k);
    assert.ok(!("compra_id" in p.p_itens[0]) && !("ordem" in p.p_itens[0]) && !("id" in p.p_itens[0]), "compra_id, ordem e id do produto são da RPC");
  }
});

// ---------- 2. criação ----------
test("compra nova: o que o formulário trouxe, origem pelo documento, id estável, divergências e produto no formato da RPC", () => {
  const p = N.coPayloadGravar(null, FORM_NOVO(), { tipo: "resumo_pdf", chave_nfe: "1".repeat(44), numero_nf: "99", emitente: "Loja S/A", cnpj: "11222333000144", tipo_extra: "ignorado" },
    { id: ID, divs: [{ campo: "frete", texto: "diverge" }] });
  assert.equal(p.p_novo, true); assert.equal(p.id, ID);
  assert.deepEqual(Object.keys(p.p_compra).sort(), ["categoria", "chave_nfe", "cnpj", "data", "desconto", "divergencias", "emitente", "frete", "id", "loja", "numero", "numero_nf", "observacoes", "origem", "pagamento", "recorrencia_meses",
    "recorrencia_status", "recorrencia_texto", "subtotal", "taxas", "total_pago", "vendedor"].sort());
  assert.equal(p.p_compra.origem, "pdf"); assert.deepEqual(p.p_compra.divergencias, [{ campo: "frete", texto: "diverge" }]);
  assert.deepEqual(p.p_itens, [{ descricao: "Ração Golden 10kg", qtd: 2, total: 100, desconto: 0, unitario: 50, codigo: null, categoria: "Pet", imagem_path: null }], "descrição aparada, unitário = total ÷ qtd, nulos do formulário mantidos como nulos");
  assert.throws(() => N.coPayloadGravar(null, FORM_NOVO(), null, {}), /falta o id da compra/, "compra nova sem id é erro de programação");
  const mesmo = N.coPayloadGravar(null, FORM_NOVO(), null, { id: ID });
  assert.deepEqual(N.coPayloadGravar(null, FORM_NOVO(), null, { id: ID }), mesmo, "mesmo id em toda tentativa: mesmo payload (a RPC trata o toque duplo)");
});
test("origem pelo tipo do documento (a regra que já era do site)", () => {
  for (const [t, o] of [["resumo_pdf", "pdf"], ["danfe", "pdf"], ["resumo", "pdf"], ["nfe_xml", "xml"], ["csv", "csv"], ["imagem", "imagem"], ["email_confirmacao", "email"], ["email_envio", "email"], ["desconhecido", "manual"], [undefined, "manual"]])
    assert.equal(N.coOrigemDe({ tipo: t }), o, String(t));
  assert.equal(N.coOrigemDe(null), "manual");
  assert.equal(N.coPayloadGravar(null, FORM_NOVO(), null, { id: ID }).p_compra.origem, "manual");
});
test("compra nova: canal, natureza, status, histórico e importação só entram quando o documento diz; recorrência nova fica 'a confirmar'", () => {
  const sem = N.coPayloadGravar(null, FORM_NOVO(), { tipo: "csv" }, { id: ID }).p_compra;
  for (const k of ["canal", "natureza", "status", "historico", "importacao_id", "impostos_info"]) assert.ok(!(k in sem), k + " ausente (a compra antiga/manual continua sem eles)");
  const com = N.coPayloadGravar(null, { ...FORM_NOVO(), recorrencia: { texto: "a cada 30 dias", meses: 1 } }, { tipo: "csv", canal: "amazon", natureza: "digital", status: "concluido", historico: true, importacao_id: ID }, { id: ID }).p_compra;
  assert.deepEqual([com.canal, com.natureza, com.status, com.historico, com.importacao_id], ["amazon", "digital", "concluido", true, ID]);
  assert.deepEqual([com.recorrencia_texto, com.recorrencia_meses, com.recorrencia_status], ["a cada 30 dias", 1, "a_confirmar"]);
});

// ---------- 3. edição: a linha inteira já gravada é a base ----------
test("edição SEM mudanças: a RPC deixa TODAS as colunas como estavam (simulado com o UPDATE lido da 030)", () => {
  const ant = ANT(), p = N.coPayloadGravar(ant, {}, null);
  assert.equal(p.p_novo, false); assert.equal(p.id, ID);
  const depois = simularUpdate(p.p_compra);
  assert.ok(Object.keys(depois).length > 25);
  for (const [col, v] of Object.entries(depois)) assert.deepEqual(v, ant[col] === undefined ? null : ant[col], "coluna " + col + " não pode mudar");
  assert.deepEqual(p.p_itens.map(itemRpc), ITENS_ANT(ant).map(itemRpc), "os produtos voltam iguais (descrição, qtd, unitário, total, desconto, categoria, imagem, natureza, total da linha, situação)");
  for (const col of ["status", "canal", "natureza", "impostos_info", "fora_das_contas", "motivo_fora", "recorrencia_status", "chave_nfe", "numero_nf", "emitente", "cnpj"]) assert.ok(col in depois, col + " está entre as colunas que a RPC substitui");
});
test("sem a base inteira, a RPC apagaria campos (prova de que a base é necessária)", () => {
  const ant = ANT(), so = simularUpdate({ id: ID, loja: "amazon", numero: "x", data: "2026-10-03", subtotal: 1, total_pago: 1 });
  for (const col of ["status", "canal", "natureza", "impostos_info", "recorrencia_status", "chave_nfe", "cnpj"]) assert.equal(so[col], null, col + " viraria NULL");
  assert.equal(so.fora_das_contas, false, "fora_das_contas voltaria a falso");
  assert.deepEqual(so.divergencias, [], "divergências zeradas");
  assert.notDeepEqual(so.status, ant.status);
});
test("edição alterando só campos autorizados: muda o que o formulário trouxe e mais nada", () => {
  const ant = ANT(), form = { numero: "701-9", vendedor: null, total_pago: 130, frete: 25, categoria: "Casa", observacoes: "nova", recorrencia: { texto: "a cada 3 meses", meses: 3 },
    itens: [{ descricao: "Panela", qtd: 1, total: 110, desconto: 0, categoria: "Casa" }] };
  const p = N.coPayloadGravar(ant, form, null, { divs: [{ campo: "frete", texto: "mudou" }] });
  const depois = simularUpdate(p.p_compra), mudou = Object.keys(depois).filter((c) => JSON.stringify(depois[c]) !== JSON.stringify(ant[c] === undefined ? null : ant[c])).sort();
  assert.deepEqual(mudou, ["categoria", "divergencias", "frete", "numero", "observacoes", "recorrencia_meses", "recorrencia_texto", "total_pago", "vendedor"].sort(), "só estas colunas mudam");
  assert.equal(depois.recorrencia_status, "confirmada", "a recorrência já confirmada continua confirmada");
  assert.equal(depois.vendedor, null, "campo limpo no formulário vira NULL de propósito");
  assert.deepEqual(depois.divergencias, [...ant.divergencias, { campo: "frete", texto: "mudou" }], "divergência nova entra depois das que já existiam");
  for (const col of ["status", "canal", "natureza", "impostos_info", "fora_das_contas", "motivo_fora", "chave_nfe", "numero_nf", "emitente", "cnpj", "pagamento", "data", "subtotal", "desconto", "loja"]) assert.deepEqual(depois[col], ant[col], col + " intacto");
  assert.deepEqual(p.p_itens.map((i) => [i.descricao, i.total, i.unitario]), [["Panela", 110, 110]]);
  const sem = N.coPayloadGravar(ant, { recorrencia: null }, null).p_compra;
  assert.deepEqual([sem.recorrencia_texto, sem.recorrencia_meses, sem.recorrencia_status], [null, null, null], "recorrência removida no formulário");
});
test("campos do documento (chave, NF, emitente, CNPJ) só entram quando o documento traz valor; vazio não apaga o gravado", () => {
  const ant = ANT(), p = N.coPayloadGravar(ant, {}, { chave_nfe: "", numero_nf: null, emitente: undefined, cnpj: "99888777000166" }).p_compra;
  assert.deepEqual([p.chave_nfe, p.numero_nf, p.emitente, p.cnpj], [ant.chave_nfe, ant.numero_nf, ant.emitente, "99888777000166"]);
});
test("nulos e opcionais: o que é NULL continua NULL; o que não existe na linha continua inexistente; nada vira falso ou zero por acidente", () => {
  const velha = N.coDeBanco({ id: ID, loja: "amazon", numero: "1", data: "2026-01-01", subtotal: 10, total_pago: 10, desconto: 0, frete: 0, taxas: 0, status: null, divergencias: [], origem: "manual", fora_das_contas: false, compras_online_itens: [{ ordem: 0, descricao: "X", qtd: 1, total: 10 }] });
  const p = N.coPayloadGravar(velha, {}, null).p_compra;
  assert.equal(p.status, null); assert.equal(p.fora_das_contas, false); assert.deepEqual(p.divergencias, []);
  for (const k of ["canal", "natureza", "historico", "impostos_info", "importacao_id", "chave_nfe", "recorrencia_status", "vendedor"]) assert.ok(!(k in p), k + ": a linha não tinha, o payload não inventa");
  const it = N.coPayloadGravar(velha, {}, null).p_itens[0];
  assert.equal(it.unitario, null, "unitário que estava vazio continua vazio na edição sem mudanças");
  const form = N.coPayloadGravar(velha, { itens: [{ descricao: "X", qtd: 2, total: 10 }] }, null).p_itens[0];
  assert.equal(form.unitario, 5, "item vindo do formulário: unitário recalculado, como o site sempre fez");
  for (const v of [{ itens: [] }, { vendedor: undefined }, { numero: undefined }]) assert.doesNotThrow(() => N.coPayloadGravar(velha, v, null));
  assert.equal(N.coPayloadGravar(velha, { numero: undefined }, null).p_compra.numero, "1", "undefined = não mexeu");
});
test("origem, histórico e importação nunca mudam na edição (a RPC recusaria): o payload usa sempre o gravado", () => {
  const ant = { ...ANT(), historico: true, importacao_id: ID };
  const tenta = { origem: "csv", historico: false, importacao_id: null, canal: "shopee", natureza: "digital", status: "concluido", impostos_info: 1, fora_das_contas: false, user_id: "outro" };
  const p = N.coPayloadGravar(ant, tenta, { origem: "xml", historico: false, importacao_id: "x", canal: "shopee", status: "concluido", tipo: "csv" }).p_compra;
  assert.deepEqual([p.origem, p.historico, p.importacao_id], ["pdf", true, ID]);
  assert.deepEqual([p.canal, p.natureza, p.status, p.impostos_info, p.fora_das_contas], [ant.canal, ant.natureza, ant.status, ant.impostos_info, ant.fora_das_contas], "o formulário não troca os demais campos que ele não controla");
  assert.ok(!("user_id" in p));
  /* sem importacao_id na leitura (o select do site não traz): não é enviado, e a RPC nem confere */
  const l = LINHA(); const sem = N.coPayloadGravar(N.coDeBanco(l), {}, null).p_compra;
  assert.ok(!("importacao_id" in sem));
  /* a RPC protege exatamente estes três campos na edição */
  for (const k of N.CO_GRAVAR_PROTEGIDOS) assert.ok(new RegExp(k + " não muda na edição").test(RPC), k);
  assert.ok(!atribuicoes.some((a) => N.CO_GRAVAR_PROTEGIDOS.includes(a.col)), "o UPDATE da RPC não mexe nesses campos");
});
test("a edição não altera a compra recebida nem os arrays dela", () => {
  const ant = ANT(), antes = clone(ant), form = { itens: [{ descricao: "A", qtd: 1, total: 5 }], numero: "9" }, fantes = clone(form), cand = { chave_nfe: "1".repeat(44) }, divs = [{ campo: "a", texto: "b" }];
  const p = N.coPayloadGravar(ant, form, cand, { divs });
  assert.deepEqual(ant, antes); assert.deepEqual(form, fantes);
  p.p_compra.divergencias.push("x"); assert.deepEqual(ant.divergencias, antes.divergencias, "o array de divergências do gravado não é compartilhado");
});

// ---------- 4. documentos ----------
test("coDocPayload: limpa o extraído (e-mail, CPF, telefone, CEP), respeita os tipos da RPC e nunca grava conteúdo bruto fora do extraído", () => {
  const d = { nome: "pedido.pdf", mime: "application/pdf", blob: { size: 1234 }, sha: "a".repeat(64), tipo: "resumo", ext: { numero: "701-1", contato: "joao@exemplo.com" },
    texto: "Pedido 701-1\nContato: joao@exemplo.com\nCPF 123.456.789-09\nTelefone (11) 98765-4321\nCEP 01310-100\nProduto Ração" };
  const p = N.coDocPayload(d, `u1/compras/${ID}/1-pedido.pdf`);
  assert.deepEqual(Object.keys(p), listas.campos_doc, "as chaves, na ordem da RPC");
  assert.deepEqual([p.tipo, p.nome, p.mime, p.tamanho, p.sha256, p.path], ["resumo_pdf", "pedido.pdf", "application/pdf", 1234, "a".repeat(64), `u1/compras/${ID}/1-pedido.pdf`]);
  const bruto = JSON.stringify(p.extraido);
  for (const proibido of ["joao@exemplo.com", "123.456.789-09", "98765-4321", "01310-100"]) assert.ok(!bruto.includes(proibido), proibido + " não pode ir para o banco");
  assert.equal(p.extraido.texto, "Pedido 701-1\nProduto Ração", "as linhas com dado pessoal saem inteiras do texto bruto; o resto fica");
  assert.deepEqual(p.extraido.contato, "[removido]");
  assert.deepEqual(clone(p.extraido), clone(N.coLimparExtraido({ numero: "701-1", contato: "joao@exemplo.com", texto: d.texto.slice(0, 20000) })), "é a mesma limpeza de coLimparExtraido");
  assert.equal(d.ext.contato, "joao@exemplo.com", "o original não é alterado");
});
test("coDocPayload: tipos, nome longo, pedidos extras, texto limitado e documento sem tamanho", () => {
  const base = { nome: "n", sha: "b".repeat(64), mime: "text/plain" };
  for (const t of N.CO_DOC_TIPOS) assert.equal(N.coDocPayload({ ...base, tipo: t }, "p").tipo, t, t);
  const o = N.coDocPayload({ ...base, tipo: "planilha", ext: {} }, "p");
  assert.deepEqual([o.tipo, o.extraido.tipo], ["outro", "planilha"], "tipo desconhecido vira 'outro' e o original fica no extraído");
  assert.equal(N.coDocPayload({ ...base, tipo: "csv", ext: {} }, "p").extraido.tipo, undefined, "tipo conhecido: nada é acrescentado ao extraído");
  assert.equal(N.coDocPayload({ ...base, tipo: "planilha", ext: { tipo: "meu" } }, "p").extraido.tipo, "meu", "não sobrescreve um tipo já informado");
  assert.equal(N.coDocPayload({ ...base, nome: "x".repeat(300), tipo: "csv" }, "p").nome.length, 200);
  assert.deepEqual(N.coDocPayload({ ...base, tipo: "csv", extras: [{ numero: "A" }, { numero: "B" }], ext: { x: 1 } }, "p").extraido, { pedidos: ["A", "B"] });
  assert.equal(N.coDocPayload({ ...base, tipo: "csv", texto: "a".repeat(30000) }, "p").extraido.texto.length, 20000);
  assert.deepEqual([N.coDocPayload({ ...base, tipo: "csv" }, "p").tamanho, N.coDocPayload({ ...base, tipo: "csv", tamanho: 7 }, "p").tamanho, N.coDocPayload({ ...base, tipo: "csv", mime: undefined }, "p").mime], [null, 7, null]);
  assert.deepEqual(N.coDocPayload({ ...base, tipo: "csv" }, "p").extraido, {}, "sem nada extraído, objeto vazio (a RPC aceita)");
});

// ---------- 5. erros do PostgreSQL ----------
const E = (code, message, extra = {}) => N.coErroGravar({ code, message, ...extra });
test("23505: duplicidade de pedido, nota fiscal, documento e id, cada uma com a sua mensagem", () => {
  const dup = (c) => `duplicate key value violates unique constraint "${c}"`;
  const a = E("23505", dup("compras_online_pedido_unico"), { details: "Key (user_id, loja, ltrim(...))=(...) already exists." });
  assert.equal(a.tipo, "duplicado_pedido"); assert.match(a.mensagem, /pedido já está registrado.*Adicionar documento/);
  assert.equal(E("23505", dup("compras_online_nfe_unica")).tipo, "duplicado_nfe"); assert.match(E("23505", dup("compras_online_nfe_unica")).mensagem, /nota fiscal/);
  assert.equal(E("23505", dup("compras_online_docs_arquivo_unico")).tipo, "duplicado_documento"); assert.match(E("23505", dup("compras_online_docs_arquivo_unico")).mensagem, /mesmo arquivo/);
  assert.equal(E("23505", dup("compras_online_pkey")).tipo, "duplicado_id");
  assert.equal(E("23505", dup("outro_indice")).tipo, "duplicado");
  assert.equal(E("23505", "x", { details: 'constraint "compras_online_pedido_unico"' }).tipo, "duplicado_pedido", "o nome do índice também é lido do detalhe");
  assert.equal(a.repetir, false); assert.equal(a.codigo, "23505");
});
test("22023: dados inválidos (texto da RPC sem o prefixo), arquivo fora do cofre/pasta e campo protegido", () => {
  const d = E("22023", "compras_gravar: valor inválido em total_pago");
  assert.equal(d.tipo, "dados_invalidos"); assert.match(d.mensagem, /^Dados inválidos: valor inválido em total_pago\. Nada foi gravado\.$/);
  assert.equal(E("22023", "compras_gravar: o arquivo do documento 2 não está no cofre").tipo, "arquivo_ausente");
  assert.equal(E("22023", "compras_gravar: o arquivo do documento 2 não está no cofre").repetir, true, "vale reenviar o arquivo");
  assert.equal(E("22023", "compras_gravar: o documento 1 está fora da pasta desta compra").tipo, "arquivo_fora_da_pasta");
  assert.equal(E("22023", "compras_gravar: imagem fora da pasta desta compra (produto 1)").tipo, "arquivo_fora_da_pasta");
  for (const k of ["origem", "historico", "importacao_id"]) assert.equal(E("22023", `compras_gravar: ${k} não muda na edição`).tipo, "campo_protegido", k);
  assert.equal(E("22023", "compras_gravar: campo não permitido na compra: user_id").tipo, "campo_invalido");
  assert.match(E("22023", "compras_gravar: campo não permitido na compra: user_id").mensagem, /user_id/);
  assert.equal(E("22023", "compras_gravar: a compra precisa de pelo menos um produto").tipo, "dados_invalidos");
});
test("42501: sem login, sem a 2ª etapa e sem permissão; P0002: compra ou arquivo não encontrados", () => {
  assert.equal(E("42501", "compras_gravar: faça login").tipo, "sessao");
  for (const m of ["new row violates row-level security policy for table \"compras_online\"", "permission denied for function compras_gravar"]) { const r = E("42501", m); assert.equal(r.tipo, "permissao"); assert.match(r.mensagem, /2ª etapa/); }
  const n = E("P0002", "compras_gravar: compra não encontrada"); assert.equal(n.tipo, "nao_encontrado"); assert.match(n.mensagem, /não foi encontrada/);
  const a = E("P0002", "objeto não encontrado no cofre"); assert.equal(a.tipo, "arquivo_nao_encontrado"); assert.equal(a.repetir, true);
  assert.equal(E("P0002", "algo").tipo, "nao_encontrado");
});
test("outros erros: conta que não fecha, reembolso, vínculo, rede e desconhecido; o detalhe técnico nunca se perde", () => {
  assert.equal(E("23514", 'new row for relation "compras_online" violates check constraint "compras_online_conta_fecha"').tipo, "conta");
  assert.equal(E("23514", "compra: o total pago (10) não pode ficar abaixo do que já foi reembolsado (50)").tipo, "reembolso");
  assert.equal(E("23514", 'violates check constraint "compras_online_historico_ok"').tipo, "regra_do_banco");
  assert.equal(E("23503", "update or delete on table violates foreign key constraint").tipo, "vinculo");
  const rede = N.coErroGravar({ message: "TypeError: Failed to fetch" }); assert.equal(rede.tipo, "rede"); assert.equal(rede.repetir, true);
  assert.equal(N.coErroGravar(new Error("NetworkError when attempting to fetch resource.")).tipo, "rede");
  const x = E("XX000", "erro interno qualquer", { details: "detalhe", hint: "dica" });
  assert.equal(x.tipo, "desconhecido"); assert.match(x.mensagem, /código XX000/);
  assert.equal(x.tecnico, "XX000 | erro interno qualquer | detalhe | dica", "código, mensagem, detalhe e dica ficam para o diário de erros");
  assert.equal(x.original, "erro interno qualquer");
  for (const v of [undefined, null, {}, "texto solto", 42]) { const r = N.coErroGravar(v); assert.equal(typeof r.mensagem, "string"); assert.ok(r.mensagem.length > 10); assert.equal(r.tipo, "desconhecido"); }
  assert.equal(N.coErroGravar("texto solto").original, "texto solto");
  for (const t of ["duplicado_pedido", "dados_invalidos", "permissao", "nao_encontrado"]) assert.ok(!/undefined|null|\[object/.test(E({ duplicado_pedido: "23505", dados_invalidos: "22023", permissao: "42501", nao_encontrado: "P0002" }[t], "m").mensagem), t);
});
test("toda mensagem de erro fala o que aconteceu com os dados (nada gravado / continuam na tela) e é uma frase para leigos", () => {
  const casos = [["23505", "compras_online_pedido_unico"], ["23505", "compras_online_nfe_unica"], ["22023", "compras_gravar: data inválida"], ["42501", "x"], ["P0002", "x"], ["23514", "compras_online_conta_fecha"], ["99999", "x"]];
  for (const [c, m] of casos) { const r = E(c, m); assert.ok(r.mensagem.length < 220 && /[.!]$/.test(r.mensagem), c + ": " + r.mensagem); assert.ok(!/sql|postgres|constraint|violates|rls/i.test(r.mensagem), c + " não vaza jargão técnico"); }
});

// ---------- 6. arquivo de zero bytes e modo "só documentos" (etapa 2) ----------
test("coDocPayload: arquivo de zero bytes grava tamanho 0 (não vira nulo); sem tamanho e sem arquivo, nulo", () => {
  const base = { nome: "vazio.txt", mime: "text/plain", sha: "c".repeat(64), tipo: "outro" };
  assert.equal(N.coDocPayload({ ...base, blob: { size: 0 } }, "p").tamanho, 0, "blob de 0 bytes");
  assert.equal(N.coDocPayload({ ...base, tamanho: 0 }, "p").tamanho, 0, "tamanho informado 0");
  assert.equal(N.coDocPayload({ ...base, tamanho: 0, blob: { size: 9 } }, "p").tamanho, 0, "o tamanho informado vale mais que o do blob");
  assert.equal(N.coDocPayload({ ...base, blob: { size: 1234 } }, "p").tamanho, 1234);
  assert.equal(N.coDocPayload({ ...base, tamanho: 55, blob: { size: 9 } }, "p").tamanho, 55);
  assert.equal(N.coDocPayload({ ...base }, "p").tamanho, null, "sem tamanho nem arquivo");
  assert.equal(N.coDocPayload({ ...base, tamanho: null, blob: null }, "p").tamanho, null);
  assert.equal(listas.campos_doc.includes("tamanho"), true);
  assert.match(RPC, /\(d\.e->>'tamanho'\)::bigint/, "a RPC grava como bigint: 0 é válido");
});
test("coPayloadSoDocs: o modo 'só documentos' da RPC (p_itens nulo, p_compra só com o id, p_novo falso)", () => {
  const p = N.coPayloadSoDocs(ID, [{ tipo: "csv" }]);
  assert.deepEqual(p, { id: ID, p_novo: false, p_compra: { id: ID }, p_itens: null, p_docs: [{ tipo: "csv" }] });
  assert.deepEqual(N.coPayloadSoDocs(ID).p_docs, []);
  assert.throws(() => N.coPayloadSoDocs(null, []), /falta o id/);
  assert.match(RPC, /v_solo := not p_novo and p_itens is null;/); assert.match(RPC, /para só anexar documentos mande apenas o id da compra/);
});

// ---------- 7. núcleo puro ----------
test("o núcleo da gravação continua puro (ES5, sem tela, banco ou rede, sem regra financeira repetida)", () => {
  const nu = ler("nucleo.js"), a = nu.indexOf("function coOrigemDe"), b = nu.indexOf("/* recorrências: a informada");
  assert.ok(a > 0 && b > a);
  assert.doesNotMatch(nu.slice(a, b), /document\.|window\.|fetch\(|SB\.|supabase|localStorage|racIA|=>|\blet\b|\bconst\b/, "ES5 puro, sem tela, banco ou rede");
  assert.doesNotMatch(nu.slice(a, b), /coRegra|coResumo|coDescontos|coPrecos|total_pago\s*[-+*\/]/, "nenhuma regra financeira repetida");
});

// ---------- 8. imagem_path já gravado nunca se perde na edição (etapa 2) ----------
test("edição: o imagem_path do produto já gravado é preservado mesmo que o formulário não o traga; cada caminho vale para um só produto", () => {
  const ant = ANT(), foto = ant.itens.find((i) => i.imagem_path).imagem_path;
  const f = (itens) => N.coPayloadGravar(ant, { itens }, null).p_itens;
  const it = (descricao, o = {}) => ({ descricao, qtd: 1, total: 100, desconto: 0, ...o });
  assert.equal(f([it("Ração Golden 10kg", { imagem_path: null })])[0].imagem_path, foto, "formulário sem o caminho (null)");
  assert.equal(f([it("Ração Golden 10kg")])[0].imagem_path, foto, "formulário sem a chave");
  assert.equal(f([it("  Ração Golden 10kg  ")])[0].imagem_path, foto, "descrição com espaços");
  assert.equal(f([it("Coleira"), it("Ração Golden 10kg")])[1].imagem_path, foto, "outra ordem na tela");
  assert.ok(!f([it("Coleira")])[0].imagem_path, "um produto sem imagem não ganha a de outro");
  assert.ok(!f([it("Ração Golden 10kg renomeada")])[0].imagem_path, "produto renomeado deixa de herdar (a foto continua como documento)");
  const dois = f([it("Ração Golden 10kg"), it("Ração Golden 10kg")]);
  assert.deepEqual(dois.map((i) => i.imagem_path || null), [foto, null], "o mesmo caminho não vai para dois produtos");
  assert.equal(f([it("Ração Golden 10kg", { imagem_path: "U1/compras/x/outra.png" })])[0].imagem_path, "U1/compras/x/outra.png", "o que o formulário traz vale");
  assert.deepEqual(N.coPayloadGravar(ant, {}, null).p_itens.map((i) => i.imagem_path ?? null), ant.itens.map((i) => i.imagem_path ?? null), "sem formulário de itens, todos os caminhos voltam iguais");
  assert.ok(!N.coPayloadGravar(null, FORM_NOVO(), null, { id: ID }).p_itens.some((i) => i.imagem_path), "compra nova: nenhum item ganha imagem_path");
});
