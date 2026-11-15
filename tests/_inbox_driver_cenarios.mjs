// Cenários compartilhados da persistência da sincronização do RAC Inbox (repositorio.ts + sessao.ts), rodados por tests/inbox_sync_driver.test.mjs em DUAS execuções:
//  (1) sobre o PGlite com um adaptador que EMULA o comportamento comprovado do postgres.js 3.4.4 (parâmetro jsonb passa por JSON.stringify): roda no CI;
//  (2) com o driver REAL postgres@3.4.4 contra um PostgreSQL real, quando RAC_POSTGRES_JS e RAC_PG_URL existem: é a prova que o PGlite sozinho não dá.
// Tudo fictício. Este arquivo não é um teste (não termina em .test.mjs).
import assert from "node:assert/strict";
import fs from "node:fs";

export const R = "11111111-1111-4111-8111-111111111111", F = "22222222-2222-4222-8222-222222222222", X = "33333333-3333-4333-8333-333333333333";
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const trecho = (arq, ini, fim) => { const t = ler(arq), i = t.indexOf(ini); assert.ok(i >= 0, ini); return t.slice(i, t.indexOf(fim, i) + fim.length); };

// Esquema mínimo do Supabase + as migrations reais (002 e 022 em trechos, 051 e 053 inteiras). `ddl(texto)` executa texto com vários comandos (sem parâmetros).
export async function prepararEsquema(ddl) {
  await ddl(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    create schema auth; grant usage on schema auth to anon, authenticated, service_role;
    create table auth.users (id uuid primary key); create table auth.mfa_factors (user_id uuid, status text);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub', '')::uuid $$;
    insert into auth.users values ('${R}'), ('${F}'), ('${X}');
    create schema storage; create table storage.buckets (id text primary key, name text, public boolean default false);`);
  await ddl(trecho("supabase/002_casa_compartilhada.sql", "create table if not exists public.membros", "grant execute on function public.dono_da_casa() to authenticated;"));
  await ddl(trecho("supabase/022_seguranca.sql", "create or replace function public.rac_aal_ok()", "grant execute on function public.rac_aal_ok() to authenticated;"));
  await ddl(`insert into public.membros (membro, dono) values ('${F}', '${R}');`);
  await ddl(ler("supabase/051_inbox_fundacao.sql")); await ddl(ler("supabase/053_inbox_cabecalhos.sql"));
}

const ASSUNTOS_DIFICEIS = ["Olá, \"aspas\" e \\ barra", "Linha 1\nlinha 2\ttab", "Emoji 😀 e acentuação çãõ", "{\"json\":\"dentro do assunto\"}", "$1 ' ; -- /* */ drop table x", "  espaços  "];
export const msg = (uid, extra = {}) => ({
  uid, recebida: "2026-11-14T10:" + String(Math.floor(uid / 60) % 60).padStart(2, "0") + ":" + String(uid % 60).padStart(2, "0") + ".000Z", tamanho: 1000 + uid, lida: false, sinalizada: false, respondida: false,
  de: { nome: "Ana \"A.\" Souza", endereco: "ana" + uid + "@exemplo.com" }, para: [{ nome: "Eu", endereco: "eu@icloud.com" }, { nome: "", endereco: "b@x.com" }],
  assunto: ASSUNTOS_DIFICEIS[uid % ASSUNTOS_DIFICEIS.length] + " #" + uid, message_id: "<m" + uid + "@x>", anexo_provavel: uid % 7 === 0, ...extra,
});
const sync = (uidvalidity, mensagens, extra = {}) => ({ uidvalidity, cursor: Math.max(...mensagens.map((m) => m.uid), 0) + 1, tipo: "primeira_leitura", total: mensagens.length, duracao_ms: 12, mensagens, purgar: false, removerDe: 1, removerAte: Math.max(...mensagens.map((m) => m.uid), 1), ...extra });
const n = (v) => Number(v);

// `repo` = criarRepositorio(sessaoPostgres(<adaptador do driver>)); `consulta(sql, params)` → linhas (só para conferir o resultado, por fora do repositório).
export async function rodarCenarios({ repo, consulta, ddl }) {
  const c = (await consulta("insert into public.inbox_contas (dono, provedor, apelido, endereco) values ($1, 'icloud', 'Pessoal', 'pessoa@icloud.example') returning id", [R]))[0].id;
  const [{ id: inbox }] = await repo.salvarPastas(R, c, [{ nome: "INBOX", nome_exibicao: "INBOX", uso: "entrada", selecionavel: true }]);
  const cache = async () => (await consulta("select uid, lida, sinalizada, assunto, id_externo, remetente_nome, remetente_endereco, destinatarios, recebida_em, anexo_provavel, message_id from public.inbox_mensagens_ref where pasta_id = $1 order by uid", [inbox]));
  const resumo = async () => ({ linhas: (await cache()).length, cursor: await repo.estadoSync(R, c, inbox) });

  // 1) PRIMEIRA SINCRONIZAÇÃO com volume real (a INBOX de produção tem 174 mensagens) e assuntos difíceis: o lote chega ao PostgreSQL como ARRAY jsonb, com o texto intacto
  const lote174 = Array.from({ length: 174 }, (_, i) => msg(i + 1, i % 5 === 0 ? { de: null } : {}));
  let r = await repo.aplicarSync(R, c, inbox, sync(700, lote174));
  assert.deepEqual(r, { novas: 174, atualizadas: 0, removidas: 0 }, "primeira sincronização: 174 inseridas");
  const linhas = await cache(); assert.equal(linhas.length, 174);
  for (const m of lote174) { const l = linhas.find((x) => n(x.uid) === m.uid); assert.equal(l.assunto, m.assunto, "assunto intacto (aspas, barra, quebra de linha, emoji, JSON e SQL dentro do texto): uid " + m.uid); assert.equal(l.id_externo, "700:" + m.uid); assert.equal(l.message_id, m.message_id); assert.equal(l.remetente_endereco, m.de ? m.de.endereco : null); assert.deepEqual(l.destinatarios, m.para, "destinatários: jsonb aninhado"); assert.equal(l.anexo_provavel, m.anexo_provavel); }
  assert.equal(new Date(linhas[0].recebida_em).toISOString(), lote174[0].recebida, "data preservada");
  assert.deepEqual(await repo.estadoSync(R, c, inbox), { uidvalidity: 700, uidnext: 175 }, "o cursor avança");
  let p = (await consulta("select total, nao_lidas from public.inbox_pastas where id = $1", [inbox]))[0]; assert.deepEqual([n(p.total), n(p.nao_lidas)], [174, 174], "total e não lidas da pasta");

  // 2) SINCRONIZAÇÃO REPETIDA, sem duplicar
  r = await repo.aplicarSync(R, c, inbox, sync(700, lote174, { tipo: "sem_mudanca" }));
  assert.deepEqual(r, { novas: 0, atualizadas: 174, removidas: 0 }); assert.equal((await cache()).length, 174, "sem duplicação");

  // 3) ATUALIZAÇÃO DE FLAGS
  const lote2 = lote174.map((m) => (m.uid <= 10 ? { ...m, lida: true, sinalizada: m.uid % 2 === 0 } : m));
  r = await repo.aplicarSync(R, c, inbox, sync(700, lote2, { tipo: "sem_mudanca" })); assert.deepEqual(r, { novas: 0, atualizadas: 174, removidas: 0 });
  const fl = await cache(); assert.equal(fl.filter((x) => x.lida).length, 10); assert.equal(fl.filter((x) => x.sinalizada).length, 5);
  p = (await consulta("select nao_lidas from public.inbox_pastas where id = $1", [inbox]))[0]; assert.equal(n(p.nao_lidas), 164, "não lidas recalculadas");

  // 4) REMOÇÃO no provedor (uids 3 e 4 sumiram) + uma nova (175); a janela cobre tudo
  const lote3 = [...lote2.filter((m) => m.uid !== 3 && m.uid !== 4), msg(175)];
  r = await repo.aplicarSync(R, c, inbox, sync(700, lote3, { tipo: "novas_mensagens" }));
  assert.deepEqual(r, { novas: 1, atualizadas: 172, removidas: 2 }); const ids = (await cache()).map((x) => n(x.uid)); assert.ok(!ids.includes(3) && !ids.includes(4) && ids.includes(175) && ids.length === 173);
  assert.deepEqual(await repo.estadoSync(R, c, inbox), { uidvalidity: 700, uidnext: 176 }, "cursor atualizado");

  // 5) janela parcial: o que é mais antigo que a faixa lida NÃO é apagado
  r = await repo.aplicarSync(R, c, inbox, sync(700, [msg(174), msg(175)], { removerDe: 174, tipo: "sem_mudanca" })); assert.deepEqual([r.novas, r.removidas], [0, 0]); assert.equal((await cache()).length, 173);

  // 6) ROLLBACK: um lote com um item que o banco recusa (assunto > 500) desfaz TUDO (inserções, remoções e cursor)
  const antes = await resumo();
  await assert.rejects(repo.aplicarSync(R, c, inbox, sync(700, [msg(200), msg(5, { assunto: "x".repeat(501) })], { removerDe: 1, removerAte: 300, tipo: "novas_mensagens" })), "o banco recusa o lote");
  assert.deepEqual(await resumo(), antes, "rollback: nada mudou (nem linhas, nem cursor)");
  assert.equal((await cache()).some((x) => n(x.uid) === 200), false);

  // 7) UIDVALIDITY mudou: apaga a pasta e relê
  r = await repo.aplicarSync(R, c, inbox, sync(800, [msg(1), msg(2), msg(3)], { purgar: true, tipo: "uidvalidity_mudou" }));
  assert.deepEqual(r, { novas: 3, atualizadas: 0, removidas: 0 }); assert.deepEqual((await cache()).map((x) => x.id_externo), ["800:1", "800:2", "800:3"]); assert.deepEqual(await repo.estadoSync(R, c, inbox), { uidvalidity: 800, uidnext: 4 });

  // 8) pasta vazia e lote vazio não passam pelo jsonb
  r = await repo.aplicarSync(R, c, inbox, { uidvalidity: 800, cursor: 4, tipo: "novas_mensagens", total: 0, duracao_ms: null, mensagens: [], purgar: false, removerDe: 1, removerAte: 3 });
  assert.deepEqual(r, { novas: 0, atualizadas: 0, removidas: 3 }); assert.equal((await cache()).length, 0);

  // 9) falha registrada e conta; travamento da conta
  await repo.falhaSync(R, c, inbox, "servico_indisponivel"); await repo.estadoConta(R, c, "conectada", null);
  const sy = (await consulta("select falhas_seguidas, erro from public.inbox_sincronizacao where pasta_id = $1", [inbox]))[0]; assert.deepEqual([n(sy.falhas_seguidas), sy.erro], [1, "servico_indisponivel"]);
  assert.equal(await repo.travar(c), true); await repo.destravar(c);
  // 10) dono errado não grava na conta de outro
  await assert.rejects(repo.aplicarSync(X, c, inbox, sync(800, [msg(9)])), "a chave composta (pasta, conta, dono) recusa");
  void ddl;
}
