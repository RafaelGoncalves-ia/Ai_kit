@echo off
chcp 65001 >nul
title AI-Kit Launcher (Full)

echo ===============================
echo Iniciando AI-Kit (FULL)
echo ===============================

cd /d %~dp0

REM ======================
REM CHECKS
REM ======================
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERRO: Node.js nao encontrado!
    pause
    exit /b 1
)

where ollama >nul 2>nul
if %errorlevel% neq 0 (
    echo ERRO: Ollama nao instalado!
    pause
    exit /b 1
)

echo Node OK
echo Ollama OK

REM ======================
REM OLLAMA
REM ======================
tasklist | findstr /i "ollama.exe" >nul
if %errorlevel% neq 0 (
    echo Iniciando Ollama...
    start "Ollama" cmd /k "ollama serve"
) else (
    echo Ollama ja esta rodando.
)

REM ======================
REM BACKEND
REM ======================
echo Iniciando backend...
start "AI-Kit Backend" cmd /k "%~dp0backend\run-backend.bat"

timeout /t 2 > nul

REM ======================
REM ELECTRON (APP REAL)
REM ======================
echo Iniciando Kit App (Electron)...

cd /d %~dp0kit-app

if not exist node_modules (
    echo Instalando dependencias do app...
    npm install
)

start "KIT APP" cmd /k "npm start"

echo ===============================
echo AI-Kit iniciado com sucesso
echo ===============================

pause
