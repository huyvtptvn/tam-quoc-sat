@echo off
chcp 65001 >nul
title Nhap anh tuong
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo  Chua cai Node.js. Tai ban LTS tai https://nodejs.org
  pause
  exit /b 1
)
rem Keo tha thu muc goi anh vao file nay, hoac bam dup roi dan duong dan.
node tools\nhap-anh-tuong.mjs %*
echo.
pause
