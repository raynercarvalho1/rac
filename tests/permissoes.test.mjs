// Política permanente de autonomia do Claude Code (.claude/settings.json, escopo do projeto, versionado).
// Não é o Claude Code rodando: simula a ordem de decisão das regras (negar → pedir → permitir; o que não está em lista pede) com uma tabela de comandos reais,
// para a política não afrouxar sem ninguém ver. Regras do dono: sem Bash irrestrito; merge, reset, rebase, stash, force push, exclusão de branch e alterações
// de permissão continuam pedindo; as travas antigas (main, force, psql, supabase, .env, privado) continuam.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const S = JSON.parse(fs.readFileSync(new URL("../.claude/settings.json", import.meta.url), "utf8")), P = S.permissions;
const { allow, deny, ask } = P;
const interno = (r) => { const m = /^Bash\((.*)\)$/.exec(r); return m ? m[1] : null; };
const rx = (g) => new RegExp("^" + g.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
const casa = (lista, cmd) => lista.some((r) => { const g = interno(r); return g !== null && rx(g).test(cmd); });
/* negar vence pedir, que vence permitir; comando fora de qualquer lista pede */
const decide = (cmd) => casa(deny, cmd) ? "nega" : casa(ask, cmd) ? "pede" : casa(allow, cmd) ? "permite" : "pede";

test("estrutura: JSON válido, três listas de texto, sem repetição dentro de cada lista", () => {
  for (const [n, l] of [["allow", allow], ["deny", deny], ["ask", ask]]) { assert.ok(Array.isArray(l) && l.length, n); assert.ok(l.every((x) => typeof x === "string" && x.trim() === x && x), n + ": só texto"); assert.equal(new Set(l).size, l.length, n + ": sem repetição"); }
  for (const r of allow) assert.ok(!deny.includes(r) && !ask.includes(r), "a mesma regra não pode estar em allow e em deny/ask: " + r);
});

test("as travas antigas continuam todas (nada foi afrouxado)", () => {
  const ANTIGAS = ["Bash(git push *--force*)", "Bash(git push *-f *)", "Bash(git push *+*)", "Bash(git push *main*)", "Bash(git push *master*)", "Bash(git push *--delete*)", "Bash(git push *--all*)", "Bash(git push *--mirror*)",
    "Bash(git reset --hard*)", "Bash(git clean *)", "Bash(psql *)", "Bash(supabase *)", "Bash(curl *api.supabase.com*)", "Bash(wget *api.supabase.com*)", "mcp__github__push_files", "mcp__github__create_or_update_file",
    "mcp__github__delete_file", "Read(./.env)", "Read(./.env.*)", "Read(./privado/**)", "Edit(./privado/**)"];
  for (const r of ANTIGAS) assert.ok(deny.includes(r), "trava antiga removida: " + r);
  /* decisão do dono em 14/11/2026: o merge de PR deixou de pedir (as condições de segurança estão no CLAUDE.md); o merge automático continua pedindo */
  assert.ok(allow.includes("mcp__github__merge_pull_request") && !ask.includes("mcp__github__merge_pull_request"), "merge de PR liberado pelo dono");
  assert.ok(ask.includes("mcp__github__enable_pr_auto_merge"));
});

test("sem autorização irrestrita: nenhum Bash genérico, nenhum comando perigoso ou fora da lista fechada em allow", () => {
  assert.ok(!allow.includes("Bash") && !allow.includes("Bash(*)") && !allow.some((r) => /^Bash\(\s*\*/.test(r)), "Bash irrestrito");
  const prefixos = [/^git (status|diff|log|show|blame|shortlog|describe|fetch|rev-parse|rev-list|merge-base|ls-files|ls-tree|cat-file|remote -v|branch (--show-current|--list|-a|-r|-vv)|worktree (list|add)|add|commit|switch|checkout -b|merge|push (origin|-u origin|--set-upstream origin) claude\/)/,
    /^node (--test|--check)/, /^node scripts\/conhecimento\.mjs (antes|buscar|listar|ver|novo|indice|verificar)/, /^bash scripts\/nuvem_(testes|preparar)\.sh/, /^gh (api -X GET|pr (view|list|checks|diff|create|edit)|run (list|view))/];
  for (const r of allow.filter((x) => interno(x) !== null)) assert.ok(prefixos.some((p) => p.test(interno(r))), "comando fora da lista fechada: " + r);
  for (const r of allow) assert.ok(!/(auto_merge|push_files|delete_file|create_or_update_file|actions_run_trigger|reset|rebase|stash|--force|psql|supabase|\brm\b|sudo|npm|curl|wget|eval|\bsh -c)/.test(r.replace(/^Bash\(git merge \*\)$/, "")), "regra permissiva demais: " + r);
  assert.ok(!allow.includes("Bash(git push *)") && !allow.includes("Bash(git push*)") && !allow.includes("Bash(git *)"), "push e git genéricos");
});

test("decisão por comando: o que é rotina passa sem pedir; o que o dono reservou pede ou é negado", () => {
  const TAB = {
    permite: ["git status", "git status --short", "git diff", "git diff --check", "git diff origin/main --stat", "git log --oneline -5", "git show HEAD", "git fetch", "git fetch origin main", "git rev-parse --show-toplevel",
      "git branch --show-current", "git branch --list claude/*", "git add js/saude.js docs/saude.md", "git add .claude/settings.json", 'git commit -m "feat: x"', "git switch -c claude/nova", "git switch claude/outra", "git checkout -b claude/y",
      "git worktree add -b claude/z /tmp/x origin/main", "git worktree list", "git merge origin/main", "git merge --no-edit origin/main", "git push origin claude/nova", "git push -u origin claude/nova",
      "git push --set-upstream origin claude/nova", "node --test tests/a.test.mjs", "node --check js/a.js", "node scripts/conhecimento.mjs antes \"migration nova\"", "node scripts/conhecimento.mjs buscar garmin --tipo erro", "node scripts/conhecimento.mjs novo --tipo erro --titulo x", "node scripts/conhecimento.mjs indice", "node scripts/conhecimento.mjs verificar", "bash scripts/nuvem_testes.sh", "bash scripts/nuvem_testes.sh tests/a.test.mjs", "gh api -X GET search/code -f q=x",
      "gh pr view 28", "gh pr create --title x --body y", "gh pr checks 28", "gh run list"],
    nega: ["git push --force origin claude/x", "git push --force-with-lease origin claude/x", "git push -f origin claude/x", "git push origin main", "git push origin master", "git push origin claude/x:main", "git push origin +claude/x",
      "git push origin --delete claude/x", "git push --all origin", "git push --mirror origin", "git add -A", "git add --all", "git add .", "git add . ", 'git commit --amend -m "x"', "git commit -m x --amend", "git reset --hard HEAD~1",
      "git clean -fd", "git switch -f main", "git switch --discard-changes main", "git switch main --force", "psql postgres://x", "supabase functions deploy garmin", "curl https://api.supabase.com/v1/x"],
    pede: ["node scripts/outro.mjs", "node scripts/conhecimento.mjs", "node scripts/conhecimento.mjs xpto", "node scripts/conhecimento.mjs indice && rm -rf docs", "node scripts/conhecimento.mjs verificar; curl https://x.example", "node --eval 1", "git reset HEAD~1", "git reset --soft HEAD~1", "git rebase origin/main", "git rebase -i HEAD~3", "git stash", "git stash pop", "git stash list", "git branch -D claude/x", "git branch -d claude/x", "git branch --delete claude/x",
      "git worktree remove /tmp/x", "git merge --abort", "git push origin feature/x", "git push origin HEAD", "git checkout main", "git checkout -- js/a.js", "git restore js/a.js", "git rm js/a.js", "rm -rf docs", "npm install", "python3 x.py"],
  };
  for (const [esperado, cmds] of Object.entries(TAB)) for (const c of cmds) assert.equal(decide(c), esperado, `"${c}" deveria ${esperado}`);
});

test("ferramentas do GitHub: leitura, criação de branch e de PR, atualização e merge de PR passam; merge automático, disparo de workflow e escrita direta de arquivo não", () => {
  for (const f of ["pull_request_read", "get_file_contents", "get_commit", "get_check_run", "get_job_logs", "list_pull_requests", "list_commits", "list_branches", "issue_read", "actions_get", "actions_list", "create_branch", "create_pull_request", "update_pull_request"])
    assert.ok(allow.includes("mcp__github__" + f), "deveria permitir " + f);
  assert.ok(allow.includes("mcp__github__merge_pull_request"), "merge de PR: liberado pelo dono em 14/11/2026");
  for (const f of ["enable_pr_auto_merge", "actions_run_trigger"]) { assert.ok(ask.includes("mcp__github__" + f), f + " pede"); assert.ok(!allow.includes("mcp__github__" + f)); }
  for (const f of ["push_files", "create_or_update_file", "delete_file"]) { assert.ok(deny.includes("mcp__github__" + f), f + " negado"); assert.ok(!allow.includes("mcp__github__" + f)); }
  assert.ok(!allow.some((r) => /mcp__github__(add_issue_comment|pull_request_review_write|issue_write|create_repository|fork_repository|resolve_review_thread|update_issue_comment|create_branch\b.*force)/.test(r) && !/create_branch$/.test(r)), "comentar, revisar e criar repositório continuam pedindo");
});

test("edição: livre no projeto, mas a própria política, os workflows privilegiados e o CODEOWNERS pedem; privado/ e .env seguem bloqueados", () => {
  assert.ok(allow.includes("Edit") && allow.includes("Write"));
  for (const r of ["Edit(./.claude/**)", "Write(./.claude/**)", "Edit(./.github/workflows/**)", "Write(./.github/workflows/**)", "Edit(./.github/CODEOWNERS)", "Write(./.github/CODEOWNERS)"]) assert.ok(ask.includes(r), r);
  assert.ok(deny.includes("Edit(./privado/**)") && deny.includes("Read(./.env)") && deny.includes("Read(./privado/**)"));
});
