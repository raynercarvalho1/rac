// RAC Inbox · POC autenticada iCloud (S3): Worker que valida o JWT OIDC do GitHub Actions antes de aceitar qualquer credencial.
// Tudo sintético: chaves RSA geradas aqui, JWKS e emissor simulados, relógio controlado. Nenhuma rede, nenhuma credencial real,
// nenhuma conta Apple. Prova a lógica local; NÃO prova o comportamento no runtime Cloudflare nem o formato real dos tokens do GitHub.
import { test } from "node:test";
import assert from "node:assert/strict";
import { POLITICA } from "../experimentos/icloud-auth-probe/src/politica.mjs";
import { verificarJwt, conferirClaims } from "../experimentos/icloud-auth-probe/src/jwt.mjs";
import { criarProvedorChaves } from "../experimentos/icloud-auth-probe/src/jwks.mjs";
import { tratar, lerCredencial } from "../experimentos/icloud-auth-probe/src/index.mjs";

const AGORA = 1_800_000_000;
const KID = "kid-sintetico-1";
const SENHA = "SENTINELA-SENHA-APP-7c1e9";
const USUARIO = "sentinela.usuario.teste";
const URL_DESCOBERTA = POLITICA.descobertaUrl;
const URL_JWKS = POLITICA.issuer + "/.well-known/jwks";

const b64u = (dados) => Buffer.from(dados).toString("base64url");
const j = (o) => b64u(JSON.stringify(o));

async function novoPar(bits = 2048) {
  const par = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: bits, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", par.publicKey);
  return { privada: par.privateKey, jwk };
}
async function assinar(cabecalho, claims, privada) {
  const corpo = j(cabecalho) + "." + j(claims);
  const assinatura = await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, privada, new TextEncoder().encode(corpo));
  return corpo + "." + b64u(new Uint8Array(assinatura));
}
const cab = (extra = {}) => ({ alg: "RS256", typ: "JWT", kid: KID, ...extra });
function claimsValidos(extra = {}) {
  const ref = POLITICA.refsPermitidos[0];
  const wf = POLITICA.repository + "/" + POLITICA.arquivoWorkflow + "@" + ref;
  const c = {
    iss: POLITICA.issuer, aud: POLITICA.audienciaPrefixo + "validar_oidc", sub: POLITICA.subsPermitidos[0],
    repository: POLITICA.repository, repository_id: POLITICA.repositoryId, repository_owner: POLITICA.repositoryOwner, repository_owner_id: POLITICA.repositoryOwnerId,
    environment: POLITICA.environment, ref, event_name: "workflow_dispatch", workflow_ref: wf, job_workflow_ref: wf, runner_environment: "github-hosted",
    iat: AGORA - 10, nbf: AGORA - 10, exp: AGORA + 290, jti: "jti-sintetico",
  };
  Object.assign(c, extra);
  for (const k of Object.keys(c)) if (c[k] === undefined) delete c[k];
  return c;
}

// emissor simulado: documento de descoberta + JWKS, com contadores e falhas injetáveis
function emissor(estado) {
  estado.chamadas = [];
  return async (url) => {
    estado.chamadas.push(url);
    if (estado.cai) throw new Error("rede_fora");
    if (url === URL_DESCOBERTA) {
      if (estado.descoberta === "ruim") return new Response(JSON.stringify({ issuer: POLITICA.issuer, jwks_uri: estado.jwksUri || URL_JWKS }), { status: 200 });
      return new Response(JSON.stringify({ issuer: POLITICA.issuer, jwks_uri: estado.jwksUri || URL_JWKS }), { status: estado.status || 200 });
    }
    if (url === (estado.jwksUri || URL_JWKS)) {
      if (estado.jwksStatus) return new Response("x", { status: estado.jwksStatus });
      if (estado.jwksTexto !== undefined) return new Response(estado.jwksTexto, { status: 200 });
      return new Response(JSON.stringify({ keys: estado.chaves }), { status: 200 });
    }
    return new Response("nao", { status: 404 });
  };
}
const jwkPublica = (jwk, kid = KID, extra = {}) => ({ ...jwk, kid, use: "sig", alg: "RS256", ...extra });
async function cenario(opcoes = {}) {
  const par = await novoPar();
  const estado = { chaves: [jwkPublica(par.jwk)], ...opcoes };
  const relogio = { t: AGORA };
  const provedor = criarProvedorChaves({ fetchFn: emissor(estado), agora: () => relogio.t, politica: POLITICA });
  const verificar = (token, politica = POLITICA) => verificarJwt(token, { obterChave: provedor, agora: () => relogio.t, politica });
  return { par, estado, relogio, provedor, verificar };
}
async function token(c, claims = claimsValidos(), cabecalho = cab()) { return assinar(cabecalho, claims, c.par.privada); }
async function motivo(c, t) { const r = await c.verificar(t); return r.ok ? "ok" : r.motivo; }

// ---------- JWT válido e variações de claims ----------

test("JWT válido (formato imutável do sub) é aceito e devolve as claims", async () => {
  const c = await cenario();
  const r = await c.verificar(await token(c));
  assert.equal(r.ok, true);
  assert.equal(r.claims.environment, "icloud-auth-poc");
});

test("sub no formato clássico também é aceito (exato); outros formatos não", async () => {
  const c = await cenario();
  assert.equal(await motivo(c, await token(c, claimsValidos({ sub: POLITICA.subsPermitidos[1] }))), "ok");
  for (const sub of ["repo:raynercarvalho1/rac:ref:refs/heads/poc/icloud-cloudflare-connectivity", "repo:raynercarvalho1/rac:environment:cloudflare-poc",
    "repo:raynercarvalho1/*", "repo:raynercarvalho1@1/rac@1431652822:environment:icloud-auth-poc", "repo:outro/rac:environment:icloud-auth-poc"])
    assert.equal(await motivo(c, await token(c, claimsValidos({ sub }))), "sub_invalido", sub);
});

test("cada claim fora da política é recusada com o motivo certo", async () => {
  const c = await cenario();
  const ref2 = "refs/heads/main";
  const tabela = [
    ["iss_invalido", { iss: "https://outro.exemplo" }],
    ["aud_invalida", { aud: "https://github.com/raynercarvalho1" }],
    ["aud_invalida", { aud: "rac-inbox-icloud-poc:p1_login" }],
    ["aud_invalida", { aud: ["rac-inbox-icloud-poc:validar_oidc"] }],
    ["sub_invalido", { sub: "repo:raynercarvalho1/rac:pull_request" }],
    ["repository_invalido", { repository: "raynercarvalho1/outro" }],
    ["repository_id_invalido", { repository_id: "999" }],
    ["repository_owner_invalido", { repository_owner: "outro" }],
    ["repository_owner_id_invalido", { repository_owner_id: "1" }],
    ["environment_invalido", { environment: "cloudflare-poc" }],
    ["ref_invalido", { ref: ref2, workflow_ref: POLITICA.repository + "/" + POLITICA.arquivoWorkflow + "@" + ref2, job_workflow_ref: POLITICA.repository + "/" + POLITICA.arquivoWorkflow + "@" + ref2 }],
    ["workflow_ref_invalido", { workflow_ref: "raynercarvalho1/rac/.github/workflows/outro.yml@refs/heads/poc/icloud-cloudflare-connectivity" }],
    ["job_workflow_ref_invalido", { job_workflow_ref: "raynercarvalho1/rac/.github/workflows/reutilizavel.yml@refs/heads/poc/icloud-cloudflare-connectivity" }],
    ["event_name_invalido", { event_name: "push" }],
    ["event_name_invalido", { event_name: "pull_request" }],
    ["runner_environment_invalido", { runner_environment: "self-hosted" }],
  ];
  for (const [esperado, extra] of tabela) assert.equal(await motivo(c, await token(c, claimsValidos(extra))), esperado, JSON.stringify(extra));
});

test("claims ausentes: cada uma obrigatória derruba o token", async () => {
  const c = await cenario();
  const obrigatorias = { iss: "iss_invalido", aud: "aud_invalida", sub: "sub_ausente", repository: "repository_ausente", repository_id: "repository_id_ausente",
    repository_owner: "repository_owner_ausente", repository_owner_id: "repository_owner_id_ausente", environment: "environment_ausente", ref: "ref_ausente",
    event_name: "event_name_ausente", workflow_ref: "workflow_ref_ausente", job_workflow_ref: "job_workflow_ref_ausente", runner_environment: "runner_environment_ausente",
    exp: "exp_ausente", iat: "iat_ausente" };
  for (const [nome, esperado] of Object.entries(obrigatorias)) assert.equal(await motivo(c, await token(c, claimsValidos({ [nome]: undefined }))), esperado, nome);
  assert.equal(await motivo(c, await token(c, claimsValidos({ nbf: undefined }))), "ok", "nbf é opcional");
});

test("tempo: expirado, ainda não válido, iat no futuro, token velho demais e a tolerância de relógio", async () => {
  const c = await cenario();
  assert.equal(await motivo(c, await token(c, claimsValidos({ exp: AGORA - 61 }))), "token_expirado");
  assert.equal(await motivo(c, await token(c, claimsValidos({ exp: AGORA - 30, iat: AGORA - 200, nbf: AGORA - 200 }))), "ok", "dentro da tolerância de 60 s");
  assert.equal(await motivo(c, await token(c, claimsValidos({ exp: AGORA - 100, iat: AGORA - 10 }))), "token_expirado", "exp anterior ao agora vence mesmo com iat posterior");
  assert.equal(await motivo(c, await token(c, claimsValidos({ nbf: AGORA + 61 }))), "token_ainda_nao_valido");
  assert.equal(await motivo(c, await token(c, claimsValidos({ nbf: AGORA + 30 }))), "ok");
  assert.equal(await motivo(c, await token(c, claimsValidos({ nbf: "agora" }))), "nbf_invalido");
  assert.equal(await motivo(c, await token(c, claimsValidos({ iat: AGORA + 61, nbf: undefined }))), "iat_no_futuro");
  assert.equal(await motivo(c, await token(c, claimsValidos({ iat: AGORA - 700, exp: AGORA + 1000 }))), "token_antigo_demais");
  assert.equal(await motivo(c, await token(c, claimsValidos({ exp: "amanha" }))), "exp_ausente");
  c.relogio.t = AGORA + 400; // o mesmo token envelhece: exp = AGORA + 290
  assert.equal(await motivo(c, await token(c, claimsValidos())), "token_expirado");
});

// ---------- cabeçalho e assinatura ----------

test("cabeçalhos jku, x5u, x5c, jwk e crit são recusados (nunca se busca chave indicada pelo token)", async () => {
  const c = await cenario();
  for (const extra of [{ jku: "https://atacante.exemplo/jwks" }, { x5u: "https://atacante.exemplo/cert" }, { x5c: ["AAAA"] }, { jwk: c.par.jwk }, { crit: ["exp"] }])
    assert.equal(await motivo(c, await token(c, claimsValidos(), cab(extra))), "cabecalho_proibido", Object.keys(extra)[0]);
  assert.ok(!c.estado.chamadas.some((u) => u.includes("atacante")), "nenhuma chamada a URL do token");
});

test("algoritmos não permitidos (none, HS256, RS384, ES256, PS256) são recusados", async () => {
  const c = await cenario();
  for (const alg of ["none", "HS256", "RS384", "RS512", "ES256", "PS256", "rs256"])
    assert.equal(await motivo(c, await token(c, claimsValidos(), cab({ alg }))), "algoritmo_nao_permitido", alg);
  assert.equal(await motivo(c, j(cab({ alg: "none" })) + "." + j(claimsValidos()) + "."), "token_malformado");
  assert.equal(await motivo(c, await token(c, claimsValidos(), cab({ typ: "at+jwt" }))), "typ_invalido");
  assert.equal(await motivo(c, await token(c, claimsValidos(), { alg: "RS256", typ: "JWT" })), "kid_ausente");
});

test("assinatura inválida: payload adulterado, chave errada e assinatura truncada", async () => {
  const c = await cenario();
  const t = await token(c);
  const [h, p, s] = t.split(".");
  const adulterado = j({ ...claimsValidos(), environment: "outro-ambiente" });
  assert.equal(await motivo(c, h + "." + adulterado + "." + s), "assinatura_invalida");
  const outra = await novoPar();
  assert.equal(await motivo(c, await assinar(cab(), claimsValidos(), outra.privada)), "assinatura_invalida", "mesmo kid, outra chave");
  assert.equal(await motivo(c, h + "." + p + "." + s.slice(0, -8)), "assinatura_invalida");
});

test("tokens malformados: partes, base64, JSON, tamanho", async () => {
  const c = await cenario();
  for (const t of ["", "a.b", "a.b.c.d", "###.###.###", j(cab()) + "." + b64u("nao-json") + ".AAAA", j(cab()) + "." + b64u("[]") + ".AAAA", undefined, null, 42, "x".repeat(POLITICA.jwtMaxBytes + 1)])
    assert.match(await motivo(c, t), /^(token_invalido|token_malformado)$/);
});

test("kid desconhecido é recusado", async () => {
  const c = await cenario();
  assert.equal(await motivo(c, await token(c, claimsValidos(), cab({ kid: "kid-que-nao-existe" }))), "kid_desconhecido");
});

// ---------- JWKS: cache, rotação, indisponibilidade ----------

test("JWKS: descoberta e chaves vêm só do emissor fixo; o cache evita nova busca", async () => {
  const c = await cenario();
  assert.equal(await motivo(c, await token(c)), "ok");
  assert.equal(await motivo(c, await token(c)), "ok");
  assert.deepEqual(c.estado.chamadas, [URL_DESCOBERTA, URL_JWKS], "duas buscas na primeira vez, nenhuma na segunda");
});

test("JWKS: jwks_uri fora do emissor, em http ou com credencial é recusado", async () => {
  for (const jwksUri of ["https://atacante.exemplo/jwks", "http://token.actions.githubusercontent.com/.well-known/jwks", "https://u:p@token.actions.githubusercontent.com/jwks"]) {
    const c = await cenario({ jwksUri });
    assert.equal(await motivo(c, await token(c)), "jwks_indisponivel", jwksUri);
    assert.ok(!c.estado.chamadas.includes(jwksUri), "não chegou a buscar");
  }
});

test("JWKS indisponível, inválido ou sem chave utilizável: falha fechada", async () => {
  const casos = [{ cai: true }, { status: 500 }, { jwksStatus: 503 }, { jwksTexto: "<html>" }, { jwksTexto: JSON.stringify({ keys: "x" }) },
    { jwksTexto: JSON.stringify({ keys: [] }) }, { jwksTexto: JSON.stringify({ keys: [{ kty: "oct", kid: KID, k: "AAAA" }] }) }];
  for (const caso of casos) {
    const c = await cenario(caso);
    assert.equal(await motivo(c, await token(c)), "jwks_indisponivel", JSON.stringify(caso));
  }
});

test("JWKS: chave RSA pequena demais ou com uso diferente de sig é ignorada", async () => {
  const fraca = await novoPar(1024);
  const c = await cenario();
  c.estado.chaves = [jwkPublica(fraca.jwk, KID), jwkPublica(c.par.jwk, "kid-enc", { use: "enc" }), jwkPublica(c.par.jwk, "kid-alg", { alg: "RS512" })];
  assert.equal(await motivo(c, await token(c)), "jwks_indisponivel", "nenhuma chave utilizável no conjunto");
});

test("JWKS: rotação de chave (kid novo) só vale depois da recarga mínima; a chave antiga some", async () => {
  const c = await cenario();
  assert.equal(await motivo(c, await token(c)), "ok");
  const nova = await novoPar();
  c.estado.chaves = [jwkPublica(nova.jwk, "kid-novo")];
  const tNovo = await assinar(cab({ kid: "kid-novo" }), claimsValidos(), nova.privada);
  c.relogio.t = AGORA + 30;
  assert.equal(await motivo(c, tNovo), "kid_desconhecido", "recarga forçada limitada a 1 por minuto: falha fechada");
  c.relogio.t = AGORA + 70;
  const antes = c.estado.chamadas.length;
  assert.equal(await motivo(c, await assinar(cab({ kid: "kid-novo" }), claimsValidos({ iat: AGORA + 60, nbf: AGORA + 60, exp: AGORA + 350 }), nova.privada)), "ok");
  assert.equal(c.estado.chamadas.length, antes + 2, "uma recarga (descoberta + chaves)");
  assert.equal(await motivo(c, await token(c, claimsValidos({ iat: AGORA + 60, nbf: AGORA + 60, exp: AGORA + 350 }))), "kid_desconhecido", "a chave antiga saiu do conjunto");
});

test("JWKS: kid desconhecido repetido não provoca uma tempestade de buscas", async () => {
  const c = await cenario();
  await c.verificar(await token(c));
  const antes = c.estado.chamadas.length;
  for (let i = 0; i < 20; i += 1) await c.verificar(await token(c, claimsValidos(), cab({ kid: "kid-" + i })));
  assert.ok(c.estado.chamadas.length - antes <= 2, "no máximo uma recarga no minuto");
});

test("JWKS: indisponibilidade do emissor reaproveita o conjunto antigo só dentro do limite documentado", async () => {
  const c = await cenario();
  assert.equal(await motivo(c, await token(c)), "ok");
  c.estado.cai = true;
  c.relogio.t = AGORA + 700; // cache vencido (TTL 600 s), emissor fora
  assert.equal(await motivo(c, await token(c, claimsValidos({ iat: AGORA + 690, nbf: AGORA + 690, exp: AGORA + 990 }))), "ok", "dentro de 1 h: usa o conjunto antigo");
  c.relogio.t = AGORA + 4000;
  assert.equal(await motivo(c, await token(c, claimsValidos({ iat: AGORA + 3990, nbf: AGORA + 3990, exp: AGORA + 4290 }))), "jwks_indisponivel", "além de 1 h: falha fechada");
});

// ---------- Worker: ordem das etapas, corpo e vazamento ----------

function pedido(jwt, corpo, { tipo = "application/json", metodo = "POST", caminho = "/auth-probe" } = {}) {
  const estado = { lido: false };
  const bytes = new TextEncoder().encode(typeof corpo === "string" ? corpo : JSON.stringify(corpo));
  const fluxo = new ReadableStream({ pull(controle) { estado.lido = true; controle.enqueue(bytes); controle.close(); } }, { highWaterMark: 0 });
  const headers = { "Content-Type": tipo };
  if (jwt) headers.Authorization = "Bearer " + jwt;
  const init = metodo === "GET" ? { method: "GET", headers } : { method: metodo, headers, body: fluxo, duplex: "half" };
  return { req: new Request("https://rac-icloud-auth-poc.exemplo.workers.dev" + caminho, init), estado };
}
const corpoOk = (extra = {}) => ({ operacao: "validar_oidc", usuario: USUARIO, senha: SENHA, ...extra });
async function resposta(r) { return { status: r.status, texto: await r.text(), headers: [...r.headers].map(([k, v]) => k + ": " + v).join("\n") }; }

test("sem JWT válido o corpo com a senha NUNCA é lido", async () => {
  const c = await cenario();
  const [h, p, s] = (await token(c)).split(".");
  const invalidos = [undefined, "lixo", await token(c, claimsValidos({ environment: "outro" })), h + "." + p + "." + s.slice(0, -4), await token(c, claimsValidos({ exp: AGORA - 500 })),
    await token(c, claimsValidos(), cab({ jku: "https://atacante.exemplo" }))];
  for (const jwt of invalidos) {
    const { req, estado } = pedido(jwt, corpoOk());
    const r = await resposta(await tratar(req, { verificar: c.verificar }));
    assert.equal(r.status, 401);
    assert.equal(estado.lido, false, "o corpo não pode ser consumido antes da autenticação");
  }
  for (const [metodo, caminho] of [["GET", "/auth-probe"], ["POST", "/outro"], ["PUT", "/auth-probe"]]) {
    const { req, estado } = pedido(await token(c), corpoOk(), { metodo, caminho });
    assert.equal((await tratar(req, { verificar: c.verificar })).status, 404);
    assert.equal(estado.lido, false);
  }
});

test("JWT válido + corpo correto: aceita, não usa a credencial e não devolve nada dela", async () => {
  const c = await cenario();
  const { req, estado } = pedido(await token(c), corpoOk());
  const r = await resposta(await tratar(req, { verificar: c.verificar }));
  assert.equal(r.status, 200);
  assert.equal(estado.lido, true);
  assert.deepEqual(JSON.parse(r.texto), { ok: true, operacao: "validar_oidc", oidc: "validado", credencial_recebida: true, acao_remota: "nenhuma" });
  assert.ok(!r.texto.includes(SENHA) && !r.texto.includes(USUARIO));
});

test("corpo malformado ou fora do esquema é recusado depois da autenticação", async () => {
  const c = await cenario();
  const casos = [
    ["não é JSON", "{senha:", 400], ["é lista", "[]", 400], ["texto puro", "oi", 400], ["vazio", "", 400],
    ["campo extra", corpoOk({ extra: "x" }), 400], ["sem senha", { operacao: "validar_oidc", usuario: USUARIO }, 400],
    ["senha não é texto", corpoOk({ senha: 123 }), 400], ["operação desconhecida", corpoOk({ operacao: "p1_login" }), 400],
    ["senha com quebra de linha", corpoOk({ senha: "abc\r\nDELE 1" }), 400], ["usuário com NUL", corpoOk({ usuario: "ab\u0000cd" }), 400],
    ["usuário curto", corpoOk({ usuario: "ab" }), 400], ["senha longa", corpoOk({ senha: "x".repeat(129) }), 400],
    ["corpo enorme", corpoOk({ senha: "x".repeat(POLITICA.corpoMaxBytes) }), 413],
  ];
  for (const [nome, corpo, status] of casos) {
    const { req } = pedido(await token(c), corpo);
    const r = await resposta(await tratar(req, { verificar: c.verificar }));
    assert.equal(r.status, status, nome);
    assert.equal(JSON.parse(r.texto).ok, false);
  }
  const { req } = pedido(await token(c), corpoOk(), { tipo: "text/plain" });
  assert.equal((await tratar(req, { verificar: c.verificar })).status, 415);
});

test("o token vale para uma operação só: audiência de outra operação não autoriza o corpo", async () => {
  const dois = { ...POLITICA, operacoes: ["validar_oidc", "outra_operacao"] };
  const c = await cenario();
  const verificar = (t) => c.verificar(t, dois);
  const tOutra = await token(c, claimsValidos({ aud: POLITICA.audienciaPrefixo + "outra_operacao" }));
  const { req } = pedido(tOutra, corpoOk({ operacao: "validar_oidc" }));
  const r = await resposta(await tratar(req, { verificar, politica: dois }));
  assert.equal(r.status, 403);
  assert.equal(JSON.parse(r.texto).motivo, "operacao_diferente_da_audiencia");
  const { req: req2 } = pedido(tOutra, corpoOk({ operacao: "outra_operacao" }));
  assert.equal((await tratar(req2, { verificar, politica: dois })).status, 400, "operação não implementada nem com audiência certa");
});

test("lerCredencial aceita só o esquema fechado", () => {
  const ok = new TextEncoder().encode(JSON.stringify(corpoOk()));
  assert.deepEqual(lerCredencial(ok), { operacao: "validar_oidc", usuario: USUARIO, senha: SENHA });
  assert.equal(lerCredencial(new TextEncoder().encode(JSON.stringify(corpoOk({ x: 1 })))), null);
  assert.equal(lerCredencial(new Uint8Array([0xff, 0xfe])), null);
});

test("senha, JWT e dados pessoais não aparecem em logs, erros nem respostas (todos os caminhos)", async () => {
  const c = await cenario();
  const chamadas = [];
  const originais = {};
  for (const m of ["log", "info", "warn", "error", "debug", "trace"]) { originais[m] = console[m]; console[m] = (...a) => chamadas.push(a.map(String).join(" ")); }
  const saidas = [];
  try {
    const jwtOk = await token(c);
    const jwtRuim = await token(c, claimsValidos({ environment: "outro" }));
    const cenarios = [[jwtOk, corpoOk()], [jwtRuim, corpoOk()], [undefined, corpoOk()], [jwtOk, "{senha:" + SENHA], [jwtOk, corpoOk({ extra: SENHA })],
      [jwtOk, corpoOk({ senha: SENHA + "\n" })], [jwtOk, corpoOk({ senha: SENHA.repeat(80) })]];
    for (const [jwt, corpo] of cenarios) {
      const { req } = pedido(jwt, corpo);
      saidas.push(await resposta(await tratar(req, { verificar: c.verificar })));
    }
    c.estado.cai = true; c.relogio.t = AGORA + 5000;
    const { req } = pedido(jwtOk, corpoOk());
    saidas.push(await resposta(await tratar(req, { verificar: c.verificar })));
    // falha interna: o verificador explode e a mensagem do erro não pode vazar
    const { req: r2 } = pedido(jwtOk, corpoOk());
    saidas.push(await resposta(await tratar(r2, { verificar: () => { throw new Error("SEGREDO " + SENHA); } })));
    // o JWT e o corpo viajam no mesmo pedido: nenhum deles pode ser ecoado de volta
    for (const s of saidas) {
      for (const proibido of [SENHA, USUARIO, jwtOk, jwtRuim, "SEGREDO"]) { assert.ok(!s.texto.includes(proibido), "resposta vazou: " + proibido.slice(0, 12)); assert.ok(!s.headers.includes(proibido), "cabeçalho vazou"); }
    }
  } finally {
    for (const m of Object.keys(originais)) console[m] = originais[m];
  }
  assert.equal(chamadas.length, 0, "o Worker não escreve em console");
  assert.equal(saidas.at(-1).status, 500);
  assert.deepEqual(JSON.parse(saidas.at(-1).texto), { ok: false, erro: "falha_interna", motivo: "falha_interna" });
});

test("conferirClaims é uma função pura e fecha por padrão (objeto vazio nunca passa)", () => {
  assert.notEqual(conferirClaims({}, POLITICA, AGORA), null);
  assert.equal(conferirClaims(claimsValidos(), POLITICA, AGORA), null);
});
