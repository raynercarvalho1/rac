// Radar de Preços: descoberta de ofertas (docs/radar.md, "Descoberta"). Orquestra variantes de consulta, cache, orçamento de créditos, expansão de lojas, histórico e gravação dos candidatos.
// Pura e testada (tests/radar_descoberta.test.mjs, radar_orcamento.test.mjs): banco, provedores, fetch e relógio são injetados; nada aqui lê segredo nem chama a rede sozinho.
// O que a descoberta GRAVA: candidatos (anúncios vistos), o registro de cada consulta e o histórico de observações (radar_historico, só de acréscimo). Nada vira oferta, preço do histórico confirmado nem equivalência
// confirmada: isso é decisão do dono (botão "Acompanhar").
// CRÉDITOS (orçamento ATÔMICO): toda operação que pode consumir crédito do provedor (busca, expansão de lojas, busca da rotina) passa por UMA operação paga: 1) RESERVA no banco (radar_reservar_consulta: confere os limites e grava a reserva
// na mesma transação, sob trava por dono; o JavaScript não decide o orçamento); 2) chamada externa; 3) gravação dos candidatos; 4) CONCLUSÃO da reserva (radar_concluir_consulta, uma única vez).
// Contabilização: ok (inclusive HTTP 200 vazio) conta; erro definitivo documentado como não cobrado libera; incerto (rede, tempo esgotado, resposta ilegível, 5xx, 4xx sem respaldo documental, falha ao gravar depois da chamada, reserva órfã) RETÉM o crédito:
// não há reconciliação nem liberação por prazo; o orçamento só ganha folga quando o dia e o mês viram. Cache e bloqueio contam 0.
// Os limites internos (200/mês, 20/dia) NÃO são a franquia real da conta do provedor (250/mês no plano gratuito): são mais conservadores de propósito, e a cota real vem de cotaDoProvedor().
import { agrupar, chaveObservacao, deveRegistrarObservacao, mesclarCandidato, observacaoDoCandidato, variantesDeConsulta, type Candidato, type Intencao, type ObsHistorico } from "./ofertas.ts";
import { provedorSerpapi, registroDeProvedores, type Provedor, type RespostaProvedor } from "./provedores.ts";
import { cotaDaConta, type Cota, type Fetch } from "./serpapi.ts";

export type LimiteEngine = { dia: number | null; mes: number | null };
export type ConfigDesc = { limite_mensal: number; limite_dia: number; limite_expansoes_dia: number; consultas_por_busca: number; ttl_cache_h: number; ttl_token_min: number; dominio_google: string; custos: Record<string, number>;
  limites_engine: Record<string, LimiteEngine>; rotina: { ativa: boolean; max_itens: number; limite_dia: number } };
const inteiro = (v: unknown, min: number, max: number, padrao: number): number => { const n = Math.floor(Number(v)); return isFinite(n) && n >= min && n <= max ? n : padrao; };
const limiteOpc = (v: unknown): number | null => { if (v === undefined || v === null || v === "") return null; const n = Math.floor(Number(v)); return isFinite(n) && n >= 0 && n <= 5000 ? n : null; };
export const CUSTO_PADRAO = 1;
export const ENGINES = ["google_shopping", "google_immersive_product", "google_product"] as const;
/* padrões que protegem a franquia gratuita: 200/mês, 20/dia (no máximo 10 delas em expansões de lojas), 2 consultas por busca, cache de 24 h, 1 crédito por chamada de qualquer engine
   (o custo dos engines de loja não é documentado: assume-se o conservador e a cota real confirma), rotina DESLIGADA e, se ligada, no máximo 6 créditos por dia. Limite por engine (limite_por_engine: { engine: { dia, mes } }): opcional, sem padrão. */
export function configDescoberta(raw: unknown): ConfigDesc {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>, r = (o.rotina && typeof o.rotina === "object" ? o.rotina : {}) as Record<string, any>, c = (o.custo_por_engine && typeof o.custo_por_engine === "object" ? o.custo_por_engine : {}) as Record<string, any>;
  const le = (o.limite_por_engine && typeof o.limite_por_engine === "object" ? o.limite_por_engine : {}) as Record<string, any>, limites: Record<string, LimiteEngine> = {};
  for (const e of ENGINES) { const x = (le[e] && typeof le[e] === "object" ? le[e] : {}) as Record<string, unknown>; limites[e] = { dia: limiteOpc(x.dia), mes: limiteOpc(x.mes) }; }
  return { limite_mensal: inteiro(o.limite_mensal, 0, 5000, 200), limite_dia: inteiro(o.limite_dia, 0, 500, 20), limite_expansoes_dia: inteiro(o.limite_expansoes_dia, 0, 500, 10), consultas_por_busca: inteiro(o.consultas_por_busca, 1, 3, 2), ttl_cache_h: inteiro(o.ttl_cache_h, 1, 168, 24),
    ttl_token_min: inteiro(o.ttl_token_min, 5, 240, 30), dominio_google: /^google\.[a-z.]{2,10}$/.test(String(o.dominio_google ?? "")) ? String(o.dominio_google) : "",
    custos: { google_shopping: inteiro(c.google_shopping, 1, 5, CUSTO_PADRAO), google_immersive_product: inteiro(c.google_immersive_product, 1, 5, CUSTO_PADRAO), google_product: inteiro(c.google_product, 1, 5, CUSTO_PADRAO) },
    limites_engine: limites, rotina: { ativa: r.ativa === true, max_itens: inteiro(r.max_itens, 1, 5, 3), limite_dia: inteiro(r.limite_dia, 0, 100, 6) } };
}

export type ItemDesc = { id: string; nome: string; marca: string | null; modelo: string | null; apresentacao: string | null; gtin: string | null; ativo: boolean };
export type Origem = "manual" | "rotina";
/* status gravados em radar_consultas: "reservada" é o crédito travado antes da chamada (só a conclusão a resolve) */
export type StatusConsulta = "ok" | "erro" | "cache" | "bloqueada_orcamento" | "incerto" | "reservada";
export type ConsultaReg = { item_id: string | null; provedor: string; engine: string; origem: Origem; variante: string | null; chave_cache: string; consulta: string | null; status: StatusConsulta;
  http_status: number | null; erro_codigo: string | null; erro_mensagem: string | null; resultados: number; buscas_gastas: number; iniciada_em: string; duracao_ms: number; cache_de: string | null };
export type UsoReg = { iniciada_em: string; buscas_gastas: number; engine?: string; origem?: string; provedor?: string };
export type CandRow = Candidato & { id: string; item_id: string; decisao: string; oferta_id: string | null };
export type UltimaObs = { preco: number | null; observado_em: string };
type Base = Pick<ConsultaReg, "item_id" | "provedor" | "engine" | "origem" | "variante" | "chave_cache" | "consulta" | "iniciada_em">;
/* limites que o BANCO confere na reserva (valores da configuração; engine_* nulo = sem limite próprio) */
export type LimitesReserva = { mes: number; dia: number; expansoes_dia: number; rotina_dia: number; engine_dia: number | null; engine_mes: number | null };
export type PedidoReserva = Base & { custo: number; limites: LimitesReserva; forcar: boolean; cache_desde: string };
export type MotivoBloqueio = "mes" | "dia" | "engine_mes" | "engine_dia" | "expansoes" | "rotina";
export type RespostaReserva = { ok: true; id: string }
  | { ok: false; motivo: "cache"; cache_de: string; resultados: number } | { ok: false; motivo: "em_andamento"; id: string }
  | { ok: false; motivo: MotivoBloqueio; mensagem: string; usado: number; limite: number } | { ok: false; motivo: "entrada_invalida" };
export type Conclusao = { status: "ok" | "erro" | "incerto"; http: number | null; codigo: string | null; mensagem: string | null; resultados: number; duracao_ms: number };
export type BancoDesc = {
  item(uid: string, id: string): Promise<ItemDesc | null>;
  itensParaRotina(uid: string, max: number): Promise<ItemDesc[]>;
  config(uid: string): Promise<unknown>;
  usos(uid: string, desdeISO: string): Promise<UsoReg[]>;
  /* ATÔMICO (radar_reservar_consulta): confere cache, consulta em andamento e todos os limites e grava a reserva na mesma transação */
  reservar(uid: string, p: PedidoReserva): Promise<RespostaReserva>;
  /* resolve a reserva uma única vez (radar_concluir_consulta): false se ela já não estava "reservada" */
  concluir(uid: string, id: string, c: Conclusao): Promise<boolean>;
  registrarConsulta(uid: string, c: ConsultaReg): Promise<string>;
  candidatoPorId(uid: string, id: string): Promise<CandRow | null>;
  gravarCandidatos(uid: string, itemId: string, consultaId: string, lista: Candidato[]): Promise<{ novos: number; atualizados: number }>;
  invalidarToken(uid: string, id: string): Promise<void>;
  ultimasObservacoes(uid: string, itemId: string): Promise<Record<string, UltimaObs>>;
  inserirHistorico(uid: string, itemId: string, consultaId: string, obs: ObsHistorico[]): Promise<void>;
};
export type Contexto = { banco: BancoDesc; fetch: Fetch; chave: string; agora: () => number; provedores?: Provedor[] };
/* sem provedores injetados, o único implementado é o SerpApi (a chave vem do Secret da função; sem chave, a chamada devolve "sem_chave" sem rede) */
export const provedoresDe = (ctx: Contexto): Provedor[] => ctx.provedores ?? [provedorSerpapi(ctx.chave, ctx.fetch)];

export type Orcamento = { mes_usado: number; mes_limite: number; dia_usado: number; dia_limite: number; restante: number; expansoes_dia: number; expansoes_limite_dia: number; rotina_dia: number; rotina_limite_dia: number;
  por_engine: Record<string, { dia: number; mes: number }>; por_origem: Record<string, { dia: number; mes: number }>; engine_limites: Record<string, LimiteEngine> };
const FUSO = "America/Sao_Paulo";
export function diaBRT(ms: number): string {
  const p: Record<string, string> = {}; for (const x of new Intl.DateTimeFormat("en-US", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms))) p[x.type] = x.value;
  return p.year + "-" + p.month + "-" + p.day;
}
export const ehExpansao = (engine: string | undefined): boolean => !!engine && engine !== "google_shopping";
/* quanto do orçamento já foi usado no mês e no dia (de Brasília), no total e separado por engine e por origem (manual × rotina). Só LEITURA/exibição e a regra-espelho de autorizar():
   quem decide, na hora de gastar, é o banco (radar_reservar_consulta). As reservas em andamento e as incertas já contam (buscas_gastas > 0). */
export function orcamento(usos: UsoReg[], cfg: ConfigDesc, agoraMs: number): Orcamento {
  const hoje = diaBRT(agoraMs), mes = hoje.slice(0, 7); let m = 0, d = 0, ex = 0, ro = 0; const eng: Orcamento["por_engine"] = {}, ori: Orcamento["por_origem"] = {};
  for (const u of usos) {
    const t = Date.parse(u.iniciada_em); if (!isFinite(t)) continue; const dia = diaBRT(t), g = Math.max(0, Number(u.buscas_gastas) || 0); if (!g) continue;
    const noMes = dia.slice(0, 7) === mes, noDia = dia === hoje; if (!noMes) continue;
    m += g; if (noDia) { d += g; if (ehExpansao(u.engine)) ex += g; if (u.origem === "rotina") ro += g; }
    const e = (eng[u.engine ?? "?"] ??= { dia: 0, mes: 0 }); e.mes += g; if (noDia) e.dia += g;
    const o = (ori[u.origem ?? "manual"] ??= { dia: 0, mes: 0 }); o.mes += g; if (noDia) o.dia += g;
  }
  return { mes_usado: m, mes_limite: cfg.limite_mensal, dia_usado: d, dia_limite: cfg.limite_dia, restante: Math.max(0, Math.min(cfg.limite_mensal - m, cfg.limite_dia - d)), expansoes_dia: ex, expansoes_limite_dia: cfg.limite_expansoes_dia,
    rotina_dia: ro, rotina_limite_dia: cfg.rotina.limite_dia, por_engine: eng, por_origem: ori, engine_limites: cfg.limites_engine };
}
/* pode gastar "custo" créditos nesta operação? Mesma ordem e mesmas regras da função do banco (radar_reservar_consulta), conferidas lado a lado nos testes; o motivo do bloqueio é dito */
export function autorizar(o: Orcamento, op: { engine: string; origem: Origem; custo: number }): { ok: true } | { ok: false; motivo: MotivoBloqueio; mensagem: string } {
  const n = (u: number, l: number) => u + "/" + l, el = o.engine_limites?.[op.engine], eu = o.por_engine[op.engine] ?? { dia: 0, mes: 0 };
  if (o.mes_usado + op.custo > o.mes_limite) return { ok: false, motivo: "mes", mensagem: "limite mensal de buscas do RAC atingido (" + n(o.mes_usado, o.mes_limite) + ")" };
  if (o.dia_usado + op.custo > o.dia_limite) return { ok: false, motivo: "dia", mensagem: "limite diário de buscas do RAC atingido (" + n(o.dia_usado, o.dia_limite) + ")" };
  if (el && el.mes !== null && eu.mes + op.custo > el.mes) return { ok: false, motivo: "engine_mes", mensagem: "limite mensal do engine " + op.engine + " atingido (" + n(eu.mes, el.mes) + ")" };
  if (el && el.dia !== null && eu.dia + op.custo > el.dia) return { ok: false, motivo: "engine_dia", mensagem: "limite diário do engine " + op.engine + " atingido (" + n(eu.dia, el.dia) + ")" };
  if (ehExpansao(op.engine) && o.expansoes_dia + op.custo > o.expansoes_limite_dia) return { ok: false, motivo: "expansoes", mensagem: "limite diário de expansões de lojas atingido (" + n(o.expansoes_dia, o.expansoes_limite_dia) + ")" };
  if (op.origem === "rotina" && o.rotina_dia + op.custo > o.rotina_limite_dia) return { ok: false, motivo: "rotina", mensagem: "limite diário da rotina automática atingido (" + n(o.rotina_dia, o.rotina_limite_dia) + ")" };
  return { ok: true };
}
const inicioMesISO = (agoraMs: number): string => new Date(diaBRT(agoraMs).slice(0, 7) + "-01T03:00:00.000Z").toISOString();
const orcamentoAgora = async (uid: string, ctx: Contexto, cfg: ConfigDesc, agoraMs: number): Promise<Orcamento> => orcamento(await ctx.banco.usos(uid, inicioMesISO(agoraMs)), cfg, agoraMs);
const custoDe = (p: Provedor, engine: string, cfg: ConfigDesc): number => Math.max(CUSTO_PADRAO, cfg.custos[engine] ?? p.custos[engine] ?? CUSTO_PADRAO);
export const limitesDe = (cfg: ConfigDesc, engine: string): LimitesReserva => ({ mes: cfg.limite_mensal, dia: cfg.limite_dia, expansoes_dia: cfg.limite_expansoes_dia, rotina_dia: cfg.rotina.limite_dia,
  engine_dia: cfg.limites_engine[engine]?.dia ?? null, engine_mes: cfg.limites_engine[engine]?.mes ?? null });

/* separa o que é novo do que já existe (mesma loja + título + preço): o existente é atualizado e guarda o preço anterior; nada é apagado */
export function prepararGravacao(existentes: CandRow[], novos: Candidato[]): { inserir: Candidato[]; atualizar: CandRow[] } {
  const por = new Map(existentes.map((e) => [e.chave_dedup, e])), visto = new Set<string>(), usadoBase = new Set<string>(), inserir: Candidato[] = [], atualizar: CandRow[] = [];
  /* o preço faz parte da chave (dois preços do mesmo título na mesma loja são duas ofertas). Para o histórico, um anúncio que já existe com OUTRO preço é o mesmo anúncio visto de novo:
     casa por loja + título, no máximo uma vez por rodada; o que sobrar entra como novo (nada é descartado). */
  const semPreco = (k: string) => k.split("|").slice(0, 2).join("|");
  const porBase = new Map<string, CandRow>(); for (const e of existentes) if (!porBase.has(semPreco(e.chave_dedup))) porBase.set(semPreco(e.chave_dedup), e);
  for (const n of novos) {
    if (visto.has(n.chave_dedup)) continue; visto.add(n.chave_dedup);
    const base = semPreco(n.chave_dedup), exato = por.get(n.chave_dedup), porB = porBase.get(base);
    if (exato) { usadoBase.add(base); atualizar.push(mesclarCandidato(exato, n)); }
    else if (porB && !usadoBase.has(base) && !novos.some((o) => o !== n && o.chave_dedup === porB.chave_dedup)) { usadoBase.add(base); atualizar.push(mesclarCandidato(porB, n)); }
    else inserir.push(n);
  }
  return { inserir, atualizar };
}

/* histórico de observações por IDENTIDADE do produto (produto_chave + apresentacao_chave), não por anúncio: ver ofertas.ts. Grava só quando é novidade (primeira vez, preço mudou, ou passou de 20 h). */
export async function registrarHistorico(uid: string, itemId: string, consultaId: string, lista: Candidato[], agoraMs: number, ctx: Contexto): Promise<number> {
  const ultimas = await ctx.banco.ultimasObservacoes(uid, itemId), novas: ObsHistorico[] = [], vistos = new Set<string>();
  for (const c of lista) { const k = chaveObservacao(c); if (vistos.has(k)) continue; vistos.add(k); if (!deveRegistrarObservacao(ultimas[k], c, agoraMs)) continue; const o = observacaoDoCandidato(c); if (o) novas.push(o); }
  if (novas.length) await ctx.banco.inserirHistorico(uid, itemId, consultaId, novas);
  return novas.length;
}

const FATAL = new Set(["chave_recusada", "sem_chave", "limite"]);
export type StatusResumo = StatusConsulta | "em_andamento";
export type ResumoConsulta = { provedor: string; variante: string; engine: string; status: StatusResumo; resultados: number; novos?: number; atualizados?: number; historico?: number; gasto: number; registro_pendente?: boolean; erro?: { codigo: string; mensagem: string; http: number | null } };
const semGasto = { http_status: null, erro_codigo: null, erro_mensagem: null, resultados: 0, buscas_gastas: 0, duracao_ms: 0, cache_de: null } as const;

/* o desfecho de UMA operação paga, já com o gasto real contado */
type Desfecho<T> =
  | { fase: "cache"; resultados: number; cache_de: string }
  | { fase: "em_andamento" }
  | { fase: "bloqueada"; motivo: MotivoBloqueio; mensagem: string }
  | { fase: "entrada_invalida" }
  | { fase: "falha"; status: "erro" | "incerto"; gasto: number; definitiva: boolean; registro: boolean; erro: { codigo: string; mensagem: string; http: number | null } }
  | { fase: "ok"; gasto: number; resultados: number; dados: T; registro: boolean; consulta_id: string };

/* A operação paga: reserva (banco, atômica) → chamada externa → gravação → conclusão da reserva (uma vez). Regras de contabilização:
   - resposta com candidatos ou vazia (HTTP 200 bem-sucedido): ok, CONTA o custo (o vazio leva o código "sem_resultados" e fica no cache);
   - erro definitivo documentado como não cobrado (chave 401/403, 429, status "Error"): erro, LIBERA o crédito; qualquer outro 4xx é incerto;
   - incerto (rede, tempo esgotado, resposta ilegível, 5xx, exceção inesperada): incerto, RETÉM o crédito;
   - a resposta chegou mas a gravação dos candidatos falhou: incerto com "falha_persistencia", RETÉM o crédito (a cobrança é certa; só os dados se perderam), e nada é repetido sozinho;
   - a conclusão não pôde ser gravada: a reserva continua "reservada" (conta) e o banco a transforma em incerto ("reserva_orfa") na próxima reserva; nunca é liberada por prazo. */
async function operacaoPaga<T>(uid: string, ctx: Contexto, cfg: ConfigDesc, base: Base, custo: number, forcar: boolean, ini: number, chamar: () => Promise<RespostaProvedor>, persistir: (candidatos: Candidato[], consultaId: string) => Promise<T>): Promise<Desfecho<T>> {
  const res = await ctx.banco.reservar(uid, { ...base, custo, limites: limitesDe(cfg, base.engine), forcar, cache_desde: new Date(ini - cfg.ttl_cache_h * 3600_000).toISOString() });
  if (!res.ok) {
    if (res.motivo === "cache") { await ctx.banco.registrarConsulta(uid, { ...base, ...semGasto, status: "cache", resultados: res.resultados, cache_de: res.cache_de }); return { fase: "cache", resultados: res.resultados, cache_de: res.cache_de }; }
    if (res.motivo === "em_andamento") return { fase: "em_andamento" };
    if (res.motivo === "entrada_invalida") return { fase: "entrada_invalida" };
    return { fase: "bloqueada", motivo: res.motivo, mensagem: res.mensagem };
  }
  const id = res.id, concluir = async (c: Conclusao): Promise<boolean> => { try { return await ctx.banco.concluir(uid, id, c); } catch (_) { return false; } };
  let r: RespostaProvedor;
  try { r = await chamar(); } catch (_) { r = { ok: false, incerto: true, status: null, codigo: "rede", mensagem: "falha inesperada ao chamar o provedor" }; }
  const dur = ctx.agora() - ini;
  if (!r.ok) {
    const gravou = await concluir({ status: r.incerto ? "incerto" : "erro", http: r.status, codigo: r.codigo, mensagem: r.mensagem, resultados: 0, duracao_ms: dur });
    /* sem a conclusão gravada a reserva fica de pé (conta o custo) até virar incerto no banco: o gasto informado é o custo */
    return { fase: "falha", status: r.incerto || !gravou ? "incerto" : "erro", gasto: r.incerto || !gravou ? custo : 0, definitiva: !r.incerto && gravou, registro: gravou, erro: { codigo: r.codigo, mensagem: r.mensagem, http: r.status } };
  }
  let dados: T;
  try { dados = await persistir(r.candidatos, id); } catch (_) {
    const gravou = await concluir({ status: "incerto", http: r.status, codigo: "falha_persistencia", mensagem: "o provedor respondeu, mas os candidatos não foram gravados; o crédito fica retido", resultados: r.candidatos.length, duracao_ms: dur });
    return { fase: "falha", status: "incerto", gasto: custo, definitiva: false, registro: gravou, erro: { codigo: "falha_persistencia", mensagem: "O provedor respondeu, mas a gravação falhou: o crédito fica retido e nada será repetido sozinho.", http: r.status } };
  }
  const gravou = await concluir({ status: "ok", http: r.status, codigo: r.candidatos.length === 0 ? "sem_resultados" : null, mensagem: null, resultados: r.candidatos.length, duracao_ms: dur });
  return { fase: "ok", gasto: custo, resultados: r.candidatos.length, dados, registro: gravou, consulta_id: id };
}

/* 1) Descobrir: busca em cada provedor ATIVO, por variantes de consulta, com cache e orçamento. Candidatos classificados (individual, kit, combo, outra apresentação, relacionado). */
export async function descobrir(uid: string, entrada: { item_id: string; variantes?: string[]; forcar?: boolean; limiteConsultas?: number; origem?: Origem }, ctx: Contexto) {
  const item = await ctx.banco.item(uid, entrada.item_id);
  if (!item) return { ok: false as const, erro: "item_nao_encontrado" };
  if (!item.ativo) return { ok: false as const, erro: "item_arquivado" };
  const cfg = configDescoberta(await ctx.banco.config(uid)), intencao: Intencao = item, origem: Origem = entrada.origem === "rotina" ? "rotina" : "manual";
  let variantes = variantesDeConsulta(intencao);
  if (entrada.variantes?.length) variantes = variantes.filter((v) => entrada.variantes!.includes(v.id));
  variantes = variantes.slice(0, Math.max(1, Math.min(entrada.limiteConsultas ?? cfg.consultas_por_busca, 3)));
  const consultas: ResumoConsulta[] = [], avisos: string[] = []; let parar = false;
  for (const prov of provedoresDe(ctx).filter((p) => p.estado === "ativo")) {
    for (const v of variantes) {
      const plano = prov.planejarBusca(v, cfg), ini = ctx.agora(), iso = new Date(ini).toISOString(), base: Base = { item_id: item.id, provedor: prov.id, engine: plano.engine, origem, variante: v.id, chave_cache: plano.chave_cache, consulta: plano.consulta, iniciada_em: iso };
      const resumo = (x: Partial<ResumoConsulta> & Pick<ResumoConsulta, "status" | "resultados" | "gasto">): ResumoConsulta => ({ provedor: prov.id, variante: v.id, engine: plano.engine, ...x });
      const d = await operacaoPaga(uid, ctx, cfg, base, custoDe(prov, plano.engine, cfg), entrada.forcar === true, ini, () => prov.executarBusca(plano, intencao, iso),
        async (cands, consultaId) => { const g = await ctx.banco.gravarCandidatos(uid, item.id, consultaId, cands); return { g, h: await registrarHistorico(uid, item.id, consultaId, cands, ini, ctx) }; });
      if (d.fase === "cache") { consultas.push(resumo({ status: "cache", resultados: d.resultados, gasto: 0 })); continue; }
      if (d.fase === "em_andamento") { consultas.push(resumo({ status: "em_andamento", resultados: 0, gasto: 0 })); avisos.push("A consulta \"" + v.id + "\" já está em andamento: nada foi cobrado de novo."); continue; }
      if (d.fase === "entrada_invalida") { consultas.push(resumo({ status: "erro", resultados: 0, gasto: 0, erro: { codigo: "entrada_invalida", mensagem: "consulta recusada pelo banco", http: null } })); parar = true; break; }
      if (d.fase === "bloqueada") { consultas.push(resumo({ status: "bloqueada_orcamento", resultados: 0, gasto: 0 })); avisos.push("Nenhuma chamada nova foi feita: " + d.mensagem + "."); parar = true; break; }
      if (d.fase === "falha") {
        consultas.push(resumo({ status: d.status, resultados: 0, gasto: d.gasto, ...(d.registro ? {} : { registro_pendente: true }), erro: d.erro }));
        if (d.status === "incerto") avisos.push("Resposta incerta do provedor: " + d.gasto + " crédito(s) ficam retidos no orçamento (por segurança, nada é liberado antes de o dia ou o mês virar).");
        if (!d.registro) avisos.push("O registro desta consulta não pôde ser concluído: a reserva continua contada (nada é liberado por prazo).");
        if (FATAL.has(d.erro.codigo) || d.status === "incerto") { parar = true; break; } continue;
      }
      consultas.push(resumo({ status: "ok", resultados: d.resultados, novos: d.dados.g.novos, atualizados: d.dados.g.atualizados, historico: d.dados.h, gasto: d.gasto, ...(d.registro ? {} : { registro_pendente: true }) }));
      if (!d.registro) avisos.push("Os anúncios foram gravados, mas o fechamento do registro de consumo falhou: a reserva segue contada até ser conferida.");
      if (d.resultados === 0) avisos.push("A consulta \"" + v.id + "\" não trouxe anúncios (o provedor conta a busca mesmo vazia).");
    }
    if (parar) break;
  }
  return { ok: true as const, item: { id: item.id, nome: item.nome }, consultas, orcamento: await orcamentoAgora(uid, ctx, cfg, ctx.agora()), avisos };
}

/* 2) Expandir: as lojas de UM anúncio (immersive: até 13 lojas com more_stores; produto: product_id/token e variantes). O token do Google tem vida curta e a documentação não diz quanto:
   por isso há um prazo configurável (ttl_token_min); passado o prazo, não gasta busca à toa (use forcar para tentar mesmo assim). Conta no orçamento, com limite próprio por dia. */
export async function expandir(uid: string, entrada: { candidato_id: string; engine?: "imersivo" | "produto"; forcar?: boolean; origem?: Origem }, ctx: Contexto) {
  const c = await ctx.banco.candidatoPorId(uid, entrada.candidato_id);
  if (!c) return { ok: false as const, erro: "candidato_nao_encontrado" };
  const item = await ctx.banco.item(uid, c.item_id); if (!item) return { ok: false as const, erro: "item_nao_encontrado" };
  const prov = provedoresDe(ctx).find((p) => p.id === c.provedor && p.estado === "ativo"); if (!prov) return { ok: false as const, erro: "provedor_indisponivel", mensagem: "O provedor deste anúncio não está ativo." };
  const cfg = configDescoberta(await ctx.banco.config(uid)), ini = ctx.agora(), iso = new Date(ini).toISOString(), origem: Origem = entrada.origem === "rotina" ? "rotina" : "manual";
  const plano = prov.planejarExpansao({ candidato: c, operacao: entrada.engine === "produto" ? "produto" : "imersivo", agoraMs: ini, forcar: entrada.forcar === true, cfg });
  if ("erro" in plano) return { ok: false as const, erro: plano.erro, mensagem: plano.mensagem };
  const base: Base = { item_id: item.id, provedor: prov.id, engine: plano.engine, origem, variante: null, chave_cache: plano.chave_cache, consulta: plano.consulta, iniciada_em: iso };
  const d = await operacaoPaga(uid, ctx, cfg, base, custoDe(prov, plano.engine, cfg), entrada.forcar === true, ini, () => prov.executarExpansao(plano, c, item, iso),
    async (cands, consultaId) => { const g = await ctx.banco.gravarCandidatos(uid, item.id, consultaId, cands); return { g, h: await registrarHistorico(uid, item.id, consultaId, cands, ini, ctx), n: cands.length, grupos: agrupar(cands).length }; });
  if (d.fase === "cache") return { ok: true as const, status: "cache" as const, lojas: d.resultados, gasto: 0 };
  if (d.fase === "em_andamento") return { ok: false as const, erro: "em_andamento", mensagem: "Já existe uma consulta igual em andamento: nada foi cobrado de novo." };
  if (d.fase === "entrada_invalida") return { ok: false as const, erro: "entrada_invalida", mensagem: "Consulta recusada pelo banco." };
  if (d.fase === "bloqueada") return { ok: false as const, erro: "orcamento", mensagem: "Nenhuma chamada nova foi feita: " + d.mensagem + "." };
  if (d.fase === "falha") {
    if (d.definitiva && (d.erro.codigo === "erro_provedor" || d.erro.codigo === "resposta_invalida")) await ctx.banco.invalidarToken(uid, c.id);
    return { ok: false as const, erro: d.erro.codigo, mensagem: d.erro.mensagem, ...(d.status === "incerto" ? { incerto: true as const, gasto: d.gasto } : {}) };
  }
  return { ok: true as const, status: "ok" as const, lojas: d.dados.n, novos: d.dados.g.novos, atualizados: d.dados.g.atualizados, historico: d.dados.h, gasto: d.gasto, grupos: d.dados.grupos, ...(d.registro ? {} : { registro_pendente: true as const }) };
}

/* 3) Rotina: descoberta contínua, só se o dono ligou (radar-descoberta.rotina.ativa), uma consulta por produto monitorado, dentro do orçamento e do limite diário PRÓPRIO da rotina. Desligada por padrão. */
export async function descobertaDaRotina(uid: string, ctx: Contexto) {
  const cfg = configDescoberta(await ctx.banco.config(uid));
  if (!cfg.rotina.ativa) return { pulada: "desligada" as const };
  const itens = await ctx.banco.itensParaRotina(uid, cfg.rotina.max_itens), resumo: { consultas: number; gastas: number; cache: number; erros: number; parou: string | null } = { consultas: 0, gastas: 0, cache: 0, erros: 0, parou: null };
  for (const it of itens) {
    const r = await descobrir(uid, { item_id: it.id, limiteConsultas: 1, origem: "rotina" }, ctx);
    if (!r.ok) { resumo.erros++; continue; }
    for (const c of r.consultas) { resumo.consultas++; resumo.gastas += c.gasto; if (c.status === "cache") resumo.cache++; if (c.status === "erro" || c.status === "incerto") resumo.erros++; if (c.status === "bloqueada_orcamento") resumo.parou = "orcamento"; }
    if (resumo.parou || resumo.erros) break;
  }
  return resumo;
}

/* 4) Uso: orçamento do RAC (o que ele contou, por engine e por origem; reservas e incertas já entram), os provedores e, separado, a cota real do provedor (endpoint gratuito; só números) */
export async function usoDescoberta(uid: string, ctx: Contexto) {
  const cfg = configDescoberta(await ctx.banco.config(uid));
  return { ok: true as const, orcamento: await orcamentoAgora(uid, ctx, cfg, ctx.agora()), custos: cfg.custos, provedores: registroDeProvedores(provedoresDe(ctx)), config: { ttl_cache_h: cfg.ttl_cache_h, ttl_token_min: cfg.ttl_token_min, consultas_por_busca: cfg.consultas_por_busca, rotina: cfg.rotina } };
}
export async function cotaDoProvedor(ctx: Contexto): Promise<{ ok: true; cota: Cota } | { ok: false; erro: string; mensagem: string }> {
  const r = await cotaDaConta(ctx.chave, ctx.fetch); return r.ok ? r : { ok: false, erro: r.codigo, mensagem: r.mensagem };
}
