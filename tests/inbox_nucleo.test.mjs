// RAC Inbox · I1 (docs/inbox.md): regras puras do núcleo (NUCLEO.inb*) e o contrato com o serviço de e-mail. Sem rede, sem banco, sem e-mail real.
// A evidência real usada aqui é a da P6 (duas rodadas no iCloud real em 14/11/2026): UIDVALIDITY 1752612613, UIDNEXT 4; segunda leitura "sem_mudanca".
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const UUID_A = "11111111-1111-4111-8111-111111111111", UUID_B = "22222222-2222-4222-8222-222222222222";

test("provedores: só o iCloud está ativo; a paridade é honesta (comprovado só o que teve prova; filtros do iCloud são do RAC; Gmail e Outlook só planejados)", () => {
  assert.deepEqual(N.INB_PROVEDORES.map((p) => [p.id, p.ativo]), [["icloud", true], ["gmail", false], ["outlook", false]]);
  const ic = N.inbProvedor("icloud");
  assert.deepEqual(ic.rec, { pastas: "comprovado", estado: "comprovado", ler: "comprovado", organizar: "nao_comprovado", enviar: "nao_comprovado", filtros: "rac" });
  for (const id of ["gmail", "outlook"]) assert.ok(Object.values(N.inbProvedor(id).rec).every((v) => v === "planejado"), id);
  for (const p of N.INB_PROVEDORES) for (const [r] of N.INB_RECURSOS) assert.ok(N.INB_RECURSO_ROTULOS[p.rec[r]], p.id + " " + r + " tem rótulo");
  assert.match(ic.nota, /READ-WRITE/, "o fato do EXAMINE real está registrado: a garantia de somente leitura é do Worker, não do servidor");
  assert.equal(N.inbProvedor("yahoo"), null);
});

test("estados da conta: sempre ícone + palavra (tipo do selo), 'nova' ≠ 'desconectada', e estado desconhecido nunca vira 'conectada'", () => {
  assert.deepEqual(N.INB_ESTADOS.map((e) => e.id), ["nova", "conectada", "sincronizando", "atrasada", "erro_autenticacao", "desconectada"]);
  assert.equal(N.inbEstado("conectada").tipo, "ok"); assert.equal(N.inbEstado("erro_autenticacao").tipo, "erro");
  assert.equal(N.inbEstado("qualquer").id, "desconectada", "o desconhecido é tratado como sem conexão, nunca como saudável");
});

test("formulário de conta: provedor ativo + apelido + endereço; Gmail/Outlook recusados (fase futura); qualquer campo de credencial é recusado", () => {
  const ok = N.inbContaValida({ provedor: "icloud", apelido: "  Pessoal ", endereco: " pessoa@icloud.example " });
  assert.deepEqual(ok, { ok: true, linha: { provedor: "icloud", apelido: "Pessoal", endereco: "pessoa@icloud.example", estado: "nova" } });
  assert.ok(N.inbContaValida({ provedor: "gmail", apelido: "x", endereco: "a@b.co" }).erros.provedor.includes("fase futura"));
  assert.ok(N.inbContaValida({ provedor: "xyz", apelido: "x", endereco: "a@b.co" }).erros.provedor);
  assert.ok(N.inbContaValida({ provedor: "icloud", apelido: "", endereco: "a@b.co" }).erros.apelido);
  assert.ok(N.inbContaValida({ provedor: "icloud", apelido: "x".repeat(61), endereco: "a@b.co" }).erros.apelido);
  for (const e of ["", "sem-arroba", "a@b", "a b@c.co", "@c.co", "a@@c.co"]) assert.ok(N.inbContaValida({ provedor: "icloud", apelido: "x", endereco: e }).erros.endereco, e);
  for (const campo of ["senha", "password", "token", "usuario", "senha_app", "api_key", "authorization", "credencial"]) {
    const r = N.inbContaValida({ provedor: "icloud", apelido: "x", endereco: "a@b.co", [campo]: "qualquer" });
    assert.equal(r.ok, false, campo); assert.ok(r.erros.credencial, campo);
  }
});

test("contrato com o serviço: só LEITURA e só IDs; escrita, credencial, campo extra e ID inválido são recusados com código fechado", () => {
  assert.deepEqual(Object.keys(N.INB_OPERACOES).sort(), ["baixar_anexo", "credencial_estado", "credencial_guardar", "credencial_remover", "estado_pasta", "ler_mensagem", "listar_pastas", "sincronizar_pasta", "testar_canal", "testar_conta"]);
  /* custódia: só o "guardar" aceita credencial (e só no formato de senha específica de app); remover e estado levam só o ID */
  const SENHA_APP = "abcd-efgh-ijkl-mnop";
  assert.deepEqual(N.inbPedido("credencial_guardar", { conta_id: UUID_A, usuario: "a@icloud.example", senha_app: SENHA_APP }), { ok: true, pedido: { operacao: "credencial_guardar", conta_id: UUID_A, usuario: "a@icloud.example", senha_app: SENHA_APP } });
  for (const ruim of ["MinhaSenhaPrincipal1!", "ABCD-EFGH-IJKL-MNOP", "abcd-efgh-ijkl", "abcdefghijklmnop", ""]) assert.deepEqual(N.inbPedido("credencial_guardar", { conta_id: UUID_A, usuario: "a@icloud.example", senha_app: ruim }), { ok: false, erro: "senha_formato_invalido" }, ruim);
  assert.deepEqual(N.inbPedido("credencial_guardar", { conta_id: UUID_A, usuario: "sem-arroba", senha_app: SENHA_APP }), { ok: false, erro: "usuario_invalido" });
  assert.deepEqual(N.inbPedido("credencial_guardar", { conta_id: UUID_A, usuario: "a@icloud.example" }), { ok: false, erro: "campo_ausente" });
  assert.deepEqual(N.inbPedido("credencial_guardar", { conta_id: UUID_A, usuario: "a@icloud.example", senha_app: SENHA_APP, dono: UUID_B }), { ok: false, erro: "campos_inesperados" }, "o dono nunca vai no pedido");
  for (const op of ["credencial_remover", "credencial_estado", "testar_conta", "estado_pasta"]) assert.deepEqual(N.inbPedido(op, { conta_id: UUID_A, pasta_id: UUID_B, senha_app: SENHA_APP }), { ok: false, erro: "credencial_proibida" }, op + " não aceita credencial");
  assert.deepEqual(N.inbPedido("credencial_remover", { conta_id: UUID_A }), { ok: true, pedido: { operacao: "credencial_remover", conta_id: UUID_A } });
  assert.ok(Object.values(N.INB_OPERACOES).every((o) => o.escreve === false), "nenhuma operação escreve");
  assert.deepEqual(N.inbPedido("testar_conta", { conta_id: UUID_A }), { ok: true, pedido: { operacao: "testar_conta", conta_id: UUID_A } });
  assert.deepEqual(N.inbPedido("estado_pasta", { conta_id: UUID_A, pasta_id: UUID_B }), { ok: true, pedido: { operacao: "estado_pasta", conta_id: UUID_A, pasta_id: UUID_B } });
  for (const verbo of N.INB_ESCRITA) assert.deepEqual(N.inbPedido(verbo, { conta_id: UUID_A }), { ok: false, erro: "escrita_fora_do_escopo" }, verbo);
  for (const verbo of ["enviar", "mover", "excluir", "marcar", "arquivar", "criar_pasta", "criar_filtro", "expunge", "store", "append"]) assert.ok(N.INB_ESCRITA.includes(verbo), verbo + " está na lista de recusa");
  assert.deepEqual(N.inbPedido("fazer_cafe", {}), { ok: false, erro: "operacao_invalida" });
  assert.deepEqual(N.inbPedido(undefined, {}), { ok: false, erro: "operacao_invalida" });
  assert.deepEqual(N.inbPedido("testar_conta", null), { ok: false, erro: "entrada_invalida" });
  assert.deepEqual(N.inbPedido("testar_conta", []), { ok: false, erro: "entrada_invalida" });
  assert.deepEqual(N.inbPedido("testar_conta", { conta_id: UUID_A, senha: "x" }), { ok: false, erro: "credencial_proibida" });
  assert.deepEqual(N.inbPedido("testar_conta", { conta_id: UUID_A, usuario: "a@b.co" }), { ok: false, erro: "credencial_proibida" });
  assert.deepEqual(N.inbPedido("testar_conta", { conta_id: UUID_A, Authorization: "Bearer x" }), { ok: false, erro: "credencial_proibida" });
  assert.deepEqual(N.inbPedido("testar_conta", { conta_id: UUID_A, pasta_id: UUID_B }), { ok: false, erro: "campos_inesperados" });
  assert.deepEqual(N.inbPedido("testar_conta", {}), { ok: false, erro: "campo_ausente" });
  assert.deepEqual(N.inbPedido("testar_conta", { conta_id: "1; drop table x" }), { ok: false, erro: "id_invalido" });
  assert.deepEqual(N.inbPedido("estado_pasta", { conta_id: UUID_A }), { ok: false, erro: "campo_ausente" });
  assert.ok(Object.keys(N.INB_OPERACOES).every((o) => !N.INB_ESCRITA.includes(o)), "nenhuma operação do contrato é um verbo de escrita");
});

test("cursor do IMAP: as regras da P6 real (primeira leitura → sem_mudanca) e os demais casos, com o teto de 32 bits", () => {
  const prim = { uidvalidity: 1752612613, uidnext: 4 };
  assert.deepEqual(N.inbCursor(prim, null), { ok: true, tipo: "primeira_leitura", uidvalidity_mudou: false, uids_novos_no_maximo: 0 });
  assert.deepEqual(N.inbCursor(prim, prim), { ok: true, tipo: "sem_mudanca", uidvalidity_mudou: false, uids_novos_no_maximo: 0 }, "a 2ª rodada real da P6");
  assert.deepEqual(N.inbCursor({ ...prim, uidnext: 9 }, prim), { ok: true, tipo: "novas_mensagens", uidvalidity_mudou: false, uids_novos_no_maximo: 5 });
  assert.deepEqual(N.inbCursor({ ...prim, uidvalidity: 1 }, prim), { ok: true, tipo: "uidvalidity_mudou", uidvalidity_mudou: true, uids_novos_no_maximo: 0 });
  assert.deepEqual(N.inbCursor({ ...prim, uidnext: 2 }, prim), { ok: true, tipo: "uidnext_regrediu", uidvalidity_mudou: false, uids_novos_no_maximo: 0 });
  for (const ruim of [0, -1, 1.5, 4294967296, "4", null, NaN]) { assert.equal(N.inbCursor({ uidvalidity: ruim, uidnext: 4 }, null).erro, "cursor_invalido", String(ruim)); assert.equal(N.inbCursor(prim, { uidvalidity: 1, uidnext: ruim }).erro, "cursor_invalido", String(ruim)); }
  assert.equal(N.inbCursor({ uidvalidity: 4294967295, uidnext: 4294967295 }, null).ok, true, "o teto é aceito");
  assert.deepEqual(N.INB_TIPOS_SINC, ["primeira_leitura", "sem_mudanca", "novas_mensagens", "uidvalidity_mudou", "uidnext_regrediu"], "o vocabulário é o do Worker (P6) e o da coluna tipo_ultima da 051");
  assert.ok(ler("supabase/051_inbox_fundacao.sql").includes(N.INB_TIPOS_SINC.map((t) => `'${t}'`).join(", ")), "a migration usa o mesmo vocabulário");
});

test("resposta do serviço → linha de sincronização: o formato real da P6 (rodada 1) é aceito; o resto é recusado; erro só como código fechado", () => {
  /* a resposta real da P6 (rodada 1, 14/11/2026), campo a campo */
  const real = { ok: true, operacao: "p6_imap", estagio: "concluido", autenticado: true, logout: true, erro: null, pasta_teste_existe: true, mensagens_na_pasta: 1,
    capacidades: { condstore: false, qresync: false, idle: false, uidplus: false, move: false, namespace: false },
    exame: { codigo_etiquetado: "READ-WRITE", permanentflags: "nao_vazio", uidvalidity: 1752612613, uidnext: 4, highestmodseq_presente: false },
    sincronizacao: { tipo: "primeira_leitura", uidvalidity_mudou: false, uids_novos_no_maximo: 0 }, duracao_ms: 985 };
  assert.deepEqual(N.inbRespostaEstado(real), { ok: true, linha: { uidvalidity: 1752612613, uidnext: 4, tipo_ultima: "primeira_leitura", total: 1, duracao_ms: 985 } });
  assert.ok(!JSON.stringify(N.inbRespostaEstado(real)).includes("READ-WRITE"), "só copia o que conhece");
  assert.deepEqual(N.inbRespostaEstado({ ...real, mensagens_na_pasta: -1, duracao_ms: "x" }).linha, { uidvalidity: 1752612613, uidnext: 4, tipo_ultima: "primeira_leitura", total: null, duracao_ms: null });
  assert.equal(N.inbRespostaEstado({ ...real, sincronizacao: { tipo: "inventado" } }).erro, "resposta_invalida");
  assert.equal(N.inbRespostaEstado({ ...real, exame: { uidvalidity: 0, uidnext: 4 } }).erro, "resposta_invalida");
  assert.equal(N.inbRespostaEstado(null).erro, "resposta_invalida"); assert.equal(N.inbRespostaEstado("texto").erro, "resposta_invalida");
  assert.deepEqual(N.inbRespostaEstado({ ok: false, erro: "pasta_inexistente" }), { ok: false, erro: "pasta_inexistente" });
  assert.equal(N.inbRespostaEstado({ ok: false, erro: "Texto livre do servidor: senha errada!" }).erro, "resposta_invalida", "texto livre do servidor nunca passa");
});

test("árvore e caixa unificada: contas por apelido, pastas por uso; sem conexão a contagem é 'parcial' e nunca parece zero", () => {
  const contas = [{ id: "b", apelido: "Trabalho", estado: "nova" }, { id: "a", apelido: "Pessoal", estado: "conectada" }];
  const pastas = [{ id: "p1", conta_id: "a", nome_externo: "Lixo", uso: "lixo", nao_lidas: 0 }, { id: "p2", conta_id: "a", nome_externo: "INBOX", uso: "entrada", nao_lidas: 3 }, { id: "p3", conta_id: "a", nome_externo: "Arquivos", uso: "outra", nao_lidas: null }];
  const arv = N.inbArvore(contas, pastas);
  assert.deepEqual(arv.map((g) => g.conta.apelido), ["Pessoal", "Trabalho"]); assert.deepEqual(arv[0].pastas.map((p) => p.nome_externo), ["INBOX", "Lixo", "Arquivos"]); assert.deepEqual(arv[1].pastas, []);
  assert.equal(arv[0].estado.id, "conectada");
  assert.deepEqual(N.inbUnificada(contas, pastas), { contas: 2, naoLidas: 3, parcial: true }, "a conta nova não entra na soma, e o total avisa que é parcial");
  assert.deepEqual(N.inbUnificada([contas[1]], pastas), { contas: 1, naoLidas: 3, parcial: false });
  assert.deepEqual(N.inbUnificada([contas[0]], []), { contas: 1, naoLidas: null, parcial: true }, "só conta sem conexão: sem número (não zero)");
  assert.deepEqual(N.inbUnificada([], []), { contas: 0, naoLidas: null, parcial: false });
  assert.deepEqual(N.inbUnificada([contas[1]], [{ ...pastas[1], nao_lidas: null }]), { contas: 1, naoLidas: null, parcial: true }, "pasta sem contagem: sem número");
});

test("estado da tela: carregando, estrutura pendente (051 não aplicada), erro, vazio, desconectado e ok", () => {
  assert.equal(N.inbTelaEstado({ carregando: true }).tipo, "carregando");
  assert.equal(N.inbTelaEstado({ erro: { message: 'relation "public.inbox_contas" does not exist', code: "42P01" } }).tipo, "estrutura_pendente");
  assert.equal(N.inbTelaEstado({ erro: { message: "Could not find the table 'public.inbox_contas' in the schema cache" } }).tipo, "estrutura_pendente");
  assert.equal(N.inbTelaEstado({ erro: { message: "Failed to fetch" } }).tipo, "erro");
  assert.equal(N.inbTelaEstado({ erro: { message: "permission denied for table inbox_contas", code: "42501" } }).tipo, "erro", "falta de permissão não é 'migration pendente'");
  assert.equal(N.inbTelaEstado({ contas: [] }).tipo, "vazio");
  assert.equal(N.inbTelaEstado({ contas: [{ estado: "nova" }, { estado: "desconectada" }, { estado: "erro_autenticacao" }] }).tipo, "desconectado");
  assert.equal(N.inbTelaEstado({ contas: [{ estado: "nova" }, { estado: "conectada" }] }).tipo, "ok");
});

test("mensagens (apresentação): horário como no Mail, iniciais, ordem, filtros; nada disso toca banco nem rede", () => {
  const agora = new Date(2026, 10, 14, 18, 0);
  assert.equal(N.inbHora(new Date(2026, 10, 14, 9, 27), agora), "09:27"); assert.equal(N.inbHora(new Date(2026, 10, 13, 23, 59), agora), "Ontem");
  assert.equal(N.inbHora(new Date(2026, 10, 10, 8, 0), agora), "ter"); assert.equal(N.inbHora(new Date(2026, 9, 1), agora), "01/10"); assert.equal(N.inbHora("lixo", agora), "");
  assert.equal(N.inbIniciais("Darla Davidson"), "DD"); assert.equal(N.inbIniciais("NewTec"), "N"); assert.equal(N.inbIniciais("  "), "?"); assert.equal(N.inbIniciais('"Ana Maria de Souza" <a@b.co>'), "AB");
  const ms = [{ id: 1, recebida: "2026-11-10T10:00:00Z", lida: true, anexo: false }, { id: 2, recebida: "2026-11-13T10:00:00Z", lida: false, anexo: true }, { id: 3, recebida: "2026-11-12T10:00:00Z", lida: false, anexo: false }];
  assert.deepEqual(N.inbOrdenar(ms).map((m) => m.id), [2, 3, 1]); assert.deepEqual(N.inbFiltrar(ms, "nao_lidas").map((m) => m.id), [2, 3]); assert.deepEqual(N.inbFiltrar(ms, "anexo").map((m) => m.id), [2]);
  assert.equal(N.inbFiltrar(ms, "todas").length, 3); assert.equal(N.inbNaoLidas(ms), 2);
  assert.deepEqual(N.INB_CATEGORIAS.map((c) => c[0]), ["pessoal", "trabalho", "financeiro", "compras", "entregas", "newsletters", "notificacoes", "promocoes"], "as categorias do Documento 10, seção 3.3");
});

test("textos de erro: sempre frase fixa; um código desconhecido é mostrado só depois de limpo e cortado (nunca texto do servidor)", () => {
  for (const c of Object.keys(N.INB_ERROS)) assert.ok(N.inbErroTexto(c).length > 5, c);
  assert.match(N.inbErroTexto("servico_nao_publicado"), /não está publicado/);
  assert.equal(N.inbErroTexto("<script>alert(1)</script>").includes("<"), false); assert.ok(N.inbErroTexto("a".repeat(500)).length < 120);
});

test("cliente do serviço (js/inbox-servico.js): valida antes de qualquer rede, não publicado = código fechado, falhas HTTP viram código, resposta passa pelo normalizador", async () => {
  const chamadas = []; let resposta = { data: null, error: null };
  const ctx = { console, Promise, Object, Array, JSON, String, Number, NUCLEO: N, SB: { functions: { invoke: (nome, o) => { chamadas.push([nome, o]); return Promise.resolve(resposta); } } } };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(ler("js/inbox-servico.js"), ctx);
  const chamar = async (...a) => JSON.parse(JSON.stringify(await ctx.inboxChamar(...a)));   // (objetos de outro contexto do vm: compara só os dados)
  assert.equal(vm.runInContext("INBS.publicado", ctx), true, "a Edge Function rac-inbox está publicada (15/11/2026)");
  vm.runInContext("INBS.publicado=false", ctx);   // ramo de segurança: com a flag desligada nada sai para a rede
  assert.deepEqual(await chamar("enviar", { conta_id: UUID_A }), { ok: false, erro: "escrita_fora_do_escopo" });
  assert.deepEqual(await chamar("testar_conta", { conta_id: UUID_A, senha: "x" }), { ok: false, erro: "credencial_proibida" });
  assert.deepEqual(await chamar("testar_conta", { conta_id: UUID_A }), { ok: false, erro: "servico_nao_publicado" });
  assert.equal(chamadas.length, 0, "nada foi enviado à rede (nem pedido válido, enquanto não publicado)");
  vm.runInContext("INBS.publicado=true", ctx);   // religa para testar o ramo de rede, com um serviço de mentira
  resposta = { data: { ok: true, exame: { uidvalidity: 5, uidnext: 9 }, sincronizacao: { tipo: "sem_mudanca" }, mensagens_na_pasta: 2, duracao_ms: 10 }, error: null };
  assert.deepEqual(await chamar("estado_pasta", { conta_id: UUID_A, pasta_id: UUID_B }), { ok: true, linha: { uidvalidity: 5, uidnext: 9, tipo_ultima: "sem_mudanca", total: 2, duracao_ms: 10 } });
  assert.deepEqual(JSON.parse(JSON.stringify(chamadas[0])), ["rac-inbox", { body: { operacao: "estado_pasta", conta_id: UUID_A, pasta_id: UUID_B } }], "só a operação e os IDs saem do navegador");
  assert.ok(!/senha|usuario|token|password/i.test(JSON.stringify(chamadas)), "nenhuma credencial no pedido");
  for (const [st, cod] of [[401, "sem_login"], [403, "sem_login"], [404, "servico_nao_publicado"], [429, "limite"], [500, "servico_indisponivel"], [502, "servico_indisponivel"]]) {
    resposta = { data: null, error: { name: "FunctionsHttpError", message: "texto do servidor", context: { status: st } } };
    assert.deepEqual(await chamar("estado_pasta", { conta_id: UUID_A, pasta_id: UUID_B }), { ok: false, erro: cod }, String(st));
  }
  resposta = { data: null, error: { name: "FunctionsFetchError", message: "Failed to fetch" } };
  assert.deepEqual(await chamar("estado_pasta", { conta_id: UUID_A, pasta_id: UUID_B }), { ok: false, erro: "rede" });
  resposta = { data: { ok: true, exame: { uidvalidity: 0, uidnext: 9 } }, error: null };
  assert.equal((await chamar("estado_pasta", { conta_id: UUID_A, pasta_id: UUID_B })).erro, "resposta_invalida");
});

test("formulário de credencial: login do ID Apple + SÓ senha específica de app (a senha principal é recusada com a explicação); os campos voltam já conferidos", () => {
  assert.deepEqual(N.inbCredencialValida({ usuario: " a@icloud.example ", senha: " abcd-efgh-ijkl-mnop " }), { ok: true, usuario: "a@icloud.example", senha: "abcd-efgh-ijkl-mnop" });
  const ruim = N.inbCredencialValida({ usuario: "x", senha: "MinhaSenhaPrincipal1!" });
  assert.equal(ruim.ok, false); assert.ok(ruim.erros.usuario); assert.match(ruim.erros.senha_app, /senha principal da conta Apple não é aceita/);
  assert.ok(!JSON.stringify(ruim).includes("MinhaSenhaPrincipal1!"), "o erro nunca repete o que foi digitado");
  assert.deepEqual(Object.keys(N.INB_CRED_ROTULOS), ["ausente", "ativa", "invalida"]);
  for (const c of ["usuario_invalido", "senha_formato_invalido", "credencial_ausente", "credencial_invalida", "cofre_indisponivel", "mfa_requerido", "worker_nao_configurado"]) assert.ok(N.INB_ERROS[c], c);
  assert.ok(!Object.values(N.INB_ERROS).some((t) => /senha-?principal-?real|[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}/.test(t.replace("abcd-efgh-ijkl-mnop", ""))), "os textos de erro só trazem o exemplo fixo do formato");
});

test("mensagens (data): grupos Hoje / Ontem / Esta semana / Anteriores e a data por extenso", () => {
  const agora = new Date(2026, 10, 14, 18, 0);
  assert.deepEqual([new Date(2026, 10, 14, 1), new Date(2026, 10, 13), new Date(2026, 10, 10), new Date(2026, 9, 1), "lixo"].map((d) => N.inbGrupoData(d, agora)), ["Hoje", "Ontem", "Esta semana", "Anteriores", "Anteriores"]);
  const g = N.inbAgrupar([{ id: 1, recebida: new Date(2026, 9, 1) }, { id: 2, recebida: new Date(2026, 10, 14, 9) }, { id: 3, recebida: new Date(2026, 10, 14, 12) }, { id: 4, recebida: new Date(2026, 10, 13) }], agora);
  assert.deepEqual(g.map((x) => [x.rotulo, x.itens.map((m) => m.id)]), [["Hoje", [3, 2]], ["Ontem", [4]], ["Anteriores", [1]]]);
  assert.equal(N.inbDataCompleta(new Date(2026, 10, 14, 18, 4)), "14 de novembro de 2026, 18:04"); assert.equal(N.inbDataCompleta("x"), "");
});

test("arquivos do Inbox: ES5 puro, sem segredo no código, sem acesso direto a e-mail, sem chave de serviço e sem armazenamento no aparelho; a senha nunca entra no estado da tela nem é registrada", () => {
  for (const a of ["js/inbox.js", "js/inbox-servico.js", "js/inbox-demo.js"]) {
    const t = ler(a);
    assert.ok(!/=>|\blet\b|\bconst\b|`|\basync\b|\bawait\b|\.\.\./.test(t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"(?:[^"\\\n]|\\.)*"/g, '""')), a + " é ES5");
    assert.ok(!/service_role|SUPABASE_SERVICE|localStorage|sessionStorage|indexedDB|imap\.mail\.me\.com|smtp\.|api\.anthropic|Authorization|console\./i.test(t.replace(/\/\*[\s\S]*?\*\//g, "")), a + " sem segredo, armazenamento local, registro nem acesso direto");
  }
  const srv = ler("js/inbox-servico.js").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/\.(insert|update|delete|upsert)\(/.test(srv), "o cliente do serviço não grava no banco"); assert.ok(!/senha|password/i.test(srv), "o cliente do serviço só repassa o pedido: não olha dentro dele");
  const ui = ler("js/inbox.js").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.deepEqual([...ui.matchAll(/SB\.from\("([a-z_]+)"\)\.(insert|update|delete|upsert)/g)].map((m) => m[1] + "." + m[2]), ["inbox_contas.update", "inbox_contas.insert"], "a tela só cadastra conta e muda as duas preferências da conta (sync_auto, notificar; tests/inbox_tela.test.mjs); credencial só pelo serviço; nada de e-mail");
  assert.ok(!/INBX\.[a-zA-Z]*(senha|Senha|segredo|password)|senha:[^,}]*INBX|valores\.senha/.test(ui), "a senha nunca é guardada no estado da tela");
  assert.match(ui, /campo\.value="";/, "o campo da senha é limpo na hora, antes do envio");
  assert.ok(!/credencial|senha/i.test(ler("js/inbox-demo.js")), "o exemplo não tem nada de credencial");
});

/* ---------- I2: pedidos novos, normalizadores e apresentação ---------- */
test("I2 · pedidos novos: sincronizar_pasta, ler_mensagem e baixar_anexo levam só IDs, UID e o caminho da parte; o NOME da pasta e qualquer credencial nunca vão", () => {
  assert.deepEqual(N.inbPedido("sincronizar_pasta", { conta_id: UUID_A, pasta_id: UUID_B }), { ok: true, pedido: { operacao: "sincronizar_pasta", conta_id: UUID_A, pasta_id: UUID_B } });
  assert.deepEqual(N.inbPedido("ler_mensagem", { conta_id: UUID_A, pasta_id: UUID_B, uid: 7 }), { ok: true, pedido: { operacao: "ler_mensagem", conta_id: UUID_A, pasta_id: UUID_B, uid: 7 } });
  assert.deepEqual(N.inbPedido("baixar_anexo", { conta_id: UUID_A, pasta_id: UUID_B, uid: 7, parte: "1.2" }), { ok: true, pedido: { operacao: "baixar_anexo", conta_id: UUID_A, pasta_id: UUID_B, uid: 7, parte: "1.2" } });
  for (const uid of [0, -1, 1.5, "7", 4294967296, null, NaN]) assert.equal(N.inbPedido("ler_mensagem", { conta_id: UUID_A, pasta_id: UUID_B, uid }).erro, "id_invalido", String(uid));
  for (const parte of ["", "0", "../1", "1/2", "1.", ".1", "a", "1.2.3.4.5.6.7", 1]) assert.equal(N.inbPedido("baixar_anexo", { conta_id: UUID_A, pasta_id: UUID_B, uid: 7, parte }).erro, "id_invalido", String(parte));
  assert.equal(N.inbPedido("sincronizar_pasta", { conta_id: UUID_A, pasta_id: UUID_B, nome: "INBOX" }).erro, "campos_inesperados", "o nome da pasta nunca vai do navegador");
  assert.equal(N.inbPedido("ler_mensagem", { conta_id: UUID_A, pasta_id: UUID_B, uid: 7, senha: "x" }).erro, "credencial_proibida");
  assert.equal(N.inbPedido("ler_mensagem", { conta_id: UUID_A, pasta_id: UUID_B }).erro, "campo_ausente");
  assert.ok(Object.values(N.INB_OPERACOES).every((o) => o.escreve === false), "nenhuma operação escreve");
});

test("I2 · a linha da lista vem do cache (sem prévia) e os normalizadores de resposta são de esquema fechado", () => {
  const r = { id: UUID_A, conta_id: UUID_B, pasta_id: UUID_B, uid: "12", recebida_em: "2026-11-14T10:00:00Z", assunto: " Olá ", remetente_nome: "  ", remetente_endereco: "ana@x.com", destinatarios: [{ nome: "Eu", endereco: "eu@x.com" }, { nome: "", endereco: "b@x.com" }, { endereco: "ruim" }], lida: true, anexo_provavel: true, corpo: "NUNCA", senha: "x" };
  assert.deepEqual(N.inbLinhaMensagem(r), { id: UUID_A, conta_id: UUID_B, pasta_id: UUID_B, uid: 12, remetente: "ana@x.com", endereco: "ana@x.com", assunto: "Olá", previa: "", recebida: "2026-11-14T10:00:00Z", lida: true, sinalizada: false, anexo: true, para: ["Eu", "b@x.com"] });
  assert.equal(N.inbLinhaMensagem(null), null); assert.equal(N.inbLinhaMensagem({ id: 5 }), null); assert.equal(N.inbLinhaMensagem({ id: UUID_A, assunto: "" }).assunto, "(sem assunto)");
  assert.deepEqual(N.inbRespostaPastas({ ok: true, pastas: [{ id: UUID_A, nome: "INBOX", uso: "entrada", senha: "x" }] }), { ok: true, pastas: [{ id: UUID_A, nome: "INBOX", uso: "entrada" }] });
  for (const ruim of [null, { ok: false }, { ok: true, pastas: "x" }, { ok: true, pastas: [{ id: "x", nome: "a", uso: "entrada" }] }, { ok: true, pastas: [{ id: UUID_A, nome: "a", uso: "inventado" }] }]) assert.equal(N.inbRespostaPastas(ruim).erro, "resposta_invalida");
  assert.deepEqual(N.inbRespostaSincronizacao({ ok: true, sincronizacao: { tipo: "novas_mensagens", novas: 2, atualizadas: 1, removidas: 0, x: 1 }, mensagens_na_pasta: 9, mais: false }), { ok: true, tipo: "novas_mensagens", novas: 2, atualizadas: 1, removidas: 0, total: 9, mais: false });
  for (const ruim of [{ ok: true }, { ok: true, sincronizacao: { tipo: "x", novas: 1, atualizadas: 0, removidas: 0 }, mais: false }, { ok: true, sincronizacao: { tipo: "sem_mudanca", novas: -1, atualizadas: 0, removidas: 0 }, mais: false }, { ok: true, sincronizacao: { tipo: "sem_mudanca", novas: 0, atualizadas: 0, removidas: 0 } }]) assert.equal(N.inbRespostaSincronizacao(ruim).erro, "resposta_invalida");
  const msg = { texto: "oi", formato: "texto", truncado: 1, anexos: [{ parte: "2", nome: "a.pdf", tipo: "application/pdf", tamanho: 5, inline: false, extra: 1 }], senha: "x" };
  assert.deepEqual(N.inbRespostaLeitura({ ok: true, mensagem: msg }), { ok: true, texto: "oi", formato: "texto", truncado: false, anexos: [{ parte: "2", nome: "a.pdf", tipo: "application/pdf", tamanho: 5, inline: false }] }, "truncado só é verdadeiro se for true; campos extras caem");
  for (const ruim of [{ ok: true }, { ok: true, mensagem: { ...msg, formato: "html" } }, { ok: true, mensagem: { ...msg, texto: "x".repeat(65537) } }, { ok: true, mensagem: { ...msg, anexos: [{ parte: "../1", nome: null, tipo: "a/b", tamanho: 1 }] } }, { ok: true, mensagem: { ...msg, anexos: new Array(31).fill({ parte: "1", nome: null, tipo: "a/b", tamanho: 1 }) } }]) assert.equal(N.inbRespostaLeitura(ruim).erro, "resposta_invalida");
  assert.deepEqual(N.inbRespostaAnexo({ ok: true, anexo: { nome: "../a:b.pdf", tipo: "Application/PDF", tamanho_bytes: 3, base64: "QUJD", x: 1 } }), { ok: true, nome: "_a_b.pdf", tipo: "application/pdf", tamanho: 3, base64: "QUJD" });
  for (const ruim of [{ ok: true }, { ok: true, anexo: { nome: "a", tipo: "a/b", tamanho_bytes: 3, base64: "<script>" } }, { ok: true, anexo: { nome: "a", tipo: "a/b", tamanho_bytes: -1, base64: "QUJD" } }, { ok: true, anexo: { nome: "a", tipo: "a/b", tamanho_bytes: 3, base64: "A".repeat(4400001) } }]) assert.equal(N.inbRespostaAnexo(ruim).erro, "resposta_invalida");
});

test("I2 · arquivo baixado: nome sem caminho nem controle, tipo perigoso vira binário genérico; texto em parágrafos sem controle; frases do resultado da sincronização", () => {
  assert.equal(N.inbNomeArquivoSeguro("../../etc/passwd"), "_.._etc_passwd"); assert.equal(N.inbNomeArquivoSeguro("a\u0000b\nc.pdf"), "a_b_c.pdf"); assert.equal(N.inbNomeArquivoSeguro("..."), "anexo"); assert.equal(N.inbNomeArquivoSeguro(null), "anexo"); assert.equal(N.inbNomeArquivoSeguro("x".repeat(300)).length, 120);
  assert.equal(N.inbNomeArquivoSeguro("C:\\temp\\a<b>.exe"), "C_temp_a_b_.exe"); assert.equal(N.inbNomeArquivoSeguro(" .oculto"), "oculto");
  for (const perigoso of ["text/html", "application/xhtml+xml", "image/svg+xml", "text/xml", "application/javascript", "text/javascript", "application/x-msdownload", "application/x-sh", "lixo", "", null]) assert.equal(N.inbTipoDownload(perigoso), "application/octet-stream", String(perigoso));
  for (const bom of ["application/pdf", "image/png", "text/plain", "application/zip"]) assert.equal(N.inbTipoDownload(bom), bom);
  assert.deepEqual(N.inbParagrafos("a\r\nb\n\n\nc\u0001d\u0000\n\n  \n\ne\n"), ["a\nb", "cd", "e"]); assert.deepEqual(N.inbParagrafos(""), []); assert.equal(N.inbParagrafos("x\n\n".repeat(600)).length, 500);
  const f = (o) => N.inbFraseSincronizacao({ novas: 0, atualizadas: 0, removidas: 0, mais: false, ...o });
  assert.equal(f({ tipo: "primeira_leitura", novas: 3 }), "Caixa lida pela primeira vez: 3 mensagens carregadas."); assert.equal(f({ tipo: "primeira_leitura", novas: 1 }), "Caixa lida pela primeira vez: 1 mensagem carregada.");
  assert.equal(f({ tipo: "sem_mudanca" }), "Tudo em dia."); assert.equal(f({ tipo: "novas_mensagens", novas: 1, removidas: 2, mais: true }), "1 mensagem nova. 2 removidas no provedor. Há mais mensagens: sincronize de novo.");
  assert.match(f({ tipo: "uidvalidity_mudou", novas: 4 }), /reorganizada no provedor e o RAC releu tudo \(4 mensagens\)/); assert.equal(N.inbFraseSincronizacao(null), "");
  for (const c of ["pasta_inexistente", "mensagem_inexistente", "parte_inexistente", "anexo_grande_demais", "uidvalidity_mudou", "sincronizacao_em_andamento", "canal_recusado", "banco_indisponivel"]) assert.ok(N.INB_ERROS[c] && !/etapa I2/.test(N.INB_ERROS[c]), c);
  assert.ok(!Object.values(N.INB_ERROS).some((x) => /etapa I2/.test(x)), "nenhum texto de erro manda esperar pela I2");
});

test("I2 · cliente do serviço: as respostas novas passam pelos normalizadores e o corpo do pedido leva só o que o contrato permite", async () => {
  const chamadas = []; let resposta;
  const ctx = { console, Promise, Object, Array, JSON, String, Number, NUCLEO: N, SB: { functions: { invoke: (nome, o) => { chamadas.push([nome, JSON.parse(JSON.stringify(o))]); return Promise.resolve(resposta); } } } };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(ler("js/inbox-servico.js"), ctx);
  const chamar = async (...a) => JSON.parse(JSON.stringify(await ctx.inboxChamar(...a)));
  const ped = { conta_id: UUID_A, pasta_id: UUID_B };
  resposta = { data: { ok: true, pastas: [{ id: UUID_B, nome: "INBOX", uso: "entrada", x: 1 }] }, error: null }; assert.deepEqual(await chamar("listar_pastas", { conta_id: UUID_A }), { ok: true, pastas: [{ id: UUID_B, nome: "INBOX", uso: "entrada" }] });
  resposta = { data: { ok: true, sincronizacao: { tipo: "sem_mudanca", novas: 0, atualizadas: 2, removidas: 0 }, mensagens_na_pasta: 4, mais: false }, error: null }; assert.deepEqual(await chamar("sincronizar_pasta", ped), { ok: true, tipo: "sem_mudanca", novas: 0, atualizadas: 2, removidas: 0, total: 4, mais: false });
  resposta = { data: { ok: true, mensagem: { texto: "oi", formato: "texto", anexos: [] } }, error: null }; assert.deepEqual(await chamar("ler_mensagem", { ...ped, uid: 3 }), { ok: true, texto: "oi", formato: "texto", truncado: false, anexos: [] });
  assert.deepEqual(chamadas.at(-1), ["rac-inbox", { body: { operacao: "ler_mensagem", conta_id: UUID_A, pasta_id: UUID_B, uid: 3 } }], "só IDs e UID");
  resposta = { data: { ok: true, anexo: { nome: "a.pdf", tipo: "application/pdf", tamanho_bytes: 3, base64: "QUJD" } }, error: null }; assert.deepEqual(await chamar("baixar_anexo", { ...ped, uid: 3, parte: "2" }), { ok: true, nome: "a.pdf", tipo: "application/pdf", tamanho: 3, base64: "QUJD" });
  resposta = { data: { ok: true, mensagem: { texto: 5 } }, error: null }; assert.deepEqual(await chamar("ler_mensagem", { ...ped, uid: 3 }), { ok: false, erro: "resposta_invalida" });
  resposta = { data: { ok: false, erro: "mensagem_inexistente" }, error: null }; assert.deepEqual(await chamar("ler_mensagem", { ...ped, uid: 3 }), { ok: false, erro: "mensagem_inexistente" });
  const antes = chamadas.length; assert.deepEqual(await chamar("ler_mensagem", { ...ped, uid: 0 }), { ok: false, erro: "id_invalido" }); assert.equal(chamadas.length, antes, "pedido inválido nem sai do navegador");
  for (const [st, cod] of [[404, "mensagem_inexistente"], [409, "uidvalidity_mudou"], [413, "anexo_grande_demais"]]) { resposta = { data: null, error: { name: "FunctionsHttpError", message: "texto do servidor", context: { status: st, json: () => Promise.resolve({ ok: false, erro: cod }) } } }; assert.deepEqual(await chamar("baixar_anexo", { ...ped, uid: 3, parte: "2" }), { ok: false, erro: cod }, cod + ": o código do corpo (de lista fechada) é o que vale"); }
});

test("I2 · testar_canal: pedido sem campos nenhum (sem conta, sem credencial) e resposta só com os carimbos de versão", async () => {
  assert.deepEqual(N.inbPedido("testar_canal", {}), { ok: true, pedido: { operacao: "testar_canal" } });
  assert.equal(N.inbPedido("testar_canal", { conta_id: UUID_A }).erro, "campos_inesperados"); assert.equal(N.inbPedido("testar_canal", { senha: "x" }).erro, "credencial_proibida"); assert.equal(N.INB_OPERACOES.testar_canal.escreve, false);
  assert.deepEqual(N.inbRespostaCanal({ ok: true, canal: "ok", funcao: "rac-inbox@i2.2", worker: "rac-inbox-worker@p7.2", x: 1 }), { ok: true, funcao: "rac-inbox@i2.2", worker: "rac-inbox-worker@p7.2" });
  for (const ruim of [null, { ok: true }, { ok: true, canal: "nao", funcao: "a", worker: "b" }, { ok: true, canal: "ok", funcao: "<script>", worker: "b" }, { ok: true, canal: "ok", funcao: "a", worker: "x".repeat(61) }, { ok: false, erro: "x" }, { ok: true, canal: "ok", funcao: 5, worker: "b" }]) assert.equal(N.inbRespostaCanal(ruim).erro, "resposta_invalida", JSON.stringify(ruim));
  const chamadas = []; let resposta;
  const ctx = { console, Promise, Object, Array, JSON, String, Number, NUCLEO: N, SB: { functions: { invoke: (nome, o) => { chamadas.push([nome, JSON.parse(JSON.stringify(o))]); return Promise.resolve(resposta); } } } };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(ler("js/inbox-servico.js"), ctx);
  resposta = { data: { ok: true, canal: "ok", funcao: "rac-inbox@i2.2", worker: "rac-inbox-worker@p7.2" }, error: null };
  assert.deepEqual(JSON.parse(JSON.stringify(await ctx.inboxChamar("testar_canal", {}))), { ok: true, funcao: "rac-inbox@i2.2", worker: "rac-inbox-worker@p7.2" });
  assert.deepEqual(chamadas[0], ["rac-inbox", { body: { operacao: "testar_canal" } }], "o corpo é só a operação");
});

test("I2 · inbFraseSync: a última sincronização em frase curta (hoje, ontem, outra data) e sem data", () => {
  const agora = new Date(2026, 10, 15, 14, 30).getTime();
  assert.equal(N.inbFraseSync(new Date(2026, 10, 15, 12, 22).toISOString(), agora), "Sincronizada hoje às 12:22.");
  assert.equal(N.inbFraseSync(new Date(2026, 10, 14, 9, 5).toISOString(), agora), "Sincronizada ontem às 09:05.");
  assert.equal(N.inbFraseSync(new Date(2026, 10, 3, 18, 0).toISOString(), agora), "Sincronizada em 03/11 às 18:00.");
  for (const nada of [null, undefined, "", "lixo"]) assert.equal(N.inbFraseSync(nada, agora), "Ainda não sincronizada.");
});

