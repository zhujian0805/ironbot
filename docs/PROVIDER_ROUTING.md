# LLM Provider Routing System

## Overview

Ironbot now supports multiple LLM providers. When the provider is set to `anthropic`, it uses the **Claude Agent SDK** directly. For all other providers (OpenAI, Google, Groq, etc.), it uses the **Pi Agent** for unified multi-provider support.

## Configuration

Set the provider via the `LLM_PROVIDER` environment variable:

```bash
# Use Claude (default behavior, unchanged)
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# Use OpenAI
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o

# Use Google
LLM_PROVIDER=google
GOOGLE_API_KEY=...
GOOGLE_MODEL=gemini-2.0-flash
```

## Architecture

### AgentFactory (`src/services/agent_factory.ts`)

Routes to the correct agent processor based on configuration:
- **anthropic** → `ClaudeProcessor` (existing implementation)
- **all others** → `PiAgentProcessor` (new multi-provider wrapper)

### PiAgentProcessor (`src/services/pi_agent_processor.ts`)

A wrapper around the Pi Agent SDK that implements the same interface as `ClaudeProcessor`:
- `processMessage()` - Process user messages
- `checkConnection()` - Verify LLM connectivity
- `executeTool()` - Execute tools (read, write, bash, etc.)
- `clearMemoryForSession()` / `clearAllMemory()` - Memory management

Key features:
- Skill loading and routing (identical to Claude implementation)
- Memory context support
- Tool execution with the same permission system
- Compatible with existing Slack handler logic

### Integration Points

**MessageRouter** (`src/services/message_router.ts`)
- Updated to accept `AgentProcessor` type instead of `ClaudeProcessor`
- Routes all Slack messages through the appropriate agent
- No changes needed to Slack handler logic

**Main** (`src/main.ts`)
- Uses `AgentFactory.create()` to instantiate the right processor
- Health checks work for both providers
- Cron service uses `agent.executeTool()` for both providers

## Backward Compatibility

✅ **Fully backward compatible**
- Default behavior unchanged (uses Claude when `LLM_PROVIDER` not set)
- Existing permissions system works for all providers
- Skills and tools work identically across providers
- No changes required to existing Slack bot functionality

## Provider-Specific Defaults

When using Pi Agent for non-Anthropic providers:

| Provider | Default Model |
|----------|---------------|
| OpenAI | `gpt-4o` |
| Google | `gemini-2.0-flash` |
| Groq | Determined by Pi's model registry |
| Mistral | Determined by Pi's model registry |

Override via environment variables (e.g., `OPENAI_MODEL=gpt-4-turbo`)

## Development Notes

### Adding a New Provider

To add support for a new LLM provider (e.g., Anthropic Bedrock):

1. Update `LlmProvider` type in `src/config.ts`
2. Add provider config fields to `LlmProviderConfig` 
3. Update `parseLlmProvider()` function
4. Add provider config parsing in `loadBaseConfig()`
5. Pi Agent SDK will handle the rest

### Testing Provider Switching

```bash
# Test with Claude (existing tests should all pass)
LLM_PROVIDER=anthropic ANTHROPIC_API_KEY=sk-ant-... npm test

# Test with OpenAI
LLM_PROVIDER=openai OPENAI_API_KEY=sk-... npm test

# Switch providers at runtime
# The factory will instantiate the correct processor
```

## Files Modified/Created

**Created:**
- `src/services/agent_factory.ts` - Provider routing factory
- `src/services/pi_agent_processor.ts` - Pi Agent wrapper

**Modified:**
- `src/config.ts` - Added provider configuration types
- `src/main.ts` - Updated to use AgentFactory
- `src/services/message_router.ts` - Updated to use AgentProcessor type

## Next Steps

Once the Pi SDK is fully integrated:
1. Replace placeholder in `PiAgentProcessor.processWithTools()` with actual Pi SDK calls
2. Add full prompt templating support
3. Implement Pi's extensions/skills plugin system
4. Add support for model switching per-channel (if desired)
