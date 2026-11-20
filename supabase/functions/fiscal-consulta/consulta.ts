// Central Fiscal · consulta oficial diária (docs/fiscal.md, "Validação fiscal automática"). Este arquivo é PURO (sem Deno, sem Supabase): monta o pedido e interpreta a resposta do web service
// "NFeConsultaProtocolo4" da SEFAZ. Só a entrada (index.ts) usa rede. LIMITE REAL: o web service exige certificado digital (A1) e tem um endereço por UF; sem certificado e endereço configurados
// nos Secrets da função, a consulta devolve "indisponivel" e NADA é alterado. Nunca se raspa o portal público (tem proteção contra robô). Nunca se inventa protocolo nem evidência.
export type Config = { certificado: boolean; urls: Record<string, string>; ambiente: "1" | "2"; esperaMs: number };
export type Nota = { nota_id: string; chave: string; uf_codigo: string; modelo: string };
export type Resultado = { resultado: "autorizada" | "cancelada" | "denegada" | "pendente" | "nao_encontrada" | "indisponivel" | "erro"; origem: "sefaz_ws" | "indisponivel"; chave: string; cstat?: number; protocolo?: string; motivo?: string; evidencia?: string };
export type Busca = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export const CHAVE_OK = /^\d{44}$/;
const limpar = (t: string, n = 120) => t.replace(/[<>&"\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const tag = (xml: string, nome: string): string | null => { const m = new RegExp("<(?:\\w+:)?" + nome + "(?:\\s[^>]*)?>([^<]*)</(?:\\w+:)?" + nome + ">").exec(xml); return m ? m[1].trim() : null; };

export function envelopeConsulta(chave: string, ambiente: "1" | "2" = "1"): string {
  if (!CHAVE_OK.test(chave)) throw new Error("chave inválida");
  return '<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body>'
    + '<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4"><consSitNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">'
    + "<tpAmb>" + ambiente + "</tpAmb><xServ>CONSULTAR</xServ><chNFe>" + chave + "</chNFe></consSitNFe></nfeDadosMsg></soap12:Body></soap12:Envelope>";
}

/* cStat da consulta: 100/150 autorizada · 101/151/155 cancelada · 110/301/302/303 denegada · 217 não consta · 104/105 em processamento · o resto é "erro" (não conclui nada) */
export function interpretarRetorno(xml: string, chave: string): Resultado {
  const base = { origem: "sefaz_ws" as const, chave };
  if (typeof xml !== "string" || !xml.includes("retConsSitNFe")) return { ...base, resultado: "erro", motivo: "resposta inesperada do serviço" };
  const cstat = tag(xml, "cStat"); if (cstat === null || !/^\d{1,3}$/.test(cstat)) return { ...base, resultado: "erro", motivo: "resposta sem cStat" };
  const c = +cstat, xm = limpar(tag(xml, "xMotivo") || ""), evid = "SEFAZ consulta protocolo · cStat " + c + (xm ? " · " + xm : "");
  const ch = tag(xml, "chNFe");
  if ([100, 150].includes(c)) {
    const prot = tag(xml, "nProt");
    if (ch !== chave) return { ...base, resultado: "erro", cstat: c, motivo: "a resposta é de outra chave" };
    if (!prot || !/^\d{15}$/.test(prot)) return { ...base, resultado: "erro", cstat: c, motivo: "autorização sem protocolo válido" };
    return { ...base, resultado: "autorizada", cstat: c, protocolo: prot, evidencia: evid };
  }
  if ([101, 151, 155].includes(c)) return { ...base, resultado: "cancelada", cstat: c, evidencia: evid };
  if ([110, 301, 302, 303].includes(c)) return { ...base, resultado: "denegada", cstat: c, evidencia: evid };
  if (c === 217) return { ...base, resultado: "nao_encontrada", cstat: c, motivo: "nota não consta na base consultada" };
  if ([104, 105].includes(c)) return { ...base, resultado: "pendente", cstat: c, motivo: "em processamento" };
  return { ...base, resultado: "erro", cstat: c, motivo: "cStat " + c + (xm ? ": " + xm : "") };
}

export function indisponivel(chave: string, motivo: string): Resultado { return { resultado: "indisponivel", origem: "indisponivel", chave, motivo: limpar(motivo, 200) }; }

export async function consultarNota(n: Nota, cfg: Config, busca: Busca): Promise<Resultado> {
  if (!CHAVE_OK.test(n.chave || "")) return indisponivel(String(n.chave || ""), "chave inválida");
  const url = cfg.urls[n.uf_codigo];
  if (!cfg.certificado) return indisponivel(n.chave, "sem certificado digital configurado nos Secrets");
  if (!url || !/^https:\/\/[a-z0-9.-]+\.(gov\.br|[a-z]{2}\.gov\.br)(\/|$)/i.test(url)) return indisponivel(n.chave, "sem endereço oficial configurado para a UF " + n.uf_codigo);
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20000);
    try {
      const r = await busca(url, { method: "POST", headers: { "Content-Type": "application/soap+xml; charset=utf-8" }, body: envelopeConsulta(n.chave, cfg.ambiente), signal: ctl.signal });
      if (!r.ok) return { resultado: "erro", origem: "sefaz_ws", chave: n.chave, motivo: "serviço respondeu HTTP " + r.status };
      return interpretarRetorno(await r.text(), n.chave);
    } finally { clearTimeout(t); }
  } catch (e) { return indisponivel(n.chave, "falha ao chamar o serviço oficial"); }
}

/* um lote: respeita o intervalo entre chamadas e para no limite; erro numa nota não impede as outras */
export async function consultarLote(notas: Nota[], cfg: Config, busca: Busca, registrar: (id: string, r: Resultado) => Promise<void>, dorme: (ms: number) => Promise<void>, limite = 30) {
  const out = { consultadas: 0, mudancas: 0, indisponiveis: 0, erros: 0 };
  for (const n of notas.slice(0, limite)) {
    let r: Resultado; try { r = await consultarNota(n, cfg, busca); } catch (_) { r = indisponivel(n.chave, "erro inesperado"); }
    try { await registrar(n.nota_id, r); out.consultadas++; if (r.resultado === "indisponivel") out.indisponiveis++; if (r.resultado === "erro") out.erros++; } catch (_) { out.erros++; }
    if (cfg.esperaMs > 0) await dorme(cfg.esperaMs);
  }
  return out;
}
