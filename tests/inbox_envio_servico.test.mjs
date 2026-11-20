// RAC Inbox · I3 · o serviço do ENVIO e da prova de SMTP (supabase/functions/rac-inbox/envio.ts, contrato.ts e servico.ts). TUDO SIMULADO: Worker, cofre e banco são de mentira e REGISTRAM cada chamada.
// Prova: as três classes de resultado, repetição sem envio duplicado, responder / responder a todos / encaminhar, isolamento entre contas e donos, MFA, e que a credencial, os endereços, o assunto e o texto nunca
// vão para resposta de erro nem para o registro. NÃO prova o iCloud real nem o PostgreSQL (o SQL é de tests/inbox_envio_sql.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { validarPedido, ERROS, empacotar, VERSAO_FUNCAO } from "../supabase/functions/rac-inbox/contrato.ts";
import { atender } from "../supabase/functions/rac-inbox/servico.ts";
import { filtrarProva } from "../supabase/functions/rac-inbox/envio.ts";

const U1 = "11111111-1111-4111-8111-111111111111", U2 = "22222222-2222-4222-8222-222222222222", C1 = "aaaaaaaa-0000-4000-8000-000000000001", C2 = "aaaaaaaa-0000-4000-8000-000000000002";
const P_IN = "bbbbbbbb-0000-4000-8000-000000000001", P_ENV = "bbbbbbbb-0000-4000-8000-000000000002", E1 = "eeeeeeee-0000-4000-8000-000000000001";
const USUARIO = "ana@icloud.com", SENHA = "abcd-efgh-ijkl-mnop", ENDERECO = "ana@icloud.com";
const AGORA = new Date("2026-11-15T12:00:00.123Z");
const PED = (extra = {}) => ({ operacao: "enviar_mensagem", conta_id: C1, envio_id: E1, modo: "novo", para: ["bia@exemplo.com"], cc: [], cco: [], assunto: "Olá, amiga", texto: "Texto secreto do e-mail", ...extra });
const RESP = (extra = {}) => PED({ modo: "responder", pasta_id: P_IN, uid: 42, ...extra });

function cofreFalso({ ler = true } = {}) {
  const chamadas = [];
  return { chamadas, async guardar() {}, async ler(d, c) { chamadas.push(["ler", d, c]); return ler ? empacotar(USUARIO, SENHA) : null; }, async remover() { return true; }, async estado() { return "ativa"; }, async marcar(d, c, e) { chamadas.push(["marcar", d, c, e]); } };
}
/* banco em memória com a MESMA regra do repositório (tests/inbox_envio_sql.test.mjs prova o SQL real) */
function bancoFalso({ enderecos = { [U1 + C1]: ENDERECO }, semEnvio = false, velho = false } = {}) {
  const envios = new Map(), log = [];
  const b = {
    envios, log,
    async pasta(d, c, id) { log.push(["pasta", id]); return id === P_IN ? { id, nome_externo: "INBOX" } : id === P_ENV ? { id, nome_externo: "Sent Messages" } : null; },
    async estadoSync() { return { uidvalidity: 700, uidnext: 50 }; },
    async salvarPastas() { return []; }, async travar() { log.push(["travar"]); return true; }, async destravar() { log.push(["destravar"]); },
    async aplicarSync(d, c, id, a) { log.push(["aplicarSync", id, a.mensagens.length]); return { novas: a.mensagens.length, atualizadas: 0, removidas: 0 }; }, async falhaSync() {}, async estadoConta() {},
    async contaEndereco(d, c) { return enderecos[d + c] ?? null; },
    async pastaPorUso(d, c, uso) { return uso === "enviados" ? { id: P_ENV, nome_externo: "Sent Messages" } : null; },
    async envioIniciar(d, c, id, a) {
      const x = envios.get(id);
      if (!x) { envios.set(id, { dono: d, conta: c, estado: "pendente", message_id: a.message_id, modo: a.modo, destinatarios: a.destinatarios, codigo: null }); return { novo: true, estado: "pendente", message_id: a.message_id }; }
      if (x.dono !== d || x.conta !== c) return null;
      if (x.estado === "falha") { x.estado = "pendente"; x.codigo = null; return { novo: true, estado: "pendente", message_id: a.message_id }; }
      if (x.estado === "pendente" && velho) { x.estado = "incerto"; return { novo: false, estado: "incerto", message_id: x.message_id }; }
      return { novo: false, estado: x.estado, message_id: x.message_id };
    },
    async envioFinalizar(d, c, id, estado, codigo) { const x = envios.get(id); if (x && x.estado === "pendente") { x.estado = estado; x.codigo = codigo; } },
  };
  if (semEnvio) { delete b.envioIniciar; delete b.envioFinalizar; }
  return b;
}
/* Worker de mentira: `enviar` responde conforme o cenário; ler_mensagem devolve a original; listar_mensagens (Enviados) devolve vazio */
function workerFalso({ enviar = { ok: true, dados: { resultado: "enviado", smtp: 250, duracao_ms: 900 } }, original = { message_id: "<orig-9@exemplo.com>", referencias: ["<orig-1@exemplo.com>"] }, prova, falhaEnviados = false } = {}) {
  const chamadas = [];
  return { chamadas, async executar(op, ped, cred) {
    chamadas.push([op, structuredClone(ped), cred === null ? null : { ...cred }]);
    if (op === "enviar") { if (enviar instanceof Error) throw enviar; return typeof enviar === "function" ? enviar(ped) : enviar; }
    if (op === "ler_mensagem") return { ok: true, dados: { mensagem: original } };
    if (op === "smtp_prova") return prova instanceof Error ? (() => { throw prova; })() : prova ?? { ok: true, dados: { aprovada: true, host: "smtp.mail.me.com", porta: 587, etapas: [{ etapa: "conexao_tcp", ok: true, ms: 40 }], total_ms: 900, teste: "nao_enviado" } };
    if (op === "listar_mensagens") return falhaEnviados ? { ok: false, erro: "timeout" } : { ok: true, dados: { exame: { uidvalidity: 5, uidnext: 3 }, mensagens_na_pasta: 0, mensagens: [], mais: false, duracao_ms: 10 } };
    return { ok: false, erro: "operacao_desconhecida" };
  } };
}
function ctx({ worker = workerFalso(), banco = bancoFalso(), cofre = cofreFalso(), usuario = { id: U1, mfaOk: true } } = {}) {
  const logs = []; return { c: { usuario, cofre, banco, worker, agora: () => AGORA, registrar: (e) => logs.push(e) }, logs, cofre, banco, worker };
}
const SEGREDOS = [SENHA, "abcd-efgh", "Texto secreto", "Olá, amiga", "bia@exemplo.com", "caio@exemplo.com", "secreto@exemplo.com"];
const limpo = (r, logs, permitir = []) => { const t = JSON.stringify([r, logs]); for (const s of SEGREDOS) if (!permitir.includes(s)) assert.ok(!t.includes(s), "vazou: " + s); };
const envios = (w) => w.chamadas.filter((c) => c[0] === "enviar");

test("contrato: o pedido de envio é fechado; endereços em minúsculas, sem duplicidade; origem só em resposta/encaminhamento; limites", () => {
  const v = (x) => validarPedido(x);
  const ok = v(PED({ para: ["Bia@Exemplo.com", "bia@exemplo.com"], cc: ["BIA@exemplo.com", "caio@exemplo.com"], cco: ["caio@exemplo.com"] }));
  assert.equal(ok.ok, true); assert.deepEqual([ok.pedido.para, ok.pedido.cc, ok.pedido.cco], [["bia@exemplo.com"], ["caio@exemplo.com"], []], "duplicidade removida (Para tem precedência sobre Cc e Cco)");
  assert.equal(v({ ...PED(), anexos: [] }).erro, "campos_inesperados", "sem anexo e sem campo extra nesta etapa");
  assert.equal(v(PED({ modo: "bcc" })).erro, "modo_invalido"); assert.equal(v(PED({ pasta_id: P_IN, uid: 1 })).erro, "origem_invalida", "novo e-mail não tem origem");
  assert.equal(v(RESP({ uid: 0 })).erro, "origem_invalida"); assert.equal(v(PED({ modo: "encaminhar" })).erro, "origem_invalida"); assert.equal(v(RESP()).ok, true); assert.equal(v(PED({ modo: "encaminhar", pasta_id: P_IN, uid: 7 })).ok, true);
  assert.equal(v(PED({ envio_id: "x" })).erro, "id_invalido"); assert.equal(v(PED({ para: [] })).erro, "destinatario_invalido"); assert.equal(v(PED({ para: ["x"] })).erro, "destinatario_invalido");
  assert.equal(v(PED({ para: ["a@b.com\r\nBcc: x@y.com"] })).erro, "destinatario_invalido"); assert.equal(v(PED({ para: Array.from({ length: 21 }, (_, i) => "p" + i + "@e.com") })).erro, "destinatarios_demais", "sem envio em massa");
  assert.equal(v(PED({ assunto: "a\nb" })).erro, "assunto_invalido"); assert.equal(v(PED({ assunto: "x".repeat(301) })).erro, "assunto_invalido"); assert.equal(v(PED({ texto: "x".repeat(100001) })).erro, "texto_grande_demais");
  assert.equal(v(PED({ texto: undefined })).erro, "campo_ausente"); assert.equal(v({ ...PED(), envio_id: undefined }).erro, "id_invalido");
  assert.deepEqual([v({ operacao: "smtp_prova", conta_id: C1 }).pedido, v({ operacao: "smtp_prova", conta_id: C1, enviar_teste: true }).pedido.enviar_teste, v({ operacao: "smtp_prova", conta_id: C1, enviar_teste: "sim" }).ok], [{ operacao: "smtp_prova", conta_id: C1, enviar_teste: false }, true, false]);
  for (const c of ["envio_recusado", "destinatario_recusado", "smtp_autenticacao_recusada", "registro_envio_indisponivel"]) assert.ok(ERROS[c] >= 400, c); assert.equal(ERROS.envio_incerto, 202, "incerto não é erro HTTP: o navegador lê o código");
  assert.match(VERSAO_FUNCAO, /^rac-inbox@i4\.1$/);
});

test("ENVIADO: só depois do 'enviado' do Worker; o Worker recebe o endereço da CONTA (não o do navegador), Message-ID derivado do envio_id e o instante do servidor; Enviados é atualizada", async () => {
  const x = ctx(); const r = await atender(PED({ cc: ["caio@exemplo.com"], cco: ["secreto@exemplo.com"] }), x.c);
  assert.deepEqual(r, { status: 200, corpo: { ok: true, resultado: "enviado", message_id: "<" + E1 + "@icloud.com>", enviados: "atualizada" } });
  const [[op, ped, cred]] = envios(x.worker);
  assert.equal(op, "enviar"); assert.deepEqual(cred, { usuario: USUARIO, senha: SENHA }, "a credencial vai ao Worker só nesta chamada");
  assert.deepEqual([ped.de, ped.para, ped.cc, ped.cco, ped.message_id, ped.data, ped.assunto, ped.texto, ped.em_resposta_a], [ENDERECO, ["bia@exemplo.com"], ["caio@exemplo.com"], ["secreto@exemplo.com"], "<" + E1 + "@icloud.com>", "2026-11-15T12:00:00Z", "Olá, amiga", "Texto secreto do e-mail", undefined]);
  assert.deepEqual(x.banco.envios.get(E1), { dono: U1, conta: C1, estado: "enviado", message_id: "<" + E1 + "@icloud.com>", modo: "novo", destinatarios: 3, codigo: null });
  assert.ok(x.worker.chamadas.some((c) => c[0] === "listar_mensagens" && c[1].pasta === "Sent Messages"), "a pasta Enviados foi sincronizada depois da confirmação");
  assert.ok(x.cofre.chamadas.some((c) => c[0] === "marcar" && c[3] === "ativa"));
  limpo(r, x.logs); assert.ok(x.logs.every((l) => Object.keys(l).every((k) => ["operacao", "codigo", "status", "detalhe"].includes(k))));
});

test("falha ao atualizar a pasta Enviados NÃO muda o resultado: continua 'enviado', só avisa que o cache não foi atualizado", async () => {
  const x = ctx({ worker: workerFalso({ falhaEnviados: true }) }); const r = await atender(PED(), x.c);
  assert.deepEqual([r.status, r.corpo.resultado, r.corpo.enviados], [200, "enviado", "nao_atualizada"]); assert.equal(x.banco.envios.get(E1).estado, "enviado");
  assert.deepEqual(x.banco.log.filter((l) => l[0] === "travar" || l[0] === "destravar").map((l) => l[0]), ["travar", "destravar"], "o travamento é sempre liberado");
});

test("responder: lê a original NO PROVEDOR (nome da pasta e UIDVALIDITY do banco), e o Worker recebe In-Reply-To e References; não altera a original", async () => {
  const x = ctx(); const r = await atender(RESP({ assunto: "Re: Plano" }), x.c); assert.equal(r.corpo.resultado, "enviado");
  const lida = x.worker.chamadas.find((c) => c[0] === "ler_mensagem"); assert.deepEqual(lida[1], { conta_id: C1, pasta: "INBOX", uid: 42, uidvalidity_esperado: 700 });
  const [, ped] = envios(x.worker)[0]; assert.deepEqual([ped.em_resposta_a, ped.referencias], ["<orig-9@exemplo.com>", ["<orig-1@exemplo.com>"]]);
  assert.ok(!x.worker.chamadas.some((c) => /store|append|copy|move|expunge/i.test(c[0])), "nenhuma escrita na caixa");
  assert.deepEqual(x.banco.envios.get(E1).modo, "responder");
});

test("responder a todos: o próprio endereço (conta e login) nunca vai nos destinatários; duplicidade já removida; sem destinatário sobrando, recusa e não envia", async () => {
  const x = ctx(); const r = await atender(RESP({ modo: "responder_todos", para: ["bia@exemplo.com", "ANA@icloud.com"], cc: ["caio@exemplo.com", "ana@icloud.com", "bia@exemplo.com"] }), x.c);
  assert.equal(r.corpo.resultado, "enviado"); const [, ped] = envios(x.worker)[0]; assert.deepEqual([ped.para, ped.cc], [["bia@exemplo.com"], ["caio@exemplo.com"]]);
  const y = ctx(); const r2 = await atender(RESP({ modo: "responder_todos", para: ["ana@icloud.com"] }), y.c); assert.deepEqual([r2.status, r2.corpo.erro], [400, "destinatario_invalido"]); assert.equal(envios(y.worker).length, 0);
  const z = ctx(); await atender(PED({ para: ["ana@icloud.com"] }), z.c); assert.deepEqual(envios(z.worker)[0][1].para, ["ana@icloud.com"], "e-mail NOVO para si mesmo é permitido");
});

test("encaminhar: usa o texto montado pelo dono, sem cabeçalhos de conversa e sem ler a original; pasta de outra conta é recusada", async () => {
  const x = ctx(); const r = await atender(PED({ modo: "encaminhar", pasta_id: P_IN, uid: 42, assunto: "Fwd: Plano" }), x.c); assert.equal(r.corpo.resultado, "enviado");
  assert.ok(!x.worker.chamadas.some((c) => c[0] === "ler_mensagem")); assert.equal(envios(x.worker)[0][1].em_resposta_a, undefined);
  const y = ctx(); const r2 = await atender(PED({ modo: "encaminhar", pasta_id: "bbbbbbbb-0000-4000-8000-0000000000ff", uid: 1 }), y.c);
  assert.deepEqual([r2.status, r2.corpo.erro], [404, "pasta_inexistente"]); assert.equal(envios(y.worker).length, 0); assert.equal(y.banco.envios.get(E1).estado, "falha");
});

test("FALHA CONFIRMADA: o código fechado chega ao navegador; a reserva vira 'falha' e o MESMO envio pode ser tentado de novo", async () => {
  const w = workerFalso({ enviar: { ok: false, erro: "destinatario_recusado" } }); const x = ctx({ worker: w });
  const r = await atender(PED(), x.c); assert.deepEqual([r.status, r.corpo], [422, { ok: false, erro: "destinatario_recusado" }]); assert.equal(x.banco.envios.get(E1).estado, "falha"); limpo(r, x.logs);
  w.executar = workerFalso().executar.bind(workerFalso()); const w2 = workerFalso(); x.c.worker = w2;
  const r2 = await atender(PED(), x.c); assert.equal(r2.corpo.resultado, "enviado"); assert.equal(envios(w2).length, 1, "tentou de novo porque a primeira foi recusada");
  for (const [erro, esperado] of [["smtp_autenticacao_recusada", "smtp_autenticacao_recusada"], ["envio_recusado", "envio_recusado"], ["dados_recusados", "envio_recusado"], ["timeout", "smtp_indisponivel"], ["conexao_falhou", "smtp_indisponivel"], ["assinatura_invalida", "canal_recusado"]]) {
    const y = ctx({ worker: workerFalso({ enviar: { ok: false, erro } }) }); const rr = await atender(PED(), y.c); assert.equal(rr.corpo.erro, esperado, erro); assert.equal(y.banco.envios.get(E1).estado, "falha");
  }
  const cred = ctx({ worker: workerFalso({ enviar: { ok: false, erro: "autenticacao_recusada" } }) }); await atender(PED(), cred.c); assert.ok(!cred.cofre.chamadas.some((c) => c[0] === "marcar" && c[3] === "invalida"), "recusa do SMTP não invalida a credencial do IMAP");
});

test("INCERTO: timeout do canal, Worker caído depois do pedido ou 'envio_incerto' → 202 'envio_incerto', reserva 'incerto' e NENHUM reenvio automático", async () => {
  for (const enviar of [new Error("canal_falhou"), new Error("http_503"), { ok: false, erro: "envio_incerto" }, { ok: false, erro: "falha_interna" }, { ok: true, dados: { resultado: "talvez" } }]) {
    const w = workerFalso({ enviar }); const x = ctx({ worker: w }); const r = await atender(PED(), x.c);
    assert.deepEqual([r.status, r.corpo], [202, { ok: false, erro: "envio_incerto" }]); assert.equal(x.banco.envios.get(E1).estado, "incerto"); limpo(r, x.logs);
    assert.equal(envios(w).length, 1, "UMA tentativa");
    const w2 = workerFalso(); x.c.worker = w2; const r2 = await atender(PED(), x.c);   // o navegador repete o MESMO envio (toque duplo / "tentar de novo")
    assert.deepEqual([r2.status, r2.corpo.erro], [202, "envio_incerto"]); assert.equal(w2.chamadas.length, 0, "repetição do mesmo envio_id não chega ao Worker, nem para ler o Vault");
    const w3 = workerFalso(); x.c.worker = w3; const r3 = await atender(PED({ envio_id: "eeeeeeee-0000-4000-8000-000000000009" }), x.c); assert.equal(r3.corpo.resultado, "enviado", "só um NOVO envio_id (decisão explícita do dono) envia de novo");
  }
});

test("repetir um envio já ENVIADO devolve o resultado registrado sem transmitir; envio em andamento é recusado; pendente velho vira incerto", async () => {
  const x = ctx(); await atender(PED(), x.c); const w2 = workerFalso(); x.c.worker = w2;
  const r = await atender(PED(), x.c); assert.deepEqual(r.corpo, { ok: true, resultado: "enviado", message_id: "<" + E1 + "@icloud.com>", repetido: true, enviados: "nao_atualizada" }); assert.equal(w2.chamadas.length, 0);
  const y = ctx(); y.banco.envios.set(E1, { dono: U1, conta: C1, estado: "pendente", message_id: "<m@icloud.com>", modo: "novo", destinatarios: 1, codigo: null }); const r2 = await atender(PED(), y.c);
  assert.deepEqual([r2.status, r2.corpo.erro], [409, "envio_em_andamento"]); assert.equal(y.worker.chamadas.length, 0);
  const z = ctx({ banco: bancoFalso({ velho: true }) }); z.banco.envios.set(E1, { dono: U1, conta: C1, estado: "pendente", message_id: "<m@icloud.com>", modo: "novo", destinatarios: 1, codigo: null }); assert.equal((await atender(PED(), z.c)).corpo.erro, "envio_incerto");
});

test("isolamento: outro dono, conta alheia ou envio_id de outro usuário nunca chegam ao Worker; sem login, sem MFA, sem credencial e sem registro de envio nada é enviado", async () => {
  const a = ctx({ usuario: { id: U2, mfaOk: true } }); const r = await atender(PED(), a.c); assert.equal(r.corpo.erro, "conta_inexistente"); assert.equal(a.worker.chamadas.length, 0);
  const b = ctx(); b.banco.envios.set(E1, { dono: U2, conta: C2, estado: "enviado", message_id: "<x@icloud.com>", modo: "novo", destinatarios: 1, codigo: null }); const r2 = await atender(PED(), b.c);
  assert.deepEqual([r2.status, r2.corpo.erro], [400, "id_invalido"]); assert.equal(b.worker.chamadas.length, 0, "o id de outro dono não revela estado nem envia");
  assert.equal((await atender(PED(), { ...ctx().c, usuario: null })).corpo.erro, "sem_login"); const m = ctx({ usuario: { id: U1, mfaOk: false } }); assert.equal((await atender(PED(), m.c)).corpo.erro, "mfa_requerido"); assert.equal(m.worker.chamadas.length, 0);
  const s = ctx({ cofre: cofreFalso({ ler: false }) }); assert.equal((await atender(PED(), s.c)).corpo.erro, "credencial_ausente"); assert.equal(s.worker.chamadas.length, 0);
  const n = ctx({ banco: bancoFalso({ semEnvio: true }) }); assert.equal((await atender(PED(), n.c)).corpo.erro, "registro_envio_indisponivel"); assert.equal(envios(n.worker).length, 0, "sem a tabela de controle (056) não há envio");
  const w = ctx(); w.c.worker = null; assert.equal((await atender(PED(), w.c)).corpo.erro, "worker_nao_configurado");
});

test("a prova SMTP: relata etapas e causa sem marcar a credencial como inválida; só envia teste quando pedido e só para a própria conta; a resposta é de esquema fechado", async () => {
  const x = ctx(); const r = await atender({ operacao: "smtp_prova", conta_id: C1 }, x.c);
  assert.deepEqual([r.status, r.corpo.aprovada, r.corpo.teste, r.corpo.porta], [200, true, "nao_enviado", 587]); assert.deepEqual(x.worker.chamadas[0].slice(0, 2), ["smtp_prova", { conta_id: C1 }]);
  const t = ctx(); await atender({ operacao: "smtp_prova", conta_id: C1, enviar_teste: true }, t.c); const [, ped] = t.worker.chamadas[0];
  assert.deepEqual([ped.enviar_teste, ped.endereco, ped.data, /^<teste-[0-9a-f-]{36}@icloud\.com>$/.test(ped.message_id)], [true, ENDERECO, "2026-11-15T12:00:00Z", true]);
  const falha = { ok: true, dados: { aprovada: false, host: "x", porta: 1, etapas: [{ etapa: "autenticacao", ok: false, codigo: 535, ms: 120, senha: SENHA }], total_ms: 700, teste: "nao_enviado", erro: "smtp_autenticacao_recusada", etapa_falha: "autenticacao", extra: SENHA } };
  const f = ctx({ worker: workerFalso({ prova: falha }) }); const rf = await atender({ operacao: "smtp_prova", conta_id: C1 }, f.c);
  assert.deepEqual([rf.corpo.aprovada, rf.corpo.erro, rf.corpo.etapa_falha, rf.corpo.etapas], [false, "smtp_autenticacao_recusada", "autenticacao", [{ etapa: "autenticacao", ok: false, ms: 120, codigo: 535 }]]); limpo(rf, f.logs);
  assert.ok(!f.cofre.chamadas.some((c) => c[0] === "marcar"), "a prova não mexe no estado da credencial"); assert.equal(rf.corpo.host, "smtp.mail.me.com", "host e porta são os da função, não os que o Worker disser");
  for (const ruim of [{ aprovada: true }, { aprovada: true, etapas: [{ etapa: "hackear", ok: true, ms: 1 }], total_ms: 1, teste: "nao_enviado" }, { aprovada: false, etapas: [], total_ms: 1, teste: "nao_enviado" }]) assert.equal(filtrarProva(ruim), null);
  const e = ctx({ worker: workerFalso({ prova: new Error("canal_falhou") }) }); assert.deepEqual([(await atender({ operacao: "smtp_prova", conta_id: C1 }, e.c)).corpo.erro], ["servico_indisponivel"]);
  const outro = ctx({ usuario: { id: U2, mfaOk: true } }); assert.equal((await atender({ operacao: "smtp_prova", conta_id: C1, enviar_teste: true }, outro.c)).corpo.erro, "conta_inexistente"); assert.equal(outro.worker.chamadas.length, 0);
});
