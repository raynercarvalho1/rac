// Central Fiscal, Lote 1.6 (docs/fiscal.md): gravar nota de FOTO ou PDF com a migration 037 — a parte do site (núcleo + js/fiscal.js).
// Sem rede, sem banco (o Postgres de verdade fica em tests/banco_foto_pdf_site.test.mjs) e SEM nenhuma chamada paga: Supabase, Storage, IA e pdf.js são objetos de teste.
// Notas, CNPJ, chaves e nomes são FICTÍCIOS.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { cpfDe, BASES } from "./fixtures/fiscal/cpf_casos.mjs";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const DONO = "11111111-1111-4111-8111-111111111111", CNPJ = "11222333000181", CPF = cpfDe(BASES.A);
const chaveDe = (tp = "1", n = "000000123") => { const b = "31" + "2611" + CNPJ + "65" + "001" + n + tp + "12345678"; return b + N.nfDvChave(b); };
const CHAVE = chaveDe();
const bytes = (...a) => a;
const JPG = bytes(0xFF, 0xD8, 0xFF, 0xE0), PDFB = bytes(...Array.from("%PDF-1.7").map((c) => c.charCodeAt(0)));
const IMG = { tipo: "image/jpeg", base64: "/9j/4AAQSkZJRgABAQ==" };
const resposta = (o = {}) => ({
  modelo: "65", emitente_nome: "MERCADO EXEMPLO LTDA", emitente_cnpj: CNPJ, emitente_uf: "MG", numero: "123", serie: "1", chave: CHAVE, data_emissao: "2026-11-06", hora_emissao: "10:30:00", protocolo: "131260000000001",
  situacao: "autorizada", total_produtos: 56.13, descontos: 2.13, frete: null, outras: null, impostos: 9.5, total: 54, valor_pago: 54,
  componentes: { seguro: null, st: null, fcp_st: null, ipi: null, ii: null, ipi_devol: null, deson: null }, pagamentos: [{ forma: "Cartão de crédito", valor: 54 }],
  itens: [
    { descricao: "BANANA PRATA", codigo: "001", qtd: 0.734, unidade: "KG", unitario: 6.99, total: 5.13, desconto: 0, incerto: false },
    { descricao: "AZEITE EXEMPLO", codigo: null, qtd: 2, unidade: "UN", unitario: 10, total: 20, desconto: 0, incerto: false },
    { descricao: "BOLACHA EXEMPLO", codigo: null, qtd: 3, unidade: "UN", unitario: 4, total: 12, desconto: 0, incerto: false },
    { descricao: "GASOLINA COMUM", codigo: null, qtd: 3.221, unidade: "L", unitario: 5.899, total: 19, desconto: 2.13, incerto: false }],
  confianca: 0.96, incertos: [], ...o });
const REAL = (res, id = "9a9a9a9a-0000-4000-8000-000000000001") => ({ ok: true, versao: 1, modo: "REAL", estado: "concluido", resultado: res, avisos: [], id, modelo: "claude-sonnet-5-5", consumo: { mes: { alerta: 0, percentual: 3 } } });

// ---------- o ambiente da tela: Supabase, Storage e IA de mentira (com uma "memória" para a leitura de volta) ----------
function ambiente(o = {}) {
  const ch = { ia: [], rpc: [], up: [], rem: [], sel: [], assinados: [], abertos: [] }, tab = JSON.parse(JSON.stringify(o.tab || {}));
  const consulta = (t) => { const f = []; const api = { select: () => api, eq: (c, v) => { f.push([c, v]); return api; }, order: () => api,
    limit: () => { ch.sel.push([t, f.slice()]); if (o.erroLer && o.erroLer(t)) return Promise.resolve({ error: { message: "leitura falhou em " + t } }); return Promise.resolve({ data: (tab[t] || []).filter((r) => f.every(([c, v]) => r[c] === v)) }); } }; return api; };
  const rpcPadrao = (nome, a) => {
    if (nome === "nota_fiscal_salvar_doc") {
      const p = a.p_proc, n = a.p_nota; const ja = (tab.tentativas = tab.tentativas || []).filter((t) => t.idem === p.idem)[0];
      if (ja) return { data: { id: ja.nota_id, criado: false, ja_existia: true, resultado: ja.resultado, tentativa_id: "t0", docs_para_apagar: a.p_docs.map((d) => d.path) } };
      tab.notas_fiscais = tab.notas_fiscais || []; tab.notas_fiscais_docs = tab.notas_fiscais_docs || [];
      const bloq = p.classe !== "consistente" || n.situacao === "cancelada" || n.situacao === "rejeitada" || (p.confianca < 0.9 && !p.revisada);
      const resultado = bloq ? "bloqueada" : n.situacao === "autorizada" ? "validada" : "pendente_fiscal";
      tab.tentativas.push({ idem: p.idem, resultado, nota_id: bloq ? null : n.id });
      if (bloq) return { data: { id: null, criado: false, bloqueada: true, resultado: "bloqueada", motivos: ["motivo do banco"], tentativa_id: "t1", docs_para_apagar: [] } };
      tab.notas_fiscais.push({ id: n.id, situacao: n.situacao, formato_origem: n.formato_origem, chave: n.chave }); a.p_docs.forEach((d) => tab.notas_fiscais_docs.push({ nota_id: n.id, sha256: d.sha256, id: d.sha256.slice(0, 6) }));
      return { data: { id: n.id, criado: true, resultado, classe: "consistente", tentativa_id: "t1", avisos: [], docs_para_apagar: [] } };
    }
    if (nome === "nota_fiscal_atualizar_situacao") { const nf = (tab.notas_fiscais || []).filter((x) => x.id === a.p_id)[0]; const de = nf.situacao; if (de === a.p_situacao) return { data: { id: a.p_id, sem_mudanca: true, situacao: de } }; nf.situacao = a.p_situacao; return { data: { id: a.p_id, sem_mudanca: false, de, para: a.p_situacao } }; }
    if (nome === "nota_fiscal_confirmar") {
      const f = (a.p_formato === "doc" ? rpcPadrao("nota_fiscal_salvar_doc", a) : { data: { id: a.p_nota.id, criado: true, avisos: [], docs_para_apagar: [] } }).data;
      const ok = f.id && (f.criado || f.ja_existia) && (a.p_formato === "xml" || f.resultado === "validada" || f.resultado === "pendente_fiscal");
      if (!ok) return { data: { gravada: false, fiscal: f, nota_id: f.id || null, entrada: null } };
      tab.notas_fiscais_entradas = tab.notas_fiscais_entradas || []; let e = tab.notas_fiscais_entradas.filter((x) => x.nota_id === f.id)[0], ja = !!e;
      if (!e) { e = { nota_id: f.id, estado: o.entradaEstado || "concluida", mercado_nota_id: o.entradaEstado === "falhou" ? null : "bbbbbbbb-0000-4000-8000-000000000001", confirmado_em: "2026-11-16T10:00:00Z", erro: o.entradaEstado === "falhou" ? "já existe no Mercado uma compra com o mesmo número, data e estabelecimento" : null }; tab.notas_fiscais_entradas.push(e);
        if (e.estado === "concluida") { (tab.notas = tab.notas || []).push({ id: e.mercado_nota_id, total: 54 }); (tab.itens = tab.itens || []).push({ id: "i1", nota_id: e.mercado_nota_id }, { id: "i2", nota_id: e.mercado_nota_id }); } }
      return { data: { gravada: true, fiscal: f, nota_id: f.id, entrada: { estado: e.estado, mercado_nota_id: e.mercado_nota_id, itens: 4, total: 54, produtos_novos: 3, confirmado_em: e.confirmado_em, erro: e.erro, avisos: [], ja_existia: ja && (e.estado === "concluida") } } };
    }
    if (nome === "nota_fiscal_entrada_mercado") {
      tab.notas_fiscais_entradas = tab.notas_fiscais_entradas || []; let e = tab.notas_fiscais_entradas.filter((x) => x.nota_id === a.p_nota_id)[0];
      if (e && (e.estado === "concluida" || e.estado === "ja_no_mercado")) return { data: { nota_id: a.p_nota_id, entrada: { estado: e.estado, mercado_nota_id: e.mercado_nota_id, ja_existia: true } } };
      if (!e && a.p_concordo !== true) return { error: { message: 'entrada no Mercado: confirme com "Estou de acordo" para esta nota', code: "22023" } };
      const id = "bbbbbbbb-0000-4000-8000-000000000001"; (tab.notas = tab.notas || []).push({ id, total: 21.89 }); (tab.itens = tab.itens || []).push({ id: "i1", nota_id: id }, { id: "i2", nota_id: id });
      if (!e) { e = { nota_id: a.p_nota_id, confirmado_em: "2026-11-16T10:00:00Z" }; tab.notas_fiscais_entradas.push(e); } e.estado = "concluida"; e.mercado_nota_id = id; e.erro = null;
      return { data: { nota_id: a.p_nota_id, entrada: { estado: "concluida", mercado_nota_id: id, itens: 2, total: 21.89, produtos_novos: 2, ja_existia: false, avisos: [] } } };
    }
    if (nome === "nota_fiscal_conferir") { const nf = (tab.notas_fiscais || []).filter((x) => x.id === a.p_id)[0]; nf.conferida_em = "2026-11-08T10:00:00Z"; return { data: { id: a.p_id } }; }
    return { data: {} };
  };
  const sb = { rpc: (nome, a) => { ch.rpc.push({ nome, args: a }); return Promise.resolve(o.rpc ? (o.rpc(nome, a, ch.rpc.filter((x) => x.nome === nome).length, rpcPadrao) ?? rpcPadrao(nome, a)) : rpcPadrao(nome, a)); },
    from: consulta, storage: { from: () => ({
      upload: (p, b, opt) => { ch.up.push({ p, opt, tamanho: b.size }); return Promise.resolve(o.upload ? o.upload(p, ch.up.length) : {}); },
      remove: (ps) => { ch.rem.push(ps); return Promise.resolve({}); },
      createSignedUrl: (p, s) => { ch.assinados.push([p, s]); return Promise.resolve(o.assinar ? o.assinar(p) : { data: { signedUrl: "https://exemplo.test/assinado?p=" + encodeURIComponent(p) } }); } }) } };
  const stub = (tag, attrs, ...kids) => { const n = { tag, attrs: attrs || {}, kids: [], text: (attrs && attrs.text) || "", value: "" }; n.appendChild = (k) => { n.kids.push(k); k && (k.parentNode = n); return k; }; n.replaceChild = (novo, velho) => { n.kids = n.kids.map((k) => (k === velho ? novo : k)); novo.parentNode = n; return velho; };
    kids.forEach((k) => { if (k != null) n.appendChild(typeof k === "string" ? { tag: "#t", attrs: {}, kids: [], text: k } : k); }); return n; };
  const pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: () => Promise.resolve({ getTextContent: () => Promise.resolve({ items: [{ str: "TOTAL 54,00" }] }), getViewport: ({ scale }) => ({ width: 600 * scale, height: 1200 * scale }), render: () => ({ promise: Promise.resolve() }) }) }) }) };
  const c = vm.createContext({ NUCLEO: N, SB: sb, DONO, crypto: globalThis.crypto, Blob, TextEncoder, Uint8Array, ArrayBuffer, Math, String, Array, JSON, Date, setTimeout: (f) => { f(); return 0; }, h: stub,
    isOwner: () => o.dono !== false, isDonoOuCasa: () => true, brl: (v) => "R$ " + Number(v).toFixed(2).replace(".", ","), dataBR: (d) => d, carregarScript: () => Promise.resolve(), window: { pdfjsLib, open: (u) => ch.abertos.push(u) },
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => ({}), toDataURL: () => "data:image/jpeg;base64,QUJD" }) }, iaFoto: () => Promise.resolve(IMG),
    racIA: (modulo, acao, entrada) => { ch.ia.push({ modulo, acao, entrada }); return Promise.resolve(o.ia || REAL(o.res || resposta())); } });
  vm.runInContext(ler("js/fiscal.js"), c);
  return { c, ch, tab };
}
let seq = 0;
const arq = (nome, cab, extra = "", tipo = "", tamanho) => { const u = Uint8Array.from(cab.concat(Array.from(extra + "#" + (++seq)).map((x) => x.charCodeAt(0)))); return { name: nome, size: tamanho ?? u.length, type: tipo, slice: (a, b) => ({ arrayBuffer: () => Promise.resolve(u.slice(a, b).buffer) }), arrayBuffer: () => Promise.resolve(u.buffer.slice(0)) }; };
const foto = (n = "nota.jpg") => arq(n, JPG, "foto", "image/jpeg"), pdf = (n = "nota.pdf") => arq(n, PDFB, " resto", "application/pdf");
const J = (v) => JSON.parse(JSON.stringify(v));
const texto = (n) => (n.textContent !== undefined ? n.textContent : n.text || "") + " " + (n.kids || []).map(texto).join(" ");
const achar = (n, f) => (f(n) ? [n] : []).concat(...(n.kids || []).map((k) => achar(k, f)));
const tick = async (k = 12) => { for (let i = 0; i < k * 4; i++) await new Promise((q) => setTimeout(q, 3)); };     // por tempo (e não só por voltas do laço): o SHA-256 do navegador de verdade roda em outra thread e sob carga demora mais
const ENT = N.nfEntradaPayload({ mercado: {}, itens: [] });
const acordo = (n) => achar(n, (x) => x.tag === "button" && /^Estou de acordo$/.test(x.attrs.text || ""));
const lerFoto = async (a, fs = [foto()]) => { const x = await a.c.fxIA(fs); assert.equal(x.estado, "lido", x.mensagem); return x.r; };
const N9 = "6a6a6a6a-0000-4000-8000-000000000009";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ================= núcleo: o payload que a RPC espera =================
const dados = (res = resposta(), fmt = "imagem") => { const ia = N.nfLerIA(res, fmt), nota = N.nfNormalizar(ia.lido); return { ia, nota, lido: ia.lido }; };
const ARQ = (n = 1) => ({ nome: "nota.jpg", mime: "image/jpeg", tamanho: 3000 + n, sha256: String(n).padStart(64, "a") });
const ID = "5f1c2d3e-4a5b-4c6d-8e7f-90a1b2c3d4e5", IDEM = "9a9a9a9a-0000-4000-8000-000000000042";
const montar = (o = {}, res, fmt) => { const d = dados(res, fmt); return N.nfParaGravarDoc(d.lido, d.nota, { id: ID, dono: DONO, idem: IDEM, tipo: fmt || "imagem", arquivos: [ARQ()], confianca: d.ia.confianca, revisada: false, incertos: d.ia.incertos, modelo_ia: "claude-sonnet-5-5", ia_uso_id: null, ...o }); };

test("nfParaGravarDoc: os nomes exatos dos campos da 037, sem CPF, formato_origem e requer_conferencia certos, caminho do original conforme a regra", () => {
  const g = montar(); assert.equal(g.ok, true, g.erros.join("|")); assert.equal(g.modo, "validada"); assert.equal(g.pode_nota, true);
  assert.deepEqual(Object.keys(g.args).sort(), ["p_docs", "p_itens", "p_nota", "p_proc"]);
  const n = g.args.p_nota; assert.equal(n.formato_origem, "imagem"); assert.equal(n.requer_conferencia, true); assert.equal(n.situacao, "autorizada"); assert.equal(n.protocolo, "131260000000001"); assert.equal(n.chave, CHAVE);
  const campos = ["id", "modelo", "chave", "numero", "serie", "data_emissao", "emitente_nome", "emitente_cnpj", "emitente_uf", "tp_emis", "situacao", "situacao_evidencia", "protocolo", "denegada", "valor_produtos", "valor_descontos", "valor_frete", "valor_outras", "valor_impostos", "valor_total", "valor_a_pagar", "pagamentos", "formato_origem", "requer_conferencia", "observacoes"];
  assert.deepEqual(Object.keys(n).sort(), campos.slice().sort(), "exatamente os campos que a função do banco aceita");
  assert.deepEqual(Object.keys(g.args.p_docs[0]).sort(), ["mime", "nome", "path", "sha256", "tipo", "tamanho"].sort());
  assert.equal(g.args.p_docs[0].path, `${DONO}/notas-fiscais/${ID}/${ARQ().sha256}.jpg`); assert.equal(g.args.p_docs[0].tipo, "imagem");
  assert.deepEqual(Object.keys(g.args.p_proc).sort(), ["classe", "componentes", "confianca", "diferenca", "idem", "incertos", "ia_uso_id", "modelo_ia", "motivos", "revisada"].sort());
  assert.deepEqual([g.args.p_proc.idem, g.args.p_proc.classe, g.args.p_proc.confianca, g.args.p_proc.revisada, g.args.p_proc.componentes, g.args.p_proc.diferenca], [IDEM, "consistente", 0.96, false, 0, 0]);
  assert.equal(g.args.p_itens.length, 4); assert.deepEqual(Object.keys(g.args.p_itens[0]).sort(), ["codigo", "desconto", "descricao", "qtd", "total", "unidade", "unidade_original", "unitario"].sort());
  assert.ok(!N.nfTemCpf(JSON.stringify(g.args)), "nenhum CPF no payload");
});
test("nfParaGravarDoc: PDF (1 arquivo, application/pdf, .pdf) e quatro fotos (jpg, png, webp); regras de quantidade, tipo, tamanho e repetição", () => {
  const p = montar({ tipo: "pdf", arquivos: [{ nome: "nota.pdf", mime: "application/pdf", tamanho: 5000, sha256: "b".repeat(64) }] }, resposta(), "pdf");
  assert.equal(p.ok, true, p.erros.join("|")); assert.equal(p.args.p_nota.formato_origem, "pdf"); assert.match(p.args.p_docs[0].path, /\.pdf$/); assert.equal(p.args.p_docs[0].tipo, "pdf");
  const q = montar({ arquivos: ["image/jpeg", "image/png", "image/webp", "image/jpeg"].map((m, i) => ({ nome: "f" + i, mime: m, tamanho: 4000 + i, sha256: String(i).repeat(64) })) });
  assert.equal(q.ok, true, q.erros.join("|")); assert.deepEqual(q.args.p_docs.map((d) => d.path.split(".").pop()), ["jpg", "png", "webp", "jpg"]);
  const ruins = [
    [{ arquivos: [] }, /1 a 4 fotos/], [{ arquivos: Array.from({ length: 5 }, (_, i) => ({ ...ARQ(i), sha256: String(i).repeat(64) })) }, /1 a 4 fotos/],
    [{ arquivos: [{ ...ARQ(), mime: "application/pdf" }] }, /tipo do arquivo/], [{ arquivos: [{ ...ARQ(), sha256: "xyz" }] }, /SHA-256/], [{ arquivos: [{ ...ARQ(), tamanho: 0 }] }, /Tamanho/],
    [{ arquivos: [{ ...ARQ(), tamanho: 13 * 1024 * 1024 }] }, /Tamanho/], [{ arquivos: [ARQ(), ARQ()] }, /duas vezes/], [{ id: "x" }, /identificador da nota/], [{ idem: "x" }, /identificador desta gravação/], [{ dono: "" }, /dono/]];
  for (const [o, re] of ruins) { const g = montar(o); assert.equal(g.ok, false, JSON.stringify(o).slice(0, 60)); assert.match(g.erros.join(" "), re); }
  assert.equal(montar({ tipo: "pdf", arquivos: [ARQ(1), { ...ARQ(2), mime: "application/pdf" }] }, resposta(), "pdf").ok, false, "PDF é um arquivo só");
});
test("nfParaGravarDoc: o modo prevê o que o banco decide (validada, pendente fiscal, bloqueada) sem nunca marcar conferida; a confiança da IA nunca muda o modo", () => {
  assert.equal(montar().modo, "validada");
  const pend = montar({}, resposta({ situacao: "contingencia", protocolo: null })); assert.equal(pend.modo, "pendente_fiscal"); assert.match(pend.avisos.join(" "), /sem validação oficial/); assert.equal(pend.args.p_nota.requer_conferencia, true);
  for (const [res, o, re] of [[resposta({ total: 60 }), {}, /conta/i], [resposta({ situacao: "cancelada" }), {}, /cancelada/i], [resposta({ situacao: "rejeitada", protocolo: null }), {}, /rejeitada/i], [resposta({ data_emissao: null }), {}, /data da nota/i]]) {
    const g = montar(o, res); assert.equal(g.modo, "bloqueada", JSON.stringify(Object.keys(res)).slice(0, 20)); assert.equal(g.pode_nota, false); assert.equal(g.ok, true, "a tentativa bloqueada ainda pode ser registrada: " + g.erros.join("|")); assert.match(g.args.p_proc.motivos.join(" "), re);
  }
  const rev = montar({ revisada: true }, resposta({ confianca: 0.7 })); assert.equal(rev.modo, "validada"); assert.deepEqual([rev.args.p_proc.confianca, rev.args.p_proc.revisada], [0.7, true], "o banco recebe a confiança real e a marca da confirmação humana");
  for (const c of [0.6, 0.62, 0.69, 0.7, 0.8, 0.9]) assert.equal(montar({ confianca: c }).modo, "validada", "confiança " + c);
  for (const c of [0.3, 0.59, undefined]) { const g = montar({ confianca: c }); assert.equal(g.modo, "bloqueada", "abaixo de 60% bloqueia: " + c); assert.equal(g.pode_nota, false); }
  assert.equal(montar({ confianca: undefined }).args.p_proc.confianca, 0, "sem confiança informada vai 0");
  const chave = montar({}, resposta({ chave: null })); assert.equal(chave.modo, "pendente_fiscal", "sem chave legível não bloqueia: vira pendente fiscal");
});
test("nfParaGravarDoc: a IA não aprova; conta com componentes (IPI, ST, desonerado) vai para o banco refazer; data absurda e CPF em texto não seguem", () => {
  const comp = montar({}, resposta({ total_produtos: 56.13, descontos: 2.13, total: 64, componentes: { seguro: null, st: 8, fcp_st: null, ipi: 2, ii: null, ipi_devol: null, deson: 0 }, valor_pago: 64 }));
  assert.equal(comp.modo, "validada"); assert.equal(comp.args.p_proc.componentes, 10); assert.equal(comp.args.p_proc.diferenca, 0);
  const deson = montar({}, resposta({ total: 50, componentes: { deson: 4 }, valor_pago: 50 })); assert.equal(deson.args.p_proc.componentes, -4);
  assert.equal(montar({}, resposta({ data_emissao: "1990-01-01" })).ok, false); assert.match(montar({}, resposta({ data_emissao: "2031-01-01" })).erros.join(" "), /data/);
  const cpf = montar({}, resposta({ emitente_nome: "LOJA " + CPF })); assert.equal(cpf.ok, false); assert.match(cpf.erros.join(" "), /CPF/);
  const nome = montar({ arquivos: [{ ...ARQ(), nome: "cupom " + CPF + ".jpg" }] }); assert.ok(!N.nfTemCpf(nome.args.p_docs[0].nome), "nome de arquivo com CPF é trocado");
  assert.equal(montar({ ia_uso_id: "nao-e-uuid" }).args.p_proc.ia_uso_id, null);
});
test("nfResultadoDoc: a resposta do banco vira estado e texto; só 'criado' com validada ou pendente fiscal conta como gravada", () => {
  const v = N.nfResultadoDoc({ id: ID, criado: true, resultado: "validada" }); assert.deepEqual([v.estado, v.gravada, v.id], ["validada", true, ID]); assert.match(v.texto, /Falta a sua conferência/);
  const p = N.nfResultadoDoc({ id: ID, criado: true, resultado: "pendente_fiscal" }); assert.deepEqual([p.estado, p.gravada], ["pendente_fiscal", true]); assert.match(p.texto, /sem validação oficial/);
  const b = N.nfResultadoDoc({ id: null, criado: false, bloqueada: true, resultado: "bloqueada", motivos: ["X"] }); assert.deepEqual([b.estado, b.gravada, b.id], ["bloqueada", false, null]); assert.match(b.texto, /NÃO foi criada.*auditoria.*X/);
  for (const m of ["chave", "arquivo", "id"]) { const d = N.nfResultadoDoc({ id: ID, criado: false, duplicada: m !== "id", ja_existia: m === "id", motivo: m, resultado: "duplicada" }); assert.deepEqual([d.estado, d.gravada, d.id], ["duplicada", false, ID], m); }
  const j = N.nfResultadoDoc({ id: ID, criado: false, ja_existia: true, resultado: "validada" }); assert.equal(j.gravada, true); assert.match(j.texto, /já tinha sido processada/);
  for (const x of [null, {}, { criado: true }, { criado: true, resultado: "bloqueada" }]) assert.equal(N.nfResultadoDoc(x).gravada, false, JSON.stringify(x));
});
test("nfAtualizarSituacao: transições do banco, protocolo para autorizar, evidência curta e sem CPF", () => {
  const ok = (nota, o) => N.nfAtualizarSituacao({ id: ID, situacao: nota }, o);
  const a = ok("pendente", { para: "autorizada", protocolo: "1312-6000-0000-001 ", evidencia: "lido do DANFE", fonte: "pdf" }); assert.equal(a.ok, true, a.erros.join("|")); assert.deepEqual(a.args, { p_id: ID, p_situacao: "autorizada", p_protocolo: "131260000000001", p_evidencia: "lido do DANFE", p_fonte: "pdf" });
  assert.equal(ok("contingencia", { para: "cancelada", fonte: "manual" }).ok, true); assert.equal(ok("pendente", { para: "rejeitada", fonte: "manual" }).ok, true); assert.equal(ok("autorizada", { para: "cancelada", fonte: "manual" }).ok, true);
  for (const [de, o, re] of [["pendente", { para: "autorizada", fonte: "foto" }, /protocolo de 15 dígitos/], ["pendente", { para: "autorizada", protocolo: "123", fonte: "foto" }, /protocolo/], ["autorizada", { para: "rejeitada", fonte: "foto" }, /não é permitido/],
    ["cancelada", { para: "autorizada", protocolo: "131260000000001", fonte: "foto" }, /não é permitido/], ["rejeitada", { para: "cancelada", fonte: "foto" }, /não é permitido/], ["pendente", { para: "pendente", fonte: "foto" }, /nova situação/],
    ["pendente", { para: "cancelada", fonte: "x" }, /Fonte/], ["pendente", { para: "cancelada", evidencia: "x".repeat(201), fonte: "foto" }, /200/], ["pendente", { para: "cancelada", evidencia: "CPF " + CPF, fonte: "foto" }, /CPF/]]) {
    const r = ok(de, o); assert.equal(r.ok, false, de + JSON.stringify(o)); assert.match(r.erros.join(" "), re);
  }
  assert.equal(N.nfAtualizarSituacao({ id: "x", situacao: "pendente" }, { para: "cancelada", fonte: "foto" }).ok, false);
});

// ================= a tela: gravar foto e PDF =================
test("salvar FOTO: original no cofre privado no caminho exato, uma chamada à função, confirmação só depois da leitura de volta; nada de despesa nem de conferência", async () => {
  const a = ambiente(), r = await lerFoto(a); assert.deepEqual([a.ch.rpc.length, a.ch.up.length], [0, 0], "a leitura não grava nem envia");
  const x = await a.c.fxSalvarDoc(r);
  assert.equal(x.estado, "validada", x.mensagem); assert.equal(x.gravada, true); assert.match(x.mensagem, /Nota gravada como validada.*Falta a sua conferência.*Conferido no banco: a nota e 1 documento foram lidos de volta/);
  assert.equal(a.ch.up.length, 1); assert.match(a.ch.up[0].p, new RegExp(`^${DONO}/notas-fiscais/${r.idNota}/[0-9a-f]{64}\\.jpg$`)); assert.deepEqual(J(a.ch.up[0].opt), { upsert: false, contentType: "image/jpeg" });
  assert.deepEqual(a.ch.rpc.map((q) => q.nome), ["nota_fiscal_salvar_doc"]); const args = a.ch.rpc[0].args; assert.equal(args.p_nota.id, r.idNota); assert.equal(args.p_docs[0].path, a.ch.up[0].p); assert.equal(args.p_proc.idem, r.idem);
  assert.ok(UUID.test(r.idem) && UUID.test(r.idNota)); assert.equal(args.p_proc.ia_uso_id, "9a9a9a9a-0000-4000-8000-000000000001"); assert.equal(args.p_proc.modelo_ia, "claude-sonnet-5-5");
  assert.ok(!("p_conferir" in args), "foto nunca é conferida na gravação"); assert.equal(a.tab.notas_fiscais[0].conferida_em, undefined);
  assert.equal(a.ch.rem.length, 0); assert.equal(r.gravado.gravada, true);
  assert.ok(a.ch.sel.some(([t]) => t === "notas_fiscais_docs") && a.ch.sel.some(([t, f]) => t === "notas_fiscais" && f[0][1] === r.idNota), "leu a nota e os documentos de volta");
});
test("salvar PDF: um arquivo application/pdf, extensão .pdf, formato pdf", async () => {
  const a = ambiente(), x0 = await a.c.fxIA([pdf()]); assert.equal(x0.estado, "lido", x0.mensagem);
  const x = await a.c.fxSalvarDoc(x0.r); assert.equal(x.estado, "validada", x.mensagem);
  assert.match(a.ch.up[0].p, /\.pdf$/); assert.equal(a.ch.up[0].opt.contentType, "application/pdf"); const n = a.ch.rpc[0].args; assert.equal(n.p_nota.formato_origem, "pdf"); assert.equal(n.p_docs[0].tipo, "pdf"); assert.equal(n.p_docs[0].mime, "application/pdf");
});
test("salvar QUATRO imagens da mesma nota: quatro originais, uma nota, uma chamada", async () => {
  const a = ambiente(), r = await lerFoto(a, [foto("a.jpg"), foto("b.jpg"), foto("c.jpg"), foto("d.jpg")]);
  const x = await a.c.fxSalvarDoc(r); assert.equal(x.estado, "validada", x.mensagem); assert.equal(a.ch.up.length, 4); assert.equal(new Set(a.ch.up.map((u) => u.p)).size, 4); assert.equal(a.ch.rpc.length, 1); assert.equal(a.ch.rpc[0].args.p_docs.length, 4);
  assert.match(x.mensagem, /4 documentos foram lidos de volta/);
});
test("nota pendente fiscal (contingência): 'Estou de acordo' grava como pendente fiscal e lança no Mercado; o texto diz que a SEFAZ não impede a entrada", async () => {
  const a = ambiente({ res: resposta({ situacao: "contingencia", protocolo: null }) }), r = await lerFoto(a);
  const bloco = a.c.fxBlocoConfirmar(r); await tick(); assert.equal(acordo(bloco).length, 1); assert.doesNotMatch(texto(bloco), /pendente/i, "nada de 'pendente' na tela (decisão do dono, 21/11/2026)"); assert.match(texto(bloco), /lança a compra no Mercado\. Não cria despesa/); assert.doesNotMatch(texto(bloco), /Registrar tentativa|Salvar como pendente/);
  const x = await a.c.fxSalvarDoc(r, ENT); assert.equal(x.estado, "concluida", x.mensagem); assert.match(x.mensagem, /Nota gravada na Central Fiscal \(contingência\) e lançada no Mercado: 4 itens, total R\$ 54,00\. 3 produtos novos\./);
  assert.equal(a.ch.rpc[0].nome, "nota_fiscal_confirmar"); assert.equal(a.ch.rpc[0].args.p_formato, "doc"); assert.equal(a.ch.rpc[0].args.p_nota.situacao, "contingencia"); assert.equal(a.ch.rpc[0].args.p_conferir, false, "foto nunca é conferida na gravação"); assert.deepEqual(J(a.ch.rpc[0].args.p_decisoes), J(ENT));
});
test("nota que não pode ser confirmada (conta divergente, cancelada, dado essencial ausente): sem botão, só o motivo e o caminho (outra foto ou o editor); não existe 'Registrar tentativa bloqueada'; nada é enviado nem gravado", async () => {
  for (const res of [resposta({ total: 60 }), resposta({ situacao: "cancelada" }), resposta({ data_emissao: null })]) {
    const a = ambiente({ res }), r = await lerFoto(a), bloco = a.c.fxBlocoConfirmar(r); await tick();
    assert.equal(acordo(bloco).length, 0, "sem 'Estou de acordo'"); assert.equal(achar(bloco, (n) => n.tag === "button").length, 0, "nenhum botão: nem de recusa, nem de registrar tentativa"); assert.match(texto(bloco), /Ainda não dá para confirmar.*Leia de novo com outra foto ou corrija os dados lidos no formulário acima.*Nada foi enviado nem gravado/);
    assert.deepEqual([a.ch.up.length, a.ch.rpc.length], [0, 0]);
  }
  const b = ambiente({ res: resposta({ data_emissao: null }) }), rb = await lerFoto(b); assert.match(texto(b.c.fxCartao(rb, false)), /Dados incompletos: Falta a data da nota/); assert.match(texto(b.c.fxCartao(rb, false)), /Gravação\s+Bloqueada: não pode ser confirmada/);
});
test("confiança mínima de 60%: de 60% a 96% o 'Estou de acordo' aparece (60–69% com aviso de baixa confiança); abaixo de 60% não aparece; nada é enviado antes do botão", async () => {
  for (const conf of [0.6, 0.62, 0.69, 0.7, 0.8, 0.9, 0.96]) {
    const a = ambiente({ res: resposta({ confianca: conf }) }), r = await lerFoto(a), bloco = a.c.fxBlocoConfirmar(r); await tick();
    assert.equal(acordo(bloco).length, 1, "confiança " + conf); assert.equal(acordo(bloco)[0].disabled, false); assert.doesNotMatch(texto(bloco), /Ainda não dá para confirmar/);
    assert.match(texto(a.c.fxCartao(r, false)), new RegExp("Confiança da leitura[^%]*" + Math.round(conf * 100) + "%")); assert.deepEqual([a.ch.up.length, a.ch.rpc.length], [0, 0], "antes do clique nada vai ao banco nem ao cofre");
    assert.equal(/confira todos os valores com o documento/i.test(texto(a.c.fxCartao(r, false))), conf < 0.7, "aviso só entre 60% e 69%: " + conf);
  }
  for (const conf of [0.59, 0.5, 0.3]) {
    const a = ambiente({ res: resposta({ confianca: conf }) }), r = await lerFoto(a), bloco = a.c.fxBlocoConfirmar(r); await tick();
    assert.equal(acordo(bloco).length, 0, "abaixo de 60% não confirma: " + conf); assert.match(texto(bloco) + texto(a.c.fxCartao(r, false)), /abaixo do mínimo de 60%/); assert.deepEqual([a.ch.up.length, a.ch.rpc.length], [0, 0]);
  }
});
test("foto com 80% de confiança e dados consistentes: um clique em 'Estou de acordo' grava e lança, enviando a confiança REAL (0,8) e a marca da confirmação humana; sem caixa 'Conferi'", async () => {
  const a = ambiente({ res: resposta({ confianca: 0.8 }) }), r = await lerFoto(a);
  const bloco = a.c.fxBlocoConfirmar(r); await tick(); assert.equal(acordo(bloco).length, 1); acordo(bloco)[0].onclick(); await tick(25);
  const args = a.ch.rpc[0].args; assert.equal(a.ch.rpc[0].nome, "nota_fiscal_confirmar"); assert.deepEqual([args.p_proc.revisada, args.p_proc.confianca], [true, 0.8], "o banco recebe a confiança real e a marca da confirmação humana"); assert.equal(r.confirmado.conf.ok, true);
  assert.equal(achar(a.c.fxCartao(r, false), (n) => n.tag === "input" && n.attrs.type === "checkbox").length, 0, "nenhuma caixa de conferência em lugar nenhum do cartão");
});
test("correção manual seguida de confirmação única: o editor corrige o total, o cartão é atualizado (conta passa a fechar), corrigir gera identificador novo e UM clique em 'Estou de acordo' grava e lança", async () => {
  const a = ambiente({ res: resposta({ total: 60, valor_pago: 60 }) }), r = await lerFoto(a);
  const b0 = a.c.fxBlocoConfirmar(r); await tick(); assert.equal(acordo(b0).length, 0, "a conta não fecha: sem botão");
  const cartao = a.c.fxCartao(r, false), ed = achar(cartao, (n) => n.tag === "details")[0], campo = (t) => achar(ed, (n) => n.tag === "input" && n.attrs["aria-label"] === t)[0];
  assert.equal(achar(ed, (n) => n.tag === "input" && n.attrs.type === "checkbox").length, 0, "o editor não tem caixa 'Conferi'");
  campo("Total da nota").value = "54,00"; campo("Total dos produtos").value = "56,13"; achar(ed, (n) => n.tag === "button" && /Aplicar correção/.test(n.attrs.text || ""))[0].onclick(); for (let i = 0; i < 30 && !r.ultimoCartao; i++) await new Promise((q) => setImmediate(q));
  assert.equal(r.idem, null, "correção = identificador novo na próxima gravação"); await tick(); assert.match(texto(r.ultimoCartao), /Conta dos itens\s+Consistente/); const bt = acordo(r.ultimoCartao); assert.equal(bt.length, 1, "com os dados válidos aparece o único botão");
  bt[0].onclick(); await tick(25); assert.deepEqual(a.ch.rpc.map((q) => q.nome), ["nota_fiscal_confirmar"]); assert.equal(a.ch.rpc[0].args.p_nota.valor_total, 54); assert.equal(r.confirmado.conf.ok, true);
});
test("idempotência: perda da resposta (rede caiu depois do commit) e nova tentativa NÃO grava duas vezes; o arquivo repetido é descartado só se não estiver registrado", async () => {
  let caiu = false; const a = ambiente({ rpc: (nome, args, n, padrao) => { const r = padrao(nome, args); if (!caiu) { caiu = true; return { error: { message: "Failed to fetch" } }; } return r; } }), r = await lerFoto(a);
  const e = await a.c.fxSalvarDoc(r); assert.equal(e.estado, "erro"); assert.match(e.mensagem, /Não gravei: Failed to fetch.*a mesma tentativa não grava duas vezes/); assert.equal(r.gravado, undefined, "nenhuma confirmação"); assert.equal(a.ch.rem.length, 1, "o que esta tentativa enviou é apagado (o banco recusa se estiver registrado)");
  const idem = r.idem; assert.ok(idem, "o identificador fica para a nova tentativa");
  const x = await a.c.fxSalvarDoc(r); assert.equal(r.idem, idem); assert.equal(x.estado, "ja_existia", x.mensagem); assert.equal(x.gravada, true); assert.match(x.mensagem, /já tinha sido gravada.*lida de volta com 1 documento.*Nada foi enviado de novo/);
  assert.equal(a.tab.notas_fiscais.length, 1, "uma nota só"); assert.equal(a.ch.up.length, 1, "nada foi reenviado"); assert.equal(a.ch.rpc.length, 1, "a função do banco não foi chamada de novo"); assert.equal(r.gravado.gravada, true);
  assert.doesNotMatch(x.mensagem, /duplicada/i);
});
test("falha no upload: nada vai à função do banco, nenhuma nota, o enviado antes é apagado (quatro fotos, a terceira falha); o botão volta a funcionar", async () => {
  const a = ambiente({ upload: (p, n) => (n === 3 ? { error: { message: "cota do cofre estourada", statusCode: "413" } } : {}) }), r = await lerFoto(a, [foto("a.jpg"), foto("b.jpg"), foto("c.jpg"), foto("d.jpg")]);
  const x = await a.c.fxSalvarDoc(r, ENT); assert.equal(x.estado, "erro"); assert.match(x.mensagem, /cota do cofre estourada.*Nenhuma nota foi criada/); assert.equal(a.ch.rpc.length, 0); assert.equal(a.tab.notas_fiscais, undefined);
  assert.equal(a.ch.up.length, 3, "parou no que falhou"); assert.deepEqual(J(a.ch.rem), [[a.ch.up[0].p, a.ch.up[1].p]], "só as duas que subiram nesta tentativa são apagadas");
  assert.equal(r.salvando, false, "dá para tentar de novo"); const b = a.c.fxBlocoConfirmar(r); await tick(); assert.equal(acordo(b).length, 1);
});
test("arquivo que já estava no cofre (409): segue sem apagar nada; erro de verdade no upload não segue", async () => {
  const a = ambiente({ upload: () => ({ error: { message: "The resource already exists", statusCode: "409" } }) }), r = await lerFoto(a); const x = await a.c.fxSalvarDoc(r); assert.equal(x.estado, "validada", x.mensagem); assert.equal(a.ch.rem.length, 0, "não apaga o que não enviou");
  const b = ambiente({ upload: () => ({ error: { message: "permissão negada" } }) }); const y = await b.c.fxSalvarDoc(await lerFoto(b)); assert.equal(y.estado, "erro"); assert.equal(b.ch.rpc.length, 0);
});
test("falha na função do banco: erro mostrado sem confirmação, o original desta tentativa apagado; permissão, MFA e migration 059 ausente têm mensagem própria; 40001 repete até 3 vezes", async () => {
  for (const [erro, re] of [[{ message: "x", code: "42501" }, /Sem permissão para gravar.*código de segurança/], [{ message: "Could not find the function public.nota_fiscal_confirmar(p_formato) in the schema cache", code: "PGRST202" }, /confirmação com entrada no Mercado ainda não está disponível.*059/], [{ message: "regra", code: "23514" }, /regra de segurança/], [{ message: "nota_fiscal_confirmar: confirme o código do app de segurança (MFA)", code: "42501" }, /Sem permissão/]]) {
    const a = ambiente({ rpc: () => ({ error: erro }) }), r = await lerFoto(a), x = await a.c.fxSalvarDoc(r, ENT);
    assert.equal(x.estado, "erro"); assert.match(x.mensagem, re); assert.equal(a.ch.rem.length, 1); assert.equal(a.ch.rpc.length, 1, "erro de permissão não repete"); assert.equal(r.gravado, undefined); assert.equal(x.confirmar, undefined, "nunca diz que lançou");
  }
  let n = 0; const b = ambiente({ rpc: (nome, args, k, padrao) => (++n <= 2 ? { error: { message: "serialização", code: "40001" } } : padrao(nome, args)) }); const y = await b.c.fxSalvarDoc(await lerFoto(b), ENT); assert.equal(y.estado, "concluida", y.mensagem); assert.equal(b.ch.rpc.length, 3);
  const z = ambiente({ rpc: () => ({ error: { message: "serialização", code: "40001" } }) }); const w = await z.c.fxSalvarDoc(await lerFoto(z), ENT); assert.equal(w.estado, "erro"); assert.equal(z.ch.rpc.length, 4, "1 + 3 repetições");
});
test("a resposta do banco manda: se a tela previa 'validada' e o banco devolveu bloqueada, a tela mostra bloqueada; se não confirma na leitura de volta, avisa", async () => {
  const a = ambiente({ rpc: () => ({ data: { id: null, criado: false, bloqueada: true, resultado: "bloqueada", motivos: ["O banco não aceitou"], docs_para_apagar: [] } }) }), r = await lerFoto(a); const x = await a.c.fxSalvarDoc(r);
  assert.equal(x.estado, "bloqueada"); assert.equal(x.gravada, false); assert.match(x.mensagem, /O banco não aceitou/);
  const b = ambiente({ rpc: (nome, args) => ({ data: { id: args.p_nota.id, criado: true, resultado: "validada", tentativa_id: "t", docs_para_apagar: [] } }) }), rb = await lerFoto(b); const y = await b.c.fxSalvarDoc(rb);
  assert.equal(y.estado, "validada"); assert.match(y.mensagem, /não consegui ler a nota de volta agora: confira na lista/); assert.doesNotMatch(y.mensagem, /Conferido no banco/);
  const c = ambiente({ rpc: () => ({ data: { id: null, criado: false } }) }); const z = await c.c.fxSalvarDoc(await lerFoto(c)); assert.notEqual(z.gravada, true); assert.match(z.mensagem, /inesperado/);
});
test("duplicidade: mesma chave ou mesmo arquivo (hash) NÃO cria nota nova e nada é enviado; possível duplicidade só avisa e segue; compra citando a chave só avisa", async () => {
  const a = ambiente({ tab: { notas_fiscais: [{ id: "n1", chave: CHAVE, situacao: "autorizada" }] } }), r = await lerFoto(a);
  const x = await a.c.fxSalvarDoc(r); assert.equal(x.estado, "duplicada"); assert.match(x.mensagem, /já está na Central Fiscal.*Nada foi enviado nem gravado/); assert.equal(x.id, "n1"); assert.deepEqual([a.ch.up.length, a.ch.rpc.length], [0, 0]);
  const f = foto("igual.jpg"); const buf = Buffer.from(await f.arrayBuffer()), sha = (await import("node:crypto")).createHash("sha256").update(buf).digest("hex");
  const b = ambiente({ res: resposta({ chave: chaveDe("1", "000000777"), numero: "777" }), tab: { notas_fiscais_docs: [{ nota_id: "n7", sha256: sha }], notas_fiscais: [{ id: "n7", chave: "outra", situacao: "autorizada" }] } }), rb = await lerFoto(b, [f]);
  const y = await b.c.fxSalvarDoc(rb); assert.equal(y.estado, "duplicada", y.mensagem); assert.deepEqual([b.ch.up.length, b.ch.rpc.length], [0, 0]); assert.equal(y.id, "n7");
  const p = ambiente({ tab: { notas_fiscais: [{ id: "n5", chave: "x", emitente_cnpj: CNPJ, data_emissao: "2026-11-06", valor_total: 54, situacao: "autorizada", numero: "9", serie: "1", modelo: "55" }], compras_online: [{ id: 3, chave_nfe: CHAVE, data: "2026-11-06" }] } }), rp = await lerFoto(p);
  const z = await p.c.fxSalvarDoc(rp); assert.equal(z.estado, "validada", z.mensagem); assert.match(z.mensagem + (z.avisos || []).join(" "), /Possível duplicidade|Compras online/); assert.equal(p.tab.notas_fiscais.length, 2, "a possível duplicidade não bloqueia nem apaga a outra");
});
test("duplicidade: se a conferência obrigatória (notas_fiscais ou arquivos) falhar, nada é enviado; a de Compras é melhor esforço", async () => {
  const a = ambiente({ erroLer: (t) => t === "notas_fiscais" }), x = await a.c.fxSalvarDoc(await lerFoto(a)); assert.equal(x.estado, "erro"); assert.deepEqual([a.ch.up.length, a.ch.rpc.length], [0, 0]);
  const b = ambiente({ erroLer: (t) => t === "notas_fiscais_docs" }), y = await b.c.fxSalvarDoc(await lerFoto(b)); assert.equal(y.estado, "erro"); assert.equal(b.ch.up.length, 0);
  const c = ambiente({ erroLer: (t) => t === "compras_online" || t === "pedidos" }), z = await c.c.fxSalvarDoc(await lerFoto(c)); assert.equal(z.estado, "validada", z.mensagem); assert.match((z.avisos || []).join(" "), /Não consegui conferir duplicidade com Compras online/);
});
test("nota já gravada como pendente e a leitura nova traz 'autorizada': oferece atualizar a situação (não cria nota); o botão chama a função do banco e só confirma depois da leitura de volta", async () => {
  const a = ambiente({ tab: { notas_fiscais: [{ id: N9, chave: CHAVE, situacao: "contingencia", formato_origem: "imagem" }] } }), r = await lerFoto(a);
  const x = await a.c.fxSalvarDoc(r, ENT); assert.equal(x.estado, "duplicada"); assert.deepEqual(J(x.atualizar), { id: N9, de: "contingencia", para: "autorizada" }); assert.equal(a.ch.up.length, 0); assert.equal(a.ch.rpc.length, 0, "nada gravado nem confirmado");
  const bloco = a.c.fxBlocoConfirmar(r); await tick(); assert.equal(acordo(bloco).length === 1 && acordo(bloco)[0].hidden === true || acordo(bloco).length === 0, true, "sem 'Estou de acordo' para nota duplicada");
  const b = achar(bloco, (n) => n.tag === "button" && /Atualizar a nota já gravada: Contingência → Autorizada/.test(n.attrs.text || ""))[0]; assert.ok(b);
  b.onclick(); for (let i = 0; i < 30 && !a.ch.rpc.length; i++) await new Promise((q) => setImmediate(q));
  await tick(); assert.deepEqual(J(a.ch.rpc.at(-1)), { nome: "nota_fiscal_atualizar_situacao", args: { p_id: N9, p_situacao: "autorizada", p_protocolo: "131260000000001", p_evidencia: "lido de foto", p_fonte: "foto" } }); assert.equal(a.tab.notas_fiscais[0].situacao, "autorizada");
});
test("atualizar situação: sucesso só depois de o banco confirmar e a nota ser relida; transição inválida e protocolo ausente nem chamam o banco; erro do banco aparece", async () => {
  const a = ambiente({ tab: { notas_fiscais: [{ id: ID, situacao: "pendente" }] } });
  const bad = await a.c.fxAtualizarSituacao({ id: ID, situacao: "pendente" }, { para: "autorizada", protocolo: "", fonte: "manual" }); assert.equal(bad.estado, "invalido"); assert.match(bad.mensagem, /protocolo/); assert.equal(a.ch.rpc.length, 0);
  const inv = await a.c.fxAtualizarSituacao({ id: ID, situacao: "autorizada" }, { para: "rejeitada", fonte: "manual" }); assert.equal(inv.estado, "invalido"); assert.equal(a.ch.rpc.length, 0);
  const ok = await a.c.fxAtualizarSituacao({ id: ID, situacao: "pendente" }, { para: "autorizada", protocolo: "131260000000001", evidencia: "DANFE", fonte: "pdf" }); assert.equal(ok.estado, "atualizada"); assert.match(ok.mensagem, /Pendente → Autorizada.*histórico foi registrado/); assert.equal(a.ch.rpc.length, 1);
  const igual = await a.c.fxAtualizarSituacao({ id: ID, situacao: "pendente" }, { para: "autorizada", protocolo: "131260000000001", fonte: "pdf" }); assert.equal(igual.estado, "sem_mudanca");
  const e = ambiente({ rpc: () => ({ error: { message: "de autorizada para pendente não é permitido", code: "22023" } }), tab: { notas_fiscais: [{ id: ID, situacao: "pendente" }] } }); const r = await e.c.fxAtualizarSituacao({ id: ID, situacao: "pendente" }, { para: "cancelada", fonte: "manual" }); assert.equal(r.estado, "erro"); assert.match(r.mensagem, /Não atualizei/);
  const m = ambiente({ rpc: () => ({ error: { message: "confirme o código (MFA)", code: "42501" } }), tab: { notas_fiscais: [{ id: ID, situacao: "pendente" }] } }); assert.match((await m.c.fxAtualizarSituacao({ id: ID, situacao: "pendente" }, { para: "cancelada", fonte: "manual" })).mensagem, /Sem permissão/);
  const n = ambiente({ rpc: () => ({ data: { id: ID, sem_mudanca: false } }), tab: { notas_fiscais: [{ id: ID, situacao: "pendente" }] } }); const nn = await n.c.fxAtualizarSituacao({ id: ID, situacao: "pendente" }, { para: "cancelada", fonte: "manual" }); assert.equal(nn.estado, "incerto", "o banco disse que atualizou mas a nota continua pendente: não confirma");
});

// ================= a lista: notas, histórico, tentativas, original, Fernanda =================
const NOTAS = [
  { id: "a1", emitente_nome: "MERCADO A", valor_total: 54, data_emissao: "2026-11-06", situacao: "autorizada", formato_origem: "imagem", requer_conferencia: true, conferida_em: null, chave: CHAVE, protocolo: "131260000000001" },
  { id: "a2", emitente_nome: "LOJA B", valor_total: 10, data_emissao: "2026-11-05", situacao: "contingencia", formato_origem: "pdf", requer_conferencia: true, conferida_em: null },
  { id: "a3", emitente_nome: "LOJA C", valor_total: 7, data_emissao: "2026-11-04", situacao: "cancelada", formato_origem: "xml", requer_conferencia: false, conferida_em: "2026-11-04T10:00:00Z" },
  { id: "a4", emitente_nome: "LOJA D", valor_total: 9, data_emissao: "2026-11-03", situacao: "autorizada", formato_origem: "imagem", requer_conferencia: true, conferida_em: "2026-11-04T10:00:00Z" }];
const TENT = [{ id: "t1", nota_id: "a1", origem: "foto", resultado: "validada", classe: "consistente", situacao_fiscal: "autorizada", confianca: 0.96, revisada: false, motivos: [], docs: [], criado_em: "2026-11-06T10:00:00Z" },
  { id: "t2", nota_id: null, origem: "pdf", resultado: "bloqueada", classe: "divergente", situacao_fiscal: "autorizada", confianca: 0.95, revisada: false, motivos: ["A conta dos itens difere do total fiscal em 6.00 a menos."], docs: [{ nome: "x.pdf", path: DONO + "/notas-fiscais/zz/" + "c".repeat(64) + ".pdf", tamanho: 2048 }], criado_em: "2026-11-06T11:00:00Z" }];
const HIST = [{ nota_id: "a2", de: null, para: "contingencia", protocolo: null, evidencia: null, origem: "gravacao", fonte: "pdf", criado_em: "2026-11-05T09:00:00Z" }];
const aberta = async (a, id) => { const painel = a.c.fxListaPainel(); await new Promise((q) => setImmediate(q)); await new Promise((q) => setImmediate(q)); const det = achar(painel, (n) => n.tag === "details"); return { painel, det }; };
test("lista de notas (silenciosa): só aparece o que precisa de você; os quatro estados (leitura, confirmação, situação fiscal, Mercado) ficam no detalhe; abrir a nota mostra o original (link temporário), o histórico e as tentativas; tentativa bloqueada sem nota aparece à parte", async () => {
  const a = ambiente({ tab: { notas_fiscais: NOTAS, notas_fiscais_tentativas: TENT, notas_fiscais_situacoes: HIST, notas_fiscais_docs: [{ nota_id: "a2", id: "d2", nome: "loja.pdf", path: DONO + "/notas-fiscais/a2/" + "d".repeat(64) + ".pdf", tamanho: 5000 }, { nota_id: "a1", id: "d1", nome: "mercado.jpg", path: DONO + "/notas-fiscais/a1/" + "e".repeat(64) + ".jpg", tamanho: 3000 }] } });
  const { painel, det } = await aberta(a); const t = texto(painel);
  assert.equal(det.length, 4); assert.match(t, /MERCADO A.*Não lançada no Mercado/); assert.match(t, /LOJA B.*Não lançada no Mercado/); assert.match(t, /LOJA C.*Cancelada/); assert.doesNotMatch(t.split("Tentativas sem nota")[0], /Foto|PDF|XML|Sem confirmação|Autorizada|Contingência|Conferida|Não lançada \(cancelada\)/, "lista silenciosa (decisão do dono, 21/11/2026): sem etiquetas de rotina; os quatro estados ficam no detalhe"); assert.match(t, /LOJA D/); assert.doesNotMatch(t.split("LOJA D")[1].split("Tentativas sem nota")[0], /Conferida|Autorizada/, "nota normal, sem etiqueta");
  assert.doesNotMatch(t, /ainda não estão lançadas no Mercado|ainda não está lançada no Mercado/, "o aviso de notas não lançadas saiu da tela (decisão do dono, 21/11/2026); cada nota segue mostrando o seu estado");
  assert.match(t, /Tentativas sem nota \(bloqueadas ou duplicadas\): 1/); assert.match(t, /conta divergente.*A conta dos itens difere do total fiscal/);
  det[1].open = true; det[1].ontoggle(); for (let i = 0; i < 8; i++) await new Promise((q) => setImmediate(q));
  const d2 = texto(det[1]); assert.match(d2, /Abrir original: loja\.pdf \(5 KB\)/); assert.match(d2, /Histórico da situação fiscal/); assert.match(d2, /gravada como Contingência.*gravacao \(pdf\)/); assert.match(d2, /Atualizar a situação fiscal/);
  const abrir = achar(det[1], (n) => n.tag === "button" && /Abrir original/.test(n.attrs.text || ""))[0]; abrir.onclick(); for (let i = 0; i < 6; i++) await new Promise((q) => setImmediate(q));
  assert.deepEqual(a.ch.assinados, [[DONO + "/notas-fiscais/a2/" + "d".repeat(64) + ".pdf", 300]], "link assinado de 5 minutos, nunca público"); assert.match(a.ch.abertos[0], /^https:\/\/exemplo\.test\/assinado/);
  det[0].open = true; det[0].ontoggle(); for (let i = 0; i < 8; i++) await new Promise((q) => setImmediate(q)); const d1 = texto(det[0]); assert.match(d1, /Tentativas de leitura/); assert.match(d1, /validada · conta consistente · confiança 96%/); assert.match(d1, /Conferência/);
});
test("conferir uma nota autorizada de foto: botão simples (sem caixa 'Conferi'), pela função existente; nota pendente não tem conferência; a atualização de situação lista só as transições permitidas", async () => {
  const a = ambiente({ tab: { notas_fiscais: NOTAS, notas_fiscais_tentativas: TENT, notas_fiscais_situacoes: HIST, notas_fiscais_docs: [] } }); const { det } = await aberta(a);
  det[0].open = true; det[0].ontoggle(); for (let i = 0; i < 8; i++) await new Promise((q) => setImmediate(q));
  const cb = achar(det[0], (n) => n.tag === "button" && /Marcar como conferida/.test(n.attrs.text || ""))[0];
  assert.equal(achar(det[0], (n) => n.tag === "input" && n.attrs.type === "checkbox").length, 0, "nenhuma caixa 'Conferi'"); assert.match(texto(det[0]), /A nota já foi confirmada com “Estou de acordo”/); cb.onclick(); for (let i = 0; i < 8; i++) await new Promise((q) => setImmediate(q)); assert.deepEqual(a.ch.rpc.map((q) => q.nome), ["nota_fiscal_conferir"]);
  const opts = (d) => achar(d, (n) => n.tag === "option").map((o) => o.attrs.value);
  assert.deepEqual(opts(det[0]), ["cancelada"], "autorizada só pode ser cancelada");
  det[1].open = true; det[1].ontoggle(); for (let i = 0; i < 8; i++) await new Promise((q) => setImmediate(q)); assert.deepEqual(opts(det[1]), ["autorizada", "cancelada", "rejeitada"]); assert.equal(achar(det[1], (n) => n.tag === "button" && /Marcar como conferida/.test(n.attrs.text || "")).length, 0, "pendente fiscal não se confere");
  det[2].open = true; det[2].ontoggle(); for (let i = 0; i < 8; i++) await new Promise((q) => setImmediate(q)); assert.deepEqual(opts(det[2]), [], "cancelada não muda mais");
});
test("Fernanda (papel casa) recebe a MESMA tela do dono (16/11/2026): lista de notas, tentativas, histórico, ações e leitura por IA; o banco e a função decidem o que vale", async () => {
  const dados = (dono) => ambiente({ dono, tab: { notas_fiscais: NOTAS, notas_fiscais_tentativas: TENT, notas_fiscais_situacoes: HIST, notas_fiscais_docs: [{ nota_id: "a1", id: "d1", nome: "m.jpg", path: DONO + "/notas-fiscais/a1/" + "e".repeat(64) + ".jpg", tamanho: 1024 }] } });
  const a = dados(false), b = dados(true);
  const ra = await aberta(a), rb = await aberta(b); assert.equal(ra.det.length, 4);
  assert.ok(a.ch.sel.some(([t]) => t === "notas_fiscais_tentativas"), "ela também lê as tentativas (o banco 057 deixa)"); assert.match(texto(ra.painel), /Tentativas sem nota/);
  ra.det[0].open = true; ra.det[0].ontoggle(); for (let i = 0; i < 8; i++) await new Promise((q) => setImmediate(q));
  rb.det[0].open = true; rb.det[0].ontoggle(); for (let i = 0; i < 8; i++) await new Promise((q) => setImmediate(q));
  const t = texto(ra.det[0]); assert.match(t, /Abrir original: m\.jpg/); assert.match(t, /Histórico|Tentativas de leitura/); assert.match(t, /Atualizar a situação|Marcar como conferida/);
  assert.equal(t, texto(rb.det[0]), "o detalhe da nota é idêntico para a casa e para o dono");
  assert.ok(a.ch.sel.some(([t2]) => t2 === "notas_fiscais_situacoes"));
  const fonte = ler("js/fiscal.js"); assert.match(fonte, /casa=typeof isDonoOuCasa==="function"&&isDonoOuCasa\(\)/); assert.match(fonte, /accept:casa\?"\.xml,text\/xml,application\/xml,image\/jpeg,image\/png,image\/webp,application\/pdf,\.pdf"/, "foto e PDF (IA) são do dono e da casa");
  assert.match(fonte, /if\(casa\)root\.appendChild\(fxListaPainel\(\)\)/, "a lista de notas gravadas é do dono e da casa");
  const f = ambiente({ dono: false }); const raiz = { innerHTML: "", kids: [], appendChild(k) { this.kids.push(k); return k; } };
  f.c.$ = () => raiz; f.c.panel = (t) => f.c.h("div", { class: "panel" }); f.c.loading = () => f.c.h("div"); f.c.failed = () => f.c.h("div"); f.c.logErro = () => {};
  vm.runInContext("renderFiscal()", f.c); assert.equal(raiz.kids.length, 4, "a Fernanda recebe o painel de envio, o cartão \"Tenho só a chave\" (21/11/2026), a área de resultado e a lista de notas gravadas");
  const o = ambiente({ dono: true }); const raizO = { innerHTML: "", kids: [], appendChild(k) { this.kids.push(k); return k; } }; o.c.$ = () => raizO; o.c.panel = (t) => o.c.h("div", { class: "panel" }); o.c.loading = () => o.c.h("div"); o.c.failed = () => o.c.h("div"); o.c.logErro = () => {};
  vm.runInContext("renderFiscal()", o.c); assert.equal(raizO.kids.length, 4, "o dono recebe os mesmos quatro blocos");
});
test("lista: erro ao ler as notas aparece como erro (não como lista vazia); tentativas ilegíveis avisam o dono", async () => {
  const a = ambiente({ erroLer: (t) => t === "notas_fiscais" }); const p = a.c.fxListaPainel(); for (let i = 0; i < 6; i++) await new Promise((q) => setImmediate(q)); assert.match(texto(p), /Não consegui ler as notas: leitura falhou em notas_fiscais/); assert.doesNotMatch(texto(p), /Nenhuma nota gravada/);
  const b = ambiente({ erroLer: (t) => t === "notas_fiscais_tentativas", tab: { notas_fiscais: NOTAS } }); const q2 = b.c.fxListaPainel(); for (let i = 0; i < 6; i++) await new Promise((q) => setImmediate(q)); assert.match(texto(q2), /Não consegui ler as tentativas de leitura agora/); assert.equal(achar(q2, (n) => n.tag === "details").length, 4);
  const v = ambiente({ tab: { notas_fiscais: [] } }); const pv = v.c.fxListaPainel(); for (let i = 0; i < 6; i++) await new Promise((q) => setImmediate(q)); assert.match(texto(pv), /Nenhuma nota gravada ainda/);
});

// ================= escopo e segurança do código =================
test("escopo: só as funções aprovadas (a confirmação única, a entrada, a situação e as de gravação), só o cofre familia, nada de despesa, de Mercado/Financeiro, de escrita direta nem de conferência automática", () => {
  const js = ler("js/fiscal.js").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.deepEqual([...new Set([...js.matchAll(/fxRpc\("([a-z_]+)"/g)].map((m) => m[1]))].sort(), ["nota_fiscal_atualizar_situacao", "nota_fiscal_confirmar", "nota_fiscal_conferir", "nota_fiscal_entrada_mercado", "nota_fiscal_salvar", "nota_fiscal_salvar_doc"].sort());
  assert.equal([...js.matchAll(/SB\.from\(/g)].length, 1, "uma única porta de leitura"); assert.ok(!/\.insert\(|\.update\(|\.upsert\(|\.delete\(|criar_despesa|gera_despesa\s*[:=]\s*true/.test(js));
  assert.equal([...js.matchAll(/SB\.storage\.from\("([a-z]+)"\)/g)].every((m) => m[1] === "familia"), true);
  const doc = js.slice(js.indexOf("function fxSalvarDoc("), js.indexOf("function fxAtualizarSituacao(")); assert.ok(doc.length > 1500); assert.ok(!/p_conferir|conferir:\s*true|fxConferir/.test(doc), "salvar foto/PDF nunca confere");
  assert.ok(!/\bremove\(|\.remove\b/.test(doc.replace(/fxLimpar/g, "")), "a limpeza passa só por fxLimpar (arquivos sem registro)");
  assert.ok(!/createSignedUrl\([^)]*,\s*(?:[4-9]\d\d|\d{4,})\)/.test(js), "link do original dura no máximo 5 minutos");
  const nuc = ler("nucleo.js"); assert.ok(!/nfParaGravarDoc[\s\S]{0,6000}(SB\.|document\.|window\.)/.test(nuc.slice(nuc.indexOf("function nfParaGravarDoc"), nuc.indexOf("function nfParaGravarDoc") + 9000)), "o núcleo não fala com tela nem banco");
});
test("hora das tentativas e do histórico: o banco guarda em UTC e a tela mostra no horário do aparelho", () => {
  const { c } = ambiente(), d = new Date("2026-11-08T14:31:00Z"), p = (n) => ("0" + n).slice(-2);
  assert.equal(c.fxFmtDH("2026-11-08T14:31:00Z"), `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`);
  assert.equal(c.fxFmtDH(""), ""); assert.match(c.fxFmtDH("lixo"), /lixo|NaN|^\S*\s*$/);
});

// ================= Lote 1.6 · gravar sem chave (pedido do dono, migration 039) =================
test("sem chave legível: não bloqueia (a chave não é indispensável para registrar a compra); entra SEMPRE como pendente fiscal (situação gravada 'pendente'), nunca validada, sem precisar de 'revisão'", () => {
  const sem = resposta({ chave: null });
  for (const o of [{}, { revisada: true, confianca: 0.62 }, { confianca: 0.62 }]) {
    const g = montar(o, sem);
    assert.equal(g.ok, true, g.erros.join("|")); assert.equal(g.modo, "pendente_fiscal"); assert.equal(g.pode_nota, true); assert.equal(g.veredito.sem_chave, true); assert.equal(g.veredito.gravar_validada, false);
    assert.equal(g.args.p_nota.chave, null); assert.equal(g.args.p_nota.situacao, "pendente", "autorizada sem chave não se prova: grava pendente"); assert.equal(g.args.p_nota.requer_conferencia, true);
    assert.match(g.veredito.avisos.join(" "), /chave de acesso não está impressa ou legível.*sem validação oficial/i); assert.equal(g.args.p_proc.classe, "consistente");
  }
  assert.equal(montar({}, resposta({ chave: null, situacao: "contingencia", protocolo: null })).args.p_nota.situacao, "contingencia", "contingência continua contingência");
  for (const res of [resposta({ chave: null, situacao: "cancelada" }), resposta({ chave: null, total: 60 }), resposta({ chave: null, data_emissao: null })]) assert.equal(montar({}, res).modo, "bloqueada", "cancelada, conta errada e dado essencial ausente continuam bloqueando");
  const inval = montar({}, resposta({ chave: CHAVE.slice(0, 43) + ((+CHAVE[43] + 1) % 10) })); assert.equal(inval.modo, "pendente_fiscal"); assert.equal(inval.args.p_nota.chave, null, "chave lida que não passa na validação não é enviada"); assert.match(inval.veredito.avisos.join(" "), /não passou na validação e não será usada/);
  assert.equal(montar({}, resposta()).modo, "validada", "com chave válida nada mudou");
  const xml = N.nfDecisaoGravacao({ ...dados().nota, formato: "xml", chave: null, chave_valida: false }, null, {});
  assert.equal(xml.modo, "bloqueada", "XML sem chave válida continua inválido");
});
test("sem chave na tela: a IA com chave ilegível e 62% de confiança NÃO fica bloqueada (acima do mínimo de 60%); um clique em 'Estou de acordo' grava como pendente fiscal (sem conferir) e lança no Mercado", async () => {
  const a = ambiente({ res: resposta({ chave: null, confianca: 0.62, incertos: [{ campo: "chave", motivo: "borrada" }] }) }), r = await lerFoto(a);
  const t = texto(a.c.fxCartao(r, false)); assert.match(t, /Gravação\s+Pode ser gravada sem validação oficial; a compra entra no Mercado normalmente/); assert.match(t, /Chave de acesso: ilegível na leitura \(borrada\)/); assert.match(t, /chave de acesso não está impressa ou legível/); assert.doesNotMatch(t, /Dados incompletos/);
  const bloco = a.c.fxBlocoConfirmar(r); await tick(); const bt = acordo(bloco); assert.equal(bt.length, 1, "sem revisão e sem caixa: o botão aparece"); bt[0].onclick(); await tick(25);
  const args = a.ch.rpc[0].args; assert.equal(a.ch.rpc[0].nome, "nota_fiscal_confirmar"); assert.equal(args.p_nota.chave, null); assert.equal(args.p_nota.situacao, "pendente"); assert.deepEqual([args.p_proc.revisada, args.p_proc.confianca], [true, 0.62]); assert.equal(args.p_conferir, false);
  assert.equal(r.confirmado.conf.estado, "concluida");
});
// ================= Confirmação única (migration 059): "Estou de acordo" grava a nota e lança no Mercado =================
const NP = { id: "7a7a7a7a-0000-4000-8000-000000000001", emitente_nome: "TAUSTE SUPERMERCADOS LTDA", emitente_cnpj: CNPJ, valor_total: 21.89, data_emissao: "2026-11-05", situacao: "contingencia", formato_origem: "imagem", requer_conferencia: true, conferida_em: null, chave: null, protocolo: null };
test("fxEntradaMercado (Tentar de novo): retoma o que já foi confirmado SEM nova confirmação; só diz 'lançada' depois de ler a compra de volta; nota antiga exige o 'Estou de acordo' dela e as decisões", async () => {
  const a = ambiente({ tab: { notas_fiscais: [NP], notas_fiscais_entradas: [{ nota_id: NP.id, estado: "falhou", confirmado_em: "2026-11-16T09:00:00Z", erro: "já existe no Mercado uma compra" }] } });
  const x = await a.c.fxEntradaMercado(NP.id, NP); assert.equal(x.estado, "concluida", x.texto); assert.match(x.texto, /Nota gravada na Central Fiscal \(contingência\) e lançada no Mercado: 2 itens, total R\$ 21,89/); assert.match(x.confirmacao, /Conferido no banco: a compra e 2 itens foram lidos de volta/);
  assert.deepEqual(J(a.ch.rpc), [{ nome: "nota_fiscal_entrada_mercado", args: { p_nota_id: NP.id } }], "só o id: nenhuma confirmação nova, nenhuma decisão nova"); assert.ok(a.ch.sel.some(([t]) => t === "notas") && a.ch.sel.some(([t]) => t === "itens"));
  const y = await a.c.fxEntradaMercado(NP.id, NP); assert.equal(y.estado, "concluida"); assert.match(y.texto, /já estava lançada no Mercado: nada foi criado de novo/); assert.equal((a.tab.notas || []).length, 1, "clicar de novo não duplica");
  const b = ambiente({ tab: { notas_fiscais: [NP] } }); const sem = await b.c.fxEntradaMercado(NP.id, NP); assert.equal(sem.estado, "erro"); assert.match(sem.texto, /Não concluí a entrada no Mercado.*Estou de acordo/);
  const c = await b.c.fxEntradaMercado(NP.id, NP, ENT); assert.equal(c.estado, "concluida", c.texto); assert.deepEqual(J(b.ch.rpc.at(-1).args), { p_nota_id: NP.id, p_concordo: true, p_decisoes: J(ENT) });
});
test("fxEntradaMercado: já estava no Mercado, resposta inesperada, erro de permissão, 059 ausente e nota cancelada aparecem como estado próprio ou erro, nunca como 'lançada' sem o banco confirmar", async () => {
  const d = ambiente({ rpc: () => ({ data: { nota_id: NP.id, entrada: { estado: "ja_no_mercado", mercado_nota_id: "m9" } } }) }); const rd = await d.c.fxEntradaMercado(NP.id, NP); assert.equal(rd.estado, "ja_no_mercado"); assert.match(rd.texto, /já estava no Mercado/);
  const i = ambiente({ rpc: () => ({ data: { criado: false } }) }); const r = await i.c.fxEntradaMercado(NP.id, NP); assert.equal(r.estado, "erro"); assert.match(r.texto, /inesperado/);
  const p = ambiente({ rpc: () => ({ error: { message: "confirme o código (MFA)", code: "42501" } }) }); const rp = await p.c.fxEntradaMercado(NP.id, NP); assert.equal(rp.estado, "erro"); assert.match(rp.texto, /Não concluí a entrada no Mercado: Sem permissão/);
  const g = ambiente({ rpc: () => ({ error: { message: "Could not find the function public.nota_fiscal_entrada_mercado(uuid) in the schema cache", code: "PGRST202" } }) }); assert.match((await g.c.fxEntradaMercado(NP.id, NP)).texto, /migration 059 não foi aplicada/);
  const c = ambiente({ rpc: () => ({ error: { message: "entrada no Mercado: nota cancelada não vale como compra", code: "22023" } }) }); assert.match((await c.c.fxEntradaMercado(NP.id, NP)).texto, /Não concluí.*cancelada/);
  const s = ambiente({ rpc: () => ({ data: { nota_id: NP.id, entrada: { estado: "concluida", mercado_nota_id: "m1", itens: 1, total: 5, produtos_novos: 0 } } }) }); const rs = await s.c.fxEntradaMercado(NP.id, NP); assert.equal(rs.estado, "concluida"); assert.match(rs.confirmacao, /não consegui ler a compra de volta agora/);
  const f = ambiente({ rpc: () => ({ data: { nota_id: NP.id, entrada: { estado: "falhou", erro: "motivo do banco" } } }) }); const rf = await f.c.fxEntradaMercado(NP.id, NP); assert.equal(rf.estado, "mercado_pendente"); assert.match(rf.texto, /motivo do banco.*Tentar de novo.*não precisa ler nem confirmar outra vez/);
});
test("Estou de acordo na tela (foto): UM clique grava e lança; a compra mostrada vem da resposta do banco; resultado único com ✓ e atalho para o Mercado; sem despesa; o botão não clica duas vezes", async () => {
  const a = ambiente(), r = await lerFoto(a), bloco = a.c.fxBlocoConfirmar(r); await tick();
  assert.match(texto(bloco), /Compra no Mercado.*Estabelecimento\s+Mercado Exemplo · novo estabelecimento.*produto novo/); assert.match(texto(bloco), /Ao clicar, o RAC grava a nota na Central Fiscal.*e lança a compra no Mercado.*Não cria despesa/);
  const b = acordo(bloco)[0]; assert.ok(b && b.disabled === false); assert.deepEqual([a.ch.rpc.length, a.ch.up.length], [0, 0], "antes do clique nada é enviado nem gravado");
  b.onclick(); b.onclick(); await tick(25);
  assert.deepEqual(a.ch.rpc.map((q) => q.nome), ["nota_fiscal_confirmar"], "um clique, uma chamada (o segundo clique é ignorado)"); assert.equal(a.ch.up.length, 1);
  const args = a.ch.rpc[0].args; assert.equal(args.p_decisoes.itens.length, 4); assert.ok(args.p_decisoes.itens.every((x) => x.novo && x.novo.nome && x.tipo === "nova")); assert.equal(args.p_decisoes.mercado.nome, "Mercado Exemplo"); assert.deepEqual([args.p_proc.revisada, args.p_proc.confianca], [true, 0.96], "o banco recebe a confiança real e a marca da confirmação humana");
  assert.equal(r.confirmado.conf.estado, "concluida"); const res = r.confirmado; assert.match(res.texto, /^Nota gravada na Central Fiscal \(autorizada\) e lançada no Mercado: 4 itens, total R\$ 54,00\. 3 produtos novos\..*Conferido no banco: a nota e 1 documento foram lidos de volta/);
  const novo = a.c.fxBlocoConfirmar(r); assert.match(texto(novo), /✓ Nota gravada na Central Fiscal/); assert.equal(achar(novo, (n) => n.tag === "a" && n.attrs.href === "#mercado" && n.attrs.text === "Abrir o Mercado").length, 1); assert.equal(acordo(novo).length, 0, "depois de confirmar não há mais botão");
  assert.ok(!a.ch.rpc.some((q) => /despesa|atualizar_situacao/.test(q.nome)), "não cria despesa nem muda a situação fiscal");
});
test("Estou de acordo: falha só no Mercado = nota e confirmação ficam, resultado ⚠ específico com 'Tentar de novo', que retoma sem nova leitura e sem nova confirmação; erro de rede deixa o mesmo botão para tentar de novo", async () => {
  const a = ambiente({ entradaEstado: "falhou" }), r = await lerFoto(a), bloco = a.c.fxBlocoConfirmar(r); await tick(); acordo(bloco)[0].onclick(); await tick(25);
  assert.equal(r.confirmado.conf.estado, "mercado_pendente"); const novo = a.c.fxBlocoConfirmar(r), t = texto(novo); assert.match(t, /⚠ Nota gravada na Central Fiscal \(autorizada\) e a sua confirmação ficou registrada, mas o lançamento no Mercado não foi concluído: já existe no Mercado uma compra com o mesmo número/); assert.doesNotMatch(t, /^\s*✓|lançada no Mercado:/);
  assert.equal(a.tab.notas_fiscais.length, 1, "a nota fiscal foi gravada"); const tentar = achar(novo, (n) => n.tag === "button" && n.attrs.text === "Tentar de novo")[0]; assert.ok(tentar); assert.equal(acordo(novo).length, 0, "não pede confirmar de novo");
  a.tab.notas_fiscais_entradas[0].estado = "pendente"; tentar.onclick(); await tick(25);
  assert.deepEqual(a.ch.rpc.map((q) => q.nome), ["nota_fiscal_confirmar", "nota_fiscal_entrada_mercado"]); assert.deepEqual(J(a.ch.rpc[1].args), { p_nota_id: r.idNota }, "retoma só pelo id da nota"); assert.equal(a.ch.up.length, 1, "nenhum arquivo reenviado");
  assert.match(texto(novo), /✓ Nota gravada na Central Fiscal.*lançada no Mercado: 2 itens/);
  const e = ambiente({ rpc: () => ({ error: { message: "Failed to fetch" } }) }), re = await lerFoto(e), be = e.c.fxBlocoConfirmar(re); await tick(); const bt = acordo(be)[0]; bt.onclick(); await tick(25);
  assert.equal(bt.disabled, false, "o erro devolve o botão ao normal"); assert.match(texto(be), /⚠ Não gravei: Failed to fetch/); assert.equal(re.confirmado, undefined); assert.doesNotMatch(texto(be), /✓/);
});
test("Estou de acordo: reenvio depois de a resposta se perder NÃO duplica e conclui a entrada (a nota que já existe é desta mesma leitura)", async () => {
  let caiu = false; const a = ambiente({ rpc: (nome, args, n, padrao) => { const r = padrao(nome, args); if (!caiu && nome === "nota_fiscal_confirmar") { caiu = true; return { error: { message: "Failed to fetch" } }; } return r; } }), r = await lerFoto(a);
  const e = await a.c.fxSalvarDoc(r, ENT); assert.equal(e.estado, "erro"); assert.equal(a.tab.notas_fiscais.length, 1, "o banco gravou antes de a resposta se perder");
  const x = await a.c.fxSalvarDoc(r, ENT); assert.equal(x.estado, "concluida", x.mensagem); assert.equal(a.ch.rpc.filter((q) => q.nome === "nota_fiscal_confirmar").length, 2, "a tela chama o banco de novo (idempotente) em vez de parar em 'já existe'");
  assert.match(x.mensagem, /já estava lançada no Mercado: nada foi criado de novo/); assert.equal(a.tab.notas_fiscais.length, 1); assert.equal((a.tab.notas || []).length, 1, "uma compra só");
});
test("Estou de acordo: nota cancelada ou duplicada não tem botão; possível duplicidade só avisa ANTES de confirmar e permite prosseguir", async () => {
  const dup = ambiente({ tab: { notas_fiscais: [{ id: "n5", chave: "x", emitente_cnpj: CNPJ, data_emissao: "2026-11-06", valor_total: 54, situacao: "autorizada", numero: "9", serie: "1", modelo: "55" }], compras_online: [{ id: 3, chave_nfe: CHAVE, data: "2026-11-06" }] } }), r = await lerFoto(dup), bloco = dup.c.fxBlocoConfirmar(r); await tick();
  assert.match(texto(bloco), /Possível duplicidade|Compras online/); assert.equal(acordo(bloco).length, 1); assert.equal(acordo(bloco)[0].disabled, false, "avisa e deixa prosseguir");
  const igual = ambiente({ tab: { notas_fiscais: [{ id: "n1", chave: CHAVE, situacao: "autorizada" }] } }), ri = await lerFoto(igual), bi = igual.c.fxBlocoConfirmar(ri); await tick(); assert.match(texto(bi), /já está na Central Fiscal.*Nada será enviado/); assert.ok(acordo(bi).length === 0 || acordo(bi)[0].hidden === true, "chave igual: sem confirmação"); assert.deepEqual([igual.ch.up.length, igual.ch.rpc.length], [0, 0]);
});
test("Estou de acordo no XML: a mesma tela e a mesma chamada; a confirmação também pede a conferência (o banco só confere XML autorizado)", async () => {
  const a = ambiente(), xml = `<nfeProc><NFe><infNFe Id="NFe${CHAVE.replace(/./, "3")}" versao="4.00"></infNFe></NFe></nfeProc>`; void xml;
  const fonte = ler("js/fiscal.js"); assert.match(fonte, /\(ia\?fxSalvarDoc\(r,entrada\):fxSalvar\(r,true,entrada\)\)/, "o XML confirma com conferir = true; o banco ignora para o que não for autorizado");
  assert.match(fonte, /entrada\?fxRpc\("nota_fiscal_confirmar",fxArgsConfirmar\("xml",g\.args,entrada\)\):fxRpc\("nota_fiscal_salvar",g\.args\)/); assert.ok(a.c.fxArgsConfirmar);
  const g = a.c.fxArgsConfirmar("xml", { p_nota: {}, p_itens: [], p_docs: [], p_conferir: true }, ENT); assert.deepEqual(Object.keys(g).sort(), ["p_conferir", "p_decisoes", "p_docs", "p_formato", "p_itens", "p_nota", "p_proc"]); assert.deepEqual([g.p_formato, g.p_proc, g.p_conferir], ["xml", null, true]);
  const d = a.c.fxArgsConfirmar("doc", { p_nota: {}, p_itens: [], p_docs: [], p_proc: { idem: "x" }, p_conferir: true }, ENT); assert.deepEqual([d.p_formato, d.p_proc.idem, d.p_conferir], ["doc", "x", false], "foto/PDF nunca confere");
});
test("lista de notas: lançada (com a revisão), aguardando nova tentativa (retomada automática e Tentar de novo), nota antiga (Estou de acordo individual) e cancelada (sem entrada)", async () => {
  const ids = ["7a7a7a7a-0000-4000-8000-00000000000" + 1, "7a7a7a7a-0000-4000-8000-00000000000" + 2, "7a7a7a7a-0000-4000-8000-00000000000" + 3, "7a7a7a7a-0000-4000-8000-00000000000" + 4];
  const a = ambiente({ tab: { notas_fiscais: [{ ...NP, id: ids[0], emitente_nome: "A LANCADA" }, { ...NP, id: ids[1], emitente_nome: "B FALHOU" }, { ...NP, id: ids[2], emitente_nome: "C ANTIGA" }, { ...NP, id: ids[3], emitente_nome: "D CANCELADA", situacao: "cancelada" }],
    notas_fiscais_tentativas: [], notas_fiscais_situacoes: [], notas_fiscais_docs: [], notas_fiscais_itens: [{ nota_id: ids[2], ordem: 0, descricao: "ARROZ TIPO 1 5KG", unidade: "un" }, { nota_id: ids[2], ordem: 1, descricao: "QUEIJO", unidade: "g" }],
    notas_fiscais_entradas: [{ nota_id: ids[0], estado: "concluida", confirmado_em: "2026-11-16T12:00:00Z", mercado_nota_id: "m1", revisar: "nota_cancelada" }, { nota_id: ids[1], estado: "falhou", erro: "motivo X", tentativas: 1, proxima_em: "2099-11-21T12:00:00Z", confirmado_em: "2026-11-16T12:00:00Z" }] } });
  const { det } = await aberta(a), t = texto(det[0]); assert.match(t, /Lançada no Mercado · revisar: nota cancelada depois da entrada/); assert.doesNotMatch(t, /Estou de acordo|Contingência/, "só o que precisa de atenção"); assert.match(texto(det[1]), /Aguardando nova tentativa/); assert.match(texto(det[3]), /Cancelada/); assert.doesNotMatch(texto(det[3]), /Não lançada/, "cancelada mostra uma etiqueta só");
  const abrir = async (d) => { d.open = true; d.ontoggle(); await tick(14); return d; };
  await abrir(det[0]); assert.match(texto(det[0]), /✓ Lançada no Mercado · “Estou de acordo” em.*Revisar: a nota fiscal foi cancelada depois da entrada\. A compra foi mantida/); assert.equal(achar(det[0], (n) => n.tag === "a" && n.attrs.href === "#mercado").length, 1);
  await abrir(det[1]); assert.match(texto(det[1]), /⚠ Aguardando nova tentativa.*gravada e confirmada.*motivo X.*tenta de novo sozinho.*não precisa confirmar outra vez/); assert.match(texto(det[1]), /Validação fiscal oficial.*ainda não habilitada/); const tentar = achar(det[1], (n) => n.tag === "button" && n.attrs.text === "Tentar de novo")[0]; assert.ok(tentar); assert.equal(acordo(det[1]).length, 0);
  tentar.onclick(); await tick(20); assert.deepEqual(J(a.ch.rpc.at(-1)), { nome: "nota_fiscal_entrada_mercado", args: { p_nota_id: ids[1] } }); assert.match(texto(det[1]), /✓ Nota gravada na Central Fiscal \(contingência\) e lançada no Mercado/);
  await abrir(det[2]); assert.match(texto(det[2]), /gravada antes da entrada automática.*Compra no Mercado.*Estabelecimento.*1\. ARROZ TIPO 1 5KG → produto novo.*2\. QUEIJO → produto novo/); const ok = acordo(det[2])[0]; assert.ok(ok && ok.disabled === false);
  const antes = a.ch.rpc.length; ok.onclick(); await tick(20); const ch = a.ch.rpc.at(-1); assert.equal(a.ch.rpc.length, antes + 1); assert.equal(ch.nome, "nota_fiscal_entrada_mercado"); assert.equal(ch.args.p_nota_id, ids[2]); assert.equal(ch.args.p_concordo, true); assert.equal(ch.args.p_decisoes.itens.length, 2); assert.equal(ch.args.p_decisoes.itens[1].novo.unidade, "kg", "g vira kg");
  assert.match(texto(det[2]), /✓ Nota gravada na Central Fiscal \(contingência\) e lançada no Mercado/);
  await abrir(det[3]); assert.match(texto(det[3]), /Nota cancelada: não vale como compra e não entra no Mercado/); assert.equal(acordo(det[3]).length, 0);
});
test("lista de notas: sem a migration 059 a tela avisa uma vez, não mostra o estado do Mercado e não oferece entrada", async () => {
  const a = ambiente({ erroLer: (t) => t === "notas_fiscais_entradas", tab: { notas_fiscais: NOTAS, notas_fiscais_tentativas: [], notas_fiscais_situacoes: [] } }), { painel, det } = await aberta(a); const t = texto(painel);
  assert.match(t, /A entrada no Mercado ainda não está disponível no banco \(migration 059 pendente\)/); assert.doesNotMatch(t, /Não lançada|Lançada no Mercado|ainda não estão lançadas/); assert.equal(det.length, 4);
  det[0].open = true; det[0].ontoggle(); await tick(10); assert.equal(acordo(det[0]).length, 0); assert.doesNotMatch(texto(det[0]), /Entrada no Mercado/);
});
