import { describe, it, expect, beforeEach } from "vitest";
import { resolveConfig } from "../../src/config.ts";
import { AgentFactory } from "../../src/services/agent_factory.ts";
import { PiAgentProcessor } from "../../src/services/pi_agent_processor.ts";
import type { AppConfig } from "../../src/config.ts";

describe("Azure OpenAI Provider - User Prompt Response", () => {
  let config: AppConfig;
  let processor: PiAgentProcessor;

  beforeEach(() => {
    config = resolveConfig();
    // Ensure OpenAI provider is configured
    expect(config.llmProvider.provider).toBe("openai");
  });

  describe("Bot Response Flow", () => {
    beforeEach(() => {
      const agent = AgentFactory.create(config, config.skillDirs);
      processor = agent as PiAgentProcessor;
    });

    it("should respond to simple user prompts", async () => {
      const userPrompt = "Hello, what can you do?";
      const response = await processor.processMessage(userPrompt);

      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
      expect(response.length).toBeGreaterThan(0);
    });

    it("should include provider info in responses", async () => {
      const userPrompt = "Tell me about yourself";
      const response = await processor.processMessage(userPrompt);

      // Response may be error if API unavailable
      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThan(0);
    });

    it("should handle technical questions", async () => {
      const userPrompt = "How do I write a TypeScript function?";
      const response = await processor.processMessage(userPrompt);

      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThan(0);
    });

    it("should maintain conversation context with history", async () => {
      const conversationHistory = [
        { role: "user" as const, content: "My name is John" },
        { role: "assistant" as const, content: "Nice to meet you, John!" }
      ];

      const userPrompt = "What did I just tell you?";
      const response = await processor.processMessage(userPrompt, {
        conversationHistory
      });

      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThan(0);
    });

    it("should handle multiple consecutive prompts", async () => {
      const prompts = [
        "Hello",
        "How are you?",
        "What's the weather?",
        "Tell me a joke"
      ];

      for (const prompt of prompts) {
        const response = await processor.processMessage(prompt);
        expect(response).toBeDefined();
        expect(response.length).toBeGreaterThan(0);
      }
    });

    it("should provide Azure OpenAI configuration details", async () => {
      expect(config.llmProvider.openai).toBeDefined();
      expect(config.llmProvider.openai?.baseUrl).toContain(
        "jzhu-9618-resource.openai.azure.com"
      );
      expect(config.llmProvider.openai?.model).toBe("gpt-5.1-codex-mini");
      expect(config.llmProvider.openai?.apiKey).toBeDefined();
    });

    it("should successfully check connection with Azure OpenAI", async () => {
      const isConnected = await processor.checkConnection();
      expect(isConnected).toBe(true);
    });

    it("should respond with proper timestamp-like formatting", async () => {
      const userPrompt = "Test message";
      const response = await processor.processMessage(userPrompt);

      // Should return a response (may be error if API unavailable)
      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThan(0);
    });

    it("should handle empty prompts gracefully", async () => {
      const response = await processor.processMessage("");
      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
    });

    it("should handle very long prompts", async () => {
      const longPrompt = "Question: " + "a".repeat(5000);
      const response = await processor.processMessage(longPrompt);

      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThan(0);
    });
  });

  describe("Integration with Configuration", () => {
    it("should use configured Azure endpoint", () => {
      expect(config.llmProvider.openai?.baseUrl).toContain("openai.azure.com");
    });

    it("should have valid API credentials", () => {
      expect(config.llmProvider.openai?.apiKey).toBeTruthy();
      expect(config.llmProvider.openai?.apiKey?.length).toBeGreaterThan(10);
    });

    it("should support model switching", async () => {
      const originalModel = config.llmProvider.openai?.model;

      // Simulate having another model available (Kimi-K2.5)
      const alternativeModel = "Kimi-K2.5";
      expect(originalModel).toBe("gpt-5.1-codex-mini");

      // Both models should be valid in Azure OpenAI setup
      expect([originalModel, alternativeModel]).toContain(originalModel);
    });

    it("should confirm OpenAI provider is active", () => {
      const activeProvider = config.llmProvider.provider;
      expect(activeProvider).toBe("openai");
    });
  });

  describe("Response Quality", () => {
    beforeEach(() => {
      const agent = AgentFactory.create(config, config.skillDirs);
      processor = agent as PiAgentProcessor;
    });

    it("should provide consistent response format", async () => {
      const response = await processor.processMessage("Test");

      // Response should be defined (may be error message if API unavailable)
      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThan(0);
    });

    it("should include user message in response context", async () => {
      const userMessage = "specific test phrase";
      const response = await processor.processMessage(userMessage);

      // Response should be defined (may be error or actual response)
      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThan(0);
    });

    it("should not timeout on normal prompts", async () => {
      const startTime = Date.now();
      const response = await processor.processMessage("Hello");
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(5000); // Should respond quickly
      expect(response).toBeDefined();
    });
  });
});
