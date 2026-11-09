// Radar de Preços: resolução de nomes para a trava de SSRF (ssrf.ts confere se algum IP é interno). Primeiro tenta o DNS do próprio ambiente (Deno.resolveDns); se o ambiente não oferecer essa API
// ou ela falhar, usa DNS sobre HTTPS no endereço FIXO abaixo (nunca um endereço vindo do usuário). Se nada resolver, a leitura é recusada (falha segura: sem IP conhecido, não se lê).
// Puro e testado (tests/radar_lote4.test.mjs): as funções do ambiente são injetadas.

export const DOH_URL = "https://cloudflare-dns.com/dns-query";
export type AmbienteDns = {
  resolveDns?: (host: string, tipo: "A" | "AAAA") => Promise<string[]>;
  fetch: (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<Response>;
};
const HOST_OK = /^[a-z0-9.-]{3,253}$/;

async function viaDoh(host: string, tipo: "A" | "AAAA", env: AmbienteDns): Promise<string[]> {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 5000);
  try {
    const r = await env.fetch(DOH_URL + "?name=" + encodeURIComponent(host) + "&type=" + tipo, { headers: { accept: "application/dns-json" }, signal: ctl.signal });
    if (!r.ok) throw new Error("doh " + r.status);
    const j = await r.json() as { Answer?: { type?: number; data?: string }[] };
    const alvo = tipo === "A" ? 1 : 28;
    return (j.Answer ?? []).filter((a) => a.type === alvo && typeof a.data === "string").map((a) => a.data as string).slice(0, 20);
  } finally { clearTimeout(t); }
}

export async function resolverNome(host: string, env: AmbienteDns): Promise<string[]> {
  const h = String(host).toLowerCase();
  if (!HOST_OK.test(h) || h.startsWith(".") || h.endsWith(".") || h.includes("..")) throw new Error("nome inválido");
  if (typeof env.resolveDns === "function") {
    try {
      const [a, b] = await Promise.all([env.resolveDns(h, "A").catch(() => [] as string[]), env.resolveDns(h, "AAAA").catch(() => [] as string[])]);
      if (a.length || b.length) return [...a, ...b];
    } catch (_) { /* cai para o DNS sobre HTTPS */ }
  }
  const [a, b] = await Promise.all([viaDoh(h, "A", env), viaDoh(h, "AAAA", env).catch(() => [] as string[])]);
  if (!a.length && !b.length) throw new Error("sem endereço");
  return [...a, ...b];
}
