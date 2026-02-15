import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessageRouter } from "../../../src/services/message_router.ts";
import { resolveConfig } from "../../../src/config.ts";

const createClaude = (response: string | Promise<string>) => ({
  processMessage: vi.fn().mockResolvedValue(response),
  clearMemoryForSession: vi.fn().mockResolvedValue(undefined),
  clearAllMemory: vi.fn().mockResolvedValue(undefined)
});

const createConfig = async () => {
  const dir = await mkdtemp(join(tmpdir(), "ironbot-thread-"));
  const base = resolveConfig();
  const config = {
    ...base,
    sessions: {
      ...base.sessions,
      storePath: join(dir, "sessions.json"),
      transcriptsDir: join(dir, "transcripts")
    }
  };
  return { dir, config };
};

describe("MessageRouter Thread History Integration (5.5)", () => {
  describe("getThreadHistory with Cache (5.4)", () => {
    it("fetches thread history from Slack API when not cached", async () => {
      const { dir, config } = await createConfig();
      const replies = vi.fn().mockResolvedValue({
        messages: [
          { type: "message", user: "U123", text: "First message", ts: "1234567890.000100" },
          { type: "message", user: "U456", text: "Second message", ts: "1234567891.000100" }
        ]
      });
      const slackClient = {
        conversations: { replies },
        chat: { postMessage: vi.fn().mockResolvedValue({ ts: "123" }) }
      };
      const claude = createClaude("Response");
      const router = new MessageRouter(claude as unknown as { processMessage: () => Promise<string> }, slackClient, config);
      const say = vi.fn().mockResolvedValue(undefined);

      await router.handleMessage(
        { text: "reply", channel: "C123", ts: "112", thread_ts: "111", user: "U1" },
        say
      );

      expect(replies).toHaveBeenCalledWith({
        channel: "C123",
        ts: "111",
        limit: config.slackThreadContextLimit
      });

      await rm(dir, { recursive: true, force: true });
    });

    it("returns empty list when Slack client is unavailable", async () => {
      const { dir, config } = await createConfig();
      const claude = createClaude("Response");
      const router = new MessageRouter(claude as unknown as { processMessage: () => Promise<string> }, undefined, config);
      const say = vi.fn().mockResolvedValue(undefined);

      // Should not throw when handleMessage is called without slackClient
      await router.handleMessage(
        { text: "reply", channel: "C123", ts: "112", thread_ts: "111", user: "U1" },
        say
      );

      expect(say).toHaveBeenCalled();

      await rm(dir, { recursive: true, force: true });
    });

    it("handles Slack API errors gracefully", async () => {
      const { dir, config } = await createConfig();
      const replies = vi.fn().mockRejectedValue(new Error("Slack API error"));
      const postMessage = vi.fn().mockResolvedValue({ ts: "456" });
      const slackClient = {
        conversations: { replies },
        chat: { postMessage }
      };
      const claude = createClaude("Response");
      const router = new MessageRouter(claude as unknown as { processMessage: () => Promise<string> }, slackClient, config);
      const say = vi.fn().mockResolvedValue(undefined);

      // Should not throw when API fails
      await router.handleMessage(
        { text: "reply", channel: "C123", ts: "112", thread_ts: "111", user: "U1" },
        say
      );

      // Should still process the message and post a response
      expect(claude.processMessage).toHaveBeenCalled();
      // When postMessage is available and slackClient exists, it uses postMessage instead of say
      expect(postMessage).toHaveBeenCalled();

      await rm(dir, { recursive: true, force: true });
    });

    it("passes thread history to agent processor", async () => {
      const { dir, config } = await createConfig();
      const replies = vi.fn().mockResolvedValue({
        messages: [
          { type: "message", user: "U123", text: "First message", ts: "1234567890.000100" },
          { type: "message", user: "U456", text: "Second message", ts: "1234567891.000100" }
        ]
      });
      const slackClient = { conversations: { replies }, chat: { postMessage: vi.fn().mockResolvedValue({ ts: "123" }) } };
      const claude = createClaude("Response");
      const router = new MessageRouter(claude as unknown as { processMessage: () => Promise<string> }, slackClient, config);
      const say = vi.fn().mockResolvedValue(undefined);

      await router.handleMessage(
        { text: "reply", channel: "C123", ts: "112", thread_ts: "111", user: "U1" },
        say
      );

      expect(claude.processMessage).toHaveBeenCalled();

      const callArgs = (claude.processMessage as any).mock.calls[0];
      expect(callArgs[1]).toHaveProperty("threadHistory");
      expect(callArgs[1].threadHistory).toBeInstanceOf(Array);
      expect(callArgs[1].threadHistory.length).toBe(2);

      await rm(dir, { recursive: true, force: true });
    });

    it("does not fetch thread history for non-thread messages", async () => {
      const { dir, config } = await createConfig();
      const replies = vi.fn();
      const slackClient = { conversations: { replies }, chat: { postMessage: vi.fn().mockResolvedValue({ ts: "123" }) } };
      const claude = createClaude("Response");
      const router = new MessageRouter(claude as unknown as { processMessage: () => Promise<string> }, slackClient, config);
      const say = vi.fn().mockResolvedValue(undefined);

      await router.handleMessage(
        { text: "message in channel", channel: "C123", ts: "111", user: "U1" },
        say
      );

      expect(replies).not.toHaveBeenCalled();

      await rm(dir, { recursive: true, force: true });
    });

    it("passes empty thread history when API returns no messages", async () => {
      const { dir, config } = await createConfig();
      const replies = vi.fn().mockResolvedValue({ messages: undefined });
      const slackClient = { conversations: { replies }, chat: { postMessage: vi.fn().mockResolvedValue({ ts: "123" }) } };
      const claude = createClaude("Response");
      const router = new MessageRouter(claude as unknown as { processMessage: () => Promise<string> }, slackClient, config);
      const say = vi.fn().mockResolvedValue(undefined);

      await router.handleMessage(
        { text: "reply", channel: "C123", ts: "112", thread_ts: "111", user: "U1" },
        say
      );

      const callArgs = (claude.processMessage as any).mock.calls[0];
      expect(callArgs[1].threadHistory).toEqual([]);

      await rm(dir, { recursive: true, force: true });
    });

    it("respects slackThreadContextLimit configuration", async () => {
      const { dir, config } = await createConfig();
      config.slackThreadContextLimit = 50;

      const replies = vi.fn().mockResolvedValue({
        messages: Array.from({ length: 50 }, (_, i) => ({
          type: "message",
          user: `U${i}`,
          text: `Message ${i}`,
          ts: `123456789${i}.000100`
        }))
      });
      const slackClient = { conversations: { replies }, chat: { postMessage: vi.fn().mockResolvedValue({ ts: "123" }) } };
      const claude = createClaude("Response");
      const router = new MessageRouter(claude as unknown as { processMessage: () => Promise<string> }, slackClient, config);
      const say = vi.fn().mockResolvedValue(undefined);

      await router.handleMessage(
        { text: "reply", channel: "C123", ts: "112", thread_ts: "111", user: "U1" },
        say
      );

      expect(replies).toHaveBeenCalledWith({
        channel: "C123",
        ts: "111",
        limit: 50
      });

      await rm(dir, { recursive: true, force: true });
    });
  });

  describe("Thread History Caching (5.2-5.3)", () => {
    it("caches thread history to avoid redundant API calls", async () => {
      const { dir, config } = await createConfig();
      const replies = vi.fn().mockResolvedValue({
        messages: [
          { type: "message", user: "U123", text: "Message", ts: "1234567890.000100" }
        ]
      });
      const slackClient = { conversations: { replies }, chat: { postMessage: vi.fn().mockResolvedValue({ ts: "123" }) } };
      const claude = createClaude("Response");
      const router = new MessageRouter(claude as unknown as { processMessage: () => Promise<string> }, slackClient, config);
      const say = vi.fn().mockResolvedValue(undefined);

      // First thread message
      await router.handleMessage(
        { text: "reply 1", channel: "C123", ts: "112", thread_ts: "111", user: "U1" },
        say
      );

      // Second thread message (same thread)
      await router.handleMessage(
        { text: "reply 2", channel: "C123", ts: "113", thread_ts: "111", user: "U1" },
        say
      );

      // API should only be called once due to caching
      expect(replies).toHaveBeenCalledTimes(1);

      await rm(dir, { recursive: true, force: true });
    });

    it("caches different threads separately", async () => {
      const { dir, config } = await createConfig();
      const replies = vi.fn()
        .mockResolvedValueOnce({
          messages: [
            { type: "message", user: "U123", text: "Thread 1", ts: "1234567890.000100" }
          ]
        })
        .mockResolvedValueOnce({
          messages: [
            { type: "message", user: "U456", text: "Thread 2", ts: "1234567891.000100" }
          ]
        });
      const slackClient = { conversations: { replies }, chat: { postMessage: vi.fn().mockResolvedValue({ ts: "123" }) } };
      const claude = createClaude("Response");
      const router = new MessageRouter(claude as unknown as { processMessage: () => Promise<string> }, slackClient, config);
      const say = vi.fn().mockResolvedValue(undefined);

      // First thread
      await router.handleMessage(
        { text: "reply", channel: "C123", ts: "112", thread_ts: "111", user: "U1" },
        say
      );

      // Different thread
      await router.handleMessage(
        { text: "reply", channel: "C123", ts: "113", thread_ts: "222", user: "U1" },
        say
      );

      // Should be called twice for different threads
      expect(replies).toHaveBeenCalledTimes(2);

      await rm(dir, { recursive: true, force: true });
    });

    it("caches threads per channel independently", async () => {
      const { dir, config } = await createConfig();
      const replies = vi.fn()
        .mockResolvedValueOnce({
          messages: [
            { type: "message", user: "U123", text: "Channel A", ts: "1234567890.000100" }
          ]
        })
        .mockResolvedValueOnce({
          messages: [
            { type: "message", user: "U456", text: "Channel B", ts: "1234567891.000100" }
          ]
        });
      const slackClient = { conversations: { replies }, chat: { postMessage: vi.fn().mockResolvedValue({ ts: "123" }) } };
      const claude = createClaude("Response");
      const router = new MessageRouter(claude as unknown as { processMessage: () => Promise<string> }, slackClient, config);
      const say = vi.fn().mockResolvedValue(undefined);

      // Same thread TS, different channels
      await router.handleMessage(
        { text: "reply", channel: "C123", ts: "112", thread_ts: "111", user: "U1" },
        say
      );

      await router.handleMessage(
        { text: "reply", channel: "C456", ts: "113", thread_ts: "111", user: "U1" },
        say
      );

      // Should be called twice (different channels)
      expect(replies).toHaveBeenCalledTimes(2);

      await rm(dir, { recursive: true, force: true });
    });
  });

  describe("Thread vs Non-Thread Messages (5.5)", () => {
    it("differentiates between thread and non-thread messages", async () => {
      const { dir, config } = await createConfig();
      const replies = vi.fn();
      const slackClient = { conversations: { replies }, chat: { postMessage: vi.fn().mockResolvedValue({ ts: "123" }) } };
      const claude = createClaude("Response");
      const router = new MessageRouter(claude as unknown as { processMessage: (text: string, opts: any) => Promise<string> }, slackClient, config);
      const say = vi.fn().mockResolvedValue(undefined);

      // Non-thread message
      await router.handleMessage(
        { text: "channel message", channel: "C123", ts: "111", user: "U1" },
        say
      );

      // Thread message
      await router.handleMessage(
        { text: "thread reply", channel: "C123", ts: "112", thread_ts: "111", user: "U1" },
        say
      );

      // Only thread message should trigger API call
      expect(replies).toHaveBeenCalledTimes(1);

      await rm(dir, { recursive: true, force: true });
    });

    it("uses different session keys for thread vs non-thread messages", async () => {
      const { dir, config } = await createConfig();
      const replies = vi.fn().mockResolvedValue({
        messages: [
          { type: "message", user: "U123", text: "Message", ts: "1234567890.000100" }
        ]
      });
      const slackClient = { conversations: { replies }, chat: { postMessage: vi.fn().mockResolvedValue({ ts: "123" }) } };
      const claude = createClaude("Response");
      const router = new MessageRouter(claude as unknown as { processMessage: (text: string, opts: any) => Promise<string> }, slackClient, config);
      const say = vi.fn().mockResolvedValue(undefined);

      // Root message
      await router.handleMessage(
        { text: "root", channel: "C1", ts: "111", user: "U1" },
        say
      );

      // Thread reply
      await router.handleMessage(
        { text: "reply", channel: "C1", ts: "112", thread_ts: "111", user: "U1" },
        say
      );

      const calls = (claude.processMessage as any).mock.calls;
      const rootSessionKey = calls[0][1]?.sessionKey;
      const threadSessionKey = calls[1][1]?.sessionKey;

      expect(rootSessionKey).not.toEqual(threadSessionKey);
      expect(threadSessionKey).toContain("thread");

      await rm(dir, { recursive: true, force: true });
    });

    it("provides thread history only for thread messages", async () => {
      const { dir, config } = await createConfig();
      const replies = vi.fn().mockResolvedValue({
        messages: [
          { type: "message", user: "U123", text: "Message", ts: "1234567890.000100" }
        ]
      });
      const slackClient = { conversations: { replies }, chat: { postMessage: vi.fn().mockResolvedValue({ ts: "123" }) } };
      const claude = createClaude("Response");
      const router = new MessageRouter(claude as unknown as { processMessage: (text: string, opts: any) => Promise<string> }, slackClient, config);
      const say = vi.fn().mockResolvedValue(undefined);

      // Non-thread message
      await router.handleMessage(
        { text: "channel message", channel: "C1", ts: "111", user: "U1" },
        say
      );

      const rootCallArgs = (claude.processMessage as any).mock.calls[0];
      expect(rootCallArgs[1].threadHistory).toEqual([]);

      await rm(dir, { recursive: true, force: true });
    });
  });

  describe("Thread Context Formatting (5.3)", () => {
    it("correctly formats single-user thread context", async () => {
      const { dir, config } = await createConfig();
      const replies = vi.fn().mockResolvedValue({
        messages: [
          { type: "message", user: "U123", text: "First message", ts: "1234567890.000100" },
          { type: "message", user: "U123", text: "Second message", ts: "1234567891.000100" }
        ]
      });
      const slackClient = { conversations: { replies }, chat: { postMessage: vi.fn().mockResolvedValue({ ts: "123" }) } };
      const claude = createClaude("Response");
      const router = new MessageRouter(claude as unknown as { processMessage: () => Promise<string> }, slackClient, config);
      const say = vi.fn().mockResolvedValue(undefined);

      await router.handleMessage(
        { text: "reply", channel: "C123", ts: "112", thread_ts: "111", user: "U1" },
        say
      );

      const callArgs = (claude.processMessage as any).mock.calls[0];
      expect(callArgs[1].threadHistory).toHaveLength(2);

      await rm(dir, { recursive: true, force: true });
    });

    it("correctly formats multi-user thread context", async () => {
      const { dir, config } = await createConfig();
      const replies = vi.fn().mockResolvedValue({
        messages: [
          { type: "message", user: "U123", text: "User A says", ts: "1234567890.000100" },
          { type: "message", user: "U456", text: "User B replies", ts: "1234567891.000100" },
          { type: "message", user: "U123", text: "User A responds", ts: "1234567892.000100" }
        ]
      });
      const slackClient = { conversations: { replies }, chat: { postMessage: vi.fn().mockResolvedValue({ ts: "123" }) } };
      const claude = createClaude("Response");
      const router = new MessageRouter(claude as unknown as { processMessage: () => Promise<string> }, slackClient, config);
      const say = vi.fn().mockResolvedValue(undefined);

      await router.handleMessage(
        { text: "reply", channel: "C123", ts: "113", thread_ts: "111", user: "U1" },
        say
      );

      const callArgs = (claude.processMessage as any).mock.calls[0];
      const threadHistory = callArgs[1].threadHistory;

      expect(threadHistory).toHaveLength(3);
      expect(threadHistory[0].user).toBe("U123");
      expect(threadHistory[1].user).toBe("U456");
      expect(threadHistory[2].user).toBe("U123");

      await rm(dir, { recursive: true, force: true });
    });

    it("preserves message text in thread context", async () => {
      const { dir, config } = await createConfig();
      const replies = vi.fn().mockResolvedValue({
        messages: [
          { type: "message", user: "U123", text: "What is the weather?", ts: "1234567890.000100" },
          { type: "message", user: "U456", text: "It's sunny today", ts: "1234567891.000100" }
        ]
      });
      const slackClient = { conversations: { replies }, chat: { postMessage: vi.fn().mockResolvedValue({ ts: "123" }) } };
      const claude = createClaude("Response");
      const router = new MessageRouter(claude as unknown as { processMessage: () => Promise<string> }, slackClient, config);
      const say = vi.fn().mockResolvedValue(undefined);

      await router.handleMessage(
        { text: "Is it cold?", channel: "C123", ts: "112", thread_ts: "111", user: "U1" },
        say
      );

      const callArgs = (claude.processMessage as any).mock.calls[0];
      const threadHistory = callArgs[1].threadHistory;

      expect(threadHistory[0].text).toBe("What is the weather?");
      expect(threadHistory[1].text).toBe("It's sunny today");

      await rm(dir, { recursive: true, force: true });
    });

    it("handles messages with missing text field", async () => {
      const { dir, config } = await createConfig();
      const replies = vi.fn().mockResolvedValue({
        messages: [
          { type: "message", user: "U123", text: "Normal message", ts: "1234567890.000100" },
          { type: "message", user: "U456", ts: "1234567891.000100" } // No text field
        ]
      });
      const slackClient = { conversations: { replies }, chat: { postMessage: vi.fn().mockResolvedValue({ ts: "123" }) } };
      const claude = createClaude("Response");
      const router = new MessageRouter(claude as unknown as { processMessage: () => Promise<string> }, slackClient, config);
      const say = vi.fn().mockResolvedValue(undefined);

      await router.handleMessage(
        { text: "reply", channel: "C123", ts: "112", thread_ts: "111", user: "U1" },
        say
      );

      const callArgs = (claude.processMessage as any).mock.calls[0];
      const threadHistory = callArgs[1].threadHistory;

      expect(threadHistory).toHaveLength(2);
      expect(threadHistory[0].text).toBe("Normal message");
      expect(threadHistory[1].text).toBeUndefined();

      await rm(dir, { recursive: true, force: true });
    });

    it("handles bot messages in thread context", async () => {
      const { dir, config } = await createConfig();
      const replies = vi.fn().mockResolvedValue({
        messages: [
          { type: "message", user: "U123", text: "User message", ts: "1234567890.000100" },
          { type: "message", username: "botname", bot_id: "B456", text: "Bot reply", ts: "1234567891.000100" }
        ]
      });
      const slackClient = { conversations: { replies }, chat: { postMessage: vi.fn().mockResolvedValue({ ts: "123" }) } };
      const claude = createClaude("Response");
      const router = new MessageRouter(claude as unknown as { processMessage: () => Promise<string> }, slackClient, config);
      const say = vi.fn().mockResolvedValue(undefined);

      await router.handleMessage(
        { text: "reply", channel: "C123", ts: "112", thread_ts: "111", user: "U1" },
        say
      );

      const callArgs = (claude.processMessage as any).mock.calls[0];
      const threadHistory = callArgs[1].threadHistory;

      expect(threadHistory).toHaveLength(2);
      expect(threadHistory[1].bot_id).toBe("B456");
      expect(threadHistory[1].username).toBe("botname");

      await rm(dir, { recursive: true, force: true });
    });

    it("handles various message types in thread context", async () => {
      const { dir, config } = await createConfig();
      const replies = vi.fn().mockResolvedValue({
        messages: [
          { type: "message", user: "U123", text: "Text message", ts: "1234567890.000100" },
          { type: "file_share", user: "U456", text: "File shared", ts: "1234567891.000100" },
          { type: "message", user: "U789", text: "Another message", ts: "1234567892.000100" }
        ]
      });
      const slackClient = { conversations: { replies }, chat: { postMessage: vi.fn().mockResolvedValue({ ts: "123" }) } };
      const claude = createClaude("Response");
      const router = new MessageRouter(claude as unknown as { processMessage: () => Promise<string> }, slackClient, config);
      const say = vi.fn().mockResolvedValue(undefined);

      await router.handleMessage(
        { text: "reply", channel: "C123", ts: "112", thread_ts: "111", user: "U1" },
        say
      );

      const callArgs = (claude.processMessage as any).mock.calls[0];
      const threadHistory = callArgs[1].threadHistory;

      expect(threadHistory).toHaveLength(3);
      expect(threadHistory[0].type).toBe("message");
      expect(threadHistory[1].type).toBe("file_share");
      expect(threadHistory[2].type).toBe("message");

      await rm(dir, { recursive: true, force: true });
    });
  });

  describe("Error Handling and Edge Cases", () => {
    it("handles network timeouts gracefully", async () => {
      const { dir, config } = await createConfig();
      const replies = vi.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error("Timeout")), 10);
        });
      });
      const slackClient = { conversations: { replies }, chat: { postMessage: vi.fn().mockResolvedValue({ ts: "123" }) } };
      const claude = createClaude("Response");
      const router = new MessageRouter(claude as unknown as { processMessage: () => Promise<string> }, slackClient, config);
      const say = vi.fn().mockResolvedValue(undefined);

      await router.handleMessage(
        { text: "reply", channel: "C123", ts: "112", thread_ts: "111", user: "U1" },
        say
      );

      // Should complete without throwing
      expect(claude.processMessage).toHaveBeenCalled();

      await rm(dir, { recursive: true, force: true });
    });

    it("handles missing conversations.replies method", async () => {
      const { dir, config } = await createConfig();
      const postMessage = vi.fn().mockResolvedValue({ ts: "456" });
      const slackClient = {
        conversations: {},
        chat: { postMessage }
      };
      const claude = createClaude("Response");
      const router = new MessageRouter(claude as unknown as { processMessage: () => Promise<string> }, slackClient, config);
      const say = vi.fn().mockResolvedValue(undefined);

      await router.handleMessage(
        { text: "reply", channel: "C123", ts: "112", thread_ts: "111", user: "U1" },
        say
      );

      // Should still process the message and post response
      expect(claude.processMessage).toHaveBeenCalled();
      // When postMessage is available, it uses that instead of say
      expect(postMessage).toHaveBeenCalled();

      await rm(dir, { recursive: true, force: true });
    });

    it("handles thread_ts with special characters", async () => {
      const { dir, config } = await createConfig();
      const replies = vi.fn().mockResolvedValue({
        messages: [
          { type: "message", user: "U123", text: "Message", ts: "1234567890.000100" }
        ]
      });
      const slackClient = { conversations: { replies }, chat: { postMessage: vi.fn().mockResolvedValue({ ts: "123" }) } };
      const claude = createClaude("Response");
      const router = new MessageRouter(claude as unknown as { processMessage: () => Promise<string> }, slackClient, config);
      const say = vi.fn().mockResolvedValue(undefined);

      await router.handleMessage(
        { text: "reply", channel: "C123", ts: "112", thread_ts: "1234567890.000100", user: "U1" },
        say
      );

      expect(replies).toHaveBeenCalledWith({
        channel: "C123",
        ts: "1234567890.000100",
        limit: config.slackThreadContextLimit
      });

      await rm(dir, { recursive: true, force: true });
    });

    it("handles very large thread history", async () => {
      const { dir, config } = await createConfig();
      const largeHistory = Array.from({ length: 500 }, (_, i) => ({
        type: "message",
        user: `U${i % 10}`,
        text: `Message ${i}`,
        ts: `123456789${i}.000100`
      }));

      const replies = vi.fn().mockResolvedValue({
        messages: largeHistory
      });
      const slackClient = { conversations: { replies }, chat: { postMessage: vi.fn().mockResolvedValue({ ts: "123" }) } };
      const claude = createClaude("Response");
      const router = new MessageRouter(claude as unknown as { processMessage: () => Promise<string> }, slackClient, config);
      const say = vi.fn().mockResolvedValue(undefined);

      await router.handleMessage(
        { text: "reply", channel: "C123", ts: "112", thread_ts: "111", user: "U1" },
        say
      );

      const callArgs = (claude.processMessage as any).mock.calls[0];
      expect(callArgs[1].threadHistory).toHaveLength(500);

      await rm(dir, { recursive: true, force: true });
    });
  });

  describe("Cache Expiration Behavior", () => {
    it("re-fetches thread history after cache expiration", async () => {
      vi.useFakeTimers();

      const { dir, config } = await createConfig();
      const replies = vi.fn().mockResolvedValue({
        messages: [
          { type: "message", user: "U123", text: "Message", ts: "1234567890.000100" }
        ]
      });
      const slackClient = { conversations: { replies }, chat: { postMessage: vi.fn().mockResolvedValue({ ts: "123" }) } };
      const claude = createClaude("Response");
      const router = new MessageRouter(claude as unknown as { processMessage: () => Promise<string> }, slackClient, config);
      const say = vi.fn().mockResolvedValue(undefined);

      // First call - fetches from API
      await router.handleMessage(
        { text: "reply 1", channel: "C123", ts: "112", thread_ts: "111", user: "U1" },
        say
      );

      expect(replies).toHaveBeenCalledTimes(1);

      // Wait for cache to expire (5 minutes + 1ms)
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      // Second call - should fetch from API again
      await router.handleMessage(
        { text: "reply 2", channel: "C123", ts: "113", thread_ts: "111", user: "U1" },
        say
      );

      expect(replies).toHaveBeenCalledTimes(2);

      vi.useRealTimers();

      await rm(dir, { recursive: true, force: true });
    });
  });
});
