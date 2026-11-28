// Lote 2 do novo RAC · Minha Casa: as contas PURAS (nucleo.js: wsPeriodo, wm*, WS_MODELOS, wsModeloLayout) e os widgets dos módulos (js/widgets-modulos.js: Hoje, Saúde e Compras) sobre dados simulados.
// Sem rede, sem banco real e sem navegador. Prova: cada widget cumpre o contrato do catálogo; privacidade (Saúde e Hoje privados, Compras compartilhável); dados reais passam pelas mesmas contas da Central;
// estados vazio e erro; configuração independente por instância (duas vezes o mesmo tipo com ajustes diferentes); nenhuma escrita e nenhuma tabela de cópia; os modelos nunca trazem o que a pessoa não pode usar.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");

/* ---------- períodos ---------- */
test("wsPeriodo: janelas móveis e 'este mês' com o trecho equivalente anterior (inclusive virada de mês e de ano)", () => {
  assert.deepEqual(N.wsPeriodo("hoje", "2026-11-27"), { valor: "hoje", de: "2026-11-27", ate: "2026-11-27", antDe: "2026-11-26", antAte: "2026-11-26", rotulo: "hoje", rotuloAnt: "ontem", dias: 1 });
  const s7 = N.wsPeriodo("7d", "2026-11-27"); assert.deepEqual([s7.de, s7.ate, s7.antDe, s7.antAte], ["2026-11-21", "2026-11-27", "2026-11-14", "2026-11-20"]);
  const m = N.wsPeriodo("mes", "2026-03-31"); assert.deepEqual([m.de, m.ate, m.antDe, m.antAte], ["2026-03-01", "2026-03-31", "2026-02-01", "2026-02-28"], "fevereiro não tem dia 31: o trecho anterior vai até o último dia");
  const j = N.wsPeriodo("mes", "2026-01-15"); assert.deepEqual([j.antDe, j.antAte], ["2025-12-01", "2025-12-15"], "janeiro compara com dezembro do ano anterior");
  const a = N.wsPeriodo("12m", "2026-11-27"); assert.equal(a.dias, 365); assert.equal(a.de, "2025-11-28");
  assert.equal(N.wsPeriodo("lixo", "2026-11-27").valor, "30d", "valor desconhecido cai no padrão");
  for (const p of N.WS_PERIODOS) assert.ok(N.wsPeriodo(p, "2026-11-27").de <= "2026-11-27", p);
});

/* ---------- compras ---------- */
const LINHAS = [
  { id: 1, data: "2026-11-26", mercado: "Mercado A (Centro)", numero: "10", categoria: "Mercearia", produto: "Arroz", valor_total: 30 },
  { id: 2, data: "2026-11-26", mercado: "Mercado A (Centro)", numero: "10", categoria: "Bebidas", produto: "Suco", valor_total: 10 },
  { id: 3, data: "2026-11-20", mercado: "Padaria B", numero: "7", categoria: "Padaria", produto: "Pão", valor_total: 12.5 },
  { id: 4, data: "2026-11-10", mercado: "Mercado A (Centro)", numero: "5", categoria: "Mercearia", produto: "Feijão", valor_total: 20 },
  { id: 5, data: "2026-10-12", mercado: "Mercado C", numero: "2", categoria: "Limpeza", produto: "Detergente", valor_total: 8 },
  { id: 6, data: "2026-10-05", mercado: "Mercado C", numero: "1", categoria: "Limpeza", produto: "Sabão", valor_total: "texto" }];
test("wmGasto: total, notas e itens do período, variação sobre o anterior; valor inválido não entra e divisão por zero não vira número", () => {
  const per = N.wsPeriodo("7d", "2026-11-27"), g = N.wmGasto(LINHAS, per);
  assert.deepEqual(g.atual, { total: 40, itens: 2, notas: 1 }); assert.deepEqual(g.anterior, { total: 12.5, itens: 1, notas: 1 }); assert.equal(g.pct, 220);
  const mes = N.wmGasto(LINHAS, N.wsPeriodo("mes", "2026-11-27")); assert.equal(mes.atual.total, 72.5); assert.equal(mes.atual.notas, 3);
  const out = N.wmGasto(LINHAS, N.wsPeriodo("mes", "2026-10-27")); assert.equal(out.atual.total, 8, "a linha com valor 'texto' é ignorada"); assert.equal(out.atual.itens, 1);
  assert.deepEqual(N.wmGasto([], per).atual, { total: 0, itens: 0, notas: 0 }); assert.equal(N.wmGasto([], per).pct, null, "sem base anterior não há percentual");
  const dobro = N.wmGasto([{ data: "2026-11-26", valor_total: 30 }, { data: "2026-11-19", valor_total: 10 }], per); assert.equal(dobro.pct, 200); assert.equal(dobro.delta, 20);
});
test("wmGastoSerie: por dia até 7 dias, por semana até 31 (a sobra do começo se junta) e por mês acima; a soma da série fecha com o total", () => {
  const d7 = N.wmGastoSerie(LINHAS, N.wsPeriodo("7d", "2026-11-27")); assert.equal(d7.length, 7); assert.equal(d7[5].total, 40, "26/11"); assert.equal(d7[6].total, 0);
  const s30 = N.wmGastoSerie(LINHAS, N.wsPeriodo("30d", "2026-11-27")); assert.ok(s30.length >= 4 && s30.length <= 5, "semanas: " + s30.length);
  assert.equal(Math.round(s30.reduce((t, x) => t + x.total, 0) * 100) / 100, N.wmGasto(LINHAS, N.wsPeriodo("30d", "2026-11-27")).atual.total, "a série fecha com o gasto do período");
  const a12 = N.wmGastoSerie(LINHAS, N.wsPeriodo("12m", "2026-11-27")); assert.equal(a12.length, 13, "do mês do começo ao mês de hoje"); assert.equal(a12[a12.length - 1].rotulo, "11/26");
  assert.deepEqual(N.wmGastoSerie(LINHAS, N.wsPeriodo("hoje", "2026-11-27")), [], "um dia só não tem gráfico");
});
test("wmLojasRecentes e wmCategoriasTop: sem repetir loja, mais recente primeiro; categorias pelas mesmas contas da Central, com 'Outras' agrupando o resto", () => {
  const l = N.wmLojasRecentes(LINHAS, 5); assert.deepEqual(l.map((x) => x.loja), ["Mercado A", "Padaria B", "Mercado C"]); assert.equal(l[0].total, 40); assert.equal(l[0].itens, 2);
  assert.equal(N.wmLojasRecentes(LINHAS, 1).length, 1); assert.deepEqual(N.wmLojasRecentes([], 3), []);
  const c = N.wmCategoriasTop(LINHAS, N.wsPeriodo("mes", "2026-11-27"), 2); assert.equal(c.total, 72.5); assert.equal(c.linhas[0].categoria, "Mercearia"); assert.equal(c.linhas.length, 3);
  assert.equal(c.linhas[2].categoria, "Outras"); assert.equal(Math.round(c.linhas.reduce((t, x) => t + x.total, 0) * 100) / 100, 72.5, "nada se perde ao agrupar");
});

/* ---------- hoje e saúde ---------- */
test("wmDiaResumo: hoje, amanhã e os próximos 7 dias (sem inventar 'atrasado')", () => {
  const it = [{ data: "2026-11-26", t: "ontem" }, { data: "2026-11-27", t: "a" }, { data: "2026-11-27", t: "b" }, { data: "2026-11-28", t: "c" }, { data: "2026-12-04", t: "d" }, { data: "2026-12-05", t: "e" }];
  const r = N.wmDiaResumo(it, "2026-11-27"); assert.equal(r.hoje.length, 2); assert.equal(r.amanha, 1); assert.equal(r.semana, 4, "hoje (2) + amanhã (1) + até 04/12 (1)");
  assert.deepEqual(N.wmDiaResumo([], "2026-11-27"), { hoje: [], amanha: 0, semana: 0 }); assert.equal(N.wmDiaResumo([null, {}], "2026-11-27").semana, 0);
});
test("wmSaudeSerie: um valor por dia da janela; dia sem registro fica null (nada é interpolado)", () => {
  const dias = [{ data: "2026-11-25", dados: { passos: 5000 } }, { data: "2026-11-27", dados: { passos: 8000, sono: { total: 27000 } } }];
  const s = N.wmSaudeSerie(dias, "passos", "2026-11-27", 3); assert.deepEqual(s.map((x) => x.valor), [5000, null, 8000]); assert.deepEqual(s.map((x) => x.data), ["2026-11-25", "2026-11-26", "2026-11-27"]);
  assert.equal(N.wmSaudeSerie(dias, "sono", "2026-11-27", 1)[0].valor, 7.5, "sono em horas"); assert.deepEqual(N.wmSaudeSerie(dias, "inexistente", "2026-11-27", 3), []);
});

/* ---------- modelos de página ---------- */
const TIPOS_CASA = ["hoje.resumo", "agenda.proximos", "hoje.tarefas", "saude.indicadores", "saude.atividades", "compras.gastos", "compras.recentes"];
function catalogoFalso(extra = {}) {
  const o = {};
  for (const t of TIPOS_CASA) o[t] = { tipo: t, versao: 1, titulo: t, categoria: "X", descricao: "d", dominio: t.split(".")[0], compartilhavel: !/^(saude|hoje|agenda)/.test(t), tamanhos: { min: [3, 0], padrao: [6, 0], max: [12, 6] }, config: [], renderizar() {} };
  return { ...o, ...extra };
}
test("os modelos: layouts válidos pelo mesmo validador do banco; 'Casa completa' traz três seções; 'Em branco' traz uma seção vazia; tipo ausente é pulado sem erro", () => {
  const cat = catalogoFalso(), v = (l) => N.wsValidar(l);
  const dia = N.wsModeloLayout("dia", cat), comp = N.wsModeloLayout("completa", cat), vazia = N.wsModeloLayout("vazia", cat);
  for (const l of [dia, comp, vazia]) assert.equal(v(l).ok, true, JSON.stringify(v(l).erros));
  assert.deepEqual(comp.secoes.map((s) => s.titulo), ["Meu dia", "Saúde", "Compras"]); assert.equal(comp.secoes[0].itens[0].col, 12, "o resumo do dia abre a página em largura total");
  assert.equal(vazia.secoes.length, 1); assert.equal(vazia.secoes[0].itens.length, 0);
  const ids = comp.secoes.flatMap((s) => s.itens.map((i) => i.id)); assert.equal(new Set(ids).size, ids.length, "ids únicos entre instâncias");
  const sem = { ...cat }; delete sem["saude.atividades"]; delete sem["saude.indicadores"]; assert.deepEqual(N.wsModeloLayout("completa", sem).secoes.map((s) => s.titulo), ["Meu dia", "Compras"], "seção que fica sem nada some");
  assert.equal(N.wsModeloLayout("nao-existe", cat).secoes[0].itens.length, 0);
});
test("privacidade nos modelos: num espaço compartilhado nenhum widget privado (Saúde, Hoje, Agenda) entra, mesmo pelo modelo completo", () => {
  const cat = catalogoFalso(), permite = (def) => N.wsPodeUsarTipo(def, { tipoEspaco: "compartilhado", papel: "editor", modulos: ["mercado", "lista", "agenda", "saude"], dono: false });
  const l = N.wsModeloLayout("completa", cat, { permite }), tipos = l.secoes.flatMap((s) => s.itens.map((i) => i.tipo));
  assert.deepEqual(tipos, ["compras.gastos", "compras.recentes"]); assert.ok(!tipos.some((t) => /^(saude|hoje|agenda)/.test(t)));
  const dono = N.wsModeloLayout("completa", cat, { permite: (d) => N.wsPodeUsarTipo(d, { tipoEspaco: "pessoal", papel: "proprietario", modulos: ["mercado", "lista", "agenda", "saude"], dono: true }) });
  assert.equal(dono.secoes.flatMap((s) => s.itens).length, 7, "no espaço pessoal do dono entra tudo");
});

/* ---------- os widgets (js/widgets-modulos.js) ---------- */
function ambiente({ tabelas = {}, fontes = {}, pessoal = {}, falhar = null } = {}) {
  const el = (tag, attrs, ...kids) => { const e = { tag, attrs: { ...(attrs || {}) }, children: [], nodeType: 1 }; const add = (k) => { if (Array.isArray(k)) k.forEach(add); else if (k != null && k !== false) e.children.push(typeof k === "number" ? String(k) : k); }; kids.forEach(add); Object.defineProperty(e, "childNodes", { get() { return e.children; } }); e.appendChild = (c) => { e.children.push(c); return c; }; return e; };
  const texto = (e) => (e == null ? "" : typeof e === "string" ? e : [e.attrs && e.attrs.text, ...(e.children || []).map(texto)].filter(Boolean).join(" "));
  const consultas = [], escritas = [];
  const SB = { from(t) { const st = { t, f: [], lim: null }, q = { select: () => q, eq: (c, v) => { st.f.push([c, v]); return q; }, gte: (c, v) => { st.f.push(["gte:" + c, v]); return q; }, order: () => q, limit: (n) => { st.lim = n; return q; }, range: (a, b) => { st.ini = a; return q; },
      insert: () => { escritas.push(t + ".insert"); return q; }, update: () => { escritas.push(t + ".update"); return q; }, upsert: () => { escritas.push(t + ".upsert"); return q; }, delete: () => { escritas.push(t + ".delete"); return q; },
      then: (ok, no) => { consultas.push(t + " " + JSON.stringify(st.f)); if (falhar === t) return Promise.resolve({ data: null, error: { message: "tabela fora: " + t } }).then(ok, no);
        let l = (tabelas[t] || []).filter((r) => st.f.every(([c, v]) => (c.startsWith("gte:") ? String(r[c.slice(4)]) >= v : r[c] === v))); if (st.ini) l = []; if (st.lim) l = l.slice(0, st.lim); return Promise.resolve({ data: l, error: null }).then(ok, no); } }; return q; } };
  const kit = {
    rkKpi: (o) => el("kpi", { text: o.rotulo + " " + o.valor + " " + (o.apoio || "") }, o.delta),
    rkDelta: (p) => (p == null ? null : el("delta", { text: (p > 0 ? "+" : "") + p + "%" })),
    rkLista: (ls) => el("ul", null, ls.map((l) => el("li", { text: l.titulo + " " + (l.sub || "") + " " + (l.href || "") }, l.meta))),
    rkLink: (t, x, href) => el("a", { text: x, href }), rkEstado: (t, x) => el("div", { text: x }), rkSelo: (t, x) => el("span", { text: x }),
    rsColunas: (B, V) => el("colunas", { text: "colunas " + V.join(",") }), rsBarras: (L) => el("barras", { text: "barras " + L.map((x) => x.nome + ":" + x.txt).join(",") }),
    h: el, hojeISO: () => "2026-11-27", dataBR: (d) => d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4), precisa: () => Promise.resolve(), sbOk: (r) => { if (r.error) throw new Error(r.error.message); return r.data; },
    dadosPaginar: (f) => Promise.resolve(f(0)).then((r) => { if (r.error) throw new Error(r.error.message); return r.data; }) };
  const ctx = { NUCLEO: N, SB, PESSOAL: pessoal, console, setTimeout, clearTimeout, Promise, JSON, Object, Array, String, Date, Number, Math, isFinite, logErro() {}, ...kit };
  vm.createContext(ctx);
  vm.runInContext(ler("js/widgets.js"), ctx); vm.runInContext(ler("js/widgets-modulos.js"), ctx);
  const tela = (def, config, extra = {}) => ({ config: N.wsConfigNormalizar(def, config).config, acessivel: () => true, usuario: { id: "u" }, ler: (n, c) => (fontes[n] ? Promise.resolve(typeof fontes[n] === "function" ? fontes[n](c) : fontes[n]) : Promise.reject(new Error("fonte desconhecida: " + n))), ...extra });
  return { ctx, texto, consultas, escritas, tela, W: ctx.WIDGETS, rodar: async (tipo, config, extra) => { const d = ctx.WIDGETS[tipo]; return d.renderizar(tela(d, config, extra)); } };
}
const TIPOS_NOVOS = ["hoje.resumo", "hoje.tarefas", "saude.indicadores", "saude.atividades", "saude.evolucao", "compras.gastos", "compras.recentes", "compras.categorias", "compras.lojas", "compras.lista"];
test("catálogo: os 10 widgets dos módulos entram, cumprem o contrato do motor, trazem navegação ao módulo original e a privacidade certa", () => {
  const a = ambiente();
  assert.equal(a.ctx.WIDGETS_ERROS.length, 0, JSON.stringify(a.ctx.WIDGETS_ERROS));
  for (const t of TIPOS_NOVOS) {
    const d = a.W[t]; assert.ok(d, t); assert.equal(N.wsDefValida(d).ok, true, t + ": " + N.wsDefValida(d).erros); assert.ok(d.acoes && d.acoes[0].rota.charAt(0) === "#", t + " leva ao módulo original");
    assert.ok(N.wsAdicionar(N.wsVazio(), d).ok, t + " entra na página com a configuração padrão"); assert.ok(d.exige && d.exige.modulo, t + " exige o módulo");
  }
  for (const t of TIPOS_NOVOS.filter((x) => /^(saude|hoje)\./.test(x))) { assert.equal(a.W[t].compartilhavel, false, t + " é privado"); assert.equal(a.W[t].exige.dono, true, t + " só do dono"); }
  for (const t of TIPOS_NOVOS.filter((x) => /^compras\./.test(x))) assert.equal(a.W[t].compartilhavel, true, t + " é dado da casa");
  /* a Saúde nunca passa no motor em espaço compartilhado, e o motor responde o motivo */
  const ctxComp = { tipoEspaco: "compartilhado", papel: "proprietario", modulos: ["saude", "mercado"], dono: true };
  for (const t of ["saude.indicadores", "saude.atividades", "saude.evolucao", "hoje.resumo", "hoje.tarefas"]) assert.deepEqual(N.wsPodeUsarTipo(a.W[t], ctxComp), { ok: false, motivo: "tipo_privado" }, t);
  assert.equal(N.wsPodeUsarTipo(a.W["saude.indicadores"], { tipoEspaco: "pessoal", papel: "proprietario", modulos: ["saude"], dono: false }).motivo, "so_do_dono", "quem não é o dono não usa nem no espaço pessoal");
  assert.equal(N.wsPodeUsarTipo(a.W["compras.gastos"], { ...ctxComp, modulos: [] }).motivo, "modulo_indisponivel");
  assert.equal(new Set(TIPOS_NOVOS).size, 10);
});
test("nenhum widget escreve em tabela de negócio nem lê tabela que não seja a do próprio módulo (sem cópia de dado)", () => {
  const src = ler("js/widgets-modulos.js").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(src.replace(/SB\.rpc\("rac_iniciar_espacos"\)/g, ""), /\.(insert|update|upsert|delete|rpc)\(/, "só leitura (a única chamada de função é a leitura dos espaços da pessoa, rac_iniciar_espacos, a mesma do Workspace)"); assert.doesNotMatch(src, /localStorage|sessionStorage|fetch\(|XMLHttpRequest|rac-ia|racIA|\.functions\./, "sem armazenamento, rede própria nem IA");
  const tabelas = [...src.matchAll(/SB\.from\("([a-z_]+)"\)/g)].map((m) => m[1]).sort(); assert.deepEqual([...new Set(tabelas)], ["captura_itens", "compras", "lista"], "as mesmas tabelas que a Central e a Lista já leem; a Saúde e a Agenda vêm pelas fontes");
  assert.doesNotMatch(src, /=>|\blet\b|\bconst\b|`/, "ES5 puro");
});
const AGENDA = { v: [{ data: "2026-11-27", t: "Consulta", sub: "Eddie" }, { data: "2026-11-27", t: "Aula MBA", href: "#mba" }, { data: "2026-11-28", t: "Vacina" }, { data: "2026-12-03", t: "Aniversário" }], vazio: false };
test("hoje.resumo: conta hoje, amanhã, semana e tarefas abertas; lista o que é de hoje; vazio; falha da Agenda vira erro e a das tarefas não derruba o resto", async () => {
  const a = ambiente({ fontes: { agenda: AGENDA }, tabelas: { lista: [{ id: 1, tipo: "tarefa", feito: false, item: "Trocar filtro", criado: "2026-11-01" }, { id: 2, tipo: "tarefa", feito: true, item: "Feita" }, { id: 3, tipo: "compra", feito: false, item: "Leite" }] } });
  const t = a.texto(await a.rodar("hoje.resumo", {})); assert.match(t, /Hoje 2 compromissos/); assert.match(t, /Amanhã 1 item/); assert.match(t, /Próximos 7 dias 4/); assert.match(t, /Tarefas abertas 1 tarefa/); assert.match(t, /Consulta/); assert.match(t, /Aula MBA/);
  assert.match(a.texto(await a.rodar("hoje.resumo", { itens: 1, tarefas: false })), /Consulta/); assert.doesNotMatch(a.texto(await a.rodar("hoje.resumo", { itens: 1, tarefas: false })), /Tarefas abertas|Aula MBA/);
  assert.ok(a.consultas.every((c) => /^lista /.test(c)), "só lê a Lista"); assert.ok(a.consultas.some((c) => c.includes('"tipo","tarefa"') || c.includes("tarefa")));
  const vazio = ambiente({ fontes: { agenda: { v: [], vazio: true } } }); assert.equal((await vazio.rodar("hoje.resumo", {})).vazio, true, "sem agenda e sem tarefas: dia livre");
  const semAgenda = ambiente({ fontes: {} }); await assert.rejects(() => semAgenda.rodar("hoje.resumo", {}), /fonte desconhecida/);
  const tarefasFora = ambiente({ fontes: { agenda: AGENDA }, falhar: "lista" }); assert.doesNotMatch(tarefasFora.texto(await tarefasFora.rodar("hoje.resumo", {})), /Tarefas abertas/, "falha nas tarefas: o resto continua");
  assert.equal(a.escritas.length, 0);
});
test("hoje.tarefas: abertas da mais antiga à mais nova, respeita o limite, vazio e erro", async () => {
  const mk = (n) => ({ id: n, tipo: "tarefa", feito: false, item: "Tarefa " + n, criado: "2026-11-0" + n });
  const a = ambiente({ tabelas: { lista: [1, 2, 3, 4].map(mk) } }); const t = a.texto(await a.rodar("hoje.tarefas", { limite: 2 })); assert.match(t, /Tarefa 1/); assert.match(t, /Tarefa 2/); assert.doesNotMatch(t, /Tarefa 3/);
  assert.equal((await ambiente().rodar("hoje.tarefas", {})).vazio, true); await assert.rejects(() => ambiente({ falhar: "lista" }).rodar("hoje.tarefas", {}), /tabela fora/);
});
const DIAS = (n, f) => Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(2026, 10, 27 - (n - 1 - i))).toISOString().slice(0, 10); return { data: d, dados: f(i), atualizado: d + "T20:00:00Z" }; });
const SAUDE = (dias, ativs = []) => ({ ok: true, v: { dias, ativs, legado: {}, atualizado: "2026-11-27T20:00:00Z" }, vazio: false, ultimo: "2026-11-27" });
test("saude.indicadores e saude.evolucao: números reais da semana contra a anterior; poucos dias, sem dados e valores ocultos nos Ajustes", async () => {
  const dias = DIAS(21, (i) => ({ passos: 6000 + i * 100, sono: { total: 7 * 3600 + i * 60 }, vfc: { noite: 50 } })), a = ambiente({ fontes: { saude: SAUDE(dias) } });
  const t = a.texto(await a.rodar("saude.indicadores", {})); assert.match(t, /Sono/); assert.match(t, /Passos por dia/); assert.match(t, /Variabilidade cardíaca/); assert.match(t, /média de 7 dias/); assert.match(t, /treinos? nos últimos 7 dias/);
  assert.doesNotMatch(a.texto(await a.rodar("saude.indicadores", { indicadores: ["passos"], treinos: false })), /Sono|treino/);
  const ev = a.texto(await a.rodar("saude.evolucao", { indicador: "passos", dias: "7" })); assert.match(ev, /colunas/); assert.equal(ev.match(/colunas ([\d.,]+)/)[1].split(",").length, 7, "uma barra por dia da janela");
  const pouco = ambiente({ fontes: { saude: SAUDE(DIAS(2, () => ({ passos: 1 }))) } }); assert.equal((await pouco.rodar("saude.indicadores", {})).vazio, true); assert.match((await pouco.rodar("saude.indicadores", {})).texto, /Poucos dias/);
  const nada = ambiente({ fontes: { saude: { ok: true, v: { dias: [], ativs: [] }, vazio: true } } }); assert.equal((await nada.rodar("saude.indicadores", {})).vazio, true); assert.equal((await nada.rodar("saude.evolucao", {})).vazio, true);
  const oculto = ambiente({ fontes: { saude: SAUDE(dias) }, pessoal: { saudePrefs: { ocultar: true } } }); const to = oculto.texto(await oculto.rodar("saude.indicadores", {})); assert.match(to, /•••/); assert.doesNotMatch(to, /\d{1,2},\d h|6\.\d{3}/, "valores mascarados");
  assert.match((await oculto.rodar("saude.evolucao", {})).texto, /ocultos nos Ajustes/);
  await assert.rejects(() => ambiente().rodar("saude.indicadores", {}), /fonte desconhecida/, "falha da fonte chega ao contêiner");
});
test("saude.atividades: lê só os treinos mais novos pela fonte (sem os dias), esconde os tipos ocultos (bicicleta ergométrica, ciclismo…) e respeita o limite e a máscara", async () => {
  let pedido = null; const ativs = [{ id: 1, inicio: "2026-11-26T07:00:00", tipo: "running", dados: { distancia: 5000, duracao: 1800 } }, { id: 2, inicio: "2026-11-25T07:00:00", tipo: "walking", dados: { distancia: 2000, duracao: 1200 } }, { id: 3, inicio: "2026-11-24T07:00:00", tipo: "cycling", dados: { distancia: 20000, duracao: 3600 } }];
  const a = ambiente({ fontes: { saude: (c) => { pedido = c; return { ok: true, v: { dias: [], ativs }, vazio: false }; } } });
  const t = a.texto(await a.rodar("saude.atividades", { limite: 5 })); assert.equal(pedido.semDias, true, "não lê os dias do relógio"); assert.ok(pedido.limiteAtiv <= 30, "limite de linhas na consulta"); assert.match(t, /running|corrida|Corrida/i); assert.match(t, /Walking/i, "atividade recente inclui a caminhada, como no RAC Hoje"); assert.doesNotMatch(t, /cycling/i, "os tipos de TREINO_OCULTOS ficam de fora, como no Hoje");
  assert.match(t, /#saude/, "cada treino leva à página do treino");
  const um = a.texto(await a.rodar("saude.atividades", { limite: 1 })); assert.doesNotMatch(um, /Walking/i, "o limite vale");
  const m = ambiente({ fontes: { saude: { ok: true, v: { dias: [], ativs }, vazio: false } }, pessoal: { saudePrefs: { ocultar: true } } }); assert.doesNotMatch(m.texto(await m.rodar("saude.atividades", {})), /5,?0? km|30 min/, "distância e duração ocultas");
  assert.equal((await ambiente({ fontes: { saude: { ok: true, v: { dias: [], ativs: [] }, vazio: true } } }).rodar("saude.atividades", {})).vazio, true);
});
test("compras.*: leem a visão 'compras' com o período pedido; gasto, notas, categorias, lojas e lista a comprar; vazio e erro; só leitura", async () => {
  const a = ambiente({ tabelas: { compras: LINHAS.filter((l) => typeof l.valor_total === "number"), lista: [{ id: 1, tipo: "compra", feito: false, item: "Leite", qtd: "2", criado: "2026-11-20" }, { id: 2, tipo: "compra", feito: true, item: "Pão" }] } });
  const g = a.texto(await a.rodar("compras.gastos", { periodo: "mes" })); assert.match(g, /R\$ 72,50/); assert.match(g, /3 notas/); assert.match(g, /colunas/);
  assert.doesNotMatch(a.texto(await a.rodar("compras.gastos", { periodo: "mes", grafico: false })), /colunas/);
  const so = a.texto(await a.rodar("compras.gastos", { periodo: "mes", categoria: "Padaria" })); assert.match(so, /R\$ 12,50/, "a categoria filtra o total"); assert.match(so, /Padaria/);
  assert.match(a.texto(await a.rodar("compras.recentes", { limite: 2, modo: "detalhado" })), /Mercado A.*2 itens/s); assert.doesNotMatch(a.texto(await a.rodar("compras.recentes", { limite: 1 })), /Padaria/);
  const c = a.texto(await a.rodar("compras.categorias", { periodo: "mes", limite: 2 })); assert.match(c, /Mercearia:R\$ 50,00/); assert.match(c, /Outras/);
  assert.match(a.texto(await a.rodar("compras.lojas", { limite: 2 })), /Mercado A/); assert.match(a.texto(await a.rodar("compras.lista", {})), /Leite/); assert.doesNotMatch(a.texto(await a.rodar("compras.lista", {})), /Pão/, "só o que falta comprar");
  assert.equal((await ambiente().rodar("compras.gastos", {})).vazio, true); assert.equal((await ambiente().rodar("compras.recentes", {})).vazio, true); assert.equal((await ambiente().rodar("compras.lista", {})).vazio, true);
  await assert.rejects(() => ambiente({ falhar: "compras" }).rodar("compras.gastos", {}), /tabela fora/); assert.equal(a.escritas.length, 0, "nenhuma escrita");
});
test("independência das instâncias: o mesmo tipo duas vezes, com períodos e categorias diferentes, mostra números diferentes sobre a mesma leitura; a configuração é do item, não da posição", async () => {
  const a = ambiente({ tabelas: { compras: LINHAS.filter((l) => typeof l.valor_total === "number") } });
  const t7 = a.texto(await a.rodar("compras.gastos", { periodo: "7d" })), tmes = a.texto(await a.rodar("compras.gastos", { periodo: "mes" }));
  assert.match(t7, /R\$ 40,00/); assert.match(tmes, /R\$ 72,50/); assert.notEqual(t7, tmes);
  let l = N.wsVazio(); const def = a.W["compras.gastos"], x = N.wsAdicionar(l, def, { config: { periodo: "7d" } }), y = N.wsAdicionar(x.layout, def, { config: { periodo: "mes" } });
  assert.notEqual(x.id, y.id, "ids de instância diferentes"); const itens = y.layout.secoes[0].itens; assert.deepEqual(itens.map((i) => i.config.periodo), ["7d", "mes"]);
  const mexe = N.wsConfigurar(y.layout, y.id, { periodo: "12m" }, def); assert.equal(mexe.layout.secoes[0].itens[0].config.periodo, "7d", "configurar uma não muda a outra"); assert.equal(mexe.layout.secoes[0].itens[1].config.periodo, "12m");
  const mov = N.wsMover(mexe.layout, y.id, "principal", 0); assert.equal(mov.layout.secoes[0].itens[0].config.periodo, "12m", "a configuração acompanha o item ao mudar de posição");
  assert.equal(a.consultas.filter((c) => /^compras/.test(c)).length < 4, true, "leituras que se cobrem dividem a consulta (memória de 60 s)");
});
test("configuração inválida (período fora da lista, número fora dos limites, indicador inexistente) volta ao padrão sem quebrar o widget", async () => {
  const a = ambiente({ tabelas: { compras: LINHAS.filter((l) => typeof l.valor_total === "number") }, fontes: { saude: SAUDE(DIAS(21, (i) => ({ passos: 5000 + i }))) } });
  const n = N.wsConfigNormalizar(a.W["compras.gastos"], { periodo: "x", categoria: 3 }); assert.equal(n.config.periodo, "mes"); assert.equal(a.texto(await a.rodar("compras.gastos", { periodo: "x" })).includes("R$"), true);
  assert.equal(N.wsConfigNormalizar(a.W["compras.recentes"], { limite: 99 }).config.limite, 5);
  assert.match(a.texto(await a.rodar("saude.evolucao", { indicador: "inexistente" })), /colunas/, "indicador desconhecido usa passos");
});
