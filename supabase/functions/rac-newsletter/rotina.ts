// Newsletter Inteligente: a rotina do servidor, pura (banco, site, IA e push chegam de fora; testada sem rede em
// tests/newsletter.test.mjs). A cada chamada do agendamento (019), depois das coletas das 6h, 12h e 18h:
//   1) só segue se a edição deste turno (manhã, tarde ou noite, no horário de Brasília) já saiu em newsletter.json;
//   2) para cada dono, guarda a edição base do turno, se ainda não existir (os pesos e palavras escondidas do dono valem);
//   3) resumo com IA (autorizado pelo dono em 31/10/2026): pede à rac-ia (a única porta da IA, em nome do dono) o
//      newsletter.resumo da edição, com a chave da edição (data + notícias). Não pede se essa chave já foi tentada
//      (ia_uso), se o dono desligou ou se o limite do dia já foi atingido: nada pago se repete sozinho. Só uma resposta
//      REAL, validada, vira a edição "ia" (o banco confere a chamada). DEMO, falta de saldo ou erro: fica a edição sem IA;
//   4) se o dono quer avisos, registra "dia:AAAA-MM-DD" e, só se o registro for novo, manda UM aviso;
//   5) no domingo, o mesmo com "semana:AAAA-Www", a partir das edições guardadas na semana.
// O registro vem antes do envio: se o envio falhar, o aviso não é repetido (nunca chega duas vezes).

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
export type Conteudo = { versao: 1; data: string; turno: Turno; coletado: string | null; origem: "regras" | "ia"; destaques: Snap[]; categorias: { k: string; sintese: string; grupos: Snap[] }[]; fontes: { total: number; ok: number; falhas: string[] }; resumo_dia: string; chave: string };
export type Turno = "manha" | "tarde" | "noite";
export type Mensagem = { titulo: string; corpo: string; url: string; tag: string };

export function dataBRT(ms: number): string { return new Date(ms - 3 * 3600e3).toISOString().slice(0, 10); }
/* o turno da edição pelo horário de Brasília (o mesmo nlTurno do site): antes das 12h manhã, antes das 18h tarde */
export function turnoBRT(ms: number): Turno { const h = new Date(ms - 3 * 3600e3).getUTCHours(); return h < 12 ? "manha" : h < 18 ? "tarde" : "noite"; }
export const LIMITE_IA_DIA = 3; // um resumo por turno, no máximo
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
    versao: 1, data: d.edicao.data, turno: turnoBRT(Date.parse(d.coletado ?? "") || Date.parse(d.edicao.data + "T12:00:00Z")), coletado: d.coletado ?? null, origem: "regras", destaques, categorias,
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

/* ----- resumo com IA: a mesma entrada e a mesma aplicação do site (nlEntradaIA e nlAplicarIA em nucleo.js) ----- */
const NOMES_TIPO: Record<string, string> = { noticia: "Notícia", analise: "Análise", opiniao: "Opinião" };
const fontesDe = (g: Snap) => g.fontes?.length ? g.fontes : [{ f: g.f, u: g.u, t: g.t, d: g.d }];
export function entradaIA(c: Conteudo, max = 14000): { texto: string; ids: string[] } {
  const vistos = new Set<string>(), grupos: { g: Snap; dest: boolean }[] = [];
  for (const g of c.destaques) if (!vistos.has(g.id)) { vistos.add(g.id); grupos.push({ g, dest: true }); }
  for (const k of c.categorias) for (const g of k.grupos.slice(0, 3)) if (!vistos.has(g.id)) { vistos.add(g.id); grupos.push({ g, dest: false }); }
  const limpo = (t: unknown) => String(t ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  let txt = "Edição de " + c.data + ". Cada grupo é um acontecimento; use só o que está escrito aqui.\n";
  const ids: string[] = [];
  for (let i = 0; i < grupos.length && ids.length < 30; i++) {
    const g = grupos[i].g, veic = fontesDe(g).map((f) => f.f).filter((f, j, l) => l.indexOf(f) === j).join(", ");
    const b = "<grupo id=\"" + g.id + "\" categoria=\"" + (CATEGORIAS[g.c] ?? g.c) + "\" tipo=\"" + (NOMES_TIPO[g.tipo] ?? "Notícia") + "\" fontes=\"" + g.n + "\" destaque=\"" + (grupos[i].dest ? "sim" : "não") + "\">\n" +
      "Título: " + limpo(g.t) + "\n" + (g.r ? "Trecho: " + limpo(g.r) + "\n" : "") + "Veículos: " + limpo(veic) + "\n</grupo>\n";
    if (txt.length + b.length > max) break;
    txt += b; ids.push(g.id);
  }
  return { texto: txt, ids };
}
type ResultadoIA = { resumo_dia?: unknown; destaques?: { id: string; titulo?: string; resumo?: string; relevancia?: string }[]; categorias?: { categoria: string; sintese?: string; ids?: string[] }[] };
export function aplicarIA(c: Conteudo, res: ResultadoIA, ids: string[]): { ok: true; conteudo: Conteudo } | { ok: false; motivo: string } {
  const ok = new Set(ids), mapa = new Map<string, Snap>();
  for (const g of [...c.destaques, ...c.categorias.flatMap((k) => k.grupos)]) mapa.set(g.id, g);
  const fora = [...(res.destaques ?? []).map((d) => d.id), ...(res.categorias ?? []).flatMap((k) => k.ids ?? [])].filter((id) => !ok.has(id) || !mapa.has(id));
  if (fora.length) return { ok: false, motivo: "a IA citou notícias que não estão na edição: " + fora.slice(0, 3).join(", ") };
  if (!(res.destaques ?? []).length || !String(res.resumo_dia ?? "").trim()) return { ok: false, motivo: "a resposta veio sem resumo ou sem destaques" };
  const n: Conteudo = JSON.parse(JSON.stringify(c));
  n.origem = "ia"; n.resumo_dia = String(res.resumo_dia);
  n.destaques = res.destaques!.map((d) => {
    const g = JSON.parse(JSON.stringify(mapa.get(d.id))) as Snap & Record<string, string>;
    g.resumo_ia = String(d.resumo ?? ""); g.relevancia_ia = String(d.relevancia ?? ""); if (d.titulo) g.titulo_pt = String(d.titulo);
    return g;
  });
  const sint = new Map((res.categorias ?? []).map((k) => [k.categoria, String(k.sintese ?? "")]));
  for (const k of n.categorias) k.sintese = sint.get(k.k) ?? "";
  return { ok: true, conteudo: n };
}

const corta = (t: string, n: number) => t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…";
export function msgDia(c: Conteudo): Mensagem {
  const cats = [...new Set(c.destaques.map((g) => CATEGORIAS[g.c] ?? g.c))].slice(0, 3).join(", ");
  /* com o resumo da IA, o aviso traz o resumo do dia; sem ele, a primeira manchete e as categorias */
  const corpo = c.origem === "ia" ? c.resumo_dia : (c.destaques[0] ? c.destaques[0].t + " · " : "") + cats;
  return { titulo: "📰 Newsletter de hoje: " + c.destaques.length + " destaques" + (c.origem === "ia" ? " (com resumo)" : ""), corpo: corta(corpo, 180), url: "./#newsletter", tag: "newsletter-dia" };
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

/* resposta da rac-ia (contrato v1), só o que a rotina usa */
export type RespostaIA = { ok: boolean; modo: "DEMO" | "REAL"; id?: string | null; estado?: string; resultado?: Record<string, unknown>; consumo?: { modelo?: string }; erro?: { codigo: string } };
export type Deps = {
  agora(): number;
  dados(): Promise<Dados>;
  donos(): Promise<string[]>;
  config(dono: string): Promise<Cfg | null>;
  salvarEdicao(dono: string, c: Conteudo): Promise<"nova" | "existia">;
  /* resumo com IA */
  jaTentou(dono: string, chave: string): Promise<boolean>; // há linha em ia_uso com esta chave (qualquer estado)
  chamadasHoje(dono: string, data: string): Promise<number>; // resumos da Newsletter pedidos hoje (ia_uso)
  resumirIA(dono: string, pedido: Record<string, unknown>): Promise<RespostaIA>; // POST na rac-ia, uma vez
  salvarEdicaoIA(dono: string, c: Conteudo, ia: { modelo: string; ia_uso_id: string; chave: string }): Promise<void>;
  registrarAviso(dono: string, chave: string): Promise<boolean>; // true só na primeira vez (chave primária)
  anotarAviso(dono: string, chave: string, resultado: string): Promise<void>;
  edicoesDaSemana(dono: string, de: string, ate: string): Promise<{ data: string; conteudo: Partial<Conteudo> | null }[]>;
  push(dono: string, m: Mensagem): Promise<string>;
};
export type Resultado = { ok: boolean; data: string; turno?: Turno; motivo?: string; donos: { edicao: string; ia: string; aviso: string; semana: string }[] };

/* o resumo com IA de uma edição: no máximo UMA chamada, e só se ninguém tentou esta chave antes */
async function resumir(x: Deps, dono: string, cfg: Cfg | null, c: Conteudo): Promise<{ texto: string; conteudo?: Conteudo }> {
  if (cfg && (cfg as Record<string, unknown>).resumo_ia === false) return { texto: "resumo automático desligado" };
  const e = entradaIA(c);
  if (e.ids.length < 3) return { texto: "notícias de menos para resumir" };
  const k = chave(c.data, e.ids);
  if (await x.jaTentou(dono, k)) return { texto: "esta edição já foi resumida ou tentada (não repete)" };
  if (await x.chamadasHoje(dono, c.data) >= LIMITE_IA_DIA) return { texto: "limite de " + LIMITE_IA_DIA + " resumos por dia" };
  const r = await x.resumirIA(dono, { versao: 1, modulo: "newsletter", acao: "newsletter.resumo", idempotencia: k, entrada: { texto: e.texto }, contexto: { data: c.data } });
  if (!r?.ok) return { texto: "sem resumo (" + (r?.erro?.codigo ?? "erro") + "); fica a edição sem IA" };
  if (r.modo !== "REAL" || !r.resultado || r.resultado._demo || !r.id) return { texto: "DEMO: a IA não está liberada em REAL; fica a edição sem IA" };
  const ap = aplicarIA(c, r.resultado as ResultadoIA, e.ids);
  if (!ap.ok) return { texto: "resposta recusada (" + ap.motivo + ")" };
  await x.salvarEdicaoIA(dono, ap.conteudo, { modelo: r.consumo?.modelo ?? "claude-haiku-5-5", ia_uso_id: r.id, chave: k });
  return { texto: "resumo salvo", conteudo: ap.conteudo };
}

export async function rodarRotina(x: Deps): Promise<Resultado> {
  const agora = x.agora(), hoje = dataBRT(agora), turno = turnoBRT(agora);
  const d = await x.dados();
  if (!d?.edicao || d.edicao.data !== hoje) return { ok: true, data: hoje, turno, motivo: "a edição de hoje ainda não saiu", donos: [] };
  /* a coleta deste turno ainda não chegou (o GitHub atrasou): a próxima tentativa agendada pega */
  if (!d.coletado || turnoBRT(Date.parse(d.coletado)) !== turno) return { ok: true, data: hoje, turno, motivo: "a edição deste turno ainda não saiu", donos: [] };
  const out: Resultado["donos"] = [];
  for (const dono of await x.donos()) {
    const cfg = await x.config(dono), c = edicaoBase(d, cfg);
    const r = { edicao: "sem destaques", ia: "—", aviso: "—", semana: "—" };
    if (c && c.destaques.length) {
      r.edicao = await x.salvarEdicao(dono, c);
      /* um erro no resumo nunca impede a edição nem o aviso (e não é repetido) */
      const ia = await resumir(x, dono, cfg, c).catch((e) => ({ texto: "erro no resumo (" + String((e as Error)?.message ?? e).slice(0, 60) + "); não repete", conteudo: undefined }));
      r.ia = ia.texto;
      if (cfg?.avisos === false) r.aviso = "avisos desligados";
      else if (await x.registrarAviso(dono, "dia:" + hoje)) { r.aviso = await x.push(dono, msgDia(ia.conteudo ?? c)); await x.anotarAviso(dono, "dia:" + hoje, r.aviso); }
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
  return { ok: true, data: hoje, turno, donos: out };
}
