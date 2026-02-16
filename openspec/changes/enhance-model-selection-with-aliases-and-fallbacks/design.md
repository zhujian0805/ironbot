## Context

The multi-provider configuration system (enhance-ironbot-config-multi-provider) currently supports specifying a single model reference per agent. To enable fallback chains and human-readable model names, the agent configuration needs to support both a primary model and an ordered list of fallbacks. Additionally, models need optional aliases for better usability in logs, UI, and user-facing APIs.

Current limitations:
- Single model reference per agent (e.g., `model: "anthropic/opus"`)
- Fallback chains specified as pipe-separated strings (e.g., `anthropic/opus|openai/gpt-4`)
- No human-readable aliases for models
- Unclear fallback ordering and priority

**Stakeholders:**
- Operations teams managing multi-provider deployments
- UI/log systems needing human-readable model names
- Developers implementing cost-aware or capability-aware model selection

## Goals / Non-Goals

**Goals:**
- Support explicit primary/fallbacks model selection structure in agent configuration
- Enable per-model alias assignment for human-readable names
- Maintain backward compatibility with single string model references
- Improve clarity and discoverability of available models through aliases
- Support model aliasing for all providers (Anthropic, OpenAI, Moonshot, etc.)

**Non-Goals:**
- Automatic fallback selection based on cost or performance (metadata only, user-implemented)
- Per-agent model overrides (primary/fallbacks apply globally in agents.defaults)
- Dynamic runtime model switching without restart
- Alias validation or uniqueness enforcement (user responsibility)

## Decisions

### Decision 1: Primary/Fallbacks as Structured Object vs Pipe-Separated String
**Choice:** Structured object with `primary` and `fallbacks` array

**Rationale:**
- Arrays provide natural ordering and iteration semantics
- Explicit field names clarify intent (not a concatenated string to parse)
- Easier for tools, CLIs, and UIs to work with
- Type-safe: structured approach enables compile-time validation

**Alternative Considered:**
- Pipe-separated string (status quo) - less explicit, harder to parse, no ordering guarantee

### Decision 2: Alias Storage Location
**Choice:** Separate `models` map in agent configuration alongside `model.primary/fallbacks`

**Rationale:**
- Aliases are metadata about available models, distinct from selection logic
- Allows aliases for all models, not just the primary/fallback chain
- Cleaner separation: selection logic vs model metadata
- Easier to add more per-model metadata (display name, description, etc.) in future

**Alternatives Considered:**
- Aliases directly in model definition (in models.providers): Would require changes to multi-provider config, tighter coupling
- Aliases in a separate global map: Less discoverable, less tied to agent context

### Decision 3: Model Reference Format in Aliases Map
**Choice:** Use full `provider/model-id` format as key (e.g., `"qwen-portal/coder-model"`)

**Rationale:**
- Consistent with existing model reference format
- Enables aliases for any model, not just those in primary/fallbacks
- No ambiguity: each key uniquely identifies a model
- Matches format used in ModelResolver

**Alternative Considered:**
- Nested structure (provider → model): More complex, inconsistent with existing format

### Decision 4: Fallback Resolution Strategy
**Choice:** Linear fallback chain - try primary, then fallbacks[0], fallbacks[1], etc.

**Rationale:**
- Simple, predictable behavior
- User explicitly defines order in config
- Matches existing pipe-separated fallback semantics
- No cost/capability computation (that's user-implemented)

**Alternative Considered:**
- Automatic intelligent fallback: Requires cost data, too opinionated

### Decision 5: Backward Compatibility Handling
**Choice:** Convert single string `model` reference to `{ primary: string }` automatically

**Rationale:**
- Existing configs continue to work unchanged
- No breaking change to deployment workflow
- Conversion happens at config load time, transparent to rest of system

**Implementation:**
- In config loading (`resolveConfig()`), detect if `agents.model` is string
- Convert to `{ primary: value }` internally
- Rest of codebase works with structured format

## Risks / Trade-offs

**[Risk] Configuration Complexity Increases**
- Mitigation: Keep structure simple (primary + fallbacks). Provide example configs showing common patterns.

**[Risk] Aliases Become Stale or Mismatched**
- Mitigation: Aliases are informational only. Mismatch doesn't break functionality. Documented as user responsibility.

**[Trade-off] Alias Uniqueness Not Enforced**
- Chosen: No validation for duplicate aliases
- Trade-off: Simpler implementation, but users could create confusing duplicate aliases
- Rationale: Aliases are metadata for human consumption; duplicates don't break functionality

**[Trade-off] Fallback Resolution Not Cost-Aware**
- Chosen: Linear chain, explicit user-defined order
- Trade-off: User implements cost-aware selection in their code if needed
- Rationale: Avoids over-engineering; metadata provided for user-implemented strategies

## Migration Plan

1. **Phase 1 (Backward Compatible):**
   - Extend `AgentDefaults` type to accept both `model: string` and `model: { primary, fallbacks }`
   - Add config loader to convert string → object automatically
   - Update ModelResolver to work with both formats
   - Update agent factory to handle structured model selection
   - Tests verify backward compat (string refs work unchanged)

2. **Phase 2 (Optional):**
   - Example configs updated to show primary/fallbacks structure
   - Documentation guides teams on migration path
   - No forced changes to existing deployments

3. **Rollback:**
   - Old string format continues to work indefinitely
   - If needed, revert config structure, no data loss

## Open Questions

- Should aliases map be per-agent or global? (Decided: per-agent under agents configuration, but could extend to global later)
- Should we validate fallback models exist at startup? (Deferred: validation in config_validator phase)
