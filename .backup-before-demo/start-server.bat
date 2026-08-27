@echo off
cd /d "E:\web 2"
set "PATH=C:\Program Files\nodejs;%PATH%"
echo ==========================================
echo Game Pixel server is starting...
echo Open: http://localhost:5000
echo Do not close this window while using site.
echo ==========================================
node server.js
pause
