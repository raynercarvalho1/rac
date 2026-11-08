// Central Fiscal, Lote 1.4 (docs/fiscal.md): nota em FOTO ou PDF lida pela IA (ação fiscal.nota da rac-ia).
// Tudo sem rede, sem banco e SEM nenhuma chamada paga: a Anthropic, o Supabase, o pdf.js e o navegador são objetos de teste, e as "respostas da IA"
// abaixo são fixtures escritas à mão. Notas, CNPJ, chaves e nomes são FICTÍCIOS. Isto prova a lógica; NÃO prova que a IA real lê uma foto de verdade.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { ACOES } from "../supabase/functions/rac-ia/acoes.ts";
import { temDemo } from "../supabase/functions/rac-ia/demo.ts";
import * as O from "../supabase/functions/rac-ia/orcamento.ts";
import { atenderPedido } from "../supabase/functions/rac-ia/servico.ts";
import { cpfDe, BASES } from "./fixtures/fiscal/cpf_casos.mjs";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const DONO = "11111111-1111-4111-8111-111111111111", CNPJ = "11222333000181", CPF = cpfDe(BASES.A);
const chaveDe = (tp = "1", n = "000000123") => { const b = "31" + "2611" + CNPJ + "65" + "001" + n + tp + "12345678"; return b + N.nfDvChave(b); };
const CHAVE = chaveDe();

// ---------- a "resposta da IA" (já no formato que a validação do servidor devolve) ----------
const resposta = (o = {}) => ({
  modelo: "65", emitente_nome: "MERCADO EXEMPLO LTDA", emitente_cnpj: CNPJ, emitente_uf: "MG", numero: "123", serie: "1", chave: CHAVE, data_emissao: "2026-11-06", hora_emissao: "10:30:00", protocolo: "131260000000001",
  situacao: "autorizada", total_produtos: 56.13, descontos: 2.13, frete: null, outras: null, impostos: 9.5, total: 54, valor_pago: 54,
  componentes: { seguro: null, st: null, fcp_st: null, ipi: null, ii: null, ipi_devol: null, deson: null },
  pagamentos: [{ forma: "Cartão de crédito", valor: 54 }],
  itens: [
    { descricao: "BANANA PRATA", codigo: "001", qtd: 0.734, unidade: "KG", unitario: 6.99, total: 5.13, desconto: 0, incerto: false },
    { descricao: "AZEITE EXEMPLO", codigo: null, qtd: 2, unidade: "UN", unitario: 10, total: 20, desconto: 0, incerto: false },
    { descricao: "BOLACHA EXEMPLO", codigo: null, qtd: 3, unidade: "UN", unitario: 4, total: 12, desconto: 0, incerto: false },
    { descricao: "GASOLINA COMUM", codigo: null, qtd: 3.221, unidade: "L", unitario: 5.899, total: 19, desconto: 2.13, incerto: false },
  ],
  confianca: 0.96, incertos: [], ...o,
});
const lerIA = (res, fmt = "imagem") => N.nfLerIA(res, fmt);
const decidir = (res, fmt = "imagem", extra = {}) => { const ia = lerIA(res, fmt), nota = N.nfNormalizar(ia.lido), dec = N.nfDecisaoGravacao(nota, null, { confianca: N.nfConfiancaIA({ confianca: ia.confianca, ...extra }) }); return { ia, nota, dec }; };

// ================= a leitura vira nota e passa pelas mesmas regras do XML =================
test("foto legível, confiança alta, conta fechada, autorizada: atende às regras como validada (mesmo veredito do XML)", () => {
  const { ia, nota, dec } = decidir(resposta());
  assert.equal(ia.confianca, 0.96); assert.equal(nota.formato, "imagem"); assert.equal(nota.requer_conferencia, true, "foto sempre exige conferência humana no cadastro");
  assert.equal(nota.situacao, "autorizada"); assert.equal(nota.protocolo, "131260000000001"); assert.equal(nota.chave_valida, true);
  assert.deepEqual([dec.pode, dec.modo, dec.veredito.classe, dec.veredito.diferenca], [true, "validada", "consistente", 0]);
  assert.equal(nota.itens[3].unitario, 5.899, "o unitário não é arredondado em centavos");
  assert.equal(dec.gera_despesa, false); assert.equal(dec.veredito.pode_alimentar_financeiro, true, "a regra existe; nenhum código cria despesa");
});
test("a IA não aprova sozinha: sem confiança informada a leitura de foto é baixa confiança, e a confiança vem de nfConfiancaIA", () => {
  const ia = lerIA(resposta()), nota = N.nfNormalizar(ia.lido);
  const sem = N.nfDecisaoGravacao(nota, null); assert.equal(sem.pode, false); assert.match(sem.bloqueios.join(" "), /sem medida de confiança/);
  assert.equal(N.nfConfiancaIA({ confianca: 0.7 }), 0.7); assert.equal(N.nfConfiancaIA({ confianca: 0.7, revisada: true }), 1); assert.equal(N.nfConfiancaIA({ confianca: "x" }), 0); assert.equal(N.nfConfiancaIA(null), 0);
});
test("confiança inferior a 0,90 (foto de baixa qualidade) bloqueia a validação; exatamente 0,90 passa", () => {
  const baixa = decidir(resposta({ confianca: 0.62 })); assert.equal(baixa.dec.pode, false); assert.equal(baixa.dec.modo, "bloqueada"); assert.match(baixa.dec.bloqueios.join(" "), /62%.*90%/);
  const limite = decidir(resposta({ confianca: 0.9 })); assert.equal(limite.dec.pode, true); assert.equal(decidir(resposta({ confianca: 0.89 })).dec.pode, false);
});
test("foto parcialmente cortada: item sem total, total ausente e campos incertos viram baixa confiança, com a confiança limitada a 85%", () => {
  const cortada = resposta({ total: null, total_produtos: null, valor_pago: null, chave: null, incertos: [{ campo: "total", motivo: "cortado na dobra" }, { campo: "chave", motivo: "borrada" }],
    itens: [{ descricao: "BANANA PRATA", codigo: null, qtd: 0.734, unidade: "KG", unitario: 6.99, total: 5.13, desconto: 0, incerto: false }, { descricao: "AZEI", codigo: null, qtd: 2, unidade: "UN", unitario: 10, total: null, desconto: 0, incerto: true }] });
  const { ia, dec } = decidir(cortada);
  assert.equal(ia.confianca, 0.85); assert.match(ia.avisos.join(" "), /limitada a 85%/); assert.deepEqual(ia.itens_incertos, [2]);
  assert.equal(dec.pode, false); assert.equal(dec.veredito.classe, "baixa_confianca"); assert.match(dec.bloqueios.join(" "), /Item 2.*falta o valor total|sem valor total|total/i);
  assert.match(dec.bloqueios.join(" "), /chave de acesso/);
});
test("campos ausentes não são inventados: data, número, emitente e chave ficam ausentes e a nota não é validada", () => {
  const { nota, dec } = decidir(resposta({ data_emissao: null, numero: null, serie: null, emitente_nome: null, emitente_cnpj: null, chave: null, protocolo: null, situacao: null }));
  assert.equal(nota.data_emissao, null); assert.equal(nota.emitente.cnpj, null); assert.equal(nota.emitente.nome, null); assert.equal(nota.chave, null);
  assert.equal(dec.pode, false); assert.match(dec.bloqueios.join(" "), /chave de acesso/); assert.equal(nota.situacao, "pendente", "sem evidência de autorização");
});
test("vários itens com desconto, frete, seguro, ST e IPI: a conta fecha e a diferença aparece quando não fecha", () => {
  const val = { total_produtos: 100, descontos: 10, frete: 5, outras: 2, total: 105 + 3 + 4.5 + 1.25 - 0 + 0, componentes: { seguro: 3, st: 4.5, fcp_st: null, ipi: 1.25, ii: null, ipi_devol: null, deson: null }, valor_pago: null, impostos: null,
    itens: [{ descricao: "A", codigo: null, qtd: 4, unidade: "UN", unitario: 10, total: 40, desconto: 4, incerto: false }, { descricao: "B", codigo: null, qtd: 6, unidade: "UN", unitario: 10, total: 60, desconto: 6, incerto: false }] };
  val.total = 100 - 10 + 5 + 2 + 3 + 4.5 + 1.25;
  const ok = decidir(resposta(val)); assert.equal(ok.dec.veredito.classe, "consistente", JSON.stringify(ok.dec.bloqueios)); assert.equal(ok.dec.veredito.soma.acrescimos, 15.75);
  const errado = decidir(resposta({ ...val, total: val.total + 6 })); assert.equal(errado.dec.veredito.classe, "divergente"); assert.equal(errado.dec.veredito.diferenca, -6); assert.match(errado.dec.bloqueios.join(" "), /R\$ 6,00 a menos/);
});
test("divergência entre a soma dos itens e o total fiscal bloqueia mesmo com confiança alta; a diferença é mostrada em reais", () => {
  const { dec } = decidir(resposta({ total: 60, valor_pago: 60, confianca: 0.99 }));
  assert.deepEqual([dec.pode, dec.veredito.classe, dec.veredito.diferenca], [false, "divergente", -6]); assert.equal(dec.veredito.diferenca_texto, "R$ 6,00 a menos que o total fiscal.");
});
test("situação fiscal pela evidência: pendente e contingência consistentes só como pendente fiscal; cancelada e rejeitada bloqueadas; autorizada sem protocolo legível vira pendente", () => {
  const pend = decidir(resposta({ situacao: "pendente", protocolo: null })).dec; assert.deepEqual([pend.pode, pend.modo], [true, "pendente_fiscal"]); assert.equal(pend.veredito.pode_alimentar_financeiro, false);
  const cont = decidir(resposta({ situacao: "contingencia", protocolo: null })).dec; assert.deepEqual([cont.pode, cont.modo, cont.veredito.fiscal.situacao], [true, "pendente_fiscal", "contingencia"]);
  const canc = decidir(resposta({ situacao: "cancelada" })).dec; assert.deepEqual([canc.pode, canc.modo], [false, "bloqueada"]); assert.match(canc.bloqueios.join(" "), /cancelada.*não vale como compra fiscal validada/);
  const rej = decidir(resposta({ situacao: "rejeitada", protocolo: null })).dec; assert.deepEqual([rej.pode, rej.modo], [false, "bloqueada"]); assert.match(rej.bloqueios.join(" "), /rejeitada/);
  const semProt = decidir(resposta({ protocolo: null })); assert.equal(semProt.nota.situacao, "pendente"); assert.match(semProt.ia.avisos.join(" "), /sem um protocolo legível/); assert.equal(semProt.dec.modo, "pendente_fiscal");
});
test("PDF usa o mesmo caminho: formato pdf, mesma confiança mínima e mesma conta", () => {
  const { nota, dec } = decidir(resposta(), "pdf"); assert.equal(nota.formato, "pdf"); assert.equal(dec.modo, "validada");
  assert.equal(decidir(resposta({ confianca: 0.5 }), "pdf").dec.pode, false);
});
test("correção manual e revalidação: corrigir o total e conferir com o documento libera a confiança, mas a conta continua valendo", () => {
  const ruim = resposta({ confianca: 0.7, total: 60, valor_pago: 60 }), ia = lerIA(ruim); let nota = N.nfNormalizar(ia.lido);
  assert.equal(N.nfDecisaoGravacao(nota, null, { confianca: 0.7 }).pode, false);
  const l2 = N.nfCorrigir(ia.lido, { valores: { total: "54,00" }, emitente_nome: "Mercado Corrigido", itens: ia.lido.itens.map((i) => ({ ...i, qtd: String(i.qtd).replace(".", ","), unitario: String(i.unitario).replace(".", ","), total: String(i.total).replace(".", ","), desconto: String(i.desconto || "").replace(".", ",") })) });
  nota = N.nfNormalizar(l2); assert.equal(nota.valores.total, 54); assert.equal(nota.emitente.nome, "Mercado Corrigido"); assert.equal(nota.itens[3].unitario, 5.899, "vírgula decimal e 4 casas");
  assert.equal(N.nfDecisaoGravacao(nota, null, { confianca: 0.7 }).pode, false, "sem revisão a confiança da IA continua baixa");
  const rev = N.nfDecisaoGravacao(nota, null, { confianca: N.nfConfiancaIA({ confianca: 0.7, revisada: true }) }); assert.deepEqual([rev.pode, rev.modo], [true, "validada"]);
  const errada = N.nfNormalizar(N.nfCorrigir(l2, { valores: { total: "99" } })); const d2 = N.nfDecisaoGravacao(errada, null, { confianca: 1 }); assert.equal(d2.pode, false); assert.equal(d2.veredito.classe, "divergente", "revisão humana não relaxa a conta");
  const vazio = N.nfCorrigir(l2, { chave: "", data_emissao: " " }); assert.equal(vazio.chave, null); assert.equal(vazio.data_emissao, null);
  assert.equal(JSON.stringify(ia.lido.valores.total), "60", "a correção não altera o original");
});

// ================= o arquivo: conteúdo real, tamanho, mascaramento =================
const bytes = (...b) => b.concat(Array(16).fill(0)).slice(0, 16);
const JPG = bytes(0xFF, 0xD8, 0xFF, 0xE0), PNG = bytes(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A), PDFB = bytes(...Array.from("%PDF-1.7").map((c) => c.charCodeAt(0)));
const WEBP = bytes(...Array.from("RIFF").map((c) => c.charCodeAt(0)), 0, 0, 0, 0, ...Array.from("WEBP").map((c) => c.charCodeAt(0)));
const HEIC = bytes(0, 0, 0, 24, ...Array.from("ftypheic").map((c) => c.charCodeAt(0)));
test("o arquivo é identificado pelo conteúdo: JPEG, PNG, WebP e PDF passam; executável, texto, HEIC, vazio e disfarçado não", () => {
  const f = (nome, cab, tamanho = 1000, tipo = "") => N.nfArquivoIA({ nome, tamanho, cabecalho: cab, tipoDeclarado: tipo });
  assert.deepEqual([f("a.jpg", JPG).ok, f("a.jpg", JPG).tipo, f("a.png", PNG).formato, f("a.webp", WEBP).formato, f("a.pdf", PDFB).tipo], [true, "imagem", "png", "webp", "pdf"]);
  assert.equal(f("foto", JPG).ok, true, "sem extensão vale o conteúdo"); assert.equal(f("a.jpeg", JPG, 1000, "image/jpeg").ok, true);
  const mz = f("nota.pdf", bytes(0x4D, 0x5A, 0x90, 0)); assert.equal(mz.ok, false); assert.match(mz.erro, /formato não suportado/);
  assert.match(f("nota.jpg", PDFB).erro, /conteúdo é PDF, mas o nome diz JPG/); assert.match(f("nota.pdf", JPG).erro, /conteúdo é JPEG, mas o nome diz PDF/);
  assert.match(f("a.jpg", JPG, 1000, "application/pdf").erro, /tipo informado pelo aparelho é outro/);
  assert.match(f("a.heic", HEIC).erro, /HEIC.*JPEG/); assert.match(f("a.txt", Array.from("texto simples...").map((c) => c.charCodeAt(0))).erro, /não suportado/); assert.match(f("a.jpg", JPG, 0).erro, /vazio/);
  assert.equal(f("a.svg", Array.from("<svg xmlns=\"http").map((c) => c.charCodeAt(0))).ok, false, "SVG (conteúdo ativo) nunca");
  assert.equal(N.nfTipoReal(null), null);
});
test("limites de tamanho e de conjunto: imagem até 12 MB, PDF até 10 MB, um PDF sozinho ou até 4 fotos", () => {
  const f = (nome, cab, t) => N.nfArquivoIA({ nome, tamanho: t, cabecalho: cab });
  assert.equal(f("a.jpg", JPG, 12 * 1024 * 1024).ok, true); assert.match(f("a.jpg", JPG, 12 * 1024 * 1024 + 1).erro, /imagem grande demais/);
  assert.equal(f("a.pdf", PDFB, 10 * 1024 * 1024).ok, true); assert.match(f("a.pdf", PDFB, 10 * 1024 * 1024 + 1).erro, /PDF grande demais/);
  const img = f("a.jpg", JPG, 10), pdf = f("a.pdf", PDFB, 10);
  assert.deepEqual([N.nfLoteIA([img]).tipo, N.nfLoteIA([img, img, img, img]).tipo, N.nfLoteIA([pdf]).tipo], ["imagem", "imagem", "pdf"]);
  assert.match(N.nfLoteIA([img, img, img, img, img]).erro, /No máximo 4 fotos/); assert.match(N.nfLoteIA([pdf, img]).erro, /não misture/); assert.match(N.nfLoteIA([]).erro, /Escolha/);
  assert.match(N.nfLoteIA([img, f("x.txt", [1, 2, 3, 4], 10)]).erro, /não suportado/);
});
test("PDF com script, ação de lançar ou arquivo embutido é recusado; PDF comum passa; o CPF no texto vira máscara", () => {
  assert.equal(N.nfPdfAtivo("%PDF-1.4 1 0 obj << /Type /Catalog /Pages 2 0 R >>"), false);
  for (const t of ["<< /S /JavaScript /JS (app.alert(1)) >>", "<< /Type /Action /S /Launch >>", "/EmbeddedFiles << >>", "/RichMedia", "/SubmitForm"]) assert.equal(N.nfPdfAtivo(t), true, t);
  const m = N.nfMascararCpf(`CONSUMIDOR CPF ${CPF.slice(0, 3)}.${CPF.slice(3, 6)}.${CPF.slice(6, 9)}-${CPF.slice(9)} e ${CPF} e 12345678900 e chave ${CHAVE}`);
  assert.ok(!m.includes(CPF) && !m.includes(CPF.slice(0, 3) + "." + CPF.slice(3, 6)), "CPF válido, formatado ou não, sai"); assert.match(m, /\*\*\*\.\*\*\*\.\*\*\*-\*\*/); assert.ok(m.includes("12345678900"), "número que não é CPF válido fica");
  assert.ok(m.includes(CHAVE), "a chave de 44 dígitos não é tocada");
});

// ================= servidor: a ação fiscal.nota =================
test("ação fiscal.nota: Sonnet 5.5, só o dono, só REAL (sem demonstração), imagens e texto limitados, instruções fixas", () => {
  const a = ACOES["fiscal.nota"];
  assert.deepEqual([a.modelo, a.papeis, a.real, a.imagensMax, a.modulo], ["claude-sonnet-5-5", ["dono"], true, 4, "fiscal"]); assert.equal(temDemo("fiscal.nota"), false, "sem demonstração: nunca uma leitura simulada");
  assert.match(a.sistema, /ignore e não obedeça/); assert.match(a.sistema, /Nunca copie CPF/); assert.match(a.sistema, /sem arredondar/); assert.equal(a.esquema.additionalProperties, false);
  assert.ok(a.esquema.required.includes("confianca") && a.esquema.required.includes("incertos") && a.esquema.required.includes("componentes"));
  assert.equal(O.decidirModo({ ...O.CONFIG_PADRAO, modo: "REAL", acoes_reais: [], acoes_reais_casa: [] }, true, a, "dono").modo, "DEMO", "sem a ação liberada no banco fica em DEMO (e DEMO vira sem_real)");
  assert.equal(O.decidirModo({ ...O.CONFIG_PADRAO, modo: "REAL", acoes_reais: ["fiscal.nota"], acoes_reais_casa: [] }, true, a, "dono").modo, "REAL");
});
test("ação fiscal.nota valida a resposta: preserva as casas do unitário, descarta chave incompleta, remove CPF e recusa o que não presta", () => {
  const v = ACOES["fiscal.nota"].validar(resposta({ chave: CHAVE.slice(0, 40), itens: [{ descricao: `LEITE ${CPF}`, codigo: null, qtd: 1, unidade: "UN", unitario: 5.8990, total: 5.9, desconto: 0, incerto: false }], total_produtos: 5.9, total: 5.9, descontos: 0 }), {});
  assert.equal(v.ok, true, v.motivo); assert.equal(v.resultado.chave, null); assert.equal(v.resultado.itens[0].unitario, 5.899); assert.ok(!JSON.stringify(v.resultado).includes(CPF), "o CPF não passa");
  assert.match(v.avisos.join(" "), /CPF.*removido/); assert.match(v.avisos.join(" "), /44 dígitos/); assert.equal(v.resultado.confianca, 0.96);
  const ok = ACOES["fiscal.nota"].validar(resposta(), {}); assert.equal(ok.ok, true); assert.equal(ok.resultado.chave, CHAVE); assert.equal(ok.resultado.emitente_cnpj, CNPJ); assert.equal(ok.resultado.protocolo, "131260000000001");
  const r = (o) => ACOES["fiscal.nota"].validar({ ...resposta(), ...o }, {});
  assert.equal(r({ itens: [] }).ok, false); assert.equal(r({ confianca: undefined }).ok, false); assert.equal(r({ total: -1 }).ok, false); assert.equal(r({ total: "54" }).ok, false);
  assert.equal(r({ situacao: "aprovada" }).resultado.situacao, null, "situação fora da lista vira ausente"); assert.equal(r({ confianca: 7 }).resultado.confianca, 1, "confiança é limitada a 0..1");
  assert.equal(r({ data_emissao: "2026-02-31" }).resultado.data_emissao, null); assert.equal(ACOES["fiscal.nota"].validar("texto", {}).ok, false);
});
function bancoRac(cfg, papel = "dono") {
  const b = { reservas: [], concluidas: [] };
  Object.assign(b, { papelEDono: async () => ({ papel, dono: "dono-1" }), config: async () => cfg, preco: async () => ({ entrada_usd_mtok: 2, saida_usd_mtok: 10, max_entrada_tokens: 200000, conferido_em: "2026-10-30" }),
    reservar: async (a) => { b.reservas.push(a); return { ok: true, id: "uso-1", comprometido_usd: 0, teto_usd: 6.7 }; }, marcarEnvio: async () => true, falhouSemEnvio: async () => true, marcarIncerto: async () => true,
    concluir: async (...a) => { b.concluidas.push(a); return true; } });
  return b;
}
const CFG = { modo: "REAL", acoes_reais: ["fiscal.nota"], acoes_reais_casa: [], limite_brl: 50, cambio_brl_usd: 6, margem_impostos: 0.12, margem_seguranca: 0.1, fator_correcao: 1 };
const IMG = { tipo: "image/jpeg", base64: "/9j/4AAQSkZJRgABAQ==" };
const pedido = (id = "k1") => ({ versao: 1, modulo: "fiscal", acao: "fiscal.nota", idempotencia: "fiscal-teste-" + id, entrada: { texto: "", imagens: [IMG] }, contexto: {} });
test("servidor, ponta a ponta com a Anthropic FALSA: sem liberação = sem_real (nada reservado); casa = sem_permissao; liberada = uma chamada e resultado validado", async () => {
  for (const cfg of [{ ...CFG, modo: "DEMO" }, { ...CFG, acoes_reais: [] }]) {
    const b = bancoRac(cfg), r = await atenderPedido("dono-1", pedido(), { banco: b, provedor: { nome: "x", contarTokens: async () => { throw new Error("não"); }, gerar: async () => { throw new Error("não"); } } });
    assert.equal(r.corpo.erro.codigo, "sem_real"); assert.equal(b.reservas.length, 0); assert.equal(r.corpo.resultado, undefined);
  }
  assert.equal((await atenderPedido("fernanda", pedido(), { banco: bancoRac(CFG, "casa"), provedor: null })).corpo.erro.codigo, "sem_permissao");
  let chamadas = 0; const prov = { nome: "anthropic", contarTokens: async () => 3000, gerar: async () => { chamadas++; return { tipo: "ok", texto: JSON.stringify(resposta()), uso: { entrada: 3000, saida: 900 }, modelo: "claude-sonnet-5-5", requisicao: "msg_teste" }; } };
  const b = bancoRac(CFG), r = await atenderPedido("dono-1", pedido(), { banco: b, provedor: prov });
  assert.equal(r.corpo.ok, true, JSON.stringify(r.corpo)); assert.equal(r.corpo.modo, "REAL"); assert.equal(chamadas, 1); assert.equal(b.reservas[0].modulo, "fiscal"); assert.equal(r.corpo.resultado.itens.length, 4);
  const ruim = await atenderPedido("dono-1", pedido("2"), { banco: bancoRac(CFG), provedor: { ...prov, gerar: async () => ({ tipo: "ok", texto: JSON.stringify({ ...resposta(), itens: [] }), uso: { entrada: 3000, saida: 10 }, modelo: "claude-sonnet-5-5" }) } });
  assert.equal(ruim.corpo.erro.codigo, "resposta_invalida");
});
test("036: só soma 'fiscal.nota' à lista aceita, proíbe a casa, NÃO liga a ação e não toca em tabela fiscal; não foi aplicado", () => {
  const sql = ler("supabase/036_ia_fiscal.sql"), sem = sql.replace(/^--.*$/gm, "");
  assert.match(sem, /acoes_reais <@ array\['abastecimento\.interpretar', 'newsletter\.resumo', 'hoje\.analise', 'fiscal\.nota'\]::text\[\]/);
  assert.match(sem, /check \(not \('fiscal\.nota' = any \(acoes_reais_casa\)\)\)/); assert.ok(!/\bupdate\b|\binsert\b|\bdelete\b|create table|notas_fiscais|alter table public\.(?!ia_config)/i.test(sem), "só constraints de ia_config");
  assert.match(sql, /NÃO aplicado em produção/); assert.match(sql, /--\s+update public\.ia_config set acoes_reais = array_append/, "o update de ligar está só comentado");
  const s28 = ler("supabase/028_hoje.sql").replace(/^--.*$/gm, ""); assert.ok(s28.includes("'hoje.analise'"), "a 028 não foi mexida");
});

// ================= a tela: fxIA com a IA, o pdf.js e o navegador de teste =================
function ambiente(o = {}) {
  const ch = { ia: [], pdf: 0, select: [], rpc: 0, upload: 0 };
  const sb = { rpc: () => { ch.rpc++; return Promise.resolve({}); }, from: (t) => ({ select: () => ({ eq: (c, v) => { ch.select.push([t, c, v]); return { limit: () => Promise.resolve({ data: ((o.tab || {})[t] || []).filter((r) => r[c] === v) }) }; } }) }), storage: { from: () => ({ upload: () => { ch.upload++; return Promise.resolve({}); }, remove: () => Promise.resolve({}) }) } };
  const stub = (tag, attrs, ...kids) => { const n = { tag, attrs: attrs || {}, kids: [], text: (attrs && attrs.text) || "", value: "" }; n.appendChild = (k) => { n.kids.push(k); return k; }; kids.forEach((k) => { if (k != null) n.kids.push(typeof k === "string" ? { tag: "#t", attrs: {}, kids: [], text: k } : k); }); return n; };
  const paginas = o.paginas ?? 1;
  const pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve({ numPages: paginas, getPage: (i) => Promise.resolve({
    getTextContent: () => Promise.resolve({ items: [{ str: `Página ${i} CONSUMIDOR CPF ${CPF}` }, { str: "TOTAL 54,00" }] }), getViewport: ({ scale }) => ({ width: 600 * scale, height: 1200 * scale }),
    render: () => ({ promise: Promise.resolve() }) }) }) }) };
  const c = vm.createContext({ NUCLEO: N, SB: sb, DONO, crypto: globalThis.crypto, Blob, TextEncoder, Uint8Array, ArrayBuffer, Math, String, Array, JSON, setTimeout: (f) => { f(); return 0; }, h: stub, isOwner: () => true,
    brl: (v) => "R$ " + Number(v).toFixed(2).replace(".", ","), dataBR: (d) => d, carregarScript: () => { ch.pdf++; return Promise.resolve(); }, window: { pdfjsLib },
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => ({}), toDataURL: () => "data:image/jpeg;base64,QUJD" }) }, iaFoto: () => Promise.resolve(IMG),
    racIA: (modulo, acao, entrada, contexto) => { ch.ia.push({ modulo, acao, entrada, contexto }); return typeof o.ia === "function" ? Promise.resolve(o.ia(ch.ia.length)) : Promise.resolve("ia" in o ? o.ia : { ok: true, versao: 1, modo: "REAL", estado: "concluido", resultado: resposta(), avisos: [], id: "uso-9", consumo: { mes: { alerta: 0, percentual: 3 } } }); } });
  vm.runInContext(ler("js/fiscal.js"), c);
  return { c, ch };
}
const arq = (nome, cab, extra = "", tipo = "", tamanho) => { const u = Uint8Array.from(cab.concat(Array.from(extra).map((x) => x.charCodeAt(0)))); return { name: nome, size: tamanho ?? u.length, type: tipo, slice: (a, b) => ({ arrayBuffer: () => Promise.resolve(u.slice(a, b).buffer) }), arrayBuffer: () => Promise.resolve(u.buffer.slice(0)) }; };
const texto = (n) => (n.textContent !== undefined ? n.textContent : n.text) + (n.kids || []).map(texto).join(" ");
const achar = (n, f) => (f(n) ? [n] : []).concat(...(n.kids || []).map((k) => achar(k, f)));

test("foto legível: um envio à IA com a foto reduzida, nota lida e validada, nada gravado, nada no Storage, nenhuma função de gravação", async () => {
  const { c, ch } = ambiente(); const x = await c.fxIA([arq("nota.jpg", JPG, "uma foto qualquer", "image/jpeg")]);
  assert.equal(x.estado, "lido", x.mensagem); assert.equal(ch.ia.length, 1); assert.deepEqual([ch.ia[0].modulo, ch.ia[0].acao], ["fiscal", "fiscal.nota"]); assert.equal(ch.ia[0].entrada.imagens.length, 1); assert.equal(ch.ia[0].entrada.texto, "");
  assert.equal(x.r.nota.formato, "imagem"); assert.equal(x.r.ia.confianca, 0.96); assert.equal(x.r.arquivo, null, "nada do arquivo vira gravável");
  assert.deepEqual([ch.rpc, ch.upload], [0, 0], "nenhuma gravação nem envio ao cofre");
  const t = texto(c.fxCartao(x.r, false));
  assert.match(t, /Leitura por IA \(foto\)/); assert.match(t, /Confiança da leitura.*96%/); assert.match(t, /Mínimo para validar.*90%/); assert.match(t, /Conta dos itens.*Consistente/); assert.match(t, /Atende às regras \(a gravação de foto ou PDF ainda não existe\)/);
  assert.match(t, /Gravação de foto ou PDF: ainda não disponível/); assert.match(t, /Corrigir os dados lidos/);
  assert.equal(achar(c.fxCartao(x.r, false), (n) => n.tag === "button" && /Salvar/.test(n.attrs.text || "")).length, 0, "não existe botão de salvar para foto");
});
test("PDF de uma página e de várias: o texto vai SEM CPF, as páginas viram imagens (até 4) e o pdf.js só desenha", async () => {
  for (const pag of [1, 3]) {
    const { c, ch } = ambiente({ paginas: pag }); const x = await c.fxIA([arq("nota.pdf", PDFB, " resto do pdf", "application/pdf")]);
    assert.equal(x.estado, "lido", x.mensagem); assert.equal(ch.pdf, 1); assert.equal(ch.ia[0].entrada.imagens.length, pag); assert.equal(x.r.nota.formato, "pdf");
    const t = ch.ia[0].entrada.texto; assert.ok(!t.includes(CPF), "o CPF não sai do aparelho no texto"); assert.match(t, /\*\*\*\.\*\*\*\.\*\*\*-\*\*|CONSUMIDOR CPF/); assert.match(t, /TOTAL 54,00/); assert.ok(t.length <= 5800);
  }
});
test("PDF com mais de 4 páginas, com script ou grande demais: recusado antes de qualquer envio à IA", async () => {
  const mais = ambiente({ paginas: 5 }); const a = await mais.c.fxIA([arq("n.pdf", PDFB, " x", "application/pdf")]); assert.equal(a.estado, "erro"); assert.match(a.mensagem, /5 páginas.*limite é 4/); assert.equal(mais.ch.ia.length, 0);
  const js = ambiente(); const b = await js.c.fxIA([arq("n.pdf", PDFB, " << /S /JavaScript /JS (x) >>", "application/pdf")]); assert.equal(b.estado, "invalido"); assert.match(b.mensagem, /conteúdo ativo/); assert.deepEqual([js.ch.ia.length, js.ch.pdf], [0, 0]);
  const grande = ambiente(); const g = await grande.c.fxIA([arq("n.pdf", PDFB, "", "application/pdf", 11 * 1024 * 1024)]); assert.equal(g.estado, "invalido"); assert.match(g.mensagem, /PDF grande demais/); assert.equal(grande.ch.ia.length, 0);
});
test("arquivo inválido, disfarçado ou acima do limite: nada vai à IA", async () => {
  for (const [f, re] of [[arq("a.exe", [0x4D, 0x5A, 0x90, 0x00], "MZ....", "application/octet-stream"), /formato não suportado/], [arq("a.jpg", PDFB, " x", "image/jpeg"), /conteúdo é PDF, mas o nome diz JPG/], [arq("a.jpg", JPG, "", "image/jpeg", 13 * 1024 * 1024), /imagem grande demais/],
    [arq("a.heic", HEIC, "", "image/heic"), /HEIC/], [arq("a.txt", Array.from("so texto aqui....").map((x) => x.charCodeAt(0)), "", "text/plain"), /não suportado/]]) {
    const { c, ch } = ambiente(); const x = await c.fxIA([f]); assert.equal(x.estado, "invalido", f.name); assert.match(x.mensagem, re); assert.equal(ch.ia.length, 0, f.name);
  }
  const { c, ch } = ambiente(); assert.match((await c.fxIA([])).mensagem, /Escolha/); const cinco = Array.from({ length: 5 }, (_, i) => arq("f" + i + ".jpg", JPG, "x" + i, "image/jpeg")); assert.match((await c.fxIA(cinco)).mensagem, /No máximo 4/); assert.equal(ch.ia.length, 0);
  const mix = await c.fxIA([arq("a.jpg", JPG, "x", "image/jpeg"), arq("b.pdf", PDFB, "y", "application/pdf")]); assert.match(mix.mensagem, /não misture/);
});
test("quatro fotos da mesma nota vão juntas, numa só chamada", async () => {
  const { c, ch } = ambiente(); const fs4 = Array.from({ length: 4 }, (_, i) => arq("f" + i + ".jpg", JPG, "conteudo" + i, "image/jpeg")); const x = await c.fxIA(fs4);
  assert.equal(x.estado, "lido"); assert.equal(ch.ia.length, 1); assert.equal(ch.ia[0].entrada.imagens.length, 4);
});
test("Anthropic indisponível, sem saldo, sem resposta ou ação ainda não liberada: mensagem clara, nada gravado, nunca resposta simulada", async () => {
  const casos = [
    [{ ok: false, versao: 1, modo: "REAL", estado: "erro", mensagem: "A Anthropic está indisponível agora.", erro: { codigo: "provedor_indisponivel", mensagem: "x" } }, "erro", /indisponível/],
    [{ ok: false, versao: 1, modo: "REAL", estado: "erro", mensagem: "O limite de gasto da IA deste mês foi atingido.", erro: { codigo: "orcamento_esgotado", mensagem: "x" } }, "erro", /limite de gasto/],
    [{ ok: false, versao: 1, modo: "DEMO", mensagem: "x", avisos: [], erro: { codigo: "rede", mensagem: "falha" } }, "erro", /A IA não leu o documento/],
    [{ ok: false, versao: 1, modo: "REAL", estado: "incerto", id: "uso-7", mensagem: "A resposta demorou demais.", erro: { codigo: "tempo_esgotado", mensagem: "x" } }, "erro", /Id da chamada: uso-7/],
    [{ ok: false, versao: 1, mensagem: "x", erro: { codigo: "sem_real", mensagem: "x" } }, "nao_liberado", /ainda não está liberada no servidor/],
    [{ ok: false, versao: 1, mensagem: "x", erro: { codigo: "entrada_invalida", mensagem: "Ação desconhecida." } }, "nao_liberado", /ainda não está liberada/],
    [{ ok: true, versao: 1, modo: "DEMO", resultado: { _demo: true, itens: [] } }, "nao_liberado", /ainda não está liberada/],
    [null, "erro", /sem resposta/],
  ];
  for (const [ia, estado, re] of casos) { const { c, ch } = ambiente({ ia }); const x = await c.fxIA([arq("n.jpg", JPG, "x", "image/jpeg")]); assert.equal(x.estado, estado, JSON.stringify(ia)); assert.match(x.mensagem, re); assert.equal(x.r, undefined, "sem leitura"); assert.deepEqual([ch.rpc, ch.upload], [0, 0]); }
  const cai = ambiente({ ia: () => { throw new Error("sem internet"); } }); const e = await cai.c.fxIA([arq("n.jpg", JPG, "x", "image/jpeg")]); assert.equal(e.estado, "erro"); assert.match(e.mensagem, /sem internet.*Nada foi gravado/);
});
test("proteção contra envio duplicado: um documento por vez; o mesmo documento na mesma tela não é enviado de novo", async () => {
  const { c, ch } = ambiente({ ia: () => new Promise((r) => setTimeout(() => r({ ok: true, versao: 1, modo: "REAL", resultado: resposta(), avisos: [], id: "u" }), 0)) });
  const f = () => arq("nota.jpg", JPG, "mesma foto", "image/jpeg");
  const [a, b] = await Promise.all([c.fxIA([f()]), c.fxIA([f()])]); assert.deepEqual([a.estado, b.estado].sort(), ["lido", "ocupado"]); assert.equal(ch.ia.length, 1);
  const de_novo = await c.fxIA([f()]); assert.equal(de_novo.estado, "cache"); assert.match(de_novo.mensagem, /nada foi enviado de novo/); assert.equal(ch.ia.length, 1, "continua uma única chamada");
  const outra = await c.fxIA([arq("outra.jpg", JPG, "outra foto", "image/jpeg")]); assert.equal(outra.estado, "lido"); assert.equal(ch.ia.length, 2);
  const libera = await ambiente({ ia: () => { throw new Error("falha"); } }).c.fxIA([f()]); assert.equal(libera.estado, "erro");
  const falha = ambiente({ ia: (n) => (n === 1 ? { ok: false, versao: 1, erro: { codigo: "rede", mensagem: "x" } } : { ok: true, versao: 1, modo: "REAL", resultado: resposta(), avisos: [], id: "u" }) });
  assert.equal((await falha.c.fxIA([f()])).estado, "erro"); assert.equal((await falha.c.fxIA([f()])).estado, "lido", "depois de uma falha dá para tentar de novo");
});
test("duplicidade da leitura: nota já gravada é bloqueada; compra ou Mercado parecidos só avisam; sem leitura obrigatória nada quebra", async () => {
  const dup = ambiente({ tab: { notas_fiscais: [{ id: "n1", chave: CHAVE, situacao: "autorizada" }] } }); const x = await dup.c.fxIA([arq("n.jpg", JPG, "a", "image/jpeg")]);
  assert.equal(x.r.dup.duplicada, true); const t = texto(dup.c.fxCartao(x.r, false)); assert.match(t, /já está na Central Fiscal: não é gravada de novo/); assert.match(t, /Gravação.*Bloqueada/);
  const parecida = ambiente({ tab: { notas: [{ id: "m1", data: "2026-11-06", total: 54, mercados: { nome: "Mercado Exemplo" } }] } }); const y = await parecida.c.fxIA([arq("n.jpg", JPG, "b", "image/jpeg")]);
  assert.equal(y.r.dup.duplicada, false); assert.match(texto(parecida.c.fxCartao(y.r, false)), /Possível duplicidade no Mercado.*Nenhuma despesa será criada/); assert.deepEqual([parecida.ch.rpc, parecida.ch.upload], [0, 0]);
  const pend = ambiente({ tab: { notas_fiscais: [{ id: "n9", chave: CHAVE, situacao: "contingencia" }] } }); const z = await pend.c.fxIA([arq("n.jpg", JPG, "c", "image/jpeg")]);
  assert.deepEqual({ ...z.r.dup.atualizar_situacao }, { id: "n9", de: "contingencia", para: "autorizada" }); assert.match(texto(pend.c.fxCartao(z.r, false)), /atualização da situação ainda não é feita por esta tela/);
});
test("a tela mostra cada caso: baixa confiança, divergência, pendente e cancelada, com o motivo", async () => {
  const mostrar = async (res) => { const { c } = ambiente({ ia: { ok: true, versao: 1, modo: "REAL", resultado: res, avisos: [], id: "u" } }); const x = await c.fxIA([arq("n.jpg", JPG, "z" + JSON.stringify(res).length, "image/jpeg")]); return texto(c.fxCartao(x.r, false)); };
  const b60 = await mostrar(resposta({ confianca: 0.6 }));
  assert.match(b60, /Conta dos itens Baixa confiança/); assert.match(b60, /Baixa confiança: Confiança da leitura \(60%\) abaixo do mínimo \(90%\)/); assert.match(b60, /Confiança da leitura 60%/); assert.match(b60, /Gravação Bloqueada/);
  assert.match(await mostrar(resposta({ total: 60 })), /Conta dos itens.*Divergente[\s\S]*R\$ 6,00 a menos que o total fiscal/);
  assert.match(await mostrar(resposta({ situacao: "contingencia", protocolo: null })), /Situação fiscal.*Contingência — pendente de validação fiscal[\s\S]*Atende às regras/);
  assert.match(await mostrar(resposta({ situacao: "cancelada" })), /Situação fiscal.*Cancelada — não vale como compra[\s\S]*não vale como compra fiscal validada[\s\S]*Gravação.*Bloqueada/);
  assert.match(await mostrar(resposta({ incertos: [{ campo: "total", motivo: "cortado" }] })), /Incerto — total: cortado/);
});
test("correção manual na tela: o formulário refaz a nota, roda tudo de novo e a revisão humana vale como confiança 100%", async () => {
  const { c } = ambiente({ ia: { ok: true, versao: 1, modo: "REAL", resultado: resposta({ confianca: 0.7, total: 60 }), avisos: [], id: "u" } }); const x = await c.fxIA([arq("n.jpg", JPG, "corrigir", "image/jpeg")]);
  const cartao = c.fxCartao(x.r, false), antes = texto(cartao); assert.match(antes, /Conta dos itens Baixa confiança/); assert.match(antes, /Divergência: A conta dos itens/); assert.match(antes, /Baixa confiança: Confiança da leitura \(70%\)/);
  const campo = (rotulo) => achar(cartao, (n) => n.tag === "input" && n.attrs["aria-label"] === rotulo)[0];
  campo("Total da nota").value = "54,00"; const chk = achar(cartao, (n) => n.tag === "input" && n.attrs.type === "checkbox")[0]; chk.checked = true;
  const btn = achar(cartao, (n) => n.tag === "button" && /Aplicar correção/.test(n.attrs.text || ""))[0]; btn.onclick();
  for (let i = 0; i < 30 && !x.r.ultimoCartao; i++) await new Promise((r) => setImmediate(r));
  const depois = texto(x.r.ultimoCartao);
  assert.equal(x.r.nota.valores.total, 54); assert.equal(x.r.ia.revisada, true); assert.match(depois, /Confiança da leitura.*100% \(você conferiu com o documento; a IA tinha 70%\)/); assert.match(depois, /Conta dos itens.*Consistente/); assert.match(depois, /Atende às regras/);
  // revisar sem corrigir um erro de conta NÃO libera
  const { c: c2 } = ambiente({ ia: { ok: true, versao: 1, modo: "REAL", resultado: resposta({ total: 60 }), avisos: [], id: "u" } }); const y = await c2.fxIA([arq("n.jpg", JPG, "corrigir2", "image/jpeg")]);
  const cart2 = c2.fxCartao(y.r, false); achar(cart2, (n) => n.tag === "input" && n.attrs.type === "checkbox")[0].checked = true; achar(cart2, (n) => n.tag === "button" && /Aplicar/.test(n.attrs.text || ""))[0].onclick();
  for (let i = 0; i < 30 && !y.r.ultimoCartao; i++) await new Promise((r) => setImmediate(r));
  assert.match(texto(y.r.ultimoCartao), /Conta dos itens.*Divergente[\s\S]*Gravação.*Bloqueada/);
});
test("a tela só oferece a leitura por IA ao dono; a Fernanda continua vendo só o que via", () => {
  const js = ler("js/fiscal.js");
  assert.match(js, /typeof isOwner==="function"&&isOwner\(\)/); assert.ok((js.match(/isOwner\(\)/g) || []).length >= 2);
  const sem = js.replace(/\/\*[\s\S]*?\*\//g, ""), i = sem.indexOf('if(typeof isOwner==="function"&&isOwner()){'); assert.ok(i > 0 && sem.indexOf("Ler foto ou PDF com IA") > i, "o botão fica dentro da condição de dono");
  assert.match(sem, /"Fotos e PDF ainda não são lidos \(sem OCR\)\. "/, "quem não é dono vê o texto de antes");
});
test("segurança e escopo: nenhuma chave no site, nenhuma rede solta, IA só pela porta racIA; a leitura por IA não grava, não envia ao Storage e não cria despesa", () => {
  const js = ler("js/fiscal.js").replace(/\/\*[\s\S]*?\*\//g, ""), ia = js.slice(js.indexOf("var FX_PDF="), js.indexOf("function fxResultado("));
  assert.ok(ia.length > 3000); assert.ok(!/anthropic|api\.anthropic|x-api-key|sk-ant|fetch\(|XMLHttpRequest|localStorage|sessionStorage|\.insert\(|\.update\(|\.upsert\(|\.delete\(|storage|fxRpc|gera_despesa/i.test(ia), "o bloco da leitura por IA só usa racIA e leituras");
  assert.ok(!/eval\(|new Function|innerHTML\s*=\s*[^"'\s]/.test(ia), "nada de execução dinâmica nem HTML de fora"); assert.match(ia, /isEvalSupported:false/);
  assert.match(js, /cdnjs\.cloudflare\.com\/ajax\/libs\/pdf\.js\/3\.11\.174\/pdf\.min\.js/, "biblioteca de CDN com versão exata (a mesma do Compras)");
  assert.ok(!/ANTHROPIC|sk-ant-/.test(ler("nucleo.js") + ler("js/fiscal.js")), "nenhuma chave no site");
  for (const f of ["js/garmin.js", "supabase/functions/garmin/index.ts"]) if (fs.existsSync(new URL("../" + f, import.meta.url))) assert.ok(!/fiscal\.nota/.test(ler(f)), f + " intocado");
});
