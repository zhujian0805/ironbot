import { describe, it, expect } from "vitest";
import { resolveConfig, type AppConfig } from "../../../src/config.ts";
import { AgentFactory } from "../../../src/services/agent_factory.ts";
import { ClaudeProcessor } from "../../../src/services/claude_processor.ts";
import { PiAgentProcessor } from "../../../src/services/pi_agent_processor.ts";

describe("Multi-Provider LLM Configuration", () => {
  const createTestConfig = (provider: string, providerSpec: Record<string, any>): AppConfig => {
    const baseConfig = resolveConfig();
    // Extract provider config from the spec
    const config = providerSpec[provider] || providerSpec;

    return {
      ...baseConfig,
      models: {
        providers: {
          [provider]: {
            api: config.api || "openai",
            apiKey: config.apiKey,
            baseUrl: config.baseUrl,
            models: [
              {
                id: config.model || "default",
                name: config.model || "Default Model"
              }
            ]
          }
        }
      },
      agents: {
        model: `${provider}/${config.model || "default"}`,
        workspace: "~/.ironbot/workspace",
        compactionMode: "moderate" as const,
        subagents: {
          maxConcurrent: 4
        }
      }
    };
  };

  it("should load configuration with multiple LLM providers", () => {
    const config = resolveConfig();

    expect(config.models).toBeDefined();
    expect(config.models.providers).toBeDefined();
  });

  it("should use PiAgentProcessor for OpenAI provider", () => {
    const config = createTestConfig("openai", {
      openai: {
        api: "openai",
        apiKey: "test-key",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o"
      }
    });

    const agent = AgentFactory.create(config, config.skillDirs);
    expect(agent).toBeInstanceOf(PiAgentProcessor);
  });

  it("should use PiAgentProcessor for alibaba provider with OpenAI API", () => {
    const config = createTestConfig("alibaba", {
      alibaba: {
        api: "openai",
        apiKey: "test-key",
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        model: "qwen3-max"
      }
    });

    const agent = AgentFactory.create(config, config.skillDirs);
    expect(agent).toBeInstanceOf(PiAgentProcessor);
  });

  it("should use ClaudeProcessor for anthropic provider", () => {
    const config = createTestConfig("anthropic", {
      anthropic: {
        api: "anthropic",
        apiKey: "test-key",
        baseUrl: "https://api.anthropic.com",
        model: "claude-3-5-sonnet-20241022"
      }
    });

    const agent = AgentFactory.create(config, config.skillDirs);
    expect(agent).toBeInstanceOf(ClaudeProcessor);
  });

  it("should use ClaudeProcessor for custom anthropic-compatible provider", () => {
    const config = createTestConfig("copilot-api", {
      "copilot-api": {
        api: "anthropic",
        apiKey: "test-key",
        baseUrl: "https://custom-anthropic-endpoint:5000",
        model: "grok-code-fast-1"
      }
    });

    const agent = AgentFactory.create(config, config.skillDirs);
    expect(agent).toBeInstanceOf(ClaudeProcessor);
  });

  it("should route based on api field, not provider name", () => {
    // Test that OpenAI-compatible API uses PiAgentProcessor regardless of provider name
    const config = createTestConfig("my-custom-openai", {
      "my-custom-openai": {
        api: "openai",
        apiKey: "test-key",
        baseUrl: "https://custom-openai-endpoint",
        model: "custom-model"
      }
    });

    const agent = AgentFactory.create(config, config.skillDirs);
    expect(agent).toBeInstanceOf(PiAgentProcessor);
  });

  it("should throw error when provider is not configured", () => {
    const config = createTestConfig("missing-provider", {});

    expect(() => AgentFactory.create(config, config.skillDirs)).toThrow();
  });

  it("should support switching between different providers with same API type", () => {
    // Both use OpenAI API but with different names
    const config1 = createTestConfig("openai", {
      openai: {
        api: "openai",
        apiKey: "test-key",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o"
      }
    });

    const config2 = createTestConfig("alibaba", {
      alibaba: {
        api: "openai",
        apiKey: "test-key",
        baseUrl: "https://dashscope.aliyuncs.com",
        model: "qwen3-max"
      }
    });

    const agent1 = AgentFactory.create(config1, config1.skillDirs);
    const agent2 = AgentFactory.create(config2, config2.skillDirs);

    expect(agent1).toBeInstanceOf(PiAgentProcessor);
    expect(agent2).toBeInstanceOf(PiAgentProcessor);
  });

  it("should support switching between different providers with different API types", () => {
    const configAI = createTestConfig("openai", {
      openai: {
        api: "openai",
        apiKey: "test-key",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o"
      }
    });

    const configAnthropic = createTestConfig("anthropic", {
      anthropic: {
        api: "anthropic",
        apiKey: "test-key",
        baseUrl: "https://api.anthropic.com",
        model: "claude-3-5-sonnet-20241022"
      }
    });

    const agent1 = AgentFactory.create(configAI, configAI.skillDirs);
    const agent2 = AgentFactory.create(configAnthropic, configAnthropic.skillDirs);

    expect(agent1).toBeInstanceOf(PiAgentProcessor);
    expect(agent2).toBeInstanceOf(ClaudeProcessor);
  });
});
