// RAC Inbox · I3.2 · o serviço do GERENCIAMENTO de mensagens (supabase/functions/rac-inbox/organizar.ts + contrato.ts + servico.ts). TUDO SIMULADO: o Worker, o cofre e o banco são de mentira e REGISTRAM cada chamada.
// Prova: validação fechada, destinos vindos do banco (nunca do navegador), conta/dono/pasta conferidos, uma operação por vez, falha definitiva ≠ resposta incerta, verificação do estado real SEM repetir a alteração,
// cache só depois da confirmação, e que a credencial nunca sai. NÃO prova o iCloud real, o runtime do Deno nem o PostgreSQL (o SQL é de tests/inbox_organizar_sql.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { validarPedido, ERROS, ACOES_ORGANIZAR, VERSAO_FUNCAO } from "../supabase/functions/rac-inbox/contrato.ts";
import { atender } from "../supabase/functions/rac-inbox/servico.ts";
import { empacotar } from "../supabase/functions/rac-inbox/contrato.ts";

const U1 = "11111111-1111-4111-8111-111111111111", C1 = "aaaaaaaa-0000-4000-8000-000000000001", ENT = "bbbbbbbb-0000-4000-8000-000000000001", ARQ = "bbbbbbbb-0000-4000-8000-000000000002", LIX = "bbbbbbbb-0000-4000-8000-000000000003",
  SPM = "bbbbbbbb-0000-4000-8000-000000000004", PRJ = "bbbbbbbb-0000-4000-8000-000000000005", MSG = "dddddddd-0000-4000-8000-000000000001";
const USUARIO = "a@icloud.example", SENHA = "aaaa-bbbb-cccc-dddd";
const PASTAS = { [ENT]: { id: ENT, nome_externo: "INBOX", uso: "entrada" }, [ARQ]: { id: ARQ, nome_externo: "Archive", uso: "arquivo" }, [LIX]: { id: LIX, nome_externo: "Deleted Messages", uso: "lixo" }, [SPM]: { id: SPM, nome_externo: "Junk", uso: "spam" }, [PRJ]: { id: PRJ, nome_externo: "Projetos", uso: "outra" } };
const PED = (acao, extra = {}) => ({ operacao: "organizar_mensagem", conta_id: C1, pasta_id: ENT, uid: 7, acao, ...extra });

function cofreFalso({ ler = true } = {}) { const chamadas = []; return { chamadas, async guardar() {}, async ler(d, c) { chamadas.push(["ler", d, c]); return ler ? empacotar(USUARIO, SENHA) : null; }, async remover() { return true; }, async estado() { return "ativa"; }, async marcar(d, c, e) { chamadas.push(["marcar", d, c, e]); } }; }
function bancoFalso({ ref = {}, cursor = { uidvalidity: 700, uidnext: 8 }, travar = true, falhaAplicar = null, pastas = PASTAS, semMetodos = false, donoDaConta = U1 } = {}) {
  const log = [], aplicados = [];
  const b = { log, aplicados,
    async pasta(d, c, id) { return pastas[id] ? { id, nome_externo: pastas[id].nome_externo } : null; },
    async pastaDetalhe(d, c, id) { log.push(["pastaDetalhe", d, c, id]); return d === donoDaConta && c === C1 && pastas[id] ? { ...pastas[id] } : null; },   // dono e conta conferidos NO banco
    async pastaPorUso(d, c, uso) { log.push(["pastaPorUso", uso]); return Object.values(pastas).find((p) => p.uso === uso) || null; },
    async mensagemRef(d, c, pastaId, uid) { log.push(["mensagemRef", d, c, pastaId, uid]); return d === donoDaConta && pastaId === ENT && uid === 7 ? { id: MSG, uid: 7, uidvalidity: 700, message_id: "<m7@exemplo.com>", tamanho: 1007, lida: false, ...ref } : null; },
    async estadoSync() { return cursor; },
    async travar(c) { log.push(["travar", c]); return travar; }, async destravar(c) { log.push(["destravar", c]); },
    async aplicarOrganizacao(d, c, a) { log.push(["aplicarOrganizacao", d, c]); if (falhaAplicar) throw falhaAplicar; aplicados.push(a); },
    async estadoConta(d, c, e, er) { log.push(["estadoConta", e, er]); }, async salvarPastas() { return []; }, async aplicarSync() { return {}; }, async falhaSync() {} };
  if (semMetodos) { delete b.pastaDetalhe; delete b.mensagemRef; delete b.aplicarOrganizacao; }
  return b;
}
function workerFalso(respostas) {   // respostas: { marcar_lida, mover_mensagem, verificar_mensagem } = valor, Error, ou função (ped) => valor
  const chamadas = [];
  return { chamadas, async executar(op, ped, cred) { chamadas.push([op, ped, cred === null ? null : { ...cred }]); let r = respostas[op]; if (typeof r === "function") r = r(ped); if (r instanceof Error) throw r; return r; } };
}
function ctx({ worker, banco = bancoFalso(), cofre = cofreFalso(), usuario = { id: U1, mfaOk: true } } = {}) { const logs = []; return { c: { usuario, cofre, banco, worker, registrar: (e) => logs.push(e) }, logs, cofre, banco, worker }; }
const semSegredo = (r, logs) => { const t = JSON.stringify([r, logs]); for (const s of [SENHA, "aaaa-bbbb", USUARIO]) assert.ok(!t.includes(s), "vazou: " + s); };
const ok = (dados) => ({ ok: true, dados }), er = (erro) => ({ ok: false, erro });
const chamadasDe = (w, op) => w.chamadas.filter((x) => x[0] === op);
const nadaGravado = (banco) => assert.equal(banco.aplicados.length, 0, "o cache não mudou");

/* ---------- contrato ---------- */
test("validarPedido: esquema fechado; só as sete ações; destino só em 'mover' e só como UUID; nenhum nome de pasta nem comando vem do navegador", () => {
  assert.equal(VERSAO_FUNCAO, "rac-inbox@i4.3"); assert.deepEqual([...ACOES_ORGANIZAR], ["marcar_lida", "marcar_nao_lida", "arquivar", "excluir", "spam", "nao_spam", "mover"]);
  for (const a of ACOES_ORGANIZAR) { const v = validarPedido(a === "mover" ? PED(a, { destino_pasta_id: ARQ }) : PED(a)); assert.equal(v.ok, true, a); assert.deepEqual(Object.keys(v.pedido).sort(), (a === "mover" ? ["acao", "conta_id", "destino_pasta_id", "operacao", "pasta_id", "uid"] : ["acao", "conta_id", "operacao", "pasta_id", "uid"]), a); }
  const ruim = [[PED("apagar_tudo"), "acao_invalida"], [PED("expunge"), "acao_invalida"], [PED(undefined), "acao_invalida"], [PED("mover"), "destino_invalido"], [PED("mover", { destino_pasta_id: "Archive" }), "destino_invalido"], [PED("arquivar", { destino_pasta_id: ARQ }), "campos_inesperados"],
    [PED("excluir", { destino_pasta_id: LIX }), "campos_inesperados"], [PED("marcar_lida", { uid: 0 }), "id_invalido"], [PED("marcar_lida", { uid: "7" }), "id_invalido"], [PED("marcar_lida", { uid: 4294967296 }), "id_invalido"], [PED("marcar_lida", { pasta_id: "INBOX" }), "id_invalido"],
    [PED("marcar_lida", { conta_id: "x" }), "id_invalido"], [PED("marcar_lida", { comando: "UID STORE 7 +FLAGS (\\Deleted)" }), "campos_inesperados"], [PED("marcar_lida", { pasta: "INBOX" }), "campos_inesperados"], [PED("marcar_lida", { senha: SENHA }), "campos_inesperados"]];
  for (const [c, erro] of ruim) assert.equal(validarPedido(c).erro, erro, JSON.stringify(c));
  for (const c of ["acao_invalida", "destino_invalido", "destino_ausente", "acao_indisponivel", "identidade_divergente", "acao_recusada", "acao_nao_aplicada", "acao_em_andamento", "pasta_somente_leitura", "confirmacao_ausente"]) assert.ok(ERROS[c] >= 400, c);
  assert.equal(ERROS.acao_incerta, 202, "incerto não é erro nem sucesso: 202 (a caixa PODE ter mudado)");
});

/* ---------- caminhos de sucesso ---------- */
test("marcar lida e não lida: o Worker recebe o nome da pasta, o UID, o UIDVALIDITY do cursor e a identidade (Message-ID e tamanho) vindos do BANCO; o cache só muda depois; resposta de esquema fechado", async () => {
  for (const [acao, lida] of [["marcar_lida", true], ["marcar_nao_lida", false]]) {
    const w = workerFalso({ marcar_lida: ok({ resultado: "aplicada", lida, duracao_ms: 12, qualquer: "coisa" }) }), a = ctx({ worker: w });
    const r = await atender(PED(acao), a.c);
    assert.deepEqual([r.status, r.corpo], [200, { ok: true, resultado: "aplicada", acao, cache: "atualizado", lida }], "esquema fechado: nada além disso");
    assert.deepEqual(w.chamadas, [["marcar_lida", { conta_id: C1, pasta: "INBOX", lida, uid: 7, uidvalidity_esperado: 700, message_id_esperado: "<m7@exemplo.com>", tamanho_esperado: 1007 }, { usuario: USUARIO, senha: SENHA }]]);
    assert.deepEqual(a.banco.aplicados, [{ tipo: "lida", mensagemId: MSG, pastaId: ENT, lida }]); semSegredo(r, a.logs);
    assert.deepEqual(a.banco.log.filter((l) => l[0] === "travar" || l[0] === "destravar").map((l) => l[0]), ["travar", "destravar"], "uma operação por vez, liberada no fim");
  }
  const j = workerFalso({ marcar_lida: ok({ resultado: "ja_estava", lida: true }) }), b = ctx({ worker: j }); const r = await atender(PED("marcar_lida"), b.c);
  assert.equal(r.corpo.resultado, "ja_estava"); assert.equal(b.banco.aplicados.length, 1, "o cache se alinha ao estado real do servidor");
});

test("arquivar, excluir, spam e não é spam: o destino é a pasta que o SERVIDOR identificou (uso do banco), nunca um nome do navegador; excluir = Lixeira; o cache recebe o UID novo", async () => {
  const casos = [["arquivar", ENT, "Archive", ARQ], ["excluir", ENT, "Deleted Messages", LIX], ["spam", ENT, "Junk", SPM], ["nao_spam", SPM, "INBOX", ENT]];
  for (const [acao, origem, nome, destId] of casos) {
    const banco = bancoFalso({ pastas: PASTAS }); banco.mensagemRef = async (d, c, p, u) => (p === origem && u === 7 ? { id: MSG, uid: 7, uidvalidity: 700, message_id: "<m7@exemplo.com>", tamanho: 1007, lida: false } : null);
    const w = workerFalso({ mover_mensagem: ok({ resultado: "aplicada", destino: { uidvalidity: 810, uid: 20 } }) }), a = ctx({ worker: w, banco });
    const r = await atender(PED(acao, { pasta_id: origem }), a.c);
    assert.deepEqual([r.status, r.corpo], [200, { ok: true, resultado: "aplicada", acao, cache: "atualizado", destino_pasta_id: destId }], acao);
    assert.deepEqual(w.chamadas.map((x) => [x[0], x[1].pasta, x[1].destino, x[1].uid, x[1].uidvalidity_esperado]), [["mover_mensagem", PASTAS[origem].nome_externo, nome, 7, 700]], acao);
    assert.deepEqual(banco.aplicados, [{ tipo: "mover", mensagemId: MSG, pastaId: origem, destinoPastaId: destId, destinoUidvalidity: 810, destinoUid: 20 }], acao); semSegredo(r, a.logs);
  }
  const w = workerFalso({ mover_mensagem: ok({ resultado: "aplicada" }) }), a = ctx({ worker: w }); const r = await atender(PED("mover", { destino_pasta_id: PRJ }), a.c);
  assert.deepEqual([r.status, r.corpo.destino_pasta_id, w.chamadas[0][1].destino], [200, PRJ, "Projetos"]);
  assert.deepEqual(a.banco.aplicados, [{ tipo: "mover", mensagemId: MSG, pastaId: ENT, destinoPastaId: PRJ, destinoUidvalidity: undefined, destinoUid: undefined }], "sem COPYUID: só sai da origem; a próxima sincronização traz o destino");
});

/* ---------- conferências ANTES do Worker ---------- */
test("destino inválido, ausente ou de outra conta/dono: nada vai ao Worker e nada muda (nem o cache)", async () => {
  const sem = async (corpo, bancoOpts, esperado, extraCtx = {}) => { const w = workerFalso({ mover_mensagem: ok({ resultado: "aplicada" }), marcar_lida: ok({ resultado: "aplicada", lida: true }) }), a = ctx({ worker: w, banco: bancoFalso(bancoOpts), ...extraCtx }); const r = await atender(corpo, a.c);
    assert.deepEqual([r.status, r.corpo], [ERROS[esperado], { ok: false, erro: esperado }], esperado + " " + corpo.acao); assert.equal(w.chamadas.length, 0, "o Worker nem foi chamado"); nadaGravado(a.banco); semSegredo(r, a.logs); return a; };
  await sem(PED("mover", { destino_pasta_id: ENT }), {}, "destino_invalido");                      // destino = origem
  await sem(PED("mover", { destino_pasta_id: "cccccccc-0000-4000-8000-0000000000ff" }), {}, "destino_invalido");   // pasta que não existe nesta conta
  const { [PRJ]: _x, ...semProjetos } = PASTAS; await sem(PED("mover", { destino_pasta_id: PRJ }), { pastas: semProjetos }, "destino_invalido");   // pasta inativa/não selecionável: o banco não a devolve
  const { [ARQ]: _a, ...semArquivo } = PASTAS; await sem(PED("arquivar"), { pastas: semArquivo }, "destino_ausente");   // o servidor não identificou o Arquivo: sem nome inventado
  const { [LIX]: _l, ...semLixeira } = PASTAS; await sem(PED("excluir"), { pastas: semLixeira }, "destino_ausente");
  const { [SPM]: _s, ...semSpam } = PASTAS; await sem(PED("spam"), { pastas: semSpam }, "destino_ausente");
  await sem(PED("nao_spam"), {}, "destino_invalido");                                              // não está no Spam
  await sem(PED("excluir", { pasta_id: LIX }), {}, "mensagem_inexistente");                        // (o banco não tem essa mensagem na Lixeira)
  const bLix = bancoFalso(); bLix.mensagemRef = async () => ({ id: MSG, uid: 7, uidvalidity: 700, message_id: null, tamanho: null, lida: false });
  const w = workerFalso({}), a = ctx({ worker: w, banco: bLix }); let r = await atender(PED("excluir", { pasta_id: LIX }), a.c); assert.equal(r.corpo.erro, "destino_invalido", "excluir o que já está na Lixeira não é oferecido (não há exclusão definitiva)"); assert.equal(w.chamadas.length, 0);
  r = await atender(PED("arquivar", { pasta_id: ARQ }), ctx({ worker: w, banco: bLix }).c); assert.equal(r.corpo.erro, "destino_invalido", "arquivar o que já está no Arquivo"); r = await atender(PED("spam", { pasta_id: SPM }), ctx({ worker: w, banco: bLix }).c); assert.equal(r.corpo.erro, "destino_invalido");
  assert.equal(w.chamadas.length, 0);
});

test("conta de outro dono, mensagem inexistente, pasta inexistente e UIDVALIDITY do cache diferente do cursor: recusados antes do Worker", async () => {
  for (const [bancoOpts, corpo, esperado] of [[{ donoDaConta: "99999999-9999-4999-8999-999999999999" }, PED("marcar_lida"), "pasta_inexistente"], [{}, PED("marcar_lida", { pasta_id: "cccccccc-0000-4000-8000-0000000000ff" }), "pasta_inexistente"],
    [{}, PED("marcar_lida", { uid: 8 }), "mensagem_inexistente"], [{ ref: { uidvalidity: 699 } }, PED("marcar_lida"), "uidvalidity_mudou"], [{ ref: { uidvalidity: null } }, PED("marcar_lida"), "uidvalidity_mudou"], [{ cursor: null }, PED("marcar_lida"), "uidvalidity_mudou"],
    [{ cursor: { uidvalidity: 701, uidnext: 3 } }, PED("marcar_lida"), "uidvalidity_mudou"]]) {
    const w = workerFalso({ marcar_lida: ok({ resultado: "aplicada", lida: true }) }), a = ctx({ worker: w, banco: bancoFalso(bancoOpts) }); const r = await atender(corpo, a.c);
    assert.deepEqual([r.corpo.erro, w.chamadas.length], [esperado, 0], esperado); nadaGravado(a.banco);
  }
});

test("sem login, sem MFA, sem Worker, sem banco, sem credencial guardada: nada acontece (a conta sem conexão válida nunca chega ao Worker)", async () => {
  const w = workerFalso({ marcar_lida: ok({ resultado: "aplicada", lida: true }) });
  let r = await atender(PED("marcar_lida"), ctx({ worker: w, usuario: null }).c); assert.deepEqual([r.status, r.corpo.erro], [401, "sem_login"]);
  r = await atender(PED("marcar_lida"), ctx({ worker: w, usuario: { id: U1, mfaOk: false } }).c); assert.deepEqual([r.status, r.corpo.erro], [403, "mfa_requerido"]);
  r = await atender(PED("marcar_lida"), ctx({ worker: null }).c); assert.equal(r.corpo.erro, "worker_nao_configurado");
  r = await atender(PED("marcar_lida"), ctx({ worker: w, banco: null }).c); assert.equal(r.corpo.erro, "banco_indisponivel");
  r = await atender(PED("marcar_lida"), ctx({ worker: w, banco: bancoFalso({ semMetodos: true }) }).c); assert.equal(r.corpo.erro, "banco_indisponivel", "banco sem o suporte ao gerenciamento: nada é alterado");
  const c = ctx({ worker: w, cofre: cofreFalso({ ler: false }) }); r = await atender(PED("marcar_lida"), c.c); assert.deepEqual([r.status, r.corpo.erro], [409, "credencial_ausente"]);
  assert.equal(w.chamadas.length, 0); nadaGravado(c.banco);
});

test("uma operação por vez por conta: travamento ocupado = 'acao_em_andamento' sem tocar o Worker; o travamento é liberado em sucesso e em falha", async () => {
  const w = workerFalso({ marcar_lida: ok({ resultado: "aplicada", lida: true }) }), a = ctx({ worker: w, banco: bancoFalso({ travar: false }) }); const r = await atender(PED("marcar_lida"), a.c);
  assert.deepEqual([r.status, r.corpo.erro, w.chamadas.length], [409, "acao_em_andamento", 0]); nadaGravado(a.banco);
  for (const resp of [ok({ resultado: "aplicada", lida: true }), er("acao_recusada")]) { const b = ctx({ worker: workerFalso({ marcar_lida: resp }) }); await atender(PED("marcar_lida"), b.c); assert.deepEqual(b.banco.log.filter((l) => l[0] === "destravar").length, 1); }
});

/* ---------- falhas DEFINITIVAS: a caixa não mudou ---------- */
test("falha de autenticação marca a credencial como inválida; canal recusado e códigos definitivos do Worker viram códigos fechados; em NENHUM deles o cache muda nem há verificação", async () => {
  const casos = [["autenticacao_recusada", "credencial_invalida"], ["assinatura_invalida", "canal_recusado"], ["replay", "canal_recusado"], ["uidvalidity_mudou", "uidvalidity_mudou"], ["mensagem_inexistente", "mensagem_inexistente"], ["pasta_inexistente", "pasta_inexistente"],
    ["pasta_invalida", "destino_invalido"], ["identidade_divergente", "identidade_divergente"], ["acao_indisponivel", "acao_indisponivel"], ["acao_recusada", "acao_recusada"], ["pasta_somente_leitura", "pasta_somente_leitura"], ["parametro_invalido", "acao_recusada"]];
  for (const [doWorker, esperado] of casos) {
    const w = workerFalso({ mover_mensagem: er(doWorker), marcar_lida: er(doWorker) }), a = ctx({ worker: w }); const r = await atender(PED("arquivar"), a.c);
    assert.deepEqual([r.status, r.corpo], [ERROS[esperado], { ok: false, erro: esperado }], doWorker); nadaGravado(a.banco); assert.equal(chamadasDe(w, "verificar_mensagem").length, 0, "falha definitiva não precisa verificar"); semSegredo(r, a.logs);
    if (doWorker === "autenticacao_recusada") assert.deepEqual(a.cofre.chamadas.filter((c) => c[0] === "marcar"), [["marcar", U1, C1, "invalida"]]);
  }
  const w2 = workerFalso({ marcar_lida: er("texto livre com " + SENHA) }), a2 = ctx({ worker: w2, worker2: null }); const r2 = await atender(PED("marcar_lida"), a2.c); semSegredo(r2, a2.logs);   // código desconhecido: vira incerto/verificação, nunca eco
});

/* ---------- resposta INCERTA: consultar o estado, nunca repetir ---------- */
test("resposta incerta (queda do canal, erro interno, resposta fora do esquema, acao_incerta, confirmacao_ausente): UMA chamada de alteração, depois a verificação do estado real; só então decide", async () => {
  const incertos = [er("acao_incerta"), er("confirmacao_ausente"), er("falha_interna"), er("falha_inesperada"), er("codigo_novo_desconhecido"), new Error("canal_falhou"), new Error("http_504"), ok({ resultado: "talvez" }), ok({ resultado: "aplicada", lida: false })];
  for (const incerto of incertos) {
    // (a) a verificação mostra que APLICOU: sucesso "verificada", cache atualizado
    let w = workerFalso({ marcar_lida: incerto, verificar_mensagem: ok({ existe: true, lida: true }) }), a = ctx({ worker: w }); let r = await atender(PED("marcar_lida"), a.c);
    assert.deepEqual([r.status, r.corpo], [200, { ok: true, resultado: "verificada", acao: "marcar_lida", cache: "atualizado", lida: true }], String(incerto.erro || incerto.message || JSON.stringify(incerto.dados)));
    assert.equal(chamadasDe(w, "marcar_lida").length, 1, "NUNCA repete a alteração"); assert.equal(chamadasDe(w, "verificar_mensagem").length, 1); assert.deepEqual(chamadasDe(w, "verificar_mensagem")[0][1], { conta_id: C1, pasta: "INBOX", uid: 7, uidvalidity_esperado: 700 }); semSegredo(r, a.logs);
    // (b) a verificação mostra que NÃO aplicou: erro claro, nada no cache
    w = workerFalso({ marcar_lida: incerto, verificar_mensagem: ok({ existe: true, lida: false }) }); a = ctx({ worker: w }); r = await atender(PED("marcar_lida"), a.c);
    assert.deepEqual([r.status, r.corpo.erro], [ERROS.acao_nao_aplicada, "acao_nao_aplicada"]); nadaGravado(a.banco); assert.equal(chamadasDe(w, "marcar_lida").length, 1);
  }
  // a mensagem sumiu; a verificação falhou; a verificação respondeu lixo; UIDVALIDITY mudou nesse meio tempo
  for (const [verif, esperado] of [[ok({ existe: false }), "mensagem_inexistente"], [er("conexao_falhou"), "acao_incerta"], [new Error("canal_falhou"), "acao_incerta"], [ok({ existe: "sim" }), "acao_incerta"], [ok({ existe: true }), "acao_incerta"], [er("uidvalidity_mudou"), "uidvalidity_mudou"]]) {
    const w = workerFalso({ marcar_lida: er("acao_incerta"), verificar_mensagem: verif }), a = ctx({ worker: w }); const r = await atender(PED("marcar_lida"), a.c);
    assert.deepEqual([r.corpo.erro, ERROS[r.corpo.erro]], [esperado, ERROS[esperado]]); nadaGravado(a.banco); assert.equal(chamadasDe(w, "marcar_lida").length, 1);
  }
  assert.equal(ERROS.acao_incerta, 202);
});

test("mover com resposta incerta: se a verificação mostra que a mensagem SAIU da origem, vale como feito (cache sem o UID novo); se ela continua lá, 'acao_nao_aplicada'; nunca um segundo UID MOVE", async () => {
  let w = workerFalso({ mover_mensagem: er("acao_incerta"), verificar_mensagem: ok({ existe: false }) }), a = ctx({ worker: w }); let r = await atender(PED("excluir"), a.c);
  assert.deepEqual([r.status, r.corpo], [200, { ok: true, resultado: "verificada", acao: "excluir", cache: "atualizado", destino_pasta_id: LIX }]);
  assert.deepEqual(a.banco.aplicados, [{ tipo: "mover", mensagemId: MSG, pastaId: ENT, destinoPastaId: LIX, destinoUidvalidity: undefined, destinoUid: undefined }]); assert.equal(chamadasDe(w, "mover_mensagem").length, 1);
  w = workerFalso({ mover_mensagem: new Error("canal_falhou"), verificar_mensagem: ok({ existe: true, lida: false }) }); a = ctx({ worker: w }); r = await atender(PED("arquivar"), a.c);
  assert.deepEqual([r.status, r.corpo.erro], [422, "acao_nao_aplicada"]); nadaGravado(a.banco); assert.equal(chamadasDe(w, "mover_mensagem").length, 1);
});

test("repetição da mesma operação: marcar de novo = 'ja_estava'; mover de novo = o servidor diz que a mensagem não está mais lá e NADA muda no cache pela segunda vez", async () => {
  const banco = bancoFalso(), w = workerFalso({ marcar_lida: ok({ resultado: "aplicada", lida: true }) }), a = ctx({ worker: w, banco });
  await atender(PED("marcar_lida"), a.c); w.chamadas.length = 0;
  const w2 = workerFalso({ marcar_lida: ok({ resultado: "ja_estava", lida: true }), mover_mensagem: er("mensagem_inexistente") }), a2 = ctx({ worker: w2, banco });
  let r = await atender(PED("marcar_lida"), a2.c); assert.equal(r.corpo.resultado, "ja_estava");
  const antes = banco.aplicados.length; r = await atender(PED("arquivar"), a2.c); assert.deepEqual([r.status, r.corpo.erro], [404, "mensagem_inexistente"]); assert.equal(banco.aplicados.length, antes, "a segunda tentativa não alterou o cache");
});

test("o servidor mudou mas o banco falhou ao gravar o cache: o resultado continua SUCESSO (com cache 'nao_atualizado' para o dono sincronizar), nunca 'falhou'; nada vaza", async () => {
  const w = workerFalso({ mover_mensagem: ok({ resultado: "aplicada", destino: { uidvalidity: 810, uid: 20 } }) }), a = ctx({ worker: w, banco: bancoFalso({ falhaAplicar: new Error("conexão caiu com " + SENHA) }) }); const r = await atender(PED("arquivar"), a.c);
  assert.deepEqual([r.status, r.corpo], [200, { ok: true, resultado: "aplicada", acao: "arquivar", cache: "nao_atualizado", destino_pasta_id: ARQ }]); semSegredo(r, a.logs);
});

test("identidade: sem Message-ID válido no cache só o tamanho confere; Message-ID com caracteres estranhos nunca vai ao Worker", async () => {
  for (const [ref, chaves] of [[{ message_id: null }, ["tamanho_esperado"]], [{ message_id: "tem espaço" }, ["tamanho_esperado"]], [{ message_id: "<a@b.c>", tamanho: null }, ["message_id_esperado"]], [{ message_id: null, tamanho: null }, []]]) {
    const w = workerFalso({ marcar_lida: ok({ resultado: "aplicada", lida: true }) }), a = ctx({ worker: w, banco: bancoFalso({ ref }) }); await atender(PED("marcar_lida"), a.c);
    assert.deepEqual(Object.keys(w.chamadas[0][1]).filter((k) => k.endsWith("_esperado") && k !== "uidvalidity_esperado").sort(), chaves.sort(), JSON.stringify(ref));
  }
});
