@echo off
echo Iniciando backend no diretorio %~dp0
cd /d "%~dp0.."
echo Diretorio atual: %CD%
set PORT=3001
node backend/server.js
if %errorlevel% neq 0 (
  echo ERRO: node backend/server.js retornou %errorlevel%
  pause
)
echo Backend finalizado.
pause