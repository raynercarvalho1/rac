// Auxiliar dos testes da Fase 2 (A2 e A4): lê o MOD_DEPS de js/app.js e procura, em cada módulo, os nomes globais de OUTRO módulo que ele usa
// (dependência escondida). Os nomes vêm do mesmo critério de tests/estrutura.test.mjs (função ou var de topo, dois espaços de recuo).
// É uma aproximação por texto (sem comentários e sem textos entre aspas): serve para pegar o que um módulo usa sem declarar.
import fs from "node:fs";

const raiz = new URL("../", import.meta.url);
export const ler = (a) => fs.readFileSync(new URL(a, raiz), "utf8").replace(/\r\n/g, "\n");
/* arquivos de base: carregados em toda página (index.html), antes de qualquer módulo */
export const BASE = ["js/app.js", "js/dados.js", "js/rotas.js"];
export const MODULOS = fs.readdirSync(new URL("js/", raiz)).filter((f) => f.endsWith(".js")).map((f) => "js/" + f).filter((a) => !BASE.includes(a));

export function modDeps(app = ler("js/app.js")) {
  const m = /var MOD_DEPS=(\{[^;]*\});/.exec(app);
  return JSON.parse(m[1].replace(/([{,])\s*([A-Za-z_][\w]*)\s*:/g, '$1"$2":'));
}
/* tudo o que carrega antes do módulo n (dependências das dependências) */
export function fecho(deps, n) {
  const visto = new Set(), fila = [...(deps[n] || [])];
  while (fila.length) { const x = fila.shift(); if (visto.has(x)) continue; visto.add(x); fila.push(...(deps[x] || [])); }
  return visto;
}
export function nomesDeTopo(txt) {
  const nomes = [...txt.matchAll(/^  function ([A-Za-z_$][\w$]*)\(/gm)].map((m) => m[1]);
  for (const m of txt.matchAll(/^  var ([A-Za-z_$][\w$]*)\s*=/gm)) nomes.push(m[1]);
  return nomes;
}
export function semComentariosNemTextos(t) {
  return t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/"(?:[^"\\\n]|\\.)*"/g, '""').replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    /* expressões regulares literais (depois de ( , = : [ ! & | ? { } ; ou return) */
    .replace(/([(,=:[!&|?{};]|\breturn)\s*\/(?![*/])(?:[^/\\\n[]|\\.|\[(?:[^\]\\\n]|\\.)*\])+\/[gimsuy]*/g, "$1 /x/");
}
/* o nome é declarado dentro do próprio arquivo (var local, parâmetro de função)? então não é o global de outro módulo */
function local(t, n) {
  const e = n.replace(/\$/g, "\\$");
  if (new RegExp("\\bvar\\s+" + e + "\\b").test(t) || new RegExp("\\bvar\\s[^;]*?,\\s*" + e + "\\s*[=,;]").test(t)) return true;
  for (const m of t.matchAll(/function\s*[\w$]*\s*\(([^)]*)\)/g)) if (m[1].split(",").map((x) => x.trim()).includes(n)) return true;
  if (new RegExp("function\\s+" + e + "\\s*\\(").test(t)) return true;   // função interna (não de topo) com o mesmo nome
  return false;
}
/* nomes de outro módulo que o arquivo usa: {nome: arquivo onde o nome é definido}. O uso protegido (typeof X!=="undefined") é opcional e não conta */
export function usosDeOutros(arquivo) {
  const dono = {};
  for (const a of MODULOS) for (const n of nomesDeTopo(ler(a))) if (!dono[n]) dono[n] = a;
  const proprio = new Set(nomesDeTopo(ler(arquivo))), t = semComentariosNemTextos(ler(arquivo)), usos = {};
  for (const [n, a] of Object.entries(dono)) {
    if (a === arquivo || proprio.has(n) || local(t, n)) continue;
    if (new RegExp("typeof\\s*" + n.replace(/\$/g, "\\$") + "\\b").test(t)) continue;
    if (new RegExp("(^|[^\\w$.])" + n.replace(/\$/g, "\\$") + "(?![\\w$]|\\s*:(?!:))").test(t)) usos[n] = a;
  }
  return usos;
}
/* módulos (sem js/ e .js) dos quais o arquivo depende de fato, pelos nomes */
export function modulosUsados(arquivo) { return [...new Set(Object.values(usosDeOutros(arquivo)).map((a) => a.slice(3, -3)))].sort(); }
