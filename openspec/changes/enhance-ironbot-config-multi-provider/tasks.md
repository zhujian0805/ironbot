## 1. Configuration Types and Validation

- [x] 1.1 Create `CostModel` type supporting input, output, cacheRead, cacheWrite fields
- [x] 1.2 Create `ModelDefinition` type with id, name, cost, and provider-specific metadata
- [x] 1.3 Create `ProviderConfig` type with models array, baseUrl, api type, and authentication
- [x] 1.4 Create `ModelsConfig` type with providers array to replace single llmProvider

## 2. Configuration Schema Updates

- [x] 2.1 Add `models.providers[]` array support to ironbot.json configuration
- [x] 2.2 Extend agent defaults with `workspace`, `compactionMode`, and `subagents.maxConcurrent` fields
- [x] 2.3 Implement backward compatibility layer to support legacy `llmProvider` format
- [x] 2.4 Add migration logic that converts old `llmProvider` format to new `models.providers` format

## 3. Configuration Loading and Validation

- [x] 3.1 Implement `validateModelsConfig()` function to validate provider configuration at startup
- [x] 3.2 Validate that all provider IDs are unique and valid
- [x] 3.3 Validate that all model IDs are unique within each provider
- [x] 3.4 Validate that referenced fallback models exist in their target providers
- [x] 3.5 Add clear error messages for configuration validation failures

## 4. Model Resolution System

- [x] 4.1 Create `ModelResolver` class to handle model lookup by `provider/model-id` format
- [x] 4.2 Implement model lookup that resolves provider first, then finds model by ID
- [x] 4.3 Cache model resolution results at agent initialization for performance
- [x] 4.4 Add `getModelMetadata()` method to expose cost and configuration information
- [x] 4.5 Support model fallback chains with automatic provider switching

## 5. Workspace Path Configuration

- [x] 5.1 Add support for tilde (~) expansion in workspace paths
- [x] 5.2 Add workspace directory auto-creation during agent initialization
- [x] 5.3 Validate workspace path is writable before agent starts
- [x] 5.4 Integrate workspace path configuration with agent state management

## 6. Agent Configuration Integration

- [x] 6.1 Update agent initialization to read `compactionMode` from configuration
- [x] 6.2 Pass `compactionMode` to agent state compaction logic (safeguard/moderate/aggressive)
- [x] 6.3 Update agent initialization to read `workspace` from configuration
- [x] 6.4 Update subagent pool to respect separate `maxConcurrent` limit for subagents
- [x] 6.5 Ensure agent defaults are applied before provider-specific overrides

## 7. Provider API Type Support

- [x] 7.1 Add `api` field support to provider configuration (openai-completions, anthropic, etc.)
- [x] 7.2 Update model client selection to use provider-specific API type
- [x] 7.3 Support baseUrl override per provider for custom endpoints
- [x] 7.4 Test OpenAI-compatible and Anthropic-compatible provider configurations

## 8. Runtime Integration and Testing

- [x] 8.1 Update ironbot startup to load and validate models configuration
- [x] 8.2 Update ironbot startup to initialize workspace directories
- [x] 8.3 Update model selection logic to use new ModelResolver
- [x] 8.4 Verify backward compatibility with existing single-provider configurations (REMOVED - using new design only)
- [x] 8.5 Add integration tests for multi-provider model resolution
- [x] 8.6 Add integration tests for workspace path configuration
- [x] 8.7 Add integration tests for agent configuration defaults (compactionMode, subagent concurrency)
- [x] 8.8 Test cost model with cache costs in model metadata
