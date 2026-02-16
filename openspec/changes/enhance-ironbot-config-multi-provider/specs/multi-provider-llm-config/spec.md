## ADDED Requirements

### Requirement: Configure multiple LLM providers simultaneously
The system SHALL support configuration of multiple LLM providers (e.g., Moonshot, Azure OpenAI, Google Gemini, Anthropic) in a single configuration file, allowing fallback chains and provider-agnostic model selection.

#### Scenario: Configuration with multiple providers
- **WHEN** ironbot loads a configuration with multiple providers under `models.providers`
- **THEN** all providers are loaded and available for model resolution

#### Scenario: Provider-specific settings
- **WHEN** a provider has `baseUrl` and `api` fields specified
- **THEN** those settings are used for that provider's API calls (not inherited from default)

### Requirement: Array-based model definitions per provider
The system SHALL support defining models as arrays within each provider, where each model has an ID, name, and metadata.

#### Scenario: Model lookup by provider and ID
- **WHEN** requesting model with ID `qwen-portal/coder-model`
- **THEN** system finds the `coder-model` in the `qwen-portal` provider

#### Scenario: Multiple models per provider
- **WHEN** a provider has multiple models defined in its `models` array
- **THEN** all models are available for selection independently

### Requirement: Provider-agnostic model referencing
The system SHALL use `provider/model-id` format for all model references, enabling lookup across providers without provider-specific logic.

#### Scenario: Model reference resolution
- **WHEN** agent references model `moonshot/kimi-k2-0905-preview`
- **THEN** system resolves to Moonshot's Kimi model without hardcoded provider logic

#### Scenario: Fallback models from different providers
- **WHEN** primary model fails and fallback is from different provider
- **THEN** system switches to fallback provider and completes request

### Requirement: Provider API type configuration
The system SHALL support configurable API types per provider (e.g., `openai-completions`, `anthropic`), allowing compatibility with OpenAI-compatible and Anthropic-compatible APIs.

#### Scenario: OpenAI-compatible provider configuration
- **WHEN** provider specifies `api: "openai-completions"`
- **THEN** system uses OpenAI-compatible API format for requests to that provider

#### Scenario: Anthropic-compatible provider configuration
- **WHEN** provider specifies `api: "anthropic"`
- **THEN** system uses Anthropic-compatible API format for requests to that provider
