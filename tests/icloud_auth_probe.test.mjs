// RAC Inbox · POC autenticada iCloud (S3): Worker que valida o JWT OIDC do GitHub Actions antes de aceitar qualquer credencial.
// Tudo sintético: chaves RSA geradas aqui, JWKS e emissor simulados, relógio controlado. Nenhuma rede, nenhuma credencial (nem real,
// nem sintética com valor operacional), nenhuma conta Apple: o ensaio OIDC não transmite credencial alguma. Prova a lógica local; NÃO prova o comportamento no runtime Cloudflare nem o formato real dos tokens do GitHub.
import { test } from "node:test";
import assert from "node:assert/strict";
import { POLITICA, DETALHES_JWKS } from "../experimentos/icloud-auth-probe/src/politica.mjs";
import { verificarJwt, conferirClaims } from "../experimentos/icloud-auth-probe/src/jwt.mjs";
import { criarProvedorChaves } from "../experimentos/icloud-auth-probe/src/jwks.mjs";
import { readFileSync } from "node:fs";
import { tratar, lerCorpo } from "../experimentos/icloud-auth-probe/src/index.mjs";

const AGORA = 1_800_000_000;
const KID = "kid-sintetico-1";
// sentinelas: NENHUMA credencial existe nesta fase; se um cliente mandar uma, o Worker tem de recusá-la sem ecoar
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
  const ref2 = "refs/heads/poc/icloud-cloudflare-connectivity"; // a branch da POC já não é origem autorizada: o workflow privilegiado vive na main
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

test("origens não autorizadas: tokens de outras refs, workflows, eventos, ambientes e repositórios são recusados", async () => {
  const c = await cenario();
  assert.deepEqual(POLITICA.refsPermitidos, ["refs/heads/main"], "só a main");
  const wf = (ref, arq = POLITICA.arquivoWorkflow) => POLITICA.repository + "/" + arq + "@" + ref;
  const doRef = (ref) => ({ ref, workflow_ref: wf(ref), job_workflow_ref: wf(ref) });
  const tabela = [
    ["ref_invalido", "branch da POC com uma cópia do workflow", doRef("refs/heads/poc/icloud-cloudflare-connectivity")],
    ["ref_invalido", "branch de agente", doRef("refs/heads/claude/qualquer")],
    ["ref_invalido", "ref de pull request", doRef("refs/pull/17/merge")],
    ["ref_invalido", "tag", doRef("refs/tags/v1")],
    ["workflow_ref_invalido", "ref da main mas workflow vindo de uma cópia na branch da POC", { workflow_ref: wf("refs/heads/poc/icloud-cloudflare-connectivity"), job_workflow_ref: wf("refs/heads/poc/icloud-cloudflare-connectivity") }],
    ["workflow_ref_invalido", "outro arquivo de workflow na main", { workflow_ref: wf("refs/heads/main", ".github/workflows/outro.yml"), job_workflow_ref: wf("refs/heads/main", ".github/workflows/outro.yml") }],
    ["workflow_ref_invalido", "workflow de outro repositório", { workflow_ref: "atacante/rac/" + POLITICA.arquivoWorkflow + "@refs/heads/main", job_workflow_ref: "atacante/rac/" + POLITICA.arquivoWorkflow + "@refs/heads/main" }],
    ["job_workflow_ref_invalido", "workflow reutilizável chamado pelo da main", { job_workflow_ref: wf("refs/heads/main", ".github/workflows/reutilizavel.yml") }],
    ["event_name_invalido", "push", { event_name: "push" }], ["event_name_invalido", "pull_request", { event_name: "pull_request" }],
    ["event_name_invalido", "schedule", { event_name: "schedule" }], ["event_name_invalido", "workflow_run", { event_name: "workflow_run" }],
    ["environment_invalido", "Environment da Cloudflare", { environment: "cloudflare-poc" }], ["environment_invalido", "outro Environment", { environment: "production" }],
    ["environment_ausente", "job sem Environment", { environment: undefined }],
    ["sub_invalido", "sub de outro Environment", { sub: "repo:raynercarvalho1/rac:environment:cloudflare-poc" }],
    ["sub_invalido", "sub de ref sem Environment", { sub: "repo:raynercarvalho1/rac:ref:refs/heads/main" }],
    ["repository_invalido", "outro repositório", { repository: "atacante/rac" }], ["repository_id_invalido", "fork com outro ID", { repository_id: "1" }],
    ["repository_owner_invalido", "outro dono", { repository_owner: "atacante" }],
    ["iss_invalido", "emissor de outro provedor", { iss: "https://accounts.exemplo.com" }],
    ["aud_invalida", "audiência padrão do GitHub", { aud: "https://github.com/raynercarvalho1" }],
    ["runner_environment_invalido", "runner próprio", { runner_environment: "self-hosted" }],
  ];
  for (const [esperado, nome, extra] of tabela) assert.equal(await motivo(c, await token(c, claimsValidos(extra))), esperado, nome);
  assert.equal(await motivo(c, await token(c, claimsValidos())), "ok", "a combinação da main e do workflow autorizado passa");
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

test("JWKS: com o cache vencido e o emissor fora, a validação falha fechada na hora (janela de reaproveitamento = 0)", async () => {
  assert.equal(POLITICA.jwksReaproveitarVelhoS, 0, "o ensaio não reaproveita chave velha");
  const c = await cenario();
  assert.equal(await motivo(c, await token(c)), "ok");
  c.estado.cai = true;
  c.relogio.t = AGORA + 300; // dentro do TTL (600 s): o cache ainda é fresco e continua valendo
  assert.equal(await motivo(c, await token(c, claimsValidos({ iat: AGORA + 290, nbf: AGORA + 290, exp: AGORA + 590 }))), "ok", "cache fresco");
  c.relogio.t = AGORA + 700; // cache vencido e emissor fora: nada de chave velha
  assert.equal(await motivo(c, await token(c, claimsValidos({ iat: AGORA + 690, nbf: AGORA + 690, exp: AGORA + 990 }))), "jwks_indisponivel");
  c.relogio.t = AGORA + 4000;
  assert.equal(await motivo(c, await token(c, claimsValidos({ iat: AGORA + 3990, nbf: AGORA + 3990, exp: AGORA + 4290 }))), "jwks_indisponivel");
});

test("JWKS: o mecanismo de reaproveitamento continua limitado se a política vier a permiti-lo (decisão futura, nunca ampliar)", async () => {
  const comJanela = { ...POLITICA, jwksReaproveitarVelhoS: 1000 }; // idade TOTAL máxima do conjunto desde a carga
  const par = await novoPar();
  const estado = { chaves: [jwkPublica(par.jwk)] };
  const relogio = { t: AGORA };
  const provedor = criarProvedorChaves({ fetchFn: emissor(estado), agora: () => relogio.t, politica: comJanela });
  const assinarEm = (iat) => assinar(cab(), claimsValidos({ iat, nbf: iat, exp: iat + 290 }), par.privada);
  const verificar = async (t) => (await verificarJwt(t, { obterChave: provedor, agora: () => relogio.t, politica: comJanela })).ok;
  assert.equal(await verificar(await assinarEm(AGORA - 10)), true);
  estado.cai = true;
  relogio.t = AGORA + 800; // cache vencido (TTL 600 s), mas com 800 s de idade total, dentro dos 1000 s
  assert.equal(await verificar(await assinarEm(AGORA + 790)), true);
  relogio.t = AGORA + 1100; // 1100 s de idade total, fora do limite
  assert.equal(await verificar(await assinarEm(AGORA + 1090)), false);
});

// ---------- Worker: ordem das etapas, corpo mínimo e ausência de credencial ----------

function pedido(jwt, corpo, { tipo = "application/json", metodo = "POST", caminho = "/auth-probe" } = {}) {
  const estado = { lido: false };
  const bytes = new TextEncoder().encode(typeof corpo === "string" ? corpo : JSON.stringify(corpo));
  const fluxo = new ReadableStream({ pull(controle) { estado.lido = true; controle.enqueue(bytes); controle.close(); } }, { highWaterMark: 0 });
  const headers = { "Content-Type": tipo };
  if (jwt) headers.Authorization = "Bearer " + jwt;
  const init = metodo === "GET" ? { method: "GET", headers } : { method: metodo, headers, body: fluxo, duplex: "half" };
  return { req: new Request("https://rac-icloud-auth-poc.exemplo.workers.dev" + caminho, init), estado };
}
const corpoOk = (extra = {}) => ({ operacao: "validar_oidc", ...extra });
async function resposta(r) { return { status: r.status, texto: await r.text(), headers: [...r.headers].map(([k, v]) => k + ": " + v).join("\n") }; }

test("o ensaio OIDC funciona sem nenhuma credencial: corpo mínimo, JWT válido, resposta só com confirmações", async () => {
  const c = await cenario();
  const { req, estado } = pedido(await token(c), corpoOk());
  const r = await resposta(await tratar(req, { verificar: c.verificar }));
  assert.equal(r.status, 200);
  assert.equal(estado.lido, true, "o corpo só é lido depois do JWT válido");
  assert.deepEqual(JSON.parse(r.texto), { ok: true, operacao: "validar_oidc", oidc: "validado", operacao_reconhecida: true });
});

test("sem JWT válido o corpo NUNCA é lido", async () => {
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

test("campos extras e operações não autorizadas são recusados; credencial no corpo é recusada e nunca ecoada", async () => {
  const c = await cenario();
  const casos = [
    ["usuario e senha (credencial) no corpo", corpoOk({ usuario: USUARIO, senha: SENHA }), 400],
    ["só a senha", corpoOk({ senha: SENHA }), 400], ["só o usuário", corpoOk({ usuario: USUARIO }), 400],
    ["campo extra qualquer", corpoOk({ extra: "x" }), 400], ["operação desconhecida", { operacao: "p1_login" }, 400],
    ["operação com credencial inventada", { operacao: "imap_login", usuario: USUARIO, senha: SENHA }, 400],
    ["sem operação", {}, 400], ["operação não é texto", { operacao: 1 }, 400], ["operação com quebra de linha", { operacao: "validar_oidc\r\n" }, 400],
    ["não é JSON", "{operacao:", 400], ["é lista", "[]", 400], ["texto puro", "oi", 400], ["vazio", "", 400],
    ["corpo enorme", corpoOk({ extra: "x".repeat(POLITICA.corpoMaxBytes) }), 413],
  ];
  for (const [nome, corpo, status] of casos) {
    const { req } = pedido(await token(c), corpo);
    const r = await resposta(await tratar(req, { verificar: c.verificar }));
    assert.equal(r.status, status, nome);
    assert.equal(JSON.parse(r.texto).ok, false);
    assert.ok(!r.texto.includes(SENHA) && !r.texto.includes(USUARIO), nome + ": a credencial recusada não pode voltar na resposta");
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
  const { req: req2 } = pedido(tOutra, { operacao: "outra_operacao" });
  assert.equal((await tratar(req2, { verificar, politica: dois })).status, 400, "operação sem implementação e sem esquema, nem com audiência certa");
});

test("lerCorpo aceita só o corpo mínimo da operação validar_oidc", () => {
  assert.deepEqual(lerCorpo(new TextEncoder().encode('{"operacao":"validar_oidc"}')), { operacao: "validar_oidc" });
  for (const ruim of ['{"operacao":"validar_oidc","x":1}', '{"operacao":"validar_oidc","usuario":"a","senha":"b"}', "{}", "[]", "null", '{"operacao":"outra"}'])
    assert.equal(lerCorpo(new TextEncoder().encode(ruim)), null, ruim);
  assert.equal(lerCorpo(new Uint8Array([0xff, 0xfe])), null);
});

test("JWT, credencial recusada e dados pessoais não aparecem em logs, erros nem respostas (todos os caminhos)", async () => {
  const c = await cenario();
  const chamadas = [];
  const originais = {};
  for (const m of ["log", "info", "warn", "error", "debug", "trace"]) { originais[m] = console[m]; console[m] = (...a) => chamadas.push(a.map(String).join(" ")); }
  const saidas = [];
  let jwtOk; let jwtRuim;
  try {
    jwtOk = await token(c);
    jwtRuim = await token(c, claimsValidos({ environment: "outro" }));
    const cenarios = [[jwtOk, corpoOk()], [jwtRuim, corpoOk()], [undefined, corpoOk()], [jwtOk, "{senha:" + SENHA], [jwtOk, corpoOk({ usuario: USUARIO, senha: SENHA })],
      [jwtOk, corpoOk({ extra: SENHA })], [jwtOk, corpoOk({ senha: SENHA.repeat(300) })], [jwtRuim, corpoOk({ usuario: USUARIO, senha: SENHA })]];
    for (const [jwt, corpo] of cenarios) {
      const { req } = pedido(jwt, corpo);
      saidas.push(await resposta(await tratar(req, { verificar: c.verificar })));
    }
    c.estado.cai = true; c.relogio.t = AGORA + 5000;
    const { req } = pedido(jwtOk, corpoOk());
    saidas.push(await resposta(await tratar(req, { verificar: c.verificar })));
    // falha interna: o verificador explode e a mensagem do erro não pode vazar
    const { req: r2 } = pedido(jwtOk, corpoOk({ senha: SENHA }));
    saidas.push(await resposta(await tratar(r2, { verificar: () => { throw new Error("SEGREDO " + SENHA); } })));
  } finally {
    for (const m of Object.keys(originais)) console[m] = originais[m];
  }
  for (const s of saidas) {
    for (const proibido of [SENHA, USUARIO, jwtOk, jwtRuim, "SEGREDO"]) { assert.ok(!s.texto.includes(proibido), "resposta vazou: " + proibido.slice(0, 12)); assert.ok(!s.headers.includes(proibido), "cabeçalho vazou"); }
  }
  assert.equal(chamadas.length, 0, "o Worker não escreve em console");
  assert.equal(saidas.at(-1).status, 500);
  assert.deepEqual(JSON.parse(saidas.at(-1).texto), { ok: false, erro: "falha_interna", motivo: "falha_interna" });
});

test("conferirClaims é uma função pura e fecha por padrão (objeto vazio nunca passa)", () => {
  assert.notEqual(conferirClaims({}, POLITICA, AGORA), null);
  assert.equal(conferirClaims(claimsValidos(), POLITICA, AGORA), null);
});

// ---------- Diagnóstico do JWKS (1ª execução real: HTTP 401 jwks_indisponivel) ----------
// Causa: o runtime do Cloudflare Workers só aceita redirect "follow" ou "manual"; "error" lança TypeError antes de qualquer rede.
// Estes testes imitam essa regra do runtime e provam: sucesso com "manual", cada falha com um detalhe específico e seguro, falha fechada.

const json200 = (obj) => new Response(JSON.stringify(obj), { status: 200, headers: { "Content-Type": "application/json" } });
// fetch com as regras do Workers: recusa redirect fora de follow/manual (TypeError, como o workerd), e registra as opções usadas
function fetchComoWorkers(roteiro, registro = []) {
  return async (url, opcoes = {}) => {
    registro.push({ url, redirect: opcoes.redirect });
    if (opcoes.redirect !== undefined && opcoes.redirect !== "follow" && opcoes.redirect !== "manual") {
      throw new TypeError('Invalid redirect value, must be one of "follow" or "manual"');
    }
    return roteiro(url, opcoes);
  };
}
const DESCOBERTA_OK = () => json200({ issuer: POLITICA.issuer, jwks_uri: URL_JWKS });
// roteiro padrão (sucesso), com troca pontual da descoberta ou do JWKS
function roteiroCom(par, { descoberta, jwks } = {}) {
  return (url, opcoes) => {
    if (url === URL_DESCOBERTA) return descoberta ? descoberta(opcoes) : DESCOBERTA_OK();
    if (url === URL_JWKS) return jwks ? jwks(opcoes) : json200({ keys: [jwkPublica(par.jwk)] });
    return new Response("nao", { status: 404 });
  };
}
const pendurado = (opcoes) => new Promise((_, rejeita) => opcoes.signal.addEventListener("abort", () => rejeita(new DOMException("abortado", "AbortError"))));
async function detalheDe(fetchFn, par, politica = POLITICA) {
  const relogio = { t: AGORA };
  const provedor = criarProvedorChaves({ fetchFn, agora: () => relogio.t, politica });
  const tk = await assinar(cab(), claimsValidos(), par.privada);
  const r = await verificarJwt(tk, { obterChave: provedor, agora: () => relogio.t, politica });
  return { r, tk };
}

test("DIAGNÓSTICO: o código nunca usa redirect \"error\" (o runtime Workers o rejeita com TypeError)", () => {
  const fonte = readFileSync(new URL("../experimentos/icloud-auth-probe/src/jwks.mjs", import.meta.url), "utf8");
  assert.ok(!/redirect:\s*"error"/.test(fonte), 'redirect: "error" não pode voltar');
  assert.ok(/redirect:\s*"manual"/.test(fonte));
});

test("DIAGNÓSTICO: com as regras do fetch do Workers, descoberta e JWKS válidos são aceitos, só com redirect manual", async () => {
  const par = await novoPar();
  const registro = [];
  const { r } = await detalheDe(fetchComoWorkers(roteiroCom(par), registro), par);
  assert.equal(r.ok, true);
  assert.deepEqual(registro.map((x) => x.url), [URL_DESCOBERTA, URL_JWKS]);
  assert.ok(registro.every((x) => x.redirect === "manual"), "nenhuma busca pede redirect fora de manual");
  // reprodução da falha real: um fetch que exige follow/manual derruba um código que pedisse "error"
  await assert.rejects(() => fetchComoWorkers(roteiroCom(par))(URL_JWKS, { redirect: "error" }), TypeError);
});

test("DIAGNÓSTICO: cada falha tem um detalhe específico, de lista fechada, e o motivo continua jwks_indisponivel (falha fechada)", async () => {
  const par = await novoPar();
  const curta = { ...POLITICA, jwksTimeoutMs: 25 };
  const grande = "x".repeat(POLITICA.jwksMaxBytes + 1);
  const redir = (status) => () => new Response(null, { status, headers: { Location: "https://atacante.exemplo/jwks" } });
  const casos = [
    ["discovery_timeout", { descoberta: pendurado }, curta],
    ["discovery_fetch_erro", { descoberta: () => { throw new TypeError("rede"); } }],
    ["discovery_redirect", { descoberta: redir(302) }],
    ["discovery_redirect", { descoberta: redir(301) }],
    ["discovery_http_erro", { descoberta: () => new Response("x", { status: 500 }) }],
    ["discovery_grande_demais", { descoberta: () => new Response(grande, { status: 200 }) }],
    ["discovery_grande_demais", { descoberta: () => new Response("{}", { status: 200, headers: { "Content-Length": String(POLITICA.jwksMaxBytes + 1) } }) }],
    ["discovery_json_invalido", { descoberta: () => new Response("<html>", { status: 200 }) }],
    ["discovery_json_invalido", { descoberta: () => new Response("null", { status: 200 }) }],
    ["discovery_emissor_invalido", { descoberta: () => json200({ issuer: "https://atacante.exemplo", jwks_uri: URL_JWKS }) }],
    ["discovery_jwks_uri_invalido", { descoberta: () => json200({ issuer: POLITICA.issuer }) }],
    ["discovery_jwks_uri_invalido", { descoberta: () => json200({ issuer: POLITICA.issuer, jwks_uri: "::nao-e-url" }) }],
    ["discovery_jwks_uri_invalido", { descoberta: () => json200({ issuer: POLITICA.issuer, jwks_uri: "https://atacante.exemplo/jwks" }) }],
    ["discovery_jwks_uri_invalido", { descoberta: () => json200({ issuer: POLITICA.issuer, jwks_uri: "http://token.actions.githubusercontent.com/.well-known/jwks" }) }],
    ["discovery_jwks_uri_invalido", { descoberta: () => json200({ issuer: POLITICA.issuer, jwks_uri: "https://u:p@token.actions.githubusercontent.com/jwks" }) }],
    ["jwks_timeout", { jwks: pendurado }, curta],
    ["jwks_fetch_erro", { jwks: () => { throw new TypeError("rede"); } }],
    ["jwks_redirect", { jwks: redir(307) }],
    ["jwks_http_erro", { jwks: () => new Response("x", { status: 503 }) }],
    ["jwks_grande_demais", { jwks: () => new Response(grande, { status: 200 }) }],
    ["jwks_json_invalido", { jwks: () => new Response("<html>", { status: 200 }) }],
    ["jwks_json_invalido", { jwks: () => json200({ keys: "x" }) }],
    ["jwks_json_invalido", { jwks: () => json200({}) }],
    ["jwks_sem_chave_valida", { jwks: () => json200({ keys: [] }) }],
    ["jwks_sem_chave_valida", { jwks: () => json200({ keys: [{ kty: "oct", kid: KID, k: "AAAA" }] }) }],
  ];
  const vistos = new Set();
  for (const [esperado, roteiro, politica] of casos) {
    const { r, tk } = await detalheDe(fetchComoWorkers(roteiroCom(par, roteiro)), par, politica || POLITICA);
    assert.equal(r.ok, false, esperado);
    assert.equal(r.motivo, "jwks_indisponivel", esperado);
    assert.equal(r.detalhe, esperado);
    assert.ok(DETALHES_JWKS.includes(r.detalhe), "detalhe é de lista fechada");
    assert.ok(!JSON.stringify(r).includes(tk), "o JWT não aparece no resultado");
    vistos.add(esperado);
  }
  assert.deepEqual([...vistos].sort(), [...DETALHES_JWKS].sort(), "toda categoria da lista fechada está coberta por um teste");
});

test("DIAGNÓSTICO: erro inesperado vira detalhe genérico (a mensagem original nunca sai) e a resposta do Worker leva o detalhe", async () => {
  const claims = claimsValidos();
  const par = await novoPar();
  const tk = await assinar(cab(), claims, par.privada);
  const segredo = "SENTINELA-MENSAGEM-INTERNA-" + tk.slice(0, 8);
  const verificar = (t) => verificarJwt(t, { obterChave: async () => { throw new Error(segredo); }, agora: () => AGORA, politica: POLITICA });
  const r = await verificar(tk);
  assert.deepEqual(r, { ok: false, motivo: "jwks_indisponivel", detalhe: "jwks_erro_inesperado" });
  const { req } = pedido(tk, corpoOk());
  const resp = await resposta(await tratar(req, { verificar }));
  assert.equal(resp.status, 401);
  assert.deepEqual(JSON.parse(resp.texto), { ok: false, erro: "nao_autorizado", motivo: "jwks_indisponivel", detalhe: "jwks_erro_inesperado" });
  assert.ok(!resp.texto.includes(segredo) && !resp.texto.includes(tk) && !resp.headers.includes(tk));
  // motivo sem detalhe (ex.: token ausente) continua com o formato anterior
  const { req: r2 } = pedido(null, corpoOk());
  assert.deepEqual(JSON.parse((await resposta(await tratar(r2, { verificar }))).texto), { ok: false, erro: "nao_autorizado", motivo: "token_ausente" });
});

test("DIAGNÓSTICO: JWKS no formato documentado do GitHub (várias chaves RSA 2048, x5c, x5t, use/alg) cabe no limite e é importado", async () => {
  const pares = [await novoPar(), await novoPar(), await novoPar(), await novoPar()];
  const lote = pares.map((p, i) => jwkPublica(p.jwk, i === 0 ? KID : "kid-extra-" + i, { x5c: ["M".repeat(1900)], x5t: "x".repeat(27) }));
  const corpo = JSON.stringify({ keys: lote });
  assert.ok(corpo.length < POLITICA.jwksMaxBytes / 4, "com folga muito grande sob o limite de " + POLITICA.jwksMaxBytes + " bytes: " + corpo.length);
  const registro = [];
  const { r } = await detalheDe(fetchComoWorkers(roteiroCom(pares[0], { jwks: () => new Response(corpo, { status: 200 }) }), registro), pares[0]);
  assert.equal(r.ok, true);
  assert.equal(registro.length, 2);
  // chave com n de 256 bytes (2048 bits) é aceita; a de 1024 bits segue recusada (critério inalterado)
  assert.equal(POLITICA.rsaMinimoBytes, 256);
});

test("DIAGNÓSTICO: a política continua estrita (TTL, janela de chave velha, tamanho e timeout inalterados)", () => {
  assert.equal(POLITICA.jwksReaproveitarVelhoS, 0);
  assert.equal(POLITICA.jwksTtlS, 600);
  assert.equal(POLITICA.jwksRecargaMinimaS, 60);
  assert.equal(POLITICA.jwksTimeoutMs, 5000);
  assert.equal(POLITICA.jwksMaxBytes, 65536);
  assert.equal(POLITICA.issuer, "https://token.actions.githubusercontent.com");
});
