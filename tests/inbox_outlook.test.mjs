// RAC Inbox · I4 lote 3 · LEITURA do Outlook / Microsoft (outlook.ts): adaptador com a forma do Worker do iCloud e do Gmail, sincronização pelo MESMO algoritmo (sync.ts) e o MESMO repositório SQL (PGlite com as migrations reais),
// uid sintético por pasta com o ID imutável da Graph em id_externo, leitura de mensagem e anexo, e o serviço completo (refresh do token com refresh novo da Microsoft, estados). Graph de MENTIRA: nada vai à Microsoft. TUDO FICTÍCIO.
// NÃO prova a Graph real (formatos reais, cotas, mensagens exóticas): isso só se prova com a conta real.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { criarWorkerOutlook, UIDVALIDITY_OUTLOOK } from "../supabase/functions/rac-inbox/outlook.ts";
import { sincronizarPasta, filtrarLeitura, filtrarAnexo, filtrarPastas } from "../supabase/functions/rac-inbox/sync.ts";
import { criarRepositorio } from "../supabase/functions/rac-inbox/repositorio.ts";
import { atender } from "../supabase/functions/rac-inbox/servico.ts";
import { empacotarOauth } from "../supabase/functions/rac-inbox/oauth.ts";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite: pula, menos no CI */ }
const pular = !PGlite;
const R = "11111111-1111-4111-8111-111111111111", X = "33333333-3333-4333-8333-333333333333";
const ACESSO = "EwB-acesso-ficticio-0123456789", REFRESH = "M.C-refresh-ficticio-0123456789", REFRESH_NOVO = "M.C-refresh-NOVO-ficticio-0123456789";
const mid = (n) => "AAMk-Msg_" + String(n).padStart(4, "0") + "=";   // ID imutável fictício (letras, números, - _ =)
const FOLDER = { inbox: "AAMk-PastaEntrada=", sentitems: "AAMk-PastaEnviados=", drafts: "AAMk-PastaRascunhos=", deleteditems: "AAMk-PastaLixeira=", junkemail: "AAMk-PastaSpam=", "Pasta-Trabalho_1=": null };

/* ---------- caixa do Outlook de mentira ---------- */
function caixa() {
  const msgs = new Map(), chamadas = []; let falha = null;
  const dt = (m) => new Date(m.data).toISOString();
  const resumo = (m) => ({ id: m.id, receivedDateTime: dt(m), isRead: m.lida !== false, flag: { flagStatus: m.sinal ? "flagged" : "notFlagged" }, from: { emailAddress: { name: m.nome, address: m.de } }, toRecipients: [{ emailAddress: { name: "Eu", address: "eu@outlook.example" } }], subject: m.assunto, internetMessageId: `<m${m.n}@mail.example>`, hasAttachments: !!m.anexos });
  const r = (status, corpo) => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });
  const http = async (url, init = {}) => {
    chamadas.push({ url, init });
    if (falha) { const f = typeof falha === "function" ? falha(url) : falha; if (f) { if (f instanceof Error) throw f; return r(f.status, f.corpo ?? {}); } }
    if ((init.headers || {}).Authorization !== "Bearer " + ACESSO) return r(401, { error: { code: "InvalidAuthenticationToken" } });
    const u = new URL(url), p = decodeURIComponent(u.pathname.replace("/v1.0/me/", ""));
    const ps = /^mailFolders\/(.+?)(\/messages)?$/.exec(p);
    if (p === "mailFolders") return r(200, { value: [...Object.entries(FOLDER).map(([k, v]) => ({ id: v ?? k, displayName: k })), { id: "AAMk-PastaGrande" + "x".repeat(300), displayName: "ignorada" }] });
    if (ps && !ps[2]) { const alias = ps[1]; const id = FOLDER[alias]; if (id === undefined || alias === "archive") { return r(404, { error: { code: "ErrorItemNotFound" } }); } return r(200, { id, totalItemCount: [...msgs.values()].filter((m) => m.pasta === alias).length }); }
    if (ps && ps[2]) {
      if (FOLDER[ps[1]] === undefined && !Object.keys(FOLDER).includes(ps[1])) return r(404, { error: { code: "ErrorItemNotFound" } });
      const max = Number(u.searchParams.get("$top")); let l = [...msgs.values()].filter((m) => m.pasta === ps[1]); l.sort((a, b) => b.data - a.data); const tot = l.length; l = l.slice(0, max);
      return r(200, { value: l.map(resumo), ...(tot > max ? { "@odata.nextLink": "https://graph.microsoft.com/v1.0/proxima" } : {}) });
    }
    const at = /^messages\/(.+?)\/attachments(?:\/(.+))?$/.exec(p);
    if (at) { const m = msgs.get(at[1]); if (!m) return r(404, { error: { code: "ErrorItemNotFound" } });
      if (!at[2]) return r(200, { value: Object.entries(m.anexos ?? {}).map(([id, a]) => ({ id, name: a.nome, contentType: a.tipo, size: a.dados.length, isInline: !!a.inline, "@odata.type": a.item ? "#microsoft.graph.itemAttachment" : "#microsoft.graph.fileAttachment" })) });
      const a = m.anexos?.[at[2]]; return a ? r(200, { id: at[2], contentBytes: Buffer.from(a.dados).toString("base64") }) : r(404, { error: { code: "ErrorItemNotFound" } }); }
    const mm = /^messages\/(.+)$/.exec(p); if (mm) { const m = msgs.get(mm[1]); if (!m) return r(404, { error: { code: "ErrorItemNotFound" } }); return r(200, { ...resumo(m), ccRecipients: m.cc ? [{ emailAddress: { name: "Bia", address: m.cc } }] : [], body: { contentType: m.html ? "html" : "text", content: m.texto ?? "texto" } }); }
    return r(404, { error: { code: "ErrorItemNotFound" } });
  };
  return { msgs, chamadas, http, falha: (f) => { falha = f; },
    add: (n, o = {}) => { const m = { id: mid(n), n, pasta: "inbox", data: 1760000000000 + n * 60000, nome: "Ana " + n, de: `ana${n}@example.com`, assunto: "Assunto " + n, ...o }; msgs.set(m.id, m); return m; } };
}

/* ---------- Postgres de verdade ---------- */
const trecho = (arq, ini, fim) => { const t = ler(arq), i = t.indexOf(ini); return t.slice(i, t.indexOf(fim, i) + fim.length); };
async function banco() {
  const db = await PGlite.create();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; grant usage on schema public to anon, authenticated, service_role; alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role; create schema auth; grant usage on schema auth to anon, authenticated, service_role; create table auth.users (id uuid primary key); create table auth.mfa_factors (user_id uuid, status text);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$; create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub', '')::uuid $$;
    insert into auth.users values ('${R}'), ('${X}'); create schema storage; create table storage.buckets (id text primary key, name text, public boolean default false);`);
  await db.exec(trecho("supabase/002_casa_compartilhada.sql", "create table if not exists public.membros", "grant execute on function public.dono_da_casa() to authenticated;"));
  await db.exec(trecho("supabase/022_seguranca.sql", "create or replace function public.rac_aal_ok()", "grant execute on function public.rac_aal_ok() to authenticated;"));
  for (const f of ["051_inbox_fundacao", "053_inbox_cabecalhos", "054_inbox_automatico"]) await db.exec(ler(`supabase/${f}.sql`));
  return db;
}
const sessaoDe = (q) => ({ exec: async (t, p = []) => (await q.query(t, p)).rows, transacao: (f) => (q.transaction ? q.transaction(async (tx) => f(sessaoDe(tx))) : f(sessaoDe(q))) });
const nova = async (db, dono, prov = "outlook", end = "eu@outlook.example") => (await db.query("insert into public.inbox_contas (dono, provedor, apelido, endereco) values ($1, $2, 'C', $3) returning id", [dono, prov, end])).rows[0].id;
async function preparar(db, repo, conta, cx, dono = R) {
  const w = criarWorkerOutlook({ acesso: ACESSO, http: cx.http, banco: repo, dono, conta });
  const lp = await w.executar("listar_pastas", {}); const salvas = await repo.salvarPastas(dono, conta, filtrarPastas(lp.dados.pastas));
  return { w, pasta: (nome) => salvas.find((s) => s.nome_externo === nome), salvas };
}
const sinc = (w, repo, conta, pastaId, dono = R) => sincronizarPasta({ dono, conta, pastaId, worker: w, banco: repo, credencial: { usuario: "", senha: "" } });
const linhas = async (db, pasta) => (await db.query("select id_externo, uid, uidvalidity, lida, sinalizada, assunto, remetente_nome, remetente_endereco from public.inbox_mensagens_ref where pasta_id = $1 order by uid", [pasta])).rows;

test("listar_pastas: pastas do sistema pelos apelidos da Graph com nomes e usos do Inbox (o que não existe, como Arquivo, fica de fora); pastas do usuário pelo ID; ID grande demais é ignorado", { skip: pular }, async () => {
  const db = await banco(), repo = criarRepositorio(sessaoDe(db)), conta = await nova(db, R), cx = caixa(), { salvas } = await preparar(db, repo, conta, cx);
  assert.deepEqual(salvas.map((s) => [s.nome_externo, s.nome_exibicao, s.uso]), [["inbox", "Caixa de entrada", "entrada"], ["sentitems", "Enviados", "enviados"], ["drafts", "Rascunhos", "rascunhos"], ["deleteditems", "Lixeira", "lixo"], ["junkemail", "Spam", "spam"], ["Pasta-Trabalho_1=", "Pasta-Trabalho_1=", "outra"]]);
  assert.ok(cx.chamadas.every((c) => c.url.startsWith("https://graph.microsoft.com/v1.0/me/") && (c.init.method ?? "GET") === "GET"), "só GET (nas operações de leitura), só na Graph");
  assert.ok(cx.chamadas.every((c) => /ImmutableId/.test(c.init.headers.Prefer)), "IDs imutáveis pedidos em toda chamada");
});

test("sincronização do Outlook pelo MESMO algoritmo: uid sintético crescente (o mais antigo recebe o menor), ID da Graph em id_externo, uidvalidity 1, lida e sinalizada vêm da Graph; repetir não duplica nem muda", { skip: pular }, async () => {
  const db = await banco(), repo = criarRepositorio(sessaoDe(db)), conta = await nova(db, R), cx = caixa();
  cx.add(3, { nome: "José", de: "jose@example.com", assunto: "Água", lida: false, sinal: true }); cx.add(1); cx.add(2); cx.add(9, { pasta: "sentitems", assunto: "enviada" });
  const { w, pasta } = await preparar(db, repo, conta, cx), inbox = pasta("inbox").id;
  const r1 = await sinc(w, repo, conta, inbox); assert.equal(r1.ok, true); assert.deepEqual(r1.dados.sincronizacao, { tipo: "primeira_leitura", novas: 3, atualizadas: 0, removidas: 0 }); assert.equal(r1.dados.mensagens_na_pasta, 3);
  const l = await linhas(db, inbox); assert.deepEqual(l.map((x) => [Number(x.uid), x.id_externo, Number(x.uidvalidity)]), [[1, mid(1), 1], [2, mid(2), 1], [3, mid(3), 1]], "uid 1 = a mais antiga");
  assert.deepEqual([l[2].assunto, l[2].remetente_nome, l[2].remetente_endereco, l[2].lida, l[2].sinalizada, l[1].lida], ["Água", "José", "jose@example.com", false, true, true]);
  assert.deepEqual((await db.query("select uidnext, uidvalidity from public.inbox_sincronizacao where pasta_id = $1", [inbox])).rows[0], { uidnext: 4, uidvalidity: 1 });
  const r2 = await sinc(w, repo, conta, inbox); assert.equal(r2.dados.sincronizacao.tipo, "sem_mudanca"); assert.equal((await linhas(db, inbox)).length, 3, "não duplica");
  assert.equal(UIDVALIDITY_OUTLOOK, 1);
});

test("novas mensagens ganham uids MAIORES; mudança de leitura atualiza; mensagem removida no Outlook sai do cache; a de outra pasta não entra", { skip: pular }, async () => {
  const db = await banco(), repo = criarRepositorio(sessaoDe(db)), conta = await nova(db, R), cx = caixa(); cx.add(1); cx.add(2);
  const { w, pasta } = await preparar(db, repo, conta, cx), inbox = pasta("inbox").id; await sinc(w, repo, conta, inbox);
  cx.add(5); cx.add(4);
  const r = await sinc(w, repo, conta, inbox); assert.deepEqual(r.dados.sincronizacao, { tipo: "novas_mensagens", novas: 2, atualizadas: 2, removidas: 0 });
  assert.deepEqual((await linhas(db, inbox)).map((x) => [Number(x.uid), x.id_externo]), [[1, mid(1)], [2, mid(2)], [3, mid(4)], [4, mid(5)]], "uid 3 = a mais antiga das duas novas");
  cx.msgs.get(mid(1)).lida = true; cx.msgs.delete(mid(2));
  const r3 = await sinc(w, repo, conta, inbox); assert.equal(r3.dados.sincronizacao.removidas, 1); assert.deepEqual((await linhas(db, inbox)).map((x) => [Number(x.uid), x.lida]), [[1, true], [3, true], [4, true]]);
});

test("ler_mensagem: o uid vira o ID da Graph só no servidor; texto, Cc e anexos passam pelo filtro de esquema fechado; HTML vira texto; uid de outra conta/pasta e inexistente são recusados; anexo de arquivo baixa, item e grande demais não", { skip: pular }, async () => {
  const db = await banco(), repo = criarRepositorio(sessaoDe(db)), conta = await nova(db, R), cx = caixa();
  cx.add(1, { cc: "bia@example.com", texto: "Olá, tudo bem?\r\n", anexos: { "AAMk-Anexo1=": { nome: "nota fiscal.pdf", tipo: "application/pdf", dados: "PDF-CONTEUDO" }, "AAMk-Anexo2=": { nome: "msg.eml", tipo: "message/rfc822", dados: "x", item: true } } });
  cx.add(2, { html: true, texto: "<style>x{}</style><p>Oi&nbsp;<b>você</b></p><script>mal()</script>" });
  const { w, pasta } = await preparar(db, repo, conta, cx), inbox = pasta("inbox").id; await sinc(w, repo, conta, inbox);
  const r = await w.executar("ler_mensagem", { pasta: "inbox", uid: 1, uidvalidity_esperado: 1 }); assert.equal(r.ok, true); const f = filtrarLeitura(r.dados); assert.ok(f, "passa pelo filtro de esquema fechado");
  assert.deepEqual([f.mensagem.texto, f.mensagem.formato, f.mensagem.cc, f.mensagem.anexos.map((a) => [a.parte, a.nome, a.tipo])], ["Olá, tudo bem?", "texto", [{ nome: "Bia", endereco: "bia@example.com" }], [["1", "nota fiscal.pdf", "application/pdf"], ["2", "msg.eml", "message/rfc822"]]]); assert.equal(f.mensagem.anexo_provavel, true);
  assert.ok(!JSON.stringify(f).includes(mid(1)), "o ID da Graph nunca chega ao navegador (a resposta usa só o uid)");
  const h = filtrarLeitura((await w.executar("ler_mensagem", { pasta: "inbox", uid: 2, uidvalidity_esperado: 1 })).dados); assert.deepEqual([h.mensagem.texto, h.mensagem.formato], ["Oi você", "html_convertido"]);
  const a = await w.executar("baixar_anexo", { pasta: "inbox", uid: 1, parte: "1" }); assert.equal(Buffer.from(filtrarAnexo(a.dados).anexo.base64, "base64").toString(), "PDF-CONTEUDO"); assert.equal(filtrarAnexo(a.dados).anexo.nome, "nota fiscal.pdf");
  assert.equal((await w.executar("baixar_anexo", { pasta: "inbox", uid: 1, parte: "2" })).erro, "parte_inexistente", "anexo que é mensagem (item) não é baixado"); assert.equal((await w.executar("baixar_anexo", { pasta: "inbox", uid: 1, parte: "9" })).erro, "parte_inexistente");
  assert.equal((await w.executar("ler_mensagem", { pasta: "inbox", uid: 99, uidvalidity_esperado: 1 })).erro, "mensagem_inexistente"); assert.equal((await w.executar("ler_mensagem", { pasta: "inbox", uid: 1, uidvalidity_esperado: 2 })).erro, "uidvalidity_mudou");
  const c2 = await nova(db, R, "outlook", "outra@outlook.example"), w2 = (await preparar(db, repo, c2, caixa())).w; assert.equal((await w2.executar("ler_mensagem", { pasta: "inbox", uid: 1, uidvalidity_esperado: 1 })).erro, "mensagem_inexistente", "a outra conta não alcança o uid da primeira");
  const wx = criarWorkerOutlook({ acesso: ACESSO, http: cx.http, banco: repo, dono: X, conta }); assert.equal((await wx.executar("ler_mensagem", { pasta: "inbox", uid: 1, uidvalidity_esperado: 1 })).erro, "pasta_inexistente", "outro usuário não alcança a pasta");
  cx.msgs.get(mid(1)).anexos["AAMk-Anexo1="].dados = "x".repeat(3 * 1024 * 1024 + 1); assert.equal((await w.executar("baixar_anexo", { pasta: "inbox", uid: 1, parte: "1" })).erro, "anexo_grande_demais");
});

test("erros da Graph viram códigos fechados: 401/403 = autenticação recusada (reconectar), limitação = http_429, 5xx = http_NNN, rede = canal_falhou; nada do corpo do erro é repassado; nada escreve na caixa", async () => {
  const cx = caixa(), repoFalso = { pastaIdPorNome: async () => "p", idsExternos: async () => new Map(), maiorUid: async () => 0, idExterno: async () => mid(1) };
  const w = criarWorkerOutlook({ acesso: ACESSO, http: cx.http, banco: repoFalso, dono: R, conta: R });
  for (const [f, esperado] of [[{ status: 401, corpo: { error: { message: "SEGREDO-DA-MICROSOFT" } } }, "autenticacao_recusada"], [{ status: 403, corpo: { error: { code: "ErrorAccessDenied" } } }, "autenticacao_recusada"], [{ status: 429, corpo: {} }, "http_429"],
    [{ status: 503, corpo: {} }, "http_503"], [new Error("SEGREDO-DE-REDE"), "canal_falhou"]]) {
    cx.falha(f); const r = await w.executar("testar_conta", {}); assert.deepEqual([r.ok, r.erro], [false, esperado]); assert.ok(!JSON.stringify(r).includes("SEGREDO"), "o texto do erro nunca é copiado");
  }
  cx.falha(null); cx.add(1); assert.equal((await w.executar("testar_conta", {})).ok, true); assert.equal((await w.executar("enviar", {})).erro, "operacao_desconhecida", "verbo desconhecido continua recusado");
  const m = caixa(); const wm = criarWorkerOutlook({ acesso: "token-errado", http: m.http, banco: repoFalso, dono: R, conta: R }); assert.equal((await wm.executar("listar_pastas", {})).erro, "autenticacao_recusada");
  assert.equal((await w.executar("listar_mensagens", { pasta: "../etc/passwd" })).erro, "pasta_inexistente", "o nome da pasta é validado antes de ir à URL");
  const src = ler("supabase/functions/rac-inbox/outlook.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""); assert.ok(!/method:\s*"PUT"|\/copy|\/permanentDelete/i.test(src), "nenhuma cópia nem exclusão permanente (o lote 4 só gerencia e envia; Itens Excluídos é o fim)");
});

/* ---------- o serviço completo ---------- */
const CFG = { outlook: { clientId: "id-ms.example", clientSecret: "SEGREDO-MS", redirectUri: "https://site.example/" } };
function ctxServico(db, repo, cx, conta, { tokenResp = { status: 200, corpo: { access_token: ACESSO, refresh_token: REFRESH_NOVO, expires_in: 3599 } } } = {}) {
  const seg = new Map([[R + "|" + conta, empacotarOauth(REFRESH)]]), eventos = [], logs = [], tokens = [];
  const cofre = { async ler(d, c) { return seg.get(d + "|" + c) ?? null; }, async marcar(d, c, e) { eventos.push(["marcar", e]); }, async guardar(d, c, s) { seg.set(d + "|" + c, s); eventos.push(["guardar"]); }, async remover() { return true; }, async estado() { return "ativa"; } };
  const http = async (url, init) => { if (url.startsWith("https://login.microsoftonline.com/")) { tokens.push(init.body); return { ok: tokenResp.status === 200, status: tokenResp.status, json: async () => tokenResp.corpo }; } return cx.http(url, init); };
  const banco = { ...repo, async estadoConta(d, c, e, er) { eventos.push(["conta", e, er]); await repo.estadoConta(d, c, e, er); } };
  return { c: { usuario: { id: R, mfaOk: true }, cofre, banco, worker: null, oauth: CFG, http, registrar: (e) => logs.push(e) }, eventos, logs, tokens, seg };
}
test("serviço: conta Outlook lista pastas, sincroniza, lê e baixa SEM Worker do iCloud; o acesso vem do refresh a cada chamada; o refresh novo da Microsoft é regravado; nada vaza", { skip: pular }, async () => {
  const db = await banco(), repo = criarRepositorio(sessaoDe(db)), conta = await nova(db, R), cx = caixa(); cx.add(1, { texto: "corpo" });
  const s = ctxServico(db, repo, cx, conta), pedir = (o) => atender({ conta_id: conta, ...o }, s.c);
  const lp = await pedir({ operacao: "listar_pastas" }); assert.equal(lp.status, 200); const inbox = lp.corpo.pastas.find((p) => p.uso === "entrada").id;
  const sy = await pedir({ operacao: "sincronizar_pasta", pasta_id: inbox }); assert.deepEqual([sy.status, sy.corpo.sincronizacao.tipo, sy.corpo.sincronizacao.novas, sy.corpo.mensagens_na_pasta], [200, "primeira_leitura", 1, 1]);
  const lm = await pedir({ operacao: "ler_mensagem", pasta_id: inbox, uid: 1 }); assert.deepEqual([lm.status, lm.corpo.mensagem.texto], [200, "corpo"]);
  assert.ok(s.tokens.length >= 3 && s.tokens.every((t) => new URLSearchParams(t).get("grant_type") === "refresh_token"), "um refresh por operação");
  assert.equal(s.seg.get(R + "|" + conta), empacotarOauth(REFRESH_NOVO), "o refresh token novo da Microsoft substitui o antigo no cofre");
  const tudo = JSON.stringify([lp, sy, lm, s.logs]); for (const x of [ACESSO, REFRESH, REFRESH_NOVO, "SEGREDO-MS", mid(1)]) assert.ok(!tudo.includes(x), "vazou: " + x);
  assert.ok(s.eventos.some((e) => e[0] === "conta" && e[1] === "conectada"));
});
test("serviço: refresh recusado marca a credencial inválida e a conta em erro de autenticação; falha temporária da Microsoft não invalida; falha ao regravar o refresh novo não derruba a operação; envio/gerenciamento do Outlook respondem honestamente; sem a configuração Microsoft a resposta é honesta", { skip: pular }, async () => {
  const db = await banco(), repo = criarRepositorio(sessaoDe(db)), conta = await nova(db, R), cx = caixa();
  const ruim = ctxServico(db, repo, cx, conta, { tokenResp: { status: 400, corpo: { error: "invalid_grant" } } }); const r = await atender({ operacao: "testar_conta", conta_id: conta }, ruim.c);
  assert.deepEqual([r.status, r.corpo.erro], [422, "credencial_invalida"]); assert.ok(ruim.eventos.some((e) => e[0] === "marcar" && e[1] === "invalida")); assert.ok(ruim.eventos.some((e) => e[0] === "conta" && e[1] === "erro_autenticacao"));
  const fora = ctxServico(db, repo, cx, conta, { tokenResp: { status: 503, corpo: {} } }); const r2 = await atender({ operacao: "testar_conta", conta_id: conta }, fora.c); assert.equal(r2.corpo.erro, "servico_indisponivel"); assert.ok(!fora.eventos.some((e) => e[1] === "invalida"));
  const mudo = ctxServico(db, repo, cx, conta); cx.add(1); mudo.c.cofre.guardar = async () => { throw new Error("cofre fora"); }; assert.equal((await atender({ operacao: "testar_conta", conta_id: conta }, mudo.c)).status, 200, "o refresh anterior segue valendo");
  const ok = ctxServico(db, repo, cx, conta); const pasta = "bbbbbbbb-0000-4000-8000-000000000001", uuid = "aaaaaaaa-0000-4000-8000-000000000001";
  for (const o of [{ operacao: "organizar_mensagem", conta_id: conta, pasta_id: pasta, uid: 1, acao: "arquivar" }, { operacao: "smtp_prova", conta_id: conta, enviar_teste: false }, { operacao: "enviar_mensagem", conta_id: conta, envio_id: uuid, modo: "novo", para: ["a@example.com"], cc: [], cco: [], assunto: "x", texto: "y" }]) assert.equal((await atender(o, ok.c)).corpo.erro, "provedor_sem_operacao", o.operacao);
  assert.equal((await atender({ operacao: "testar_conta", conta_id: conta }, { ...ok.c, oauth: {} })).corpo.erro, "oauth_nao_configurado");
  assert.equal((await atender({ operacao: "testar_conta", conta_id: conta }, { ...ok.c, oauth: { gmail: CFG.outlook } })).corpo.erro, "oauth_nao_configurado", "a configuração do Google nunca serve ao Outlook");
});
