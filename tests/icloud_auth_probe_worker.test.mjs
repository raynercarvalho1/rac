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
const ARQUIVOS = ["politica", "jwt", "jwks", "consumo", "imap", "mime", "mensagem", "rotas", "index"];
const FONTES = ARQUIVOS.map((n) => [n, semComentarios(ler("experimentos/icloud-auth-probe/src/" + n + ".mjs").replace(/^\s*\/\/.*$/gm, ""))]);
const FONTE = Object.fromEntries(FONTES);
const CODIGO = FONTES.map(([, t]) => t).join("\n");
const WFPATH = ".github/workflows/icloud-auth-probe.yml";
const temWorkflow = existe(WFPATH);
// o workflow chega a esta branch com o merge da PR de replay + P1 na main; antes disso o da main ainda é o anterior (sem p1_imap)
const workflowNovo = temWorkflow && /p1_imap/.test(ler(WFPATH));

test("o Worker não guarda nada além do registro de uso único: sem secret, variável, KV, R2, D1, cache, console ou armazenamento do navegador", () => {
  for (const x of [/\bconsole\b/, /\benv\b/, /\bKV\b/, /\bcaches\b/, /\blocalStorage\b/, /\bindexedDB\b/, /\bR2\b/, /\bD1\b/, /\bwaitUntil\b/, /secret put/, /\bcookie/i, /\.cf\b/, /process\.env/])
    assert.ok(!x.test(CODIGO), "uso não permitido no Worker: " + x);
  const cfg = JSON.parse(ler("experimentos/icloud-auth-probe/wrangler.jsonc").replace(/^\s*\/\/.*$/gm, ""));
  assert.deepEqual(Object.keys(cfg).sort(), ["$schema", "compatibility_date", "durable_objects", "main", "migrations", "name", "observability", "workers_dev"], "nenhuma chave de build, regras, variáveis, KV, rotas ou gatilho");
  assert.equal(cfg.name, "rac-icloud-auth-poc");
  assert.equal(cfg.main, "src/index.mjs");
  assert.deepEqual(cfg.observability, { enabled: false });
  assert.deepEqual(cfg.durable_objects, { bindings: [{ name: "CONSUMO", class_name: "ConsumoUnico" }] }, "um único Durable Object");
  assert.deepEqual(cfg.migrations, [{ tag: "v1", new_sqlite_classes: ["ConsumoUnico"] }], "SQLite (o plano Free só cria objetos com SQLite)");
  assert.match(FONTE.index, /export \{ ConsumoUnico \} from "\.\/consumo\.mjs"/);
});

test("credencial: só imap.mjs, mensagem.mjs, rotas.mjs e index.mjs a tratam; política, JWT, JWKS, MIME e o registro de uso único nem conhecem o conceito", () => {
  for (const n of ["politica", "jwt", "jwks", "consumo", "mime"]) assert.ok(!/\bsenha\b|\busuario\b|\bcredencial\b|(?<!\.)\bpassword\b/i.test(FONTE[n]), n + ": não pode tratar credencial");
  assert.ok(/\bsenha\b/.test(FONTE.imap) && /\bsenha\b/.test(FONTE.mensagem) && /\bsenha\b/.test(FONTE.rotas));
  // a credencial nunca é gravada nem registrada: nada de armazenamento, console ou espera em segundo plano nos três arquivos que a tratam
  for (const n of ["imap", "mensagem", "rotas", "index"]) for (const x of [/\bconsole\b/, /\bwaitUntil\b/, /\bstorage\b/, /\bsql\b/, /\blocalStorage\b/, /JSON\.stringify\([^)]*(?:senha|usuario)/]) assert.ok(!x.test(FONTE[n]), n + ": " + x);
});

test("só o index.mjs abre socket: cloudflare:sockets e connect() só lá; IMAP só em imap.mail.me.com:993; nenhum SMTP em lugar nenhum", () => {
  for (const [n, t] of FONTES) {
    assert.equal(/cloudflare:/.test(t), n === "index", n + ": cloudflare: só no ponto de entrada");
    assert.equal(/\bconnect\(/.test(t), n === "index", n + ": connect() só no ponto de entrada");
    assert.ok(!/smtp|\bSTARTTLS\b|\bLOGIN\b.*smtp/i.test(t.replace(/"starttls"/g, "")), n + ": sem SMTP");
    assert.ok(!/mail\.me\.com/.test(t) || n === "politica", n + ": o host da Apple só na política");
  }
  assert.match(FONTE.index, /import \{ connect \} from "cloudflare:sockets"/);
  assert.match(FONTE.index, /secureTransport: "on"/);
  assert.match(FONTE.politica, /host: "imap\.mail\.me\.com", porta: 993/);
  assert.deepEqual([...FONTE.politica.matchAll(/[a-z0-9.-]+\.mail\.me\.com/g)].map((m) => m[0]), ["imap.mail.me.com"]);
  assert.match(FONTE.index, /connect\(\{ hostname: host, port: porta \}/, "o host do socket vem sempre do parâmetro, que vem da política");
});

test("o diretório do Worker tem só a lista fixa de arquivos (a mesma que o workflow da main exige) e nenhum arquivo oculto", () => {
  const real = [];
  (function varrer(dir, pref) { for (const e of fs.readdirSync(new URL(dir, raiz), { withFileTypes: true })) e.isDirectory() ? varrer(dir + e.name + "/", pref + e.name + "/") : real.push("./" + pref + e.name); })("experimentos/icloud-auth-probe/", "");
  assert.deepEqual(real.sort(), ["./README.md", "./src/consumo.mjs", "./src/imap.mjs", "./src/index.mjs", "./src/jwks.mjs", "./src/jwt.mjs", "./src/mensagem.mjs", "./src/mime.mjs", "./src/politica.mjs", "./src/rotas.mjs", "./wrangler.jsonc"]);
  assert.ok(!real.some((f) => /(^|\/)\./.test(f.slice(2))));
});

test("o código do Worker não tem execução dinâmica nem rede além do JWKS e do IMAP, e as importações são só relativas (mais cloudflare:sockets no ponto de entrada)", () => {
  for (const [n, t] of FONTES) {
    for (const x of [/\beval\s*\(/, /new Function/, /\bimport\s*\(/, /\brequire\s*\(/, /process\.env/, /\bWebSocket\b/, /XMLHttpRequest/]) assert.ok(!x.test(t), n + ": " + x);
    for (const m of t.matchAll(/^import .* from "([^"]+)"/gm)) assert.ok(/^\.\/[a-z]+\.mjs$/.test(m[1]) || (n === "index" && m[1] === "cloudflare:sockets"), n + ": importação não permitida " + m[1]);
  }
  assert.deepEqual(FONTES.filter(([, t]) => /\bfetch\(/.test(t)).map(([n]) => n), ["consumo", "index"], "fetch(): o do JWKS (index, injetado) e o do Durable Object (consumo)");
  assert.match(FONTE.consumo, /async fetch\(request\)/, "no consumo, fetch é o método do Durable Object");
  assert.match(FONTE.consumo, /stub\.fetch\("https:\/\/consumo\.interno\/consumir"/, "e a chamada ao objeto vai a um endereço interno fixo");
});

test("limites da política: tolerância pequena, idade máxima curta (60 s com credencial), JWKS sem reaproveitamento de chave velha, corpo e token pequenos", () => {
  assert.ok(POLITICA.toleranciaRelogioS <= 60 && POLITICA.idadeMaximaS <= 600);
  assert.ok(POLITICA.idadeMaximaCredencialS <= 60);
  assert.equal(POLITICA.jwksReaproveitarVelhoS, 0, "falha fechada quando o JWKS não pode ser atualizado");
  assert.ok(POLITICA.jwksRecargaMinimaS >= 60 && POLITICA.jwksTtlS <= 600);
  assert.ok(POLITICA.corpoMaxBytes <= 2048 && POLITICA.jwtMaxBytes <= 8192 && POLITICA.rsaMinimoBytes >= 256);
  assert.equal(POLITICA.issuer, "https://token.actions.githubusercontent.com");
  assert.equal(POLITICA.algoritmo, "RS256");
  assert.deepEqual(POLITICA.operacoes, ["validar_oidc", "validar_uso_unico", "p1_imap", "p2_imap"]);
  assert.deepEqual(POLITICA.operacoesComConsumo, ["validar_uso_unico", "p1_imap", "p2_imap"]);
  assert.deepEqual(POLITICA.operacoesComCredencial, ["p1_imap", "p2_imap"]);
  assert.ok(POLITICA.operacoesComCredencial.every((o) => POLITICA.operacoesComConsumo.includes(o)), "toda operação com credencial exige uso único");
  assert.ok(POLITICA.consumo.retencaoChaveS >= 86400 && POLITICA.consumo.timeoutMs <= 5000);
  assert.deepEqual({ ...POLITICA.imap, pastaTeste: undefined }, { host: "imap.mail.me.com", porta: 993, timeoutMs: 20000, maxBytes: 262144, maxLinhas: 500, pastaTeste: undefined });
});

test("a política aceita só a origem do Desenho B: ref da main, workflow da main, evento manual e o Environment dedicado", () => {
  assert.deepEqual(POLITICA.refsPermitidos, ["refs/heads/main"]);
  assert.equal(workflowRefEsperado(POLITICA.refsPermitidos[0]), "raynercarvalho1/rac/.github/workflows/icloud-auth-probe.yml@refs/heads/main");
  assert.equal(POLITICA.arquivoWorkflow, WFPATH);
  assert.deepEqual(POLITICA.eventosPermitidos, ["workflow_dispatch"]);
  assert.equal(POLITICA.environment, "icloud-auth-poc");
  assert.ok(POLITICA.subsPermitidos.every((s) => s.endsWith(":environment:icloud-auth-poc")), "o sub exige o Environment");
  assert.deepEqual(audienciasPermitidas(), ["rac-inbox-icloud-poc:validar_oidc", "rac-inbox-icloud-poc:validar_uso_unico", "rac-inbox-icloud-poc:p1_imap", "rac-inbox-icloud-poc:p2_imap"]);
  assert.ok(!POLITICA.refsPermitidos.some((r) => /poc|claude|pull|tags/.test(r)), "nenhuma branch experimental, de agente, PR ou tag");
});

test("coerência com o workflow privilegiado da main (quando a versão com replay + P1 já está nesta branch)", { skip: !workflowNovo && "o workflow com replay + P1 chega a esta branch com o merge da PR dele na main" }, () => {
  const wf = semComentarios(ler(WFPATH));
  assert.match(wf, new RegExp("^      AUDIENCIA_PREFIXO: " + POLITICA.audienciaPrefixo.replace(/:$/, "") + "\\s*$", "m"));
  for (const op of POLITICA.operacoes) assert.ok(wf.includes("$AUDIENCIA_PREFIXO:" + op), "audiência ausente do workflow: " + op);
  assert.deepEqual(audienciasPermitidas(), POLITICA.operacoes.map((o) => POLITICA.audienciaPrefixo + o));
  assert.match(wf, new RegExp("^    environment: " + POLITICA.environment + "\\s*$", "m"));
  assert.ok(wf.includes("https://" + JSON.parse(ler("experimentos/icloud-auth-probe/wrangler.jsonc")).name + "."), "a URL fixa do job executar é a do Worker");
  assert.equal([...wf.matchAll(/\[ "\$GITHUB_REF" != "refs\/heads\/main" \]/g)].length, 3);
  assert.match(wf, /^      commit:\s*$/m);
  // a configuração FIXA do workflow é a mesma do wrangler.jsonc do Worker (inclui o Durable Object e a migração)
  const heredoc = JSON.parse(/<<'JSON'\n([\s\S]*?)\n\s*JSON\n/.exec(wf)[1].replace(/^\s{10}/gm, ""));
  const cfg = JSON.parse(ler("experimentos/icloud-auth-probe/wrangler.jsonc")); delete cfg.$schema;
  assert.deepEqual(heredoc, cfg);
  for (const arq of ARQUIVOS) assert.ok(wf.includes("./src/" + arq + ".mjs"), "arquivo fora da lista fixa do workflow: " + arq);
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
