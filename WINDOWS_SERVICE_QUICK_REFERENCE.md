# Windows Service Wrapper - Quick Reference Card

## Installation

```bash
# Basic installation
ironbot-service install

# Custom service name and user
ironbot-service install --service-name MyBot --username jzhu

# Force reinstall
ironbot-service install --force
```

## Service Management

| Command | Purpose |
|---------|---------|
| `ironbot-service start` | Start service |
| `ironbot-service stop` | Stop service |
| `ironbot-service restart` | Restart service |
| `ironbot-service status` | Check status |
| `ironbot-service uninstall` | Remove service |

## Logs

```bash
ironbot-service logs                          # Last 50 lines
ironbot-service logs --lines 100              # Custom count
ironbot-service logs --level error            # By level
ironbot-service logs --since 1h               # Last hour
ironbot-service logs --json                   # JSON format
```

## Monitoring

```bash
# View status
ironbot-service status

# View with JSON
ironbot-service status --json

# Watch every 5 seconds (PowerShell)
while ($true) { Clear-Host; ironbot-service status; Start-Sleep 5 }
```

## Common Issues

| Issue | Solution |
|-------|----------|
| Service won't start | Run PowerShell as Administrator |
| NSSM not found | Install from https://nssm.cc/download |
| Wrong user | `ironbot-service uninstall --force` then reinstall |
| Permission denied | Check log directory ownership |
| Missing env vars | Set SLACK_BOT_TOKEN and ANTHROPIC_API_KEY |

## Pre-Deployment Checklist

```powershell
# Run this first
powershell -ExecutionPolicy Bypass -File PreDeploymentChecklist.ps1
```

Verify:
- ✅ NSSM installed
- ✅ Administrator privileges
- ✅ Node.js 20+ installed
- ✅ Required env vars set
- ✅ Project structure valid

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Admin privileges required |
| 3 | Service not found |

## Advanced

```bash
# Multiple instances
ironbot-service install --service-name IronBot-1
ironbot-service install --service-name IronBot-2

# Manual startup (no auto-start)
ironbot-service install --startup-type manual

# Skip validation
ironbot-service install --skip-validation

# JSON output (for scripting)
ironbot-service install --json
ironbot-service status --json
ironbot-service logs --json
```

## Support Resources

- **Operator Manual**: WINDOWS_SERVICE_OPERATOR_MANUAL.md
- **Implementation Docs**: WINDOWS_SERVICE_IMPLEMENTATION.md
- **NSSM Docs**: https://nssm.cc/usage
- **Windows Services**: https://docs.microsoft.com/windows/win32/services/

---

**Quick Start**:
1. Run: `PreDeploymentChecklist.ps1`
2. Run: `ironbot-service install`
3. Run: `ironbot-service status`
4. View: `ironbot-service logs`
