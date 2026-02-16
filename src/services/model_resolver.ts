import { ModelsConfig, ModelDefinition, CostModel } from "../config.ts";

export class ModelResolverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelResolverError";
  }
}

export interface ResolvedModel {
  providerId: string;
  modelId: string;
  model: ModelDefinition;
  baseUrl?: string;
  apiType?: string;
  apiKey?: string;
}

/**
 * ModelResolver handles model lookup by provider/model-id format
 * Supports caching and fallback chains across providers
 */
export class ModelResolver {
  private modelsConfig: ModelsConfig;
  private cache: Map<string, ResolvedModel> = new Map();

  constructor(modelsConfig: ModelsConfig) {
    this.modelsConfig = modelsConfig;
  }

  /**
   * Resolve a model by provider/model-id format
   * e.g., "anthropic/claude-opus" or "moonshot/kimi-k2"
   */
  resolveModel(modelRef: string): ResolvedModel {
    // Check cache first
    if (this.cache.has(modelRef)) {
      return this.cache.get(modelRef)!;
    }

    const [providerId, modelId] = modelRef.split("/");

    if (!providerId || !modelId) {
      throw new ModelResolverError(
        `Invalid model reference format: "${modelRef}". Expected format: "provider/model-id"`
      );
    }

    const providerConfig = this.modelsConfig.providers[providerId];
    if (!providerConfig) {
      throw new ModelResolverError(
        `Provider not found: "${providerId}". Available providers: ${Object.keys(this.modelsConfig.providers).join(", ")}`
      );
    }

    const model = providerConfig.models.find((m) => m.id === modelId);
    if (!model) {
      throw new ModelResolverError(
        `Model not found: "${modelId}" in provider "${providerId}". Available models: ${providerConfig.models.map((m) => m.id).join(", ")}`
      );
    }

    const resolved: ResolvedModel = {
      providerId,
      modelId,
      model,
      baseUrl: providerConfig.baseUrl,
      apiType: providerConfig.api,
      apiKey: providerConfig.apiKey
    };

    // Cache the result
    this.cache.set(modelRef, resolved);

    return resolved;
  }

  /**
   * Get model metadata including cost information
   */
  getModelMetadata(modelRef: string): Omit<ResolvedModel, "model"> & { name: string; cost?: CostModel } {
    const resolved = this.resolveModel(modelRef);
    return {
      providerId: resolved.providerId,
      modelId: resolved.modelId,
      name: resolved.model.name,
      cost: resolved.model.cost,
      baseUrl: resolved.baseUrl,
      apiType: resolved.apiType,
      apiKey: resolved.apiKey
    };
  }

  /**
   * Get all providers
   */
  getProviders(): string[] {
    return Object.keys(this.modelsConfig.providers);
  }

  /**
   * Get all models for a provider
   */
  getModelsForProvider(providerId: string): ModelDefinition[] {
    const providerConfig = this.modelsConfig.providers[providerId];
    if (!providerConfig) {
      throw new ModelResolverError(`Provider not found: "${providerId}"`);
    }
    return providerConfig.models;
  }

  /**
   * Clear the resolution cache (useful for testing or config reloads)
   */
  clearCache(): void {
    this.cache.clear();
  }
}
