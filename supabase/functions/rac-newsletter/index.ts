// Newsletter Inteligente: a rotina diária do servidor (docs/newsletter.md). Só o agendamento do banco chama esta função
// (019, com a senha da rotina no cabeçalho x-rac-rotina, conferida por rac_rotina_ok do 008); o site não chama.
// Guarda a edição base do dia de cada dono, se ainda não existir, e manda no máximo um aviso por dia (e o resumo da
// semana no domingo). Não usa IA e não tem segredo novo: as chaves VAPID são as que a função garmin já criou em
// rac_segredos (aqui só lidas; sem elas, nenhum aviso sai). A lógica fica em rotina.ts (testada sem rede).
import { createClient } from "npm:@supabase/supabase-js@2";
import { rodarRotina, type Cfg, type Conteudo, type Dados, type Mensagem } from "./rotina.ts";

const SITE = "https://raynercarvalho.com.br/newsletter.json";
/* chaves do próprio Supabase: o formato novo é um JSON por nome ({"default": "sb_..."}); o antigo, um texto só */
const chaveSb = (nova: string, antiga: string) => {
  try { const j = JSON.parse(Deno.env.get(nova) ?? ""); if (j?.default) return j.default as string; } catch (_) { /* formato antigo */ }
  return Deno.env.get(antiga) ?? "";
};
const chaveServidor = () => chaveSb("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
const responder = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
type Sb = ReturnType<typeof createClient>;

/* ---------- Web Push (VAPID + aes128gcm, RFC 8291/8292), só com WebCrypto: o mesmo envio da função garmin ---------- */
type Vapid = { publica: string; jwk: JsonWebKey };
const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const junta = (...l: Uint8Array[]) => { const o = new Uint8Array(l.reduce((s, x) => s + x.length, 0)); let i = 0; for (const x of l) { o.set(x, i); i += x.length; } return o; };
const txt = (s: string) => new TextEncoder().encode(s);
async function hmac(chave: Uint8Array, dados: Uint8Array) {
  const k = await crypto.subtle.importKey("raw", chave, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, dados));
}
async function cifrar(texto: string, p256dh: string, auth: string) {
  const ua = deB64u(p256dh), seg = deB64u(auth);
  const par = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const as = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));
  const uaK = await crypto.subtle.importKey("raw", ua, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaK }, par.privateKey, 256));
  const ikm = await hmac(await hmac(seg, ecdh), junta(txt("WebPush: info\0"), ua, as, new Uint8Array([1])));
  const sal = crypto.getRandomValues(new Uint8Array(16)), prk = await hmac(sal, ikm);
  const cek = (await hmac(prk, txt("Content-Encoding: aes128gcm\0\x01"))).slice(0, 16);
  const nonce = (await hmac(prk, txt("Content-Encoding: nonce\0\x01"))).slice(0, 12);
  const k = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cif = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, k, junta(txt(texto), new Uint8Array([2]))));
  return junta(sal, new Uint8Array([0, 0, 16, 0, 65]), as, cif);
}
async function vapid(endpoint: string, ch: Vapid) {
  const aud = new URL(endpoint).origin, agora = Math.floor(Date.now() / 1000);
  const corpo = b64u(txt(JSON.stringify({ typ: "JWT", alg: "ES256" }))) + "." + b64u(txt(JSON.stringify({ aud, exp: agora + 12 * 3600, sub: "https://raynercarvalho.com.br" })));
  const k = await crypto.subtle.importKey("jwk", ch.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const ass = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, k, txt(corpo));
  return `vapid t=${corpo}.${b64u(ass)}, k=${ch.publica}`;
}
async function enviarPush(insc: { endpoint: string; p256dh: string; auth: string }, msg: unknown, ch: Vapid) {
  const corpo = await cifrar(JSON.stringify(msg), insc.p256dh, insc.auth);
  const r = await fetch(insc.endpoint, { method: "POST", body: corpo, headers: {
    Authorization: await vapid(insc.endpoint, ch), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "normal" } });
  return r.status;
}
/* manda para os aparelhos inscritos do dono (só quem ativou as notificações no Sistema tem inscrição) */
async function pushPara(adm: Sb, uid: string, msg: Mensagem) {
  const { data: l } = await adm.from("push_inscricoes").select("id,endpoint,p256dh,auth").eq("user_id", uid);
  if (!l?.length) return "nenhum aparelho com notificações ativas";
  const { data: s } = await adm.from("rac_segredos").select("valor").eq("chave", "vapid").maybeSingle();
  if (!s?.valor) return "sem chaves de notificação (a função garmin cria na primeira ativação)";
  const res: number[] = [];
  for (const x of l as { id: number; endpoint: string; p256dh: string; auth: string }[]) {
    const st = await enviarPush(x, msg, s.valor as Vapid).catch(() => 0);
    res.push(st);
    if (st === 404 || st === 410) await adm.from("push_inscricoes").delete().eq("id", x.id);
  }
  return `${res.filter((c) => c >= 200 && c < 300).length} de ${l.length} aparelhos`;
}

function deps(adm: Sb) {
  return {
    agora: () => Date.now(),
    async dados(): Promise<Dados> {
      const r = await fetch(SITE + "?v=" + Date.now(), { headers: { "Cache-Control": "no-cache" } });
      if (!r.ok) throw new Error("newsletter.json respondeu " + r.status);
      return await r.json();
    },
    /* quem tem notificações ativas ou já configurou a Newsletter; quem é da casa (membros) fica de fora */
    async donos(): Promise<string[]> {
      const [a, b, m] = await Promise.all([
        adm.from("push_inscricoes").select("user_id"), adm.from("pessoal").select("user_id").eq("chave", "newsletter"), adm.from("membros").select("membro"),
      ]);
      if (a.error || b.error || m.error) throw new Error("não consegui listar os donos");
      const casa = new Set((m.data ?? []).map((x: { membro: string }) => x.membro));
      return [...new Set([...(a.data ?? []), ...(b.data ?? [])].map((x: { user_id: string }) => x.user_id))].filter((u) => !casa.has(u));
    },
    async config(dono: string): Promise<Cfg | null> {
      const { data } = await adm.from("pessoal").select("valor").eq("user_id", dono).eq("chave", "newsletter").maybeSingle();
      return (data?.valor as Cfg) ?? null;
    },
    async salvarEdicao(dono: string, c: Conteudo): Promise<"nova" | "existia"> {
      const { data, error } = await adm.from("newsletter_edicoes")
        .upsert({ dono, data: c.data, conteudo: c, origem: "regras", chave: c.chave }, { onConflict: "dono,data", ignoreDuplicates: true }).select("id");
      if (error) throw new Error("newsletter_edicoes: " + error.code);
      return data?.length ? "nova" : "existia";
    },
    async registrarAviso(dono: string, chave: string): Promise<boolean> {
      const { data, error } = await adm.from("newsletter_avisos").upsert({ dono, chave }, { onConflict: "dono,chave", ignoreDuplicates: true }).select("chave");
      if (error) throw new Error("newsletter_avisos: " + error.code);
      return !!data?.length;
    },
    async anotarAviso(dono: string, chave: string, resultado: string) {
      await adm.from("newsletter_avisos").update({ resultado: resultado.slice(0, 200) }).eq("dono", dono).eq("chave", chave);
    },
    async edicoesDaSemana(dono: string, de: string, ate: string) {
      const { data } = await adm.from("newsletter_edicoes").select("data,conteudo").eq("dono", dono).gte("data", de).lte("data", ate).order("data");
      return (data ?? []) as { data: string; conteudo: Partial<Conteudo> | null }[];
    },
    push: (dono: string, m: Mensagem) => pushPara(adm, dono, m),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return responder({ ok: false, erro: "use POST" }, 405);
  try {
    const adm = createClient(Deno.env.get("SUPABASE_URL")!, chaveServidor(), { auth: { persistSession: false } });
    const { data: autorizado } = await adm.rpc("rac_rotina_ok", { segredo: req.headers.get("x-rac-rotina") ?? "" });
    if (!autorizado) return responder({ ok: false, erro: "não autorizado" }, 401);
    const r = await rodarRotina(deps(adm));
    console.log("rac-newsletter", JSON.stringify(r));
    return responder(r);
  } catch (e) {
    console.error("rac-newsletter", (e as Error)?.message ?? "erro");
    return responder({ ok: false, erro: "interno" }, 500);
  }
});
