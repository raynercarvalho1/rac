// Radar de Preços, Lote 4 (verificação antes da publicação da função): a função é autossuficiente (sem importar de outra função), resolve DNS com fallback seguro, respeita o tempo de uma Edge Function
// e exige --no-verify-jwt (a rotina chama sem login). Também confere o SQL 045 (fuso, duplicidade, só agendamento) e o roteiro de publicação. Sem rede, sem custo, nada publicado.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { resolverNome, DOH_URL } from "../supabase/functions/radar/dns.ts";
import { chaveServidor, chavePublica } from "../supabase/functions/radar/chaves.ts";
import { rodarColeta, ORCAMENTO_RODADA_MS } from "../supabase/functions/radar/coletores.ts";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const semComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const arquivos = fs.readdirSync(new URL("../supabase/functions/radar/", import.meta.url)).filter((f) => f.endsWith(".ts"));

test("a função radar é autossuficiente: nenhum import de outra função, de URL externa solta ou da Garmin; só o supabase-js do npm", () => {
  for (const f of arquivos) {
    const c = ler("supabase/functions/radar/" + f);
    for (const m of c.matchAll(/^(?:import|export)[^"']*from\s+["']([^"']+)["']/gm)) {
      const d = m[1]; assert.ok(d.startsWith("./") || d === "npm:@supabase/supabase-js@2", `${f} importa ${d}`); assert.ok(!/\.\.\//.test(d), `${f} importa de fora da pasta`);
    }
  }
  const idx = ler("supabase/functions/radar/index.ts"); assert.match(idx, /from "\.\/chaves\.ts"/); assert.ok(!/\.\.\/rac-ia/.test(idx));
});
test("chaves: formato novo (JSON por nome), formato antigo e fallback da chave pública", () => {
  const env = (o) => (n) => o[n];
  assert.equal(chaveServidor(env({ SUPABASE_SECRET_KEYS: '{"default":"sb_secret_x"}' })), "sb_secret_x"); assert.equal(chaveServidor(env({ SUPABASE_SERVICE_ROLE_KEY: "antiga" })), "antiga");
  assert.equal(chavePublica(env({ SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_pub"}' })), "sb_pub"); assert.equal(chavePublica(env({ SUPABASE_PUBLISHABLE_KEY: "p3" })), "p3"); assert.equal(chaveServidor(env({})), "");
});
test("DNS: usa o do ambiente; se faltar ou falhar, DNS sobre HTTPS no endereço fixo; nada resolvido = recusa; nome inválido nunca é consultado", async () => {
  const chamadas = [];
  const doh = async (url) => { chamadas.push(url); const tipo = /type=AAAA/.test(url) ? 28 : 1; return new Response(JSON.stringify({ Answer: [{ type: tipo, data: tipo === 1 ? "200.1.1.1" : "2606:4700::1" }, { type: 5, data: "cname.x." }] }), { status: 200 }); };
  assert.deepEqual(await resolverNome("loja.com.br", { resolveDns: async (h, t) => (t === "A" ? ["200.2.2.2"] : []), fetch: doh }), ["200.2.2.2"]); assert.equal(chamadas.length, 0, "com DNS do ambiente nem consulta a rede");
  assert.deepEqual(await resolverNome("loja.com.br", { fetch: doh }), ["200.1.1.1", "2606:4700::1"]); assert.ok(chamadas.every((u) => u.startsWith(DOH_URL + "?name=loja.com.br&type=")), "só o endereço fixo");
  assert.deepEqual(await resolverNome("loja.com.br", { resolveDns: async () => { throw new Error("sem suporte"); }, fetch: doh }), ["200.1.1.1", "2606:4700::1"]);
  await assert.rejects(resolverNome("loja.com.br", { fetch: async () => new Response("{}", { status: 200 }) }), /sem endereço/);
  await assert.rejects(resolverNome("loja.com.br", { fetch: async () => new Response("x", { status: 500 }) }), /doh 500/);
  const antes = chamadas.length; for (const ruim of ["", "a b.com", "loja.com.br/../x", ".x.com", "x..com", "x.com\nHost: y", "x".repeat(300) + ".com"]) await assert.rejects(resolverNome(ruim, { fetch: doh }), /nome inválido/, JSON.stringify(ruim).slice(0, 20));
  assert.equal(chamadas.length, antes, "nome inválido não gera consulta");
});
test("rodada: respeita o orçamento de tempo (para de começar ofertas e deixa o resto para a próxima), sem travar registros abertos", async () => {
  assert.ok(ORCAMENTO_RODADA_MS <= 100_000, "abaixo do limite de uma Edge Function");
  let agora = 1_000_000; const ofertas = Array.from({ length: 6 }, (_, i) => ({ id: "o" + i, item_id: "i1", loja_id: "l1", url: "https://www.kabum.com.br/produto/" + i, situacao: "ativa", equivalencia: "confirmada" }));
  const ult = ofertas.map((o) => ({ oferta_id: o.id, modalidade: "a_vista", meio: "pix", parcelas: null, preco_produto: 1, disponibilidade: "disponivel", observado_em: new Date(agora - 40 * 3600000).toISOString(), fonte: "manual" }));
  const abertas = [], fechadas = [];
  const banco = { lojas: async () => [{ id: "l1", nome: "KaBuM", dominio: "kabum.com.br", coleta_permitida: true, ativa: true }], ofertas: async () => ofertas, ultimas: async () => ult, coletasRecentes: async () => [],
    abrirColeta: async () => { abertas.push(1); return "c1"; }, fecharColeta: async (_i, r) => { fechadas.push(r); }, gravarPreco: async () => "gravado" };
  const deps = { resolver: async () => ["200.1.1.1"], fetch: async (u) => { agora += 40_000; return new Response(u.endsWith("robots.txt") ? "" : "<html></html>", { status: u.endsWith("robots.txt") ? 404 : 200, headers: { "content-type": u.endsWith("robots.txt") ? "text/plain" : "text/html" } }); } };
  const r = await rodarColeta("dono", banco, deps, () => agora, { esperar: async () => {} });
  assert.ok(r.lidas >= 1 && r.lidas < 6, "leu só o que coube no tempo: " + r.lidas); assert.equal(r.adiadas, 6 - r.lidas); assert.equal(abertas.length, fechadas.length, "toda coleta aberta foi fechada");
});
test("publicação: roteiro com --no-verify-jwt (a rotina chama sem login), projeto e nome da função corretos, só a função radar; a função recusa quem não prova ser o dono", () => {
  const doc = ler("docs/radar.md"), cmd = /npx supabase@2\.121\.0 functions deploy radar --project-ref hofnhbxnfebfnncwxrds --use-api --no-verify-jwt/;
  assert.match(doc, cmd); assert.ok(!/functions deploy (garmin|rac-ia|rac-newsletter)/.test(doc.split("## Publicação da função radar")[1] || ""), "o roteiro não publica outra função");
  const idx = ler("supabase/functions/radar/index.ts");
  assert.match(idx, /rac_rotina_ok[\s\S]*?nao_autenticado/); assert.match(idx, /getUser\(jwt\)/); assert.match(idx, /if \(mem\) return json\(\{ ok: false, erro: "sem_permissao" \}, 403\)/);
  assert.ok(!/console\.(log|info|debug)/.test(idx) && idx.split(/\r?\n/).filter((l) => /console\./.test(l)).every((l) => /registroDeErro/.test(l)), "logs só pelo registro sanitizado (diag.ts)");
  assert.match(idx, /texto\.length > 20_000/);
});
test("SQL 045: só agenda (sem dados), nome único com unschedule antes, mesma senha do Vault, horários 9h20 e 21h20 UTC = 6h20 e 18h20 de Brasília (UTC−3, sem horário de verão)", () => {
  const sql = ler("supabase/045_radar_rotina.sql"), ex = sql.replace(/--.*$/gm, "");
  assert.equal((ex.match(/cron\.schedule\(/g) || []).length, 1); assert.equal((ex.match(/cron\.unschedule\(/g) || []).length, 1); assert.ok(ex.indexOf("cron.unschedule") < ex.indexOf("cron.schedule("));
  assert.match(ex, /'radar-rotina', '20 9,21 \* \* \*'/); assert.match(ex, /net\.http_post/); assert.match(ex, /vault\.decrypted_secrets where name = 'rac_rotina'/); assert.match(ex, /"tipo":"rodada"/);
  assert.ok(!/\b(insert|update|delete|truncate|drop|alter|create|grant|revoke)\b/i.test(ex.replace(/cron\.unschedule|cron\.schedule/g, "")), "só agendamento");
  assert.ok(!/radar_|garmin|rac-ia|rac-newsletter|ia_/.test(ex.replace(/functions\/v1\/radar/, "")), "não toca em tabela nenhuma");
  /* conferência de que 9h20 e 21h20 UTC são 6h20 e 18h20 em Brasília (o fuso do Brasil não tem horário de verão desde 2019) */
  const hora = (utcH) => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(Date.UTC(2026, 10, 10, utcH, 20)));
  assert.deepEqual([hora(9), hora(21)], ["06:20", "18:20"]); for (const mes of [0, 6]) assert.equal(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date(Date.UTC(2026, mes, 15, 9, 20))), "06");
  assert.match(sql, /show cron\.timezone|cron\.timezone/, "o roteiro manda conferir o fuso do pg_cron antes");
});
