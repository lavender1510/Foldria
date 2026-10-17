@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Bitte zuerst Node.js 22 installieren: https://nodejs.org/
  pause
  exit /b 1
)
if not exist "node_modules\electron" (
  echo Installiere benoetigte Pakete ...
  call npm install
  if errorlevel 1 (pause & exit /b 1)
)
call npm start
if errorlevel 1 pause
