@echo off
setlocal

cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File ".\scripts\backup-ecs-data.ps1" -Target ecs2 %*
exit /b %errorlevel%

