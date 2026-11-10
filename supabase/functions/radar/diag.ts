// Radar de Preços: diagnóstico seguro de exceções (só para o log do servidor; o chamador HTTP continua recebendo {"ok":false,"erro":"interno"}).
// Registra a ETAPA, o nome, a mensagem e o stack, depois de remover o que parece segredo (JWT, chaves sb_/sk-, Bearer, senhas, e-mails, sequências longas de dígitos como CEP/CPF).
// Puro e testado (tests/radar_diag.test.mjs).

export function limpar(texto: unknown, max = 1500): string {
  return String(texto ?? "")
    .replace(/eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]*/g, "[jwt]")
    .replace(/\b(sb_(?:secret|publishable)_|sk-ant-|sk-)[\w-]{6,}/gi, "[chave]")
    .replace(/(bearer|authorization|apikey|x-rac-rotina|segredo|senha|password|token|secret)(["'\s:=]+)[^\s"',;)}]{4,}/gi, "$1$2[oculto]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\d{8,}/g, "[num]")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .slice(0, max);
}

export type Registro = { evento: "radar_erro"; etapa: string; nome: string; mensagem: string; stack: string | null };

export function registroDeErro(etapa: string, e: unknown): Registro {
  const x = (e && typeof e === "object" ? e : {}) as { name?: unknown; message?: unknown; stack?: unknown; code?: unknown };
  const msg = (typeof e === "string" ? e : String(x.message ?? "")) + (x.code ? " [código " + String(x.code) + "]" : "");
  return { evento: "radar_erro", etapa: limpar(etapa, 60), nome: limpar(x.name ?? typeof e, 60), mensagem: limpar(msg), stack: typeof x.stack === "string" ? limpar(x.stack, 3000) : null };
}

/* erro devolvido (não lançado) pelo supabase-js: { code, message, details, hint } → Error com o texto útil */
export function erroDoBanco(nome: string, err: { code?: string; message?: string; details?: string; hint?: string } | null | undefined): Error {
  const e = new Error(nome + ": " + limpar([err?.code, err?.message, err?.details, err?.hint].filter(Boolean).join(" | "), 500));
  e.name = "ErroDeBanco";
  return e;
}
