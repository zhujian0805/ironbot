# .ENV DEPRECATION - Ironbot v1.1+

## Status: ✅ DEPRECATED - .env support has been completely removed

As of **Ironbot v1.1**, all configuration must be provided via `ironbot.json`. Environment variables (`.env`) are **no longer supported**.

## What Changed

| Aspect | Before (v1.0) | After (v1.1+) |
|--------|---------------|---------------|
| Config Files | `.env` + `ironbot.json` | **`ironbot.json` only** |
| Fallback | `.env` used if `ironbot.json` missing | **Error thrown if `ironbot.json` missing** |
| Env Vars | Supported as primary source | **Not supported** |
| Migration | Optional | **Required** |

## Why This Change?

1. **Clarity** - Single source of truth for configuration
2. **Validation** - JSON schema validation possible
3. **Type Safety** - No string→type coercion issues
4. **Secrets** - Easier to protect single file
5. **Structure** - Complex nested configs clearer in JSON

## Migration Required

### Step 1: Create ironbot.json

```bash
cp ironbot.json.example ironbot.json
```

### Step 2: Update Configuration

Edit `ironbot.json` with your actual values:

```json
{
  "slack": {
    "botToken": "xoxb-your-token",
    "appToken": "xapp-1-your-token"
  },
  "llmProvider": {
    "provider": "anthropic",
    "anthropic": {
      "apiKey": "sk-ant-your-key",
      "model": "claude-3-5-sonnet-20241022"
    }
  }
}
```

### Step 3: Remove .env (Optional)

If not using `.env` for other purposes:

```bash
rm .env
```

### Step 4: Test

```bash
bun src/main.ts
```

## Troubleshooting

### Error: "Configuration file not found"

Make sure `ironbot.json` exists in one of these locations:
- `./ironbot.json` (project root)
- `./config/ironbot.json` (config directory)
- Or set `IRONBOT_CONFIG` environment variable

### Error: "Invalid JSON in config file"

Validate your JSON syntax:

```bash
# Using Node.js
node -e "JSON.parse(require('fs').readFileSync('ironbot.json'))"

# Using jq (if installed)
jq . ironbot.json
```

### Required fields missing

Ensure these are in your `ironbot.json`:

```json
{
  "slack": {
    "botToken": "...",      // REQUIRED
    "appToken": "..."       // REQUIRED
  },
  "llmProvider": {
    "provider": "anthropic"  // REQUIRED
  }
}
```

## Migration from Previous Versions

If upgrading from v1.0 or earlier:

### Option 1: Automatic Conversion (Recommended)

```bash
node scripts/env-to-json.js .env ironbot.json
```

This converts your `.env` to `ironbot.json` automatically.

### Option 2: Manual Migration

Use the `.env` to JSON mapping from `CONFIG.md`:

```bash
.env Variable          →  JSON Path
SLACK_BOT_TOKEN        →  slack.botToken
SLACK_APP_TOKEN        →  slack.appToken
ANTHROPIC_API_KEY      →  llmProvider.anthropic.apiKey
LLM_PROVIDER           →  llmProvider.provider
```

## File Structure After Migration

```
ironbot/
├── ironbot.json              ← Your config (git-ignored)
├── ironbot.json.example      ← Template (committed)
├── .env                      ← REMOVED (or kept for other tools)
├── .env.example              ← Template (committed)
└── src/
    └── config.ts             ← Now reads ironbot.json only
```

## Docker/Container Deployment

Mount `ironbot.json` at runtime:

```dockerfile
# Dockerfile
WORKDIR /app
COPY ironbot.json.example .

# docker run -v /path/to/ironbot.json:/app/ironbot.json ...
```

## Secrets Management

### ✅ Recommended

Commit `ironbot.json.example` to git, ignore actual `ironbot.json`:

```bash
# .gitignore
ironbot.json
!ironbot.json.example
```

### For CI/CD

Use environment variables or secret management:

```bash
# GitHub Actions
- uses: actions/setup-node@v3
  env:
    IRONBOT_CONFIG: ${{ secrets.IRONBOT_JSON_CONTENT }}
```

## Rollback (If Needed)

If you need to run an old version that supports `.env`:

```bash
# Checkout previous version (v1.0)
git checkout v1.0

# Use old config system
export SLACK_BOT_TOKEN=...
npm start
```

## Related Documentation

- See `CONFIG.md` for complete configuration reference
- See `JSON_CONFIG_MIGRATION.md` for step-by-step migration guide
- See `IMPLEMENTATION_SUMMARY.md` for technical details

## Support

If you encounter issues during migration:

1. Check `ironbot.json` syntax: `node -e "JSON.parse(require('fs').readFileSync('ironbot.json'))"`
2. Verify all required fields are present
3. Review example at `ironbot.json.example`
4. Check logs for specific error messages
