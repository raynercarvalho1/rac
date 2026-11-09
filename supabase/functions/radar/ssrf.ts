// Radar de Preços: leitura SEGURA de páginas externas (docs/radar-fontes.md). Lógica pura e testada (tests/radar_servidor.test.mjs); o único arquivo com Deno é index.ts.
// Regras: só https, só a porta 443, sem usuário/senha, sem IP literal nem nome interno, domínio dentro da lista permitida (as lojas do dono),
// nenhum IP privado depois de resolver o nome, no máximo 3 redirecionamentos (cada um revalidado), tempo e tamanho limitados, robots.txt respeitado.
// Limite conhecido: entre resolver o nome e o fetch do Deno há uma janela mínima (DNS rebinding); por isso a lista de domínios permitidos é obrigatória.

export const LIMITES = { urlMax: 2000, corpoMaxBytes: 1_500_000, tempoMs: 12_000, redirecionamentos: 3, robotsMaxBytes: 200_000 } as const;
export const AGENTE = "RAC-Radar";
export const USER_AGENT = "RAC-Radar/1.0 (leitor pessoal de preços do dono do site; respeita robots.txt)";

export type UrlOk = { ok: true; url: URL } | { ok: false; motivo: string };

const NOMES_INTERNOS = /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|invalid|test|example)$/;

/* IPv4/IPv6 privados, de loopback, link-local, multicast, reservados e de documentação */
export function ipPrivado(ip: string): boolean {
  const t = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(t);
  if (v4) {
    const [a, b, c] = [+v4[1], +v4[2], +v4[3]];
    if ([a, b, c, +v4[4]].some((x) => x > 255)) return true;
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113);
  }
  if (!t.includes(":")) return true; // não é IP: por segurança, tratado como bloqueado
  const mapeado = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(t) ?? /^64:ff9b::(\d{1,3}(?:\.\d{1,3}){3})$/.exec(t);
  if (mapeado) return ipPrivado(mapeado[1]);
  if (t === "::" || t === "::1") return true;
  const g1 = t.split(":")[0];
  const n = g1 === "" ? 0 : parseInt(g1, 16);
  if (isNaN(n)) return true;
  return (n & 0xfe00) === 0xfc00 || (n & 0xffc0) === 0xfe80 || (n & 0xff00) === 0xff00 || t.startsWith("2001:db8:") || t.startsWith("2001:0db8:") || t.startsWith("::ffff:");
}

/* o domínio da URL precisa ser (ou terminar em) um dos permitidos; sem lista, nada é permitido */
export function dominioPermitido(host: string, dominios: string[]): boolean {
  const h = host.toLowerCase();
  return dominios.some((d) => { const x = String(d || "").toLowerCase().replace(/^\.+/, ""); return !!x && (h === x || h.endsWith("." + x)); });
}

export function urlExterna(bruta: unknown, dominios: string[]): UrlOk {
  if (typeof bruta !== "string") return { ok: false, motivo: "endereço inválido" };
  const s = bruta.trim();
  if (!s || s.length > LIMITES.urlMax) return { ok: false, motivo: "endereço vazio ou grande demais" };
  if (/[\u0000-\u001f\u007f\s]/.test(s)) return { ok: false, motivo: "o endereço tem espaço ou caractere de controle" };
  let u: URL;
  try { u = new URL(s); } catch (_) { return { ok: false, motivo: "endereço inválido" }; }
  if (u.protocol !== "https:") return { ok: false, motivo: "só endereços https são aceitos" };
  if (u.username || u.password) return { ok: false, motivo: "endereço com usuário ou senha não é aceito" };
  if (u.port && u.port !== "443") return { ok: false, motivo: "só a porta padrão (443) é aceita" };
  const host = u.hostname.toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(host) || host.startsWith(".") || host.endsWith(".") || host.includes("..")) return { ok: false, motivo: "domínio inválido (IP e nomes especiais não são aceitos)" };
  if (/^\d+(\.\d+)*$/.test(host) || /^0x/i.test(host)) return { ok: false, motivo: "IP direto não é aceito" };
  if (!host.includes(".") || NOMES_INTERNOS.test(host)) return { ok: false, motivo: "nome interno não é aceito" };
  if (!dominioPermitido(host, dominios)) return { ok: false, motivo: "domínio fora das lojas cadastradas" };
  u.hash = "";
  return { ok: true, url: u };
}

/* ---------- robots.txt (RFC 9309, o suficiente: grupos, Allow/Disallow, * e $, a regra mais longa vence) ---------- */
type Regra = { permite: boolean; padrao: string };
export function regrasDoRobots(texto: string, agente = AGENTE): Regra[] {
  const grupos: { agentes: string[]; regras: Regra[] }[] = [];
  let atual: { agentes: string[]; regras: Regra[] } | null = null, lendoAgentes = false;
  for (const linha0 of texto.split(/\r?\n/)) {
    const linha = linha0.replace(/#.*$/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(linha);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === "user-agent") {
      if (!atual || !lendoAgentes) { atual = { agentes: [], regras: [] }; grupos.push(atual); }
      atual.agentes.push(v.toLowerCase()); lendoAgentes = true;
    } else if (k === "allow" || k === "disallow") {
      lendoAgentes = false;
      if (atual) atual.regras.push({ permite: k === "allow", padrao: v });
    } else lendoAgentes = false;
  }
  const a = agente.toLowerCase();
  const especifico = grupos.filter((g) => g.agentes.some((x) => x !== "*" && a.includes(x)));
  const alvo = especifico.length ? especifico : grupos.filter((g) => g.agentes.includes("*"));
  return alvo.flatMap((g) => g.regras);
}
function casa(padrao: string, caminho: string): number {
  if (padrao === "") return -1; // "Disallow:" vazio não bloqueia nada
  const fim = padrao.endsWith("$"), p = fim ? padrao.slice(0, -1) : padrao;
  const re = new RegExp("^" + p.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (fim ? "$" : ""));
  return re.test(caminho) ? p.length : -1;
}
export function robotsPermite(texto: string, caminhoComQuery: string, agente = AGENTE): boolean {
  let melhor = -1, permite = true;
  for (const r of regrasDoRobots(texto, agente)) {
    const n = casa(r.padrao, caminhoComQuery);
    if (n > melhor || (n === melhor && r.permite && !permite)) { melhor = n; permite = r.permite; }
  }
  return permite;
}

/* ---------- leitura da página ---------- */
export type Deps = {
  resolver: (host: string) => Promise<string[]>;
  fetch: (url: string, init: { redirect: "manual"; signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>;
};
export type Lida = { ok: true; html: string; urlFinal: string; status: number } | { ok: false; motivo: string; codigo: string };

async function lerLimitado(r: Response, max: number): Promise<string | null> {
  const declarado = Number(r.headers.get("content-length") ?? 0);
  if (declarado > max) return null;
  if (!r.body) return (await r.text()).length > max ? null : await r.text();
  const leitor = r.body.getReader(), partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { try { await leitor.cancel(); } catch (_) { /* nada */ } return null; }
    partes.push(value);
  }
  const buf = new Uint8Array(total); let o = 0; for (const p of partes) { buf.set(p, o); o += p.byteLength; }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

async function umaVez(u: URL, dominios: string[], deps: Deps, aceita: (ct: string) => boolean, max: number): Promise<{ r: Response; u: URL } | { fim: Lida }> {
  let atual = u;
  for (let salto = 0; salto <= LIMITES.redirecionamentos; salto++) {
    const v = urlExterna(atual.toString(), dominios);
    if (!v.ok) return { fim: { ok: false, motivo: v.motivo, codigo: salto ? "redirecionamento_barrado" : "url_barrada" } };
    let ips: string[];
    try { ips = await deps.resolver(v.url.hostname); } catch (_) { return { fim: { ok: false, motivo: "não consegui resolver o domínio", codigo: "dns" } }; }
    if (!ips.length || ips.some(ipPrivado)) return { fim: { ok: false, motivo: "o domínio aponta para um endereço interno", codigo: "ip_privado" } };
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), LIMITES.tempoMs);
    let r: Response;
    try {
      r = await deps.fetch(v.url.toString(), { redirect: "manual", signal: ctl.signal, headers: { "User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,text/plain;q=0.8", "Accept-Language": "pt-BR,pt;q=0.9" } });
    } catch (_) { clearTimeout(t); return { fim: { ok: false, motivo: "a loja não respondeu a tempo", codigo: "tempo_ou_rede" } }; }
    clearTimeout(t);
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const loc = r.headers.get("location");
      if (!loc) return { fim: { ok: false, motivo: "redirecionamento sem destino", codigo: "redirecionamento" } };
      try { atual = new URL(loc, v.url); } catch (_) { return { fim: { ok: false, motivo: "redirecionamento inválido", codigo: "redirecionamento" } }; }
      continue;
    }
    const ct = (r.headers.get("content-type") ?? "").toLowerCase();
    if (r.status >= 200 && r.status < 300 && !aceita(ct)) return { fim: { ok: false, motivo: "a resposta não é uma página de texto", codigo: "tipo" } };
    return { r, u: v.url };
  }
  return { fim: { ok: false, motivo: "redirecionamentos demais", codigo: "redirecionamentos" } };
}

/* confere o robots.txt do domínio e, se permitir, lê a página. Nunca tenta contornar bloqueio: 401/403/429/captcha = parar. */
export async function lerPagina(bruta: string, dominios: string[], deps: Deps): Promise<Lida> {
  const v = urlExterna(bruta, dominios);
  if (!v.ok) return { ok: false, motivo: v.motivo, codigo: "url_barrada" };
  const rb = new URL("/robots.txt", v.url);
  const a = await umaVez(rb, dominios, deps, (ct) => ct.startsWith("text/") || ct === "", LIMITES.robotsMaxBytes);
  if ("fim" in a) return a.fim;
  if (a.r.status === 404 || a.r.status === 410) { /* sem robots.txt: permitido */ }
  else if (a.r.status >= 200 && a.r.status < 300) {
    const txt = await lerLimitado(a.r, LIMITES.robotsMaxBytes);
    if (txt === null) return { ok: false, motivo: "robots.txt grande demais", codigo: "robots" };
    if (!robotsPermite(txt, v.url.pathname + v.url.search)) return { ok: false, motivo: "o robots.txt da loja não permite ler esta página", codigo: "robots_nao" };
  } else return { ok: false, motivo: "não consegui conferir o robots.txt da loja (" + a.r.status + "); por segurança não li a página", codigo: "robots_indisponivel" };
  const b = await umaVez(v.url, dominios, deps, (ct) => ct.includes("text/html") || ct.includes("application/xhtml"), LIMITES.corpoMaxBytes);
  if ("fim" in b) return b.fim;
  const s = b.r.status;
  if (s === 401 || s === 403 || s === 429 || s === 503) return { ok: false, motivo: "a loja recusou a leitura automática (" + s + "); não vou tentar contornar", codigo: "recusada" };
  if (s < 200 || s >= 300) return { ok: false, motivo: "a loja respondeu " + s, codigo: "http_" + s };
  const html = await lerLimitado(b.r, LIMITES.corpoMaxBytes);
  if (html === null) return { ok: false, motivo: "a página é grande demais", codigo: "tamanho" };
  /* páginas de desafio (captcha, verificação de robô): parar, nunca resolver */
  if (/captcha|are you a robot|verifica[cç][aã]o de seguran[cç]a|cf-challenge|challenge-platform/i.test(html.slice(0, 20000)) && !/application\/ld\+json/i.test(html)) return { ok: false, motivo: "a loja pediu verificação humana; não vou contornar", codigo: "captcha" };
  return { ok: true, html, urlFinal: b.u.toString(), status: s };
}
