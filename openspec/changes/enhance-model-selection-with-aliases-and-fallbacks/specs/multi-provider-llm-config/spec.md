## MODIFIED Requirements

### Requirement: Configure multiple LLM providers simultaneously
The system SHALL support configuration of multiple LLM providers (e.g., Moonshot, Azure OpenAI, Google Gemini, Anthropic) in a single configuration file, allowing fallback chains and provider-agnostic model selection. Model selection supports both single string references and structured primary/fallbacks format.

#### Scenario: Configuration with multiple providers
- **WHEN** ironbot loads a configuration with multiple providers under `models.providers`
- **THEN** all providers are loaded and available for model selection

#### Scenario: Provider-specific settings
- **WHEN** a provider has `baseUrl` and `api` fields specified
- **THEN** those settings are used for that provider's API calls (not inherited from default)

#### Scenario: Model selection with string reference
- **WHEN** agent config specifies `model: "anthropic/opus"` (single string)
- **THEN** system selects that single model with automatic backward compatibility

#### Scenario: Model selection with primary/fallbacks
- **WHEN** agent config specifies `model: { primary: "qwen-portal/coder", fallbacks: [...] }`
- **THEN** system uses primary first, then fallbacks in order

### Requirement: Provider-agnostic model referencing
The system SHALL use `provider/model-id` format for all model references, enabling lookup across providers without provider-specific logic.

#### Scenario: Model reference resolution
- **WHEN** agent references model `moonshot/kimi-k2-0905-preview`
- **THEN** system resolves to Moonshot's Kimi model without hardcoded provider logic

#### Scenario: Fallback models from different providers
- **WHEN** primary model fails and fallback is from different provider
- **THEN** system switches to fallback provider and completes request

#### Scenario: Aliases for model references
- **WHEN** model has an alias configured (e.g., "qwen" for "qwen-portal/coder-model")
- **THEN** system can display/log the alias while routing uses the full model reference
