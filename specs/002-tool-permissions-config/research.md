# Research: Tool Permissions Configuration

**Feature**: 002-tool-permissions-config
**Date**: 2026-01-31

## Research Tasks

### 1. Configuration File Format

**Decision**: YAML

**Rationale**:
- Human-readable and easy to edit
- Supports comments for documentation
- Native support for lists and nested structures
- PyYAML is well-maintained and widely used
- Consistent with industry standards for configuration files

**Alternatives Considered**:
- **JSON**: No comment support, harder to read/edit for humans
- **TOML**: Less common in Python ecosystem, steeper learning curve
- **INI**: Too flat for nested permission structures

### 2. Wildcard Pattern Matching

**Decision**: Use Python's `fnmatch` module

**Rationale**:
- Built into Python standard library (no extra dependency)
- Familiar glob-style patterns (`*`, `?`, `[seq]`)
- Simple and well-documented
- Sufficient for tool/skill/MCP name matching

**Alternatives Considered**:
- **Regex**: Overly complex for this use case, harder to write correctly
- **Custom implementation**: Unnecessary reinvention
- **pathlib.match**: Designed for paths, not general string matching

### 3. Hot-Reload Mechanism

**Decision**: File watcher with debouncing + manual reload command

**Rationale**:
- `watchdog` library provides cross-platform file monitoring
- Debouncing prevents multiple reloads during rapid edits
- Manual reload command (`/reload-permissions`) as backup
- Graceful error handling keeps old config if new one is invalid

**Alternatives Considered**:
- **Polling**: Higher CPU usage, slower response
- **Signal-based (SIGHUP)**: Not portable to Windows
- **API endpoint**: Adds complexity, requires authentication

### 4. Default-Deny Security Model

**Decision**: Empty/missing config = no permissions (deny all)

**Rationale**:
- Security-first approach prevents accidental exposure
- Explicit is better than implicit
- Forces administrators to consciously enable capabilities
- Aligns with principle of least privilege

**Alternatives Considered**:
- **Default-allow**: Security risk, tools could run without review
- **Bundled defaults**: Harder to audit, may include unwanted tools

### 5. Permission Validation

**Decision**: Validate at load time + runtime checks

**Rationale**:
- Load-time validation catches config errors early
- Runtime checks ensure tools match allowed list
- Warn (don't fail) for non-existent tools in config (tool may be added later)
- Strict blocking for tools not in config

**Alternatives Considered**:
- **Load-time only**: Could miss dynamic tool additions
- **Runtime only**: Delays error discovery

### 6. Existing Codebase Integration

**Current State Analysis**:

1. **Tools** (`src/services/tools.py`):
   - `TOOLS` list contains tool definitions
   - `ToolExecutor` class has `allowed_tools` parameter already
   - Integration point: Pass filtered tools list to `ToolExecutor`

2. **Skills** (`src/services/skill_loader.py`):
   - `SkillLoader` loads skills from directory
   - Integration point: Filter loaded skills against permission config

3. **Claude Processor** (`src/services/claude_processor.py`):
   - Creates `ToolExecutor` and passes `TOOLS` to Claude API
   - Integration point: Filter `TOOLS` list before passing to API

**Decision**: Create `PermissionManager` singleton that:
- Loads config at startup
- Provides `is_tool_allowed(name)`, `is_skill_allowed(name)`, `is_mcp_allowed(name)` methods
- Watches for config changes and reloads
- Emits events on permission changes

## Configuration File Schema

```yaml
# permissions.yaml - Bot capability permissions
# Default behavior: deny all (if file missing or section empty)

version: "1.0"

# Global settings
settings:
  default_deny: true  # Explicit default-deny (recommended)
  log_denials: true   # Log all permission denials for audit

# Allowed tools (Claude tool use)
tools:
  allowed:
    - "list_directory"      # Exact match
    - "read_file"           # Exact match
    - "run_powershell"      # Allow PowerShell
    - "file_*"              # Wildcard: all file operations

  # Optional: tool-specific restrictions
  restrictions:
    run_powershell:
      allowed_commands:
        - "Get-*"           # Only Get commands
        - "Test-*"
      blocked_commands:
        - "*-Item"          # Block delete/move/copy

# Allowed skills (legacy skill system)
skills:
  allowed:
    - "calculator"
    - "weather"
    - "*"                   # Allow all skills (use with caution)

# Allowed MCPs (Model Context Protocol servers)
mcps:
  allowed:
    - "filesystem"
    - "github"

  # MCP-specific settings
  settings:
    filesystem:
      allowed_paths:
        - "/home/user/projects"
        - "C:\\Projects"
```

## Error Handling Strategy

| Scenario | Behavior |
|----------|----------|
| Config file missing | Use default-deny (no tools/skills/MCPs) |
| Config file malformed | Log error, keep previous config, alert admin |
| Invalid YAML syntax | Reject load, keep previous config |
| Unknown tool in allowed list | Warn in logs, ignore entry |
| Permission denied | Log denial, return clear error message to user |

## Performance Considerations

- Permission checks: O(n) where n = number of allowed patterns (typically <100)
- Use set lookup for exact matches, fnmatch for patterns
- Cache compiled patterns to avoid repeated parsing
- Config reload: Background thread, atomic swap of config object

## Dependencies to Add

```
PyYAML>=6.0        # YAML parsing
watchdog>=3.0      # File system monitoring for hot-reload
```
