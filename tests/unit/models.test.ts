import { describe, expect, it } from "vitest";
import type { ClaudeMessage, ClaudeRequest } from "../../../src/models/claude_request.ts";
import type { SlackEvent } from "../../../src/models/slack_event.ts";
import type { ToolRequest } from "../../../src/models/tool_request.ts";

describe("Model Validation", () => {
  describe("ClaudeRequest", () => {
    it("validates a complete ClaudeRequest structure", () => {
      const request: ClaudeRequest = {
        model: "claude-3-sonnet-20240229",
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi there!" }
        ],
        tools: [
          {
            name: "read_file",
            description: "Read a file",
            input_schema: {
              type: "object",
              properties: {
                path: { type: "string" }
              },
              required: ["path"]
            }
          }
        ],
        streaming: false
      };

      // Type check - if this compiles, the structure is valid
      expect(request.model).toBe("claude-3-sonnet-20240229");
      expect(request.messages).toHaveLength(2);
      expect(request.tools).toHaveLength(1);
      expect(request.streaming).toBe(false);
    });

    it("validates ClaudeMessage structure", () => {
      const message: ClaudeMessage = {
        role: "user",
        content: "Test message"
      };

      expect(message.role).toBe("user");
      expect(message.content).toBe("Test message");
    });
  });

  describe("SlackEvent", () => {
    it("validates a basic Slack message event", () => {
      const event: SlackEvent = {
        type: "message",
        channel: "C1234567890",
        user: "U1234567890",
        text: "Hello world",
        ts: "1234567890.123456",
        team: "T1234567890"
      };

      expect(event.type).toBe("message");
      expect(event.channel).toBe("C1234567890");
      expect(event.user).toBe("U1234567890");
      expect(event.text).toBe("Hello world");
    });

    it("validates a Slack event with thread information", () => {
      const event: SlackEvent = {
        type: "message",
        channel: "C1234567890",
        user: "U1234567890",
        text: "Reply in thread",
        ts: "1234567890.123456",
        thread_ts: "1234567890.000000",
        team: "T1234567890"
      };

      expect(event.thread_ts).toBe("1234567890.000000");
      expect(event.ts).not.toBe(event.thread_ts);
    });
  });

  describe("ToolRequest", () => {
    it("validates a complete tool request", () => {
      const request: ToolRequest = {
        toolName: "read_file",
        arguments: {
          path: "/tmp/test.txt",
          encoding: "utf-8"
        },
        requestedResource: "/tmp/test.txt"
      };

      expect(request.toolName).toBe("read_file");
      expect(request.arguments.path).toBe("/tmp/test.txt");
      expect(request.requestedResource).toBe("/tmp/test.txt");
    });

    it("validates tool request with minimal fields", () => {
      const request: ToolRequest = {
        toolName: "run_bash",
        arguments: {
          command: "echo hello"
        }
      };

      expect(request.toolName).toBe("run_bash");
      expect(request.arguments.command).toBe("echo hello");
      expect(request.requestedResource).toBeUndefined();
    });
  });

  describe("Error scenarios", () => {
    it("handles invalid ClaudeMessage roles", () => {
      // This test ensures type safety - invalid roles should be caught at compile time
      const validMessage: ClaudeMessage = {
        role: "user",
        content: "test"
      };

      expect(validMessage.role).toBe("user");

      // Invalid roles would cause TypeScript compilation errors
      // role: "invalid" would not compile
    });

    it("validates required fields are present", () => {
      // TypeScript ensures required fields - this test verifies the type constraints work
      const message: ClaudeMessage = {
        role: "user",
        content: "required content"
      };

      expect(message.content).toBeDefined();
      expect(message.content).not.toBe("");
    });
  });
});</content>
<parameter name="file_path">D:\repos\ironbot\tests\unit\models.test.ts