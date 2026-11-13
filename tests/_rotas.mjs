// Auxiliar dos testes: roda o registro de rotas de verdade (js/rotas.js, Fase 2 · A3) num ambiente falso e devolve o que o site usa:
// as rotas (sem as funções), tabs, DA_CASA, ROTA_MODS e o HTML do menu lateral que ele gera.
import fs from "node:fs";
import vm from "node:vm";

export const lerArq = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
export function registro() {
  let menu = "";
  const ctx = { console, Object, Array, JSON, String, document: { getElementById: (id) => (id === "navgrp" ? { insertAdjacentHTML: (onde, html) => { menu += html; } } : null) } };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(lerArq("js/rotas.js"), ctx, { filename: "js/rotas.js" });
  const js = (x) => JSON.parse(JSON.stringify(x));
  return { rotas: js(ctx.RAC_ROTAS.map((r) => ({ ...r, abrir: typeof r.abrir === "function" }))), tabs: js(ctx.tabs), DA_CASA: js(ctx.DA_CASA), ROTA_MODS: js(ctx.ROTA_MODS), menu, html: ctx.rotasMenuHtml() };
}
/* uma rota do registro, com o texto da função que desenha (para conferir que argumentos ela passa) */
export function rota(id) {
  const ctx = { console, Object, Array, JSON, String, document: { getElementById: () => null } };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(lerArq("js/rotas.js"), ctx, { filename: "js/rotas.js" });
  const r = ctx.ROTAS[id]; if (!r) return null;
  return { ...JSON.parse(JSON.stringify({ ...r, abrir: null })), abrirTexto: r.abrir ? String(r.abrir) : "" };
}
