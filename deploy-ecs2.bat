@echo off
setlocal

cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File ".\scripts\deploy-to-ecs.ps1" -Target ecs2 %*
exit /b %errorlevel%
