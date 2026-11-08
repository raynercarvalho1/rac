// Resumo diário dos alertas de preço do Mercado, por Web Push, só para o DONO (docs/mercado-alertas.md).
// Mesmas regras de nucleo.js (mkalGerar, mkalConfig, mkalClassificar), em TypeScript, como a função já faz com previsaoCompras.
// Isolado neste arquivo: a rotina diária da "garmin" só chama resumoAlertasPreco() num passo próprio. Nada daqui lê ou grava dados do relógio.
// Não marca nenhum alerta como lido (a leitura é do dono, no site) e não guarda segredos. O envio em si (pushPara) vem do index.ts.

export type Linha = {
  id: string; data: string; mercado: string; produto: string; categoria: string; unidade: string;
  quantidade: number; valor_unitario: number; valor_total: number; nota: string;
};
export type Tipo = "aumento" | "queda" | "minimo" | "minimo_periodo" | "melhor" | "limite";
export type Alerta = {
  id: string; tipo: Tipo; chave: string; nome: string; unidade: string; data: string; mercado: string;
  atual: number; anterior: number | null; pct: number | null; refMercado: string; refData: string; motivo: string;
};
type Limite = { chave: string; nome: string; unidade: string; max: number };
export type Config = {
  tipos: Record<Tipo, { on: boolean; pct?: number; dias?: number }>; novosDias: number; limites: Limite[]; push: { on: boolean };
};
export type Msg = { titulo: string; corpo: string; url: string; tag: string };

export const PREFIXO_DIA = "mercado-alertas-push:";
export const URL_ALERTAS = "./#mercado/alertas";
/* o resumo só leva alertas de compras dos últimos dias: o primeiro envio não despeja um mês inteiro de histórico */
export const JANELA_PUSH_DIAS = 7;

/* ---------- identidade e datas (mesmas de nucleo.js: mkcUn, mkcChaveProd, mkcDia, mkcOrd) ---------- */
const mkcUn = (u: unknown) => { const t = String(u ?? "").trim().toLowerCase(); return t === "" || t === "un" || t === "und" || t === "unid" ? "un" : t; };
const mkcChaveProd = (x: { produto: string; unidade: unknown }) => String(x.produto) + "\u0001" + mkcUn(x.unidade);
const p2 = (n: number) => (n < 10 ? "0" + n : "" + n);
export const mkcDia = (iso: string, n: number) => {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n));
  return d.getUTCFullYear() + "-" + p2(d.getUTCMonth() + 1) + "-" + p2(d.getUTCDate());
};
const mkcOrd = (a: Linha, b: Linha) => (a.data < b.data ? -1 : a.data > b.data ? 1 : String(a.id || "") < String(b.id || "") ? -1 : 1);
const semCidade = (n: string) => String(n || "").replace(/\s*\(.*\)$/, "");
const mkalM = (v: number) => "R$ " + (+v).toFixed(2).replace(".", ",");
const mkalD = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4);
const mkalP = (v: number) => (Math.round(Math.abs(v) * 1000) / 10).toString().replace(".", ",") + "%";
const mkalU = (u: string) => (u === "kg" ? "/kg" : u === "l" ? "/L" : u === "un" ? "/un" : "/" + u);
const mkalNum = (v: unknown, min: number, max: number, pad: number) => { const n = +(v as number); return isFinite(n) && n >= min && n <= max ? n : pad; };

/* ---------- configuração (igual à do site; "push.on" liga/desliga este resumo e vale ligado se nunca foi mexido) ---------- */
const PADRAO: Record<Tipo, { on: boolean; pct?: number; dias?: number }> = {
  aumento: { on: true, pct: 0.15 }, queda: { on: true, pct: 0.15 }, minimo: { on: true }, minimo_periodo: { on: false, dias: 90 },
  melhor: { on: true, pct: 0.10, dias: 60 }, limite: { on: true },
};
export function configAlertas(raw0: unknown): Config {
  const raw = (raw0 && typeof raw0 === "object" ? raw0 : {}) as Record<string, any>;
  const t = raw.tipos && typeof raw.tipos === "object" ? raw.tipos : {};
  const o: Config = { tipos: {} as Config["tipos"], novosDias: Math.round(mkalNum(raw.novosDias, 7, 180, 30)), limites: [],
    push: { on: typeof raw.push?.on === "boolean" ? raw.push.on : true } };
  (Object.keys(PADRAO) as Tipo[]).forEach((k) => {
    const r = t[k] && typeof t[k] === "object" ? t[k] : {}, p = PADRAO[k], c: { on: boolean; pct?: number; dias?: number } = { on: typeof r.on === "boolean" ? r.on : p.on };
    if (p.pct != null) c.pct = mkalNum(r.pct, 0.01, 5, p.pct);
    if (p.dias != null) c.dias = Math.round(mkalNum(r.dias, 7, 730, p.dias));
    o.tipos[k] = c;
  });
  const vistos: Record<string, Limite> = {};
  for (const l of Array.isArray(raw.limites) ? raw.limites : []) {
    if (!l || typeof l.nome !== "string" || !l.nome.trim()) continue;
    const max = +l.max; if (!isFinite(max) || max <= 0 || max > 100000) continue;
    const u = mkcUn(l.unidade), ch = mkcChaveProd({ produto: l.nome.trim(), unidade: u });
    vistos[ch] = { chave: ch, nome: l.nome.trim(), unidade: u, max: Math.round(max * 100) / 100 };
  }
  o.limites = Object.values(vistos);
  return o;
}

/* ---------- as regras (cópia fiel de mkalGerar) ---------- */
export function gerarAlertas(rows: Linha[], cfg0: unknown): Alerta[] {
  const cfg = configAlertas(cfg0), T = cfg.tipos, out: Alerta[] = [], g: Record<string, Linha[]> = {}, ordemChaves: string[] = [];
  for (const x of rows ?? []) { const k = mkcChaveProd(x); if (!g[k]) { g[k] = []; ordemChaves.push(k); } g[k].push(x); }
  function ev(tipo: Tipo, k: string, cur: Linha, o: { anterior?: number | null; pct?: number | null; refMercado?: string; refData?: string; regra?: string; motivo: string }) {
    out.push({ id: tipo + "|" + k + "|" + cur.id + (o.regra ? "|" + o.regra : ""), tipo, chave: k, nome: cur.produto, unidade: mkcUn(cur.unidade), data: cur.data, mercado: cur.mercado,
      atual: +cur.valor_unitario, anterior: o.anterior == null ? null : o.anterior, pct: o.pct == null ? null : o.pct, refMercado: o.refMercado || "", refData: o.refData || "", motivo: o.motivo });
  }
  for (const k of ordemChaves) {
    const l = g[k].slice().sort(mkcOrd), un = mkcUn(l[0].unidade), su = mkalU(un);
    for (let i = 1; i < l.length; i++) {
      const prev = l[i - 1], cur = l[i], pp = +prev.valor_unitario, pc = +cur.valor_unitario;
      if (!(pp > 0) || !(pc > 0)) continue;
      const v = (pc - pp) / pp;
      if (T.aumento.on && v >= T.aumento.pct!) ev("aumento", k, cur, { anterior: pp, pct: v, refMercado: prev.mercado, refData: prev.data, motivo: "O preço subiu " + mkalP(v) + " em relação à compra anterior (" + mkalM(pp) + su + " em " + mkalD(prev.data) + " → " + mkalM(pc) + su + "). Regra: aumento de " + mkalP(T.aumento.pct!) + " ou mais." });
      if (T.queda.on && v <= -T.queda.pct!) ev("queda", k, cur, { anterior: pp, pct: v, refMercado: prev.mercado, refData: prev.data, motivo: "O preço caiu " + mkalP(v) + " em relação à compra anterior (" + mkalM(pp) + su + " em " + mkalD(prev.data) + " → " + mkalM(pc) + su + "). Regra: queda de " + mkalP(T.queda.pct!) + " ou mais." });
      if (i >= 2) {
        let mn: { v: number; x: Linha } | null = null;
        for (let j = 0; j < i; j++) { const q = +l[j].valor_unitario; if (q > 0 && (mn === null || q < mn.v)) mn = { v: q, x: l[j] }; }
        if (mn && T.minimo.on && pc < mn.v) ev("minimo", k, cur, { anterior: mn.v, pct: (pc - mn.v) / mn.v, refMercado: mn.x.mercado, refData: mn.x.data, motivo: "Menor preço registrado no RAC para este produto (" + mkalM(pc) + su + "), abaixo do mínimo anterior (" + mkalM(mn.v) + su + " em " + mkalD(mn.x.data) + "), com " + i + " compras anteriores. Não é o menor preço do mercado, só do seu histórico." });
        else if (mn && T.minimo_periodo.on) {
          const corte = mkcDia(cur.data, -T.minimo_periodo.dias!); let w: { v: number; x: Linha } | null = null, n = 0;
          for (let m = 0; m < i; m++) { if (l[m].data >= corte && +l[m].valor_unitario > 0) { n++; if (w === null || +l[m].valor_unitario < w.v) w = { v: +l[m].valor_unitario, x: l[m] }; } }
          if (n >= 2 && w && pc < w.v) ev("minimo_periodo", k, cur, { anterior: w.v, pct: (pc - w.v) / w.v, refMercado: w.x.mercado, refData: w.x.data, motivo: "Menor preço registrado nos últimos " + T.minimo_periodo.dias + " dias (" + mkalM(pc) + su + "; antes " + mkalM(w.v) + su + " em " + mkalD(w.x.data) + "), com " + n + " compras no período." });
        }
      }
    }
    if (T.melhor.on) for (let a = 1; a < l.length; a++) {
      const ref = l[a], pr = +ref.valor_unitario; if (!(pr > 0)) continue;
      const corteM = mkcDia(ref.data, -T.melhor.dias!), vistoM: Record<string, number> = {}; let melhor: { v: number; x: Linha } | null = null;
      for (let b = a - 1; b >= 0; b--) {
        const c = l[b]; if (c.mercado === ref.mercado || vistoM[c.mercado]) continue; vistoM[c.mercado] = 1;
        const pcnd = +c.valor_unitario; if (pcnd > 0 && c.data >= corteM && (melhor === null || pcnd < melhor.v)) melhor = { v: pcnd, x: c };
      }
      if (melhor && (pr - melhor.v) / pr >= T.melhor.pct!) {
        const d = (pr - melhor.v) / pr;
        out.push({ id: "melhor|" + k + "|" + ref.id + "|" + melhor.x.id, tipo: "melhor", chave: k, nome: ref.produto, unidade: un, data: ref.data, mercado: melhor.x.mercado, atual: melhor.v, anterior: pr, pct: -d, refMercado: ref.mercado, refData: ref.data,
          motivo: "Em " + semCidade(melhor.x.mercado) + " o mesmo produto (" + mkalM(melhor.v) + su + " em " + mkalD(melhor.x.data) + ") saiu " + mkalP(d) + " mais barato que em " + semCidade(ref.mercado) + " (" + mkalM(pr) + su + " em " + mkalD(ref.data) + "). Mesma unidade, registros a no máximo " + T.melhor.dias + " dias um do outro. Regra: diferença de " + mkalP(T.melhor.pct!) + " ou mais." });
      }
    }
  }
  if (T.limite.on) for (const lim of cfg.limites) for (const cur of (g[lim.chave] ?? []).slice().sort(mkcOrd)) {
    const p = +cur.valor_unitario;
    if (p > 0 && p <= lim.max) ev("limite", lim.chave, cur, { anterior: lim.max, pct: (p - lim.max) / lim.max, regra: String(lim.max), motivo: "Preço pago " + mkalM(p) + mkalU(mkcUn(cur.unidade)) + " ficou igual ou abaixo do seu limite de " + mkalM(lim.max) + mkalU(mkcUn(cur.unidade)) + "." });
  }
  const ordem: Record<string, number> = { aumento: 0, queda: 1, minimo: 2, minimo_periodo: 3, melhor: 4, limite: 5 };
  return out.sort((x, y) => (x.data < y.data ? 1 : x.data > y.data ? -1 : ordem[x.tipo] - ordem[y.tipo] || x.nome.localeCompare(y.nome) || (x.id < y.id ? -1 : 1)));
}

/* ---------- o que entra no resumo ---------- */
/* alerta ligado, de compra recente (até JANELA_PUSH_DIAS, e nunca além da janela de "novos" do dono), ainda NÃO lido pelo dono e que NÃO foi levado a um resumo anterior */
export function relevantes(alertas: Alerta[], estado: unknown, hoje: string, cfg: Config, avisados: Set<string>): Alerta[] {
  const lidos = new Set<string>(Array.isArray((estado as any)?.lidos) ? (estado as any).lidos : []);
  const corte = mkcDia(hoje, -Math.min(JANELA_PUSH_DIAS, cfg.novosDias));
  return alertas.filter((a) => cfg.tipos[a.tipo].on && a.data >= corte && a.data <= hoje && !lidos.has(a.id) && !avisados.has(a.id));
}
export function contarPorTipo(l: Alerta[]) { const c: Partial<Record<Tipo, number>> = {}; for (const a of l) c[a.tipo] = (c[a.tipo] ?? 0) + 1; return c; }
const ROTULOS: [Tipo, string, string][] = [
  ["queda", "queda de preço", "quedas de preço"], ["aumento", "aumento relevante", "aumentos relevantes"], ["minimo", "novo menor preço histórico", "novos menores preços históricos"],
  ["minimo_periodo", "menor preço no período", "menores preços no período"], ["melhor", "oportunidade em outro mercado", "oportunidades em outro mercado"], ["limite", "limite de preço atingido", "limites de preço atingidos"],
];
/* só contagens: nada de nome de produto, preço ou mercado na tela bloqueada. Sem alertas não há mensagem. */
export function montarMensagem(c: Partial<Record<Tipo, number>>): Msg | null {
  const linhas = ROTULOS.filter(([t]) => (c[t] ?? 0) > 0).map(([t, s, p]) => "• " + c[t] + " " + (c[t] === 1 ? s : p));
  if (!linhas.length) return null;
  return { titulo: "RAC Mercado — Resumo de preços", corpo: "Hoje você tem:\n" + linhas.join("\n") + "\nAbra o RAC para consultar os produtos.", url: URL_ALERTAS, tag: "mercado-alertas" };
}
/* o texto que o pushPara devolve ("2 de 3 aparelhos" ou "nenhum aparelho com notificações ativas") */
export function lerResultadoPush(s: string): { ok: number; total: number } | null {
  const m = /^(\d+) de (\d+) aparelhos$/.exec(String(s ?? "").trim()); if (m) return { ok: +m[1], total: +m[2] };
  return /^nenhum aparelho/.test(String(s ?? "")) ? { ok: 0, total: 0 } : null;
}

/* ---------- banco (só pessoal e as tabelas do Mercado; o service_role já tem select e, em pessoal, insert/update) ---------- */
export type Banco = {
  linhas(uid: string): Promise<Linha[]>;
  pessoal(uid: string, chave: string): Promise<any | null>;
  dias(uid: string, desde: string): Promise<{ chave: string; valor: any }[]>;
  reservar(uid: string, chave: string, valor: unknown): Promise<boolean>;
  atualizar(uid: string, chave: string, valor: unknown): Promise<void>;
};
export function bancoSupabase(adm: any): Banco {
  async function paginas(tabela: string, colunas: string, uid: string) {
    const out: any[] = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await adm.from(tabela).select(colunas).eq("user_id", uid).order("id").range(de, de + 999);
      if (error) throw new Error(tabela + ": " + error.message);
      out.push(...(data ?? [])); if ((data ?? []).length < 1000) break;
    }
    return out;
  }
  return {
    async linhas(uid) {
      const [notas, mercados, produtos, itens] = await Promise.all([paginas("notas", "id,data,mercado_id,numero", uid), paginas("mercados", "id,nome", uid), paginas("produtos", "id,nome,categoria", uid),
        paginas("itens", "id,nota_id,produto_id,descricao,categoria,quantidade,unidade,valor_unitario,valor_total", uid)]);
      const nm: Record<string, any> = {}; for (const n of notas) nm[n.id] = n;
      const mm: Record<string, string> = {}; for (const m of mercados) mm[m.id] = m.nome;
      const pm: Record<string, any> = {}; for (const p of produtos) pm[p.id] = p;
      const out: Linha[] = [];
      for (const i of itens) {
        const n = nm[i.nota_id]; if (!n) continue; const p = pm[i.produto_id], mercado = mm[n.mercado_id] ?? "";
        out.push({ id: i.id, data: n.data, mercado, produto: p?.nome ?? i.descricao, categoria: p?.categoria ?? i.categoria, unidade: i.unidade, quantidade: Number(i.quantidade), valor_unitario: Number(i.valor_unitario), valor_total: Number(i.valor_total),
          nota: n.data + "|" + mercado + "|" + (n.numero || "") });
      }
      return out;
    },
    async pessoal(uid, chave) {
      const { data, error } = await adm.from("pessoal").select("valor").eq("user_id", uid).eq("chave", chave).maybeSingle();
      if (error) throw new Error("pessoal: " + error.message); return data?.valor ?? null;
    },
    async dias(uid, desde) {
      const { data, error } = await adm.from("pessoal").select("chave,valor").eq("user_id", uid).like("chave", PREFIXO_DIA + "%").gte("chave", PREFIXO_DIA + desde);
      if (error) throw new Error("pessoal: " + error.message); return data ?? [];
    },
    async reservar(uid, chave, valor) {
      const { error } = await adm.from("pessoal").insert({ user_id: uid, chave, valor });
      if (!error) return true; if (error.code === "23505") return false; throw new Error("pessoal: " + error.message);
    },
    async atualizar(uid, chave, valor) {
      const { error } = await adm.from("pessoal").update({ valor, atualizado: new Date().toISOString() }).eq("user_id", uid).eq("chave", chave);
      if (error) throw new Error("pessoal: " + error.message);
    },
  };
}

/* ---------- o passo da rotina ---------- */
const RETENTAVEIS = new Set(["falhou", "sem_aparelho"]);
/* uid = o dono que a rotina já identificou (quem tem dados pessoais e não é membro da casa). enviar() = pushPara(adm, uid, …): só os aparelhos desse uid. */
export async function resumoAlertasPreco(adm: any, uid: string, hoje: string, enviar: (m: Msg) => Promise<string>, banco: Banco = bancoSupabase(adm)) {
  if (!uid) return { enviado: false, motivo: "sem destinatário" };
  const cru = await banco.pessoal(uid, "mercado-alertas"), cfg = configAlertas(cru?.cfg);
  if (!cfg.push.on) return { enviado: false, motivo: "resumo diário desligado nos ajustes" };
  const chaveDia = PREFIXO_DIA + hoje, antes = await banco.pessoal(uid, chaveDia);
  if (antes && !RETENTAVEIS.has(antes.estado)) return { enviado: false, motivo: "o resumo de hoje já foi tratado", estado: antes.estado };
  const [rows, dias] = await Promise.all([banco.linhas(uid), banco.dias(uid, mkcDia(hoje, -200))]);
  const avisados = new Set<string>();
  for (const d of dias) if (d.valor && !RETENTAVEIS.has(d.valor.estado) && Array.isArray(d.valor.ids)) for (const i of d.valor.ids) avisados.add(i);
  const rel = relevantes(gerarAlertas(rows, cfg), cru?.estado, hoje, cfg, avisados), contagem = contarPorTipo(rel), msg = montarMensagem(contagem);
  if (!msg) return { enviado: false, motivo: "sem alertas novos" };
  const registro = { v: 1, data: hoje, estado: "enviando", ids: rel.map((a) => a.id), contagem };
  if (!antes) { if (!(await banco.reservar(uid, chaveDia, registro))) return { enviado: false, motivo: "outro envio de hoje já reservou o resumo" }; }
  else await banco.atualizar(uid, chaveDia, registro);
  let texto = "";
  try { texto = await enviar(msg); } catch (e) {
    await banco.atualizar(uid, chaveDia, { ...registro, estado: "falhou", erro: String((e as Error)?.message ?? e).slice(0, 200) });
    throw e;
  }
  const r = lerResultadoPush(texto);
  const estado = !r ? "indefinido" : r.total === 0 ? "sem_aparelho" : r.ok === 0 ? "falhou" : r.ok < r.total ? "parcial" : "enviado";
  await banco.atualizar(uid, chaveDia, { ...registro, estado, resultado: texto, enviado_em: new Date().toISOString() });
  return { enviado: !!r && r.ok > 0, estado, alertas: rel.length, contagem, aparelhos: texto };
}
