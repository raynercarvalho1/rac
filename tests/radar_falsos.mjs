// Dublês compartilhados dos testes da descoberta do Radar (radar_descoberta.test.mjs e radar_orcamento.test.mjs). NÃO é um teste (não termina em .test.mjs).
// Fetch e banco FALSOS: nenhuma chamada real ao SerpApi, nenhuma chave real, nenhum custo. A "chave" é um texto de teste.
// O banco falso imita o contrato do banco real: reservar() é uma seção crítica SÍNCRONA (o equivalente da trava por dono de radar_reservar_consulta); a regra vem de orcamento()/autorizar(), e a paridade
// com a função SQL é conferida em radar_orcamento_sql.test.mjs (PGlite).
import { orcamento, autorizar, configDescoberta, prepararGravacao } from "../supabase/functions/radar/descoberta.ts";
import { chaveObservacao } from "../supabase/functions/radar/ofertas.ts";

export const KEY = "CHAVE-DE-TESTE-NAO-E-REAL-0123456789";
export const UID = "11111111-1111-4111-8111-111111111111", ITEM = "bbbbbbbb-0000-4000-8000-000000000001";
export const ITEM_DADOS = { id: ITEM, nome: "Creme Hidratante Corporal Principia CH-02", marca: "Principia", modelo: "CH-02", apresentacao: "454 g", gtin: "0042882100690", ativo: true };
export const T0 = Date.parse("2026-11-11T15:00:00Z"), H = 3600_000, MIN = 60_000;

export const SHOP = { search_metadata: { status: "Success" }, shopping_results: [
  { title: "Creme Hidratante Principia Ch-02", product_id: "P1", product_link: "https://www.google.com/search?ibp=oshop&prds=catalogid:P1,productid:1", immersive_product_page_token: "TOKEN-A", source: "principiaskin.com", multiple_sources: true, price: "R$ 49,00", extracted_price: 49 },
  { title: "Kit 2 Creme Hidratante Principia CH-02 454g", product_id: "P2", product_link: "https://www.google.com/search?ibp=oshop&prds=productid:P2", immersive_product_page_token: "TOKEN-B", source: "Magalu", price: "R$ 133,92", extracted_price: 133.92 },
  { title: "Creme Hidratante Corporal Principia CH-02, 250g", product_id: "P3", product_link: "https://www.google.com/search?ibp=oshop&prds=productid:P3", source: "Amazon.com.br - Retail", price: "R$ 38,99", extracted_price: 38.99 },
] };
export const LOJAS = { product_results: { stores: [
  { name: "Drogasil", link: "https://www.drogasil.com.br/p/1", price: "R$ 130,00", extracted_price: 130, shipping: "+ R$ 9,90", shipping_extracted: 9.9, extracted_total: 139.9 },
  { name: "Loja Grátis", link: "https://loja.exemplo/p2", price: "R$ 135,00", extracted_price: 135, shipping: "Free" },
] } };

/* fetch falso: guarda cada pedido e responde conforme o engine; r(engine, params) devolve { status, body } ou lança */
export function fetchFalso(r) {
  const f = async (url) => { const u = new URL(url); f.pedidos.push({ host: u.host, caminho: u.pathname, p: Object.fromEntries(u.searchParams) });
    const x = await r(u.searchParams.get("engine"), Object.fromEntries(u.searchParams), u); return new Response(JSON.stringify(x.body), { status: x.status ?? 200 }); };
  f.pedidos = []; return f;
}
export const respostaPadrao = (engine) => (engine === "google_shopping" ? { body: SHOP } : { body: LOJAS });

/* banco falso em memória (mesma interface do banco real). b.falhas: { gravar, historico, concluir, reservar } liga falhas de persistência; b.latencia() simula a ida e a volta ao banco. */
export function bancoFalso({ itens = [ITEM_DADOS], config = {} } = {}) {
  let seq = 0; const b = { itens: itens.map((i) => ({ ...i })), cfg: config, cands: [], consultas: [], invalidados: [], hist: [], falhas: {}, chamadas: { reservar: 0, concluir: 0 }, latencia: () => Promise.resolve() };
  return Object.assign(b, {
    async item(_u, id) { return b.itens.find((i) => i.id === id) ?? null; }, async itensParaRotina(_u, max) { return b.itens.filter((i) => i.ativo).slice(0, max); }, async config() { return b.cfg; },
    async usos(_u, desde) { return b.consultas.filter((c) => c.buscas_gastas > 0 && c.iniciada_em >= desde).map((c) => ({ iniciada_em: c.iniciada_em, buscas_gastas: c.buscas_gastas, engine: c.engine, origem: c.origem, provedor: c.provedor })); },
    async reservar(_u, p) {
      await b.latencia(); b.chamadas.reservar++; if (b.falhas.reservar) throw new Error("banco fora (reservar)");
      /* ---- seção crítica síncrona (a trava por dono do banco real) ---- */
      const agora = Date.parse(p.iniciada_em);
      for (const c of b.consultas) if (c.status === "reservada" && Date.parse(c.iniciada_em) < agora - 10 * MIN) { c.status = "incerto"; c.erro_codigo = "reserva_orfa"; }
      const em = b.consultas.find((c) => c.status === "reservada" && c.item_id === p.item_id && c.chave_cache === p.chave_cache); if (em) return { ok: false, motivo: "em_andamento", id: em.id };
      if (!p.forcar) { const hit = b.consultas.filter((x) => x.item_id === p.item_id && x.chave_cache === p.chave_cache && x.status === "ok" && x.iniciada_em >= p.cache_desde).sort((a, c2) => (a.iniciada_em < c2.iniciada_em ? 1 : -1))[0]; if (hit) return { ok: false, motivo: "cache", cache_de: hit.id, resultados: hit.resultados }; }
      const cfg = { ...configDescoberta({}), limite_mensal: p.limites.mes, limite_dia: p.limites.dia, limite_expansoes_dia: p.limites.expansoes_dia, rotina: { ativa: true, max_itens: 3, limite_dia: p.limites.rotina_dia }, limites_engine: { [p.engine]: { dia: p.limites.engine_dia, mes: p.limites.engine_mes } } };
      const o = orcamento(b.consultas.filter((c) => c.buscas_gastas > 0), cfg, agora), a = autorizar(o, { engine: p.engine, origem: p.origem, custo: p.custo });
      const reg = { item_id: p.item_id, provedor: p.provedor, engine: p.engine, origem: p.origem, variante: p.variante, chave_cache: p.chave_cache, consulta: p.consulta, iniciada_em: p.iniciada_em, http_status: null, erro_codigo: null, erro_mensagem: null, resultados: 0, duracao_ms: 0, cache_de: null };
      if (!a.ok) { const id = "q" + ++seq; b.consultas.push({ ...reg, id, status: "bloqueada_orcamento", buscas_gastas: 0, erro_codigo: "orcamento_" + a.motivo, erro_mensagem: a.mensagem }); return { ok: false, motivo: a.motivo, mensagem: a.mensagem, usado: 0, limite: 0, id }; }
      const id = "q" + ++seq; b.consultas.push({ ...reg, id, status: "reservada", buscas_gastas: p.custo }); return { ok: true, id };
    },
    async concluir(_u, id, c) {
      await b.latencia(); b.chamadas.concluir++; if (b.falhas.concluir) throw new Error("banco fora (concluir)");
      const r = b.consultas.find((x) => x.id === id); if (!r || r.status !== "reservada") return false;
      Object.assign(r, { status: c.status, http_status: c.http, erro_codigo: c.codigo, erro_mensagem: c.mensagem, resultados: c.resultados, duracao_ms: c.duracao_ms, buscas_gastas: c.status === "erro" ? 0 : r.buscas_gastas }); return true;
    },
    async registrarConsulta(_u, c) { const id = "q" + ++seq; b.consultas.push({ ...c, id }); return id; },
    async candidatoPorId(_u, id) { return b.cands.find((c) => c.id === id) ?? null; },
    async gravarCandidatos(_u, itemId, _q, lista) { if (b.falhas.gravar) throw new Error("banco fora (candidatos)"); const { inserir, atualizar } = prepararGravacao(b.cands.filter((c) => c.item_id === itemId), lista);
      for (const c of inserir) b.cands.push({ ...c, id: "c" + ++seq, item_id: itemId, decisao: "pendente", oferta_id: null });
      for (const u of atualizar) b.cands[b.cands.findIndex((c) => c.id === u.id)] = { ...u, item_id: itemId }; return { novos: inserir.length, atualizados: atualizar.length }; },
    async ultimasObservacoes(_u, itemId) { const m = {}; for (const o of b.hist.filter((x) => x.item_id === itemId).sort((a, c) => (a.observado_em < c.observado_em ? 1 : -1))) { const k = chaveObservacao(o); if (!(k in m)) m[k] = { preco: o.preco, observado_em: o.observado_em }; } return m; },
    async inserirHistorico(_u, itemId, q, obs) { if (b.falhas.historico) throw new Error("banco fora (histórico)"); for (const o of obs) b.hist.push({ ...o, item_id: itemId, consulta_id: q }); },
    async invalidarToken(_u, id) { b.invalidados.push(id); const c = b.cands.find((x) => x.id === id); if (c) { c.page_token = null; c.token_observado_em = null; } },
  });
}
export const montar = (opc = {}, resp = respostaPadrao) => { const banco = bancoFalso(opc), f = fetchFalso(resp), t = { agora: T0 }; return { banco, f, t, ctx: { banco, fetch: f, chave: KEY, agora: () => t.agora } }; };
