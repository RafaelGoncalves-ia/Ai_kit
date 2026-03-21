@echo off
title AI-Kit Launcher (Basic)

echo ===============================
echo Iniciando AI-Kit (Basic)
echo ===============================

cd /d %~dp0

if not exist README.md (
    echo ERRO: README.md nao encontrado!
    pause
    exit /b 1
)

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERRO: Node.js nao encontrado!
    pause
    exit /b 1
)
echo Node OK

where ollama >nul 2>nul
if %errorlevel% neq 0 (
    echo ERRO: Ollama nao instalado!
    pause
    exit /b 1
)
echo Ollama OK

tasklist | findstr /i "ollama.exe" >nul
if %errorlevel% neq 0 (
    echo Iniciando Ollama...
    start "Ollama" cmd /k "ollama serve || (echo ERRO: Ollama serve falhou && pause)"
) else (
    echo Ollama ja esta rodando.
)

if not exist node_modules (
    echo node_modules nao encontrado. Instalando dependencias...
    npm install
    if %errorlevel% neq 0 (
        echo ERRO: npm install falhou!
        pause
        exit /b 1
    )
)
echo Dependencias npm OK

echo Iniciando servidor Node...
start "AI-Kit Backend" cmd /k "%~dp0backend\run-backend.bat"

timeout /t 2 > nul

start http://localhost:3001

echo ===============================
echo AI-Kit (Basic) iniciado (verifique as janelas separadas para backend e Ollama)
echo ===============================

pause