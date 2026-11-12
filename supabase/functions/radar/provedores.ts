// Radar de Preços: camada de PROVEDORES da descoberta (docs/radar.md, "Provedores"). Pura e testada (tests/radar_descoberta.test.mjs): rede e relógio vêm injetados.
// Um provedor é qualquer fonte que, dado um produto, devolve candidatos (anúncios vistos). O orquestrador (descoberta.ts) só conhece esta interface: cache, orçamento, histórico e classificação não dependem do provedor.
// ESTADO REAL: só o SerpApi (Google Shopping) está implementado. Os demais estão registrados como "planejado", com o motivo, e NÃO fazem nenhuma chamada. Os três engines do SerpApi são UM provedor com três operações
// (buscar, e expandir lojas pelo Immersive Product ou pelo Google Product), não três provedores.
import { candidatosDoShopping, lojasDoProduto, type Candidato, type Intencao, type Variante } from "./ofertas.ts";
import { chamarSerp, chaveDaConsulta, type Engine, type Fetch } from "./serpapi.ts";

export type EstadoProvedor = "ativo" | "planejado";
export type FalhaProvedor = { ok: false; incerto: boolean; status: number | null; codigo: string; mensagem: string };
export type RespostaProvedor = { ok: true; status: number; candidatos: Candidato[] } | FalhaProvedor;
export type Plano = { engine: string; chave_cache: string; consulta: string | null; params: Record<string, string | number | boolean | undefined> };
export type CandidatoExpansivel = Candidato & { id: string };
export type ConfigBusca = { dominio_google: string; ttl_token_min: number };
export type PedidoExpansao = { candidato: CandidatoExpansivel; operacao: "imersivo" | "produto"; agoraMs: number; forcar: boolean; cfg: ConfigBusca };

export interface Provedor {
  id: string; nome: string; estado: EstadoProvedor; motivo?: string;
  /* créditos CONSERVADORES por engine (1 = uma busca do plano). O SerpApi não documenta o custo dos engines de loja: o orçamento assume 1 e a cota real (account.json) confirma. */
  custos: Record<string, number>;
  planejarBusca(v: Variante, cfg: ConfigBusca): Plano;
  executarBusca(plano: Plano, intencao: Intencao, agoraISO: string): Promise<RespostaProvedor>;
  planejarExpansao(p: PedidoExpansao): Plano | { erro: string; mensagem: string };
  executarExpansao(plano: Plano, c: CandidatoExpansivel, intencao: Intencao, agoraISO: string): Promise<RespostaProvedor>;
}

const falha = (f: { status: number | null; codigo: string; mensagem: string; incerto?: boolean }): FalhaProvedor => ({ ok: false, incerto: f.incerto === true, status: f.status, codigo: f.codigo, mensagem: f.mensagem });

/* SerpApi: Google Shopping (descoberta), Google Immersive Product (lojas por token; more_stores até 13) e Google Product (product_id ou token) */
export function provedorSerpapi(chave: string, f: Fetch): Provedor {
  const ENGINE_LOJAS: Record<"imersivo" | "produto", Engine> = { imersivo: "google_immersive_product", produto: "google_product" };
  return {
    id: "serpapi", nome: "SerpApi (Google Shopping)", estado: "ativo", custos: { google_shopping: 1, google_immersive_product: 1, google_product: 1 },
    planejarBusca(v, cfg) { const params = { q: v.q, gl: "br", hl: "pt-br", google_domain: cfg.dominio_google || undefined }; return { engine: "google_shopping", chave_cache: chaveDaConsulta("google_shopping", params), consulta: v.q, params }; },
    async executarBusca(plano, intencao, agoraISO) {
      const r = await chamarSerp("google_shopping", plano.params, chave, f); if (!r.ok) return falha(r);
      return { ok: true, status: r.status, candidatos: candidatosDoShopping(r.json, intencao, agoraISO) };
    },
    planejarExpansao({ candidato: c, operacao, agoraMs, forcar, cfg }) {
      const idade = c.token_observado_em ? agoraMs - Date.parse(c.token_observado_em) : Infinity, tokenVale = !!c.page_token && idade <= cfg.ttl_token_min * 60_000, engine = ENGINE_LOJAS[operacao];
      let params: Plano["params"];
      if (operacao === "imersivo") {
        if (!c.page_token) return { erro: "sem_token", mensagem: "Este anúncio não trouxe o token das lojas." };
        if (!tokenVale && !forcar) return { erro: "token_vencido", mensagem: "O token das lojas passou de " + cfg.ttl_token_min + " min. Refaça a busca (ou force a tentativa)." };
        params = { page_token: c.page_token, more_stores: true };
      } else if (c.page_token && (tokenVale || forcar)) params = { page_token: c.page_token, gl: "br", hl: "pt-br" };
      else if (c.product_id && c.catalogo) params = { product_id: c.product_id, offer_view: true, gl: "br", hl: "pt-br" };
      else return { erro: "sem_identificador", mensagem: "Sem token válido nem product_id de catálogo para consultar." };
      return { engine, chave_cache: chaveDaConsulta(engine, params), consulta: c.titulo.slice(0, 200), params };
    },
    async executarExpansao(plano, c, intencao, agoraISO) {
      const r = await chamarSerp(plano.engine as Engine, plano.params, chave, f); if (!r.ok) return falha(r);
      return { ok: true, status: r.status, candidatos: lojasDoProduto(r.json, c, intencao, plano.engine, agoraISO) };
    },
  };
}

/* o que NÃO está implementado (nenhum deles faz chamada): fica registrado para o painel e para a documentação não prometerem o que não existe */
export const PROVEDORES_PLANEJADOS: { id: string; nome: string; estado: "planejado"; motivo: string }[] = [
  { id: "mercadolivre", nome: "Mercado Livre (API oficial)", estado: "planejado", motivo: "exige aplicativo e OAuth do dono; a API responde 403 sem token (conferido em 09/11/2026). O mapeamento de mercadolivre.ts serve hoje só à coleta por link." },
  { id: "vtex_paginas", nome: "Páginas de lojas VTEX (leitura direta)", estado: "planejado", motivo: "a PoC de 11/11/2026 leu 7 lojas (EAN e preço no estado da página). Falta o adaptador que descobre a página do produto, respeita robots.txt e tem orçamento por loja." },
  { id: "consulta_direta_lojas", nome: "Consulta direta a lojas e farmácias", estado: "planejado", motivo: "a busca interna das lojas é proibida pelo robots.txt ou exige JavaScript; só vale com a URL do produto (a coleta por link já existe)." },
  { id: "afiliados", nome: "Feeds de afiliados (Awin, Lomadee, Shopee)", estado: "planejado", motivo: "exigem conta de afiliado e aprovação; não há acesso." },
];
export const registroDeProvedores = (ativos: Provedor[]) => [...ativos.map((p) => ({ id: p.id, nome: p.nome, estado: p.estado, motivo: p.motivo ?? null, engines: Object.keys(p.custos) })), ...PROVEDORES_PLANEJADOS.map((p) => ({ ...p, engines: [] as string[] }))];
