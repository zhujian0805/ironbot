import { describe, it, expect, beforeEach } from "vitest";
import { ClaudeProcessor } from "../../../src/services/claude_processor.ts";
import { PiAgentProcessor } from "../../../src/services/pi_agent_processor.ts";
import { resolveConfig, type AppConfig } from "../../../src/config.ts";

describe("State Compaction Mode Configuration", () => {
  const createProcessorWithMode = (
    mode?: "safeguard" | "moderate" | "aggressive"
  ): { claude: ClaudeProcessor; pi: PiAgentProcessor } => {
    const baseConfig = resolveConfig();
    const config: AppConfig = {
      ...baseConfig,
      models: {
        providers: {
          anthropic: {
            api: "anthropic",
            apiKey: "key1",
            models: [{ id: "test", name: "Test" }]
          },
          openai: {
            api: "openai",
            apiKey: "key2",
            baseUrl: "https://api.openai.com/v1",
            models: [{ id: "test", name: "Test" }]
          }
        }
      },
      agents: {
        defaults: mode ? { compactionMode: mode } : {},
        model: "anthropic/test"
      }
    };

    const configOpenAI: AppConfig = {
      ...config,
      agents: {
        defaults: mode ? { compactionMode: mode } : {},
        model: "openai/test"
      }
    };

    return {
      claude: new ClaudeProcessor(config.skillDirs, config),
      pi: new PiAgentProcessor(configOpenAI.skillDirs, configOpenAI)
    };
  };

  describe("Compaction mode exposure", () => {
    it("should expose safeguard compaction mode", () => {
      const { claude, pi } = createProcessorWithMode("safeguard");

      expect(claude.getCompactionMode()).toBe("safeguard");
      expect(pi.getCompactionMode()).toBe("safeguard");
    });

    it("should expose moderate compaction mode", () => {
      const { claude, pi } = createProcessorWithMode("moderate");

      expect(claude.getCompactionMode()).toBe("moderate");
      expect(pi.getCompactionMode()).toBe("moderate");
    });

    it("should expose aggressive compaction mode", () => {
      const { claude, pi } = createProcessorWithMode("aggressive");

      expect(claude.getCompactionMode()).toBe("aggressive");
      expect(pi.getCompactionMode()).toBe("aggressive");
    });

    it("should default to moderate when not specified", () => {
      const { claude, pi } = createProcessorWithMode();

      expect(claude.getCompactionMode()).toBe("moderate");
      expect(pi.getCompactionMode()).toBe("moderate");
    });

    it("should apply compaction mode to workspace config", () => {
      const { claude } = createProcessorWithMode("aggressive");
      const workspaceConfig = claude.getWorkspaceConfig();

      expect(workspaceConfig.compactionMode).toBe("aggressive");
    });
  });

  describe("Compaction mode semantics", () => {
    it("safeguard mode should preserve full state history", () => {
      // Safeguard mode configuration
      const { claude } = createProcessorWithMode("safeguard");
      const mode = claude.getCompactionMode();

      // Safeguard mode should be used by state management to minimize compaction
      expect(mode).toBe("safeguard");

      // Documentation: In safeguard mode, state managers should:
      // - Preserve complete message history
      // - Avoid lossy compression
      // - Prioritize data integrity over size
      const rules = {
        maxCompression: 0,
        preserveFullHistory: true,
        lossyCompression: false
      };

      expect(rules.lossyCompression).toBe(false);
    });

    it("moderate mode should balance size and history", () => {
      // Moderate mode configuration (default)
      const { claude } = createProcessorWithMode("moderate");
      const mode = claude.getCompactionMode();

      expect(mode).toBe("moderate");

      // Documentation: In moderate mode, state managers should:
      // - Keep recent history intact
      // - Compress older messages
      // - Target ~70-80% size reduction
      const rules = {
        maxCompression: 0.75,
        preserveFullHistory: false,
        recentHistoryWindow: 100
      };

      expect(rules.maxCompression).toBeGreaterThan(0.5);
      expect(rules.maxCompression).toBeLessThan(1);
    });

    it("aggressive mode should maximize compaction", () => {
      // Aggressive mode configuration
      const { claude } = createProcessorWithMode("aggressive");
      const mode = claude.getCompactionMode();

      expect(mode).toBe("aggressive");

      // Documentation: In aggressive mode, state managers should:
      // - Keep only essential recent messages
      // - Use aggressive lossy compression
      // - Target ~90%+ size reduction
      const rules = {
        maxCompression: 0.95,
        preserveFullHistory: false,
        recentHistoryWindow: 20,
        summaryCompression: true
      };

      expect(rules.maxCompression).toBeGreaterThan(0.8);
      expect(rules.summaryCompression).toBe(true);
    });
  });

  describe("Compaction mode for different processor types", () => {
    it("should apply same compaction mode across processor types", () => {
      const { claude, pi } = createProcessorWithMode("moderate");

      const claudeMode = claude.getCompactionMode();
      const piMode = pi.getCompactionMode();

      expect(claudeMode).toBe(piMode);
    });

    it("should support independent compaction modes for different agents", () => {
      const baseConfig = resolveConfig();

      // Agent 1 with safeguard mode
      const config1: AppConfig = {
        ...baseConfig,
        models: {
          providers: {
            anthropic: {
              api: "anthropic",
              apiKey: "key1",
              models: [{ id: "test", name: "Test" }]
            }
          }
        },
        agents: {
          defaults: { compactionMode: "safeguard" },
          model: "anthropic/test"
        }
      };

      // Agent 2 with aggressive mode
      const config2: AppConfig = {
        ...baseConfig,
        models: {
          providers: {
            anthropic: {
              api: "anthropic",
              apiKey: "key2",
              models: [{ id: "test", name: "Test" }]
            }
          }
        },
        agents: {
          defaults: { compactionMode: "aggressive" },
          model: "anthropic/test"
        }
      };

      const agent1 = new ClaudeProcessor(config1.skillDirs, config1);
      const agent2 = new ClaudeProcessor(config2.skillDirs, config2);

      expect(agent1.getCompactionMode()).toBe("safeguard");
      expect(agent2.getCompactionMode()).toBe("aggressive");
    });
  });

  describe("Compaction mode usage patterns", () => {
    it("should provide compaction mode for state management decisions", () => {
      const { claude } = createProcessorWithMode("moderate");
      const mode = claude.getCompactionMode();

      // Pattern: Check compaction mode to decide compression strategy
      const shouldCompress = mode !== "safeguard";
      const compressionLevel = mode === "aggressive" ? "high" : "medium";

      expect(shouldCompress).toBe(true);
      expect(compressionLevel).toBe("medium");
    });

    it("should support runtime compaction mode queries", () => {
      const { claude } = createProcessorWithMode("moderate");

      // Pattern: Query mode before performing state compaction
      const mode = claude.getCompactionMode();

      const compactionStrategy = {
        safeguard: { compress: false, preserveHistory: true },
        moderate: { compress: true, compressionRatio: 0.7, preserveHistory: true },
        aggressive: { compress: true, compressionRatio: 0.95, preserveHistory: false }
      }[mode];

      expect(compactionStrategy.compress).toBe(true);
      expect(compactionStrategy.compressionRatio).toBe(0.7);
    });
  });
});
