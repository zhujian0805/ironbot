# Data Model: Tool Permissions Configuration

**Feature**: 002-tool-permissions-config  
**Date**: 2026-02-04

## Entities

### PermissionPolicy

This is the root configuration object loaded from `permissions.yaml`. It has five ordered sections:

| Field | Type | Description |
|-------|------|-------------|
| `tools` | list[`PolicyEntry`] | Tool names and glob/regex patterns that are permitted |
| `mcps` | list[`PolicyEntry`] | Allowed Model Context Protocol identifiers |
| `commands` | list[`PolicyEntry`] | Regex patterns that describe commands the bot may execute |
| `skills` | list[`PolicyEntry`] | Skill names or patterns that can be invoked |
| `resurces` | list[`PolicyEntry`] | Filesystem paths the bot is allowed to touch (note the intentional spelling) |

The policy is deny-by-default: only matching entries (by `name`) are allowed. `priority` controls evaluation order to let you add specific rules before catch-all entries.

### PolicyEntry

Each entry in a section has three required fields:

| Field | Type | Description |
|-------|------|-------------|
| `priority` | integer | Lower numbers run first; high values can act as catch-all fallbacks or denies |
| `name` | string | Regular expression matched against the requested resource |
| `desc` | string | Human-readable description recorded in logs |

Ordering matters: if multiple entries match, the one with the lowest `priority` is evaluated first.

## State Transitions

### PermissionManager Lifecycle

```
[uninitialized] -- loadConfig() --> [active]
[active] -- reloadConfig() --> [reloading] -- success --> [active]
[active] -- reloadConfig() --> [reloading] -- failure --> [active] (keep previous)
[active] -- stopFileWatcher() --> [stopped]
```

### Permission Check Flow

```
Request enters
    |
    v
Does section contain a matching PolicyEntry?
    |-- No --> Deny (default)
    |-- Yes
    v
Allow the requested capability
```

Commands and resource paths are matched against their respective sections (`commands` and `resurces`) in addition to tool/skill/MCP checks.

## Validation Rules

### Config Schema

1. Each top-level key must be one of the five allowed sections.
2. Each section must be a list of policy entries with integer priority, string name, and string description.
3. `name` strings should be compatible regular expressions.
4. No additional keys are permitted (`email`, `settings`, `blocked_commands`, etc. are not part of the schema).

### Runtime Enforcement

1. Tool names, skill names, and MCP identifiers must be non-empty strings.
2. Every command string is tested against the `commands` entries before dispatching to `run_powershell` or `run_bash`.
3. Resource paths are normalized (backslashes converted to slashes) and matched against `resurces` entries before any filesystem access.

## TypeScript Interfaces

```ts
export type PolicyEntry = {
  priority: number;
  name: string;
  desc: string;
};

export type PermissionPolicy = {
  tools: PolicyEntry[];
  mcps: PolicyEntry[];
  commands: PolicyEntry[];
  skills: PolicyEntry[];
  resurces: PolicyEntry[];
  resources?: PolicyEntry[];
};
```

## Relationships

```
PermissionPolicy
├── tools (list of PolicyEntry)
├── mcps (list of PolicyEntry)
├── commands (list of PolicyEntry)
├── skills (list of PolicyEntry)
└── resurces (list of PolicyEntry)
```
