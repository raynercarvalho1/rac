// Monitor de integrações, M3 e M4 · migration 067 contra o Postgres de verdade (PGlite): a tabela genérica sinais (incidentes com ciclo de vida), a view
// monitor_processos (security_invoker) e as funções do ciclo de incidentes. Prova:
//  · M3: a view lê só o que as políticas deixam (o dono vê o dele; a casa só a Central Fiscal; anon nada) e dá o MESMO estado que a tela (NUCLEO.monAvaliar)
//    nos mesmos dados, nos casos claros (a tela usa o horário do cron; o banco, a idade da última execução, e isso é dito na documentação);
//  · M4: um incidente por problema (atrasado vira falhou no MESMO registro), fecha sozinho na recuperação com o histórico preservado, desconhecido/indisponível
//    nunca abrem nem fecham, pendentes e pushes do dia (dia de Brasília), marcação sem repetir; só o service_role executa as funções; ninguém escreve direto.
// Tudo fictício, sem rede. Limitação: o PGlite prova o PostgreSQL (RLS, privilégios, checks), não o Supabase real (a conferência em produção é só leitura).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { N, ler, S67, S68, PGlite, pular, R, F, X, trecho, AGORA, MIN, H, iso, ha, P, banco, com, adm, falha, limpar, visao } from "./_monitor_banco.mjs";
const semComent = (t) => t.replace(/--.*$/gm, "");

test("no CI o PGlite está instalado: os testes de banco do Monitor não podem ser pulados", () => {
  if (process.env.CI) assert.ok(PGlite, "PGlite ausente no CI");
});

test("texto da 067: transação, reexecutável, sem segredo, view security_invoker, só o service_role executa o ciclo e ninguém grava em sinais pelo site", () => {
  const s = semComent(S67);
  assert.match(S67, /^-- 067 · Monitor de integrações, M3 e M4/); assert.match(s, /\bbegin;[\s\S]*\bcommit;/);
  assert.match(s, /create table if not exists public\.sinais/); assert.match(s, /create or replace view public\.monitor_processos with \(security_invoker = true\)/);
  assert.match(s, /create policy "mfa" on public\.sinais as restrictive/);
  assert.match(s, /revoke all on public\.sinais from anon, authenticated;\s*grant select on public\.sinais to authenticated;/);
  assert.match(s, /grant select, insert, update on public\.sinais to service_role;/, "a service_role precisa gravar (como garmin_ativ e garmin_rotas)");
  assert.doesNotMatch(s, /grant (insert|update|delete)[^;]*on public\.sinais to authenticated/);
  for (const f of ["monitor_sinais_sincronizar(uuid, jsonb, timestamptz)", "monitor_sinais_pendentes(uuid, timestamptz)", "monitor_sinais_marcar(uuid, uuid[], uuid, timestamptz)"]) assert.ok(S67.includes(f), f);
  assert.match(s, /revoke all on function public\.monitor_sinais_sincronizar[\s\S]*from public, anon, authenticated;/); assert.match(s, /to service_role;/);
  assert.ok(!/cron\.schedule|net\.http_post|vault\.|secret|service_role_key|eyJ/i.test(s.replace(/service_role/g, "")), "sem agendamento, chamada de rede nem segredo (a 068 agenda)");
  assert.ok(!/create or replace function public\.garmin|alter table public\.(rotina_log|newsletter_edicoes|radar_coletas|inbox_|notas_fiscais)/.test(s), "não altera nenhuma tabela existente");
  assert.match(s, /insert into public\.seguranca_catalogo[\s\S]*'sinais'/, "catálogo da auditoria (docs/seguranca.md)");
});

test("as colunas que a view lê existem nas migrations reais (as tabelas de teste são só cópias mínimas)", () => {
  const todas = fs.readdirSync(new URL("../supabase/", import.meta.url)).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort().map((f) => ler("supabase/" + f)).join("\n");
  const cols = { rotina_log: ["user_id", "quando", "ok"], newsletter_edicoes: ["dono", "criado_em", "atualizado_em"], inbox_contas: ["id", "dono", "sync_auto"],
    inbox_sincronizacao: ["dono", "conta_id", "ultima_ok_em", "ultima_tentativa_em", "falhas_seguidas", "duracao_ms", "erro"],
    radar_coletas: ["dono", "origem", "status", "iniciada_em", "terminada_em", "ofertas_lidas", "precos_gravados", "falhas"], notas_fiscais_entradas: ["user_id", "atualizado_em"] };
  for (const [t, l] of Object.entries(cols)) {
    const m = new RegExp(`create table (?:if not exists )?public\\.${t} \\(([\\s\\S]*?)\\n\\);`).exec(todas); assert.ok(m, t);
    for (const c of l) assert.ok(new RegExp(`(^|\\n)\\s*${c}\\s`).test(m[1]) || (t === "inbox_contas" && c === "sync_auto" && /add column if not exists sync_auto/.test(todas)), `${t}.${c}`);
  }
});


test("a tabela sinais: RLS só do dono (com a trava mfa), ninguém grava pelo site, um incidente aberto por entidade e o fechamento tem de ser coerente", { skip: pular }, async () => {
  const db = await banco();
  const ins = (extra = "") => adm(db, `insert into public.sinais (dono, tipo, area, origem, entidade, chave, severidade, porque ${extra ? "," + extra.split("|")[0] : ""}) values ('${R}', 'monitor.processo', 'sistema', 'monitor-alerta', 'rotina', 'k' || gen_random_uuid(), 'atencao', 'p' ${extra ? "," + extra.split("|")[1] : ""})`);
  await ins();
  const e1 = await falha(ins(), "um segundo incidente ABERTO da mesma entidade"); assert.equal(e1.code, "23505");
  const e2 = await falha(ins("estado, encerrado_em, encerramento|'fechado', null, null"), "fechado sem data de encerramento"); assert.equal(e2.code, "23514");
  const e3 = await falha(ins("estado, encerrado_em|'aberto', now()"), "aberto com data de encerramento"); assert.equal(e3.code, "23514");
  const e4 = await falha(ins("notificado_em|now()"), "avisado sem o lote do push"); assert.equal(e4.code, "23514");
  await ins("estado, encerrado_em, encerramento|'fechado', now(), 'recuperou'");   // o histórico fechado convive com um aberto
  assert.equal((await adm(db, "select count(*)::int n from public.sinais"))[0].n, 2);
  assert.equal((await com(db, R, "select count(*)::int n from public.sinais"))[0].n, 2, "o dono lê os dele");
  assert.equal((await com(db, F, "select count(*)::int n from public.sinais"))[0].n, 0, "a casa não vê sinais do dono");
  assert.equal((await com(db, X, "select count(*)::int n from public.sinais"))[0].n, 0, "ninguém vê o dos outros");
  assert.equal((await falha(com(db, null, "select * from public.sinais", [], "anon"), "anon")).code, "42501");
  for (const sql of ["insert into public.sinais (dono, tipo, area, origem, entidade, chave, severidade, porque) values (auth.uid(), 'monitor.processo', 'sistema', 'x', 'a', 'kkkkkkkk', 'info', 'p')",
    "update public.sinais set severidade = 'info'", "delete from public.sinais"]) assert.equal((await falha(com(db, R, sql), sql)).code, "42501", "o dono só lê: " + sql.slice(0, 20));
  assert.equal((await adm(db, "select polpermissive from pg_policy where polname = 'mfa' and polrelid = 'public.sinais'::regclass"))[0].polpermissive, false, "a trava mfa é restritiva");
  await db.close();
});

test("M3: a view monitor_processos é security_invoker, o dono vê os processos dele, a casa só a Central Fiscal, anon nada, e o service_role vê todos (filtrando por dono)", { skip: pular }, async () => {
  const db = await banco();
  assert.ok((await adm(db, "select reloptions from pg_class where relname = 'monitor_processos'"))[0].reloptions.includes("security_invoker=true"));
  await adm(db, `insert into public.rotina_log (user_id, quando, ok) values ('${R}', $1, true)`, [ha(120)]);
  await adm(db, `insert into public.newsletter_edicoes (dono, data, turno, atualizado_em) values ('${R}', '2026-11-26', 'manha', $1)`, [ha(180)]);
  await adm(db, `insert into public.notas_fiscais_entradas (user_id, atualizado_em) values ('${R}', $1)`, [ha(30)]);   // user_id = dono da casa (R)
  const dono = (await com(db, R, "select processo from public.monitor_processos order by 1")).map((r) => r.processo);
  assert.deepEqual(dono, ["fiscal_entradas", "newsletter", "rotina"]);
  assert.deepEqual((await com(db, F, "select processo from public.monitor_processos order by 1")).map((r) => r.processo), ["fiscal_entradas"], "a casa (Fernanda) só enxerga a Central Fiscal, como na política da tabela");
  assert.equal((await com(db, X, "select count(*)::int n from public.monitor_processos"))[0].n, 0);
  assert.equal((await falha(com(db, null, "select * from public.monitor_processos", [], "anon"))).code, "42501");
  assert.equal((await com(db, null, "select count(*)::int n from public.monitor_processos where dono = $1", [R], "service_role"))[0].n, 3);
  await db.close();
});

test("M3: a regra de cada processo no banco (rotina 25 h, newsletter 14 h, inbox 30 min, radar e fiscal nunca alertam) e as colunas do contrato", { skip: pular }, async () => {
  const db = await banco();
  /* rotina */
  await adm(db, `insert into public.rotina_log (user_id, quando, ok, resumo) values ('${R}', $1, true, '{}'), ('${R}', $2, false, '{}'), ('${R}', $3, true, '{}')`, [ha(26 * 60), ha(2 * 60), ha(50 * 60)]);
  let v = await visao(db);
  assert.equal(v.rotina.estado, "falhou"); assert.equal(v.rotina.motivo, "a última execução falhou"); assert.equal(v.rotina.alerta, true); assert.equal(v.rotina.falhas_7d, 1);
  assert.equal(+new Date(v.rotina.ultima_falha), AGORA - 2 * H); assert.equal(+new Date(v.rotina.ultimo_sucesso), AGORA - 26 * H); assert.equal(v.rotina.duracao_s, null, "a rotina não registra o início: sem duração");
  await limpar(db);
  await adm(db, `insert into public.rotina_log (user_id, quando, ok) values ('${R}', $1, true)`, [ha(25 * 60 + 1)]); v = await visao(db);
  assert.equal(v.rotina.estado, "atrasado"); assert.match(v.rotina.motivo, /mais de 25 h/); assert.equal(v.rotina.alerta, true);
  await adm(db, `update public.rotina_log set quando = $1`, [ha(25 * 60 - 1)]); assert.equal((await visao(db)).rotina.estado, "ok");
  /* newsletter */
  await adm(db, `insert into public.newsletter_edicoes (dono, data, turno, atualizado_em) values ('${R}', '2026-11-26', 'manha', $1)`, [ha(14 * 60 + 1)]); v = await visao(db);
  assert.equal(v.newsletter.estado, "atrasado"); assert.equal(v.newsletter.alerta, true); assert.equal(v.newsletter.falhas_7d, null, "tentativa sem edição não é registrada");
  await adm(db, `update public.newsletter_edicoes set atualizado_em = $1`, [ha(14 * 60 - 1)]); assert.equal((await visao(db)).newsletter.estado, "ok");
  /* inbox: rodada = linhas até 2 min da mais nova; duração somada; conta com sync_auto desligado não conta */
  const [a, b, c] = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "cccccccc-cccc-4ccc-8ccc-cccccccccccc"];
  await adm(db, `insert into public.inbox_contas (id, dono, sync_auto) values ($1, '${R}', true), ($2, '${R}', true), ($3, '${R}', false)`, [a, b, c]);
  const sinc = (conta, min, o = {}) => adm(db, `insert into public.inbox_sincronizacao (dono, conta_id, ultima_ok_em, ultima_tentativa_em, falhas_seguidas, duracao_ms, erro) values ('${R}', $1, $2, $3, $4, $5, $6)`,
    [conta, o.ok ?? ha(min), ha(min), o.falhas ?? 0, o.dur ?? 400, o.erro ?? null]);
  await sinc(a, 5); await sinc(b, 5, { dur: 1600 }); await sinc(a, 15); await sinc(c, 1, { falhas: 5, erro: "autenticacao" });
  v = await visao(db);
  assert.equal(v.inbox.estado, "ok"); assert.equal(+v.inbox.duracao_s, 2); assert.equal(v.inbox.registros, "2 pastas sincronizadas"); assert.equal(+new Date(v.inbox.ultima_execucao), AGORA - 5 * MIN);
  await adm(db, "truncate public.inbox_sincronizacao"); await sinc(a, 5, { falhas: 3, erro: "autenticacao" }); v = await visao(db);
  assert.equal(v.inbox.estado, "falhou"); assert.equal(v.inbox.motivo, "autenticacao"); assert.equal(v.inbox.alerta, true);
  await adm(db, "truncate public.inbox_sincronizacao"); await sinc(a, 31); assert.equal((await visao(db)).inbox.estado, "atrasado");
  await adm(db, "truncate public.inbox_sincronizacao"); await sinc(a, 29); assert.equal((await visao(db)).inbox.estado, "ok");
  await adm(db, "update public.inbox_contas set sync_auto = false"); await adm(db, "truncate public.inbox_sincronizacao"); await sinc(a, 5); v = await visao(db);
  assert.equal(v.inbox.estado, "desligado"); assert.equal(v.inbox.alerta, false); assert.equal(v.inbox.ultima_execucao, null);
  /* radar: só registra com oferta; sem registro no horário é "desconhecido", nunca atraso nem falha, e nunca alerta */
  await adm(db, `insert into public.radar_coletas (dono, origem, status, iniciada_em, terminada_em, ofertas_lidas, precos_gravados, falhas) values
    ('${R}', 'rotina', 'ok', $1, $2, 3, 1, 0), ('${R}', 'rotina', 'falha', $3, $4, 0, 0, 2), ('${R}', 'manual', 'falha', $5, $5, 0, 0, 1)`, [ha(300), ha(299), ha(299.5), ha(299.2), ha(10)]);
  v = await visao(db); assert.equal(v.radar.estado, "ok"); assert.equal(+v.radar.duracao_s, 60); assert.equal(v.radar.registros, "3 ofertas lidas, 1 preços gravados, 2 com falha"); assert.equal(v.radar.alerta, false);
  await adm(db, "truncate public.radar_coletas"); await adm(db, `insert into public.radar_coletas (dono, origem, status, iniciada_em, terminada_em, erro_mensagem) values ('${R}', 'rotina', 'falha', $1, $1, 'x')`, [ha(60)]);
  v = await visao(db); assert.equal(v.radar.estado, "falhou"); assert.equal(v.radar.alerta, false, "o Radar não gera alerta");
  await adm(db, "update public.radar_coletas set iniciada_em = $1, terminada_em = $1, status = 'ok'", [ha(14 * 60)]); v = await visao(db);
  assert.equal(v.radar.estado, "desconhecido"); assert.equal(v.radar.alerta, false);
  /* fiscal */
  await adm(db, `insert into public.notas_fiscais_entradas (user_id, atualizado_em) values ('${R}', $1)`, [ha(8 * 60)]); v = await visao(db);
  assert.equal(v.fiscal_entradas.estado, "desconhecido"); assert.equal(v.fiscal_entradas.alerta, false);
  assert.deepEqual(Object.keys(v.rotina).sort(), ["alerta", "dono", "duracao_s", "estado", "falhas_7d", "fonte", "limite_min", "motivo", "nome", "processo", "registros", "ultima_execucao", "ultima_falha", "ultimo_sucesso"].sort());
  await db.close();
});

test("M3: a view dá o MESMO estado que a tela (NUCLEO.monAvaliar) nos mesmos dados, nos casos claros", { skip: pular }, async () => {
  const db = await banco(), t = (s) => Date.parse(s);
  const conta = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const casos = [
    ["rotina ok", async () => adm(db, `insert into public.rotina_log (user_id, quando, ok) values ('${R}', '2026-11-26T09:02:00Z', true)`), () => N.monDeRotina([{ quando: "2026-11-26T09:02:00Z", ok: true }], AGORA), "rotina", "ok"],
    ["rotina atrasada", async () => adm(db, `insert into public.rotina_log (user_id, quando, ok) values ('${R}', '2026-11-25T09:02:00Z', true)`), () => N.monDeRotina([{ quando: "2026-11-25T09:02:00Z", ok: true }], AGORA), "rotina", "atrasado"],
    ["rotina falhou", async () => adm(db, `insert into public.rotina_log (user_id, quando, ok) values ('${R}', '2026-11-26T09:02:00Z', false), ('${R}', '2026-11-25T09:01:00Z', true)`),
      () => N.monDeRotina([{ quando: "2026-11-26T09:02:00Z", ok: false }, { quando: "2026-11-25T09:01:00Z", ok: true }], AGORA), "rotina", "falhou"],
    ["newsletter ok", async () => adm(db, `insert into public.newsletter_edicoes (dono, data, turno, atualizado_em) values ('${R}', '2026-11-26', 'manha', '${ha(180)}')`), () => N.monDeNewsletter([{ atualizado_em: ha(180), data: "2026-11-26", turno: "manha", origem: "regras" }]), "newsletter", "ok"],
    ["newsletter atrasada", async () => adm(db, `insert into public.newsletter_edicoes (dono, data, turno, atualizado_em) values ('${R}', '2026-11-26', 'manha', '${ha(15 * 60)}')`), () => N.monDeNewsletter([{ atualizado_em: ha(15 * 60), data: "2026-11-26", turno: "manha", origem: "regras" }]), "newsletter", "atrasado"],
    ["inbox ok", async () => { await adm(db, `insert into public.inbox_contas (id, dono) values ('${conta}', '${R}')`); await adm(db, `insert into public.inbox_sincronizacao (dono, conta_id, ultima_ok_em, ultima_tentativa_em, duracao_ms) values ('${R}', '${conta}', '${ha(5)}', '${ha(5)}', 300)`); },
      () => N.monDeInbox([{ conta_id: conta, ultima_ok_em: ha(5), ultima_tentativa_em: ha(5), falhas_seguidas: 0, duracao_ms: 300 }], [{ id: conta, sync_auto: true }]), "inbox", "ok"],
    ["inbox atrasada", async () => { await adm(db, `insert into public.inbox_contas (id, dono) values ('${conta}', '${R}')`); await adm(db, `insert into public.inbox_sincronizacao (dono, conta_id, ultima_ok_em, ultima_tentativa_em, duracao_ms) values ('${R}', '${conta}', '${ha(45)}', '${ha(45)}', 300)`); },
      () => N.monDeInbox([{ conta_id: conta, ultima_ok_em: ha(45), ultima_tentativa_em: ha(45), falhas_seguidas: 0, duracao_ms: 300 }], [{ id: conta, sync_auto: true }]), "inbox", "atrasado"],
    ["inbox falhou", async () => { await adm(db, `insert into public.inbox_contas (id, dono) values ('${conta}', '${R}')`); await adm(db, `insert into public.inbox_sincronizacao (dono, conta_id, ultima_ok_em, ultima_tentativa_em, falhas_seguidas, erro) values ('${R}', '${conta}', '${ha(500)}', '${ha(5)}', 2, 'autenticacao')`); },
      () => N.monDeInbox([{ conta_id: conta, ultima_ok_em: ha(500), ultima_tentativa_em: ha(5), falhas_seguidas: 2, erro: "autenticacao" }], [{ id: conta, sync_auto: true }]), "inbox", "falhou"],
    ["inbox desligada", async () => { await adm(db, `insert into public.inbox_contas (id, dono, sync_auto) values ('${conta}', '${R}', false)`); await adm(db, `insert into public.inbox_sincronizacao (dono, conta_id, ultima_ok_em, ultima_tentativa_em) values ('${R}', '${conta}', '${ha(5)}', '${ha(5)}')`); },
      () => N.monDeInbox([{ conta_id: conta, ultima_ok_em: ha(5), ultima_tentativa_em: ha(5), falhas_seguidas: 0 }], [{ id: conta, sync_auto: false }]), "inbox", "desligado"],
    ["radar ok", async () => adm(db, `insert into public.radar_coletas (dono, origem, status, iniciada_em, terminada_em, ofertas_lidas) values ('${R}', 'rotina', 'ok', '2026-11-26T09:21:00Z', '2026-11-26T09:22:00Z', 3)`),
      () => N.monDeRadar([{ iniciada_em: "2026-11-26T09:21:00Z", terminada_em: "2026-11-26T09:22:00Z", status: "ok", ofertas_lidas: 3 }], AGORA), "radar", "ok"],
    ["radar sem registro no horário", async () => adm(db, `insert into public.radar_coletas (dono, origem, status, iniciada_em, terminada_em) values ('${R}', 'rotina', 'ok', '2026-11-25T21:21:00Z', '2026-11-25T21:22:00Z')`),
      () => N.monDeRadar([{ iniciada_em: "2026-11-25T21:21:00Z", terminada_em: "2026-11-25T21:22:00Z", status: "ok" }], AGORA), "radar", "desconhecido"],
    ["radar falhou", async () => adm(db, `insert into public.radar_coletas (dono, origem, status, iniciada_em, terminada_em, erro_mensagem) values ('${R}', 'rotina', 'falha', '2026-11-26T09:21:00Z', '2026-11-26T09:22:00Z', 'x')`),
      () => N.monDeRadar([{ iniciada_em: "2026-11-26T09:21:00Z", terminada_em: "2026-11-26T09:22:00Z", status: "falha", erro_mensagem: "x" }], AGORA), "radar", "falhou"],
    ["fiscal ok", async () => adm(db, `insert into public.notas_fiscais_entradas (user_id, atualizado_em) values ('${R}', '2026-11-26T12:30:00Z')`), () => N.monDeFiscal([{ t: "2026-11-26T12:30:00Z" }], AGORA, "notas_fiscais_entradas"), "fiscal_entradas", "ok"],
    ["fiscal sem registro no horário", async () => adm(db, `insert into public.notas_fiscais_entradas (user_id, atualizado_em) values ('${R}', '2026-11-25T20:00:00Z')`), () => N.monDeFiscal([{ t: "2026-11-25T20:00:00Z" }], AGORA, "notas_fiscais_entradas"), "fiscal_entradas", "desconhecido"],
  ];
  for (const [nome, grava, tela, proc, esperado] of casos) {
    await limpar(db); await grava();
    const noBanco = (await visao(db))[proc].estado, naTela = N.monAvaliar(P(proc), tela(), AGORA).estado;
    assert.equal(noBanco, esperado, nome + " (banco)"); assert.equal(naTela, esperado, nome + " (tela)"); assert.equal(noBanco, naTela, nome + ": tela e banco concordam");
  }
  assert.ok(t("2026-11-26T09:02:00Z") < AGORA);
  await db.close();
});

const itens = (...l) => JSON.stringify(l.map(([entidade, estado, motivo = ""]) => ({ entidade, estado, nome: entidade.toUpperCase(), motivo, fonte: "fonte_" + entidade, fatos: { limite_min: 30 } })));
const sincronizar = (db, dono, json, agora) => adm(db, "select public.monitor_sinais_sincronizar($1::uuid, $2::jsonb, $3::timestamptz) as r", [dono, json, iso(agora)]).then((r) => r[0].r);
const todos = (db, extra = "") => adm(db, `select * from public.sinais where dono = '${R}' ${extra} order by detectado_em, id`);

test("M4: o ciclo de um incidente: abre, repete sem duplicar, atrasado vira falhou no MESMO registro e a recuperação fecha preservando o histórico", { skip: pular }, async () => {
  const db = await banco();
  let r = await sincronizar(db, R, itens(["rotina", "atrasado", "sem execução há mais de 25 h"], ["vagas", "ok"]), AGORA);
  assert.deepEqual(r, { abertos: 1, atualizados: 0, fechados: 0 });
  let l = await todos(db); assert.equal(l.length, 1);
  const s = l[0];
  assert.deepEqual([s.tipo, s.area, s.origem, s.entidade, s.severidade, s.estado, s.link, s.regra_versao], ["monitor.processo", "sistema", "monitor-alerta", "rotina", "atencao", "aberto", "#monitor", "1"]);
  assert.equal(s.chave, "monitor.processo:rotina:20261126T150000"); assert.equal(+new Date(s.detectado_em), AGORA); assert.equal(s.encerrado_em, null); assert.equal(s.notificado_em, null);
  assert.match(s.porque, /^Monitor, regra 1 \(fonte: fonte_rotina\): sem execução há mais de 25 h$/); assert.equal(s.fatos.estado, "atrasado"); assert.equal(s.fatos.nome, "ROTINA"); assert.equal(s.historico.length, 1);
  /* mesma situação de novo, 30 min depois: nada duplica */
  r = await sincronizar(db, R, itens(["rotina", "atrasado", "sem execução há mais de 25 h"]), AGORA + 30 * MIN);
  assert.deepEqual(r, { abertos: 0, atualizados: 1, fechados: 0 }); l = await todos(db); assert.equal(l.length, 1); assert.equal(l[0].id, s.id); assert.equal(l[0].historico.length, 1, "sem mudança de estado o histórico não cresce"); assert.equal(+new Date(l[0].atualizado_em), AGORA + 30 * MIN);
  /* atrasado → falhou: o MESMO incidente, a severidade sobe e o histórico registra */
  r = await sincronizar(db, R, itens(["rotina", "falhou", "a última execução falhou"]), AGORA + 60 * MIN);
  assert.deepEqual(r, { abertos: 0, atualizados: 1, fechados: 0 }); l = await todos(db); assert.equal(l.length, 1, "não abre outro incidente"); assert.equal(l[0].id, s.id);
  assert.equal(l[0].severidade, "urgente"); assert.equal(l[0].fatos.estado, "falhou"); assert.deepEqual(l[0].historico.map((h) => h.estado), ["atrasado", "falhou"]);
  /* sem evidência (desconhecido/indisponível) não fecha nem abre */
  r = await sincronizar(db, R, itens(["rotina", "desconhecido"], ["noticias", "indisponivel"], ["vagas", "desconhecido"]), AGORA + 90 * MIN);
  assert.deepEqual(r, { abertos: 0, atualizados: 0, fechados: 0 }); l = await todos(db); assert.equal(l.length, 1); assert.equal(l[0].estado, "aberto");
  /* recuperou: fecha sozinho, guarda o histórico; a mesma entidade pode abrir OUTRO incidente depois */
  r = await sincronizar(db, R, itens(["rotina", "ok"]), AGORA + 120 * MIN);
  assert.deepEqual(r, { abertos: 0, atualizados: 0, fechados: 1 }); l = await todos(db); assert.equal(l.length, 1);
  assert.deepEqual([l[0].estado, l[0].encerramento], ["fechado", "recuperou"]); assert.equal(+new Date(l[0].encerrado_em), AGORA + 120 * MIN); assert.deepEqual(l[0].historico.map((h) => h.estado), ["atrasado", "falhou", "recuperou"]);
  r = await sincronizar(db, R, itens(["rotina", "ok"]), AGORA + 150 * MIN); assert.deepEqual(r, { abertos: 0, atualizados: 0, fechados: 0 }, "ok sem incidente aberto não faz nada");
  r = await sincronizar(db, R, itens(["rotina", "falhou", "de novo"]), AGORA + 24 * H);
  l = await todos(db); assert.equal(l.length, 2, "o incidente antigo continua no histórico"); assert.equal(l[0].estado, "fechado"); assert.equal(l[1].estado, "aberto"); assert.notEqual(l[0].chave, l[1].chave);
  /* desligado fecha como "desligado" */
  await sincronizar(db, R, itens(["rotina", "desligado"]), AGORA + 25 * H); l = await todos(db, "and estado = 'fechado'"); assert.deepEqual(l.map((x) => x.encerramento), ["recuperou", "desligado"]);
  assert.equal((await adm(db, "select count(*)::int n from public.sinais where dono = $1", [F]))[0].n, 0, "só do dono informado");
  await db.close();
});

test("M4: item inválido recusa tudo (nada é gravado pela metade), e só o service_role executa as funções do ciclo", { skip: pular }, async () => {
  const db = await banco();
  for (const [rot, json] of [["estado desconhecido do contrato", itens(["rotina", "quebrado"])], ["entidade inválida", itens(["Rotina X", "falhou"])], ["não é lista", '{"entidade":"rotina"}'],
    ["fatos que não é objeto", '[{"entidade":"rotina","estado":"falhou","fatos":[1]}]']]) {
    const e = await falha(sincronizar(db, R, json, AGORA), rot); assert.match(e.message, /inválid/, rot);
  }
  const e0 = await falha(sincronizar(db, R, itens(["rotina", "falhou", "x"], ["vagas", "quebrado"]), AGORA)); assert.match(e0.message, /inválid/);
  assert.equal((await todos(db)).length, 0, "o item bom antes do ruim também não ficou gravado (a chamada é uma transação)");
  const e1 = await falha(sincronizar(db, null, "[]", AGORA)); assert.match(e1.message, /sem dono/);
  const chamadas = [`select public.monitor_sinais_sincronizar('${R}', '[]'::jsonb)`, `select public.monitor_sinais_pendentes('${R}')`, `select public.monitor_sinais_marcar('${R}', array[]::uuid[], gen_random_uuid())`];
  for (const sql of chamadas) {
    assert.equal((await falha(com(db, R, sql), "dono: " + sql)).code, "42501"); assert.equal((await falha(com(db, null, sql, [], "anon"), "anon: " + sql)).code, "42501");
    assert.equal((await com(db, null, sql, [], "service_role")).length, 1, "service_role executa: " + sql.slice(0, 40));
  }
  await db.close();
});

test("M4: pendentes (abertos ainda não avisados e resolvidos sem aviso), pushes do dia de Brasília e a marcação sem repetir", { skip: pular }, async () => {
  const db = await banco(), pend = async (agora) => (await adm(db, "select public.monitor_sinais_pendentes($1::uuid, $2::timestamptz) as r", [R, iso(agora)]))[0].r;
  await sincronizar(db, R, itens(["rotina", "atrasado", "m"], ["inbox", "falhou", "m"], ["noticias", "atrasado", "m"]), AGORA);
  await sincronizar(db, R, itens(["noticias", "ok"]), AGORA + 30 * MIN);   // abriu e já se resolveu antes de qualquer aviso
  let p = await pend(AGORA + 30 * MIN);
  assert.equal(p.pushes_hoje, 0); assert.deepEqual(p.abertos.map((x) => [x.entidade, x.nome, x.estado, x.severidade]).sort(), [["inbox", "INBOX", "falhou", "urgente"], ["rotina", "ROTINA", "atrasado", "atencao"]]);
  assert.deepEqual(p.resolvidos.map((x) => x.entidade), ["noticias"], "a ocorrência resolvida sem aviso fica disponível para o resumo consolidado");
  const ids = p.abertos.map((x) => x.id), lote = "99999999-9999-4999-8999-999999999999";
  assert.equal((await adm(db, "select public.monitor_sinais_marcar($1::uuid, $2::uuid[], $3::uuid, $4::timestamptz) as n", [R, [...ids, p.resolvidos[0].id], lote, iso(AGORA + 31 * MIN)]))[0].n, 3);
  assert.equal((await adm(db, "select public.monitor_sinais_marcar($1::uuid, $2::uuid[], $3::uuid, $4::timestamptz) as n", [R, ids, "88888888-8888-4888-8888-888888888888", iso(AGORA + 40 * MIN)]))[0].n, 0, "não avisa duas vezes o mesmo incidente");
  p = await pend(AGORA + 40 * MIN); assert.deepEqual([p.abertos.length, p.resolvidos.length, p.pushes_hoje], [0, 0, 1], "um lote conta UM push, mesmo com vários incidentes");
  /* incidente novo depois do aviso: pendente; o contador do dia vale pelo dia de Brasília (UTC-3 fixo) */
  await sincronizar(db, R, itens(["vagas", "falhou", "m"]), AGORA + 50 * MIN); p = await pend(AGORA + 50 * MIN); assert.deepEqual(p.abertos.map((x) => x.entidade), ["vagas"]);
  const noite = Date.parse("2026-11-27T01:30:00Z");   // 22h30 do dia 26 em Brasília
  await adm(db, "update public.sinais set notificado_em = $1, lote_push = $2 where entidade = 'vagas'", [iso(noite), "77777777-7777-4777-8777-777777777777"]);
  assert.equal((await pend(Date.parse("2026-11-27T02:50:00Z"))).pushes_hoje, 2, "ainda é dia 26 em Brasília (23h50): conta os dois lotes");
  assert.equal((await pend(Date.parse("2026-11-27T03:00:00Z"))).pushes_hoje, 0, "meia-noite em Brasília: o dia 27 começa sem nenhum push");
  assert.equal((await pend(Date.parse("2026-11-27T11:00:00Z"))).resolvidos.length, 0);
  await db.close();
});

test("068: o service_role (como na produção) roda a view e o vigia lendo só as colunas necessárias; resumo da rotina e e-mail das contas continuam fechados; nada de escrita", { skip: pular }, async () => {
  const db = await banco();
  await adm(db, `insert into public.rotina_log (user_id, quando, ok, resumo) values ('${R}', $1, true, '{"garmin":1}')`, [ha(60)]);
  await adm(db, `insert into public.inbox_contas (id, dono, sync_auto, endereco) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${R}', true, 'x@y.com')`);
  await adm(db, `insert into public.inbox_sincronizacao (dono, conta_id, ultima_ok_em, ultima_tentativa_em, duracao_ms) values ('${R}', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', $1, $1, 200)`, [ha(5)]);
  await adm(db, `insert into public.notas_fiscais_entradas (user_id, atualizado_em) values ('${R}', $1)`, [ha(30)]);
  const svc = (sql, p = []) => com(db, null, sql, p, "service_role");
  const v = await svc("select processo, estado from public.monitor_processos_em($1::timestamptz) where dono = $2::uuid order by 1", [iso(AGORA), R]);
  assert.deepEqual(v.map((x) => [x.processo, x.estado]), [["fiscal_entradas", "ok"], ["inbox", "ok"], ["rotina", "ok"]], "a view roda como service_role só com a 068");
  assert.equal((await svc("select count(distinct user_id)::int n from public.rotina_log"))[0].n, 1, "o vigia descobre o dono pelo rotina_log");
  for (const sql of ["select resumo from public.rotina_log", "select endereco from public.inbox_contas", "select * from public.rotina_log", "select * from public.inbox_contas"])
    assert.equal((await falha(svc(sql), sql)).code, "42501", "fechado: " + sql);
  for (const sql of ["insert into public.rotina_log (user_id, ok) values ('" + R + "', true)", "update public.inbox_contas set sync_auto = false", "delete from public.notas_fiscais_entradas"])
    assert.equal((await falha(svc(sql), sql)).code, "42501", "sem escrita: " + sql);
  /* sem a 068 o mesmo pedido falha: é o erro que o ensaio em produção mostrou (500 por permissão negada) */
  await adm(db, "revoke select (user_id, quando, ok) on public.rotina_log from service_role");
  assert.equal((await falha(svc("select * from public.monitor_processos_em($1::timestamptz)", [iso(AGORA)]))).code, "42501", "sem a 068 o vigia não consegue ler");
  await adm(db, "select 1"); await db.exec(S68); assert.equal((await svc("select count(*)::int n from public.monitor_processos_em($1::timestamptz)", [iso(AGORA)]))[0].n, 3, "a 068 devolve a leitura");
  const grants = (S68.replace(/--.*$/gm, "").match(/grant [^;]*;/g) || []).join("\n");
  assert.match(S68, /^-- 068 · Monitor M3\/M4: leitura POR COLUNA para o service_role/); assert.doesNotMatch(grants, /insert|update|delete|\ball\b|resumo|endereco/, "só leitura, e só das colunas do Monitor");
  await db.close();
});
