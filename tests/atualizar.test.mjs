// Botão de atualizar, Etapa A (o ↻ no topo, js/app.js "Botão de atualizar"): as regras do núcleo (formulário não salvo, quando pode atualizar, quando reler o
// PESSOAL, o endereço "fresco" dos JSON, a hora), o service worker rodando de verdade com cache e rede falsos, e a ligação na tela
// (um botão no topo, sem chamadas duplicadas, sem Garmin, Gmail ou IA automáticos). Sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("formulário não salvo: só conta o que a pessoa mudou; busca, filtro, desligado e botões não contam; arquivo escolhido conta", () => {
  const S = N.atuFormSujo;
  assert.equal(S([]), false); assert.equal(S(null), false);
  assert.equal(S([{ tipo: "text", valor: "Pizza", inicial: "Pizza" }]), false, "preenchido pelo site e não mexido");
  assert.equal(S([{ tipo: "text", valor: "Pizza grande", inicial: "Pizza" }]), true);
  assert.equal(S([{ tipo: "textarea", valor: "obs", inicial: "" }]), true);
  assert.equal(S([{ tipo: "select", valor: 2, inicial: 0 }]), true); assert.equal(S([{ tipo: "select", valor: 1, inicial: 1 }]), false);
  assert.equal(S([{ tipo: "checkbox", marcado: true, marcadoInicial: false }]), true); assert.equal(S([{ tipo: "radio", marcado: false, marcadoInicial: false }]), false);
  assert.equal(S([{ tipo: "file", arquivos: 2 }]), true); assert.equal(S([{ tipo: "file", arquivos: 0 }]), false);
  assert.equal(S([{ tipo: "search", valor: "sushi", inicial: "" }]), false, "busca é preservada, não bloqueia");
  assert.equal(S([{ tipo: "text", valor: "x", inicial: "", filtro: true }]), false, "filtro marcado com data-atu-filtro");
  assert.equal(S([{ tipo: "text", valor: "x", inicial: "", desligado: true }]), false);
  for (const t of ["button", "submit", "reset", "hidden", "image"]) assert.equal(S([{ tipo: t, valor: "x", inicial: "" }]), false, t);
  assert.equal(S([{ tipo: "number", valor: 0, inicial: "0" }]), false, "número e texto iguais");
  assert.equal(S([{ tipo: "text", valor: null, inicial: "" }]), false);
  assert.equal(S([{ tipo: "search", valor: "a", inicial: "" }, { tipo: "date", valor: "2026-11-02", inicial: "2026-11-01" }]), true);
});

test("quando pode atualizar: já atualizando, sem internet, tarefa em andamento e formulário bloqueiam, nessa ordem, sem descartar nada", () => {
  const P = N.atuPode;
  assert.deepEqual(P({ online: true }), { ok: true, motivo: "", texto: "" });
  assert.equal(P({ rodando: true, online: false, sujo: true }).motivo, "rodando", "toque repetido não faz nada");
  assert.equal(P({ online: false, ocupado: "x", sujo: true }).motivo, "offline");
  const o = P({ online: true, ocupado: "leitura com IA", sujo: true });
  assert.equal(o.motivo, "ocupado"); assert.match(o.texto, /Espere terminar: leitura com IA/);
  const f = P({ online: true, sujo: true });
  assert.equal(f.ok, false); assert.equal(f.motivo, "formulario"); assert.match(f.texto, /Salve ou cancele.*nada foi descartado/);
  assert.match(P({ online: false }).texto, /Os dados de antes continuam na tela/);
  assert.equal(P({}).ok, true, "online desconhecido não bloqueia");
});

test("PESSOAL só é relido quando é seguro: dono, com a tabela, sem pendência, conflito ou gravação em curso", () => {
  const R = N.atuRelerPessoal;
  assert.equal(R({ dono: true, semTabela: false, pendentes: 0, conflitos: 0 }), true);
  assert.equal(R({ dono: false }), false, "a casa (Fernanda) não tem o PESSOAL");
  assert.equal(R({ dono: true, semTabela: true }), false);
  assert.equal(R({ dono: true, pendentes: 1 }), false, "alteração deste aparelho esperando envio");
  assert.equal(R({ dono: true, conflitos: 2 }), false); assert.equal(R({ dono: true, gravando: 1 }), false); assert.equal(R(), false);
});

test("JSON do site com ?atualizar=1 (uma vez, preservando o resto); APIs de fora e o que não é JSON ficam iguais; a hora", () => {
  const U = N.atuUrlFresca;
  assert.equal(U("noticias.json"), "noticias.json?atualizar=1");
  assert.equal(U("newsletter.json?v=123"), "newsletter.json?v=123&atualizar=1");
  assert.equal(U("./vagas.json#x"), "./vagas.json?atualizar=1#x");
  assert.equal(U("noticias.json?atualizar=1"), "noticias.json?atualizar=1");
  assert.equal(U("https://statsapi.mlb.com/api/v1/schedule"), "https://statsapi.mlb.com/api/v1/schedule");
  assert.equal(U("https://raynercarvalho.com.br/noticias.json"), "https://raynercarvalho.com.br/noticias.json", "endereço completo não é mexido");
  assert.equal(U("js/app.js"), "js/app.js"); assert.equal(U("manifest.webmanifest"), "manifest.webmanifest"); assert.equal(U(""), "");
  assert.equal(N.atuHora(new Date(2026, 10, 2, 9, 5).getTime()), "09:05"); assert.equal(N.atuHora(NaN), "");
});

/* o sw.js de verdade, num ambiente falso: cache em memória e uma rede que responde ou falha */
function sw({ rede }) {
  const ouvintes = {}, caixas = {}, chamadas = [];
  const cacheDe = (nome) => (caixas[nome] = caixas[nome] || new Map());
  const caches = {
    open: async (nome) => ({ match: async (k) => cacheDe(nome).get(typeof k === "string" ? k : k.url), put: async (k, r) => { cacheDe(nome).set(typeof k === "string" ? k : k.url, r); } }),
    match: async () => undefined, keys: async () => Object.keys(caixas), delete: async () => true,
  };
  const resp = (corpo) => ({ ok: true, corpo, clone() { return resp(corpo); } });
  const ctx = { self: { location: { origin: "https://raynercarvalho.com.br", href: "https://raynercarvalho.com.br/" }, addEventListener: (t, f) => (ouvintes[t] = f) },
    caches, URL, Response: { error: () => ({ ok: false, erro: true }) },
    fetch: async (req, o) => { chamadas.push({ url: req.url, cache: o && o.cache }); if (!rede.on) throw new TypeError("Failed to fetch"); return resp(rede.corpo); } };
  vm.runInNewContext(ler("sw.js"), ctx);
  const pedir = async (url) => { let p; ouvintes.fetch({ request: { method: "GET", url, mode: "cors" }, respondWith: (x) => (p = x) }); return p; };
  return { pedir, chamadas, guardar: (k, corpo) => cacheDe("rac-dados").set(k, resp(corpo)) };
}

test("service worker: ?atualizar=1 vai à rede agora e renova a cópia; sem rede devolve a cópia de antes; sem ele continua 'guardado primeiro'", async () => {
  const rede = { on: true, corpo: "novo" }, s = sw({ rede }), K = "https://raynercarvalho.com.br/noticias.json";
  s.guardar(K, "velho");
  assert.equal((await s.pedir(K + "?v=1")).corpo, "velho", "o normal abre na hora com a cópia guardada (como hoje)");
  await new Promise((r) => setTimeout(r, 0));
  rede.corpo = "mais novo";
  const r = await s.pedir(K + "?atualizar=1");
  assert.equal(r.corpo, "mais novo", "a atualização mostra o que está no servidor agora");
  assert.equal(s.chamadas.at(-1).cache, "no-cache");
  assert.equal((await s.pedir(K)).corpo, "mais novo", "a cópia foi renovada");
  rede.on = false;
  assert.equal((await s.pedir(K + "?atualizar=1")).corpo, "mais novo", "sem rede: a cópia de antes, a tela não fica vazia");
  const s2 = sw({ rede: { on: false } });
  assert.equal((await s2.pedir("https://raynercarvalho.com.br/vagas.json?atualizar=1")).erro, true, "sem rede e sem cópia: erro (a página mostra a falha)");
});

test("tela: um botão no topo ao lado de Voltar e Início, aviso com a hora, uma atualização por vez, ping antes de mexer na tela", () => {
  const html = ler("index.html"), js = ler("js/app.js");
  assert.match(html, /<button type="button" class="homebtn" id="voltarbtn" hidden>[\s\S]*?<\/button>\n\s+<button type="button" class="homebtn atubtn" id="atubtn" aria-label="Atualizar esta página"[^>]*>[\s\S]*?<span class="atuh"><\/span><\/button>\n\s+<a class="homebtn" id="homebtn"/);
  assert.match(html, /<p class="atust" id="atust" role="status" aria-live="polite" hidden><\/p>/);
  assert.match(html, /\.ptitle \.atubtn\{[^}]*min-width:44px;min-height:44px/, "toque de 44 px");
  assert.match(html, /prefers-reduced-motion:reduce\)\{\.ptitle \.atubtn\.girando svg\{animation:none\}/);
  assert.match(js, /\$\("#atubtn"\)\.addEventListener\("click",function\(\)\{atuAtualizar\(\)\}\)/);
  const f = js.slice(js.indexOf("function atuAtualizar("), js.indexOf("\n", js.indexOf("ATU.rodando=false;ATU.fresco=false")));
  assert.match(f, /NUCLEO\.atuPode\(\{rodando:ATU\.rodando,online:navigator\.onLine/);
  assert.match(f, /NUCLEO\.atuFormSujo\(atuCampos\(raiz\)\.concat\(atuCampos\(\$\("#capfundo"\)\)\)\)/, "também a captura rápida aberta");
  assert.ok(f.indexOf('SB.rpc("ping")') < f.indexOf("atuPadrao(raiz)") && f.indexOf('SB.rpc("ping")') < f.indexOf("pessoalCarregar()"), "o banco responde antes de qualquer mudança na tela");
  assert.match(f, /NUCLEO\.atuRelerPessoal\(\{dono:isOwner\(\),semTabela:SEM_TABELA,pendentes:pendentes\(\)\.length,conflitos:Object\.keys\(SIS\.conflitos\)\.length\}\)/);
  assert.match(f, /reler\?pessoalCarregar\(\):Promise\.resolve\(\)/);
  assert.match(f, /m\.atualizar\?m\.atualizar\(\)/, "Etapa B: o módulo que se registrar usa o próprio caminho");
  assert.match(f, /atuReporBuscas\(raiz,buscas\);window\.scrollTo\(0,y\)/, "busca e rolagem voltam");
  assert.match(f, /ATU\.ultima\[sec\]=Date\.now\(\)/); assert.match(f, /Os dados de antes continuam na tela/);
  assert.match(f, /\.then\(function\(r\)\{ATU\.rodando=false;ATU\.fresco=false;ATU\.semExternos=false;atuBotao\(\);return r\}\)/, "sempre libera o botão");
  assert.ok(!/location\.reload/.test(f), "não recarrega o site inteiro");
  assert.match(js, /document\.documentElement\.setAttribute\("data-sec",top\);atuBotao\(\);/, "cada página mostra a sua última hora");
  assert.match(js, /function getJson\(u\)\{if\(typeof ATU!=="undefined"&&ATU\.fresco\)u=NUCLEO\.atuUrlFresca\(u\)/);
  assert.match(js, /\["focusin","pointerdown","keydown"\]\.forEach\(function\(t\)\{document\.addEventListener\(t,atuAntes,true\)\}\)/, "o valor antes do primeiro toque");
});

test("Garmin, Gmail e IA ficam fora: o Início não lê o Gmail sozinho, o treino não chama o relógio, a IA em andamento faz esperar", () => {
  const js = ler("js/app.js"), saude = ler("js/saude.js");
  assert.match(js, /if\(tk&&!ATU\.semExternos\)carregar\(tk\);else cabecalho/);
  assert.match(saude, /TREINO_DET\[id\]\?Promise\.resolve\(TREINO_DET\[id\]\):ATU\.semExternos\?Promise\.reject\(/);
  assert.match(js, /var fim=atuTarefa\("leitura com IA"\);\n\s+return SB\.functions\.invoke\("rac-ia",\{body:corpo\}\)\.then\(function\(r\)\{fim\(\);return r\},function\(e\)\{fim\(\);throw e\}\)/);
  const f = js.slice(js.indexOf("/* ===== Botão de atualizar"), js.indexOf("/* ===== Captura rápida"));
  assert.ok(!/functions\.invoke|gmBuscar|gmConectar|racIA\(|saudeSincronizar/.test(f), "a atualização não chama nenhuma sincronização");
  assert.ok(!/\.finally\(|=>|\blet |\bconst /.test(f), "ES5 puro");
});

test("Etapa B: o Painel não tem mais o próprio botão, a Saúde mantém o do Garmin; os módulos se ligam só por atuModulo (testes em atualizar_modulos)", () => {
  assert.ok(!/text:"Atualizar"/.test(ler("js/painel.js")), "o ↻ do topo atualiza o Painel");
  assert.match(ler("js/saude.js"), /text:"Atualizar agora"/);
  assert.match(ler("js/app.js"), /atuBotao\(\);if\(!ATU\.rodando\)atuAviso\(""\);/, "o aviso de uma página não fica na outra");
  for (const f of fs.readdirSync(new URL("../js/", import.meta.url))) if (f !== "app.js") assert.ok(!/atuRegistrar\(/.test(ler("js/" + f)), f + ": usa atuModulo (busca, confere, troca)");
  assert.equal(/var MOD_VERSAO="([^"]+)"/.exec(ler("js/app.js"))[1], /const VERSAO = "([^"]+)"/.exec(ler("sw.js"))[1]);
});
