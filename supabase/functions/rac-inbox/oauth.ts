// RAC Inbox · conexão OAuth 2.0 do Gmail (Google Identity) e do Outlook (Microsoft identity platform + Graph). Lógica PURA: sem Deno, sem banco; a rede entra por `http` (os testes passam uma de mentira).
// Regras (docs/inbox.md, "Gmail e Outlook"):
//  - Fluxo "authorization code" com PKCE (S256) e `state` de uso único. O código volta ao SITE (redirect_uri), que o entrega à função autenticada (JWT + MFA); a função troca o código pelo token com o
//    client secret, que só existe nos Secrets da função. Nenhum endpoint público recebe o código.
//  - SÓ o refresh token é guardado (Vault, como a senha de app). O token de acesso vive na memória de UMA chamada e nunca é gravado, devolvido nem registrado.
//  - Toda falha vira CÓDIGO FECHADO; o corpo de resposta do provedor nunca é copiado para erro, resposta ou registro.
//  - URLs dos provedores são constantes (nada vem do navegador); a conta conectada é conferida contra o endereço cadastrado (cada conta Gmail/Outlook é uma conexão separada).

export type ProvedorOauth = "gmail" | "outlook";
export interface ConfigOauth { clientId: string; clientSecret: string; redirectUri: string }
export type AmbienteOauth = Partial<Record<ProvedorOauth, ConfigOauth | null>>;
export type Http = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/* escopos mínimos para o que o Inbox faz: ler, sincronizar, enviar, responder, encaminhar e gerenciar (nunca apagar definitivamente) */
export const ESCOPOS: Record<ProvedorOauth, string[]> = {
  gmail: ["openid", "email", "https://www.googleapis.com/auth/gmail.modify"],   // gmail.modify = ler, rótulos, lixeira, rascunhos e envio; não permite exclusão permanente
  outlook: ["offline_access", "openid", "email", "User.Read", "Mail.ReadWrite", "Mail.Send"],
};
export const ENDPOINTS: Record<ProvedorOauth, { autorizar: string; token: string; revogar: string | null; identidade: string }> = {
  gmail: { autorizar: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", revogar: "https://oauth2.googleapis.com/revoke", identidade: "https://openidconnect.googleapis.com/v1/userinfo" },
  outlook: { autorizar: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize", token: "https://login.microsoftonline.com/common/oauth2/v2.0/token", revogar: null, identidade: "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName" },
};
export const RE_STATE = /^[A-Za-z0-9_-]{43}$/;
export const RE_CODIGO = /^[\x21-\x7e]{10,4096}$/;   // o código do provedor: ASCII visível, sem espaço

/* a rede real do OAuth: sem redirecionamento e com tempo limite (só as URLs constantes de ENDPOINTS são chamadas) */
export const httpReal: Http = (url, init) => fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(15000) });
const b64url = (b: Uint8Array): string => { let s = ""; for (const x of b) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const sha256 = async (t: string): Promise<Uint8Array> => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)));
const hex = (b: Uint8Array): string => Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
export const hashDoEstado = async (estado: string): Promise<string> => hex(await sha256(estado));

/* state (43 caracteres), verificador PKCE (64) e desafio S256; só o HASH do state e o verificador vão ao banco */
export async function novoPkce(): Promise<{ estado: string; estadoHash: string; verificador: string; desafio: string }> {
  const estado = b64url(crypto.getRandomValues(new Uint8Array(32))), verificador = b64url(crypto.getRandomValues(new Uint8Array(48)));
  return { estado, estadoHash: await hashDoEstado(estado), verificador, desafio: b64url(await sha256(verificador)) };
}

export function urlAutorizacao(prov: ProvedorOauth, cfg: ConfigOauth, a: { estado: string; desafio: string; loginHint?: string | null }): string {
  const q = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: "code", scope: ESCOPOS[prov].join(" "), state: a.estado, code_challenge: a.desafio, code_challenge_method: "S256" });
  if (a.loginHint) q.set("login_hint", a.loginHint);
  if (prov === "gmail") { q.set("access_type", "offline"); q.set("prompt", "consent"); q.set("include_granted_scopes", "false"); }   // consent: o Google só entrega refresh token na autorização explícita
  else { q.set("response_mode", "query"); q.set("prompt", "select_account"); }
  return ENDPOINTS[prov].autorizar + "?" + q.toString();
}

const form = (o: Record<string, string>): string => new URLSearchParams(o).toString();
const POST_FORM = { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" } };
type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const txt = (v: unknown, max = 8192): string | null => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);

export type Trocado = { ok: true; acesso: string; refresh: string | null; expiraEm: number } | { ok: false; erro: "oauth_recusado" | "oauth_indisponivel" };
export async function trocarCodigo(prov: ProvedorOauth, cfg: ConfigOauth, a: { codigo: string; verificador: string }, http: Http, agora = Date.now()): Promise<Trocado> {
  const corpo: Record<string, string> = { grant_type: "authorization_code", code: a.codigo, redirect_uri: cfg.redirectUri, client_id: cfg.clientId, client_secret: cfg.clientSecret, code_verifier: a.verificador };
  if (prov === "outlook") corpo.scope = ESCOPOS.outlook.join(" ");
  let r;
  try { r = await http(ENDPOINTS[prov].token, { ...POST_FORM, body: form(corpo) }); } catch (_) { return { ok: false, erro: "oauth_indisponivel" }; }
  if (r.status >= 500 || r.status === 429) return { ok: false, erro: "oauth_indisponivel" };
  let j: Json | null = null; try { j = obj(await r.json()); } catch (_) { /* corpo inválido */ }
  const acesso = txt(j?.access_token);
  if (!r.ok || !j || !acesso) return { ok: false, erro: "oauth_recusado" };
  const exp = typeof j.expires_in === "number" && j.expires_in > 0 ? j.expires_in : 3600;
  return { ok: true, acesso, refresh: txt(j.refresh_token), expiraEm: agora + exp * 1000 };
}

export type Renovado = { ok: true; acesso: string; expiraEm: number; refreshNovo: string | null } | { ok: false; erro: "autenticacao_recusada" | "servico_indisponivel" };
/* o token de acesso é pedido a CADA operação (nunca guardado). `invalid_grant` (revogado, expirado, senha trocada, app em teste) = autenticação recusada: a credencial vira "inválida" e a conta pede reconexão.
   A Microsoft devolve um refresh token novo a cada renovação (refreshNovo): quem chama o regrava no Vault. */
export async function renovarAcesso(prov: ProvedorOauth, cfg: ConfigOauth, refresh: string, http: Http, agora = Date.now()): Promise<Renovado> {
  const corpo: Record<string, string> = { grant_type: "refresh_token", refresh_token: refresh, client_id: cfg.clientId, client_secret: cfg.clientSecret };
  if (prov === "outlook") corpo.scope = ESCOPOS.outlook.join(" ");
  let r;
  try { r = await http(ENDPOINTS[prov].token, { ...POST_FORM, body: form(corpo) }); } catch (_) { return { ok: false, erro: "servico_indisponivel" }; }
  let j: Json | null = null; try { j = obj(await r.json()); } catch (_) { /* idem */ }
  if (r.ok && j && txt(j.access_token)) {
    const exp = typeof j.expires_in === "number" && j.expires_in > 0 ? j.expires_in : 3600, novo = txt(j.refresh_token);
    return { ok: true, acesso: j.access_token as string, expiraEm: agora + exp * 1000, refreshNovo: novo && novo !== refresh ? novo : null };
  }
  if (r.status >= 500 || r.status === 429) return { ok: false, erro: "servico_indisponivel" };
  const e = typeof j?.error === "string" ? j.error : "";
  return { ok: false, erro: r.status === 400 || r.status === 401 || e === "invalid_grant" || e === "invalid_client" ? "autenticacao_recusada" : "servico_indisponivel" };
}

/* o endereço da conta que acabou de autorizar (minúsculas) ou null */
export async function identidade(prov: ProvedorOauth, acesso: string, http: Http): Promise<string | null> {
  let r;
  try { r = await http(ENDPOINTS[prov].identidade, { headers: { Authorization: "Bearer " + acesso, Accept: "application/json" } }); } catch (_) { return null; }
  if (!r.ok) return null;
  let j: Json | null = null; try { j = obj(await r.json()); } catch (_) { return null; }
  const e = prov === "gmail" ? (j?.email_verified === false ? null : txt(j?.email, 254)) : txt(j?.mail, 254) ?? txt(j?.userPrincipalName, 254);
  return e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e.toLowerCase() : null;
}

/* revogar no provedor (só o Google tem endpoint; na Microsoft a revogação é em account.microsoft.com → Privacidade → apps). Melhor esforço: o resultado nunca muda a remoção local. */
export async function revogar(prov: ProvedorOauth, token: string, http: Http): Promise<boolean> {
  const url = ENDPOINTS[prov].revogar;
  if (!url) return false;
  try { const r = await http(url, { ...POST_FORM, body: form({ token }) }); return r.ok; } catch (_) { return false; }
}

/* o que vai ao Vault: SÓ o refresh token */
export const empacotarOauth = (refresh: string): string => JSON.stringify({ o: 1, r: refresh });
export function desempacotarOauth(bruto: string): { refresh: string } | null {
  try { const j = JSON.parse(bruto); if (j && j.o === 1 && typeof j.r === "string" && j.r.length >= 10 && j.r.length <= 5000) return { refresh: j.r }; } catch (_) { /* corrompido */ }
  return null;
}
