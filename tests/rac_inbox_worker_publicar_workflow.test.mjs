// RAC Inbox · publicação do Worker de produto pelo GitHub Actions (.github/workflows/rac-inbox-worker-publicar.yml). Teste ESTÁTICO do texto do workflow e da ferramenta fixada: prova as travas de segurança
// (só main, só workflow_dispatch, commit de 40 caracteres da história da main com CI aprovado, secrets só no job publicar e só no Environment protegido, nada de "secret put", Wrangler fixado,
// entradas só por variável de ambiente). NÃO prova o deploy real (isso é a execução do workflow, com os secrets do dono).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ler = (a) => fs.readFileSync(new URL("../" + a, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const WF = ler(".github/workflows/rac-inbox-worker-publicar.yml");
const semComent = WF.replace(/^\s*#.*$/gm, "");
const iPublicar = semComent.indexOf("\n  publicar:");
const verificar = semComent.slice(0, iPublicar), publicar = semComent.slice(iPublicar);
const LOCK = JSON.parse(ler("experimentos/rac-inbox-worker-ferramenta/package-lock.json")), PKG = JSON.parse(ler("experimentos/rac-inbox-worker-ferramenta/package.json"));

test("gatilho e permissões: só workflow_dispatch, nenhuma permissão por padrão, uma execução por vez", () => {
  assert.match(semComent, /\non:\n  workflow_dispatch:\n/); assert.ok(!/pull_request|\n  push:|schedule:|workflow_run|repository_dispatch/.test(semComent), "nenhum outro gatilho");
  assert.match(semComent, /\npermissions: \{\}\n/); assert.match(semComent, /concurrency:\n  group: rac-inbox-worker-publicar\n  cancel-in-progress: false/);
  assert.ok(!/(contents|packages|actions|id-token|pull-requests|deployments|statuses|administration): write/.test(semComent), "nenhuma permissão de escrita (nem administrativa)");
  assert.match(verificar, /permissions:\n      contents: read\n      checks: read/); assert.match(publicar, /permissions:\n      contents: read\n/);
});

test("segredos: CLOUDFLARE_* só no job publicar, que usa o Environment protegido cloudflare-production; o job verificar não tem Environment nem secrets", () => {
  assert.ok(!/secrets\./.test(verificar), "o job verificar não cita secrets"); assert.ok(!/environment:/.test(verificar));
  assert.match(publicar, /environment: cloudflare-production\n/);
  const usos = [...publicar.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]); assert.deepEqual([...new Set(usos)].sort(), ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"]);
  assert.ok(!/secrets\.(?!CLOUDFLARE_(API_TOKEN|ACCOUNT_ID)\b)/.test(semComent), "nenhum outro secret (nem a chave do canal, nem credencial iCloud, nem Supabase)");
  assert.ok(!/RAC_CANAL_K[12]\s*[:=]|secret (put|bulk|delete)|wrangler secret|--var\b|--keep-vars/.test(semComent), "não cria, troca nem apaga secret");
  assert.ok(!/actions\/(upload|download)-artifact|actions\/cache/.test(semComent), "nenhum artefato nem cache: o pacote vai por output público e conferido por hash");
  assert.ok(!/echo[^\n]*(\$CLOUDFLARE_API_TOKEN|\$\{CLOUDFLARE_API_TOKEN)/.test(semComent), "o token nunca é impresso");
  assert.match(WF, /-K <\(printf 'header = "Authorization: Bearer %s"\\n' "\$CLOUDFLARE_API_TOKEN"\)/, "o token vai por substituição de processo, não como argumento");
});

test("só a main e só código aprovado: ref da main, commit de 40 hexadecimais da história da main com o CI aprovado, nada executado com secrets", () => {
  assert.equal([...semComent.matchAll(/\$GITHUB_REF" != "refs\/heads\/main"/g)].length, 2, "os dois jobs conferem a main");
  assert.match(verificar, /\$\{#COMMIT\}" != "40"/); assert.match(verificar, /\*\[!0-9a-f\]\*/); assert.match(verificar, /git merge-base --is-ancestor "\$COMMIT" "\$GITHUB_SHA"/);
  assert.match(verificar, /select\(\.name == "testes" and \.status == "completed" and \.conclusion == "success"\)/);
  assert.match(verificar, /ref: \$\{\{ inputs\.commit \}\}\n          path: codigo/, "o commit entra como DADO numa pasta à parte");
  assert.ok(!/inputs\.commit/.test(publicar), "o job com secrets nem lê a entrada: recebe só o commit já conferido do job verificar");
  assert.ok(!/path: codigo|ref: \$\{\{ inputs/.test(publicar), "o job com secrets não baixa o commit do Worker");
  assert.ok(!/node --test|node codigo|npm (run|test)|bash codigo|\.\/codigo/.test(publicar), "nada do commit roda no job com secrets");
  /* nenhuma entrada colada no script: só por env */
  for (const run of semComent.split(/\n\s+run: \|\n/).slice(1)) { const corpo = run.split(/\n\s{6}- /)[0]; assert.ok(!/\$\{\{\s*(inputs|github\.event)/.test(corpo), "entrada dentro de run: " + corpo.slice(0, 60)); }
  assert.match(verificar, /GH_TOKEN: \$\{\{ github\.token \}\}/); assert.ok(!/GH_TOKEN|github\.token/.test(publicar));
});

test("pacote conferido ANTES de receber credencial: lista fechada de arquivos, configuração fixa (nome, NONCES, NonceUnico, migração v1), testes, Wrangler fixado e inspeção do pacote", () => {
  for (const f of ["README.md", "src/canal.mjs", "src/imap.mjs", "src/index.mjs", "src/mime.mjs", "src/politica.mjs", "src/replay.mjs", "src/rotas.mjs", "src/saida.mjs", "src/smtp.mjs", "wrangler.jsonc"]) assert.ok(verificar.includes(f), f + " na lista fechada");
  const reais = fs.readdirSync(new URL("../experimentos/rac-inbox-worker/src/", import.meta.url)).map((f) => "src/" + f).concat(["README.md", "wrangler.jsonc"]).sort();
  const lista = /ESPERADA=\$\(printf '%s\\n' ([^)]*?) \| LC_ALL=C sort\)/.exec(verificar)[1].split(" ").sort(); assert.deepEqual(lista, reais, "a lista do workflow é exatamente a pasta do Worker");
  assert.match(verificar, /"name": "rac-inbox-worker"/); assert.match(verificar, /"bindings": \[\{ "name": "NONCES", "class_name": "NonceUnico" \}\]/); assert.match(verificar, /"migrations": \[\{ "tag": "v1", "new_sqlite_classes": \["NonceUnico"\] \}\]/);
  const cfgCommit = JSON.parse(ler("experimentos/rac-inbox-worker/wrangler.jsonc").replace(/^\s*"\$schema".*\n/m, "")); assert.equal(cfgCommit.name, "rac-inbox-worker"); assert.deepEqual(cfgCommit.durable_objects.bindings, [{ name: "NONCES", class_name: "NonceUnico" }]);
  assert.match(verificar, /node --test tests\/rac_inbox_worker\.test\.mjs tests\/rac_inbox_worker_smtp\.test\.mjs/);
  for (const t of ["rac_inbox_worker.test.mjs", "rac_inbox_worker_servidor.mjs", "rac_inbox_worker_smtp.test.mjs"]) assert.ok(verificar.includes("/tests/" + t), t + " no checkout do commit");
  assert.match(verificar, /wrangler\.js" deploy --dry-run --outdir/); assert.match(verificar, /cloudflare:sockets/); assert.match(verificar, /imap\.mail\.me\.com\\nsmtp\.mail\.me\.com/); assert.match(verificar, /\^var NonceUnico = class/);
  assert.match(verificar, /VERSAO_ESPERADA\^rac-inbox-worker@p\[0-9\]|\^rac-inbox-worker@p\[0-9\]\{1,3\}\\\.\[0-9\]\{1,3\}\$/); assert.match(verificar, /gzip -9n/);
  /* o publicar recebe o pacote por hash, reescreve a configuração aqui e publica com no_bundle */
  assert.match(publicar, /sha256sum -c -/); assert.match(publicar, /no_bundle: true/); assert.match(publicar, /wrangler\.js" deploy --config/); assert.ok(!/--dry-run/.test(publicar));
});

test("Wrangler fixado e idêntico nos dois jobs: versão 4.161.0, integridade conferida, npm ci sem scripts; a ferramenta tem lockfile próprio", () => {
  assert.equal(PKG.dependencies.wrangler, "4.161.0"); const integ = LOCK.packages["node_modules/wrangler"].integrity; assert.equal(LOCK.packages["node_modules/wrangler"].version, "4.161.0"); assert.match(integ, /^sha512-/);
  assert.equal([...WF.matchAll(new RegExp(integ.replace(/[+/]/g, "\\$&"), "g"))].length, 2, "a integridade do lockfile é conferida nos dois jobs"); assert.equal([...semComent.matchAll(/"4\.161\.0"/g)].length, 2);
  assert.equal([...semComent.matchAll(/npm ci --prefix "\$FERR" --ignore-scripts --no-audit --no-fund/g)].length, 2); assert.match(semComent, /NPM_CONFIG_IGNORE_SCRIPTS: "true"/); assert.match(semComent, /WRANGLER_SEND_METRICS: "false"/);
  assert.equal(LOCK.name, "rac-inbox-worker-ferramenta"); assert.equal(PKG.name, "rac-inbox-worker-ferramenta"); assert.equal(LOCK.packages[""].dependencies.wrangler, "4.161.0");
  for (const a of [...semComent.matchAll(/uses: ([^\s]+)/g)].map((m) => m[1])) assert.match(a, /^actions\/(checkout|setup-node)@[0-9a-f]{40}$/, "action fixada por SHA: " + a);
});

test("confirmação e saúde: deployment ID, version ID, secret K1 preservado (só o nome), saúde SEM assinatura, sem credencial iCloud e sem e-mail; resumo no Actions", () => {
  assert.match(publicar, /workers\/scripts\/\$NOME_WORKER\/deployments/); assert.match(publicar, /\*,RAC_CANAL_K1,\*/); assert.match(publicar, /não está mais no Worker depois da publicação/);
  assert.match(publicar, /X POST -H 'Content-Type: application\/json' --data '\{"operacao":"ping"\}'/); assert.match(publicar, /cabecalhos_invalidos/); const dados = publicar.split("\n").filter((l) => /--data|X-RAC|curl .*-X POST/.test(l)).join("\n"); assert.ok(!/X-RAC|usuario|senha|enviar|smtp_prova|ICLOUD/i.test(dados), "o pedido de saúde não assina, não leva credencial e não envia"); assert.equal([...publicar.matchAll(/--data /g)].length, 1, "uma única chamada com corpo");
  assert.match(publicar, /GITHUB_STEP_SUMMARY/); assert.match(publicar, /deployment ID:\*\*/); assert.match(publicar, /deployment anterior \(para rollback\)/);
  const worker = ler("experimentos/rac-inbox-worker/src/rotas.mjs"); assert.match(worker, /ERROS_CANAL|cabecalhos_invalidos/); assert.match(ler("experimentos/rac-inbox-worker/src/canal.mjs"), /cabecalhos_invalidos: 401/, "o Worker de fato responde 401 cabecalhos_invalidos a um pedido sem assinatura");
});

test("documentação: o guia explica secrets, Environment, execução pelo iPhone, conferência e rollback", () => {
  const g = ler("docs/inbox-worker-deploy.md");
  for (const t of [/CLOUDFLARE_API_TOKEN/, /CLOUDFLARE_ACCOUNT_ID/, /cloudflare-production/, /iPhone/, /Rollback|rollback/, /deployment ID/i, /RAC_CANAL_K1/, /Workers Scripts/, /Deployment branches|Selected branches/i, /Required reviewers/i]) assert.match(g, t);
});
