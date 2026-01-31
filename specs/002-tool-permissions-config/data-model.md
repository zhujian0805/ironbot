# Data Model: Tool Permissions Configuration

**Feature**: 002-tool-permissions-config
**Date**: 2026-01-31

## Entities

### PermissionConfig

The root configuration object loaded from YAML.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| version | string | Yes | Config schema version (e.g., "1.0") |
| settings | GlobalSettings | No | Global permission settings |
| tools | ToolPermissions | No | Tool permission configuration |
| skills | SkillPermissions | No | Skill permission configuration |
| mcps | MCPPermissions | No | MCP permission configuration |

### GlobalSettings

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| default_deny | boolean | true | If true, deny unlisted capabilities |
| log_denials | boolean | true | Log all permission denials |

### ToolPermissions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| allowed | list[string] | No | List of allowed tool names/patterns |
| restrictions | dict[string, ToolRestriction] | No | Per-tool restrictions |

### ToolRestriction

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| allowed_commands | list[string] | No | Patterns for allowed command arguments |
| blocked_commands | list[string] | No | Patterns for blocked command arguments |
| allowed_paths | list[string] | No | Allowed working directories |
| timeout_max | integer | No | Maximum allowed timeout in seconds |

### SkillPermissions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| allowed | list[string] | No | List of allowed skill names/patterns |

### MCPPermissions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| allowed | list[string] | No | List of allowed MCP identifiers/patterns |
| settings | dict[string, MCPSettings] | No | Per-MCP settings |

### MCPSettings

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| allowed_paths | list[string] | No | Allowed filesystem paths |
| allowed_repos | list[string] | No | Allowed repository patterns |

## State Transitions

### PermissionManager States

```
[Uninitialized] --load()--> [Active]
[Active] --reload()--> [Reloading] --success--> [Active]
[Active] --reload()--> [Reloading] --failure--> [Active] (keep old config)
[Active] --shutdown()--> [Stopped]
```

### Permission Check Flow

```
Request arrives
    |
    v
Is capability type valid? (tool/skill/mcp)
    |-- No --> Return error
    |-- Yes
    v
Is capability in allowed list?
    |-- No --> Log denial, return PermissionDenied
    |-- Yes
    v
Does capability have restrictions?
    |-- No --> Allow
    |-- Yes
    v
Do arguments pass restrictions?
    |-- No --> Log denial, return PermissionDenied
    |-- Yes --> Allow
```

## Validation Rules

### Config File Validation

1. `version` must be a valid semver string
2. `allowed` lists must contain only strings
3. Wildcard patterns must be valid fnmatch patterns
4. Restriction fields must match expected types

### Runtime Validation

1. Tool names must be non-empty strings
2. Skill names must be non-empty strings
3. MCP identifiers must be non-empty strings
4. Command arguments checked against restrictions when applicable

## Relationships

```
PermissionConfig
├── GlobalSettings (1:1)
├── ToolPermissions (1:1)
│   └── ToolRestriction (1:N, keyed by tool name)
├── SkillPermissions (1:1)
└── MCPPermissions (1:1)
    └── MCPSettings (1:N, keyed by MCP name)
```

## Python Data Classes

```python
from dataclasses import dataclass, field
from typing import Optional

@dataclass
class GlobalSettings:
    default_deny: bool = True
    log_denials: bool = True

@dataclass
class ToolRestriction:
    allowed_commands: list[str] = field(default_factory=list)
    blocked_commands: list[str] = field(default_factory=list)
    allowed_paths: list[str] = field(default_factory=list)
    timeout_max: Optional[int] = None

@dataclass
class ToolPermissions:
    allowed: list[str] = field(default_factory=list)
    restrictions: dict[str, ToolRestriction] = field(default_factory=dict)

@dataclass
class SkillPermissions:
    allowed: list[str] = field(default_factory=list)

@dataclass
class MCPSettings:
    allowed_paths: list[str] = field(default_factory=list)
    allowed_repos: list[str] = field(default_factory=list)

@dataclass
class MCPPermissions:
    allowed: list[str] = field(default_factory=list)
    settings: dict[str, MCPSettings] = field(default_factory=dict)

@dataclass
class PermissionConfig:
    version: str = "1.0"
    settings: GlobalSettings = field(default_factory=GlobalSettings)
    tools: ToolPermissions = field(default_factory=ToolPermissions)
    skills: SkillPermissions = field(default_factory=SkillPermissions)
    mcps: MCPPermissions = field(default_factory=MCPPermissions)
```
