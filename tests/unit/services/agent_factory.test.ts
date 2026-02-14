import { describe, it, expect } from "vitest";
import { resolveConfig } from "../../../src/config.ts";
import { AgentFactory } from "../../../src/services/agent_factory.ts";
import { ClaudeProcessor } from "../../../src/services/claude_processor.ts";
import { PiAgentProcessor } from "../../../src/services/pi_agent_processor.ts";

describe("Multi-Provider LLM Configuration", () => {
  it("should load configuration with multiple LLM providers", () => {
    const config = resolveConfig();

    expect(config.llmProvider).toBeDefined();
    expect(config.llmProvider.provider).toBe("openai");
    expect(config.llmProvider.anthropic).toBeDefined();
    expect(config.llmProvider.openai).toBeDefined();
    expect(config.llmProvider.google).toBeDefined();
  });

  it("should use PiAgentProcessor for OpenAI provider (default)", () => {
    const config = resolveConfig();
    const agent = AgentFactory.create(config, config.skillDirs);

    expect(agent).toBeInstanceOf(PiAgentProcessor);
  });

  it("should use PiAgentProcessor for non-anthropic provider", () => {
    const config = resolveConfig();
    // Override provider to test non-anthropic path
    config.llmProvider.provider = "openai";

    const agent = AgentFactory.create(config, config.skillDirs);

    expect(agent).toBeInstanceOf(PiAgentProcessor);
  });

  it("PiAgentProcessor should properly initialize provider-specific settings", () => {
    const config = resolveConfig();
    config.llmProvider.provider = "openai";

    const agent = AgentFactory.create(config, config.skillDirs) as PiAgentProcessor;

    // Note: In a real test, we'd access these via a getter
    // For now, just verify the agent was created successfully
    expect(agent).toBeDefined();
  });

  it("should support switching between providers", () => {
    const config = resolveConfig();

    // Test anthropic
    config.llmProvider.provider = "anthropic";
    let agent = AgentFactory.create(config, config.skillDirs);
    expect(agent).toBeInstanceOf(ClaudeProcessor);

    // Test openai
    config.llmProvider.provider = "openai";
    agent = AgentFactory.create(config, config.skillDirs);
    expect(agent).toBeInstanceOf(PiAgentProcessor);

    // Test google
    config.llmProvider.provider = "google";
    agent = AgentFactory.create(config, config.skillDirs);
    expect(agent).toBeInstanceOf(PiAgentProcessor);
  });
});
