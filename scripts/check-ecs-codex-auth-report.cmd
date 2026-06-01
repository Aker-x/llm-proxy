@echo off
setlocal

cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0check-ecs-codex-auth-report.ps1" %*
set EXIT_CODE=%ERRORLEVEL%
echo.
pause
exit /b %EXIT_CODE%
