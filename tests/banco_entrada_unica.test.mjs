// Central Fiscal · confirmação única (migration 059) contra o Postgres de verdade (PGlite) com as migrations 034 + 037 + 039 + 059.
// Prova: "Estou de acordo" grava a nota e lança a compra no Mercado em UMA chamada; autorizada, pendente e contingência entram; cancelada e rejeitada não; produto ≥ 70% reaproveitado e < 70% criado;
// a mesma nota nunca gera duas compras (reenvio, clique repetido, concorrência, chave já no Mercado); falha do Mercado não perde a nota e "Tentar de novo" retoma sem nova confirmação; dados originais
// intactos; nenhuma despesa; dono, casa (Fernanda), estranho, anônimo e MFA; backup e auditoria enxergam a tabela nova. Dados fictícios; sem rede e sem IA.
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
const P59 = "supabase/059_central_fiscal_entrada_unica.sql";

let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite: pula */ }
const pular = !PGlite && !process.env.CI;
const R = "11111111-1111-4111-8111-111111111111", F = "22222222-2222-4222-8222-222222222222", X = "33333333-3333-4333-8333-333333333333";
const trecho = (arq, ini, fim) => { const t = ler(arq), i = t.indexOf(ini); assert.ok(i >= 0, ini); return t.slice(i, t.indexOf(fim, i) + fim.length); };

// ---------- análise estática da 059 ----------
test("059: proposta idempotente que SUBSTITUI a 040; definer com search_path vazio; sem anon; sem despesa; não toca em 034/037/039 nem em notas_fiscais", () => {
  const s = ler(P59), sem = s.replace(/^--.*$/gm, "");
  assert.match(s.split("\n")[0], /^-- status: pendente/); assert.match(s.slice(0, 400), /PROPOSTA 059 · NÃO APLICADA EM PRODUÇÃO/);
  assert.match(sem, /begin;[\s\S]*commit;/);
  assert.ok(!/create or replace function public\.nota_fiscal_salvar(_doc)?\(|create or replace function public\.nota_fiscal_atualizar_situacao|alter table public\.notas_fiscais(_itens|_docs)?\b/.test(sem), "as funções e tabelas fiscais existentes não são recriadas nem alteradas");
  assert.ok(!/insert into public\.(registros|pedidos|compras_online)|financeiro/i.test(sem), "nada de Financeiro nem despesa");
  assert.match(sem, /'conferencia', false, true/); assert.ok(!/gera_despesa\s*=\s*true|'conferencia', true/.test(sem), "gera_despesa nunca é verdadeiro");
  for (const f of ["nf_mercado_lancar", "nf_entrada_processar", "nota_fiscal_confirmar", "nota_fiscal_entrada_mercado", "notas_fiscais_entradas_revisar"]) {
    const m = new RegExp("create or replace function public\\." + f + "\\([\\s\\S]*?\\$\\$;", "").exec(sem); assert.ok(m, f);
    assert.match(m[0], /security definer set search_path = ''/, f + " é definer com search_path vazio");
  }
  assert.match(sem, /revoke all on function public\.nf_mercado_lancar\(uuid, uuid, jsonb\) from public, anon, authenticated;/); assert.match(sem, /revoke all on function public\.nf_entrada_processar\(uuid\) from public, anon, authenticated;/);
  assert.match(sem, /revoke all on function public\.nota_fiscal_confirmar\(text, jsonb, jsonb, jsonb, jsonb, boolean, jsonb\) from public, anon;/);
  assert.match(sem, /revoke all on function public\.nota_fiscal_entrada_mercado\(uuid, boolean, jsonb\) from public, anon;/);
  assert.match(sem, /rac_aal_ok\(\)/); assert.ok(!/<> v_casa then raise/.test(sem), "sem a linha 'só o dono': a casa também confirma");
  assert.match(sem, /revoke all on public\.notas_fiscais_entradas from anon, authenticated;[\s\S]*grant select on public\.notas_fiscais_entradas to authenticated;/);
  assert.match(sem, /foreach t in array array\['notas_fiscais_entradas'\] loop[\s\S]*create policy "mfa" on public\.%I as restrictive/); assert.match(sem, /insert into public\.seguranca_catalogo[\s\S]*'notas_fiscais_entradas'/); assert.match(sem, /drop function if exists public\.nota_fiscal_entrada_mercado\(uuid, boolean\);/);
  const conf = ler("supabase/conferencias/059_conferir_producao.sql"); assert.ok(!/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate)\b/i.test(conf.replace(/^--.*$/gm, "")), "a conferência é só leitura");
  const q40 = ler("supabase/040_nota_fiscal_entrada_mercado.sql"); assert.match(q40, /SUBSTITUÍDA pela 059/); assert.match(q40, /raise exception '040 substituída pela 059/, "a 040 se recusa a rodar");
});

// ---------- o banco de teste ----------
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
  for (const a of ["025_compras_online", "026_compras_emails", "030_compras_multiorigem", "031_compras_reembolsos", "032_central_fiscal", "033_seguranca_compras_fiscal", "034_notas_fiscais_gravacao", "037_notas_fiscais_foto_pdf", "038_seguranca_estado_tentativas", "039_nota_foto_sem_chave"]) await db.exec(ler(`supabase/${a}.sql`));
  await db.exec("drop table public.notas cascade;");
  await db.exec(ler("supabase/schema.sql").split("\n").slice(8, 64).join("\n"));        // as tabelas reais do Mercado: mercados, produtos, notas, itens
  for (const t of ["mercados", "produtos", "notas", "itens"]) await db.exec(`alter table public.${t} enable row level security; create policy "casa" on public.${t} for all to authenticated using (user_id = public.dono_da_casa()) with check (user_id = public.dono_da_casa());
    create policy "mfa" on public.${t} as restrictive for all to authenticated using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok()));`);
  await db.exec(ler(P59)); await db.exec(ler(P59));    // idempotente
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

// ---------- foto/PDF: o caminho do site (leitura da IA → nfNormalizar → nfParaGravarDoc) ----------
const CNPJ = "11222333000181";
const uuid = (n) => "5f1c2d3e-4a5b-4c6d-8e7f-" + String(n).padStart(12, "0");
const idem = (n) => "9a9a9a9a-0000-4000-8000-" + String(n).padStart(12, "0");
const chaveDe = (n, tp = "1") => { const b = "31" + "2611" + CNPJ + "65" + "001" + String(n).padStart(9, "0") + tp + "12345678"; return b + N.nfDvChave(b); };
let seqArquivo = 0;
const arquivo = (ext = "jpg", tamanho = 3000) => {
  let bytes, sha256;
  do { bytes = Buffer.alloc(tamanho, "arquivo-entrada-" + (++seqArquivo)); sha256 = createHash("sha256").update(bytes).digest("hex"); } while (/\d{11}/.test(sha256));
  return { nome: "nota." + ext, ext, bytes, sha256, tamanho, mime: ext === "pdf" ? "application/pdf" : "image/jpeg" };
};
const resposta = (n, o = {}) => ({ modelo: "65", emitente_nome: "MERCADO EXEMPLO LTDA", emitente_cnpj: CNPJ, emitente_uf: "MG", numero: String(n), serie: "1", chave: chaveDe(n), data_emissao: "2026-11-06", protocolo: "131260000000001",
  situacao: "autorizada", total_produtos: 25.5, descontos: null, frete: null, outras: null, impostos: null, total: 25.5, valor_pago: 25.5, componentes: {}, pagamentos: [],
  itens: [{ descricao: "ITEM A", codigo: null, qtd: 2, unidade: "UN", unitario: 10, total: 20, desconto: 0, incerto: false }, { descricao: "ITEM B", codigo: null, qtd: 1, unidade: "UN", unitario: 5.5, total: 5.5, desconto: 0, incerto: false }],
  confianca: 0.96, incertos: [], ...o });
function pelo_site(n, o = {}) {
  const ia = N.nfLerIA(resposta(n, o.res), "imagem"), nota = N.nfNormalizar(ia.lido), id = o.id || uuid(n), arqs = o.arqs || [arquivo("jpg")];
  const g = N.nfParaGravarDoc(ia.lido, nota, { id, dono: R, idem: o.idem || idem(n), tipo: "imagem", arquivos: arqs.map((a) => ({ nome: a.nome, mime: a.mime, tamanho: a.tamanho, sha256: a.sha256 })), confianca: o.confianca ?? ia.confianca, revisada: !!o.revisada, incertos: ia.incertos, modelo_ia: "claude-sonnet-5-5", ia_uso_id: null });
  assert.equal(g.ok, true, (g.erros || []).join("|"));
  return { id, nota, g, args: g.args };
}
const noCofre = (db, p, meta) => admin(db, "insert into storage.objects (bucket_id, name, metadata) values ('familia', $1, $2::jsonb)", [p, JSON.stringify(meta)]);
const subir = async (db, p) => { for (const d of p.args.p_docs) await noCofre(db, d.path, { size: d.tamanho, mimetype: d.mime }); return p; };
/* o que o site manda como decisão: correspondência calculada pelo núcleo com os produtos e mercados que o banco tem */
async function decidir(db, nota) {
  const prods = await admin(db, "select id, nome, categoria, unidade from public.produtos"), mercs = await admin(db, "select id, nome, cnpj from public.mercados"), ap = {};
  (await admin(db, "select descricao, produto_id from public.itens where produto_id is not null")).forEach((x) => { ap[N.mkChave(x.descricao)] = x.produto_id; });
  return N.nfEntradaPayload(N.nfEntradaDecisoes(nota, prods, mercs, ap));
}
const confirmar = (db, uid, p, dec, aal) => como(db, uid, "select public.nota_fiscal_confirmar('doc', $1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb, false, $5::jsonb) as r",
  [JSON.stringify(p.args.p_nota), JSON.stringify(p.args.p_itens), JSON.stringify(p.args.p_docs), JSON.stringify(p.args.p_proc), JSON.stringify(dec)], aal).then((l) => l[0].r);
/* o fluxo completo do site: sobe o arquivo, decide, confirma */
async function fluxo(db, n, o = {}) { const p = await subir(db, pelo_site(n, o)); const dec = o.dec || await decidir(db, p.nota); return { ...p, dec, r: await confirmar(db, o.uid || R, p, dec, o.aal) }; }
const entrar = (db, uid, id, concordo, dec, aal) => como(db, uid, "select public.nota_fiscal_entrada_mercado($1, $2, $3::jsonb) as r", [id, concordo ?? false, dec ? JSON.stringify(dec) : null], aal).then((l) => l[0].r);
const entradaDe = async (db, id) => (await admin(db, "select * from public.notas_fiscais_entradas where nota_id = $1", [id]))[0];
const semDespesa = async (db) => assert.equal(await contar(db, "registros") + await contar(db, "pedidos") + await contar(db, "compras_online"), 0, "nenhuma despesa");

test("PGlite · confirmação única: UMA chamada grava a nota, registra o 'Estou de acordo' e lança a compra no Mercado (mercado, produtos, itens, vínculo), sem despesa e com a situação fiscal intacta", { skip: pular }, async () => {
  const db = await banco();
  const f = await fluxo(db, 1);
  assert.deepEqual([f.r.gravada, f.r.entrada.estado, f.r.entrada.itens, +f.r.entrada.total], [true, "concluida", 2, 25.5], JSON.stringify(f.r));
  const res = N.nfResultadoConfirmar(f.r, f.nota); assert.equal(res.estado, "concluida"); assert.match(res.texto, /Nota gravada na Central Fiscal \(autorizada\) e lançada no Mercado: 2 itens, total R\$ 25,50\. 2 produtos novos\./);
  const nf = (await admin(db, "select situacao, requer_conferencia, conferida_em from public.notas_fiscais where id = $1", [f.id]))[0]; assert.deepEqual([nf.situacao, nf.requer_conferencia, nf.conferida_em], ["autorizada", true, null], "foto: não é conferida na gravação");
  assert.equal(await contar(db, "notas_fiscais_itens", `nota_id = '${f.id}'`), 2); assert.equal(await contar(db, "notas_fiscais_docs", `nota_id = '${f.id}'`), 1);
  const en = await entradaDe(db, f.id); assert.deepEqual([en.estado, en.confirmado_por, en.user_id, en.tentativas, en.erro], ["concluida", R, R, 1, null]); assert.equal(en.mercado_nota_id, f.r.entrada.mercado_nota_id);
  const nm = (await admin(db, "select n.total, n.fonte, n.chave_nfce, m.nome, m.cnpj, to_char(n.data, 'YYYY-MM-DD') as d from public.notas n join public.mercados m on m.id = n.mercado_id where n.id = $1", [en.mercado_nota_id]))[0];
  assert.deepEqual([+nm.total, nm.fonte, nm.chave_nfce, nm.nome, nm.cnpj, nm.d], [25.5, "foto", chaveDe(1), "Mercado Exemplo", CNPJ, "2026-11-06"], "o estabelecimento sai sem LTDA e a compra leva a chave");
  const it = await admin(db, "select descricao, quantidade, unidade, valor_unitario, valor_total, produto_id from public.itens where nota_id = $1 order by descricao", [en.mercado_nota_id]);
  assert.deepEqual(it.map((x) => [x.descricao, +x.quantidade, x.unidade, +x.valor_unitario, +x.valor_total]), [["ITEM A", 2, "un", 10, 20], ["ITEM B", 1, "un", 5.5, 5.5]]); assert.ok(it.every((x) => x.produto_id));
  const v = await admin(db, "select modulo, registro_id, gera_despesa, valido from public.notas_fiscais_vinculos where nota_id = $1", [f.id]); assert.deepEqual([v.length, v[0].modulo, v[0].gera_despesa, v[0].valido, v[0].registro_id], [1, "mercado", false, true, en.mercado_nota_id]);
  await semDespesa(db); await db.close();
});

test("PGlite · correspondência: ≥ 70% reaproveita o produto existente (e o estabelecimento por CNPJ); < 70% e empate entre marcas criam produto novo, sem interromper a entrada", { skip: pular }, async () => {
  const db = await banco();
  await admin(db, `insert into public.mercados (user_id, nome, cnpj) values ('${R}', 'Mercado Antigo', '${CNPJ}')`);
  for (const [n, c, u] of [["Leite Integral Italac 1L", "Mercearia", "un"], ["Leite Integral Piracanjuba 1L", "Mercearia", "un"], ["Refrigerante Coca Cola 2L", "Bebidas", "un"], ["Arroz Tio João Tipo 1 5kg", "Mercearia", "un"], ["Item A", "Bebidas", "un"]])
    await admin(db, `insert into public.produtos (user_id, nome, categoria, unidade) values ('${R}', '${n}', '${c}', '${u}')`);
  const res = { itens: [{ descricao: "REFRIG COCA COLA 2L", qtd: 1, unidade: "UN", unitario: 9, total: 9, desconto: 0 },       // igual depois de normalizar → reaproveita
    { descricao: "LEITE INTEGRAL 1L", qtd: 1, unidade: "UN", unitario: 5, total: 5, desconto: 0 },                                // empate Italac × Piracanjuba (75 × 75) → ambíguo → novo
    { descricao: "REFRIG COCA COLA 200ML", qtd: 1, unidade: "UN", unitario: 3, total: 3, desconto: 0 },                           // tamanho diferente → novo
    { descricao: "ITEM A", qtd: 1, unidade: "UN", unitario: 8.5, total: 8.5, desconto: 0 }], total_produtos: 25.5, total: 25.5, valor_pago: 25.5 };
  const p = await subir(db, pelo_site(2, { res })), dec = await decidir(db, p.nota);
  assert.deepEqual(dec.itens.map((x) => x.tipo), ["exata", "nova", "nova", "exata"]); assert.equal(dec.mercado.tipo, "cnpj");
  const r = await confirmar(db, R, p, dec); assert.equal(r.entrada.estado, "concluida", JSON.stringify(r));
  assert.equal(await contar(db, "mercados"), 1, "o mercado do mesmo CNPJ foi reaproveitado"); assert.equal(await contar(db, "produtos"), 5 + 2, "dois produtos novos (o leite sem marca e a Coca de 200ml); os outros dois reaproveitaram");
  assert.equal(r.entrada.produtos_novos, 2);
  const ps = (await admin(db, "select i.descricao, p.nome from public.itens i join public.produtos p on p.id = i.produto_id order by i.descricao")).map((x) => [x.descricao, x.nome]);
  assert.deepEqual(ps, [["ITEM A", "Item A"], ["LEITE INTEGRAL 1L", "Leite Integral 1L"], ["REFRIG COCA COLA 200ML", "Refrigerante Coca Cola 200ml"], ["REFRIG COCA COLA 2L", "Refrigerante Coca Cola 2L"]]);
  assert.equal((await admin(db, "select categoria from public.itens where descricao = 'ITEM A'"))[0].categoria, "Bebidas", "reaproveitado leva a categoria do produto");
  await db.close();
});

test("PGlite · situação fiscal não impede a entrada: autorizada, pendente e contingência lançam a compra e a nota continua com a situação real; cancelada e rejeitada não gravam nem lançam nada", { skip: pular }, async () => {
  const db = await banco();
  for (const [n, sit, prot] of [[3, "autorizada", "131260000000001"], [4, "pendente", null], [5, "contingencia", null]]) {
    const f = await fluxo(db, n, { res: { situacao: sit, protocolo: prot, ...(sit === "contingencia" ? { chave: chaveDe(n, "2") } : {}) } });
    assert.equal(f.r.entrada.estado, "concluida", sit + " " + JSON.stringify(f.r)); assert.equal((await admin(db, "select situacao as s from public.notas_fiscais where id = $1", [f.id]))[0].s, sit === "contingencia" ? "contingencia" : sit);
    assert.match((await admin(db, "select observacao as o from public.notas where id = $1", [f.r.entrada.mercado_nota_id]))[0].o, new RegExp("Situação fiscal: " + (sit === "contingencia" ? "contingencia" : sit)));
  }
  assert.equal(await contar(db, "notas"), 3); assert.equal(await contar(db, "notas_fiscais_vinculos"), 3);
  for (const [n, sit] of [[6, "cancelada"], [7, "rejeitada"]]) {
    const p = await subir(db, pelo_site(n, { res: { situacao: sit, protocolo: null } })); const e = await falha(confirmar(db, R, p, await decidir(db, p.nota)));
    assert.match(e.message, new RegExp("nota " + sit + " não vale como compra; nada foi gravado"));
    assert.equal(await contar(db, "notas_fiscais", `id = '${p.id}'`), 0); assert.equal(await contar(db, "notas_fiscais_tentativas", `idem = '${idem(n)}'`), 0, "nem tentativa");
  }
  assert.equal(await contar(db, "notas"), 3, "nada novo no Mercado"); assert.equal(await contar(db, "notas_fiscais_entradas"), 3); await semDespesa(db); await db.close();
});

test("PGlite · integridade: reenvio após timeout, clique repetido e duas chamadas ao mesmo tempo criam UMA nota, UMA confirmação e UMA compra", { skip: pular }, async () => {
  const db = await banco(); const p = await subir(db, pelo_site(8)), dec = await decidir(db, p.nota);
  const a = await confirmar(db, R, p, dec); assert.equal(a.entrada.estado, "concluida");
  const b = await confirmar(db, R, p, dec);        // a resposta se perdeu e o site mandou a MESMA tentativa de novo
  assert.deepEqual([b.gravada, b.entrada.estado, b.entrada.ja_existia, b.entrada.mercado_nota_id], [true, "concluida", true, a.entrada.mercado_nota_id], JSON.stringify(b));
  assert.equal(await contar(db, "notas"), 1); assert.equal(await contar(db, "itens"), 2); assert.equal(await contar(db, "notas_fiscais_entradas"), 1); assert.equal(await contar(db, "notas_fiscais_vinculos"), 1); assert.equal(await contar(db, "produtos"), 2);
  const q = await subir(db, pelo_site(9)), dq = await decidir(db, q.nota);
  const r = await Promise.allSettled([confirmar(db, R, q, dq), confirmar(db, R, q, dq)]);
  assert.ok(r.every((x) => x.status === "fulfilled"), JSON.stringify(r.map((x) => x.reason?.message))); assert.equal(r.filter((x) => x.value.entrada.ja_existia === false).length, 1, "só uma criou a compra");
  assert.equal(await contar(db, "notas"), 2); assert.equal(await contar(db, "notas_fiscais", `id = '${q.id}'`), 1); assert.equal(await contar(db, "notas_fiscais_entradas", `nota_id = '${q.id}'`), 1); await semDespesa(db); await db.close();
});

test("PGlite · duplicidade: mesma chave em outro arquivo não grava nem lança de novo; chave que já está numa compra do Mercado liga a nota a ela e não cria outra compra", { skip: pular }, async () => {
  const db = await banco(); const a = await fluxo(db, 10);
  const q = await subir(db, pelo_site(10, { id: uuid(110), idem: idem(110) })), r = await confirmar(db, R, q, await decidir(db, q.nota));     // mesma chave, arquivo e id novos
  assert.deepEqual([r.gravada, r.fiscal.duplicada, r.fiscal.motivo, r.entrada.estado], [false, true, "chave", "concluida"], "informa que a nota que já existe tem entrada");
  const t = N.nfResultadoConfirmar(r, q.nota); assert.equal(t.estado, "duplicada"); assert.match(t.texto, /já está lançada no Mercado/);
  assert.equal(await contar(db, "notas_fiscais"), 1); assert.equal(await contar(db, "notas"), 1); assert.equal(await contar(db, "notas_fiscais_entradas"), 1);
  /* a chave já está numa compra do Mercado (feita pela tela do Mercado): liga e não cria */
  await admin(db, `insert into public.mercados (user_id, nome) values ('${R}', 'Qualquer')`); const m = (await admin(db, "select id from public.mercados limit 1"))[0].id;
  await admin(db, `insert into public.notas (user_id, mercado_id, data, total, chave_nfce, fonte) values ('${R}', '${m}', '2026-11-06', 25.5, '${chaveDe(11)}', 'foto')`);
  const c = await fluxo(db, 11), n0 = await contar(db, "notas");
  assert.deepEqual([c.r.gravada, c.r.entrada.estado], [true, "ja_no_mercado"], JSON.stringify(c.r)); assert.equal(await contar(db, "notas"), n0, "nenhuma compra nova");
  assert.equal((await admin(db, "select count(*)::int as n from public.notas_fiscais_vinculos where nota_id = $1 and valido", [c.id]))[0].n, 1);
  assert.match(N.nfResultadoConfirmar(c.r, c.nota).texto, /já estava no Mercado/); await semDespesa(db); await db.close();
});

test("PGlite · falha na gravação fiscal: sem o arquivo no cofre nada é gravado (nem nota, nem confirmação, nem compra); o clique pode ser repetido", { skip: pular }, async () => {
  const db = await banco(); const p = pelo_site(12), dec = await decidir(db, p.nota);       // NÃO sobe o arquivo
  const e = await falha(confirmar(db, R, p, dec)); assert.ok(e.message);
  for (const t of ["notas_fiscais", "notas_fiscais_itens", "notas_fiscais_entradas", "notas", "itens", "produtos", "mercados"]) assert.equal(await contar(db, t), 0, t);
  await subir(db, p); assert.equal((await confirmar(db, R, p, dec)).entrada.estado, "concluida", "depois de subir o arquivo, a mesma tentativa funciona"); await db.close();
});

test("PGlite · recuperação técnica: a falha do Mercado preserva a nota fiscal, o original e a confirmação (quem e quando); o estado fica 'falhou' com o erro; 'Tentar de novo' conclui SEM nova leitura nem nova confirmação; repetir não duplica a compra", async () => {
  const db = await banco();
  await admin(db, `insert into public.mercados (user_id, nome, cnpj) values ('${R}', 'Mercado Exemplo', '${CNPJ}')`); const m = (await admin(db, "select id from public.mercados limit 1"))[0].id;
  await admin(db, `insert into public.notas (user_id, mercado_id, data, numero, total, fonte) values ('${R}', '${m}', '2026-11-06', '13', 1, 'manual')`);       // mesmo número, data e mercado, sem chave: o índice do Mercado recusa
  const f = await fluxo(db, 13), doc = f.args.p_docs[0];
  /* 1) a falha aparece como pendência específica; a tela nunca diz que lançou */
  assert.deepEqual([f.r.gravada, f.r.entrada.estado], [true, "falhou"], JSON.stringify(f.r)); assert.match(f.r.entrada.erro, /já existe no Mercado uma compra com o mesmo número, data e estabelecimento/);
  const t = N.nfResultadoConfirmar(f.r, f.nota); assert.deepEqual([t.estado, t.gravada, t.tentar], ["mercado_pendente", true, true]); assert.match(t.texto, /Tentar de novo/); assert.ok(!/lançada no Mercado:/.test(t.texto), "nunca diz que lançou");
  /* 2) a nota fiscal e o ORIGINAL ficaram */
  assert.equal(await contar(db, "notas_fiscais", `id = '${f.id}'`), 1); assert.equal(await contar(db, "notas_fiscais_itens", `nota_id = '${f.id}'`), 2);
  const dd = await admin(db, "select path, sha256, tamanho from public.notas_fiscais_docs where nota_id = $1", [f.id]); assert.deepEqual([dd.length, dd[0].path, dd[0].sha256], [1, doc.path, doc.sha256], "o registro do original ficou");
  assert.equal((await admin(db, "select count(*)::int as n from storage.objects where bucket_id = 'familia' and name = $1", [doc.path]))[0].n, 1, "o arquivo continua no cofre");
  /* 3) a confirmação humana ficou, com usuário e horário, e o estado diz falhou com o erro */
  const en = await entradaDe(db, f.id); assert.deepEqual([en.estado, en.confirmado_por, en.user_id, en.tentativas], ["falhou", R, R, 1]); assert.ok(en.confirmado_em, "horário registrado"); assert.match(en.erro, /mesmo número, data e estabelecimento/); assert.equal(en.mercado_nota_id, null);
  const quando = en.confirmado_em.toISOString(), idEntrada = en.id;
  /* 4) nada sobrou no MERCADO (a nota e a confirmação ficam; a compra, os itens, os produtos e o vínculo não) */
  assert.equal(await contar(db, "notas"), 1, "só a compra manual de antes"); assert.equal(await contar(db, "itens"), 0); assert.equal(await contar(db, "produtos"), 0); assert.equal(await contar(db, "mercados"), 1); assert.equal(await contar(db, "notas_fiscais_vinculos"), 0);
  /* 5) a nota e a confirmação continuam disponíveis para a casa */
  for (const uid of [R, F]) { const v = await como(db, uid, "select e.estado, e.erro, n.situacao from public.notas_fiscais_entradas e join public.notas_fiscais n on n.id = e.nota_id where e.nota_id = $1", [f.id]); assert.deepEqual([v.length, v[0].estado, !!v[0].erro], [1, "falhou", true], uid); }
  /* 6) enquanto o problema existe, "Tentar de novo" falha de novo sem estragar nada nem refazer a confirmação */
  const ainda = await entrar(db, R, f.id); assert.equal(ainda.entrada.estado, "falhou"); const e2 = await entradaDe(db, f.id);
  assert.deepEqual([e2.tentativas, e2.confirmado_por, e2.confirmado_em.toISOString(), e2.id], [2, R, quando, idEntrada], "a confirmação original não muda"); assert.equal(await contar(db, "itens"), 0);
  /* 7) problema resolvido: "Tentar de novo" só pelo id da nota (sem p_concordo, sem decisões) conclui */
  await admin(db, "delete from public.notas where numero = '13'");
  const ok = await entrar(db, R, f.id); assert.deepEqual([ok.entrada.estado, ok.entrada.itens, ok.entrada.ja_existia], ["concluida", 2, false], JSON.stringify(ok));
  const e3 = await entradaDe(db, f.id); assert.deepEqual([e3.estado, e3.erro, e3.tentativas, e3.confirmado_por, e3.confirmado_em.toISOString(), e3.id], ["concluida", null, 3, R, quando, idEntrada], "mesma confirmação; sem nova leitura nem nova confirmação"); assert.equal(e3.mercado_nota_id, ok.entrada.mercado_nota_id);
  assert.equal(await contar(db, "notas_fiscais"), 1, "nenhuma leitura nova"); assert.equal(await contar(db, "notas_fiscais_docs"), 1); assert.equal((await admin(db, "select count(*)::int as n from storage.objects where bucket_id = 'familia'"))[0].n, 1, "nenhum arquivo novo");
  /* 8) repetir não duplica: de novo "Tentar de novo" e o reenvio do próprio "Estou de acordo" */
  const rep = await entrar(db, R, f.id); assert.deepEqual([rep.entrada.estado, rep.entrada.ja_existia, rep.entrada.mercado_nota_id], ["concluida", true, ok.entrada.mercado_nota_id]);
  const reenvio = await confirmar(db, R, f, f.dec); assert.deepEqual([reenvio.gravada, reenvio.entrada.estado, reenvio.entrada.ja_existia], [true, "concluida", true], JSON.stringify(reenvio));
  assert.equal(await contar(db, "notas"), 1); assert.equal(await contar(db, "itens"), 2); assert.equal(await contar(db, "notas_fiscais_entradas"), 1); assert.equal(await contar(db, "notas_fiscais_vinculos"), 1); assert.equal(await contar(db, "produtos"), 2);
  await semDespesa(db); await db.close();
});
test("PGlite · falha no MEIO do lançamento (depois de criar estabelecimento, produto, compra e o 1º item): tudo do Mercado volta, a nota e a confirmação ficam, e reenviar o 'Estou de acordo' conclui sem duplicar", { skip: pular }, async () => {
  const db = await banco();
  await execAdmin(db, `create function public.t_falha_item() returns trigger language plpgsql as $$ begin if new.descricao = 'ITEM B' then raise exception 'falha injetada no item B'; end if; return new; end $$;
    create trigger t_falha_item before insert on public.itens for each row execute function public.t_falha_item();`);
  const f = await fluxo(db, 40);
  assert.deepEqual([f.r.gravada, f.r.entrada.estado], [true, "falhou"], JSON.stringify(f.r)); assert.match(f.r.entrada.erro, /falha injetada no item B/);
  for (const t of ["mercados", "produtos", "notas", "itens", "notas_fiscais_vinculos"]) assert.equal(await contar(db, t), 0, t + ": nada ficou pela metade");
  assert.equal(await contar(db, "notas_fiscais", `id = '${f.id}'`), 1); assert.equal(await contar(db, "notas_fiscais_docs", `nota_id = '${f.id}'`), 1); const en = await entradaDe(db, f.id); assert.deepEqual([en.estado, en.confirmado_por, !!en.confirmado_em], ["falhou", R, true]);
  await admin(db, "drop trigger t_falha_item on public.itens");
  const re = await confirmar(db, R, f, f.dec);      // o reenvio do mesmo "Estou de acordo" (a tela repetiu a tentativa)
  assert.deepEqual([re.gravada, re.entrada.estado, re.entrada.itens], [true, "concluida", 2], JSON.stringify(re));
  assert.equal(await contar(db, "notas_fiscais"), 1); assert.equal(await contar(db, "notas_fiscais_entradas"), 1); assert.equal(await contar(db, "notas"), 1); assert.equal(await contar(db, "itens"), 2); assert.equal((await entradaDe(db, f.id)).confirmado_por, R);
  await semDespesa(db); await db.close();
});
test("PGlite · totais: frete e outras despesas são rateados nos itens e a soma dos itens fecha EXATAMENTE com o total pago; desconto do item vai em itens.desconto; g/ml viram kg/l", { skip: pular }, async () => {
  const db = await banco();
  const f = await fluxo(db, 14, { res: { total_produtos: 26, descontos: 0.5, frete: 3, outras: 1.1, total: 29.6, valor_pago: 29.6,
    itens: [{ descricao: "ARROZ TIPO 1 5KG", qtd: 1, unidade: "UN", unitario: 20, total: 20, desconto: 0.5 }, { descricao: "QUEIJO MUSSARELA", qtd: 300, unidade: "G", unitario: 0.02, total: 6, desconto: 0 }] } });
  assert.equal(f.r.entrada.estado, "concluida", JSON.stringify(f.r));
  const id = f.r.entrada.mercado_nota_id, it = await admin(db, "select descricao, quantidade, unidade, valor_unitario, valor_total, desconto from public.itens where nota_id = $1 order by descricao", [id]);
  assert.equal(+(it.reduce((s, x) => s + +x.valor_total, 0)).toFixed(2), 29.6, "Σ itens = total pago"); assert.equal(+(await admin(db, "select total from public.notas where id = $1", [id]))[0].total, 29.6);
  assert.deepEqual([it[1].unidade, +it[1].quantidade, +it[1].valor_unitario], ["kg", 0.3, 20], "300 g viram 0,3 kg a R$ 20/kg");
  assert.ok(+it[0].valor_total > 19.5, "o item levou a parte do frete e das outras despesas"); assert.ok(f.r.entrada.avisos.length === 1 && /rateada nos itens/.test(f.r.entrada.avisos[0]));
  await db.close();
});

test("PGlite · decisão ausente ou de outra casa nunca bloqueia: o banco cria o produto; nome com CPF é recusado", { skip: pular }, async () => {
  const db = await banco(); const p = await subir(db, pelo_site(15)), dec = await decidir(db, p.nota);
  dec.itens = [{ ordem: 0, produto_id: "5f1c2d3e-4a5b-4c6d-8e7f-999999999999", tipo: "aproximada", pontos: 90 }];       // produto que não existe/não é da casa; o item 2 nem tem decisão
  const r = await confirmar(db, R, p, dec); assert.equal(r.entrada.estado, "concluida", JSON.stringify(r)); assert.equal(await contar(db, "produtos"), 2); assert.equal(await contar(db, "itens"), 2);
  const q = await subir(db, pelo_site(16)), d2 = await decidir(db, q.nota); d2.itens[0] = { ordem: 0, novo: { nome: "Produto 529.982.247-25", categoria: "Mercearia", unidade: "un" }, tipo: "nova", pontos: 0 };
  const e = await confirmar(db, R, q, d2); assert.equal(e.entrada.estado, "concluida"); assert.equal(await contar(db, "produtos", "nome like '%529%'"), 0, "o nome com CPF não entrou"); await db.close();
});

test("PGlite · dados originais preservados: a entrada no Mercado não altera nota, itens, documentos nem a situação fiscal", { skip: pular }, async () => {
  const db = await banco(); const p = await subir(db, pelo_site(17));
  /* grava só a nota (função existente) e fotografa; depois confirma pela 059 com o MESMO id e idem: a nota e os itens têm de ficar idênticos */
  const retrato = async () => JSON.stringify([(await admin(db, "select * from public.notas_fiscais where id = $1", [p.id]))[0], await admin(db, "select * from public.notas_fiscais_itens where nota_id = $1 order by ordem", [p.id]), await admin(db, "select * from public.notas_fiscais_docs where nota_id = $1", [p.id])]);
  await como(db, R, "select public.nota_fiscal_salvar_doc($1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb) as r", [JSON.stringify(p.args.p_nota), JSON.stringify(p.args.p_itens), JSON.stringify(p.args.p_docs), JSON.stringify(p.args.p_proc)]);
  const antes = await retrato(); assert.equal(await contar(db, "notas_fiscais_entradas"), 0);
  const r = await confirmar(db, R, p, await decidir(db, p.nota)); assert.deepEqual([r.gravada, r.entrada.estado], [true, "concluida"], "mesma leitura já gravada: não é duplicidade, vira a confirmação");
  assert.equal(await retrato(), antes, "nada da nota fiscal mudou"); await db.close();
});

test("PGlite · nota antiga (gravada antes, sem confirmação): exige 'Estou de acordo' e decisões, e só então lança; XML autorizado também fica conferido", { skip: pular }, async () => {
  const db = await banco(); const p = await subir(db, pelo_site(18));
  await como(db, R, "select public.nota_fiscal_salvar_doc($1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb) as r", [JSON.stringify(p.args.p_nota), JSON.stringify(p.args.p_itens), JSON.stringify(p.args.p_docs), JSON.stringify(p.args.p_proc)]);
  const dec = await decidir(db, p.nota);
  assert.match((await falha(entrar(db, R, p.id))).message, /confirme com "Estou de acordo"/); assert.match((await falha(entrar(db, R, p.id, false, dec))).message, /Estou de acordo/);
  assert.match((await falha(entrar(db, R, p.id, true, null))).message, /decisões inválidas/); assert.equal(await contar(db, "notas"), 0); assert.equal(await contar(db, "notas_fiscais_entradas"), 0);
  const a = await entrar(db, R, p.id, true, dec); assert.equal(a.entrada.estado, "concluida", JSON.stringify(a)); assert.equal((await entradaDe(db, p.id)).confirmado_por, R);
  assert.equal((await admin(db, "select conferida_em as c from public.notas_fiscais where id = $1", [p.id]))[0].c, null, "foto antiga: a entrada não confere a nota");
  assert.match((await falha(entrar(db, R, "00000000-0000-4000-8000-000000000000", true, dec))).message, /não encontrada/); await db.close();
});

// ---------- XML ----------
function xmlDe(n, o = {}) {
  const b43 = "31" + "2611" + CNPJ + "55" + "001" + String(n).padStart(9, "0") + "1" + "12345678", chave = b43 + N.nfDvChave(b43);
  const xml = `<nfeProc><NFe><infNFe Id="NFe${chave}" versao="4.00"><ide><mod>55</mod><serie>1</serie><nNF>${n}</nNF><dhEmi>2026-11-06T10:00:00-03:00</dhEmi><tpEmis>1</tpEmis></ide>
<emit><CNPJ>${CNPJ}</CNPJ><xNome>LOJA EXEMPLO LTDA</xNome><enderEmit><UF>MG</UF></enderEmit></emit><dest><CPF>52998224725</CPF><xNome>CONSUMIDOR FICTICIO</xNome></dest>
<det nItem="1"><prod><cProd>10</cProd><xProd>PAPEL HIGIENICO EXEMPLO</xProd><qCom>1.0000</qCom><uCom>UN</uCom><vUnCom>13.29</vUnCom><vProd>13.29</vProd><vDesc>0.66</vDesc></prod></det>
<det nItem="2"><prod><cProd>11</cProd><xProd>SUCO EXEMPLO</xProd><qCom>2.0000</qCom><uCom>UN</uCom><vUnCom>6.00</vUnCom><vProd>12.00</vProd></prod></det>
<total><ICMSTot><vProd>25.29</vProd><vDesc>0.66</vDesc><vFrete>0.00</vFrete><vOutro>0.00</vOutro><vTotTrib>7.94</vTotTrib><vNF>24.63</vNF></ICMSTot></total>
<pag><detPag><tPag>03</tPag><vPag>24.63</vPag><card><tBand>02</tBand></card></detPag></pag></infNFe>${o.semProtocolo ? "" : `<protNFe><infProt><cStat>100</cStat><nProt>131260000000001</nProt><chNFe>${chave}</chNFe></infProt></protNFe>`}</NFe></nfeProc>`;
  return { xml, chave };
}
function xmlPelo_site(n, o = {}) {
  const x = xmlDe(n, o), lido = N.nfLerXML(x.xml), nota = N.nfNormalizar(lido), bytes = Buffer.from(x.xml), sha = createHash("sha256").update(bytes).digest("hex"), id = uuid(n + 500);
  const g = N.nfParaGravar(lido, nota, { id, dono: R, nome: "nota.xml", mime: "text/xml", tamanho: bytes.length, sha256: sha, conferir: true });
  assert.ok(g.ok, (g.erros || []).join(" ")); return { id, nota, args: g.args, path: g.args.p_docs[0].path, tamanho: bytes.length };
}
const confirmarXml = (db, uid, p, dec, aal) => como(db, uid, "select public.nota_fiscal_confirmar('xml', $1::jsonb, $2::jsonb, $3::jsonb, null, $4, $5::jsonb) as r", [JSON.stringify(p.args.p_nota), JSON.stringify(p.args.p_itens), JSON.stringify(p.args.p_docs), p.args.p_conferir, JSON.stringify(dec)], aal).then((l) => l[0].r);
test("PGlite · XML: autorizado, 'Estou de acordo' também CONFERE e congela a nota; pendente entra no Mercado e NÃO é conferido; a Fernanda (casa) confirma e fica registrada", { skip: pular }, async () => {
  const db = await banco();
  const a = xmlPelo_site(20); await noCofre(db, a.path, { size: a.tamanho, mimetype: "text/xml" }); const ra = await confirmarXml(db, R, a, await decidir(db, a.nota));
  assert.deepEqual([ra.gravada, ra.entrada.estado, ra.entrada.itens, +ra.entrada.total], [true, "concluida", 2, 24.63], JSON.stringify(ra));
  const na = (await admin(db, "select situacao, conferida_em, conferida_por from public.notas_fiscais where id = $1", [a.id]))[0]; assert.deepEqual([na.situacao, !!na.conferida_em, na.conferida_por], ["autorizada", true, R], "conferida: os dados originais congelam");
  assert.ok((await falha(como(db, R, "update public.notas_fiscais set valor_total = 1 where id = $1", [a.id]))).message, "nota conferida não muda");
  assert.equal(await contar(db, "notas", `chave_nfce = '${a.nota.chave}'`), 1); assert.equal((await admin(db, "select fonte as f from public.notas where chave_nfce = $1", [a.nota.chave]))[0].f, "qr");
  const b = xmlPelo_site(21, { semProtocolo: true }); await noCofre(db, b.path, { size: b.tamanho, mimetype: "text/xml" });
  const rb = await confirmarXml(db, F, b, await decidir(db, b.nota), "aal1");
  assert.deepEqual([rb.gravada, rb.entrada.estado], [true, "concluida"], JSON.stringify(rb)); assert.equal((await admin(db, "select situacao as s, conferida_em as c from public.notas_fiscais where id = $1", [b.id]))[0].c, null, "pendente: não conferido");
  assert.equal((await admin(db, "select situacao as s from public.notas_fiscais where id = $1", [b.id]))[0].s, "pendente");
  const en = await entradaDe(db, b.id); assert.deepEqual([en.confirmado_por, en.user_id], [F, R], "quem clicou fica registrado; a nota é da casa");
  await semDespesa(db); await db.close();
});

test("PGlite · nota cancelada ou rejeitada DEPOIS da entrada: a compra e o histórico ficam, e a compra é marcada para revisão", { skip: pular }, async () => {
  const db = await banco(); const f = await fluxo(db, 22), mid = f.r.entrada.mercado_nota_id;
  await como(db, R, "select public.nota_fiscal_atualizar_situacao($1, 'cancelada', null, 'cancelamento depois da entrada', 'manual') as r", [f.id]);
  assert.equal((await admin(db, "select situacao as s from public.notas_fiscais where id = $1", [f.id]))[0].s, "cancelada");
  const en = await entradaDe(db, f.id); assert.deepEqual([en.estado, en.revisar, en.mercado_nota_id], ["concluida", "nota_cancelada", mid]);
  assert.equal(await contar(db, "notas", `id = '${mid}'`), 1, "a compra foi mantida"); assert.equal(await contar(db, "itens", `nota_id = '${mid}'`), 2); assert.match((await admin(db, "select observacao as o from public.notas where id = $1", [mid]))[0].o, /REVISAR: a nota fiscal foi cancelada depois da entrada/);
  assert.equal((await admin(db, "select valido as v from public.notas_fiscais_vinculos where nota_id = $1", [f.id]))[0].v, false, "o vínculo fiscal é invalidado, o histórico fica");
  const est = N.nfEstadosNota({ situacao: "cancelada", formato_origem: "imagem" }, { estado: "concluida", confirmado_em: "2026-11-16", revisar: "nota_cancelada" }); assert.match(est.find((x) => x.chave === "mercado").rotulo, /revisar: nota cancelada depois da entrada/);
  const e = await falha(entrar(db, R, f.id)); assert.match(e.message, /cancelada não vale como compra/, "nota cancelada não gera entrada nova"); await db.close();
});

test("PGlite · acesso: casa lê a confirmação; estranho não vê nem grava; anônimo não executa; sem MFA nada passa; ninguém escreve direto na tabela; auditoria enxerga a tabela nova", { skip: pular }, async () => {
  const db = await banco(); const f = await fluxo(db, 23);
  assert.equal((await como(db, F, "select count(*)::int as n from public.notas_fiscais_entradas"))[0].n, 1, "a Fernanda lê"); assert.equal((await como(db, X, "select count(*)::int as n from public.notas_fiscais_entradas"))[0].n, 0, "estranho não vê");
  assert.ok((await falha(como(db, null, "select count(*) from public.notas_fiscais_entradas"))).message, "anon sem acesso à tabela");
  const p = await subir(db, pelo_site(24)), dec = await decidir(db, p.nota);
  assert.ok((await falha(como(db, null, "select public.nota_fiscal_confirmar('doc', $1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb, false, $5::jsonb)", [JSON.stringify(p.args.p_nota), JSON.stringify(p.args.p_itens), JSON.stringify(p.args.p_docs), JSON.stringify(p.args.p_proc), JSON.stringify(dec)]))).message, "anon não executa");
  assert.ok((await falha(confirmar(db, X, p, dec))).message, "estranho: o arquivo está na pasta de outra casa");
  assert.equal(await contar(db, "notas_fiscais", `id = '${p.id}'`), 0); assert.equal(await contar(db, "notas_fiscais_entradas"), 1);
  for (const [sql, a] of [["insert into public.notas_fiscais_entradas (nota_id, confirmado_por, estado, decisoes) values ($1, $2, 'concluida', '{}')", [f.id, R]], ["update public.notas_fiscais_entradas set estado = 'falhou'", []], ["delete from public.notas_fiscais_entradas", []]])
    for (const uid of [R, F]) assert.ok((await falha(como(db, uid, sql, a))).message, uid + " " + sql.slice(0, 30));
  assert.ok((await falha(como(db, R, "select public.nf_mercado_lancar($1, $2, '{}'::jsonb)", [R, f.id]))).message, "o ajudante interno não é chamável"); assert.ok((await falha(como(db, R, "select public.nf_entrada_processar($1)", [f.id]))).message);
  await admin(db, `insert into auth.mfa_factors values ('${R}', 'verified')`);
  assert.match((await falha(confirmar(db, R, p, dec, "aal1"))).message, /MFA/); assert.match((await falha(entrar(db, R, f.id, true, dec, "aal1"))).message, /MFA/);
  assert.equal((await como(db, R, "select count(*)::int as n from public.notas_fiscais_entradas", [], "aal1"))[0].n, 0, "a trava mfa vale também para ler");
  const est = (await como(db, R, "select public.seguranca_estado() as e", [], "aal2"))[0].e; assert.ok(!est.sem_trava_mfa.includes("notas_fiscais_entradas") && !est.sem_rls.includes("notas_fiscais_entradas") && !est.anon_le.includes("notas_fiscais_entradas"), JSON.stringify(est));
  assert.ok((await admin(db, "select pg_get_functiondef('public.seguranca_estado()'::regprocedure) as d"))[0].d.includes("'notas_fiscais_entradas'"), "a lista da trava mfa cita a tabela nova");
  assert.equal((await confirmar(db, R, p, dec, "aal2")).entrada.estado, "concluida", "com MFA em dia passa"); await db.close();
});

test("backup: notas_fiscais_entradas entra em SEG_TABELAS (exporta, não restaura), com a nota antes dela", () => {
  const nomes = N.SEG_TABELAS.map((d) => d.t), i = (t) => nomes.indexOf(t); assert.ok(i("notas_fiscais_entradas") > i("notas_fiscais"), "nota → entrada"); assert.ok(i("notas_fiscais_entradas") > i("notas"), "compra do Mercado antes");
  const d = N.segDef("notas_fiscais_entradas"); assert.equal(d.so, "exportar"); assert.deepEqual(JSON.parse(JSON.stringify(d.fk)), { nota_id: "notas_fiscais", mercado_nota_id: "notas" });
});

test("PGlite · casa (Fernanda) com a parte fiscal da 057: confirma nota de FOTO, a compra é da casa do dono e a confirmação fica no nome dela; sem a 057 só o dono grava foto (como hoje)", { skip: pular }, async () => {
  const sem = await banco(); const p0 = await subir(sem, pelo_site(30)), e0 = await falha(confirmar(sem, F, p0, await decidir(sem, p0.nota)));
  assert.match(e0.message, /só o dono da casa lê nota de foto ou PDF/, "sem a 057 a Fernanda não grava foto/PDF"); assert.equal(await contar(sem, "notas_fiscais_entradas"), 0); await sem.close();
  const db = await banco(); await db.exec(trecho("supabase/057_casa_radar_fiscal.sql", "-- 3) Central Fiscal", "end $$;")); await db.exec(trecho("supabase/057_casa_radar_fiscal.sql", "-- 3b)", "end $$;"));
  const p = await subir(db, pelo_site(31)), r = await confirmar(db, F, p, await decidir(db, p.nota), "aal1");
  assert.deepEqual([r.gravada, r.entrada.estado], [true, "concluida"], JSON.stringify(r));
  const en = await entradaDe(db, p.id); assert.deepEqual([en.user_id, en.confirmado_por], [R, F]); assert.equal((await admin(db, "select user_id as u from public.notas where id = $1", [en.mercado_nota_id]))[0].u, R, "a compra é da casa do dono");
  assert.equal((await como(db, R, "select count(*)::int as n from public.notas_fiscais_entradas"))[0].n, 1, "o dono vê o que ela confirmou");
  await admin(db, `insert into auth.mfa_factors values ('${F}', 'verified')`); const q = await subir(db, pelo_site(32));
  assert.match((await falha(confirmar(db, F, q, await decidir(db, q.nota), "aal1"))).message, /MFA/, "o MFA continua valendo para ela"); assert.equal((await confirmar(db, F, q, await decidir(db, q.nota), "aal2")).entrada.estado, "concluida");
  await semDespesa(db); await db.close();
});

test("PGlite · confiança baixa e campos não impressos (o que a tela agora permite): o banco de produção (037/039/059) aceita a confirmação humana (revisada = true, confiança real) e a compra entra; sem chave legível vira pendente fiscal; cancelada continua barrada", { skip: pular }, async () => {
  const db = await banco();
  const a = await fluxo(db, 50, { revisada: true, confianca: 0.62 });          // 62%, com chave: validada
  assert.deepEqual([a.r.gravada, a.r.entrada.estado], [true, "concluida"], JSON.stringify(a.r));
  const tent = (await admin(db, "select confianca, revisada, classe, resultado from public.notas_fiscais_tentativas where nota_id = $1", [a.id]))[0]; assert.deepEqual([+tent.confianca, tent.revisada, tent.classe, tent.resultado], [0.62, true, "consistente", "validada"], "o banco guarda a confiança REAL");
  const b = await fluxo(db, 51, { revisada: true, confianca: 0.45, res: { chave: null, total_produtos: null, descontos: null, frete: null, outras: null, protocolo: null, situacao: "pendente", itens: resposta(51).itens.map((i) => ({ ...i, desconto: 0 })) } });   // 45%, sem chave, nada de subtotal/desconto/frete impresso
  assert.deepEqual([b.r.gravada, b.r.entrada.estado], [true, "concluida"], JSON.stringify(b.r)); assert.equal(b.r.fiscal.resultado, "pendente_fiscal");
  const nb = (await admin(db, "select chave, situacao, valor_produtos, valor_descontos, valor_frete, valor_outras, valor_total from public.notas_fiscais where id = $1", [b.id]))[0]; assert.deepEqual([nb.chave, nb.situacao, nb.valor_produtos, nb.valor_descontos, nb.valor_frete, nb.valor_outras, +nb.valor_total], [null, "pendente", null, null, null, null, 25.5], "campos não impressos ficam nulos: nada inventado");
  assert.equal(+(await admin(db, "select n.total from public.notas n where n.id = $1", [b.r.entrada.mercado_nota_id]))[0].total, 25.5); assert.equal(await contar(db, "notas"), 2);
  const p = await subir(db, pelo_site(52, { revisada: true, confianca: 0.9, res: { situacao: "cancelada", protocolo: null } })); assert.match((await falha(confirmar(db, R, p, await decidir(db, p.nota)))).message, /cancelada não vale como compra/); assert.equal(await contar(db, "notas"), 2, "cancelada continua barrada");
  await semDespesa(db); await db.close();
});
