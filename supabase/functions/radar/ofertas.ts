// Radar de Preços: descoberta de ofertas. Lê, classifica e compara os anúncios que o provedor (SerpApi / Google Shopping) devolve. PURO e testado (tests/radar_descoberta_ofertas.test.mjs): sem rede, sem banco.
// Regras (decisão do dono): NENHUM anúncio é descartado por ter quantidade, peso ou composição diferente da pesquisa. Cada um é classificado (individual, kit do mesmo produto, combo, outra apresentação,
// relacionado, indeterminado), recebe composição e preço por medida quando dá para calcular, e o dono decide. Nada é inventado: preço, frete, entrega e pagamento vêm do provedor ou ficam vazios/desconhecidos.
// O frete do provedor NUNCA vira "frete confirmado": ele é só uma informação do provedor (o frete confirmado para o CEP do dono continua sendo o do Radar).

export type Intencao = { nome: string; marca?: string | null; modelo?: string | null; apresentacao?: string | null; gtin?: string | null };
export type Medida = { valor: number; unidade: "g" | "ml" };
export type Tipo = "individual" | "kit_mesmo_produto" | "combo" | "outra_apresentacao" | "relacionado" | "indeterminado";
export type ItemComposicao = { descricao: string; modelo: string | null; medida: Medida | null; quantidade: number };
export type Classe = { tipo: Tipo; relevancia: number; quantidade: number; produto_chave: string | null; apresentacao_chave: string; medidas: Medida[]; medida_total: Medida | null; composicao: ItemComposicao[]; motivos: string[]; sinais: string[] };
export type PrecoMedida = { valor: number; base: "100 g" | "100 ml" | "unidade" };
export type FreteProvedor = "desconhecido" | "informado_provedor" | "gratis_informado_provedor";
export type PrecoAnterior = { preco: number; observado_em: string };

export type Candidato = {
  provedor: string; engine: string; id_externo: string; pai_externo: string | null;
  titulo: string; loja: string | null; link: string | null; link_tipo: "loja" | "google" | "desconhecido";
  preco: number | null; preco_texto: string | null; moeda: string | null; preco_original: number | null; desconto_texto: string | null;
  frete_situacao: FreteProvedor; frete_valor: number | null; frete_texto: string | null; total: number | null;
  pagamento_texto: string | null; parcelamento_texto: string | null; entrega_texto: string | null; detalhes: string | null;
  avaliacao: number | null; avaliacoes: number | null;
  tipo_oferta: Tipo; relevancia: number; quantidade: number; medida_valor: number | null; medida_unidade: "g" | "ml" | null; composicao: ItemComposicao[];
  preco_por_medida: number | null; base_medida: PrecoMedida["base"] | null; grupo_chave: string; chave_dedup: string;
  /* identidade do PRODUTO e da APRESENTAÇÃO, independentes da loja e do anúncio: é por elas que o histórico acompanha o mesmo produto (ver observacaoDoCandidato) */
  produto_chave: string | null; apresentacao_chave: string;
  catalogo: boolean; varias_fontes: boolean; product_id: string | null; page_token: string | null; token_observado_em: string | null;
  evidencias: string[]; sinais: string[]; observado_em: string; precos_anteriores: PrecoAnterior[];
};

/* ---------- texto ---------- */
export const norm = (t: unknown): string => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[–—−]/g, "-").replace(/\s+/g, " ").trim();
const alnum = (t: unknown): string => norm(t).replace(/[^a-z0-9]/g, "");
const r2 = (x: number): number => Math.round(x * 100) / 100;
const PARADAS = new Set(["para", "com", "sem", "de", "da", "do", "das", "dos", "e", "em", "pele", "kit", "creme", "corporal"]);

/* peso e volume escritos no título: "454g", "1,5 kg", "250 ml", "2 L". kg e L viram g e ml. */
export function medidasDe(titulo: string): Medida[] {
  const t = norm(titulo).replace(/(\d),(\d)/g, "$1.$2"), out: Medida[] = [];
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(kg|grs|gr|g|gramas?|ml|lt|l|litros?)\b/g)) {
    const v = Number(m[1]), u = m[2]; if (!(v > 0)) continue;
    if (u === "kg") out.push({ valor: r2(v * 1000), unidade: "g" });
    else if (u === "g" || u === "gr" || u === "grs" || u.startsWith("grama")) out.push({ valor: v, unidade: "g" });
    else if (u === "ml") out.push({ valor: v, unidade: "ml" });
    else out.push({ valor: r2(v * 1000), unidade: "ml" });
  }
  return out;
}

/* quantas unidades o título anuncia ("Kit 2", "2x", "com 12 un", "trio"). "Leve 2 e pague 1" é promoção, não quantidade. */
export function quantidadeDe(titulo: string): { qtd: number; marcador: string | null } {
  const t = norm(titulo);
  const pads: [RegExp, string][] = [
    [/\bkit\s*(?:com|c\/|de)?\s*(\d{1,3})\b(?!\s*-)/, "kit"], [/\b(\d{1,3})\s*x\s*(?=\d|[a-z])/, "Nx"], [/\bx\s*(\d{1,3})\b/, "xN"],
    [/\b(?:com|c\/)\s*(\d{1,3})\s*(?:un|und|unid|unidades?|pecas?|pcs?|potes?|frascos?|tubos?|caixas?)\b/, "com N"], [/\b(\d{1,3})\s*(?:un|und|unid|unidades?|pecas?|pcs?|potes?|frascos?|tubos?)\b/, "N un"],
    [/\b(?:pack|caixa)\s*(?:com|c\/|de)?\s*(\d{1,3})\b/, "pack"], [/\(\s*(\d{1,3})\s*produtos?\s*\)|\b(\d{1,3})\s*produtos\b/, "N produtos"],
  ];
  for (const [re, nome] of pads) { const m = re.exec(t); if (m) { const n = Number(m[1] ?? m[2]); if (n >= 1 && n <= 99) return { qtd: n, marcador: nome }; } }
  if (/\b(duo|dupla)\b/.test(t)) return { qtd: 2, marcador: "duo" };
  if (/\btrio\b/.test(t)) return { qtd: 3, marcador: "trio" };
  return { qtd: 1, marcador: null };
}

/* códigos de modelo no título ("CH-02", "PS-02", "Mix-02", "AH-2"), em forma comparável ("ch02") */
export function codigosDe(texto: string): string[] {
  const t = norm(texto), out = new Set<string>();
  for (const m of t.matchAll(/\b([a-z]{1,4})\s?-\s?(\d{1,3})\b|\b([a-z]{2,4})(\d{1,3})\b/g)) { const c = (m[1] ?? m[3]) + (m[2] ?? m[4]); if (!["kit", "pack", "leve", "pague", "spf", "x"].includes(m[1] ?? m[3])) out.add(c); }
  return [...out];
}
const bonito = (c: string) => c.replace(/^([a-z]+)(\d+)$/, (_, a, b) => a.toUpperCase() + "-" + b);

/* ---------- classificação ---------- */
export function classificar(titulo: string, loja: string | null, intencao: Intencao): Classe {
  const t = norm(titulo), tAl = alnum(titulo), motivos: string[] = [], sinais: string[] = [];
  const modelo = alnum(intencao.modelo || codigosDe(intencao.nome)[0] || ""), marca = alnum(intencao.marca || "");
  const gtin = String(intencao.gtin ?? "").replace(/\D/g, "").replace(/^0+/, "");
  const temGtin = gtin.length >= 8 && tAl.replace(/^0+/, "").includes(gtin);
  const temModelo = (modelo.length >= 3 && tAl.includes(modelo)) || temGtin;
  const marcaOk = marca.length >= 3 && (tAl.includes(marca) || alnum(loja).includes(marca));
  const med = medidasDe(titulo), { qtd, marcador } = quantidadeDe(titulo), outros = codigosDe(titulo).filter((c) => c !== modelo);
  const medIntent = medidasDe((intencao.apresentacao ?? "") + " " + intencao.nome)[0] ?? null;
  const distintas = med.filter((m, i) => med.findIndex((x) => x.valor === m.valor && x.unidade === m.unidade) === i);
  const medidaIgual = !!medIntent && med.some((m) => m.unidade === medIntent.unidade && m.valor === medIntent.valor);
  const ehKit = /\bkit\b|\bconjunto\b|\bcombo\b/.test(t);
  let tipo: Tipo, composicao: ItemComposicao[] = [], medidaTotal: Medida | null = null, quantidade = qtd;
  const base: ItemComposicao = { descricao: intencao.nome, modelo: modelo || null, medida: med[0] ?? null, quantidade: 1 };
  if (temModelo) {
    if (temGtin) motivos.push("o EAN aparece no título"); else motivos.push("o modelo " + bonito(modelo) + " aparece no título");
    if (outros.length > 0) {
      tipo = "combo"; motivos.push("há outros produtos no título: " + outros.map(bonito).join(", ")); sinais.push("composicao_sugerida");
      composicao = [{ ...base, quantidade: 1 }, ...outros.map((c) => ({ descricao: "Produto " + bonito(c), modelo: c, medida: null, quantidade: 1 }))]; quantidade = 1;
    } else if (distintas.length > 1 && qtd <= 1) {
      tipo = "kit_mesmo_produto"; motivos.push("o mesmo produto em tamanhos diferentes"); composicao = distintas.map((m) => ({ ...base, medida: m, quantidade: 1 }));
      medidaTotal = distintas.every((m) => m.unidade === distintas[0].unidade) ? { valor: r2(distintas.reduce((s, m) => s + m.valor, 0)), unidade: distintas[0].unidade } : null; quantidade = distintas.length;
    } else if (qtd > 1) {
      tipo = "kit_mesmo_produto"; motivos.push("várias unidades do mesmo produto (" + (marcador ?? "") + " " + qtd + ")"); composicao = [{ ...base, quantidade: qtd }];
      medidaTotal = med[0] ? { valor: r2(med[0].valor * qtd), unidade: med[0].unidade } : null;
    } else {
      if (ehKit) sinais.push("kit_sem_quantidade");
      if (medIntent && med.length && !medidaIgual) { tipo = "outra_apresentacao"; motivos.push("tamanho diferente do pesquisado (" + med[0].valor + " " + med[0].unidade + ")"); } else { tipo = "individual"; if (!med.length) sinais.push("medida_nao_informada"); }
      composicao = [base]; medidaTotal = med[0] ?? null;
    }
  } else if (marcaOk) {
    tipo = "relacionado"; motivos.push("mesma marca, sem o modelo pesquisado"); if (ehKit) sinais.push("kit_sem_modelo");
  } else { tipo = "indeterminado"; motivos.push("não foi possível ligar o título à marca nem ao modelo"); }
  const pontos: Record<Tipo, number> = { individual: 70, kit_mesmo_produto: 55, outra_apresentacao: 50, combo: 40, relacionado: 15, indeterminado: 5 };
  const medidaConfere = temModelo && medidaIgual, relevancia = Math.min(100, pontos[tipo] + (medidaConfere ? 10 : 0) + (temGtin ? 10 : 0));
  if (medidaConfere) motivos.push("o tamanho confere com o pesquisado");
  /* identidade: marca|modelo (ou o EAN) para o produto avulso, em qualquer tamanho e em kit do mesmo produto; combo = o conjunto de modelos; relacionado e indeterminado não têm identidade (nunca entram em série de preço de produto) */
  const prod = temGtin ? "gtin:" + gtin : modelo ? (marca ? marca + "|" : "") + modelo : null;
  const rot = (m: Medida | undefined) => (m ? m.valor + m.unidade : "sem_medida");
  let produto_chave: string | null = null, apresentacao_chave = "-";
  if (tipo === "individual" || tipo === "outra_apresentacao") { produto_chave = prod; apresentacao_chave = rot(med[0]); }
  else if (tipo === "kit_mesmo_produto") { produto_chave = prod; apresentacao_chave = distintas.length > 1 && qtd <= 1 ? distintas.map((m) => rot(m)).sort().join("+") : qtd + "x" + rot(med[0]); }
  else if (tipo === "combo") { produto_chave = "combo:" + [modelo, ...outros].filter(Boolean).sort().join("+"); apresentacao_chave = "combo"; }
  return { tipo, relevancia, quantidade, produto_chave, apresentacao_chave, medidas: med, medida_total: medidaTotal, composicao, motivos, sinais };
}

/* preço por 100 g / 100 ml (ou por unidade em kits sem peso). Combos e anúncios sem medida: sem valor (nada é estimado). */
export function precoPorMedida(preco: number | null, c: Pick<Classe, "tipo" | "medida_total" | "quantidade">): { valor: number; base: PrecoMedida["base"] } | null {
  if (!(typeof preco === "number" && preco > 0)) return null;
  if (c.medida_total && c.medida_total.valor > 0 && c.tipo !== "combo" && c.tipo !== "relacionado" && c.tipo !== "indeterminado") return { valor: r2((preco / c.medida_total.valor) * 100), base: c.medida_total.unidade === "g" ? "100 g" : "100 ml" };
  if (c.tipo === "kit_mesmo_produto" && c.quantidade > 1) return { valor: r2(preco / c.quantidade), base: "unidade" };
  return null;
}

/* ---------- leitura dos campos do provedor ---------- */
export function numeroBRL(texto: unknown): number | null {
  if (typeof texto === "number") return isFinite(texto) && texto > 0 ? texto : null;
  const m = /(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})/.exec(String(texto ?? "")); if (!m) return null;
  const v = Number(m[1].replace(/\./g, "") + "." + m[2]); return v > 0 ? v : null;
}
const texto = (v: unknown, max: number): string | null => { const s = String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim(); return s ? s.slice(0, max) : null; };
const numero = (v: unknown): number | null => { const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", ".")); return isFinite(n) && String(v ?? "") !== "" ? n : null; };
export function linkSeguro(v: unknown): { link: string | null; tipo: "loja" | "google" | "desconhecido" } {
  try { const u = new URL(String(v ?? "")); if (u.protocol !== "https:" || String(v).length > 2000) return { link: null, tipo: "desconhecido" };
    return { link: u.toString(), tipo: /(^|\.)google\.[a-z.]+$/.test(u.hostname) || /(^|\.)serpapi\.com$/.test(u.hostname) ? "google" : "loja" }; } catch (_) { return { link: null, tipo: "desconhecido" }; }
}
export function chaveDedup(loja: string | null, titulo: string, preco: number | null): string { return alnum(loja).slice(0, 40) + "|" + alnum(titulo).slice(0, 80) + "|" + (preco == null ? "-" : preco.toFixed(2)); }
export function chaveGrupo(c: Pick<Classe, "tipo" | "quantidade" | "medida_total" | "composicao">): string {
  const mod = c.composicao.map((x) => x.modelo ?? "?").sort().join("+") || "-";
  return c.tipo + "|" + mod + "|" + (c.medida_total ? c.medida_total.valor + c.medida_total.unidade : "-") + "|" + c.quantidade;
}

function montar(base: { provedor: string; engine: string; id_externo: string; pai_externo: string | null; titulo: string; loja: string | null; link: unknown; preco: number | null; preco_texto: string | null; agora: string }, intencao: Intencao): Candidato {
  const k = classificar(base.titulo, base.loja, intencao), pm = precoPorMedida(base.preco, k), l = linkSeguro(base.link);
  const ev = [...k.motivos]; const med = k.medida_total;
  return { provedor: base.provedor, engine: base.engine, id_externo: base.id_externo, pai_externo: base.pai_externo, titulo: base.titulo, loja: base.loja, link: l.link, link_tipo: l.tipo,
    preco: base.preco, preco_texto: base.preco_texto, moeda: base.preco_texto && /R\$/.test(base.preco_texto) ? "BRL" : null, preco_original: null, desconto_texto: null,
    frete_situacao: "desconhecido", frete_valor: null, frete_texto: null, total: null, pagamento_texto: null, parcelamento_texto: null, entrega_texto: null, detalhes: null, avaliacao: null, avaliacoes: null,
    tipo_oferta: k.tipo, relevancia: k.relevancia, quantidade: k.quantidade, medida_valor: med ? med.valor : null, medida_unidade: med ? med.unidade : null, composicao: k.composicao,
    preco_por_medida: pm ? pm.valor : null, base_medida: pm ? pm.base : null, grupo_chave: chaveGrupo(k), chave_dedup: chaveDedup(base.loja, base.titulo, base.preco),
    produto_chave: k.produto_chave, apresentacao_chave: k.apresentacao_chave, catalogo: false, varias_fontes: false, product_id: null, page_token: null, token_observado_em: null, evidencias: ev.slice(0, 8), sinais: k.sinais, observado_em: base.agora, precos_anteriores: [] };
}

/* resultados do Google Shopping (engine google_shopping): um candidato por item de shopping_results. Link do item = página do Google (link_tipo "google"). */
export function candidatosDoShopping(json: any, intencao: Intencao, agora: string): Candidato[] {
  const lista: any[] = Array.isArray(json?.shopping_results) ? json.shopping_results : [], out: Candidato[] = [];
  for (const x of lista) {
    const titulo = texto(x?.title, 300); if (!titulo) continue;
    const preco = numeroBRL(x?.extracted_price) ?? numeroBRL(x?.price), c = montar({ provedor: "serpapi", engine: "google_shopping", id_externo: String(x?.product_id ?? ""), pai_externo: null, titulo, loja: texto(x?.source, 120), link: x?.product_link, preco, preco_texto: texto(x?.price, 60), agora }, intencao);
    c.entrega_texto = texto(x?.delivery, 120); c.avaliacao = numero(x?.rating); c.avaliacoes = numero(x?.reviews);
    c.preco_original = numeroBRL(x?.extracted_old_price) ?? numeroBRL(x?.old_price); c.desconto_texto = texto(x?.tag, 80);
    const par = x?.installment; if (par && typeof par === "object") c.parcelamento_texto = texto((par.price ?? "") + (par.period ? " em " + par.period + "x" : ""), 80);
    c.catalogo = /prds=catalogid:/.test(String(x?.product_link ?? "")); c.varias_fontes = x?.multiple_sources === true || x?.multiple_sources === "true";
    c.product_id = c.id_externo || null; c.page_token = texto(x?.immersive_product_page_token, 4000); c.token_observado_em = c.page_token ? agora : null;
    if (!c.id_externo) c.id_externo = c.chave_dedup;
    out.push(c);
  }
  return out;
}

/* lojas de um produto (engines google_immersive_product e google_product: product_results.stores). Cada loja herda a classificação do anúncio de origem; o preço por medida usa o preço DA LOJA. */
export function lojasDoProduto(json: any, pai: Candidato, intencao: Intencao, engine: string, agora: string): Candidato[] {
  const lista: any[] = Array.isArray(json?.product_results?.stores) ? json.product_results.stores : [], out: Candidato[] = [];
  const k = classificar(pai.titulo, pai.loja, intencao);
  for (const x of lista) {
    const loja = texto(x?.name, 120); if (!loja) continue;
    const titulo = texto(x?.title, 300) ?? pai.titulo, preco = numeroBRL(x?.extracted_price) ?? numeroBRL(x?.price);
    const c = montar({ provedor: "serpapi", engine, id_externo: pai.id_externo + "@" + alnum(loja).slice(0, 40) + (x?.merchant_id ? ":" + String(x.merchant_id).slice(0, 30) : ""), pai_externo: pai.id_externo, titulo, loja, link: x?.link, preco, preco_texto: texto(x?.price, 60), agora }, intencao);
    Object.assign(c, { tipo_oferta: k.tipo, relevancia: k.relevancia, quantidade: k.quantidade, produto_chave: k.produto_chave, apresentacao_chave: k.apresentacao_chave, medida_valor: k.medida_total?.valor ?? null, medida_unidade: k.medida_total?.unidade ?? null, composicao: k.composicao, grupo_chave: chaveGrupo(k) });
    const pm = precoPorMedida(preco, k); c.preco_por_medida = pm ? pm.valor : null; c.base_medida = pm ? pm.base : null;
    c.preco_original = numeroBRL(x?.original_price); c.desconto_texto = texto(x?.discount, 80); c.pagamento_texto = texto(x?.payment_methods, 200); c.detalhes = texto(x?.details_and_offers, 160);
    c.avaliacao = numero(x?.rating); c.avaliacoes = numero(x?.reviews); c.total = numeroBRL(x?.extracted_total) ?? numeroBRL(x?.total);
    const frete = numero(x?.shipping_extracted), ft = texto(x?.shipping, 60); c.frete_texto = ft;
    if (frete != null && frete > 0) { c.frete_situacao = "informado_provedor"; c.frete_valor = frete; } else if (ft && /\b(free|gr[aá]tis)\b/i.test(ft)) c.frete_situacao = "gratis_informado_provedor";
    c.catalogo = false; c.varias_fontes = false; c.product_id = pai.product_id; c.page_token = null; c.token_observado_em = null;
    c.evidencias = [...k.motivos.slice(0, 4), "loja listada pelo Google para o mesmo anúncio"].slice(0, 8);
    out.push(c);
  }
  return out;
}

/* ---------- agrupamento, histórico e ordem ---------- */
/* mesmo anúncio visto de novo: atualiza os dados, guarda o preço anterior (só se mudou, no máximo 20) e preserva a decisão e a oferta já ligadas */
export function mesclarCandidato<T extends Candidato & { id?: string; decisao?: string; oferta_id?: string | null }>(antigo: T, novo: Candidato): T {
  const anteriores = [...(antigo.precos_anteriores ?? [])];
  if (antigo.preco != null && novo.preco != null && Math.abs(antigo.preco - novo.preco) >= 0.005 && antigo.observado_em) anteriores.push({ preco: antigo.preco, observado_em: antigo.observado_em });
  const mantemToken = !novo.page_token && antigo.page_token;
  return { ...antigo, ...novo, id: antigo.id, decisao: antigo.decisao, oferta_id: antigo.oferta_id, precos_anteriores: anteriores.slice(-20),
    page_token: mantemToken ? antigo.page_token : novo.page_token, token_observado_em: mantemToken ? antigo.token_observado_em : novo.token_observado_em } as T;
}
/* grupos de anúncios comparáveis (mesmo tipo, modelo, medida e quantidade), com o menor preço por medida; nada é removido da lista */
export function agrupar(lista: Candidato[]): { chave: string; tipo: Tipo; n: number; menor_preco_por_medida: number | null; menor_preco: number | null }[] {
  const m = new Map<string, Candidato[]>(); for (const c of lista) (m.get(c.grupo_chave) ?? m.set(c.grupo_chave, []).get(c.grupo_chave)!).push(c);
  return [...m.entries()].map(([chave, l]) => ({ chave, tipo: l[0].tipo_oferta, n: l.length, menor_preco_por_medida: minimo(l.map((x) => x.preco_por_medida)), menor_preco: minimo(l.map((x) => x.preco)) })).sort((a, b) => b.n - a.n);
}
const minimo = (v: (number | null)[]): number | null => { const n = v.filter((x): x is number => typeof x === "number"); return n.length ? Math.min(...n) : null; };
export type Ordem = "medida" | "total" | "preco" | "relevancia";
export function ordenar<T extends Candidato>(lista: T[], modo: Ordem): T[] {
  const chave = (c: T): number | null => (modo === "medida" ? c.preco_por_medida : modo === "total" ? (c.total ?? c.preco) : modo === "preco" ? c.preco : -c.relevancia);
  return [...lista].sort((a, b) => { const x = chave(a), y = chave(b); if (x == null && y == null) return b.relevancia - a.relevancia; if (x == null) return 1; if (y == null) return -1; return x - y || b.relevancia - a.relevancia; });
}

/* ---------- histórico de observações do produto ---------- */
/* Cada vez que um anúncio é visto com preço, vira UMA observação no histórico (radar_historico, só de acréscimo). A série é por IDENTIDADE (produto_chave + apresentacao_chave, ou produto_chave + base_medida),
   não por anúncio nem por loja: trocar de loja ou de anúncio não corta a série, e kit, combo, outro tamanho e relacionado NÃO se misturam com o produto avulso (cada um tem a sua apresentacao_chave; relacionado e indeterminado não têm produto_chave).
   Não é o histórico confirmado do Radar (radar_precos): aqui o preço é o que o provedor mostrou, sem evidência de loja. */
export type ObsHistorico = { produto_chave: string | null; apresentacao_chave: string; provedor: string; engine: string; id_externo: string; loja: string | null; titulo: string; tipo_oferta: Tipo; quantidade: number;
  medida_valor: number | null; medida_unidade: "g" | "ml" | null; preco: number; total: number | null; preco_por_medida: number | null; base_medida: PrecoMedida["base"] | null; frete_situacao: FreteProvedor; link_tipo: Candidato["link_tipo"]; observado_em: string };
export function observacaoDoCandidato(c: Candidato): ObsHistorico | null {
  if (!(typeof c.preco === "number" && c.preco > 0)) return null;
  return { produto_chave: c.produto_chave, apresentacao_chave: c.apresentacao_chave, provedor: c.provedor, engine: c.engine, id_externo: c.id_externo, loja: c.loja, titulo: c.titulo.slice(0, 300), tipo_oferta: c.tipo_oferta, quantidade: c.quantidade,
    medida_valor: c.medida_valor, medida_unidade: c.medida_unidade, preco: c.preco, total: c.total, preco_por_medida: c.preco_por_medida, base_medida: c.base_medida, frete_situacao: c.frete_situacao, link_tipo: c.link_tipo, observado_em: c.observado_em };
}
/* quando gravar: primeira vez que o anúncio aparece, preço diferente do último, ou já faz pelo menos "minHoras" (evita uma linha por rodada sem mudança) */
export function deveRegistrarObservacao(ultima: { preco: number | null; observado_em: string } | undefined, c: Candidato, agoraMs: number, minHoras = 20): boolean {
  if (!(typeof c.preco === "number" && c.preco > 0)) return false;
  if (!ultima) return true;
  if (ultima.preco == null || Math.abs(ultima.preco - c.preco) >= 0.005) return true;
  const t = Date.parse(ultima.observado_em); return !isFinite(t) || agoraMs - t >= minHoras * 3600_000;
}
export const chaveObservacao = (c: { provedor: string; id_externo: string; loja: string | null }): string => c.provedor + "|" + c.id_externo + "|" + alnum(c.loja).slice(0, 40);

/* ---------- consultas ---------- */
export type Variante = { id: string; q: string; motivo: string };
/* variantes de pesquisa, da mais útil para a menos: nome completo + tamanho; só o nome; e o EAN sozinho (o EAN misturado a muitas palavras reduziu a relevância na PoC) */
export function variantesDeConsulta(i: Intencao): Variante[] {
  const nome = [i.nome, i.marca && !norm(i.nome).includes(norm(i.marca)) ? i.marca : "", i.modelo && !norm(i.nome).includes(norm(i.modelo)) ? i.modelo : "", i.apresentacao && !norm(i.nome).includes(norm(i.apresentacao)) ? i.apresentacao : ""].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const v: Variante[] = [{ id: "completa", q: nome.slice(0, 200), motivo: "nome, marca, modelo e tamanho" }];
  const curta = [i.marca, i.modelo ?? codigosDe(i.nome)[0]?.toUpperCase()].filter(Boolean).join(" ").trim();
  if (curta && norm(curta) !== norm(nome)) v.push({ id: "marca_modelo", q: curta.slice(0, 200), motivo: "só marca e modelo (pega kits e outros tamanhos)" });
  const g = String(i.gtin ?? "").replace(/\D/g, ""); if (g.length >= 8) v.push({ id: "ean", q: g, motivo: "só o EAN" });
  return v;
}
