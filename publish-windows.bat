@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish-windows.ps1"
if errorlevel 1 (
  echo.
  echo Veroeffentlichung konnte nicht abgeschlossen werden. Hinweise oben lesen.
  pause
  exit /b 1
)
echo.
echo GitHub Actions erstellt die Windows-Downloads. Link siehe oben.
pause
