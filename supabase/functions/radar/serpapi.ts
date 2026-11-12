// Radar de Preços: adaptador do SerpApi (docs/radar-fontes.md). Pura e testada (tests/radar_descoberta.test.mjs): o fetch vem injetado e nada aqui lê segredo sozinho.
// Só fala com https://serpapi.com/search.json e https://serpapi.com/account.json, só com os engines e os parâmetros da lista abaixo, nunca registra a chave nem a URL e tira a chave de qualquer mensagem.
// Engines (documentação oficial lida em 11/11/2026): google_shopping (candidatos), google_immersive_product (lojas por page_token; more_stores até 13) e google_product (product_id ou page_token; variantes e price_insights).

export type Engine = "google_shopping" | "google_immersive_product" | "google_product";
export const PARAMS_PERMITIDOS: Record<Engine, string[]> = {
  google_shopping: ["q", "gl", "hl", "google_domain", "location", "min_price", "max_price", "sort_by", "free_shipping", "on_sale", "no_cache"],
  google_immersive_product: ["page_token", "more_stores", "next_page_token", "no_cache"],
  google_product: ["product_id", "page_token", "offer_view", "gl", "hl", "no_cache"],
};
/* incerto: a chamada pode ter sido cobrada mesmo sem resposta útil (rede, tempo esgotado, resposta ilegível, HTTP 5xx); o orçamento do RAC segura o crédito, como a reserva "incerta" da rac-ia */
export type Falha = { ok: false; incerto?: boolean; status: number | null; codigo: "sem_chave" | "chave_recusada" | "limite" | "rede" | "tempo_esgotado" | "resposta_invalida" | "erro_provedor" | "parametro_invalido"; mensagem: string };
export type Sucesso = { ok: true; status: number; json: any };
export type Resultado = Sucesso | Falha;
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
const USER_AGENT = "RAC-Radar/1.0 (descoberta de ofertas do dono do site)";

/* tira a chave (e o que parece chave) de qualquer texto que vá para a tela, o log ou o banco */
export function limparSegredo(t: unknown, chave: string): string {
  let s = String(t ?? ""); if (chave) s = s.split(chave).join("[chave]"); if (chave) s = s.split(encodeURIComponent(chave)).join("[chave]");
  return s.replace(/api_key=[^&\s"']+/gi, "api_key=[chave]").replace(/[\u0000-\u001f]/g, " ").slice(0, 300);
}

export function montarUrl(engine: Engine, params: Record<string, string | number | boolean | undefined | null>, chave: string): string | { erro: string } {
  const ok = PARAMS_PERMITIDOS[engine]; if (!ok) return { erro: "engine não permitido" };
  const u = new URL("https://serpapi.com/search.json"); u.searchParams.set("engine", engine);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (!ok.includes(k)) return { erro: "parâmetro não permitido para " + engine + ": " + k };
    const s = String(v); if (s.length > 4500) return { erro: "parâmetro grande demais: " + k };
    u.searchParams.set(k, s);
  }
  u.searchParams.set("api_key", chave);
  return u.toString();
}

/* resumo curto e estável de um texto longo (token do Google): cyrb53, só para a chave de cache */
function resumo(t: string): string { let h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16) + "." + t.length; }
/* chave estável da consulta (sem a chave de API e sem o no_cache): serve de cache e de registro. Valores longos (page_token) viram um resumo. */
export function chaveDaConsulta(engine: Engine, params: Record<string, string | number | boolean | undefined | null>): string {
  const p = Object.entries(params).filter(([k, v]) => v !== undefined && v !== null && v !== "" && k !== "no_cache").sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => k + "=" + (String(v).length > 120 ? "#" + resumo(String(v)) : String(v))).join("&");
  return (engine + "?" + p).slice(0, 600);
}

async function pedir(url: string, chave: string, f: Fetch, ms: number): Promise<Resultado> {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await f(url, { method: "GET", signal: ctl.signal, headers: { "User-Agent": USER_AGENT, "Accept": "application/json" } });
    const txt = await r.text();
    let json: any = null; try { json = JSON.parse(txt); } catch (_) { /* tratado abaixo */ }
    if (r.status === 401 || r.status === 403) return { ok: false, status: r.status, codigo: "chave_recusada", mensagem: "o SerpApi recusou a chave (HTTP " + r.status + ")" };
    if (r.status === 429) return { ok: false, status: 429, codigo: "limite", mensagem: "limite por hora ou fim das buscas do plano (HTTP 429)" };
    if (!json || typeof json !== "object") return { ok: false, incerto: true, status: r.status, codigo: "resposta_invalida", mensagem: "resposta que não é JSON (HTTP " + r.status + ")" };
    const estado = json.search_metadata?.status, msgErro = json.error === undefined || json.error === null ? "" : String(json.error);
    /* REGRA DE COBRANÇA (documentação do SerpApi: só busca bem-sucedida conta; erro e busca que falhou não contam). Nada além disso é presumido:
       - HTTP 200 + search_metadata.status "Success" = busca BEM-SUCEDIDA (a documentação diz que Success pode vir vazio e com a chave "error" preenchida): CONTA 1, mesmo vazia ("empty result sets count as 1 search"), e fica ok;
       - HTTP 200 com o texto de "nenhum resultado" mesmo sem search_metadata: idem (vazio válido, conta);
       - erro DEFINITIVO e documentado como não cobrado: 401/403 (chave), 429 (limite) ou status "Error" em search_metadata: não conta;
       - qualquer outro caso em que não dá para saber (outros 4xx, 5xx, 200 com erro sem search_metadata, status Processing, corpo ilegível, rede, tempo esgotado): INCERTO, o crédito fica retido. */
    if (r.ok && estado === "Success" && msgErro && !/hasn't returned any results|no results|did not return any results/i.test(msgErro)) return { ok: true, status: r.status, json: { shopping_results: [], ...json } };
    if (/hasn't returned any results|no results|did not return any results/i.test(msgErro) && r.ok) return { ok: true, status: r.status, json: { ...json, shopping_results: [] } };
    if (r.ok && !msgErro && (estado === undefined || estado === "Success")) return { ok: true, status: r.status, json };
    const msg = limparSegredo(msgErro || (estado !== undefined ? "busca terminou com status " + estado : "HTTP " + r.status), chave);
    if (estado === "Error") return { ok: false, status: r.status, codigo: "erro_provedor", mensagem: msg };
    return { ok: false, incerto: true, status: r.status, codigo: "erro_provedor", mensagem: msg };
  } catch (e) {
    const nome = (e as Error)?.name; return { ok: false, incerto: true, status: null, codigo: nome === "AbortError" ? "tempo_esgotado" : "rede", mensagem: nome === "AbortError" ? "o SerpApi não respondeu a tempo" : "falha de rede ao falar com o SerpApi" };
  } finally { clearTimeout(t); }
}

export async function chamarSerp(engine: Engine, params: Record<string, string | number | boolean | undefined | null>, chave: string, f: Fetch, ms = 30_000): Promise<Resultado> {
  if (!chave) return { ok: false, status: null, codigo: "sem_chave", mensagem: "a chave do SerpApi não está configurada nos Secrets da função" };
  const u = montarUrl(engine, params, chave); if (typeof u !== "string") return { ok: false, status: null, codigo: "parametro_invalido", mensagem: u.erro };
  return pedir(u, chave, f, ms);
}

/* cota real da conta (endpoint gratuito, não conta como busca): só números; e-mail, chave e plano nunca saem daqui */
export type Cota = { searches_per_month: number | null; this_month_usage: number | null; plan_searches_left: number | null; total_searches_left: number | null; this_hour_searches: number | null; account_rate_limit_per_hour: number | null };
export async function cotaDaConta(chave: string, f: Fetch, ms = 20_000): Promise<{ ok: true; cota: Cota } | Falha> {
  if (!chave) return { ok: false, status: null, codigo: "sem_chave", mensagem: "a chave do SerpApi não está configurada nos Secrets da função" };
  const r = await pedir("https://serpapi.com/account.json?api_key=" + encodeURIComponent(chave), chave, f, ms);
  if (!r.ok) return r;
  const n = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null), j = r.json;
  return { ok: true, cota: { searches_per_month: n(j.searches_per_month), this_month_usage: n(j.this_month_usage), plan_searches_left: n(j.plan_searches_left), total_searches_left: n(j.total_searches_left), this_hour_searches: n(j.this_hour_searches), account_rate_limit_per_hour: n(j.account_rate_limit_per_hour) } };
}
