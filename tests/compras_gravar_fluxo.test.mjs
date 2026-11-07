// Lote 5.1 · etapas 2 e 3: o fluxo REAL de js/compras.js (ccGravar, ccAnexar e a limpeza do cofre) rodando num banco e num cofre SIMULADOS.
// O js/compras.js é carregado num contexto isolado (vm) com os globais mínimos; SB é o banco/cofre de tests/_compras_falso.mjs, que porta para JavaScript, regra por regra,
// compras_gravar (030), compras_gravar_com_foto e compras_anexar (035), com as mesmas mensagens e códigos do SQL, e tudo ou nada em cada chamada.
// Aqui se prova o que o SITE faz com cada resposta; que o simulador é fiel ao SQL é provado em tests/compras_035.test.mjs (mesmos cenários no PGlite, comparando resposta e tabelas).
// Sem rede, sem Supabase, sem custo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createHash, webcrypto } from "node:crypto";
import vm from "node:vm";
import { banco, BANCOS } from "./_compras_falso.mjs";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const CODIGO = readFileSync(new URL("../js/compras.js", import.meta.url), "utf8");
const ID = "11111111-1111-4111-8111-111111111111", OUTRO = "22222222-2222-4222-8222-222222222222", PASTA = `U1/compras/${ID}/`;
const clone = (x) => JSON.parse(JSON.stringify(x));
const hex = (s) => createHash("sha256").update(s).digest("hex");
const blob = (txt, tipo = "application/pdf") => { const b = Buffer.from(txt); return { size: b.length, type: tipo, arrayBuffer: () => Promise.resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)) }; };
const FOTO = () => blob("imagem-do-produto", "image/png"), SHA_FOTO = hex("imagem-do-produto");

// (o banco e o cofre simulados ficam em tests/_compras_falso.mjs, que porta as regras do SQL da 030 e da 035; tests/compras_035.test.mjs os compara com o Postgres de verdade)
function site(bk) {
  let t = 1_700_000_000_000;
  class Data extends Date { static now() { return ++t; } }
  const ctx = vm.createContext({ NUCLEO: N, console, Promise, Date: Data, JSON, Math, Uint8Array, crypto: webcrypto, setTimeout, SB: bk.sb, DONO: "U1", fetch: () => Promise.resolve({ ok: false }),
    atuModulo() {}, atuTarefa() { return () => {}; }, atuDurante(n, f) { return f(); }, novoId: () => OUTRO, sbOk(r) { if (r.error) throw new Error(r.error.message); return r.data; }, logErro(o, e) { ctx.__erros.push([o, e]); }, __erros: [] });
  vm.runInContext(CODIGO, ctx);
  return ctx;
}

// ---------- os dados de um salvamento ----------
const FORM = (o = {}) => ({ id: null, loja: "shopee", numero: "S-1", data: "2026-11-02", vendedor: null, pagamento: null, categoria: null, observacoes: null, subtotal: 100, desconto: 0, frete: 0, taxas: 0, total_pago: 100, recorrencia: null,
  itens: [{ descricao: "Ração Golden", qtd: 1, total: 100, desconto: 0, categoria: "Pet", codigo: null, imagem_path: null, natureza: null, total_linha: null, situacao: null }], ...o });
const DOC = (n, o = {}) => ({ nome: `pedido${n}.pdf`, mime: "application/pdf", blob: blob("conteudo" + n), sha: hex("conteudo" + n), tipo: "resumo_pdf", ext: { numero: "S-1" },
  texto: "Pedido S-1\nContato: fulano@exemplo.com\nCPF 123.456.789-09\nProduto Ração", ...o });
async function salvar(ctx, { x = FORM(), ant = null, cand = null, docs = [], imagens = [], divs = [], id = ID } = {}) { const msgs = []; const r = await ctx.ccGravar(x, ant, cand, docs, imagens, [], divs, (m) => msgs.push(m), id); return { id: r, msgs }; }
const falha = async (p) => { try { await p; } catch (e) { return e; } assert.fail("era para falhar"); };
const caminhos = (S) => [...S.storage.keys()].sort();
const registrados = (S) => S.docs.map((d) => d.path).sort();

// ---------- 1. sucesso ----------
test("compra nova com 2 documentos e a imagem do produto: UMA chamada da RPC, nada fora dela, tudo registrado", async () => {
  const bk = banco(), ctx = site(bk), { S } = bk;
  const { id, msgs } = await salvar(ctx, { docs: [DOC(1), DOC(2)], imagens: [{ blob: FOTO() }], cand: { tipo: "resumo_pdf", chave_nfe: "1".repeat(44) } });
  assert.equal(id, ID);
  assert.equal(S.rpc.length, 1, "uma única chamada de RPC"); assert.equal(S.rpc[0].nome, "compras_gravar_com_foto");
  assert.deepEqual(S.proibidos, [], "nenhum insert, update ou delete direto em compras, produtos ou documentos");
  const a = S.rpc[0].args;
  assert.equal(a.p_novo, true); assert.equal(a.p_compra.id, ID); assert.equal(a.p_compra.origem, "pdf"); assert.equal(a.p_compra.chave_nfe, "1".repeat(44));
  assert.equal(a.p_docs.length, 3, "2 documentos + a foto do produto");
  assert.deepEqual(a.p_docs.map((d) => d.tipo), ["resumo_pdf", "resumo_pdf", "foto_produto"]);
  assert.equal(caminhos(S).length, 3); assert.deepEqual(registrados(S), caminhos(S), "tudo o que subiu está registrado");
  assert.deepEqual(S.remocoes, [], "nada foi apagado");
  assert.ok(caminhos(S).every((p) => p.startsWith(PASTA)), "pasta <dono>/compras/<compra>/");
  const foto = a.p_docs[2].path; assert.ok(S.docs.some((d) => d.path === foto && d.tipo === "foto_produto"), "a foto está guardada como documento da compra");
  assert.equal(a.p_foto, foto, "o site diz qual é a foto"); assert.ok(!a.p_itens[0].imagem_path, "mas não manda imagem_path: quem liga é o banco"); assert.equal(S.itens[0].imagem_path, foto, "o banco ligou o 1º produto à foto registrada");
  assert.ok(msgs.includes("Gravando a compra…"));
  assert.equal(S.compras.get(ID).numero, "S-1");
});
test("os dados pessoais saem do extraído antes de qualquer envio ao banco", async () => {
  const bk = banco(), ctx = site(bk);
  await salvar(ctx, { docs: [DOC(1)] });
  const bruto = JSON.stringify(bk.S.rpc[0].args.p_docs);
  for (const p of ["fulano@exemplo.com", "123.456.789-09"]) assert.ok(!bruto.includes(p), p);
  assert.equal(bk.S.rpc[0].args.p_docs[0].extraido.texto, "Pedido S-1\nProduto Ração");
});
test("sem documentos nem imagem: só a RPC, nenhum envio ao cofre, nada a limpar", async () => {
  const bk = banco(), ctx = site(bk); await salvar(ctx);
  assert.equal(bk.S.rpc.length, 1); assert.equal(bk.S.storage.size, 0); assert.deepEqual(bk.S.remocoes, []); assert.equal(bk.S.compras.size, 1);
  assert.deepEqual(bk.S.rpc[0].args.p_docs, []);
});

// ---------- 2. falha, duplicidade e rollback ----------
test("falha no 2º envio: a RPC nem é chamada, o 1º arquivo é apagado e nada fica gravado", async () => {
  const bk = banco({ falharUpload: (p) => /pedido2/.test(p) }), ctx = site(bk), { S } = bk;
  const e = await falha(salvar(ctx, { docs: [DOC(1), DOC(2)] }));
  assert.match(e.message, /pedido2\.pdf: falhou o envio/);
  assert.equal(S.rpc.length, 0); assert.equal(S.compras.size, 0); assert.equal(S.storage.size, 0, "o arquivo que subiu foi limpo"); assert.equal(S.remocoes.length, 1);
});
test("pedido repetido (23505): erro em português, rollback total e os arquivos enviados são apagados", async () => {
  const bk = banco(), ctx = site(bk), { S } = bk;
  await salvar(ctx, { id: OUTRO.replace("2222", "3333"), docs: [DOC(9)] });                // o pedido S-1 já existe, de outra compra
  const antes = { st: caminhos(S), docs: registrados(S) };
  const e = await falha(salvar(ctx, { docs: [DOC(1), DOC(2)] }));
  assert.equal(e.erro.tipo, "duplicado_pedido"); assert.match(e.message, /pedido já está registrado/); assert.equal(e.message, e.erro.mensagem);
  assert.match(e.erro.tecnico, /23505 \| duplicate key value/, "o detalhe técnico fica para o diário");
  assert.equal(S.compras.size, 1, "a compra nova não ficou"); assert.deepEqual(registrados(S), antes.docs); assert.deepEqual(caminhos(S), antes.st, "só os arquivos da compra anterior continuam no cofre");
  assert.equal(S.rpc.length, 2);
});
test("o mesmo id em toda tentativa: corrigir o número e salvar de novo funciona, e o cofre só tem os arquivos da tentativa que deu certo", async () => {
  const bk = banco(), ctx = site(bk), { S } = bk;
  await salvar(ctx, { id: "33333333-3333-4333-8333-333333333333" });
  const e = await falha(salvar(ctx, { docs: [DOC(1)] })); assert.equal(e.erro.tipo, "duplicado_pedido"); assert.equal(S.storage.size, 0);
  await salvar(ctx, { x: FORM({ numero: "S-2" }), docs: [DOC(1)] });
  assert.equal(S.rpc.length, 3); assert.equal(S.rpc[1].args.p_compra.id, ID); assert.equal(S.rpc[2].args.p_compra.id, ID, "mesmo id nas duas tentativas");
  assert.equal(S.compras.size, 2); assert.equal(caminhos(S).length, 1); assert.deepEqual(registrados(S), caminhos(S));
});
test("toque duplo (mesmo id): a RPC devolve ja_existia, nada é gravado de novo e os arquivos da 2ª tentativa são apagados sem tocar nos da 1ª", async () => {
  const bk = banco(), ctx = site(bk), { S } = bk;
  await salvar(ctx, { docs: [DOC(1)] });
  const primeiro = caminhos(S), docs = registrados(S);
  await salvar(ctx, { docs: [DOC(1)] });
  assert.equal(S.compras.size, 1); assert.equal(S.itens.length, 1); assert.deepEqual(registrados(S), docs); assert.deepEqual(caminhos(S), primeiro, "os registrados ficam; o novo foi apagado");
  assert.equal(S.remocoes.length, 1); assert.ok(!primeiro.includes(S.remocoes[0]));
});
test("erro de dados inválidos da RPC (22023): mensagem clara e arquivos limpos", async () => {
  const bk = banco({ rpcErro: { error: { code: "22023", message: "compras_gravar: valor inválido em total_pago" } } }), ctx = site(bk);
  const e = await falha(salvar(ctx, { docs: [DOC(1)] }));
  assert.equal(e.erro.tipo, "dados_invalidos"); assert.match(e.message, /Dados inválidos: valor inválido em total_pago/); assert.equal(bk.S.storage.size, 0);
});
test("sessão ou 2ª etapa (42501) e compra não encontrada (P0002) viram mensagens próprias", async () => {
  for (const [code, msg, tipo] of [["42501", "compras_gravar: faça login", "sessao"], ["42501", "permission denied for function compras_gravar", "permissao"], ["P0002", "compras_gravar: compra não encontrada", "nao_encontrado"]]) {
    const bk = banco({ rpcErro: { error: { code, message: msg } } }), ctx = site(bk);
    const e = await falha(salvar(ctx, { docs: [DOC(1)] })); assert.equal(e.erro.tipo, tipo, msg); assert.equal(bk.S.storage.size, 0);
  }
});

// ---------- 3. documento repetido e imagem ----------
test("docs_repetidos: o arquivo repetido é apagado, o novo e os já registrados ficam, e a compra é gravada", async () => {
  const bk = banco(), ctx = site(bk), { S } = bk;
  await salvar(ctx, { id: "33333333-3333-4333-8333-333333333333", x: FORM({ numero: "ANTIGA" }), docs: [DOC(2)] });     // o conteúdo 2 já está guardado em outra compra
  const velho = caminhos(S)[0];
  const { id } = await salvar(ctx, { docs: [DOC(1), DOC(2)] });
  assert.equal(id, ID); assert.equal(S.compras.size, 2);
  assert.equal(S.rpc[1].args.p_docs.length, 2); assert.equal(S.rpc[1].args.p_docs.filter((d) => d.sha256 === hex("conteudo2")).length, 1);
  assert.equal(S.docs.filter((d) => d.sha256 === hex("conteudo2")).length, 1, "o mesmo conteúdo continua em uma linha só");
  assert.ok(caminhos(S).includes(velho), "o arquivo já registrado de outra compra nunca é apagado");
  assert.equal(S.remocoes.length, 1); assert.ok(S.remocoes[0].startsWith(PASTA), "só o repetido, da pasta desta compra");
  assert.deepEqual(registrados(S), caminhos(S), "o cofre tem exatamente o que está registrado");
});
test("imagem do produto já guardada (mesmo conteúdo): não é enviada e o item não ganha imagem_path", async () => {
  const bk = banco(), ctx = site(bk), { S } = bk;
  S.docs.push({ id: "d0", compra_id: OUTRO, path: `U1/compras/${OUTRO}/foto.png`, sha256: SHA_FOTO }); S.storage.set(`U1/compras/${OUTRO}/foto.png`, 1);
  await salvar(ctx, { imagens: [{ blob: FOTO() }] });
  assert.equal(S.storage.size, 1, "nenhum arquivo novo"); assert.ok(!S.rpc[0].args.p_itens[0].imagem_path, "sem imagem_path"); assert.equal(S.itens[0].imagem_path, null); assert.equal(S.rpc[0].args.p_foto, null, "sem foto nova, sem p_foto");
});
test("imagem repetida que só a RPC descobre (corrida entre aparelhos): o arquivo é apagado, nenhum item aponta para ele e nada é gravado fora da RPC", async () => {
  const bk = banco({ ocultar: [SHA_FOTO] }), ctx = site(bk), { S } = bk;
  S.docs.push({ id: "d0", compra_id: OUTRO, path: `U1/compras/${OUTRO}/foto.png`, sha256: SHA_FOTO }); S.storage.set(`U1/compras/${OUTRO}/foto.png`, 1);
  await salvar(ctx, { imagens: [{ blob: FOTO() }] });
  const doc = S.rpc[0].args.p_docs.find((d) => d.tipo === "foto_produto"); assert.ok(doc, "a conferência prévia não viu: a foto foi enviada como documento");
  assert.ok(!S.rpc[0].args.p_itens[0].imagem_path && S.rpc[0].args.p_foto === doc.path, "o site pede a ligação (p_foto), mas o banco não liga foto repetida");
  assert.ok(!S.storage.has(doc.path), "a RPC a descartou por SHA repetido e o arquivo foi apagado");
  assert.equal(S.docs.filter((d) => d.sha256 === SHA_FOTO).length, 1, "continua uma linha só");
  assert.ok(S.itens.every((i) => !i.imagem_path), "nenhum item aponta para arquivo descartado");
  assert.deepEqual(S.proibidos, [], "nenhuma gravação fora da RPC (não há UPDATE para 'liberar' o item)"); assert.equal(S.compras.size, 1);
  assert.ok(S.storage.has(`U1/compras/${OUTRO}/foto.png`), "o arquivo registrado de outra compra nunca é tocado");
});
test("a foto nova é ligada pelo BANCO ao 1º produto: o site só manda p_foto, e produto que já tem imagem não muda", async () => {
  const bk = banco(), ctx = site(bk), { S } = bk;
  await salvar(ctx, { imagens: [{ blob: FOTO() }] });
  const a = S.rpc[0].args; assert.equal(a.p_foto, a.p_docs.find((d) => d.tipo === "foto_produto").path);
  assert.ok(!a.p_itens[0].imagem_path, "o site não manda imagem_path"); assert.equal(S.itens[0].imagem_path, a.p_foto, "o banco ligou o 1º produto à foto registrada");
  assert.equal(S.docs.length, 1); assert.deepEqual(S.proibidos, []);
});
test("edição: produto SEM imagem ganha a foto nova (ligada pelo banco)", async () => {
  const bk = banco(), ctx = site(bk), { S } = bk, linha = LINHA(); poe(S, linha);
  const ant = N.coDeBanco(linha), item = { descricao: "Panela", qtd: 1, total: 100, desconto: 10, categoria: "Casa", codigo: null, natureza: null, total_linha: null, situacao: null, imagem_path: null };
  await salvar(ctx, { ant, x: FORM({ id: ID, loja: "amazon", numero: "701-1", data: "2026-10-03", vendedor: "Loja X", subtotal: 110, desconto: 10, frete: 15, taxas: 5, total_pago: 120, itens: [item] }), imagens: [{ blob: FOTO() }] });
  assert.equal(S.itens[0].imagem_path, S.rpc[0].args.p_foto); assert.ok(S.storage.has(S.itens[0].imagem_path)); assert.deepEqual(S.proibidos, []);
});
test("edição: o imagem_path já gravado é preservado, com ou sem foto nova, mesmo que o formulário não o traga", async () => {
  const bk = banco(), ctx = site(bk), { S } = bk, caminho = `${PASTA}1-foto-antiga.png`;
  const linha = LINHA(); linha.compras_online_itens[0].imagem_path = caminho;
  S.storage.set(caminho, 1); S.docs.push({ id: "d0", compra_id: ID, path: caminho, sha256: hex("antiga"), tipo: "foto_produto" });
  S.compras.set(ID, { ...clone(linha), compras_online_itens: undefined }); S.itens.push({ compra_id: ID, ...linha.compras_online_itens[0] });
  const ant = N.coDeBanco(linha), item = (o = {}) => ({ descricao: "Panela", qtd: 1, total: 100, desconto: 10, categoria: "Casa", codigo: null, natureza: null, total_linha: null, situacao: null, ...o });
  const base = { id: ID, loja: "amazon", numero: "701-1", data: "2026-10-03", vendedor: "Loja X", subtotal: 110, desconto: 10, frete: 15, taxas: 5, total_pago: 120 };
  await salvar(ctx, { ant, x: FORM({ ...base, itens: [item({ imagem_path: null })] }) });                       // o formulário NÃO traz o caminho
  assert.equal(S.rpc[0].args.p_itens[0].imagem_path, caminho); assert.equal(S.itens[0].imagem_path, caminho, "gravado e igual ao de antes");
  await salvar(ctx, { ant, x: FORM({ ...base, itens: [item({ imagem_path: caminho })] }), imagens: [{ blob: FOTO() }] });  // e com uma foto nova
  assert.equal(S.itens[0].imagem_path, caminho, "a foto nova não troca o caminho do item"); assert.ok(S.docs.some((d) => d.tipo === "foto_produto" && d.path !== caminho), "a foto nova ficou como documento");
  assert.ok(S.storage.has(caminho), "o arquivo antigo continua no cofre"); assert.deepEqual(S.proibidos, []);
});
test("falha na imagem do produto (sem imagem legível) não impede de salvar a compra", async () => {
  const bk = banco(), ctx = site(bk);
  await salvar(ctx, { imagens: [{ blob: { type: "image/png", size: 1, arrayBuffer: () => Promise.reject(new Error("ilegível")) } }] });
  assert.equal(bk.S.compras.size, 1); assert.equal(bk.S.storage.size, 0);
});

// ---------- 4. rede e verificação ----------
test("a resposta se perdeu DEPOIS de gravar (rede): os arquivos registrados são preservados, nada é apagado", async () => {
  const bk = banco({ rede: "depois" }), ctx = site(bk), { S } = bk;
  const e = await falha(salvar(ctx, { docs: [DOC(1), DOC(2)] }));
  assert.equal(e.erro.tipo, "rede"); assert.equal(e.erro.repetir, true); assert.match(e.message, /Sem conexão/);
  assert.equal(S.compras.size, 1, "a compra foi gravada no banco"); assert.equal(S.remocoes.length, 0, "nada apagado"); assert.deepEqual(registrados(S), caminhos(S));
});
test("a rede caiu ANTES da RPC: nada gravado e os arquivos enviados são apagados", async () => {
  const bk = banco({ rede: "antes" }), ctx = site(bk);
  const e = await falha(salvar(ctx, { docs: [DOC(1)] }));
  assert.equal(e.erro.tipo, "rede"); assert.equal(bk.S.compras.size, 0); assert.equal(bk.S.storage.size, 0);
});
test("se não dá para conferir o que está registrado, NADA é apagado (melhor sobrar um arquivo do que perder um registrado)", async () => {
  const bk = banco({ falharConferencia: true, rpcErro: { error: { code: "XX000", message: "erro interno" } } }), ctx = site(bk);
  const e = await falha(salvar(ctx, { docs: [DOC(1), DOC(2)] }));
  assert.equal(e.erro.tipo, "desconhecido"); assert.equal(bk.S.remocoes.length, 0); assert.equal(bk.S.storage.size, 2);
});
test("a mensagem para a tela é em português e mantém os dados na tela; o detalhe técnico vai para o diário", async () => {
  const bk = banco({ rpcErro: { error: { code: "23505", message: 'duplicate key value violates unique constraint "compras_online_nfe_unica"' } } }), ctx = site(bk);
  const e = await falha(salvar(ctx, {}));
  const texto = ctx.ccErroTela(e, " Os dados continuam aqui.");
  assert.match(texto, /nota fiscal.*Os dados continuam aqui\.$/); assert.ok(!/duplicate key|constraint/i.test(texto));
  assert.equal(ctx.__erros.length, 1); assert.match(ctx.__erros[0][1].message, /23505 \| duplicate key value/);
  assert.match(ctx.ccErroTela(new Error("falhou o envio"), " X"), /^Não consegui salvar \(falhou o envio\)\. X$/);
});

// ---------- 5. edição e documentos novos ----------
const LINHA = () => ({ id: ID, loja: "amazon", numero: "701-1", data: "2026-10-03", vendedor: "Loja X", status: "reembolso_informado", subtotal: 110, desconto: 10, frete: 15, taxas: 5, total_pago: 120, pagamento: null, categoria: null,
  recorrencia_texto: null, recorrencia_meses: null, recorrencia_status: null, chave_nfe: "1".repeat(44), numero_nf: "1234", emitente: "Emitente", cnpj: "11222333000144", fora_das_contas: true, motivo_fora: "contada no Mercado",
  divergencias: [{ campo: "total_pago", texto: "difere" }], observacoes: null, origem: "pdf", versoes: [], canal: "amazon", natureza: "fisica", historico: false, impostos_info: 7.5,
  compras_online_itens: [{ ordem: 0, descricao: "Panela", qtd: 1, unitario: 100, total: 100, desconto: 10, categoria: "Casa", imagem_path: null, natureza: null, total_linha: null, situacao: null }] });
test("edição pelo RPC: muda só o que o formulário trouxe e preserva status, canal, natureza, imposto, 'fora das contas' e os dados da nota", async () => {
  const bk = banco(), ctx = site(bk), { S } = bk, ant = N.coDeBanco(LINHA());
  S.compras.set(ID, { ...clone(LINHA()), compras_online_itens: undefined }); S.itens.push({ compra_id: ID, ...LINHA().compras_online_itens[0] });
  const antes = clone(S.compras.get(ID));
  await salvar(ctx, { ant, x: FORM({ id: ID, loja: "amazon", numero: "701-9", data: "2026-10-03", vendedor: "Loja X", subtotal: 110, desconto: 10, frete: 15, taxas: 5, total_pago: 120,
    itens: [{ descricao: "Panela de pressão", qtd: 2, total: 100, desconto: 10, categoria: "Casa", codigo: null, imagem_path: null, natureza: null, total_linha: null, situacao: null }] }) });
  const depois = S.compras.get(ID);
  assert.equal(S.rpc[0].args.p_novo, false); assert.equal(depois.numero, "701-9");
  for (const k of ["status", "canal", "natureza", "impostos_info", "fora_das_contas", "motivo_fora", "chave_nfe", "numero_nf", "emitente", "cnpj", "origem", "historico", "recorrencia_status", "data", "subtotal", "total_pago"]) assert.deepEqual(depois[k], antes[k], k + " intacto");
  assert.deepEqual(depois.divergencias, antes.divergencias);
  assert.deepEqual(S.itens.map((i) => [i.descricao, i.qtd]), [["Panela de pressão", 2]], "os produtos foram trocados pelos do formulário");
  assert.deepEqual(S.proibidos, []);
});
const LINHA_VAZIA = () => { const l = LINHA(); Object.assign(l, { chave_nfe: null, numero_nf: null, emitente: null, cnpj: null, status: null, divergencias: [] }); return l; };
const poe = (S, l) => { S.compras.set(ID, { ...clone(l), compras_online_itens: undefined }); S.itens.push({ compra_id: ID, ...l.compras_online_itens[0] }); };
const KEY = "1".repeat(44), KEY2 = "2".repeat(44);
test("anexar a uma compra existente: documentos E complemento pela RPC compras_anexar, sem atualizar a compra por fora", async () => {
  const bk = banco(), ctx = site(bk), { S } = bk, l = LINHA_VAZIA(), ex = N.coDeBanco(l);
  poe(S, l);
  S.docs.push({ id: "d0", compra_id: OUTRO, path: `U1/compras/${OUTRO}/x.pdf`, sha256: hex("conteudo2") }); S.storage.set(`U1/compras/${OUTRO}/x.pdf`, 1);
  const docs = [DOC(1, { ext: { numero: "701-1", chave_nfe: KEY, emitente: "Loja LTDA", cnpj: "11222333000144" }, tipo: "danfe" }), DOC(2, { tipo: "email_cancelamento" })];
  const comp = N.coComplementoAnexo(ex, docs.map((d) => ({ ...d.ext, tipo: d.tipo })), [{ campo: "total_pago", texto: "O e-mail diz 90,00." }]);
  const r = await ctx.ccAnexar({ id: ID }, docs, comp, () => {});
  assert.equal(r, ID); assert.equal(S.rpc.length, 1); assert.equal(S.rpc[0].nome, "compras_anexar");
  const a = S.rpc[0].args; assert.deepEqual(Object.keys(a).sort(), ["p_complemento", "p_docs", "p_id"]); assert.equal(a.p_id, ID);
  assert.deepEqual(clone(a.p_complemento), { chave_nfe: KEY, emitente: "Loja LTDA", cnpj: "11222333000144", status: "cancelamento_informado", divergencias: [{ texto: "O e-mail diz 90,00.", campo: "total_pago" }] });
  const c = S.compras.get(ID);
  assert.deepEqual([c.chave_nfe, c.emitente, c.cnpj, c.status], [KEY, "Loja LTDA", "11222333000144", "cancelamento_informado"], "o banco completou a compra");
  assert.deepEqual(c.divergencias.map((d) => d.texto), ["O e-mail diz 90,00."]);
  for (const k of ["subtotal", "desconto", "frete", "taxas", "total_pago", "numero", "origem"]) assert.deepEqual(c[k], l[k], k + " não muda");
  assert.deepEqual(S.proibidos, [], "nenhum update direto: o complemento vai DENTRO da RPC"); assert.equal(S.itens.length, 1);
  assert.equal(S.docs.filter((d) => d.compra_id === ID).length, 1, "só o documento novo foi registrado (o repetido não)");
  assert.equal(S.remocoes.length, 1); assert.ok(S.remocoes[0].startsWith(PASTA), "o arquivo repetido foi apagado");
  assert.deepEqual(registrados(S).filter((p) => p.startsWith(PASTA)), caminhos(S).filter((p) => p.startsWith(PASTA)));
  assert.ok(!JSON.stringify(a.p_docs).includes("fulano@exemplo.com"), "limpeza de dados pessoais também aqui");
});
test("anexar: só preenche o que está vazio e não repete divergência (o site e o banco)", async () => {
  const bk = banco(), ctx = site(bk), { S } = bk, l = LINHA();            // a compra já tem chave, NF, emitente, CNPJ, status e uma divergência
  l.divergencias = [{ campo: "total_pago", texto: "difere" }]; poe(S, l);
  const ex = N.coDeBanco(l), docs = [DOC(1, { ext: { chave_nfe: KEY2, numero_nf: "9", emitente: "Outro", cnpj: "99888777000166" }, tipo: "email_reembolso" })];
  const comp = N.coComplementoAnexo(ex, docs.map((d) => ({ ...d.ext, tipo: d.tipo })), [{ texto: "difere" }, { texto: "nova" }, { texto: "nova" }]);
  assert.deepEqual(clone(comp), { divergencias: [{ texto: "nova" }] }, "o site já não manda o que a compra tem");
  await ctx.ccAnexar({ id: ID }, docs, comp, () => {});
  const c = S.compras.get(ID); assert.deepEqual([c.chave_nfe, c.numero_nf, c.emitente, c.cnpj, c.status], [l.chave_nfe, l.numero_nf, l.emitente, l.cnpj, l.status], "nada do que estava gravado foi trocado");
  assert.deepEqual(c.divergencias.map((d) => d.texto), ["difere", "nova"]);
  await ctx.ccAnexar({ id: ID }, [DOC(3)], { divergencias: [{ texto: "nova" }, { texto: "outra" }] }, () => {});       // o banco também não repete
  assert.deepEqual(S.compras.get(ID).divergencias.map((d) => d.texto), ["difere", "nova", "outra"]);
  assert.deepEqual(S.proibidos, []);
});
test("anexar: tudo ou nada — chave de nota que já é de outra compra recusa tudo, o documento não fica e o arquivo enviado é apagado", async () => {
  const bk = banco(), ctx = site(bk), { S } = bk, l = LINHA_VAZIA(); poe(S, l);
  S.compras.set(OUTRO, { ...clone(LINHA()), id: OUTRO, numero: "OUTRA", chave_nfe: KEY, compras_online_itens: undefined });
  const antes = clone(S.compras.get(ID)), e = await falha(ctx.ccAnexar({ id: ID }, [DOC(1)], { chave_nfe: KEY, numero_nf: "7", divergencias: [{ texto: "x" }] }, () => {}));
  assert.equal(e.erro.tipo, "duplicado_nfe"); assert.match(e.message, /nota fiscal/);
  assert.deepEqual(clone(S.compras.get(ID)), antes, "nenhum campo ficou"); assert.equal(S.docs.length, 0, "o documento não ficou"); assert.equal(S.storage.size, 0, "e o arquivo foi apagado");
});
test("anexar em compra que não existe mais (P0002), complemento recusado ou falha de envio: erro claro e arquivos limpos", async () => {
  const bk = banco(), ctx = site(bk);
  const e = await falha(ctx.ccAnexar({ id: ID }, [DOC(1)], {}, () => {}));
  assert.equal(e.erro.tipo, "nao_encontrado"); assert.equal(bk.S.storage.size, 0);
  const bk3 = banco(); poe(bk3.S, LINHA_VAZIA());
  const e3 = await falha(site(bk3).ccAnexar({ id: ID }, [DOC(1)], { user_id: "x" }, () => {}));
  assert.equal(e3.erro.tipo, "campo_invalido"); assert.equal(bk3.S.storage.size, 0); assert.equal(bk3.S.docs.length, 0);
  const bk2 = banco({ falharUpload: (p) => /pedido2/.test(p) }), ctx2 = site(bk2);
  const e2 = await falha(ctx2.ccAnexar({ id: ID }, [DOC(1), DOC(2)], {}, () => {}));
  assert.match(e2.message, /falhou o envio/); assert.equal(bk2.S.rpc.length, 0); assert.equal(bk2.S.storage.size, 0);
});

// ---------- 6. o código do site ----------
test("js/compras.js: o quadro de conferência cria o id UMA vez e o passa a toda tentativa; gravar e anexar usam as RPCs da 035 com o complemento", () => {
  assert.match(CODIGO, /sal=false,idNovo=novoId\(\),p=panel\(/, "id criado quando o quadro nasce");
  assert.match(CODIGO, /divs,function\(t\)\{falta\.textContent=t\},idNovo\)/, "e passado ao ccGravar em toda tentativa");
  assert.match(CODIGO, /ccAnexar\(ex,docsNovos,NUCLEO\.coComplementoAnexo\(ex,\[c\]\.concat\(docsNovos\.map\(function\(x\)\{return x\.ext\}\)\),divs\),function\(t\)\{falta\.textContent=t\}\)/, "no quadro: documentos + complemento");
  assert.match(CODIGO, /ccAnexar\(c,novos,NUCLEO\.coComplementoAnexo\(c,novos\.map\(function\(x\)\{return x\.ext\}\),NUCLEO\.coDivergenciasAnexo\(c,novos\)\),function\(t\)\{st\.textContent=t\}\)/, "na compra aberta: documentos + complemento + divergências");
  assert.doesNotMatch(CODIGO, /novoId\(\)[^;]{0,40}ccGravar|id=ant\?ant\.id:novoId\(\)/, "o ccGravar não inventa id a cada chamada");
  assert.equal((CODIGO.match(/SB\.rpc\(/g) || []).length, 1, "uma só chamada de SB.rpc no código (dentro de ccRpc)");
  assert.deepEqual([...CODIGO.matchAll(/ccRpc\("([a-z_]+)"/g)].map((m) => m[1]).sort(), ["compras_anexar", "compras_gravar_com_foto"], "só as duas RPCs da 035");
  assert.doesNotMatch(CODIGO.replace(/\/\*[\s\S]*?\*\//g, ""), /ccCompletar|ccSubirDocs|ccImagemProduto|ccDepoisGravar/, "nada do fluxo antigo");
  assert.match(CODIGO, /p_foto:foto\?up\[up\.length-1\]\.path:null/, "o site só diz qual é a foto; quem liga ao produto é o banco");
});

// ---------- 5b. fotos e anexos: os cenários que faltavam (etapa 3) ----------
/** nenhum produto aponta para arquivo que não existe, nem para arquivo que não está registrado como documento */
const semOrfaos = (S) => { for (const i of S.itens) if (i.imagem_path) { assert.ok(S.storage.has(i.imagem_path), "item aponta para arquivo que sumiu do cofre: " + i.imagem_path); assert.ok(S.docs.some((d) => d.path === i.imagem_path), "item aponta para arquivo que não é documento registrado: " + i.imagem_path); } };
const FOTO2 = () => blob("outra-imagem-do-produto", "image/png");
test("foto: toque duplo com foto — a RPC devolve ja_existia, o produto fica com a 1ª foto e o arquivo da 2ª tentativa é apagado", async () => {
  const bk = banco(), ctx = site(bk), { S } = bk;
  await salvar(ctx, { imagens: [{ blob: FOTO() }] });
  const primeira = S.itens[0].imagem_path; assert.ok(primeira); semOrfaos(S);
  await salvar(ctx, { imagens: [{ blob: FOTO2() }] });
  assert.equal(S.rpc.length, 2); assert.equal(S.compras.size, 1); assert.equal(S.itens.length, 1); assert.equal(S.itens[0].imagem_path, primeira, "continua a 1ª foto");
  assert.equal(S.docs.filter((d) => d.tipo === "foto_produto").length, 1, "só uma foto registrada"); assert.equal(S.remocoes.length, 1, "o arquivo da 2ª tentativa foi apagado"); assert.ok(!S.storage.has(S.remocoes[0]));
  assert.ok(S.storage.has(primeira)); semOrfaos(S); assert.deepEqual(S.proibidos, []);
});
test("foto: nenhum cenário de foto deixa produto apontando para arquivo descartado (nova, repetida já guardada, repetida só descoberta pela RPC, edição)", async () => {
  for (const [nome, op, seed] of [["nova", {}, false], ["repetida já guardada", {}, true], ["repetida só pela RPC", { ocultar: [SHA_FOTO] }, true]]) {
    const bk = banco(op), ctx = site(bk), { S } = bk;
    if (seed) { S.docs.push({ id: "d0", compra_id: OUTRO, tipo: "foto_produto", path: `U1/compras/${OUTRO}/foto.png`, sha256: SHA_FOTO }); S.storage.set(`U1/compras/${OUTRO}/foto.png`, 1); }
    await salvar(ctx, { imagens: [{ blob: FOTO() }] });
    semOrfaos(S); assert.deepEqual(S.proibidos, [], nome);
    assert.equal(S.itens[0].imagem_path !== null, !seed, nome + ": liga só quando a foto é nova e ficou registrada");
  }
});
test("anexar: e-mail de reembolso e de cancelamento viram o aviso certo, e só quando a compra está sem status", async () => {
  for (const [tipo, esperado] of [["email_reembolso", "reembolso_informado"], ["email_cancelamento", "cancelamento_informado"]]) {
    const bk = banco(), ctx = site(bk), { S } = bk, l = LINHA_VAZIA(); poe(S, l);
    const comp = N.coComplementoAnexo(N.coDeBanco(l), [{ tipo }], []);
    assert.deepEqual(clone(comp), { status: esperado }); await ctx.ccAnexar({ id: ID }, [DOC(1, { tipo })], comp, () => {});
    assert.equal(S.compras.get(ID).status, esperado, tipo); assert.deepEqual(S.proibidos, []);
  }
  /* a compra já tem status: o site nem manda, e se mandasse o banco não troca */
  const bk = banco(), ctx = site(bk), { S } = bk, l = LINHA(); l.status = "concluido"; l.divergencias = []; poe(S, l);
  assert.deepEqual(clone(N.coComplementoAnexo(N.coDeBanco(l), [{ tipo: "email_cancelamento" }], [])), {}, "o site não manda");
  const r = await ctx.ccAnexar({ id: ID }, [DOC(1)], { status: "cancelamento_informado" }, () => {});
  assert.equal(r, ID); assert.equal(S.compras.get(ID).status, "concluido", "o banco não troca o status que já existe"); assert.deepEqual(S.rpc[0].args.p_complemento, { status: "cancelamento_informado" });
});
test("anexar: chave de 44 dígitos e CNPJ de 14 dígitos — o site já filtra; se um valor ruim chegasse à RPC, ela recusa e NADA fica (nem o documento)", async () => {
  const bk = banco(), ctx = site(bk), { S } = bk, l = LINHA_VAZIA(); poe(S, l);
  const ruim = N.coComplementoAnexo(N.coDeBanco(l), [{ chave_nfe: "123", cnpj: "11.222.333/0001-44", numero_nf: "x".repeat(21) }], []);
  assert.deepEqual(clone(ruim), {}, "o núcleo não manda valor que a RPC recusaria");
  for (const [comp, tipo, re] of [[{ chave_nfe: "123" }, "dados_invalidos", /chave da nota inválida/], [{ cnpj: "11.222.333/0001-44" }, "dados_invalidos", /CNPJ inválido/], [{ numero_nf: "x".repeat(21) }, "dados_invalidos", /número da nota longo demais/], [{ emitente: "e".repeat(161) }, "dados_invalidos", /emitente longo demais/], [{ status: "cancelado" }, "dados_invalidos", /status não permitido/]]) {
    const antes = clone(S.compras.get(ID)), n = S.rpc.length;
    const e = await falha(ctx.ccAnexar({ id: ID }, [DOC(1)], comp, () => {}));
    assert.equal(e.erro.tipo, tipo); assert.match(e.erro.tecnico, re); assert.match(e.message, /^Dados inválidos: /);
    assert.equal(S.rpc.length, n + 1); assert.deepEqual(clone(S.compras.get(ID)), antes, "a compra não mudou"); assert.equal(S.docs.length, 0, "o documento não ficou"); assert.equal(S.storage.size, 0, "e o arquivo enviado foi apagado");
  }
  const ok = await ctx.ccAnexar({ id: ID }, [DOC(1)], { chave_nfe: "1".repeat(44), cnpj: "1".repeat(14), numero_nf: "x".repeat(20), emitente: "e".repeat(160) }, () => {});
  assert.equal(ok, ID); assert.equal(S.compras.get(ID).chave_nfe, "1".repeat(44), "nos limites exatos, grava");
});
test("anexar: no máximo 20 divergências por chamada (o site corta em 20; a RPC recusa 21)", async () => {
  const bk = banco(), ctx = site(bk), { S } = bk, l = LINHA_VAZIA(); poe(S, l);
  const muitas = Array.from({ length: 30 }, (_, i) => ({ texto: "d" + i, campo: "x" }));
  const comp = N.coComplementoAnexo(N.coDeBanco(l), [], muitas); assert.equal(comp.divergencias.length, 20, "o site manda no máximo 20");
  await ctx.ccAnexar({ id: ID }, [DOC(1)], comp, () => {}); assert.equal(S.compras.get(ID).divergencias.length, 20);
  const e = await falha(ctx.ccAnexar({ id: ID }, [DOC(2)], { divergencias: Array.from({ length: 21 }, (_, i) => ({ texto: "n" + i })) }, () => {}));
  assert.match(e.erro.tecnico, /divergências demais \(máximo 20 por vez\)/); assert.equal(S.compras.get(ID).divergencias.length, 20); assert.equal(S.docs.length, 1, "o 2º documento não ficou"); assert.equal(S.storage.size, 1);
});
test("anexar: falha de envio, falha da RPC e resposta perdida pela rede (antes e depois de gravar)", async () => {
  /* a RPC falha (sessão): nada gravado, arquivo apagado */
  const a = banco({ rpcErro: { error: { code: "42501", message: "compras_anexar: faça login" } } }); poe(a.S, LINHA_VAZIA());
  const ea = await falha(site(a).ccAnexar({ id: ID }, [DOC(1)], { numero_nf: "1" }, () => {})); assert.equal(ea.erro.tipo, "sessao"); assert.equal(a.S.storage.size, 0); assert.equal(a.S.docs.length, 0);
  /* a rede cai ANTES: nada gravado, arquivo apagado */
  const b = banco({ rede: "antes" }); poe(b.S, LINHA_VAZIA());
  const eb = await falha(site(b).ccAnexar({ id: ID }, [DOC(1)], { numero_nf: "1" }, () => {})); assert.equal(eb.erro.tipo, "rede"); assert.equal(eb.erro.repetir, true); assert.equal(b.S.storage.size, 0); assert.equal(b.S.compras.get(ID).numero_nf, null);
  /* a resposta se perde DEPOIS de gravar: o banco gravou o documento e o complemento, e o site NÃO apaga nada */
  const c = banco({ rede: "depois" }); poe(c.S, LINHA_VAZIA());
  const ec = await falha(site(c).ccAnexar({ id: ID }, [DOC(1), DOC(2)], { numero_nf: "1" }, () => {})); assert.equal(ec.erro.tipo, "rede");
  assert.equal(c.S.compras.get(ID).numero_nf, "1", "gravou"); assert.equal(c.S.docs.length, 2); assert.equal(c.S.remocoes.length, 0, "nada apagado: está tudo registrado"); assert.equal(c.S.storage.size, 2);
  /* falha de envio do 2º arquivo: a RPC nem roda e o 1º arquivo é apagado */
  const d = banco({ falharUpload: (p) => /pedido2/.test(p) }); poe(d.S, LINHA_VAZIA());
  const ed = await falha(site(d).ccAnexar({ id: ID }, [DOC(1), DOC(2)], { numero_nf: "1" }, () => {})); assert.match(ed.message, /falhou o envio/); assert.equal(d.S.rpc.length, 0); assert.equal(d.S.storage.size, 0);
  for (const x of [a, b, c, d]) assert.deepEqual(x.S.proibidos, []);
});
test("salvar: a resposta da RPC se perde depois de gravar — foto ligada e arquivos registrados são preservados (nada apagado)", async () => {
  const bk = banco({ rede: "depois" }), ctx = site(bk), { S } = bk;
  const e = await falha(salvar(ctx, { docs: [DOC(1)], imagens: [{ blob: FOTO() }] })); assert.equal(e.erro.tipo, "rede");
  assert.equal(S.compras.size, 1); assert.equal(S.remocoes.length, 0); assert.ok(S.itens[0].imagem_path, "o banco ligou a foto"); semOrfaos(S); assert.equal(S.storage.size, 2);
  /* tentar de novo com o MESMO id: ja_existia, nada duplica e o arquivo novo é apagado */
  bk.S.op.rede = null;
  await salvar(ctx, { docs: [DOC(1)], imagens: [{ blob: FOTO2() }] });
  assert.equal(S.compras.size, 1); assert.equal(S.itens.length, 1); semOrfaos(S); for (const r of S.remocoes) assert.ok(!S.docs.some((d) => d.path === r) && !S.itens.some((i) => i.imagem_path === r), "só foi apagado o que não está registrado"); assert.ok(S.storage.has(S.itens[0].imagem_path));
});

// ---------- 7. nenhuma gravação direta ----------
test("NENHUM insert, update ou delete direto em compras, produtos ou documentos: nem no fluxo de salvar, nem em nenhum dos bancos simulados", () => {
  const codigo = CODIGO.replace(/\/\*[\s\S]*?\*\//g, ""), a = codigo.indexOf("function ccGravar("), b = codigo.indexOf("function ccErroTela(");
  assert.ok(a > 0 && b > a);
  const fluxo = codigo.slice(a, b);
  assert.doesNotMatch(fluxo, /\.(insert|update|upsert|delete)\(/, "ccGravar, ccAnexar, ccRpc, ccLimparEnviados, ccEnviarArquivos e ccFotoProduto só leem as tabelas (select) e gravam pela RPC");
  assert.doesNotMatch(fluxo, /SB\.from\("compras_online(_itens|_docs)?"\)\.(?!select)/, "e as tabelas só são lidas com select");
  assert.doesNotMatch(codigo.slice(codigo.indexOf("function ccAnexarDocs("), codigo.indexOf("function ccProdutos(") > 0 ? codigo.indexOf("function ccProdutos(") : undefined), /\.(insert|update|upsert|delete)\(/, "anexar documentos também não grava direto");
  assert.doesNotMatch(codigo, /imagem_path:null\}\)\.eq/, "não existe mais o UPDATE que liberava a imagem do item");
  assert.ok(BANCOS.length >= 15, "os cenários acima rodaram");
  for (const S of BANCOS) assert.deepEqual(S.proibidos, [], "um banco simulado recebeu gravação direta");
});
