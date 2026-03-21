@echo off
title XTTS Server Launcher

echo ===============================
echo     Iniciando Servidor XTTS
echo ===============================

cd /d %~dp0

:: Ler configuração
if exist "xtts-config.txt" (
    for /f "tokens=1,2 delims==" %%a in (xtts-config.txt) do (
        if "%%a"=="XTTS_VENV" set XTTS_VENV=%%b
        if "%%a"=="XTTS_PORT" set XTTS_PORT=%%b
        if "%%a"=="XTTS_PYTHON" set XTTS_PYTHON=%%b
    )
)

:: Valores padrão
if "%XTTS_VENV%"=="" set XTTS_VENV=C:\GitHub\XTTS\venv
if "%XTTS_PORT%"=="" set XTTS_PORT=5005
if "%XTTS_PYTHON%"=="" set XTTS_PYTHON=python

echo Configuracao XTTS:
echo VENV: %XTTS_VENV%
echo PORT: %XTTS_PORT%
echo PYTHON: %XTTS_PYTHON%
echo.

:: Verificar se o venv existe
if not exist "%XTTS_VENV%" (
    echo ERRO: Venv do XTTS nao encontrado em %XTTS_VENV%
    echo.
    echo Para configurar XTTS:
    echo 1. Instale o XTTS
    echo 2. Crie um venv: python -m venv %XTTS_VENV%
    echo 3. Configure o caminho em xtts-config.txt
    echo.
    pause
    exit /b 1
)

echo Venv encontrado. Ativando...

:: Ativar venv e iniciar servidor
call "%XTTS_VENV%\Scripts\activate.bat"

if %errorlevel% neq 0 (
    echo ERRO: Falha ao ativar venv
    pause
    exit /b 1
)

echo Venv ativado. Verificando TTS...

:: Verificar se TTS está instalado
%XTTS_PYTHON% -c "import TTS; print('TTS OK')" >nul 2>nul
if %errorlevel% neq 0 (
    echo ERRO: TTS nao instalado no venv
    echo Execute: pip install TTS torch simpleaudio
    pause
    exit /b 1
)

echo TTS OK. Iniciando servidor XTTS na porta %XTTS_PORT%...

:: Definir porta via variável de ambiente
set XTTS_PORT=%XTTS_PORT%

:: Iniciar servidor
%XTTS_PYTHON% "backend\services\xtts_server.py"

if %errorlevel% neq 0 (
    echo ERRO: Falha ao iniciar servidor XTTS
    pause
)

echo.
echo Servidor XTTS finalizado.
pause