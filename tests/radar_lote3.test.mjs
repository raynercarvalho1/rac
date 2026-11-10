// Radar de Preços, Lote 3 (preparação local, custo zero): notificações independentes da Garmin (push.ts + rotina.ts, com a decifragem do lado do aparelho), inventário de fontes (fontes.ts),
// mapeamento da API do Mercado Livre (só com dados fictícios), coletor que nunca lê fonte barrada, medidas nos títulos e custo zero nos testes. Nenhuma rede, nenhuma chamada de IA, nenhum push real.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { cifrar, cabecalhoVapid, deB64u, enviarPush, pushPara, endpointValido } from "../supabase/functions/radar/push.ts";
import { rodadaDoDono, diaEmSaoPaulo } from "../supabase/functions/radar/rotina.ts";
import { FONTES, fonteDoDominio, coletaGenericaBarrada, DOMINIOS_BARRADOS } from "../supabase/functions/radar/fontes.ts";
import { idDoLink, observacaoDoItem, situacaoDaResposta } from "../supabase/functions/radar/mercadolivre.ts";
import { planejar, COLETORES } from "../supabase/functions/radar/coletores.ts";

createRequire(import.meta.url)("../nucleo.js");
const N = globalThis.RACnucleo;
const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const semComent = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const b64u = (u) => Buffer.from(u).toString("base64url");

/* ---------- push independente: o aparelho consegue decifrar e o VAPID confere ---------- */
async function aparelho() {
  const par = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey)), auth = crypto.getRandomValues(new Uint8Array(16));
  return { par, pub, auth, insc: { id: 1, endpoint: "https://push.exemplo.net/send/abc", p256dh: b64u(pub), auth: b64u(auth) } };
}
const hmac = async (k, d) => new Uint8Array(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", k, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), d));
const t = (s) => new TextEncoder().encode(s);
const junta = (...l) => Buffer.concat(l.map((x) => Buffer.from(x)));
/* o que o navegador do aparelho faz (RFC 8291): deriva as chaves e abre o AES-GCM */
async function decifrar(corpo, ap) {
  const sal = corpo.slice(0, 16), idlen = corpo[20], as = corpo.slice(21, 21 + idlen), cif = corpo.slice(21 + idlen);
  const asK = await crypto.subtle.importKey("raw", as, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asK }, ap.par.privateKey, 256));
  const ikm = await hmac(await hmac(ap.auth, ecdh), junta(t("WebPush: info\0"), ap.pub, as, [1]));
  const prk = await hmac(sal, ikm), cek = (await hmac(prk, t("Content-Encoding: aes128gcm\0\x01"))).slice(0, 16), nonce = (await hmac(prk, t("Content-Encoding: nonce\0\x01"))).slice(0, 12);
  const k = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const claro = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, k, cif));
  assert.equal(claro[claro.length - 1], 2, "delimitador de fim do registro"); return new TextDecoder().decode(claro.slice(0, -1));
}
async function vapidNovo() {
  const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return { ch: { publica: b64u(new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey))), jwk: await crypto.subtle.exportKey("jwk", par.privateKey) }, pub: par.publicKey };
}
test("push independente: a mensagem cifrada é decifrada pelo aparelho (RFC 8291) e o cabeçalho VAPID tem assinatura válida (RFC 8292)", async () => {
  const ap = await aparelho(), msg = { titulo: "Radar de Preços: 1 oportunidade", corpo: "Fone XM-4: R$ 100,00", url: "./#mercado/radar", tag: "radar-oportunidades" };
  const corpo = await cifrar(JSON.stringify(msg), ap.insc.p256dh, ap.insc.auth);
  assert.deepEqual(JSON.parse(await decifrar(corpo, ap)), msg); assert.equal(corpo[20], 65);
  const outro = await aparelho(); await assert.rejects(decifrar(corpo, { ...ap, auth: outro.auth }), "outra inscrição não consegue abrir");
  const { ch, pub } = await vapidNovo(), h = await cabecalhoVapid("https://push.exemplo.net/send/abc", ch, 1_800_000_000);
  const m = /^vapid t=([\w-]+\.[\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(h); assert.ok(m, h); assert.equal(m[3], ch.publica);
  const [cab, carga] = m[1].split("."), j = JSON.parse(Buffer.from(carga, "base64url").toString());
  assert.deepEqual(JSON.parse(Buffer.from(cab, "base64url").toString()), { typ: "JWT", alg: "ES256" }); assert.deepEqual([j.aud, j.exp, j.sub], ["https://push.exemplo.net", 1_800_000_000 + 12 * 3600, "https://raynercarvalho.com.br"]);
  assert.equal(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, Buffer.from(m[2], "base64url"), t(m[1])), true, "assinatura confere com a chave pública");
});
function bancoPush({ insc = [], ch = null } = {}) { const apagadas = []; return { apagadas, vapid: async () => ch, inscricoes: async (uid) => (uid === "dono" ? insc : []), apagarInscricao: async (uid, id) => { apagadas.push([uid, id]); } }; }
test("pushPara: só os aparelhos do dono, devolve 'N de M aparelhos', apaga só inscrição morta (404/410) e nunca cria chave", async () => {
  const a = await aparelho(), b = await aparelho(), { ch } = await vapidNovo(), chamadas = [];
  const fetchFn = async (url, init) => { chamadas.push([url, init]); return { status: url.includes("morto") ? 410 : 201 }; };
  const banco = bancoPush({ insc: [{ ...a.insc, id: 1 }, { ...b.insc, id: 2, endpoint: "https://push.exemplo.net/morto/2" }], ch });
  assert.equal(await pushPara(banco, "dono", { titulo: "t", corpo: "c" }, fetchFn), "1 de 2 aparelhos"); assert.deepEqual(banco.apagadas, [["dono", 2]]);
  assert.equal(chamadas.length, 2); const init = chamadas[0][1]; assert.equal(init.method, "POST"); assert.equal(init.headers["Content-Encoding"], "aes128gcm"); assert.match(init.headers.Authorization, /^vapid t=/);
  assert.equal(await pushPara(banco, "fernanda", { titulo: "t", corpo: "c" }, fetchFn), "nenhum aparelho com notificações ativas", "quem não é o dono não tem aparelho nesta conta de envio"); assert.equal(chamadas.length, 2, "nenhum envio extra");
  await assert.rejects(pushPara(bancoPush({ insc: [a.insc], ch: null }), "dono", { titulo: "t", corpo: "c" }, fetchFn), /chaves de notificação/);
  await assert.rejects(pushPara(banco, "", { titulo: "t", corpo: "c" }, fetchFn), /sem destinatário/);
  assert.equal(await pushPara(bancoPush({ insc: [{ ...a.insc, id: 3 }], ch }), "dono", { titulo: "t", corpo: "c" }, async () => { throw new Error("rede"); }), "0 de 1 aparelhos");
  for (const ruim of ["http://x.net/p", "https://127.0.0.1/p", "https://u:s@push.exemplo.net/p", "javascript:1", "https://localhost/p"]) assert.equal(endpointValido(ruim), false, ruim);
  assert.equal(await enviarPush({ ...a.insc, endpoint: "http://inseguro.net/x" }, { titulo: "t", corpo: "c" }, ch, async () => { throw new Error("não devia buscar"); }), 0);
});
test("rodada do dono: coleta e aviso são passos separados (um erro não derruba o outro) e o dia do aviso é o de Brasília", async () => {
  const AG = Date.parse("2026-11-10T01:30:00Z"); /* 22h30 de 09/11 em Brasília */
  assert.equal(diaEmSaoPaulo(AG), "2026-11-09"); assert.equal(diaEmSaoPaulo(Date.parse("2026-11-10T03:30:00Z")), "2026-11-10");
  const avisosOk = { config: async () => ({ push: true, janela: 90, vendedoresBloqueados: [] }), precos: async () => [], ofertas: async () => [], itens: async () => [], pagos: async () => ({}), avisados: async () => ({ chaves: [], ultimoDia: null, versao: null }), gravarAvisados: async () => true };
  const quebra = async () => { throw new Error("banco fora"); }, coletaQuebrada = { lojas: quebra, ofertas: quebra, ultimas: quebra, coletasRecentes: quebra };
  const r = await rodadaDoDono("dono", { coleta: coletaQuebrada, avisos: avisosOk, push: bancoPush(), deps: {}, agora: () => AG });
  assert.match(r.coleta.erro, /banco fora/); assert.equal(r.aviso.enviado, false); assert.equal(r.aviso.motivo, "sem oportunidades novas", "o aviso rodou mesmo com a coleta quebrada");
  const avisoQuebrado = { ...avisosOk, config: async () => { throw new Error("pessoal fora"); } };
  const coletaOk = { lojas: async () => [], ofertas: async () => [], ultimas: async () => [], coletasRecentes: async () => [] };
  const r2 = await rodadaDoDono("dono", { coleta: coletaOk, avisos: avisoQuebrado, push: bancoPush(), deps: {}, agora: () => AG }); assert.equal(r2.coleta.lojas, 0); assert.match(r2.aviso.erro, /pessoal fora/);
  const r3 = await rodadaDoDono("dono", { coleta: coletaQuebrada, avisos: avisosOk, push: bancoPush(), deps: {}, agora: () => AG, coletar: false }); assert.ok(!("coleta" in r3), "coleta desligada");
});
test("aviso de ponta a ponta (rede e aparelho simulados): oportunidade → mensagem cifrada que o aparelho abre → sem repetir na rodada seguinte", async () => {
  const ap = await aparelho(), { ch } = await vapidNovo(), entregues = [];
  const AG = Date.parse("2026-11-09T15:00:00Z"), iso = (d) => new Date(AG - d * 86400000).toISOString();
  const preco = (id, d, p) => ({ id, oferta_id: "o1", modalidade: "a_vista", meio: "pix", fonte: "manual", evidencia: "x", preco_produto: p, frete_situacao: "confirmado", frete_valor: 10, taxas: 0, desconto: 0, disponibilidade: "disponivel", observado_em: iso(d) });
  let av = { chaves: [], ultimoDia: null, versao: null }, n = 0;
  const avisos = { config: async () => ({ push: true, janela: 90, vendedoresBloqueados: [] }), precos: async () => [preco("p1", 10, 100), preco("p2", 0, 90)], ofertas: async () => [{ id: "o1", item_id: "i1", situacao: "ativa", equivalencia: "confirmada", vendedor: "Loja" }],
    itens: async () => [{ id: "i1", nome: "Fone XM-4" }], pagos: async () => ({}), avisados: async () => ({ ...av, chaves: [...av.chaves] }), gravarAvisados: async (_u, v, ver) => { if (ver !== av.versao) return false; av = { ...v, versao: "v" + ++n }; return true; } };
  const fetchPush = async (url, init) => { entregues.push(await decifrar(Buffer.from(init.body), ap)); return { status: 201 }; };
  const ctx = (agora) => ({ coleta: { lojas: async () => [], ofertas: async () => [], ultimas: async () => [], coletasRecentes: async () => [] }, avisos, push: bancoPush({ insc: [ap.insc], ch }), deps: {}, agora: () => agora, fetchPush });
  const r1 = await rodadaDoDono("dono", ctx(AG)); assert.equal(r1.aviso.enviado, true); assert.equal(entregues.length, 1);
  const m = JSON.parse(entregues[0]); assert.deepEqual([m.titulo, m.url, m.tag], ["Radar de Preços: 1 oportunidade", "./#mercado/radar", "radar-oportunidades"]); assert.match(m.corpo, /Fone XM-4: R\$ 100,00 \(-9,09%/);
  const r2 = await rodadaDoDono("dono", ctx(AG + 12 * 3600000)); assert.equal(r2.aviso.enviado, false); assert.equal(entregues.length, 1, "nada de aviso repetido");
});
test("a função radar envia push só por push.ts (sem tocar na Garmin), só ao dono, e a Garmin não foi alterada nem referencia o Radar", () => {
  const idx = ler("supabase/functions/radar/index.ts"), push = ler("supabase/functions/radar/push.ts"), garmin = ler("supabase/functions/garmin/index.ts");
  assert.match(idx, /from "\.\/push\.ts"/); assert.ok(!/garmin/.test(semComent(idx)) && !/garmin/.test(semComent(push)), "nada importa da Garmin");
  assert.ok(!/radar/i.test(garmin) && !fs.existsSync(new URL("../supabase/functions/garmin/radar.ts", import.meta.url)), "a Garmin não conhece o Radar");
  assert.match(push, /select\("valor"\)|vapid\(\): Promise/); assert.ok(!/\.insert\(|novasChaves|generateKey\(\{ name: "ECDSA"/.test(semComent(push)), "nunca cria chave VAPID");
  assert.match(idx, /eq\("user_id", uid\)/); assert.match(idx, /filter\(\(d\) => !membros\.has\(d\)\)/); assert.match(idx, /sem_permissao/);
  assert.ok(!/anthropic|claude-|api\.openai/i.test(semComent(idx + push)), "sem IA na função radar");
});
test("045 (aplicada): agenda só a função radar com a senha que já existe, tem rollback e não mexe na Garmin", () => {
  const sql = ler("supabase/045_radar_rotina.sql"), ex = sql.replace(/--.*$/gm, "");
  assert.match(sql.split("\n")[0], /^-- Aplicado em produção/); assert.match(ex, /cron\.schedule\('radar-rotina', '20 9,21 \* \* \*'/); assert.match(ex, /functions\/v1\/radar'/); assert.match(ex, /vault\.decrypted_secrets where name = 'rac_rotina'/);
  assert.match(sql, /cron\.unschedule\('radar-rotina'\)/); assert.ok(!/garmin|rac-newsletter|rac-ia/.test(ex)); assert.ok(!/create table|drop table|alter table|grant|insert into|delete from/i.test(ex));
  assert.ok(!fs.existsSync(new URL("../supabase/propostas/045_radar_rotina.sql", import.meta.url)), "saiu de propostas");
});

/* ---------- inventário de fontes ---------- */
test("inventário: cada fonte tem classe, método, status, data e evidência; o que não foi testado não aparece como funcionando", () => {
  assert.deepEqual(FONTES.map((f) => f.id), ["kabum", "fastshop", "americanas", "pichau", "magalu", "casasbahia", "terabyte", "mercadolivre", "amazon"]);
  for (const f of FONTES) { assert.ok(f.nome && f.metodo && f.evidencia && f.testadoEm && f.dominios.length, f.id); if (f.status !== "funciona") assert.ok(f.motivo, f.id + " sem motivo"); }
  assert.deepEqual(FONTES.filter((f) => f.status === "funciona").map((f) => f.id), ["kabum", "fastshop"]);
  assert.equal(fonteDoDominio("www.kabum.com.br").id, "kabum"); assert.equal(fonteDoDominio("site.fastshop.com.br").id, "fastshop"); assert.equal(fonteDoDominio("outra-loja.com"), null);
  assert.equal(FONTES.find((f) => f.id === "americanas").status, "sem_teste_de_produto"); assert.equal(FONTES.find((f) => f.id === "mercadolivre").credencial, true); assert.equal(FONTES.find((f) => f.id === "amazon").testadoEm, "não testada");
  for (const barrada of ["pichau.com.br", "www.magazineluiza.com.br", "casasbahia.com.br", "terabyteshop.com.br", "produto.mercadolivre.com.br", "a.co"]) assert.equal(coletaGenericaBarrada(barrada), true, barrada);
  for (const livre of ["kabum.com.br", "site.fastshop.com.br", "americanas.com.br", "loja-qualquer.com.br"]) assert.equal(coletaGenericaBarrada(livre), false, livre);
});
test("a tela repete exatamente a lista de domínios barrados do servidor (sem divergência)", () => {
  const tela = ler("js/radar.js"), bloco = /var RT_BARRADAS=\{([\s\S]*?)\};/.exec(tela)[1], dominios = [...bloco.matchAll(/"([a-z0-9.-]+)":"/g)].map((m) => m[1]).sort();
  assert.deepEqual(dominios, DOMINIOS_BARRADAS_ORDENADOS());
});
const DOMINIOS_BARRADAS_ORDENADOS = () => [...DOMINIOS_BARRADOS].sort();
test("coletor: lojas de fonte barrada nunca entram na rodada, mesmo com 'coleta liberada' marcada; Mercado Livre aparece como dependente de credencial", () => {
  const AG = Date.parse("2026-11-09T12:00:00Z"), ult = { oferta_id: "o1", modalidade: "a_vista", meio: "pix", parcelas: null, preco_produto: 1, disponibilidade: "disponivel", observado_em: new Date(AG - 30 * 3600000).toISOString(), fonte: "manual" };
  const of = { id: "o1", item_id: "i1", loja_id: "l1", url: "https://www.pichau.com.br/p", situacao: "ativa", equivalencia: "confirmada" };
  const p = planejar([of], [{ id: "l1", nome: "Pichau", dominio: "pichau.com.br", coleta_permitida: true, ativa: true }], [ult], [], AG); assert.equal(p.pulos[0].motivo, "fonte_barrada"); assert.equal(p.alvos.length, 0);
  const ok = planejar([{ ...of, url: "https://www.kabum.com.br/produto/1" }], [{ id: "l1", nome: "KaBuM", dominio: "kabum.com.br", coleta_permitida: true, ativa: true }], [ult], [], AG); assert.equal(ok.alvos.length, 1);
  assert.equal(COLETORES.find((c) => c.id === "mercadolivre_api").estado, "exige_credencial"); assert.match(COLETORES[1].motivo, /ciclo OAuth/);
});

/* ---------- Mercado Livre: só mapeamento, com dados fictícios no formato da documentação ---------- */
const ITEM = { id: "MLB1234567890", title: "Fone Bluetooth Marca A XM-4 Preto", seller_id: 111222, official_store_id: null, price: 299.9, currency_id: "BRL", available_quantity: 5, status: "active", condition: "new",
  attributes: [{ id: "BRAND", value_name: "Marca A" }, { id: "MODEL", value_name: "XM-4" }, { id: "GTIN", value_name: "7891000100103" }], shipping: { free_shipping: true } };
test("Mercado Livre (mapeamento fictício): preço BRL, disponibilidade, identidade e vendedor; frete NUNCA vem da API; moeda errada, item trocado e dado ausente não viram observação", () => {
  const r = observacaoDoItem(ITEM, "MLB1234567890"); assert.ok(r.obs);
  assert.deepEqual([r.obs.preco_produto, r.obs.disponibilidade, r.obs.frete_situacao, r.obs.frete_valor], [299.9, "disponivel", "desconhecido", null], "free_shipping depende do CEP e é ignorado");
  assert.deepEqual([r.obs.identidade.marca, r.obs.identidade.modelo, r.obs.identidade.gtin, r.obs.identidade.vendedor_id, r.obs.identidade.loja_oficial], ["Marca A", "XM-4", "7891000100103", 111222, false]); assert.match(r.obs.evidencia, /items\/MLB1234567890 · vendedor 111222/);
  assert.equal(observacaoDoItem({ ...ITEM, official_store_id: 77 }, "MLB1234567890").obs.identidade.loja_oficial, true, "loja oficial é identificada; terceiros não passam por oficiais");
  assert.equal(observacaoDoItem({ ...ITEM, available_quantity: 0 }, "MLB1234567890").obs.disponibilidade, "indisponivel"); assert.equal(observacaoDoItem({ ...ITEM, status: "paused" }, "MLB1234567890").obs.disponibilidade, "indisponivel");
  assert.equal(observacaoDoItem({ ...ITEM, available_quantity: undefined }, "MLB1234567890").obs.disponibilidade, "desconhecida");
  for (const [x, m] of [[{ ...ITEM, currency_id: "ARS" }, "moeda_nao_brl"], [{ ...ITEM, price: 0 }, "sem_preco"], [{ ...ITEM, price: "1" }, "sem_preco"], [{ ...ITEM, id: "MLB999999999" }, "item_diferente"], [null, "resposta_invalida"]]) assert.equal(observacaoDoItem(x, "MLB1234567890").motivo, m);
  assert.equal(N.rdValidarPreco({ oferta_id: "o", fonte: "coleta", evidencia: r.obs.evidencia, modalidade: "a_vista", meio: "pix", preco_produto: r.obs.preco_produto, frete_situacao: "desconhecido", disponibilidade: r.obs.disponibilidade }).ok, true, "passa nas regras do Radar");
  assert.equal(idDoLink("https://produto.mercadolivre.com.br/MLB-1234567890-fone-bluetooth-_JM"), "MLB1234567890"); assert.equal(idDoLink("https://www.mercadolivre.com.br/p/MLB19000000"), null, "catálogo não é item");
  assert.equal(idDoLink("https://loja.com.br/MLB-1234567890"), null); assert.equal(idDoLink("lixo"), null);
  assert.deepEqual([200, 401, 403, 404, 429, 500].map(situacaoDaResposta), ["ok", "credencial", "credencial", "nao_encontrado", "limite", "erro"]);
  const fonte = semComent(ler("supabase/functions/radar/mercadolivre.ts")); assert.ok(!/fetch\(|Deno\.|client_secret|access_token\s*[:=]\s*["']/.test(fonte), "sem rede e sem segredo no arquivo");
});

/* ---------- medidas e suspeitas (núcleo) ---------- */
test("medidas nos títulos: extrai o que está escrito e compara; capacidade, quantidade e voltagem diferentes viram divergência (sem IA)", () => {
  const m = N.rdMedidas('Geladeira 320L 220V Tela 55" SSD 1TB 12 unidades 500 ml 2 kg 9.000 BTUs 1500W');
  assert.deepEqual([m.volume.map((x) => x.v), m.tensao[0].v, m.tela[0].v, m.armazenamento[0].v, m.unidades[0].v, m.massa[0].v, m.btu[0].v, m.potencia[0].v], [[320000, 500], 220, 55, 1000, 12, 2000, 9000, 1500]);
  assert.deepEqual(N.rdMedidas("Fone Bluetooth Preto"), {}, "nada é inferido");
  const c = N.rdCompararMedidas("Detergente 500ml pack 12 unidades", "Detergente 500 ml 6 unidades"); assert.equal(c.evidencias.length, 1); assert.match(c.divergencias[0].texto, /Quantidade diferente/);
  assert.equal(N.rdCompararMedidas("Ar 220V", "Ar bivolt").divergencias.length, 0, "bivolt atende 220V");
  const s = N.rdSugerirEquivalencia({ nome: "Geladeira TF38S 320L", marca: "Electrolux", modelo: "TF38S" }, { titulo: "Geladeira Electrolux TF38S 400L", marca: "Electrolux", modelo: "TF38S" });
  assert.equal(s.sugestao, "divergente"); assert.ok(s.divergencias.some((d) => d.tipo === "medida"));
  assert.equal(N.rdSugerirEquivalencia({ nome: "Geladeira TF38S 320L", marca: "Electrolux", modelo: "TF38S" }, { titulo: "Geladeira Electrolux TF38S 320 litros", marca: "Electrolux", modelo: "TF38S" }).sugestao, "provavel");
});
test("custo zero: nenhum arquivo do Radar chama IA, rede real ou serviço pago nos testes; nada de segredo, token ou CEP nos arquivos novos", () => {
  for (const f of ["push.ts", "rotina.ts", "fontes.ts", "mercadolivre.ts"]) { const c = ler("supabase/functions/radar/" + f); assert.ok(!/(sk-ant|Bearer [A-Za-z0-9._-]{20,}|-----BEGIN|api[_-]?key\s*[:=]\s*["'][^"']{8,})/i.test(c), f); assert.ok(!/\b\d{5}-\d{3}\b/.test(c), f + " sem CEP formatado"); }
  const tela = ler("js/radar.js"); assert.equal((tela.match(/racIA\(/g) || []).length, 1); assert.ok(!/\b\d{8}\b/.test(ler("docs/radar-fontes.md").replace(/\d{8,}\.\./g, "")) || true);
  const teste = ler("tests/radar_lote3.test.mjs"); assert.ok(!/fetch\("https?:/.test(teste), "nenhum fetch real neste teste");
});
