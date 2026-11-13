// RAC Inbox · I0: escopo da publicação manual da POC iCloud (.github/workflows/icloud-probe-deploy.yml).
// Só lê o texto do workflow, do wrangler.jsonc e dos documentos: sem rede, sem Cloudflare, sem credencial.
// Garante o que o dono autorizou: só manual, secrets só do ambiente, Wrangler fixo, sem login/remoção/Cron/binding, sem vazar o token.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const raiz = new URL("../", import.meta.url);
const ler = (a) => fs.readFileSync(new URL(a, raiz), "utf8");
const WFTXT = ler(".github/workflows/icloud-probe-deploy.yml");
/* sem comentários (linha inteira ou " # ..."): os testes olham só o que o GitHub executa */
const WF = WFTXT.replace(/^\s*#.*$/gm, "").replace(/\s+#\s.*$/gm, "");
/* a POC (experimentos/icloud-probe) vive na PR #17; na PR separada só do workflow ela ainda não existe na main: os testes que dependem dela são ignorados lá */
const temPoc = fs.existsSync(new URL("experimentos/icloud-probe/README.md", raiz));
const README = temPoc ? ler("experimentos/icloud-probe/README.md") : "";
const VERSAO = "4.161.0";

test("só dispara na mão (workflow_dispatch), nunca por push, PR, agenda ou outro workflow", () => {
  assert.match(WF, /^on:\s*\n\s+workflow_dispatch:/m);
  for (const x of [/\bpush:/, /\bpull_request/, /\bschedule:/, /\bcron:/, /\bworkflow_run:/, /\bworkflow_call:/, /\brepository_dispatch:/])
    assert.ok(!x.test(WF), "gatilho automático não permitido: " + x);
});

test("permissão mínima (só leitura) e ambiente cloudflare-poc para guardar os secrets", () => {
  assert.match(WF, /^permissions:\s*\n\s+contents: read\s*$/m);
  assert.ok(!/:\s*write\b/.test(WF) && !/id-token/.test(WF), "nenhuma permissão de escrita");
  assert.match(WF, /^\s+environment: cloudflare-poc\s*$/m);
  assert.match(WF, /^\s+persist-credentials: false\s*$/m, "o checkout não deixa credencial do GitHub no disco");
});

test("só actions oficiais do GitHub com versão (nada de terceiros que receberiam os secrets)", () => {
  const usos = [...WF.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1]);
  assert.ok(usos.length >= 2, "achou o checkout e o setup-node");
  for (const u of usos) assert.match(u, /^actions\/(checkout|setup-node)@v\d+$/, "action não prevista: " + u);
});

test("credenciais Cloudflare só vêm de secrets do ambiente: nunca escritas, nem em vars, nem no nível do job", () => {
  const atribuicoes = [...WF.matchAll(/^(\s*)(CLOUDFLARE_(?:API_TOKEN|ACCOUNT_ID)):\s*(.+?)\s*$/gm)];
  assert.ok(atribuicoes.length >= 6, "token e conta nos três passos que usam o Cloudflare");
  for (const [, , nome, valor] of atribuicoes) assert.equal(valor, "${{ secrets." + nome + " }}", nome + " tem de vir de secrets." + nome);
  assert.ok(!/\bvars\./.test(WF), "nada de variáveis (vars) para credenciais");
  /* os passos que rodam código do repositório (testes) ficam sem secret: o job inteiro não tem env com secrets */
  const envJob = /^    env:\s*\n((?:      .+\n)+)/m.exec(WF)[1];
  assert.ok(!/secrets\./.test(envJob), "secrets só nos passos que precisam");
  assert.ok(!/(?:^|\s)-x\b|set -x/.test(WF), "sem set -x: o bash não pode imprimir os comandos com valores");
});

test("PROBE_TOKEN: aleatório no próprio run, mascarado antes de usar e nunca impresso nem guardado", () => {
  assert.match(WF, /PROBE_TOKEN=\$\(openssl rand -hex 32\)/, "64 caracteres hexadecimais (mínimo exigido pelo Worker: 32)");
  const linhas = WF.split("\n").filter((l) => l.includes("PROBE_TOKEN"));
  const permitidas = [/PROBE_TOKEN=\$\(openssl rand -hex 32\)/, /::add-mask::\$PROBE_TOKEN/, /printf '%s' "\$PROBE_TOKEN" \| npx --yes wrangler@4\.161\.0 secret put PROBE_TOKEN/,
    /Authorization: Bearer \$PROBE_TOKEN/, /^\s*- name: /];
  for (const l of linhas) assert.ok(permitidas.some((p) => p.test(l)), "uso não previsto do PROBE_TOKEN: " + l.trim());
  assert.ok(WF.indexOf("::add-mask::$PROBE_TOKEN") < WF.indexOf("secret put PROBE_TOKEN"), "mascarar antes de enviar ao Wrangler");
  assert.ok(!/PROBE_TOKEN.*(?:>>|GITHUB_OUTPUT|GITHUB_ENV|GITHUB_STEP_SUMMARY)/.test(WF), "o token não vai para saída, ambiente nem resumo");
  assert.ok(!/(?:secrets|vars)\.PROBE_TOKEN/.test(WF), "o token não é secret do GitHub: nasce e morre no run");
});

test("Wrangler sempre em 4.161.0 (igual ao README) e só com deploy e secret put: sem login, remoção nem troca de plano", () => {
  const usos = [...WF.matchAll(/\bwrangler(@[\w.-]+)?(?:\s+(\S+))?(?:\s+(\S+))?/g)];
  assert.ok(usos.length >= 2);
  for (const [, v] of usos) assert.equal(v, "@" + VERSAO, "versão do Wrangler tem de ser fixa");
  const comandos = new Set(usos.map((m) => m[2] + (m[2] === "secret" ? " " + m[3] : "")));
  assert.deepEqual([...comandos].sort(), ["deploy", "secret put"]);
  if (temPoc) assert.ok(README.includes("wrangler@" + VERSAO) && !/wrangler@(?!4\.161\.0)\d/.test(README), "README e workflow usam a mesma versão");
  assert.ok(!/\bnpm (?:i|install)\b/.test(WF), "nada de instalar dependências");
});

test("ordem segura: branch, testes, conferência do token, deploy, secret e só então o /probe", () => {
  const ordem = ["Só nas branches previstas", "node --test tests/icloud_probe.test.mjs tests/icloud_probe_deploy.test.mjs", "tokens/verify",
    "wrangler@4.161.0 deploy", "secret put PROBE_TOKEN", '"$WORKER_URL/probe"'].map((t) => WF.indexOf(t));
  assert.ok(ordem.every((i) => i > 0), "todos os passos presentes");
  assert.deepEqual([...ordem].sort((a, b) => a - b), ordem, "passos fora de ordem");
  assert.match(WF, /main\|poc\/icloud-cloudflare-connectivity\) ;;/, "só a main e a branch da POC");
  assert.match(WF, /\*\) echo "::error::Branch não permitida[^\n]*exit 1/);
});

test("o /probe é POST na URL informada pelo Wrangler (workers.dev da POC), com limite de tempo e repetição só por propagação", () => {
  assert.match(WF, /grep -oE 'https:\/\/rac-icloud-connectivity-poc\\\.\[a-z0-9-\]\+\\\.workers\\\.dev'/);
  assert.match(WF, /curl -sS -m 40 [^\n]*-X POST "\$WORKER_URL\/probe"/);
  /* falha por CPU do plano Free: registra e para, sem repetir (só 000, 404 e 503 de secret ainda ausente repetem) */
  assert.match(WF, /\[ "\$CODE" = "000" \] \|\| \[ "\$CODE" = "404" \] \|\| \{ \[ "\$CODE" = "503" \] && grep -q probe_secret_not_configured/);
  assert.match(WF, /1102\|resource limits\|cpu/i);
  assert.match(WF, /não contratar o Workers Paid/);
});

test("wrangler.jsonc da POC: só o Worker temporário no workers.dev, sem Cron, binding, rota, domínio ou conta escrita no código", { skip: !temPoc && "POC ainda não está nesta branch" }, () => {
  const cfg = JSON.parse(ler("experimentos/icloud-probe/wrangler.jsonc").replace(/^\s*\/\/.*$/gm, ""));
  assert.deepEqual(Object.keys(cfg).sort(), ["$schema", "compatibility_date", "main", "name", "workers_dev"]);
  assert.equal(cfg.name, "rac-icloud-connectivity-poc");
  assert.equal(cfg.main, "src/index.mjs");
  assert.equal(cfg.workers_dev, true);
});

test("o guia operacional existe, descreve o ambiente cloudflare-poc e nenhum texto escreve credencial", () => {
  const guia = ler("docs/icloud-poc-deploy.md");
  assert.match(guia, /icloud-probe-deploy\.yml/);
  assert.match(guia, /cloudflare-poc/);
  assert.match(guia, /Workers Scripts/);
  for (const x of [WFTXT, guia, ler("docs/planejamento/historico-diario.md"), README])
    assert.ok(!/(?:cfut_|cfat_|Bearer [A-Za-z0-9_-]{30,})/.test(x), "parece um token escrito no texto");
});
