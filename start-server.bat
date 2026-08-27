@echo off
cd /d "E:\web 2"
set "PATH=C:\Program Files\nodejs;%PATH%"
echo ==========================================
title Game Pixel - Local Server
echo   Game Pixel server is running
echo Open: http://localhost:5000
echo Do not close this window while presenting
echo ==========================================
node server.js
pause
