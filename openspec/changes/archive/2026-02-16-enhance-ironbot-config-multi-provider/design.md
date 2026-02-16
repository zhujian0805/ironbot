## Context

Currently, ironbot supports a single active LLM provider at a time with limited model configuration flexibility. Organizations deploying ironbot in production need:
1. Support for multiple providers (Moonshot, Azure OpenAI, Google Gemini) alongside Anthropic
2. Advanced cost tracking with cache costs for intelligent routing
3. Enhanced agent settings (workspace path, compaction mode, subagent concurrency)
4. Provider-agnostic model configuration that works across different API types (OpenAI-compatible, Anthropic-compatible)

The existing configuration system uses object-based provider configuration which limits scalability. The enhancement requires a more flexible structure that supports arrays of models per provider with rich metadata.

**Current State:**
- Single provider configuration in `llmProvider` section
- Limited model metadata (only model name)
- Basic agent configuration (no workspace, no compaction mode)
- Cost model supports only input/output tokens

**Stakeholders:**
- Production deployment teams needing provider redundancy
- Teams using multiple cloud providers with regional requirements
- Operations teams tracking LLM costs including cache efficiency

## Goals / Non-Goals

**Goals:**
- Enable configuration of multiple LLM providers simultaneously
- Support fallback chains across providers with automatic failover
- Add cache read/write cost tracking to cost model
- Implement advanced agent settings (workspace, compaction mode, subagent concurrency)
- Maintain backward compatibility with existing single-provider configurations
- Support provider-specific settings (baseUrl, API type) while providing provider-agnostic model ID format

**Non-Goals:**
- Runtime provider switching without restart
- Dynamic provider discovery or registration
- Machine learning-based fallback strategy (manual configuration only)
- Cost-based automatic model selection (metadata provided for user implementation)
- Multi-region failover or geolocation-based routing

## Decisions

### Decision 1: Array-Based Model Configuration Over Object Keys
**Choice:** Use array-based model definitions within each provider instead of object keys

**Rationale:**
- Arrays provide natural ordering for iteration and fallback sequences
- Easier to add provider-agnostic metadata without conflicting with field names
- Cleaner structure for tools/UI generation that enumerate models
- Simpler validation (consistent schema per array item vs different field types)

**Alternative Considered:**
- Object keys: `{ "opus": {...}, "haiku": {...} }` - Problems: Can't preserve order naturally, conflicts with metadata fields

### Decision 2: Provider/Model-ID Format for Model References
**Choice:** Use `provider/model-id` string format for model references (e.g., `qwen-portal/coder-model`)

**Rationale:**
- Global uniqueness across providers without complex mapping structures
- Easy to parse and log
- Human-readable and matches common naming conventions
- Enables simple model lookup: resolve provider, find model by ID

**Alternative Considered:**
- UUID mapping: Would require additional lookup table
- Nested objects: Less readable, harder to pass as function arguments

### Decision 3: Extended Cost Model with Cache Costs
**Choice:** Expand cost model to `{ input, output, cacheRead, cacheWrite }` while maintaining backward compatibility

**Rationale:**
- Kimi, Gemini, and other advanced models support prompt caching with different pricing
- Cache costs are critical for cost-aware routing decisions
- Allows future expansion to other token types (reasoning tokens, etc.)
- Backward compatible: omitted fields default to 0

**Alternative Considered:**
- Separate cache cost field: More verbose, harder to calculate total cost
- Percentage-based discount: Doesn't match actual pricing models

### Decision 4: Type-Safe Configuration Validation
**Choice:** Implement validation in TypeScript types + runtime validation with clear error messages

**Rationale:**
- Catches configuration errors early at startup
- Type safety prevents runtime model lookup failures
- Clear error messages guide users to correct configuration

**Implementation:**
- Extend `src/config.ts` with new types: `CostModel`, `ProviderModelArray`, `ModelDefinition`
- Add validation function: `validateModelsConfig(jsonConfig: JsonConfig): void`
- Validation checks: provider exists, model IDs unique within provider, fallback models exist

### Decision 5: Agent Workspace as Optional Configuration
**Choice:** Add optional `workspace` field to agent defaults, auto-create if specified but missing

**Rationale:**
- Allows per-deployment customization (dev: ./workspace, prod: /var/lib/ironbot/workspace)
- Auto-creation removes manual setup steps
- Optional ensures backward compatibility (existing configs work unchanged)

**Alternative Considered:**
- Required field: Would break existing configurations
- Environment variable only: Less flexible for multi-agent scenarios

### Decision 6: Compaction Mode as Configuration
**Choice:** Support configurable compaction modes (`safeguard`, `moderate`, `aggressive`) instead of hardcoded behavior

**Rationale:**
- Different deployments have different storage/CPU trade-offs
- Production (safeguard) vs dev (aggressive) may differ
- Flexible for future optimization strategies

## Risks / Trade-offs

**[Risk] Configuration Complexity Increases**
- Mitigation: Provide example configurations for common scenarios (multi-provider, cost-optimized, etc.)
- Mitigation: Clear documentation with templates for copying

**[Risk] Model Lookup Performance**
- Mitigation: Model resolution cached in agents at initialization
- Mitigation: Linear lookup (few providers/models) acceptable for startup
- Trade-off: Could add in-memory index if needed in future

**[Risk] Backward Compatibility Edge Cases**
- Mitigation: Old `llmProvider` format still supported
- Mitigation: New `models` section takes precedence when both exist
- Mitigation: Migration logic converts old format automatically

**[Risk] Cost Data Stale or Incorrect**
- Mitigation: Cost metadata is informational only (used by user code, not enforced)
- Mitigation: Users responsible for keeping costs up-to-date
- Trade-off: No automated price synchronization from provider APIs

**[Trade-off] Workspace Path Configuration vs Environment Variable**
- Chosen: Configuration-based (more flexible)
- Trade-off: Requires editing config vs environment variable (simpler)
- Rationale: Configuration-based is more flexible for multi-agent scenarios

**[Trade-off] Subagent Concurrency as Top-Level Config vs Per-Agent**
- Chosen: Top-level defaults in agents.defaults
- Trade-off: No per-agent configuration (simpler initial implementation)
- Future: Can add per-agent overrides if needed
