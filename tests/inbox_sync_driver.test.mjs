// RAC Inbox · I2 · REGRESSÃO da persistência da sincronização sob o driver REAL da Edge Function (postgres@3.4.4, sql.unsafe(texto, params)).
// Defeito de produção (15/11/2026): `sincronizar_pasta` falhava ao gravar os cabeçalhos com SQLSTATE 22023 "cannot call jsonb_to_recordset on a non-array".
// CAUSA: o postgres.js descreve o statement antes de enviar e serializa o parâmetro conforme o tipo que o servidor informa; para `$5::jsonb` o tipo é jsonb (OID 3802) e o serializador faz JSON.stringify.
// O repositório já enviava o lote como string JSON: ela foi codificada DUAS vezes, o PostgreSQL recebeu um jsonb ESCALAR (string) e não o array. O PGlite aceita a string crua, por isso o teste dele não pegou.
// CORREÇÃO: o lote vai como texto e só vira jsonb no servidor (`$5::text::jsonb`).
// Duas formas de prova: (1) NO CI, sobre o PGlite, com um adaptador que EMULA o comportamento comprovado do driver (jsonb passa por JSON.stringify), usando o sessao.ts e o repositorio.ts de produção;
// (2) com o driver REAL contra um PostgreSQL real, quando RAC_POSTGRES_JS (pasta do pacote postgres@3.4.4) e RAC_PG_URL existem (como o PGlite, é opt-in: o CI não tem servidor PostgreSQL).
// Tudo fictício. Nada toca o Supabase de produção nem a conta iCloud.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { criarRepositorio } from "../supabase/functions/rac-inbox/repositorio.ts";
import { sessaoPostgres } from "../supabase/functions/rac-inbox/sessao.ts";
import { prepararEsquema, rodarCenarios } from "./_inbox_driver_cenarios.mjs";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const semComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite: pula, menos no CI */ }
const pular = !PGlite;

test("no CI o PGlite está instalado: a regressão do driver emulado não pode ser pulada", () => { if (process.env.CI) assert.ok(PGlite, "sem PGlite no CI (testes.yml instala o @electric-sql/pglite)"); });

test("guardas de texto: nenhum parâmetro vai direto para `::jsonb` (o driver o codificaria de novo); o adaptador do driver é um módulo próprio, com um único `unsafe`", () => {
  const rep = semComent(ler("supabase/functions/rac-inbox/repositorio.ts"));
  assert.ok(!/\$\d+::jsonb/.test(rep), "`$N::jsonb` com parâmetro: o postgres.js aplicaria JSON.stringify de novo. Use `$N::text::jsonb`.");
  assert.match(rep, /jsonb_to_recordset\(\$5::text::jsonb\)/, "o lote entra como texto e vira jsonb no servidor");
  assert.ok(!/\bjson_to_recordset\(\$\d+::json\b/.test(rep));
  const ses = semComent(ler("supabase/functions/rac-inbox/sessao.ts")), idx = semComent(ler("supabase/functions/rac-inbox/index.ts"));
  assert.equal((ses.match(/\.unsafe\(/g) || []).length, 1, "um único ponto de execução de SQL, só com texto fixo e parâmetros");
  assert.ok(!/Deno|console\.|service_role/.test(ses), "sem Deno, para o teste poder usar o código de produção");
  assert.match(idx, /import \{ sessaoPostgres \} from "\.\/sessao\.ts"/); assert.ok(!/\.unsafe\(/.test(idx), "o index.ts não executa SQL por conta própria");
});

/* ---------- (1) o driver EMULADO sobre o PGlite (roda no CI) ---------- */
// postgres.js 3.4.4: descreve o statement (tipos dos parâmetros) e serializa por tipo; jsonb (3802) e json (114) → JSON.stringify do valor; o resto passa como está (strings, números, booleanos, arrays por literal).
// Esta emulação foi conferida contra o driver REAL (ver o teste "driver real" abaixo).
export function driverEmulado(db) {
  const serializar = (oid, v) => (v === null || v === undefined ? null : oid === 3802 || oid === 114 ? JSON.stringify(v) : v);
  const unsafe = async (texto, params = []) => {
    const tipos = params.length ? (await db.describeQuery(texto)).queryParams.map((p) => p.dataTypeID) : [];
    return (await db.query(texto, params.map((v, i) => serializar(tipos[i], v)))).rows;
  };
  return { unsafe, begin: async (f) => { await db.exec("begin"); try { const r = await f({ unsafe }); await db.exec("commit"); return r; } catch (e) { await db.exec("rollback"); throw e; } } };
}
async function bancoEmulado() {
  const db = await PGlite.create();
  await prepararEsquema((t) => db.exec(t));
  const cliente = driverEmulado(db);
  return { db, cliente, repo: criarRepositorio(sessaoPostgres(cliente)), consulta: (t, p) => cliente.unsafe(t, p) };
}

test("o DEFEITO, reproduzido: um parâmetro `$1::jsonb` com string JSON chega como jsonb ESCALAR e `jsonb_to_recordset` falha com 22023; `$1::text::jsonb` chega como array", { skip: pular }, async () => {
  const { db, consulta } = await bancoEmulado();
  const lote = JSON.stringify([{ uid: 1, assunto: "a" }, { uid: 2, assunto: "b" }]);
  assert.equal((await consulta("select jsonb_typeof($1::jsonb) as t", [lote]))[0].t, "string", "codificado duas vezes: o PostgreSQL vê uma string, não um array");
  const erro = await consulta("select count(*)::int n from jsonb_to_recordset($1::jsonb) as m(uid bigint, assunto text)", [lote]).then(() => null, (e) => e);
  assert.ok(erro, "a instrução que falhou em produção"); assert.match(erro.message, /cannot call jsonb_to_recordset on a non-array/); if (erro.code) assert.equal(erro.code, "22023");
  assert.equal((await consulta("select jsonb_typeof($1::text::jsonb) as t", [lote]))[0].t, "array", "como texto e convertido no servidor: array");
  assert.equal((await consulta("select count(*)::int n from jsonb_to_recordset($1::text::jsonb) as m(uid bigint, assunto text)", [lote]))[0].n, 2);
  await db.close();
});

test("persistência da sincronização pelo driver EMULADO: primeira (174 mensagens), repetida sem duplicar, flags, remoção, cursor, UIDVALIDITY, lote vazio e ROLLBACK", { skip: pular }, async () => {
  const { db, repo, consulta } = await bancoEmulado();
  await rodarCenarios({ repo, consulta, ddl: (t) => db.exec(t) });
  await db.close();
});

/* ---------- (2) o driver REAL contra um PostgreSQL real (opt-in) ---------- */
const DIR_DRIVER = process.env.RAC_POSTGRES_JS, URL_PG = process.env.RAC_PG_URL;
let postgres = null;
if (DIR_DRIVER && URL_PG) { try { postgres = (await import(pathToFileURL(path.join(path.resolve(DIR_DRIVER), "src/index.js")).href)).default; } catch (_) { /* driver ausente */ } }
const OPCOES = { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 10, onnotice: () => {}, debug: false };   // as MESMAS opções do index.ts de produção

test("driver REAL postgres@3.4.4 + PostgreSQL real (opt-in: RAC_POSTGRES_JS e RAC_PG_URL): o defeito acontece com `$N::jsonb`, não acontece com `$N::text::jsonb`, e a persistência inteira funciona", { skip: !postgres && "defina RAC_POSTGRES_JS (pasta do pacote postgres@3.4.4) e RAC_PG_URL (servidor descartável) para rodar" }, async () => {
  const admin = postgres(URL_PG, OPCOES), nome = "rac_driver_teste_" + process.pid, urlBanco = URL_PG.replace(/\/[^/?]*(\?|$)/, "/" + nome + "$1");
  await admin.unsafe("drop database if exists " + nome); await admin.unsafe("create database " + nome);
  const sql = postgres(urlBanco, OPCOES);
  try {
    assert.match(JSON.parse(fs.readFileSync(path.join(path.resolve(DIR_DRIVER), "package.json"), "utf8")).version, /^3\.4\.4$/, "a versão do driver é a de produção");
    // o defeito, no driver real
    const lote = JSON.stringify([{ uid: 1, assunto: "a" }, { uid: 2, assunto: "b" }]);
    assert.equal((await sql.unsafe("select jsonb_typeof($1::jsonb) as t", [lote]))[0].t, "string", "driver real: jsonb escalar (codificado duas vezes)");
    const erro = await sql.unsafe("select count(*)::int n from jsonb_to_recordset($1::jsonb) as m(uid bigint, assunto text)", [lote]).then(() => null, (e) => e);
    assert.equal(erro && erro.code, "22023"); assert.match(erro.message, /cannot call jsonb_to_recordset on a non-array/);
    assert.equal((await sql.unsafe("select jsonb_typeof($1::text::jsonb) as t", [lote]))[0].t, "array", "driver real: com text::jsonb chega como array");
    // a emulação do CI decide IGUAL ao driver real, nos mesmos casos (é isso que dá valor à regressão no CI)
    if (PGlite) {
      const emu = await bancoEmulado(), DOIS = [{ uid: 1, assunto: "a" }, { uid: 2, assunto: "b" }];
      for (const [texto, p] of [["select jsonb_typeof($1::jsonb) as t", [lote]], ["select jsonb_typeof($1::text::jsonb) as t", [lote]], ["select jsonb_typeof($1::jsonb) as t", [DOIS]], ["select jsonb_typeof($1::jsonb) as t", ['{"a":1}']], ["select jsonb_typeof($1::text::jsonb) as t", ['"texto"']]]) {
        const real = (await sql.unsafe(texto, p))[0].t, emulado = (await emu.consulta(texto, p))[0].t;
        assert.equal(emulado, real, "emulação igual ao driver real em: " + texto + " com " + JSON.stringify(p).slice(0, 40));
      }
      await emu.db.close();
    }
    // a persistência inteira, com o adaptador e o repositório de produção
    await prepararEsquema((t) => sql.unsafe(t));
    await rodarCenarios({ repo: criarRepositorio(sessaoPostgres(sql)), consulta: (t, p) => sql.unsafe(t, p), ddl: (t) => sql.unsafe(t) });
  } finally { await sql.end({ timeout: 2 }); await admin.unsafe("drop database if exists " + nome); await admin.end({ timeout: 2 }); }
});
