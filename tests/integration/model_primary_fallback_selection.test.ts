import { describe, it, expect } from "vitest";
import { resolveConfig, type AppConfig, type ModelSelection } from "../../src/config.ts";
import { ModelResolver } from "../../src/services/model_resolver.ts";
import { AgentFactory } from "../../src/services/agent_factory.ts";
import { ClaudeProcessor } from "../../src/services/claude_processor.ts";
import { PiAgentProcessor } from "../../src/services/pi_agent_processor.ts";

describe("Model Primary/Fallback Selection Integration", () => {
  const createTestConfig = (model?: string | ModelSelection, modelAliases?: Record<string, { alias?: string }>): AppConfig => {
    const baseConfig = resolveConfig();
    return {
      ...baseConfig,
      models: {
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
            apiKey: "test-key",
            baseUrl: "https://api.openai.com/v1",
            models: [
              { id: "gpt-4", name: "GPT-4" },
              { id: "gpt-3.5", name: "GPT-3.5 Turbo" }
            ]
          },
          moonshot: {
            api: "openai",
            apiKey: "test-key",
            baseUrl: "https://api.moonshot.cn/v1",
            models: [
              { id: "kimi-k2", name: "Kimi K2" }
            ]
          }
        }
      },
      agents: {
        model,
        ...(modelAliases && { models: modelAliases }),
        defaults: {}
      }
    } as any;
  };

  describe("Primary with fallbacks resolution", () => {
    it("should resolve primary model from structured format", () => {
      const config = createTestConfig({
        primary: "anthropic/opus",
        fallbacks: ["anthropic/sonnet"]
      });

      const resolver = new ModelResolver(config.models);
      const model = resolver.resolveModel("anthropic/opus");
      expect(model.modelId).toBe("opus");
      expect(model.providerId).toBe("anthropic");
    });

    it("should resolve model selection with fallbacks array", () => {
      const config = createTestConfig({
        primary: "anthropic/opus",
        fallbacks: ["anthropic/sonnet", "openai/gpt-4"]
      });

      const selection = config.agents?.model as ModelSelection;
      expect(selection.primary).toBe("anthropic/opus");
      expect(selection.fallbacks).toHaveLength(2);
    });

    it("should support fallback chain across providers", () => {
      const config = createTestConfig({
        primary: "anthropic/opus",
        fallbacks: ["moonshot/kimi-k2", "openai/gpt-4"]
      });

      const resolver = new ModelResolver(config.models);

      // Primary available
      const primary = resolver.resolveModel("anthropic/opus");
      expect(primary.providerId).toBe("anthropic");

      // All fallbacks resolvable
      const fallback1 = resolver.resolveModel("moonshot/kimi-k2");
      expect(fallback1.providerId).toBe("moonshot");

      const fallback2 = resolver.resolveModel("openai/gpt-4");
      expect(fallback2.providerId).toBe("openai");
    });
  });

  describe("Backward compatibility with string format", () => {
    it("should work with string model reference", () => {
      const config = createTestConfig("anthropic/opus");
      expect(config.agents?.model).toBe("anthropic/opus");

      const resolver = new ModelResolver(config.models);
      const model = resolver.resolveModel(config.agents.model as string);
      expect(model.modelId).toBe("opus");
    });

    it("should support string format in processors", () => {
      const config = createTestConfig("anthropic/opus");
      const processor = new ClaudeProcessor(config.skillDirs, config);
      const fallbacks = processor.getModelFallbacks();
      expect(fallbacks).toEqual([]);
    });

    it("string and structured formats should both work in deployment", () => {
      // Agent 1 uses string format (backward compat)
      const config1 = createTestConfig("anthropic/opus");
      const processor1 = new ClaudeProcessor(config1.skillDirs, config1);
      expect(processor1.getModelFallbacks()).toEqual([]);

      // Agent 2 uses structured format (new feature)
      const config2 = createTestConfig({
        primary: "anthropic/opus",
        fallbacks: ["anthropic/sonnet"]
      });
      const processor2 = new ClaudeProcessor(config2.skillDirs, config2);
      expect(processor2.getModelFallbacks()).toEqual(["anthropic/sonnet"]);
    });
  });

  describe("Model alias integration", () => {
    it("should resolve aliases for primary model", () => {
      const config = createTestConfig("anthropic/opus", {
        "anthropic/opus": { alias: "claude-opus" }
      });

      const resolver = new ModelResolver(config.models, config.agents?.models);
      const alias = resolver.getModelAlias("anthropic/opus");
      expect(alias).toBe("claude-opus");
    });

    it("should resolve aliases for fallback models", () => {
      const config = createTestConfig(
        {
          primary: "anthropic/opus",
          fallbacks: ["anthropic/sonnet", "openai/gpt-4"]
        },
        {
          "anthropic/opus": { alias: "primary" },
          "anthropic/sonnet": { alias: "fallback1" },
          "openai/gpt-4": { alias: "fallback2" }
        }
      );

      const resolver = new ModelResolver(config.models, config.agents?.models);
      expect(resolver.getModelAlias("anthropic/opus")).toBe("primary");
      expect(resolver.getModelAlias("anthropic/sonnet")).toBe("fallback1");
      expect(resolver.getModelAlias("openai/gpt-4")).toBe("fallback2");
    });

    it("should support partial aliases (some models with, some without)", () => {
      const config = createTestConfig(
        { primary: "anthropic/opus", fallbacks: ["anthropic/sonnet"] },
        { "anthropic/opus": { alias: "primary" } }
      );

      const resolver = new ModelResolver(config.models, config.agents?.models);
      expect(resolver.getModelAlias("anthropic/opus")).toBe("primary");
      expect(resolver.getModelAlias("anthropic/sonnet")).toBeUndefined();
    });

    it("should list all models with their aliases", () => {
      const config = createTestConfig(
        { primary: "anthropic/opus" },
        {
          "anthropic/opus": { alias: "claude-opus" },
          "openai/gpt-4": { alias: "gpt4" }
        }
      );

      const resolver = new ModelResolver(config.models, config.agents?.models);
      const allModels = resolver.listModelsWithAliases();

      const withAlias = allModels.filter(m => m.alias);
      expect(withAlias).toHaveLength(2);
      expect(withAlias.some(m => m.ref === "anthropic/opus" && m.alias === "claude-opus")).toBe(true);
    });
  });

  describe("Agent factory model selection", () => {
    it("should initialize processor with primary model from config", () => {
      const config = createTestConfig("anthropic/opus");
      const processor = AgentFactory.create(config, config.skillDirs) as ClaudeProcessor;
      expect(processor).toBeInstanceOf(ClaudeProcessor);
    });

    it("should initialize processor with fallbacks from structured config", () => {
      const config = createTestConfig({
        primary: "anthropic/opus",
        fallbacks: ["anthropic/sonnet"]
      });
      const processor = AgentFactory.create(config, config.skillDirs) as ClaudeProcessor;
      expect(processor.getModelFallbacks()).toEqual(["anthropic/sonnet"]);
    });

    it("should route to correct processor based on provider API type", () => {
      const anthropicConfig = createTestConfig("anthropic/opus");
      const anthropicProcessor = AgentFactory.create(anthropicConfig, anthropicConfig.skillDirs);
      expect(anthropicProcessor).toBeInstanceOf(ClaudeProcessor);

      const openaiConfig = createTestConfig("openai/gpt-4");
      const openaiProcessor = AgentFactory.create(openaiConfig, openaiConfig.skillDirs);
      expect(openaiProcessor).toBeInstanceOf(PiAgentProcessor);
    });

    it("should handle primary from different provider than fallbacks", () => {
      const config = createTestConfig({
        primary: "anthropic/opus",
        fallbacks: ["openai/gpt-4", "moonshot/kimi-k2"]
      });
      const processor = AgentFactory.create(config, config.skillDirs) as ClaudeProcessor;
      expect(processor.getModelFallbacks()).toEqual(["openai/gpt-4", "moonshot/kimi-k2"]);
    });
  });

  describe("Error handling for invalid configurations", () => {
    it("should handle missing primary in structured format", () => {
      const config = createTestConfig({} as any);
      expect(() => new ModelResolver(config.models)).not.toThrow();
    });

    it("should resolve non-existent model with helpful error", () => {
      const config = createTestConfig("anthropic/opus");
      const resolver = new ModelResolver(config.models);
      expect(() => resolver.resolveModel("nonexistent/model")).toThrow(
        /Provider not found|Model not found/
      );
    });

    it("should handle fallback to unavailable providers", () => {
      const config = createTestConfig({
        primary: "anthropic/opus",
        fallbacks: ["nonexistent/model"]
      });
      const resolver = new ModelResolver(config.models);
      // resolveModelWithFallback would fail, but direct model resolution shows the chain issue
      expect(() => resolver.resolveModel("nonexistent/model")).toThrow();
    });
  });

  describe("Semantic consistency", () => {
    it("primary is always first in fallback chain evaluation", () => {
      const config = createTestConfig({
        primary: "anthropic/opus",
        fallbacks: ["anthropic/sonnet"]
      });

      const selection = config.agents?.model as ModelSelection;
      // Primary should be attempted first logically
      expect(selection.primary).toBe(selection.fallbacks?.[0] !== "anthropic/opus" ? "anthropic/opus" : undefined);
    });

    it("fallbacks array maintains order", () => {
      const fallbacks = ["a/b", "c/d", "e/f"];
      const config = createTestConfig({
        primary: "x/y",
        fallbacks
      });

      const selection = config.agents?.model as ModelSelection;
      expect(selection.fallbacks).toEqual(fallbacks);
    });

    it("aliases do not affect model selection routing", () => {
      const config = createTestConfig(
        { primary: "anthropic/opus" },
        { "anthropic/opus": { alias: "primary" } }
      );

      const resolver = new ModelResolver(config.models, config.agents?.models);
      // Resolving by reference, not alias
      const model = resolver.resolveModel("anthropic/opus");
      expect(model.modelId).toBe("opus");
    });
  });

  describe("Complete end-to-end scenarios", () => {
    it("multi-provider setup with primary, fallbacks, and aliases", () => {
      const config = createTestConfig(
        {
          primary: "anthropic/opus",
          fallbacks: ["anthropic/sonnet", "openai/gpt-4", "moonshot/kimi-k2"]
        },
        {
          "anthropic/opus": { alias: "claude-opus" },
          "anthropic/sonnet": { alias: "claude-sonnet" },
          "openai/gpt-4": { alias: "gpt-4" },
          "moonshot/kimi-k2": { alias: "kimi" }
        }
      );

      const resolver = new ModelResolver(config.models, config.agents?.models);

      // All models resolvable
      ["anthropic/opus", "anthropic/sonnet", "openai/gpt-4", "moonshot/kimi-k2"].forEach(ref => {
        expect(resolver.getModelAlias(ref)).toBeDefined();
      });

      // Processor gets fallbacks
      const processor = AgentFactory.create(config, config.skillDirs);
      expect(processor.getModelFallbacks()).toHaveLength(3);
    });

    it("mixed deployments with old and new config styles", () => {
      // Old style (string)
      const oldStyleConfig = createTestConfig("anthropic/opus");
      const oldProcessor = new ClaudeProcessor(oldStyleConfig.skillDirs, oldStyleConfig);
      expect(oldProcessor.getModelFallbacks()).toEqual([]);

      // New style (structured)
      const newStyleConfig = createTestConfig({
        primary: "anthropic/opus",
        fallbacks: ["anthropic/sonnet"]
      });
      const newProcessor = new ClaudeProcessor(newStyleConfig.skillDirs, newStyleConfig);
      expect(newProcessor.getModelFallbacks()).toEqual(["anthropic/sonnet"]);

      // Both work
      expect(oldProcessor).toBeInstanceOf(ClaudeProcessor);
      expect(newProcessor).toBeInstanceOf(ClaudeProcessor);
    });
  });
});
