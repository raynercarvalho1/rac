---
titulo: Git na nuvem: branch claude/*, caminhos explícitos, nunca main nem force
tipo: regra
categoria: git
tags: git, branch, push
estado: ativo
origem: CLAUDE.md (Git pelo Claude Code Cloud)
data: 2026-11-20
---

Trabalhar em branch `claude/*`, nunca em `main`. `git add` só por caminho (nunca `-A` nem `.`). Sem force push, `reset --hard`, `clean`, `commit --amend`. Uma tarefa coerente por commit. Não editar `.claude/` sem necessidade explícita do lote. Merge de PR só com CI do commit atual verde, sem conflito, dentro do escopo e sem tocar `.claude/`, workflows, CODEOWNERS, secrets ou permissões.
