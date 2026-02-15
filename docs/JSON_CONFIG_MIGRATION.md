# JSON Configuration Migration Guide

## What Changed

Ironbot now uses **JSON configuration files** (`ironbot.json`) as the primary configuration method, with **fallback to environment variables** (`.env`) for backward compatibility.

## Migration Path

### Before (Pure .env)
```bash
SLACK_BOT_TOKEN=xoxb-...
ANTHROPIC_API_KEY=sk-ant-...
LLM_PROVIDER=anthropic
SKILLS_DIR=./skills
```

### After (JSON Config + .env Fallback)
```json
{
  "slack": { "botToken": "xoxb-..." },
  "llmProvider": {
    "provider": "anthropic",
    "anthropic": { "apiKey": "sk-ant-..." }
  },
  "skills": { "directory": "./skills" }
}
```

## Quick Start

### Step 1: Generate JSON Config from .env

Use the provided conversion script:

```bash
# Convert .env to ironbot.json
node scripts/env-to-json.js .env ironbot.json

# Or if using .env.example
node scripts/env-to-json.js .env.example ironbot.json.generated

# Force overwrite if file exists
node scripts/env-to-json.js .env ironbot.json --force
```

### Step 2: Review Generated Config

The script creates `ironbot.json` with all your settings:

```bash
cat ironbot.json | jq .  # pretty-print if jq is available
```

### Step 3: Customize as Needed

Edit specific values:

```bash
# Update LLM provider
# Change "provider": "anthropic" to "provider": "openai"
# Update corresponding API keys
```

### Step 4: Test

```bash
# Start application (will now read from ironbot.json)
bun src/main.ts
```

### Step 5: Cleanup (Optional)

If you want to use JSON config exclusively:

```bash
# Back up .env just in case
mv .env .env.backup

# Remove from git (don't commit secrets)
git rm .env --cached
echo ".env" >> .gitignore
```

## Configuration Lookup Order

1. **CLI arguments** (highest priority)
2. **ironbot.json** file (checked in order):
   - Path from `IRONBOT_CONFIG` env var
   - `./ironbot.json` (current directory)
   - `./config/ironbot.json`
3. **Environment variables** (.env)
4. **Default values** (lowest priority)

## File Structure

```
ironbot/
├── ironbot.json              ← Your instance config (git-ignored)
├── ironbot.json.example      ← Template (committed)
├── .env                      ← Fallback (optional, git-ignored)
├── .env.example              ← Template (committed)
├── scripts/
│   └── env-to-json.js        ← Conversion tool
└── CONFIG.md                 ← Full documentation
```

## Benefits of JSON Config

✅ **Centralized Configuration** - All settings in one place
✅ **Cleaner Format** - More readable than environment variables
✅ **Easier Validation** - JSON schema support
✅ **Better for Secrets** - Use `.gitignore` for single file
✅ **Multi-Provider** - Easy to switch between different LLM providers
✅ **Backward Compatible** - .env still works as fallback

## Environment Variable Reference

Still supported for backward compatibility:

| Variable | JSON Path | Example |
|----------|-----------|---------|
| `SLACK_BOT_TOKEN` | `slack.botToken` | `xoxb-...` |
| `SLACK_APP_TOKEN` | `slack.appToken` | `xapp-1-...` |
| `ANTHROPIC_API_KEY` | `llmProvider.anthropic.apiKey` | `sk-ant-...` |
| `LLM_PROVIDER` | `llmProvider.provider` | `anthropic` |
| `OPENAI_API_KEY` | `llmProvider.openai.apiKey` | `sk-...` |
| `GOOGLE_API_KEY` | `llmProvider.google.apiKey` | `...` |
| `SKILLS_DIR` | `skills.directory` | `./skills` |
| `DEBUG` | `logging.debug` | `false` |
| `LOG_LEVEL` | `logging.level` | `INFO` |

See `CONFIG.md` for complete environment variable list.

## Common Scenarios

### Switch LLM Provider

**From Anthropic to OpenAI:**

```bash
# Edit ironbot.json
{
  "llmProvider": {
    "provider": "openai",
    "openai": {
      "apiKey": "sk-...",
      "model": "gpt-4o"
    }
  }
}
```

### Development vs Production

Create separate configs:

```
ironbot.dev.json
├─ "logging": { "debug": true, "level": "DEBUG" }
└─ "dev": { "mode": true }

ironbot.json (production)
├─ "logging": { "debug": false, "level": "INFO" }
└─ "dev": { "mode": false }
```

Run with:
```bash
IRONBOT_CONFIG=ironbot.dev.json bun src/main.ts
```

### Docker Deployment

Mount config at runtime:

```dockerfile
# Dockerfile
WORKDIR /app
COPY ironbot.json.example ironbot.json.example
# Don't copy actual ironbot.json (secrets)

# docker run -v /path/to/ironbot.json:/app/ironbot.json ...
```

## Troubleshooting

**Q: Config file is not being loaded**
- Check file exists at expected path
- Verify JSON syntax: `node -e "JSON.parse(require('fs').readFileSync('ironbot.json'))"`
- Look for console warnings at startup

**Q: Environment variables taking precedence**
- Env vars are fallback when JSON not found
- To force JSON usage, delete/move `.env` file
- Or set `IRONBOT_CONFIG=./ironbot.json`

**Q: How to keep secrets out of git?**
```bash
# Option 1: Only commit example file
git add ironbot.json.example
git add -f .gitignore (with ironbot.json entry)

# Option 2: Use environment variables for secrets only
echo "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}" >> .env
# .env is in .gitignore
```

## Support for Both Systems

The migration is **gradual and non-breaking**:

- ✅ `ironbot.json` - Recommended (new system)
- ✅ `.env` - Still supported (legacy system)
- ✅ CLI args - Override either system
- ✅ Mixing both - JSON takes priority

You can keep using `.env` indefinitely if you prefer.

## Next Steps

1. **Read the full guide**: `CONFIG.md`
2. **Generate your config**: `node scripts/env-to-json.js`
3. **Test the application**: `bun src/main.ts`
4. **Clean up secrets**: Remove from git if needed
5. **Commit template**: Commit `ironbot.json.example`

