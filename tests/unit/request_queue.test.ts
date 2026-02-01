import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestQueue, type QueuePriority } from "../../src/services/request_queue.ts";

describe("RequestQueue", () => {
  let queue: RequestQueue;

  beforeEach(() => {
    queue = new RequestQueue(2, 10); // Max 2 concurrent, queue size 10
  });

  describe("enqueue", () => {
    it("executes requests immediately when under concurrency limit", async () => {
      const results: string[] = [];

      const promise1 = queue.enqueue("postMessage", "high", async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push("request1");
        return "result1";
      });

      const promise2 = queue.enqueue("postMessage", "high", async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push("request2");
        return "result2";
      });

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toBe("result1");
      expect(result2).toBe("result2");
      expect(results).toEqual(["request1", "request2"]);
    });

    it("queues requests when at concurrency limit", async () => {
      const results: string[] = [];
      const startTimes: number[] = [];

      // Start 2 concurrent requests
      const promise1 = queue.enqueue("postMessage", "high", async () => {
        startTimes.push(Date.now());
        await new Promise(resolve => setTimeout(resolve, 100));
        results.push("request1");
        return "result1";
      });

      const promise2 = queue.enqueue("postMessage", "high", async () => {
        startTimes.push(Date.now());
        await new Promise(resolve => setTimeout(resolve, 100));
        results.push("request2");
        return "result2";
      });

      // Third request should be queued
      const promise3 = queue.enqueue("postMessage", "high", async () => {
        startTimes.push(Date.now());
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push("request3");
        return "result3";
      });

      const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);

      expect(result1).toBe("result1");
      expect(result2).toBe("result2");
      expect(result3).toBe("result3");
      expect(results).toEqual(["request1", "request2", "request3"]);

      // Third request should start after the first two finish
      expect(startTimes[2]).toBeGreaterThan(startTimes[0] + 90);
      expect(startTimes[2]).toBeGreaterThan(startTimes[1] + 90);
    });

    it("respects priority ordering", async () => {
      const executionOrder: string[] = [];

      // Queue high priority request
      const highPromise = queue.enqueue("postMessage", "high", async () => {
        executionOrder.push("high");
        return "high";
      });

      // Queue medium priority request
      const mediumPromise = queue.enqueue("setStatus", "medium", async () => {
        executionOrder.push("medium");
        return "medium";
      });

      // Queue low priority request
      const lowPromise = queue.enqueue("general", "low", async () => {
        executionOrder.push("low");
        return "low";
      });

      await Promise.all([highPromise, mediumPromise, lowPromise]);

      expect(executionOrder).toEqual(["high", "medium", "low"]);
    });

    it("rejects when queue is full", async () => {
      const smallQueue = new RequestQueue(1, 1); // Max concurrency 1, queue size 1

      // Start a long-running request
      const longPromise = smallQueue.enqueue("postMessage", "high", async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return "ok";
      });

      // Wait a bit for the first request to start processing
      await new Promise(resolve => setTimeout(resolve, 10));

      // This should be queued (queue size 1 allows 1 queued request beyond active)
      const queuedPromise = smallQueue.enqueue("postMessage", "high", async () => {
        return "queued";
      });

      // Wait a bit more
      await new Promise(resolve => setTimeout(resolve, 10));

      // This should be rejected (queue is now full)
      await expect(
        smallQueue.enqueue("postMessage", "high", async () => "should fail")
      ).rejects.toThrow("Request queue is full");

      // Wait for queued request to complete
      await queuedPromise;
      expect(await queuedPromise).toBe("queued");
    });
  });

  describe("circuit breaker", () => {
  describe("circuit breaker", () => {
    it("opens circuit after repeated failures", async () => {
      const testQueue = new RequestQueue(1, 10);
      // Temporarily reduce circuit breaker timeout for testing
      (testQueue as any).circuitBreakerTimeout = 1000; // 1 second
      (testQueue as any).circuitBreakerThreshold = 3; // Lower threshold

      const results: string[] = [];

      // Cause 3 failures (threshold)
      for (let i = 0; i < 3; i++) {
        try {
          await testQueue.enqueue("postMessage", "high", async () => {
            throw new Error("Simulated failure");
          });
        } catch (error) {
          results.push("failed");
        }
      }

      // Circuit should be open, this request should be rejected immediately
      const startTime = Date.now();
      await expect(
        testQueue.enqueue("postMessage", "high", async () => "should be rejected")
      ).rejects.toThrow("Circuit breaker is open");

      // Should be rejected immediately, not delayed
      expect(Date.now() - startTime).toBeLessThan(10); // Should be nearly instant
    }, 10000); // 10 second timeout for this test
  });
  });

  describe("getStats", () => {
    it("returns correct statistics", async () => {
      const stats = queue.getStats();

      expect(stats.activeRequests).toBe(0);
      expect(stats.maxConcurrency).toBe(2);
      expect(stats.circuitBreaker.isOpen).toBe(false);
      expect(stats.circuitBreaker.failures).toBe(0);

      // Add some requests
      const promise1 = queue.enqueue("postMessage", "high", async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return "done";
      });

      const promise2 = queue.enqueue("setStatus", "medium", async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return "done";
      });

      // Check stats while requests are active
      const activeStats = queue.getStats();
      expect(activeStats.activeRequests).toBeGreaterThan(0);
      expect(activeStats.queued.high).toBeGreaterThanOrEqual(0);
      expect(activeStats.queued.medium).toBeGreaterThanOrEqual(0);

      await Promise.all([promise1, promise2]);
    });
  });

  describe("clear", () => {
    it("clears all queued requests", async () => {
      const testQueue = new RequestQueue(1, 10); // Only 1 concurrent

      // Start one request that will run for a while
      const activePromise = testQueue.enqueue("postMessage", "high", async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return "active";
      });

      // Queue several more requests
      const queuedPromises: Promise<any>[] = [];
      for (let i = 0; i < 3; i++) {
        queuedPromises.push(
          testQueue.enqueue("postMessage", "high", async () => {
            return `queued${i}`;
          })
        );
      }

      // Wait for the active request to start
      await new Promise(resolve => setTimeout(resolve, 10));

      // Clear the queue - this should reject queued requests
      testQueue.clear();

      // The active request should complete normally
      expect(await activePromise).toBe("active");

      // All queued requests should be rejected
      for (const promise of queuedPromises) {
        await expect(promise).rejects.toThrow("Request queue cleared");
      }
    });
  });

  describe("getPriorityForMethod", () => {
    it("returns correct priorities for API methods", () => {
      expect(RequestQueue.getPriorityForMethod("postMessage")).toBe("high");
      expect(RequestQueue.getPriorityForMethod("setStatus")).toBe("medium");
      expect(RequestQueue.getPriorityForMethod("update")).toBe("high");
      expect(RequestQueue.getPriorityForMethod("general")).toBe("low");
    });
  });
});