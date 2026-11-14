// RAC Inbox · I1: contrato da função "rac-inbox" (docs/inbox.md). Lógica pura (sem Deno, sem banco, sem rede), testada em tests/inbox_cofre_servico.test.mjs.
// A credencial (login + senha específica de app da Apple) só existe aqui como valor em memória durante UMA chamada; nunca é devolvida, registrada ou guardada fora do Vault.
// Toda falha vira um CÓDIGO FECHADO de ERROS: nunca texto do banco, do Worker ou do provedor (e nunca o valor recebido).

export const OPERACOES_CREDENCIAL = ["credencial_guardar", "credencial_remover", "credencial_estado"] as const;
export const OPERACOES_LEITURA = ["testar_conta", "listar_pastas", "estado_pasta"] as const;   // só LEITURA (nenhuma escrita na caixa existe aqui)

/* código → HTTP */
export const ERROS: Record<string, number> = {
  metodo: 405, muito_grande: 413, corpo_invalido: 400, operacao_invalida: 400, campos_inesperados: 400, campo_ausente: 400, id_invalido: 400,
  usuario_invalido: 400, senha_formato_invalido: 400, sem_login: 401, mfa_requerido: 403, sem_permissao: 403, conta_inexistente: 404,
  credencial_ausente: 409, credencial_invalida: 422, credencial_corrompida: 500, cofre_indisponivel: 503, worker_nao_configurado: 503,
  servico_indisponivel: 502, interno: 500,
};

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const RE_USUARIO = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,185}\.[A-Za-z]{2,24}$/;   // o mesmo formato que o Worker aceita
const RE_SENHA_APP = /^[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}$/;                          // SÓ a senha específica de app da Apple (xxxx-xxxx-xxxx-xxxx); a senha principal nunca bate

export type Pedido =
  | { operacao: "credencial_guardar"; conta_id: string; usuario: string; senha_app: string }
  | { operacao: "credencial_remover" | "credencial_estado" | "testar_conta" | "listar_pastas"; conta_id: string }
  | { operacao: "estado_pasta"; conta_id: string; pasta_id: string };

const CAMPOS: Record<string, string[]> = {
  credencial_guardar: ["conta_id", "usuario", "senha_app"], credencial_remover: ["conta_id"], credencial_estado: ["conta_id"],
  testar_conta: ["conta_id"], listar_pastas: ["conta_id"], estado_pasta: ["conta_id", "pasta_id"],
};

export function validarPedido(corpo: unknown): { ok: true; pedido: Pedido } | { ok: false; erro: string } {
  if (corpo === null || typeof corpo !== "object" || Array.isArray(corpo)) return { ok: false, erro: "corpo_invalido" };
  const c = corpo as Record<string, unknown>, op = c.operacao;
  if (typeof op !== "string" || !Object.prototype.hasOwnProperty.call(CAMPOS, op)) return { ok: false, erro: "operacao_invalida" };
  const permitidos = ["operacao", ...CAMPOS[op]];
  if (Object.keys(c).some((k) => !permitidos.includes(k))) return { ok: false, erro: "campos_inesperados" };
  for (const k of CAMPOS[op]) if (c[k] === undefined) return { ok: false, erro: "campo_ausente" };
  for (const k of CAMPOS[op]) if ((k === "conta_id" || k === "pasta_id") && (typeof c[k] !== "string" || !RE_UUID.test(c[k] as string))) return { ok: false, erro: "id_invalido" };
  if (op === "credencial_guardar") {
    if (typeof c.usuario !== "string" || (c.usuario as string).length > 254 || !RE_USUARIO.test(c.usuario as string)) return { ok: false, erro: "usuario_invalido" };
    if (typeof c.senha_app !== "string" || !RE_SENHA_APP.test(c.senha_app as string)) return { ok: false, erro: "senha_formato_invalido" };
  }
  const p: Record<string, unknown> = { operacao: op };
  for (const k of CAMPOS[op]) p[k] = c[k];
  return { ok: true, pedido: p as Pedido };
}

/* a 2ª etapa (MFA): quem tem fator verificado só opera com a sessão em aal2 (o mesmo critério do banco, rac_aal_ok) */
export function aalOk(fatores: Array<{ status?: string }> | null | undefined, aal: string | null | undefined): boolean {
  const comFator = (fatores ?? []).some((f) => f?.status === "verified");
  return !comFator || aal === "aal2";
}

/* o que se guarda no Vault: um JSON curto com o login e a senha de app */
export const empacotar = (usuario: string, senha: string): string => JSON.stringify({ u: usuario, s: senha });
export function desempacotar(bruto: string): { usuario: string; senha: string } | null {
  try {
    const j = JSON.parse(bruto);
    if (j && typeof j.u === "string" && typeof j.s === "string" && RE_USUARIO.test(j.u) && RE_SENHA_APP.test(j.s)) return { usuario: j.u, senha: j.s };
  } catch (_) { /* corrompido */ }
  return null;
}

/* erro do banco (código do Postgres) → código fechado; nunca a mensagem */
export function erroDoCofre(codigoPg: string | undefined): string {
  switch (codigoPg) {
    case "P0002": return "conta_inexistente";
    case "42501": return "sem_permissao";
    case "22023": return "campo_ausente";
    default: return "cofre_indisponivel";
  }
}
