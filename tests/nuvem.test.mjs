// Preparação da nuvem do Claude Code (scripts/nuvem_preparar.sh e scripts/nuvem_testes.sh, docs/nuvem.md).
// Os scripts leem as versões e o Grupo 2 do próprio .github/workflows/testes.yml (uma fonte só), não gravam no repositório
// e não mexem no Node do sistema. Aqui só se lê o texto e se usa o modo de consulta dos scripts: nada é instalado.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const raiz = new URL("../", import.meta.url);
const ler = (a) => fs.readFileSync(new URL(a, raiz), "utf8");
const WF = ler(".github/workflows/testes.yml"), PREP = ler("scripts/nuvem_preparar.sh"), TES = ler("scripts/nuvem_testes.sh"), DOC = ler("docs/nuvem.md");
/* no computador com Windows pode não haver bash: aí só os testes de texto rodam */
const temBash = spawnSync("bash", ["-c", "exit 0"]).status === 0;
const semBash = temBash ? false : "bash não encontrado";
const bash = (...a) => spawnSync("bash", a, { cwd: fileURLToPath(raiz), encoding: "utf8" });

test("os dois scripts têm sintaxe de bash válida", { skip: semBash }, () => {
  for (const s of ["scripts/nuvem_preparar.sh", "scripts/nuvem_testes.sh"]) { const r = bash("-n", s); assert.equal(r.status, 0, s + ": " + r.stderr); }
});

test("as versões vêm do testes.yml (Node, Playwright e PGlite iguais às do CI)", { skip: semBash }, () => {
  const pw = /playwright@(\d+\.\d+\.\d+)/.exec(WF)[1], pgl = /@electric-sql\/pglite@(\d+\.\d+\.\d+)/.exec(WF)[1], nd = /node-version: "(\d+)"/.exec(WF)[1];
  assert.equal(bash("scripts/nuvem_preparar.sh", "--versoes").stdout.trim(), `node=${nd} playwright=${pw} pglite=${pgl}`);
  assert.ok(!/\d+\.\d+\.\d+/.test(PREP.replace(/^#.*$/gm, "")), "nenhuma versão escrita à mão no script: só as do testes.yml");
});

test("o Grupo 2 do script é o mesmo do CI (e o Grupo 1 é todo o resto)", { skip: semBash }, () => {
  const g2ci = /node --test --test-reporter=spec ((?:tests\/[\w]+\.test\.mjs ?)+)/.exec(WF)[1].trim().split(/\s+/);
  assert.deepEqual(bash("scripts/nuvem_testes.sh", "--grupo2").stdout.trim().split(/\s+/), g2ci);
  assert.match(TES, /grep -v -E "tests\/\(\$G2_NOMES\)\\\.test\\\.mjs"/, "Grupo 1 = tudo menos o Grupo 2, como no CI");
  assert.match(TES, /export CI=true/); assert.match(TES, /\[ "\$TESTES" -lt 20 \]/, "a regra do CI: nenhum teste de banco ignorado e pelo menos 20");
});

test("os scripts não gravam no repositório, não publicam nada e não tocam em segredo nem no Node do sistema", () => {
  for (const [nome, s] of [["nuvem_preparar.sh", PREP], ["nuvem_testes.sh", TES]]) {
    const c = s.replace(/^\s*#.*$/gm, "");
    assert.ok(!/\bgit (push|commit|reset|clean|checkout)\b|\bsudo\b|\bcurl\b|\bwget\b|\bpsql\b|\bsupabase\b|rm -rf|apt(-get)? install|playwright install|SECRET|TOKEN|sb_secret/i.test(c), nome + " faz algo fora do escopo");
    assert.ok(!/"\$RAIZ\/node_modules"|\/usr\/local\/bin\/node|\/opt\/node22/.test(c), nome + " não pode gravar node_modules no repositório nem trocar o Node do sistema");
  }
  assert.match(PREP, /LINK="\$\(dirname "\$RAIZ"\)\/node_modules"/, "o link dos pacotes fica na pasta acima do repositório (fora do Git)");
  assert.match(PREP, /--save-exact "node@\$NODE_MAJ" "playwright@\$PW" "@electric-sql\/pglite@\$PGL"/);
  assert.match(PREP, /NODE_USE_ENV_PROXY=1/); assert.match(PREP, /PYTHONDONTWRITEBYTECODE=1/);
});

test("docs/nuvem.md explica o uso, o script do ambiente e o estado da proteção da main", () => {
  assert.match(DOC, /bash scripts\/nuvem_testes\.sh/); assert.match(DOC, /bash scripts\/nuvem_preparar\.sh/);
  assert.match(DOC, /if \[ -f rac\/scripts\/nuvem_preparar\.sh \]; then bash rac\/scripts\/nuvem_preparar\.sh/, "o script gravado no ambiente RAC");
  assert.match(DOC, /github-actions\[bot\]/); assert.match(DOC, /non_fast_forward/); assert.match(DOC, /deletion/);
});
