// RAC Inbox · POC autenticada iCloud (S3): trava o ESCOPO por texto, sem rede e sem credencial.
// Garante o desenho decidido pelo dono: jobs com Environments próprios, nenhum segredo entre eles, a senha Apple nunca no Worker
// (nem como secret, variável ou armazenamento), nenhum acesso à Apple nesta etapa e execução somente manual.
// O primeiro ensaio OIDC NÃO usa credencial Apple alguma: nenhum secret Apple no workflow, corpo sintético e mínimo, Worker sem código de credencial.
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
const iProv = WF.search(/^  provisionar:/m);
const VER = WF.slice(WF.search(/^  verificar:/m), iProv);
const PROV = WF.slice(iProv, iExec);
const EXEC = WF.slice(iExec);
const FONTES = ["politica", "jwt", "jwks", "index"].map((n) => [n, ler("experimentos/icloud-auth-probe/src/" + n + ".mjs")]);
const CODIGO = FONTES.map(([, t]) => semComentarios(t.replace(/^\s*\/\/.*$/gm, ""))).join("\n");

test("só dispara na mão e sem permissões por padrão", () => {
  assert.match(WF, /^on:\s*\n\s+workflow_dispatch:/m);
  for (const x of [/\bpush:/, /\bpull_request/, /\bschedule:/, /\bcron:/, /\bworkflow_run:/, /\bworkflow_call:/, /\brepository_dispatch:/, /\binputs:/])
    assert.ok(!x.test(WF), "gatilho ou entrada não permitido: " + x);
  assert.match(WF, /^permissions: \{\}\s*$/m);
  assert.deepEqual([...WF.matchAll(/^  ([a-z]+):\s*$/gm)].map((m) => m[1]).filter((n) => ["verificar", "provisionar", "executar"].includes(n)), ["verificar", "provisionar", "executar"]);
});

test("job provisionar: Environment cloudflare-poc, só credenciais Cloudflare, nenhum segredo Apple, sem token OIDC", () => {
  assert.match(PROV, /^    environment: cloudflare-poc\s*$/m);
  assert.match(PROV, /^    permissions:\s*\n      contents: read\s*$/m);
  assert.ok(!/id-token/.test(PROV) && !/ICLOUD_(?:USER|APP_PASSWORD)/.test(PROV) && !/ACTIONS_ID_TOKEN/.test(PROV) && !/audience/i.test(PROV), "sem OIDC nem Apple");
  const usados = [...PROV.matchAll(/\$\{\{\s*secrets\.([A-Z_]+)\s*\}\}/g)].map((m) => m[1]);
  assert.ok(usados.length >= 4);
  for (const n of usados) assert.ok(["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"].includes(n), "secret não previsto no provisionar: " + n);
  assert.match(PROV, /node "\$GITHUB_WORKSPACE\/experimentos\/icloud-auth-probe-ferramenta\/node_modules\/wrangler\/bin\/wrangler\.js" deploy --config "\$RUNNER_TEMP\/publicar\/wrangler\.publicar\.jsonc"\s*$/m);
  assert.ok(!/secret put|wrangler\.js"? (login|delete|secret|kv|d1|r2|tail|dev|versions|rollback)\b/.test(PROV), "só deploy; nada de secret put");
  assert.ok(!/\bnpx\b/.test(WF), "nenhum npx: nada é baixado do registro com um secret no ambiente");
});

test("job executar: Environment icloud-auth-poc, id-token só aqui, SEM nenhum secret, sem credencial Cloudflare e sem código do repositório", () => {
  assert.match(EXEC, /^    environment: icloud-auth-poc\s*$/m);
  assert.match(EXEC, /^    needs: provisionar\s*$/m);
  assert.match(EXEC, /^    permissions:\s*\n      id-token: write\s*\n    env:/m, "a única permissão do job é id-token: write");
  assert.equal([...WF.matchAll(/id-token:\s*write/g)].length, 1, "id-token só no job executar");
  assert.ok(!/CLOUDFLARE_(?:API_TOKEN|ACCOUNT_ID)|wrangler|\buses:|checkout|contents:|\bnpm\b|\bnpx\b/i.test(EXEC), "sem Cloudflare, sem actions e sem código do repositório no job do token OIDC");
  assert.ok(!/\bsecrets\b/.test(EXEC) && !/\$\{\{/.test(EXEC.replace(/^\s*runs-on:.*$/m, "")), "o job executar não declara nem lê nenhum secret nem expressão do GitHub");
});

test("o primeiro ensaio OIDC não depende de nenhuma credencial Apple: nem no workflow, nem no corpo, nem no código do Worker", () => {
  assert.ok(!/ICLOUD|senha|usuario|password|PASSWORD|\bAPP_/.test(WF), "o workflow não cita secret, usuário ou senha da Apple");
  assert.match(EXEC, /--data '\{"operacao":"validar_oidc"\}'/, "corpo sintético e mínimo, fixo no workflow");
  assert.ok(!/ICLOUD|senha|usuario|password|PASSWORD/.test(WFTXT.replace(/^\s*#.*$/gm, "")), "nem fora dos comentários");
  assert.ok(!/\bsenha\b|\busuario\b|\bcredencial\b|(?<!\.)\bpassword\b/i.test(CODIGO), "o Worker não tem código que trate usuário, senha ou credencial (alvo.password é a conferência de URL do JWKS)");
  const usados = [...WF.matchAll(/\$\{\{\s*secrets\.([A-Z_]+)\s*\}\}/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(usados)].sort(), ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"], "os únicos secrets do workflow inteiro são os da Cloudflare");
});

test("os guardas de branch dos três jobs são idênticos e coincidem com a política do Worker (nada de publicar em main)", () => {
  const guardas = [...WF.matchAll(/case "\$GITHUB_REF_NAME" in\n\s+(\S+)\) ;;/g)].map((m) => m[1]);
  assert.equal(guardas.length, 3, "um guarda em cada job");
  assert.ok(guardas.every((g) => g === guardas[0]));
  assert.equal("refs/heads/" + guardas[0], POLITICA.refsPermitidos[0]);
  assert.ok(!/(?:\bmain\)|\|main\b|refs\/heads\/main|branches?:\s*\[?\s*main)/.test(WF), "main não é branch permitida em nenhum job (a chave \"main\" do Wrangler é outra coisa)");
  for (const j of [VER, PROV, EXEC]) assert.ok(j.includes('case "$GITHUB_REF_NAME"'));
});

test("nada sensível passa entre os jobs: só o pacote público e o hash vão de verificar para provisionar; executar não lê nada", () => {
  for (const x of [/upload-artifact/, /download-artifact/, /\bcache@/, /GITHUB_ENV/, /GITHUB_PATH/, /\bartifact/i, /steps\.\w+\.outputs\.(?!sha256|pacote)/])
    assert.ok(!x.test(WF), "mecanismo proibido entre jobs: " + x);
  const outputs = [...VER.matchAll(/^      (\w+): \$\{\{ steps\.empacotar\.outputs\.(\w+) \}\}\s*$/gm)].map((m) => m[1]);
  assert.deepEqual(outputs.sort(), ["pacote", "sha256"], "o job verificar só publica o pacote e o hash");
  assert.ok(!/\boutputs:/.test(PROV) && !/\boutputs:/.test(EXEC), "provisionar e executar não publicam nenhuma saída");
  assert.ok(!/GITHUB_OUTPUT/.test(PROV) && !/GITHUB_OUTPUT/.test(EXEC), "só o job verificar escreve saídas");
  const lidos = [...PROV.matchAll(/needs\.(\w+)\.outputs\.(\w+)/g)].map((m) => m[1] + "." + m[2]);
  assert.deepEqual(lidos.sort(), ["verificar.pacote", "verificar.sha256"]);
  assert.match(EXEC, /^      WORKER_URL: https:\/\/rac-icloud-auth-poc\.[a-z0-9-]+\.workers\.dev\s*$/m, "URL fixa e não sensível");
  assert.ok(!/needs\./.test(EXEC.replace(/^    needs: provisionar\s*$/m, "")), "o job executar não lê nada do job anterior");
});

test("o JWT nunca vai por argumento, arquivo, eco ou log e é mascarado; o resumo não tem credencial", () => {
  assert.ok(!/(?:^|\s)-x\b|set -x/.test(WF), "sem set -x");
  assert.ok(!/echo[^\n]*\$\{?(JWT\b|ACTIONS_ID_TOKEN)/.test(EXEC.replace(/echo "::add-mask::\$JWT"/, "")), "nada de eco do valor do token");
  assert.equal([...EXEC.matchAll(/-K <\(printf 'header = "Authorization: Bearer %s"\\n' "\$(?:ACTIONS_ID_TOKEN_REQUEST_TOKEN|JWT)"\)/g)].length, 2, "cabeçalhos de autorização por substituição de processo");
  assert.ok(EXEC.indexOf('::add-mask::$JWT') > 0 && EXEC.indexOf('::add-mask::$JWT') < EXEC.indexOf('"$WORKER_URL/auth-probe"'), "mascarar antes de enviar");
  assert.ok(!/(?:tee|>>?)\s*\S*(jwt|token)/i.test(EXEC.replace(/>> "\$GITHUB_STEP_SUMMARY"/g, "")), "nenhuma gravação do token em arquivo");
  assert.ok(!/GITHUB_STEP_SUMMARY[^\n]*JWT/.test(EXEC), "resumo sem token");
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

test("actions só oficiais e fixadas por SHA de commit; Wrangler fixado pelo lockfile", () => {
  const usos = [...WF.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1]);
  assert.equal(usos.length, 4, "checkout e setup-node nos jobs verificar e provisionar");
  for (const u of usos) assert.match(u, /^actions\/(checkout|setup-node)@[0-9a-f]{40}$/, u);
  for (const m of WFTXT.matchAll(/uses: (actions\/[\w-]+)@[0-9a-f]{40} # (v\d+\.\d+\.\d+)/g)) assert.match(m[2], /^v4\./);
  assert.ok(!/@v\d+\b/.test(WF), "nenhuma action por tag móvel");
  assert.ok(!/\bwrangler@/.test(WF), "o Wrangler não é pedido ao registro por nome: vem do lockfile");
  assert.equal([...WF.matchAll(/npm ci --prefix "\$FERR" --ignore-scripts --no-audit --no-fund/g)].length, 2, "instalação só por npm ci, sem scripts, nos dois jobs");
  assert.ok(!/\bnpm (?:i|install|exec)\b/.test(WF));
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
  assert.equal(POLITICA.jwksReaproveitarVelhoS, 0, "o ensaio nunca reaproveita chave velha: falha fechada quando o JWKS não pode ser atualizado");
  assert.ok(POLITICA.jwksRecargaMinimaS >= 60 && POLITICA.jwksTtlS <= 600);
  assert.ok(POLITICA.corpoMaxBytes <= 2048 && POLITICA.jwtMaxBytes <= 8192 && POLITICA.rsaMinimoBytes >= 256);
});

test("documentação: registra a S3, o Environment dedicado e que o primeiro ensaio OIDC não exige secrets Apple, sem escrever credencial", () => {
  const d10 = ler("docs/planejamento/10-rac-inbox.md");
  assert.match(d10, /icloud-auth-probe\.yml/);
  assert.match(d10, /icloud-auth-poc/);
  assert.match(d10, /13\.13/);
  const readme = ler("experimentos/icloud-auth-probe/README.md");
  const frase = /primeiro ensaio OIDC não exige cadastro de secrets Apple/;
  assert.match(d10, frase);
  assert.match(readme, frase);
  assert.match(WFTXT, /não usa nenhuma credencial Apple/i);
  for (const t of [WFTXT, d10, readme, ler("docs/planejamento/historico-diario.md")]) assert.ok(!/(?:cfut_|cfat_|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|Bearer [A-Za-z0-9_-]{30,})/.test(t), "parece um token escrito no texto");
});
