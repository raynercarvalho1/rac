// Lote 5.1 · etapa 2: o fluxo REAL de js/compras.js (ccGravar, ccAnexar e a limpeza do cofre) rodando num banco e num cofre de mentira.
// O js/compras.js é carregado num contexto isolado (vm) com os globais mínimos; SB é um banco/cofre em memória que imita a RPC compras_gravar da 030
// (tudo ou nada, id repetido = ja_existia, pedido único, SHA-256 único, arquivo precisa estar no cofre e na pasta da compra, edição substitui as colunas, modo "só documentos").
// É um MODELO do que o SQL faz (o SQL de verdade é provado pelo PGlite no GitHub): aqui se prova o que o SITE faz com cada resposta. Sem rede, sem Supabase, sem custo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createHash, webcrypto } from "node:crypto";
import vm from "node:vm";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const CODIGO = readFileSync(new URL("../js/compras.js", import.meta.url), "utf8");
const ID = "11111111-1111-4111-8111-111111111111", OUTRO = "22222222-2222-4222-8222-222222222222", PASTA = `U1/compras/${ID}/`;
const clone = (x) => JSON.parse(JSON.stringify(x));
const hex = (s) => createHash("sha256").update(s).digest("hex");
const blob = (txt, tipo = "application/pdf") => { const b = Buffer.from(txt); return { size: b.length, type: tipo, arrayBuffer: () => Promise.resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)) }; };
const FOTO = () => blob("imagem-do-produto", "image/png"), SHA_FOTO = hex("imagem-do-produto");

// ---------- o banco e o cofre de mentira ----------
const BANCOS = [];     // todo banco criado por um teste: o último teste confere que NENHUM recebeu gravação direta
function banco(op = {}) {
  const S = { storage: new Map(), compras: new Map(), itens: [], docs: [], rpc: [], remocoes: [], proibidos: [], op };
  BANCOS.push(S);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  function exec(q) {
    if (op.falharConferencia && q.tab !== "compras_online_itens_x" && q.op === "select" && (q.tab === "compras_online_docs" || q.tab === "compras_online_itens") && q.filtros.some((f) => f[0] === "in")) return { error: { message: "consulta falhou" } };
    if (q.tab === "compras_online_docs" && q.op === "select") {
      let l = S.docs.slice();
      for (const [t, c, v] of q.filtros) l = l.filter((d) => t === "in" ? v.includes(d[c]) : d[c] === v && !(c === "sha256" && (op.ocultar || []).includes(v)));
      return { data: l.map((d) => ({ id: d.id, path: d.path })) };
    }
    if (q.tab === "compras_online_itens" && q.op === "select") {
      let l = S.itens.slice();
      for (const [t, c, v] of q.filtros) l = l.filter((d) => t === "in" ? v.includes(d[c]) : d[c] === v);
      return { data: l.map((d) => ({ imagem_path: d.imagem_path })) };
    }
    return { error: { message: "gravação direta não permitida neste teste: " + q.tab + "." + q.op } };
  }
  const consulta = (tab) => { const q = { tab, op: "select", filtros: [], patch: null };
    const api = { select() { return api; }, eq(c, v) { q.filtros.push(["eq", c, v]); return api; }, in(c, v) { q.filtros.push(["in", c, v]); return api; }, limit() { return api; },
      /* QUALQUER insert, update ou delete direto é registrado NA CHAMADA (mesmo que ninguém espere o resultado) e nunca funciona: a RPC é o único caminho de gravação */
      update(p) { q.op = "update"; q.patch = p; S.proibidos.push(tab + ".update"); return api; },
      insert() { q.op = "insert"; S.proibidos.push(tab + ".insert"); return api; }, delete() { q.op = "delete"; S.proibidos.push(tab + ".delete"); return api; },
      then(ok, err) { return Promise.resolve(exec(q)).then(ok, err); } };
    return api; };
  function rpcGravar(a) {
    const E = (code, message) => ({ error: { code, message } });
    const pc = a.p_compra || {}, id = pc.id, novo = a.p_novo, docs = a.p_docs || [], pasta = `U1/compras/${id}/`, solo = !novo && a.p_itens == null;
    if (op.rpcErro) return op.rpcErro;
    if (solo && Object.keys(pc).length !== 1) return E("22023", "compras_gravar: para só anexar documentos mande apenas o id da compra");
    if (!solo && (!Array.isArray(a.p_itens) || !a.p_itens.length)) return E("22023", "compras_gravar: a compra precisa de pelo menos um produto");
    if (!uuid.test(id || "")) return E("22023", "compras_gravar: identificador da compra inválido");
    for (const d of docs) {
      if (!d.path.startsWith(pasta)) return E("22023", "compras_gravar: o documento está fora da pasta desta compra");
      if (!S.storage.has(d.path)) return E("22023", "compras_gravar: o arquivo do documento não está no cofre");
    }
    for (const i of a.p_itens || []) if (i.imagem_path && !i.imagem_path.startsWith(pasta)) return E("22023", "compras_gravar: imagem fora da pasta desta compra");
    if (novo && S.compras.has(id)) return { data: { id, criado: false, ja_existia: true, docs_gravados: 0, docs_repetidos: [] } };
    const T = { compras: new Map(S.compras), itens: S.itens.map(clone), docs: S.docs.map(clone) };
    if (!solo) {
      const chave = (c) => c.loja + "|" + N.coNumeroPedido(c.numero);
      if ([...T.compras.values()].some((c) => c.id !== id && chave(c) === chave(pc))) return E("23505", 'duplicate key value violates unique constraint "compras_online_pedido_unico"');
      if (novo) T.compras.set(id, { ...Object.fromEntries(N.CO_GRAVAR_CAMPOS.map((k) => [k, pc[k] ?? null])), fora_das_contas: pc.fora_das_contas ?? false, historico: pc.historico ?? false, desconto: pc.desconto ?? 0, divergencias: pc.divergencias ?? [], origem: pc.origem ?? "manual", versoes: [] });
      else {
        const ant = T.compras.get(id); if (!ant) return E("P0002", "compras_gravar: compra não encontrada");
        const novaLinha = { ...ant };
        for (const k of N.CO_GRAVAR_CAMPOS) if (!N.CO_GRAVAR_PROTEGIDOS.includes(k) && k !== "id") novaLinha[k] = pc[k] === undefined ? null : pc[k];
        novaLinha.fora_das_contas = pc.fora_das_contas ?? false; novaLinha.divergencias = Array.isArray(pc.divergencias) ? pc.divergencias : [];
        T.compras.set(id, novaLinha); T.itens = T.itens.filter((i) => i.compra_id !== id);
      }
      a.p_itens.forEach((i, n) => T.itens.push({ ...clone(i), compra_id: id, ordem: n, imagem_path: i.imagem_path ?? null }));
    } else if (!T.compras.has(id)) return E("P0002", "compras_gravar: compra não encontrada");
    const gravados = [], rep = [];
    for (const d of docs) { if (T.docs.some((x) => x.sha256 === d.sha256)) rep.push(d.path); else { T.docs.push({ id: "d" + T.docs.length, compra_id: id, ...clone(d) }); gravados.push(d.path); } }
    S.compras = T.compras; S.itens = T.itens; S.docs = T.docs;
    return { data: { id, criado: !!novo, ja_existia: false, docs_gravados: gravados.length, docs_repetidos: rep } };
  }
  const sb = {
    storage: { from: () => ({
      upload(path, b) { if (op.falharUpload && op.falharUpload(path, S)) return Promise.resolve({ error: { message: "falhou o envio" } }); if (S.storage.has(path)) return Promise.resolve({ error: { message: "already exists" } }); S.storage.set(path, b); return Promise.resolve({ error: null }); },
      remove(paths) { S.remocoes.push(...paths); paths.forEach((p) => S.storage.delete(p)); return Promise.resolve({ data: paths, error: null }); } }) },
    from: consulta,
    rpc(nome, args) { S.rpc.push({ nome, args: clone(args) }); return Promise.resolve().then(() => {
      if (op.rede === "antes") throw new TypeError("Failed to fetch");
      const r = rpcGravar(args); if (op.rede === "depois" && !r.error) throw new TypeError("Failed to fetch"); return r; }); },
  };
  return { S, sb };
}
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
  assert.equal(S.rpc.length, 1, "uma única chamada de RPC"); assert.equal(S.rpc[0].nome, "compras_gravar");
  assert.deepEqual(S.proibidos, [], "nenhum insert, update ou delete direto em compras, produtos ou documentos");
  const a = S.rpc[0].args;
  assert.equal(a.p_novo, true); assert.equal(a.p_compra.id, ID); assert.equal(a.p_compra.origem, "pdf"); assert.equal(a.p_compra.chave_nfe, "1".repeat(44));
  assert.equal(a.p_docs.length, 3, "2 documentos + a foto do produto");
  assert.deepEqual(a.p_docs.map((d) => d.tipo), ["resumo_pdf", "resumo_pdf", "foto_produto"]);
  assert.equal(caminhos(S).length, 3); assert.deepEqual(registrados(S), caminhos(S), "tudo o que subiu está registrado");
  assert.deepEqual(S.remocoes, [], "nada foi apagado");
  assert.ok(caminhos(S).every((p) => p.startsWith(PASTA)), "pasta <dono>/compras/<compra>/");
  const foto = a.p_docs[2].path; assert.ok(S.docs.some((d) => d.path === foto && d.tipo === "foto_produto"), "a foto está guardada como documento da compra");
  assert.ok(!a.p_itens[0].imagem_path && S.itens[0].imagem_path === null, "mas o item NÃO recebe imagem_path (a RPC poderia descartar a foto por SHA repetido)");
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
  assert.equal(S.storage.size, 1, "nenhum arquivo novo"); assert.ok(!S.rpc[0].args.p_itens[0].imagem_path, "sem imagem_path"); assert.equal(S.itens[0].imagem_path, null);
});
test("imagem repetida que só a RPC descobre (corrida entre aparelhos): o arquivo é apagado, nenhum item aponta para ele e nada é gravado fora da RPC", async () => {
  const bk = banco({ ocultar: [SHA_FOTO] }), ctx = site(bk), { S } = bk;
  S.docs.push({ id: "d0", compra_id: OUTRO, path: `U1/compras/${OUTRO}/foto.png`, sha256: SHA_FOTO }); S.storage.set(`U1/compras/${OUTRO}/foto.png`, 1);
  await salvar(ctx, { imagens: [{ blob: FOTO() }] });
  const doc = S.rpc[0].args.p_docs.find((d) => d.tipo === "foto_produto"); assert.ok(doc, "a conferência prévia não viu: a foto foi enviada como documento");
  assert.ok(!S.rpc[0].args.p_itens[0].imagem_path, "mas o item nunca recebe o caminho");
  assert.ok(!S.storage.has(doc.path), "a RPC a descartou por SHA repetido e o arquivo foi apagado");
  assert.equal(S.docs.filter((d) => d.sha256 === SHA_FOTO).length, 1, "continua uma linha só");
  assert.ok(S.itens.every((i) => !i.imagem_path), "nenhum item aponta para arquivo descartado");
  assert.deepEqual(S.proibidos, [], "nenhuma gravação fora da RPC (não há UPDATE para 'liberar' o item)"); assert.equal(S.compras.size, 1);
  assert.ok(S.storage.has(`U1/compras/${OUTRO}/foto.png`), "o arquivo registrado de outra compra nunca é tocado");
});
test("a foto nova é só um documento: mesmo conteúdo novo ou repetido, o item fica sem imagem_path", async () => {
  const bk = banco(), ctx = site(bk), { S } = bk;
  await salvar(ctx, { imagens: [{ blob: FOTO() }] });
  assert.deepEqual(S.rpc[0].args.p_docs.map((d) => d.tipo), ["foto_produto"]); assert.equal(S.docs.length, 1); assert.equal(S.itens[0].imagem_path, null);
  assert.ok(!("imagem_path" in S.rpc[0].args.p_itens[0]) || S.rpc[0].args.p_itens[0].imagem_path === null);
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
test("anexar documentos a uma compra existente: modo 'só documentos' (sem p_itens, só o id), sem atualizar a compra", async () => {
  const bk = banco(), ctx = site(bk), { S } = bk;
  S.compras.set(ID, { ...clone(LINHA()), compras_online_itens: undefined }); S.itens.push({ compra_id: ID, ...LINHA().compras_online_itens[0] });
  S.docs.push({ id: "d0", compra_id: OUTRO, path: `U1/compras/${OUTRO}/x.pdf`, sha256: hex("conteudo2") }); S.storage.set(`U1/compras/${OUTRO}/x.pdf`, 1);
  const linha = clone(S.compras.get(ID)), msgs = [];
  const r = await ctx.ccAnexar({ id: ID }, [DOC(1), DOC(2)], (m) => msgs.push(m));
  assert.equal(r, ID); assert.equal(S.rpc.length, 1);
  const a = S.rpc[0].args; assert.equal(a.p_novo, false); assert.equal(a.p_itens, null); assert.deepEqual(a.p_compra, { id: ID });
  assert.deepEqual(clone(S.compras.get(ID)), linha, "nenhum campo da compra mudou (nem chave da nota, NF, divergências ou status)");
  assert.deepEqual(S.proibidos, []); assert.equal(S.itens.length, 1);
  assert.equal(S.docs.filter((d) => d.compra_id === ID).length, 1, "só o documento novo foi registrado (o repetido não)");
  assert.equal(S.remocoes.length, 1); assert.ok(S.remocoes[0].startsWith(PASTA), "o arquivo repetido foi apagado");
  assert.deepEqual(registrados(S).filter((p) => p.startsWith(PASTA)), caminhos(S).filter((p) => p.startsWith(PASTA)));
  assert.ok(!JSON.stringify(a.p_docs).includes("fulano@exemplo.com"), "limpeza de dados pessoais também aqui");
});
test("anexar em compra que não existe mais (P0002) ou falha de envio: erro claro e arquivos limpos", async () => {
  const bk = banco(), ctx = site(bk);
  const e = await falha(ctx.ccAnexar({ id: ID }, [DOC(1)], () => {}));
  assert.equal(e.erro.tipo, "nao_encontrado"); assert.equal(bk.S.storage.size, 0);
  const bk2 = banco({ falharUpload: (p) => /pedido2/.test(p) }), ctx2 = site(bk2);
  const e2 = await falha(ctx2.ccAnexar({ id: ID }, [DOC(1), DOC(2)], () => {}));
  assert.match(e2.message, /falhou o envio/); assert.equal(bk2.S.rpc.length, 0); assert.equal(bk2.S.storage.size, 0);
});

// ---------- 6. o código do site ----------
test("js/compras.js: o quadro de conferência cria o id UMA vez e o passa a toda tentativa; o anexo usa o modo só documentos", () => {
  assert.match(CODIGO, /sal=false,idNovo=novoId\(\),p=panel\(/, "id criado quando o quadro nasce");
  assert.match(CODIGO, /divs,function\(t\)\{falta\.textContent=t\},idNovo\)/, "e passado ao ccGravar em toda tentativa");
  assert.match(CODIGO, /ccAnexar\(ex,docsNovos,function\(t\)\{falta\.textContent=t\}\)/); assert.match(CODIGO, /ccAnexar\(c,novos,function\(t\)\{st\.textContent=t\}\)/);
  assert.doesNotMatch(CODIGO, /novoId\(\)[^;]{0,40}ccGravar|id=ant\?ant\.id:novoId\(\)/, "o ccGravar não inventa id a cada chamada");
  assert.equal((CODIGO.match(/SB\.rpc\("compras_gravar"/g) || []).length, 1, "uma só chamada de RPC no código");
  assert.doesNotMatch(CODIGO.replace(/\/\*[\s\S]*?\*\//g, ""), /(?<!function )ccCompletar\(/, "nenhuma chamada a ccCompletar: os campos da nota não são completados daqui (dependem da 035)");
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
