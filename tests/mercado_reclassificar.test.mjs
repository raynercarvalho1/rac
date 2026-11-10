// Mercado: reclassificar itens (categoria e subcategoria), separação entre estabelecimento e categoria, e a migration 046 (proposta, não aplicada) num Postgres de verdade (PGlite).
// Dados fictícios. Sem rede, sem IA.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

class El {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.style = {}; this.value = ""; this.classList = { add() {}, remove() {}, toggle() {} }; }
  appendChild(c) { this.children.push(c); return c; } setAttribute(k, v) { this.attrs[k] = v; } addEventListener() {}
  set textContent(v) { this.children = [{ text: String(v) }]; } set innerHTML(v) { this.children = []; }
}
globalThis.document = { createElement: (t) => new El(t), createElementNS: (n, t) => new El(t), createTextNode: (t) => ({ text: t }), querySelector: () => null, getElementById: () => null };
globalThis.window = globalThis.window || {}; globalThis.window.scrollTo = () => {}; globalThis.window.racDica = { ligar() {} };
createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo || globalThis.window.RACnucleo; globalThis.window.RACnucleo = N;
createRequire(import.meta.url)("../mercado.js");
const T = globalThis.window.RACmercado._teste;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite */ }

const L = (id, mercado, produto, categoria, total, extra = {}) => ({ id, data: "2026-11-05", mk: "2026-11", mercado, produto, produto_id: "p-" + id, categoria, unidade: "un", quantidade: 1, valor_unitario: total, valor_total: total, desconto: 0, nota: "2026-11-05|" + mercado + "|1", descricao: produto.toUpperCase(), ...extra });

test("categoria efetiva: item vence produto, produto vence o que foi gravado na compra; estabelecimento nunca entra", () => {
  assert.equal(N.mkCategoriaEfetiva({ categoria: "Mercearia" }, {}), "Mercearia");
  assert.equal(N.mkCategoriaEfetiva({ categoria: "Mercearia" }, { categoria: "Casa/Utilidades" }), "Casa/Utilidades");
  assert.equal(N.mkCategoriaEfetiva({ categoria: "Mercearia", categoria_item: "Automotivo" }, { categoria: "Casa/Utilidades" }), "Automotivo");
  assert.equal(N.mkSubEfetiva({ subcategoria: "Proteção" }, { subcategoria: "X" }), "Proteção"); assert.equal(N.mkSubEfetiva({}, { subcategoria: "X" }), "X");
  assert.equal(N.mkCategoriaEfetiva({ categoria: "limpeza/descartáveis" }, {}), "Limpeza", "a unificação existente continua");
});
test("validação: categoria obrigatória, limite de tamanho, estabelecimento recusado, personalizada aceita", () => {
  const ms = ["Mercado Livre", "Confiança (Sorocaba)"];
  assert.deepEqual(N.mkClasseValida("Automotivo", " Proteção ", ms), { ok: true, categoria: "Automotivo", subcategoria: "Proteção" });
  assert.equal(N.mkClasseValida("Pets", "", ms).categoria, "Pets", "categoria personalizada"); assert.equal(N.mkClasseValida("Pets", "", ms).subcategoria, null);
  assert.match(N.mkClasseValida("", "x", ms).erro, /Escolha a categoria/); assert.match(N.mkClasseValida("mercado livre", "", ms).erro, /estabelecimento/); assert.match(N.mkClasseValida("Confiança", "", ms).erro, /estabelecimento/);
  assert.equal(N.mkClasseValida("a".repeat(41), "", ms).ok, false); assert.equal(N.mkClasseValida("Casa", "<b>", ms).ok, false);
});
test("opções: oficiais + sugeridas + as já usadas, sem repetir; subcategorias sugeridas por categoria", () => {
  const o = N.mkOpcoesCategoria([{ categoria: "Pets" }, { categoria: "Automotivo" }, { categoria: "Mercearia" }]);
  assert.equal(new Set(o).size, o.length); for (const c of ["Mercearia", "Automotivo", "Tecnologia", "Saúde", "Vestuário", "Pets"]) assert.ok(o.includes(c), c);
  assert.deepEqual(N.mkSubOpcoes("Automotivo", [{ categoria: "Automotivo", subcategoria: "Som" }]), ["Acessórios", "Manutenção", "Combustível", "Proteção", "Som"]);
  assert.deepEqual(N.mkSubOpcoes("Mercearia", []), []);
  assert.equal(N.MK_CATEGORIAS.length, 11, "as 11 oficiais não mudaram");
});
test("reclassificar atualiza os relatórios: Painel/Consumo (por categoria) e o resumo por subcategoria, sem mudar o total geral", () => {
  const antes = [L("a", "Mercado Livre", "Cortina solar", "Mercearia", 19.9), L("b", "Confiança", "Arroz", "Mercearia", 30), L("c", "Confiança", "Sabão", "Limpeza", 10)];
  const totalAntes = N.mkcResumo(antes, antes).total, catAntes = Object.fromEntries(N.mkcCategorias(antes).linhas.map((c) => [c.categoria, c.total]));
  assert.deepEqual([catAntes.Mercearia, catAntes.Limpeza], [49.9, 10]);
  /* o dono reclassifica só o item da cortina: o banco (view) passaria a devolver categoria_item/subcategoria */
  const depois = antes.map((x) => (x.id === "a" ? { ...x, categoria: N.mkCategoriaEfetiva({ ...x, categoria_item: "Automotivo" }, {}), subcategoria: "Proteção" } : x));
  const catDepois = Object.fromEntries(N.mkcCategorias(depois).linhas.map((c) => [c.categoria, c.total]));
  assert.deepEqual([catDepois.Mercearia, catDepois.Automotivo, catDepois.Limpeza], [30, 19.9, 10]); assert.equal(N.mkcResumo(depois, depois).total, totalAntes, "o gasto total não muda");
  assert.deepEqual(N.mkcFiltrar(depois, { categoria: "Automotivo" }).map((x) => x.id), ["a"], "o filtro de Consumo/Comparar já enxerga a nova categoria");
  const r = N.mkResumoClasse(depois), auto = r.find((c) => c.categoria === "Automotivo"); assert.deepEqual([auto.total, auto.subs[0].subcategoria, auto.subs[0].total], [19.9, "Proteção", 19.9]);
  assert.deepEqual(r.find((c) => c.categoria === "Mercearia").subs.map((s) => s.subcategoria), ["(sem subcategoria)"]);
  /* o valor, a quantidade, a data e o mercado do item reclassificado continuam os mesmos */
  const a0 = antes[0], a1 = depois[0]; for (const k of ["valor_total", "quantidade", "data", "mercado", "nota", "descricao"]) assert.equal(a1[k], a0[k], k);
});

/* ---------- gravação pela tela (cliente falso) ---------- */
function bancoFalso(linhas, opc = {}) {
  const log = [];
  return { log, from(t) { const st = { t, ops: [] }; log.push(st); const p = { then: (res, rej) => Promise.resolve(opc.falha && opc.falha(st) ? { data: null, error: { message: "falhou" } } : { data: t === "compras" ? linhas : [], error: null }).then(res, rej) };
    for (const m of ["select", "order", "range", "update", "eq", "in"]) p[m] = (...a) => { st.ops.push([m, ...a]); return p; }; return p; } };
}
async function preparar(linhas, opc) { const sb = bancoFalso(linhas, opc); T.trocarSb(sb); T.usar(linhas.slice(), { id: "u1" }); return sb; }
const upd = (sb, t) => sb.log.filter((x) => x.t === t && x.ops[0][0] === "update").map((x) => ({ campos: x.ops[0][1], alvo: x.ops[1].slice(1) }));

test("salvar 'só este item': grava categoria_item e subcategoria no item, não toca em valor/nota/produto e recarrega", async () => {
  const lin = [L("a", "Mercado Livre", "Cortina solar", "Mercearia", 19.9)]; const sb = await preparar(lin); T.mig(true);
  await T.salvarClasse(lin[0], "item", "Automotivo", "Proteção");
  assert.deepEqual(upd(sb, "itens"), [{ campos: { categoria_item: "Automotivo", subcategoria: "Proteção" }, alvo: ["id", "a"] }]); assert.deepEqual(upd(sb, "produtos"), []);
  assert.ok(sb.log.some((x) => x.t === "compras" && x.ops[0][0] === "select"), "recarregou as linhas para atualizar a tela");
  for (const u of upd(sb, "itens")) for (const k of ["valor_total", "quantidade", "valor_unitario", "descricao", "nota_id", "desconto"]) assert.ok(!(k in u.campos), k);
});
test("salvar 'todas as compras do produto': muda o produto e limpa a exceção do item; sem a 046 grava só a categoria e avisa que 'só este item' precisa dela", async () => {
  const lin = [L("a", "Confiança", "Pilha", "Mercearia", 9)]; let sb = await preparar(lin); T.mig(true);
  await T.salvarClasse(lin[0], "produto", "Tecnologia", "Acessórios");
  assert.deepEqual(upd(sb, "produtos"), [{ campos: { categoria: "Tecnologia", subcategoria: "Acessórios" }, alvo: ["id", "p-a"] }]); assert.deepEqual(upd(sb, "itens"), [{ campos: { categoria_item: null, subcategoria: null }, alvo: ["id", "a"] }]);
  sb = await preparar(lin); T.mig(false);
  await T.salvarClasse(lin[0], "produto", "Tecnologia", "Acessórios"); assert.deepEqual(upd(sb, "produtos")[0].campos, { categoria: "Tecnologia" }); assert.deepEqual(upd(sb, "itens"), []);
  await assert.rejects(T.salvarClasse(lin[0], "item", "Tecnologia", ""), /migration 046/);
  await assert.rejects(T.salvarClasse({ ...lin[0], produto_id: null }, "produto", "Tecnologia", ""), /não tem produto/);
});
test("entrada inválida e erro do banco não gravam nem mascaram: estabelecimento como categoria, categoria vazia, falha na gravação", async () => {
  const lin = [L("a", "Mercado Livre", "Cortina", "Mercearia", 19.9)]; T.mig(true); let sb = await preparar(lin); T.mig(true);
  await assert.rejects(T.salvarClasse(lin[0], "item", "Mercado Livre", ""), /estabelecimento/); await assert.rejects(T.salvarClasse(lin[0], "item", "", ""), /categoria/); assert.deepEqual(upd(sb, "itens"), []);
  sb = await preparar(lin, { falha: (st) => st.ops[0] && st.ops[0][0] === "update" }); T.mig(true); await assert.rejects(T.salvarClasse(lin[0], "item", "Automotivo", ""), /falhou/);
});
test("tela: cada item mostra categoria › subcategoria e um botão Editar; o formulário diz que o estabelecimento não define a categoria; mobile-first; sem exclusão de nota", () => {
  const m = ler("mercado.js"), css = ler("index.html");
  assert.match(m, /x\.categoria \+ \(x\.subcategoria \? " › " \+ x\.subcategoria : ""\)/); assert.match(m, /Editar a classificação de/); assert.match(m, /o estabelecimento não muda a categoria/);
  assert.match(m, /"Todas as compras deste produto"/); assert.match(m, /Só este item/); assert.match(m, /mig046 === false/, "funciona antes da migration");
  assert.match(css, /\.mkclasse input,#mercado-view \.mkclasse select\{width:100%;box-sizing:border-box;font-size:16px\}/);
  const salvar = m.slice(m.indexOf("function salvarClasse"), m.indexOf("function formClasse")); assert.ok(!/\.delete\(|insert\(/.test(salvar), "reclassificar nunca apaga nem recria");
});

/* ---------- SQL 046 num Postgres de verdade ---------- */
const SQL = ler("supabase/046_mercado_subcategorias.sql");
test("046 (texto): só acrescenta colunas e recria a view; nada destrutivo; aplicada em produção em 10/11/2026", () => {
  const ex = SQL.replace(/--.*$/gm, "");
  assert.match(SQL.split("\n")[0], /^-- Aplicado em produção em 10\/11\/2026/); assert.ok(!/\b(drop table|truncate|delete from|update public|insert into)\b/i.test(ex));
  assert.ok(!/drop column/i.test(ex), "o drop column só existe no rollback comentado"); assert.match(ex, /coalesce\(i\.categoria_item, p\.categoria, i\.categoria\) as categoria/); assert.match(ex, /revoke all on public\.compras from anon/); assert.match(ex, /security_invoker = true/);
  assert.ok(!fs.existsSync(new URL("../supabase/propostas/046_mercado_subcategorias.sql", import.meta.url)), "saiu de propostas");
});
test("046 (PGlite): view devolve a categoria na ordem item → produto → compra, subcategoria, valores intactos, totais iguais antes de editar; RLS e anon continuam", { skip: !PGlite }, async () => {
  const R = "11111111-1111-4111-8111-111111111111", X = "33333333-3333-4333-8333-333333333333", db = await (async () => { const d = globalThis.document, w = globalThis.window; delete globalThis.document; delete globalThis.window; try { return await PGlite.create(); } finally { globalThis.document = d; globalThis.window = w; } })();
  await db.exec(`create role anon nologin; create role authenticated nologin; grant usage on schema public to anon, authenticated;
    create schema auth; create table auth.users (id uuid primary key); insert into auth.users values ('${R}'), ('${X}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub','')::uuid $$;`);
  await db.exec(ler("supabase/schema.sql").replace(/create extension[^;]*;/gi, ""));
  await db.exec(`insert into public.mercados (id, user_id, nome) values ('aaaaaaaa-0000-4000-8000-000000000001','${R}','Mercado Livre');
    insert into public.produtos (id, user_id, nome, categoria) values ('bbbbbbbb-0000-4000-8000-000000000001','${R}','Cortina solar','Mercearia');
    insert into public.notas (id, user_id, mercado_id, data) values ('cccccccc-0000-4000-8000-000000000001','${R}','aaaaaaaa-0000-4000-8000-000000000001','2026-11-05');
    insert into public.itens (id, user_id, nota_id, produto_id, descricao, categoria, quantidade, valor_unitario, valor_total) values
      ('dddddddd-0000-4000-8000-000000000001','${R}','cccccccc-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001','CORTINA','Mercearia',1,19.90,19.90),
      ('dddddddd-0000-4000-8000-000000000002','${R}','cccccccc-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001','CORTINA 2','Mercearia',1,10,10);`);
  const soma = async () => (await db.query("select categoria, sum(valor_total)::float t from public.compras group by 1 order by 1")).rows;
  const antes = await soma(); await db.exec(SQL); await db.exec(SQL); /* roda duas vezes sem erro */
  assert.deepEqual(await soma(), antes, "aplicar a 046 não muda nenhum total"); assert.equal((await db.query("select count(*)::int n from public.compras where subcategoria is not null")).rows[0].n, 0);
  /* só este item */
  await db.exec(`update public.itens set categoria_item = 'Automotivo', subcategoria = 'Proteção' where id = 'dddddddd-0000-4000-8000-000000000001'`);
  assert.deepEqual(await soma(), [{ categoria: "Automotivo", t: 19.9 }, { categoria: "Mercearia", t: 10 }]);
  /* o produto vale para os demais; o item com exceção continua com a dele */
  await db.exec(`update public.produtos set categoria = 'Casa/Utilidades', subcategoria = 'Utensílios' where id = 'bbbbbbbb-0000-4000-8000-000000000001'`);
  const l = (await db.query("select id, categoria, subcategoria, valor_total::float v, quantidade::float q, descricao from public.compras order by id")).rows;
  assert.deepEqual(l.map((x) => [x.categoria, x.subcategoria, x.v, x.q]), [["Automotivo", "Proteção", 19.9, 1], ["Casa/Utilidades", "Utensílios", 10, 1]]);
  /* o histórico financeiro e a nota ficam como estavam */
  assert.deepEqual((await db.query("select valor_total::float v, valor_unitario::float u, descricao from public.itens order by id")).rows.map((x) => [x.v, x.u, x.descricao]), [[19.9, 19.9, "CORTINA"], [10, 10, "CORTINA 2"]]);
  /* limites de tamanho */
  await assert.rejects(db.exec(`update public.itens set subcategoria = '${"x".repeat(41)}' where id = 'dddddddd-0000-4000-8000-000000000001'`)); await assert.rejects(db.exec(`update public.itens set categoria_item = ' ' where id = 'dddddddd-0000-4000-8000-000000000001'`));
  /* anon sem acesso à view e às tabelas */
  assert.equal((await db.query("select has_table_privilege('anon','public.compras','SELECT') a, has_table_privilege('anon','public.itens','SELECT') b")).rows[0].a, false);
});

test("a tela de Notas desenha o botão Editar em cada item e, ao tocar, abre o formulário (regressão: appendChild só aceita um argumento)", async () => {
  const lin = [L("a", "Mercado Livre", "Cortina solar", "Mercearia", 19.9), L("b", "Mercado Livre", "Pilha", "Mercearia", 9)]; await preparar(lin); T.mig(true);
  const achar = (e, f, out = []) => { if (e.tag && f(e)) out.push(e); (e.children || []).forEach((c) => achar(c, f, out)); return out; };
  const texto = (e) => (e.text != null ? e.text : (e.children || []).map(texto).join(" "));
  const corpo = new El("div"); T.viewNotas(corpo);
  const botoes = achar(corpo, (e) => e.tag === "button" && e.attrs["aria-label"] && /^Editar a classificação/.test(e.attrs["aria-label"]));
  assert.equal(botoes.length, 2, "um Editar por item"); assert.match(texto(corpo), /Mercearia/);
  botoes[0].onclick(); assert.ok(achar(corpo, (e) => e.tag === "select" && e.attrs["aria-label"] === "Categoria").length === 1, "o formulário abriu no item"); assert.match(texto(corpo), /Salvar classificação/);
});
