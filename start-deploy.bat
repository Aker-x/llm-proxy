@echo off
setlocal

cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File ".\scripts\start-multi-instance.ps1" -Mode deploy %*
exit /b %errorlevel%
