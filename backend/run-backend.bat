@echo off
title AI-Kit Backend

echo Iniciando backend no diretório %~dp0
cd /d "%~dp0.."
echo Diretório atual: %CD%
set PORT=3001
node backend/server.js
if %errorlevel% neq 0 (
  echo ERRO: node backend/server.js retornou %errorlevel%
  pause
)
echo Backend finalizado.
pause