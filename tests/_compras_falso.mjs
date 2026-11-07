// Banco e cofre SIMULADOS de Compras (só para testes; não é um teste). Porta para JavaScript, regra por regra, o que o SQL REAL faz em:
//   • supabase/030_compras_multiorigem.sql → compras_gravar (validações e mensagens, ja_existia, edição que substitui colunas, modo "só documentos", SHA-256 único)
//   • supabase/035_compras_anexar_foto.sql → compras_gravar_com_foto e compras_anexar (validações, só preenche o vazio, divergência sem repetir, vínculo da foto)
//   • supabase/025/030: os índices únicos (pedido e chave da nota) e o CHECK da conta, com as mensagens do PostgreSQL.
// Cada função lança o MESMO código e a MESMA mensagem do SQL; toda RPC é uma transação (tudo ou nada). O quanto isto é fiel NÃO fica só na palavra:
// tests/compras_035.test.mjs roda os mesmos cenários no Postgres de verdade (PGlite) e compara resposta e tabelas, passo a passo.
// O que o simulador NÃO tem (só o PGlite prova): usuários e RLS, trava do MFA, os CHECKs de tamanho e de valor mínimo das colunas, gatilhos (inclusive o que protege origem/histórico)
// e a tabela de importações. Os CHECKs de vocabulário e de formato (status, canal, natureza, origem, loja, chave da nota, CNPJ, conta) estão portados.
import { createRequire } from "node:module";
createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;

export const BANCOS = [];     // todo banco criado: o teste final confere que NENHUM recebeu gravação direta
const clone = (x) => JSON.parse(JSON.stringify(x));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const jt = (v) => v === undefined || v === null ? "null" : Array.isArray(v) ? "array" : typeof v;      // jsonb_typeof
const r2 = (x) => Math.round(x * 100) / 100;
const falha = (code, message) => { throw Object.assign(new Error(message), { pg: true, code }); };
const TEXTO_OPC = ["canal", "natureza", "vendedor", "status", "pagamento", "categoria", "recorrencia_texto", "recorrencia_status", "chave_nfe", "numero_nf", "emitente", "cnpj", "motivo_fora", "observacoes", "origem"];
const DINHEIRO = ["subtotal", "desconto", "frete", "taxas", "impostos_info", "total_pago"];
const chavePedido = (c) => c.loja + "|" + String(c.numero).replace(/[^A-Za-z0-9]/g, "").toUpperCase().replace(/^0+/, "");
const VOCAB_STATUS = ["concluido", "autorizado", "cancelado", "desconhecido", "cancelamento_informado", "reembolso_informado"];
/* os CHECKs de compras_online (025 e 030), na ordem em que o PostgreSQL os confere (pelo nome); a mensagem é a do PostgreSQL */
const CHECKS = [
  ["compras_online_canal_check", (r) => r.canal == null || ["amazon", "shopee", "mercado_livre", "outro_marketplace", "presencial"].includes(r.canal)],
  ["compras_online_canal_loja_ok", (r) => r.canal == null || (r.canal === "amazon" && r.loja === "amazon") || (r.canal === "shopee" && r.loja === "shopee") || (r.canal === "mercado_livre" && r.loja === "mercadolivre")
    || (r.canal === "outro_marketplace" && ["magalu", "outra"].includes(r.loja)) || (r.canal === "presencial" && r.loja === "outra")],
  ["compras_online_chave_nfe_check", (r) => r.chave_nfe == null || /^\d{44}$/.test(r.chave_nfe)],
  ["compras_online_cnpj_check", (r) => r.cnpj == null || /^\d{14}$/.test(r.cnpj)],
  ["compras_online_conta_fecha", (r) => Math.abs(r.total_pago - (r.subtotal - r.desconto + r.frete + r.taxas)) <= 0.02],
  ["compras_online_historico_ok", (r) => !r.historico || (r.canal === "amazon" && r.natureza != null)],
  ["compras_online_historico_status", (r) => !r.historico || ["concluido", "autorizado", "cancelado", "desconhecido"].includes(r.status)],
  ["compras_online_loja_check", (r) => ["amazon", "mercadolivre", "shopee", "magalu", "outra"].includes(r.loja)],
  ["compras_online_natureza_check", (r) => r.natureza == null || ["fisica", "digital", "mista", "indefinida"].includes(r.natureza)],
  ["compras_online_origem_check", (r) => ["manual", "pdf", "xml", "csv", "email", "imagem", "zip", "historico_amazon"].includes(r.origem)],
  ["compras_online_recorrencia_status_check", (r) => r.recorrencia_status == null || ["a_confirmar", "confirmada", "descartada"].includes(r.recorrencia_status)],
  ["compras_online_status_vocab", (r) => r.status == null || VOCAB_STATUS.includes(r.status)],
];
const checar = (r) => { for (const [nome, ok] of CHECKS) if (!ok(r)) falha("23514", `new row for relation "compras_online" violates check constraint "${nome}"`); };

export function banco(op = {}) {
  const CASA = op.casa || "U1";
  const S = { storage: new Map(), compras: new Map(), itens: [], docs: [], rpc: [], remocoes: [], proibidos: [], op, casa: CASA };
  BANCOS.push(S);

  // ---------- compras_gravar (030) ----------
  function gravar(pc, pi, pd, novo) {
    const M = "compras_gravar: ";
    if (novo == null) falha("22023", M + "diga se a compra é nova ou uma edição");
    if (pc == null || jt(pc) !== "object") falha("22023", M + "a compra precisa ser um objeto");
    for (const k of Object.keys(pc)) if (!N.CO_GRAVAR_CAMPOS.includes(k)) falha("22023", M + "campo não permitido na compra: " + k);
    if (jt(pc.id) !== "string" || !UUID.test(pc.id)) falha("22023", M + "identificador da compra inválido");
    const id = pc.id, solo = !novo && pi == null, pasta = `${CASA}/compras/${id}/`;
    if (novo && pi == null) falha("22023", M + "a compra precisa de pelo menos um produto");
    if (solo) { if (Object.keys(pc).length !== 1) falha("22023", M + "para só anexar documentos mande apenas o id da compra"); }
    else {
      for (const k of ["loja", "numero", "data"]) if (jt(pc[k]) !== "string") falha("22023", M + "falta o campo " + k);
      for (const k of TEXTO_OPC) if (k in pc && !["string", "null"].includes(jt(pc[k]))) falha("22023", M + `o campo ${k} precisa ser texto`);
      for (const k of ["historico", "fora_das_contas"]) if (k in pc && !["boolean", "null"].includes(jt(pc[k]))) falha("22023", M + `o campo ${k} precisa ser verdadeiro ou falso`);
      if ("divergencias" in pc && !["array", "null"].includes(jt(pc.divergencias))) falha("22023", M + "divergencias precisa ser uma lista");
      if ("recorrencia_meses" in pc && !["number", "null"].includes(jt(pc.recorrencia_meses))) falha("22023", M + "recorrencia_meses precisa ser número");
      if ("importacao_id" in pc && !["string", "null"].includes(jt(pc.importacao_id))) falha("22023", M + "importacao_id inválido");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(pc.data)) falha("22023", M + "data inválida");
      const d1 = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      if (pc.data < "1995-01-01" || pc.data > d1) falha("22023", M + "a data está fora do esperado");
      for (const k of DINHEIRO) {
        if (["subtotal", "total_pago"].includes(k) && jt(pc[k]) !== "number") falha("22023", M + "falta o valor de " + k);
        if (k in pc && !["number", "null"].includes(jt(pc[k]))) falha("22023", M + k + " precisa ser número");
        const v = pc[k]; if (v != null && (v < 0 || v > 1000000 || v !== r2(v))) falha("22023", M + "valor inválido em " + k);
      }
      if (pc.importacao_id != null) falha("22023", M + "importação não encontrada");          // o simulador não tem a tabela de importações
      if (jt(pi) !== "array" || pi.length === 0) falha("22023", M + "a compra precisa de pelo menos um produto");
      if (pi.length > 200) falha("22023", M + "produtos demais (máximo 200)");
      pi.forEach((it, i) => {
        const n = i + 1;
        if (jt(it) !== "object") falha("22023", M + `o produto ${n} precisa ser um objeto`);
        for (const k of Object.keys(it)) if (!N.CO_GRAVAR_ITEM.includes(k)) falha("22023", M + `campo não permitido no produto ${n}: ${k}`);
        if (jt(it.descricao) !== "string" || it.descricao.trim() === "") falha("22023", M + `falta o nome do produto ${n}`);
        for (const k of ["codigo", "categoria", "imagem_path", "natureza", "situacao"]) if (k in it && !["string", "null"].includes(jt(it[k]))) falha("22023", M + `o campo ${k} do produto ${n} precisa ser texto`);
        for (const k of ["qtd", "unitario", "desconto", "total_linha"]) if (k in it && !["number", "null"].includes(jt(it[k]))) falha("22023", M + `o campo ${k} do produto ${n} precisa ser número`);
        if (jt(it.total) !== "number") falha("22023", M + `falta o total do produto ${n}`);
        if (it.total < 0 || it.total > 1000000 || it.total !== r2(it.total)) falha("22023", M + `total inválido no produto ${n}`);
        const q = it.qtd == null ? 1 : it.qtd; if (q <= 0 || q > 100000) falha("22023", M + `quantidade inválida no produto ${n}`);
        if (it.imagem_path != null && (!it.imagem_path.startsWith(pasta) || it.imagem_path.includes("..") || it.imagem_path.length > 300)) falha("22023", M + `imagem fora da pasta desta compra (produto ${n})`);
      });
    }
    let docs = pd == null ? [] : pd;
    if (jt(docs) !== "array" || docs.length > 50) falha("22023", M + "lista de documentos inválida (máximo 50)");
    const todos = [];
    docs.forEach((d, i) => {
      const n = i + 1;
      if (jt(d) !== "object") falha("22023", M + `o documento ${n} precisa ser um objeto`);
      for (const k of Object.keys(d)) if (!N.CO_GRAVAR_DOC.includes(k)) falha("22023", M + `campo não permitido no documento ${n}: ${k}`);
      for (const k of ["tipo", "nome", "path", "sha256"]) if (jt(d[k]) !== "string") falha("22023", M + `falta o campo ${k} no documento ${n}`);
      if (!N.CO_DOC_TIPOS.includes(d.tipo)) falha("22023", M + `tipo de documento inválido (${n})`);
      if (!/^[0-9a-f]{64}$/.test(d.sha256)) falha("22023", M + `SHA-256 inválido no documento ${n}`);
      if ("tamanho" in d && !["number", "null"].includes(jt(d.tamanho))) falha("22023", M + `tamanho inválido no documento ${n}`);
      if ("mime" in d && !["string", "null"].includes(jt(d.mime))) falha("22023", M + `mime inválido no documento ${n}`);
      if ("extraido" in d && !["object", "null"].includes(jt(d.extraido))) falha("22023", M + `o extraído do documento ${n} precisa ser um objeto`);
      if (!d.path.startsWith(pasta) || d.path.includes("..") || d.path.length > 300) falha("22023", M + `o documento ${n} está fora da pasta desta compra`);
      if (!S.storage.has(d.path)) falha("22023", M + `o arquivo do documento ${n} não está no cofre`);
      todos.push(d.path);
    });
    let ant = null;
    if (novo) { if (S.compras.has(id)) return { id, criado: false, ja_existia: true, docs_gravados: 0, docs_repetidos: [] }; }
    else {
      ant = S.compras.get(id); if (!ant) falha("P0002", M + "compra não encontrada");
      if ("origem" in pc && pc.origem !== ant.origem) falha("22023", M + "origem não muda na edição");
      if ("historico" in pc && (pc.historico || false) !== (ant.historico || false)) falha("22023", M + "historico não muda na edição");
      if ("importacao_id" in pc && (pc.importacao_id ?? null) !== (ant.importacao_id ?? null)) falha("22023", M + "importacao_id não muda na edição");
    }
    if (!solo) {
      const base = { ...(ant || {}), id };
      for (const k of N.CO_GRAVAR_CAMPOS) {
        if (k === "id" || (ant && N.CO_GRAVAR_PROTEGIDOS.includes(k))) continue;
        base[k] = pc[k] === undefined ? null : pc[k];
      }
      base.desconto = pc.desconto ?? 0; base.frete = pc.frete ?? 0; base.taxas = pc.taxas ?? 0; base.fora_das_contas = pc.fora_das_contas ?? false;
      base.divergencias = Array.isArray(pc.divergencias) ? pc.divergencias : [];
      if (!ant) { base.historico = pc.historico ?? false; base.origem = pc.origem ?? "manual"; base.versoes = []; base.atualizado_em = null; }
      else { base.versoes = (ant.versoes || []).concat([{ quando: "agora" }]).slice(-10); base.atualizado_em = "agora"; }
      checar(base);
      const outras = [...S.compras.values()].filter((c) => c.id !== id);
      if (outras.some((c) => chavePedido(c) === chavePedido(base))) falha("23505", 'duplicate key value violates unique constraint "compras_online_pedido_unico"');
      if (base.chave_nfe != null && outras.some((c) => c.chave_nfe === base.chave_nfe)) falha("23505", 'duplicate key value violates unique constraint "compras_online_nfe_unica"');
      S.compras.set(id, base);
      S.itens = S.itens.filter((i) => i.compra_id !== id);
      pi.forEach((it, i) => S.itens.push({ compra_id: id, ordem: i, descricao: it.descricao.trim(), imagem_path: it.imagem_path ?? null, qtd: it.qtd ?? 1, total: it.total }));
    }
    const ok = [];
    for (const d of docs) if (!S.docs.some((x) => x.sha256 === d.sha256)) { S.docs.push({ compra_id: id, tipo: d.tipo, path: d.path, sha256: d.sha256, nome: d.nome }); ok.push(d.path); }
    return { id, criado: !!novo, ja_existia: false, docs_gravados: ok.length, docs_repetidos: todos.filter((p) => !ok.includes(p)) };
  }

  // ---------- compras_gravar_com_foto (035) ----------
  function comFoto(pc, pi, pd, novo, foto) {
    if (foto != null && (foto.trim() === "" || foto.length > 300 || foto.includes(".."))) falha("22023", "compras_gravar_com_foto: caminho da foto inválido");
    const r = gravar(pc, pi, pd, novo);
    let n = 0;
    if (foto != null && !r.ja_existia) {
      for (const it of S.itens) {
        if (it.compra_id === r.id && it.ordem === 0 && it.imagem_path == null && S.docs.some((d) => d.compra_id === r.id && d.path === foto && d.tipo === "foto_produto")) { it.imagem_path = foto; n++; }
      }
    }
    return { ...r, foto_vinculada: n > 0 };
  }

  // ---------- compras_anexar (035) ----------
  function anexar(id, pd, complemento) {
    const M = "compras_anexar: ", campos = N.CO_COMPLEMENTO_CAMPOS;
    const comp = complemento == null ? {} : complemento;
    if (id == null) falha("22023", M + "falta o id da compra");
    if (pd == null || jt(pd) !== "array") falha("22023", M + "a lista de documentos precisa ser uma lista");
    if (jt(comp) !== "object") falha("22023", M + "o complemento precisa ser um objeto");
    for (const k of Object.keys(comp)) if (!campos.includes(k)) falha("22023", M + "campo não permitido no complemento: " + k);
    for (const k of ["chave_nfe", "numero_nf", "emitente", "cnpj", "status"]) if (k in comp && !["string", "null"].includes(jt(comp[k]))) falha("22023", M + `o campo ${k} precisa ser texto`);
    let ch = comp.chave_nfe ?? null, nf = comp.numero_nf ?? null, em = comp.emitente ?? null, cn = comp.cnpj ?? null, st = comp.status ?? null;
    if (ch != null && !/^\d{44}$/.test(ch)) falha("22023", M + "chave da nota inválida");
    if (cn != null && !/^\d{14}$/.test(cn)) falha("22023", M + "CNPJ inválido");
    if (nf != null && nf.length > 20) falha("22023", M + "número da nota longo demais");
    if (em != null && em.length > 160) falha("22023", M + "emitente longo demais");
    if (st != null && !["cancelamento_informado", "reembolso_informado"].includes(st)) falha("22023", M + "status não permitido (só cancelamento_informado ou reembolso_informado)");
    if ("divergencias" in comp && !["array", "null"].includes(jt(comp.divergencias))) falha("22023", M + "divergencias precisa ser uma lista");
    if (jt(comp.divergencias) === "array") {
      if (comp.divergencias.length > 20) falha("22023", M + "divergências demais (máximo 20 por vez)");
      comp.divergencias.forEach((e, i) => {
        const n = i + 1;
        if (jt(e) !== "object") falha("22023", M + `a divergência ${n} precisa ser um objeto`);
        for (const k of Object.keys(e)) if (!["campo", "texto"].includes(k)) falha("22023", M + `campo não permitido na divergência ${n}: ${k}`);
        if (jt(e.texto) !== "string" || e.texto.trim() === "" || e.texto.length > 300) falha("22023", M + `texto inválido na divergência ${n}`);
        if ("campo" in e && (jt(e.campo) !== "string" || e.campo.length > 40)) falha("22023", M + `campo inválido na divergência ${n}`);
      });
    }
    const r = gravar({ id }, null, pd, false);                      // o modo "só documentos"; também confere que a compra existe
    const c = S.compras.get(id);
    if (!c) falha("P0002", M + "compra não encontrada");
    const vazio = (v) => v == null || v === "";
    ch = vazio(c.chave_nfe) ? ch : null; nf = vazio(c.numero_nf) ? nf : null; em = vazio(c.emitente) ? em : null; cn = vazio(c.cnpj) ? cn : null; st = vazio(c.status) ? st : null;
    let novas = [];
    if (jt(comp.divergencias) === "array") {
      const vistos = new Set();
      novas = comp.divergencias.map((e, n) => ({ e, n })).filter(({ e }) => !c.divergencias.some((o) => o.texto === e.texto)).filter(({ e }) => !vistos.has(e.texto) && vistos.add(e.texto)).map(({ e }) => e);
      if (c.divergencias.length + novas.length > 100) falha("22023", M + "divergências demais nesta compra (máximo 100)");
    }
    const feitos = [];
    if (ch != null) feitos.push("chave_nfe"); if (nf != null) feitos.push("numero_nf"); if (em != null) feitos.push("emitente"); if (cn != null) feitos.push("cnpj"); if (st != null) feitos.push("status");
    if (novas.length) feitos.push("divergencias");
    if (feitos.length) {
      checar({ ...c, chave_nfe: ch ?? c.chave_nfe, cnpj: cn ?? c.cnpj, status: st ?? c.status });
      if (ch != null && [...S.compras.values()].some((o) => o.id !== id && o.chave_nfe === ch)) falha("23505", 'duplicate key value violates unique constraint "compras_online_nfe_unica"');
      c.chave_nfe = ch ?? c.chave_nfe; c.numero_nf = nf ?? c.numero_nf; c.emitente = em ?? c.emitente; c.cnpj = cn ?? c.cnpj; c.status = st ?? c.status;
      c.divergencias = c.divergencias.concat(novas); c.atualizado_em = "agora";
    }
    return { ...r, completados: feitos, divergencias_novas: novas.length };
  }

  // ---------- cada RPC é uma transação: qualquer erro desfaz TUDO ----------
  function transacao(fn) {
    const antes = { compras: new Map([...S.compras].map(([k, v]) => [k, clone(v)])), itens: S.itens.map(clone), docs: S.docs.map(clone) };
    try { return { data: fn() }; }
    catch (e) { S.compras = antes.compras; S.itens = antes.itens; S.docs = antes.docs; if (e.pg) return { error: { code: e.code, message: e.message } }; throw e; }
  }
  const RPCS = {
    compras_gravar: (a) => gravar(a.p_compra, a.p_itens, a.p_docs, a.p_novo),
    compras_gravar_com_foto: (a) => comFoto(a.p_compra, a.p_itens, a.p_docs, a.p_novo, a.p_foto ?? null),
    compras_anexar: (a) => anexar(a.p_id, a.p_docs, a.p_complemento),
  };

  // ---------- consultas (só leitura) ----------
  function exec(q) {
    if (op.falharConferencia && q.op === "select" && (q.tab === "compras_online_docs" || q.tab === "compras_online_itens") && q.filtros.some((f) => f[0] === "in")) return { error: { message: "consulta falhou" } };
    const filtra = (l) => { for (const [t, c, v] of q.filtros) l = l.filter((d) => t === "in" ? v.includes(d[c]) : d[c] === v && !(c === "sha256" && (op.ocultar || []).includes(v))); return l; };
    if (q.tab === "compras_online_docs" && q.op === "select") return { data: filtra(S.docs.slice()).map((d) => ({ id: d.id, path: d.path })) };
    if (q.tab === "compras_online_itens" && q.op === "select") return { data: filtra(S.itens.slice()).map((d) => ({ imagem_path: d.imagem_path })) };
    return { error: { message: "gravação direta não permitida neste teste: " + q.tab + "." + q.op } };
  }
  const consulta = (tab) => { const q = { tab, op: "select", filtros: [] };
    const api = { select() { return api; }, eq(c, v) { q.filtros.push(["eq", c, v]); return api; }, in(c, v) { q.filtros.push(["in", c, v]); return api; }, limit() { return api; },
      /* QUALQUER insert, update ou delete direto é registrado NA CHAMADA (mesmo que ninguém espere o resultado) e nunca funciona: a RPC é o único caminho de gravação */
      update() { q.op = "update"; S.proibidos.push(tab + ".update"); return api; }, insert() { q.op = "insert"; S.proibidos.push(tab + ".insert"); return api; }, delete() { q.op = "delete"; S.proibidos.push(tab + ".delete"); return api; },
      then(ok, err) { return Promise.resolve(exec(q)).then(ok, err); } };
    return api; };
  const sb = {
    storage: { from: () => ({
      upload(path, b) { if (op.falharUpload && op.falharUpload(path, S)) return Promise.resolve({ error: { message: "falhou o envio" } }); if (S.storage.has(path)) return Promise.resolve({ error: { message: "already exists" } }); S.storage.set(path, b); return Promise.resolve({ error: null }); },
      remove(paths) { S.remocoes.push(...paths); paths.forEach((p) => S.storage.delete(p)); return Promise.resolve({ data: paths, error: null }); } }) },
    from: consulta,
    rpc(nome, args) {
      S.rpc.push({ nome, args: clone(args) });
      return Promise.resolve().then(() => {
        if (op.rede === "antes") throw new TypeError("Failed to fetch");
        if (!RPCS[nome]) return { error: { code: "42883", message: "function public." + nome + " does not exist" } };
        const r = op.rpcErro ? { error: op.rpcErro.error } : transacao(() => RPCS[nome](args));
        if (op.rede === "depois" && !r.error) throw new TypeError("Failed to fetch");
        return r;
      });
    },
  };
  return { S, sb };
}

/** Uma fotografia comparável das tabelas (a mesma consulta é feita no Postgres de verdade, em tests/compras_035.test.mjs). */
export function fotografia(S) {
  return {
    compras: [...S.compras.values()].map((c) => ({ id: c.id, numero: c.numero, chave_nfe: c.chave_nfe ?? null, numero_nf: c.numero_nf ?? null, emitente: c.emitente ?? null, cnpj: c.cnpj ?? null, status: c.status ?? null,
      divergencias: c.divergencias, editada: c.atualizado_em != null, total_pago: +c.total_pago })).sort((a, b) => a.id < b.id ? -1 : 1),
    itens: S.itens.map((i) => ({ compra_id: i.compra_id, ordem: i.ordem, descricao: i.descricao, imagem_path: i.imagem_path ?? null })).sort((a, b) => (a.compra_id + a.ordem) < (b.compra_id + b.ordem) ? -1 : 1),
    docs: S.docs.map((d) => ({ compra_id: d.compra_id, tipo: d.tipo, path: d.path, sha256: d.sha256 })).sort((a, b) => a.path < b.path ? -1 : 1),
  };
}
