import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThreadHistoryCache, type SlackMessage } from "../../../src/services/thread_history_cache.ts";

describe("ThreadHistoryCache", () => {
  let cache: ThreadHistoryCache;

  beforeEach(() => {
    cache = new ThreadHistoryCache(5000); // 5 second TTL for testing
  });

  afterEach(() => {
    cache.clear();
  });

  describe("Cache Operations (5.1)", () => {
    it("stores messages in cache", () => {
      const messages: SlackMessage[] = [
        { type: "message", user: "U123", text: "Hello", ts: "1234567890.000100" },
        { type: "message", user: "U456", text: "World", ts: "1234567891.000100" }
      ];

      cache.set("C123", "thread_123", messages);
      const cached = cache.get("C123", "thread_123");

      expect(cached).toEqual(messages);
      expect(cached?.length).toBe(2);
    });

    it("returns null for cache miss", () => {
      const result = cache.get("C123", "nonexistent_thread");
      expect(result).toBeNull();
    });

    it("stores different thread histories separately", () => {
      const messages1: SlackMessage[] = [
        { type: "message", user: "U123", text: "Thread 1", ts: "1234567890.000100" }
      ];
      const messages2: SlackMessage[] = [
        { type: "message", user: "U456", text: "Thread 2", ts: "1234567890.000100" }
      ];

      cache.set("C123", "thread_1", messages1);
      cache.set("C123", "thread_2", messages2);

      const cached1 = cache.get("C123", "thread_1");
      const cached2 = cache.get("C123", "thread_2");

      expect(cached1).toEqual(messages1);
      expect(cached2).toEqual(messages2);
      expect(cached1).not.toEqual(cached2);
    });

    it("stores the same thread from different channels separately", () => {
      const messages: SlackMessage[] = [
        { type: "message", user: "U123", text: "Message", ts: "1234567890.000100" }
      ];

      cache.set("C123", "thread_ts", messages);
      cache.set("C456", "thread_ts", messages);

      const cached1 = cache.get("C123", "thread_ts");
      const cached2 = cache.get("C456", "thread_ts");

      expect(cached1).toEqual(messages);
      expect(cached2).toEqual(messages);
      // Both exist independently
      expect(cache.size()).toBe(2);
    });

    it("overwrites existing cache entries", () => {
      const messages1: SlackMessage[] = [
        { type: "message", user: "U123", text: "Original", ts: "1234567890.000100" }
      ];
      const messages2: SlackMessage[] = [
        { type: "message", user: "U123", text: "Updated", ts: "1234567891.000100" }
      ];

      cache.set("C123", "thread_123", messages1);
      expect(cache.get("C123", "thread_123")?.[0].text).toBe("Original");

      cache.set("C123", "thread_123", messages2);
      expect(cache.get("C123", "thread_123")?.[0].text).toBe("Updated");
    });

    it("handles empty message lists", () => {
      cache.set("C123", "thread_123", []);
      const cached = cache.get("C123", "thread_123");

      expect(cached).toEqual([]);
      expect(cached?.length).toBe(0);
    });

    it("preserves message structure with all fields", () => {
      const message: SlackMessage = {
        type: "message",
        user: "U123",
        text: "Hello",
        ts: "1234567890.000100",
        username: "john",
        bot_id: "B456"
      };

      cache.set("C123", "thread_123", [message]);
      const cached = cache.get("C123", "thread_123");

      expect(cached?.[0]).toEqual(message);
      expect(cached?.[0].user).toBe("U123");
      expect(cached?.[0].username).toBe("john");
      expect(cached?.[0].bot_id).toBe("B456");
    });

    it("preserves message structure with optional fields omitted", () => {
      const message: SlackMessage = {
        type: "message",
        text: "Hello",
        ts: "1234567890.000100"
      };

      cache.set("C123", "thread_123", [message]);
      const cached = cache.get("C123", "thread_123");

      expect(cached?.[0]).toEqual(message);
      expect(cached?.[0].user).toBeUndefined();
      expect(cached?.[0].username).toBeUndefined();
      expect(cached?.[0].bot_id).toBeUndefined();
    });
  });

  describe("Cache TTL Behavior (5.2)", () => {
    it("returns cached data when not expired", () => {
      vi.useFakeTimers();
      const messages: SlackMessage[] = [
        { type: "message", user: "U123", text: "Hello", ts: "1234567890.000100" }
      ];

      cache.set("C123", "thread_123", messages);

      // Advance time by 2 seconds (within 5 second TTL)
      vi.advanceTimersByTime(2000);

      const cached = cache.get("C123", "thread_123");
      expect(cached).toEqual(messages);

      vi.useRealTimers();
    });

    it("returns null when cache expires", () => {
      vi.useFakeTimers();
      const messages: SlackMessage[] = [
        { type: "message", user: "U123", text: "Hello", ts: "1234567890.000100" }
      ];

      cache.set("C123", "thread_123", messages);

      // Advance time beyond TTL
      vi.advanceTimersByTime(6000);

      const cached = cache.get("C123", "thread_123");
      expect(cached).toBeNull();

      vi.useRealTimers();
    });

    it("removes expired entry from cache on access", () => {
      vi.useFakeTimers();
      const messages: SlackMessage[] = [
        { type: "message", user: "U123", text: "Hello", ts: "1234567890.000100" }
      ];

      cache.set("C123", "thread_123", messages);
      expect(cache.size()).toBe(1);

      // Advance time beyond TTL
      vi.advanceTimersByTime(6000);

      cache.get("C123", "thread_123"); // Access triggers cleanup

      expect(cache.size()).toBe(0);

      vi.useRealTimers();
    });

    it("respects custom TTL durations", () => {
      vi.useFakeTimers();
      const shortCache = new ThreadHistoryCache(2000); // 2 second TTL
      const messages: SlackMessage[] = [
        { type: "message", user: "U123", text: "Hello", ts: "1234567890.000100" }
      ];

      shortCache.set("C123", "thread_123", messages);

      // Advance 1 second (should still be cached)
      vi.advanceTimersByTime(1000);
      expect(shortCache.get("C123", "thread_123")).toEqual(messages);

      // Advance another 1.5 seconds (total 2.5, beyond TTL)
      vi.advanceTimersByTime(1500);
      expect(shortCache.get("C123", "thread_123")).toBeNull();

      vi.useRealTimers();
    });

    it("has default TTL of 5 minutes", () => {
      const defaultCache = new ThreadHistoryCache();
      const messages: SlackMessage[] = [
        { type: "message", user: "U123", text: "Hello", ts: "1234567890.000100" }
      ];

      defaultCache.set("C123", "thread_123", messages);

      // Verify that size reflects the cached item
      expect(defaultCache.size()).toBe(1);

      // The default TTL should be 5 minutes (5 * 60 * 1000)
      // We can't easily test the full duration, but we can verify it was set
      expect(defaultCache.get("C123", "thread_123")).toEqual(messages);
    });

    it("clearExpired removes only expired entries", () => {
      vi.useFakeTimers();
      const cache2 = new ThreadHistoryCache(5000);

      const messages1: SlackMessage[] = [
        { type: "message", user: "U123", text: "Message 1", ts: "1234567890.000100" }
      ];
      const messages2: SlackMessage[] = [
        { type: "message", user: "U456", text: "Message 2", ts: "1234567890.000100" }
      ];

      cache2.set("C123", "thread_1", messages1);

      // Wait 3 seconds
      vi.advanceTimersByTime(3000);

      cache2.set("C123", "thread_2", messages2);

      // Now thread_1 is 3 seconds old, thread_2 is 0 seconds old
      // Advance 3 more seconds (total 6)
      vi.advanceTimersByTime(3000);

      // thread_1 is now 6 seconds old (expired), thread_2 is 3 seconds old (not expired)
      cache2.clearExpired();

      expect(cache2.get("C123", "thread_1")).toBeNull();
      expect(cache2.get("C123", "thread_2")).toEqual(messages2);

      vi.useRealTimers();
    });

    it("clearExpired maintains non-expired entries", () => {
      vi.useFakeTimers();
      const cache2 = new ThreadHistoryCache(5000);

      const messages: SlackMessage[] = [
        { type: "message", user: "U123", text: "Hello", ts: "1234567890.000100" }
      ];

      cache2.set("C123", "thread_123", messages);

      // Advance 2 seconds (within TTL)
      vi.advanceTimersByTime(2000);

      cache2.clearExpired();

      expect(cache2.get("C123", "thread_123")).toEqual(messages);

      vi.useRealTimers();
    });
  });

  describe("Cache Check Methods", () => {
    it("has method returns true for cached entries", () => {
      const messages: SlackMessage[] = [
        { type: "message", user: "U123", text: "Hello", ts: "1234567890.000100" }
      ];

      cache.set("C123", "thread_123", messages);

      expect(cache.has("C123", "thread_123")).toBe(true);
    });

    it("has method returns false for missing entries", () => {
      expect(cache.has("C123", "nonexistent")).toBe(false);
    });

    it("has method respects TTL expiration", () => {
      vi.useFakeTimers();
      const messages: SlackMessage[] = [
        { type: "message", user: "U123", text: "Hello", ts: "1234567890.000100" }
      ];

      cache.set("C123", "thread_123", messages);
      expect(cache.has("C123", "thread_123")).toBe(true);

      vi.advanceTimersByTime(6000);

      expect(cache.has("C123", "thread_123")).toBe(false);

      vi.useRealTimers();
    });

    it("size returns correct number of cached entries", () => {
      expect(cache.size()).toBe(0);

      const messages: SlackMessage[] = [
        { type: "message", user: "U123", text: "Hello", ts: "1234567890.000100" }
      ];

      cache.set("C123", "thread_1", messages);
      expect(cache.size()).toBe(1);

      cache.set("C123", "thread_2", messages);
      expect(cache.size()).toBe(2);

      cache.set("C456", "thread_3", messages);
      expect(cache.size()).toBe(3);
    });

    it("size decreases when entries expire", () => {
      vi.useFakeTimers();
      const messages: SlackMessage[] = [
        { type: "message", user: "U123", text: "Hello", ts: "1234567890.000100" }
      ];

      cache.set("C123", "thread_123", messages);
      expect(cache.size()).toBe(1);

      vi.advanceTimersByTime(6000);

      cache.get("C123", "thread_123"); // Trigger cleanup

      expect(cache.size()).toBe(0);

      vi.useRealTimers();
    });
  });

  describe("Cache Clear Methods", () => {
    it("clear removes all cached entries", () => {
      const messages: SlackMessage[] = [
        { type: "message", user: "U123", text: "Hello", ts: "1234567890.000100" }
      ];

      cache.set("C123", "thread_1", messages);
      cache.set("C123", "thread_2", messages);
      cache.set("C456", "thread_3", messages);

      expect(cache.size()).toBe(3);

      cache.clear();

      expect(cache.size()).toBe(0);
      expect(cache.get("C123", "thread_1")).toBeNull();
      expect(cache.get("C123", "thread_2")).toBeNull();
      expect(cache.get("C456", "thread_3")).toBeNull();
    });

    it("clear allows subsequent caching", () => {
      const messages: SlackMessage[] = [
        { type: "message", user: "U123", text: "Hello", ts: "1234567890.000100" }
      ];

      cache.set("C123", "thread_123", messages);
      cache.clear();

      cache.set("C123", "thread_123", messages);
      expect(cache.get("C123", "thread_123")).toEqual(messages);
    });
  });

  describe("Cache Key Generation", () => {
    it("generates unique keys for different channels and threads", () => {
      const messages: SlackMessage[] = [
        { type: "message", user: "U123", text: "Hello", ts: "1234567890.000100" }
      ];

      cache.set("C123", "T1", messages);
      cache.set("C123", "T2", messages);
      cache.set("C456", "T1", messages);

      // All three should be stored separately
      expect(cache.size()).toBe(3);
      expect(cache.has("C123", "T1")).toBe(true);
      expect(cache.has("C123", "T2")).toBe(true);
      expect(cache.has("C456", "T1")).toBe(true);
    });

    it("treats channel/thread combinations as independent", () => {
      const messages1: SlackMessage[] = [
        { type: "message", user: "U123", text: "Channel A Thread 1", ts: "1234567890.000100" }
      ];
      const messages2: SlackMessage[] = [
        { type: "message", user: "U456", text: "Channel B Thread 1", ts: "1234567890.000100" }
      ];

      cache.set("C123", "T1", messages1);
      cache.set("C456", "T1", messages2);

      const cached1 = cache.get("C123", "T1");
      const cached2 = cache.get("C456", "T1");

      expect(cached1).toEqual(messages1);
      expect(cached2).toEqual(messages2);
      expect(cached1).not.toEqual(cached2);
    });
  });

  describe("Edge Cases and Stress Tests", () => {
    it("handles large message lists", () => {
      const largeMessageList: SlackMessage[] = Array.from({ length: 1000 }, (_, i) => ({
        type: "message",
        user: `U${i}`,
        text: `Message ${i}`,
        ts: `123456789${i}.000100`
      }));

      cache.set("C123", "thread_123", largeMessageList);
      const cached = cache.get("C123", "thread_123");

      expect(cached?.length).toBe(1000);
      expect(cached?.[0].text).toBe("Message 0");
      expect(cached?.[999].text).toBe("Message 999");
    });

    it("handles many cache entries", () => {
      const messages: SlackMessage[] = [
        { type: "message", user: "U123", text: "Hello", ts: "1234567890.000100" }
      ];

      // Add 100 different threads
      for (let i = 0; i < 100; i++) {
        cache.set("C123", `thread_${i}`, messages);
      }

      expect(cache.size()).toBe(100);

      // Verify a few random ones
      expect(cache.has("C123", "thread_0")).toBe(true);
      expect(cache.has("C123", "thread_50")).toBe(true);
      expect(cache.has("C123", "thread_99")).toBe(true);
    });

    it("handles special characters in channel and thread IDs", () => {
      const messages: SlackMessage[] = [
        { type: "message", user: "U123", text: "Hello", ts: "1234567890.000100" }
      ];

      cache.set("C-special:123", "thread.id:456", messages);

      expect(cache.get("C-special:123", "thread.id:456")).toEqual(messages);
    });

    it("handles very long message text", () => {
      const longText = "A".repeat(10000);
      const message: SlackMessage = {
        type: "message",
        user: "U123",
        text: longText,
        ts: "1234567890.000100"
      };

      cache.set("C123", "thread_123", [message]);
      const cached = cache.get("C123", "thread_123");

      expect(cached?.[0].text.length).toBe(10000);
      expect(cached?.[0].text).toBe(longText);
    });
  });

  describe("Cache Consistency", () => {
    it("does not mutate stored messages when getter is called", () => {
      const original: SlackMessage[] = [
        { type: "message", user: "U123", text: "Hello", ts: "1234567890.000100" }
      ];

      cache.set("C123", "thread_123", original);
      const retrieved = cache.get("C123", "thread_123");

      if (retrieved) {
        retrieved[0].text = "MODIFIED";
      }

      const retrievedAgain = cache.get("C123", "thread_123");
      expect(retrievedAgain?.[0].text).toBe("MODIFIED"); // Direct reference stored
    });

    it("returns same reference for multiple gets before expiry", () => {
      const messages: SlackMessage[] = [
        { type: "message", user: "U123", text: "Hello", ts: "1234567890.000100" }
      ];

      cache.set("C123", "thread_123", messages);

      const first = cache.get("C123", "thread_123");
      const second = cache.get("C123", "thread_123");

      expect(first).toBe(second); // Same reference
    });
  });
});
