// Lote 6 (23/11/2026): resumo semanal da Saúde. Regra por texto (sem IA) em nucleo.js + ação saude.resumo da rac-ia (Haiku, só REAL, só dono) + migration 066.
// Dados inventados; nenhuma chamada paga e nenhuma rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { ACOES, montarPedido } from "../supabase/functions/rac-ia/acoes.ts";
import { temDemo } from "../supabase/functions/rac-ia/demo.ts";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo, HOJE = "2026-11-23", dia = (n) => N.somaDiasISO(HOJE, n);
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8");
const dias = (f = () => ({})) => Array.from({ length: 30 }, (_, k) => { const i = k - 29; return { data: dia(i), dados: { vfc: { noite: 50 + (i % 3) }, fcRepouso: 52, sono: { total: 7 * 3600, nota: 80 }, passos: 8000 + (i > -7 ? 1000 : 0), bbMax: 85, ...f(i) } }; });
const ativ = (i, carga, tipo = "running", dur = 1800) => ({ id: 900 + i, inicio: dia(i) + "T07:00:00", tipo, dados: { carga, duracao: dur, local: "Parque Secreto" } });

test("sauResumoSemana: 7 dias contra 7, médias, treinos sem caminhada, carga e minutos; caminhada fora", () => {
  const A = [ativ(-1, 100), ativ(-2, 200, "running", 3000), ativ(-3, 999, "walking", 3600), ativ(-9, 50)];
  const r = N.sauResumoSemana(dias(), A, HOJE);
  assert.equal(r.ini, dia(-6)); assert.equal(r.antIni, dia(-13)); assert.equal(r.diasComDado, 7); assert.equal(r.semDados, false);
  assert.deepEqual(r.treinos, { n: 2, dias: 2, carga: 300, min: 80 }); assert.deepEqual(r.treinosAnt, { n: 1, dias: 1, carga: 50, min: 30 });
  assert.equal(r.atual.passos.m, 9000); assert.equal(r.anterior.passos.m, 8000); assert.equal(r.atual.sono.m, 7);
  const t = r.linhas.join("\n"); assert.match(t, /Sono: média de 7 h/); assert.match(t, /Passos: 9\.000 por dia \(\+1\.000 vs\. semana anterior\)/); assert.match(t, /Treinos \(sem caminhada\): 2 treinos em 2 dias, carga 300, 80 min \(semana anterior: 1\)/);
});
test("os fatos que vão à IA: só números e rótulos; nenhum local, nome, foto ou valor bruto; 'sem dado' quando falta", () => {
  const r = N.sauResumoSemana(dias(), [ativ(-1, 100)], HOJE), f = r.fatos;
  assert.match(f, /^semana: 2026-11-17 a 2026-11-23$/m); assert.match(f, /^treinos_sem_caminhada: 1$/m); assert.match(f, /^passos_por_dia: 9000$/m);
  assert.ok(!/Parque|Secreto|local|lat|lon|nome|foto/i.test(f), "nenhum local nem texto livre");
  for (const l of f.split("\n")) assert.match(l, /^[a-z_]+: [\d.,a-z :()\-]+$/i, "linha só com rótulo e número: " + l);
  const vazio = N.sauResumoSemana(dias((i) => (i > -7 ? { vfc: undefined, fcRepouso: undefined } : {})), [], HOJE); assert.match(vazio.fatos, /^vfc_media_ms: sem dado$/m);
});
test("poucos dias: não resume (semDados) e diz quantos faltam", () => {
  const r = N.sauResumoSemana(dias().filter((d) => d.data <= dia(-4)), [], HOJE); assert.equal(r.semDados, true); assert.equal(r.diasComDado, 3);
  assert.equal(N.sauResumoSemana([], [], HOJE).semDados, true); assert.doesNotThrow(() => N.sauResumoSemana(null, null, HOJE));
});
test("ação saude.resumo: Haiku, só dono, só REAL (sem demonstração), módulo saude, sem imagens, texto curto", () => {
  const a = ACOES["saude.resumo"]; assert.ok(a);
  assert.equal(a.modelo, "claude-haiku-5-5"); assert.deepEqual(a.papeis, ["dono"]); assert.equal(a.real, true); assert.equal(a.modulo, "saude"); assert.equal(a.imagensMax, 0); assert.ok(a.textoMax <= 3000 && a.maxTokens <= 1500);
  assert.equal(temDemo("saude.resumo"), false, "sem demonstração: em DEMO a função responde sem_real");
  assert.match(a.sistema, /não invente valores/i); assert.match(a.sistema, /conselhos médicos/);
  const p = montarPedido(a, { texto: "sono_medio_horas: 7", imagens: [] }, { data: HOJE }); assert.match(p.conteudo[p.conteudo.length - 1].text, /<dados>[\s\S]*sono_medio_horas: 7[\s\S]*<\/dados>/);
});
test("validação da resposta: só números que estão nos fatos (ou contagem de dias), sem links, sem texto curto demais, nunca grava", () => {
  const a = ACOES["saude.resumo"], entrada = { texto: "sono_medio_horas: 7.2\ntreinos_sem_caminhada: 4\npassos_por_dia: 9000", imagens: [] }, ctx = { data: HOJE };
  const bom = { resumo: "Você dormiu em média 7.2 horas por noite e treinou 4 vezes esta semana, mantendo 9000 passos por dia.", destaques: ["Sono estável em 7.2 horas."], atencao: [], proximo: "Mantenha 4 treinos na próxima semana." };
  const v = a.validar(bom, ctx, entrada); assert.equal(v.ok, true); assert.deepEqual(Object.keys(v.resultado), ["resumo", "destaques", "atencao", "proximo"]);
  const ruim = (c) => a.validar({ ...bom, ...c }, ctx, entrada);
  assert.equal(ruim({ resumo: "Você dormiu 8.5 horas por noite e treinou 4 vezes esta semana, uma semana ótima." }).ok, false, "número fora dos fatos");
  assert.match(ruim({ proximo: "Chegue a 12000 passos." }).motivo, /número fora dos fatos/);
  assert.equal(ruim({ resumo: "curto" }).ok, false); assert.equal(ruim({ destaques: [] }).ok, false); assert.equal(ruim({ proximo: "" }).ok, false);
  assert.ok(!/https?:|www\./.test(JSON.stringify(ruim({ resumo: bom.resumo + " veja https://exemplo.com agora" }).resultado)), "links removidos");
  assert.equal(a.validar(bom, { data: "x" }, entrada).ok, false); assert.equal(a.validar(null, ctx, entrada).ok, false);
});
test("migration 066: libera só a ação saude.resumo para o dono, aditiva, sem tabela nem teto novos", () => {
  const sql = ler("supabase/066_ia_saude_resumo.sql"), so = sql.replace(/--.*$/gm, "");
  assert.match(sql, /^-- 066 · /); assert.match(so, /'abastecimento\.interpretar', 'newsletter\.resumo', 'hoje\.analise', 'fiscal\.nota', 'saude\.resumo'/);
  assert.match(so, /not \('saude\.resumo' = any \(acoes_reais_casa\)\)/); assert.match(so, /array_append\(acoes_reais, 'saude\.resumo'\)/); assert.match(so, /where modo = 'REAL'/);
  assert.ok(!/create table|drop table|delete from|truncate|limite_brl|teto|cambio|margem/i.test(so), "não toca tabela, limite, teto, câmbio nem margem");
});
test("site: o botão só chama pela rac-ia, depois de confirmar, uma vez por clique, e só o 'Guardar' grava (PESSOAL.saudeResumos, 8 semanas)", () => {
  const hub = ler("js/saude-hub.js"), sa = ler("js/saude.js"), f = hub.slice(hub.indexOf("function shResumoSemana"), hub.indexOf("function shGeral"));
  assert.match(sa, /racIA\("saude","saude\.resumo"/); assert.ok(!/racIA|fetch\(|anthropic/i.test(f), "a tela não chama IA direto");
  assert.match(f, /window\.confirm\("Gerar o resumo desta semana com IA\?/); assert.match(f, /bs\.onclick=function\(\)\{if\(!ult\)return;/); assert.match(f, /pessoalGravar\("saudeResumos"/); assert.match(f, /slice\(0,Math\.max\(0,Object\.keys\(o\)\.length-8\)\)/);
  assert.ok(!/setInterval|setTimeout/.test(f + sa.slice(sa.indexOf("function saudeResumoIA"), sa.indexOf("/* Lugares (Lote 5)"))), "nunca repete sozinho");
  assert.match(f, /C\.pr\.ocultar/); assert.match(hub, /shResumoSemana\(C\)/);
});
