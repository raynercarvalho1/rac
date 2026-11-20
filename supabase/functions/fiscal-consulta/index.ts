// Central Fiscal · validação fiscal diária (docs/fiscal.md). NÃO FOI PUBLICADA: precisa da autorização do dono ("Edge Function: o dono republica").
// Entrada única: a rotina do servidor (senha x-rac-rotina conferida no banco por rac_rotina_ok), { tipo: "rodada" }. Pede ao banco as notas que precisam de consulta (nf_validacao_pendentes),
// consulta a fonte oficial só se houver certificado e endereço nos Secrets (SEFAZ_CERT_PEM, SEFAZ_KEY_PEM, SEFAZ_URL_<código da UF, ex. SEFAZ_URL_31>, SEFAZ_AMBIENTE=1|2) e devolve cada resultado
// ao banco (nf_validacao_registrar), que é quem decide se a situação muda (só com evidência oficial). Sem Secrets: registra "indisponivel" e nada muda. Nunca bloqueia a entrada no Mercado.
import { createClient } from "npm:@supabase/supabase-js@2";
import { chaveServidor } from "./chaves.ts";
import { consultarLote, type Busca, type Config, type Nota } from "./consulta.ts";

const ambiente = (n: string) => Deno.env.get(n);
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

function configuracao(): { cfg: Config; busca: Busca } {
  const cert = ambiente("SEFAZ_CERT_PEM") ?? "", key = ambiente("SEFAZ_KEY_PEM") ?? "", urls: Record<string, string> = {};
  for (let i = 11; i <= 53; i++) { const u = ambiente("SEFAZ_URL_" + i); if (u) urls[String(i)] = u; }
  const cfg: Config = { certificado: !!(cert && key), urls, ambiente: ambiente("SEFAZ_AMBIENTE") === "2" ? "2" : "1", esperaMs: 1500 };
  // deno-lint-ignore no-explicit-any
  const cliente = cfg.certificado && typeof (Deno as any).createHttpClient === "function" ? (Deno as any).createHttpClient({ cert, key }) : undefined;
  // deno-lint-ignore no-explicit-any
  const busca: Busca = (url, init) => fetch(url, { ...init, client: cliente } as any);
  return { cfg, busca };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, erro: "metodo" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL"); if (!url || !chaveServidor(ambiente)) throw new Error("ambiente incompleto");
    const adm = createClient(url, chaveServidor(ambiente), { auth: { persistSession: false } });
    const texto = await req.text(); if (texto.length > 2000) return json({ ok: false, erro: "muito_grande" }, 413);
    let corpo: Record<string, unknown>; try { corpo = JSON.parse(texto); } catch (_) { return json({ ok: false, erro: "entrada_invalida" }, 400); }
    const senha = req.headers.get("x-rac-rotina"); if (senha === null) return json({ ok: false, erro: "nao_autenticado" }, 401);
    const { data: ok, error: e0 } = await adm.rpc("rac_rotina_ok", { segredo: senha }); if (e0) throw new Error("rac_rotina_ok: " + (e0.code ?? ""));
    if (ok !== true) return json({ ok: false, erro: "nao_autenticado" }, 401);
    if (corpo.tipo !== "rodada") return json({ ok: false, erro: "entrada_invalida" }, 400);
    const { data: lista, error: e1 } = await adm.rpc("nf_validacao_pendentes", { p_limite: 30 }); if (e1) throw new Error("nf_validacao_pendentes: " + (e1.code ?? ""));
    const { cfg, busca } = configuracao();
    const r = await consultarLote((lista ?? []) as Nota[], cfg, busca, async (id, res) => { const { error } = await adm.rpc("nf_validacao_registrar", { p_nota_id: id, p_resultado: res }); if (error) throw new Error("registrar"); }, (ms) => new Promise((f) => setTimeout(f, ms)));
    return json({ ok: true, acesso_oficial: cfg.certificado && Object.keys(cfg.urls).length > 0, pendentes: (lista ?? []).length, ...r });
  } catch (e) { console.error(JSON.stringify({ funcao: "fiscal-consulta", erro: String((e as Error)?.message ?? e).slice(0, 200) })); return json({ ok: false, erro: "falha_interna" }, 500); }
});
