# IronBot

A sophisticated TypeScript-based AI agent that integrates with Slack to provide conversational AI responses using Anthropic's Claude, with advanced memory management, tool use, and extensible skills.

## Overview

IronBot combines Claude AI with Slack integration to create an intelligent conversational assistant. It features:

- **Claude AI Integration**: Powered by Anthropic's latest models
- **Slack Integration**: Real-time responses in channels and DMs
- **Advanced Memory**: Session-based context with cross-session search
- **Tool Use**: Execute system commands and file operations safely
- **Extensible Skills**: Plugin architecture for custom capabilities
- **Windows Service**: Production-ready deployment with NSSM

## Quick Start

### Prerequisites
- [Bun](https://bun.sh/) runtime (required for SQLite)
- [Node.js](https://nodejs.org/) 18+ (alternative)
- Slack app with Socket Mode enabled
- NSSM (for Windows service deployment)

### Installation

```bash
bun install
```

### Configuration

1. **Slack App Setup**: Create app at https://api.slack.com/apps
   - Enable Socket Mode
   - Add scopes: `channels:read`, `groups:read`, `im:read`, `mpim:read`, `chat:write`, `app_mentions:read`
   - Subscribe to events: `message.channels`, `message.groups`, `message.im`, `message.mpim`

2. **Environment Variables** (`.env`):
```env
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
ANTHROPIC_AUTH_TOKEN=your-api-key
```

3. **Permissions** (`permissions.yaml`):
```yaml
tools:
  - priority: 100
    name: ".*"
    desc: "Allow everything initially"
skills:
  - priority: 100
    name: ".*"
    desc: "Enable all skills"
commands:
  - priority: 100
    name: ".*"
    desc: "Allow all commands"
mcps:
  - priority: 100
    name: ".*"
    desc: "Permit all MCPs"
resurces:
  - priority: 100
    name: ".*"
    desc: "Allow all paths"
```

### Running

**Development:**
```bash
bun run dev -- --permissions-file ./permissions.yaml
```

**Production:**
```bash
bun run build
bun run start -- --permissions-file ./permissions.yaml
```

**Windows Service:**
```bash
bun run service:install
bun run service:start
```

## Key Features

### Memory System
- **Session Memory**: Each thread maintains conversation context
- **Cross-Session Search**: Access historical conversations with `/remember`
- **Vector Search**: Semantic search through conversation history
- **Persistent Storage**: SQLite database with embeddings

### Tool Integration
- **PowerShell/Bash**: Execute system commands safely
- **File Operations**: Read, write, and manage files
- **Permission Controls**: YAML-based security policies

### Skills System
Extensible plugin architecture with auto-discovery:
- Skills loaded from `./skills` and `~/.ironbot/skills`
- Auto-routing based on confidence scores
- Hot-reload capabilities

### Service Management
Complete Windows service integration:
- NSSM-based deployment
- Service lifecycle management
- Structured logging and monitoring
- Automatic restarts

## Configuration

### Core Environment Variables
- `SLACK_BOT_TOKEN` - Bot token (required)
- `SLACK_APP_TOKEN` - App token for Socket Mode (required)
- `ANTHROPIC_AUTH_TOKEN` - Claude API key (required)
- `ANTHROPIC_MODEL` - Model selection (default: claude-3-5-sonnet-20241022)

### Memory Settings
- `IRONBOT_MEMORY_CROSS_SESSION=true` - Enable cross-session access
- `IRONBOT_MEMORY_SESSION_INDEXING=false` - Enable conversation indexing
- `IRONBOT_MEMORY_MAX_RESULTS=6` - Search result limits

### Service Commands
- `bun run service:install` - Install Windows service
- `bun run service:start` - Start service
- `bun run service:stop` - Stop service
- `bun run service:status` - Check status
- `bun run service:logs` - View logs
- `bun run service:restart` - Restart service
- `bun run service:uninstall` - Remove service

## Development

### Testing
```bash
bun run test              # All tests
bun run test:unit         # Unit tests
bun run test:integration  # Integration tests
bun run typecheck         # Type checking
```

### Project Structure
```
src/
├── cli/                 # Command-line interface
├── services/            # Core business logic
│   ├── windows-service/ # Windows service management
│   └── [other services]
├── memory/              # Memory management system
├── sessions/            # Session handling
└── utils/               # Utilities
```

## Troubleshooting

### Common Issues
1. **"Cannot find module 'bun:sqlite'"** → Use Bun runtime, not Node.js
2. **Slack connection fails** → Verify tokens and Socket Mode setup
3. **Permission denied** → Check `permissions.yaml` configuration
4. **Service won't start** → Check logs with `bun run service:logs`

### Health Checks
Bot performs startup validation for Slack and Claude API connectivity. Use `--skip-health-checks` to bypass during development.

## Contributing

1. Fork and create feature branch
2. Add tests for new functionality
3. Ensure all tests pass
4. Submit pull request

## License

See LICENSE file for terms.