# Data Model: Typed Codebase Migration

## Entities

### Workflow
Represents a primary user-visible workflow executed by the CLI agent.
- **id**: unique identifier (string)
- **name**: human-readable name
- **inputs**: configuration + environment inputs required
- **outputs**: expected stdout/stderr and side effects
- **status**: succeeded | failed

### PermissionPolicy
Represents the permissions configuration loaded from YAML.
- **version**: schema version
- **settings**: default allow/deny and logging flags
- **allowedTools**: list of allowed tool identifiers
- **deniedPaths**: list of resource patterns
- **allowedPaths**: list of resource patterns (if present)

### ToolRequest
Represents a tool execution request produced by the agent.
- **toolName**: identifier
- **arguments**: structured arguments for the tool
- **requestedResource**: path or resource target (optional)
- **decision**: allowed | denied
- **reason**: denial reason (if denied)

### SkillDefinition
Represents a loadable skill definition.
- **name**: unique skill identifier
- **description**: brief purpose
- **inputs**: expected input schema
- **permissions**: required permissions/allowlist entries

### SlackEvent
Represents an inbound Slack event handled by the agent.
- **eventType**: event name
- **userId**: user identifier
- **channelId**: channel identifier
- **text**: message text or payload summary
- **timestamp**: event time

### ClaudeRequest
Represents a request sent to the LLM provider.
- **model**: model identifier
- **messages**: conversation messages
- **tools**: tool list exposed
- **streaming**: boolean

### ClaudeResponse
Represents the model response.
- **content**: text output
- **toolCalls**: tool call payloads (if any)
- **usage**: token usage metadata (if available)

## Relationships

- **Workflow** uses **PermissionPolicy** and generates **ToolRequest** decisions.
- **SlackEvent** triggers a **Workflow** execution path.
- **SkillDefinition** influences available tools in **ClaudeRequest**.
- **ClaudeRequest** produces **ClaudeResponse**, which may invoke **ToolRequest**.
