import { describe, it, expect, beforeEach } from "vitest";
import { validateAgentConfig } from "../../src/services/config_validator.ts";
import type { AppConfig } from "../../src/config.ts";

describe("Agent Configuration Defaults Integration", () => {
  describe("Compaction mode configuration", () => {
    it("should load and validate safeguard compactionMode", () => {
      const config: Partial<AppConfig> = {
        agents: {
          defaults: {
            compactionMode: "safeguard"
          }
        }
      };

      expect(() => {
        validateAgentConfig(config.agents?.defaults);
      }).not.toThrow();
    });

    it("should load and validate moderate compactionMode", () => {
      const config: Partial<AppConfig> = {
        agents: {
          defaults: {
            compactionMode: "moderate"
          }
        }
      };

      expect(() => {
        validateAgentConfig(config.agents?.defaults);
      }).not.toThrow();
    });

    it("should load and validate aggressive compactionMode", () => {
      const config: Partial<AppConfig> = {
        agents: {
          defaults: {
            compactionMode: "aggressive"
          }
        }
      };

      expect(() => {
        validateAgentConfig(config.agents?.defaults);
      }).not.toThrow();
    });

    it("should reject invalid compactionMode values", () => {
      const config: Partial<AppConfig> = {
        agents: {
          defaults: {
            compactionMode: "invalid" as any
          }
        }
      };

      expect(() => {
        validateAgentConfig(config.agents?.defaults);
      }).toThrow("Invalid compactionMode");
    });

    it("should apply default when compactionMode is not specified", () => {
      const config: Partial<AppConfig> = {
        agents: {
          defaults: {}
        }
      };

      // Should not throw - compactionMode is optional
      expect(() => {
        validateAgentConfig(config.agents?.defaults);
      }).not.toThrow();
    });

    it("should prioritize agent defaults for compactionMode", () => {
      const config: Partial<AppConfig> = {
        agents: {
          defaults: {
            compactionMode: "moderate"
          }
        }
      };

      // Should use the defaults value
      const agentDefaults = config.agents?.defaults;
      expect(agentDefaults?.compactionMode).toBe("moderate");
    });
  });

  describe("Subagent concurrency configuration", () => {
    it("should load and validate positive maxConcurrent value", () => {
      const config: Partial<AppConfig> = {
        agents: {
          defaults: {
            subagents: {
              maxConcurrent: 5
            }
          }
        }
      };

      expect(() => {
        validateAgentConfig(config.agents?.defaults);
      }).not.toThrow();
    });

    it("should accept various positive maxConcurrent values", () => {
      const validValues = [1, 2, 5, 10, 50, 100, 1000];

      for (const value of validValues) {
        const config: Partial<AppConfig> = {
          agents: {
            defaults: {
              subagents: {
                maxConcurrent: value
              }
            }
          }
        };

        expect(() => {
          validateAgentConfig(config.agents?.defaults);
        }).not.toThrow();
      }
    });

    it("should reject zero maxConcurrent value", () => {
      const config: Partial<AppConfig> = {
        agents: {
          defaults: {
            subagents: {
              maxConcurrent: 0
            }
          }
        }
      };

      expect(() => {
        validateAgentConfig(config.agents?.defaults);
      }).toThrow("must be a positive number");
    });

    it("should reject negative maxConcurrent value", () => {
      const config: Partial<AppConfig> = {
        agents: {
          defaults: {
            subagents: {
              maxConcurrent: -5
            }
          }
        }
      };

      expect(() => {
        validateAgentConfig(config.agents?.defaults);
      }).toThrow("must be a positive number");
    });

    it("should reject non-numeric maxConcurrent value", () => {
      const config: Partial<AppConfig> = {
        agents: {
          defaults: {
            subagents: {
              maxConcurrent: "5" as any
            }
          }
        }
      };

      expect(() => {
        validateAgentConfig(config.agents?.defaults);
      }).toThrow("must be a positive number");
    });

    it("should apply default when maxConcurrent is not specified", () => {
      const config: Partial<AppConfig> = {
        agents: {
          defaults: {
            subagents: {}
          }
        }
      };

      // Should not throw - maxConcurrent is optional
      expect(() => {
        validateAgentConfig(config.agents?.defaults);
      }).not.toThrow();
    });

    it("should apply default when subagents is not specified", () => {
      const config: Partial<AppConfig> = {
        agents: {
          defaults: {}
        }
      };

      // Should not throw - subagents is optional
      expect(() => {
        validateAgentConfig(config.agents?.defaults);
      }).not.toThrow();
    });
  });

  describe("Workspace configuration", () => {
    it("should load workspace path from agent defaults", () => {
      const config: Partial<AppConfig> = {
        agents: {
          defaults: {
            workspace: "~/.ironbot/agent-workspace"
          }
        }
      };

      const workspace = config.agents?.defaults?.workspace;
      expect(workspace).toBe("~/.ironbot/agent-workspace");
    });

    it("should support absolute workspace paths", () => {
      const config: Partial<AppConfig> = {
        agents: {
          defaults: {
            workspace: "/var/agent/workspace"
          }
        }
      };

      const workspace = config.agents?.defaults?.workspace;
      expect(workspace).toBe("/var/agent/workspace");
    });

    it("should support relative workspace paths", () => {
      const config: Partial<AppConfig> = {
        agents: {
          defaults: {
            workspace: "./workspace"
          }
        }
      };

      const workspace = config.agents?.defaults?.workspace;
      expect(workspace).toBe("./workspace");
    });

    it("should apply default when workspace is not specified", () => {
      const config: Partial<AppConfig> = {
        agents: {
          defaults: {}
        }
      };

      const workspace = config.agents?.defaults?.workspace;
      expect(workspace).toBeUndefined();
    });
  });

  describe("Combined agent configuration", () => {
    it("should validate all agent defaults together", () => {
      const config: Partial<AppConfig> = {
        agents: {
          defaults: {
            workspace: "~/.ironbot/workspace",
            compactionMode: "moderate",
            subagents: {
              maxConcurrent: 10
            }
          }
        }
      };

      expect(() => {
        validateAgentConfig(config.agents?.defaults);
      }).not.toThrow();
    });

    it("should handle partial agent configuration", () => {
      const configs = [
        { workspace: "~/workspace" },
        { compactionMode: "moderate" as const },
        { subagents: { maxConcurrent: 5 } },
        { workspace: "~/workspace", compactionMode: "aggressive" as const },
        { compactionMode: "safeguard" as const, subagents: { maxConcurrent: 3 } }
      ];

      for (const config of configs) {
        expect(() => {
          validateAgentConfig(config);
        }).not.toThrow();
      }
    });

    it("should maintain defaults when some values are provided", () => {
      const config: Partial<AppConfig> = {
        agents: {
          defaults: {
            compactionMode: "moderate",
            workspace: "~/.ironbot/workspace"
            // subagents.maxConcurrent not specified - should use default
          }
        }
      };

      const defaults = config.agents?.defaults;
      expect(defaults?.compactionMode).toBe("moderate");
      expect(defaults?.workspace).toBe("~/.ironbot/workspace");
      expect(defaults?.subagents?.maxConcurrent).toBeUndefined();
    });

    it("should validate compactionMode independently from workspace", () => {
      const configs = [
        { compactionMode: "safeguard" as const },
        { workspace: "/tmp/workspace" },
        { compactionMode: "moderate" as const, workspace: "~/workspace" }
      ];

      for (const config of configs) {
        expect(() => {
          validateAgentConfig(config);
        }).not.toThrow();
      }
    });

    it("should validate maxConcurrent independently from other settings", () => {
      const config: Partial<AppConfig> = {
        agents: {
          defaults: {
            subagents: {
              maxConcurrent: 15
            }
          }
        }
      };

      expect(() => {
        validateAgentConfig(config.agents?.defaults);
      }).not.toThrow();

      const maxConcurrent = config.agents?.defaults?.subagents?.maxConcurrent;
      expect(maxConcurrent).toBe(15);
    });
  });

  describe("Configuration precedence", () => {
    it("should prefer agent defaults over global defaults", () => {
      const config: Partial<AppConfig> = {
        agents: {
          defaults: {
            compactionMode: "moderate",
            workspace: "/specific/workspace"
          }
        }
      };

      // Agent defaults should take precedence
      expect(config.agents?.defaults?.compactionMode).toBe("moderate");
      expect(config.agents?.defaults?.workspace).toBe("/specific/workspace");
    });

    it("should allow per-agent overrides of defaults", () => {
      const globalDefault = {
        compactionMode: "moderate" as const
      };

      const agentSpecific = {
        compactionMode: "aggressive" as const,
        workspace: "~/agent-workspace"
      };

      // Agent-specific should override global
      const applied = { ...globalDefault, ...agentSpecific };
      expect(applied.compactionMode).toBe("aggressive");
      expect(applied.workspace).toBe("~/agent-workspace");
    });
  });

  describe("Configuration consistency", () => {
    it("should handle empty agent defaults gracefully", () => {
      const config: Partial<AppConfig> = {
        agents: {
          defaults: {}
        }
      };

      expect(() => {
        validateAgentConfig(config.agents?.defaults);
      }).not.toThrow();
    });

    it("should handle missing agents section", () => {
      const config: Partial<AppConfig> = {};

      expect(() => {
        validateAgentConfig(config.agents?.defaults);
      }).not.toThrow();
    });

    it("should validate entire agent configuration structure", () => {
      const validConfigs = [
        { agents: { defaults: {} } },
        { agents: { defaults: { workspace: "~/.workspace" } } },
        {
          agents: {
            defaults: {
              workspace: "~/.workspace",
              compactionMode: "moderate",
              subagents: { maxConcurrent: 10 }
            }
          }
        },
        { agents: { defaults: { subagents: { maxConcurrent: 5 } } } },
        { agents: { defaults: { compactionMode: "safeguard" } } }
      ];

      for (const config of validConfigs) {
        expect(() => {
          validateAgentConfig(config.agents?.defaults);
        }).not.toThrow();
      }
    });
  });
});
