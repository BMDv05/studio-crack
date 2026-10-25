@echo off
setlocal
title Double H Studio
cd /d "%~dp0"

netstat -ano | findstr ":3100" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo API is already running on port 3100 - starting the site only...
  start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 6; Start-Process 'http://localhost:5173'"
  call npm run dev:client
) else (
  echo Starting database, API and site...
  start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 10; Start-Process 'http://localhost:5173'"
  call npm run dev
)

echo.
echo Stopped. Press any key to close this window.
pause >nul
