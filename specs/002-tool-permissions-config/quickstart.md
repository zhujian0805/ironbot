# Quickstart: Tool Permissions Configuration

**Feature**: 002-tool-permissions-config
**Date**: 2026-01-31

## Overview

This feature adds a permission system that controls which tools, skills, and MCPs the bot can use. Permissions are configured via a YAML file and enforced at runtime.

## Quick Setup

### 1. Create Permission Configuration File

Create `permissions.yaml` in your project root:

```yaml
version: "1.0"

settings:
  default_deny: true
  log_denials: true

tools:
  allowed:
    - "list_directory"
    - "read_file"
    - "write_file"

skills:
  allowed:
    - "*"  # Allow all skills

mcps:
  allowed: []  # No MCPs allowed
```

### 2. Start the Bot with Permissions

```bash
# Using environment variable
export PERMISSIONS_FILE=./permissions.yaml
bun run dev

# Or using CLI argument
bun run dev -- --permissions-file ./permissions.yaml
```

### 3. Verify Permissions

The bot will log loaded permissions at startup:

```
INFO: Loaded permissions from ./permissions.yaml
INFO: Allowed tools: 3 (list_directory, read_file, write_file)
INFO: Allowed skills: * (all)
INFO: Allowed MCPs: 0
```

## Common Configurations

### Development (Allow All)

```yaml
version: "1.0"
tools:
  allowed: ["*"]
skills:
  allowed: ["*"]
mcps:
  allowed: ["*"]
```

### Production (Minimal)

```yaml
version: "1.0"
settings:
  default_deny: true
  log_denials: true

tools:
  allowed:
    - "list_directory"
    - "read_file"
  # No write or execute permissions

skills:
  allowed: []

mcps:
  allowed: []
```

### Read-Only Operations

```yaml
version: "1.0"
tools:
  allowed:
    - "list_directory"
    - "read_file"
    - "run_powershell"
  restrictions:
    run_powershell:
      allowed_commands:
        - "Get-*"
        - "Test-*"
      blocked_commands:
        - "*-Item"
        - "Remove-*"
        - "Set-*"
```

## Hot Reload

Update permissions without restarting:

1. Modify `permissions.yaml`
2. The bot automatically detects changes and reloads
3. Check logs for confirmation:
   ```
   INFO: Configuration change detected, reloading...
   INFO: Permissions reloaded successfully
   ```

## Testing Permissions

Ask the bot to list its capabilities:

> "What tools can you use?"

The bot will respond with its currently enabled capabilities.

Try a blocked operation:

> "Delete all files in /tmp"

If `write_file` or destructive commands are blocked:

> "I'm sorry, but that operation requires the 'write_file' tool which is not enabled in my current configuration."

## Troubleshooting

### Bot Won't Start

Check YAML syntax using a YAML-aware editor or linter.

### Permissions Not Loading

Verify file path:
```bash
ls -la permissions.yaml
```

Check environment variable:
```bash
echo $PERMISSIONS_FILE
```

### Permission Denied Unexpectedly

Check logs for denial reason:
```
WARNING: Permission denied: tool 'run_bash' not in allowed list
```

Review your `allowed` list and wildcard patterns.
