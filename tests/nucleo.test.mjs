// Testes das funções puras do site (nucleo.js): abastecimento pela foto, temas das Conexões, links e importação.
// Rodar: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;

test("abastecimento: JSON dentro de bloco de código, com vírgula decimal", () => {
  const r = N.lerAbast('Aqui está:\n```json\n{"veiculo":"moto","data":"2026-10-28","km":15890,"litros":"6,12","preco_litro":6.29,"total":38.49,"combustivel":"Gasolina comum","posto":"Shell"}\n```');
  assert.equal(r.veiculo, "moto");
  assert.equal(r.data, "2026-10-28");
  assert.equal(r.km, 15890);
  assert.equal(r.litros, 6.12);
  assert.equal(r.total, 38.49);
  assert.match(r.combustivel, /gasolina/);
});

test("abastecimento: texto livre e total calculado", () => {
  const r = N.lerAbast("Veículo: carro\nKm: 104.308\nLitros: 40,5\nPreço por litro: R$ 6,19\nEtanol");
  assert.equal(r.veiculo, "civic");
  assert.equal(r.km, 104308);
  assert.equal(r.litros, 40.5);
  assert.equal(r.total, Math.round(40.5 * 6.19 * 100) / 100);
  assert.equal(r.combustivel, "etanol");
});

test("abastecimento: resposta sem números não inventa valores", () => {
  const r = N.lerAbast("não consegui ler a foto");
  assert.equal(r.km, null);
  assert.equal(r.litros, null);
  assert.equal(r.total, null);
});

test("temas das Conexões: reconhece tecnologias e não confunde palavras parecidas", () => {
  assert.deepEqual(N.temasDe("Vaga: Analista de Dados Pleno (Python e SQL)").sort(), ["analytics", "python", "sql"]);
  assert.ok(N.temasDe("Dashboard em Power BI").includes("bi"));
  assert.deepEqual(N.temasDe("Biblioteca municipal abre inscrições"), []);
  assert.deepEqual(N.temasDe("Banana nanica em promoção"), []);
});

test("links digitados sem https não viram página do próprio site", () => {
  assert.equal(N.urlAbs("newdashboard.mbx.academy/classes"), "https://newdashboard.mbx.academy/classes");
  assert.equal(N.urlAbs("https://a.com"), "https://a.com");
  assert.equal(N.urlAbs("#mba"), "#mba");
  assert.equal(N.urlAbs("mailto:x@y.com"), "mailto:x@y.com");
  assert.equal(N.urlAbs(""), "");
});

test("importação com juntar: completa sem duplicar e sem apagar", () => {
  const velho = { custo: 80, meds: [{ nome: "Bravecto" }], clinica: "Vet A" };
  const novo = { custo: 99, meds: [{ nome: "bravecto" }, { nome: "Simparic" }], diagnostico: "ok" };
  const r = N.juntarDados(velho, novo);
  assert.equal(r.custo, 80, "valor que já existe não é trocado");
  assert.deepEqual(r.meds.map((m) => m.nome), ["Bravecto", "Simparic"], "lista é unida sem repetir (ignora maiúsculas)");
  assert.equal(r.diagnostico, "ok", "campo que faltava entra");
  assert.equal(r.clinica, "Vet A");
  assert.equal(N.juntarDados(velho, { custo: 1, meds: [{ nome: "Bravecto" }] }), null, "nada novo: devolve null");
});

test("compatibilidade da vaga: o que pede, o que tem e o que falta", () => {
  const r = N.compatVaga("Analista de Dados Pleno — SQL avançado, Power BI (DAX), Python desejável, levantamento de requisitos com stakeholders", ["sql", "powerbi", "negocio"]);
  assert.deepEqual(r.pede.sort(), ["negocio", "powerbi", "python", "sql"]);
  assert.deepEqual(r.falta, ["python"]);
  assert.equal(r.nota, 75);
  assert.equal(N.compatVaga("Vaga de motorista", ["sql"]).nota, null, "sem competência de dados: sem nota");
});

test("OMS: mediana do peso ao nascer é o percentil 50, e o z volta para a mesma medida", () => {
  const lms = [0.3809, 3.2322, 0.14171];
  assert.ok(Math.abs(N.omsZ(lms, 3.2322)) < 1e-9);
  assert.equal(N.percentilDeZ(0), 50);
  assert.ok(Math.abs(N.omsValor(lms, N.omsZ(lms, 4.1)) - 4.1) < 1e-9);
  assert.ok(Math.abs(N.percentilDeZ(1.881) - 97) < 0.2, "z = 1,88 é o percentil 97");
});

test("Napper: CSV com aspas e vírgulas vira eventos com chave única, e o resumo por dia soma certo", () => {
  const csv = "start,end,category,diaperContent,breastLeftSeconds,breastRightSeconds,feedingAmount,bottleFeedingType,comment,createdAt\n" +
    "2026-07-19T02:33:00.000-03:00,2026-07-19T03:10:00.000-03:00,NURSING,,600,600,,,,a\n" +
    "2026-07-19T13:25:00.000-03:00,2026-07-19T13:25:00.000-03:00,BOTTLE,,,,50,FORMULA,,b\n" +
    "2026-07-19T14:00:00.000-03:00,2026-07-19T14:00:00.000-03:00,CHANGED_DIAPER,MIXED,,,,,,c\n" +
    "2026-07-19T10:05:00.000-03:00,2026-07-19T11:17:00.000-03:00,NAP,,,,,,\"soneca, no colo\",d\n";
  const ev = N.napperLer(csv);
  assert.equal(ev.length, 4);
  assert.equal(new Set(ev.map((e) => e.chave)).size, 4);
  assert.equal(ev[3].dados.obs, "soneca, no colo");
  const [d] = N.bebeDias(ev);
  assert.deepEqual([d.peito, d.peitoMin, d.mamadeira, d.mlFormula, d.fraldas, d.xixi, d.coco, d.sonoMin], [1, 20, 1, 50, 1, 1, 1, 72]);
  assert.throws(() => N.napperLer("a,b\n1,2"), /Napper/);
});

test("vacinas do SUS: datas previstas pela idade e doses contadas em ordem", () => {
  const c = N.vacinasCalendario("2026-06-01", ["Vacinas de 2 meses: Rotavirus, Pentavalente e Poliomielite", "BCG e Hepatite B"]);
  const ver = (n) => c.find((x) => x.nome === n);
  assert.equal(ver("Pentavalente (1ª dose)").prevista, "2026-08-01");
  assert.equal(ver("Pentavalente (1ª dose)").tomada, true);
  assert.equal(ver("Pentavalente (2ª dose)").tomada, false, "uma menção cobre só a 1ª dose");
  assert.equal(ver("BCG").tomada, true);
  assert.equal(ver("Pneumocócica 10 (1ª dose)").tomada, false);
});

test("Napper: noite da hora de dormir até acordar, sem contar despertares nem soneca dentro da noite", () => {
  const ev = [
    { tipo: "dormir", inicio: "2026-10-27T21:00:00-03:00", fim: "2026-10-27T21:00:00-03:00" },
    { tipo: "despertar", inicio: "2026-10-28T02:00:00-03:00", fim: "2026-10-28T02:30:00-03:00" },
    { tipo: "sono", inicio: "2026-10-27T21:00:00-03:00", fim: "2026-10-28T02:00:00-03:00" },
    { tipo: "acordar", inicio: "2026-10-28T06:00:00-03:00", fim: "2026-10-28T06:00:00-03:00" },
    { tipo: "sono", inicio: "2026-10-28T10:00:00-03:00", fim: "2026-10-28T11:00:00-03:00" },
  ];
  const d = Object.fromEntries(N.bebeDias(ev).map((x) => [x.data, x]));
  assert.equal(d["2026-10-27"].noiteMin, 9 * 60 - 30, "21h às 6h, menos 30 min acordada");
  assert.equal(d["2026-10-27"].sonecas, 0, "o trecho de sono dentro da noite não vira soneca");
  assert.equal(d["2026-10-28"].sonecaMin, 60);
});

test("prontidão: dia normal fica no meio, dia ruim cai e gera alertas", () => {
  const dias = [];
  for (let i = 60; i >= 1; i--) dias.push({ data: N.somaDiasISO("2026-10-28", -i), dados: { vfc: { noite: 54 + (i % 5) - 2 }, fcRepouso: 50 + (i % 3) - 1, sono: { total: 7.5 * 3600, nota: 80 }, bbMax: 75, estresse: 30 + (i % 7) - 3 } });
  const normal = N.prontidao(dias.concat([{ data: "2026-10-28", dados: { vfc: { noite: 54 }, fcRepouso: 50, sono: { total: 7.5 * 3600, nota: 80 }, bbMax: 75, estresse: 30 } }]), "2026-10-28");
  assert.ok(normal.nota >= 55 && normal.nota <= 80, "nota normal: " + normal.nota);
  assert.deepEqual(normal.alertas, []);
  const ruim = N.prontidao(dias.slice(0, -1).concat([{ data: "2026-10-27", dados: { sono: { total: 5 * 3600 } } }, { data: "2026-10-28", dados: { vfc: { noite: 40, faixaMin: 47 }, fcRepouso: 58, sono: { total: 5.5 * 3600, nota: 50 }, bbMax: 30, estresse: 60 } }]), "2026-10-28");
  assert.ok(ruim.nota < 45, "nota ruim: " + ruim.nota);
  assert.equal(ruim.rotulo, "Dia de recuperação");
  assert.equal(ruim.alertas.length, 4);
  assert.ok(Math.abs(N.correlacao([1, 2, 3, 4, 5, 6, 7, 8], [2, 4, 6, 8, 10, 12, 14, 16]) - 1) < 1e-9);
});

test("chuva: acha a primeira hora com chuva provável e ignora garoa improvável", () => {
  const time = Array.from({ length: 24 }, (_, i) => "2026-10-29T" + String(i).padStart(2, "0") + ":00");
  const prob = time.map((_, i) => (i >= 15 && i <= 17 ? 80 : i === 10 ? 45 : 10)), mm = time.map((_, i) => (i >= 15 && i <= 17 ? 2.4 : 0.2));
  const a = N.chuvaAviso({ time, precipitation_probability: prob, precipitation: mm }, "2026-10-29T08:00");
  assert.equal(a.inicio, "2026-10-29T15:00");
  assert.equal(a.prob, 80);
  assert.match(a.texto, /a partir das 15h, até umas 18h/);
  assert.equal(N.chuvaAviso({ time, precipitation_probability: prob, precipitation: mm }, "2026-10-29T00:00", 9), null);
  assert.ok(N.chuvaAviso({ time, precipitation_probability: prob, precipitation: mm }, "2026-10-29T16:00").agora);
});

test("compras: prevê o que está acabando e respeita o 'ainda tem'", () => {
  const l = [];
  ["2026-08-01", "2026-08-08", "2026-08-15", "2026-08-22"].forEach((d) => l.push({ data: d, produto: "Leite Integral", quantidade: 6, valor: 30 }));
  ["2026-07-01", "2026-08-01", "2026-09-01"].forEach((d) => l.push({ data: d, produto: "Papel Higiênico", quantidade: 1, valor: 25 }));
  l.push({ data: "2026-08-10", produto: "Vinho", quantidade: 1, valor: 80 });
  const p = N.previsaoCompras(l, "2026-08-29");
  assert.equal(p[0].produto, "Leite Integral");
  assert.equal(p[0].status, "acabando"); // a cada 7 dias, última há 7
  assert.equal(p.find((x) => x.produto === "Papel Higiênico").status, "ok"); // a última compra (01/09) é depois desta data
  assert.ok(!p.some((x) => x.produto === "Vinho")); // só uma compra
  assert.equal(N.previsaoCompras(l, "2026-08-29", { "leite integral": "2026-09-02" }).some((x) => x.produto === "Leite Integral"), false);
  assert.equal(N.previsaoCompras(l, "2026-12-30").some((x) => x.produto === "Leite Integral"), false); // parou de comprar
  const pd = N.padraoCompras(l);
  assert.equal(pd.mais[0].produto, "Leite Integral");
  assert.equal(pd.menos[0].produto, "Vinho");
  assert.ok(N.itemBate("pão de forma", "Pão de Forma Pullman 480g"));
  assert.ok(!N.itemBate("filtro café", "Café Pilão 500g"));
});
test("nota do iPhone e o que é ditado viram itens da lista", () => {
  const nota = "Lista de compras\nDiabo verde\nPão de forma\nFiltro café\n\nDemais itens\n\nFarmácia:\nAnti inflamatório: ibuprofeno ou naproxeno\n✓ Sabonete";
  const it = N.notaItens(nota);
  assert.deepEqual(it.map((x) => x.item), ["Diabo verde", "Pão de forma", "Filtro café", "Anti inflamatório: ibuprofeno ou naproxeno"]);
  assert.equal(it[3].secao, "Farmácia");
  assert.deepEqual(N.notaItens("◦ Leite\n☑ Ovos\n- [ ] Café").map((x) => x.item), ["Leite", "Café"]);
  assert.deepEqual(N.dividirItens("leite, pão de forma e café."), ["Leite", "Pão de forma", "Café"]);
});

test("e-mails de vagas: confirmação, etapa, entrevista, retorno, cancelada e alertas", () => {
  const L = (de, assunto, trecho = "") => N.lerEmailVaga({ de, assunto, trecho });
  let x = L("no-reply@gupy.com.br", "Candidatura recebida com sucesso!", "Tauste Supermercados ANALISTA DE DADOS (INOVAÇÃO E MELHORIA) Olá, Rayner Carvalho Obrigado pelo seu interesse em participar do processo seletivo na Tauste Supermercados. Gostaríamos");
  assert.deepEqual([x.tipo, x.vaga, x.empresa, x.plataforma], ["candidatura", "ANALISTA DE DADOS (INOVAÇÃO E MELHORIA)", "Tauste Supermercados", "Gupy"]);
  x = L("naoresponda@burh.com.br", "Sua candidatura foi confirmada! 💙🚀", "Você se candidatou na(s) vaga(s) Assitente de Suporte de TI. Ir para vaga Agradecemos a sua candidatura!");
  assert.deepEqual([x.tipo, x.vaga], ["candidatura", "Assitente de Suporte de TI"]);
  x = L("avisos@jobbol.com.br", "Sua candidatura para Analista de Suporte de TI - nºUK7934982", "Recebemos sua candidatura");
  assert.deepEqual([x.tipo, x.vaga], ["candidatura", "Analista de Suporte de TI"]);
  assert.equal(L("noreply@mailquickin.com", "Confirmação de inscrição - Captativa").empresa, "Captativa");
  assert.equal(L("system@solides.com", "Candidatura efetuada em ANALISTA DE SUPORTE DE TI").vaga, "ANALISTA DE SUPORTE DE TI");
  x = L("no-reply@gupy.com.br", "Etapa Redação desbloqueada para a vaga ANALISTA DE DADOS (INOVAÇÃO E MELHORIA)");
  assert.deepEqual([x.tipo, x.etapa, x.vaga], ["etapa", "Redação", "ANALISTA DE DADOS (INOVAÇÃO E MELHORIA)"]);
  assert.equal(L("reply@reply.gupy.com.br", "Agendamento de Entrevista para a vaga Especialista em Recuperação de Crédito").tipo, "entrevista");
  x = L("no-reply@gupy.com.br", "Obrigada pelo interesse em fazer parte do nosso time!", "Bancorbrás - ANALISTA DE INFRAESTRUTURA JUNIOR Nova mensagem referente à vaga ANALISTA DE INFRAESTRUTURA JUNIOR: Olá, Rayner! Agradecemos sua participação");
  assert.deepEqual([x.tipo, x.vaga, x.empresa], ["retorno", "ANALISTA DE INFRAESTRUTURA JUNIOR", "Bancorbrás"]);
  x = L("no-reply@gupy.com.br", "Stefanini Group | ANALISTA SUPORTE I - Vaga Cancelada");
  assert.deepEqual([x.tipo, x.vaga, x.empresa], ["cancelada", "ANALISTA SUPORTE I", "Stefanini Group"]);
  x = L("jobalerts-noreply@linkedin.com", "A empresa Bridger está contratando: Analista de TI Júnior");
  assert.deepEqual([x.tipo, x.vaga, x.empresa], ["alerta", "Analista de TI Júnior", "Bridger"]);
  x = L("donotreply@match.indeed.com", "Analista de Suporte Técnico Sênior na empresa Clicksign");
  assert.deepEqual([x.tipo, x.vaga, x.empresa], ["alerta", "Analista de Suporte Técnico Sênior", "Clicksign"]);
  assert.equal(L("resposta-automatica-sac@oficial.nike.com.br", "Recebemos seu pedido 1001371153"), null);
  assert.ok(N.vagaParecida({ vaga: "ANALISTA DE DADOS (INOVAÇÃO E MELHORIA)", empresa: "Tauste Supermercados" }, { t: "Analista de Dados - Inovação e Melhoria", e: "Tauste" }));
  assert.ok(!N.vagaParecida({ vaga: "Analista de Suporte de TI", empresa: "" }, { t: "Analista de Dados", e: "Tauste" }));
});

test("lerAbast: só o painel (sem bomba) e as luzes de aviso acesas", () => {
  const r = N.lerAbast('{"veiculo":"moto","data":null,"km":18172,"litros":null,"preco_litro":null,"total":null,"combustivel":null,"posto":"","alertas":["injeção eletrônica (motor)",""]}');
  assert.equal(r.veiculo, "moto"); assert.equal(r.km, 18172);
  assert.equal(r.litros, null); assert.equal(r.total, null);
  assert.deepEqual(r.alertas, ["injeção eletrônica (motor)"]);
  assert.deepEqual(N.lerAbast('{"km":1}').alertas, []);
});

test("RAC Intelligence: o resultado REAL do abastecimento vira o mesmo texto do fluxo manual; o DEMO não vira nada", () => {
  const r = { veiculo: "moto", data: null, km: 18240, litros: 6.1, preco_litro: 6.29, total: 38.37, combustivel: "gasolina", posto: "", alertas: ["injeção eletrônica (motor)"] };
  const a = N.lerAbast(N.iaAbastTexto(r));
  assert.equal(a.veiculo, "moto"); assert.equal(a.km, 18240); assert.equal(a.litros, 6.1); assert.equal(a.total, 38.37); assert.deepEqual(a.alertas, ["injeção eletrônica (motor)"]);
  assert.equal(N.iaAbastTexto({ ...r, _demo: true }), "", "resposta de demonstração nunca chega ao fluxo que salva");
  assert.equal(N.iaAbastTexto(null), "");
  assert.equal(N.iaNotaTexto({ itens: [{ descricao: "x" }], _demo: true }), "");
  assert.equal(N.iaNotaTexto({ itens: [] }), "");
});

/* ---------- RAC Intelligence: painel do Sistema ---------- */
test("IA: dinheiro no formato brasileiro; frações de centavo com até 4 casas", () => {
  assert.equal(N.iaUsd(6.696429), "US$ 6,70");
  assert.equal(N.iaUsd(1234.5), "US$ 1.234,50");
  assert.equal(N.iaUsd(0), "US$ 0,00");
  assert.equal(N.iaUsd(null), "US$ 0,00");
  assert.equal(N.iaUsd(0.002578), "US$ 0,0026");
  assert.equal(N.iaUsd(0.003), "US$ 0,003");
  assert.equal(N.iaUsd(0.01), "US$ 0,01");
  assert.equal(N.iaUsd(0.00001), "menos de US$ 0,0001", "valor minúsculo não vira zero");
  assert.equal(N.iaUsd(0.1), "US$ 0,10", "preço por milhão no formato brasileiro (não 0.1)");
  assert.equal(N.iaReais(45), "R$ 45,00");
  assert.equal(N.iaReais(0.001), "menos de R$ 0,01");
  assert.equal(N.iaNum(-0.001, 2), "0,00", "sem -0,00");
});

test("IA: reais com o câmbio e os impostos da configuração (como o servidor)", () => {
  assert.equal(N.iaBrl(6.696429, { cambio_brl_usd: 6, margem_impostos: 0.12 }), "R$ 45,00");
  assert.equal(N.iaBrl(1, { cambio_brl_usd: 5, margem_impostos: 0 }), "R$ 5,00");
  assert.equal(N.iaBrl(1, {}), "R$ 6,72", "sem configuração: câmbio 6 e 12% de impostos");
});

test("IA: disponível, percentual e alertas em níveis (o bloqueio pode vir antes dos 100%)", () => {
  const s = N.iaResumo({ teto_usd: 6.696429, comprometido_usd: 3.5, estimado_usd: 3.1, reservado_aberto_usd: 0.0026, mes: "2026-10-01" }, {});
  assert.deepEqual([s.disponivel, s.pct, s.nivel, s.estimado, s.aberto], [3.196429, 52, 50, 3.1, 0.0026]);
  assert.equal(N.iaAlerta(s).forte, false, "a partir de 50%: aviso discreto");
  assert.equal(N.iaAlerta(N.iaResumo({ teto_usd: 10, comprometido_usd: 8 })).forte, true);
  assert.match(N.iaAlerta(N.iaResumo({ teto_usd: 10, comprometido_usd: 9.6 })).texto, /podem ser recusadas/);
  assert.match(N.iaAlerta(N.iaResumo({ teto_usd: 10, comprometido_usd: 10 })).texto, /acabou/);
  assert.equal(N.iaResumo({ teto_usd: 10, comprometido_usd: 12 }).disponivel, 0, "disponível nunca fica negativo");
  assert.equal(N.iaResumo({ teto_usd: 0, comprometido_usd: 0 }).nivel, 100, "teto zero: tudo bloqueado");
  assert.equal(N.iaAlerta(N.iaResumo({ teto_usd: 10, comprometido_usd: 1 })), null, "abaixo de 50%: sem aviso");
  assert.equal(N.iaAlerta(null), null);
});

test("IA: contagem por estado e nome do mês", () => {
  assert.equal(N.iaEstados({ concluido: 12, incerto: 1 }), "12 leituras concluídas · 1 incerta");
  assert.equal(N.iaEstados({ concluido: 1, reconciliado: 2, falhou_sem_envio: 1 }), "1 leitura concluída · 2 conferidas · 1 falhou antes do envio");
  assert.equal(N.iaEstados({}), "Nenhuma leitura paga neste mês.");
  assert.equal(N.iaEstados(null), "Nenhuma leitura paga neste mês.");
  assert.equal(N.iaNomeMes("2026-10-01"), "outubro de 2026");
  assert.equal(N.iaNomeMes("lixo"), "");
});

test("IA: meses do filtro (virada de ano) e nomes dos módulos", () => {
  assert.deepEqual(N.iaCompetencias("2026-02-01", 4), ["2026-02-01", "2026-01-01", "2025-12-01", "2025-11-01"]);
  assert.equal(N.iaCompetencias("2026-10-01", 12).length, 12);
  assert.deepEqual(N.iaCompetencias("", 3), []);
  assert.equal(N.iaModulo("abastecimento"), "Abastecimento");
  assert.equal(N.iaModulo("mercado"), "Nota do mercado");
  assert.equal(N.iaModulo("outro"), "outro");
});

test("IA: cada estado de ia_uso vira um texto e o custo que conta (como ia_comprometido_usd)", () => {
  const L = (u, agora) => N.iaUsoLinha(u, agora);
  assert.deepEqual(L({ estado: "concluido", estimado_usd: 0.0004 }), { estado: "Concluída", custo: 0.0004, custoTxt: "estimado", conferir: false });
  assert.match(L({ estado: "concluido", estimado_usd: 0.0003, erro_codigo: "resposta_invalida" }).estado, /^Recusada: resposta fora do formato/);
  assert.deepEqual(L({ estado: "incerto", reservado_usd: 0.0026, erro_codigo: "tempo_esgotado" }), { estado: "Incerta (tempo esgotado)", custo: 0.0026, custoTxt: "reserva contando", conferir: true });
  assert.deepEqual(L({ estado: "reconciliado", reconciliado_cobrado: true, reconciliado_usd: 0.002 }), { estado: "Conferida: foi cobrada", custo: 0.002, custoTxt: "cobrado", conferir: false });
  assert.deepEqual(L({ estado: "reconciliado", reconciliado_cobrado: false, reservado_usd: 0.0026 }), { estado: "Conferida: não foi cobrada", custo: 0, custoTxt: "sem custo", conferir: false });
  assert.equal(L({ estado: "falhou_sem_envio", reservado_usd: 0.003 }).custo, 0);
  assert.equal(L({ estado: "reservado", reservado_usd: 0.003 }).custoTxt, "reserva contando");
  assert.equal(L({ estado: "desconhecido" }).custo, null);
});

test("IA: chamada em andamento só pode ser conferida depois de 10 minutos (a mesma regra do banco)", () => {
  const env = "2026-10-31T15:00:00Z", t = Date.parse(env);
  assert.equal(N.iaUsoLinha({ estado: "enviando", enviado_em: env }, t + 5 * 60000).conferir, false);
  assert.equal(N.iaUsoLinha({ estado: "enviando", enviado_em: env }, t + 10 * 60000).conferir, false, "exatamente 10 minutos ainda não (o banco usa <)");
  const parada = N.iaUsoLinha({ estado: "enviando", enviado_em: env, reservado_usd: 0.0026 }, t + 10 * 60000 + 1);
  assert.equal(parada.conferir, true); assert.match(parada.estado, /Parada/); assert.equal(parada.custo, 0.0026);
  assert.equal(N.iaUsoLinha({ estado: "enviando" }, t).conferir, false, "sem a hora do envio não dá para conferir");
});

test("IA: valor da conferência validado antes de ir ao banco (vírgula ou ponto, 0 a 100)", () => {
  const V = (t, m = 100) => N.iaValorUsd(t, m);
  assert.deepEqual(V("0,0021"), { ok: true, valor: 0.0021 });
  assert.deepEqual(V("US$ 0.0021"), { ok: true, valor: 0.0021 });
  assert.deepEqual(V("0"), { ok: true, valor: 0 }, "zero é válido (cobrada, mas sem custo)");
  assert.deepEqual(V("1.234,50", 2000), { ok: true, valor: 1234.5 });
  for (const [t, re] of [["", /Digite/], ["abc", /números/], ["-1", /negativo/], ["150", /acima/], ["1.2.3", /inválido/], ["5,", /inválido/], [",5", /números/], [null, /Digite/]])
    assert.match(V(t).motivo, re, JSON.stringify(t));
  assert.equal(V("150", null).ok, true, "sem máximo, aceita");
});

test("IA: custo por mês, RAC × Console; mês sem cobrança fica 'não conferido' (nunca zero)", () => {
  const L = [
    { mes: "2026-10-01", estado: "concluido", estimado_usd: 0.0004 },
    { mes: "2026-10-01", estado: "reconciliado", reconciliado_cobrado: true, reconciliado_usd: 0.002 },
    { mes: "2026-10-01", estado: "reconciliado", reconciliado_cobrado: false, reservado_usd: 0.0026 },
    { mes: "2026-10-01", estado: "incerto", reservado_usd: 0.0026 },
    { mes: "2026-10-01", estado: "falhou_sem_envio", reservado_usd: 0.0026 },
    { mes: "2026-09-01", estado: "concluido", estimado_usd: 0.01 },
    { mes: "lixo", estado: "concluido", estimado_usd: 9 },
  ];
  const [out, set] = N.iaMeses(L, [{ mes: "2026-09-01", valor_usd: 0.012, valor_brl: 0.08, observacao: "conta toda" }, { mes: "2026-08-01", valor_usd: 0 }]);
  assert.deepEqual([out.mes, out.rac, out.aberto, out.n, out.cobrado, out.dif, out.difTxt], ["2026-10-01", 0.0024, 0.0026, 5, null, null, "não conferido"]);
  assert.deepEqual([set.rac, set.cobrado, set.cobradoBrl, set.dif, set.difPct, set.obs], [0.01, 0.012, 0.08, 0.002, 20, "conta toda"]);
  assert.equal(set.difTxt, "Console US$ 0,002 acima (+20,0%)");
  const ago = N.iaMeses([], [{ mes: "2026-08-01", valor_usd: 0 }])[0];
  assert.deepEqual([ago.rac, ago.cobrado, ago.difTxt], [0, 0, "igual ao RAC"], "cobrança zero registrada é zero, não 'não conferido'");
  assert.match(N.iaMeses([{ mes: "2026-07-01", estado: "concluido", estimado_usd: 1 }], [{ mes: "2026-07-01", valor_usd: 0.5 }])[0].difTxt, /abaixo \(−50,0%\)/);
  assert.equal(N.iaMeses(L, []).length, 2, "linha com mês inválido é ignorada");
  assert.deepEqual(N.iaMeses(null, null), []);
});

test("IA: mês da cobrança e validação em reais", () => {
  assert.equal(N.iaMesIso("2026-10"), "2026-10-01");
  assert.equal(N.iaMesIso("2026-10-15"), "2026-10-01");
  assert.equal(N.iaMesIso("2026-13"), "");
  assert.equal(N.iaMesIso(""), "");
  assert.deepEqual(N.iaValorUsd("R$ 2,85", 100000, true), { ok: true, valor: 2.85 });
  assert.match(N.iaValorUsd("", 100000, true).motivo, /reais/);
  assert.match(N.iaValorUsd("2000", 1000, true).motivo, /acima de R\$ 1\.000,00/);
});

/* ---------- Central de Segurança: backup, integridade e plano de restauração ---------- */
const CONTA = "11111111-1111-1111-1111-111111111111", OUTRA = "22222222-2222-2222-2222-222222222222";
const sha = async (t) => Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t))).toString("hex");
async function backupDe(tabelas, conta = CONTA) {
  const limpas = {}, hashes = {}, fora = [];
  for (const [t, l] of Object.entries(tabelas)) { const c = N.segLimpar(t, l); limpas[t] = c.linhas; fora.push(...c.fora); hashes[t] = await sha(N.segCanon(c.linhas)); }
  return N.segBackup(conta, "2026-10-31T12:00:00.000Z", limpas, hashes, fora, []);
}
const hashesDe = async (B) => Object.fromEntries(await Promise.all(Object.keys(B.tabelas).map(async (t) => [t, await sha(N.segCanon(B.tabelas[t]))])));

test("segurança: o backup não leva segredos (chave dos atalhos, Google Maps, campos de senha/token em qualquer nível)", () => {
  const c = N.segLimpar("pessoal", [
    { user_id: CONTA, chave: "atalho", valor: { hash: "abc" } }, { user_id: CONTA, chave: "googleMaps", valor: "chave-de-teste" },
    { user_id: CONTA, chave: "mba", valor: { aulas: [{ t: "Aula", senha: "x", link: "https://a" }], api_key: "k", token_acesso: "t" } }]);
  assert.deepEqual(c.linhas.map((r) => r.chave), ["mba"]);
  assert.deepEqual(c.linhas[0].valor, { aulas: [{ t: "Aula", link: "https://a" }] });
  assert.equal(c.fora.length, 5);
  assert.ok(!/senha|token|api_key|chave-de-teste|atalho/.test(JSON.stringify(c.linhas)));
  /* nomes parecidos que não são segredo continuam (chave_nfce, chave do bebê) */
  assert.deepEqual(N.segLimpar("notas", [{ id: "n1", chave_nfce: "3526" }]).linhas, [{ id: "n1", chave_nfce: "3526" }]);
});

test("segurança: o backup em JSON tem formato, conta, quantidade e SHA-256 de cada tabela e volta lido igual", async () => {
  const B = await backupDe({ mercados: [{ id: "m1", user_id: CONTA, nome: "Mercado A" }], pessoal: [{ user_id: CONTA, chave: "mba", valor: {} }, { user_id: CONTA, chave: "atalho", valor: {} }] });
  assert.equal(B.formato, "rac-backup"); assert.equal(B.versao, 2); assert.equal(B.conta, CONTA);
  assert.equal(B.resumo.pessoal.linhas, 1); assert.match(B.resumo.mercados.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(B.relacoes[1], ["itens.nota_id", "notas.id"]);
  const L = N.segLer(JSON.parse(JSON.stringify(B)));
  assert.ok(L.ok, L.problemas.join("; ")); assert.equal(L.conta, CONTA); assert.equal(L.versao, 2);
  assert.ok(N.segHashes(L, await hashesDe(L)).ok);
  /* a ordem das chaves não muda a assinatura */
  assert.equal(N.segCanon({ b: 1, a: [2, { d: 3, c: 4 }] }), N.segCanon({ a: [2, { c: 4, d: 3 }], b: 1 }));
});

test("segurança: a conferência recusa arquivo estranho, linha sem id, repetida, resumo errado e conteúdo alterado", async () => {
  assert.equal(N.segLer(null).ok, false); assert.equal(N.segLer({ tabelas: [] }).ok, false); assert.equal(N.segLer({ a: 1 }).ok, false);
  assert.match(N.segLer({ formato: "rac-backup", versao: 9, tabelas: {} }).problemas[0], /versão 9/);
  const r = N.segLer({ versao: 1, tabelas: { notas: [{ id: "n1" }, { id: "n1" }, { data: "2026-01-01" }], esquisita: [] } });
  assert.equal(r.ok, false);
  assert.ok(r.problemas.some((p) => /sem identificador/.test(p)) && r.problemas.some((p) => /repetida/.test(p)));
  assert.ok(r.avisos.some((a) => /esquisita/.test(a)));
  const B = await backupDe({ lista: [{ id: "l1", user_id: CONTA, item: "Arroz" }] });
  const resumoErrado = JSON.parse(JSON.stringify(B)); resumoErrado.resumo.lista.linhas = 5;
  assert.match(N.segLer(resumoErrado).problemas[0], /o resumo diz 5/);
  const alterado = JSON.parse(JSON.stringify(B)); alterado.tabelas.lista[0].item = "Feijão";
  const La = N.segLer(alterado); assert.ok(La.ok);
  const H = N.segHashes(La, await hashesDe(La)); assert.equal(H.ok, false); assert.match(H.problemas[0], /não bate com a assinatura/);
  /* backup antigo (servidor/.zip) não tem assinatura: só aviso */
  const v1 = N.segLer({ versao: 1, dono: CONTA, tabelas: { lista: [{ id: "l1" }] } });
  assert.ok(v1.ok && N.segHashes(v1, {}).ok && /sem assinatura/.test(N.segHashes(v1, {}).aviso));
});

test("segurança: plano de restauração separa novas, iguais e mudadas e nunca troca o que existe sem pedir", () => {
  const B = N.segLer({ versao: 1, dono: CONTA, tabelas: {
    lista: [{ id: "l1", user_id: CONTA, item: "Arroz", feito: false }, { id: "l2", user_id: CONTA, item: "Café", feito: true }, { id: "l3", user_id: CONTA, item: "Pão", feito: false }],
    pessoal: [{ user_id: CONTA, chave: "mba", valor: { a: 1 }, atualizado: "2026-01-01" }, { user_id: CONTA, chave: "atalho", valor: { hash: "velho" } }],
    newsletter_edicoes: [{ id: "e1", dono: CONTA, data: "2026-10-31", turno: "manha" }] } });
  const atual = { lista: [{ id: "l1", user_id: CONTA, item: "Arroz", feito: false }, { id: "l2", user_id: CONTA, item: "Café", feito: false }],
    pessoal: [{ user_id: CONTA, chave: "mba", valor: { a: 1 }, atualizado: "2026-10-30" }] };
  const p = N.segPlano(B, atual, { conta: CONTA });
  const li = p.tabelas.find((t) => t.t === "lista"), pe = p.tabelas.find((t) => t.t === "pessoal"), nl = p.tabelas.find((t) => t.t === "newsletter_edicoes");
  assert.deepEqual([li.novas.map((r) => r.id), li.iguais, li.diferentes.map((d) => d.campos)], [["l3"], 1, [["feito"]]]);
  assert.equal(pe.iguais, 1, "só o carimbo de hora mudou: é igual"); assert.equal(pe.fora, 1, "a chave antiga dos atalhos não volta");
  assert.equal(nl.so, "exportar"); assert.equal(nl.soExportar, 1);
  assert.deepEqual(p.total, { novas: 1, iguais: 2, diferentes: 1, invalidas: 0, fora: 1, soExportar: 1 });
  const sem = N.segEscrita(p, false), com = N.segEscrita(p, true);
  assert.deepEqual(sem.map((o) => [o.t, o.op, o.linhas.length]), [["lista", "insert", 1]], "sem pedir: só insere");
  assert.deepEqual(com.map((o) => [o.t, o.op, o.linhas.length]), [["lista", "insert", 1], ["lista", "upsert", 1]]);
  assert.ok(!com.some((o) => o.t === "newsletter_edicoes" || o.t === "pessoal"));
});

test("segurança: restauração preserva as relações (mesmo mercado pelo nome, item órfão não entra, produto sumido fica vazio)", () => {
  const B = N.segLer({ versao: 1, dono: CONTA, tabelas: {
    mercados: [{ id: "mB", user_id: CONTA, nome: "Mercado A" }, { id: "mN", user_id: CONTA, nome: "Mercado Novo" }],
    produtos: [{ id: "pB", user_id: CONTA, nome: "Café 500g", categoria: "Mercearia" }],
    notas: [{ id: "n1", user_id: CONTA, mercado_id: "mB", data: "2026-10-01" }, { id: "n2", user_id: CONTA, mercado_id: "mN", data: "2026-10-02" }, { id: "n3", user_id: CONTA, mercado_id: "mX", data: "2026-10-03" }],
    itens: [{ id: "i1", user_id: CONTA, nota_id: "n1", produto_id: "pB", descricao: "CAFE" }, { id: "i2", user_id: CONTA, nota_id: "n9", descricao: "ORFAO" },
      { id: "i3", user_id: CONTA, nota_id: "n2", produto_id: "pSumiu", descricao: "X" }, { id: "i4", user_id: CONTA, nota_id: "nHoje", descricao: "Y" }] } });
  const atual = { mercados: [{ id: "mHoje", user_id: CONTA, nome: "mercado a" }], produtos: [{ id: "pHoje", user_id: CONTA, nome: "Café 500g", categoria: "Mercearia" }], notas: [{ id: "nHoje", user_id: CONTA, mercado_id: "mHoje", data: "2026-09-01" }] };
  const p = N.segPlano(B, atual, { conta: CONTA }), T = (t) => p.tabelas.find((x) => x.t === t);
  assert.equal(T("mercados").remapeadas, 1); assert.deepEqual(T("mercados").diferentes.map((d) => d.campos), [["nome"]], "só a caixa do nome mudou");
  assert.deepEqual(T("mercados").novas.map((r) => r.id), ["mN"]);
  assert.equal(T("produtos").iguais, 1);
  const n1 = T("notas").novas.find((r) => r.id === "n1");
  assert.equal(n1.mercado_id, "mHoje", "a nota aponta para o mercado de hoje");
  assert.deepEqual(T("notas").invalidas.map((x) => x.linha.id), ["n3"]);
  const it = T("itens");
  assert.equal(it.novas.find((r) => r.id === "i1").produto_id, "pHoje", "o item aponta para o produto de hoje");
  assert.equal(it.novas.find((r) => r.id === "i3").produto_id, null); assert.equal(it.semPai, 1);
  assert.ok(it.novas.some((r) => r.id === "i4"), "pode apontar para uma nota que já existe");
  assert.deepEqual(it.invalidas.map((x) => x.linha.id), ["i2"]);
  /* nota repetida pelo número no mesmo mercado e dia vira a mesma nota */
  const B2 = N.segLer({ versao: 1, tabelas: { notas: [{ id: "nZ", mercado_id: "mHoje", numero: "77", data: "2026-09-01" }] } });
  const p2 = N.segPlano(B2, { mercados: atual.mercados, notas: [{ id: "nHoje", user_id: CONTA, mercado_id: "mHoje", numero: "77", data: "2026-09-01" }] }, { conta: CONTA });
  const n2 = p2.tabelas.find((x) => x.t === "notas");
  assert.equal(n2.remapeadas, 1); assert.equal(p2.total.novas, 0); assert.equal(n2.iguais, 1);
});

test("segurança: backup de outra conta troca o dono, o caminho dos anexos e tira o criado_por de quem não existe aqui", () => {
  const B = N.segLer({ versao: 1, dono: OUTRA, tabelas: {
    registros: [{ id: "r1", user_id: OUTRA, quem: "eddie", tipo: "vacina", data: "2026-01-01", titulo: "V10", criado_por: OUTRA, arquivos: [{ path: OUTRA + "/eddie/a.jpg", nome: "a.jpg" }] }] } });
  const p = N.segPlano(B, {}, { conta: CONTA }), r = p.tabelas[0].novas[0];
  assert.equal(p.outraConta, true);
  assert.equal(r.user_id, CONTA); assert.equal(r.arquivos[0].path, CONTA + "/eddie/a.jpg"); assert.equal(r.criado_por, null);
  assert.equal(B.tabelas.registros[0].user_id, OUTRA, "não mexe no objeto lido do arquivo");
  const mesma = N.segPlano(N.segLer({ formato: "rac-backup", versao: 2, conta: CONTA, tabelas: { garmin_dia: [{ user_id: CONTA, data: "2026-10-01", dados: {} }] }, resumo: {} }), {}, { conta: CONTA });
  assert.equal(mesma.outraConta, false); assert.equal(mesma.total.novas, 1);
});

test("segurança: nota da proteção da conta", () => {
  assert.deepEqual(N.segNota({ mfa: true, bancoMfa: true, reserva: true, diasBackup: 3, diasServidor: 2, auditoria: true }), { nota: 100, nivel: "forte", faltam: [] });
  const s = N.segNota({ mfa: false, diasBackup: null, diasServidor: 20, auditoria: false });
  assert.equal(s.nivel, "fraca"); assert.equal(s.nota, 15); assert.deepEqual(s.faltam, ["mfa", "bancoMfa", "reserva", "backupManual", "backupServidor", "auditoria"]);
  assert.deepEqual(N.segNota({ mfa: true, bancoMfa: true, diasBackup: 10, diasServidor: 3, auditoria: false }), { nota: 80, nivel: "média", faltam: ["reserva", "auditoria"] });
});

test("segurança: linha de hoje com segredo não vira 'mudada' só por isso, e a troca não apaga o segredo", () => {
  const B = N.segLer({ versao: 1, dono: CONTA, tabelas: { pessoal: [{ user_id: CONTA, chave: "mba", valor: { a: 1 } }, { user_id: CONTA, chave: "emails", valor: { lista: [1, 2] } }] } });
  const atual = { pessoal: [{ user_id: CONTA, chave: "mba", valor: { a: 1, senha: "s" } }, { user_id: CONTA, chave: "emails", valor: { lista: [1], token: "t" } }] };
  const pe = N.segPlano(B, atual, { conta: CONTA }).tabelas[0];
  assert.equal(pe.iguais, 1);
  assert.deepEqual(pe.diferentes[0].linha.valor, { lista: [1, 2], token: "t" }, "a troca mantém o token de hoje");
});

/* ---------- Painel de Produtividade ---------- */
test("painel: meses do período e soma por mês e por fonte, ignorando o que está fora ou não é número", () => {
  assert.deepEqual(N.pnMeses("2026-10-31", 3), ["2026-08", "2026-09", "2026-10"]);
  assert.deepEqual(N.pnMeses("2026-02-10", 4), ["2025-11", "2025-12", "2026-01", "2026-02"]);
  const r = N.pnPorMes([{ d: "2026-09-02", v: 100, f: "Mercado" }, { d: "2026-09-20", v: 50.5, f: "Veículos" }, { d: "2026-10-01", v: 10, f: "Mercado" },
    { d: "2026-07-01", v: 999, f: "Mercado" }, { d: "2026-10-03", v: NaN, f: "Mercado" }, { d: "2026-10-03", v: "12", f: "Mercado" }, null], ["2026-09", "2026-10"]);
  assert.deepEqual(r["2026-09"], { total: 150.5, por: { Mercado: 100, "Veículos": 50.5 }, n: 2 });
  assert.deepEqual(r["2026-10"], { total: 10, por: { Mercado: 10 }, n: 1 });
  assert.equal(r["2026-07"], undefined, "fora do período não entra");
});

test("painel: variação só existe com base de comparação", () => {
  assert.deepEqual(N.pnVariacao(150, 100), { dif: 50, pct: 50 });
  assert.equal(N.pnVariacao(150, 0), null); assert.equal(N.pnVariacao(150, null), null); assert.equal(N.pnVariacao(null, 10), null);
  assert.equal(Math.round(N.pnVariacao(80, 100).pct), -20);
});

test("painel: orçamento × gasto por categoria, com estado e totais; sem orçamento cadastrado não inventa nenhum", () => {
  const o = N.pnOrcamento({ Mercearia: 450, Limpeza: 90, Bebidas: 40 }, [{ categoria: "Mercearia", valor: 400 }, { categoria: "Limpeza", valor: 100 }, { categoria: "Carnes", valor: 300 }]);
  assert.deepEqual(o.linhas.map((x) => [x.categoria, x.estado]), [["Mercearia", "acima"], ["Limpeza", "perto"], ["Bebidas", "sem"], ["Carnes", "ok"]]);
  assert.equal(o.orcado, 800); assert.equal(o.gastoOrcado, 540); assert.equal(o.acima, 1); assert.equal(o.dentro, 2); assert.equal(o.temOrcamento, true);
  assert.equal(Math.round(o.linhas[0].pct), 113);
  const vazio = N.pnOrcamento({ Mercearia: 10 }, []);
  assert.equal(vazio.temOrcamento, false); assert.equal(vazio.linhas[0].orcado, null); assert.equal(vazio.linhas[0].pct, null);
});

test("painel: projeção do mês só depois do 5º dia e com gasto", () => {
  assert.equal(N.pnProjecao(300, "2026-10-03"), null);
  assert.equal(N.pnProjecao(0, "2026-10-20"), null);
  assert.equal(N.pnProjecao(310, "2026-10-10"), 961);
  assert.equal(N.pnProjecao(280, "2026-02-14"), 560);
});

test("painel: consistência de treinos (semanas ativas, média e sequências; a semana corrente vazia não quebra a sequência)", () => {
  assert.equal(N.pnSemana("2026-10-31"), "2026-10-26"); assert.equal(N.pnSemana("2026-10-26"), "2026-10-26"); assert.equal(N.pnSemana("2026-11-01"), "2026-10-26");
  const datas = ["2026-10-01T07:00:00", "2026-10-02", "2026-10-08", "2026-10-15", "2026-10-15T18:00:00", "2026-09-01"];
  const c = N.pnConsistencia(datas, "2026-09-28", "2026-10-31");
  assert.equal(c.treinos, 5); assert.equal(c.diasAtivos, 4);
  assert.equal(c.semanas, 5); assert.equal(c.semanasAtivas, 3);
  assert.equal(c.maiorSequencia, 3); assert.equal(c.sequenciaAtual, 0, "a semana de 19/10 ficou sem treino");
  const c2 = N.pnConsistencia(["2026-10-20", "2026-10-13"], "2026-10-12", "2026-10-28");
  assert.equal(c2.sequenciaAtual, 2, "semana corrente (26/10) ainda sem treino não quebra");
  assert.deepEqual(N.pnConsistencia([], "2026-10-01", "2026-10-31").semanasAtivas, 0);
});

test("painel: média mensal de uma métrica diária; mês sem dado fica null (não vira zero)", () => {
  const dias = [{ data: "2026-09-01", dados: { passos: 8000 } }, { data: "2026-09-02", dados: { passos: 10000 } }, { data: "2026-10-01", dados: {} }, { data: "2026-10-02", dados: { passos: "x" } }];
  assert.deepEqual(N.pnMediaMes(dias, (d) => d.passos, ["2026-09", "2026-10"]), [{ mes: "2026-09", media: 9000, dias: 2 }, { mes: "2026-10", media: null, dias: 0 }]);
});

test("painel: competências ligam estudos concluídos às habilidades das vagas, com a data mais recente", () => {
  const c = N.pnCompetencias([{ t: "Joins e subconsultas em SQL", d: "2026-10-01" }, { t: "qualquer", d: "2026-10-20", skill: "sql" }, { t: "Kaggle Learn: Pandas", d: "2026-09-10" },
    { t: "Testes de hipótese", d: "2026-10-05" }, { t: "Sem data em SQL" }], ["sql", "powerbi"]);
  const k = Object.fromEntries(c.map((x) => [x.k, x]));
  assert.deepEqual([k.sql.estudos, k.sql.ultima, k.sql.declarada], [2, "2026-10-20", true]);
  assert.deepEqual([k.python.estudos, k.estat.estudos, k.powerbi.estudos, k.powerbi.declarada], [1, 1, 0, true]);
  assert.equal(c.length, N.SKILLS.length);
});

test("painel: despesas das três fontes, sem contar duas vezes a lata de fórmula que veio do Mercado", () => {
  const L = N.pnDespesas(
    [{ data: "2026-10-23", valor_total: "189.90", categoria: "Bebê" }, { data: "2026-10-24", valor_total: "x" }],
    [{ quem: "olivia", tipo: "outro", data: "2026-10-29", dados: { custo: 189.9, compra: { id: "abc" } } }, { quem: "civic", tipo: "abastecimento", data: "2026-10-20", dados: { custo: 250 } },
      { quem: "eddie", tipo: "consulta", data: "2026-10-05", dados: { custo: "180" } }, { quem: "eddie", tipo: "vacina", data: "2026-10-06", dados: {} }],
    [{ venc: "2026-10-10", v: 626.85, paga: true }, { venc: "2026-11-10", v: 626.85, paga: false }],
    (q) => (q === "civic" ? "Veículos" : q));
  assert.deepEqual(L.map((x) => [x.d, x.v, x.f]), [["2026-10-23", 189.9, "Mercado"], ["2026-10-20", 250, "Veículos"], ["2026-10-10", 626.85, "MBA"]]);
});

/* ---------------------------------------------------------------- régua de prioridades (Próxima melhor ação, Agenda, resumo falado, RAC Hoje) */
const PH = "2026-11-10";
const cand = (o = {}) => ({ id: "c1", t: "Técnico de Suporte N2", e: "Acme", coluna: "candidatei", datas: { candidatei: "2026-11-03" }, ...o }); /* follow-up em 08/11: 2 dias atrás */
const ev = (o = {}) => ({ data: PH, t: "Revisão do Civic", tipo: "veiculo", href: "#veiculos/civic", ...o });

test("prioridades: candidatura com resultado preenchido nunca gera ação (aprovado, recusado, vaga cancelada, desisti, sem retorno)", () => {
  assert.equal(N.priFollowup(cand(), PH).estado, "ativo", "sem resultado: o follow-up existe");
  for (const r of ["aprovado", "recusado", "vaga cancelada", "desisti", "sem retorno"]) assert.equal(N.priFollowup(cand({ resultado: r }), PH).estado, "nenhum", r);
  assert.equal(N.priFollowup(cand({ resultado: "recusado", datas: { candidatei: "2026-11-08" } }), PH).estado, "nenhum", "nem a candidatura de ontem");
});

test("prioridades: só a coluna 'candidatei' gera follow-up; follow-up feito, sem data ou outra coluna não geram", () => {
  for (const c of ["salva", "entrevista", "resposta"]) assert.equal(N.priFollowup(cand({ coluna: c }), PH).estado, "nenhum", c);
  assert.equal(N.priFollowup(cand({ followup: "2026-11-05" }), PH).estado, "nenhum");
  assert.equal(N.priFollowup(cand({ datas: {} }), PH).estado, "nenhum");
  assert.equal(N.priFollowup(null, PH).estado, "nenhum");
});

test("prioridades: follow-up calculado vale até 10 dias corridos depois de vencer; com mais que isso é 'sem retorno' (candidatura + 5 dias)", () => {
  const f = (d) => { const x = N.priFollowup(cand({ datas: { candidatei: d } }), PH); return [x.estado, x.dias, x.data]; };
  assert.deepEqual(f("2026-11-10"), ["ativo", 5, "2026-11-15"], "ainda vai vencer");
  assert.deepEqual(f("2026-11-05"), ["ativo", 0, "2026-11-10"], "vence hoje");
  assert.deepEqual(f("2026-10-26"), ["ativo", -10, "2026-10-31"], "10 dias de atraso: ainda vale");
  assert.deepEqual(f("2026-10-25"), ["sem_retorno", -11, "2026-10-30"], "11 dias: deixa de ser atraso ativo");
  assert.equal(f("2026-09-20")[0], "sem_retorno", "o caso da página inicial (20/09)");
  const m = N.priFollowup(cand({ datas: { candidatei: "2026-09-20" }, followupEm: "2026-11-08" }), PH);
  assert.deepEqual([m.estado, m.data], ["ativo", "2026-11-08"], "adiar (followupEm) manda na data; a validade conta daí");
});

test("prioridades: prazo real vencido continua urgente (a validade de 10 dias NÃO vale para vencimentos reais)", () => {
  const i = N.priItem(ev({ data: "2026-09-25" }), PH);
  assert.deepEqual([i.prazo, i.nivel, i.dias, i.cartao], ["real", "urgente", -46, true]);
  assert.match(i.motivo, /^venceu há 46 dias/);
  assert.equal(N.priItem(ev({ data: PH }), PH).nivel, "urgente"); assert.equal(N.priItem(ev({ data: "2026-11-11" }), PH).nivel, "importante");
  assert.equal(N.priItem(ev({ data: "2026-11-13" }), PH).nivel, "importante"); assert.equal(N.priItem(ev({ data: "2026-11-14" }), PH).nivel, "informativo", "4 a 7 dias: informativo");
  assert.equal(N.priItem(ev({ data: "2026-11-14" }), PH).cartao, false, "e fora do cartão (fica na Agenda)");
});

test("prioridades: prazo real de hoje supera qualquer follow-up calculado, e o calculado nunca passa de real vencido, de hoje ou dos próximos 3 dias", () => {
  const calc = (d, tipo = "carreira") => N.priItem(ev({ data: d, tipo, prazo: "calculado", acao: "followup", cid: "c1", t: "Técnico de Suporte N2" }), PH);
  const maxCalc = Math.max(...["2026-09-01", "2026-10-31", PH, "2026-11-12"].flatMap((d) => ["carreira", "mba", "familia", "sistema"].map((t) => calc(d, t).p)));
  const minReal3 = Math.min(...["mba", "familia", "veiculo", "carreira", "docs", "lembrete", "niver", "sistema"].flatMap((t) => [-30, -1, 0, 1, 2, 3].map((n) => N.priItem(ev({ tipo: t, data: N.somaDiasISO(PH, n) }), PH).p)));
  assert.ok(maxCalc < minReal3, "calculado (" + maxCalc + ") abaixo do menor real de até 3 dias (" + minReal3 + ")");
  const l = N.priSelecionar([calc("2026-10-31"), N.priItem(ev({ t: "Boleto do MBA", tipo: "mba" }), PH), N.priItem(ev({ t: "Seguro", tipo: "docs", data: "2026-11-09" }), PH)]);
  assert.deepEqual([l.destaque.titulo, l.secundarias.map((x) => x.titulo)], ["Seguro", ["Boleto do MBA", "Técnico de Suporte N2"]], "real vencido, real de hoje, e só então o follow-up");
  assert.equal(calc("2026-11-08").nivel, "importante"); assert.equal(calc("2026-11-12").nivel, "informativo", "follow-up que ainda vai vencer não é ação");
});

test("prioridades: empates e ordenação são determinísticos (pontos, natureza do prazo, proximidade, título e id)", () => {
  const a = N.priItem(ev({ t: "B", tipo: "mba", data: "2026-11-11" }), PH), b = N.priItem(ev({ t: "A", tipo: "mba", data: "2026-11-11" }), PH), c = N.priItem(ev({ t: "C", tipo: "mba", data: "2026-11-12" }), PH);
  const o1 = N.priOrdenar([a, b, c]).map((x) => x.titulo), o2 = N.priOrdenar([c, b, a]).map((x) => x.titulo);
  assert.deepEqual(o1, ["A", "B", "C"]); assert.deepEqual(o1, o2, "a ordem não depende da entrada");
  const x1 = N.priItem(ev({ t: "Mesmo nome", tipo: "mba", data: "2026-11-11", id: "z" }), PH), x2 = N.priItem(ev({ t: "Mesmo nome", tipo: "mba", data: "2026-11-11", id: "a" }), PH);
  assert.deepEqual(N.priOrdenar([x1, x2]).map((x) => x.id), ["a", "z"], "empate total: pelo id");
  assert.equal(N.priPontos("real", 0, "mba"), N.hojePrioridade({ dias: 0, area: "mba" }), "o RAC Hoje usa a mesma régua");
});

test("prioridades: vaga e treino são informativos, nunca destaque nem urgência; mostra no máximo 2", () => {
  const v = (i, extra) => N.priOportunidade({ id: "vaga:" + i, area: "carreira", titulo: "Analista " + i, motivo: "80% compatível", href: "#vagas", extra });
  assert.deepEqual([v(1, 5).nivel, v(1, 5).prazo, v(1, 5).cartao], ["informativo", "informativo", true]);
  const s = N.priSelecionar([v(1, 5), v(2, 9), v(3, 1)]);
  assert.equal(s.destaque, null); assert.equal(s.vazio, true); assert.equal(s.acoes, 0);
  assert.deepEqual(s.mostrados.map((x) => x.titulo), ["Analista 2", "Analista 1"], "as mais compatíveis; só 2 informativas");
  const m = N.priSelecionar([v(1, 5), N.priItem(ev({ data: PH }), PH)]);
  assert.equal(m.destaque.titulo, "Revisão do Civic"); assert.deepEqual(m.secundarias.map((x) => x.nivel), ["informativo"]);
});

test("prioridades: sem nada relevante, vazio de verdade (nada inventado); 1 destaque + 3 secundárias no máximo", () => {
  const z = N.priSelecionar([]); assert.deepEqual([z.destaque, z.mostrados.length, z.vazio, z.mais], [null, 0, true, 0]);
  const fora = N.priSelecionar([N.priItem(ev({ data: "2026-11-16" }), PH), N.priItem(ev({ data: "2026-11-14" }), PH)]);
  assert.equal(fora.vazio, true, "compromissos de 4 a 7 dias ficam na Agenda, não no cartão"); assert.equal(fora.mostrados.length, 0);
  assert.equal(N.priItem({ ...ev(), semRetorno: true }, PH), null, "'sem retorno' não pede nada");
  const seis = N.priSelecionar([1, 2, 3, 4, 5, 6].map((n) => N.priItem(ev({ t: "Item " + n, data: N.somaDiasISO(PH, -n) }), PH)));
  assert.deepEqual([seis.destaque.titulo, seis.secundarias.length, seis.mais, seis.ids.length], ["Item 6", 3, 2, 4], "o mais atrasado primeiro (prazo real vencido); sobram 2 para a Agenda");
});

test("prioridades: cartão criado por e-mail — a confirmação antiga deixa de ser pendência sozinha, a recente segue válida", () => {
  /* o formato exato que js/carreira.js grava ao aplicar uma confirmação de candidatura (data = a do e-mail) */
  const doEmail = (data) => ({ id: "e19a", emailId: "19a", t: "(vaga sem nome no e-mail)", e: "Acme", fonte: "Gupy", coluna: "candidatei", datas: { candidatei: data }, followup: false, interacoes: [{ d: data, tipo: "E-mail", t: "Candidatura: Recebemos" }] });
  assert.equal(N.priFollowup(doEmail("2026-10-01"), PH).estado, "sem_retorno", "e-mail de outubro: já nasce 'sem retorno'");
  assert.equal(N.priFollowup(doEmail("2026-11-07"), PH).estado, "ativo");
  assert.match(fs.readFileSync(new URL("../js/carreira.js", import.meta.url), "utf8"), /followup:alvo!=="candidatei"/, "o cartão do e-mail continua sendo criado como antes (nada de estado novo)");
});

test("prioridades: a régua não altera a candidatura nem o histórico (função pura)", () => {
  const c = cand({ resultado: "", interacoes: [{ d: "2026-11-03", tipo: "E-mail", t: "x" }], datas: { candidatei: "2026-09-20" } }), antes = JSON.stringify(c);
  Object.freeze(c); Object.freeze(c.datas); Object.freeze(c.interacoes);
  assert.equal(N.priFollowup(c, PH).estado, "sem_retorno"); assert.equal(JSON.stringify(c), antes, "nada mudou: 'sem retorno' é só apresentação");
  assert.equal(c.resultado, "", "o resultado real continua o que o dono marcou");
});

test("prioridades: a sugestão de Saúde só existe com dado de ontem ou hoje e com algo a recomendar", () => {
  assert.equal(N.priSaude(null), null); assert.equal(N.priSaude({ semDados: true }), null);
  assert.equal(N.priSaude({ prontidao: 30, atraso: 5, semTreino: 9 }), null, "dado velho não recomenda nada");
  assert.equal(N.priSaude({ prontidao: 80, atraso: 0, semTreino: 1 }), null, "nada a recomendar");
  assert.equal(N.priSaude({ prontidao: 80, atraso: 1, semTreino: null }), null, "sem treino registrado, não inventa");
  assert.deepEqual([N.priSaude({ prontidao: 30, atraso: 0, semTreino: 1, alertas: ["sono curto"] }).tipo, N.priSaude({ prontidao: 72, atraso: 1, semTreino: 4 }).tipo, N.priSaude({ prontidao: 72, atraso: 1, semTreino: 4 }).forte], ["recuperacao", "treino", true]);
});

/* ---------- DS-4.1 · Agenda (RAC Modern Workspace): agrupamento, indicadores, série e filtro (NUCLEO.agd*) ---------- */
const AG_HOJE = "2026-11-13";
const dia = (n) => N.somaDiasISO(AG_HOJE, n);
const evAg = (data, t, extra = {}) => ({ data, t, sub: "", tipo: "familia", href: "", ...extra });
/* os critérios de ANTES, copiados de renderAgenda (js/sistema.js até a DS-4.1): o agrupamento novo tem que dar exatamente o mesmo */
function gruposAntes(ev, hoje) {
  const mais = (d, n) => N.somaDiasISO(d, n);
  const G = [["Atrasados", (e) => e.data < hoje && !e.semRetorno], ["Hoje", (e) => e.data === hoje], ["Próximos 7 dias", (e) => e.data > hoje && e.data <= mais(hoje, 7)],
    ["Até 30 dias", (e) => e.data > mais(hoje, 7) && e.data <= mais(hoje, 30)], ["Depois", (e) => e.data > mais(hoje, 30) && e.data <= mais(hoje, 120)], ["Candidaturas sem retorno", (e) => !!e.semRetorno]];
  return G.map((g) => ({ rotulo: g[0], itens: ev.filter(g[1]) }));
}

test("Agenda: os 6 grupos têm os mesmos nomes, a mesma ordem e os mesmos critérios de antes (todas as bordas de data)", () => {
  assert.deepEqual(N.AGD_GRUPOS.map((g) => g[1]), ["Atrasados", "Hoje", "Próximos 7 dias", "Até 30 dias", "Depois", "Candidaturas sem retorno"]);
  const ev = [];
  for (let n = -15; n <= 125; n++) { ev.push(evAg(dia(n), "item " + n)); }
  ev.push(evAg(dia(-12), "sem retorno antigo", { semRetorno: true }), evAg(dia(-40), "sem retorno mais antigo", { semRetorno: true }), evAg(dia(3), "sem retorno futuro (não acontece, mas a regra é a de antes)", { semRetorno: true }));
  const novo = N.agdGrupos(ev, AG_HOJE).map((g) => ({ rotulo: g.rotulo, itens: g.itens })), antes = gruposAntes(ev, AG_HOJE);
  assert.deepEqual(novo, antes, "mesmos eventos em cada grupo, na mesma ordem");
  const por = Object.fromEntries(N.agdGrupos(ev, AG_HOJE).map((g) => [g.k, g.itens.map((e) => e.data)]));
  assert.equal(por.hoje.length, 1, "só o item de hoje");
  assert.ok(por.atrasados.every((d) => d < AG_HOJE) && por.atrasados.length === 15, "atrasados: 15 dias, sem os 'sem retorno'");
  assert.ok(!N.agdGrupos(ev, AG_HOJE)[0].itens.some((e) => e.semRetorno), "sem retorno não é atraso");
  assert.deepEqual(N.agdGrupos(ev, AG_HOJE)[2].itens.map((e) => e.data)[0], dia(1)); assert.equal(N.agdGrupos(ev, AG_HOJE)[2].itens.filter((e) => !e.semRetorno).length, 7, "7 dias: de amanhã a hoje+7");
  assert.equal(N.agdGrupos(ev, AG_HOJE)[3].itens.length, 23, "até 30 dias: de hoje+8 a hoje+30"); assert.equal(N.agdGrupos(ev, AG_HOJE)[4].itens.length, 90, "depois: de hoje+31 a hoje+120; o que passa de 120 dias não aparece (como antes)");
  assert.deepEqual(N.agdGrupos([], AG_HOJE).map((g) => g.itens.length), [0, 0, 0, 0, 0, 0]); assert.deepEqual(N.agdGrupos(null, AG_HOJE).map((g) => g.itens.length), [0, 0, 0, 0, 0, 0]);
});

test("Agenda: 'quando' diz há N dias, hoje, amanhã ou o dia da semana, como a linha de antes", () => {
  assert.equal(N.agdQuando(dia(-1), AG_HOJE), "há 1 dia"); assert.equal(N.agdQuando(dia(-9), AG_HOJE), "há 9 dias");
  assert.equal(N.agdQuando(AG_HOJE, AG_HOJE), "hoje"); assert.equal(N.agdQuando(dia(1), AG_HOJE), "amanhã");
  const d = N.agdQuando(dia(5), AG_HOJE); assert.match(d, /18\/11/); assert.match(d, /^[a-zç]+\.?,? ?18\/11$|18\/11/, "dia da semana e data: " + d);
  assert.equal(N.agdQuando(dia(-1) + "T10:00:00", AG_HOJE), "há 1 dia", "aceita data com hora");
});

test("Agenda: indicadores e frase só com contagens que existem; sem nada, diz que não há nada", () => {
  const ev = [evAg(dia(-4), "Revisão"), evAg(dia(-1), "Boleto", { tipo: "mba" }), evAg(AG_HOJE, "Aula", { tipo: "mba" }), evAg(dia(2), "Vacina"), evAg(dia(20), "Seguro", { tipo: "docs" }), evAg(dia(-30), "Velho", { semRetorno: true, tipo: "carreira" })];
  const r = N.agdResumo(ev, AG_HOJE);
  assert.deepEqual([r.atrasados, r.hoje, r.sete, r.trinta, r.depois, r.semretorno, r.total], [2, 1, 1, 1, 0, 1, 6]);
  assert.equal(r.maisAntigo, 4, "o mais antigo atrasado venceu há 4 dias (o sem retorno não conta)"); assert.equal(r.primeiroHoje, "Aula"); assert.equal(r.ateSete, dia(7));
  assert.equal(N.agdFrase(r), "2 itens atrasados · 1 para hoje · 1 no próximo 7 dias.");
  assert.equal(N.agdFrase(N.agdResumo([evAg(dia(-1), "x"), evAg(dia(3), "a"), evAg(dia(4), "b")], AG_HOJE)), "1 item atrasado · 2 nos próximos 7 dias.");
  assert.equal(N.agdFrase(N.agdResumo([evAg(dia(25), "longe")], AG_HOJE)), "Nada atrasado, para hoje ou nos próximos 7 dias.");
  assert.equal(N.agdFrase(N.agdResumo([], AG_HOJE)), "Nada com data por enquanto."); assert.equal(N.agdResumo([], AG_HOJE).maisAntigo, null);
  assert.equal(N.agdFrase(N.agdResumo([evAg(dia(-30), "Velho", { semRetorno: true })], AG_HOJE)), "Nada atrasado, para hoje ou nos próximos 7 dias.", "só 'sem retorno': não é atraso");
});

test("Agenda: série dos próximos dias (carga por dia), áreas com contagem e filtro por área", () => {
  const ev = [evAg(AG_HOJE, "a"), evAg(AG_HOJE, "b", { tipo: "mba" }), evAg(dia(2), "c"), evAg(dia(2), "d", { semRetorno: true }), evAg(dia(14), "fora da janela"), evAg(dia(-1), "atrasado (não entra na série)"), evAg(dia(40), "e", { tipo: "docs" })];
  const s = N.agdSerie(ev, AG_HOJE, 14);
  assert.equal(s.length, 14); assert.deepEqual(s.map((x) => x.data), Array.from({ length: 14 }, (_, i) => dia(i))); assert.deepEqual(s.map((x) => x.n), [2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(N.agdAreas(ev, AG_HOJE), [{ k: "familia", n: 5 }, { k: "docs", n: 1 }, { k: "mba", n: 1 }], "só o que a página mostra; mais cheia primeiro, empate por nome");
  assert.deepEqual(N.agdAreas([evAg(AG_HOJE, "x", { tipo: undefined })], AG_HOJE), [{ k: "outros", n: 1 }]);
  assert.deepEqual(N.agdFiltrar(ev, "mba").map((e) => e.t), ["b"]); assert.equal(N.agdFiltrar(ev, "todos").length, ev.length); assert.equal(N.agdFiltrar(ev, "").length, ev.length); assert.equal(N.agdFiltrar(null, "mba").length, 0);
  assert.deepEqual(N.agdFiltrar([evAg(AG_HOJE, "x", { tipo: undefined })], "outros").length, 1);
});

test("Agenda: o peso da linha (atrasado = alta; o resto pela régua de prioridades; sem retorno e distante = nenhum)", () => {
  assert.equal(N.agdTom(evAg(dia(-3), "boleto", { tipo: "mba" }), AG_HOJE), "alta"); assert.equal(N.agdTom(evAg(AG_HOJE, "aula", { tipo: "mba" }), AG_HOJE), "alta", "prazo real de hoje é urgente");
  assert.equal(N.agdTom(evAg(dia(2), "vacina"), AG_HOJE), "media", "prazo real em até 3 dias é importante"); assert.equal(N.agdTom(evAg(dia(20), "seguro"), AG_HOJE), null);
  assert.equal(N.agdTom(evAg(dia(-12), "velho", { semRetorno: true }), AG_HOJE), null); assert.equal(N.agdTom(null, AG_HOJE), null);
  assert.equal(N.agdTom(evAg(dia(-2), "follow-up", { prazo: "calculado", acao: "followup" }), AG_HOJE), "alta", "follow-up vencido continua alerta, como antes");
});
