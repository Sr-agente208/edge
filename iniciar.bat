@echo off
setlocal EnableExtensions
title Edge Rewards - automacao diaria
cd /d "%~dp0"

echo ============================================================
echo   Edge Rewards - automacao diaria do Microsoft Rewards
echo ============================================================
echo.

rem ============================================================
rem  [1/4] Node.js: usa o do sistema, o local da pasta,
rem         ou baixa o proprio (1x so, ~36 MB)
rem ============================================================
set "HAVE_NODE=0"
where node >nul 2>nul && set "HAVE_NODE=1"
if "%HAVE_NODE%"=="1" (
  for /f "delims=" %%v in ('node --version') do echo [1/4] Node.js do sistema: %%v
  goto :deps
)
if exist ".\.node\node.exe" (
  set "PATH=%cd%\.node;%PATH%"
  for /f "delims=" %%v in ('node --version') do echo [1/4] Node.js local da pasta: %%v
  goto :deps
)

echo [1/4] Node.js nao encontrado - baixando para dentro desta pasta...
echo       (so acontece 1 vez, ~36 MB, precisa de internet)
set "NODE_VER=v22.23.2"
set "NODE_ZIP=node-v22.23.2-win-x64.zip"
set "TMP_DIR=%TEMP%\edgerewards-node"
if not exist "%TMP_DIR%" mkdir "%TMP_DIR%"
echo       baixando de https://nodejs.org ...
curl.exe -L --fail -sS -o "%TMP_DIR%\%NODE_ZIP%" "https://nodejs.org/dist/v22.23.2/node-v22.23.2-win-x64.zip"
if errorlevel 1 (
  echo.
  echo [ERRO] Falha no download do Node.js.
  echo        Veja sua internet e rode o iniciar.bat de novo.
  echo        (Ou instale o Node manualmente em https://nodejs.org e rode de novo.)
  pause
  exit /b 1
)
where tar >nul 2>nul
if errorlevel 1 (
  powershell -NoProfile -Command "Expand-Archive -LiteralPath '%TMP_DIR%\%NODE_ZIP%' -DestinationPath '%TMP_DIR%' -Force"
) else (
  tar -xf "%TMP_DIR%\%NODE_ZIP%" -C "%TMP_DIR%"
)
if errorlevel 1 (
  echo.
  echo [ERRO] Falha ao extrair o Node.js. Rode o iniciar.bat de novo.
  pause
  exit /b 1
)
if exist ".\.node" rmdir /s /q ".\.node"
move /y "%TMP_DIR%\node-v22.23.2-win-x64" ".\.node" >nul
if errorlevel 1 (
  echo [ERRO] Falha ao posicionar o Node.js na pasta. Rode de novo.
  pause
  exit /b 1
)
set "PATH=%cd%\.node;%PATH%"
echo       Node.js v22.23.2 pronto na pasta .node
echo.

:deps
echo [2/4] Dependencias do projeto...
if not exist "node_modules" (
  echo       instalando (1a vez - pode demorar alguns minutinhos)...
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERRO] Falha no npm install. Com internet ligada, rode de novo.
    pause
    exit /b 1
  )
)
echo       ok.

echo [3/4] Navegador do robo (Playwright Chromium)...
call npx playwright install chromium
echo       ok.

echo [4/4] Ligando o painel...
rem se ja tem um painel rodando, so abre o navegador
netstat -ano | findstr /r /c:":3000 .*LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo       Ja tinha um painel rodando - abrindo http://localhost:3000
  start "" http://localhost:3000
  pause
  exit /b 0
)

rem abre o navegador ~3 s depois, sem novo console
start "" /b cmd /c "ping 127.0.0.1 -n 4 >nul & start http://localhost:3000"

echo
echo  * Se o Windows perguntar sobre o firewall, clique em "Permitir acesso".
echo  * Para parar, feche esta janela.
echo.
call node server.js
echo.
echo O painel foi fechado.
pause
