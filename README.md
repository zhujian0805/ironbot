# Slack AI Agent

A Python-based AI agent that integrates with Slack to provide conversational AI responses using Anthropic's Claude, with support for extensible skills.

## Features

- **Slack Integration**: Listen for messages in Slack channels and respond with AI-generated content
- **Claude AI**: Powered by Anthropic's Claude 3.5 Sonnet model for high-quality responses
- **Skill System**: Extensible skills loaded from a configurable directory
- **Async Processing**: Handles concurrent users efficiently
- **Structured Logging**: JSON-formatted logs for production monitoring

## Quick Start

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Configure environment variables in `.env`:
   ```env
   SLACK_BOT_TOKEN=your-slack-bot-token
   SLACK_APP_TOKEN=your-slack-app-token
   ANTHROPIC_BASE_URL=https://10.189.8.10:5000
   ANTHROPIC_AUTH_TOKEN=dummy
   ANTHROPIC_MODEL=gpt-5-mini
   ANTHROPIC_DEFAULT_SONNET_MODEL=gpt-5-mini
   ANTHROPIC_SMALL_FAST_MODEL=gpt-5-mini
   ANTHROPIC_DEFAULT_HAIKU_MODEL=gpt-5-mini
   DISABLE_NON_ESSENTIAL_MODEL_CALLS=1
   CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
   CLAUDE_CODE_ATTRIBUTION_HEADER=0
   SKILLS_DIR=./skills
   ```

3. Set up Slack App permissions:
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

## Development

- Run tests: `pytest`
- Add skills: Create Python modules in the skills directory with an `execute_skill(query: str) -> str` function
- View logs: Structured JSON output to console

## Architecture

- `src/config.py`: Configuration and client initialization
- `src/models/`: Data models for messages, users, and skills
- `src/services/`: Business logic for Slack handling, Claude processing, and skill loading
- `src/utils/`: Logging utilities
- `tests/`: Contract and integration tests