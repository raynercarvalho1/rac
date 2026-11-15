// RAC Inbox · sincronização automática (a cada 10 min) e notificações Web Push (docs/inbox.md, "Automático"). TUDO SIMULADO ou em Postgres de teste (PGlite): o Worker, o cofre, o serviço de push e o relógio são de mentira.
// Prova: a rotina roda SEM sessão de navegador; lê só o cursor quando nada mudou e só o que é novo depois do cursor (nunca "as últimas 50" a cada 10 min); relê a janela de hora em hora; nunca avisa na primeira
// leitura nem na sincronização manual; avisa uma vez só por mensagem; trava por conta (sem sincronizações simultâneas); recupera na rodada seguinte; credencial recusada tira a conta da rotina; o aviso leva só a contagem;
// o Web Push chega cifrado ao aparelho (decifrado aqui como o navegador faria) e a inscrição que expirou (404/410) é apagada. NÃO prova o iCloud, o pg_cron, o Deno nem a entrega real pelo serviço de push do aparelho.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { rodarRotina, esperaMin, montarAviso, montarResumo, planejarAvisos, tituloDoAviso, corpoDoAviso, destinoDaMensagem, codigoDoErro } from "../supabase/functions/rac-inbox/rotina.ts";
import { entregar, cifrar, cabecalhoVapid, endpointValido } from "../supabase/functions/rac-inbox/push.ts";
import { empacotar } from "../supabase/functions/rac-inbox/contrato.ts";
import { criarRepositorio, criarBancoPush } from "../supabase/functions/rac-inbox/repositorio.ts";
import { RECONCILIAR_MS } from "../supabase/functions/rac-inbox/sync.ts";

createRequire(import.meta.url)("../nucleo.js");
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const semComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/--.*$/gm, "");
const U1 = "11111111-1111-4111-8111-111111111111", C1 = "aaaaaaaa-0000-4000-8000-000000000001", C2 = "aaaaaaaa-0000-4000-8000-000000000002", P1 = "bbbbbbbb-0000-4000-8000-000000000001", P2 = "bbbbbbbb-0000-4000-8000-000000000002";
const USUARIO = "a@icloud.example", SENHA = "aaaa-bbbb-cccc-dddd";
const PEND = (n = 1, extra = {}) => ({ id: "m" + n, pasta_id: P1, assunto: "Nota fiscal da compra", nome: "João Silva", endereco: "joao@exemplo.com", ...extra });
const AGORA = Date.parse("2026-11-15T12:00:00Z"), iso = (ms) => new Date(ms).toISOString();

const msg = (uid, extra = {}) => ({ uid, recebida: "2026-11-15T11:50:00.000Z", tamanho: 900, lida: false, sinalizada: false, respondida: false, de: { nome: "Ana Segredo", endereco: "ana@exemplo.com" }, para: [], assunto: "ASSUNTO-CONFIDENCIAL " + uid, message_id: null, anexo_provavel: false, ...extra });
const faixa = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => msg(a + i));

/* ---------- mentiras ---------- */
function mundo({ contas = [{ conta: C1, dono: U1, apelido: "Pessoal", notificar: true, pasta_id: P1, falhas: 0, ultima_tentativa_em: null }], cursor = { uidvalidity: 700, uidnext: 10, reconciliada_em: iso(AGORA - 5 * 60_000) }, total = 9, travadas = new Set(), naoLidas = 4, aparelhos = [{ id: 1 }] } = {}) {
  const log = [], tratadas = new Set(), pend = [], cursores = new Map(contas.map((c) => [c.pasta_id, cursor ? { ...cursor } : null])), marcas = [], estados = [], falhas = [], semMud = [], aplicados = [];
  const cofre = { async ler() { log.push("cofre.ler"); return empacotar(USUARIO, SENHA); }, async marcar(d, c, e) { marcas.push([c, e]); }, async guardar() {}, async remover() { return true; }, async estado() { return "ativa"; } };
  const banco = {
    async contasAutomaticas() { return contas; },
    async pasta(d, c, id) { return { id, nome_externo: "INBOX" }; },
    async estadoSync(d, c, id) { return cursores.get(id) ?? null; },
    async travar(c) { if (travadas.has(c)) return false; travadas.add(c); log.push("travar"); return true; }, async destravar(c) { travadas.delete(c); log.push("destravar"); },
    async aplicarSync(d, c, id, a) {
      aplicados.push(a);
      for (const m of a.mensagens) if (!a.silenciosa) pend.push({ id: "m" + m.uid, pasta_id: id, assunto: m.assunto, nome: m.de?.nome ?? null, endereco: m.de?.endereco ?? null }); else tratadas.add("m" + m.uid);
      cursores.set(id, { uidvalidity: a.uidvalidity, uidnext: a.cursor, reconciliada_em: a.reconciliada ? iso(AGORA) : cursores.get(id)?.reconciliada_em ?? null });
      return { novas: a.mensagens.length, atualizadas: 0, removidas: 0 };
    },
    async semMudanca(d, c, id, a) { semMud.push(a); },
    async falhaSync(d, c, id, e) { falhas.push(e); }, async estadoConta(d, c, e, er) { estados.push([e, er]); },
    async pendentes() { return pend.filter((x) => !tratadas.has(x.id)); },
    async marcarNotificadas(d, c, ids) { for (const i of ids) tratadas.add(i); },
    async naoLidasEntrada() { return naoLidas; },
  };
  const avisos = [], aviso = { async enviar(dono, m) { avisos.push({ dono, m }); return { aparelhos: aparelhos.length, enviados: aparelhos.length, removidas: 0, semChaves: false }; } };
  return { banco, cofre, avisos, aviso, log, pend, tratadas, cursores, marcas, estados, falhas, semMud, aplicados, travadas };
}
function worker(resp) { const chamadas = []; return { chamadas, async executar(op, ped, cred) { chamadas.push([op, ped, cred && { ...cred }]); return typeof resp === "function" ? resp(op, ped, chamadas.length) : resp; } }; }
const estado = (uidnext, total = uidnext - 1, uidvalidity = 700) => ({ ok: true, dados: { exame: { uidvalidity, uidnext }, mensagens_na_pasta: total, duracao_ms: 25 } });
const janela = (uidnext, ms, mais = false) => ({ ok: true, dados: { exame: { uidvalidity: 700, uidnext }, mensagens_na_pasta: ms.length, mensagens: ms, mais, duracao_ms: 40 } });
async function rodar(m, w, extra = {}) { const logs = []; const r = await rodarRotina({ banco: m.banco, cofre: m.cofre, worker: w, aviso: m.aviso, registrar: (e) => logs.push(e), agora: () => AGORA, ...extra }); return { r, logs }; }
const semSegredo = (...vals) => { const t = JSON.stringify(vals); for (const s of [SENHA, "aaaa-bbbb", USUARIO]) assert.ok(!t.includes(s), "vazou: " + s); };

/* ---------- a rotina ---------- */
test("rotina sem sessão de navegador, RAC fechado: sem mudança no cursor = só o EXAMINE (nada é lido, nada avisado), horário e duração registrados", async () => {
  const m = mundo(), w = worker(estado(10));
  const { r, logs } = await rodar(m, w);   // nenhuma sessão, JWT ou navegador: só banco, cofre, Worker
  assert.deepEqual(r, { contas: 1, sincronizadas: 0, sem_mudanca: 1, novas: 0, avisos: 0, falhas: 0, ignoradas: 0, em_andamento: 0 });
  assert.deepEqual(w.chamadas.map((c) => c[0]), ["estado_pasta"], "uma operação barata; nunca listar_mensagens");
  assert.deepEqual(w.chamadas[0][1], { conta_id: C1, pasta: "INBOX" }); assert.deepEqual(w.chamadas[0][2], { usuario: USUARIO, senha: SENHA }, "a credencial vai só ao Worker, nesta chamada");
  assert.deepEqual(m.semMud, [{ uidvalidity: 700, uidnext: 10, total: 9, duracao_ms: 25 }]); assert.equal(m.avisos.length, 0); assert.deepEqual(m.log, ["travar", "cofre.ler", "destravar"]);
  assert.ok(logs.every((l) => l.operacao === "rotina_sync")); semSegredo(r, logs);
});

test("e-mail novo: lê SÓ depois do cursor (nunca as últimas 50), não apaga nada do cache, cursor avança, UMA notificação por mensagem com o assunto e o remetente DA MESMA mensagem, destino = id da mensagem", async () => {
  const m = mundo(), w = worker((op) => (op === "estado_pasta" ? estado(13, 12) : janela(13, faixa(10, 12))));
  const { r } = await rodar(m, w);
  assert.deepEqual(w.chamadas.map((c) => [c[0], c[1].desde_uid, c[1].ultimas, c[1].limite, c[1].uidvalidity_esperado]), [["estado_pasta", undefined, undefined, undefined, undefined], ["listar_mensagens", 10, undefined, 100, 700]]);
  const a = m.aplicados[0]; assert.deepEqual([a.tipo, a.cursor, a.purgar, a.semRemocao, a.silenciosa, a.reconciliada, a.origem, a.total, a.mensagens.map((x) => x.uid)], ["novas_mensagens", 13, false, true, false, false, "agenda", 12, [12, 11, 10]]);
  assert.deepEqual([r.sincronizadas, r.novas, r.avisos, r.falhas], [1, 3, 3, 0]);
  assert.equal(m.avisos.length, 3, "uma notificação por mensagem"); const av = m.avisos.map((x) => x.m);
  assert.deepEqual(av.map((x) => x.titulo), ["ASSUNTO-CONFIDENCIAL 10", "ASSUNTO-CONFIDENCIAL 11", "ASSUNTO-CONFIDENCIAL 12"], "do mais antigo ao mais novo (o mais novo fica por cima); cada título é o assunto da própria mensagem");
  for (const x of av) assert.equal(x.corpo, "Ana Segredo — ana@exemplo.com");
  assert.deepEqual(av.map((x) => x.url), ["10", "11", "12"].map((u) => "./#inbox/" + C1 + "/" + P1 + "/m" + u), "o destino é a conta, a pasta e o ID da mensagem (nunca assunto/remetente)");
  assert.deepEqual(av.map((x) => x.tag), ["inbox-msg-m10", "inbox-msg-m11", "inbox-msg-m12"], "tag por mensagem: uma não substitui a outra");
  assert.ok(av.every((x) => x.badge === 4 && x.renotificar === true));
  const txt = JSON.stringify(av); for (const proibido of ["Pessoal", USUARIO, SENHA]) assert.ok(!txt.includes(proibido), "o aviso não pode levar: " + proibido);
  assert.deepEqual(av[2], montarAviso(C1, { id: "m12", pasta_id: P1, assunto: "ASSUNTO-CONFIDENCIAL 12", nome: "Ana Segredo", endereco: "ana@exemplo.com" }, 4));
});

test("sem duplicação: a mesma mensagem nunca é avisada duas vezes, e a rodada seguinte (sem mudança) não avisa nada", async () => {
  const m = mundo(), w = worker((op) => (op === "estado_pasta" ? estado(11, 10) : janela(11, faixa(10, 10))));
  await rodar(m, w); assert.equal(m.avisos.length, 1);
  const w2 = worker(estado(11, 10)); await rodar(m, w2); await rodar(m, w2);
  assert.equal(m.avisos.length, 1, "cursor igual → nada novo → nenhum aviso repetido"); assert.deepEqual(w2.chamadas.map((c) => c[0]), ["estado_pasta", "estado_pasta"]);
  assert.deepEqual(await m.banco.pendentes(), [], "a mensagem foi tratada");
});

test("primeira sincronização: janela completa como linha de base, NENHUM aviso retroativo (as mensagens nascem tratadas)", async () => {
  const m = mundo({ cursor: null }), w = worker(janela(51, faixa(1, 50), false));
  const { r } = await rodar(m, w);
  assert.deepEqual(w.chamadas.map((c) => [c[0], c[1].ultimas]), [["listar_mensagens", 50]], "sem cursor não há EXAMINE separado: é a leitura completa");
  const a = m.aplicados[0]; assert.deepEqual([a.tipo, a.silenciosa, a.reconciliada, a.origem], ["primeira_leitura", true, true, "agenda"]);
  assert.deepEqual([r.novas, r.avisos, m.avisos.length], [50, 0, 0], "50 mensagens carregadas, zero avisos");
});

test("UIDVALIDITY mudou: reconstrói a pasta e NÃO avisa (as mensagens antigas voltam como linha de base)", async () => {
  const m = mundo(), w = worker((op) => (op === "estado_pasta" ? estado(5, 4, 999) : janela(5, faixa(1, 4))));
  w.executar = ((orig) => async (op, ped, cred) => { const r = await orig(op, ped, cred); if (op === "listar_mensagens") r.dados.exame.uidvalidity = 999; return r; })(w.executar.bind(w));
  const { r } = await rodar(m, w); const a = m.aplicados[0];
  assert.deepEqual([a.tipo, a.purgar, a.silenciosa], ["uidvalidity_mudou", true, true]); assert.equal(m.avisos.length, 0); assert.equal(r.avisos, 0);
});

test("a janela inteira (flags e remoções) só é relida de hora em hora; antes disso a rotina olha só o cursor", async () => {
  const dentro = mundo({ cursor: { uidvalidity: 700, uidnext: 10, reconciliada_em: iso(AGORA - (RECONCILIAR_MS - 60_000)) } }), w1 = worker(estado(10));
  await rodar(dentro, w1); assert.deepEqual(w1.chamadas.map((c) => c[0]), ["estado_pasta"]);
  for (const rec of [iso(AGORA - RECONCILIAR_MS), null, "lixo", iso(AGORA + 3600_000)]) {
    const m = mundo({ cursor: { uidvalidity: 700, uidnext: 10, reconciliada_em: rec } }), w = worker((op) => (op === "estado_pasta" ? estado(10) : janela(10, faixa(1, 9))));
    await rodar(m, w);
    assert.deepEqual(w.chamadas.map((c) => c[0]), ["estado_pasta", "listar_mensagens"], "vencida: " + rec); assert.equal(w.chamadas[1][1].ultimas, 50);
    const a = m.aplicados[0]; assert.deepEqual([a.reconciliada, a.silenciosa, a.purgar], [true, false, false], "a releitura completa marca a data e, se achar mensagem realmente nova, ela entra na fila do aviso (as já conhecidas não: o upsert não zera notificada_em)");
  }
});

test("mais mensagens novas que uma página: o cursor só avança até onde leu (próxima rodada continua) e o limite de páginas vale", async () => {
  const m = mundo({ cursor: { uidvalidity: 700, uidnext: 10, reconciliada_em: iso(AGORA) } });
  const w = worker((op, ped) => (op === "estado_pasta" ? estado(1000, 999) : janela(1000, faixa(ped.desde_uid, ped.desde_uid + 99), true)));
  await rodar(m, w);
  assert.equal(w.chamadas.filter((c) => c[0] === "listar_mensagens").length, 5, "no máximo 5 páginas"); assert.equal(m.aplicados[0].cursor, 510, "10 + 5×100: não pula nada"); assert.equal(m.aplicados[0].mensagens.length, 500);
});

test("proteção contra execuções simultâneas: a conta já travada (sincronização manual ou rodada anterior) é pulada sem tocar no cofre nem no Worker; duas rodadas ao mesmo tempo = uma só sincroniza", async () => {
  const m = mundo({ travadas: new Set([C1]) }), w = worker(estado(10));
  const { r } = await rodar(m, w); assert.deepEqual([r.em_andamento, w.chamadas.length, m.log.includes("cofre.ler")], [1, 0, false]);
  const m2 = mundo(), w2 = worker(async (op) => { await new Promise((x) => setTimeout(x, 15)); return estado(10); });
  const [a, b] = await Promise.all([rodar(m2, w2), rodar(m2, w2)]);
  assert.deepEqual([a.r.em_andamento + b.r.em_andamento, a.r.sem_mudanca + b.r.sem_mudanca, w2.chamadas.length], [1, 1, 1], "só uma chegou ao Worker"); assert.equal(m2.travadas.size, 0, "travamento liberado");
});

test("recuperação: falha do Worker não derruba a rodada nem as outras contas; na rodada seguinte volta ao normal; o travamento sempre é liberado", async () => {
  const contas = [{ conta: C1, dono: U1, apelido: "A", notificar: true, pasta_id: P1, falhas: 0, ultima_tentativa_em: null }, { conta: C2, dono: U1, apelido: "B", notificar: true, pasta_id: P2, falhas: 0, ultima_tentativa_em: null }];
  const m = mundo({ contas }); let n = 0;
  const w = worker((op, ped) => (ped.conta_id === C1 && n++ === 0 ? { ok: false, erro: "timeout" } : estado(10)));
  const { r, logs } = await rodar(m, w);
  assert.deepEqual([r.falhas, r.sem_mudanca], [1, 1], "a conta B seguiu mesmo com a A falhando"); assert.deepEqual(m.falhas, ["servico_indisponivel"]); assert.deepEqual(m.estados.filter((e) => e[0] === "atrasada"), [["atrasada", "servico_indisponivel"]]);
  assert.ok(logs.some((l) => l.codigo === "servico_indisponivel" && l.detalhe === "timeout")); assert.equal(m.travadas.size, 0); assert.equal(m.marcas.length, 0, "falha comum não invalida a credencial");
  const { r: r2 } = await rodar(m, w); assert.deepEqual([r2.falhas, r2.sem_mudanca], [0, 2], "recuperou sozinha"); assert.ok(m.estados.some((e) => e[0] === "conectada"));
  const m3 = mundo(); const w3 = { async executar() { throw new Error("canal_falhou"); } }; const { r: r3, logs: l3 } = await rodar(m3, w3);
  assert.equal(r3.falhas, 1); assert.ok(l3.some((l) => l.detalhe === "canal_falhou")); assert.equal(m3.travadas.size, 0);
});

test("login recusado: credencial vira 'inválida', a conta vai a erro de autenticação, nenhum aviso; backoff progressivo depois de falhas seguidas", async () => {
  const m = mundo(), w = worker({ ok: false, erro: "autenticacao_recusada" }); const { r, logs } = await rodar(m, w);
  assert.deepEqual(m.marcas, [[C1, "invalida"]]); assert.deepEqual(m.estados, [["erro_autenticacao", "credencial_invalida"]]); assert.deepEqual(m.falhas, [], "não conta como falha de rede"); assert.equal(r.falhas, 1); assert.equal(m.avisos.length, 0); semSegredo(r, logs);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 9].map(esperaMin), [0, 0, 0, 20, 40, 80, 120, 120]);
  const ultima = iso(AGORA - 19 * 60_000), c = { conta: C1, dono: U1, apelido: "A", notificar: true, pasta_id: P1, falhas: 3, ultima_tentativa_em: ultima };
  const m2 = mundo({ contas: [c] }), w2 = worker(estado(10)); const { r: r2 } = await rodar(m2, w2); assert.deepEqual([r2.ignoradas, w2.chamadas.length], [1, 0], "ainda dentro da espera");
  const m3 = mundo({ contas: [{ ...c, ultima_tentativa_em: iso(AGORA - 21 * 60_000) }] }); const { r: r3 } = await rodar(m3, worker(estado(10))); assert.equal(r3.sem_mudanca, 1, "passou a espera: tenta");
  assert.deepEqual(["autenticacao_recusada", "pasta_inexistente", "assinatura_invalida", "timeout", "x"].map(codigoDoErro), ["credencial_invalida", "pasta_inexistente", "canal_recusado", "servico_indisponivel", "servico_indisponivel"]);
});

test("preferência de notificação desligada: sincroniza e marca como tratado, mas não manda push (ao religar não vem enxurrada); falha do push mantém pendente e a rodada seguinte tenta de novo", async () => {
  const m = mundo({ contas: [{ conta: C1, dono: U1, apelido: "A", notificar: false, pasta_id: P1, falhas: 0, ultima_tentativa_em: null }] }), w = worker((op) => (op === "estado_pasta" ? estado(12, 11) : janela(12, faixa(10, 11))));
  const { r } = await rodar(m, w); assert.deepEqual([m.avisos.length, r.avisos, (await m.banco.pendentes()).length], [0, 0, 0]);
  const m2 = mundo(); const w2 = worker((op) => (op === "estado_pasta" ? estado(11, 10) : janela(11, faixa(10, 10))));
  m2.aviso.enviar = async () => ({ aparelhos: 1, enviados: 0, removidas: 0, semChaves: false });   // o serviço de push recusou
  const { r: ra, logs } = await rodar(m2, w2); assert.equal(ra.avisos, 0); assert.equal((await m2.banco.pendentes()).length, 1, "continua pendente"); assert.ok(logs.some((l) => l.codigo === "aviso_falhou"));
  m2.aviso.enviar = async (d, msg) => { m2.avisos.push({ d, msg }); return { aparelhos: 1, enviados: 1, removidas: 0, semChaves: false }; };
  const { r: rb } = await rodar(m2, worker(estado(11, 10))); assert.deepEqual([rb.avisos, (await m2.banco.pendentes()).length], [1, 0], "reenviou e tratou");
  const m3 = mundo({ aparelhos: [] }); m3.aviso.enviar = async () => ({ aparelhos: 0, enviados: 0, removidas: 0, semChaves: false });
  await rodar(m3, worker((op) => (op === "estado_pasta" ? estado(11, 10) : janela(11, faixa(10, 10))))); assert.equal((await m3.banco.pendentes()).length, 0, "sem aparelho inscrito nada fica pendente para sempre");
});

test("orçamento de tempo: passado o limite as contas restantes ficam para a próxima rodada", async () => {
  const contas = [1, 2, 3].map((i) => ({ conta: "aaaaaaaa-0000-4000-8000-00000000000" + i, dono: U1, apelido: "x", notificar: true, pasta_id: "bbbbbbbb-0000-4000-8000-00000000000" + i, falhas: 0, ultima_tentativa_em: null }));
  const m = mundo({ contas }); let t = AGORA; const w = worker(estado(10));
  const { r } = await rodar(m, w, { agora: () => (t += 40_000), orcamentoMs: 90_000 }); assert.ok(r.ignoradas >= 1 && r.sem_mudanca >= 1 && r.sem_mudanca + r.ignoradas === 3, JSON.stringify(r));
});

test("banco fora do ar na listagem: a rodada termina com falha controlada, sem lançar", async () => {
  const m = mundo(); m.banco.contasAutomaticas = async () => { throw new Error("postgres://segredo@host"); }; const { r, logs } = await rodar(m, worker(estado(10)));
  assert.equal(r.falhas, 1); assert.ok(!JSON.stringify(logs).includes("segredo@host"));
});

/* ---------- Web Push: o aparelho (app fechado) recebe e decifra ---------- */
const b64u = (u) => Buffer.from(u).toString("base64url");
const hmac = async (k, d) => new Uint8Array(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", k, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), d));
const tt = (s) => new TextEncoder().encode(s);
const junta = (...l) => Buffer.concat(l.map((x) => Buffer.from(x)));
async function aparelho(id, endpoint = "https://push.exemplo.net/send/" + id) {
  const par = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]), pub = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey)), auth = crypto.getRandomValues(new Uint8Array(16));
  return { par, pub, auth, insc: { id, endpoint, p256dh: b64u(pub), auth: b64u(auth) } };
}
async function decifrar(corpo, ap) {   // o que o navegador do aparelho faz (RFC 8291)
  const sal = corpo.slice(0, 16), idlen = corpo[20], as = corpo.slice(21, 21 + idlen), cif = corpo.slice(21 + idlen);
  const asK = await crypto.subtle.importKey("raw", as, { name: "ECDH", namedCurve: "P-256" }, false, []), ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asK }, ap.par.privateKey, 256));
  const ikm = await hmac(await hmac(ap.auth, ecdh), junta(tt("WebPush: info\0"), ap.pub, as, [1])), prk = await hmac(sal, ikm);
  const cek = (await hmac(prk, tt("Content-Encoding: aes128gcm\0\x01"))).slice(0, 16), nonce = (await hmac(prk, tt("Content-Encoding: nonce\0\x01"))).slice(0, 12);
  const claro = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]), cif));
  return new TextDecoder().decode(claro.slice(0, -1));
}
async function vapidNovo() { const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]); return { par, vapid: { publica: b64u(new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey))), jwk: await crypto.subtle.exportKey("jwk", par.privateKey) } }; }

test("Web Push com o app fechado: o aviso chega cifrado a cada aparelho do dono, o aparelho decifra a contagem, o VAPID confere e nada de conteúdo do e-mail vai junto", async () => {
  const a1 = await aparelho(1), a2 = await aparelho(2), { par, vapid } = await vapidNovo(), enviados = [];
  const banco = { async vapid() { return vapid; }, async inscricoes(uid) { assert.equal(uid, U1); return [a1.insc, a2.insc]; }, async apagarInscricao() { assert.fail("ninguém expirou"); } };
  const fetchFalso = async (url, init) => { enviados.push({ url, init }); return { status: 201 }; };
  const e = await entregar(banco, U1, montarAviso(C1, PEND(), 7), fetchFalso);
  assert.deepEqual(e, { aparelhos: 2, enviados: 2, removidas: 0, semChaves: false }); assert.deepEqual(enviados.map((x) => x.url), [a1.insc.endpoint, a2.insc.endpoint]);
  const claro = JSON.parse(await decifrar(enviados[0].init.body, a1)); assert.deepEqual(claro, { titulo: "Nota fiscal da compra", corpo: "João Silva — joao@exemplo.com", url: "./#inbox/" + C1 + "/" + P1 + "/m1", tag: "inbox-msg-m1", badge: 7, renotificar: true });
  await assert.rejects(decifrar(enviados[0].init.body, a2), "outro aparelho não decifra");
  const [t, k] = /vapid t=([^,]+), k=(.+)/.exec(enviados[0].init.headers.Authorization).slice(1), [cab, pay, ass] = t.split("."); assert.equal(k, vapid.publica);
  assert.ok(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, par.publicKey, Buffer.from(ass, "base64url"), tt(cab + "." + pay)), "assinatura VAPID válida"); assert.equal(JSON.parse(Buffer.from(pay, "base64url")).aud, "https://push.exemplo.net");
  assert.equal(enviados[0].init.headers["Content-Encoding"], "aes128gcm");
});

test("inscrição expirada (404/410) é apagada só do dono e a renovação (nova inscrição) volta a receber; erro temporário não apaga; sem chaves ou sem aparelho é resposta controlada", async () => {
  const velho = await aparelho(1), vivo = await aparelho(2), { vapid } = await vapidNovo(), apagadas = [];
  let lista = [velho.insc, vivo.insc];
  const banco = { async vapid() { return vapid; }, async inscricoes() { return lista; }, async apagarInscricao(uid, id) { apagadas.push([uid, id]); lista = lista.filter((x) => x.id !== id); } };
  const st = { 1: 410, 2: 201 }; const f = async (url) => ({ status: url.endsWith("/1") ? st[1] : st[2] });
  assert.deepEqual(await entregar(banco, U1, montarAviso(C1, PEND(), 1), f), { aparelhos: 2, enviados: 1, removidas: 1, semChaves: false }); assert.deepEqual(apagadas, [[U1, 1]]);
  const renovado = await aparelho(3, "https://push.exemplo.net/send/1");   // o usuário reativou em Sistema → Notificações: nova inscrição
  lista = [renovado.insc]; st[1] = 201; assert.equal((await entregar(banco, U1, montarAviso(C1, PEND(), 1), f)).enviados, 1, "a renovação recebe");
  lista = [vivo.insc]; assert.deepEqual(await entregar(banco, U1, montarAviso(C1, PEND(), 1), async () => ({ status: 503 })), { aparelhos: 1, enviados: 0, removidas: 0, semChaves: false }); assert.equal(apagadas.length, 1, "503 é temporário: não apaga");
  assert.deepEqual(await entregar({ ...banco, async inscricoes() { return []; } }, U1, montarAviso(C1, PEND(), 1), f), { aparelhos: 0, enviados: 0, removidas: 0, semChaves: false });
  assert.deepEqual(await entregar({ ...banco, async vapid() { return null; } }, U1, montarAviso(C1, PEND(), 1), f), { aparelhos: 1, enviados: 0, removidas: 0, semChaves: true });
  assert.deepEqual(await entregar(banco, U1, montarAviso(C1, PEND(), 1), async () => { throw new Error("rede"); }), { aparelhos: 1, enviados: 0, removidas: 0, semChaves: false }, "falha de rede não derruba");
  assert.equal(endpointValido("http://x.com/a"), false); assert.equal(endpointValido("https://localhost/a"), false); assert.equal(endpointValido("https://10.0.0.1/a"), false); assert.equal(endpointValido("https://fcm.googleapis.com/send/x"), true);
  await assert.rejects(entregar(banco, "", montarAviso(C1, PEND(), 1), f), /sem destinatário/);
  assert.ok((await cifrar("x", renovado.insc.p256dh, renovado.insc.auth)).length > 80); assert.match(await cabecalhoVapid("https://push.exemplo.net/x", vapid), /^vapid t=/);
});

/* ---------- o SQL (Postgres de verdade dentro do Node) ---------- */
let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite: pula, menos no CI */ }
const pular = !PGlite;
const S54 = ler("supabase/054_inbox_automatico.sql");
const R = "11111111-1111-4111-8111-111111111111", F = "22222222-2222-4222-8222-222222222222", X = "33333333-3333-4333-8333-333333333333";
test("no CI o PGlite está instalado: os testes de banco da 054 não podem ser pulados", () => { if (process.env.CI) assert.ok(PGlite, "sem PGlite no CI"); });
const trecho = (arq, ini, fim) => { const t = ler(arq), i = t.indexOf(ini); assert.ok(i >= 0, ini); return t.slice(i, t.indexOf(fim, i) + fim.length); };
async function banco() {
  const db = await PGlite.create();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    create schema auth; grant usage on schema auth to anon, authenticated, service_role;
    create table auth.users (id uuid primary key); create table auth.mfa_factors (user_id uuid, status text);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub', '')::uuid $$;
    insert into auth.users values ('${R}'), ('${F}'), ('${X}');
    create schema storage; create table storage.buckets (id text primary key, name text, public boolean default false);
  `);
  await db.exec(trecho("supabase/002_casa_compartilhada.sql", "create table if not exists public.membros", "grant execute on function public.dono_da_casa() to authenticated;"));
  await db.exec(trecho("supabase/022_seguranca.sql", "create or replace function public.rac_aal_ok()", "grant execute on function public.rac_aal_ok() to authenticated;"));
  await db.exec(`insert into public.membros (membro, dono) values ('${F}', '${R}');`);
  await db.exec(ler("supabase/051_inbox_fundacao.sql")); await db.exec(ler("supabase/053_inbox_cabecalhos.sql"));
  return db;
}
const sessaoDe = (q) => ({ exec: async (t, p = []) => (await q.query(t, p)).rows, transacao: (f) => (q.transaction ? q.transaction(async (tx) => f(sessaoDe(tx))) : f(sessaoDe(q))) });
async function como(db, papel, uid, sql, params = []) {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, role: papel, aal: "aal1" })]); await db.exec("set role " + papel);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); }
}
const codigoErro = async (p) => { try { await p; } catch (e) { return e.code || String(e.message); } return null; };
const L = (n) => ({ uid: n, recebida: "2026-11-15T11:00:00.000Z", assunto: "s" + n, de: { nome: "n", endereco: "n@exemplo.com" }, para: [], lida: false, sinalizada: false, respondida: false, tamanho: 1, anexo_provavel: false, message_id: null });
const apl = (o) => ({ uidvalidity: 700, cursor: 3, tipo: "novas_mensagens", total: 2, duracao_ms: 10, mensagens: [L(1), L(2)], purgar: false, removerDe: 1, removerAte: 2, ...o });

test("054 (texto): pendente, uma transação, só ALTERA (nada destrutivo fora do preenchimento único), sem coluna de conteúdo, sem service_role; o agendamento NÃO está em supabase/ (proposta separada)", () => {
  assert.equal(S54.split("\n")[0], "-- status: pendente"); assert.match(S54, /NÃO APLICADA/); assert.match(S54, /\nbegin;[\s\S]*\ncommit;/);
  const s = semComent(S54);
  assert.ok(!/\bdrop\b|\btruncate\b|\bdelete\b|\bgrant\b|service_role|disable row level|create table|cron\.|net\./i.test(s), "sem apagar, sem privilégio, sem agendamento");
  assert.deepEqual([...s.matchAll(/add column (?:if not exists )?(\w+)/g)].map((m) => m[1]).sort(), ["notificada_em", "notificar", "origem", "reconciliada_em", "sync_auto"]);
  assert.match(s, /where table_name = 'inbox_mensagens_ref' and column_name = 'notificada_em'|column_name = 'notificada_em'/); assert.match(s, /update public\.inbox_mensagens_ref set notificada_em = now\(\)/);
  const prop = ler("supabase/propostas/055_inbox_agendamento.sql"), p = semComent(prop);
  assert.ok(!/^-- status/.test(prop) && !fs.existsSync(new URL("../supabase/055_inbox_agendamento.sql", import.meta.url)), "é proposta: não entra em supabase/ até o dono autorizar");
  assert.match(p, /cron\.schedule\('inbox-sync', '\*\/10 \* \* \* \*'/); assert.match(p, /functions\/v1\/rac-inbox/); assert.match(p, /'x-rac-rotina', \(select decrypted_secret from vault\.decrypted_secrets where name = 'rac_rotina'\)/);
  assert.match(p, /'Authorization', 'Bearer ' \|\| \(select decrypted_secret from vault\.decrypted_secrets where name = 'rac_chave_publica'\)/, "o gateway recebe o JWT público do Vault");
  assert.match(p, /"operacao":"rotina_sync"/); assert.match(p, /cron\.unschedule\('inbox-sync'\)/); assert.ok(!/rac-rotina'|garmin|rac_rotina_ok|service_role|insert|update|delete/i.test(p.replace(/'x-rac-rotina'/, "")), "não mexe no agendamento diário nem na Garmin");
});

test("PGlite · 054: reexecutável, o que já estava no cache nasce tratado (sem aviso retroativo), preferências com padrão ligado", { skip: pular }, async () => {
  const db = await banco(); const c = "cccccccc-0000-4000-8000-000000000001", p = "dddddddd-0000-4000-8000-000000000001";
  await db.exec(`insert into public.inbox_contas (id, dono, provedor, apelido, endereco) values ('${c}', '${R}', 'icloud', 'A', 'a@icloud.example'); insert into public.inbox_pastas (id, dono, conta_id, nome_externo, uso) values ('${p}', '${R}', '${c}', 'INBOX', 'entrada');
    insert into public.inbox_mensagens_ref (dono, conta_id, pasta_id, id_externo, uidvalidity, uid) values ('${R}', '${c}', '${p}', '1:1', 1, 1);`);
  await db.exec(S54); await db.exec(S54);
  assert.deepEqual((await db.query("select count(*)::int as n from public.inbox_mensagens_ref where notificada_em is null")).rows[0], { n: 0 }, "o que já existia está tratado");
  await db.exec(`insert into public.inbox_mensagens_ref (dono, conta_id, pasta_id, id_externo, uidvalidity, uid) values ('${R}', '${c}', '${p}', '1:2', 1, 2);`); await db.exec(S54);
  assert.deepEqual((await db.query("select count(*)::int as n from public.inbox_mensagens_ref where notificada_em is null")).rows[0], { n: 1 }, "rodar de novo NÃO apaga a pendência de uma mensagem nova");
  assert.deepEqual((await db.query("select sync_auto, notificar from public.inbox_contas")).rows[0], { sync_auto: true, notificar: true });
  assert.equal(await codigoErro(db.exec(`update public.inbox_sincronizacao set origem = 'x'`)), null, "tabela vazia: nada a recusar"); assert.ok(await codigoErro(db.exec(`insert into public.inbox_sincronizacao (dono, conta_id, pasta_id, origem) values ('${R}', '${c}', '${p}', 'x')`)), "origem fora do vocabulário é recusada");
});

test("PGlite · repositório da rotina: aviso só para mensagem nova não lida (primeira leitura e sync manual nascem tratadas), nunca duas vezes, só do dono; cursor, origem e releitura registrados; sem mudança só atualiza a tentativa", { skip: pular }, async () => {
  const db = await banco(); await db.exec(S54); const repo = criarRepositorio(sessaoDe(db));
  const c = "cccccccc-0000-4000-8000-000000000001", p = "dddddddd-0000-4000-8000-000000000001";
  await db.exec(`insert into public.inbox_contas (id, dono, provedor, apelido, endereco) values ('${c}', '${R}', 'icloud', 'A', 'a@icloud.example'); insert into public.inbox_pastas (id, dono, conta_id, nome_externo, uso) values ('${p}', '${R}', '${c}', 'INBOX', 'entrada');`);
  // 1) primeira leitura (silenciosa): nada pendente
  await repo.aplicarSync(R, c, p, apl({ tipo: "primeira_leitura", silenciosa: true, reconciliada: true, origem: "agenda", cursor: 3 }));
  assert.deepEqual(await repo.pendentes(R, c), [], "a primeira leitura nunca vira aviso");
  const s1 = (await db.query("select origem, reconciliada_em is not null as rec, tipo_ultima, falhas_seguidas from public.inbox_sincronizacao")).rows[0]; assert.deepEqual(s1, { origem: "agenda", rec: true, tipo_ultima: "primeira_leitura", falhas_seguidas: 0 });
  // 2) sincronização manual (padrão silenciosa): também nada
  await repo.aplicarSync(R, c, p, apl({ mensagens: [L(3)], cursor: 4, total: 3, removerDe: 3, removerAte: 3 })); assert.deepEqual(await repo.pendentes(R, c), [], "manual: o dono está olhando");
  assert.equal((await db.query("select origem from public.inbox_sincronizacao")).rows[0].origem, "manual");
  // 3) rotina, mensagem nova não lida e outra já lida
  await repo.aplicarSync(R, c, p, apl({ mensagens: [L(4), { ...L(5), lida: true }], cursor: 6, total: 5, semRemocao: true, silenciosa: false, reconciliada: false, origem: "agenda", removerDe: 1, removerAte: 0 }));
  assert.equal((await db.query("select count(*)::int as n from public.inbox_mensagens_ref")).rows[0].n, 5, "semRemocao: nada foi apagado do cache");
  const rec = (await db.query("select reconciliada_em from public.inbox_sincronizacao")).rows[0].reconciliada_em; assert.ok(rec, "reconciliada_em guardada de rodada anterior continua");
  const pend = await repo.pendentes(R, c), ids = pend.map((x) => x.id); assert.equal(ids.length, 1, "só a não lida; a lida já saiu tratada"); assert.deepEqual([pend[0].pasta_id, pend[0].assunto, pend[0].nome, pend[0].endereco], [p, "s4", "n", "n@exemplo.com"], "o aviso nasce da linha gravada pela sincronização (nenhuma consulta extra)");
  assert.deepEqual(await repo.pendentes(X, c), [], "outro dono nunca enxerga nem trata a mensagem");
  await repo.marcarNotificadas(X, c, ids); assert.equal((await repo.pendentes(R, c)).length, 1, "marcar com o dono errado não faz nada");
  await repo.marcarNotificadas(R, c, ids); assert.deepEqual(await repo.pendentes(R, c), [], "tratada: nunca avisa de novo"); await repo.marcarNotificadas(R, c, []);
  // reaplicar a mesma mensagem (upsert) não a devolve à fila
  await repo.aplicarSync(R, c, p, apl({ mensagens: [L(4)], cursor: 6, total: 5, semRemocao: true, silenciosa: false, origem: "agenda", reconciliada: true })); assert.deepEqual(await repo.pendentes(R, c), [], "idempotente: o upsert não zera notificada_em");
  // mensagens antigas (> 24 h) pendentes saem tratadas, sem aviso tardio
  await db.exec(`insert into public.inbox_mensagens_ref (dono, conta_id, pasta_id, id_externo, uidvalidity, uid, criado_em) values ('${R}', '${c}', '${p}', '700:99', 700, 99, now() - interval '30 hours')`);
  assert.deepEqual(await repo.pendentes(R, c), []); assert.equal((await db.query("select count(*)::int as n from public.inbox_mensagens_ref where notificada_em is null")).rows[0].n, 0);
  // não lidas do ícone: soma da pasta de entrada do dono
  assert.equal(await repo.naoLidasEntrada(R), 4); assert.equal(await repo.naoLidasEntrada(X), 0);
  // sem mudança: só atualiza horário, duração, origem e contagem; zera falhas
  await repo.falhaSync(R, c, p, "timeout"); await repo.falhaSync(R, c, p, "timeout"); assert.equal((await db.query("select falhas_seguidas from public.inbox_sincronizacao")).rows[0].falhas_seguidas, 2);
  await repo.semMudanca(R, c, p, { uidvalidity: 700, uidnext: 6, total: 5, duracao_ms: 33 });
  const s2 = (await db.query("select tipo_ultima, falhas_seguidas, erro, duracao_ms, origem, uidnext from public.inbox_sincronizacao")).rows[0]; assert.deepEqual({ ...s2, uidnext: Number(s2.uidnext) }, { tipo_ultima: "sem_mudanca", falhas_seguidas: 0, erro: null, duracao_ms: 33, origem: "agenda", uidnext: 6 });
  const e = await repo.estadoSync(R, c, p); assert.equal(typeof e.reconciliada_em, "string", "a data da última releitura completa volta ao algoritmo"); assert.ok(!Number.isNaN(Date.parse(e.reconciliada_em)));
});

test("PGlite · contas da rotina: só iCloud com credencial ativa, 'sincronizar automaticamente' ligado, pasta de entrada e fora de erro de autenticação; a casa e outras credenciais ficam de fora; senha da rotina e chaves VAPID", { skip: pular }, async () => {
  const db = await banco(); await db.exec(S54);
  await db.exec(`create table public.inbox_credenciais (conta_id uuid primary key, dono uuid not null, estado text not null default 'ativa');   -- molde da 052 (o cofre real precisa do Vault; aqui só importa o estado)
    create function public.rac_rotina_ok(segredo text) returns boolean language sql as $$ select segredo = 'senha-da-rotina' $$;`);
  const nova = (n, dono, ext = "", cred = "ativa", pasta = true) => { const c = "cccccccc-0000-4000-8000-00000000000" + n, p = "dddddddd-0000-4000-8000-00000000000" + n; return `insert into public.inbox_contas (id, dono, provedor, apelido, endereco ${ext.split("|")[0] || ""}) values ('${c}', '${dono}', '${ext.split("|")[1] || "icloud"}', 'c${n}', 'c${n}@icloud.example' ${ext.split("|")[2] || ""});` + (cred ? `insert into public.inbox_credenciais values ('${c}', '${dono}', '${cred}');` : "") + (pasta ? `insert into public.inbox_pastas (id, dono, conta_id, nome_externo, uso) values ('${p}', '${dono}', '${c}', 'INBOX', 'entrada');` : ""); };
  await db.exec(nova(1, R));                                                  // entra
  await db.exec(nova(2, R, ", sync_auto|icloud|, false"));                    // desligada pelo dono
  await db.exec(nova(3, R, "", "invalida"));                                  // credencial inválida
  await db.exec(nova(4, R, "", null));                                        // sem credencial
  await db.exec(nova(5, R, "", "ativa", false));                              // sem pasta de entrada conhecida
  await db.exec(nova(6, R, ", estado|icloud|, 'erro_autenticacao'"));         // em erro de autenticação
  await db.exec(nova(7, R, ", estado|icloud|, 'desconectada'"));              // desconectada
  await db.exec(nova(8, R, "|gmail|"));                                       // outro provedor
  await db.exec(nova(9, F));                                                  // a casa (Fernanda) nunca entra
  await db.exec(nova(0, X, ", notificar|icloud|, false"));                    // outro usuário, sem notificar
  const repo = criarRepositorio(sessaoDe(db)), l = await repo.contasAutomaticas();
  assert.deepEqual(l.map((x) => [x.conta.slice(-1), x.notificar]).sort(), [["0", false], ["1", true]]); assert.ok(l.every((x) => x.pasta_id && x.falhas === 0 && x.ultima_tentativa_em === null));
  assert.equal(await repo.rotinaAutorizada("senha-da-rotina"), true); assert.equal(await repo.rotinaAutorizada("outra"), false); assert.equal(await repo.rotinaAutorizada(""), false);
});

test("PGlite · preferências e push: o dono (sem MFA configurado) edita as dele; a casa e outro usuário não; inscrições e chaves VAPID só do dono; anon não lê nada", { skip: pular }, async () => {
  const db = await banco(); await db.exec(S54);
  await db.exec(`create table public.push_inscricoes (id bigint generated always as identity primary key, user_id uuid not null, endpoint text not null unique, p256dh text not null, auth text not null, aparelho text, criado timestamptz default now());
    create table public.rac_segredos (chave text primary key, valor jsonb not null, criado timestamptz default now());
    revoke all on public.rac_segredos from anon, authenticated;
    insert into public.push_inscricoes (user_id, endpoint, p256dh, auth) values ('${R}', 'https://push.exemplo.net/a', 'p', 'a'), ('${X}', 'https://push.exemplo.net/b', 'p', 'a');
    insert into public.rac_segredos values ('vapid', '{"publica":"PUB","jwk":{"kty":"EC"}}');
    insert into public.inbox_contas (id, dono, provedor, apelido, endereco) values ('cccccccc-0000-4000-8000-000000000001', '${R}', 'icloud', 'A', 'a@icloud.example');`);
  const alvo = "cccccccc-0000-4000-8000-000000000001", upd = (uid, col) => como(db, "authenticated", uid, `update public.inbox_contas set ${col} = false where id = '${alvo}' returning ${col}`);
  assert.deepEqual(await upd(R, "notificar"), [{ notificar: false }]); assert.deepEqual(await upd(R, "sync_auto"), [{ sync_auto: false }]);
  assert.deepEqual(await upd(X, "notificar"), [], "outro usuário não altera"); assert.deepEqual(await upd(F, "notificar"), [], "a casa não altera");
  const bp = criarBancoPush(sessaoDe(db)); assert.deepEqual(await bp.vapid(), { publica: "PUB", jwk: { kty: "EC" } });
  assert.deepEqual((await bp.inscricoes(R)).map((x) => x.endpoint), ["https://push.exemplo.net/a"]); assert.deepEqual(await bp.inscricoes(F), []);
  await bp.apagarInscricao(X, (await bp.inscricoes(R))[0].id); assert.equal((await bp.inscricoes(R)).length, 1, "apagar com o dono errado não apaga");
  await bp.apagarInscricao(R, (await bp.inscricoes(R))[0].id); assert.equal((await bp.inscricoes(R)).length, 0); assert.equal((await bp.inscricoes(X)).length, 1);
  assert.ok(await codigoErro(como(db, "authenticated", R, "select * from public.rac_segredos")), "o site nunca lê as chaves"); assert.ok(await codigoErro(como(db, "anon", R, "select * from public.inbox_contas")));
  const vazio = criarBancoPush(sessaoDe({ query: async () => ({ rows: [] }) })); assert.equal(await vazio.vapid(), null);
});

/* ---------- a função (texto), o Service Worker e a tela ---------- */
test("index.ts: a rotina só entra com a senha da rotina conferida no banco e só aceita {operacao:'rotina_sync'}; não usa service_role; a credencial nunca vai a resposta nem registro", () => {
  const t = semComent(ler("supabase/functions/rac-inbox/index.ts"));
  assert.match(t, /req\.headers\.get\("x-rac-rotina"\)/); assert.match(t, /operacao !== "rotina_sync" \|\| Object\.keys\(corpo as object\)\.length !== 1/); assert.match(t, /rotinaAutorizada\(senhaRotina\)/);
  assert.ok(t.indexOf("rotinaAutorizada") < t.indexOf("rodarRotina("), "autoriza antes de rodar"); assert.ok(t.indexOf('"x-rac-rotina"') < t.indexOf("auth.getUser"), "a rota da rotina vem antes do JWT e não o dispensa para as demais");
  assert.ok(!/service_role|SERVICE_ROLE/.test(t)); assert.match(t, /resumo }\), \{ status: 200/);
  for (const f of ["rotina.ts", "push.ts"]) { const s = semComent(ler("supabase/functions/rac-inbox/" + f)); assert.ok(!/Deno|service_role|console\./.test(s), f + " é puro"); assert.ok(!/senha|SENHA/.test(s.replace(/credencial|senha: string/g, "")) || f === "rotina.ts", f); }
  const contrato = ler("supabase/functions/rac-inbox/contrato.ts"); assert.match(contrato, /VERSAO_FUNCAO = "rac-inbox@i3\.0"/);
  assert.ok(!/rotina_sync/.test(contrato.replace(/\/\/.*$/gm, "")), "a rotina não é uma operação do navegador: validarPedido a recusa");
});

test("Service Worker: o aviso do Inbox usa o mesmo caminho do aviso diário (não o substitui), atualiza o selo de não lidas quando suportado e abre #inbox ao tocar", () => {
  const sw = ler("sw.js"); assert.match(sw, /addEventListener\("push"/); assert.match(sw, /setAppBadge/); assert.match(sw, /clearAppBadge/); assert.match(sw, /renotify/);
  assert.match(sw, /tag: d\.tag \|\| undefined/, "o aviso diário continua sem tag"); assert.match(sw, /data: \{ url: d\.url \|\| "\.\/#agenda" \}/, "o destino padrão do diário continua #agenda");
  assert.equal(globalThis.RACnucleo.notifHash("./#inbox", "https://raynercarvalho.com.br/"), "#inbox");
});

/* ---------- autenticação do agendamento (055): JWT para o gateway (verify_jwt=true) + senha da rotina para a função ---------- */
const S55 = semComent(ler("supabase/propostas/055_inbox_agendamento.sql"));
const jobSql = S55.slice(S55.indexOf("cron.schedule("), S55.indexOf("$$);", S55.indexOf("cron.schedule(")));
test("055: a chamada agendada leva Authorization Bearer (chave pública do Vault) E x-rac-rotina (senha do Vault); nenhuma chave literal, nunca service_role/secret; o job é o único mexido; rollback só desfaz o inbox-sync", () => {
  const cab = jobSql.slice(jobSql.indexOf("headers :="), jobSql.indexOf("body :="));
  assert.deepEqual([...cab.matchAll(/'([A-Za-z-]+)',(?: 'Bearer ' \|\|)? ?\(?(?:select decrypted_secret from vault\.decrypted_secrets where name = '([a-z_]+)'\)|'application\/json')/g)].filter((m) => m[2]).map((m) => m[1] + "=" + m[2]).sort(), ["Authorization=rac_chave_publica", "x-rac-rotina=rac_rotina"]);
  assert.match(cab, /'Content-Type', 'application\/json'/);
  const bruto = ler("supabase/propostas/055_inbox_agendamento.sql");
  assert.ok(!/eyJ[A-Za-z0-9_-]{10,}|sb_(publishable|secret)_[A-Za-z0-9_-]{10,}/.test(bruto), "nenhuma chave literal no arquivo");
  assert.ok(!/service_role|SERVICE_ROLE|sb_secret/i.test(S55) && !/service_role|sb_secret/i.test(jobSql), "nunca service_role ou secret key na chamada");
  assert.match(jobSql, /functions\/v1\/rac-inbox/); assert.match(jobSql, /\*\/10 \* \* \* \*/);
  assert.ok(!/no-verify-jwt/.test(S55 + jobSql), "verify_jwt continua ligado: a solução não é --no-verify-jwt");
  assert.match(bruto, /verify_jwt=true/); assert.deepEqual([...S55.matchAll(/cron\.(?:un)?schedule\('([a-z-]+)'/g)].map((m) => m[1]), ["inbox-sync", "inbox-sync"], "só o job inbox-sync (idempotente: desagenda e agenda o mesmo nome)");
  assert.match(S55, /select cron\.unschedule\('inbox-sync'\) where exists \(select 1 from cron\.job where jobname = 'inbox-sync'\)/);
  assert.match(bruto, /Para DESLIGAR \(rollback\): select cron\.unschedule\('inbox-sync'\);/); assert.ok(!/unschedule\('rac-rotina'\)/.test(bruto), "o aviso diário das 6h não é tocado");
});

test("055 · guarda do Vault (Postgres de verdade): só passa com rac_rotina e uma chave JWT de papel anon; service_role, chave sb_* e ausência abortam", { skip: pular }, async () => {
  const guarda = "do $$" + S55.slice(S55.indexOf("do $$") + 5, S55.indexOf("end $$;") + 7);
  const jwt = (role) => "h." + Buffer.from(JSON.stringify({ iss: "supabase", role })).toString("base64url") + ".s";
  const roda = async (segredos) => {
    const db = await PGlite.create();
    await db.exec("create schema vault; create table vault.secrets (name text); create table vault.decrypted_secrets (name text, decrypted_secret text);");
    for (const [n, v] of Object.entries(segredos)) await db.exec(`insert into vault.secrets values ('${n}'); insert into vault.decrypted_secrets values ('${n}', '${v}')`);
    return codigoErro(db.exec(guarda));
  };
  assert.equal(await roda({ rac_rotina: "x", rac_chave_publica: jwt("anon") }), null, "anon: passa");
  assert.ok(await roda({ rac_rotina: "x", rac_chave_publica: jwt("service_role") }), "service_role: aborta");
  assert.ok(await roda({ rac_rotina: "x", rac_chave_publica: "sb_publishable_abc" }), "chave nova (não é JWT): aborta");
  assert.ok(await roda({ rac_rotina: "x", rac_chave_publica: "lixo.%%%.x" }), "lixo: aborta");
  assert.ok(await roda({ rac_rotina: "x" }), "sem a chave pública: aborta");
  assert.ok(await roda({ rac_chave_publica: jwt("anon") }), "sem a senha da rotina: aborta");
});

test("index.ts: o Authorization (gateway) NÃO autoriza a rotina: sem x-rac-rotina cai no caminho do usuário (JWT + MFA); com ele, só a senha do banco vale; Bearer anon não vira usuário", () => {
  const t = semComent(ler("supabase/functions/rac-inbox/index.ts")), r = t.slice(t.indexOf('const senhaRotina'), t.indexOf("resumo }), { status: 200"));
  assert.ok(!/Authorization/.test(r), "o ramo da rotina não lê o Authorization");
  assert.match(t, /if \(!autorizada\) \{[\s\S]*?return erro\("sem_login"\)/);
  assert.match(t, /usuario = \{ id: data\.user\.id, mfaOk: aalOk\(/, "o caminho do navegador continua exigindo getUser e MFA");
  const sv = semComent(ler("supabase/functions/rac-inbox/servico.ts")); assert.match(sv, /if \(!ctx\.usuario\) return falha\("sem_login"\)/); assert.match(sv, /if \(!ctx\.usuario\.mfaOk\) return falha\("mfa_requerido"\)/);
});

test("prazo da rodada: passado o orçamento a leitura por páginas para (cursor avança só até onde leu)", async () => {
  const m = mundo({ cursor: { uidvalidity: 700, uidnext: 10, reconciliada_em: iso(AGORA) } }); let t = AGORA;
  const w = worker((op, ped) => { t += 20_000; return op === "estado_pasta" ? estado(1000, 999) : janela(1000, faixa(ped.desde_uid, ped.desde_uid + 99), true); });
  await rodar(m, w, { agora: () => t, orcamentoMs: 45_000 });
  assert.ok(w.chamadas.filter((c) => c[0] === "listar_mensagens").length < 5, "parou antes das 5 páginas"); assert.ok(m.aplicados[0].cursor < 1000 && m.aplicados[0].cursor > 10, "cursor parcial, sem pular");
});

/* ---------- tempo: o pior caso REAL cabe no timeout do pg_net ---------- */
const rot = ler("supabase/functions/rac-inbox/rotina.ts"), K = (n) => Number(new RegExp("export const [^;]*?" + n + " = ([0-9_]{4,})").exec(rot)[1].replace(/_/g, ""));
const [ORC, CH_MAX, CH_MIN, DURO, MARGEM] = ["ORCAMENTO_MS", "CHAMADA_MAX_MS", "CHAMADA_MIN_MS", "PRAZO_DURO_MS", "MARGEM_GRAVACAO_MS"].map(K);
const PG_NET = Number(/timeout_milliseconds := (\d+)/.exec(ler("supabase/propostas/055_inbox_agendamento.sql"))[1]), FUNCAO = 150_000;

test("tempo: valores finais iguais no código, na 055 e na documentação; duro + margem < pg_net < limite da função; o canal real limita cada chamada a 40 s", () => {
  assert.deepEqual([ORC, CH_MAX, CH_MIN, DURO, MARGEM, PG_NET], [45_000, 40_000, 5_000, 90_000, 10_000, 120_000]);
  assert.ok(DURO + MARGEM < PG_NET && PG_NET < FUNCAO, "100 s < 120 s < 150 s"); assert.ok(ORC < DURO && CH_MAX <= DURO && CH_MIN < CH_MAX);
  assert.match(ler("supabase/functions/rac-inbox/canal.ts"), /cfg\.timeoutMs \?\? 40000/, "o canal real: 40 s por chamada");
  const doc = ler("docs/inbox.md"), tempo = doc.slice(doc.indexOf("- **Tempo (valores finais"), doc.indexOf("\n", doc.indexOf("- **Tempo (valores finais")));
  for (const f of ["**45 s**", "**40 s**", "**prazo duro de 90 s**", "**+10 s**", "**≤ 100 s**", "120000", "150 s"]) assert.ok(tempo.includes(f), "docs/inbox.md, Tempo: " + f);
  const s55 = ler("supabase/propostas/055_inbox_agendamento.sql"); for (const f of ["45 s", "40 s", "90 s", "10 s", "100 s", "120 s", "150 s"]) assert.ok(s55.includes(f), "055: " + f);
  for (const velho of ["pior caso ≈ 125", "Orçamento de 90 s", "orçamento de 90"]) assert.ok(!(doc.replace(/estimativa anterior[^.]*\./, "").includes(velho)) && !s55.includes(velho), "referência antiga: " + velho);
  assert.match(doc, /Authorization: Bearer <chave anon>/); assert.match(doc, /verify_jwt=true/); assert.ok(!/\[sem navegador, sem JWT\]/.test(doc), "a rotina não é mais descrita como sem JWT");
});

test("tempo (simulado): conta começando no limite do orçamento, três chamadas de 40 s por conta: nenhuma chamada ao Worker passa do prazo duro, cada uma recebe no máximo o que resta, a rodada termina antes de 100 s e a falta de tempo não vira falha da conta", async () => {
  let t = AGORA; const recebidos = [];
  const m = mundo({ cursor: { uidvalidity: 700, uidnext: 10, reconciliada_em: null } });   // vencida: EXAMINE + janela completa
  const w = { async executar(op, ped, cred, opc) { recebidos.push([op, t - AGORA, opc?.timeoutMs]); t += opc.timeoutMs; return op === "estado_pasta" ? estado(10) : janela(10, faixa(1, 9)); } };
  t = AGORA; const comecou = AGORA;
  const logs = []; const r = await rodarRotina({ banco: m.banco, cofre: m.cofre, worker: w, aviso: m.aviso, registrar: (e) => logs.push(e), agora: () => { return t; } });
  for (const [, inicio, lim] of recebidos) { assert.ok(lim <= CH_MAX && lim >= CH_MIN, "limite por chamada: " + lim); assert.ok(inicio + lim <= DURO, "a chamada termina até o prazo duro"); }
  assert.ok(t - comecou <= DURO, "tempo total gasto no Worker ≤ prazo duro"); assert.ok(t - comecou + MARGEM < PG_NET);
  // conta que só começa aos 44 s, com cada chamada demorando o máximo (40 s): a 2ª já recebe só o que resta e a 3ª é recusada
  let t2 = AGORA; const ch2 = [], inicio2 = AGORA;
  const contas = [{ conta: C1, dono: U1, apelido: "A", notificar: true, pasta_id: P1, falhas: 0, ultima_tentativa_em: null }, { conta: C2, dono: U1, apelido: "B", notificar: true, pasta_id: P2, falhas: 0, ultima_tentativa_em: null }];
  const m3 = mundo({ contas, cursor: { uidvalidity: 700, uidnext: 10, reconciliada_em: null } }); const w3 = { async executar(op, ped, cred, opc) { ch2.push([t2 - inicio2, opc.timeoutMs]); t2 += opc.timeoutMs; return op === "estado_pasta" ? estado(10) : janela(10, faixa(1, 9)); } };
  const logs3 = []; const r3 = await rodarRotina({ banco: m3.banco, cofre: m3.cofre, worker: w3, aviso: m3.aviso, registrar: (e) => logs3.push(e), agora: () => t2 });
  assert.ok(ch2.every(([ini, lim]) => ini + lim <= DURO), JSON.stringify(ch2)); assert.ok(t2 - inicio2 + MARGEM < PG_NET, "termina antes do timeout do pg_net: " + (t2 - inicio2));
  assert.equal(m3.falhas.length, 0, "falta de tempo não é falha da conta"); assert.equal(r3.falhas, 0); assert.ok(r3.ignoradas >= 1, JSON.stringify(r3));
  assert.deepEqual([m3.travadas.size, m3.marcas.length], [0, 0]);
});

test("canal.ts: opcoes.timeoutMs encurta a chamada (o prazo da rotina vale de verdade); nunca a alonga acima do limite do canal", async () => {
  const { criarWorkerHttp } = await import("../supabase/functions/rac-inbox/canal.ts");
  const sinais = []; const fetchFn = (u, init) => { sinais.push(init.signal); return new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(new Error("x")))); };
  const w = criarWorkerHttp({ url: "https://w.exemplo.workers.dev", segredo: "s".repeat(40), fetchFn });
  const t0 = Date.now(); await assert.rejects(w.executar("ping", {}, null, { timeoutMs: 60 }), /canal_falhou/); assert.ok(Date.now() - t0 < 2000, "abortou pelo limite curto (60 ms), não pelos 40 s");
  const w2 = criarWorkerHttp({ url: "https://w.exemplo.workers.dev", segredo: "s".repeat(40), fetchFn, timeoutMs: 50 }); const t1 = Date.now();
  await assert.rejects(w2.executar("ping", {}, null, { timeoutMs: 60_000 }), /canal_falhou/); assert.ok(Date.now() - t1 < 2000, "opcoes não alonga acima do limite do canal");
});


test("prazo duro: sem pelo menos 5 s restantes a chamada ao Worker nem é feita; a conta é 'ignorada' (nunca falha, nunca invalida credencial, nada gravado) e a trava é liberada", async () => {
  const m = mundo({ cursor: { uidvalidity: 700, uidnext: 10, reconciliada_em: null } }); let t = AGORA; let n = 0;
  const w = { async executar(op, ped, cred, opc) { n++; t += 87_000; return op === "estado_pasta" ? estado(10) : janela(10, faixa(1, 9)); } };
  const logs = []; const r = await rodarRotina({ banco: m.banco, cofre: m.cofre, worker: w, aviso: m.aviso, registrar: (e) => logs.push(e), agora: () => t });
  assert.equal(n, 1, "a 2ª chamada (restavam 3 s) foi recusada antes de sair"); assert.deepEqual([r.ignoradas, r.falhas], [1, 0]); assert.ok(logs.some((l) => l.codigo === "prazo_esgotado"));
  assert.deepEqual([m.falhas.length, m.marcas.length, m.estados.length, m.aplicados.length, m.travadas.size], [0, 0, 0, 0, 0]);
});

/* ---------- conteúdo da notificação (assunto e remetente; nunca o corpo) ---------- */
test("conteúdo: título = assunto; corpo = nome — endereço; assunto vazio = (Sem assunto); sem nome = endereço; nome igual ao endereço não repete; só nome ou nada tem texto de reserva", () => {
  assert.deepEqual([tituloDoAviso("Nota fiscal da compra"), corpoDoAviso("João Silva", "exemplo@email.com")], ["Nota fiscal da compra", "João Silva — exemplo@email.com"]);
  for (const v of [null, "", "   ", "\n\t "]) assert.equal(tituloDoAviso(v), "(Sem assunto)");
  assert.equal(corpoDoAviso(null, "a@b.co"), "a@b.co"); assert.equal(corpoDoAviso("", "a@b.co"), "a@b.co"); assert.equal(corpoDoAviso("A@B.CO", "a@b.co"), "a@b.co", "nome igual ao endereço: sem repetir");
  assert.equal(corpoDoAviso("Só Nome", null), "Só Nome"); assert.equal(corpoDoAviso(null, null), "Remetente desconhecido");
  const p = montarAviso(C1, PEND(1, { assunto: null, nome: null }), 2); assert.deepEqual([p.titulo, p.corpo], ["(Sem assunto)", "joao@exemplo.com"]);
});

test("conteúdo: caracteres especiais e textos longos não quebram a notificação (controles e direção removidos, corte por caractere, emoji inteiro, JSON válido e pequeno)", async () => {
  const sujo = "Olá\u0000\u0007\n\r\t mundo \u202Eevil\u202C \u200B<b>\"aspas\"</b> 'x' & \\ \u2028fim";
  const t = tituloDoAviso(sujo); assert.ok(!/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e]/.test(t), "sem controle nem direção"); assert.equal(t, 'Olá mundo evil <b>"aspas"</b> \'x\' & \\ fim', "texto preservado como TEXTO (a notificação não interpreta HTML)");
  const longo = "x".repeat(500), tl = tituloDoAviso(longo); assert.equal([...tl].length, 100); assert.ok(tl.endsWith("…"));
  const emojis = "😀".repeat(150), te = tituloDoAviso(emojis); assert.equal([...te].length, 100); assert.ok(!/[\ud800-\udbff]$/.test(te) && ![...te].some((c) => c.length === 1 && /[\ud800-\udfff]/.test(c)), "não corta um emoji ao meio");
  const c = corpoDoAviso("N".repeat(300), "e".repeat(300) + "@x.co"); assert.ok([...c].length <= 140);
  const msg = montarAviso(C1, PEND(1, { assunto: longo + sujo, nome: "N".repeat(400), endereco: "e".repeat(400) + "@x.co" }), 9);
  const json = JSON.stringify(msg); assert.deepEqual(JSON.parse(json), msg); assert.ok(new TextEncoder().encode(json).length < 1500, "bem abaixo do limite do Web Push (≈4 KB)");
  const a = await aparelho(1), { vapid } = await vapidNovo(), env = [];
  await entregar({ async vapid() { return vapid; }, async inscricoes() { return [a.insc]; }, async apagarInscricao() {} }, U1, msg, async (u, i) => { env.push(i); return { status: 201 }; });
  assert.deepEqual(JSON.parse(await decifrar(env[0].body, a)), msg, "chega inteiro e decifrável");
});

test("várias mensagens no mesmo ciclo: até 4 = uma notificação cada; acima disso, as 3 mais novas individuais + UM resumo; cada aviso com o assunto e o remetente da própria mensagem; nenhuma mistura; destinos distintos", () => {
  const lista = (n) => Array.from({ length: n }, (_, i) => PEND(n - i, { assunto: "S" + (n - i), nome: "N" + (n - i), endereco: "e" + (n - i) + "@x.co" }));   // da mais nova para a mais antiga
  for (const n of [1, 2, 3, 4]) { const pl = planejarAvisos(C1, lista(n), 5); assert.equal(pl.length, n); for (const { msg, ids } of pl) { const k = ids[0].slice(1); assert.deepEqual([msg.titulo, msg.corpo], ["S" + k, "N" + k + " — e" + k + "@x.co"], "assunto e remetente da MESMA mensagem"); assert.equal(msg.url, destinoDaMensagem(C1, { id: ids[0], pasta_id: P1 })); assert.equal(ids.length, 1); } assert.equal(new Set(pl.map((x) => x.msg.url)).size, n, "destinos distintos"); assert.equal(new Set(pl.map((x) => x.msg.tag)).size, n); }
  const pl = planejarAvisos(C1, lista(7), 7); assert.equal(pl.length, 4);
  const res = pl.find((x) => x.msg.tag === "inbox-" + C1); assert.deepEqual([res.msg.titulo, res.msg.corpo, res.msg.url, res.ids.length], ["RAC Inbox", "Mais 4 novas mensagens", "./#inbox", 4]); assert.deepEqual([...res.ids].sort(), ["m1", "m2", "m3", "m4"]);
  const ind = pl.filter((x) => x !== res); assert.deepEqual(ind.map((x) => x.ids[0]).sort(), ["m5", "m6", "m7"], "as 3 mais novas individuais"); assert.equal(pl.at(-1).ids[0], "m7", "o mais novo é o último enviado (fica por cima)");
  assert.equal(montarResumo(C1, 1, 3).corpo, "Mais 1 nova mensagem"); assert.deepEqual(new Set(pl.flatMap((x) => x.ids)).size, 7, "toda mensagem coberta uma vez só");
});

test("rotina com várias mensagens: 6 novas = 3 individuais + resumo, todas tratadas (nada repete); push que falha mantém SÓ as mensagens daquele aviso pendentes e as outras seguem; a rodada seguinte reenvia só o que faltou", async () => {
  const m = mundo(), w = worker((op) => (op === "estado_pasta" ? estado(16, 15) : janela(16, faixa(10, 15))));
  const { r } = await rodar(m, w);
  assert.equal(m.avisos.length, 4); assert.equal(r.avisos, 4); assert.deepEqual(m.avisos.map((x) => x.m.titulo).slice(-1), ["ASSUNTO-CONFIDENCIAL 15"]); assert.ok(m.avisos.some((x) => x.m.corpo === "Mais 3 novas mensagens"));
  assert.deepEqual(await m.banco.pendentes(), [], "todas tratadas");
  const w2 = worker(estado(16, 15)); await rodar(m, w2); assert.equal(m.avisos.length, 4, "sem repetição na rodada seguinte");
  // falha só do aviso da mensagem 12
  const m2 = mundo(), w3 = worker((op) => (op === "estado_pasta" ? estado(13, 12) : janela(13, faixa(10, 12))));
  m2.aviso.enviar = async (d, msg) => { if (msg.tag === "inbox-msg-m12") return { aparelhos: 1, enviados: 0, removidas: 0, semChaves: false }; m2.avisos.push({ d, msg }); return { aparelhos: 1, enviados: 1, removidas: 0, semChaves: false }; };
  const { r: r2 } = await rodar(m2, w3); assert.equal(r2.avisos, 2); assert.deepEqual((await m2.banco.pendentes()).map((x) => x.id), ["m12"], "só a mensagem cujo aviso falhou continua pendente");
  m2.aviso.enviar = async (d, msg) => { m2.avisos.push({ d, msg }); return { aparelhos: 1, enviados: 1, removidas: 0, semChaves: false }; };
  const { r: r3 } = await rodar(m2, worker(estado(13, 12))); assert.deepEqual([r3.avisos, m2.avisos.at(-1).msg.titulo, (await m2.banco.pendentes()).length], [1, "ASSUNTO-CONFIDENCIAL 12", 0]);
});

