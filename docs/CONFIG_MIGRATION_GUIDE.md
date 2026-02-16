# Configuration Migration Guide - Multi-Provider Design

## Summary of Changes

The ironbot configuration has been completely migrated to the new multi-provider LLM architecture. This document explains the changes and how to update your configuration if you have a custom setup.

## What Changed

### ✅ Removed
- **`llmProvider` section** - Completely removed (no longer used)
- Legacy single-provider configuration format
- Old model metadata fields (reasoning, input, output, tools, vision, streaming, contextWindow, maxTokens, releaseDate, alias)

### ✅ Updated
- **`models` section** - New standardized format with providers array
- **`agents.defaults` section** - Simplified to focus on workspace, compactionMode, and subagents configuration

### ✅ Added
- **`slack.threadContextLimit`** - Thread context limit configuration (default: 15)
- **`memory` section** - Session indexing configuration
- **`slack_retry` section** - Slack-specific retry settings
- **`cron` section** - Cron service enablement

## New Configuration Structure

### Models Configuration

```json
{
  "models": {
    "providers": {
      "anthropic": {
        "api": "anthropic",
        "apiKey": "${ANTHROPIC_API_KEY}",
        "models": [
          {
            "id": "opus",
            "name": "Claude 3.5 Opus",
            "cost": {
              "input": 3,
              "output": 15,
              "cacheRead": 0.3,
              "cacheWrite": 6
            }
          }
        ]
      },
      "moonshot": {
        "api": "openai",
        "baseUrl": "https://api.moonshot.cn/v1",
        "apiKey": "${MOONSHOT_API_KEY}",
        "models": [
          {
            "id": "kimi-k2-0905-preview",
            "name": "Kimi K2 Preview",
            "cost": {
              "input": 1.0,
              "output": 5.0,
              "cacheRead": 0.1,
              "cacheWrite": 2.0
            }
          }
        ]
      }
    }
  }
}
```

### Agent Configuration

```json
{
  "agents": {
    "defaults": {
      "workspace": "~/.ironbot/workspace",
      "compactionMode": "moderate",
      "subagents": {
        "maxConcurrent": 4
      }
    }
  }
}
```

## Migration Steps

### Step 1: Backup Your Configuration
```bash
cp ironbot.json ironbot.json.backup
```

### Step 2: Remove Legacy Section
Delete the entire `llmProvider` section:
```json
"llmProvider": {
  "provider": "anthropic",
  "anthropic": { ... }
}
```

### Step 3: Update Models Section
Convert your provider configuration to the new format:

**Old Format:**
```json
"llmProvider": {
  "provider": "anthropic",
  "anthropic": {
    "api": "anthropic",
    "apiKey": "sk-ant-...",
    "model": "claude-3-5-sonnet-20241022"
  }
}
```

**New Format:**
```json
"models": {
  "providers": {
    "anthropic": {
      "api": "anthropic",
      "apiKey": "sk-ant-...",
      "models": [
        {
          "id": "sonnet",
          "name": "Claude 3.5 Sonnet",
          "cost": {
            "input": 3,
            "output": 15
          }
        }
      ]
    }
  }
}
```

### Step 4: Update Agent Defaults
**Old Format:**
```json
"agents": {
  "defaults": {
    "model": {
      "primary": "anthropic/opus",
      "fallbacks": ["anthropic/haiku"]
    },
    "models": {
      "anthropic/opus": { "alias": "primary" }
    },
    "workspace": "~/.ironbot/workspace",
    "maxConcurrent": 4,
    "compactionMode": "moderate"
  }
}
```

**New Format:**
```json
"agents": {
  "defaults": {
    "workspace": "~/.ironbot/workspace",
    "compactionMode": "moderate",
    "subagents": {
      "maxConcurrent": 4
    }
  }
}
```

### Step 5: Validate Configuration
```bash
node -e "require('./ironbot.json'); console.log('✓ Config valid')"
```

### Step 6: Start Ironbot
```bash
npm start
```

If there are configuration errors, you'll see clear error messages pointing to the exact issue.

## Key Concepts

### Provider/Model ID Format
Models are now referenced as `provider/model-id`:
- `anthropic/opus` - Refers to the "opus" model in the "anthropic" provider
- `moonshot/kimi-k2-0905-preview` - Refers to the "kimi-k2-0905-preview" model in the "moonshot" provider

### Cost Model
All models can specify costs for intelligent routing:
```json
{
  "input": 3.0,          // Cost per 1M input tokens
  "output": 15.0,        // Cost per 1M output tokens
  "cacheRead": 0.3,      // Cost per 1M cache read tokens (optional)
  "cacheWrite": 6.0      // Cost per 1M cache write tokens (optional)
}
```

### Compaction Modes
- **safeguard** - Conservative compaction, prioritizes data safety (production default)
- **moderate** - Balanced approach between storage and CPU (standard)
- **aggressive** - Frequent compaction, minimizes storage (resource-constrained)

### Workspace Path
- Supports tilde (~) expansion: `~/.ironbot/workspace` → `/home/user/.ironbot/workspace`
- Automatically created if missing
- Must be readable and writable

## Verification

After updating your configuration, verify it works:

1. **Check configuration loading:**
   ```bash
   npm start
   ```
   Look for log lines like:
   ```
   [CONFIG] Loaded from: /path/to/ironbot.json
   [INIT] Multi-provider models configuration loaded
   ```

2. **Check providers loaded:**
   ```
   Models configuration details
   providers: [
     { name: 'anthropic', modelCount: 3, apiType: 'anthropic' },
     { name: 'moonshot', modelCount: 1, apiType: 'openai' }
   ]
   ```

3. **Check workspace initialized:**
   ```
   [WORKSPACE] Workspace ready
   path: /home/user/.ironbot/workspace
   ```

## Troubleshooting

### Error: "models.providers is required"
**Solution:** Add the `models` section with at least one provider and model.

### Error: "Duplicate model ID: 'provider/model-id'"
**Solution:** Model IDs must be unique within each provider. Rename or remove duplicates.

### Error: "Workspace directory is not readable/writable"
**Solution:** Check directory permissions:
```bash
chmod 755 ~/.ironbot/workspace
```

### Error: "Provider 'custom' has no models configured"
**Solution:** Add models array to the provider:
```json
{
  "id": "model-1",
  "name": "Model Name",
  "cost": {"input": 1, "output": 5}
}
```

## Multi-Provider Examples

### Anthropic + Moonshot (Cache Optimization)
```json
{
  "models": {
    "providers": {
      "anthropic": {
        "api": "anthropic",
        "apiKey": "${ANTHROPIC_API_KEY}",
        "models": [
          {
            "id": "opus",
            "name": "Claude Opus",
            "cost": {"input": 15, "output": 75}
          }
        ]
      },
      "moonshot": {
        "api": "openai",
        "baseUrl": "https://api.moonshot.cn/v1",
        "apiKey": "${MOONSHOT_API_KEY}",
        "models": [
          {
            "id": "kimi-k2",
            "name": "Kimi K2",
            "cost": {
              "input": 1.0,
              "output": 5.0,
              "cacheRead": 0.1,
              "cacheWrite": 2.0
            }
          }
        ]
      }
    }
  }
}
```

### Anthropic + Google Gemini (Fallback)
```json
{
  "models": {
    "providers": {
      "anthropic": {
        "api": "anthropic",
        "apiKey": "${ANTHROPIC_API_KEY}",
        "models": [
          {
            "id": "opus",
            "name": "Claude Opus",
            "cost": {"input": 15, "output": 75}
          }
        ]
      },
      "google": {
        "api": "openai",
        "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "apiKey": "${GOOGLE_API_KEY}",
        "models": [
          {
            "id": "gemini-2.0-flash",
            "name": "Gemini 2.0 Flash",
            "cost": {"input": 0.075, "output": 0.3}
          }
        ]
      }
    }
  }
}
```

## Support

For detailed documentation on the new configuration system, see:
- `docs/MULTI_PROVIDER_CONFIG.md` - Complete reference guide
- `config/ironbot.json.example` - Example configuration file

If you encounter issues during migration, check:
1. JSON syntax (use `node -e` to validate)
2. Provider ID spelling (case-sensitive)
3. API key environment variable substitution (`${VARIABLE_NAME}`)
4. File permissions on workspace directory
