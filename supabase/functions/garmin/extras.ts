// Dados extras do relógio (Lote 2, corrigido em 23/11/2026 com os endpoints oficiais da Personal API da Garmin).
// Só funções puras (sem rede, sem banco, sem Deno): a função "garmin" faz as chamadas e grava; aqui ficam os caminhos e a conversão para o formato
// compacto de garmin_dia.dados.extras (chaves novas; nada do que já existe muda).
// Caminhos e parâmetros conferidos no cliente Python publicado pela Garmin (github.com/garmin/connect-personal-api-python). O cliente devolve o JSON bruto e
// não descreve o formato das respostas: por isso cada leitor aceita os nomes de campo conhecidos, devolve undefined quando não reconhece o dado
// (nunca inventa número) e a sondagem mostra a estrutura real (só nomes e tipos) para ajustar o leitor.

export const PASSO_MIN = 15;                    // curvas do dia em blocos de 15 minutos (96 pontos)
const PONTOS = (24 * 60) / PASSO_MIN;
/* intervalo máximo por consulta de intervalo: o mesmo limite de 28 dias que a função já respeita nos resumos diários (hipótese conservadora; se a Garmin
   recusar, o estado mostra "erro 400" e a janela menor resolve) */
export const JANELA_DIAS = 28;
/* sem a hora local na resposta, o dia é o de Brasília (UTC-3), o fuso do dono */
const DESLOC_PADRAO_MS = -3 * 3600e3;

const num = (v: unknown): number | undefined => (typeof v === "number" && isFinite(v) ? v : undefined);
const arred = (v: number | undefined, casas = 2): number | undefined => (v == null ? undefined : Math.round(v * 10 ** casas) / 10 ** casas);
const vazio = (o: Record<string, unknown>) => { for (const k of Object.keys(o)) if (o[k] == null) delete o[k]; return Object.keys(o).length ? o : undefined; };
const lista = (r: any, ...chaves: string[]): any[] => {
  if (Array.isArray(r)) return r;
  for (const k of chaves) if (Array.isArray(r?.[k])) return r[k];
  return [];
};
const diaDe = (v: unknown): string | undefined => { const s = typeof v === "string" ? v.slice(0, 10) : ""; return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined; };

/* Chaves de extras que a Personal API NÃO documenta (Training Status e Training Readiness): não são chamadas, não são gravadas e a sondagem as marca assim.
   Só entram de volta com documentação oficial do caminho. */
export const INDISPONIVEIS = ["treino", "prontidao"] as const;

/* caminhos oficiais (GET). Por data: fc e spo2. Por intervalo: estresse, bb, peso e vo2 (só sondagem). */
export const CAMINHOS = {
  fc: (d: string) => `/wellness-service/wellness/dailyHeartRate?date=${d}`,
  estresse: (ini: string, fim: string) => `/usersummary-service/stats/stress/daily/${ini}/${fim}`,
  peso: (ini: string, fim: string) => `/weight-service/weight/range/${ini}/${fim}?includeAll=true`,
  spo2: (d: string) => `/wellness-service/wellness/daily/spo2acclimation/${d}`,
  bb: (ini: string, fim: string) => `/wellness-service/wellness/bodyBattery/reports/daily?startDate=${ini}&endDate=${fim}`,
  sono: (ini: string, fim: string) => `/sleep-service/sleep/dailySleepSummariesByDate?startDate=${ini}&endDate=${fim}`,   // o mesmo conjunto que a função já coleta; aqui só os escores por fase
  vo2: (ini: string, fim: string) => `/metrics-service/metrics/maxmet/daily/${ini}/${fim}`,   // documentado; só sondagem, não grava (formato ainda não confirmado)
};

/* a Garmin manda os horários de início como TEXTO ("2026-11-22T03:00:00.0", sem fuso; confirmado pela sondagem de 23/11/2026) ou como número em milissegundos */
export function tms(v: unknown): number | undefined {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v !== "string" || !v.trim()) return undefined;
  const t = Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(v) ? v : v + "Z");
  return isFinite(t) ? t : undefined;
}
/* deslocamento do relógio para a hora local: (início local − início GMT) da resposta; sem isso, Brasília */
export function deslocamento(r: any): number {
  const l = tms(r?.startTimestampLocal), g = tms(r?.startTimestampGMT);
  return l != null && g != null ? l - g : DESLOC_PADRAO_MS;
}

/* [[milissegundos, valor], ...] → 96 blocos de 15 min do dia (média do bloco, arredondada); bloco sem leitura = null; nada válido = undefined.
   O valor é o 2º item do par ou, se o 2º for texto (status), o 3º. */
export function bloquear(pares: unknown, dia: string, valido: (v: number) => boolean = (v) => v >= 0, desloc = 0): (number | null)[] | undefined {
  if (!Array.isArray(pares)) return undefined;
  const ini = Date.parse(dia + "T00:00:00Z"), soma: number[] = new Array(PONTOS).fill(0), qtd: number[] = new Array(PONTOS).fill(0);
  let usados = 0;
  for (const p of pares) {
    if (!Array.isArray(p)) continue;
    const t = num(p[0]), v = typeof p[1] === "string" ? num(p[2]) : num(p[1]);
    if (t == null || v == null || !valido(v)) continue;
    const i = Math.floor((t + desloc - ini) / (PASSO_MIN * 60e3));
    if (i < 0 || i >= PONTOS) continue;
    soma[i] += v; qtd[i]++; usados++;
  }
  return usados ? soma.map((s, i) => (qtd[i] ? Math.round(s / qtd[i]) : null)) : undefined;
}

/* batimentos do dia (consulta por data): { passoMin, fc: [96], fcRepouso, fcMin, fcMax } */
export function lerFcDia(r: any, dia: string) {
  const fc = bloquear(r?.heartRateValues, dia, (v) => v > 0, deslocamento(r));
  if (!fc) return undefined;
  return vazio({ passoMin: PASSO_MIN, fc, fcRepouso: num(r?.restingHeartRate), fcMin: num(r?.minHeartRate), fcMax: num(r?.maxHeartRate) });
}

/* estresse (consulta por intervalo, um item por dia): { "AAAA-MM-DD": { nivel, alto, medio, baixo, descanso } } (durações em segundos, como a Garmin manda).
   Aceita o item com os números dentro de "values" ou soltos. Dia sem nenhum número fica de fora. */
export function lerEstresseIntervalo(r: any): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const it of lista(r, "data", "dailyStress", "stats")) {
    const dia = diaDe(it?.calendarDate ?? it?.date), v = it?.values ?? it;
    if (!dia) continue;
    const o = vazio({
      nivel: arred(num(v?.overallStressLevel), 0), alto: arred(num(v?.highStressDuration), 0), medio: arred(num(v?.mediumStressDuration), 0),
      baixo: arred(num(v?.lowStressDuration), 0), descanso: arred(num(v?.restStressDuration), 0),
    });
    if (o) out[dia] = o as Record<string, number>;
  }
  return out;
}

/* Body Battery (consulta por intervalo, um item por dia): { "AAAA-MM-DD": { carregou, gastou, min, max, curva: [96] } } */
export function lerBodyBatteryIntervalo(r: any): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const it of lista(r, "data", "bodyBatteryReports", "reports")) {
    const dia = diaDe(it?.date ?? it?.calendarDate) ?? (tms(it?.startTimestampLocal) != null ? diaDe(new Date(tms(it.startTimestampLocal)!).toISOString()) : undefined);
    if (!dia) continue;
    const curva = bloquear(it?.bodyBatteryValuesArray, dia, (v) => v >= 0 && v <= 100, deslocamento(it));
    const niveis = (curva ?? []).filter((x): x is number => x != null);
    const o = vazio({
      passoMin: curva ? PASSO_MIN : undefined, curva, carregou: arred(num(it?.charged), 0), gastou: arred(num(it?.drained), 0),
      min: niveis.length ? Math.min(...niveis) : undefined, max: niveis.length ? Math.max(...niveis) : undefined,
    });
    if (o) out[dia] = o;
  }
  return out;
}

/* escores do sono por fase (consulta por intervalo, um item por dia; o mesmo endpoint dos resumos de sono): { "AAAA-MM-DD": { escores: {duracao, estresse, despertares, rem, agitacao, leve, profundo} (texto
   da Garmin: EXCELLENT, GOOD, FAIR, POOR…), pct: {rem, leve, profundo} (%) } }. Só o que a Garmin mandou; dia sem nenhum escore fica de fora. */
export function lerSonoIntervalo(r: any): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  const q = (x: any) => (typeof x?.qualifierKey === "string" && /^[A-Z_]{2,30}$/.test(x.qualifierKey) ? x.qualifierKey : undefined);
  const p = (x: any) => arred(num(x?.value), 0);
  for (const it of lista(r, "data", "dailySleepDTO")) {
    const dia = diaDe(it?.calendarDate ?? it?.date), sc = it?.sleepScores;
    if (!dia || !sc || typeof sc !== "object") continue;
    const escores = vazio({ duracao: q(sc.totalDuration), estresse: q(sc.stress), despertares: q(sc.awakeCount), rem: q(sc.remPercentage), agitacao: q(sc.restlessness), leve: q(sc.lightPercentage), profundo: q(sc.deepPercentage) });
    const pct = vazio({ rem: p(sc.remPercentage), leve: p(sc.lightPercentage), profundo: p(sc.deepPercentage) });
    const o = vazio({ escores, pct });
    if (o) out[dia] = o;
  }
  return out;
}

/* oxigenação do dia (consulta por data): média, mínimo, último e média do sono */
export function lerSpo2Dia(r: any) {
  return vazio({ media: arred(num(r?.averageSpO2 ?? r?.avgSpO2), 1), min: arred(num(r?.lowestSpO2), 1), ultimo: arred(num(r?.latestSpO2), 1), sono: arred(num(r?.avgSleepSpO2), 1) });
}

/* peso e composição (consulta por intervalo, includeAll): { "AAAA-MM-DD": { kg, gordura, agua, musculo, osso, imc } }. A Garmin manda o peso em gramas
   (valor acima de 1000 é convertido; abaixo disso já é kg). Vale a última pesagem do dia. */
export function lerPeso(r: any): Record<string, Record<string, number>> {
  const itens: any[] = [];
  for (const d of lista(r, "dateWeightList")) itens.push(d);
  for (const d of lista(r?.dailyWeightSummaries ? r.dailyWeightSummaries : [])) {
    const todas = lista(d?.allWeightMetrics);
    const ult = d?.latestWeight ?? todas.slice().sort((a: any, b: any) => (num(a?.timestampGMT) ?? 0) - (num(b?.timestampGMT) ?? 0)).pop();
    if (ult) itens.push({ calendarDate: d?.summaryDate ?? ult?.calendarDate, ...ult });
  }
  const out: Record<string, Record<string, number>> = {};
  const g = (v: unknown) => { const x = num(v); return x == null ? undefined : x > 1000 ? x / 1000 : x; };
  for (const w of itens) {
    const dia = diaDe(w?.calendarDate ?? w?.summaryDate), kg = g(w?.weight);
    if (!dia || kg == null) continue;
    const o = vazio({ kg: arred(kg, 2), gordura: arred(num(w?.bodyFat), 1), agua: arred(num(w?.bodyWater), 1), musculo: arred(g(w?.muscleMass), 2), osso: arred(g(w?.boneMass), 2), imc: arred(num(w?.bmi), 1) });
    if (o) out[dia] = o as Record<string, number>;
  }
  return out;
}

/* a estrutura de uma resposta desconhecida: nomes de chaves, tipos e tamanhos de lista, NUNCA valores (nem de texto nem de número) */
export function formato(r: unknown, nivel = 0): unknown {
  if (r === null || r === undefined) return "vazio";
  if (Array.isArray(r)) return { lista: r.length, item: r.length && nivel < 3 ? formato(r[0], nivel + 1) : undefined };
  if (typeof r === "object") { const o: Record<string, unknown> = {}; for (const k of Object.keys(r as object).slice(0, 40)) o[k] = nivel < 3 ? formato((r as any)[k], nivel + 1) : typeof (r as any)[k]; return o; }
  return typeof r;
}
