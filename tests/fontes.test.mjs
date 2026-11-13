// Contrato de fontes (Fase 2 · A4, docs/planejamento/02-auditoria-arquitetural.md, seção 8). O RAC Hoje lê Newsletter, Família, MBA e Agenda
// por fontes leves (js/fontes.js e js/fonte-*.js), nunca pelas variáveis internas das telas (NLS, FAM, mbaFin, AGENDA_ICO…), e sem carregar
// as telas. Este teste prova: o formato do contrato {ok, v, vazio, quando, ultimo, origem} em cada fonte (e a falha sem derrubar nada); que o
// RAC Hoje não toca mais no interior das telas; e que o que o RAC Hoje recebe é o mesmo de antes (os leitores de antes, copiados da main
// 95940e4 em tests/fixtures/fase2/regras-antes.js, e os de agora, com os mesmos dados).
process.env.TZ = "America/Sao_Paulo";
import { test } from "node:test";
import assert from "node:assert/strict";
import { N, ler, antes, agora, js, agendaDados } from "./_fontes_ambiente.mjs";
import { modDeps, fecho, usosDeOutros } from "./_dependencias.mjs";

const HOJE = "2026-11-13", CHAVES = ["falhas", "nota", "ok", "origem", "parcial", "quando", "ultimo", "v", "vazio"];
const NL = JSON.parse(ler("tests/fixtures/newsletter/newsletter.json"));

test("o RAC Hoje não usa mais nada de dentro de outras telas e não as carrega: só o contrato de fontes", () => {
  const h = ler("js/hoje.js");
  for (const n of ["NLS", "FAM", "famFiltro", "mbaFin", "mbaAulas", "mbaAvals", "mbaFeito", "AGENDA_ICO", "agendaColetarLeitura", "agendaColetar", "SAUDE", "GARMIN_DESDE"])
    assert.ok(!new RegExp("\\b" + n + "\\b").test(h), "js/hoje.js ainda cita " + n);
  assert.ok(!/precisa\(\["sistema"|precisa\(\["mba"/.test(h), "não pede a tela do Sistema nem a do MBA");
  for (const f of ["agenda", "newsletter", "mba"]) assert.match(h, new RegExp(`${f}:function\\(\\)\\{return fonteOuErro\\("${f}"\\)`), f + " vem da fonte");
  assert.match(h, /fonteLer\("familia"\)/); assert.match(h, /NUCLEO\.hojeQuemDe\(/);
  const D = modDeps();
  assert.deepEqual(D.hoje, ["fonte-agenda", "fonte-newsletter", "fonte-mba", "fonte-familia", "fonte-saude", "kit", "graficos"], "Fase 3 e DS-4.3: o painel do RAC Hoje usa o kit de componentes, o de gráficos e a fonte da Saúde");
  assert.deepEqual([...fecho(D, "hoje")].sort(), ["fonte-agenda", "fonte-familia", "fonte-mba", "fonte-newsletter", "fonte-saude", "fontes", "graficos", "kit"], "nenhuma tela carrega junto (antes: Sistema, Família, MBA e Saúde); só os dois kits leves, sem tela");
  /* Fase 3: além do contrato de fontes, o painel usa os dois kits leves (js/kit.js e js/graficos.js), sem tela e declarados no MOD_DEPS; de outra TELA, nada */
  const usos = usosDeOutros("js/hoje.js"), deTela = Object.fromEntries(Object.entries(usos).filter(([, a]) => !["js/kit.js", "js/graficos.js"].includes(a)));
  assert.deepEqual(deTela, { fonteLer: "js/fontes.js", fonteOuErro: "js/fontes.js" }, "de outras telas, só o contrato");
  assert.ok(Object.values(usos).includes("js/kit.js") && Object.values(usos).includes("js/graficos.js"), "e usa de fato os dois kits");
  /* as fontes são leves: consulta e normalização, sem tela */
  for (const f of ["fontes", "fonte-familia", "fonte-mba", "fonte-newsletter", "fonte-agenda"]) {
    const t = ler("js/" + f + ".js"); assert.ok(!/\bh\(|panel\(|document\.|innerHTML|appendChild/.test(t.replace(/\/\*[\s\S]*?\*\//g, "")), f + " não desenha nada");
    assert.match(ler("sw.js"), new RegExp(`"\\./js/${f}\\.js"`), f + " funciona sem internet");
  }
});

test("contrato: toda fonte devolve {ok, v, vazio, quando, ultimo, origem, nota, parcial, falhas}; falha vira {ok:false, erro}, nunca derruba quem pediu", async () => {
  const a = agora({ ...agendaDados(3), newsletterJson: NL });
  for (const nome of ["newsletter", "familia", "mba", "agenda"]) {
    const c = js(await a.ctx.fonteLer(nome));
    assert.deepEqual(Object.keys(c).sort(), CHAVES, nome); assert.equal(c.ok, true, nome); assert.equal(typeof c.vazio, "boolean"); assert.equal(typeof c.origem, "string");
  }
  assert.deepEqual(js(await a.ctx.fonteLer("nada")), { ok: false, erro: "fonte desconhecida: nada" });
  a.ctx.fonteRegistrar("quebrada", () => { throw new Error("explodiu"); }); assert.deepEqual(js(await a.ctx.fonteLer("quebrada")), { ok: false, erro: "explodiu" });
  a.ctx.fonteRegistrar("recusa", () => Promise.reject(new Error("sem rede"))); assert.deepEqual(js(await a.ctx.fonteLer("recusa")), { ok: false, erro: "sem rede" });
  await assert.rejects(a.ctx.fonteOuErro("recusa"), /sem rede/, "fonteOuErro: a mesma falha como promessa recusada");
  assert.deepEqual(N.fonteContrato({ v: 1 }), { ok: true, v: 1, vazio: false, quando: null, ultimo: null, origem: null, nota: null, parcial: false, falhas: null });
});

test("fonte Newsletter: edição montada em memória; reaproveita o que a tela já leu ('memória do site') ou lê o arquivo; nunca grava", async () => {
  const arq = js(await agora({ hoje: HOJE, newsletterJson: NL }).ctx.fonteLer("newsletter"));
  assert.equal(arq.origem, "arquivo do site"); assert.equal(arq.quando, NL.coletado); assert.equal(arq.vazio, false); assert.ok(arq.v.destaques.length > 0);
  const mem = js(await agora({ hoje: HOJE, nlMem: NL }).ctx.fonteLer("newsletter")); assert.equal(mem.origem, "memória do site", "sem ler o arquivo (getJson falharia)");
  const falha = js(await agora({ hoje: HOJE }).ctx.fonteLer("newsletter")); assert.equal(falha.ok, false); assert.match(falha.erro, /HTTP 404/);
  /* a tela da Newsletter guarda na memória da fonte em todos os lugares onde guarda a edição (ler, ↻ e "tentar de novo") */
  const nl = ler("js/newsletter.js");
  assert.equal((nl.match(/NLS\.dados=/g) || []).length, 3); assert.equal((nl.match(/nlFonteGuardar\(/g) || []).length, 4, "três usos e a definição");
  assert.match(nl, /NLS\.dados=d;NLS\.quando=Date\.now\(\);nlFonteGuardar\(d\)/); assert.match(nl, /NLS\.dados=null;nlFonteGuardar\(null\)/);
  assert.ok(!/newsletter_edicoes|\.insert\(|\.upsert\(|racIA/.test(ler("js/fonte-newsletter.js")), "a fonte não grava a edição nem chama a IA");
});

test("fonte Família: os integrantes vêm da mesma configuração (FAM e ícones) e o 'quem é quem' da IA é o mesmo de antes", async () => {
  const a = agora({ hoje: HOJE }), c = js(await a.ctx.fonteLer("familia")), velho = antes({ hoje: HOJE }).ctx.hojeQuem();
  assert.equal(c.origem, "configuração do site"); assert.deepEqual(c.v.integrantes.map((x) => x.k), ["eddie", "olivia", "civic", "moto", "c3", "docs"]);
  assert.deepEqual(c.v.integrantes.map((x) => x.tipo), ["pet", "bebe", "veiculo", "veiculo", "veiculo", "docs"]);
  assert.ok(velho.length > 40 && /Olivia é a filha bebê do dono/.test(velho) && /Eddie é o cachorro da família/.test(velho));
  assert.equal(N.hojeQuemDe(c.v.integrantes), velho, "a mesma frase de antes para a IA");
  assert.equal(N.hojeQuemDe([]), "");
});

test("fonte MBA: aulas, avaliações e parcelas normalizadas no núcleo; vazio só sem nada", async () => {
  const d = agendaDados(5), c = js(await agora(d).ctx.fonteLer("mba")), p = d.pessoal;
  assert.equal(c.origem, "memória do site"); assert.deepEqual(c.v.aulas, js(N.mbaAulasDe(p.mba, p.mbaLinks)));
  assert.deepEqual(c.v.fin, js(N.mbaFinDe(p.mba, p.mbaFeito, HOJE))); assert.equal(c.vazio, false);
  const v = js(await agora({ hoje: HOJE, pessoal: {} }).ctx.fonteLer("mba")); assert.deepEqual([v.vazio, v.v.aulas, v.v.avals, v.v.fin], [true, [], [], null]);
});

test("fonte Agenda: completa, vazia, parcial (marcada) e falha (ok:false com o motivo); pedidos juntos dividem a mesma leitura", async () => {
  const comp = js(await agora(agendaDados(2)).ctx.fonteLer("agenda")); assert.deepEqual([comp.ok, comp.vazio, comp.parcial, comp.origem], [true, false, false, "banco e dados do site"]);
  const par = js(await agora(agendaDados(2, { registros: { data: null, error: { message: "sem rede" } } })).ctx.fonteLer("agenda"));
  assert.deepEqual([par.ok, par.parcial], [true, true]); assert.match(par.falhas[0], /^registros: sem rede/);
  const nada = agendaDados(2, { registros: { rejeita: "timeout" } }); nada.pessoal = { ultimoBackup: HOJE }; nada.aniversarios = [];
  const f = js(await agora({ ...nada, hoje: "2026-07-01", pessoal: { ultimoBackup: "2026-07-01" }, backup: { data: [{ name: "2026-06-30.zip" }], error: null } }).ctx.fonteLer("agenda"));
  assert.equal(f.ok, false); assert.match(f.erro, /^a leitura da Agenda falhou \(registros: timeout\)$/);
  const vaz = js(await agora({ hoje: "2026-07-01", pessoal: { ultimoBackup: "2026-07-01" }, registros: { data: [], error: null }, backup: { data: [{ name: "2026-06-30.zip" }], error: null } }).ctx.fonteLer("agenda"));
  assert.deepEqual([vaz.ok, vaz.vazio, vaz.v], [true, true, []]);
  const b = agora(agendaDados(4)); await Promise.all([b.ctx.fonteLer("agenda"), b.ctx.fonteLer("agenda"), b.ctx.agendaColetar()]);
  assert.equal(b.lidas.registros, 1, "a Agenda, a Próxima ação e o RAC Hoje juntos: uma leitura só (como antes)");
});

test("o RAC Hoje recebe exatamente o mesmo de antes de Agenda, Newsletter e MBA (leitores de antes × de agora, mesmos dados)", async () => {
  const comoHoje = async (f) => { try { return N.fonteContrato(await f()); } catch (e) { return { ok: false, erro: e.message }; } };   // o que hojeFonte faz com cada leitura
  let n = 0;
  for (let s = 1; s <= 6; s++) for (const registros of [undefined, { data: null, error: { message: "sem rede" } }]) for (const nl of [{ newsletterJson: NL }, { nlMem: NL }, {}]) {
    const d = { ...agendaDados(s, { registros }), ...nl }, A = antes(d).ctx, B = agora(d).ctx;
    for (const k of ["agenda", "newsletter", "mba"]) { assert.deepEqual(js(await comoHoje(() => B.HOJE_LEITORES[k](HOJE))), js(await comoHoje(() => A.HOJE_LEITORES_ANTES[k](HOJE))), `${k} semente ${s}`); n++; }
  }
  /* a agenda que falha por inteiro e a conta sem MBA também */
  const vazio = { hoje: "2026-07-01", pessoal: { ultimoBackup: "2026-07-01" }, registros: { rejeita: "timeout" }, backup: { data: [{ name: "2026-06-30.zip" }], error: null } };
  for (const k of ["agenda", "mba"]) assert.deepEqual(js(await comoHoje(() => agora(vazio).ctx.HOJE_LEITORES[k]("2026-07-01"))), js(await comoHoje(() => antes(vazio).ctx.HOJE_LEITORES_ANTES[k]("2026-07-01"))), k + " vazio");
  assert.ok(n >= 100, n + " comparações");
});
