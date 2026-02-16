import { describe, it, expect, beforeEach } from "vitest";
import { ModelResolver, ModelResolverError } from "../../../src/services/model_resolver";

describe("ModelResolver", () => {
  let resolver: ModelResolver;

  beforeEach(() => {
    const config = {
      providers: {
        anthropic: {
          api: "anthropic",
          apiKey: "test-key",
          models: [
            { id: "opus", name: "Claude Opus" },
            { id: "sonnet", name: "Claude Sonnet" },
            { id: "haiku", name: "Claude Haiku" }
          ]
        },
        openai: {
          api: "openai",
          baseUrl: "https://api.openai.com/v1",
          models: [
            { id: "gpt-4", name: "GPT-4" },
            { id: "gpt-3.5", name: "GPT-3.5 Turbo" }
          ]
        },
        alibaba: {
          api: "openai",
          baseUrl: "https://alibaba.ai",
          apiKey: "alibaba-key",
          models: [
            {
              id: "qwen-max",
              name: "Qwen Max",
              cost: {
                input: 0.001,
                output: 0.002
              }
            }
          ]
        }
      }
    };

    resolver = new ModelResolver(config);
  });

  describe("resolveModel", () => {
    it("should resolve model by provider/model-id format", () => {
      const result = resolver.resolveModel("anthropic/opus");

      expect(result).toBeDefined();
      expect(result.providerId).toBe("anthropic");
      expect(result.modelId).toBe("opus");
      expect(result.model.name).toBe("Claude Opus");
      expect(result.apiType).toBe("anthropic");
      expect(result.apiKey).toBe("test-key");
    });

    it("should resolve model from OpenAI provider", () => {
      const result = resolver.resolveModel("openai/gpt-4");

      expect(result.providerId).toBe("openai");
      expect(result.modelId).toBe("gpt-4");
      expect(result.model.name).toBe("GPT-4");
      expect(result.apiType).toBe("openai");
      expect(result.baseUrl).toBe("https://api.openai.com/v1");
    });

    it("should resolve model from custom provider", () => {
      const result = resolver.resolveModel("alibaba/qwen-max");

      expect(result.providerId).toBe("alibaba");
      expect(result.modelId).toBe("qwen-max");
      expect(result.model.name).toBe("Qwen Max");
      expect(result.apiType).toBe("openai");
      expect(result.baseUrl).toBe("https://alibaba.ai");
    });

    it("should include cost metadata when available", () => {
      const result = resolver.resolveModel("alibaba/qwen-max");

      expect(result.model.cost).toBeDefined();
      expect(result.model.cost?.input).toBe(0.001);
      expect(result.model.cost?.output).toBe(0.002);
    });

    it("should throw error for missing provider", () => {
      expect(() => resolver.resolveModel("nonexistent/model")).toThrow(ModelResolverError);
      expect(() => resolver.resolveModel("nonexistent/model")).toThrow("Provider not found");
    });

    it("should throw error for missing model in provider", () => {
      expect(() => resolver.resolveModel("anthropic/gpt-4")).toThrow(ModelResolverError);
      expect(() => resolver.resolveModel("anthropic/gpt-4")).toThrow("Model not found");
    });

    it("should throw error for invalid format without slash", () => {
      expect(() => resolver.resolveModel("invalidformat")).toThrow(ModelResolverError);
      expect(() => resolver.resolveModel("invalidformat")).toThrow("Invalid model reference format");
    });

    it("should throw error for empty provider ID", () => {
      expect(() => resolver.resolveModel("/model")).toThrow(ModelResolverError);
      expect(() => resolver.resolveModel("/model")).toThrow("Invalid model reference format");
    });

    it("should throw error for empty model ID", () => {
      expect(() => resolver.resolveModel("anthropic/")).toThrow(ModelResolverError);
      expect(() => resolver.resolveModel("anthropic/")).toThrow("Invalid model reference format");
    });

    it("should cache resolved models", () => {
      const result1 = resolver.resolveModel("anthropic/opus");
      const result2 = resolver.resolveModel("anthropic/opus");

      expect(result1).toBe(result2); // Should be same reference (cached)
    });

    it("should resolve multiple models from same provider", () => {
      const opus = resolver.resolveModel("anthropic/opus");
      const sonnet = resolver.resolveModel("anthropic/sonnet");

      expect(opus.modelId).toBe("opus");
      expect(sonnet.modelId).toBe("sonnet");
      expect(opus.providerId).toBe(sonnet.providerId);
    });
  });

  describe("getModelMetadata", () => {
    it("should return metadata without full model object", () => {
      const metadata = resolver.getModelMetadata("anthropic/opus");

      expect(metadata.providerId).toBe("anthropic");
      expect(metadata.modelId).toBe("opus");
      expect(metadata.name).toBe("Claude Opus");
      expect(metadata.apiType).toBe("anthropic");
      expect((metadata as any).model).toBeUndefined();
    });

    it("should include cost information in metadata", () => {
      const metadata = resolver.getModelMetadata("alibaba/qwen-max");

      expect(metadata.cost).toBeDefined();
      expect(metadata.cost?.input).toBe(0.001);
      expect(metadata.cost?.output).toBe(0.002);
    });

    it("should include baseUrl in metadata", () => {
      const metadata = resolver.getModelMetadata("openai/gpt-4");

      expect(metadata.baseUrl).toBe("https://api.openai.com/v1");
    });

    it("should throw error for invalid model reference", () => {
      expect(() => resolver.getModelMetadata("invalid/model")).toThrow(ModelResolverError);
    });
  });

  describe("getProviders", () => {
    it("should return list of all provider IDs", () => {
      const providers = resolver.getProviders();

      expect(providers).toContain("anthropic");
      expect(providers).toContain("openai");
      expect(providers).toContain("alibaba");
      expect(providers).toHaveLength(3);
    });

    it("should return provider IDs in consistent order", () => {
      const providers1 = resolver.getProviders();
      const providers2 = resolver.getProviders();

      expect(providers1).toEqual(providers2);
    });
  });

  describe("getModelsForProvider", () => {
    it("should return all models for a provider", () => {
      const models = resolver.getModelsForProvider("anthropic");

      expect(models).toHaveLength(3);
      expect(models.map((m) => m.id)).toContain("opus");
      expect(models.map((m) => m.id)).toContain("sonnet");
      expect(models.map((m) => m.id)).toContain("haiku");
    });

    it("should return models with name and cost information", () => {
      const models = resolver.getModelsForProvider("alibaba");

      expect(models).toHaveLength(1);
      expect(models[0].name).toBe("Qwen Max");
      expect(models[0].cost?.input).toBe(0.001);
    });

    it("should throw error for nonexistent provider", () => {
      expect(() => resolver.getModelsForProvider("nonexistent")).toThrow(ModelResolverError);
      expect(() => resolver.getModelsForProvider("nonexistent")).toThrow("Provider not found");
    });

    it("should work with providers with few models", () => {
      const models = resolver.getModelsForProvider("alibaba");

      expect(models).toHaveLength(1);
    });

    it("should work with providers with many models", () => {
      const models = resolver.getModelsForProvider("anthropic");

      expect(models.length).toBeGreaterThan(1);
    });
  });

  describe("clearCache", () => {
    it("should clear cached resolution results", () => {
      const result1 = resolver.resolveModel("anthropic/opus");
      resolver.clearCache();
      const result2 = resolver.resolveModel("anthropic/opus");

      // After cache clear, they should be different object references
      // but have same data
      expect(result1.modelId).toBe(result2.modelId);
      expect(result1.providerId).toBe(result2.providerId);
    });

    it("should allow re-resolution after cache clear", () => {
      resolver.resolveModel("anthropic/opus");
      expect(() => {
        resolver.clearCache();
        resolver.resolveModel("anthropic/opus");
      }).not.toThrow();
    });
  });

  describe("resolveModelWithFallback", () => {
    it("should resolve first available model in fallback chain", () => {
      const result = resolver.resolveModelWithFallback("anthropic/opus|openai/gpt-4");

      expect(result.providerId).toBe("anthropic");
      expect(result.modelId).toBe("opus");
    });

    it("should fall back to second model if first is unavailable", () => {
      const result = resolver.resolveModelWithFallback("openai/gpt-5|anthropic/opus");

      expect(result.providerId).toBe("anthropic");
      expect(result.modelId).toBe("opus");
    });

    it("should handle multiple fallback candidates", () => {
      const result = resolver.resolveModelWithFallback("openai/missing|anthropic/missing|alibaba/qwen-max");

      expect(result.providerId).toBe("alibaba");
      expect(result.modelId).toBe("qwen-max");
    });

    it("should skip unavailable providers in fallback chain", () => {
      const unavailable = new Set(["openai"]);
      const result = resolver.resolveModelWithFallback("openai/gpt-4|anthropic/opus", unavailable);

      expect(result.providerId).toBe("anthropic");
      expect(result.modelId).toBe("opus");
    });

    it("should throw error if no models in chain are available", () => {
      expect(() => {
        resolver.resolveModelWithFallback("openai/missing|anthropic/missing");
      }).toThrow("No available models in fallback chain");
    });

    it("should throw error for empty fallback chain", () => {
      expect(() => {
        resolver.resolveModelWithFallback("");
      }).toThrow("Model reference chain cannot be empty");
    });

    it("should handle chain with only unavailable providers", () => {
      const unavailable = new Set(["anthropic", "openai", "alibaba"]);
      expect(() => {
        resolver.resolveModelWithFallback("anthropic/opus|openai/gpt-4|alibaba/qwen-max", unavailable);
      }).toThrow("No available models in fallback chain");
    });

    it("should trim whitespace in fallback chain", () => {
      const result = resolver.resolveModelWithFallback("  openai/missing  |  anthropic/opus  ");

      expect(result.providerId).toBe("anthropic");
      expect(result.modelId).toBe("opus");
    });

    it("should use cache for each resolved model in chain", () => {
      resolver.resolveModelWithFallback("anthropic/opus|openai/gpt-4");

      // Resolve again - should use cached results
      const result = resolver.resolveModelWithFallback("anthropic/opus|openai/gpt-4");

      expect(result.providerId).toBe("anthropic");
      expect(result.modelId).toBe("opus");
    });

    it("should return model metadata for fallback resolved model", () => {
      const result = resolver.resolveModelWithFallback("openai/missing|alibaba/qwen-max");

      expect(result.model.name).toBe("Qwen Max");
      expect(result.model.cost?.input).toBe(0.001);
    });

    it("should handle single model reference (no fallback)", () => {
      const result = resolver.resolveModelWithFallback("anthropic/opus");

      expect(result.providerId).toBe("anthropic");
      expect(result.modelId).toBe("opus");
    });

    it("should prefer earlier models in chain when available", () => {
      const result = resolver.resolveModelWithFallback(
        "anthropic/opus|anthropic/sonnet|anthropic/haiku"
      );

      expect(result.modelId).toBe("opus");
    });
  });
});
