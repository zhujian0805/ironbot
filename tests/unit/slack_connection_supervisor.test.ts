import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SlackApiOptimizer } from "../../src/services/slack_api_optimizer.ts";
import { RateLimiter } from "../../src/services/rate_limiter.ts";
import { RetryManager } from "../../src/services/retry_manager.ts";
import { SlackConnectionSupervisor } from "../../src/services/slack_connection_supervisor.ts";

describe("SlackConnectionSupervisor", () => {
  let optimizer: SlackApiOptimizer;
  let rateLimiter: RateLimiter;
  let retryManager: RetryManager;
  let supervisor: SlackConnectionSupervisor;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(100);
    optimizer = new SlackApiOptimizer();
    rateLimiter = new RateLimiter({
      enabled: true,
      requestsPerSecond: 100,
      burstCapacity: 10,
      queueSize: 20,
      retryMaxAttempts: 1,
      retryBaseDelayMs: 10,
      retryMaxDelayMs: 100
    });
    retryManager = new RetryManager({
      maxAttempts: 1,
      baseDelayMs: 10,
      maxDelayMs: 100,
      backoffMultiplier: 2,
      jitterMax: 0
    });
    supervisor = new SlackConnectionSupervisor(optimizer, rateLimiter, retryManager, {
      idleThresholdMs: 10,
      cooldownWindowMs: 50
    });
  });

  afterEach(() => {
    optimizer.shutdown();
    vi.useRealTimers();
  });

  describe("runProbe", () => {
    it("executes the operation when not idle", async () => {
      const mockOp = vi.fn().mockResolvedValue("ok");
      const result = await supervisor.runProbe("general", mockOp, "test-probe");
      expect(result.status).toBe("executed");
      expect(mockOp).toHaveBeenCalledTimes(1);
    });

    it("skips the probe while cooldown is active after idle", async () => {
      const mockOp = vi.fn().mockResolvedValue("ok");

      await supervisor.runProbe("general", mockOp, "test-probe");
      expect(mockOp).toHaveBeenCalledTimes(1);

      vi.setSystemTime(120); // exceed idle threshold but within cooldown window

      const second = await supervisor.runProbe("general", mockOp, "test-probe");
      expect(second.status).toBe("skipped");

      const stats = optimizer.getStats();
      expect(stats.activeCooldowns).toBeGreaterThanOrEqual(1);
      expect(stats.cooldownEntries.length).toBeGreaterThanOrEqual(1);
    });
  });
});
