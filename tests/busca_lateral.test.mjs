// Busca da barra lateral (js/app.js, "Busca na barra lateral"): os times da MLB vêm de js/esportes.js, que só carrega sob demanda.
// Antes (P-19, Documento 02) o foco na busca chamava getTeams() direto: sem o módulo, ReferenceError e os times nunca entravam.
// Roda o trecho de verdade num ambiente falso (sem rede): Esportes carregado, não carregado, falha ao carregar e a casa.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const APP = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const BLOCO = APP.slice(APP.indexOf("  /* Busca na barra lateral"), APP.indexOf("  var buscaVez=0;"));
const espera = () => new Promise((r) => setTimeout(r, 0));
const TIMES = [{ id: 119, name: "Los Angeles Dodgers" }, { id: 147, name: "New York Yankees" }];

/* precisa(["esportes"]) "carrega" o módulo: só depois disso getTeams e logoUrl existem, como no site */
function montar({ dono = true, carregado = false, falhaCarga = false } = {}) {
  const ouvintes = {}, pedidos = [], erros = [];
  const busca = { addEventListener: (t, f) => (ouvintes[t] = f) };
  const ctx = {
    document: { querySelectorAll: () => [] }, XCATS: [], $: (s) => (s === "#busca" ? busca : null),
    isOwner: () => dono, chamadasTimes: 0,
    precisa: (l) => { pedidos.push(l.join(",")); if (falhaCarga) return Promise.reject(new Error("sem internet")); carregar(); return Promise.resolve(); },
  };
  function carregar() {
    ctx.getTeams = () => { ctx.chamadasTimes++; return Promise.resolve(TIMES); };
    ctx.logoUrl = (id) => "https://www.mlbstatic.com/team-logos/" + id + ".svg";
  }
  if (carregado) carregar();
  vm.createContext(ctx);
  vm.runInContext(BLOCO + "\n;this.DEST_=DEST;", ctx, { filename: "app.js (busca lateral)" });
  const focar = async () => { try { ouvintes.focus(); } catch (e) { erros.push(e); } await espera(); await espera(); };
  return { ctx, pedidos, erros, focar, times: () => JSON.parse(JSON.stringify(ctx.DEST_.filter((d) => d.logo))) };
}

test("Esportes ainda não carregado: o foco carrega o módulo antes de pedir os times (sem erro) e eles entram na busca", async () => {
  const m = montar({ carregado: false });
  assert.equal(typeof m.ctx.getTeams, "undefined", "o cenário do P-19: o módulo não está na página");
  await m.focar();
  assert.deepEqual(m.erros, [], "nenhum ReferenceError");
  assert.deepEqual(m.pedidos, ["esportes"]);
  assert.deepEqual(m.times().map((d) => [d.t, d.href, d.logo]), [
    ["Los Angeles Dodgers", "#esportes/beisebol/time-119", "https://www.mlbstatic.com/team-logos/119.svg"],
    ["New York Yankees", "#esportes/beisebol/time-147", "https://www.mlbstatic.com/team-logos/147.svg"]]);
  await m.focar();
  assert.equal(m.times().length, 2, "o segundo foco não duplica");
  assert.equal(m.ctx.chamadasTimes, 1);
});

test("Esportes já carregado (o Início carrega pelo cartão de esportes): a busca dos times continua igual", async () => {
  const m = montar({ carregado: true });
  await m.focar();
  assert.deepEqual(m.erros, []);
  assert.equal(m.times().length, 2);
  assert.equal(m.ctx.chamadasTimes, 1);
});

test("sem internet para carregar o módulo: nada quebra e o próximo foco tenta de novo", async () => {
  const m = montar({ falhaCarga: true });
  await m.focar();
  assert.deepEqual(m.erros, []);
  assert.equal(m.times().length, 0);
  await m.focar();
  assert.equal(m.pedidos.length, 2, "tentou de novo");
});

test("a casa (Fernanda) não tem Esportes: o foco não carrega o módulo nem pede os times (nada muda para ela)", async () => {
  const m = montar({ dono: false });
  await m.focar();
  assert.deepEqual(m.erros, []);
  assert.deepEqual(m.pedidos, []);
  assert.equal(m.times().length, 0);
});

test("o trecho usa o carregador de módulos (precisa) e não chama getTeams fora dele", () => {
  assert.match(BLOCO, /precisa\(\["esportes"\]\)\.then\(function\(\)\{return getTeams\(\)\}\)/);
  assert.equal((BLOCO.match(/getTeams\(/g) || []).length, 1);
  assert.ok(!/\bconst |\blet |=>/.test(BLOCO), "ES5 puro");
});
