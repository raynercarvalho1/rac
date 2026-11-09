// Radar de Preços: as regras de preço final e de oportunidade em TypeScript, IGUAIS às de nucleo.js (rdPrecoFinal, rdOportunidades), como a função garmin já faz
// com alertas_preco.ts. tests/radar_servidor.test.mjs roda os mesmos casos nas duas versões e exige o mesmo resultado. Puro: sem banco, sem rede.

export type Preco = {
  id: string; oferta_id: string; observado_em: string; registrado_em?: string; corrige_id?: string | null;
  modalidade: "a_vista" | "parcelado"; meio?: string | null; parcelas?: number | null;
  preco_produto: number | string; frete_situacao?: string | null; frete_valor?: number | string | null; taxas?: number | string | null; desconto?: number | string | null;
  disponibilidade?: string | null;
};
export type Oferta = { id: string; item_id: string; situacao?: string; equivalencia: string; vendedor?: string | null };
export type Oportunidade = {
  serie: string; preco_id: string; oferta_id: string; item_id: string; modalidade: string; meio: string; parcelas: number | null; final: number; observado_em: string;
  motivos: { tipo: string; referencia: number; diferenca: number; pct: number | null; em?: string; janela?: number | string }[]; pct: number; verificar: boolean; chave: string;
};

export const ANOMALIA = 0.5;
const cent = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return isFinite(n) ? Math.round((n + (n < 0 ? -1 : 1) * 1e-9) * 100) : null;
};
const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/* preço final = produto + frete confirmado + taxas − desconto; só com frete conhecido e item disponível (senão null) */
export function precoFinal(p: Preco): number | null {
  const fs = p.frete_situacao ?? "desconhecido";
  if (fs === "desconhecido" || p.disponibilidade !== "disponivel") return null;
  const pp = cent(p.preco_produto), fr = cent(p.frete_valor) ?? 0, tx = cent(p.taxas ?? 0), ds = cent(p.desconto ?? 0);
  if (pp === null || pp <= 0 || tx === null || ds === null) return null;
  return (pp + fr + tx - ds) / 100;
}
export const chaveSerie = (p: Preco) => [p.oferta_id, p.modalidade, p.meio || "outro", p.parcelas || 0].join("|");
const ordem = (a: Preco, b: Preco) => (Date.parse(a.observado_em) - Date.parse(b.observado_em)) || ((Date.parse(a.registrado_em ?? a.observado_em) - Date.parse(b.registrado_em ?? b.observado_em)) || 0);
export function vigentes(precos: Preco[]): Preco[] {
  const subst = new Set<string>(); for (const p of precos) if (p.corrige_id) subst.add(p.corrige_id);
  return precos.filter((p) => !subst.has(p.id));
}
export const chaveAviso = (precoId: string) => "rdop:" + precoId;
export const anomalia = (pct: number | null) => pct !== null && pct <= -ANOMALIA * 100;

export function oportunidades(precos: Preco[], ofertas: Oferta[], opc: { agora?: number; janela?: number; pagos?: Record<string, Record<string, number>>; vendedoresBloqueados?: string[] } = {}): Oportunidade[] {
  const jan = opc.janela ?? 90, agora = opc.agora ?? Date.now(), pagos = opc.pagos ?? {}, bloq = (opc.vendedoresBloqueados ?? []).map(norm).filter(Boolean);
  const porId = new Map(ofertas.map((o) => [o.id, o]));
  const series = new Map<string, Preco[]>();
  for (const p of vigentes(precos)) { const k = chaveSerie(p); (series.get(k) ?? series.set(k, []).get(k)!).push(p); }
  const out: Oportunidade[] = [];
  for (const k of [...series.keys()].sort()) {
    const l = series.get(k)!.slice().sort(ordem);
    const of = porId.get(l[0].oferta_id);
    if (!of || (of.situacao && of.situacao !== "ativa") || of.equivalencia !== "confirmada") continue;
    if (of.vendedor && bloq.includes(norm(of.vendedor))) continue;
    const pts = l.map((p) => ({ p, t: Date.parse(p.observado_em), final: precoFinal(p) }));
    const at = pts[pts.length - 1];
    if (at.final === null) continue;
    const ant = pts.length > 1 ? pts[pts.length - 2] : null;
    const mot: Oportunidade["motivos"] = [];
    const add = (tipo: string, ref: number, extra: Record<string, unknown> = {}) => {
      const dif = Math.round((at.final! - ref) * 100) / 100, pct = ref > 0 ? Math.round(dif / ref * 10000) / 100 : null;
      mot.push({ tipo, referencia: ref, diferenca: dif, pct, ...extra });
    };
    if (ant && ant.final !== null && at.final < ant.final) add("menor_que_ultima", ant.final, { em: ant.p.observado_em });
    let mn: typeof at | null = null;
    for (const x of pts.slice(0, -1)) if (x.final !== null && (!jan || (x.t >= agora - jan * 86400000 && x.t <= agora)) && (!mn || x.final < mn.final!)) mn = x;
    if (mn && at.final < mn.final!) add("menor_na_janela", mn.final!, { em: mn.p.observado_em, janela: jan || "todo" });
    const pago = (pagos[of.item_id] ?? {})[at.p.modalidade];
    if (pago != null && +pago > 0 && at.final < +pago) add("menor_que_pago", +pago);
    if (!mot.length) continue;
    const pior = mot.reduce((a, m) => (m.pct !== null && m.pct < a ? m.pct : a), 0);
    out.push({ serie: k, preco_id: at.p.id, oferta_id: of.id, item_id: of.item_id, modalidade: at.p.modalidade, meio: at.p.meio || "outro", parcelas: at.p.parcelas || null, final: at.final,
      observado_em: at.p.observado_em, motivos: mot, pct: pior, verificar: anomalia(pior), chave: chaveAviso(at.p.id) });
  }
  return out.sort((a, b) => (a.pct - b.pct) || (a.chave < b.chave ? -1 : 1));
}
