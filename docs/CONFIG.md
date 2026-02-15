# Configuration Guide for Ironbot

Ironbot now supports configuration via JSON config file (`ironbot.json`) with fallback to environment variables (`.env`).

## Configuration Priority

The configuration system loads settings in this order (highest to lowest priority):
1. **CLI arguments** - Command-line flags passed to the application
2. **JSON config file** (`ironbot.json`) - Main configuration file
3. **Environment variables** (`.env`) - Legacy support for environment variables
4. **Default values** - Built-in fallback values

## Using JSON Configuration

### 1. Create `ironbot.json`

Copy the example file and customize:

```bash
cp ironbot.json.example ironbot.json
```

Then edit `ironbot.json` with your actual configuration values.

### 2. Location Resolution

The application looks for `ironbot.json` in this order:
- Path specified in `IRONBOT_CONFIG` environment variable
- Current working directory: `./ironbot.json`
- Config subdirectory: `./config/ironbot.json`

### 3. Configuration Structure

#### Slack Integration
```json
{
  "slack": {
    "botToken": "xoxb-your-token",
    "appToken": "xapp-1-your-token"
  }
}
```

#### LLM Provider Selection

**Using Anthropic (Claude)**:
```json
{
  "llmProvider": {
    "provider": "anthropic",
    "anthropic": {
      "apiKey": "sk-ant-your-key",
      "baseUrl": "https://api.anthropic.com",
      "model": "claude-3-5-sonnet-20241022"
    }
  }
}
```

**Using OpenAI**:
```json
{
  "llmProvider": {
    "provider": "openai",
    "openai": {
      "apiKey": "sk-your-openai-key",
      "baseUrl": "https://api.openai.com/v1",
      "model": "gpt-4o"
    }
  }
}
```

**Using Google Gemini**:
```json
{
  "llmProvider": {
    "provider": "google",
    "google": {
      "apiKey": "your-google-key",
      "baseUrl": "https://generativelanguage.googleapis.com",
      "model": "gemini-2.0-flash"
    }
  }
}
```

#### Logging Configuration
```json
{
  "logging": {
    "debug": false,
    "level": "INFO",
    "file": "./logs/ironbot.log"
  }
}
```

#### Skill Configuration
```json
{
  "skills": {
    "directory": "./skills"
  }
}
```

#### Cron Jobs
```json
{
  "cron": {
    "enabled": true,
    "storePath": "./cron/jobs.json"
  }
}
```

#### Memory and Sessions
```json
{
  "sessions": {
    "maxHistoryMessages": 12
  },
  "memory": {
    "sessionIndexing": false
  },
  "memorySearch": {
    "enabled": true,
    "vectorWeight": 0.7,
    "textWeight": 0.3,
    "candidateMultiplier": 4,
    "maxResults": 6,
    "minScore": 0.35,
    "sources": ["memory"],
    "crossSessionMemory": true
  }
}
```

#### Retry and Rate Limiting
```json
{
  "retry": {
    "maxAttempts": 3,
    "baseDelayMs": 2000,
    "maxDelayMs": 60000,
    "backoffMultiplier": 2.0,
    "jitterMax": 0.1
  },
  "slack_rate_limit": {
    "enabled": true,
    "requestsPerSecond": 2,
    "burstCapacity": 5,
    "queueSize": 20
  },
  "slack_retry": {
    "maxAttempts": 5,
    "baseDelayMs": 15000,
    "maxDelayMs": 300000
  }
}
```

## Environment Variable Fallback

If a JSON config file is not found, the system falls back to `.env` environment variables.

### Supported Environment Variables

**Slack**:
- `SLACK_BOT_TOKEN` - Slack bot token
- `SLACK_APP_TOKEN` - Slack app token

**Anthropic**:
- `ANTHROPIC_BASE_URL` - Anthropic API base URL
- `ANTHROPIC_AUTH_TOKEN` - Anthropic API key
- `ANTHROPIC_MODEL` - Model to use (default: claude-3-5-sonnet-20241022)

**LLM Provider**:
- `LLM_PROVIDER` - Provider selection: `anthropic`, `openai`, `google`, `groq`, `mistral`, etc.
- `ANTHROPIC_API_KEY` - API key for Anthropic
- `OPENAI_API_KEY` - API key for OpenAI
- `GOOGLE_API_KEY` - API key for Google
- `OPENAI_MODEL` - Model for OpenAI (default: gpt-4o)
- `GOOGLE_MODEL` - Model for Google (default: gemini-2.0-flash)

**Skills**:
- `SKILLS_DIR` - Directory containing skill scripts

**Logging**:
- `DEBUG` - Enable debug logging (true/false)
- `LOG_LEVEL` - Logging level (DEBUG, INFO, WARNING, ERROR)
- `LOG_FILE` - Path to log file

**Permissions**:
- `PERMISSIONS_FILE` - Path to permissions.yaml

**Development**:
- `DEV_MODE` - Enable development mode (true/false)

**Cron**:
- `IRONBOT_CRON_STORE_PATH` - Path to cron jobs storage

## Migration from .env to JSON Config

To convert your existing `.env` file to `ironbot.json`:

1. Copy `ironbot.json.example` to `ironbot.json`
2. Map your `.env` variables to the JSON structure above
3. Common mappings:
   - `SLACK_BOT_TOKEN` → `slack.botToken`
   - `SLACK_APP_TOKEN` → `slack.appToken`
   - `ANTHROPIC_AUTH_TOKEN` → `anthropic.authToken`
   - `ANTHROPIC_BASE_URL` → `anthropic.baseUrl`
   - `SKILLS_DIR` → `skills.directory`
   - `DEBUG` → `logging.debug`
   - `LOG_LEVEL` → `logging.level`

## Secrets Management

For security, avoid committing sensitive values in `ironbot.json`:

1. **Option 1: Use environment variables**
   - Set sensitive values in `.env` (don't commit)
   - Reference them by setting `ironbot.json` to use env vars only

2. **Option 2: Use `.gitignore`**
   ```
   irbot.json          # Ignore your instance config
   !ironbot.json.example # But commit the example
   ```

3. **Option 3: Separate secrets file**
   Create `ironbot.secrets.json` (gitignored) and merge it at runtime

## Example: Development vs Production

**Development (`ironbot.dev.json`)**:
```json
{
  "logging": { "debug": true, "level": "DEBUG" },
  "dev": { "mode": true },
  "anthropic": { "baseUrl": "http://localhost:5000" }
}
```

**Production (`ironbot.json`)**:
```json
{
  "logging": { "debug": false, "level": "INFO" },
  "dev": { "mode": false },
  "anthropic": { "baseUrl": "https://api.anthropic.com" }
}
```

Then run:
```bash
# Development
IRONBOT_CONFIG=ironbot.dev.json bun src/main.ts

# Production
bun src/main.ts
```

## Validation

To validate your `ironbot.json` syntax:

```bash
# Using Node.js
node -e "console.log(JSON.parse(require('fs').readFileSync('ironbot.json')))"

# Using jq (if installed)
jq . ironbot.json
```

## Troubleshooting

**Config not loading?**
- Check `IRONBOT_CONFIG` env var points to correct path
- Verify JSON syntax with a JSON validator
- Check file permissions are readable
- Look for console warnings during startup

**Env vars taking precedence?**
- Delete `ironbot.json` file or move it away
- Env vars are used as fallback when JSON config is missing
- To ensure JSON is loaded, remove/comment `ironbot.json.example`
