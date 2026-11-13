// RAC Inbox · POC autenticada iCloud (S3): trava o ESCOPO por texto, sem rede e sem credencial.
// Garante o desenho decidido pelo dono: dois jobs com Environments próprios, nenhum segredo entre eles, a senha Apple nunca no Worker
// (nem como secret, variável ou armazenamento), nenhum acesso à Apple nesta etapa e execução somente manual.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { POLITICA, audienciasPermitidas } from "../experimentos/icloud-auth-probe/src/politica.mjs";

const raiz = new URL("../", import.meta.url);
const ler = (a) => fs.readFileSync(new URL(a, raiz), "utf8");
const semComentarios = (t) => t.replace(/^\s*#.*$/gm, "").replace(/\s+#\s.*$/gm, "");
const WFTXT = ler(".github/workflows/icloud-auth-probe.yml");
const WF = semComentarios(WFTXT);
const iExec = WF.search(/^  executar:/m);
const PROV = WF.slice(WF.search(/^  provisionar:/m), iExec);
const EXEC = WF.slice(iExec);
const FONTES = ["politica", "jwt", "jwks", "index"].map((n) => [n, ler("experimentos/icloud-auth-probe/src/" + n + ".mjs")]);
const CODIGO = FONTES.map(([, t]) => semComentarios(t.replace(/^\s*\/\/.*$/gm, ""))).join("\n");

test("só dispara na mão e sem permissões por padrão", () => {
  assert.match(WF, /^on:\s*\n\s+workflow_dispatch:/m);
  for (const x of [/\bpush:/, /\bpull_request/, /\bschedule:/, /\bcron:/, /\bworkflow_run:/, /\bworkflow_call:/, /\brepository_dispatch:/, /\binputs:/])
    assert.ok(!x.test(WF), "gatilho ou entrada não permitido: " + x);
  assert.match(WF, /^permissions: \{\}\s*$/m);
  assert.deepEqual([...WF.matchAll(/^  ([a-z]+):\s*$/gm)].map((m) => m[1]).filter((n) => ["provisionar", "executar"].includes(n)), ["provisionar", "executar"]);
});

test("job provisionar: Environment cloudflare-poc, só credenciais Cloudflare, nenhum segredo Apple, sem token OIDC", () => {
  assert.match(PROV, /^    environment: cloudflare-poc\s*$/m);
  assert.match(PROV, /^    permissions:\s*\n      contents: read\s*$/m);
  assert.ok(!/id-token/.test(PROV) && !/ICLOUD_(?:USER|APP_PASSWORD)/.test(PROV) && !/ACTIONS_ID_TOKEN/.test(PROV) && !/audience/i.test(PROV), "sem OIDC nem Apple");
  const usados = [...PROV.matchAll(/\$\{\{\s*secrets\.([A-Z_]+)\s*\}\}/g)].map((m) => m[1]);
  assert.ok(usados.length >= 4);
  for (const n of usados) assert.ok(["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"].includes(n), "secret não previsto no provisionar: " + n);
  assert.match(PROV, /npx --yes wrangler@4\.161\.0 deploy\s*$/m);
  assert.ok(!/secret put|\bwrangler@\S+ (login|delete|secret|kv|d1|r2|tail|dev)\b/.test(PROV), "só deploy; nada de secret put");
});

test("job executar: Environment icloud-auth-poc, id-token só aqui, nenhuma credencial Cloudflare e nenhum código do repositório", () => {
  assert.match(EXEC, /^    environment: icloud-auth-poc\s*$/m);
  assert.match(EXEC, /^    needs: provisionar\s*$/m);
  assert.match(EXEC, /^    permissions:\s*\n      id-token: write\s*\n    env:/m, "a única permissão do job é id-token: write");
  assert.equal([...WF.matchAll(/id-token:\s*write/g)].length, 1, "id-token só no job executar");
  assert.ok(!/CLOUDFLARE_(?:API_TOKEN|ACCOUNT_ID)|wrangler|\buses:|checkout|contents:|\bnpm\b|\bnpx\b/i.test(EXEC), "sem Cloudflare, sem actions e sem código do repositório no job da senha Apple");
  const usados = [...EXEC.matchAll(/\$\{\{\s*secrets\.([A-Z_]+)\s*\}\}/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(usados)].sort(), ["ICLOUD_APP_PASSWORD", "ICLOUD_USER"]);
  for (const m of EXEC.matchAll(/^\s+([A-Z_]+): (\$\{\{ secrets\.\w+ \}\})\s*$/gm)) assert.equal(m[2], "${{ secrets." + m[1] + " }}");
});

test("nada passa entre os jobs: sem outputs, artefatos, arquivos de ambiente ou referência ao job anterior", () => {
  for (const x of [/\boutputs:/, /upload-artifact/, /download-artifact/, /\bcache@/, /GITHUB_OUTPUT/, /GITHUB_ENV/, /GITHUB_PATH/, /needs\.\w+\.outputs/, /steps\.\w+\.outputs/, /\bartifact/i])
    assert.ok(!x.test(WF), "mecanismo proibido entre jobs: " + x);
  assert.match(EXEC, /^      WORKER_URL: https:\/\/rac-icloud-auth-poc\.[a-z0-9-]+\.workers\.dev\s*$/m, "URL fixa e não sensível");
  assert.ok(!/needs\./.test(EXEC.replace(/^    needs: provisionar\s*$/m, "")), "nenhum dado do job anterior é lido");
});

test("a senha Apple e o JWT nunca vão por argumento, arquivo, eco ou log; o JWT é mascarado", () => {
  assert.ok(!/(?:^|\s)-x\b|set -x/.test(WF), "sem set -x");
  assert.ok(!/echo[^\n]*\$\{?(ICLOUD_|JWT\b|ACTIONS_ID_TOKEN)/.test(EXEC.replace(/echo "::add-mask::\$JWT"/, "")), "nada de eco do valor da credencial ou do token");
  assert.ok(!/--arg\b|--argjson|jq[^\n]*\$ICLOUD|-d "|--data "/.test(EXEC), "a credencial não vai por argumento de comando");
  assert.match(EXEC, /jq -n '\{operacao: "validar_oidc", usuario: env\.ICLOUD_USER, senha: env\.ICLOUD_APP_PASSWORD\}'/);
  assert.match(EXEC, /--data-binary @-/);
  assert.equal([...EXEC.matchAll(/-K <\(printf 'header = "Authorization: Bearer %s"\\n' "\$(?:ACTIONS_ID_TOKEN_REQUEST_TOKEN|JWT)"\)/g)].length, 2, "cabeçalhos de autorização por substituição de processo");
  assert.ok(EXEC.indexOf('::add-mask::$JWT') > 0 && EXEC.indexOf('::add-mask::$JWT') < EXEC.indexOf('"$WORKER_URL/auth-probe"'), "mascarar antes de enviar");
  assert.ok(!/>\s*"?\$RUNNER_TEMP[^\n]*(ICLOUD|JWT)/.test(EXEC) && !/(?:tee|>>?)\s*\S*(senha|jwt|token)/i.test(EXEC), "nenhuma gravação do segredo em arquivo");
  assert.ok(!/GITHUB_STEP_SUMMARY[^\n]*(ICLOUD|JWT)/.test(EXEC), "resumo sem credencial");
  assert.match(EXEC, /unset JWT/);
});

test("audiência, branch e Environment do workflow coincidem com a política do Worker", () => {
  const aud = /AUDIENCIA: (\S+)/.exec(EXEC)[1];
  assert.deepEqual(audienciasPermitidas(), [aud]);
  assert.match(EXEC, new RegExp("&audience=\\$\\{AUDIENCIA\\}"));
  assert.match(EXEC, new RegExp("^    environment: " + POLITICA.environment + "\\s*$", "m"));
  assert.match(EXEC, new RegExp("\\s" + POLITICA.refsPermitidos[0].replace("refs/heads/", "") + "\\) ;;"), "o guarda de branch do executar é a branch da política");
  assert.equal(POLITICA.arquivoWorkflow, ".github/workflows/icloud-auth-probe.yml");
  assert.ok(fs.existsSync(new URL(POLITICA.arquivoWorkflow, raiz)), "o workflow da política existe");
  assert.deepEqual(POLITICA.eventosPermitidos, ["workflow_dispatch"]);
  assert.equal(POLITICA.issuer, "https://token.actions.githubusercontent.com");
  assert.equal(POLITICA.algoritmo, "RS256");
  assert.ok(POLITICA.refsPermitidos.every((r) => /^refs\/heads\/poc\//.test(r)), "só branch da POC");
});

test("actions só oficiais e Wrangler fixo", () => {
  const usos = [...WF.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1]);
  assert.ok(usos.length >= 2);
  for (const u of usos) assert.match(u, /^actions\/(checkout|setup-node)@v\d+$/, u);
  for (const m of WF.matchAll(/\bwrangler(@\S+)?/g)) assert.equal(m[1], "@4.161.0");
});

test("o Worker não guarda nada: sem secret, variável, KV, Durable Object, cache, console ou armazenamento", () => {
  for (const x of [/\bconsole\b/, /\benv\b/, /\bKV\b/, /DurableObject/, /\bcaches\b/, /\blocalStorage\b/, /\bindexedDB\b/, /\bR2\b/, /\bD1\b/, /\bwaitUntil\b/, /secret put/, /\bcookie/i, /\.cf\b/])
    assert.ok(!x.test(CODIGO), "uso não permitido no Worker: " + x);
  assert.ok(!/(cloudflare:sockets|\bconnect\(|imap\.mail\.me\.com|smtp\.mail\.me\.com|\bSTARTTLS\b|\bLOGIN\b)/i.test(CODIGO), "nesta etapa o Worker não fala com a Apple");
  const cfg = JSON.parse(ler("experimentos/icloud-auth-probe/wrangler.jsonc").replace(/^\s*\/\/.*$/gm, ""));
  assert.deepEqual(Object.keys(cfg).sort(), ["$schema", "compatibility_date", "main", "name", "observability", "workers_dev"]);
  assert.equal(cfg.name, "rac-icloud-auth-poc");
  assert.equal(cfg.workers_dev, true);
  assert.deepEqual(cfg.observability, { enabled: false });
  assert.ok(new RegExp("rac-icloud-auth-poc\\.[a-z0-9-]+\\.workers\\.dev").test(EXEC), "a URL fixa do job executar é a do Worker");
});

test("os limites de CPU e de JWKS da política são conservadores", () => {
  assert.ok(POLITICA.toleranciaRelogioS <= 60 && POLITICA.idadeMaximaS <= 600);
  assert.ok(POLITICA.jwksReaproveitarVelhoS <= 3600 && POLITICA.jwksRecargaMinimaS >= 60);
  assert.ok(POLITICA.corpoMaxBytes <= 2048 && POLITICA.jwtMaxBytes <= 8192 && POLITICA.rsaMinimoBytes >= 256);
});

test("documentação: o Documento 10 registra a S3, o Environment dedicado e o workflow, sem escrever credencial", () => {
  const d10 = ler("docs/planejamento/10-rac-inbox.md");
  assert.match(d10, /icloud-auth-probe\.yml/);
  assert.match(d10, /icloud-auth-poc/);
  assert.match(d10, /13\.13/);
  const readme = ler("experimentos/icloud-auth-probe/README.md");
  for (const t of [WFTXT, d10, readme, ler("docs/planejamento/historico-diario.md")]) assert.ok(!/(?:cfut_|cfat_|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|Bearer [A-Za-z0-9_-]{30,})/.test(t), "parece um token escrito no texto");
});
