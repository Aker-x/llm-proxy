@echo off
setlocal

cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File ".\scripts\start-multi-instance.ps1" -Mode dev %*
exit /b %errorlevel%
