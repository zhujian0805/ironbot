# Quickstart: Tool Permissions Configuration

**Feature**: 002-tool-permissions-config
**Date**: 2026-01-31

## Overview

This feature adds a permission system that controls which tools, skills, and MCPs the bot can use. Permissions are configured via a YAML file and enforced at runtime.

## Quick Setup

### 1. Create Permission Configuration File

Create `permissions.yaml` in your project root. Each of the five top-level sections (`tools`, `mcps`, `commands`, `skills`, `resurces`) lists policy entries. Every entry must include `priority`, `name` (regex), and `desc`, and only matching entries are allowed. Here is the environment that mirrors the simplified default:

```yaml
tools:
  - priority: 100
    name: ".*"
    desc: "Allow every tool during the quickstart phase"
mcps:
  - priority: 100
    name: ".*"
    desc: "Permit all MCP adapters"
commands:
  - priority: 100
    name: ".*"
    desc: "Approve every command temporarily"
skills:
  - priority: 100
    name: ".*"
    desc: "Enable every skill by default"
resurces:
  - priority: 100
    name: ".*"
    desc: "Permit all resource paths while building the policy"
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
tools:
  - priority: 10
    name: "list_directory"
    desc: "Allow directory listing"
  - priority: 20
    name: "read_file"
    desc: "Allow file reads"

commands:
  - priority: 10
    name: "^read"
    desc: "Only allow commands that begin with 'read'"

skills:
  - priority: 10
    name: ".*"
    desc: "Disable skills by default (adjust individually)"

mcps:
  - priority: 10
    name: ".*"
    desc: "Allow MCP listeners used by the workspace"

resurces:
  - priority: 10
    name: "/home/worker/.*"
    desc: "Allow only workspace files under /home/worker/"
```

### Read-Only Operations

```yaml
tools:
  - priority: 10
    name: "list_directory"
    desc: "Allow directory enumeration"
  - priority: 20
    name: "read_file"
    desc: "Allow reading files"
  - priority: 30
    name: "run_powershell"
    desc: "Allow PowerShell for safe inspection"

commands:
  - priority: 10
    name: "^Get-"
    desc: "Permit read-only PowerShell cmdlets"
resurces:
  - priority: 10
    name: "/readonly/.*"
    desc: "Restrict file access to read-only directories"
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
