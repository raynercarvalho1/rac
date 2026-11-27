// RAC Inbox · I3.2 · o Worker de produto GERENCIA mensagens (seção "I3.2 · GERENCIAMENTO" de experimentos/rac-inbox-worker/src/imap.mjs): marcar lida/não lida e mover (arquivar, excluir para a Lixeira, spam).
// TUDO SIMULADO: o servidor IMAP é falso (tests/rac_inbox_worker_servidor.mjs) e REGISTRA todo comando. Isto prova o que o Worker ENVIA e como ele reage a cada resposta; NÃO prova o iCloud real
// (o iCloud pode anunciar MOVE ou não: a validação real é o procedimento do docs/inbox.md, seção I3.2). Nenhum cenário de falha pode deixar a caixa alterada de forma indevida.
import test from "node:test";
import assert from "node:assert/strict";
import { POLITICA } from "../experimentos/rac-inbox-worker/src/politica.mjs";
import { assinar } from "../experimentos/rac-inbox-worker/src/canal.mjs";
import { tratar, examinarCorpo, executarOperacao } from "../experimentos/rac-inbox-worker/src/rotas.mjs";
import { comSessao, executarComando, comandoPermitido, comandoGestaoPermitido, GESTAO, ERROS_IMAP } from "../experimentos/rac-inbox-worker/src/imap.mjs";
import { servidorFalso, mensagem } from "./rac_inbox_worker_servidor.mjs";

const SENHA = "abcd-efgh-ijkl-mnop", USUARIO = "pessoa@icloud.example", CONTA = "11111111-1111-4111-8111-111111111111", SEGREDO = "segredo-de-teste-com-mais-de-32-caracteres-xx", AGORA = 1763200000;
const LISTA = ['* LIST (\\HasNoChildren) "/" "INBOX"', '* LIST (\\HasNoChildren \\Sent) "/" "Sent Messages"', '* LIST (\\HasNoChildren \\Trash) "/" "Deleted Messages"', '* LIST (\\HasNoChildren \\Junk) "/" "Junk"',
  '* LIST (\\HasNoChildren \\Archive) "/" "Archive"', '* LIST (\\HasNoChildren) "/" "Projetos"', '* LIST (\\Noselect \\HasChildren) "/" "Pai"'];
const caixas = () => ({
  INBOX: { uidvalidity: 700, uidnext: 4, msgs: [mensagem({ uid: 1, flags: [] }), mensagem({ uid: 2, flags: [] }), mensagem({ uid: 3, flags: ["\\Seen"] })] },
  Archive: { uidvalidity: 810, uidnext: 20, msgs: [] }, "Deleted Messages": { uidvalidity: 820, uidnext: 5, msgs: [] }, Junk: { uidvalidity: 830, uidnext: 9, msgs: [] }, Projetos: { uidvalidity: 840, uidnext: 2, msgs: [] },
  "Sent Messages": { uidvalidity: 850, uidnext: 2, msgs: [] },
});
const corpo = (op, extra = {}) => ({ operacao: op, conta_id: CONTA, usuario: USUARIO, senha: SENHA, ...extra });
const lida = (extra = {}) => corpo("marcar_lida", { pasta: "INBOX", uid: 1, uidvalidity_esperado: 700, lida: true, ...extra });
const mover = (extra = {}) => corpo("mover_mensagem", { pasta: "INBOX", destino: "Archive", uid: 2, uidvalidity_esperado: 700, ...extra });
async function rodar(c, opcoes = {}, ambiente = {}) {
  const cx = ambiente.caixas || caixas(), s = servidorFalso({ pastas: LISTA, caixas: cx, ...opcoes });
  const r = await executarOperacao({ abrir: ambiente.abrir || (async () => s.socket) })(c);
  return { r, s, cx, cmds: s.log.map((l) => l.replace(/^a\d+ /, "")) };
}
const verbos = (cmds) => cmds.map((c) => c.split(" ")[0] + (c.startsWith("UID ") ? " " + c.split(" ")[1] : ""));
const semAlteracao = (cmds) => assert.ok(!cmds.some((c) => /^(SELECT|UID STORE|UID MOVE)/.test(c)), "nenhum comando que altera a caixa foi enviado: " + cmds.join(" | "));
const semSenhaFora = (s) => assert.equal(s.log.filter((l) => l.includes(SENHA)).length, 1, "a senha só aparece no LOGIN");
const PERMITIDOS = /^(CAPABILITY|LOGIN|LOGOUT|LIST|EXAMINE|SELECT|FETCH|UID FETCH|UID SEARCH|UID STORE|UID MOVE|UID COPY|UID EXPUNGE)\b/;
const sempreNaLista = (cmds) => assert.ok(cmds.every((c) => PERMITIDOS.test(c)), "só comandos da lista fechada: " + cmds.join(" | "));
const naoExiste = (cmds) => assert.ok(!cmds.some((c) => /EXPUNGE|^CLOSE|^UNSELECT|^COPY|UID COPY|\\Deleted|APPEND|^DELETE/i.test(c)), "com MOVE: nunca expurgo, cópia, \\Deleted, fechar caixa ou apagar: " + cmds.join(" | "));

/* ---------- marcar como lida / não lida ---------- */
test("marcar lida e não lida: SELECT, identidade conferida, UM UID STORE da flag \\Seen e confirmação pelas flags devolvidas; o estado do servidor muda e nada mais", async () => {
  const { r, s, cx, cmds } = await rodar(lida());
  assert.equal(r.ok, true); assert.equal(r.dados.resultado, "aplicada"); assert.equal(r.dados.lida, true);
  assert.deepEqual(cx.INBOX.msgs.find((m) => m.uid === 1).flags.map((f) => f.toLowerCase()), ["\\seen"]);
  assert.deepEqual(verbos(cmds), ["CAPABILITY", "LOGIN", "SELECT", "UID FETCH", "UID STORE", "LOGOUT"], "sem EXAMINE, sem COPY/MOVE/EXPUNGE");
  assert.ok(cmds.includes("UID STORE 1 +FLAGS (\\Seen)")); sempreNaLista(cmds); naoExiste(cmds); semSenhaFora(s);
  assert.deepEqual(cx.INBOX.msgs.map((m) => m.uid), [1, 2, 3], "nenhuma mensagem saiu da caixa");

  const n = await rodar(lida({ uid: 3, lida: false }));   // a 3 já estava lida → marcar NÃO lida
  assert.equal(n.r.ok, true); assert.equal(n.r.dados.lida, false); assert.ok(n.cmds.includes("UID STORE 3 -FLAGS (\\Seen)"));
  assert.ok(!n.cx.INBOX.msgs.find((m) => m.uid === 3).flags.some((f) => /seen/i.test(f)));
});

test("repetição da mesma operação: já no estado pedido = 'ja_estava' e NADA é enviado ao servidor (idempotente)", async () => {
  const cx = caixas(), a = await rodar(lida(), {}, { caixas: cx }), b = await rodar(lida(), {}, { caixas: cx });
  assert.equal(a.r.dados.resultado, "aplicada"); assert.equal(b.r.dados.resultado, "ja_estava");
  assert.ok(!b.cmds.some((c) => c.startsWith("UID STORE")), "a segunda vez não escreve");
  const c = await rodar(lida({ uid: 3, lida: true }), {}, { caixas: cx }); assert.equal(c.r.dados.resultado, "ja_estava");
});

test("identidade: UIDVALIDITY diferente, UID inexistente, Message-ID ou tamanho diferentes = nenhuma alteração (nem SELECT sem conferência, nem STORE)", async () => {
  let x = await rodar(lida({ uidvalidity_esperado: 699 })); assert.deepEqual([x.r.ok, x.r.erro], [false, "uidvalidity_mudou"]); assert.ok(!x.cmds.some((c) => /^(UID STORE|UID FETCH)/.test(c)), "nem leu a mensagem");
  x = await rodar(lida({ uid: 99 })); assert.deepEqual([x.r.ok, x.r.erro], [false, "mensagem_inexistente"]); semAlteracao(x.cmds.filter((c) => !c.startsWith("SELECT")));
  assert.ok(!x.cmds.some((c) => c.startsWith("UID STORE")));
  x = await rodar(lida({ message_id_esperado: "<outra@exemplo.com>" })); assert.deepEqual([x.r.ok, x.r.erro], [false, "identidade_divergente"]); assert.ok(!x.cmds.some((c) => c.startsWith("UID STORE")));
  x = await rodar(lida({ message_id_esperado: "<m1@exemplo.com>", tamanho_esperado: 1001 })); assert.equal(x.r.ok, true, "Message-ID e tamanho conferem: segue");
  x = await rodar(lida({ tamanho_esperado: 5 })); assert.deepEqual([x.r.ok, x.r.erro], [false, "identidade_divergente"]); assert.ok(!x.cmds.some((c) => c.startsWith("UID STORE")));
  x = await rodar(lida({ pasta: "Nao Existe" })); assert.deepEqual([x.r.ok, x.r.erro], [false, "pasta_inexistente"]); assert.ok(!x.cmds.some((c) => c.startsWith("UID STORE")));
  x = await rodar(lida({ pasta: 'a"b' })); assert.deepEqual([x.r.ok, x.r.erro], [false, "pasta_invalida"]); assert.ok(!x.cmds.some((c) => c.startsWith("SELECT")), "nome perigoso nem chega ao socket");
});

test("pasta só de leitura e recusa do servidor: nada muda; sem as flags no retorno do STORE o Worker RELÊ antes de dizer 'aplicada'", async () => {
  let x = await rodar(lida(), { leitura: true }); assert.deepEqual([x.r.ok, x.r.erro], [false, "pasta_somente_leitura"]); assert.ok(!x.cmds.some((c) => c.startsWith("UID STORE")));
  x = await rodar(lida(), { recusar: true }); assert.deepEqual([x.r.ok, x.r.erro], [false, "acao_recusada"]); assert.ok(!x.cx.INBOX.msgs[0].flags.length, "o servidor recusou: a flag não mudou");
  x = await rodar(lida(), { semFlagsNoStore: true }); assert.equal(x.r.ok, true); assert.ok(x.cmds.filter((c) => c.startsWith("UID FETCH")).length >= 2, "releu as flags para confirmar");
});

test("falhas: senha recusada (nenhum comando de alteração), conexão que não abre, conexão cortada DEPOIS do comando = 'acao_incerta' (nunca 'aplicada', nunca repete)", async () => {
  const a = await rodar(lida({ senha: "wxyz-wxyz-wxyz-wxyz" })); assert.deepEqual([a.r.ok, a.r.erro], [false, "autenticacao_recusada"]); semAlteracao(a.cmds);
  const b = await rodar(lida(), {}, { abrir: async () => { throw new Error("rede caiu com " + SENHA); } }); assert.deepEqual([b.r.ok, b.r.erro], [false, "conexao_falhou"]); assert.ok(!JSON.stringify(b.r).includes(SENHA));
  // a resposta se perdeu e o servidor NÃO aplicou
  const c = await rodar(lida(), { cortar: true }); assert.deepEqual([c.r.ok, c.r.erro], [false, "acao_incerta"]); assert.equal(c.cmds.filter((x) => x.startsWith("UID STORE")).length, 1, "UM envio só, sem repetir");
  // a resposta se perdeu e o servidor APLICOU: ainda assim o Worker não afirma nada; quem decide é a verificação (verificar_mensagem)
  const cx = caixas(), d = await rodar(lida(), { cortar: true, aplicarAntesDeCortar: true }, { caixas: cx }); assert.deepEqual([d.r.ok, d.r.erro], [false, "acao_incerta"]);
  const v = await rodar(corpo("verificar_mensagem", { pasta: "INBOX", uid: 1, uidvalidity_esperado: 700 }), {}, { caixas: cx });
  assert.deepEqual(v.r, { ok: true, dados: { existe: true, lida: true, duracao_ms: v.r.dados.duracao_ms } }, "a verificação mostra o que ficou no servidor");
  assert.ok(!v.cmds.some((c) => /^(SELECT|UID STORE|UID MOVE)/.test(c)), "verificar só lê (EXAMINE)");
});

/* ---------- mover ---------- */
test("mover: só com MOVE anunciado DEPOIS do login, destino comprovado pela listagem; UID MOVE de UMA mensagem; devolve o novo UID (COPYUID); a origem perde a mensagem e o destino ganha", async () => {
  const { r, s, cx, cmds } = await rodar(mover());
  assert.equal(r.ok, true); assert.equal(r.dados.resultado, "aplicada"); assert.deepEqual(r.dados.destino, { uidvalidity: 810, uid: 20 });
  assert.deepEqual(cx.INBOX.msgs.map((m) => m.uid), [1, 3]); assert.deepEqual(cx.Archive.msgs.map((m) => m.uid), [20]);
  assert.deepEqual(verbos(cmds), ["CAPABILITY", "LOGIN", "CAPABILITY", "LIST", "SELECT", "UID FETCH", "UID MOVE", "UID FETCH", "LOGOUT"]);
  assert.ok(cmds.includes('UID MOVE 2 "Archive"')); sempreNaLista(cmds); naoExiste(cmds); semSenhaFora(s);
  assert.ok(!cmds.some((c) => c.startsWith("UID STORE")), "mover não mexe em flag nenhuma");
  const t = await rodar(mover({ destino: "Deleted Messages", uid: 3 })); assert.equal(t.r.ok, true); assert.deepEqual(t.cx["Deleted Messages"].msgs.map((m) => m.uid), [5]);
  const sp = await rodar(mover({ destino: "Junk", uid: 1 })); assert.equal(sp.r.ok, true); assert.deepEqual(sp.r.dados.destino, { uidvalidity: 830, uid: 9 });
  const volta = await rodar(mover({ pasta: "Junk", destino: "INBOX", uid: 9, uidvalidity_esperado: 830 }), {}, { caixas: sp.cx }); assert.equal(volta.r.ok, true, "retirar do Spam = mover para a Caixa de Entrada");
  assert.deepEqual(volta.cx.INBOX.msgs.map((m) => m.uid), [2, 3, 4]);
  const sem = await rodar(mover(), { semCopyuid: true }); assert.equal(sem.r.ok, true); assert.equal(sem.r.dados.destino, undefined, "sem COPYUID não se inventa o UID novo");
});

test("mover sem MOVE no servidor (como o iCloud real): NÃO é mais 'acao_indisponivel'; segue o caminho COPY + \\Deleted (testes abaixo). O que vale é a lista de DEPOIS do login; marcar lida nunca depende de MOVE", async () => {
  let x = await rodar(mover(), { capacidade: "IMAP4rev1 NAMESPACE" }); assert.equal(x.r.ok, true); assert.ok(x.cmds.some((c) => c.startsWith("UID COPY")) && !x.cmds.some((c) => c.startsWith("UID MOVE")), "sem MOVE: cópia, nunca MOVE");
  x = await rodar(mover(), { capacidade: "IMAP4rev1", capacidadeDepois: "IMAP4rev1 MOVE" }); assert.equal(x.r.ok, true, "MOVE só apareceu depois do login: vale e usa MOVE"); assert.ok(x.cmds.some((c) => c.startsWith("UID MOVE")) && !x.cmds.some((c) => c.startsWith("UID COPY")));
  x = await rodar(mover(), { capacidade: "IMAP4rev1 MOVE", capacidadeDepois: "IMAP4rev1" }); assert.equal(x.r.ok, true, "anunciou antes e retirou depois: vale o de depois (sem MOVE)"); assert.ok(x.cmds.some((c) => c.startsWith("UID COPY")) && !x.cmds.some((c) => c.startsWith("UID MOVE")));
  const m = await rodar(lida(), { capacidade: "IMAP4rev1" }); assert.equal(m.r.ok, true, "marcar lida não depende de MOVE");
});

test("mover: destino igual à origem, inexistente na listagem, não selecionável ou com nome perigoso = recusado ANTES de qualquer alteração; mensagem inexistente e UIDVALIDITY diferente também", async () => {
  for (const [extra, erro] of [[{ destino: "INBOX" }, "pasta_invalida"], [{ destino: "Nao Existe" }, "pasta_inexistente"], [{ destino: "Pai" }, "pasta_invalida"], [{ destino: 'x"y' }, "pasta_invalida"], [{ destino: "a\\b" }, "pasta_invalida"],
    [{ pasta: "Pai" }, "pasta_invalida"], [{ uid: 99 }, "mensagem_inexistente"], [{ uidvalidity_esperado: 1 }, "uidvalidity_mudou"], [{ message_id_esperado: "<outra@exemplo.com>" }, "identidade_divergente"]]) {
    const x = await rodar(mover(extra)); assert.deepEqual([x.r.ok, x.r.erro], [false, erro], JSON.stringify(extra)); assert.ok(!x.cmds.some((c) => c.startsWith("UID MOVE") || c.startsWith("UID STORE")), "nada foi movido: " + JSON.stringify(extra));
    assert.deepEqual(x.cx.INBOX.msgs.map((m) => m.uid), [1, 2, 3], "a caixa ficou intacta");
  }
});

test("mover: recusa do servidor (NO) = 'acao_recusada' e a mensagem fica; servidor que responde OK mas não tirou a mensagem = 'acao_incerta'; conexão cortada = 'acao_incerta' sem repetir", async () => {
  let x = await rodar(mover(), { recusar: true }); assert.deepEqual([x.r.ok, x.r.erro], [false, "acao_recusada"]); assert.deepEqual(x.cx.INBOX.msgs.map((m) => m.uid), [1, 2, 3]);
  const sem = caixas(); delete sem.Archive; sem.Archive = undefined; delete sem.Archive;   // listado, mas o servidor responde TRYCREATE
  x = await rodar(mover(), {}, { caixas: sem }); assert.deepEqual([x.r.ok, x.r.erro], [false, "acao_recusada"]);
  x = await rodar(mover(), { moveNaoRemove: true }); assert.deepEqual([x.r.ok, x.r.erro], [false, "acao_incerta"], "OK sem efeito conferível: não se afirma sucesso");
  const cx = caixas(); x = await rodar(mover(), { cortar: true, aplicarAntesDeCortar: true }, { caixas: cx }); assert.deepEqual([x.r.ok, x.r.erro], [false, "acao_incerta"]);
  assert.equal(x.cmds.filter((c) => c.startsWith("UID MOVE")).length, 1, "nunca repete sozinho");
  const v = await rodar(corpo("verificar_mensagem", { pasta: "INBOX", uid: 2, uidvalidity_esperado: 700 }), {}, { caixas: cx }); assert.deepEqual([v.r.ok, v.r.dados.existe], [true, false], "a verificação diz que a mensagem saiu");
  const v2 = await rodar(corpo("verificar_mensagem", { pasta: "INBOX", uid: 1, uidvalidity_esperado: 700 }), {}, { caixas: cx }); assert.deepEqual([v2.r.dados.existe, v2.r.dados.lida], [true, false]);
  const v3 = await rodar(corpo("verificar_mensagem", { pasta: "INBOX", uid: 1, uidvalidity_esperado: 9 }), {}, { caixas: cx }); assert.equal(v3.r.erro, "uidvalidity_mudou");
});

test("capacidades: lista o que o servidor anuncia antes e depois do login e se MOVE/UIDPLUS existem; só leitura", async () => {
  const x = await rodar(corpo("capacidades"), { capacidade: "IMAP4rev1 UIDPLUS", capacidadeDepois: "IMAP4rev1 UIDPLUS MOVE IDLE" });
  assert.deepEqual([x.r.ok, x.r.dados.antes_login, x.r.dados.depois_login, x.r.dados.mover, x.r.dados.uidplus], [true, ["IMAP4REV1", "UIDPLUS"], ["IMAP4REV1", "UIDPLUS", "MOVE", "IDLE"], true, true]);
  assert.deepEqual(verbos(x.cmds), ["CAPABILITY", "LOGIN", "CAPABILITY", "LOGOUT"]); semAlteracao(x.cmds);
  const y = await rodar(corpo("capacidades"), { capacidade: "IMAP4rev1 NAMESPACE" }); assert.deepEqual([y.r.dados.mover, y.r.dados.uidplus], [false, false]);
});

/* ---------- a lista fechada de comandos ---------- */
test("comandos de alteração: fora do gerenciamento NADA passa; dentro dele só SELECT, UID STORE da flag \\Seen e UID MOVE de UM UID; EXPUNGE, UID EXPUNGE, CLOSE, COPY, \\Deleted e injeção são barrados antes do socket", async () => {
  const ESCRITA = [["SELECT", ' "INBOX"'], ["UID", " STORE 1 +FLAGS (\\Seen)"], ["UID", ' MOVE 1 "Archive"'], ["UID", ' COPY 1 "Archive"'], ["UID", " STORE 1 +FLAGS (\\Deleted)"], ["UID", " EXPUNGE 1"], ["UID", ' SEARCH HEADER Message-ID "<a@x.com>"']];
  for (const [v, a] of ESCRITA) { assert.equal(comandoPermitido(v, a), false, "o modo leitura não aceita " + v + a); assert.equal(comandoGestaoPermitido(v, a), true, v + a); }
  const ruim = [["EXPUNGE", ""], ["UID", " EXPUNGE 1:*"], ["UID", " EXPUNGE 1,2"], ["UID", " EXPUNGE *"], ["UID", " EXPUNGE 0"], ["UID", " EXPUNGE"], ["CLOSE", ""], ["UNSELECT", ""], ["COPY", ' 1 "Archive"'], ["UID", ' COPY 1:* "Archive"'], ["UID", ' COPY 1,2 "Archive"'], ["UID", ' COPY 1 "a"b"'], ["UID", ' COPY 1 ""'], ["UID", ' COPY 1 "Archive"\r\na9 EXPUNGE'], ["APPEND", ' "INBOX" {1}'], ["DELETE", ' "x"'], ["RENAME", ' "a" "b"'],
    ["UID", " STORE 1 +FLAGS (\\Deleted \\Seen)"], ["UID", " STORE 1 -FLAGS (\\Deleted)"], ["UID", " STORE 1 FLAGS (\\Deleted)"], ["UID", " STORE 1:* +FLAGS (\\Deleted)"], ["UID", " STORE 1 +FLAGS.SILENT (\\Deleted)"], ["UID", " STORE 1 +FLAGS (\\Deleted)\r\na9 EXPUNGE"],
    ["UID", " SEARCH ALL"], ["UID", ' SEARCH HEADER Subject "x"'], ["UID", ' SEARCH HEADER Message-ID "sem-colchetes"'], ["UID", ' SEARCH HEADER Message-ID "<a"b@x>"'], ["UID", ' SEARCH HEADER Message-ID "<a@x>" OR ALL'], ["UID", ' SEARCH HEADER Message-ID "<a b@x>"'],
    ["UID", " STORE 1 FLAGS (\\Seen)"], ["UID", " STORE 1 +FLAGS.SILENT (\\Seen)"], ["UID", " STORE 1 +FLAGS (\\Seen \\Deleted)"], ["UID", " STORE 1:* +FLAGS (\\Seen)"], ["UID", " STORE 1,2 +FLAGS (\\Seen)"],
    ["UID", " STORE * +FLAGS (\\Seen)"], ["UID", " STORE 0 +FLAGS (\\Seen)"], ["UID", " STORE 99999999999 +FLAGS (\\Seen)"], ["UID", " MOVE 1:* \"Archive\""], ["UID", ' MOVE 1,2 "Archive"'], ["UID", ' MOVE 1 "a"b"'], ["UID", ' MOVE 1 "a\\b"'],
    ["UID", ' MOVE 1 ""'], ["UID", ' MOVE 1 "Archive"\r\na9 EXPUNGE'], ["SELECT", ' "a"b"'], ["SELECT", ' ""'], ["SELECT", ' "INBOX"\r\na9 EXPUNGE'], ["STORE", " 1 +FLAGS (\\Seen)"], ["MOVE", ' 1 "Archive"'], ["IDLE", ""], ["STARTTLS", ""]];
  for (const [v, a] of ruim) { assert.equal(comandoGestaoPermitido(v, a), false, "gerenciamento: " + v + a); assert.equal(comandoPermitido(v, a), false, "leitura: " + v + a); }
  for (const a of [' COPY 1 "x"', " STORE 1 +FLAGS (\\Deleted)", " EXPUNGE 1"]) assert.equal(GESTAO.muta("UID", a), true, "altera a caixa: " + a);
  assert.equal(GESTAO.muta("UID", ' SEARCH HEADER Message-ID "<a@x.com>"'), false, "a busca só lê");
  assert.deepEqual(GESTAO.muta("UID", " STORE 1 +FLAGS (\\Seen)"), true); assert.deepEqual(GESTAO.muta("UID", ' MOVE 1 "x"'), true); assert.deepEqual([GESTAO.muta("SELECT", ' "x"'), GESTAO.muta("UID", " FETCH 1 (UID FLAGS)")], [false, false]);

  // pela sessão de verdade: o que for barrado nem chega ao servidor
  const tentar = async (verbo, args, gestao) => { const s = servidorFalso({ pastas: LISTA, caixas: caixas() }); const r = await comSessao({ abrir: async () => s.socket, usuario: USUARIO, senha: SENHA, gestao }, (ctx) => executarComando(ctx, verbo, args, 1024).then(() => ({}))); return { r, cmds: s.log.map((l) => l.replace(/^a\d+ /, "")) }; };
  for (const [v, a] of [["EXPUNGE", ""], ["UID", " EXPUNGE 1:*"], ["CLOSE", ""], ["UID", " STORE 1:* +FLAGS (\\Deleted)"]]) {
    const t = await tentar(v, a, GESTAO); assert.deepEqual([t.r.ok, t.r.erro], [false, "comando_nao_permitido"], v + a); assert.ok(!t.cmds.some((c) => /EXPUNGE|CLOSE|Deleted/.test(c)), "nada saiu: " + t.cmds.join("|"));
  }
  const sem = await tentar("SELECT", ' "INBOX"', null); assert.deepEqual([sem.r.ok, sem.r.erro], [false, "comando_nao_permitido"], "sessão de LEITURA não tem o gancho"); assert.ok(!sem.cmds.some((c) => c.startsWith("SELECT")));
  assert.ok(["acao_recusada", "identidade_divergente", "acao_indisponivel", "pasta_somente_leitura", "acao_incerta", "confirmacao_ausente", "acao_parcial"].every((c) => ERROS_IMAP.includes(c)));
});

test("as operações de LEITURA continuam só lendo: listar, ler e baixar nunca enviam SELECT, STORE ou MOVE (EXAMINE e BODY.PEEK), e a flag \\Seen não muda", async () => {
  const cx = caixas();
  for (const c of [corpo("listar_mensagens", { pasta: "INBOX", ultimas: 3 }), corpo("ler_mensagem", { pasta: "INBOX", uid: 1 }), corpo("estado_pasta", { pasta: "INBOX" }), corpo("listar_pastas"), corpo("testar_conta")]) {
    const x = await rodar(c, {}, { caixas: cx }); assert.equal(x.r.ok, true, c.operacao); semAlteracao(x.cmds); sempreNaLista(x.cmds);
  }
  assert.deepEqual(cx.INBOX.msgs.map((m) => m.flags.length), [0, 0, 1], "nenhuma flag mudou");
});

/* ---------- a rota: esquema fechado, assinatura e o que o navegador não consegue pedir ---------- */
test("esquema fechado das novas operações: uidvalidity obrigatório, tipos exatos, campos extras e 'comando' livre recusados; as operações de escrita são só duas", () => {
  const enc = new TextEncoder(), ex = (c, op = c.operacao) => examinarCorpo(enc.encode(JSON.stringify(c)), op);
  assert.ok(ex(lida()).corpo); assert.ok(ex(mover()).corpo); assert.ok(ex(corpo("capacidades")).corpo); assert.ok(ex(corpo("verificar_mensagem", { pasta: "INBOX", uid: 1, uidvalidity_esperado: 7 })).corpo);
  assert.ok(ex(lida({ message_id_esperado: "<abc@exemplo.com>", tamanho_esperado: 0 })).corpo);
  for (const [c, erro] of [[lida({ uidvalidity_esperado: undefined }), "campo_ausente"], [lida({ lida: "sim" }), "campo_invalido"], [lida({ lida: undefined }), "campo_ausente"], [lida({ uid: 0 }), "campo_invalido"], [lida({ uid: "1" }), "campo_invalido"],
    [lida({ message_id_esperado: "com espaço" }), "campo_invalido"], [lida({ message_id_esperado: "x".repeat(256) }), "campo_invalido"], [lida({ tamanho_esperado: -1 }), "campo_invalido"], [lida({ tamanho_esperado: 1.5 }), "campo_invalido"],
    [lida({ comando: "EXPUNGE" }), "campos_inesperados"], [lida({ flags: ["\\Deleted"] }), "campos_inesperados"], [mover({ destino: undefined }), "campo_ausente"], [mover({ destino: 5 }), "campo_invalido"], [mover({ uidvalidity_esperado: undefined }), "campo_ausente"],
    [mover({ expunge: true }), "campos_inesperados"], [corpo("capacidades", { pasta: "INBOX" }), "campos_inesperados"], [corpo("expunge", { pasta: "INBOX" }), "operacao_divergente"], [corpo("imap_livre", { comando: "UID STORE 1 +FLAGS (\\Deleted)" }), "operacao_divergente"]]) {
    assert.equal(ex(c).erro, erro, JSON.stringify(c).replace(SENHA, "***"));
  }
  assert.deepEqual([...POLITICA.escrita], ["marcar_lida", "mover_mensagem"]); assert.ok(POLITICA.escrita.every((o) => POLITICA.operacoes.includes(o))); assert.ok(POLITICA.gestao.includes("capacidades") && POLITICA.gestao.includes("verificar_mensagem"));
  assert.ok(!POLITICA.operacoes.some((o) => /expunge|apagar|excluir|delete|imap_livre|comando/i.test(o)), "não existe operação de apagar nem de comando livre");
});

test("pela rota assinada: marcar lida e mover passam por assinatura, nonce (replay = 409) e esquema; resposta de esquema fechado sem credencial; erro do Worker vira código fechado com o HTTP certo", async () => {
  const enc = new TextEncoder(), vistos = new Set(); let n = 0;
  const NONCE = () => "nonce" + String(++n).padStart(14, "0");
  const req = async (c, nonce = NONCE()) => { const b = enc.encode(JSON.stringify(c)); return new Request("https://w/v1/op", { method: "POST", headers: { "Content-Type": "application/json", "X-RAC-Key-Id": "k1", "X-RAC-Timestamp": String(AGORA), "X-RAC-Nonce": nonce, "X-RAC-Operacao": c.operacao,
    "X-RAC-Assinatura": await assinar({ segredo: SEGREDO, chave: "k1", timestamp: AGORA, nonce, operacao: c.operacao, corpoBytes: b }) }, body: b }); };
  const dep = (s) => ({ segredos: { k1: SEGREDO }, agora: () => AGORA, consumir: async (x) => (vistos.has(x) ? false : (vistos.add(x), true)), executar: executarOperacao({ abrir: async () => s.socket }) });
  const s1 = servidorFalso({ pastas: LISTA, caixas: caixas() }), r1 = await tratar(await req(lida()), dep(s1)), t1 = await r1.text(), j1 = JSON.parse(t1);
  assert.deepEqual([r1.status, j1.ok, j1.operacao, j1.dados.resultado], [200, true, "marcar_lida", "aplicada"]); assert.ok(!t1.includes(SENHA) && !t1.includes(USUARIO));
  const rep = await req(lida(), "nonceFixo0000000001"); const d2 = dep(servidorFalso({ pastas: LISTA, caixas: caixas() })); assert.equal((await tratar(rep.clone(), d2)).status, 200); assert.equal((await tratar(rep.clone(), d2)).status, 409, "replay");
  const cenarios = [[mover(), { capacidade: "IMAP4rev1", copiaRecusa: true }, 422, "copia_cannot"], [mover(), { capacidade: "IMAP4rev1", recusarMarca: true }, 409, "acao_parcial"], [mover(), { cortar: true }, 504, "acao_incerta"], [lida({ uidvalidity_esperado: 5 }), {}, 409, "uidvalidity_mudou"], [lida({ message_id_esperado: "<x@y.z>" }), {}, 409, "identidade_divergente"],
    [lida(), { recusar: true }, 422, "acao_recusada"], [lida({ uid: 77 }), {}, 404, "mensagem_inexistente"], [lida({ senha: "wxyz-wxyz-wxyz-wxyz" }), {}, 422, "autenticacao_recusada"]];
  for (const [c, op, status, erro] of cenarios) { const r = await tratar(await req(c), dep(servidorFalso({ pastas: LISTA, caixas: caixas(), ...op }))); const j = await r.json(); assert.deepEqual([r.status, j], [status, { ok: false, erro }], erro); }
});


/* ---------- 27/11/2026 · servidor SEM MOVE (iCloud real): COPY confirmada + \\Deleted + UID EXPUNGE só com UIDPLUS ---------- */
const SEM_MOVE = "IMAP4rev1 UIDPLUS NAMESPACE", SEM_MOVE_SEM_UIDPLUS = "IMAP4rev1 NAMESPACE";
const so = (cmds, re) => cmds.filter((c) => re.test(c));
const nuncaGlobal = (cmds) => assert.ok(!cmds.some((c) => /^EXPUNGE|^CLOSE|^UNSELECT|^APPEND|^DELETE|UID EXPUNGE [^ ]*[:,*]/i.test(c)), "nunca EXPUNGE global nem conjunto: " + cmds.join(" | "));

test("sem MOVE, COM UIDPLUS: busca a cópia, UID COPY de UM UID, confirma a cópia, marca \\Deleted e UID EXPUNGE só daquele UID; as outras mensagens ficam", async () => {
  const { r, s, cx, cmds } = await rodar(mover(), { capacidade: SEM_MOVE });
  assert.deepEqual([r.ok, r.dados.resultado, r.dados.limpeza, r.dados.copia], [true, "aplicada", "feita", "nova"]);
  assert.deepEqual(cx.INBOX.msgs.map((m) => m.uid), [1, 3], "a original saiu da origem; as outras ficaram"); assert.deepEqual(cx.Archive.msgs.map((m) => m.uid), [20], "UMA cópia no destino");
  assert.ok(cmds.includes('UID COPY 2 "Archive"') && cmds.includes("UID STORE 2 +FLAGS (\\Deleted)") && cmds.includes("UID EXPUNGE 2"));
  assert.equal(so(cmds, /UID COPY/).length, 1); assert.equal(so(cmds, /EXPUNGE/).length, 1); nuncaGlobal(cmds); sempreNaLista(cmds); semSenhaFora(s);
  const iCopy = cmds.findIndex((c) => c.startsWith("UID COPY")), iDel = cmds.findIndex((c) => c.includes("\\Deleted")), iExp = cmds.findIndex((c) => c.startsWith("UID EXPUNGE"));
  assert.ok(iCopy < iDel && iDel < iExp, "ordem: copiar, marcar, expurgar"); assert.ok(cmds.slice(iCopy, iDel).some((c) => c.startsWith("UID SEARCH HEADER Message-ID")), "a cópia é CONFIRMADA por busca antes de marcar a original");
});

test("sem MOVE e SEM UIDPLUS (o pior caso): a cópia é feita, a original fica marcada \\Deleted e NENHUM expurgo é enviado; a original some da lista e da verificação", async () => {
  const cx = caixas(), { r, cmds } = await rodar(mover(), { capacidade: SEM_MOVE_SEM_UIDPLUS }, { caixas: cx });
  assert.deepEqual([r.ok, r.dados.resultado, r.dados.limpeza], [true, "aplicada", "indisponivel"]); assert.equal(r.dados.destino, undefined, "sem COPYUID não se inventa o UID novo");
  assert.ok(!cmds.some((c) => /EXPUNGE/i.test(c)), "sem UIDPLUS não há expurgo nenhum");
  assert.deepEqual(cx.INBOX.msgs.map((m) => m.uid), [1, 2, 3], "a original continua no servidor, marcada"); assert.ok(cx.INBOX.msgs.find((m) => m.uid === 2).flags.some((f) => /deleted/i.test(f))); assert.equal(cx.Archive.msgs.length, 1);
  const v = await rodar(corpo("verificar_mensagem", { pasta: "INBOX", uid: 2, uidvalidity_esperado: 700 }), { capacidade: SEM_MOVE_SEM_UIDPLUS }, { caixas: cx }); assert.equal(v.r.dados.existe, false, "marcada \\Deleted = já saiu");
  const l = await rodar(corpo("listar_mensagens", { pasta: "INBOX", ultimas: 10 }), {}, { caixas: cx }); assert.deepEqual(l.r.dados.mensagens.map((m) => m.uid), [3, 1], "a lista não mostra a marcada");
});

test("falha ENTRE a cópia e a marca: 'acao_parcial' (recusa) ou 'acao_incerta' (queda); repetir NÃO duplica a cópia e conclui", async () => {
  for (const [opcao, erro] of [[{ recusarMarca: true }, "acao_parcial"], [{ cortarNaMarca: true }, "acao_incerta"]]) {
    const cx = caixas(), a = await rodar(mover(), { capacidade: SEM_MOVE, ...opcao }, { caixas: cx });
    assert.deepEqual([a.r.ok, a.r.erro], [false, erro], JSON.stringify(opcao)); assert.equal(cx.Archive.msgs.length, 1, "a cópia existe"); assert.ok(!cx.INBOX.msgs.find((m) => m.uid === 2).flags.some((f) => /deleted/i.test(f)), "a original NÃO foi marcada"); assert.ok(!a.cmds.some((c) => /EXPUNGE/.test(c)), "nada foi expurgado");
    const b = await rodar(mover(), { capacidade: SEM_MOVE }, { caixas: cx });   // repetição (o servidor voltou ao normal)
    assert.deepEqual([b.r.ok, b.r.dados.resultado, b.r.dados.copia], [true, "aplicada", "ja_existia"], "recupera sem copiar de novo"); assert.equal(so(b.cmds, /UID COPY/).length, 0);
    assert.equal(cx.Archive.msgs.length, 1, "uma cópia só, mesmo depois de duas tentativas"); assert.deepEqual(cx.INBOX.msgs.map((m) => m.uid), [1, 3]);
  }
});

test("queda NO COPY (a cópia pode ter sido feita): resultado incerto, nenhuma marca é enviada; a repetição não duplica", async () => {
  const cx = caixas(), a = await rodar(mover(), { capacidade: SEM_MOVE, cortarNaCopia: true }, { caixas: cx });
  assert.deepEqual([a.r.ok, a.r.erro], [false, "acao_incerta"]); assert.ok(!a.cmds.some((c) => /Deleted|EXPUNGE/.test(c)), "sem confirmação da cópia, a original não é tocada"); assert.equal(cx.Archive.msgs.length, 1);
  const b = await rodar(mover(), { capacidade: SEM_MOVE }, { caixas: cx }); assert.equal(b.r.ok, true); assert.equal(cx.Archive.msgs.length, 1, "continua uma cópia só"); assert.equal(so(b.cmds, /UID COPY/).length, 0);
});

test("repetição depois do sucesso: com UIDPLUS a original não existe mais ('mensagem_inexistente'); sem UIDPLUS a marcada é reconhecida e NADA é copiado nem marcado de novo", async () => {
  let cx = caixas(); await rodar(mover(), { capacidade: SEM_MOVE }, { caixas: cx });
  let b = await rodar(mover(), { capacidade: SEM_MOVE }, { caixas: cx }); assert.deepEqual([b.r.ok, b.r.erro], [false, "mensagem_inexistente"]); assert.ok(!b.cmds.some((c) => /^UID (COPY|STORE|EXPUNGE)/.test(c))); assert.equal(cx.Archive.msgs.length, 1);
  cx = caixas(); await rodar(mover(), { capacidade: SEM_MOVE_SEM_UIDPLUS }, { caixas: cx });
  b = await rodar(mover(), { capacidade: SEM_MOVE_SEM_UIDPLUS }, { caixas: cx }); assert.deepEqual([b.r.ok, b.r.dados.resultado], [true, "aplicada"]); assert.ok(!b.cmds.some((c) => /^UID (COPY|STORE|EXPUNGE)/.test(c)), "nada de novo foi enviado"); assert.equal(cx.Archive.msgs.length, 1);
});

test("COPY recusado: 'acao_recusada' e nada mais é enviado; COPY 'OK' sem a cópia aparecer: 'acao_incerta' e a original NÃO é marcada", async () => {
  let cx = caixas(), a = await rodar(mover(), { capacidade: SEM_MOVE, copiaRecusa: true }, { caixas: cx });
  assert.deepEqual([a.r.ok, a.r.erro], [false, "copia_cannot"], "o [CANNOT] do servidor vira código fechado"); assert.ok(!a.cmds.some((c) => /Deleted|EXPUNGE/.test(c))); assert.deepEqual(cx.INBOX.msgs.map((m) => m.uid), [1, 2, 3]); assert.equal(cx.Archive.msgs.length, 0);
  cx = caixas(); a = await rodar(mover(), { capacidade: SEM_MOVE, copiaSumida: true }, { caixas: cx });
  assert.deepEqual([a.r.ok, a.r.erro], [false, "acao_incerta"]); assert.ok(!a.cmds.some((c) => /Deleted|EXPUNGE/.test(c)), "sem a cópia confirmada a original fica intacta"); assert.ok(!cx.INBOX.msgs.some((m) => m.flags.some((f) => /deleted/i.test(f))));
});

test("identidade e destino valem também sem MOVE: UIDVALIDITY, UID, Message-ID diferentes, destino inválido, mensagem sem Message-ID = nada copiado nem marcado", async () => {
  for (const [extra, erro] of [[{ uidvalidity_esperado: 1 }, "uidvalidity_mudou"], [{ uid: 99 }, "mensagem_inexistente"], [{ message_id_esperado: "<outra@exemplo.com>" }, "identidade_divergente"], [{ destino: "INBOX" }, "pasta_invalida"], [{ destino: "Pai" }, "pasta_invalida"], [{ destino: "Nao Existe" }, "pasta_inexistente"]]) {
    const x = await rodar(mover(extra), { capacidade: SEM_MOVE }); assert.deepEqual([x.r.ok, x.r.erro], [false, erro], JSON.stringify(extra)); assert.ok(!x.cmds.some((c) => /^UID (COPY|STORE|EXPUNGE)/.test(c)), "nada foi alterado: " + JSON.stringify(extra));
  }
  const cx = caixas(); cx.INBOX.msgs[1].cab = cx.INBOX.msgs[1].cab.replace(/Message-ID: [^\r]*\r\n/, "");
  const y = await rodar(mover(), { capacidade: SEM_MOVE }, { caixas: cx }); assert.deepEqual([y.r.ok, y.r.erro], [false, "sem_message_id"]); assert.ok(!y.cmds.some((c) => /^UID (COPY|STORE|EXPUNGE)/.test(c)), "sem Message-ID não há como evitar duplicata");
});

test("arquivar e excluir têm destinos DISTINTOS e nunca se misturam: Archive recebe só o arquivado, Deleted Messages só o excluído", async () => {
  const cx = caixas();
  const a = await rodar(mover({ destino: "Archive", uid: 1 }), { capacidade: SEM_MOVE }, { caixas: cx }), e = await rodar(mover({ destino: "Deleted Messages", uid: 2 }), { capacidade: SEM_MOVE }, { caixas: cx });
  assert.deepEqual([a.r.ok, e.r.ok], [true, true]);
  assert.deepEqual(cx.Archive.msgs.map((m) => m.cab.match(/Message-ID: <m(\d+)@/)[1]), ["1"], "no Archive só a 1"); assert.deepEqual(cx["Deleted Messages"].msgs.map((m) => m.cab.match(/Message-ID: <m(\d+)@/)[1]), ["2"], "na Lixeira só a 2");
  assert.ok(!a.cmds.some((c) => c.includes("Deleted Messages")) && !e.cmds.some((c) => c.includes('"Archive"')), "cada comando mira só o seu destino"); assert.deepEqual(cx.INBOX.msgs.map((m) => m.uid), [3]);
});


test("recusa do COPY: a causa sai como código FECHADO (nunca o texto do servidor): [OVERQUOTA], [TRYCREATE], [NOPERM], NO e BAD sem código", async () => {
  for (const [texto, esperado] of [["NO [OVERQUOTA] sem espaço", "copia_overquota"], ["NO [TRYCREATE] destino", "copia_trycreate"], ["NO texto livre com segredo-xyz", "copia_no"], ["BAD comando", "copia_bad"], ["NO [NOPERM] x", "copia_noperm"]]) {
    const s = servidorFalso({ pastas: LISTA, caixas: caixas(), capacidade: SEM_MOVE, copiaRecusa: true, copiaRecusaTexto: texto });
    const r = await executarOperacao({ abrir: async () => s.socket })(mover());
    assert.deepEqual([r.ok, r.erro], [false, esperado], texto); assert.ok(!JSON.stringify(r).includes("segredo-xyz"), "o texto do servidor nunca sai");
    assert.ok(!s.log.some((l) => /Deleted|EXPUNGE/.test(l)), "nada foi marcado nem expurgado");
  }
});
