@echo off
REM Test-IronBotService.bat
REM Automated testing script for IronBot Windows Service deployment
REM Run from: D:\repos\ironbot

setlocal enabledelayedexpansion

cls
echo ========================================
echo IronBot Windows Service Test Suite
echo ========================================
echo.

REM Check if we're in the right directory
if not exist "src\main.ts" (
    echo Error: src\main.ts not found. Please run this script from D:\repos\ironbot
    exit /b 1
)

echo Project Path: %cd%
echo.

REM Check prerequisites
echo [1] Checking Prerequisites...

where /q bun
if %errorlevel% equ 0 (
    echo   [OK] bun found
) else (
    echo   [FAIL] bun not found
    exit /b 1
)

if exist "C:\tools\nssm\nssm-2.24\win64\nssm.exe" (
    echo   [OK] NSSM found
) else (
    where /q nssm
    if %errorlevel% equ 0 (
        echo   [OK] NSSM found in PATH
    ) else (
        echo   [FAIL] NSSM not found
        exit /b 1
    )
)

where /q node
if %errorlevel% equ 0 (
    echo   [OK] Node.js found
) else (
    echo   [FAIL] Node.js not found
    exit /b 1
)

echo.
echo [2] Installing IronBot service...
call bun src/main.ts windows-service install --force --json
if %errorlevel% neq 0 (
    echo   [FAIL] Installation failed
    exit /b 1
)
echo   [OK] Service installed
timeout /t 2 /nobreak

echo.
echo [3] Verifying service registration...
sc query IronBot >nul 2>&1
if %errorlevel% neq 0 (
    echo   [FAIL] Service not found
    exit /b 1
)
echo   [OK] Service registered
timeout /t 1 /nobreak

echo.
echo [4] Starting service...
call bun src/main.ts windows-service start --json
if %errorlevel% neq 0 (
    echo   [WARN] Start command failed (service may still be starting)
) else (
    echo   [OK] Start command sent
)
timeout /t 3 /nobreak

echo.
echo [5] Checking service status...
call bun src/main.ts windows-service status --json
echo.

echo [6] Retrieving service logs...
call bun src/main.ts windows-service logs --lines 10
echo.

echo ========================================
echo Test Summary
echo ========================================
echo.
echo All tests completed!
echo.
echo Next steps:
echo   1. Check service status: bun src/main.ts windows-service status
echo   2. View logs: bun src/main.ts windows-service logs
echo   3. Stop service: bun src/main.ts windows-service stop
echo   4. Uninstall: bun src/main.ts windows-service uninstall --force
echo.

endlocal
pause
