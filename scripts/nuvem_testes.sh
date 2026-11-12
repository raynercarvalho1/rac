#!/usr/bin/env bash
# Roda os testes do RAC na nuvem do mesmo jeito que o CI (.github/workflows/testes.yml): Node 24, CI=true, Grupo 1 e Grupo 2.
# Uso:  bash scripts/nuvem_testes.sh                      Grupo 1 e Grupo 2, com as regras do CI (preparação da publicação)
#       bash scripts/nuvem_testes.sh tests/x.test.mjs ...  só esses arquivos (teste do módulo, durante o trabalho)
#       bash scripts/nuvem_testes.sh --grupo2              só mostra os arquivos do Grupo 2 (lidos do testes.yml)
# Prepara a máquina antes, se preciso (scripts/nuvem_preparar.sh). Detalhes: docs/nuvem.md
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${RAC_NUVEM_DIR:-/opt/rac-nuvem}"
WF="$RAIZ/.github/workflows/testes.yml"

# o Grupo 2 é o que o testes.yml tira do Grupo 1: grep -v -E 'tests/(a|b|c)\.test\.mjs'
G2_NOMES="$(sed -n "s/.*grep -v -E 'tests\/(\([a-z0-9_|]*\))\\\\.test\\\\.mjs'.*/\1/p" "$WF" | head -1)"
if [ -z "$G2_NOMES" ]; then echo "nuvem_testes: não achei a lista do Grupo 2 no $WF" >&2; exit 1; fi
G2=""; for n in ${G2_NOMES//|/ }; do G2="$G2 tests/$n.test.mjs"; done
if [ "${1:-}" = "--grupo2" ]; then echo $G2; exit 0; fi

bash "$RAIZ/scripts/nuvem_preparar.sh" >/dev/null || { echo "nuvem_testes: a preparação falhou (rode bash scripts/nuvem_preparar.sh)" >&2; exit 1; }
# shellcheck disable=SC1091
. "$DEST/env.sh"
export CI=true
cd "$RAIZ" || exit 1
echo "nuvem_testes: node $(node -v), python $(python3 --version 2>&1 | cut -d' ' -f2)"

if [ $# -gt 0 ]; then node --test "$@"; exit $?; fi

LOGS="$(mktemp -d)"
G1="$(ls tests/*.test.mjs | grep -v -E "tests/($G2_NOMES)\.test\.mjs")"
resumo() { grep -E '^ℹ (tests|pass|fail|skipped|cancelled|todo)' "$1" | tr '\n' ' '; echo; }

# shellcheck disable=SC2086
node --test $G1 > "$LOGS/grupo1.txt" 2>&1; ST1=$?
echo "Grupo 1 · estrutura e regressão: $(resumo "$LOGS/grupo1.txt")"
[ "$ST1" = "0" ] || grep -E '^✖' "$LOGS/grupo1.txt" | sort -u | head -20

# shellcheck disable=SC2086
node --test --test-reporter=spec $G2 > "$LOGS/grupo2.txt" 2>&1; ST2=$?
echo "Grupo 2 · banco (PGlite): $(resumo "$LOGS/grupo2.txt")"
[ "$ST2" = "0" ] || grep -E '^\s*✖' "$LOGS/grupo2.txt" | sort -u | head -20
PULADOS="$(grep -E '^ℹ skipped' "$LOGS/grupo2.txt" | awk '{print $3}')"; TESTES="$(grep -E '^ℹ tests' "$LOGS/grupo2.txt" | awk '{print $3}')"
if [ "$PULADOS" != "0" ] || [ -z "$TESTES" ] || [ "$TESTES" -lt 20 ]; then
  echo "nuvem_testes: teste de banco ignorado ou não executado (ignorados=$PULADOS, total=$TESTES), como no CI isto é falha"; ST2=1
fi
echo "Registros completos: $LOGS"
[ "$ST1" = "0" ] && [ "$ST2" = "0" ]
