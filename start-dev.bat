@echo off
cd /d "%~dp0"
echo ========================================
echo   ImageTrans Pro
echo ========================================
echo.
echo [1/2] Building frontend...
call npx vite build
if %errorlevel% neq 0 (
    echo Build failed!
    pause
    exit /b %errorlevel%
)
echo.
echo [2/2] Launching desktop app...
call npx electron .
pause
