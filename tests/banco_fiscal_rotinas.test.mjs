// Central Fiscal · correção definitiva (migration 060) contra o Postgres de verdade (PGlite) com 034 + 037 + 038 + 039 + 059 + 060.
// Prova: retomada AUTOMÁTICA da entrada no Mercado (intervalo crescente, sem nova confirmação, sem duplicar); reconciliação de notas antigas (liga à compra que já existe, sem criar compra nem inventar confirmação);
// validação fiscal oficial: a situação só muda com EVIDÊNCIA (autorizada: cStat 100/150 + protocolo; cancelada; denegada), indisponível/erro/inválido/inexistente nunca mudam nada; histórico e compras não duplicam;
// só o service_role executa; a confiança mínima de 60% também vale no banco; a chave do QR Code fica gravada na nota e na compra. Dados fictícios; sem rede e sem IA.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const P59 = "supabase/059_central_fiscal_entrada_unica.sql", P60 = "supabase/060_central_fiscal_rotinas.sql";

let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite: pula */ }
const pular = !PGlite && !process.env.CI;
const R = "11111111-1111-4111-8111-111111111111", F = "22222222-2222-4222-8222-222222222222", X = "33333333-3333-4333-8333-333333333333";
const trecho = (arq, ini, fim) => { const t = ler(arq), i = t.indexOf(ini); assert.ok(i >= 0, ini); return t.slice(i, t.indexOf(fim, i) + fim.length); };

// ---------- o banco de teste ----------
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
  for (const a of ["025_compras_online", "026_compras_emails", "030_compras_multiorigem", "031_compras_reembolsos", "032_central_fiscal", "033_seguranca_compras_fiscal", "034_notas_fiscais_gravacao", "037_notas_fiscais_foto_pdf", "038_seguranca_estado_tentativas", "039_nota_foto_sem_chave"]) await db.exec(ler(`supabase/${a}.sql`));
  await db.exec("drop table public.notas cascade;");
  await db.exec(ler("supabase/schema.sql").split("\n").slice(8, 64).join("\n"));        // as tabelas reais do Mercado: mercados, produtos, notas, itens
  for (const t of ["mercados", "produtos", "notas", "itens"]) await db.exec(`alter table public.${t} enable row level security; create policy "casa" on public.${t} for all to authenticated using (user_id = public.dono_da_casa()) with check (user_id = public.dono_da_casa());
    create policy "mfa" on public.${t} as restrictive for all to authenticated using ((select public.rac_aal_ok())) with check ((select public.rac_aal_ok()));`);
  await db.exec(ler(P59));
  await db.exec(`create schema cron; create table cron.job (jobname text, schedule text, command text);
    create function cron.schedule(n text, s text, c text) returns bigint language sql as $$ insert into cron.job values (n, s, c) returning 1::bigint $$;
    create function cron.unschedule(n text) returns boolean language sql as $$ delete from cron.job where jobname = n returning true $$;`);
  await db.exec(ler(P60)); await db.exec(ler(P60));    // idempotente
  return db;
}
async function como(db, uid, sql, params = [], aal = "aal1") {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, role: "authenticated", aal })]);
  await db.exec(uid ? "set role authenticated" : "set role anon");
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); }
}
const execAdmin = async (db, sql) => { await db.query("select set_config('request.jwt.claims', '', false)"); await db.exec("reset role"); await db.exec(sql); };
async function admin(db, sql, params = []) { await db.query("select set_config('request.jwt.claims', '', false)"); await db.exec("reset role"); return (await db.query(sql, params)).rows; }
const falha = async (p, rot = "") => { try { await p; } catch (e) { return e; } assert.fail("era para dar erro " + rot); };
const contar = async (db, t, onde = "true") => +(await admin(db, `select count(*)::int as n from public.${t} where ${onde}`))[0].n;

// ---------- foto/PDF: o caminho do site (leitura da IA → nfNormalizar → nfParaGravarDoc) ----------
const CNPJ = "11222333000181";
const uuid = (n) => "5f1c2d3e-4a5b-4c6d-8e7f-" + String(n).padStart(12, "0");
const idem = (n) => "9a9a9a9a-0000-4000-8000-" + String(n).padStart(12, "0");
const chaveDe = (n, tp = "1") => { const b = "31" + "2611" + CNPJ + "65" + "001" + String(n).padStart(9, "0") + tp + "12345678"; return b + N.nfDvChave(b); };
let seqArquivo = 0;
const arquivo = (ext = "jpg", tamanho = 3000) => {
  let bytes, sha256;
  do { bytes = Buffer.alloc(tamanho, "arquivo-entrada-" + (++seqArquivo)); sha256 = createHash("sha256").update(bytes).digest("hex"); } while (/\d{11}/.test(sha256));
  return { nome: "nota." + ext, ext, bytes, sha256, tamanho, mime: ext === "pdf" ? "application/pdf" : "image/jpeg" };
};
const resposta = (n, o = {}) => ({ modelo: "65", emitente_nome: "MERCADO EXEMPLO LTDA", emitente_cnpj: CNPJ, emitente_uf: "MG", numero: String(n), serie: "1", chave: chaveDe(n), data_emissao: "2026-11-06", protocolo: "131260000000001",
  situacao: "autorizada", total_produtos: 25.5, descontos: null, frete: null, outras: null, impostos: null, total: 25.5, valor_pago: 25.5, componentes: {}, pagamentos: [],
  itens: [{ descricao: "ITEM A", codigo: null, qtd: 2, unidade: "UN", unitario: 10, total: 20, desconto: 0, incerto: false }, { descricao: "ITEM B", codigo: null, qtd: 1, unidade: "UN", unitario: 5.5, total: 5.5, desconto: 0, incerto: false }],
  confianca: 0.96, incertos: [], ...o });
function pelo_site(n, o = {}) {
  const ia = N.nfLerIA(resposta(n, o.res), "imagem"), nota = N.nfNormalizar(ia.lido), id = o.id || uuid(n), arqs = o.arqs || [arquivo("jpg")];
  const g = N.nfParaGravarDoc(ia.lido, nota, { id, dono: R, idem: o.idem || idem(n), tipo: "imagem", arquivos: arqs.map((a) => ({ nome: a.nome, mime: a.mime, tamanho: a.tamanho, sha256: a.sha256 })), confianca: o.confianca ?? ia.confianca, revisada: !!o.revisada, incertos: ia.incertos, modelo_ia: "claude-sonnet-5-5", ia_uso_id: null });
  assert.equal(g.ok, true, (g.erros || []).join("|"));
  return { id, nota, g, args: g.args };
}
const noCofre = (db, p, meta) => admin(db, "insert into storage.objects (bucket_id, name, metadata) values ('familia', $1, $2::jsonb)", [p, JSON.stringify(meta)]);
const subir = async (db, p) => { for (const d of p.args.p_docs) await noCofre(db, d.path, { size: d.tamanho, mimetype: d.mime }); return p; };
/* o que o site manda como decisão: correspondência calculada pelo núcleo com os produtos e mercados que o banco tem */
async function decidir(db, nota) {
  const prods = await admin(db, "select id, nome, categoria, unidade from public.produtos"), mercs = await admin(db, "select id, nome, cnpj from public.mercados"), ap = {};
  (await admin(db, "select descricao, produto_id from public.itens where produto_id is not null")).forEach((x) => { ap[N.mkChave(x.descricao)] = x.produto_id; });
  return N.nfEntradaPayload(N.nfEntradaDecisoes(nota, prods, mercs, ap));
}
const confirmar = (db, uid, p, dec, aal) => como(db, uid, "select public.nota_fiscal_confirmar('doc', $1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb, false, $5::jsonb) as r",
  [JSON.stringify(p.args.p_nota), JSON.stringify(p.args.p_itens), JSON.stringify(p.args.p_docs), JSON.stringify(p.args.p_proc), JSON.stringify(dec)], aal).then((l) => l[0].r);
/* o fluxo completo do site: sobe o arquivo, decide, confirma */
async function fluxo(db, n, o = {}) { const p = await subir(db, pelo_site(n, o)); const dec = o.dec || await decidir(db, p.nota); return { ...p, dec, r: await confirmar(db, o.uid || R, p, dec, o.aal) }; }
const entrar = (db, uid, id, concordo, dec, aal) => como(db, uid, "select public.nota_fiscal_entrada_mercado($1, $2, $3::jsonb) as r", [id, concordo ?? false, dec ? JSON.stringify(dec) : null], aal).then((l) => l[0].r);
const entradaDe = async (db, id) => (await admin(db, "select * from public.notas_fiscais_entradas where nota_id = $1", [id]))[0];
const semDespesa = async (db) => assert.equal(await contar(db, "registros") + await contar(db, "pedidos") + await contar(db, "compras_online"), 0, "nenhuma despesa");


/* o service_role (a Edge Function e o cron): só ele executa as funções da rotina */
async function servico(db, sql, params = []) { await db.query("select set_config('request.jwt.claims', '', false)"); await db.exec("set role service_role"); try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); } }
const pendentes = (db, lim = 50) => servico(db, "select public.nf_validacao_pendentes($1) as r", [lim]).then((l) => l[0].r);
const registrar = (db, id, r) => servico(db, "select public.nf_validacao_registrar($1, $2::jsonb) as r", [id, JSON.stringify(r)]).then((l) => l[0].r);
const retomar = (db, lim = 20) => servico(db, "select public.nf_entradas_retomar($1) as r", [lim]).then((l) => l[0].r);
const reconciliar = (db) => servico(db, "select public.nf_entradas_reconciliar() as r").then((l) => l[0].r);
const oficial = (nota, o = {}) => ({ resultado: "autorizada", origem: "sefaz_ws", chave: nota.nota.chave, cstat: 100, protocolo: "131260000000777", evidencia: "SEFAZ consulta protocolo · cStat 100 · autorizado o uso", ...o });
const sit = async (db, id) => (await admin(db, "select situacao, protocolo, denegada from public.notas_fiscais where id = $1", [id]))[0];
const hist = (db, id) => admin(db, "select de, para, protocolo, origem, fonte from public.notas_fiscais_situacoes where nota_id = $1 order by criado_em, id", [id]);
const vencer = (db) => execAdmin(db, "update public.notas_fiscais_consultas set proxima_em = now() - interval '1 minute' where not encerrada; update public.notas_fiscais_entradas set proxima_em = now() - interval '1 minute' where estado in ('falhou','pendente')");

/* notas com data RELATIVA a hoje (a regra dos 30 dias não pode virar bomba-relógio): a chave leva o mês da data */
const iso = (dias = 0) => new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
const chaveEm = (n, dias = 0, tp = "1") => { const d = iso(dias), b = "31" + d.slice(2, 4) + d.slice(5, 7) + CNPJ + "65" + "001" + String(n).padStart(9, "0") + tp + "12345678"; return b + N.nfDvChave(b); };
async function criar(db, n, o = {}) {      // grava E confirma (a compra entra no Mercado), com a situação pedida
  const dias = o.dias ?? 0, sem = o.semChave, contingencia = o.situacao === "contingencia", pend = o.situacao === "pendente" || contingencia;
  const res = { numero: String(n), data_emissao: iso(dias), chave: sem ? null : chaveEm(n, dias, contingencia ? "2" : "1"), situacao: o.situacao || "autorizada", protocolo: pend ? null : "131260000000001" };
  const f = await fluxo(db, n, { res, confianca: o.confianca, revisada: true }); assert.equal(f.r.entrada.estado, "concluida", JSON.stringify(f.r)); return { ...f, chave: res.chave };
}
async function legado(db, n, o = {}) {      // gravada SÓ pela função antiga (sem confirmação, sem compra): como as notas de antes da confirmação única
  const dias = o.dias ?? 0, pend = o.situacao === "pendente", res = { numero: String(n), data_emissao: iso(dias), chave: chaveEm(n, dias), situacao: o.situacao || "autorizada", protocolo: pend ? null : "131260000000001" };
  const p = await subir(db, pelo_site(n, { res, revisada: true })); await como(db, R, "select public.nota_fiscal_salvar_doc($1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb) as r", [JSON.stringify(p.args.p_nota), JSON.stringify(p.args.p_itens), JSON.stringify(p.args.p_docs), JSON.stringify(p.args.p_proc)]); return { ...p, chave: res.chave };
}
const nCompras = (db) => contar(db, "notas");

test("060: proposta idempotente, só soma (não altera a 059), funções de rotina só para o service_role, definer com search_path vazio, sem despesa, sem CPF", () => {
  const s = ler(P60), sem = s.replace(/^--.*$/gm, "");
  assert.match(s.split("\n")[0], /^-- status: pendente/); assert.match(s.slice(0, 400), /PROPOSTA 060 · NÃO APLICADA EM PRODUÇÃO/); assert.match(sem, /begin;[\s\S]*commit;/);
  for (const f of ["nf_entradas_retomar(integer)", "nf_entradas_reconciliar()", "nf_rotina_fiscal_sql()", "nf_validacao_pendentes(integer)", "nf_validacao_registrar(uuid, jsonb)"]) {
    assert.ok(sem.includes(`revoke all on function public.${f} from public, anon, authenticated;`), f + " sem acesso de quem entra"); assert.ok(sem.includes(`grant execute on function public.${f} to service_role;`), f + " só service_role");
  }
  for (const f of ["nf_entrada_processar", "nota_fiscal_confirmar", "nf_entradas_retomar", "nf_entradas_reconciliar", "nf_rotina_fiscal_sql", "nf_validacao_pendentes", "nf_validacao_registrar"]) { const m = new RegExp("create or replace function public\\." + f + "\\([\\s\\S]*?\\$\\$;?", "").exec(sem); assert.ok(m, f); assert.match(m[0], /security definer set search_path = ''/, f); }
  assert.ok(!/drop table|delete from|truncate|drop function public\.nota_fiscal_(salvar|confirmar|entrada)|insert into public\.(registros|pedidos|compras_online)|gera_despesa\s*=\s*true|'conferencia', true/i.test(sem.replace(/drop function public\.nf_validacao[^;]*;/g, "")), "nada destrutivo, nada de despesa");
  assert.match(sem, /revoke all on public\.notas_fiscais_consultas from anon, authenticated;[\s\S]*grant select on public\.notas_fiscais_consultas to authenticated;/); assert.match(sem, /insert into public\.seguranca_catalogo[\s\S]*'notas_fiscais_consultas'/); assert.match(sem, /'consulta_oficial'/);
  assert.ok(!/create or replace function public\.nf_mercado_lancar|create or replace function public\.nota_fiscal_entrada_mercado/.test(sem), "o lançamento e a recuperação manual da 059 ficam como estão");
  const conf = ler("supabase/conferencias/060_conferir_producao.sql"), diag = ler("supabase/conferencias/060_diagnostico_notas.sql");
  for (const c of [conf, diag]) assert.ok(!/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate)\b/i.test(c.replace(/^--.*$/gm, "")), "conferência e diagnóstico são só leitura");
});
test("PGlite · entrada automática: a falha do Mercado é retomada SOZINHA com intervalo crescente (1 h, 6 h…), pelas decisões já guardadas, sem nova leitura nem confirmação, sem duplicar; depois de 6 falhas fica o botão; nota cancelada não é retomada", { skip: pular }, async () => {
  const db = await banco();
  await admin(db, `insert into public.mercados (user_id, nome, cnpj) values ('${R}', 'Mercado Exemplo', '${CNPJ}')`); const m = (await admin(db, "select id from public.mercados limit 1"))[0].id;
  await admin(db, `insert into public.notas (user_id, mercado_id, data, numero, total, fonte) values ('${R}', '${m}', '${iso(0)}', '70', 1, 'manual')`);
  const f = await criar(db, 70).catch(() => null); assert.equal(f, null, "a entrada falha de propósito (compra manual com o mesmo número, data e mercado)");
  const nota = (await admin(db, "select id from public.notas_fiscais where numero = '70'"))[0].id, en = await entradaDe(db, nota);
  assert.deepEqual([en.estado, en.tentativas], ["falhou", 1]); assert.ok((await admin(db, "select proxima_em > now() + interval '50 minutes' and proxima_em < now() + interval '70 minutes' as ok from public.notas_fiscais_entradas where nota_id = $1", [nota]))[0].ok, "1ª nova tentativa em ~1 h");
  assert.deepEqual(await retomar(db), { tentadas: 0, concluidas: 0, falhas: 0 }, "antes do vencimento a rotina não mexe");
  await vencer(db); assert.deepEqual(await retomar(db), { tentadas: 1, concluidas: 0, falhas: 1 }); const e2 = await entradaDe(db, nota);
  assert.deepEqual([e2.tentativas, e2.confirmado_por, e2.confirmado_em.toISOString(), e2.id], [2, R, en.confirmado_em.toISOString(), en.id], "a confirmação original não muda"); assert.ok((await admin(db, "select proxima_em > now() + interval '5 hours' and proxima_em < now() + interval '7 hours' as ok from public.notas_fiscais_entradas where nota_id = $1", [nota]))[0].ok, "depois, ~6 h");
  assert.equal(await contar(db, "itens"), 0, "nada pela metade");
  await admin(db, "delete from public.notas where numero = '70'"); await vencer(db);
  assert.deepEqual(await retomar(db), { tentadas: 1, concluidas: 1, falhas: 0 }); const e3 = await entradaDe(db, nota);
  assert.deepEqual([e3.estado, e3.tentativas, e3.erro, e3.proxima_em, e3.confirmado_por, e3.confirmado_em.toISOString()], ["concluida", 3, null, null, R, en.confirmado_em.toISOString()]);
  assert.equal(await nCompras(db), 1); assert.equal(await contar(db, "itens"), 2); assert.equal(await contar(db, "notas_fiscais_vinculos"), 1); assert.equal(await contar(db, "notas_fiscais", "numero = '70'"), 1, "nenhuma leitura nova");
  await vencer(db); assert.deepEqual(await retomar(db), { tentadas: 0, concluidas: 0, falhas: 0 }, "repetir não faz nada nem duplica"); await semDespesa(db);
  /* depois de 6 falhas: a rotina para e fica o botão (que continua funcionando) */
  await admin(db, `insert into public.notas (user_id, mercado_id, data, numero, total, fonte) values ('${R}', '${m}', '${iso(0)}', '71', 1, 'manual')`); await criar(db, 71).catch(() => null);
  const n71 = (await admin(db, "select id from public.notas_fiscais where numero = '71'"))[0].id; for (let i = 0; i < 5; i++) { await vencer(db); await retomar(db); }
  const e71 = await entradaDe(db, n71); assert.deepEqual([e71.estado, e71.tentativas, e71.proxima_em], ["falhou", 6, null]); await vencer(db); assert.equal((await retomar(db)).tentadas, 0, "limite de tentativas automáticas");
  await admin(db, "delete from public.notas where numero = '71'"); const botao = await entrar(db, R, n71); assert.equal(botao.entrada.estado, "concluida", "o botão 'Tentar de novo' continua valendo"); assert.equal((await entradaDe(db, n71)).confirmado_por, R);
  /* nota cancelada depois da confirmação: não é retomada */
  await admin(db, `insert into public.notas (user_id, mercado_id, data, numero, total, fonte) values ('${R}', '${m}', '${iso(0)}', '72', 1, 'manual')`); await criar(db, 72).catch(() => null);
  const n72 = (await admin(db, "select id from public.notas_fiscais where numero = '72'"))[0].id; await admin(db, "update public.notas_fiscais set situacao = 'cancelada' where id = $1", [n72]); await admin(db, "delete from public.notas where numero = '72'"); await vencer(db);
  assert.equal((await retomar(db)).tentadas, 0, "cancelada não entra no Mercado"); await db.close();
});
test("PGlite · notas antigas: a reconciliação liga a nota à compra que JÁ existe (mesma chave), sem criar compra, sem inventar confirmação e sem apagar nada; entrada 'pendente' parada é retomada; rodar de novo não duplica", { skip: pular }, async () => {
  const db = await banco();
  const novaConf = await criar(db, 80);                                            // já confirmada (não pode mudar)
  const antes = JSON.stringify(await entradaDe(db, novaConf.id)); const comprasAntes = await nCompras(db);
  const l1 = await legado(db, 81), l2 = await legado(db, 82), l3 = await legado(db, 83), l4 = await legado(db, 84);
  /* a compra da l1 já existe no Mercado (entrada manual pela tela do Mercado, com a MESMA chave); a da l3 também, mas a nota foi cancelada */
  const merc = (await admin(db, "select id from public.mercados limit 1"))[0].id;
  for (const k of [l1.chave, l3.chave]) await admin(db, `insert into public.notas (user_id, mercado_id, data, total, chave_nfce, fonte) values ('${R}', '${merc}', '${iso(0)}', 25.5, '${k}', 'foto')`);
  await admin(db, "update public.notas_fiscais set situacao = 'cancelada' where id = $1", [l3.id]);
  /* l4: entrada 'pendente' esquecida há horas */
  await admin(db, `insert into public.notas_fiscais_entradas (user_id, nota_id, confirmado_por, confirmado_em, estado, decisoes, atualizado_em) values ('${R}', '${l4.id}', '${R}', now(), 'pendente', '{"itens":[]}'::jsonb, now() - interval '3 hours')`);
  const compras = await nCompras(db), itens = await contar(db, "itens"), prods = await contar(db, "produtos");
  const r = await reconciliar(db); assert.deepEqual([r.vinculos_criados, r.entradas_reconciliadas, r.pendentes_destravadas], [1, 1, 1], JSON.stringify(r));
  const e1 = await entradaDe(db, l1.id); assert.deepEqual([e1.estado, e1.origem, e1.confirmado_por, e1.confirmado_em, e1.tentativas], ["ja_no_mercado", "reconciliacao", null, null, 0], "sem confirmação inventada"); assert.ok(e1.mercado_nota_id);
  assert.equal((await admin(db, "select gera_despesa as g, valido as v from public.notas_fiscais_vinculos where nota_id = $1", [l1.id]))[0].g, false);
  assert.equal(await entradaDe(db, l2.id), undefined, "nota antiga SEM compra continua sem entrada (precisa do 'Estou de acordo')"); assert.equal(await entradaDe(db, l3.id), undefined, "cancelada não é reconciliada");
  assert.equal(await nCompras(db), compras, "nenhuma compra criada"); assert.equal(await contar(db, "itens"), itens); assert.equal(await contar(db, "produtos"), prods); assert.equal(JSON.stringify(await entradaDe(db, novaConf.id)), antes, "a confirmação anterior não foi tocada");
  assert.equal((await entradaDe(db, l4.id)).estado, "falhou"); assert.deepEqual(await reconciliar(db), { vinculos_criados: 0, entradas_reconciliadas: 0, ponteiros_completados: 0, pendentes_destravadas: 0 }, "rodar de novo não duplica");
  const rr = await retomar(db); assert.deepEqual([rr.tentadas, rr.concluidas], [1, 1], "a entrada parada é retomada"); assert.equal((await entradaDe(db, l4.id)).estado, "concluida"); assert.equal(await nCompras(db), compras + 1, "só a compra da l4, que não existia"); assert.equal(comprasAntes + 3 - 0 >= 0, true);
  assert.equal(await contar(db, "notas_fiscais"), 5); await semDespesa(db); await db.close();
});
test("PGlite · validação fiscal automática: a situação só muda com EVIDÊNCIA oficial; histórico, vínculo e compra preservados; cancelamento posterior marca a compra para revisão; reprocessar não duplica nada", { skip: pular }, async () => {
  const db = await banco();
  const n1 = await criar(db, 90, { situacao: "pendente" }), n2 = await criar(db, 91, { situacao: "contingencia" }), n3 = await criar(db, 92), n4 = await criar(db, 93, { dias: 45 }), n5 = await criar(db, 94, { situacao: "pendente", semChave: true }), l8 = await legado(db, 95, { situacao: "pendente" });
  const compras = await nCompras(db), p0 = await pendentes(db);
  assert.deepEqual(p0.map((x) => x.nota_id).sort(), [n1.id, n2.id, n3.id, l8.id].sort(), "pendente, contingência, autorizada recente e a nota antiga pendente; NÃO a autorizada de 45 dias nem a sem chave");
  assert.ok(p0.every((x) => /^\d{44}$/.test(x.chave) && x.uf_codigo === "31" && ["55", "65"].includes(x.modelo)));
  /* sem resultado (ainda processando / não encontrada): nada muda; volta com intervalo crescente */
  for (const [i, r] of [["pendente", 1], ["nao_encontrada", 1], ["erro", 2], ["pendente", 4], ["pendente", 7]].map((x, i) => [i, x])) {
    const x = await registrar(db, n1.id, { resultado: r[0], origem: "sefaz_ws", chave: n1.chave, cstat: r[0] === "nao_encontrada" ? 217 : null, motivo: "sem conclusão" }); assert.equal(x.mudou, false); assert.equal(x.situacao, "pendente"); assert.equal(x.encerrada, false);
    const dias = (await admin(db, "select round(extract(epoch from (proxima_em - consultado_em)) / 86400)::int as d from public.notas_fiscais_consultas where nota_id = $1 order by consultado_em desc, tentativa desc limit 1", [n1.id]))[0].d; assert.equal(dias, [1, 1, 2, 4, 7][i], "intervalo da tentativa " + (i + 1)); void r;
  }
  assert.equal((await sit(db, n1.id)).situacao, "pendente"); assert.equal(await contar(db, "notas_fiscais_situacoes", `nota_id = '${n1.id}'`), 1, "só o histórico da gravação"); assert.ok(!(await pendentes(db)).some((x) => x.nota_id === n1.id), "ainda não venceu");
  /* serviço indisponível (sem acesso oficial): registra e espera 7 dias; nunca vira autorização */
  const ind = await registrar(db, n2.id, { resultado: "indisponivel", origem: "indisponivel", motivo: "sem credencial oficial" }); assert.deepEqual([ind.mudou, ind.situacao], [false, "contingencia"]); assert.equal((await admin(db, "select round(extract(epoch from (proxima_em - consultado_em)) / 86400)::int as d from public.notas_fiscais_consultas where nota_id = $1", [n2.id]))[0].d, 7);
  /* autorização com evidência: pendente e contingência passam a autorizada, com protocolo, histórico e fonte */
  const a1 = await registrar(db, n1.id, oficial(n1)); assert.deepEqual([a1.mudou, a1.situacao, a1.encerrada], [true, "autorizada", false]); const s1 = await sit(db, n1.id); assert.deepEqual([s1.situacao, s1.protocolo], ["autorizada", "131260000000777"]);
  assert.deepEqual((await hist(db, n1.id)).map((h) => [h.de, h.para, h.origem, h.fonte, h.protocolo]), [[null, "pendente", "gravacao", "foto", null], ["pendente", "autorizada", "atualizacao", "consulta_oficial", "131260000000777"]]);
  const a2 = await registrar(db, n2.id, oficial(n2, { protocolo: "131260000000778" })); assert.deepEqual([a2.mudou, a2.situacao], [true, "autorizada"]); assert.equal((await hist(db, n2.id)).at(-1).de, "contingencia");
  const rep = await registrar(db, n1.id, oficial(n1)); assert.equal(rep.mudou, false, "repetir a mesma autorização não muda nada"); assert.equal(await contar(db, "notas_fiscais_situacoes", `nota_id = '${n1.id}'`), 2, "histórico não duplica");
  /* a compra e a confirmação não mudam com a situação fiscal; nenhuma despesa */
  assert.equal(await nCompras(db), compras); assert.equal((await entradaDe(db, n1.id)).estado, "concluida"); assert.equal((await entradaDe(db, n1.id)).revisar, null); await semDespesa(db);
  /* cancelamento posterior: situação cancelada, compra mantida e marcada para revisão, vínculo fiscal invalidado, consulta encerrada */
  const c3 = await registrar(db, n3.id, { resultado: "cancelada", origem: "sefaz_ws", chave: n3.chave, cstat: 101, evidencia: "SEFAZ consulta protocolo · cStat 101 · cancelamento homologado" });
  assert.deepEqual([c3.mudou, c3.situacao, c3.encerrada, c3.proxima_em], [true, "cancelada", true, null]); const e3 = await entradaDe(db, n3.id); assert.deepEqual([e3.estado, e3.revisar], ["concluida", "nota_cancelada"]);
  assert.equal(await nCompras(db), compras, "a compra foi mantida"); assert.match((await admin(db, "select observacao as o from public.notas where id = $1", [e3.mercado_nota_id]))[0].o, /REVISAR: a nota fiscal foi cancelada/); assert.equal((await admin(db, "select valido as v from public.notas_fiscais_vinculos where nota_id = $1", [n3.id]))[0].v, false);
  assert.deepEqual((await hist(db, n3.id)).at(-1), { de: "autorizada", para: "cancelada", protocolo: "131260000000001", origem: "cancelamento", fonte: "consulta_oficial" });
  /* denegada = rejeitada (cStat 110/301/302/303) */
  const n6 = await criar(db, 96, { situacao: "pendente" }); const d6 = await registrar(db, n6.id, { resultado: "denegada", origem: "sefaz_ws", chave: n6.chave, cstat: 302, evidencia: "SEFAZ consulta protocolo · cStat 302 · uso denegado" });
  assert.deepEqual([d6.mudou, d6.situacao, d6.encerrada], [true, "rejeitada", true]); assert.equal((await sit(db, n6.id)).denegada, true);
  /* o que NUNCA muda a situação: autorização sem evidência completa, de outra chave, sem origem oficial, cStat errado… (vira 'invalida' e é reagendada) */
  const n7 = await criar(db, 97, { situacao: "pendente" }), ruins = [oficial(n7, { protocolo: null }), oficial(n7, { cstat: 217 }), oficial(n7, { chave: chaveEm(999) }), oficial(n7, { origem: "indisponivel" }), oficial(n7, { evidencia: null }), oficial(n7, { cstat: 101 }) && { resultado: "cancelada", origem: "sefaz_ws", chave: n7.chave, cstat: 100, evidencia: "x" }, { resultado: "denegada", origem: "sefaz_ws", chave: n7.chave, cstat: 100, evidencia: "x" }];
  for (const x of ruins) { const r = await registrar(db, n7.id, x); assert.deepEqual([r.resultado, r.mudou, r.situacao], ["invalida", false, "pendente"], JSON.stringify(x)); }
  assert.deepEqual([(await sit(db, n7.id)).situacao, (await sit(db, n7.id)).protocolo], ["pendente", null]); assert.equal(await contar(db, "notas_fiscais_situacoes", `nota_id = '${n7.id}'`), 1, "nenhuma mudança no histórico");
  for (const x of [{ resultado: "ok" }, { resultado: "autorizada", origem: "xpto" }, { resultado: "autorizada", origem: "sefaz_ws", cstat: "abc" }, { resultado: "pendente", origem: "sefaz_ws", protocolo: "123" }, null]) assert.ok((await falha(registrar(db, n7.id, x))).message, JSON.stringify(x));
  /* nota antiga pendente (sem confirmação, sem compra): é reprocessada e atualizada, sem criar compra nem confirmação */
  const comprasAntes8 = await nCompras(db); const r8 = await registrar(db, l8.id, oficial(l8)); assert.deepEqual([r8.mudou, r8.situacao], [true, "autorizada"]); assert.equal(await entradaDe(db, l8.id), undefined, "a validação fiscal não cria entrada"); assert.equal(await nCompras(db), comprasAntes8, "sem compra nova");
  /* encerramento: o que está resolvido não volta; sem resultado em 90 dias a consulta encerra com o motivo */
  const ids = (await pendentes(db)).map((x) => x.nota_id); for (const resolvida of [n3.id, n6.id]) assert.ok(!ids.includes(resolvida), "cancelada/rejeitada não é mais consultada");
  const n9 = await criar(db, 98, { situacao: "pendente" }); await execAdmin(db, `set session_replication_role = replica; update public.notas_fiscais set criado_em = now() - interval '100 days' where id = '${n9.id}'; set session_replication_role = origin`); const e9 = await registrar(db, n9.id, { resultado: "pendente", origem: "sefaz_ws", chave: n9.chave });
  assert.equal(e9.encerrada, true); assert.match((await admin(db, "select motivo as m from public.notas_fiscais_consultas where nota_id = $1", [n9.id]))[0].m, /90 dias/); assert.ok(!(await pendentes(db)).some((x) => x.nota_id === n9.id));
  assert.ok(!(await pendentes(db)).some((x) => x.nota_id === n5.id), "sem chave não há consulta possível"); assert.equal((await sit(db, n5.id)).situacao, "pendente", "e nada foi alterado");
  await vencer(db); const volta = (await pendentes(db)).map((x) => x.nota_id); assert.ok(volta.includes(n1.id) && volta.includes(n2.id), "autorizadas recentes seguem acompanhadas (cancelamento posterior)"); assert.ok(!volta.includes(n4.id), "autorizada de 45 dias: fora da janela");
  await semDespesa(db); await db.close();
});
test("PGlite · acesso: só o service_role executa as funções da rotina; a casa lê o registro das consultas, estranho não vê, ninguém escreve direto; MFA vale", { skip: pular }, async () => {
  const db = await banco(); const n = await criar(db, 100, { situacao: "pendente" }); await registrar(db, n.id, { resultado: "pendente", origem: "sefaz_ws", chave: n.chave });
  const chamadas = [["select public.nf_validacao_pendentes(5)", []], ["select public.nf_validacao_registrar($1, '{}'::jsonb)", [n.id]], ["select public.nf_entradas_retomar(5)", []], ["select public.nf_entradas_reconciliar()", []], ["select public.nf_rotina_fiscal_sql()", []]];
  for (const uid of [R, F, X, null]) for (const [sql, a] of chamadas) assert.ok((await falha(como(db, uid, sql, a, "aal2"), String(uid) + " " + sql)).message);
  for (const uid of [R, F]) assert.equal((await como(db, uid, "select count(*)::int as n from public.notas_fiscais_consultas"))[0].n, 1, "a casa lê"); assert.equal((await como(db, X, "select count(*)::int as n from public.notas_fiscais_consultas"))[0].n, 0);
  assert.ok((await falha(como(db, null, "select count(*) from public.notas_fiscais_consultas"), "anon")).message);
  for (const [sql, a] of [["insert into public.notas_fiscais_consultas (user_id, nota_id, origem, resultado) values ($1, $2, 'sefaz_ws', 'autorizada')", [R, n.id]], ["update public.notas_fiscais_consultas set resultado = 'autorizada'", []], ["delete from public.notas_fiscais_consultas", []]]) for (const uid of [R, F]) assert.ok((await falha(como(db, uid, sql, a), uid + " " + sql.slice(0, 30))).message);
  await admin(db, `insert into auth.mfa_factors values ('${R}', 'verified')`); assert.equal((await como(db, R, "select count(*)::int as n from public.notas_fiscais_consultas", [], "aal1"))[0].n, 0, "a trava mfa vale também para ler");
  await db.close();
});
test("PGlite · confiança mínima de 60% também no banco; chave do QR Code recuperada fica gravada na nota e na compra e vira duplicidade por chave; sem chave a nota entra como pendente e a compra também", { skip: pular }, async () => {
  const db = await banco();
  for (const c of [0.59, 0.55, 0.3]) { const p = await subir(db, pelo_site(110, { revisada: true, confianca: c, id: uuid(110 + Math.round(c * 100)), idem: idem(110 + Math.round(c * 100)), arqs: [arquivo("jpg")] })); const e = await falha(confirmar(db, R, p, await decidir(db, p.nota))); assert.match(e.message, /confiança da leitura abaixo do mínimo de 60%/, String(c)); }
  assert.equal(await contar(db, "notas_fiscais"), 0, "nada gravado"); assert.equal(await contar(db, "notas_fiscais_tentativas"), 0);
  for (const [i, c] of [[111, 0.6], [112, 0.65], [113, 0.7], [114, 0.8]]) { const f = await fluxo(db, i, { revisada: true, confianca: c }); assert.equal(f.r.entrada.estado, "concluida", "confiança " + c); assert.equal(+(await admin(db, "select confianca as c from public.notas_fiscais_tentativas where nota_id = $1", [f.id]))[0].c, c); }
  /* QR Code: a IA não leu a chave; o QR dá a chave; ela entra na nota, na compra e na checagem de duplicidade */
  const K = chaveDe(120), url = "https://www.nfce.fazenda.sp.gov.br/qrcode?p=" + K + "|2|1|1|ABCDEF0123456789ABCDEF0123456789ABCDEF01";
  const pelo_qr = (n, id, idm) => { const ia = N.nfLerIA(resposta(n, { chave: null, protocolo: null, situacao: "pendente", numero: null, serie: null }), "imagem"), cq = N.nfQrConferir(ia.lido, N.nfQrChave(url)); assert.equal(cq.estado, "complementou"); const nota = N.nfNormalizar(cq.lido), arq = arquivo("jpg");
    const g = N.nfParaGravarDoc(cq.lido, nota, { id, dono: R, idem: idm, tipo: "imagem", arquivos: [{ nome: arq.nome, mime: arq.mime, tamanho: arq.tamanho, sha256: arq.sha256 }], confianca: 0.8, revisada: true, incertos: [], modelo_ia: "x", ia_uso_id: null }); assert.equal(g.ok, true, g.erros.join("|")); return { id, nota, g, args: g.args }; };
  const q = await subir(db, pelo_qr(120, uuid(120), idem(120))); const r = await confirmar(db, R, q, await decidir(db, q.nota)); assert.equal(r.entrada.estado, "concluida", JSON.stringify(r));
  const nf = (await admin(db, "select chave, situacao, protocolo, numero, serie from public.notas_fiscais where id = $1", [q.id]))[0]; assert.deepEqual([nf.chave, nf.situacao, nf.protocolo, nf.numero, nf.serie], [K, "pendente", null, "120", "1"], "chave do QR persistida; QR não vira autorização");
  assert.equal((await admin(db, "select chave_nfce as c from public.notas where id = $1", [r.entrada.mercado_nota_id]))[0].c, K, "a compra leva a chave");
  const q2 = await subir(db, pelo_qr(120, uuid(121), idem(121))); const r2 = await confirmar(db, R, q2, await decidir(db, q2.nota)); assert.deepEqual([r2.gravada, r2.fiscal.duplicada, r2.fiscal.motivo], [false, true, "chave"], "a mesma chave em outra foto é duplicidade"); assert.equal(await contar(db, "notas_fiscais", `chave = '${K}'`), 1);
  /* e a nota que a consulta oficial depois autoriza é a MESMA: a chave persistida é o que a rotina consulta */
  assert.ok((await pendentes(db)).some((x) => x.chave === K)); await db.close();
});
test("PGlite · agendamento: o job SQL 'fiscal-entradas' (a cada 6 h) é criado e não duplica; a rotina SQL devolve a reconciliação e a retomada", { skip: pular }, async () => {
  const db = await banco(); const jobs = await admin(db, "select jobname, schedule, command from cron.job"); assert.deepEqual(jobs.map((j) => [j.jobname, j.schedule]), [["fiscal-entradas", "10 */6 * * *"]]); assert.match(jobs[0].command, /nf_rotina_fiscal_sql/);
  const r = (await servico(db, "select public.nf_rotina_fiscal_sql() as r"))[0].r; assert.deepEqual(Object.keys(r).sort(), ["reconciliacao", "retomada"]); assert.deepEqual(r.retomada, { tentadas: 0, concluidas: 0, falhas: 0 }); await db.close();
});
