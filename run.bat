@echo off
:: Set UTF-8 encoding for Thai and Emojis
chcp 65001 > nul
title POS System - Runner
echo ==========================================
echo    Starting POS System (UTF-8 Mode)
echo ==========================================

echo [1/2] Launching Backend Server...
start "POS Backend" cmd /k "chcp 65001 > nul && cd POS_Project\backend && npm start"

echo [2/2] Launching Frontend (Vite)...
start "POS Frontend" cmd /k "chcp 65001 > nul && cd POS_Project\frontend && npm run dev"

echo.
echo ==========================================
echo    System status:
echo    - Backend:  http://localhost:3001
echo    - Frontend: https://localhost:5174
echo ==========================================
echo Press any key to exit this monitor window...
pause > nul
