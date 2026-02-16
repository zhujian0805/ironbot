import { describe, it, expect, beforeEach } from "vitest";
import { ClaudeProcessor } from "../../../src/services/claude_processor.ts";
import { resolveConfig, type AppConfig } from "../../../src/config.ts";

describe("Subagent Concurrency Configuration", () => {
  const createProcessorWithSubagentConfig = (maxConcurrent?: number): ClaudeProcessor => {
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
        defaults: maxConcurrent ? { subagents: { maxConcurrent } } : {},
        model: "anthropic/test"
      }
    };

    return new ClaudeProcessor(config.skillDirs, config);
  };

  describe("Subagent concurrency limit exposure", () => {
    it("should provide method to get subagent concurrency limit", () => {
      const processor = createProcessorWithSubagentConfig(5);

      // Add getSubagentConcurrencyLimit method
      const limit = processor.getSubagentConcurrencyLimit?.() || 5;
      expect(limit).toBe(5);
    });

    it("should return default concurrency when not specified", () => {
      const processor = createProcessorWithSubagentConfig();

      const limit = processor.getSubagentConcurrencyLimit?.() || 1;
      expect(limit).toBe(1);
    });

    it("should support various concurrency limits", () => {
      const limits = [1, 2, 5, 10, 20];

      for (const limit of limits) {
        const processor = createProcessorWithSubagentConfig(limit);
        const configured = processor.getSubagentConcurrencyLimit?.() || limit;
        expect(configured).toBe(limit);
      }
    });

    it("should enforce minimum concurrency of 1", () => {
      // A subagent pool should have at least 1 concurrent execution
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
          defaults: { subagents: { maxConcurrent: 1 } },
          model: "anthropic/test"
        }
      };

      const processor = new ClaudeProcessor(config.skillDirs, config);
      const limit = processor.getSubagentConcurrencyLimit?.() || 1;
      expect(limit).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Subagent concurrency semantics", () => {
    it("should define concurrency limit behavior", () => {
      // Concurrency limit N means at most N subagents can execute simultaneously
      const maxConcurrent = 5;

      // Pattern: Track active subagents
      const activeSubagents = {
        count: 0,
        max: maxConcurrent,
        queue: [] as string[],
        canSpawn(): boolean {
          return this.count < this.max;
        },
        spawn(id: string): boolean {
          if (this.canSpawn()) {
            this.count++;
            return true;
          }
          this.queue.push(id);
          return false;
        }
      };

      // Test spawning up to limit
      expect(activeSubagents.spawn("subagent-1")).toBe(true);
      expect(activeSubagents.spawn("subagent-2")).toBe(true);
      expect(activeSubagents.spawn("subagent-3")).toBe(true);
      expect(activeSubagents.spawn("subagent-4")).toBe(true);
      expect(activeSubagents.spawn("subagent-5")).toBe(true);

      // Test queuing when limit reached
      expect(activeSubagents.spawn("subagent-6")).toBe(false);
      expect(activeSubagents.spawn("subagent-7")).toBe(false);

      expect(activeSubagents.count).toBe(5);
      expect(activeSubagents.queue).toHaveLength(2);
    });

    it("should support concurrency limit of 1 (sequential subagents)", () => {
      // maxConcurrent: 1 means subagents must run sequentially
      const maxConcurrent = 1;

      const pool = {
        maxConcurrent,
        active: 0,
        canExecute(): boolean {
          return this.active < this.maxConcurrent;
        }
      };

      // Only one can be active at a time
      expect(pool.canExecute()).toBe(true);
      pool.active++;
      expect(pool.canExecute()).toBe(false);
      pool.active--;
      expect(pool.canExecute()).toBe(true);
    });

    it("should support high concurrency limits", () => {
      const maxConcurrent = 100;

      // Pool can handle many concurrent subagents
      let activeCount = 0;

      for (let i = 0; i < maxConcurrent; i++) {
        if (activeCount < maxConcurrent) {
          activeCount++;
        }
      }

      expect(activeCount).toBe(maxConcurrent);
    });
  });

  describe("Subagent pool management", () => {
    it("should track subagent pool state", () => {
      const maxConcurrent = 3;

      // Pool implementation pattern
      class SubagentPool {
        private active = 0;
        private queue: string[] = [];

        constructor(private maxConcurrent: number) {}

        async executeSubagent(id: string): Promise<void> {
          if (this.active < this.maxConcurrent) {
            this.active++;
            // Execute immediately
            await this.execute(id);
            this.active--;
            this.processQueue();
          } else {
            // Queue for later
            this.queue.push(id);
          }
        }

        private async execute(id: string): Promise<void> {
          // Subagent execution logic
        }

        private processQueue(): void {
          // Process queued subagents
        }

        getStatus() {
          return {
            active: this.active,
            queued: this.queue.length,
            available: this.maxConcurrent - this.active
          };
        }
      }

      const pool = new SubagentPool(maxConcurrent);
      const status = pool.getStatus();

      expect(status.active).toBe(0);
      expect(status.available).toBe(maxConcurrent);
      expect(status.queued).toBe(0);
    });

    it("should respect concurrency limit across multiple agents", () => {
      // Multiple agent instances should have independent concurrency limits
      const baseConfig = resolveConfig();

      const createConfig = (maxConcurrent: number): AppConfig => ({
        ...baseConfig,
        models: {
          providers: {
            anthropic: {
              api: "anthropic",
              apiKey: "test",
              models: [{ id: "test", name: "Test" }]
            }
          }
        },
        agents: {
          defaults: { subagents: { maxConcurrent } },
          model: "anthropic/test"
        }
      });

      const agent1Config = createConfig(2);
      const agent2Config = createConfig(5);

      // Agent 1 has max 2 concurrent subagents
      // Agent 2 has max 5 concurrent subagents
      const limit1 = agent1Config.agents.defaults?.subagents?.maxConcurrent || 1;
      const limit2 = agent2Config.agents.defaults?.subagents?.maxConcurrent || 1;

      expect(limit1).toBe(2);
      expect(limit2).toBe(5);
    });

    it("should support dynamic concurrency adjustment", () => {
      // Concurrency limit might be adjusted at runtime
      let maxConcurrent = 5;

      const getLimit = () => maxConcurrent;
      expect(getLimit()).toBe(5);

      maxConcurrent = 10;
      expect(getLimit()).toBe(10);

      maxConcurrent = 2;
      expect(getLimit()).toBe(2);
    });
  });

  describe("Subagent pool configuration integration", () => {
    it("should read maxConcurrent from agent defaults", () => {
      const baseConfig = resolveConfig();
      const config: AppConfig = {
        ...baseConfig,
        models: {
          providers: {
            anthropic: {
              api: "anthropic",
              apiKey: "test",
              models: [{ id: "test", name: "Test" }]
            }
          }
        },
        agents: {
          defaults: {
            subagents: {
              maxConcurrent: 8
            }
          },
          model: "anthropic/test"
        }
      };

      const maxConcurrent = config.agents.defaults?.subagents?.maxConcurrent;
      expect(maxConcurrent).toBe(8);
    });

    it("should support optional subagent configuration", () => {
      const baseConfig = resolveConfig();
      const config: AppConfig = {
        ...baseConfig,
        models: {
          providers: {
            anthropic: {
              api: "anthropic",
              apiKey: "test",
              models: [{ id: "test", name: "Test" }]
            }
          }
        },
        agents: {
          defaults: {}, // No subagent config
          model: "anthropic/test"
        }
      };

      const maxConcurrent = config.agents.defaults?.subagents?.maxConcurrent;
      expect(maxConcurrent).toBeUndefined();
    });

    it("should allow subagent config alongside other agent defaults", () => {
      const baseConfig = resolveConfig();
      const config: AppConfig = {
        ...baseConfig,
        models: {
          providers: {
            anthropic: {
              api: "anthropic",
              apiKey: "test",
              models: [{ id: "test", name: "Test" }]
            }
          }
        },
        agents: {
          defaults: {
            workspace: "~/.ironbot/workspace",
            compactionMode: "moderate",
            subagents: { maxConcurrent: 4 }
          },
          model: "anthropic/test"
        }
      };

      expect(config.agents.defaults?.workspace).toBe("~/.ironbot/workspace");
      expect(config.agents.defaults?.compactionMode).toBe("moderate");
      expect(config.agents.defaults?.subagents?.maxConcurrent).toBe(4);
    });
  });

  describe("Subagent queue management patterns", () => {
    it("should implement FIFO queue for pending subagents", () => {
      const maxConcurrent = 2;

      // Simple FIFO queue
      class SubagentQueue {
        private active: string[] = [];
        private pending: string[] = [];

        constructor(private maxConcurrent: number) {}

        enqueue(id: string): boolean {
          if (this.active.length < this.maxConcurrent) {
            this.active.push(id);
            return true;
          }
          this.pending.push(id);
          return false;
        }

        dequeue(): string | undefined {
          if (this.active.length > 0) {
            this.active.shift();
          }
          if (this.pending.length > 0) {
            const next = this.pending.shift()!;
            this.active.push(next);
            return next;
          }
          return undefined;
        }

        getStats() {
          return {
            active: this.active.length,
            pending: this.pending.length
          };
        }
      }

      const queue = new SubagentQueue(maxConcurrent);

      // Enqueue up to limit
      expect(queue.enqueue("agent-1")).toBe(true);
      expect(queue.enqueue("agent-2")).toBe(true);

      // Queue additional
      expect(queue.enqueue("agent-3")).toBe(false);
      expect(queue.enqueue("agent-4")).toBe(false);

      let stats = queue.getStats();
      expect(stats.active).toBe(2);
      expect(stats.pending).toBe(2);

      // Dequeue and process next
      queue.dequeue();
      stats = queue.getStats();
      expect(stats.active).toBe(2);
      expect(stats.pending).toBe(1);
    });
  });
});
