# IronBot - Advanced Slack AI Agent

A sophisticated TypeScript-based AI agent that integrates with Slack to provide conversational AI responses using Anthropic's Claude, with advanced memory management, tool use (system operations), and extensible skills.

## Features

### Core AI Integration
- **Claude AI**: Powered by Anthropic's Claude model for high-quality responses
- **Slack Integration**: Listen for messages in Slack channels and respond with AI-generated content
- **Thinking Indicator**: Shows "Thinking..." while processing, then updates with the response
- **Async Processing**: Handles concurrent users efficiently
- **Structured Logging**: JSON-formatted logs for production monitoring

### Memory & Context Management
- **Session-Based Memory**: Each Slack thread maintains its own conversation context
- **Cross-Session Memory**: Access to historical conversations across all threads when enabled
- **Vector Search**: Semantic search through conversation history using embeddings
- **Long-term Memory**: Markdown files for persistent knowledge storage
- **Memory Commands**: `/remember` command to enable cross-session memory access

### Tool Use & System Operations
- **PowerShell Commands**: Execute PowerShell commands (Windows)
- **Bash/Shell Commands**: Execute shell commands (Linux/macOS)
- **File Operations**: Read, write, and list files and directories
- **Safety Checks**: Blocks dangerous commands to prevent system damage
- **Permission System**: YAML-based configuration to control tool access

### Extensibility
- **Skill System**: Extensible skills loaded from a configurable directory
- **Hot Reload**: Automatic reloading of permissions and skills
- **Plugin Architecture**: Easy to add new capabilities

### Security & Permissions
- **Default Deny**: Deny-all security model with explicit allow lists
- **Resource Protection**: Block specific paths and dangerous operations
- **Audit Logging**: All permission denials are logged for security monitoring
- **Wildcard Patterns**: Flexible permission matching with wildcards

## Quick Start

### Prerequisites
- **Bun** runtime (required for SQLite memory indexing)
- **Node.js** 18+ (alternative runtime)
- **Slack App** with proper permissions configured

### Installation

1. Install dependencies:
   ```bash
   bun install
   # or
   npm install
   ```

   **Note**: Bun is required to run the app because memory indexing uses `bun:sqlite`.

2. Configure environment variables in `.env`:
   ```env
   # Slack Configuration
   SLACK_BOT_TOKEN=xoxb-your-bot-token
   SLACK_APP_TOKEN=xapp-your-app-token

   # Claude AI Configuration
   ANTHROPIC_BASE_URL=https://api.anthropic.com
   ANTHROPIC_AUTH_TOKEN=your-api-key
   ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

   # Optional: Memory Configuration
   IRONBOT_MEMORY_CROSS_SESSION=false
   IRONBOT_MEMORY_SESSION_INDEXING=true

   # Optional: Custom Paths
   SKILLS_DIR=./skills
   PERMISSIONS_FILE=./permissions.yaml
   IRONBOT_STATE_DIR=~/.ironbot
   ```

3. Configure permissions in `permissions.yaml`:
   ```yaml
   version: "1.0"
   settings:
     default_deny: true
     log_denials: true

   tools:
     allowed:
       - "list_directory"
       - "read_file"
       - "run_powershell"
       - "run_bash"

   resources:
     denied_paths:
       - "/etc/*"
       - "C:\\Windows\\*"

   skills:
     allowed: []

   mcps:
     allowed: []
   ```

### Slack App Setup

1. Create a new Slack App at https://api.slack.com/apps
2. Enable Socket Mode in the app settings
3. Add the following OAuth scopes:
   - `channels:read` - Read public channel information
   - `groups:read` - Read private channel information
   - `im:read` - Read direct message information
   - `mpim:read` - Read group direct message information
   - `chat:write` - Send messages as the bot
   - `app_mentions:read` - Read messages that mention the app
4. Subscribe to these events:
   - `message.channels` - Messages in public channels
   - `message.groups` - Messages in private channels
   - `message.im` - Direct messages
   - `message.mpim` - Group direct messages
5. Generate and copy the tokens from the app settings

### Running the Bot

**Development:**
```bash
bun run dev -- --permissions-file ./permissions.yaml
```

**Production:**
```bash
bun run build
bun run start -- --permissions-file ./permissions.yaml
```

## Memory System

IronBot includes a sophisticated memory system for maintaining context across conversations:

### Memory Storage Locations
- **SQLite Database**: `~/.ironbot/memory/main.sqlite` - Indexed conversation chunks with embeddings
- **Session Transcripts**: `~/.ironbot/agents/main/sessions/` - Complete conversation history
- **Long-term Memory**: `~/.ironbot/workspace/MEMORY.md` - Persistent knowledge files
- **Daily Memory**: `~/.ironbot/workspace/memory/YYYY-MM-DD.md` - Daily notes

### Memory Features
- **Session Isolation**: Each Slack thread has its own memory context
- **Cross-Session Access**: Use `/remember` command to access all historical conversations
- **Semantic Search**: Vector-based search through conversation history
- **Automatic Indexing**: Conversations are automatically indexed for fast retrieval

### Memory Commands
- **`/remember`**: Enable cross-session memory for the current channel/thread
- **`/new`**: Start a fresh conversation without previous context

## Configuration

### Environment Variables

#### Core Configuration
- `SLACK_BOT_TOKEN` - Slack bot token (required)
- `SLACK_APP_TOKEN` - Slack app token for Socket Mode (required)
- `ANTHROPIC_AUTH_TOKEN` - Claude API key (required)
- `ANTHROPIC_MODEL` - Claude model to use (default: claude-3-5-sonnet-20241022)
- `ANTHROPIC_BASE_URL` - Claude API base URL (default: https://api.anthropic.com)

#### Paths & Directories
- `SKILLS_DIR` - Directory containing skill files (default: ./skills)
- `PERMISSIONS_FILE` - Path to permissions configuration (default: ./permissions.yaml)
- `IRONBOT_STATE_DIR` - Base directory for all bot state (default: ~/.ironbot)
- `IRONBOT_MEMORY_WORKSPACE_DIR` - Directory for memory files (default: ~/.ironbot/workspace)

#### Memory Configuration
- `IRONBOT_MEMORY_CROSS_SESSION` - Enable cross-session memory by default (default: false)
- `IRONBOT_MEMORY_SESSION_INDEXING` - Index conversations for memory search (default: false)
- `IRONBOT_MEMORY_INDEX_PATH` - Custom path for memory database
- `IRONBOT_MEMORY_VECTOR_WEIGHT` - Weight for vector search (default: 0.7)
- `IRONBOT_MEMORY_TEXT_WEIGHT` - Weight for text search (default: 0.3)

#### Session Management
- `IRONBOT_SESSIONS_STORE_PATH` - Path to session store file
- `IRONBOT_SESSIONS_TRANSCRIPTS_DIR` - Directory for session transcripts
- `IRONBOT_DM_SESSION_KEY` - Session key for direct messages
- `IRONBOT_SESSION_HISTORY_MAX` - Maximum messages to keep in history (default: 12)

#### Logging & Debug
- `DEBUG` - Enable debug mode (boolean)
- `LOG_LEVEL` - Logging level: DEBUG, INFO, WARNING, ERROR (default: INFO)
- `LOG_FILE` - Optional file path for logging
- `DEV_MODE` - Enable development features (boolean)

#### Retry & Timeout
- `IRONBOT_RETRY_MAX_ATTEMPTS` - Maximum retry attempts (default: 3)
- `IRONBOT_SLACK_RETRY_MAX_ATTEMPTS` - Slack-specific retry attempts (default: 3)
- `IRONBOT_SLACK_RETRY_BASE_DELAY_MS` - Base delay for Slack retries (default: 1000)
- `IRONBOT_SLACK_RETRY_MAX_DELAY_MS` - Max delay for Slack retries (default: 30000)

### CLI Options

```bash
bun run dev [options]

Options:
  --debug                    Enable debug logging
  --log-level <level>        Override log level (DEBUG, INFO, WARNING, ERROR)
  --log-file <path>          Optional file to write logs to
  --permissions-file <path>  Path to permissions.yaml configuration file
  --skip-health-checks       Skip startup health checks
  --help                     Display help information
```

## Permission System

IronBot uses a comprehensive permission system to control what operations the bot can perform:

### Permission Configuration

The `permissions.yaml` file controls all bot capabilities:

```yaml
version: "1.0"
settings:
  default_deny: true          # Enforce deny-by-default security
  log_denials: true           # Log all permission denials
  enable_override_prompt: false # Allow user prompts for overrides

# Global blocked commands (applied to all tools)
blocked_commands:
  - "rm -rf /"
  - "format "
  - "shutdown"

# Allow specific tools
tools:
  allowed:
    - "list_directory"
    - "read_file"
    - "run_powershell"

  # Per-tool restrictions
  restrictions:
    run_powershell:
      allowed_commands: ["Get-Disk", "Get-Volume"]
      blocked_commands: ["format"]
      timeout_max: 30
      override_prompt: false

# Block specific resource paths
resources:
  denied_paths:
    - "/etc/*"
    - "C:\\Windows\\*"
    - "*/.env"

# Allow specific skills
skills:
  allowed: []

# Allow specific MCPs
mcps:
  allowed: []
```

### Permission Features

- **Default Deny**: Only explicitly allowed operations are permitted
- **Wildcard Support**: Use `*` for flexible pattern matching
- **Resource Protection**: Block specific paths regardless of tool permissions
- **Per-Tool Restrictions**: Fine-grained control over individual tools
- **Audit Logging**: All permission decisions are logged
- **Hot Reload**: Permission changes take effect immediately

## Tool Use

IronBot can execute system operations when requested by users:

| Tool | Description | Example Request |
|------|-------------|-----------------|
| `run_powershell` | Execute PowerShell commands | "List all running processes" |
| `run_bash` | Execute Bash/shell commands | "Show disk usage" |
| `read_file` | Read file contents | "Show me the contents of config.ts" |
| `write_file` | Write to files | "Create a file called test.txt" |
| `list_directory` | List directory contents | "What files are in the current folder?" |

### Safety Features

The following types of commands are automatically blocked:
- Destructive operations (`rm -rf /`, `format`, etc.)
- System shutdown/reboot commands
- Fork bombs and similar attacks
- Access to protected system directories
- Operations on blocked file paths

## Skills System

IronBot supports extensible skills for specialized functionality:

### Creating Skills

Skills are JavaScript/TypeScript modules that export an `executeSkill` function:

```typescript
// skills/my-skill.ts
export const executeSkill = async (input: string): Promise<string> => {
  // Process input and return response
  return `Processed: ${input}`;
};
```

### Using Skills

Invoke skills in messages using the `@` prefix:
```
@my-skill analyze this data
```

### Built-in Skills

- **permission_check**: Display current permission configuration and test blocking

## Architecture

```
src/
├── cli/
│   └── args.ts                 # CLI argument parsing
├── config.ts                   # Configuration management
├── main.ts                     # Application entry point
├── models/                     # TypeScript interfaces
│   ├── claude_request.ts       # Claude API request models
│   ├── claude_response.ts      # Claude API response models
│   ├── permission_policy.ts    # Permission configuration models
│   ├── skill_definition.ts     # Skill models
│   ├── slack_event.ts          # Slack event models
│   ├── tool_request.ts         # Tool request models
│   └── workflow.ts             # Workflow models
├── memory/                     # Memory management system
│   ├── manager.ts              # Memory indexing and search
│   ├── embeddings.ts           # Vector embeddings
│   ├── search.ts               # Hybrid search implementation
│   └── memory_schema.ts        # SQLite schema
├── services/                   # Business logic
│   ├── claude_processor.ts     # Claude API + tool use loop
│   ├── message_router.ts       # Message orchestration
│   ├── permission_manager.ts   # Permission enforcement
│   ├── skill_loader.ts         # Skill loading system
│   ├── slack_handler.ts        # Slack event handling
│   └── tools.ts                # Tool definitions and executor
├── sessions/                   # Session management
│   ├── session_key.ts          # Session key generation
│   ├── store.ts                # Session persistence
│   ├── transcript.ts           # Conversation transcripts
│   └── types.ts                # Session type definitions
└── utils/
    ├── file_watcher.ts         # Hot reload utility
    ├── logging.ts              # Structured logging
    └── slack_formatter.ts      # Slack markdown formatting
```

## Development

### Testing

```bash
# Run all tests
bun run test

# Run unit tests only
bun run test:unit

# Run integration tests
bun run test:integration

# Run contract tests
bun run test:contract

# Type checking
bun run typecheck
```

### Adding Skills

1. Create a new file in the skills directory
2. Export an `executeSkill` function that takes a string and returns a Promise<string>
3. Add the skill to the allowed list in `permissions.yaml`

### Adding Tools

1. Define the tool in `src/services/tools.ts`
2. Add permission checks in the tool executor
3. Update the permissions configuration

### Memory Development

The memory system uses:
- **SQLite** for indexed storage with Bun's native SQLite support
- **Vector embeddings** for semantic search
- **Hybrid search** combining vector similarity and text matching
- **Session isolation** with optional cross-session access

## Troubleshooting

### Common Issues

1. **"Cannot find module 'bun:sqlite'"**
   - Ensure you're using Bun runtime, not Node.js
   - Memory features require Bun for SQLite support

2. **Slack connection fails**
   - Verify all three tokens are correctly set
   - Check Slack app permissions and event subscriptions
   - Ensure Socket Mode is enabled

3. **Permission denied errors**
   - Check `permissions.yaml` configuration
   - Verify the tool/skill is in the allowed list
   - Check for blocked paths or commands

4. **Memory not working**
   - Ensure `IRONBOT_MEMORY_SESSION_INDEXING=true`
   - Check memory database permissions
   - Verify embedding provider configuration

### Logs

IronBot uses structured JSON logging. Set `LOG_LEVEL=DEBUG` for detailed information.

### Health Checks

The bot performs startup health checks for:
- Slack API connectivity
- Claude API connectivity

Use `--skip-health-checks` to bypass these checks during development.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

This project is licensed under the terms specified in the LICENSE file.
