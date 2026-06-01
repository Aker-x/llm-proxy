@echo off
setlocal

cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File ".\scripts\open-ecs-shell.ps1" -Target ecs2 %*
exit /b %errorlevel%
