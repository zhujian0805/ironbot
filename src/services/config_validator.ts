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

export function validateAgentConfig(agentConfig: any): void {
  if (!agentConfig) {
    return; // Agent configuration is optional
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
