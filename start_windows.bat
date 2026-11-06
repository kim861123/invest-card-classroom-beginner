@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo INVEST PLAY - classroom app
if not exist ".env" (
  echo [.env missing] Copy .env.example to .env and set TEACHER_PASSWORD.
  pause
  exit /b 1
)
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo Node.js 20 or newer is required.
  pause
  exit /b 1
)
node server.mjs
pause
