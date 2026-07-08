@echo off
REM ---------------------------------------------------------------
REM  Iris launcher — double-click this (or a shortcut to it) to run
REM  the always-on host. Sets LAN mode explicitly so the app is
REM  reachable from other devices, then starts the standalone server.
REM ---------------------------------------------------------------
title Iris
cd /d "%~dp0"
set IRIS_LAN=1
echo Starting Iris (LAN mode) from %CD%
echo Press Ctrl+C in this window to stop the server.
echo.
call npm run server
REM Keep the window open if the server exits so errors stay readable.
echo.
echo Iris server stopped. Press any key to close this window.
pause >nul
