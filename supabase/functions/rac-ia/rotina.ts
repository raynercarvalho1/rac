// RAC Intelligence: pedido feito pela rotina do servidor (sem login), puro e testado em tests/newsletter.test.mjs.
// Só a função rac-newsletter chama por aqui, repassando a senha da rotina (x-rac-rotina, conferida no banco por
// rac_rotina_ok, a mesma do agendamento): é como o resumo da Newsletter sai às 6h, 12h e 18h sem o dono abrir o site.
// Só as ações desta lista podem vir da rotina; o resto do caminho é o mesmo do site (papel, modo, liberação por ação,
// reserva, idempotência, orçamento e validação), em nome do dono informado.

export const ACOES_ROTINA = ["newsletter.resumo"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type PedidoRotina = { ok: true; dono: string; pedido: Record<string, unknown> } | { ok: false; codigo: string };

/* corpo: { dono: "<uuid>", pedido: { ...o mesmo contrato v1 do site } } */
export function pedidoDaRotina(corpo: unknown): PedidoRotina {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return { ok: false, codigo: "entrada_invalida" };
  const c = corpo as Record<string, unknown>;
  if (typeof c.dono !== "string" || !UUID.test(c.dono)) return { ok: false, codigo: "entrada_invalida" };
  const p = c.pedido;
  if (!p || typeof p !== "object" || Array.isArray(p)) return { ok: false, codigo: "entrada_invalida" };
  if (!ACOES_ROTINA.includes((p as Record<string, unknown>).acao as string)) return { ok: false, codigo: "sem_permissao" };
  return { ok: true, dono: c.dono, pedido: p as Record<string, unknown> };
}
