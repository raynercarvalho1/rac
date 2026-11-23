---
titulo: Git na nuvem: branch claude/*, PR para a main, sem push direto nem force puro
tipo: regra
categoria: git
tags: git, branch, push
estado: ativo
origem: CLAUDE.md (Git pelo Claude Code Cloud)
data: 2026-11-23
---

Trabalhar em branch `claude/*` e integrar na `main` por PR (merge liberado pela política de autonomia de 23/11/2026, depois do CI do commit atual verde e sem conflito). `git add` só por caminho (nunca `-A` nem `.`, que arrastam arquivos por engano num repositório público). Nunca push direto para `main`/`master`; `--force` puro e `+refspec` ficam fora, mas `--force-with-lease` em `claude/*` é livre (rebase, amend). Reset, clean, stash, rebase, exclusão de branch, edição de `.claude/`, workflows e CODEOWNERS são livres. Uma tarefa coerente por commit.
