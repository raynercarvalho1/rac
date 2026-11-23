// Dados extras do relógio (Lote 2, 23/11/2026): curvas do dia (batimentos, estresse, Body Battery), estado de treino, prontidão e tempo de recuperação,
// respiração/SpO₂ do dia e peso/composição corporal. Só funções puras (sem rede, sem banco, sem Deno): a função "garmin" faz as chamadas e grava;
// aqui ficam os caminhos da Garmin e a conversão para o formato compacto que vai em garmin_dia.dados (chaves novas; nada do que já existe muda).
// Formatos da Garmin variam por conta e aparelho: todo leitor devolve undefined quando não reconhece o dado (nunca inventa número).

export const PASSO_MIN = 15;                    // curvas do dia em blocos de 15 minutos (96 pontos)
const PONTOS = (24 * 60) / PASSO_MIN;

const num = (v: unknown): number | undefined => (typeof v === "number" && isFinite(v) ? v : undefined);
const arred = (v: number | undefined, casas = 2): number | undefined => (v == null ? undefined : Math.round(v * 10 ** casas) / 10 ** casas);
const vazio = (o: Record<string, unknown>) => { for (const k of Object.keys(o)) if (o[k] == null) delete o[k]; return Object.keys(o).length ? o : undefined; };

/* caminhos candidatos da API pessoal; cada um é tentado sozinho e um que a conta não libera não derruba os outros */
export const CAMINHOS = {
  fc: (d: string) => `/wellness-service/wellness/dailyHeartRate/${d}`,
  estresse: (d: string) => `/wellness-service/wellness/dailyStress/${d}`,
  treino: (d: string) => `/metrics-service/metrics/trainingstatus/daily/${d}`,
  prontidao: (d: string) => `/metrics-service/metrics/trainingreadiness/${d}`,
  respiracao: (d: string) => `/wellness-service/wellness/daily/respiration/${d}`,
  spo2: (d: string) => `/wellness-service/wellness/daily/spo2/${d}`,
  peso: (ini: string, fim: string) => `/weight-service/weight/dateRange?startDate=${ini}&endDate=${fim}`,
};

/* [[milissegundos, valor], ...] → 96 blocos de 15 min (média do bloco, arredondada); bloco sem leitura = null. A hora vem do relógio em UTC "local" da Garmin (calendarDate). */
export function bloquear(pares: unknown, dia: string, valido: (v: number) => boolean = (v) => v >= 0): (number | null)[] | undefined {
  if (!Array.isArray(pares)) return undefined;
  const ini = Date.parse(dia + "T00:00:00Z"), soma: number[] = new Array(PONTOS).fill(0), qtd: number[] = new Array(PONTOS).fill(0);
  let usados = 0;
  for (const p of pares) {
    const t = Array.isArray(p) ? num(p[0]) : undefined, v = Array.isArray(p) ? num(p[1]) : undefined;
    if (t == null || v == null || !valido(v)) continue;
    const i = Math.floor((t - ini) / (PASSO_MIN * 60e3));
    if (i < 0 || i >= PONTOS) continue;
    soma[i] += v; qtd[i]++; usados++;
  }
  if (!usados) return undefined;
  return soma.map((s, i) => (qtd[i] ? Math.round(s / qtd[i]) : null));
}

/* batimentos do dia: { fc: [96], fcRepouso } */
export function lerFcDia(r: any, dia: string) {
  const fc = bloquear(r?.heartRateValues, dia, (v) => v > 0);
  return fc ? { passoMin: PASSO_MIN, fc, fcRepouso: num(r?.restingHeartRate) } : undefined;
}

/* estresse e Body Battery do dia: { estresse: [96], bb: [96] }. Estresse negativo (-1/-2) = sem medida (movimento), fica fora. */
export function lerEstresseDia(r: any, dia: string) {
  const estresse = bloquear(r?.stressValuesArray, dia, (v) => v >= 0);
  const bbBruto = Array.isArray(r?.bodyBatteryValuesArray) ? r.bodyBatteryValuesArray.map((p: any) => [p?.[0], p?.[2]]) : undefined;   // [ts, status, nível, versão]
  const bb = bloquear(bbBruto, dia, (v) => v >= 0 && v <= 100);
  return estresse || bb ? { passoMin: PASSO_MIN, estresse, bb } : undefined;
}

/* estado de treino (Training Status): carga aguda/crônica, razão e rótulo; VO₂ máx do dia */
export function lerEstadoTreino(r: any) {
  const st = r?.mostRecentTrainingStatus?.latestTrainingStatusData;
  const disp = st && typeof st === "object" ? (Object.values(st)[0] as any) : undefined;
  const carga = disp?.acuteTrainingLoadDTO ?? r?.mostRecentTrainingLoadBalance ?? undefined;
  const vo2 = r?.mostRecentVO2Max?.generic ?? r?.mostRecentVO2Max?.cycling;
  return vazio({
    status: disp?.trainingStatusFeedbackPhrase ?? (disp?.trainingStatus != null ? String(disp.trainingStatus) : undefined),
    cargaAguda: arred(num(carga?.dailyTrainingLoadAcute), 0), cargaCronica: arred(num(carga?.dailyTrainingLoadChronic), 0),
    razao: arred(num(carga?.acwrPercent), 0), razaoStatus: typeof carga?.acwrStatus === "string" ? carga.acwrStatus : undefined,
    vo2max: arred(num(vo2?.vo2MaxPreciseValue ?? vo2?.vo2MaxValue), 1),
  });
}

/* prontidão para treinar (Training Readiness) e tempo de recuperação em minutos */
export function lerProntidao(r: any) {
  const x = Array.isArray(r) ? r[0] : r;
  return vazio({
    pontos: arred(num(x?.score), 0), nivel: typeof x?.level === "string" ? x.level : undefined,
    recuperacaoMin: arred(num(x?.recoveryTime), 0), sono: arred(num(x?.sleepScore), 0), vfc: arred(num(x?.hrvFactorPercent), 0),
  });
}

/* respiração e oxigenação do dia (resumos) */
export function lerRespiracaoDia(r: any) {
  return vazio({ media: arred(num(r?.avgWakingRespirationValue ?? r?.avgSleepRespirationValue), 1), min: arred(num(r?.lowestRespirationValue), 1), max: arred(num(r?.highestRespirationValue), 1) });
}
export function lerSpo2Dia(r: any) {
  return vazio({ media: arred(num(r?.averageSpO2 ?? r?.avgSpO2), 1), min: arred(num(r?.lowestSpO2), 1), ultimo: arred(num(r?.latestSpO2), 1) });
}

/* peso e composição: { "AAAA-MM-DD": { kg, gordura, agua, musculo, osso, imc } }. A Garmin manda o peso em gramas; vale a última pesagem do dia. */
export function lerPeso(r: any): Record<string, Record<string, number>> {
  const lista: any[] = Array.isArray(r?.dateWeightList) ? r.dateWeightList : Array.isArray(r?.dailyWeightSummaries) ? r.dailyWeightSummaries.map((d: any) => ({ calendarDate: d.summaryDate, ...(d.latestWeight ?? {}) })) : [];
  const out: Record<string, Record<string, number>> = {};
  const g = (v: unknown) => { const x = num(v); return x == null ? undefined : x > 1000 ? x / 1000 : x; };   // gramas → kg (valores já em kg ficam como estão)
  for (const w of lista) {
    const dia = String(w?.calendarDate ?? "").slice(0, 10), kg = g(w?.weight);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || kg == null) continue;
    const o = vazio({ kg: arred(kg, 2), gordura: arred(num(w?.bodyFat), 1), agua: arred(num(w?.bodyWater), 1), musculo: arred(g(w?.muscleMass), 2), osso: arred(g(w?.boneMass), 2), imc: arred(num(w?.bmi), 1) });
    if (o) out[dia] = o as Record<string, number>;
  }
  return out;
}

/* a forma de uma resposta desconhecida (só nomes de chaves e tamanhos), para ajustar o leitor sem guardar dado pessoal */
export function formato(r: unknown, nivel = 0): unknown {
  if (Array.isArray(r)) return { lista: r.length, item: r.length && nivel < 2 ? formato(r[0], nivel + 1) : undefined };
  if (r && typeof r === "object") { const o: Record<string, unknown> = {}; for (const k of Object.keys(r as object).slice(0, 25)) o[k] = nivel < 2 ? formato((r as any)[k], nivel + 1) : typeof (r as any)[k]; return o; }
  return typeof r;
}
