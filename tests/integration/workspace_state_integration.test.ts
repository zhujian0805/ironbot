import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WorkspaceManager } from "../../src/services/workspace_manager.ts";
import { ClaudeProcessor } from "../../src/services/claude_processor.ts";
import { resolveConfig, type AppConfig } from "../../src/config.ts";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import path from "node:path";

describe("Workspace Integration with Agent State Management", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(path.join(process.cwd(), "workspace-integration-test-"));
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Agent workspace configuration flow", () => {
    it("should initialize workspace directory during agent startup", () => {
      const workspacePath = path.join(testDir, "agent-workspace");
      expect(existsSync(workspacePath)).toBe(false);

      // Initialize workspace as done in main.ts
      const initialized = WorkspaceManager.initializeWorkspace(workspacePath);

      expect(existsSync(initialized)).toBe(true);
      expect(initialized).toBe(workspacePath);
    });

    it("should expose workspace configuration from agent processor", () => {
      const baseConfig = resolveConfig();
      const workspacePath = path.join(testDir, "processor-workspace");

      const config: AppConfig = {
        ...baseConfig,
        models: {
          providers: {
            anthropic: {
              api: "anthropic",
              apiKey: "test-key",
              models: [{ id: "test", name: "Test" }]
            }
          }
        },
        agents: {
          defaults: {
            workspace: workspacePath,
            compactionMode: "moderate"
          },
          model: "anthropic/test"
        }
      };

      const processor = new ClaudeProcessor(config.skillDirs, config);
      const workspaceConfig = processor.getWorkspaceConfig();

      expect(workspaceConfig.workspace).toBe(workspacePath);
      expect(workspaceConfig.compactionMode).toBe("moderate");
    });

    it("should preserve workspace path for state management", () => {
      const baseConfig = resolveConfig();
      const customWorkspace = "~/.ironbot/custom-workspace";

      const config: AppConfig = {
        ...baseConfig,
        models: {
          providers: {
            anthropic: {
              api: "anthropic",
              apiKey: "test-key",
              models: [{ id: "test", name: "Test" }]
            }
          }
        },
        agents: {
          defaults: {
            workspace: customWorkspace
          },
          model: "anthropic/test"
        }
      };

      const processor = new ClaudeProcessor(config.skillDirs, config);
      const workspaceConfig = processor.getWorkspaceConfig();

      expect(workspaceConfig.workspace).toBe(customWorkspace);
    });

    it("should handle undefined workspace gracefully", () => {
      const baseConfig = resolveConfig();
      const config: AppConfig = {
        ...baseConfig,
        models: {
          providers: {
            anthropic: {
              api: "anthropic",
              apiKey: "test-key",
              models: [{ id: "test", name: "Test" }]
            }
          }
        },
        agents: {
          defaults: {},
          model: "anthropic/test"
        }
      };

      const processor = new ClaudeProcessor(config.skillDirs, config);
      const workspaceConfig = processor.getWorkspaceConfig();

      expect(workspaceConfig.workspace).toBeUndefined();
    });

    it("should support multiple workspaces for different agent instances", () => {
      const baseConfig = resolveConfig();
      const workspace1 = path.join(testDir, "workspace1");
      const workspace2 = path.join(testDir, "workspace2");

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
          defaults: { workspace: workspace1 },
          model: "anthropic/test"
        }
      };

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
          defaults: { workspace: workspace2 },
          model: "anthropic/test"
        }
      };

      const processor1 = new ClaudeProcessor(config1.skillDirs, config1);
      const processor2 = new ClaudeProcessor(config2.skillDirs, config2);

      expect(processor1.getWorkspaceConfig().workspace).toBe(workspace1);
      expect(processor2.getWorkspaceConfig().workspace).toBe(workspace2);
    });
  });

  describe("Compaction mode configuration flow", () => {
    it("should expose compactionMode from agent configuration", () => {
      const baseConfig = resolveConfig();
      const config: AppConfig = {
        ...baseConfig,
        models: {
          providers: {
            anthropic: {
              api: "anthropic",
              apiKey: "test-key",
              models: [{ id: "test", name: "Test" }]
            }
          }
        },
        agents: {
          defaults: {
            compactionMode: "safeguard"
          },
          model: "anthropic/test"
        }
      };

      const processor = new ClaudeProcessor(config.skillDirs, config);
      const workspaceConfig = processor.getWorkspaceConfig();

      expect(workspaceConfig.compactionMode).toBe("safeguard");
    });

    it("should support all compaction mode values", () => {
      const baseConfig = resolveConfig();
      const modes = ["safeguard", "moderate", "aggressive"] as const;

      for (const mode of modes) {
        const config: AppConfig = {
          ...baseConfig,
          models: {
            providers: {
              anthropic: {
                api: "anthropic",
                apiKey: "test-key",
                models: [{ id: "test", name: "Test" }]
              }
            }
          },
          agents: {
            defaults: { compactionMode: mode },
            model: "anthropic/test"
          }
        };

        const processor = new ClaudeProcessor(config.skillDirs, config);
        const workspaceConfig = processor.getWorkspaceConfig();

        expect(workspaceConfig.compactionMode).toBe(mode);
      }
    });

    it("should handle undefined compactionMode", () => {
      const baseConfig = resolveConfig();
      const config: AppConfig = {
        ...baseConfig,
        models: {
          providers: {
            anthropic: {
              api: "anthropic",
              apiKey: "test-key",
              models: [{ id: "test", name: "Test" }]
            }
          }
        },
        agents: {
          defaults: {},
          model: "anthropic/test"
        }
      };

      const processor = new ClaudeProcessor(config.skillDirs, config);
      const workspaceConfig = processor.getWorkspaceConfig();

      expect(workspaceConfig.compactionMode).toBeUndefined();
    });
  });

  describe("Integrated workspace and compaction mode", () => {
    it("should expose both workspace and compactionMode together", () => {
      const baseConfig = resolveConfig();
      const workspacePath = path.join(testDir, "integrated-workspace");

      const config: AppConfig = {
        ...baseConfig,
        models: {
          providers: {
            anthropic: {
              api: "anthropic",
              apiKey: "test-key",
              models: [{ id: "test", name: "Test" }]
            }
          }
        },
        agents: {
          defaults: {
            workspace: workspacePath,
            compactionMode: "moderate"
          },
          model: "anthropic/test"
        }
      };

      const processor = new ClaudeProcessor(config.skillDirs, config);
      const workspaceConfig = processor.getWorkspaceConfig();

      expect(workspaceConfig.workspace).toBe(workspacePath);
      expect(workspaceConfig.compactionMode).toBe("moderate");
    });

    it("should allow workspace without compactionMode", () => {
      const baseConfig = resolveConfig();
      const workspacePath = path.join(testDir, "workspace-only");

      const config: AppConfig = {
        ...baseConfig,
        models: {
          providers: {
            anthropic: {
              api: "anthropic",
              apiKey: "test-key",
              models: [{ id: "test", name: "Test" }]
            }
          }
        },
        agents: {
          defaults: { workspace: workspacePath },
          model: "anthropic/test"
        }
      };

      const processor = new ClaudeProcessor(config.skillDirs, config);
      const workspaceConfig = processor.getWorkspaceConfig();

      expect(workspaceConfig.workspace).toBe(workspacePath);
      expect(workspaceConfig.compactionMode).toBeUndefined();
    });

    it("should allow compactionMode without workspace", () => {
      const baseConfig = resolveConfig();
      const config: AppConfig = {
        ...baseConfig,
        models: {
          providers: {
            anthropic: {
              api: "anthropic",
              apiKey: "test-key",
              models: [{ id: "test", name: "Test" }]
            }
          }
        },
        agents: {
          defaults: { compactionMode: "aggressive" },
          model: "anthropic/test"
        }
      };

      const processor = new ClaudeProcessor(config.skillDirs, config);
      const workspaceConfig = processor.getWorkspaceConfig();

      expect(workspaceConfig.workspace).toBeUndefined();
      expect(workspaceConfig.compactionMode).toBe("aggressive");
    });
  });
});
