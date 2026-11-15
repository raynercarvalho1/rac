// RAC Inbox · I1: o serviço da função "rac-inbox" (docs/inbox.md). Puro e testado (tests/inbox_cofre_servico.test.mjs): o cofre (Vault), o Worker e o registro entram como
// dependências, então os testes usam versões de mentira e provam: a credencial nunca sai em resposta, erro ou registro; conta sem credencial nunca chega ao Worker; falha do cofre
// interrompe a operação sem alternativa. SEM estado global: nada é guardado entre chamadas, e o segredo descriptografado vive só em variáveis locais de uma chamada.
import { aalOk as _aalOk, desempacotar, empacotar, ERROS, erroDoCofre, validarPedido } from "./contrato.ts";

export type EstadoCredencial = "ausente" | "ativa" | "invalida";
export interface Cofre {
  guardar(dono: string, conta: string, segredo: string): Promise<void>;
  ler(dono: string, conta: string): Promise<string | null>;
  remover(dono: string, conta: string): Promise<boolean>;
  estado(dono: string, conta: string): Promise<EstadoCredencial>;
  marcar(dono: string, conta: string, estado: "ativa" | "invalida"): Promise<void>;
}
export type ResultadoWorker = { ok: true; dados: Record<string, unknown> } | { ok: false; erro: string };
export interface Worker {
  executar(operacao: string, pedido: { conta_id: string; pasta_id?: string }, credencial: { usuario: string; senha: string }): Promise<ResultadoWorker>;
}
export interface Contexto {
  usuario: { id: string; mfaOk: boolean } | null;   // já autenticado pelo index.ts (JWT validado)
  cofre: Cofre;
  worker: Worker | null;                            // null enquanto o canal assinado com o Worker (P7) não existir
  registrar: (e: { operacao: string; codigo: string; status: number }) => void;   // SÓ operação, código fechado e status
}
export type Resposta = { status: number; corpo: Record<string, unknown> };

/* códigos de recusa de autenticação que o Worker usa (lista fechada) */
const AUTENTICACAO_RECUSADA = ["autenticacao_falhou", "autenticacao_recusada", "login_recusado", "credencial_recusada"];
const UID_MAX = 4294967295, RE_COD = /^[a-z][a-z0-9_]{1,40}$/;
const uidOk = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= UID_MAX;
const inteiroOuNulo = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);

/* só copia o que conhece (esquema fechado): o que o Worker responder além disso nunca chega ao navegador */
export function filtrarResposta(operacao: string, dados: Record<string, unknown>): Record<string, unknown> | null {
  if (operacao === "estado_pasta") {
    const ex = dados.exame as Record<string, unknown> | undefined, sy = dados.sincronizacao as Record<string, unknown> | undefined;
    if (!ex || !uidOk(ex.uidvalidity) || !uidOk(ex.uidnext) || !sy || typeof sy.tipo !== "string" || !RE_COD.test(sy.tipo)) return null;
    return { exame: { uidvalidity: ex.uidvalidity, uidnext: ex.uidnext }, sincronizacao: { tipo: sy.tipo }, mensagens_na_pasta: inteiroOuNulo(dados.mensagens_na_pasta), duracao_ms: inteiroOuNulo(dados.duracao_ms) };
  }
  if (operacao === "listar_pastas") {
    const l = dados.pastas;
    if (!Array.isArray(l) || l.length > 500) return null;
    const pastas = l.map((p) => (p && typeof (p as Record<string, unknown>).nome === "string" && ((p as Record<string, unknown>).nome as string).length <= 200 ? { nome: (p as Record<string, unknown>).nome, uso: typeof (p as Record<string, unknown>).uso === "string" && RE_COD.test((p as Record<string, unknown>).uso as string) ? (p as Record<string, unknown>).uso : "outra" } : null));
    return pastas.some((p) => p === null) ? null : { pastas };
  }
  return {};   // testar_conta: só o "ok"
}

export async function atender(corpo: unknown, ctx: Contexto): Promise<Resposta> {
  let operacao = "desconhecida";
  const falha = (codigo: string): Resposta => {
    const status = ERROS[codigo] ?? 500;
    try { ctx.registrar({ operacao, codigo, status }); } catch (_) { /* o registro nunca derruba a resposta */ }
    return { status, corpo: { ok: false, erro: codigo } };
  };
  const sucesso = (extra: Record<string, unknown>): Resposta => {
    try { ctx.registrar({ operacao, codigo: "ok", status: 200 }); } catch (_) { /* idem */ }
    return { status: 200, corpo: { ok: true, ...extra } };
  };
  try {
    if (!ctx.usuario) return falha("sem_login");
    const v = validarPedido(corpo);
    if (typeof (corpo as Record<string, unknown> | null)?.operacao === "string" && /^[a-z_]{1,40}$/.test((corpo as Record<string, string>).operacao)) operacao = (corpo as Record<string, string>).operacao;
    if (!v.ok) return falha(v.erro);
    const p = v.pedido, dono = ctx.usuario.id;
    if (!ctx.usuario.mfaOk) return falha("mfa_requerido");

    /* ---- ciclo da credencial ---- */
    if (p.operacao === "credencial_guardar") {
      try { await ctx.cofre.guardar(dono, p.conta_id, empacotar(p.usuario, p.senha_app)); } catch (e) { return falha(codigoDe(e)); }
      return sucesso({ credencial: "guardada" });   // nunca devolve a credencial
    }
    if (p.operacao === "credencial_remover") {
      try { return sucesso({ removida: await ctx.cofre.remover(dono, p.conta_id) }); } catch (e) { return falha(codigoDe(e)); }
    }
    if (p.operacao === "credencial_estado") {
      try { return sucesso({ credencial: await ctx.cofre.estado(dono, p.conta_id) }); } catch (e) { return falha(codigoDe(e)); }
    }

    /* ---- operações de LEITURA no provedor: precisam do Worker e da credencial guardada ---- */
    if (!ctx.worker) return falha("worker_nao_configurado");   // antes de abrir o cofre: sem canal para o Worker, o segredo nem é lido
    let bruto: string | null;
    try { bruto = await ctx.cofre.ler(dono, p.conta_id); } catch (e) { return falha(codigoDe(e)); }
    if (bruto === null) return falha("credencial_ausente");    // conta sem credencial não inicia operação IMAP
    let cred = desempacotar(bruto);
    bruto = null;
    if (!cred) return falha("credencial_corrompida");
    let r: ResultadoWorker;
    try {
      r = await ctx.worker.executar(p.operacao, p.operacao === "estado_pasta" ? { conta_id: p.conta_id, pasta_id: p.pasta_id } : { conta_id: p.conta_id }, cred);
    } catch (_) {
      cred = null;
      return falha("servico_indisponivel");   // a mensagem do erro (que poderia conter o segredo) é descartada
    }
    cred = null;
    if (!r.ok) {
      if (AUTENTICACAO_RECUSADA.includes(r.erro)) {
        try { await ctx.cofre.marcar(dono, p.conta_id, "invalida"); } catch (_) { /* o estado fica como está; a resposta continua controlada */ }
        return falha("credencial_invalida");
      }
      return falha("servico_indisponivel");
    }
    const dados = filtrarResposta(p.operacao, r.dados ?? {});
    if (!dados) return falha("servico_indisponivel");
    try { await ctx.cofre.marcar(dono, p.conta_id, "ativa"); } catch (_) { /* idem */ }
    return sucesso(dados);
  } catch (_) {
    return falha("interno");   // qualquer imprevisto: código fixo, sem mensagem
  }
}

/* erro vindo do cofre → código fechado (só o campo "codigo" do ErroCofre; a mensagem nunca é usada) */
function codigoDe(e: unknown): string {
  const c = e && typeof e === "object" ? (e as { codigo?: unknown }).codigo : undefined;
  return erroDoCofre(typeof c === "string" ? c : undefined);
}
export const aalOk = _aalOk;
