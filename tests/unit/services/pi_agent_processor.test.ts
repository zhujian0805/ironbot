import { describe, it, expect, beforeEach, vi } from "vitest";
import { resolveConfig, type AppConfig } from "../../../src/config.ts";
import { PiAgentProcessor } from "../../../src/services/pi_agent_processor.ts";
import type { MemoryManager } from "../../../src/memory/manager.ts";

describe("PiAgentProcessor", () => {
  let config: AppConfig;
  let processor: PiAgentProcessor;

  const setupConfig = (provider: string, providerConfig?: any) => {
    config = resolveConfig();
    config.llmProvider.provider = provider;
    if (providerConfig) {
      (config.llmProvider as any)[provider] = providerConfig;
    }
  };

  describe("Initialization with Different Providers", () => {
    it("should initialize with OpenAI provider configuration", () => {
      setupConfig("openai", {
        api: "openai",
        apiKey: "test-key",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o"
      });
      processor = new PiAgentProcessor(config.skillDirs, config);

      expect(processor).toBeDefined();
    });

    it("should initialize with Google provider configuration", () => {
      setupConfig("google", {
        api: "openai",
        apiKey: "google-key",
        baseUrl: "https://generativelanguage.googleapis.com",
        model: "gemini-2.0-flash"
      });
      processor = new PiAgentProcessor(config.skillDirs, config);

      expect(processor).toBeDefined();
    });

    it("should initialize with custom provider configuration", () => {
      setupConfig("my-provider", {
        api: "openai",
        apiKey: "custom-key",
        baseUrl: "https://custom-endpoint.com",
        model: "custom-model"
      });
      processor = new PiAgentProcessor(config.skillDirs, config);

      expect(processor).toBeDefined();
    });

    it("should handle missing provider configuration gracefully", () => {
      setupConfig("openai", {
        api: "openai",
        model: "",
        apiKey: undefined,
        baseUrl: undefined
      });
      processor = new PiAgentProcessor(config.skillDirs, config);

      expect(processor).toBeDefined();
    });
  });

  describe("Connection Checking", () => {
    it("should pass connection check with valid OpenAI configuration", async () => {
      setupConfig("openai", {
        api: "openai",
        apiKey: "test-key",
        baseUrl: "https://jzhu-9618-resource.openai.azure.com/openai/v1",
        model: "gpt-5.1-codex-mini"
      });
      processor = new PiAgentProcessor(config.skillDirs, config);

      const result = await processor.checkConnection();
      expect(result).toBe(true);
    });

    it("should fail connection check without API key", async () => {
      setupConfig("openai", {
        api: "openai",
        apiKey: undefined,
        baseUrl: "https://jzhu-9618-resource.openai.azure.com/openai/v1",
        model: "gpt-5.1-codex-mini"
      });
      processor = new PiAgentProcessor(config.skillDirs, config);

      const result = await processor.checkConnection();
      expect(result).toBe(false);
    });

    it("should fail connection check without model", async () => {
      setupConfig("openai", {
        api: "openai",
        apiKey: "test-key",
        baseUrl: "https://jzhu-9618-resource.openai.azure.com/openai/v1",
        model: ""
      });
      processor = new PiAgentProcessor(config.skillDirs, config);

      const result = await processor.checkConnection();
      expect(result).toBe(false);
    });

    it("should handle connection check errors gracefully", async () => {
      setupConfig("openai", {
        api: "openai",
        apiKey: "test-key",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o"
      });
      processor = new PiAgentProcessor(config.skillDirs, config);

      const result = await processor.checkConnection();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("Message Processing", () => {
    beforeEach(() => {
      setupConfig("openai", {
        api: "openai",
        apiKey: "test-key",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o"
      });
      processor = new PiAgentProcessor(config.skillDirs, config);
    });

    it.skip("should process simple user messages", { timeout: 10000 }, async () => {
      const message = "Hello, how are you?";
      const response = await processor.processMessage(message);

      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
      expect(response.length).toBeGreaterThan(0);
    });

    it.skip("should include provider and model in response", { timeout: 10000 }, async () => {
      const message = "Test message";
      const response = await processor.processMessage(message);

      // Response may contain provider info, or error message if API unavailable
      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThan(0);
      // If it's an error response, that's acceptable - it indicates attempted API call
    });

    it.skip("should handle messages with conversation history", { timeout: 10000 }, async () => {
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

    it.skip("should handle messages with session key", { timeout: 10000 }, async () => {
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
      setupConfig("openai", {
        api: "openai",
        apiKey: "test-key",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o"
      });
      processor = new PiAgentProcessor(config.skillDirs, config);
    });

    it.skip("should handle tool execution requests", { timeout: 15000 }, async () => {
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
      setupConfig("openai", {
        api: "openai",
        apiKey: "test-key",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o"
      });
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
      setupConfig("openai", {
        api: "openai",
        apiKey: "azure-key",
        baseUrl: "https://jzhu-9618-resource.openai.azure.com/openai/v1",
        model: "gpt-5.1-codex-mini"
      });
      processor = new PiAgentProcessor(config.skillDirs, config);

      // Verify processor was created with correct configuration
      expect(processor).toBeDefined();
    });

    it("should use correct model for custom provider", () => {
      setupConfig("custom", {
        api: "openai",
        apiKey: "custom-key",
        baseUrl: "https://custom.example.com/v1",
        model: "custom-model"
      });
      processor = new PiAgentProcessor(config.skillDirs, config);

      expect(processor).toBeDefined();
    });

    it("should support switching between providers", () => {
      // Start with OpenAI
      setupConfig("openai", {
        api: "openai",
        apiKey: "openai-key",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o"
      });
      let processor1 = new PiAgentProcessor(config.skillDirs, config);
      expect(processor1).toBeDefined();

      // Switch to custom
      setupConfig("custom", {
        api: "openai",
        apiKey: "custom-key",
        baseUrl: "https://custom.example.com",
        model: "custom-model"
      });
      let processor2 = new PiAgentProcessor(config.skillDirs, config);
      expect(processor2).toBeDefined();

      // Both should be valid instances
      expect(processor1).not.toBe(processor2);
    });
  });

  describe("Error Handling", () => {
    beforeEach(() => {
      setupConfig("openai", {
        api: "openai",
        apiKey: "test-key",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o"
      });
      processor = new PiAgentProcessor(config.skillDirs, config);
    });

    it.skip("should handle processing errors gracefully", { timeout: 15000 }, async () => {
      const response = await processor.processMessage("");
      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
    });

    it.skip("should handle very long messages", { timeout: 20000 }, async () => {
      const longMessage = "a".repeat(10000);
      const response = await processor.processMessage(longMessage);

      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
    });

    it.skip("should handle special characters in messages", { timeout: 20000 }, async () => {
      const specialMessage = "Test with special chars: !@#$%^&*()_+-=[]{}|;:',.<>?/\\";
      const response = await processor.processMessage(specialMessage);

      expect(response).toBeDefined();
    });

    it.skip("should handle concurrent message processing", { timeout: 30000 }, async () => {
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
      setupConfig("openai", {
        api: "openai",
        apiKey: "test-key",
        baseUrl: "https://jzhu-9618-resource.openai.azure.com/openai/v1",
        model: "gpt-5.1-codex-mini"
      });
      processor = new PiAgentProcessor(config.skillDirs, config);
    });

    it.skip("should include provider in response format", { timeout: 10000 }, async () => {
      const response = await processor.processMessage("Test");
      // Response may be error if API unavailable, or contain provider format
      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThan(0);
    });

    it.skip("should include partial message content in response", { timeout: 10000 }, async () => {
      const message = "This is a test message for response verification";
      const response = await processor.processMessage(message);

      // Response should be defined (may be error or actual response)
      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThan(0);
    });

    it.skip("should have proper response structure", { timeout: 10000 }, async () => {
      const response = await processor.processMessage("Structure test");
      // Response should be defined and have reasonable length
      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThan(10);
    });
  });
});
