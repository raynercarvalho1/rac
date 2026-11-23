// Política Permanente de Autonomia Operacional (23/11/2026) tornada efetiva em .claude/settings.json (escopo do projeto, versionado).
// Não é o Claude Code rodando: simula a ordem de decisão das regras (negar → pedir → permitir) com uma tabela de comandos reais, para a autonomia não
// ser desfeita sem ninguém ver. Regra do dono: tudo que é operação técnica do projeto é LIVRE; ficam só as guardas de higiene do Git e de segredos.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const S = JSON.parse(fs.readFileSync(new URL("../.claude/settings.json", import.meta.url), "utf8")), P = S.permissions;
const { allow, deny, ask } = P;
const interno = (r) => { const m = /^Bash\((.*)\)$/.exec(r); return m ? m[1] : null; };
const rx = (g) => new RegExp("^" + g.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
const casa = (lista, cmd) => lista.some((r) => r === "Bash" || (interno(r) !== null && rx(interno(r)).test(cmd)));
/* negar vence pedir, que vence permitir */
const decide = (cmd) => deny.some((r) => interno(r) !== null && rx(interno(r)).test(cmd)) ? "nega" : ask.some((r) => interno(r) !== null && rx(interno(r)).test(cmd)) ? "pede" : casa(allow, cmd) ? "permite" : "pede";

test("estrutura: JSON válido, listas de texto sem repetição, nada ao mesmo tempo permitido e negado, e NADA fica esperando aprovação (ask vazio)", () => {
  for (const [n, l] of [["allow", allow], ["deny", deny], ["ask", ask]]) { assert.ok(Array.isArray(l), n); assert.ok(l.every((x) => typeof x === "string" && x.trim() === x && x), n + ": só texto"); assert.equal(new Set(l).size, l.length, n + ": sem repetição"); }
  assert.ok(allow.length && deny.length);
  assert.deepEqual(ask, [], "a política de autonomia não deixa nenhuma operação do projeto à espera de aprovação");
  for (const r of allow) assert.ok(!deny.includes(r), "a mesma regra não pode estar em allow e em deny: " + r);
});

test("autonomia efetiva: Bash, edição de qualquer arquivo (inclusive .claude e workflows), Supabase e GitHub liberados", () => {
  assert.ok(allow.includes("Bash"), "qualquer operação técnica necessária é livre");
  assert.ok(allow.includes("Edit") && allow.includes("Write"));
  for (const r of ["mcp__supabase", "mcp__Supabase", "mcp__github__merge_pull_request", "mcp__github__enable_pr_auto_merge", "mcp__github__actions_run_trigger", "mcp__github__create_pull_request", "mcp__github__update_pull_request", "mcp__github__create_branch"]) assert.ok(allow.includes(r), "deveria permitir " + r);
  for (const g of ["Edit(./.claude/**)", "Write(./.claude/**)", "Edit(./.github/workflows/**)", "Write(./.github/workflows/**)", "Edit(./.github/CODEOWNERS)", "Write(./.github/CODEOWNERS)"]) assert.ok(!deny.includes(g) && !ask.includes(g), "não pode travar: " + g);
});

test("decisão por comando: tudo que a matriz libera passa; só as guardas de higiene são negadas", () => {
  const TAB = {
    permite: ["git status", "git diff --check", "git log --oneline -5", "git add js/saude.js docs/saude.md", 'git commit -m "feat: x"', "git commit --amend --no-edit", "git switch -c claude/nova", "git checkout -b claude/y", "git merge origin/main",
      "git rebase origin/main", "git stash", "git stash pop", "git reset --soft HEAD~1", "git reset --hard origin/claude/x", "git clean -fd", "git restore js/a.js", "git rm js/a.js", "git branch -D claude/velha",
      "git push origin claude/nova", "git push -u origin claude/nova", "git push --force-with-lease origin claude/nova", "git push origin --delete claude/velha",
      "gh pr create --title x --body y", "gh pr merge 85 --merge", "gh api -X PUT repos/o/r/pulls/85/merge -f merge_method=merge", "gh run rerun 1", "gh workflow run garmin-publicar.yml",
      "supabase functions deploy garmin --project-ref x", "psql $DATABASE_URL -c 'select 1'", "curl https://api.supabase.com/v1/projects", "node scripts/outro.mjs", "npm install", "python3 x.py", "rm docs/velho.md", "node --test tests/a.test.mjs"],
    nega: ["git push origin main", "git push origin master", "git push origin claude/x:main", "git push --force origin claude/x", "git push -f origin claude/x", "git push origin +claude/x", "git push --all origin", "git push --mirror origin",
      "git add -A", "git add --all", "git add .", "git add . ", "rm -rf /", "rm -rf /home", "rm -rf ~", "rm -rf $HOME"],
  };
  for (const [esperado, cmds] of Object.entries(TAB)) for (const c of cmds) assert.equal(decide(c), esperado, `"${c}" deveria ${esperado}`);
});

test("guardas de higiene mantidas (segredos e Git), cada uma por um motivo do CLAUDE.md", () => {
  for (const r of ["Bash(git push *main*)", "Bash(git push *master*)", "Bash(git push *+*)", "Bash(git add -A*)", "Bash(git add .)", "mcp__github__push_files", "mcp__github__create_or_update_file", "mcp__github__delete_file",
    "Read(./.env)", "Read(./.env.*)", "Read(./privado/**)", "Edit(./privado/**)"]) assert.ok(deny.includes(r), "guarda removida: " + r);
  const afrouxadas = ["Bash(psql *)", "Bash(supabase *)", "Bash(git reset --hard*)", "Bash(git clean *)", "Bash(git push *--delete*)", "Bash(git push *--force-with-lease*)", "Bash(git commit *--amend*)"];
  for (const r of afrouxadas) assert.ok(!deny.includes(r), "estava negada pela política antiga e agora é livre: " + r);
});

test(".mcp.json: o Supabase MCP inclui 'functions' (publicar Edge Functions) e continua só no projeto do RAC, sem segredo", () => {
  const m = JSON.parse(fs.readFileSync(new URL("../.mcp.json", import.meta.url), "utf8")), u = m.mcpServers.supabase.url;
  assert.match(u, /project_ref=hofnhbxnfebfnncwxrds/); assert.match(u, /features=[^&]*\bfunctions\b/); assert.ok(!/token|key|secret|password/i.test(u));
});
