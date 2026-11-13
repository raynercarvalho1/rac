// RAC Inbox · POC autenticada iCloud (S3): ISOLAMENTO das credenciais Cloudflare em relação ao código controlado pela branch.
// Sem rede e sem credencial: trava por texto o desenho da auditoria de segurança de 13/11/2026.
// Ideia: o job que tem o Environment e os secrets da Cloudflare NÃO executa nada que venha da branch (nem testes, nem config do Wrangler,
// nem .env, nem script); quem executa código da branch é um job sem secrets, que empacota e inspeciona o Worker. O Wrangler vem de um
// lockfile com integridade, instalado sem scripts. Estes testes protegem isso contra regressões acidentais; a fronteira contra quem
// controla a branch continua sendo a configuração manual do GitHub (Environments com aprovador e branches restritas).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const raiz = new URL("../", import.meta.url);
const ler = (a) => fs.readFileSync(new URL(a, raiz), "utf8");
const existe = (a) => fs.existsSync(new URL(a, raiz));
const semComentarios = (t) => t.replace(/^\s*#.*$/gm, "").replace(/\s+#\s.*$/gm, "");
const WFTXT = ler(".github/workflows/icloud-auth-probe.yml");
const WF = semComentarios(WFTXT);

function jobs() {
  const inicios = [...WF.matchAll(/^  (verificar|provisionar|executar):\s*$/gm)].map((m) => ({ nome: m[1], i: m.index }));
  const out = {};
  inicios.forEach((x, k) => { out[x.nome] = WF.slice(x.i, k + 1 < inicios.length ? inicios[k + 1].i : WF.length); });
  return out;
}
function passos(job) {
  const marcas = [...job.matchAll(/^      - /gm)].map((m) => m.index);
  return marcas.map((i, k) => job.slice(i, k + 1 < marcas.length ? marcas[k + 1] : job.length));
}
const J = jobs();
const PV = passos(J.verificar), PP = passos(J.provisionar);
const nome = (p) => (/- name: (.+)/.exec(p) || [, ""])[1].trim();
const comSecret = (p) => /\$\{\{\s*secrets\./.test(p);

test("secrets só existem em dois passos do job provisionar e nunca no nível do job, do workflow ou nos outros jobs", () => {
  assert.ok(!/\bsecrets\./.test(J.verificar) && !/\bsecrets\./.test(J.executar), "verificar e executar não têm secrets");
  const doJob = J.provisionar.split(/^    steps:/m)[0];
  assert.ok(!/secrets\./.test(doJob), "nenhum secret no cabeçalho do job (env do job é herdado por todos os passos)");
  const topo = WF.split(/^jobs:/m)[0];
  assert.ok(!/secrets\./.test(topo), "nenhum secret no nível do workflow");
  const com = PP.filter(comSecret);
  assert.equal(com.length, 2, "exatamente dois passos recebem secrets");
  assert.deepEqual(com.map(nome), ["Conferir o token Cloudflare (sem mostrar dados da conta)", "Publicar o pacote aprovado (Workers Free)"]);
  for (const p of com) {
    const env = /\n        env:\n((?:          .+\n)+)/.exec(p);
    assert.ok(env, "secrets entram por env do passo");
    assert.deepEqual([...env[1].matchAll(/^          (\w+): /gm)].map((m) => m[1]).sort(), ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"]);
  }
  assert.ok(nome(PP.at(-1)).startsWith("Publicar"), "a publicação é o último passo do job: nada roda depois dela");
  assert.ok(comSecret(PP.at(-1)) && comSecret(PP.at(-2)), "os dois passos com secrets são os dois últimos");
});

test("o job com secrets não executa código da branch: sem testes, scripts, config do Wrangler, npx ou arquivos do Worker", () => {
  assert.ok(!/node --test|\btests\//.test(J.provisionar), "nenhum teste do repositório no job com secrets");
  assert.ok(!/\bnpx\b|\bnpm (?:run|exec|start|test|i|install)\b/.test(J.provisionar), "nenhum npx nem script npm");
  assert.ok(!/experimentos\/icloud-auth-probe(?!-ferramenta)/.test(J.provisionar), "o diretório do Worker da branch nem é citado (só os dados da ferramenta)");
  assert.ok(!/(?:^|\s)(?:bash|sh|source|\.)\s+\S+\.(?:sh|bash)\b|\.\/[\w.-]+\.sh/.test(J.provisionar), "nenhum script do repositório");
  for (const linha of J.provisionar.split("\n").filter((l) => /\bnode\b/.test(l) && !/node-version|^\s*-?\s*uses:/.test(l)))
    assert.match(linha, /wrangler\/bin\/wrangler\.js/, "o único uso de node é o Wrangler do lockfile: " + linha.trim());
  assert.match(J.provisionar, /sparse-checkout: \|\n\s+\/experimentos\/icloud-auth-probe-ferramenta\/\n\s+sparse-checkout-cone-mode: false/, "só os dados da ferramenta são baixados do repositório");
  assert.match(J.provisionar, /persist-credentials: false/);
  assert.match(J.provisionar, /NPM_CONFIG_IGNORE_SCRIPTS: "true"/);
});

test("os dois passos com secrets só usam ferramentas fixas: curl e jq no primeiro; o Wrangler do lockfile, num diretório limpo, no segundo", () => {
  const [token, publicar] = PP.filter(comSecret);
  assert.ok(/\bcurl\b/.test(token) && !/\bnode\b|\bnpm\b|wrangler/.test(token), "a conferência do token só usa curl e jq");
  assert.ok(!/Authorization: Bearer \$CLOUDFLARE_API_TOKEN/.test(token.replace(/-K <\(printf 'header = "Authorization: Bearer %s"\\n' "\$CLOUDFLARE_API_TOKEN"\)/g, "")), "o token não vai como argumento visível na lista de processos");
  assert.match(token, /-K <\(printf 'header = "Authorization: Bearer %s"\\n' "\$CLOUDFLARE_API_TOKEN"\)/);
  assert.match(publicar, /cd "\$RUNNER_TEMP\/publicar"/, "diretório de trabalho limpo, fora do repositório");
  assert.match(publicar, /--config "\$RUNNER_TEMP\/publicar\/wrangler\.publicar\.jsonc"/);
  assert.ok(!/--dry-run/.test(publicar), "a publicação real não é dry-run");
  assert.ok(!/(?:^|\s)>\s*\S|\btee\b|\|\s*tee/.test(publicar.replace(/>\s*\/dev\/null/g, "")), "a saída do Wrangler não é gravada em arquivo");
  assert.ok(!/echo[^\n]*\$CLOUDFLARE|printf[^\n]*\$CLOUDFLARE_ACCOUNT_ID/.test(publicar + token.replace(/printf 'header[^\n]*\n/g, "")), "nenhum eco de credencial");
  assert.ok(!/(?:^|\s)-x\b|set -x/.test(WF), "sem set -x");
});

test("o job verificar roda o código da branch sem secrets e sem Environment, e empacota ANTES de rodar os testes", () => {
  assert.ok(!/\benvironment:/.test(J.verificar), "sem Environment");
  assert.match(J.verificar, /^    permissions:\n      contents: read\s*$/m);
  const ordem = ["Só nas branches previstas", "Montar o pacote a partir de uma lista fixa de arquivos", "Instalar o Wrangler pelo lockfile (sem scripts, integridade conferida)",
    "Empacotar sem publicar e inspecionar o resultado", "Testes do Worker autenticado e do escopo"].map((n) => PV.findIndex((p) => nome(p) === n));
  assert.ok(ordem.every((i) => i >= 0), "passos presentes");
  assert.deepEqual([...ordem].sort((a, b) => a - b), ordem, "o código dos testes (da branch) só roda depois de o pacote estar fechado e com o hash calculado");
  assert.match(J.verificar, /node --test tests\/icloud_auth_probe\.test\.mjs tests\/icloud_auth_probe_escopo\.test\.mjs tests\/icloud_auth_probe_isolamento\.test\.mjs/);
});

test("integridade do pacote: lista fixa de arquivos, config escrita no workflow, dry-run, inspeção, sha256 e publicação do mesmo arquivo (no_bundle)", () => {
  const esperado = ["./README.md", "./src/index.mjs", "./src/jwks.mjs", "./src/jwt.mjs", "./src/politica.mjs", "./wrangler.jsonc"];
  assert.match(J.verificar, /ESPERADO=\$'\.\/README\.md\\n\.\/src\/index\.mjs\\n\.\/src\/jwks\.mjs\\n\.\/src\/jwt\.mjs\\n\.\/src\/politica\.mjs\\n\.\/wrangler\.jsonc'/);
  const real = [];
  (function varrer(dir, pref) { for (const e of fs.readdirSync(new URL(dir, raiz), { withFileTypes: true })) e.isDirectory() ? varrer(dir + e.name + "/", pref + e.name + "/") : real.push("./" + pref + e.name); })("experimentos/icloud-auth-probe/", "");
  assert.deepEqual(real.sort(), esperado, "o diretório do Worker tem só a lista fixa (nada de .env, .dev.vars, package.json, wrangler.toml, .wrangler)");
  assert.ok(!real.some((f) => /(^|\/)\./.test(f.slice(2))), "nenhum arquivo oculto");
  assert.match(J.verificar, /for ARQ in politica jwt jwks index; do cp "\$BASE\/src\/\$ARQ\.mjs"/);
  // a config única usada para empacotar está escrita no workflow e é equivalente à wrangler.jsonc do repositório
  const heredoc = (j) => JSON.parse(new RegExp("<<'JSON'\\n([\\s\\S]*?)\\n\\s*JSON\\n").exec(j)[1].replace(/^\s{10}/gm, ""));
  const cfgWf = heredoc(J.verificar);
  const cfgRepo = JSON.parse(ler("experimentos/icloud-auth-probe/wrangler.jsonc"));
  delete cfgRepo.$schema;
  assert.deepEqual(cfgWf, cfgRepo);
  assert.deepEqual(Object.keys(cfgWf).sort(), ["compatibility_date", "main", "name", "observability", "workers_dev"], "nenhuma chave executável ou de armazenamento (build, rules, vars, kv, durable_objects, triggers)");
  const base = heredoc(J.provisionar);
  assert.deepEqual(base, { name: cfgWf.name, compatibility_date: cfgWf.compatibility_date, workers_dev: cfgWf.workers_dev, observability: cfgWf.observability });
  assert.match(J.provisionar, /jq --arg main "\$DEST\/index\.js" '\. \+ \{main: \$main, no_bundle: true\}'/);
  // inspeção e hash
  const emp = PV.find((p) => nome(p).startsWith("Empacotar"));
  assert.match(emp, /deploy --dry-run --outdir/);
  for (const padrao of [String.raw`process\.env`, String.raw`eval\(`, "new Function", "cloudflare:", String.raw`imap\.mail\.me\.com`, String.raw`smtp\.mail\.me\.com`, String.raw`import\(`, String.raw`require\(`, String.raw`console\.`]) assert.ok(emp.includes("'" + padrao + "'"), "inspeção: " + padrao);
  assert.match(emp, /HOSTS=\$\(grep -oE 'https\?:\/\/\[A-Za-z0-9\.-\]\+' "\$BUNDLE" \| sort -u\)/);
  assert.match(emp, /"\$HOSTS" != "https:\/\/token\.actions\.githubusercontent\.com"/);
  assert.match(emp, /sha256sum "\$BUNDLE"/);
  assert.match(emp, /GITHUB_STEP_SUMMARY/);
  const rec = PP.find((p) => nome(p).startsWith("Reconstituir"));
  assert.match(rec, /sha256sum -c -/);
  assert.match(rec, /PACOTE_B64: \$\{\{ needs\.verificar\.outputs\.pacote \}\}/);
  assert.match(rec, /SHA256_ESPERADO: \$\{\{ needs\.verificar\.outputs\.sha256 \}\}/);
  assert.ok(!/\$\{\{[^}]*needs[^}]*\}\}/.test(rec.replace(/^\s+(?:PACOTE_B64|SHA256_ESPERADO): \$\{\{ needs\.verificar\.outputs\.\w+ \}\}$/gm, "")), "as saídas do job anterior entram só por env, nunca coladas no script (sem injeção de comando)");
});

test("Wrangler: versão e integridade fixas no lockfile; instalação sem scripts; nada de .npmrc que altere o registro", () => {
  const dir = "experimentos/icloud-auth-probe-ferramenta/";
  const pkg = JSON.parse(ler(dir + "package.json"));
  const lock = JSON.parse(ler(dir + "package-lock.json"));
  assert.equal(pkg.private, true);
  assert.deepEqual(pkg.dependencies, { wrangler: "4.161.0" }, "versão exata, sem faixa");
  assert.ok(!pkg.scripts && !pkg.devDependencies && !pkg.optionalDependencies && !pkg.overrides, "sem scripts nem outras dependências");
  assert.equal(lock.lockfileVersion >= 3, true);
  const integr = lock.packages["node_modules/wrangler"].integrity;
  assert.equal(lock.packages["node_modules/wrangler"].version, "4.161.0");
  assert.match(integr, /^sha512-[A-Za-z0-9+/=]{80,}$/);
  for (const j of ["verificar", "provisionar"]) assert.ok(J[j].includes('"' + integr + '"'), "o workflow confere a integridade esperada no job " + j);
  const sem = Object.entries(lock.packages).filter(([k, v]) => k !== "" && (!v.integrity || !/^https:\/\/registry\.npmjs\.org\//.test(v.resolved || ""))).map(([k]) => k);
  assert.deepEqual(sem, [], "todo pacote do lock tem integridade e vem do registro oficial (nada de git, http ou arquivo local)");
  assert.ok(Object.keys(lock.packages).length > 30);
  for (const alvo of ["", "experimentos/", "experimentos/icloud-auth-probe/", dir]) assert.ok(!existe(alvo + ".npmrc"), "sem .npmrc em " + (alvo || "raiz"));
  assert.deepEqual(fs.readdirSync(new URL(dir, raiz)).sort(), ["README.md", "package-lock.json", "package.json"], "a pasta da ferramenta tem só os arquivos esperados");
});

test("actions fixadas por SHA e checkout sem credencial Git persistida em todos os jobs que fazem checkout", () => {
  const checkouts = [...WF.matchAll(/uses: actions\/checkout@([0-9a-f]{40})\n\s+with:\n((?:\s{10}.+\n)+)/g)];
  assert.equal(checkouts.length, 2);
  for (const c of checkouts) assert.match(c[2], /persist-credentials: false/);
  assert.equal([...WFTXT.matchAll(/actions\/(?:checkout|setup-node)@[0-9a-f]{40} # v4\.4\.0/g)].length, 4, "tag legível ao lado de cada SHA");
  assert.ok(!/\buses:\s*\S+@(?![0-9a-f]{40}\b)/.test(WF), "nenhuma action por tag móvel ou branch");
  assert.ok(!/^\s+uses: (?!actions\/)/m.test(WF), "nenhuma action de terceiros");
  assert.ok(!/checkout/.test(J.executar) && !/uses:/.test(J.executar), "o job do token OIDC não usa actions nem checkout");
});

test("o código do Worker não tem execução dinâmica nem acesso a rede além do JWKS, e as importações são só relativas", () => {
  const srcs = ["politica", "jwt", "jwks", "index"].map((n) => [n, semComentarios(ler("experimentos/icloud-auth-probe/src/" + n + ".mjs").replace(/^\s*\/\/.*$/gm, ""))]);
  for (const [n, t] of srcs) {
    for (const x of [/\beval\s*\(/, /new Function/, /\bimport\s*\(/, /\brequire\s*\(/, /process\.env/, /\bconsole\b/, /cloudflare:/, /\bWebSocket\b/, /XMLHttpRequest/]) assert.ok(!x.test(t), n + ": " + x);
    for (const m of t.matchAll(/^import .* from "([^"]+)"/gm)) assert.match(m[1], /^\.\/[a-z]+\.mjs$/, n + ": só importações relativas");
  }
  const usosFetch = srcs.filter(([, t]) => /\bfetch\(/.test(t)).map(([n]) => n);
  assert.deepEqual(usosFetch, ["index"], "a única chamada de rede é o fetch do JWKS, injetado no provedor de chaves");
});

test("o job executar continua isolado: sem actions, sem checkout, sem Wrangler, sem secrets, sem credencial Cloudflare e com a única permissão id-token", () => {
  assert.match(J.executar, /^    permissions:\n      id-token: write\n    env:/m);
  assert.ok(!/uses:|checkout|wrangler|\bnpm\b|\bnpx\b|secrets\.|CLOUDFLARE_|ICLOUD_/i.test(J.executar.replace(/poc\/icloud-cloudflare-connectivity/g, "").replace(/icloud-auth-poc/g, "")));
  assert.equal([...WF.matchAll(/id-token:\s*write/g)].length, 1);
});

test("documentação da auditoria: Documento 10 registra o vetor, o desenho de três jobs e o que depende de configuração manual", () => {
  const d10 = ler("docs/planejamento/10-rac-inbox.md");
  for (const trecho of [/13\.14/, /build\.command/, /três jobs/i, /lockfile/i, /sha256/i, /configuração manual/i, /Deployment branches/i]) assert.match(d10, trecho);
  assert.ok(!/(?:cfut_|cfat_|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|Bearer [A-Za-z0-9_-]{30,})/.test(d10 + WFTXT));
});
