## 1. Configuration Types and Parsing

- [x] 1.1 Extend `AgentDefaults` type to support `model: { primary, fallbacks }` structure in `src/config.ts`
- [x] 1.2 Add `models: Record<string, { alias?: string }>` map type to `AgentDefaults` for model aliases
- [x] 1.3 Create `ModelSelection` type with `primary: string` and `fallbacks?: string[]` fields
- [x] 1.4 Implement backward compatibility converter: string → { primary: string }
- [x] 1.5 Update config loader to detect and convert string format to structured format automatically

## 2. Model Alias System

- [x] 2.1 Create `getModelAlias(modelRef: string): string | undefined` method in `ModelResolver`
- [x] 2.2 Create `getModelWithAlias(modelRef: string): { ref: string; alias?: string }` method
- [x] 2.3 Store aliases from agent config in `ModelResolver` during initialization
- [x] 2.4 Implement `listModelsWithAliases(): Array<{ ref: string; alias?: string }>` to retrieve all models with aliases

## 3. Configuration Validation

- [x] 3.1 Add validation for `model.primary` - ensure it references an existing model
- [x] 3.2 Add validation for `model.fallbacks` - ensure all items reference existing models
- [x] 3.3 Add validation for `models` map - ensure all keys are valid model references (provider/id format)
- [x] 3.4 Ensure primary is not empty or undefined
- [x] 3.5 Ensure fallbacks don't include the primary model (optional: warning vs error)

## 4. Model Resolution with Primary/Fallbacks

- [x] 4.1 Update `ModelResolver.resolveModel()` to accept both string and structured format
- [x] 4.2 Implement primary/fallbacks resolution chain in model lookup
- [x] 4.3 Update fallback chain logic - when primary unavailable, try fallbacks[0], then [1], etc.
- [x] 4.4 Add error handling that reports which models were attempted
- [x] 4.5 Ensure caching works with new primary/fallbacks format

## 5. Agent Factory and Processor Integration

- [x] 5.1 Update `AgentFactory` to parse `model.primary` and `model.fallbacks` from config
- [x] 5.2 Update `AgentFactory` to pass model selection information to processor initialization
- [x] 5.3 Update `ClaudeProcessor` to read and store `model.primary` and `model.fallbacks`
- [x] 5.4 Update `PiAgentProcessor` to read and store `model.primary` and `model.fallbacks`
- [x] 5.5 Update both processors to expose `getModelFallbacks(): string[]` method

## 6. Configuration Schema Updates

- [x] 6.1 Update example `ironbot.json.example` to show primary/fallbacks structure
- [x] 6.2 Add example with model aliases section
- [x] 6.3 Add example showing backward compatibility (string format continues to work)
- [x] 6.4 Document the migration path in comments/docs

## 7. Unit Tests

- [x] 7.1 Add unit tests for model primary/fallbacks type validation
- [x] 7.2 Add unit tests for string → { primary } conversion
- [x] 7.3 Add unit tests for model alias retrieval (`getModelAlias()`)
- [x] 7.4 Add unit tests for alias map storage and lookup
- [x] 7.5 Add unit tests for primary/fallbacks resolution order
- [x] 7.6 Test that empty fallbacks array is handled correctly

## 8. Integration Tests

- [x] 8.1 Add integration test for agent initialization with primary/fallbacks structure
- [x] 8.2 Add integration test for fallback chain resolution when primary unavailable
- [x] 8.3 Add integration test for model aliases in multi-provider setup
- [x] 8.4 Add integration test for backward compatibility (string format works unchanged)
- [x] 8.5 Add integration test showing both string and structured formats in same deployment
- [x] 8.6 Add integration test for error reporting with all attempted models

## 9. Backward Compatibility Verification

- [x] 9.1 Verify existing deployments using string `model: "provider/id"` work without changes
- [x] 9.2 Verify conversion happens transparently at config load time
- [x] 9.3 Verify processors work identically whether given string or structured format
- [x] 9.4 Document backward compatibility guarantees
- [x] 9.5 Add migration test showing config conversion path

