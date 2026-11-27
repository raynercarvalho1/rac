// RAC Inbox · I4 · conexão OAuth do Gmail e do Outlook (oauth.ts, servico.ts, migration 063). Rede e cofre de MENTIRA: nada vai ao Google nem à Microsoft.
// TUDO FICTÍCIO (client ids, secrets, códigos e tokens abaixo não são de ninguém). NÃO prova o Google/Microsoft reais: isso só se prova com as credenciais do dono (docs/inbox.md, "Gmail e Outlook").
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ESCOPOS, ENDPOINTS, novoPkce, hashDoEstado, urlAutorizacao, trocarCodigo, renovarAcesso, identidade, revogar, empacotarOauth, desempacotarOauth, RE_STATE } from "../supabase/functions/rac-inbox/oauth.ts";
import { validarPedido, ERROS, VERSAO_FUNCAO } from "../supabase/functions/rac-inbox/contrato.ts";
import { atender, ESCRITA_OAUTH } from "../supabase/functions/rac-inbox/servico.ts";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const U1 = "11111111-1111-4111-8111-111111111111", U2 = "33333333-3333-4333-8333-333333333333", G1 = "aaaaaaaa-0000-4000-8000-000000000001", G2 = "aaaaaaaa-0000-4000-8000-000000000002", O1 = "aaaaaaaa-0000-4000-8000-000000000003", I1 = "aaaaaaaa-0000-4000-8000-000000000004";
const CFG = { gmail: { clientId: "id-google.example", clientSecret: "SEGREDO-GOOGLE-FICTICIO", redirectUri: "https://site.example/" }, outlook: { clientId: "id-ms.example", clientSecret: "SEGREDO-MS-FICTICIO", redirectUri: "https://site.example/" } };
const REFRESH = "1//refresh-token-fictício-do-google-0123456789", REFRESH_MS = "M.R3_refresh-token-fictício-da-microsoft-0123456789", ACESSO = "ya29.acesso-fictício-0123456789";
const CODIGO = "4/0AeaYSHcodigo-ficticio-0123456789";

/* rede de mentira: registra cada chamada e responde pela tabela {url-prefixo → resposta} */
function rede(rotas) {
  const chamadas = [];
  const http = async (url, init = {}) => { chamadas.push({ url, ...init }); for (const [pref, r] of Object.entries(rotas)) if (url.startsWith(pref)) { const x = typeof r === "function" ? r(url, init) : r; if (x instanceof Error) throw x; return { ok: x.status >= 200 && x.status < 300, status: x.status, json: async () => { if (x.invalido) throw new Error("json"); return x.corpo; } }; } throw new Error("rota inesperada " + url); };
  return { http, chamadas };
}
const OK_TOKEN_G = { status: 200, corpo: { access_token: ACESSO, expires_in: 3599, refresh_token: REFRESH, scope: "x" } };

test("pkce: state de 43 caracteres, verificador de 64, desafio S256 conferido, hash hex do state; cada chamada é nova", async () => {
  const a = await novoPkce(), b = await novoPkce();
  assert.match(a.estado, RE_STATE); assert.equal(a.verificador.length, 64); assert.notEqual(a.estado, b.estado); assert.notEqual(a.verificador, b.verificador);
  const esperado = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(a.verificador))).toString("base64url"); assert.equal(a.desafio, esperado);
  assert.equal(a.estadoHash, await hashDoEstado(a.estado)); assert.match(a.estadoHash, /^[0-9a-f]{64}$/);
});

test("url de autorização: Google (offline + consent + gmail.modify) e Microsoft (Graph, offline_access); state, PKCE S256 e redirect só dos Secrets; o login_hint é o endereço da conta", () => {
  const g = new URL(urlAutorizacao("gmail", CFG.gmail, { estado: "E".repeat(43), desafio: "D".repeat(43), loginHint: "rayner@gmail.example" }));
  assert.equal(g.origin + g.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(g.searchParams.get("scope"), "openid email https://www.googleapis.com/auth/gmail.modify"); assert.equal(g.searchParams.get("access_type"), "offline"); assert.equal(g.searchParams.get("prompt"), "consent");
  assert.equal(g.searchParams.get("code_challenge_method"), "S256"); assert.equal(g.searchParams.get("redirect_uri"), "https://site.example/"); assert.equal(g.searchParams.get("login_hint"), "rayner@gmail.example"); assert.equal(g.searchParams.get("response_type"), "code");
  assert.ok(!g.toString().includes("SEGREDO"), "o client secret nunca vai ao navegador");
  const m = new URL(urlAutorizacao("outlook", CFG.outlook, { estado: "E".repeat(43), desafio: "D".repeat(43) }));
  assert.equal(m.origin + m.pathname, "https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
  assert.deepEqual(m.searchParams.get("scope").split(" "), ["offline_access", "openid", "email", "User.Read", "Mail.ReadWrite", "Mail.Send"]); assert.equal(m.searchParams.get("response_mode"), "query"); assert.ok(!m.searchParams.has("login_hint"));
  assert.ok(!ESCOPOS.gmail.concat(ESCOPOS.outlook).some((e) => /mail\.google\.com\/$|MailboxSettings|Mail\.ReadWrite\.All|full_access/i.test(e)), "escopos mínimos: nada de acesso total nem de exclusão permanente");
});

test("troca do código: manda client secret e verificador SÓ ao token endpoint do provedor; devolve refresh e acesso; recusa e indisponibilidade viram código fechado, sem repetir o corpo do provedor", async () => {
  const r = rede({ "https://oauth2.googleapis.com/token": OK_TOKEN_G });
  const t = await trocarCodigo("gmail", CFG.gmail, { codigo: CODIGO, verificador: "V".repeat(64) }, r.http, 1000);
  assert.deepEqual([t.ok, t.refresh, t.acesso, t.expiraEm], [true, REFRESH, ACESSO, 1000 + 3599000]);
  const c = r.chamadas[0], corpo = new URLSearchParams(c.body); assert.equal(c.method, "POST"); assert.equal(corpo.get("grant_type"), "authorization_code"); assert.equal(corpo.get("code_verifier"), "V".repeat(64)); assert.equal(corpo.get("client_secret"), "SEGREDO-GOOGLE-FICTICIO");
  const rm = rede({ "https://login.microsoftonline.com/common/oauth2/v2.0/token": { status: 200, corpo: { access_token: ACESSO, refresh_token: REFRESH_MS, expires_in: 3600 } } });
  assert.equal((await trocarCodigo("outlook", CFG.outlook, { codigo: CODIGO, verificador: "V".repeat(64) }, rm.http)).refresh, REFRESH_MS); assert.match(new URLSearchParams(rm.chamadas[0].body).get("scope"), /Mail\.Send/);
  for (const [resp, esperado] of [[{ status: 400, corpo: { error: "invalid_grant", error_description: "SEGREDO-DO-PROVEDOR" } }, "oauth_recusado"], [{ status: 200, corpo: {} }, "oauth_recusado"], [{ status: 200, invalido: true }, "oauth_recusado"], [{ status: 503, corpo: {} }, "oauth_indisponivel"], [{ status: 429, corpo: {} }, "oauth_indisponivel"], [new Error("rede SEGREDO-DE-REDE"), "oauth_indisponivel"]]) {
    const x = await trocarCodigo("gmail", CFG.gmail, { codigo: CODIGO, verificador: "V".repeat(64) }, rede({ "https://oauth2.googleapis.com": resp }).http);
    assert.deepEqual(x, { ok: false, erro: esperado }); assert.ok(!JSON.stringify(x).includes("SEGREDO"), "o corpo/erro do provedor nunca é copiado");
  }
});

test("renovação do token: acesso novo a cada operação; Microsoft rotaciona o refresh (refreshNovo); invalid_grant = autenticação recusada; 5xx/rede = serviço indisponível", async () => {
  const g = await renovarAcesso("gmail", CFG.gmail, REFRESH, rede({ "https://oauth2.googleapis.com/token": { status: 200, corpo: { access_token: ACESSO, expires_in: 3599 } } }).http, 0);
  assert.deepEqual(g, { ok: true, acesso: ACESSO, expiraEm: 3599000, refreshNovo: null });
  const m = await renovarAcesso("outlook", CFG.outlook, REFRESH_MS, rede({ "https://login.microsoftonline.com": { status: 200, corpo: { access_token: ACESSO, refresh_token: "M.R3_NOVO-0123456789", expires_in: 3600 } } }).http, 0);
  assert.equal(m.refreshNovo, "M.R3_NOVO-0123456789");
  const um = rede({ "https://oauth2.googleapis.com/token": { status: 400, corpo: { error: "invalid_grant" } } }); assert.deepEqual(await renovarAcesso("gmail", CFG.gmail, REFRESH, um.http), { ok: false, erro: "autenticacao_recusada" });
  assert.equal(new URLSearchParams(um.chamadas[0].body).get("grant_type"), "refresh_token");
  assert.deepEqual(await renovarAcesso("gmail", CFG.gmail, REFRESH, rede({ "https://oauth2.googleapis.com": { status: 500, corpo: {} } }).http), { ok: false, erro: "servico_indisponivel" });
  assert.deepEqual(await renovarAcesso("gmail", CFG.gmail, REFRESH, rede({ "https://oauth2.googleapis.com": new Error("x") }).http), { ok: false, erro: "servico_indisponivel" });
});

test("identidade e revogação: e-mail em minúsculas do Google (verificado) e da Microsoft (mail ou userPrincipalName); revogar só no Google e só como melhor esforço", async () => {
  assert.equal(await identidade("gmail", ACESSO, rede({ "https://openidconnect.googleapis.com": { status: 200, corpo: { email: "Rayner@Gmail.example", email_verified: true } } }).http), "rayner@gmail.example");
  assert.equal(await identidade("gmail", ACESSO, rede({ "https://openidconnect.googleapis.com": { status: 200, corpo: { email: "a@gmail.example", email_verified: false } } }).http), null);
  assert.equal(await identidade("outlook", ACESSO, rede({ "https://graph.microsoft.com": { status: 200, corpo: { mail: null, userPrincipalName: "Eu@Outlook.example" } } }).http), "eu@outlook.example");
  assert.equal(await identidade("outlook", ACESSO, rede({ "https://graph.microsoft.com": { status: 401, corpo: {} } }).http), null);
  const r = rede({ "https://oauth2.googleapis.com/revoke": { status: 200, corpo: {} } }); assert.equal(await revogar("gmail", REFRESH, r.http), true); assert.equal(new URLSearchParams(r.chamadas[0].body).get("token"), REFRESH);
  assert.equal(await revogar("outlook", REFRESH_MS, r.http), false, "a Microsoft não tem endpoint de revogação"); assert.equal(r.chamadas.length, 1);
  assert.equal(await revogar("gmail", REFRESH, rede({ "https://oauth2.googleapis.com": new Error("x") }).http), false);
});

test("empacotar: só o refresh token vai ao Vault; blob de senha de app (iCloud) não é aceito como OAuth e vice-versa", () => {
  assert.deepEqual(desempacotarOauth(empacotarOauth(REFRESH)), { refresh: REFRESH }); assert.equal(desempacotarOauth('{"u":"a@icloud.example","s":"aaaa-bbbb-cccc-dddd"}'), null); assert.equal(desempacotarOauth("lixo"), null); assert.equal(desempacotarOauth('{"o":1,"r":"curto"}'), null);
  assert.ok(!/access|acesso/i.test(empacotarOauth(REFRESH)), "nenhum token de acesso no segredo");
});

test("contrato: oauth_iniciar e oauth_concluir têm esquema fechado; o código do provedor é ASCII visível; campos extras, ID ruim e state curto são recusados; os novos códigos têm HTTP", () => {
  assert.deepEqual(validarPedido({ operacao: "oauth_iniciar", conta_id: G1 }), { ok: true, pedido: { operacao: "oauth_iniciar", conta_id: G1 } });
  assert.equal(validarPedido({ operacao: "oauth_iniciar", conta_id: "x" }).erro, "id_invalido"); assert.equal(validarPedido({ operacao: "oauth_iniciar", conta_id: G1, redirect_uri: "https://evil.example" }).erro, "campos_inesperados", "o redirect nunca vem do navegador");
  const ok = validarPedido({ operacao: "oauth_concluir", state: "S".repeat(43), code: CODIGO }); assert.equal(ok.ok, true);
  for (const ruim of [{ state: "curto", code: CODIGO }, { state: "S".repeat(43), code: "curto" }, { state: "S".repeat(43), code: "com espaço no código" }, { state: "S".repeat(43), code: "x".repeat(4097) }, { state: "S".repeat(43) }]) assert.equal(validarPedido({ operacao: "oauth_concluir", ...ruim }).ok, false);
  assert.equal(validarPedido({ operacao: "oauth_concluir", state: "S".repeat(43), code: CODIGO, conta_id: G1 }).erro, "campos_inesperados", "a conta vem do state guardado no servidor, nunca do navegador");
  for (const c of ["oauth_nao_configurado", "oauth_estado_invalido", "oauth_recusado", "oauth_conta_divergente", "oauth_indisponivel", "provedor_invalido", "provedor_sem_leitura"]) assert.ok(ERROS[c] >= 400, c);
  assert.equal(VERSAO_FUNCAO, "rac-inbox@i4.4");
});

/* ---------- serviço: cofre, banco e rede de mentira ---------- */
function cenario({ contas = null, rotas = null, oauth = CFG, mfaOk = true, falhaOauthAbrir = null, falhaGuardar = null } = {}) {
  const C = contas ?? { [G1]: { provedor: "gmail", endereco: "rayner@gmail.example", dono: U1 }, [G2]: { provedor: "gmail", endereco: "raynim@gmail.example", dono: U1 }, [O1]: { provedor: "outlook", endereco: "eu@outlook.example", dono: U1 }, [I1]: { provedor: "icloud", endereco: "p@icloud.example", dono: U1 } };
  const est = new Map(), seg = new Map(), log = [], estados = [], logs = [];
  const cofre = {
    async oauthAbrir(d, c, h, v) { log.push(["abrir", d, c]); if (falhaOauthAbrir) throw falhaOauthAbrir; est.set(h, { dono: d, conta_id: c, provedor: C[c].provedor, verificador: v }); return C[c].provedor; },
    async oauthConsumir(d, h) { log.push(["consumir", d]); const e = est.get(h); if (!e || e.dono !== d) { const x = new Error("estado_invalido"); x.codigo = "P0002"; throw x; } est.delete(h); return { conta_id: e.conta_id, provedor: e.provedor, verificador: e.verificador }; },
    async guardar(d, c, s) { log.push(["guardar", d, c]); if (falhaGuardar) throw falhaGuardar; seg.set(d + "|" + c, s); },
    async ler(d, c) { return seg.get(d + "|" + c) ?? null; }, async remover(d, c) { log.push(["remover", d, c]); return seg.delete(d + "|" + c); }, async estado() { return "ativa"; }, async marcar(d, c, e) { log.push(["marcar", c, e]); } };
  const banco = { async contaProvedor(d, c) { const x = C[c]; return x && x.dono === d ? { provedor: x.provedor, endereco: x.endereco } : null; }, async estadoConta(d, c, e) { estados.push([c, e]); } };
  const r = rotas ? rede(rotas) : null;
  const ctx = { usuario: { id: U1, mfaOk }, cofre, banco, worker: null, oauth, http: r?.http, registrar: (e) => logs.push(e) };
  return { ctx, est, seg, log, estados, logs, rede: r, C };
}
const ROTAS_G = (email = "rayner@gmail.example", token = OK_TOKEN_G) => ({ "https://oauth2.googleapis.com/token": token, "https://openidconnect.googleapis.com": { status: 200, corpo: { email, email_verified: true } }, "https://oauth2.googleapis.com/revoke": { status: 200, corpo: {} } });
const iniciar = async (c, conta) => { const r = await atender({ operacao: "oauth_iniciar", conta_id: conta }, c.ctx); const u = r.corpo.url ? new URL(r.corpo.url) : null; return { r, u, state: u?.searchParams.get("state") }; };

test("oauth_iniciar: devolve só a URL do provedor certo (Gmail ou Outlook), guarda o state (hash) e o verificador no servidor, nunca o client secret; iCloud, conta alheia e sem configuração são recusados", async () => {
  const c = cenario({ rotas: {} });
  const g = await iniciar(c, G1); assert.equal(g.r.status, 200); assert.equal(g.r.corpo.provedor, "gmail"); assert.equal(g.u.host, "accounts.google.com"); assert.equal(g.u.searchParams.get("login_hint"), "rayner@gmail.example");
  assert.equal(c.est.size, 1); const [h, e] = [...c.est.entries()][0]; assert.equal(h, await hashDoEstado(g.state), "só o HASH do state fica guardado"); assert.ok(!JSON.stringify(g.r).includes("SEGREDO") && !g.r.corpo.url.includes(e.verificador), "nem o secret nem o verificador vão ao navegador");
  assert.equal((await iniciar(c, O1)).u.host, "login.microsoftonline.com");
  assert.equal((await iniciar(c, I1)).r.corpo.erro, "provedor_invalido"); assert.equal((await atender({ operacao: "oauth_iniciar", conta_id: G1 }, { ...c.ctx, usuario: { id: U2, mfaOk: true } })).corpo.erro, "conta_inexistente");
  assert.equal((await iniciar(cenario({ rotas: {}, oauth: {} }), G1)).r.corpo.erro, "oauth_nao_configurado"); assert.equal((await iniciar(cenario({ rotas: {}, oauth: { gmail: CFG.gmail } }), O1)).r.corpo.erro, "oauth_nao_configurado", "cada provedor depende da própria configuração");
  assert.equal((await atender({ operacao: "oauth_iniciar", conta_id: G1 }, { ...c.ctx, http: undefined })).corpo.erro, "oauth_nao_configurado");
  assert.equal((await atender({ operacao: "oauth_iniciar", conta_id: G1 }, { ...c.ctx, usuario: null })).corpo.erro, "sem_login"); assert.equal((await atender({ operacao: "oauth_iniciar", conta_id: G1 }, { ...c.ctx, usuario: { id: U1, mfaOk: false } })).corpo.erro, "mfa_requerido");
  const lim = Object.assign(new Error("x"), { codigo: "54000" }); assert.equal((await iniciar(cenario({ rotas: {}, falhaOauthAbrir: lim }), G1)).r.corpo.erro, "limite");
});

test("oauth_concluir (Gmail): consome o state (uso único), troca o código, confere a conta, guarda SÓ o refresh no cofre, marca ativa e conectada, e a resposta/registro não têm token nem código", async () => {
  const c = cenario({ rotas: ROTAS_G() }), { state } = await iniciar(c, G1);
  const r = await atender({ operacao: "oauth_concluir", state, code: CODIGO }, c.ctx);
  assert.deepEqual([r.status, r.corpo], [200, { ok: true, conectada: true, provedor: "gmail" }]);
  assert.equal(c.seg.get(U1 + "|" + G1), empacotarOauth(REFRESH)); assert.deepEqual(c.estados, [[G1, "conectada"]]); assert.ok(c.log.some((x) => x[0] === "marcar" && x[2] === "ativa"));
  const troca = new URLSearchParams(c.rede.chamadas[0].body); assert.equal(troca.get("code"), CODIGO); assert.equal(troca.get("code_verifier").length, 64, "o verificador é o guardado no servidor");
  const tudo = JSON.stringify([r, c.logs]); for (const s of [REFRESH, ACESSO, CODIGO, "SEGREDO-GOOGLE"]) assert.ok(!tudo.includes(s), "vazou: " + s);
  const de_novo = await atender({ operacao: "oauth_concluir", state, code: CODIGO }, c.ctx); assert.equal(de_novo.corpo.erro, "oauth_estado_invalido", "o state é de uso único (replay)");
});

test("oauth_concluir: isolamento entre as duas contas Gmail e entre usuários — a conta autorizada precisa ser a cadastrada naquela conta; state de outro usuário não vale", async () => {
  const c = cenario({ rotas: ROTAS_G("raynim@gmail.example") }), { state } = await iniciar(c, G1);   // abriu a conta 1 (rayner) mas o Google autorizou a conta 2 (raynim)
  const r = await atender({ operacao: "oauth_concluir", state, code: CODIGO }, c.ctx);
  assert.equal(r.corpo.erro, "oauth_conta_divergente"); assert.equal(c.seg.size, 0, "nada é guardado quando a conta autorizada é outra"); assert.ok(c.rede.chamadas.some((x) => x.url.includes("/revoke")), "o token da conta errada é revogado");
  const d = cenario({ rotas: ROTAS_G() }), s2 = (await iniciar(d, G1)).state;
  assert.equal((await atender({ operacao: "oauth_concluir", state: s2, code: CODIGO }, { ...d.ctx, usuario: { id: U2, mfaOk: true } })).corpo.erro, "oauth_estado_invalido", "o state é do dono que o abriu");
  assert.equal(d.seg.size, 0);
  const dois = cenario({ rotas: ROTAS_G("raynim@gmail.example") }), sg2 = (await iniciar(dois, G2)).state; assert.equal((await atender({ operacao: "oauth_concluir", state: sg2, code: CODIGO }, dois.ctx)).status, 200);
  assert.deepEqual([...dois.seg.keys()], [U1 + "|" + G2], "a conexão da conta 2 grava só na conta 2");
});

test("oauth_concluir: sem refresh token, provedor recusa, indisponível, identidade ilegível, cofre falhando — códigos fechados e nada guardado; Outlook guarda o refresh da Microsoft", async () => {
  const sem = cenario({ rotas: ROTAS_G("rayner@gmail.example", { status: 200, corpo: { access_token: ACESSO, expires_in: 3600 } }) }); const a = await atender({ operacao: "oauth_concluir", state: (await iniciar(sem, G1)).state, code: CODIGO }, sem.ctx);
  assert.equal(a.corpo.erro, "oauth_recusado"); assert.equal(sem.seg.size, 0); assert.ok(sem.rede.chamadas.some((x) => x.url.includes("/revoke")), "sem refresh token o acesso concedido é revogado");
  for (const [token, esperado] of [[{ status: 400, corpo: { error: "invalid_grant" } }, "oauth_recusado"], [{ status: 503, corpo: {} }, "oauth_indisponivel"]]) { const c = cenario({ rotas: ROTAS_G("rayner@gmail.example", token) }); assert.equal((await atender({ operacao: "oauth_concluir", state: (await iniciar(c, G1)).state, code: CODIGO }, c.ctx)).corpo.erro, esperado); assert.equal(c.seg.size, 0); }
  const semId = cenario({ rotas: { ...ROTAS_G(), "https://openidconnect.googleapis.com": { status: 401, corpo: {} } } }); assert.equal((await atender({ operacao: "oauth_concluir", state: (await iniciar(semId, G1)).state, code: CODIGO }, semId.ctx)).corpo.erro, "oauth_indisponivel");
  const f = cenario({ rotas: ROTAS_G(), falhaGuardar: Object.assign(new Error("SEGREDO-DO-BANCO"), { codigo: "x" }) }); const rf = await atender({ operacao: "oauth_concluir", state: (await iniciar(f, G1)).state, code: CODIGO }, f.ctx);
  assert.equal(rf.corpo.erro, "cofre_indisponivel"); assert.ok(!JSON.stringify([rf, f.logs]).includes("SEGREDO-DO-BANCO"));
  const o = cenario({ rotas: { "https://login.microsoftonline.com": { status: 200, corpo: { access_token: ACESSO, refresh_token: REFRESH_MS, expires_in: 3600 } }, "https://graph.microsoft.com": { status: 200, corpo: { mail: "eu@outlook.example" } } } });
  const ro = await atender({ operacao: "oauth_concluir", state: (await iniciar(o, O1)).state, code: CODIGO }, o.ctx); assert.deepEqual(ro.corpo, { ok: true, conectada: true, provedor: "outlook" }); assert.equal(o.seg.get(U1 + "|" + O1), empacotarOauth(REFRESH_MS));
  assert.ok(!JSON.stringify([ro, o.logs]).includes(REFRESH_MS));
});

test("contas Gmail/Outlook: não aceitam senha de app; o teste SMTP não existe e, com o interruptor desligado, enviar e gerenciar são recusados — respostas honestas ANTES de ler o cofre ou chamar o Worker", async () => {
  const c = cenario({ rotas: {} }); let leu = false; c.ctx.cofre.ler = async () => { leu = true; return null; }; c.ctx.worker = { async executar() { throw new Error("o Worker não pode ser chamado"); } };
  assert.equal((await atender({ operacao: "credencial_guardar", conta_id: G1, usuario: "a@icloud.example", senha_app: "aaaa-bbbb-cccc-dddd" }, c.ctx)).corpo.erro, "provedor_invalido");
  for (const op of ["testar_conta", "listar_pastas"]) assert.equal((await atender({ operacao: op, conta_id: O1 }, c.ctx)).corpo.erro, "credencial_ausente", "Outlook lê (lote 3): sem conexão, pede a conexão");
  leu = false;
  const pasta = "bbbbbbbb-0000-4000-8000-000000000001", envio = { operacao: "enviar_mensagem", conta_id: G1, envio_id: G2, modo: "novo", para: ["a@example.com"], cc: [], cco: [], assunto: "x", texto: "y" };
  for (const o of [{ operacao: "smtp_prova", conta_id: G1, enviar_teste: false }, { operacao: "smtp_prova", conta_id: O1, enviar_teste: false }]) assert.equal((await atender(o, c.ctx)).corpo.erro, "provedor_sem_operacao", "o teste SMTP não existe para contas OAuth");
  for (const prov of ["gmail", "outlook"]) {   // o interruptor do servidor: desligado, enviar e gerenciar voltam a ser recusados, antes de ler o cofre
    ESCRITA_OAUTH[prov] = false;
    try { for (const o of [{ operacao: "organizar_mensagem", conta_id: prov === "gmail" ? G1 : O1, pasta_id: pasta, uid: 1, acao: "arquivar" }, { ...envio, conta_id: prov === "gmail" ? G1 : O1 }]) assert.equal((await atender(o, c.ctx)).corpo.erro, "provedor_sem_operacao", prov + " " + o.operacao); } finally { ESCRITA_OAUTH[prov] = true; }
  }
  assert.equal(leu, false); assert.equal(c.seg.size, 0);
});

test("desconectar conta Gmail: revoga o refresh token no Google (melhor esforço) e apaga o segredo; Outlook só apaga; falha da revogação não impede a remoção", async () => {
  const c = cenario({ rotas: ROTAS_G() }); c.seg.set(U1 + "|" + G1, empacotarOauth(REFRESH)); c.seg.set(U1 + "|" + O1, empacotarOauth(REFRESH_MS));
  assert.deepEqual((await atender({ operacao: "credencial_remover", conta_id: G1 }, c.ctx)).corpo, { ok: true, removida: true }); assert.equal(new URLSearchParams(c.rede.chamadas.find((x) => x.url.includes("/revoke")).body).get("token"), REFRESH); assert.equal(c.seg.has(U1 + "|" + G1), false);
  const antes = c.rede.chamadas.length; assert.equal((await atender({ operacao: "credencial_remover", conta_id: O1 }, c.ctx)).corpo.removida, true); assert.equal(c.rede.chamadas.length, antes, "a Microsoft não tem revogação por API"); assert.equal(c.seg.size, 0);
  const f = cenario({ rotas: { "https://oauth2.googleapis.com/revoke": new Error("fora do ar") } }); f.seg.set(U1 + "|" + G1, empacotarOauth(REFRESH)); assert.equal((await atender({ operacao: "credencial_remover", conta_id: G1 }, f.ctx)).corpo.removida, true);
});

test("index.ts e oauth.ts: client id/secret e redirect só dos Secrets (nada no código), rede sem redirecionamento, sem log de token; o corpo do oauth_concluir tem limite próprio", () => {
  const idx = ler("supabase/functions/rac-inbox/index.ts"), oa = ler("supabase/functions/rac-inbox/oauth.ts"), cod = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const n of ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "MS_OAUTH_CLIENT_ID", "MS_OAUTH_CLIENT_SECRET", "RAC_OAUTH_REDIRECT_URI"]) assert.ok(idx.includes(`"${n}"`), n);
  assert.match(idx, /\/\^https:\\\/\\\//, "o redirect precisa ser HTTPS"); assert.match(idx, /OAUTH_CORPO_MAX/); assert.match(oa, /redirect: "error"/); assert.match(oa, /AbortSignal\.timeout\(15000\)/);
  assert.ok(!/console\./.test(cod(oa)), "oauth.ts não registra nada"); assert.ok(!/\.(text|statusText)\(\)/.test(cod(oa)), "o corpo de texto do provedor nunca é lido (só JSON, só campos conhecidos)");
  assert.ok(!/[A-Za-z0-9_-]{24,}\.apps\.googleusercontent\.com|GOCSPX-/.test(oa + idx), "nenhum client id/secret no código");
  for (const prov of Object.values(ENDPOINTS)) for (const u of [prov.autorizar, prov.token, prov.identidade, prov.revogar].filter(Boolean)) assert.match(u, /^https:\/\/(accounts\.google\.com|oauth2\.googleapis\.com|openidconnect\.googleapis\.com|login\.microsoftonline\.com|graph\.microsoft\.com)\//);
});

/* ---------- SQL (PGlite): a 063 sobre as migrations reais 051 e 052 e um Vault de mentira ---------- */
let PGlite = null;
try { PGlite = (await import(process.env.RAC_PGLITE ? pathToFileURL(path.resolve(process.env.RAC_PGLITE)).href : "@electric-sql/pglite")).PGlite; } catch (_) { /* sem PGlite: pula, menos no CI */ }
const pular = !PGlite, S63 = ler("supabase/063_inbox_oauth.sql");
test("no CI o PGlite está instalado: os testes de banco da 063 não podem ser pulados", () => { if (process.env.CI) assert.ok(PGlite, "sem PGlite no CI"); });
test("063 (texto): pendente, uma transação, schema privado, nada para o site, sem coluna de token de acesso, funções definer com search_path fixo e revogadas", () => {
  assert.equal(S63.split("\n")[0], "-- status: pendente"); assert.match(S63, /\nbegin;[\s\S]*\ncommit;/);
  const s = S63.replace(/--.*$/gm, ""); assert.ok(!/\bgrant\b/i.test(s), "nenhum grant"); assert.match(s, /revoke all on inbox_cofre\.oauth_estados from public, anon, authenticated, service_role;/);
  for (const f of ["oauth_abrir(uuid, uuid, text, text)", "oauth_consumir(uuid, text)", "guardar(uuid, uuid, text)"]) assert.ok(s.includes(`revoke all on function inbox_cofre.${f} from public, anon, authenticated, service_role;`), f);
  for (const b of s.split(/create or replace function /).slice(1)) assert.match(b.slice(0, 300), /security definer set search_path = ''/);
  assert.ok(!/access_token|acesso/i.test(s.replace(/Tokens de acesso/gi, "")), "nenhuma coluna de token de acesso"); assert.match(s, /length\(p_segredo\) not between 1 and 6000/);
});
const VAULT = `create schema vault; create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, description text not null default '', secret text not null, key_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
  create function vault.create_secret(new_secret text, new_name text default null, new_description text default '', new_key_id uuid default null) returns uuid language plpgsql as $$ declare i uuid; begin insert into vault.secrets (secret, name, description) values (new_secret, new_name, new_description) returning id into i; return i; end $$;
  create function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null, new_key_id uuid default null) returns void language plpgsql as $$ begin update vault.secrets set secret = coalesce(new_secret, secret), name = coalesce(new_name, name) where id = secret_id; end $$;
  create view vault.decrypted_secrets as select id, name, description, secret, secret as decrypted_secret, key_id, created_at, updated_at from vault.secrets;`;
const trecho = (arq, ini, fim) => { const t = ler(arq), i = t.indexOf(ini); return t.slice(i, t.indexOf(fim, i) + fim.length); };
async function banco() {
  const db = await PGlite.create();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; grant usage on schema public to anon, authenticated, service_role; alter default privileges in schema public grant all on tables to anon, authenticated;
    create schema auth; grant usage on schema auth to anon, authenticated, service_role; create table auth.users (id uuid primary key); create table auth.mfa_factors (user_id uuid, status text);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$; create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub', '')::uuid $$;
    insert into auth.users values ('${U1}'), ('${U2}'), ('44444444-4444-4444-8444-444444444444'); create schema storage; create table storage.buckets (id text primary key, name text, public boolean default false);`);
  await db.exec(VAULT); await db.exec(trecho("supabase/002_casa_compartilhada.sql", "create table if not exists public.membros", "grant execute on function public.dono_da_casa() to authenticated;"));
  await db.exec(trecho("supabase/022_seguranca.sql", "create or replace function public.rac_aal_ok()", "grant execute on function public.rac_aal_ok() to authenticated;"));
  await db.exec(`insert into public.membros (membro, dono) values ('44444444-4444-4444-8444-444444444444', '${U1}');`);
  await db.exec(ler("supabase/051_inbox_fundacao.sql")); await db.exec(ler("supabase/052_inbox_cofre.sql")); await db.exec(S63); return db;
}
const conta = async (db, dono, prov, end) => (await db.query("insert into public.inbox_contas (dono, provedor, apelido, endereco) values ($1, $2, 'C', $3) returning id", [dono, prov, end])).rows[0].id;
const cod = async (p) => { try { await p; } catch (e) { return e.code || String(e.message); } return null; };
const H = "a".repeat(64), V = "v".repeat(64);
test("PGlite · 063: roda duas vezes; state de uso único, só do dono, expira em 10 min, uma conexão por conta, iCloud/alheia/casa recusados, limite de 10, cascata", { skip: pular }, async () => {
  const db = await banco(); await db.exec(S63);
  const g1 = await conta(db, U1, "gmail", "a@gmail.example"), g2 = await conta(db, U1, "gmail", "b@gmail.example"), ic = await conta(db, U1, "icloud", "c@icloud.example"), outro = await conta(db, U2, "gmail", "x@gmail.example");
  assert.equal((await db.query("select inbox_cofre.oauth_abrir($1, $2, $3, $4) p", [U1, g1, H, V])).rows[0].p, "gmail");
  assert.equal(await cod(db.query("select inbox_cofre.oauth_abrir($1, $2, $3, $4)", [U1, ic, "b".repeat(64), V])), "22023", "iCloud não tem OAuth"); assert.equal(await cod(db.query("select inbox_cofre.oauth_abrir($1, $2, $3, $4)", [U1, outro, "c".repeat(64), V])), "P0002", "conta de outro dono");
  assert.equal(await cod(db.query("select inbox_cofre.oauth_abrir($1, $2, $3, $4)", ["44444444-4444-4444-8444-444444444444", g1, "d".repeat(64), V])), "42501", "a casa não conecta");
  assert.equal(await cod(db.query("select * from inbox_cofre.oauth_consumir($1, $2)", [U2, H])), "P0002", "state de outro usuário não vale"); assert.equal((await db.query("select count(*)::int n from inbox_cofre.oauth_estados")).rows[0].n, 1, "a tentativa alheia não consome");
  const r = (await db.query("select * from inbox_cofre.oauth_consumir($1, $2)", [U1, H])).rows[0]; assert.deepEqual([r.conta_id, r.provedor, r.verificador], [g1, "gmail", V]);
  assert.equal(await cod(db.query("select * from inbox_cofre.oauth_consumir($1, $2)", [U1, H])), "P0002", "uso único");
  await db.query("select inbox_cofre.oauth_abrir($1, $2, $3, $4)", [U1, g1, "e".repeat(64), V]); await db.query("select inbox_cofre.oauth_abrir($1, $2, $3, $4)", [U1, g1, "f".repeat(64), V]);
  assert.equal((await db.query("select count(*)::int n from inbox_cofre.oauth_estados where conta_id = $1", [g1])).rows[0].n, 1, "abrir de novo substitui o state anterior da mesma conta"); assert.equal(await cod(db.query("select * from inbox_cofre.oauth_consumir($1, $2)", [U1, "e".repeat(64)])), "P0002");
  await db.query("update inbox_cofre.oauth_estados set expira_em = now() - interval '1 second'"); assert.equal(await cod(db.query("select * from inbox_cofre.oauth_consumir($1, $2)", [U1, "f".repeat(64)])), "P0002", "expirado = não existe");
  const ids = []; for (let i = 0; i < 10; i++) ids.push(await conta(db, U1, "outlook", `o${i}@outlook.example`)); for (let i = 0; i < 10; i++) await db.query("select inbox_cofre.oauth_abrir($1, $2, $3, $4)", [U1, ids[i], String(i).repeat(64), V]);
  assert.equal(await cod(db.query("select inbox_cofre.oauth_abrir($1, $2, $3, $4)", [U1, g2, "9".repeat(64), V])), "54000", "no máximo 10 conexões abertas");
  await db.query("delete from public.inbox_contas where id = $1", [ids[0]]); assert.equal((await db.query("select count(*)::int n from inbox_cofre.oauth_estados where conta_id = $1", [ids[0]])).rows[0].n, 0, "apagar a conta apaga o state");
});
test("PGlite · 063: o site (authenticated/anon) não lê nem executa nada do OAuth; guardar aceita refresh token longo (Microsoft) e continua recusando acima de 6000", { skip: pular }, async () => {
  const db = await banco(), g1 = await conta(db, U1, "gmail", "a@gmail.example");
  for (const papel of ["anon", "authenticated", "service_role"]) { assert.equal((await db.query("select has_table_privilege($1, 'inbox_cofre.oauth_estados', 'select') p", [papel])).rows[0].p, false, papel); assert.equal((await db.query("select has_function_privilege($1, 'inbox_cofre.oauth_consumir(uuid, text)', 'execute') p", [papel])).rows[0].p, false, papel); }
  const longo = JSON.stringify({ o: 1, r: "M.R3_" + "x".repeat(1900) }); await db.query("select inbox_cofre.guardar($1, $2, $3)", [U1, g1, longo]);
  assert.equal((await db.query("select inbox_cofre.ler($1, $2) s", [U1, g1])).rows[0].s, longo); assert.equal(await cod(db.query("select inbox_cofre.guardar($1, $2, $3)", [U1, g1, "x".repeat(6001)])), "22023");
  assert.equal((await db.query("select inbox_cofre.conferir() c")).rows[0].c.ponteiro_sem_segredo, 0);
});
