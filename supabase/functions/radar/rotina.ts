// Radar de Preços: a rodada do servidor para UM dono (docs/radar.md): coleta das ofertas liberadas e, em seguida, o aviso de oportunidades por Web Push.
// Cada passo falha sozinho (um erro de coleta não impede o aviso, e vice-versa) e devolve só um resumo sem dados pessoais.
// Pura e testada (tests/radar_lote3.test.mjs): os bancos, o fetch e o relógio são injetados.
import { avisosRadar, type Banco as BancoAvisos } from "./avisos.ts";
import { rodarColeta, type BancoColeta } from "./coletores.ts";
import { descobertaDaRotina, type Contexto as ContextoDescoberta } from "./descoberta.ts";
import { pushPara, type BancoPush } from "./push.ts";
import type { Deps } from "./ssrf.ts";

const FUSO = "America/Sao_Paulo";
/* data local (AAAA-MM-DD) de Brasília para um instante: o "1 aviso por dia" vale pelo dia de Brasília, não pelo UTC */
export function diaEmSaoPaulo(ms: number): string {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat("en-US", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms))) p[x.type] = x.value;
  return p.year + "-" + p.month + "-" + p.day;
}

export type Contexto = { coleta: BancoColeta; avisos: BancoAvisos; push: BancoPush; deps: Deps; agora: () => number; fetchPush?: typeof fetch; coletar?: boolean; descoberta?: ContextoDescoberta };
const erroCurto = (e: unknown) => String((e as Error)?.message ?? e).replace(/[\u0000-\u001f]/g, " ").slice(0, 160);

export async function rodadaDoDono(uid: string, c: Contexto) {
  const r: Record<string, unknown> = {};
  if (c.coletar !== false) {
    try { r.coleta = await rodarColeta(uid, c.coleta, c.deps, c.agora, { origem: "rotina" }); } catch (e) { r.coleta = { erro: erroCurto(e) }; }
  }
  /* descoberta contínua: só roda se o dono ligou (radar-descoberta.rotina.ativa) e se a chave do provedor existe; dentro do orçamento de buscas. Desligada por padrão. */
  if (c.descoberta) { try { r.descoberta = await descobertaDaRotina(uid, c.descoberta); } catch (e) { r.descoberta = { erro: erroCurto(e) }; } }
  try { r.aviso = await avisosRadar(uid, diaEmSaoPaulo(c.agora()), (m) => pushPara(c.push, uid, m, c.fetchPush), c.avisos, c.agora()); } catch (e) { r.aviso = { enviado: false, erro: erroCurto(e) }; }
  return r;
}
