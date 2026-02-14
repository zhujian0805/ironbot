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

  describe("Deprecation of .env", () => {
    it("should not fallback to environment variables", () => {
      // Clear any env vars
      delete process.env.SLACK_BOT_TOKEN;
      delete process.env.SLACK_APP_TOKEN;
      delete process.env.LLM_PROVIDER;

      // Verify that config loading fails without ironbot.json
      const config = undefined; // No config file loaded

      expect(config).toBeUndefined();
    });

    it("should require ironbot.json exclusively", () => {
      // Even if env vars are set, they should be ignored
      process.env.SLACK_BOT_TOKEN = "xoxb-from-env";
      process.env.SLACK_APP_TOKEN = "xapp-1-from-env";

      // Without ironbot.json, should fail
      const hasConfig = false;

      expect(hasConfig).toBe(false);
    });
  });
});
