// Radar de Preços: qual chave do próprio Supabase usar (mesmo padrão da função rac-ia e da garmin), com cópia própria para a função radar não importar de outra pasta de função
// (cada função é publicada sozinha). Formato novo: um JSON por nome ({"default": "sb_..."}); formato antigo: um texto só. As variáveis chegam de fora (index.ts), então este arquivo é puro.

export type LerAmbiente = (nome: string) => string | undefined;

export function chaveSb(ler: LerAmbiente, nova: string, antiga: string): string {
  try { const j = JSON.parse(ler(nova) ?? ""); if (j?.default) return j.default as string; } catch (_) { /* formato antigo */ }
  return ler(antiga) ?? "";
}
export const chaveServidor = (ler: LerAmbiente): string => chaveSb(ler, "SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
export const chavePublica = (ler: LerAmbiente): string =>
  chaveSb(ler, "SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY") || (ler("SUPABASE_PUBLISHABLE_KEY") ?? "");
