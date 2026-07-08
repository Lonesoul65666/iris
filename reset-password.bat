@echo off
REM ---------------------------------------------------------------
REM  Iris password reset ("jailbreak") — double-click to get back in
REM  if you're locked out or forgot a password. Runs against the same
REM  database the app uses; it prompts for the account + new password.
REM ---------------------------------------------------------------
title Iris - Reset Password
cd /d "%~dp0"
call npm run reset-password
echo.
echo Done. Press any key to close this window.
pause >nul
