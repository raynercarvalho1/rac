// Diagnóstico seguro do Radar: o log da função traz etapa, nome, mensagem e stack, sem segredos; a resposta HTTP continua genérica.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { limpar, registroDeErro, erroDoBanco } from "../supabase/functions/radar/diag.ts";
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("registro traz etapa, nome, mensagem e stack", () => {
  const r = registroDeErro("rotina_listar_donos", erroDoBanco("radar_lojas(donos)", { code: "42501", message: "permission denied for table radar_lojas" }));
  assert.deepEqual([r.evento, r.etapa, r.nome], ["radar_erro", "rotina_listar_donos", "ErroDeBanco"]);
  assert.match(r.mensagem, /42501.*permission denied/); assert.match(r.stack, /ErroDeBanco/);
  assert.equal(registroDeErro("x", "texto solto").mensagem, "texto solto"); assert.equal(registroDeErro("x", null).stack, null);
});
test("segredos, tokens, e-mails e números longos são removidos", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk";
  const t = limpar(`Authorization: Bearer ${jwt} x-rac-rotina: senhaSuperSecreta sb_secret_abcdef123456 sk-ant-xyz12345 a@b.com CEP 12345678 {"password":"hunter22"}`);
  for (const v of [jwt, "senhaSuperSecreta", "sb_secret_abcdef", "sk-ant-xyz", "a@b.com", "12345678", "hunter22"]) assert.ok(!t.includes(v), v);
  assert.ok(limpar("a".repeat(5000)).length <= 1500);
});
test("index.ts: etapa antes de cada passo crítico, log estruturado, resposta externa genérica e sem vazar detalhes", () => {
  const i = ler("supabase/functions/radar/index.ts");
  for (const e of ["ambiente", "cliente_supabase", "ler_corpo", "rotina_rpc_rac_rotina_ok", "rotina_listar_donos", "rotina_rodada", "login_jwt", "login_membro", "ler_url"]) assert.ok(i.includes(`etapa = "${e}"`), e);
  assert.match(i, /console\.error\(JSON\.stringify\(registroDeErro\(etapa, e\)\)\)/);
  assert.match(i, /return json\(\{ ok: false, erro: "interno" \}, 500\)/);
  const catchBloco = i.slice(i.lastIndexOf("} catch (e)")); assert.ok(!/json\([^)]*(e\.|message|stack)/.test(catchBloco));
  assert.ok(!/console\.(log|info|debug)/.test(i) && !/req\.headers|senha/.test(catchBloco), "log nunca inclui cabeçalhos nem a senha");
  assert.match(i, /if \(erroRpc\) throw erroDoBanco/);
});
