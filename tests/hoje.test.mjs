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
  const [m2] = chave({ ...base, noticias: { ok: true, v: [{ t: "Obra na avenida" }], quando: "2026-11-10T10:00:00Z" } });
  const [m3] = chave({ ...base, mercado: { ok: false, erro: "timeout" } });
  for (const m of [m1, m2, m3]) assert.notEqual(m, k1, "outros dados continuam mudando a chave");
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
function site({ resp = {}, dono = true, racIA, jsons = {}, agenda, extra = {}, arquivos = [] } = {}) {
  const b = bancoSite(resp), mem = {}, ctxIA = { chamadas: [] };
  const ctx = {
    NUCLEO: N, console, Promise, Object, Array, JSON, Date, Math, String, Number, Error, Proxy, isFinite, clearTimeout,
    setTimeout: (f, ms) => { const t = setTimeout(f, ms); if (ms > 50 && t.unref) t.unref(); return t; },
    SB: b.SB, PAPEL: dono ? "dono" : "casa", isOwner: () => dono, sbOk: (r) => { if (r.error) throw new Error(r.error.message); return r.data; }, hojeISO: () => HOJE,
    precisa: () => Promise.resolve(), agendaColetar: agenda || (() => { ctxIA.agenda = (ctxIA.agenda || 0) + 1; return Promise.resolve([{ data: "2026-11-11", t: "Boleto 5", tipo: "mba", pre: "Boleto", sub: "boleto do MBA" }]); }),
    vgPronto: Promise.resolve(), VG: { all: [{ id: "v1", t: "Analista de Dados SQL Power BI", e: "Empresa A", d: 1 }], coletado: "2026-11-10T09:00:00Z" }, vgHidden: {},
    PESSOAL: { perfilCarreira: { skills: ["sql", "powerbi"] }, candidaturas: [] }, TEMPO_HOJE: null,
    mbaAulas: () => [{ data: "2026-11-12", hora: "19:00", t: "Python II" }], mbaAvals: () => [], mbaFin: () => null,
    getJson: (u) => { const k = Object.keys(jsons).find((x) => u.indexOf(x) === 0); const v = k ? jsons[k] : null; return v instanceof Error ? Promise.reject(v) : v ? Promise.resolve(v) : Promise.reject(new Error("HTTP 404 " + u)); },
    localStorage: { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } },
    racIA: racIA || ((...a) => { ctxIA.chamadas.push(a); return Promise.reject(new Error("sem IA no teste")); }),
    ATU: { fresco: false },
  };
  ctx.atuLer = (f) => Promise.resolve().then(f).then((v) => ({ ok: true, v }), (e) => ({ ok: false, erro: e && e.message || String(e) }));
  Object.assign(ctx, extra); ctx.window = ctx; vm.createContext(ctx); vm.runInContext(ler("js/hoje.js"), ctx, { filename: "hoje.js" });
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
  assert.match(app, /var DA_CASA=\["mercado","alimentacao","compras","lista","eddie","olivia","veiculos","documentos","rede","seguranca"\];/, "as páginas da Fernanda são as mesmas");
  assert.match(/var ROTA_MODS=\{[^}]*\}/.exec(app)[0], /rachoje:\["hoje"\]/, "o RAC Hoje tem página (#rachoje), mas só o dono chega nela");
  assert.ok(!/DA_CASA=\[[^\]]*(hoje|iacustos)/.test(app), "a Fernanda não vê o RAC Hoje nem os Custos de IA");
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
  assert.ok(tela.textContent.includes("Atual"), "a análise continua atual");
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
    assert.equal(s.mem["rac-hoje-ia"], undefined, "falha não entra no cache");
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
  assert.ok(/Agenda[\s\S]*Ok/.test(txt()) && txt().includes("Tempo em Sorocaba"), "status de cada fonte");
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
  for (const t of ["Dia de recuperação e uma avaliação do MBA chegando.", "Fato", "Inferência", "Relações entre módulos", "Recomendações", "Incertezas", "Claude Sonnet 5.5", "custo estimado US$ 0,011", "3.000 → 500 tokens", "Atual"]) assert.ok(txt().includes(t), t);
  assert.ok(varre(tela, (e) => e.tagName === "SUMMARY" && /Fatos utilizados/.test(e.textContent)).length, "fatos utilizados");
  assert.ok(botao(tela, "Analisar de novo (nova cobrança)"), "nova análise é outra cobrança, dita no botão");
});

test("tela do RAC Hoje: DEMO e erro aparecem como erro real, sem análise simulada; análise de dados que mudaram é marcada desatualizada", async () => {
  const casos = [
    [() => Promise.resolve({ ...respostaReal(), modo: "DEMO", resultado: { ...boa(), _demo: true } }), /./],
    [() => Promise.resolve({ ok: false, versao: 1, modo: "REAL", mensagem: "Sem orçamento para esta chamada.", erro: { codigo: "orcamento" } }), /Sem orçamento/],
  ];
  for (const [rac, motivo] of casos) {
    const s = telaSite({ resp: RESP, jsons: JSONS, racIA: rac });
    s.ctx.renderHoje(); await fluxo();
    const tela = s.alvos["#rachoje-view"];
    botao(tela, "Analisar o dia").onclick(); botao(tela, "Confirmar e chamar a IA").onclick(); await fluxo();
    assert.ok(tela.textContent.includes("A análise não foi concluída."), "erro à vista");
    assert.match(tela.textContent, motivo);
    assert.ok(tela.textContent.includes("Nenhuma resposta simulada foi usada"), "garantia");
    assert.ok(!tela.textContent.includes("Dia de recuperação"), "nada de análise no lugar do erro");
    assert.equal(s.mem["rac-hoje-ia"], undefined);
  }
  const s = telaSite({ resp: RESP, jsons: JSONS });
  s.mem["rac-hoje-ia"] = JSON.stringify({ k1: { id: "u1", chave: "k1", quando: new Date().toISOString(), hoje: HOJE, resultado: boa(), consumo: { modelo: "claude-sonnet-5-5", estimado_rac_usd: 0.02 }, avisos: [], pacote: "hoje-outro-pacote", pergunta: "", fatos: [] } });
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
  assert.equal((tela.match(/hjAnalisar\(/g) || []).length, 3, "definida uma vez e usada só nos dois botões pagos");
  assert.ok(/function hjBotaoPago/.test(tela) && /Confirmar e chamar a IA/.test(tela) && /if\(HJ\.ocupado\)return/.test(tela), "confirmação e trava de pedido duplicado");
  assert.ok(!/racIA\(|functions\.invoke|\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/.test(ic), "Custos de IA só lê");
  assert.ok(!/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(|functions\.invoke/.test(tela), "o RAC Hoje não grava nem chama funções além do racIA do botão");
  assert.match(app, /MOD_DEPS=\{[^}]*iacustos:\["resumo"\]/);
  assert.match(app, /"newsletter","rachoje","iacustos"\]/);
  assert.match(app, /if\(top==="rachoje"\)\{sideMark\("rachoje","rachoje"\);renderHoje\(\);return\}/);
  assert.match(app, /if\(top==="iacustos"\)\{sideMark\("iacustos","iacustos"\);renderCustosIa\(\);return\}/);
  assert.match(ler("sw.js"), /"\.\/js\/iacustos\.js"/);
  const html = ler("index.html");
  assert.match(html, /<section id="rachoje" hidden><div id="rachoje-view"/);
  assert.match(html, /<section id="iacustos" hidden><div id="iacustos-view"/);
  assert.match(html, /href="#rachoje" data-k="rachoje"/);
  assert.match(html, /href="#iacustos" data-k="iacustos"/);
  assert.ok(/html\.casa #navgrp a\.it:not\(\[data-k="mercado"\]\)/.test(html) && !/data-k="hoje"\]\)/.test(html), "o menu da Fernanda continua só com as páginas dela");
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
