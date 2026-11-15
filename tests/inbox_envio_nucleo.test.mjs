// RAC Inbox · I3 · regras PURAS da composição e do envio no navegador (nucleo.js, js/inbox-servico.js): endereços, assunto com prefixo, rascunho de resposta / resposta a todos / encaminhamento,
// validação antes da revisão, contrato do pedido e classificação do resultado. Tudo fictício; sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8");
const A = "aaaaaaaa-0000-4000-8000-000000000001", B = "bbbbbbbb-0000-4000-8000-000000000001", E = "eeeeeeee-0000-4000-8000-000000000001";
const ORIG = { de: { nome: "Bia Souza", endereco: "Bia@Exemplo.com" }, para: [{ nome: "Eu", endereco: "ana@icloud.com" }, { nome: "", endereco: "caio@exemplo.com" }], cc: [{ nome: "", endereco: "DUDA@exemplo.com" }, { nome: "", endereco: "ana@icloud.com" }],
  assunto: "Plano de viagem", recebida: "2026-11-14T10:20:30.000Z", texto: "Olá!\n\nVamos às 10h?\nAbraço", truncado: false, anexos: [] };

test("endereços: separa por vírgula, ponto e vírgula ou linha; aceita 'Nome <e@x.com>'; minúsculas; sem duplicidade; o inválido volta separado", () => {
  assert.deepEqual(N.inbEnderecosDe("Bia@Exemplo.com, Ana <ana@icloud.com>; bia@exemplo.com\ncaio@x.com"), { lista: ["bia@exemplo.com", "ana@icloud.com", "caio@x.com"], invalidos: [] });
  assert.deepEqual(N.inbEnderecosDe("sem-arroba, a@b, ok@x.com").invalidos, ["sem-arroba", "a@b"]);
  assert.deepEqual(N.inbEnderecosDe("a@b.com\r\nBcc: x@y.com").lista, ["a@b.com"], "a linha injetada não vira cabeçalho: só 'Bcc: x@y.com' é lido como texto e vira inválido");
  assert.equal(N.inbEnderecosDe("a@b.com\r\nBcc: x@y.com").invalidos.length, 1); assert.deepEqual(N.inbEnderecosDe("").lista, []); assert.deepEqual(N.inbEnderecosDe(null).lista, []);
  assert.equal(N.inbEnderecosDe("x".repeat(300) + "@b.com").invalidos.length, 1, "endereço longo demais");
});

test("assunto: 'Re: ' e 'Enc: ' sem repetir; '(sem assunto)' é só texto de exibição", () => {
  assert.equal(N.inbPrefixoAssunto("Plano", "responder"), "Re: Plano"); assert.equal(N.inbPrefixoAssunto("Re: Plano", "responder"), "Re: Plano"); assert.equal(N.inbPrefixoAssunto("RES: Plano", "responder"), "RES: Plano");
  assert.equal(N.inbPrefixoAssunto("Plano", "encaminhar"), "Enc: Plano"); assert.equal(N.inbPrefixoAssunto("Fwd: Plano", "encaminhar"), "Fwd: Plano"); assert.equal(N.inbPrefixoAssunto("Re: Plano", "encaminhar"), "Enc: Re: Plano");
  assert.equal(N.inbPrefixoAssunto("(sem assunto)", "responder"), "Re: "); assert.equal(N.inbPrefixoAssunto("Oi\r\nBcc: x@y.com", "responder"), "Re: Oi Bcc: x@y.com", "quebra de linha vira espaço");
});

test("responder: só o remetente, assunto com prefixo e a original citada com data e autor; a original não é alterada", () => {
  const copia = JSON.stringify(ORIG); const r = N.inbMontarRascunho("responder", ORIG, "ana@icloud.com");
  assert.deepEqual([r.para, r.cc, r.cco, r.assunto], [["bia@exemplo.com"], [], [], "Re: Plano de viagem"]);
  assert.match(r.texto, /^\n\nEm 14 de novembro de 2026, \d\d:\d\d, Bia Souza <Bia@Exemplo\.com> escreveu:\n> Olá!\n>\n> Vamos às 10h\?\n> Abraço$/); assert.equal(JSON.stringify(ORIG), copia, "a mensagem original não é tocada");
  const minha = N.inbMontarRascunho("responder", { ...ORIG, de: { nome: "", endereco: "ANA@icloud.com" } }, "ana@icloud.com"); assert.deepEqual(minha.para, ["caio@exemplo.com"], "responder à própria mensagem escreve ao destinatário, não a si");
});

test("responder a todos: remetente + Para + Cc originais, sem o próprio endereço e sem duplicidade", () => {
  const r = N.inbMontarRascunho("responder_todos", ORIG, "ANA@icloud.com");
  assert.deepEqual([r.para, r.cc], [["bia@exemplo.com", "caio@exemplo.com"], ["duda@exemplo.com"]], "o dono (que estava em Para e em Cc) não aparece");
  const dup = N.inbMontarRascunho("responder_todos", { ...ORIG, para: [{ endereco: "bia@exemplo.com" }, { endereco: "x@y.com" }], cc: [{ endereco: "X@y.com" }, { endereco: "bia@exemplo.com" }] }, "ana@icloud.com");
  assert.deepEqual([dup.para, dup.cc], [["bia@exemplo.com", "x@y.com"], []], "mesmo endereço em vários campos aparece uma vez só");
  const semRemetente = N.inbMontarRascunho("responder_todos", { ...ORIG, de: null }, "ana@icloud.com"); assert.deepEqual(semRemetente.para, ["caio@exemplo.com"]);
});

test("encaminhar: destinatário vazio (editável), 'Enc: ', conteúdo original completo com cabeçalho, e aviso honesto de que os anexos NÃO vão", () => {
  const r = N.inbMontarRascunho("encaminhar", { ...ORIG, anexos: [{ nome: "contrato.pdf" }, { nome: null }] }, "ana@icloud.com");
  assert.deepEqual([r.para, r.cc, r.assunto], [[], [], "Enc: Plano de viagem"]);
  assert.match(r.texto, /---------- Mensagem encaminhada ----------\nDe: Bia Souza <Bia@Exemplo\.com>\nData: 14 de novembro de 2026, \d\d:\d\d\nAssunto: Plano de viagem\nPara: Eu <ana@icloud\.com>, caio@exemplo\.com\nCc: DUDA@exemplo\.com, ana@icloud\.com\n\nOlá!\n\nVamos às 10h\?\nAbraço$/);
  assert.equal(r.avisos.length, 1); assert.match(r.avisos[0], /2 anexos da mensagem original não são encaminhados nesta etapa: contrato\.pdf, \(sem nome\)/);
  assert.deepEqual(N.inbMontarRascunho("encaminhar", ORIG, "ana@icloud.com").avisos, []);
});

test("textos enormes ou truncados: o rascunho cabe no limite e avisa", () => {
  const grande = N.inbMontarRascunho("responder", { ...ORIG, texto: "linha\n".repeat(20000), truncado: true }, "ana@icloud.com");
  assert.ok(grande.texto.length <= N.INB_LIM_ENVIO.texto, "cabe no limite do envio"); assert.equal(grande.avisos.length, 2); assert.ok(grande.texto.endsWith("[…]"));
  assert.equal(N.inbMontarRascunho("responder", {}, "").assunto, "Re: ", "origem vazia não quebra");
});

test("validação antes da revisão: destinatário obrigatório, endereço inválido, limites, sem assunto e sem texto; devolve a entrada normalizada", () => {
  const ok = N.inbValidarRascunho({ modo: "novo", para: "Bia@x.com, bia@x.com", cc: "caio@x.com, bia@x.com", cco: "duda@x.com", assunto: "  Olá  ", texto: "Oi" });
  assert.deepEqual(ok, { ok: true, total: 3, entrada: { modo: "novo", para: ["bia@x.com"], cc: ["caio@x.com"], cco: ["duda@x.com"], assunto: "Olá", texto: "Oi" } });
  assert.deepEqual(N.inbValidarRascunho({ modo: "novo", para: "", assunto: "x", texto: "y" }).erros, { para: "Informe ao menos um destinatário em Para." });
  assert.match(N.inbValidarRascunho({ modo: "novo", para: "x", assunto: "a", texto: "b" }).erros.para, /Endereço inválido: x/); assert.match(N.inbValidarRascunho({ modo: "novo", para: "a@b.com", cc: "zzz", assunto: "a", texto: "b" }).erros.cc, /inválido/);
  assert.equal(N.inbValidarRascunho({ modo: "novo", para: "a@b.com", assunto: "", texto: "  " }).erros.texto, "Escreva um assunto ou uma mensagem."); assert.equal(N.inbValidarRascunho({ modo: "novo", para: "a@b.com", assunto: "", texto: "só texto" }).ok, true, "sem assunto é permitido");
  assert.match(N.inbValidarRascunho({ modo: "novo", para: "a@b.com", assunto: "x".repeat(301), texto: "b" }).erros.assunto, /longo demais/); assert.match(N.inbValidarRascunho({ modo: "novo", para: "a@b.com", assunto: "a", texto: "x".repeat(100001) }).erros.texto, /longa demais/);
  assert.match(N.inbValidarRascunho({ modo: "novo", para: Array.from({ length: 21 }, (_, i) => "p" + i + "@x.com").join(","), assunto: "a", texto: "b" }).erros.geral, /Destinatários demais/);
  assert.match(N.inbValidarRascunho({ modo: "novo", para: "a@b.com", assunto: "a\nb", texto: "b" }).erros.assunto, /quebra de linha/); assert.ok(N.inbValidarRascunho({ modo: "zzz", para: "a@b.com", assunto: "a", texto: "b" }).erros.geral);
  const resp = N.inbValidarRascunho({ modo: "responder", para: "a@b.com", assunto: "Re: a", texto: "b", origem: { pasta_id: B, uid: 7 } }); assert.deepEqual([resp.entrada.pasta_id, resp.entrada.uid], [B, 7]);
  assert.ok(N.inbValidarRascunho({ modo: "responder", para: "a@b.com", assunto: "Re: a", texto: "b" }).erros.geral, "resposta sem origem é recusada");
});

test("contrato do pedido: enviar_mensagem é a única que escreve; campos opcionais são validados e copiados; origem só em resposta; nada de credencial nem campo extra", () => {
  const base = { conta_id: A, envio_id: E, modo: "novo", para: ["a@b.com"], cc: [], cco: [], assunto: "Oi", texto: "Texto" };
  assert.deepEqual(N.inbPedido("enviar_mensagem", base), { ok: true, pedido: { operacao: "enviar_mensagem", ...base } });
  assert.deepEqual(N.inbPedido("enviar_mensagem", { ...base, modo: "responder", pasta_id: B, uid: 5 }).pedido.uid, 5);
  const e = (x) => N.inbPedido("enviar_mensagem", { ...base, ...x }).erro;
  assert.equal(e({ modo: "responder" }), "origem_invalida"); assert.equal(e({ pasta_id: B, uid: 5 }), "origem_invalida", "e-mail novo não tem origem"); assert.equal(e({ modo: "responder", pasta_id: B }), "origem_invalida");
  assert.equal(e({ para: [] }), "destinatario_invalido"); assert.equal(e({ para: ["x"] }), "destinatario_invalido"); assert.equal(e({ cc: "a@b.com" }), "destinatario_invalido"); assert.equal(e({ modo: "bcc" }), "modo_invalido");
  assert.equal(e({ assunto: "a\nb" }), "assunto_invalido"); assert.equal(e({ texto: "x".repeat(100001) }), "texto_grande_demais"); assert.equal(e({ envio_id: "1" }), "id_invalido"); assert.equal(e({ anexos: [] }), "campos_inesperados");
  assert.equal(e({ senha: "x" }), "credencial_proibida"); assert.equal(N.inbPedido("enviar_mensagem", { conta_id: A }).erro, "campo_ausente");
  assert.deepEqual(N.inbPedido("smtp_prova", { conta_id: A }), { ok: true, pedido: { operacao: "smtp_prova", conta_id: A } }); assert.equal(N.inbPedido("smtp_prova", { conta_id: A, enviar_teste: "sim" }).erro, "campo_ausente");
  assert.deepEqual(N.inbPedido("enviar", base), { ok: false, erro: "escrita_fora_do_escopo" }, "o verbo antigo continua barrado; só a operação nomeada passa");
  for (const c of ["envio_incerto", "envio_recusado", "destinatario_recusado", "smtp_autenticacao_recusada", "registro_envio_indisponivel", "envio_em_andamento"]) assert.ok(N.INB_ERROS ? true : N.inbErroTexto(c).length > 20 && !/código/.test(N.inbErroTexto(c)), c);
  assert.match(N.inbErroTexto("envio_incerto"), /PODE ter sido enviado/); assert.match(N.inbErroTexto("envio_recusado"), /Nada foi enviado/);
});

test("classes de resultado: enviado só com confirmação; incerto pede conferência; rede/5xx pede 'confirmar' (repetir o MESMO envio é seguro); o resto é falha confirmada", () => {
  assert.equal(N.inbClasseEnvio({ ok: true, resultado: "enviado" }), "enviado");
  assert.equal(N.inbClasseEnvio({ ok: false, erro: "envio_incerto" }), "incerto");
  for (const c of ["rede", "servico_indisponivel", "resposta_invalida", "limite"]) assert.equal(N.inbClasseEnvio({ ok: false, erro: c }), "confirmar", c);
  for (const c of ["envio_recusado", "destinatario_recusado", "credencial_invalida", "mfa_requerido", "sem_login", "registro_envio_indisponivel", "smtp_indisponivel"]) assert.equal(N.inbClasseEnvio({ ok: false, erro: c }), "falha", c);
  assert.equal(N.inbClasseEnvio(null), "falha");
  assert.deepEqual(N.inbRespostaEnvio({ ok: true, resultado: "enviado", message_id: "<a@b.c>", enviados: "atualizada", extra: "x", repetido: true }), { ok: true, resultado: "enviado", repetido: true, enviados: "atualizada" });
  for (const ruim of [null, { ok: true }, { ok: true, resultado: "talvez", message_id: "<a@b.c>", enviados: "atualizada" }, { ok: true, resultado: "enviado", message_id: "<a@b.c>", enviados: "sim" }, { ok: false, resultado: "enviado" }]) assert.deepEqual(N.inbRespostaEnvio(ruim), { ok: false, erro: "resposta_invalida" });
});

test("cliente do serviço: o envio leva só os campos do contrato (sem credencial), HTTP 202 incerto vira código, e a prova vira etapas legíveis", async () => {
  const chamadas = []; let resposta;
  const ctx = { console, Promise, Object, Array, JSON, String, Number, NUCLEO: N, SB: { functions: { invoke: (nome, o) => { chamadas.push([nome, JSON.parse(JSON.stringify(o))]); return Promise.resolve(resposta); } } } };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(ler("js/inbox-servico.js"), ctx);
  const chamar = async (...a) => JSON.parse(JSON.stringify(await ctx.inboxChamar(...a)));
  const ped = { conta_id: A, envio_id: E, modo: "novo", para: ["a@b.com"], assunto: "Oi", texto: "Texto" };
  resposta = { data: { ok: true, resultado: "enviado", message_id: "<x@icloud.com>", enviados: "atualizada" }, error: null };
  assert.deepEqual(await chamar("enviar_mensagem", ped), { ok: true, resultado: "enviado", repetido: false, enviados: "atualizada" }); assert.deepEqual(chamadas.at(-1)[1].body, { operacao: "enviar_mensagem", ...ped });
  resposta = { data: { ok: false, erro: "envio_incerto" }, error: null }; assert.deepEqual(await chamar("enviar_mensagem", ped), { ok: false, erro: "envio_incerto" }, "o 202 chega como dado, não como erro HTTP");
  resposta = { data: null, error: { name: "FunctionsHttpError", message: "x", context: { status: 422, json: () => Promise.resolve({ ok: false, erro: "destinatario_recusado" }) } } }; assert.deepEqual(await chamar("enviar_mensagem", ped), { ok: false, erro: "destinatario_recusado" });
  resposta = { data: null, error: { name: "FunctionsFetchError", message: "x" } }; assert.deepEqual(await chamar("enviar_mensagem", ped), { ok: false, erro: "rede" });
  const antes = chamadas.length; assert.deepEqual(await chamar("enviar_mensagem", { ...ped, senha: "abcd-efgh-ijkl-mnop" }), { ok: false, erro: "credencial_proibida" }); assert.equal(chamadas.length, antes, "pedido inválido nem sai do navegador");
  resposta = { data: { ok: true, aprovada: false, host: "x", porta: 1, etapas: [{ etapa: "conexao_tcp", ok: true, ms: 40 }, { etapa: "autenticacao", ok: false, codigo: 535, ms: 99 }], total_ms: 300, teste: "nao_enviado", erro: "smtp_autenticacao_recusada", etapa_falha: "autenticacao" }, error: null };
  const p = await chamar("smtp_prova", { conta_id: A }); assert.deepEqual([p.ok, p.aprovada, p.erro, p.etapa_falha, p.etapas[1].rotulo, p.etapas[1].codigo, p.etapas[0].codigo], [true, false, "smtp_autenticacao_recusada", "autenticacao", "Login (AUTH)", 535, null]);
  resposta = { data: { ok: true, aprovada: true, etapas: [{ etapa: "hackear", ok: true, ms: 1 }], total_ms: 1, teste: "nao_enviado" }, error: null }; assert.deepEqual(await chamar("smtp_prova", { conta_id: A }), { ok: false, erro: "resposta_invalida" });
});
