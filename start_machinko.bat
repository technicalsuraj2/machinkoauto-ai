@echo off
title MachinkoAuto.Ai 24/7 Engine
cd /d "%~dp0"
echo ============================================================
echo         MachinkoAuto.Ai 24/7 Autonomous Studio
echo ============================================================
echo [1/2] Starting Next.js Web App and Background Worker...
start "AutoTube - Web & Worker" cmd /k "npm run dev"

timeout /t 6 >nul

echo [2/2] Starting Telegram AI Executive Manager (Suraj sir)...
start "AutoTube - Telegram AI" cmd /k "python -u storage\scripts\telegram_userbot.py"

echo.
echo ============================================================
echo SUCCESS: Saari 24/7 services alag windows me start ho chuki hain!
echo In windows ko minimize kar sakte hain.
echo Ab Antigravity band karne par bhi YouTube automation aur
echo Telegram AI 24/7 continuously chalta rahega!
echo ============================================================
timeout /t 5
