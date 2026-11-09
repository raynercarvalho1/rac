// Radar de Preços: envio de Web Push INDEPENDENTE da função garmin (docs/radar.md). É uma cópia adaptada do mecanismo que a garmin já usa (VAPID + aes128gcm, RFC 8291/8292, só WebCrypto),
// para o aviso de oportunidades não depender de nenhuma alteração na Garmin. Diferenças de propósito:
//   - só LÊ as chaves VAPID (tabela privada rac_segredos, criada pelas notificações do Sistema); nunca cria nem troca chave;
//   - só fala com as inscrições do uid que recebeu (o dono); apaga apenas as inscrições desse uid que o serviço de push diz que morreram (404/410);
//   - o corpo cifrado e os cabeçalhos são os mesmos, então o aparelho recebe do mesmo jeito.
// Lógica pura e testada (tests/radar_lote3.test.mjs, com decifragem do lado do aparelho); o fetch é injetado.

export type Vapid = { publica: string; jwk: JsonWebKey };
export type Inscricao = { id?: number; endpoint: string; p256dh: string; auth: string };
export type Msg = { titulo: string; corpo: string; url?: string; tag?: string };

const b64u = (b: ArrayBuffer | Uint8Array) => { const u = new Uint8Array(b); let s = ""; for (const x of u) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
export const deB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const junta = (...l: Uint8Array[]) => { const o = new Uint8Array(l.reduce((s, x) => s + x.length, 0)); let i = 0; for (const x of l) { o.set(x, i); i += x.length; } return o; };
const txt = (s: string) => new TextEncoder().encode(s);
async function hmac(chave: Uint8Array, dados: Uint8Array) {
  const k = await crypto.subtle.importKey("raw", chave, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, dados));
}

/* corpo cifrado para uma inscrição {p256dh, auth} */
export async function cifrar(texto: string, p256dh: string, auth: string): Promise<Uint8Array> {
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

/* cabeçalho Authorization (VAPID, ES256) para o serviço de push do endpoint */
export async function cabecalhoVapid(endpoint: string, ch: Vapid, agora = Math.floor(Date.now() / 1000)): Promise<string> {
  const aud = new URL(endpoint).origin;
  const corpo = b64u(txt(JSON.stringify({ typ: "JWT", alg: "ES256" }))) + "." + b64u(txt(JSON.stringify({ aud, exp: agora + 12 * 3600, sub: "https://raynercarvalho.com.br" })));
  const k = await crypto.subtle.importKey("jwk", ch.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const ass = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, k, txt(corpo));
  return `vapid t=${corpo}.${b64u(ass)}, k=${ch.publica}`;
}

/* só https e só o serviço de push do próprio aparelho (o endpoint vem da inscrição que o dono criou) */
export const endpointValido = (e: string) => {
  try {
    const u = new URL(e), h = u.hostname.toLowerCase();
    return u.protocol === "https:" && !u.username && !u.password && /^[a-z0-9.-]+$/.test(h) && h.includes(".") && !/^\d+(\.\d+)*$/.test(h) && !/(^|\.)(localhost|local|internal|lan|home|corp)$/.test(h);
  } catch (_) { return false; }
};

export async function enviarPush(insc: Inscricao, msg: Msg, ch: Vapid, fetchFn: typeof fetch = fetch): Promise<number> {
  if (!endpointValido(insc.endpoint)) return 0;
  const corpo = await cifrar(JSON.stringify(msg), insc.p256dh, insc.auth);
  const r = await fetchFn(insc.endpoint, { method: "POST", body: corpo, headers: {
    Authorization: await cabecalhoVapid(insc.endpoint, ch), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "normal" } });
  return r.status;
}

/* Banco mínimo (service role): as chaves e as inscrições do uid */
export type BancoPush = {
  vapid(): Promise<Vapid | null>;
  inscricoes(uid: string): Promise<Inscricao[]>;
  apagarInscricao(uid: string, id: number): Promise<void>;
};
/* manda para os aparelhos do uid; devolve o mesmo texto do pushPara da garmin ("2 de 3 aparelhos" / "nenhum aparelho…"), que avisosRadar já sabe ler */
export async function pushPara(banco: BancoPush, uid: string, msg: Msg, fetchFn: typeof fetch = fetch): Promise<string> {
  if (!uid) throw new Error("sem destinatário");
  const l = await banco.inscricoes(uid);
  if (!l.length) return "nenhum aparelho com notificações ativas";
  const ch = await banco.vapid();
  if (!ch) throw new Error("as chaves de notificação ainda não existem: ative as notificações em Sistema primeiro");
  const res: number[] = [];
  for (const x of l) {
    const st = await enviarPush(x, msg, ch, fetchFn).catch(() => 0);
    res.push(st);
    if ((st === 404 || st === 410) && x.id != null) await banco.apagarInscricao(uid, x.id);
  }
  return `${res.filter((c) => c >= 200 && c < 300).length} de ${l.length} aparelhos`;
}
