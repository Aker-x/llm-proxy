@echo off
setlocal

cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File ".\scripts\invoke-ecs-command.ps1" -Target ecs2 %*
exit /b %errorlevel%

