// Monitor de integrações (M4) · Edge Function monitor-alerta (supabase/functions/monitor-alerta): as regras puras (robôs pelos JSON, silêncio, limite do dia, mensagem),
// a cópia do push idêntica à do Inbox, e rodadas COMPLETAS contra o Postgres de verdade (PGlite) com a migration 067 e envio falso.
// Prova: um aviso por incidente; atrasado vira falhou sem novo push; recuperação fecha sozinha e não avisa; silêncio (22h às 7h) e limite de 3 por dia nunca descartam
// incidente (ficam em sinais e saem consolidados depois); resolvido sozinho nunca gera push; robô indisponível não gera alarme; push que falha tenta de novo;
// o ensaio não grava nem envia; Radar e Central Fiscal nunca alertam; a função garmin não é tocada. Tudo fictício, sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { N, ler, PGlite, pular, R, F, banco, adm, iso } from "./_monitor_banco.mjs";
import { ROBOS, ALERTAVEIS_BANCO, avaliarArquivo, avaliarRobo, itemDoBanco, decidirEnvio, montarMensagem, emSilencio, horaBRT, quandoBRT, LIMITE_PUSHES_DIA } from "../supabase/functions/monitor-alerta/regras.ts";
import { rodar } from "../supabase/functions/monitor-alerta/servico.ts";
import { entregar } from "../supabase/functions/monitor-alerta/push.ts";

const H = 36e5, MIN = 6e4, t = (s) => Date.parse(s);
const DIR = "supabase/functions/monitor-alerta/";

test("arquivos: função isolada (a garmin não muda), push idêntico ao do Inbox, sem segredo e a rotina como única autenticação", () => {
  assert.deepEqual(fs.readdirSync(new URL("../" + DIR, import.meta.url)).sort(), ["index.ts", "push.ts", "regras.ts", "servico.ts"]);
  const corpo = (a) => ler(a).slice(ler(a).indexOf("export type Vapid"));
  assert.equal(corpo(DIR + "push.ts"), corpo("supabase/functions/rac-inbox/push.ts"), "a cópia do push é igual ao módulo do Inbox (que tem a prova de decifragem)");
  const idx = ler(DIR + "index.ts");
  assert.match(idx, /rac_rotina_ok/); assert.match(idx, /x-rac-rotina/); assert.match(idx, /if \(!autorizado\) return responder\(\{ ok: false, erro: "não autorizado" \}, 401\)/);
  const codigo = [DIR + "index.ts", DIR + "servico.ts", DIR + "regras.ts"].map((a) => ler(a).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "")).join("\n");
  assert.ok(!/anthropic|rac-ia|telegram|eyJ[A-Za-z0-9_-]{10,}|sb_(secret|publishable)_[A-Za-z0-9_-]{10,}/i.test(codigo), "sem IA, sem Telegram, sem chave no código");
  assert.ok(!/monitor-alerta|monitor_sinais/.test(ler("supabase/functions/garmin/index.ts")), "a função garmin continua intocada");
  assert.ok(!/\.from\("sinais"\)/.test(idx), "o vigia só grava em sinais pelas funções do banco");
});

test("os robôs vigiados usam os mesmos JSON e limites da tela (8, 8, 8 e 14 h; vagas 30 h)", () => {
  const sis = ler("js/sistema.js");
  const tela = [...sis.matchAll(/\{nome:"([^"]+)",d:js\[\d\],campo:"([a-z]+)",idadeMax:(\d+)\}/g)].map((m) => [m[1], m[2], +m[3]]);
  const aqui = ROBOS.flatMap((r) => r.arquivos.map((a) => [a.rotulo, a.campo, a.idadeMaxH]));
  assert.deepEqual(aqui.map((x) => x.join("|")).sort(), tela.map((x) => x.join("|")).sort());
  assert.deepEqual(ROBOS.map((r) => r.processo), ["noticias", "vagas"]); assert.deepEqual(ALERTAVEIS_BANCO, ["rotina", "newsletter", "inbox"]);
  const cat = N.MON_PROCESSOS.map((p) => p.id); for (const id of [...ROBOS.map((r) => r.processo), ...ALERTAVEIS_BANCO]) assert.ok(cat.includes(id), id + " é um processo do Monitor");
  assert.ok(!ALERTAVEIS_BANCO.includes("radar") && !ALERTAVEIS_BANCO.includes("fiscal_entradas") && !ROBOS.some((r) => r.processo === "testes"), "Radar, Central Fiscal e testes automáticos nunca alertam");
});

const AG = t("2026-11-26T15:00:00Z");
const F1 = { arquivo: "vagas.json", rotulo: "vagas", campo: "vagas", idadeMaxH: 30 };
const resp = (corpo, status = 200) => ({ status, corpo });
const coleta = (h, extra = {}) => ({ coletado: new Date(AG - h * H).toISOString(), vagas: [1, 2], ...extra });

test("robô (JSON): indisponível ≠ atrasado ≠ falhou; sem evidência suficiente não há alarme", () => {
  const A = (r, f = F1) => avaliarArquivo(r, f, AG);
  assert.equal(A(resp(coleta(29))).estado, "ok"); assert.equal(A(resp(coleta(31))).estado, "atrasado"); assert.match(A(resp(coleta(31))).motivo, /vagas: sem coleta há 31 h \(limite 30 h\)/);
  assert.equal(A(resp(coleta(1, { vagas: [] }))).estado, "falhou"); assert.match(A(resp(coleta(1, { vagas: [] }))).motivo, /coleta recente, mas vazia/);
  assert.equal(A(resp(coleta(1, { fontes: [{ ok: false }, { ok: false }] }))).estado, "falhou", "todas as fontes fora do ar"); assert.equal(A(resp(coleta(1, { fontes: [{ ok: false }, { ok: true }] }))).estado, "ok", "falha parcial de fonte não alarma");
  for (const r of [null, resp(null, 404), resp(null, 500), resp("texto"), resp([1]), resp({ vagas: [1] }), resp({ coletado: "lixo", vagas: [1] }), resp({ coletado: null, vagas: [1] })]) assert.equal(A(r).estado, "indisponivel", JSON.stringify(r));
  assert.equal(A(resp(coleta(-3))).estado, "ok", "data no futuro (relógio) não vira atraso");
  assert.match(A(resp(coleta(100, { vagas: [1] })), { ...F1, idadeMaxH: 8 }).motivo, /4 dias/);
  const noticias = ROBOS[0], tudoOk = Object.fromEntries(noticias.arquivos.map((a) => [a.arquivo, resp({ coletado: new Date(AG - H).toISOString(), [a.campo]: [1] })]));
  assert.equal(avaliarRobo(noticias, tudoOk, AG).estado, "ok");
  const velho = { ...tudoOk, "rumores.json": resp({ coletado: new Date(AG - 20 * H).toISOString(), liga: [1] }) }; const v = avaliarRobo(noticias, velho, AG);
  assert.equal(v.estado, "atrasado"); assert.match(v.motivo, /rumores da MLB: sem coleta há 20 h/); assert.equal(v.entidade, "noticias");
  const misto = { ...velho, "tecdados.json": resp({ coletado: new Date(AG - H).toISOString(), noticias: [] }) }; assert.equal(avaliarRobo(noticias, misto, AG).estado, "falhou", "o pior entre os arquivos lidos");
  const umCaiu = { ...tudoOk, "noticias.json": null, "tecdados.json": resp(null, 503) }; assert.equal(avaliarRobo(noticias, umCaiu, AG).estado, "ok", "arquivos ilegíveis não derrubam o que deu para ler");
  const nenhum = Object.fromEntries(noticias.arquivos.map((a) => [a.arquivo, null])); const n = avaliarRobo(noticias, nenhum, AG); assert.equal(n.estado, "indisponivel"); assert.match(n.motivo, /não consegui ler Sorocaba/);
});

test("banco → item: só Rotina, Newsletter e Inbox podem abrir incidente; Radar e Central Fiscal nunca", () => {
  const L = (processo, estado, motivo = null) => ({ dono: R, processo, nome: "N " + processo, fonte: "f", estado, motivo, limite_min: 30, alerta: false, ultima_execucao: null, ultimo_sucesso: null });
  assert.equal(itemDoBanco(L("radar", "falhou")), null); assert.equal(itemDoBanco(L("fiscal_entradas", "desconhecido")), null);
  assert.deepEqual(itemDoBanco(L("inbox", "falhou", "autenticacao")), { entidade: "inbox", estado: "falhou", nome: "N inbox", motivo: "autenticacao", fonte: "f", fatos: { limite_min: 30, ultima_execucao: null, ultimo_sucesso: null } });
  assert.equal(itemDoBanco(L("rotina", "qualquer")).estado, "desconhecido", "estado fora do contrato = sem evidência");
});

const pend = (id, nome, estado, det, extra = {}) => ({ id, entidade: nome.toLowerCase(), nome, estado, severidade: estado === "falhou" ? "urgente" : "atencao", detectado_em: new Date(det).toISOString(), ...extra });
const res = (id, nome) => ({ id, entidade: nome.toLowerCase(), nome, detectado_em: new Date(AG - 5 * H).toISOString(), encerrado_em: new Date(AG - 4 * H).toISOString() });

test("quando avisar: silêncio das 22h às 7h (Brasília), limite de 3 pushes por dia, nada a avisar e resolvido sozinho nunca gera push", () => {
  const at = [pend("a", "Rotina das 6h", "atrasado", AG - H)];
  const em = (utc) => t("2026-11-26T" + utc + "Z");   // 15:00 UTC = 12:00 em Brasília
  assert.equal(horaBRT(em("10:00:00")), 7); assert.equal(horaBRT(em("01:30:00")), 22.5); assert.equal(quandoBRT(em("13:05:00"), em("15:00:00")), "10:05"); assert.equal(quandoBRT(t("2026-11-25T06:10:00Z"), em("15:00:00")), "25/11 03:10");
  assert.deepEqual([emSilencio(em("09:59:00")), emSilencio(em("10:00:00")), emSilencio(em("00:59:00")), emSilencio(em("01:00:00")), emSilencio(em("03:00:00"))], [true, false, false, true, true], "7h00 já pode; 22h00 já cala");
  const D = (o) => decidirEnvio({ abertos: at, resolvidos: [], pushesHoje: 0, agora: em("15:00:00"), ...o });
  assert.equal(D({}).enviar, true); assert.deepEqual(D({ abertos: [] }), { enviar: false, motivo: "nada" });
  assert.deepEqual(D({ resolvidos: [res("r", "Newsletter")], abertos: [] }), { enviar: false, motivo: "nada" }, "só resolvido: sem push de recuperação");
  assert.deepEqual(D({ agora: em("01:00:00") }), { enviar: false, motivo: "silencio" }); assert.deepEqual(D({ agora: em("09:59:00") }), { enviar: false, motivo: "silencio" });
  assert.equal(D({ agora: em("10:00:00") }).enviar, true);
  assert.equal(LIMITE_PUSHES_DIA, 3); assert.equal(D({ pushesHoje: 2 }).enviar, true); assert.deepEqual(D({ pushesHoje: 3 }), { enviar: false, motivo: "limite" });
  assert.deepEqual(D({ agora: em("03:00:00"), pushesHoje: 3 }), { enviar: false, motivo: "silencio" });
});

test("mensagem: um push consolidado, só nome e situação (sem dado pessoal), com a hora de cada incidente e as resolvidas como 'já resolvida'", () => {
  const abertos = [pend("a", "Rotina das 6h", "atrasado", t("2026-11-26T06:10:00Z")), pend("b", "Inbox (sincronização)", "falhou", AG - 20 * MIN)];
  const m = montarMensagem(abertos, [res("r", "Newsletter (edições)")], AG);
  assert.equal(m.titulo, "RAC Monitor: 2 ocorrências"); assert.equal(m.url, "./#monitor"); assert.equal(m.tag, "monitor-alerta"); assert.equal(m.renotificar, true);
  assert.equal(m.corpo, ["Rotina das 6h: atrasado (desde 03:10)", "Inbox (sincronização): falhou (desde 11:40)", "Já resolvida: Newsletter (edições)", "Abra o Monitor para os detalhes."].join("\n"));
  assert.equal(montarMensagem([abertos[0]], [], AG).titulo, "RAC Monitor: 1 ocorrência");
  const muitos = Array.from({ length: 6 }, (_, i) => pend("i" + i, "Proc " + i, "atrasado", AG - H)); const mm = montarMensagem(muitos, [res("x", "A"), res("y", "B")], AG);
  assert.match(mm.corpo, /e mais 2\n/); assert.match(mm.corpo, /Já resolvidas: A, B/);
  assert.ok(!/@|http|senha|chave|erro:/i.test(m.corpo), "nada sensível na tela bloqueada");
});

test("069: agenda o vigia a cada 30 min só com a senha da rotina do Vault, sem duplicar, sem tocar nos outros jobs e sem chave nova", () => {
  const t = ler("supabase/069_monitor_alerta_agenda.sql"), s = t.replace(/--.*$/gm, "");
  assert.match(t, /^-- 069 · Monitor M4: agenda do vigia/); assert.match(s, /\bbegin;[\s\S]*\bcommit;/);
  assert.match(s, /cron\.unschedule\('monitor-alerta'\) where exists/); assert.match(s, /cron\.schedule\('monitor-alerta', '\*\/30 \* \* \* \*'/);
  assert.match(s, /functions\/v1\/monitor-alerta/); assert.match(s, /'x-rac-rotina', \(select decrypted_secret from vault\.decrypted_secrets where name = 'rac_rotina'\)/);
  assert.ok(!/Authorization|eyJ|sb_(secret|publishable)|service_role|create_secret|rac_chave_publica/.test(s), "nenhuma chave nova: só a senha da rotina que já está no Vault");
  assert.ok(!/unschedule\('(rac-rotina|rac-newsletter|radar-rotina|fiscal-entradas|inbox-sync)'/.test(s), "não mexe nos outros agendamentos");
  assert.match(s, /<> 5/, "confere que os 5 agendamentos de antes seguem de pé");
});

// ---------- rodadas completas: servico.ts + as funções SQL reais da 067 ----------
async function ambiente({ resposta = () => ({ status: 200, corpo: null }), aparelhos = 1, statusPush = 201 } = {}) {
  const db = await banco(), envios = [], relogio = { t: AG };
  const lerPend = async (dono, agora) => (await adm(db, "select public.monitor_sinais_pendentes($1::uuid, $2::timestamptz) as r", [dono, iso(agora)]))[0].r;
  const deps = {
    agora: () => relogio.t, donos: async () => [R],
    processosBanco: async (agora) => adm(db, "select * from public.monitor_processos_em($1::timestamptz)", [iso(agora)]),
    baixar: async (arq) => resposta(arq),
    sincronizar: async (dono, itens, agora) => (await adm(db, "select public.monitor_sinais_sincronizar($1::uuid, $2::jsonb, $3::timestamptz) as r", [dono, JSON.stringify(itens), iso(agora)]))[0].r,
    pendentes: lerPend,
    push: async (dono, msg) => { envios.push({ dono, msg, quando: relogio.t }); return { aparelhos, enviados: statusPush >= 200 && statusPush < 300 ? aparelhos : 0, removidas: 0, semChaves: false }; },
    marcar: async (dono, ids, lote, agora) => (await adm(db, "select public.monitor_sinais_marcar($1::uuid, $2::uuid[], $3::uuid, $4::timestamptz) as n", [dono, ids, lote, iso(agora)]))[0].n,
    novoLote: () => crypto.randomUUID(),
  };
  const sinais = (extra = "") => adm(db, `select entidade, estado, severidade, encerramento, notificado_em, lote_push, historico from public.sinais where dono = '${R}' ${extra} order by detectado_em, entidade`);
  return { db, deps, envios, relogio, sinais };
}
const robosOk = (arq) => { const a = ROBOS.flatMap((r) => r.arquivos).find((x) => x.arquivo === arq); return { status: 200, corpo: { coletado: new Date(AG - H).toISOString(), [a.campo]: [1] } }; };
const ROT_OK_ATRASADA = (db, min) => adm(db, `insert into public.rotina_log (user_id, quando, ok) values ('${R}', $1, true)`, [iso(AG - min * MIN)]);

test("rodada: um incidente por problema, UM push consolidado, atrasado vira falhou sem novo push e a recuperação fecha sozinha sem avisar", { skip: pular }, async () => {
  const { db, deps, envios, relogio, sinais } = await ambiente({ resposta: robosOk });
  await ROT_OK_ATRASADA(db, 26 * 60);                       // rotina: 26 h sem rodar → atrasado
  let r = await rodar(deps);
  assert.deepEqual(r.por_dono[0].incidentes, { abertos: 1, atualizados: 0, fechados: 0 }); assert.equal(r.por_dono[0].envio, "enviado"); assert.equal(envios.length, 1);
  assert.equal(envios[0].msg.titulo, "RAC Monitor: 1 ocorrência"); assert.match(envios[0].msg.corpo, /^Rotina das 6h: atrasado \(desde 12:00\)/); assert.equal(envios[0].dono, R);
  let l = await sinais(); assert.equal(l.length, 1); assert.ok(l[0].notificado_em && l[0].lote_push);
  /* mais 30 min, mesmo problema: nada novo, nenhum push */
  relogio.t += 30 * MIN; r = await rodar(deps); assert.equal(envios.length, 1); assert.deepEqual(r.por_dono[0].incidentes, { abertos: 0, atualizados: 1, fechados: 0 }); assert.equal(r.por_dono[0].envio, "nada");
  /* a rotina rodou e FALHOU: atrasado → falhou no MESMO incidente, sem novo push */
  await adm(db, `insert into public.rotina_log (user_id, quando, ok) values ('${R}', $1, false)`, [iso(relogio.t - 5 * MIN)]);
  r = await rodar(deps); assert.equal(envios.length, 1, "a mudança de situação não duplica o aviso"); l = await sinais(); assert.equal(l.length, 1); assert.deepEqual([l[0].estado, l[0].severidade], ["aberto", "urgente"]);
  assert.deepEqual(l[0].historico.map((h) => h.estado), ["atrasado", "falhou"]);
  /* recuperou: a rotina rodou bem → fecha sozinha, histórico preservado, sem push de recuperação */
  await adm(db, `insert into public.rotina_log (user_id, quando, ok) values ('${R}', $1, true)`, [iso(relogio.t + 2 * MIN)]); relogio.t += 5 * MIN;
  r = await rodar(deps); assert.deepEqual(r.por_dono[0].incidentes, { abertos: 0, atualizados: 0, fechados: 1 }); assert.equal(envios.length, 1, "sem push de recuperação");
  l = await sinais(); assert.deepEqual([l[0].estado, l[0].encerramento], ["fechado", "recuperou"]); assert.deepEqual(l[0].historico.map((h) => h.estado), ["atrasado", "falhou", "recuperou"]);
  await db.close();
});

test("rodada: Radar e Central Fiscal nunca alertam; robô indisponível não gera alarme; robô atrasado e vazio alertam", { skip: pular }, async () => {
  let resposta = (a) => robosOk(a);
  const { db, deps, envios, sinais } = await ambiente({ resposta: (a) => resposta(a) });
  await adm(db, `insert into public.rotina_log (user_id, quando, ok) values ('${R}', $1, true)`, [iso(AG - 60 * MIN)]);
  await adm(db, `insert into public.radar_coletas (dono, origem, status, iniciada_em, terminada_em, erro_mensagem) values ('${R}', 'rotina', 'falha', $1, $1, 'x')`, [iso(AG - 60 * MIN)]);      // Radar com falha
  await adm(db, `insert into public.notas_fiscais_entradas (user_id, atualizado_em) values ('${R}', $1)`, [iso(AG - 30 * H)]);                                                                 // Fiscal sem registro recente
  let r = await rodar(deps); assert.equal((await sinais()).length, 0, "nem a falha do Radar nem o Fiscal antigo abrem incidente"); assert.equal(envios.length, 0); assert.equal(r.por_dono[0].envio, "nada");
  const base = r.por_dono[0].itens.map((i) => i.entidade).sort(); assert.deepEqual(base, ["noticias", "rotina", "vagas"]);
  resposta = () => null; r = await rodar(deps); assert.equal((await sinais()).length, 0, "tudo indisponível: sem alarme"); assert.deepEqual(r.por_dono[0].itens.filter((i) => i.estado === "indisponivel").map((i) => i.entidade).sort(), ["noticias", "vagas"]);
  resposta = (a) => (a === "vagas.json" ? { status: 200, corpo: { coletado: new Date(AG - 40 * H).toISOString(), vagas: [1] } } : a === "rumores.json" ? { status: 200, corpo: { coletado: new Date(AG - H).toISOString(), liga: [] } } : robosOk(a));
  r = await rodar(deps); const l = await sinais(); assert.deepEqual(l.map((x) => [x.entidade, x.severidade]).sort(), [["noticias", "urgente"], ["vagas", "atencao"]]);
  assert.equal(envios.length, 1); assert.equal(envios[0].msg.titulo, "RAC Monitor: 2 ocorrências"); assert.match(envios[0].msg.corpo, /Robô de notícias: falhou[\s\S]*Robô de vagas: atrasado|Robô de vagas: atrasado[\s\S]*Robô de notícias: falhou/);
  await db.close();
});

test("rodada: silêncio e limite do dia NÃO descartam incidentes: ficam em sinais e saem num push consolidado depois; resolvido na madrugada só aparece como 'já resolvida'", { skip: pular }, async () => {
  const noite = t("2026-11-26T04:30:00Z");   // 01:30 em Brasília
  const { db, deps, envios, relogio, sinais } = await ambiente({ resposta: robosOk });
  relogio.t = noite; await adm(db, `insert into public.rotina_log (user_id, quando, ok) values ('${R}', $1, true)`, [iso(noite - 27 * H)]);
  let r = await rodar(deps); assert.equal(r.por_dono[0].envio, "silencio"); assert.equal(envios.length, 0); assert.equal((await sinais()).length, 1, "registrado mesmo em silêncio");
  /* a newsletter também atrasa e se resolve ainda de madrugada, antes de qualquer aviso */
  await adm(db, `insert into public.newsletter_edicoes (dono, data, turno, atualizado_em) values ('${R}', '2026-11-25', 'noite', $1)`, [iso(noite - 15 * H)]);
  relogio.t += 30 * MIN; await rodar(deps); assert.equal((await sinais()).length, 2);
  await adm(db, `update public.newsletter_edicoes set atualizado_em = $1`, [iso(relogio.t - H)]); relogio.t += 30 * MIN; r = await rodar(deps);
  assert.deepEqual((await sinais("and entidade = 'newsletter'")).map((x) => x.estado), ["fechado"]); assert.equal(envios.length, 0, "silêncio: nada enviado, nada perdido");
  /* 7h00 em Brasília: UM push consolidado com o que ficou pendente, a resolvida entra só como "já resolvida" */
  relogio.t = t("2026-11-26T10:00:00Z"); r = await rodar(deps); assert.equal(r.por_dono[0].envio, "enviado"); assert.equal(envios.length, 1);
  assert.match(envios[0].msg.corpo, /^Rotina das 6h: atrasado \(desde 01:30\)\nJá resolvida: Newsletter \(edições\)\nAbra o Monitor/);
  assert.equal((await sinais("and notificado_em is null")).length, 0, "a resolvida também foi apresentada: nada fica pendente para sempre");
  /* limite de 3 por dia: o 4º incidente fica registrado e só sai no dia seguinte, consolidado */
  let n = 1;
  for (const [quando, arq] of [["2026-11-26T13:00:00Z", "vagas.json"], ["2026-11-26T14:00:00Z", "rumores.json"]]) {
    relogio.t = t(quando); deps.baixar = async (a) => (a === arq ? { status: 200, corpo: a === "vagas.json" ? { coletado: new Date(relogio.t - 40 * H).toISOString(), vagas: [1] } : { coletado: new Date(relogio.t - H).toISOString(), liga: [] } } : robosOk(a));
    await rodar(deps); n++; assert.equal(envios.length, n, "push " + n);
  }
  assert.equal(envios.length, 3);
  relogio.t = t("2026-11-26T20:00:00Z"); await adm(db, `insert into public.inbox_contas (id, dono) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${R}')`);
  await adm(db, `insert into public.inbox_sincronizacao (dono, conta_id, ultima_ok_em, ultima_tentativa_em, falhas_seguidas, erro) values ('${R}', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', $1, $2, 4, 'autenticacao')`, [iso(relogio.t - 5 * H), iso(relogio.t - 5 * MIN)]);
  r = await rodar(deps); assert.equal(r.por_dono[0].envio, "limite"); assert.equal(envios.length, 3, "já saíram 3 pushes hoje"); assert.equal(r.por_dono[0].pushes_hoje, 3);
  assert.equal((await sinais("and entidade = 'inbox'")).length, 1, "o incidente do limite está registrado"); assert.equal((await sinais("and entidade = 'inbox' and notificado_em is null")).length, 1);
  relogio.t = t("2026-11-27T10:00:00Z"); deps.baixar = async (a) => robosOk(a);                       // dia seguinte, 7h: o contador zerou
  await adm(db, `update public.inbox_sincronizacao set ultima_tentativa_em = $1`, [iso(relogio.t - 3 * MIN)]);
  r = await rodar(deps); assert.equal(r.por_dono[0].envio, "enviado"); assert.equal(envios.length, 4); assert.match(envios[3].msg.corpo, /Newsletter \(edições\): atrasado \(desde 26\/11 17:00\)\nInbox \(sincronização\): falhou \(desde 26\/11 17:00\)/, "o consolidado traz os incidentes de ontem (que o limite segurou) com a hora em que abriram");
  await db.close();
});

test("rodada: push que falha mantém o incidente pendente e tenta de novo; sem aparelho ou sem chaves nunca marca como avisado; o ensaio não grava nem envia", { skip: pular }, async () => {
  const falho = await ambiente({ resposta: robosOk, statusPush: 500 });
  await ROT_OK_ATRASADA(falho.db, 30 * 60);
  let r = await rodar(falho.deps); assert.equal(r.por_dono[0].envio, "falhou"); assert.equal((await falho.sinais("and notificado_em is null")).length, 1, "não foi avisado: continua pendente");
  falho.relogio.t += 30 * MIN; r = await rodar(falho.deps); assert.equal(falho.envios.length, 2, "tentou de novo na rodada seguinte"); assert.equal((await falho.sinais()).length, 1, "o mesmo incidente");
  await falho.db.close();
  const sem = await ambiente({ resposta: robosOk, aparelhos: 0 });
  await ROT_OK_ATRASADA(sem.db, 30 * 60); r = await rodar(sem.deps); assert.equal(r.por_dono[0].envio, "sem_aparelho"); assert.equal((await sem.sinais("and notificado_em is null")).length, 1, "registrado, sem aparelho para avisar");
  await sem.db.close();
  const ens = await ambiente({ resposta: robosOk });
  await ROT_OK_ATRASADA(ens.db, 30 * 60); r = await rodar(ens.deps, { ensaio: true });
  assert.equal(r.ensaio, true); assert.equal((await ens.sinais()).length, 0, "ensaio não grava incidente"); assert.equal(ens.envios.length, 0); assert.equal(r.por_dono[0].incidentes, undefined);
  assert.equal(r.por_dono[0].itens.find((i) => i.entidade === "rotina").estado, "atrasado", "mas mostra o que viu");
  await ens.db.close();
});

test("rodada: um dono com erro não derruba a rodada, e sem dono não consulta o banco", { skip: pular }, async () => {
  const { db, deps } = await ambiente({ resposta: robosOk });
  let consultas = 0; const base = deps.processosBanco;
  deps.donos = async () => []; deps.processosBanco = async (a) => { consultas++; return base(a); };
  let r = await rodar(deps); assert.deepEqual([r.ok, r.donos, consultas], [true, 0, 0]);
  deps.donos = async () => [R, F]; deps.sincronizar = async (dono) => { if (dono === R) throw new Error("falha qualquer"); return { abertos: 0, atualizados: 0, fechados: 0 }; };
  r = await rodar(deps); assert.equal(r.ok, false); assert.equal(r.por_dono[0].erro, "falha ao processar"); assert.equal(r.por_dono[1].erro, undefined, "o outro dono seguiu");
  assert.ok(!JSON.stringify(r).includes("falha qualquer"), "a mensagem interna não vaza na resposta");
  await db.close();
});

test("push: entregar() fala só com as inscrições do dono, conta só o que o serviço aceitou e apaga a que morreu (404/410)", async () => {
  const insc = [{ id: 1, endpoint: "https://push.example.com/a", p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" }, { id: 2, endpoint: "https://push.example.com/b", p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" }];
  const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]); const jwk = await crypto.subtle.exportKey("jwk", par.privateKey);
  const apagadas = []; const banco = { vapid: async () => ({ publica: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", jwk }), inscricoes: async (uid) => { assert.equal(uid, R); return insc; }, apagarInscricao: async (uid, id) => { apagadas.push([uid, id]); } };
  const chamadas = []; const f = async (url) => { chamadas.push(url); return { status: url.endsWith("/a") ? 201 : 410 }; };
  const e = await entregar(banco, R, { titulo: "t", corpo: "c" }, f);
  assert.deepEqual(e, { aparelhos: 2, enviados: 1, removidas: 1, semChaves: false }); assert.deepEqual(apagadas, [[R, 2]]); assert.equal(chamadas.length, 2);
  await assert.rejects(() => entregar(banco, "", { titulo: "t", corpo: "c" }, f), /sem destinatário/);
});
