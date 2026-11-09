// Radar de Preços, Lote 1 (docs/radar.md): a migration 043 por texto e num Postgres de verdade dentro do Node (PGlite, sem rede e sem tocar no Supabase),
// o backup (SEG_TABELAS) e as funções puras rd* do núcleo. Tudo fictício. Sem IA, sem custo, sem coleta.
// O PGlite só existe no teste: no GitHub vem do testes.yml; aqui, RAC_PGLITE=<caminho do dist/index.js>.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const semComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
let PGlite = null;
try {
  const alvo = process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite";
  PGlite = (await import(alvo)).PGlite;
} catch (_) { /* sem PGlite: pula */ }
const pular = !PGlite;
test("no GitHub, o Postgres do teste (PGlite) está instalado", { skip: !process.env.CI }, () => assert.ok(PGlite, "PGlite não foi instalado no testes.yml"));

const SQL = ler("supabase/043_radar_precos.sql");
const TABELAS = ["radar_config", "radar_lojas", "radar_itens", "radar_ofertas", "radar_coletas", "radar_precos"];

/* ---------- texto do SQL ---------- */
test("043: número livre, aplicada em produção, sem tocar em 040/041/042 nem em dado existente", () => {
  const nums = [...fs.readdirSync(new URL("../supabase/", import.meta.url)), ...fs.readdirSync(new URL("../supabase/propostas/", import.meta.url))].filter((f) => /^\d{3}_.*\.sql$/.test(f)).map((f) => f.slice(0, 3));
  assert.equal(nums.filter((n) => n === "043").length, 1, "só uma migration 043");
  assert.ok(!/^-- status: pendente/.test(SQL), "já aplicada: sem a marca de pendente");
  assert.match(SQL.split("\n")[0], /^-- Aplicado em produção em 09\/11\/2026/);
  const s = semComent(SQL);
  assert.ok(!/\b(drop\s+table|truncate\s+table|delete\s+from|drop\s+column)\b/i.test(s), "nada destrutivo");
  assert.ok(!/\balter\s+table\s+public\.(?!radar_|%I)/i.test(s), "não altera tabela de outro módulo");
  assert.match(SQL, /begin;[\s\S]*commit;/);
});
test("043: RLS, só o dono, trava mfa e nada para anon em todas as tabelas do Radar", () => {
  assert.match(SQL, /foreach t in array array\['radar_config', 'radar_lojas', 'radar_itens', 'radar_ofertas', 'radar_coletas', 'radar_precos'\]/);
  for (const t of TABELAS) assert.match(SQL, new RegExp(`create table if not exists public\\.${t} \\(`));
  assert.match(SQL, /enable row level security/);
  assert.match(SQL, /create policy "so o dono" on public\.%I for all to authenticated\s+using \(dono = auth\.uid\(\) and not exists \(select 1 from public\.membros m where m\.membro = auth\.uid\(\)\)\)\s+with check \(dono = auth\.uid\(\) and not exists/);
  assert.match(SQL, /create policy "mfa" on public\.%I as restrictive for all to authenticated using \(\(select public\.rac_aal_ok\(\)\)\) with check \(\(select public\.rac_aal_ok\(\)\)\)/);
  assert.match(SQL, /revoke all on public\.%I from public, anon, authenticated/);
  assert.ok(!/grant[^;]*\banon\b/i.test(semComent(SQL).replace(/revoke[^;]*;/gi, "")), "nenhum grant para anon");
  assert.ok(!/grant[^;]*(update|delete)[^;]*radar_precos\b/i.test(semComent(SQL)), "histórico sem update/delete para o site");
  assert.ok(!/service_role/.test(semComent(SQL)), "nenhuma tabela do Radar para service_role neste lote");
  assert.match(SQL, /security_invoker = true/);
});
test("043: sem CEP, dado pessoal, chave ou link real no SQL, no doc, nos testes e nas funções rd*", () => {
  const rd = (ler("nucleo.js").match(/Radar de Preços, Lote 1[\s\S]*?(?=\n  raiz\.RACnucleo=)/) || [""])[0];
  assert.ok(rd.length > 1000, "trecho rd* encontrado");
  for (const [nome, t] of [["043", SQL], ["docs/radar.md", ler("docs/radar.md")], ["nucleo rd*", rd]]) {
    assert.ok(!/\d{5}-\d{3}/.test(t), nome + " tem um CEP formatado");
    assert.ok(!/\d{8}/.test(t), nome + " tem uma sequência de 8 dígitos (possível CEP)");
    assert.ok(!/(senha|password|secret|apikey|api_key|token)\s*[:=]\s*['"][^'"]{6,}/i.test(t), nome + " parece ter segredo");
  }
  assert.ok(!/\d{5}-\d{3}/.test(ler("tests/radar.test.mjs")), "o teste não tem CEP formatado");
  assert.ok(!/insert into public\.radar_config[\s\S]*'\d{8}'/.test(semComent(SQL)), "o SQL não insere CEP");
  assert.ok(!/https?:\/\/(?!claude\.com)[a-z0-9.-]+\.(com|br|net)\b/i.test(SQL), "o SQL não tem link de loja");
  assert.match(ler("docs/radar.md"), /<SEU_CEP_8_DIGITOS>/);
});
test("043: recria seguranca_estado() com as seis tabelas e sem perder nada da 038", () => {
  const f = /create or replace function public\.seguranca_estado\(\)[\s\S]*?end \$\$;/.exec(SQL)[0];
  const f38 = /create or replace function public\.seguranca_estado\(\)[\s\S]*?end \$\$;/.exec(ler("supabase/038_seguranca_estado_tentativas.sql"))[0];
  const lista = (x) => [...(/pessoais text\[\] := array\[([\s\S]*?)\];/.exec(x)[1].matchAll(/'([a-z_]+)'/g))].map((m) => m[1]);
  assert.deepEqual(lista(f), [...lista(f38).filter((t) => t !== "seguranca_eventos"), ...TABELAS, "seguranca_eventos"]);
  assert.equal(f.replace(/'radar_[a-z_]+',?\s*/g, "").replace(/\s+/g, ""), f38.replace(/\s+/g, "").replace(/,'seguranca_eventos'\]/, ",'seguranca_eventos']"));
  assert.match(SQL, /revoke all on function public\.seguranca_estado\(\) from public, anon;\s*grant execute on function public\.seguranca_estado\(\) to authenticated;/);
});
test("backup: as seis tabelas estão em SEG_TABELAS (só exportam), com pais antes dos filhos; seguranca.test as lista", () => {
  const nomes = N.SEG_TABELAS.map((d) => d.t);
  for (const t of TABELAS) { const d = N.segDef(t); assert.ok(d, t + " fora do SEG_TABELAS"); assert.equal(d.so, "exportar"); assert.equal(d.dono, "dono"); }
  for (const d of N.SEG_TABELAS) for (const pai of Object.values(d.fk || {})) assert.ok(nomes.indexOf(pai) >= 0 && nomes.indexOf(pai) < nomes.indexOf(d.t), `${pai} antes de ${d.t}`);
  const s = ler("tests/seguranca.test.mjs");
  for (const t of [...TABELAS, "radar_precos_final"]) assert.ok(s.includes(`"${t}"`), t + " fora do seguranca.test.mjs");
  /* o plano de restauração não escreve nenhuma (só exportar) */
  const j = { versao: 2, conta: "x", criado: "2026-11-09", tabelas: { radar_lojas: [{ id: "a", dono: "x", nome: "Loja" }] }, resumo: {} };
  const plano = N.segPlano(j, {}, "x");
  assert.equal(plano.total.soExportar, 1);
});
test("mapa, README e doc citam o Radar e a 043 como aplicada", () => {
  assert.match(ler("docs/mapa.md"), /Radar de Preços[^\n]*043_radar_precos\.sql[^\n]*aplicada em 09\/11\/2026/);
  assert.match(ler("README.md"), /043_radar_precos\.sql` foi \*\*aplicada em 09\/11\/2026\*\*/);
  assert.match(ler("docs/radar.md"), /Nada de IA, custo ou coleta neste lote/);
});

/* ---------- funções puras ---------- */
const obs = (extra = {}) => ({ id: "p" + Math.random(), oferta_id: "o1", modalidade: "a_vista", meio: "pix", fonte: "manual", evidencia: "print conferido", preco_produto: 100, frete_situacao: "confirmado", frete_valor: 10, taxas: 0, desconto: 0, disponibilidade: "disponivel", observado_em: "2026-11-01T12:00:00Z", ...extra });
test("rdCent e rdCep: dinheiro em centavos e CEP só no formato", () => {
  assert.equal(N.rdCent("R$ 1.234,56"), 123456); assert.equal(N.rdCent("12,5"), 1250); assert.equal(N.rdCent(0.1 + 0.2), 30); assert.equal(N.rdCent(null), null); assert.ok(Number.isNaN(N.rdCent("abc")));
  assert.equal(N.rdCep("1234" + "5678"), "12345678"); assert.equal(N.rdCep("1234" + "5-678"), "12345678"); assert.equal(N.rdCep("123"), ""); assert.equal(N.rdCep(null), "");
});
test("preço final = produto + frete confirmado + taxas − desconto; frete desconhecido não é grátis", () => {
  const f = N.rdPrecoFinal(obs({ preco_produto: 100, frete_valor: 19.9, taxas: 2.5, desconto: 12.4 }));
  assert.deepEqual([f.confirmado, f.final], [true, 110]);
  assert.equal(N.rdPrecoFinal(obs({ frete_situacao: "gratis_confirmado", frete_valor: 0 })).final, 100);
  assert.equal(N.rdPrecoFinal(obs({ frete_situacao: "retirada", frete_valor: 0 })).final, 100);
  const d = N.rdPrecoFinal(obs({ frete_situacao: "desconhecido", frete_valor: null }));
  assert.deepEqual([d.confirmado, d.final, d.motivo], [false, null, "frete_desconhecido"]);
  assert.equal(N.rdValidarPreco(obs({ frete_situacao: "desconhecido", frete_valor: 0 })).ok, false, "desconhecido com valor 0 seria tratar como grátis");
  assert.equal(N.rdPrecoFinal(obs({ disponibilidade: "indisponivel" })).motivo, "indisponivel");
  assert.equal(N.rdPrecoFinal(obs({ disponibilidade: "desconhecida" })).final, null);
  assert.equal(N.rdPrecoFinal(obs({ preco_produto: 10.1, frete_valor: 0.2, frete_situacao: "confirmado", taxas: 0.1 })).final, 10.4);
});
test("validação: modalidades separadas, parcelado fechando, dados inválidos", () => {
  const ok = (o) => N.rdValidarPreco(o).ok;
  assert.equal(ok(obs()), true);
  assert.equal(ok(obs({ parcelas: 3 })), false, "à vista com parcelas");
  assert.equal(ok(obs({ juros_mensal_pct: 0 })), false, "à vista com juros");
  const p = { modalidade: "parcelado", meio: "credito", preco_produto: 300, total_parcelado: 300, parcelas: 3, valor_parcela: 100, sem_juros: true };
  assert.equal(ok(obs(p)), true);
  assert.equal(ok(obs({ ...p, valor_parcela: 90 })), false, "parcelas não fecham");
  assert.equal(ok(obs({ ...p, parcelas: 1 })), false); assert.equal(ok(obs({ ...p, meio: "pix" })), false);
  assert.equal(ok(obs({ ...p, sem_juros: true, juros_mensal_pct: 1.5 })), false);
  assert.equal(ok(obs({ ...p, sem_juros: undefined })), false);
  assert.equal(ok(obs({ ...p, total_parcelado: 250 })), false, "preço do produto é o total parcelado");
  assert.equal(ok(obs({ ...p, preco_produto: 330, total_parcelado: 330, valor_parcela: 110, sem_juros: false, juros_mensal_pct: 3.2 })), true);
  assert.equal(ok(obs({ preco_produto: 0 })), false); assert.equal(ok(obs({ preco_produto: -5 })), false); assert.equal(ok(obs({ evidencia: "  " })), false); assert.equal(ok(obs({ fonte: "ia" })), false);
  assert.equal(ok(obs({ modalidade: "misto" })), false); assert.equal(ok(obs({ desconto: 500 })), false); assert.equal(ok(obs({ taxas: -1 })), false);
  assert.equal(ok(obs({ frete_situacao: "confirmado", frete_valor: 0 })), false); assert.equal(ok(obs({ frete_situacao: "gratis_confirmado", frete_valor: 5 })), false);
  const agora = Date.parse("2026-11-09T12:00:00Z");
  assert.equal(N.rdValidarPreco(obs({ observado_em: "2026-12-01T00:00:00Z" }), { agora }).ok, false, "data futura");
  assert.equal(N.rdValidarPreco(obs({ observado_em: "2026-11-09T11:00:00Z" }), { agora }).ok, true);
});
test("ranking: uma modalidade por vez, só equivalência confirmada e preço final confirmado; sem frete fica de fora", () => {
  const ofertas = [{ id: "o1", equivalencia: "confirmada", situacao: "ativa" }, { id: "o2", equivalencia: "confirmada", situacao: "ativa" }, { id: "o3", equivalencia: "confirmada", situacao: "ativa" },
    { id: "o4", equivalencia: "provavel", situacao: "ativa" }, { id: "o5", equivalencia: "confirmada", situacao: "pausada" }, { id: "o6", equivalencia: "confirmada", situacao: "ativa" }];
  const P = [obs({ id: "a", oferta_id: "o1", preco_produto: 100, frete_valor: 20 }),
    obs({ id: "b", oferta_id: "o2", preco_produto: 105, frete_situacao: "gratis_confirmado", frete_valor: 0 }),
    obs({ id: "c", oferta_id: "o3", preco_produto: 50, frete_situacao: "desconhecido", frete_valor: null }),
    obs({ id: "d", oferta_id: "o4", preco_produto: 10 }), obs({ id: "e", oferta_id: "o5", preco_produto: 10 }),
    obs({ id: "f", oferta_id: "o1", modalidade: "parcelado", meio: "credito", preco_produto: 90, total_parcelado: 90, parcelas: 3, valor_parcela: 30, sem_juros: true })];
  assert.equal(N.rdRanking(P, ofertas, {}).ok, false, "sem modalidade não há ranking misturado");
  const av = N.rdRanking(P, ofertas, { modalidade: "a_vista" });
  assert.deepEqual(av.ranking.map((r) => [r.oferta_id, r.final]), [["o2", 105], ["o1", 120]], "o3 (frete desconhecido) de 50 não vence");
  const fora = Object.fromEntries(av.fora.map((x) => [x.oferta_id, x.motivo]));
  assert.deepEqual(fora, { o3: "frete_desconhecido", o4: "equivalencia_nao_confirmada", o5: "oferta_inativa", o6: "sem_observacao" });
  const pa = N.rdRanking(P.map((x) => ({ ...x, disponibilidade: "disponivel" })), ofertas, { modalidade: "parcelado" });
  assert.deepEqual(pa.ranking.map((r) => [r.oferta_id, r.final, r.parcelas]), [["o1", 100, 3]], "o parcelado de o1 (90 + frete 10) não herda o à vista");
});
test("histórico: última observação por série, correção sem apagar, variação e janela sem inventar dados", () => {
  const A = obs({ id: "1", observado_em: "2026-10-01T10:00:00Z", preco_produto: 100 }), B = obs({ id: "2", observado_em: "2026-10-15T10:00:00Z", preco_produto: 90 }),
    C = obs({ id: "3", observado_em: "2026-11-01T10:00:00Z", preco_produto: 95 }), C2 = obs({ id: "4", observado_em: "2026-11-01T10:00:00Z", preco_produto: 85, corrige_id: "3" });
  assert.equal(N.rdUltimas([A, B, C]).length, 1); assert.equal(N.rdUltimas([A, B, C])[0].id, "3");
  assert.equal(N.rdUltimas([A, B, C, C2])[0].id, "4", "a correção substitui nas contas");
  assert.equal(N.rdVigentes([A, B, C, C2]).length, 3);
  assert.equal(N.rdUltimas([A, obs({ id: "z", modalidade: "parcelado", meio: "credito", preco_produto: 99, total_parcelado: 99, parcelas: 3, valor_parcela: 33, sem_juros: true, observado_em: "2026-11-05T00:00:00Z" })]).length, 2, "séries separadas");
  const v = N.rdVariacao([A, B]);
  assert.deepEqual([v.base, v.atual, v.anterior, v.diferenca, v.pct], ["final", 100, 110, -10, -9.09]);
  assert.equal(N.rdVariacao([A]).primeira, true); assert.equal(N.rdVariacao([]).ok, false);
  const agora = Date.parse("2026-11-09T00:00:00Z");
  const j30 = N.rdJanela([A, B, C2], 30, agora), j90 = N.rdJanela([A, B, C2], 90, agora);
  assert.deepEqual([j30.n, j30.minimo, j30.maximo, j30.atual, j30.noMinimo], [2, 95, 100, 95, true]);
  assert.deepEqual([j90.n, j90.minimo, j90.maximo], [3, 95, 110]);
  assert.deepEqual(N.rdJanela([A], 30, agora), { n: 0, suficiente: false }, "sem observações na janela: nada é inventado");
  assert.equal(N.rdJanela([A, B], 90, agora).suficiente, true);
});
test("equivalência: confirmada exige evidência e o dono; a IA só propõe", () => {
  const e = (o) => N.rdEquivalencia(o).ok;
  assert.equal(e({ equivalencia: "provavel", equivalencia_origem: "ia", evidencias: [] }), true);
  assert.equal(e({ equivalencia: "confirmada", equivalencia_origem: "dono", evidencias: [{ tipo: "gtin" }], confirmada_em: "2026-11-09" }), true);
  assert.equal(e({ equivalencia: "confirmada", equivalencia_origem: "dono", evidencias: [], confirmada_em: "2026-11-09" }), false, "sem evidência");
  assert.equal(e({ equivalencia: "confirmada", equivalencia_origem: "dono", evidencias: [{ tipo: "gtin" }] }), false, "sem a confirmação do dono");
  assert.equal(e({ equivalencia: "confirmada", equivalencia_origem: "ia", evidencias: [{ tipo: "titulo" }], confirmada_em: "2026-11-09" }), false, "a IA não confirma");
  assert.equal(e({ equivalencia: "talvez" }), false);
});

/* ---------- Postgres de verdade (PGlite) ---------- */
const R = "11111111-1111-4111-8111-111111111111", F = "22222222-2222-4222-8222-222222222222", X = "33333333-3333-4333-8333-333333333333", M = "44444444-4444-4444-8444-444444444444";
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
    insert into auth.users values ('${R}'), ('${F}'), ('${X}'), ('${M}');
    insert into auth.mfa_factors values ('${M}', 'verified');
    create schema storage; create table storage.buckets (id text primary key, name text, public boolean default false);
  `);
  await db.exec(trecho("supabase/002_casa_compartilhada.sql", "create table if not exists public.membros", "grant execute on function public.dono_da_casa() to authenticated;"));
  await db.exec(trecho("supabase/022_seguranca.sql", "create or replace function public.rac_aal_ok()", "grant execute on function public.rac_aal_ok() to authenticated;"));
  await db.exec(`insert into public.membros (membro, dono) values ('${F}', '${R}');`);
  await db.exec(SQL);
  return db;
}
async function como(db, uid, sql, params = [], aal = "aal1") {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, role: "authenticated", aal })]);
  await db.exec(uid ? "set role authenticated" : "set role anon");
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); }
}
const erro = async (prom) => { try { await prom; } catch (e) { return e; } assert.fail("deveria ter dado erro"); };
const L1 = "aaaaaaaa-0000-4000-8000-000000000001", I1 = "bbbbbbbb-0000-4000-8000-000000000001", O1 = "cccccccc-0000-4000-8000-000000000001";
async function semear(db) {
  await como(db, R, "insert into public.radar_lojas (id, nome) values ($1, 'Loja Exemplo')", [L1]);
  await como(db, R, "insert into public.radar_itens (id, nome, gtin, origem) values ($1, 'Produto Exemplo', '7891234567895', 'monitorado')", [I1]);
  await como(db, R, "insert into public.radar_ofertas (id, item_id, loja_id, url) values ($1, $2, $3, 'https://loja.exemplo/produto')", [O1, I1, L1]);
}
const preco = (db, uid, c = {}, aal) => {
  const d = { oferta_id: O1, fonte: "manual", evidencia: "print conferido", modalidade: "a_vista", meio: "pix", preco_produto: 100, frete_situacao: "confirmado", frete_valor: 10, taxas: 0, desconto: 0, disponibilidade: "disponivel", observado_em: "2026-11-01T12:00:00Z", ...c };
  const k = Object.keys(d);
  return como(db, uid, `insert into public.radar_precos (${k.join(",")}) values (${k.map((_, i) => "$" + (i + 1)).join(",")}) returning id`, k.map((x) => d[x]), aal);
};

test("PGlite · a 043 roda duas vezes sem erro e cria as seis tabelas com RLS ligado", { skip: pular }, async () => {
  const db = await banco(); await db.exec(SQL);
  const r = (await db.query("select relname, relrowsecurity from pg_class where relname like 'radar\\_%' and relkind = 'r' order by 1")).rows;
  assert.deepEqual(r.map((x) => x.relname), [...TABELAS].sort()); assert.ok(r.every((x) => x.relrowsecurity));
  for (const t of TABELAS) assert.equal((await db.query("select count(*)::int n from pg_policies where tablename = $1 and policyname in ('so o dono','mfa')", [t])).rows[0].n, 2, t);
  assert.equal((await db.query("select count(*)::int n from pg_policies where tablename like 'radar\\_%' and policyname = 'mfa' and permissive = 'RESTRICTIVE'")).rows[0].n, 6);
});
test("PGlite · anon não lê nem grava nada do Radar; nenhum privilégio de anon", { skip: pular }, async () => {
  const db = await banco(); await semear(db);
  for (const t of [...TABELAS, "radar_precos_final"]) {
    assert.equal((await db.query("select has_table_privilege('anon', $1, 'SELECT') a", ["public." + t])).rows[0].a, false, t);
    const e = await erro(como(db, null, `select * from public.${t}`)); assert.equal(e.code, "42501", t);
  }
  assert.equal((await erro(como(db, null, "insert into public.radar_itens (nome) values ('x')"))).code, "42501");
});
test("PGlite · só o dono: a Fernanda (membro) e outra conta não veem nem gravam; o dono sim", { skip: pular }, async () => {
  const db = await banco(); await semear(db); await preco(db, R);
  for (const t of TABELAS) assert.ok((await como(db, R, `select * from public.${t}`)).length >= (t === "radar_coletas" || t === "radar_config" ? 0 : 1), "dono vê " + t);
  for (const quem of [F, X]) {
    for (const t of [...TABELAS, "radar_precos_final"]) assert.deepEqual(await como(db, quem, `select * from public.${t}`), [], `${quem.slice(0, 2)} vê ${t}`);
  }
  /* membro da casa não grava nada; outra conta (que não é da casa) só enxerga o que for dela, nunca o do dono */
  assert.equal((await erro(como(db, F, "insert into public.radar_itens (nome) values ('intruso')"))).code, "42501");
  await como(db, X, "insert into public.radar_itens (nome) values ('do X')");
  assert.deepEqual((await como(db, X, "select nome from public.radar_itens")).map((r) => r.nome), ["do X"]);
  assert.ok(!(await como(db, R, "select nome from public.radar_itens")).some((r) => r.nome === "do X"));
  /* a Fernanda tenta gravar no nome do dono */
  assert.equal((await erro(como(db, F, "insert into public.radar_itens (nome, dono) values ('x', $1)", [R]))).code, "42501");
  assert.equal((await erro(preco(db, F))).code, "42501");
  /* ninguém muda o dono de uma linha */
  assert.equal((await erro(como(db, R, "update public.radar_itens set dono = $1", [X]))).code, "42501");
  assert.equal((await como(db, F, "select * from public.radar_config")).length, 0);
  assert.equal((await erro(como(db, F, "insert into public.radar_config (cep_padrao) values ('00000000')"))).code, "42501");
});
test("PGlite · trava MFA: com fator verificado, só vale com aal2", { skip: pular }, async () => {
  const db = await banco();
  await db.exec(`insert into public.membros select '${X}', '${R}' where false`);
  const ins = (aal) => como(db, M, "insert into public.radar_itens (nome) values ('Item MFA') returning id", [], aal);
  assert.equal((await erro(ins("aal1"))).code, "42501", "sem 2ª etapa é recusado");
  assert.equal((await ins("aal2")).length, 1);
  assert.deepEqual(await como(db, M, "select * from public.radar_itens", [], "aal1"), [], "aal1 não lê");
  assert.equal((await como(db, M, "select * from public.radar_itens", [], "aal2")).length, 1);
  /* quem não tem fator passa como hoje */
  assert.equal((await como(db, R, "insert into public.radar_itens (nome) values ('Sem fator') returning id", [], "aal1")).length, 1);
});
test("PGlite · integridade: cada filho aponta para o pai da mesma conta; nada some em cascata", { skip: pular }, async () => {
  const db = await banco(); await semear(db);
  /* outro dono tem um item; o dono não liga oferta a ele */
  await db.exec(`insert into public.radar_itens (id, dono, nome) values ('bbbbbbbb-0000-4000-8000-0000000000ff', '${X}', 'Item do outro')`);
  const e = await erro(como(db, R, "insert into public.radar_ofertas (item_id, loja_id) values ('bbbbbbbb-0000-4000-8000-0000000000ff', $1)", [L1]));
  assert.match(String(e.message), /violates foreign key|violates row-level/i);
  assert.ok(await erro(como(db, R, "insert into public.radar_ofertas (item_id, loja_id) values ('bbbbbbbb-0000-4000-8000-0000000000aa', $1)", [L1])), "item que não existe");
  await preco(db, R);
  assert.ok(await erro(como(db, R, "delete from public.radar_ofertas where id = $1", [O1])), "oferta com histórico não se apaga");
  assert.ok(await erro(como(db, R, "delete from public.radar_itens where id = $1", [I1])));
  assert.ok(await erro(como(db, R, "delete from public.radar_lojas where id = $1", [L1])));
  /* preço de oferta de outra conta */
  assert.ok(await erro(preco(db, X)), "X não grava preço na oferta do dono");
  /* GTIN e nome repetidos */
  assert.ok(await erro(como(db, R, "insert into public.radar_itens (nome, gtin) values ('Outro', '7891234567895')")), "GTIN repetido");
  assert.ok(await erro(como(db, R, "insert into public.radar_lojas (nome) values (' loja exemplo ')")), "loja repetida");
  assert.ok(await erro(como(db, R, "insert into public.radar_ofertas (item_id, loja_id, url) values ($1, $2, 'https://loja.exemplo/produto')", [I1, L1])), "mesma oferta repetida");
  assert.ok(await erro(como(db, R, "insert into public.radar_itens (nome, gtin) values ('Ruim', '123')")), "GTIN inválido");
  assert.ok(await erro(como(db, R, "insert into public.radar_ofertas (item_id, loja_id, url) values ($1, $2, 'http://inseguro.exemplo/x')", [I1, L1])), "só https");
  assert.ok(await erro(como(db, R, "insert into public.radar_config (cep_padrao) values ('123')")), "CEP com formato inválido");
  assert.ok(await erro(como(db, R, "insert into public.radar_itens (nome, origem) values ('x', 'inventado')")));
  assert.equal((await como(db, R, "insert into public.radar_config (cep_padrao) values ('00000000') returning id")).length, 1);
  assert.ok(await erro(como(db, R, "insert into public.radar_config (cep_padrao) values ('00000000')")), "um registro por dono");
});
test("PGlite · modalidades, frete, descontos e duplicidade no banco", { skip: pular }, async () => {
  const db = await banco(); await semear(db);
  assert.equal((await preco(db, R)).length, 1);
  const falha = async (c, msg) => { const e = await erro(preco(db, R, { observado_em: "2026-11-02T12:00:00Z", ...c })); assert.ok(e, msg); return e; };
  await falha({ parcelas: 3 }, "à vista não tem parcelas");
  await falha({ sem_juros: true }, "à vista não tem sem_juros");
  const parc = { modalidade: "parcelado", meio: "credito", preco_produto: 300, total_parcelado: 300, parcelas: 3, valor_parcela: 100, sem_juros: true };
  assert.equal((await preco(db, R, { ...parc, observado_em: "2026-11-02T12:00:00Z" })).length, 1);
  await falha({ ...parc, valor_parcela: 90 }, "parcelas × valor não fecha");
  await falha({ ...parc, parcelas: null }, "parcelado sem parcelas");
  await falha({ ...parc, meio: "pix" }, "parcelado no pix");
  await falha({ ...parc, juros_mensal_pct: 2 }, "sem juros com juros");
  await falha({ ...parc, total_parcelado: 250 }, "total diferente do preço");
  await falha({ frete_situacao: "desconhecido", frete_valor: 0 }, "frete desconhecido não vale 0");
  await falha({ frete_situacao: "desconhecido", frete_valor: 10 }, "frete desconhecido com valor");
  await falha({ frete_situacao: "confirmado", frete_valor: null }, "frete confirmado sem valor");
  await falha({ frete_situacao: "confirmado", frete_valor: 0 }, "frete confirmado grátis é outra situação");
  await falha({ frete_situacao: "gratis_confirmado", frete_valor: 5 }, "grátis com valor");
  await falha({ desconto: 500 }, "desconto maior que o total");
  await falha({ taxas: -1 }, "taxa negativa"); await falha({ preco_produto: 0 }, "preço zero"); await falha({ preco_produto: -1 }, "preço negativo");
  await falha({ evidencia: " " }, "sem evidência"); await falha({ fonte: "ia" }, "fonte desconhecida"); await falha({ modalidade: "misto" }, "modalidade");
  await falha({ disponibilidade: "talvez" }, "disponibilidade"); await falha({ meio: "cripto" }, "meio");
  await falha({ observado_em: "2099-01-01T00:00:00Z" }, "data futura");
  await falha({ observado_em: "2026-11-01T12:00:00Z" }, "duplicidade exata (mesma oferta, modalidade, meio, parcelas e instante)");
  /* frete desconhecido válido; mesmo instante em outra série (3x × 10x) é permitido */
  assert.equal((await preco(db, R, { observado_em: "2026-11-03T12:00:00Z", frete_situacao: "desconhecido", frete_valor: null })).length, 1);
  assert.equal((await preco(db, R, { ...parc, observado_em: "2026-11-02T12:00:00Z", parcelas: 10, valor_parcela: 30, sem_juros: false, juros_mensal_pct: 1.99 })).length, 1);
  /* registrado_em é sempre do servidor */
  const [r] = await como(db, R, "select registrado_em > now() - interval '1 minute' as agora from public.radar_precos limit 1"); assert.equal(r.agora, true);
  await preco(db, R, { observado_em: "2026-11-09T00:00:00Z", registrado_em: "2000-01-01T00:00:00Z" });
  assert.equal((await como(db, R, "select count(*)::int n from public.radar_precos where registrado_em < '2020-01-01'"))[0].n, 0);
});
test("PGlite · histórico só de acréscimo: sem update, sem delete, sem truncate; correção é nova linha", { skip: pular }, async () => {
  const db = await banco(); await semear(db);
  const [{ id }] = await preco(db, R);
  assert.equal((await erro(como(db, R, "update public.radar_precos set preco_produto = 1 where id = $1", [id]))).code, "42501", "sem privilégio de update");
  assert.equal((await erro(como(db, R, "delete from public.radar_precos where id = $1", [id]))).code, "42501", "sem privilégio de delete");
  /* mesmo com privilégio total (ex.: papel de manutenção), o gatilho recusa */
  assert.match(String((await erro(db.exec(`update public.radar_precos set preco_produto = 1 where id = '${id}'`))).message), /só recebe novas observações/);
  assert.match(String((await erro(db.exec(`delete from public.radar_precos where id = '${id}'`))).message), /só recebe novas observações/);
  assert.match(String((await erro(db.exec("truncate public.radar_precos"))).message), /não pode ser apagado/);
  const [c] = await preco(db, R, { corrige_id: id, preco_produto: 95, observado_em: "2026-11-01T12:00:01Z" });
  assert.equal((await como(db, R, "select count(*)::int n from public.radar_precos"))[0].n, 2, "a observação antiga continua");
  assert.equal((await como(db, R, "select preco_produto::float p from public.radar_precos where id = $1", [id]))[0].p, 100);
  assert.ok(await erro(como(db, R, "insert into public.radar_precos (oferta_id, corrige_id, fonte, evidencia, modalidade, preco_produto, observado_em) values ($1, $2, 'manual', 'x', 'a_vista', 1, '2026-11-04T00:00:00Z')", [O1, "dddddddd-0000-4000-8000-000000000000"])), "corrige_id de linha inexistente");
  /* excluir a própria conta continua possível (cascata do banco) */
  await db.exec(`delete from auth.users where id = '${R}'`);
  assert.equal((await db.query("select count(*)::int n from public.radar_precos")).rows[0].n, 0);
});
test("PGlite · view radar_precos_final: preço final vazio com frete desconhecido; some para quem não é o dono", { skip: pular }, async () => {
  const db = await banco(); await semear(db);
  await preco(db, R, { preco_produto: 100, frete_valor: 20, taxas: 3, desconto: 8.5, observado_em: "2026-11-01T00:00:00Z" });
  await preco(db, R, { frete_situacao: "desconhecido", frete_valor: null, preco_produto: 50, observado_em: "2026-11-02T00:00:00Z" });
  await preco(db, R, { disponibilidade: "indisponivel", observado_em: "2026-11-03T00:00:00Z" });
  await preco(db, R, { frete_situacao: "retirada", frete_valor: 0, preco_produto: 80, observado_em: "2026-11-04T00:00:00Z" });
  const v = await como(db, R, "select preco_produto::float p, preco_final::float f from public.radar_precos_final order by observado_em");
  assert.deepEqual(v.map((x) => [x.p, x.f]), [[100, 114.5], [50, null], [100, null], [80, 80]]);
  assert.deepEqual(await como(db, F, "select * from public.radar_precos_final"), []);
  /* a mesma conta que o núcleo faz */
  assert.equal(N.rdPrecoFinal(obs({ preco_produto: 100, frete_valor: 20, taxas: 3, desconto: 8.5 })).final, 114.5);
});
test("PGlite · equivalência: confirmada só com evidência e confirmação do dono; a IA não confirma", { skip: pular }, async () => {
  const db = await banco(); await semear(db);
  const set = (v, ev, em, origem) => como(db, R, "update public.radar_ofertas set equivalencia = $1, evidencias = $2::jsonb, confirmada_em = $3, equivalencia_origem = $4 where id = $5", [v, JSON.stringify(ev), em, origem, O1]);
  assert.equal((await erro(set("confirmada", [], "2026-11-09T00:00:00Z", "dono"))).code, "23514", "sem evidência");
  assert.equal((await erro(set("confirmada", [{ tipo: "gtin" }], null, "dono"))).code, "23514", "sem confirmação do dono");
  assert.equal((await erro(set("confirmada", [{ tipo: "titulo" }], "2026-11-09T00:00:00Z", "ia"))).code, "23514", "IA não confirma");
  await set("provavel", [{ tipo: "titulo" }], null, "ia");
  await set("confirmada", [{ tipo: "gtin", valor: "igual" }], "2026-11-09T00:00:00Z", "dono");
  assert.equal((await como(db, R, "select equivalencia from public.radar_ofertas"))[0].equivalencia, "confirmada");
  assert.ok(await erro(como(db, R, "update public.radar_ofertas set equivalencia = 'certeza'")));
});
test("PGlite · coletas: estrutura de execução e falha com validações", { skip: pular }, async () => {
  const db = await banco(); await semear(db);
  assert.equal((await como(db, R, "insert into public.radar_coletas (loja_id, origem) values ($1, 'piloto') returning id", [L1])).length, 1);
  assert.ok(await erro(como(db, R, "insert into public.radar_coletas (status) values ('falha')")), "falha sem código do erro");
  assert.ok(await erro(como(db, R, "insert into public.radar_coletas (status) values ('ok')")), "concluída sem hora de término");
  assert.ok(await erro(como(db, R, "insert into public.radar_coletas (status, iniciada_em, terminada_em) values ('ok', now(), now() - interval '1 hour')")), "término antes do início");
  assert.equal((await como(db, R, "insert into public.radar_coletas (status, erro_codigo, terminada_em) values ('falha', 'sem_resposta', now()) returning id")).length, 1);
  assert.ok(await erro(como(db, R, "insert into public.radar_coletas (origem) values ('ia')")), "origem desconhecida");
});
test("PGlite · seguranca_estado() enxerga a falta da trava mfa em tabela do Radar e não lista nada de anon", { skip: pular }, async () => {
  const db = await banco();
  const estado = async () => (await como(db, R, "select public.seguranca_estado() e"))[0].e;
  let e = await estado();
  assert.deepEqual(e.sem_trava_mfa.filter((t) => t.startsWith("radar_")), []); assert.deepEqual(e.sem_rls, []);
  assert.deepEqual(e.anon_le.filter((t) => t.startsWith("radar_")), []);
  await db.exec('drop policy "mfa" on public.radar_precos');
  e = await estado(); assert.deepEqual(e.sem_trava_mfa.filter((t) => t.startsWith("radar_")), ["radar_precos"]);
  assert.equal((await erro(como(db, null, "select public.seguranca_estado()"))).code, "42501");
});
