// DS-4.3 · Regras puras da Saúde (nucleo.js, prefixo sau*; docs/saude.md e Documento 09, seções 6 a 12). Dados inventados, hoje = 13/11/2026.
// Para cada sinal: limiar, oscilação isolada que NÃO dispara, situação persistente que dispara, histerese, cobertura mínima, dados ausentes/inválidos e amostra pequena.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const HOJE = "2026-11-13", dia = (n) => N.somaDiasISO(HOJE, n);
const congelar = (o) => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(congelar); } return o; };

/* uma série de dias: f(i) devolve os dados do dia hoje+i (i de -n+1 a 0), ou null para "sem linha" */
const serie = (n, f, atualizado) => { const l = []; for (let i = -n + 1; i <= 0; i++) { const d = f(i); if (d) l.push({ data: dia(i), dados: d, ...(atualizado ? { atualizado } : {}) }); } return l; };
const AGORA = Date.parse(HOJE + "T15:00:00Z"), RECENTE = new Date(AGORA - 3 * 3600e3).toISOString();
const sinais = (dias, o = {}) => N.sauSinais(dias, HOJE, { agora: AGORA, ...o });
const sinal = (r, id) => r.sinais.find((s) => s.id === id);

/* ---------- S1: VFC abaixo da linha de base ---------- */
const vfcBase = (i) => 55 + (((i % 3) + 3) % 3); // 55, 56, 57
test("S1: 3 das últimas 5 noites abaixo da faixa da Garmin dispara; uma noite isolada não", () => {
  const persistente = serie(80, (i) => ({ vfc: { noite: i >= -2 ? 40 : vfcBase(i), faixaMin: 48, faixaMax: 66 } }), RECENTE);
  const s = sinal(sinais(persistente), "s1"); assert.equal(s.estado, "ativo"); assert.equal(s.hoje.regra, "faixa"); assert.equal(s.hoje.abaixoFaixa, 3);
  assert.match(s.texto.obs, /3 das últimas 5 noites/); assert.match(s.texto.hipotese, /^Hipótese:/); assert.ok(s.texto.orientacao); assert.match(s.texto.janela, /5 com dado/);
  const isolada = serie(80, (i) => ({ vfc: { noite: i === 0 ? 40 : vfcBase(i), faixaMin: 48, faixaMax: 66 } }), RECENTE);
  assert.equal(sinal(sinais(isolada), "s1").estado, "normal", "uma noite ruim não é padrão");
  const duas = serie(80, (i) => ({ vfc: { noite: i >= -1 ? 40 : vfcBase(i), faixaMin: 48 } }), RECENTE); assert.equal(sinal(sinais(duas), "s1").estado, "normal", "2 de 5 não basta");
});
test("S1: sem faixa da Garmin, a média de 7 dias abaixo da mediana de 60 menos um desvio, com 3 noites, dispara (regra da base pessoal)", () => {
  const dias = serie(80, (i) => ({ vfc: { noite: i >= -4 ? 48 : vfcBase(i) } }), RECENTE);
  const s = sinal(sinais(dias), "s1"); assert.equal(s.estado, "ativo"); assert.equal(s.hoje.regra, "base"); assert.ok(s.hoje.m7 < s.hoje.limite); assert.ok(s.hoje.baseN >= 14);
  const leve = serie(80, (i) => ({ vfc: { noite: i >= -4 ? 54 : vfcBase(i) } }), RECENTE); assert.equal(sinal(sinais(leve), "s1").estado, "normal", "dentro do desvio normal");
});
test("S1: histerese — depois do padrão, uma noite normal NÃO apaga o sinal; duas apagam, e o episódio fica no histórico", () => {
  /* noites ruins de -14 a -10; a janela de 5 noites tem 3 ruins até o dia -8; no dia -7 há só 2 (primeiro dia normal) e no -6 só 1 (segundo) */
  const dias = serie(80, (i) => ({ vfc: { noite: i >= -14 && i <= -10 ? 40 : vfcBase(i), faixaMin: 48 } }), RECENTE);
  const em = (d) => N.sauHistoricoSinais(dias.filter((x) => x.data <= dia(d)), dia(d)).s1;
  assert.equal(em(-8).ativo, true); const a7 = em(-7); assert.equal(a7.ativo, true, "1 leitura normal: segue ativo"); assert.equal(a7.emSaida, true);
  const a6 = em(-6); assert.equal(a6.ativo, false, "2 leituras normais: encerra"); assert.equal(a6.episodios.length, 1);
  assert.deepEqual([a6.episodios[0].desde, a6.episodios[0].ate, a6.episodios[0].aberto], [dia(-12), dia(-6), false], "quando começou e quando deixou de ser relevante");
  /* oscila: normal um dia e volta ao padrão antes do segundo dia normal => continua UM episódio */
  const osc = serie(80, (i) => ({ vfc: { noite: (i >= -14 && i <= -10) || i === -7 || i === -6 || i === -5 ? 40 : vfcBase(i), faixaMin: 48 } }), RECENTE);
  assert.equal(N.sauHistoricoSinais(osc, HOJE).s1.episodios.filter((e) => e.desde === dia(-12)).length, 1);
});
test("S1: cobertura abaixo de 70% na janela (menos de 4 das 5 noites) suprime o sinal em vez de dizer 'normal'", () => {
  const dias = serie(80, (i) => ({ vfc: i === -1 || i === -3 ? undefined : { noite: 40, faixaMin: 48 } }), RECENTE);
  const s = sinal(sinais(dias), "s1"); assert.equal(s.estado, "suprimido"); assert.match(s.motivo, /menos de 4 das últimas 5 noites/);
  assert.equal(sinais(dias).visiveis.length, 0);
});

/* ---------- S2: FC de repouso elevada ---------- */
const fcBase = (i) => 50 + (((i % 2) + 2) % 2);
test("S2: 5 bpm acima da mediana de 30 dias em 3 dos últimos 5 dias dispara; um dia isolado e 4 bpm não", () => {
  const s = sinal(sinais(serie(60, (i) => ({ fcRepouso: i >= -2 ? 58 : fcBase(i) }), RECENTE)), "s2"); assert.equal(s.estado, "ativo"); assert.equal(s.hoje.acima, 3); assert.match(s.texto.comparacao, /por minuto/);
  assert.equal(sinal(sinais(serie(60, (i) => ({ fcRepouso: i === 0 ? 62 : fcBase(i) }), RECENTE)), "s2").estado, "normal");
  assert.equal(sinal(sinais(serie(60, (i) => ({ fcRepouso: i >= -4 ? 54 : fcBase(i) }), RECENTE)), "s2").estado, "normal", "4 bpm acima não alcança o limiar de 5");
  assert.equal(sinal(sinais(serie(60, (i) => ({ fcRepouso: i >= -4 ? 55.5 : fcBase(i) }), RECENTE)), "s2").estado, "ativo", "exatamente mediana + 5 conta");
});
test("S2: base curta (menos de 14 dias) e dados ausentes suprimem", () => {
  assert.equal(sinal(sinais(serie(12, () => ({ fcRepouso: 60 }), RECENTE)), "s2").estado, "suprimido");
  assert.equal(sinal(sinais(serie(60, () => ({ passos: 1000 }), RECENTE)), "s2").estado, "suprimido", "dia sem FC não vira 'normal'");
});

/* ---------- S3: estresse persistente ---------- */
const estBase = (i) => 30 + (((i % 3) + 3) % 3);
test("S3: média de 7 dias 10 pontos acima da mediana com 5 de 7 dias elevados dispara; um pico isolado não", () => {
  const s = sinal(sinais(serie(80, (i) => ({ estresse: i >= -5 ? 45 : estBase(i) }), RECENTE)), "s3"); assert.equal(s.estado, "ativo"); assert.ok(s.hoje.elevados >= 5); assert.match(s.texto.hipotese, /fisiológico/);
  assert.equal(sinal(sinais(serie(80, (i) => ({ estresse: i === 0 ? 90 : estBase(i) }), RECENTE)), "s3").estado, "normal", "a média sobe, mas não 5 dos 7 dias");
  assert.equal(sinal(sinais(serie(80, (i) => ({ estresse: i >= -4 ? 45 : estBase(i) }), RECENTE)), "s3").estado, "normal", "só 5 dias elevados e média abaixo de +10");
});

/* ---------- S4: sono curto e irregular ---------- */
test("S4: menos de 6 h em 3 das últimas 5 noites dispara; duas noites curtas não", () => {
  const sono = (h, ini) => ({ sono: { total: h * 3600, inicio: ini || "23:00", fim: "06:30" } });
  const r = sinais(serie(30, (i) => (i >= -2 ? sono(5.5) : sono(7.5)), RECENTE)); assert.equal(sinal(r, "s4").estado, "ativo"); assert.equal(sinal(r, "s4").hoje.curtas, 3);
  assert.equal(sinal(sinais(serie(30, (i) => (i >= -1 ? sono(5.5) : sono(7.5)), RECENTE)), "s4").estado, "normal");
  assert.equal(sinal(sinais(serie(30, (i) => (i === 0 || i === -1 ? undefined : sono(5.5)), RECENTE)), "s4").estado, "suprimido", "só 3 das 5 noites com dado: não dá para afirmar");
});
test("S4: horário de dormir irregular (desvio acima de 60 min em 14 noites) com média abaixo da meta dispara; regular ou acima da meta não", () => {
  const irreg = (h) => serie(30, (i) => ({ sono: { total: h * 3600, inicio: i % 2 ? "21:30" : "01:30", fim: "08:00" } }), RECENTE);
  const r = sinal(sinais(irreg(6.5)), "s4"); assert.equal(r.estado, "ativo"); assert.equal(r.hoje.regra, "irregular"); assert.ok(r.hoje.regularidade.dormirDpMin > 60); assert.match(r.texto.obs, /variou cerca de/);
  assert.equal(sinal(sinais(irreg(7.5)), "s4").estado, "normal", "irregular, mas dormindo acima da meta de 7 h");
  assert.equal(sinal(sinais(irreg(6.5), { sonoH: 6 }), "s4").estado, "normal", "a meta pessoal editável entra na regra");
  const regular = serie(30, () => ({ sono: { total: 6.5 * 3600, inicio: "23:00", fim: "05:30" } }), RECENTE); assert.equal(sinal(sinais(regular), "s4").estado, "normal");
  assert.equal(N.sauRegularidade(N.sauPor(regular), HOJE, 14).dormirDpMin, 0); assert.equal(N.sauRegularidade({ [HOJE]: { sono: { inicio: "23:00" } } }, HOJE, 14).suficiente, false, "amostra pequena");
});
test("horário de dormir: depois da meia-noite vem depois das 23h; hora inválida é ignorada", () => {
  assert.ok(N.sauMinNoite("00:30") > N.sauMinNoite("23:30")); assert.equal(N.sauMinNoite("25:00"), null); assert.equal(N.sauMinNoite(null), null); assert.equal(N.sauHora(N.sauMinNoite("23:45")), "23:45");
});

/* ---------- S12: saúde dos dados (prioridade sobre os sinais) ---------- */
test("S12: dado com mais de 24 horas suprime TODOS os sinais; o mesmo cenário com dado fresco dispara", () => {
  const f = (at) => serie(80, (i) => ({ vfc: { noite: i >= -4 ? 40 : vfcBase(i), faixaMin: 48 }, fcRepouso: i >= -4 ? 62 : fcBase(i) }), at);
  assert.equal(sinal(sinais(f(RECENTE)), "s1").estado, "ativo");
  const velho = sinais(f(new Date(AGORA - 30 * 3600e3).toISOString())); assert.equal(velho.qualidade.desatualizado, true); assert.equal(velho.qualidade.suprime, true);
  assert.ok(velho.sinais.every((s) => s.estado === "suprimido")); assert.equal(velho.ativos.length, 0); assert.match(velho.qualidade.motivo, /mais de 24 horas/);
  assert.equal(sinais(f(new Date(AGORA - 23 * 3600e3).toISOString())).qualidade.suprime, false, "23 h ainda vale");
});
test("S12: sem a data de atualização, vale a data do último dia; cobertura baixa é informada; vazio e datas inválidas não quebram", () => {
  assert.equal(N.sauQualidade(serie(80, () => ({ fcRepouso: 50 })).filter((d) => d.data <= dia(-3)), HOJE, { agora: AGORA }).suprime, true, "último dia há 3 dias");
  assert.equal(N.sauQualidade(serie(80, () => ({ fcRepouso: 50 })), HOJE, { agora: AGORA }).suprime, false);
  const q = N.sauQualidade(serie(80, (i) => (i % 2 ? { sono: { total: 25000 }, fcRepouso: 50 } : { fcRepouso: 50 }), RECENTE), HOJE, { agora: AGORA }); assert.ok(q.baixa.includes("sono")); assert.equal(q.cobertura.fc.pct, 100);
  assert.equal(N.sauQualidade([], HOJE).vazio, true); assert.equal(sinais([]).sinais.length, 4);
  assert.doesNotThrow(() => sinais([{ data: "lixo", dados: null }, { data: null }, {}], {})); assert.equal(N.sauIndicadores([{ data: "x", dados: {} }], HOJE), null);
});

/* ---------- indicadores e frase ---------- */
test("indicadores: comparação com o padrão pessoal só com base suficiente; a prontidão é a mesma fórmula de sempre", () => {
  const dias = serie(80, (i) => ({ vfc: { noite: i === 0 ? 60 : vfcBase(i) }, fcRepouso: 50, sono: { total: 7 * 3600, nota: 80 }, bbMax: 70, estresse: 30 }), RECENTE);
  const ind = N.sauIndicadores(dias, HOJE), pr = N.prontidao(dias, HOJE); assert.equal(ind.prontidao.nota, pr.nota); assert.equal(ind.hoje, true);
  assert.equal(ind.itens.vfc.v, 60); assert.ok(ind.itens.vfc.n >= 14 && ind.itens.vfc.dif > 0);
  const curto = N.sauIndicadores(serie(5, () => ({ vfc: { noite: 50 } })), HOJE); assert.equal(curto.itens.vfc.med, null, "sem comparação com poucos dias"); assert.equal(curto.itens.vfc.pct, null);
  assert.match(N.sauFrase(ind, sinais(dias)), /^Prontidão \d+: .*Nenhum sinal persistente\.$/); assert.match(N.sauFrase(null), /Ainda não há dados/);
  const velho = serie(80, () => ({ fcRepouso: 50 }), new Date(AGORA - 40 * 3600e3).toISOString()); assert.match(N.sauFrase(N.sauIndicadores(velho, HOJE), sinais(velho)), /sinais estão suspensos/);
});

/* ---------- S5: sono × VFC ---------- */
test("S5: só mostra com 8 pares ou mais e |r| >= 0,4; sempre informa o tamanho da amostra", () => {
  const par = (f) => serie(30, (i) => ({ sono: { total: (6 + (((i % 4) + 4) % 4) * 0.5) * 3600 }, vfc: { noite: f(i) } }));
  const forte = N.sauSonoVfc(par((i) => 40 + (((i % 4) + 4) % 4) * 4), HOJE); assert.equal(forte.mostrar, true); assert.ok(forte.r >= 0.4); assert.ok(forte.n >= 8); assert.equal(forte.janela, "últimas 8 semanas");
  const fraca = N.sauSonoVfc(par((i) => 50 + ((i * 7) % 5)), HOJE); assert.equal(fraca.mostrar, false); assert.match(fraca.motivo, /associação fraca|sem variação/);
  const poucos = N.sauSonoVfc(serie(7, (i) => ({ sono: { total: (6 + (i % 3)) * 3600 }, vfc: { noite: 40 + (i % 3) * 5 } })), HOJE); assert.equal(poucos.mostrar, false); assert.match(poucos.motivo, /amostra pequena: 7 pares/);
  assert.equal(N.sauAssociacao([[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 7], [8, 8]]).mostrar, true, "exatamente 8 pares");
  assert.equal(N.sauAssociacao([[1, 5], [2, 1], [3, 5], [4, 1], [5, 5], [6, 1], [7, 5], [8, 1]]).mostrar, false);
  const fora = N.sauSonoVfc(serie(120, (i) => ({ sono: { total: (6 + (((i % 4) + 4) % 4)) * 3600 }, vfc: { noite: 40 + (((i % 4) + 4) % 4) * 4 } })).filter((d) => d.data < dia(-60)), HOJE); assert.equal(fora.n, 0, "pares fora das 8 semanas não entram");
});

/* ---------- S6, S7, S9: treinos ---------- */
const semana = (k) => N.pnSemana(dia(-7 * k)); // k semanas atrás (0 = atual)
const treino = (sem, off, carga, extra = {}) => ({ id: Math.random(), inicio: N.somaDiasISO(semana(sem), off) + "T07:00:00", tipo: "running", dados: { ...(carga != null ? { carga } : {}), ...extra } });
test("S6: a carga semanal respeita a escala da Garmin; duração não preenche carga ausente", () => {
  const a = [treino(1, 0, 100), treino(1, 2, null, { duracao: 3600 }), treino(0, 1, 50)];
  const s = N.sauCargaSemanal(a, HOJE, 4); assert.equal(s.length, 4); assert.equal(s[2].carga, 100); assert.equal(s[2].treinos, 1); assert.equal(s[2].semCarga, 1, "o treino sem carga é contado à parte, sem virar minutos");
  assert.equal(s[3].carga, 50); assert.equal(s[3].sem, N.pnSemana(HOJE));
});
test("S6: variação persistente (duas semanas completas) destaca; pico isolado é só pico; menos de 3 treinos nas 4 semanas de referência não calcula", () => {
  const ref = (s, c) => [treino(s, 0, c), treino(s, 2, c)];
  const alta = [3, 4, 5, 6, 7, 8].flatMap((s) => ref(s, 100)).concat(ref(1, 600), ref(2, 600));
  const v = N.sauCargaVariacao(N.sauCargaSemanal(alta, HOJE, 8)); assert.equal(v.estado, "alta_persistente"); assert.ok(v.semanas.filter((x) => !x.parcial).slice(-2).every((x) => x.razao >= 1.3));
  const queda = N.sauCargaVariacao(N.sauCargaSemanal([3, 4, 5, 6, 7, 8].flatMap((s) => ref(s, 300)).concat(ref(1, 60), ref(2, 60)), HOJE, 8)); assert.equal(queda.estado, "queda_persistente");
  const pico = [3, 4, 5, 6, 7, 8].flatMap((s) => ref(s, 100)).concat(ref(2, 100), ref(1, 400));
  assert.equal(N.sauCargaVariacao(N.sauCargaSemanal(pico, HOJE, 8)).estado, "pico_isolado", "só a última semana completa ficou muito acima");
  const pouco = N.sauCargaVariacao(N.sauCargaSemanal([treino(5, 0, 100), treino(4, 0, 100), treino(1, 0, 800), treino(2, 0, 800)], HOJE, 8)); assert.equal(pouco.estado, "insuficiente", "menos de 3 treinos com carga nas 4 de referência");
  assert.equal(N.sauCargaVariacao(N.sauCargaSemanal([1, 2, 3, 4, 5, 6].flatMap((s) => ref(s, 100)), HOJE, 8)).estado, "estavel");
  const cur = N.sauCargaVariacao(N.sauCargaSemanal(alta.concat(treino(0, 1, 9000)), HOJE, 8)).semanas.slice(-1)[0]; assert.equal(cur.parcial, true, "a semana em andamento é marcada como parcial e não decide o sinal");
});
test("S9: intervalo entre sessões de musculação (mediana e maior), dias seguidos, séries e repetições só quando existem; sem grupo muscular", () => {
  const m = (off, ex = {}) => ({ id: off, inicio: dia(off) + "T18:00:00", tipo: "strength_training", dados: ex });
  const r = N.sauMusculacao([m(-20, { series: 12, repeticoes: 100 }), m(-18, { series: 10 }), m(-17), m(-10, { repeticoes: 80 }), { ...m(-9), tipo: "running" }, m(-17)], HOJE, 90);
  assert.equal(r.sessoes, 5); assert.equal(r.dias, 4, "duas sessões no mesmo dia contam um dia"); assert.deepEqual(r.intervalos, [2, 1, 7]); assert.equal(r.mediana, 2); assert.equal(r.maior, 7); assert.equal(r.consecutivos, 1);
  assert.equal(r.series, 22); assert.equal(r.comSeries, 2); assert.equal(r.repeticoes, 180); assert.equal(r.semAtividadeDias, 10);
  assert.ok(!("grupos" in r) && !("musculos" in r), "não infere grupo muscular");
  const vazio = N.sauMusculacao([], HOJE, 90); assert.deepEqual([vazio.sessoes, vazio.mediana, vazio.maior], [0, null, null]);
  assert.equal(N.sauMusculacao([m(-3)], HOJE, 90).mediana, null, "uma sessão só: sem intervalo");
});
test("S7: a consistência é a do Painel (pnConsistencia), sem segunda definição de dia ativo", () => {
  const c = N.pnConsistencia([dia(-1) + "T07:00", dia(-1) + "T18:00", dia(-9) + "T07:00"], dia(-27), HOJE); assert.equal(c.diasAtivos, 2); assert.equal(c.treinos, 3);
  const nuc = N.sauResumoAtiv([{ dados: { distancia: 5000, duracao: 1800, fc: 140, efeitoAerobico: 3 } }, { dados: { duracao: 600 } }]); assert.equal(nuc.n, 2); assert.equal(nuc.distanciaKm, 5); assert.equal(nuc.comFc, 1); assert.equal(nuc.fcMedia, 140);
});

/* ---------- S10: VO2 máx e condicionamento ---------- */
const vo2 = (off, v, tipo = "running") => ({ id: off, inicio: dia(off) + "T07:00:00", tipo, dados: { vo2max: v } });
test("S10: sem VO₂ máx nos registros, não inventa nada; tendência só com a mesma direção em duas janelas e ≥ 1 ponto", () => {
  const v0 = N.sauVo2([{ id: 1, inicio: dia(-1) + "T07:00", tipo: "running", dados: { fc: 140 } }], HOJE); assert.deepEqual([v0.n, v0.tendencia, v0.atual], [0, "sem_dados", undefined]);
  const sobe = N.sauVo2(Array.from({ length: 16 }, (_, i) => vo2(-7 * i, 54 - 0.5 * i)), HOJE); assert.equal(sobe.tendencia, "subindo"); assert.ok(sobe.atual > 52 && sobe.v3 && sobe.v3.dif > 0 && sobe.movel.length > 3);
  const cai = N.sauVo2(Array.from({ length: 12 }, (_, i) => vo2(-7 * i, 48 + 0.5 * i)), HOJE); assert.equal(cai.tendencia, "caindo");
  const estavel = N.sauVo2(Array.from({ length: 12 }, (_, i) => vo2(-7 * i, 50 + (i % 2) * 0.2)), HOJE); assert.equal(estavel.tendencia, "estavel");
  const pouco = N.sauVo2([vo2(-3, 50)], HOJE); assert.equal(pouco.tendencia, "insuficiente"); assert.equal(pouco.atual, null); assert.equal(pouco.ultimo.v, 50, "o último valor real aparece, sem estimativa");
  assert.equal(N.sauVo2([vo2(-3, 0), vo2(-4, "x")], HOJE).n, 0, "valor inválido é ignorado");
  const o = N.sauVo2(Array.from({ length: 12 }, (_, i) => vo2(-7 * i, 54 - 0.5 * i)), HOJE); assert.equal(o.v6, null, "6 meses sem amostra: não mostra");
});
test("minutos de intensidade por semana: moderados + 2 × vigorosos, contra 150; semana sem dia medido fica sem valor", () => {
  const d = serie(10, (i) => (i >= -2 ? { minModerados: 20, minVigorosos: 10 } : i >= -6 ? {} : null));
  const w = N.sauMinutosSemana(d, HOJE, 3); assert.equal(w.length, 3); const atual = w[2]; assert.equal(atual.min, 40 * 3 > 0 ? atual.min : null); assert.ok(atual.min >= 40 && atual.meta === 150 && atual.parcial === true);
  assert.equal(w[0].min, null, "semana sem nenhum dia medido");
});
test("eficiência aeróbica: só atividades do mesmo tipo, de terreno plano e esforço parecido; sem amostra nas duas janelas não compara", () => {
  const c = (off, dist, tempo, fc, subida, tipo = "running") => ({ id: off + tipo, inicio: dia(off) + "T07:00:00", tipo, dados: { distancia: dist, emMovimento: tempo, fc, subida } });
  const bom = [-2, -9, -16, -23].map((o, i) => c(o, 5000, 1800 - i * 10, 145, 20)).concat([-30, -37, -44, -51].map((o) => c(o, 5000, 1900, 146, 20)));
  const e = N.sauEficiencia(bom.concat([c(-5, 5000, 1500, 175, 20), c(-6, 5000, 1700, 145, 400)]), HOJE)[0];
  assert.equal(e.tipo, "running"); assert.equal(e.comparavel, true); assert.equal(e.nAtual, 4); assert.equal(e.nAnterior, 4); assert.ok(e.atual > e.anterior); assert.equal(e.elegiveis, 9, "subida de 80 m/km fica de fora");
  assert.equal(e.comparaveis, 8, "esforço muito diferente (175 bpm) fica de fora");
  const poucas = N.sauEficiencia([c(-2, 5000, 1800, 145, 20), c(-40, 5000, 1900, 145, 20)], HOJE)[0]; assert.equal(poucas.comparavel, false); assert.match(poucas.motivo, /poucas atividades/);
  assert.deepEqual(N.sauEficiencia([c(-2, 1000, 400, 150, 5)], HOJE), [], "menos de 2 km não entra"); assert.deepEqual(N.sauEficiencia([c(-2, 5000, 1800, 145, undefined)], HOJE), [], "sem dado de relevo não entra");
});

/* ---------- S8: recuperação depois de treino forte ---------- */
test("S8: dias até a VFC voltar à mediana pessoal depois de treino forte; amostra insuficiente suprime", () => {
  const ativs = [], dias = [];
  for (let k = 0; k < 23; k++) { const T = -100 + 4 * k; ativs.push({ id: k, inicio: dia(T) + "T07:00:00", tipo: "running", dados: { carga: k % 2 ? 100 : 200 } }); }
  const forte = new Set(ativs.filter((a) => a.dados.carga === 200).map((a) => a.inicio.slice(0, 10)));
  for (let i = -170; i <= 0; i++) { const ontem = N.somaDiasISO(dia(i), -1); dias.push({ data: dia(i), dados: { vfc: { noite: forte.has(ontem) ? 45 : 56 } } }); }
  const r = N.sauRecuperacaoTreino(dias, ativs, HOJE); assert.ok(r.n >= 5); assert.equal(r.mediana, 2, "a VFC volta no 2º dia"); assert.equal(r.naoVoltou, 0); assert.equal(r.limiar, 200);
  const poucos = N.sauRecuperacaoTreino(dias, ativs.slice(-6), HOJE); assert.equal(poucos.n, 0); assert.match(poucos.motivo, /poucos dias com treino e carga/);
  assert.match(N.sauRecuperacaoTreino(dias, [], HOJE).motivo, /poucos/);
});

/* ---------- S11: mudança persistente ---------- */
test("S11: tendência só quando a direção se repete nas duas janelas; mudança recente que não se repetiu é oscilação; amostra pequena não calcula", () => {
  const f = (g) => N.sauMudancas(serie(90, (i) => ({ fcRepouso: g(i) })), HOJE).find((m) => m.k === "fc");
  const rampa = f((i) => 50 + (i + 89) * 0.2); assert.equal(rampa.estado, "tendencia"); assert.equal(rampa.dir, "subiu"); assert.equal(rampa.melhor, false, "FC de repouso subir é pior"); assert.ok(rampa.dif >= 3 && rampa.difDeslocada >= 3);
  const degrau = f((i) => (i >= -19 ? 56 : 50)); assert.equal(degrau.estado, "oscilacao", "mudou agora, mas a janela deslocada não confirma");
  const estavel = f((i) => 50 + (i % 2)); assert.equal(estavel.estado, "estavel"); assert.equal(estavel.melhor, null);
  const pouco = N.sauMudancas(serie(15, () => ({ fcRepouso: 50 })), HOJE).find((m) => m.k === "fc"); assert.equal(pouco.estado, "sem"); assert.match(pouco.motivo, /menos de 20 dias/);
  const queda = N.sauMudancas(serie(90, (i) => ({ vfc: { noite: 60 - (i + 89) * 0.3 } })), HOJE).find((m) => m.k === "vfc"); assert.equal(queda.estado, "tendencia"); assert.equal(queda.dir, "caiu"); assert.equal(queda.melhor, false);
  assert.ok(N.SAU_METRICAS.every((m) => m.limiar > 0), "limiar por métrica");
});
test("tendência (agrupamento): 30 dias por dia, 90 dias por semana, 365 por mês; ignora dia sem a medida", () => {
  const d = serie(120, (i) => ({ fcRepouso: i % 5 ? 50 : undefined })), f = N.SAU_CAMPOS.fc;
  assert.equal(N.sauAgrupar(d, f, "30", HOJE).length, 24); const sem = N.sauAgrupar(d, f, "90", HOJE); assert.ok(sem.length >= 12 && sem.length <= 14); assert.ok(sem.every((g) => /^\d{4}-\d{2}-\d{2}$/.test(g.k)));
  assert.ok(N.sauAgrupar(d, f, "365", HOJE).every((g) => /^\d{4}-\d{2}$/.test(g.k))); assert.equal(N.sauAgrupar([], f, "30", HOJE).length, 0);
});

/* ---------- preferências ---------- */
test("preferências: padrões (7 h, 3 treinos, nada oculto) e valores inválidos voltam ao padrão", () => {
  assert.deepEqual(N.sauPrefs(undefined), { sonoH: 7, treinos: 3, ocultar: false, esconderLocal: false });
  assert.deepEqual(N.sauPrefs({ sonoH: 8, treinos: 4, ocultar: true, esconderLocal: true }), { sonoH: 8, treinos: 4, ocultar: true, esconderLocal: true });
  assert.deepEqual(N.sauPrefs({ sonoH: 99, treinos: 2.5, ocultar: "sim", esconderLocal: 1 }), { sonoH: 7, treinos: 3, ocultar: false, esconderLocal: false });
});

/* ---------- ausência de mutação e classificação ---------- */
test("nenhuma regra altera as linhas recebidas (entrada congelada) nem depende de dados do legado", () => {
  const dias = congelar(serie(100, (i) => ({ vfc: { noite: i >= -4 ? 40 : vfcBase(i), faixaMin: 48 }, fcRepouso: fcBase(i), estresse: estBase(i), sono: { total: 7 * 3600, inicio: "23:00", fim: "06:00", nota: 80 }, bbMax: 70, passos: 8000, minModerados: 10 }), RECENTE));
  const ativs = congelar([treino(1, 0, 100), treino(2, 0, 100, { vo2max: 50, series: 3 }), { id: 9, inicio: dia(-3) + "T08:00:00", tipo: "strength_training", dados: { series: 10 } }]);
  assert.doesNotThrow(() => {
    sinais(dias); N.sauIndicadores(dias, HOJE); N.sauSonoVfc(dias, HOJE); N.sauMudancas(dias, HOJE); N.sauRecuperacaoTreino(dias, ativs, HOJE); N.sauMinutosSemana(dias, HOJE, 8);
    N.sauCargaVariacao(N.sauCargaSemanal(ativs, HOJE, 8)); N.sauMusculacao(ativs, HOJE, 90); N.sauVo2(ativs, HOJE); N.sauEficiencia(ativs, HOJE); N.sauAgrupar(dias, N.SAU_CAMPOS.vfc, "90", HOJE); N.sauQualidade(dias, HOJE);
  });
  /* o legado fica fora: a classificação (inalterada) separa antes; só 'meus' chega às regras */
  const c = N.sauClassificar([{ data: "2025-12-31", dados: { fcRepouso: 99 } }, { data: "2026-01-01", dados: { fcRepouso: 50 } }], [{ id: 1, inicio: "2025-12-31T23:50:00", tipo: "running", dados: { carga: 900 } }]);
  assert.deepEqual([c.meus.dias.length, c.legado.dias.length, c.legado.ativs.length], [1, 1, 1]); assert.equal(N.sauCargaSemanal(c.meus.ativs, "2026-01-05", 2).reduce((s, w) => s + w.carga, 0), 0);
  assert.equal(N.SAU_MARCO.data, "2026-01-01");
});
