#!/usr/bin/env powershell
<#
.SYNOPSIS
    Windows Service Wrapper - PowerShell Deployment Script

.DESCRIPTION
    Deploys IronBot as a Windows service using NSSM

.EXAMPLE
    .\DEPLOY.ps1

.NOTES
    Must run as Administrator
#>

param(
    [switch]$Force
)

Write-Host "`n=== IronBot Windows Service Wrapper - Deployment ===" -ForegroundColor Cyan
Write-Host ""

# Check admin privileges
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
if (-not $isAdmin) {
    Write-Host "ERROR: This script must run as Administrator" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}
Write-Host "[1/5] Administrator privileges: OK" -ForegroundColor Green

# Check Node.js
$nodeVersion = node --version 2>$null
if (-not $nodeVersion) {
    Write-Host "ERROR: Node.js not found" -ForegroundColor Red
    Write-Host "Install from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}
Write-Host "[1/5] Node.js: $nodeVersion" -ForegroundColor Green

# Check NSSM
$nssmPath = "C:\tools\nssm\nssm-2.24\win64\nssm.exe"
if (-not (Test-Path $nssmPath)) {
    # Try to find nssm in PATH
    $nssmVersion = nssm --version 2>$null
    if (-not $nssmVersion) {
        Write-Host "ERROR: NSSM not found at $nssmPath" -ForegroundColor Red
        Write-Host "Install from https://nssm.cc/download" -ForegroundColor Yellow
        exit 1
    }
} else {
    # Add NSSM to PATH
    $env:Path += ";C:\tools\nssm\nssm-2.24\win64"
    $nssmVersion = & $nssmPath --version
}
Write-Host "[1/5] NSSM: $nssmVersion" -ForegroundColor Green

# Check environment variables
Write-Host "`n[2/5] Checking environment variables..." -ForegroundColor Yellow
$missingVars = @()
if (-not (Test-Path env:SLACK_BOT_TOKEN)) { $missingVars += "SLACK_BOT_TOKEN" }
if (-not (Test-Path env:ANTHROPIC_API_KEY)) { $missingVars += "ANTHROPIC_API_KEY" }

if ($missingVars.Count -gt 0) {
    Write-Host "WARNING: Missing environment variables: $($missingVars -join ', ')" -ForegroundColor Yellow
    Write-Host "Set them in Windows Environment Variables or before running this script" -ForegroundColor Yellow
}
Write-Host "[2/5] Environment check complete" -ForegroundColor Green

# Build project
Write-Host "`n[3/5] Building project..." -ForegroundColor Yellow
bun run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: Build failed, but continuing with existing dist/main.js" -ForegroundColor Yellow
    # Check if dist/main.js exists
    if (-not (Test-Path "dist/main.js")) {
        Write-Host "ERROR: No dist/main.js found" -ForegroundColor Red
        exit 1
    }
}
Write-Host "[3/5] Build complete (or using existing)" -ForegroundColor Green

# Install service
Write-Host "`n[4/5] Installing Windows service..." -ForegroundColor Yellow
$args = if ($Force) { "windows-service install --force" } else { "windows-service install" }
Write-Host "Command: bun dist/main.js $args" -ForegroundColor Gray
bun dist/main.js $args.Split()
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Service installation failed" -ForegroundColor Red
    exit 1
}
Write-Host "[4/5] Service installed" -ForegroundColor Green

# Verify
Write-Host "`n[5/5] Verifying service..." -ForegroundColor Yellow
bun dist/main.js windows-service status
Write-Host "[5/5] Verification complete" -ForegroundColor Green

# Display logs
Write-Host "`nRecent logs:" -ForegroundColor Cyan
bun dist/main.js windows-service logs --lines 10

Write-Host "`n=== Deployment Complete ===" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "  1. Verify service in Services.msc:" -ForegroundColor Gray
Write-Host "     services.msc" -ForegroundColor White
Write-Host ""
Write-Host "  2. Start the service:" -ForegroundColor Gray
Write-Host "     bun dist/main.js windows-service start" -ForegroundColor White
Write-Host ""
Write-Host "  3. Check logs:" -ForegroundColor Gray
Write-Host "     bun dist/main.js windows-service logs" -ForegroundColor White
Write-Host ""
Write-Host "  4. Stop the service:" -ForegroundColor Gray
Write-Host "     bun dist/main.js windows-service stop" -ForegroundColor White
Write-Host ""

exit 0
