// RAC Inbox · POC autenticada iCloud — P6 (sincronização incremental SOMENTE LEITURA da pasta RAC-TESTE).
// TUDO contra um servidor IMAP FALSO em memória: nenhuma rede, nenhuma conta Apple, nenhuma credencial real (sentinelas). Prova o protocolo, os comandos
// permitidos (nenhum FETCH, nenhum verbo de escrita), a decisão de sincronização, os limites e o esquema fechado; NÃO prova o servidor real da Apple.
import { test } from "node:test";
import assert from "node:assert/strict";
import { POLITICA } from "../experimentos/icloud-auth-probe/src/politica.mjs";
import { tratar, examinarCorpo } from "../experimentos/icloud-auth-probe/src/rotas.mjs";
import { executarP6, montarRespostaP6, compararSincronizacao, ESTAGIOS_P6, TIPOS_SINCRONIZACAO } from "../experimentos/icloud-auth-probe/src/sincronizacao.mjs";
import { ERROS_P2 } from "../experimentos/icloud-auth-probe/src/mensagem.mjs";

const SENHA = "zzzz-yyyy-xxxx-wwww";
const USUARIO = "sentinela.p6@example.com";
const PASTA_SECRETA = "Pessoal/Banco Secreto";
const SENTINELAS = [SENHA, USUARIO, PASTA_SECRETA];
const enc = (t) => Uint8Array.from(Buffer.from(t, "latin1"));
const dec = (b) => Buffer.from(b).toString("latin1");

function servidorFalso(roteiro) {
  const enviados = [];
  let controle;
  const readable = new ReadableStream({ start(c) { controle = c; c.enqueue(enc("* OK IMAP4rev1 pronto\r\n")); } });
  let fechado = false;
  const writable = new WritableStream({
    write(pedaco) {
      const texto = dec(pedaco);
      enviados.push(texto);
      const m = /^(a\d+) ([A-Z]+)(.*)\r\n$/.exec(texto);
      const resp = m ? roteiro(m[2], m[3], m[1]) : "* BAD formato\r\n";
      if (resp === "FECHAR") { fechado = true; controle.close(); } else if (resp !== null && resp !== undefined) controle.enqueue(enc(resp));
    },
  });
  return { socket: { readable, writable, close: async () => { if (!fechado) { fechado = true; try { controle.close(); } catch (_) { /* já fechado */ } } } }, enviados };
}

const CAPS = "IMAP4rev1 UIDPLUS MOVE IDLE NAMESPACE CONDSTORE AUTH=PLAIN";
function icloud(opc = {}) {
  const { login = "OK", pasta = true, uidvalidity = 1700000000, uidnext = 42, existentes = 5, etiquetado = "[READ-ONLY] EXAMINE concluído", permanentflags = "()", status = {}, extras = "", caps = CAPS } = opc;
  return (verbo, args, tag) => {
    if (status[verbo]) { const r = status[verbo](args, tag); if (r !== undefined) return r; }
    if (verbo === "CAPABILITY") return "* CAPABILITY " + caps + "\r\n" + tag + " OK CAPABILITY concluído\r\n";
    if (verbo === "LOGIN") return tag + " " + login + (login === "OK" ? " LOGIN concluído" : " [AUTHENTICATIONFAILED] a senha " + SENHA + " foi recusada para " + USUARIO) + "\r\n";
    if (verbo === "LIST") return pasta === false ? tag + " OK LIST concluído\r\n" : '* LIST (\\HasNoChildren) "/" "RAC-TESTE"\r\n' + tag + " OK LIST concluído\r\n";
    if (verbo === "EXAMINE") {
      return "* " + existentes + " EXISTS\r\n* OK [UIDVALIDITY " + uidvalidity + "] ok\r\n* OK [UIDNEXT " + uidnext + "] ok\r\n" +
        (permanentflags === null ? "" : "* OK [PERMANENTFLAGS " + permanentflags + "] ok\r\n") + extras + tag + " OK " + etiquetado + "\r\n";
    }
    if (verbo === "LOGOUT") return "* BYE até logo\r\n" + tag + " OK LOGOUT concluído\r\n";
    return tag + " BAD comando desconhecido\r\n";
  };
}
async function rodar(roteiro, { anterior = null, politica = POLITICA, usuario = USUARIO, senha = SENHA, relogio } = {}) {
  const srv = servidorFalso(roteiro);
  const r = await executarP6({ abrir: async () => srv.socket, usuario, senha, anterior, politica, relogio });
  return { r, srv, resposta: montarRespostaP6(r), verbos: srv.enviados.map((e) => /^a\d+ ([A-Z]+)/.exec(e)[1]) };
}
const semVazar = (v, nome = "") => { const t = JSON.stringify(v).toLowerCase(); for (const s of SENTINELAS) assert.ok(!t.includes(s.toLowerCase()), "vazamento " + nome + ": " + s.slice(0, 10) + "…"); };

test("P6 · decisão de sincronização (função pura): primeira leitura, sem mudança, novas mensagens, UIDVALIDITY mudou e UIDNEXT que regrediu", () => {
  const atual = { uidvalidity: 100, uidnext: 50 };
  assert.deepEqual(compararSincronizacao(atual, null), { tipo: "primeira_leitura", uidvalidity_mudou: false, uids_novos_no_maximo: 0 });
  assert.deepEqual(compararSincronizacao(atual, { uidvalidity: 100, uidnext: 50 }), { tipo: "sem_mudanca", uidvalidity_mudou: false, uids_novos_no_maximo: 0 });
  assert.deepEqual(compararSincronizacao(atual, { uidvalidity: 100, uidnext: 45 }), { tipo: "novas_mensagens", uidvalidity_mudou: false, uids_novos_no_maximo: 5 });
  assert.deepEqual(compararSincronizacao(atual, { uidvalidity: 99, uidnext: 10 }), { tipo: "uidvalidity_mudou", uidvalidity_mudou: true, uids_novos_no_maximo: 0 });
  assert.deepEqual(compararSincronizacao(atual, { uidvalidity: 100, uidnext: 60 }), { tipo: "uidnext_regrediu", uidvalidity_mudou: false, uids_novos_no_maximo: 0 });
});

test("P6 · caminho feliz: só CAPABILITY, LOGIN, LIST, EXAMINE e LOGOUT; nenhum FETCH; indicadores do EXAMINE e capacidades; sem vazamento", async () => {
  const { r, resposta, verbos, srv } = await rodar(icloud(), { relogio: (() => { let t = 1000; return () => (t += 25); })() });
  assert.equal(resposta.ok, true); assert.equal(resposta.estagio, "concluido"); assert.equal(resposta.autenticado, true); assert.equal(resposta.logout, true);
  assert.deepEqual(verbos, ["CAPABILITY", "LOGIN", "LIST", "EXAMINE", "LOGOUT"]);
  assert.ok(!srv.enviados.some((e) => /FETCH|STORE|COPY|MOVE|EXPUNGE|APPEND|SELECT|SEARCH|CREATE|DELETE|RENAME/.test(e)), "nenhum verbo de leitura de mensagem nem de escrita");
  assert.deepEqual(resposta.exame, { codigo_etiquetado: "READ-ONLY", permanentflags: "vazio", uidvalidity: 1700000000, uidnext: 42, highestmodseq_presente: false });
  assert.deepEqual(resposta.capacidades, { condstore: true, qresync: false, idle: true, uidplus: true, move: true, namespace: true });
  assert.equal(resposta.mensagens_na_pasta, 5); assert.equal(resposta.pasta_teste_existe, true);
  assert.deepEqual(resposta.sincronizacao, { tipo: "primeira_leitura", uidvalidity_mudou: false, uids_novos_no_maximo: 0 });
  assert.ok(resposta.duracao_ms > 0 && Number.isInteger(resposta.duracao_ms));
  assert.equal(r.erro, null);
  semVazar(resposta, "caminho feliz");
});

test("P6 · estado anterior: novas mensagens, sem mudança, UIDVALIDITY diferente (simulação de recarga total)", async () => {
  const a = await rodar(icloud({ uidnext: 42 }), { anterior: { uidvalidity: 1700000000, uidnext: 40 } });
  assert.deepEqual(a.resposta.sincronizacao, { tipo: "novas_mensagens", uidvalidity_mudou: false, uids_novos_no_maximo: 2 });
  const b = await rodar(icloud({ uidnext: 42 }), { anterior: { uidvalidity: 1700000000, uidnext: 42 } });
  assert.equal(b.resposta.sincronizacao.tipo, "sem_mudanca");
  const c = await rodar(icloud({ uidnext: 42 }), { anterior: { uidvalidity: 1699999999, uidnext: 40 } });
  assert.deepEqual(c.resposta.sincronizacao, { tipo: "uidvalidity_mudou", uidvalidity_mudou: true, uids_novos_no_maximo: 0 });
  for (const x of [a, b, c]) assert.equal(x.resposta.ok, true);
});

test("P6 · indicadores do EXAMINE: código etiquetado (READ-ONLY, READ-WRITE, NENHUM, OUTRO), PERMANENTFLAGS (vazio, não vazio, ausente) e HIGHESTMODSEQ", async () => {
  const c = async (o) => (await rodar(icloud(o))).resposta.exame;
  assert.equal((await c({ etiquetado: "EXAMINE concluído" })).codigo_etiquetado, "NENHUM");
  assert.equal((await c({ etiquetado: "[READ-WRITE] EXAMINE concluído" })).codigo_etiquetado, "READ-WRITE");
  assert.equal((await c({ etiquetado: "[XPTO-INVENTADO] texto livre " + SENHA })).codigo_etiquetado, "OUTRO");
  assert.equal((await c({ permanentflags: "(\\Seen \\Flagged)" })).permanentflags, "nao_vazio");
  assert.equal((await c({ permanentflags: null })).permanentflags, "ausente");
  assert.equal((await c({ extras: "* OK [HIGHESTMODSEQ 1234] ok\r\n" })).highestmodseq_presente, true);
});

test("P6 · falhas fechadas: login recusado, pasta inexistente, EXAMINE recusado, EXAMINE sem UIDVALIDITY/UIDNEXT; LOGOUT depois do erro e sem vazamento", async () => {
  const a = await rodar(icloud({ login: "NO" }));
  assert.equal(a.resposta.ok, false); assert.equal(a.resposta.erro, "autenticacao_recusada"); assert.equal(a.resposta.autenticado, false);
  const b = await rodar(icloud({ pasta: false }));
  assert.equal(b.resposta.erro, "pasta_inexistente"); assert.equal(b.resposta.pasta_teste_existe, false);
  const c = await rodar(icloud({ status: { EXAMINE: (_, tag) => tag + " NO [NONEXISTENT] negado\r\n" } }));
  assert.equal(c.resposta.erro, "examine_recusado");
  const d = await rodar(icloud({ status: { EXAMINE: (_, tag) => "* 3 EXISTS\r\n" + tag + " OK [READ-ONLY] ok\r\n" } }));
  assert.equal(d.resposta.erro, "resposta_malformada");
  for (const x of [a, b, c, d]) { semVazar(x.resposta, "falha"); assert.ok(ERROS_P2.includes(x.resposta.erro)); assert.ok(ESTAGIOS_P6.includes(x.resposta.estagio)); }
  for (const x of [a, b, c]) assert.equal(x.r.logout, true);
  assert.ok(!a.verbos.includes("LIST") && !a.verbos.includes("EXAMINE"), "sem login não há LIST nem EXAMINE");
});

test("P6 · entradas inválidas do estado anterior são recusadas ANTES de abrir a conexão", async () => {
  for (const anterior of [{ uidvalidity: 0, uidnext: 5 }, { uidvalidity: 5, uidnext: 4294967296 }, { uidvalidity: 1.5, uidnext: 5 }, { uidvalidity: "5", uidnext: 5 }, "x", {}]) {
    let abriu = false;
    const r = await executarP6({ abrir: async () => { abriu = true; throw new Error("não devia abrir"); }, usuario: USUARIO, senha: SENHA, anterior, politica: POLITICA });
    assert.equal(r.erro, "comando_nao_permitido"); assert.equal(abriu, false);
  }
});

test("P6 · o esquema da resposta é fechado: texto do servidor e lixo no resultado são descartados", () => {
  const s = montarRespostaP6({ ok: true, estagio: "SENTINELA", erro: "texto " + SENHA, autenticado: "sim", logout: 1, pasta_teste_existe: PASTA_SECRETA, mensagens_na_pasta: 12.5,
    capacidades: { condstore: "sim", x: SENHA }, exame: { codigo: PASTA_SECRETA, permanentflags: USUARIO, uidvalidity: -5, uidnext: 1e20, highestmodseq_presente: "sim" },
    sincronizacao: { tipo: SENHA, uidvalidity_mudou: 1, uids_novos_no_maximo: 9e99 }, duracao_ms: 1e12, extra: SENHA });
  semVazar(s, "esquema"); assert.equal(s.estagio, "inicio"); assert.equal(s.exame.codigo_etiquetado, "NENHUM"); assert.equal(s.exame.permanentflags, "ausente");
  assert.equal(s.sincronizacao.tipo, "primeira_leitura"); assert.equal(s.duracao_ms, 600000); assert.equal(s.erro, undefined); assert.equal(montarRespostaP6({ ok: false, erro: "texto " + SENHA }).erro, "falha_inesperada");
  assert.ok(TIPOS_SINCRONIZACAO.includes(s.sincronizacao.tipo));
  assert.deepEqual(Object.keys(montarRespostaP6(null)).sort(), ["autenticado", "erro", "estagio", "logout", "ok", "operacao"].sort());
});

const ex = (o) => examinarCorpo(new TextEncoder().encode(JSON.stringify(o)));
const BASE = { operacao: "p6_imap", usuario: USUARIO, senha: SENHA };

test("P6 · rota: esquema do corpo (estado anterior opcional, sempre em par) e uso único", () => {
  assert.deepEqual(ex(BASE), { corpo: BASE });
  assert.deepEqual(ex({ ...BASE, uidvalidity_anterior: 7, uidnext_anterior: 9 }), { corpo: { ...BASE, anterior: { uidvalidity: 7, uidnext: 9 } } });
  assert.deepEqual(ex({ ...BASE, uidvalidity_anterior: 7 }), { detalhe: "anterior_incompleto" });
  assert.deepEqual(ex({ ...BASE, uidnext_anterior: 7 }), { detalhe: "anterior_incompleto" });
  for (const v of ["7", 0, -1, 1.5, 4294967296, null, true]) assert.deepEqual(ex({ ...BASE, uidvalidity_anterior: v, uidnext_anterior: 9 }), { detalhe: "uidvalidity_anterior_invalido" }, JSON.stringify(v));
  for (const v of ["7", 0, -1, 1.5, 4294967296, null, true]) assert.deepEqual(ex({ ...BASE, uidvalidity_anterior: 7, uidnext_anterior: v }), { detalhe: "uidnext_anterior_invalido" }, JSON.stringify(v));
  assert.deepEqual(ex({ ...BASE, uid: 5 }), { detalhe: "campos_inesperados" }, "o uid é só da P2");
  assert.deepEqual(ex({ ...BASE, pasta: "INBOX" }), { detalhe: "campos_inesperados" }, "a pasta nunca vem do cliente");
  assert.deepEqual(ex({ operacao: "p2_imap", usuario: USUARIO, senha: SENHA, uidnext_anterior: 5 }), { detalhe: "campos_inesperados" }, "o estado anterior é só da P6");
  assert.ok(POLITICA.operacoesComConsumo.includes("p6_imap") && POLITICA.operacoesComCredencial.includes("p6_imap"));
});

test("P6 · rota ponta a ponta: audiência própria, uso único consumido uma vez e resposta HTTP 200/502 com o esquema fechado", async () => {
  const claims = { aud: POLITICA.audienciaPrefixo + "p6_imap", jti: "j6", run_id: "1", run_attempt: "1" };
  const usadas = new Set();
  const consumir = async ({ chave }) => { if (usadas.has(chave)) return false; usadas.add(chave); return true; };
  const pedido = (corpo) => new Request("https://w.invalid/auth-probe", { method: "POST", headers: { Authorization: "Bearer t", "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  const comum = { verificar: async () => ({ ok: true, claims }), consumir };
  const chamadas = [];
  const executarP6Falso = async (d) => { chamadas.push(d); return { ok: true, estagio: "concluido", autenticado: true, logout: true, pasta_teste_existe: true, mensagens_na_pasta: 1, exame: { codigo: "READ-ONLY", permanentflags: "vazio", uidvalidity: 7, uidnext: 9, highestmodseq_presente: false }, capacidades: {}, sincronizacao: { tipo: "primeira_leitura", uidvalidity_mudou: false, uids_novos_no_maximo: 0 }, duracao_ms: 12, erro: null }; };
  const ok = await tratar(pedido({ ...BASE, uidvalidity_anterior: 7, uidnext_anterior: 8 }), { ...comum, executarP6: executarP6Falso });
  assert.equal(ok.status, 200); const j = await ok.json(); assert.equal(j.operacao, "p6_imap"); semVazar(j, "rota");
  assert.deepEqual(chamadas[0].anterior, { uidvalidity: 7, uidnext: 8 }); assert.equal(chamadas[0].usuario, USUARIO);
  const replay = await tratar(pedido(BASE), { ...comum, executarP6: executarP6Falso });
  assert.equal(replay.status, 409, "a mesma execução não repete a P6");
  const errada = await tratar(pedido({ ...BASE, operacao: "p2_imap" }), { ...comum, consumir: async () => true, executarP6: executarP6Falso, executarP2: async () => ({}) });
  assert.equal(errada.status, 403, "o token da P6 não serve para a P2");
  const falha = await tratar(pedido(BASE), { verificar: async () => ({ ok: true, claims: { ...claims, run_id: "2" } }), consumir: async () => true, executarP6: async () => ({ ok: false, estagio: "login", erro: "autenticacao_recusada", autenticado: false, logout: true }) });
  assert.equal(falha.status, 502); assert.equal((await falha.json()).erro, "autenticacao_recusada");
});
