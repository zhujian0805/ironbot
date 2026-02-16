import { ModelsConfig } from "../config.ts";

export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigValidationError";
  }
}

export function validateModelsConfig(modelsConfig: ModelsConfig): void {
  if (!modelsConfig || !modelsConfig.providers) {
    return; // Models configuration is optional
  }

  const providers = modelsConfig.providers;
  const providerIds = Object.keys(providers);

  // Validate that provider IDs are unique (they are by key structure)
  // Validate each provider
  const allModelIds = new Map<string, string>(); // modelId -> providerId

  for (const [providerId, providerConfig] of Object.entries(providers)) {
    // Validate provider ID is not empty
    if (!providerId || providerId.trim() === "") {
      throw new ConfigValidationError(
        "Provider ID cannot be empty"
      );
    }

    // Validate provider has models array
    if (!Array.isArray(providerConfig.models)) {
      throw new ConfigValidationError(
        `Provider "${providerId}" must have a "models" array`
      );
    }

    // Validate each model in the provider
    for (const model of providerConfig.models) {
      // Validate model has required id and name
      if (!model.id || model.id.trim() === "") {
        throw new ConfigValidationError(
          `Provider "${providerId}": model must have a non-empty "id"`
        );
      }

      if (!model.name || model.name.trim() === "") {
        throw new ConfigValidationError(
          `Provider "${providerId}": model "${model.id}" must have a non-empty "name"`
        );
      }

      // Check for duplicate model IDs within provider
      const modelKey = `${providerId}/${model.id}`;
      if (allModelIds.has(modelKey)) {
        throw new ConfigValidationError(
          `Duplicate model ID: "${modelKey}" is defined multiple times`
        );
      }
      allModelIds.set(modelKey, providerId);

      // Validate cost model if provided
      if (model.cost) {
        if (model.cost.input !== undefined && typeof model.cost.input !== "number") {
          throw new ConfigValidationError(
            `Provider "${providerId}", model "${model.id}": cost.input must be a number`
          );
        }
        if (model.cost.output !== undefined && typeof model.cost.output !== "number") {
          throw new ConfigValidationError(
            `Provider "${providerId}", model "${model.id}": cost.output must be a number`
          );
        }
        if (model.cost.cacheRead !== undefined && typeof model.cost.cacheRead !== "number") {
          throw new ConfigValidationError(
            `Provider "${providerId}", model "${model.id}": cost.cacheRead must be a number`
          );
        }
        if (model.cost.cacheWrite !== undefined && typeof model.cost.cacheWrite !== "number") {
          throw new ConfigValidationError(
            `Provider "${providerId}", model "${model.id}": cost.cacheWrite must be a number`
          );
        }
      }
    }

    // Validate provider api type if specified
    if (providerConfig.api && !["anthropic", "openai"].includes(providerConfig.api)) {
      throw new ConfigValidationError(
        `Provider "${providerId}": api type must be "anthropic" or "openai", got "${providerConfig.api}"`
      );
    }
  }
}

export function validateAgentConfig(agentConfig: any, modelsConfig?: ModelsConfig): void {
  if (!agentConfig) {
    return; // Agent configuration is optional
  }

  // Get all available model refs for validation
  const availableModels = new Set<string>();
  if (modelsConfig) {
    for (const [providerId, providerConfig] of Object.entries(modelsConfig.providers)) {
      for (const model of providerConfig.models) {
        availableModels.add(`${providerId}/${model.id}`);
      }
    }
  }

  // Validate model selection (string or primary/fallbacks structure)
  if (agentConfig.model) {
    if (typeof agentConfig.model === "string") {
      // String format: validate if we have models config
      if (modelsConfig && !availableModels.has(agentConfig.model)) {
        throw new ConfigValidationError(
          `Model not found: "${agentConfig.model}". Available models: ${Array.from(availableModels).join(", ")}`
        );
      }
    } else if (typeof agentConfig.model === "object") {
      // Structured format: validate primary and fallbacks
      if (!agentConfig.model.primary) {
        throw new ConfigValidationError(
          "Model selection must have a 'primary' field"
        );
      }

      if (typeof agentConfig.model.primary !== "string") {
        throw new ConfigValidationError(
          `Model primary must be a string, got ${typeof agentConfig.model.primary}`
        );
      }

      // Validate primary model exists
      if (modelsConfig && !availableModels.has(agentConfig.model.primary)) {
        throw new ConfigValidationError(
          `Primary model not found: "${agentConfig.model.primary}". Available models: ${Array.from(availableModels).join(", ")}`
        );
      }

      // Validate fallbacks if provided
      if (agentConfig.model.fallbacks) {
        if (!Array.isArray(agentConfig.model.fallbacks)) {
          throw new ConfigValidationError(
            "Model fallbacks must be an array"
          );
        }

        for (const fallback of agentConfig.model.fallbacks) {
          if (typeof fallback !== "string") {
            throw new ConfigValidationError(
              `Fallback model must be a string, got ${typeof fallback}`
            );
          }

          // Validate fallback model exists
          if (modelsConfig && !availableModels.has(fallback)) {
            throw new ConfigValidationError(
              `Fallback model not found: "${fallback}". Available models: ${Array.from(availableModels).join(", ")}`
            );
          }

          // Optional: warn if fallback is same as primary
          if (fallback === agentConfig.model.primary) {
            console.warn(`Warning: fallback model "${fallback}" is the same as primary model`);
          }
        }
      }
    }
  }

  // Validate models (aliases) map if provided
  if (agentConfig.models) {
    if (typeof agentConfig.models !== "object" || Array.isArray(agentConfig.models)) {
      throw new ConfigValidationError(
        "Agent models must be an object (Record<string, { alias?: string }>)"
      );
    }

    for (const [modelRef, metadata] of Object.entries(agentConfig.models)) {
      // Validate model reference format
      if (!modelRef.includes("/")) {
        throw new ConfigValidationError(
          `Invalid model reference: "${modelRef}". Expected format: "provider/model-id"`
        );
      }

      // Validate metadata is an object
      if (typeof metadata !== "object" || Array.isArray(metadata)) {
        throw new ConfigValidationError(
          `Model metadata for "${modelRef}" must be an object`
        );
      }

      // Validate alias if provided
      const modelMetadata = metadata as any;
      if (modelMetadata.alias !== undefined && typeof modelMetadata.alias !== "string") {
        throw new ConfigValidationError(
          `Alias for "${modelRef}" must be a string, got ${typeof modelMetadata.alias}`
        );
      }
    }
  }

  // Validate compactionMode if provided
  if (agentConfig.compactionMode) {
    const validModes = ["safeguard", "moderate", "aggressive"];
    if (!validModes.includes(agentConfig.compactionMode)) {
      throw new ConfigValidationError(
        `Invalid compactionMode: "${agentConfig.compactionMode}". Must be one of: ${validModes.join(", ")}`
      );
    }
  }

  // Validate subagents.maxConcurrent if provided
  if (agentConfig.subagents?.maxConcurrent !== undefined) {
    if (typeof agentConfig.subagents.maxConcurrent !== "number" || agentConfig.subagents.maxConcurrent <= 0) {
      throw new ConfigValidationError(
        "subagents.maxConcurrent must be a positive number"
      );
    }
  }
}
