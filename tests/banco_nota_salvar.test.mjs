// Central Fiscal, Lote B · migration 034 no Postgres de verdade (PGlite): CPF, conferência, congelamento, cancelamento, RPC nota_fiscal_salvar, Storage (metadata),
// exclusão em cascata e o ciclo gravar → conferir → cancelar → backup → restaurar → excluir. Nada disto fala com o Supabase; todos os dados são fictícios.
//
// FIDELIDADE (o que este teste prova e o que NÃO prova — o PGlite não é um Supabase):
//  • É o motor do PostgreSQL: constraints, gatilhos, cascatas de chave estrangeira, funções plpgsql, índices únicos, RLS e privilégios das migrations 025 a 034 rodam sem alteração.
//    As funções dono_da_casa() (002) e rac_aal_ok() (022) vêm do TEXTO real desses arquivos. storage.foldername() é cópia da definição real conferida em produção (só leitura).
//  • SIMULADO: os papéis (anon/authenticated/service_role) e privilégios padrão; auth.users/auth.mfa_factors mínimos; auth.uid()/auth.jwt() lendo o claim de set_config
//    (em produção auth.uid() é nulo sem JWT — conferido em produção, só leitura); storage.objects é uma tabela mínima (com metadata jsonb) SEM RLS e SEM as políticas do Storage.
//  • NÃO provado aqui (continua para o Supabase real): as duas políticas restritivas de storage.objects em ação (upsert, mover, apagar), aal2 emitido pelo GoTrue, a exclusão de conta pelo
//    GoTrue/painel, concorrência real (o PGlite tem uma conexão só: a corrida é simulada por um gatilho), o mimetype que o Storage grava para um XML e o uso das RPCs pela API.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { CASOS, BASES, cpfDe, formatar, corromper } from "./fixtures/fiscal/cpf_casos.mjs";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const CPF = cpfDe(BASES.A), PONTUADO = formatar(CPF, "pontuado"), OUTRO = formatar(cpfDe(BASES.B), "pontuado");   // fictícios, gerados em memória

let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite: pula */ }
const pular = !PGlite && !process.env.CI;   // no GitHub (CI) nunca se pula: sem PGlite o teste FALHA em vez de ficar ignorado

const R = "11111111-1111-4111-8111-111111111111", F = "22222222-2222-4222-8222-222222222222", X = "33333333-3333-4333-8333-333333333333";
const trecho = (arq, ini, fim) => { const t = ler(arq), i = t.indexOf(ini); assert.ok(i >= 0, ini); return t.slice(i, t.indexOf(fim, i) + fim.length); };

async function banco() {
  const db = await PGlite.create();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    create schema auth; grant usage on schema auth to anon, authenticated, service_role;
    create table auth.users (id uuid primary key);
    create table auth.mfa_factors (user_id uuid, status text);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub', '')::uuid $$;
    insert into auth.users values ('${R}'), ('${F}'), ('${X}');
    create schema storage; grant usage on schema storage to anon, authenticated, service_role;
    create table storage.buckets (id text primary key, name text, public boolean default false, allowed_mime_types text[]);
    insert into storage.buckets (id, name, public) values ('familia', 'familia', false);
    create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text, metadata jsonb, created_at timestamptz default now());
    grant select on storage.objects to authenticated;
    create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
    declare _parts text[]; begin select string_to_array(name, '/') into _parts; return _parts[1 : array_length(_parts,1) - 1]; end $$;
  `);
  await db.exec(trecho("supabase/002_casa_compartilhada.sql", "create table if not exists public.membros", "grant execute on function public.dono_da_casa() to authenticated;"));
  await db.exec(trecho("supabase/022_seguranca.sql", "create or replace function public.rac_aal_ok()", "grant execute on function public.rac_aal_ok() to authenticated;"));
  await db.exec(`
    insert into public.membros (membro, dono) values ('${F}', '${R}');
    create table public.notas (id uuid primary key default gen_random_uuid(), user_id uuid default public.dono_da_casa());
    create table public.pedidos (id uuid primary key default gen_random_uuid(), user_id uuid default public.dono_da_casa());
    create table public.registros (id uuid primary key default gen_random_uuid(), user_id uuid default public.dono_da_casa());
  `);
  for (const a of ["025_compras_online", "026_compras_emails", "030_compras_multiorigem", "031_compras_reembolsos", "032_central_fiscal", "033_seguranca_compras_fiscal", "034_notas_fiscais_gravacao"]) await db.exec(ler(`supabase/${a}.sql`));
  return db;
}
async function como(db, uid, sql, params = [], aal = "aal1") {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, role: "authenticated", aal })]);
  await db.exec(uid ? "set role authenticated" : "set role anon");
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); }
}
/* sessão de administração: sem JWT (auth.uid() nulo) e sem papel limitado, como o SQL Editor */
async function admin(db, sql, params = []) {
  await db.query("select set_config('request.jwt.claims', '', false)"); await db.exec("reset role");
  return (await db.query(sql, params)).rows;
}
const falha = async (p) => { try { await p; } catch (e) { return e; } assert.fail("era para dar erro"); };
const contar = async (db, t) => +(await admin(db, `select count(*)::int as n from public.${t}`))[0].n;

// ---------- a nota de teste: XML fictício → o MESMO payload que o site monta (nfParaGravar) ----------
function xmlDe(n) {
  const b43 = "31" + "2611" + "11222333000181" + "55" + "001" + String(n).padStart(9, "0") + "1" + "12345678", chave = b43 + N.nfDvChave(b43);
  const xml = `<nfeProc><NFe><infNFe Id="NFe${chave}" versao="4.00"><ide><mod>55</mod><serie>1</serie><nNF>${n}</nNF><dhEmi>2026-11-06T10:00:00-03:00</dhEmi><tpEmis>1</tpEmis></ide>
<emit><CNPJ>11222333000181</CNPJ><xNome>LOJA EXEMPLO LTDA</xNome><enderEmit><UF>MG</UF></enderEmit></emit><dest><CPF>${CPF}</CPF><xNome>CONSUMIDOR FICTICIO</xNome></dest>
<det nItem="1"><prod><cProd>10</cProd><xProd>PAPEL HIGIENICO EXEMPLO</xProd><qCom>1.0000</qCom><uCom>UN</uCom><vUnCom>13.29</vUnCom><vProd>13.29</vProd><vDesc>0.66</vDesc></prod></det>
<det nItem="2"><prod><cProd>11</cProd><xProd>SUCO EXEMPLO</xProd><qCom>2.0000</qCom><uCom>UN</uCom><vUnCom>6.00</vUnCom><vProd>12.00</vProd></prod></det>
<total><ICMSTot><vProd>25.29</vProd><vDesc>0.66</vDesc><vFrete>0.00</vFrete><vOutro>0.00</vOutro><vTotTrib>7.94</vTotTrib><vNF>24.63</vNF></ICMSTot></total>
<pag><detPag><tPag>03</tPag><vPag>24.63</vPag><card><tBand>02</tBand></card></detPag></pag></infNFe><protNFe><infProt><cStat>100</cStat><nProt>131260000000001</nProt><chNFe>${chave}</chNFe></infProt></protNFe></NFe></nfeProc>`;
  return { xml, chave };
}
const uuid = (n) => "5f1c2d3e-4a5b-4c6d-8e7f-" + String(n).padStart(12, "0");
function preparar(n = 123, o = {}) {
  const x = xmlDe(n), lido = N.nfLerXML(x.xml), norm = N.nfNormalizar(lido), bytes = Buffer.from(x.xml), sha = createHash("sha256").update(bytes).digest("hex"), id = o.id || uuid(n);
  const g = N.nfParaGravar(lido, norm, { id, dono: R, nome: "nota.xml", mime: "text/xml", tamanho: bytes.length, sha256: sha, conferir: !!o.conferir });
  assert.ok(g.ok, g.erros.join(" "));
  return { ...x, id, sha, bytes, tamanho: bytes.length, args: g.args, path: g.args.p_docs[0].path, lido, norm };
}
const clonar = (a) => JSON.parse(JSON.stringify(a));
const noCofre = (db, p, meta) => admin(db, "insert into storage.objects (bucket_id, name, metadata) values ('familia', $1, $2::jsonb)", [p, meta === undefined ? null : JSON.stringify(meta)]);
const meta = (n, o = {}) => ({ size: n.tamanho, mimetype: "text/xml", ...o });
const salvar = (db, uid, a, aal) => como(db, uid, "select public.nota_fiscal_salvar($1::jsonb, $2::jsonb, $3::jsonb, $4) as r", [JSON.stringify(a.p_nota), JSON.stringify(a.p_itens), JSON.stringify(a.p_docs), a.p_conferir], aal).then((l) => l[0].r);
async function gravada(db, n = 123, o = {}) { const p = preparar(n, o); await noCofre(db, p.path, meta(p)); const r = await salvar(db, R, p.args); assert.equal(r.criado, true, JSON.stringify(r)); return { ...p, r }; }
const nota = (db, id, uid = R) => como(db, uid, "select * from public.notas_fiscais where id = $1", [id]).then((l) => l[0]);

test("o payload de teste passa no núcleo (roda sempre, sem banco): é o MESMO que o site monta", () => {
  const p = preparar(123, { conferir: true });
  assert.deepEqual([p.args.p_nota.chave, p.args.p_conferir, p.args.p_itens.length, p.args.p_docs[0].path], [p.chave, true, 2, `${R}/notas-fiscais/${p.id}/${p.sha}.xml`]);
  assert.equal(p.args.p_nota.protocolo, "131260000000001");
});
test("no GitHub, o Postgres do teste (PGlite) está instalado", { skip: !process.env.CI }, () => assert.ok(PGlite, "PGlite não foi instalado no testes.yml"));
test("PGlite · versão do Postgres (a produção é a 17.11) e a 034 roda inteira, duas vezes (idempotente)", { skip: pular }, async () => {
  const db = await banco();
  const v = (await admin(db, "select current_setting('server_version_num')::int as n, current_setting('server_version') as v"))[0];
  console.log("PGlite · versão do Postgres: " + v.v + " (" + v.n + ")"); assert.ok(v.n >= 160000, "o PGlite usa Postgres " + v.v);
  await db.exec(ler("supabase/034_notas_fiscais_gravacao.sql"));
  for (const f of ["nf_cpf_dv_ok", "nf_tem_cpf", "nf_trava", "nota_fiscal_salvar", "nota_fiscal_conferir", "nota_fiscal_existente", "nota_fiscal_sem_registro"]) assert.equal((await admin(db, "select count(*)::int as n from pg_proc where proname = $1", [f]))[0].n, 1, f);
  assert.equal((await admin(db, "select count(*)::int as n from pg_policies where schemaname = 'storage' and policyname like 'nf %'"))[0].n, 2);
  await db.close();
});

// ================= CPF no banco =================
test("T-CPF: nf_tem_cpf() e nf_cpf_dv_ok() — os 25 casos da bateria e os vetores, e os CHECKs recusam (23514) até por escrita direta", { skip: pular }, async () => {
  const db = await banco();
  for (const c of CASOS) assert.equal((await admin(db, "select public.nf_tem_cpf($1::text) as r", [c.t]))[0].r, c.esperado, `#${c.id} ${c.descricao}`);
  for (const [c, esperado] of [[cpfDe(BASES.A), true], [cpfDe(BASES.B), true], [cpfDe(BASES.C), true], [corromper(cpfDe(BASES.A), "dv2"), false], [cpfDe(BASES.IGUAIS), false], [cpfDe(BASES.ZEROS), false], [cpfDe(BASES.A).slice(0, 10), false], [PONTUADO, false], [null, false]])
    assert.equal((await admin(db, "select public.nf_cpf_dv_ok($1::text) as r", [c]))[0].r, esperado, String(c));
  const ins = (campos, valores) => como(db, R, `insert into public.notas_fiscais (id, modelo, valor_total, formato_origem, requer_conferencia, ${campos}) values (gen_random_uuid(), '55', 10, 'xml', true, ${valores})`);
  for (const [campo, valor] of [["emitente_nome", `'Fulano ${PONTUADO}'`], ["emitente_nome", `'Fulano ${CPF}'`], ["observacoes", `'CPF ${OUTRO}'`], ["situacao_evidencia", `'cpf ${cpfDe(BASES.C)}'`], ["pagamentos", `'[{"forma":"cpf ${CPF}"}]'::jsonb`]])
    assert.match((await falha(ins(campo, valor))).message, /23514|violates check constraint|notas_fiscais_sem_cpf/i, campo);
  await ins("emitente_nome, observacoes", "'LOJA EXEMPLO', 'EAN 7891000457368 e CNPJ 11.222.333/0001-81'");
  assert.equal(await contar(db, "notas_fiscais"), 1);
  await db.close();
});

// ================= gravar, conferir, auditoria =================
test("T1 nota válida: grava nota, itens e documento; sem conferir fica pendente; conferida na gravação leva quem e quando", { skip: pular }, async () => {
  const db = await banco(), a = await gravada(db, 100), b = await gravada(db, 101, { conferir: true });
  assert.deepEqual([a.r.itens, a.r.docs_gravados, a.r.conferida], [2, 1, false]); const na = await nota(db, a.id), nb = await nota(db, b.id);
  assert.deepEqual([na.conferida_em, na.conferida_por], [null, null]); assert.equal(nb.conferida_por, R); assert.ok(nb.conferida_em);
  assert.deepEqual([nb.situacao, nb.protocolo, nb.chave, nb.requer_conferencia, nb.formato_origem], ["autorizada", "131260000000001", b.chave, false, "xml"]);
  assert.equal(+(await como(db, R, "select count(*)::int as n from public.notas_fiscais_itens where nota_id = $1", [a.id]))[0].n, 2);
  assert.equal((await como(db, R, "select count(*)::int as n from public.notas_fiscais_docs where nota_id = $1 and path = $2 and sha256 = $3 and mime = 'text/xml'", [a.id, a.path, a.sha]))[0].n, 1);
  /* a Fernanda (da casa) grava e confere: a autoria é dela */
  const c = preparar(102, { conferir: true }); await noCofre(db, c.path, meta(c)); assert.equal((await salvar(db, F, c.args)).conferida, true); assert.equal((await nota(db, c.id, F)).conferida_por, F);
  /* nunca despesa: nenhuma coluna ou função de despesa nas notas */
  assert.equal((await admin(db, "select count(*)::int as n from information_schema.columns where table_name = 'notas_fiscais' and column_name ~ 'despesa'"))[0].n, 0);
  await db.close();
});
test("T2 auditoria: a conferência comum exige itens e documento; ninguém informa quem/quando; conferida não se desfaz; só o dono restaura o par original", { skip: pular }, async () => {
  const db = await banco();
  const solo = (uid, id) => como(db, uid, `insert into public.notas_fiscais (id, modelo, valor_total, formato_origem, requer_conferencia) values ('${id}', '55', 10, 'xml', true)`);
  const comPar = (uid, id, por, em) => como(db, uid, `insert into public.notas_fiscais (id, modelo, valor_total, formato_origem, requer_conferencia, conferida_por, conferida_em) values ('${id}', '55', 10, 'xml', true, ${por}, ${em})`);
  /* inserir já conferida (sem o par): recusado; a Fernanda não informa autoria */
  assert.match((await falha(como(db, R, `insert into public.notas_fiscais (id, modelo, valor_total, formato_origem, requer_conferencia, conferida_em) values ('${uuid(1)}', '55', 10, 'xml', true, now())`))).message, /a conferência vem depois de gravar os itens e o documento/);
  assert.match((await falha(comPar(F, uuid(2), `'${R}'`, "'2026-11-01'"))).message, /a conferência vem depois/);
  /* conferir nota sem itens/documento: recusado */
  await solo(R, uuid(3));
  assert.match((await falha(como(db, R, "update public.notas_fiscais set conferida_em = now() where id = $1", [uuid(3)]))).message, /ao menos um item e do documento original/);
  assert.match((await falha(como(db, R, "select public.nota_fiscal_conferir($1)", [uuid(3)]))).message, /ao menos um item e do documento original/);
  /* o dono restaura o par original (completo e no passado); no futuro, não */
  await comPar(R, uuid(4), `'${F}'`, "'2026-11-01T10:00:00Z'");
  const n4 = await nota(db, uuid(4)); assert.equal(n4.conferida_por, F); assert.equal(new Date(n4.conferida_em).toISOString(), "2026-11-01T10:00:00.000Z");
  assert.match((await falha(comPar(R, uuid(5), `'${F}'`, "now() + interval '1 day'"))).message, /a conferência vem depois/);
  /* conferida: trocar ou limpar é ignorado, sem erro */
  await como(db, R, "update public.notas_fiscais set conferida_em = null, conferida_por = null where id = $1", [uuid(4)]);
  await como(db, R, "update public.notas_fiscais set conferida_por = $2 where id = $1", [uuid(4), R]);
  const depois = await nota(db, uuid(4)); assert.deepEqual([depois.conferida_por, new Date(depois.conferida_em).toISOString()], [F, "2026-11-01T10:00:00.000Z"]);
  /* nota pendente: conferir depois funciona, uma vez; a segunda devolve ja_conferida com a mesma autoria */
  const p = await gravada(db, 110);
  const c1 = (await como(db, F, "select public.nota_fiscal_conferir($1) as r", [p.id]))[0].r, c2 = (await como(db, R, "select public.nota_fiscal_conferir($1) as r", [p.id]))[0].r;
  assert.deepEqual([c1.ja_conferida, c1.conferida_por, c2.ja_conferida, c2.conferida_por], [false, F, true, F]);
  await db.close();
});

// ================= congelamento e cancelamento =================
test("T5-T8 nota conferida: nenhum campo muda, itens e documentos não entram/mudam/saem; o registro do documento é imutável até em nota pendente", { skip: pular }, async () => {
  const db = await banco(), c = await gravada(db, 120, { conferir: true }), p = await gravada(db, 121);
  const tenta = (sql, par) => falha(como(db, R, sql, par));
  assert.match((await tenta("update public.notas_fiscais set valor_total = 1 where id = $1", [c.id])).message, /dados fiscais não mudam/);
  assert.match((await tenta("update public.notas_fiscais set observacoes = 'x' where id = $1", [c.id])).message, /dados fiscais não mudam/);
  assert.match((await tenta("update public.notas_fiscais set chave = null, requer_conferencia = true where id = $1", [c.id])).message, /dados fiscais não mudam/);
  await como(db, R, "update public.notas_fiscais set atualizado_em = now() where id = $1", [c.id]);           // só carimbo de hora passa
  for (const sql of ["update public.notas_fiscais_itens set descricao = 'x' where nota_id = $1", "delete from public.notas_fiscais_itens where nota_id = $1", "update public.notas_fiscais_docs set nome = 'x' where nota_id = $1", "delete from public.notas_fiscais_docs where nota_id = $1"])
    assert.match((await tenta(sql, [c.id])).message, /nota conferida|documento original/, sql);
  assert.match((await tenta("insert into public.notas_fiscais_itens (nota_id, descricao, qtd, total) values ($1, 'novo', 1, 1)", [c.id])).message, /nota conferida: os itens não mudam/);
  assert.match((await tenta("insert into public.notas_fiscais_docs (nota_id, tipo, nome, path, sha256) values ($1, 'xml', 'x', $2, $3)", [c.id, `${R}/notas-fiscais/${c.id}/outro.xml`, "e".repeat(64)])).message, /nota conferida: não entram documentos/);
  /* nota pendente: itens editáveis; o registro do documento NUNCA muda nem sai sozinho */
  await como(db, R, "update public.notas_fiscais_itens set descricao = 'editado' where nota_id = $1", [p.id]);
  assert.match((await tenta("update public.notas_fiscais_docs set nome = 'x' where nota_id = $1", [p.id])).message, /documento original: o registro não muda nem sai sozinho/);
  assert.match((await tenta("delete from public.notas_fiscais_docs where nota_id = $1", [p.id])).message, /documento original: o registro não muda nem sai sozinho/);
  /* mover um item para outra nota conferida também falha */
  assert.match((await tenta("update public.notas_fiscais_itens set nota_id = $2 where nota_id = $1", [p.id, c.id])).message, /nota conferida/);
  /* administração (sem JWT): fora destas regras */
  await admin(db, "update public.notas_fiscais set valor_total = 77 where id = $1", [c.id]); assert.equal(+(await nota(db, c.id)).valor_total, 77);
  await db.close();
});
test("T6 cancelamento: autorizada → cancelada é a ÚNICA mudança permitida em nota conferida, sozinha, e invalida os vínculos (gatilho da 032)", { skip: pular }, async () => {
  const db = await banco(), c = await gravada(db, 130, { conferir: true }), d = await gravada(db, 131, { conferir: true }), e = await gravada(db, 132, { conferir: true });
  const reg = (await admin(db, "insert into public.notas (user_id) values ($1) returning id", [R]))[0].id;
  await como(db, R, "insert into public.notas_fiscais_vinculos (nota_id, modulo, registro_id) values ($1, 'mercado', $2)", [c.id, reg]);
  /* mais um campo junto: recusado; outras transições: recusadas */
  assert.match((await falha(como(db, R, "update public.notas_fiscais set situacao = 'cancelada', situacao_evidencia = 'novo' where id = $1", [d.id]))).message, /dados fiscais não mudam/);
  assert.match((await falha(como(db, R, "update public.notas_fiscais set situacao = 'cancelada', valor_total = 1 where id = $1", [d.id]))).message, /dados fiscais não mudam/);
  assert.match((await falha(como(db, R, "update public.notas_fiscais set situacao = 'rejeitada' where id = $1", [d.id]))).message, /única mudança de situação permitida/);
  assert.match((await falha(como(db, R, "update public.notas_fiscais set situacao = 'pendente' where id = $1", [d.id]))).message, /única mudança de situação permitida/);
  assert.equal((await nota(db, d.id)).situacao, "autorizada");
  await como(db, R, "update public.notas_fiscais set situacao = 'cancelada' where id = $1", [c.id]);
  const n = await nota(db, c.id); assert.deepEqual([n.situacao, n.protocolo, n.situacao_evidencia === c.norm.situacao_evidencia], ["cancelada", "131260000000001", true], "protocolo e evidência da autorização ficam");
  assert.equal((await como(db, R, "select valido from public.notas_fiscais_vinculos where nota_id = $1", [c.id]))[0].valido, false, "vínculos invalidados pelo gatilho da 032");
  assert.match((await falha(como(db, R, "update public.notas_fiscais set situacao = 'autorizada' where id = $1", [c.id]))).message, /única mudança de situação permitida|cancelada não volta/);
  assert.equal(await contar(db, "notas_fiscais"), 3); void e;
  await db.close();
});

// ================= exclusão em cascata (T19 a T21) =================
test("T19 canário: este PGlite reproduz a cascata como o PostgreSQL — o gatilho do filho, na exclusão em cascata, já NÃO vê o pai", { skip: pular }, async () => {
  const db = await PGlite.create();
  await db.exec(`create table pc (id int primary key); create table fc (id int, pid int references pc(id) on delete cascade); create table log (pai_existe boolean);
    create function fc_antes() returns trigger language plpgsql as $$ begin insert into log select exists (select 1 from pc where id = old.pid); return old; end $$;
    create trigger fc_antes before delete on fc for each row execute function fc_antes();
    insert into pc values (1); insert into fc values (1, 1), (2, 1);
    delete from pc where id = 1;`);
  assert.deepEqual((await db.query("select pai_existe from log")).rows.map((r) => r.pai_existe), [false, false], "se isto falhar, T19-T21 precisam rodar em PostgreSQL real");
  await db.close();
});
test("T19/T20 excluir a nota (conferida ou pendente) leva itens, documentos e vínculos; os gatilhos dos filhos não bloqueiam a cascata", { skip: pular }, async () => {
  const db = await banco(), c = await gravada(db, 140, { conferir: true }), p = await gravada(db, 141);
  const reg = (await admin(db, "insert into public.notas (user_id) values ($1) returning id", [R]))[0].id;
  await como(db, R, "insert into public.notas_fiscais_vinculos (nota_id, modulo, registro_id) values ($1, 'mercado', $2)", [c.id, reg]);
  await como(db, R, "delete from public.notas_fiscais where id = $1", [c.id]); await como(db, F, "delete from public.notas_fiscais where id = $1", [p.id]);
  for (const t of ["notas_fiscais", "notas_fiscais_itens", "notas_fiscais_docs", "notas_fiscais_vinculos"]) assert.equal(await contar(db, t), 0, t);
  await db.close();
});
test("T21 exclusão de conta (sessão de administração) com nota conferida: a cascata por user_id passa por todos os gatilhos", { skip: pular }, async () => {
  const db = await banco(), p = preparar(150, { conferir: true });
  const a = clonar(p.args); a.p_nota.id = uuid(151); a.p_docs[0].path = `${X}/notas-fiscais/${uuid(151)}/${p.sha}.xml`;      // a casa do X é a própria (X é dono de si)
  await noCofre(db, a.p_docs[0].path, meta(p)); assert.equal((await salvar(db, X, a)).criado, true);
  assert.equal(await contar(db, "notas_fiscais"), 1);
  await admin(db, "delete from auth.users where id = $1", [X]);
  for (const t of ["notas_fiscais", "notas_fiscais_itens", "notas_fiscais_docs"]) assert.equal(await contar(db, t), 0, t);
  await db.close();
});

// ================= RPC: validação, Storage, duplicidade, permissões =================
test("T11/T12 matriz de campos: cada violação é recusada com mensagem clara e NADA fica gravado; os limites são os das colunas", { skip: pular }, async () => {
  const db = await banco(), base = preparar(160); await noCofre(db, base.path, meta(base));
  const roda = (mut) => { const a = clonar(base.args); mut(a); return falha(salvar(db, R, a)); };
  const casos = [
    ["CNPJ inválido", (a) => { a.p_nota.emitente_cnpj = "11222333000182"; }, /CNPJ do emitente inválido/], ["UF minúscula", (a) => { a.p_nota.emitente_uf = "mg"; }, /formato inválido em emitente_uf/],
    ["número com 10 dígitos", (a) => { a.p_nota.numero = "1234567890"; }, /numero/], ["série com 4 dígitos", (a) => { a.p_nota.serie = "1234"; }, /serie/], ["modelo 99", (a) => { a.p_nota.modelo = "99"; }, /modelo/],
    ["situação desconhecida", (a) => { a.p_nota.situacao = "x"; }, /situacao/], ["protocolo curto", (a) => { a.p_nota.protocolo = "12"; }, /protocolo/], ["tp_emis fracionário", (a) => { a.p_nota.tp_emis = 1.5; }, /tp_emis com mais de 0 casas/],
    ["valor negativo", (a) => { a.p_nota.valor_total = -1; }, /fora do que a coluna comporta/], ["valor acima da coluna", (a) => { a.p_nota.valor_outras = 10000000000; }, /fora do que a coluna comporta/], ["3 casas decimais", (a) => { a.p_nota.valor_total = 1.005; }, /casas decimais/],
    ["formato imagem", (a) => { a.p_nota.formato_origem = "imagem"; }, /formato_origem/], ["campo extra", (a) => { a.p_nota.cpf = "x"; }, /campo não permitido em nota: cpf/], ["conferida_em no payload", (a) => { a.p_nota.conferida_em = "2026-01-01"; }, /campo não permitido em nota: conferida_em/],
    ["pagamento com campo extra", (a) => { a.p_nota.pagamentos[0].numero = "1"; }, /campo não permitido em pagamento/], ["final com 5 dígitos", (a) => { a.p_nota.pagamentos[0].final = "12345"; }, /final/], ["valor do pagamento texto", (a) => { a.p_nota.pagamentos[0].valor = "1"; }, /precisa ser número/],
    ["sem itens", (a) => { a.p_itens = []; }, /1 a 990 itens/], ["qtd zero", (a) => { a.p_itens[0].qtd = 0; }, /fora do que a coluna comporta/], ["qtd com 5 casas", (a) => { a.p_itens[0].qtd = 1.00001; }, /casas decimais/], ["unidade fora do enum", (a) => { a.p_itens[0].unidade = "xx"; }, /unidade/],
    ["descrição vazia", (a) => { a.p_itens[0].descricao = ""; }, /vazio|falta/], ["campo extra no item", (a) => { a.p_itens[0].cpf = "x"; }, /campo não permitido em item/],
    ["tamanho 0", (a) => { a.p_docs[0].tamanho = 0; }, /tamanho/], ["tamanho acima de 2 MB", (a) => { a.p_docs[0].tamanho = 2097153; }, /tamanho/], ["tamanho fracionário", (a) => { a.p_docs[0].tamanho = 10.5; }, /casas decimais/],
    ["mime pdf", (a) => { a.p_docs[0].mime = "application/pdf"; }, /formato inválido em mime/], ["tipo pdf", (a) => { a.p_docs[0].tipo = "pdf"; }, /tipo/], ["dois documentos", (a) => { a.p_docs.push(a.p_docs[0]); }, /exatamente 1 documento/],
    ["caminho com nome livre", (a) => { a.p_docs[0].path = a.p_docs[0].path.replace(/[0-9a-f]{64}\.xml$/, "qualquer.xml"); }, /caminho do documento precisa ser exatamente/], ["caminho de outra nota", (a) => { a.p_docs[0].path = a.p_docs[0].path.replace(base.id, uuid(999)); }, /caminho do documento precisa ser exatamente/],
    ["sha diferente do caminho", (a) => { a.p_docs[0].sha256 = "e".repeat(64); }, /caminho do documento precisa ser exatamente/], ["conferir nulo", (a) => { a.p_conferir = null; }, /diga se a nota foi conferida/],
    ["sem chave e conferida", (a) => { a.p_nota.chave = null; a.p_nota.requer_conferencia = true; a.p_conferir = true; }, /sem chave fica pendente/], ["sem chave e sem requer_conferencia", (a) => { a.p_nota.chave = null; a.p_nota.requer_conferencia = false; }, /sem chave fica pendente/],
    ["chave com DV errado", (a) => { a.p_nota.chave = a.p_nota.chave.slice(0, 43) + ((+a.p_nota.chave[43] + 1) % 10); }, /dígito verificador/],
    ["CPF na descrição do item", (a) => { a.p_itens[0].descricao = `Cliente ${PONTUADO}`; }, /notas_fiscais_itens_sem_cpf/], ["CPF no nome do emitente", (a) => { a.p_nota.emitente_nome = `Fulano ${CPF}`; }, /notas_fiscais_sem_cpf/],
    ["CPF no nome do arquivo", (a) => { a.p_docs[0].nome = `NFe ${OUTRO}.xml`; }, /notas_fiscais_docs_sem_cpf/], ["CPF nas observações", (a) => { a.p_nota.observacoes = cpfDe(BASES.C); }, /notas_fiscais_sem_cpf/],
  ];
  for (const [nome, mut, re] of casos) { const e = await roda(mut); assert.match(e.message, re, nome); }
  for (const t of ["notas_fiscais", "notas_fiscais_itens", "notas_fiscais_docs"]) assert.equal(await contar(db, t), 0, "nada ficou gravado em " + t);
  /* o que a coluna comporta passa: 9.999.999.999,99; soma dos itens diferente do total é AVISO, não bloqueio */
  const ok = clonar(base.args); ok.p_nota.valor_outras = 9999999999.99; ok.p_nota.valor_produtos = 20;
  const r = await salvar(db, R, ok); assert.equal(r.criado, true); assert.ok(r.avisos.some((m) => /soma dos itens/.test(m)));
  await db.close();
});
test("T-Storage metadata obrigatório: ausente, sem size, sem mimetype, size texto, tamanho ou tipo divergentes são RECUSADOS; charset e caixa passam", { skip: pular }, async () => {
  const db = await banco(), quer = async (n, m, re) => { const p = preparar(n); if (m !== "ausente") await noCofre(db, p.path, m === undefined ? null : typeof m === "function" ? m(p) : m); const e = await falha(salvar(db, R, p.args)); assert.match(e.message, re, String(n)); assert.equal(await contar(db, "notas_fiscais"), 0); };
  await quer(170, "ausente", /o arquivo não está no cofre/); await quer(171, undefined, /metadata\.size ausente ou inválido/);
  await quer(172, { mimetype: "text/xml" }, /metadata\.size ausente ou inválido/); await quer(173, (p) => ({ size: String(p.tamanho), mimetype: "text/xml" }), /metadata\.size ausente ou inválido/);
  await quer(174, (p) => ({ size: p.tamanho }), /metadata\.mimetype ausente/); await quer(175, (p) => ({ size: p.tamanho, mimetype: "" }), /metadata\.mimetype ausente/);
  await quer(176, (p) => ({ size: p.tamanho + 1, mimetype: "text/xml" }), /tamanho informado \(\d+\) não bate com o arquivo no cofre/); await quer(177, (p) => ({ size: p.tamanho, mimetype: "image/png" }), /tipo informado \(text\/xml\) não bate/);
  await quer(178, (p) => ({ size: p.tamanho, mimetype: "application/xml" }), /tipo informado/);
  for (const [n, mt] of [[180, "text/xml; charset=utf-8"], [181, "TEXT/XML"]]) { const p = preparar(n); await noCofre(db, p.path, meta(p, { mimetype: mt })); assert.equal((await salvar(db, R, p.args)).criado, true, mt); }
  /* duas linhas com o mesmo nome (versões): vale a mais recente */
  const p = preparar(182); await noCofre(db, p.path, meta(p, { size: 1 })); await admin(db, "update storage.objects set created_at = now() - interval '1 hour' where name = $1", [p.path]); await noCofre(db, p.path, meta(p));
  assert.equal((await salvar(db, R, p.args)).criado, true);
  await db.close();
});
test("T9/T10 duplicidade: mesmo id volta 'ja_existia' (sem mandar apagar o registrado); mesma chave e mesmo arquivo são 'duplicada'; nada é gravado de novo", { skip: pular }, async () => {
  const db = await banco(), a = await gravada(db, 190), antes = await contar(db, "notas_fiscais_itens");
  const de = await salvar(db, R, a.args); assert.deepEqual([de.criado, de.ja_existia, de.docs_para_apagar], [false, true, []], "o arquivo é o registrado: nada a apagar");
  /* outro id, mesma chave: o arquivo novo (sem registro) é devolvido para o site apagar */
  const outro = clonar(a.args), id2 = uuid(191); outro.p_nota.id = id2; outro.p_docs[0].path = `${R}/notas-fiscais/${id2}/${a.sha}.xml`; await noCofre(db, outro.p_docs[0].path, meta(a));
  const d = await salvar(db, R, outro); assert.deepEqual([d.criado, d.duplicada, d.motivo, d.id, d.docs_para_apagar], [false, true, "chave", a.id, [outro.p_docs[0].path]]);
  /* chave nova, mesmo arquivo (SHA-256): motivo 'arquivo' */
  const b = preparar(192); const c = clonar(b.args); c.p_docs[0].sha256 = a.sha; c.p_docs[0].path = `${R}/notas-fiscais/${b.id}/${a.sha}.xml`; c.p_docs[0].tamanho = a.tamanho; await noCofre(db, c.p_docs[0].path, meta(a));
  const e = await salvar(db, R, c); assert.deepEqual([e.criado, e.duplicada, e.motivo, e.id], [false, true, "arquivo", a.id]);
  assert.deepEqual([await contar(db, "notas_fiscais"), await contar(db, "notas_fiscais_itens"), await contar(db, "notas_fiscais_docs")], [1, antes, 1]);
  await db.close();
});
test("T10 falha no meio: erro depois de gravar a nota desfaz tudo; violação única de outro tipo não é escondida (re-lançada) e nada fica", { skip: pular }, async () => {
  const db = await banco(), p = preparar(200); await noCofre(db, p.path, meta(p));
  /* um gatilho de teste força unique_violation no insert do documento (simula a corrida depois da pré-checagem) */
  await admin(db, "select 1");
  await db.exec(`create function public.t_corrida() returns trigger language plpgsql as $$ begin raise exception 'corrida simulada' using errcode = '23505'; end $$;
    create trigger zz_corrida before insert on public.notas_fiscais_docs for each row execute function public.t_corrida();`);
  const e = await falha(salvar(db, R, p.args)); assert.match(e.message, /corrida simulada/, "sem vencedor visível o erro é re-lançado, não escondido");
  for (const t of ["notas_fiscais", "notas_fiscais_itens", "notas_fiscais_docs"]) assert.equal(await contar(db, t), 0, "tudo desfeito em " + t);
  await db.exec("drop trigger zz_corrida on public.notas_fiscais_docs");
  assert.equal((await salvar(db, R, p.args)).criado, true, "depois da corrida, a mesma gravação funciona");
  await db.close();
});
test("permissões: anon não executa; MFA (aal1 com fator verificado) é recusado e aal2 passa; outra casa não grava na pasta alheia nem enxerga a nota", { skip: pular }, async () => {
  const db = await banco(), p = preparar(210); await noCofre(db, p.path, meta(p));
  assert.match((await falha(salvar(db, null, p.args))).message, /permission denied/i);
  await admin(db, "insert into auth.mfa_factors values ($1, 'verified')", [R]);
  assert.match((await falha(salvar(db, R, p.args, "aal1"))).message, /confirme o código do app de segurança \(MFA\)/);
  assert.match((await falha(como(db, R, "select public.nota_fiscal_conferir($1)", [uuid(1)], "aal1"))).message, /confirme o código do app de segurança \(MFA\)/);
  assert.equal(await contar(db, "notas_fiscais"), 0);
  assert.equal((await salvar(db, R, p.args, "aal2")).criado, true);
  assert.equal((await como(db, X, "select count(*)::int as n from public.notas_fiscais"))[0].n, 0, "outra casa não enxerga");
  const alheio = preparar(211); await noCofre(db, alheio.path, meta(alheio));
  assert.match((await falha(salvar(db, X, alheio.args))).message, /caminho do documento precisa ser exatamente/, "a pasta é a da casa de quem chama");
  assert.match((await falha(como(db, X, "select public.nota_fiscal_conferir($1)", [p.id]))).message, /nota não encontrada/);
  await db.close();
});

// ================= o ciclo completo =================
/* aplica no banco as operações que a restauração do site faria (insert por linha; a conferência é um upsert pelo id) */
async function aplicar(db, uid, ops) {
  for (const op of ops) {
    const cols = [...new Set(op.linhas.flatMap((l) => Object.keys(l)))];
    const sql = op.op === "insert" ? `insert into public.${op.t} select * from jsonb_populate_recordset(null::public.${op.t}, $1::jsonb)`
      : `insert into public.${op.t} select * from jsonb_populate_recordset(null::public.${op.t}, $1::jsonb) on conflict (id) do update set ${cols.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ")}`;
    await como(db, uid, sql, [JSON.stringify(op.linhas)]);
  }
}
const FISCAIS = ["notas_fiscais", "notas_fiscais_itens", "notas_fiscais_docs"];
test("T18 ciclo completo: gravar → conferir → cancelar → backup → restaurar em outra conta (autoria e caminho) → substituir por backup antigo → excluir", { skip: pular }, async () => {
  const db = await banco(), c = await gravada(db, 220, { conferir: true });
  await como(db, R, "update public.notas_fiscais set situacao = 'cancelada' where id = $1", [c.id]);
  /* backup: select * de cada tabela, como o site exporta */
  const tabelas = {}; for (const t of FISCAIS) tabelas[t] = (await como(db, R, `select to_jsonb(t) as j from public.${t} t`)).map((r) => r.j);
  const B = N.segLer({ versao: 1, dono: R, tabelas }), original = await nota(db, c.id);
  assert.equal(N.segPlano(B, { notas_fiscais: tabelas.notas_fiscais, notas_fiscais_itens: tabelas.notas_fiscais_itens, notas_fiscais_docs: tabelas.notas_fiscais_docs }, { conta: R, anexos: null }).total.novas, 0, "na mesma conta tudo já existe igual");
  await admin(db, "delete from public.notas_fiscais where user_id = $1", [R]);                 // a conta antiga não existe mais (os ids são únicos no banco inteiro)
  /* outra conta (X, vazia): o pacote traz o XML */
  const anexos = { [c.path]: { tamanho: c.tamanho, sha256: c.sha } }, atualX = { notas_fiscais: [], notas_fiscais_itens: [], notas_fiscais_docs: [] };
  const plano = N.segPlano(B, atualX, { conta: X, anexos });
  assert.deepEqual([plano.outraConta, plano.total.invalidas, plano.docsInvalidos, plano.congeladas], [true, 0, 0, 0]);
  const novoPath = `${X}/notas-fiscais/${c.id}/${c.sha}.xml`; assert.equal(plano.renomear[c.path].path, novoPath);
  const ops = N.segEscrita(plano, false); assert.deepEqual(ops.map((o) => [o.t, o.op]), [["notas_fiscais", "insert"], ["notas_fiscais_itens", "insert"], ["notas_fiscais_docs", "insert"], ["notas_fiscais", "conferencia"]]);
  await aplicar(db, X, ops);
  const n = (await como(db, X, "select * from public.notas_fiscais"))[0];
  assert.deepEqual([n.id, n.user_id, n.situacao, n.conferida_por, new Date(n.conferida_em).toISOString()], [c.id, X, "cancelada", R, new Date(original.conferida_em).toISOString()], "a autoria histórica (R) e a data originais sobreviveram");
  assert.equal(+(await como(db, X, "select count(*)::int as n from public.notas_fiscais_itens"))[0].n, 2);
  const d = (await como(db, X, "select * from public.notas_fiscais_docs"))[0]; assert.deepEqual([d.path, d.sha256, +d.tamanho, d.mime], [novoPath, c.sha, c.tamanho, "text/xml"], "o caminho do banco é o da conta nova");
  /* o arquivo "enviado" ao caminho novo bate com a linha (Storage de teste + metadata do Storage) */
  await noCofre(db, novoPath, { size: c.bytes.length, mimetype: "text/xml" });
  assert.equal((await admin(db, "select count(*)::int as n from public.notas_fiscais_docs d join storage.objects o on o.bucket_id = 'familia' and o.name = d.path and (o.metadata->>'size')::bigint = d.tamanho and o.metadata->>'mimetype' = d.mime where d.user_id = $1", [X]))[0].n, 1, "Storage × banco");
  assert.match((await falha(como(db, X, "update public.notas_fiscais set valor_total = 1"))).message, /dados fiscais não mudam/, "restaurada, a nota conferida está congelada");
  /* "substituir" por um backup mais antigo (nota pendente, valor diferente): nada muda e nada falha */
  const antiga = { ...tabelas.notas_fiscais[0], conferida_por: null, conferida_em: null, valor_total: 1 };
  const Bantigo = N.segLer({ versao: 1, dono: R, tabelas: { notas_fiscais: [antiga], notas_fiscais_itens: tabelas.notas_fiscais_itens, notas_fiscais_docs: tabelas.notas_fiscais_docs } });
  const atualDepois = {}; for (const t of FISCAIS) atualDepois[t] = (await como(db, X, `select to_jsonb(t) as j from public.${t} t`)).map((r) => r.j);
  const p2 = N.segPlano(Bantigo, atualDepois, { conta: X, anexos }); assert.deepEqual(N.segEscrita(p2, true), [], "nada para o banco recusar"); assert.ok(p2.congeladas >= 3);
  assert.equal(+(await nota(db, c.id, X)).valor_total, 24.63);
  /* excluir: cascata completa; o arquivo deixou de estar registrado (o site poderá removê-lo) */
  await como(db, X, "delete from public.notas_fiscais where id = $1", [c.id]);
  for (const t of FISCAIS) assert.equal((await admin(db, `select count(*)::int as n from public.${t} where user_id = $1`, [X]))[0].n, 0, t);
  assert.equal((await admin(db, "select count(*)::int as n from public.notas_fiscais_docs d where d.path = $1", [novoPath]))[0].n, 0);
  await db.close();
});
test("restauração: nota sem documento válido entra pendente, sem itens e sem a conferência (o banco aceita exatamente isso)", { skip: pular }, async () => {
  const db = await banco(), c = await gravada(db, 230, { conferir: true }), tabelas = {};
  for (const t of FISCAIS) tabelas[t] = (await como(db, R, `select to_jsonb(t) as j from public.${t} t`)).map((r) => r.j);
  const B = N.segLer({ versao: 1, dono: R, tabelas }), plano = N.segPlano(B, { notas_fiscais: [], notas_fiscais_itens: [], notas_fiscais_docs: [] }, { conta: X, anexos: {} });
  await admin(db, "delete from public.notas_fiscais where user_id = $1", [R]);
  assert.deepEqual([plano.docsInvalidos, plano.semDocumento[c.id]], [1, 1]);
  await aplicar(db, X, N.segEscrita(plano, false));
  const n = (await como(db, X, "select * from public.notas_fiscais"))[0]; assert.deepEqual([n.conferida_em, n.conferida_por], [null, null]);
  assert.equal(+(await como(db, X, "select count(*)::int as n from public.notas_fiscais_itens"))[0].n, 0); assert.equal(+(await como(db, X, "select count(*)::int as n from public.notas_fiscais_docs"))[0].n, 0);
  await db.close();
});

test("T-Storage versionamento (defensivo): marcador de exclusão e objeto arquivado contam como ausentes; a linha atual vence a arquivada", { skip: pular }, async () => {
  const db = await banco();
  await db.exec("alter table storage.objects add column is_delete_marker boolean not null default false, add column archived_at timestamptz");
  /* (a) só marcador de exclusão */
  const a = preparar(240); await noCofre(db, a.path, meta(a)); await admin(db, "update storage.objects set is_delete_marker = true where name = $1", [a.path]);
  assert.match((await falha(salvar(db, R, a.args))).message, /o arquivo não está no cofre/);
  /* (b) só arquivado */
  const b = preparar(241); await noCofre(db, b.path, meta(b)); await admin(db, "update storage.objects set archived_at = now() where name = $1", [b.path]);
  assert.match((await falha(salvar(db, R, b.args))).message, /o arquivo não está no cofre/);
  /* (c) versão antiga arquivada (metadata errado) + a atual: vale a atual */
  const c = preparar(242);
  await admin(db, "insert into storage.objects (bucket_id, name, metadata, created_at, archived_at) values ('familia', $1, $2::jsonb, now() - interval '2 hours', now() - interval '1 hour')", [c.path, JSON.stringify(meta(c, { size: 1 }))]);
  await noCofre(db, c.path, meta(c));
  assert.equal((await salvar(db, R, c.args)).criado, true);
  /* (d) o arquivo foi apagado depois (marcador mais novo que o objeto): recusado */
  const d = preparar(243);
  await admin(db, "insert into storage.objects (bucket_id, name, metadata, created_at) values ('familia', $1, $2::jsonb, now() - interval '1 hour')", [d.path, JSON.stringify(meta(d))]);
  await admin(db, "insert into storage.objects (bucket_id, name, metadata, is_delete_marker, created_at) values ('familia', $1, null, true, now())", [d.path]);
  assert.match((await falha(salvar(db, R, d.args))).message, /o arquivo não está no cofre/);
  assert.equal(await contar(db, "notas_fiscais"), 1, "só a (c) foi gravada");
  await db.close();
});
test("T-Storage políticas no motor do Postgres (com 'familia da casa' e 'mfa cofres' reais): arquivo ainda não registrado é livre, registrado não muda nem sai; Compras e outra casa como antes", { skip: pular }, async () => {
  const db = await banco();
  await db.exec("alter table storage.objects enable row level security; grant insert, update, delete on storage.objects to authenticated;");
  await db.exec(trecho("supabase/004_familia.sql", 'drop policy if exists "familia da casa" on storage.objects;', "(select public.dono_da_casa())::text);"));
  await db.exec(trecho("supabase/022_seguranca.sql", 'drop policy if exists "mfa cofres" on storage.objects;', "(select public.rac_aal_ok()));"));
  const ins = (uid, nome, m = { size: 5, mimetype: "text/xml" }) => como(db, uid, "insert into storage.objects (bucket_id, name, metadata) values ('familia', $1, $2::jsonb)", [nome, JSON.stringify(m)]);
  const upd = (uid, nome, set = "metadata = metadata || '{\"etag\":\"x\"}'::jsonb") => como(db, uid, `update storage.objects set ${set} where bucket_id = 'familia' and name = $1 returning name`, [nome]);
  const del = (uid, nome) => como(db, uid, "delete from storage.objects where bucket_id = 'familia' and name = $1 returning name", [nome]);
  const existe = async (nome) => (await admin(db, "select count(*)::int as n from storage.objects where name = $1", [nome]))[0].n;
  const livre = `${R}/notas-fiscais/${uuid(250)}/livre.xml`, compras = `${R}/compras/c1/foto.jpg`;
  /* ainda NÃO registrado: o envio (INSERT), a finalização (UPDATE de metadata) e a limpeza (DELETE) funcionam */
  await ins(R, livre); assert.equal((await upd(R, livre)).length, 1, "UPDATE de finalização do envio passa enquanto não há registro");
  assert.equal((await del(R, livre)).length, 1, "arquivo sem registro se apaga (limpeza de envio que falhou)");
  /* registrado */
  const p = preparar(251); await ins(R, p.path, meta(p)); assert.equal((await salvar(db, R, p.args)).criado, true);
  assert.equal((await upd(R, p.path)).length, 0, "registrado: não se atualiza (o upsert viraria UPDATE)");
  assert.equal((await upd(R, p.path, `name = '${R}/notas-fiscais/${p.id}/movido.xml'`)).length, 0, "registrado: não se move");
  assert.equal((await del(R, p.path)).length, 0, "registrado: não se apaga direto"); assert.equal((await del(F, p.path)).length, 0, "nem pela Fernanda");
  assert.equal(await existe(p.path), 1);
  /* outra casa não mexe em nada (nem no que não está registrado) */
  const livre2 = `${R}/notas-fiscais/${uuid(252)}/livre2.xml`; await ins(R, livre2);
  assert.equal((await upd(X, livre2)).length, 0); assert.equal((await del(X, livre2)).length, 0); assert.equal((await del(X, p.path)).length, 0);
  /* fora de notas-fiscais nada mudou: Compras segue livre */
  await ins(R, compras); assert.equal((await upd(R, compras)).length, 1); assert.equal((await del(R, compras)).length, 1);
  /* para remover o registrado: excluir a nota e só então o arquivo */
  await como(db, R, "delete from public.notas_fiscais where id = $1", [p.id]);
  assert.equal((await del(R, p.path)).length, 1, "sem registro, o arquivo pode ser removido"); assert.equal(await existe(p.path), 0);
  await db.close();
});
