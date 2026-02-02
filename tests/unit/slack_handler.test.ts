import { describe, expect, it, vi } from "vitest";
import { registerSlackHandlers, SlackMessageHandler } from "../../src/services/slack_handler.ts";

describe("Slack Handler", () => {
  describe("registerSlackHandlers", () => {
    it("registers app_mention event handler", () => {
      const mockApp = {
        event: vi.fn()
      };
      const mockRouter = {
        handleAppMention: vi.fn(),
        handleMessage: undefined
      };

      registerSlackHandlers(mockApp as any, mockRouter);

      expect(mockApp.event).toHaveBeenCalledWith("app_mention", expect.any(Function));
    });

    it("registers message event handler when handleMessage is provided", () => {
      const mockApp = {
        event: vi.fn()
      };
      const mockRouter = {
        handleAppMention: vi.fn(),
        handleMessage: vi.fn()
      };

      registerSlackHandlers(mockApp as any, mockRouter);

      expect(mockApp.event).toHaveBeenCalledWith("message", expect.any(Function));
    });

    it("registers slash command handler when handleSlashCommand is provided", () => {
      const mockApp = {
        event: vi.fn(),
        command: vi.fn()
      };
      const mockRouter = {
        handleAppMention: vi.fn(),
        handleMessage: vi.fn(),
        handleSlashCommand: vi.fn()
      };

      registerSlackHandlers(mockApp as any, mockRouter);

      expect(mockApp.command).toHaveBeenCalledWith("/new", expect.any(Function));
      expect(mockApp.command).toHaveBeenCalledWith("/remember", expect.any(Function));
    });

    it("does not register slash command handler when handleSlashCommand is not provided", () => {
      const mockApp = {
        event: vi.fn(),
        command: vi.fn()
      };
      const mockRouter = {
        handleAppMention: vi.fn(),
        handleMessage: vi.fn(),
        handleSlashCommand: undefined
      };

      registerSlackHandlers(mockApp as any, mockRouter);

      expect(mockApp.command).not.toHaveBeenCalled();
    });

    it("filters DM messages correctly", () => {
      const mockApp = {
        event: vi.fn()
      };
      const mockRouter = {
        handleAppMention: vi.fn(),
        handleMessage: vi.fn()
      };

      registerSlackHandlers(mockApp as any, mockRouter);

      // Get the message handler
      const messageCall = mockApp.event.mock.calls.find(call => call[0] === "message");
      const messageHandler = messageCall[1];

      // Test DM message (channel starts with D)
      const dmEvent = { channel: "D1234567890", text: "hello", bot_id: undefined, subtype: undefined };
      const mockSay = vi.fn();

      messageHandler({ event: dmEvent, say: mockSay });

      expect(mockRouter.handleMessage).toHaveBeenCalledWith(dmEvent, mockSay);

      // Test non-DM message
      const channelEvent = { channel: "C1234567890", text: "hello" };
      mockRouter.handleMessage.mockClear();

      messageHandler({ event: channelEvent, say: mockSay });

      expect(mockRouter.handleMessage).not.toHaveBeenCalled();

      // Test bot message
      const botEvent = { channel: "D1234567890", bot_id: "B123", text: "hello" };
      mockRouter.handleMessage.mockClear();

      messageHandler({ event: botEvent, say: mockSay });

      expect(mockRouter.handleMessage).not.toHaveBeenCalled();

      // Test message with subtype
      const subtypeEvent = { channel: "D1234567890", subtype: "bot_message", text: "hello" };
      mockRouter.handleMessage.mockClear();

      messageHandler({ event: subtypeEvent, say: mockSay });

      expect(mockRouter.handleMessage).not.toHaveBeenCalled();
    });
  });

  describe("SlackMessageHandler", () => {
    it("registers handlers on registerHandlers call", () => {
      const mockApp = {
        event: vi.fn()
      };
      const mockRouter = {
        handleAppMention: vi.fn(),
        handleMessage: vi.fn()
      };

      const handler = new SlackMessageHandler(mockApp as any, mockRouter);
      handler.registerHandlers();

      expect(mockApp.event).toHaveBeenCalledTimes(2);
      expect(mockApp.event).toHaveBeenCalledWith("app_mention", expect.any(Function));
      expect(mockApp.event).toHaveBeenCalledWith("message", expect.any(Function));
    });
  });
});