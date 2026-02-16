## ADDED Requirements

### Requirement: Extended cost model with cache costs
The system SHALL support cost tracking for input tokens, output tokens, cache reads, and cache writes in the model cost configuration.

#### Scenario: Cost model with all token types
- **WHEN** model defines costs with `input`, `output`, `cacheRead`, and `cacheWrite` fields
- **THEN** all costs are stored and available for cost-aware routing

#### Scenario: Partial cost specification
- **WHEN** model specifies only `input` and `output` costs without cache costs
- **THEN** system defaults cache costs to 0 and makes the configuration valid

#### Scenario: Cost model access in agent
- **WHEN** agent queries model metadata via ModelResolver
- **THEN** system returns complete cost model including cache costs

### Requirement: Cache-aware cost calculation
The system SHALL enable calculation of total costs including cache savings when models are used with prompt caching enabled.

#### Scenario: Cost awareness for cache-enabled models
- **WHEN** costs include cache read/write rates (e.g., Moonshot Kimi at 0.1x input cache rate)
- **THEN** agents can calculate expected cost savings from cached prompts

#### Scenario: Cost comparison across providers
- **WHEN** comparing two models with different cache cost structures
- **THEN** system can determine which is more cost-effective given cache hit rates

### Requirement: Cost metadata as routing hint
The system SHALL provide cost information for use in provider-agnostic model selection without enforcing cost-based routing.

#### Scenario: Cost metadata availability
- **WHEN** requesting model metadata via `ModelResolver.getModelMetadata()`
- **THEN** system returns costs including cache costs if available

#### Scenario: Zero cost models
- **WHEN** model specifies zero costs (e.g., free tier or testing)
- **THEN** cost field is valid and indicates no billing for that model
