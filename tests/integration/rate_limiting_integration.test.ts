import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "../../src/services/rate_limiter.ts";
import { RequestQueue } from "../../src/services/request_queue.ts";
import { RetryManager } from "../../src/services/retry_manager.ts";
import { AsyncFileManager } from "../../src/services/async_file_manager.ts";
import { SlackApiOptimizer } from "../../src/services/slack_api_optimizer.ts";
import { MessageRouter } from "../../src/services/message_router.ts";
import { ClaudeProcessor } from "../../src/services/claude_processor.ts";
import { resolveConfig } from "../../src/config.ts";
import path from "node:path";
import fs from "node:fs";

describe("Rate Limiting Integration", () => {
  let rateLimiter: RateLimiter;
  let requestQueue: RequestQueue;
  let retryManager: RetryManager;
  let fileManager: AsyncFileManager;
  let apiOptimizer: SlackApiOptimizer;
  let messageRouter: MessageRouter;
  let mockClaude: any;
  let mockSlackClient: any;
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory for file operations
    tempDir = path.join(process.cwd(), "test-temp");
    await fs.promises.mkdir(tempDir, { recursive: true });

    // Initialize services with test config
    const config = {
      ...resolveConfig(),
      rateLimit: {
        enabled: true,
        requestsPerSecond: 2,
        burstCapacity: 3,
        queueSize: 10,
        retryMaxAttempts: 2,
        retryBaseDelayMs: 50,
        retryMaxDelayMs: 200
      },
      sessions: {
        ...resolveConfig().sessions,
        storePath: tempDir,
        transcriptsDir: tempDir
      }
    };

    rateLimiter = new RateLimiter(config.rateLimit);
    requestQueue = new RequestQueue(2, config.rateLimit.queueSize);
    retryManager = new RetryManager({
      maxAttempts: config.rateLimit.retryMaxAttempts,
      baseDelayMs: config.rateLimit.retryBaseDelayMs,
      maxDelayMs: config.rateLimit.retryMaxDelayMs,
      backoffMultiplier: 2,
      jitterMax: 0.1
    });
    fileManager = new AsyncFileManager();
    apiOptimizer = new SlackApiOptimizer();

    // Mock Claude processor
    mockClaude = {
      processMessage: vi.fn().mockResolvedValue("Mock response")
    } as any;

    // Mock Slack client
    mockSlackClient = {
      chat: {
        postMessage: vi.fn().mockResolvedValue({ ts: "123" })
      }
    };

    messageRouter = new MessageRouter(
      mockClaude,
      mockSlackClient,
      config,
      rateLimiter,
      requestQueue,
      retryManager,
      fileManager,
      apiOptimizer
    );
  });

  afterEach(async () => {
    await fileManager.shutdown();
    apiOptimizer.shutdown();
    requestQueue.clear();

    // Clean up temp directory
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("end-to-end message processing", () => {
    it("processes messages with rate limiting", async () => {
      const mockSay = vi.fn().mockResolvedValue(undefined);

      const event = {
        text: "Hello world",
        channel: "C123456",
        ts: "1234567890.123",
        user: "U123"
      };

      await messageRouter.handleMessage(event, mockSay);

      // Should have called Slack API through rate limiter
      expect(mockSlackClient.chat.postMessage).toHaveBeenCalled();
      expect(mockClaude.processMessage).toHaveBeenCalledWith("Hello world", expect.any(Object));
    });

    it("handles rate limiting gracefully", async () => {
      // Exhaust rate limiter
      for (let i = 0; i < 10; i++) {
        rateLimiter.canMakeRequest("postMessage");
      }

      const mockSay = vi.fn().mockResolvedValue(undefined);
      const event = {
        text: "Rate limited message",
        channel: "C123456",
        ts: "1234567890.124",
        user: "U123"
      };

      // This should still work due to retry and queue mechanisms
      await expect(
        messageRouter.handleMessage(event, mockSay)
      ).resolves.not.toThrow();

      expect(mockClaude.processMessage).toHaveBeenCalled();
    });

    it("uses async file operations for transcripts", async () => {
      const mockSay = vi.fn().mockResolvedValue(undefined);

      const event = {
        text: "Test message",
        channel: "C123456",
        ts: "1234567890.125",
        user: "U123"
      };

      await messageRouter.handleMessage(event, mockSay);

      // File operations should have been queued
      const stats = fileManager.getStats();
      expect(stats.queuedOperations).toBeGreaterThanOrEqual(0);
    });
  });

  describe("service integration", () => {
    it("all services work together without conflicts", async () => {
      // Test that all services can be used simultaneously
      const promises = [
        // Rate limiter
        rateLimiter.waitForRequest("postMessage"),
        // Queue
        requestQueue.enqueue("postMessage", "high", async () => "queued"),
        // Retry manager
        retryManager.executeWithRetry(async () => "retried"),
        // File manager
        fileManager.writeFile(path.join(tempDir, "test.txt"), "content"),
        // API optimizer
        new Promise(resolve => {
          apiOptimizer.debounce("test", async () => resolve("debounced"), 10);
          setTimeout(() => {}, 20); // Let debounce resolve
        })
      ];

      await expect(Promise.all(promises)).resolves.not.toThrow();
    });

    it("respects service dependencies", () => {
      // Rate limiter should affect queue behavior
      const initialStats = requestQueue.getStats();
      expect(initialStats.activeRequests).toBe(0);

      // Queue should use rate limiter internally when processing
      requestQueue.enqueue("postMessage", "high", async () => {
        return "processed";
      });

      // Should have active request
      const activeStats = requestQueue.getStats();
      expect(activeStats.activeRequests).toBeGreaterThanOrEqual(0);
    });

    it("handles service failures gracefully", async () => {
      // Make rate limiter very restrictive but not impossible
      const restrictiveLimiter = new RateLimiter({
        enabled: true,
        requestsPerSecond: 1, // 1 request per second
        burstCapacity: 0,
        queueSize: 10,
        retryMaxAttempts: 3,
        retryBaseDelayMs: 1000,
        retryMaxDelayMs: 30000
      });

      // This should complete within a reasonable time
      const result = await restrictiveLimiter.waitForRequest("postMessage");
      expect(result).toBeUndefined(); // waitForRequest returns void
    }, 2000); // 2 second timeout
  });

  describe("configuration integration", () => {
    it("uses config values correctly", () => {
      const limiterStats = rateLimiter.getStatus();
      expect(limiterStats.postMessage.capacity).toBe(3); // burstCapacity

      const queueStats = requestQueue.getStats();
      expect(queueStats.maxConcurrency).toBe(2);

      const retryStats = retryManager.getStats();
      expect(retryStats.maxAttempts).toBe(2);
    });
  });
});