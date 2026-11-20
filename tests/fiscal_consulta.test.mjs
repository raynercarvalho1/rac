// Central Fiscal · consulta oficial diária: lógica pura da função fiscal-consulta (sem rede, sem Secrets) e o agendamento 061. Respostas FICTÍCIAS.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { consultaHabilitada, envelopeConsulta, interpretarRetorno, consultarNota, consultarLote } from "../supabase/functions/fiscal-consulta/consulta.ts";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const K = "31261112345678000195650010000000011234567890".slice(0, 43) + "0";
const ret = (c, extra = "", motivo = "autorizado o uso") => `<?xml version="1.0"?><soap:Envelope><soap:Body><nfeResultMsg><retConsSitNFe versao="4.00"><tpAmb>1</tpAmb><cStat>${c}</cStat><xMotivo>${motivo}</xMotivo>${extra}</retConsSitNFe></nfeResultMsg></soap:Body></soap:Envelope>`;
const prot = (ch, n = "131260000000777") => `<protNFe><infProt><chNFe>${ch}</chNFe><cStat>100</cStat><nProt>${n}</nProt></infProt></protNFe>`;
const nota = { nota_id: "n1", chave: K, uf_codigo: "31", modelo: "65" };
const cfgOk = { certificado: true, urls: { 31: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeConsultaProtocolo4" }, ambiente: "1", esperaMs: 0 };
const resp = (xml, ok = true, status = 200) => async () => ({ ok, status, text: async () => xml });

test("envelope: só a chave de 44 dígitos entra, consulta (CONSULTAR) sem assinatura", () => {
  const e = envelopeConsulta(K, "1"); assert.match(e, /<xServ>CONSULTAR<\/xServ><chNFe>\d{44}<\/chNFe>/); assert.match(e, /NFeConsultaProtocolo4/);
  assert.throws(() => envelopeConsulta("123")); assert.throws(() => envelopeConsulta(K + "1")); assert.throws(() => envelopeConsulta("<x>".padEnd(44, "1")));
});
test("interpretar: 100/150 autorizada só com a MESMA chave e protocolo de 15 dígitos; 101/151/155 cancelada; 110/301/302/303 denegada; 217 não consta; 104/105 processando; resto é erro", () => {
  const a = interpretarRetorno(ret(100, prot(K)), K); assert.deepEqual([a.resultado, a.cstat, a.protocolo, a.origem], ["autorizada", 100, "131260000000777", "sefaz_ws"]); assert.match(a.evidencia, /^SEFAZ consulta protocolo · cStat 100 · autorizado o uso$/);
  assert.equal(interpretarRetorno(ret(150, prot(K)), K).resultado, "autorizada");
  assert.equal(interpretarRetorno(ret(100, prot("9".repeat(44))), K).resultado, "erro", "chave diferente nunca autoriza");
  assert.equal(interpretarRetorno(ret(100, prot(K, "123")), K).resultado, "erro", "sem protocolo válido não autoriza");
  assert.equal(interpretarRetorno(ret(100, ""), K).resultado, "erro");
  for (const c of [101, 151, 155]) assert.equal(interpretarRetorno(ret(c, "", "cancelamento homologado"), K).resultado, "cancelada");
  for (const c of [110, 301, 302, 303]) assert.equal(interpretarRetorno(ret(c, "", "uso denegado"), K).resultado, "denegada");
  assert.equal(interpretarRetorno(ret(217, "", "NF-e nao consta"), K).resultado, "nao_encontrada");
  for (const c of [104, 105]) assert.equal(interpretarRetorno(ret(c, "", "em processamento"), K).resultado, "pendente");
  for (const x of [ret(999, "", "falha"), "<html>captcha</html>", "", null, ret("abc"), "<retConsSitNFe></retConsSitNFe>"]) assert.equal(interpretarRetorno(x, K).resultado, "erro", String(x).slice(0, 30));
  assert.ok(!interpretarRetorno(ret(100, prot(K)).replace("autorizado o uso", "<script>x</script>"), K).evidencia?.includes("<"), "evidência sem marcação");
});
test("consultar: sem certificado, sem endereço da UF, endereço não oficial ou chave inválida = indisponível (nunca autoriza, nunca chama a rede)", async () => {
  let chamou = 0; const busca = async () => { chamou++; return { ok: true, status: 200, text: async () => ret(100, prot(K)) }; };
  for (const [n, c] of [[nota, { ...cfgOk, certificado: false }], [nota, { ...cfgOk, urls: {} }], [nota, { ...cfgOk, urls: { 31: "https://exemplo.com/ws" } }], [nota, { ...cfgOk, urls: { 31: "http://nfe.fazenda.mg.gov.br/ws" } }], [{ ...nota, chave: "123" }, cfgOk]]) {
    const r = await consultarNota(n, c, busca); assert.deepEqual([r.resultado, r.origem], ["indisponivel", "indisponivel"]); assert.ok(r.motivo);
  }
  assert.equal(chamou, 0);
});
test("consultar: com acesso configurado devolve o que o serviço disse; HTTP ruim vira erro; exceção de rede vira indisponível", async () => {
  assert.equal((await consultarNota(nota, cfgOk, resp(ret(100, prot(K))))).resultado, "autorizada");
  assert.equal((await consultarNota(nota, cfgOk, resp(ret(101)))).resultado, "cancelada");
  const e = await consultarNota(nota, cfgOk, resp("", false, 503)); assert.deepEqual([e.resultado, e.origem], ["erro", "sefaz_ws"]);
  const x = await consultarNota(nota, cfgOk, async () => { throw new Error("rede"); }); assert.equal(x.resultado, "indisponivel");
});
test("lote: respeita o limite e o intervalo, falha numa nota não para as outras, e quem registra recebe cada resultado", async () => {
  const notas = Array.from({ length: 5 }, (_, i) => ({ ...nota, nota_id: "n" + i })), regs = [], esperas = [];
  let k = 0; const busca = async () => { if (++k === 2) throw new Error("rede"); return { ok: true, status: 200, text: async () => ret(100, prot(K)) }; };
  const o = await consultarLote(notas, { ...cfgOk, esperaMs: 50 }, busca, async (id, r) => { regs.push([id, r.resultado]); }, async (ms) => { esperas.push(ms); }, 4);
  assert.deepEqual(regs.map((x) => x[0]), ["n0", "n1", "n2", "n3"], "limite de 4"); assert.equal(regs[1][1], "indisponivel"); assert.equal(regs[0][1], "autorizada"); assert.deepEqual(esperas, [50, 50, 50, 50]);
  assert.deepEqual([o.consultadas, o.indisponiveis], [4, 1]);
  const o2 = await consultarLote(notas.slice(0, 2), cfgOk, async () => ({ ok: true, status: 200, text: async () => ret(100, prot(K)) }), async () => { throw new Error("banco"); }, async () => {}); assert.equal(o2.erros, 2, "falha ao registrar é contada, não derruba o lote");
});
test("função e agendamento: porta só pela senha da rotina, sem JWT de usuário, sem segredo no código, sem chamada de IA; 061 diário, idempotente, não aplicado, não mexe nas outras rotinas", () => {
  const f = ler("supabase/functions/fiscal-consulta/index.ts"), sem = f.replace(/\/\/.*$/gm, "");
  assert.match(sem, /rac_rotina_ok/); assert.match(sem, /x-rac-rotina/); assert.ok(!/Authorization/i.test(sem) && !/anthropic|api\.openai/i.test(sem)); assert.match(sem, /nf_validacao_pendentes/); assert.match(sem, /nf_validacao_registrar/);
  assert.ok(!/(sk-|eyJ|BEGIN (RSA |PRIVATE )?KEY)/.test(f), "nenhum segredo no código"); assert.match(f, /NÃO FOI PUBLICADA/);
  const s = ler("supabase/propostas/061_fiscal_consulta_agendamento.sql"), q = s.replace(/^--.*$/gm, "");
  assert.match(s.split("\n")[0], /^-- status: pendente/); assert.match(s, /NÃO APLICADA EM PRODUÇÃO/); assert.match(s, /RESERVADA PARA UM LOTE FUTURO/); assert.ok(!fs.existsSync(new URL("../supabase/061_fiscal_consulta_agendamento.sql", import.meta.url)), "fora da sequência aplicável de migrations"); assert.match(q, /begin;[\s\S]*commit;/); assert.match(q, /cron\.unschedule\('fiscal-validacao'\) where exists/); assert.match(q, /cron\.schedule\('fiscal-validacao', '40 8 \* \* \*'/);
  assert.match(q, /functions\/v1\/fiscal-consulta/); assert.match(q, /decrypted_secret from vault\.decrypted_secrets where name = 'rac_rotina'/); assert.ok(!/radar-rotina|garmin|newsletter|drop |delete |alter table/i.test(q));
  assert.ok(!/(sk-|eyJ)/.test(s));
});

test("desligada por padrão: sem FISCAL_CONSULTA_ATIVA=1 e certificado a função não consulta nem grava, e nenhum Secret SEFAZ é exigido para o resto da Central Fiscal", () => {
  const env = (o) => (n) => o[n];
  assert.deepEqual(consultaHabilitada(env({})), { ativa: false, motivo: "validação oficial automática não habilitada" });
  assert.equal(consultaHabilitada(env({ SEFAZ_CERT_PEM: "x", SEFAZ_KEY_PEM: "y" })).ativa, false, "certificado sem o interruptor não liga");
  assert.equal(consultaHabilitada(env({ FISCAL_CONSULTA_ATIVA: "1" })).ativa, false); assert.match(consultaHabilitada(env({ FISCAL_CONSULTA_ATIVA: "1" })).motivo, /sem certificado/);
  assert.equal(consultaHabilitada(env({ FISCAL_CONSULTA_ATIVA: "1", SEFAZ_CERT_PEM: "x", SEFAZ_KEY_PEM: "y" })).ativa, true);
  const f = ler("supabase/functions/fiscal-consulta/index.ts"), i = f.indexOf("consultaHabilitada(ambiente)"); assert.ok(i > 0); assert.ok(i < f.indexOf('rpc("nf_validacao_pendentes"'), "o gate vem antes de ler pendentes ou consultar");
  for (const a of ["supabase/060_central_fiscal_rotinas.sql", "js/fiscal.js", "nucleo.js"]) assert.ok(!/SEFAZ_(CERT|KEY|URL)/.test(ler(a)), a + " não depende de Secrets da SEFAZ");
  assert.ok(!/captcha|recaptcha|hcaptcha/i.test(ler("supabase/functions/fiscal-consulta/consulta.ts").replace(/\/\/.*$/gm, "")), "nada de contornar proteção");
});
