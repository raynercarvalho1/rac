// O SQL 024 e o 027 (pedido_salvar) rodando num Postgres de verdade, dentro do Node (PGlite), sem rede e sem tocar no Supabase:
// criar e editar numa operação só, erro no meio desfaz tudo, a casa (Rayner e Fernanda) e mais ninguém, a trava da 2ª etapa,
// campos protegidos, itens inválidos, pedidos antigos e a restauração do backup (docs/alimentacao.md).
// O ambiente imita o Supabase: papéis anon/authenticated, o EXECUTE e o ALL que o Supabase dá a anon por padrão, auth.uid()/auth.jwt()
// e as funções dono_da_casa() (002) e rac_aal_ok() (022) copiadas dos próprios arquivos. Dados fictícios.
// O PGlite só existe no teste (o site não tem dependências): no GitHub vem do testes.yml; aqui, com RAC_PGLITE=<caminho do pacote>.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
let PGlite = null;
try {
  const alvo = process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite";
  PGlite = (await import(alvo)).PGlite;
} catch (_) { /* sem PGlite: pula */ }
const pular = !PGlite;

test("no GitHub, o Postgres do teste (PGlite) está instalado", { skip: !process.env.CI }, () => assert.ok(PGlite, "PGlite não foi instalado no testes.yml"));

const R = "11111111-1111-4111-8111-111111111111", F = "22222222-2222-4222-8222-222222222222", X = "33333333-3333-4333-8333-333333333333";
const trecho = (arq, ini, fim) => { const t = ler(arq), i = t.indexOf(ini); assert.ok(i >= 0, ini); return t.slice(i, t.indexOf(fim, i) + fim.length); };

async function banco() {
  const db = await PGlite.create();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    /* o que o Supabase faz em todo objeto novo do schema public: é por isso que os .sql tiram o acesso de anon */
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    create schema auth; grant usage on schema auth to anon, authenticated, service_role;
    create table auth.users (id uuid primary key);
    create table auth.mfa_factors (user_id uuid, status text);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub', '')::uuid $$;
    insert into auth.users values ('${R}'), ('${F}'), ('${X}');
  `);
  /* a casa e a trava da 2ª etapa: o texto real dos arquivos 002 e 022 */
  await db.exec(trecho("supabase/002_casa_compartilhada.sql", "create table if not exists public.membros", "grant execute on function public.dono_da_casa() to authenticated;"));
  await db.exec(trecho("supabase/022_seguranca.sql", "create or replace function public.rac_aal_ok()", "grant execute on function public.rac_aal_ok() to authenticated;"));
  await db.exec(`
    insert into public.membros (membro, dono) values ('${F}', '${R}');
    create table public.produtos (id uuid primary key default gen_random_uuid(), user_id uuid not null default public.dono_da_casa(), nome text not null);
    alter table public.produtos enable row level security;
    create policy "casa" on public.produtos for all to authenticated using (user_id = public.dono_da_casa()) with check (user_id = public.dono_da_casa());
    create policy "mfa" on public.produtos as restrictive for all to authenticated using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok()));
    insert into public.produtos (id, user_id, nome) values ('aaaaaaaa-0000-4000-8000-00000000000a', '${R}', 'Coca-Cola 2L'), ('bbbbbbbb-0000-4000-8000-00000000000b', '${X}', 'Outro');
    create view public.compras as select null::uuid id, null::uuid user_id, null::date data, null::text mercado, null::text categoria, null::text produto,
      null::numeric valor_total, null::numeric desconto where false;
  `);
  await db.exec(ler("supabase/024_alimentacao.sql"));
  await db.exec(ler("supabase/027_pedido_salvar.sql"));
  return db;
}
/* uma chamada como alguém logado (o mesmo que o PostgREST faz: papel + claims do JWT) */
async function como(db, uid, sql, params = [], aal = "aal1") {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, role: "authenticated", aal })]);
  await db.exec(uid ? "set role authenticated" : "set role anon");
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); }
}
const salvar = (db, uid, p, itens, novo, aal) => como(db, uid, "select public.pedido_salvar($1::jsonb, $2::jsonb, $3) as r", [JSON.stringify(p), JSON.stringify(itens), novo], aal).then((l) => l[0].r);
const erro = async (prom) => { try { await prom; } catch (e) { return e; } assert.fail("deveria ter dado erro"); };
const tudo = async (db) => ({ pedidos: (await db.query("select * from public.pedidos order by id")).rows, itens: (await db.query("select * from public.pedido_itens order by pedido_id, ordem")).rows });

const ID = "c0ffee00-0000-4000-8000-000000000001";
const ped = (extra = {}) => ({ id: ID, data: "2026-10-30", hora: "20:15", estabelecimento: "Pizzaria Exemplo", plataforma: "ifood", modo: "delivery", numero: "1234",
  pagamento: "Crédito", subtotal: 73.9, taxa_entrega: 7.99, taxa_servico: 0.99, gorjeta: 5, desconto_loja: 0, desconto_plataforma: 10, total_pago: 77.88,
  observacoes: null, arquivos: [], origem: "manual", ...extra });
const its = () => [{ descricao: "Pizza grande", qtd: 1, total: 59.9, desconto: 0, observacao: "sem cebola", produto_id: null },
  { descricao: "Coca-Cola 2L", qtd: 2, total: 14, desconto: 0, observacao: null, produto_id: "aaaaaaaa-0000-4000-8000-00000000000a" }];
const semOrigem = (p) => { const o = { ...p }; delete o.origem; return o; };
/* os mesmos itens sem o produto do Mercado: quem não enxerga a casa já pararia no "produto não encontrado" (também recusado) */
const itsSemProduto = () => its().map((i) => ({ ...i, produto_id: null }));

test("contrato com a tela: o pedido exatamente como js/alimentacao.js manda (capturado no navegador) é aceito, novo e na edição", { skip: pular }, async () => {
  const db = await banco();
  const p = { arquivos: [], data: "2026-11-01", desconto_loja: 0, desconto_plataforma: 0, estabelecimento: "Padaria Exemplo", gorjeta: 0, hora: null,
    id: "d5c5bbff-5e48-486b-843b-4d96b041164c", modo: "no_local", numero: null, observacoes: null, origem: "manual", pagamento: null, plataforma: "direto",
    subtotal: 42.5, taxa_entrega: 0, taxa_servico: 0, total_pago: 42.5 };
  const i = [{ desconto: 0, descricao: "Pão na chapa e café", observacao: null, produto_id: null, qtd: 1, total: 42.5 }];
  assert.equal((await salvar(db, F, p, i, true)).criado, true);
  /* na edição a tela manda o mesmo, sem origem, com as fotos que vieram do banco */
  const ed = semOrigem({ ...p, observacoes: "com troco" });
  assert.equal((await salvar(db, F, ed, i, false)).criado, false);
  assert.equal((await tudo(db)).pedidos[0].observacoes, "com troco");
});

test("criar: pedido e itens numa chamada, na casa do dono, com quem criou, origem e unitário derivado; toque duplo não grava de novo", { skip: pular }, async () => {
  const db = await banco();
  assert.deepEqual(await salvar(db, R, ped(), its(), true), { id: ID, criado: true, ja_existia: false });
  const { pedidos, itens } = await tudo(db);
  assert.equal(pedidos.length, 1); const p = pedidos[0];
  assert.equal(p.user_id, R); assert.equal(p.criado_por, R); assert.equal(p.origem, "manual"); assert.equal(+p.total_pago, 77.88); assert.deepEqual(p.versoes, []);
  assert.equal(p.atualizado_em, null);
  assert.deepEqual(itens.map((i) => [i.ordem, i.descricao, +i.qtd, +i.unitario, +i.total, i.user_id]), [[0, "Pizza grande", 1, 59.9, 59.9, R], [1, "Coca-Cola 2L", 2, 7, 14, R]]);
  assert.deepEqual(await salvar(db, R, ped(), its(), true), { id: ID, criado: false, ja_existia: true });
  assert.equal((await tudo(db)).itens.length, 2, "o toque duplo não duplicou os itens");
  /* a Fernanda lança na casa do Rayner (user_id do dono, criado_por dela) */
  const id2 = "c0ffee00-0000-4000-8000-000000000002";
  await salvar(db, F, ped({ id: id2, numero: "5678" }), its(), true);
  const p2 = (await db.query("select user_id, criado_por from public.pedidos where id = $1", [id2])).rows[0];
  assert.deepEqual([p2.user_id, p2.criado_por], [R, F]);
});

test("editar: troca campos e itens numa operação, guarda a versão anterior no banco e não mexe em dono, autor, criação e origem", { skip: pular }, async () => {
  const db = await banco();
  await salvar(db, R, ped(), its(), true);
  const antes = (await tudo(db)).pedidos[0];
  /* a Fernanda (casa) edita o pedido do Rayner: um item só, sem gorjeta */
  const r = await salvar(db, F, semOrigem(ped({ subtotal: 59.9, gorjeta: 0, total_pago: 58.88, observacoes: "corrigido" })), [its()[0]], false);
  assert.deepEqual(r, { id: ID, criado: false, ja_existia: false });
  const { pedidos, itens } = await tudo(db), p = pedidos[0];
  assert.equal(+p.total_pago, 58.88); assert.equal(p.observacoes, "corrigido"); assert.ok(p.atualizado_em);
  assert.deepEqual([p.user_id, p.criado_por, String(p.criado_em), p.origem], [antes.user_id, antes.criado_por, String(antes.criado_em), antes.origem]);
  assert.deepEqual(itens.map((i) => i.descricao), ["Pizza grande"]);
  assert.equal(p.versoes.length, 1); const v = p.versoes[0];
  assert.equal(v.total_pago, 77.88); assert.equal(v.gorjeta, 5); assert.equal(v.numero, "1234"); assert.ok(!("observacoes" in v), "nulos ficam fora, como em alVersao");
  assert.deepEqual(v.itens, [{ descricao: "Pizza grande", qtd: 1, total: 59.9 }, { descricao: "Coca-Cola 2L", qtd: 2, total: 14 }]);
  /* guarda as 10 últimas */
  for (let i = 0; i < 12; i++) await salvar(db, R, semOrigem(ped({ subtotal: 59.9, gorjeta: 0, total_pago: 58.88, observacoes: "v" + i })), [its()[0]], false);
  const vs = (await tudo(db)).pedidos[0].versoes;
  assert.equal(vs.length, 10); assert.equal(vs[9].observacoes, "v10", "a mais nova fica por último");
});

test("falha no meio da gravação desfaz tudo: o pedido e os itens continuam exatamente como estavam", { skip: pular }, async () => {
  const db = await banco();
  await salvar(db, R, ped(), its(), true);
  const antes = await tudo(db);
  /* a edição passa na conferência, atualiza o pedido e apaga os itens; o item longo demais só é recusado pela tabela, no fim */
  const e = await erro(salvar(db, R, semOrigem(ped({ subtotal: 59.9, gorjeta: 0, total_pago: 58.88 })), [{ ...its()[0], descricao: "x".repeat(161) }], false));
  assert.equal(e.code, "23514", e.message);
  assert.deepEqual(await tudo(db), antes, "nada mudou: nem o pedido, nem os itens");
  /* pedido novo com item recusado pela tabela: o pedido também não fica */
  const e2 = await erro(salvar(db, R, ped({ id: "c0ffee00-0000-4000-8000-000000000003", numero: "9" }), [{ ...its()[0], observacao: "y".repeat(301) }, its()[1]], true));
  assert.equal(e2.code, "23514");
  assert.deepEqual(await tudo(db), antes);
  /* conta que não fecha: a regra do banco recusa e nada entra */
  const e3 = await erro(salvar(db, R, ped({ id: "c0ffee00-0000-4000-8000-000000000004", numero: "10", total_pago: 80 }), its(), true));
  assert.equal(e3.code, "23514"); assert.match(e3.message, /pedidos_conta_fecha/);
  /* número repetido na mesma plataforma: recusado (23505) e nada entra */
  const e4 = await erro(salvar(db, R, ped({ id: "c0ffee00-0000-4000-8000-000000000005", numero: "01234" }), its(), true));
  assert.equal(e4.code, "23505"); assert.match(e4.message, /pedidos_numero_unico/);
  assert.deepEqual(await tudo(db), antes);
});

test("quem não é da casa: não acha o pedido, não edita, não lança na casa dos outros; sem login nem executa", { skip: pular }, async () => {
  const db = await banco();
  await salvar(db, R, ped(), its(), true);
  const antes = await tudo(db);
  const e = await erro(salvar(db, X, semOrigem(ped({ observacoes: "invasão" })), itsSemProduto(), false));
  assert.equal(e.code, "P0002", e.message); assert.match(e.message, /pedido não encontrado/);
  /* tentar "criar" com o id do pedido de outra casa: a chave primária recusa, o pedido original fica */
  const e2 = await erro(salvar(db, X, ped({ numero: "777" }), itsSemProduto(), true));
  assert.equal(e2.code, "23505"); assert.match(e2.message, /pedidos_pkey/);
  assert.deepEqual(await tudo(db), antes);
  assert.deepEqual(await como(db, X, "select count(*)::int as n from public.pedidos"), [{ n: 0 }], "não enxerga nada da casa do Rayner");
  /* o estranho lança o dele: vai para a casa dele, nunca para a do Rayner */
  const idx = "c0ffee00-0000-4000-8000-0000000000ff";
  await salvar(db, X, ped({ id: idx, numero: null }), itsSemProduto(), true).catch((err) => assert.fail(err.message));
  assert.equal((await db.query("select user_id from public.pedidos where id = $1", [idx])).rows[0].user_id, X);
  /* produto de outra casa não entra (a chave estrangeira sozinha deixaria) */
  const e3 = await erro(salvar(db, R, ped({ id: "c0ffee00-0000-4000-8000-000000000006", numero: "11" }), [{ ...its()[1], produto_id: "bbbbbbbb-0000-4000-8000-00000000000b" }, its()[0]], true));
  assert.match(e3.message, /produto não encontrado no item 1/);
  /* sem login: o Supabase daria EXECUTE a anon por padrão; o 027 tira */
  const e4 = await erro(salvar(db, null, ped({ id: "c0ffee00-0000-4000-8000-000000000007" }), its(), true));
  assert.equal(e4.code, "42501"); assert.match(e4.message, /permission denied for function pedido_salvar/);
  const acl = (await db.query("select proacl::text as a, prosecdef from pg_proc where proname = 'pedido_salvar'")).rows[0];
  assert.equal(acl.prosecdef, false, "security invoker"); assert.ok(!/(^|[{,])=X|anon=X/.test(acl.a), acl.a); assert.match(acl.a, /authenticated=X/);
});

test("trava da 2ª etapa: quem tem o código ativado precisa ter passado por ele (aal2); a Fernanda sem código continua lançando", { skip: pular }, async () => {
  const db = await banco();
  await db.exec(`insert into auth.mfa_factors values ('${R}', 'verified')`);
  const e = await erro(salvar(db, R, ped(), itsSemProduto(), true, "aal1"));
  assert.equal(e.code, "42501", e.message); assert.match(e.message, /row-level security/);
  assert.deepEqual((await tudo(db)).pedidos, []);
  await salvar(db, R, ped(), itsSemProduto(), true, "aal2");
  /* edição com aal1 também não passa (nem acha o pedido) */
  const e2 = await erro(salvar(db, R, semOrigem(ped({ observacoes: "x" })), itsSemProduto(), false, "aal1"));
  assert.equal(e2.code, "P0002");
  await salvar(db, F, ped({ id: "c0ffee00-0000-4000-8000-000000000008", numero: "2" }), itsSemProduto(), true, "aal1");
  assert.equal((await tudo(db)).pedidos.length, 2);
});

test("campos protegidos: dono, autor, criação, versões e origem não vêm do site; nem por UPDATE direto na tabela", { skip: pular }, async () => {
  const db = await banco();
  await salvar(db, R, ped(), its(), true);
  const antes = await tudo(db);
  for (const [k, v] of [["user_id", X], ["criado_por", X], ["criado_em", "2020-01-01T00:00:00Z"], ["versoes", []], ["atualizado_em", "2020-01-01T00:00:00Z"], ["qualquer", 1]]) {
    const e = await erro(salvar(db, F, { ...semOrigem(ped()), [k]: v }, its(), false));
    assert.equal(e.code, "22023"); assert.match(e.message, new RegExp("campo não permitido no pedido: " + k));
  }
  assert.match((await erro(salvar(db, F, ped({ origem: "ia" }), its(), false))).message, /a origem não muda na edição/);
  for (const k of ["id", "pedido_id", "user_id", "ordem", "unitario"])
    assert.match((await erro(salvar(db, R, semOrigem(ped()), [{ ...its()[0], [k]: k === "ordem" ? 0 : ID }, its()[1]], false))).message, new RegExp("campo não permitido no item 1: " + k));
  assert.deepEqual(await tudo(db), antes);
  /* UPDATE direto pela API (sem a função): os quatro campos ficam como estavam; o resto muda (a casa pode editar, como hoje) */
  await como(db, F, `update public.pedidos set user_id = '${F}', criado_por = '${F}', criado_em = '2020-01-01', origem = 'ia', observacoes = 'direto' where id = '${ID}'`);
  const p = (await tudo(db)).pedidos[0];
  assert.deepEqual([p.user_id, p.criado_por, String(p.criado_em), p.origem, p.observacoes], [R, R, String(antes.pedidos[0].criado_em), "manual", "direto"]);
});

test("itens e campos inválidos são recusados antes de gravar qualquer coisa", { skip: pular }, async () => {
  const db = await banco();
  const casos = [
    [ped(), [], /pelo menos um item/], [ped(), {}, /pelo menos um item/], [ped(), null, /pelo menos um item/],
    [ped(), [{ ...its()[0], qtd: 0 }], /quantidade inválida no item 1/], [ped(), [{ ...its()[0], qtd: 1001 }], /quantidade inválida/],
    [ped(), [{ ...its()[0], total: -1 }], /total inválido no item 1/], [ped(), [{ ...its()[0], total: "59.90" }], /falta o total do item 1/],
    [ped(), [{ ...its()[0], total: 59.901 }], /total inválido/], [ped(), [{ ...its()[0], desconto: 60 }], /desconto inválido no item 1/],
    [ped(), [{ ...its()[0], descricao: "  " }], /falta o nome do item 1/], [ped(), [{ ...its()[0], observacao: 5 }], /observacao do item 1 precisa ser texto/],
    [ped(), ["texto"], /item 1 precisa ser um objeto/], [ped(), [{ ...its()[0], produto_id: "abc" }], /produto inválido/],
    [ped(), Array.from({ length: 201 }, () => ({ descricao: "a", total: 0 })), /itens demais/],
    [ped(), [its()[0]], /os itens somam 59.9.*subtotal é 73.9/],
    [ped({ subtotal: "73.90" }), its(), /falta o valor de subtotal/], [ped({ gorjeta: "5" }), its(), /gorjeta precisa ser número/], [ped({ total_pago: null }), its(), /falta o valor de total_pago/],
    [ped({ gorjeta: -5 }), its(), /valor inválido em gorjeta/], [ped({ gorjeta: 5.001 }), its(), /valor inválido em gorjeta/],
    [ped({ data: "30/10/2026" }), its(), /data inválida/], [ped({ data: "2026-02-30" }), its(), /date|data/], [ped({ data: "2099-01-01" }), its(), /fora do esperado/],
    [ped({ estabelecimento: 5 }), its(), /falta o campo estabelecimento/], [ped({ plataforma: "uber" }), its(), /plataforma_check|check constraint/],
    [ped({ hora: "8h" }), its(), /hora_check|check constraint/], [ped({ id: "nao-e-uuid" }), its(), /identificador do pedido inválido/],
    [ped({ arquivos: [{ path: `${X}/alimentacao/${ID}/a.jpg` }] }), its(), /foto fora da pasta/],
    [ped({ arquivos: [{ path: `${R}/alimentacao/${ID}/../../x.jpg` }] }), its(), /foto fora da pasta/],
    [ped({ arquivos: [{ path: `${R}/alimentacao/${ID}/a.jpg`, url: "http://x" }] }), its(), /campo não permitido na foto: url/],
    [ped({ arquivos: "a.jpg" }), its(), /lista de fotos inválida/],
  ];
  for (const [p, i, re] of casos) assert.match((await erro(salvar(db, R, p, i, true))).message, re, re.source);
  assert.match((await erro(como(db, R, "select public.pedido_salvar($1::jsonb, $2::jsonb, null)", [JSON.stringify(ped()), JSON.stringify(its())]))).message, /novo ou uma edição/);
  assert.deepEqual(await tudo(db), { pedidos: [], itens: [] }, "nenhuma tentativa deixou rastro");
  /* foto na pasta certa entra; na edição as antigas ficam e as novas se somam */
  const f1 = { path: `${R}/alimentacao/${ID}/1-recibo.jpg`, nome: "recibo.jpg", tipo: "image/jpeg", tamanho: 1000 }, f2 = { ...f1, path: `${R}/alimentacao/${ID}/2-b.jpg` };
  await salvar(db, F, ped({ arquivos: [f1] }), its(), true);
  assert.match((await erro(salvar(db, R, semOrigem(ped({ arquivos: [] })), its(), false))).message, /fotos já guardadas não saem/);
  assert.match((await erro(salvar(db, R, semOrigem(ped({ arquivos: [{ ...f1, nome: "outro" }] })), its(), false))).message, /fotos já guardadas não mudam/);
  await salvar(db, R, semOrigem(ped({ arquivos: [f1, f2] })), its(), false);
  assert.equal((await tudo(db)).pedidos[0].arquivos.length, 2);
});

test("pedidos antigos: alIntegridade aponta, no formato que o banco devolve, o pedido sem itens e o que não soma", { skip: pular }, async () => {
  const db = await banco();
  await salvar(db, R, ped(), its(), true);
  /* pedidos gravados antes do 027 pelo caminho antigo (direto na tabela), um deles quebrado pela falha que o 027 resolve */
  await como(db, R, `insert into public.pedidos (id, data, estabelecimento, plataforma, modo, subtotal, total_pago) values
    ('c0ffee00-0000-4000-8000-0000000000a1', '2026-10-01', 'Lanchonete Exemplo', 'direto', 'no_local', 30, 30),
    ('c0ffee00-0000-4000-8000-0000000000a2', '2026-10-02', 'Sushi Exemplo', 'ifood', 'delivery', 50, 50)`);
  await como(db, R, `insert into public.pedido_itens (pedido_id, descricao, total) values ('c0ffee00-0000-4000-8000-0000000000a2', 'Combo', 45)`);
  const linhas = await como(db, R, `select p.*, coalesce((select json_agg(i order by i.ordem) from public.pedido_itens i where i.pedido_id = p.id), '[]') as pedido_itens
    from public.pedidos p order by p.data`);
  const L = N.alIntegridadeLista(linhas);
  assert.equal(L.total, 3); assert.equal(L.comProblema, 2);
  assert.deepEqual(L.pedidos.map((x) => x.estabelecimento), ["Lanchonete Exemplo", "Sushi Exemplo"]);
  assert.match(L.pedidos[0].problemas.join(" "), /sem nenhum item/); assert.match(L.pedidos[1].problemas.join(" "), /Os itens somam R\$ 45,00, mas o subtotal do pedido é R\$ 50,00/);
  /* corrigido pela edição (pedido_salvar), sai da lista */
  await salvar(db, R, { id: "c0ffee00-0000-4000-8000-0000000000a1", data: "2026-10-01", estabelecimento: "Lanchonete Exemplo", plataforma: "direto", modo: "no_local",
    subtotal: 30, total_pago: 30, arquivos: [] }, [{ descricao: "X-salada", total: 30 }], false);
  const de = await como(db, R, `select p.*, coalesce((select json_agg(i) from public.pedido_itens i where i.pedido_id = p.id), '[]') as pedido_itens from public.pedidos p`);
  assert.equal(N.alIntegridadeLista(de).comProblema, 1);
});

test("backup e restauração continuam: linhas originais entram direto (com autor, data e origem do backup) e a troca marcada funciona", { skip: pular }, async () => {
  const db = await banco();
  await salvar(db, R, ped(), its(), true);
  await salvar(db, R, semOrigem(ped({ observacoes: "editado" })), its(), false);
  /* o backup lê as duas tabelas como hoje */
  const B = await tudo(db), bp = B.pedidos[0];
  await db.exec("delete from public.pedidos");
  /* "linhas novas": insert direto, como js/seguranca.js segGravar, com os campos originais */
  const cols = Object.keys(bp).filter((k) => k !== "user_id");
  await como(db, R, `insert into public.pedidos (${cols.join(",")}) select ${cols.join(",")} from jsonb_populate_record(null::public.pedidos, $1::jsonb)`, [JSON.stringify(bp)]);
  for (const it of B.itens) await como(db, R, `insert into public.pedido_itens select * from jsonb_populate_record(null::public.pedido_itens, $1::jsonb)`, [JSON.stringify(it)]);
  assert.deepEqual(await tudo(db), B, "restaurado idêntico: criado_por, criado_em, origem e versões do backup");
  /* "trocar as linhas que mudaram" (upsert): o conteúdo volta; os quatro campos protegidos ficam como estão */
  await salvar(db, R, semOrigem(ped({ observacoes: "depois do backup" })), its(), false);
  await como(db, R, `insert into public.pedidos select * from jsonb_populate_record(null::public.pedidos, $1::jsonb)
    on conflict (id) do update set observacoes = excluded.observacoes, versoes = excluded.versoes, atualizado_em = excluded.atualizado_em,
      criado_por = excluded.criado_por, criado_em = excluded.criado_em, origem = excluded.origem`, [JSON.stringify(bp)]);
  const p = (await tudo(db)).pedidos[0];
  assert.equal(p.observacoes, "editado"); assert.deepEqual(p.versoes, bp.versoes); assert.equal(p.criado_por, bp.criado_por);
  /* a lista do backup não muda: as duas tabelas, item depois do pedido */
  assert.deepEqual(N.segDef("pedido_itens").fk, { pedido_id: "pedidos", produto_id: "produtos" });
});

test("SQL 027: aplicado, invoker, search_path vazio, sem anon, gatilho dos campos protegidos e nada além disso", () => {
  const s = ler("supabase/027_pedido_salvar.sql"), sc = s.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/^-- status: pendente/.test(s), "aplicado em 01/11/2026: o tests/banco confere que a função existe no Supabase");
  assert.match(sc, /^\s*begin;/m); assert.match(sc, /commit;/);
  assert.match(sc, /create or replace function public\.pedido_salvar\(p_pedido jsonb, p_itens jsonb, p_novo boolean\)\s+returns jsonb language plpgsql security invoker set search_path = ''/);
  assert.match(sc, /revoke all on function public\.pedido_salvar\(jsonb, jsonb, boolean\) from public, anon;/);
  assert.match(sc, /grant execute on function public\.pedido_salvar\(jsonb, jsonb, boolean\) to authenticated;/);
  assert.match(sc, /create or replace function public\.pedidos_protegidos\(\) returns trigger/, "o tests/banco não chama gatilho por RPC");
  assert.ok(!/security definer/i.test(sc), "nada roda com poder de dono");
  assert.ok(!/(create|alter|drop) (table|policy)|grant [a-z, ]+ on (table )?public\.|ia_config|acoes_reais|vault|cron\./i.test(sc), "nenhuma tabela, política, permissão de tabela, IA, segredo ou agendamento");
  assert.ok(!/garmin|newsletter|rac_ia/i.test(sc));
});

test("tela: o Salvar usa pedido_salvar numa chamada só; o Mercado só avisa (segundo toque); a lista mostra o que conferir", () => {
  const js = ler("js/alimentacao.js");
  const salvarJs = js.slice(js.indexOf("salvar.onclick="), js.indexOf("return p}", js.indexOf("salvar.onclick=")));
  assert.equal((salvarJs.match(/SB\.rpc\("pedido_salvar"/g) || []).length, 1);
  assert.match(salvarJs, /SB\.rpc\("pedido_salvar",\{p_pedido:linhaP,p_itens:itens,p_novo:novo\}\)/);
  assert.ok(!/from\("pedidos"\)\.(insert|update)|from\("pedido_itens"\)\.(insert|delete)/.test(js), "nenhuma gravação em partes");
  assert.ok(!/versoes|atualizado_em|user_id|criado_por|pedido_id:|unitario:/.test(salvarJs), "campos que o banco preenche não saem do site");
  assert.match(salvarJs, /if\(novo\)linhaP\.origem=origem/);
  /* aviso do Mercado: nota do mesmo dia, alDuplicataMercado, nunca bloqueia (vira o mesmo segundo toque do "parece repetido") */
  assert.match(salvarJs, /SB\.from\("notas"\)\.select\("id,data,total,mercados\(nome\)"\)\.eq\("data",o\.data\)/);
  assert.match(salvarJs, /NUCLEO\.alDuplicataMercado\(o,/);
  assert.match(salvarJs, /if\(avisos\.length&&!dupOk\)throw \{possivel:/);
  assert.ok(!/dupM[^;]*throw \{dup:/.test(salvarJs), "o aviso do Mercado nunca vira bloqueio");
  assert.match(salvarJs, /catch\(function\(\)\{return \[\]\}\)/, "se as notas não carregarem, o Salvar continua (é só um aviso)");
  assert.match(salvarJs, /e&&e\.code==="23505"/); assert.match(salvarJs, /pedidos_pkey/);
  /* lista: alIntegridadeLista no topo e marca em cada pedido; o detalhe mostra o que conferir */
  assert.match(js, /var integ=NUCLEO\.alIntegridadeLista\(ped\)/);
  assert.match(js, /pedido(s)? para conferir/); assert.match(js, /NUCLEO\.alIntegridade\(x\)/);
  assert.match(ler("index.html"), /\.alconf\{/);
  assert.equal(/var MOD_VERSAO="([^"]+)"/.exec(ler("js/app.js"))[1], /const VERSAO = "([^"]+)"/.exec(ler("sw.js"))[1]);
});
