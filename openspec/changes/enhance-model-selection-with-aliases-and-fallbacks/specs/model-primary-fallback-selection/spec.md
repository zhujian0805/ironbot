## ADDED Requirements

### Requirement: Primary model selection with optional fallbacks
The system SHALL support specifying a primary model and an optional ordered array of fallback models in agent configuration, enabling explicit fallback chains.

#### Scenario: Primary model only
- **WHEN** agent config specifies `model: { primary: "anthropic/opus" }`
- **THEN** agent uses anthropic/opus as its model

#### Scenario: Primary with multiple fallbacks
- **WHEN** agent config specifies:
  ```
  model: {
    primary: "qwen-portal/coder-model",
    fallbacks: ["azure-openai/gpt-5", "moonshot/kimi-preview"]
  }
  ```
- **THEN** system attempts primary first, then fallbacks[0], then fallbacks[1] in order

#### Scenario: Fallback models from different providers
- **WHEN** primary model fails and fallback is from a different provider
- **THEN** system switches to fallback provider and completes request

#### Scenario: Empty fallbacks array
- **WHEN** agent config specifies `model: { primary: "anthropic/opus", fallbacks: [] }`
- **THEN** system treats as primary-only (empty array same as no fallbacks)

### Requirement: Primary/fallbacks override
The system SHALL support primary/fallbacks model selection as an alternative to single string model references, with automatic backward compatibility.

#### Scenario: String model reference (backward compatibility)
- **WHEN** agent config specifies `model: "anthropic/opus"` (string format)
- **THEN** system converts internally to `{ primary: "anthropic/opus" }` and works unchanged

#### Scenario: Primary/fallbacks structure
- **WHEN** agent config uses structured `model: { primary, fallbacks }` format
- **THEN** system uses that structure directly without conversion

#### Scenario: Both formats in same deployment
- **WHEN** some agents use string format and others use structured format
- **THEN** both formats work correctly in the same deployment

### Requirement: Fallback resolution behavior
The system SHALL resolve fallbacks in order when primary model is unavailable, with clear error reporting.

#### Scenario: Successful fallback attempt
- **WHEN** primary model is unavailable but fallback[0] is available
- **THEN** system uses fallback[0] and completes request

#### Scenario: All models unavailable
- **WHEN** primary and all fallbacks are unavailable
- **THEN** system reports error with all attempted models

#### Scenario: No fallbacks configured
- **WHEN** primary model fails and no fallbacks are configured
- **THEN** system reports error for primary model only
