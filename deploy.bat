@echo off
cd /d "%~dp0"
node deploy.mjs
if errorlevel 1 echo Deployment stopped. See error above.
pause
