// Lote 4 do novo RAC · Captura universal e Biblioteca básica no banco (supabase/071_captura_biblioteca.sql; docs/planejamento/15, 18 e 19).
// Postgres de verdade (PGlite) com a 002 (membros), a 022 (rac_aal_ok), a 050 (catálogo), a 070 (espaços) e a 071 rodada DUAS vezes. Tudo fictício, sem rede.
// O que se prova, sempre com o papel "authenticated" ou "anon" e o RLS ligado (o mesmo caminho da API do Supabase):
//   · a Captura é PRIVADA DO AUTOR, mesmo num espaço compartilhado e mesmo para o proprietário do espaço; ninguém lê, cria, edita ou apaga item alheio nem em espaço alheio;
//   · idempotência: o mesmo id enviado duas vezes (reenvio depois de falha de rede) vira UMA linha (insert ... on conflict do nothing);
//   · integridade: espaço e autor imutáveis, estado "classificado" só com destino, conteúdo ou anexo obrigatório, limites;
//   · a Biblioteca é por espaço (ler = quem lê; editar = quem edita), referência a arquivo só dentro do PRÓPRIO espaço, um item por captura, forma por tipo;
//   · Storage: bucket privado, caminho <espaço>/<autor>/<pasta>/<arquivo>; só o autor escreve; quem lê o espaço só lê o arquivo que a Biblioteca aponta; arquivo apontado não se apaga; MFA no bucket;
//   · a migration não toca em tabela de negócio, fecha para anon e entra no catálogo da auditoria.
// Limitação: o PGlite prova o PostgreSQL (RLS, privilégios, checks, gatilhos), não o Supabase real: a conferência em produção está em supabase/conferencias/071_conferir_producao.sql.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite: pula, menos no CI */ }
const pular = !PGlite;
const S71 = ler("supabase/071_captura_biblioteca.sql"), S70 = ler("supabase/070_espacos_e_workspace.sql"), S50 = ler("supabase/050_seguranca_catalogo.sql");
const trecho = (arq, ini, fim) => { const t = ler(arq), i = t.indexOf(ini); assert.ok(i >= 0, ini); return t.slice(i, t.indexOf(fim, i) + fim.length); };

const R = "11111111-1111-4111-8111-111111111111";   // o dono (Rayner)
const F = "22222222-2222-4222-8222-222222222222";   // a casa (Fernanda): linha em membros
const X = "33333333-3333-4333-8333-333333333333";   // de fora
const Y = "44444444-4444-4444-8444-444444444444";   // convidado (leitor) de um espaço compartilhado
const M = "66666666-6666-4666-8666-666666666666";   // tem 2ª etapa (MFA) cadastrada
const u = (n) => "aaaaaaaa-0000-4000-8000-" + String(n).padStart(12, "0");

test("no CI o PGlite está instalado: os testes de banco desta migration não podem ser pulados", () => {
  if (process.env.CI) assert.ok(PGlite, "sem PGlite no CI (testes.yml instala o @electric-sql/pglite)");
});

async function banco() {
  const db = await PGlite.create();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    create schema auth; grant usage on schema auth to anon, authenticated, service_role;
    create table auth.users (id uuid primary key);
    create table auth.mfa_factors (user_id uuid, status text);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub', '')::uuid $$;
    create schema storage; grant usage on schema storage to anon, authenticated, service_role;
    create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb);
    alter table storage.objects enable row level security; grant select, insert, update, delete on storage.objects to authenticated;
    insert into auth.users values ('${R}'), ('${F}'), ('${X}'), ('${Y}'), ('${M}');
    insert into auth.mfa_factors values ('${M}', 'verified');
  `);
  await db.exec(trecho("supabase/002_casa_compartilhada.sql", "create table if not exists public.membros", "grant execute on function public.dono_da_casa() to authenticated;"));
  await db.exec(trecho("supabase/022_seguranca.sql", "create or replace function public.rac_aal_ok()", "grant execute on function public.rac_aal_ok() to authenticated;"));
  await db.exec(S50);
  await db.exec(`insert into public.membros (membro, dono) values ('${F}', '${R}');`);
  await db.exec(S70);
  await db.exec(S71); await db.exec(S71);   // reexecutável
  return db;
}
const com = async (db, uid, sql, params = [], { papel = "authenticated", aal = "aal1" } = {}) => {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(uid ? { sub: uid, role: papel, aal } : { role: papel })]);
  await db.exec(`set role ${papel}`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); }
};
const msg = async (p) => { try { await p; } catch (e) { return String(e.message) + " " + (e.code || ""); } return null; };
const pessoal = async (db, uid) => (await db.query("select id from public.espacos where dono = $1 and tipo = 'pessoal'", [uid])).rows[0].id;
const casa = async (db) => (await db.query("select id from public.espacos where casa_de = $1", [R])).rows[0].id;
const cap = (db, uid, id, esp, extra = {}) => {
  const c = { conteudo: "comprar leite", anexos: "[]", tipo: "texto", estado: "pendente", ...extra };
  return com(db, uid, "insert into public.captura_itens (id, espaco_id, criado_por, tipo, conteudo, anexos, estado) values ($1, $2, $3, $4, $5, $6::jsonb, $7) on conflict (id) do nothing returning id", [id, esp, extra.por || uid, c.tipo, c.conteudo, c.anexos, c.estado]);
};
const bib = (db, uid, id, esp, extra = {}) => {
  const b = { tipo: "nota", titulo: "Nota", texto: "um texto", ...extra };
  return com(db, uid, "insert into public.biblioteca_itens (id, espaco_id, criado_por, tipo, titulo, url, texto, ref, captura_id) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9) returning id", [id, esp, uid, b.tipo, b.titulo, b.url || null, b.tipo === "nota" ? b.texto : (b.texto || null), b.ref ? JSON.stringify(b.ref) : null, b.captura_id || null]);
};

test("071 (texto): aditiva, uma transação, sem tocar em tabela de negócio, função sem anon e com search_path fixo, bucket privado, catálogo e trava \"mfa\"", () => {
  assert.match(S71, /\nbegin;[\s\S]*\ncommit;/);
  const s = S71.replace(/--.*$/gm, "");
  assert.ok(!/\b(truncate|delete\s+from\s+public\.|alter\s+table\s+public\.(?!%I))/i.test(s), "não apaga nem altera tabela existente");
  assert.ok(!/(insert into|update|delete from)\s+public\.(mercados|produtos|notas|itens|registros|lista|bebe|pessoal|garmin_|compras|pedido|notas_fiscais|radar_|inbox_|newsletter|conhecimento|sinais|membros|espacos|espaco_membros|workspace_)/i.test(s), "nenhuma escrita em tabela de negócio nem de espaços");
  for (const f of [...s.matchAll(/create or replace function (public\.[a-z_]+)\(([^)]*)\)/g)]) {
    const i = s.indexOf(f[0]), corpo = s.slice(i, s.indexOf("$$;", s.indexOf("$$", i + 40)) + 3);
    assert.match(corpo, /set search_path = ''/, f[1] + " sem search_path vazio");
  }
  assert.match(S71, /revoke all on function public\.cap_arquivo_pode\(text, text\) from public, anon;/);
  for (const g of s.matchAll(/\bgrant\s[^;]*?\sto\s+([^;]+);/gi)) assert.ok(!/\b(anon|public)\b/i.test(g[1]), "grant para anon ou public: " + g[0]);
  assert.match(S71, /values \('captura', 'captura', false, 52428800,/, "bucket privado com limite de 50 MB");
  assert.match(S71, /foreach t in array array\['captura_itens', 'biblioteca_itens'\] loop/);
  for (const t of ["captura_itens", "biblioteca_itens"]) assert.match(S71, new RegExp(`insert into public\\.seguranca_catalogo[\\s\\S]*'${t}'`), t + " no catálogo");
  assert.match(S71, /create policy "mfa captura" on storage\.objects as restrictive/, "a 2ª etapa vale no bucket novo");
  assert.ok(!/allowed_mime_types[^;]*(svg|html|javascript|x-msdownload)/i.test(S71), "sem SVG, HTML nem executável no cofre");
});

test("PGlite · a 071 roda duas vezes; as duas tabelas têm RLS, trava mfa e nada para anon; entram no catálogo com backup", { skip: pular }, async () => {
  const db = await banco();
  for (const t of ["captura_itens", "biblioteca_itens"]) {
    assert.equal((await db.query("select relrowsecurity from pg_class where oid = $1::regclass", ["public." + t])).rows[0].relrowsecurity, true, t + " com RLS");
    assert.equal((await db.query("select exists (select 1 from pg_policies where schemaname = 'public' and tablename = $1 and policyname = 'mfa' and permissive = 'RESTRICTIVE') as ok", [t])).rows[0].ok, true, t + " com a trava mfa");
    for (const k of ["SELECT", "INSERT", "UPDATE", "DELETE"]) assert.equal((await db.query("select has_table_privilege('anon', $1, $2) as p", ["public." + t, k])).rows[0].p, false, `anon não tem ${k} em ${t}`);
  }
  const c = (await db.query("select tabela, trava_mfa, backup, origem from public.seguranca_catalogo where origem = '071' order by 1")).rows;
  assert.deepEqual(c.map((x) => x.tabela), ["biblioteca_itens", "captura_itens"]); assert.ok(c.every((x) => x.trava_mfa && x.backup));
  const b = (await db.query("select id, public, file_size_limit from storage.buckets where id = 'captura'")).rows[0]; assert.equal(b.public, false); assert.equal(Number(b.file_size_limit), 52428800);
  assert.equal((await db.query("select has_function_privilege('anon', 'public.cap_arquivo_pode(text, text)', 'execute') as p")).rows[0].p, false, "a função de caminho não abre para anon");
  assert.equal(await msg(com(db, null, "select count(*) from public.captura_itens", [], { papel: "anon" })), (await msg(com(db, null, "select count(*) from public.captura_itens", [], { papel: "anon" }))), "estável");
  assert.match(await msg(com(db, null, "select * from public.captura_itens", [], { papel: "anon" })), /permission denied/, "anon não lê a caixa");
  assert.match(await msg(com(db, null, "select * from public.biblioteca_itens", [], { papel: "anon" })), /permission denied/, "anon não lê a Biblioteca");
  await db.close();
});

test("PGlite · a Captura é PRIVADA DO AUTOR: nem o dono do espaço compartilhado, nem um membro, nem outra pessoa lê, edita ou apaga o que não é seu", { skip: pular }, async () => {
  const db = await banco(), pr = await pessoal(db, R), px = await pessoal(db, X), ca = await casa(db);
  assert.equal((await cap(db, R, u(1), pr)).length, 1, "o autor cria no próprio espaço");
  /* Fernanda (editora na Casa) cria na Casa; o proprietário da Casa NÃO lê o que ela capturou, e ela não lê o dele */
  await cap(db, F, u(2), ca, { conteudo: "segredo da Fernanda" }); await cap(db, R, u(3), ca, { conteudo: "segredo do Rayner" });
  assert.deepEqual((await com(db, R, "select id from public.captura_itens order by id")).map((x) => x.id), [u(1), u(3)], "o dono vê só os dele, mesmo no espaço que é dele");
  assert.deepEqual((await com(db, F, "select id from public.captura_itens")).map((x) => x.id), [u(2)]);
  assert.deepEqual(await com(db, X, "select id from public.captura_itens"), [], "quem é de fora não vê nada");
  assert.equal((await com(db, R, "update public.captura_itens set estado = 'descartado' where id = $1 returning id", [u(2)])).length, 0, "não edita item alheio");
  assert.equal((await com(db, R, "delete from public.captura_itens where id = $1 returning id", [u(2)])).length, 0, "não apaga item alheio");
  /* criar em espaço alheio, ou em nome de outra pessoa */
  assert.match(await msg(cap(db, R, u(4), px)), /row-level security/, "não cria em espaço de outra pessoa");
  assert.match(await msg(cap(db, R, u(5), pr, { por: X })), /row-level security/, "não cria em nome de outra pessoa");
  assert.match(await msg(cap(db, X, u(6), ca)), /row-level security/, "quem não é da Casa não cria nela");
  /* leitor de espaço compartilhado: lê o espaço, mas não escreve nele */
  const esp = (await com(db, R, "select public.rac_espaco_criar('Viagem') as id"))[0].id;
  await com(db, R, "select public.rac_espaco_membro_definir($1, $2, 'leitor')", [esp, Y]);
  assert.match(await msg(cap(db, Y, u(7), esp)), /row-level security/, "leitor não captura no espaço compartilhado");
  await cap(db, R, u(8), esp, { conteudo: "ideia da viagem" }); assert.deepEqual(await com(db, Y, "select id from public.captura_itens"), [], "o leitor não vê a captura do proprietário");
  await db.close();
});

test("PGlite · idempotência e integridade: o mesmo id enviado duas vezes vira UMA linha; espaço, autor e data não mudam; 'classificado' exige destino; conteúdo e anexo são conferidos", { skip: pular }, async () => {
  const db = await banco(), pr = await pessoal(db, R);
  assert.equal((await cap(db, R, u(10), pr)).length, 1);
  assert.equal((await cap(db, R, u(10), pr, { conteudo: "OUTRO TEXTO (reenvio)" })).length, 0, "o reenvio não duplica nem sobrescreve (on conflict do nothing)");
  assert.deepEqual((await com(db, R, "select conteudo from public.captura_itens where id = $1", [u(10)])).map((x) => x.conteudo), ["comprar leite"], "vale o primeiro");
  assert.equal((await db.query("select count(*)::int n from public.captura_itens")).rows[0].n, 1);
  /* o espaço e o autor são imutáveis */
  const px = await pessoal(db, X);
  assert.match(await msg(com(db, R, "update public.captura_itens set espaco_id = $2 where id = $1", [u(10), px])), /row-level security|espaco_autor_imutaveis/);
  assert.match(await msg(com(db, R, "update public.captura_itens set criado_por = $2 where id = $1", [u(10), X])), /row-level security|espaco_autor_imutaveis/);
  /* classificado = com destino; desfazer volta a pendente e limpa o destino */
  assert.match(await msg(com(db, R, "update public.captura_itens set estado = 'classificado' where id = $1", [u(10)])), /captura_destino_coerente/);
  assert.equal((await com(db, R, `update public.captura_itens set estado = 'classificado', destino = '{"modulo":"lista","ids":[]}'::jsonb, classificado_em = now() where id = $1 returning estado`, [u(10)])).length, 1);
  assert.match(await msg(com(db, R, "update public.captura_itens set destino = null where id = $1", [u(10)])), /captura_destino_coerente/, "não dá para tirar o destino sem desfazer o estado");
  assert.equal((await com(db, R, "update public.captura_itens set estado = 'pendente', destino = null, classificado_em = null where id = $1 returning estado", [u(10)])).length, 1, "desfazer");
  /* conteúdo ou anexo; tipos; limites; anexos mal formados */
  assert.match(await msg(cap(db, R, u(11), pr, { conteudo: "  " })), /captura_tem_conteudo/);
  assert.equal((await cap(db, R, u(12), pr, { conteudo: "", tipo: "foto", anexos: JSON.stringify([{ path: `${pr}/${R}/${u(12)}/a.jpg`, nome: "a.jpg" }]) })).length, 1, "só anexo basta");
  assert.match(await msg(cap(db, R, u(13), pr, { tipo: "poema" })), /check/);
  assert.match(await msg(cap(db, R, u(14), pr, { conteudo: "x".repeat(20001) })), /check/);
  assert.match(await msg(cap(db, R, u(15), pr, { anexos: '{"a":1}' })), /check/, "anexos precisa ser lista");
  assert.match(await msg(cap(db, R, u(16), pr, { estado: "perdido" })), /check/);
  /* só o que foi descartado ou arquivado se exclui */
  assert.equal((await com(db, R, "delete from public.captura_itens where id = $1 returning id", [u(10)])).length, 0, "pendente não se exclui direto");
  await com(db, R, "update public.captura_itens set estado = 'descartado' where id = $1", [u(10)]);
  assert.equal((await com(db, R, "delete from public.captura_itens where id = $1 returning id", [u(10)])).length, 1, "descartado se exclui");
  await db.close();
});

test("PGlite · Biblioteca: por espaço (ler × editar), forma por tipo, um item por captura, referência a arquivo só dentro do próprio espaço, e arquivar antes de decidir", { skip: pular }, async () => {
  const db = await banco(), pr = await pessoal(db, R), px = await pessoal(db, X), ca = await casa(db);
  assert.equal((await bib(db, R, u(20), pr)).length, 1);
  /* o privado do dono não aparece para ninguém; a Casa aparece para a Fernanda (editora) */
  await bib(db, R, u(21), ca, { titulo: "Manual da casa" });
  assert.deepEqual((await com(db, F, "select id from public.biblioteca_itens")).map((x) => x.id), [u(21)], "a Fernanda lê a Casa, não o espaço pessoal do dono");
  assert.deepEqual(await com(db, X, "select id from public.biblioteca_itens"), []);
  assert.equal((await com(db, F, "update public.biblioteca_itens set titulo = 'Manual (editado)' where id = $1 returning id", [u(21)])).length, 1, "a editora altera o item da Casa");
  assert.equal((await com(db, F, "update public.biblioteca_itens set titulo = 'x' where id = $1 returning id", [u(20)])).length, 0, "e não o do espaço pessoal do dono");
  assert.match(await msg(bib(db, X, u(22), pr)), /row-level security/, "ninguém cria em espaço alheio");
  assert.match(await msg(com(db, R, "update public.biblioteca_itens set espaco_id = $2 where id = $1", [u(20), px])), /row-level security|espaco_imutavel/, "o espaço do item não muda");
  /* a forma depende do tipo */
  assert.match(await msg(bib(db, R, u(23), pr, { tipo: "link", titulo: "Site" })), /biblioteca_forma/, "link sem endereço");
  assert.match(await msg(bib(db, R, u(24), pr, { tipo: "arquivo", titulo: "Arq" })), /biblioteca_forma/, "arquivo sem referência");
  assert.match(await msg(bib(db, R, u(25), pr, { tipo: "link", titulo: "Site", url: "javascript:alert(1)" })), /check/, "só http e https");
  assert.equal((await bib(db, R, u(26), pr, { tipo: "link", titulo: "Site", url: "https://exemplo.com/a?b=1" })).length, 1);
  assert.match(await msg(bib(db, R, u(27), pr, { titulo: "  " })), /check/, "título vazio");
  /* um item por captura (a mesma captura não vira dois itens) */
  await bib(db, R, u(28), pr, { captura_id: u(900) });
  assert.match(await msg(bib(db, R, u(29), pr, { captura_id: u(900) })), /biblioteca_captura_unica|duplicate/);
  /* referência a arquivo do cofre: só dentro do PRÓPRIO espaço; sem '..'; só os cofres conhecidos */
  const ok = { tabela: "storage", bucket: "captura", path: `${pr}/${R}/${u(30)}/foto.jpg`, nome: "foto.jpg" };
  assert.equal((await bib(db, R, u(30), pr, { tipo: "arquivo", titulo: "Foto", ref: ok })).length, 1);
  assert.match(await msg(bib(db, R, u(31), pr, { tipo: "arquivo", titulo: "Roubo", ref: { ...ok, path: `${px}/${X}/${u(31)}/foto.jpg` } })), /biblioteca_ref_ok/, "não aponta para o espaço de outra pessoa");
  assert.match(await msg(bib(db, R, u(32), pr, { tipo: "arquivo", titulo: "Sobe", ref: { ...ok, path: `${pr}/../${px}/x.jpg` } })), /biblioteca_ref_ok/, "sem ..");
  assert.match(await msg(bib(db, R, u(33), pr, { tipo: "arquivo", titulo: "Outro", ref: { ...ok, bucket: "backups" } })), /biblioteca_ref_ok/, "só o cofre captura e o da família");
  assert.match(await msg(bib(db, R, u(34), pr, { tipo: "documento", titulo: "Doc", ref: { tabela: "usuarios", bucket: "familia", path: "x/y" } })), /biblioteca_ref_ok/, "só referências conhecidas");
  assert.equal((await bib(db, R, u(35), pr, { tipo: "documento", titulo: "Vacina", ref: { tabela: "registros", id: u(77), bucket: "familia", path: `${R}/olivia/vacina.pdf`, nome: "vacina.pdf", rota: "#olivia" } })).length, 1, "documento existente: só a referência");
  /* arquivar e excluir: o autor ou a administração */
  assert.equal((await com(db, R, "update public.biblioteca_itens set arquivada_em = now() where id = $1 returning id", [u(26)])).length, 1);
  assert.equal((await com(db, F, "delete from public.biblioteca_itens where id = $1 returning id", [u(21)])).length, 0, "a editora não apaga o que o dono criou");
  assert.equal((await com(db, R, "delete from public.biblioteca_itens where id = $1 returning id", [u(21)])).length, 1, "o autor (e dono) apaga");
  await db.close();
});

test("PGlite · Storage: bucket privado, só o autor escreve na própria pasta do espaço; quem lê o espaço só abre o arquivo que a Biblioteca aponta; arquivo apontado não se apaga; sem MFA, nada", { skip: pular }, async () => {
  const db = await banco(), pr = await pessoal(db, R), ca = await casa(db), px = await pessoal(db, X);
  const nome = (esp, uid, pasta, arq = "foto.jpg") => `${esp}/${uid}/${pasta}/${arq}`;
  const ins = (uid, n, o) => com(db, uid, "insert into storage.objects (bucket_id, name) values ('captura', $1)", [n], o);
  const ver = (uid, n, o) => com(db, uid, "select name from storage.objects where bucket_id = 'captura' and name = $1", [n], o);
  const apaga = (uid, n, o) => com(db, uid, "delete from storage.objects where bucket_id = 'captura' and name = $1 returning name", [n], o);
  /* escrita: própria pasta, em espaço que edita */
  const meu = nome(pr, R, u(40)); await ins(R, meu); assert.equal((await ver(R, meu)).length, 1, "o autor grava e lê o que enviou");
  assert.match(await msg(ins(R, nome(px, X, u(41)))), /row-level security/, "não grava no espaço de outra pessoa");
  assert.match(await msg(ins(R, nome(pr, X, u(42)))), /row-level security/, "nem na pasta de outro autor, mesmo no próprio espaço");
  assert.match(await msg(ins(X, nome(ca, X, u(43)))), /row-level security/, "quem não é da Casa não grava nela");
  assert.match(await msg(ins(R, `${pr}/${R}/foto.jpg`)), /row-level security/, "o caminho precisa ter espaço/autor/pasta/arquivo");
  assert.match(await msg(ins(R, `não-é-uuid/${R}/${u(44)}/foto.jpg`)), /row-level security/, "primeira parte inválida");
  assert.match(await msg(ins(R, `${pr}/${R}/${u(45)}/../../x.jpg`)), /row-level security/, "sem ..");
  /* leitura: de outra pessoa, só o que a Biblioteca aponta */
  const fer = nome(ca, F, u(46)); await ins(F, fer); await ins(R, nome(ca, R, u(47), "manual.pdf"));
  assert.equal((await ver(R, fer)).length, 0, "o proprietário da Casa NÃO abre o arquivo que a Fernanda ainda não enviou à Biblioteca");
  assert.equal((await ver(X, meu)).length, 0, "quem é de fora não abre nada");
  assert.equal((await ver(F, nome(ca, R, u(47), "manual.pdf"))).length, 0, "a Fernanda não abre o arquivo solto do dono");
  await bib(db, F, u(46), ca, { tipo: "arquivo", titulo: "Garantia", ref: { tabela: "storage", bucket: "captura", path: fer, nome: "foto.jpg" } });
  assert.equal((await ver(R, fer)).length, 1, "depois de a Biblioteca da Casa apontar para ele, quem lê a Casa abre");
  assert.equal((await ver(X, fer)).length, 0, "e de fora continua sem");
  /* apagar: autor, e só se nenhum item da Biblioteca aponta */
  assert.equal((await apaga(R, fer)).length, 0, "o proprietário não apaga arquivo alheio");
  assert.equal((await apaga(F, fer)).length, 0, "o autor não apaga arquivo que a Biblioteca ainda usa");
  await com(db, F, "delete from public.biblioteca_itens where id = $1", [u(46)]);
  assert.equal((await apaga(F, fer)).length, 1, "sem referência, o autor apaga");
  assert.equal((await apaga(R, meu)).length, 1, "o autor apaga o que não está na Biblioteca");
  /* a 2ª etapa vale no bucket (usuário com fator cadastrado precisa de aal2) */
  await db.exec(`insert into public.espacos (tipo, nome, dono) values ('compartilhado', 'M', '${M}') on conflict do nothing; insert into public.espacos (tipo, nome, dono) select 'pessoal', 'Pessoal', '${M}' where not exists (select 1 from public.espacos where dono = '${M}' and tipo = 'pessoal');`);
  const pm = await pessoal(db, M);
  assert.match(await msg(ins(M, nome(pm, M, u(48)), { aal: "aal1" })), /row-level security/, "com 2ª etapa cadastrada e sessão aal1: bloqueado");
  await ins(M, nome(pm, M, u(49)), { aal: "aal2" });
  assert.equal((await ver(M, nome(pm, M, u(49)), { aal: "aal2" })).length, 1);
  assert.equal((await ver(M, nome(pm, M, u(49)), { aal: "aal1" })).length, 0, "e sem aal2 nem lê");
  await db.close();
});
