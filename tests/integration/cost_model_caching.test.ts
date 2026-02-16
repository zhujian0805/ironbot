import { describe, it, expect } from "vitest";
import { ModelResolver } from "../../src/services/model_resolver.ts";
import type { CostModel } from "../../src/config.ts";

describe("Cost Model with Cache Costs Integration", () => {
  describe("Cost model structure and validation", () => {
    it("should resolve model with complete cost model including cache costs", () => {
      const modelsConfig = {
        providers: {
          anthropic: {
            api: "anthropic",
            models: [
              {
                id: "opus",
                name: "Claude Opus",
                cost: {
                  input: 0.015,
                  output: 0.075,
                  cacheRead: 0.0015,
                  cacheWrite: 0.075
                }
              }
            ]
          }
        }
      };

      const resolver = new ModelResolver(modelsConfig);
      const resolved = resolver.resolveModel("anthropic/opus");

      expect(resolved.model.cost).toBeDefined();
      expect(resolved.model.cost?.input).toBe(0.015);
      expect(resolved.model.cost?.output).toBe(0.075);
      expect(resolved.model.cost?.cacheRead).toBe(0.0015);
      expect(resolved.model.cost?.cacheWrite).toBe(0.075);
    });

    it("should support cost model with partial cache costs", () => {
      const modelsConfig = {
        providers: {
          openai: {
            api: "openai",
            models: [
              {
                id: "gpt-4",
                name: "GPT-4",
                cost: {
                  input: 0.03,
                  output: 0.06,
                  cacheRead: 0.003
                  // cacheWrite intentionally omitted
                }
              }
            ]
          }
        }
      };

      const resolver = new ModelResolver(modelsConfig);
      const resolved = resolver.resolveModel("openai/gpt-4");

      expect(resolved.model.cost?.input).toBe(0.03);
      expect(resolved.model.cost?.output).toBe(0.06);
      expect(resolved.model.cost?.cacheRead).toBe(0.003);
      expect(resolved.model.cost?.cacheWrite).toBeUndefined();
    });

    it("should support cost model without cache costs", () => {
      const modelsConfig = {
        providers: {
          anthropic: {
            api: "anthropic",
            models: [
              {
                id: "haiku",
                name: "Claude Haiku",
                cost: {
                  input: 0.00080,
                  output: 0.0024
                  // No cache costs specified
                }
              }
            ]
          }
        }
      };

      const resolver = new ModelResolver(modelsConfig);
      const resolved = resolver.resolveModel("anthropic/haiku");

      expect(resolved.model.cost?.input).toBe(0.00080);
      expect(resolved.model.cost?.output).toBe(0.0024);
      expect(resolved.model.cost?.cacheRead).toBeUndefined();
      expect(resolved.model.cost?.cacheWrite).toBeUndefined();
    });

    it("should support models without any cost information", () => {
      const modelsConfig = {
        providers: {
          anthropic: {
            api: "anthropic",
            models: [
              {
                id: "sonnet",
                name: "Claude Sonnet"
                // No cost specified
              }
            ]
          }
        }
      };

      const resolver = new ModelResolver(modelsConfig);
      const resolved = resolver.resolveModel("anthropic/sonnet");

      expect(resolved.model.cost).toBeUndefined();
    });
  });

  describe("Cost metadata retrieval", () => {
    it("should return cost metadata via getModelMetadata", () => {
      const modelsConfig = {
        providers: {
          anthropic: {
            api: "anthropic",
            models: [
              {
                id: "opus",
                name: "Claude Opus",
                cost: {
                  input: 0.015,
                  output: 0.075,
                  cacheRead: 0.0015,
                  cacheWrite: 0.075
                }
              }
            ]
          }
        }
      };

      const resolver = new ModelResolver(modelsConfig);
      const metadata = resolver.getModelMetadata("anthropic/opus");

      expect(metadata.cost).toBeDefined();
      expect(metadata.cost?.input).toBe(0.015);
      expect(metadata.cost?.output).toBe(0.075);
      expect(metadata.cost?.cacheRead).toBe(0.0015);
      expect(metadata.cost?.cacheWrite).toBe(0.075);
    });

    it("should include cost info in getModelsForProvider", () => {
      const modelsConfig = {
        providers: {
          anthropic: {
            api: "anthropic",
            models: [
              {
                id: "opus",
                name: "Claude Opus",
                cost: {
                  input: 0.015,
                  output: 0.075
                }
              },
              {
                id: "sonnet",
                name: "Claude Sonnet",
                cost: {
                  input: 0.003,
                  output: 0.015
                }
              }
            ]
          }
        }
      };

      const resolver = new ModelResolver(modelsConfig);
      const models = resolver.getModelsForProvider("anthropic");

      expect(models).toHaveLength(2);
      expect(models[0].cost?.input).toBe(0.015);
      expect(models[1].cost?.input).toBe(0.003);
    });
  });

  describe("Cache cost calculations", () => {
    it("should support calculating cached vs non-cached costs", () => {
      const modelsConfig = {
        providers: {
          anthropic: {
            api: "anthropic",
            models: [
              {
                id: "opus",
                name: "Claude Opus",
                cost: {
                  input: 0.015,
                  output: 0.075,
                  cacheRead: 0.0015,
                  cacheWrite: 0.075
                }
              }
            ]
          }
        }
      };

      const resolver = new ModelResolver(modelsConfig);
      const metadata = resolver.getModelMetadata("anthropic/opus");
      const cost = metadata.cost!;

      // Non-cached input cost: 1000 tokens * 0.015 / 1M
      const nonCachedInputCost = (1000 * cost.input) / 1_000_000;

      // Cached read cost: 1000 tokens * 0.0015 / 1M
      const cachedReadCost = (1000 * cost.cacheRead!) / 1_000_000;

      // Cached should be 10x cheaper for reads
      expect(cachedReadCost).toBeLessThan(nonCachedInputCost);
      expect(nonCachedInputCost / cachedReadCost).toBeCloseTo(10, 0);
    });

    it("should compare cache costs across providers", () => {
      const modelsConfig = {
        providers: {
          anthropic: {
            api: "anthropic",
            models: [
              {
                id: "opus",
                name: "Claude Opus",
                cost: {
                  input: 0.015,
                  output: 0.075,
                  cacheRead: 0.0015,
                  cacheWrite: 0.075
                }
              }
            ]
          },
          openai: {
            api: "openai",
            models: [
              {
                id: "gpt-4",
                name: "GPT-4",
                cost: {
                  input: 0.03,
                  output: 0.06,
                  cacheRead: 0.003,
                  cacheWrite: 0.06
                }
              }
            ]
          }
        }
      };

      const resolver = new ModelResolver(modelsConfig);
      const opusMetadata = resolver.getModelMetadata("anthropic/opus");
      const gpt4Metadata = resolver.getModelMetadata("openai/gpt-4");

      const opusCost = opusMetadata.cost!;
      const gpt4Cost = gpt4Metadata.cost!;

      // Calculate base costs per million tokens
      expect(opusCost.input).toBeLessThan(gpt4Cost.input);
      expect(opusCost.output).toBeGreaterThan(gpt4Cost.output);
    });

    it("should handle models with different cache cost structures", () => {
      const modelsConfig = {
        providers: {
          models: {
            api: "anthropic",
            models: [
              {
                id: "with-cache",
                name: "With Cache",
                cost: {
                  input: 0.01,
                  output: 0.05,
                  cacheRead: 0.001,
                  cacheWrite: 0.05
                }
              },
              {
                id: "no-cache",
                name: "No Cache",
                cost: {
                  input: 0.01,
                  output: 0.05
                }
              },
              {
                id: "partial-cache",
                name: "Partial Cache",
                cost: {
                  input: 0.01,
                  output: 0.05,
                  cacheRead: 0.001
                }
              }
            ]
          }
        }
      };

      const resolver = new ModelResolver(modelsConfig);
      const models = resolver.getModelsForProvider("models");

      expect(models[0].cost?.cacheRead).toBeDefined();
      expect(models[0].cost?.cacheWrite).toBeDefined();
      expect(models[1].cost?.cacheRead).toBeUndefined();
      expect(models[2].cost?.cacheRead).toBeDefined();
      expect(models[2].cost?.cacheWrite).toBeUndefined();
    });
  });

  describe("Cost model in production scenarios", () => {
    it("should resolve costs for multi-provider setup with different pricing", () => {
      const modelsConfig = {
        providers: {
          anthropic: {
            api: "anthropic",
            models: [
              {
                id: "opus",
                name: "Claude Opus",
                cost: {
                  input: 0.015,
                  output: 0.075,
                  cacheRead: 0.0015,
                  cacheWrite: 0.075
                }
              }
            ]
          },
          alibaba: {
            api: "openai",
            baseUrl: "https://alibaba.ai",
            models: [
              {
                id: "qwen-max",
                name: "Qwen Max",
                cost: {
                  input: 0.008,
                  output: 0.002,
                  cacheRead: 0.0008,
                  cacheWrite: 0.002
                }
              }
            ]
          }
        }
      };

      const resolver = new ModelResolver(modelsConfig);

      // Check both providers have cost info
      const opusMetadata = resolver.getModelMetadata("anthropic/opus");
      const qwenMetadata = resolver.getModelMetadata("alibaba/qwen-max");

      expect(opusMetadata.cost).toBeDefined();
      expect(qwenMetadata.cost).toBeDefined();

      // Qwen might be cheaper for input
      expect(qwenMetadata.cost?.input).toBeLessThan(opusMetadata.cost!.input);
    });

    it("should handle cost updates via cache clear and re-resolution", () => {
      const initialConfig = {
        providers: {
          anthropic: {
            api: "anthropic",
            models: [
              {
                id: "opus",
                name: "Claude Opus",
                cost: {
                  input: 0.015,
                  output: 0.075,
                  cacheRead: 0.0015,
                  cacheWrite: 0.075
                }
              }
            ]
          }
        }
      };

      const resolver = new ModelResolver(initialConfig);
      const resolved1 = resolver.resolveModel("anthropic/opus");
      expect(resolved1.model.cost?.input).toBe(0.015);

      // Clear cache to force re-resolution
      resolver.clearCache();

      // Re-resolve - should still get same cost from underlying config
      const resolved2 = resolver.resolveModel("anthropic/opus");
      expect(resolved2.model.cost?.input).toBe(0.015);
    });

    it("should provide cost information for billing scenarios", () => {
      const modelsConfig = {
        providers: {
          anthropic: {
            api: "anthropic",
            models: [
              {
                id: "opus",
                name: "Claude Opus",
                cost: {
                  input: 0.015,
                  output: 0.075,
                  cacheRead: 0.0015,
                  cacheWrite: 0.075
                }
              }
            ]
          }
        }
      };

      const resolver = new ModelResolver(modelsConfig);
      const metadata = resolver.getModelMetadata("anthropic/opus");

      // Simulate billing calculation
      const inputTokens = 1000;
      const outputTokens = 500;
      const cachedReadTokens = 200;

      const cost = metadata.cost!;
      const inputCost = (inputTokens * cost.input) / 1_000_000;
      const outputCost = (outputTokens * cost.output) / 1_000_000;
      const cacheReadCost = (cachedReadTokens * cost.cacheRead!) / 1_000_000;

      const totalCost = inputCost + outputCost + cacheReadCost;

      expect(totalCost).toBeGreaterThan(0);
      expect(cacheReadCost).toBeLessThan(inputCost);
    });
  });

  describe("Cost model edge cases", () => {
    it("should handle zero cache costs", () => {
      const modelsConfig = {
        providers: {
          free: {
            api: "anthropic",
            models: [
              {
                id: "free-model",
                name: "Free Model",
                cost: {
                  input: 0,
                  output: 0,
                  cacheRead: 0,
                  cacheWrite: 0
                }
              }
            ]
          }
        }
      };

      const resolver = new ModelResolver(modelsConfig);
      const metadata = resolver.getModelMetadata("free/free-model");

      expect(metadata.cost?.input).toBe(0);
      expect(metadata.cost?.cacheRead).toBe(0);
    });

    it("should handle very small cache cost values", () => {
      const modelsConfig = {
        providers: {
          precision: {
            api: "anthropic",
            models: [
              {
                id: "precise",
                name: "Precise",
                cost: {
                  input: 0.0000002,
                  output: 0.0000004,
                  cacheRead: 0.0000001,
                  cacheWrite: 0.0000004
                }
              }
            ]
          }
        }
      };

      const resolver = new ModelResolver(modelsConfig);
      const metadata = resolver.getModelMetadata("precision/precise");

      expect(metadata.cost?.cacheRead).toBe(0.0000001);
      expect(metadata.cost?.cacheRead).toBeLessThan(metadata.cost?.input);
    });

    it("should handle large cost values", () => {
      const modelsConfig = {
        providers: {
          expensive: {
            api: "anthropic",
            models: [
              {
                id: "premium",
                name: "Premium",
                cost: {
                  input: 100,
                  output: 200,
                  cacheRead: 10,
                  cacheWrite: 200
                }
              }
            ]
          }
        }
      };

      const resolver = new ModelResolver(modelsConfig);
      const metadata = resolver.getModelMetadata("expensive/premium");

      expect(metadata.cost?.input).toBe(100);
      expect(metadata.cost?.cacheRead).toBe(10);
      expect(metadata.cost?.cacheRead).toBeLessThan(metadata.cost?.input);
    });
  });
});
