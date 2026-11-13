// Worker temporário da POC autenticada iCloud (arquitetura S3). Nesta etapa NÃO fala com a Apple e NÃO recebe credencial alguma:
// só valida o JWT OIDC do GitHub Actions e reconhece a operação "validar_oidc", cujo corpo é sintético e mínimo ({"operacao":"validar_oidc"}).
// Qualquer campo extra (inclusive usuario e senha) é recusado. Operações futuras com credencial terão esquema próprio, só entram com
// implementação e autorização específicas e nunca guardam a senha (nem como secret, variável ou armazenamento).
// Ordem obrigatória: (1) método e rota, (2) JWT validado, (3) só então o corpo é lido.
// Sem console, sem armazenamento (nenhum secret, variável, KV ou Durable Object) e sem eco de nada que o cliente enviou.
import { POLITICA } from "./politica.mjs";
import { verificarJwt } from "./jwt.mjs";
import { criarProvedorChaves } from "./jwks.mjs";

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

// esquema fechado por operação: hoje só "validar_oidc", com EXATAMENTE o campo "operacao" (nada de usuario, senha ou outro campo)
export function lerCorpo(bytes, politica = POLITICA) {
  let dados;
  try { dados = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch (_) { return null; }
  if (dados === null || typeof dados !== "object" || Array.isArray(dados)) return null;
  if (Object.keys(dados).join(",") !== "operacao") return null;
  if (typeof dados.operacao !== "string" || !politica.operacoes.includes(dados.operacao)) return null;
  return { operacao: dados.operacao };
}

export async function tratar(request, { verificar, politica = POLITICA }) {
  try {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/auth-probe") return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

    const cabecalho = request.headers.get("Authorization");
    if (typeof cabecalho !== "string" || cabecalho.slice(0, 7) !== "Bearer ") return recusa(401, "nao_autorizado", "token_ausente");
    const validacao = await verificar(cabecalho.slice(7));
    if (!validacao.ok) return recusa(401, "nao_autorizado", validacao.motivo);

    // a partir daqui o token é válido para esta política; só agora o corpo é lido
    const tipo = request.headers.get("Content-Type") || "";
    if (!/^application\/json(\s*;|$)/i.test(tipo)) return recusa(415, "corpo_invalido", "tipo_de_conteudo");
    const bytes = await lerCorpoLimitado(request, politica.corpoMaxBytes);
    if (bytes === undefined) return recusa(413, "corpo_invalido", "corpo_grande_demais");
    if (bytes === null || bytes.length === 0) return recusa(400, "corpo_invalido", "corpo_ausente");
    const corpo = lerCorpo(bytes, politica);
    if (!corpo) return recusa(400, "corpo_invalido", "esquema_invalido");

    // o token foi emitido para UMA operação (audiência) e o corpo tem de pedir exatamente essa
    if (validacao.claims.aud !== politica.audienciaPrefixo + corpo.operacao) return recusa(403, "operacao_nao_autorizada", "operacao_diferente_da_audiencia");

    if (corpo.operacao === "validar_oidc") {
      // ensaio: nenhuma conexão com IMAP/SMTP, nenhuma credencial; só confirma o JWT validado e a operação reconhecida
      return json(200, { ok: true, operacao: "validar_oidc", oidc: "validado", operacao_reconhecida: true });
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
