@echo off

echo Parando AI Kit...

taskkill /F /IM node.exe
taskkill /F /IM python.exe

echo Finalizado.
pause