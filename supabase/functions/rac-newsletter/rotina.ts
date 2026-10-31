// Newsletter Inteligente: a rotina do servidor, pura (banco, site e push chegam de fora; testada sem rede em
// tests/newsletter.test.mjs). A cada chamada do agendamento (019):
//   1) só segue se a edição de hoje (horário de Brasília) já saiu em newsletter.json;
//   2) para cada dono, guarda a edição base do dia, se ainda não existir (os pesos e palavras escondidas do dono valem);
//   3) se o dono quer avisos, registra "dia:AAAA-MM-DD" e, só se o registro for novo, manda UM aviso;
//   4) no domingo, o mesmo com "semana:AAAA-Www", a partir das edições guardadas na semana.
// O registro vem antes do envio: se o envio falhar, o aviso não é repetido (nunca chega duas vezes). Nada aqui usa IA.

export const CATEGORIAS: Record<string, string> = {
  ia: "Inteligência Artificial", tec: "Tecnologia", cie: "Ciência e inovação", eco: "Economia e negócios",
  pol: "Política e atualidades", dados: "Ciência de Dados e Analytics", games: "Games e entretenimento tecnológico", soro: "Sorocaba e região",
};
const ORDEM = Object.keys(CATEGORIAS);

export type Item = { id?: string; t: string; u: string; f: string; d: string; tipo?: string };
export type Grupo = { id: string; c: string; tags?: string[]; tipo?: string; t: string; r?: string; u: string; f: string; d: string; n?: number; img?: string | null; s?: number; itens?: Item[] };
export type Dados = { versao?: number; coletado?: string; edicao?: { data: string; destaques: string[]; por_categoria: Record<string, string[]> }; grupos?: Grupo[]; fontes?: { n: string; ok: boolean; erro?: string | null }[] };
export type Cfg = { pesos?: Record<string, unknown>; ocultar?: unknown; avisos?: unknown };
export type Snap = { id: string; c: string; tags: string[]; tipo: string; t: string; r: string; u: string; f: string; d: string; n: number; img: string | null; s: number; porque: string; fontes: { f: string; u: string; t: string; d: string }[] };
export type Conteudo = { versao: 1; data: string; coletado: string | null; origem: "regras"; destaques: Snap[]; categorias: { k: string; sintese: string; grupos: Snap[] }[]; fontes: { total: number; ok: number; falhas: string[] }; resumo_dia: string; chave: string };
export type Mensagem = { titulo: string; corpo: string; url: string; tag: string };

export function dataBRT(ms: number): string { return new Date(ms - 3 * 3600e3).toISOString().slice(0, 10); }
export function diaDaSemanaBRT(ms: number): number { return new Date(ms - 3 * 3600e3).getUTCDay(); }
/* semana ISO 8601 ("2026-W44"), a mesma numeração do calendário */
export function semanaISO(data: string): string {
  const d = new Date(data + "T12:00:00Z"), dia = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dia + 3);
  const ano = d.getUTCFullYear(), primeira = new Date(Date.UTC(ano, 0, 4));
  const n = 1 + Math.round(((d.getTime() - primeira.getTime()) / 864e5 - 3 + ((primeira.getUTCDay() + 6) % 7)) / 7);
  return ano + "-W" + String(n).padStart(2, "0");
}
const norm = (t: string) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/* a mesma chave do site (nlHash/nlChaveIA em nucleo.js): FNV-1a de 32 bits dos ids em ordem */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
  return ("0000000" + h.toString(16)).slice(-8);
}
export function chave(data: string, ids: string[]): string { return "nl-" + data + "-" + hash(ids.slice().sort().join(",")); }

function peso(cfg: Cfg | null, c: string): number {
  const v = cfg?.pesos && typeof cfg.pesos === "object" ? (cfg.pesos as Record<string, unknown>)[c] : undefined;
  return typeof v === "number" && isFinite(v) ? Math.max(0, Math.min(3, v)) : 1;
}
function ocultas(cfg: Cfg | null): string[] {
  const l = Array.isArray(cfg?.ocultar) ? cfg!.ocultar as unknown[] : String(cfg?.ocultar ?? "").split(/[,;\n]/);
  return l.map((s) => norm(String(s ?? "").trim())).filter((s) => s.length >= 2);
}
function snap(g: Grupo): Snap {
  const itens = g.itens?.length ? g.itens : [{ t: g.t, u: g.u, f: g.f, d: g.d }];
  return { id: g.id, c: g.c, tags: (g.tags ?? []).slice(0, 3), tipo: g.tipo ?? "noticia", t: g.t, r: g.r ?? "", u: g.u, f: g.f, d: g.d, n: g.n ?? 1, img: g.img ?? null, s: g.s ?? 0, porque: "", fontes: itens.map((i) => ({ f: i.f, u: i.u, t: i.t, d: i.d })) };
}

/* edição base: a ordem que o coletor calculou com os pesos padrão; tira as categorias escondidas e as palavras ocultas */
export function edicaoBase(d: Dados, cfg: Cfg | null): Conteudo | null {
  if (!d.edicao || !Array.isArray(d.grupos)) return null;
  const esc = ocultas(cfg), porId = new Map(d.grupos.map((g) => [g.id, g]));
  const vale = (g: Grupo | undefined): g is Grupo => !!g && /^https?:\/\//.test(g.u) && peso(cfg, g.c) > 0 && !esc.some((p) => norm(g.t + " " + (g.r ?? "")).includes(p));
  const destaques = d.edicao.destaques.map((id) => porId.get(id)).filter(vale).map(snap);
  const categorias = ORDEM.filter((k) => d.edicao!.por_categoria?.[k] && peso(cfg, k) > 0)
    .sort((a, b) => peso(cfg, b) - peso(cfg, a) || ORDEM.indexOf(a) - ORDEM.indexOf(b))
    .map((k) => ({ k, sintese: "", grupos: d.edicao!.por_categoria[k].map((id) => porId.get(id)).filter(vale).map(snap) }))
    .filter((k) => k.grupos.length);
  const fontes = d.fontes ?? [], falhas = fontes.filter((f) => !f.ok);
  const c: Conteudo = {
    versao: 1, data: d.edicao.data, coletado: d.coletado ?? null, origem: "regras", destaques, categorias,
    fontes: { total: fontes.length, ok: fontes.length - falhas.length, falhas: falhas.map((f) => f.n + (f.erro ? " (" + f.erro + ")" : "")) },
    resumo_dia: "", chave: "",
  };
  c.resumo_dia = resumoRegras(c);
  const ids: string[] = [];
  for (const g of [...destaques, ...categorias.flatMap((k) => k.grupos)]) if (!ids.includes(g.id)) ids.push(g.id);
  c.chave = chave(c.data, ids);
  return c;
}
/* o mesmo texto de nlResumoRegras (nucleo.js) */
export function resumoRegras(c: { destaques: Snap[] }): string {
  const d = c.destaques;
  if (!d.length) return "Ainda não há notícias nesta edição.";
  const top = d.slice().sort((a, b) => b.n - a.n || b.s - a.s)[0], nc = new Set(d.map((g) => g.c)).size;
  return d.length + " destaques em " + nc + (nc === 1 ? " categoria" : " categorias") + ". " +
    (top.n > 1 ? "O assunto mais coberto: “" + top.t + "” (" + top.n + " veículos)." : "Primeiro destaque: “" + d[0].t + "” (" + d[0].f + ").");
}

const corta = (t: string, n: number) => t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…";
export function msgDia(c: Conteudo): Mensagem {
  const cats = [...new Set(c.destaques.map((g) => CATEGORIAS[g.c] ?? g.c))].slice(0, 3).join(", ");
  return { titulo: "📰 Newsletter de hoje: " + c.destaques.length + " destaques", corpo: corta((c.destaques[0] ? c.destaques[0].t + " · " : "") + cats, 180), url: "./#newsletter", tag: "newsletter-dia" };
}
export function msgSemana(edicoes: { data: string; conteudo: Partial<Conteudo> | null }[], semana: string): Mensagem | null {
  const validas = edicoes.filter((e) => e.conteudo && Array.isArray(e.conteudo.destaques));
  if (!validas.length) return null;
  const vistos = new Map<string, Snap>(), porCat: Record<string, number> = {};
  for (const e of validas) for (const g of e.conteudo!.destaques!) { porCat[g.c] = (porCat[g.c] ?? 0) + 1; if (!vistos.has(g.id)) vistos.set(g.id, g); }
  const top = [...vistos.values()].sort((a, b) => b.n - a.n)[0];
  const cat = Object.entries(porCat).sort((a, b) => b[1] - a[1])[0];
  return {
    titulo: "🗞️ Sua semana em notícias (" + semana.replace(/^\d{4}-W/, "semana ") + ")",
    corpo: corta(validas.length + (validas.length === 1 ? " edição, " : " edições, ") + vistos.size + " destaques. Mais presente: " + (CATEGORIAS[cat[0]] ?? cat[0]) + (top ? ". Mais coberto: " + top.t : ""), 180),
    url: "./#newsletter/semana", tag: "newsletter-semana",
  };
}

export type Deps = {
  agora(): number;
  dados(): Promise<Dados>;
  donos(): Promise<string[]>;
  config(dono: string): Promise<Cfg | null>;
  salvarEdicao(dono: string, c: Conteudo): Promise<"nova" | "existia">;
  registrarAviso(dono: string, chave: string): Promise<boolean>; // true só na primeira vez (chave primária)
  anotarAviso(dono: string, chave: string, resultado: string): Promise<void>;
  edicoesDaSemana(dono: string, de: string, ate: string): Promise<{ data: string; conteudo: Partial<Conteudo> | null }[]>;
  push(dono: string, m: Mensagem): Promise<string>;
};
export type Resultado = { ok: boolean; data: string; motivo?: string; donos: { edicao: string; aviso: string; semana: string }[] };

export async function rodarRotina(x: Deps): Promise<Resultado> {
  const agora = x.agora(), hoje = dataBRT(agora);
  const d = await x.dados();
  if (!d?.edicao || d.edicao.data !== hoje) return { ok: true, data: hoje, motivo: "a edição de hoje ainda não saiu", donos: [] };
  const out: Resultado["donos"] = [];
  for (const dono of await x.donos()) {
    const cfg = await x.config(dono), c = edicaoBase(d, cfg);
    const r = { edicao: "sem destaques", aviso: "—", semana: "—" };
    if (c && c.destaques.length) {
      r.edicao = await x.salvarEdicao(dono, c);
      if (cfg?.avisos === false) r.aviso = "avisos desligados";
      else if (await x.registrarAviso(dono, "dia:" + hoje)) { r.aviso = await x.push(dono, msgDia(c)); await x.anotarAviso(dono, "dia:" + hoje, r.aviso); }
      else r.aviso = "já avisado hoje";
    }
    if (diaDaSemanaBRT(agora) === 0 && cfg?.avisos !== false) {
      const sem = semanaISO(hoje), de = new Date(Date.parse(hoje + "T12:00:00Z") - 6 * 864e5).toISOString().slice(0, 10);
      const m = msgSemana(await x.edicoesDaSemana(dono, de, hoje), sem);
      if (!m) r.semana = "sem edições na semana";
      else if (await x.registrarAviso(dono, "semana:" + sem)) { r.semana = await x.push(dono, m); await x.anotarAviso(dono, "semana:" + sem, r.semana); }
      else r.semana = "já avisado nesta semana";
    }
    out.push(r);
  }
  return { ok: true, data: hoje, donos: out };
}
