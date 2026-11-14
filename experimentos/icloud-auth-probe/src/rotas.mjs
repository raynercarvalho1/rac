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

// Esquema FECHADO do corpo, por operação (a operação é escolhida pela audiência do token e conferida contra o corpo):
//   validar_oidc e validar_uso_unico: EXATAMENTE { operacao }.
//   p1_imap: EXATAMENTE { operacao, usuario, senha } (nomes fixos do contrato com o workflow); usuario = endereço de e-mail; senha = senha
//   específica de app da Apple (xxxx-xxxx-xxxx-xxxx, só letras minúsculas). Qualquer outro campo, tipo ou formato é recusado.
// Falha de esquema: HTTP 400 com um `detalhe` de lista fechada que diz QUAL regra falhou (nunca o valor recebido).
const FORMATO_USUARIO = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,185}\.[A-Za-z]{2,24}$/;
const FORMATO_SENHA_APP = /^[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}$/;

export const DETALHES_CORPO = Object.freeze([
  "corpo_nao_json", "corpo_nao_objeto", "operacao_invalida", "campos_inesperados", "campo_ausente_usuario", "campo_ausente_senha",
  "usuario_tipo_invalido", "usuario_formato_invalido", "senha_tipo_invalida", "senha_formato_invalida",
]);

// Examina o corpo: { corpo } se válido, ou { detalhe } com o código da regra que falhou. Só devolve constantes (nunca texto vindo do cliente).
// Os segredos do GitHub costumam carregar espaço ou quebra de linha nas pontas: usuario e senha são aparados nas pontas ANTES da conferência
// (o formato continua estrito; espaço no meio do valor é recusado). O valor aparado é o único usado depois.
export function examinarCorpo(bytes, politica = POLITICA) {
  let dados;
  try { dados = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch (_) { return { detalhe: "corpo_nao_json" }; }
  if (dados === null || typeof dados !== "object" || Array.isArray(dados)) return { detalhe: "corpo_nao_objeto" };
  if (typeof dados.operacao !== "string" || !politica.operacoes.includes(dados.operacao)) return { detalhe: "operacao_invalida" };
  const chaves = Object.keys(dados);
  const comCredencial = (politica.operacoesComCredencial || []).includes(dados.operacao);
  const permitidas = comCredencial ? ["operacao", "usuario", "senha"] : ["operacao"];
  if (chaves.some((k) => !permitidas.includes(k))) return { detalhe: "campos_inesperados" };
  if (!comCredencial) return { corpo: { operacao: dados.operacao } };
  if (!Object.prototype.hasOwnProperty.call(dados, "usuario")) return { detalhe: "campo_ausente_usuario" };
  if (!Object.prototype.hasOwnProperty.call(dados, "senha")) return { detalhe: "campo_ausente_senha" };
  if (typeof dados.usuario !== "string") return { detalhe: "usuario_tipo_invalido" };
  if (typeof dados.senha !== "string") return { detalhe: "senha_tipo_invalida" };
  const usuario = dados.usuario.trim();
  const senha = dados.senha.trim();
  if (usuario.length > 254 || !FORMATO_USUARIO.test(usuario)) return { detalhe: "usuario_formato_invalido" };
  if (!FORMATO_SENHA_APP.test(senha)) return { detalhe: "senha_formato_invalida" };
  return { corpo: { operacao: dados.operacao, usuario, senha } };
}

// compatível com o uso anterior: o corpo válido ou null
export function lerCorpo(bytes, politica = POLITICA) {
  return examinarCorpo(bytes, politica).corpo || null;
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
    const exame = examinarCorpo(bytes, politica);
    if (!exame.corpo) return recusa(400, "corpo_invalido", "esquema_invalido", exame.detalhe);
    const corpo = exame.corpo;

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
