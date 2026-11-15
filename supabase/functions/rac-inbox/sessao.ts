// RAC Inbox · I2: o adaptador entre o driver `postgres` (postgres.js 3.4.4, usado pela Edge Function) e o repositório (repositorio.ts). Sem Deno: por isso fica fora do index.ts (que chama Deno.serve ao ser carregado)
// e pode ser exercitado por tests/inbox_sync_driver.test.mjs com o driver REAL. Todo valor vai por parâmetro ($1, $2…) em `unsafe(texto, params)`: o texto do SQL é sempre fixo.
// ATENÇÃO ao tipo dos parâmetros: o postgres.js descreve o statement antes de enviar e SERIALIZA conforme o tipo que o servidor informa. Parâmetro `jsonb` recebe `JSON.stringify` do valor (uma string JSON seria codificada
// duas vezes). Por isso o repositório envia JSON como texto e converte no SQL (`$N::text::jsonb`); arrays vão como literal de array do PostgreSQL (o driver deixa a string passar).
import type { Linha, Sessao } from "./repositorio.ts";

type Executor = { unsafe: (t: string, p?: never[]) => PromiseLike<unknown> };
type Cliente = Executor & { begin: (f: (tx: Executor) => Promise<unknown>) => Promise<unknown> };

/* o executor de SQL do repositório sobre a conexão desta chamada; transacao = sql.begin (dentro de uma transação, "transacao" apenas continua nela) */
export function sessaoPostgres(sql: Cliente): Sessao {
  const montar = (q: Executor, dentro: boolean): Sessao => ({
    exec: async (texto, params = []) => (await q.unsafe(texto, params as never[])) as unknown as Linha[],
    transacao: async (f) => (dentro ? await f(montar(q, true)) : await sql.begin(async (tx) => await f(montar(tx, true)))) as never,
  });
  return montar(sql, false);
}
