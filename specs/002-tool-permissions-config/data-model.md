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

## TypeScript Interfaces

```ts
export interface GlobalSettings {
  default_deny: boolean;
  log_denials: boolean;
}

export interface ToolRestriction {
  allowed_commands: string[];
  blocked_commands: string[];
  allowed_paths: string[];
  timeout_max?: number;
}

export interface ToolPermissions {
  allowed: string[];
  restrictions: Record<string, ToolRestriction>;
}

export interface SkillPermissions {
  allowed: string[];
}

export interface MCPSettings {
  allowed_paths: string[];
  allowed_repos: string[];
}

export interface MCPPermissions {
  allowed: string[];
  settings: Record<string, MCPSettings>;
}

export interface PermissionConfig {
  version: string;
  settings: GlobalSettings;
  tools: ToolPermissions;
  skills: SkillPermissions;
  mcps: MCPPermissions;
}
```
