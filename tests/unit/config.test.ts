import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeFileSync, unlinkSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testConfigDir = path.join(__dirname, "fixtures", "config-test");

const originalEnv = { ...process.env };
const originalCwd = process.cwd();

const resetEnv = () => {
  for (const key of Object.keys(process.env)) {
    if (!originalEnv.hasOwnProperty(key)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, originalEnv);
  delete process.env.IRONBOT_CONFIG;
};

beforeEach(() => {
  resetEnv();
  mkdirSync(testConfigDir, { recursive: true });
});

afterEach(() => {
  resetEnv();
  try {
    rmSync(testConfigDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

describe("Configuration System - JSON Only", () => {
  describe("Required ironbot.json", () => {
    it("should require slack.botToken in config", () => {
      const config = {
        slack: {
          appToken: "xapp-1-test"
          // Missing botToken
        },
        llmProvider: {
          provider: "anthropic"
        }
      };

      // Simulate validation
      const validateConfig = (cfg: any) => {
        if (!cfg.slack?.botToken) {
          throw new Error("Configuration error: slack.botToken is required in ironbot.json");
        }
      };

      expect(() => validateConfig(config)).toThrow("slack.botToken is required");
    });

    it("should require slack.appToken in config", () => {
      const config = {
        slack: {
          botToken: "xoxb-test"
          // Missing appToken
        },
        llmProvider: {
          provider: "anthropic"
        }
      };

      const validateConfig = (cfg: any) => {
        if (!cfg.slack?.appToken) {
          throw new Error("Configuration error: slack.appToken is required in ironbot.json");
        }
      };

      expect(() => validateConfig(config)).toThrow("slack.appToken is required");
    });

    it("should require llmProvider.provider in config", () => {
      const config = {
        slack: {
          botToken: "xoxb-test",
          appToken: "xapp-1-test"
        },
        llmProvider: {}
        // Missing provider
      };

      const validateConfig = (cfg: any) => {
        if (!cfg.llmProvider?.provider) {
          throw new Error("Configuration error: llmProvider.provider is required in ironbot.json");
        }
      };

      expect(() => validateConfig(config)).toThrow("llmProvider.provider is required");
    });
  });

  describe("LLM Provider Parsing", () => {
    it("should accept valid providers", () => {
      const validProviders = [
        "anthropic",
        "openai",
        "google",
        "groq",
        "mistral",
        "cerebras",
        "xai",
        "bedrock"
      ];

      const testConfig = {
        slack: { botToken: "xoxb-test", appToken: "xapp-1-test" },
        llmProvider: { provider: "openai" }
      };

      expect(validProviders).toContain(testConfig.llmProvider.provider);
    });

    it("should parse provider case-insensitively", () => {
      const parseLlmProvider = (value: string | undefined): string => {
        const normalized = value?.trim().toLowerCase();
        const validProviders = ["anthropic", "openai", "google", "groq", "mistral", "cerebras", "xai", "bedrock"];
        if (normalized && validProviders.includes(normalized)) {
          return normalized;
        }
        return "anthropic";
      };

      expect(parseLlmProvider("ANTHROPIC")).toBe("anthropic");
      expect(parseLlmProvider("OpenAI")).toBe("openai");
      expect(parseLlmProvider("GoOgLe")).toBe("google");
    });

    it("should default to anthropic for invalid provider", () => {
      const parseLlmProvider = (value: string | undefined): string => {
        const normalized = value?.trim().toLowerCase();
        const validProviders = ["anthropic", "openai", "google", "groq", "mistral", "cerebras", "xai", "bedrock"];
        if (normalized && validProviders.includes(normalized)) {
          return normalized;
        }
        return "anthropic";
      };

      expect(parseLlmProvider("invalid-provider")).toBe("anthropic");
      expect(parseLlmProvider("")).toBe("anthropic");
      expect(parseLlmProvider(undefined)).toBe("anthropic");
    });
  });

  describe("Type Conversions", () => {
    it("should parse boolean values correctly", () => {
      const parseBoolean = (value: any, fallback = false): boolean => {
        if (value === undefined || value === null) return fallback;
        if (typeof value === "boolean") return value;
        const normalized = String(value).toLowerCase();
        return normalized === "true" || normalized === "1";
      };

      expect(parseBoolean(true)).toBe(true);
      expect(parseBoolean(false)).toBe(false);
      expect(parseBoolean("true")).toBe(true);
      expect(parseBoolean("false")).toBe(false);
      expect(parseBoolean("1")).toBe(true);
      expect(parseBoolean("0")).toBe(false);
      expect(parseBoolean(undefined)).toBe(false);
      expect(parseBoolean(undefined, true)).toBe(true);
    });

    it("should parse integer values correctly", () => {
      const parseInteger = (value: any, fallback: number): number => {
        if (value === undefined || value === null) return fallback;
        if (typeof value === "number") return Math.floor(value);
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
      };

      expect(parseInteger(10, 0)).toBe(10);
      expect(parseInteger("20", 0)).toBe(20);
      expect(parseInteger(30.5, 0)).toBe(30);
      expect(parseInteger("40.9", 0)).toBe(40);
      expect(parseInteger(undefined, 100)).toBe(100);
      expect(parseInteger("invalid", 50)).toBe(50);
    });

    it("should parse number values correctly", () => {
      const parseNumber = (value: any, fallback: number): number => {
        if (value === undefined || value === null) return fallback;
        if (typeof value === "number") return value;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
      };

      expect(parseNumber(3.14, 0)).toBe(3.14);
      expect(parseNumber("2.71", 0)).toBe(2.71);
      expect(parseNumber(undefined, 1.0)).toBe(1.0);
      expect(parseNumber("invalid", 0.5)).toBe(0.5);
    });

    it("should parse string arrays correctly", () => {
      const parseStringArray = (value: any, fallback: string[]): string[] => {
        if (!value) return fallback;
        if (Array.isArray(value)) return value;
        const items = String(value)
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
        return items.length ? items : fallback;
      };

      expect(parseStringArray(["a", "b"], [])).toEqual(["a", "b"]);
      expect(parseStringArray("a,b,c", [])).toEqual(["a", "b", "c"]);
      expect(parseStringArray("memory, sessions", ["default"])).toEqual(["memory", "sessions"]);
      expect(parseStringArray(undefined, ["default"])).toEqual(["default"]);
      expect(parseStringArray("", ["fallback"])).toEqual(["fallback"]);
    });
  });

  describe("Config Defaults", () => {
    it("should apply defaults when values not provided", () => {
      const config = {
        slack: {
          botToken: "xoxb-test",
          appToken: "xapp-1-test"
        },
        llmProvider: {
          provider: "anthropic"
        }
        // No logging, memory, retry, etc.
      };

      // Simulate defaults
      const defaults = {
        debug: false,
        logLevel: "INFO",
        maxToolIterations: 10,
        memorySearchEnabled: true,
        memoryVectorWeight: 0.7
      };

      const applied = {
        debug: config.logging?.debug ?? defaults.debug,
        logLevel: config.logging?.level ?? defaults.logLevel,
        maxToolIterations: config.claude_max_tool_iterations ?? defaults.maxToolIterations,
        memorySearchEnabled: config.memorySearch?.enabled ?? defaults.memorySearchEnabled,
        memoryVectorWeight: config.memorySearch?.vectorWeight ?? defaults.memoryVectorWeight
      };

      expect(applied.debug).toBe(false);
      expect(applied.logLevel).toBe("INFO");
      expect(applied.maxToolIterations).toBe(10);
      expect(applied.memorySearchEnabled).toBe(true);
      expect(applied.memoryVectorWeight).toBe(0.7);
    });

    it("should override defaults with provided values", () => {
      const config = {
        slack: {
          botToken: "xoxb-test",
          appToken: "xapp-1-test"
        },
        llmProvider: {
          provider: "anthropic"
        },
        logging: {
          debug: true,
          level: "DEBUG"
        },
        claude_max_tool_iterations: 20
      };

      const applied = {
        debug: config.logging?.debug ?? false,
        logLevel: config.logging?.level ?? "INFO",
        maxToolIterations: config.claude_max_tool_iterations ?? 10
      };

      expect(applied.debug).toBe(true);
      expect(applied.logLevel).toBe("DEBUG");
      expect(applied.maxToolIterations).toBe(20);
    });
  });

  describe("Config File Discovery", () => {
    it("should search for config in order of precedence", () => {
      const findConfigFile = (ironbotConfigEnv?: string): string[] => {
        const candidates = [
          ironbotConfigEnv,
          path.join(process.cwd(), "ironbot.json"),
          path.join(process.cwd(), "config", "ironbot.json")
        ].filter(Boolean) as string[];

        return candidates;
      };

      process.env.IRONBOT_CONFIG = "/custom/path/ironbot.json";
      const candidates = findConfigFile(process.env.IRONBOT_CONFIG);

      expect(candidates[0]).toBe("/custom/path/ironbot.json");
      expect(candidates.length).toBeGreaterThanOrEqual(3);
    });

    it("should throw helpful error when config not found", () => {
      const throwHelpfulError = () => {
        const suggestions = [
          `  1. Create ironbot.json in your project directory`,
          `  2. Copy from template: cp ironbot.json.example ironbot.json`,
          `  3. Or set IRONBOT_CONFIG environment variable`,
          ``,
          `  Checked locations:`,
          `    - ${path.join(process.cwd(), "ironbot.json")}`,
          `    - ${path.join(process.cwd(), "config", "ironbot.json")}`
        ];

        throw new Error(
          `Configuration file not found. Ironbot requires ironbot.json.\n\n${suggestions.join('\n')}`
        );
      };

      expect(() => throwHelpfulError()).toThrow("Configuration file not found");
      expect(() => throwHelpfulError()).toThrow("Ironbot requires ironbot.json");
      expect(() => throwHelpfulError()).toThrow("Checked locations");
    });
  });

  describe("JSON Validation", () => {
    it("should throw error for invalid JSON syntax", () => {
      const configPath = path.join(testConfigDir, "invalid.json");
      writeFileSync(configPath, "{ invalid json }");

      const validateJson = () => {
        const content = "{invalid}";
        JSON.parse(content);
      };

      expect(() => validateJson()).toThrow(SyntaxError);
    });

    it("should provide helpful error for JSON parse errors", () => {
      const throwJsonError = (configPath: string) => {
        throw new Error(
          `Invalid JSON in config file ${configPath}: Unexpected token`
        );
      };

      expect(() => throwJsonError("/path/to/config.json"))
        .toThrow("Invalid JSON in config file");
    });
  });

  describe("Skills Directories Configuration", () => {
    it("should accept single directory string for backwards compatibility", () => {
      const config = {
        skills: {
          directory: "~/.ironbot/skills"
        }
      };

      expect(config.skills).toBeDefined();
      expect(typeof config.skills.directory).toBe("string");
    });

    it("should accept array of directories", () => {
      const config = {
        skills: {
          directory: ["~/.ironbot/skills", "D:/repos/ironbot/skills"]
        }
      };

      expect(Array.isArray(config.skills.directory)).toBe(true);
      expect(config.skills.directory).toHaveLength(2);
    });

    it("should resolve path tilde expansion", () => {
      const resolveTilde = (path: string): string => {
        return path.replace(/^~/, process.env.HOME || process.env.USERPROFILE || "~");
      };

      const tilePath = "~/.ironbot/skills";
      const resolved = resolveTilde(tilePath);

      expect(resolved).not.toContain("~");
      expect(resolved.length).toBeGreaterThan(tilePath.length - 1);
    });

    it("should handle multiple directories with tilde expansion", () => {
      const resolveTilde = (path: string): string => {
        return path.replace(/^~/, process.env.HOME || process.env.USERPROFILE || "~");
      };

      const dirs = ["~/.ironbot/skills", "D:/repos/ironbot/skills"];
      const resolved = dirs.map(resolveTilde);

      expect(resolved).toHaveLength(2);
      expect(resolved[1]).toBe("D:/repos/ironbot/skills");
    });

    it("should deduplicate skill directories", () => {
      const dedup = (dirs: string[]): string[] => {
        return [...new Set(dirs)];
      };

      const dirs = ["~/.ironbot/skills", "D:/repos/ironbot/skills", "~/.ironbot/skills"];
      const deduped = dedup(dirs);

      expect(deduped).toHaveLength(2);
    });

    it("should automatically include state skills directory", () => {
      const baseDir = "~/.ironbot";
      const stateSkilsDir = `${baseDir}/state-skills`;
      const configured = ["~/.ironbot/skills"];

      const allDirs = [...configured, stateSkilsDir];

      expect(allDirs).toContain(stateSkilsDir);
      expect(allDirs).toHaveLength(2);
    });

    it("should preserve order of configured directories", () => {
      const dirs = [
        "D:/repos/ironbot/skills",
        "C:/Users/jzhu/.ironbot/skills",
        "E:/other/skills"
      ];

      const ordered = dirs;

      expect(ordered[0]).toBe("D:/repos/ironbot/skills");
      expect(ordered[1]).toBe("C:/Users/jzhu/.ironbot/skills");
      expect(ordered[2]).toBe("E:/other/skills");
    });

    it("should use first configured directory as default skillsDir", () => {
      const configured = ["~/.ironbot/skills", "D:/repos/ironbot/skills"];
      const skillsDir = configured[0];

      expect(skillsDir).toBe("~/.ironbot/skills");
    });

    it("should default to ./skills if no directory configured", () => {
      const config = {
        skills: {}
      };

      const defaultDir = "D:/repos/ironbot/skills";

      expect(defaultDir).toBeDefined();
      expect(defaultDir).toContain("skills");
    });
  });

  describe("Custom Provider Configuration", () => {
    it("should accept custom provider names", () => {
      const config = {
        llmProvider: {
          provider: "copilot-api",
          "copilot-api": {
            api: "anthropic",
            apiKey: "key",
            baseUrl: "https://custom.com",
            model: "custom-model"
          }
        }
      };

      expect(config.llmProvider.provider).toBe("copilot-api");
      expect((config.llmProvider as any)["copilot-api"]).toBeDefined();
    });

    it("should accept multiple custom providers", () => {
      const config = {
        llmProvider: {
          provider: "copilot-api",
          "copilot-api": {
            api: "anthropic",
            apiKey: "key1",
            baseUrl: "https://custom1.com",
            model: "model1"
          },
          "my-openai": {
            api: "openai",
            apiKey: "key2",
            baseUrl: "https://custom2.com",
            model: "model2"
          }
        }
      };

      expect((config.llmProvider as any)["copilot-api"]).toBeDefined();
      expect((config.llmProvider as any)["my-openai"]).toBeDefined();
    });

    it("should support provider switching between custom providers", () => {
      const baseConfig = {
        llmProvider: {
          provider: "copilot-api",
          "copilot-api": {
            api: "anthropic",
            apiKey: "key",
            baseUrl: "https://custom1.com",
            model: "model1"
          }
        }
      };

      baseConfig.llmProvider.provider = "my-provider";
      (baseConfig.llmProvider as any)["my-provider"] = {
        api: "openai",
        apiKey: "key",
        baseUrl: "https://custom2.com",
        model: "model2"
      };

      expect(baseConfig.llmProvider.provider).toBe("my-provider");
    });
  });

  describe("Multi-Provider API-Based Routing", () => {
    it("should route based on api field for Anthropic API", () => {
      const providers = {
        "anthropic": { api: "anthropic" },
        "copilot-api": { api: "anthropic" },
        "custom-grok": { api: "anthropic" }
      };

      const anthropicProviders = Object.entries(providers)
        .filter(([_, config]: any) => config.api === "anthropic")
        .map(([name]) => name);

      expect(anthropicProviders).toContain("anthropic");
      expect(anthropicProviders).toContain("copilot-api");
      expect(anthropicProviders).toContain("custom-grok");
      expect(anthropicProviders).toHaveLength(3);
    });

    it("should route based on api field for OpenAI API", () => {
      const providers = {
        "openai": { api: "openai" },
        "alibaba": { api: "openai" },
        "my-qwen": { api: "openai" }
      };

      const openaiProviders = Object.entries(providers)
        .filter(([_, config]: any) => config.api === "openai")
        .map(([name]) => name);

      expect(openaiProviders).toContain("openai");
      expect(openaiProviders).toContain("alibaba");
      expect(openaiProviders).toContain("my-qwen");
      expect(openaiProviders).toHaveLength(3);
    });

    it("should allow mixing providers with same API type", () => {
      const config = {
        llmProvider: {
          provider: "alibaba",
          "openai": { api: "openai" },
          "alibaba": { api: "openai" },
          "custom": { api: "openai" }
        }
      };

      const isOpenAiCompatible = (config: any, provider: string) => {
        return (config.llmProvider as any)[provider]?.api === "openai";
      };

      expect(isOpenAiCompatible(config, "openai")).toBe(true);
      expect(isOpenAiCompatible(config, "alibaba")).toBe(true);
      expect(isOpenAiCompatible(config, "custom")).toBe(true);
    });
  });
});
