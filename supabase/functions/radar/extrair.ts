// Radar de Preços: extração de dados de produto de uma página (schema.org JSON-LD, Open Graph e meta). Lógica pura e testada
// (tests/radar_servidor.test.mjs). Só devolve o que a página DECLARA, com a fonte de cada campo; o que não dá para afirmar fica pendente.
// Nunca decide frete (sempre "desconhecido"), nunca decide à vista × parcelado, nunca inventa preço e não executa nada da página.

export type Fonte = "json-ld" | "og" | "meta";
export type Campo<T> = { valor: T; fonte: Fonte };
export type Disponibilidade = "disponivel" | "indisponivel" | "desconhecida";
export type Extraido = {
  titulo: Campo<string> | null;
  nome: Campo<string> | null;
  marca: Campo<string> | null;
  modelo: Campo<string> | null;
  gtin: Campo<string> | null;
  preco: Campo<number> | null;
  moeda: Campo<string> | null;
  vendedor: Campo<string> | null;
  loja: Campo<string> | null;
  disponibilidade: Campo<Disponibilidade> | null;
  /* a página pode falar de frete, mas ele depende do CEP: aqui só vira uma dica para conferir; nunca "grátis" */
  frete: { situacao: "desconhecido"; dica: string | null };
  pendentes: string[];
  avisos: string[];
};

const TAM_MAX = 2_000_000;
const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function decodificar(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
    return ENT[e.toLowerCase()] ?? m;
  });
}
const limpo = (v: unknown, max = 300): string => (typeof v === "string" || typeof v === "number" ? String(v) : "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/* GTIN-8/12/13/14 com dígito verificador (módulo 10) */
export function gtinValido(g: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(g)) return false;
  const d = g.split("").map(Number), dv = d.pop()!;
  let s = 0;
  d.reverse().forEach((x, i) => { s += x * (i % 2 === 0 ? 3 : 1); });
  return (10 - (s % 10)) % 10 === dv;
}

/* "1299.9", "1.299,90", "R$ 1.299,90" → 1299.9 (null se não for um preço claro) */
export function lerPreco(v: unknown): number | null {
  if (typeof v === "number") return isFinite(v) && v > 0 && v < 10_000_000 ? Math.round(v * 100) / 100 : null;
  if (typeof v !== "string") return null;
  let s = v.replace(/[R$\s ]/g, "");
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const vir = s.lastIndexOf(","), pto = s.lastIndexOf(".");
  if (vir >= 0 && pto >= 0) s = vir > pto ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (vir >= 0) s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return isFinite(n) && n > 0 && n < 10_000_000 ? Math.round(n * 100) / 100 : null;
}

function blocosLd(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null, n = 0;
  while ((m = re.exec(html)) && n++ < 20) {
    try { out.push(JSON.parse(decodificar(m[1]).trim())); } catch (_) { /* bloco inválido: ignorado */ }
  }
  return out;
}
function nos(x: unknown, acc: Record<string, unknown>[] = [], prof = 0): Record<string, unknown>[] {
  if (prof > 6 || acc.length > 200) return acc;
  if (Array.isArray(x)) { for (const y of x) nos(y, acc, prof + 1); return acc; }
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    acc.push(o);
    if (o["@graph"]) nos(o["@graph"], acc, prof + 1);
    if (o.mainEntity) nos(o.mainEntity, acc, prof + 1);
  }
  return acc;
}
const tipoDe = (o: Record<string, unknown>): string[] => { const t = o["@type"]; return (Array.isArray(t) ? t : [t]).map((x) => String(x ?? "").split("/").pop()!.toLowerCase()); };
const nomeDe = (v: unknown): string => (v && typeof v === "object" ? limpo((v as Record<string, unknown>).name) : limpo(v));

function metas(html: string): Record<string, string> {
  const m: Record<string, string> = {};
  const re = /<meta\b([^>]*)>/gi;
  let x: RegExpExecArray | null, n = 0;
  while ((x = re.exec(html)) && n++ < 400) {
    const a = x[1];
    const k = /(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i.exec(a)?.[1]?.toLowerCase();
    const c = /content\s*=\s*["']([^"']*)["']/i.exec(a)?.[1];
    if (k && c !== undefined && !(k in m)) m[k] = limpo(decodificar(c), 400);
  }
  return m;
}

function disponibilidadeDe(v: unknown): Disponibilidade {
  const s = limpo(v).toLowerCase();
  if (/instock|limitedavailability|onlineonly|instoreonly|presale|preorder|backorder/.test(s)) return "disponivel";
  if (/outofstock|soldout|discontinued/.test(s)) return "indisponivel";
  return "desconhecida";
}

export function extrairPagina(html: string, urlFinal: string): Extraido {
  const r: Extraido = { titulo: null, nome: null, marca: null, modelo: null, gtin: null, preco: null, moeda: null, vendedor: null, loja: null, disponibilidade: null, frete: { situacao: "desconhecido", dica: null }, pendentes: [], avisos: [] };
  const h = html.length > TAM_MAX ? html.slice(0, TAM_MAX) : html;
  const meta = metas(h);
  const titulo = limpo(meta["og:title"] || decodificar(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(h)?.[1] ?? ""), 200);
  if (titulo) r.titulo = { valor: titulo, fonte: meta["og:title"] ? "og" : "meta" };
  let host = ""; try { host = new URL(urlFinal).hostname.replace(/^www\./, ""); } catch (_) { /* nada */ }
  const site = limpo(meta["og:site_name"], 80);
  r.loja = site ? { valor: site, fonte: "og" } : host ? { valor: host, fonte: "meta" } : null;

  const todos = blocosLd(h).flatMap((b) => nos(b));
  const produtos = todos.filter((o) => tipoDe(o).includes("product"));
  if (produtos.length > 1) r.avisos.push("A página tem mais de um produto; usei o primeiro. Confira.");
  const p = produtos[0];
  if (p) {
    const nome = limpo(p.name, 200); if (nome) r.nome = { valor: nome, fonte: "json-ld" };
    const marca = nomeDe(p.brand); if (marca) r.marca = { valor: marca.slice(0, 80), fonte: "json-ld" };
    const modelo = limpo(p.model && typeof p.model === "object" ? (p.model as Record<string, unknown>).name : p.model, 120) || limpo(p.mpn, 120);
    if (modelo) r.modelo = { valor: modelo, fonte: "json-ld" };
    for (const k of ["gtin13", "gtin14", "gtin12", "gtin8", "gtin"]) {
      const g = limpo(p[k], 20).replace(/\D/g, "");
      if (g) { if (gtinValido(g)) { r.gtin = { valor: g, fonte: "json-ld" }; break; } r.avisos.push("GTIN da página não passa na conferência do dígito verificador; ignorado."); }
    }
    const ofs = nos(p.offers).filter((o) => o !== p);
    const oferta = ofs.find((o) => !tipoDe(o).includes("aggregateoffer") && (o.price !== undefined || o.priceSpecification)) ?? ofs.find((o) => o.lowPrice !== undefined || o.price !== undefined);
    if (oferta) {
      const ps = oferta.priceSpecification && typeof oferta.priceSpecification === "object" && !Array.isArray(oferta.priceSpecification) ? oferta.priceSpecification as Record<string, unknown> : {};
      const agregada = tipoDe(oferta).includes("aggregateoffer");
      const bruto = oferta.price ?? ps.price ?? (agregada ? oferta.lowPrice : undefined);
      const preco = lerPreco(bruto);
      if (preco !== null) {
        r.preco = { valor: preco, fonte: "json-ld" };
        if (agregada && oferta.price === undefined) r.avisos.push("A página mostra uma faixa de preços (de vários vendedores); usei o menor. Confirme o vendedor e o preço.");
      }
      const moeda = limpo(oferta.priceCurrency ?? ps.priceCurrency, 5).toUpperCase();
      if (moeda) r.moeda = { valor: moeda, fonte: "json-ld" };
      const ven = nomeDe(oferta.seller); if (ven) r.vendedor = { valor: ven.slice(0, 120), fonte: "json-ld" };
      if (oferta.availability !== undefined) r.disponibilidade = { valor: disponibilidadeDe(oferta.availability), fonte: "json-ld" };
      const envio = nos(oferta.shippingDetails)[0];
      if (envio) {
        const taxa = envio.shippingRate && typeof envio.shippingRate === "object" ? lerPreco((envio.shippingRate as Record<string, unknown>).value) : null;
        r.frete.dica = taxa !== null ? "A página fala em frete de R$ " + taxa.toFixed(2).replace(".", ",") + ", mas depende do CEP: calcule para o seu CEP antes de confirmar." : "A página fala em envio, mas o valor depende do CEP: calcule antes de confirmar.";
      }
    }
  }
  /* alternativas mais fracas (Open Graph / meta de produto) só quando o JSON-LD não trouxe o campo */
  if (!r.nome && r.titulo) { r.nome = { valor: r.titulo.valor, fonte: r.titulo.fonte }; }
  if (!r.preco) {
    const pm = lerPreco(meta["product:price:amount"] ?? meta["og:price:amount"] ?? meta["price"]);
    if (pm !== null) { r.preco = { valor: pm, fonte: meta["price"] && !meta["product:price:amount"] && !meta["og:price:amount"] ? "meta" : "og" }; r.moeda ??= (meta["product:price:currency"] ?? meta["og:price:currency"] ?? meta["pricecurrency"]) ? { valor: limpo(meta["product:price:currency"] ?? meta["og:price:currency"] ?? meta["pricecurrency"], 5).toUpperCase(), fonte: "og" } : null; r.avisos.push("Preço lido de uma etiqueta da página (sem os dados estruturados): confira."); }
  }
  if (!r.marca && meta["product:brand"]) r.marca = { valor: meta["product:brand"].slice(0, 80), fonte: "og" };
  if (!r.disponibilidade && meta["product:availability"]) r.disponibilidade = { valor: disponibilidadeDe(meta["product:availability"]), fonte: "og" };

  if (r.preco && (!r.moeda || r.moeda.valor !== "BRL")) {
    r.avisos.push(r.moeda ? "A moeda do preço é " + r.moeda.valor + ", não BRL: preço descartado." : "A página não informa a moeda do preço: confirme que é em reais.");
    if (r.moeda) r.preco = null;
  }
  r.pendentes = ["nome", "marca", "modelo", "gtin", "preco", "vendedor", "disponibilidade"].filter((k) => !(r as unknown as Record<string, unknown>)[k]);
  /* o preço da página não diz se é à vista ou parcelado, nem o frete: sempre confirmação manual */
  r.pendentes.push("modalidade", "frete");
  if (r.preco && !r.moeda) r.pendentes.push("moeda");
  return r;
}
