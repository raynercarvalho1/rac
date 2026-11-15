// Worker de PRODUTO do RAC Inbox (experimentos/rac-inbox-worker): canal assinado (HMAC), anti-replay, esquema do corpo, IMAP somente leitura e varredura do código.
// TUDO AQUI É SIMULADO: o servidor IMAP é falso (tests/rac_inbox_worker_servidor.mjs) e o registro de nonces é uma tabela em memória. Nada disto prova o iCloud real nem o runtime da Cloudflare.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { POLITICA } from "../experimentos/rac-inbox-worker/src/politica.mjs";
import { assinar, verificarCanal, ErroCanal, sha256Hex, stringCanonica } from "../experimentos/rac-inbox-worker/src/canal.mjs";
import { registrarNonce, prepararNonces, NonceUnico, consumirNonce } from "../experimentos/rac-inbox-worker/src/replay.mjs";
import { tratar, examinarCorpo, executarOperacao } from "../experimentos/rac-inbox-worker/src/rotas.mjs";
import { comandoPermitido, dataInterna } from "../experimentos/rac-inbox-worker/src/imap.mjs";
import { decodificarCabecalho, decodificarPasta, lerEnderecos, htmlParaTexto, lerSexp } from "../experimentos/rac-inbox-worker/src/mime.mjs";
import { servidorFalso, mensagem, utf8Latin1, b64 } from "./rac_inbox_worker_servidor.mjs";

const SEGREDO = "segredo-de-teste-com-mais-de-32-caracteres-xx", AGORA = 1763200000, CONTA = "11111111-1111-4111-8111-111111111111";
const SENHA = "abcd-efgh-ijkl-mnop", USUARIO = "pessoa@icloud.example";
const enc = new TextEncoder();
const NONCE = (n) => "nonce" + String(n).padStart(14, "0");

async function pedido(corpoObj, { operacao = corpoObj.operacao, ts = AGORA, nonce = NONCE(1), chave = "k1", segredo = SEGREDO, trocar } = {}) {
  const bytes = enc.encode(JSON.stringify(corpoObj));
  const assinatura = await assinar({ segredo, chave, timestamp: ts, nonce, operacao, corpoBytes: bytes });
  const cab = { "Content-Type": "application/json", "X-RAC-Key-Id": chave, "X-RAC-Timestamp": String(ts), "X-RAC-Nonce": nonce, "X-RAC-Operacao": operacao, "X-RAC-Assinatura": assinatura, ...(trocar || {}) };
  return new Request("https://worker.exemplo/v1/op", { method: "POST", headers: cab, body: bytes });
}
const base = (extra = {}) => ({ operacao: "testar_conta", conta_id: CONTA, usuario: USUARIO, senha: SENHA, ...extra });

/* ---------- o canal ---------- */
test("canal: assinatura válida passa; corpo adulterado, operação trocada, chave/instante/nonce inválidos e chave fraca são recusados com código fechado", async () => {
  const ver = (req, bytes, extra = {}) => verificarCanal({ request: req, corpoBytes: bytes, segredos: { k1: SEGREDO }, agoraS: AGORA, ...extra });
  const corpo = base(), bytes = enc.encode(JSON.stringify(corpo));
  const ok = await ver(await pedido(corpo), bytes);
  assert.deepEqual([ok.chave, ok.operacao, ok.nonce], ["k1", "testar_conta", NONCE(1)]);
  const falha = async (promessa, codigo, msg) => { await assert.rejects(promessa, (e) => e instanceof ErroCanal && e.codigo === codigo, msg); };
  await falha(ver(await pedido(corpo), enc.encode(JSON.stringify({ ...corpo, conta_id: "22222222-2222-4222-8222-222222222222" }))), "assinatura_invalida", "corpo adulterado");
  await falha(ver(await pedido(corpo, { trocar: { "X-RAC-Operacao": "ler_mensagem" } }), bytes), "assinatura_invalida", "operação trocada no cabeçalho");
  await falha(ver(await pedido(corpo, { segredo: "outro-segredo-de-teste-com-mais-de-32-caracteres" }), bytes), "assinatura_invalida", "segredo errado");
  await falha(ver(await pedido(corpo, { ts: AGORA - 61 }), bytes), "timestamp_fora_da_janela", "instante antigo");
  await falha(ver(await pedido(corpo, { ts: AGORA + 61 }), bytes), "timestamp_fora_da_janela", "instante no futuro");
  assert.equal((await ver(await pedido(corpo, { ts: AGORA - 60 }), bytes)).timestamp, AGORA - 60, "dentro da janela de 60 s");
  await falha(ver(await pedido(corpo, { chave: "k2" }), bytes), "chave_desconhecida", "k2 sem segredo configurado");
  await falha(ver(await pedido(corpo), bytes, { segredos: { k1: "curto" } }), "chave_desconhecida", "chave com menos de 32 caracteres");
  await falha(ver(await pedido(corpo, { trocar: { "X-RAC-Nonce": "curto" } }), bytes), "cabecalhos_invalidos");
  await falha(ver(await pedido(corpo, { trocar: { "X-RAC-Assinatura": "v1=zz" } }), bytes), "cabecalhos_invalidos");
  await falha(ver(await pedido(corpo, { trocar: { "X-RAC-Timestamp": "abc" } }), bytes), "cabecalhos_invalidos");
  await falha(ver(await pedido(corpo), bytes, { segredos: null }), "canal_nao_configurado");
  const k2 = await ver(await pedido(corpo, { chave: "k2", segredo: "segundo-segredo-de-teste-com-mais-de-32-caracteres" }), bytes, { segredos: { k1: SEGREDO, k2: "segundo-segredo-de-teste-com-mais-de-32-caracteres" } });
  assert.equal(k2.chave, "k2", "rotação: as duas chaves convivem");
  assert.match(stringCanonica({ metodo: "POST", caminho: "/v1/op", chave: "k1", timestamp: "1", nonce: "n", operacao: "o", hashCorpo: await sha256Hex(bytes) }), /^rac-canal-v1\nPOST\n\/v1\/op\nk1\n1\nn\no\n[0-9a-f]{64}$/, "a string canônica liga versão, método, caminho, chave, instante, nonce, operação e hash do corpo");
});

test("replay: registro de nonce de uso único (lógica pura + Durable Object de mentira); falha do registro = falha fechada", async () => {
  const linhas = new Map();   // sql de mentira: só as 3 instruções que o código usa
  const sql = { exec(q, ...v) {
    if (/^CREATE TABLE/.test(q)) return { toArray: () => [] };
    if (/^DELETE FROM nonces/.test(q)) { for (const [k, x] of linhas) if (x.expira < v[0]) linhas.delete(k); return { toArray: () => [] }; }
    if (/^INSERT INTO nonces/.test(q)) { if (linhas.has(v[0])) return { toArray: () => [] }; linhas.set(v[0], { visto: v[1], expira: v[2] }); return { toArray: () => [{ nonce: v[0] }] }; }
    throw new Error("sql inesperado: " + q);
  } };
  prepararNonces(sql);
  assert.equal(registrarNonce(sql, { nonce: NONCE(1), agoraS: 1000, retencaoS: 600 }), true);
  assert.equal(registrarNonce(sql, { nonce: NONCE(1), agoraS: 1001, retencaoS: 600 }), false, "mesmo nonce de novo = replay");
  assert.equal(registrarNonce(sql, { nonce: NONCE(2), agoraS: 1001, retencaoS: 600 }), true);
  assert.equal(registrarNonce(sql, { nonce: NONCE(1), agoraS: 1000 + 601, retencaoS: 600 }), true, "só depois da retenção (≥ 2 janelas) o nonce velho é esquecido");
  assert.deepEqual([...linhas.values()].map((x) => Object.keys(x).join()).filter((v, i, l) => l.indexOf(v) === i), ["visto,expira"], "só instantes: nunca assinatura, corpo ou credencial");
  assert.ok(POLITICA.canal.nonceRetencaoS >= 2 * POLITICA.canal.janelaS, "retenção ≥ duas janelas");

  const estado = { transacoes: 0 };
  const objeto = new NonceUnico({ storage: { sql, transactionSync: (f) => { estado.transacoes++; return f(); } } }, {}, { agora: () => 2000 });
  const chamar = (corpo) => objeto.fetch(new Request("https://registro.interno/nonce", { method: "POST", body: JSON.stringify(corpo) })).then((r) => r.json().then((j) => [r.status, j]));
  assert.deepEqual(await chamar({ nonce: NONCE(7) }), [200, { novo: true }]);
  assert.deepEqual(await chamar({ nonce: NONCE(7) }), [200, { novo: false }]);
  assert.equal((await chamar({ nonce: "ruim" }))[0], 400); assert.equal((await chamar({ nonce: NONCE(8), extra: 1 }))[0], 400);

  const ns = (resposta) => ({ idFromName: (n) => n, get: () => ({ fetch: async () => resposta() }) });
  assert.equal(await consumirNonce(ns(() => new Response(JSON.stringify({ novo: true }), { status: 200 })), NONCE(1)), true);
  assert.equal(await consumirNonce(ns(() => new Response(JSON.stringify({ novo: false }), { status: 200 })), NONCE(1)), false);
  for (const ruim of [() => new Response("{}", { status: 500 }), () => new Response(JSON.stringify({ novo: "sim" }), { status: 200 }), () => { throw new Error("caiu"); }]) await assert.rejects(consumirNonce(ns(ruim), NONCE(1)), (e) => e.codigo === "registro_indisponivel");
  await assert.rejects(consumirNonce(undefined, NONCE(1)), (e) => e.codigo === "registro_indisponivel", "sem o Durable Object configurado a operação não acontece");
});

/* ---------- a rota ---------- */
function ambienteRota({ resultado = { ok: true, dados: { x: 1 } }, registro = "ok" } = {}) {
  const vistos = new Set(), chamadas = { consumir: 0, executar: 0 }, corpos = [];
  return { chamadas, corpos, deps: {
    segredos: { k1: SEGREDO }, agora: () => AGORA,
    consumir: async (n) => { chamadas.consumir++; if (registro === "cai") throw new Error("x"); if (registro === "estranho") return "talvez"; if (vistos.has(n)) return false; vistos.add(n); return true; },
    executar: async (c) => { chamadas.executar++; corpos.push(c); return resultado; },
  } };
}
const corpoDe = async (r) => ({ status: r.status, json: await r.json() });

test("rota: ordem de defesa (assinatura ANTES do nonce, nonce ANTES da operação), replay 409, esquema fechado e nenhuma credencial no eco", async () => {
  const a = ambienteRota();
  let r = await corpoDe(await tratar(await pedido(base()), a.deps));
  assert.deepEqual([r.status, r.json.ok, r.json.operacao], [200, true, "testar_conta"]);
  assert.deepEqual(a.chamadas, { consumir: 1, executar: 1 });
  r = await corpoDe(await tratar(await pedido(base()), a.deps));
  assert.deepEqual([r.status, r.json.erro], [409, "replay"], "a MESMA requisição de novo (mesmo nonce) é replay");
  assert.deepEqual(a.chamadas, { consumir: 2, executar: 1 }, "no replay a operação NÃO roda");

  const b = ambienteRota();
  r = await corpoDe(await tratar(await pedido(base(), { segredo: "outro-segredo-de-teste-com-mais-de-32-caracteres", nonce: NONCE(2) }), b.deps));
  assert.deepEqual([r.status, r.json.erro], [401, "assinatura_invalida"]);
  assert.deepEqual(b.chamadas, { consumir: 0, executar: 0 }, "assinatura inválida: nem o registro de nonces é tocado");
  r = await corpoDe(await tratar(await pedido(base(), { ts: AGORA - 999, nonce: NONCE(3) }), b.deps));
  assert.deepEqual([r.status, r.json.erro], [401, "timestamp_fora_da_janela"]);
  assert.deepEqual(b.chamadas, { consumir: 0, executar: 0 });

  for (const [rotulo, registro, status] of [["registro fora do ar", "cai", 503], ["resposta estranha do registro", "estranho", 503]]) {
    const c = ambienteRota({ registro });
    r = await corpoDe(await tratar(await pedido(base(), { nonce: NONCE(4) }), c.deps));
    assert.deepEqual([r.status, r.json.erro, c.chamadas.executar], [status, "registro_indisponivel", 0], rotulo + ": falha fechada, a operação não acontece");
  }

  const d = ambienteRota();
  const falhas = [
    [{ ...base(), extra: 1 }, "campos_inesperados"], [{ ...base(), conta_id: "x" }, "campo_invalido"], [{ ...base(), usuario: "sem-arroba" }, "credencial_formato_invalido"],
    [{ ...base(), senha: "SenhaPrincipal123" }, "credencial_formato_invalido"], [{ ...base(), operacao: "enviar" }, "operacao_divergente"],
  ];
  let n = 10;
  for (const [corpo, erro] of falhas) { r = await corpoDe(await tratar(await pedido(corpo, { operacao: "testar_conta", nonce: NONCE(n++) }), d.deps)); assert.equal(r.json.erro, erro); assert.ok(!JSON.stringify(r.json).includes(SENHA) && !JSON.stringify(r.json).includes(USUARIO), "o erro nunca ecoa o que o cliente mandou"); }
  assert.equal(d.chamadas.executar, 0, "esquema inválido: nenhuma operação");
  for (const [op, extra, erro] of [["estado_pasta", {}, "campo_ausente"], ["listar_mensagens", { pasta: "INBOX" }, "campo_invalido"], ["listar_mensagens", { pasta: "INBOX", ultimas: 5, desde_uid: 2 }, "campo_invalido"], ["listar_mensagens", { pasta: "INBOX", ultimas: 5, limite: 101 }, "campo_invalido"], ["ler_mensagem", { pasta: "INBOX", uid: 0 }, "campo_invalido"]]) {
    r = await corpoDe(await tratar(await pedido(base({ operacao: op, ...extra }), { nonce: NONCE(n++) }), d.deps)); assert.equal(r.json.erro, erro, op + " " + JSON.stringify(extra));
  }
  const ok = await corpoDe(await tratar(await pedido(base({ operacao: "listar_mensagens", pasta: "INBOX", ultimas: 10, limite: 20 }), { nonce: NONCE(n++) }), d.deps));
  assert.equal(ok.status, 200); assert.equal(d.corpos.at(-1).ultimas, 10);

  assert.equal((await tratar(new Request("https://w/v1/op", { method: "GET" }), a.deps)).status, 404);
  assert.equal((await tratar(new Request("https://w/outra", { method: "POST", body: "{}" }), a.deps)).status, 404);
  assert.equal((await tratar(new Request("https://w/v1/op", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "x" }), a.deps)).status, 415);
  assert.equal((await tratar(new Request("https://w/v1/op", { method: "POST", headers: { "Content-Type": "application/json" }, body: "x".repeat(5000) }), a.deps)).status, 413);
  assert.equal((await tratar(new Request("https://w/v1/op", { method: "POST", headers: { "Content-Type": "application/json" } }), a.deps)).status, 400);
  const e = ambienteRota({ resultado: { ok: false, erro: "autenticacao_recusada" } });
  r = await corpoDe(await tratar(await pedido(base(), { nonce: NONCE(n++) }), e.deps));
  assert.deepEqual([r.status, r.json], [422, { ok: false, erro: "autenticacao_recusada" }]);
  const f = ambienteRota({ resultado: { ok: false, erro: "texto livre do servidor com " + SENHA } });
  r = await corpoDe(await tratar(await pedido(base(), { nonce: NONCE(n++) }), f.deps));
  assert.deepEqual([r.status, r.json], [502, { ok: false, erro: "falha_inesperada" }], "erro fora da lista fechada vira código fixo");
  const g = ambienteRota(); g.deps.executar = async () => { throw new Error("explodiu com " + SENHA); };
  r = await corpoDe(await tratar(await pedido(base(), { nonce: NONCE(n++) }), g.deps));
  assert.deepEqual([r.status, r.json], [500, { ok: false, erro: "falha_interna" }]);
});

/* ---------- peças puras ---------- */
test("comandos IMAP: só a lista fechada passa; SELECT, STORE, COPY, APPEND, EXPUNGE, BODY sem PEEK e nomes de pasta perigosos são barrados antes do socket", () => {
  const ok = [["CAPABILITY", ""], ["LOGOUT", ""], ["LOGIN", ' "a@b.co" "abcd-efgh-ijkl-mnop"'], ["LIST", ' "" "*"'], ["EXAMINE", ' "INBOX"'], ["EXAMINE", ' "Sent Messages"'], ["EXAMINE", ' "&AOk-s"'],
    ["FETCH", " 1:50 (UID FLAGS INTERNALDATE RFC822.SIZE BODY.PEEK[HEADER.FIELDS (FROM TO CC SUBJECT DATE MESSAGE-ID CONTENT-TYPE)]<0.8192>)"],
    ["UID", " FETCH 7 (UID FLAGS INTERNALDATE RFC822.SIZE BODYSTRUCTURE BODY.PEEK[HEADER.FIELDS (FROM TO CC SUBJECT DATE MESSAGE-ID CONTENT-TYPE)]<0.8192>)"],
    ["UID", " FETCH 7 (BODY.PEEK[1.2]<0.131072>)"], ["UID", " FETCH 7 (BODY.PEEK[2])"], ["UID", " FETCH 9:* (UID FLAGS INTERNALDATE RFC822.SIZE BODY.PEEK[HEADER.FIELDS (FROM TO CC SUBJECT DATE MESSAGE-ID CONTENT-TYPE)]<0.8192>)"],
    ["UID", " FETCH 1,5,9 (UID FLAGS INTERNALDATE RFC822.SIZE BODY.PEEK[HEADER.FIELDS (FROM TO CC SUBJECT DATE MESSAGE-ID CONTENT-TYPE)]<0.8192>)"], ["UID", " SEARCH UID 1:99"]];
  for (const [v, a] of ok) assert.equal(comandoPermitido(v, a), true, v + a);
  const ruim = [["SELECT", ' "INBOX"'], ["STORE", " 1 +FLAGS (\\Deleted)"], ["COPY", ' 1 "Lixo"'], ["APPEND", ' "INBOX" {10}'], ["EXPUNGE", ""], ["DELETE", ' "x"'], ["IDLE", ""], ["STARTTLS", ""], ["AUTHENTICATE", " PLAIN"],
    ["MOVE", ' 1 "x"'], ["EXAMINE", ' "a"b"'], ["EXAMINE", ' "a\\b"'], ["EXAMINE", ' ""'], ["EXAMINE", ' "' + "x".repeat(201) + '"'], ["LIST", ' "" "INBOX"'], ["CAPABILITY", " x"],
    ["UID", " FETCH 7 (BODY[1])"], ["UID", " FETCH 7 (BODY.PEEK[1] FLAGS)"], ["UID", " STORE 7 +FLAGS (\\Seen)"], ["UID", " FETCH 7 (RFC822)"], ["UID", " FETCH * (UID)"], ["UID", " SEARCH ALL"], ["UID", " SEARCH UID 1:99999999999"],
    ["FETCH", " * (UID)"], ["FETCH", " 1:5 (BODY[1])"], ["FETCH", " 1 (UID)"], ["LOGIN", ' "a" "b"\r\na2 STORE'], ["LOGIN", ' "a"b" "c"']];
  for (const [v, a] of ruim) assert.equal(comandoPermitido(v, a), false, v + a);
});

test("mime: cabeçalhos RFC 2047, endereços, pastas em UTF-7, data interna, HTML→texto e limites do leitor de listas", () => {
  assert.equal(decodificarCabecalho("=?UTF-8?B?" + b64(utf8Latin1("Olá mundo")) + "?="), "Olá mundo");
  assert.equal(decodificarCabecalho("=?ISO-8859-1?Q?Jos=E9_Silva?="), "José Silva");
  assert.equal(decodificarCabecalho("=?UTF-8?Q?a?= =?UTF-8?Q?b?="), "ab", "palavras vizinhas se juntam");
  assert.equal(decodificarCabecalho("sem codificação"), "sem codificação");
  assert.deepEqual(lerEnderecos('"Silva, Ana" <ana@ex.com>, bob@ex.com, ruim, =?UTF-8?Q?Jo=C3=A3o?= <j@ex.com>'), [{ nome: "Silva, Ana", endereco: "ana@ex.com" }, { nome: "", endereco: "bob@ex.com" }, { nome: "João", endereco: "j@ex.com" }]);
  assert.equal(lerEnderecos("x@y.co,".repeat(80)).length, 50, "no máximo 50 endereços");
  assert.equal(decodificarPasta("&AOk-s e &ZeVnLIqe-"), "és e 日本語"); assert.equal(decodificarPasta("A&-B"), "A&B"); assert.equal(decodificarPasta("Sent Messages"), "Sent Messages");
  assert.equal(dataInterna("14-Nov-2026 10:20:30 +0000"), "2026-11-14T10:20:30.000Z"); assert.equal(dataInterna("14-Nov-2026 10:20:30 -0300"), "2026-11-14T13:20:30.000Z"); assert.equal(dataInterna("lixo"), null);
  assert.equal(htmlParaTexto("<html><head><style>p{}</style></head><body><p>Olá&nbsp;<b>mundo</b> &amp; &#233;</p><script>alert(1)</script><ul><li>um</li><li>dois</li></ul><a href='x'>link</a></body></html>"), "Olá mundo & é\n• um\n• dois\nlink");
  assert.ok(!/<|script|alert/.test(htmlParaTexto("<div onclick='x'><img src='http://t/p.gif'>texto<script>alert(1)</script></div>")), "nada de marcação nem script no texto");
  assert.throws(() => lerSexp("(".repeat(50), []), (e) => e.codigo === "mime_limite_excedido"); assert.throws(() => lerSexp("(a", []), (e) => e.codigo === "resposta_malformada");
});

/* ---------- operações contra o servidor IMAP FALSO ---------- */
const LISTA = ['* LIST (\\HasNoChildren) "/" "INBOX"', '* LIST (\\HasNoChildren \\Sent) "/" "Sent Messages"', '* LIST (\\HasNoChildren \\Trash) "/" "Deleted Messages"', '* LIST (\\HasNoChildren) "/" "&AOk-s"', '* LIST (\\Noselect \\HasChildren) "/" "Pai"', '* LIST (\\HasNoChildren) "/" {5}\r\nRAC X'];
const ASSUNTO = "=?UTF-8?B?" + b64(utf8Latin1("Olá, relatório")) + "?=";
function caixaPadrao() {
  return { INBOX: { uidvalidity: 700, uidnext: 6, msgs: [
    mensagem({ uid: 1, assunto: "Primeira", flags: [] }),
    mensagem({ uid: 2, assunto: ASSUNTO, de: "=?UTF-8?Q?Jo=C3=A3o?= <joao@exemplo.com>", flags: ["\\Seen", "\\Flagged"], tipo: "multipart/alternative; boundary=x",
      estrutura: '(("TEXT" "PLAIN" ("CHARSET" "ISO-8859-1") NIL NIL "QUOTED-PRINTABLE" 40 1 NIL NIL NIL)("TEXT" "HTML" ("CHARSET" "utf-8") NIL NIL "BASE64" 90 2 NIL NIL NIL) "ALTERNATIVE")',
      partes: { "1": "Ol=E1 do plano, caf=E9 \r\ncom acento", "2": b64(utf8Latin1("<p>HTML <b>não</b> usado</p>")) } }),
    mensagem({ uid: 3, assunto: "Só HTML", tipo: "text/html; charset=utf-8", estrutura: '("TEXT" "HTML" ("CHARSET" "utf-8") NIL NIL "BASE64" 120 3 NIL NIL NIL)', partes: { "1": b64(utf8Latin1("<html><body><p>Texto <i>do</i> html</p><script>alert(1)</script></body></html>")) } }),
    mensagem({ uid: 4, assunto: "Com anexo", tipo: "multipart/mixed; boundary=y",
      estrutura: '(("TEXT" "PLAIN" ("CHARSET" "utf-8") NIL NIL "7BIT" 11 1 NIL NIL NIL)("APPLICATION" "PDF" ("NAME" "=?UTF-8?Q?relat=C3=B3rio.pdf?=") NIL NIL "BASE64" 24 NIL ("ATTACHMENT" ("FILENAME" "=?UTF-8?Q?relat=C3=B3rio.pdf?=")) NIL) "MIXED")',
      partes: { "1": "Veja o PDF.", "2": b64("%PDF-1.4 conteudo!!") } }),
    mensagem({ uid: 5, assunto: "Anexo gigante", tipo: "multipart/mixed; boundary=z", estrutura: '(("TEXT" "PLAIN" ("CHARSET" "utf-8") NIL NIL "7BIT" 5 1 NIL NIL NIL)("APPLICATION" "ZIP" ("NAME" "g.zip") NIL NIL "BASE64" 5000000 NIL ("ATTACHMENT" ("FILENAME" "g.zip")) NIL) "MIXED")', partes: { "1": "texto", "2": "xx" } }),
  ] }, "Sent Messages": { uidvalidity: 5, uidnext: 1, msgs: [] } };
}
async function rodar(op, extra = {}, { senha = SENHA, literalPrimeiro = false, caixas = caixaPadrao() } = {}) {
  const s = servidorFalso({ pastas: LISTA, caixas, literalPrimeiro });
  const executar = executarOperacao({ abrir: async () => s.socket, relogio: (() => { let t = 0; return () => (t += 7); })() });
  const r = await executar({ operacao: op, conta_id: CONTA, usuario: USUARIO, senha, ...extra });
  return { r, log: s.log };
}
const verbos = (log) => log.map((l) => /^a\d+ ([A-Z]+)(?: (FETCH|SEARCH))?/.exec(l)).filter(Boolean).map((m) => m[1] + (m[2] ? " " + m[2] : ""));

test("operações IMAP (servidor falso): testar_conta, listar_pastas e estado_pasta; só verbos de leitura saem e a senha só aparece no LOGIN", async () => {
  let { r, log } = await rodar("testar_conta");
  assert.deepEqual([r.ok, typeof r.dados.duracao_ms], [true, "number"]);
  assert.deepEqual(verbos(log), ["CAPABILITY", "LOGIN", "LOGOUT"]);
  assert.equal(log.filter((l) => l.includes(SENHA)).length, 1, "a senha vai UMA vez, só no LOGIN");

  ({ r, log } = await rodar("listar_pastas"));
  assert.deepEqual(r.dados.pastas.map((p) => [p.nome, p.nome_exibicao, p.uso, p.selecionavel]), [
    ["INBOX", "INBOX", "entrada", true], ["Sent Messages", "Sent Messages", "enviados", true], ["Deleted Messages", "Deleted Messages", "lixeira", true], ["&AOk-s", "és", "outra", true], ["Pai", "Pai", "outra", false], ["RAC X", "RAC X", "outra", true]]);
  assert.deepEqual(verbos(log), ["CAPABILITY", "LOGIN", "LIST", "LOGOUT"]);

  ({ r } = await rodar("estado_pasta", { pasta: "INBOX" }));
  assert.deepEqual(r.dados, { exame: { uidvalidity: 700, uidnext: 6 }, mensagens_na_pasta: 5, duracao_ms: r.dados.duracao_ms });
  ({ r } = await rodar("estado_pasta", { pasta: "Nao Existe" })); assert.deepEqual([r.ok, r.erro], [false, "pasta_inexistente"]);
  ({ r } = await rodar("estado_pasta", { pasta: 'a"b' })); assert.deepEqual([r.ok, r.erro], [false, "comando_nao_permitido"].slice(0, 1).concat(r.erro)); assert.equal(r.erro, "pasta_invalida");
  ({ r } = await rodar("estado_pasta", { pasta: "INBOX", uidvalidity_esperado: 999 })); assert.deepEqual([r.ok, r.erro], [false, "uidvalidity_mudou"], "UIDVALIDITY diferente do esperado interrompe antes de ler");
  ({ r } = await rodar("estado_pasta", { pasta: "INBOX", uidvalidity_esperado: 700 })); assert.equal(r.ok, true);
});

test("autenticação recusada e falhas de conexão viram código fechado, sem repetir o login e sem vazar a senha", async () => {
  const { r, log } = await rodar("testar_conta", {}, { senha: "wxyz-wxyz-wxyz-wxyz" });
  assert.deepEqual([r.ok, r.erro], [false, "autenticacao_recusada"]);
  assert.equal(verbos(log).filter((v) => v === "LOGIN").length, 1, "UMA única tentativa de login");
  assert.ok(!JSON.stringify(r).includes("wxyz"), "a resposta não traz a senha");
  const sem = await executarOperacao({ abrir: async () => { throw new Error("rede caiu com " + SENHA); } })({ operacao: "testar_conta", conta_id: CONTA, usuario: USUARIO, senha: SENHA });
  assert.deepEqual(sem, { ok: false, erro: "conexao_falhou", autenticado: false }); assert.ok(!JSON.stringify(sem).includes(SENHA));
  const mudo = new TransformStream(); const w = mudo.writable.getWriter();
  const t = await executarOperacao({ abrir: async () => ({ readable: mudo.readable, writable: new WritableStream(), close: async () => {} }), politica: { ...POLITICA, imap: { ...POLITICA.imap, timeoutMs: 30 } } })({ operacao: "testar_conta", conta_id: CONTA, usuario: USUARIO, senha: SENHA });
  assert.deepEqual([t.ok, t.erro], [false, "timeout"]); void w;
  const saud = servidorFalso({}); const ruim = new TransformStream(); const ew = ruim.writable.getWriter(); void ew.write(new TextEncoder().encode("* BYE indisponivel\r\n"));   // sem await: ninguém lê ainda
  const s2 = await executarOperacao({ abrir: async () => ({ readable: ruim.readable, writable: new WritableStream(), close: async () => {} }) })({ operacao: "testar_conta", conta_id: CONTA, usuario: USUARIO, senha: SENHA }); void saud;
  assert.deepEqual([s2.ok, s2.erro], [false, "saudacao_invalida"]);
});

test("listar_mensagens (servidor falso): últimas, desde um UID e antes de um UID; ordem, flags, cabeçalhos decodificados; literal no meio da linha", async () => {
  for (const literalPrimeiro of [false, true]) {
    let { r, log } = await rodar("listar_mensagens", { pasta: "INBOX", ultimas: 50 }, { literalPrimeiro });
    assert.equal(r.ok, true, r.erro);
    assert.deepEqual(r.dados.mensagens.map((m) => m.uid), [5, 4, 3, 2, 1], "mais nova primeiro");
    const m2 = r.dados.mensagens.find((m) => m.uid === 2), m1 = r.dados.mensagens.find((m) => m.uid === 1);
    assert.equal(m2.assunto, "Olá, relatório"); assert.deepEqual(m2.de, { nome: "João", endereco: "joao@exemplo.com" }); assert.deepEqual([m2.lida, m2.sinalizada, m2.respondida, m2.rascunho], [true, true, false, false]);
    assert.equal(m2.recebida, "2026-11-14T10:20:30.000Z"); assert.equal(m2.tipo_conteudo, "multipart/alternative"); assert.equal(m2.anexo_provavel, false);
    assert.equal(r.dados.mensagens.find((m) => m.uid === 4).anexo_provavel, true, "multipart/mixed = anexo provável");
    assert.deepEqual([m1.lida, m1.message_id, m1.para], [false, "<m1@exemplo.com>", [{ nome: "Eu", endereco: "eu@icloud.com" }]]);
    assert.deepEqual(r.dados.exame, { uidvalidity: 700, uidnext: 6 }); assert.equal(r.dados.mais, false);
    assert.deepEqual(verbos(log), ["CAPABILITY", "LOGIN", "EXAMINE", "FETCH", "LOGOUT"]);
  }
  let { r } = await rodar("listar_mensagens", { pasta: "INBOX", ultimas: 50, limite: 2 });
  assert.deepEqual([r.dados.mensagens.map((m) => m.uid), r.dados.mais], [[5, 4], true], "limite menor que a caixa: avisa que há mais");
  ({ r } = await rodar("listar_mensagens", { pasta: "INBOX", desde_uid: 4 })); assert.deepEqual(r.dados.mensagens.map((m) => m.uid), [5, 4]);
  ({ r } = await rodar("listar_mensagens", { pasta: "INBOX", desde_uid: 6 })); assert.deepEqual([r.dados.mensagens.length, r.dados.mais], [0, false], "nada novo: o servidor devolve a última e o Worker descarta o que é anterior ao UID pedido");
  ({ r } = await rodar("listar_mensagens", { pasta: "INBOX", desde_uid: 1, limite: 3 })); assert.deepEqual([r.dados.mensagens.map((m) => m.uid), r.dados.mais], [[3, 2, 1], true]);
  ({ r } = await rodar("listar_mensagens", { pasta: "INBOX", antes_de_uid: 4, limite: 2 })); assert.deepEqual([r.dados.mensagens.map((m) => m.uid), r.dados.mais], [[3, 2], true]);
  let o = await rodar("listar_mensagens", { pasta: "INBOX", antes_de_uid: 4, limite: 2 }); assert.deepEqual(verbos(o.log), ["CAPABILITY", "LOGIN", "EXAMINE", "UID SEARCH", "UID FETCH", "LOGOUT"]);
  ({ r } = await rodar("listar_mensagens", { pasta: "INBOX", antes_de_uid: 1 })); assert.deepEqual(r.dados.mensagens, []);
  ({ r } = await rodar("listar_mensagens", { pasta: "Sent Messages", ultimas: 20 })); assert.deepEqual([r.dados.mensagens, r.dados.mensagens_na_pasta], [[], 0], "caixa vazia");
  ({ r } = await rodar("listar_mensagens", { pasta: "INBOX", ultimas: 5, desde_uid: 2 })); assert.equal(r.erro, "parametro_invalido");
  ({ r } = await rodar("listar_mensagens", { pasta: "INBOX", ultimas: 5, uidvalidity_esperado: 1 })); assert.equal(r.erro, "uidvalidity_mudou");
});

test("ler_mensagem (servidor falso): texto puro decodificado, HTML convertido (nunca HTML), anexos listados, mensagem inexistente; nada de BODY sem PEEK", async () => {
  let { r, log } = await rodar("ler_mensagem", { pasta: "INBOX", uid: 2 });
  assert.equal(r.ok, true, r.erro);
  const m = r.dados.mensagem;
  assert.deepEqual([m.formato, m.truncado, m.texto, m.assunto], ["texto", false, "Olá do plano, café \ncom acento", "Olá, relatório"], "quoted-printable em ISO-8859-1 vira texto correto; o HTML alternativo não é usado");
  assert.deepEqual(m.anexos, []);
  ({ r } = await rodar("ler_mensagem", { pasta: "INBOX", uid: 3 }));
  assert.deepEqual([r.dados.mensagem.formato, r.dados.mensagem.texto], ["html_convertido", "Texto do html"]); assert.ok(!/[<>]|script|alert/.test(r.dados.mensagem.texto), "o HTML nunca chega ao navegador");
  ({ r } = await rodar("ler_mensagem", { pasta: "INBOX", uid: 4 }, { literalPrimeiro: true }));
  assert.equal(r.dados.mensagem.texto, "Veja o PDF.");
  assert.deepEqual(r.dados.mensagem.anexos, [{ parte: "2", nome: "relatório.pdf", tipo: "application/pdf", tamanho: 24, inline: false }]);
  ({ r } = await rodar("ler_mensagem", { pasta: "INBOX", uid: 1 })); assert.equal(r.dados.mensagem.texto, "Olá, mundo");
  ({ r } = await rodar("ler_mensagem", { pasta: "INBOX", uid: 99 })); assert.deepEqual([r.ok, r.erro], [false, "mensagem_inexistente"]);
  ({ r } = await rodar("ler_mensagem", { pasta: "INBOX", uid: 2, uidvalidity_esperado: 1 })); assert.equal(r.erro, "uidvalidity_mudou");
  ({ r, log } = await rodar("ler_mensagem", { pasta: "INBOX", uid: 4 }));
  assert.deepEqual(verbos(log), ["CAPABILITY", "LOGIN", "EXAMINE", "UID FETCH", "UID FETCH", "LOGOUT"]);
  assert.ok(log.every((l) => !/\bBODY\[/.test(l) && !/STORE|SELECT|\+FLAGS/.test(l)), "só BODY.PEEK: a flag \\Seen nunca é alterada");
});

test("baixar_anexo (servidor falso): devolve base64 do conteúdo decodificado; recusa parte inexistente e anexo acima do limite sem baixá-lo", async () => {
  let { r, log } = await rodar("baixar_anexo", { pasta: "INBOX", uid: 4, parte: "2" });
  assert.equal(r.ok, true, r.erro);
  assert.deepEqual([r.dados.anexo.nome, r.dados.anexo.tipo, Buffer.from(r.dados.anexo.base64, "base64").toString("latin1")], ["relatório.pdf", "application/pdf", "%PDF-1.4 conteudo!!"]);
  assert.equal(r.dados.anexo.tamanho_bytes, 19);
  ({ r } = await rodar("baixar_anexo", { pasta: "INBOX", uid: 4, parte: "9" })); assert.deepEqual([r.ok, r.erro], [false, "parte_inexistente"]);
  ({ r, log } = await rodar("baixar_anexo", { pasta: "INBOX", uid: 5, parte: "2" })); assert.deepEqual([r.ok, r.erro], [false, "anexo_grande_demais"]);
  assert.ok(!log.some((l) => /BODY\.PEEK\[2\]\)/.test(l)), "o anexo acima do limite nem chega a ser pedido");
  ({ r } = await rodar("baixar_anexo", { pasta: "INBOX", uid: 4, parte: "1/../2" })); assert.equal(r.erro, "parametro_invalido");
  ({ r } = await rodar("baixar_anexo", { pasta: "INBOX", uid: 99, parte: "1" })); assert.equal(r.erro, "mensagem_inexistente");
});

test("fluxo completo pela rota: pedido assinado → nonce → IMAP falso → resposta; a senha não aparece em nenhuma resposta nem no que o servidor falso recebeu fora do LOGIN", async () => {
  const s = servidorFalso({ pastas: LISTA, caixas: caixaPadrao() });
  const vistos = new Set();
  const deps = { segredos: { k1: SEGREDO }, agora: () => AGORA, consumir: async (n) => (vistos.has(n) ? false : (vistos.add(n), true)), executar: executarOperacao({ abrir: async () => s.socket }) };
  const req = await pedido(base({ operacao: "listar_mensagens", pasta: "INBOX", ultimas: 3 }), { nonce: NONCE(50) });
  const resp = await tratar(req.clone(), deps), texto = await resp.text(), j = JSON.parse(texto);
  assert.deepEqual([resp.status, j.ok, j.dados.mensagens.map((m) => m.uid)], [200, true, [5, 4, 3]]);
  assert.ok(!texto.includes(SENHA) && !texto.includes(USUARIO), "a resposta nunca carrega a credencial");
  assert.equal(s.log.filter((l) => l.includes(SENHA)).length, 1);
  const rep = await tratar(req.clone(), deps); assert.equal(rep.status, 409, "o mesmo pedido assinado, reenviado, é replay");
});

/* ---------- o código do Worker ---------- */
test("código do Worker de produto: sem console, sem env, sem eval, sem armazenamento, sem verbo de escrita; só o index importa cloudflare:sockets; host fixo; chaves só dos secrets", () => {
  const dir = new URL("../experimentos/rac-inbox-worker/src/", import.meta.url);
  const arqs = fs.readdirSync(dir).filter((f) => f.endsWith(".mjs"));
  assert.deepEqual(arqs.sort(), ["canal.mjs", "imap.mjs", "index.mjs", "mime.mjs", "politica.mjs", "replay.mjs", "rotas.mjs"]);
  for (const a of arqs) {
    const t = fs.readFileSync(new URL(a, dir), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\/\/ [^\n"']*$/gm, "");
    assert.ok(!/\bconsole\b|process\.env|\beval\s*\(|new Function|\bimport\s*\(|\brequire\s*\(|localStorage|\bKV\b|\bD1\b|\bR2\b|service_role|SUPABASE/.test(t), a + ": sem log, env, eval, armazenamento nem service_role");
    assert.ok(!/["'`](?:SELECT|STORE|COPY|MOVE|APPEND|EXPUNGE|DELETE|RENAME|SUBSCRIBE|IDLE|AUTHENTICATE|STARTTLS|CREATE)["'`]/.test(t.replace(/CREATE TABLE IF NOT EXISTS[^"]*/g, "")), a + ": nenhum verbo IMAP de escrita");
    if (a !== "index.mjs") assert.ok(!/cloudflare:/.test(t), a + " não importa módulo da Cloudflare");
  }
  const idx = fs.readFileSync(new URL("index.mjs", dir), "utf8");
  assert.match(idx, /from "cloudflare:sockets"/); assert.match(idx, /RAC_CANAL_K1/); assert.ok(!/senha|password/i.test(idx.replace(/\/\/.*$/gm, "")), "o ponto de entrada não toca em senha");
  assert.equal(POLITICA.imap.host, "imap.mail.me.com"); assert.equal(POLITICA.imap.porta, 993);
  const w = JSON.parse(fs.readFileSync(new URL("../experimentos/rac-inbox-worker/wrangler.jsonc", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(w).sort(), ["$schema", "compatibility_date", "durable_objects", "main", "migrations", "name", "observability", "workers_dev"].sort());
  assert.equal(w.observability.enabled, false, "sem observabilidade: nada de log do Cloudflare com dados de e-mail");
  assert.deepEqual(w.durable_objects.bindings, [{ name: "NONCES", class_name: "NonceUnico" }]);
});
