## Why

Current agent model configuration requires specifying a single model reference (e.g., `anthropic/opus`) with manual fallback chains as pipe-separated strings. This approach lacks clarity around fallback order and makes it impossible to assign human-readable aliases to models for UI display, logging, and user reference. Teams managing multiple models need a structured way to define primary and ordered fallback selections, along with optional aliases for better discoverability and readability.

## What Changes

- **Structured Model Selection**: Replace single `model` reference with a `model` object containing `primary` and `fallbacks` array for clear, ordered fallback sequences
- **Per-Model Aliases**: Add optional `alias` field to model definitions in a new `models` map, allowing human-readable names for each model reference
- **Agent Configuration**: Extend agent configuration to support both `model.primary` (required) and `model.fallbacks` (optional array) structure
- **Model Metadata**: Update `ModelResolver` to expose and manage aliases alongside model definitions

## Capabilities

### New Capabilities
- `model-primary-fallback-selection`: Configuration structure supporting primary model selection with ordered fallback array, enabling explicit fallback chains in agent configuration
- `model-aliases`: Per-model alias assignment allowing human-readable names for model references (e.g., "qwen" for "qwen-portal/coder-model")

### Modified Capabilities
- `multi-provider-llm-config`: Existing model configuration enhanced to support primary/fallbacks selection mode alongside existing model reference format

## Impact

**Affected Components:**
- Configuration types (`src/config.ts`): New model selection structure with primary/fallbacks; model aliases map
- Agent configuration (`ironbot.json`): Updated agent model section to use primary/fallbacks format
- Model resolver (`src/services/model_resolver.ts`): Enhanced to resolve primary models and fallback chains; alias lookup
- Agent factory (`src/services/agent_factory.ts`): Updated initialization to parse primary/fallbacks structure
- Processor classes: Both `ClaudeProcessor` and `PiAgentProcessor` updated to work with new model selection format

**API Changes:**
- New agent configuration format: `model: { primary: "provider/id", fallbacks: ["provider/id", ...] }`
- New model map: `models: { "provider/id": { alias?: "human-readable-name" } }`
- `ModelResolver` gains alias resolution methods
- Backward compatibility maintained: existing single string `model` references continue to work (converted to `{ primary: "..." }`)

**Breaking Changes:** None - single string model references convert automatically to primary-only format

**Dependencies:**
- No new external dependencies
- Builds on existing multi-provider configuration (enhance-ironbot-config-multi-provider)
