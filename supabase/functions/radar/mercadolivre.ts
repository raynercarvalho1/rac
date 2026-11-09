// Radar de Preços: mapeamento da API OFICIAL do Mercado Livre (GET https://api.mercadolibre.com/items/{id}) para uma observação de preço. PRONTO PARA USAR, MAS NÃO VALIDADO:
// sem credencial, a API responde 403 (conferido em 09/11/2026), então este arquivo só foi testado com dados fictícios no formato da documentação oficial. O ciclo de token (OAuth authorization_code,
// access token de 6 h, refresh token de uso único e rotativo) NÃO existe ainda: depende de o dono criar o aplicativo e autorizar, e de um lugar privado (Edge Functions → Secrets / Vault) para os segredos.
// Nada aqui lê páginas do site do Mercado Livre (o robots.txt barra agentes de IA) nem usa token no navegador.

export type ItemML = {
  id?: string; title?: string; seller_id?: number; official_store_id?: number | null; price?: number; currency_id?: string; available_quantity?: number; status?: string; condition?: string; permalink?: string;
  attributes?: { id?: string; value_name?: string | null }[]; shipping?: { free_shipping?: boolean };
};
export type Identidade = { titulo: string | null; marca: string | null; modelo: string | null; gtin: string | null; vendedor_id: number | null; loja_oficial: boolean; condicao: string | null };
export type ObsML = { preco_produto: number; disponibilidade: "disponivel" | "indisponivel" | "desconhecida"; frete_situacao: "desconhecido"; frete_valor: null; evidencia: string; identidade: Identidade };

/* "MLB-1234567890" ou "MLB1234567890" em qualquer link do Mercado Livre; null se não houver (links de catálogo /p/MLB… são outro recurso e não entram) */
export function idDoLink(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)mercadol(ivre|ibre)\.com(\.br)?$/.test(u.hostname) || /^\/p\//.test(u.pathname)) return null;
    const m = /\b(MLB)-?(\d{6,14})\b/i.exec(u.pathname);
    return m ? m[1].toUpperCase() + m[2] : null;
  } catch (_) { return null; }
}

const attr = (it: ItemML, id: string) => { const v = (it.attributes ?? []).find((a) => a.id === id)?.value_name; return typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null; };

/* interpreta a resposta; só aceita BRL e preço positivo. Frete NUNCA vem daqui: free_shipping depende do CEP, então fica "desconhecido". */
export function observacaoDoItem(it: ItemML, idEsperado: string): { obs: ObsML } | { motivo: string } {
  if (!it || typeof it !== "object") return { motivo: "resposta_invalida" };
  if (it.id !== idEsperado) return { motivo: "item_diferente" };
  if (it.currency_id !== "BRL") return { motivo: "moeda_nao_brl" };
  if (typeof it.price !== "number" || !isFinite(it.price) || it.price <= 0) return { motivo: "sem_preco" };
  const q = it.available_quantity;
  const disp = it.status && it.status !== "active" ? "indisponivel" : typeof q === "number" ? (q > 0 ? "disponivel" : "indisponivel") : "desconhecida";
  return { obs: { preco_produto: Math.round(it.price * 100) / 100, disponibilidade: disp, frete_situacao: "desconhecido", frete_valor: null,
    evidencia: ("api.mercadolibre.com/items/" + idEsperado + (it.seller_id ? " · vendedor " + it.seller_id : "")).slice(0, 500),
    identidade: { titulo: it.title ? String(it.title).slice(0, 200) : null, marca: attr(it, "BRAND"), modelo: attr(it, "MODEL"), gtin: attr(it, "GTIN"), vendedor_id: typeof it.seller_id === "number" ? it.seller_id : null,
      loja_oficial: it.official_store_id != null, condicao: it.condition ?? null } } };
}

/* o que significa a resposta HTTP para a rodada (nada de insistir em 401/403) */
export function situacaoDaResposta(status: number): "ok" | "credencial" | "nao_encontrado" | "limite" | "erro" {
  return status >= 200 && status < 300 ? "ok" : status === 401 || status === 403 ? "credencial" : status === 404 ? "nao_encontrado" : status === 429 ? "limite" : "erro";
}
