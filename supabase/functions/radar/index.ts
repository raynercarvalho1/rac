// Radar de Preços: a única porta do RAC para páginas de lojas e o aviso de oportunidades (docs/radar.md, docs/radar-fontes.md). Este é o único arquivo da pasta que usa Deno e o Supabase;
// o resto é lógica pura e testada (tests/radar_servidor.test.mjs e radar_lote3.test.mjs). NÃO FOI PUBLICADA: precisa da autorização do dono (README: "Edge Function: o dono republica").
// Duas entradas:
//   1) o site (login do dono): { tipo: "ler_url", url }  → lê a página (só domínios das lojas do dono), extrai os dados e devolve para o dono conferir. Não grava nada.
//   2) a rotina do servidor (senha x-rac-rotina conferida no banco por rac_rotina_ok): { tipo: "rodada" } → para cada dono: coleta as ofertas liberadas e manda o aviso de oportunidades
//      (Web Push só para os aparelhos do dono, por push.ts, sem depender da função garmin). Só vale depois de um agendamento próprio (supabase/propostas/045_radar_rotina.sql, não aplicada).
// Sem IA, sem custo, sem segredo novo. Membro da casa (Fernanda) é recusado.
import { createClient } from "npm:@supabase/supabase-js@2";
import { chavePublica, chaveServidor } from "../rac-ia/chaves.ts";
import { configPadrao, type Banco as BancoAvisos } from "./avisos.ts";
import type { BancoColeta } from "./coletores.ts";
import { extrairPagina } from "./extrair.ts";
import { type BancoPush } from "./push.ts";
import { rodadaDoDono } from "./rotina.ts";
import { lerPagina, type Deps } from "./ssrf.ts";

const ORIGENS = ["https://raynercarvalho.com.br", "https://www.raynercarvalho.com.br", "https://raynercarvalho1.github.io"];
const origemPermitida = (o: string | null) => (o && (ORIGENS.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) ? o : ORIGENS[0]);
const cabecalhos = (req: Request) => ({
  "Access-Control-Allow-Origin": origemPermitida(req.headers.get("Origin")), "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-rac-rotina",
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin", "Content-Type": "application/json",
});
const ambiente = (n: string) => Deno.env.get(n);

const deps: Deps = {
  async resolver(host) {
    const [a, b] = await Promise.all([Deno.resolveDns(host, "A").catch(() => [] as string[]), Deno.resolveDns(host, "AAAA").catch(() => [] as string[])]);
    return [...a, ...b];
  },
  fetch: (url, init) => fetch(url, init),
};

type Adm = ReturnType<typeof createClient>;
const ler = async <T>(p: PromiseLike<{ data: T | null; error: { code?: string } | null }>, nome: string): Promise<T> => { const { data, error } = await p; if (error) throw new Error(nome + ": " + error.code); return (data ?? []) as T; };

function bancoColetaSupabase(adm: Adm): BancoColeta {
  return {
    lojas: (uid) => ler(adm.from("radar_lojas").select("id,nome,dominio,coleta_permitida,ativa").eq("dono", uid), "radar_lojas"),
    ofertas: (uid) => ler(adm.from("radar_ofertas").select("id,item_id,loja_id,url,situacao,equivalencia").eq("dono", uid), "radar_ofertas"),
    ultimas: (uid) => ler(adm.from("radar_precos").select("oferta_id,modalidade,meio,parcelas,preco_produto,disponibilidade,observado_em,fonte").eq("dono", uid).order("observado_em", { ascending: false }).limit(5000), "radar_precos"),
    coletasRecentes: (uid, desde) => ler(adm.from("radar_coletas").select("loja_id,status,iniciada_em").eq("dono", uid).gte("iniciada_em", desde), "radar_coletas"),
    async abrirColeta(uid, lojaId, origem, iniciadaEm) {
      const { data, error } = await adm.from("radar_coletas").insert({ dono: uid, loja_id: lojaId, origem, status: "em_andamento", iniciada_em: iniciadaEm }).select("id").single();
      if (error || !data) throw new Error("radar_coletas: " + error?.code);
      return data.id as string;
    },
    async fecharColeta(id, r) {
      const { error } = await adm.from("radar_coletas").update(r).eq("id", id);
      if (error) throw new Error("radar_coletas: " + error.code);
    },
    async gravarPreco(uid, o) {
      const { error } = await adm.from("radar_precos").insert({ ...o, dono: uid });
      if (!error) return "gravado";
      if (error.code === "23505") return "duplicado"; // índice único: a mesma observação nunca entra duas vezes
      throw new Error("radar_precos: " + error.code);
    },
  };
}

/* aviso: configuração e controle de duplicidade ficam em "pessoal" (sem migration); a reserva usa conferência de versão (coluna atualizado) */
function bancoAvisosSupabase(adm: Adm): BancoAvisos {
  const pessoal = async (uid: string, chave: string) => { const { data, error } = await adm.from("pessoal").select("valor,atualizado").eq("user_id", uid).eq("chave", chave).maybeSingle(); if (error) throw new Error("pessoal: " + error.code); return data; };
  return {
    async config(uid) { return configPadrao((await pessoal(uid, "radar-config"))?.valor); },
    async precos(uid) {
      const out: unknown[] = [];
      for (let de = 0; de < 20000; de += 1000) { const l = await ler<unknown[]>(adm.from("radar_precos").select("*").eq("dono", uid).order("observado_em").order("id").range(de, de + 999), "radar_precos"); out.push(...l); if (l.length < 1000) break; }
      return out as never;
    },
    ofertas: (uid) => ler(adm.from("radar_ofertas").select("id,item_id,situacao,equivalencia,vendedor").eq("dono", uid), "radar_ofertas"),
    itens: (uid) => ler(adm.from("radar_itens").select("id,nome").eq("dono", uid).eq("ativo", true), "radar_itens"),
    async pagos(uid) { const v = (await pessoal(uid, "radar-pagos"))?.valor; return v && typeof v === "object" ? v : {}; },
    async avisados(uid) {
      const r = await pessoal(uid, "radar-avisos"), v = r?.valor ?? {};
      return { chaves: Array.isArray(v.chaves) ? v.chaves.filter((x: unknown) => typeof x === "string") : [], ultimoDia: typeof v.ultimoDia === "string" ? v.ultimoDia : null, versao: r?.atualizado ?? null };
    },
    async gravarAvisados(uid, v, versaoLida) {
      const agora = new Date().toISOString();
      if (versaoLida === null) { // primeira vez: a chave primária impede duas reservas
        const { error } = await adm.from("pessoal").insert({ user_id: uid, chave: "radar-avisos", valor: v, atualizado: agora });
        if (!error) return true; if (error.code === "23505") return false; throw new Error("pessoal: " + error.code);
      }
      const { data, error } = await adm.from("pessoal").update({ valor: v, atualizado: agora }).eq("user_id", uid).eq("chave", "radar-avisos").eq("atualizado", versaoLida).select("chave");
      if (error) throw new Error("pessoal: " + error.code);
      return (data ?? []).length > 0; // 0 linhas: outra execução mudou antes
    },
  };
}

/* push: só lê as chaves VAPID e as inscrições do dono (push.ts); nunca cria chave */
function bancoPushSupabase(adm: Adm): BancoPush {
  return {
    async vapid() { const { data, error } = await adm.from("rac_segredos").select("valor").eq("chave", "vapid").maybeSingle(); if (error) throw new Error("rac_segredos: " + error.code); return (data?.valor as never) ?? null; },
    inscricoes: (uid) => ler(adm.from("push_inscricoes").select("id,endpoint,p256dh,auth").eq("user_id", uid), "push_inscricoes"),
    async apagarInscricao(uid, id) { await adm.from("push_inscricoes").delete().eq("id", id).eq("user_id", uid); },
  };
}

Deno.serve(async (req) => {
  const h = cabecalhos(req);
  const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: h });
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json({ ok: false, erro: "metodo" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const adm = createClient(url, chaveServidor(ambiente), { auth: { persistSession: false } });
    const texto = await req.text();
    if (texto.length > 20_000) return json({ ok: false, erro: "muito_grande" }, 413);
    let corpo: Record<string, unknown>; try { corpo = JSON.parse(texto); } catch (_) { return json({ ok: false, erro: "entrada_invalida" }, 400); }

    const senha = req.headers.get("x-rac-rotina");
    if (senha !== null) {
      const { data: ok } = await adm.rpc("rac_rotina_ok", { segredo: senha });
      if (ok !== true) return json({ ok: false, erro: "nao_autenticado" }, 401);
      if (corpo.tipo !== "rodada") return json({ ok: false, erro: "entrada_invalida" }, 400);
      const [a, m] = await Promise.all([adm.from("radar_lojas").select("dono"), adm.from("membros").select("membro")]);
      if (a.error || m.error) throw new Error("donos");
      const membros = new Set((m.data ?? []).map((x) => x.membro as string));
      const donos = [...new Set((a.data ?? []).map((x) => x.dono as string))].filter((d) => !membros.has(d));
      const contexto = { coleta: bancoColetaSupabase(adm), avisos: bancoAvisosSupabase(adm), push: bancoPushSupabase(adm), deps, agora: () => Date.now() }, resultado: Record<string, unknown> = {};
      for (const d of donos) resultado[d.slice(0, 8)] = await rodadaDoDono(d, contexto);
      return json({ ok: true, resultado });
    }

    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ ok: false, erro: "nao_autenticado" }, 401);
    const publico = createClient(url, chavePublica(ambiente), { auth: { persistSession: false } });
    const { data: u, error: eu } = await publico.auth.getUser(jwt);
    if (eu || !u?.user?.id) return json({ ok: false, erro: "nao_autenticado" }, 401);
    const uid = u.user.id;
    const { data: mem } = await adm.from("membros").select("dono").eq("membro", uid).maybeSingle();
    if (mem) return json({ ok: false, erro: "sem_permissao" }, 403); // a casa não usa o Radar
    if (corpo.tipo !== "ler_url" || typeof corpo.url !== "string") return json({ ok: false, erro: "entrada_invalida" }, 400);
    const { data: lojas, error: el } = await adm.from("radar_lojas").select("dominio").eq("dono", uid).not("dominio", "is", null);
    if (el) throw new Error("radar_lojas");
    const dominios = (lojas ?? []).map((l) => l.dominio as string).filter(Boolean);
    const pag = await lerPagina(corpo.url, dominios, deps);
    if (!pag.ok) return json({ ok: false, erro: pag.codigo, motivo: pag.motivo });
    return json({ ok: true, urlFinal: pag.urlFinal, extraido: extrairPagina(pag.html, pag.urlFinal) });
  } catch (e) {
    console.error("radar interno", (e as Error)?.name ?? "erro");
    return json({ ok: false, erro: "interno" }, 500);
  }
});
