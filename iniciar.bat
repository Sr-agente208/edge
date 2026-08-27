@echo off
chcp 65001 >nul
title Edge Rewards - Automacao diaria
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado. Instale em https://nodejs.org e tente de novo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo [1/2] Instalando dependencias (1a vez - pode demorar alguns minutos)...
  call npm install
  if errorlevel 1 (
    echo [ERRO] Falha no npm install.
    pause
    exit /b 1
  )
)

echo [2/2] Subindo o painel...
start "" http://localhost:3000
node server.js
pause
