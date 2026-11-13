// Kit de gráficos (Fase 2 · A2, docs/planejamento/02-auditoria-arquitetural.md, seção 9): os gráficos rs* saíram de js/resumo.js para
// js/graficos.js (módulo leve). Compras online, Alimentação, Custos de IA e Painel não carregam mais o Resumo, e nenhum módulo usa nome de
// outro sem declarar a dependência (MOD_DEPS). O código dos gráficos é o mesmo de antes (cópia da main em tests/fixtures/fase2/).
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { ler, modDeps, fecho, MODULOS, modulosUsados, usosDeOutros } from "./_dependencias.mjs";

const app = ler("js/app.js"), D = modDeps(app);
const ANTES = { "esportes-central": ["esportes"], conexoes: ["mba"], sistema: ["familia", "mba", "saude"], carreira: ["sistema"], bebe: ["familia", "oms"], resumo: ["saude", "mba", "familia"], seguranca: ["sistema"], painel: ["resumo", "sistema"], alimentacao: ["resumo"], compras: ["resumo"], hoje: ["sistema", "mba"], iacustos: ["resumo"] };

test("o código dos gráficos é o mesmo de antes: RS_MESES, rsColunas, rsBarras, rsKpis e rsTabela, letra por letra, agora em js/graficos.js", () => {
  const antes = ler("tests/fixtures/fase2/graficos-antes.js").split("\n").slice(1).join("\n"), g = ler("js/graficos.js"), r = ler("js/resumo.js");
  assert.ok(antes.length > 1500 && g.includes(antes), "o bloco inteiro está no kit, sem mudança");
  for (const n of ["rsColunas", "rsBarras", "rsKpis", "rsTabela"]) { assert.match(g, new RegExp(`^  function ${n}\\(`, "m")); assert.ok(!new RegExp(`function ${n}\\(`).test(r), n + " saiu do Resumo"); }
  assert.ok(!/var RS_MESES=/.test(r) && /^  var RS_MESES=/m.test(g));
  assert.match(r, /function rsBaldes\(/, "o que só o Resumo usa continua nele");
  assert.match(ler("sw.js"), /"\.\/js\/graficos\.js"/, "funciona sem internet");
});

test("Compras, Alimentação, Custos de IA e Painel não carregam mais o Resumo; Saúde, MBA e Família só onde são usadas", () => {
  for (const m of ["compras", "alimentacao", "iacustos", "painel"]) {
    assert.ok(fecho(ANTES, m).has("resumo"), m + " carregava o Resumo antes"); assert.ok(!fecho(D, m).has("resumo"), m + " não carrega mais o Resumo");
    assert.ok(fecho(D, m).has("graficos"), m + " carrega o kit de gráficos");
  }
  /* antes: abrir Compras carregava Resumo, Saúde, MBA e Família (P-05). Agora só o kit */
  assert.deepEqual([...fecho(ANTES, "compras")].sort(), ["familia", "mba", "resumo", "saude"]);
  assert.deepEqual([...fecho(D, "compras")], ["graficos"]); assert.deepEqual([...fecho(D, "iacustos")], ["graficos"]);
  /* a Alimentação envia as fotos pela Família (enviarArquivos): a dependência real fica declarada; Saúde e MBA não carregam mais
     (a Família traz a sua fonte leve, js/fonte-familia.js, com a configuração dos integrantes: Fase 2 · A4) */
  assert.deepEqual([...fecho(D, "alimentacao")].sort(), ["familia", "fonte-familia", "fontes", "graficos"]);
  assert.ok(usosDeOutros("js/alimentacao.js").enviarArquivos === "js/familia.js");
  /* o Painel usa de verdade Saúde, MBA, Família e a Agenda do Sistema: agora declarado, sem o Resumo */
  assert.deepEqual([...fecho(D, "painel")].filter((m) => !/^fonte/.test(m)).sort(), ["familia", "graficos", "mba", "saude", "sistema"]);
  /* o Resumo continua com o que usa */
  assert.deepEqual([...fecho(D, "resumo")].filter((m) => !/^fonte/.test(m)).sort(), ["familia", "graficos", "mba", "saude"]);
  for (const m of ["compras", "alimentacao", "iacustos", "painel", "resumo"]) assert.ok(![...fecho(D, m)].some((x) => x === "resumo"), m);
  /* nada além disto mudou no MOD_DEPS da A2 */
  for (const m of Object.keys(ANTES)) if (!["compras", "alimentacao", "iacustos", "painel", "resumo", "hoje", "sistema"].includes(m)) assert.deepEqual(D[m], ANTES[m], m);
  assert.deepEqual(D.sistema, [...ANTES.sistema, "fonte-agenda"], "o Sistema ganhou só a fonte da Agenda (A4)");
});

test("nenhuma dependência escondida: todo módulo declara (MOD_DEPS) os módulos cujos nomes usa", () => {
  /* ciclos controlados de antes, documentados no Documento 02 (seção 4.2): a Família carrega o Bebê quando precisa (precisa(["bebe"]))
     e Esportes e a Central Esportiva abrem sempre juntos pela rota (ROTA_MODS esportes: ["esportes", "esportes-central"]) */
  const SOB_DEMANDA = { familia: ["bebe"], esportes: ["esportes-central"] };
  const faltas = [];
  for (const a of MODULOS) {
    const m = a.slice(3, -3), tem = fecho(D, m), ok = SOB_DEMANDA[m] || [];
    for (const u of modulosUsados(a)) if (!tem.has(u) && !ok.includes(u)) faltas.push(`${m} usa ${u} (${Object.entries(usosDeOutros(a)).filter(([, x]) => x === "js/" + u + ".js").map(([n]) => n).join(", ")}) sem declarar`);
  }
  assert.deepEqual(faltas, []);
  assert.match(ler("js/familia.js"), /precisa\(\["bebe"\]\)/, "o Bebê continua sob demanda dentro da Família");
});

test("moeda: BRL e brl são a mesma função (eram duas cópias idênticas em js/app.js), com o mesmo resultado", () => {
  assert.match(app, /^  var BRL=brl;$/m); assert.equal((app.match(/function BRL\(/g) || []).length, 0);
  const brl = new Function("v", /function brl\(v\)\{([^\n]*)\}/.exec(app)[1]);
  assert.equal(brl(1234.5), (1234.5).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
});

test("os gráficos do kit funcionam sozinhos (só a base): barra com valor fixo, rótulo e a dica padrão (racDica)", () => {
  class El { constructor(t) { this.tag = t; this.filhos = []; this.attrs = {}; this.text = ""; } appendChild(c) { this.filhos.push(c); return c; } setAttribute(k, v) { this.attrs[k] = v; } }
  const ligados = [];
  const ctx = { Math, Object, Array, String, setTimeout, location: {},
    h: (tag, attrs, ...f) => { const e = new El(tag); for (const [k, v] of Object.entries(attrs || {})) if (k === "text") e.text = v; else if (k === "class") e.className = v; else e.attrs[k] = v; const add = (c) => { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(add); else e.appendChild(typeof c === "object" ? c : { text: String(c) }); }; f.forEach(add); return e; },
    racDica: { ligar: (el, f) => { ligados.push([el, f]); return el; } }, vbFim: () => {}, vbRotulo: (a, b) => ({ rot: [a, b] }) };
  vm.createContext(ctx); vm.runInContext(ler("js/graficos.js"), ctx, { filename: "js/graficos.js" });
  const B = [{ nome: "10/11/2026", cima: "10", baixo: "S" }, { nome: "11/11/2026", cima: "11", baixo: "T" }];
  const vb = ctx.rsColunas(B, [3, 0], String, (i, v) => [B[i].nome, v + " treinos"]);
  assert.equal(vb.className, "vbars vbpeso rsvb"); assert.equal(vb.filhos.length, 2);
  assert.equal(vb.filhos[0].filhos[0].text, "3", "valor fixo em cima"); assert.equal(vb.filhos[1].filhos[0].text, "–");
  const js = (x) => JSON.parse(JSON.stringify(x));   // valores criados dentro do vm têm outro Array
  assert.deepEqual(js(ligados.map(([, f]) => f())), [["10/11/2026", "3 treinos"], ["11/11/2026", "0 treinos"]], "toda barra tem a dica padrão");
  const hb = ctx.rsBarras([{ nome: "Mercado A", v: 10, txt: "R$ 10" }]); assert.equal(hb.className, "hbars"); assert.deepEqual(js(ligados.at(-1)[1]()), ["Mercado A", "R$ 10"]);
  assert.equal(ctx.rsKpis([["Total", "R$ 1"], ["Vazio", ""]]).filhos.length, 1, "KPI vazio não aparece");
  assert.equal(ctx.RS_MESES.length, 12);
});
