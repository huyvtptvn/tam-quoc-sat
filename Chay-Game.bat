@echo off
chcp 65001 >nul
title Tam Quoc Sat - Server
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Chua cai Node.js. Hay tai ban LTS tai https://nodejs.org roi bam lai file nay.
  echo.
  start "" https://nodejs.org
  pause
  exit /b 1
)
node launcher\start.mjs
echo.
pause
