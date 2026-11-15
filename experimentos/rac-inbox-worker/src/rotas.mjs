// RAC Inbox · Worker de produto: a rota única POST /v1/op. A lógica testável fica aqui; index.mjs só liga as peças ao runtime (socket, ambiente, relógio).
// Ordem obrigatória: (1) método/rota → (2) corpo lido com LIMITE de tamanho → (3) ASSINATURA verificada (nada é interpretado antes) → (4) nonce consumido (anti-replay, DO) →
// (5) esquema FECHADO do corpo, conferido contra a operação assinada → (6) operação IMAP somente leitura → (7) resposta de esquema fechado.
// Sem console, sem armazenamento próprio, sem eco de nada que o cliente enviou. Erros = código fechado + HTTP. A credencial só existe em variáveis locais desta chamada.
import { POLITICA } from "./politica.mjs";
import { verificarCanal, ErroCanal, ERROS_CANAL } from "./canal.mjs";
import { comSessao, OPERACOES, ERROS_IMAP } from "./imap.mjs";

const json = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
const falha = (status, erro) => json(status, { ok: false, erro });

// IMAP → HTTP: autenticação recusada é 422 (a função marca a credencial como inválida); indisponibilidade do provedor é 502; pedido inválido é 400
const HTTP_IMAP = { autenticacao_recusada: 422, parametro_invalido: 400, pasta_invalida: 400, pasta_inexistente: 404, mensagem_inexistente: 404, parte_inexistente: 404, uidvalidity_mudou: 409, anexo_grande_demais: 413 };

const RE_USUARIO = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,185}\.[A-Za-z]{2,24}$/, RE_SENHA_APP = /^[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}$/, RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const uid32 = (v) => Number.isSafeInteger(v) && v >= 1 && v <= 4294967295;
// parâmetros permitidos por operação (além de operacao, conta_id, usuario e senha, que TODAS exigem)
const PARAMS = Object.freeze({
  ping: [], testar_conta: [], listar_pastas: [], estado_pasta: ["pasta", "uidvalidity_esperado?"],
  listar_mensagens: ["pasta", "ultimas?", "desde_uid?", "antes_de_uid?", "limite?", "uidvalidity_esperado?"],
  ler_mensagem: ["pasta", "uid", "uidvalidity_esperado?"], baixar_anexo: ["pasta", "uid", "parte", "uidvalidity_esperado?"],
});

// Esquema fechado do corpo. Devolve { corpo } ou { erro } (código fixo; nunca o valor recebido).
export function examinarCorpo(bytes, operacaoAssinada, politica = POLITICA) {
  let d; try { d = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch (_) { return { erro: "corpo_invalido" }; }
  if (d === null || typeof d !== "object" || Array.isArray(d)) return { erro: "corpo_invalido" };
  if (d.operacao !== operacaoAssinada || !politica.operacoes.includes(d.operacao)) return { erro: "operacao_divergente" };
  const regras = PARAMS[d.operacao], semCredencial = d.operacao === "ping";   // o ping não leva conta nem credencial: só { operacao }
  const permitidos = semCredencial ? ["operacao"] : ["operacao", "conta_id", "usuario", "senha", ...regras.map((r) => r.replace("?", ""))];
  if (Object.keys(d).some((k) => !permitidos.includes(k))) return { erro: "campos_inesperados" };
  if (semCredencial) return { corpo: { operacao: "ping" } };
  if (typeof d.conta_id !== "string" || !RE_UUID.test(d.conta_id)) return { erro: "campo_invalido" };
  if (typeof d.usuario !== "string" || d.usuario.length > 254 || !RE_USUARIO.test(d.usuario) || typeof d.senha !== "string" || !RE_SENHA_APP.test(d.senha)) return { erro: "credencial_formato_invalido" };
  for (const r of regras) {
    const nome = r.replace("?", ""), opcional = r.endsWith("?"), v = d[nome];
    if (v === undefined) { if (opcional) continue; return { erro: "campo_ausente" }; }
    if (nome === "pasta") { if (typeof v !== "string") return { erro: "campo_invalido" }; }
    else if (nome === "parte") { if (typeof v !== "string") return { erro: "campo_invalido" }; }
    else if (nome === "limite") { if (!Number.isSafeInteger(v) || v < 1 || v > politica.imap.maxMensagensPorChamada) return { erro: "campo_invalido" }; }
    else if (!uid32(v)) return { erro: "campo_invalido" };
  }
  if (d.operacao === "listar_mensagens" && ["ultimas", "desde_uid", "antes_de_uid"].filter((k) => d[k] !== undefined).length !== 1) return { erro: "campo_invalido" };
  const corpo = {}; for (const k of permitidos) if (d[k] !== undefined) corpo[k] = d[k];
  return { corpo };
}

async function lerCorpoLimitado(request, max) {
  if (!request.body) return null;
  const leitor = request.body.getReader(), partes = []; let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { try { await leitor.cancel(); } catch (_) { /* já encerrado */ } return undefined; }
    partes.push(value);
  }
  const todo = new Uint8Array(total); let pos = 0; for (const p of partes) { todo.set(p, pos); pos += p.byteLength; }
  return todo;
}

// deps: { segredos, agora():segundos, consumir(nonce):Promise<boolean>, executar(corpo):Promise<{ok,dados|erro}> }
export async function tratar(request, deps, politica = POLITICA) {
  try {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== politica.canal.caminho) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    const tipo = request.headers.get("Content-Type") || "";
    if (!/^application\/json(\s*;|$)/i.test(tipo)) return falha(415, "tipo_de_conteudo");
    const bytes = await lerCorpoLimitado(request, politica.canal.corpoMaxBytes);
    if (bytes === undefined) return falha(413, "corpo_grande_demais");
    if (bytes === null || bytes.length === 0) return falha(400, "corpo_invalido");

    let canal;
    try { canal = await verificarCanal({ request, corpoBytes: bytes, segredos: deps.segredos, agoraS: deps.agora(), politica }); }
    catch (e) { return falha(e instanceof ErroCanal ? ERROS_CANAL[e.codigo] || 401 : 401, e instanceof ErroCanal ? e.codigo : "assinatura_invalida"); }

    // só uma assinatura VÁLIDA chega a consumir nonce; o replay (mesma assinatura de novo) é recusado aqui, antes de qualquer operação
    let novo;
    try { novo = await deps.consumir(canal.nonce); } catch (_) { return falha(503, "registro_indisponivel"); }
    if (novo !== true) return falha(novo === false ? 409 : 503, novo === false ? "replay" : "registro_indisponivel");

    const exame = examinarCorpo(bytes, canal.operacao, politica);
    if (!exame.corpo) return falha(400, exame.erro);
    const r = await deps.executar(exame.corpo);
    if (r && r.ok === true && r.dados && typeof r.dados === "object") return json(200, { ok: true, operacao: exame.corpo.operacao, dados: r.dados });
    const erro = r && ERROS_IMAP.includes(r.erro) ? r.erro : "falha_inesperada";
    return falha(HTTP_IMAP[erro] || 502, erro);
  } catch (_) {
    return falha(500, "falha_interna");
  }
}

// liga uma operação ao IMAP (usado por index.mjs e pelos testes com servidor falso)
export function executarOperacao({ abrir, politica = POLITICA, relogio }) {
  return (corpo) => corpo.operacao === "ping" ? Promise.resolve({ ok: true, dados: { canal: "ok", worker: politica.versao } }) : comSessao({ abrir, usuario: corpo.usuario, senha: corpo.senha, politica, relogio }, (ctx) => OPERACOES[corpo.operacao](ctx, corpo));
}
