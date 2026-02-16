import { describe, it, expect } from "vitest";
import {
  ConfigValidationError,
  validateModelsConfig,
  validateAgentConfig
} from "../../../src/services/config_validator";

describe("ConfigValidator", () => {
  describe("validateModelsConfig", () => {
    it("should pass validation for valid models config", () => {
      const config = {
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

      expect(() => validateModelsConfig(config)).not.toThrow();
    });

    it("should pass validation for undefined models config", () => {
      expect(() => validateModelsConfig(undefined as any)).not.toThrow();
    });

    it("should pass validation for empty providers", () => {
      const config = {
        providers: {}
      };

      expect(() => validateModelsConfig(config)).not.toThrow();
    });

    it("should throw error for empty provider ID", () => {
      const config = {
        providers: {
          "": {
            api: "anthropic",
            models: []
          }
        }
      };

      expect(() => validateModelsConfig(config)).toThrow(ConfigValidationError);
      expect(() => validateModelsConfig(config)).toThrow("Provider ID cannot be empty");
    });

    it("should throw error when provider missing models array", () => {
      const config = {
        providers: {
          anthropic: {
            api: "anthropic"
            // Missing models array
          }
        }
      };

      expect(() => validateModelsConfig(config as any)).toThrow(ConfigValidationError);
      expect(() => validateModelsConfig(config as any)).toThrow('must have a "models" array');
    });

    it("should throw error for model with empty id", () => {
      const config = {
        providers: {
          anthropic: {
            api: "anthropic",
            models: [
              { id: "", name: "Claude" }
            ]
          }
        }
      };

      expect(() => validateModelsConfig(config)).toThrow(ConfigValidationError);
      expect(() => validateModelsConfig(config)).toThrow('must have a non-empty "id"');
    });

    it("should throw error for model with empty name", () => {
      const config = {
        providers: {
          anthropic: {
            api: "anthropic",
            models: [
              { id: "opus", name: "" }
            ]
          }
        }
      };

      expect(() => validateModelsConfig(config)).toThrow(ConfigValidationError);
      expect(() => validateModelsConfig(config)).toThrow('must have a non-empty "name"');
    });

    it("should throw error for duplicate model IDs within provider", () => {
      const config = {
        providers: {
          anthropic: {
            api: "anthropic",
            models: [
              { id: "opus", name: "Claude Opus" },
              { id: "opus", name: "Another Opus" }
            ]
          }
        }
      };

      expect(() => validateModelsConfig(config)).toThrow(ConfigValidationError);
      expect(() => validateModelsConfig(config)).toThrow("Duplicate model ID");
    });

    it("should allow duplicate model IDs across different providers", () => {
      const config = {
        providers: {
          anthropic: {
            api: "anthropic",
            models: [
              { id: "base", name: "Claude" }
            ]
          },
          openai: {
            api: "openai",
            models: [
              { id: "base", name: "GPT-4" }
            ]
          }
        }
      };

      expect(() => validateModelsConfig(config)).not.toThrow();
    });

    it("should validate cost.input as number", () => {
      const config = {
        providers: {
          anthropic: {
            api: "anthropic",
            models: [
              {
                id: "opus",
                name: "Claude Opus",
                cost: { input: "not a number" }
              }
            ]
          }
        }
      };

      expect(() => validateModelsConfig(config as any)).toThrow(ConfigValidationError);
      expect(() => validateModelsConfig(config as any)).toThrow("cost.input must be a number");
    });

    it("should validate cost.output as number", () => {
      const config = {
        providers: {
          anthropic: {
            api: "anthropic",
            models: [
              {
                id: "opus",
                name: "Claude Opus",
                cost: { output: "invalid" }
              }
            ]
          }
        }
      };

      expect(() => validateModelsConfig(config as any)).toThrow(ConfigValidationError);
      expect(() => validateModelsConfig(config as any)).toThrow("cost.output must be a number");
    });

    it("should validate cost.cacheRead as number", () => {
      const config = {
        providers: {
          anthropic: {
            api: "anthropic",
            models: [
              {
                id: "opus",
                name: "Claude Opus",
                cost: { cacheRead: "invalid" }
              }
            ]
          }
        }
      };

      expect(() => validateModelsConfig(config as any)).toThrow(ConfigValidationError);
      expect(() => validateModelsConfig(config as any)).toThrow("cost.cacheRead must be a number");
    });

    it("should validate cost.cacheWrite as number", () => {
      const config = {
        providers: {
          anthropic: {
            api: "anthropic",
            models: [
              {
                id: "opus",
                name: "Claude Opus",
                cost: { cacheWrite: "invalid" }
              }
            ]
          }
        }
      };

      expect(() => validateModelsConfig(config as any)).toThrow(ConfigValidationError);
      expect(() => validateModelsConfig(config as any)).toThrow("cost.cacheWrite must be a number");
    });

    it("should allow valid cost model", () => {
      const config = {
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

      expect(() => validateModelsConfig(config)).not.toThrow();
    });

    it("should throw error for invalid api type", () => {
      const config = {
        providers: {
          custom: {
            api: "invalid-api",
            models: [
              { id: "model1", name: "Model 1" }
            ]
          }
        }
      };

      expect(() => validateModelsConfig(config as any)).toThrow(ConfigValidationError);
      expect(() => validateModelsConfig(config as any)).toThrow(
        'api type must be "anthropic" or "openai"'
      );
    });

    it("should allow anthropic api type", () => {
      const config = {
        providers: {
          anthropic: {
            api: "anthropic",
            models: [
              { id: "opus", name: "Claude Opus" }
            ]
          }
        }
      };

      expect(() => validateModelsConfig(config)).not.toThrow();
    });

    it("should allow openai api type", () => {
      const config = {
        providers: {
          openai: {
            api: "openai",
            models: [
              { id: "gpt4", name: "GPT-4" }
            ]
          }
        }
      };

      expect(() => validateModelsConfig(config)).not.toThrow();
    });

    it("should allow missing api type", () => {
      const config = {
        providers: {
          custom: {
            models: [
              { id: "model1", name: "Model 1" }
            ]
          }
        }
      };

      expect(() => validateModelsConfig(config as any)).not.toThrow();
    });
  });

  describe("validateAgentConfig", () => {
    it("should pass validation for undefined agent config", () => {
      expect(() => validateAgentConfig(undefined)).not.toThrow();
    });

    it("should pass validation for empty agent config", () => {
      expect(() => validateAgentConfig({})).not.toThrow();
    });

    it("should throw error for invalid compactionMode", () => {
      const config = {
        compactionMode: "invalid"
      };

      expect(() => validateAgentConfig(config)).toThrow(ConfigValidationError);
      expect(() => validateAgentConfig(config)).toThrow("Invalid compactionMode");
    });

    it("should allow valid compactionMode values", () => {
      for (const mode of ["safeguard", "moderate", "aggressive"]) {
        expect(() => validateAgentConfig({ compactionMode: mode })).not.toThrow();
      }
    });

    it("should throw error for non-numeric maxConcurrent", () => {
      const config = {
        subagents: {
          maxConcurrent: "not a number"
        }
      };

      expect(() => validateAgentConfig(config)).toThrow(ConfigValidationError);
      expect(() => validateAgentConfig(config)).toThrow("must be a positive number");
    });

    it("should throw error for zero maxConcurrent", () => {
      const config = {
        subagents: {
          maxConcurrent: 0
        }
      };

      expect(() => validateAgentConfig(config)).toThrow(ConfigValidationError);
      expect(() => validateAgentConfig(config)).toThrow("must be a positive number");
    });

    it("should throw error for negative maxConcurrent", () => {
      const config = {
        subagents: {
          maxConcurrent: -5
        }
      };

      expect(() => validateAgentConfig(config)).toThrow(ConfigValidationError);
      expect(() => validateAgentConfig(config)).toThrow("must be a positive number");
    });

    it("should allow valid maxConcurrent", () => {
      const config = {
        subagents: {
          maxConcurrent: 5
        }
      };

      expect(() => validateAgentConfig(config)).not.toThrow();
    });

    it("should allow all valid configuration combinations", () => {
      const config = {
        compactionMode: "moderate",
        subagents: {
          maxConcurrent: 10
        }
      };

      expect(() => validateAgentConfig(config)).not.toThrow();
    });
  });
});
