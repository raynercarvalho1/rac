// Lote 1 do novo RAC · o motor PURO do Workspace (nucleo.js, ws*) e o catálogo de widgets (js/widgets.js, js/widgets-base.js). Sem rede e sem banco.
// Prova: o documento de layout e a validação (a MESMA do banco: os casos rodam também no Postgres de verdade, PGlite, e as duas respostas têm de ser iguais);
// cada operação (adicionar, remover, mover, redimensionar, configurar, ocultar, desativar, duplicar, seções), desfazer por operações, repetição sobre uma versão mais nova
// do servidor (conflito), migração de schema e de configuração, widgets indisponíveis, responsividade (12/8/1 colunas), permissões, títulos e páginas, e o contrato do catálogo.
// Ocultar, remover da página, desativar e excluir o dado são coisas diferentes: o motor nunca toca em dado de negócio (só existe layout aqui).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite: pula, menos no CI */ }
const pular = !PGlite;

const ID = (n) => "w_" + String(n).padStart(6, "0");
const def = (extra = {}) => ({ tipo: "nota.fixa", versao: 1, titulo: "Nota", categoria: "Utilidade", descricao: "d", dominio: "workspace", compartilhavel: true, tamanhos: { min: [2, 0], padrao: [4, 1], max: [12, 6] },
  config: [{ chave: "texto", rotulo: "Texto", tipo: "texto-curto", max: 20, padrao: "oi" }, { chave: "dias", rotulo: "Dias", tipo: "numero", min: 1, max: 30, padrao: 7 }, { chave: "per", rotulo: "Período", tipo: "periodo" },
    { chave: "modo", rotulo: "Modo", tipo: "selecao", opcoes: [{ valor: "a", rotulo: "A" }, { valor: "b", rotulo: "B" }], padrao: "a" }, { chave: "lig", rotulo: "Ligado", tipo: "booleano" }], renderizar() {}, ...extra });
const CAT = { "nota.fixa": def(), "grafico.gastos": def({ tipo: "grafico.gastos", titulo: "Gastos", tamanhos: { min: [4, 2], padrao: [6, 3], max: [12, 6] }, config: [] }) };
const item = (n, extra = {}) => ({ id: ID(n), tipo: "nota.fixa", v: 1, col: 4, lin: 0, estado: "ativo", config: {}, ...extra });
const lay = (...secoes) => ({ schema: 1, secoes: secoes.map((itens, i) => ({ id: "s" + (i + 1), titulo: "S" + (i + 1), itens })) });
const ids = (l) => l.secoes.map((s) => s.itens.map((i) => i.id));

/* ---------- o documento e a validação (igual à do banco) ---------- */
const BASE = () => ({ schema: 1, secoes: [{ id: "s1", itens: [item(1)] }] });
const trocar = (f) => { const l = BASE(); f(l); return l; };
const it0 = (l) => l.secoes[0].itens[0];
const CASOS = [
  ["documento certo", BASE(), true], ["vazio", { schema: 1, secoes: [] }, true], ["chaves desconhecidas", { schema: 1, secoes: [], futuro: { a: 1 }, ...{} }, true],
  ["item com chave desconhecida", trocar((l) => { it0(l).extra = "x"; }), true], ["mobile falso", trocar((l) => { it0(l).mobile = false; }), true], ["título de seção", trocar((l) => { l.secoes[0].titulo = "Dia"; l.secoes[0].recolhida = true; }), true],
  ["sem schema", { secoes: [] }, false], ["schema 0", { schema: 0, secoes: [] }, false], ["schema 1001", { schema: 1001, secoes: [] }, false], ["schema texto", { schema: "1", secoes: [] }, false], ["secoes objeto", { schema: 1, secoes: {} }, false], ["sem secoes", { schema: 1 }, false],
  ["coluna 0", trocar((l) => { it0(l).col = 0; }), false], ["coluna 13", trocar((l) => { it0(l).col = 13; }), false], ["coluna decimal", trocar((l) => { it0(l).col = 4.5; }), false], ["coluna texto", trocar((l) => { it0(l).col = "4"; }), false],
  ["linhas 12", trocar((l) => { it0(l).lin = 12; }), true], ["linhas 13", trocar((l) => { it0(l).lin = 13; }), false], ["linhas -1", trocar((l) => { it0(l).lin = -1; }), false],
  ["estado inválido", trocar((l) => { it0(l).estado = "apagado"; }), false], ["sem estado", trocar((l) => { delete it0(l).estado; }), false], ["estado número", trocar((l) => { it0(l).estado = 1; }), false],
  ["estado oculto", trocar((l) => { it0(l).estado = "oculto"; }), true], ["estado desativado", trocar((l) => { it0(l).estado = "desativado"; }), true],
  ["tipo sem ponto", trocar((l) => { it0(l).tipo = "nota"; }), false], ["tipo maiúsculo", trocar((l) => { it0(l).tipo = "Nota.Fixa"; }), false], ["tipo longo", trocar((l) => { it0(l).tipo = "a." + "b".repeat(60); }), false], ["tipo com 3 partes", trocar((l) => { it0(l).tipo = "a.b.c"; }), false],
  ["id sem w_", trocar((l) => { it0(l).id = "abcdef"; }), false], ["id curto", trocar((l) => { it0(l).id = "w_abc"; }), false], ["id maiúsculo", trocar((l) => { it0(l).id = "w_ABCDEF"; }), false],
  ["config lista", trocar((l) => { it0(l).config = []; }), false], ["sem config", trocar((l) => { delete it0(l).config; }), false], ["config nula", trocar((l) => { it0(l).config = null; }), false], ["config grande", trocar((l) => { it0(l).config = { t: "x".repeat(5000) }; }), false],
  ["versão 0", trocar((l) => { it0(l).v = 0; }), false], ["mobile texto", trocar((l) => { it0(l).mobile = "sim"; }), false], ["recolhida texto", trocar((l) => { l.secoes[0].recolhida = "sim"; }), false], ["título de seção número", trocar((l) => { l.secoes[0].titulo = 5; }), false],
  ["título de seção longo", trocar((l) => { l.secoes[0].titulo = "x".repeat(61); }), false], ["título nulo", trocar((l) => { l.secoes[0].titulo = null; }), false],
  ["id repetido", { schema: 1, secoes: [{ id: "s1", itens: [item(1), item(1)] }] }, false], ["id repetido entre seções", { schema: 1, secoes: [{ id: "s1", itens: [item(1)] }, { id: "s2", itens: [item(1)] }] }, false],
  ["seção repetida", { schema: 1, secoes: [{ id: "s1", itens: [] }, { id: "s1", itens: [] }] }, false], ["seção sem itens", { schema: 1, secoes: [{ id: "s1" }] }, false], ["id de seção inválido", { schema: 1, secoes: [{ id: "S 1", itens: [] }] }, false],
  ["12 seções", { schema: 1, secoes: Array.from({ length: 12 }, (_, i) => ({ id: "s" + i, itens: [] })) }, true], ["13 seções", { schema: 1, secoes: Array.from({ length: 13 }, (_, i) => ({ id: "s" + i, itens: [] })) }, false],
  ["60 instâncias", { schema: 1, secoes: [{ id: "s1", itens: Array.from({ length: 60 }, (_, i) => item(i + 1)) }] }, true], ["61 instâncias", { schema: 1, secoes: [{ id: "s1", itens: Array.from({ length: 61 }, (_, i) => item(i + 1)) }] }, false],
  ["item não é objeto", { schema: 1, secoes: [{ id: "s1", itens: [5] }] }, false], ["seção não é objeto", { schema: 1, secoes: [5] }, false], ["documento é lista", [], false],
];
test("wsValidar: cada caso do contrato do documento de layout", () => {
  for (const [nome, l, ok] of CASOS) assert.equal(N.wsValidar(l).ok, ok, nome + ": " + N.wsValidar(l).erros.join("; "));
  assert.equal(N.wsValidar(null).ok, false); assert.equal(N.wsValidar("x").ok, false);
  assert.ok(N.wsValidar(trocar((l) => { it0(l).col = 0; })).erros.length >= 1, "diz o que está errado");
});
test("PGlite · o banco (ws_layout_valido) e o navegador (wsValidar) respondem IGUAL a cada caso do contrato", { skip: pular }, async () => {
  const db = await PGlite.create();
  const t = ler("supabase/070_espacos_e_workspace.sql"), i = t.indexOf("create or replace function public.ws_layout_valido");
  await db.exec(t.slice(i, t.indexOf("$$;", t.indexOf("$$", i + 60)) + 3));
  const divergentes = [];
  for (const [nome, l] of CASOS) { const sql = (await db.query("select public.ws_layout_valido($1::jsonb) as v", [JSON.stringify(l)])).rows[0].v; if (sql !== N.wsValidar(l).ok) divergentes.push(`${nome}: banco=${sql} navegador=${N.wsValidar(l).ok}`); }
  assert.deepEqual(divergentes, []);
  /* o que o navegador aceita o banco aceita (o limite de configuração do navegador é menor de propósito) */
  const cfg = (n) => trocar((l) => { it0(l).config = { t: "x".repeat(n) }; });
  for (const n of [100, 1000, 2900]) { assert.equal(N.wsValidar(cfg(n)).ok, true); assert.equal((await db.query("select public.ws_layout_valido($1::jsonb) as v", [JSON.stringify(cfg(n))])).rows[0].v, true, "config de " + n); }
});

/* ---------- operações ---------- */
test("wsAdicionar: usa o tamanho padrão e a configuração padrão do tipo, na seção e no índice pedidos; respeita limites; nunca altera o documento de entrada", () => {
  const l0 = lay([item(1), item(2)], []), copia = JSON.stringify(l0);
  const r = N.wsAdicionar(l0, CAT["nota.fixa"], { secao: "s2", id: ID(9), config: { texto: "abc" } });
  assert.ok(r.ok); assert.equal(JSON.stringify(l0), copia, "a entrada não muda");
  const n = r.layout.secoes[1].itens[0]; assert.deepEqual([n.id, n.tipo, n.v, n.col, n.lin, n.estado], [ID(9), "nota.fixa", 1, 4, 1, "ativo"]); assert.equal(n.config.texto, "abc"); assert.equal(n.config.dias, 7, "padrão das chaves ausentes");
  assert.equal(N.wsAdicionar(l0, CAT["nota.fixa"], { indice: 1, id: ID(8) }).layout.secoes[0].itens[1].id, ID(8));
  assert.equal(N.wsAdicionar(l0, CAT["nota.fixa"], { secao: "nao" }).motivo, "secao_inexistente"); assert.equal(N.wsAdicionar(l0, CAT["nota.fixa"], { id: ID(1) }).motivo, "id_repetido"); assert.equal(N.wsAdicionar(l0, null).motivo, "tipo_desconhecido");
  const cheio = lay(Array.from({ length: 60 }, (_, i) => item(i + 1))); assert.equal(N.wsAdicionar(cheio, CAT["nota.fixa"]).motivo, "limite_de_componentes");
  assert.ok(N.wsValidar(r.layout).ok, "o resultado é sempre um documento válido"); assert.match(N.wsNovoId(), /^w_[a-z0-9]{10}$/); assert.notEqual(N.wsNovoId(), N.wsNovoId());
});
test("wsRemover, wsEstado: remover tira só do layout; ocultar e desativar só mudam o estado (posição, tamanho e configuração ficam)", () => {
  const l = lay([item(1, { config: { texto: "x" }, col: 6 }), item(2)]);
  const r = N.wsRemover(l, ID(1)); assert.deepEqual(ids(r.layout), [[ID(2)]]); assert.equal(r.removido.config.texto, "x"); assert.equal(N.wsRemover(l, ID(7)).motivo, "componente_inexistente");
  for (const e of ["oculto", "desativado", "ativo"]) { const x = N.wsEstado(l, ID(1), e); assert.equal(x.layout.secoes[0].itens[0].estado, e); assert.deepEqual({ ...x.layout.secoes[0].itens[0], estado: "ativo" }, l.secoes[0].itens[0], "só o estado mudou"); }
  assert.equal(N.wsEstado(l, ID(1), "apagado").motivo, "estado_invalido"); assert.equal(N.wsEstado(l, ID(1), "excluido").ok, false, "não existe estado 'excluir dado': o Workspace nunca apaga dado de negócio");
});
test("wsMover e wsMoverPasso: reordenam dentro da seção e entre seções; passo para a seção vizinha nas pontas", () => {
  const l = lay([item(1), item(2), item(3)], [item(4)]);
  assert.deepEqual(ids(N.wsMover(l, ID(3), "s1", 0).layout), [[ID(3), ID(1), ID(2)], [ID(4)]]); assert.deepEqual(ids(N.wsMover(l, ID(1), "s2", 1).layout), [[ID(2), ID(3)], [ID(4), ID(1)]]);
  assert.deepEqual(ids(N.wsMover(l, ID(1), "s2").layout), [[ID(2), ID(3)], [ID(4), ID(1)]], "sem índice, vai para o fim"); assert.deepEqual(ids(N.wsMover(l, ID(1), "s1", 99).layout)[0], [ID(2), ID(3), ID(1)], "índice acima do fim é limitado");
  assert.equal(N.wsMover(l, ID(1), "x", 0).motivo, "secao_inexistente");
  assert.deepEqual(ids(N.wsMoverPasso(l, ID(2), 1).layout), [[ID(1), ID(3), ID(2)], [ID(4)]]); assert.deepEqual(ids(N.wsMoverPasso(l, ID(3), 1).layout), [[ID(1), ID(2)], [ID(3), ID(4)]], "no fim da seção passa para a próxima");
  assert.deepEqual(ids(N.wsMoverPasso(l, ID(4), -1).layout), [[ID(1), ID(2), ID(3), ID(4)], []], "no começo da seção passa para a anterior"); assert.equal(N.wsMoverPasso(l, ID(1), -1).motivo, "ja_no_inicio"); assert.equal(N.wsMoverPasso(l, ID(4), 1).motivo, "ja_no_fim");
  for (const r of [N.wsMover(l, ID(3), "s1", 0), N.wsMoverPasso(l, ID(3), 1)]) assert.equal(JSON.stringify(r.layout).match(/w_0000\d\d/g).length, 4, "nenhum componente se perde nem duplica");
});
test("wsRedimensionar e wsConfigurar: limitam ao mínimo e ao máximo do tipo; configuração inválida volta ao padrão e chave desconhecida é preservada", () => {
  const l = lay([item(1)]), d = CAT["nota.fixa"];
  assert.deepEqual([N.wsRedimensionar(l, ID(1), 1, 0, d).col, N.wsRedimensionar(l, ID(1), 99, 99, d).col, N.wsRedimensionar(l, ID(1), 99, 99, d).lin], [2, 12, 6]);
  assert.deepEqual([N.wsRedimensionar(l, ID(1), 7).col, N.wsRedimensionar(l, ID(1), null, 3).layout.secoes[0].itens[0].col], [7, 4], "sem o tipo, só os limites gerais (1..12, 0..12)");
  assert.deepEqual(N.wsLimitar(null, 50, 50), [12, 12]); assert.deepEqual(N.wsLimitar(null, -3, -3), [1, 0]);
  const c = N.wsConfigurar(lay([item(1, { config: { futuro: "x" } })]), ID(1), { futuro: "x", texto: "z".repeat(50), dias: 99, per: "ano", modo: "c", lig: "sim" }, d);
  assert.equal(c.layout.secoes[0].itens[0].config.futuro, "x", "chave desconhecida preservada"); assert.equal(c.layout.secoes[0].itens[0].config.texto.length, 20, "texto cortado no máximo"); assert.deepEqual([c.layout.secoes[0].itens[0].config.dias, c.layout.secoes[0].itens[0].config.per, c.layout.secoes[0].itens[0].config.modo, c.layout.secoes[0].itens[0].config.lig], [7, "7d", "a", false]);
  assert.equal(c.erros.length, 4, "diz quais valores eram inválidos"); assert.equal(N.wsConfigurar(l, ID(1), { t: "x".repeat(4000) }, null).motivo, "configuracao_grande");
  assert.deepEqual(N.wsConfigNormalizar(null, { a: 1 }).config, { a: 1 }); assert.deepEqual(N.wsConfigNormalizar({ config: [{ chave: "r", rotulo: "R", tipo: "selecao", multiplo: true, opcoes: ["a", "b"] }] }, { r: ["a", "x"] }).config, { r: [] });
});
test("wsDuplicar, wsMobile e seções: duplicar dá id novo ao lado; mobile só marca a vista; remover seção nunca perde componente", () => {
  const l = lay([item(1, { config: { texto: "x" } })], [item(2)]);
  const d = N.wsDuplicar(l, ID(1), CAT["nota.fixa"]); assert.equal(d.layout.secoes[0].itens.length, 2); assert.notEqual(d.id, ID(1)); assert.equal(d.layout.secoes[0].itens[1].config.texto, "x"); assert.ok(N.wsValidar(d.layout).ok);
  assert.equal(N.wsMobile(l, ID(1), false).layout.secoes[0].itens[0].mobile, false); assert.equal("mobile" in N.wsMobile(N.wsMobile(l, ID(1), false).layout, ID(1), true).layout.secoes[0].itens[0], false);
  const a = N.wsSecaoAdicionar(l, "Nova", "nova"); assert.deepEqual(a.layout.secoes.map((s) => s.id), ["s1", "s2", "nova"]); assert.equal(N.wsSecaoAdicionar(a.layout, "x", "nova").motivo, "id_repetido");
  assert.equal(N.wsSecaoAdicionar(lay(...Array.from({ length: 12 }, () => [])), "x").motivo, "limite_de_secoes");
  const r = N.wsSecaoRemover(l, "s1"); assert.deepEqual(r.layout.secoes.map((s) => s.id), ["s2"]); assert.deepEqual(r.layout.secoes[0].itens.map((i) => i.id), [ID(2), ID(1)], "os componentes foram para a vizinha"); assert.equal(r.movidos, 1);
  assert.equal(N.wsSecaoRemover(lay([item(1)]), "s1").motivo, "ultima_secao"); assert.deepEqual(N.wsSecaoMover(l, "s1", 1).layout.secoes.map((s) => s.id), ["s2", "s1"]); assert.equal(N.wsSecaoMover(l, "s1", -1).motivo, "limite");
  assert.equal(N.wsSecaoRenomear(l, "s1", "x".repeat(99)).layout.secoes[0].titulo.length, 60); assert.equal(N.wsSecaoRecolher(l, "s1", true).layout.secoes[0].recolhida, true);
});
test("operações como dado: wsAplicarOp e wsAplicarOps repetem as alterações sobre uma versão mais nova; o que não cabe é devolvido, nunca engolido", () => {
  const base = lay([item(1), item(2)]);
  const ops = [{ op: "mover", id: ID(2), secao: "s1", indice: 0 }, { op: "configurar", id: ID(1), tipo: "nota.fixa", config: { texto: "novo" } }, { op: "redimensionar", id: ID(1), tipo: "nota.fixa", col: 8 }, { op: "estado", id: ID(2), estado: "oculto" }, { op: "adicionar", tipo: "nota.fixa", id: ID(5) }];
  const direto = N.wsAplicarOps(base, ops, CAT); assert.equal(direto.aplicadas, 5); assert.deepEqual(direto.ignoradas, []); assert.deepEqual(ids(direto.layout), [[ID(2), ID(1), ID(5)]]);
  /* outro aparelho removeu o componente 1 e criou o 3 enquanto isso */
  const servidor = lay([item(2), item(3)]), r = N.wsAplicarOps(servidor, ops, CAT);
  assert.equal(r.aplicadas, 3); assert.deepEqual(r.ignoradas.map((x) => x.op.op + ":" + x.motivo), ["configurar:componente_inexistente", "redimensionar:componente_inexistente"]); assert.ok(ids(r.layout)[0].includes(ID(3)), "o que o outro aparelho fez continua");
  assert.equal(N.wsAplicarOp(base, { op: "xx" }, CAT).motivo, "operacao_desconhecida");
  const d = N.wsDiff(base, servidor); assert.deepEqual([d.adicionados, d.removidos, d.alterados], [[ID(3)], [ID(1)], []]); assert.deepEqual(N.wsDiff(base, base), { adicionados: [], removidos: [], alterados: [] });
  assert.deepEqual(N.wsDiff(base, N.wsRedimensionar(base, ID(1), 9).layout).alterados, [ID(1)]);
});

/* ---------- versões, migração e indisponibilidade ---------- */
test("wsMigrar e wsMigrarConfigs: documento antigo/ausente vira válido; documento de versão MAIS NOVA não é tocado; configuração antiga é migrada pelo próprio tipo", () => {
  assert.deepEqual(N.wsMigrar(null).doc, N.wsVazio()); assert.equal(N.wsMigrar({ schema: 1, secoes: [] }).migrou, false); assert.equal(N.wsMigrar({ schema: 1 }).doc.secoes.length, 0, "sem secoes vira lista vazia");
  const f = N.wsMigrar({ schema: 7, secoes: [], novo: { x: 1 } }); assert.equal(f.futuro, true); assert.deepEqual(f.doc, { schema: 7, secoes: [], novo: { x: 1 } }, "não muda nada");
  const migrando = { ...def({ versao: 2 }), migrarConfig: (c, v) => (v === 1 ? { ...c, texto: c.antigo, antigo: undefined } : c) };
  const l = lay([item(1, { v: 1, config: { antigo: "olá" } }), item(2, { v: 2 }), item(3, { v: 3 }), item(4, { tipo: "sumiu.tipo" })]);
  const r = N.wsMigrarConfigs(l, { "nota.fixa": migrando });
  assert.deepEqual(r.layout.secoes[0].itens.map((i) => i.v), [2, 2, 3, 1], "a 1 foi migrada; a 3 (futura) e o tipo ausente não são tocados"); assert.equal(r.layout.secoes[0].itens[0].config.texto, "olá");
  assert.deepEqual(r.avisos, [{ id: ID(3), motivo: "versao_futura" }]); assert.equal(l.secoes[0].itens[0].v, 1, "a entrada não muda");
  const quebra = N.wsMigrarConfigs(lay([item(1, { v: 1 })]), { "nota.fixa": { ...migrando, migrarConfig() { throw new Error("x"); } } }); assert.equal(quebra.layout.secoes[0].itens[0].v, 1); assert.equal(quebra.avisos[0].motivo, "migracao_falhou");
});
test("wsVisao: oculto e desativado só aparecem na edição; ocultos pessoais somem na vista; tipo fora do catálogo vira 'indisponivel' sem perder a configuração; sem permissão não mostra dado", () => {
  const l = lay([item(1), item(2, { estado: "oculto" }), item(3, { estado: "desativado" }), item(4, { tipo: "sumiu.tipo", config: { guardada: 1 } }), item(5, { tipo: "grafico.gastos" }), item(6, { mobile: false }), item(7, { v: 9 })]);
  const sit = (o) => N.wsVisao(l, { catalogo: CAT, ...o })[0].itens.map((x) => x.item.id.slice(-1) + ":" + x.situacao);
  assert.deepEqual(sit({}), ["1:ok", "4:indisponivel", "5:ok", "6:ok", "7:versao_futura"]);
  assert.deepEqual(sit({ edicao: true }), ["1:ok", "2:oculto", "3:desativado", "4:indisponivel", "5:ok", "6:ok", "7:versao_futura"]);
  assert.deepEqual(sit({ ocultosPessoais: [ID(1)] }), ["4:indisponivel", "5:ok", "6:ok", "7:versao_futura"]); assert.deepEqual(sit({ ocultosPessoais: [ID(1)], edicao: true })[0], "1:oculto");
  assert.deepEqual(sit({ ocultosPessoais: [ID(1)], mostrarPessoais: true }), ["1:oculto", "4:indisponivel", "5:ok", "6:ok", "7:versao_futura"], "'mostrar ocultos por mim' traz de volta só o que a pessoa ocultou para si (o oculto do layout continua fora da vista)");
  assert.equal(N.wsVisao(l, { catalogo: CAT, ocultosPessoais: [ID(1)], mostrarPessoais: true })[0].itens[0].pessoalOculto, true);
  assert.deepEqual(sit({ mobile: true }), ["1:ok", "4:indisponivel", "5:ok", "7:versao_futura"], "'esconder no celular' só vale na vista do celular");
  assert.deepEqual(sit({ permite: (d) => ({ ok: d.tipo !== "grafico.gastos" }) }), ["1:ok", "4:indisponivel", "5:sem_permissao", "6:ok", "7:versao_futura"]);
  assert.equal(N.wsVisao(l, { catalogo: CAT })[0].itens[1].item.config.guardada, 1, "a configuração do tipo ausente continua no layout"); assert.equal(l.secoes[0].itens[3].config.guardada, 1);
});

/* ---------- responsividade, permissões, páginas ---------- */
test("responsividade: 12 colunas no computador, 8 no tablet, 1 no celular; a escala nunca zera nem passa do máximo", () => {
  assert.deepEqual([1181, 1280, 1180, 861, 860, 390].map(N.wsColunasPara), [12, 12, 8, 8, 1, 1]);
  assert.deepEqual([1, 2, 3, 4, 6, 9, 12].map((c) => N.wsEscala(c, 8)), [1, 1, 2, 3, 4, 6, 8]); assert.equal(N.wsEscala(7, 12), 7); assert.equal(N.wsEscala(12, 1), 1);
  for (let c = 1; c <= 12; c++) for (const k of [8, 1]) { const e = N.wsEscala(c, k); assert.ok(e >= 1 && e <= k, `${c}→${e}/${k}`); }
});
test("permissões: a tabela do navegador é a do banco (rac_pode_no_espaco); tipo privado não entra em espaço compartilhado; o módulo e o papel contam", () => {
  const nivel = ["ler", "editar", "administrar", "proprietario"], quem = { proprietario: [1, 1, 1, 1], administrador: [1, 1, 1, 0], editor: [1, 1, 0, 0], leitor: [1, 0, 0, 0] };
  for (const [p, v] of Object.entries(quem)) nivel.forEach((n, i) => assert.equal(N.wsPodeNoEspaco(p, n, false), !!v[i], `${p}/${n}`));
  for (const p of Object.keys(quem)) { assert.equal(N.wsPodeNoEspaco(p, "ler", true), true, "arquivado ainda lê"); for (const n of ["editar", "administrar", "proprietario"]) assert.equal(N.wsPodeNoEspaco(p, n, true), false, "arquivado: só leitura"); }
  assert.equal(N.wsPodeNoEspaco("intruso", "ler"), false); assert.equal(N.wsPodeNoEspaco(null, "ler"), false); assert.equal(N.wsPodeNoEspaco("editor", "outro"), false);
  const priv = def({ tipo: "saude.x", compartilhavel: false, exige: { modulo: "saude", dono: true } });
  assert.deepEqual(N.wsPodeUsarTipo(priv, { tipoEspaco: "compartilhado", modulos: ["saude"], dono: true }), { ok: false, motivo: "tipo_privado" }); assert.equal(N.wsPodeUsarTipo(priv, { tipoEspaco: "pessoal", modulos: ["saude"], dono: true }).ok, true);
  assert.equal(N.wsPodeUsarTipo(priv, { tipoEspaco: "pessoal", modulos: [], dono: true }).motivo, "modulo_indisponivel"); assert.equal(N.wsPodeUsarTipo(priv, { tipoEspaco: "pessoal", modulos: ["saude"], dono: false }).motivo, "so_do_dono");
  assert.equal(N.wsPodeUsarTipo(def({ exige: { papeis: ["administrador"] } }), { papel: "editor" }).motivo, "papel_insuficiente"); assert.equal(N.wsPodeUsarTipo(def({ exige: { espacos: ["pessoal"] } }), { tipoEspaco: "compartilhado" }).motivo, "espaco_nao_suportado");
  assert.equal(N.wsPodeUsarTipo(null, {}).motivo, "tipo_desconhecido");
});
test("páginas: título único sem diferença de maiúsculas e espaços (como o índice do banco), ordem, página inicial, mover, ocultos válidos e página padrão por código", () => {
  const ps = [{ id: "a", titulo: "Minha Casa", ordem: 1, criado_em: "2026-01-02" }, { id: "b", titulo: "Trabalho", ordem: 0, criado_em: "2026-01-01" }, { id: "c", titulo: "Velha", ordem: 2, arquivada_em: "x" }, { id: "d", titulo: "Z", ordem: 1, criado_em: "2026-01-03" }];
  assert.deepEqual(N.wsTituloOk("  minha   CASA ", ps), { ok: false, motivo: "repetido" }); assert.deepEqual(N.wsTituloOk("Velha", ps), { ok: true, titulo: "Velha" }, "o título de página arquivada fica livre"); assert.equal(N.wsTituloOk("Minha Casa", ps, "a").ok, true, "renomear para o próprio nome");
  assert.deepEqual([N.wsTituloOk("", ps).motivo, N.wsTituloOk("x".repeat(61), ps).motivo, N.wsTituloOk(null, ps).motivo], ["vazio", "longo", "vazio"]);
  assert.deepEqual(N.wsOrdenarPaginas(ps).map((p) => p.id), ["b", "a", "d"], "ordem, depois criação; as arquivadas ficam fora");
  assert.equal(N.wsPaginaInicial(ps, []).id, "b"); assert.equal(N.wsPaginaInicial(ps, [{ pagina_id: "d", favorita: true }]).id, "d"); assert.equal(N.wsPaginaInicial(ps, [{ pagina_id: "c", favorita: true }]).id, "b", "favorita arquivada não vale"); assert.equal(N.wsPaginaInicial([], []), null);
  assert.deepEqual(N.wsMoverPagina(ps, "a", -1), [{ id: "a", ordem: 0 }, { id: "b", ordem: 1 }, { id: "d", ordem: 2 }], "renumera só o que muda de número (a, b e d); as arquivadas ficam de fora"); assert.deepEqual(N.wsMoverPagina(ps, "b", -1), []); assert.deepEqual(N.wsMoverPagina(ps, "x", 1), []);
  assert.deepEqual(N.wsOcultosValidos(lay([item(1), item(2)]), [ID(2), "w_xxxxxxxx", ID(1)]), [ID(2), ID(1)], "só ids que existem no layout");
  const p = N.wsLayoutPadrao({ "nota.fixa": CAT["nota.fixa"] }, ["nota.fixa", "nao.existe", "nota.fixa"]); assert.equal(p.secoes[0].itens.length, 2); assert.ok(N.wsValidar(p).ok);
});

/* ---------- o contrato do catálogo ---------- */
test("wsDefValida: o contrato de um tipo de widget (tipo, versão, tamanhos em ordem, campos de configuração, migração obrigatória acima da versão 1, compartilhável explícito)", () => {
  assert.equal(N.wsDefValida(def()).ok, true);
  const ruim = (extra, parte) => { const r = N.wsDefValida(def(extra)); assert.equal(r.ok, false, parte); assert.ok(r.erros.some((e) => e.includes(parte)), parte + " → " + r.erros.join("; ")); };
  ruim({ tipo: "Nota" }, "tipo"); ruim({ versao: 0 }, "versao"); ruim({ titulo: "" }, "titulo"); ruim({ dominio: undefined }, "dominio"); ruim({ tamanhos: { min: [5, 0], padrao: [4, 0], max: [12, 6] } }, "fora de ordem"); ruim({ tamanhos: { min: [2, 0], padrao: [4, 0] } }, "tamanhos");
  ruim({ tamanhos: { min: [0, 0], padrao: [4, 0], max: [12, 6] } }, "tamanhos.min"); ruim({ config: "x" }, "lista"); ruim({ config: [{ chave: "a", rotulo: "A", tipo: "grafico" }] }, "tipo inválido"); ruim({ config: [{ chave: "a", rotulo: "A", tipo: "selecao" }] }, "sem opções");
  ruim({ config: [{ chave: "a", rotulo: "A", tipo: "booleano" }, { chave: "a", rotulo: "B", tipo: "booleano" }] }, "repetido"); ruim({ config: [{ chave: "A b", rotulo: "A", tipo: "booleano" }] }, "chave"); ruim({ versao: 2 }, "migrarConfig"); ruim({ renderizar: undefined }, "renderizar");
  ruim({ compartilhavel: undefined }, "compartilhavel"); ruim({ exige: 5 }, "exige"); assert.equal(N.wsDefValida(def({ versao: 2, migrarConfig: (c) => c })).ok, true); assert.equal(N.wsDefValida(null).ok, false);
});

/* ---------- o registro (js/widgets.js) e os widgets de referência (js/widgets-base.js) ---------- */
function ambiente() {
  const el = (tag, attrs, ...kids) => { const e = { tag, attrs: { ...(attrs || {}) }, children: [], nodeType: 1 }; const add = (k) => { if (Array.isArray(k)) k.forEach(add); else if (k != null && k !== false) e.children.push(typeof k === "number" ? String(k) : k); }; kids.forEach(add); Object.defineProperty(e, "innerHTML", { set() { e.children = []; }, get() { return ""; } }); e.appendChild = (c) => { e.children.push(c); return c; }; return e; };
  const texto = (e) => (e == null ? "" : typeof e === "string" ? e : [e.attrs && e.attrs.text, ...(e.children || []).map(texto)].filter(Boolean).join(" "));
  const rotas = [{ id: "agenda", titulo: "Agenda", grupo: "Painel", ico: "<svg/>" }, { id: "saude", titulo: "Saúde", grupo: "Painel" }, { id: "workspace", titulo: "Workspace", grupo: "Painel" }, { id: "busca", titulo: "Busca", grupo: null }];
  const ctx = { NUCLEO: N, h: el, rkEstado: (t, x, a) => el("div", { class: "estado-" + t, text: x }, a), rkBtn: (t, x) => el("button", { text: x }), logErro() {}, console, setTimeout, clearTimeout, Promise, JSON, Object, Array, String, Date, Number,
    RAC_ROTAS: rotas, ROTAS: Object.fromEntries(rotas.map((r) => [r.id, r])), hojeISO: () => "2026-11-27", svg: () => el("svg"), precisa: () => Promise.resolve() };
  vm.createContext(ctx);
  vm.runInContext(ler("js/widgets.js"), ctx); vm.runInContext(ler("js/widgets-base.js"), ctx);
  return { ctx, texto, el, rodar: (t) => vm.runInContext(t, ctx) };
}
test("js/widgets.js: widgetRegistrar confere o contrato (recusa o inválido e anota o motivo); o catálogo sai ordenado; um tipo novo entra sem mexer no motor", () => {
  const a = ambiente(), W = a.ctx;
  assert.equal(W.widgetLista().length, 4, "os 4 widgets de referência entraram"); assert.equal(W.WIDGETS_ERROS.length, 0, "nenhum foi recusado");
  assert.equal(W.widgetRegistrar({ tipo: "ruim" }), false); assert.equal(W.WIDGETS_ERROS.length, 1); assert.ok(W.WIDGETS_ERROS[0].erros.length > 3);
  assert.equal(W.widgetRegistrar(def({ tipo: "novo.tipo", titulo: "Novo", categoria: "Aaa" })), true); assert.equal(W.widgetLista()[0].tipo, "novo.tipo", "ordenado por categoria e nome"); assert.ok(N.wsAdicionar(N.wsVazio(), W.WIDGETS["novo.tipo"]).ok);
  for (const d of W.widgetLista()) assert.equal(N.wsDefValida(d).ok, true, d.tipo);
  assert.equal(W.WIDGETS["agenda.proximos"].compartilhavel, false, "a Agenda é privada: não entra em espaço compartilhado"); assert.equal(JSON.stringify(W.WIDGETS["agenda.proximos"].exige), JSON.stringify({ modulo: "agenda", dono: true }));
});
test("js/widgets.js: widgetCorpo trata carregando, vazio, erro com 'Tentar de novo' e o tempo esgotado sem derrubar nada", async () => {
  const a = ambiente(), W = a.ctx, it = { id: ID(1), config: {} };
  const corpo = (renderizar) => W.widgetCorpo({ tipo: "t.x", renderizar }, it, {});
  const c1 = corpo(() => ({ nodeType: 1, tag: "p", attrs: { text: "oi" }, children: [] })); assert.match(a.texto(c1), /Carregando/, "enquanto lê"); await new Promise((r) => setTimeout(r, 5)); assert.match(a.texto(c1), /oi/);
  const c2 = corpo(() => ({ vazio: true, texto: "Nada hoje." })); await new Promise((r) => setTimeout(r, 5)); assert.match(a.texto(c2), /Nada hoje/);
  const c3 = corpo(() => Promise.reject(new Error("banco fora"))); await new Promise((r) => setTimeout(r, 5)); assert.match(a.texto(c3), /Não consegui carregar.*banco fora/); assert.match(a.texto(c3), /Tentar de novo/);
  const c4 = corpo(() => { throw new Error("quebrou ao desenhar"); }); await new Promise((r) => setTimeout(r, 5)); assert.match(a.texto(c4), /quebrou ao desenhar/, "erro síncrono também vira aviso");
  const c5 = corpo(() => 42); await new Promise((r) => setTimeout(r, 5)); assert.match(a.texto(c5), /Nada por aqui/);
});
test("js/widgets-base.js: cada widget desenha com a configuração padrão; atalhos só mostram o que a pessoa acessa; a Agenda lê pela fonte e respeita dias e limite", async () => {
  const a = ambiente(), W = a.ctx, ctx = (def, config, extra = {}) => ({ config: N.wsConfigNormalizar(def, config).config, acessivel: () => true, ler: () => Promise.resolve({ v: [] }), ...extra });
  const nota = W.WIDGETS["nota.fixa"], vazio = nota.renderizar(ctx(nota, {})); assert.equal(vazio.vazio, true); assert.match(a.texto(nota.renderizar(ctx(nota, { texto: "Comprar pão" }))), /Comprar pão/);
  const at = W.WIDGETS["atalhos.rotas"]; assert.deepEqual(at.config[0].opcoes.map((o) => o.valor), ["agenda", "saude"], "só rotas de menu, sem o próprio Workspace");
  assert.match(a.texto(at.renderizar(ctx(at, { rotas: ["agenda", "saude"] }, { acessivel: (i) => i === "agenda" }))), /Agenda/); assert.doesNotMatch(a.texto(at.renderizar(ctx(at, { rotas: ["agenda", "saude"] }, { acessivel: (i) => i === "agenda" }))), /Saúde/, "o que a pessoa não acessa não aparece");
  assert.equal(at.renderizar(ctx(at, { rotas: ["saude"] }, { acessivel: () => false })).vazio, true);
  const hoje = W.WIDGETS["data.hoje"]; { const d = new Date(), dia = d.toLocaleDateString("pt-BR", { day: "numeric", month: "long" }), sem = d.toLocaleDateString("pt-BR", { weekday: "long" }); assert.match(a.texto(hoje.renderizar(ctx(hoje, { formato: "curto" }))), new RegExp(dia)); assert.match(a.texto(hoje.renderizar(ctx(hoje, {}))), new RegExp(sem + ".*" + d.getFullYear())); }   // a data de hoje, não a de quando o teste foi escrito
  const ag = W.WIDGETS["agenda.proximos"], ev = [{ data: "2026-11-20", t: "Antigo" }, { data: "2026-11-27", t: "Hoje" }, { data: "2026-12-02", t: "Em 5 dias", href: "#saude" }, { data: "2026-12-30", t: "Longe" }, { data: "2026-11-28", t: "Amanhã" }];
  const r = await ag.renderizar(ctx(ag, { dias: 7, limite: 2 }, { ler: (n) => (assert.equal(n, "agenda"), Promise.resolve({ v: ev })) })); const t = a.texto(r);
  assert.match(t, /Hoje/); assert.match(t, /Amanhã/); assert.doesNotMatch(t, /Antigo|Longe|Em 5 dias/, "passado, além de 7 dias e acima do limite ficam de fora");
  assert.equal((await ag.renderizar(ctx(ag, { dias: 1 }, { ler: () => Promise.resolve({ v: [] }) }))).vazio, true);
  await assert.rejects(() => ag.renderizar(ctx(ag, {}, { ler: () => Promise.reject(new Error("fonte fora")) })), /fonte fora/, "a falha da fonte chega ao contêiner (que mostra o aviso)");
});
test("o motor puro não tem tela nem banco: nenhuma função ws* do núcleo toca em document, window, fetch, localStorage ou Supabase", () => {
  const t = ler("nucleo.js"), i = t.indexOf("/* ===== Workspace (Lote 1"), j = t.indexOf("raiz.RACnucleo={"), bloco = t.slice(i, j);
  assert.ok(bloco.length > 8000, "achou o bloco do motor"); assert.doesNotMatch(bloco.replace(/\/\*[\s\S]*?\*\//g, ""), /\b(document|window|fetch|localStorage|sessionStorage|SB\.|supabase|XMLHttpRequest)\b/);
  assert.doesNotMatch(bloco.replace(/\/\*[\s\S]*?\*\//g, ""), /=>|\blet\b|\bconst\b|`/, "ES5 puro");
});
