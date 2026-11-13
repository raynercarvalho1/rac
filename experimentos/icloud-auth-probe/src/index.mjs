// Worker temporário da POC autenticada iCloud (arquitetura S3). Nesta etapa NÃO fala com a Apple:
// só valida o JWT OIDC do GitHub Actions e confere que recebeu uma credencial bem formada, sem usá-la, guardá-la nem devolvê-la.
// Ordem obrigatória: (1) método e rota, (2) JWT validado, (3) só então o corpo com a senha é lido.
// Sem console, sem armazenamento (nenhum secret, variável, KV ou Durable Object) e sem eco de nada que o cliente enviou.
import { POLITICA } from "./politica.mjs";
import { verificarJwt } from "./jwt.mjs";
import { criarProvedorChaves } from "./jwks.mjs";

const SEM_CONTROLE = /^[^\u0000-\u001f\u007f]+$/;

function json(status, corpo) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function recusa(status, erro, motivo) {
  return json(status, { ok: false, erro, motivo });
}

async function lerCorpoLimitado(request, maxBytes) {
  if (!request.body) return null;
  const leitor = request.body.getReader();
  const partes = [];
  let total = 0;
  while (true) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { try { await leitor.cancel(); } catch (_) { /* já encerrado */ } return undefined; }
    partes.push(value);
  }
  const todo = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) { todo.set(p, pos); pos += p.byteLength; }
  return todo;
}

// esquema fechado: exatamente operacao, usuario e senha; sem campos extras e sem caracteres de controle (injeção em IMAP/SMTP)
export function lerCredencial(bytes, politica = POLITICA) {
  let dados;
  try { dados = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch (_) { return null; }
  if (dados === null || typeof dados !== "object" || Array.isArray(dados)) return null;
  const chaves = Object.keys(dados).sort().join(",");
  if (chaves !== "operacao,senha,usuario") return null;
  const { operacao, usuario, senha } = dados;
  if (typeof operacao !== "string" || !politica.operacoes.includes(operacao)) return null;
  if (typeof usuario !== "string" || usuario.length < 3 || usuario.length > 254 || !SEM_CONTROLE.test(usuario)) return null;
  if (typeof senha !== "string" || senha.length < 1 || senha.length > 128 || !SEM_CONTROLE.test(senha)) return null;
  return { operacao, usuario, senha };
}

export async function tratar(request, { verificar, politica = POLITICA }) {
  try {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/auth-probe") return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

    const cabecalho = request.headers.get("Authorization");
    if (typeof cabecalho !== "string" || cabecalho.slice(0, 7) !== "Bearer ") return recusa(401, "nao_autorizado", "token_ausente");
    const validacao = await verificar(cabecalho.slice(7));
    if (!validacao.ok) return recusa(401, "nao_autorizado", validacao.motivo);

    // a partir daqui o token é válido para esta política; só agora o corpo (com a senha) é lido
    const tipo = request.headers.get("Content-Type") || "";
    if (!/^application\/json(\s*;|$)/i.test(tipo)) return recusa(415, "corpo_invalido", "tipo_de_conteudo");
    const bytes = await lerCorpoLimitado(request, politica.corpoMaxBytes);
    if (bytes === undefined) return recusa(413, "corpo_invalido", "corpo_grande_demais");
    if (bytes === null || bytes.length === 0) return recusa(400, "corpo_invalido", "corpo_ausente");
    const credencial = lerCredencial(bytes, politica);
    if (!credencial) return recusa(400, "corpo_invalido", "esquema_invalido");

    // o token foi emitido para UMA operação (audiência) e o corpo tem de pedir exatamente essa
    if (validacao.claims.aud !== politica.audienciaPrefixo + credencial.operacao) return recusa(403, "operacao_nao_autorizada", "operacao_diferente_da_audiencia");

    if (credencial.operacao === "validar_oidc") {
      // dry-run: nenhuma conexão com IMAP/SMTP; a credencial não é usada, guardada, registrada nem devolvida
      return json(200, { ok: true, operacao: "validar_oidc", oidc: "validado", credencial_recebida: true, acao_remota: "nenhuma" });
    }
    return recusa(400, "operacao_invalida", "operacao_nao_implementada");
  } catch (_) {
    return recusa(500, "falha_interna", "falha_interna");
  }
}

// o provedor de chaves vive no escopo do módulo: o cache do JWKS dura enquanto o isolate durar
const agora = () => Math.floor(Date.now() / 1000);
const provedor = criarProvedorChaves({ fetchFn: (u, o) => fetch(u, o), agora, politica: POLITICA });
const verificar = (token) => verificarJwt(token, { obterChave: provedor, agora, politica: POLITICA });

export default {
  fetch(request) {
    return tratar(request, { verificar });
  },
};
