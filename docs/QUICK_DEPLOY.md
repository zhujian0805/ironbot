# Quick Deploy - Windows Service Wrapper

## 30-Second Setup

```powershell
# 1. Install prerequisites on Windows
winget install OpenJS.NodeJS       # Node.js 20 LTS
# Download NSSM from https://nssm.cc/download and extract to C:\Program Files\nssm\

# 2. Set environment variables (run as Administrator)
[System.Environment]::SetEnvironmentVariable("SLACK_BOT_TOKEN", "xoxb-...", "User")
[System.Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", "sk-...", "User")

# 3. Deploy from project root
cd C:\path\to\ironbot
ironbot-service install

# 4. Verify
ironbot-service status
```

## Full Deployment (5 steps)

### Step 1: Install Dependencies
```powershell
# Node.js 20 LTS
winget install OpenJS.NodeJS
node --version  # v20.x.x

# NSSM
# Download: https://nssm.cc/download
# Extract to: C:\Program Files\nssm\
nssm --version
```

### Step 2: Set Environment Variables
```powershell
# Run as Administrator
$token = "xoxb-your-slack-bot-token"
$apikey = "sk-your-anthropic-key"

[System.Environment]::SetEnvironmentVariable("SLACK_BOT_TOKEN", $token, "User")
[System.Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", $apikey, "User")

# Verify
Get-ChildItem env: | grep -i "SLACK\|ANTHROPIC"
```

### Step 3: Verify Pre-Deployment
```powershell
cd C:\path\to\ironbot
.\PreDeploymentChecklist.ps1
```

Should see: `✓ System is ready for Windows Service Wrapper deployment!`

### Step 4: Install Service
```powershell
ironbot-service install

# Expected output:
# ✓ Service Installation Successful
# Service 'IronBot' installed successfully.
```

### Step 5: Start & Verify
```powershell
ironbot-service start
ironbot-service status

# Expected:
# Status: RUNNING
# PID: xxxxx
# Uptime: 0h 0m xs
```

## View Logs
```powershell
ironbot-service logs              # Last 50 lines
ironbot-service logs --lines 100  # More lines
ironbot-service logs --level error # Errors only
```

## Troubleshooting

### Service won't start?
```powershell
# Check admin rights
$admin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
Write-Host "Admin: $admin"

# Check env vars
Get-ChildItem env: | Where-Object {$_.Name -match "SLACK|ANTHROPIC"}

# Check logs
ironbot-service logs --level error
```

### NSSM not found?
```powershell
$env:Path += ";C:\Program Files\nssm\"
nssm --version
```

## Verify Deployment

```powershell
# Check service exists
Get-Service | Where-Object {$_.Name -eq "IronBot"}

# Check service is running
ironbot-service status | Select-Object Status

# Check logs exist
Get-ChildItem C:\path\to\ironbot\logs\service.log
```

## Commands

```powershell
ironbot-service start              # Start
ironbot-service stop               # Stop
ironbot-service restart            # Restart
ironbot-service status             # Status
ironbot-service logs               # Logs
ironbot-service uninstall --force  # Uninstall
```

## Success = All Green ✅

- [x] Node.js installed
- [x] NSSM installed
- [x] Environment variables set
- [x] PreDeploymentChecklist passes
- [x] Service installs
- [x] Service runs
- [x] Can start/stop/restart
- [x] Can view logs
