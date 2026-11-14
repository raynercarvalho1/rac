// RAC Inbox · I1 · migration 052 (custódia de credenciais no Vault; PREPARADA, NÃO APLICADA): texto do SQL e, num Postgres de verdade dentro do Node (PGlite), o ciclo de vida
// da credencial (guardar, ler, substituir, remover), o isolamento entre usuários, os privilégios (nenhuma RPC, nenhuma leitura do Vault pelo site) e a falha segura do Vault.
// TUDO FICTÍCIO: os "segredos" abaixo são textos de teste que NÃO são senhas de ninguém. Sem rede, sem Supabase.
// LIMITAÇÃO IMPORTANTE: o PGlite não tem a extensão supabase_vault. Um Vault de MENTIRA (schema vault com as mesmas assinaturas e a mesma view decrypted_secrets, SEM criptografia)
// faz o papel dele. Isto prova a LÓGICA das nossas funções, gatilhos, chaves e privilégios; NÃO prova a criptografia nem o Vault real, que só se confere em produção (conferir() e as
// consultas de privilégio do rodapé da 052), pelo dono, depois de aplicar a migration.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const semComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite: pula, menos no CI */ }
const pular = !PGlite;
const S51 = ler("supabase/051_inbox_fundacao.sql"), S52 = ler("supabase/052_inbox_cofre.sql");
const FUNCOES = ["apaga_segredo()", "fixa_ponteiro()", "guardar(uuid, uuid, text)", "ler(uuid, uuid)", "remover(uuid, uuid)", "estado(uuid, uuid)", "marcar(uuid, uuid, text)", "conferir()"];
const SEGREDO_A = '{"u":"a@icloud.example","s":"aaaa-bbbb-cccc-dddd"}', SEGREDO_A2 = '{"u":"a@icloud.example","s":"eeee-ffff-gggg-hhhh"}', SEGREDO_B = '{"u":"b@icloud.example","s":"zzzz-yyyy-xxxx-wwww"}';

test("no CI o PGlite está instalado: os testes de banco da 052 não podem ser pulados", () => { if (process.env.CI) assert.ok(PGlite, "sem PGlite no CI (testes.yml instala o @electric-sql/pglite)"); });

test("052 (texto): pendente, uma transação, schema PRIVADO, nenhuma função em public, nenhum grant para o site além da leitura de colunas não sensíveis, nada escreve o segredo em log ou erro", () => {
  assert.equal(S52.split("\n")[0], "-- status: pendente"); assert.match(S52, /NÃO APLICADA/); assert.match(S52, /\nbegin;[\s\S]*\ncommit;/);
  const s = semComent(S52);
  assert.match(s, /create schema if not exists inbox_cofre;/); assert.match(s, /revoke all on schema inbox_cofre from public, anon, authenticated, service_role;/);
  assert.ok(!/create (or replace )?function public\./i.test(s), "nenhuma função em public: nada vira RPC da Data API");
  assert.ok(!/\bgrant\s+execute\b/i.test(s) && !/\bgrant\s+usage\b/i.test(s), "ninguém ganha execução nem uso do schema");
  for (const f of FUNCOES) assert.ok(s.includes(`revoke all on function inbox_cofre.${f} from public, anon, authenticated, service_role;`), f + " revogada de todos");
  const defs = [...s.matchAll(/create or replace function inbox_cofre\.([a-z_]+)\(/g)].map((m) => m[1]); assert.equal(defs.length, FUNCOES.length);
  for (const bloco of s.split(/create or replace function /).slice(1)) assert.match(bloco.slice(0, 400), /security definer set search_path = ''|stable security definer set search_path = ''/, "toda função é definer com search_path vazio");
  assert.ok(!/raise\s+(notice|info|warning|log|debug)[^;]*(p_segredo|v_segredo)/i.test(s), "nenhum aviso com o segredo");
  assert.ok(![...s.matchAll(/raise exception ([^;]*);/g)].some((m) => /p_segredo|v_segredo|\|\|/.test(m[1])), "nenhuma mensagem de erro monta texto com dado: só códigos fixos");
  const grants = (s.match(/grant [^;]+;/gi) || []).map((g) => g.replace(/\s+/g, " "));
  assert.deepEqual(grants, ["grant select (id, dono, conta_id, estado, criado_em, atualizado_em, ultima_validacao_em) on public.inbox_credenciais to authenticated;"], "o único grant: ler colunas não sensíveis (sem segredo_id)");
  assert.ok(!/\b(senha|password|token)\b\s+(text|uuid)/i.test(s), "nenhuma coluna de senha ou token");
  assert.ok(!/service_role/.test(s.replace(/revoke[^;]*;/gi, "")), "service_role só aparece nas revogações");
  assert.match(s, /vault\.create_secret\(p_segredo, v_nome,/); assert.match(s, /vault\.update_secret\(v_sid, p_segredo, v_nome,/); assert.match(s, /vault\.decrypted_secrets d on d\.id = k\.segredo_id and d\.name = 'inbox_conta_' \|\| k\.conta_id::text/);
  assert.match(s, /foreach t in array array\['inbox_credenciais'\] loop/); assert.match(s, /as restrictive for all to authenticated using \(\(select public\.rac_aal_ok\(\)\)\)/);
  assert.match(S52, /insert into public\.seguranca_catalogo[\s\S]*'inbox_credenciais', true, false, '052'/, "no catálogo com a trava e FORA do backup");
  assert.ok(!/inbox_credenciais/.test(fs.readFileSync(new URL("../nucleo.js", import.meta.url), "utf8")), "a tabela de ponteiros não entra no backup do site (NUCLEO.SEG_TABELAS)");
  assert.ok(JSON.parse(/for \(const t of (\[[^\]]+\])\)/.exec(ler("tests/seguranca.test.mjs"))[1]).includes("inbox_credenciais"), "sem login não lê (tests/seguranca.test.mjs)");
});

/* ---------- Postgres de verdade + Vault de mentira ---------- */
const A = "11111111-1111-4111-8111-111111111111", F = "22222222-2222-4222-8222-222222222222", B = "33333333-3333-4333-8333-333333333333", M = "44444444-4444-4444-8444-444444444444";
const trecho = (arq, ini, fim) => { const t = ler(arq), i = t.indexOf(ini); assert.ok(i >= 0, ini); return t.slice(i, t.indexOf(fim, i) + fim.length); };
const VAULT_FALSO = `
  create schema vault;
  create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, description text not null default '', secret text not null, key_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
  create function vault.create_secret(new_secret text, new_name text default null, new_description text default '', new_key_id uuid default null) returns uuid language plpgsql as $$
    declare i uuid; begin insert into vault.secrets (secret, name, description) values (new_secret, new_name, new_description) returning id into i; return i; end $$;
  create function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null, new_key_id uuid default null) returns void language plpgsql as $$
    begin update vault.secrets set secret = coalesce(new_secret, secret), name = coalesce(new_name, name), description = coalesce(new_description, description), updated_at = now() where id = secret_id;
    if not found then raise exception 'segredo inexistente'; end if; end $$;
  create view vault.decrypted_secrets as select id, name, description, secret, secret as decrypted_secret, key_id, created_at, updated_at from vault.secrets;
`;
async function banco({ com052 = true, comCatalogo = false } = {}) {
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
    insert into auth.users values ('${A}'), ('${F}'), ('${B}'), ('${M}'); insert into auth.mfa_factors values ('${M}', 'verified');
    create schema storage; create table storage.buckets (id text primary key, name text, public boolean default false);
  `);
  await db.exec(VAULT_FALSO);
  await db.exec(trecho("supabase/002_casa_compartilhada.sql", "create table if not exists public.membros", "grant execute on function public.dono_da_casa() to authenticated;"));
  await db.exec(trecho("supabase/022_seguranca.sql", "create or replace function public.rac_aal_ok()", "grant execute on function public.rac_aal_ok() to authenticated;"));
  await db.exec(`insert into public.membros (membro, dono) values ('${F}', '${A}');`);   // F = a casa; A e B = donos de duas contas Apple diferentes
  if (comCatalogo) await db.exec(ler("supabase/050_seguranca_catalogo.sql"));
  await db.exec(S51); if (com052) await db.exec(S52);
  return db;
}
async function como(db, papel, uid, sql, params = [], aal = "aal1") {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, role: papel, aal })]); await db.exec("set role " + papel);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); }
}
const codigo = async (p) => { try { await p; } catch (e) { return e.code || String(e.message); } return null; };
const conta = async (db, dono, end) => (await como(db, "authenticated", dono, "insert into public.inbox_contas (provedor, apelido, endereco) values ('icloud', 'Conta', $1) returning id", [end]))[0].id;
const guardar = (db, d, c, s) => db.query("select inbox_cofre.guardar($1, $2, $3)", [d, c, s]);
const lerSeg = async (db, d, c) => (await db.query("select inbox_cofre.ler($1, $2) s", [d, c])).rows[0].s;
const nSeg = async (db) => (await db.query("select count(*)::int n from vault.secrets")).rows[0].n;
/* o segredo aparece em alguma tabela de public (ou em auth)? */
async function segredoEmTabelasComuns(db, trecho) {
  const ts = (await db.query("select table_schema, table_name from information_schema.tables where table_schema in ('public', 'auth') and table_type = 'BASE TABLE'")).rows; let achou = [];
  for (const t of ts) { const n = (await db.query(`select count(*)::int n from ${t.table_schema}.${t.table_name} x where x::text like $1`, ["%" + trecho + "%"])).rows[0].n; if (n) achou.push(t.table_schema + "." + t.table_name); }
  return achou;
}

test("PGlite · a 052 roda duas vezes, cria só o ponteiro (colunas conferidas), RLS + 2 políticas, e o site só lê colunas não sensíveis", { skip: pular }, async () => {
  const db = await banco(); await db.exec(S52);
  assert.equal((await db.query("select relrowsecurity r from pg_class where relname = 'inbox_credenciais'")).rows[0].r, true);
  const pol = (await db.query("select policyname, permissive from pg_policies where tablename = 'inbox_credenciais' order by 1")).rows; assert.deepEqual(pol, [{ policyname: "mfa", permissive: "RESTRICTIVE" }, { policyname: "so o dono", permissive: "PERMISSIVE" }]);
  const cols = (await db.query("select column_name from information_schema.columns where table_name = 'inbox_credenciais' and table_schema = 'public' order by 1")).rows.map((r) => r.column_name);
  assert.deepEqual(cols, ["atualizado_em", "conta_id", "criado_em", "dono", "estado", "id", "segredo_id", "ultima_validacao_em"], "só ponteiro e metadados: nenhuma coluna para senha");
  const ex = (await db.query("select grantee, column_name, privilege_type from information_schema.column_privileges where table_name = 'inbox_credenciais' and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC') order by 1, 2")).rows;
  assert.ok(ex.every((r) => r.grantee === "authenticated" && r.privilege_type === "SELECT" && r.column_name !== "segredo_id"), JSON.stringify(ex)); assert.equal(ex.length, 7);
  const rpc = (await db.query("select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (p.prosrc ilike '%vault%' or p.proname ilike '%decrypt%' or p.proname ilike '%segredo%')")).rows[0].n; assert.equal(rpc, 0, "nenhuma função em public toca o Vault");
});

test("PGlite · CICLO: guardar → ler devolve o mesmo segredo; ele está só no Vault (nenhuma tabela comum o contém) e a conta fica ligada pelo nome", { skip: pular }, async () => {
  const db = await banco(); const ca = await conta(db, A, "a@icloud.example");
  assert.equal(await lerSeg(db, A, ca), null, "antes de guardar: sem credencial");
  await guardar(db, A, ca, SEGREDO_A);
  assert.equal(await lerSeg(db, A, ca), SEGREDO_A);
  assert.deepEqual((await db.query("select name from vault.secrets")).rows, [{ name: "inbox_conta_" + ca }], "o nome liga o segredo à conta");
  assert.deepEqual(await segredoEmTabelasComuns(db, "aaaa-bbbb-cccc-dddd"), [], "o segredo não está em nenhuma tabela comum (public nem auth)");
  assert.equal((await db.query("select inbox_cofre.estado($1, $2) e", [A, ca])).rows[0].e, "ativa");
  const k = (await db.query("select estado from public.inbox_credenciais where conta_id = $1", [ca])).rows; assert.deepEqual(k, [{ estado: "ativa" }]);
  assert.deepEqual((await db.query("select inbox_cofre.conferir() c")).rows[0].c, { credenciais: 1, ponteiro_sem_segredo: 0, segredo_sem_ponteiro: 0 });
});

test("PGlite · ISOLAMENTO: o usuário A não lê, não substitui, não remove nem marca a credencial do usuário B (e vice-versa); a casa não guarda nada", { skip: pular }, async () => {
  const db = await banco(); const ca = await conta(db, A, "a@icloud.example"), cb = await conta(db, B, "b@icloud.example");
  await guardar(db, A, ca, SEGREDO_A); await guardar(db, B, cb, SEGREDO_B);
  assert.equal(await lerSeg(db, A, cb), null, "A não lê a credencial da conta de B"); assert.equal(await lerSeg(db, B, ca), null, "B não lê a de A"); assert.equal(await lerSeg(db, A, ca), SEGREDO_A); assert.equal(await lerSeg(db, B, cb), SEGREDO_B);
  assert.equal(await codigo(guardar(db, A, cb, "invasor-x")), "P0002", "A não substitui a credencial da conta de B (a conta não é dele)");
  assert.equal((await db.query("select inbox_cofre.remover($1, $2) r", [A, cb])).rows[0].r, false, "A não remove a credencial de B");
  assert.equal(await codigo(db.query("select inbox_cofre.marcar($1, $2, 'invalida')", [A, cb])), "P0002", "A não marca a credencial de B como inválida");
  assert.equal((await db.query("select inbox_cofre.estado($1, $2) e", [A, cb])).rows[0].e, "ausente", "A nem enxerga que B tem credencial");
  assert.equal(await lerSeg(db, B, cb), SEGREDO_B, "a credencial de B segue intacta"); assert.equal(await nSeg(db), 2);
  assert.equal((await db.query("select estado from public.inbox_contas where id = $1", [cb])).rows[0].estado, "nova", "e a conta de B não foi mexida");
  assert.equal(await codigo(guardar(db, F, ca, "casa-x")), "42501", "a casa (Fernanda) não guarda credencial"); assert.equal(await codigo(db.query("select inbox_cofre.ler($1, $2)", [F, ca])), "42501");
  assert.equal(await codigo(guardar(db, A, ca, "")), "22023", "entrada vazia é recusada"); assert.equal(await codigo(guardar(db, A, ca, "x".repeat(601))), "22023", "e a grande demais também");
  assert.equal(await codigo(guardar(db, null, ca, "x")), "22023");
  /* na tabela: cada um vê só o estado do seu; a casa e os outros não veem; o ponteiro (segredo_id) não é legível por ninguém do site */
  assert.deepEqual((await como(db, "authenticated", A, "select conta_id from public.inbox_credenciais")).map((r) => r.conta_id), [ca]); assert.deepEqual((await como(db, "authenticated", B, "select conta_id from public.inbox_credenciais")).map((r) => r.conta_id), [cb]);
  assert.equal((await como(db, "authenticated", F, "select conta_id from public.inbox_credenciais")).length, 0, "a casa não vê");
  for (const quem of [A, B]) assert.ok(await codigo(como(db, "authenticated", quem, "select segredo_id from public.inbox_credenciais")), "ninguém do site lê o ponteiro");
});

test("PGlite · PRIVILÉGIOS: nenhuma RPC; anon, authenticated e service_role não executam as funções, não usam o schema e não leem o Vault; o site não grava no ponteiro", { skip: pular }, async () => {
  const db = await banco(); const ca = await conta(db, A, "a@icloud.example"); await guardar(db, A, ca, SEGREDO_A);
  for (const papel of ["anon", "authenticated", "service_role"]) {
    assert.equal((await db.query("select has_schema_privilege($1, 'inbox_cofre', 'usage') u", [papel])).rows[0].u, false, papel + " sem uso do schema");
    for (const f of FUNCOES) assert.equal((await db.query("select has_function_privilege($1, $2, 'execute') x", [papel, "inbox_cofre." + f])).rows[0].x, false, `${papel} não executa ${f}`);
    assert.ok(await codigo(como(db, papel, A, "select inbox_cofre.ler($1, $2)", [A, ca])), papel + " não lê a credencial pela função");
    assert.ok(await codigo(como(db, papel, A, "select inbox_cofre.guardar($1, $2, 'x')", [A, ca])), papel + " não grava pela função");
    for (const rel of ["vault.decrypted_secrets", "vault.secrets"]) assert.ok(await codigo(como(db, papel, A, `select * from ${rel}`)), `${papel} não lê ${rel}`);
    assert.ok(await codigo(como(db, papel, A, "select vault.create_secret('x', 'y')")), papel + " não cria segredo no Vault");
  }
  for (const sql of ["insert into public.inbox_credenciais (dono, conta_id, segredo_id) values ($1, $2, gen_random_uuid())", "update public.inbox_credenciais set estado = 'invalida' where conta_id = $2", "delete from public.inbox_credenciais where conta_id = $2"])
    assert.ok(await codigo(como(db, "authenticated", A, sql, [A, ca])), "o site não altera o ponteiro: " + sql.slice(0, 30));
  assert.ok(await codigo(como(db, "anon", A, "select id from public.inbox_credenciais")), "anon sem acesso à tabela");
  assert.equal(await lerSeg(db, A, ca), SEGREDO_A, "e nada disso mexeu na credencial");
});

test("PGlite · SUBSTITUIÇÃO: o segredo novo entra no MESMO registro do Vault; nunca sobra segredo antigo; o estado volta a 'ativa'", { skip: pular }, async () => {
  const db = await banco(); const ca = await conta(db, A, "a@icloud.example"); await guardar(db, A, ca, SEGREDO_A);
  const antes = (await db.query("select id from vault.secrets")).rows[0].id; const ponteiro = (await db.query("select id, segredo_id from public.inbox_credenciais")).rows[0];
  await db.query("select inbox_cofre.marcar($1, $2, 'invalida')", [A, ca]); assert.equal((await db.query("select estado from public.inbox_contas where id = $1", [ca])).rows[0].estado, "erro_autenticacao");
  await guardar(db, A, ca, SEGREDO_A2);
  assert.equal(await nSeg(db), 1, "continua um só segredo no Vault"); assert.equal((await db.query("select id from vault.secrets")).rows[0].id, antes, "o mesmo registro foi atualizado");
  assert.equal(await lerSeg(db, A, ca), SEGREDO_A2); assert.deepEqual(await segredoEmTabelasComuns(db, "aaaa-bbbb-cccc-dddd"), []);
  assert.equal((await db.query("select count(*)::int n from vault.secrets where secret like '%aaaa-bbbb-cccc-dddd%'")).rows[0].n, 0, "a senha antiga não existe mais em lugar nenhum do Vault");
  assert.deepEqual((await db.query("select id, segredo_id, estado from public.inbox_credenciais")).rows, [{ id: ponteiro.id, segredo_id: ponteiro.segredo_id, estado: "ativa" }], "o ponteiro é o mesmo");
  assert.equal((await db.query("select estado from public.inbox_contas where id = $1", [ca])).rows[0].estado, "nova", "a conta volta a 'nova' (sem erro de autenticação) até a próxima verificação");
  assert.deepEqual((await db.query("select inbox_cofre.conferir() c")).rows[0].c, { credenciais: 1, ponteiro_sem_segredo: 0, segredo_sem_ponteiro: 0 });
});

test("PGlite · EXCLUSÃO: remover apaga o segredo do Vault e marca a conta como desconectada; apagar a conta ou o usuário também apaga o segredo", { skip: pular }, async () => {
  const db = await banco(); const ca = await conta(db, A, "a@icloud.example"), cb = await conta(db, B, "b@icloud.example"), ca2 = await conta(db, A, "a2@icloud.example");
  await guardar(db, A, ca, SEGREDO_A); await guardar(db, B, cb, SEGREDO_B); await guardar(db, A, ca2, SEGREDO_A2); assert.equal(await nSeg(db), 3);
  assert.equal((await db.query("select inbox_cofre.remover($1, $2) r", [A, ca])).rows[0].r, true);
  assert.equal(await nSeg(db), 2); assert.equal(await lerSeg(db, A, ca), null, "sem credencial depois de remover"); assert.equal((await db.query("select count(*)::int n from vault.secrets where secret like '%aaaa-bbbb%'")).rows[0].n, 0);
  assert.deepEqual((await db.query("select estado, ultimo_erro from public.inbox_contas where id = $1", [ca])).rows, [{ estado: "desconectada", ultimo_erro: null }]);
  assert.equal((await db.query("select inbox_cofre.remover($1, $2) r", [A, ca])).rows[0].r, false, "remover de novo é inofensivo");
  assert.equal(await lerSeg(db, B, cb), SEGREDO_B, "a de B ficou");
  /* o site apaga a conta (cascata) → o segredo vai junto */
  assert.equal((await como(db, "authenticated", A, "delete from public.inbox_contas where id = $1 returning id", [ca2])).length, 1); assert.equal(await nSeg(db), 1);
  /* excluir o usuário → tudo dele some */
  await db.query("delete from auth.users where id = $1", [B]); assert.equal(await nSeg(db), 0); assert.equal((await db.query("select count(*)::int n from public.inbox_credenciais")).rows[0].n, 0);
  assert.deepEqual((await db.query("select inbox_cofre.conferir() c")).rows[0].c, { credenciais: 0, ponteiro_sem_segredo: 0, segredo_sem_ponteiro: 0 }, "nenhum órfão");
});

test("PGlite · INTEGRIDADE: o ponteiro não muda de dono, conta ou segredo; segredo com nome de outra conta não é lido; conta sem credencial não devolve nada", { skip: pular }, async () => {
  const db = await banco(); const ca = await conta(db, A, "a@icloud.example"), cb = await conta(db, B, "b@icloud.example");
  await guardar(db, A, ca, SEGREDO_A); await guardar(db, B, cb, SEGREDO_B);
  const sidB = (await db.query("select segredo_id from public.inbox_credenciais where conta_id = $1", [cb])).rows[0].segredo_id;
  for (const [sql, args] of [["update public.inbox_credenciais set segredo_id = $2 where conta_id = $1", [ca, sidB]], ["update public.inbox_credenciais set dono = $2 where conta_id = $1", [ca, B]], ["update public.inbox_credenciais set conta_id = $2 where conta_id = $1", [ca, cb]]])
    assert.equal(await codigo(db.query(sql, args)), "42501", "ponteiro imutável: " + sql.slice(0, 40));
  const cx = await conta(db, A, "x@icloud.example");   // conta de A, ainda sem credencial: B não pode criar ponteiro para ela
  assert.equal(await codigo(db.query("insert into public.inbox_credenciais (dono, conta_id, segredo_id) values ($1, $2, gen_random_uuid())", [B, cx])), "23503", "não existe ponteiro de B para a conta de A (a chave composta exige o mesmo dono)");
  assert.equal(await codigo(db.query("insert into public.inbox_credenciais (dono, conta_id, segredo_id) values ($1, $2, $3)", [B, cb, sidB])), "23505", "uma credencial por conta; e o mesmo segredo não serve a duas");
  /* se alguém renomear o segredo no Vault, a leitura se recusa a devolver: o nome tem de ser o da conta */
  await db.query("update vault.secrets set name = 'inbox_conta_outra' where id = $1", [sidB]);
  assert.equal(await lerSeg(db, B, cb), null, "nome divergente: não devolve segredo"); assert.equal((await db.query("select inbox_cofre.conferir() c")).rows[0].c.ponteiro_sem_segredo, 1, "e a conferência acusa o desvio");
  const cc = await conta(db, A, "c@icloud.example"); assert.equal(await lerSeg(db, A, cc), null, "conta sem credencial: nada a ler");
  assert.equal((await db.query("select inbox_cofre.estado($1, $2) e", [A, cc])).rows[0].e, "ausente");
});

test("PGlite · FALHA DO VAULT = falha segura: nada é gravado em outro lugar, nada fica pela metade, o segredo antigo segue intacto, sem nenhum fallback", { skip: pular }, async () => {
  const db = await banco(); const ca = await conta(db, A, "a@icloud.example"), cb = await conta(db, B, "b@icloud.example");
  /* 1) o Vault falha ao criar: a função falha, não sobra ponteiro, nem segredo, nem cópia em tabela comum */
  await db.exec("create or replace function vault.create_secret(new_secret text, new_name text default null, new_description text default '', new_key_id uuid default null) returns uuid language plpgsql as $$ begin raise exception 'vault indisponivel'; end $$;");
  const e1 = await codigo(guardar(db, A, ca, SEGREDO_A)); assert.ok(e1, "a operação falha"); assert.equal(await nSeg(db), 0);
  assert.equal((await db.query("select count(*)::int n from public.inbox_credenciais")).rows[0].n, 0, "nenhum ponteiro sem segredo");
  assert.deepEqual(await segredoEmTabelasComuns(db, "aaaa-bbbb-cccc-dddd"), [], "o segredo não foi parar em tabela alguma");
  await db.exec(VAULT_FALSO.match(/create function vault\.create_secret[\s\S]*?\$\$;/)[0].replace("create function", "create or replace function"));
  await guardar(db, A, ca, SEGREDO_A);
  /* 2) o Vault falha ao atualizar: o segredo antigo continua valendo e o estado não muda */
  await db.query("select inbox_cofre.marcar($1, $2, 'invalida')", [A, ca]);
  await db.exec("create or replace function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null, new_key_id uuid default null) returns void language plpgsql as $$ begin raise exception 'vault indisponivel'; end $$;");
  assert.ok(await codigo(guardar(db, A, ca, SEGREDO_A2)), "a substituição falha"); assert.equal(await lerSeg(db, A, ca), SEGREDO_A, "o segredo antigo está intacto");
  assert.deepEqual(await segredoEmTabelasComuns(db, "eeee-ffff-gggg-hhhh"), [], "o novo também não vazou para lugar nenhum");
  assert.equal((await db.query("select estado from public.inbox_credenciais where conta_id = $1", [ca])).rows[0].estado, "invalida", "nada foi desfeito pela metade");
  /* 3) o Vault falha ao ler: a função falha e não devolve segredo */
  await db.exec("drop view vault.decrypted_secrets;"); assert.ok(await codigo(db.query("select inbox_cofre.ler($1, $2)", [A, ca])), "leitura falha sem a view do Vault");
  /* 4) o Vault falha ao apagar: remover falha inteiro, a linha e o segredo continuam (nada de ponteiro sem segredo) */
  await db.exec("create or replace function inbox_cofre.apaga_segredo() returns trigger language plpgsql security definer set search_path = '' as $$ begin raise exception 'vault indisponivel'; end $$;");
  assert.ok(await codigo(db.query("select inbox_cofre.remover($1, $2)", [A, ca])), "remover falha"); assert.equal(await nSeg(db), 1); assert.equal((await db.query("select count(*)::int n from public.inbox_credenciais")).rows[0].n, 1);
  void cb;
});

test("PGlite · trava MFA: com fator verificado, o estado da credencial só é visível com aal2", { skip: pular }, async () => {
  const db = await banco(); const cm = await conta(db, M, "m@icloud.example").catch(() => null);
  const c = (await como(db, "authenticated", M, "insert into public.inbox_contas (provedor, apelido, endereco) values ('icloud', 'M', 'm@icloud.example') returning id", [], "aal2"))[0].id; assert.ok(c);
  await guardar(db, M, c, SEGREDO_B);
  assert.equal((await como(db, "authenticated", M, "select conta_id from public.inbox_credenciais", [], "aal1")).length, 0, "aal1 com fator verificado: nada");
  assert.equal((await como(db, "authenticated", M, "select conta_id from public.inbox_credenciais", [], "aal2")).length, 1); void cm;
});

test("PGlite · catálogo: com a 050 aplicada, a 052 cataloga inbox_credenciais (com trava, fora do backup) e a auditoria não acusa nada; sem a 050, só avisa", { skip: pular }, async () => {
  const sem = await banco(); assert.equal((await sem.query("select count(*)::int n from pg_class where relname = 'inbox_credenciais'")).rows[0].n, 1);
  const db = await banco({ comCatalogo: true }); await db.exec(S51); await db.exec(S52);
  assert.deepEqual((await db.query("select tabela, trava_mfa, backup, origem from public.seguranca_catalogo where tabela = 'inbox_credenciais'")).rows, [{ tabela: "inbox_credenciais", trava_mfa: true, backup: false, origem: "052" }]);
  const e = (await como(db, "authenticated", A, "select public.seguranca_estado() e"))[0].e;
  for (const k of ["sem_trava_mfa", "fora_do_catalogo", "sem_rls", "anon_le"]) assert.deepEqual((e[k] || []).filter((t) => /^inbox_/.test(t)), [], k);
  assert.deepEqual((e.funcoes_abertas || []).filter((f) => /guardar|ler|remover|estado|marcar|conferir|segredo/.test(f)), [], "nenhuma função aberta ao anon");
});
