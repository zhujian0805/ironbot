import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessageRouter } from "../../src/services/message_router.js";
import { resolveConfig } from "../../src/config.js";

const createClaude = (response: string | Promise<string>) => ({
  processMessage: vi.fn().mockResolvedValue(response)
});

const createConfig = async () => {
  const dir = await mkdtemp(join(tmpdir(), "ironbot-router-"));
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

describe("MessageRouter", () => {
  it("posts a delayed thinking indicator and updates with the response", async () => {
    vi.useFakeTimers();
    const { dir, config } = await createConfig();
    const postMessage = vi.fn().mockResolvedValue({ ts: "123" });
    const update = vi.fn().mockResolvedValue(undefined);
    const slackClient = { chat: { postMessage, update } };
    const claude = createClaude("Hello!");
    const router = new MessageRouter(claude as unknown as { processMessage: (text: string) => Promise<string> }, slackClient, config);
    const say = vi.fn().mockResolvedValue(undefined);

    const handlePromise = router.handleMessage({ text: "hi", channel: "C1", ts: "111" }, say);
    await vi.advanceTimersByTimeAsync(1100);
    await handlePromise;

    expect(postMessage).toHaveBeenCalledWith({
      channel: "C1",
      text: expect.stringMatching(/(Putting it all together|Thinking it through|Working on that|Checking a few things|One moment while I prepare a response|Let me gather that for you)\.{1,3}$/) as unknown as string
    });
    expect(update).toHaveBeenCalledWith({ channel: "C1", ts: "123", text: "✅ Responded in thread." });
    expect(postMessage).toHaveBeenCalledWith({
      channel: "C1",
      text: "↪️ Hello!",
      thread_ts: "111",
      reply_broadcast: false
    });
    expect(say).not.toHaveBeenCalled();

    vi.useRealTimers();

    await rm(dir, { recursive: true, force: true });
  });

  it("falls back to say when no Slack client is provided", async () => {
    const { dir, config } = await createConfig();
    const claude = createClaude("Fallback");
    const router = new MessageRouter(claude as unknown as { processMessage: (text: string) => Promise<string> }, undefined, config);
    const say = vi.fn().mockResolvedValue(undefined);

    await router.handleMessage({ text: "hi", channel: "C1", ts: "111" }, say);

    expect(say).toHaveBeenCalledWith({ text: "↪️ Fallback", thread_ts: "111" });

    await rm(dir, { recursive: true, force: true });
  });

  it("skips messages sent by bots", async () => {
    const { dir, config } = await createConfig();
    const postMessage = vi.fn().mockResolvedValue({ ts: "123" });
    const update = vi.fn().mockResolvedValue(undefined);
    const slackClient = { chat: { postMessage, update } };
    const claude = createClaude("Ignored");
    const router = new MessageRouter(claude as unknown as { processMessage: (text: string) => Promise<string> }, slackClient, config);
    const say = vi.fn().mockResolvedValue(undefined);

    await router.handleMessage({ text: "hi", channel: "C1", bot_id: "B1" }, say);

    expect(claude.processMessage).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
    expect(say).not.toHaveBeenCalled();

    await rm(dir, { recursive: true, force: true });
  });

  it("handles processing errors and updates the thinking message", async () => {
    vi.useFakeTimers();
    const { dir, config } = await createConfig();
    const postMessage = vi.fn().mockResolvedValue({ ts: "777" });
    const update = vi.fn().mockResolvedValue(undefined);
    const slackClient = { chat: { postMessage, update } };
    const claude = {
      processMessage: vi.fn().mockRejectedValue(new Error("boom"))
    };
    const router = new MessageRouter(claude as unknown as { processMessage: (text: string) => Promise<string> }, slackClient, config);
    const say = vi.fn().mockResolvedValue(undefined);

    const handlePromise = router.handleMessage({ text: "hi", channel: "C1", ts: "111" }, say);
    await vi.advanceTimersByTimeAsync(1100);
    await handlePromise;

    expect(update).toHaveBeenCalledWith({
      channel: "C1",
      ts: "777",
      text: "↪️ :x: Sorry, I encountered an error processing your message."
    });
    expect(say).not.toHaveBeenCalled();

    vi.useRealTimers();

    await rm(dir, { recursive: true, force: true });
  });
});
