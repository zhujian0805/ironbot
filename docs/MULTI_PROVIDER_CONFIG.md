# Multi-Provider LLM Configuration Guide

This guide explains how to configure multiple LLM providers in ironbot, including Anthropic, OpenAI, Google Gemini, Moonshot (Kimi), and custom providers.

## Overview

The new `models` configuration section allows you to define multiple LLM providers simultaneously, each with multiple models and provider-specific settings. This enables:

- **Provider Redundancy**: Use fallback models from different providers
- **Cost Optimization**: Choose models based on cost metrics
- **Regional Deployment**: Configure different providers for different regions
- **Advanced Cost Tracking**: Track input, output, cache read, and cache write costs

## Configuration Structure

### Basic Multi-Provider Setup

```json
{
  "models": {
    "providers": {
      "anthropic": {
        "models": [
          {
            "id": "opus",
            "name": "Claude Opus",
            "cost": {
              "input": 15.0,
              "output": 75.0
            }
          }
        ],
        "api": "anthropic"
      },
      "openai": {
        "models": [
          {
            "id": "gpt-4o",
            "name": "GPT-4 Optimized",
            "cost": {
              "input": 2.5,
              "output": 10.0
            }
          }
        ],
        "api": "openai",
        "baseUrl": "https://api.openai.com/v1",
        "apiKey": "your-api-key-here"
      }
    }
  }
}
```

### Configuration Fields

#### `providers` (object)
A mapping of provider IDs to provider configurations. Each key is a unique provider identifier (e.g., "anthropic", "openai", "moonshot").

#### Provider Configuration

**`models` (required, array)**
Array of model definitions for this provider.

**`api` (optional, string)**
API type: "anthropic" or "openai" (for OpenAI-compatible APIs)
- Default: "openai" for custom providers
- Determines how API calls are formatted and executed

**`baseUrl` (optional, string)**
Custom API endpoint URL. Useful for:
- Azure OpenAI custom deployments
- Self-hosted models
- OpenAI-compatible APIs

**`apiKey` (optional, string)**
API authentication key for this provider.

### Model Definition

Each model in the `models` array must have:

**`id` (required, string)**
Unique model identifier within the provider. Used to reference the model as `provider/model-id`.

Example: `"anthropic/claude-opus"` references the model with `id: "claude-opus"` in the "anthropic" provider.

**`name` (required, string)**
Human-readable name for the model.

**`cost` (optional, object)**
Token cost information for routing decisions:

```json
{
  "cost": {
    "input": 15.0,      // Cost per 1M input tokens
    "output": 75.0,     // Cost per 1M output tokens
    "cacheRead": 1.5,   // Cost per 1M cache read tokens (optional)
    "cacheWrite": 30.0  // Cost per 1M cache write tokens (optional)
  }
}
```

All cost fields are optional and default to 0 if omitted.

## Usage Examples

### Example 1: Multi-Provider Setup with Cost Tracking

```json
{
  "models": {
    "providers": {
      "anthropic": {
        "models": [
          {
            "id": "opus",
            "name": "Claude Opus",
            "cost": {
              "input": 15.0,
              "output": 75.0
            }
          },
          {
            "id": "sonnet",
            "name": "Claude Sonnet",
            "cost": {
              "input": 3.0,
              "output": 15.0
            }
          }
        ],
        "api": "anthropic"
      },
      "openai": {
        "models": [
          {
            "id": "gpt-4o",
            "name": "GPT-4 Optimized",
            "cost": {
              "input": 2.5,
              "output": 10.0
            }
          }
        ],
        "api": "openai",
        "baseUrl": "https://api.openai.com/v1"
      }
    }
  }
}
```

### Example 2: Provider with Cache Support (Moonshot)

```json
{
  "models": {
    "providers": {
      "moonshot": {
        "models": [
          {
            "id": "kimi-k2-0905-preview",
            "name": "Kimi K2 (Preview)",
            "cost": {
              "input": 1.0,
              "output": 5.0,
              "cacheRead": 0.1,
              "cacheWrite": 2.0
            }
          }
        ],
        "api": "openai",
        "baseUrl": "https://api.moonshot.cn/v1",
        "apiKey": "your-moonshot-api-key-here"
      }
    }
  }
}
```

### Example 3: Azure OpenAI Custom Deployment

```json
{
  "models": {
    "providers": {
      "azure-openai": {
        "models": [
          {
            "id": "gpt-4-turbo",
            "name": "GPT-4 Turbo (Azure)",
            "cost": {
              "input": 10.0,
              "output": 30.0
            }
          }
        ],
        "api": "openai",
        "baseUrl": "https://your-resource.openai.azure.com/openai/v1",
        "apiKey": "your-azure-api-key-here"
      }
    }
  }
}
```

## Model Referencing

Models are referenced using the `provider/model-id` format:

- `anthropic/claude-opus` → Anthropic's Claude Opus model
- `openai/gpt-4o` → OpenAI's GPT-4 Optimized model
- `moonshot/kimi-k2-0905-preview` → Moonshot's Kimi K2 model

This format enables provider-agnostic model selection and automatic fallback across providers.

## Agent Configuration

Configure agent-specific settings in the `agents.defaults` section:

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

### Fields

**`workspace` (optional, string)**
Directory path where agent state and persistent data are stored.
- Supports tilde (~) expansion: `~/.ironbot/workspace` → `/home/user/.ironbot/workspace`
- Automatically created if it doesn't exist
- Must be readable and writable

**`compactionMode` (optional, string)**
Controls state compaction frequency:
- `"safeguard"` (default): Conservative compaction, prioritizes data safety
- `"moderate"`: Balanced approach between storage and CPU usage
- `"aggressive"`: Frequent compaction, minimizes storage at cost of CPU

**`subagents.maxConcurrent` (optional, number)**
Maximum number of subagents that can execute concurrently.
- Independent from main agent concurrency limit
- Default: system-determined

## Backward Compatibility

The new `models` configuration is fully optional. Existing `llmProvider` configurations continue to work:

```json
{
  "llmProvider": {
    "provider": "anthropic",
    "anthropic": {
      "api": "anthropic",
      "apiKey": "sk-ant-...",
      "model": "claude-3-5-sonnet-20241022"
    }
  }
}
```

When both `models` and `llmProvider` exist, `models` takes precedence for new features while `llmProvider` remains available for backward compatibility.

## Validation

The configuration is validated at startup with clear error messages for:
- Missing required fields (id, name in models)
- Duplicate model IDs within a provider
- Invalid compactionMode values
- Workspace path accessibility issues
- Invalid API type specifications

## Cost Model Usage

Cost information is available to your application via the ModelResolver API:

```typescript
// Access cost model for routing decisions
const metadata = modelResolver.getModelMetadata("moonshot/kimi-k2-0905-preview");
console.log(metadata.cost);
// Output: { input: 1.0, output: 5.0, cacheRead: 0.1, cacheWrite: 2.0 }

// Use for cost-aware routing
if (metadata.cost.cacheRead < threshold) {
  // Choose this model for cached content
}
```

Cost information is purely informational for user applications; ironbot does not enforce cost-based routing automatically.

## Best Practices

1. **Provider Naming**: Use clear, descriptive provider IDs (e.g., "anthropic", "openai", "azure-openai")

2. **Model IDs**: Use provider's official model names or abbreviations (e.g., "gpt-4o", "claude-opus")

3. **Cost Tracking**: Keep cost information current as providers update pricing

4. **Workspace Setup**: Use dedicated workspace directories for each deployment
   - Development: `~/.ironbot-dev/workspace`
   - Production: `/var/lib/ironbot/workspace`

5. **API Type**: Ensure correct API type matches the provider's actual API format
   - Anthropic native: `api: "anthropic"`
   - OpenAI or compatible: `api: "openai"`

6. **BaseUrl**: Always include custom `baseUrl` when using non-standard endpoints

## Troubleshooting

**Configuration validation error on startup**
- Check for missing required fields (id, name)
- Verify no duplicate model IDs within a provider
- Ensure API type is "anthropic" or "openai"

**Workspace initialization failed**
- Check directory permissions
- Verify parent directories exist
- Ensure disk space available

**Model resolution fails**
- Verify provider ID matches configured provider
- Check model ID format: `provider/model-id`
- Confirm model exists in provider configuration
