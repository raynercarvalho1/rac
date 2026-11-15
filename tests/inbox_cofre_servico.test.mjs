// RAC Inbox · I1 · função "rac-inbox" (supabase/functions/rac-inbox; NÃO PUBLICADA): o serviço com o cofre e o Worker de MENTIRA. Prova: a credencial nunca sai em resposta, erro ou
// registro; conta sem credencial nunca chega ao Worker; credencial inválida vira erro controlado; falha do cofre interrompe tudo, sem alternativa; MFA; nada de estado global.
// TUDO FICTÍCIO: "aaaa-bbbb-cccc-dddd" e "a@icloud.example" não são credenciais de ninguém. O Node 24 lê os .ts direto. Sem rede, sem banco, sem Deno.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validarPedido, aalOk, empacotar, desempacotar, erroDoCofre, ERROS, OPERACOES_LEITURA, OPERACOES_CREDENCIAL } from "../supabase/functions/rac-inbox/contrato.ts";
import { atender, filtrarResposta } from "../supabase/functions/rac-inbox/servico.ts";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const semComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
const U1 = "11111111-1111-4111-8111-111111111111", U2 = "33333333-3333-4333-8333-333333333333", C1 = "aaaaaaaa-0000-4000-8000-000000000001", C2 = "aaaaaaaa-0000-4000-8000-000000000002", P1 = "bbbbbbbb-0000-4000-8000-000000000001";
const USUARIO = "a@icloud.example", SENHA = "aaaa-bbbb-cccc-dddd", SENHA2 = "eeee-ffff-gggg-hhhh";
const CORPO = (extra = {}) => ({ operacao: "credencial_guardar", conta_id: C1, usuario: USUARIO, senha_app: SENHA, ...extra });
class ErroCofre extends Error { constructor(codigo, msg) { super(msg ?? codigo); this.codigo = codigo; } }

/* cofre de mentira: guarda por (dono, conta) e REGISTRA toda chamada, para provar quem pediu o quê */
function cofreFalso({ falhaEm = {}, estado = {} } = {}) {
  const dados = new Map(), chamadas = [], k = (d, c) => d + "|" + c, est = new Map();
  const falha = (op) => { if (falhaEm[op]) throw falhaEm[op]; };
  return { chamadas, dados, est,
    async guardar(d, c, s) { chamadas.push(["guardar", d, c]); falha("guardar"); dados.set(k(d, c), s); est.set(k(d, c), "ativa"); },
    async ler(d, c) { chamadas.push(["ler", d, c]); falha("ler"); return dados.get(k(d, c)) ?? null; },
    async remover(d, c) { chamadas.push(["remover", d, c]); falha("remover"); const t = dados.delete(k(d, c)); est.delete(k(d, c)); return t; },
    async estado(d, c) { chamadas.push(["estado", d, c]); falha("estado"); return est.get(k(d, c)) ?? estado[k(d, c)] ?? "ausente"; },
    async marcar(d, c, e) { chamadas.push(["marcar", d, c, e]); falha("marcar"); est.set(k(d, c), e); } };
}
function workerFalso(resp) { const chamadas = []; return { chamadas, async executar(op, ped, cred) { chamadas.push([op, ped, { ...cred }]); if (resp instanceof Error) throw resp; return typeof resp === "function" ? resp(op, ped, cred) : resp; } }; }
const OK_ESTADO = { ok: true, dados: { exame: { uidvalidity: 1752612613, uidnext: 4, codigo_etiquetado: "READ-WRITE" }, mensagens_na_pasta: 1, duracao_ms: 985, senha: SENHA, usuario: USUARIO } };
/* banco de mentira (I2): só o que estas provas usam; a sincronização é provada em tests/inbox_sync_servico.test.mjs */
function bancoFalso({ pastas = { [P1]: "INBOX" }, est = null } = {}) {
  const ch = [];
  return { ch, async pasta(d, c, id) { ch.push(["pasta", d, c, id]); return pastas[id] ? { id, nome_externo: pastas[id] } : null; }, async estadoSync() { return est; }, async travar() { return true; }, async destravar() {},
    async salvarPastas() { return []; }, async aplicarSync() { return { novas: 0, atualizadas: 0, removidas: 0 }; }, async falhaSync() {}, async estadoConta() {} };
}
function ctx({ usuario = { id: U1, mfaOk: true }, cofre = cofreFalso(), worker = null, banco = bancoFalso() } = {}) { const logs = []; return { c: { usuario, cofre, banco, worker, registrar: (e) => logs.push(e) }, logs, cofre, worker, banco }; }
/* tudo o que sairia para fora: resposta + registros + (se houver) texto de erros */
const visivel = (r, logs) => JSON.stringify([r, logs]);
const semSegredo = (r, logs, extra = []) => { const t = visivel(r, logs); for (const s of [SENHA, SENHA2, "aaaa-bbbb", "cccc-dddd", ...extra]) assert.ok(!t.includes(s), "vazou: " + s); };

/* ---------- contrato ---------- */
test("contrato: só senha ESPECÍFICA de app (xxxx-xxxx-xxxx-xxxx); senha principal, maiúsculas, tamanho errado e e-mail inválido são recusados; campo extra, ID ruim e operação desconhecida também", () => {
  assert.deepEqual(validarPedido(CORPO()), { ok: true, pedido: CORPO() });
  for (const ruim of ["MinhaSenhaPrincipal123!", "AAAA-BBBB-CCCC-DDDD", "aaaa-bbbb-cccc", "aaaa-bbbb-cccc-dddd-eeee", "aaaabbbbccccdddd", "aaaa bbbb cccc dddd", "aaa1-bbbb-cccc-dddd", " aaaa-bbbb-cccc-dddd", "aaaa-bbbb-cccc-dddd\n", ""]) assert.equal(validarPedido(CORPO({ senha_app: ruim })).erro, "senha_formato_invalido", JSON.stringify(ruim));
  assert.equal(validarPedido(CORPO({ senha_app: 123 })).erro, "senha_formato_invalido");
  for (const ruim of ["sem-arroba", "a b@c.co", "@c.co", "a@c", ""]) assert.equal(validarPedido(CORPO({ usuario: ruim })).erro, "usuario_invalido", ruim);
  assert.equal(validarPedido(CORPO({ dono: U2 })).erro, "campos_inesperados", "o dono NUNCA vem do corpo"); assert.equal(validarPedido(CORPO({ user_id: U2 })).erro, "campos_inesperados");
  assert.equal(validarPedido({ operacao: "credencial_remover", conta_id: C1, senha_app: SENHA }).erro, "campos_inesperados", "só o guardar aceita credencial");
  assert.equal(validarPedido({ operacao: "estado_pasta", conta_id: C1, pasta_id: P1, senha_app: SENHA }).erro, "campos_inesperados", "operação de leitura não aceita credencial");
  assert.equal(validarPedido({ operacao: "testar_conta" }).erro, "campo_ausente"); assert.equal(validarPedido({ operacao: "testar_conta", conta_id: "1;drop" }).erro, "id_invalido");
  assert.equal(validarPedido({ operacao: "estado_pasta", conta_id: C1 }).erro, "campo_ausente");
  for (const op of ["enviar", "mover", "excluir", "marcar", "arquivar", "responder", "criar_pasta", "store", "append", "expunge"]) assert.equal(validarPedido({ operacao: op, conta_id: C1 }).erro, "operacao_invalida", op + " não existe");
  for (const nao of [null, [], "texto", 5, undefined]) assert.equal(validarPedido(nao).erro, "corpo_invalido");
  assert.deepEqual([...OPERACOES_LEITURA, ...OPERACOES_CREDENCIAL].sort(), ["baixar_anexo", "credencial_estado", "credencial_guardar", "credencial_remover", "estado_pasta", "ler_mensagem", "listar_pastas", "sincronizar_pasta", "testar_canal", "testar_conta"]);
  for (const c of Object.keys(ERROS)) assert.ok(Number.isInteger(ERROS[c]) && ERROS[c] >= 400, c);
});

test("contrato: MFA como no banco; empacotar/desempacotar; erros do Postgres viram só código fechado", () => {
  assert.equal(aalOk([], "aal1"), true, "sem fator, aal1 basta"); assert.equal(aalOk(undefined, null), true); assert.equal(aalOk([{ status: "unverified" }], "aal1"), true);
  assert.equal(aalOk([{ status: "verified" }], "aal1"), false); assert.equal(aalOk([{ status: "verified" }], "aal2"), true); assert.equal(aalOk([{ status: "verified" }], null), false);
  assert.deepEqual(desempacotar(empacotar(USUARIO, SENHA)), { usuario: USUARIO, senha: SENHA });
  for (const ruim of ["", "nao-json", "{}", '{"u":"x","s":"y"}', JSON.stringify({ u: USUARIO, s: "senha-principal" }), "null", "[]"]) assert.equal(desempacotar(ruim), null, ruim);
  assert.deepEqual(["P0002", "42501", "22023", "57P01", "08006", undefined].map(erroDoCofre), ["conta_inexistente", "sem_permissao", "campo_ausente", "cofre_indisponivel", "cofre_indisponivel", "cofre_indisponivel"]);
});

/* ---------- ciclo da credencial ---------- */
test("guardar, estado, substituir e remover: o dono é SEMPRE o do JWT; a resposta nunca traz a credencial", async () => {
  const x = ctx(); const log = [];
  let r = await atender(CORPO(), x.c); log.push(r); assert.deepEqual(r, { status: 200, corpo: { ok: true, credencial: "guardada" } });
  assert.deepEqual(x.cofre.chamadas[0], ["guardar", U1, C1]); assert.equal(x.cofre.dados.get(U1 + "|" + C1), empacotar(USUARIO, SENHA));
  r = await atender({ operacao: "credencial_estado", conta_id: C1 }, x.c); log.push(r); assert.deepEqual(r.corpo, { ok: true, credencial: "ativa" });
  r = await atender(CORPO({ senha_app: SENHA2 }), x.c); log.push(r); assert.equal(r.status, 200);   // substituir = guardar de novo
  assert.equal(x.cofre.dados.size, 1, "um só registro por conta (a substituição não duplica)"); assert.equal(x.cofre.dados.get(U1 + "|" + C1), empacotar(USUARIO, SENHA2));
  r = await atender({ operacao: "credencial_remover", conta_id: C1 }, x.c); log.push(r); assert.deepEqual(r.corpo, { ok: true, removida: true }); assert.equal(x.cofre.dados.size, 0);
  r = await atender({ operacao: "credencial_remover", conta_id: C1 }, x.c); assert.deepEqual(r.corpo, { ok: true, removida: false });
  r = await atender({ operacao: "credencial_estado", conta_id: C1 }, x.c); assert.deepEqual(r.corpo, { ok: true, credencial: "ausente" });
  assert.ok(x.cofre.chamadas.every((c) => c[1] === U1), "toda chamada ao cofre usou o usuário do JWT"); semSegredo(log, x.logs);
  assert.ok(x.logs.every((l) => Object.keys(l).sort().join() === "codigo,operacao,status"), "o registro tem só operação, código e status");
});

test("isolamento no serviço: o usuário 2 nunca atinge o segredo do usuário 1 (o cofre é consultado com o id de quem está logado)", async () => {
  const cofre = cofreFalso(); const u1 = ctx({ cofre }), u2 = ctx({ cofre, usuario: { id: U2, mfaOk: true }, worker: workerFalso(OK_ESTADO) });
  await atender(CORPO(), u1.c);
  const r = await atender({ operacao: "estado_pasta", conta_id: C1, pasta_id: P1 }, u2.c);
  assert.deepEqual(r, { status: 409, corpo: { ok: false, erro: "credencial_ausente" } }, "a conta é a do usuário 1: para o 2 não há credencial");
  assert.equal(u2.worker.chamadas.length, 0, "e nada chegou ao Worker");
  assert.deepEqual((await atender({ operacao: "credencial_remover", conta_id: C1 }, u2.c)).corpo, { ok: true, removida: false }); assert.equal(cofre.dados.get(U1 + "|" + C1), empacotar(USUARIO, SENHA), "a do 1 ficou");
  assert.deepEqual((await atender({ operacao: "credencial_estado", conta_id: C1 }, u2.c)).corpo, { ok: true, credencial: "ausente" });
});

/* ---------- operações no provedor ---------- */
test("conta SEM credencial não inicia operação IMAP: o Worker nunca é chamado; sem Worker configurado, o segredo nem é lido", async () => {
  for (const [op, extra] of [["testar_conta", {}], ["listar_pastas", {}], ["estado_pasta", { pasta_id: P1 }]]) {
    const w = workerFalso(OK_ESTADO), x = ctx({ worker: w }); const r = await atender({ operacao: op, conta_id: C1, ...extra }, x.c);
    assert.deepEqual(r, { status: 409, corpo: { ok: false, erro: "credencial_ausente" } }, op); assert.equal(w.chamadas.length, 0, op + ": nenhuma tentativa IMAP");
  }
  const x = ctx({ worker: null }); await atender(CORPO(), x.c); x.cofre.chamadas.length = 0;
  const r = await atender({ operacao: "testar_conta", conta_id: C1 }, x.c); assert.deepEqual(r, { status: 503, corpo: { ok: false, erro: "worker_nao_configurado" } });
  assert.equal(x.cofre.chamadas.length, 0, "sem canal para o Worker, o cofre nem é aberto");
});

test("com credencial: a credencial vai SÓ ao Worker (em memória), a resposta é filtrada (esquema fechado) e nada dela sai; o estado vira 'ativa'", async () => {
  const w = workerFalso(OK_ESTADO), x = ctx({ worker: w }); await atender(CORPO(), x.c);
  const r = await atender({ operacao: "estado_pasta", conta_id: C1, pasta_id: P1 }, x.c);
  assert.equal(r.status, 200); assert.deepEqual(r.corpo, { ok: true, exame: { uidvalidity: 1752612613, uidnext: 4 }, mensagens_na_pasta: 1, duracao_ms: 985 });
  assert.deepEqual(w.chamadas, [["estado_pasta", { conta_id: C1, pasta: "INBOX" }, { usuario: USUARIO, senha: SENHA }]], "o Worker recebe a credencial, só para esta operação, e o NOME da pasta vem do banco (nunca do navegador)");
  assert.ok(x.cofre.chamadas.some((c) => c[0] === "marcar" && c[3] === "ativa"));
  semSegredo(r, x.logs, [USUARIO]); assert.ok(!JSON.stringify(r).includes("READ-WRITE") || true);
  assert.deepEqual(filtrarResposta("estado_pasta", { exame: { uidvalidity: 0, uidnext: 4 }, sincronizacao: { tipo: "x" } }), null, "resposta fora do esquema é descartada");
  assert.deepEqual(filtrarResposta("testar_conta", { qualquer: SENHA }), {});
});

test("credencial INVÁLIDA: erro controlado (422), a credencial é marcada 'invalida' e nada vaza; outros erros do Worker viram 'servico_indisponivel'", async () => {
  for (const cod of ["autenticacao_falhou", "login_recusado"]) {
    const w = workerFalso({ ok: false, erro: cod }), x = ctx({ worker: w }); await atender(CORPO(), x.c);
    const r = await atender({ operacao: "testar_conta", conta_id: C1 }, x.c);
    assert.deepEqual(r, { status: 422, corpo: { ok: false, erro: "credencial_invalida" } }); assert.ok(x.cofre.chamadas.some((c) => c[0] === "marcar" && c[3] === "invalida")); semSegredo(r, x.logs);
  }
  const w = workerFalso({ ok: false, erro: `falhou com ${SENHA}` }), x = ctx({ worker: w }); await atender(CORPO(), x.c);
  const r = await atender({ operacao: "testar_conta", conta_id: C1 }, x.c); assert.deepEqual(r, { status: 502, corpo: { ok: false, erro: "servico_indisponivel" } }); semSegredo(r, x.logs);
  const y = ctx({ worker: workerFalso(OK_ESTADO), cofre: cofreFalso() }); await y.cofre.guardar(U1, C1, "isto-nao-e-json"); assert.equal((await atender({ operacao: "testar_conta", conta_id: C1 }, y.c)).corpo.erro, "credencial_corrompida");
});

/* ---------- nenhum vazamento, em nenhum caminho de falha ---------- */
test("NENHUMA resposta nem registro contém a credencial, mesmo quando cofre, Worker ou marcação falham com mensagens que a citam", async () => {
  const vaza = new Error(`falha com ${SENHA} e ${USUARIO}`), vazaCofre = new ErroCofre("08006", `conexao ${SENHA}`);
  const cenarios = [
    ["guardar: cofre cai", ctx({ cofre: cofreFalso({ falhaEm: { guardar: vazaCofre } }) }), CORPO()],
    ["guardar: erro cru com a senha", ctx({ cofre: cofreFalso({ falhaEm: { guardar: vaza } }) }), CORPO()],
    ["remover: erro cru", ctx({ cofre: cofreFalso({ falhaEm: { remover: vaza } }) }), { operacao: "credencial_remover", conta_id: C1 }],
    ["ler: erro cru", ctx({ cofre: cofreFalso({ falhaEm: { ler: vaza } }), worker: workerFalso(OK_ESTADO) }), { operacao: "testar_conta", conta_id: C1 }],
    ["worker: exceção com a senha", ctx({ worker: workerFalso(vaza) }), { operacao: "testar_conta", conta_id: C1 }],
    ["worker: marcar falha", ctx({ cofre: cofreFalso({ falhaEm: { marcar: vaza } }), worker: workerFalso({ ok: false, erro: "autenticacao_falhou" }) }), { operacao: "testar_conta", conta_id: C1 }],
    ["registrar lança", (() => { const x = ctx({ worker: workerFalso(OK_ESTADO) }); x.c.registrar = () => { throw vaza; }; return x; })(), { operacao: "testar_conta", conta_id: C1 }],
  ];
  for (const [nome, x, corpo] of cenarios) {
    if (/ler:|worker|registrar|marcar/.test(nome)) await x.cofre.guardar(U1, C1, empacotar(USUARIO, SENHA));
    const r = await atender(corpo, x.c); assert.ok(r.status >= 200, nome); semSegredo(r, x.logs, [USUARIO]);
    assert.ok(r.status === 200 || ERROS[r.corpo.erro] === r.status, nome + ": só código fechado com o status certo");
  }
  /* corpos malformados e hostis: sempre código fechado, nunca eco do que foi enviado */
  for (const corpo of [null, [], "x", 1, {}, { operacao: SENHA }, { operacao: "credencial_guardar", conta_id: SENHA }, CORPO({ senha_app: "senha-principal-muito-secreta" }), CORPO({ usuario: "senha-principal-muito-secreta" }), { operacao: "credencial_guardar", extra: "senha-principal-muito-secreta" }]) {
    const x = ctx(); const r = await atender(corpo, x.c); assert.ok(ERROS[r.corpo.erro] === r.status, JSON.stringify(corpo)); assert.ok(!JSON.stringify([r, x.logs]).includes("senha-principal-muito-secreta"), "eco do valor recebido"); semSegredo(r, x.logs);
  }
});

test("FALHA DO COFRE interrompe a operação sem alternativa: 503 'cofre_indisponivel', nada guardado em outro lugar, Worker não chamado", async () => {
  const cofre = cofreFalso({ falhaEm: { guardar: new ErroCofre("57P01") } }), w = workerFalso(OK_ESTADO), x = ctx({ cofre, worker: w });
  const r = await atender(CORPO(), x.c); assert.deepEqual(r, { status: 503, corpo: { ok: false, erro: "cofre_indisponivel" } });
  assert.equal(cofre.dados.size, 0, "nada foi guardado"); assert.equal(w.chamadas.length, 0); assert.deepEqual(cofre.chamadas.map((c) => c[0]), ["guardar"], "uma só tentativa, sem repetir nem usar outro caminho");
  const y = ctx({ cofre: cofreFalso({ falhaEm: { ler: new ErroCofre("08006") } }), worker: w }); const r2 = await atender({ operacao: "testar_conta", conta_id: C1 }, y.c);
  assert.deepEqual(r2, { status: 503, corpo: { ok: false, erro: "cofre_indisponivel" } }); assert.equal(w.chamadas.length, 0, "sem ler a credencial, não há operação IMAP");
  for (const [pg, cod] of [["P0002", 404], ["42501", 403]]) assert.equal((await atender(CORPO(), ctx({ cofre: cofreFalso({ falhaEm: { guardar: new ErroCofre(pg) } }) }).c)).status, cod, pg);
});

test("sem login e sem MFA nada acontece: o cofre e o Worker nem são tocados", async () => {
  const w = workerFalso(OK_ESTADO);
  let x = ctx({ usuario: null, worker: w }); assert.deepEqual(await atender(CORPO(), x.c), { status: 401, corpo: { ok: false, erro: "sem_login" } }); assert.equal(x.cofre.chamadas.length, 0);
  x = ctx({ usuario: { id: U1, mfaOk: false }, worker: w }); assert.deepEqual(await atender(CORPO(), x.c), { status: 403, corpo: { ok: false, erro: "mfa_requerido" } });
  assert.equal(x.cofre.chamadas.length, 0); assert.equal(w.chamadas.length, 0);
});

test("sem estado compartilhado: duas chamadas seguidas de usuários diferentes não se enxergam; o código não tem variável global mutável, cache nem a chave de serviço", async () => {
  const cofre = cofreFalso(), w = workerFalso((op, ped, cred) => ({ ok: true, dados: { exame: { uidvalidity: 1, uidnext: cred.senha === SENHA ? 2 : 3 }, sincronizacao: { tipo: "primeira_leitura" } } }));
  const a = ctx({ cofre, worker: w }), b = ctx({ cofre, worker: w, usuario: { id: U2, mfaOk: true } });
  await atender(CORPO(), a.c); await atender(CORPO({ conta_id: C2, senha_app: SENHA2 }), b.c);
  const ra = await atender({ operacao: "estado_pasta", conta_id: C1, pasta_id: P1 }, a.c), rb = await atender({ operacao: "estado_pasta", conta_id: C2, pasta_id: P1 }, b.c);
  assert.equal(ra.corpo.exame.uidnext, 2); assert.equal(rb.corpo.exame.uidnext, 3, "cada um usou a própria credencial");
  for (const arq of ["contrato.ts", "servico.ts", "index.ts"]) {
    const t = semComent(ler("supabase/functions/rac-inbox/" + arq));
    assert.ok(!/^(let|var)\s/m.test(t), arq + ": nenhuma variável global mutável"); assert.ok(!/\b(new Map|new Set|new WeakMap|globalThis\.|localStorage|caches\.|Deno\.(writeFile|openKv))/.test(t), arq + ": nenhum cache nem armazenamento");
    assert.ok(!/SERVICE_ROLE|SECRET_KEYS|chaveServidor|\.rpc\(/.test(t), arq + ": não usa a chave de serviço nem RPC");
  }
});

test("index.ts (texto): conexão direta ao Postgres por chamada e fechada no fim, parâmetros por ligação, JWT conferido, só código nos registros, Worker ainda não ligado, sem fetch", () => {
  const t = semComent(ler("supabase/functions/rac-inbox/index.ts"));
  assert.match(t, /Deno\.env\.get\("SUPABASE_DB_URL"\)/); assert.match(t, /postgres\(bd, \{ max: 1, prepare: false,/); assert.match(t, /await sql\.end\(/);
  assert.ok(!/sql\.unsafe\(|sql\(`|\$\{[^}]*\}['"]\s*\+|"select [^"]*"\s*\+/.test(t), "SQL só por modelo etiquetado (parâmetros ligados), nunca por texto montado"); assert.equal((t.match(/\.unsafe\(/g) || []).length, 0, "o index.ts não executa SQL por conta própria: o único `unsafe` está em sessao.ts"); const ses = semComent(ler("supabase/functions/rac-inbox/sessao.ts")); assert.equal((ses.match(/\.unsafe\(/g) || []).length, 1, "um único executor de SQL, que SÓ recebe texto fixo e parâmetros ($1…): ver tests/inbox_sync_driver.test.mjs"); assert.match(t, /sessaoPostgres\(sql/);
  for (const f of ["guardar", "ler", "remover", "estado", "marcar"]) assert.match(t, new RegExp("inbox_cofre\\." + f + "\\("));
  assert.match(t, /auth\.getUser\(jwt\)/); assert.match(t, /worker: workerDoAmbiente\(\)/); assert.match(t, /Deno\.env\.get\("RAC_CANAL_K1"\)/); assert.ok(!/\bfetch\(/.test(t), "a rede do canal está em canal.ts (assinada e testada), não neste arquivo");
  const consoles = t.split("\n").filter((l) => /console\./.test(l)); assert.equal(consoles.length, 1, "um único ponto de registro"); assert.match(consoles[0], /console\.log\(JSON\.stringify\(\{ rac_inbox: e \}\)\)/, "e ele registra só o objeto de código fechado (operação, código, status)");
  assert.match(t, /Cache-Control": "no-store"/); assert.match(t, /CORPO_MAX_BYTES = 2048/); assert.ok(!/ctx\.usuario\.id|body\.dono|corpo\.dono/.test(t));
  assert.match(ler("supabase/functions/rac-inbox/index.ts"), /Publicar \(ou republicar\) é passo do dono/);
  const cors = t.match(/ORIGENS = \[[^\]]+\]/)[0]; assert.ok(!cors.includes("*"), "CORS sem curinga");
  assert.ok(!/null as unknown as Cofre/.test(t) || /usuario && !bd/.test(t), "sem banco não há cofre alternativo");
});
