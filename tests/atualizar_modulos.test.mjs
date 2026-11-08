// Botão de atualizar, Etapa B: cada módulo com dados em memória lê de novo, mantém o que está na tela enquanto lê, só troca depois que
// TODAS as leituras vierem, e numa falha (inteira ou de uma fonte só) não muda nada. Roda o código de verdade (o bloco do botão em
// js/app.js e os módulos de js/) num ambiente falso: um banco que responde, falha ou fica esperando, e uma tela mínima. Sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const APP = ler("js/app.js");
const BLOCO = APP.slice(APP.indexOf("/* ===== Botão de atualizar"), APP.indexOf("/* ===== Captura rápida"));
const espera = () => new Promise((r) => setTimeout(r, 0));

/* banco falso: SB.from(t)... é "thenable"; a resposta de cada tabela vem de resp[t] (dados, {erro}, função ou promessa) */
function bancoFalso(resp) {
  const log = [], chamadas = { invoke: 0 };
  function resposta(nome, st) {
    let r = resp[nome];
    if (typeof r === "function") r = r(st);
    return Promise.resolve(r).then((x) => (x && x.erro ? { data: null, error: { message: x.erro } } : { data: x === undefined ? [] : x, error: null }));
  }
  function consulta(nome) {
    const st = { t: nome, ops: [] }; log.push(st);
    const p = new Proxy({}, { get(_, k) {
      if (k === "then") { const pr = resposta(nome, st); return pr.then.bind(pr); }
      return (...a) => { st.ops.push([k, ...a]); return p; };
    } });
    return p;
  }
  const SB = {
    from: (t) => consulta(t),
    rpc: (n) => consulta("rpc:" + n),
    functions: { invoke: () => { chamadas.invoke++; return Promise.reject(new Error("não pode chamar função aqui")); } },
    storage: { from: (b) => ({ createSignedUrls: (ps) => resposta("urls:" + b, { ps }), list: () => resposta("lista:" + b, {}) }) },
    auth: { mfa: { listFactors: () => resposta("auth:fatores", {}), getAuthenticatorAssuranceLevel: () => resposta("auth:aal", {}) }, passkey: { list: () => resposta("auth:passkeys", {}) } },
  };
  return { SB, log, chamadas, lidas: (t) => log.filter((x) => x.t === t).length };
}

/* o site num ambiente falso: o bloco do botão de verdade + os módulos pedidos */
function montar({ sec, hash, modulos = [], resp = {}, extra = {} }) {
  const banco = bancoFalso(resp);
  const rolagens = [], avisos = [];
  const raiz = { campos: [], querySelectorAll: (s) => (/search|data-atu-filtro/.test(s) ? raiz.campos.filter((c) => c.type === "search" || c.filtro) : raiz.campos), querySelector: () => null };
  const ctx = {
    NUCLEO: N, console, Promise, Object, Array, JSON, Date, Math, String, Number, Error, Proxy, clearTimeout, isFinite,
    /* os prazos da tela (aviso, validade do índice) não seguram o teste */
    setTimeout: (f, ms) => { const t = setTimeout(f, ms); if (ms > 50 && t.unref) t.unref(); return t; },
    SB: banco.SB, navigator: { onLine: true }, location: { hash: hash || "#" + sec }, scrollY: 640,
    scrollTo: (x, y) => rolagens.push(y), Event: class { constructor(t) { this.type = t; } },
    localStorage: { getItem: () => null, setItem() {}, key: () => null, length: 0 },
    document: { documentElement: { getAttribute: () => sec }, getElementById: (id) => (id === sec ? raiz : null), querySelector: () => null, addEventListener() {} },
    $: (s) => (s === "#atust" ? { set textContent(t) { avisos.push(t); }, className: "", hidden: true } : null),
    sbOk: (r) => { if (r.error) throw new Error(r.error.message); return r.data; },
    hojeISO: () => "2026-11-02", maisDias: (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); },
    novoId: (() => { let i = 0; return () => "id" + ++i; })(), logErro() {}, isOwner: () => true, EU: { id: "u1" },
    SEM_TABELA: false, pendentes: () => [], SIS: { conflitos: {} }, PESSOAL: {}, pessoalCarregar: () => { ctx.pessoalLido++; return Promise.resolve(); }, pessoalLido: 0,
    route: () => { ctx.redesenhos++; }, redesenhos: 0,
    /* a rede: o getJson de verdade (js/app.js) pede por aqui */
    fetch: (u) => { ctx.jsons.push(u); let r = resp["json:" + u.replace(/\?.*$/, "")]; if (typeof r === "function") r = r();
      return Promise.resolve(r).then((x) => ({ ok: !!x && !x.erro, status: 500, json: () => Promise.resolve(x) })); }, jsons: [],
    fmtN: String, dadosDe: (r) => r.dados || {}, norm: N.norm, dataBR: (s) => s, BRL: String, tipoInfo: () => ["", "Registro"], ativTipo: () => ["Corrida"],
    mbaAulas: () => [], mbaAvals: () => [], mbaFin: () => null, items: [], agendaColetar: () => Promise.resolve([]),
    ...extra,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(BLOCO, ctx, { filename: "app.js (botão de atualizar)" });
  vm.runInContext(/function getJson\(u\)\{[^\n]*/.exec(APP)[0], ctx, { filename: "app.js (getJson)" });
  /* o redesenho de verdade (route + espera da página) fica de fora: aqui só conta que aconteceu, depois da troca */
  vm.runInContext("function atuPadrao(raiz){redesenhos++;return Promise.resolve(0)}", ctx);
  for (const m of modulos) vm.runInContext(ler("js/" + m + ".js"), ctx, { filename: m + ".js" });
  return { ctx, banco, raiz, rolagens, avisos, mod: () => ctx.ATU.mods[sec] };
}
/* uma resposta que só chega quando o teste mandar */
function portao() { let abrir; const p = new Promise((r) => (abrir = r)); return { p, abrir }; }
const pedido = (id, est, total) => ({ id, data: "2026-10-30", estabelecimento: est, plataforma: "ifood", modo: "delivery", subtotal: total, taxa_entrega: 0, taxa_servico: 0, gorjeta: 0, desconto_loja: 0, desconto_plataforma: 0, total_pago: total, arquivos: [], pedido_itens: [{ id: "i" + id, ordem: 0, descricao: "Pizza", qtd: 1, total, desconto: 0 }] });

/* ---------------------------------------------------------------- Alimentação */
test("Alimentação: lê pedidos e Mercado de novo, a tela antiga fica durante a leitura, troca só no fim e guarda aba, busca e pedido aberto", async () => {
  const g = portao();
  const s = montar({ sec: "alimentacao", modulos: ["alimentacao"], resp: { pedidos: () => g.p, alimentacao_gastos: [{ data: "2026-10-01", estabelecimento: "Mercado X", categoria: "comida", produto: "Arroz", valor: "10" }] } });
  const A = s.ctx.ALI; A.pedidos = { ok: true, v: [{ id: "velho" }] }; A.mercado = { ok: true, v: [] }; A.aba = "pedidos"; A.aberto = "p2";
  const velho = A.pedidos;
  const pr = s.mod().atualizar();
  await espera();
  assert.equal(s.banco.lidas("pedidos"), 1, "consulta real ao banco");
  assert.equal(A.pedidos, velho, "durante a leitura, os pedidos de antes continuam");
  assert.equal(s.ctx.redesenhos, 0, "nada é redesenhado antes de chegar tudo");
  g.abrir([pedido("p1", "Pizzaria", 50), pedido("p2", "Sushi", 80)]);
  await pr;
  assert.deepEqual([...A.pedidos.v.map((x) => x.id)], ["p1", "p2"], "trocou pelos novos");
  assert.equal(A.mercado.v[0].valor_total, 10);
  assert.equal(s.ctx.redesenhos, 1, "redesenha uma vez, depois da troca");
  assert.equal(A.aba, "pedidos"); assert.equal(A.aberto, "p2", "o pedido aberto continua aberto");
  assert.deepEqual([...(await A.carregando)[0].v.map((x) => x.id)], ["p1", "p2"], "o redesenho usa os dados novos, sem ler de novo");
});

test("Alimentação: falha inteira ou só de uma fonte não muda nada (nem pela metade)", async () => {
  for (const [nome, resp] of [["tudo", { pedidos: { erro: "rede caiu" }, alimentacao_gastos: { erro: "rede caiu" } }], ["só o Mercado", { pedidos: [pedido("novo", "X", 1)], alimentacao_gastos: { erro: "timeout" } }], ["só os pedidos", { pedidos: { erro: "timeout" }, alimentacao_gastos: [] }]]) {
    const s = montar({ sec: "alimentacao", modulos: ["alimentacao"], resp });
    const A = s.ctx.ALI, P = { ok: true, v: [{ id: "velho" }] }, M = { ok: true, v: [{ valor_total: 5 }] };
    A.pedidos = P; A.mercado = M; A.carregando = Promise.resolve([P, M]); const c0 = A.carregando;
    await assert.rejects(s.mod().atualizar(), /não consegui ler/, nome);
    assert.equal(A.pedidos, P, nome + ": pedidos de antes"); assert.equal(A.mercado, M, nome + ": Mercado de antes"); assert.equal(A.carregando, c0, nome);
    assert.equal(s.ctx.redesenhos, 0, nome + ": a tela não é redesenhada");
  }
});

test("Alimentação: a gravação do pedido em andamento faz o botão esperar e libera ao terminar", () => {
  const t = ler("js/alimentacao.js");
  assert.match(t, /atuDurante\("a gravação do pedido",function\(\)\{return SB\.rpc\("pedido_salvar"/);
});

/* ---------------------------------------------------------------- Compras Online */
test("Compras: lê de novo e troca só com a leitura inteira; falha mantém tudo; lote em conferência bloqueia", async () => {
  const g = portao();
  const s = montar({ sec: "compras", modulos: ["compras"], resp: { compras_online: () => g.p } });
  const C = s.ctx.CC; C.dados = [{ id: "velha" }]; C.aba = "lista"; C.aberto = "velha";
  const pr = s.mod().atualizar(); await espera();
  assert.equal(s.banco.lidas("compras_online"), 1); assert.deepEqual(C.dados, [{ id: "velha" }], "a lista antiga fica durante a leitura");
  g.abrir([{ id: "c1", total_pago: "10", compras_online_itens: [], compras_online_docs: [] }]); await pr;
  assert.equal(C.dados[0].id, "c1"); assert.equal(C.aberto, "velha"); assert.equal(C.aba, "lista");
  const s2 = montar({ sec: "compras", modulos: ["compras"], resp: { compras_online: { erro: "falhou" } } });
  s2.ctx.CC.dados = [{ id: "fica" }];
  await assert.rejects(s2.mod().atualizar(), /compras \(falhou\)/); assert.deepEqual(s2.ctx.CC.dados, [{ id: "fica" }]); assert.equal(s2.ctx.redesenhos, 0);
  /* lote importado esperando conferência: o redesenho apagaria o que não foi salvo */
  C.aba = "importar"; C.lote = { isConnected: true };
  assert.match(s.mod().ocupado(), /conferência da importação/);
  C.lote.isConnected = false; assert.equal(s.mod().ocupado(), "", "saiu de Importar: libera");
  const t = ler("js/compras.js");
  for (const x of [/fimT=atuTarefa\("a leitura dos documentos"\)/, /fimT=atuTarefa\("a gravação da compra"\)/, /atuDurante\("o envio dos documentos"/, /fimT=atuTarefa\("a leitura do Gmail"\)/])
    assert.match(t, x);
});

/* ---------------------------------------------------------------- Painel */
test("Painel: relê o período aberto e o relógio do banco; troca só se toda fonte boa continuar boa; o Painel não tem mais botão próprio", async () => {
  const resp = { compras: [], registros: [], lista: [], orcamentos: [{ categoria: "Mercado", valor: 500 }], pedidos: [], compras_online: [], garmin_dia: [{ data: "2026-11-01", dados: {}, atualizado: "x" }], garmin_ativ: [] };
  const s = montar({ sec: "painel", modulos: ["saude", "painel"], resp });
  const P = s.ctx.PAINEL; P.n = 3; P.aba = "financas";
  s.ctx.SAUDE.dias = [{ data: "2026-01-01", velho: true }]; s.ctx.SAUDE.ativs = [];
  const antes = await s.ctx.pnCarregar(3); P.ult = { n: 3, D: antes };
  assert.equal(s.banco.lidas("garmin_dia"), 0, "o carregar normal usa o relógio da memória");
  await s.mod().atualizar();
  assert.equal(s.banco.lidas("garmin_dia"), 1, "o botão relê o relógio do banco");
  assert.equal(s.banco.lidas("orcamentos"), 2);
  assert.equal(s.ctx.SAUDE.dias[0].data, "2026-11-01", "e o SAUDE recebe o relógio novo");
  const D = await P.cache[3]; assert.notEqual(D, antes, "o período aberto foi trocado");
  assert.equal(P.aba, "financas"); assert.equal(P.n, 3, "aba e período continuam");
  /* uma fonte que estava boa falha: nada muda */
  resp.orcamentos = { erro: "sem rede" }; const c0 = P.cache[3];
  await assert.rejects(s.mod().atualizar(), /orcamentos \(sem rede\)/);
  assert.equal(P.cache[3], c0, "o Painel continua com os dados de antes");
  /* a que já falhava antes (ex.: tabela que ainda não existe) não impede */
  P.ult = { n: 3, D: await P.cache[3] }; P.ult.D.orcamentos = { ok: false, erro: "tabela não existe" };
  await s.mod().atualizar();
  const t = ler("js/painel.js");
  assert.ok(!/text:"Atualizar"/.test(t), "o botão exclusivo do Painel saiu");
  assert.ok(!/SAUDE\.dias=null/.test(t), "nada de apagar antes de buscar");
});

/* ---------------------------------------------------------------- Saúde */
test("Saúde: relê dias e treinos do banco sem chamar o Garmin; falha mantém; sincronização em andamento bloqueia; o 'Atualizar agora' continua", async () => {
  const g = portao();
  const s = montar({ sec: "saude", modulos: ["saude"], resp: { garmin_dia: () => g.p, garmin_ativ: [{ id: 1, inicio: "2026-11-01T10:00", tipo: "running", dados: {} }] } });
  const S = s.ctx.SAUDE; S.dias = [{ data: "2026-10-01" }]; S.ativs = []; S.met = "passos"; S.per = "90"; S.tipo = "running";
  const pr = s.mod().atualizar(); await espera();
  assert.deepEqual(S.dias, [{ data: "2026-10-01" }], "os dias de antes ficam durante a leitura");
  g.abrir([{ data: "2026-11-02", dados: {}, atualizado: "y" }, { data: "2026-11-01", dados: {}, atualizado: "y" }]); await pr;
  assert.deepEqual([...S.dias.map((d) => d.data)], ["2026-11-01", "2026-11-02"]); assert.equal(S.ativs.length, 1);
  assert.equal(S.met, "passos"); assert.equal(S.per, "90"); assert.equal(S.tipo, "running", "métrica, período e filtro continuam");
  assert.equal(s.banco.chamadas.invoke, 0, "o Garmin não é chamado");
  assert.equal(s.banco.log.filter((x) => x.ops.some((o) => o[0] === "delete")).length, 0, "o ↻ não apaga nada (a limpeza dos antigos fica no carregar normal)");
  const s2 = montar({ sec: "saude", modulos: ["saude"], resp: { garmin_dia: [], garmin_ativ: { erro: "caiu" } } });
  s2.ctx.SAUDE.dias = [{ data: "x" }]; s2.ctx.SAUDE.ativs = [{ id: 9 }];
  await assert.rejects(s2.mod().atualizar(), /relogio/); assert.deepEqual(s2.ctx.SAUDE.ativs, [{ id: 9 }]); assert.deepEqual(s2.ctx.SAUDE.dias, [{ data: "x" }]);
  S.sinc = Promise.resolve(); assert.match(s.mod().ocupado(), /sincronização com o relógio Garmin/); S.sinc = null; assert.equal(s.mod().ocupado(), "");
  const t = ler("js/saude.js");
  assert.match(t, /text:"Atualizar agora"\}\);/, "o botão de sincronizar continua");
  assert.match(t, /function saudeSincronizar\(st\)\{\n\s+function chamar\(corpo\)\{return SB\.functions\.invoke\("garmin",\{body:corpo\}\)/, "a sincronização com o Garmin continua igual");
  assert.match(t, /if\(!SAUDE\.sinc&&!ATU\.semExternos&&\(!ult\|\|/, "redesenhar pelo ↻ não abre sincronizando sozinho");
});

/* ---------------------------------------------------------------- Olivia */
test("Olivia: registros, fotos, Mercado e eventos do bebê de novo, tudo ou nada; vista e filtro ficam", async () => {
  const resp = { registros: [{ id: "r1", quem: "olivia", tipo: "peso", data: "2026-11-01", titulo: "Peso", arquivos: [{ path: "a/b.jpg" }] }], "urls:familia": [{ path: "a/b.jpg", signedUrl: "https://x/b.jpg" }], compras: [], bebe: [{ tipo: "sono", inicio: "2026-11-01T01:00" }] };
  const s = montar({ sec: "olivia", modulos: ["familia", "bebe"], resp });
  s.ctx.BEBE.evs = [{ velho: 1 }]; s.ctx.BEBE.quem = "olivia"; s.ctx.famVista.olivia = "diadia"; s.ctx.famFiltro.olivia = "peso";
  await s.mod().atualizar();
  assert.equal(s.banco.lidas("registros"), 1); assert.equal(s.banco.lidas("bebe"), 1, "os eventos do bebê que estavam na memória são relidos");
  assert.equal(s.ctx.BEBE.evs[0].tipo, "sono"); assert.equal(s.ctx.famPronto.olivia.urls["a/b.jpg"], "https://x/b.jpg", "o redesenho recebe o que foi lido");
  assert.equal(s.ctx.famVista.olivia, "diadia"); assert.equal(s.ctx.famFiltro.olivia, "peso");
  for (const [nome, falha] of [["bebê", { bebe: { erro: "caiu" } }], ["Mercado", { compras: { erro: "caiu" } }], ["fotos", { "urls:familia": { erro: "caiu" } }]]) {
    const s2 = montar({ sec: "olivia", modulos: ["familia", "bebe"], resp: { ...resp, ...falha } });
    s2.ctx.BEBE.evs = [{ velho: 1 }]; s2.ctx.BEBE.quem = "olivia";
    await assert.rejects(s2.mod().atualizar(), /não consegui ler/, nome);
    assert.deepEqual(s2.ctx.BEBE.evs, [{ velho: 1 }], nome); assert.equal(s2.ctx.famPronto.olivia, undefined, nome); assert.equal(s2.ctx.redesenhos, 0, nome);
  }
  const t = ler("js/familia.js");
  assert.match(t, /if\(!pronto&&ATU\.rodando&&famPronto\[quem\]\)pronto=famPronto\[quem\]/, "pelo ↻ desenha com o que já foi lido, sem 'Carregando'");
  assert.match(t, /return atuDurante\("o envio das fotos"/, "envio de fotos bloqueia o ↻");
  assert.match(ler("js/bebe.js"), /atuDurante\("a importação do Napper"/);
});

/* ---------------------------------------------------------------- Newsletter */
test("Newsletter: a edição vem de novo da rede (?atualizar=1), troca só se veio inteira; busca e filtros ficam; nunca chama a IA", async () => {
  const ed = { grupos: [{ t: "Nova" }], coletado: "2026-11-02T09:00" };
  const s = montar({ sec: "newsletter", hash: "#newsletter/busca", modulos: ["newsletter"], resp: { "json:newsletter.json": ed } });
  const L = s.ctx.NLS; L.dados = { grupos: [{ t: "Velha" }] }; L.busca = { q: "copom", c: "economia", tipo: "analise", fonte: "Valor", ordem: "relevancia" };
  s.ctx.ATU.fresco = true;
  await s.mod().atualizar();
  assert.match(s.ctx.jsons[0], /newsletter\.json\?v=\d+&atualizar=1/, "pede à rede agora, sem o cache do service worker");
  assert.equal(L.dados.grupos[0].t, "Nova");
  assert.deepEqual(L.busca, { q: "copom", c: "economia", tipo: "analise", fonte: "Valor", ordem: "relevancia" }, "palavras, categoria, tipo, veículo e ordem ficam");
  assert.equal(s.banco.chamadas.invoke, 0, "nenhuma chamada à IA");
  const s2 = montar({ sec: "newsletter", modulos: ["newsletter"], resp: { "json:newsletter.json": { semGrupos: true } } });
  const velho = { grupos: [{ t: "Fica" }] }; s2.ctx.NLS.dados = velho;
  await assert.rejects(s2.mod().atualizar(), /edicao/); assert.equal(s2.ctx.NLS.dados, velho, "edição sem grupos não entra");
  /* Anteriores: o histórico de novo, e falha mantém o de antes */
  const s3 = montar({ sec: "newsletter", hash: "#newsletter/historico", modulos: ["newsletter"], resp: { newsletter_edicoes: { erro: "caiu" } } });
  const h0 = { l: [1], offline: false }; s3.ctx.NLS.hist = h0;
  await assert.rejects(s3.mod().atualizar(), /historico/); assert.equal(s3.ctx.NLS.hist, h0);
  /* um resumo REAL da IA esperando Salvar: o ↻ espera (sumiria da tela) */
  const s4 = montar({ sec: "newsletter", modulos: ["newsletter"], extra: {} });
  s4.ctx.document.querySelector = (q) => (/nlprevia:not\(\.iaprevia\) \.nlacts/.test(q) ? {} : null);
  assert.match(s4.mod().ocupado(), /resumo da IA esperando Salvar/);
  const t = ler("js/newsletter.js");
  assert.match(t, /h\("select",\{"aria-label":"Tipo","data-atu-filtro":""\}/); assert.match(t, /tipo\.value=F\.tipo;fonte\.value=F\.fonte;ordem\.value=F\.ordem;/);
});

/* ---------------------------------------------------------------- Rede */
test("Rede: contatos de novo, troca só com a leitura inteira; o contato em edição continua", async () => {
  const g = portao();
  const s = montar({ sec: "rede", modulos: ["rede"], resp: { registros: () => g.p } });
  const R = s.ctx.REDE; R.regs = [{ id: "velho" }]; R.editando = { id: "velho" };
  const pr = s.mod().atualizar(); await espera();
  assert.deepEqual(R.regs, [{ id: "velho" }]); g.abrir([{ id: "c1", tipo: "contato" }]); await pr;
  assert.equal(R.regs[0].id, "c1"); assert.deepEqual(R.editando, { id: "velho" });
  const s2 = montar({ sec: "rede", modulos: ["rede"], resp: { registros: { erro: "caiu" } } }); s2.ctx.REDE.regs = [{ id: "fica" }];
  await assert.rejects(s2.mod().atualizar(), /contatos/); assert.deepEqual(s2.ctx.REDE.regs, [{ id: "fica" }]);
  assert.match(ler("js/rede.js"), /\(ATU\.rodando&&REDE\.regs\?Promise\.resolve\(REDE\.regs\):redeCarregar\(\)\)/, "o redesenho não lê de novo");
});

/* ---------------------------------------------------------------- Busca */
test("Busca: o índice inteiro de novo; troca só se nenhuma fonte boa falhar; a busca segue usando o índice de antes até lá", async () => {
  const resp = { registros: [], garmin_ativ: [], produtos: [{ nome: "Café", categoria: "Mercearia" }], "json:vagas.json": { vagas: [] }, "json:tecdados.json": { noticias: [] }, "json:noticias.json": { noticias: [] }, "json:newsletter.json": { grupos: [] } };
  const s = montar({ sec: "busca", modulos: ["familia", "sistema"], resp });
  const idx0 = await s.ctx.buscaIndice(); assert.ok(s.ctx.BUSCA.fontes.produtos.ok);
  resp.produtos = [{ nome: "Chá", categoria: "Mercearia" }];
  await s.mod().atualizar();
  assert.notEqual(s.ctx.BUSCA.idx, idx0); assert.ok(s.ctx.BUSCA.idx.some((x) => x.t === "Chá"), "o índice novo tem o que está no banco agora");
  const idx1 = s.ctx.BUSCA.idx; resp.produtos = { erro: "caiu" };
  await assert.rejects(s.mod().atualizar(), /produtos/); assert.equal(s.ctx.BUSCA.idx, idx1, "falhou: a busca continua com o índice de antes");
  assert.equal((await s.ctx.buscar("chá")).length, 1);
});

/* ---------------------------------------------------------------- Segurança */
test("Segurança: tudo de novo e troca só se nada que respondia passou a falhar; prévia de restauração, backup e restauração bloqueiam", async () => {
  const resp = { "auth:fatores": { all: [{ factor_type: "totp", status: "verified" }] }, "auth:passkeys": [{ id: "pk" }], "auth:aal": { currentLevel: "aal2" }, "rpc:seguranca_estado": { ok: 1 }, seguranca_eventos: [{ id: 1 }], "lista:backups": [{ name: "a.json" }] };
  const sb = montar({ sec: "seguranca", modulos: ["seguranca"], resp });
  const S = sb.ctx.SEG;
  await sb.ctx.segCarregar();
  assert.equal(S.fatores.length, 1); assert.equal(S.servidor.length, 1); const ev0 = S.eventos;
  resp.seguranca_eventos = [{ id: 1 }, { id: 2 }];
  await sb.mod().atualizar(); assert.equal(S.eventos.length, 2); assert.notEqual(S.eventos, ev0);
  resp.seguranca_eventos = { erro: "caiu" }; const ev1 = S.eventos, f1 = S.fatores;
  await assert.rejects(sb.mod().atualizar(), /eventos/); assert.equal(S.eventos, ev1); assert.equal(S.fatores, f1, "nada foi trocado pela metade");
  S.areaRestaurar = { isConnected: true, querySelector: (q) => (q === "button.segdesc:not(:disabled)" ? {} : null) };
  assert.match(sb.mod().ocupado(), /prévia da restauração/);
  S.areaRestaurar.querySelector = () => null; assert.equal(sb.mod().ocupado(), "", "depois de gravar ou descartar, libera");
  const t = ler("js/seguranca.js");
  for (const x of [/atuDurante\("o backup",function\(\)\{return segExportarJa/, /atuDurante\("o backup",function\(\)\{return exportarTudo/, /fimT=atuTarefa\("a leitura do backup"\)/, /fimT=atuTarefa\("a restauração do backup"\)/])
    assert.match(t, x);
});

/* ---------------------------------------------------------------- o botão inteiro (atuAtualizar de verdade) */
test("botão: toque duplo faz uma leitura só; tarefa em andamento bloqueia e libera ao terminar; falha mantém a hora e avisa; busca e rolagem voltam", async () => {
  const g = portao();
  const s = montar({ sec: "rede", hash: "#rede", modulos: ["rede"], resp: { "rpc:ping": "pong", registros: () => g.p } });
  s.ctx.REDE.regs = [{ id: "velho" }];
  const busca = { tagName: "INPUT", type: "search", value: "", hasAttribute: () => false, dispatchEvent() { busca.disparou = true; } };
  s.raiz.campos = [busca]; busca.value = "maria";
  const a = s.ctx.atuAtualizar(), b = s.ctx.atuAtualizar();
  assert.equal(await b, false, "o segundo toque não faz nada");
  busca.value = ""; /* o redesenho limpou a caixa: ela volta */
  g.abrir([{ id: "novo" }]); assert.equal(await a, true);
  assert.equal(s.banco.lidas("rpc:ping"), 1); assert.equal(s.banco.lidas("registros"), 1, "uma consulta só");
  assert.equal(busca.value, "maria"); assert.ok(busca.disparou, "a busca roda de novo"); assert.deepEqual(s.rolagens, [640], "a rolagem volta");
  const hora = s.ctx.ATU.ultima.rede; assert.ok(hora);
  /* tarefa longa: espera; terminou, libera */
  const fim = s.ctx.atuTarefa("o envio das fotos");
  assert.equal(await s.ctx.atuAtualizar(), false); assert.match(s.avisos.at(-1), /Espere terminar: o envio das fotos/);
  fim();
  /* falha: a hora de antes continua e o aviso diz que a tela é a de antes */
  const s2 = montar({ sec: "rede", modulos: ["rede"], resp: { "rpc:ping": "pong", registros: { erro: "caiu" } } });
  s2.ctx.REDE.regs = [{ id: "fica" }]; s2.ctx.ATU.ultima.rede = 123;
  assert.equal(await s2.ctx.atuAtualizar(), false);
  assert.equal(s2.ctx.ATU.ultima.rede, 123); assert.deepEqual(s2.ctx.REDE.regs, [{ id: "fica" }]);
  assert.match(s2.avisos.at(-1), /Não consegui atualizar \(não consegui ler contatos \(caiu\)\)\. Os dados de antes continuam na tela/);
  assert.equal(s2.ctx.ATU.rodando, false, "o botão é liberado");
  /* depois de terminar a tarefa, atualiza de novo */
  const g3 = portao(); const s3 = montar({ sec: "rede", modulos: ["rede"], resp: { "rpc:ping": "pong", registros: () => g3.p } });
  const fim3 = s3.ctx.atuTarefa("a restauração do backup"); assert.equal(await s3.ctx.atuAtualizar(), false); fim3();
  const p3 = s3.ctx.atuAtualizar(); g3.abrir([]); assert.equal(await p3, true);
});

test("botão: filtro em <select> marcado com data-atu-filtro não conta como formulário não salvo; o que não é filtro conta", async () => {
  const s = montar({ sec: "newsletter", modulos: ["newsletter"], resp: { "rpc:ping": "pong", "json:newsletter.json": { grupos: [] } } });
  const filtro = { tagName: "SELECT", selectedIndex: 2, __atu: { i: 0 }, disabled: false, hasAttribute: (a) => a === "data-atu-filtro" };
  const peso = { tagName: "SELECT", selectedIndex: 1, __atu: { i: 0 }, disabled: false, hasAttribute: () => false };
  s.raiz.campos = [filtro];
  assert.equal(await s.ctx.atuAtualizar(), true, "filtro mexido não bloqueia");
  s.raiz.campos = [filtro, peso];
  assert.equal(await s.ctx.atuAtualizar(), false); assert.match(s.avisos.at(-1), /formulário com alterações não salvas/);
});

/* ---------------------------------------------------------------- regras gerais */
test("todo módulo com dados em memória está ligado ao botão (os nove da Etapa B); os de fora estão listados com o motivo", () => {
  const ETAPA_B = { alimentacao: "alimentacao", compras: "compras", painel: "painel", saude: "saude", olivia: "familia", newsletter: "newsletter", rede: "rede", busca: "sistema", seguranca: "seguranca" };
  for (const [sec, arq] of Object.entries(ETAPA_B)) assert.match(ler("js/" + arq + ".js"), new RegExp('atuModulo\\("' + sec + '",\\{'), sec + " registrado");
  /* quem guarda leitura do banco ou da rede na memória e a reaproveita no próximo desenho */
  const MEMORIA = /if\(!?[A-Z_]{2,}\.[a-zA-Z]+[^)]{0,40}\)return [A-Za-z_.]*(Promise\.resolve|[A-Z_]{2,}\.)|\(?[A-Z_]{2,}\.[a-z]+\?Promise\.resolve\([^)]*\):[a-zA-Z]+Carregar|\bonce\("/;
  /* fora da Etapa B (pendentes, ver o relatório): o Resumo e o Esportes guardam leituras; a Lista guarda sugestões e histórico */
  const FORA = { "resumo.js": "usa o relógio da memória (SAUDE); o ↻ cai no caminho padrão da Etapa A", "esportes.js": "APIs públicas de esportes guardadas por once()",
    "esportes-central.js": "APIs públicas de esportes guardadas por once()", "lista.js": "sugestões e histórico da Lista",
    "fiscal.js": "só a trava de \"lendo\" e os documentos já lidos nesta tela, identificados pelo conteúdo (Lote 1.4); não guarda leitura do banco, então nada fica velho" };
  const ligados = new Set(Object.values(ETAPA_B).map((a) => a + ".js").concat(["bebe.js"]));
  /* o RAC Hoje ainda não tem página: a coleta vale 10 minutos e o ↻ (ATU.fresco) faz ler de novo (tests/hoje.test.mjs) */
  ligados.add("hoje.js"); assert.match(ler("js/hoje.js"), /typeof ATU!=="undefined"&&ATU\.fresco/);
  for (const f of fs.readdirSync(new URL("../js/", import.meta.url))) {
    if (f === "app.js") continue;
    const t = ler("js/" + f);
    if (!MEMORIA.test(t)) continue;
    assert.ok(ligados.has(f) || FORA[f], f + " guarda dados na memória e não está ligado ao botão de atualizar nem listado como pendente");
  }
  /* bebe.js não tem página própria: os eventos entram pela Olivia */
  assert.match(ler("js/familia.js"), /comBebe\?atuLer\(function\(\)\{return bebeLer\("olivia"\)\}\)/);
});

test("o botão não sincroniza nada de fora: nenhum caminho de atualização chama Garmin, Gmail, IA ou função do servidor", () => {
  for (const f of ["alimentacao", "compras", "painel", "saude", "familia", "newsletter", "rede", "sistema", "seguranca"]) {
    const t = ler("js/" + f + ".js"), i = t.indexOf("atuModulo(");
    const reg = t.slice(i, t.indexOf("});", i) + 3);
    assert.ok(!/functions\.invoke|racIA\(|saudeSincronizar|ccGm|gmApi|gmToken|SB\.rpc\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(reg), f + ": o registro só lê");
  }
  const f = APP.slice(APP.indexOf("function atuModulo("), APP.indexOf("\n", APP.indexOf("function atuModulo(") + 300));
  assert.ok(!/\.finally\(|=>|\blet |\bconst /.test(BLOCO), "ES5 puro");
  assert.match(f, /NUCLEO\.atuConferir\(o\.fontes\?o\.fontes\(novo\):novo,o\.antes\?o\.antes\(\):\{\}\);if\(!c\.ok\)throw new Error\(c\.texto\);/, "confere antes de trocar");
});

test("atuConferir: troca só com todas as fontes boas; a que já falhava não impede; a boa que sumiu impede", () => {
  const C = N.atuConferir;
  assert.deepEqual(C({ a: { ok: true }, b: { ok: true } }, { a: { ok: true } }), { ok: true, falhas: [], texto: "" });
  assert.deepEqual(C({ a: { ok: true }, b: { ok: false, erro: "timeout" } }, { a: { ok: true }, b: { ok: true } }).falhas, ["b (timeout)"]);
  assert.equal(C({ b: { ok: false, erro: "x" } }, { b: { ok: false } }).ok, true, "já falhava: nada de bom a perder");
  assert.equal(C({ b: { ok: false } }, {}).ok, false, "nunca carregou e falhou: não troca");
  assert.deepEqual(C({ a: { ok: true } }, { a: { ok: true }, b: { ok: true } }).falhas, ["b (não veio)"]);
  assert.equal(C({}, {}).ok, true); assert.equal(C(null, null).ok, true);
  assert.match(C({ pedidos: { ok: false, erro: "rede" } }).texto, /^não consegui ler pedidos \(rede\)$/);
  assert.deepEqual(N.atuEstado({ a: { ok: true, v: [1] }, b: { ok: false, erro: "x" }, c: null, d: [] }), { a: { ok: true }, b: { ok: false } });
});
