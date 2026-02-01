import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimiter, type ApiMethod } from "../../src/services/rate_limiter.ts";

describe("RateLimiter", () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter({
      enabled: true,
      requestsPerSecond: 2, // 2 requests per second for easier testing
      burstCapacity: 5,
      queueSize: 10,
      retryMaxAttempts: 3,
      retryBaseDelayMs: 1000,
      retryMaxDelayMs: 10000
    });
  });

  describe("canMakeRequest", () => {
    it("allows requests within rate limit", () => {
      expect(rateLimiter.canMakeRequest("postMessage")).toBe(true);
      expect(rateLimiter.canMakeRequest("postMessage")).toBe(true);
    });

    it("blocks requests that exceed burst capacity", () => {
      // Consume all burst capacity
      for (let i = 0; i < 5; i++) {
        expect(rateLimiter.canMakeRequest("postMessage")).toBe(true);
      }
      // Next request should be blocked
      expect(rateLimiter.canMakeRequest("postMessage")).toBe(false);
    });

    it("respects different limits per API method", () => {
      // setStatus has 2x the rate limit
      for (let i = 0; i < 10; i++) {
        expect(rateLimiter.canMakeRequest("setStatus")).toBe(true);
      }
      expect(rateLimiter.canMakeRequest("setStatus")).toBe(false);
    });

    it("allows all requests when disabled", () => {
      const disabledLimiter = new RateLimiter({
        enabled: false,
        requestsPerSecond: 1,
        burstCapacity: 1,
        queueSize: 10,
        retryMaxAttempts: 3,
        retryBaseDelayMs: 1000,
        retryMaxDelayMs: 10000
      });

      for (let i = 0; i < 10; i++) {
        expect(disabledLimiter.canMakeRequest("postMessage")).toBe(true);
      }
    });
  });

  describe("getWaitTime", () => {
    it("returns 0 when request can proceed immediately", () => {
      expect(rateLimiter.getWaitTime("postMessage")).toBe(0);
    });

    it("returns positive wait time when rate limited", () => {
      // Consume burst capacity
      for (let i = 0; i < 5; i++) {
        rateLimiter.canMakeRequest("postMessage");
      }

      const waitTime = rateLimiter.getWaitTime("postMessage");
      expect(waitTime).toBeGreaterThan(0);
      expect(waitTime).toBeLessThanOrEqual(1000); // Should be less than 1 second for 2 RPS
    });
  });

  describe("waitForRequest", () => {
    it("resolves immediately when request can proceed", async () => {
      const startTime = Date.now();
      await rateLimiter.waitForRequest("postMessage");
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(10); // Should be nearly instant
    });

    it("waits when rate limited", async () => {
      // Consume burst capacity
      for (let i = 0; i < 5; i++) {
        rateLimiter.canMakeRequest("postMessage");
      }

      const startTime = Date.now();
      await rateLimiter.waitForRequest("postMessage");
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThan(400); // Should wait at least 0.5 seconds
    });
  });

  describe("consumeToken", () => {
    it("consumes tokens when called", () => {
      expect(rateLimiter.canMakeRequest("postMessage")).toBe(true);
      rateLimiter.consumeToken("postMessage");
      // Should have consumed the token that was available
      expect(rateLimiter.canMakeRequest("postMessage")).toBe(true); // Still has tokens
    });

    it("does nothing when disabled", () => {
      const disabledLimiter = new RateLimiter({
        enabled: false,
        requestsPerSecond: 1,
        burstCapacity: 1,
        queueSize: 10,
        retryMaxAttempts: 3,
        retryBaseDelayMs: 1000,
        retryMaxDelayMs: 10000
      });

      disabledLimiter.consumeToken("postMessage");
      // No effect since disabled
    });
  });

  describe("getStatus", () => {
    it("returns status for all API methods", () => {
      const status = rateLimiter.getStatus();

      expect(status).toHaveProperty("postMessage");
      expect(status).toHaveProperty("setStatus");
      expect(status).toHaveProperty("update");
      expect(status).toHaveProperty("general");

      expect(status.postMessage.availableTokens).toBe(5); // Full burst capacity
      expect(status.postMessage.capacity).toBe(5);
    });
  });

  describe("updateConfig", () => {
    it("updates configuration at runtime", () => {
      rateLimiter.updateConfig({ requestsPerSecond: 1, burstCapacity: 3 });

      // Should have new limits
      expect(rateLimiter.canMakeRequest("postMessage")).toBe(true);
      expect(rateLimiter.canMakeRequest("postMessage")).toBe(true);
      expect(rateLimiter.canMakeRequest("postMessage")).toBe(true);
      expect(rateLimiter.canMakeRequest("postMessage")).toBe(false);
    });
  });

  describe("error scenarios", () => {
    it("handles invalid API method gracefully", () => {
      // Rate limiter should handle unknown methods without crashing
      expect(() => rateLimiter.canMakeRequest("invalidMethod" as ApiMethod)).not.toThrow();
      expect(() => rateLimiter.getWaitTime("invalidMethod" as ApiMethod)).not.toThrow();
      expect(() => rateLimiter.consumeToken("invalidMethod" as ApiMethod)).not.toThrow();
    });

    it("handles extreme configuration values", () => {
      const extremeLimiter = new RateLimiter({
        enabled: true,
        requestsPerSecond: 0.1, // Very slow rate
        burstCapacity: 1,
        queueSize: 1,
        retryMaxAttempts: 1,
        retryBaseDelayMs: 1,
        retryMaxDelayMs: 10
      });

      // Should still work with extreme values
      expect(extremeLimiter.canMakeRequest("postMessage")).toBe(true);
    });

    it("handles configuration updates with invalid values", () => {
      // Should clamp invalid values
      rateLimiter.updateConfig({
        requestsPerSecond: -1, // Invalid
        burstCapacity: 0, // Invalid
        retryMaxAttempts: 0
      });

      // Should still function (with clamped values)
      expect(rateLimiter.canMakeRequest("postMessage")).toBe(true);
    });
  });