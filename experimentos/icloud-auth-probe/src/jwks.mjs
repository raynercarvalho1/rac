// Chaves públicas (JWKS) do emissor oficial do GitHub Actions.
// Fixo e confiável no código: o documento de descoberta vem do emissor da política; o jwks_uri dele só é aceito se for HTTPS e do
// MESMO host do emissor. Nunca se busca chave em URL indicada pelo JWT (jku, x5u e jwk são recusados antes).
// Cache só em memória do isolate (a Cache API não é confiável em workers.dev). Falha fechada, com uma tolerância documentada:
// durante uma indisponibilidade do endpoint reaproveita-se o conjunto antigo por até jwksReaproveitarVelhoS (hoje 0: nunca).
import { decodificarBase64Url } from "./jwt.mjs";

// erro com um código de lista fechada (DETALHES_JWKS): é só o que sai do módulo, nunca a mensagem original
export class ErroJwks extends Error {
  constructor(codigo) {
    super(codigo);
    this.codigo = codigo;
  }
}

// lê o corpo em pedaços e para ao passar do limite (em BYTES), sem carregar tudo antes de conferir
async function lerLimitado(resposta, maxBytes) {
  const declarado = Number(resposta.headers.get("content-length"));
  if (Number.isFinite(declarado) && declarado > maxBytes) throw new ErroJwks("grande_demais");
  if (!resposta.body) return "";
  const leitor = resposta.body.getReader();
  const partes = [];
  let total = 0;
  while (true) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { try { await leitor.cancel(); } catch (_) { /* já encerrado */ } throw new ErroJwks("grande_demais"); }
    partes.push(value);
  }
  const todo = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) { todo.set(p, pos); pos += p.byteLength; }
  return new TextDecoder("utf-8").decode(todo);
}

// "redirect: error" NÃO existe no runtime do Cloudflare Workers (só "follow" e "manual"; "error" lança TypeError antes de qualquer rede).
// Por isso usa-se "manual" e QUALQUER 3xx é recusado aqui: nenhum redirecionamento é seguido.
async function buscarJson(fetchFn, url, politica, prefixo) {
  const controle = new AbortController();
  const cronometro = setTimeout(() => controle.abort(), politica.jwksTimeoutMs);
  try {
    let resposta;
    try {
      resposta = await fetchFn(url, { signal: controle.signal, headers: { Accept: "application/json" }, redirect: "manual" });
    } catch (_) {
      throw new ErroJwks(prefixo + (controle.signal.aborted ? "_timeout" : "_fetch_erro"));
    }
    if (resposta.type === "opaqueredirect" || (resposta.status >= 300 && resposta.status < 400)) throw new ErroJwks(prefixo + "_redirect");
    if (!resposta.ok) throw new ErroJwks(prefixo + "_http_erro");
    let texto;
    try {
      texto = await lerLimitado(resposta, politica.jwksMaxBytes);
    } catch (erro) {
      if (erro instanceof ErroJwks) throw new ErroJwks(prefixo + "_" + erro.codigo);
      throw new ErroJwks(prefixo + (controle.signal.aborted ? "_timeout" : "_fetch_erro"));
    }
    try {
      return JSON.parse(texto);
    } catch (_) {
      throw new ErroJwks(prefixo + "_json_invalido");
    }
  } finally {
    clearTimeout(cronometro);
  }
}

async function importarChave(jwk, politica) {
  if (!jwk || jwk.kty !== "RSA" || typeof jwk.kid !== "string" || typeof jwk.n !== "string" || typeof jwk.e !== "string") return null;
  if (jwk.use !== undefined && jwk.use !== "sig") return null;
  if (jwk.alg !== undefined && jwk.alg !== politica.algoritmo) return null;
  try {
    if (decodificarBase64Url(jwk.n).length < politica.rsaMinimoBytes) return null;
    const chave = await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return { kid: jwk.kid, chave };
  } catch (_) {
    return null;
  }
}

export function criarProvedorChaves({ fetchFn, agora, politica }) {
  let chaves = new Map();
  let carregadoEm = 0;
  let ultimaRecarga = -Infinity;
  let emAndamento = null;

  async function recarregar() {
    const descoberta = await buscarJson(fetchFn, politica.descobertaUrl, politica, "discovery");
    if (descoberta === null || typeof descoberta !== "object" || Array.isArray(descoberta)) throw new ErroJwks("discovery_json_invalido");
    if (descoberta.issuer !== politica.issuer) throw new ErroJwks("discovery_emissor_invalido");
    if (typeof descoberta.jwks_uri !== "string") throw new ErroJwks("discovery_jwks_uri_invalido");
    let alvo;
    try { alvo = new URL(descoberta.jwks_uri); } catch (_) { throw new ErroJwks("discovery_jwks_uri_invalido"); }
    const emissor = new URL(politica.issuer);
    if (alvo.protocol !== "https:" || alvo.host !== emissor.host || alvo.username || alvo.password) throw new ErroJwks("discovery_jwks_uri_invalido");
    const doc = await buscarJson(fetchFn, alvo.href, politica, "jwks");
    if (doc === null || typeof doc !== "object" || !Array.isArray(doc.keys)) throw new ErroJwks("jwks_json_invalido");
    const novas = new Map();
    for (const jwk of doc.keys) {
      const par = await importarChave(jwk, politica);
      if (par) novas.set(par.kid, par.chave);
    }
    if (novas.size === 0) throw new ErroJwks("jwks_sem_chave_valida");
    chaves = novas; // troca o conjunto inteiro: chave removida pelo emissor deixa de valer assim que houver recarga bem-sucedida
    carregadoEm = agora();
  }

  function recarregarUmaVez() {
    if (!emAndamento) {
      ultimaRecarga = agora();
      emAndamento = recarregar().finally(() => { emAndamento = null; });
    }
    return emAndamento;
  }

  return async function obterChave(kid) {
    const t = agora();
    const fresco = chaves.size > 0 && t - carregadoEm <= politica.jwksTtlS;
    if (fresco && chaves.has(kid)) return chaves.get(kid);

    if (fresco) {
      // kid novo com o cache em dia: pode ser rotação. Uma recarga forçada, no máximo a cada jwksRecargaMinimaS.
      if (t - ultimaRecarga < politica.jwksRecargaMinimaS) return null;
      try { await recarregarUmaVez(); } catch (_) { /* mantém o conjunto atual */ }
      return chaves.get(kid) || null;
    }

    try {
      await recarregarUmaVez();
    } catch (erro) {
      const idade = t - carregadoEm;
      if (chaves.size > 0 && idade <= politica.jwksReaproveitarVelhoS) return chaves.get(kid) || null;
      throw erro;
    }
    return chaves.get(kid) || null;
  };
}
