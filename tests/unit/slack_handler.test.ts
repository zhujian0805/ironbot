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

      expect(mockApp.command).toHaveBeenCalledWith("/clear", expect.any(Function));
      expect(mockApp.command).toHaveBeenCalledWith("/remember", expect.any(Function));
      expect(mockApp.command).toHaveBeenCalledWith("/forget_all", expect.any(Function));
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

    it("handles malformed events gracefully", () => {
      const mockApp = {
        event: vi.fn()
      };
      const mockRouter = {
        handleAppMention: vi.fn(),
        handleMessage: vi.fn()
      };

      registerSlackHandlers(mockApp as any, mockRouter);

      const messageCall = mockApp.event.mock.calls.find(call => call[0] === "message");
      const messageHandler = messageCall[1];
      const mockSay = vi.fn();

      // Test with null event
      messageHandler({ event: null, say: mockSay });
      expect(mockRouter.handleMessage).not.toHaveBeenCalled();

      // Test with undefined channel
      messageHandler({ event: { text: "hello" }, say: mockSay });
      expect(mockRouter.handleMessage).not.toHaveBeenCalled();

      // Test with non-string channel
      messageHandler({ event: { channel: 123, text: "hello" }, say: mockSay });
      expect(mockRouter.handleMessage).not.toHaveBeenCalled();
    });

    it("handles app_mention handler errors gracefully", async () => {
      const mockApp = {
        event: vi.fn()
      };
      const mockRouter = {
        handleAppMention: vi.fn().mockRejectedValue(new Error("Handler error")),
        handleMessage: undefined
      };

      registerSlackHandlers(mockApp as any, mockRouter);

      const mentionCall = mockApp.event.mock.calls.find(call => call[0] === "app_mention");
      const mentionHandler = mentionCall[1];

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(mentionHandler({ event: {}, say: vi.fn() })).rejects.toThrow("Handler error");

      consoleSpy.mockRestore();
    });

    it("handles message handler errors gracefully", async () => {
      const mockApp = {
        event: vi.fn()
      };
      const mockRouter = {
        handleAppMention: vi.fn(),
        handleMessage: vi.fn().mockRejectedValue(new Error("Message handler error"))
      };

      registerSlackHandlers(mockApp as any, mockRouter);

      const messageCall = mockApp.event.mock.calls.find(call => call[0] === "message");
      const messageHandler = messageCall[1];

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(messageHandler({
        event: { channel: "D123", text: "hello" },
        say: vi.fn()
      })).rejects.toThrow("Message handler error");

      consoleSpy.mockRestore();
    });

    it("handles slash command handler errors gracefully", async () => {
      const mockApp = {
        event: vi.fn(),
        command: vi.fn()
      };
      const mockRouter = {
        handleAppMention: vi.fn(),
        handleMessage: vi.fn(),
        handleSlashCommand: vi.fn().mockRejectedValue(new Error("Slash command error"))
      };

      registerSlackHandlers(mockApp as any, mockRouter);

      // Get the /clear command handler
      const clearCommandCall = mockApp.command.mock.calls.find(call => call[0] === "/clear");
      const clearCommandHandler = clearCommandCall[1];

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(clearCommandHandler({
        command: { command: "/clear" },
        ack: vi.fn(),
        respond: vi.fn()
      })).rejects.toThrow("Slash command error");

      consoleSpy.mockRestore();
    });

    it("passes correct parameters to app_mention handler", async () => {
      const mockApp = {
        event: vi.fn()
      };
      const mockRouter = {
        handleAppMention: vi.fn().mockResolvedValue(undefined),
        handleMessage: undefined
      };

      registerSlackHandlers(mockApp as any, mockRouter);

      const mentionCall = mockApp.event.mock.calls.find(call => call[0] === "app_mention");
      const mentionHandler = mentionCall[1];

      const testEvent = { text: "@bot hello", user: "U123", channel: "C456" };
      const mockSay = vi.fn();

      await mentionHandler({ event: testEvent, say: mockSay });

      expect(mockRouter.handleAppMention).toHaveBeenCalledWith(testEvent, mockSay);
    });

    it("passes correct parameters to slash command handlers", async () => {
      const mockApp = {
        event: vi.fn(),
        command: vi.fn()
      };
      const mockRouter = {
        handleAppMention: vi.fn(),
        handleMessage: vi.fn(),
        handleSlashCommand: vi.fn().mockResolvedValue(undefined)
      };

      registerSlackHandlers(mockApp as any, mockRouter);

      // Test /clear command
      const clearCommandCall = mockApp.command.mock.calls.find(call => call[0] === "/clear");
      const clearCommandHandler = clearCommandCall[1];

      const testCommand = {
        command: "/clear",
        text: "",
        channel_id: "C123",
        user_id: "U456",
        trigger_id: "trigger123"
      };
      const mockAck = vi.fn().mockResolvedValue(undefined);
      const mockRespond = vi.fn().mockResolvedValue(undefined);

      await clearCommandHandler({ command: testCommand, ack: mockAck, respond: mockRespond });

      expect(mockRouter.handleSlashCommand).toHaveBeenCalledWith(testCommand, mockAck, mockRespond);

      // Test /remember command
      const rememberCommandCall = mockApp.command.mock.calls.find(call => call[0] === "/remember");
      const rememberCommandHandler = rememberCommandCall[1];

      mockRouter.handleSlashCommand.mockClear();

      await rememberCommandHandler({ command: testCommand, ack: mockAck, respond: mockRespond });

      expect(mockRouter.handleSlashCommand).toHaveBeenCalledWith(testCommand, mockAck, mockRespond);
    });

    it("only registers message handler when handleMessage is provided", () => {
      const mockApp = {
        event: vi.fn()
      };
      const mockRouter = {
        handleAppMention: vi.fn(),
        handleMessage: undefined
      };

      registerSlackHandlers(mockApp as any, mockRouter);

      const messageCalls = mockApp.event.mock.calls.filter(call => call[0] === "message");
      expect(messageCalls).toHaveLength(0);
    });

    it("only registers slash commands when handleSlashCommand is provided", () => {
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

    it("handles edge cases in message filtering", () => {
      const mockApp = {
        event: vi.fn()
      };
      const mockRouter = {
        handleAppMention: vi.fn(),
        handleMessage: vi.fn()
      };

      registerSlackHandlers(mockApp as any, mockRouter);

      const messageCall = mockApp.event.mock.calls.find(call => call[0] === "message");
      const messageHandler = messageCall[1];
      const mockSay = vi.fn();

      // Test channel starting with 'D' but with bot_id
      const dmBotEvent = { channel: "D123", text: "hello", bot_id: "B123" };
      messageHandler({ event: dmBotEvent, say: mockSay });
      expect(mockRouter.handleMessage).not.toHaveBeenCalled();

      // Test channel starting with 'D' but with subtype
      const dmSubtypeEvent = { channel: "D123", text: "hello", subtype: "channel_join" };
      mockRouter.handleMessage.mockClear();
      messageHandler({ event: dmSubtypeEvent, say: mockSay });
      expect(mockRouter.handleMessage).not.toHaveBeenCalled();

      // Test valid DM without bot_id or subtype
      const validDmEvent = { channel: "D123", text: "hello" };
      mockRouter.handleMessage.mockClear();
      messageHandler({ event: validDmEvent, say: mockSay });
      expect(mockRouter.handleMessage).toHaveBeenCalledWith(validDmEvent, mockSay);
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

    it("handles constructor parameters correctly", () => {
      const mockApp = {
        event: vi.fn()
      };
      const mockRouter = {
        handleAppMention: vi.fn(),
        handleMessage: vi.fn(),
        handleSlashCommand: vi.fn()
      };

      const handler = new SlackMessageHandler(mockApp as any, mockRouter);

      // Verify the handler stores the references
      expect((handler as any).app).toBe(mockApp);
      expect((handler as any).router).toBe(mockRouter);
    });

    it("can register handlers multiple times", () => {
      const mockApp = {
        event: vi.fn()
      };
      const mockRouter = {
        handleAppMention: vi.fn(),
        handleMessage: vi.fn()
      };

      const handler = new SlackMessageHandler(mockApp as any, mockRouter);

      // First registration
      handler.registerHandlers();
      expect(mockApp.event).toHaveBeenCalledTimes(2);

      // Second registration
      mockApp.event.mockClear();
      handler.registerHandlers();
      expect(mockApp.event).toHaveBeenCalledTimes(2);
    });

    it("works with minimal router interface", () => {
      const mockApp = {
        event: vi.fn()
      };
      const mockRouter = {
        handleAppMention: vi.fn()
        // No handleMessage or handleSlashCommand
      };

      const handler = new SlackMessageHandler(mockApp as any, mockRouter);
      handler.registerHandlers();

      expect(mockApp.event).toHaveBeenCalledTimes(1);
      expect(mockApp.event).toHaveBeenCalledWith("app_mention", expect.any(Function));
    });

    it("handles registration with all optional handlers", () => {
      const mockApp = {
        event: vi.fn(),
        command: vi.fn()
      };
      const mockRouter = {
        handleAppMention: vi.fn(),
        handleMessage: vi.fn(),
        handleSlashCommand: vi.fn()
      };

      const handler = new SlackMessageHandler(mockApp as any, mockRouter);
      handler.registerHandlers();

      expect(mockApp.event).toHaveBeenCalledTimes(2);
      expect(mockApp.command).toHaveBeenCalledTimes(3);
      expect(mockApp.command).toHaveBeenCalledWith("/clear", expect.any(Function));
      expect(mockApp.command).toHaveBeenCalledWith("/remember", expect.any(Function));
      expect(mockApp.command).toHaveBeenCalledWith("/forget_all", expect.any(Function));
    });
  });

  describe("slash command registration", () => {
    it("registers /clear and /remember commands", () => {
      const mockApp = {
        event: vi.fn(),
        command: vi.fn()
      };
      const mockRouter = {
        handleAppMention: vi.fn(),
        handleMessage: vi.fn(),
        handleSlashCommand: vi.fn()
      };

      const handler = new SlackMessageHandler(mockApp as any, mockRouter);
      handler.registerHandlers();

      expect(mockApp.command).toHaveBeenCalledTimes(3);
      expect(mockApp.command).toHaveBeenCalledWith("/clear", expect.any(Function));
      expect(mockApp.command).toHaveBeenCalledWith("/remember", expect.any(Function));
      expect(mockApp.command).toHaveBeenCalledWith("/forget_all", expect.any(Function));
    });

    it("handles /clear command correctly", async () => {
      const mockApp = {
        event: vi.fn(),
        command: vi.fn()
      };
      const mockRouter = {
        handleAppMention: vi.fn(),
        handleMessage: vi.fn(),
        handleSlashCommand: vi.fn().mockResolvedValue(undefined)
      };

      const handler = new SlackMessageHandler(mockApp as any, mockRouter);
      handler.registerHandlers();

      // Get the /clear command handler
      const clearCommandHandler = mockApp.command.mock.calls.find(call => call[0] === "/clear")[1];
      const mockCommand = {
        command: "/clear",
        text: "",
        channel_id: "C123",
        user_id: "U456",
        trigger_id: "trigger123"
      };
      const mockAck = vi.fn().mockResolvedValue(undefined);
      const mockRespond = vi.fn().mockResolvedValue(undefined);

      await clearCommandHandler({ command: mockCommand, ack: mockAck, respond: mockRespond });

      expect(mockRouter.handleSlashCommand).toHaveBeenCalledWith(mockCommand, mockAck, mockRespond);
    });

    it("handles /remember command with text correctly", async () => {
      const mockApp = {
        event: vi.fn(),
        command: vi.fn()
      };
      const mockRouter = {
        handleAppMention: vi.fn(),
        handleMessage: vi.fn(),
        handleSlashCommand: vi.fn().mockResolvedValue(undefined)
      };

      const handler = new SlackMessageHandler(mockApp as any, mockRouter);
      handler.registerHandlers();

      // Get the /remember command handler
      const rememberCommandHandler = mockApp.command.mock.calls.find(call => call[0] === "/remember")[1];
      const mockCommand = {
        command: "/remember",
        text: "important information",
        channel_id: "C123",
        user_id: "U456",
        trigger_id: "trigger123"
      };
      const mockAck = vi.fn().mockResolvedValue(undefined);
      const mockRespond = vi.fn().mockResolvedValue(undefined);

      await rememberCommandHandler({ command: mockCommand, ack: mockAck, respond: mockRespond });

      expect(mockRouter.handleSlashCommand).toHaveBeenCalledWith(mockCommand, mockAck, mockRespond);
    });

    it("handles slash command errors gracefully", async () => {
      const mockApp = {
        event: vi.fn(),
        command: vi.fn()
      };
      const mockRouter = {
        handleAppMention: vi.fn(),
        handleMessage: vi.fn(),
        handleSlashCommand: vi.fn().mockRejectedValue(new Error("Command failed"))
      };

      const handler = new SlackMessageHandler(mockApp as any, mockRouter);
      handler.registerHandlers();

      // Get the /clear command handler
      const clearCommandHandler = mockApp.command.mock.calls.find(call => call[0] === "/clear")[1];
      const mockCommand = {
        command: "/clear",
        text: "",
        channel_id: "C123",
        user_id: "U456",
        trigger_id: "trigger123"
      };
      const mockAck = vi.fn().mockResolvedValue(undefined);
      const mockRespond = vi.fn().mockResolvedValue(undefined);

      // The handler should propagate the error from the router
      await expect(clearCommandHandler({ command: mockCommand, ack: mockAck, respond: mockRespond })).rejects.toThrow("Command failed");

      expect(mockRouter.handleSlashCommand).toHaveBeenCalledWith(mockCommand, mockAck, mockRespond);
    });

    it("handles unknown slash commands", async () => {
      const mockApp = {
        event: vi.fn(),
        command: vi.fn()
      };
      const mockRouter = {
        handleAppMention: vi.fn(),
        handleMessage: vi.fn(),
        handleSlashCommand: vi.fn().mockResolvedValue(undefined)
      };

      const handler = new SlackMessageHandler(mockApp as any, mockRouter);
      handler.registerHandlers();

      // Get the /clear command handler (should handle unknown commands gracefully)
      const clearCommandHandler = mockApp.command.mock.calls.find(call => call[0] === "/clear")[1];
      const mockCommand = {
        command: "/unknown",
        text: "",
        channel_id: "C123",
        user_id: "U456",
        trigger_id: "trigger123"
      };
      const mockAck = vi.fn().mockResolvedValue(undefined);
      const mockRespond = vi.fn().mockResolvedValue(undefined);

      await clearCommandHandler({ command: mockCommand, ack: mockAck, respond: mockRespond });

      expect(mockRouter.handleSlashCommand).toHaveBeenCalledWith(mockCommand, mockAck, mockRespond);
    });
  });
});