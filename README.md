# Slack AI Agent

A Python-based AI agent that integrates with Slack to provide conversational AI responses using Anthropic's Claude, with support for tool use (system operations) and extensible skills.

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
   pip install -r requirements.txt
   ```

2. Configure environment variables in `.env`:
   ```env
   SLACK_BOT_TOKEN=your-slack-bot-token
   SLACK_APP_TOKEN=your-slack-app-token
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

4. Run the agent:
   ```bash
   python src/main.py
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
- **Hot Reload**: Changes to `permissions.yaml` are detected automatically (requires `watchdog`)
- **Audit Logging**: All permission denials are logged for security auditing

### CLI Options

```bash
python src/main.py --permissions-file /path/to/custom-permissions.yaml
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

- Run tests: `pytest`
- Run tool tests: `pytest tests/unit/test_tools.py -v`
- Add skills: Create Python modules in the skills directory with an `execute_skill(query: str) -> str` function
- View logs: Structured JSON output to console

## Architecture

```
src/
├── config.py              # Configuration and client initialization
├── main.py                # Application entry point
├── models/                # Data models
│   ├── message.py         # Message model
│   ├── user.py            # User model
│   ├── skill.py           # Skill model
│   └── permission.py      # Permission config models
├── services/              # Business logic
│   ├── slack_handler.py   # Slack event handling + thinking indicator
│   ├── claude_processor.py # Claude API + tool use loop
│   ├── skill_loader.py    # Legacy skill loading
│   ├── tools.py           # Tool definitions and executor
│   └── permission_manager.py # Permission enforcement
├── handlers/              # Request handlers
└── utils/                 # Utilities
    └── logging.py         # Structured logging

tests/
├── contract/              # Contract tests
│   └── test_permission_enforcement.py
├── integration/           # Integration tests
│   └── test_permission_reload.py
└── unit/                  # Unit tests
    ├── test_tools.py
    └── test_permission_manager.py
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
