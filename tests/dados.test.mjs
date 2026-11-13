// Camada de dados (Fase 2 · A1, docs/planejamento/02-auditoria-arquitetural.md, seções 8 e 9): um cliente só do Supabase para o site
// inteiro, criado em js/dados.js; o Mercado, o login, a Lista e os módulos usam a mesma instância; RACmercado.client, .url e .chave
// continuam como apelidos. Roda o js/dados.js e o mercado.js de verdade num ambiente falso (sem rede, sem Supabase).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const espera = () => new Promise((r) => setTimeout(r, 5));

/* página falsa: o <script> do supabase-js "chega" um pouco depois de pedido; createClient conta quantas vezes rodou */
function pagina({ falhaScript = false } = {}) {
  const scripts = [], criados = [];
  const ctx = { console, Promise, Object, Array, JSON, Error, String, setTimeout };
  ctx.document = {
    createElement: (tag) => ({ tag }),
    head: { appendChild: (s) => { scripts.push(s.src); setTimeout(() => { if (falhaScript) { s.onerror(); return; }
      ctx.window.supabase = { createClient: (url, chave, op) => { const c = { url, chave, op, auth: {}, from: () => ({}) }; criados.push(c); return c; } }; s.onload(); }, 2); } },
  };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(ler("js/dados.js"), ctx, { filename: "js/dados.js" });
  return { ctx, scripts, criados };
}

test("um cliente só: pedidos simultâneos (login, Mercado, Lista) antes da biblioteca chegar recebem a mesma instância", async () => {
  const p = pagina();
  const [a, b, c] = await Promise.all([p.ctx.RACdados.cliente(), p.ctx.RACdados.cliente(), p.ctx.RACdados.cliente()]);
  assert.equal(p.criados.length, 1, "createClient rodou uma vez"); assert.ok(a === b && b === c);
  assert.equal(p.scripts.length, 1, "a biblioteca foi pedida uma vez"); assert.match(p.scripts[0], /@supabase\/supabase-js@\d+\.\d+\.\d+\//, "versão exata do CDN");
  assert.equal(await p.ctx.RACdados.cliente(), a, "depois de pronto, sempre o mesmo"); assert.equal(p.ctx.RACdados._criados(), 1);
  /* a configuração da sessão é a de sempre: ninguém precisa entrar de novo */
  assert.equal(a.url, "https://hofnhbxnfebfnncwxrds.supabase.co"); assert.match(a.chave, /^sb_publishable_/);
  assert.deepEqual(JSON.parse(JSON.stringify(a.op)), { auth: { persistSession: true, autoRefreshToken: true, storageKey: "rac-mercado-auth", experimental: { passkey: true } } });
});

test("sem internet a primeira vez: o erro chega a quem pediu e a próxima tentativa carrega de novo (como antes)", async () => {
  const p = pagina({ falhaScript: true });
  await assert.rejects(p.ctx.RACdados.cliente(), /não carregou/);
  p.ctx.document.head.appendChild = (s) => { setTimeout(() => { p.ctx.window.supabase = { createClient: () => ({ ok: 1 }) }; s.onload(); }, 1); };
  const c = await p.ctx.RACdados.cliente(); assert.deepEqual(c, { ok: 1 }); assert.equal(p.ctx.RACdados._criados(), 1);
});

test("o Mercado usa a mesma instância; RACmercado.client, .url e .chave são apelidos da camada de dados", async () => {
  const p = pagina();
  vm.runInContext(ler("mercado.js"), p.ctx, { filename: "mercado.js" });
  const [doMercado, doSite] = await Promise.all([p.ctx.RACmercado.client(), p.ctx.RACdados.cliente()]);
  assert.equal(doMercado, doSite); assert.equal(p.criados.length, 1, "Mercado e site: um cliente só");
  assert.equal(p.ctx.RACmercado.url, p.ctx.RACdados.url); assert.equal(p.ctx.RACmercado.chave, p.ctx.RACdados.chave);
  assert.equal(await p.ctx.RACmercado.client(), doSite, "o apelido continua devolvendo o mesmo");
});

test("leitura paginada: junta as páginas de 1000 até vir uma incompleta; erro do banco com a mesma mensagem e o código", async () => {
  const p = pagina(), pedidos = [];
  const linhas = Array.from({ length: 2500 }, (_, i) => ({ i }));
  const l = await p.ctx.RACdados.paginar((de) => { pedidos.push(de); return Promise.resolve({ data: linhas.slice(de, de + 1000), error: null }); });
  assert.equal(l.length, 2500); assert.deepEqual(pedidos, [0, 1000, 2000]);
  const exata = await p.ctx.RACdados.paginar((de) => Promise.resolve({ data: de === 0 ? linhas.slice(0, 1000) : [], error: null }));
  assert.equal(exata.length, 1000, "1000 exatas: pede mais uma página, que vem vazia");
  await assert.rejects(p.ctx.RACdados.paginar(() => Promise.resolve({ data: null, error: { message: "permission denied for table x", code: "42501" } })),
    (e) => e instanceof p.ctx.Error && e.message === "permission denied for table x" && e.code === "42501");
  assert.deepEqual(p.ctx.sbOk({ data: [1], error: null }), [1]);
  assert.throws(() => p.ctx.sbOk({ error: { message: "x" } }), /^Error: x$/);
});

test("ninguém mais cria cliente: createClient, o endereço e a chave pública só existem em js/dados.js", () => {
  const site = ["index.html", "nucleo.js", "mercado.js", "sw.js", ...fs.readdirSync(new URL("../js/", import.meta.url)).map((f) => "js/" + f)];
  for (const a of site) {
    const t = ler(a), dados = a === "js/dados.js";
    assert.equal(/createClient\(/.test(t), dados, a + (dados ? " cria o cliente" : " não deveria criar cliente"));
    assert.equal(/sb_publishable_/.test(t), dados, a + ": a chave pública só em js/dados.js");
    assert.equal(/hofnhbxnfebfnncwxrds\.supabase\.co/.test(t), dados, a + ": o endereço só em js/dados.js");
  }
  const app = ler("js/app.js");
  assert.ok(!/RACmercado\.client\(/.test(app), "o login não depende mais do módulo Mercado");
  assert.equal((app.match(/window\.RACdados\.cliente\(\)/g) || []).length, 4, "entrar, senha, Face ID e esqueci a senha usam o cliente único");
  assert.ok(!/function sbOk\(/.test(app) && /function sbOk\(/.test(ler("js/dados.js")), "sbOk mora na camada de dados");
  assert.match(ler("js/lista.js"), /window\.RACdados\|\|\{\}\)\.url/, "os atalhos da Lista leem o endereço da camada de dados");
  const idx = ler("index.html"), ordem = ["nucleo.js", "js/dados.js", "mercado.js", "js/app.js"].map((s) => idx.indexOf(`<script src="${s}"></script>`));
  assert.ok(ordem.every((x) => x > 0) && ordem.every((x, i) => !i || x > ordem[i - 1]), "js/dados.js carrega antes do Mercado e do app");
  assert.match(ler("sw.js"), /"\.\/js\/dados\.js"/, "funciona sem internet");
});
