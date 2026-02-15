@echo off
REM Windows Service Wrapper - Deployment Script
REM Run this as Administrator on Windows system with Node.js and NSSM installed

setlocal enabledelayedexpansion

echo.
echo === IronBot Windows Service Wrapper - Deployment ===
echo.

REM Check for required tools
echo [1/5] Checking prerequisites...

where /q node
if errorlevel 1 (
    echo ERROR: Node.js not found. Install from https://nodejs.org/
    exit /b 1
)
echo  OK: Node.js installed

where /q nssm
if errorlevel 1 (
    echo ERROR: NSSM not found. Install from https://nssm.cc/download
    exit /b 1
)
echo  OK: NSSM installed

REM Check admin privileges
echo Checking administrator privileges...
net session >nul 2>&1
if errorlevel 1 (
    echo ERROR: This script must run as Administrator
    echo  Right-click and select "Run as Administrator"
    exit /b 1
)
echo  OK: Running as Administrator

REM Check environment variables
echo Checking environment variables...
if not defined SLACK_BOT_TOKEN (
    echo WARNING: SLACK_BOT_TOKEN not set
)
if not defined ANTHROPIC_API_KEY (
    echo WARNING: ANTHROPIC_API_KEY not set
)

echo.
echo [2/5] Building project...
call bun run build
if errorlevel 1 (
    echo ERROR: Build failed
    exit /b 1
)
echo  OK: Build complete

echo.
echo [3/5] Installing Windows service...
echo Command: bun dist/main.js windows-service install
call bun dist/main.js windows-service install
if errorlevel 1 (
    echo ERROR: Service installation failed
    exit /b 1
)
echo  OK: Service installed

echo.
echo [4/5] Verifying service...
call bun dist/main.js windows-service status
if errorlevel 1 (
    echo WARNING: Could not verify service status
)

echo.
echo [5/5] Displaying logs...
call bun dist/main.js windows-service logs --lines 10
echo.

echo === Deployment Complete ===
echo.
echo Next steps:
echo   1. Verify service in Services.msc:
echo      - Press Win+R, type "services.msc", press Enter
echo      - Look for "IronBot" service
echo.
echo   2. Start the service:
echo      bun dist/main.js windows-service start
echo.
echo   3. Check logs:
echo      bun dist/main.js windows-service logs
echo.
echo   4. Stop the service:
echo      bun dist/main.js windows-service stop
echo.

exit /b 0
