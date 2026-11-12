# Desenvolvimento pelo Claude Code na nuvem

Como o RAC é desenvolvido pelo celular, numa máquina do Claude Code na nuvem, sem o computador. As regras de Git e de autorização
estão no `CLAUDE.md` (seção "Git pelo Claude Code Cloud"); aqui fica o ambiente e a proteção da `main`.

## Ambiente "RAC" (configurado em 12/11/2026)
- **Rede:** limitada; além dos registros de pacotes (npm, PyPI…), só o Supabase do RAC (para os testes que leem o banco real, só leitura).
- **Script de preparação** (gravado no ambiente; roda como root em cada máquina nova, depois do clone e antes do Claude começar):
  ```bash
  if [ -f rac/scripts/nuvem_preparar.sh ]; then bash rac/scripts/nuvem_preparar.sh || echo "RAC: a preparação dos testes falhou; rode bash scripts/nuvem_preparar.sh"; fi
  ```
  Se o arquivo não existir no que foi clonado (ex.: uma branch antiga), ele só pula, sem travar a sessão.
- **`scripts/nuvem_preparar.sh`** (idempotente):
  - lê as versões do próprio `.github/workflows/testes.yml` (hoje Node 24, Playwright 1.48.2, PGlite 0.5.10) e instala em
    `/opt/rac-nuvem`, só se faltar ou estiver diferente; a segunda vez não reinstala nada;
  - não troca o Node do sistema (o Claude Code usa o dele); o Node 24 entra só nos testes, pelo `PATH` do `env.sh`;
  - usa o Chromium que a máquina já tem (`/opt/pw-browsers/chromium`, via `RAC_CHROMIUM`); não baixa navegador;
  - aponta `python3` para o 3.12, como no CI;
  - cria o link `node_modules` na pasta ACIMA do repositório (fora do Git), para os testes acharem `playwright` e o PGlite;
  - grava `/opt/rac-nuvem/env.sh` com `NODE_USE_ENV_PROXY=1` (o Node 24 só passa pelo proxy da nuvem com isso),
    `PYTHONDONTWRITEBYTECODE=1` e `RAC_CHROMIUM`.

## Como usar numa sessão nova
- Durante o trabalho (teste do módulo): `bash scripts/nuvem_testes.sh tests/x.test.mjs`
- Na preparação da publicação (tudo, como o CI): `bash scripts/nuvem_testes.sh`
  (Grupo 1 e Grupo 2 com as regras do CI: Grupo 2 sem nenhum ignorado e com pelo menos 20 testes)
- Se a máquina não foi preparada (o script do ambiente falhou ou a sessão é antiga), o `nuvem_testes.sh` prepara sozinho;
  à mão: `bash scripts/nuvem_preparar.sh`.
- Os scripts não fazem commit, push, SQL nem deploy; só instalam o que o teste precisa e rodam os testes.

## Proteção da `main` no GitHub (ruleset)
**Estado em 12/11/2026: nenhum ruleset ativo.** A sessão do Claude não tem ferramenta para criar ruleset (só o dono, nas
configurações do repositório). Hoje a `main` é protegida só pelas travas do `.claude/settings.json` (o Claude não consegue
dar push na `main`, force push nem apagar branch) e pela regra de trabalhar por Pull Request.

### Quem grava direto na `main` hoje
| Quem | Como | Identidade no GitHub |
|---|---|---|
| Robô de Notícias (`noticias.yml`) | `git push` com o `GITHUB_TOKEN` do `actions/checkout` | `github-actions[bot]` (app GitHub Actions) |
| Robô de Vagas (`vagas.yml`) | `git push` com o `GITHUB_TOKEN` do `actions/checkout` | `github-actions[bot]` (app GitHub Actions) |
| Merge de Pull Request | botão de merge (pelo dono, ou pelo Claude a pedido dele) | conta do dono |
| Fluxo antigo do computador | `git pull --rebase` + `git push` | conta do dono |
| Claude Code na nuvem | push só em `claude/*`; usa a **conta do dono** no GitHub | conta do dono |

### Fase 1, segura agora: bloquear force push e exclusão da `main`
Os robôs só fazem push normal (avanço rápido): esta fase não os afeta, nem o merge de PR, nem o fluxo antigo.
No GitHub (navegador, pois o app não tem essa tela): Settings → Rules → Rulesets → New ruleset → New branch ruleset:
- Ruleset name: `main protegida`; Enforcement status: **Active**;
- Target branches: Add target → **Include default branch**;
- Rules: deixar marcados só **Restrict deletions** e **Block force pushes** (vêm marcados); nenhum bypass; Create.

Equivalente em JSON (Settings → Rules → Rulesets → New ruleset → Import a ruleset):
```json
{
  "name": "main protegida",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [ { "type": "deletion" }, { "type": "non_fast_forward" } ],
  "bypass_actors": []
}
```

### Fase 2, NÃO ativar ainda: exigir Pull Request na `main`
Exigir PR barraria o push direto dos robôs de Notícias e Vagas. Pela documentação do GitHub (github/docs,
`data/reusables/repositories/rulesets-bypass-step.md`), podem ser exceção (bypass) num ruleset: administradores do repositório,
os papéis maintain/write, times, GitHub Apps e o Dependabot (deploy keys só no GitHub Enterprise Server). O `GITHUB_TOKEN`
(`github-actions[bot]`) **não aparece na lista**, e não foi possível confirmar que ele possa ser escolhido como exceção.
A exceção por papel de administrador não serve: ela vale para a conta do dono, que é a mesma que o Claude usa, e deixaria o
Claude gravar direto na `main`.

Caminhos para a Fase 2 (cada um é decisão do dono):
1. Na tela do ruleset, conferir se "GitHub Actions" aparece em Bypass list → Add bypass. Se aparecer, adicioná-lo como única
   exceção (modo Always) e ligar a regra "Require a pull request before merging" com 0 aprovações; depois conferir que a
   próxima rodada de Notícias e a de Vagas gravaram (a página Actions mostra verde e um commit novo na `main`).
2. Se não aparecer: criar um GitHub App só para os robôs (o token dele substitui o `GITHUB_TOKEN` no push), o que exige mudar os dois
   workflows e criar dois secrets: mudança nos robôs e em secrets, que precisa de autorização própria.
3. Ou fazer os robôs abrirem PR com merge automático, também mudando os robôs.

Regras recomendadas na Fase 2, além das da Fase 1: "Require a pull request before merging" (0 aprovações; métodos merge e squash)
e, se desejado, "Require status checks to pass" com o check `testes`. Atenção: um PR que mexa só nos JSON dos robôs não roda o
`testes` (paths-ignore) e ficaria travado com essa exigência.
