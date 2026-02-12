# Data Model: Windows Service Wrapper Configuration

**Date**: 2026-02-12
**Feature**: Windows Service Wrapper using NSSM
**Status**: Complete

---

## Service Configuration Model

### ServiceConfig

Core configuration for Windows service installation and management.

```typescript
interface ServiceConfig {
  // Service Identity
  serviceName: string;              // Windows service name (e.g., "IronBot")
  displayName: string;              // Display name in Services console
  description: string;              // Service description shown in UI

  // Execution Context
  username: string;                 // User account to run service as (e.g., "jzhu")
  password?: string;                // User password (encrypted storage via Credential Manager)
  workingDirectory: string;         // Working directory for service process (absolute path)

  // Startup Configuration
  startupType: 'auto' | 'manual' | 'disabled'; // Auto-start on boot
  autoRestart: boolean;             // Restart on failure
  restartDelaySeconds: number;      // Delay before restart attempt (default: 3)
  shutdownTimeoutSeconds: number;   // Grace period for graceful shutdown (default: 30)

  // Logging
  logPath: string;                  // Path to service log file
  appendLogs: boolean;              // Append to existing logs (default: true)

  // Optional
  priority?: 'low' | 'normal' | 'high'; // Process priority (default: normal)
  environmentVariables?: Record<string, string>; // Additional env vars (if needed)
}
```

### ServiceStatus

Current state of the Windows service.

```typescript
interface ServiceStatus {
  serviceName: string;
  displayName: string;
  state: 'running' | 'stopped' | 'paused' | 'starting' | 'stopping' | 'unknown';
  status: number;                   // Windows service status code
  processId: number | null;         // PID if running, null if stopped
  startType: 'auto' | 'manual' | 'disabled';
  exitCode: number | null;          // Last exit code (if stopped)
  uptime: number | null;            // Uptime in milliseconds (if running)
  lastStartTime: Date | null;       // Last start timestamp
  lastStopTime: Date | null;        // Last stop timestamp
}
```

### Installation Options

CLI parameters for `install` command.

```typescript
interface InstallOptions {
  serviceName?: string;             // Custom service name (default: "IronBot")
  autoRestart?: boolean;            // Enable auto-restart (default: true)
  startupType?: 'auto' | 'manual';  // Startup type (default: "auto")
  username?: string;                // Override username (default: current user)
  password?: string;                // Provide password non-interactively (normally prompted)

  // Flags
  force?: boolean;                  // Force uninstall existing service first
  skipValidation?: boolean;         // Skip pre-installation checks (not recommended)
}
```

### Validation Result

Pre-installation validation output.

```typescript
interface ValidationResult {
  valid: boolean;
  checks: ValidationCheck[];
  errors: string[];
  warnings: string[];
}

interface ValidationCheck {
  name: string;                     // Check name (e.g., "admin-privileges")
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: string;
}
```

---

## CLI Command Contracts

### Install Command

**Purpose**: Register IronBot as a Windows service using NSSM.

**Signature**:
```
ironbot-service install [options]
```

**Options**:
```
--service-name <name>              Service name (default: "IronBot")
--startup-type <type>              auto|manual (default: "auto")
--auto-restart                      Enable auto-restart on failure (default: true)
--no-auto-restart                   Disable auto-restart
--force                             Uninstall existing service first
--username <user>                   User to run service as (default: current user)
--skip-validation                   Skip pre-installation checks
--json                              Output as JSON
```

**Exit Codes**:
```
0   - Success
1   - General error
2   - Admin privileges required
3   - NSSM not found
4   - User account doesn't exist
5   - Service already exists
6   - Invalid working directory
```

**Output (human-readable)**:
```
✓ Validation passed
✓ Service "IronBot" registered successfully
✓ Service configured to run as: jzhu
✓ Working directory: D:\repos\ironbot
✓ Auto-start: enabled
✓ Logs: D:\repos\ironbot\logs\service.log

Use 'net start IronBot' to start the service, or restart your computer.
```

**Output (JSON)**:
```json
{
  "success": true,
  "serviceName": "IronBot",
  "displayName": "IronBot - Slack AI Agent",
  "username": "jzhu",
  "workingDirectory": "D:\\repos\\ironbot",
  "startupType": "auto",
  "logPath": "D:\\repos\\ironbot\\logs\\service.log",
  "message": "Service registered successfully"
}
```

### Uninstall Command

**Purpose**: Remove IronBot service from Windows.

**Signature**:
```
ironbot-service uninstall [serviceName] [options]
```

**Parameters**:
```
serviceName                         Service name to remove (default: "IronBot")
```

**Options**:
```
--force                             Don't ask for confirmation
--json                              Output as JSON
```

**Exit Codes**:
```
0   - Success
1   - General error
2   - Admin privileges required
3   - Service not found
4   - Service is running (stop it first)
5   - NSSM not found
```

**Output (human-readable)**:
```
⚠ This will remove the service "IronBot" from Windows.
✓ Service stopped
✓ Service "IronBot" uninstalled successfully
```

**Output (JSON)**:
```json
{
  "success": true,
  "serviceName": "IronBot",
  "message": "Service uninstalled successfully"
}
```

### Status Command

**Purpose**: Query current status of IronBot service.

**Signature**:
```
ironbot-service status [serviceName] [options]
```

**Parameters**:
```
serviceName                         Service name (default: "IronBot")
```

**Options**:
```
--json                              Output as JSON
--watch                             Watch for status changes
```

**Exit Codes**:
```
0   - Service running
1   - Service stopped or not found
2   - Query failed
```

**Output (human-readable)**:
```
Service: IronBot
Status: running
State: RUNNING (exit code: 0)
PID: 12345
Uptime: 2 days, 5 hours
Last started: 2026-02-10 08:30:15
Startup type: auto

Logs: D:\repos\ironbot\logs\service.log
```

**Output (JSON)**:
```json
{
  "serviceName": "IronBot",
  "displayName": "IronBot - Slack AI Agent",
  "state": "running",
  "processId": 12345,
  "startType": "auto",
  "uptime": 185400000,
  "lastStartTime": "2026-02-10T08:30:15.000Z",
  "lastStopTime": "2026-02-08T03:30:00.000Z"
}
```

### Logs Command

**Purpose**: Display service logs.

**Signature**:
```
ironbot-service logs [serviceName] [options]
```

**Parameters**:
```
serviceName                         Service name (default: "IronBot")
```

**Options**:
```
--lines <number>                    Number of lines to display (default: 50)
--follow                            Follow log output (like tail -f)
--since <time>                      Show logs since time (e.g., "1h", "30m")
--level <level>                     Filter by log level (error, warn, info, debug)
--json                              Output as JSON array
```

**Exit Codes**:
```
0   - Success
1   - Service not found
2   - Log file not found
3   - Invalid filter
```

**Output (human-readable)**:
```
[2026-02-12 08:30:15] INFO: Service started
[2026-02-12 08:30:16] INFO: Loading configuration from permissions.yaml
[2026-02-12 08:30:17] INFO: Connecting to Slack...
[2026-02-12 08:30:18] INFO: Ready to handle messages
```

**Output (JSON)**:
```json
{
  "serviceName": "IronBot",
  "logFile": "D:\\repos\\ironbot\\logs\\service.log",
  "lines": [
    {
      "timestamp": "2026-02-12T08:30:15.000Z",
      "level": "info",
      "message": "Service started",
      "source": "main"
    }
  ]
}
```

---

## State Transitions

### Service Lifecycle

```
[Uninstalled]
    ↓ install command
[Installed + Stopped] ← ← ← ← ←
    ↓ start command                ↑
[Running]                       stop command
    ↓ crash/failure              ↑
[Stopped] (auto-restart begins)
    ↓ 3-second delay
[Running] (restarted)
```

### Installation Workflow

```
[Start] → Validate → Stop existing → Uninstall old → Install new → Configure → [Success]
                ↑                                                              ↓
                └──────────────────── Error → [Rollback] → [Fail] ←──────────┘
```

---

## Error Handling

### Common Error Scenarios

| Scenario | Error Code | Message | Recovery |
|----------|-----------|---------|----------|
| NSSM not installed | 3 | "NSSM not found in PATH" | Install NSSM on target system |
| Missing admin privileges | 2 | "Admin privileges required to manage services" | Run command as Administrator |
| User account doesn't exist | 4 | "User account 'jzhu' not found on system" | Create user account or specify different user |
| Service already exists | 5 | "Service 'IronBot' already exists. Use --force to reinstall." | Use --force flag or use different service name |
| Working directory invalid | 6 | "Working directory not accessible: path/to/folder" | Verify folder exists and is readable |
| Service is running | 4 (uninstall) | "Service is running. Stop it before uninstalling." | Run `net stop IronBot` first |

---

## Configuration Persistence

### Windows Credential Manager

**Purpose**: Store service user credentials securely.

**Storage**:
- **Target**: `ironbot-service:jzhu` (or `ironbot-service:{username}`)
- **Type**: Generic Credential
- **Encryption**: Windows Credential Manager (DPAPI)

**Retrieval**: Service accesses via Windows Credential Manager API at runtime

### NSSM Configuration

**Registry Location**:
```
HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\IronBot
HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\IronBot\Parameters
```

**Configuration Stored**:
- Application path (Node.js executable)
- Application arguments (IronBot entry point)
- Working directory
- Service startup parameters
- Restart behavior

---

## Validation Rules

### Pre-Installation Checks

1. **Admin Privileges**: User must have admin rights to install service
2. **NSSM Available**: `nssm --version` must succeed
3. **User Account**: `net user {username}` must find the account
4. **Working Directory**: Path must exist and be readable
5. **Service Name**: Must not conflict with existing services
6. **Credentials**: Valid username/password (validated via Windows API)

### Runtime Validation

1. **Service State**: Cannot uninstall running service without --force
2. **Working Directory**: Must remain accessible during service lifetime
3. **Environment Variables**: Critical variables (SLACK_BOT_TOKEN, ANTHROPIC_API_KEY) should be present
4. **Log Path**: Must have write permissions
