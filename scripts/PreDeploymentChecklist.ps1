#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Windows Service Wrapper for IronBot - Deployment Checklist
.DESCRIPTION
    Pre-deployment checklist and verification script for Windows Service Wrapper
.EXAMPLE
    .\PreDeploymentChecklist.ps1
#>

param(
    [Switch]$Verbose
)

Write-Host "`n=== IronBot Windows Service Wrapper - Pre-Deployment Checklist ===" -ForegroundColor Cyan

$checks = @()
$allPassed = $true

# Check 1: NSSM Installation
Write-Host "`n[1/7] Checking NSSM Installation..." -ForegroundColor Yellow
try {
    $nssmVersion = nssm --version 2>$null
    if ($nssmVersion) {
        Write-Host "✓ NSSM installed: $nssmVersion" -ForegroundColor Green
        $checks += @{Name = "NSSM Installation"; Status = "PASS" }
    } else {
        Write-Host "✗ NSSM not found in PATH" -ForegroundColor Red
        Write-Host "  Install NSSM from: https://nssm.cc/download" -ForegroundColor Yellow
        $checks += @{Name = "NSSM Installation"; Status = "FAIL" }
        $allPassed = $false
    }
}
catch {
    Write-Host "✗ NSSM check failed: $_" -ForegroundColor Red
    $checks += @{Name = "NSSM Installation"; Status = "FAIL" }
    $allPassed = $false
}

# Check 2: Administrator Privileges
Write-Host "`n[2/7] Checking Administrator Privileges..." -ForegroundColor Yellow
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
if ($isAdmin) {
    Write-Host "✓ Running as Administrator" -ForegroundColor Green
    $checks += @{Name = "Administrator Privileges"; Status = "PASS" }
} else {
    Write-Host "✗ Not running as Administrator" -ForegroundColor Red
    Write-Host "  Service installation requires Administrator privileges" -ForegroundColor Yellow
    $checks += @{Name = "Administrator Privileges"; Status = "FAIL" }
    $allPassed = $false
}

# Check 3: Node.js Installation
Write-Host "`n[3/7] Checking Node.js Installation..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js installed: $nodeVersion" -ForegroundColor Green
    $checks += @{Name = "Node.js Installation"; Status = "PASS" }
} catch {
    Write-Host "✗ Node.js not found" -ForegroundColor Red
    Write-Host "  Install Node.js 20 LTS from: https://nodejs.org/" -ForegroundColor Yellow
    $checks += @{Name = "Node.js Installation"; Status = "FAIL" }
    $allPassed = $false
}

# Check 4: Bun Installation (Optional)
Write-Host "`n[4/7] Checking Bun Installation (Optional)..." -ForegroundColor Yellow
try {
    $bunVersion = bun --version 2>$null
    if ($bunVersion) {
        Write-Host "✓ Bun installed: $bunVersion" -ForegroundColor Green
        $checks += @{Name = "Bun Installation"; Status = "PASS (Optional)" }
    } else {
        Write-Host "⚠ Bun not installed (optional, for better performance)" -ForegroundColor Yellow
        $checks += @{Name = "Bun Installation"; Status = "OPTIONAL" }
    }
} catch {
    Write-Host "⚠ Bun not installed (optional)" -ForegroundColor Yellow
    $checks += @{Name = "Bun Installation"; Status = "OPTIONAL" }
}

# Check 5: Project Structure
Write-Host "`n[5/7] Checking Project Structure..." -ForegroundColor Yellow
$projectValid = Test-Path "package.json" -and `
                Test-Path "src" -and `
                Test-Path "tsconfig.json"
if ($projectValid) {
    Write-Host "✓ Project structure valid" -ForegroundColor Green
    $checks += @{Name = "Project Structure"; Status = "PASS" }
} else {
    Write-Host "✗ Invalid project structure" -ForegroundColor Red
    Write-Host "  Missing: package.json, src/, or tsconfig.json" -ForegroundColor Yellow
    $checks += @{Name = "Project Structure"; Status = "FAIL" }
    $allPassed = $false
}

# Check 6: Environment Variables
Write-Host "`n[6/7] Checking Environment Variables..." -ForegroundColor Yellow
$envVars = @("SLACK_BOT_TOKEN", "ANTHROPIC_API_KEY")
$missingVars = @()
foreach ($var in $envVars) {
    if (-not (Test-Path env:$var)) {
        $missingVars += $var
    }
}

if ($missingVars.Count -eq 0) {
    Write-Host "✓ All required environment variables set" -ForegroundColor Green
    $checks += @{Name = "Environment Variables"; Status = "PASS" }
} else {
    Write-Host "⚠ Missing environment variables: $($missingVars -join ', ')" -ForegroundColor Yellow
    Write-Host "  These will be required at service runtime" -ForegroundColor Yellow
    $checks += @{Name = "Environment Variables"; Status = "WARN" }
}

# Check 7: Service Name Availability
Write-Host "`n[7/7] Checking Service Name Availability..." -ForegroundColor Yellow
$serviceName = "IronBot"
$serviceExists = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($serviceExists) {
    Write-Host "⚠ Service '$serviceName' already exists" -ForegroundColor Yellow
    Write-Host "  Use: ironbot-service install --service-name MyService --force" -ForegroundColor Yellow
    $checks += @{Name = "Service Availability"; Status = "WARN" }
} else {
    Write-Host "✓ Service name '$serviceName' available" -ForegroundColor Green
    $checks += @{Name = "Service Availability"; Status = "PASS" }
}

# Summary
Write-Host "`n=== Deployment Checklist Summary ===" -ForegroundColor Cyan
$checks | Format-Table -AutoSize

if ($allPassed) {
    Write-Host "`n✓ System is ready for Windows Service Wrapper deployment!" -ForegroundColor Green
    Write-Host "`nNext steps:" -ForegroundColor Cyan
    Write-Host "  1. Review environment variables are set correctly"
    Write-Host "  2. Run: ironbot-service install"
    Write-Host "  3. Verify: ironbot-service status"
    Write-Host "  4. View logs: ironbot-service logs`n"
    exit 0
} else {
    Write-Host "`n✗ System is NOT ready for deployment" -ForegroundColor Red
    Write-Host "`nPlease resolve the issues above and run this script again.`n" -ForegroundColor Yellow
    exit 1
}
