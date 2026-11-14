// Rotas do Worker da POC autenticada iCloud (arquitetura S3). Lógica testável em Node: o ponto de entrada (index.mjs) só liga as peças.
// Ordem obrigatória: (1) método e rota, (2) JWT validado, (3) operação com uso único: CONSUMO da chave (Durable Object) ANTES de ler o corpo,
// (4) só então o corpo (que pode conter a credencial da P1) é lido, com esquema fechado, (5) a operação.
// Falha ou indisponibilidade do registro de uso único = HTTP 503 e a operação NÃO acontece; chave já consumida = HTTP 409.
// Sem console, sem armazenamento próprio e sem eco de nada que o cliente enviou.
import { POLITICA, DETALHES_CONSUMO, operacaoDaAudiencia } from "./politica.mjs";
import { chaveDeConsumo } from "./consumo.mjs";
import { montarRespostaP1 } from "./imap.mjs";

function json(status, corpo) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function recusa(status, erro, motivo, detalhe) {
  return json(status, detalhe ? { ok: false, erro, motivo, detalhe } : { ok: false, erro, motivo });
}

// consome a chave de uso único; qualquer coisa diferente de "true" ou "false" explícitos é falha (e a operação não acontece)
async function consumirUmaVez(consumir, claims, operacao) {
  if (typeof consumir !== "function") return { falha: "consumo_nao_configurado" };
  try {
    const consumido = await consumir({ chave: chaveDeConsumo(claims, operacao), jti: String(claims.jti) });
    if (consumido === true) return { consumido: true };
    if (consumido === false) return { consumido: false };
    return { falha: "consumo_resposta_invalida" };
  } catch (erro) {
    return { falha: erro && DETALHES_CONSUMO.includes(erro.codigo) ? erro.codigo : "consumo_falha" };
  }
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
const FORMATO_USUARIO = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,185}\.[A-Za-z]{2,24}$/;
const FORMATO_SENHA_APP = /^[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}$/; // senha específica de app da Apple: xxxx-xxxx-xxxx-xxxx
export function lerCorpo(bytes, politica = POLITICA) {
  let dados;
  try { dados = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch (_) { return null; }
  if (dados === null || typeof dados !== "object" || Array.isArray(dados)) return null;
  if (typeof dados.operacao !== "string" || !politica.operacoes.includes(dados.operacao)) return null;
  const chaves = Object.keys(dados).sort().join(",");
  if ((politica.operacoesComCredencial || []).includes(dados.operacao)) {
    // operação com credencial: EXATAMENTE operacao, usuario e senha, com formato estrito (a senha é a senha específica de app)
    if (chaves !== "operacao,senha,usuario") return null;
    if (typeof dados.usuario !== "string" || dados.usuario.length > 254 || !FORMATO_USUARIO.test(dados.usuario)) return null;
    if (typeof dados.senha !== "string" || !FORMATO_SENHA_APP.test(dados.senha)) return null;
    return { operacao: dados.operacao, usuario: dados.usuario, senha: dados.senha };
  }
  if (chaves !== "operacao") return null;
  return { operacao: dados.operacao };
}

export async function tratar(request, { verificar, politica = POLITICA, consumir, executarP1 }) {
  try {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/auth-probe") return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

    const cabecalho = request.headers.get("Authorization");
    if (typeof cabecalho !== "string" || cabecalho.slice(0, 7) !== "Bearer ") return recusa(401, "nao_autorizado", "token_ausente");
    const validacao = await verificar(cabecalho.slice(7));
    if (!validacao.ok) return recusa(401, "nao_autorizado", validacao.motivo, validacao.detalhe);

    // uso único: a execução (run_id + run_attempt) só pode pedir esta operação UMA vez, mesmo com tokens diferentes ou token repetido.
    // O consumo vem ANTES de o corpo ser lido (o corpo da P1 carrega a credencial).
    const operacaoDoToken = operacaoDaAudiencia(validacao.claims.aud, politica);
    if ((politica.operacoesComConsumo || []).includes(operacaoDoToken)) {
      const consumo = await consumirUmaVez(consumir, validacao.claims, operacaoDoToken);
      if (consumo.falha) return recusa(503, "consumo_indisponivel", consumo.falha);
      if (!consumo.consumido) return recusa(409, "ja_consumido", "uso_unico");
    }

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
    if (corpo.operacao === "validar_uso_unico") {
      // prova sintética do registro de uso único: nenhuma credencial, nenhuma conexão externa
      return json(200, { ok: true, operacao: "validar_uso_unico", uso_unico: "consumido", operacao_reconhecida: true });
    }
    if (corpo.operacao === "p1_imap") {
      if (typeof executarP1 !== "function") return recusa(500, "falha_interna", "falha_interna");
      const saida = montarRespostaP1(await executarP1({ usuario: corpo.usuario, senha: corpo.senha }));
      return json(saida.ok ? 200 : 502, saida);
    }
    return recusa(400, "operacao_invalida", "operacao_nao_implementada");
  } catch (_) {
    return recusa(500, "falha_interna", "falha_interna");
  }
}
