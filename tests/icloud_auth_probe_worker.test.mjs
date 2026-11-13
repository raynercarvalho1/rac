// RAC Inbox · POC autenticada iCloud — Worker de validação OIDC: ESCOPO do código por texto, sem rede e sem credencial.
// O workflow privilegiado (Desenho B) vive só na main e é testado lá (tests/icloud_auth_probe_workflow.test.mjs). Aqui ficam as garantias do
// que viaja como DADO no commit da POC: o Worker não guarda nada, não trata credencial, não fala com a Apple e só aceita a política da main.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { POLITICA, audienciasPermitidas, workflowRefEsperado } from "../experimentos/icloud-auth-probe/src/politica.mjs";

const raiz = new URL("../", import.meta.url);
const ler = (a) => fs.readFileSync(new URL(a, raiz), "utf8");
const existe = (a) => fs.existsSync(new URL(a, raiz));
const semComentarios = (t) => t.replace(/^\s*#.*$/gm, "").replace(/\s+#\s.*$/gm, "");
const FONTES = ["politica", "jwt", "jwks", "index"].map((n) => [n, semComentarios(ler("experimentos/icloud-auth-probe/src/" + n + ".mjs").replace(/^\s*\/\/.*$/gm, ""))]);
const CODIGO = FONTES.map(([, t]) => t).join("\n");
const WFPATH = ".github/workflows/icloud-auth-probe.yml";
const temWorkflow = existe(WFPATH);

test("o Worker não guarda nada: sem secret, variável, KV, Durable Object, cache, console ou armazenamento", () => {
  for (const x of [/\bconsole\b/, /\benv\b/, /\bKV\b/, /DurableObject/, /\bcaches\b/, /\blocalStorage\b/, /\bindexedDB\b/, /\bR2\b/, /\bD1\b/, /\bwaitUntil\b/, /secret put/, /\bcookie/i, /\.cf\b/])
    assert.ok(!x.test(CODIGO), "uso não permitido no Worker: " + x);
  const cfg = JSON.parse(ler("experimentos/icloud-auth-probe/wrangler.jsonc").replace(/^\s*\/\/.*$/gm, ""));
  assert.deepEqual(Object.keys(cfg).sort(), ["$schema", "compatibility_date", "main", "name", "observability", "workers_dev"], "nenhuma chave de build, regras, variáveis, KV, Durable Object ou gatilho");
  assert.equal(cfg.name, "rac-icloud-auth-poc");
  assert.deepEqual(cfg.observability, { enabled: false });
});

test("o primeiro ensaio OIDC não depende de nenhuma credencial: o Worker não tem código de usuário, senha ou credencial e não fala com a Apple", () => {
  assert.ok(!/\bsenha\b|\busuario\b|\bcredencial\b|(?<!\.)\bpassword\b/i.test(CODIGO), "alvo.password é a conferência de URL do JWKS");
  assert.ok(!/(cloudflare:sockets|\bconnect\(|imap\.mail\.me\.com|smtp\.mail\.me\.com|\bSTARTTLS\b|\bLOGIN\b)/i.test(CODIGO));
});

test("o diretório do Worker tem só a lista fixa de arquivos (a mesma que o workflow da main exige) e nenhum arquivo oculto", () => {
  const real = [];
  (function varrer(dir, pref) { for (const e of fs.readdirSync(new URL(dir, raiz), { withFileTypes: true })) e.isDirectory() ? varrer(dir + e.name + "/", pref + e.name + "/") : real.push("./" + pref + e.name); })("experimentos/icloud-auth-probe/", "");
  assert.deepEqual(real.sort(), ["./README.md", "./src/index.mjs", "./src/jwks.mjs", "./src/jwt.mjs", "./src/politica.mjs", "./wrangler.jsonc"]);
  assert.ok(!real.some((f) => /(^|\/)\./.test(f.slice(2))));
});

test("o código do Worker não tem execução dinâmica nem rede além do JWKS, e as importações são só relativas", () => {
  for (const [n, t] of FONTES) {
    for (const x of [/\beval\s*\(/, /new Function/, /\bimport\s*\(/, /\brequire\s*\(/, /process\.env/, /cloudflare:/, /\bWebSocket\b/, /XMLHttpRequest/]) assert.ok(!x.test(t), n + ": " + x);
    for (const m of t.matchAll(/^import .* from "([^"]+)"/gm)) assert.match(m[1], /^\.\/[a-z]+\.mjs$/, n + ": só importações relativas");
  }
  assert.deepEqual(FONTES.filter(([, t]) => /\bfetch\(/.test(t)).map(([n]) => n), ["index"], "a única chamada de rede é o fetch do JWKS, injetado no provedor de chaves");
});

test("limites da política: tolerância pequena, idade máxima curta, JWKS sem reaproveitamento de chave velha, corpo e token pequenos", () => {
  assert.ok(POLITICA.toleranciaRelogioS <= 60 && POLITICA.idadeMaximaS <= 600);
  assert.equal(POLITICA.jwksReaproveitarVelhoS, 0, "falha fechada quando o JWKS não pode ser atualizado");
  assert.ok(POLITICA.jwksRecargaMinimaS >= 60 && POLITICA.jwksTtlS <= 600);
  assert.ok(POLITICA.corpoMaxBytes <= 2048 && POLITICA.jwtMaxBytes <= 8192 && POLITICA.rsaMinimoBytes >= 256);
  assert.equal(POLITICA.issuer, "https://token.actions.githubusercontent.com");
  assert.equal(POLITICA.algoritmo, "RS256");
  assert.deepEqual(POLITICA.operacoes, ["validar_oidc"], "só a operação de validação desta POC");
});

test("a política aceita só a origem do Desenho B: ref da main, workflow da main, evento manual e o Environment dedicado", () => {
  assert.deepEqual(POLITICA.refsPermitidos, ["refs/heads/main"]);
  assert.equal(workflowRefEsperado(POLITICA.refsPermitidos[0]), "raynercarvalho1/rac/.github/workflows/icloud-auth-probe.yml@refs/heads/main");
  assert.equal(POLITICA.arquivoWorkflow, WFPATH);
  assert.deepEqual(POLITICA.eventosPermitidos, ["workflow_dispatch"]);
  assert.equal(POLITICA.environment, "icloud-auth-poc");
  assert.ok(POLITICA.subsPermitidos.every((s) => s.endsWith(":environment:icloud-auth-poc")), "o sub exige o Environment");
  assert.deepEqual(audienciasPermitidas(), ["rac-inbox-icloud-poc:validar_oidc"]);
  assert.ok(!POLITICA.refsPermitidos.some((r) => /poc|claude|pull|tags/.test(r)), "nenhuma branch experimental, de agente, PR ou tag");
});

test("coerência com o workflow privilegiado da main (quando ele já está nesta branch)", { skip: !temWorkflow && "o workflow chega a esta branch quando a PR do Desenho B for mesclada na main" }, () => {
  const wf = semComentarios(ler(WFPATH));
  assert.deepEqual(audienciasPermitidas(), [/AUDIENCIA: (\S+)/.exec(wf)[1]]);
  assert.match(wf, new RegExp("^    environment: " + POLITICA.environment + "\\s*$", "m"));
  assert.ok(wf.includes("https://" + JSON.parse(ler("experimentos/icloud-auth-probe/wrangler.jsonc")).name + "."), "a URL fixa do job executar é a do Worker");
  assert.equal([...wf.matchAll(/\[ "\$GITHUB_REF" != "refs\/heads\/main" \]/g)].length, 3);
  assert.match(wf, /^      commit:\s*$/m);
});

test("documentação: README do Worker e Documento 10 registram o Desenho B e que o primeiro ensaio não exige secrets Apple, sem escrever credencial", () => {
  const readme = ler("experimentos/icloud-auth-probe/README.md"), d10 = ler("docs/planejamento/10-rac-inbox.md");
  const frase = /primeiro ensaio OIDC não exige cadastro de secrets Apple/;
  assert.match(readme, frase);
  assert.match(d10, frase);
  assert.match(d10, /13\.16/);
  assert.match(d10, /Desenho B/);
  for (const t of [readme, d10, ler("docs/planejamento/historico-diario.md")]) assert.ok(!/(?:cfut_|cfat_|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|Bearer [A-Za-z0-9_-]{30,})/.test(t), "parece um token escrito no texto");
});
