## Why

Organizations need flexibility to use multiple LLM providers simultaneously, with support for emerging providers like Moonshot (Kimi), Azure OpenAI, and Google Gemini. The current configuration needs to scale beyond Anthropic-only support to enable cost optimization, regional compliance, and provider redundancy through fallback chains. Additionally, production deployments require advanced cost tracking (including cache read/write costs) and fine-grained agent execution control.

## What Changes

- **Multi-Provider Support**: Extend configuration to support Moonshot, Azure OpenAI, Google Gemini, and other providers alongside existing Anthropic support
- **Enhanced Cost Model**: Add cache read/write cost tracking to the cost model (currently only supports input/output)
- **Expanded Agent Configuration**: Add workspace path configuration, compaction mode settings, and subagent concurrency limits
- **Provider-Specific Configuration**: Support provider-specific settings like baseUrl, api type (openai-completions), and model-specific metadata
- **Improved Model Schema**: Enhance model definition structure with additional metadata fields for production deployments

## Capabilities

### New Capabilities
- `multi-provider-llm-config`: Configuration structure supporting multiple LLM providers with array-based model definitions, provider-specific settings (baseUrl, api type), and per-provider credentials
- `advanced-cost-tracking`: Cost model supporting input, output, cache-read, and cache-write costs for intelligent cost-aware routing
- `agent-workspace-config`: Agent configuration supporting workspace path, compaction mode (safeguard/moderate/aggressive), and subagent concurrency limits
- `provider-agnostic-models`: Model definitions that work across different provider API types (OpenAI-compatible, Anthropic-compatible, etc.)

### Modified Capabilities
- `model-fallback-chains`: Enhanced to support fallback selection from multiple providers with cost and capability awareness
- `agent-execution-settings`: Extended with workspace path, compaction mode, and subagent concurrency configuration

## Impact

**Affected Components:**
- Configuration types (`src/config.ts`): New types for enhanced cost model, multi-provider support, agent workspace config
- Configuration files: `ironbot.json`, `config/ironbot.json.example` - updated with multi-provider examples
- Model resolver (`src/services/model_resolver.ts`): Enhanced to handle provider-agnostic model lookups
- Agent factory (`src/services/agent_factory.ts`): Updated to initialize workspace and advanced settings
- Processor classes: `ClaudeProcessor`, `PiAgentProcessor` - support for enhanced configuration
- Configuration validation: New validation rules for multi-provider setup, cost model, and workspace paths

**API Changes:**
- New configuration options: provider-specific baseUrl, api type, cost model with cache costs, workspace path, compaction mode
- Model ID format remains `provider/model-id` for provider-agnostic lookup
- Agent model selection now includes primary model and ordered fallback list

**Dependencies:**
- No new external dependencies required
- Maintains backward compatibility with existing single-provider configurations
