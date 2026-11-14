// Validação do JWT OIDC do GitHub Actions. Falha fechada: qualquer dúvida é recusa.
// Devolve só um MOTIVO de lista fechada (nunca o token, nem valor de claim) para não vazar nada em erro ou resposta.
import { audienciasPermitidas, workflowRefEsperado, operacaoDaAudiencia, DETALHES_JWKS } from "./politica.mjs";

const B64URL = /^[A-Za-z0-9_-]+$/;
const CABECALHOS_PROIBIDOS = ["jku", "x5u", "x5c", "jwk", "crit"];

export function decodificarBase64Url(texto) {
  if (typeof texto !== "string" || !B64URL.test(texto)) throw new Error("base64url_invalido");
  const padrao = texto.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((texto.length + 3) % 4);
  const bin = atob(padrao);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function objetoJson(bytes) {
  const valor = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (valor === null || typeof valor !== "object" || Array.isArray(valor)) throw new Error("nao_objeto");
  return valor;
}

function texto(valor) {
  return typeof valor === "string" && valor.length > 0 ? valor : null;
}

// identificadores da execução: só dígitos (o GitHub os emite como texto numérico; um inteiro seguro também é aceito) e sempre normalizados para texto
const FORMATO_JTI = /^[A-Za-z0-9._:-]{8,128}$/;
export function idNumerico(valor, maxDigitos) {
  const t = typeof valor === "number" ? (Number.isSafeInteger(valor) ? String(valor) : "") : typeof valor === "string" ? valor : "";
  return new RegExp("^[1-9][0-9]{0," + (maxDigitos - 1) + "}$").test(t) ? t : null;
}
const ausente = (v) => v === undefined || v === null || v === "";

// confere o contexto do job (claims já com assinatura válida); devolve o motivo da recusa ou null
export function conferirClaims(claims, politica, agoraS) {
  if (claims.iss !== politica.issuer) return "iss_invalido";
  if (typeof claims.aud !== "string" || !audienciasPermitidas(politica).includes(claims.aud)) return "aud_invalida";

  const sub = texto(claims.sub);
  if (!sub) return "sub_ausente";
  if (!politica.subsPermitidos.includes(sub)) return "sub_invalido";

  if (!texto(claims.repository)) return "repository_ausente";
  if (claims.repository !== politica.repository) return "repository_invalido";
  if (!texto(claims.repository_id)) return "repository_id_ausente";
  if (String(claims.repository_id) !== politica.repositoryId) return "repository_id_invalido";
  if (!texto(claims.repository_owner)) return "repository_owner_ausente";
  if (claims.repository_owner !== politica.repositoryOwner) return "repository_owner_invalido";
  if (!texto(claims.repository_owner_id)) return "repository_owner_id_ausente";
  if (String(claims.repository_owner_id) !== politica.repositoryOwnerId) return "repository_owner_id_invalido";

  if (!texto(claims.environment)) return "environment_ausente";
  if (claims.environment !== politica.environment) return "environment_invalido";

  if (!texto(claims.ref)) return "ref_ausente";
  if (!politica.refsPermitidos.includes(claims.ref)) return "ref_invalido";
  if (!texto(claims.event_name)) return "event_name_ausente";
  if (!politica.eventosPermitidos.includes(claims.event_name)) return "event_name_invalido";

  if (!texto(claims.workflow_ref)) return "workflow_ref_ausente";
  if (claims.workflow_ref !== workflowRefEsperado(claims.ref, politica)) return "workflow_ref_invalido";
  // workflow reutilizável mudaria o job_workflow_ref: aqui os dois têm de coincidir
  if (!texto(claims.job_workflow_ref)) return "job_workflow_ref_ausente";
  if (claims.job_workflow_ref !== claims.workflow_ref) return "job_workflow_ref_invalido";
  if (!texto(claims.runner_environment)) return "runner_environment_ausente";
  if (claims.runner_environment !== politica.runnerEnvironment) return "runner_environment_invalido";

  // identificadores do token e da execução: obrigatórios, porque a chave de uso único é derivada deles
  if (ausente(claims.jti)) return "jti_ausente";
  if (typeof claims.jti !== "string" || !FORMATO_JTI.test(claims.jti)) return "jti_invalido";
  if (ausente(claims.run_id)) return "run_id_ausente";
  if (!idNumerico(claims.run_id, 20)) return "run_id_invalido";
  if (ausente(claims.run_attempt)) return "run_attempt_ausente";
  if (!idNumerico(claims.run_attempt, 4)) return "run_attempt_invalido";

  const tol = politica.toleranciaRelogioS;
  if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp)) return "exp_ausente";
  if (typeof claims.iat !== "number" || !Number.isFinite(claims.iat)) return "iat_ausente";
  if (claims.exp <= agoraS - tol) return "token_expirado";
  if (claims.nbf !== undefined) {
    if (typeof claims.nbf !== "number" || !Number.isFinite(claims.nbf)) return "nbf_invalido";
    if (claims.nbf > agoraS + tol) return "token_ainda_nao_valido";
  }
  if (claims.iat > agoraS + tol) return "iat_no_futuro";
  // operação com credencial: idade máxima curta e SEM somar a tolerância (limite total de idadeMaximaCredencialS)
  const comCredencial = (politica.operacoesComCredencial || []).includes(operacaoDaAudiencia(claims.aud, politica));
  if (comCredencial) {
    if (agoraS - claims.iat > politica.idadeMaximaCredencialS) return "token_antigo_demais";
  } else if (agoraS - claims.iat > politica.idadeMaximaS + tol) return "token_antigo_demais";
  if (claims.exp < claims.iat) return "exp_antes_de_iat";
  return null;
}

// obterChave(kid) -> CryptoKey | null (kid desconhecido); lança se o JWKS estiver indisponível
export async function verificarJwt(token, { obterChave, agora, politica }) {
  try {
    if (typeof token !== "string" || token.length === 0 || token.length > politica.jwtMaxBytes) return { ok: false, motivo: "token_invalido" };
    const partes = token.split(".");
    if (partes.length !== 3) return { ok: false, motivo: "token_invalido" };

    let cabecalho;
    let claims;
    let assinatura;
    try {
      cabecalho = objetoJson(decodificarBase64Url(partes[0]));
      claims = objetoJson(decodificarBase64Url(partes[1]));
      assinatura = decodificarBase64Url(partes[2]);
    } catch (_) {
      return { ok: false, motivo: "token_malformado" };
    }

    for (const nome of CABECALHOS_PROIBIDOS) {
      if (Object.prototype.hasOwnProperty.call(cabecalho, nome)) return { ok: false, motivo: "cabecalho_proibido" };
    }
    if (cabecalho.alg !== politica.algoritmo) return { ok: false, motivo: "algoritmo_nao_permitido" };
    if (cabecalho.typ !== undefined && cabecalho.typ !== "JWT") return { ok: false, motivo: "typ_invalido" };
    const kid = texto(cabecalho.kid);
    if (!kid || kid.length > 128) return { ok: false, motivo: "kid_ausente" };

    let chave;
    try {
      chave = await obterChave(kid);
    } catch (erro) {
      // o detalhe só sai se for um código da lista fechada; qualquer outra coisa vira "jwks_erro_inesperado" (nunca a mensagem do erro)
      const codigo = erro && typeof erro.codigo === "string" && DETALHES_JWKS.includes(erro.codigo) ? erro.codigo : "jwks_erro_inesperado";
      return { ok: false, motivo: "jwks_indisponivel", detalhe: codigo };
    }
    if (!chave) return { ok: false, motivo: "kid_desconhecido" };

    const assinado = new TextEncoder().encode(partes[0] + "." + partes[1]);
    const valida = await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, chave, assinatura, assinado);
    if (!valida) return { ok: false, motivo: "assinatura_invalida" };

    const motivo = conferirClaims(claims, politica, agora());
    if (motivo) return { ok: false, motivo };
    return { ok: true, claims };
  } catch (_) {
    return { ok: false, motivo: "falha_na_validacao" };
  }
}
