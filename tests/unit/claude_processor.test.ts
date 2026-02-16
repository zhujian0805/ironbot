let mockAnthropicClient: any;

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    constructor() {
      if (!mockAnthropicClient) {
        mockAnthropicClient = {
          messages: {
            create: vi.fn()
          }
        };
      }
      return mockAnthropicClient;
    }
  }
}));

// Initialize the mock client
mockAnthropicClient = {
  messages: {
    create: vi.fn()
  }
};

const mockToolExecutorInstance = {
  executeTool: vi.fn(),
  setSkills: vi.fn()
};

vi.mock("../../src/services/tools.ts", () => ({
  ToolExecutor: class MockToolExecutor {
    constructor() {
      return mockToolExecutorInstance;
    }
  },
  getAllowedTools: vi.fn().mockReturnValue([])
}));

const mockSkillLoaderInstance = {
  loadSkills: vi.fn(),
  getSkillInfo: vi.fn()
};

const mockSkillInfos: Record<string, any> = {
  'skill_installer': {
    name: 'skill_installer',
    description: 'Installs skills',
    triggers: ['install', 'setup', 'add skill'],
    executable: false,
    parameters: [],
    handler: vi.fn()
  },
  'permission_check': {
    name: 'permission_check',
    description: 'Checks permissions',
    triggers: ['what skills', 'permission', 'access', 'can I'],
    executable: false,
    parameters: [],
    handler: vi.fn()
  },
  'calculator': {
    name: 'calculator',
    description: 'Calculates',
    triggers: ['use calculator', 'calculate'],
    executable: false,
    parameters: [],
    handler: vi.fn()
  },
  'testskill': {
    name: 'testskill',
    description: 'Test skill',
    triggers: [],
    executable: false,
    parameters: [],
    handler: vi.fn()
  },
};

const resetTriggerConfigs = () => {
  mockSkillInfos['skill_installer'].triggerConfig = {
    triggers: ['install', 'setup', 'add skill'],
    confidence: 0.8,
    autoRoute: true,
    source: "heuristic"
  };
  mockSkillInfos['permission_check'].triggerConfig = {
    triggers: ['what skills', 'permission', 'access', 'can I'],
    confidence: 0.75,
    autoRoute: true,
    source: "heuristic"
  };
  mockSkillInfos['calculator'].triggerConfig = {
    triggers: ['use calculator', 'calculate'],
    confidence: 0.9,
    autoRoute: true,
    source: "heuristic"
  };
  mockSkillInfos['testskill'].triggerConfig = {
    triggers: [],
    confidence: 0.9,
    autoRoute: true,
    source: "heuristic"
  };
};

vi.mock("../../src/services/skill_loader.ts", () => ({
  SkillLoader: class MockSkillLoader {
    constructor() {
      return mockSkillLoaderInstance;
    }
  }
}));

vi.mock("../../src/config.ts", () => ({
  resolveConfig: vi.fn(() => createDefaultMockConfig())
}));

const createDefaultMockConfig = () => ({
  anthropicAuthToken: "test-token",
  anthropicBaseUrl: undefined,
  anthropicModel: "claude-3-sonnet-20240229",
  devMode: false,
  skillDirs: ["./skills"],
  baseSkillsDir: "./skills",
  retry: {
    maxAttempts: 2,
    baseDelayMs: 10,
    maxDelayMs: 100,
    backoffMultiplier: 2,
    jitterMax: 0.1
  },
  autoRouting: {
    enabled: true,
    confidenceThreshold: 0.5,
    optOutSkills: []
  },
  maxToolIterations: 10,
  models: {
    providers: {
      anthropic: {
        api: "anthropic",
        apiKey: "test-token",
        baseUrl: undefined,
        models: [
          {
            id: "sonnet",
            name: "Claude 3.5 Sonnet",
            cost: {
              input: 3.0,
              output: 15.0
            }
          }
        ]
      }
    }
  },
  agents: {
    model: "anthropic/sonnet",
    workspace: "~/.ironbot/workspace",
    compactionMode: "moderate" as const,
    subagents: {
      maxConcurrent: 4
    }
  }
});

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    constructor() {
      return mockAnthropicClient;
    }
  }
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
const mockToolExecutorClass = vi.mocked(require("../../src/services/tools.ts")).ToolExecutor;
const mockSkillLoaderClass = vi.mocked(require("../../src/services/skill_loader.ts")).SkillLoader;

describe("ClaudeProcessor", () => {
  let processor: ClaudeProcessor;
  let mockMemoryManager: any;
  let testConfig: any;

  const setupConfig = (provider: string = "anthropic", providerConfig?: any) => {
    testConfig = createDefaultMockConfig();
    // Update models configuration to use the provided provider
    testConfig.models.providers = {
      [provider]: {
        api: providerConfig?.api || "anthropic",
        apiKey: providerConfig?.apiKey || "test-token",
        baseUrl: providerConfig?.baseUrl,
        models: [
          {
            id: providerConfig?.model || "default",
            name: providerConfig?.model || "Default Model"
          }
        ]
      }
    };
    // Set the default model
    testConfig.agents.model = `${provider}/${providerConfig?.model || "default"}`;
    return testConfig;
  };

  beforeEach(() => {
    resetTriggerConfigs();
    mockAnthropicClient.messages.create.mockClear();
    for (const skillInfo of Object.values(mockSkillInfos)) {
      skillInfo.handler.mockClear();
    }
    // Set up default mock responses
    mockAnthropicClient.messages.create.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Mock response" }]
    });

    mockMemoryManager = {
      search: vi.fn().mockResolvedValue([]),
      clearAllMemory: vi.fn().mockResolvedValue(undefined),
      clearMemoryForSession: vi.fn().mockResolvedValue(undefined)
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

    mockSkillLoaderInstance.loadSkills.mockReturnValue({});

    mockSkillLoaderInstance.getSkillInfo.mockReturnValue(mockSkillInfos);

    // Set up mock handlers
    mockSkillInfos['skill_installer'].handler.mockResolvedValue("Skill installed successfully");
    mockSkillInfos['permission_check'].handler.mockResolvedValue("🤖 **IronBot System Status**\n\n**🛠️ Available Skills:**\n• permission_check\n\n**🔧 Allowed Tools:** run_powershell\n\n**📋 Allowed Skills:** permission_check\n\n**⚙️ Key Restrictions:**\n• PowerShell: All commands allowed\n• Blocked: \n\n**💡 Pro Tips:**\n• Use natural language to install skills: \"install this skill: <url>\"\n• Ask me \"what skills do you have?\" anytime\n• Skills are automatically loaded on restart\n\nNeed help with something specific? Just ask! 🚀");
    mockSkillInfos['calculator'].handler.mockResolvedValue("42");
    mockSkillInfos['testskill'].handler.mockResolvedValue("Skill executed successfully");

    mockMemoryManager.search.mockResolvedValue([]);

    // Create processor with mocked dependencies
    testConfig = setupConfig();
    processor = new ClaudeProcessor(["./skills"], testConfig, mockMemoryManager);
  });

  describe("checkConnection", () => {
    it("returns true when connection is successful", async () => {
      mockAnthropicClient.messages.create.mockResolvedValueOnce({
        stop_reason: "end_turn",
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
      const result = await processor.processMessage("Please run @testskill");

      expect(mockSkillInfos['testskill'].handler).toHaveBeenCalledWith("Please run @testskill", undefined);
      expect(result).toBe("Skill executed successfully");
    });

    it("handles skill execution errors gracefully", async () => {
      mockSkillInfos['permission_check'].handler.mockRejectedValue(new Error("Skill failed"));

      const result = await processor.processMessage("Run @permission_check");

      expect(result).toBe("Sorry, error executing skill permission_check.");
    });

    it("auto-routes install commands to skill_installer", async () => {
      const result = await processor.processMessage("install this skill: https://github.com/example/skill");

      expect(mockSkillInfos['skill_installer'].handler).toHaveBeenCalledWith("install this skill: https://github.com/example/skill", undefined);
      expect(result).toBe("Skill installed successfully");
    });

    it("auto-routes capability queries to permission_check", async () => {
      const result = await processor.processMessage("what skills do you have?");

      expect(mockSkillInfos['permission_check'].handler).toHaveBeenCalledWith("what skills do you have?", undefined);
      expect(result).toContain("🤖 **IronBot System Status**");
    });

    it("does not fall back to skill_installer when asking about available skills", async () => {
      mockSkillInfos['permission_check'].handler.mockClear();
      mockSkillInfos['skill_installer'].handler.mockClear();

      await processor.processMessage("what skills do you have?");

      expect(mockSkillInfos['permission_check'].handler).toHaveBeenCalledWith("what skills do you have?", undefined);
      expect(mockSkillInfos['skill_installer'].handler).not.toHaveBeenCalled();
    });

    it("auto-routes direct skill execution requests", async () => {
      const result = await processor.processMessage("use calculator");

      expect(mockSkillInfos['calculator'].handler).toHaveBeenCalledWith("use calculator", undefined);
      expect(result).toBe("42");
    });

    it("auto-routes unknown skill usage requests to skill_installer", async () => {
      const result = await processor.processMessage("use skill smtp-send to send an email");

      expect(mockSkillInfos['skill_installer'].handler).toHaveBeenCalledWith("use skill smtp-send to send an email", undefined);
      expect(result).toBe("Skill installed successfully");
    });

    it("does NOT auto-route SKILL.md-based documentation skills, passes to Claude instead", async () => {
      // Add a SKILL.md-based skill to the mock
      mockSkillInfos['smtp-send'] = {
        name: 'smtp-send',
        description: 'Sends emails via SMTP',
        triggers: ['email', 'send email', 'smtp'],
        executable: false,
        parameters: [],
        handler: vi.fn().mockResolvedValue("**Skill: smtp-send**\n\nSKILL.md documentation content..."),
        isDocumentationSkill: true,
        skillDirectory: './skills/smtp-send'
      };

      mockSkillLoaderInstance.getSkillInfo.mockReturnValue(mockSkillInfos);

      // Mock Claude's response to processing with skill documentation
      mockAnthropicClient.messages.create.mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          { type: "text", text: "I'll send that email for you using the smtp-send skill." },
          { 
            type: "tool_use", 
            id: "tool_1",
            name: "run_bash",
            input: { 
              command: "python3 scripts/send_email.py --to jzhu@blizzard.com --subject 'Test' --body 'Test email'",
              working_directory: "./skills/smtp-send"
            }
          }
        ]
      }).mockResolvedValueOnce({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Email sent successfully!" }]
      });

      mockToolExecutorInstance.executeTool.mockResolvedValueOnce({
        success: true,
        result: { stdout: "Email sent to jzhu@blizzard.com", stderr: "", exitCode: 0 }
      });

      const result = await processor.processMessage("run skill smtp-send to send a test email to jzhu@blizzard.com");

      // The handler WILL be called once to get the documentation content for Claude's context
      // But it should not be the final response - Claude should process it and use tools
      expect(mockSkillInfos['smtp-send'].handler).toHaveBeenCalledTimes(1);
      
      // Claude should be called with the skill documentation in context
      expect(mockAnthropicClient.messages.create).toHaveBeenCalled();
      
      // Check the system prompt includes skill documentation
      const firstCall = mockAnthropicClient.messages.create.mock.calls[0][0];
      if (firstCall.system) {
        expect(firstCall.system).toContain("smtp-send");
        expect(firstCall.system).toContain("Available Skills");
      }
      
      // Claude should execute the tool
      expect(mockToolExecutorInstance.executeTool).toHaveBeenCalledWith("run_bash", expect.objectContaining({
        command: expect.stringContaining("python3")
      }));
      
      expect(result).toContain("Email sent successfully!");
    });

    it("does not auto-route regular messages", async () => {
      mockSkillLoaderInstance.loadSkills.mockResolvedValue({});

      mockAnthropicClient.messages.create
        .mockResolvedValueOnce({
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Hello, how can I help you?" }]
        });

      const result = await processor.processMessage("hello world");

      expect(result).toBe("Hello, how can I help you?");
      expect(mockAnthropicClient.messages.create).toHaveBeenCalled();
    });

    it("suppresses low-confidence auto-route candidates", async () => {
      (processor as any).autoRoutingConfig.confidenceThreshold = 0.5;
      mockSkillInfos['calculator'].triggerConfig.confidence = 0.2;
      mockAnthropicClient.messages.create.mockClear();

      const result = await processor.processMessage("use calculator");

      expect(mockSkillInfos['calculator'].handler).not.toHaveBeenCalled();
      expect(mockAnthropicClient.messages.create).toHaveBeenCalled();
      expect(result).toBe("Mock response");
    });

    it("auto-routes explicit @invocations regardless of confidence", async () => {
      (processor as any).autoRoutingConfig.confidenceThreshold = 0.95;
      mockSkillInfos['calculator'].triggerConfig.confidence = 0.2;

      await processor.processMessage("Can you run @calculator for me?");

      expect(mockSkillInfos['calculator'].handler).toHaveBeenCalled();
    });

    it("respects auto-routing opt-outs", async () => {
      (processor as any).autoRouteOptOutSet.add("calculator");
      mockAnthropicClient.messages.create.mockClear();

      const result = await processor.processMessage("use calculator");

      expect(mockSkillInfos['calculator'].handler).not.toHaveBeenCalled();
      expect(mockAnthropicClient.messages.create).toHaveBeenCalled();
      expect(result).toBe("Mock response");
    });

    it.skip("returns dev mode response when in dev mode", async () => {
      // Create processor in dev mode
      const devConfig = setupConfig();
      devConfig.devMode = true;

      const devProcessor = new ClaudeProcessor(["./skills"], devConfig, mockMemoryManager);
      const result = await devProcessor.processMessage("Test message");

      expect(result).toBe("[DEV MODE] I would respond to: Test message");
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
        sessionKey: "test-session",
        crossSessionMemory: true
      });

      expect(mockMemoryManager.search).toHaveBeenCalledWith("What were we talking about?", {
        sessionKey: "test-session",
        crossSessionMemory: true
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
      mockToolExecutorInstance.executeTool.mockResolvedValue({
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

      expect(mockToolExecutorInstance.executeTool).toHaveBeenCalledWith("run_bash", { command: "ls" });
      expect(result).toBe("Here are the files: file1.txt, file2.txt");
    });

    it("summarizes tool executions when Claude never returns final text", async () => {
      mockMemoryManager.search.mockResolvedValue([]);
      mockToolExecutorInstance.executeTool.mockResolvedValue({
        success: true,
        result: "file1.txt\nfile2.txt"
      });

      mockAnthropicClient.messages.create
        .mockResolvedValueOnce({
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "tool_123",
              name: "run_bash",
              input: { command: "ls" }
            }
          ]
        })
        .mockResolvedValueOnce({
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Final summary" }]
        });

      processor["maxToolIterations"] = 1;
      const result = await processor.processMessage("List files silently");

      expect(mockToolExecutorInstance.executeTool).toHaveBeenCalledWith("run_bash", { command: "ls" });
      expect(result).toBe("Final summary");
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

      mockToolExecutorInstance.executeTool.mockResolvedValue({
        success: false,
        error: "Command not found"
      });

      mockAnthropicClient.messages.create
        .mockResolvedValueOnce({
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Sorry, that command failed." }]
        });

      const result = await processor.processMessage("Run invalid command");

      expect(mockToolExecutorInstance.executeTool).toHaveBeenCalledWith("run_bash", { command: "invalid_command" });
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

      let callCount = 0;
      mockAnthropicClient.messages.create.mockImplementation(() => {
        callCount++;
        if (callCount <= 6) {
          return Promise.resolve({
            stop_reason: "tool_use",
            content: [
              {
                type: "tool_use",
                id: `tool_${callCount}`,
                name: "run_bash",
                input: { command: "echo test" }
              }
            ]
          });
        } else {
          return Promise.resolve({
            stop_reason: "end_turn",
            content: [{ type: "text", text: "Done" }]
          });
        }
      });

      mockToolExecutorInstance.executeTool.mockResolvedValue({
        success: true,
        result: "test output"
      });

      const result = await processor.processMessage("Loop test");

      expect(callCount).toBe(7); // maxToolIterations + retry
      expect(result).toBe("Done");
    });
  });

  describe("clearAllMemory", () => {
    it("calls clearAllMemory on memory manager when available", async () => {
      const testMemoryManager = {
        search: vi.fn(),
        clearAllMemory: vi.fn().mockResolvedValue(undefined),
        clearMemoryForSession: vi.fn()
      };

      const testConfig = setupConfig();
      const processor = new ClaudeProcessor(["./skills"], testConfig, testMemoryManager);

      await processor.clearAllMemory();

      expect(testMemoryManager.clearAllMemory).toHaveBeenCalledTimes(1);
    });

    it("does nothing when memory manager is not available", async () => {
      const testConfig = setupConfig();
      const processor = new ClaudeProcessor(["./skills"], testConfig);

      // Should not throw an error
      await expect(processor.clearAllMemory()).resolves.toBeUndefined();
    });
  });
});
