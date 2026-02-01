import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RetryManager } from "../../src/services/retry_manager.ts";

describe("RetryManager", () => {
  let retryManager: RetryManager;

  beforeEach(() => {
    retryManager = new RetryManager({
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
      jitterMax: 0.1
    });
  });

  describe("executeWithRetry", () => {
    it("returns result on first successful attempt", async () => {
      const result = await retryManager.executeWithRetry(async () => {
        return "success";
      });

      expect(result).toBe("success");
    });

    it("retries on failure and eventually succeeds", async () => {
      let attempts = 0;

      const result = await retryManager.executeWithRetry(async () => {
        attempts++;
        if (attempts < 3) {
          const error = new Error("Rate limit exceeded");
          (error as any).status = 429; // Make it a rate limit error
          throw error;
        }
        return "success";
      });

      expect(result).toBe("success");
      expect(attempts).toBe(3);
    });

    it("gives up after max attempts", async () => {
      let attempts = 0;

      await expect(
        retryManager.executeWithRetry(async () => {
          attempts++;
          const error = new Error("Rate limit");
          (error as any).status = 429; // Make it a rate limit error so it retries
          throw error;
        })
      ).rejects.toThrow("Rate limit");

      expect(attempts).toBe(4); // Initial + 3 retries (maxAttempts = 3)
    });

    it("detects rate limit errors and retries", async () => {
      let attempts = 0;

      const result = await retryManager.executeWithRetry(async () => {
        attempts++;
        if (attempts < 2) {
          const error = new Error("Rate limit exceeded");
          (error as any).status = 429;
          throw error;
        }
        return "success";
      });

      expect(result).toBe("success");
      expect(attempts).toBe(2);
    });

    it("does not retry on non-rate-limit errors immediately", async () => {
      let attempts = 0;

      await expect(
        retryManager.executeWithRetry(async () => {
          attempts++;
          throw new Error("Regular error");
        })
      ).rejects.toThrow("Regular error");

      expect(attempts).toBe(1); // No retry for non-rate-limit errors
    });
  });

  describe("delay calculation", () => {
    it("calculates increasing delays with backoff", async () => {
      const delayManager = new RetryManager({
        maxAttempts: 4, // Need 5 total attempts (0,1,2,3,4) for 4 failures + 1 success
        baseDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        jitterMax: 0.1
      });

      const startTime = Date.now();

      let attempts = 0;
      await expect(
        delayManager.executeWithRetry(async () => {
          attempts++;
          if (attempts <= 4) { // Fail 4 times, succeed on 5th
            const error = new Error("Rate limit");
            (error as any).status = 429;
            throw error;
          }
          return "success";
        })
      ).rejects.toThrow();

      const elapsed = Date.now() - startTime;
      // Should have delays of ~100ms, ~200ms, ~400ms, ~800ms (but capped at 1000ms)
      expect(elapsed).toBeGreaterThan(1500); // At least 1500ms total delay
      expect(elapsed).toBeLessThan(2500); // But not too much more
    });

    it("respects maximum delay limit", async () => {
      const highDelayManager = new RetryManager({
        maxAttempts: 5,
        baseDelayMs: 1000,
        maxDelayMs: 200,
        backoffMultiplier: 2,
        jitterMax: 0
      });

      const startTime = Date.now();

      await expect(
        highDelayManager.executeWithRetry(async () => {
          const error = new Error("Rate limit");
          (error as any).status = 429;
          throw error;
        })
      ).rejects.toThrow();

      const elapsed = Date.now() - startTime;
      // Should cap at maxDelayMs (200ms) per retry
      expect(elapsed).toBeLessThan(1200); // Less than 5 * 200ms
    });
  });

  describe("jitter", () => {
    it("adds jitter to delay timing", async () => {
      const jitterManager = new RetryManager({
        maxAttempts: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 1, // No backoff for consistent timing
        jitterMax: 0.5 // 50% jitter
      });

      const delays: number[] = [];

      for (let i = 0; i < 5; i++) {
        const startTime = Date.now();
        try {
          await jitterManager.executeWithRetry(async () => {
            const error = new Error("Rate limit");
            (error as any).status = 429;
            throw error;
          });
        } catch (error) {
          // Expected to fail
        }
        const delay = Date.now() - startTime;
        delays.push(delay);
      }

      // With 50% jitter on 100ms base, delays should vary
      const minDelay = Math.min(...delays);
      const maxDelay = Math.max(...delays);
      expect(maxDelay - minDelay).toBeGreaterThan(20); // Should have variation
    });
  });

  describe("getStats", () => {
    it("returns correct configuration stats", () => {
      const stats = retryManager.getStats();

      expect(stats.maxAttempts).toBe(3);
      expect(stats.baseDelayMs).toBe(100);
      expect(stats.maxDelayMs).toBe(1000);
      expect(stats.backoffMultiplier).toBe(2);
      expect(stats.jitterMax).toBe(0.1);
    });
  });

  describe("updateConfig", () => {
    it("updates configuration at runtime", async () => {
      retryManager.updateConfig({ maxAttempts: 1 });

      let attempts = 0;
      await expect(
        retryManager.executeWithRetry(async () => {
          attempts++;
          const error = new Error("Rate limit");
          (error as any).status = 429;
          throw error;
        })
      ).rejects.toThrow();

      expect(attempts).toBe(2); // Should try twice with new config (maxAttempts = 1)
    });
  });
});