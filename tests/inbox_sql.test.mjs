// RAC Inbox · I1 · migration 051 (PREPARADA, NÃO APLICADA em produção): texto do SQL e, num Postgres de verdade dentro do Node (PGlite), RLS, isolamento entre usuários,
// trava MFA, privilégios mínimos, integridade por chave composta, restrições e a garantia de que o banco NÃO tem onde guardar credencial nem conteúdo de e-mail.
// Tudo fictício. Sem rede, sem tocar no Supabase. O PGlite só existe no teste (RAC_PGLITE=<caminho>; no GitHub vem do testes.yml).
// Limitação: o PGlite prova o PostgreSQL (RLS, privilégios, checks, gatilhos); não prova o Supabase real (papéis e JWT reais) nem a aplicação em produção, que é do dono.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const semComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite: pula, menos no CI */ }
const pular = !PGlite;
createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const S51 = ler("supabase/051_inbox_fundacao.sql");
const TABELAS = ["inbox_contas", "inbox_pastas", "inbox_sincronizacao", "inbox_mensagens_ref"];

test("no CI o PGlite está instalado: os testes de banco da 051 não podem ser pulados", () => { if (process.env.CI) assert.ok(PGlite, "sem PGlite no CI (testes.yml instala o @electric-sql/pglite)"); });

test("051 (texto): pendente (não aplicada), uma transação, só cria, RLS + mfa + sem anon, sem service_role, sem nenhuma coluna de credencial ou de conteúdo de e-mail", () => {
  assert.equal(S51.split("\n")[0], "-- status: pendente", "o banco real ainda não tem: tests/banco.test.mjs a trata como pendente (todo)");
  assert.match(S51, /NÃO APLICADA/); assert.match(S51, /\nbegin;[\s\S]*\ncommit;/);
  const s = semComent(S51);
  for (const t of TABELAS) assert.match(s, new RegExp(`create table if not exists public\\.${t} \\(`));
  assert.equal((s.match(/create table /g) || []).length, 4);
  assert.ok(!/\b(drop\s+(table|policy\s+(?!if exists))|truncate|delete\s+from|alter\s+table\s+public\.(?!%I))/i.test(s), "nada destrutivo nem de outro módulo");
  assert.match(s, /foreach t in array array\['inbox_contas', 'inbox_pastas', 'inbox_sincronizacao', 'inbox_mensagens_ref'\] loop/);
  assert.match(s, /create policy "so o dono"/); assert.match(s, /as restrictive for all to authenticated using \(\(select public\.rac_aal_ok\(\)\)\) with check \(\(select public\.rac_aal_ok\(\)\)\)/);
  assert.match(s, /revoke all on public\.%I from public, anon, authenticated/); assert.match(s, /not exists \(select 1 from public\.membros m where m\.membro = \(select auth\.uid\(\)\)\)/, "a casa fica de fora");
  assert.ok(!/service_role/.test(s), "nada aqui precisa de chave de serviço");
  assert.ok(!/grant[^;]*\banon\b/i.test(s.replace(/revoke[^;]*;/gi, "")), "nenhum grant para anon");
  const grants = (s.match(/grant [^;]+;/gi) || []).map((g) => g.replace(/\s+/g, " "));
  assert.ok(grants.includes("grant select, insert, update, delete on public.inbox_contas, public.inbox_pastas, public.inbox_sincronizacao to authenticated;")); assert.ok(grants.includes("grant select, insert, delete on public.inbox_mensagens_ref to authenticated;"));
  /* nenhuma coluna para segredo nem para conteúdo (o teste PGlite confere de novo nas colunas reais) */
  const colunas = [...s.matchAll(/^  ([a-z_]+)\s+(?:uuid|text|integer|bigint|boolean|timestamptz)\b/gm)].map((m) => m[1]);
  assert.ok(colunas.length > 25, "leu as colunas"); assert.deepEqual(colunas.filter((c) => /senha|password|passwd|token|secret|segredo|credencial|api_?key|usuario|cookie|assunto|corpo|remetente|destinatario|body|subject|snippet|previa|anexo/i.test(c)), []);
  assert.match(s, /provedor\s+text not null check \(provedor ~ '\^\[a-z\]\[a-z0-9_\]\{1,31\}\$'\)/, "provedor por formato (precedente da 048): provedor novo não exige migration");
});

test("051 (catálogo): as 4 tabelas entram no catálogo da auditoria (se a 050 existir), no backup só-exportar do site (dep 051, sem credencial) e no teste de segurança com o banco real", () => {
  assert.match(S51, /insert into public\.seguranca_catalogo[\s\S]*'inbox_contas'[\s\S]*'inbox_pastas'[\s\S]*'inbox_sincronizacao'[\s\S]*'inbox_mensagens_ref'/);
  for (const t of TABELAS) { const d = N.segDef(t); assert.ok(d, t + " está em NUCLEO.SEG_TABELAS"); assert.equal(d.so, "exportar", t); assert.equal(d.dep, "051", t); assert.equal(d.dono, "dono", t); }
  const nomes = N.SEG_TABELAS.map((d) => d.t);
  for (const d of N.SEG_TABELAS) for (const pai of Object.values(d.fk || {})) assert.ok(nomes.indexOf(pai) >= 0 && nomes.indexOf(pai) < nomes.indexOf(d.t), pai + " antes de " + d.t);
  const testeReal = JSON.parse(/for \(const t of (\[[^\]]+\])\)/.exec(ler("tests/seguranca.test.mjs"))[1]);
  for (const t of TABELAS) assert.ok(testeReal.includes(t), t + " em tests/seguranca.test.mjs (sem login não lê)");
  const limpo = N.segLimpar("inbox_contas", [{ id: "1", apelido: "Pessoal", token_oculto: "SEGREDO-X", senha: "SEGREDO-Y" }]); assert.ok(!JSON.stringify(limpo.linhas).includes("SEGREDO"), "se algum dia houver coluna de segredo, o backup a retira");
});

/* ---------- Postgres de verdade ---------- */
const R = "11111111-1111-4111-8111-111111111111", F = "22222222-2222-4222-8222-222222222222", X = "33333333-3333-4333-8333-333333333333", M = "44444444-4444-4444-8444-444444444444";
const trecho = (arq, ini, fim) => { const t = ler(arq), i = t.indexOf(ini); assert.ok(i >= 0, ini); return t.slice(i, t.indexOf(fim, i) + fim.length); };
async function banco({ comMigration = true, comCatalogo = false } = {}) {
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
  await db.exec(`insert into public.membros (membro, dono) values ('${F}', '${R}');`);   // F = a casa (a Fernanda); X = outra pessoa qualquer
  if (comCatalogo) await db.exec(ler("supabase/050_seguranca_catalogo.sql"));
  if (comMigration) await db.exec(S51);
  return db;
}
async function como(db, papel, uid, sql, params = [], aal = "aal1") {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, role: papel, aal })]); await db.exec("set role " + papel);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); }
}
const codigo = async (p) => { try { await p; } catch (e) { return e.code || String(e.message); } return null; };
const CONTA = (dono = R, extra = {}) => { const d = { dono, provedor: "icloud", apelido: "Pessoal", endereco: "pessoa@icloud.example", ...extra }, k = Object.keys(d); return [`insert into public.inbox_contas (${k.join(",")}) values (${k.map((_, i) => "$" + (i + 1)).join(",")}) returning id`, k.map((x) => d[x])]; };
async function criar(db, uid = R) {
  const c = (await como(db, "authenticated", uid, ...CONTA(uid)))[0].id;
  const p = (await como(db, "authenticated", uid, "insert into public.inbox_pastas (conta_id, nome_externo, uso, total, nao_lidas) values ($1, 'INBOX', 'entrada', 1, 1) returning id", [c]))[0].id;
  const s = (await como(db, "authenticated", uid, "insert into public.inbox_sincronizacao (conta_id, pasta_id, uidvalidity, uidnext, tipo_ultima) values ($1, $2, 1752612613, 4, 'primeira_leitura') returning id", [c, p]))[0].id;
  const m = (await como(db, "authenticated", uid, "insert into public.inbox_mensagens_ref (conta_id, pasta_id, id_externo, uidvalidity, uid) values ($1, $2, '1752612613:3', 1752612613, 3) returning id", [c, p]))[0].id;
  return { c, p, s, m };
}

test("PGlite · a 051 roda duas vezes sem erro, cria as 4 tabelas com RLS e 8 políticas (so o dono + mfa RESTRICTIVE), nada aberto ao anon", { skip: pular }, async () => {
  const db = await banco(); await db.exec(S51);
  const t = (await db.query("select relname, relrowsecurity from pg_class where relname = any($1) order by 1", [TABELAS])).rows; assert.deepEqual(t.map((x) => [x.relname, x.relrowsecurity]), [["inbox_contas", true], ["inbox_mensagens_ref", true], ["inbox_pastas", true], ["inbox_sincronizacao", true]]);
  const pol = (await db.query("select tablename, policyname, permissive from pg_policies where tablename = any($1) order by 1, 2", [TABELAS])).rows;
  assert.equal(pol.length, 8); assert.ok(pol.filter((p) => p.policyname === "mfa").every((p) => p.permissive === "RESTRICTIVE")); assert.ok(pol.filter((p) => p.policyname === "so o dono").every((p) => p.permissive === "PERMISSIVE"));
  const anon = (await db.query("select table_name from information_schema.role_table_grants where grantee = 'anon' and table_name = any($1)", [TABELAS])).rows; assert.deepEqual(anon, [], "anon sem nenhum privilégio");
  const sr = (await db.query("select table_name from information_schema.role_table_grants where grantee = 'service_role' and table_name = any($1)", [TABELAS])).rows; assert.deepEqual(sr, [], "nem service_role: nada aqui precisa dele");
});

test("PGlite · o banco não tem onde guardar credencial nem conteúdo de e-mail (colunas reais das 4 tabelas)", { skip: pular }, async () => {
  const db = await banco();
  const cols = (await db.query("select table_name, column_name from information_schema.columns where table_schema = 'public' and table_name = any($1) order by 1, 2", [TABELAS])).rows.map((r) => r.table_name + "." + r.column_name);
  assert.ok(cols.length > 30, "leu as colunas");
  assert.deepEqual(cols.filter((c) => /senha|password|passwd|token|secret|segredo|credencial|api_?key|usuario|cookie|oauth|refresh|assunto|corpo|remetente|destinatario|body|subject|snippet|previa|anexo|html|mime/i.test(c)), []);
  /* e as colunas de texto livre são só: apelido, endereço (da própria conta), nome de pasta, id externo e códigos fechados */
  const texto = (await db.query("select table_name, column_name from information_schema.columns where table_schema = 'public' and table_name = any($1) and data_type = 'text' order by 1, 2", [TABELAS])).rows.map((r) => r.table_name + "." + r.column_name);
  assert.deepEqual(texto, ["inbox_contas.apelido", "inbox_contas.endereco", "inbox_contas.estado", "inbox_contas.provedor", "inbox_contas.ultimo_erro", "inbox_mensagens_ref.id_externo", "inbox_pastas.nome_externo", "inbox_pastas.uso", "inbox_sincronizacao.erro", "inbox_sincronizacao.tipo_ultima"]);
});

test("PGlite · ISOLAMENTO: outro usuário (X) e a casa (F) não leem, não gravam, não alteram nem apagam nada do dono (R), em nenhuma das 4 tabelas", { skip: pular }, async () => {
  const db = await banco(); const { c, p, s, m } = await criar(db, R);
  for (const t of TABELAS) {
    assert.equal((await como(db, "authenticated", R, `select id from public.${t}`)).length, 1, `o dono lê a própria linha em ${t}`);
    for (const quem of [X, F]) {
      assert.equal((await como(db, "authenticated", quem, `select id from public.${t}`)).length, 0, `${quem === X ? "outro usuário" : "a casa"} não vê nada em ${t}`);
      assert.equal((await como(db, "authenticated", quem, `delete from public.${t} returning id`)).length, 0, `e não apaga nada em ${t}`);
    }
  }
  for (const quem of [X, F]) {
    assert.equal((await como(db, "authenticated", quem, "update public.inbox_contas set apelido = 'invadida' returning id")).length, 0, "não altera a conta do dono");
    assert.equal((await como(db, "authenticated", quem, "update public.inbox_pastas set nao_lidas = 0 returning id")).length, 0);
    assert.equal((await como(db, "authenticated", quem, "update public.inbox_sincronizacao set uidnext = 99 returning id")).length, 0);
    /* gravar com o dono errado (dono = R) é recusado pela política; sem informar o dono, vale o do próprio usuário e a referência à conta alheia é recusada pela chave composta */
    assert.ok(await codigo(como(db, "authenticated", quem, ...CONTA(R))), "não cria conta em nome do dono");
    assert.ok(await codigo(como(db, "authenticated", quem, "insert into public.inbox_pastas (conta_id, nome_externo) values ($1, 'INBOX')", [c])), "não cria pasta na conta do dono (nem como dono = si mesmo: a chave composta exige o mesmo dono)");
    assert.ok(await codigo(como(db, "authenticated", quem, "insert into public.inbox_sincronizacao (conta_id, pasta_id, uidvalidity, uidnext) values ($1, $2, 1, 1)", [c, p])), "não cria cursor na pasta do dono");
    assert.ok(await codigo(como(db, "authenticated", quem, "insert into public.inbox_mensagens_ref (conta_id, pasta_id, id_externo) values ($1, $2, 'x')", [c, p])), "não cria referência de mensagem na conta do dono");
  }
  /* a linha do dono continua exatamente como estava */
  const r = (await como(db, "authenticated", R, "select c.apelido, p.nao_lidas, s.uidnext from public.inbox_contas c join public.inbox_pastas p on p.conta_id = c.id join public.inbox_sincronizacao s on s.pasta_id = p.id"))[0];
  assert.deepEqual(r, { apelido: "Pessoal", nao_lidas: 1, uidnext: 4 });
  /* o dono NÃO consegue apontar uma linha sua para a conta de outro (X cria a dele; R tenta usá-la) */
  const dele = await criar(db, X);
  assert.ok(await codigo(como(db, "authenticated", R, "insert into public.inbox_pastas (conta_id, nome_externo) values ($1, 'Outra')", [dele.c])), "o dono não aponta pasta para conta alheia");
  assert.ok(await codigo(como(db, "authenticated", R, "insert into public.inbox_sincronizacao (conta_id, pasta_id, uidvalidity, uidnext) values ($1, $2, 1, 1)", [c, dele.p])), "nem cursor com pasta alheia");
  assert.equal((await como(db, "authenticated", X, "select id from public.inbox_contas")).length, 1, "X vê só a dele"); assert.equal((await como(db, "authenticated", R, "select id from public.inbox_contas")).length, 1, "e R só a sua");
  void s; void m;
});

test("PGlite · a casa (membro) não grava nem a própria conta: o Inbox é só do dono; anon não lê nem grava", { skip: pular }, async () => {
  const db = await banco();
  assert.ok(await codigo(como(db, "authenticated", F, ...CONTA(F))), "a Fernanda não cadastra conta (política exclui membros)");
  assert.equal((await como(db, "authenticated", R, ...CONTA(R))).length, 1, "o dono cadastra");
  assert.ok(await codigo(como(db, "anon", R, "select id from public.inbox_contas")), "anon: sem privilégio");
  assert.ok(await codigo(como(db, "anon", R, "insert into public.inbox_contas (dono, provedor, apelido, endereco) values ($1, 'icloud', 'x', 'a@b.co')", [R])));
});

test("PGlite · trava MFA: com fator verificado, só vale com aal2; sem fator, aal1 basta (como o resto do site)", { skip: pular }, async () => {
  const db = await banco(); await db.exec(`insert into public.membros (membro, dono) select '${R}', '${R}' where false;`);
  /* M é "dono" aqui (não é membro): tem fator verificado */
  const c = (await como(db, "authenticated", M, ...CONTA(M, { endereco: "m@icloud.example" }), "aal2"))[0].id; assert.ok(c);
  assert.equal((await como(db, "authenticated", M, "select id from public.inbox_contas", [], "aal1")).length, 0, "aal1 com fator verificado: nada");
  assert.equal((await como(db, "authenticated", M, "select id from public.inbox_contas", [], "aal2")).length, 1);
  assert.ok(await codigo(como(db, "authenticated", M, ...CONTA(M, { endereco: "m2@icloud.example" }), "aal1")), "gravar com aal1 também é recusado");
  assert.equal((await como(db, "authenticated", R, "select id from public.inbox_contas", [], "aal1")).length, 0, "e o dono sem fator continua sem ver a conta de M (isolamento)");
});

test("PGlite · restrições: provedor por formato, e-mail válido, conta única por e-mail (sem diferenciar maiúsculas), UID de 1 a 4294967295, cursor inteiro ou nenhum, códigos fechados, contagens coerentes", { skip: pular }, async () => {
  const db = await banco(); const { c, p } = await criar(db, R);
  for (const ruim of [{ provedor: "Icloud" }, { provedor: "i" }, { provedor: "icloud;drop" }, { endereco: "sem-arroba" }, { endereco: "a b@c.co" }, { apelido: "   " }, { apelido: "x".repeat(61) }, { estado: "quase_conectada" }, { ultimo_erro: "Senha errada no servidor!" }, { ultimo_erro: "x".repeat(50) }])
    assert.ok(await codigo(como(db, "authenticated", R, ...CONTA(R, { endereco: "novo@icloud.example", ...ruim }))), JSON.stringify(ruim));
  assert.ok(await codigo(como(db, "authenticated", R, ...CONTA(R, { endereco: "PESSOA@iCloud.example" }))), "a mesma conta, só com outras maiúsculas, é duplicada");
  assert.equal((await como(db, "authenticated", R, ...CONTA(R, { provedor: "gmail", endereco: "pessoa@icloud.example" }))).length, 1, "mesmo endereço em outro provedor é outra conta (e provedor novo não exige migration)");
  assert.ok(await codigo(como(db, "authenticated", R, "insert into public.inbox_pastas (conta_id, nome_externo) values ($1, 'INBOX')", [c])), "pasta única por conta");
  for (const ruim of ["uso = 'invalido'", "total = -1", "nao_lidas = 5"]) assert.ok(await codigo(como(db, "authenticated", R, `update public.inbox_pastas set ${ruim} where id = '${p}'`)), ruim + " (nao_lidas não passa do total)");
  const pasta2 = (await como(db, "authenticated", R, "insert into public.inbox_pastas (conta_id, nome_externo) values ($1, 'Outra') returning id", [c]))[0].id;
  for (const [u, n] of [[0, 4], [4294967296, 4], [1, 0], [null, 4], [1, null]]) assert.ok(await codigo(como(db, "authenticated", R, "insert into public.inbox_sincronizacao (conta_id, pasta_id, uidvalidity, uidnext) values ($1, $2, $3, $4)", [c, pasta2, u, n])), `cursor ${u}/${n}`);
  assert.equal((await como(db, "authenticated", R, "insert into public.inbox_sincronizacao (conta_id, pasta_id, uidvalidity, uidnext) values ($1, $2, 4294967295, 4294967295) returning id", [c, pasta2])).length, 1, "o teto de 32 bits é aceito");
  assert.ok(await codigo(como(db, "authenticated", R, "insert into public.inbox_sincronizacao (conta_id, pasta_id) values ($1, $2)", [c, pasta2])), "uma linha de sincronização por pasta");
  assert.ok(await codigo(como(db, "authenticated", R, "update public.inbox_sincronizacao set tipo_ultima = 'inventado' where pasta_id = $1", [p])), "tipo só do vocabulário da P6");
  assert.ok(await codigo(como(db, "authenticated", R, "update public.inbox_sincronizacao set erro = 'Falhou: texto livre' where pasta_id = $1", [p])), "erro só em código fechado");
  assert.equal((await como(db, "authenticated", R, "update public.inbox_sincronizacao set tipo_ultima = 'sem_mudanca', erro = 'pasta_inexistente', falhas_seguidas = 1 where pasta_id = $1 returning id", [p])).length, 1);
  assert.ok(await codigo(como(db, "authenticated", R, "insert into public.inbox_mensagens_ref (conta_id, pasta_id, id_externo, uidvalidity, uid) values ($1, $2, 'dup', 1, 0)", [c, p])), "uid fora da faixa");
  assert.ok(await codigo(como(db, "authenticated", R, "insert into public.inbox_mensagens_ref (conta_id, pasta_id, id_externo, uidvalidity) values ($1, $2, 'meio-par', 1)", [c, p])), "uidvalidity sem uid");
  assert.ok(await codigo(como(db, "authenticated", R, "insert into public.inbox_mensagens_ref (conta_id, pasta_id, id_externo, uidvalidity, uid) values ($1, $2, '1752612613:3', 1752612613, 3)", [c, p])), "a mesma mensagem não entra duas vezes");
  assert.equal((await como(db, "authenticated", R, "insert into public.inbox_mensagens_ref (conta_id, id_externo) values ($1, 'gmail-abc') returning id", [c])).length, 1, "mensagem sem pasta (ex.: Gmail por marcador) é aceita, ligada só à conta");
});

test("PGlite · integridade: dono e conta nunca mudam; atualizado_em é do servidor; a identidade da mensagem não se edita; apagar a conta apaga os metadados (e só eles)", { skip: pular }, async () => {
  const db = await banco(); const { c, p, s, m } = await criar(db, R);
  assert.ok(await codigo(como(db, "authenticated", R, "update public.inbox_contas set dono = $1 where id = $2", [X, c])), "não troca o dono");
  assert.ok(await codigo(db.query("update public.inbox_pastas set conta_id = gen_random_uuid() where id = $1", [p])), "a pasta não muda de conta");
  assert.ok(await codigo(db.query("update public.inbox_sincronizacao set conta_id = gen_random_uuid() where id = $1", [s])), "o cursor não muda de conta");
  assert.ok(await codigo(como(db, "authenticated", R, "update public.inbox_mensagens_ref set id_externo = 'outra' where id = $1", [m])), "a identidade da mensagem não se edita (sem privilégio de update)");
  const antes = (await como(db, "authenticated", R, "select atualizado_em from public.inbox_contas where id = $1", [c]))[0].atualizado_em; assert.equal(antes, null, "nunca atualizada");
  const dep = (await como(db, "authenticated", R, "update public.inbox_contas set estado = 'conectada', atualizado_em = '2000-01-01' where id = $1 returning atualizado_em", [c]))[0].atualizado_em;
  assert.ok(new Date(dep).getFullYear() >= 2026, "o carimbo é do servidor, não o enviado");
  assert.equal((await como(db, "authenticated", R, "delete from public.inbox_contas where id = $1 returning id", [c])).length, 1);
  for (const t of ["inbox_pastas", "inbox_sincronizacao", "inbox_mensagens_ref"]) assert.equal((await db.query(`select id from public.${t}`)).rows.length, 0, `${t}: apagou junto com a conta`);
  const { c: c2 } = await criar(db, R); void c2;
  await db.query("delete from auth.users where id = $1", [R]); assert.equal((await db.query("select id from public.inbox_contas")).rows.length, 0, "excluir a conta do usuário apaga tudo dele");
});

test("PGlite · catálogo da auditoria: com a 050 aplicada, a 051 cataloga as 4 tabelas (com trava e backup) e é reexecutável; sem a 050, avisa e segue sem erro", { skip: pular }, async () => {
  const sem = await banco(); assert.equal((await sem.query("select count(*)::int n from pg_class where relname = 'inbox_contas'")).rows[0].n, 1, "sem a 050 a 051 aplica do mesmo jeito (só avisa)");
  const db = await banco({ comCatalogo: true }); await db.exec(S51);
  const linhas = (await db.query("select tabela, trava_mfa, backup, origem from public.seguranca_catalogo where tabela like 'inbox\\_%' order by 1")).rows;
  assert.deepEqual(linhas, TABELAS.slice().sort().map((t) => ({ tabela: t, trava_mfa: true, backup: true, origem: "051" })));
  /* a função de segurança da 050 (lê o catálogo) acha as 4 com trava e RLS: nada fica de fora */
  await db.exec(`select set_config('request.jwt.claims', '{"sub":"${R}","aal":"aal1"}', false)`);
  const e = (await como(db, "authenticated", R, "select public.seguranca_estado() e"))[0].e;
  assert.deepEqual((e.sem_trava_mfa || []).filter((t) => /^inbox_/.test(t)), []); assert.deepEqual((e.fora_do_catalogo || []).filter((t) => /^inbox_/.test(t)), []);
  assert.deepEqual((e.sem_rls || []).filter((t) => /^inbox_/.test(t)), []); assert.deepEqual((e.anon_le || []).filter((t) => /^inbox_/.test(t)), []);
});
