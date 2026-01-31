import { describe, expect, it, vi } from "vitest";
import { MessageRouter } from "../../src/services/message_router.js";

const createClaude = (response: string | Promise<string>) => ({
  processMessage: vi.fn().mockResolvedValue(response)
});

describe("MessageRouter", () => {
  it("posts a thinking indicator and updates with the response", async () => {
    const postMessage = vi.fn().mockResolvedValue({ ts: "123" });
    const update = vi.fn().mockResolvedValue(undefined);
    const slackClient = { chat: { postMessage, update } };
    const claude = createClaude("Hello!");
    const router = new MessageRouter(claude as unknown as { processMessage: (text: string) => Promise<string> }, slackClient);
    const say = vi.fn().mockResolvedValue(undefined);

    await router.handleMessage({ text: "hi", channel: "C1" }, say);

    expect(postMessage).toHaveBeenCalledWith({ channel: "C1", text: ":thinking_face: Thinking..." });
    expect(update).toHaveBeenCalledWith({ channel: "C1", ts: "123", text: "Hello!" });
    expect(say).not.toHaveBeenCalled();
  });

  it("falls back to say when no Slack client is provided", async () => {
    const claude = createClaude("Fallback");
    const router = new MessageRouter(claude as unknown as { processMessage: (text: string) => Promise<string> });
    const say = vi.fn().mockResolvedValue(undefined);

    await router.handleMessage({ text: "hi", channel: "C1" }, say);

    expect(say).toHaveBeenCalledWith("Fallback");
  });

  it("skips messages sent by bots", async () => {
    const postMessage = vi.fn().mockResolvedValue({ ts: "123" });
    const update = vi.fn().mockResolvedValue(undefined);
    const slackClient = { chat: { postMessage, update } };
    const claude = createClaude("Ignored");
    const router = new MessageRouter(claude as unknown as { processMessage: (text: string) => Promise<string> }, slackClient);
    const say = vi.fn().mockResolvedValue(undefined);

    await router.handleMessage({ text: "hi", channel: "C1", bot_id: "B1" }, say);

    expect(claude.processMessage).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
    expect(say).not.toHaveBeenCalled();
  });

  it("handles processing errors and updates the thinking message", async () => {
    const postMessage = vi.fn().mockResolvedValue({ ts: "777" });
    const update = vi.fn().mockResolvedValue(undefined);
    const slackClient = { chat: { postMessage, update } };
    const claude = {
      processMessage: vi.fn().mockRejectedValue(new Error("boom"))
    };
    const router = new MessageRouter(claude as unknown as { processMessage: (text: string) => Promise<string> }, slackClient);
    const say = vi.fn().mockResolvedValue(undefined);

    await router.handleMessage({ text: "hi", channel: "C1" }, say);

    expect(update).toHaveBeenCalledWith({
      channel: "C1",
      ts: "777",
      text: ":x: Sorry, I encountered an error processing your message."
    });
    expect(say).not.toHaveBeenCalled();
  });
});
