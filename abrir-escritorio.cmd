@echo off
rem Sobe o servidor do Escritório se ainda não estiver rodando e abre a página.
cd /d D:\escritorio-v2
netstat -ano | findstr /C:":4530 " | findstr LISTENING >nul
if errorlevel 1 (
  start "Escritorio v2" /min cmd /c npm start
  timeout /t 6 /nobreak >nul
)
start "" http://127.0.0.1:4530
