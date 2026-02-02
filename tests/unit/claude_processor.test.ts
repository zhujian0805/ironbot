// Mock the modules BEFORE imports
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(() => ({
    messages: {
      create: vi.fn()
    }
  }))
}));

vi.mock("../../src/services/tools.ts", () => ({
  ToolExecutor: vi.fn().mockImplementation(() => ({
    executeTool: vi.fn()
  })),
  getAllowedTools: vi.fn().mockReturnValue([])
}));

vi.mock("../../src/services/skill_loader.ts", () => ({
  SkillLoader: vi.fn().mockImplementation(() => ({
    loadSkills: vi.fn()
  }))
}));

vi.mock("../../src/config.ts", () => ({
  resolveConfig: vi.fn().mockReturnValue({
    anthropicAuthToken: "test-token",
    anthropicBaseUrl: undefined,
    anthropicModel: "claude-3-sonnet-20240229",
    devMode: false,
    skillsDir: "./skills"
  })
}));

vi.mock("../../src/utils/logging.ts", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}));

// Now import after mocks
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ClaudeProcessor } from "../../src/services/claude_processor.ts";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

// Get mocked instances
const mockAnthropic = vi.mocked(require("@anthropic-ai/sdk")).default;
const mockToolExecutor = vi.mocked(require("../../src/services/tools.ts")).ToolExecutor;
const mockSkillLoader = vi.mocked(require("../../src/services/skill_loader.ts")).SkillLoader;
const mockConfig = vi.mocked(require("../../src/config.ts")).resolveConfig;

describe("ClaudeProcessor", () => {
  let processor: ClaudeProcessor;
  let mockAnthropicClient: any;
  let mockToolExecutorInstance: any;
  let mockSkillLoaderInstance: any;
  let mockMemoryManager: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // The mock Anthropic constructor returns a mock client
    mockAnthropicClient = MockAnthropic.mock.results[MockAnthropic.mock.calls.length - 1]?.value;
    if (!mockAnthropicClient) {
      mockAnthropicClient = {
        messages: {
          create: vi.fn()
        }
      };
    }

    mockToolExecutorInstance = {
      executeTool: vi.fn()
    };

    mockSkillLoaderInstance = {
      loadSkills: vi.fn()
    };

    mockMemoryManager = {
      search: vi.fn()
    };

    // Configure mock returns
    mockAnthropicClient.messages.create.mockResolvedValue({
      content: [{ type: "text", text: "Mock response" }],
      stop_reason: "end_turn"
    });

    mockToolExecutorInstance.executeTool.mockResolvedValue({
      success: true,
      result: "Mock tool result"
    });

    mockSkillLoaderInstance.loadSkills.mockResolvedValue({});

    mockMemoryManager.search.mockResolvedValue([]);

    // Create processor with mocked memory manager
    processor = new ClaudeProcessor("./skills", mockMemoryManager);
  });

  describe("checkConnection", () => {
    it("returns true when connection is successful", async () => {
      mockAnthropicClient.messages.create.mockResolvedValueOnce({
        content: [{ type: "text", text: "Hello" }]
      });

      const result = await processor.checkConnection();
      expect(result).toBe(true);
      expect(mockAnthropicClient.messages.create).toHaveBeenCalledWith({
        model: "claude-3-sonnet-20240229",
        max_tokens: 8,
        messages: [{ role: "user", content: "Hello" }]
      });
    });

    it("returns false when connection fails", async () => {
      const error = new Error("Connection failed");
      mockAnthropicClient.messages.create.mockRejectedValueOnce(error);

      const result = await processor.checkConnection();
      expect(result).toBe(false);
    });
  });

  describe("processMessage", () => {
    it("handles skill execution when message contains skill reference", async () => {
      const skillHandler = vi.fn().mockResolvedValue("Skill executed successfully");
      mockSkillLoader.loadSkills.mockResolvedValue({
        "testskill": skillHandler
      });

      const result = await processor.processMessage("Please run @testskill");

      expect(skillHandler).toHaveBeenCalledWith("Please run @testskill");
      expect(result).toBe("Skill executed successfully");
    });

    it("handles skill execution errors gracefully", async () => {
      const skillHandler = vi.fn().mockRejectedValue(new Error("Skill failed"));
      mockSkillLoader.loadSkills.mockResolvedValue({
        "failing": skillHandler
      });

      const result = await processor.processMessage("Run @failing");

      expect(result).toContain("Sorry, error executing skill failing");
      expect(result).toContain("Skill failed");
    });

    it("returns dev mode response when in dev mode", async () => {
      // Create processor in dev mode
      vi.mocked(require("../../src/config.ts").resolveConfig).mockReturnValueOnce({
        anthropicAuthToken: "test-token",
        anthropicBaseUrl: undefined,
        anthropicModel: "claude-3-sonnet-20240229",
        devMode: true,
        skillsDir: "./skills"
      });

      const devProcessor = new ClaudeProcessor("./skills", mockMemoryManager as any);
      const result = await devProcessor.processMessage("Test message");

      expect(result).toBe("[DEV MODE] I would respond to: Test message");
      expect(mockAnthropicClient.messages.create).not.toHaveBeenCalled();
    });

    it("processes messages with tools when no skills match", async () => {
      mockMemoryManager.search.mockResolvedValue([]);

      mockAnthropicClient.messages.create
        .mockResolvedValueOnce({
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Hello, I can help you!" }]
        });

      const result = await processor.processMessage("Hello");

      expect(result).toBe("Hello, I can help you!");
      expect(mockAnthropicClient.messages.create).toHaveBeenCalledWith({
        model: "claude-3-sonnet-20240229",
        max_tokens: 2048,
        system: expect.stringContaining("You are a helpful AI assistant"),
        tools: [],
        messages: [{ role: "user", content: "Hello" }]
      });
    });

    it("includes memory context when available", async () => {
      mockMemoryManager.search.mockResolvedValue([
        {
          source: "session",
          path: "session-1",
          content: "Previous conversation about testing"
        }
      ]);

      mockAnthropicClient.messages.create
        .mockResolvedValueOnce({
          stop_reason: "end_turn",
          content: [{ type: "text", text: "I remember our previous conversation!" }]
        });

      const result = await processor.processMessage("What were we talking about?", {
        sessionKey: "test-session"
      });

      expect(mockMemoryManager.search).toHaveBeenCalledWith("What were we talking about?", {
        sessionKey: "test-session",
        crossSessionMemory: undefined
      });

      expect(mockAnthropicClient.messages.create).toHaveBeenCalledWith({
        model: "claude-3-sonnet-20240229",
        max_tokens: 2048,
        system: expect.stringContaining("Relevant memory:"),
        tools: [],
        messages: [{ role: "user", content: "What were we talking about?" }]
      });
    });

    it("handles tool execution in conversation flow", async () => {
      mockMemoryManager.search.mockResolvedValue([]);

      // First call - tool use requested
      mockAnthropicClient.messages.create
        .mockResolvedValueOnce({
          stop_reason: "tool_use",
          content: [
            { type: "text", text: "I'll help you list files." },
            {
              type: "tool_use",
              id: "tool_123",
              name: "run_bash",
              input: { command: "ls" }
            }
          ]
        });

      // Mock tool execution
      mockToolExecutor.executeTool.mockResolvedValue({
        success: true,
        result: "file1.txt\nfile2.txt"
      });

      // Second call - final response
      mockAnthropicClient.messages.create
        .mockResolvedValueOnce({
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Here are the files: file1.txt, file2.txt" }]
        });

      const result = await processor.processMessage("List my files");

      expect(mockToolExecutor.executeTool).toHaveBeenCalledWith("run_bash", { command: "ls" });
      expect(result).toBe("Here are the files: file1.txt, file2.txt");
    });

    it("handles tool execution failures", async () => {
      mockMemoryManager.search.mockResolvedValue([]);

      mockAnthropicClient.messages.create
        .mockResolvedValueOnce({
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "tool_123",
              name: "run_bash",
              input: { command: "invalid_command" }
            }
          ]
        });

      mockToolExecutor.executeTool.mockResolvedValue({
        success: false,
        error: "Command not found"
      });

      mockAnthropicClient.messages.create
        .mockResolvedValueOnce({
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Sorry, that command failed." }]
        });

      const result = await processor.processMessage("Run invalid command");

      expect(mockToolExecutor.executeTool).toHaveBeenCalledWith("run_bash", { command: "invalid_command" });
      expect(result).toBe("Sorry, that command failed.");
    });

    it("respects conversation history", async () => {
      mockMemoryManager.search.mockResolvedValue([]);

      const conversationHistory: MessageParam[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" }
      ];

      mockAnthropicClient.messages.create
        .mockResolvedValueOnce({
          stop_reason: "end_turn",
          content: [{ type: "text", text: "How can I help you today?" }]
        });

      await processor.processMessage("How are you?", { conversationHistory });

      expect(mockAnthropicClient.messages.create).toHaveBeenCalledWith({
        model: "claude-3-sonnet-20240229",
        max_tokens: 2048,
        system: expect.any(String),
        tools: [],
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi there!" },
          { role: "user", content: "How are you?" }
        ]
      });
    });

    it("handles memory search failures gracefully", async () => {
      mockMemoryManager.search.mockRejectedValue(new Error("Memory error"));

      mockAnthropicClient.messages.create
        .mockResolvedValueOnce({
          stop_reason: "end_turn",
          content: [{ type: "text", text: "I can help you!" }]
        });

      const result = await processor.processMessage("Hello");

      expect(result).toBe("I can help you!");
      // Should continue without memory context
    });

    it("limits tool iteration cycles", async () => {
      mockMemoryManager.search.mockResolvedValue([]);

      // Mock continuous tool use responses
      for (let i = 0; i < 6; i++) {
        mockAnthropicClient.messages.create
          .mockResolvedValueOnce({
            stop_reason: "tool_use",
            content: [
              {
                type: "tool_use",
                id: `tool_${i}`,
                name: "run_bash",
                input: { command: "echo test" }
              }
            ]
          });

        mockToolExecutor.executeTool.mockResolvedValue({
          success: true,
          result: "test output"
        });
      }

      // Final response after max iterations
      mockAnthropicClient.messages.create
        .mockResolvedValueOnce({
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Maximum iterations reached" }]
        });

      const result = await processor.processMessage("Loop test");

      expect(mockAnthropicClient.messages.create).toHaveBeenCalledTimes(7); // 6 tool calls + 1 final
      expect(result).toBe("Maximum iterations reached");
    });
  });
});