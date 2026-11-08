// Central Fiscal, Lote 1.5 · PROPOSTA da migration 037 (supabase/propostas/037_notas_fiscais_foto_pdf.sql, NÃO APLICADA) no Postgres de verdade (PGlite).
// Valida o DESENHO: gravação de foto e de PDF, duplicidade por hash, reprocessamento, falhas, atualização de situação, cancelamento, bloqueios, acesso e concorrência,
// e a regressão do XML. Nada disto fala com o Supabase; todos os dados são fictícios. Sem chamadas de IA.
// FIDELIDADE: igual à do tests/banco_nota_salvar.test.mjs (motor do PostgreSQL; papéis, auth.* e storage.* simulados; as políticas do Storage em ação NÃO são provadas aqui).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const PROP = "supabase/propostas/037_notas_fiscais_foto_pdf.sql";

let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite: pula */ }
const pular = !PGlite && !process.env.CI;

const R = "11111111-1111-4111-8111-111111111111", F = "22222222-2222-4222-8222-222222222222", X = "33333333-3333-4333-8333-333333333333";
const trecho = (arq, ini, fim) => { const t = ler(arq), i = t.indexOf(ini); assert.ok(i >= 0, ini); return t.slice(i, t.indexOf(fim, i) + fim.length); };

async function banco(comProposta = true) {
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
  for (const a of ["025_compras_online", "026_compras_emails", "030_compras_multiorigem", "031_compras_reembolsos", "032_central_fiscal", "033_seguranca_compras_fiscal", "034_notas_fiscais_gravacao"]) await db.exec(ler(`supabase/${a}.sql`));
  if (comProposta) await db.exec(ler(PROP));
  return db;
}
async function como(db, uid, sql, params = [], aal = "aal1") {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, role: "authenticated", aal })]);
  await db.exec(uid ? "set role authenticated" : "set role anon");
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); }
}
const execAdmin = async (db, sql) => { await db.query("select set_config('request.jwt.claims', '', false)"); await db.exec("reset role"); await db.exec(sql); };
async function admin(db, sql, params = []) { await db.query("select set_config('request.jwt.claims', '', false)"); await db.exec("reset role"); return (await db.query(sql, params)).rows; }
const falha = async (p) => { try { await p; } catch (e) { return e; } assert.fail("era para dar erro"); };
const contar = async (db, t, onde = "true") => +(await admin(db, `select count(*)::int as n from public.${t} where ${onde}`))[0].n;

// ---------- a nota de foto/PDF de teste ----------
const CNPJ = "11222333000181";
const uuid = (n) => "5f1c2d3e-4a5b-4c6d-8e7f-" + String(n).padStart(12, "0");
const idem = (n) => "9a9a9a9a-0000-4000-8000-" + String(n).padStart(12, "0");
const chaveDe = (n, tp = "1") => { const b = "31" + "2611" + CNPJ + "65" + "001" + String(n).padStart(9, "0") + tp + "12345678"; return b + N.nfDvChave(b); };
const MIMES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };
function arquivo(ext = "jpg", tamanho = 3000) { const bytes = randomBytes(tamanho); return { ext, bytes, sha: createHash("sha256").update(bytes).digest("hex"), tamanho, mime: MIMES[ext] }; }
/* o payload que o site montaria: o BANCO refaz a conta e decide; "proc" é só o que o site declara */
function preparar(n, o = {}) {
  const formato = o.formato || "imagem", id = o.id || uuid(n), tp = o.tp || "1", sit = o.sit || "autorizada";
  const arqs = o.arqs || [arquivo(formato === "pdf" ? "pdf" : "jpg")];
  const itens = o.itens || [{ codigo: null, descricao: "ITEM A", qtd: 2, unidade: "un", unidade_original: "UN", unitario: 10, total: 20, desconto: 0 }, { codigo: null, descricao: "ITEM B", qtd: 1, unidade: "un", unidade_original: "UN", unitario: 5.5, total: 5.5, desconto: 0 }];
  const nota = { id, modelo: "65", chave: o.semChave ? null : (o.chave || chaveDe(n, tp)), numero: String(n), serie: "1", data_emissao: "2026-11-06", emitente_nome: "MERCADO EXEMPLO LTDA", emitente_cnpj: CNPJ, emitente_uf: "MG",
    tp_emis: sit === "contingencia" ? 9 : 1, situacao: sit, situacao_evidencia: "lido do documento", protocolo: sit === "autorizada" || sit === "cancelada" || sit === "rejeitada" ? "131260000000001" : null, denegada: false,
    valor_produtos: 25.5, valor_descontos: null, valor_frete: null, valor_outras: null, valor_impostos: null, valor_total: o.total ?? 25.5, valor_a_pagar: null, pagamentos: [],
    formato_origem: formato, requer_conferencia: true, observacoes: null, ...(o.nota || {}) };
  if (sit === "contingencia" && !o.chave && !o.semChave) nota.chave = chaveDe(n, "9");
  if (sit === "cancelada" || sit === "rejeitada") nota.protocolo = sit === "cancelada" ? "131260000000001" : null;
  const docs = arqs.map((a) => ({ tipo: formato, nome: "nota." + a.ext, path: `${R}/notas-fiscais/${id}/${a.sha}.${a.ext}`, mime: a.mime, tamanho: a.tamanho, sha256: a.sha }));
  const proc = { idem: o.idem || idem(n), classe: "consistente", confianca: o.confianca ?? 0.96, revisada: !!o.revisada, diferenca: 0, componentes: o.componentes ?? 0, motivos: [], incertos: [{ campo: "hora", motivo: "ilegível" }],
    modelo_ia: "claude-sonnet-5-5", ia_uso_id: null, ...(o.proc || {}) };
  return { id, nota, itens, docs, proc, arqs };
}
const noCofre = (db, p, meta) => admin(db, "insert into storage.objects (bucket_id, name, metadata) values ('familia', $1, $2::jsonb)", [p, meta === undefined ? null : JSON.stringify(meta)]);
const subir = async (db, p) => { for (const [i, d] of p.docs.entries()) await noCofre(db, d.path, { size: d.tamanho, mimetype: d.mime }); return p; };
const salvarDoc = (db, uid, p, aal) => como(db, uid, "select public.nota_fiscal_salvar_doc($1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb) as r", [JSON.stringify(p.nota), JSON.stringify(p.itens), JSON.stringify(p.docs), JSON.stringify(p.proc)], aal).then((l) => l[0].r);
const gravar = async (db, n, o = {}) => { const p = await subir(db, preparar(n, o)); const r = await salvarDoc(db, R, p); return { ...p, r }; };
const sit = (db, id) => admin(db, "select de, para, origem, fonte, protocolo, tentativa_id from public.notas_fiscais_situacoes where nota_id = $1 order by criado_em, para", [id]);
const atualizar = (db, uid, id, para, prot = null, evid = null, fonte = "foto", aal) => como(db, uid, "select public.nota_fiscal_atualizar_situacao($1, $2, $3, $4, $5) as r", [id, para, prot, evid, fonte], aal).then((l) => l[0].r);

// ================= estático =================
test("a proposta está identificada como NÃO APLICADA, fora da pasta das migrations, e não mexe no que já existe", () => {
  const s = ler(PROP), sem = s.replace(/^--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(s.slice(0, 400), /PROPOSTA NÃO APLICADA/); assert.match(s, /NÃO RODAR EM PRODUÇÃO SEM AUTORIZAÇÃO/);
  assert.ok(!fs.readdirSync(new URL("../supabase/", import.meta.url)).some((f) => /^037_/.test(f)), "nenhuma 037 na pasta das migrations: a proposta não roda sozinha");
  assert.ok(!/drop table|truncate|delete from|alter table public\.notas_fiscais\b(?!_)|ia_config|ia_uso\b.*references/i.test(sem), "só soma: nada apaga, nada altera tabela existente nem IA");
  assert.ok(!/create (or replace )?function public\.nota_fiscal_(salvar|conferir)\(/.test(sem), "nota_fiscal_salvar e nota_fiscal_conferir (XML) não são tocadas");
  assert.ok(!/\bacoes_reais\b|insert into public\.(compras_online|pedidos|registros|notas|itens|produtos|mercados)\b|criar_despesa|gera_despesa/i.test(sem.replace(/outras despesas/g, "")), "nada de despesa, Mercado, Alimentação nem liberação de IA");
  assert.match(sem, /begin;[\s\S]*commit;/);
  for (const f of ["nota_fiscal_salvar_doc", "nota_fiscal_atualizar_situacao"]) assert.match(sem, new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from public, anon;`), f);
  assert.match(sem, /revoke all on function public\.nf_tentativa_gravar\([^)]*\) from public, anon, authenticated;/);
  assert.match(sem, /create policy "dono" on public\.%I for select to authenticated using \(user_id = \(select auth\.uid\(\)\) and user_id = \(select public\.dono_da_casa\(\)\)\)/, "só o dono lê");
  assert.match(sem, /as restrictive for all to authenticated using \(\(select public\.rac_aal_ok\(\)\)\)/, "trava MFA nas tabelas novas");
  assert.match(sem, /revoke all on public\.%I from anon, authenticated/); assert.match(sem, /grant select on public\.%I to authenticated/); assert.ok(!/grant (insert|update|delete)/i.test(sem), "ninguém recebe escrita direta");
});
test("no GitHub, o Postgres do teste (PGlite) está instalado", { skip: !process.env.CI }, () => assert.ok(PGlite, "PGlite não foi instalado no testes.yml"));

// ================= o desenho no banco =================
test("PGlite · a proposta roda inteira depois da 034, duas vezes (idempotente), e cria só o previsto", { skip: pular }, async () => {
  const db = await banco(false);
  const antes = await admin(db, "select proname from pg_proc where pronamespace = 'public'::regnamespace order by proname");
  const tabAntes = (await admin(db, "select table_name from information_schema.tables where table_schema = 'public' order by 1")).map((x) => x.table_name);
  await db.exec(ler(PROP)); await db.exec(ler(PROP));
  const novas = (await admin(db, "select table_name from information_schema.tables where table_schema = 'public' order by 1")).map((x) => x.table_name).filter((t) => !tabAntes.includes(t));
  assert.deepEqual(novas, ["notas_fiscais_situacoes", "notas_fiscais_tentativas"]);
  const fn = (await admin(db, "select proname from pg_proc where pronamespace = 'public'::regnamespace order by proname")).map((x) => x.proname).filter((p) => !antes.some((a) => a.proname === p));
  assert.deepEqual(fn, ["nf_existente_casa", "nf_path_registrado", "nf_situacoes_imutavel", "nf_tentativa_gravar", "nf_tentativas_imutavel", "nota_fiscal_atualizar_situacao", "nota_fiscal_salvar_doc", "notas_fiscais_foto_regras", "notas_fiscais_hist_situacao"]);
  assert.equal((await admin(db, "select count(*)::int as n from pg_policies where schemaname = 'storage' and policyname like 'nf %'"))[0].n, 4, "as 2 da 034 + as 2 novas");
  for (const f of ["nota_fiscal_salvar_doc", "nota_fiscal_atualizar_situacao"]) {
    assert.equal((await admin(db, "select has_function_privilege('anon', p.oid, 'execute') as a, has_function_privilege('authenticated', p.oid, 'execute') as u from pg_proc p where proname = $1", [f]))[0].a, false, f + " não é de anon");
    assert.equal((await admin(db, "select has_function_privilege('authenticated', p.oid, 'execute') as u from pg_proc p where proname = $1", [f]))[0].u, true);
  }
  assert.equal((await admin(db, "select has_function_privilege('authenticated', 'public.nf_tentativa_gravar(uuid,uuid,uuid,uuid,text,text,text,text,numeric,boolean,numeric,numeric,jsonb,jsonb,text,uuid,jsonb)'::regprocedure, 'execute') as u"))[0].u, false, "o gravador da trilha não é chamável por quem entrou");
  for (const t of ["notas_fiscais_tentativas", "notas_fiscais_situacoes"]) {
    const p = (await admin(db, "select has_table_privilege('authenticated', $1, 'select') as s, has_table_privilege('authenticated', $1, 'insert') as i, has_table_privilege('authenticated', $1, 'update') as u, has_table_privilege('authenticated', $1, 'delete') as d, has_table_privilege('anon', $1, 'select') as a", ["public." + t]))[0];
    assert.deepEqual([p.s, p.i, p.u, p.d, p.a], [true, false, false, false, false], t);
    assert.equal((await admin(db, "select relrowsecurity as r from pg_class where oid = $1::regclass", ["public." + t]))[0].r, true);
  }
  await db.close();
});
test("PGlite · gravar nota de FOTO: nota, itens, original, tentativa e histórico numa transação; requer conferência e NÃO é conferida", { skip: pular }, async () => {
  const db = await banco();
  const g = await gravar(db, 101); assert.equal(g.r.criado, true, JSON.stringify(g.r)); assert.equal(g.r.resultado, "validada"); assert.equal(g.r.classe, "consistente");
  const n = (await admin(db, "select * from public.notas_fiscais where id = $1", [g.id]))[0];
  assert.deepEqual([n.formato_origem, n.requer_conferencia, n.conferida_em, n.situacao, n.user_id], ["imagem", true, null, "autorizada", R]);
  assert.equal(await contar(db, "notas_fiscais_itens", `nota_id = '${g.id}'`), 2);
  const d = (await admin(db, "select tipo, mime, tamanho, sha256, path from public.notas_fiscais_docs where nota_id = $1", [g.id]))[0];
  assert.deepEqual([d.tipo, d.mime, d.sha256, d.path], ["imagem", "image/jpeg", g.arqs[0].sha, g.docs[0].path]);
  const t = (await admin(db, "select * from public.notas_fiscais_tentativas where nota_id = $1", [g.id]))[0];
  assert.deepEqual([t.resultado, t.classe, t.origem, +t.confianca, t.revisada, +t.diferenca, t.user_id], ["validada", "consistente", "foto", 0.96, false, 0, R]);
  assert.deepEqual(t.incertos, [{ campo: "hora", motivo: "ilegível" }]); assert.equal(t.id, g.r.tentativa_id);
  const h = await sit(db, g.id); assert.equal(h.length, 1); assert.deepEqual([h[0].de, h[0].para, h[0].origem, h[0].fonte, h[0].tentativa_id], [null, "autorizada", "gravacao", "foto", t.id]);
  assert.equal(g.r.docs_para_apagar.length, 0);
  /* várias fotos da mesma nota (até 4) */
  const duas = await gravar(db, 102, { arqs: [arquivo("jpg"), arquivo("png")] }); assert.equal(duas.r.docs_gravados, 2); assert.equal(await contar(db, "notas_fiscais_docs", `nota_id = '${duas.id}'`), 2);
  const cinco = await subir(db, preparar(103, { arqs: [1, 2, 3, 4, 5].map(() => arquivo("jpg")) })); assert.match((await falha(salvarDoc(db, R, cinco))).message, /de 1 a 4/);
  await db.close();
});
test("PGlite · gravar nota de PDF: um arquivo só, tipo e extensão coerentes", { skip: pular }, async () => {
  const db = await banco();
  const g = await gravar(db, 111, { formato: "pdf" }); assert.equal(g.r.resultado, "validada");
  assert.deepEqual((await admin(db, "select formato_origem, requer_conferencia from public.notas_fiscais where id = $1", [g.id]))[0], { formato_origem: "pdf", requer_conferencia: true });
  assert.equal((await admin(db, "select tipo, mime, path from public.notas_fiscais_docs where nota_id = $1", [g.id]))[0].path, `${R}/notas-fiscais/${g.id}/${g.arqs[0].sha}.pdf`);
  assert.equal((await admin(db, "select origem from public.notas_fiscais_tentativas where nota_id = $1", [g.id]))[0].origem, "pdf");
  const dois = await subir(db, preparar(112, { formato: "pdf", arqs: [arquivo("pdf"), arquivo("pdf")] })); assert.match((await falha(salvarDoc(db, R, dois))).message, /PDF tem 1 arquivo/);
  const misto = preparar(113, { formato: "pdf" }); misto.docs[0].mime = "image/jpeg"; await subir(db, misto); assert.match((await falha(salvarDoc(db, R, misto))).message, /não combina/);
  const grande = preparar(114, { formato: "pdf" }); grande.docs[0].tamanho = 10485761; assert.match((await falha(salvarDoc(db, R, grande))).message, /tamanho|fora do que a coluna/);
  const caminho = preparar(115); caminho.docs[0].path = caminho.docs[0].path.replace(/\.jpg$/, ".png"); await subir(db, caminho); assert.match((await falha(salvarDoc(db, R, caminho))).message, /caminho do documento/);
  await db.close();
});
test("PGlite · duplicidade por hash, por chave e por id; reprocessamento do mesmo clique não grava de novo", { skip: pular }, async () => {
  const db = await banco();
  const a = await gravar(db, 121);
  /* mesmo arquivo, nota nova (outro id e outra chave): duplicada por arquivo; o arquivo recém-enviado fica para o site apagar */
  const b = preparar(122, { arqs: a.arqs }); b.docs = [{ ...a.docs[0], path: `${R}/notas-fiscais/${b.id}/${a.arqs[0].sha}.jpg` }]; await subir(db, b);
  const rb = await salvarDoc(db, R, b); assert.deepEqual([rb.criado, rb.duplicada, rb.motivo, rb.resultado, rb.id], [false, true, "arquivo", "duplicada", a.id]); assert.deepEqual(rb.docs_para_apagar, [b.docs[0].path]);
  /* mesma chave, arquivo diferente */
  const c = await subir(db, preparar(123, { chave: a.nota.chave })); const rc = await salvarDoc(db, R, c); assert.deepEqual([rc.duplicada, rc.motivo], [true, "chave"]);
  /* mesmo id: já existia */
  const d = preparar(121); d.proc.idem = idem(900); await subir(db, d); const rd = await salvarDoc(db, R, d); assert.deepEqual([rd.ja_existia, rd.criado], [true, false]);
  assert.equal(await contar(db, "notas_fiscais", "formato_origem = 'imagem'"), 1, "uma só nota");
  /* o mesmo clique de novo (retentativa): devolve o que foi decidido, sem tentativa nova */
  const antes = await contar(db, "notas_fiscais_tentativas"); const rr = await salvarDoc(db, R, a); assert.deepEqual([rr.ja_existia, rr.criado, rr.resultado, rr.id], [true, false, "validada", a.id]);
  assert.equal(await contar(db, "notas_fiscais_tentativas"), antes, "idempotente");
  assert.equal(await contar(db, "notas_fiscais_tentativas", "resultado = 'duplicada'"), 3, "as 3 duplicadas ficam na trilha");
  assert.equal(await contar(db, "notas_fiscais_docs"), 1, "um único registro de original");
  await db.close();
});
test("PGlite · falha no upload ou nos metadados: nada fica pela metade (nem nota, nem item, nem tentativa)", { skip: pular }, async () => {
  const db = await banco();
  const zero = async (t) => assert.equal(await contar(db, t), 0, t);
  const semArquivo = preparar(131); assert.match((await falha(salvarDoc(db, R, semArquivo))).message, /não está no cofre/);
  const pequeno = preparar(132); await noCofre(db, pequeno.docs[0].path, { size: 10, mimetype: "image/jpeg" }); assert.match((await falha(salvarDoc(db, R, pequeno))).message, /tamanho/);
  const tipo = preparar(133); await noCofre(db, tipo.docs[0].path, { size: tipo.docs[0].tamanho, mimetype: "image/png" }); assert.match((await falha(salvarDoc(db, R, tipo))).message, /tipo/);
  const semMeta = preparar(134); await noCofre(db, semMeta.docs[0].path, undefined); assert.match((await falha(salvarDoc(db, R, semMeta))).message, /tamanho/);
  const itemRuim = await subir(db, preparar(135, { itens: [{ codigo: null, descricao: "X", qtd: -1, unidade: "un", unidade_original: null, unitario: 1, total: 1, desconto: 0 }] })); assert.match((await falha(salvarDoc(db, R, itemRuim))).message, /qtd|coluna/);
  const cpf = await subir(db, preparar(136, { nota: { emitente_nome: "Fulano 529.982.247-25" } })); assert.match((await falha(salvarDoc(db, R, cpf))).message, /CPF|sem_cpf/);
  /* falha no meio da gravação (depois da nota e dos itens): o savepoint desfaz tudo */
  await execAdmin(db, `create function public.t_explode() returns trigger language plpgsql as $$ begin raise exception 'explodiu no meio' using errcode = 'XX001'; end $$;
    create trigger t_explode before insert on public.notas_fiscais_docs for each row execute function public.t_explode();`);
  const meio = await subir(db, preparar(137)); assert.match((await falha(salvarDoc(db, R, meio))).message, /explodiu no meio/);
  for (const t of ["notas_fiscais", "notas_fiscais_itens", "notas_fiscais_docs", "notas_fiscais_tentativas", "notas_fiscais_situacoes"]) await zero(t);
  await db.close();
});
test("PGlite · contingência consistente grava como pendente fiscal, não confere; depois autoriza (histórico preservado), confere e pode ser cancelada", { skip: pular }, async () => {
  const db = await banco();
  const g = await gravar(db, 141, { sit: "contingencia" }); assert.equal(g.r.resultado, "pendente_fiscal"); assert.match(g.r.avisos.join(" "), /pendente fiscal/);
  assert.deepEqual((await admin(db, "select situacao, protocolo, tp_emis, requer_conferencia, conferida_em from public.notas_fiscais where id = $1", [g.id]))[0], { situacao: "contingencia", protocolo: null, tp_emis: 9, requer_conferencia: true, conferida_em: null });
  /* não confere enquanto não for autorizada */
  assert.match((await falha(como(db, R, "select public.nota_fiscal_conferir($1)", [g.id]))).message, /só se confere depois de autorizada/);
  /* autorizar exige o protocolo; transições proibidas */
  assert.match((await falha(atualizar(db, R, g.id, "autorizada", null))).message, /protocolo de 15 dígitos/);
  assert.match((await falha(atualizar(db, R, g.id, "pendente", "131260000000001"))).message, /nova situação/);
  const up = await atualizar(db, R, g.id, "autorizada", "131260000000009", "protocolo lido na consulta", "pdf"); assert.deepEqual([up.sem_mudanca, up.de, up.para], [false, "contingencia", "autorizada"]);
  assert.equal((await atualizar(db, R, g.id, "autorizada", "131260000000009")).sem_mudanca, true, "repetir é inofensivo");
  assert.deepEqual((await admin(db, "select situacao, protocolo from public.notas_fiscais where id = $1", [g.id]))[0], { situacao: "autorizada", protocolo: "131260000000009" });
  const conf = (await como(db, R, "select public.nota_fiscal_conferir($1) as r", [g.id]))[0].r; assert.equal(conf.ja_conferida, false);
  /* cancelamento posterior: a única mudança que uma nota conferida aceita */
  const c = await atualizar(db, R, g.id, "cancelada", null, "evento de cancelamento", "xml"); assert.deepEqual([c.de, c.para], ["autorizada", "cancelada"]);
  assert.match((await falha(atualizar(db, R, g.id, "autorizada", "131260000000009"))).message, /não é permitido/);
  assert.match((await falha(como(db, R, "update public.notas_fiscais set situacao = 'autorizada' where id = $1", [g.id]))).message, /única mudança de situação permitida|cancelada não volta/);
  const h = await sit(db, g.id);
  assert.deepEqual(h.map((x) => [x.de, x.para, x.origem, x.fonte]), [[null, "contingencia", "gravacao", "foto"], ["contingencia", "autorizada", "atualizacao", "pdf"], ["autorizada", "cancelada", "cancelamento", "xml"]]);
  assert.equal(h[0].tentativa_id, g.r.tentativa_id); assert.equal(h[1].protocolo, "131260000000009");
  /* pendente pode ser cancelada ou rejeitada direto */
  const p = await gravar(db, 142, { sit: "pendente" }); assert.equal(p.r.resultado, "pendente_fiscal"); assert.equal((await atualizar(db, R, p.id, "rejeitada", null, "rejeição cStat 204")).para, "rejeitada");
  await db.close();
});
test("PGlite · divergente, baixa confiança, cancelada, rejeitada e sem chave NÃO viram nota: viram tentativa, com o original guardado; o banco refaz a conta", { skip: pular }, async () => {
  const db = await banco();
  const casos = [
    ["divergente (o site declarou consistente)", { total: 30 }, "divergente", /difere do total fiscal em 4\.50 a menos/],
    ["item que não bate", { itens: [{ codigo: null, descricao: "A", qtd: 2, unidade: "un", unidade_original: null, unitario: 10, total: 25.5, desconto: 0 }] }, "divergente", /quantidade × unitário/],
    ["baixa confiança", { confianca: 0.62 }, "baixa_confianca", /abaixo do mínimo/],
    ["sem chave", { semChave: true }, "baixa_confianca", /chave de acesso/],
    ["cancelada", { sit: "cancelada" }, "consistente", /cancelada: não vale como compra fiscal validada/],
    ["rejeitada", { sit: "rejeitada" }, "consistente", /rejeitada: não vale/],
  ];
  let n = 150;
  for (const [rot, o, classe, re] of casos) {
    const p = await subir(db, preparar(++n, o)); const r = await salvarDoc(db, R, p);
    assert.deepEqual([r.criado, r.bloqueada, r.resultado, r.classe, r.id], [false, true, "bloqueada", classe, null], rot);
    assert.match(r.motivos.join(" "), re, rot);
    const t = (await admin(db, "select resultado, classe, docs, nota_id from public.notas_fiscais_tentativas where id = $1", [r.tentativa_id]))[0];
    assert.deepEqual([t.resultado, t.classe, t.nota_id, t.docs.length], ["bloqueada", classe, null, 1], rot); assert.equal(t.docs[0].path, p.docs[0].path, "o original fica registrado na tentativa");
    assert.equal((await admin(db, "select public.nf_path_registrado($1) as r", [p.docs[0].path]))[0].r, true); assert.deepEqual(r.docs_para_apagar, []);
  }
  assert.equal(await contar(db, "notas_fiscais"), 0, "nenhuma nota"); assert.equal(await contar(db, "notas_fiscais_itens"), 0); assert.equal(await contar(db, "notas_fiscais_docs"), 0);
  /* confiança baixa MAS revisada pelo dono: passa (a conta continua valendo) */
  const rev = await gravar(db, 170, { confianca: 0.5, revisada: true }); assert.equal(rev.r.resultado, "validada");
  const revRuim = await subir(db, preparar(171, { confianca: 0.5, revisada: true, total: 31 })); assert.equal((await salvarDoc(db, R, revRuim)).classe, "divergente", "revisar não relaxa a conta");
  /* 0,90 passa; 0,899 não */
  assert.equal((await gravar(db, 172, { confianca: 0.9 })).r.resultado, "validada"); assert.equal((await salvarDoc(db, R, await subir(db, preparar(173, { confianca: 0.899 })))).classe, "baixa_confianca");
  /* componentes fiscais declarados fecham a conta (ST + IPI) */
  assert.equal((await gravar(db, 174, { total: 31, componentes: 5.5 })).r.resultado, "validada");
  /* decisão do dono: o original da nota bloqueada é SEMPRE guardado; a opção de não guardar não existe mais */
  const sg = preparar(175, { total: 99, proc: { guardar_original: false } }); await subir(db, sg); assert.match((await falha(salvarDoc(db, R, sg))).message, /campo não permitido em processamento: guardar_original/);
  /* o mesmo arquivo bloqueado de novo não ocupa o cofre duas vezes: a nova tentativa APONTA para o original já guardado e só a cópia nova é devolvida para apagar */
  const antes = (await admin(db, "select docs->0->>'sha256' as s, docs->0->>'path' as p from public.notas_fiscais_tentativas where classe = 'divergente' limit 1"))[0];
  const outra = preparar(176, { total: 99, arqs: [{ ext: "jpg", sha: antes.s, tamanho: 3000, mime: "image/jpeg" }] });
  await subir(db, outra); const ro = await salvarDoc(db, R, outra); assert.equal(ro.bloqueada, true); assert.deepEqual(ro.docs_para_apagar, [outra.docs[0].path], "só a cópia nova");
  const t2 = (await admin(db, "select docs from public.notas_fiscais_tentativas where id = $1", [ro.tentativa_id]))[0];
  assert.equal(t2.docs.length, 1); assert.equal(t2.docs[0].path, antes.p, "a tentativa aponta para o original já guardado"); assert.equal((await admin(db, "select public.nf_path_registrado($1) as r", [antes.p]))[0].r, true);
  assert.equal((await admin(db, "select public.nf_path_registrado($1) as r", [outra.docs[0].path]))[0].r, false);
  await db.close();
});
test("PGlite · acesso: só o dono grava, atualiza e lê a trilha; MFA exigida; ninguém escreve direto nem altera a auditoria", { skip: pular }, async () => {
  const db = await banco();
  const g = await gravar(db, 181);
  /* Fernanda (casa), alguém de fora e anon não gravam */
  const p = await subir(db, preparar(182)); assert.match((await falha(salvarDoc(db, F, p))).message, /só o dono/);
  assert.ok((await falha(salvarDoc(db, X, p))).message, "quem é de fora não grava na pasta da casa (o caminho é do dono)"); assert.equal(await contar(db, "notas_fiscais", `user_id = '${X}'`), 0); assert.ok((await falha(salvarDoc(db, null, p))).message);
  assert.match((await falha(atualizar(db, F, g.id, "cancelada"))).message, /só o dono/);
  /* a trilha é só do dono */
  for (const t of ["notas_fiscais_tentativas", "notas_fiscais_situacoes"]) {
    assert.equal((await como(db, R, `select count(*)::int as n from public.${t}`))[0].n, 1, t + ": o dono lê");
    assert.equal((await como(db, F, `select count(*)::int as n from public.${t}`))[0].n, 0, t + ": a Fernanda não vê");
    assert.equal((await como(db, X, `select count(*)::int as n from public.${t}`))[0].n, 0, t + ": quem é de fora não vê");
    assert.ok((await falha(como(db, null, `select count(*) from public.${t}`))).message, t + ": anon sem acesso");
    for (const sql of [`insert into public.${t} (id) values (gen_random_uuid())`, `update public.${t} set user_id = user_id`, `delete from public.${t}`]) assert.match((await falha(como(db, R, sql))).message, /permission denied|violates|não muda/, sql);
  }
  /* administração/cascata: a auditoria é imutável para quem entrou, mesmo com privilégio concedido por engano */
  await execAdmin(db, "grant update, delete on public.notas_fiscais_tentativas, public.notas_fiscais_situacoes to authenticated; alter table public.notas_fiscais_tentativas disable row level security; alter table public.notas_fiscais_situacoes disable row level security;");
  assert.match((await falha(como(db, R, "update public.notas_fiscais_tentativas set confianca = 1"))).message, /não muda nem sai/);
  assert.match((await falha(como(db, R, "delete from public.notas_fiscais_situacoes"))).message, /não muda nem sai/);
  assert.match((await falha(como(db, R, "update public.notas_fiscais_situacoes set para = 'cancelada'"))).message, /não muda nem sai/);
  await execAdmin(db, "alter table public.notas_fiscais_tentativas enable row level security; alter table public.notas_fiscais_situacoes enable row level security; revoke update, delete on public.notas_fiscais_tentativas, public.notas_fiscais_situacoes from authenticated;");
  /* MFA: com fator verificado, aal1 é recusado e aal2 passa */
  await admin(db, `insert into auth.mfa_factors values ('${R}', 'verified')`);
  const m = await subir(db, preparar(183)); assert.match((await falha(salvarDoc(db, R, m, "aal1"))).message, /MFA/); assert.match((await falha(atualizar(db, R, g.id, "cancelada", null, null, "xml", "aal1"))).message, /MFA/);
  assert.equal((await salvarDoc(db, R, m, "aal2")).criado, true);
  assert.equal((await atualizar(db, R, g.id, "cancelada", null, null, "xml", "aal2")).para, "cancelada");
  await db.close();
});
test("PGlite · revisão das funções SECURITY DEFINER: search_path vazio, ninguém além de quem entrou executa, o gravador da trilha é inalcançável e nada é dinâmico", { skip: pular }, async () => {
  const db = await banco();
  const f = await admin(db, `select p.proname, p.prosecdef as def, p.proconfig as cfg, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth, p.prorettype::regtype::text as ret
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('nota_fiscal_salvar_doc','nota_fiscal_atualizar_situacao','nf_tentativa_gravar','nf_existente_casa','nf_path_registrado','notas_fiscais_hist_situacao','nf_tentativas_imutavel','nf_situacoes_imutavel','notas_fiscais_foto_regras')`);
  assert.equal(f.length, 9);
  const por = Object.fromEntries(f.map((x) => [x.proname, x]));
  for (const nome of ["nota_fiscal_salvar_doc", "nf_tentativa_gravar", "nf_path_registrado", "notas_fiscais_hist_situacao"]) { assert.equal(por[nome].def, true, nome + " é definer"); assert.ok(por[nome].cfg.some((c) => c.startsWith("search_path=")), nome + ": search_path fixo vazio"); }
  for (const x of f) { assert.ok(x.cfg && x.cfg.some((c) => /^search_path=("")?$/.test(c)), x.proname + ": search_path vazio"); assert.equal(x.anon, false, x.proname + " não é de anon"); }
  assert.deepEqual(f.filter((x) => x.auth && x.ret !== "trigger").map((x) => x.proname).sort(), ["nf_path_registrado", "nota_fiscal_atualizar_situacao", "nota_fiscal_salvar_doc"], "só estas três são chamáveis por quem entrou (as funções de gatilho não são chamáveis direto)");
  assert.equal(por.nota_fiscal_atualizar_situacao.def, false, "a atualização de situação é invoker (RLS e MFA valem)");
  /* tudo qualificado e sem SQL dinâmico dentro das funções */
  const corpo = trecho(PROP, "create or replace function public.nota_fiscal_salvar_doc", "grant execute on function public.nota_fiscal_salvar_doc");
  assert.ok(!/\bexecute\b\s+(format|')/i.test(corpo), "sem EXECUTE dinâmico"); assert.ok(!/\bfrom\s+(?!public\.|storage\.|unnest|jsonb_array_elements|\()[a-z_]+\s+(where|order|limit)/i.test(corpo.replace(/from unnest\(.*?\) \w+/g, "")), "tabelas sempre qualificadas");
  /* sem executar como outra pessoa: sem login, sem dono e sem MFA nada grava */
  const p = await subir(db, preparar(301));
  for (const [uid, aal] of [[null, "aal1"], [F, "aal1"], [X, "aal1"]]) { const e = await falha(salvarDoc(db, uid, p, aal)); assert.ok(e.message); }
  assert.equal(await contar(db, "notas_fiscais"), 0); assert.equal(await contar(db, "notas_fiscais_tentativas"), 0); assert.equal(await contar(db, "notas_fiscais_situacoes"), 0);
  assert.match((await falha(como(db, R, "select public.nf_tentativa_gravar(gen_random_uuid(), $1, gen_random_uuid(), null, 'foto', 'validada', 'consistente', 'autorizada', 1, false, 0, 0, '[]', '[]', null, null, '[]')", [R]))).message, /permission denied/, "ninguém forja a trilha chamando o gravador");
  await db.close();
});
test("PGlite · Fernanda: não escreve direto em nota de foto/PDF (nem itens, nem documentos), mas o fluxo de XML dela segue igual (gravar pela RPC, conferir, escrita direta, excluir)", { skip: pular }, async () => {
  const db = await banco();
  const g = await gravar(db, 311);                                                    // nota de foto do dono
  const nega = async (sql, params = []) => { const e = await falha(como(db, F, sql, params)); assert.match(e.message, /row-level security|violates|permission/, sql); };
  /* escrita direta: INSERT de nota "de foto" é recusado; UPDATE/DELETE de nota de foto não enxerga linha nenhuma (0 afetadas) */
  await nega("insert into public.notas_fiscais (id, modelo, valor_total, formato_origem, requer_conferencia) values (gen_random_uuid(), '65', 10, 'imagem', true)");
  assert.equal((await como(db, F, "update public.notas_fiscais set situacao = 'cancelada' where id = $1 returning id", [g.id])).length, 0, "não altera nota de foto");
  assert.equal((await como(db, F, "delete from public.notas_fiscais where id = $1 returning id", [g.id])).length, 0, "não exclui nota de foto");
  assert.equal((await como(db, F, "update public.notas_fiscais_itens set total = 1 where nota_id = $1 returning id", [g.id])).length, 0, "não altera itens da nota de foto");
  assert.equal((await como(db, F, "delete from public.notas_fiscais_docs where nota_id = $1 returning id", [g.id])).length, 0, "não apaga o documento da nota de foto");
  await nega(`insert into public.notas_fiscais_itens (nota_id, descricao, qtd, total) values ('${g.id}', 'X', 1, 1)`);
  await nega(`insert into public.notas_fiscais_docs (nota_id, tipo, nome, path, sha256) values ('${g.id}', 'imagem', 'x', '${R}/notas-fiscais/${g.id}/x.jpg', '${"a".repeat(64)}')`);
  assert.equal(await contar(db, "notas_fiscais", `id = '${g.id}' and situacao = 'autorizada'`), 1); assert.equal(await contar(db, "notas_fiscais_itens", `nota_id = '${g.id}'`), 2);
  assert.match((await falha(como(db, F, "select public.nota_fiscal_conferir($1)", [g.id]))).message, /não encontrada|row-level|violates/, "a Fernanda não confere nota de foto");
  assert.equal((await como(db, F, "select count(*)::int as n from public.notas_fiscais where id = $1", [g.id]))[0].n, 1, "mas continua LENDO a nota");
  assert.equal(await contar(db, "notas_fiscais_tentativas", `nota_id = '${g.id}'`), 1);
  /* o dono segue escrevendo direto (restauração de backup) */
  assert.equal((await como(db, R, "update public.notas_fiscais set observacoes = 'ok' where id = $1 returning id", [g.id])).length, 1);
  /* XML da Fernanda: igual a antes — grava pela RPC da 034 (invoker), escreve direto e exclui */
  const b43 = "31" + "2611" + CNPJ + "55" + "001" + "000000411" + "1" + "12345678", chave = b43 + N.nfDvChave(b43);
  const xml = `<nfeProc><NFe><infNFe Id="NFe${chave}" versao="4.00"><ide><mod>55</mod><serie>1</serie><nNF>411</nNF><dhEmi>2026-11-06T10:00:00-03:00</dhEmi><tpEmis>1</tpEmis></ide><emit><CNPJ>${CNPJ}</CNPJ><xNome>LOJA</xNome><enderEmit><UF>MG</UF></enderEmit></emit>
<det nItem="1"><prod><cProd>1</cProd><xProd>ITEM</xProd><qCom>1.0000</qCom><uCom>UN</uCom><vUnCom>10.00</vUnCom><vProd>10.00</vProd></prod></det><total><ICMSTot><vProd>10.00</vProd><vNF>10.00</vNF></ICMSTot></total><pag><detPag><tPag>03</tPag><vPag>10.00</vPag></detPag></pag></infNFe>
<protNFe><infProt><cStat>100</cStat><nProt>131260000000001</nProt><chNFe>${chave}</chNFe></infProt></protNFe></NFe></nfeProc>`;
  const lido = N.nfLerXML(xml), norm = N.nfNormalizar(lido), bytes = Buffer.from(xml), sha = createHash("sha256").update(bytes).digest("hex"), id = uuid(411);
  const gg = N.nfParaGravar(lido, norm, { id, dono: R, nome: "n.xml", mime: "text/xml", tamanho: bytes.length, sha256: sha, conferir: false }); assert.ok(gg.ok, gg.erros.join(" "));
  await noCofre(db, gg.args.p_docs[0].path, { size: bytes.length, mimetype: "text/xml" });
  const r = (await como(db, F, "select public.nota_fiscal_salvar($1::jsonb, $2::jsonb, $3::jsonb, $4) as r", [JSON.stringify(gg.args.p_nota), JSON.stringify(gg.args.p_itens), JSON.stringify(gg.args.p_docs), false]))[0].r;
  assert.equal(r.criado, true, "a Fernanda ainda grava XML"); assert.equal((await como(db, F, "select public.nota_fiscal_conferir($1) as r", [id]))[0].r.ja_conferida, false, "e confere");
  assert.equal((await como(db, F, "update public.notas_fiscais set situacao = 'cancelada' where id = $1 returning id", [id])).length, 1, "e cancela (única exceção do congelamento)");
  assert.equal((await como(db, F, "delete from public.notas_fiscais where id = $1 returning id", [id])).length, 1, "e exclui");
  /* o dono não consegue nem quer: converter XML em 'imagem' pela Fernanda é recusado */
  const x2 = await como(db, R, "insert into public.notas_fiscais (id, modelo, valor_total, formato_origem, requer_conferencia) values (gen_random_uuid(), '55', 10, 'xml', true) returning id");
  await nega("update public.notas_fiscais set formato_origem = 'imagem' where id = $1", [x2[0].id]);
  await db.close();
});
test("PGlite · fonte do histórico nunca quebra a escrita do dono (formato 'danfe' direto vira fonte 'manual')", { skip: pular }, async () => {
  const db = await banco();
  const id = uuid(321);
  await como(db, R, "insert into public.notas_fiscais (id, modelo, valor_total, formato_origem, requer_conferencia) values ($1, '65', 10, 'danfe', true)", [id]);
  assert.deepEqual((await sit(db, id)).map((x) => [x.de, x.para, x.fonte]), [[null, "pendente", "manual"]]);
  await db.close();
});
test("PGlite · concorrência: o concorrente fecha a mesma nota entre a checagem e a gravação (corrida simulada) → uma só nota e uma tentativa 'duplicada'", { skip: pular }, async () => {
  const db = await banco();
  const p = await subir(db, preparar(191)), rival = uuid(999);
  /* o vencedor já gravou a mesma chave; a primeira checagem desta chamada "não o viu" (cega uma vez), então o INSERT bate no índice único e a RPC lê o vencedor */
  await admin(db, `insert into public.notas_fiscais (id, user_id, modelo, chave, valor_total, formato_origem, requer_conferencia) values ('${rival}', '${R}', '65', '${p.nota.chave}', 25.5, 'imagem', true)`);
  await execAdmin(db, `create table public.t_cnt (n int);
    create or replace function public.nf_existente_casa(p_casa uuid, p_id uuid, p_chave text, p_sha text) returns jsonb language plpgsql security invoker set search_path = '' as $$
    declare v uuid; c int;
    begin
      insert into public.t_cnt values (1); select count(*) into c from public.t_cnt; if c <= 1 then return null; end if;
      select n.id into v from public.notas_fiscais n where n.user_id = p_casa and n.id = p_id; if found then return jsonb_build_object('id', v, 'motivo', 'id'); end if;
      if p_chave is not null then select n.id into v from public.notas_fiscais n where n.user_id = p_casa and n.chave = p_chave; if found then return jsonb_build_object('id', v, 'motivo', 'chave'); end if; end if;
      select d.nota_id into v from public.notas_fiscais_docs d where d.user_id = p_casa and d.sha256 = p_sha; if found then return jsonb_build_object('id', v, 'motivo', 'arquivo'); end if;
      return null;
    end $$;`);
  const r = await salvarDoc(db, R, p); assert.deepEqual([r.criado, r.duplicada, r.motivo, r.id, r.resultado], [false, true, "chave", rival, "duplicada"]);
  assert.equal(await contar(db, "notas_fiscais", `chave = '${p.nota.chave}'`), 1); assert.equal(await contar(db, "notas_fiscais_itens", `nota_id = '${p.id}'`), 0, "nada da tentativa perdedora");
  assert.equal(await contar(db, "notas_fiscais_docs"), 0, "o registro do original perdedor não ficou");
  assert.deepEqual((await admin(db, "select resultado, nota_id from public.notas_fiscais_tentativas"))[0], { resultado: "duplicada", nota_id: rival });
  assert.deepEqual(r.docs_para_apagar, [p.docs[0].path]);
  await db.close();
});
test("PGlite · excluir a nota: a tentativa fica (nota_id vira nulo) com o original registrado; o histórico de situação sai junto; a cascata da conta funciona", { skip: pular }, async () => {
  const db = await banco();
  const g = await gravar(db, 201); assert.equal(await contar(db, "notas_fiscais_situacoes"), 1);
  await como(db, R, "delete from public.notas_fiscais where id = $1", [g.id]);
  assert.equal(await contar(db, "notas_fiscais_situacoes"), 0, "o histórico da nota sai com a nota");
  assert.deepEqual((await admin(db, "select nota_id, resultado from public.notas_fiscais_tentativas"))[0], { nota_id: null, resultado: "validada" }, "a tentativa sobrevive");
  /* o original continua protegido pelo registro da tentativa? (as tentativas guardam docs só quando bloqueadas; este aqui foi gravado, então o caminho livra) */
  assert.equal((await admin(db, "select public.nf_path_registrado($1) as r", [g.docs[0].path]))[0].r, false);
  const b = await subir(db, preparar(202, { total: 99 })); const rb = await salvarDoc(db, R, b); assert.equal(rb.bloqueada, true);
  await admin(db, `delete from auth.users where id = '${R}'`);
  assert.equal(await contar(db, "notas_fiscais_tentativas"), 0, "a exclusão da conta leva a auditoria dela");
  await db.close();
});
test("PGlite · REGRESSÃO DO XML: a gravação, a conferência e o cancelamento de XML seguem iguais depois da proposta (e o histórico só aparece na mudança de situação)", { skip: pular }, async () => {
  const db = await banco();
  const b43 = "31" + "2611" + CNPJ + "55" + "001" + "000000321" + "1" + "12345678", chave = b43 + N.nfDvChave(b43);
  const xml = `<nfeProc><NFe><infNFe Id="NFe${chave}" versao="4.00"><ide><mod>55</mod><serie>1</serie><nNF>321</nNF><dhEmi>2026-11-06T10:00:00-03:00</dhEmi><tpEmis>1</tpEmis></ide>
<emit><CNPJ>${CNPJ}</CNPJ><xNome>LOJA EXEMPLO LTDA</xNome><enderEmit><UF>MG</UF></enderEmit></emit><det nItem="1"><prod><cProd>10</cProd><xProd>ITEM</xProd><qCom>1.0000</qCom><uCom>UN</uCom><vUnCom>10.00</vUnCom><vProd>10.00</vProd></prod></det>
<total><ICMSTot><vProd>10.00</vProd><vDesc>0.00</vDesc><vNF>10.00</vNF></ICMSTot></total><pag><detPag><tPag>03</tPag><vPag>10.00</vPag></detPag></pag></infNFe><protNFe><infProt><cStat>100</cStat><nProt>131260000000001</nProt><chNFe>${chave}</chNFe></infProt></protNFe></NFe></nfeProc>`;
  const lido = N.nfLerXML(xml), norm = N.nfNormalizar(lido), bytes = Buffer.from(xml), sha = createHash("sha256").update(bytes).digest("hex"), id = uuid(321);
  const gg = N.nfParaGravar(lido, norm, { id, dono: R, nome: "nota.xml", mime: "text/xml", tamanho: bytes.length, sha256: sha, conferir: true }); assert.ok(gg.ok, gg.erros.join(" "));
  await noCofre(db, gg.args.p_docs[0].path, { size: bytes.length, mimetype: "text/xml" });
  const r = (await como(db, R, "select public.nota_fiscal_salvar($1::jsonb, $2::jsonb, $3::jsonb, $4) as r", [JSON.stringify(gg.args.p_nota), JSON.stringify(gg.args.p_itens), JSON.stringify(gg.args.p_docs), gg.args.p_conferir]))[0].r;
  assert.deepEqual([r.criado, r.conferida], [true, true]);
  assert.equal(await contar(db, "notas_fiscais_situacoes"), 0, "gravar XML não escreve histórico (comportamento de antes)"); assert.equal(await contar(db, "notas_fiscais_tentativas"), 0);
  /* o XML conferido continua congelado, e o cancelamento (única exceção) agora deixa rastro */
  assert.match((await falha(como(db, R, "update public.notas_fiscais set valor_total = 11 where id = $1", [id]))).message, /conferida/);
  await como(db, R, "update public.notas_fiscais set situacao = 'cancelada' where id = $1", [id]);
  const h = await sit(db, id); assert.deepEqual(h.map((x) => [x.de, x.para, x.origem, x.fonte]), [["autorizada", "cancelada", "manual", "manual"]]);
  /* XML sem conferir em contingência ainda pode ser conferido (a trava de foto não vale para XML) */
  const xml2 = xml.split(chave).join(chave.slice(0, 34) + "9" + chave.slice(35, 43) + N.nfDvChave(chave.slice(0, 34) + "9" + chave.slice(35, 43))).replace(/<protNFe>[\s\S]*<\/protNFe>/, "").replace("<tpEmis>1</tpEmis>", "<tpEmis>9</tpEmis>").replace("<nNF>321</nNF>", "<nNF>321</nNF>");
  const l2 = N.nfLerXML(xml2), n2 = N.nfNormalizar(l2), b2 = Buffer.from(xml2), s2 = createHash("sha256").update(b2).digest("hex"), id2 = uuid(322);
  const g2 = N.nfParaGravar(l2, n2, { id: id2, dono: R, nome: "n2.xml", mime: "text/xml", tamanho: b2.length, sha256: s2, conferir: false }); assert.ok(g2.ok, g2.erros.join(" "));
  await noCofre(db, g2.args.p_docs[0].path, { size: b2.length, mimetype: "text/xml" });
  const r2 = (await como(db, R, "select public.nota_fiscal_salvar($1::jsonb, $2::jsonb, $3::jsonb, $4) as r", [JSON.stringify(g2.args.p_nota), JSON.stringify(g2.args.p_itens), JSON.stringify(g2.args.p_docs), false]))[0].r; assert.equal(r2.criado, true);
  assert.equal((await admin(db, "select situacao from public.notas_fiscais where id = $1", [id2]))[0].situacao, "contingencia");
  assert.equal((await como(db, R, "select public.nota_fiscal_conferir($1) as r", [id2]))[0].r.ja_conferida, false, "XML em contingência continua conferível (regra só para foto/PDF)");
  await db.close();
});

test("PGlite · o roteiro de conferência de produção (037_conferir_producao.sql) é só leitura e responde o que promete depois de aplicar a proposta", { skip: pular }, async () => {
  const db = await banco(false);
  const sql = ler("supabase/propostas/037_conferir_producao.sql"), sem = sql.replace(/^--.*$/gm, "");
  assert.ok(!/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate)\b/i.test(sem), "só SELECT");
  const stmts = sem.split(/;\s*\n/).map((x) => x.trim()).filter(Boolean);
  assert.equal(stmts.length, 9);
  /* antes de aplicar, o bloco 1 não acha as tabelas (serve para saber se já foi aplicada) */
  assert.equal((await admin(db, stmts[0])).length, 0);
  await db.exec(ler(PROP));
  const r = [];
  for (const q of stmts) r.push(await admin(db, q));
  assert.deepEqual(r[0].map((x) => [x.tabela, x.rls]), [["notas_fiscais_situacoes", true], ["notas_fiscais_tentativas", true]]);
  assert.equal(r[1].length, 9); assert.deepEqual(r[1].filter((x) => x.definer).map((x) => x.proname).sort(), ["nf_path_registrado", "nf_tentativa_gravar", "nota_fiscal_salvar_doc", "notas_fiscais_hist_situacao"]);
  assert.ok(r[1].every((x) => x.exec_anon === false && x.config.some((c) => c.startsWith("search_path="))));
  assert.deepEqual(r[1].filter((x) => x.exec_authenticated && x.retorna !== "trigger").map((x) => x.proname).sort(), ["nf_path_registrado", "nota_fiscal_atualizar_situacao", "nota_fiscal_salvar_doc"]);
  assert.equal(r[2].length, 0, "nenhum objeto duplicado");
  const novosTg = r[3].filter((x) => /^(nf_tentativas_imutavel|nf_situacoes_imutavel|notas_fiscais_hist_situacao|notas_fiscais_foto_regras)$/.test(x.gatilho)); assert.equal(novosTg.length, 4); assert.ok(novosTg.every((x) => x.habilitado === "O"));
  assert.ok(r[3].some((x) => x.gatilho === "notas_fiscais_congelar"), "os da 034 continuam");
  const pol = r[4].map((x) => `${x.tablename}:${x.policyname}:${x.cmd}:${x.permissive}`);
  for (const p of ["notas_fiscais_tentativas:dono:SELECT:PERMISSIVE", "notas_fiscais_tentativas:mfa:ALL:RESTRICTIVE", "notas_fiscais_situacoes:dono:SELECT:PERMISSIVE", "notas_fiscais:foto so dono insere:INSERT:RESTRICTIVE", "notas_fiscais:foto so dono altera:UPDATE:RESTRICTIVE", "notas_fiscais:foto so dono apaga:DELETE:RESTRICTIVE",
    "notas_fiscais_itens:foto so dono apaga:DELETE:RESTRICTIVE", "notas_fiscais_docs:foto so dono insere:INSERT:RESTRICTIVE", "objects:nf tentativa original nao apaga:DELETE:RESTRICTIVE", "objects:nf tentativa original nao substitui:UPDATE:RESTRICTIVE", "objects:nf original registrado nao apaga:DELETE:RESTRICTIVE"]) assert.ok(pol.includes(p), p);
  assert.deepEqual(r[5].map((x) => [x.grantee, x.table_name, x.privilege_type]).filter((x) => x[0] !== "service_role"), [["authenticated", "notas_fiscais_situacoes", "SELECT"], ["authenticated", "notas_fiscais_tentativas", "SELECT"]]);
  assert.ok(r[6].some((x) => x.contype === "p") && r[6].some((x) => /ON DELETE SET NULL/.test(x.definicao)) && r[6].some((x) => /ON DELETE CASCADE/.test(x.definicao)) && r[6].some((x) => /DEFERRABLE INITIALLY DEFERRED/.test(x.definicao)));
  assert.ok(r[7].some((x) => x.indexname === "notas_fiscais_tentativas_idem"));
  assert.deepEqual([r[8][0].funcoes_xml_034, r[8][0].notas, r[8][0].tentativas, r[8][0].situacoes], [4, 0, 0, 0]);
  await db.close();
});
