#!/usr/bin/env bash
# Prepara a máquina do Claude Code na nuvem para rodar os testes do RAC como o CI (.github/workflows/testes.yml).
# Só para a nuvem: o site não tem dependências; isto é só do teste. Não mexe no repositório, no Node do sistema nem em segredos.
# Idempotente: se Node, Playwright e PGlite já estão nas versões do CI, não reinstala nada.
# Uso:  bash scripts/nuvem_preparar.sh            prepara (o script de preparação do ambiente "RAC" chama isto em cada máquina nova)
#       bash scripts/nuvem_preparar.sh --versoes  só mostra as versões que o CI pede (sem instalar)
# Detalhes: docs/nuvem.md
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${RAC_NUVEM_DIR:-/opt/rac-nuvem}"
WF="$RAIZ/.github/workflows/testes.yml"

# versões lidas do próprio CI: uma fonte só (mudou no testes.yml, muda aqui)
PW="$(grep -oE 'playwright@[0-9]+\.[0-9]+\.[0-9]+' "$WF" | head -1 | cut -d@ -f2)"
PGL="$(grep -oE '@electric-sql/pglite@[0-9]+\.[0-9]+\.[0-9]+' "$WF" | head -1 | sed 's/.*@//')"
NODE_MAJ="$(grep -oE 'node-version: "[0-9]+"' "$WF" | head -1 | grep -oE '[0-9]+')"
if [ -z "$PW" ] || [ -z "$PGL" ] || [ -z "$NODE_MAJ" ]; then
  echo "nuvem_preparar: não achei as versões no $WF" >&2; exit 1
fi
if [ "${1:-}" = "--versoes" ]; then echo "node=$NODE_MAJ playwright=$PW pglite=$PGL"; exit 0; fi

versao_de() { sed -n 's/^  "version": "\([^"]*\)".*/\1/p' "$DEST/node_modules/$1/package.json" 2>/dev/null | head -1; }
node_ok() { [ -x "$DEST/node_modules/.bin/node" ] && "$DEST/node_modules/.bin/node" -v 2>/dev/null | grep -q "^v$NODE_MAJ\."; }

if node_ok && [ "$(versao_de playwright)" = "$PW" ] && [ "$(versao_de @electric-sql/pglite)" = "$PGL" ]; then
  echo "nuvem_preparar: já pronto (node $("$DEST/node_modules/.bin/node" -v), playwright $PW, pglite $PGL)"
else
  echo "nuvem_preparar: instalando node $NODE_MAJ, playwright $PW e pglite $PGL em $DEST"
  mkdir -p "$DEST"
  [ -f "$DEST/package.json" ] || printf '{ "name": "rac-nuvem", "private": true }\n' > "$DEST/package.json"
  (cd "$DEST" && npm install --no-audit --no-fund --save-exact "node@$NODE_MAJ" "playwright@$PW" "@electric-sql/pglite@$PGL")
  node_ok || { echo "nuvem_preparar: o Node $NODE_MAJ não ficou disponível" >&2; exit 1; }
fi

# Chromium: o da própria máquina (o Playwright 1.48 não acha sozinho uma versão mais nova, por isso RAC_CHROMIUM).
# Não baixa navegador: o download do Playwright não está na rede permitida da nuvem.
CHROMIUM="${RAC_CHROMIUM:-}"
if [ -z "$CHROMIUM" ] && [ -x /opt/pw-browsers/chromium ]; then CHROMIUM=/opt/pw-browsers/chromium; fi
if [ -z "$CHROMIUM" ]; then echo "nuvem_preparar: AVISO: sem Chromium na máquina; tests/navegador.test.mjs vai falhar" >&2; fi

# Python 3.12, como no CI (ubuntu-latest), para os testes que chamam o python3
mkdir -p "$DEST/bin"
if [ -x /usr/bin/python3.12 ]; then ln -sfn /usr/bin/python3.12 "$DEST/bin/python3"; ln -sfn /usr/bin/python3.12 "$DEST/bin/python"; fi

# Os testes importam "playwright" e "@electric-sql/pglite" pelo nome: o Node procura node_modules subindo das pastas.
# O link fica na pasta ACIMA do repositório (fora do Git); um node_modules de verdade que já exista ali não é tocado.
LINK="$(dirname "$RAIZ")/node_modules"
if [ -L "$LINK" ] || [ ! -e "$LINK" ]; then ln -sfn "$DEST/node_modules" "$LINK"
else echo "nuvem_preparar: AVISO: $LINK já existe e não é um link; deixei como está" >&2; fi

# variáveis que os testes precisam na nuvem (lidas pelo scripts/nuvem_testes.sh)
{
  echo "# gerado por scripts/nuvem_preparar.sh"
  echo "export PATH=\"$DEST/bin:$DEST/node_modules/.bin:\$PATH\""
  echo "export NODE_USE_ENV_PROXY=1          # o Node 24 só usa o proxy da nuvem com isto (testes que leem o banco real)"
  echo "export PYTHONDONTWRITEBYTECODE=1     # sem scripts/__pycache__"
  if [ -n "$CHROMIUM" ]; then echo "export RAC_CHROMIUM=\"$CHROMIUM\""; fi
} > "$DEST/env.sh"
echo "nuvem_preparar: pronto. Testes: bash scripts/nuvem_testes.sh (tudo) ou bash scripts/nuvem_testes.sh tests/x.test.mjs"
