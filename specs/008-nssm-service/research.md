# Research Phase: Windows Service Wrapper using NSSM

**Date**: 2026-02-12
**Feature**: Windows Service Wrapper using NSSM
**Status**: Complete

## Research Summary

This document consolidates research findings and technical decisions for implementing a Windows service wrapper using NSSM. All unknowns from the specification have been resolved through best practices research.

---

## 1. NSSM Integration & Windows Service Management

**Decision**: Use NSSM (Non-Sucking Service Manager) as the service wrapper with spawn mode for process management.

**Rationale**:
- NSSM is the industry-standard lightweight service wrapper for Windows
- Supports running arbitrary applications as Windows services without code modification
- Handles service lifecycle (start, stop, restart, shutdown) reliably
- Automatically captures stdout/stderr to log files
- Minimal dependencies and configuration overhead
- Works correctly with user-specific environment variables

**Alternatives Considered**:
- **WinSW (Windows Service Wrapper)**: More complex, Java-based, heavier than NSSM. NSSM preferred for simplicity
- **Node.js native service modules**: node-windows requires native compilation; not ideal for cross-machine deployments
- **PowerShell service scripts**: No built-in retry/restart logic; manual implementation error-prone

**Implementation Details**:
- NSSM installs the service with unique AppName: `IronBot` (customizable via CLI option)
- Service binaries in NSSM: application path, working directory, command-line arguments
- Startup type: `auto` (starts on system boot)
- Service runs with jzhu user credentials (stored in Windows credential manager)
- Log output: NSSM handles stdout/stderr to file (configurable path)

---

## 2. User Context & Credentials Management

**Decision**: Store service user credentials via Windows credential manager; retrieve at runtime for service setup.

**Rationale**:
- Secure credential storage in Windows Credential Manager (vault integration)
- Credentials persist across reboots; survives service restarts
- Environment variables inherited from user profile automatically
- Avoids storing passwords in config files or scripts

**Alternatives Considered**:
- **Hardcoded credentials**: Security risk; violates best practices
- **Command-line password**: Exposed in process listings and history
- **Registry**: More brittle than Credential Manager; not user-bound

**Implementation Details**:
- Interactive installation prompt for password (masked input)
- Credentials stored as: `ironbot-service:{username}` in Windows Credential Manager
- Verification: Query Credential Manager to confirm credentials exist before service creation
- Fallback: If credentials don't exist, prompt user during installation

---

## 3. Working Directory & Path Resolution

**Decision**: Set service working directory to absolute path of IronBot project folder at installation time.

**Rationale**:
- Relative paths in configs (logs, skills) resolve correctly regardless of where service runs from
- Working directory set in NSSM configuration persists across service restarts
- Avoids path lookup complexity; deterministic behavior

**Alternatives Considered**:
- **Environment variable for project path**: Requires user to set; fragile
- **Symlinks**: Not portable; requires admin setup; doesn't work in service context

**Implementation Details**:
- At installation: Resolve project path to absolute path (e.g., `D:\repos\ironbot`)
- NSSM AppDirectory: Set to absolute project path
- All file references in IronBot code should use relative paths from working directory
- Verify accessibility: Check that path exists and is readable during installation

---

## 4. Environment Variable Inheritance

**Decision**: Service inherits environment variables from jzhu user's Windows profile via user-level registry.

**Rationale**:
- Windows service running as user automatically loads HKEY_CURRENT_USER environment variables
- SLACK_BOT_TOKEN, ANTHROPIC_API_KEY, and other secrets accessible to service process
- No manual environment variable setup needed; leverages Windows built-in mechanisms

**Alternatives Considered**:
- **Service-level environment variables**: Only the service can access; breaks if other processes need same vars
- **Config file storage**: Security risk for sensitive data
- **Export environment via script**: Fragile; doesn't persist across restarts

**Implementation Details**:
- Verify at installation: Check that critical environment variables exist in user profile
- Log environment variable names (not values) for debugging
- Service inherits all HKEY_CURRENT_USER\Environment variables at startup

---

## 5. CLI Command Structure

**Decision**: Implement commands following commander.js patterns with subcommands for install, uninstall, status, logs.

**Rationale**:
- commander.js is already integrated in IronBot for CLI parsing
- Subcommand pattern is industry-standard and familiar to operators
- Enables structured help and parameter validation
- Output supports both JSON (for automation) and human-readable formats

**Command Structure**:
```
ironbot-service install   [options]    # Install service with configuration
ironbot-service uninstall [options]    # Remove service from Windows
ironbot-service status                 # Query current service state
ironbot-service logs      [options]    # Display service logs
```

**Alternatives Considered**:
- **Single command with flags**: Less intuitive; harder to help users understand operations
- **External scripts**: Not integrated; harder to discover; manual deployment

---

## 6. Logging & Observability

**Decision**: NSSM captures stdout/stderr; CLI provides access via `logs` command; structured logging from application.

**Rationale**:
- NSSM's built-in log capture is reliable and requires no additional setup
- Pino (existing logging library) ensures structured logging from IronBot application
- Operators can query logs via CLI command without file system access
- Log rotation handled by NSSM configuration

**Alternatives Considered**:
- **Application-level file logging**: Duplicate logging; not integrated with service management
- **Windows Event Log**: Complex setup; not operator-friendly

**Implementation Details**:
- NSSM log file location: `{project-folder}\logs\service.log`
- CLI `logs` command: reads and displays recent lines from NSSM log file
- JSON output option for log command: structured JSON parsing for automation
- Log filtering: support basic date/level filtering in `logs` command

---

## 7. Service Startup & Lifecycle

**Decision**: Service configured with automatic restart on failure; timeout handling for graceful shutdown.

**Rationale**:
- Auto-restart ensures IronBot recovers from crashes automatically
- Timeout prevents hung processes; allows time for cleanup
- Operators can manage lifecycle via standard Windows service commands
- Integration with system restart ensures persistence across reboots

**Alternatives Considered**:
- **Manual restart only**: Reduces reliability; requires operator intervention
- **Exponential backoff retry**: Over-complicates NSSM configuration; not necessary for simple wrapper

**Implementation Details**:
- NSSM AppRestart: enabled with 3-second delay between restarts
- Shutdown timeout: 30 seconds (allows graceful shutdown before force kill)
- Application must handle SIGTERM/exit signals gracefully (application responsibility)

---

## 8. Validation & Error Handling

**Decision**: Pre-installation validation checks; clear error messages for common failure scenarios.

**Rationale**:
- Catches configuration issues before service installation
- Reduces troubleshooting time; operator knows what's wrong immediately
- Improves user experience; prevents partial/broken service states

**Validation Checks**:
1. **Admin privileges**: Service installation requires admin; check before proceeding
2. **User account exists**: Verify jzhu user account exists on system
3. **NSSM availability**: Check NSSM is installed and in PATH
4. **Path accessibility**: Confirm project folder exists and is readable
5. **Credentials availability**: Ensure user credentials exist or can be created
6. **Service name conflicts**: Check service name not already in use

---

## Technical Dependencies

| Component | Version | Reason |
|-----------|---------|--------|
| NSSM | Latest stable | Service wrapper foundation |
| Node.js | 20 LTS | Runtime for CLI tool |
| commander.js | Latest | CLI argument parsing (already in project) |
| pino | Latest | Structured logging (already in project) |
| execa | Latest | Cross-platform process execution |
| TypeScript | 5.x | Type-safe implementation |

---

## Integration Points

1. **IronBot Main Application**:
   - Service wrapper does not modify IronBot code
   - Service wrapper provides working directory and environment
   - IronBot must handle SIGTERM gracefully for shutdown

2. **Windows Service Subsystem**:
   - Service Manager accesses NSSM service configuration
   - Credentials stored in Windows Credential Manager
   - Logs written to file system

3. **CLI Interface**:
   - New `ironbot-service` commands in main CLI
   - Integration with existing commander.js setup
   - Output formats: human-readable and JSON

---

## Security Considerations

- **Credential Storage**: Windows Credential Manager provides encrypted storage; no plaintext passwords
- **Service Process**: Runs with jzhu user privileges; respects Windows ACLs for file access
- **CLI Access**: Service management commands require admin privileges for install/uninstall
- **Log Files**: NSSM logs may contain sensitive output; stored in project folder with appropriate permissions
- **Audit Trail**: All service operations (start/stop/restart) logged in Windows Event Log

---

## Deployment Checklist

- [ ] NSSM installed on target system
- [ ] jzhu user account created and configured
- [ ] Project folder accessible from target system
- [ ] User credentials configured in Windows Credential Manager (or via interactive setup)
- [ ] Firewall/antivirus configured if needed for application communication
- [ ] System reboot required after initial service setup (Windows best practice)
