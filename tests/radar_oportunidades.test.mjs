// Radar de Preços, Lote 2 · regras puras do núcleo: histórico por janelas, oportunidades (última, janela, preço pago), queda grande só marcada,
// vendedor, deduplicação por observação e equivalência por regras (que nunca confirma). Sem rede, sem custo, dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const DIA = 86400000, AGORA = Date.parse("2026-11-09T12:00:00Z");
const iso = (dias) => new Date(AGORA - dias * DIA).toISOString();
let n = 0;
const obs = (dias, preco, extra = {}) => ({ id: "p" + ++n, oferta_id: "o1", modalidade: "a_vista", meio: "pix", fonte: "manual", evidencia: "print", preco_produto: preco, frete_situacao: "confirmado", frete_valor: 0 + 10, taxas: 0, desconto: 0, disponibilidade: "disponivel", observado_em: iso(dias), ...extra });
const OF = [{ id: "o1", item_id: "i1", situacao: "ativa", equivalencia: "confirmada", vendedor: "Loja Oficial" }];
const sem = (extra) => N.rdOportunidades(extra.precos, extra.ofertas || OF, { agora: AGORA, ...extra.opc });

test("histórico: última, menor, maior, variação e janelas de 30/90/180/365 dias e todo o histórico", () => {
  const S = [obs(400, 200), obs(300, 150), obs(100, 120), obs(40, 130), obs(5, 110)];
  const h = N.rdHistorico(S, AGORA);
  assert.equal(h.n, 5); assert.equal(h.base, "final"); assert.equal(h.ultima.final, 120);
  assert.deepEqual([h.minimo.valor, h.maximo.valor], [120, 210]);
  assert.deepEqual([h.variacao.anterior, h.variacao.atual, h.variacao.diferenca], [140, 120, -20]); assert.equal(h.variacao.pct, -14.29);
  const j = h.janelas;
  assert.deepEqual([j[30].n, j[90].n, j[180].n, j[365].n, j.todo.n], [1, 2, 3, 4, 5]);
  assert.equal(j[30].suficiente, false, "uma observação só: histórico insuficiente");
  assert.deepEqual([j[90].minimo.valor, j[90].maximo.valor, j[90].atualNoMinimo], [120, 140, true]);
  assert.deepEqual([j[180].minimo.valor, j[180].maximo.valor], [120, 140]);
  assert.deepEqual([j[365].minimo.valor, j[365].maximo.valor], [120, 160]);
  assert.deepEqual([j.todo.minimo.valor, j.todo.maximo.valor, j.todo.acimaDoMinimo], [120, 210, 0]);
});
test("histórico: nada é inventado; sem preço final usa o anunciado e avisa; correção não duplica", () => {
  assert.deepEqual(N.rdHistorico([], AGORA), { n: 0, pontos: [], suficiente: false, semFinal: true, janelas: {} });
  const um = N.rdHistorico([obs(3, 100)], AGORA);
  assert.equal(um.suficiente, false); assert.equal(um.variacao, null); assert.equal(um.janelas[90].suficiente, false);
  const sf = N.rdHistorico([obs(10, 100, { frete_situacao: "desconhecido", frete_valor: null }), obs(2, 90, { frete_situacao: "desconhecido", frete_valor: null })], AGORA);
  assert.equal(sf.semFinal, true); assert.equal(sf.base, "produto"); assert.equal(sf.ultima.produto, 90); assert.equal(sf.variacao.base, "produto");
  const a = obs(10, 100, { frete_situacao: "desconhecido", frete_valor: null }), c = { ...obs(10, 100), corrige_id: a.id, observado_em: new Date(Date.parse(a.observado_em) + 1000).toISOString() };
  const h = N.rdHistorico([a, c], AGORA);
  assert.equal(h.n, 1, "a observação corrigida sai das contas (continua gravada)"); assert.equal(h.ultima.final, 110);
});
test("oportunidade: preço final menor que a última observação, sem desconto mínimo", () => {
  const r = sem({ precos: [obs(10, 100), obs(0, 99.99)] });
  assert.equal(r.length, 1); assert.equal(r[0].final, 109.99); assert.equal(r[0].motivos[0].tipo, "menor_que_ultima");
  assert.equal(r[0].motivos[0].referencia, 110); assert.equal(r[0].motivos[0].diferenca, -0.01); assert.equal(r[0].verificar, false, "queda de 1 centavo também vale");
  assert.equal(sem({ precos: [obs(10, 100), obs(0, 100)] }).length, 0, "igual não é oportunidade");
  assert.equal(sem({ precos: [obs(10, 100), obs(0, 120)] }).length, 0, "mais caro não é oportunidade");
  assert.equal(sem({ precos: [obs(0, 50)] }).length, 0, "sem observação anterior não há com o que comparar");
});
test("oportunidade: menor que o menor da janela escolhida (30/90/180/365/todo) e que o preço pago, por modalidade", () => {
  const P = [obs(200, 80), obs(60, 100), obs(20, 105), obs(0, 103)];
  const r = (janela, extra = {}) => sem({ precos: P, opc: { janela, ...extra } });
  const tipos = (o) => o.motivos.map((m) => m.tipo);
  /* finais: 90 (há 200 dias), 110 (60), 115 (20) e 113 (hoje) */
  assert.deepEqual(tipos(r(30)[0]), ["menor_que_ultima", "menor_na_janela"], "em 30 dias o único registro anterior é 115");
  assert.equal(r(30)[0].motivos[1].referencia, 115);
  assert.deepEqual(tipos(r(90)[0]), ["menor_que_ultima"], "em 90 dias o menor é 110: 113 não é menor");
  for (const j of [180, 365, 0]) assert.equal(r(j)[0].motivos.some((m) => m.tipo === "menor_na_janela"), false, "janela " + j);
  assert.equal(r(365)[0].motivos.length, 1);
  const pago = r(30, { pagos: { i1: { a_vista: 150 } } })[0].motivos.find((m) => m.tipo === "menor_que_pago");
  assert.deepEqual([pago.referencia, pago.diferenca], [150, -37]);
  assert.equal(r(30, { pagos: { i1: { parcelado: 500 } } })[0].motivos.some((m) => m.tipo === "menor_que_pago"), false, "o que pagou parcelado não compara com à vista");
  assert.equal(r(30, { pagos: { i1: { a_vista: 100 } } })[0].motivos.some((m) => m.tipo === "menor_que_pago"), false, "113 não é menor que 100 pago");
});
test("oportunidade: queda grande não é descartada, fica marcada para verificar", () => {
  const r = sem({ precos: [obs(10, 200), obs(0, 20)] });
  assert.equal(r.length, 1); assert.equal(r[0].verificar, true); assert.ok(r[0].pct <= -50);
  assert.equal(N.rdAnomalia(-49.9), false); assert.equal(N.rdAnomalia(-50), true); assert.equal(N.rdAnomalia(null), false); assert.equal(N.rdAnomalia(20), false);
});
test("só entra oferta comprovada: equivalência confirmada, ativa, vendedor aceitável, frete confirmado e disponível", () => {
  const P = (extra = {}) => [obs(10, 100), obs(0, 90, extra)];
  assert.equal(sem({ precos: P() }).length, 1);
  assert.equal(sem({ precos: P({ frete_situacao: "desconhecido", frete_valor: null }) }).length, 0, "frete desconhecido não é preço final");
  assert.equal(sem({ precos: P({ disponibilidade: "indisponivel" }) }).length, 0);
  assert.equal(sem({ precos: P({ disponibilidade: "desconhecida" }) }).length, 0);
  for (const eq of ["provavel", "nao_confirmada", "rejeitada"]) assert.equal(sem({ precos: P(), ofertas: [{ ...OF[0], equivalencia: eq }] }).length, 0, eq);
  assert.equal(sem({ precos: P(), ofertas: [{ ...OF[0], situacao: "pausada" }] }).length, 0);
  assert.equal(sem({ precos: P(), opc: { vendedoresBloqueados: ["  loja OFICIAL "] } }).length, 0, "vendedor bloqueado (sem diferenciar maiúsculas e acentos)");
  assert.equal(sem({ precos: P(), opc: { vendedoresBloqueados: ["Outro Vendedor"] } }).length, 1);
  assert.equal(sem({ precos: P(), ofertas: [] }).length, 0, "oferta desconhecida");
});
test("à vista e parcelado nunca se misturam nas oportunidades (séries separadas)", () => {
  const par = (d, p) => obs(d, p, { modalidade: "parcelado", meio: "credito", parcelas: 3, valor_parcela: p / 3, total_parcelado: p, sem_juros: true });
  const P = [obs(10, 100), obs(5, 200 - 100), par(10, 300), par(0, 250)];
  const r = sem({ precos: P });
  assert.deepEqual(r.map((x) => x.modalidade), ["parcelado"], "só o parcelado caiu; o parcial à vista (igual) não");
  assert.equal(r[0].motivos.every((m) => m.referencia >= 250), true, "o parcelado só se compara com parcelado");
});
test("deduplicação: uma oportunidade por observação de preço; aviso repetido é filtrado", () => {
  const a = obs(10, 100), b = obs(0, 90);
  const ops = sem({ precos: [a, b] });
  assert.equal(ops[0].chave, "rdop:" + b.id); assert.equal(N.rdChaveAviso(b.id), "rdop:" + b.id);
  assert.deepEqual(N.rdNaoAvisadas(ops, []), ops); assert.deepEqual(N.rdNaoAvisadas(ops, ["rdop:" + b.id]), []);
  const c = obs(-0.5, 80);
  const ops2 = sem({ precos: [a, b, c] });
  assert.deepEqual(N.rdNaoAvisadas(ops2, ["rdop:" + b.id]).map((x) => x.chave), ["rdop:" + c.id], "um preço novo ainda avisa; o antigo não");
});
test("equivalência por regras: sugere, nunca confirma, mostra evidências e divergências", () => {
  const item = { nome: "Fone X", marca: "Marca A", modelo: "XM-4", variante: "Preto", gtin: "7891234567895" };
  let s = N.rdSugerirEquivalencia(item, { gtin: "7891234567895", marca: "marca a", modelo: "xm4", variante: "Preto" });
  assert.equal(s.sugestao, "provavel"); assert.equal(s.confirma, false); assert.ok(s.evidencias.length >= 2); assert.deepEqual(s.divergencias, []);
  s = N.rdSugerirEquivalencia(item, { gtin: "7890000000000" });
  assert.equal(s.sugestao, "divergente"); assert.equal(s.divergencias[0].tipo, "gtin");
  s = N.rdSugerirEquivalencia(item, { marca: "Marca A", modelo: "XM-4", variante: "Branco" });
  assert.equal(s.sugestao, "divergente", "variante diferente");
  s = N.rdSugerirEquivalencia(item, { marca: "Marca A" });
  assert.equal(s.sugestao, "nao_confirmada"); assert.match(s.aviso, /Faltam dados/);
  s = N.rdSugerirEquivalencia({ nome: "x" }, {}); assert.equal(s.sugestao, "nao_confirmada");
  for (const c of [{ gtin: "7891234567895" }, { marca: "Marca A", modelo: "XM-4" }]) assert.notEqual(N.rdSugerirEquivalencia(item, c).sugestao, "confirmada");
});
test("endereços: confere só o formato no navegador (a função do servidor decide de verdade)", () => {
  assert.equal(N.rdUrlOk("https://www.loja.com.br/p/123?x=1").host, "www.loja.com.br");
  for (const ruim of ["", "http://loja.com.br/p", "https://127.0.0.1/p", "https://localhost/p", "https://192.168.0.1/p", "https://loja.com.br:8443/p", "ftp://loja.com.br", "https://loja", "https://loja.com.br/ p", "javascript:alert(1)", "https://user:pw@loja.com.br/p".replace("user:pw@", "u@")]) assert.equal(N.rdUrlOk(ruim).ok, false, ruim);
  assert.equal(N.rdHostCasa("www.loja.com.br", "loja.com.br"), true); assert.equal(N.rdHostCasa("loja.com.br.evil.com", "loja.com.br"), false); assert.equal(N.rdHostCasa("xloja.com.br", "loja.com.br"), false);
});
