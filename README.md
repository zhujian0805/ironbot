# Slack AI Agent

A TypeScript-based AI agent that integrates with Slack to provide conversational AI responses using Anthropic's Claude, with support for tool use (system operations) and extensible skills.

## Features

- **Slack Integration**: Listen for messages in Slack channels and respond with AI-generated content
- **Claude AI**: Powered by Anthropic's Claude model for high-quality responses
- **Thinking Indicator**: Shows "Thinking..." while processing, then updates with the response
- **Tool Use**: Execute system commands via Claude's tool use API
  - PowerShell commands (Windows)
  - Bash/shell commands (Linux/macOS)
  - Read and write files
  - List directory contents
- **Skill System**: Extensible skills loaded from a configurable directory
- **Async Processing**: Handles concurrent users efficiently
- **Structured Logging**: JSON-formatted logs for production monitoring
- **Safety Checks**: Blocks dangerous commands to prevent system damage
- **Permission System**: YAML-based configuration to control which tools, skills, and MCPs are allowed

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables in `.env`:
   ```env
   SLACK_BOT_TOKEN=your-slack-bot-token
   SLACK_APP_TOKEN=your-slack-app-token
   SLACK_SIGNING_SECRET=your-signing-secret
   ANTHROPIC_BASE_URL=https://api.anthropic.com
   ANTHROPIC_AUTH_TOKEN=your-api-key
   ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
   SKILLS_DIR=./skills
   PERMISSIONS_FILE=./permissions.yaml
   ```

3. Configure permissions in `permissions.yaml`:
   ```yaml
   version: "1.0"
   settings:
     default_deny: true
   tools:
     allowed:
       - "list_directory"
       - "read_file"
   skills:
     allowed: []
   mcps:
     allowed: []
   ```

4. Set up Slack App permissions:
   - **OAuth Scopes** (Bot Token Scopes):
     - `channels:read` - Read public channel information
     - `groups:read` - Read private channel information
     - `im:read` - Read direct message information
     - `mpim:read` - Read group direct message information
     - `chat:write` - Send messages as the bot
     - `app_mentions:read` - Read messages that mention the app
   - **Event Subscriptions**:
     - `message.channels` - Messages in public channels
     - `message.groups` - Messages in private channels
     - `message.im` - Direct messages
     - `message.mpim` - Group direct messages
   - **App-Level Token Scopes**:
     - `connections:write` - Required for Socket Mode

4. Run the agent (development):
   ```bash
   npm run dev -- --permissions-file ./permissions.yaml
   ```

5. Build and run (production):
   ```bash
   npm run build
   node dist/main.js --permissions-file ./permissions.yaml
   ```

## Permission Configuration

The bot uses a YAML configuration file to control which capabilities are allowed. See `permissions.yaml` for the full configuration.

### Basic Configuration

```yaml
version: "1.0"
settings:
  default_deny: true    # Deny unlisted capabilities
  log_denials: true     # Log all permission denials

tools:
  allowed:
    - "list_directory"  # Allow specific tools
    - "read_file"
    - "file_*"          # Wildcard patterns supported

resources:
  denied_paths:         # Block specific paths regardless of tool
    - "/etc/*"
    - "C:\\Windows\\*"
    - "*/.env"

skills:
  allowed: []           # Empty = deny all

mcps:
  allowed: []
```

### Key Features

- **Default Deny**: If a tool/skill/MCP is not in the allowed list, it's blocked
- **Wildcard Patterns**: Use `*` for flexible matching (e.g., `file_*` matches all file operations)
- **Resource Deny Rules**: Block specific paths even when the tool is allowed
- **Hot Reload**: Changes to `permissions.yaml` are detected automatically (via `chokidar`)
- **Audit Logging**: All permission denials are logged for security auditing

### CLI Options

```bash
node dist/main.js --permissions-file /path/to/custom-permissions.yaml
```

## Tool Use

The agent can execute system operations when asked. Available tools:

| Tool | Description | Example Request |
|------|-------------|-----------------|
| `run_powershell` | Execute PowerShell commands | "List all running processes" |
| `run_bash` | Execute Bash/shell commands | "Show disk usage" |
| `read_file` | Read file contents | "Show me the contents of config.py" |
| `write_file` | Write to files | "Create a file called test.txt with 'hello'" |
| `list_directory` | List directory contents | "What files are in the current folder?" |

### Safety

The following types of commands are blocked:
- Destructive commands (`rm -rf /`, `format`, etc.)
- System shutdown/reboot commands
- Fork bombs and similar attacks

## Development

- Run tests: `npm test`
- Run unit tests: `npm run test:unit`
- Run integration tests: `npm run test:integration`
- Run contract tests: `npm run test:contract`
- Typecheck: `npm run typecheck`
- Add skills: Create JavaScript/TypeScript modules in the skills directory with an `executeSkill(input: string)` export
- View logs: Structured JSON output to console

## Architecture

```
src/
├── cli/
│   └── args.ts            # CLI argument parsing
├── config.ts              # Configuration and client initialization
├── main.ts                # Application entry point
├── models/                # Data models
│   ├── claude_request.ts  # Claude request model
│   ├── claude_response.ts # Claude response model
│   ├── permission_policy.ts # Permission config models
│   ├── skill_definition.ts # Skill model
│   ├── slack_event.ts     # Slack event model
│   ├── tool_request.ts    # Tool request model
│   └── workflow.ts        # Workflow model
├── services/              # Business logic
│   ├── claude_processor.ts # Claude API + tool use loop
│   ├── message_router.ts  # Message orchestration
│   ├── permission_manager.ts # Permission enforcement
│   ├── skill_loader.ts    # Skill loading
│   ├── slack_handler.ts   # Slack event handling + thinking indicator
│   └── tools.ts           # Tool definitions and executor
└── utils/
    ├── file_watcher.ts    # Hot reload utility
    └── logging.ts         # Structured logging

tests/
├── cli/                   # CLI tests
├── contract/              # Contract tests
├── integration/           # Integration tests
└── unit/                  # Unit tests
```

## How It Works

1. User sends a message in Slack
2. Bot immediately posts "Thinking..." indicator
3. Message is forwarded to Claude with tool definitions
4. If Claude needs to use a tool:
   - Bot executes the tool (e.g., runs PowerShell command)
   - Result is sent back to Claude
   - Loop continues until Claude has a final answer
5. Bot updates the "Thinking..." message with the final response
