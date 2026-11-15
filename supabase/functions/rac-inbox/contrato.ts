// RAC Inbox · I1: contrato da função "rac-inbox" (docs/inbox.md). Lógica pura (sem Deno, sem banco, sem rede), testada em tests/inbox_cofre_servico.test.mjs.
// A credencial (login + senha específica de app da Apple) só existe aqui como valor em memória durante UMA chamada; nunca é devolvida, registrada ou guardada fora do Vault.
// Toda falha vira um CÓDIGO FECHADO de ERROS: nunca texto do banco, do Worker ou do provedor (e nunca o valor recebido).

export const OPERACOES_CREDENCIAL = ["credencial_guardar", "credencial_remover", "credencial_estado"] as const;
export const VERSAO_FUNCAO = "rac-inbox@i3.1";   // carimbo do código publicado (vem na resposta de testar_canal); mudar a cada alteração publicável
export const OPERACOES_SAIDA = ["smtp_prova", "enviar_mensagem"] as const;   // SMTP (I3): as ÚNICAS operações que escrevem no mundo; só o dono, só com a ação explícita do navegador
export const OPERACOES_LEITURA = ["testar_canal", "testar_conta", "listar_pastas", "estado_pasta", "sincronizar_pasta", "ler_mensagem", "baixar_anexo"] as const;   // só LEITURA no provedor (nenhuma escrita na caixa existe aqui); "sincronizar_pasta" grava só o CACHE de cabeçalhos no banco

/* código → HTTP */
export const ERROS: Record<string, number> = {
  metodo: 405, muito_grande: 413, corpo_invalido: 400, operacao_invalida: 400, campos_inesperados: 400, campo_ausente: 400, id_invalido: 400,
  usuario_invalido: 400, senha_formato_invalido: 400, sem_login: 401, mfa_requerido: 403, sem_permissao: 403, conta_inexistente: 404,
  credencial_ausente: 409, credencial_invalida: 422, credencial_corrompida: 500, cofre_indisponivel: 503, worker_nao_configurado: 503,
  servico_indisponivel: 502, interno: 500,
  /* I2 (leitura e sincronização) */
  pasta_inexistente: 404, mensagem_inexistente: 404, parte_inexistente: 404, anexo_grande_demais: 413, uidvalidity_mudou: 409, sincronizacao_em_andamento: 409,
  canal_recusado: 502, banco_indisponivel: 503,
  /* I3 (envio): falha confirmada = 4xx/422; resultado incerto = 202 (a mensagem PODE ter sido aceita: nunca se repete sozinho) */
  envio_recusado: 422, destinatario_recusado: 422, remetente_recusado: 422, smtp_autenticacao_recusada: 422, smtp_indisponivel: 502, envio_incerto: 202, envio_em_andamento: 409,
  registro_envio_indisponivel: 503, origem_invalida: 400, destinatario_invalido: 400, destinatarios_demais: 400, assunto_invalido: 400, texto_grande_demais: 413, mensagem_grande_demais: 413, modo_invalido: 400,
};

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const RE_USUARIO = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,185}\.[A-Za-z]{2,24}$/;   // o mesmo formato que o Worker aceita
const RE_SENHA_APP = /^[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}$/;
const RE_PARTE = /^[1-9]\d{0,2}(?:\.[1-9]\d{0,2}){0,5}$/;   // caminho IMAP da parte MIME ("2", "1.2")
export const UID_MAX = 4294967295;
const uidOk = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= UID_MAX;                          // SÓ a senha específica de app da Apple (xxxx-xxxx-xxxx-xxxx); a senha principal nunca bate

export type Pedido =
  | { operacao: "credencial_guardar"; conta_id: string; usuario: string; senha_app: string }
  | { operacao: "testar_canal" }   // prova o canal com o Worker: sem conta, sem Vault, sem credencial
  | { operacao: "credencial_remover" | "credencial_estado" | "testar_conta" | "listar_pastas"; conta_id: string }
  | { operacao: "estado_pasta" | "sincronizar_pasta"; conta_id: string; pasta_id: string }
  | { operacao: "ler_mensagem"; conta_id: string; pasta_id: string; uid: number }
  | { operacao: "baixar_anexo"; conta_id: string; pasta_id: string; uid: number; parte: string }
  | { operacao: "smtp_prova"; conta_id: string; enviar_teste: boolean }
  | { operacao: "enviar_mensagem"; conta_id: string; envio_id: string; modo: ModoEnvio; pasta_id?: string; uid?: number; para: string[]; cc: string[]; cco: string[]; assunto: string; texto: string };
export type ModoEnvio = "novo" | "responder" | "responder_todos" | "encaminhar";
export const MODOS_ENVIO: readonly string[] = ["novo", "responder", "responder_todos", "encaminhar"];
export const LIMITES_ENVIO = { destinatarios: 20, assunto: 300, texto: 100000 } as const;
export const ENVIO_CORPO_MAX_CARACTERES = 450000;   // o pedido de envio carrega o texto (o limite das demais operações continua 2 KiB)

const CAMPOS: Record<string, string[]> = {
  credencial_guardar: ["conta_id", "usuario", "senha_app"], credencial_remover: ["conta_id"], credencial_estado: ["conta_id"],
  testar_canal: [], testar_conta: ["conta_id"], listar_pastas: ["conta_id"], estado_pasta: ["conta_id", "pasta_id"],
  smtp_prova: ["conta_id", "enviar_teste"], enviar_mensagem: ["conta_id", "envio_id", "modo", "pasta_id", "uid", "para", "cc", "cco", "assunto", "texto"],
  sincronizar_pasta: ["conta_id", "pasta_id"], ler_mensagem: ["conta_id", "pasta_id", "uid"], baixar_anexo: ["conta_id", "pasta_id", "uid", "parte"],
};

export function validarPedido(corpo: unknown): { ok: true; pedido: Pedido } | { ok: false; erro: string } {
  if (corpo === null || typeof corpo !== "object" || Array.isArray(corpo)) return { ok: false, erro: "corpo_invalido" };
  const c = corpo as Record<string, unknown>, op = c.operacao;
  if (typeof op !== "string" || !Object.prototype.hasOwnProperty.call(CAMPOS, op)) return { ok: false, erro: "operacao_invalida" };
  const permitidos = ["operacao", ...CAMPOS[op]];
  if (Object.keys(c).some((k) => !permitidos.includes(k))) return { ok: false, erro: "campos_inesperados" };
  if (op === "smtp_prova") {
    if (typeof c.conta_id !== "string" || !RE_UUID.test(c.conta_id)) return { ok: false, erro: "id_invalido" };
    if (c.enviar_teste !== undefined && typeof c.enviar_teste !== "boolean") return { ok: false, erro: "campo_ausente" };
    return { ok: true, pedido: { operacao: "smtp_prova", conta_id: c.conta_id, enviar_teste: c.enviar_teste === true } };
  }
  if (op === "enviar_mensagem") return validarEnvio(c);
  for (const k of CAMPOS[op]) if (c[k] === undefined) return { ok: false, erro: "campo_ausente" };
  for (const k of CAMPOS[op]) if ((k === "conta_id" || k === "pasta_id") && (typeof c[k] !== "string" || !RE_UUID.test(c[k] as string))) return { ok: false, erro: "id_invalido" };
  if ((op === "ler_mensagem" || op === "baixar_anexo") && !uidOk(c.uid)) return { ok: false, erro: "id_invalido" };
  if (op === "baixar_anexo" && (typeof c.parte !== "string" || !RE_PARTE.test(c.parte))) return { ok: false, erro: "id_invalido" };
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

const RE_END_ENVIO = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,185}\.[A-Za-z]{2,24}$/;
/* o pedido de envio: esquema FECHADO. Endereços em minúsculas, sem duplicidade (a ordem de precedência é Para, Cc, Cco). O texto é só texto: nenhum HTML é montado nem aceito como tal. */
function validarEnvio(c: Record<string, unknown>): { ok: true; pedido: Pedido } | { ok: false; erro: string } {
  for (const k of ["conta_id", "envio_id"]) if (typeof c[k] !== "string" || !RE_UUID.test(c[k] as string)) return { ok: false, erro: "id_invalido" };
  if (typeof c.modo !== "string" || !MODOS_ENVIO.includes(c.modo)) return { ok: false, erro: "modo_invalido" };
  const resp = c.modo !== "novo";
  if (resp) { if (typeof c.pasta_id !== "string" || !RE_UUID.test(c.pasta_id) || !uidOk(c.uid)) return { ok: false, erro: "origem_invalida" }; }
  else if (c.pasta_id !== undefined || c.uid !== undefined) return { ok: false, erro: "origem_invalida" };
  const lista = (v: unknown, obrigatoria: boolean): string[] | null => {
    if (v === undefined) return obrigatoria ? null : [];
    if (!Array.isArray(v) || v.length > LIMITES_ENVIO.destinatarios) return null;
    const r: string[] = [];
    for (const e of v) { if (typeof e !== "string" || e.length > 254 || !RE_END_ENVIO.test(e)) return null; r.push(e.toLowerCase()); }
    return r;
  };
  if (!Array.isArray(c.para) || c.para.length > LIMITES_ENVIO.destinatarios) return { ok: false, erro: c.para === undefined ? "campo_ausente" : "destinatarios_demais" };
  const para = lista(c.para, true), cc = lista(c.cc, false), cco = lista(c.cco, false);
  if (!para || !cc || !cco) return { ok: false, erro: "destinatario_invalido" };
  const vistos: Record<string, boolean> = {}, unico = (l: string[]) => l.filter((e) => (vistos[e] ? false : (vistos[e] = true)));
  const p2 = unico(para), c2 = unico(cc), o2 = unico(cco);
  if (p2.length === 0) return { ok: false, erro: "destinatario_invalido" };
  if (p2.length + c2.length + o2.length > LIMITES_ENVIO.destinatarios) return { ok: false, erro: "destinatarios_demais" };
  if (typeof c.assunto !== "string" || c.assunto.length > LIMITES_ENVIO.assunto || /[\u0000-\u001f\u007f]/.test(c.assunto)) return { ok: false, erro: "assunto_invalido" };
  if (typeof c.texto !== "string") return { ok: false, erro: "campo_ausente" };
  if (c.texto.length > LIMITES_ENVIO.texto) return { ok: false, erro: "texto_grande_demais" };
  const pedido: Record<string, unknown> = { operacao: "enviar_mensagem", conta_id: c.conta_id, envio_id: c.envio_id, modo: c.modo, para: p2, cc: c2, cco: o2, assunto: c.assunto, texto: c.texto };
  if (resp) { pedido.pasta_id = c.pasta_id; pedido.uid = c.uid; }
  return { ok: true, pedido: pedido as Pedido };
}
