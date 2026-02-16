## ADDED Requirements

### Requirement: Per-model alias assignment
The system SHALL support optional alias field for each model, allowing human-readable names for model references.

#### Scenario: Model with alias
- **WHEN** agent config specifies `models: { "qwen-portal/coder-model": { alias: "qwen" } }`
- **THEN** the model "qwen-portal/coder-model" is aliased as "qwen"

#### Scenario: Model without alias
- **WHEN** agent config specifies `models: { "qwen-portal/vision-model": {} }`
- **THEN** the model has no alias; model reference is "qwen-portal/vision-model"

#### Scenario: Multiple models with aliases
- **WHEN** agent config specifies aliases for multiple models:
  ```
  models: {
    "anthropic/opus": { alias: "claude-opus" },
    "openai/gpt-4": { alias: "gpt4" },
    "qwen-portal/coder": { alias: "qwen" }
  }
  ```
- **THEN** all models are available with their respective aliases

#### Scenario: Aliases across different providers
- **WHEN** agent config includes models from multiple providers with aliases
- **THEN** each alias is uniquely associated with its model reference

### Requirement: Alias metadata retrieval
The system SHALL expose model aliases through ModelResolver for use in logs, UI, and user-facing APIs.

#### Scenario: Get alias for model
- **WHEN** system requests alias for "qwen-portal/coder-model"
- **THEN** ModelResolver returns "qwen" (or null if no alias defined)

#### Scenario: Get all models with aliases
- **WHEN** system requests all available models
- **THEN** response includes both model reference and alias for each model

#### Scenario: Fallback alias lookup
- **WHEN** fallback chain includes models with aliases
- **THEN** aliases are available for each model in the chain

### Requirement: Alias usage in model references
The system SHALL allow looking up models by either their reference (provider/id) or their alias.

#### Scenario: Lookup by model reference
- **WHEN** agent requests model "qwen-portal/coder-model"
- **THEN** system finds and returns that model

#### Scenario: Lookup by alias (for display/logging)
- **WHEN** system logs or displays model selection
- **THEN** system can show alias ("qwen") instead of full reference if available

#### Scenario: No alias fallback to reference
- **WHEN** model has no alias defined
- **THEN** system displays the full model reference (provider/id)

### Requirement: Alias scope
The system SHALL support model aliases defined at the agent level, associated with available models.

#### Scenario: Aliases per agent configuration
- **WHEN** agent configuration specifies `models` map with aliases
- **THEN** those aliases are available for that agent's model selection

#### Scenario: Alias metadata not used for routing
- **WHEN** agent references a model
- **THEN** routing uses model reference (provider/id), not alias

#### Scenario: Optional aliases
- **WHEN** no aliases are configured
- **THEN** system works normally using model references only
