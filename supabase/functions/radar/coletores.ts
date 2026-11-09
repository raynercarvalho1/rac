// Radar de Preços: arquitetura de coletores (docs/radar-fontes.md). Cada fonte é um coletor isolado, com frequência mínima, registro em radar_coletas,
// prevenção de duplicidade e parada em caso de falhas. Lógica pura e testada (tests/radar_servidor.test.mjs); nada aqui chama a rede por conta própria:
// a leitura vem injetada (deps). Só coleta oferta cuja LOJA o dono liberou (coleta_permitida) e cuja página o robots.txt permite.
//
// O que a coleta grava: SÓ o preço anunciado e a disponibilidade, na mesma modalidade da última observação confirmada pelo dono (só à vista). O frete depende do CEP:
// a observação entra com frete "desconhecido" (sem preço final) e o dono confirma o frete numa nova linha de correção. Nunca inventa histórico nem confirma equivalência.
import { extrairPagina, type Extraido } from "./extrair.ts";
import { lerPagina, type Deps } from "./ssrf.ts";

export type Loja = { id: string; nome: string; dominio: string | null; coleta_permitida: boolean; ativa: boolean };
export type OfertaColeta = { id: string; item_id: string; loja_id: string; url: string | null; situacao: string; equivalencia: string };
export type UltimaObs = { oferta_id: string; modalidade: string; meio: string | null; parcelas: number | null; preco_produto: number; disponibilidade: string | null; observado_em: string; fonte: string };
export type ColetaReg = { loja_id: string | null; status: string; iniciada_em: string };
export type NovaObs = { oferta_id: string; coleta_id: string | null; fonte: "coleta"; evidencia: string; modalidade: "a_vista"; meio: string; preco_produto: number; frete_situacao: "desconhecido"; frete_valor: null; taxas: 0; desconto: 0; disponibilidade: string; observado_em: string };

export type Coletor = {
  id: string; nome: string;
  /* estado honesto: "ativo" = implementado; "exige_credencial" = precisa de chave que o dono ainda não forneceu (nada é simulado) */
  estado: "ativo" | "exige_credencial";
  motivo?: string;
  intervaloMinHoras: number;
};
export const COLETORES: Coletor[] = [
  { id: "pagina_publica", nome: "Página pública (schema.org)", estado: "ativo", intervaloMinHoras: 12 },
  { id: "mercadolivre_api", nome: "Mercado Livre (API oficial)", estado: "exige_credencial", intervaloMinHoras: 12,
    motivo: "A API pública do Mercado Livre responde 401/403 sem token OAuth (conferido em 09/11/2026) e o robots.txt da loja barra agentes de IA: só com um aplicativo do próprio dono e o token dele." },
];

export const LIMITE_POR_RODADA = 20;
export const PAUSA_APOS_FALHAS = 3;
export const INTERVALO_ENTRE_PEDIDOS_MS = 5000;
const H = 3600_000;

/* a loja entra em pausa depois de N rodadas seguidas com falha (as mais recentes primeiro): não insiste numa loja que está recusando */
export function lojaEmPausa(coletas: ColetaReg[], lojaId: string, n = PAUSA_APOS_FALHAS): boolean {
  const l = coletas.filter((c) => c.loja_id === lojaId && c.status !== "em_andamento").sort((a, b) => (a.iniciada_em < b.iniciada_em ? 1 : -1)).slice(0, n);
  return l.length === n && l.every((c) => c.status === "falha");
}

/* quais ofertas coletar agora: lojas liberadas e não pausadas, oferta ativa com equivalência confirmada e link, com base à vista confirmada e fora do intervalo mínimo */
export function planejar(ofertas: OfertaColeta[], lojas: Loja[], ultimas: UltimaObs[], coletas: ColetaReg[], agora: number, intervaloHoras = COLETORES[0].intervaloMinHoras, limite = LIMITE_POR_RODADA) {
  const porLoja = new Map(lojas.map((l) => [l.id, l]));
  const ult = new Map<string, UltimaObs>();
  for (const u of ultimas) { const a = ult.get(u.oferta_id); if (!a || u.observado_em > a.observado_em) ult.set(u.oferta_id, u); }
  const alvos: OfertaColeta[] = [], pulos: { oferta_id: string; motivo: string }[] = [];
  for (const o of ofertas) {
    const l = porLoja.get(o.loja_id);
    const motivo = !o.url ? "sem_link" : o.situacao !== "ativa" ? "oferta_inativa" : o.equivalencia !== "confirmada" ? "equivalencia_nao_confirmada"
      : !l || !l.ativa ? "loja_inativa" : !l.coleta_permitida ? "coleta_nao_liberada" : !l.dominio ? "loja_sem_dominio" : lojaEmPausa(coletas, l.id) ? "loja_em_pausa"
      : !ult.get(o.id) ? "sem_base_confirmada" : ult.get(o.id)!.modalidade !== "a_vista" ? "base_nao_e_a_vista"
      : agora - Date.parse(ult.get(o.id)!.observado_em) < intervaloHoras * H ? "dentro_do_intervalo" : null;
    if (motivo) pulos.push({ oferta_id: o.id, motivo }); else alvos.push(o);
  }
  return { alvos: alvos.slice(0, limite), pulos, adiadas: Math.max(0, alvos.length - limite) };
}

/* a observação a gravar a partir do que a página declarou; null + motivo quando não dá para afirmar */
export function observacaoDaPagina(ex: Extraido, base: UltimaObs, ofertaId: string, coletaId: string | null, url: string, agoraISO: string): { obs: NovaObs } | { motivo: string } {
  if (!ex.preco || ex.preco.valor <= 0) return { motivo: "sem_preco" };
  if (!ex.moeda || ex.moeda.valor !== "BRL") return { motivo: "moeda_nao_confirmada" };
  const disp = ex.disponibilidade?.valor ?? "desconhecida";
  return { obs: { oferta_id: ofertaId, coleta_id: coletaId, fonte: "coleta", evidencia: url.slice(0, 500), modalidade: "a_vista", meio: base.meio || "outro", preco_produto: ex.preco.valor,
    frete_situacao: "desconhecido", frete_valor: null, taxas: 0, desconto: 0, disponibilidade: disp, observado_em: agoraISO } };
}

/* duplicidade: mesmo preço e mesma disponibilidade da última observação, com menos de 24 h, não grava de novo */
export function repete(ultima: UltimaObs, nova: { preco_produto: number; disponibilidade: string }, agora: number): boolean {
  return Math.round(ultima.preco_produto * 100) === Math.round(nova.preco_produto * 100) && (ultima.disponibilidade ?? "desconhecida") === nova.disponibilidade && agora - Date.parse(ultima.observado_em) < 24 * H;
}

export type BancoColeta = {
  lojas(uid: string): Promise<Loja[]>;
  ofertas(uid: string): Promise<OfertaColeta[]>;
  ultimas(uid: string): Promise<UltimaObs[]>;
  coletasRecentes(uid: string, desde: string): Promise<ColetaReg[]>;
  abrirColeta(uid: string, lojaId: string, origem: string, iniciadaEm: string): Promise<string>;
  fecharColeta(id: string, r: { status: "ok" | "parcial" | "falha"; terminada_em: string; ofertas_lidas: number; precos_gravados: number; falhas: number; erro_codigo?: string | null; erro_mensagem?: string | null }): Promise<void>;
  gravarPreco(uid: string, o: NovaObs): Promise<"gravado" | "duplicado">;
};
export type Opcoes = { origem?: "rotina" | "piloto" | "manual"; esperar?: (ms: number) => Promise<void>; limite?: number };

/* uma rodada para um dono. Nunca lança por falha de uma loja: cada falha vira um registro em radar_coletas. */
export async function rodarColeta(uid: string, banco: BancoColeta, deps: Deps, agora: () => number, op: Opcoes = {}) {
  const esperar = op.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const t0 = agora();
  const [lojas, ofertas, ultimas, coletas] = await Promise.all([banco.lojas(uid), banco.ofertas(uid), banco.ultimas(uid), banco.coletasRecentes(uid, new Date(t0 - 7 * 24 * H).toISOString())]);
  const plano = planejar(ofertas, lojas, ultimas, coletas, t0, undefined, op.limite);
  const porLoja = new Map<string, OfertaColeta[]>();
  for (const o of plano.alvos) (porLoja.get(o.loja_id) ?? porLoja.set(o.loja_id, []).get(o.loja_id)!).push(o);
  const resumo = { lojas: 0, lidas: 0, gravadas: 0, falhas: 0, pulos: plano.pulos, adiadas: plano.adiadas };
  const ultPor = new Map<string, UltimaObs>();
  for (const u of ultimas) { const a = ultPor.get(u.oferta_id); if (!a || u.observado_em > a.observado_em) ultPor.set(u.oferta_id, u); }
  for (const [lojaId, lista] of porLoja) {
    const loja = lojas.find((l) => l.id === lojaId)!;
    const cid = await banco.abrirColeta(uid, lojaId, op.origem ?? "rotina", new Date(agora()).toISOString());
    let lidas = 0, gravadas = 0, falhas = 0, ultimoCodigo: string | null = null, ultimoMotivo: string | null = null;
    resumo.lojas++;
    for (const [i, o] of lista.entries()) {
      if (i > 0) await esperar(INTERVALO_ENTRE_PEDIDOS_MS); // educado com a loja: um pedido por vez, com intervalo
      lidas++;
      try {
        const pag = await lerPagina(o.url!, [loja.dominio!], deps);
        if (!pag.ok) { falhas++; ultimoCodigo = pag.codigo; ultimoMotivo = pag.motivo; /* recusa, robots ou captcha: para esta loja agora */ if (["recusada", "robots_nao", "robots_indisponivel", "captcha"].includes(pag.codigo)) break; continue; }
        const r = observacaoDaPagina(extrairPagina(pag.html, pag.urlFinal), ultPor.get(o.id)!, o.id, cid, o.url!, new Date(agora()).toISOString());
        if ("motivo" in r) { falhas++; ultimoCodigo = r.motivo; ultimoMotivo = "a página não trouxe um preço em reais confiável"; continue; }
        if (repete(ultPor.get(o.id)!, r.obs, agora())) continue;
        if ((await banco.gravarPreco(uid, r.obs)) === "gravado") gravadas++;
      } catch (e) { falhas++; ultimoCodigo = "interno"; ultimoMotivo = String((e as Error)?.message ?? e).slice(0, 200); }
    }
    const status = falhas === 0 ? "ok" : gravadas > 0 || falhas < lidas ? "parcial" : "falha";
    await banco.fecharColeta(cid, { status, terminada_em: new Date(agora()).toISOString(), ofertas_lidas: lidas, precos_gravados: gravadas, falhas, erro_codigo: falhas ? (ultimoCodigo ?? "falha").replace(/[^a-z0-9_]/g, "_").slice(0, 40) : null, erro_mensagem: falhas ? ultimoMotivo : null });
    resumo.lidas += lidas; resumo.gravadas += gravadas; resumo.falhas += falhas;
  }
  return resumo;
}
export type { Deps, Extraido };
