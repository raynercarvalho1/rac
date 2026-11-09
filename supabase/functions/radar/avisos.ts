// Radar de Preços: aviso de oportunidades por Web Push, SÓ para o dono (docs/radar.md). Passo isolado e testado sem rede (tests/radar_servidor.test.mjs).
// Nada daqui altera a rotina da função garmin: para ligar, a garmin (ou a rotina da função radar) chama avisosRadar() num passo próprio, passando o envio já existente (pushPara).
// Sem duplicidade: cada aviso é amarrado à observação de preço (chave "rdop:<id>", a observação é imutável); no máximo 1 aviso por dia; a lista de chaves já avisadas
// fica em "pessoal" (chave radar-avisos) e é gravada com conferência de versão, para duas execuções ao mesmo tempo não avisarem duas vezes.
import { oportunidades, type Oferta, type Oportunidade, type Preco } from "./regras.ts";

export type Msg = { titulo: string; corpo: string; url: string; tag: string };
export type Cfg = { push: boolean; janela: number; vendedoresBloqueados: string[] };
export type Avisados = { chaves: string[]; ultimoDia: string | null; versao: string | null };
export type Banco = {
  config(uid: string): Promise<Cfg>;
  precos(uid: string): Promise<Preco[]>;
  ofertas(uid: string): Promise<(Oferta & { item_id: string })[]>;
  itens(uid: string): Promise<{ id: string; nome: string }[]>;
  /* o que o dono pagou, por item e modalidade (guardado em pessoal, chave radar-pagos): { item_id: { a_vista, parcelado } } */
  pagos(uid: string): Promise<Record<string, Record<string, number>>>;
  avisados(uid: string): Promise<Avisados>;
  /* grava só se a versão ainda for a lida (senão false: outra execução chegou antes) */
  gravarAvisados(uid: string, v: { chaves: string[]; ultimoDia: string | null }, versaoLida: string | null): Promise<boolean>;
};

export const URL_RADAR = "./#mercado/radar";
export const MAX_CHAVES = 2000;
const moeda = (v: number) => "R$ " + v.toFixed(2).replace(".", ",");

export function configPadrao(raw: unknown): Cfg {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const j = Number(o.janela);
  return {
    push: o.push?.on !== false,
    janela: [0, 30, 90, 180, 365].includes(j) ? j : 90,
    vendedoresBloqueados: Array.isArray(o.vendedoresBloqueados) ? o.vendedoresBloqueados.filter((x: unknown) => typeof x === "string").slice(0, 100) : [],
  };
}

export function montarMensagem(ops: Oportunidade[], nomes: Map<string, string>): Msg | null {
  if (!ops.length) return null;
  const linha = (o: Oportunidade) => {
    const m = o.motivos.reduce((a, x) => (x.pct !== null && (a.pct === null || x.pct < a.pct) ? x : a), o.motivos[0]);
    const quando = m.tipo === "menor_que_pago" ? "abaixo do que você pagou" : m.tipo === "menor_na_janela" ? "menor da janela" : "abaixo da última";
    return (nomes.get(o.item_id) ?? "Produto") + ": " + moeda(o.final) + (m.pct !== null ? " (" + String(m.pct).replace(".", ",") + "%, " + quando + ")" : "") + (o.modalidade === "parcelado" ? " parcelado" : " à vista") + (o.verificar ? " ⚠ conferir" : "");
  };
  return {
    titulo: "Radar de Preços: " + ops.length + (ops.length === 1 ? " oportunidade" : " oportunidades"),
    corpo: ops.slice(0, 3).map(linha).join("\n") + (ops.length > 3 ? "\n+ " + (ops.length - 3) + " no Radar" : ""),
    url: URL_RADAR, tag: "radar-oportunidades",
  };
}

/* resultado do envio, no formato do pushPara da garmin: "2 de 3 aparelhos" ou "nenhum aparelho com notificações ativas" */
export function lerResultadoPush(s: string): { ok: number; total: number } | null {
  const m = /^(\d+) de (\d+) aparelhos$/.exec(String(s ?? "").trim()); if (m) return { ok: +m[1], total: +m[2] };
  return /^nenhum aparelho/.test(String(s ?? "")) ? { ok: 0, total: 0 } : null;
}

/* uid = o dono que a rotina já identificou (nunca um membro da casa). enviar() = pushPara(adm, uid, …): só os aparelhos desse uid. */
export async function avisosRadar(uid: string, hoje: string, enviar: (m: Msg) => Promise<string>, banco: Banco, agora: number = Date.now()) {
  if (!uid) return { enviado: false, motivo: "sem destinatário" };
  const cfg = await banco.config(uid);
  if (!cfg.push) return { enviado: false, motivo: "avisos do Radar desligados nos ajustes" };
  const ja = await banco.avisados(uid);
  if (ja.ultimoDia === hoje) return { enviado: false, motivo: "o aviso de hoje já foi enviado" };
  const [precos, ofertas, itens, pagos] = await Promise.all([banco.precos(uid), banco.ofertas(uid), banco.itens(uid), banco.pagos(uid)]);
  const vistas = new Set(ja.chaves);
  const novas = oportunidades(precos, ofertas, { agora, janela: cfg.janela, pagos, vendedoresBloqueados: cfg.vendedoresBloqueados }).filter((o) => !vistas.has(o.chave));
  const msg = montarMensagem(novas, new Map(itens.map((i) => [i.id, i.nome])));
  if (!msg) return { enviado: false, motivo: "sem oportunidades novas" };
  const reservadas = [...ja.chaves, ...novas.map((o) => o.chave)].slice(-MAX_CHAVES);
  /* reserva ANTES de enviar: se outra execução chegou antes, a versão mudou e esta sai sem enviar */
  if (!(await banco.gravarAvisados(uid, { chaves: reservadas, ultimoDia: hoje }, ja.versao))) return { enviado: false, motivo: "outra execução já tratou os avisos de hoje" };
  let texto = "";
  try { texto = await enviar(msg); } catch (e) {
    const atual = await banco.avisados(uid);
    await banco.gravarAvisados(uid, { chaves: ja.chaves, ultimoDia: ja.ultimoDia }, atual.versao); // devolve: tenta de novo na próxima rotina
    throw e;
  }
  const r = lerResultadoPush(texto);
  if (!r || r.ok === 0) {
    const atual = await banco.avisados(uid);
    await banco.gravarAvisados(uid, { chaves: ja.chaves, ultimoDia: ja.ultimoDia }, atual.versao);
    return { enviado: false, motivo: r && r.total === 0 ? "nenhum aparelho inscrito" : "o envio não chegou a nenhum aparelho", oportunidades: novas.length };
  }
  return { enviado: true, oportunidades: novas.length, aparelhos: texto };
}
