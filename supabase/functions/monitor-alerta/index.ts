// Monitor de integrações (M4): o vigia que avisa quando um processo atrasa ou falha (docs/planejamento/05-integracoes-e-automacoes.md, seção 4.5).
// Só o agendamento do banco chama esta função (068: a cada 30 min, com a senha da rotina no cabeçalho x-rac-rotina, conferida por rac_rotina_ok do 008);
// o site não chama. Independente das outras funções (não toca na garmin): lê a view monitor_processos e os JSON dos robôs, mantém os incidentes na tabela
// sinais (funções monitor_sinais_* da 067) e manda no máximo 3 pushes por dia, só para o dono, em silêncio das 22h às 7h. Sem Telegram, sem IA.
// Nenhum segredo novo: as chaves VAPID são as que a função garmin já criou em rac_segredos (aqui só lidas). A lógica fica em regras.ts e servico.ts (testadas sem rede).
import { createClient } from "npm:@supabase/supabase-js@2";
import { rodar, type Deps } from "./servico.ts";
import { entregar, type BancoPush, type Inscricao, type Vapid } from "./push.ts";
import type { Resposta } from "./regras.ts";

const SITE = "https://raynercarvalho.com.br/";
/* chaves do próprio Supabase: o formato novo é um JSON por nome ({"default": "sb_..."}); o antigo, um texto só */
const chaveSb = (nova: string, antiga: string) => {
  try { const j = JSON.parse(Deno.env.get(nova) ?? ""); if (j?.default) return j.default as string; } catch (_) { /* formato antigo */ }
  return Deno.env.get(antiga) ?? "";
};
const chaveServidor = () => chaveSb("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
const responder = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
type Sb = ReturnType<typeof createClient>;
const iso = (t: number) => new Date(t).toISOString();

function bancoPush(adm: Sb): BancoPush {
  return {
    async vapid() { const { data } = await adm.from("rac_segredos").select("valor").eq("chave", "vapid").maybeSingle(); return (data?.valor as Vapid) ?? null; },
    async inscricoes(uid: string) { const { data } = await adm.from("push_inscricoes").select("id,endpoint,p256dh,auth").eq("user_id", uid); return (data ?? []) as Inscricao[]; },
    async apagarInscricao(uid: string, id: number) { await adm.from("push_inscricoes").delete().eq("id", id).eq("user_id", uid); },
  };
}

function deps(adm: Sb): Deps {
  const rpc = async (nome: string, args: Record<string, unknown>) => { const { data, error } = await adm.rpc(nome, args); if (error) throw new Error(nome); return data; };
  return {
    agora: () => Date.now(),
    /* o dono: quem tem notificações ativas ou a rotina das 6h dele; quem é da casa (membros) fica de fora */
    async donos() {
      const [a, b, m] = await Promise.all([adm.from("push_inscricoes").select("user_id"), adm.from("rotina_log").select("user_id").order("quando", { ascending: false }).limit(50), adm.from("membros").select("membro")]);
      if (a.error || b.error || m.error) throw new Error("não consegui listar os donos");
      const casa = new Set((m.data ?? []).map((x: { membro: string }) => x.membro));
      return [...new Set([...(a.data ?? []), ...(b.data ?? [])].map((x: { user_id: string }) => x.user_id))].filter((u) => !casa.has(u));
    },
    async processosBanco(agora) { return ((await rpc("monitor_processos_em", { p_agora: iso(agora) })) ?? []) as never; },
    async baixar(arquivo): Promise<Resposta> {
      try {
        const r = await fetch(SITE + arquivo + "?v=" + Date.now(), { headers: { "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(8000) });
        if (!r.ok) return { status: r.status, corpo: null };
        return { status: 200, corpo: await r.json() };
      } catch (_) { return null; }
    },
    async sincronizar(dono, itens, agora) { return (await rpc("monitor_sinais_sincronizar", { p_dono: dono, p_itens: itens, p_agora: iso(agora) })) as never; },
    async pendentes(dono, agora) { return (await rpc("monitor_sinais_pendentes", { p_dono: dono, p_agora: iso(agora) })) as never; },
    push: (dono, msg) => entregar(bancoPush(adm), dono, msg),
    async marcar(dono, ids, lote, agora) { return Number(await rpc("monitor_sinais_marcar", { p_dono: dono, p_ids: ids, p_lote: lote, p_agora: iso(agora) })); },
    novoLote: () => crypto.randomUUID(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return responder({ ok: false, erro: "use POST" }, 405);
  try {
    const adm = createClient(Deno.env.get("SUPABASE_URL")!, chaveServidor(), { auth: { persistSession: false } });
    const { data: autorizado } = await adm.rpc("rac_rotina_ok", { segredo: req.headers.get("x-rac-rotina") ?? "" });
    if (!autorizado) return responder({ ok: false, erro: "não autorizado" }, 401);
    const corpo = await req.json().catch(() => ({}));
    const r = await rodar(deps(adm), { ensaio: corpo?.tipo === "ensaio" });
    console.log("monitor-alerta", JSON.stringify({ ensaio: r.ensaio, donos: r.donos, envios: r.por_dono.map((x) => x.envio), incidentes: r.por_dono.map((x) => x.incidentes ?? null) }));
    return responder(r);
  } catch (e) {
    console.error("monitor-alerta", (e as Error)?.message ?? "erro");
    return responder({ ok: false, erro: "interno" }, 500);
  }
});
