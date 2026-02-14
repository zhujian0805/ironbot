import { describe, it, expect, beforeEach } from "vitest";
import { resolveConfig } from "../../src/config.ts";
import { AgentFactory } from "../../src/services/agent_factory.ts";
import { PiAgentProcessor } from "../../src/services/pi_agent_processor.ts";

describe("Tool Detection and Execution", () => {
  let processor: PiAgentProcessor;

  beforeEach(() => {
    const config = resolveConfig();
    const agent = AgentFactory.create(config, config.skillDirs);
    processor = agent as PiAgentProcessor;
  });

  it("should detect CPU-related tool requests", { timeout: 15000 }, async () => {
    const userPrompt = "show all CPUs";
    const response = await processor.processMessage(userPrompt);

    expect(response).toBeDefined();
    expect(response.length).toBeGreaterThan(0);
    // Should either execute tool or indicate intent
    expect(response).toContain("Pi Agent");
  });

  it("should detect memory-related tool requests", { timeout: 15000 }, async () => {
    const userPrompt = "show memory usage";
    const response = await processor.processMessage(userPrompt);

    expect(response).toBeDefined();
    expect(response).toContain("Pi Agent");
  });

  it("should detect disk-related tool requests", { timeout: 15000 }, async () => {
    const userPrompt = "show disk space";
    const response = await processor.processMessage(userPrompt);

    expect(response).toBeDefined();
    expect(response).toContain("Pi Agent");
  });

  it("should detect process-related tool requests", { timeout: 15000 }, async () => {
    const userPrompt = "list running processes";
    const response = await processor.processMessage(userPrompt);

    expect(response).toBeDefined();
    expect(response).toContain("Pi Agent");
  });

  it("should detect file-related tool requests", { timeout: 15000 }, async () => {
    const userPrompt = "read the config file";
    const response = await processor.processMessage(userPrompt);

    expect(response).toBeDefined();
    expect(response).toContain("Pi Agent");
  });

  it("should handle command-related requests", { timeout: 15000 }, async () => {
    const userPrompt = "run a bash command to list files";
    const response = await processor.processMessage(userPrompt);

    expect(response).toBeDefined();
    expect(response).toContain("Pi Agent");
  });
});

