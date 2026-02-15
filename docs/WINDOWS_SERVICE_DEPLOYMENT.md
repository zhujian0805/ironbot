# IronBot Windows Service Deployment Guide

**Status**: Ready for immediate deployment using source-run approach
**Last Updated**: 2026-02-12
**Build Note**: `bun build` bundler has module resolution issues. Use `bun src/main.ts` to run commands directly from source.

## Quick Summary

The IronBot Windows service wrapper using NSSM is fully implemented and ready to deploy. Due to bundler configuration issues, we run CLI commands directly from TypeScript source rather than from a pre-built distribution.

**All implementation complete:**
- ✅ NSSM wrapper for service lifecycle management
- ✅ CLI commands: install, uninstall, start, stop, restart, status, logs
- ✅ Service configuration with user context and working directory support
- ✅ Environment variable validation
- ✅ Comprehensive error handling and logging
- ✅ Unit and integration tests (46 test tasks completed)
- ✅ Operator documentation and quick reference guides

## Prerequisites Verification

Before deploying, verify your environment:

```powershell
# Check bun installation
where bun
# Expected output: C:\WINDOWS\system32\bun (or similar)

# Check NSSM installation
dir C:\tools\nssm\nssm-2.24\win64\nssm.exe
# Expected: File exists

# Check Node.js / npm (bun uses Node.js under the hood)
node --version
# Expected: v20.x or later

# Verify you're in the IronBot project directory
pwd
# Expected: D:\repos\ironbot
```

## Deployment Steps

### Step 1: Verify Project Structure

```powershell
# Navigate to project root
cd D:\repos\ironbot

# Verify key service files exist
test-path src\services\windows-service\commands\install.ts
test-path src\cli\windows-service-cli.ts
test-path src\main.ts
```

### Step 2: Install IronBot as a Windows Service

This command will:
- Register the service with NSSM using the current user (jzhu)
- Set the working directory to your project folder
- Configure logging to logs/service.log
- Enable auto-restart on failure
- Configure auto-start on boot

```powershell
# Run installation from source
bun src/main.ts windows-service install --force --json

# Output should show:
# {
#   "success": true,
#   "serviceName": "IronBot",
#   "message": "Service 'IronBot' installed successfully...",
#   ...
# }
```

**If you get an error about NSSM not found:**
```powershell
# Add NSSM to PATH temporarily
$env:PATH = "C:\tools\nssm\nssm-2.24\win64;$env:PATH"

# Then retry the install command above
bun src/main.ts windows-service install --force --json
```

### Step 3: Start the Service

```powershell
# Start the service
bun src/main.ts windows-service start

# Expected output:
# ✓ Service 'IronBot' started successfully
```

### Step 4: Check Service Status

```powershell
# Get current status
bun src/main.ts windows-service status

# Expected output should show:
# Service: IronBot
# Status: RUNNING
# Startup type: auto
```

### Step 5: View Service Logs

```powershell
# View last 50 log entries
bun src/main.ts windows-service logs --lines 50

# View logs with JSON output
bun src/main.ts windows-service logs --json

# Filter logs by level (error, warn, info, debug)
bun src/main.ts windows-service logs --level error --lines 100
```

### Step 6: Test Service Control Commands

```powershell
# Stop the service
bun src/main.ts windows-service stop

# Verify it stopped
bun src/main.ts windows-service status

# Restart the service
bun src/main.ts windows-service restart

# Verify it's running again
bun src/main.ts windows-service status --json
```

## Common Operations

### View service configuration
```powershell
# List all services (Windows native)
Get-Service IronBot

# Get detailed NSSM service info
nssm dump IronBot
```

### Change service startup type
```powershell
# Change to manual start (instead of auto)
bun src/main.ts windows-service install --startup-type manual

# Or via NSSM directly
nssm set IronBot Start SERVICE_DEMAND_START
```

### Change working directory
```powershell
# The service uses your project folder as working directory
# To change it, specify a new path during install:
bun src/main.ts windows-service install --force
# (Modify the --service-name or other options as needed)
```

### View service logs on disk
```powershell
# Service logs are written to: D:\repos\ironbot\logs\service.log
# View directly:
Get-Content D:\repos\ironbot\logs\service.log -Tail 50

# Or use PowerShell pipeline to follow logs (similar to tail -f)
Get-Content D:\repos\ironbot\logs\service.log -Wait
```

## Troubleshooting

### Service fails to start

**Check NSSM path:**
```powershell
where nssm
# If not found, add to PATH:
$env:PATH = "C:\tools\nssm\nssm-2.24\win64;$env:PATH"
```

**Check logs:**
```powershell
bun src/main.ts windows-service logs --level error --lines 100
```

**Check service exists:**
```powershell
Get-Service IronBot -ErrorAction SilentlyContinue
# If not found, reinstall:
bun src/main.ts windows-service install --force
```

### Environment variables not accessible

**Verify variables exist:**
```powershell
# Check if SLACK_BOT_TOKEN is set
$env:SLACK_BOT_TOKEN
$env:ANTHROPIC_API_KEY

# Set them if missing (PowerShell session):
$env:SLACK_BOT_TOKEN = "your-token-here"
$env:ANTHROPIC_API_KEY = "your-key-here"

# Or set them permanently in User environment:
[Environment]::SetEnvironmentVariable("SLACK_BOT_TOKEN", "value", "User")
[Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", "value", "User")
```

**Validate during install:**
```powershell
# The install command validates environment access:
bun src/main.ts windows-service install --skip-validation false
```

### Cannot run commands (permission denied)

**Ensure Admin privileges:**
```powershell
# Check if running as admin
[bool](([System.Security.Principal.WindowsIdentity]::GetCurrent()).groups -match "S-1-5-32-544")
# Returns $true if admin, $false otherwise

# If not admin, run PowerShell as Administrator and retry
```

## Uninstalling the Service

```powershell
# Uninstall the service
bun src/main.ts windows-service uninstall --force

# Verify it's removed
Get-Service IronBot -ErrorAction SilentlyContinue
# Should return nothing if successfully uninstalled
```

## Running from Source vs. Built Distribution

**Why we run from source:**

The bundler (`bun build`) encounters module resolution issues when trying to include windows-service modules. Running directly from TypeScript source avoids this:

```powershell
# ✅ RECOMMENDED: Run from source
bun src/main.ts windows-service install

# ❌ DON'T USE: Pre-built (bundler issues)
# bun dist/main.js windows-service install
```

Both invoke the same CLI handler; source-run simply skips the build step.

## Integration with IronBot Application

Once installed, the IronBot service:
- Starts automatically on system boot (auto-start enabled by default)
- Runs under user context: **jzhu** (current user)
- Working directory: **D:\repos\ironbot** (project root)
- Logs to: **D:\repos\ironbot\logs\service.log**
- Loads environment from: User environment variables (SLACK_BOT_TOKEN, ANTHROPIC_API_KEY)

The service runs the full IronBot application including:
- Slack bot via Socket Mode
- Cron scheduler
- CLI interface (for admin commands)

## Next Steps

1. **Run deployment**: Follow Step 1-6 above to install and verify the service
2. **Test functionality**: Use the command examples to test each feature
3. **Monitor logs**: Check logs/service.log regularly for any issues
4. **Documentation**: See WINDOWS_SERVICE_OPERATOR_MANUAL.md for detailed operational procedures

## Support

For issues or questions:
- Check WINDOWS_SERVICE_OPERATOR_MANUAL.md for operational guidance
- See WINDOWS_SERVICE_QUICK_REFERENCE.md for command reference
- Review service logs: `bun src/main.ts windows-service logs --level error`

---

**Important**: Always run commands from `D:\repos\ironbot` directory. If you navigate elsewhere, use absolute paths or adjust the bun command path accordingly.
