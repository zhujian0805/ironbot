# Quick Start: Slack AI Agent

## Prerequisites

- Python 3.11 or later
- Slack workspace with bot token
- Anthropic Claude API key
- Directory with Claude Skills (optional)

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd ironbot
   ```

2. Create virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install slack-sdk anthropic
   ```

## Configuration

Create a `.env` file in the project root:

```env
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
ANTHROPIC_API_KEY=your-claude-api-key
SKILLS_DIR=./skills  # Optional: directory containing Claude Skills
```

## Running the Agent

1. Start the agent:
   ```bash
   python src/main.py
   ```

2. In Slack, invite the bot to a channel or send direct messages

3. Test by sending a message like "Hello AI agent!"

## Development

- Run tests: `pytest`
- Add new skills: Place Python modules in the skills directory
- Check logs: Structured JSON logs are output to console

## Troubleshooting

- Ensure bot token has appropriate permissions (channels:history, chat:write)
- Verify Claude API key is valid and has credits
- Check network connectivity for API calls</content>
<parameter name="file_path">specs/1-slack-ai-agent/quickstart.md