#!/usr/bin/env bash
# Inicia o Edge Rewards em qualquer máquina Linux/macOS.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERRO] Node.js nao encontrado. Instale em https://nodejs.org"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "[1/2] Instalando dependencias (1a vez - pode demorar alguns minutos)..."
  npm install
fi

echo "[2/2] Subindo o painel em http://localhost:3000"
exec node server.js
