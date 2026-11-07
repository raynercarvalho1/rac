// Lote 5.1 · migration 035 (compras_anexar e compras_gravar_com_foto): aplicada em produção em 07/11/2026.
// PARTE 1 (sempre roda, sem banco): o que está escrito no SQL (idempotência, segurança, escopo). PARTE 2 (precisa do PGlite, o Postgres que roda dentro do Node):
// o SQL de verdade, com o ambiente do Supabase imitado (papéis, auth, casa, MFA), como em banco_lote3.test.mjs. Sem PGlite, a parte 2 fica ignorada (no GitHub nunca se pula).
// Fidelidade e limites do PGlite: os mesmos descritos no começo de tests/banco_lote3.test.mjs. Nada disto fala com o Supabase. Todos os dados são fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const semComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
const S35 = ler("supabase/035_compras_anexar_foto.sql"), C35 = semComent(S35);

// ---------- PARTE 1: o texto do SQL ----------
test("035: arquivo numerado, status \"aplicado em produção\" na 1ª linha, em transação, e roda de novo sem erro (create or replace, nada de drop/truncate/delete)", () => {
  assert.match(S35.split("\n")[0], /^-- Aplicado em produção em 07\/11\/2026/); assert.doesNotMatch(S35.split("\n")[0], /status: pendente/, "não está mais pendente");
  assert.ok(fs.existsSync(new URL("../supabase/035_compras_anexar_foto.sql", import.meta.url)));
  assert.match(C35, /^\s*begin;/); assert.match(C35, /commit;\s*notify pgrst, 'reload schema';\s*$/);
  assert.equal((C35.match(/create or replace function/g) || []).length, 2);
  assert.doesNotMatch(C35, /\b(drop table|drop function|truncate|delete from|alter table|create table|create policy|drop policy|create trigger|drop trigger|insert into)\b/i, "só soma duas funções: nenhuma tabela, política, gatilho ou dado muda");
  assert.doesNotMatch(C35, /create or replace function public\.compras_gravar\(/, "compras_gravar (030) continua exatamente como está");
});
test("035: security invoker, search_path vazio, anon e public sem EXECUTE, só authenticated executa; nenhum security definer", () => {
  for (const f of ["compras_anexar\\(p_id uuid, p_docs jsonb, p_complemento jsonb\\)", "compras_gravar_com_foto\\(p_compra jsonb, p_itens jsonb, p_docs jsonb, p_novo boolean, p_foto text\\)"])
    assert.match(C35, new RegExp("create or replace function public\\." + f + "\\s+returns jsonb language plpgsql security invoker set search_path = ''"), f);
  assert.doesNotMatch(C35, /security definer/i);
  assert.match(C35, /revoke all on function public\.compras_anexar\(uuid, jsonb, jsonb\) from public, anon;/);
  assert.match(C35, /grant execute on function public\.compras_anexar\(uuid, jsonb, jsonb\) to authenticated;/);
  assert.match(C35, /revoke all on function public\.compras_gravar_com_foto\(jsonb, jsonb, jsonb, boolean, text\) from public, anon;/);
  assert.match(C35, /grant execute on function public\.compras_gravar_com_foto\(jsonb, jsonb, jsonb, boolean, text\) to authenticated;/);
  assert.doesNotMatch(C35, /grant execute[^;]*to (anon|public)/i, "ninguém além de authenticated");
  assert.doesNotMatch(C35, /service_role/);
});
test("035: o complemento só aceita o que o site completava (chave, NF, emitente, CNPJ, status de aviso e divergências); só preenche o vazio; a foto só liga se ficou registrada", () => {
  assert.match(C35, /campos constant text\[\] := array\['chave_nfe', 'numero_nf', 'emitente', 'cnpj', 'status', 'divergencias'\];/);
  assert.match(C35, /v_st not in \('cancelamento_informado', 'reembolso_informado'\)/);
  for (const k of ["chave_nfe", "numero_nf", "emitente", "cnpj"]) assert.match(C35, new RegExp(`v_${{ chave_nfe: "ch", numero_nf: "nf", emitente: "em", cnpj: "cn" }[k]} := case when coalesce\\(v_c\\.${k}, ''\\) = '' then`), k + ": só se estava vazio");
  assert.match(C35, /v_st := case when v_c\.status is null or v_c\.status = '' then v_st end;/);
  assert.match(C35, /where not exists \(select 1 from jsonb_array_elements\(v_c\.divergencias\) o where o->>'texto' = a\.e->>'texto'\)/, "divergência com o mesmo texto não entra de novo");
  assert.match(C35, /v_r := public\.compras_gravar\(jsonb_build_object\('id', p_id\), null, p_docs, false\);/, "os documentos passam pelo modo só documentos de compras_gravar");
  assert.match(C35, /d\.path = p_foto and d\.tipo = 'foto_produto'/); assert.match(C35, /it\.ordem = 0 and it\.imagem_path is null/);
  assert.match(C35, /not coalesce\(\(v_r->>'ja_existia'\)::boolean, false\)/);
  assert.match(C35, /errcode = '42501'/); assert.match(C35, /errcode = 'P0002'/); assert.match(C35, /errcode = '22023'/);
});
test("035: cabeçalho explica o que faz, a ordem e a segurança", () => {
  const cab = S35.split("\nbegin;")[0];
  for (const t of ["Rode depois do 030", "Pode rodar de novo", "só preenchem o que está VAZIO", "security invoker", "Aplicado em produção"]) assert.ok(cab.includes(t), t);
});

// ---------- PARTE 2: o SQL de verdade (PGlite) ----------
let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite: pula */ }
const pular = !PGlite && !process.env.CI;
const R = "11111111-1111-4111-8111-111111111111", F = "22222222-2222-4222-8222-222222222222", X = "33333333-3333-4333-8333-333333333333";
const C1 = "c0000000-0000-4000-8000-000000000001", C2 = "c0000000-0000-4000-8000-000000000002";
const trecho = (arq, ini, fim) => { const t = ler(arq), i = t.indexOf(ini); assert.ok(i >= 0, ini); return t.slice(i, t.indexOf(fim, i) + fim.length); };
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
    insert into auth.users values ('${R}'), ('${F}'), ('${X}');
    create schema storage; grant usage on schema storage to anon, authenticated, service_role;
    create table storage.buckets (id text primary key, name text, public boolean default false, allowed_mime_types text[]);
    insert into storage.buckets (id, name, public) values ('familia', 'familia', false);
    create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
    grant select on storage.objects to authenticated;
  `);
  await db.exec(trecho("supabase/002_casa_compartilhada.sql", "create table if not exists public.membros", "grant execute on function public.dono_da_casa() to authenticated;"));
  await db.exec(trecho("supabase/022_seguranca.sql", "create or replace function public.rac_aal_ok()", "grant execute on function public.rac_aal_ok() to authenticated;"));
  await db.exec(`
    insert into public.membros (membro, dono) values ('${F}', '${R}');
    create table public.notas (id uuid primary key default gen_random_uuid(), user_id uuid default public.dono_da_casa());
    create table public.pedidos (id uuid primary key default gen_random_uuid(), user_id uuid default public.dono_da_casa());
    create table public.registros (id uuid primary key default gen_random_uuid(), user_id uuid default public.dono_da_casa());
  `);
  for (const a of ["025_compras_online", "026_compras_emails", "030_compras_multiorigem", "031_compras_reembolsos", "032_central_fiscal", "033_seguranca_compras_fiscal", "035_compras_anexar_foto"]) await db.exec(ler(`supabase/${a}.sql`));
  return db;
}
async function como(db, uid, sql, params = [], aal = "aal1") {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, role: "authenticated", aal })]);
  await db.exec(uid ? "set role authenticated" : "set role anon");
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); }
}
const erro = async (p) => { try { await p; } catch (e) { return e; } assert.fail("era para dar erro"); };
const pasta = (id = C1) => `${R}/compras/${id}/`;
const compra = (o = {}) => ({ id: C1, loja: "amazon", canal: "amazon", natureza: "fisica", numero: "701-0000001-0000001", data: "2026-10-03", subtotal: 100, desconto: 5, frete: 0, taxas: 0, total_pago: 95, origem: "manual", ...o });
const itensOk = () => [{ descricao: "Ração Exemplo", qtd: 1, total: 100, total_linha: 95, natureza: "fisica", situacao: "concluido" }];
const doc = (n = 1, o = {}) => ({ tipo: "resumo_pdf", nome: `resumo${n}.pdf`, path: `${pasta()}arq${n}.pdf`, mime: "application/pdf", tamanho: 10, sha256: String(n).repeat(64).slice(0, 64), extraido: {}, ...o });
const noCofre = (db, ...paths) => db.query("insert into storage.objects (bucket_id, name) select 'familia', unnest($1::text[])", [paths]);
const gravar = (db, uid, c, i, d, novo, aal) => como(db, uid, "select public.compras_gravar($1::jsonb, $2::jsonb, $3::jsonb, $4) as r", [JSON.stringify(c), i == null ? null : JSON.stringify(i), JSON.stringify(d), novo], aal).then((r) => r[0].r);
const anexar = (db, uid, id, d, comp, aal) => como(db, uid, "select public.compras_anexar($1::uuid, $2::jsonb, $3::jsonb) as r", [id, JSON.stringify(d), comp == null ? null : JSON.stringify(comp)], aal).then((r) => r[0].r);
const comFoto = (db, uid, c, i, d, novo, foto, aal) => como(db, uid, "select public.compras_gravar_com_foto($1::jsonb, $2::jsonb, $3::jsonb, $4, $5) as r", [JSON.stringify(c), i == null ? null : JSON.stringify(i), JSON.stringify(d), novo, foto], aal).then((r) => r[0].r);
const contar = async (db, t, onde = "true") => +(await db.query(`select count(*)::int as n from public.${t} where ${onde}`)).rows[0].n;
const linha = async (db, id = C1) => (await db.query("select * from public.compras_online where id = $1", [id])).rows[0];
const KEY = "1".repeat(44), KEY2 = "2".repeat(44);

test("035 · compras_anexar: anexa o documento E completa a compra (chave, NF, emitente, CNPJ, status, divergências) na mesma transação", { skip: pular }, async () => {
  const db = await banco();
  await gravar(db, R, compra(), itensOk(), [], true);
  const antes = await linha(db);
  assert.deepEqual([antes.chave_nfe, antes.numero_nf, antes.emitente, antes.cnpj, antes.status], [null, null, null, null, null]);
  await noCofre(db, doc(1).path, doc(2).path);
  const r = await anexar(db, R, C1, [doc(1), doc(2)], { chave_nfe: KEY, numero_nf: "1234", emitente: "Loja LTDA", cnpj: "11222333000144", status: "cancelamento_informado", divergencias: [{ campo: "total_pago", texto: "O e-mail diz 90,00." }] });
  assert.deepEqual([r.id, r.docs_gravados, r.docs_repetidos], [C1, 2, []]);
  assert.deepEqual(r.completados.sort(), ["chave_nfe", "cnpj", "divergencias", "emitente", "numero_nf", "status"]); assert.equal(r.divergencias_novas, 1);
  const d = await linha(db);
  assert.deepEqual([d.chave_nfe, d.numero_nf, d.emitente, d.cnpj, d.status], [KEY, "1234", "Loja LTDA", "11222333000144", "cancelamento_informado"]);
  assert.deepEqual(d.divergencias, [{ campo: "total_pago", texto: "O e-mail diz 90,00." }]); assert.ok(d.atualizado_em, "atualizado_em marcado");
  assert.equal(await contar(db, "compras_online_docs"), 2);
  for (const k of ["subtotal", "desconto", "frete", "taxas", "total_pago", "origem", "historico", "canal", "natureza"]) assert.equal(String(d[k]), String(antes[k]), k + " não muda");
  assert.equal(d.versoes.length, 0, "não conta como edição da compra"); assert.equal(await contar(db, "compras_online_itens"), 1, "os produtos não mudam");
  await db.close();
});
test("035 · compras_anexar: só preenche o que está vazio, não repete divergência e só pede aviso quando não há status", { skip: pular }, async () => {
  const db = await banco();
  await gravar(db, R, compra({ chave_nfe: KEY, numero_nf: "9", emitente: "Antigo", cnpj: "99888777000166", status: "concluido", divergencias: [{ campo: "x", texto: "já existe" }] }), itensOk(), [], true);
  await noCofre(db, doc(1).path);
  const r = await anexar(db, R, C1, [doc(1)], { chave_nfe: KEY2, numero_nf: "1", emitente: "Novo", cnpj: "11222333000144", status: "cancelamento_informado", divergencias: [{ texto: "já existe" }, { texto: "nova" }, { texto: "nova" }] });
  assert.deepEqual(r.completados, ["divergencias"], "só a divergência nova entrou, uma vez"); assert.equal(r.divergencias_novas, 1);
  const d = await linha(db);
  assert.deepEqual([d.chave_nfe, d.numero_nf, d.emitente, d.cnpj, d.status], [KEY, "9", "Antigo", "99888777000166", "concluido"], "nada do que já estava gravado foi trocado");
  assert.deepEqual(d.divergencias.map((x) => x.texto), ["já existe", "nova"]);
  assert.deepEqual((await anexar(db, R, C1, [], {})).completados, [], "complemento vazio e sem documentos: nada muda");
  assert.deepEqual((await anexar(db, R, C1, [], null)).completados, [], "sem complemento (nulo)");
  const so = await anexar(db, R, C1, [], { status: null, chave_nfe: null, divergencias: null }); assert.deepEqual(so.completados, [], "nulos não completam nada");
  await db.close();
});
test("035 · compras_anexar: tudo ou nada — chave que é de outra compra volta a transação inteira (o documento também não fica)", { skip: pular }, async () => {
  const db = await banco();
  await gravar(db, R, compra({ id: C2, numero: "OUTRA", chave_nfe: KEY }), itensOk(), [], true);
  await gravar(db, R, compra(), itensOk(), [], true);
  await noCofre(db, doc(1).path);
  const e = await erro(anexar(db, R, C1, [doc(1)], { chave_nfe: KEY, numero_nf: "1", divergencias: [{ texto: "x" }] }));
  assert.match(e.message, /compras_online_nfe_unica/);
  assert.equal(await contar(db, "compras_online_docs"), 0, "o documento não ficou"); const d = await linha(db);
  assert.deepEqual([d.chave_nfe, d.numero_nf, d.divergencias, d.atualizado_em], [null, null, [], null], "nenhum campo ficou");
  await db.close();
});
test("035 · compras_anexar: valida o complemento antes de gravar qualquer coisa", { skip: pular }, async () => {
  const db = await banco();
  await gravar(db, R, compra(), itensOk(), [], true); await noCofre(db, doc(1).path);
  const ruim = [[{ user_id: R }, /campo não permitido no complemento: user_id/], [{ total_pago: 1 }, /campo não permitido no complemento: total_pago/], [{ chave_nfe: "123" }, /chave da nota inválida/], [{ chave_nfe: 5 }, /precisa ser texto/],
    [{ cnpj: "12" }, /CNPJ inválido/], [{ numero_nf: "x".repeat(21) }, /número da nota longo/], [{ emitente: "x".repeat(161) }, /emitente longo/], [{ status: "cancelado" }, /status não permitido/],
    [{ status: "concluido" }, /status não permitido/], [{ divergencias: "x" }, /precisa ser uma lista/], [{ divergencias: ["x"] }, /precisa ser um objeto/], [{ divergencias: [{ texto: "" }] }, /texto inválido/],
    [{ divergencias: [{ texto: "x".repeat(301) }] }, /texto inválido/], [{ divergencias: [{ texto: "a", extra: 1 }] }, /campo não permitido na divergência/], [{ divergencias: [{ texto: "a", campo: 7 }] }, /campo inválido/],
    [{ divergencias: Array.from({ length: 21 }, (_, i) => ({ texto: "t" + i })) }, /divergências demais/], [[], /precisa ser um objeto/]];
  for (const [comp, re] of ruim) assert.match((await erro(anexar(db, R, C1, [doc(1)], comp))).message, re, JSON.stringify(comp).slice(0, 60));
  assert.match((await erro(como(db, R, "select public.compras_anexar($1::uuid, $2::jsonb, $3::jsonb)", [C1, JSON.stringify({ a: 1 }), "{}"]))).message, /lista de documentos precisa ser uma lista/);
  assert.match((await erro(como(db, R, "select public.compras_anexar(null, '[]'::jsonb, '{}'::jsonb)"))).message, /falta o id da compra/);
  assert.equal(await contar(db, "compras_online_docs"), 0, "nada foi gravado em nenhum caso"); assert.equal((await linha(db)).atualizado_em, null);
  assert.match((await erro(anexar(db, R, C1, [doc(2)], {}))).message, /não está no cofre/, "as validações de documento são as de compras_gravar");
  assert.match((await erro(anexar(db, R, C1, [doc(1, { path: `${pasta(C2)}x.pdf` })], {}))).message, /fora da pasta|não está no cofre/);
  await db.close();
});
test("035 · compras_anexar: quem é da casa anexa, estranho e anon não, e a trava da 2ª etapa vale", { skip: pular }, async () => {
  const db = await banco();
  await gravar(db, R, compra(), itensOk(), [], true); await noCofre(db, doc(1).path, doc(2).path);
  assert.equal((await anexar(db, F, C1, [doc(1)], { numero_nf: "7" })).docs_gravados, 1, "Fernanda (da casa) anexa");
  assert.match((await erro(anexar(db, X, C1, [], {}))).message, /compra não encontrada/, "estranho não enxerga a compra");
  assert.match((await erro(anexar(db, null, C1, [doc(2)], {}))).message, /permission denied for function compras_anexar/, "anon não executa");
  assert.match((await erro(anexar(db, "00000000-0000-4000-8000-0000000000ff", C1, [], {}))).message, /faça login|compra não encontrada|row-level/, "usuário de fora da casa");
  await db.exec(`insert into auth.mfa_factors values ('${R}', 'verified')`);
  assert.match((await erro(anexar(db, R, C1, [doc(2)], { numero_nf: "8" }, "aal1"))).message, /compra não encontrada|row-level security/, "com fator e sem o código, a trava esconde a compra e nada grava");
  assert.equal(await contar(db, "compras_online_docs", "path = '" + doc(2).path + "'"), 0, "o documento não ficou");
  assert.equal((await anexar(db, R, C1, [doc(2)], {}, "aal2")).docs_gravados, 1);
  assert.match((await erro(anexar(db, R, "00000000-0000-4000-8000-00000000dead", [], {}))).message, /compra não encontrada/);
  await db.close();
});
test("035 · compras_anexar: repetido volta em docs_repetidos e o complemento vale", { skip: pular }, async () => {
  const db = await banco();
  await noCofre(db, doc(1).path);
  await gravar(db, R, compra(), itensOk(), [doc(1)], true);
  await noCofre(db, `${pasta()}dup.pdf`);
  const r = await anexar(db, R, C1, [doc(9, { path: `${pasta()}dup.pdf`, sha256: doc(1).sha256 })], { emitente: "E" });
  assert.deepEqual([r.docs_gravados, r.docs_repetidos, r.completados], [0, [`${pasta()}dup.pdf`], ["emitente"]]); assert.equal(await contar(db, "compras_online_docs"), 1);
  await db.close();
});

// ---- a foto ----
const FOTO = (n, id = C1, o = {}) => doc(n, { tipo: "foto_produto", nome: `produto${n}.png`, path: `${pasta(id)}foto${n}.png`, mime: "image/png", ...o });
test("035 · compras_gravar_com_foto: liga o 1º produto à foto SÓ se ela ficou registrada; foto repetida não é ligada; nada aponta para arquivo que sumiu", { skip: pular }, async () => {
  const db = await banco();
  await noCofre(db, doc(1).path, FOTO(7).path);
  const r = await comFoto(db, R, compra(), itensOk(), [doc(1), FOTO(7)], true, FOTO(7).path);
  assert.deepEqual([r.criado, r.docs_gravados, r.foto_vinculada], [true, 2, true]);
  assert.equal((await db.query("select imagem_path from public.compras_online_itens where compra_id = $1", [C1])).rows[0].imagem_path, FOTO(7).path);
  assert.equal(await contar(db, "compras_online_docs", "tipo = 'foto_produto'"), 1);
  /* outra compra com a MESMA foto (mesmo SHA-256): compras_gravar a descarta e o produto NÃO é ligado */
  await noCofre(db, FOTO(8, C2, { sha256: FOTO(7).sha256 }).path);
  const r2 = await comFoto(db, R, compra({ id: C2, numero: "X2" }), itensOk(), [FOTO(8, C2, { sha256: FOTO(7).sha256 })], true, FOTO(8, C2).path);
  assert.deepEqual([r2.docs_gravados, r2.docs_repetidos, r2.foto_vinculada], [0, [FOTO(8, C2).path], false]);
  assert.equal((await db.query("select imagem_path from public.compras_online_itens where compra_id = $1", [C2])).rows[0].imagem_path, null, "sem imagem_path: nada aponta para o arquivo descartado");
  assert.equal(await contar(db, "compras_online_itens", "imagem_path is not null and imagem_path not in (select path from public.compras_online_docs)"), 0, "todo imagem_path é um documento registrado");
  await db.close();
});
test("035 · compras_gravar_com_foto: toque duplo não liga de novo, produto que já tem imagem não muda, sem foto é igual a compras_gravar", { skip: pular }, async () => {
  const db = await banco();
  await noCofre(db, FOTO(7).path, FOTO(6).path);
  await comFoto(db, R, compra(), itensOk(), [FOTO(7)], true, FOTO(7).path);
  const dup = await comFoto(db, R, compra(), itensOk(), [FOTO(6)], true, FOTO(6).path);
  assert.deepEqual([dup.ja_existia, dup.foto_vinculada], [true, false], "compra que já existia: nada muda");
  assert.equal((await db.query("select imagem_path from public.compras_online_itens")).rows[0].imagem_path, FOTO(7).path);
  /* edição: o produto já tem imagem_path (preservado pelo site) e uma foto nova entra só como documento */
  const ed = await comFoto(db, R, compra({ subtotal: 110, total_pago: 105 }), [{ ...itensOk()[0], imagem_path: FOTO(7).path }], [FOTO(6)], false, FOTO(6).path);
  assert.deepEqual([ed.docs_gravados, ed.foto_vinculada], [1, false]);
  assert.equal((await db.query("select imagem_path from public.compras_online_itens")).rows[0].imagem_path, FOTO(7).path, "a imagem de antes continua");
  assert.equal(await contar(db, "compras_online_docs", "tipo = 'foto_produto'"), 2);
  /* sem p_foto: o mesmo que compras_gravar */
  await db.exec("delete from public.compras_online_docs"); await noCofre(db, `${pasta(C2)}arq1.pdf`);
  const sem = await comFoto(db, R, compra({ id: C2, numero: "SEM" }), itensOk(), [doc(1, { path: `${pasta(C2)}arq1.pdf` })], true, null);
  assert.deepEqual([sem.criado, sem.docs_gravados, sem.foto_vinculada], [true, 1, false]);
  await db.close();
});
test("035 · compras_gravar_com_foto: caminho de foto inválido, erro no meio desfaz tudo, e as permissões são as de compras_gravar", { skip: pular }, async () => {
  const db = await banco();
  await noCofre(db, FOTO(7).path);
  for (const p of ["", "  ", "../x.png", `${pasta()}../x.png`, "a".repeat(301)]) assert.match((await erro(comFoto(db, R, compra(), itensOk(), [FOTO(7)], true, p))).message, /caminho da foto inválido/, JSON.stringify(p).slice(0, 20));
  assert.equal(await contar(db, "compras_online"), 0);
  const e = await erro(comFoto(db, R, compra({ total_pago: 50 }), itensOk(), [FOTO(7)], true, FOTO(7).path));
  assert.match(e.message, /compras_online_conta_fecha/); assert.equal(await contar(db, "compras_online"), 0); assert.equal(await contar(db, "compras_online_docs"), 0);
  assert.match((await erro(comFoto(db, null, compra(), itensOk(), [FOTO(7)], true, FOTO(7).path))).message, /permission denied for function compras_gravar_com_foto/, "anon não executa");
  assert.match((await erro(comFoto(db, X, compra({ numero: "ESTR" }), itensOk(), [], false, null))).message, /compra não encontrada/, "estranho");
  await db.exec(`insert into auth.mfa_factors values ('${R}', 'verified')`);
  assert.match((await erro(comFoto(db, R, compra(), itensOk(), [FOTO(7)], true, FOTO(7).path, "aal1"))).message, /row-level security/);
  assert.equal((await comFoto(db, R, compra(), itensOk(), [FOTO(7)], true, FOTO(7).path, "aal2")).foto_vinculada, true);
  await db.close();
});
test("035 · compras_gravar (030) continua igual: as duas funções novas são as únicas coisas que a 035 acrescenta", { skip: pular }, async () => {
  const db = await banco();
  const f = (await db.query("select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname like 'compras_%' order by 1")).rows.map((x) => x.proname);
  assert.ok(["compras_gravar", "compras_anexar", "compras_gravar_com_foto"].every((n) => f.includes(n)));
  assert.equal((await db.query("select count(*)::int as n from pg_proc where proname = 'compras_gravar'")).rows[0].n, 1, "sem sobrecarga nova");
  assert.equal((await db.query("select prosecdef from pg_proc where proname in ('compras_anexar', 'compras_gravar_com_foto')")).rows.every((r) => r.prosecdef === false), true, "security invoker");
  await db.close();
  const db2 = await banco(); await db2.exec(ler("supabase/035_compras_anexar_foto.sql")); await db2.exec(ler("supabase/035_compras_anexar_foto.sql")); await db2.close();   // roda de novo sem erro
});

// ============================================================================================================================================
// PARIDADE: o banco simulado dos testes do site (tests/_compras_falso.mjs) faz EXATAMENTE o que o SQL real faz?
// Os mesmos passos rodam no Postgres de verdade (PGlite, com o SQL real da 030 e da 035) e no simulador; a cada passo comparam-se a resposta (dados, ou código e mensagem do erro)
// e as tabelas (compras, produtos, documentos). Qualquer diferença entre o simulador e o SQL derruba o teste. Ignorado sem PGlite (no GitHub nunca se pula).
// ============================================================================================================================================
import { banco as bancoFalso, fotografia } from "./_compras_falso.mjs";
const clone = (x) => JSON.parse(JSON.stringify(x));
const jn = (v) => v == null ? null : JSON.stringify(v);
const SQLRPC = { compras_gravar: "select public.compras_gravar($1::jsonb, $2::jsonb, $3::jsonb, $4) as r", compras_gravar_com_foto: "select public.compras_gravar_com_foto($1::jsonb, $2::jsonb, $3::jsonb, $4, $5) as r",
  compras_anexar: "select public.compras_anexar($1::uuid, $2::jsonb, $3::jsonb) as r" };
const PARAMS = { compras_gravar: (a) => [jn(a.p_compra), jn(a.p_itens), jn(a.p_docs), a.p_novo], compras_gravar_com_foto: (a) => [jn(a.p_compra), jn(a.p_itens), jn(a.p_docs), a.p_novo, a.p_foto ?? null], compras_anexar: (a) => [a.p_id, jn(a.p_docs), jn(a.p_complemento)] };
const ordena = (l, f) => l.slice().sort((a, b) => f(a) < f(b) ? -1 : f(a) > f(b) ? 1 : 0);
async function fotoReal(db) {
  const q = async (sql) => (await db.query(sql)).rows;
  return { compras: ordena(await q("select id, numero, chave_nfe, numero_nf, emitente, cnpj, status, divergencias, (atualizado_em is not null) as editada, total_pago::float8 as total_pago from public.compras_online"), (c) => c.id),
    itens: ordena(await q("select compra_id, ordem, descricao, imagem_path from public.compras_online_itens"), (i) => i.compra_id + i.ordem),
    docs: ordena(await q("select compra_id, tipo, path, sha256 from public.compras_online_docs"), (d) => d.path) };
}
/** passos: {cofre:[caminhos]} ou {rpc, args, erro?: /mensagem/, ok?: (dados) => void}; devolve as respostas reais. */
async function paridade(passos) {
  const db = await banco(), falso = bancoFalso({ casa: R }), reais = [];
  try {
    for (const [i, p] of passos.entries()) {
      const rot = `passo ${i + 1} (${p.cofre ? "cofre" : p.rpc}${p.nota ? ": " + p.nota : ""})`;
      if (p.cofre) { await noCofre(db, ...p.cofre); p.cofre.forEach((c) => falso.S.storage.set(c, true)); continue; }
      let real; try { real = { data: (await como(db, R, SQLRPC[p.rpc], PARAMS[p.rpc](p.args)))[0].r }; } catch (e) { real = { error: { code: e.code, message: e.message } }; }
      const sim = await falso.sb.rpc(p.rpc, p.args);
      assert.deepEqual(clone(sim), clone(real), rot + ": a resposta do simulador tem de ser a do SQL real");
      assert.deepEqual(clone(fotografia(falso.S)), clone(await fotoReal(db)), rot + ": as tabelas do simulador têm de ficar iguais às do SQL real");
      if (p.erro) { assert.ok(real.error, rot + ": era para dar erro no SQL real"); assert.match(real.error.message, p.erro, rot); } else assert.ok(real.data, rot + ": era para dar certo no SQL real: " + JSON.stringify(real.error));
      if (p.ok) p.ok(real.data);
      reais.push(real);
    }
  } finally { await db.close(); }
  return reais;
}
const G = (args, extra = {}) => ({ rpc: "compras_gravar", args, ...extra });
const GF = (args, foto, extra = {}) => ({ rpc: "compras_gravar_com_foto", args: { ...args, p_foto: foto }, ...extra });
const AX = (id, docs, comp, extra = {}) => ({ rpc: "compras_anexar", args: { p_id: id, p_docs: docs, p_complemento: comp }, ...extra });
const NOVA = (o = {}, docs = [], foto = null, ex = {}) => GF({ p_compra: compra(o), p_itens: itensOk(), p_docs: docs, p_novo: true }, foto, ex);
const cof = (...c) => ({ cofre: c });
const VAZIA = () => [cof(doc(1).path, doc(2).path), G({ p_compra: compra(), p_itens: itensOk(), p_docs: [], p_novo: true })];

test("paridade · foto: nova ligada ao 1º produto só se registrada; repetida já guardada; repetida descoberta só pela RPC; toque duplo", { skip: pular }, async () => {
  const r = await paridade([
    cof(doc(1).path, FOTO(7).path), NOVA({}, [doc(1), FOTO(7)], FOTO(7).path, { nota: "foto nova", ok: (d) => assert.deepEqual([d.criado, d.docs_gravados, d.foto_vinculada], [true, 2, true]) }),
    cof(FOTO(8, C2, { sha256: FOTO(7).sha256 }).path), NOVA({ id: C2, numero: "X2" }, [FOTO(8, C2, { sha256: FOTO(7).sha256 })], FOTO(8, C2).path, { nota: "foto repetida (SHA já registrado)", ok: (d) => assert.deepEqual([d.docs_gravados, d.docs_repetidos, d.foto_vinculada], [0, [FOTO(8, C2).path], false]) }),
    cof(FOTO(6).path), NOVA({}, [FOTO(6)], FOTO(6).path, { nota: "toque duplo", ok: (d) => assert.deepEqual([d.ja_existia, d.foto_vinculada, d.docs_gravados], [true, false, 0]) }),
  ]);
  assert.equal(r.length, 3);
});
test("paridade · foto: edição preserva o imagem_path e não troca por foto nova; produto sem imagem ganha a foto; foto fora dos documentos não liga", { skip: pular }, async () => {
  await paridade([
    cof(FOTO(7).path, FOTO(5).path), NOVA({}, [FOTO(7)], FOTO(7).path),
    GF({ p_compra: compra({ subtotal: 110, total_pago: 105 }), p_itens: [{ ...itensOk()[0], imagem_path: FOTO(7).path }], p_docs: [FOTO(5)], p_novo: false }, FOTO(5).path, { nota: "edição com foto nova e imagem antiga", ok: (d) => assert.deepEqual([d.foto_vinculada, d.docs_gravados], [false, 1]) }),
  ]);
  await paridade([
    cof(FOTO(7).path), G({ p_compra: compra(), p_itens: itensOk(), p_docs: [], p_novo: true }),
    GF({ p_compra: compra(), p_itens: itensOk(), p_docs: [FOTO(7)], p_novo: false }, FOTO(7).path, { nota: "edição: produto sem imagem", ok: (d) => assert.equal(d.foto_vinculada, true) }),
  ]);
  await paridade([
    cof(doc(1).path, FOTO(9).path), NOVA({}, [doc(1)], FOTO(9).path, { nota: "p_foto fora de p_docs", ok: (d) => assert.equal(d.foto_vinculada, false) }),
    NOVA({ id: C2, numero: "SEM" }, [], null, { nota: "sem foto" }),
  ]);
});
test("paridade · foto: caminhos de foto inválidos e erros herdados de compras_gravar", { skip: pular }, async () => {
  const ruim = ["", "  ", "../x.png", `${pasta()}../x.png`, "a".repeat(301)];
  await paridade([cof(FOTO(7).path), ...ruim.map((p) => NOVA({}, [FOTO(7)], p, { erro: /caminho da foto inválido/, nota: JSON.stringify(p).slice(0, 14) })),
    NOVA({ total_pago: 50 }, [FOTO(7)], FOTO(7).path, { erro: /compras_online_conta_fecha/, nota: "a conta não fecha: tudo volta" }),
    NOVA({}, [FOTO(7)], FOTO(7).path, { nota: "depois do erro, o mesmo arquivo ainda grava (mesma compra, mesma pasta)", ok: (d) => assert.equal(d.foto_vinculada, true) })]);
});
test("paridade · anexar: completa a compra, só preenche o vazio, status só sem status, divergência sem repetir", { skip: pular }, async () => {
  await paridade([...VAZIA(),
    AX(C1, [doc(1), doc(2)], { chave_nfe: KEY, numero_nf: "1234", emitente: "Loja LTDA", cnpj: "11222333000144", status: "cancelamento_informado", divergencias: [{ campo: "total_pago", texto: "O e-mail diz 90,00." }] },
      { nota: "completa tudo", ok: (d) => assert.deepEqual(d.completados, ["chave_nfe", "numero_nf", "emitente", "cnpj", "status", "divergencias"]) }),
    AX(C1, [], { chave_nfe: KEY2, numero_nf: "9", emitente: "Outro", cnpj: "99888777000166", status: "reembolso_informado", divergencias: [{ texto: "O e-mail diz 90,00." }, { texto: "nova" }, { texto: "nova" }, { texto: "outra", campo: "x" }] },
      { nota: "nada do que já está gravado é trocado; só divergência nova", ok: (d) => assert.deepEqual([d.completados, d.divergencias_novas], [["divergencias"], 2]) }),
    AX(C1, [], {}, { nota: "complemento vazio", ok: (d) => assert.deepEqual(d.completados, []) }), AX(C1, [], null, { nota: "complemento nulo" }),
    AX(C1, [], { status: null, chave_nfe: null, divergencias: null }, { nota: "nulos não completam" }),
  ]);
  await paridade([cof(doc(1).path), G({ p_compra: compra({ status: "" }), p_itens: itensOk(), p_docs: [], p_novo: true }, { erro: /compras_online_status_vocab/, nota: "status '' o banco recusa (CHECK de vocabulário)" }),
    G({ p_compra: compra({ emitente: "" }), p_itens: itensOk(), p_docs: [], p_novo: true }),
    AX(C1, [doc(1)], { status: "reembolso_informado", emitente: "Preenche o vazio" }, { nota: "status nulo e emitente '' contam como vazios", ok: (d) => assert.deepEqual(d.completados, ["emitente", "status"]) })]);
  await paridade([cof(doc(1).path), cof(`${pasta()}dup.pdf`), G({ p_compra: compra(), p_itens: itensOk(), p_docs: [], p_novo: true }), AX(C1, [doc(1)], { numero_nf: "7" }),
    AX(C1, [doc(9, { path: `${pasta()}dup.pdf`, sha256: doc(1).sha256 })], { emitente: "E" }, { nota: "documento repetido: volta em docs_repetidos e o complemento vale", ok: (d) => assert.deepEqual([d.docs_gravados, d.docs_repetidos, d.completados], [0, [`${pasta()}dup.pdf`], ["emitente"]]) })]);
});
test("paridade · anexar: chave da nota que é de outra compra recusa TUDO (o documento também não fica)", { skip: pular }, async () => {
  await paridade([cof(doc(1).path), G({ p_compra: compra({ id: C2, numero: "OUTRA", chave_nfe: KEY }), p_itens: itensOk(), p_docs: [], p_novo: true }), G({ p_compra: compra(), p_itens: itensOk(), p_docs: [], p_novo: true }),
    AX(C1, [doc(1)], { chave_nfe: KEY, numero_nf: "7", divergencias: [{ texto: "x" }] }, { erro: /compras_online_nfe_unica/, nota: "rollback integral" }),
    AX(C1, [doc(1)], { numero_nf: "7" }, { nota: "sem a chave repetida, o mesmo arquivo anexa" }),
    G({ p_compra: compra({ id: "c0000000-0000-4000-8000-000000000003", numero: "TERCEIRA", chave_nfe: KEY }), p_itens: itensOk(), p_docs: [], p_novo: true }, { erro: /compras_online_nfe_unica/, nota: "compras_gravar também recusa a chave repetida" })]);
});
test("paridade · anexar: validações do complemento, formatos (44 e 14 dígitos), limites de tamanho e no máximo 20 divergências", { skip: pular }, async () => {
  const d = (n) => Array.from({ length: n }, (_, i) => ({ texto: "t" + i }));
  const casos = [[{ user_id: R }, /campo não permitido no complemento: user_id/], [{ total_pago: 1 }, /campo não permitido no complemento: total_pago/], [{ chave_nfe: "123" }, /chave da nota inválida/], [{ chave_nfe: "1".repeat(43) + "a" }, /chave da nota inválida/],
    [{ chave_nfe: "1".repeat(45) }, /chave da nota inválida/], [{ chave_nfe: 5 }, /o campo chave_nfe precisa ser texto/], [{ numero_nf: 5 }, /o campo numero_nf precisa ser texto/], [{ cnpj: "12" }, /CNPJ inválido/], [{ cnpj: "11.222.333/0001-44" }, /CNPJ inválido/],
    [{ cnpj: "1".repeat(15) }, /CNPJ inválido/], [{ numero_nf: "x".repeat(21) }, /número da nota longo demais/], [{ emitente: "x".repeat(161) }, /emitente longo demais/], [{ status: "cancelado" }, /status não permitido/], [{ status: "concluido" }, /status não permitido/],
    [{ status: false }, /o campo status precisa ser texto/], [{ divergencias: "x" }, /divergencias precisa ser uma lista/], [{ divergencias: ["x"] }, /a divergência 1 precisa ser um objeto/], [{ divergencias: [{ texto: "" }] }, /texto inválido na divergência 1/],
    [{ divergencias: [{ texto: "  " }] }, /texto inválido na divergência 1/], [{ divergencias: [{ texto: 5 }] }, /texto inválido na divergência 1/], [{ divergencias: [{ texto: "x".repeat(301) }] }, /texto inválido na divergência 1/],
    [{ divergencias: [{ texto: "a" }, { texto: "a", extra: 1 }] }, /campo não permitido na divergência 2: extra/], [{ divergencias: [{ texto: "a", campo: 7 }] }, /campo inválido na divergência 1/], [{ divergencias: [{ texto: "a", campo: "x".repeat(41) }] }, /campo inválido na divergência 1/],
    [{ divergencias: d(21) }, /divergências demais \(máximo 20 por vez\)/], [[], /o complemento precisa ser um objeto/], ["x", /o complemento precisa ser um objeto/]];
  const limites = [AX(C1, [], { chave_nfe: "1".repeat(44), cnpj: "1".repeat(14), numero_nf: "x".repeat(20), emitente: "e".repeat(160), divergencias: [{ texto: "t".repeat(300), campo: "c".repeat(40) }, ...d(19)] }, { nota: "exatamente nos limites", ok: (r) => assert.equal(r.divergencias_novas, 20) })];
  await paridade([...VAZIA(), ...casos.map(([c, re]) => AX(C1, [], c, { erro: re, nota: JSON.stringify(c).slice(0, 40) })), ...limites]);
  await paridade([...VAZIA(), { rpc: "compras_anexar", args: { p_id: C1, p_docs: { a: 1 }, p_complemento: {} }, erro: /a lista de documentos precisa ser uma lista/, nota: "docs não é lista" },
    { rpc: "compras_anexar", args: { p_id: C1, p_docs: null, p_complemento: {} }, erro: /a lista de documentos precisa ser uma lista/, nota: "docs nulo" }, { rpc: "compras_anexar", args: { p_id: null, p_docs: [], p_complemento: {} }, erro: /falta o id da compra/, nota: "id nulo" }]);
});
test("paridade · anexar: no máximo 100 divergências na compra, compra inexistente e documentos inválidos (os erros de compras_gravar)", { skip: pular }, async () => {
  const mil = (a, n) => Array.from({ length: n }, (_, i) => ({ texto: a + i }));
  await paridade([G({ p_compra: compra({ divergencias: mil("velha", 95) }), p_itens: itensOk(), p_docs: [], p_novo: true }),
    AX(C1, [], { divergencias: mil("nova", 6) }, { erro: /divergências demais nesta compra \(máximo 100\)/, nota: "95 + 6 passa de 100" }), AX(C1, [], { divergencias: mil("nova", 5) }, { nota: "95 + 5 = 100", ok: (d) => assert.equal(d.divergencias_novas, 5) }),
    AX(C1, [], { divergencias: [{ texto: "mais uma" }] }, { erro: /divergências demais nesta compra/, nota: "já são 100" }), AX(C1, [], { divergencias: [{ texto: "nova0" }] }, { nota: "repetida não conta", ok: (d) => assert.equal(d.divergencias_novas, 0) })]);
  await paridade([...VAZIA(), AX(C2, [], {}, { erro: /compra não encontrada/, nota: "compra inexistente" }), AX(C1, [doc(3)], {}, { erro: /o arquivo do documento 1 não está no cofre/, nota: "arquivo fora do cofre" }),
    AX(C1, [doc(1, { path: `${pasta(C2)}x.pdf` })], {}, { erro: /o documento 1 está fora da pasta desta compra/, nota: "pasta de outra compra" }), AX(C1, [doc(1, { tipo: "planilha" })], {}, { erro: /tipo de documento inválido \(1\)/, nota: "tipo" }),
    AX(C1, [doc(1, { sha256: "xyz" })], {}, { erro: /SHA-256 inválido no documento 1/, nota: "sha" }), AX(C1, [doc(1, { extra: 1 })], {}, { erro: /campo não permitido no documento 1: extra/, nota: "campo extra" }),
    AX(C1, [doc(1), doc(2, { path: `${pasta()}nao.pdf` })], { numero_nf: "1" }, { erro: /o arquivo do documento 2 não está no cofre/, nota: "o 2º documento falha: nada fica" }), AX(C1, [doc(1)], { numero_nf: "1" }, { nota: "o 1º grava sozinho" })]);
});
test("paridade · gravar: validações, conta, pedido repetido, edição e o modo só documentos de compras_gravar", { skip: pular }, async () => {
  await paridade([cof(doc(1).path, doc(2).path),
    G({ p_compra: compra(), p_itens: itensOk(), p_docs: [doc(1)], p_novo: true }, { nota: "nova com documento" }),
    G({ p_compra: compra(), p_itens: itensOk(), p_docs: [], p_novo: true }, { nota: "mesmo id: ja_existia", ok: (d) => assert.equal(d.ja_existia, true) }),
    G({ p_compra: compra({ id: C2 }), p_itens: itensOk(), p_docs: [], p_novo: true }, { erro: /compras_online_pedido_unico/, nota: "mesmo pedido, outra compra" }),
    G({ p_compra: compra({ id: C2, numero: "X2", total_pago: 50 }), p_itens: itensOk(), p_docs: [], p_novo: true }, { erro: /compras_online_conta_fecha/, nota: "conta não fecha" }),
    G({ p_compra: compra({ id: C2, numero: "X3", user_id: R }), p_itens: itensOk(), p_docs: [], p_novo: true }, { erro: /campo não permitido na compra: user_id/ }),
    G({ p_compra: compra({ id: C2, numero: "X4" }), p_itens: [], p_docs: [], p_novo: true }, { erro: /a compra precisa de pelo menos um produto/ }), G({ p_compra: compra({ id: C2, numero: "X4" }), p_itens: null, p_docs: [], p_novo: true }, { erro: /a compra precisa de pelo menos um produto/ }),
    G({ p_compra: compra({ id: C2, numero: "X5" }), p_itens: [...itensOk(), { descricao: "", total: 1 }], p_docs: [], p_novo: true }, { erro: /falta o nome do produto 2/ }),
    G({ p_compra: compra({ id: C2, numero: "X6" }), p_itens: [{ descricao: "x", total: 1.005 }], p_docs: [], p_novo: true }, { erro: /total inválido no produto 1/ }),
    G({ p_compra: compra({ id: C2, numero: "X7" }), p_itens: [{ ...itensOk()[0], imagem_path: `${pasta(C1)}x.png` }], p_docs: [], p_novo: true }, { erro: /imagem fora da pasta desta compra \(produto 1\)/ }),
    G({ p_compra: compra({ id: C2, numero: "X8", data: "1990-01-01" }), p_itens: itensOk(), p_docs: [], p_novo: true }, { erro: /a data está fora do esperado/ }),
    G({ p_compra: compra({ id: C2, numero: "X9", data: "2026-1-1" }), p_itens: itensOk(), p_docs: [], p_novo: true }, { erro: /data inválida/ }),
    G({ p_compra: compra({ id: C2, numero: "Y1", subtotal: "100" }), p_itens: itensOk(), p_docs: [], p_novo: true }, { erro: /falta o valor de subtotal/ }),
    G({ p_compra: compra({ id: C2, numero: "Y2", frete: 1.234 }), p_itens: itensOk(), p_docs: [], p_novo: true }, { erro: /valor inválido em frete/ }),
    G({ p_compra: { id: C1, loja: "amazon" }, p_itens: null, p_docs: [], p_novo: false }, { erro: /para só anexar documentos mande apenas o id da compra/ }),
    G({ p_compra: compra({ origem: "csv" }), p_itens: itensOk(), p_docs: [], p_novo: false }, { erro: /origem não muda na edição/ }), G({ p_compra: compra({ historico: true }), p_itens: itensOk(), p_docs: [], p_novo: false }, { erro: /historico não muda na edição/ }),
    G({ p_compra: compra({ id: C2 }), p_itens: itensOk(), p_docs: [], p_novo: false }, { erro: /compra não encontrada/, nota: "editar o que não existe" }),
    G({ p_compra: compra({ subtotal: 120, total_pago: 115 }), p_itens: [{ descricao: "Outro", qtd: 2, total: 120 }], p_docs: [doc(2)], p_novo: false }, { nota: "edição troca os produtos e anexa" }),
    G({ p_compra: { id: C1 }, p_itens: null, p_docs: [doc(2, { path: `${pasta()}arq9.pdf` })], p_novo: false }, { erro: /não está no cofre/ }),
    G({ p_compra: { id: C1 }, p_itens: null, p_docs: [], p_novo: null }, { erro: /diga se a compra é nova ou uma edição/ })]);
});
test("paridade · gravar: os CHECKs de vocabulário e de formato do banco (status, canal, natureza, origem, loja, chave da nota, CNPJ, histórico, recorrência)", { skip: pular }, async () => {
  const nova = (o, re, nota) => G({ p_compra: compra({ id: C2, numero: "Z" + Math.random().toString(36).slice(2, 7), ...o }), p_itens: itensOk(), p_docs: [], p_novo: true }, { erro: re, nota });
  await paridade([G({ p_compra: compra(), p_itens: itensOk(), p_docs: [], p_novo: true }),
    nova({ status: "entregue" }, /compras_online_status_vocab/, "status fora do vocabulário"), nova({ status: "" }, /compras_online_status_vocab/, "status vazio"), nova({ canal: "loja" }, /compras_online_canal_check/, "canal"),
    nova({ canal: "shopee" }, /compras_online_canal_loja_ok/, "canal que não combina com a loja"), nova({ natureza: "x" }, /compras_online_natureza_check/, "natureza"), nova({ origem: "fax" }, /compras_online_origem_check/, "origem"),
    nova({ loja: "ebay" }, /compras_online_canal_loja_ok|compras_online_loja_check/, "loja"), nova({ chave_nfe: "123" }, /compras_online_chave_nfe_check/, "chave da nota curta"), nova({ cnpj: "12.345" }, /compras_online_cnpj_check/, "CNPJ com pontuação"),
    nova({ recorrencia_status: "talvez" }, /compras_online_recorrencia_status_check/, "recorrência"), nova({ historico: true, natureza: null }, /compras_online_historico_ok/, "histórico sem natureza"),
    nova({ historico: true, canal: "amazon", natureza: "digital" }, /compras_online_historico_status/, "histórico sem status"),
    G({ p_compra: compra({ id: C2, numero: "HIST", historico: true, canal: "amazon", natureza: "digital", status: "concluido", origem: "historico_amazon" }), p_itens: itensOk(), p_docs: [], p_novo: true }, { nota: "histórico completo grava" })]);
});
