// Central Fiscal, Lote 1.6 · o payload que o SITE monta (NUCLEO.nfParaGravarDoc) contra o Postgres de verdade (PGlite) com as migrations 034 + 037 + 038.
// Prova que o site e o banco falam o mesmo contrato e decidem igual: foto, PDF, quatro imagens, bloqueios, pendente fiscal, idempotência, duplicidade, situação fiscal,
// backup (SEG_TABELAS) e seguranca_estado(). Nada disto fala com o Supabase real; todos os dados são fictícios. Sem chamadas de IA.
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
const PROP = "supabase/037_notas_fiscais_foto_pdf.sql";

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

const P38 = "supabase/038_seguranca_estado_tentativas.sql";

// ---------- a nota, montada pelo núcleo do site ----------
const CNPJ = "11222333000181";
const uuid = (n) => "5f1c2d3e-4a5b-4c6d-8e7f-" + String(n).padStart(12, "0");
const idem = (n) => "9a9a9a9a-0000-4000-8000-" + String(n).padStart(12, "0");
const chaveDe = (n, tp = "1") => { const b = "31" + "2611" + CNPJ + "65" + "001" + String(n).padStart(9, "0") + tp + "12345678"; return b + N.nfDvChave(b); };
const MIMES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };
const arquivo = (ext = "jpg", tamanho = 3000) => { const bytes = randomBytes(tamanho); return { nome: "nota." + ext, ext, bytes, sha256: createHash("sha256").update(bytes).digest("hex"), tamanho, mime: MIMES[ext] }; };
const resposta = (n, o = {}) => ({ modelo: "65", emitente_nome: "MERCADO EXEMPLO LTDA", emitente_cnpj: CNPJ, emitente_uf: "MG", numero: String(n), serie: "1", chave: chaveDe(n), data_emissao: "2026-11-06", protocolo: "131260000000001",
  situacao: "autorizada", total_produtos: 25.5, descontos: null, frete: null, outras: null, impostos: null, total: 25.5, valor_pago: 25.5, componentes: {}, pagamentos: [],
  itens: [{ descricao: "ITEM A", codigo: null, qtd: 2, unidade: "UN", unitario: 10, total: 20, desconto: 0, incerto: false }, { descricao: "ITEM B", codigo: null, qtd: 1, unidade: "UN", unitario: 5.5, total: 5.5, desconto: 0, incerto: false }],
  confianca: 0.96, incertos: [{ campo: "hora", motivo: "ilegível" }], ...o });
/* exatamente o caminho do site: leitura da IA → nfNormalizar → nfParaGravarDoc */
function pelo_site(n, o = {}) {
  const fmt = o.pdf ? "pdf" : "imagem", ia = N.nfLerIA(resposta(n, o.res), fmt), nota = N.nfNormalizar(ia.lido), id = o.id || uuid(n);
  const arqs = o.arqs || [arquivo(o.pdf ? "pdf" : "jpg")];
  const g = N.nfParaGravarDoc(ia.lido, nota, { id, dono: R, idem: o.idem || idem(n), tipo: fmt, arquivos: arqs.map((a) => ({ nome: a.nome, mime: a.mime, tamanho: a.tamanho, sha256: a.sha256 })), confianca: o.confianca ?? ia.confianca, revisada: !!o.revisada, incertos: ia.incertos, modelo_ia: "claude-sonnet-5-5", ia_uso_id: null });
  assert.equal(g.ok, true, g.erros.join("|"));
  return { id, g, arqs, args: g.args };
}
const noCofre = (db, p, meta) => admin(db, "insert into storage.objects (bucket_id, name, metadata) values ('familia', $1, $2::jsonb)", [p, JSON.stringify(meta)]);
const subir = async (db, p) => { for (const d of p.args.p_docs) await noCofre(db, d.path, { size: d.tamanho, mimetype: d.mime }); return p; };
const salvar = (db, uid, p, aal) => como(db, uid, "select public.nota_fiscal_salvar_doc($1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb) as r", [JSON.stringify(p.args.p_nota), JSON.stringify(p.args.p_itens), JSON.stringify(p.args.p_docs), JSON.stringify(p.args.p_proc)], aal).then((l) => l[0].r);
const gravar = async (db, n, o = {}) => { const p = await subir(db, pelo_site(n, o)); return { ...p, r: await salvar(db, R, p) }; };
const atualizarSit = (db, uid, args, aal) => como(db, uid, "select public.nota_fiscal_atualizar_situacao($1, $2, $3, $4, $5) as r", [args.p_id, args.p_situacao, args.p_protocolo, args.p_evidencia, args.p_fonte], aal).then((l) => l[0].r);
const so2 = (l) => l.filter((t) => /^notas_fiscais_(tentativas|situacoes)$/.test(t));

test("a 038 só recria seguranca_estado() com as duas tabelas da 037; não cria nem altera tabela, política ou dado; não foi aplicada", () => {
  const s = ler(P38), sem = s.replace(/^--.*$/gm, "");
  assert.match(s.slice(0, 200), /PROPOSTA 038 · NÃO APLICADA EM PRODUÇÃO/);
  assert.ok(!/create table|alter table|drop |delete from|insert into|update public|grant (insert|update|delete)|create policy|create trigger/i.test(sem), "só a função");
  assert.match(sem, /create or replace function public\.seguranca_estado\(\)/); assert.match(sem, /'notas_fiscais_tentativas', 'notas_fiscais_situacoes'/);
  assert.match(sem, /revoke all on function public\.seguranca_estado\(\) from public, anon;/); assert.match(sem, /security definer set search_path = ''/); assert.match(sem, /begin;[\s\S]*commit;/);
  /* é a função da 033 + as duas tabelas: nada mais mudou */
  const f33 = trecho("supabase/033_seguranca_compras_fiscal.sql", "create or replace function public.seguranca_estado()", "grant execute on function public.seguranca_estado() to authenticated;");
  const f38 = trecho(P38, "create or replace function public.seguranca_estado()", "grant execute on function public.seguranca_estado() to authenticated;");
  assert.equal(f38.replace(/\s+/g, " "), f33.replace("'notas_fiscais_vinculos', 'seguranca_eventos']", "'notas_fiscais_vinculos',\n    'notas_fiscais_tentativas', 'notas_fiscais_situacoes', 'seguranca_eventos']").replace(/\s+/g, " "));
  const conf = ler("supabase/conferencias/038_conferir_producao.sql"); assert.ok(!/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate)\b/i.test(conf.replace(/^--.*$/gm, "")), "a conferência é só leitura");
});
test("backup: as duas tabelas novas estão em SEG_TABELAS (exportam, não restauram), com os pais antes dos filhos; a restauração não as escreve", () => {
  const nomes = N.SEG_TABELAS.map((d) => d.t), i = (t) => nomes.indexOf(t);
  assert.ok(i("notas_fiscais") < i("notas_fiscais_tentativas") && i("notas_fiscais_tentativas") < i("notas_fiscais_situacoes"), "nota → tentativa → situação");
  assert.deepEqual([N.segDef("notas_fiscais_tentativas").so, N.segDef("notas_fiscais_situacoes").so], ["exportar", "exportar"], "o banco só deixa a RPC gravar: o backup exporta e a restauração não escreve");
  assert.deepEqual(JSON.parse(JSON.stringify(N.segDef("notas_fiscais_tentativas").fk)), { nota_id: "notas_fiscais" });
  assert.deepEqual(JSON.parse(JSON.stringify(N.segDef("notas_fiscais_situacoes").fk)), { nota_id: "notas_fiscais", tentativa_id: "notas_fiscais_tentativas" });
  const tabs = { notas_fiscais: [], notas_fiscais_tentativas: [{ id: "t", nota_id: "n", docs: [] }], notas_fiscais_situacoes: [{ id: "s", nota_id: "n", tentativa_id: "t" }] };
  const B = N.segBackup(R, "2026-11-08T00:00:00Z", tabs, {}, [], []);
  assert.ok(B.tabelas.notas_fiscais_tentativas && B.tabelas.notas_fiscais_situacoes, "entram no backup");
  const lido = N.segLer(JSON.parse(JSON.stringify(B)));
  const plano = N.segPlano(lido.ok ? { ...B, versao: 2 } : B, {}, { conta: R });
  const w = N.segEscrita(plano, true); assert.ok(!w.some((x) => /tentativas|situacoes/.test(x.t)), "nada das duas tabelas é gravado pela restauração");
  assert.equal(plano.total.soExportar, 2);
  const bkp = ler("js/sistema.js"); assert.match(bkp, /t==="notas_fiscais_tentativas"/); assert.match(bkp, /r\.origem&&Array\.isArray\(r\.docs\)/, "os originais das tentativas entram no pacote com anexos");
});

// ================= site × banco =================
test("PGlite · FOTO montada pelo site: o banco aceita, grava nota + itens + original + tentativa + histórico, e NÃO confere", { skip: pular }, async () => {
  const db = await banco(); const g = await gravar(db, 1);
  assert.equal(g.r.criado, true, JSON.stringify(g.r)); assert.equal(g.r.resultado, "validada"); assert.equal(g.r.classe, "consistente"); assert.equal(g.g.modo, "validada", "o site previu o mesmo");
  const n = (await admin(db, "select situacao, formato_origem, requer_conferencia, conferida_em, protocolo, chave from public.notas_fiscais where id = $1", [g.id]))[0];
  assert.deepEqual([n.situacao, n.formato_origem, n.requer_conferencia, n.conferida_em, n.protocolo, n.chave], ["autorizada", "imagem", true, null, "131260000000001", chaveDe(1)]);
  assert.equal(await contar(db, "notas_fiscais_itens", `nota_id = '${g.id}'`), 2); assert.equal(await contar(db, "notas_fiscais_docs", `nota_id = '${g.id}'`), 1);
  const t = (await admin(db, "select resultado, classe, confianca, revisada, modelo_ia, origem from public.notas_fiscais_tentativas where nota_id = $1", [g.id]))[0]; assert.deepEqual([t.resultado, t.classe, +t.confianca, t.revisada, t.modelo_ia, t.origem], ["validada", "consistente", 0.96, false, "claude-sonnet-5-5", "foto"]);
  const h = await admin(db, "select de, para, origem, fonte from public.notas_fiscais_situacoes where nota_id = $1", [g.id]); assert.deepEqual(h.map((x) => [x.de, x.para, x.origem, x.fonte]), [[null, "autorizada", "gravacao", "foto"]]);
  assert.equal(await contar(db, "registros"), 0); assert.equal(await contar(db, "pedidos"), 0); assert.equal(await contar(db, "notas"), 0, "nenhuma despesa nem compra");
  await db.close();
});
test("PGlite · PDF e quatro imagens montados pelo site", { skip: pular }, async () => {
  const db = await banco(); const p = await gravar(db, 2, { pdf: true }); assert.equal(p.r.criado, true, JSON.stringify(p.r));
  assert.equal((await admin(db, "select formato_origem as f from public.notas_fiscais where id = $1", [p.id]))[0].f, "pdf"); assert.equal((await admin(db, "select tipo, mime from public.notas_fiscais_docs where nota_id = $1", [p.id]))[0].mime, "application/pdf");
  const q = await gravar(db, 3, { arqs: ["jpg", "png", "webp", "jpg"].map((e) => arquivo(e)) }); assert.equal(q.r.criado, true, JSON.stringify(q.r)); assert.equal(q.r.docs_gravados, 4); assert.equal(await contar(db, "notas_fiscais_docs", `nota_id = '${q.id}'`), 4);
  await db.close();
});
test("PGlite · o site e o banco decidem IGUAL em cada caso (validada, pendente fiscal, bloqueada) — divergente, baixa confiança, cancelada, rejeitada, sem chave, componentes", { skip: pular }, async () => {
  const db = await banco();
  const casos = [[10, {}, "validada", true], [11, { res: { situacao: "contingencia", protocolo: null, chave: chaveDe(11, "9") } }, "pendente_fiscal", true], [12, { res: { total: 60 } }, "bloqueada", false], [13, { confianca: 0.62 }, "bloqueada", false],
    [14, { res: { situacao: "cancelada" } }, "bloqueada", false], [15, { res: { situacao: "rejeitada", protocolo: null } }, "bloqueada", false], [16, { res: { chave: null } }, "bloqueada", false], [17, { confianca: 0.62, revisada: true }, "validada", true],
    [18, { confianca: 0.9 }, "validada", true], [19, { confianca: 0.89 }, "bloqueada", false],
    [20, { res: { total_produtos: 56.13, descontos: 2.13, total: 64, valor_pago: 64, componentes: { st: 8, ipi: 2 }, itens: [{ descricao: "X", qtd: 1, unidade: "UN", unitario: 56.13, total: 56.13, desconto: 2.13 }] } }, "validada", true],
    [21, { res: { total_produtos: 25.5, total: 21.5, valor_pago: 21.5, componentes: { deson: 4 } } }, "validada", true],
    [22, { res: { itens: [{ descricao: "X", qtd: 3, unidade: "UN", unitario: 10, total: 25, desconto: 0 }], total_produtos: 25, total: 25, valor_pago: 25 } }, "bloqueada", false]];
  for (const [n, o, esperado, nota] of casos) {
    const g = await gravar(db, n, o); const r = g.r;
    assert.equal(g.g.modo, esperado, `site, caso ${n}`); assert.equal(r.resultado, esperado, `banco, caso ${n}: ${JSON.stringify(r)}`); assert.equal(!!r.criado, nota, `caso ${n}: nota criada`);
    if (!nota) {
      assert.equal(await contar(db, "notas_fiscais", `id = '${g.id}'`), 0, `caso ${n}: bloqueada não vira nota`); assert.equal(r.id, null);
      const t = (await admin(db, "select resultado, docs from public.notas_fiscais_tentativas where idem = $1", [idem(n)]))[0]; assert.equal(t.resultado, "bloqueada"); assert.equal(t.docs.length, 1, "o original da tentativa é guardado"); assert.deepEqual(r.docs_para_apagar, [], "e nunca devolvido para apagar");
    }
    assert.equal(+(await admin(db, "select count(*)::int as n from public.notas_fiscais where id = $1 and conferida_em is not null", [g.id]))[0].n, 0, `caso ${n}: nunca conferida`);
  }
  assert.equal(await contar(db, "registros") + await contar(db, "pedidos") + await contar(db, "notas"), 0, "nenhuma despesa");
  await db.close();
});
test("PGlite · idempotência: o mesmo identificador não grava duas vezes; correção (identificador novo) após bloqueio funciona e reaproveita o original; duplicidade por chave e por arquivo", { skip: pular }, async () => {
  const db = await banco(); const a = await gravar(db, 30); assert.equal(a.r.criado, true);
  const a2 = await salvar(db, R, a); assert.deepEqual([a2.criado, a2.ja_existia, a2.resultado], [false, true, "validada"]); assert.equal(await contar(db, "notas_fiscais"), 1); assert.equal(await contar(db, "notas_fiscais_tentativas"), 1);
  assert.deepEqual(a2.docs_para_apagar, [], "arquivo registrado numa nota nunca é devolvido para apagar");
  /* bloqueada → corrigida (identificador novo, mesma nota, mesmo arquivo) */
  const arq = arquivo(); const b = await gravar(db, 31, { arqs: [arq], confianca: 0.7 }); assert.equal(b.r.resultado, "bloqueada");
  const corrigido = pelo_site(31, { arqs: [arq], confianca: 0.7, revisada: true, idem: idem(310), id: b.id });
  const c = await salvar(db, R, corrigido); assert.equal(c.criado, true, JSON.stringify(c)); assert.equal(c.resultado, "validada"); assert.equal(await contar(db, "notas_fiscais_tentativas"), 3, "validada + bloqueada + corrigida");
  assert.equal(await contar(db, "notas_fiscais_tentativas", `nota_id = '${b.id}'`), 1); assert.equal((await admin(db, "select revisada from public.notas_fiscais_tentativas where idem = $1", [idem(310)]))[0].revisada, true);
  /* duplicidade por chave e por hash */
  const d1 = await gravar(db, 30, { idem: idem(301), id: uuid(301) }); assert.deepEqual([d1.r.criado, d1.r.duplicada, d1.r.motivo], [false, true, "chave"]); assert.equal(d1.r.id, a.id); assert.equal(await contar(db, "notas_fiscais"), 2);
  const d2 = await gravar(db, 32, { arqs: [a.arqs[0]], idem: idem(302), id: uuid(302) }); assert.deepEqual([d2.r.criado, d2.r.duplicada, d2.r.motivo], [false, true, "arquivo"]); assert.equal(d2.r.id, a.id); assert.equal(await contar(db, "notas_fiscais"), 2);
  assert.equal(d2.r.docs_para_apagar.length, 1, "a cópia enviada da duplicata é a única a apagar");
  await db.close();
});
test("PGlite · atualizar a situação pelo contrato do site: histórico preservado, protocolo obrigatório, transições do banco", { skip: pular }, async () => {
  const db = await banco(); const g = await gravar(db, 40, { res: { situacao: "contingencia", protocolo: null, chave: chaveDe(40, "9") } }); assert.equal(g.r.resultado, "pendente_fiscal");
  const v = N.nfAtualizarSituacao({ id: g.id, situacao: "contingencia" }, { para: "autorizada", protocolo: "131260000000009", evidencia: "DANFE", fonte: "pdf" }); assert.equal(v.ok, true);
  const r1 = await atualizarSit(db, R, v.args); assert.deepEqual([r1.de, r1.para, r1.sem_mudanca], ["contingencia", "autorizada", false]);
  const r2 = await atualizarSit(db, R, v.args); assert.equal(r2.sem_mudanca, true, "repetir não muda nem duplica o histórico");
  const h = await admin(db, "select de, para, protocolo, origem, fonte, evidencia from public.notas_fiscais_situacoes where nota_id = $1 order by criado_em, para", [g.id]);
  assert.deepEqual(h.map((x) => [x.de, x.para, x.protocolo, x.origem, x.fonte]), [[null, "contingencia", null, "gravacao", "foto"], ["contingencia", "autorizada", "131260000000009", "atualizacao", "pdf"]]); assert.equal(h[1].evidencia, "DANFE");
  assert.equal((await admin(db, "select protocolo as p from public.notas_fiscais where id = $1", [g.id]))[0].p, "131260000000009");
  /* o site recusa antes; o banco recusa também */
  assert.equal(N.nfAtualizarSituacao({ id: g.id, situacao: "autorizada" }, { para: "rejeitada", fonte: "foto" }).ok, false);
  assert.match((await falha(atualizarSit(db, R, { p_id: g.id, p_situacao: "rejeitada", p_protocolo: null, p_evidencia: null, p_fonte: "foto" }))).message, /não é permitido/);
  const sem = await gravar(db, 41, { res: { situacao: "pendente", protocolo: null } });
  assert.equal(N.nfAtualizarSituacao({ id: sem.id, situacao: "pendente" }, { para: "autorizada", fonte: "foto" }).ok, false, "o site exige o protocolo");
  assert.match((await falha(atualizarSit(db, R, { p_id: sem.id, p_situacao: "autorizada", p_protocolo: null, p_evidencia: null, p_fonte: "foto" }))).message, /protocolo/);
  const canc = N.nfAtualizarSituacao({ id: g.id, situacao: "autorizada" }, { para: "cancelada", evidencia: "cancelamento", fonte: "manual" }); assert.equal(canc.ok, true); assert.equal((await atualizarSit(db, R, canc.args)).para, "cancelada");
  assert.equal(await contar(db, "notas_fiscais_situacoes", `nota_id = '${g.id}'`), 3, "o histórico só cresce");
  await db.close();
});
test("PGlite · seguranca_estado(): com a 038 a auditoria enxerga a falta da trava 'mfa' nas duas tabelas novas; com a função da 033 ela não enxergava", { skip: pular }, async () => {
  const db = await banco();
  const estado = async () => (await como(db, R, "select public.seguranca_estado() as e"))[0].e;
  assert.deepEqual(so2((await estado()).sem_trava_mfa), [], "com a trava, nada a apontar");
  await execAdmin(db, "drop policy \"mfa\" on public.notas_fiscais_tentativas; drop policy \"mfa\" on public.notas_fiscais_situacoes;");
  assert.deepEqual(so2((await estado()).sem_trava_mfa), [], "a função da 033 NÃO via a falta nas tabelas novas (por isso a 038)");
  await db.exec(ler(P38)); await db.exec(ler(P38));    // idempotente
  assert.deepEqual(so2((await estado()).sem_trava_mfa), ["notas_fiscais_situacoes", "notas_fiscais_tentativas"], "com a 038 a falta aparece");
  await execAdmin(db, "create policy \"mfa\" on public.notas_fiscais_tentativas as restrictive for all to authenticated using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok())); create policy \"mfa\" on public.notas_fiscais_situacoes as restrictive for all to authenticated using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok()));");
  assert.deepEqual(so2((await estado()).sem_trava_mfa), [], "restaurada a trava, some o alerta");
  assert.equal((await admin(db, "select has_function_privilege('anon', 'public.seguranca_estado()', 'execute') as a"))[0].a, false);
  await db.close();
});
test("PGlite · permissões: sem MFA nada grava nem atualiza; Fernanda, estranho e anônimo não gravam nem leem as tabelas novas", { skip: pular }, async () => {
  const db = await banco(); const g = await gravar(db, 50);
  await admin(db, `insert into auth.mfa_factors values ('${R}', 'verified')`);
  const p = await subir(db, pelo_site(51));
  assert.match((await falha(salvar(db, R, p, "aal1"))).message, /MFA/); assert.match((await falha(atualizarSit(db, R, { p_id: g.id, p_situacao: "cancelada", p_protocolo: null, p_evidencia: null, p_fonte: "manual" }, "aal1"))).message, /MFA/);
  assert.equal((await salvar(db, R, p, "aal2")).criado, true); assert.equal((await atualizarSit(db, R, { p_id: g.id, p_situacao: "cancelada", p_protocolo: null, p_evidencia: null, p_fonte: "manual" }, "aal2")).para, "cancelada");
  const q = await subir(db, pelo_site(52));
  for (const uid of [F, X, null]) { assert.ok((await falha(salvar(db, uid, q, "aal2"))).message, String(uid)); assert.ok((await falha(atualizarSit(db, uid, { p_id: g.id, p_situacao: "cancelada", p_protocolo: null, p_evidencia: null, p_fonte: "manual" }, "aal2"))).message, String(uid)); }
  for (const t of ["notas_fiscais_tentativas", "notas_fiscais_situacoes"]) assert.equal((await como(db, F, `select count(*)::int as n from public.${t}`, [], "aal2"))[0].n, 0, t + ": a Fernanda não vê");
  assert.equal(await contar(db, "notas_fiscais", `id = '${q.id}'`), 0, "nada foi gravado pelos que não podem");
  await db.close();
});
test("PGlite · regressão do XML: gravar e conferir nota de XML (034) seguem iguais depois da 037; nota de XML não gera tentativa nem histórico de gravação", { skip: pular }, async () => {
  const db = await banco();
  const fn = await admin(db, "select proname, prosecdef from pg_proc where pronamespace = 'public'::regnamespace and proname in ('nota_fiscal_salvar','nota_fiscal_conferir') order by 1");
  assert.deepEqual(fn.map((x) => [x.proname, x.prosecdef]), [["nota_fiscal_conferir", false], ["nota_fiscal_salvar", false]], "continuam invoker, como na 034");
  const ch = chaveDe(60), XML = `<nfeProc><NFe><infNFe Id="NFe${ch}"><ide><mod>65</mod><serie>1</serie><nNF>60</nNF><dhEmi>2026-11-06T10:00:00-03:00</dhEmi><tpEmis>1</tpEmis></ide><emit><CNPJ>${CNPJ}</CNPJ><xNome>LOJA</xNome><enderEmit><UF>MG</UF></enderEmit></emit><det nItem="1"><prod><cProd>1</cProd><xProd>ITEM</xProd><qCom>1.0000</qCom><uCom>UN</uCom><vUnCom>10.00</vUnCom><vProd>10.00</vProd></prod></det><total><ICMSTot><vProd>10.00</vProd><vNF>10.00</vNF></ICMSTot></total></infNFe><protNFe><infProt><cStat>100</cStat><nProt>131260000000001</nProt><chNFe>${ch}</chNFe></infProt></protNFe></NFe></nfeProc>`;
  const lido = N.nfLerXML(XML), forma = N.nfParaGravar(lido, N.nfNormalizar(lido), { id: uuid(60), dono: R, nome: "n.xml", mime: "text/xml", tamanho: 900, sha256: "f".repeat(64), conferir: false });
  assert.equal(forma.ok, true, forma.erros.join("|")); await noCofre(db, forma.args.p_docs[0].path, { size: 900, mimetype: "text/xml" });
  const x = (await como(db, R, "select public.nota_fiscal_salvar($1::jsonb, $2::jsonb, $3::jsonb, false) as r", [JSON.stringify(forma.args.p_nota), JSON.stringify(forma.args.p_itens), JSON.stringify(forma.args.p_docs)]))[0].r;
  assert.equal(x.criado, true, JSON.stringify(x)); assert.equal(await contar(db, "notas_fiscais_situacoes", `nota_id = '${uuid(60)}'`), 0, "nota de XML não gera histórico na gravação (como antes)"); assert.equal(await contar(db, "notas_fiscais_tentativas"), 0);
  assert.equal((await como(db, R, "select public.nota_fiscal_conferir($1) as r", [uuid(60)]))[0].r.id, uuid(60), "conferir XML autorizado segue funcionando");
  assert.ok(ler("tests/banco_nota_salvar.test.mjs").includes("nota_fiscal_salvar"), "a regressão detalhada do XML continua em banco_nota_salvar e banco_foto_pdf");
  /* XML e foto/PDF da mesma chave: a segunda leitura é duplicidade, nunca uma segunda nota */
  const dup = await gravar(db, 60, { idem: idem(600), id: uuid(601) }); assert.deepEqual([dup.r.criado, dup.r.duplicada, dup.r.motivo, dup.r.id], [false, true, "chave", uuid(60)]); assert.equal(await contar(db, "notas_fiscais"), 1);
  await db.close();
});

// ================= Lote 1.6 · 039: gravar sem chave (só com a revisão do dono) =================
const P39 = "supabase/039_nota_foto_sem_chave.sql";
test("a 039 é a função da 037 com UMA diferença (chave ausente + revisada deixa de bloquear); mesmas permissões; só a função; não foi aplicada", () => {
  const s = ler(P39), sem = s.replace(/^--.*$/gm, "");
  assert.match(s.slice(0, 200), /PROPOSTA 039 · NÃO APLICADA EM PRODUÇÃO/);
  assert.ok(!/create table|alter table|drop |delete from|create policy|create trigger|grant (insert|update|delete)/i.test(sem), "só a função");
  const f37 = trecho(PROP, "create or replace function public.nota_fiscal_salvar_doc", "grant execute on function public.nota_fiscal_salvar_doc(jsonb, jsonb, jsonb, jsonb) to authenticated;");
  const f39 = trecho(P39, "create or replace function public.nota_fiscal_salvar_doc", "grant execute on function public.nota_fiscal_salvar_doc(jsonb, jsonb, jsonb, jsonb) to authenticated;");
  const velho = "  if v_chave is null then v_baixa := true; v_mot := v_mot || to_jsonb('A chave de acesso está ausente ou inválida.'::text); end if;";
  assert.ok(f37.includes(velho)); const resto39 = f39.replace(/  if v_chave is null then\n    if v_rev then[\s\S]*?\n    end if;\n  end if;/, "@@"), resto37 = f37.replace(velho, "@@");
  assert.equal(resto39, resto37, "nada mais mudou na função");
  assert.match(f39, /if v_sit = 'autorizada' then v_sit := 'pendente'; end if;/); assert.match(sem, /revoke all on function public\.nota_fiscal_salvar_doc\(jsonb, jsonb, jsonb, jsonb\) from public, anon;/); assert.match(sem, /begin;[\s\S]*commit;/);
  const conf = ler("supabase/conferencias/039_conferir_producao.sql"); assert.ok(!/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate)\b/i.test(conf.replace(/^--.*$/gm, "")), "a conferência é só leitura");
});
test("PGlite · com a 039: sem chave + revisão do dono vira PENDENTE fiscal (situação 'pendente'), sem conferir; sem revisão continua bloqueada; cancelada e conta errada continuam bloqueando", { skip: pular }, async () => {
  const db = await banco(); await db.exec(ler(P39)); await db.exec(ler(P39));     // idempotente
  const sem = (n, o = {}) => gravar(db, n, { ...o, res: { chave: null, ...(o.res || {}) } });
  const a = await sem(70, { revisada: true, confianca: 0.45 });
  assert.equal(a.g.modo, "pendente_fiscal", "o site previu o mesmo"); assert.deepEqual([a.r.criado, a.r.resultado, a.r.classe], [true, "pendente_fiscal", "consistente"], JSON.stringify(a.r)); assert.match((a.r.avisos || []).join(" "), /sem chave.*revisão do dono/i);
  const n = (await admin(db, "select chave, situacao, requer_conferencia, conferida_em, formato_origem from public.notas_fiscais where id = $1", [a.id]))[0]; assert.deepEqual([n.chave, n.situacao, n.requer_conferencia, n.conferida_em, n.formato_origem], [null, "pendente", true, null, "imagem"]);
  assert.equal(await contar(db, "notas_fiscais_itens", `nota_id = '${a.id}'`), 2, "os itens ficam para o balanço"); assert.equal(await contar(db, "notas_fiscais_docs", `nota_id = '${a.id}'`), 1);
  assert.deepEqual((await admin(db, "select de, para from public.notas_fiscais_situacoes where nota_id = $1", [a.id])).map((x) => [x.de, x.para]), [[null, "pendente"]]);
  const b = await sem(71); assert.deepEqual([b.g.modo, b.r.resultado, b.r.criado], ["bloqueada", "bloqueada", false]);
  for (const [n2, res] of [[72, { situacao: "cancelada" }], [73, { total: 60 }]]) { const c = await sem(n2, { revisada: true, res }); assert.deepEqual([c.g.modo, c.r.resultado], ["bloqueada", "bloqueada"], String(n2)); }
  const d = await sem(74, { revisada: true, confianca: 0.45, arqs: [a.arqs[0]], idem: idem(740), id: uuid(740) }); assert.deepEqual([d.r.criado, d.r.duplicada, d.r.motivo], [false, true, "arquivo"], "sem chave a duplicidade pelo arquivo continua valendo");
  const e = await sem(75, { revisada: true, confianca: 0.45, res: { situacao: "contingencia", protocolo: null } }); assert.equal(e.r.resultado, "pendente_fiscal"); assert.equal((await admin(db, "select situacao as s from public.notas_fiscais where id = $1", [e.id]))[0].s, "contingencia");
  /* depois dá para autorizar com o protocolo (histórico preservado) e a nota continua sem conferência automática */
  const v = N.nfAtualizarSituacao({ id: a.id, situacao: "pendente" }, { para: "autorizada", protocolo: "131260000000007", fonte: "manual" }); assert.equal(v.ok, true); assert.equal((await atualizarSit(db, R, v.args)).para, "autorizada");
  assert.equal((await admin(db, "select conferida_em as c from public.notas_fiscais where id = $1", [a.id]))[0].c, null);
  assert.equal(await contar(db, "registros") + await contar(db, "pedidos") + await contar(db, "notas"), 0, "nenhuma despesa");
  await db.close();
});
test("PGlite · SEM a 039 (como em produção hoje) o banco bloqueia nota sem chave mesmo revisada: o site prevê pendente, mas vale a resposta do banco", { skip: pular }, async () => {
  const db = await banco(); const a = await gravar(db, 80, { revisada: true, confianca: 0.45, res: { chave: null } });
  assert.equal(a.g.modo, "pendente_fiscal", "o site prevê pendente"); assert.deepEqual([a.r.criado, a.r.resultado], [false, "bloqueada"], "o banco sem a 039 não deixa"); assert.equal(await contar(db, "notas_fiscais"), 0);
  await db.close();
});

// ================= Lote 1.6 · 040: dar entrada da nota no Mercado =================
const P40 = "supabase/040_nota_fiscal_entrada_mercado.sql";
test("a 040 só cria a função de entrada no Mercado: invoker, MFA, sem anon, sem despesa, sem tabela/política/gatilho novos; não foi aplicada", () => {
  const s = ler(P40), sem = s.replace(/^--.*$/gm, "");
  assert.match(s.slice(0, 200), /PROPOSTA 040 · NÃO APLICADA EM PRODUÇÃO/);
  assert.ok(!/create table|alter table|drop |delete from|create policy|create trigger|truncate/i.test(sem), "só a função");
  assert.match(sem, /security invoker set search_path = ''/); assert.match(sem, /public\.rac_aal_ok\(\)/); assert.match(sem, /if p_conferi is not true then raise/);
  assert.match(sem, /revoke all on function public\.nota_fiscal_entrada_mercado\(uuid, boolean\) from public, anon;/); assert.match(sem, /grant execute on function public\.nota_fiscal_entrada_mercado\(uuid, boolean\) to authenticated;/);
  assert.ok(!/insert into public\.(registros|pedidos|compras_online)|financeiro|despesa\b/i.test(sem.replace(/gera_despesa/g, "").replace(/sem despesa/gi, "")), "nada de Financeiro nem despesa");
  assert.match(sem, /'conferencia', false, true/, "vínculo com gera_despesa = false");
  const conf = ler("supabase/conferencias/040_conferir_producao.sql"); assert.ok(!/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate)\b/i.test(conf.replace(/^--.*$/gm, "")), "a conferência é só leitura");
});
async function bancoMercado() {
  const db = await banco(); await db.exec(ler(P39));
  await execAdmin(db, "drop table public.notas cascade;");
  await db.exec(ler("supabase/schema.sql").split("\n").slice(8, 64).join("\n"));        // as tabelas reais do Mercado: mercados, produtos, notas, itens
  for (const t of ["mercados", "produtos", "notas", "itens"]) await db.exec(`alter table public.${t} enable row level security; create policy "casa" on public.${t} for all to authenticated using (user_id = public.dono_da_casa()) with check (user_id = public.dono_da_casa());
    create policy "mfa" on public.${t} as restrictive for all to authenticated using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok()));`);
  await db.exec(ler(P40)); await db.exec(ler(P40));    // idempotente
  return db;
}
const entrar = (db, uid, id, conferi = true, aal) => como(db, uid, "select public.nota_fiscal_entrada_mercado($1, $2) as r", [id, conferi], aal).then((l) => l[0].r);
test("PGlite · entrada no Mercado de nota pendente SEM chave: cria mercado, produtos, compra e itens (g/ml convertidos, desconto no item), vínculo sem despesa, situação fiscal intacta; clicar de novo não duplica", { skip: pular }, async () => {
  const db = await bancoMercado();
  const g = await gravar(db, 90, { revisada: true, confianca: 0.45, res: { chave: null, emitente_nome: "TAUSTE SUPERMERCADOS LTDA", total_produtos: 26, descontos: 0.5, total: 25.5, valor_pago: 25.5,
    itens: [{ descricao: "ARROZ TIPO 1 5KG", qtd: 1, unidade: "UN", unitario: 20, total: 20, desconto: 0.5 }, { descricao: "QUEIJO MUSSARELA", qtd: 300, unidade: "G", unitario: 0.02, total: 6, desconto: 0 }] } });
  assert.equal(g.r.resultado, "pendente_fiscal", JSON.stringify(g.r));
  const a = await entrar(db, R, g.id); assert.deepEqual([a.criado, a.itens], [true, 2], JSON.stringify(a)); assert.equal(+a.total, 25.5);
  const nm = (await admin(db, "select n.data, n.total, n.fonte, n.chave_nfce, m.nome from public.notas n join public.mercados m on m.id = n.mercado_id where n.id = $1", [a.mercado_nota_id]))[0];
  assert.deepEqual([+nm.total, nm.fonte, nm.chave_nfce, nm.nome], [25.5, "foto", null, "TAUSTE SUPERMERCADOS LTDA"]); assert.equal((await admin(db, "select to_char(data, 'YYYY-MM-DD') as d from public.notas where id = $1", [a.mercado_nota_id]))[0].d, "2026-11-06");
  const it = await admin(db, "select descricao, categoria, quantidade, unidade, valor_unitario, valor_total, desconto from public.itens where nota_id = $1 order by descricao", [a.mercado_nota_id]);
  assert.deepEqual(it.map((x) => [x.descricao, x.categoria, +x.quantidade, x.unidade, +x.valor_unitario, +x.valor_total, +x.desconto]), [["ARROZ TIPO 1 5KG", "Mercearia", 1, "un", 20, 19.5, 0.5], ["QUEIJO MUSSARELA", "Mercearia", 0.3, "kg", 20, 6, 0]], "300 g viram 0,3 kg a R$ 20/kg; o desconto fica no item");
  assert.equal(await contar(db, "produtos"), 2); assert.equal((await admin(db, "select count(*)::int as n from public.itens where produto_id is not null"))[0].n, 2);
  const v = (await admin(db, "select modulo, registro_id, gera_despesa, valido from public.notas_fiscais_vinculos where nota_id = $1", [g.id])); assert.deepEqual([v.length, v[0].modulo, v[0].gera_despesa, v[0].valido], [1, "mercado", false, true]);
  assert.equal((await admin(db, "select situacao as s from public.notas_fiscais where id = $1", [g.id]))[0].s, "pendente", "a situação fiscal não mudou com a entrada");
  assert.equal((await admin(db, "select situacao as s, conferida_em as c from public.notas_fiscais where id = $1", [g.id]))[0].c, null);
  const b = await entrar(db, R, g.id); assert.deepEqual([b.criado, b.ja_existia, b.mercado_nota_id], [false, true, a.mercado_nota_id]); assert.equal(await contar(db, "notas"), 1); assert.equal(await contar(db, "itens"), 2); assert.equal(await contar(db, "notas_fiscais_vinculos"), 1);
  assert.equal(await contar(db, "registros") + await contar(db, "pedidos"), 0, "nenhuma despesa");
  await db.close();
});
test("PGlite · entrada: reaproveita produto e mercado já existentes; chave já no Mercado = duplicada; exige Conferi, dono e MFA; cancelada e sem itens/data/total não entram", { skip: pular }, async () => {
  const db = await bancoMercado();
  await admin(db, `insert into public.mercados (user_id, nome, cnpj) values ('${R}', 'Mercado Exemplo', '11222333000181')`); const merc = (await admin(db, "select id from public.mercados"))[0].id;
  await admin(db, `insert into public.produtos (user_id, nome, categoria, unidade) values ('${R}', 'Item A Bonito', 'Bebidas', 'un')`); const prod = (await admin(db, "select id from public.produtos"))[0].id;
  await admin(db, `insert into public.notas (user_id, mercado_id, data, total, fonte) values ('${R}', '${merc}', '2026-10-01', 5, 'manual')`); const antiga = (await admin(db, "select id from public.notas"))[0].id;
  await admin(db, `insert into public.itens (user_id, nota_id, produto_id, descricao, categoria, quantidade, valor_unitario, valor_total) values ('${R}', '${antiga}', '${prod}', 'ITEM A', 'Bebidas', 1, 5, 5)`);
  const g = await gravar(db, 91); assert.equal(g.r.resultado, "validada");
  const a = await entrar(db, R, g.id); assert.equal(a.criado, true, JSON.stringify(a)); assert.equal(await contar(db, "mercados"), 1, "o mercado do mesmo CNPJ foi reaproveitado"); assert.equal(await contar(db, "produtos"), 2, "ITEM A reaproveitou o produto; ITEM B é novo");
  assert.deepEqual((await admin(db, "select categoria from public.itens where nota_id = $1 and descricao = 'ITEM A'", [a.mercado_nota_id])).map((x) => x.categoria), ["Bebidas"], "a categoria do produto já conhecido");
  assert.equal((await admin(db, "select chave_nfce as c from public.notas where id = $1", [a.mercado_nota_id]))[0].c, chaveDe(91), "com chave, a compra leva a chave");
  const g2 = await gravar(db, 92); await admin(db, `insert into public.notas (user_id, mercado_id, data, total, chave_nfce, fonte) values ('${R}', '${merc}', '2026-11-06', 25.5, '${chaveDe(92)}', 'qr')`);
  const d = await entrar(db, R, g2.id); assert.deepEqual([d.criado, d.duplicada, d.motivo], [false, true, "chave"]); assert.equal(await contar(db, "notas_fiscais_vinculos", `nota_id = '${g2.id}'`), 0);
  const g4 = await gravar(db, 94); const g3 = await gravar(db, 93); assert.match((await falha(entrar(db, R, g3.id, false))).message, /confirme que conferiu/); assert.match((await falha(entrar(db, R, g3.id, null))).message, /confirme que conferiu/);
  await admin(db, `insert into auth.mfa_factors values ('${R}', 'verified')`); assert.match((await falha(entrar(db, R, g3.id, true, "aal1"))).message, /MFA/); assert.equal((await entrar(db, R, g3.id, true, "aal2")).criado, true);
  for (const uid of [F, X, null]) assert.ok((await falha(entrar(db, uid, g.id, true, "aal2"))).message, String(uid));
  await admin(db, `update public.notas_fiscais set situacao = 'cancelada' where id = '${g4.id}'`); assert.match((await falha(entrar(db, R, g4.id, true, "aal2"))).message, /cancelada/);
  assert.match((await falha(entrar(db, R, "00000000-0000-4000-8000-000000000000", true, "aal2"))).message, /não encontrada/);
  await db.close();
});
test("PGlite · entrada: duas entradas ao mesmo tempo da mesma nota criam UMA compra só", { skip: pular }, async () => {
  const db = await bancoMercado(); const g = await gravar(db, 95);
  const r = await Promise.allSettled([entrar(db, R, g.id), entrar(db, R, g.id)]);
  assert.equal(r.filter((x) => x.status === "fulfilled" && x.value.criado === true).length, 1, JSON.stringify(r.map((x) => x.value || x.reason?.message))); assert.equal(await contar(db, "notas"), 1); assert.equal(await contar(db, "notas_fiscais_vinculos"), 1);
  await db.close();
});
