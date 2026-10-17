@echo off
cd /d "%~dp0"
call npm install
if errorlevel 1 (pause & exit /b 1)
call npm test
if errorlevel 1 (pause & exit /b 1)
call npm run dist:win
if errorlevel 1 (pause & exit /b 1)
echo Fertig! Die EXE findest du unter dist.
pause
