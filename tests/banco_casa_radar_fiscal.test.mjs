// Finanças e compras · acesso igual da Fernanda (pedido do dono em 16/11/2026) · migration 057 (supabase/057_casa_radar_fiscal.sql, PROPOSTA não aplicada)
// no Postgres de verdade (PGlite): pessoal (6 chaves), Radar (9 tabelas), funções fiscais sem a trava "só o dono" e a trava da IA fiscal.
// FIDELIDADE: igual à do tests/banco_foto_pdf.test.mjs (motor do PostgreSQL; papéis e auth.* simulados). Dados fictícios; nenhuma chamada de IA.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const semComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
const SQL = "supabase/057_casa_radar_fiscal.sql";

let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite: pula */ }
const pular = !PGlite && !process.env.CI;

const R = "11111111-1111-4111-8111-111111111111", F = "22222222-2222-4222-8222-222222222222", X = "33333333-3333-4333-8333-333333333333";
const trecho = (arq, ini, fim) => { const t = ler(arq), i = t.indexOf(ini); assert.ok(i >= 0, ini); return t.slice(i, t.indexOf(fim, i) + fim.length); };

/* R = dono, F = Fernanda (membro da casa de R), X = de fora. com057 = aplica a proposta; migs = migrations de nota de foto a aplicar antes dela */
async function banco({ com057 = true, migs = ["037_notas_fiscais_foto_pdf", "039_nota_foto_sem_chave"] } = {}) {
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
    create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text, metadata jsonb, created_at timestamptz default now());
    grant select on storage.objects to authenticated;
    create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
    declare _parts text[]; begin select string_to_array(name, '/') into _parts; return _parts[1 : array_length(_parts,1) - 1]; end $$;
  `);
  await db.exec(trecho("supabase/002_casa_compartilhada.sql", "create table if not exists public.membros", "grant execute on function public.dono_da_casa() to authenticated;"));
  await db.exec(trecho("supabase/022_seguranca.sql", "create or replace function public.rac_aal_ok()", "grant execute on function public.rac_aal_ok() to authenticated;"));
  await db.exec(`
    insert into public.membros (membro, dono) values ('${F}', '${R}');
    create table public.notas (id uuid primary key default gen_random_uuid(), user_id uuid default public.dono_da_casa());
    create table public.pedidos (id uuid primary key default gen_random_uuid(), user_id uuid default public.dono_da_casa());
    create table public.registros (id uuid primary key default gen_random_uuid(), user_id uuid default public.dono_da_casa());
  `);
  /* pessoal (003) com a trava "mfa" como em produção */
  await db.exec(ler("supabase/003_pessoal.sql"));
  await db.exec(`create policy "mfa" on public.pessoal as restrictive for all to authenticated using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok()))`);
  /* ia_config: 015, 016 e 036 (a trava ia_config_fiscal_so_dono) */
  for (const a of ["015_ia", "016_ia_acoes", "036_ia_fiscal"]) await db.exec(ler(`supabase/${a}.sql`));
  for (const a of ["025_compras_online", "026_compras_emails", "030_compras_multiorigem", "031_compras_reembolsos", "032_central_fiscal", "033_seguranca_compras_fiscal", "034_notas_fiscais_gravacao"]) await db.exec(ler(`supabase/${a}.sql`));
  for (const a of migs) await db.exec(ler(`supabase/${a}.sql`));
  for (const a of ["043_radar_precos", "048_radar_descoberta"]) await db.exec(ler(`supabase/${a}.sql`));
  if (com057) await db.exec(ler(SQL));
  return db;
}
async function como(db, uid, sql, params = [], aal = "aal1") {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, role: "authenticated", aal })]);
  await db.exec(uid ? "set role authenticated" : "set role anon");
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); }
}
async function admin(db, sql, params = []) { await db.query("select set_config('request.jwt.claims', '', false)"); await db.exec("reset role"); return (await db.query(sql, params)).rows; }
const falha = async (p) => { try { await p; } catch (e) { return e; } assert.fail("era para dar erro"); };

// ---------- a nota de foto de teste (mesmo formato do tests/banco_foto_pdf.test.mjs) ----------
const CNPJ = "11222333000181";
const uuid = (n) => "5f1c2d3e-4a5b-4c6d-8e7f-" + String(n).padStart(12, "0");
const idem = (n) => "9a9a9a9a-0000-4000-8000-" + String(n).padStart(12, "0");
const chaveDe = (n, tp = "1") => { const b = "31" + "2611" + CNPJ + "65" + "001" + String(n).padStart(9, "0") + tp + "12345678"; return b + N.nfDvChave(b); };
let seqArquivo = 0;
function arquivo() {
  let bytes, sha;
  do { bytes = Buffer.alloc(3000, "arquivo-casa-" + (++seqArquivo)); sha = createHash("sha256").update(bytes).digest("hex"); } while (/\d{11}/.test(sha));
  return { ext: "jpg", bytes, sha, tamanho: 3000, mime: "image/jpeg" };
}
function preparar(n, sit = "autorizada") {
  const id = uuid(n), a = arquivo();
  const itens = [{ codigo: null, descricao: "ITEM A", qtd: 2, unidade: "un", unidade_original: "UN", unitario: 10, total: 20, desconto: 0 }, { codigo: null, descricao: "ITEM B", qtd: 1, unidade: "un", unidade_original: "UN", unitario: 5.5, total: 5.5, desconto: 0 }];
  const nota = { id, modelo: "65", chave: chaveDe(n, sit === "contingencia" ? "9" : "1"), numero: String(n), serie: "1", data_emissao: "2026-11-06", emitente_nome: "MERCADO EXEMPLO LTDA", emitente_cnpj: CNPJ, emitente_uf: "MG",
    tp_emis: sit === "contingencia" ? 9 : 1, situacao: sit, situacao_evidencia: "lido do documento", protocolo: sit === "autorizada" ? "131260000000001" : null, denegada: false,
    valor_produtos: 25.5, valor_descontos: null, valor_frete: null, valor_outras: null, valor_impostos: null, valor_total: 25.5, valor_a_pagar: null, pagamentos: [],
    formato_origem: "imagem", requer_conferencia: true, observacoes: null };
  const docs = [{ tipo: "imagem", nome: "nota.jpg", path: `${R}/notas-fiscais/${id}/${a.sha}.jpg`, mime: a.mime, tamanho: a.tamanho, sha256: a.sha }];
  const proc = { idem: idem(n), classe: "consistente", confianca: 0.96, revisada: false, diferenca: 0, componentes: 0, motivos: [], incertos: [{ campo: "hora", motivo: "ilegível" }], modelo_ia: "claude-sonnet-5-5", ia_uso_id: null };
  return { id, nota, itens, docs, proc };
}
const subir = async (db, p) => { for (const d of p.docs) await admin(db, "insert into storage.objects (bucket_id, name, metadata) values ('familia', $1, $2::jsonb)", [d.path, JSON.stringify({ size: d.tamanho, mimetype: d.mime })]); return p; };
const salvarDoc = (db, uid, p) => como(db, uid, "select public.nota_fiscal_salvar_doc($1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb) as r", [JSON.stringify(p.nota), JSON.stringify(p.itens), JSON.stringify(p.docs), JSON.stringify(p.proc)]).then((l) => l[0].r);

// ================= estático =================
test("057: proposta (não aplicada), com begin/commit, sem tocar dado nem desligar RLS/mfa, e a IA fiscal só liga em comentário", () => {
  const t = ler(SQL), s = semComent(t);
  assert.match(t, /^-- PROPOSTA 057 · NÃO APLICADA EM PRODUÇÃO/);
  assert.match(s, /^\s*begin;/); assert.match(s, /commit;\s*notify pgrst, 'reload schema';\s*$/);
  assert.doesNotMatch(s, /disable row level security|drop policy if exists "mfa"|create policy "mfa"|grant .* to anon|insert into|delete from|truncate|drop table|drop function/i);
  assert.doesNotMatch(s, /update public\.ia_config/i, "a 057 não liga a IA fiscal: isso é do arquivo 058, à parte (custo, decisão do dono)");
  assert.match(t, /058_ligar_ia_fiscal_casa\.sql/);
  assert.doesNotMatch(s, /garmin/i);
  for (const k of ["radar-config", "radar-pagos", "radar-vinculos", "mercado-equivalencias", "mercado-alertas", "mercado-canais"]) assert.ok(s.includes("'" + k + "'"), k);
  assert.ok(!s.includes("'x-amigos'") && !s.includes("'compras'"), "nenhuma chave pessoal fora das 6");
});
test("057: não recria as funções fiscais (não ativa a 039/040 por acidente): só edita a definição existente", () => {
  const s = semComent(ler(SQL));
  assert.doesNotMatch(s, /create or replace function public\.nota_fiscal/i);
  assert.match(s, /pg_get_functiondef/);
  assert.match(s, /to_regprocedure/);
});

// ================= banco =================
test("PGlite · a 057 roda duas vezes sem erro (idempotente)", { skip: pular }, async () => {
  const db = await banco();
  await db.exec(ler(SQL));
  const pol = await admin(db, "select count(*)::int n from pg_policies where schemaname='public' and policyname='casa' and tablename like 'radar_%'");
  assert.equal(pol[0].n, 9);
});
test("PGlite · pessoal: a Fernanda lê e grava SÓ as 6 chaves, na linha do dono; o resto continua invisível; quem é de fora não vê nada", { skip: pular }, async () => {
  const db = await banco();
  await como(db, R, "insert into public.pessoal (user_id, chave, valor) values ($1,'radar-vinculos','{\"a\":1}'), ($1,'x-amigos','[\"segredo\"]'), ($1,'mercado-canais','{}')", [R]);
  const vistas = (await como(db, F, "select chave from public.pessoal order by chave")).map((x) => x.chave);
  assert.deepEqual(vistas, ["mercado-canais", "radar-vinculos"]);
  await como(db, F, "update public.pessoal set valor = '{\"a\":2}'::jsonb where user_id = $1 and chave = 'radar-vinculos'", [R]);
  assert.deepEqual((await admin(db, "select valor from public.pessoal where user_id = $1 and chave = 'radar-vinculos'", [R]))[0].valor, { a: 2 });
  await como(db, F, "insert into public.pessoal (user_id, chave, valor) values ($1,'mercado-equivalencias','{\"k\":1}')", [R]);
  assert.equal((await admin(db, "select count(*)::int n from public.pessoal where user_id = $1 and chave = 'mercado-equivalencias'", [R]))[0].n, 1);
  assert.match((await falha(como(db, F, "insert into public.pessoal (user_id, chave, valor) values ($1,'x-amigos','[]') on conflict (user_id, chave) do update set valor = excluded.valor", [R]))).message, /row-level security|violates/i, "chave fora da lista: recusada");
  assert.match((await falha(como(db, F, "insert into public.pessoal (user_id, chave, valor) values ($1,'radar-config','{}')", [F]))).message, /row-level security|violates/i, "linha na conta dela: recusada");
  assert.deepEqual(await como(db, X, "select chave from public.pessoal"), [], "quem é de fora não vê nada");
});
test("PGlite · Radar: a Fernanda lê e cria na casa do dono (dono padrão = dono da casa); quem é de fora não vê; o dono vê o que ela criou", { skip: pular }, async () => {
  const db = await banco();
  await como(db, R, "insert into public.radar_lojas (nome) values ('Loja do dono')");
  const col = await admin(db, "select column_default from information_schema.columns where table_schema='public' and table_name='radar_lojas' and column_name='dono'");
  assert.ok(String(col[0].column_default).includes("dono_da_casa"), "default do dono = dono_da_casa()");
  assert.deepEqual((await como(db, F, "select nome from public.radar_lojas")).map((x) => x.nome), ["Loja do dono"], "ela vê a loja do dono");
  await como(db, F, "insert into public.radar_lojas (nome) values ('Loja da Fernanda')");
  const l = await admin(db, "select dono from public.radar_lojas where nome = 'Loja da Fernanda'");
  assert.equal(l.length, 1); assert.equal(l[0].dono, R, "a linha nasce do dono da casa");
  assert.equal((await como(db, R, "select count(*)::int n from public.radar_lojas where nome = 'Loja da Fernanda'"))[0].n, 1, "o dono vê o que ela criou");
  assert.equal((await como(db, F, "select count(*)::int n from public.radar_lojas where nome = 'Loja da Fernanda'"))[0].n, 1);
  assert.equal((await como(db, X, "select count(*)::int n from public.radar_lojas"))[0].n, 0, "quem é de fora não vê");
  assert.match((await falha(como(db, F, "insert into public.radar_lojas (dono, nome) values ($1,'x')", [F]))).message, /row-level security|violates/i, "não grava em nome de outra conta");
  assert.equal((await como(db, F, "select count(*)::int n from public.radar_candidatos"))[0].n, 0);
  for (const t of ["radar_config", "radar_lojas", "radar_itens", "radar_ofertas", "radar_coletas", "radar_precos", "radar_consultas", "radar_candidatos", "radar_historico"]) {
    const p = await admin(db, "select policyname, permissive from pg_policies where schemaname='public' and tablename=$1 order by policyname", [t]);
    assert.deepEqual(p.map((x) => x.policyname), ["casa", "mfa"], t);
    assert.equal(p.find((x) => x.policyname === "mfa").permissive, "RESTRICTIVE", t + ": a trava mfa continua");
  }
});
test("PGlite · fiscal: a Fernanda grava nota de foto, lê tentativas e histórico e atualiza a situação; a 057 só tira a linha 'só o dono'", { skip: pular }, async () => {
  const db = await banco({ com057: false });
  const antes = await falha(salvarDoc(db, F, await subir(db, preparar(201))));
  assert.match(antes.message, /só o dono da casa/, "antes da 057 a Fernanda é recusada (037)");
  await db.exec(ler(SQL));
  const p = await subir(db, preparar(202));
  const r = await salvarDoc(db, F, p);
  assert.equal(r.criado, true);
  const nota = await admin(db, "select user_id, formato_origem, conferida_em from public.notas_fiscais where id = $1", [p.id]);
  assert.equal(nota[0].user_id, R, "a nota é da casa (dono), não da conta dela");
  assert.equal(nota[0].conferida_em, null, "continua sem conferir: a Fernanda confere depois, com o documento");
  assert.equal((await como(db, F, "select count(*)::int n from public.notas_fiscais_tentativas"))[0].n, 1, "ela lê as tentativas");
  assert.equal((await como(db, R, "select count(*)::int n from public.notas_fiscais_tentativas"))[0].n, 1);
  assert.equal((await como(db, X, "select count(*)::int n from public.notas_fiscais_tentativas"))[0].n, 0, "quem é de fora não lê");
  const c = await subir(db, preparar(203, "contingencia"));
  await salvarDoc(db, F, c);
  const u = await como(db, F, "select public.nota_fiscal_atualizar_situacao($1, 'cancelada', null, 'cancelamento lido', 'foto') as r", [c.id]).then((l) => l[0].r);
  assert.equal(u.para, "cancelada");
  assert.equal((await como(db, F, "select count(*)::int n from public.notas_fiscais_situacoes where nota_id = $1", [c.id]))[0].n >= 1, true, "ela lê o histórico");
  const sem = await admin(db, "select proname, position('só o dono da casa' in prosrc) as pos from pg_proc where pronamespace='public'::regnamespace and proname in ('nota_fiscal_salvar_doc','nota_fiscal_atualizar_situacao') order by proname");
  assert.equal(sem.length, 2); for (const f of sem) assert.equal(f.pos, 0, f.proname + " sem a trava de dono");
  const x = await falha(salvarDoc(db, X, await subir(db, preparar(204))));
  assert.match(x.message, /caminho do documento|faça login|row-level|permission/i, "quem é de fora não grava na casa do dono: o caminho do arquivo da nota é da casa dele");
});
test("PGlite · fiscal: o MFA continua obrigatório para a Fernanda (aal1 com fator verificado é recusado)", { skip: pular }, async () => {
  const db = await banco();
  await admin(db, "insert into auth.mfa_factors (user_id, status) values ($1, 'verified')", [F]);
  const p = await subir(db, preparar(211));
  assert.match((await falha(como(db, F, "select public.nota_fiscal_salvar_doc($1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb)", [JSON.stringify(p.nota), JSON.stringify(p.itens), JSON.stringify(p.docs), JSON.stringify(p.proc)], "aal1"))).message, /MFA|código/i);
  assert.equal((await como(db, F, "select public.nota_fiscal_salvar_doc($1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb) as r", [JSON.stringify(p.nota), JSON.stringify(p.itens), JSON.stringify(p.docs), JSON.stringify(p.proc)], "aal2").then((l) => l[0].r)).criado, true);
});
test("PGlite · só 037 aplicada (039 e 040 ainda propostas): a 057 não cria nem ativa a 039/040, e libera a que existe", { skip: pular }, async () => {
  const db = await banco({ migs: ["037_notas_fiscais_foto_pdf"] });
  const f = await admin(db, "select proname from pg_proc where pronamespace='public'::regnamespace and proname = 'nota_fiscal_entrada_mercado'");
  assert.equal(f.length, 0, "a 040 não foi criada pela 057");
  const d = (await admin(db, "select prosrc from pg_proc where pronamespace='public'::regnamespace and proname = 'nota_fiscal_salvar_doc'"))[0].prosrc;
  assert.ok(!d.includes("só o dono da casa"));
  const t037 = ler("supabase/037_notas_fiscais_foto_pdf.sql");
  assert.ok(t037.includes("só o dono da casa lê nota de foto ou PDF"), "a 037 original não foi alterada");
});
test("PGlite · ia_config: antes da 057 o banco proíbe fiscal.nota para a casa; depois deixa (mas não liga sozinho)", { skip: pular }, async () => {
  const db = await banco({ com057: false });
  await admin(db, "insert into public.ia_config (dono, modo) values ($1, 'REAL')", [R]);
  const lig = "update public.ia_config set acoes_reais = array['fiscal.nota']::text[], acoes_reais_casa = array['fiscal.nota']::text[], acoes_casa = acoes_casa || array['fiscal.nota']";
  assert.match((await falha(admin(db, lig))).message, /ia_config_fiscal_so_dono|check/i);
  await db.exec(ler(SQL));
  const dep = await admin(db, "select acoes_reais, acoes_reais_casa from public.ia_config");
  for (const c of dep) assert.ok(!c.acoes_reais_casa.includes("fiscal.nota"), "a 057 não liga nada");
  await admin(db, lig);
  assert.deepEqual((await admin(db, "select acoes_reais_casa from public.ia_config"))[0].acoes_reais_casa, ["fiscal.nota"]);
  /* as travas de hoje.analise e newsletter.resumo (028 e 020) não são tocadas: a 057 nem as menciona */
  assert.doesNotMatch(semComent(ler(SQL)), /hoje\.analise|newsletter|ia_config_hoje|ia_config_newsletter/i);
});

test("058: liga fiscal.nota para a casa só em REAL e com a ação já liberada; preserva as outras; idempotente; não toca hoje.analise nem newsletter", () => {
  const t = ler("supabase/058_ligar_ia_fiscal_casa.sql"), s2 = semComent(t);
  assert.match(t, /^-- PROPOSTA 058 · NÃO APLICADA EM PRODUÇÃO/);
  assert.match(s2, /where modo = 'REAL' and 'fiscal\.nota' = any \(acoes_reais\)/);
  assert.doesNotMatch(s2, /limite_brl|cambio|margem|hoje\.analise|newsletter|insert into|delete from|drop /i);
  assert.match(t, /--\s+update public\.ia_config\s*\n--\s+set acoes_casa = array_remove/, "o comando de desligar está comentado");
});
test("PGlite · 058: depois da 057 a casa passa a poder usar fiscal.nota em REAL; rodar de novo não duplica; em DEMO não muda nada", { skip: pular }, async () => {
  const db = await banco();
  await admin(db, "insert into public.ia_config (dono, modo) values ($1, 'DEMO')", [R]);
  await db.exec(ler("supabase/058_ligar_ia_fiscal_casa.sql"));
  assert.deepEqual((await admin(db, "select acoes_reais_casa from public.ia_config"))[0].acoes_reais_casa, [], "em DEMO nada muda");
  await admin(db, "update public.ia_config set modo = 'REAL', acoes_reais = array['fiscal.nota']::text[]");
  await db.exec(ler("supabase/058_ligar_ia_fiscal_casa.sql")); await db.exec(ler("supabase/058_ligar_ia_fiscal_casa.sql"));
  const c = (await admin(db, "select acoes_reais, acoes_reais_casa, acoes_casa from public.ia_config"))[0];
  assert.deepEqual(c.acoes_reais_casa, ["fiscal.nota"]); assert.deepEqual(c.acoes_reais, ["fiscal.nota"]);
  assert.equal(c.acoes_casa.filter((x) => x === "fiscal.nota").length, 1, "sem duplicar");
  assert.ok(c.acoes_casa.includes("abastecimento.interpretar") && c.acoes_casa.includes("mercado.nota"), "preserva as ações que a casa já tinha");
});
