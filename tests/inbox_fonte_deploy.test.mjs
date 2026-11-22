// RAC Inbox · o fonte da função "rac-inbox" tem de ser publicável pela ferramenta de deploy do Supabase (que recebe o conteúdo dos arquivos como texto): sequências \uXXXX no fonte são
// transformadas no caminho (viram o caractere real, e U+2028 quebra o JavaScript) ou duplicadas. Em 21/11/2026 uma publicação saiu com a validação do assunto e o aviso quebrados por isso.
// Classes de caracteres de controle/invisíveis são montadas por código (String.fromCharCode), nunca por escape \u no fonte.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validarPedido } from "../supabase/functions/rac-inbox/contrato.ts";

const DIR = new URL("../supabase/functions/rac-inbox/", import.meta.url);
test("nenhum fonte da função tem escape \\uXXXX nem \\u{...} (a publicação pelo deploy os estraga)", () => {
  const ruins = [];
  for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith(".ts"))) fs.readFileSync(new URL(f, DIR), "utf8").split("\n").forEach((l, i) => { if (/\\u[0-9a-fA-F]{4}|\\u\{/.test(l)) ruins.push(f + ":" + (i + 1)); });
  assert.deepEqual(ruins, []);
});
test("o assunto de um envio comum (dígitos, maiúsculas, a letra u, acentos) é aceito; controle, quebra de linha e DEL continuam recusados", () => {
  const env = (assunto) => validarPedido({ operacao: "enviar_mensagem", conta_id: "aaaaaaaa-0000-4000-8000-000000000001", envio_id: "bbbbbbbb-0000-4000-8000-000000000001", modo: "novo", para: ["a@example.com"], cc: [], cco: [], assunto, texto: "x" });
  for (const ok of ["Reunião 2026 às 15h", "URGENTE: Fatura nº 123 u", "Re: Olá, mundo", "Teste 0u1U"]) assert.equal(env(ok).ok, true, ok);
  for (const ruim of ["a\nb", "a\rb", "a\u0000b", "a\u007fb", "a\tb", "a\u0007b"]) assert.deepEqual([env(ruim).ok, env(ruim).erro], [false, "assunto_invalido"], JSON.stringify(ruim));
});
