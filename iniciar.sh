#!/usr/bin/env bash
# Inicia o Edge Rewards em qualquer máquina Linux/macOS.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERRO] Node.js nao encontrado."
  echo "  macOS:  brew install node"
  echo "  Linux:  https://nodejs.org  (ou nvm install --lts)"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "[1/2] Instalando dependencias (1a vez - pode demorar alguns minutos)..."
  npm install
fi

echo "[2/2] Navegador do robo (Playwright Chromium) e painel em http://localhost:3000"
npx playwright install chromium || echo "aviso: fallback para o Chromium embutido do pacote (Linux)"
exec node server.js
