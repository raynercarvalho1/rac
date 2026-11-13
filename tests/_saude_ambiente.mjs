// Auxiliar dos testes da Saúde (DS-4.3): um banco falso que ENTENDE a consulta (gte, order, range, limit; pagina de verdade) e REGISTRA tudo o que é pedido, e geradores de dados
// inventados (nenhum dado real, nenhum local ou coordenada de verdade). Hoje = 13/11/2026. O marco de propriedade é 01/01/2026.
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

export const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
createRequire(import.meta.url)("../nucleo.js");
export const N = globalThis.RACnucleo;
export const HOJE = "2026-11-13", dia = (n) => N.somaDiasISO(HOJE, n);
export const js = (x) => JSON.parse(JSON.stringify(x === undefined ? null : x));
export const pausa = (ms = 15) => new Promise((r) => setTimeout(r, ms));
export const agoraMenos = (h) => new Date(Date.now() - h * 3600e3).toISOString();

/* banco falso: tab = { garmin_dia: [...], garmin_ativ: [...] }; erro = { garmin_dia: "mensagem" } faz a tabela falhar; atraso = { garmin_dia: ms } demora a resposta.
   Só entende o que o site usa: select, gte, order (uma coluna), range, limit. Registra cada consulta (tabela, operações e quantas linhas entregou). */
export function bancoSaude({ garmin_dia = [], garmin_ativ = [], erro = {}, atraso = {}, invoke } = {}) {
  const log = [], tab = { garmin_dia, garmin_ativ }, chamadas = { invoke: [] };
  function consulta(t) {
    const st = { t, ops: [], entregues: null }; log.push(st);
    const f = []; let ord = null, rng = null, lim = null;
    const rodar = () => new Promise((ok) => setTimeout(ok, atraso[t] || 0)).then(() => {
      if (erro[t]) return { data: null, error: { message: erro[t] } };
      let r = (tab[t] || []).slice();
      for (const [c, v] of f) r = r.filter((x) => String(x[c]) >= v);
      if (ord) r.sort((a, b) => (a[ord.c] < b[ord.c] ? -1 : a[ord.c] > b[ord.c] ? 1 : 0) * (ord.asc ? 1 : -1));
      if (lim != null) r = r.slice(0, lim);
      if (rng) r = r.slice(rng[0], rng[1] + 1);
      st.entregues = r.length; return { data: r.map((x) => ({ ...x })), error: null };
    });
    const q = { select(c) { st.ops.push(["select", c]); return q; }, gte(c, v) { f.push([c, v]); st.ops.push(["gte", c, v]); return q; },
      order(c, o) { ord = { c, asc: !o || o.ascending !== false }; st.ops.push(["order", c, ord.asc]); return q; }, range(a, b) { rng = [a, b]; st.ops.push(["range", a, b]); return q; },
      limit(n) { lim = n; st.ops.push(["limit", n]); return q; },
      insert() { st.ops.push(["insert"]); return q; }, update() { st.ops.push(["update"]); return q; }, upsert() { st.ops.push(["upsert"]); return q; }, delete() { st.ops.push(["delete"]); return q; },
      then(a, b) { return rodar().then(a, b); } };
    return q;
  }
  const SB = { from: consulta, functions: { invoke: (n, o) => { chamadas.invoke.push([n, o && o.body]); return invoke ? invoke(n, o) : Promise.resolve({ data: { erro: "sem função" }, error: null }); } } };
  return { SB, log, chamadas, lidas: (t) => log.filter((x) => x.t === t).length, escritas: () => log.filter((x) => x.ops.some((o) => /insert|update|upsert|delete/.test(o[0]))) };
}

/* dados inventados, previsíveis */
export function diaGarmin(data, o = {}) {
  const i = Math.round((Date.parse(data + "T12:00:00Z") - Date.parse("2026-01-01T12:00:00Z")) / 864e5), v = ((i % 4) + 4) % 4;
  return { data, atualizado: o.atualizado || agoraMenos(1), dados: {
    passos: 7000 + v * 800, metaPassos: 8000, distancia: 5000 + v * 500, fcRepouso: 50 + (i % 2), fcMin: 46, fcMax: 150, estresse: 30 + (i % 3), estresseAlto: 0.12, bbMax: 70 + v, bbMin: 10, bbCarga: 60, bbGasto: 55,
    minModerados: 12, minVigorosos: 4, vfc: { noite: 55 + (i % 3), faixaMin: 48, faixaMax: 66, status: "BALANCED" },
    sono: { total: (7 + v * 0.25) * 3600, nota: 78 + v, inicio: "23:" + (10 + v * 5), fim: "06:" + (20 + v * 5), profundo: 5400 + v * 300, rem: 6000 + v * 200, leve: 13000, acordado: 1200 }, ...(o.extra || {}) } };
}
/* n dias terminando em fim (inclusive), do mais antigo ao mais novo; f(data, i) pode devolver { extra } ou null (dia sem linha) */
export function gerarDias(n, fim = HOJE, f) { const l = []; for (let k = n - 1; k >= 0; k--) { const d = N.somaDiasISO(fim, -k), o = f ? f(d, k) : {}; if (o !== null) l.push(diaGarmin(d, o || {})); } return l; }
export function ativ(id, inicio, tipo, d = {}) { return { id, inicio: inicio.length === 10 ? inicio + "T07:00:00" : inicio, tipo, dados: { nome: "Treino " + id, duracao: 3000, fc: 140, ...d } }; }
/* treinos de 2026: musculação, corrida (com VO2 máx e carga) e bike, a cada 2 dias, de hoje para trás */
export function gerarAtivs(n = 60, fim = HOJE) {
  const l = [];
  for (let k = 0; k < n; k++) {
    const d = N.somaDiasISO(fim, -2 * k), t = ["strength_training", "running", "cycling"][k % 3];
    l.push(ativ(1000 + k, d + "T07:00:00", t, t === "strength_training" ? { series: 12, repeticoes: 110, carga: 90 + (k % 4) * 10, efeitoAerobico: 2.1, efeitoAnaerobico: 1.4, local: "Academia Fictícia" }
      : t === "running" ? { distancia: 6000, emMovimento: 2000, duracao: 2100, fc: 150 + (k % 3), subida: 30, carga: 150 + (k % 5) * 10, vo2max: 48 + (k % 6 === 1 ? 1 : 0), efeitoAerobico: 3.2, efeitoAnaerobico: 0.5, zonas: [200, 600, 900, 300, 50], local: "Parque Fictício" }
        : { distancia: 20000, duracao: 3600, fc: 135, carga: 120, efeitoAerobico: 2.8 }));
  }
  return l;
}
/* o legado: dias e treinos de antes do marco (01/01/2026) que existem no banco e NÃO podem entrar em conta alguma */
export const LEGADO_DIAS = [diaGarmin("2025-12-30", { extra: { fcRepouso: 99, estresse: 99 } }), diaGarmin("2025-11-20", { extra: { fcRepouso: 98 } })];
export const LEGADO_ATIVS = [ativ(7, "2025-12-31T23:50:00", "running", { carga: 999, distancia: 1000 }), ativ(8, "2025-11-02T08:00:00", "strength_training", { carga: 998 })];

/* o ambiente do site para a fonte e para a tela: as funções de verdade de js/app.js (formatos), de js/dados.js (paginação) e o contrato das fontes */
const APP = ler("js/app.js"), daApp = (re) => { const m = re.exec(APP); if (!m) throw new Error("não achei " + re); return m[0]; };
export const FORMATOS = [/  function fmtN\(v\)\{[^\n]*/, /  function dd\(n\)\{[^\n]*/, /  function maisDias\(iso,n\)\{[^\n]*/, /  function dataBR\(iso\)\{[^\n]*/, /  function brl\(v\)\{[^\n]*/].map(daApp).join("\n");
export function ambienteBase(banco, extra = {}) {
  const erros = [], ctx = { console, Promise, Object, Array, JSON, Date, Math, String, Number, Error, isFinite, RegExp, parseInt, parseFloat, setTimeout, clearTimeout, NUCLEO: N, hojeISO: () => HOJE, isOwner: () => true,
    logErro: (o, e) => erros.push([o, e && e.message]), SB: banco.SB, EU: { id: "dono-1" }, PESSOAL: {}, sbOk: (r) => { if (r.error) throw new Error(r.error.message); return r.data; }, ...extra };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(FORMATOS, ctx, { filename: "app.js (formatos)" });
  vm.runInContext("var DADOS_PAGINA=1000;" + /function dadosPaginar\(consulta\)\{[\s\S]*?return pag\(0\)\}/.exec(ler("js/dados.js"))[0], ctx, { filename: "dados.js (dadosPaginar)" });
  for (const f of ["js/fontes.js", "js/fonte-saude.js"]) vm.runInContext(ler(f), ctx, { filename: f });
  return Object.assign(ctx, { erros });
}
