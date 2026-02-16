import { describe, it, expect, beforeEach } from "vitest";
import { ClaudeProcessor } from "../../../src/services/claude_processor.ts";
import { PiAgentProcessor } from "../../../src/services/pi_agent_processor.ts";
import { ModelResolver } from "../../../src/services/model_resolver.ts";
import { resolveConfig, type AppConfig, type ModelSelection } from "../../../src/config.ts";

describe("Model Selection Configuration", () => {
  const createConfigWithModelSelection = (model?: string | ModelSelection, modelAliases?: Record<string, { alias?: string }>): AppConfig => {
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
              { id: "sonnet", name: "Claude Sonnet" }
            ]
          },
          openai: {
            api: "openai",
            apiKey: "test-key",
            baseUrl: "https://api.openai.com/v1",
            models: [
              { id: "gpt-4", name: "GPT-4" },
              { id: "gpt-3.5", name: "GPT-3.5" }
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

  describe("Primary model selection", () => {
    it("should support string model reference (backward compatibility)", () => {
      const config = createConfigWithModelSelection("anthropic/opus");
      expect(config.agents?.model).toBe("anthropic/opus");
    });

    it("should support primary-only ModelSelection structure", () => {
      const config = createConfigWithModelSelection({ primary: "anthropic/opus" });
      const model = config.agents?.model as ModelSelection;
      expect(model.primary).toBe("anthropic/opus");
      expect(model.fallbacks).toBeUndefined();
    });

    it("should support ModelSelection with empty fallbacks array", () => {
      const config = createConfigWithModelSelection({
        primary: "anthropic/opus",
        fallbacks: []
      });
      const model = config.agents?.model as ModelSelection;
      expect(model.primary).toBe("anthropic/opus");
      expect(model.fallbacks).toEqual([]);
    });
  });

  describe("Fallback model selection", () => {
    it("should support multiple fallbacks in ModelSelection", () => {
      const fallbacks = ["anthropic/sonnet", "openai/gpt-4"];
      const config = createConfigWithModelSelection({
        primary: "anthropic/opus",
        fallbacks
      });
      const model = config.agents?.model as ModelSelection;
      expect(model.fallbacks).toEqual(fallbacks);
    });

    it("should support fallbacks from different providers", () => {
      const config = createConfigWithModelSelection({
        primary: "anthropic/opus",
        fallbacks: [
          "anthropic/sonnet",
          "openai/gpt-4",
          "openai/gpt-3.5"
        ]
      });
      const model = config.agents?.model as ModelSelection;
      expect(model.fallbacks).toHaveLength(3);
    });

    it("should allow fallback same as primary (no deduplication enforced)", () => {
      const config = createConfigWithModelSelection({
        primary: "anthropic/opus",
        fallbacks: ["anthropic/opus"]
      });
      const model = config.agents?.model as ModelSelection;
      expect(model.fallbacks).toContain("anthropic/opus");
    });
  });

  describe("Model alias configuration", () => {
    it("should support model aliases", () => {
      const aliases = {
        "anthropic/opus": { alias: "claude-opus" },
        "openai/gpt-4": { alias: "gpt4" }
      };
      const config = createConfigWithModelSelection("anthropic/opus", aliases);
      expect(config.agents?.models).toEqual(aliases);
    });

    it("should support empty metadata (no alias)", () => {
      const aliases = {
        "anthropic/opus": {},
        "openai/gpt-4": { alias: "gpt4" }
      };
      const config = createConfigWithModelSelection("anthropic/opus", aliases);
      expect(config.agents?.models?.["anthropic/opus"]).toEqual({});
      expect(config.agents?.models?.["openai/gpt-4"]?.alias).toBe("gpt4");
    });

    it("should allow aliases for non-primary/fallback models", () => {
      const aliases = {
        "anthropic/opus": { alias: "primary" },
        "anthropic/sonnet": { alias: "fallback" },
        "openai/gpt-4": { alias: "other" }
      };
      const config = createConfigWithModelSelection(
        { primary: "anthropic/opus", fallbacks: ["anthropic/sonnet"] },
        aliases
      );
      expect(config.agents?.models?.["openai/gpt-4"]?.alias).toBe("other");
    });
  });

  describe("ModelResolver alias integration", () => {
    it("should resolve aliases from config", () => {
      const modelsConfig = {
        providers: {
          anthropic: {
            api: "anthropic",
            models: [{ id: "opus", name: "Claude Opus" }]
          }
        }
      };
      const aliases = { "anthropic/opus": { alias: "claude" } };
      const resolver = new ModelResolver(modelsConfig, aliases);

      expect(resolver.getModelAlias("anthropic/opus")).toBe("claude");
    });

    it("should return undefined for models without aliases", () => {
      const modelsConfig = {
        providers: {
          anthropic: {
            api: "anthropic",
            models: [{ id: "opus", name: "Claude Opus" }]
          }
        }
      };
      const resolver = new ModelResolver(modelsConfig);
      expect(resolver.getModelAlias("anthropic/opus")).toBeUndefined();
    });

    it("should list models with aliases", () => {
      const modelsConfig = {
        providers: {
          anthropic: {
            api: "anthropic",
            models: [
              { id: "opus", name: "Claude Opus" },
              { id: "sonnet", name: "Claude Sonnet" }
            ]
          }
        }
      };
      const aliases = { "anthropic/opus": { alias: "claude" } };
      const resolver = new ModelResolver(modelsConfig, aliases);

      const list = resolver.listModelsWithAliases();
      expect(list).toEqual([
        { ref: "anthropic/opus", alias: "claude" },
        { ref: "anthropic/sonnet", alias: undefined }
      ]);
    });
  });

  describe("Processor fallback exposure", () => {
    it("ClaudeProcessor should expose fallbacks from ModelSelection", () => {
      const config = createConfigWithModelSelection({
        primary: "anthropic/opus",
        fallbacks: ["anthropic/sonnet", "openai/gpt-4"]
      });
      const processor = new ClaudeProcessor(config.skillDirs, config);
      const fallbacks = processor.getModelFallbacks();
      expect(fallbacks).toEqual(["anthropic/sonnet", "openai/gpt-4"]);
    });

    it("ClaudeProcessor should return empty array when no fallbacks configured", () => {
      const config = createConfigWithModelSelection("anthropic/opus");
      const processor = new ClaudeProcessor(config.skillDirs, config);
      expect(processor.getModelFallbacks()).toEqual([]);
    });

    it("PiAgentProcessor should expose fallbacks from ModelSelection", () => {
      const config = createConfigWithModelSelection({
        primary: "openai/gpt-4",
        fallbacks: ["openai/gpt-3.5", "anthropic/opus"]
      });
      const processor = new PiAgentProcessor(config.skillDirs, config);
      const fallbacks = processor.getModelFallbacks();
      expect(fallbacks).toEqual(["openai/gpt-3.5", "anthropic/opus"]);
    });

    it("Processors with string model reference should have empty fallbacks", () => {
      const claudeConfig = createConfigWithModelSelection("anthropic/opus");
      const piConfig = createConfigWithModelSelection("openai/gpt-4");

      const claudeProcessor = new ClaudeProcessor(claudeConfig.skillDirs, claudeConfig);
      const piProcessor = new PiAgentProcessor(piConfig.skillDirs, piConfig);

      expect(claudeProcessor.getModelFallbacks()).toEqual([]);
      expect(piProcessor.getModelFallbacks()).toEqual([]);
    });
  });

  describe("Mixed primary/fallbacks with aliases", () => {
    it("should support complete setup with primary, fallbacks, and aliases", () => {
      const config = createConfigWithModelSelection(
        {
          primary: "anthropic/opus",
          fallbacks: ["anthropic/sonnet", "openai/gpt-4"]
        },
        {
          "anthropic/opus": { alias: "claude-opus" },
          "anthropic/sonnet": { alias: "claude-sonnet" },
          "openai/gpt-4": { alias: "gpt4" }
        }
      );

      const model = config.agents?.model as ModelSelection;
      expect(model.primary).toBe("anthropic/opus");
      expect(model.fallbacks).toEqual(["anthropic/sonnet", "openai/gpt-4"]);
      expect(config.agents?.models?.["anthropic/opus"]?.alias).toBe("claude-opus");
      expect(config.agents?.models?.["openai/gpt-4"]?.alias).toBe("gpt4");
    });

    it("should work with ModelResolver for complete alias+fallback chain", () => {
      const modelsConfig = {
        providers: {
          anthropic: {
            api: "anthropic",
            models: [
              { id: "opus", name: "Claude Opus" },
              { id: "sonnet", name: "Claude Sonnet" }
            ]
          },
          openai: {
            api: "openai",
            models: [{ id: "gpt-4", name: "GPT-4" }]
          }
        }
      };

      const aliases = {
        "anthropic/opus": { alias: "primary" },
        "anthropic/sonnet": { alias: "fallback1" },
        "openai/gpt-4": { alias: "fallback2" }
      };

      const resolver = new ModelResolver(modelsConfig, aliases);

      // Can resolve primary with alias
      const primary = resolver.getModelWithAlias("anthropic/opus");
      expect(primary.ref).toBe("anthropic/opus");
      expect(primary.alias).toBe("primary");

      // Can list all models with aliases
      const allModels = resolver.listModelsWithAliases();
      expect(allModels.some(m => m.ref === "anthropic/opus" && m.alias === "primary")).toBe(true);
    });
  });
});
