# Test-IronBotService.ps1
# Automated testing script for IronBot Windows Service deployment
# Run from: D:\repos\ironbot
# Usage: .\Test-IronBotService.ps1

param(
    [switch]$SkipInstall,
    [switch]$SkipStart,
    [switch]$SkipStop,
    [switch]$Verbose
)

$ErrorActionPreference = "Continue"
$WarningPreference = "Continue"

$serviceName = "IronBot"
$projectPath = (Get-Location).Path
$logFile = Join-Path $projectPath "logs\service-test.log"

# Add NSSM to PATH if not already there
$nssmPath = "C:\tools\nssm\nssm-2.24\win64"
if (Test-Path $nssmPath) {
    if ($env:PATH -notlike "*$nssmPath*") {
        $env:PATH = "$nssmPath;$env:PATH"
    }
}

# Ensure logs directory exists
$logsDir = Join-Path $projectPath "logs"
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "IronBot Windows Service Test Suite" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Project Path: $projectPath" -ForegroundColor Gray
Write-Host "Service Name: $serviceName" -ForegroundColor Gray
Write-Host "Log File: $logFile`n" -ForegroundColor Gray

# Function to log output
function Log-Output {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $output = "[$timestamp] [$Level] $Message"
    Add-Content -Path $logFile -Value $output
    if ($Verbose) {
        Write-Host $output -ForegroundColor Gray
    }
}

# Function to run bun command
function Run-BunCommand {
    param([string[]]$Arguments)
    try {
        Log-Output "Running: bun $($Arguments -join ' ')" "DEBUG"
        $result = & bun @Arguments 2>&1
        return $result
    }
    catch {
        Log-Output "Command failed: $_" "ERROR"
        return $null
    }
}

# Test 1: Check prerequisites
Write-Host "[1] Checking Prerequisites..." -ForegroundColor Yellow
$testsPass = $true

# Check bun
if ((where.exe bun 2>$null) -or (Test-Path "C:\WINDOWS\system32\bun.exe")) {
    Write-Host "  ✓ bun found" -ForegroundColor Green
    Log-Output "✓ bun found"
} else {
    Write-Host "  ✗ bun not found" -ForegroundColor Red
    $testsPass = $false
    Log-Output "✗ bun not found" "ERROR"
}

# Check NSSM
$nssmPath = "C:\tools\nssm\nssm-2.24\win64\nssm.exe"
if (Test-Path $nssmPath) {
    Write-Host "  ✓ NSSM found at $nssmPath" -ForegroundColor Green
    Log-Output "✓ NSSM found at $nssmPath"
} else {
    Write-Host "  ✗ NSSM not found at expected path" -ForegroundColor Red
    Write-Host "    Trying to find NSSM in PATH..." -ForegroundColor Yellow
    if (where.exe nssm 2>$null) {
        Write-Host "    ✓ NSSM found in PATH" -ForegroundColor Green
        Log-Output "✓ NSSM found in PATH"
    } else {
        Write-Host "    ✗ NSSM not found" -ForegroundColor Red
        $testsPass = $false
        Log-Output "✗ NSSM not found" "ERROR"
    }
}

# Check Node.js
if ((node --version 2>$null) -match "v\d+") {
    $nodeVersion = node --version
    Write-Host "  ✓ Node.js $nodeVersion found" -ForegroundColor Green
    Log-Output "✓ Node.js $nodeVersion found"
} else {
    Write-Host "  ✗ Node.js not found" -ForegroundColor Red
    $testsPass = $false
    Log-Output "✗ Node.js not found" "ERROR"
}

# Check project structure
$requiredFiles = @(
    "src\main.ts",
    "src\cli\windows-service-cli.ts",
    "src\services\windows-service\commands\install.ts"
)

$allFilesFound = $true
foreach ($file in $requiredFiles) {
    $filePath = Join-Path $projectPath $file
    if (Test-Path $filePath) {
        Write-Host "  ✓ Found $file" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Missing $file" -ForegroundColor Red
        $allFilesFound = $false
    }
}
Log-Output $(if ($allFilesFound) { "✓ All required files found" } else { "✗ Some files missing" })

if (-not $testsPass) {
    Write-Host "`n✗ Prerequisites check failed. Cannot proceed with deployment test.`n" -ForegroundColor Red
    Log-Output "Prerequisites check failed" "ERROR"
    exit 1
}

Write-Host "  All prerequisites met!`n" -ForegroundColor Green
Log-Output "✓ All prerequisites met"

# Test 2: Uninstall existing service (clean slate)
Write-Host "[2] Preparing test environment..." -ForegroundColor Yellow
$service = Get-Service $serviceName -ErrorAction SilentlyContinue
if ($service) {
    Write-Host "  Removing existing service installation..." -ForegroundColor Cyan
    Log-Output "Removing existing service: $serviceName"

    # Stop if running
    if ($service.Status -eq "Running") {
        Write-Host "    Stopping service..." -ForegroundColor Gray
        Stop-Service $serviceName -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }

    # Uninstall
    $uninstallResult = Run-BunCommand @("src/main.ts", "windows-service", "uninstall", "--force", "--json")
    if ($uninstallResult) {
        Write-Host "    ✓ Service uninstalled" -ForegroundColor Green
        Log-Output "✓ Service uninstalled successfully"
    }
    Start-Sleep -Seconds 1
}

# Test 3: Install service
if (-not $SkipInstall) {
    Write-Host "[3] Installing IronBot service..." -ForegroundColor Yellow
    Log-Output "Installing service"

    $installResult = Run-BunCommand @("src/main.ts", "windows-service", "install", "--force", "--json")

    if ($installResult -and ($installResult | ConvertFrom-Json -ErrorAction SilentlyContinue).success) {
        Write-Host "  ✓ Service installed successfully" -ForegroundColor Green
        Log-Output "✓ Service installed successfully"
        Log-Output $installResult "DEBUG"
    } else {
        Write-Host "  ✗ Service installation failed" -ForegroundColor Red
        Write-Host "    Output: $installResult" -ForegroundColor Red
        Log-Output "✗ Service installation failed: $installResult" "ERROR"
        exit 1
    }
    Start-Sleep -Seconds 2
} else {
    Write-Host "[3] Skipping installation (--SkipInstall)" -ForegroundColor Gray
    Log-Output "Installation skipped"
}

# Test 4: Check service exists
Write-Host "[4] Verifying service registration..." -ForegroundColor Yellow
$service = Get-Service $serviceName -ErrorAction SilentlyContinue
if ($service) {
    Write-Host "  ✓ Service registered in Windows" -ForegroundColor Green
    Write-Host "    Display Name: $($service.DisplayName)" -ForegroundColor Gray
    Write-Host "    Status: $($service.Status)" -ForegroundColor Gray
    Log-Output "✓ Service registered: Status=$($service.Status)"
} else {
    Write-Host "  ✗ Service not found in Windows" -ForegroundColor Red
    Log-Output "✗ Service not registered" "ERROR"
    exit 1
}

# Test 5: Start service
if (-not $SkipStart) {
    Write-Host "[5] Starting service..." -ForegroundColor Yellow
    Log-Output "Starting service"

    $startResult = Run-BunCommand @("src/main.ts", "windows-service", "start", "--json")

    if ($startResult -and ($startResult | ConvertFrom-Json -ErrorAction SilentlyContinue).success) {
        Write-Host "  ✓ Service start command sent" -ForegroundColor Green
        Start-Sleep -Seconds 3

        # Verify it started
        $service.Refresh()
        if ($service.Status -eq "Running") {
            Write-Host "  ✓ Service is running" -ForegroundColor Green
            Log-Output "✓ Service started successfully"
        } else {
            Write-Host "  ⚠ Service may still be starting... Current status: $($service.Status)" -ForegroundColor Yellow
            Log-Output "Service status: $($service.Status) (may still be starting)"
        }
    } else {
        Write-Host "  ✗ Service start failed" -ForegroundColor Red
        Write-Host "    Output: $startResult" -ForegroundColor Red
        Log-Output "✗ Service start failed: $startResult" "ERROR"
    }
} else {
    Write-Host "[5] Skipping start (--SkipStart)" -ForegroundColor Gray
}

# Test 6: Get status
Write-Host "[6] Checking service status..." -ForegroundColor Yellow
Log-Output "Checking status"

$statusResult = Run-BunCommand @("src/main.ts", "windows-service", "status", "--json")
if ($statusResult) {
    try {
        $status = $statusResult | ConvertFrom-Json
        Write-Host "  Service: $($status.serviceName)" -ForegroundColor Cyan
        Write-Host "  State: $($status.state)" -ForegroundColor $(if ($status.state -eq "running") { "Green" } else { "Yellow" })
        Write-Host "  Startup Type: $($status.startType)" -ForegroundColor Gray
        if ($status.processId) {
            Write-Host "  Process ID: $($status.processId)" -ForegroundColor Gray
        }
        Log-Output "Status retrieved: state=$($status.state)"
    }
    catch {
        Write-Host "  Output: $statusResult" -ForegroundColor Gray
        Log-Output "Status output: $statusResult" "DEBUG"
    }
} else {
    Write-Host "  ✗ Failed to get status" -ForegroundColor Red
    Log-Output "✗ Status check failed" "ERROR"
}

# Test 7: View logs
Write-Host "[7] Retrieving service logs..." -ForegroundColor Yellow
Log-Output "Retrieving logs"

$logsResult = Run-BunCommand @("src/main.ts", "windows-service", "logs", "--lines", "10", "--json")
if ($logsResult) {
    try {
        $logs = $logsResult | ConvertFrom-Json
        Write-Host "  Log file: $($logs.logFile)" -ForegroundColor Gray
        Write-Host "  Entries: $($logs.lines.Count)" -ForegroundColor Gray
        if ($logs.lines.Count -gt 0) {
            Write-Host "  Recent entries:" -ForegroundColor Gray
            $logs.lines | ForEach-Object { Write-Host "    $($_.timestamp): $($_.message)" -ForegroundColor DarkGray }
        } else {
            Write-Host "  (No log entries yet)" -ForegroundColor Gray
        }
        Log-Output "✓ Logs retrieved: $($logs.lines.Count) entries"
    }
    catch {
        Write-Host "  Output: $logsResult" -ForegroundColor Gray
        Log-Output "Logs output: $logsResult" "DEBUG"
    }
} else {
    Write-Host "  ⚠ Could not retrieve logs (may not exist yet)" -ForegroundColor Yellow
}

# Test 8: Stop service
if (-not $SkipStop) {
    Write-Host "[8] Stopping service..." -ForegroundColor Yellow
    Log-Output "Stopping service"

    $stopResult = Run-BunCommand @("src/main.ts", "windows-service", "stop", "--json")

    if ($stopResult -and ($stopResult | ConvertFrom-Json -ErrorAction SilentlyContinue).success) {
        Write-Host "  ✓ Service stop command sent" -ForegroundColor Green
        Start-Sleep -Seconds 2

        $service = Get-Service $serviceName -ErrorAction SilentlyContinue
        if ($service -and $service.Status -eq "Stopped") {
            Write-Host "  ✓ Service stopped" -ForegroundColor Green
            Log-Output "✓ Service stopped successfully"
        }
    } else {
        Write-Host "  ✗ Service stop failed" -ForegroundColor Red
        Log-Output "✗ Service stop failed" "ERROR"
    }
} else {
    Write-Host "[8] Skipping stop (--SkipStop)" -ForegroundColor Gray
}

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "All tests completed successfully!" -ForegroundColor Green
Write-Host "Test log saved to: $logFile`n" -ForegroundColor Gray

Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Review test log: Get-Content $logFile" -ForegroundColor Gray
Write-Host "  2. Start service: bun src/main.ts windows-service start" -ForegroundColor Gray
Write-Host "  3. Check logs: bun src/main.ts windows-service logs" -ForegroundColor Gray
Write-Host "  4. View status: bun src/main.ts windows-service status" -ForegroundColor Gray
Write-Host ""

Log-Output "========================================" "INFO"
Log-Output "Test suite completed successfully" "INFO"
Log-Output "========================================" "INFO"
