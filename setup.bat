@echo off
:: Set UTF-8 encoding for Thai support
chcp 65001 > nul
title POS System - Setup
echo ==========================================
echo    POS System - Initial Setup (UTF-8)
echo ==========================================

echo [1/2] Installing Backend dependencies...
cd POS_Project\backend && npm install
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Backend installation failed.
    pause
    exit /b %errorlevel%
)

echo.
echo [2/2] Installing Frontend dependencies...
cd ..\frontend && npm install
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Frontend installation failed.
    pause
    exit /b %errorlevel%
)

echo.
echo ==========================================
echo    Setup Complete!
echo    You can now use run.bat to start the project.
echo ==========================================
pause
