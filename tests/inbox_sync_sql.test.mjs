// RAC Inbox · I2 · migration 053 (PREPARADA, NÃO APLICADA em produção) e o repositório SQL da sincronização (supabase/functions/rac-inbox/repositorio.ts), num Postgres de verdade dentro do Node (PGlite):
// o MESMO texto SQL que a função usa roda aqui com a conexão do DONO das tabelas (como em produção, fora do RLS), e o RLS é provado com os papéis authenticated/anon.
// Tudo fictício. Limitação: o PGlite prova o PostgreSQL; NÃO prova o Supabase real, o driver postgres.js da função (Deno) nem o travamento entre conexões (o PGlite tem uma só): isso é validação do dono/real.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { criarRepositorio, literalArray } from "../supabase/functions/rac-inbox/repositorio.ts";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const semComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite: pula, menos no CI */ }
const pular = !PGlite;
const S53 = ler("supabase/053_inbox_cabecalhos.sql");
const R = "11111111-1111-4111-8111-111111111111", F = "22222222-2222-4222-8222-222222222222", X = "33333333-3333-4333-8333-333333333333", M = "44444444-4444-4444-8444-444444444444";

test("no CI o PGlite está instalado: os testes de banco da 053 não podem ser pulados", () => { if (process.env.CI) assert.ok(PGlite, "sem PGlite no CI (testes.yml instala o @electric-sql/pglite)"); });

test("053 (texto): pendente, uma transação, só ALTERA o que já existe (nada destrutivo), sem coluna de corpo, HTML, prévia ou anexo, sem service_role", () => {
  assert.equal(S53.split("\n")[0], "-- status: pendente", "o banco real ainda não tem: tests/banco.test.mjs a trata como pendente (todo)");
  assert.match(S53, /NÃO APLICADA/); assert.match(S53, /\nbegin;[\s\S]*\ncommit;/);
  const s = semComent(S53);
  assert.ok(!/\bdrop\b|\btruncate\b|\bdelete\b|\bupdate\b|\binsert\b|\bgrant\b|service_role|disable row level|create table/i.test(s), "só altera: sem apagar, sem mudar privilégio, sem tabela nova");
  assert.deepEqual([...s.matchAll(/add column if not exists (\w+)/g)].map((m) => m[1]), ["recebida_em", "assunto", "remetente_nome", "remetente_endereco", "destinatarios", "lida", "sinalizada", "respondida", "tamanho", "anexo_provavel", "message_id", "sincronizada_em", "nome_exibicao"]);
  assert.ok(![...s.matchAll(/add column if not exists (\w+)/g)].some((m) => /corpo|body|html|previa|snippet|conteudo|content|mime|^anexos?$|attachment|senha|token|segredo/i.test(m[1])), "nenhuma coluna de corpo, prévia, anexo ou credencial");
  assert.match(s, /create index if not exists inbox_ref_lista/);
});

/* ---------- Postgres de verdade ---------- */
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
    insert into auth.users values ('${R}'), ('${F}'), ('${X}'), ('${M}'); insert into auth.mfa_factors values ('${M}', 'verified');
    create schema storage; create table storage.buckets (id text primary key, name text, public boolean default false);
  `);
  await db.exec(trecho("supabase/002_casa_compartilhada.sql", "create table if not exists public.membros", "grant execute on function public.dono_da_casa() to authenticated;"));
  await db.exec(trecho("supabase/022_seguranca.sql", "create or replace function public.rac_aal_ok()", "grant execute on function public.rac_aal_ok() to authenticated;"));
  await db.exec(`insert into public.membros (membro, dono) values ('${F}', '${R}');`);
  await db.exec(ler("supabase/051_inbox_fundacao.sql"));
  await db.exec(S53);
  await db.exec(S53);   // reexecutável: roda de novo sem erro
  return db;
}
const sessaoDe = (q) => ({ exec: async (t, p = []) => (await q.query(t, p)).rows, transacao: (f) => (q.transaction ? q.transaction(async (tx) => f(sessaoDe(tx))) : f(sessaoDe(q))) });
async function como(db, papel, uid, sql, params = [], aal = "aal1") {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, role: papel, aal })]); await db.exec("set role " + papel);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); }
}
const codigo = async (p) => { try { await p; } catch (e) { return e.code || String(e.message); } return null; };
async function conta(db, dono = R) { return (await db.query("insert into public.inbox_contas (dono, provedor, apelido, endereco) values ($1, 'icloud', 'Pessoal', 'pessoa@icloud.example') returning id", [dono])).rows[0].id; }
const msg = (uid, extra = {}) => ({ uid, recebida: "2026-11-14T10:" + String(uid).padStart(2, "0") + ":00.000Z", tamanho: 1000 + uid, lida: false, sinalizada: false, respondida: false, de: { nome: "Ana", endereco: "ana@exemplo.com" }, para: [{ nome: "Eu", endereco: "eu@icloud.com" }], assunto: "Assunto " + uid, message_id: "<m" + uid + "@x>", anexo_provavel: false, ...extra });
const sync = (uidvalidity, mensagens, extra = {}) => ({ uidvalidity, cursor: Math.max(...mensagens.map((m) => m.uid), 0) + 1, tipo: "primeira_leitura", total: mensagens.length, duracao_ms: 12, mensagens, purgar: false, removerDe: 1, removerAte: Math.max(...mensagens.map((m) => m.uid), 1), ...extra });
const cache = async (db, pasta) => (await db.query("select uid, lida, assunto, id_externo, remetente_endereco, destinatarios from public.inbox_mensagens_ref where pasta_id = $1 order by uid", [pasta])).rows;

test("PGlite · 053 roda duas vezes; o banco tem onde guardar CABEÇALHOS e nenhum lugar para corpo, HTML, prévia, anexo ou credencial", { skip: pular }, async () => {
  const db = await banco();
  const cols = (await db.query("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'inbox_mensagens_ref' order by 1")).rows.map((r) => r.column_name);
  for (const c of ["recebida_em", "assunto", "remetente_endereco", "destinatarios", "lida", "sinalizada", "respondida", "tamanho", "anexo_provavel", "message_id"]) assert.ok(cols.includes(c), c);
  assert.deepEqual(cols.filter((c) => /corpo|body|html|previa|snippet|conteudo|content|mime|attachment|senha|password|token|segredo|credencial|^anexos?$/i.test(c)), [], "nenhuma coluna de conteúdo pesado nem de segredo");
  const tab = (await db.query("select relname, relrowsecurity from pg_class where relname = 'inbox_mensagens_ref'")).rows; assert.deepEqual(tab.map((r) => r.relrowsecurity), [true], "continua com RLS");
  const pol = (await db.query("select policyname, permissive from pg_policies where tablename = 'inbox_mensagens_ref' order by 1")).rows.map((r) => r.policyname + ":" + r.permissive); assert.deepEqual(pol, ["mfa:RESTRICTIVE", "so o dono:PERMISSIVE"], "as políticas da 051 seguem valendo");
  const anon = (await db.query("select privilege_type from information_schema.role_table_grants where grantee = 'anon' and table_name = 'inbox_mensagens_ref'")).rows; assert.deepEqual(anon, [], "anon não tem nada");
});

test("PGlite · repositório: pastas (upsert, nome legível, some quem sumiu), primeira leitura, idempotência, flags, remoções, UIDVALIDITY e contagens", { skip: pular }, async () => {
  const db = await banco(), repo = criarRepositorio(sessaoDe(db)), c = await conta(db);
  // pastas: o nome com vírgula, chaves, espaço e acento (literal de array do Postgres escapado)
  const nomes = ["INBOX", "Sent Messages", "Pasta, com {chaves} e \"aspas\"", "&AOk-s"];
  let salvas = await repo.salvarPastas(R, c, [{ nome: nomes[0], nome_exibicao: "INBOX", uso: "entrada", selecionavel: true }, { nome: nomes[1], nome_exibicao: "Sent Messages", uso: "enviados", selecionavel: true }, { nome: nomes[2], nome_exibicao: nomes[2], uso: "outra", selecionavel: true }, { nome: nomes[3], nome_exibicao: "és", uso: "outra", selecionavel: true }, { nome: "Pai", nome_exibicao: "Pai", uso: "outra", selecionavel: false }]);
  assert.deepEqual(salvas.map((s) => s.nome_exibicao).sort(), ["INBOX", "Pasta, com {chaves} e \"aspas\"", "Sent Messages", "és"].sort(), "a pasta não selecionável não é oferecida");
  assert.equal(literalArray(['a"b', "c\\d", "e,f"]), '{"a\\"b","c\\\\d","e,f"}');
  const inbox = salvas.find((s) => s.nome_externo === "INBOX").id;
  salvas = await repo.salvarPastas(R, c, [{ nome: "INBOX", nome_exibicao: "Caixa", uso: "entrada", selecionavel: true }]);   // as outras sumiram do provedor
  assert.deepEqual(salvas.map((s) => [s.nome_externo, s.nome_exibicao, s.id === inbox]), [["INBOX", "Caixa", true]], "mesma linha (id estável), nome atualizado");
  assert.equal((await db.query("select count(*)::int n from public.inbox_pastas where conta_id = $1 and ativa", [c])).rows[0].n, 1);
  assert.deepEqual(await repo.pasta(R, c, inbox), { id: inbox, nome_externo: "INBOX" });
  assert.equal(await repo.pasta(X, c, inbox), null, "outro dono não resolve a pasta"); assert.equal(await repo.pasta(R, c, "99999999-9999-4999-8999-999999999999"), null);
  assert.equal(await repo.estadoSync(R, c, inbox), null, "ainda sem cursor");

  // primeira leitura: 3 mensagens
  let r = await repo.aplicarSync(R, c, inbox, sync(700, [msg(3), msg(2, { lida: true }), msg(1)]));
  assert.deepEqual(r, { novas: 3, atualizadas: 0, removidas: 0 });
  assert.deepEqual((await cache(db, inbox)).map((m) => [m.uid, m.lida, m.id_externo, m.assunto]), [[1, false, "700:1", "Assunto 1"], [2, true, "700:2", "Assunto 2"], [3, false, "700:3", "Assunto 3"]]);
  assert.deepEqual((await cache(db, inbox))[0].destinatarios, [{ nome: "Eu", endereco: "eu@icloud.com" }]);
  assert.deepEqual(await repo.estadoSync(R, c, inbox), { uidvalidity: 700, uidnext: 4 }, "o cursor é número (bigint convertido)");
  const p = (await db.query("select total, nao_lidas from public.inbox_pastas where id = $1", [inbox])).rows[0]; assert.deepEqual([p.total, p.nao_lidas], [3, 2]);
  const sy = (await db.query("select tipo_ultima, falhas_seguidas, erro, duracao_ms from public.inbox_sincronizacao where pasta_id = $1", [inbox])).rows[0]; assert.deepEqual([sy.tipo_ultima, sy.falhas_seguidas, sy.erro, sy.duracao_ms], ["primeira_leitura", 0, null, 12]);

  // de novo, igual: nada duplica (idempotente); flag mudou no provedor → atualiza
  r = await repo.aplicarSync(R, c, inbox, sync(700, [msg(3), msg(2, { lida: true }), msg(1, { lida: true, sinalizada: true })], { tipo: "sem_mudanca" }));
  assert.deepEqual(r, { novas: 0, atualizadas: 3, removidas: 0 }); assert.equal((await cache(db, inbox)).length, 3, "sem duplicar");
  assert.equal((await db.query("select sinalizada from public.inbox_mensagens_ref where uid = 1 and pasta_id = $1", [inbox])).rows[0].sinalizada, true);
  assert.equal((await db.query("select nao_lidas from public.inbox_pastas where id = $1", [inbox])).rows[0].nao_lidas, 1);

  // mensagem nova (uid 4) e a 2 foi apagada no provedor
  r = await repo.aplicarSync(R, c, inbox, sync(700, [msg(4), msg(3), msg(1, { lida: true })], { tipo: "novas_mensagens" }));
  assert.deepEqual(r, { novas: 1, atualizadas: 2, removidas: 1 }, "a que sumiu do provedor sai do cache");
  assert.deepEqual((await cache(db, inbox)).map((m) => m.uid), [1, 3, 4]);

  // a janela só cobre o fim da caixa (removerDe = 3): o que é MAIS ANTIGO que a janela não é apagado por não ter vindo
  r = await repo.aplicarSync(R, c, inbox, sync(700, [msg(4), msg(3)], { removerDe: 3, tipo: "sem_mudanca" }));
  assert.deepEqual(r, { novas: 0, atualizadas: 2, removidas: 0 }); assert.deepEqual((await cache(db, inbox)).map((m) => m.uid), [1, 3, 4], "a uid 1 fica: fora da faixa lida");

  // UIDVALIDITY mudou: apaga tudo da pasta e relê (as chaves antigas "700:n" não valem mais)
  r = await repo.aplicarSync(R, c, inbox, sync(800, [msg(1), msg(2)], { purgar: true, tipo: "uidvalidity_mudou" }));
  assert.deepEqual(r, { novas: 2, atualizadas: 0, removidas: 0 }); assert.deepEqual((await cache(db, inbox)).map((m) => m.id_externo), ["800:1", "800:2"]);
  assert.deepEqual(await repo.estadoSync(R, c, inbox), { uidvalidity: 800, uidnext: 3 });

  // pasta vazia: nada para gravar, e o que havia na faixa some
  r = await repo.aplicarSync(R, c, inbox, { uidvalidity: 800, cursor: 3, tipo: "novas_mensagens", total: 0, duracao_ms: null, mensagens: [], purgar: false, removerDe: 1, removerAte: 2 });
  assert.deepEqual(r, { novas: 0, atualizadas: 0, removidas: 2 }); assert.equal((await cache(db, inbox)).length, 0);
  assert.deepEqual((await db.query("select total, nao_lidas from public.inbox_pastas where id = $1", [inbox])).rows[0], { total: 0, nao_lidas: 0 });

  // falha: conta as seguidas e guarda só o código; a próxima ok zera
  await repo.falhaSync(R, c, inbox, "servico_indisponivel"); await repo.falhaSync(R, c, inbox, "timeout_x");
  let s2 = (await db.query("select falhas_seguidas, erro, uidnext from public.inbox_sincronizacao where pasta_id = $1", [inbox])).rows[0]; assert.deepEqual([s2.falhas_seguidas, s2.erro, Number(s2.uidnext)], [2, "timeout_x", 3], "o cursor não se perde na falha");
  await repo.aplicarSync(R, c, inbox, sync(800, [msg(1)], { tipo: "novas_mensagens" }));
  s2 = (await db.query("select falhas_seguidas, erro from public.inbox_sincronizacao where pasta_id = $1", [inbox])).rows[0]; assert.deepEqual([s2.falhas_seguidas, s2.erro], [0, null]);
  await repo.estadoConta(R, c, "erro_autenticacao", "credencial_invalida");
  assert.deepEqual((await db.query("select estado, ultimo_erro from public.inbox_contas where id = $1", [c])).rows[0], { estado: "erro_autenticacao", ultimo_erro: "credencial_invalida" });
  await repo.estadoConta(R, c, "conectada", null); assert.equal((await db.query("select estado from public.inbox_contas where id = $1", [c])).rows[0].estado, "conectada");
  assert.equal(await repo.travar(c), true, "o travamento por conta funciona (a exclusão entre conexões é validação real)"); await repo.destravar(c);
});

test("PGlite · transação: falha no meio desfaz tudo; e o dono errado nunca grava na conta de outro (chave composta)", { skip: pular }, async () => {
  const db = await banco(), repo = criarRepositorio(sessaoDe(db)), c = await conta(db);
  const [{ id: inbox }] = await repo.salvarPastas(R, c, [{ nome: "INBOX", nome_exibicao: "INBOX", uso: "entrada", selecionavel: true }]);
  await repo.aplicarSync(R, c, inbox, sync(700, [msg(1), msg(2)]));
  // lote com uma mensagem que viola uma restrição (assunto > 500): nada do lote entra, nem o cursor, nem a remoção
  const ruim = await codigo(repo.aplicarSync(R, c, inbox, sync(700, [msg(3), msg(2, { assunto: "x".repeat(501) })], { removerDe: 1, tipo: "novas_mensagens" })));
  assert.ok(ruim, "o banco recusou o lote"); assert.deepEqual((await cache(db, inbox)).map((m) => m.uid), [1, 2], "nada mudou"); assert.deepEqual(await repo.estadoSync(R, c, inbox), { uidvalidity: 700, uidnext: 3 });
  // dono X tentando gravar na conta de R
  assert.ok(await codigo(repo.aplicarSync(X, c, inbox, sync(700, [msg(9)]))), "dono diferente: a chave composta (pasta, conta, dono) recusa");
  assert.deepEqual((await cache(db, inbox)).map((m) => m.uid), [1, 2]);
  assert.equal(await repo.estadoSync(X, c, inbox), null, "e o cursor de R não aparece para X");
  assert.equal((await repo.salvarPastas(X, await conta(db, X), [{ nome: "INBOX", nome_exibicao: "INBOX", uso: "entrada", selecionavel: true }])).length, 1, "X tem as próprias pastas, separadas");
  assert.ok(await codigo(repo.salvarPastas(X, c, [{ nome: "Outra", nome_exibicao: "Outra", uso: "outra", selecionavel: true }])), "X não cria pasta na conta de R");
  // apagar a conta apaga pastas, cursor e cache
  await db.query("delete from public.inbox_contas where id = $1", [c]);
  for (const t of ["inbox_pastas", "inbox_sincronizacao", "inbox_mensagens_ref"]) assert.equal((await db.query(`select count(*)::int n from public.${t} where conta_id = $1`, [c])).rows[0].n, 0, t + ": caiu junto com a conta");
});

test("PGlite · RLS do cache: o dono lê e apaga o próprio; outro usuário, a casa (Fernanda) e anon não veem nem apagam nada; sem MFA (aal1) o dono com fator verificado também não", { skip: pular }, async () => {
  const db = await banco(), repo = criarRepositorio(sessaoDe(db)), c = await conta(db);
  const [{ id: inbox }] = await repo.salvarPastas(R, c, [{ nome: "INBOX", nome_exibicao: "INBOX", uso: "entrada", selecionavel: true }]);
  await repo.aplicarSync(R, c, inbox, sync(700, [msg(1), msg(2)]));
  const ver = (uid, aal) => como(db, "authenticated", uid, "select uid, assunto from public.inbox_mensagens_ref order by uid", [], aal);
  assert.deepEqual((await ver(R)).map((m) => m.uid), [1, 2], "o dono lê o próprio cache");
  assert.deepEqual(await ver(X), [], "outro usuário não vê"); assert.deepEqual(await ver(F), [], "a casa (Fernanda) não vê nada do Inbox");
  assert.ok(await codigo(como(db, "anon", R, "select * from public.inbox_mensagens_ref")), "anon nem consulta");
  assert.deepEqual(await como(db, "authenticated", X, "delete from public.inbox_mensagens_ref returning uid"), [], "outro usuário não apaga");
  assert.ok(await codigo(como(db, "authenticated", R, "update public.inbox_mensagens_ref set assunto = 'x'")), "o navegador não edita o cache (sem privilégio de update): quem grava é só a função");
  // dono com MFA cadastrado, mas sessão aal1: a trava restritiva barra
  await db.query("insert into public.inbox_contas (dono, provedor, apelido, endereco) values ($1, 'icloud', 'M', 'm@icloud.example')", [M]);
  assert.deepEqual(await como(db, "authenticated", M, "select * from public.inbox_mensagens_ref", [], "aal1"), []);
  assert.equal((await como(db, "authenticated", R, "delete from public.inbox_mensagens_ref where uid = 1 returning uid")).length, 1, "o dono pode limpar o cache (a caixa no provedor não é tocada)");
});

test("repositorio.ts (texto): todo valor por parâmetro, sempre filtrado por dono e conta, sem corpo nem anexo, sem Deno e sem a chave de serviço", () => {
  const t = ler("supabase/functions/rac-inbox/repositorio.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");   // sem comentários
  assert.ok(!/Deno|service_role|SERVICE_ROLE|\.rpc\(|console\./.test(t));
  const textos = [...t.matchAll(/`([^`]*)`|"((?:select|update|delete|insert)[^"]*)"/gi)].map((m) => m[1] ?? m[2]);
  assert.ok(textos.length >= 12, "leu as consultas");
  for (const q of textos) {
    assert.ok(!/\$\{(?!SEM_PASTA\})/.test(q), "só a constante SEM_PASTA entra por interpolação: nada vindo do e-mail ou do navegador");
    if (/^\s*(select|update|delete)/i.test(q) && !/pg_(try_)?advisory|pg_advisory/.test(q)) assert.match(q, /dono/i, "consulta sem filtro de dono: " + q.slice(0, 80));
  }
  assert.ok(!/\b(corpo|body|html|previa|snippet|anexos?\b|attachment)/i.test(t.replace(/anexo_provavel/g, "")), "o repositório não toca em corpo, prévia nem anexo");
});
