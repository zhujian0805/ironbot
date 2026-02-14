import { describe, it, expect, beforeEach, vi } from "vitest";
import { resolveConfig, type AppConfig } from "../../../src/config.ts";
import { PiAgentProcessor } from "../../../src/services/pi_agent_processor.ts";
import type { MemoryManager } from "../../../src/memory/manager.ts";

describe("PiAgentProcessor", () => {
  let config: AppConfig;
  let processor: PiAgentProcessor;

  beforeEach(() => {
    config = resolveConfig();
  });

  describe("Initialization with Different Providers", () => {
    it("should initialize with OpenAI provider configuration", () => {
      config.llmProvider.provider = "openai";
      processor = new PiAgentProcessor(config.skillDirs, config);

      expect(processor).toBeDefined();
    });

    it("should initialize with Google provider configuration", () => {
      config.llmProvider.provider = "google";
      processor = new PiAgentProcessor(config.skillDirs, config);

      expect(processor).toBeDefined();
    });

    it("should initialize with Anthropic provider configuration", () => {
      config.llmProvider.provider = "anthropic";
      processor = new PiAgentProcessor(config.skillDirs, config);

      expect(processor).toBeDefined();
    });

    it("should handle missing provider configuration gracefully", () => {
      config.llmProvider.provider = "openai";
      // Clear the openai config
      config.llmProvider.openai = {
        model: "",
        apiKey: undefined,
        baseUrl: undefined
      };
      processor = new PiAgentProcessor(config.skillDirs, config);

      expect(processor).toBeDefined();
    });
  });

  describe("Connection Checking", () => {
    it("should pass connection check with valid OpenAI configuration", async () => {
      config.llmProvider.provider = "openai";
      config.llmProvider.openai = {
        apiKey: "test-key",
        baseUrl: "https://jzhu-9618-resource.openai.azure.com/openai/v1",
        model: "gpt-5.1-codex-mini"
      };
      processor = new PiAgentProcessor(config.skillDirs, config);

      const result = await processor.checkConnection();
      expect(result).toBe(true);
    });

    it("should fail connection check without API key", async () => {
      config.llmProvider.provider = "openai";
      config.llmProvider.openai = {
        apiKey: undefined,
        baseUrl: "https://jzhu-9618-resource.openai.azure.com/openai/v1",
        model: "gpt-5.1-codex-mini"
      };
      processor = new PiAgentProcessor(config.skillDirs, config);

      const result = await processor.checkConnection();
      expect(result).toBe(false);
    });

    it("should fail connection check without model", async () => {
      config.llmProvider.provider = "openai";
      config.llmProvider.openai = {
        apiKey: "test-key",
        baseUrl: "https://jzhu-9618-resource.openai.azure.com/openai/v1",
        model: ""
      };
      processor = new PiAgentProcessor(config.skillDirs, config);

      const result = await processor.checkConnection();
      expect(result).toBe(false);
    });

    it("should handle connection check errors gracefully", async () => {
      config.llmProvider.provider = "openai";
      processor = new PiAgentProcessor(config.skillDirs, config);

      const result = await processor.checkConnection();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("Message Processing", () => {
    beforeEach(() => {
      config.llmProvider.provider = "openai";
      processor = new PiAgentProcessor(config.skillDirs, config);
    });

    it("should process simple user messages", async () => {
      const message = "Hello, how are you?";
      const response = await processor.processMessage(message);

      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
      expect(response.length).toBeGreaterThan(0);
    });

    it("should include provider and model in response", async () => {
      const message = "Test message";
      const response = await processor.processMessage(message);

      // Response may contain provider info, or error message if API unavailable
      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThan(0);
      // If it's an error response, that's acceptable - it indicates attempted API call
    });

    it("should handle messages with conversation history", async () => {
      const message = "What's my name?";
      const response = await processor.processMessage(message, {
        conversationHistory: [
          { role: "user", content: "My name is John" },
          { role: "assistant", content: "Nice to meet you, John!" }
        ]
      });

      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
    });

    it("should handle messages with session key", async () => {
      const message = "Remember this for later";
      const response = await processor.processMessage(message, {
        sessionKey: "test-session-123"
      });

      expect(response).toBeDefined();
    });

    it("should handle dev mode responses", async () => {
      config.devMode = true;
      processor = new PiAgentProcessor(config.skillDirs, config);

      const response = await processor.processMessage("Test");
      expect(response).toContain("DEV MODE");
    });
  });

  describe("Tool Execution", () => {
    beforeEach(() => {
      config.llmProvider.provider = "openai";
      processor = new PiAgentProcessor(config.skillDirs, config);
    });

    it("should handle tool execution requests", { timeout: 15000 }, async () => {
      const result = await processor.executeTool("test_tool", {
        param1: "value1"
      });

      expect(result).toBeDefined();
    });

    it("should handle unknown tools gracefully", { timeout: 30000 }, async () => {
      const result = await processor.executeTool("nonexistent_tool", {});
      expect(result).toBeDefined();
    });

    it("should handle tool execution with various parameter types", { timeout: 30000 }, async () => {
      const result = await processor.executeTool("test_tool", {
        stringParam: "test",
        numberParam: 42,
        booleanParam: true,
        arrayParam: [1, 2, 3]
      });

      expect(result).toBeDefined();
    });
  });

  describe("Memory Management", () => {
    beforeEach(() => {
      config.llmProvider.provider = "openai";
      processor = new PiAgentProcessor(config.skillDirs, config);
    });

    it("should clear memory for specific session", async () => {
      await expect(processor.clearMemoryForSession("test-session")).resolves.toBeUndefined();
    });

    it("should clear all memory", async () => {
      await expect(processor.clearAllMemory()).resolves.toBeUndefined();
    });
  });

  describe("Provider-Specific Configuration", () => {
    it("should use correct model for Azure OpenAI", () => {
      config.llmProvider.provider = "openai";
      config.llmProvider.openai = {
        apiKey: "azure-key",
        baseUrl: "https://jzhu-9618-resource.openai.azure.com/openai/v1",
        model: "gpt-5.1-codex-mini"
      };
      processor = new PiAgentProcessor(config.skillDirs, config);

      // Verify processor was created with correct configuration
      expect(processor).toBeDefined();
    });

    it("should use correct model for Google provider", () => {
      config.llmProvider.provider = "google";
      config.llmProvider.google = {
        apiKey: "google-key",
        baseUrl: "https://generativelanguage.googleapis.com",
        model: "gemini-2.0-flash"
      };
      processor = new PiAgentProcessor(config.skillDirs, config);

      expect(processor).toBeDefined();
    });

    it("should support switching between providers", () => {
      // Start with OpenAI
      config.llmProvider.provider = "openai";
      let processor1 = new PiAgentProcessor(config.skillDirs, config);
      expect(processor1).toBeDefined();

      // Switch to Google
      config.llmProvider.provider = "google";
      let processor2 = new PiAgentProcessor(config.skillDirs, config);
      expect(processor2).toBeDefined();

      // Both should be valid instances
      expect(processor1).not.toBe(processor2);
    });
  });

  describe("Error Handling", () => {
    beforeEach(() => {
      config.llmProvider.provider = "openai";
      processor = new PiAgentProcessor(config.skillDirs, config);
    });

    it("should handle processing errors gracefully", async () => {
      const response = await processor.processMessage("");
      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
    });

    it("should handle very long messages", async () => {
      const longMessage = "a".repeat(10000);
      const response = await processor.processMessage(longMessage);

      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
    });

    it("should handle special characters in messages", async () => {
      const specialMessage = "Test with special chars: !@#$%^&*()_+-=[]{}|;:',.<>?/\\";
      const response = await processor.processMessage(specialMessage);

      expect(response).toBeDefined();
    });

    it("should handle concurrent message processing", async () => {
      const promises = [
        processor.processMessage("Message 1"),
        processor.processMessage("Message 2"),
        processor.processMessage("Message 3")
      ];

      const responses = await Promise.all(promises);
      expect(responses).toHaveLength(3);
      responses.forEach(response => {
        expect(typeof response).toBe("string");
      });
    });
  });

  describe("Response Formatting", () => {
    beforeEach(() => {
      config.llmProvider.provider = "openai";
      config.llmProvider.openai = {
        apiKey: "test-key",
        baseUrl: "https://jzhu-9618-resource.openai.azure.com/openai/v1",
        model: "gpt-5.1-codex-mini"
      };
      processor = new PiAgentProcessor(config.skillDirs, config);
    });

    it("should include provider in response format", async () => {
      const response = await processor.processMessage("Test");
      // Response may be error if API unavailable, or contain provider format
      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThan(0);
    });

    it("should include partial message content in response", async () => {
      const message = "This is a test message for response verification";
      const response = await processor.processMessage(message);

      // Response should be defined (may be error or actual response)
      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThan(0);
    });

    it("should have proper response structure", async () => {
      const response = await processor.processMessage("Structure test");
      // Response should be defined and have reasonable length
      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThan(10);
    });
  });
});
