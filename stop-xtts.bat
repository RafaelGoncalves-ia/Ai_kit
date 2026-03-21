@echo off
title Stop XTTS Server

echo ===============================
echo     Parando Servidor XTTS
echo ===============================

:: Encontrar e matar processos Python na porta 5005
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5005') do (
    echo Matando processo PID %%a na porta 5005
    taskkill /PID %%a /F >nul 2>nul
)

:: Também tentar matar processos python relacionados ao XTTS
taskkill /IM python.exe /FI "WINDOWTITLE eq XTTS*" /F >nul 2>nul

echo.
echo Servidor XTTS parado.
timeout /t 2 >nul