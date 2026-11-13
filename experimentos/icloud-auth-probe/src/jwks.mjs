// Chaves públicas (JWKS) do emissor oficial do GitHub Actions.
// Fixo e confiável no código: o documento de descoberta vem do emissor da política; o jwks_uri dele só é aceito se for HTTPS e do
// MESMO host do emissor. Nunca se busca chave em URL indicada pelo JWT (jku, x5u e jwk são recusados antes).
// Cache só em memória do isolate (a Cache API não é confiável em workers.dev). Falha fechada, com uma tolerância documentada:
// durante uma indisponibilidade do endpoint reaproveita-se o conjunto antigo por até jwksReaproveitarVelhoS.
import { decodificarBase64Url } from "./jwt.mjs";

async function lerLimitado(resposta, maxBytes) {
  const texto = await resposta.text();
  if (texto.length > maxBytes) throw new Error("resposta_grande_demais");
  return texto;
}

async function buscarJson(fetchFn, url, politica) {
  const controle = new AbortController();
  const cronometro = setTimeout(() => controle.abort(), politica.jwksTimeoutMs);
  try {
    const resposta = await fetchFn(url, { signal: controle.signal, headers: { Accept: "application/json" }, redirect: "error" });
    if (!resposta.ok) throw new Error("http_" + resposta.status);
    return JSON.parse(await lerLimitado(resposta, politica.jwksMaxBytes));
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
    const descoberta = await buscarJson(fetchFn, politica.descobertaUrl, politica);
    if (!descoberta || descoberta.issuer !== politica.issuer || typeof descoberta.jwks_uri !== "string") throw new Error("descoberta_invalida");
    const alvo = new URL(descoberta.jwks_uri);
    const emissor = new URL(politica.issuer);
    if (alvo.protocol !== "https:" || alvo.host !== emissor.host || alvo.username || alvo.password) throw new Error("jwks_uri_fora_do_emissor");
    const doc = await buscarJson(fetchFn, alvo.href, politica);
    if (!doc || !Array.isArray(doc.keys)) throw new Error("jwks_invalido");
    const novas = new Map();
    for (const jwk of doc.keys) {
      const par = await importarChave(jwk, politica);
      if (par) novas.set(par.kid, par.chave);
    }
    if (novas.size === 0) throw new Error("jwks_sem_chave_valida");
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
