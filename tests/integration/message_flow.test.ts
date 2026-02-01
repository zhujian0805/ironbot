import { describe, expect, it, vi } from "vitest";
import { registerSlackHandlers } from "../../src/services/slack_handler.ts";

describe("Slack message flow", () => {
  it("routes app_mention events to the message router", async () => {
    const handlers: Record<string, (args: any) => Promise<void>> = {};
    const app = {
      event: (eventName: string, handler: (args: any) => Promise<void>) => {
        handlers[eventName] = handler;
      }
    };

    const router = {
      handleAppMention: vi.fn().mockResolvedValue(undefined),
      handleMessage: vi.fn().mockResolvedValue(undefined)
    };

    registerSlackHandlers(app as unknown as { event: typeof app.event }, router);

    const say = vi.fn();
    await handlers["app_mention"]({
      event: {
        user: "U123",
        text: "hello",
        channel: "C123"
      },
      say
    });

    expect(router.handleAppMention).toHaveBeenCalledWith(
      expect.objectContaining({
        user: "U123",
        text: "hello",
        channel: "C123"
      }),
      say
    );
  });

  it("routes direct messages to the message router", async () => {
    const handlers: Record<string, (args: any) => Promise<void>> = {};
    const app = {
      event: (eventName: string, handler: (args: any) => Promise<void>) => {
        handlers[eventName] = handler;
      }
    };

    const router = {
      handleAppMention: vi.fn().mockResolvedValue(undefined),
      handleMessage: vi.fn().mockResolvedValue(undefined)
    };

    registerSlackHandlers(app as unknown as { event: typeof app.event }, router);

    const say = vi.fn();
    await handlers["message"]({
      event: {
        user: "U123",
        text: "hello",
        channel: "D123"
      },
      say
    });

    expect(router.handleMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        user: "U123",
        text: "hello",
        channel: "D123"
      }),
      say
    );
  });

  it("ignores non-direct message events", async () => {
    const handlers: Record<string, (args: any) => Promise<void>> = {};
    const app = {
      event: (eventName: string, handler: (args: any) => Promise<void>) => {
        handlers[eventName] = handler;
      }
    };

    const router = {
      handleAppMention: vi.fn().mockResolvedValue(undefined),
      handleMessage: vi.fn().mockResolvedValue(undefined)
    };

    registerSlackHandlers(app as unknown as { event: typeof app.event }, router);

    const say = vi.fn();
    await handlers["message"]({
      event: {
        user: "U123",
        text: "hello",
        channel: "C123"
      },
      say
    });

    expect(router.handleMessage).not.toHaveBeenCalled();
  });
});
