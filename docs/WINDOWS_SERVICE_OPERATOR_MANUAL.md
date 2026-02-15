# Windows Service Wrapper Operator Manual

**Version**: 1.0
**Date**: 2026-02-12
**Platform**: Windows with NSSM (Non-Sucking Service Manager)

---

## Table of Contents

1. [Installation](#installation)
2. [Service Management](#service-management)
3. [Monitoring](#monitoring)
4. [Troubleshooting](#troubleshooting)
5. [Advanced Usage](#advanced-usage)
6. [FAQ](#faq)

---

## Installation

### Prerequisites

Before installing IronBot as a Windows service, ensure:

- ✅ Windows Server 2012 or later (or Windows 10+)
- ✅ NSSM (Non-Sucking Service Manager) installed
- ✅ Node.js 20 LTS or later installed
- ✅ Administrator privileges
- ✅ Required environment variables (SLACK_BOT_TOKEN, ANTHROPIC_API_KEY)

### Installing NSSM

1. Download NSSM from https://nssm.cc/download
2. Extract to a location in your system PATH (e.g., `C:\Program Files\nssm\`)
3. Verify installation:
   ```powershell
   nssm --version
   ```

### Pre-Deployment Checklist

Run the provided deployment checklist script:

```powershell
powershell -ExecutionPolicy Bypass -File PreDeploymentChecklist.ps1
```

This verifies:
- NSSM is installed
- Administrator privileges
- Node.js installation
- Project structure
- Environment variables
- Service availability

### Installing the Service

#### Basic Installation

```bash
ironbot-service install
```

This will:
- Create service with name "IronBot"
- Run under current user account
- Auto-start on Windows boot
- Auto-restart on failure

#### Custom Installation

```bash
ironbot-service install \
  --service-name MyBot \
  --username jzhu \
  --startup-type auto
```

#### Force Reinstall (Replace Existing)

```bash
ironbot-service install --force
```

#### Skip Validation Checks

```bash
ironbot-service install --skip-validation
```

#### JSON Output (For Scripting)

```bash
ironbot-service install --json
```

### Installation Validation

After installation, verify the service was created:

```bash
# Check service is installed
ironbot-service status

# Should output something like:
# Service: IronBot
# Status: STOPPED
```

---

## Service Management

### Starting the Service

```bash
ironbot-service start
```

Verify it started:
```bash
ironbot-service status
```

### Stopping the Service

```bash
ironbot-service stop
```

With custom timeout (in seconds):
```bash
ironbot-service stop --timeout 60
```

### Restarting the Service

```bash
ironbot-service restart
```

This gracefully:
1. Stops the service (with 30s timeout)
2. Waits 1 second for cleanup
3. Starts the service again

### Checking Service Status

```bash
ironbot-service status
```

Human-readable output:
```
Service: IronBot
Status: RUNNING
PID: 12345
Uptime: 2h 30m 45s
Last started: 2026-02-12T14:30:00Z
Startup type: auto
```

JSON output:
```bash
ironbot-service status --json
```

### Uninstalling the Service

```bash
ironbot-service uninstall
```

With confirmation bypass:
```bash
ironbot-service uninstall --force
```

---

## Monitoring

### Viewing Service Logs

#### Last 50 Lines (Default)

```bash
ironbot-service logs
```

#### Specific Number of Lines

```bash
ironbot-service logs --lines 100
ironbot-service logs --lines 500
```

#### Filter by Log Level

```bash
# Only errors
ironbot-service logs --level error

# Only warnings and errors
ironbot-service logs --level warn

# Only info and above
ironbot-service logs --level info
```

#### Filter by Time

```bash
# Last hour
ironbot-service logs --since 1h

# Last 30 minutes
ironbot-service logs --since 30m

# Last 5 seconds
ironbot-service logs --since 5s
```

#### Combined Filtering

```bash
# Last 100 lines, warnings or above, last 2 hours
ironbot-service logs --lines 100 --level warn --since 2h
```

#### JSON Output (For Log Aggregation)

```bash
ironbot-service logs --json
```

### Real-Time Monitoring

Monitor service status periodically:

```powershell
# Every 5 seconds (Ctrl+C to stop)
while ($true) {
    Clear-Host
    ironbot-service status
    Start-Sleep -Seconds 5
}
```

### Windows Event Viewer

Service events can also be viewed in Windows Event Viewer:

1. Open Event Viewer
2. Navigate to: Windows Logs → Application
3. Filter by Source: NSSM or IronBot

---

## Troubleshooting

### Service Won't Start

#### Issue: "Admin privileges required"

**Solution**: Run PowerShell/Command Prompt as Administrator

#### Issue: "NSSM not found in PATH"

**Solution**:
1. Install NSSM from https://nssm.cc/download
2. Add NSSM directory to system PATH
3. Restart terminal

#### Issue: "Service 'IronBot' not found"

**Solution**: Service hasn't been installed yet
```bash
ironbot-service install
```

### Service Crashes Immediately

#### Check the logs:
```bash
ironbot-service logs --level error
```

#### Common causes:
- Missing environment variables (SLACK_BOT_TOKEN, ANTHROPIC_API_KEY)
- Invalid working directory permissions
- Node.js process exited

**Solution**:
1. Verify environment variables are set
2. Check log output for specific errors
3. Restart the service: `ironbot-service restart`

### High CPU Usage

#### Check what's happening:
```bash
ironbot-service logs --level info --lines 100
```

#### Solutions:
1. Check for error loops in logs
2. Review recent configuration changes
3. Monitor memory usage in Task Manager
4. Restart service if needed: `ironbot-service restart`

### Service Uses Wrong User

#### Check current user:
```bash
ironbot-service status
```

#### Change user:
```bash
ironbot-service uninstall --force
ironbot-service install --username CorrectUser
```

### Logs Directory Permission Issues

#### Error: "Failed to write to logs"

**Solution**:
1. Ensure logs directory exists
2. Grant write permissions to service user
3. Verify path is accessible

```powershell
# Check permissions
Get-Acl "C:\path\to\project\logs"

# Grant permissions if needed
icacls "C:\path\to\project\logs" /grant "DOMAIN\username:F"
```

---

## Advanced Usage

### Multiple Service Instances

Run multiple IronBot instances:

```bash
# First instance
ironbot-service install --service-name IronBot-1

# Second instance
ironbot-service install --service-name IronBot-2 --username user2

# Manage separately
ironbot-service status IronBot-1
ironbot-service status IronBot-2
```

### Custom Working Directory

Install service with specific working directory:

```bash
ironbot-service install --service-name IronBot-Dev
# Service will use current directory
```

### Manual Startup

Configure service to not auto-start:

```bash
ironbot-service install --startup-type manual
```

Start manually when needed:
```bash
ironbot-service start
```

### Disable Auto-Restart

```bash
ironbot-service install --no-auto-restart
```

### PowerShell Automation

```powershell
# Check if service is running
$status = ironbot-service status --json | ConvertFrom-Json
if ($status.state -eq "running") {
    Write-Host "Service is running"
} else {
    Write-Host "Service is stopped"
    ironbot-service start
}
```

---

## FAQ

### Q: How often does the service auto-restart?

**A**: The service auto-restarts immediately (3-second delay) after unexpected crashes. Graceful shutdowns are respected.

### Q: Can I run multiple services on the same machine?

**A**: Yes, use different service names:
```bash
ironbot-service install --service-name IronBot-1
ironbot-service install --service-name IronBot-2
```

### Q: How long does service startup take?

**A**: Typically 5-10 seconds for Node.js to initialize and connect to Slack.

### Q: Can I change the service user after installation?

**A**: Yes, reinstall with `--force`:
```bash
ironbot-service install --username newuser --force
```

### Q: Where are service logs stored?

**A**: By default: `{project}/logs/service.log`

### Q: Can I run IronBot without installing as a service?

**A**: Yes, run directly:
```bash
node src/main.ts
```

### Q: How do I backup the configuration?

**A**: The configuration is stored in NSSM registry. Back up:
- NSSM settings: Query with `nssm dump IronBot`
- Environment files: Copy your .env files
- Project directory: Standard backup

### Q: What happens on Windows reboot?

**A**: If startup type is "auto" (default), the service will:
1. Start automatically when Windows boots
2. Wait for network to be available
3. Connect to Slack and initialize
4. Begin processing messages

### Q: How do I ensure high availability?

**A**:
1. Use auto-restart (enabled by default)
2. Monitor with external tool
3. Set up Windows Task Scheduler for periodic health checks
4. Use load balancer if multiple instances
5. Regular log monitoring

### Q: Can I use a service account instead of user account?

**A**: Yes:
```bash
ironbot-service install --username "NT SERVICE\IronBot"
```

(Requires advanced setup - consult Windows documentation)

---

## Support Resources

- **NSSM Documentation**: https://nssm.cc/usage
- **Windows Services**: https://docs.microsoft.com/windows/win32/services/
- **Node.js Docs**: https://nodejs.org/docs/
- **IronBot Repository**: Check GitHub for additional documentation

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-12 | Initial release |

---

**Last Updated**: 2026-02-12
