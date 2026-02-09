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

### Skill Triggering
- **Skill Trigger Control**: Skills can declare `metadata.openclaw.skillTriggers` inside their `SKILL.md`, specifying exact trigger words, a confidence score (0-1), and an `autoRoute` flag to opt out of automatic routing. When metadata is absent, IronBot falls back to heuristic triggers derived from the skill name or description.
- **Visibility & Instrumentation**: Auto-routing now logs trigger decisions (skill, trigger phrase, confidence, threshold, decision) so you can audit which messages triggered which skills.

### Scheduler Reliability
- **Verified cron persistence**: After `npm run cron -- add` writes a job, the CLI reloads `jobs.json` (via `IRONBOT_CRON_STORE_PATH` or `--store`) and confirms the new `CronJob` exists before reporting success, so you can trust the job ID reported in Slack matches what's on disk.
- **Direct-execution transparency**: Both Slack reminders and direct tool executions now echo the verified job details (name, schedule, next run) when they are confirmed, making it easier to audit automated work.

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

IronBot scans the workspace-defined `SKILLS_DIR` (default `./skills`), the user-level `~/.ironbot/skills`, and any folders listed in `IRONBOT_SKILL_PATHS`. Place skills in any of those directories and enable them via `permissions.yaml`.

3. Configure permissions in `permissions.yaml`:
   ```yaml
   tools:
     - priority: 100
       name: ".*"
       desc: "Allow everything while building the policy"
   mcps:
     - priority: 100
       name: ".*"
       desc: "Permit every MCP for now"
   commands:
     - priority: 100
       name: ".*"
       desc: "Allow all commands initially"
   skills:
     - priority: 100
       name: ".*"
       desc: "Enable every skill by default"
   resurces:
     - priority: 100
       name: ".*"
       desc: "Allow all resource paths"
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
- **`/clear`**: Clear conversation history and start fresh without previous context

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

#### Skill Triggering Controls
- `CLAUDE_AUTO_ROUTE_ENABLED` - Enable or disable auto-routing entirely (default: true)
- `CLAUDE_AUTO_ROUTE_CONFIDENCE` - Confidence threshold required for auto-routing (default: 0.5)
- `CLAUDE_AUTO_ROUTE_OPTOUT` - Comma-separated list of skill names to block from auto-routing even if they match (default: empty)

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

## Testing & Quality

- **Session cache integrity**: Tests now cover `loadSessionStore`, cache invalidation, entry creation, and route updates to ensure session metadata stays consistent when files are missing or change while cached.
- **Cron store verification**: Added unit coverage for the helper that reloads `jobs.json` after `cron` jobs are added so the CLI reports only verified entries when it confirms schedules.
- **Key validation suites**:
  ```bash
  npx vitest run tests/unit/sessions/store.test.ts
  npx vitest run tests/unit/cron/store_verification.test.ts
  ```

## Permission System

IronBot uses a comprehensive permission system to control what operations the bot can perform:

### Permission Configuration

The `permissions.yaml` file controls all bot capabilities:

IronBot now enforces permissions with a single, priority-driven allow list. The `permissions.yaml` file exposes just five sections (`tools`, `mcps`, `commands`, `skills`, and `resurces`), and each section contains policy entries that look like this:

```yaml
- priority: 10
  name: ".*"
  desc: "Allow everything for now"
```

- `priority` controls the evaluation order (lower numbers run first, higher numbers can act as catch-all denies or logging helpers).
- `name` is treated as a regular expression that must match tool names, skill names, MCP identifiers, command strings, or resource paths.
- `desc` documents why the entry exists.

The system is deny-by-default: if a requested capability does not match any entry, it is blocked. The current default policy in `permissions.yaml` temporarily allows everything so that you can start IronBot without additional work; just add tighter entries when you are ready to lock down the bot.

### Example configuration

```yaml
tools:
  - priority: 50
    name: "read_file"
    desc: "Allow read operations"
  - priority: 100
    name: ".*"
    desc: "Allow remaining tools during onboarding"

commands:
  - priority: 20
    name: "^read-"
    desc: "Permit read-style commands only"

skills:
  - priority: 10
    name: ".*"
    desc: "Enable every skill for now"

mcps:
  - priority: 10
    name: ".*"
    desc: "Allow all MCP listeners"

resurces:
  - priority: 5
    name: "/home/user/.*"
    desc: "Permit home directory paths"
```

Each section uses the same rule schema. To tighten access, add specific entries with precise regexes and keep catch-all rules at higher priority numbers. The `commands` section controls what strings are allowed to reach `run_powershell`/`run_bash`, and `resurces` governs the filesystem paths the bot can read or write.

### Inspecting behavior

Ask the bot “what tools can you use?” to see the currently allowed tools, skills, and MCPs. Logs report how many entries are loaded for each section at startup, so you know when the new policy is active.

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

Commands are only permitted if they match a `commands` policy entry. To prevent destructive mutations and system shutdowns, keep the command list tight and only allow specific prefixes (for example `^Get-` or `^read-`). Resource access also obeys the `resurces` list, so any file path outside the allowed patterns is rejected regardless of the tool being used.

## Skills System

IronBot supports extensible skills for specialized functionality. It loads skills from the workspace-defined `SKILLS_DIR` (default `./skills`) and the user-private `~/.ironbot/skills`. Drop skill directories or modules with `SKILL.md` in either location, enable them in `permissions.yaml`, and the loader will pick them up automatically. The built-in `skill_installer` now always installs skills into `~/.ironbot/skills`, so custom installers are kept separate from the workspace tree.

IronBot follows the OpenCode pattern of scanning multiple skill folders so you can share reusable skills across workspaces or keep personal helpers in your home directory.

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
   - Check `permissions.yaml` configuration (tools, skills, MCPs, commands, and resurces)
   - Verify the tool/skill is in the allowed list
   - Ensure the command or resource path matches the corresponding entries so it is not rejected by policy

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
