@echo off
setlocal
chcp 65001 >nul

echo ==========================
echo     AI-KIT STARTER
echo ==========================
cd /d F:\AI\Ai_kit

set PYTHON=C:\GitHub\XTTS\venv\Scripts\python.exe

if not exist logs mkdir logs

echo Iniciando sistemas...

echo [1/3] STT Server...

start "" /B %PYTHON% backend\services\xtts_server.py > logs\xtts.log 2>&1

timeout /t 2 >nul

echo [2/3] XTTS Server...

start "" /B %PYTHON% backend\services\stt_server.py > logs\stt.log 2>&1

timeout /t 5 >nul

echo [3/3] Backend Node...
start "" /B node backend\server.js > logs\backend.log 2>&1

timeout /t 3 >nul

start http://localhost:3001/

pause
