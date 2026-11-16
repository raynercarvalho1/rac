// RAC Inbox · I3.2 · regras do navegador para o gerenciamento (nucleo.js): o pedido (esquema fechado), a resposta, a frase de sucesso, as pastas de destino e quais ações a tela oferece. Puro: sem DOM, sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const C = "11111111-1111-4111-8111-111111111111", P = "22222222-2222-4222-8222-222222222222", D = "33333333-3333-4333-8333-333333333333";

test("pedido: só as sete ações; destino (UUID) só em 'mover'; nome de pasta, comando, credencial e campos extras são recusados antes de qualquer rede", () => {
  assert.deepEqual(N.INB_ACOES.map((a) => a[0]), ["marcar_lida", "marcar_nao_lida", "arquivar", "excluir", "spam", "nao_spam", "mover"]);
  for (const a of ["marcar_lida", "marcar_nao_lida", "arquivar", "excluir", "spam", "nao_spam"]) assert.deepEqual(N.inbPedido("organizar_mensagem", { conta_id: C, pasta_id: P, uid: 7, acao: a }), { ok: true, pedido: { operacao: "organizar_mensagem", conta_id: C, pasta_id: P, uid: 7, acao: a } });
  assert.deepEqual(N.inbPedido("organizar_mensagem", { conta_id: C, pasta_id: P, uid: 7, acao: "mover", destino_pasta_id: D }).pedido.destino_pasta_id, D);
  for (const [e, erro] of [[{ acao: "expunge" }, "acao_invalida"], [{ acao: "apagar" }, "acao_invalida"], [{ acao: "mover" }, "destino_invalido"], [{ acao: "mover", destino_pasta_id: "Archive" }, "id_invalido"], [{ acao: "arquivar", destino_pasta_id: D }, "campos_inesperados"],
    [{ acao: "excluir", destino_pasta_id: D }, "campos_inesperados"], [{ acao: "marcar_lida", pasta: "INBOX" }, "campos_inesperados"], [{ acao: "marcar_lida", comando: "UID STORE 7 +FLAGS (\\Deleted)" }, "campos_inesperados"], [{ acao: "marcar_lida", senha: "x" }, "credencial_proibida"],
    [{ acao: "marcar_lida", uid: 0 }, "id_invalido"], [{ acao: "marcar_lida", uid: "7" }, "id_invalido"], [{ acao: "marcar_lida", pasta_id: "INBOX" }, "id_invalido"], [{ acao: "marcar_lida", uid: undefined }, "campo_ausente"], [{ acao: undefined }, "campo_ausente"]]) {
    assert.equal(N.inbPedido("organizar_mensagem", { conta_id: C, pasta_id: P, uid: 7, ...e }).erro, erro, JSON.stringify(e));
  }
  for (const v of ["mover", "arquivar", "excluir", "apagar", "marcar", "marcar_lida", "spam", "expunge", "store"]) assert.equal(N.inbPedido(v, { conta_id: C }).erro, "escrita_fora_do_escopo", "o verbo solto continua barrado: " + v);
});

test("resposta do gerenciamento: esquema fechado (resultado, ação, cache, lida ou pasta de destino); qualquer outra coisa é 'resposta_invalida'", () => {
  assert.deepEqual(N.inbRespostaOrganizacao({ ok: true, resultado: "aplicada", acao: "marcar_lida", cache: "atualizado", lida: true, extra: 1 }), { ok: true, resultado: "aplicada", acao: "marcar_lida", cache: "atualizado", lida: true });
  assert.deepEqual(N.inbRespostaOrganizacao({ ok: true, resultado: "verificada", acao: "excluir", cache: "nao_atualizado", destino_pasta_id: D }), { ok: true, resultado: "verificada", acao: "excluir", cache: "nao_atualizado", destino_pasta_id: D });
  for (const ruim of [null, {}, { ok: false }, { ok: true, resultado: "talvez", acao: "excluir", cache: "atualizado", destino_pasta_id: D }, { ok: true, resultado: "aplicada", acao: "apagar", cache: "atualizado", destino_pasta_id: D }, { ok: true, resultado: "aplicada", acao: "excluir", cache: "x", destino_pasta_id: D },
    { ok: true, resultado: "aplicada", acao: "excluir", cache: "atualizado" }, { ok: true, resultado: "aplicada", acao: "excluir", cache: "atualizado", destino_pasta_id: "Lixo" }, { ok: true, resultado: "aplicada", acao: "marcar_lida", cache: "atualizado" }, { ok: true, resultado: "aplicada", acao: "marcar_lida", cache: "atualizado", lida: false }])
    assert.deepEqual(N.inbRespostaOrganizacao(ruim), { ok: false, erro: "resposta_invalida" }, JSON.stringify(ruim));
});

test("frases: só depois da confirmação; 'verificada' e cache desatualizado são ditos com clareza; todo código novo tem texto próprio (nada de código cru)", () => {
  const f = (acao, extra = {}) => N.inbFraseOrganizacao({ acao, resultado: "aplicada", cache: "atualizado", ...extra });
  assert.equal(f("marcar_lida"), "Mensagem marcada como lida."); assert.equal(f("arquivar"), "Mensagem arquivada."); assert.equal(f("excluir"), "Mensagem movida para a Lixeira."); assert.equal(f("spam"), "Mensagem movida para o Spam."); assert.equal(f("nao_spam"), "Mensagem devolvida à Caixa de Entrada.");
  assert.equal(N.inbFraseOrganizacao({ acao: "mover", resultado: "aplicada", cache: "atualizado" }, "Projetos"), "Mensagem movida para “Projetos”.");
  assert.match(f("marcar_lida", { resultado: "ja_estava" }), /já estava marcada como lida/); assert.match(f("excluir", { resultado: "verificada" }), /conferiu no servidor/); assert.match(f("arquivar", { cache: "nao_atualizado" }), /Sincronizar/);
  for (const c of ["acao_invalida", "destino_invalido", "destino_ausente", "acao_indisponivel", "identidade_divergente", "acao_recusada", "acao_nao_aplicada", "acao_incerta", "acao_em_andamento", "pasta_somente_leitura", "confirmacao_ausente", "uidvalidity_mudou", "mensagem_inexistente", "credencial_ausente"])
    assert.ok(N.INB_ERROS[c] && !/código/.test(N.inbErroTexto(c)), c);
  assert.match(N.inbErroTexto("acao_incerta"), /PODE ter sido alterada/); assert.match(N.inbErroTexto("acao_indisponivel"), /MOVE/); assert.match(N.inbErroTexto("acao_recusada"), /Nada foi alterado/);
});

const pastas = [
  { id: "p1", conta_id: "c1", uso: "entrada", nome_externo: "INBOX", nome_exibicao: "INBOX", ativa: true }, { id: "p2", conta_id: "c1", uso: "arquivo", nome_externo: "Archive", nome_exibicao: "Arquivo", ativa: true },
  { id: "p3", conta_id: "c1", uso: "lixo", nome_externo: "Deleted Messages", nome_exibicao: "Lixeira", ativa: true }, { id: "p4", conta_id: "c1", uso: "spam", nome_externo: "Junk", nome_exibicao: "Spam", ativa: true },
  { id: "p5", conta_id: "c1", uso: "outra", nome_externo: "Projetos", nome_exibicao: "Projetos", ativa: true }, { id: "p6", conta_id: "c1", uso: "outra", nome_externo: "Pai", nome_exibicao: "Pai", ativa: false },
  { id: "x1", conta_id: "c2", uso: "arquivo", nome_externo: "Archive", nome_exibicao: "Arquivo", ativa: true }];
test("pastas de destino: só da conta da mensagem, só selecionáveis (ativas), sem a atual; ordem previsível", () => {
  assert.deepEqual(N.inbDestinosMover(pastas, "c1", "p1").map((p) => p.id), ["p2", "p5", "p4", "p3"], "Arquivo, outras, Spam e Lixeira por último; a inativa 'Pai' e as de outra conta ficam de fora");
  assert.deepEqual(N.inbDestinosMover(pastas, "c1", "p5").map((p) => p.id), ["p1", "p2", "p4", "p3"]); assert.deepEqual(N.inbDestinosMover(pastas, "c9", "p1"), []); assert.deepEqual(N.inbDestinosMover(null, "c1", "p1"), []);
});

test("ações oferecidas: dependem da pasta atual e do que o servidor identificou; sempre com o MOTIVO quando desligadas; sem MOVE nada que move é oferecido (lida/não lida continuam)", () => {
  const m = (extra = {}) => ({ conta_id: "c1", pasta_id: "p1", lida: false, ...extra });
  let a = N.inbAcoesDisponiveis(m(), pastas, false);
  assert.deepEqual(Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.ok])), { marcar_lida: true, marcar_nao_lida: false, arquivar: true, excluir: true, spam: true, nao_spam: false, mover: true });
  assert.ok(Object.values(a).every((v) => v.ok === (v.motivo === null)), "desligada sempre diz por quê");
  a = N.inbAcoesDisponiveis(m({ lida: true }), pastas, false); assert.deepEqual([a.marcar_lida.ok, a.marcar_nao_lida.ok], [false, true]);
  a = N.inbAcoesDisponiveis(m({ pasta_id: "p4" }), pastas, false); assert.deepEqual([a.spam.ok, a.nao_spam.ok, a.arquivar.ok], [false, true, true]); assert.match(a.spam.motivo, /Já está no Spam/);
  a = N.inbAcoesDisponiveis(m({ pasta_id: "p3" }), pastas, false); assert.equal(a.excluir.ok, false); assert.match(a.excluir.motivo, /Lixeira.*exclusão definitiva/);
  a = N.inbAcoesDisponiveis(m({ pasta_id: "p2" }), pastas, false); assert.deepEqual([a.arquivar.ok, a.mover.ok], [false, true]);
  a = N.inbAcoesDisponiveis(m(), pastas.filter((p) => p.uso !== "arquivo" && p.uso !== "lixo"), false); assert.deepEqual([a.arquivar.ok, a.excluir.ok, a.spam.ok], [false, false, true]); assert.match(a.arquivar.motivo, /não identificou/);
  a = N.inbAcoesDisponiveis(m(), pastas, true); assert.deepEqual(["arquivar", "excluir", "spam", "nao_spam", "mover"].map((k) => a[k].ok), [false, false, false, false, false]); assert.ok(a.marcar_lida.ok, "marcar lida não depende de MOVE"); assert.match(a.excluir.motivo, /MOVE|com segurança/);
  a = N.inbAcoesDisponiveis(m(), pastas.filter((p) => p.id === "p1"), false); assert.equal(a.mover.ok, false); assert.match(a.mover.motivo, /outra pasta selecionável/);
});
