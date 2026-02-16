import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ClaudeProcessor } from "../../src/services/claude_processor.ts";
import { ModelResolver } from "../../src/services/model_resolver.ts";
import type { AppConfig } from "../../src/config.ts";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";

describe("Multi-Provider Model Resolution Integration", () => {
  let testSkillDir: string;

  beforeEach(() => {
    testSkillDir = mkdtempSync(path.join(process.cwd(), "skill-test-"));
  });

  afterEach(() => {
    try {
      rmSync(testSkillDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Model resolution with multiple providers", () => {
    it("should resolve models across different providers", () => {
      const modelsConfig = {
        providers: {
          anthropic: {
            api: "anthropic",
            apiKey: "test-key-1",
            models: [
              { id: "opus", name: "Claude Opus" },
              { id: "sonnet", name: "Claude Sonnet" }
            ]
          },
          openai: {
            api: "openai",
            apiKey: "test-key-2",
            baseUrl: "https://api.openai.com/v1",
            models: [
              { id: "gpt-4", name: "GPT-4" },
              { id: "gpt-3.5", name: "GPT-3.5 Turbo" }
            ]
          }
        }
      };

      const resolver = new ModelResolver(modelsConfig);

      // Test resolving from anthropic provider
      const claudeModel = resolver.resolveModel("anthropic/opus");
      expect(claudeModel.providerId).toBe("anthropic");
      expect(claudeModel.modelId).toBe("opus");
      expect(claudeModel.apiType).toBe("anthropic");

      // Test resolving from openai provider
      const gptModel = resolver.resolveModel("openai/gpt-4");
      expect(gptModel.providerId).toBe("openai");
      expect(gptModel.modelId).toBe("gpt-4");
      expect(gptModel.apiType).toBe("openai");
    });

    it("should handle provider routing based on API type", () => {
      const modelsConfig = {
        providers: {
          anthropic: {
            api: "anthropic",
            models: [
              { id: "opus", name: "Claude Opus" }
            ]
          },
          openai: {
            api: "openai",
            baseUrl: "https://api.openai.com/v1",
            models: [
              { id: "gpt-4", name: "GPT-4" }
            ]
          },
          alibaba: {
            api: "openai",
            baseUrl: "https://alibaba.ai",
            models: [
              { id: "qwen-max", name: "Qwen Max" }
            ]
          }
        }
      };

      const resolver = new ModelResolver(modelsConfig);

      // Verify providers can be listed
      const providers = resolver.getProviders();
      expect(providers).toContain("anthropic");
      expect(providers).toContain("openai");
      expect(providers).toContain("alibaba");

      // Verify models can be retrieved by provider
      const anthropicModels = resolver.getModelsForProvider("anthropic");
      const openaiModels = resolver.getModelsForProvider("openai");
      const alibabaModels = resolver.getModelsForProvider("alibaba");

      expect(anthropicModels).toHaveLength(1);
      expect(openaiModels).toHaveLength(1);
      expect(alibabaModels).toHaveLength(1);
    });

    it("should include provider-specific configuration in resolved models", () => {
      const modelsConfig = {
        providers: {
          alibaba: {
            api: "openai",
            apiKey: "alibaba-key",
            baseUrl: "https://alibaba.ai",
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

      const resolver = new ModelResolver(modelsConfig);
      const resolved = resolver.resolveModel("alibaba/qwen-max");

      expect(resolved.apiKey).toBe("alibaba-key");
      expect(resolved.baseUrl).toBe("https://alibaba.ai");
      expect(resolved.model.cost?.input).toBe(0.001);
      expect(resolved.model.cost?.output).toBe(0.002);
    });

    it("should correctly resolve model metadata across providers", () => {
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
              }
            ]
          }
        }
      };

      const resolver = new ModelResolver(modelsConfig);
      const metadata = resolver.getModelMetadata("anthropic/opus");

      expect(metadata.providerId).toBe("anthropic");
      expect(metadata.modelId).toBe("opus");
      expect(metadata.name).toBe("Claude Opus");
      expect(metadata.cost?.input).toBe(0.015);
      expect(metadata.cost?.output).toBe(0.075);
      expect(metadata.apiType).toBe("anthropic");
    });

    it("should handle dynamic provider selection based on configuration", () => {
      const config1 = {
        providers: {
          primary: {
            api: "anthropic",
            models: [{ id: "default", name: "Default" }]
          }
        }
      };

      const config2 = {
        providers: {
          primary: {
            api: "anthropic",
            models: [{ id: "default", name: "Default" }]
          },
          secondary: {
            api: "openai",
            models: [{ id: "gpt-4", name: "GPT-4" }]
          }
        }
      };

      const resolver1 = new ModelResolver(config1);
      const resolver2 = new ModelResolver(config2);

      expect(resolver1.getProviders()).toHaveLength(1);
      expect(resolver2.getProviders()).toHaveLength(2);
    });

    it("should cache model resolutions for performance", () => {
      const modelsConfig = {
        providers: {
          anthropic: {
            api: "anthropic",
            models: [{ id: "opus", name: "Claude Opus" }]
          }
        }
      };

      const resolver = new ModelResolver(modelsConfig);

      // First resolution
      const resolved1 = resolver.resolveModel("anthropic/opus");
      // Second resolution - should be from cache
      const resolved2 = resolver.resolveModel("anthropic/opus");

      // Same object reference due to caching
      expect(resolved1).toBe(resolved2);
    });

    it("should work with many providers and models", () => {
      const providers: Record<string, any> = {};

      // Create 10 providers with 5 models each
      for (let i = 0; i < 10; i++) {
        const providerName = `provider-${i}`;
        providers[providerName] = {
          api: i % 2 === 0 ? "anthropic" : "openai",
          models: []
        };

        for (let j = 0; j < 5; j++) {
          providers[providerName].models.push({
            id: `model-${j}`,
            name: `Model ${j}`
          });
        }
      }

      const modelsConfig = { providers };
      const resolver = new ModelResolver(modelsConfig);

      // Verify all providers are available
      expect(resolver.getProviders()).toHaveLength(10);

      // Verify we can resolve models from each provider
      for (let i = 0; i < 10; i++) {
        const providerName = `provider-${i}`;
        const models = resolver.getModelsForProvider(providerName);
        expect(models).toHaveLength(5);

        // Test resolving a specific model
        const resolved = resolver.resolveModel(`${providerName}/model-2`);
        expect(resolved.providerId).toBe(providerName);
        expect(resolved.modelId).toBe("model-2");
      }
    });
  });

  describe("Provider API type routing", () => {
    it("should correctly identify anthropic API providers", () => {
      const modelsConfig = {
        providers: {
          anthropic: {
            api: "anthropic",
            models: [{ id: "default", name: "Default" }]
          },
          custom_anthropic: {
            api: "anthropic",
            models: [{ id: "default", name: "Default" }]
          }
        }
      };

      const resolver = new ModelResolver(modelsConfig);
      const providers = resolver.getProviders();

      const anthropicProviders = providers.filter((p) => {
        const config = modelsConfig.providers[p];
        return config.api === "anthropic";
      });

      expect(anthropicProviders).toContain("anthropic");
      expect(anthropicProviders).toContain("custom_anthropic");
    });

    it("should correctly identify openai API providers", () => {
      const modelsConfig = {
        providers: {
          openai: {
            api: "openai",
            models: [{ id: "default", name: "Default" }]
          },
          alibaba: {
            api: "openai",
            models: [{ id: "default", name: "Default" }]
          },
          custom_openai: {
            api: "openai",
            models: [{ id: "default", name: "Default" }]
          }
        }
      };

      const resolver = new ModelResolver(modelsConfig);
      const providers = resolver.getProviders();

      const openaiProviders = providers.filter((p) => {
        const config = modelsConfig.providers[p];
        return config.api === "openai";
      });

      expect(openaiProviders).toContain("openai");
      expect(openaiProviders).toContain("alibaba");
      expect(openaiProviders).toContain("custom_openai");
    });
  });
});
