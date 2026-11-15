// RAC Inbox · I3 · Worker de produto: SAÍDA por SMTP (STARTTLS, porta 587). Servidor SMTP FALSO em memória (nada de rede, nada da Apple): prova o NOSSO código — ordem do protocolo, a senha só depois do TLS,
// as três classes de resultado (enviado / falha confirmada / incerto), UTF-8, cabeçalhos de conversa, Cco só no envelope, validação fechada e que nada sensível vai para a resposta.
// LIMITAÇÃO (dita no relatório): isto NÃO prova o iCloud real (certificado, AUTH, comportamento da Apple). A prova real é a operação smtp_prova do Worker publicado, que o dono autoriza.
import { test } from "node:test";
import assert from "node:assert/strict";
import { POLITICA } from "../experimentos/rac-inbox-worker/src/politica.mjs";
import { comandoSmtpPermitido, enviarMensagem, provarSmtp } from "../experimentos/rac-inbox-worker/src/smtp.mjs";
import { examinarEnvio, montarMensagem, codificarCabecalho } from "../experimentos/rac-inbox-worker/src/saida.mjs";
import { decodificarCabecalho, lerCabecalhos } from "../experimentos/rac-inbox-worker/src/mime.mjs";
import { assinar } from "../experimentos/rac-inbox-worker/src/canal.mjs";
import { tratar, executarOperacao, examinarCorpo } from "../experimentos/rac-inbox-worker/src/rotas.mjs";

const USUARIO = "ana@icloud.com", SENHA = "abcd-efgh-ijkl-mnop", CONTA = "11111111-1111-4111-8111-111111111111";
const MSGID = "<aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa@icloud.com>", DATA = "2026-11-15T12:00:00Z";
const rapida = (ms = 120) => ({ ...POLITICA, smtp: { ...POLITICA.smtp, timeoutMs: ms } });

/* servidor SMTP falso: `quando` troca o comportamento de um ponto; registra TODA linha de comando e as mensagens recebidas */
function smtpFalso({ quando = {}, senha = SENHA } = {}) {
  const c2s = new TransformStream(), s2c = new TransformStream();
  const entra = c2s.writable, sai = s2c.readable, escreve = s2c.writable.getWriter(), le = c2s.readable.getReader();
  const log = [], mensagens = [], estado = { tls: false, tlsHost: null, authSemTls: false, abertos: 0 };
  const enc = new TextEncoder(), dec = new TextDecoder("latin1");
  const env = (t) => escreve.write(enc.encode(t));
  let buf = "", dados = false, corpo = "", fechado = false;
  (async () => {
    await env(quando.saudacao ?? "220 smtp.mail.me.com ESMTP\r\n");
    while (!fechado) {
      let r; try { r = await le.read(); } catch (_) { return; }
      if (r.done) return;
      buf += dec.decode(r.value);
      for (;;) {
        if (dados) {
          const i = buf.indexOf("\r\n.\r\n"); if (i < 0) { break; }
          corpo += buf.slice(0, i + 2); buf = buf.slice(i + 5); dados = false;
          mensagens.push(corpo.replace(/^\.\./gm, ".")); corpo = "";
          if (quando.semResposta) return;                                   // o servidor "some" depois do corpo
          if (quando.cortaAposCorpo) { try { await escreve.close(); } catch (_) { /* ok */ } return; }
          await env(quando.respostaFinal ?? "250 2.0.0 Ok: queued as ABC123\r\n"); continue;
        }
        const i = buf.indexOf("\r\n"); if (i < 0) break;
        const l = buf.slice(0, i); buf = buf.slice(i + 2); log.push(l);
        if (/^EHLO /.test(l)) await env(estado.tls ? "250-smtp.mail.me.com\r\n250-8BITMIME\r\n250 AUTH PLAIN LOGIN\r\n" : (quando.semStarttls ? "250 smtp.mail.me.com\r\n" : "250-smtp.mail.me.com\r\n250 STARTTLS\r\n"));
        else if (l === "STARTTLS") { await env("220 2.0.0 Ready to start TLS\r\n" + (quando.injecao ? "250 INJETADO\r\n" : "")); estado.tlsPedido = true; }
        else if (/^AUTH PLAIN /.test(l)) {
          if (!estado.tls) estado.authSemTls = true;
          const [, u, s] = Buffer.from(l.slice(11), "base64").toString("utf8").split("\0");
          await env(u === USUARIO && s === senha ? "235 2.7.0 Authentication successful\r\n" : "535 5.7.8 Authentication failed\r\n");
        }
        else if (/^MAIL FROM:/.test(l)) await env(quando.mail ?? "250 2.1.0 Ok\r\n");
        else if (/^RCPT TO:/.test(l)) await env(/recusado@/.test(l) ? "550 5.1.1 User unknown\r\n" : "250 2.1.5 Ok\r\n");
        else if (l === "DATA") { if (quando.semResposta === "data") return; await env(quando.data ?? "354 End data with <CR><LF>.<CR><LF>\r\n"); dados = quando.data ? false : true; }
        else if (l === "QUIT") { await env("221 2.0.0 Bye\r\n"); fechado = true; }
        else await env("500 5.5.1 comando desconhecido\r\n");
      }
    }
  })();
  const socket = {
    readable: sai, writable: entra, opened: Promise.resolve(), close: async () => {},
    startTls(o) { if (!estado.tlsPedido) throw new Error("startTls sem STARTTLS aceito"); estado.tls = true; estado.tlsHost = o && o.expectedServerHostname; return socket; },
  };
  return { abrir: async (host, porta) => { estado.abertos++; estado.destino = host + ":" + porta; return socket; }, log, mensagens, estado };
}
const base = (f, extra = {}) => ({ abrir: f.abrir, usuario: USUARIO, senha: SENHA, ...extra });
const pedidoEnvio = (x = {}) => ({ de: USUARIO, para: ["bia@exemplo.com"], cc: [], cco: [], assunto: "Olá", texto: "Oi, tudo bem?", message_id: MSGID, em_resposta_a: null, referencias: [], data: DATA, ...x });
const corpoDaMensagem = (m) => { const [cab, ...resto] = m.split("\r\n\r\n"); const b64 = resto.join("\r\n\r\n").replace(/\r\n/g, ""); return { cab: lerCabecalhos(cab.replace(/\r\n(?=[ \t])/g, " ")), cabBruto: cab, texto: Buffer.from(b64, "base64").toString("utf8") }; };

test("a política do SMTP é fixa: smtp.mail.me.com:587, limites de destinatários e de tamanho, e nada de envio em massa", () => {
  assert.equal(POLITICA.smtp.host, "smtp.mail.me.com"); assert.equal(POLITICA.smtp.porta, 587);
  assert.ok(POLITICA.smtp.maxDestinatarios <= 20 && POLITICA.smtp.maxMensagemBytes <= 262144);
  assert.deepEqual(POLITICA.saida, ["smtp_prova", "enviar"]); assert.ok(POLITICA.operacoes.includes("enviar") && POLITICA.operacoes.includes("smtp_prova"));
});

test("lista fechada de comandos SMTP: só os do fluxo, com endereço válido; nada de comando livre", () => {
  for (const ok of ["EHLO rac-inbox-worker", "STARTTLS", "DATA", "QUIT", "AUTH PLAIN AGFuYQBzZW5oYQ==", "MAIL FROM:<ana@icloud.com> SIZE=1200", "RCPT TO:<bia@exemplo.com>"]) assert.ok(comandoSmtpPermitido(ok), ok);
  for (const ruim of ["VRFY ana", "EXPN lista", "RSET", "EHLO outro", "AUTH LOGIN", "MAIL FROM:<a@b.c>", "RCPT TO:<bia@exemplo.com> NOTIFY=NEVER", "RCPT TO:<bia@exemplo.com>\r\nDATA", "MAIL FROM:<ana@icloud.com>\r\nRCPT TO:<x@y.com>", "AUTH PLAIN a b", "RCPT TO:<ana@icloud.com>>"]) assert.ok(!comandoSmtpPermitido(ruim), ruim);
});

test("prova SEM envio: conexão → saudação → EHLO → STARTTLS → TLS → EHLO → AUTH; a senha só viaja depois do TLS e nenhum e-mail sai", async () => {
  const f = smtpFalso(); const r = await provarSmtp(base(f), { enviar_teste: false });
  assert.equal(r.ok, true); const d = r.dados;
  assert.deepEqual([d.aprovada, d.teste, d.host, d.porta], [true, "nao_enviado", "smtp.mail.me.com", 587]);
  assert.deepEqual(d.etapas.map((e) => e.etapa), ["conexao_tcp", "saudacao", "ehlo", "starttls", "tls", "ehlo_tls", "autenticacao"]);
  assert.ok(d.etapas.every((e) => e.ok === true && Number.isInteger(e.ms)));
  assert.deepEqual(d.etapas.filter((e) => e.codigo).map((e) => [e.etapa, e.codigo]), [["saudacao", 220], ["ehlo", 250], ["starttls", 220], ["ehlo_tls", 250], ["autenticacao", 235]]);
  assert.equal(f.estado.destino, "smtp.mail.me.com:587"); assert.equal(f.estado.tlsHost, "smtp.mail.me.com", "o certificado é validado contra o nome fixo da política");
  assert.equal(f.estado.authSemTls, false, "a senha nunca é enviada antes do TLS");
  assert.equal(f.mensagens.length, 0, "sem envio_teste nenhuma mensagem é transmitida"); assert.ok(!f.log.some((l) => /^(MAIL|RCPT|DATA)/.test(l)));
  const texto = JSON.stringify(r); assert.ok(!texto.includes(SENHA) && !texto.includes(USUARIO) && !texto.includes(Buffer.from("\0" + USUARIO + "\0" + SENHA).toString("base64")), "o relatório não carrega credencial");
});

test("prova COM envio de teste: uma mensagem controlada, só para o próprio endereço, depois do 250 do servidor", async () => {
  const f = smtpFalso(); const r = await provarSmtp(base(f), { enviar_teste: true, endereco: USUARIO, message_id: MSGID, instante: DATA });
  assert.deepEqual([r.dados.aprovada, r.dados.teste], [true, "enviado"]);
  assert.deepEqual(r.dados.etapas.slice(-4).map((e) => e.etapa), ["remetente", "destinatario", "dados", "envio"]); assert.equal(r.dados.etapas.at(-1).codigo, 250);
  assert.equal(f.mensagens.length, 1); const m = corpoDaMensagem(f.mensagens[0]);
  assert.equal(m.cab.to, USUARIO); assert.match(m.texto, /Teste de envio|Mensagem de teste/); assert.equal(f.log.filter((l) => l.startsWith("RCPT")).length, 1);
});

test("a prova relata a CAUSA de cada falha (etapa e código), sem erro HTTP e sem simular sucesso", async () => {
  const casos = [
    [{ quando: { semStarttls: true } }, "starttls_indisponivel", "starttls"],
    [{ senha: "wxyz-wxyz-wxyz-wxyz" }, "smtp_autenticacao_recusada", "autenticacao"],
    [{ quando: { saudacao: "554 sem servico\r\n" } }, "saudacao_invalida", "saudacao"],
    [{ quando: { injecao: true } }, "starttls_falhou", "starttls"],
  ];
  for (const [cfg, erro, etapa] of casos) {
    const f = smtpFalso(cfg); const r = await provarSmtp(base(f), { enviar_teste: false });
    assert.equal(r.ok, true, "a prova sempre devolve relatório"); assert.deepEqual([r.dados.aprovada, r.dados.erro, r.dados.etapa_falha], [false, erro, etapa], erro);
    assert.equal(r.dados.etapas.at(-1).ok, false); assert.equal(f.estado.authSemTls, false);
  }
  const semRede = await provarSmtp({ abrir: async () => { throw new Error("DNS falhou smtp.mail.me.com " + SENHA); }, usuario: USUARIO, senha: SENHA }, { enviar_teste: false });
  assert.deepEqual([semRede.dados.aprovada, semRede.dados.erro, semRede.dados.etapa_falha], [false, "conexao_falhou", "conexao_tcp"]); assert.ok(!JSON.stringify(semRede).includes(SENHA), "nada da mensagem do erro vaza");
  const lenta = smtpFalso({ quando: { saudacao: "" } }); lenta.estado.destino = null;
  const t = await provarSmtp({ ...base(lenta) }, { enviar_teste: false }, rapida(60)); assert.deepEqual([t.dados.aprovada, t.dados.erro], [false, "timeout"]);
});

test("falha com STARTTLS injetado: nem a senha nem comando algum sai depois de bytes em texto aberto", async () => {
  const f = smtpFalso({ quando: { injecao: true } }); await provarSmtp(base(f), { enviar_teste: false });
  assert.ok(!f.log.some((l) => /^AUTH/.test(l)), "a senha nunca foi enviada"); assert.equal(f.estado.tls, false, "o TLS nem foi iniciado");
});

test("enviar uma mensagem simples: ENVIADO só com o 250 do servidor; Cco só no envelope; UTF-8 e acentos íntegros", async () => {
  const f = smtpFalso();
  const p = examinarEnvio({ ...pedidoEnvio({ para: ["Bia@Exemplo.com"], cc: ["caio@exemplo.com"], cco: ["secreto@exemplo.com"], assunto: "Reunião — ação rápida ✓", texto: "Olá, João!\nAcentuação: ção, é, ü. Emoji 😀\n.linha com ponto\n\n..duplo" }), operacao: "enviar" });
  const r = await enviarMensagem(base(f), p);
  assert.deepEqual(r, { ok: true, dados: { resultado: "enviado", smtp: 250, duracao_ms: r.dados.duracao_ms } });
  assert.deepEqual(f.log.filter((l) => /^(MAIL|RCPT)/.test(l)), ["MAIL FROM:<ana@icloud.com> SIZE=" + f.log[f.log.findIndex((l) => l.startsWith("MAIL"))].split("SIZE=")[1], "RCPT TO:<bia@exemplo.com>", "RCPT TO:<caio@exemplo.com>", "RCPT TO:<secreto@exemplo.com>"]);
  const bruto = f.mensagens[0]; const m = corpoDaMensagem(bruto);
  assert.ok(/^[\x00-\x7f]*$/.test(bruto), "mensagem em ASCII puro"); assert.ok(bruto.split("\r\n").every((l) => l.length <= 998));
  assert.equal(decodificarCabecalho(m.cab.subject), "Reunião — ação rápida ✓"); assert.equal(m.texto, "Olá, João!\r\nAcentuação: ção, é, ü. Emoji 😀\r\n.linha com ponto\r\n\r\n..duplo".replace(/\r\n/g, "\r\n"));
  assert.ok(!/secreto@/i.test(m.cabBruto) && !/^bcc:/im.test(m.cabBruto), "o Cco nunca aparece em cabeçalho"); assert.equal(m.cab.to, "bia@exemplo.com"); assert.equal(m.cab.cc, "caio@exemplo.com");
  assert.equal(m.cab["message-id"], MSGID); assert.match(m.cabBruto, /Content-Type: text\/plain; charset=UTF-8/); assert.match(m.cabBruto, /Date: Sun, 15 Nov 2026 12:00:00 \+0000/);
  assert.ok(!/in-reply-to|references/i.test(m.cabBruto), "mensagem nova não tem cabeçalhos de conversa");
  assert.equal(f.estado.authSemTls, false);
});

test("responder: In-Reply-To e References preservam a conversa (sem duplicar o Message-ID da original)", () => {
  const orig = "<orig-3@exemplo.com>";
  const p = examinarEnvio({ ...pedidoEnvio({ assunto: "Re: Plano", em_resposta_a: orig, referencias: ["<orig-1@exemplo.com>", "<orig-2@exemplo.com>", orig] }), operacao: "enviar" });
  const m = corpoDaMensagem(montarMensagem(p));
  assert.equal(m.cab["in-reply-to"], orig); assert.equal(m.cab.references, "<orig-1@exemplo.com> <orig-2@exemplo.com> <orig-3@exemplo.com>");
  const semRefs = corpoDaMensagem(montarMensagem(examinarEnvio({ ...pedidoEnvio({ em_resposta_a: orig }), operacao: "enviar" })));
  assert.equal(semRefs.cab.references, orig, "sem References na original, a referência é a própria original");
  assert.throws(() => examinarEnvio({ ...pedidoEnvio({ referencias: [orig] }), operacao: "enviar" }), (e) => e.codigo === "pedido_invalido", "References sem In-Reply-To não existe");
});

test("as TRÊS classes de resultado: enviado, falha confirmada e incerto (nunca 'enviado' sem confirmação)", async () => {
  const p = examinarEnvio({ ...pedidoEnvio(), operacao: "enviar" });
  // falha confirmada: o servidor recusou depois do corpo
  let f = smtpFalso({ quando: { respostaFinal: "554 5.7.1 Message rejected as spam\r\n" } });
  assert.deepEqual(await enviarMensagem(base(f), p), { ok: false, erro: "envio_recusado", resultado: "falha" });
  // falha confirmada: destinatário recusado ANTES do DATA (nenhum corpo transmitido)
  f = smtpFalso(); assert.deepEqual(await enviarMensagem(base(f), examinarEnvio({ ...pedidoEnvio({ para: ["recusado@exemplo.com"] }), operacao: "enviar" })), { ok: false, erro: "destinatario_recusado", resultado: "falha" });
  assert.ok(!f.log.includes("DATA") && f.mensagens.length === 0, "sem DATA, nada foi transmitido");
  // falha confirmada: remetente recusado e autenticação recusada
  f = smtpFalso({ quando: { mail: "553 5.7.1 sender not owned\r\n" } }); assert.equal((await enviarMensagem(base(f), p)).erro, "remetente_recusado");
  f = smtpFalso({ senha: "zzzz-zzzz-zzzz-zzzz" }); assert.deepEqual(await enviarMensagem(base(f), p), { ok: false, erro: "smtp_autenticacao_recusada", resultado: "falha" });
  assert.ok(!f.log.some((l) => l.startsWith("MAIL")), "sem autenticar, nem o envelope");
  // INCERTO: o corpo foi transmitido e o servidor não respondeu / cortou a conexão
  f = smtpFalso({ quando: { semResposta: true } }); assert.deepEqual(await enviarMensagem(base(f), p, rapida(150)), { ok: false, erro: "envio_incerto", resultado: "incerto" });
  assert.equal(f.mensagens.length, 1, "o corpo chegou: a mensagem PODE ter sido aceita");
  f = smtpFalso({ quando: { cortaAposCorpo: true } }); assert.deepEqual(await enviarMensagem(base(f), p), { ok: false, erro: "envio_incerto", resultado: "incerto" });
  // timeout ANTES do corpo é falha confirmada (nada saiu), não incerto
  f = smtpFalso({ quando: { semResposta: "data" } }); const antes = await enviarMensagem(base(f), p, rapida(150));
  assert.deepEqual([antes.erro, antes.resultado], ["timeout", "falha"]); assert.equal(f.mensagens.length, 0);
  // enviado
  f = smtpFalso(); assert.equal((await enviarMensagem(base(f), p)).dados.resultado, "enviado");
});

test("validação fechada do pedido: endereço, injeção de cabeçalho, duplicidade, limites e Message-ID", () => {
  const ex = (x) => { try { examinarEnvio({ ...pedidoEnvio(x), operacao: "enviar" }); return "ok"; } catch (e) { return e.codigo; } };
  assert.equal(ex({}), "ok");
  assert.equal(ex({ para: [] }), "destinatario_invalido"); assert.equal(ex({ para: ["sem-arroba"] }), "destinatario_invalido");
  assert.equal(ex({ para: ["bia@exemplo.com\r\nBcc: x@y.com"] }), "destinatario_invalido"); assert.equal(ex({ para: ["a@b.com", "A@B.com"] }), "destinatario_invalido", "duplicado (sem diferenciar maiúsculas)");
  assert.equal(ex({ para: ["a@b.com"], cc: ["a@b.com"] }), "destinatario_invalido", "o mesmo endereço em To e Cc");
  assert.equal(ex({ para: Array.from({ length: 21 }, (_, i) => "p" + i + "@exemplo.com") }), "destinatarios_demais", "sem envio em massa");
  assert.equal(ex({ assunto: "Oi\r\nBcc: x@y.com" }), "assunto_invalido"); assert.equal(ex({ assunto: "x".repeat(301) }), "assunto_invalido");
  assert.equal(ex({ texto: "x".repeat(100001) }), "texto_grande_demais"); assert.equal(ex({ message_id: "<a b@c>" }), "message_id_invalido"); assert.equal(ex({ message_id: "sem-colchetes@c.com" }), "message_id_invalido");
  assert.equal(ex({ data: "ontem" }), "pedido_invalido"); assert.equal(ex({ de: "x" }), "pedido_invalido");
  assert.throws(() => examinarEnvio({ ...pedidoEnvio(), operacao: "enviar", anexos: [] }), (e) => e.codigo === "pedido_invalido", "campo desconhecido (anexo) é recusado nesta etapa");
  assert.equal(codificarCabecalho("simples"), "simples"); assert.ok(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/.test(codificarCabecalho("ação")));
  const longo = codificarCabecalho("ç".repeat(200)); assert.ok(longo.split("\r\n ").every((p) => p.length <= 75), "palavras codificadas de até 75 caracteres"); assert.equal(decodificarCabecalho(longo.replace(/\r\n /g, " ")), "ç".repeat(200));
});

/* ---------- pela rota assinada (o caminho real: função → Worker) ---------- */
const SEGREDO = "segredo-de-teste-com-mais-de-trinta-e-dois-caracteres";
const enc = new TextEncoder();
async function pedidoAssinado(corpo, { operacao = corpo.operacao, nonce = "n".repeat(20) + Math.random().toString(36).slice(2, 12) } = {}) {
  const bytes = enc.encode(JSON.stringify(corpo)), ts = 1790000000;
  const assinatura = await assinar({ segredo: SEGREDO, chave: "k1", timestamp: ts, nonce, operacao, corpoBytes: bytes });
  return new Request("https://w/v1/op", { method: "POST", body: bytes, headers: { "Content-Type": "application/json", "X-RAC-Key-Id": "k1", "X-RAC-Timestamp": String(ts), "X-RAC-Nonce": nonce, "X-RAC-Operacao": operacao, "X-RAC-Assinatura": assinatura } });
}
const depsRota = (f, extra = {}) => ({ segredos: { k1: SEGREDO }, agora: () => 1790000000, consumir: async () => true, executar: executarOperacao({ abrir: async () => { throw new Error("IMAP não é usado na saída"); }, abrirSmtp: f.abrir, ...extra }) });
const lerJson = async (resp) => ({ status: resp.status, json: await resp.json() });

test("pela rota assinada: enviar responde só dados fechados; falha e incerto viram código fechado; a credencial nunca volta", async () => {
  const corpo = { operacao: "enviar", conta_id: CONTA, usuario: USUARIO, senha: SENHA, ...pedidoEnvio({ texto: "x".repeat(30000) }) };
  let f = smtpFalso(); const ok = await lerJson(await tratar(await pedidoAssinado(corpo), depsRota(f)));
  assert.deepEqual([ok.status, ok.json.ok, ok.json.operacao, ok.json.dados.resultado], [200, true, "enviar", "enviado"], "corpo de envio acima de 4 KiB é aceito (limite próprio da saída)");
  assert.ok(!JSON.stringify(ok.json).includes(SENHA) && !JSON.stringify(ok.json).includes("bia@exemplo.com"));
  f = smtpFalso({ quando: { respostaFinal: "554 nao\r\n" } }); const rec = await lerJson(await tratar(await pedidoAssinado(corpo), depsRota(f)));
  assert.deepEqual([rec.status, rec.json], [422, { ok: false, erro: "envio_recusado" }]);
  f = smtpFalso({ quando: { semResposta: true } }); const inc = await lerJson(await tratar(await pedidoAssinado(corpo), { ...depsRota(f), executar: (c) => executarOperacao({ abrir: async () => null, abrirSmtp: f.abrir, politica: rapida(150) })(c) }));
  assert.deepEqual([inc.status, inc.json], [504, { ok: false, erro: "envio_incerto" }]);
  const inval = await lerJson(await tratar(await pedidoAssinado({ ...corpo, para: ["x"] }), depsRota(smtpFalso()))); assert.deepEqual([inval.status, inval.json.erro], [400, "destinatario_invalido"]);
  assert.equal(smtpFalso().estado.abertos, 0);
});

test("pela rota: o limite grande vale só para as operações de saída; as de leitura continuam em 4 KiB; sem assinatura nada é lido nem enviado", async () => {
  const f = smtpFalso(); const grande = { operacao: "testar_conta", conta_id: CONTA, usuario: USUARIO, senha: SENHA, lixo: "x".repeat(5000) };
  const r = await lerJson(await tratar(await pedidoAssinado(grande), depsRota(f))); assert.deepEqual([r.status, r.json.erro], [413, "corpo_grande_demais"]);
  const enorme = { operacao: "enviar", conta_id: CONTA, usuario: USUARIO, senha: SENHA, ...pedidoEnvio({ texto: "x".repeat(300000) }) };
  assert.equal((await tratar(await pedidoAssinado(enorme), depsRota(f))).status, 413, "acima do limite da própria saída");
  const semAssin = await tratar(new Request("https://w/v1/op", { method: "POST", headers: { "Content-Type": "application/json", "X-RAC-Operacao": "enviar" }, body: JSON.stringify({ operacao: "enviar" }) }), depsRota(f)); assert.equal(semAssin.status, 401);
  assert.equal(f.estado.abertos, 0, "nada abriu conexão");
  const troca = await lerJson(await tratar(await pedidoAssinado({ operacao: "enviar", conta_id: CONTA, usuario: USUARIO, senha: SENHA, ...pedidoEnvio() }, { operacao: "testar_conta" }), depsRota(f))); assert.deepEqual([troca.status, troca.json.erro], [400, "operacao_divergente"]);
});

test("a prova pela rota: só envia teste se for pedido, e o teste exige endereço, Message-ID e instante", async () => {
  const f = smtpFalso(); const base0 = { operacao: "smtp_prova", conta_id: CONTA, usuario: USUARIO, senha: SENHA };
  const sem = await lerJson(await tratar(await pedidoAssinado(base0), depsRota(f))); assert.deepEqual([sem.status, sem.json.dados.aprovada, sem.json.dados.teste], [200, true, "nao_enviado"]); assert.equal(f.mensagens.length, 0);
  assert.equal(examinarCorpo(enc.encode(JSON.stringify({ ...base0, enviar_teste: true })), "smtp_prova").erro, "campo_invalido", "teste sem endereço não passa");
  assert.equal(examinarCorpo(enc.encode(JSON.stringify({ ...base0, endereco: USUARIO })), "smtp_prova").erro, "campos_inesperados");
  const com = await lerJson(await tratar(await pedidoAssinado({ ...base0, enviar_teste: true, endereco: USUARIO, message_id: MSGID, data: DATA }), depsRota(smtpFalso()))); assert.equal(com.json.dados.teste, "enviado");
});
