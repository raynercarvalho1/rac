// RAC Hoje (docs/hoje.md) e monitor de custos da IA, sem rede e sem dados pessoais: as regras do dia (NUCLEO.hoje*), o monitor
// (NUCLEO.iaMonitor e custoDetalhe da rac-ia), a ação hoje.analise no servidor (validação e "só REAL") e o coletor e a camada de IA
// do site (js/hoje.js) rodando de verdade num ambiente falso. As chamadas reais à IA dependem da produção (028, 029 e a rac-ia publicada).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { ACOES } from "../supabase/functions/rac-ia/acoes.ts";
import { custoDetalhe } from "../supabase/functions/rac-ia/orcamento.ts";
import { atenderPedido } from "../supabase/functions/rac-ia/servico.ts";
import { registro, rota } from "./_rotas.mjs";   // registro de rotas e do menu (js/rotas.js, Fase 2 · A3)

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const HOJE = "2026-11-10", AGORA = Date.parse("2026-11-10T12:00:00-03:00");
const plano = (x) => JSON.parse(JSON.stringify(x));

/* ---------------------------------------------------------------- regras do dia */
test("fontes: ok, vazia, falhou (com o erro), desatualizada (pela data do dado) e ausente são estados diferentes", () => {
  const e = Object.fromEntries(N.hojeEstadoFontes({
    agenda: { ok: true, v: [1] }, tarefas: { ok: true, v: [], vazio: true }, mercado: { ok: false, erro: "timeout" },
    noticias: { ok: true, v: [1], quando: "2026-11-09T10:00:00Z" }, newsletter: { ok: true, v: {}, quando: "2026-11-10T13:00:00Z" },
  }, AGORA).map((x) => [x.k, x]));
  assert.equal(e.agenda.estado, "ok"); assert.equal(e.tarefas.estado, "vazia"); assert.equal(e.mercado.estado, "falhou"); assert.match(e.mercado.detalhe, /timeout/);
  assert.equal(e.noticias.estado, "desatualizada"); assert.equal(e.newsletter.estado, "ok"); assert.equal(e.saude.estado, "ausente");
});

test("prioridade: atrasado > hoje > amanhã > semana > sem data, com o peso da área; dedup junta o mesmo assunto de duas fontes", () => {
  const it = (o) => N.hojeItem(o, HOJE);
  const l = [it({ area: "lembrete", titulo: "Ontem", data: "2026-11-09", fonte: "agenda" }), it({ area: "mba", titulo: "Hoje", data: HOJE, fonte: "agenda" }),
    it({ area: "mba", titulo: "Amanhã", data: "2026-11-11", fonte: "agenda" }), it({ area: "tarefa", titulo: "Sem data", fonte: "tarefas" })];
  assert.deepEqual(N.hojeOrdenar(l).map((x) => x.titulo), ["Ontem", "Hoje", "Amanhã", "Sem data"]);
  assert.equal(l[1].nivel, "alta"); assert.equal(l[3].nivel, "baixa");
  const d = N.hojeDedup([it({ area: "mba", titulo: "Responder: Avaliação 1 (Estatística)", data: "2026-11-13", fonte: "agenda" }),
    it({ area: "mba", titulo: "Avaliação 1 (Estatística)", data: "2026-11-13", fonte: "mba" }), it({ area: "mba", titulo: "Avaliação 1 (Estatística)", data: "2026-11-20", fonte: "mba" })]);
  assert.equal(d.length, 2, "mesma data e mesmo assunto viram um; outra data fica"); assert.deepEqual(d[0].fontes, ["agenda", "mba"]);
});

test("finanças: mês até hoje contra o mesmo trecho do mês passado, cada fonte uma vez, sem o que está fora das contas; projeção e orçamento", () => {
  const f = {
    mercado: { ok: true, v: [{ data: "2026-11-02", valor_total: 300 }, { data: "2026-10-05", valor_total: 200 }, { data: "2026-10-25", valor_total: 999 }] },
    alimentacao: { ok: true, v: [{ data: "2026-11-09", total_pago: 100 }] },
    compras: { ok: true, v: [{ data: "2026-11-03", total_pago: 50 }, { data: "2026-11-04", total_pago: 80, fora_das_contas: true }] },
    orcamentos: { ok: true, v: [{ categoria: "Mercado", valor: 600 }] },
  };
  const r = N.hojeFinancas(f, HOJE);
  assert.equal(r.total, 450); assert.equal(r.totalAnt, 200, "do mês passado só até o dia 10"); assert.equal(r.pct, 125);
  assert.equal(r.ontem.alimentacao, 100); assert.equal(r.projecao, 1350); assert.deepEqual([r.orcamento.pct, r.orcamento.projecaoPct], [75, 225]);
  const so = N.hojeFinancas({ mercado: { ok: false, erro: "x" } }, HOJE);
  assert.deepEqual(so.fontes, [], "fonte que falhou não vira zero");
});

test("o que mudou desde ontem: só contas do código; sem base no mês passado, diz que não compara", () => {
  const f = { mercado: { ok: true, v: [{ data: "2026-11-09", valor_total: 42.5 }] }, vagas: { ok: true, v: { vagas: [{ d: 0 }, { d: 1 }, { d: 5 }] } } };
  const m = N.hojeMudancas(f, HOJE, N.hojeFinancas(f, HOJE), null).map((x) => x.texto);
  assert.ok(m.includes("Gastos registrados ontem: R$ 42,50")); assert.ok(m.some((t) => /sem base no mês passado/.test(t))); assert.ok(m.includes("2 vagas novas desde ontem"));
});

test("saúde: último dia, atraso, prontidão do núcleo e dias sem treino; nunca sincroniza (só lê o que veio)", () => {
  const dias = []; for (let i = 20; i >= 2; i--) dias.push({ data: N.somaDiasISO(HOJE, -i), dados: { passos: 8000, sono: { total: 25200, nota: 80 }, vfc: { noite: 50 } } });
  const s = N.hojeSaude({ ok: true, v: { dias, ativs: [{ inicio: "2026-11-03T07:00:00", tipo: "running" }] } }, HOJE);
  assert.equal(s.ultimo, "2026-11-08"); assert.equal(s.atraso, 2); assert.equal(s.sonoH, 7); assert.equal(s.semTreino, 7);
  assert.deepEqual(N.hojeSaude({ ok: true, v: { dias: [], ativs: [] } }, HOJE), { semDados: true });
  assert.equal(N.hojeSaude({ ok: false, erro: "x" }, HOJE), null);
  /* o dia de hoje ainda está em andamento: a comparação de passos usa os dois últimos dias completos */
  const p = N.hojeSaude({ ok: true, v: { dias: [{ data: "2026-11-08", dados: { passos: 9000 } }, { data: "2026-11-09", dados: { passos: 10446 } }, { data: HOJE, dados: { passos: 146 } }], ativs: [] } }, HOJE);
  assert.deepEqual([p.ultimo, p.diaPassos, p.passos, p.diaPassosAnt, p.passosAnt], [HOJE, "2026-11-09", 10446, "2026-11-08", 9000]);
  assert.deepEqual([...N.TREINO_OCULTOS], ["fitness_equipment", "open_water_swimming", "cycling"], "a lista que a Saúde esconde mora no núcleo");
  assert.match(ler("js/saude.js"), /var TREINO_OCULTOS=NUCLEO\.TREINO_OCULTOS;/); assert.match(ler("js/hoje.js"), /ocultos=NUCLEO\.TREINO_OCULTOS;/);
});

test("pacote de fatos: ids em ordem, fontes que falharam viram fato, nada de link, e-mail, documento, senha ou token, e com teto", () => {
  const f = {
    agenda: { ok: true, v: [{ data: "2026-11-11", t: "Pagar boleto do MBA", sub: "veja https://x.com/boleto?id=9 ou fale com joao@exemplo.com", tipo: "mba", pre: "Boleto" },
      { data: "2026-11-12", t: "Renovar o seguro 123.456.789-00", tipo: "veiculo" }] },
    tarefas: { ok: true, v: [{ item: "trocar a senha do banco: 1234", criado: "2026-11-01" }] },
    mercado: { ok: false, erro: "rede caiu" },
  };
  const c = N.hojeContexto(f, HOJE, AGORA);
  assert.match(c.texto, /^<fato id="f01" fonte="rac" periodo="hoje">Hoje é 2026-11-10\.<\/fato>/);
  assert.match(c.texto, /Fonte Mercado: a leitura falhou \(rede caiu\)/);
  assert.ok(!/https?:|@exemplo|123\.456|senha/i.test(c.texto), "minimização: " + c.texto);
  assert.match(c.texto, /\[e-mail\]/); assert.match(c.texto, /\[número\]/);
  assert.equal(N.hojeLimpar("coleta em 2026-11-02 09:54, cartão 1234 5678 9012 3456, dia 12/10/2026"), "coleta em 2026-11-02 09:54, cartão [número], dia 12/10/2026", "datas ficam, documentos saem");
  const ids = [...c.texto.matchAll(/<fato id="(f\d\d)"/g)].map((m) => m[1]); assert.deepEqual(ids, ids.map((_, i) => "f" + String(i + 1).padStart(2, "0")));
  assert.ok(!/<(?!\/?fato)/.test(c.texto), "nenhum < solto dentro dos fatos");
  const pequeno = N.hojeContexto(f, HOJE, AGORA, 200); assert.ok(pequeno.texto.length <= 200);
  const q = N.hojeContexto(f, HOJE, AGORA, 12000, { quem: "Olivia é a filha bebê do dono; Eddie é o cachorro da família" });
  assert.match(q.texto, /<fato id="f02" fonte="rac" periodo="sempre">Quem é quem no RAC: Olivia é a filha bebê do dono; Eddie é o cachorro da família\.<\/fato>/, "a IA sabe quem é pessoa, pet ou veículo");
});

test("chave da análise: a mesma para o mesmo pacote e pergunta; muda com a pergunta e com a nova análise; formato aceito pela rac-ia", () => {
  const a = N.hojeChave(HOJE, "fatos", "", 0), b = N.hojeChave(HOJE, "fatos", "", 0);
  assert.equal(a, b); assert.notEqual(a, N.hojeChave(HOJE, "fatos", "e as finanças?", 0)); assert.notEqual(a, N.hojeChave(HOJE, "fatos", "", 1));
  for (const k of [a, N.hojeChave(HOJE, "x", "y", 12)]) assert.match(k, /^[A-Za-z0-9_-]{8,80}$/);
});

test("chave da análise sem o tempo: temperatura, chuva e o estado da fonte Tempo não mudam a chave; os outros dados mudam; a IA ainda recebe o tempo", () => {
  const base = { mercado: { ok: true, v: [{ data: "2026-11-09", valor_total: 120 }] }, agenda: { ok: true, v: [{ data: "2026-11-11", t: "Boleto 5", tipo: "mba", pre: "Boleto" }] } };
  const chave = (f, perg = "") => { const c = N.hojeContexto(f, HOJE, AGORA); return [N.hojeChave(HOJE, N.hojeTextoChave(c.texto), perg, 0), c.texto]; };
  const [k1, t1] = chave({ ...base, tempo: { ok: true, v: "Em Sorocaba: 25 graus agora, máxima 30, mínima 18; sem chuva prevista nas próximas horas.", quando: "2026-11-10T11:00:00-03:00" } });
  const [k2, t2] = chave({ ...base, tempo: { ok: true, v: "Em Sorocaba: 19 graus agora, máxima 22, mínima 15; chuva provável às 15h.", quando: "2026-11-10T11:45:00-03:00" } });
  const [k3, t3] = chave({ ...base, tempo: { ok: true, v: "Em Sorocaba: 18 graus agora.", quando: "2026-11-10T02:00:00-03:00" } });
  const [k4] = chave({ ...base, tempo: { ok: false, erro: "HTTP 503" } }), [k5] = chave(base);
  assert.match(t1, /fonte="tempo"[^>]*>Em Sorocaba: 25 graus/, "o tempo continua no que vai para a IA"); assert.match(t2, /19 graus/);
  assert.match(t3, /Fonte Tempo em Sorocaba: desatualizada, dado de 10 horas atrás/, "o estado da fonte Tempo também vai para a IA");
  assert.deepEqual([k2, k3, k4, k5], [k1, k1, k1, k1], "só o tempo mudou: mesma chave");
  const [m1] = chave({ ...base, mercado: { ok: true, v: [{ data: "2026-11-09", valor_total: 121 }] }, tempo: { ok: true, v: "Em Sorocaba: 25 graus agora.", quando: "2026-11-10T11:00:00-03:00" } });
  const [m3] = chave({ ...base, mercado: { ok: false, erro: "timeout" } });
  for (const m of [m1, m3]) assert.notEqual(m, k1, "outros dados continuam mudando a chave");
  /* P9: notícias e Newsletter (e o estado delas) mudam várias vezes ao dia sem mudar o seu dia: ficam fora da chave */
  const [n1] = chave({ ...base, noticias: { ok: true, v: [{ t: "Obra na avenida" }], quando: "2026-11-10T10:00:00Z" } });
  const [n2] = chave({ ...base, noticias: { ok: true, v: [{ t: "Outra notícia" }], quando: "2026-11-10T13:00:00Z" }, newsletter: { ok: true, v: { destaques: [{ t: "X", cat: "Tecnologia", n: 1 }] }, quando: "2026-11-10T09:00:00Z" } });
  assert.deepEqual([n1, n2], [k1, k1], "notícias e Newsletter não mudam a chave (a IA ainda as recebe)");
  assert.notEqual(chave(base, "e as finanças?")[0], k1, "a pergunta continua mudando a chave");
  assert.equal(N.hojeTextoChave('<fato id="f07" fonte="mercado" periodo="x">a</fato>\n'), '<fato fonte="mercado" periodo="x">a</fato>', "sem os ids, que mudam com a entrada do estado do tempo");
});

/* ---------------------------------------------------------------- monitor de custos */
test("custo de uma chamada: entrada, saída e cache separados; sem preço de cache, conta como entrada (por excesso) e avisa; câmbio", () => {
  const p = { entrada_usd_mtok: 2, saida_usd_mtok: 10, max_entrada_tokens: 200000, conferido_em: "2026-10-30" };
  const d = custoDetalhe(p, { entrada: 10000, saida: 1000 }, { cambio_brl_usd: 6 }, "anthropic", "msg_01abc");
  assert.deepEqual([d.custo_entrada_usd, d.custo_saida_usd, d.custo_total_usd, d.custo_brl], [0.02, 0.01, 0.03, 0.18]);
  assert.equal(d.cache_como_entrada, false); assert.equal(d.precos_conferido_em, "2026-10-30"); assert.equal(d.requisicao_id, "msg_01abc");
  const c1 = custoDetalhe(p, { entrada: 10000, saida: 0, cacheLeitura: 4000 }, { cambio_brl_usd: 6 }, "anthropic", null);
  assert.equal(c1.custo_entrada_usd, 0.02); assert.equal(c1.cache_como_entrada, true, "sem preço de cache cadastrado");
  const c2 = custoDetalhe({ ...p, cache_leitura_usd_mtok: 0.2 }, { entrada: 10000, saida: 0, cacheLeitura: 4000 }, { cambio_brl_usd: 6 }, "anthropic", null);
  assert.equal(c2.custo_entrada_usd, 0.0128); assert.equal(c2.cache_como_entrada, false);
});

test("monitor: conhecido × estimado × incerto × sem custo; hoje, 7 dias, mês e total; por funcionalidade e modelo; sem contar duas vezes", () => {
  const L = [
    { id: "1", criado_em: "2026-11-10T10:00:00Z", funcionalidade: "hoje", modelo: "claude-sonnet-5-5", estado: "concluido", estimado_usd: 0.03, tokens_entrada: 9000, tokens_saida: 1200 },
    { id: "1", criado_em: "2026-11-10T10:00:00Z", funcionalidade: "hoje", modelo: "claude-sonnet-5-5", estado: "concluido", estimado_usd: 0.03 },
    { id: "2", criado_em: "2026-11-08T10:00:00Z", funcionalidade: "newsletter", modelo: "claude-haiku-5-5", estado: "reconciliado", estimado_usd: 0.002, conhecido_usd: 0.0018 },
    { id: "3", criado_em: "2026-11-01T10:00:00Z", funcionalidade: "hoje", modelo: "claude-sonnet-5-5", estado: "incerto", reservado_usd: 0.05 },
    { id: "4", criado_em: "2026-10-20T10:00:00Z", funcionalidade: "newsletter", modelo: "claude-haiku-5-5", estado: "falhou_sem_envio", reservado_usd: 0.01 },
    { id: "5", criado_em: "2026-10-21T10:00:00Z", funcionalidade: "newsletter", modelo: "claude-haiku-5-5", estado: "concluido", estimado_usd: null },
  ];
  const m = N.iaMonitor(L, HOJE, { cambio_brl_usd: 6, margem_impostos: 0.1, limite_brl: 1 });
  assert.equal(m.hoje.usd, 0.03); assert.equal(m.hoje.chamadas, 1, "a mesma chamada não conta duas vezes");
  assert.equal(m.semana.usd, 0.0318); assert.deepEqual([m.semana.conhecido, m.semana.estimado], [0.0018, 0.03]);
  assert.equal(m.mes.usd, 0.0818); assert.equal(m.mes.incerto, 0.05); assert.equal(m.total.chamadas, 5); assert.equal(m.total.falhas, 2);
  assert.equal(m.porFuncionalidade.hoje.usd, 0.08); assert.equal(m.porModelo["claude-haiku-5-5"].chamadas, 3);
  assert.equal(m.mes.brl, Math.round(0.0818 * 6 * 1.1 * 100) / 100, "real com câmbio e impostos da configuração");
  assert.equal(m.diario.length, 30); assert.equal(m.diario.at(-1).dia, HOJE); assert.deepEqual(m.mensal.map((x) => x.mes), ["2026-10", "2026-11"]);
  assert.deepEqual(m.limite.atingidos, [50], "0,54 de R$ 1: passou de 50%"); assert.deepEqual(m.caras, ["hoje"]);
  assert.equal(N.iaCustoChamada({ estado: "concluido", estimado_usd: null }).tipo, "sem_dado", "sem informação de custo, nada é inventado");
  const f = N.iaMonitor(L, HOJE, {}, { funcionalidade: "newsletter" }); assert.equal(f.total.chamadas, 3);
  assert.equal(N.iaMonitor(L, HOJE, {}).limite, null, "nenhum limite configurado aqui");
});

test("monitor: consumo atípico só com base de 5 dias e acima do fator × mediana", () => {
  const L = []; for (let i = 1; i <= 6; i++) L.push({ id: "b" + i, criado_em: N.somaDiasISO(HOJE, -i) + "T10:00:00Z", funcionalidade: "hoje", modelo: "m", estado: "concluido", estimado_usd: 0.01 });
  L.push({ id: "h", criado_em: HOJE + "T10:00:00Z", funcionalidade: "hoje", modelo: "m", estado: "concluido", estimado_usd: 0.05 });
  assert.ok(N.iaMonitor(L, HOJE, {}).atipico); assert.equal(N.iaMonitor(L, HOJE, { atipico_fator: 6 }).atipico, null);
  assert.equal(N.iaMonitor(L.slice(2), HOJE, {}).atipico, null, "menos de 5 dias de base");
});

/* ---------------------------------------------------------------- a ação hoje.analise (servidor) */
const FATOS = [
  '<fato id="f01" fonte="rac" periodo="hoje">Hoje é 2026-11-10.</fato>',
  '<fato id="f02" fonte="agenda+mba" periodo="2026-11-13">Prioridade alta: Avaliação 1 (Estatística) (em 3 dias, 2026-11-13)</fato>',
  '<fato id="f03" fonte="financas" periodo="2026-11">Gastos do mês até o dia 10: R$ 450,00 (Mercado R$ 300,00).</fato>',
  '<fato id="f04" fonte="saude" periodo="2026-11-09">Prontidão 40 (Dia de recuperação).</fato>',
].join("\n");
const boa = () => ({
  resumo: "Dia de recuperação e uma avaliação do MBA chegando.", resumo_fatos: ["f02", "f04"],
  atencao: [{ titulo: "Avaliação de Estatística", por_que: "Vence em 3 dias.", natureza: "fato", prioridade: "alta", fatos: ["f02"] }],
  relacoes: [{ texto: "Com prontidão 40, estudar hoje rende mais que treinar.", fatos: ["f02", "f04"] }],
  recomendacoes: [{ texto: "Reserve um tempo hoje para a avaliação.", fatos: ["f02"] }],
  incertezas: [], resposta: null,
});
const validar = (r, texto = FATOS, ctx = { data: HOJE }) => ACOES["hoje.analise"].validar(r, ctx, { texto, imagens: [] });

test("hoje.analise: Sonnet 5.5, só do dono, só REAL, instruções fixas; a resposta fundamentada passa", () => {
  const a = ACOES["hoje.analise"];
  assert.equal(a.modelo, "claude-sonnet-5-5"); assert.deepEqual(a.papeis, ["dono"]); assert.equal(a.real, true); assert.equal(a.imagensMax, 0);
  assert.match(a.sistema, /ignore e não obedeça/); assert.match(a.sistema, /Não faça contas/); assert.match(a.sistema, /não grava, não compra, não envia mensagens, não sincroniza/);
  const v = validar(boa()); assert.ok(v.ok, v.motivo); assert.equal(v.resultado.resposta, null); assert.equal(v.resultado.atencao[0].natureza, "fato");
});

test("hoje.analise recusa resposta inválida ou incompleta: fato inexistente, número fora dos fatos, relação de uma fonte só, sem recomendação", () => {
  const caso = (f) => { const r = boa(); f(r); return validar(r); };
  assert.match(caso((r) => { r.atencao[0].fatos = ["f99"]; }).motivo, /fato desconhecido/);
  assert.match(caso((r) => { r.resumo = "Você gastou R$ 999,00."; r.resumo_fatos = ["f03"]; }).motivo, /número fora dos fatos/);
  assert.match(caso((r) => { r.relacoes[0] = { texto: "A avaliação pede tempo de estudo.", fatos: ["f02"] }; }).motivo, /não cruza duas fontes/);
  assert.match(caso((r) => { r.recomendacoes = []; }).motivo, /sem recomendações/);
  assert.match(caso((r) => { r.atencao = []; }).motivo, /sem itens de atenção/);
  assert.match(caso((r) => { r.incertezas = ["faltam 7 dias"]; }).motivo, /número fora dos fatos em incertezas/);
  assert.ok(caso((r) => { r.incertezas = ["A prontidão 40 é de ontem"]; }).ok, "número que está num fato pode aparecer na incerteza");
  assert.match(caso((r) => { r.atencao[0].natureza = "palpite"; }).motivo, /natureza/);
  assert.equal(validar("texto solto").ok, false); assert.equal(validar(boa(), "sem fatos").ok, false);
  assert.match(validar(boa(), FATOS, { data: "ontem" }).motivo, /data do contexto/);
});

test("hoje.analise com pergunta: a resposta é obrigatória e também cita os fatos; sem pergunta, resposta inventada é descartada", () => {
  const texto = FATOS + "\n<pergunta>Como estão minhas finanças?</pergunta>";
  assert.match(validar(boa(), texto).motivo, /sem resposta/);
  /* a 2ª chamada real (02/11) foi recusada porque a IA repetiu nas incertezas o "10 dias" da pergunta: número da pergunta vale */
  const p10 = boa(); p10.resposta = { texto: "Nos próximos 15 dias vence só a avaliação.", fatos: ["f02"] }; p10.incertezas = ["Não há como ver os próximos 15 dias de contas"];
  assert.ok(validar(p10, FATOS + "\n<pergunta>O que vence nos próximos 15 dias?</pergunta>").ok, "número da própria pergunta pode ser repetido");
  assert.match(validar(p10, FATOS + "\n<pergunta>O que vence?</pergunta>").motivo, /número fora/, "sem a pergunta, o 15 seria inventado");
  const r = boa(); r.resposta = { texto: "Até o dia 10 foram R$ 450,00.", fatos: ["f03"] };
  const v = validar(r, texto); assert.ok(v.ok, v.motivo); assert.equal(v.resultado.pergunta, "Como estão minhas finanças?");
  const sem = validar(r); assert.ok(sem.ok); assert.equal(sem.resultado.resposta, null); assert.match(sem.avisos.join(" "), /descartada/);
});

/* banco falso da rac-ia: o mínimo para o fluxo de servico.ts */
function bancoRac(cfg, papel = "dono") {
  const b = { reservas: [], concluidas: [] };
  Object.assign(b, {
    papelEDono: async () => ({ papel, dono: "dono-1" }), config: async () => cfg, preco: async () => ({ entrada_usd_mtok: 2, saida_usd_mtok: 10, max_entrada_tokens: 200000, conferido_em: "2026-10-30" }),
    reservar: async (a) => { b.reservas.push(a); return { ok: true, id: "uso-1", comprometido_usd: 0, teto_usd: 6.7 }; },
    marcarEnvio: async () => true, falhouSemEnvio: async () => true, marcarIncerto: async () => true,
    concluir: async (...a) => { b.concluidas.push(a); return true; },
  });
  return b;
}
const pedidoHoje = (texto = FATOS) => ({ versao: 1, modulo: "hoje", acao: "hoje.analise", idempotencia: "hoje-2026-11-10-abcdef12", entrada: { texto, imagens: [] }, contexto: { data: HOJE } });
const CFG_REAL = { modo: "REAL", acoes_reais: ["newsletter.resumo", "hoje.analise"], acoes_reais_casa: [], limite_brl: 50, cambio_brl_usd: 6, margem_impostos: 0.12, margem_seguranca: 0.1, fator_correcao: 1 };

test("sem a IA real liberada, o RAC Hoje NÃO responde com demonstração: erro sem_real, nada reservado nem cobrado", async () => {
  for (const [cfg, prov] of [[{ ...CFG_REAL, modo: "DEMO" }, {}], [{ ...CFG_REAL, acoes_reais: ["newsletter.resumo"] }, {}], [CFG_REAL, null]]) {
    const b = bancoRac(cfg), r = await atenderPedido("dono-1", pedidoHoje(), { banco: b, provedor: prov && { nome: "x", contarTokens: async () => { throw new Error("não"); }, gerar: async () => { throw new Error("não"); } } });
    assert.equal(r.corpo.ok, false); assert.equal(r.corpo.erro.codigo, "sem_real"); assert.equal(r.corpo.resultado, undefined);
    assert.equal(b.reservas.length, 0, "nada reservado");
  }
  const casa = await atenderPedido("fernanda", pedidoHoje(), { banco: bancoRac(CFG_REAL, "casa"), provedor: null });
  assert.equal(casa.corpo.erro.codigo, "sem_permissao", "quem é da casa não usa o RAC Hoje");
});

test("REAL: uma chamada, resposta validada, e o registro de consumo recebe tokens, cache, custo separado, preço, câmbio e o id da requisição", async () => {
  const b = bancoRac(CFG_REAL); let chamadas = 0;
  const prov = { nome: "anthropic", contarTokens: async () => 3000, gerar: async () => { chamadas++; return { tipo: "ok", texto: JSON.stringify(boa()), uso: { entrada: 3000, saida: 500, cacheLeitura: 0, cacheEscrita: 0 }, modelo: "claude-sonnet-5-5", requisicao: "msg_teste1" }; } };
  const r = await atenderPedido("dono-1", pedidoHoje(), { banco: b, provedor: prov });
  assert.equal(r.corpo.ok, true, JSON.stringify(r.corpo)); assert.equal(r.corpo.modo, "REAL"); assert.equal(chamadas, 1);
  assert.equal(b.reservas[0].modulo, "hoje"); assert.equal(b.reservas[0].modelo, "claude-sonnet-5-5");
  const [id, te, ts, est, , erro, det] = b.concluidas[0];
  assert.deepEqual([id, te, ts, erro], ["uso-1", 3000, 500, null]); assert.equal(est, 0.011);
  assert.deepEqual(plano(det), { provedor: "anthropic", requisicao_id: "msg_teste1", tokens_cache_leitura: 0, tokens_cache_escrita: 0, custo_entrada_usd: 0.006, custo_saida_usd: 0.005,
    custo_total_usd: 0.011, preco_entrada_usd_mtok: 2, preco_saida_usd_mtok: 10, preco_cache_leitura_usd_mtok: null, preco_cache_escrita_usd_mtok: null,
    precos_conferido_em: "2026-10-30", cache_como_entrada: false, cambio_brl_usd: 6, custo_brl: 0.066 });
  assert.ok(!JSON.stringify(det).match(/Avaliação|Prontidão|f0\d/), "o registro de custo não leva conteúdo");
  const ruim = await atenderPedido("dono-1", pedidoHoje(), { banco: bancoRac(CFG_REAL), provedor: { ...prov, gerar: async () => ({ tipo: "ok", texto: '{"resumo":"x"}', uso: { entrada: 3000, saida: 10 }, modelo: "claude-sonnet-5-5" }) } });
  assert.equal(ruim.corpo.erro.codigo, "resposta_invalida"); assert.ok(ruim.corpo.consumo, "o consumo de uma resposta inválida também aparece");
});

/* ---------------------------------------------------------------- o coletor e a camada de IA do site (js/hoje.js) */
function bancoSite(resp) {
  const log = [], chamadas = { invoke: 0, urls: 0 };
  function consulta(t) {
    const st = { t, ops: [] }; log.push(st);
    const p = new Proxy({}, { get(_, k) {
      if (k === "then") { let r = resp[t]; if (typeof r === "function") r = r(st);
        const pr = Promise.resolve(r).then((x) => (x && x.erro ? { data: null, error: { message: x.erro } } : { data: x === undefined ? [] : x, error: null })); return pr.then.bind(pr); }
      return (...a) => { st.ops.push([k, ...a]); return p; };
    } });
    return p;
  }
  return { SB: { from: consulta, rpc: (n) => consulta("rpc:" + n), functions: { invoke: () => { chamadas.invoke++; return Promise.reject(new Error("proibido")); } },
    storage: { from: () => ({ createSignedUrls: () => { chamadas.urls++; return Promise.resolve({ data: [] }); } }) } }, log, chamadas };
}
/* Web Locks SIMULADO: mesma semântica do navegador (exclusivo por nome, ifAvailable devolve null se já está preso, solta quando a promessa do callback termina), mas os
   "contextos" rodam na mesma thread do teste. Prova a lógica do site em cima dessa semântica, NÃO a concorrência real entre abas. */
const novosLocks = () => ({ presos: new Set() });
const navegador = (reg) => ({ locks: { request: (nome, opt, cb) => { if (opt && opt.ifAvailable && reg.presos.has(nome)) return Promise.resolve(cb(null)); reg.presos.add(nome);
  return Promise.resolve().then(() => cb({ name: nome })).finally(() => reg.presos.delete(nome)); } } });
function site({ resp = {}, dono = true, racIA, jsons = {}, agenda, extra = {}, arquivos = [], mem = {}, uid = "dono-1", locks = novosLocks() } = {}) {
  const b = bancoSite(resp), ctxIA = { chamadas: [] };
  const ctx = {
    NUCLEO: N, console, Promise, Object, Array, JSON, Date, Math, String, Number, Error, Proxy, isFinite, clearTimeout,
    setTimeout: (f, ms) => { const t = setTimeout(f, ms); if (ms > 50 && t.unref) t.unref(); return t; },
    EU: uid ? { id: uid } : null, SB: b.SB, PAPEL: dono ? "dono" : "casa", isOwner: () => dono, sbOk: (r) => { if (r.error) throw new Error(r.error.message); return r.data; }, hojeISO: () => HOJE,
    precisa: () => Promise.resolve(), agendaColetar: agenda || (() => { ctxIA.agenda = (ctxIA.agenda || 0) + 1; return Promise.resolve([{ data: "2026-11-11", t: "Boleto 5", tipo: "mba", pre: "Boleto", sub: "boleto do MBA" }]); }),
    vgPronto: Promise.resolve(), VG: { all: [{ id: "v1", t: "Analista de Dados SQL Power BI", e: "Empresa A", d: 1 }], coletado: "2026-11-10T09:00:00Z" }, vgHidden: {},
    PESSOAL: { perfilCarreira: { skills: ["sql", "powerbi"] }, candidaturas: [] }, TEMPO_HOJE: null,
    mbaAulas: () => [{ data: "2026-11-12", hora: "19:00", t: "Python II" }], mbaAvals: () => [], mbaFin: () => null,
    getJson: (u) => { const k = Object.keys(jsons).find((x) => u.indexOf(x) === 0); const v = k ? jsons[k] : null; return v instanceof Error ? Promise.reject(v) : v ? Promise.resolve(v) : Promise.reject(new Error("HTTP 404 " + u)); },
    localStorage: { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { if (extra.quotaLS && extra.quotaLS(k, v, mem)) throw new Error("QuotaExceededError"); mem[k] = String(v); } },
    racIA: racIA || ((...a) => { ctxIA.chamadas.push(a); return Promise.reject(new Error("sem IA no teste")); }),
    ATU: { fresco: false }, setInterval: (f, ms) => { const t = setInterval(f, ms); if (t.unref) t.unref(); return t; }, clearInterval,
  };
  if (locks) ctx.navigator = navegador(locks);
  ctx.agendaColetarLeitura = () => Promise.resolve(ctx.agendaColetar()).then((ev) => (ev && ev.estado ? ev : { eventos: ev, falhas: [], estado: ev.length ? "completa" : "vazia" }));
  ctx.atuLer = (f) => Promise.resolve().then(f).then((v) => ({ ok: true, v }), (e) => ({ ok: false, erro: e && e.message || String(e) }));
  /* Fase 2 · A4: o RAC Hoje lê Agenda, Newsletter, MBA e Família pelo contrato de fontes. Os arquivos de fonte de verdade (e a camada de
     dados, A1) rodam aqui; depois voltam os dados simulados de sempre: a leitura da Agenda (agendaColetarLeitura) e os dados do MBA */
  Object.assign(ctx, extra); ctx.window = ctx; vm.createContext(ctx);
  const simulados = { agendaColetar: ctx.agendaColetar, agendaColetarLeitura: ctx.agendaColetarLeitura, sbOk: ctx.sbOk };
  for (const f of ["js/dados.js", "js/fontes.js", "js/fonte-familia.js", "js/fonte-mba.js", "js/fonte-newsletter.js", "js/fonte-agenda.js", "js/graficos.js", "js/kit.js"]) vm.runInContext(ler(f), ctx, { filename: f });   /* Fase 3: o painel usa o kit de componentes e de gráficos (MOD_DEPS do hoje) */
  Object.assign(ctx, simulados, { fonteMbaDados: () => ({ aulas: ctx.mbaAulas(), avals: ctx.mbaAvals(), fin: ctx.mbaFin() }) }, extra);
  vm.runInContext(ler("js/hoje.js"), ctx, { filename: "hoje.js" });
  for (const f of arquivos) vm.runInContext(ler("js/" + f), ctx, { filename: f });
  return { ctx, b, mem, ia: ctxIA };
}
const RESP = {
  lista: [{ id: "t1", item: "Ligar no banco", criado: "2026-11-01" }], compras: [{ data: "2026-11-09", valor_total: 120 }], pedidos: [], compras_online: [],
  orcamentos: [], garmin_dia: [{ data: "2026-11-09", dados: { passos: 9000 } }], garmin_ativ: [],
};
const JSONS = { "newsletter.json": { coletado: "2026-11-10T09:00:00Z", grupos: [] }, "noticias.json": { coletado: "2026-11-10T10:00:00Z", noticias: [{ t: "Obra na avenida", f: "Jornal" }] },
  "https://statsapi": { dates: [] }, "https://api.open-meteo": { current: { temperature_2m: 25, weather_code: 0, time: "2026-11-10T11:00" }, daily: { temperature_2m_max: [30], temperature_2m_min: [18] }, hourly: { time: [], precipitation_probability: [], precipitation: [] } } };

test("coletor: cada fonte lida uma vez, por período, só leitura; sem Garmin, Gmail, links de fotos nem gravação da Newsletter", async () => {
  const s = site({ resp: RESP, jsons: JSONS });
  const c = await s.ctx.hojeColetar();
  for (const k of ["agenda", "tarefas", "vagas", "newsletter", "noticias", "esportes", "mercado", "alimentacao", "compras", "orcamentos", "saude", "mba", "tempo"]) assert.ok(c.fontes[k], k);
  assert.equal(c.fontes.mercado.ok, true); assert.deepEqual(plano(c.fontes.mercado.v), [{ data: "2026-11-09", valor_total: 120 }]);
  assert.equal(c.fontes.esportes.vazio, true, "sem jogo hoje é ausência de dado, não falha");
  const merc = s.b.log.find((x) => x.t === "compras"); assert.deepEqual(merc.ops.find((o) => o[0] === "gte"), ["gte", "data", "2026-10-01"], "só do 1º dia do mês passado");
  const gd = s.b.log.find((x) => x.t === "garmin_dia"); assert.deepEqual(gd.ops.find((o) => o[0] === "gte"), ["gte", "data", N.somaDiasISO(HOJE, -60)]);
  assert.equal(s.b.chamadas.invoke, 0, "nenhuma função do servidor (garmin, rac-ia)"); assert.equal(s.b.chamadas.urls, 0, "nenhum link de foto");
  assert.ok(!s.b.log.some((x) => x.t === "newsletter_edicoes"), "a Newsletter não grava a edição"); assert.ok(!s.b.log.some((x) => x.ops.some((o) => /insert|update|upsert|delete/.test(o[0]))), "só leitura");
  assert.ok(!/gmApi|gmBuscar|gmToken|saudeSincronizar|functions\.invoke|createSignedUrls/.test(ler("js/hoje.js")), "o código nem chama Gmail, Garmin ou links");
});

test("coletor: falha parcial fica só na fonte; ausência de dados ≠ falha; dado velho aparece como desatualizado", async () => {
  const s = site({ resp: { ...RESP, compras: { erro: "timeout do banco" }, lista: [] }, jsons: { ...JSONS, "noticias.json": { coletado: "2026-11-08T10:00:00Z", noticias: [{ t: "x" }] } } });
  const c = await s.ctx.hojeColetar();
  assert.equal(c.fontes.mercado.ok, false); assert.match(c.fontes.mercado.erro, /timeout do banco/); assert.equal(c.fontes.alimentacao.ok, true);
  assert.equal(c.fontes.tarefas.vazio, true);
  const est = Object.fromEntries(N.hojeEstadoFontes(c.fontes, AGORA).map((x) => [x.k, x.estado]));
  assert.deepEqual([est.mercado, est.tarefas, est.noticias, est.agenda], ["falhou", "vazia", "desatualizada", "ok"]);
});

test("coletor: uma leitura por sessão (10 min) e pedidos simultâneos dividem a mesma; forçar e o ↻ leem de novo", async () => {
  const s = site({ resp: RESP, jsons: JSONS });
  const [a, b] = await Promise.all([s.ctx.hojeColetar(), s.ctx.hojeColetar()]);
  assert.equal(a, b); const n = s.b.log.length; assert.equal(s.ia.agenda, 1);
  await s.ctx.hojeColetar(); assert.equal(s.b.log.length, n, "dentro da sessão não consulta de novo");
  await s.ctx.hojeColetar(true); assert.equal(s.b.log.length, 2 * n);
  s.ctx.ATU.fresco = true; await s.ctx.hojeColetar(); assert.equal(s.b.log.length, 3 * n);
});

test("só o dono: a casa (Fernanda) não coleta nem analisa, e nenhuma consulta é feita; a experiência dela não muda", async () => {
  const s = site({ resp: RESP, jsons: JSONS, dono: false });
  await assert.rejects(s.ctx.hojeColetar(), /só da conta do dono/); await assert.rejects(s.ctx.hojeAnalisar(), /só da conta do dono/);
  assert.equal(s.b.log.length, 0);
  const app = ler("js/app.js");
  const RT = registro();
  assert.deepEqual(RT.DA_CASA, ["rede", "mercado", "alimentacao", "compras", "fiscal", "lista", "olivia", "eddie", "veiculos", "documentos", "seguranca"], "as páginas da Fernanda são as mesmas (a Central Fiscal entrou por decisão do dono em 07/11/2026); a ordem é a do menu (registro de rotas, A3)");
  assert.deepEqual(RT.ROTA_MODS.rachoje, ["hoje"], "o RAC Hoje tem página (#rachoje), mas só o dono chega nela");
  assert.ok(!RT.DA_CASA.some((x) => /hoje|iacustos/.test(x)), "a Fernanda não vê o RAC Hoje nem os Custos de IA");
  assert.match(ler("supabase/028_hoje.sql"), /check \(not \('hoje\.analise' = any \(acoes_reais_casa\)\)\)/, "o banco proíbe o RAC Hoje para a casa");
});

const respostaReal = () => ({ ok: true, versao: 1, id: "uso-9", modo: "REAL", estado: "concluido", resultado: boa(), avisos: [],
  consumo: { modelo: "claude-sonnet-5-5", uso_api: { tokens_entrada: 3000, tokens_saida: 500 }, estimado_rac_usd: 0.011 } });

test("IA no site: resposta REAL vira análise com o consumo; o cache evita pagar de novo; pedidos simultâneos fazem uma chamada; nova análise é outra chave", async () => {
  const chamadas = []; const s = site({ resp: RESP, jsons: JSONS, racIA: (...a) => { chamadas.push(a); return Promise.resolve(respostaReal()); } });
  const [r1, r2] = await Promise.all([s.ctx.hojeAnalisar(), s.ctx.hojeAnalisar()]);
  assert.equal(chamadas.length, 1, "uma chamada só"); assert.equal(r1.ok, true); assert.equal(r1.analise.consumo.estimado_rac_usd, 0.011); assert.equal(r2.analise.id, "uso-9");
  assert.equal(r1.deterministico.origem, "regras do RAC (sem IA)", "o determinístico vem junto e identificado");
  const [modulo, acao, entrada, contexto, chave] = chamadas[0];
  assert.deepEqual([modulo, acao, contexto.data], ["hoje", "hoje.analise", HOJE]); assert.match(chave, /^hoje-2026-11-10-[0-9a-f]{8}$/);
  assert.match(entrada.texto, /<fato id="f01"/); assert.deepEqual(plano(entrada.imagens), []);
  const r3 = await s.ctx.hojeAnalisar(); assert.equal(r3.deCache, true); assert.equal(chamadas.length, 1, "do cache, sem chamada");
  await s.ctx.hojeAnalisar({ nova: true }); assert.equal(chamadas.length, 2); assert.match(chamadas[1][4], /-1$/, "a nova análise usa outra chave");
  await s.ctx.hojeAnalisar({ pergunta: "E as finanças? <script>" }); assert.match(chamadas[2][2].texto, /<pergunta>E as finanças\? script<\/pergunta>$/);
});

const tempoAgora = (graus, hora) => ({ current: { temperature_2m: graus, weather_code: 61, time: "2026-11-10T" + hora }, daily: { temperature_2m_max: [graus + 4], temperature_2m_min: [graus - 6] }, hourly: { time: [], precipitation_probability: [], precipitation: [] } });

test("IA no site: só o tempo mudar não gera nova chamada (vem do cache, mesma chave); outro dado muda a chave; nova análise e simultâneos seguem as regras", async () => {
  const chamadas = [], resp = { ...RESP }; let soltar;
  const s = site({ resp, jsons: JSONS, racIA: (...a) => { chamadas.push(a); return new Promise((r) => { soltar = () => r(respostaReal()); }); } });
  /* simultâneos, com o tempo mudando no meio: a mesma chave, uma chamada só */
  const p1 = s.ctx.hojeAnalisar(); await fluxo(); assert.equal(chamadas.length, 1);
  s.ctx.TEMPO_HOJE = tempoAgora(17, "11:50");
  const p2 = s.ctx.hojeAnalisar({ forcar: true }); await fluxo();
  assert.match(chamadas[0][2].texto, /25 graus/); assert.equal(chamadas.length, 1, "pedido simultâneo com outro tempo não chama de novo");
  soltar(); const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1.ok && r2.ok, true); assert.equal(r1.analise.chave, r2.analise.chave);
  /* depois: outro tempo, releitura forçada → do cache, nada pago */
  s.ctx.TEMPO_HOJE = tempoAgora(31, "11:55");
  const r3 = await s.ctx.hojeAnalisar({ forcar: true });
  assert.equal(r3.deCache, true); assert.equal(r3.analise.chave, chamadas[0][4]); assert.equal(chamadas.length, 1, "só o tempo mudou: nenhuma chamada");
  /* nova análise pedida: nova chave (-1), e ela leva o tempo de agora */
  const p4 = s.ctx.hojeAnalisar({ nova: true }); await fluxo(); soltar(); await p4;
  assert.equal(chamadas.length, 2); assert.equal(chamadas[1][4], chamadas[0][4] + "-1"); assert.match(chamadas[1][2].texto, /31 graus/);
  /* a contagem da nova análise não se perde quando só o tempo muda: a mesma -1 vem do cache */
  s.ctx.TEMPO_HOJE = tempoAgora(12, "11:58");
  const r5 = await s.ctx.hojeAnalisar({ forcar: true }); assert.equal(r5.deCache, true); assert.equal(r5.analise.chave, chamadas[1][4]); assert.equal(chamadas.length, 2);
  /* outro dado (um gasto no Mercado) muda a chave */
  resp.compras = [{ data: "2026-11-09", valor_total: 120 }, { data: "2026-11-10", valor_total: 35 }];
  const p6 = s.ctx.hojeAnalisar({ forcar: true }); await fluxo(); soltar(); await p6;
  assert.equal(chamadas.length, 3); assert.notEqual(chamadas[2][4].replace(/-\d+$/, ""), chamadas[0][4]);
});

test("tela do RAC Hoje: com o tempo mudado, reabrir e reler não chamam a IA; \"Analisar de novo\" só chama depois da confirmação, uma vez", async () => {
  const chamadas = [];
  const s = telaSite({ resp: RESP, jsons: JSONS, racIA: (...a) => { chamadas.push(a); return Promise.resolve(respostaReal()); } });
  s.ctx.renderHoje(); await fluxo();
  let tela = s.alvos["#rachoje-view"];
  botao(tela, "Analisar o dia").onclick(); botao(tela, "Confirmar e chamar a IA").onclick(); await fluxo();
  assert.equal(chamadas.length, 1);
  s.ctx.TEMPO_HOJE = tempoAgora(14, "11:59");
  s.ctx.renderHoje(); await fluxo(); botao(tela, "Reler as fontes").onclick(); await fluxo();
  assert.equal(chamadas.length, 0 + 1, "reabrir e reler com outro tempo não chamam a IA");
  assert.ok(tela.textContent.includes("Mesmos dados de agora"), "a análise continua com os mesmos dados");
  const de = botao(tela, "Analisar de novo (nova cobrança)"); assert.ok(de);
  de.onclick(); assert.equal(chamadas.length, 1, "o primeiro toque só pede confirmação");
  const ok = botao(tela, "Confirmar e chamar a IA"); ok.onclick(); ok.onclick(); await fluxo();
  assert.equal(chamadas.length, 2, "confirmado: uma chamada nova"); assert.equal(chamadas[1][4], chamadas[0][4] + "-1"); assert.match(chamadas[1][2].texto, /14 graus/);
});

test("IA no site: DEMO, resposta inválida, falha de conexão e tempo esgotado nunca viram análise; o motivo e o determinístico vêm juntos", async () => {
  const casos = [
    [() => Promise.resolve({ ...respostaReal(), modo: "DEMO", resultado: { ...boa(), _demo: true } }), /./],
    [() => Promise.resolve({ ok: false, versao: 1, modo: "REAL", mensagem: "A resposta da IA veio incompleta ou fora do formato.", erro: { codigo: "resposta_invalida" }, consumo: { estimado_rac_usd: 0.01 } }), /incompleta/],
    [() => Promise.resolve({ ...respostaReal(), resultado: { resumo: "x", atencao: [] } }), /./],
    [() => Promise.reject(new Error("Failed to fetch")), /Não consegui falar com a IA/],
    [() => new Promise(() => {}), /não respondeu a tempo/],
  ];
  for (const [rac, motivo] of casos) {
    const s = site({ resp: RESP, jsons: JSONS, racIA: rac }); s.ctx.HOJE_IA_PRAZO = 30;
    const r = await s.ctx.hojeAnalisar();
    assert.equal(r.ok, false); assert.match(r.motivo, motivo); assert.equal(r.analise, undefined); assert.ok(r.deterministico.itens, "o determinístico continua");
    assert.equal(s.mem["rac-hoje-ia:dono-1"], undefined, "falha não entra no cache");
  }
});

test("IA no site: o que vai para a IA não leva link, e-mail, documento, senha nem token, mesmo quando os dados têm", async () => {
  const chamadas = []; const s = site({ resp: { ...RESP, lista: [{ item: "token do banco abc123 e senha 9988", criado: "2026-11-09" }] }, jsons: JSONS,
    agenda: () => Promise.resolve([{ data: "2026-11-11", t: "Reunião com ana@empresa.com", sub: "https://meet.exemplo/abc", tipo: "lembrete" }]),
    racIA: (...a) => { chamadas.push(a); return Promise.resolve(respostaReal()); } });
  await s.ctx.hojeAnalisar();
  const t = chamadas[0][2].texto;
  assert.ok(!/ana@|https?:|token|senha|9988/.test(t), t); assert.match(t, /Reunião com \[e-mail\]/);
});

/* ---------------------------------------------------------------- telas: RAC Hoje (#rachoje) e Custos de IA (#iacustos) */
/* um DOM mínimo: o suficiente para h(), panel() e os módulos desenharem e para o teste achar texto, botões e selects */
class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.attrs = {}; this.className = ""; this._t = null; this.parentNode = null; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === "class") this.className = String(v); }
  get textContent() { return this._t != null ? this._t : this.children.map((c) => c.textContent).join(" "); }
  set textContent(v) { this._t = String(v); this.children = []; }
  set innerHTML(v) { this.children = []; this._t = null; }
  get innerHTML() { return ""; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  replaceChild(n, o) { const i = this.children.indexOf(o); n.parentNode = this; this.children[i] = n; return o; }
  querySelector() { return null; }
  addEventListener() {}
  removeAttribute() {}
  focus() {}
}
const doc = { createElement: (t) => new El(t), createTextNode: (t) => { const e = new El("#text"); e._t = String(t); return e; } };
const varre = (e, f, acc = []) => { if (f(e)) acc.push(e); e.children.forEach((c) => varre(c, f, acc)); return acc; };
const botao = (raiz, txt) => varre(raiz, (e) => e.tagName === "BUTTON" && e.textContent.includes(txt))[0];
const fluxo = () => new Promise((r) => setTimeout(r, 25));
function appHelpers() {
  const app = ler("js/app.js"), i = app.indexOf("  function h(tag,attrs){"), j = app.indexOf("  /* Bloco com título de editoria");
  return app.slice(i, j);
}
function telaSite(o = {}) {
  const alvos = {};
  const extra = {
    document: doc, $: (sel) => alvos[sel] || (alvos[sel] = new El("div")), saudacao: () => "Bom dia", dataBR: (d) => d.split("-").reverse().join("/"), logErro: () => {},
    MES3: ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"], hojeISO: () => HOJE,
    racDica: { ligar: (el, f) => { el.dica = f; return el; } },
    rsColunas: (B, vals, curto, dica) => { const e = new El("div"); e.className = "vbars"; B.forEach((b, i) => { const c = new El("button"); c.textContent = b.cima + " " + b.baixo + " " + (vals[i] ? curto(vals[i]) : "–"); c.dica = () => dica(i, vals[i]); e.appendChild(c); }); return e; },
    rsBarras: (L) => { const e = new El("div"); e.className = "hbars"; L.forEach((x) => { const c = new El("button"); c.textContent = x.nome + " " + x.sub + " " + x.txt; c.dica = () => [x.nome, x.dica]; e.appendChild(c); }); return e; },
  };
  const s = site({ ...o, extra: { ...extra, ...(o.extra || {}) }, arquivos: o.arquivos || [] });
  vm.runInContext(appHelpers(), s.ctx);
  return { ...s, alvos };
}

test("tela do RAC Hoje: abrir só lê (nenhuma chamada de IA); o botão pede confirmação; só o segundo toque chama, uma vez; mostra fato × inferência, fontes e custo", async () => {
  const chamadas = [];
  const s = telaSite({ resp: RESP, jsons: JSONS, racIA: (...a) => { chamadas.push(a); return Promise.resolve(respostaReal()); } });
  s.ctx.renderHoje(); await fluxo();
  const tela = s.alvos["#rachoje-view"], txt = () => tela.textContent;
  assert.equal(chamadas.length, 0, "abrir a tela não chama a IA");
  for (const t of ["Bom dia, Rayner", "Fontes de informação", "Prioridades do dia", "Análise da IA", "Pergunte sobre o seu dia", "Histórico recente", "Ainda não há análise da IA neste aparelho"]) assert.ok(txt().includes(t), t);
  assert.ok(/Agenda[\s\S]*Leitura realizada/.test(txt()) && txt().includes("Tempo em Sorocaba"), "status de cada fonte");
  const analisar = botao(tela, "Analisar o dia");
  assert.ok(analisar, "botão de análise");
  analisar.onclick();
  assert.equal(chamadas.length, 0, "o primeiro toque só pede confirmação");
  assert.ok(txt().includes("chamada paga ao Claude Sonnet 5.5"));
  const ok = botao(tela, "Confirmar e chamar a IA");
  ok.onclick(); ok.onclick();
  assert.ok(txt().includes("Analisando com a IA"), "estado de carregamento");
  await fluxo();
  assert.equal(chamadas.length, 1, "uma chamada só, mesmo com toque duplo");
  assert.deepEqual([chamadas[0][0], chamadas[0][1]], ["hoje", "hoje.analise"]);
  for (const t of ["Dia de recuperação e uma avaliação do MBA chegando.", "Fato", "Inferência", "Relações entre módulos", "Recomendações", "Incertezas", "Claude Sonnet 5.5", "custo estimado US$ 0,011", "3.000 → 500 tokens", "Mesmos dados de agora", "Fontes com ressalva"]) assert.ok(txt().includes(t), t);
  assert.ok(varre(tela, (e) => e.tagName === "SUMMARY" && /Fatos utilizados/.test(e.textContent)).length, "fatos utilizados");
  assert.ok(botao(tela, "Analisar de novo (nova cobrança)"), "nova análise é outra cobrança, dita no botão");
});

test("tela do RAC Hoje: DEMO e erro aparecem como erro real, sem análise simulada; análise de dados que mudaram é marcada desatualizada", async () => {
  const casos = [
    [() => Promise.resolve({ ...respostaReal(), modo: "DEMO", resultado: { ...boa(), _demo: true } }), /./],
    [() => Promise.resolve({ ok: false, versao: 1, modo: "REAL", mensagem: "Sem orçamento para esta chamada.", erro: { codigo: "orcamento_esgotado" } }), /Sem orçamento/],
  ];
  for (const [rac, motivo] of casos) {
    const s = telaSite({ resp: RESP, jsons: JSONS, racIA: rac });
    s.ctx.renderHoje(); await fluxo();
    const tela = s.alvos["#rachoje-view"];
    botao(tela, "Analisar o dia").onclick(); botao(tela, "Confirmar e chamar a IA").onclick(); await fluxo();
    assert.ok(/Falha antes do envio/.test(tela.textContent), "erro à vista");
    assert.match(tela.textContent, motivo);
    assert.ok(tela.textContent.includes("Nenhuma resposta simulada foi usada"), "garantia");
    assert.ok(!tela.textContent.includes("Dia de recuperação"), "nada de análise no lugar do erro");
    assert.equal(s.mem["rac-hoje-ia:dono-1"], undefined);
  }
  const s = telaSite({ resp: RESP, jsons: JSONS });
  s.mem["rac-hoje-ia:dono-1"] = JSON.stringify({ k1: { id: "u1", chave: "k1", quando: new Date().toISOString(), hoje: HOJE, resultado: boa(), consumo: { modelo: "claude-sonnet-5-5", estimado_rac_usd: 0.02 }, avisos: [], pacote: "hoje-outro-pacote", pergunta: "", fatos: [] } });
  s.ctx.renderHoje(); await fluxo();
  const t = s.alvos["#rachoje-view"].textContent;
  assert.ok(t.includes("Desatualizada") && t.includes("Os dados do RAC mudaram desde esta análise"), t.slice(0, 300));
  assert.equal(s.ia.chamadas.length, 0, "nada chamado ao abrir");
});

test("telas: a casa (Fernanda) não vê nada e nenhuma consulta é feita, nem no RAC Hoje nem nos Custos de IA", async () => {
  const s = telaSite({ resp: RESP, jsons: JSONS, dono: false, arquivos: ["iacustos.js"] });
  s.ctx.renderHoje(); s.ctx.renderCustosIa(); await fluxo();
  assert.ok(s.alvos["#rachoje-view"].textContent.includes("só da conta do dono"));
  assert.ok(s.alvos["#iacustos-view"].textContent.includes("só da conta do dono"));
  assert.equal(s.b.log.length, 0);
  assert.equal(s.ia.chamadas.length, 0);
});

/* 40 chamadas: Newsletter (Haiku) e RAC Hoje (Sonnet) estimadas, uma conferida, uma incerta e uma que falhou antes do envio */
function linhasCustos() {
  const L = [], base = Date.parse("2026-11-10T09:00:00-03:00");
  for (let i = 0; i < 40; i++) {
    const hoje = i % 5 === 0, t = new Date(base - i * 6 * 3600e3).toISOString();
    L.push({ id: "u" + String(i).padStart(2, "0"), criado_em: t, mes: t.slice(0, 7) + "-01", funcionalidade: hoje ? "hoje" : "newsletter", acao: hoje ? "hoje.analise" : "newsletter.resumo", provedor: "anthropic",
      modelo: hoje ? "claude-sonnet-5-5" : "claude-haiku-5-5", estado: "concluido", erro_codigo: null, ms: 4000, requisicao_id: i % 2 ? "msg_" + i + "abc" : null, tokens_entrada: 3000 + i, tokens_saida: 500,
      tokens_cache_leitura: null, tokens_cache_escrita: null, estimado_usd: hoje ? 0.02 : 0.001, reservado_usd: 0.05, conhecido_usd: null, recalculado_usd: hoje ? 0.02 : 0.001,
      preco_entrada_usd_mtok: hoje ? 2 : 0.1, preco_saida_usd_mtok: hoje ? 10 : 0.5, precos_conferido_em: "2026-10-30", cambio_brl_usd: 6, custo_brl: 0.1 });
  }
  L[1] = { ...L[1], estado: "reconciliado", conhecido_usd: 0.0042, estimado_usd: 0.001 };
  L[2] = { ...L[2], estado: "incerto", erro_codigo: "tempo_esgotado", tokens_entrada: null, tokens_saida: null, estimado_usd: null };
  L[3] = { ...L[3], estado: "falhou_sem_envio", tokens_entrada: null, tokens_saida: null, estimado_usd: null };
  return L;
}
const CFG = { modo: "REAL", cambio_brl_usd: 6, margem_impostos: 0.12, limite_brl: 50, avisos_pct: null };
const PRECOS = [
  { modelo: "claude-sonnet-5-5", entrada_usd_mtok: 2, saida_usd_mtok: 10, cache_leitura_usd_mtok: null, conferido_em: "2026-10-30", fonte: "https://platform.claude.com/docs/en/about-claude/pricing" },
  { modelo: "claude-haiku-5-5", entrada_usd_mtok: 0.1, saida_usd_mtok: 0.5, cache_leitura_usd_mtok: null, conferido_em: "2026-10-30" },
];

test("tela de Custos de IA: indicadores, classes separadas, tokens, gráficos, preços e câmbio, tudo de ia_custos; nenhuma chamada de IA nem gravação", async () => {
  const s = telaSite({ resp: { ia_custos: linhasCustos(), ia_config: CFG, ia_precos: PRECOS }, jsons: JSONS, arquivos: ["iacustos.js"] });
  s.ctx.renderCustosIa(); await fluxo();
  const tela = s.alvos["#iacustos-view"], t = tela.textContent;
  for (const x of ["Indicadores", "Hoje", "Últimos 7 dias", "Mês atual", "Total acumulado", "Classes de custo", "Reconciliado", "Estimado", "Reserva (incerta)", "Tokens", "Custo por dia · últimos 30 dias", "Custo por mês",
    "Custo por funcionalidade · total", "Custo por provedor e modelo · total", "anthropic · Claude Sonnet 5.5", "Preços e câmbio usados", "Câmbio (R$ por US$)", "Margem de impostos", "Histórico de chamadas",
    "Tokens de cache: sem dado", "A API informa tokens, não o custo"]) assert.ok(t.includes(x), x);
  assert.ok(t.includes("não cadastrado"), "preço de cache vazio é dito, não inventado");
  const ops = s.b.log.flatMap((x) => x.ops.map((o) => o[0]));
  assert.ok(!ops.some((o) => /insert|update|upsert|delete/.test(o)), "só leitura");
  assert.deepEqual([...new Set(s.b.log.map((x) => x.t))].sort(), ["ia_config", "ia_custos", "ia_precos"]);
  assert.equal(s.b.chamadas.invoke, 0);
  assert.equal(s.ia.chamadas.length, 0);
  const m = N.iaMonitor(linhasCustos(), HOJE, CFG);
  assert.equal(m.total.conhecido, 0.0042, "o reconciliado não se mistura com o estimado");
  assert.ok(m.total.estimado > 0 && m.total.incerto === 0.05);
  const gr = varre(tela, (e) => e.className === "vbars");
  assert.equal(gr[0].children.length, 30, "30 dias, cada barra com valor ou –");
  assert.ok(gr[0].children.every((c) => /\d{2} \S+ (–|[\d,]+)$/.test(c.textContent)), gr[0].children[0].textContent);
});

test("tela de Custos de IA: histórico com filtros, ordenação e paginação; vazio e erro têm mensagem; o detalhe mostra preço, câmbio e requisição", async () => {
  const s = telaSite({ resp: { ia_custos: linhasCustos(), ia_config: CFG, ia_precos: PRECOS }, jsons: JSONS, arquivos: ["iacustos.js"] });
  s.ctx.renderCustosIa(); await fluxo();
  const tela = s.alvos["#iacustos-view"], linhas = () => varre(tela, (e) => e.tagName === "TR" && e.className.includes("icl"));
  assert.equal(linhas().length, 15);
  assert.ok(tela.textContent.includes("Mostrando 1–15 de 40 chamadas") && tela.textContent.includes("Página 1 de 3"));
  botao(tela, "Próxima").onclick();
  assert.equal(linhas().length, 15);
  assert.ok(tela.textContent.includes("Página 2 de 3"));
  const sel = (rot) => varre(tela, (e) => e.tagName === "SELECT" && e.attrs["aria-label"] === rot)[0];
  const f = sel("Todas as funcionalidades");
  f.value = "hoje"; f.onchange();
  assert.ok(tela.textContent.includes("de 8 chamadas") && tela.textContent.includes("Página 1 de 1"), "filtro por funcionalidade volta à página 1");
  const c = sel("Todas as classes");
  f.value = ""; f.onchange();
  c.value = "reconciliado"; c.onchange();
  assert.ok(tela.textContent.includes("de 1 chamada") && tela.textContent.includes("Conferida: cobrada"));
  c.value = "reserva"; c.onchange();
  assert.ok(tela.textContent.includes("Incerta (tempo esgotado)"));
  c.value = ""; c.onchange();
  const o = sel("Ordenar por");
  o.value = "custo"; o.onchange();
  assert.ok(/US\$ 0,05/.test(linhas()[0].textContent) && /Reserva/.test(linhas()[0].textContent), "maior custo primeiro (a reserva da incerta): " + linhas()[0].textContent);
  const segunda = linhas()[1];
  assert.ok(/US\$ 0,02/.test(segunda.textContent), "depois o RAC Hoje: " + segunda.textContent);
  const [tit, det] = segunda.dica();
  assert.match(tit, /RAC Hoje/);
  assert.match(det, /preço US\$ 2,00 entrada \/ US\$ 10,00 saída por milhão \(conferido em 30\/10\/2026\)/);
  assert.match(det, /câmbio 6,00/);
  const v = telaSite({ resp: { ia_custos: [], ia_config: null, ia_precos: [] }, jsons: JSONS, arquivos: ["iacustos.js"] });
  v.ctx.renderCustosIa(); await fluxo();
  assert.ok(v.alvos["#iacustos-view"].textContent.includes("Nenhuma chamada registrada"));
  const e = telaSite({ resp: { ia_custos: { erro: "permissão negada" } }, jsons: JSONS, arquivos: ["iacustos.js"] });
  e.ctx.renderCustosIa(); await fluxo();
  assert.ok(e.alvos["#iacustos-view"].textContent.includes("Não consegui carregar agora") && e.alvos["#iacustos-view"].textContent.includes("permissão negada"));
});

test("núcleo dos Custos de IA: classes (estimado ≠ reconciliado ≠ reserva), histórico filtrado/ordenado/paginado, opções e status", () => {
  const L = linhasCustos();
  assert.deepEqual([L[0], L[1], L[2], L[3]].map((l) => N.iaClasse(l).chave), ["estimado", "reconciliado", "reserva", "sem_custo"]);
  assert.equal(N.iaClasse({ estado: "concluido", tokens_entrada: null, estimado_usd: null }).chave, "sem_dado", "sem tokens, sem custo inventado");
  assert.equal(N.iaClasse({ estado: "concluido", estimado_usd: 0.5, conhecido_usd: null }).chave, "estimado");
  assert.equal(N.iaClasse({ estado: "reconciliado", conhecido_usd: 0 }).usd, 0);
  assert.equal(N.iaInformadoProvedor(L[1]), true);
  assert.equal(N.iaInformadoProvedor(L[0]), false, "sem id de requisição não conta como informado");
  assert.deepEqual([L[1], L[2], L[3]].map(N.iaStatusCustos), ["Conferida: cobrada", "Incerta (tempo esgotado)", "Falhou antes do envio"]);
  const h1 = N.iaHistorico(L.concat(L), { porPagina: 10 });
  assert.equal(h1.total, 40, "a mesma chamada duas vezes conta uma");
  assert.deepEqual([h1.pagina, h1.paginas, h1.de, h1.ate, h1.itens.length], [1, 4, 1, 10, 10]);
  assert.equal(N.iaHistorico(L, { pagina: 99, porPagina: 10 }).pagina, 4, "página fora do fim volta ao fim");
  assert.equal(N.iaHistorico(L, { funcionalidade: "hoje" }).total, 8);
  assert.equal(N.iaHistorico(L, { classe: "reserva" }).soma.reserva, 0.05);
  assert.equal(N.iaHistorico(L, { de: "2026-11-10", ate: "2026-11-10" }).itens.every((x) => x.dia === "2026-11-10"), true);
  const asc = N.iaHistorico(L, { ordem: { campo: "custo", dir: "asc" }, porPagina: 100 }).itens.map((x) => x.usd);
  assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
  const dt = N.iaHistorico(L, { porPagina: 100 }).itens.map((x) => x.l.criado_em);
  assert.deepEqual(dt, [...dt].sort().reverse(), "padrão: mais nova primeiro");
  assert.deepEqual(N.iaOpcoes(L).funcionalidades, ["hoje", "newsletter"]);
  assert.equal(N.iaHistorico([], {}).total, 0);
  assert.equal(N.iaHistorico(null, {}).paginas, 1);
  const m = N.iaMonitor(L, HOJE, CFG), d = m.diario.find((x) => x.dia === HOJE);
  assert.ok(d.estimado > 0 && "conhecido" in d && "incerto" in d, "o dia separa estimado, conhecido e reserva");
  assert.equal(N.iaModulo("hoje"), "RAC Hoje");
});

test("defasagem da análise do RAC Hoje: outro dia, dados mudaram, velha, sem base e atual; fatos citados vêm na ordem do pacote", () => {
  const a = { hoje: HOJE, pacote: "p1", quando: "2026-11-10T14:00:00Z" }, agora = Date.parse("2026-11-10T15:00:00Z");
  assert.equal(N.hojeDefasagem(null, "p1", HOJE, agora), null);
  assert.deepEqual([N.hojeDefasagem(a, "p1", HOJE, agora).atual, N.hojeDefasagem(a, "p1", HOJE, agora).nivel], [true, "ok"]);
  assert.equal(N.hojeDefasagem(a, "p2", HOJE, agora).nivel, "dados_mudaram");
  assert.equal(N.hojeDefasagem({ ...a, hoje: "2026-11-09" }, "p1", HOJE, agora).nivel, "outro_dia");
  assert.match(N.hojeDefasagem({ ...a, hoje: "2026-11-09" }, "p1", HOJE, agora).motivo, /09\/11\/2026/);
  assert.equal(N.hojeDefasagem({ hoje: HOJE }, "p1", HOJE, agora).nivel, "sem_base");
  const velha = N.hojeDefasagem(a, "p1", HOJE, agora + 7 * 3600e3);
  assert.deepEqual([velha.atual, velha.nivel], [false, "velha"]);
  assert.match(velha.motivo, /8 horas/);
  const fatos = [{ id: "f01", fonte: "rac", texto: "a" }, { id: "f02", fonte: "agenda", texto: "b" }, { id: "f03", fonte: "saude", texto: "c" }];
  assert.deepEqual(N.hojeCitados(boa(), fatos).map((x) => x.id), ["f02"], "só os citados");
  assert.deepEqual(N.hojeCitados({ resumo_fatos: ["f03"], atencao: [{ fatos: ["f01"] }], resposta: { fatos: ["f02"] } }, fatos).map((x) => x.id), ["f01", "f02", "f03"]);
});

test("código das telas: ES5, a IA só é chamada pelo botão confirmado, nada grava, rotas só do dono e nada novo para a Fernanda", () => {
  const hoje = ler("js/hoje.js"), ic = ler("js/iacustos.js"), app = ler("js/app.js");
  assert.ok(!/=>|\blet |\bconst |\.finally\(/.test(hoje + ic), "ES5 puro");
  const tela = hoje.slice(hoje.indexOf("Tela do RAC Hoje (#rachoje)"));
  assert.equal((tela.match(/hojeAnalisar\(/g) || []).length, 1, "a tela chama a IA em um lugar só (hjAnalisar)");
  const i = tela.indexOf("function hjAnalisar"), fim = tela.indexOf("function hjCarregar");
  assert.ok(i > 0 && tela.slice(i, fim).includes("hojeAnalisar("));
  assert.equal((tela.match(/hjAnalisar\(/g) || []).length, 5, "definida uma vez e usada só nos botões pagos (analisar, perguntar, reenviar e nova análise)");
  assert.ok(/function hjBotaoPago/.test(tela) && /Confirmar e chamar a IA/.test(tela) && /if\(HJ\.ocupado\)return/.test(tela), "confirmação e trava de pedido duplicado");
  assert.ok(!/racIA\(|functions\.invoke|\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/.test(ic), "Custos de IA só lê");
  assert.ok(!/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(|functions\.invoke/.test(tela), "o RAC Hoje não grava nem chama funções além do racIA do botão");
  assert.match(app, /MOD_DEPS=\{[^}]*iacustos:\["graficos"\]/, "os gráficos vêm do kit (js/graficos.js, Fase 2 · A2), sem carregar o Resumo");
  const RT = registro(); assert.ok(RT.tabs.includes("rachoje") && RT.tabs.includes("iacustos"));
  const rh = rota("rachoje"), ri = rota("iacustos"); assert.ok(!rh.marcaPropria && !ri.marcaPropria); assert.match(rh.abrirTexto, /renderHoje\(\)/); assert.match(ri.abrirTexto, /renderCustosIa\(\)/);
  assert.match(ler("sw.js"), /"\.\/js\/iacustos\.js"/);
  const html = ler("index.html");
  assert.match(html, /<section id="rachoje" hidden><div id="rachoje-view"/);
  assert.match(html, /<section id="iacustos" hidden><div id="iacustos-view"/);
  assert.match(RT.menu, /href="#rachoje" data-k="rachoje" data-area="hoje"/, "item do menu sem data-casa"); assert.ok(!/href="#rachoje" data-k="rachoje" data-casa/.test(RT.menu));
  assert.match(RT.menu, /href="#iacustos" data-k="iacustos" data-area="sis"/, "item do menu sem data-casa"); assert.ok(!/href="#iacustos" data-k="iacustos" data-casa/.test(RT.menu));
  assert.ok(/html\.casa #navgrp a\.it:not\(\[data-casa\]\)/.test(html), "o menu da Fernanda continua só com as páginas dela");
});

/* ---------------------------------------------------------------- revisão final das telas */
test("custos: o dia é o de Brasília (criado_em vem em UTC): uma chamada das 22h30 de hoje não vira 'amanhã'; limites de hoje, 7 dias, mês e total; sem soma dupla", () => {
  assert.equal(N.iaDiaBR("2026-11-11T01:30:00+00:00"), "2026-11-10"); assert.equal(N.iaDiaBR("2026-11-10T02:59:59Z"), "2026-11-09"); assert.equal(N.iaDiaBR("2026-11-10T03:00:00Z"), "2026-11-10");
  const l = (id, iso, usd) => ({ id, criado_em: iso, funcionalidade: "hoje", modelo: "m", estado: "concluido", estimado_usd: usd });
  const L = [l("a", "2026-11-11T01:30:00+00:00", 1), l("b", "2026-11-04T03:00:00Z", 2), l("c", "2026-11-04T02:59:00Z", 4), l("d", "2026-10-31T12:00:00Z", 8), l("a", "2026-11-11T01:30:00+00:00", 1)];
  const m = N.iaMonitor(L, HOJE, {});
  assert.equal(m.hoje.usd, 1, "22h30 de Brasília do dia 10 é de hoje"); assert.equal(m.semana.usd, 3, "7 dias = do dia 4 ao 10; a das 23h59 do dia 3 fica de fora"); assert.equal(m.mes.usd, 7, "mês: novembro");
  assert.equal(m.total.usd, 15, "total sem repetir o id 'a'"); assert.equal(m.total.chamadas, 4);
  const h = N.iaHistorico(L, { de: HOJE, ate: HOJE }); assert.deepEqual(h.itens.map((x) => x.l.id), ["a"], "o filtro por data usa o mesmo dia");
  assert.equal(m.diario.find((x) => x.dia === HOJE).usd, 1); assert.equal(m.diario.reduce((s, x) => s + x.usd, 0), 15, "o gráfico diário soma o mesmo que os indicadores (30 dias)");
  const porMod = Object.values(m.porFuncionalidade).reduce((s, x) => s + x.usd, 0); assert.equal(porMod, m.total.usd, "gráfico por funcionalidade = total");
});

test("análise desatualizada: o tempo e as horas de atraso de uma fonte não fazem a análise parecer velha; um fato novo faz", async () => {
  const mk = (temp, horas, extra = "") => ({ hoje: HOJE, fatos: [{ fonte: "rac", texto: "Hoje é " + HOJE + "." }, { fonte: "tempo", texto: "Em Sorocaba: " + temp + " graus agora." },
    { fonte: "rac", texto: "Fonte Newsletter: desatualizada, dado de " + horas + " horas atrás." }, { fonte: "agenda", texto: "Prova amanhã." + extra }] });
  const s = site({ resp: RESP, jsons: JSONS }), P = s.ctx.RAChoje.pacote;
  assert.equal(P(mk(25, 98)), P(mk(31, 99)), "só tempo e horas mudaram: mesma análise vale");
  assert.notEqual(P(mk(25, 98)), P(mk(25, 98, " Nova.")), "fato novo: dados mudaram");
  /* a análise guarda o mesmo pacote que a tela compara */
  const s2 = site({ resp: RESP, jsons: JSONS, racIA: () => Promise.resolve(respostaReal()) }); const r = await s2.ctx.hojeAnalisar(); const x = await s2.ctx.hojeMontar(false);
  assert.equal(r.analise.pacote, s2.ctx.RAChoje.pacote(x)); assert.equal(N.hojeDefasagem(r.analise, s2.ctx.RAChoje.pacote(x), x.hoje, Date.now()).atual, true);
});

test("código das telas (revisão): histórico separa aparelho e banco, abrir a tela zera erro antigo, resposta atrasada dos custos não sobrescreve", () => {
  const hj = ler("js/hoje.js"), ic = ler("js/iacustos.js");
  assert.match(hj, /Guardadas neste aparelho/); assert.match(hj, /Registro de chamadas no banco \(ia_custos\)/); assert.match(hj, /if\(!HJ\.ocupado\)\{HJ\.erro=null;HJ\.aviso="";HJ\.sel=null\}/);
  assert.match(ic, /seq!==IC_SEQ/); assert.match(ic, /from\("ia_custos"\)/); assert.match(ic, /from\("ia_config"\)/); assert.match(ic, /from\("ia_precos"\)/);
  assert.match(ic, /valem só para esta lista/);
});

/* ---------------------------------------------------------------- Etapa 2: confiabilidade (P1 a P11) */
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const FALHA = { erro: "sem rede" };
/* todas as fontes falham ou vêm vazias: sobra só a data de hoje e o estado das fontes */
const SEM_NADA = () => ({ resp: { lista: FALHA, compras: FALHA, pedidos: FALHA, compras_online: FALHA, orcamentos: FALHA, garmin_dia: FALHA, garmin_ativ: FALHA }, jsons: {},
  agenda: () => Promise.reject(new Error("registros fora do ar")), extra: { VG: { all: [], coletado: null }, mbaAulas: () => [] } });

test("P1: fonte útil é a que respondeu COM os dados do dono; data, falha, vazio, tempo e notícias sozinhos não contam", () => {
  const est = (o) => N.hojeEstadoFontes(o, AGORA);
  assert.equal(N.hojeFontesUteis(est({})).ok, false, "nada lido");
  const so = N.hojeFontesUteis(est({ tempo: { ok: true, v: "Em Sorocaba: 25 graus.", quando: "2026-11-10T11:00:00-03:00" }, esportes: { ok: true, v: "Dodgers" }, noticias: { ok: true, v: [1], quando: "2026-11-10T10:00:00Z" },
    newsletter: { ok: true, v: {}, quando: "2026-11-10T09:00:00Z" } }));
  assert.equal(so.ok, false, "tempo, esporte, notícias e Newsletter são contexto: não bastam"); assert.match(so.motivo, /Nenhuma fonte com os seus dados/); assert.match(so.motivo, /Nada foi chamado nem cobrado/);
  const ruim = N.hojeFontesUteis(est({ agenda: { ok: true, v: [], vazio: true }, mercado: { ok: false, erro: "timeout" }, saude: { ok: true, v: {}, quando: "2026-11-05T23:59:00-03:00" } }));
  assert.equal(ruim.ok, false); assert.match(ruim.motivo, /1 falharam/); assert.match(ruim.motivo, /1 sem dados/); assert.match(ruim.motivo, /1 desatualizadas/);
  const algumas = N.hojeFontesUteis(est({ mercado: { ok: false, erro: "timeout" }, agenda: { ok: true, v: [1] }, tempo: { ok: true, v: "x" } }));
  assert.deepEqual([algumas.ok, plano(algumas.uteis)], [true, ["Agenda"]], "algumas falharam, outra respondeu: pode analisar");
  /* o pacote de fatos nunca está vazio (tem a data e o estado das fontes): por isso o bloqueio olha as fontes, não os fatos */
  const c = N.hojeContexto({ mercado: { ok: false, erro: "x" } }, HOJE, AGORA); assert.ok(c.fatos.length > 0);
});

test("P1: sem fonte útil nada é chamado nem cobrado, e a tela explica; com falha parcial a análise segue", async () => {
  const chamadas = [], mk = () => (...a) => { chamadas.push(a); return Promise.resolve(respostaReal()); };
  const s = site({ ...SEM_NADA(), racIA: mk() });
  const r = await s.ctx.hojeAnalisar();
  assert.deepEqual([r.ok, r.bloqueada, r.codigo, r.situacao], [false, true, "sem_fontes_uteis", "sem_fontes"]); assert.match(r.motivo, /Nenhuma fonte com os seus dados/);
  const rp = await s.ctx.hojeAnalisar({ pergunta: "e agora?" }); assert.equal(rp.bloqueada, true);
  assert.equal(chamadas.length, 0); assert.equal(s.mem["rac-hoje-ia-pend:dono-1"], undefined, "nada saiu: nenhum registro de chamada");
  const t = telaSite({ ...SEM_NADA(), racIA: mk() }); t.ctx.renderHoje(); await fluxo();
  const tela = t.alvos["#rachoje-view"];
  assert.ok(tela.textContent.includes("Análise bloqueada") && tela.textContent.includes("Perguntas bloqueadas"));
  assert.ok(!botao(tela, "Analisar o dia") && !botao(tela, "Perguntar"), "não há botão para uma chamada que não pode acontecer"); assert.equal(chamadas.length, 0);
  /* falha parcial: Mercado falha, o resto responde */
  const p = site({ resp: { ...RESP, compras: FALHA }, jsons: JSONS, racIA: mk() });
  const ok = await p.ctx.hojeAnalisar(); assert.equal(ok.ok, true); assert.equal(chamadas.length, 1);
  assert.ok(ok.analise.estados.some((e) => e.k === "mercado" && e.estado === "falhou"), "a falha fica registrada na análise");
});

test("P3: a análise guarda o estado das fontes de quando foi feita; o selo de dados iguais não diz que as fontes estavam em dia", async () => {
  const jsons = { ...JSONS, "noticias.json": { coletado: "2026-01-01T01:00:00Z", noticias: [{ t: "Obra na avenida" }] } };
  const s = telaSite({ resp: { ...RESP, pedidos: [] }, jsons, racIA: () => Promise.resolve(respostaReal()) });
  s.ctx.renderHoje(); await fluxo();
  const tela = s.alvos["#rachoje-view"];
  botao(tela, "Analisar o dia").onclick(); botao(tela, "Confirmar e chamar a IA").onclick(); await fluxo();
  const a = JSON.parse(s.mem["rac-hoje-ia:dono-1"]); const an = Object.values(a)[0];
  const byK = Object.fromEntries(an.estados.map((e) => [e.k, e]));
  assert.equal(byK.noticias.estado, "desatualizada"); assert.equal(byK.alimentacao.estado, "vazia"); assert.equal(byK.agenda.estado, "ok"); assert.equal(an.estados.length, 13);
  const t = tela.textContent;
  for (const m of ["Mesmos dados de agora", "Fontes com ressalva", "Feita com fontes com ressalva", "Notícias de Sorocaba (desatualizada", "Alimentação (sem dados", "Fontes no momento da análise",
    "não garante que as fontes estivessem em dia", "A hora é a da análise, não a dos dados"]) assert.ok(t.includes(m), m);
  /* análise antiga, sem o retrato das fontes: diz que não dá para saber */
  const v = telaSite({ resp: RESP, jsons: JSONS }); const velha = { ...an, estados: undefined };
  v.mem["rac-hoje-ia:dono-1"] = JSON.stringify({ [an.chave]: velha }); v.ctx.renderHoje(); await fluxo();
  assert.ok(v.alvos["#rachoje-view"].textContent.includes("O estado das fontes não foi guardado nesta análise"));
  assert.ok(!v.alvos["#rachoje-view"].textContent.includes("Fontes lidas com dados"));
  const q = N.hojeQualidadeFontes(an.estados); assert.equal(q.comRessalva, true); assert.equal(q.total, 13); assert.match(q.resumo, /de 13 fontes lidas com dados/);
});

test("P4: Ok sem data própria é dito como leitura concluída; o último registro vem do próprio dado; Saúde passa a desatualizada no dia seguinte ao último dia sem sincronia", async () => {
  const s = site({ resp: RESP, jsons: JSONS }); const c = await s.ctx.hojeColetar();
  const e = Object.fromEntries(N.hojeEstadoFontes(c.fontes, AGORA).map((x) => [x.k, x]));
  assert.equal(e.mercado.ultimo, "2026-11-09"); assert.equal(e.mercado.origem, "banco"); assert.equal(e.mercado.comData, true);
  assert.equal(e.alimentacao.ultimo, null, "sem registro não se inventa data"); assert.equal(e.agenda.comData, false); assert.equal(e.tarefas.comData, false); assert.equal(e.orcamentos.comData, false); assert.equal(e.mba.comData, false);
  assert.equal(e.saude.ultimo, "2026-11-09"); assert.equal(e.vagas.origem, "memória do site"); assert.equal(e.noticias.origem, "arquivo do site"); assert.equal(e.esportes.nota, "sem jogo dos Dodgers hoje");
  const t = telaSite({ resp: RESP, jsons: JSONS }); t.ctx.renderHoje(); await fluxo();
  const txt = t.alvos["#rachoje-view"].textContent;
  assert.ok(txt.includes("data não disponível: a leitura foi concluída, mas não se sabe a idade dos dados") && txt.includes("último registro em 09/11/2026 (ontem)") && txt.includes("sem jogo dos Dodgers hoje"));
  assert.ok(txt.includes("quer dizer só que a leitura funcionou e trouxe registros") && txt.includes("Dados recentes só aparece quando a data foi conferida") === false && txt.includes("\"Dados recentes\" só aparece quando a data foi conferida"));
  /* Saúde: o último dia (9) ainda é de ontem em 10/11 = ok; dois dias sem dados (8) já é desatualizada, igual ao fato de atraso do relógio */
  const sa = (q) => N.hojeEstadoFontes({ saude: { ok: true, v: {}, quando: q } }, AGORA).find((x) => x.k === "saude").estado;
  assert.equal(sa("2026-11-09T23:59:00-03:00"), "ok"); assert.equal(sa("2026-11-08T23:59:00-03:00"), "desatualizada");
  assert.equal(N.hojeSaude({ ok: true, v: { dias: [{ data: "2026-11-08", dados: {} }], ativs: [] } }, HOJE).atraso, 2);
});

test("P5/P6: a tela diz o que é interpretação, quem classificou fato e inferência, de onde veio cada leitura e o que o ↻ não recarrega", async () => {
  const s = telaSite({ resp: RESP, jsons: JSONS, racIA: () => Promise.resolve(respostaReal()) });
  s.ctx.renderHoje(); await fluxo();
  const tela = s.alvos["#rachoje-view"]; botao(tela, "Analisar o dia").onclick(); botao(tela, "Confirmar e chamar a IA").onclick(); await fluxo();
  const t = tela.textContent;
  for (const m of ["Interpretação escrita pela IA", "classificação da própria IA", "não confere se a classificação está certa", "Fato (segundo a IA)", "Limites apontados pela IA",
    "Coleta feita às", "Origem:", "memória do site", "\"Memória do site\" é dado já carregado, não relido aqui", "não são buscados de novo aqui"]) assert.ok(t.includes(m), m);
  assert.ok(!t.includes("Lidas agora"), "o texto antigo, que prometia leitura agora, saiu");
  assert.match(t, /Fatos: f\d+ \([a-z]+\)/, "os fatos citados mostram a fonte");
  assert.equal(s.ia.chamadas.length, 0);
});

test("P2/P8: tempo esgotado deixa registro, não repete sozinho, não gera outra chave e oferece as duas saídas explícitas (mesmo pedido × nova cobrança)", async () => {
  const chamadas = []; let modo = "pendura";
  const racIA = (...a) => { chamadas.push(a); return modo === "pendura" ? new Promise(() => {}) : modo === "repetida" ? Promise.resolve({ ok: false, versao: 1, modo: "REAL", mensagem: "Este pedido já foi processado.", erro: { codigo: "repetida" }, id: "uso-5" }) : Promise.resolve(respostaReal()); };
  const s = site({ resp: RESP, jsons: JSONS, racIA }); s.ctx.HOJE_IA_PRAZO = 30;
  const r1 = await s.ctx.hojeAnalisar();
  assert.deepEqual([r1.ok, r1.codigo, r1.situacao, r1.cobranca, r1.podeReenviar, r1.podeNova, r1.recuperavel], [false, "tempo_esgotado", "incerta", "incerta", true, true, "talvez"]);
  assert.match(r1.motivo, /não respondeu a tempo/); assert.match(r1.motivo, /Não dá para saber se o servidor a recebeu/); assert.match(r1.motivo, /Não dá para afirmar se houve cobrança/);
  const chave = chamadas[0][4], pend = JSON.parse(s.mem["rac-hoje-ia-pend:dono-1"]); assert.equal(pend[chave].estado, "incerta"); assert.equal(pend[chave].codigo, "tempo_esgotado");
  assert.equal(s.mem["rac-hoje-ia:dono-1"], undefined, "não virou análise");
  /* tentar de novo (botão normal): bloqueado, nada sai, nenhuma chave nova */
  const r2 = await s.ctx.hojeAnalisar(); assert.equal(chamadas.length, 1); assert.equal(r2.bloqueada, true); assert.equal(r2.situacao, "incerta");
  await s.ctx.hojeAnalisar({ forcar: true }); assert.equal(chamadas.length, 1);
  assert.equal(JSON.parse(s.mem["rac-hoje-ia-tent:dono-1"] || "{}")[chave.replace(/-\d+$/, "")], undefined, "nenhuma tentativa foi contada");
  /* reenviar o MESMO pedido: mesma chave; o servidor diz repetida → consumida, não recuperável, e nada mais é reenviado */
  modo = "repetida"; const r3 = await s.ctx.hojeAnalisar({ reenviar: true, chave });
  assert.equal(chamadas.length, 2); assert.equal(chamadas[1][4], chave, "a MESMA chave");
  assert.deepEqual([r3.ok, r3.situacao, r3.recuperavel, r3.podeReenviar, r3.podeNova], [false, "consumida", "nao", false, true]); assert.match(r3.motivo, /não guarda o texto da análise/);
  const r4 = await s.ctx.hojeAnalisar({ reenviar: true, chave }); assert.equal(chamadas.length, 2, "consumida não reenvia"); assert.equal(r4.situacao, "consumida");
  /* nova cobrança: só se o dono pede (outra chave) e vira análise */
  modo = "ok"; const r5 = await s.ctx.hojeAnalisar({ nova: true });
  assert.equal(chamadas.length, 3); assert.equal(chamadas[2][4], chave + "-1"); assert.equal(r5.ok, true);
});

test("P2: a resposta que chega depois do prazo é guardada e o registro some; o registro sobrevive a recarregar a página e vira incerta", async () => {
  let soltar, chegou = null; const s = site({ resp: RESP, jsons: JSONS, racIA: () => new Promise((r) => { soltar = () => r(respostaReal()); }) }); s.ctx.HOJE_IA_PRAZO = 30; s.ctx.HOJE.aoChegar = (f) => { chegou = f; };
  const r1 = await s.ctx.hojeAnalisar(); assert.equal(r1.situacao, "incerta");
  soltar(); await espera(20);
  assert.ok(chegou && chegou.ok, "a tela é avisada"); const c = JSON.parse(s.mem["rac-hoje-ia:dono-1"]); assert.equal(Object.keys(c).length, 1);
  assert.equal(s.mem["rac-hoje-ia-pend:dono-1"], "{}", "chegou: não há mais chamada sem resultado");
  const r2 = await s.ctx.hojeAnalisar(); assert.equal(r2.deCache, true);
  /* página fechada com a chamada no ar: ao reabrir, o registro "enviada" vira incerta (e antes de 2 min, em andamento) */
  const quando = (ms) => new Date(Date.now() - ms).toISOString();
  const s2 = site({ resp: RESP, jsons: JSONS }); s2.mem["rac-hoje-ia-pend:dono-1"] = JSON.stringify({ a: { chave: "a", estado: "enviada", quando: quando(30e3), rotulo: "Análise do dia" }, b: { chave: "b", estado: "enviada", quando: quando(10 * 60e3), rotulo: "Pergunta: x" } });
  const p = Object.fromEntries(s2.ctx.RAChoje.pendencias().map((x) => [x.chave, x]));
  assert.equal(p.a.situacao, "em_curso"); assert.equal(p.a.podeReenviar, false); assert.equal(p.b.situacao, "incerta"); assert.equal(p.b.podeReenviar, false, "registro sem o pedido original guardado: o reenvio seguro não é oferecido");
  assert.match(p.b.motivo, /não é oferecido/);
});

test("P2/P8: erro com id (o servidor já usou a chave), falha de rede e recusa sem reserva se comportam de formas diferentes", async () => {
  const chamadas = []; let resp = null;
  const s = site({ resp: RESP, jsons: JSONS, racIA: (...a) => { chamadas.push(a); return resp(); } });
  /* recusa antes de reservar (orçamento): nada foi usado, a mesma chave pode ser tentada de novo */
  resp = () => Promise.resolve({ ok: false, versao: 1, modo: "REAL", mensagem: "Limite mensal.", erro: { codigo: "orcamento_esgotado" } });
  const a = await s.ctx.hojeAnalisar(); assert.deepEqual([a.ok, a.situacao, a.cobranca], [false, "livre", "nenhuma"]); assert.equal(s.mem["rac-hoje-ia-pend:dono-1"], "{}");
  resp = () => Promise.resolve(respostaReal()); const b = await s.ctx.hojeAnalisar(); assert.equal(b.ok, true); assert.equal(chamadas[0][4], chamadas[1][4], "mesma chave, sem custo duplicado");
  /* resposta inválida COM id e consumo: chave usada e provavelmente cobrada; sem repetir */
  const s2 = site({ resp: RESP, jsons: JSONS, racIA: (...a) => { chamadas.push(a); return Promise.resolve({ ok: false, versao: 1, modo: "REAL", id: "uso-7", estado: "concluido", mensagem: "A resposta da IA veio incompleta.", erro: { codigo: "resposta_invalida" }, consumo: { estimado_rac_usd: 0.02 } }); } });
  const n0 = chamadas.length; const c = await s2.ctx.hojeAnalisar();
  assert.deepEqual([c.situacao, c.cobranca, c.recuperavel, c.podeReenviar, c.podeNova], ["consumida", "provavel", "nao", false, true]); assert.match(c.motivo, /incompleta/);
  await s2.ctx.hojeAnalisar(); assert.equal(chamadas.length, n0 + 1, "bloqueado: não há segunda chamada");
  /* o servidor marcou incerto: cobrança incerta */
  const s3 = site({ resp: RESP, jsons: JSONS, racIA: () => Promise.resolve({ ok: false, versao: 1, modo: "REAL", id: "uso-8", estado: "incerto", mensagem: "A IA não respondeu a tempo.", erro: { codigo: "tempo_esgotado" } }) });
  assert.equal((await s3.ctx.hojeAnalisar()).cobranca, "incerta");
  /* falha de rede: não se sabe se chegou */
  const s4 = site({ resp: RESP, jsons: JSONS, racIA: () => Promise.reject(new Error("Failed to fetch")) }); const d = await s4.ctx.hojeAnalisar();
  assert.deepEqual([d.situacao, d.podeReenviar, d.codigo], ["incerta", true, "rede"]); assert.match(d.motivo, /Não dá para saber se a chamada chegou ao servidor/);
  /* DEMO nunca consome nem vira registro */
  const s5 = site({ resp: RESP, jsons: JSONS, racIA: () => Promise.resolve({ ...respostaReal(), modo: "DEMO", resultado: { ...boa(), _demo: true } }) });
  const e = await s5.ctx.hojeAnalisar(); assert.equal(e.ok, false); assert.equal(s5.mem["rac-hoje-ia-pend:dono-1"], "{}");
});

test("P2/P8 na tela: resultado incerto aparece como tal, sem o botão normal, com as duas saídas e dupla confirmação; nada é enviado sozinho", async () => {
  const chamadas = []; let pendura = true;
  const s = telaSite({ resp: RESP, jsons: JSONS, racIA: (...a) => { chamadas.push(a); return pendura ? new Promise(() => {}) : Promise.resolve(respostaReal()); } }); s.ctx.HOJE_IA_PRAZO = 30;
  s.ctx.renderHoje(); await fluxo(); const tela = s.alvos["#rachoje-view"];
  botao(tela, "Analisar o dia").onclick(); botao(tela, "Confirmar e chamar a IA").onclick(); await espera(120);
  const t = tela.textContent;
  for (const m of ["Resultado incerto", "Não dá para saber se o servidor a recebeu", "Não dá para afirmar se houve cobrança", "recuperável só se a resposta ainda chegar a esta página", "Chamadas sem resultado neste aparelho", "Nenhuma resposta simulada foi usada"]) assert.ok(t.includes(m), m);
  assert.ok(!botao(tela, "Analisar o dia") && !botao(tela, "Analisar de novo"), "o botão normal não aparece enquanto há chamada sem resultado");
  assert.equal(chamadas.length, 1);
  /* reabrir a tela: continua incerto e nada é chamado */
  s.ctx.renderHoje(); await fluxo(); assert.ok(tela.textContent.includes("Resultado incerto")); assert.equal(chamadas.length, 1);
  /* reenviar o mesmo pedido: primeiro toque só avisa */
  botao(tela, "Reenviar o mesmo pedido").onclick(); assert.equal(chamadas.length, 1);
  assert.ok(tela.textContent.includes("O servidor não cobra a mesma chave duas vezes"));
  botao(tela, "Cancelar").onclick(); assert.equal(chamadas.length, 1);
  pendura = false; botao(tela, "Pedir outra análise (nova cobrança)").onclick(); assert.equal(chamadas.length, 1, "o primeiro toque só avisa");
  assert.ok(tela.textContent.includes("A tentativa anterior pode já ter sido cobrada")); botao(tela, "Confirmar e chamar a IA").onclick(); await fluxo();
  assert.equal(chamadas.length, 2); assert.equal(chamadas[1][4], chamadas[0][4] + "-1"); assert.ok(tela.textContent.includes("Mesmos dados de agora"));
});

test("P9: mudar só notícias ou Newsletter não torna a análise desatualizada nem gera outra chave; mudar o Mercado, sim", async () => {
  const mk = (ex) => ({ hoje: HOJE, fatos: [{ fonte: "rac", texto: "Hoje é " + HOJE + "." }, { fonte: "agenda", texto: "Prova amanhã." }, ...ex] });
  const s = site({ resp: RESP, jsons: JSONS }), P = s.ctx.RAChoje.pacote;
  const n1 = [{ fonte: "noticias", texto: "Sorocaba: obra." }, { fonte: "newsletter", texto: "Destaque (Tecnologia): X" }, { fonte: "rac", texto: "Fonte Newsletter: desatualizada, dado de 15 horas atrás." }];
  const n2 = [{ fonte: "noticias", texto: "Sorocaba: outra obra." }, { fonte: "rac", texto: "Fonte Notícias de Sorocaba: desatualizada, dado de 13 horas atrás." }];
  assert.equal(P(mk(n1)), P(mk(n2)), "notícias e Newsletter (e o estado delas) fora da comparação");
  assert.notEqual(P(mk(n1)), P(mk([{ fonte: "financas", texto: "Gastos do mês: R$ 100,00." }])), "dado financeiro continua valendo");
  assert.notEqual(P(mk([])), P(mk([{ fonte: "rac", texto: "Fonte Saúde e relógio: desatualizada, dado de 30 horas atrás." }])), "uma fonte pessoal que fica desatualizada é mudança de verdade");
  assert.equal(P(mk([{ fonte: "rac", texto: "Fonte Saúde e relógio: desatualizada, dado de 30 horas atrás." }])), P(mk([{ fonte: "rac", texto: "Fonte Saúde e relógio: desatualizada, dado de 31 horas atrás." }])), "só passar as horas não muda");
  assert.equal(N.hojeTextoChave('<fato id="f03" fonte="rac" periodo="hoje">Fonte Saúde e relógio: desatualizada, dado de 30 horas atrás.</fato>'), N.hojeTextoChave('<fato id="f09" fonte="rac" periodo="hoje">Fonte Saúde e relógio: desatualizada, dado de 31 horas atrás.</fato>'), "nem a chave");
  /* na prática: trocar as notícias depois da análise = mesma chave, vem do cache, sem chamada */
  const chamadas = []; const jsons = { ...JSONS }; const t = site({ resp: RESP, jsons, racIA: (...a) => { chamadas.push(a); return Promise.resolve(respostaReal()); } });
  await t.ctx.hojeAnalisar(); jsons["noticias.json"] = { coletado: "2026-11-10T11:00:00Z", noticias: [{ t: "Outra manchete" }] };
  const r = await t.ctx.hojeAnalisar({ forcar: true }); assert.equal(r.deCache, true); assert.equal(chamadas.length, 1);
  assert.match(chamadas[0][2].texto, /Obra na avenida/, "a IA continua recebendo as notícias");
});

test("P11: a confirmação diz se vem do cache (sem cobrança) ou se é cobrança nova, e só estima o custo quando há base; continua em duas etapas", async () => {
  const chamadas = []; const s = telaSite({ resp: RESP, jsons: JSONS, racIA: (...a) => { chamadas.push(a); return Promise.resolve(respostaReal()); } });
  s.ctx.renderHoje(); await fluxo(); const tela = s.alvos["#rachoje-view"];
  botao(tela, "Analisar o dia").onclick(); const ini = tela.textContent;
  assert.ok(ini.includes("Ainda não há base neste aparelho para estimar o custo") && ini.includes("o valor real é o da fatura do Console"), "sem histórico: não inventa estimativa");
  botao(tela, "Confirmar e chamar a IA").onclick(); await fluxo(); assert.equal(chamadas.length, 1);
  botao(tela, "Analisar de novo (nova cobrança)").onclick(); const dep = tela.textContent;
  assert.ok(dep.includes("NOVA cobrança") && dep.includes("cada chamada custou US$ 0,011") && dep.includes("não é valor garantido"), "com histórico: estimativa dita como estimativa");
  assert.equal(chamadas.length, 1, "o primeiro toque só avisa"); botao(tela, "Cancelar").onclick();
  /* pergunta já respondida: vem do cache */
  const campo = varre(tela, (e) => e.tagName === "TEXTAREA")[0]; campo.value = "O que devo resolver primeiro?";
  botao(tela, "Perguntar").onclick(); assert.ok(tela.textContent.includes("chamada paga")); botao(tela, "Confirmar e chamar a IA").onclick(); await fluxo(); assert.equal(chamadas.length, 2);
  const campo2 = varre(tela, (e) => e.tagName === "TEXTAREA")[0]; campo2.value = "O que devo resolver primeiro?";
  botao(tela, "Perguntar").onclick(); const c = tela.textContent;
  assert.ok(c.includes("já está guardada neste aparelho") && c.includes("sem chamar a IA e sem cobrança")); assert.ok(!botao(tela, "Confirmar e chamar a IA"), "o botão não promete chamada");
  botao(tela, "Mostrar do cache (sem cobrança)").onclick(); await fluxo(); assert.equal(chamadas.length, 2, "do cache: nenhuma chamada");
  /* pergunta vazia: só avisa */
  const campo3 = varre(tela, (e) => e.tagName === "TEXTAREA")[0]; campo3.value = "  ";
  botao(tela, "Perguntar").onclick(); assert.ok(tela.textContent.includes("Escreva a pergunta antes de confirmar")); assert.ok(!botao(tela, "Confirmar e chamar a IA"));
});

test("estados da tela: carregando, falha de leitura e chamada em andamento; o histórico do banco separado do local e a falha do banco não derruba a tela", async () => {
  let soltar; const s = telaSite({ resp: { ...RESP, ia_custos: FALHA }, jsons: JSONS, racIA: () => new Promise((r) => { soltar = () => r(respostaReal()); }) });
  s.ctx.renderHoje(); await fluxo(); const tela = s.alvos["#rachoje-view"];
  assert.ok(tela.textContent.includes("Não consegui ler o registro de chamadas (sem rede)"), "falha do banco isolada"); assert.ok(tela.textContent.includes("Nenhuma análise guardada neste aparelho"));
  assert.ok(tela.textContent.includes("nunca o texto da análise"));
  botao(tela, "Analisar o dia").onclick(); botao(tela, "Confirmar e chamar a IA").onclick();
  assert.ok(tela.textContent.includes("Analisando com a IA") && tela.textContent.includes("Não toque de novo")); assert.ok(botao(tela, "Analisar o dia").disabled, "botão travado enquanto a chamada está no ar");
  await fluxo(); soltar(); await fluxo(); assert.ok(tela.textContent.includes("Chamada concluída e análise disponível"));
  /* leitura inicial falha por inteiro (precisa() recusa): a tela mostra o erro e nada é chamado */
  const f = telaSite({ resp: RESP, jsons: JSONS, extra: { precisa: () => Promise.reject(new Error("módulo fora do ar")) } });
  f.ctx.renderHoje(); await fluxo(); assert.equal(f.ia.chamadas.length, 0);
});

/* ================================================================ Etapa 3 (R1–R9): correções finais de segurança e confiabilidade */
const REG = "rac-hoje-ia-pend:dono-1", TEN = "rac-hoje-ia-tent:dono-1", CAC = "rac-hoje-ia:dono-1", TRA = "rac-hoje-ia-trava:dono-1";
const iso = (ms) => new Date(Date.now() - ms).toISOString();
const GRANDE = "x".repeat(2000);
const regInc = (chave, quando, extra = {}) => ({ chave, estado: "incerta", quando, rotulo: "Análise do dia", codigo: "tempo_esgotado", cobranca: "incerta", intencao: "i-" + chave,
  entrada: { texto: GRANDE, data: HOJE }, snap: { fatos: [{ id: "f01", fonte: "agenda", texto: "x" }], estados: [], pacote: "p", hoje: HOJE }, ...extra });
const total = (mem) => Object.values(mem).reduce((a, v) => a + String(v).length, 0);
/* o racIA do teste: pendura (nunca responde), ou responde conforme `modo` */
function iaTeste() {
  const e = { chamadas: [], modo: "pendura", aoChamar: null };
  e.racIA = (...a) => { e.chamadas.push(a); if (e.aoChamar) e.aoChamar();
    return e.modo === "pendura" ? new Promise(() => {}) : e.modo === "repetida" ? Promise.resolve({ ok: false, versao: 1, modo: "REAL", mensagem: "Este pedido já foi processado.", erro: { codigo: "repetida" }, id: "uso-5" }) : Promise.resolve(respostaReal()); };
  return e;
}

/* ---- R1: o reenvio usa a chave e o pedido originais */
test("R1: reenviar usa a MESMA chave e o MESMO pedido guardados, mesmo com dados, data e contador mudados; sobrevive a recarregar a página", async () => {
  const ia = iaTeste(), mem = {}, resp = { ...RESP };
  const s = site({ resp, jsons: JSONS, racIA: ia.racIA, mem }); s.ctx.HOJE_IA_PRAZO = 30;
  const r1 = await s.ctx.hojeAnalisar();
  assert.equal(r1.codigo, "tempo_esgotado"); assert.equal(r1.podeReenviar, true);
  const original = JSON.stringify(ia.chamadas[0]), chave = ia.chamadas[0][4];
  const reg = JSON.parse(mem[REG])[chave];
  assert.equal(reg.chave, chave, "a chave original fica no registro"); assert.equal(reg.entrada.texto, ia.chamadas[0][2].texto, "e o pedido enviado"); assert.equal(reg.entrada.data, HOJE);
  /* 1) os dados mudam; 3) o contador de tentativas é alterado; 2) a data muda; 4) a página é recarregada (outro site() com o mesmo armazenamento) */
  resp.compras = [{ data: "2026-11-09", valor_total: 999 }, { data: "2026-11-10", valor_total: 1 }];
  const base = chave.replace(/-\d+$/, ""); mem[TEN] = JSON.stringify({ [base]: 5, outra: 9 });
  const s2 = site({ resp, jsons: JSONS, racIA: ia.racIA, mem, extra: { hojeISO: () => "2026-11-12" } }); s2.ctx.hojeISO = () => "2026-11-12";
  const pend = s2.ctx.RAChoje.pendencias(); assert.equal(pend.length, 1); assert.equal(pend[0].chave, chave); assert.equal(pend[0].podeReenviar, true, "depois de recarregar, o reenvio seguro continua oferecido");
  ia.modo = "repetida";
  const r2 = await s2.ctx.hojeAnalisar({ reenviar: true, chave });
  assert.equal(ia.chamadas.length, 2); assert.equal(JSON.stringify(ia.chamadas[1]), original, "a chamada é idêntica à original: chave, texto, contexto e data");
  assert.equal(JSON.parse(mem[TEN])[base], 5, "o contador não foi tocado"); assert.equal(JSON.parse(mem[TEN]).outra, 9);
  assert.deepEqual([r2.ok, r2.situacao, r2.podeReenviar], [false, "consumida", false]);
  /* o mesmo, mas agora o servidor aceita: a análise guardada é a do dia e do pacote ORIGINAIS, não a de hoje */
  const ia2 = iaTeste(), mem2 = {}, resp2 = { ...RESP };
  const t = site({ resp: resp2, jsons: JSONS, racIA: ia2.racIA, mem: mem2 }); t.ctx.HOJE_IA_PRAZO = 30; await t.ctx.hojeAnalisar();
  const k2 = ia2.chamadas[0][4], pacoteOrig = JSON.parse(mem2[REG])[k2].snap.pacote; resp2.compras = [{ data: "2026-11-09", valor_total: 5555 }]; ia2.modo = "ok";
  const t2 = site({ resp: resp2, jsons: JSONS, racIA: ia2.racIA, mem: mem2, extra: { hojeISO: () => "2026-11-12" } });
  const ok = await t2.ctx.hojeAnalisar({ reenviar: true, chave: k2 });
  assert.equal(ok.ok, true); assert.equal(ok.analise.hoje, HOJE, "o dia da análise é o do pedido original"); assert.equal(ok.analise.pacote, pacoteOrig); assert.equal(ia2.chamadas[1][4], k2);
  assert.equal(JSON.parse(mem2[REG])[k2], undefined, "chegou: o registro some"); assert.ok(JSON.parse(mem2[CAC])[k2]);
});

test("R1: sem a chave ou o pedido originais, o reenvio não é oferecido nem aceito; só com confirmação explícita e aviso de possível cobrança", async () => {
  const ia = iaTeste(), mem = {};
  /* registro antigo, sem o pedido guardado: reenviar com os dados de hoje seria outro pedido */
  mem[REG] = JSON.stringify({ a: { chave: "a", estado: "incerta", quando: iso(60e6), rotulo: "Análise do dia", codigo: "tempo_esgotado", cobranca: "incerta" } });
  const s = site({ resp: RESP, jsons: JSONS, racIA: ia.racIA, mem });
  const p = s.ctx.RAChoje.pendencias()[0]; assert.equal(p.podeReenviar, false); assert.match(p.motivo, /não é oferecido/);
  assert.equal((await s.ctx.hojeAnalisar({ reenviar: true, chave: "a" })).bloqueada, true); assert.equal(ia.chamadas.length, 0, "nada enviado");
  const sem = await s.ctx.hojeAnalisar({ reenviar: true, chave: "nao-existe" }); assert.equal(sem.codigo, "registro_ausente"); assert.equal(ia.chamadas.length, 0);
  const sem2 = await s.ctx.hojeAnalisar({ reenviar: true }); assert.equal(sem2.codigo, "registro_ausente", "sem chave não há reenvio"); assert.equal(ia.chamadas.length, 0);
  /* na tela: o botão de reenvio só existe com o pedido guardado, e o aviso diz que a tentativa anterior pode ter sido cobrada */
  const t = telaSite({ resp: RESP, jsons: JSONS, racIA: ia.racIA }); t.ctx.HOJE_IA_PRAZO = 30; t.ctx.renderHoje(); await fluxo(); const tela = t.alvos["#rachoje-view"];
  botao(tela, "Analisar o dia").onclick(); botao(tela, "Confirmar e chamar a IA").onclick(); await espera(120);
  assert.ok(botao(tela, "Reenviar o mesmo pedido"), "pedido original guardado: oferece");
  botao(tela, "Reenviar o mesmo pedido").onclick(); assert.equal(ia.chamadas.length, 1, "o primeiro toque só avisa");
  assert.ok(tela.textContent.includes("A tentativa anterior pode já ter sido cobrada") && tela.textContent.includes("chave original"));
  ia.modo = "ok"; botao(tela, "Confirmar e chamar a IA").onclick(); await fluxo(); assert.equal(ia.chamadas.length, 2); assert.equal(ia.chamadas[1][4], ia.chamadas[0][4]);
  const u = telaSite({ resp: RESP, jsons: JSONS, racIA: iaTeste().racIA }); u.mem[REG] = JSON.stringify({ a: { ...JSON.parse(mem[REG]).a, intencao: u.ctx.hojeIntencao(HOJE, "") } }); u.ctx.renderHoje(); await fluxo();
  assert.ok(!botao(u.alvos["#rachoje-view"], "Reenviar o mesmo pedido"), "sem o pedido guardado, a tela não apresenta reenvio seguro");
  assert.ok(botao(u.alvos["#rachoje-view"], "Pedir outra análise (nova cobrança)"), "a saída explícita (nova cobrança) continua");
});

/* ---- R2: o estado real da Agenda (as funções de verdade: a fonte da Agenda, js/fonte-agenda.js desde a Fase 2 · A4, com a escolha dos itens no
   núcleo, NUCLEO.agendaItens, A5; e o trecho da tela que ficou em js/sistema.js) */
function agendaReal({ registros, owner = true, backup, aulas = true, lembretes = true, veic = true, candidaturas = [] } = {}) {
  const src = ler("js/sistema.js"), i = src.indexOf("  var AGENDA_TIPOS"), j = src.indexOf("  /* ===== Próxima melhor ação");
  assert.ok(i > 0 && j > i, "o trecho da tela da Agenda está no sistema.js");
  const pronto = (r) => (r && r.rejeita ? Promise.reject(new Error(r.rejeita)) : Promise.resolve(r));
  const ctx = { console, Promise, Object, Array, JSON, Date, Math, String, Number, Error, isFinite, hojeISO: () => HOJE, isOwner: () => owner, logErro: () => {},
    sbOk: (r) => { if (r.error) throw new Error(r.error.message); return r.data; }, maisDias: (d, n) => N.somaDiasISO(d, n), tipoInfo: () => ["x", "Revisão"], dataBR: (d) => d.split("-").reverse().join("/"), BRL: (v) => "R$ " + v,
    FAM: { civic: { n: "Civic", veic }, eddie: { n: "Eddie" } }, AGENDA_ICO: {}, withDates: () => [],
    fonteMbaDados: () => ({ aulas: aulas ? [{ data: "2026-11-12", hora: "19:00", t: "Python II" }] : [], avals: [], fin: null }),
    NUCLEO: N, PESSOAL: { ultimoBackup: HOJE, candidaturas, lembretes: lembretes ? [{ id: "l1", data: "2026-11-11", t: "Ligar para o seguro" }] : [] }, EU: { id: "dono-1" },
    SB: { from: () => ({ select: () => ({ order: () => pronto(registros) }) }), storage: { from: () => ({ list: () => pronto(backup || { data: [{ name: "2026-11-08.zip" }], error: null }) }) } } };
  vm.createContext(ctx); for (const f of ["js/fontes.js", "js/fonte-agenda.js"]) vm.runInContext(ler(f), ctx, { filename: f });
  vm.runInContext(src.slice(i, j), ctx, { filename: "sistema.js (agenda)" });
  return ctx;
}
const REGS_OK = { data: [{ id: 1, quem: "civic", tipo: "revisao", data: "2026-10-01", titulo: "Revisão 30 mil", proxima: "2026-11-15", dados: {} }], error: null };

test("R2: a leitura da Agenda diferencia completa, vazia, parcial e falha; falha do banco nunca vira sucesso nem some", async () => {
  const comp = await agendaReal({ registros: REGS_OK }).agendaColetarLeitura();
  assert.deepEqual([comp.estado, comp.falhas.length], ["completa", 0]); assert.ok(comp.eventos.some((e) => /Revisão 30 mil/.test(e.t)), "o item do banco aparece");
  const vazia = await agendaReal({ registros: { data: [], error: null }, aulas: false, lembretes: false, veic: false }).agendaColetarLeitura();
  assert.deepEqual([vazia.estado, vazia.eventos.length, vazia.falhas.length], ["vazia", 0, 0], "tudo lido, nada a mostrar: ausência de registros, não erro");
  for (const falha of [{ error: { message: "sem rede" }, data: null }, { rejeita: "timeout do banco" }]) {
    const par = await agendaReal({ registros: falha }).agendaColetarLeitura();
    assert.equal(par.estado, "parcial"); assert.match(par.falhas[0], /^registros: /); assert.ok(par.eventos.some((e) => /Python II/.test(e.t)) && par.eventos.some((e) => /seguro/.test(e.t)), "o que veio da memória do site continua utilizável");
    assert.ok(!par.eventos.some((e) => /Revisão 30 mil/.test(e.t)));
    const nada = await agendaReal({ registros: falha, aulas: false, lembretes: false, veic: false }).agendaColetarLeitura();
    assert.deepEqual([nada.estado, nada.eventos.length], ["falha", 0], "falhou e não sobrou nada: é falha, não 'sem registros'");
  }
  const bk = await agendaReal({ registros: REGS_OK, backup: { data: null, error: { message: "bucket fora do ar" } } }).agendaColetarLeitura();
  assert.equal(bk.estado, "parcial"); assert.match(bk.falhas[0], /^backup: bucket fora do ar/);
  const casa = await agendaReal({ registros: { rejeita: "não deveria ler" }, owner: false }).agendaColetarLeitura(); assert.equal(casa.falhas.length, 0, "a casa não lê registros: isso não é falha");
  /* quem só quer os eventos continua recebendo a lista */
  assert.ok(Array.isArray(await agendaReal({ registros: REGS_OK }).agendaColetar()));
});

test("R2: no RAC Hoje a Agenda com falha do banco vira 'parcial' (dados da memória ficam à vista) ou 'falhou' (nada utilizável), nunca 'ok' nem 'sem dados'", async () => {
  const mk = (o) => site({ resp: RESP, jsons: JSONS, extra: { agendaColetarLeitura: agendaReal(o).agendaColetarLeitura } });
  const s = mk({ registros: { error: { message: "sem rede" }, data: null } }); const c = await s.ctx.hojeColetar();
  assert.deepEqual([c.fontes.agenda.ok, c.fontes.agenda.parcial, c.fontes.agenda.vazio], [true, true, false]); assert.match(c.fontes.agenda.falhas[0], /registros: sem rede/);
  const est = N.hojeEstadoFontes(c.fontes, AGORA).find((x) => x.k === "agenda"); assert.equal(est.estado, "parcial"); assert.match(est.detalhe, /leitura parcial: registros: sem rede/);
  assert.deepEqual(plano(N.hojeFontesUteis([est]).parciais), ["Agenda"]); assert.equal(N.hojeFontesUteis([est]).ok, true, "dados válidos da memória ainda servem");
  const x = await s.ctx.hojeMontar(); assert.ok(x.fatos.some((f) => /Fonte Agenda: leitura parcial/.test(f.texto) && /pode faltar item/.test(f.texto)), "a IA é avisada");
  assert.ok(x.itens.some((i) => /Python II/.test(i.titulo)), "e o que veio da memória entra nas prioridades");
  const f = mk({ registros: { error: { message: "sem rede" }, data: null }, aulas: false, lembretes: false, veic: false }); const cf = await f.ctx.hojeColetar();
  assert.equal(cf.fontes.agenda.ok, false); assert.match(cf.fontes.agenda.erro, /a leitura da Agenda falhou/);
  assert.equal(N.hojeEstadoFontes(cf.fontes, AGORA).find((y) => y.k === "agenda").estado, "falhou");
  const v = mk({ registros: { data: [], error: null }, aulas: false, lembretes: false, veic: false }); const cv = await v.ctx.hojeColetar();
  assert.equal(N.hojeEstadoFontes(cv.fontes, AGORA).find((y) => y.k === "agenda").estado, "vazia", "só quando tudo foi lido e não há nada");
  const t = telaSite({ resp: RESP, jsons: JSONS, extra: { agendaColetarLeitura: agendaReal({ registros: { error: { message: "sem rede" }, data: null } }).agendaColetarLeitura } }); t.ctx.renderHoje(); await fluxo();
  const txt = t.alvos["#rachoje-view"].textContent; assert.ok(txt.includes("Leitura parcial") && txt.includes("registros: sem rede"));
});

/* ---- R3: registros incertos não somem */
test("R3: um registro incerto não expira em sete dias nem cai pelo limite de oito; só some com resultado, recusa comprovada ou dispensa do dono", async () => {
  const mem = {}, antigos = {};
  for (let i = 0; i < 12; i++) antigos["k" + i] = regInc("k" + i, iso((30 + i) * 864e5));
  mem[REG] = JSON.stringify(antigos);
  const ia = iaTeste(); ia.modo = "ok";
  const s = site({ resp: RESP, jsons: JSONS, racIA: ia.racIA, mem });
  assert.equal(s.ctx.RAChoje.pendencias().length, 12, "30 dias depois, todos continuam à vista");
  const r = await s.ctx.hojeAnalisar({ pergunta: "o que fazer?" }); assert.equal(r.ok, true);
  assert.equal(Object.keys(JSON.parse(mem[REG])).length, 12, "uma gravação nova não derruba nenhum (antes: limite de 8 e 7 dias)");
  assert.equal(s.ctx.RAChoje.dispensar("k0"), true); assert.equal(Object.keys(JSON.parse(mem[REG])).length, 11, "o dono dispensa um: só esse sai");
  const emCurso = site({ resp: RESP, jsons: JSONS, mem: { [REG]: JSON.stringify({ e: regInc("e", iso(10e3), { estado: "enviada" }) }) } });
  assert.equal(emCurso.ctx.RAChoje.dispensar("e"), false, "o que ainda está no ar não se dispensa");
  const casa = site({ resp: RESP, jsons: JSONS, dono: false, mem: { [REG]: mem[REG] } }); assert.throws(() => casa.ctx.RAChoje.dispensar("k1"), /só da conta do dono/);
});

test("R3: falha de armazenamento local DEPOIS do envio: o registro incerto continua à vista na página, dito como 'só na memória'; resposta que chega e não é gravada não apaga o registro", async () => {
  /* a) o navegador deixa de gravar quando a chamada sai; o tempo esgota */
  let cheio = false; const ia = iaTeste(), mem = {}; ia.aoChamar = () => { cheio = true; };
  const s = site({ resp: RESP, jsons: JSONS, racIA: ia.racIA, mem, extra: { quotaLS: () => cheio } }); s.ctx.HOJE_IA_PRAZO = 30;
  const r = await s.ctx.hojeAnalisar(); assert.equal(r.codigo, "tempo_esgotado"); assert.equal(r.soMemoria, true); assert.match(r.motivo, /só existe na memória desta página/);
  const p = s.ctx.RAChoje.pendencias(); assert.equal(p.length, 1); assert.equal(p[0].situacao, "incerta"); assert.equal(p[0].soMemoria, true);
  assert.equal(JSON.parse(mem[REG])[p[0].chave].estado, "enviada", "o que chegou a ser gravado antes continua lá");
  /* b) a resposta chega, mas o navegador não grava a análise: ela fica na memória e o registro NÃO some */
  let cheio2 = false; const ia2 = iaTeste(), mem2 = {}; ia2.modo = "ok"; ia2.aoChamar = () => { cheio2 = true; };
  const t = site({ resp: RESP, jsons: JSONS, racIA: ia2.racIA, mem: mem2, extra: { quotaLS: () => cheio2 } });
  const ok = await t.ctx.hojeAnalisar(); assert.equal(ok.ok, true, "a análise é mostrada nesta página"); assert.equal(t.ctx.RAChoje.historico().length, 1);
  assert.ok(Object.keys(JSON.parse(mem2[REG])).length === 1, "mas o registro da chamada paga ficou no aparelho");
  cheio2 = false; const depois = site({ resp: RESP, jsons: JSONS, mem: mem2 }); assert.equal(depois.ctx.RAChoje.pendencias().length, 1, "ao recarregar, a cobrança possível não sumiu sem rastro");
  /* c) o armazenamento recusa tudo desde o início: nada é enviado */
  const ia3 = iaTeste(); const u = site({ resp: RESP, jsons: JSONS, racIA: ia3.racIA, extra: { quotaLS: () => true } });
  const n = await u.ctx.hojeAnalisar(); assert.equal(ia3.chamadas.length, 0); assert.equal(n.cobranca, "nenhuma"); assert.equal(n.semEnvio, true);
});

test("R3: recusa SEM prova de que nada foi reservado continua incerta; só código conhecido e sem id conta como 'sem cobrança'", async () => {
  const cl = site({ resp: RESP, jsons: JSONS }).ctx.hojeClassificar;
  const c = (r) => plano(cl(r));
  assert.deepEqual(c({ ok: false, versao: 1, modo: "REAL", erro: { codigo: "orcamento_esgotado" } }), { livre: true, estado: null, cobranca: "nenhuma" }, "o contrato diz: recusado antes de reservar");
  for (const r of [{ ok: false, erro: { codigo: "interno" } }, { ok: false, erro: { codigo: "codigo_novo_que_nao_conheco" } }, { ok: false, erro: { codigo: "provedor_indisponivel" } }, { ok: false, erro: { codigo: "tempo_esgotado" } },
    { ok: false, mensagem: "falhou" }, {}, null, undefined, { ok: false, erro: { codigo: "orcamento_esgotado" }, id: "uso-3" }, { ok: false, erro: { codigo: "sem_real" }, estado: "reservado" }])
    assert.deepEqual([c(r).livre, c(r).cobranca], [false, "incerta"], JSON.stringify(r));
  assert.equal(c({ ok: false, erro: { codigo: "resposta_invalida" }, id: "u", estado: "concluido", consumo: { estimado_rac_usd: 0 } }).cobranca, "incerta", "uso zero também não prova ausência de cobrança");
  /* na prática: o registro continua e o dono é avisado */
  const ia = iaTeste(), mem = {}; ia.racIA = (...a) => { ia.chamadas.push(a); return Promise.resolve({ ok: false, versao: 1, modo: "REAL", mensagem: "Erro interno do RAC Intelligence.", erro: { codigo: "interno" } }); };
  const s = site({ resp: RESP, jsons: JSONS, racIA: ia.racIA, mem }); const r = await s.ctx.hojeAnalisar();
  assert.deepEqual([r.ok, r.situacao, r.cobranca], [false, "incerta", "incerta"]); assert.equal(Object.keys(JSON.parse(mem[REG])).length, 1, "o registro fica");
  assert.match(r.motivo, /Não dá para afirmar se houve cobrança/); assert.ok(!/Sem cobrança/.test(r.motivo));
  /* sem reserva comprovada: o registro sai e a mensagem diz o porquê */
  const l = site({ resp: RESP, jsons: JSONS, racIA: () => Promise.resolve({ ok: false, versao: 1, modo: "REAL", mensagem: "Limite mensal.", erro: { codigo: "limite_de_uso" } }), mem: {} });
  const rl = await l.ctx.hojeAnalisar(); assert.deepEqual([rl.situacao, rl.cobranca], ["livre", "nenhuma"]); assert.match(rl.motivo, /antes de reservar a chamada/);
});

/* ---- R4: as mensagens dizem só o que se sabe */
test("R4: cada situação tem a sua mensagem, e nenhuma afirma cobrança nem ausência de cobrança sem prova", async () => {
  const cenarios = {
    concluida: () => Promise.resolve(respostaReal()),
    repetida: () => Promise.resolve({ ok: false, versao: 1, modo: "REAL", mensagem: "Este pedido já foi processado.", erro: { codigo: "repetida" }, id: "uso-5" }),
    andamento: () => Promise.resolve({ ok: false, versao: 1, modo: "REAL", mensagem: "Este pedido já está sendo processado.", erro: { codigo: "em_andamento" } }),
    antes: () => Promise.resolve({ ok: false, versao: 1, modo: "REAL", mensagem: "Muitos pedidos seguidos.", erro: { codigo: "limite_de_uso" } }),
    invalida: () => Promise.resolve({ ok: false, versao: 1, modo: "REAL", id: "uso-7", estado: "concluido", mensagem: "A resposta da IA veio incompleta.", erro: { codigo: "resposta_invalida" }, consumo: { estimado_rac_usd: 0.02 } }),
    rede: () => Promise.reject(new Error("Failed to fetch")), tempo: () => new Promise(() => {}),
    consumidaSemUso: () => Promise.resolve({ ok: false, versao: 1, modo: "REAL", id: "uso-8", estado: "concluido", mensagem: "A IA não quis ler.", erro: { codigo: "recusado" } }),
  };
  const R = {};
  for (const [k, f] of Object.entries(cenarios)) { const s = telaSite({ resp: RESP, jsons: JSONS, racIA: f }); s.ctx.HOJE_IA_PRAZO = 30; s.ctx.renderHoje(); await fluxo(); const tela = s.alvos["#rachoje-view"];
    botao(tela, "Analisar o dia").onclick(); botao(tela, "Confirmar e chamar a IA").onclick(); await espera(120); R[k] = tela.textContent; }
  assert.ok(R.concluida.includes("Chamada concluída e análise disponível"));
  assert.ok(R.repetida.includes("Pedido repetido") && /já tinha sido processado antes/.test(R.repetida) && /não informa se aquela primeira chamada foi cobrada/.test(R.repetida) && /não dá para recuperá-la/.test(R.repetida));
  assert.ok(R.andamento.includes("Chamada em andamento.") && /ainda está sendo processado/.test(R.andamento));
  assert.ok(R.antes.includes("Falha antes do envio") && R.antes.includes("Sem cobrança: o servidor recusou o pedido antes de reservar a chamada"));
  assert.ok(R.invalida.includes("Resposta inválida da IA") && /não virou análise/.test(R.invalida) && /provavelmente foi cobrada/.test(R.invalida));
  assert.ok(R.rede.includes("Falha de rede: cobrança desconhecida") && /Não dá para afirmar se houve cobrança/.test(R.rede) && !/Sem cobrança/.test(R.rede));
  assert.ok(R.tempo.includes("Resultado incerto") && /Não dá para afirmar se houve cobrança/.test(R.tempo));
  assert.ok(R.consumidaSemUso.includes("Chamada concluída, resultado não recuperável") && /Não dá para afirmar se houve cobrança/.test(R.consumidaSemUso) && !/Sem cobrança/.test(R.consumidaSemUso), "o servidor usou a chave mas não informou custo: nem cobrança nem ausência é afirmada");
  for (const k of ["rede", "tempo", "andamento", "repetida", "consumidaSemUso"]) assert.ok(!/foi cobrada\b/.test(R[k].replace(/provavelmente foi cobrada/g, "").replace(/não informa se aquela primeira chamada foi cobrada/g, "").replace(/se houve cobrança/g, "")), k + ": não afirma cobrança");
  assert.ok(!/Sem cobrança/.test(R.invalida) && !/Sem cobrança/.test(R.repetida) && !/Sem cobrança/.test(R.andamento));
  /* falha antes de sair do navegador (racIA lança sem chamar a rede): nada foi enviado, e isso é dito */
  const mem = {}, a = site({ resp: RESP, jsons: JSONS, mem, racIA: () => { throw new Error("SB indisponível"); } }); const ra = await a.ctx.hojeAnalisar();
  assert.deepEqual([ra.ok, ra.codigo, ra.situacao, ra.cobranca], [false, "antes_do_envio", "livre", "nenhuma"]); assert.match(ra.motivo, /Nada saiu do navegador/); assert.equal(Object.keys(JSON.parse(mem[REG] || "{}")).length, 0);
  assert.equal(site({ resp: RESP, jsons: JSONS }).ctx.hojeCobrancaTxt("provavel").includes("provavelmente"), true);
});

/* ---- R5: dados antigos não parecem atuais */
test("R5: o selo de cada fonte separa 'Dados recentes' (data conferida ou registro de hoje) de 'Leitura realizada'; mostra a data e há quanto tempo; avisa quando falta origem ou data", async () => {
  const s = telaSite({ resp: { ...RESP, compras: [{ data: "2026-10-17", valor_total: 120 }], pedidos: [{ data: "2026-11-10", total_pago: 30 }], compras_online: [{ data: "2026-10-20", loja: "X", total_pago: 10 }] }, jsons: JSONS, extra: { Date: class extends Date { constructor(...x) { x.length ? super(...x) : super(AGORA); } static now() { return AGORA; } } } }); /* relógio fixo em AGORA: o teste não depende mais da hora real em que roda */
  s.ctx.renderHoje(); await fluxo(); const tela = s.alvos["#rachoje-view"];
  const linha = (nome) => varre(tela, (e) => e.tagName === "LI" && e.textContent.includes(nome) && /hjfontes|Leitura|Dados|Falhou|Sem dados|Desatualizada/.test(e.textContent))[0];
  const selo = (nome) => varre(linha(nome), (e) => /hjtag/.test(e.className))[0];
  const merc = linha("Mercado"); assert.ok(merc.textContent.includes("último registro em 17/10/2026 (há 24 dias)"), merc.textContent); assert.match(selo("Mercado").className, /hje-lida/); assert.equal(selo("Mercado").textContent, "Leitura realizada");
  assert.ok(!/hje-ok/.test(selo("Mercado").className), "registro de semanas atrás não é verde");
  assert.ok(linha("Alimentação").textContent.includes("último registro em 10/11/2026 (hoje)")); assert.match(selo("Alimentação").className, /hje-ok/); assert.equal(selo("Alimentação").textContent, "Dados recentes");
  assert.match(selo("Compras online").className, /hje-lida/); assert.ok(linha("Compras online").textContent.includes("(há 21 dias)"));
  assert.ok(/Notícias de Sorocaba/.test(linha("Notícias de Sorocaba").textContent) && /hje-ok/.test(selo("Notícias de Sorocaba").className) && linha("Notícias de Sorocaba").textContent.includes("dado de"), "data própria conferida");
  assert.ok(linha("Agenda").textContent.includes("data não disponível: a leitura foi concluída, mas não se sabe a idade dos dados")); assert.match(selo("Agenda").className, /hje-lida/);
  assert.ok(linha("Orçamentos").textContent.includes("sem dados") || linha("Orçamentos").textContent.includes("Sem dados"));
  const t = tela.textContent; assert.ok(t.includes("o dado pode ser de semanas atrás")); assert.ok(!/limite de \d+ (dias|semanas)/.test(t), "nenhum limite novo inventado");
  /* origem ausente: dito */
  const info = site({ resp: RESP, jsons: JSONS }).ctx.hjInfoFonte; assert.match(info({ estado: "ok", origem: null, ultimo: null, quando: null }, HOJE), /origem não informada · data não disponível/);
  assert.match(info({ estado: "ok", origem: "banco", ultimo: "2026-11-09" }, HOJE), /último registro em 09\/11\/2026 \(ontem\)/);
});

/* ---- R6: o que é fonte útil */
test("R6: Vagas, notícias, esporte, tempo e Newsletter (sozinhos ou juntos) não bastam; fontes pessoais, mesmo sem data própria, bastam; falha parcial não bloqueia", async () => {
  const est = (o) => N.hojeEstadoFontes(o, AGORA);
  const vagas = { ok: true, v: { vagas: [{ id: "v1" }] }, quando: "2026-11-10T09:00:00Z" };
  const so = N.hojeFontesUteis(est({ vagas })); assert.equal(so.ok, false, "Vagas isoladamente não basta"); assert.match(so.motivo, /Nenhuma fonte com os seus dados pessoais/); assert.match(so.motivo, /Vagas, notícias, esporte, tempo e Newsletter/);
  const publicas = N.hojeFontesUteis(est({ vagas, noticias: { ok: true, v: [1], quando: "2026-11-10T10:00:00Z" }, esportes: { ok: true, v: "Dodgers" }, tempo: { ok: true, v: "x", quando: "2026-11-10T11:00:00-03:00" }, newsletter: { ok: true, v: {}, quando: "2026-11-10T09:00:00Z" } }));
  assert.equal(publicas.ok, false, "todas as públicas juntas também não");
  assert.deepEqual([...N.HOJE_PESSOAIS].sort(), ["agenda", "alimentacao", "compras", "mba", "mercado", "orcamentos", "saude", "tarefas"]); assert.ok(!N.HOJE_PESSOAIS.includes("vagas"));
  for (const k of N.HOJE_PESSOAIS) { const u = N.hojeFontesUteis(est({ vagas, [k]: { ok: true, v: [1] } })); assert.equal(u.ok, true, k + " sem data própria conta, se a leitura e os dados são válidos"); assert.deepEqual(plano(u.uteis), [N.HOJE_FONTES[k]]); }
  const parcial = N.hojeFontesUteis(est({ agenda: { ok: true, v: [1], parcial: true, falhas: ["registros: x"] }, mercado: { ok: false, erro: "x" }, tarefas: { ok: false, erro: "y" } }));
  assert.deepEqual([parcial.ok, plano(parcial.parciais)], [true, ["Agenda"]], "falhas de outras fontes não bloqueiam quando uma pessoal serve");
  /* na prática: só Vagas (e contexto público) → nada é chamado; com uma fonte pessoal → chama */
  const ia = iaTeste(); ia.modo = "ok";
  const so2 = site({ ...SEM_NADA(), jsons: JSONS, extra: { VG: { all: [{ id: "v1", t: "Analista SQL", e: "X", d: 1 }], coletado: "2026-11-10T09:00:00Z" }, mbaAulas: () => [] }, racIA: ia.racIA });
  const b = await so2.ctx.hojeAnalisar(); assert.deepEqual([b.ok, b.situacao], [false, "sem_fontes"]); assert.equal(ia.chamadas.length, 0);
  assert.ok(N.hojeEstadoFontes((await so2.ctx.hojeColetar()).fontes, AGORA).find((x) => x.k === "vagas").estado === "ok", "Vagas foi lida e está ok: só não conta como dado pessoal");
  const com = site({ ...SEM_NADA(), resp: { ...SEM_NADA().resp, lista: [{ id: "t1", item: "Ligar no banco", criado: "2026-11-01" }] }, jsons: JSONS, extra: { VG: { all: [{ id: "v1", t: "Analista SQL", e: "X", d: 1 }], coletado: "2026-11-10T09:00:00Z" }, mbaAulas: () => [] }, racIA: ia.racIA });
  assert.equal((await com.ctx.hojeAnalisar()).ok, true); assert.equal(ia.chamadas.length, 1);
});

/* ---- R7: troca de proprietário sem logout */
test("R8: Fato (segundo a IA), Inferência e Recomendação são neutros e se distinguem pelo texto; verde e estados de falha/desatualização ficam para o que o sistema conferiu", async () => {
  const s = telaSite({ resp: RESP, jsons: JSONS, racIA: () => Promise.resolve(respostaReal()) }); s.ctx.renderHoje(); await fluxo(); const tela = s.alvos["#rachoje-view"];
  botao(tela, "Analisar o dia").onclick(); botao(tela, "Confirmar e chamar a IA").onclick(); await fluxo();
  const tag = (txt) => varre(tela, (e) => /hjtag/.test(e.className) && e.textContent === txt);
  const fato = tag("Fato (segundo a IA)")[0], inf = tag("Inferência (da IA)"), sug = tag("Recomendação da IA")[0];
  assert.ok(fato && /hjn-fato/.test(fato.className) && !/hje-ok/.test(fato.className), "o fato segundo a IA não usa o selo verde do sistema");
  assert.ok(inf.length >= 1 && inf.every((e) => /hjn-inf/.test(e.className))); assert.ok(sug && /hjn-sug/.test(sug.className));
  assert.ok(!varre(tela, (e) => /hjtag/.test(e.className) && /hjn-/.test(e.className) && /hje-ok|hje-falhou|hje-desatualizada/.test(e.className)).length);
  assert.ok(fato.attrs.title.includes("própria IA") && sug.attrs.title.includes("Sugestão da IA"), "cada selo explica o que é");
  assert.ok(!tag("Sugestão").length && !tag("Inferência").length, "os rótulos curtos antigos saíram");
  /* o CSS: só o que o sistema conferiu é verde; o resto tem regra própria e quebra em telas pequenas */
  const css = ler("index.html"), regra = (sel) => css.split("\n").flatMap((l) => l.split("}")).filter((r) => r.includes(sel));
  const verde = regra(".hje-ok").find((r) => r.includes("var(--c-mercado)")); assert.ok(verde && !/hjn-/.test(verde), "hjn-* fora do grupo verde");
  assert.ok(regra(".hjn-fato").every((r) => !r.includes("var(--c-mercado)") && !r.includes("var(--c-inicio)")) && regra(".hjn-inf").every((r) => !r.includes("var(--c-inicio)")), "nem verde nem a cor de estimativa");
  assert.ok(/\.hjn-sug\{border-style:dotted\}/.test(css) && /\.hjn-inf\{border-style:dashed\}/.test(css) && /\.hje-parcial\{/.test(css) && /\.hje-falhou/.test(css) && /\.hje-desatualizada/.test(css), "estados próprios");
  assert.match(css, /\.hjtags\{flex-direction:row;flex-wrap:wrap\}\.hjtag\{white-space:normal;max-width:100%;overflow-wrap:anywhere\}/, "em tela pequena o selo quebra em vez de estourar");
});

/* ---- R9: duas abas */

/* ================================================================ Etapa 4: privacidade, concorrência, persistência e interface entre abas
   O QUE ESTES TESTES SÃO: a lógica real de js/hoje.js e o código real de js/app.js (extraído do arquivo) rodando num ambiente falso.
   O QUE ELES NÃO SÃO: concorrência real. Os "navegadores" abaixo rodam na MESMA thread; o Web Locks é simulado (novosLocks/navegador, acima) com a semântica
   documentada (exclusivo, ifAvailable), e o localStorage é um objeto compartilhado. Provam que o site faz a coisa certa DADO que o Web Locks funciona como
   documentado; a exclusão em si é do navegador e não foi exercitada aqui. */
const appTrecho = () => { const app = ler("js/app.js"), i = app.indexOf("  var HOJE_LOCAL_PREFIXO"), j = app.indexOf("  /* Dados pessoais: um JSON por chave"); assert.ok(i > 0 && j > i, "a limpeza está no app.js"); return app.slice(i, j); };
/* localStorage enumerável (como o do navegador) sobre o mesmo objeto de memória */
const lsDe = (mem) => { const base = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
  return new Proxy(base, { ownKeys: () => [...Object.keys(mem), "getItem", "setItem", "removeItem"], getOwnPropertyDescriptor: (t, k) => ({ enumerable: !["getItem", "setItem", "removeItem"].includes(k), configurable: true, value: t[k] }) }); };
const comApp = (s, mem) => { s.ctx.localStorage = lsDe(mem); vm.runInContext(appTrecho(), s.ctx, { filename: "app.js (limpeza)" }); return s; };
const PERG = "quanto gastei com remédio da Olivia?";

/* ---- 1. Privacidade */
test("E4/1: logout e troca de conta removem pergunta, rótulo, pedido e fatos; ficam só os metadados que impedem cobrança duplicada", async () => {
  const ia = iaTeste(), mem = {};
  const s = comApp(site({ resp: RESP, jsons: JSONS, racIA: ia.racIA, mem }), mem); s.ctx.HOJE_IA_PRAZO = 30;
  const r = await s.ctx.hojeAnalisar({ pergunta: PERG }); assert.equal(r.codigo, "tempo_esgotado");
  const chave = ia.chamadas[0][4], antes = JSON.parse(mem[REG])[chave];
  assert.ok(antes.pergunta === PERG && antes.rotulo.includes("remédio") && antes.entrada.texto.length > 100, "antes da limpeza o registro tem o conteúdo");
  Object.assign(mem, { [CAC]: JSON.stringify({ k: { chave: "k", resultado: boa() } }), [TRA]: "{}", "rac-hoje-ia:dono-2": "{}", "rac-hoje-ia-pend:dono-2": JSON.stringify({ z: { chave: "z", estado: "incerta", pergunta: "outra conta", rotulo: "Pergunta: outra conta", entrada: { texto: "x" }, snap: {} } }),
    "rac-hoje-ia": "legado", "rac-hoje-ia-pend": JSON.stringify({ y: { chave: "y", pergunta: "legado", entrada: { texto: "x" } } }), "rac-hoje-ia-tent": "{}", "rac-p-lista": "dado de outro módulo", "rac-gm-x": "token de outra função" });
  const tentAntes = mem[TEN]; s.ctx.hojeLimparLocal(); /* o que o botão Sair, a entrada como casa e a sessão expirada chamam */
  const dep = JSON.parse(mem[REG])[chave];
  for (const k of ["chave", "estado", "quando", "codigo", "id", "cobranca", "estimado", "estadoServidor", "intencao", "hoje"]) assert.deepEqual(dep[k], antes[k], k + " fica (idempotência)");
  assert.deepEqual([dep.pergunta, dep.entrada, dep.snap, dep.semConteudo], ["", null, null, true]); assert.equal(dep.rotulo, "Chamada anterior (conteúdo removido)");
  assert.ok(!/remédio|Olivia|<fato|outra conta|legado/.test(mem[REG] + mem["rac-hoje-ia-pend:dono-2"] + mem["rac-hoje-ia-pend"]), "nenhum texto pessoal sobra, de nenhuma conta");
  assert.equal(mem[TEN], tentAntes, "o contador de tentativas (só hash) fica: apagá-lo faria a 'nova análise' reaproveitar uma chave já usada");
  for (const k of [CAC, TRA, "rac-hoje-ia:dono-2", "rac-hoje-ia", "rac-hoje-ia-tent"]) assert.equal(mem[k], undefined, k + " saiu");
  assert.ok(!/legado/.test(mem["rac-hoje-ia-pend"]), "o registro legado (sem conta) também perdeu o conteúdo");
  assert.equal(mem["rac-p-lista"], "dado de outro módulo"); assert.equal(mem["rac-gm-x"], "token de outra função");
  /* a chamada incerta continua impedindo repetição e nova chave involuntária, mas sem reenvio (o pedido saiu) */
  const s2 = site({ resp: RESP, jsons: JSONS, racIA: ia.racIA, mem }); const p = s2.ctx.RAChoje.pendencias()[0];
  assert.deepEqual([p.chave, p.podeReenviar, p.situacao, p.cobranca], [chave, false, "incerta", "incerta"]); assert.match(p.motivo, /não é oferecido/);
  const b = await s2.ctx.hojeAnalisar({ pergunta: PERG }); assert.equal(b.bloqueada, true); assert.equal(ia.chamadas.length, 1, "nenhuma chamada nova");
  assert.equal(JSON.stringify(JSON.parse(mem[REG])[chave]), JSON.stringify(dep), "e o registro não foi tocado");
  assert.equal((await s2.ctx.hojeAnalisar({ reenviar: true, chave })).bloqueada, true); assert.equal(ia.chamadas.length, 1, "sem o pedido, nem o reenvio sai");
  /* nova análise explícita: continua a contagem (não reinicia) */
  s2.ctx.HOJE_IA_PRAZO = 30; await s2.ctx.hojeAnalisar({ pergunta: PERG, nova: true }); assert.equal(ia.chamadas.length, 2); assert.equal(ia.chamadas[1][4], chave + "-1");
});

test("E4/1: a troca de identidade é tratada na hora (app.js, ao entrar), sem esperar o RAC Hoje abrir; todos os caminhos de saída limpam", async () => {
  const app = ler("js/app.js");
  assert.match(app, /if\(!ses\)\{hojeLimparLocal\(\);mostrarGate/, "sem sessão: nada do RAC Hoje fica à vista");
  assert.match(app, /EU=ses\.user;hojeAoEntrar\(EU\.id\);/, "ao entrar com uma conta");
  assert.match(app, /sair\.onclick=function\(\)\{hojeLimparLocal\(\);SB\.auth\.signOut/, "Sair no passo do código");
  assert.match(app, /hojeLimparLocal\(\);\s*SB\.auth\.signOut\(\)\.then\(function\(\)\{location\.reload\(\)\}\)\}\);/, "botão Sair");
  assert.match(app, /if\(PAPEL!=="dono"\)\{hojeLimparLocal\(\);return\}/, "entrar como casa");
  const ia = iaTeste(), mem = {}, s = comApp(site({ resp: RESP, jsons: JSONS, racIA: ia.racIA, mem }), mem); s.ctx.HOJE_IA_PRAZO = 30;
  await s.ctx.hojeAnalisar({ pergunta: PERG }); const chave = ia.chamadas[0][4];
  mem[CAC] = JSON.stringify({ k: { chave: "k", resultado: boa(), quando: iso(1e3), hoje: HOJE, fatos: [] } }); s.ctx.HOJE.mem = { k: { chave: "k" } };
  assert.equal(s.ctx.RAChoje.historico().length, 1);
  /* a conta B entra sem Sair: só chamamos o que o app.js chama ao entrar; nenhuma tela do RAC Hoje é aberta */
  s.ctx.EU = { id: "dono-2" }; s.ctx.hojeAoEntrar("dono-2");
  assert.equal(mem[CAC], undefined, "o histórico de A saiu na hora"); assert.deepEqual(plano(s.ctx.HOJE.mem), {}, "e a memória da página");
  const r = JSON.parse(mem[REG])[chave]; assert.deepEqual([r.pergunta, r.entrada, r.estado], ["", null, "incerta"], "o registro de A fica sem conteúdo");
  assert.equal(s.ctx.HOJE.uid, "dono-2"); assert.deepEqual(plano(s.ctx.RAChoje.pendencias()), [], "B não vê a chamada de A"); assert.deepEqual(plano(s.ctx.RAChoje.historico()), []);
  /* B grava o seu; ao A voltar, as contas continuam separadas */
  ia.modo = "ok"; assert.equal((await s.ctx.hojeAnalisar({ pergunta: "pergunta da B" })).ok, true);
  assert.ok(mem["rac-hoje-ia:dono-2"] && !/pergunta da B/.test(mem[REG]), "o que B grava não vai para A");
  s.ctx.EU = { id: "dono-1" }; s.ctx.hojeAoEntrar("dono-1");
  assert.equal(mem["rac-hoje-ia:dono-2"], undefined, "ao A entrar, o conteúdo de B sai"); assert.equal(s.ctx.RAChoje.pendencias().length, 1); assert.equal(s.ctx.RAChoje.historico().length, 0);
  /* sem id de conta nada é lido nem gravado; a casa continua sem acesso */
  s.ctx.EU = null; assert.deepEqual(plano(s.ctx.RAChoje.pendencias()), []); assert.equal(s.ctx.hojeGuardarLocal("rac-hoje-ia", {}), false);
  const casa = site({ resp: RESP, jsons: JSONS, dono: false, racIA: ia.racIA }); await assert.rejects(casa.ctx.hojeAnalisar(), /só da conta do dono/);
});

/* ---- 2. Concorrência */
test("E4/2: com Web Locks (simulado) duas abas pedindo novas análises ao mesmo tempo fazem UMA chamada; a outra é bloqueada e diz por quê, sem contar tentativa nem criar chave", async () => {
  const ia = iaTeste(), mem = {}, reg = novosLocks();
  const A = site({ resp: RESP, jsons: JSONS, racIA: ia.racIA, mem, locks: reg }), B = site({ resp: RESP, jsons: JSONS, racIA: ia.racIA, mem, locks: reg }); A.ctx.HOJE_IA_PRAZO = 40; B.ctx.HOJE_IA_PRAZO = 40;
  const r = await Promise.all([A.ctx.hojeAnalisar({ nova: true }), B.ctx.hojeAnalisar({ nova: true })]);
  assert.equal(ia.chamadas.length, 1, "uma chamada só"); const bloq = r.filter((x) => x.codigo === "outra_aba"), env = r.filter((x) => x.codigo === "tempo_esgotado");
  assert.equal(bloq.length, 1); assert.equal(env.length, 1);
  assert.deepEqual([bloq[0].semEnvio, bloq[0].situacao, bloq[0].cobranca], [true, "em_curso", "nenhuma"]); assert.match(bloq[0].motivo, /Outra aba deste aparelho está processando uma análise/);
  assert.equal(Object.values(JSON.parse(mem[TEN]))[0], 1, "o contador subiu uma vez, não duas"); assert.equal(ia.chamadas[0][4].endsWith("-1"), true);
  assert.equal(reg.presos.size, 0, "o bloqueio foi solto ao fim da chamada");
  /* a aba bloqueada não deixa rastro: mesmo estado do armazenamento antes e depois de uma tentativa bloqueada */
  reg.presos.add("rac-hoje-ia:dono-1"); const foto = JSON.stringify(mem); const x = await B.ctx.hojeAnalisar({ nova: true }); reg.presos.delete("rac-hoje-ia:dono-1");
  assert.equal(x.codigo, "outra_aba"); assert.equal(JSON.stringify(mem), foto, "nenhuma chave, contador ou registro foi criado pela tentativa bloqueada"); assert.equal(ia.chamadas.length, 1, "e nada foi repetido");
});

test("E4/2: nova análise × reenvio × em andamento × incerto após timeout: cada um se comporta de um jeito, e o bloqueio só cobre a chamada em voo", async () => {
  const ia = iaTeste(), mem = {}, reg = novosLocks();
  const mk = () => { const s = site({ resp: RESP, jsons: JSONS, racIA: ia.racIA, mem, locks: reg }); s.ctx.HOJE_IA_PRAZO = 60; return s; }, A = mk(), B = mk();
  /* em andamento: A está no ar; B é bloqueada pelo bloqueio E o registro "enviada" aparece para B */
  const pa = A.ctx.hojeAnalisar(); await espera(15);
  const emAndamento = await B.ctx.hojeAnalisar(); assert.equal(emAndamento.codigo, "outra_aba"); assert.equal(ia.chamadas.length, 1);
  assert.equal(B.ctx.RAChoje.pendencias()[0].situacao, "em_curso", "B enxerga a chamada em andamento no armazenamento compartilhado");
  const rea = await B.ctx.hojeAnalisar({ reenviar: true, chave: ia.chamadas[0][4] }); assert.equal(rea.codigo, "outra_aba", "reenviar também espera: não há duas chamadas ao mesmo tempo"); assert.equal(ia.chamadas.length, 1);
  /* incerto após o timeout: o bloqueio foi solto, mas o REGISTRO continua segurando a mesma análise */
  const ta = await pa; assert.equal(ta.codigo, "tempo_esgotado"); assert.equal(reg.presos.size, 0); const chave = ia.chamadas[0][4];
  const incerta = await B.ctx.hojeAnalisar(); assert.deepEqual([incerta.bloqueada, incerta.situacao, incerta.codigo, incerta.chave, incerta.podeReenviar, incerta.podeNova], [true, "incerta", "tempo_esgotado", chave, true, true]);
  assert.equal(ia.chamadas.length, 1, "sem chamada nova e sem chave nova");
  /* reenvio da MESMA tentativa: mesma chave, não conta tentativa */
  ia.modo = "repetida"; const re = await B.ctx.hojeAnalisar({ reenviar: true, chave }); assert.equal(ia.chamadas.length, 2); assert.equal(ia.chamadas[1][4], chave); assert.equal(mem[TEN], undefined, "nenhuma tentativa contada");
  assert.deepEqual([re.situacao, re.codigo, re.podeReenviar, re.podeNova], ["consumida", "repetida", false, true]);
  /* nova análise: só por escolha explícita, depois que a anterior está encerrada (aqui: resolvida como repetida); outra chave, contada uma vez */
  ia.modo = "ok"; const nova = await A.ctx.hojeAnalisar({ nova: true }); assert.equal(nova.ok, true); assert.equal(ia.chamadas[2][4], chave + "-1"); assert.equal(Object.values(JSON.parse(mem[TEN]))[0], 1);
  assert.equal(reg.presos.size, 0);
});

/* ================================================================ Etapa 5: Web Locks obrigatório e sessão em outra aba
   SIMULADO × REAL. Tudo abaixo roda na MESMA thread, num ambiente falso: o Web Locks é o simulado de cima (mesma semântica documentada: exclusivo, ifAvailable) e
   a "outra aba" é um evento 'storage' entregue à mão ao listener que o site registrou. Prova a lógica do site em cima dessas semânticas. NÃO prova a exclusão
   real do navegador nem que o Supabase grava/apaga "rac-mercado-auth" e dispara o evento entre abas de verdade: isso não foi exercitado em navegadores reais. */
const AUTH = "rac-mercado-auth";
const sessaoDe = (id) => JSON.stringify({ access_token: "tok-" + id, refresh_token: "r", user: { id, email: id + "@x" } });
const semLocks = () => ({ resp: RESP, jsons: JSONS });

/* ---- 1. Concorrência: Web Locks é obrigatório */
test("E5/1: sem navigator.locks a chamada paga NÃO sai; nada é criado, contado nem gravado, e o motivo é dito", async () => {
  const ia = iaTeste(), mem = {};
  for (const nav of [undefined, {}, { locks: {} }, { locks: { request: "não é função" } }]) {
    const s = site({ ...semLocks(), racIA: ia.racIA, mem, locks: false, extra: nav ? { navigator: nav } : {} });
    for (const o of [{}, { nova: true }, { pergunta: "e agora?" }]) {
      const r = await s.ctx.hojeAnalisar(o);
      assert.deepEqual([r.ok, r.bloqueada, r.semEnvio, r.codigo, r.situacao, r.cobranca], [false, true, true, "sem_web_locks", "sem_protecao", "nenhuma"]);
      assert.match(r.motivo, /não oferece a proteção necessária/); assert.match(r.motivo, /iniciar uma análise com segurança/); assert.match(r.motivo, /nenhuma chave nova nem tentativa foi criada/);
    }
  }
  assert.equal(ia.chamadas.length, 0, "nenhuma chamada paga"); assert.deepEqual(mem, {}, "nenhuma chave, contador, registro ou reserva foi gravado");
});

test("E5/1: sem Web Locks não nasce chave nova nem sobe o contador; o registro incerto e o contador existentes ficam como estavam, e o reenvio também espera", async () => {
  const ia = iaTeste(), mem = { [REG]: JSON.stringify({ a: regInc("a", iso(5e6)) }), [TEN]: JSON.stringify({ base: 3 }) };
  const antes = JSON.stringify(mem), s = site({ ...semLocks(), racIA: ia.racIA, mem, locks: false });
  for (const o of [{ nova: true }, { nova: true, pergunta: "x" }, { reenviar: true, chave: "a" }, {}]) { const r = await s.ctx.hojeAnalisar(o); assert.equal(r.semEnvio, true, JSON.stringify(o)); assert.equal(ia.chamadas.length, 0); }
  assert.equal(JSON.stringify(mem), antes, "armazenamento idêntico: contador, registro e chaves intactos");
  assert.match((await s.ctx.hojeAnalisar({ reenviar: true, chave: "a" })).motivo, /o registro da chamada anterior continua como estava/);
  assert.ok(!/hojeTravar|hojeDestravar|HOJE_TRAVA_VIDA|setInterval/.test(ler("js/hoje.js")), "a reserva por localStorage não existe mais (nem batimento)");
});

test("E5/1: se o navegador falha ao entregar o bloqueio (exceção ou promessa recusada antes de rodar), a chamada é bloqueada, sem fallback", async () => {
  const mem = {};
  for (const request of [() => { throw new Error("SecurityError"); }, () => Promise.reject(new Error("NotSupportedError")), (n, o, cb) => Promise.reject(new DOMException("InvalidStateError"))]) {
    const ia = iaTeste(); ia.modo = "ok";
    const s = site({ ...semLocks(), racIA: ia.racIA, mem, locks: false, extra: { navigator: { locks: { request } } } });
    const r = await s.ctx.hojeAnalisar({ nova: true });
    assert.deepEqual([r.semEnvio, r.codigo], [true, "sem_web_locks"]); assert.equal(ia.chamadas.length, 0); assert.equal(s.ctx.HOJE.emVoo, false, "nada ficou marcado como em voo");
  }
  assert.deepEqual(mem, {}, "e nada foi gravado");
  /* um erro DEPOIS de o bloqueio ser entregue é da própria análise: segue como antes (não vira 'sem proteção') */
  const ia = iaTeste(); ia.racIA = () => { throw new Error("falha local"); };
  const t = site({ ...semLocks(), racIA: ia.racIA, mem: {}, locks: false, extra: { navigator: { locks: { request: (n, o, cb) => Promise.resolve().then(() => cb({ name: n })) } } } });
  assert.equal((await t.ctx.hojeAnalisar()).codigo, "antes_do_envio");
});

test("E5/1: a segunda aba é bloqueada na hora enquanto a primeira mantém o bloqueio: sem espera, sem repetição automática, sem rastro", async () => {
  const ia = iaTeste(), mem = {}, reg = novosLocks();
  const A = site({ ...semLocks(), racIA: ia.racIA, mem, locks: reg }), B = site({ ...semLocks(), racIA: ia.racIA, mem, locks: reg }); A.ctx.HOJE_IA_PRAZO = 200; B.ctx.HOJE_IA_PRAZO = 200;
  const pa = A.ctx.hojeAnalisar({ nova: true }); await espera(15);
  assert.ok(reg.presos.has("rac-hoje-ia:dono-1"), "o bloqueio está preso durante toda a chamada em voo"); assert.equal(ia.chamadas.length, 1);
  const foto = JSON.stringify(mem), t0 = Date.now(), b = await B.ctx.hojeAnalisar({ nova: true });
  assert.ok(Date.now() - t0 < 100, "B respondeu na hora: não ficou esperando o bloqueio"); assert.deepEqual([b.codigo, b.semEnvio, b.cobranca], ["outra_aba", true, "nenhuma"]);
  assert.equal(JSON.stringify(mem), foto, "B não criou chave, contador nem registro"); assert.equal((await B.ctx.hojeAnalisar({ reenviar: true, chave: ia.chamadas[0][4] })).codigo, "outra_aba");
  await espera(120); assert.equal(ia.chamadas.length, 1, "nenhuma repetição automática depois"); assert.ok(reg.presos.has("rac-hoje-ia:dono-1"), "e o bloqueio de A continua preso");
  assert.equal(reg.presos.size, 1); void pa;
});

test("E5/1: o bloqueio é solto depois da conclusão", async () => {
  const ia = iaTeste(), mem = {}, reg = novosLocks(); const lenta = (...a) => { ia.chamadas.push(a); return new Promise((r) => setTimeout(() => r(respostaReal()), 60)); };
  const s = site({ ...semLocks(), racIA: lenta, mem, locks: reg }); const p = s.ctx.hojeAnalisar({ nova: true }); await espera(25); assert.equal(reg.presos.size, 1, "preso enquanto roda"); assert.equal(ia.chamadas.length, 1);
  const r = await p; assert.equal(r.ok, true); assert.equal(reg.presos.size, 0, "solto ao concluir"); assert.equal(s.ctx.HOJE.emVoo, false);
  assert.equal((await s.ctx.hojeAnalisar({ nova: true })).ok, true, "e a próxima nova análise consegue o bloqueio"); assert.equal(reg.presos.size, 0);
});

test("E5/1: o bloqueio é solto depois de falha de rede ou de tempo esgotado, e o registro incerto continua impedindo a mesma análise (liberar o bloqueio não resolve a tentativa)", async () => {
  for (const modo of ["timeout", "rede"]) {
    const ia = iaTeste(), mem = {}, reg = novosLocks(); if (modo === "rede") ia.racIA = (...a) => { ia.chamadas.push(a); return Promise.reject(new Error("Failed to fetch")); };
    const s = site({ ...semLocks(), racIA: ia.racIA, mem, locks: reg }); s.ctx.HOJE_IA_PRAZO = 30;
    const r = await s.ctx.hojeAnalisar(); assert.equal(r.codigo, modo === "timeout" ? "tempo_esgotado" : "rede", modo);
    assert.equal(reg.presos.size, 0, modo + ": bloqueio solto"); assert.equal(s.ctx.HOJE.emVoo, false);
    const chave = ia.chamadas[0][4], reg1 = JSON.parse(mem[REG])[chave]; assert.equal(reg1.estado, "incerta", modo + ": o registro incerto ficou");
    const b = await s.ctx.hojeAnalisar(); assert.deepEqual([b.bloqueada, b.situacao, b.chave, b.semEnvio], [true, "incerta", chave, undefined], modo + ": a mesma análise segue bloqueada pelo REGISTRO");
    assert.equal(ia.chamadas.length, 1, modo + ": nenhuma chamada nova"); assert.equal(mem[TEN], undefined, modo + ": nenhuma chave nova");
    assert.equal(reg.presos.size, 0, modo + ": e a consulta não deixou bloqueio preso");
  }
});

test("E5/1: o reenvio da tentativa original continua usando a chave, o pedido e os dados originais, agora só com Web Locks", async () => {
  const ia = iaTeste(), mem = {}, reg = novosLocks(), resp = { ...RESP };
  const s = site({ resp, jsons: JSONS, racIA: ia.racIA, mem, locks: reg }); s.ctx.HOJE_IA_PRAZO = 30; await s.ctx.hojeAnalisar({ pergunta: PERG });
  const original = JSON.stringify(ia.chamadas[0]), chave = ia.chamadas[0][4], tent = mem[TEN]; resp.compras = [{ data: "2026-11-09", valor_total: 999 }];
  ia.modo = "repetida"; const re = await s.ctx.hojeAnalisar({ reenviar: true, chave });
  assert.equal(ia.chamadas.length, 2); assert.equal(JSON.stringify(ia.chamadas[1]), original, "mesma chave, mesmo texto, mesmo contexto"); assert.equal(mem[TEN], tent, "tentativa não contada");
  assert.deepEqual([re.situacao, re.codigo], ["consumida", "repetida"]); assert.equal(reg.presos.size, 0);
  /* sem Web Locks o mesmo reenvio não sai e o registro fica como estava */
  const ia2 = iaTeste(), mem2 = { [REG]: JSON.stringify({ [chave]: JSON.parse(mem[REG])[chave] }) }; const antes = JSON.stringify(mem2);
  const sem = site({ resp, jsons: JSONS, racIA: ia2.racIA, mem: mem2, locks: false }); assert.equal((await sem.ctx.hojeAnalisar({ reenviar: true, chave })).codigo, "sem_web_locks");
  assert.equal(ia2.chamadas.length, 0); assert.equal(JSON.stringify(mem2), antes);
});

test("E5/1: a tela explica o bloqueio por falta de Web Locks e não oferece caminho alternativo", async () => {
  const ia = iaTeste(), t = telaSite({ ...semLocks(), racIA: ia.racIA, locks: false }); t.ctx.renderHoje(); await fluxo(); const tela = t.alvos["#rachoje-view"];
  botao(tela, "Analisar o dia").onclick(); botao(tela, "Confirmar e chamar a IA").onclick(); await fluxo();
  assert.ok(tela.textContent.includes("o navegador não oferece a proteção necessária") && tela.textContent.includes("iniciar uma análise com segurança") && tela.textContent.includes("nada foi enviado por esta tentativa"));
  assert.equal(ia.chamadas.length, 0); assert.ok(!botao(tela, "Reenviar o mesmo pedido") && !botao(tela, "Pedir outra análise"), "nenhum botão pago de saída");
  const d = ler("docs/hoje.md"); assert.match(d, /Web Locks é obrigatório/); assert.ok(!/não é atômica/.test(d.split("Coordenação entre abas")[1].split("## Fontes")[0]), "a doc não descreve mais a reserva por localStorage como mecanismo");
});

/* ---- 2. Logout e troca de conta em outra aba */
/* uma tela do RAC Hoje aberta, com análise guardada, pergunta digitada e um registro incerto, e o listener 'storage' capturado */
async function telaComDados({ dono = true, uid = "dono-1" } = {}) {
  const ia = iaTeste(), mem = {}, ouvintes = []; let nAdd = 0;
  const t = telaSite({ resp: RESP, jsons: JSONS, racIA: ia.racIA, mem, dono, uid, extra: { addEventListener: (ev, f) => { nAdd++; if (ev === "storage") ouvintes.push(f); } } }); comApp(t, mem);
  mem[CAC] = JSON.stringify({ k: { chave: "k", quando: iso(1e3), hoje: HOJE, resultado: boa(), pergunta: "da conta A", consumo: { estimado_rac_usd: 0.01 }, fatos: [] } });
  mem[REG] = JSON.stringify({ z: regInc("z", iso(20e3), { pergunta: PERG, rotulo: "Pergunta: " + PERG }) }); mem[AUTH] = sessaoDe(uid);
  t.ctx.renderHoje(); await fluxo(); const tela = t.alvos["#rachoje-view"]; const campo = varre(tela, (e) => e.tagName === "TEXTAREA")[0];
  return { t, ia, mem, tela, campo, ouvinte: (ev) => ouvintes.forEach((f) => f(ev)), ouvintes, nAdd: () => nAdd };
}

test("E5/2: sair da conta em outra aba esvazia na hora tudo que o RAC Hoje mostrava, e nada é lido ou chamado depois", async () => {
  const c = await telaComDados(); const { t, tela, mem, ia } = c;
  c.campo.value = "pergunta que eu estava digitando"; assert.ok(tela.textContent.includes("Rayner") && tela.textContent.includes("da conta A") && c.campo, "antes: a tela tem dados da conta");
  assert.equal(t.ctx.RAChoje.historico().length, 1);
  const consultas = t.b.log.length; delete mem[AUTH]; c.ouvinte({ key: AUTH, newValue: null, oldValue: sessaoDe("dono-1") });
  assert.equal(varre(tela, (e) => e.tagName === "TEXTAREA").length, 0, "a pergunta digitada saiu da tela"); assert.equal(varre(tela, (e) => e.tagName === "BUTTON").length, 0, "e os botões também");
  for (const m of ["Rayner", "da conta A", "Fontes de informação", "Boleto", "Ligar no banco", PERG, "pergunta que eu estava digitando"]) assert.ok(!tela.textContent.includes(m), "não sobra na tela: " + m);
  assert.ok(tela.textContent.includes("Você saiu da conta em outra aba")); assert.equal(t.ctx.HOJE.suspenso.motivo, "saiu");
  const H = t.ctx.HOJE, J = t.ctx.HJ; assert.deepEqual([H.coleta, H.quando, H.prom, H.pendMem, H.uid, plano(H.ia), plano(H.mem), plano(H.fila)], [null, 0, null, null, null, {}, {}, {}], "memória da página zerada");
  assert.deepEqual([J.x, J.sel, J.erro, J.aviso, J.ocupado, J.corpo, J.slotHist, J.slotPend, J.slotAviso, J.cfg], [null, null, null, "", false, null, null, null, null, undefined], "estado da tela zerado");
  assert.deepEqual(plano(t.ctx.RAChoje.historico()), []); assert.deepEqual(plano(t.ctx.RAChoje.pendencias()), []);
  /* o aparelho: só os metadados de segurança ficam */
  assert.equal(mem[CAC], undefined, "a análise guardada saiu"); const r = JSON.parse(mem[REG]).z; assert.deepEqual([r.pergunta, r.entrada, r.snap, r.chave, r.estado], ["", null, null, "z", "incerta"], "o registro incerto fica, sem o conteúdo");
  assert.ok(!/remédio|Olivia|<fato/.test(mem[REG]));
  /* nada mais lê, grava ou chama */
  await assert.rejects(t.ctx.hojeAnalisar({ nova: true }), /Você saiu da conta em outra aba/); await assert.rejects(t.ctx.hojeColetar(true), /Você saiu da conta/); assert.throws(() => t.ctx.RAChoje.excluir("k"), /Você saiu da conta/);
  t.ctx.renderHoje(); await fluxo(); assert.ok(tela.textContent.includes("Você saiu da conta em outra aba") && !tela.textContent.includes("Rayner"), "reabrir a tela não traz nada de volta");
  assert.equal(t.b.log.length, consultas, "nenhuma leitura do banco depois do logout"); assert.equal(ia.chamadas.length, 0);
});

test("E5/2: uma chamada em voo quando a sessão muda não devolve nada para a memória nem para a tela; o registro incerto e o contador ficam", async () => {
  const c = await telaComDados(); const { t, ia, mem, tela } = c; t.ctx.HOJE_IA_PRAZO = 60; ia.modo = "pendura"; delete mem[REG];
  botao(tela, "Analisar o dia").onclick(); botao(tela, "Confirmar e chamar a IA").onclick(); await espera(40); assert.equal(ia.chamadas.length, 1);
  const chave = ia.chamadas[0][4]; assert.equal(JSON.parse(mem[REG])[chave].estado, "enviada");
  c.ouvinte({ key: AUTH, newValue: null }); await espera(120);
  assert.equal(JSON.parse(mem[REG])[chave].estado, "enviada", "o registro da chamada continua (vira incerta com o tempo): a cobrança incerta não some"); assert.equal(JSON.parse(mem[REG])[chave].entrada, null, "mas sem o pedido");
  assert.equal(t.ctx.HJ.erro, null, "a resposta de tempo esgotado não foi parar no estado da tela"); assert.deepEqual(plano(t.ctx.HOJE.ia), {}); assert.ok(!tela.textContent.includes("A IA não respondeu"), "nem na tela");
  assert.equal(ia.chamadas.length, 1, "e nada foi repetido");
});

test("E5/2: troca de proprietário em outra aba esconde a conta anterior e NÃO mostra a nova enquanto ela não for confirmada", async () => {
  const c = await telaComDados(); const { t, tela, mem, ia } = c; const B = "dono-2";
  mem["rac-hoje-ia:" + B] = JSON.stringify({ kb: { chave: "kb", quando: iso(1e3), hoje: HOJE, resultado: boa(), pergunta: "da conta B", consumo: {}, fatos: [] } });
  mem["rac-hoje-ia-pend:" + B] = JSON.stringify({ zb: regInc("zb", iso(9e3), { rotulo: "Pergunta: da conta B" }) });
  const consultas = t.b.log.length; mem[AUTH] = sessaoDe(B); c.ouvinte({ key: AUTH, newValue: sessaoDe(B), oldValue: sessaoDe("dono-1") });
  assert.equal(t.ctx.HOJE.suspenso.motivo, "outra_conta"); assert.ok(tela.textContent.includes("Outra conta entrou em outra aba") && tela.textContent.includes("até a nova conta ser confirmada"));
  for (const m of ["Rayner", "da conta A", "da conta B", PERG, "Fontes de informação"]) assert.ok(!tela.textContent.includes(m), "nenhuma das duas contas aparece: " + m);
  assert.equal(varre(tela, (e) => e.tagName === "TEXTAREA").length, 0);
  assert.deepEqual(plano(t.ctx.RAChoje.historico()), [], "a conta nova não recebe dados antes de confirmada (nem os dela)"); assert.deepEqual(plano(t.ctx.RAChoje.pendencias()), []);
  await assert.rejects(t.ctx.hojeAnalisar(), /Outra conta entrou/); assert.equal(t.b.log.length, consultas); assert.equal(ia.chamadas.length, 0);
  /* o aparelho: o conteúdo de A saiu; o da B (outra aba, outro login) NÃO foi apagado; os metadados de A ficam */
  assert.equal(mem[CAC], undefined); assert.ok(mem["rac-hoje-ia:" + B] && JSON.parse(mem["rac-hoje-ia-pend:" + B]).zb.entrada, "o que é da conta nova continua intacto");
  assert.equal(JSON.parse(mem[REG]).z.entrada, null); assert.equal(JSON.parse(mem[REG]).z.chave, "z");
  /* a página NÃO adota a conta nova sozinha, nem se o mesmo evento repetir: continua suspensa */
  c.ouvinte({ key: AUTH, newValue: sessaoDe(B) }); c.ouvinte({ key: AUTH, newValue: sessaoDe("dono-1") }); assert.equal(t.ctx.HOJE.suspenso.motivo, "outra_conta"); assert.equal(t.ctx.HOJE.uid, null);
});

test("E5/2: a nova identidade só recebe dados depois de confirmada pelo app (entrar), e então vê só os dela", async () => {
  const c = await telaComDados(); const { t, tela, mem } = c; const B = "dono-2";
  mem["rac-hoje-ia:" + B] = JSON.stringify({ kb: { chave: "kb", quando: iso(1e3), hoje: HOJE, resultado: boa(), pergunta: "da conta B", consumo: {}, fatos: [] } });
  mem["rac-hoje-ia-pend:" + B] = JSON.stringify({ zb: regInc("zb", iso(9e3), { rotulo: "Pergunta: da conta B" }) });
  c.ouvinte({ key: AUTH, newValue: sessaoDe(B) }); assert.deepEqual(plano(t.ctx.RAChoje.historico()), []);
  /* trocar só o EU (o que o app faria no meio do caminho) NÃO basta: a confirmação é o passo de entrar */
  t.ctx.EU = { id: B }; assert.deepEqual([plano(t.ctx.RAChoje.historico()), plano(t.ctx.RAChoje.pendencias())], [[], []], "sem confirmação, continua sem dados");
  t.ctx.hojeAoEntrar(B); assert.equal(t.ctx.HOJE.suspenso, null); assert.equal(t.ctx.HOJE.uid, B);
  assert.deepEqual(plano(t.ctx.RAChoje.historico().map((a) => a.chave)), ["kb"], "só a análise da B"); assert.deepEqual(plano(t.ctx.RAChoje.pendencias().map((p) => p.chave)), ["zb"], "e só o registro da B");
  assert.ok(!/da conta A/.test(JSON.stringify(t.ctx.RAChoje.historico())), "nada da A");
  t.ctx.renderHoje(); await fluxo(); assert.ok(tela.textContent.includes("da conta B") && !tela.textContent.includes("da conta A") && !tela.textContent.includes("Você saiu") && !tela.textContent.includes("Outra conta entrou"), "a tela volta, com os dados da B");
});

test("E5/2: renovar o token na outra aba (mesmo usuário), chaves de outros módulos e eventos repetidos não apagam nada e não criam listeners nem ciclos", async () => {
  const c = await telaComDados(); const { t, tela, mem, ia } = c; assert.equal(c.nAdd(), 1, "um único addEventListener, mesmo depois de abrir a tela"); t.ctx.renderHoje(); t.ctx.renderHoje(); await fluxo(); assert.equal(c.nAdd(), 1, "reabrir a tela não cria outro");
  const campo = varre(t.alvos["#rachoje-view"], (e) => e.tagName === "TEXTAREA")[0]; campo.value = "digitando"; const foto = JSON.stringify(mem);
  let limpezas = 0; const orig = t.ctx.hojeLimparLocal; t.ctx.hojeLimparLocal = (...a) => { limpezas++; return orig(...a); };
  for (let i = 0; i < 5; i++) c.ouvinte({ key: AUTH, newValue: sessaoDe("dono-1"), oldValue: sessaoDe("dono-1") });
  for (const k of ["rac-mercado-auth-code-verifier", "rac-p-lista", "sb-outra-auth-token"]) c.ouvinte({ key: k, newValue: null }); c.ouvinte(undefined); c.ouvinte({});
  await espera(40); assert.equal(t.ctx.HOJE.suspenso, null, "renovação não suspende"); assert.equal(limpezas, 0); assert.equal(JSON.stringify(mem), foto, "nada gravado nem apagado");
  assert.ok(varre(t.alvos["#rachoje-view"], (e) => e === campo).length === 1 && campo.value === "digitando", "a pergunta digitada continua");
  /* o logout repetido (vários eventos, várias abas) limpa UMA vez e não grava a chave de sessão */
  const authAntes = mem[AUTH]; for (let i = 0; i < 6; i++) c.ouvinte({ key: AUTH, newValue: null }); c.ouvinte({ key: null }); await espera(260);
  assert.equal(limpezas, 1, "limpou uma única vez"); assert.equal(mem[AUTH], authAntes, "o tratamento do evento nunca grava a chave de sessão (sem laço entre abas)"); assert.equal(c.nAdd(), 1); assert.equal(ia.chamadas.length, 0);
  /* eventos de dados já suspensa: ignorados */
  const depois = JSON.stringify(mem); c.ouvinte({ key: REG }); c.ouvinte({ key: CAC }); await espera(260); assert.equal(JSON.stringify(mem), depois);
  const src = ler("js/hoje.js"), m = /function hojeSessaoMudou[\s\S]*?\n  \/\* esvazia/.exec(src)[0]; assert.ok(!/setItem|hojeGuardarLocal|racIA|hojeAnalisar|addEventListener|setTimeout\(/.test(m), "o tratamento da sessão só esvazia: não grava a sessão, não chama a IA, não cria listener");
});

test("E5/2: valor ilegível da sessão e 'limpar tudo' (storage.clear) são tratados como mudança; o armazenamento da conta nova não é tocado no ilegível", async () => {
  const c = await telaComDados(); const { t, mem } = c; mem["rac-hoje-ia:dono-9"] = "{}";
  c.ouvinte({ key: AUTH, newValue: "isso não é JSON" }); assert.equal(t.ctx.HOJE.suspenso.motivo, "outra_conta"); assert.equal(mem["rac-hoje-ia:dono-9"], "{}", "sem saber quem é a conta nova, o armazenamento não é mexido");
  const d = await telaComDados(); d.ouvinte({ key: null }); assert.equal(d.t.ctx.HOJE.suspenso.motivo, "saiu"); assert.equal(d.mem[CAC], undefined);
  const e = await telaComDados(); e.ouvinte({ key: AUTH, newValue: JSON.stringify({ access_token: "x" }) }); assert.equal(e.t.ctx.HOJE.suspenso.motivo, "outra_conta", "sessão sem user.id não é a mesma conta");
});

test("E5/2: a conta da casa continua exatamente como era: mesma tela, nenhum evento a altera, nada é limpo nem gravado", async () => {
  const c = await telaComDados({ dono: false, uid: "casa-1" }); const { t, tela, mem } = c;
  assert.ok(tela.textContent.includes("O RAC Hoje é só da conta do dono.")); const texto = tela.textContent, foto = JSON.stringify(mem);
  let limpezas = 0; const orig = t.ctx.hojeLimparLocal; t.ctx.hojeLimparLocal = (...a) => { limpezas++; return orig(...a); };
  c.ouvinte({ key: AUTH, newValue: null }); c.ouvinte({ key: AUTH, newValue: sessaoDe("outro") }); c.ouvinte({ key: null }); await espera(40);
  assert.equal(t.ctx.HOJE.suspenso, null); assert.equal(limpezas, 0); assert.equal(JSON.stringify(mem), foto); assert.equal(tela.textContent, texto, "a tela da casa não mudou");
  await assert.rejects(t.ctx.hojeAnalisar(), /só da conta do dono/, "a mensagem da casa é a de sempre, não a de sessão"); assert.deepEqual(plano(t.ctx.RAChoje.historico()), []);
  /* o app.js: os caminhos de saída e da casa continuam os de antes, e nada de autenticação foi tocado */
  const app = ler("js/app.js"); assert.match(app, /if\(PAPEL!=="dono"\)\{hojeLimparLocal\(\);return\}/); assert.match(app, /hojeAoEntrar\(EU\.id\)/);
  assert.ok(!/onAuthStateChange/.test(app + ler("js/hoje.js").replace(/\/\*[\s\S]*?\*\//g, "")), "nenhum listener de autenticação foi criado");
  const mer = ler("js/dados.js"); assert.match(mer, /persistSession: true, autoRefreshToken: true, storageKey: "rac-mercado-auth", experimental: \{ passkey: true \}/, "a configuração do Supabase não foi alterada (mora na camada de dados desde a Fase 2 · A1)");
  assert.match(ler("js/hoje.js"), /HOJE_AUTH_CHAVE="rac-mercado-auth"/, "e a chave vigiada é a mesma da configuração");
  const d = ler("docs/hoje.md"); assert.match(d, /Sessão em outra aba/); assert.match(d, /não foi exercitad[oa] em navegadores reais/);
});


test("E4/2: dois toques seguidos na mesma aba continuam sendo UMA chamada (mesmo resultado), e o código da coordenação não cria chave nem repete chamada", async () => {
  const ia = iaTeste(); ia.modo = "ok"; const s = site({ resp: RESP, jsons: JSONS, racIA: ia.racIA });
  const [a, b] = await Promise.all([s.ctx.hojeAnalisar(), s.ctx.hojeAnalisar()]); assert.equal(ia.chamadas.length, 1); assert.equal(a, b);
  const src = ler("js/hoje.js"), coord = /function hojeCoordenar[\s\S]*?function hojeSituacao/.exec(src)[0];
  assert.ok(!/hojeChave|racIA|hojeEnviar|tents|IA_TENT|setTimeout\(/.test(coord), "a coordenação só decide quem roda; não calcula chave, não conta tentativa e não chama a IA");
});

/* ---- 3. Persistência */
test("E4/3: sem espaço para o registro, a chamada paga NÃO sai, nada guardado é apagado e o motivo é dito", async () => {
  const GR = "y".repeat(2500), mem = { [REG]: JSON.stringify({ a: regInc("a", iso(5e6)), b: regInc("b", iso(4e6)) }),
    [CAC]: JSON.stringify({ c1: { chave: "c1", quando: iso(9e6), resultado: boa(), x: GR }, c2: { chave: "c2", quando: iso(8e6), resultado: boa(), x: GR } }) };
  const lim = total(mem) + 600, ia = iaTeste(), antesReg = mem[REG], antesCac = mem[CAC];
  const s = site({ resp: RESP, jsons: JSONS, racIA: ia.racIA, mem, extra: { quotaLS: (k, v, m) => total({ ...m, [k]: v }) > lim } });
  for (const o of [{}, { nova: true }, { pergunta: "e agora?" }]) { const r = await s.ctx.hojeAnalisar(o);
    assert.deepEqual([r.ok, r.codigo, r.semEnvio, r.cobranca], [false, "sem_registro", true, "nenhuma"]); assert.match(r.motivo, /NÃO foi feita e nada foi cobrado/); assert.match(r.motivo, /Nenhuma análise ou registro guardado foi apagado/); }
  assert.equal(ia.chamadas.length, 0, "nenhuma chamada paga");
  assert.equal(mem[REG], antesReg, "o armazenamento dos registros não foi tocado"); assert.equal(mem[CAC], antesCac, "nem o das análises");
  const regs = JSON.parse(mem[REG]); assert.ok(regs.a.entrada && regs.b.entrada, "os registros incertos continuam inteiros");
  assert.deepEqual(Object.keys(JSON.parse(mem[CAC])).sort(), ["c1", "c2"], "as análises pagas continuam");
  assert.equal(Object.keys(regs).length, 2);
  /* tela: a explicação aparece */
  const t = telaSite({ resp: RESP, jsons: JSONS, racIA: ia.racIA, mem, extra: { quotaLS: (k, v, m) => total({ ...m, [k]: v }) > lim } }); t.ctx.renderHoje(); await fluxo(); const tela = t.alvos["#rachoje-view"];
  botao(tela, "Analisar de novo")?.onclick?.(); botao(tela, "Analisar o dia")?.onclick?.(); botao(tela, "Confirmar e chamar a IA").onclick(); await fluxo();
  assert.ok(tela.textContent.includes("Nada foi enviado.") && tela.textContent.includes("espaço neste aparelho") && tela.textContent.includes("nada foi cobrado")); assert.equal(ia.chamadas.length, 0);
});

test("E4/3: nenhuma análise paga é descartada pela quantidade; limites seguros (registros, análises, tamanho) bloqueiam ANTES de enviar, com o motivo", async () => {
  const ia = iaTeste(); ia.modo = "ok"; const mem = {}, s = site({ resp: RESP, jsons: JSONS, racIA: ia.racIA, mem });
  for (let i = 0; i < 11; i++) assert.equal((await s.ctx.hojeAnalisar({ pergunta: "pergunta " + i })).ok, true);
  assert.equal(Object.keys(JSON.parse(mem[CAC])).length, 11, "mais que as 8 de antes: nada saiu para dar lugar à nova");
  assert.ok(!/slice\(8\)/.test(ler("js/hoje.js")), "a poda das 8 últimas não existe mais");
  const ch = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => ["k" + i, { chave: "k" + i, quando: iso(i * 1e3), resultado: boa(), hoje: HOJE, fatos: [] }]));
  const A = site({ resp: RESP, jsons: JSONS, racIA: ia.racIA, mem: { [CAC]: JSON.stringify(ch(40)) } }), ra = await A.ctx.hojeAnalisar({ pergunta: "nova pergunta" });
  assert.deepEqual([ra.codigo, ra.semEnvio], ["limite_analises", true]); assert.match(ra.motivo, /40 análises guardadas/); assert.match(ra.motivo, /nenhuma é apagada sozinha/); assert.equal(Object.keys(JSON.parse(A.mem[CAC])).length, 40);
  const mp = {}; for (let i = 0; i < 40; i++) mp["p" + i] = regInc("p" + i, iso(i * 1e3), { entrada: null, snap: null });
  const B = site({ resp: RESP, jsons: JSONS, racIA: ia.racIA, mem: { [REG]: JSON.stringify(mp) } }), rb = await B.ctx.hojeAnalisar({ pergunta: "outra" });
  assert.deepEqual([rb.codigo, rb.semEnvio], ["limite_registros", true]); assert.match(rb.motivo, /40 chamadas sem resultado/); assert.equal(Object.keys(JSON.parse(B.mem[REG])).length, 40);
  const C = site({ resp: RESP, jsons: JSONS, racIA: ia.racIA, mem: { [CAC]: JSON.stringify(ch(5)) } }); C.ctx.HOJE_LOCAL_MAX = 200; const rc = await C.ctx.hojeAnalisar({ pergunta: "mais outra" });
  assert.deepEqual([rc.codigo, rc.semEnvio], ["limite_espaco", true]); assert.equal(Object.keys(JSON.parse(C.mem[CAC])).length, 5);
  const n = ia.chamadas.length; assert.equal(n, 11, "os três bloqueios não enviaram nada");
  /* o cache e o reenvio de um registro existente NÃO dependem dos limites */
  const cache = await A.ctx.hojeAnalisar(); assert.equal(cache.codigo, "limite_analises");
});

test("E4/3: a análise que chega e não pode ser gravada fica na memória e o registro da chamada continua; a atualização de registro que falha mantém a incerteza e explica a limitação", async () => {
  let cheio = false; const ia = iaTeste(), mem = {}; ia.aoChamar = () => { cheio = true; };
  const s = site({ resp: RESP, jsons: JSONS, racIA: ia.racIA, mem, extra: { quotaLS: () => cheio } }); s.ctx.HOJE_IA_PRAZO = 30;
  const r = await s.ctx.hojeAnalisar(); assert.equal(r.codigo, "tempo_esgotado"); assert.equal(r.soMemoria, true);
  for (const m of [/o navegador recusou gravar a atualização mais nova/, /só existe na memória desta página/, /O que já estava gravado continua no aparelho e será tratado como incerto/, /Nada foi apagado para abrir espaço/]) assert.match(r.motivo, m);
  const p = s.ctx.RAChoje.pendencias()[0]; assert.deepEqual([p.situacao, p.cobranca, p.soMemoria], ["incerta", "incerta", true]);
  assert.equal(JSON.parse(mem[REG])[p.chave].estado, "enviada", "no aparelho ficou o 'enviada', que vira incerto com o tempo: a prova não se perdeu");
  /* ao voltar o espaço, a próxima gravação leva o estado mais novo junto */
  cheio = false; assert.equal(s.ctx.hojePendMarcar(p.chave, { rotulo: p.rotulo }), true); assert.equal(JSON.parse(mem[REG])[p.chave].estado, "incerta"); assert.equal(s.ctx.HOJE.pendMem, null);
  /* resposta que chega com o armazenamento cheio */
  let cheio2 = false; const ia2 = iaTeste(), mem2 = {}; ia2.modo = "ok"; ia2.aoChamar = () => { cheio2 = true; };
  const t = site({ resp: RESP, jsons: JSONS, racIA: ia2.racIA, mem: mem2, extra: { quotaLS: () => cheio2 } }); const ok = await t.ctx.hojeAnalisar();
  assert.equal(ok.ok, true); assert.equal(t.ctx.RAChoje.historico().length, 1, "a análise paga continua à mão nesta página"); assert.equal(Object.keys(JSON.parse(mem2[REG])).length, 1, "e o registro da chamada não sumiu");
  cheio2 = false; assert.equal(site({ resp: RESP, jsons: JSONS, mem: mem2 }).ctx.RAChoje.pendencias().length, 1, "depois de recarregar, a possível cobrança aparece");
});

test("E4/3: o registro não duplica os fatos; o reenvio depois de recarregar ainda reconstrói os mesmos fatos citados e usa a chave e o pedido originais", async () => {
  const ia = iaTeste(), mem = {}; const s = site({ resp: RESP, jsons: JSONS, racIA: ia.racIA, mem }); s.ctx.HOJE_IA_PRAZO = 30; await s.ctx.hojeAnalisar();
  const chave = ia.chamadas[0][4], reg = JSON.parse(mem[REG])[chave]; assert.equal(reg.snap.fatos, undefined, "só o pedido guarda os fatos"); assert.deepEqual(Object.keys(reg.snap).sort(), ["estados", "hoje", "pacote"]);
  assert.equal(mem[REG].split("Hoje é 2026-11-10.").length - 1, 1, "o texto dos fatos aparece uma vez no armazenamento, não duas");
  const normal = site({ resp: RESP, jsons: JSONS, racIA: () => Promise.resolve(respostaReal()) }); const ref = (await normal.ctx.hojeAnalisar()).analise;
  ia.modo = "ok"; const s2 = site({ resp: { ...RESP, compras: [{ data: "2026-11-09", valor_total: 1 }] }, jsons: JSONS, racIA: ia.racIA, mem, extra: { hojeISO: () => "2026-11-12" } });
  const re = await s2.ctx.hojeAnalisar({ reenviar: true, chave }); assert.equal(re.ok, true); assert.equal(ia.chamadas[1][4], chave); assert.equal(JSON.stringify(ia.chamadas[1][2]), JSON.stringify(ia.chamadas[0][2]));
  assert.deepEqual(plano(re.analise.fatos), plano(ref.fatos), "os fatos citados são os mesmos de uma análise normal do mesmo pacote"); assert.ok(re.analise.fatos.length > 0);
  assert.deepEqual(plano(s.ctx.hojeFatosDoTexto(reg.entrada.texto)), plano(s.ctx.hojeFatosDoTexto(reg.entrada.texto + "<pergunta>x</pergunta>")));
});

test("E4/3: 'Dispensar registro' diz que libera o bloqueio e que pode haver nova cobrança; 'Excluir análise' diz que não há como recuperar; nada acontece no primeiro toque", async () => {
  const ia = iaTeste(); ia.modo = "ok"; const t = telaSite({ resp: RESP, jsons: JSONS, racIA: ia.racIA }); t.ctx.HOJE_IA_PRAZO = 30;
  t.ctx.renderHoje(); await fluxo(); const tela = t.alvos["#rachoje-view"];
  ia.modo = "pendura"; botao(tela, "Analisar o dia").onclick(); botao(tela, "Confirmar e chamar a IA").onclick(); await espera(120);
  const chave = ia.chamadas[0][4]; assert.ok(!botao(tela, "Analisar o dia"), "enquanto o registro existe, a mesma análise está bloqueada");
  const btn = botao(tela, "Dispensar registro"); assert.ok(btn); btn.onclick();
  const txt = tela.textContent; for (const m of ["libera o bloqueio desta tentativa", "Não cancela nada no servidor nem desfaz uma cobrança", "Se você pedir a MESMA análise de novo", "responde \"repetido\"", "NOVA análise, ela usa outra chave e pode ser cobrada de novo"]) assert.ok(txt.includes(m), m);
  assert.ok(JSON.parse(t.mem[REG])[chave], "o primeiro toque não apaga"); botao(tela, "Cancelar").onclick(); assert.ok(JSON.parse(t.mem[REG])[chave], "cancelar não apaga");
  botao(tela, "Dispensar registro").onclick(); botao(tela, "Dispensar este registro").onclick(); await fluxo();
  assert.equal(JSON.parse(t.mem[REG])[chave], undefined, "só a confirmação dispensa"); assert.ok(botao(tela, "Analisar o dia"), "o bloqueio daquela tentativa foi liberado"); assert.equal(ia.chamadas.length, 1, "e nada foi enviado");
  assert.equal(site({ resp: RESP, jsons: JSONS }).ctx.HOJE_TXT_DISPENSAR.includes("libera o bloqueio"), true);
  /* excluir análise */
  ia.modo = "ok"; botao(tela, "Analisar o dia").onclick(); botao(tela, "Confirmar e chamar a IA").onclick(); await fluxo(); assert.equal(ia.chamadas.length, 2);
  botao(tela, "Excluir análise").onclick(); assert.ok(tela.textContent.includes("O servidor não guarda o texto: não dá para recuperá-la, e uma nova análise é uma nova cobrança")); assert.equal(Object.keys(JSON.parse(t.mem[CAC])).length, 1);
  botao(tela, "Excluir esta análise").onclick(); await fluxo(); assert.equal(Object.keys(JSON.parse(t.mem[CAC])).length, 0); assert.equal(ia.chamadas.length, 2, "excluir não chama a IA");
  assert.throws(() => telaSite({ resp: RESP, jsons: JSONS, dono: false }).ctx.RAChoje.excluir("x"), /só da conta do dono/);
});

/* ---- 4. Interface entre abas */
test("E4/4: o evento 'storage' repinta só histórico, chamadas sem resultado e aviso; pergunta digitada, foco e confirmação aberta continuam; nenhuma IA é chamada nem nada é gravado", async () => {
  const ia = iaTeste(); let ouvinte = null, gravacoes = 0; const mem = {};
  const t = telaSite({ resp: RESP, jsons: JSONS, racIA: ia.racIA, mem, extra: { addEventListener: (ev, f) => { if (ev === "storage") ouvinte = f; }, quotaLS: () => { gravacoes++; return false; } } });
  t.ctx.renderHoje(); await fluxo(); const tela = t.alvos["#rachoje-view"];
  const campo = varre(tela, (e) => e.tagName === "TEXTAREA")[0]; campo.value = "pergunta que estou digitando"; let foco = 0; campo.focus = () => { foco++; };
  botao(tela, "Analisar o dia").onclick(); const confirmar = botao(tela, "Confirmar e chamar a IA"); assert.ok(confirmar, "a confirmação está aberta");
  const contagem = { hist: 0, pend: 0, aviso: 0, tudo: 0 }; const wrap = (n, k) => { const f = t.ctx[n]; t.ctx[n] = (...a) => { contagem[k]++; return f(...a); }; };
  wrap("hjPintarHist", "hist"); wrap("hjPintarPend", "pend"); wrap("hjPintarAviso", "aviso"); wrap("hjDesenhar", "tudo");
  const gravAntes = gravacoes;
  /* outra aba começa uma chamada: rajada de eventos (registro e trava) */
  mem[REG] = JSON.stringify({ z: regInc("z", iso(20e3), { estado: "enviada", rotulo: "Pergunta: da outra aba" }) });
  ouvinte({ key: REG }); ouvinte({ key: REG }); ouvinte({ key: TRA }); ouvinte({ key: CAC }); await espera(260);
  assert.deepEqual(contagem, { hist: 1, pend: 1, aviso: 1, tudo: 0 }, "uma rajada vira um repinte só, e a tela inteira não é redesenhada");
  assert.ok(varre(tela, (e) => e === campo).length === 1 && campo.value === "pergunta que estou digitando", "a pergunta digitada é o mesmo elemento, com o mesmo texto"); assert.equal(foco, 0, "o foco não foi mexido");
  assert.ok(botao(tela, "Confirmar e chamar a IA") === confirmar, "a confirmação aberta continua a mesma"); assert.ok(tela.textContent.includes("Há uma chamada em andamento") && tela.textContent.includes("Pergunta: da outra aba") && tela.textContent.includes("em andamento"));
  assert.equal(ia.chamadas.length, 0, "nenhum evento chama a IA"); assert.equal(gravacoes, gravAntes, "o tratamento do evento só lê: não grava nada (sem laço entre abas)");
  /* eventos que não são deste RAC Hoje e desta conta são ignorados */
  for (const k of ["rac-p-lista", "rac-hoje-ia-pend:outra-conta", "rac-hoje-ia:dono-2", TRA]) ouvinte({ key: k }); ouvinte(undefined); await espera(260);
  assert.deepEqual(contagem, { hist: 1, pend: 1, aviso: 1, tudo: 0 }, "nada repintou");
  /* a análise chega pela outra aba: o histórico aparece sem apagar a pergunta */
  mem[CAC] = JSON.stringify({ k: { chave: "k", quando: iso(1e3), hoje: HOJE, resultado: boa(), pergunta: "da outra aba", consumo: { estimado_rac_usd: 0.01 }, fatos: [] } }); mem[REG] = "{}"; ouvinte({ key: CAC }); await espera(260);
  assert.ok(tela.textContent.includes("Pergunta: da outra aba") && campo.value === "pergunta que estou digitando"); assert.equal(contagem.tudo, 0); assert.equal(ia.chamadas.length, 0);
  /* a confirmação continua valendo e só ela chama: uma chamada, depois do toque do usuário */
  confirmar.onclick(); await fluxo(); assert.equal(ia.chamadas.length, 1, "só o toque do usuário chama");
  const src = ler("js/hoje.js"), ouv = /window\.addEventListener\("storage"[\s\S]*?HJ\.tmr=setTimeout\(hjEntreAbas,150\)\}\)/.exec(src)[0], ent = /function hjEntreAbas[\s\S]*?\n/.exec(src)[0];
  assert.ok(!/hojeAnalisar|racIA|hjAnalisar|setItem|hojeGuardarLocal|hojePendMarcar|hjDesenhar/.test(ouv + ent), "o código do evento não chama IA, não grava e não redesenha tudo");
});

test("E4/4: sem localStorage a tela funciona (lê vazio, mostra o motivo ao tentar analisar) e o evento não quebra; o listener é um só", async () => {
  const ia = iaTeste(); let ouvinte = null, n = 0; const quebrado = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("SecurityError"); } };
  const t = telaSite({ resp: RESP, jsons: JSONS, racIA: ia.racIA, extra: { localStorage: quebrado, addEventListener: (ev, f) => { n++; if (ev === "storage") ouvinte = f; } } });
  t.ctx.renderHoje(); t.ctx.renderHoje(); await fluxo(); const tela = t.alvos["#rachoje-view"];
  assert.equal(n, 1); assert.ok(tela.textContent.includes("Fontes de informação") && tela.textContent.includes("Nenhuma análise guardada neste aparelho"));
  ouvinte({ key: REG }); await espera(260); assert.ok(tela.textContent.includes("Fontes de informação"));
  botao(tela, "Analisar o dia").onclick(); botao(tela, "Confirmar e chamar a IA").onclick(); await fluxo();
  assert.equal(ia.chamadas.length, 0, "sem onde gravar o registro, a chamada paga não sai"); assert.ok(tela.textContent.includes("Nada foi enviado.") && tela.textContent.includes("nada foi cobrado"));
});

/* ---- Próxima melhor ação: a Agenda e o cartão de verdade (js/sistema.js), com um DOM mínimo e sem rede */
function elFalso(tag, attrs, ...kids) {
  const e = { tag, attrs: attrs || {}, children: [], isConnected: true, tabIndex: 0, classList: { add: (c) => { e.attrs.class = ((e.attrs.class || "") + " " + c).trim(); } }, appendChild(c) { e.children.push(c); return c; }, remove() {} };
  Object.defineProperty(e, "innerHTML", { set() { e.children = []; }, get() { return ""; } });
  const add = (k) => { if (Array.isArray(k)) k.forEach(add); else if (k != null && k !== false) e.children.push(k); };
  kids.forEach(add); return e;
}
const textoDe = (e) => (e == null ? "" : typeof e === "string" ? e : [e.attrs && e.attrs.text, ...(e.children || []).map(textoDe)].filter(Boolean).join(" "));
const acharTodos = (e, f, acc = []) => { if (e && typeof e === "object") { if (f(e)) acc.push(e); (e.children || []).forEach((c) => acharTodos(c, f, acc)); } return acc; };
const pausa = () => new Promise((r) => setTimeout(r, 15));
function inicioReal({ registros = { data: [], error: null }, candidaturas = [], lembretes = [], dias = [], ativs = [], vagas = [], recolhido = false } = {}) {
  const src = ler("js/sistema.js"), i = src.indexOf("  var AGENDA_TIPOS"), j = src.indexOf("  /* A página Agenda (renderAgenda:");
  assert.ok(i > 0 && j > i, "o trecho do cartão da Agenda do Início e da Próxima melhor ação está no sistema.js (a leitura está em js/fonte-agenda.js; a página Agenda, desde a DS-4.1, é js/agenda.js)");
  const ouv = {}, gravados = [], estado = { recolhido };
  const doc = { addEventListener: (n, f) => { (ouv[n] = ouv[n] || []).push(f); }, removeEventListener: (n, f) => { ouv[n] = (ouv[n] || []).filter((x) => x !== f); }, dispatchEvent: (e) => { (ouv[e.type] || []).slice().forEach((f) => f(e)); } };
  const ok = (data) => Promise.resolve({ data, error: null });
  const ctx = { console, Promise, Object, Array, JSON, Date, Math, String, Number, Error, isFinite, hojeISO: () => HOJE, isOwner: () => true, logErro: () => {}, document: doc, Event: class { constructor(t) { this.type = t; } },
    sbOk: (r) => { if (r.error) throw new Error(r.error.message); return r.data; }, maisDias: (d, n) => N.somaDiasISO(d, n), tipoInfo: () => ["x", "Revisão"], dataBR: (d) => d.split("-").reverse().join("/"), BRL: (v) => "R$ " + v,
    FAM: { civic: { n: "Civic", veic: true } }, AGENDA_ICO: {}, withDates: () => [], fonteMbaDados: () => ({ aulas: [], avals: [], fin: null }), NUCLEO: N, EU: { id: "dono-1" }, location: { hash: "" }, window: { open() {} },
    PESSOAL: { ultimoBackup: HOJE, candidaturas, lembretes }, VG: { all: vagas }, vgHidden: {}, h: elFalso, recolhidos: () => (estado.recolhido ? { "Próxima melhor ação": 1 } : {}),
    wCard: (t, ic, cor, more, cls) => { const e = elFalso("div", { class: "panel " + cls }); e.titulo = t; return e; },
    pessoalGravar: (k, v) => { ctx.PESSOAL[k] = v; gravados.push(k); },
    SB: { from: (t) => (t === "registros" ? { select: () => ({ order: () => Promise.resolve(registros) }) } : t === "garmin_dia" ? { select: () => ({ gte: () => ({ order: () => ok(dias) }) }) } : { select: () => ({ gte: () => ok(ativs) }) }),
      storage: { from: () => ({ list: () => ok([{ name: HOJE + ".zip" }]) }) } } };
  vm.createContext(ctx); for (const f of ["js/fontes.js", "js/fonte-agenda.js"]) vm.runInContext(ler(f), ctx, { filename: f });
  vm.runInContext(src.slice(i, j), ctx, { filename: "sistema.js (agenda + próxima ação)" });
  ctx.estado = estado; ctx.gravados = gravados; ctx.doc = doc; return ctx;
}
const CAND_VELHA = { id: "c-velha", t: "Técnico de Suporte N2", e: "Acme", coluna: "candidatei", datas: { candidatei: "2026-09-20" }, interacoes: [{ d: "2026-09-20", tipo: "E-mail", t: "Candidatura: Recebemos" }] };
const CAND_RECENTE = { id: "c-rec", t: "Analista de Dados Jr", e: "Beta", coluna: "candidatei", datas: { candidatei: "2026-11-05" } }; /* follow-up hoje */
const CAND_RECUSADA = { id: "c-rec2", t: "Assistente de Suporte de TI", coluna: "candidatei", datas: { candidatei: "2026-10-01" }, resultado: "recusado" };
const CAND_FEITA = { id: "c-feita", t: "Analista de Suporte e Atendimento", coluna: "candidatei", datas: { candidatei: "2026-10-01" }, followup: "2026-10-07" };
const CAND_SALVA = { id: "c-salva", t: "Vaga salva", coluna: "salva", datas: { salva: "2026-10-01" } };
const TODAS = [CAND_VELHA, CAND_RECENTE, CAND_RECUSADA, CAND_FEITA, CAND_SALVA];
const REG_VENCIDO = { data: [{ id: 9, quem: "civic", tipo: "revisao", data: "2026-10-01", titulo: "Revisão 30 mil", proxima: "2026-11-05", dados: {} }], error: null };

test("Próxima ação 1: a Agenda gera follow-up só da candidatura sem resultado; a antiga vira 'sem retorno' (informativa) e nada da candidatura é alterado", async () => {
  const c = inicioReal({ candidaturas: JSON.parse(JSON.stringify(TODAS)) }), antes = JSON.stringify(c.PESSOAL.candidaturas);
  const ev = await c.agendaColetar(), cs = ev.filter((e) => e.tipo === "carreira");
  assert.deepEqual(plano(cs.map((e) => e.id).sort()), ["cand:c-rec", "cand:c-velha"], "recusada, feita e salva não geram nada");
  const velha = cs.find((e) => e.cid === "c-velha"), rec = cs.find((e) => e.cid === "c-rec");
  assert.deepEqual([velha.semRetorno, velha.prazo, velha.pre, velha.href], [true, "informativo", "Sem retorno", "#carreira/editar/c-velha"]); assert.match(velha.sub, /sem retorno · candidatura de 20\/09\/2026/);
  assert.deepEqual([rec.semRetorno || false, rec.prazo, rec.acao, rec.data], [false, "calculado", "followup", HOJE]);
  assert.equal(JSON.stringify(c.PESSOAL.candidaturas), antes, "ler a Agenda não grava nem muda a candidatura (resultado e histórico intactos)");
});

test("Próxima ação 2: o cartão põe o prazo real vencido na frente do follow-up; a candidatura de 20/09 não aparece; o motivo e o nível vêm junto", async () => {
  const c = inicioReal({ registros: REG_VENCIDO, candidaturas: TODAS, lembretes: [{ id: "l1", data: "2026-11-11", t: "Ligar para o seguro" }] });
  const s = await c.proximasSelecao();
  assert.deepEqual([s.destaque.titulo, s.destaque.nivel, s.destaque.prazo], ["Revisão 30 mil", "urgente", "real"]); assert.match(s.destaque.motivo, /^venceu há 5 dias/);
  assert.deepEqual(s.secundarias.map((x) => [x.titulo, x.nivel, x.prazo]), [["Ligar para o seguro", "importante", "real"], ["Analista de Dados Jr · Beta", "importante", "calculado"]]);
  assert.match(s.secundarias[1].motivo, /^follow-up previsto para hoje/);
  const tudo = JSON.stringify(s); assert.ok(!/Técnico de Suporte N2|Assistente de Suporte|Atendimento/.test(tudo), "candidatura antiga, recusada ou com follow-up feito não ocupa o cartão");
  assert.equal(s.vazio, false);
});

test("Próxima ação 3: sem nada relevante o cartão diz 'Tudo em dia', sem inventar ação; uma vaga compatível aparece só como informativa", async () => {
  const c = inicioReal({ candidaturas: [CAND_VELHA, CAND_RECUSADA] }); const p = c.wProxima(); await pausa();
  assert.match(textoDe(p), /Tudo em dia\. Nenhuma ação urgente agora\./); assert.equal(acharTodos(p, (e) => /(^| )prox( |$)/.test(e.attrs.class || "")).length, 0, "nenhuma linha");
  const v = { id: "v1", t: "Analista de Dados SQL Power BI Excel", nv: "pleno", e: "Gama", d: 1 };
  assert.ok(N.compatVaga(v.t + " " + v.nv, ["sql", "powerbi", "excel", "negocio", "estat"]).nota >= 70, "a vaga de teste é mesmo compatível");
  const c2 = inicioReal({ candidaturas: [CAND_VELHA], vagas: [v] }); const p2 = c2.wProxima(); await pausa(); const t2 = textoDe(p2);
  assert.match(t2, /Tudo em dia/); assert.match(t2, /Analista de Dados SQL Power BI Excel/); assert.match(t2, /Informativo/); assert.ok(!/Urgente|Importante/.test(t2), "oportunidade não é urgência");
  const s = await c2.proximasSelecao(); assert.deepEqual([s.destaque, s.acoes], [null, 0]);
});

test("Próxima ação 4: Saúde só entra com dado de ontem ou hoje e como sugestão informativa (nunca destaque)", async () => {
  const dia = (n) => ({ data: N.somaDiasISO(HOJE, -n), dados: { passos: 8000, sono: { total: 25200, nota: 80 }, vfc: { noite: 50 } } });
  const velhos = []; for (let n = 25; n >= 9; n--) velhos.push(dia(n));
  const s1 = await inicioReal({ dias: velhos, ativs: [{ inicio: N.somaDiasISO(HOJE, -12) + "T07:00:00", tipo: "running" }] }).proximasSelecao();
  assert.equal(s1.mostrados.length, 0, "relógio sem sincronizar há 9 dias não recomenda nada");
  const recentes = []; for (let n = 25; n >= 1; n--) recentes.push(dia(n));
  const s2 = await inicioReal({ dias: recentes, ativs: [{ inicio: N.somaDiasISO(HOJE, -6) + "T07:00:00", tipo: "running" }, { inicio: N.somaDiasISO(HOJE, -2) + "T07:00:00", tipo: "cycling" }] }).proximasSelecao();
  assert.equal(s2.mostrados.length, 1, "3+ dias sem treino (a bicicleta é um tipo escondido pela Saúde e não conta)"); assert.deepEqual([s2.destaque, s2.mostrados[0].nivel, s2.mostrados[0].area], [null, "informativo", "saude"]);
  const s3 = await inicioReal({ dias: recentes, ativs: [{ inicio: N.somaDiasISO(HOJE, -1) + "T07:00:00", tipo: "running" }] }).proximasSelecao();
  assert.equal(s3.mostrados.length, 0, "treinou ontem e a prontidão está boa: nada a recomendar");
});

test("Próxima ação 5: o que o cartão mostra não se repete nas primeiras linhas da Agenda do Início; a página Agenda e os dados seguem completos", async () => {
  const lemb = [1, 2, 3, 4, 5, 6].map((n) => ({ id: "l" + n, data: N.somaDiasISO(HOJE, -n), t: "Lembrete " + n }));
  const c = inicioReal({ lembretes: lemb }); const prox = c.wProxima(); const ag = c.wAgenda(); await pausa(); await pausa();
  const noCartao = acharTodos(prox, (e) => /(^| )prox( |$)/.test(e.attrs.class || "")).map(textoDe).join("|"), naAgenda = textoDe(ag);
  const mostrados = ["Lembrete 6", "Lembrete 5", "Lembrete 4", "Lembrete 3"], restantes = ["Lembrete 2", "Lembrete 1"];
  mostrados.forEach((t) => { assert.ok(noCartao.includes(t), t + " está no cartão"); assert.ok(!naAgenda.includes(t), t + " não se repete na Agenda do Início"); });
  restantes.forEach((t) => { assert.ok(!noCartao.includes(t)); assert.ok(naAgenda.includes(t), t + " continua na Agenda"); });
  assert.match(textoDe(prox), /e mais 2 na Agenda/); assert.match(naAgenda, /\+4 em Próxima melhor ação/);
  assert.equal((await c.agendaColetar()).filter((e) => e.tipo === "lembrete").length, 6, "nenhum compromisso real foi apagado ou alterado");
  /* cartão recolhido: nada fica escondido, a Agenda volta a mostrar tudo */
  c.estado.recolhido = true; c.doc.dispatchEvent(new c.Event("rac-recolher")); await pausa();
  [...mostrados, ...restantes].forEach((t) => assert.ok(textoDe(ag).includes(t), t + " de volta na Agenda com o cartão recolhido"));
});

test("Próxima ação 6: a Agenda do Início não mostra 'sem retorno' como atraso; a página Agenda os separa", async () => {
  const c = inicioReal({ candidaturas: [CAND_VELHA] }); const ag = c.wAgenda(); await pausa();
  assert.ok(!textoDe(ag).includes("Técnico de Suporte N2"), "a candidatura antiga não toma as primeiras linhas");
  assert.match(textoDe(ag), /Nada vencendo nos próximos 7 dias/);
  /* desde a DS-4.1 o agrupamento da página Agenda é do núcleo (NUCLEO.agdGrupos) e a tela está em js/agenda.js; os critérios são os mesmos (tests/nucleo.test.mjs compara com os de antes) */
  const src = ler("nucleo.js"); assert.match(src, /\["semretorno","Candidaturas sem retorno"\]/); assert.match(src, /atrasados:function\(e\)\{return e\.data<hoje&&!e\.semRetorno\}/); assert.match(src, /semretorno:function\(e\)\{return !!e\.semRetorno\}/);
  assert.match(ler("js/agenda.js"), /NUCLEO\.agdGrupos\(NUCLEO\.agdFiltrar\(ev,AGD\.filtro\),hoje\)/, "a página Agenda usa o agrupamento do núcleo");
  assert.match(ler("js/painel.js"), /e\.data<hoje&&!e\.semRetorno/, "o Painel também não conta 'sem retorno' como atrasado");
});

test("Próxima ação 7: ações rápidas usam os caminhos existentes: Feito, Adiar 3 dias e Sem retorno mudam só o necessário e preservam o histórico", async () => {
  const mk = () => inicioReal({ candidaturas: JSON.parse(JSON.stringify([CAND_VELHA, CAND_RECENTE])), lembretes: [{ id: "l1", data: HOJE, t: "Ligar" }] });
  let c = mk(), disparos = 0; c.doc.addEventListener("rac-proxima", () => disparos++);
  c.proximaAcao("feito", { cid: "c-rec" }); let r = c.PESSOAL.candidaturas.find((x) => x.id === "c-rec");
  assert.deepEqual([r.followup, r.t, r.datas.candidatei, r.resultado], [HOJE, "Analista de Dados Jr", "2026-11-05", undefined]); assert.equal(c.PESSOAL.candidaturas.find((x) => x.id === "c-velha").followup, undefined, "as outras não mudam");
  assert.equal(N.priFollowup(r, HOJE).estado, "nenhum", "feito sai do cartão e da Agenda"); assert.equal(disparos, 1, "avisa os cartões para se redesenharem");
  c = mk(); c.proximaAcao("adiar", { cid: "c-rec" }); r = c.PESSOAL.candidaturas.find((x) => x.id === "c-rec");
  assert.equal(r.followupEm, "2026-11-13"); assert.equal(N.priFollowup(r, HOJE).estado, "ativo"); assert.equal(N.priFollowup(r, HOJE).dias, 3);
  c.proximaAcao("adiar", { cid: "c-rec" }); assert.equal(c.PESSOAL.candidaturas.find((x) => x.id === "c-rec").followupEm, "2026-11-16", "adiar de novo soma 3 dias à data futura, como o botão do editor");
  c = mk(); c.proximaAcao("semretorno", { cid: "c-velha" }); r = c.PESSOAL.candidaturas.find((x) => x.id === "c-velha");
  assert.equal(r.resultado, "sem retorno"); assert.equal(r.coluna, "candidatei", "a coluna não muda"); assert.equal(r.interacoes.length, 2, "o histórico original fica e ganha uma linha"); assert.deepEqual(r.interacoes[0], CAND_VELHA.interacoes[0]);
  assert.equal(N.priFollowup(r, HOJE).estado, "nenhum", "resultado preenchido encerra");
  c = mk(); c.PESSOAL.candidaturas[0].resultado = "recusado"; c.proximaAcao("semretorno", { cid: "c-velha" }); assert.equal(c.PESSOAL.candidaturas[0].resultado, "recusado", "nunca troca um resultado que o dono marcou");
  c = mk(); c.proximaAcao("feito", { lid: "l1" }); assert.equal(c.PESSOAL.lembretes[0].feito, HOJE); assert.deepEqual(c.gravados, ["lembretes"]);
  c = mk(); assert.deepEqual(plano(c.proximaAcoesDe({ acao: "followup" })), ["feito", "adiar", "semretorno"]); assert.deepEqual(plano(c.proximaAcoesDe({ semRetorno: true })), ["semretorno"]); assert.deepEqual(plano(c.proximaAcoesDe({ t: "x" })), []);
});

test("Próxima ação 8: o botão do destaque do cartão grava e o cartão se redesenha sem a candidatura", async () => {
  const c = inicioReal({ candidaturas: JSON.parse(JSON.stringify([CAND_RECENTE])) }); const p = c.wProxima(); await pausa();
  const feito = acharTodos(p, (e) => e.tag === "button" && e.attrs.text === "Feito")[0]; assert.ok(feito, "o destaque oferece Feito");
  assert.deepEqual(acharTodos(p, (e) => e.tag === "button").map((b) => b.attrs.text), ["Feito", "Adiar 3 dias", "Sem retorno"]);
  feito.onclick({ stopPropagation() {} }); await pausa(); await pausa();
  assert.match(textoDe(p), /Tudo em dia/); assert.equal(c.PESSOAL.candidaturas[0].followup, HOJE);
});

test("Próxima ação 9: resumo falado — só urgente e importante viram 'para hoje'; candidatura antiga sem retorno nunca é anunciada", async () => {
  const app = ler("js/app.js"); assert.ok(!/proximasAcoes\(/.test(app) && !/proximasAcoes\(/.test(ler("js/sistema.js")), "ninguém mais usa a lista antiga");
  assert.match(app, /proximasSelecao\(\)\}\)\.then\(function\(s\)\{return s\.mostrados\.filter\(function\(x\)\{return x\.nivel!=="informativo"\}\)\}\)/); assert.match(app, /Tudo em dia\. Nenhuma ação urgente agora\./);
  const c = inicioReal({ candidaturas: [CAND_VELHA], vagas: [{ id: "v1", t: "Analista de Dados SQL Power BI Excel", nv: "pleno", d: 1 }] });
  const fala = (await c.proximasSelecao()).mostrados.filter((x) => x.nivel !== "informativo"); assert.deepEqual(fala, [], "nada para falar: a vaga é informativa e a candidatura de 20/09 é 'sem retorno'");
  const c2 = inicioReal({ candidaturas: [CAND_VELHA, CAND_RECENTE], registros: REG_VENCIDO });
  assert.deepEqual((await c2.proximasSelecao()).mostrados.map((x) => x.titulo), ["Revisão 30 mil", "Analista de Dados Jr · Beta"]);
});

test("Próxima ação 10: RAC Hoje usa a mesma régua: 'sem retorno' fora, follow-up abaixo do prazo real, e os níveis batem com os do cartão", async () => {
  const c = inicioReal({ registros: REG_VENCIDO, candidaturas: TODAS, lembretes: [{ id: "l1", data: "2026-11-11", t: "Ligar para o seguro" }] });
  const ev = await c.agendaColetar(), itens = N.hojeItens({ agenda: { ok: true, v: ev } }, HOJE, {});
  assert.ok(!itens.some((i) => /Técnico de Suporte N2/.test(i.titulo)), "a candidatura de 20/09 não entra nas prioridades do dia");
  const fu = itens.find((i) => /Analista de Dados Jr/.test(i.titulo)), real = itens.find((i) => /Revisão 30 mil/.test(i.titulo));
  assert.deepEqual([fu.prazo, fu.nivel, real.prazo, real.nivel], ["calculado", "média", "real", "alta"]); assert.ok(fu.p < real.p);
  const MAPA = { urgente: "alta", importante: "média", informativo: "baixa" };
  itens.forEach((i) => { const e = ev.find((x) => i.titulo.endsWith(x.t)); assert.equal(i.nivel, MAPA[N.priItem(e, HOJE).nivel], i.titulo + ": o mesmo nível do cartão"); });
  assert.equal(N.hojeNivel(N.hojePrioridade({ dias: 0, area: "sistema" })), "alta", "hoje é sempre alta, qualquer área");
  const s = N.hojeItens({}, HOJE, { saude: { prontidao: 30, atraso: 0, alertas: ["sono curto"] }, vagas: [{ nota: 80, t: "Vaga", e: "X", d: 1 }] });
  assert.ok(s.every((i) => i.prazo === "informativo" && i.nivel === "baixa"), "saúde e vaga: informativas também no RAC Hoje");
  assert.equal(N.hojeItens({}, HOJE, { saude: { prontidao: 30, atraso: 4, alertas: [] } }).length, 0, "e a mesma regra de dado velho");
});
