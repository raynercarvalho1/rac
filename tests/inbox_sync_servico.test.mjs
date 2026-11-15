// RAC Inbox · I2 · o serviço da sincronização e da leitura (supabase/functions/rac-inbox/servico.ts e sync.ts). TUDO SIMULADO: o Worker, o cofre e o banco são de mentira e REGISTRAM cada chamada.
// Prova o algoritmo (cursor, janela, buraco de UIDs, UIDVALIDITY, remoções), a concorrência por conta, a tradução dos códigos do Worker e que a credencial nunca sai.
// NÃO prova o iCloud real, o runtime do Deno nem o PostgreSQL (o SQL é de tests/inbox_sync_sql.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { validarPedido, ERROS, VERSAO_FUNCAO } from "../supabase/functions/rac-inbox/contrato.ts";
import { atender } from "../supabase/functions/rac-inbox/servico.ts";
import { compararSincronizacao, usoDoBanco, filtrarResumo, filtrarResumos, filtrarPastas, filtrarLeitura, filtrarAnexo, JANELA, PAGINA, MAX_PAGINAS } from "../supabase/functions/rac-inbox/sync.ts";
import { empacotar } from "../supabase/functions/rac-inbox/contrato.ts";

const U1 = "11111111-1111-4111-8111-111111111111", C1 = "aaaaaaaa-0000-4000-8000-000000000001", P1 = "bbbbbbbb-0000-4000-8000-000000000001";
const USUARIO = "a@icloud.example", SENHA = "aaaa-bbbb-cccc-dddd";
const PED = (op, extra = {}) => ({ operacao: op, conta_id: C1, ...extra });

function cofreFalso({ ler = true } = {}) {
  const chamadas = [];
  return { chamadas, async guardar() {}, async ler(d, c) { chamadas.push(["ler", d, c]); return ler ? empacotar(USUARIO, SENHA) : null; }, async remover() { return true; }, async estado() { return "ativa"; }, async marcar(d, c, e) { chamadas.push(["marcar", d, c, e]); } };
}
function bancoFalso({ estado = null, travar = true, pasta = "INBOX", falhaAplicar = null } = {}) {
  const log = [];
  return { log, aplicados: [],
    async pasta(d, c, id) { log.push(["pasta", d, c, id]); return pasta ? { id, nome_externo: pasta } : null; },
    async salvarPastas(d, c, lista) { log.push(["salvarPastas", d, c, lista]); return lista.filter((p) => p.selecionavel).map((p, i) => ({ id: "cccccccc-0000-4000-8000-00000000000" + i, nome_externo: p.nome, nome_exibicao: p.nome_exibicao, uso: p.uso })); },
    async estadoSync(d, c, id) { log.push(["estadoSync", d, c, id]); return estado; },
    async travar(c) { log.push(["travar", c]); return travar; }, async destravar(c) { log.push(["destravar", c]); },
    async aplicarSync(d, c, id, a) { log.push(["aplicarSync", d, c, id]); if (falhaAplicar) throw falhaAplicar; this.aplicados.push(a); return { novas: a.mensagens.length, atualizadas: 0, removidas: 0 }; },
    async falhaSync(d, c, id, e) { log.push(["falhaSync", d, c, id, e]); }, async estadoConta(d, c, e, er) { log.push(["estadoConta", d, c, e, er]); } };
}
function workerFalso(resp) { const chamadas = []; return { chamadas, async executar(op, ped, cred) { chamadas.push([op, ped, cred === null ? null : { ...cred }]); if (resp instanceof Error) throw resp; return typeof resp === "function" ? resp(op, ped, cred, chamadas.length) : resp; } }; }
function ctx({ worker, banco = bancoFalso(), cofre = cofreFalso(), usuario = { id: U1, mfaOk: true } } = {}) { const logs = []; return { c: { usuario, cofre, banco, worker, registrar: (e) => logs.push(e) }, logs, cofre, banco, worker }; }
const visivel = (r, logs) => JSON.stringify([r, logs]);
const semSegredo = (r, logs, extra = []) => { const t = visivel(r, logs); for (const s of [SENHA, "aaaa-bbbb", USUARIO, ...extra]) assert.ok(!t.includes(s), "vazou: " + s); };

const msg = (uid, extra = {}) => ({ uid, recebida: "2026-11-14T10:00:00.000Z", tamanho: 1000, lida: false, sinalizada: false, respondida: false, rascunho: false, de: { nome: "Ana", endereco: "ana@exemplo.com" }, para: [], cc: [], assunto: "Assunto " + uid, message_id: "<m" + uid + "@x>", tipo_conteudo: "text/plain", anexo_provavel: false, ...extra });
const faixa = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => msg(a + i));
const lista = (uidvalidity, uidnext, mensagens, total = mensagens.length, mais = false) => ({ ok: true, dados: { exame: { uidvalidity, uidnext }, mensagens_na_pasta: total, mensagens, mais, duracao_ms: 40 } });

/* ---------- peças puras ---------- */
test("sync.ts · decisão de cursor (a da P6), mapeamento de pastas e filtros de esquema fechado", () => {
  const at = (v, n) => ({ uidvalidity: v, uidnext: n });
  assert.equal(compararSincronizacao(at(7, 5), null), "primeira_leitura"); assert.equal(compararSincronizacao(at(7, 5), { uidvalidity: null, uidnext: null }), "primeira_leitura");
  assert.equal(compararSincronizacao(at(7, 5), { uidvalidity: 7, uidnext: 5 }), "sem_mudanca"); assert.equal(compararSincronizacao(at(7, 9), { uidvalidity: 7, uidnext: 5 }), "novas_mensagens");
  assert.equal(compararSincronizacao(at(8, 5), { uidvalidity: 7, uidnext: 5 }), "uidvalidity_mudou"); assert.equal(compararSincronizacao(at(7, 3), { uidvalidity: 7, uidnext: 5 }), "uidnext_regrediu");
  assert.deepEqual(["entrada", "enviados", "rascunhos", "lixeira", "spam", "arquivo", "todas", "sinalizadas", "xyz", undefined, 5].map(usoDoBanco), ["entrada", "enviados", "rascunhos", "lixo", "spam", "arquivo", "outra", "outra", "outra", "outra", "outra"]);
  assert.equal(filtrarResumo(msg(0)), null, "uid 0 não existe"); assert.equal(filtrarResumo(msg(4294967296)), null); assert.equal(filtrarResumo(msg(1, { assunto: "x".repeat(501) })), null);
  assert.equal(filtrarResumo(msg(1, { recebida: "ontem" })).recebida, null, "data fora do formato vira nula"); assert.equal(filtrarResumo(msg(1, { de: { nome: "x", endereco: "sem-arroba" } })).de, null);
  assert.deepEqual(Object.keys(filtrarResumo(msg(1, { senha: SENHA, corpo: "x" }))).sort(), ["anexo_provavel", "assunto", "de", "lida", "message_id", "para", "recebida", "respondida", "sinalizada", "tamanho", "uid"], "só os campos conhecidos");
  assert.equal(filtrarResumos([msg(1), { uid: "x" }]), null, "um item ruim invalida a lista"); assert.equal(filtrarResumos("nao"), null); assert.equal(filtrarResumos(faixa(1, 101)), null, "lista acima do limite");
  assert.equal(filtrarPastas([{ nome: "INBOX", nome_exibicao: "INBOX", uso: "entrada", selecionavel: true }])[0].uso, "entrada"); assert.equal(filtrarPastas([{ nome: "", nome_exibicao: "", uso: "x", selecionavel: true }]), null); assert.equal(filtrarPastas([{ nome: "A", nome_exibicao: "A", uso: "x" }]), null);
  assert.equal(filtrarLeitura({ mensagem: { ...msg(1), texto: "ok", formato: "html", truncado: false, anexos: [] } }), null, "formato desconhecido"); assert.equal(filtrarLeitura({ mensagem: { ...msg(1), texto: "x".repeat(65537), formato: "texto", anexos: [] } }), null);
  assert.equal(filtrarLeitura({ mensagem: { ...msg(1), texto: "ok", formato: "texto", anexos: [{ parte: "../2", nome: "a", tipo: "a/b", tamanho: 1, inline: false }] } }), null, "caminho de parte inválido");
  assert.equal(filtrarAnexo({ anexo: { nome: "a.pdf", tipo: "application/pdf", tamanho_bytes: 3, base64: "***" } }), null, "base64 inválido"); assert.ok(filtrarAnexo({ anexo: { nome: null, tipo: "a/b", tamanho_bytes: 3, base64: "QUJD" } }));
  assert.deepEqual([validarPedido(PED("ler_mensagem", { pasta_id: P1, uid: 0 })).erro, validarPedido(PED("ler_mensagem", { pasta_id: P1, uid: "7" })).erro, validarPedido(PED("baixar_anexo", { pasta_id: P1, uid: 7, parte: "../1" })).erro, validarPedido(PED("baixar_anexo", { pasta_id: P1, uid: 7 })).erro, validarPedido(PED("sincronizar_pasta", {})).erro],
    ["id_invalido", "id_invalido", "id_invalido", "campo_ausente", "campo_ausente"]);
  assert.equal(validarPedido(PED("baixar_anexo", { pasta_id: P1, uid: 7, parte: "1.2" })).ok, true); assert.equal(validarPedido(PED("sincronizar_pasta", { pasta_id: P1, nome: "INBOX" })).erro, "campos_inesperados", "o NOME da pasta nunca vem do navegador");
  for (const c of ["pasta_inexistente", "mensagem_inexistente", "parte_inexistente", "anexo_grande_demais", "uidvalidity_mudou", "sincronizacao_em_andamento", "canal_recusado", "banco_indisponivel"]) assert.ok(ERROS[c] >= 400, c);
});

/* ---------- a sincronização ---------- */
async function sincronizar(worker, opcoes = {}) { const x = ctx({ worker, ...opcoes }); const r = await atender(PED("sincronizar_pasta", { pasta_id: P1 }), x.c); return { r, x }; }

test("primeira leitura: uma chamada ao Worker (janela de 50), cursor guardado, nada removido além da janela, estados da conta e da credencial atualizados, travamento liberado", async () => {
  const w = workerFalso(lista(700, 6, faixa(1, 5)));
  const { r, x } = await sincronizar(w);
  assert.deepEqual(r, { status: 200, corpo: { ok: true, sincronizacao: { tipo: "primeira_leitura", novas: 5, atualizadas: 0, removidas: 0 }, mensagens_na_pasta: 5, mais: false } });
  assert.deepEqual(w.chamadas, [["listar_mensagens", { conta_id: C1, pasta: "INBOX", ultimas: JANELA }, { usuario: USUARIO, senha: SENHA }]], "o Worker recebe o NOME da pasta (do banco) e a credencial, só para esta operação");
  const a = x.banco.aplicados[0]; assert.deepEqual([a.uidvalidity, a.cursor, a.tipo, a.total, a.purgar, a.removerDe, a.removerAte, a.mensagens.map((m) => m.uid)], [700, 6, "primeira_leitura", 5, false, 1, 5, [5, 4, 3, 2, 1]]);
  assert.ok(x.cofre.chamadas.some((c) => c[0] === "marcar" && c[3] === "ativa")); assert.ok(x.banco.log.some((l) => l[0] === "estadoConta" && l[3] === "conectada" && l[4] === null));
  assert.deepEqual(x.banco.log.filter((l) => l[0] === "travar" || l[0] === "destravar").map((l) => l[0]), ["travar", "destravar"]); semSegredo(r, x.logs);
  assert.ok(!JSON.stringify(a).includes(SENHA), "nada da credencial vai ao banco");
});

test("sem mudança relê a janela (flags e remoções ficam em dia); novas dentro da janela contam como novas_mensagens com UMA chamada", async () => {
  let { r, x } = await sincronizar(workerFalso(lista(700, 6, faixa(1, 5))), { banco: bancoFalso({ estado: { uidvalidity: 700, uidnext: 6 } }) });
  assert.equal(r.corpo.sincronizacao.tipo, "sem_mudanca"); assert.equal(x.banco.aplicados.length, 1, "mesmo sem mudança a janela é regravada (idempotente)");
  const w = workerFalso(lista(700, 9, faixa(1, 8), 8)); ({ r, x } = await sincronizar(w, { banco: bancoFalso({ estado: { uidvalidity: 700, uidnext: 6 } }) }));
  assert.equal(r.corpo.sincronizacao.tipo, "novas_mensagens"); assert.equal(w.chamadas.length, 1); assert.equal(x.banco.aplicados[0].cursor, 9);
});

test("mais mensagens novas que a janela: busca desde o cursor em páginas; termina quando o Worker diz que acabou", async () => {
  const w = workerFalso((op, ped, c, n) => {
    if (n === 1) return lista(700, 401, faixa(351, 400), 400, true);                       // janela das últimas 50 (há mais antes)
    if (ped.desde_uid === 11) return lista(700, 401, faixa(11, 110), 400, true);           // 1ª página
    if (ped.desde_uid === 111) return lista(700, 401, faixa(111, 210), 400, true);
    if (ped.desde_uid === 211) return lista(700, 401, faixa(211, 310), 400, true);
    if (ped.desde_uid === 311) return lista(700, 401, faixa(311, 350), 400, false);        // acabou antes da janela
    throw new Error("chamada inesperada " + JSON.stringify(ped));
  });
  const { r, x } = await sincronizar(w, { banco: bancoFalso({ estado: { uidvalidity: 700, uidnext: 11 } }) });
  assert.equal(r.status, 200, JSON.stringify(r)); assert.deepEqual([r.corpo.sincronizacao.tipo, r.corpo.mais], ["novas_mensagens", false]);
  assert.deepEqual(w.chamadas.slice(1).map((c) => [c[1].desde_uid, c[1].limite, c[1].uidvalidity_esperado]), [[11, PAGINA, 700], [111, PAGINA, 700], [211, PAGINA, 700], [311, PAGINA, 700]], "páginas contíguas, sempre com o UIDVALIDITY esperado");
  const a = x.banco.aplicados[0]; assert.equal(a.cursor, 401, "chegou ao fim: o cursor vai ao UIDNEXT"); assert.equal(a.mensagens.length, 390, "10..350 + a janela 351..400, sem duplicar"); assert.equal(new Set(a.mensagens.map((m) => m.uid)).size, a.mensagens.length);
  assert.equal(a.removerDe, 351, "só a janela é conferida para remoção");
});

test("buraco grande demais para uma chamada: o cursor para onde chegou (não pula mensagens) e o resultado diz que há mais", async () => {
  const w = workerFalso((op, ped, c, n) => {
    if (n === 1) return lista(700, 2001, faixa(1951, 2000), 2000, true);
    const d = ped.desde_uid; return lista(700, 2001, faixa(d, d + PAGINA - 1), 2000, true);   // sempre "mais"
  });
  const { r, x } = await sincronizar(w, { banco: bancoFalso({ estado: { uidvalidity: 700, uidnext: 11 } }) });
  assert.equal(w.chamadas.length, 1 + MAX_PAGINAS, "no máximo " + MAX_PAGINAS + " páginas por chamada");
  assert.equal(x.banco.aplicados[0].cursor, 11 + MAX_PAGINAS * PAGINA, "continua de onde parou na próxima sincronização"); assert.equal(r.corpo.mais, true);
  assert.ok(x.banco.aplicados[0].cursor < 2001);
});

test("UIDVALIDITY mudou ou UIDNEXT regrediu: apaga o cache da pasta e relê; a faixa de remoção cobre a pasta inteira quando a janela cabe nela", async () => {
  for (const [estado, tipo] of [[{ uidvalidity: 111, uidnext: 6 }, "uidvalidity_mudou"], [{ uidvalidity: 700, uidnext: 50 }, "uidnext_regrediu"]]) {
    const { r, x } = await sincronizar(workerFalso(lista(700, 6, faixa(1, 5))), { banco: bancoFalso({ estado }) });
    assert.equal(r.corpo.sincronizacao.tipo, tipo); assert.equal(x.banco.aplicados[0].purgar, true, tipo + ": apaga e relê"); assert.equal(x.banco.aplicados[0].uidvalidity, 700);
  }
  const { x } = await sincronizar(workerFalso(lista(700, 401, faixa(351, 400), 400, true)), { banco: bancoFalso({ estado: { uidvalidity: 700, uidnext: 401 } }) });
  assert.equal(x.banco.aplicados[0].removerDe, 351, "janela parcial: só ela é conferida");
});

test("códigos do Worker: recusa de login marca a credencial; os informativos passam; falha do canal vira canal_recusado; o resto vira servico_indisponivel e registra a falha", async () => {
  let { r, x } = await sincronizar(workerFalso({ ok: false, erro: "autenticacao_recusada" }));
  assert.deepEqual(r, { status: 422, corpo: { ok: false, erro: "credencial_invalida" } }); assert.ok(x.cofre.chamadas.some((c) => c[0] === "marcar" && c[3] === "invalida"));
  assert.ok(x.banco.log.some((l) => l[0] === "estadoConta" && l[3] === "erro_autenticacao")); assert.ok(!x.banco.log.some((l) => l[0] === "falhaSync"), "recusa de login não conta como falha de sincronização"); semSegredo(r, x.logs);
  for (const [cod, status, saida] of [["pasta_inexistente", 404, "pasta_inexistente"], ["uidvalidity_mudou", 409, "uidvalidity_mudou"], ["assinatura_invalida", 502, "canal_recusado"], ["replay", 502, "canal_recusado"], ["timeout", 502, "servico_indisponivel"], ["qualquer_coisa", 502, "servico_indisponivel"]]) {
    ({ r, x } = await sincronizar(workerFalso({ ok: false, erro: cod })));
    assert.deepEqual(r, { status, corpo: { ok: false, erro: saida } }, cod); assert.equal(x.banco.aplicados.length, 0, cod + ": nada gravado");
    assert.ok(x.banco.log.some((l) => l[0] === "falhaSync" && l[4] === saida), cod + ": a falha é registrada com o código fechado"); assert.ok(x.banco.log.some((l) => l[0] === "estadoConta" && l[3] === "atrasada"));
    assert.ok(x.banco.log.some((l) => l[0] === "destravar"), cod + ": o travamento é liberado mesmo na falha");
  }
  ({ r, x } = await sincronizar(workerFalso(new Error("ECONNRESET com " + SENHA + " " + USUARIO)))); assert.deepEqual(r, { status: 502, corpo: { ok: false, erro: "servico_indisponivel" } }); semSegredo(r, x.logs); assert.ok(x.banco.log.some((l) => l[0] === "falhaSync"));
  ({ r, x } = await sincronizar(workerFalso(lista(700, 6, [msg(1), { uid: "ruim" }])))); assert.equal(r.corpo.erro, "servico_indisponivel", "item fora do esquema invalida a resposta"); assert.equal(x.banco.aplicados.length, 0);
  ({ r, x } = await sincronizar(workerFalso({ ok: true, dados: { exame: { uidvalidity: 0, uidnext: 3 }, mensagens: [], mensagens_na_pasta: 0 } }))); assert.equal(r.corpo.erro, "servico_indisponivel", "exame fora do esquema");
  ({ r, x } = await sincronizar(workerFalso(lista(700, 6, faixa(1, 5))), { banco: bancoFalso({ falhaAplicar: new Error("duplicate key value violates unique constraint com " + SENHA) }) })); assert.deepEqual(r.corpo, { ok: false, erro: "servico_indisponivel" }); semSegredo(r, x.logs);
});

test("uma sincronização por conta: se já há uma em andamento, nada é lido (nem o cofre) nem chamado; pasta inexistente, sem credencial, sem banco e sem Worker têm código próprio", async () => {
  let w = workerFalso(lista(700, 6, faixa(1, 5))), x = ctx({ worker: w, banco: bancoFalso({ travar: false }) });
  let r = await atender(PED("sincronizar_pasta", { pasta_id: P1 }), x.c);
  assert.deepEqual(r, { status: 409, corpo: { ok: false, erro: "sincronizacao_em_andamento" } }); assert.equal(w.chamadas.length, 0); assert.equal(x.cofre.chamadas.length, 0, "o cofre nem foi aberto"); assert.ok(!x.banco.log.some((l) => l[0] === "destravar"), "quem não travou não destrava");
  w = workerFalso(lista(700, 6, faixa(1, 5))); x = ctx({ worker: w, banco: bancoFalso({ pasta: null }) }); r = await atender(PED("sincronizar_pasta", { pasta_id: P1 }), x.c);
  assert.deepEqual(r, { status: 404, corpo: { ok: false, erro: "pasta_inexistente" } }); assert.equal(w.chamadas.length, 0); assert.ok(x.banco.log.some((l) => l[0] === "destravar"));
  w = workerFalso(lista(700, 6, [])); x = ctx({ worker: w, cofre: cofreFalso({ ler: false }) }); r = await atender(PED("sincronizar_pasta", { pasta_id: P1 }), x.c); assert.deepEqual(r, { status: 409, corpo: { ok: false, erro: "credencial_ausente" } }); assert.equal(w.chamadas.length, 0);
  x = ctx({ worker: w, banco: null }); r = await atender(PED("sincronizar_pasta", { pasta_id: P1 }), x.c); assert.deepEqual(r, { status: 503, corpo: { ok: false, erro: "banco_indisponivel" } }); assert.equal(w.chamadas.length, 0);
  x = ctx({ worker: null }); r = await atender(PED("sincronizar_pasta", { pasta_id: P1 }), x.c); assert.deepEqual(r, { status: 503, corpo: { ok: false, erro: "worker_nao_configurado" } });
  x = ctx({ worker: w, usuario: null }); assert.equal((await atender(PED("sincronizar_pasta", { pasta_id: P1 }), x.c)).status, 401); x = ctx({ worker: w, usuario: { id: U1, mfaOk: false } }); assert.equal((await atender(PED("sincronizar_pasta", { pasta_id: P1 }), x.c)).status, 403);
  assert.equal(w.chamadas.length, 0, "sem login e sem MFA nada chega ao Worker");
  const x2 = ctx({ worker: workerFalso(lista(700, 6, faixa(1, 5))) }), [a, b] = await Promise.all([atender(PED("sincronizar_pasta", { pasta_id: P1 }), x2.c), atender(PED("sincronizar_pasta", { pasta_id: P1 }), x2.c)]);
  assert.deepEqual([a.status, b.status], [200, 200], "o banco falso sempre trava: a exclusão real entre conexões é validação do dono (advisory lock do PostgreSQL), não destes testes simulados");
});

/* ---------- listar pastas, ler mensagem, baixar anexo ---------- */
test("listar_pastas: o Worker lista, a função grava (uso no vocabulário do banco) e devolve só id, nome e uso", async () => {
  const w = workerFalso({ ok: true, dados: { duracao_ms: 5, pastas: [{ nome: "INBOX", nome_exibicao: "INBOX", uso: "entrada", selecionavel: true }, { nome: "Deleted Messages", nome_exibicao: "Deleted Messages", uso: "lixeira", selecionavel: true }, { nome: "Pai", nome_exibicao: "Pai", uso: "outra", selecionavel: false }] } });
  const x = ctx({ worker: w }), r = await atender(PED("listar_pastas"), x.c);
  assert.equal(r.status, 200); assert.deepEqual(r.corpo.pastas.map((p) => [p.nome, p.uso]), [["INBOX", "entrada"], ["Deleted Messages", "lixo"]]); assert.ok(r.corpo.pastas.every((p) => /^[0-9a-f-]{36}$/.test(p.id)));
  assert.deepEqual(x.banco.log.find((l) => l[0] === "salvarPastas")[3].map((p) => [p.nome, p.uso, p.selecionavel]), [["INBOX", "entrada", true], ["Deleted Messages", "lixo", true], ["Pai", "outra", false]]); semSegredo(r, x.logs);
  assert.equal((await atender(PED("listar_pastas"), ctx({ worker: workerFalso({ ok: true, dados: { pastas: "nao" } }) }).c)).corpo.erro, "servico_indisponivel");
});

const LEITURA = { ok: true, dados: { exame: { uidvalidity: 700, uidnext: 6 }, mensagem: { ...msg(4), texto: "Olá!\nTexto do e-mail.", formato: "texto", truncado: false, anexos: [{ parte: "2", nome: "relatório.pdf", tipo: "application/pdf", tamanho: 24, inline: false, extra: "x" }], senha: SENHA } } };
test("ler_mensagem: o UIDVALIDITY esperado vem do cursor, a resposta é filtrada, NADA é gravado no banco e o corpo não passa por ele", async () => {
  const w = workerFalso(LEITURA), x = ctx({ worker: w, banco: bancoFalso({ estado: { uidvalidity: 700, uidnext: 6 } }) });
  const r = await atender(PED("ler_mensagem", { pasta_id: P1, uid: 4 }), x.c);
  assert.equal(r.status, 200); assert.equal(r.corpo.mensagem.texto, "Olá!\nTexto do e-mail."); assert.deepEqual(r.corpo.mensagem.anexos, [{ parte: "2", nome: "relatório.pdf", tipo: "application/pdf", tamanho: 24, inline: false }], "só os campos conhecidos");
  assert.ok(!JSON.stringify(r).includes(SENHA) && !("senha" in r.corpo.mensagem) && !("exame" in r.corpo));
  assert.deepEqual(w.chamadas[0][1], { conta_id: C1, pasta: "INBOX", uid: 4, uidvalidity_esperado: 700 }); assert.ok(!x.banco.log.some((l) => l[0] === "aplicarSync" || l[0] === "salvarPastas"), "leitura sob demanda: nada gravado");
  assert.ok(!x.banco.log.some((l) => l[0] === "travar"), "ler não trava a sincronização");
  for (const [cod, status, saida] of [["mensagem_inexistente", 404, "mensagem_inexistente"], ["uidvalidity_mudou", 409, "uidvalidity_mudou"], ["autenticacao_recusada", 422, "credencial_invalida"]]) assert.deepEqual((await atender(PED("ler_mensagem", { pasta_id: P1, uid: 4 }), ctx({ worker: workerFalso({ ok: false, erro: cod }) }).c)), { status, corpo: { ok: false, erro: saida } });
  assert.equal((await atender(PED("ler_mensagem", { pasta_id: P1, uid: 4 }), ctx({ worker: workerFalso({ ok: true, dados: { mensagem: { ...msg(4), texto: 5, formato: "texto", anexos: [] } } }) }).c)).corpo.erro, "servico_indisponivel");
  assert.equal((await atender(PED("ler_mensagem", { pasta_id: P1, uid: 4 }), ctx({ worker: workerFalso(LEITURA), banco: bancoFalso({ pasta: null }) }).c)).corpo.erro, "pasta_inexistente");
});

test("baixar_anexo: a parte e o UID vão ao Worker; resposta só com nome, tipo, tamanho e base64 válido; anexo grande é recusado pelo código do Worker", async () => {
  const w = workerFalso({ ok: true, dados: { anexo: { nome: "relatório.pdf", tipo: "application/pdf", tamanho_bytes: 3, base64: "QUJD", senha: SENHA } } }), x = ctx({ worker: w, banco: bancoFalso({ estado: { uidvalidity: 700, uidnext: 6 } }) });
  const r = await atender(PED("baixar_anexo", { pasta_id: P1, uid: 4, parte: "2" }), x.c);
  assert.deepEqual(r, { status: 200, corpo: { ok: true, anexo: { nome: "relatório.pdf", tipo: "application/pdf", tamanho_bytes: 3, base64: "QUJD" } } });
  assert.deepEqual(w.chamadas[0][1], { conta_id: C1, pasta: "INBOX", uid: 4, parte: "2", uidvalidity_esperado: 700 }); assert.ok(!JSON.stringify(r).includes(SENHA));
  assert.deepEqual((await atender(PED("baixar_anexo", { pasta_id: P1, uid: 4, parte: "2" }), ctx({ worker: workerFalso({ ok: false, erro: "anexo_grande_demais" }) }).c)), { status: 413, corpo: { ok: false, erro: "anexo_grande_demais" } });
  assert.deepEqual((await atender(PED("baixar_anexo", { pasta_id: P1, uid: 4, parte: "2" }), ctx({ worker: workerFalso({ ok: true, dados: { anexo: { nome: "a", tipo: "a/b", tamanho_bytes: 3, base64: "<script>" } } }) }).c)).corpo, { ok: false, erro: "servico_indisponivel" });
});

test("estado_pasta e testar_conta continuam (sem sincronizar): testar_conta não precisa do banco; estado_pasta usa o nome da pasta do banco", async () => {
  const w = workerFalso({ ok: true, dados: { exame: { uidvalidity: 5, uidnext: 9 }, mensagens_na_pasta: 3, duracao_ms: 7 } });
  assert.deepEqual((await atender(PED("estado_pasta", { pasta_id: P1 }), ctx({ worker: w }).c)).corpo, { ok: true, exame: { uidvalidity: 5, uidnext: 9 }, mensagens_na_pasta: 3, duracao_ms: 7 }); assert.deepEqual(w.chamadas[0][1], { conta_id: C1, pasta: "INBOX" });
  const w2 = workerFalso({ ok: true, dados: { duracao_ms: 5 } }), x = ctx({ worker: w2, banco: null }); assert.deepEqual(await atender(PED("testar_conta"), x.c), { status: 200, corpo: { ok: true } });
});

/* ---------- testar_canal (ping) e diagnóstico ---------- */
test("testar_canal: prova o canal SEM Vault, SEM banco e SEM credencial; devolve o carimbo da função e do Worker; falhas viram códigos fechados com o detalhe só no registro", async () => {
  const PING = { ok: true, dados: { canal: "ok", worker: "rac-inbox-worker@p7.2" } };
  const w = workerFalso(PING), x = ctx({ worker: w, banco: null });
  const r = await atender({ operacao: "testar_canal" }, x.c);
  assert.deepEqual(r, { status: 200, corpo: { ok: true, canal: "ok", funcao: VERSAO_FUNCAO, worker: "rac-inbox-worker@p7.2" } });
  assert.match(VERSAO_FUNCAO, /^rac-inbox@i\d+\.\d+$/); assert.deepEqual(w.chamadas, [["ping", {}, null]], "o Worker recebe SÓ o ping, sem credencial e sem conta");
  assert.equal(x.cofre.chamadas.length, 0, "o Vault nem é aberto"); assert.deepEqual(x.logs, [{ operacao: "testar_canal", codigo: "ok", status: 200 }]); semSegredo(r, x.logs);
  assert.equal((await atender({ operacao: "testar_canal" }, ctx({ worker: null }).c)).corpo.erro, "worker_nao_configurado"); assert.equal((await atender({ operacao: "testar_canal" }, ctx({ worker: w, usuario: null }).c)).status, 401); assert.equal((await atender({ operacao: "testar_canal" }, ctx({ worker: w, usuario: { id: U1, mfaOk: false } }).c)).status, 403);
  assert.equal(validarPedido({ operacao: "testar_canal", conta_id: C1 }).erro, "campos_inesperados", "o ping não leva conta"); assert.equal(validarPedido({ operacao: "testar_canal" }).ok, true);
  for (const [resp, status, saida, detalhe] of [[{ ok: false, erro: "assinatura_invalida" }, 502, "canal_recusado", "assinatura_invalida"], [{ ok: false, erro: "chave_desconhecida" }, 502, "canal_recusado", "chave_desconhecida"], [{ ok: false, erro: "timestamp_fora_da_janela" }, 502, "canal_recusado", "timestamp_fora_da_janela"],
    [{ ok: false, erro: "registro_indisponivel" }, 502, "servico_indisponivel", "registro_indisponivel"], [{ ok: true, dados: { canal: "nao" } }, 502, "servico_indisponivel", "resposta_invalida"], [{ ok: true, dados: { canal: "ok", worker: "<script>" } }, 502, "servico_indisponivel", "resposta_invalida"]]) {
    const y = ctx({ worker: workerFalso(resp), banco: null }), s = await atender({ operacao: "testar_canal" }, y.c);
    assert.deepEqual([s.status, s.corpo.erro], [status, saida], JSON.stringify(resp)); assert.deepEqual(y.logs, [{ operacao: "testar_canal", codigo: saida, status, detalhe }], "o código fechado do Worker vai SÓ para o registro");
  }
  for (const [msg, det] of [["http_503", "http_503"], ["canal_falhou", "canal_falhou"], ["ECONNRESET com " + SENHA, "servico_indisponivel"]]) {
    const y = ctx({ worker: workerFalso(new Error(msg)), banco: null }), s = await atender({ operacao: "testar_canal" }, y.c);
    assert.deepEqual(s, { status: 502, corpo: { ok: false, erro: "servico_indisponivel" } }); assert.equal(y.logs[0].detalhe, det, msg); semSegredo(s, y.logs);
  }
});

test("diagnóstico das demais operações: o código fechado do Worker (ou http_NNN) vai ao registro; texto livre e credencial nunca", async () => {
  for (const [erroDoWorker, detalhe] of [[{ ok: false, erro: "timeout" }, "timeout"], [{ ok: false, erro: "conexao_falhou" }, "conexao_falhou"], [{ ok: false, erro: "login_desabilitado" }, "login_desabilitado"], [new Error("http_503"), "http_503"], [new Error("falhou com " + SENHA), "servico_indisponivel"]]) {
    const x = ctx({ worker: workerFalso(erroDoWorker) }), r = await atender(PED("testar_conta"), x.c);
    assert.equal(r.corpo.erro, "servico_indisponivel"); assert.equal(x.logs.at(-1).detalhe, detalhe); semSegredo(r, x.logs);
  }
  const x = ctx({ worker: workerFalso({ ok: false, erro: "autenticacao_recusada" }) }), r = await atender(PED("testar_conta"), x.c); assert.equal(r.corpo.erro, "credencial_invalida"); assert.equal(x.logs.at(-1).detalhe, undefined, "recusa de login não carrega detalhe");
  const y = ctx({ worker: workerFalso({ ok: false, erro: "Texto Livre Do Servidor " + SENHA }) }), s = await atender(PED("testar_conta"), y.c); assert.equal(s.corpo.erro, "servico_indisponivel"); assert.equal(y.logs.at(-1).detalhe, undefined, "o que não é código fechado nem entra no registro"); semSegredo(s, y.logs);
});

