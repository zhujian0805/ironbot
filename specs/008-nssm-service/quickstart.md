# Developer Quickstart: Windows Service Wrapper

**Date**: 2026-02-12
**Feature**: Windows Service Wrapper using NSSM
**Status**: Complete

This guide helps developers understand and work with the Windows service wrapper implementation.

---

## Overview

The Windows service wrapper enables IronBot to run as a managed Windows service using NSSM. Developers work primarily with TypeScript service modules, CLI commands, and integration tests.

**Key Components**:
- **Service Module** (`src/services/windows-service/`): Core service management logic
- **CLI Interface** (`src/cli/windows-service-cli.ts`): Command-line interface
- **Integration Tests** (`tests/integration/windows-service-*.test.ts`): Service lifecycle tests
- **Configuration** (configuration models and utilities): Service setup validation

---

## Development Prerequisites

### System Requirements
- **OS**: Windows 10/11 (development machine)
- **Node.js**: 20 LTS
- **NSSM**: Latest stable version (install via `nssm install`)
- **Admin Access**: Required for local testing

### Setup Steps

1. **Install NSSM**:
   ```powershell
   # Using scoop (recommended)
   scoop install nssm

   # OR download from https://nssm.cc/download and add to PATH
   ```

2. **Verify Installation**:
   ```powershell
   nssm --version
   ```

3. **Install Dependencies**:
   ```bash
   bun install
   ```

4. **Create Test User** (for integration tests):
   ```powershell
   # This can be the current user; tests use environment credentials
   ```

---

## Project Structure Reference

```
src/services/windows-service/
├── commands/
│   ├── install.ts          # Service installation logic
│   ├── uninstall.ts        # Service removal logic
│   ├── status.ts           # Service status querying
│   └── logs.ts             # Log file access
├── config/
│   ├── service-config.ts   # Configuration builder and validation
│   ├── nssm.ts             # NSSM command wrapper
│   └── constants.ts        # Service constants and defaults
├── utils/
│   ├── paths.ts            # Project path resolution
│   ├── env.ts              # Environment variable handling
│   └── process.ts          # Process execution helpers
├── types/
│   └── index.ts            # TypeScript interfaces
└── index.ts                # Library exports

src/cli/
└── windows-service-cli.ts  # CLI command definitions

tests/integration/
├── windows-service-install.test.ts
├── windows-service-uninstall.test.ts
├── windows-service-user-context.test.ts
└── windows-service-lifecycle.test.ts

tests/unit/
├── nssm.test.ts
├── service-config.test.ts
└── paths.test.ts
```

---

## Working with NSSM Wrapper

### Understanding NSSM Commands

The service wrapper uses these NSSM operations:

```typescript
// Install service
nssm install {serviceName} {applicationPath} {arguments}
nssm set {serviceName} AppDirectory {workingDirectory}
nssm set {serviceName} AppStdout {logFilePath}
nssm set {serviceName} AppStderr {logFilePath}
nssm set {serviceName} AppRestartDelay {milliseconds}
nssm set {serviceName} ObjectName {domain}\{username} {password}

// Query service
nssm status {serviceName}
nssm get {serviceName} {parameter}

// Manage service lifecycle
nssm start {serviceName}
nssm stop {serviceName}
nssm restart {serviceName}

// Remove service
nssm remove {serviceName} confirm
```

### Configuration Builder

The `ServiceConfig` builder validates and constructs NSSM configuration:

```typescript
import { ServiceConfig, buildServiceConfig } from '@ironbot/service-wrapper';

const config: ServiceConfig = await buildServiceConfig({
  serviceName: 'IronBot',
  username: 'jzhu',
  workingDirectory: 'D:\\repos\\ironbot',
  startupType: 'auto',
  autoRestart: true,
  restartDelaySeconds: 3,
  shutdownTimeoutSeconds: 30,
});

// Validation runs automatically; throws on errors
```

### Command Execution

Commands use the NSSM wrapper for safe process execution:

```typescript
import { executeNssmCommand } from '@ironbot/service-wrapper';

const result = await executeNssmCommand('status', ['IronBot']);
// Returns: { statusCode: 0, stdout: '...' }
```

---

## Testing

### Unit Tests

Unit tests verify individual components without system interaction:

```bash
bun test tests/unit/service-config.test.ts
```

**Coverage**:
- Configuration validation
- Path resolution
- Environment variable handling
- NSSM command formatting

### Integration Tests

Integration tests require Windows environment and admin privileges:

```bash
# Run as Administrator
bun test tests/integration/windows-service-install.test.ts
```

**Test Flow**:
1. **Setup**: Create test service name, verify NSSM installed
2. **Execute**: Install service with test configuration
3. **Verify**: Check service appears in Windows Services, has correct settings
4. **Cleanup**: Uninstall test service

**Common Integration Test Pattern**:
```typescript
describe('Windows Service Installation', () => {
  const testServiceName = 'IronBot-Test-' + Date.now();

  afterAll(async () => {
    // Cleanup: uninstall test service
  });

  it('should install service successfully', async () => {
    const result = await installService({
      serviceName: testServiceName,
      username: 'jzhu',
      workingDirectory: process.cwd(),
    });

    expect(result.success).toBe(true);
    // Verify service exists
  });
});
```

---

## CLI Development

### Adding a New Command

1. **Create command handler** in `src/services/windows-service/commands/`:

```typescript
// src/services/windows-service/commands/my-command.ts
export interface MyCommandOptions {
  serviceName?: string;
  // ... other options
}

export async function executeMyCommand(
  options: MyCommandOptions,
): Promise<CommandResult> {
  // Implementation
  return {
    success: true,
    message: 'Command executed successfully',
  };
}
```

2. **Register in CLI** in `src/cli/windows-service-cli.ts`:

```typescript
import { program } from 'commander';
import { executeMyCommand } from '../services/windows-service/commands/my-command';

program
  .command('my-command')
  .description('My command description')
  .option('--service-name <name>', 'Service name')
  .action(async (options) => {
    try {
      const result = await executeMyCommand(options);
      console.log(result.message);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });
```

3. **Add tests** in `tests/integration/`:

```typescript
it('should execute my command', async () => {
  const result = await executeMyCommand({ serviceName: 'IronBot' });
  expect(result.success).toBe(true);
});
```

---

## Common Development Tasks

### Debugging Service Installation

1. **Check NSSM configuration**:
   ```powershell
   nssm dump IronBot
   ```

2. **View service logs**:
   ```powershell
   # Using the CLI
   bun run cli windows-service logs --follow

   # OR directly
   Get-Content D:\repos\ironbot\logs\service.log -Tail 50 -Wait
   ```

3. **Test service start**:
   ```powershell
   net start IronBot
   ```

### Handling Test Failures

**Integration tests fail if**:
- Running without admin privileges → Use "Run as Administrator"
- NSSM not in PATH → Add NSSM installation directory to PATH
- User account doesn't exist → Create test user or use current user
- Previous test services not cleaned up → Manually uninstall: `nssm remove IronBot-Test-xxx confirm`

### Simulating Service Behavior

Test your code by running commands manually:

```bash
# Test installation
bun run cli windows-service install --json

# Check status
bun run cli windows-service status --json

# View logs
bun run cli windows-service logs --lines 20

# Uninstall
bun run cli windows-service uninstall --force --json
```

---

## Key Design Decisions

### Why NSSM?
- Lightweight, single-file executable
- No code modifications to IronBot required
- Handles service lifecycle reliably
- Industry-standard for Windows service wrapping

### Why CLI-First?
- Operators familiar with CLI tools
- Scriptable for automation
- Integrates with existing IronBot CLI
- Supports both interactive and non-interactive modes

### Why TypeScript?
- Type safety ensures robustness
- Consistent with existing IronBot codebase
- Better IDE support and refactoring
- Clear contracts between components

### Why Credential Manager?
- Secure credential storage (DPAPI encryption)
- Windows best practice
- No plaintext passwords in config files
- Credentials persist across service restarts

---

## Performance Considerations

**Service Startup Time**: Target <10 seconds
- NSSM startup: ~1 second (overhead)
- Node.js startup: ~3-5 seconds
- IronBot initialization: ~5 seconds
- Total: ~9-11 seconds (acceptable)

**Memory Usage**: No additional overhead from wrapper
- Service wrapper: ~30 MB (Node.js runtime)
- IronBot application: ~100-150 MB (existing)
- Total: ~130-180 MB (acceptable for service)

**Reliability**: Service auto-restart
- Crash detection: Immediate
- Restart attempt: After 3-second delay
- Max attempts: Unlimited (respects Windows behavior)

---

## Troubleshooting Guide

### "NSSM not found"
- Install NSSM and add to PATH
- Verify with `nssm --version`

### "Admin privileges required"
- Run PowerShell/Command Prompt as Administrator
- Or use `runas` command: `runas /user:Administrator "bun run cli windows-service install"`

### "User account not found"
- Specify valid username: `--username [DOMAIN\]username`
- Default is current user
- Verify user exists: `net user jzhu`

### "Working directory not accessible"
- Verify path exists: `Test-Path D:\repos\ironbot`
- Check read/execute permissions
- Ensure path is absolute, not relative

### "Service won't start"
- Check application logs: `bun run cli windows-service logs --follow`
- Verify working directory is correct
- Ensure environment variables are set
- Check for application startup errors in IronBot code

### "Cannot uninstall running service"
- Stop the service first: `net stop IronBot`
- Or use `--force` flag: `ironbot-service uninstall --force`

---

## Next Steps

1. **Implement service module**: Create install/uninstall/status/logs commands
2. **Write tests**: Unit tests for config validation, integration tests for service lifecycle
3. **Document operations**: Create deployment guide for operators
4. **Gather feedback**: Test with actual Windows environments

---

## References

- **NSSM Documentation**: https://nssm.cc/usage
- **Commander.js**: https://github.com/tj/commander.js
- **Windows Services**: https://docs.microsoft.com/windows-server/administration/windows-commands/net-start
- **DPAPI/Credential Manager**: https://docs.microsoft.com/dotnet/standard/security/encrypting-data
