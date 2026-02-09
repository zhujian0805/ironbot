import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessageRouter } from "../../src/services/message_router.ts";
import { resolveConfig } from "../../src/config.ts";

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
      text: "↪️ Hello!",
      thread_ts: "111",
      reply_broadcast: false,
      mrkdwn: true
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

    expect(postMessage).toHaveBeenCalledWith({
      channel: "C1",
      text: "↪️ Sorry, I had trouble understanding that request. Please try again.",
      thread_ts: "111",
      reply_broadcast: false,
      mrkdwn: true
    });
    expect(say).not.toHaveBeenCalled();

    vi.useRealTimers();

    await rm(dir, { recursive: true, force: true });
  });

  it("handles /clear slash command", async () => {
    const { dir, config } = await createConfig();
    const postMessage = vi.fn().mockResolvedValue({ ts: "123" });
    const slackClient = { chat: { postMessage } };
    const claude = createClaude("Response");
    const router = new MessageRouter(claude as unknown as { processMessage: (text: string) => Promise<string> }, slackClient, config);

    const ack = vi.fn().mockResolvedValue(undefined);
    const respond = vi.fn().mockResolvedValue(undefined);

    const command = {
      command: "/clear",
      text: "",
      channel_id: "C123",
      user_id: "U456",
      trigger_id: "trigger123"
    };

    await router.handleSlashCommand(command, ack, respond);

    expect(ack).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledWith({
      text: "🧹 Clearing conversation history and disabling cross-session memory! Memory is now per-thread.",
      response_type: "ephemeral"
    });
    expect(respond).toHaveBeenCalledWith("🧹 <@U456> has cleared the conversation history and disabled cross-session memory. Memory is now per-thread!");

    await rm(dir, { recursive: true, force: true });
  });

  it("handles /remember command", async () => {
    const { dir, config } = await createConfig();
    const postMessage = vi.fn().mockResolvedValue({ ts: "123" });
    const slackClient = { chat: { postMessage } };
    const claude = createClaude("Response");
    const router = new MessageRouter(claude as unknown as { processMessage: (text: string) => Promise<string> }, slackClient, config);

    const ack = vi.fn().mockResolvedValue(undefined);
    const respond = vi.fn().mockResolvedValue(undefined);

    const command = {
      command: "/remember",
      text: "",
      channel_id: "C123",
      user_id: "U456",
      trigger_id: "trigger123"
    };

    await router.handleSlashCommand(command, ack, respond);

    expect(ack).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledWith({
      text: "🧠 Global cross-session memory enabled! I will now remember all historical conversations across all channels and threads.",
      response_type: "ephemeral"
    });
    expect(respond).toHaveBeenCalledWith("🧠 <@U456> has enabled global cross-session memory. I will now remember all historical conversations across all channels and threads!");

    await rm(dir, { recursive: true, force: true });
  });

  it("handles /forget_all command", async () => {
    const { dir, config } = await createConfig();
    const postMessage = vi.fn().mockResolvedValue({ ts: "123" });
    const slackClient = { chat: { postMessage } };
    const claude = {
      processMessage: vi.fn().mockResolvedValue("Response"),
      clearAllMemory: vi.fn().mockResolvedValue(undefined)
    };
    const router = new MessageRouter(claude as unknown as { processMessage: (text: string) => Promise<string> }, slackClient, config);

    const ack = vi.fn().mockResolvedValue(undefined);
    const respond = vi.fn().mockResolvedValue(undefined);

    const command = {
      command: "/forget_all",
      text: "",
      channel_id: "C123",
      user_id: "U456",
      trigger_id: "trigger123"
    };

    await router.handleSlashCommand(command, ack, respond);

    expect(ack).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledWith({
      text: "🗑️ All conversation history and memory have been permanently deleted!",
      response_type: "ephemeral"
    });
    expect(respond).toHaveBeenCalledWith("🗑️ <@U456> has deleted ALL conversation history and memory. Starting completely fresh!");
    expect(claude.clearAllMemory).toHaveBeenCalledTimes(1);

    await rm(dir, { recursive: true, force: true });
  });

  it("does not store /clear commands in transcript", async () => {
    const { dir, config } = await createConfig();
    const postMessage = vi.fn().mockResolvedValue({ ts: "123" });
    const slackClient = { chat: { postMessage } };
    const claude = createClaude("Response");
    const router = new MessageRouter(claude as unknown as { processMessage: (text: string) => Promise<string> }, slackClient, config);
    const say = vi.fn().mockResolvedValue(undefined);

    // Handle a /clear command
    await router.handleMessage({ text: "/clear", channel: "C1", ts: "111", user: "U1" }, say);

    // Check that the transcript doesn't contain the /clear command
    // We need to load the transcript and verify it's empty or doesn't contain the command
    const { deriveSlackSessionKey } = await import("../../src/sessions/session_key.ts");
    const { resolveSessionTranscript, loadTranscriptHistory } = await import("../../src/sessions/transcript.ts");

    const { sessionKey } = deriveSlackSessionKey({
      channel: "C1",
      threadTs: undefined,
      ts: "111",
      mainKey: config.sessions.dmSessionKey,
      forceNewSession: false
    });

    const session = await resolveSessionTranscript({
      storePath: config.sessions.storePath,
      sessionKey,
      transcriptsDir: config.sessions.transcriptsDir
    });

    const history = await loadTranscriptHistory({
      sessionFile: session.sessionFile,
      maxMessages: 100
    });

    // The transcript should not contain any messages since /clear was handled and not stored
    expect(history).toHaveLength(0);

    await rm(dir, { recursive: true, force: true });
  });

  it("channel messages share session context for sequential messages", async () => {
    const { dir, config } = await createConfig();
    const claude = createClaude("Response");
    const router = new MessageRouter(claude as unknown as { processMessage: (text: string, opts: any) => Promise<string> }, undefined, config);
    const say = vi.fn().mockResolvedValue(undefined);

    // First message in channel
    await router.handleMessage({ text: "what VMs do I have?", channel: "C1", ts: "111", user: "U1" }, say);
    // Second message in channel (not a thread reply)
    await router.handleMessage({ text: "show me their status", channel: "C1", ts: "112", user: "U1" }, say);

    const firstSessionKey = (claude.processMessage as any).mock.calls[0][1]?.sessionKey;
    const secondSessionKey = (claude.processMessage as any).mock.calls[1][1]?.sessionKey;

    // Both messages should share the same channel-level session
    expect(firstSessionKey).toBe("agent:default:slack:C1");
    expect(secondSessionKey).toBe("agent:default:slack:C1");

    await rm(dir, { recursive: true, force: true });
  });

  it("thread replies maintain isolated context from main channel", async () => {
    const { dir, config } = await createConfig();
    const claude = createClaude("Response");
    const router = new MessageRouter(claude as unknown as { processMessage: (text: string, opts: any) => Promise<string> }, undefined, config);
    const say = vi.fn().mockResolvedValue(undefined);

    // Root message in channel
    await router.handleMessage({ text: "root", channel: "C1", ts: "111", user: "U1" }, say);
    // Reply in thread
    await router.handleMessage({ text: "reply", channel: "C1", ts: "112", thread_ts: "111", user: "U1" }, say);

    const rootSessionKey = (claude.processMessage as any).mock.calls[0][1]?.sessionKey;
    const threadSessionKey = (claude.processMessage as any).mock.calls[1][1]?.sessionKey;

    // Root message uses channel session
    expect(rootSessionKey).toBe("agent:default:slack:C1");
    // Thread replies have their own isolated session
    expect(threadSessionKey).toBe("agent:default:slack:C1:thread:111");

    await rm(dir, { recursive: true, force: true });
  });
});
