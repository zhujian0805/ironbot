# Windows Service Wrapper - Deployment & Testing Guide

## Quick Start (5 minutes)

### Prerequisites Check
```powershell
# Run this in PowerShell as Administrator
cd C:\path\to\ironbot
.\PreDeploymentChecklist.ps1
```

This will verify:
- ✅ NSSM is installed
- ✅ Administrator privileges
- ✅ Node.js 20+ installed
- ✅ Project structure is valid
- ✅ Environment variables are set
- ✅ Service name is available

---

## Step-by-Step Deployment

### Step 1: Ensure Prerequisites (10 minutes)

**Install Node.js 20 LTS:**
```powershell
# If not already installed
# Download from https://nodejs.org/ (20 LTS)
# Or use Winget:
winget install OpenJS.NodeJS
node --version  # Should be v20.x.x
```

**Install NSSM:**
```powershell
# Option A: Using Scoop
scoop install nssm

# Option B: Download manually from https://nssm.cc/download
# Extract to C:\Program Files\nssm\
# Add to PATH

# Verify installation
nssm --version
```

**Add to System PATH (if not in PATH):**
```powershell
# If NSSM is not in PATH, add it
$env:Path += ";C:\Program Files\nssm\"

# Or set permanently in Environment Variables
```

### Step 2: Configure Environment Variables

Set these in your Windows environment (System Properties → Environment Variables):

```powershell
# Open as Administrator
[System.Environment]::SetEnvironmentVariable("SLACK_BOT_TOKEN", "xoxb-your-token", [System.EnvironmentVariableTarget]::User)
[System.Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", "sk-your-key", [System.EnvironmentVariableTarget]::User)

# Or set them in PowerShell (current session only - for testing)
$env:SLACK_BOT_TOKEN = "xoxb-your-token"
$env:ANTHROPIC_API_KEY = "sk-your-key"
```

### Step 3: Run Pre-Deployment Checklist

```powershell
# Must run as Administrator
cd C:\path\to\ironbot
powershell -ExecutionPolicy Bypass -File .\PreDeploymentChecklist.ps1
```

Expected output:
```
=== IronBot Windows Service Wrapper - Pre-Deployment Checklist ===

[1/7] Checking NSSM Installation...
✓ NSSM installed: v2.24.101 2018-01-28

[2/7] Checking Administrator Privileges...
✓ Running as Administrator

[3/7] Checking Node.js Installation...
✓ Node.js installed: v20.10.0

[4/7] Checking Bun Installation (Optional)...
⚠ Bun not installed (optional)

[5/7] Checking Project Structure...
✓ Project structure valid

[6/7] Checking Environment Variables...
✓ All required environment variables set

[7/7] Checking Service Name Availability...
✓ Service name 'IronBot' available

=== Deployment Checklist Summary ===
✓ System is ready for Windows Service Wrapper deployment!
```

---

## Installation & Testing

### Test 1: Basic Installation (2 minutes)

```powershell
# From project root
cd C:\path\to\ironbot

# Install service with default settings
ironbot-service install

# Expected output:
# ✓ Service Installation Successful
# Service 'IronBot' installed successfully.
```

**Verify in Services:**
```powershell
# Check Windows Services
Get-Service | Where-Object {$_.Name -eq "IronBot"}

# Or view in Services.msc:
services.msc
# Look for "IronBot" - Status should be "Stopped"
```

### Test 2: Start Service (2 minutes)

```powershell
# Start the service
ironbot-service start

# Check status
ironbot-service status

# Expected output:
# Service: IronBot
# Status: RUNNING
# PID: 12345
# Uptime: 0h 0m 5s
```

**Verify Running:**
```powershell
# Check process
Get-Process | Where-Object {$_.Name -eq "node"}

# Or view in Task Manager:
taskmgr
# Look for node.exe in Processes tab
```

### Test 3: View Logs (2 minutes)

```powershell
# View last 50 lines
ironbot-service logs

# View last 100 lines
ironbot-service logs --lines 100

# Filter by level
ironbot-service logs --level error

# View last hour
ironbot-service logs --since 1h

# Get JSON output
ironbot-service logs --json

# Expected output:
# Service: IronBot
# Log file: C:\path\to\ironbot\logs\service.log
#
# --- Last 50 log entries ---
#
# [2026-02-12T...] INFO  : Service started
# [2026-02-12T...] DEBUG : Connecting to Slack...
# ...
```

### Test 4: Stop Service (1 minute)

```powershell
# Stop the service
ironbot-service stop

# Check status
ironbot-service status

# Expected output:
# Service: IronBot
# Status: STOPPED
```

### Test 5: Restart Service (2 minutes)

```powershell
# Restart gracefully
ironbot-service restart

# Wait 2 seconds for startup
Start-Sleep -Seconds 2

# Check status
ironbot-service status

# Expected output:
# Service: IronBot
# Status: RUNNING
# PID: 54321 (different PID)
# Uptime: 0h 0m 2s
```

### Test 6: Advanced Commands (5 minutes)

```powershell
# Get JSON output
ironbot-service status --json

# Get combined logs with filters
ironbot-service logs --lines 100 --level warn --since 30m --json

# Custom service name
ironbot-service install --service-name IronBot-Test --force

# Custom user
ironbot-service install --service-name IronBot-User --username jzhu --force

# Manual startup (no auto-start)
ironbot-service install --service-name IronBot-Manual --startup-type manual --force

# View multiple instances
ironbot-service status IronBot
ironbot-service status IronBot-Test
ironbot-service status IronBot-User
```

---

## Full Testing Scenario (15 minutes)

### Scenario: Complete Lifecycle Test

```powershell
# Step 1: Pre-check
.\PreDeploymentChecklist.ps1
# Result: ✓ System is ready

# Step 2: Install
ironbot-service install
# Result: ✓ Service installed

# Step 3: Verify installed
Get-Service IronBot
# Result: Status = Stopped

# Step 4: Start
ironbot-service start
# Result: ✓ Service started

# Step 5: Verify running
ironbot-service status
# Result: Status = RUNNING

# Step 6: Check logs
ironbot-service logs --lines 20
# Result: Shows startup logs

# Step 7: Monitor for 30 seconds
while ($true) {
    Clear-Host
    ironbot-service status
    Start-Sleep -Seconds 5
}
# Ctrl+C to stop monitoring

# Step 8: Stop gracefully
ironbot-service stop
# Result: Status = STOPPED

# Step 9: Restart
ironbot-service restart
# Result: Running with new PID

# Step 10: Uninstall
ironbot-service uninstall --force
# Result: ✓ Service uninstalled

# Step 11: Verify removed
Get-Service IronBot -ErrorAction SilentlyContinue
# Result: Service not found
```

---

## Boot Auto-Start Testing (Requires Reboot)

### Test Auto-Start on Boot

```powershell
# Step 1: Install with auto-start (default)
ironbot-service install

# Step 2: Verify startup type is 'auto'
Get-Service IronBot | Select-Object Name, StartType
# Result: StartType = Automatic

# Step 3: Reboot the system
Restart-Computer -Force

# Step 4: After reboot, check if service started automatically
# Open PowerShell (no admin needed for check)
Get-Service IronBot | Select-Object Name, Status

# Step 5: Check logs for startup
ironbot-service logs --since 5m

# Expected: Service should be RUNNING after reboot
```

---

## Troubleshooting Tests

### Test: Check Logs for Errors

```powershell
# View only errors
ironbot-service logs --level error

# View last 500 lines
ironbot-service logs --lines 500

# View as JSON for parsing
$logs = ironbot-service logs --json | ConvertFrom-Json
$logs.lines | Where-Object {$_.level -eq "error"}

# Check the actual log file
Get-Content C:\path\to\ironbot\logs\service.log -Tail 50
```

### Test: Service Won't Start

```powershell
# 1. Check admin privileges
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
Write-Host "Admin: $isAdmin"

# 2. Check environment variables
Get-ChildItem env: | Where-Object {$_.Name -match "SLACK|ANTHROPIC"}

# 3. Check working directory exists
Test-Path "C:\path\to\ironbot"

# 4. Check logs
ironbot-service logs --level error

# 5. Try starting manually
node C:\path\to\ironbot\src\main.ts
```

### Test: NSSM Not Found

```powershell
# Check if NSSM is in PATH
where.exe nssm

# If not found, add to PATH:
$env:Path += ";C:\Program Files\nssm\"

# Verify
nssm --version
```

### Test: User Account Issues

```powershell
# Check current user
whoami

# Check if service user exists
Get-LocalUser | Where-Object {$_.Name -eq "jzhu"}

# Get user account info
net user jzhu

# Create test user (if needed)
net user testuser password /add
```

---

## Performance Testing

### Monitor Service Resource Usage

```powershell
# Real-time monitoring
while ($true) {
    Clear-Host
    Write-Host "=== IronBot Service Monitoring ===" (Get-Date)
    Write-Host ""

    # Get service info
    $svc = Get-Service IronBot
    Write-Host "Status: $($svc.Status)"

    # Get process info
    $proc = Get-Process | Where-Object {$_.Name -eq "node"}
    if ($proc) {
        Write-Host "PID: $($proc.Id)"
        Write-Host "CPU: $($proc.CPU) seconds"
        Write-Host "Memory: $([Math]::Round($proc.WorkingSet / 1MB, 2)) MB"
        Write-Host "Threads: $($proc.Threads.Count)"
    }

    # Check logs
    Write-Host ""
    Write-Host "Recent log entries:"
    ironbot-service logs --lines 5

    Write-Host ""
    Write-Host "Refreshing in 10 seconds... (Ctrl+C to stop)"
    Start-Sleep -Seconds 10
}
```

### Stress Test

```powershell
# Monitor while generating load
# (In a separate PowerShell window)

while ($true) {
    # Simulate activity
    ironbot-service logs > $null
    ironbot-service status > $null
    Start-Sleep -Milliseconds 100
}

# In main window, monitor resource usage
# (use monitoring script above)
```

---

## Rollback / Uninstall

### Remove Service

```powershell
# Graceful uninstall (asks for confirmation)
ironbot-service uninstall

# Force uninstall (no confirmation)
ironbot-service uninstall --force

# Verify removed
Get-Service IronBot -ErrorAction SilentlyContinue
# Result: Service not found (as expected)

# Check logs were preserved
Get-ChildItem C:\path\to\ironbot\logs\
# Logs remain for troubleshooting
```

---

## Testing Checklist

Use this to track your testing:

```powershell
# Test Checklist
$tests = @(
    "Pre-deployment checklist passes"
    "Service installs successfully"
    "Service appears in Services.msc"
    "Service starts successfully"
    "Service status shows 'RUNNING'"
    "Logs can be read"
    "Service can be stopped"
    "Service can be restarted"
    "Service can be uninstalled"
    "Environment variables are accessible"
    "Working directory is correct"
    "Service auto-restarts on crash"
    "Service auto-starts on boot"
    "Logs are written to correct location"
    "JSON output format works"
)

$tests | ForEach-Object {
    Write-Host "[ ] $_"
}
```

---

## Quick Reference Commands

```powershell
# Installation
ironbot-service install

# Service Control
ironbot-service start
ironbot-service stop
ironbot-service restart
ironbot-service status

# Logs
ironbot-service logs
ironbot-service logs --lines 100
ironbot-service logs --level error
ironbot-service logs --since 1h
ironbot-service logs --json

# Uninstall
ironbot-service uninstall --force

# Multiple instances
ironbot-service install --service-name IronBot-1
ironbot-service install --service-name IronBot-2
ironbot-service status IronBot-1
ironbot-service status IronBot-2

# Help
ironbot-service --help
ironbot-service install --help
```

---

## Expected Test Results

### Successful Installation
```
✓ Service Installation Successful
  Service 'IronBot' installed successfully.
```

### Successful Start
```
Service: IronBot
Status: RUNNING
PID: 12345
Uptime: 0h 1m 23s
Last started: 2026-02-12T14:30:00Z
Startup type: auto
```

### Successful Logs
```
Service: IronBot
Log file: C:\path\to\ironbot\logs\service.log

--- Last 50 log entries ---

[2026-02-12T14:30:00.123Z] INFO  : Service started
[2026-02-12T14:30:01.456Z] DEBUG : Connecting to Slack...
[2026-02-12T14:30:02.789Z] INFO  : Connected to Slack
```

---

## Support Resources

- **Quick Reference**: WINDOWS_SERVICE_QUICK_REFERENCE.md
- **Operator Manual**: WINDOWS_SERVICE_OPERATOR_MANUAL.md
- **Pre-Deployment**: Run PreDeploymentChecklist.ps1
- **NSSM Docs**: https://nssm.cc/usage
- **Windows Services**: https://docs.microsoft.com/windows/win32/services/

---

## Next Steps

1. **Prepare System** - Install Node.js 20 LTS and NSSM
2. **Set Environment Variables** - Add SLACK_BOT_TOKEN and ANTHROPIC_API_KEY
3. **Run Checklist** - Execute PreDeploymentChecklist.ps1
4. **Install Service** - Run ironbot-service install
5. **Test Lifecycle** - Start, stop, restart, view logs
6. **Test Auto-Start** - Reboot and verify service starts automatically
7. **Monitor** - Check logs and resource usage
8. **Troubleshoot** - Use logs to diagnose any issues

---

**Time Estimate**: 20-30 minutes for full testing
**Success Criteria**: All 7 tests pass ✅
**Production Ready**: After successful testing

Good luck! 🚀
